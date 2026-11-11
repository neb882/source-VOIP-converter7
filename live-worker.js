/* The live monitor's voice chain (TF2Audio.createLiveChain), fed 20 ms
 * blocks of microphone audio by live-worklet.js over a MessagePort and
 * answering with processed blocks for it to play. Settings changes rebuild
 * the chain; stats go to the page ten times a second.
 *
 * The room (W3-17d) is a room path (room-dsp.js createRoomPath) kept here,
 * outside the chain, so a rebuilt chain keeps the room's lines and the
 * slot's count of blocks; the chain's mix stage runs it once per 512-sample
 * block. A change of room or of the water alone does not rebuild the chain:
 * setRoom takes the new room with the engine's 200 ms cross-fade, setWater
 * switches the water at the next block with no fade (as the engine does).
 * The path is made the first time a room or the water is asked for (settled,
 * as the game would be, if the monitor starts so; with a cross-fade from no
 * room otherwise), and dropped at a rebuild once it holds no room, has
 * finished fading and is not under water: a chain without it holds nothing
 * back. A number the table does not hold leaves the room as it was
 * (Decision 11).
 *
 * Recording keeps the microphone blocks (dry) and the chain's output (wet)
 * and lines them up: each chain's output is its own input contentDelay
 * samples later (a rebuilt chain starts its count afresh). On stop the pair
 * goes to the page with a frame log for the codec lane. */
'use strict';

importScripts('constants.js', 'steam-sender.js', 'vendor/swresample/swresample.js', 'room-presets.js', 'room-dsp.js', 'audio.js');

let chain = null, port = null, rate = 48000, queue = Promise.resolve(), generation = 0;
let talking = true, inputTotal = 0, recording = null;
// The room path, and the key of the settings the chain was built with,
// less the room's own (opts.room, opts.underwater).
let roomPath = null, chainKey = null, probe = null;

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
// number the table does not hold changes nothing.
function setRoomOf(asked) {
  if (asked.unheld === null) roomPath.setRoom(asked.preset);
  roomPath.setWater(asked.water);
  if (probe) probe.log.push({ call: 'set', preset: asked.unheld === null ? asked.preset : undefined, water: asked.water });
}

// Whether the path holds nothing: no room now or before, none asked for
// but "none", no fade, no water.
function roomIdle() {
  const s = roomPath.state();
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
    const asked = TF2Audio.roomPreset(opts), wants = asked.preset !== null || asked.water;
    const key = settingsKey(opts);
    if (chain && key === chainKey && (roomPath || !wants)) {
      if (roomPath) setRoomOf(asked);
      return;
    }
    const starting = !chain;
    if (!roomPath && wants) {
      const seed = Number.isFinite(opts.seed) ? opts.seed >>> 0 : 0xC0FFEE;
      if (opts.roomProbe && !probe) probe = { log: [], ms: 0, samples: 0 };
      // Starting in a room is being in it already: the room settled, the
      // water's amplifier settled (createRoomPath's pre-roll). Otherwise the
      // room fades in from none and the water starts fresh, as in the game.
      const made = TF2Room.createRoomPath(starting && asked.unheld === null ? { seed, room: asked.preset, water: asked.water } : { seed });
      roomPath = probe ? probed(made) : made;
      if (probe) probe.log.push({ call: 'create', seed, room: starting && asked.unheld === null ? asked.preset : null, water: starting && asked.water });
      if (!starting) setRoomOf(asked);
    } else if (roomPath) {
      setRoomOf(asked);
      if (!wants && roomIdle()) roomPath = null;
    }
    const next = await TF2Audio.createLiveChain({ ...opts, roomPath }, rate);
    if (mine !== generation) { next.free(); return; }
    if (chain) chain.free();
    chain = next;
    chainKey = key;
    chain.setTalking(talking);
    chain.startTotal = null;   // global input sample of its first block
    chain.outTotal = 0;
    chain.frameTotal = 0;
    self.postMessage({ type: 'ready', latencyMs: chain.stats.latencyMs, codec: chain.stats.codec, lowLatencySavingMs: chain.lowLatencySavingMs ?? null,
      room: !!roomPath });
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
      const p = probe || { log: [], ms: 0, samples: 0 };
      self.postMessage({ type: 'roomprobe', log: p.log, ms: p.ms, samples: p.samples, state: roomPath ? roomPath.state() : null });
      if (probe) probe.log = [];
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
