/* The live monitor's voice chain (TF2Audio.createLiveChain), fed 20 ms
 * blocks of microphone audio by live-worklet.js over a MessagePort and
 * answering with processed blocks for it to play. Settings changes rebuild
 * the chain; stats go to the page ten times a second.
 *
 * The room (W3-17d) is a room path (room-dsp.js createRoomPath) kept here,
 * outside the chain, made with the first chain (settled in the room and the
 * water the monitor starts with, as the game would be) and kept for the
 * session, so a rebuilt chain keeps the room's lines and the slot's count of
 * blocks; it sees every talk spurt's start, attached or not. A change of
 * room or of the water does not rebuild the chain, from no room too, so
 * Steam's sender and the gain run on: setRoom takes the new room with the
 * engine's 200 ms cross-fade, setWater switches the water at the next block
 * with no fade (as the engine does), and the chain's mix stage starts running
 * the path at its next 512-sample block (createLiveRoomMix). Once the room
 * has faded to none and the water is off, the path is let go at the next
 * block: with neither, the chain holds nothing back. A number the table does
 * not hold leaves the room as it was (Decision 11).
 *
 * Recording keeps the microphone blocks (dry) and the chain's output (wet)
 * and lines them up: each chain's output is its own input contentDelay
 * samples later (a rebuilt chain starts its count afresh). On stop the pair
 * goes to the page with a frame log for the codec lane. */
'use strict';

importScripts('constants.js', 'steam-sender.js', 'voice-channel.js', 'vendor/swresample/swresample.js', 'room-presets.js',
  'room-dsp.js', 'engine/dsp.js', 'engine/gain.js', 'engine/mix.js', 'engine/network.js', 'engine/codec.js',
  'engine/room.js', 'engine/steam.js', 'engine/render.js', 'engine/render-stream.js', 'engine/live-chain.js',
  'audio.js');

let chain = null, port = null, rate = 48000, queue = Promise.resolve(), generation = 0;
let talking = true, inputTotal = 0, recording = null;
// The room: { path, attached } (and the probe's hooks), which the chains'
// mix stages read; whether a room or the water is asked for; the key of the
// settings the chain was built with, less the room's own.
let room = null, chainKey = null, probe = null;

function report(error) {
  self.postMessage({ type: 'error', message: error && error.message ? error.message : String(error) });
}

// Everything runs in order: a settings change waits for the block in hand.
function enqueue(task) {
  queue = queue.then(task).catch(report);
}

const settingsKey = (opts) => JSON.stringify({ ...opts, room: undefined, underwater: undefined, roomProbe: undefined });

// The room the settings ask for, set on the path: setRoom (taken at the
// slot's next block once a fade has ended, with the 200 ms cross-fade; an
// equal room is no change) and setWater (from the next block, no fade). A
// number the table does not hold is given to the slot too, which keeps what
// it holds and drops a request not yet taken, as the engine's comparison of
// its variable does (room-dsp.js; Decision 11).
function setRoomOf(asked) {
  const p = asked.unheld === null ? asked.preset : asked.unheld;
  room.path.setRoom(p);
  room.path.setWater(asked.water);
  if (probe) probe.log.push({ call: 'set', preset: p, water: asked.water });
}

// The path, made with the first chain: in the room and the water asked for,
// settled (a number the table does not hold: no room, the water as asked).
function makeRoom(opts, asked) {
  const seed = Number.isFinite(opts.seed) ? opts.seed >>> 0 : 0xC0FFEE;
  if (opts.roomProbe) probe = { log: [], gain: [], ms: 0, samples: 0 };
  const settled = asked.unheld === null ? asked.preset : null;
  const path = TF2Room.createRoomPath({ seed, room: settled, water: asked.water });
  room = { path: probe ? probed(path) : path, attached: settled !== null || asked.water };
  if (probe) {
    probe.log.push({ call: 'create', seed, room: settled, water: asked.water });
    room.onBlock = (at) => probe.log.push({ call: 'block', at });
    room.onSwitch = (on, at) => probe.log.push({ call: on ? 'attach' : 'detach', at });
  }
}

// Whether the path holds nothing: no room now or before, none asked for
// but "none", no fade, no water.
function roomIdle() {
  const s = room.path.state();
  return s.room.preset === null && s.room.previous === null && (s.room.requested === undefined || s.room.requested === null)
    && !s.room.fading && !s.water.on && !s.water.asked;
}

// tests only (opts.roomProbe, set when the monitor starts): the path wrapped
// so every call on it is logged with its inputs and output, for the browser
// suite to run the module by hand on the same samples.
function probed(path) {
  const copy = (x) => Int32Array.from(x);
  return {
    shares() { const s = path.shares(); probe.log.push({ call: 'shares', room: s.room, direct: s.direct }); return s; },
    spurtStart() { probe.log.push({ call: 'spurtStart' }); path.spurtStart(); },
    process(direct, room, out) {
      const d = copy(direct), r = copy(room), t0 = performance.now();
      const y = path.process(direct, room, out), ms = performance.now() - t0;
      probe.ms += ms;
      probe.samples += y.length;
      probe.log.push({ call: 'process', direct: d, room: r, out: copy(y), fading: path.state().room.fading, ms });
      return y;
    },
    tailLeft: () => path.tailLeft(),
    state: () => path.state(),
    setRoom: (p) => path.setRoom(p),
    setWater: (on) => path.setWater(on)
  };
}

// A settings change rebuilds the chain, unless only the room or the water
// changed. For `steam` the new chain starts with a silent sender, a new
// decoder, a resampler that has not flushed and a reset gain: that is the
// app's own, not something Steam does.
function configure(opts) {
  const mine = ++generation;
  enqueue(async () => {
    if (mine !== generation) return;   // a later change supersedes this one
    const asked = TF2Audio.roomPreset(opts);
    if (!room) makeRoom(opts, asked);
    else {
      setRoomOf(asked);
      if (asked.preset !== null || asked.water) room.attached = true;
    }
    const key = settingsKey(opts);
    if (chain && key === chainKey) return;   // the room alone: no new chain
    const next = await TF2Audio.createLiveChain({ ...opts, liveRoom: room,
      ...(probe ? { onGain: (x) => probe.gain.push(Float32Array.from(x)) } : {}) }, rate);
    if (mine !== generation) { next.free(); return; }
    if (chain) chain.free();
    chain = next;
    chainKey = key;
    chain.setTalking(talking);
    chain.startTotal = null;   // global input sample of its first block
    chain.outTotal = 0;
    chain.frameTotal = 0;
    self.postMessage({ type: 'ready', latencyMs: chain.stats.latencyMs, codec: chain.stats.codec, lowLatencySavingMs: chain.lowLatencySavingMs ?? null,
      room: room.attached });
  });
}

async function processBlock(block) {
  if (!chain) return;
  const c = chain, at = inputTotal;
  inputTotal += block.length;
  if (c.startTotal === null) c.startTotal = at;
  const out = await c.process(block);
  const codes = c.takeFrameCodes();
  if (recording) {
    recording.dry.push(block);
    // Output sample j of this chain is its input sample j - contentDelay.
    if (out.length) recording.wet.push({ at: c.startTotal + c.outTotal - c.contentDelay - recording.start, samples: out.slice() });
    // Codec frame k of this chain covers its input from k frame lengths on;
    // for `steam`, slot k from 480 k - lookahead codec samples on (the
    // render's slot rule: slotOffsetSeconds).
    codes.forEach((code, k) => recording.frames.push({ at: c.startTotal / rate + (c.frameTotal + k) * c.frameSeconds + (c.slotOffsetSeconds || 0) - recording.start / rate, code }));
    recording.chain = c;
  }
  c.outTotal += out.length;
  // With neither a room nor the water, the path is let go once its fade to
  // none has ended: the mix stage stops running it at a block start once its
  // room part has run out. Read from the path's own state, whatever was
  // asked last (a number the table does not hold leaves the room as it is).
  if (room && room.attached && roomIdle()) room.attached = false;
  c.frameTotal += codes.length;
  if (out.length) port.postMessage({ type: 'out', samples: out.buffer }, [out.buffer]);
}

function finishRecording() {
  const rec = recording;
  recording = null;
  if (!rec) return;
  const length = rec.dry.reduce((n, b) => n + b.length, 0);
  const dry = new Float32Array(length), wet = new Float32Array(length);
  let offset = 0;
  for (const b of rec.dry) { dry.set(b, offset); offset += b.length; }
  for (const piece of rec.wet) {
    for (let i = 0; i < piece.samples.length; i++) {
      const j = piece.at + i;
      if (j >= 0 && j < length) wet[j] = piece.samples[i];
    }
  }
  const c = rec.chain || chain;
  const frameSeconds = c ? c.frameSeconds : .02;
  const frameLog = new Uint8Array(Math.ceil(length / rate / frameSeconds));
  const counts = { frames: frameLog.length, gated: 0, dtx: 0, lost: 0, late: 0, modes: { silk: 0, hybrid: 0, celt: 0, speex: 0, vr12: 0 } };
  for (const { at, code } of rec.frames) {
    const f = Math.round(at / frameSeconds);
    if (f >= 0 && f < frameLog.length) frameLog[f] = code;
  }
  let spurts = 0;
  frameLog.forEach((code, f) => {
    if (code === 0) counts.gated++;
    else if (f === 0 || frameLog[f - 1] === 0) spurts++;
    if (code === 1) counts.modes.silk++;
    if (code === 2) counts.modes.hybrid++;
    if (code === 3) counts.modes.celt++;
    if (code === 4) counts.dtx++;
    if (code === 5) counts.lost++;
    if (code === 6) counts.late++;
    if (code === 7) counts.modes.speex++;
    if (code === 8) counts.modes.vr12++;
  });
  const info = c ? { frameSamples: c.frameSize, version: c.version, bitrate: c.bitrate, vbr: c.vbr, dtx: c.dtx, gate: c.gateDb, autoGain: c.autoGain,
    voiceRate: c.voiceRate, codec: c.stats.codec, realOpus: c.realOpus } : {};
  self.postMessage({ type: 'recording', dry: dry.buffer, wet: wet.buffer, rate, frameLog: frameLog.buffer, counts: { ...counts, spurts }, info },
    [dry.buffer, wet.buffer, frameLog.buffer]);
}

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === 'start') {
    rate = message.rate;
    port = message.port;
    port.onmessage = (e) => {
      if (!e.data || e.data.type !== 'in') return;
      const block = new Float32Array(e.data.samples);
      enqueue(() => processBlock(block));
    };
    configure(message.opts);
  } else if (message.type === 'config') {
    configure(message.opts);
  } else if (message.type === 'talk') {
    talking = !!message.on;
    enqueue(() => { if (chain) chain.setTalking(talking); });
  } else if (message.type === 'record') {
    enqueue(() => {
      if (message.on) recording = { start: inputTotal, dry: [], wet: [], frames: [], chain: null };
      else finishRecording();
    });
  } else if (message.type === 'roomprobe') {
    // tests only: the probe's log so far (see probed()).
    enqueue(() => {
      const p = probe || { log: [], gain: [], ms: 0, samples: 0 };
      self.postMessage({ type: 'roomprobe', log: p.log, gain: p.gain, ms: p.ms, samples: p.samples, state: room ? room.path.state() : null,
        attached: room ? room.attached : false, holding: room ? !!room.holding : false,
        stats: chain ? { spurts: chain.stats.spurts, latencyMs: chain.stats.latencyMs } : null });
      if (probe) { probe.log = []; probe.gain = []; }
    });
  } else if (message.type === 'stop') {
    generation++;
    enqueue(() => { if (chain) chain.free(); chain = null; self.close(); });
  }
};

setInterval(() => {
  if (!chain) return;
  const s = chain.stats;
  self.postMessage({ type: 'stats', stats: { ...s, modes: { ...s.modes } }, recording: !!recording });
  s.inputPeak = 0;
  s.outputPeak = 0;
}, 100);
