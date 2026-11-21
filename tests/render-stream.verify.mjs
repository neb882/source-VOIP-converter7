// A render made a piece at a time (TF2Audio.createRender, W2-02) against
// the whole render (TF2Audio.process).
//
//   node tests/render-stream.verify.mjs                the checks
//   node tests/render-stream.verify.mjs --hashes       print each case's hashes
//   node tests/render-stream.verify.mjs --memory 60    the memory check alone:
//     60 minutes streamed in 1 s chunks into one preallocated output must
//     peak under source + output + 300 MB of RSS (heavy: run it on its own)
//
// Golden renders: GOLDEN holds the SHA-256 of process()'s WAV and of its
// codecInfo for every case below. They were recorded from process() before
// createRender existed, and every run checks process() against them, so a
// later change to process() (making it a wrapper over the stream, say) can
// show that no render moved. Never re-record them to make a change pass;
// re-record them only for a change meant to move renders, in a commit of
// its own that says why (W3-05 did, below).
//
// The engine is loaded as a plain function in this realm rather than in a vm
// context as the suites did before tests/lib/engine.cjs: the same code gives
// the same samples (two cases below are rendered both ways), and Math runs
// several times faster outside a vm context. TF2_DIR points the suite at a
// copy of the sources. Every signal is synthetic, made here.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { loadEngine, engineSource } from './lib/engine.cjs';

const root = process.env.TF2_DIR ? pathToFileURL(path.resolve(process.env.TF2_DIR) + '/') : new URL('..', import.meta.url);
const TF2Opus = await import(new URL('opus-codec.mjs', root).href);
const printHashes = process.argv.includes('--hashes');
// The room module and its table (W3-17c), loaded as Node loads them, outside
// the engine: the engine reads them as the globals TF2Room and
// TF2_ROOM_PRESETS, as on the page. `room` is what the engine is handed: the
// module with createRoomPath wrapped, so the checks see every path a render
// makes and every process() call it makes on one (paths, below).
const requireHere = createRequire(import.meta.url);
const roomModule = requireHere(fileURLToPath(new URL('room-dsp.js', root)));
const roomTable = requireHere(fileURLToPath(new URL('room-presets.js', root)));
// The capture converter (W3-26b), handed to the vm context as the loader hands it (tests/lib/engine.cjs, HANDED).
const captureModule = requireHere(fileURLToPath(new URL('capture-converter.js', root)));
const paths = [];
// neverEnds.on: the next paths' tailLeft() never says the output ended (the
// tail loop's own bound, section 3).
const neverEnds = { on: false };
const room = { ...roomModule, createRoomPath(o) {
  const p = roomModule.createRoomPath(o), log = { opts: o, calls: [] };
  if (neverEnds.on) p.tailLeft = () => ({ ended: false, at: -1, length: 0 });
  let count = 0;
  const run = p.process.bind(p);
  p.process = (direct, wet, out) => {
    let peak = -Infinity;
    for (let i = 0; i < direct.length; i++) if (direct[i] > peak) peak = direct[i];
    log.calls.push({ start: count, length: direct.length, peak });
    count += direct.length;
    return run(direct, wet, out);
  };
  paths.push(log);
  return p;
} };

// The engine's files as the page's classic scripts see them, inside one
// function, from the tests' one loader (tests/lib/engine.cjs): no timers (the
// codec loop's yields resolve at once), the codec module injected, the tables
// returned, `room` handed in as TF2Room. With rooms false the room module is
// absent, as for a page that did not load it.
function engineInThisRealm(rooms = true) {
  return loadEngine({ root, codec: TF2Opus, TF2Room: rooms ? room : null, TF2_ROOM_PRESETS: rooms ? roomTable : null });
}
// The same text in a vm context, the way the suites loaded it before the
// loader (tests/verify.js until S3-01a).
function engineInVm() {
  const sandbox = { window: {}, Blob, console, TF2Room: roomModule, TF2_ROOM_PRESETS: roomTable, TF2CaptureConverter: captureModule };
  vm.createContext(sandbox);
  vm.runInContext(engineSource(root), sandbox);
  sandbox.TF2Opus = TF2Opus;
  return { audio: sandbox.window.TF2Audio };
}

const engine = engineInThisRealm(), A = engine.audio;
// A code path no shipped profile reaches, given a test-only entry: a decoder
// EQ (a zero-phase FIR after the codec). It is a stage of the frame path, so
// the test profile keeps the 20 ms frame gate (no rule 'steam', which since
// W3-11a has no such stage). (Until W3-17c a test-only listener position
// with a low-pass and no room stood beside it; the low-pass went with the
// old room code, and its case with it.)
engine.CODEC_PROFILES.test_decoder_eq = { ...engine.CODEC_PROFILES.steam, displayName: 'test only: Steam with a decoder EQ',
  senderGate: { thresholdDb: -39.5, prerollMs: 120, holdMs: 440 },
  decoderEq: { taps: 63, freqs: [0, 3000, 7000, 12000], gainsDb: [0, -1, -6, -12] } };

// A failed check is reported and the suite goes on, so a broken stage
// shows every case it breaks; the run fails at the end.
let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `   [${detail}]` : ''}`);
}

/* ---------------- signals ---------------- */

// Speech-like: 90-170 Hz harmonics with a 3.2 Hz syllable envelope and a
// little noise, in talk spurts of 0.4-3 s with pauses of 0.15-2.4 s, over a
// -72 dBFS noise floor, so Steam's gate opens and closes on every pause past
// its 440 ms hold. Spurts peak near -7 dBFS, so mic gain 4 clips the capture.
function voice(seconds, rate, seed, length = Math.round(seconds * rate)) {
  const out = new Float32Array(length);
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const floor = 1.7 * 10 ** (-72 / 20);
  for (let i = 0; i < length; i++) out[i] = floor * (rnd() * 2 - 1);
  let t = Math.round(0.25 * rate);
  while (t < length) {
    const len = Math.round((0.4 + 2.6 * rnd()) * rate);
    const level = 10 ** ((-20 + 12 * rnd()) / 20), f0 = 90 + 80 * rnd(), phase = 6.283 * rnd();
    for (let i = 0; i < len && t + i < length; i++) {
      const time = i / rate, env = Math.max(0, Math.sin(Math.PI * 3.2 * time + phase)) ** 1.5;
      const w = 2 * Math.PI * f0 * time * (1 + 0.02 * Math.sin(2 * Math.PI * 0.7 * time));
      let v = 0;
      for (let h = 1; h <= 10; h++) v += Math.sin(w * h) / h;
      out[t + i] += level * env * (0.6 * v + 0.12 * (rnd() * 2 - 1));
    }
    t += len + Math.round((0.15 + 2.25 * rnd() ** 1.5) * rate);
  }
  return out;
}

// A demo's received voice as demo.js hands it to the render: Steam voice at
// 24 kHz in 480-sample frames, exact zeros between talk spurts, and its frame
// log (hybrid frames, some SILK, one lost, one DTX) and packet sizes.
function receivedVoice(seconds, seed) {
  const size = 480, samples = voice(seconds, 24000, seed, Math.round(seconds * 50) * size);
  const frames = samples.length / size, frameLog = [], frameBytes = [];
  let spurts = 0, coded = 0;
  for (let f = 0; f < frames; f++) {
    let energy = 0;
    for (let i = f * size; i < (f + 1) * size; i++) energy += samples[i] * samples[i];
    if (Math.sqrt(energy / size) < 0.01) { samples.fill(0, f * size, (f + 1) * size); frameLog.push(0); frameBytes.push(0); continue; }
    if (!frameLog.length || frameLog[frameLog.length - 1] === 0) spurts++;
    coded++;
    const code = coded === 40 ? 5 : coded === 70 ? 4 : coded % 17 === 0 ? 1 : 2;
    frameLog.push(code);
    frameBytes.push(code === 4 ? 1 : 60 + (f % 23));
  }
  return { samples, received: { frameLog, frameBytes, frameMs: 20, spurts } };
}

// A demo's own packets (W3-02g), made here as the received voice above is: a
// demo's messages in Set D's shape, phrases that open with 8 frames from
// number 0 (13 in the third phrase, which the game refuses) and go on with 3
// frames every fourth tick, an end marker with the last and a silence record
// of 1,500 samples four ticks later, pauses of 10 to 80 ticks, 2 frames that
// never came in front of a message of the second phrase, two messages on one
// tick in the fourth, and an end marker alone past the end. The frames are
// seeded bytes behind the TOC of a 20 ms Opus frame (hybrid, SILK or CELT),
// which Steam's decoder takes as it takes any packet. `at`, the frame log and
// the sizes are where demo.js's decode would lay each frame (from the
// phrase's tick, frames back to back, the 2 that never came concealed); the
// source is speech-like talk of the same length, of which a render on the
// game's timeline uses the length alone.
function demoQueueVoice(seconds, seed) {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const total = Math.round(seconds * 50) * 480, slots = total / 480;
  const frameLog = new Array(slots).fill(0), frameBytes = new Array(slots).fill(0), packets = [];
  const frame = () => {
    const data = new Uint8Array(20 + Math.floor(rnd() * 90));
    data[0] = [13, 13, 13, 9, 31][Math.floor(rnd() * 5)] << 3;
    for (let i = 1; i < data.length; i++) data[i] = Math.floor(rnd() * 256);
    return data;
  };
  const lay = (pos, code, bytes) => { const f = Math.round(pos / 480); if (f < slots) { frameLog[f] = code; frameBytes[f] = bytes; } };
  let tick = 20, pos = 0, phrase = 0;
  for (;;) {
    const length = 20 + Math.floor(rnd() * 50);
    pos = Math.max(pos, (tick - 20) * 360);
    if (pos + (length + 6) * 480 > total) break;
    phrase++;
    let seq = 0, message = 0;
    while (seq < length) {
      const n = message === 0 ? (phrase === 3 ? 13 : 8) : 3, frames = [];
      if (phrase === 2 && message === 3) { lay(pos, 5, 0); lay(pos + 480, 5, 0); pos += 960; seq += 2; }
      const at = pos;
      for (let k = 0; k < n && seq < length; k++, seq++, pos += 480) {
        const data = frame();
        frames.push({ seq, data });
        lay(pos, (data[0] >> 3) < 12 ? 1 : (data[0] >> 3) < 16 ? 2 : 3, data.length);
      }
      if (seq >= length) frames.push({ end: true });
      packets.push({ tick, rate: 24000, at, records: [{ frames }] });
      if (!(phrase === 4 && message === 2)) tick += 4;
      message++;
    }
    packets.push({ tick, rate: 24000, at: pos, records: [{ silence: 1500 }] });
    tick += 10 + Math.floor(rnd() * 70);
  }
  packets.push({ tick: tick + 400, rate: 24000, at: pos, records: [{ frames: [{ end: true }] }] });
  return { samples: voice(seconds, 24000, seed, total),
    received: { frameLog, frameBytes, frameMs: 20, spurts: phrase, packets, firstTick: 20, tickSeconds: 0.015 } };
}

/* ---------------- the cases ---------------- */

// The options the page sends (app/render.js), at its settings before W3-10,
// with volume 0.5 given explicitly: at 0.5 every odd sample of the mix is a
// tie, so the cases exercise mixOut's rounding to even. (The page's own
// default is 1 since W3-10; no device rate is given, so every case is at
// 48000 Hz, the default.)
const PAGE = { codec: 'steam', listenerPos: 'open', dspRoom: 0, customEnv: null, captureChannel: 'left', micGain: 1, voiceScale: 1,
  hp: 0, lp: 20000, bits: 16, agc: true, retime: false, maxGain: 10, avgGain: 0.5, gate: null, gateThresholdDb: -39.5, volume: 0.5,
  lossPct: 0, frameMs: 20, enableWarble: true, jitterMs: 0 };

// Chunk plans: the sizes pushed, in order (each plan covers the whole source).
const UNEVEN = [0, 1, 7, 2, 959, 961, 13, 48000, 0, 4097, 333, 12345, 1, 30011, 480, 481, 65537];
const PLANS = {
  '1': () => 1, '7': () => 7, '960': () => 960, '12345': () => 12345,
  'one second': (k, rate) => rate,
  'uneven': (k) => UNEVEN[k % UNEVEN.length],
  'whole': (k, rate, n) => n
};

const CASES = [];
// Since W3-11a the page sends no threshold for `steam` at its control's
// -39.5 (Steam's own gate); other profiles get the number.
const pageFor = (opts) => {
  const o = { ...PAGE, ...opts };
  if (o.codec === 'steam' && o.gateThresholdDb === -39.5) delete o.gateThresholdDb;
  return o;
};
// Every `steam` case with the codec on (Steam's sender and decoder since
// W3-11a: the sender, the decoder's resets, the resampler and the gain all
// carry state across pushes) also runs at chunks of 7, 960 and 12,345
// samples and whole.
const STEAM_PLANS = ['7', '960', '12345', 'whole'];
const steamRule = (o) => {
  const profile = Object.hasOwn(engine.CODEC_PROFILES, o.codec) ? engine.CODEC_PROFILES[o.codec] : engine.CODEC_PROFILES.steam;
  return profile.senderGate?.rule === 'steam' && o.enableWarble !== false && !o.received;
};
const add = (name, rate, make, opts, plans = ['uneven']) => {
  const o = pageFor(opts);
  CASES.push({ name, rate, make, opts: o, plans: steamRule(o) ? [...new Set([...plans, ...STEAM_PLANS])] : plans });
};
const at48 = (seconds, seed) => () => voice(seconds, 48000, seed);

// Each profile on 20 s of speech-like talk spurts at 48 kHz.
add('steam', 48000, at48(20, 1), {}, ['7', '960', '12345', 'one second', 'uneven', 'whole']);
for (const [codec, plan] of [['steam_48', 'uneven'], ['celt_22', '960'], ['celt_44', '12345'], ['speex', 'one second']]) {
  add(codec, 48000, at48(20, 1), { codec }, [plan]);
}
// The Steam profile under each setting that changes the chain.
for (const [name, opts, plan] of [
  ['steam, gate off', { gate: false }, 'uneven'],
  ['steam, gate on at -30 dBFS', { gate: true, gateThresholdDb: -30 }, '960'],
  ['steam, codec bypassed', { enableWarble: false }, 'uneven'],
  ['steam, high-pass 250 Hz and low-pass 3500 Hz', { hp: 250, lp: 3500 }, '12345'],
  ['steam, mic gain 4 (capture clipping)', { micGain: 4 }, 'uneven'],
  ['steam, auto-gain off', { agc: false }, 'one second'],
  ['steam, voice_scale 0.5', { voiceScale: 0.5 }, 'uneven'],
  ['steam, voice_avggain 0.25', { avgGain: 0.25 }, '960'],
  ['steam, loss 15%, jitter 50 ms, net_split 40 ms', { lossPct: 15, jitterMs: 50, frameMs: 40 }, 'uneven']
]) add(name, 48000, at48(15, 2), opts, [plan]);
// Source rates, and a length that is a multiple of nothing (a prime).
for (const [rate, plan] of [[44100, 'uneven'], [96000, '12345'], [22050, '960']]) {
  add(`steam, source at ${rate} Hz`, rate, () => voice(15, rate, 3), {}, [plan]);
}
add('steam, 1,000,003 samples (a prime) at 48 kHz', 48000, () => voice(0, 48000, 3, 1000003), {}, ['uneven', '12345']);
// W3-26b, test 3: the steam capture is Windows's converter as read (capture-converter.js), streamed at the steam
// plans and equal to process(): from a pair of rates outside Windows's limits for a stored table (44,056 Hz, not
// rated: the sum in double precision), from below 24 kHz (16,000 Hz) and from 96,000 Hz. Each is about 8 s, of a
// length whose n x 24000 / rate has a fraction of .5 or more (192000.55, 192001.5 and 192000.5), so that a flush
// to floor(n L / M) in place of the rounded length comes out a sample short. The 16,000 Hz source sounds to its last
// sample (its last 0.5 s a steady voiced sound at 0.3 of full scale), so that the output such a flush leaves out
// reaches the codec through an open gate (W3-26b's fix round 1: with the talk's quiet end the missing output changed
// nothing after the gate, and the case passed that break).
const soundingToTheEnd = (x, rate) => {
  for (let i = x.length - rate / 2; i < x.length; i++) {
    const t = i / rate;
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * 150 * h * t) / h;
    x[i] = 0.3 * v / 1.5;
  }
  return x;
};
for (const [name, rate, length, toTheEnd] of [['44,056 Hz (not rated)', 44056, 352449, false],
  ['16,000 Hz (below 24 kHz)', 16000, 128001, true], ['96,000 Hz, 8 s', 96000, 768002, false]]) {
  add(`steam, the capture converter from ${name}`, rate, () => (toTheEnd ? soundingToTheEnd(voice(0, rate, 26, length), rate) : voice(0, rate, 26, length)),
    {}, ['uneven']);
}
// A demo's voice: the receiver only. The sender, gate, codec and network
// settings given with it are ignored, as process() ignores them.
const demo = receivedVoice(6, 7);
add('demo voice as received', 24000, () => demo.samples,
  { received: demo.received, micGain: 3, hp: 300, lp: 3000, lossPct: 20, gate: true }, ['uneven', 'whole']);
add('steam, 1 s pushed a sample at a time', 48000, at48(1, 5), {}, ['1']);
add('steam, six minutes', 48000, at48(360, 6), {}, ['one second']);
// Beyond the order's list: the codec paths the profile cases leave out (the
// gate and loss on CELT and Speex frames), rates that need no resampling
// into the codec, the remaining settings, the test-only stages, options the
// page would never send, and tiny sources.
for (const [name, rate, opts, plan] of [
  ['celt_22, gate on, loss 15%, jitter 300 ms', 48000, { codec: 'celt_22', gate: true, lossPct: 15, jitterMs: 300 }, 'uneven'],
  ['celt_44, gate on, loss 15%', 48000, { codec: 'celt_44', gate: true, lossPct: 15 }, '960'],
  ['speex, gate on, loss 15%, jitter 300 ms', 48000, { codec: 'speex', gate: true, lossPct: 15, jitterMs: 300 }, 'uneven'],
  ['steam, jitter 500 ms on the file\'s own timing (does nothing)', 48000, { jitterMs: 500 }, '960'],
  ['steam, snd_bits 4 (SILK frames)', 48000, { bits: 4 }, 'uneven'],
  ['steam_48, loss 10%, jitter 100 ms, snd_bits 10', 48000, { codec: 'steam_48', lossPct: 10, jitterMs: 100, bits: 10 }, '12345'],
  ['steam, source at 24 kHz', 24000, {}, 'uneven'],
  ['celt_22, source at 22.05 kHz', 22050, { codec: 'celt_22' }, 'uneven'],
  ['speex, source at 11.025 kHz', 11025, { codec: 'speex' }, 'uneven'],
  ['speex, source at 8 kHz', 8000, { codec: 'speex' }, 'uneven'],
  ['steam, volume 1, voice_maxgain 3', 48000, { volume: 1, maxGain: 3 }, 'uneven'],
  ['steam, volume 0.3 (a volume whose product rounds)', 48000, { volume: 0.3 }, 'uneven'],
  ['steam, auto-gain off, voice_scale 3', 48000, { agc: false, voiceScale: 3 }, 'uneven'],
  ['steam, dsp_room 1 (no effect)', 48000, { listenerPos: null, dspRoom: 1 }, 'uneven'],
  ['steam, custom room at mix 0 (no effect)', 48000, { listenerPos: null, dspRoom: 99, customEnv: { duration: 1, decay: 2, mix: 0 } }, 'uneven'],
  ['odd options', 48000, { codec: 'nope', micGain: '2', gateThresholdDb: 'x', frameMs: 70, seed: -5, volume: 3, bits: 40, lossPct: '12', hp: -4, lp: 1e9 }, 'uneven'],
  ['test profile with a decoder EQ', 48000, { codec: 'test_decoder_eq' }, 'uneven']
]) add(name, rate, () => voice(8, rate, 4), opts, [plan]);
add('steam, empty source', 48000, () => new Float32Array(0), {}, ['whole']);
// Added in W3-11a's fix round. Heavy loss inside one long spurt (the gate
// off): a run of lost frames lays nothing, so the open spurt's cursor stays
// where it is while the sender reads on, and the next frame to arrive (with
// its concealment) lands at that cursor (since BC-1, at the cursor plus the
// frames past the ten concealed). createRender may give out samples only up
// to it; without that bound these cases throw at chunks of 960 and 7.
const noise = (seconds, seed) => () => {
  let s = seed >>> 0;
  return Float32Array.from({ length: Math.round(seconds * 48000) }, () => 0.3 * ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2147483648 - 1));
};
add('steam, gate off, loss 80%, seed 1 (long runs lost inside a spurt)', 48000, noise(4, 1), { gate: false, lossPct: 80, seed: 1 }, ['960', '7']);
add('steam, gate off, loss 40%, seed 3 (long runs lost inside a spurt)', 48000, noise(4, 3), { gate: false, lossPct: 40, seed: 3 }, ['960', '7']);
add('celt_22, one sample at 22.05 kHz', 22050, () => Float32Array.of(0.25), { codec: 'celt_22' }, ['whole']);
add('speex, 100 samples at 96 kHz', 96000, () => voice(0, 96000, 8, 100), { codec: 'speex' }, ['7']);
// Added for W3-19 (the engine codecs' gain on the decoder's own samples) and
// recorded before it, by the code it changes: renders of the three engine
// profiles that it must not move. At voice_maxgain 1 the gain is 1
// everywhere, so where its blocks fall changes nothing; with the auto-gain
// off the gain does not run.
for (const [name, opts, plan] of [
  ['celt_22, voice_maxgain 1', { codec: 'celt_22', maxGain: 1 }, '960'],
  ['celt_44, voice_maxgain 1, gate on', { codec: 'celt_44', maxGain: 1, gate: true }, 'uneven'],
  ['speex, voice_maxgain 1, gate on, loss 15%', { codec: 'speex', maxGain: 1, gate: true, lossPct: 15 }, 'uneven'],
  ['celt_22, auto-gain off', { codec: 'celt_22', agc: false }, '12345'],
  ['speex, auto-gain off', { codec: 'speex', agc: false }, 'uneven']
]) add(name, 48000, () => voice(8, 48000, 12), opts, [plan]);
// Added for W3-20b: the `miles` profile (vaudio_miles of the Source engines of
// 2006 and 2007, not a TF2 codec), on the sources the Speex cases use: the
// profiles' 20 s source; the 8 s source with the gate and loss, net_split, and
// at rates that need no resampling into the codec and that do; 100 samples at
// 96 kHz; W3-19's source at voice_maxgain 1 and with the auto-gain off.
add('miles', 48000, at48(20, 1), { codec: 'miles' }, ['uneven', '960']);
for (const [name, rate, opts, plan] of [
  ['miles, gate on, loss 15%, jitter 300 ms', 48000, { codec: 'miles', gate: true, lossPct: 15, jitterMs: 300 }, 'uneven'],
  ['miles, loss 15%, net_split 40 ms', 48000, { codec: 'miles', lossPct: 15, frameMs: 40 }, 'uneven'],
  ['miles, source at 11.025 kHz', 11025, { codec: 'miles' }, 'uneven'],
  ['miles, source at 8 kHz', 8000, { codec: 'miles' }, 'uneven']
]) add(name, rate, () => voice(8, rate, 4), opts, [plan]);
add('miles, 100 samples at 96 kHz', 96000, () => voice(0, 96000, 8, 100), { codec: 'miles' }, ['7']);
for (const [name, opts, plan] of [
  ['miles, voice_maxgain 1, gate on, loss 15%', { codec: 'miles', maxGain: 1, gate: true, lossPct: 15 }, 'uneven'],
  ['miles, auto-gain off', { codec: 'miles', agc: false }, 'uneven']
]) add(name, 48000, () => voice(8, 48000, 12), opts, [plan]);
// Added in the review's fix round. Output lengths that are not whole
// numbers (n x playbackRate / srcRate), so process()'s rounding of the
// output length and the stream's cut or padding of its end are both seen: at
// 24 and 37.8 kHz the fraction is under .5; at 32 kHz the last resampler
// gives one sample less than the output's length (padded), at 37.8 and
// 11.025 kHz one more (cut).
for (const [rate, length, plans] of [[24000, 192004, ['uneven', 'whole']], [32000, 256007, ['uneven']], [37800, 302401, ['12345']],
  [11025, 88203, ['uneven']]]) {
  add(`steam, ${length} samples at ${rate} Hz (an output length of ${(length * 44100 / rate).toFixed(2)})`, rate,
    () => voice(0, rate, 10, length), {}, plans);
}
// The gate measures the last, partial codec frame over the whole frame size,
// as gatePlan does: a quarter frame of 0.02 sine at the very end is loud over
// its own samples (-37 dBFS) but not over the frame (-43 dBFS), so it is gated.
const quarterFrame = () => {
  const x = new Float32Array(100 * 960 + 240);
  for (let i = x.length - 240; i < x.length; i++) x[i] = 0.02 * Math.sin(i * 0.2);
  return x;
};
add('steam, silent but for a quarter frame of sine at the end', 48000, quarterFrame, {}, ['whole', 'uneven']);
// Since W3-11a `steam` gates chunks (Steam's rule), so the frame gate's
// partial last frame is held by its profile at 48 kHz, where a frame is 960
// samples as in the case above (added in W3-11a, recorded in its own commit).
add('steam_48, silent but for a quarter frame of sine at the end', 48000, quarterFrame, { codec: 'steam_48' }, ['whole', 'uneven']);
// A demo's received voice past full scale (a decoder's float output is not
// clamped): the capture's int16 clip applies to it as to any source.
add('demo voice as received, past full scale', 24000, () => {
  const x = new Float32Array(48000);
  for (let i = 0; i < 24000; i++) x[i] = 1.2 * Math.sin(i * 0.05);
  return x;
}, { received: { frameLog: Array.from({ length: 100 }, (_, f) => (f < 50 ? 2 : 0)), frameBytes: Array(100).fill(60), frameMs: 20, spurts: 1 } },
  ['uneven']);

// W3-17c: renders with a room or under water, on 3 s of the same talk at
// 48 kHz. Each names its room; `room` is the room as the checks rebuild it
// by hand from the module (section 1b): the preset, under water or not, and
// the shares of 256. Each also runs at two chunk plans (section 2), not at
// every Steam plan: what is new here comes after the gain, which the cases
// above stream at every plan.
const ROOM_CASES = [];
const roomVoice = () => voice(3, 48000, 11);
// The render's seed as audio.js takes it (finiteOr(opts.seed, 0xC0FFEE) >>> 0).
const seedOf = (c) => (Number.isFinite(Number(c.opts.seed)) && c.opts.seed !== null && c.opts.seed !== '' ? Number(c.opts.seed) : 0xC0FFEE) >>> 0;
const customByHand = ({ duration, decay, mix }) => {
  const clampTo = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  return { h: [mix, mix, 0, 0, 0, 0], p: [[10, [1, 2, 0.15]], [2, [clampTo(duration * 60, 25, 220), 12, 5,
    clampTo(Math.pow(0.001, 0.045 / duration), 0.3, 0.97), 1.2, clampTo(9000 / decay, 800, 12000), 1]]] };
};
const presetRoom = (n, water = false) => ({ room: n, water, shares: roomModule.shares(roomTable[n]) });
const autoRoom = (key) => { const b = roomModule.buildAutomatic(key, { table: roomTable }); return { room: b.preset, water: false, shares: roomModule.shares(b.preset), built: b }; };
const addRoom = (name, opts, byHand, plans, rate = 48000, make = roomVoice) => {
  add(name, rate, make, opts, plans);
  const c = CASES[CASES.length - 1];
  c.plans = plans;
  c.room = byHand;
  ROOM_CASES.push(c);
};
addRoom('steam, room: preset 6', { room: { preset: 6 } }, presetRoom(6), ['uneven', '960']);
addRoom('steam, room: preset 17 (random taps)', { room: { preset: 17 } }, presetRoom(17), ['12345', '7']);
addRoom('steam, room: automatic, tunnel', { room: { auto: 'tunnel' } }, autoRoom('tunnel'), ['uneven', 'one second']);
addRoom('steam, room: automatic, great_hall', { room: { auto: 'great_hall' } }, autoRoom('great_hall'), ['960', 'whole']);
addRoom('steam, room: automatic, set_c_room', { room: { auto: 'set_c_room' } }, autoRoom('set_c_room'), ['uneven', '12345']);
addRoom('steam, under water', { underwater: true }, { room: null, water: true, shares: { room: 0, direct: 256 } }, ['uneven', '7']);
addRoom('steam, under water, preset 6', { underwater: true, room: { preset: 6 } }, presetRoom(6, true), ['960', 'one second']);
addRoom('steam, custom room at mix 0.3', { listenerPos: null, dspRoom: 99, customEnv: { duration: 1, decay: 2, mix: 0.3 } },
  { room: customByHand({ duration: 1, decay: 2, mix: 0.3 }), water: false, shares: { room: 76, direct: 179 } }, ['uneven', '12345']);
addRoom('celt_22, room: preset 6', { codec: 'celt_22', room: { preset: 6 } }, presetRoom(6), ['uneven', '960']);
addRoom('steam, listenerPos tunnel (preset 6), loss 15%, jitter 50 ms', { listenerPos: 'tunnel', lossPct: 15, jitterMs: 50 }, presetRoom(6),
  ['uneven', '12345']);
// Added in the review's fix round: a seed of its own, on a room that draws
// (the room's taps come from the render's seed, Decision 7); a device at
// 96000 Hz (maxTail and the tail's length at the device's rate).
addRoom('steam, room: preset 17 (random taps), seed 7', { room: { preset: 17 }, seed: 7 }, presetRoom(17), ['whole', 'uneven']);
addRoom('steam, room: preset 6, device at 96000 Hz', { room: { preset: 6 }, deviceRate: 96000 }, presetRoom(6), ['uneven', 'whole']);
// A number the table does not hold (Decision 11): no room. Its hashes are
// those of the same render with none (section 1).
addRoom('steam, dsp_room 137 (no room)', { listenerPos: null, dspRoom: 137 }, null, ['uneven', '960']);

// W3-02c-2: renders on the game's timeline (opts.timeline 'game': the receiver's voice
// channel, voice-channel.js), at Steam's chunk plans. The room case has a seed of its own,
// so that the check above that a room leaves the gain's output alone, which compares with
// the source's timeline, does not take it in.
for (const [name, opts] of [
  ['steam, timeline game', {}],
  ['steam, timeline game at 66.67 fps', { fps: 66.67 }],
  ['steam, timeline game, gate off', { gate: false }],
  ['steam, timeline game, loss 15%, jitter 50 ms', { lossPct: 15, jitterMs: 50 }],
  ['steam, timeline game, auto-gain off, voice_scale 0.5', { agc: false, voiceScale: 0.5 }],
  ['steam, timeline game, device at 44100 Hz', { deviceRate: 44100 }]
]) add(name, 48000, at48(15, 2), { timeline: 'game', ...opts }, []);
addRoom('steam, timeline game, room: preset 6, seed 7', { timeline: 'game', room: { preset: 6 }, seed: 7 }, presetRoom(6), STEAM_PLANS);
// W3-02g: a demo's own packets on the game's timeline (Steam's decoder as read, its resampler
// once per record, the voice channel on the demo's own ticks), at the received voice's chunk
// plans and a sample at a time but for 7.
const demoQueue = demoQueueVoice(8, 13);
add('demo voice on the game\'s timeline', 24000, () => demoQueue.samples, { received: demoQueue.received, timeline: 'game' }, ['uneven', 'whole', '7']);
add('demo voice on the game\'s timeline at 66.67 fps, auto-gain off', 24000, () => demoQueue.samples,
  { received: demoQueue.received, timeline: 'game', fps: 66.67, agc: false }, ['uneven', 'whole']);

// SHA-256 of process()'s WAV, then of its codecInfo (canonical JSON, below).
// The first 40 were recorded in commit 7e1862c, before createRender existed.
// 'steam, volume 0.3' and the six cases of the review's fix round were added
// later, their hashes made by commit 7e1862c's audio.js (TF2_DIR pointed at
// that commit's sources, which also gave every earlier hash again).
// W3-05 (the receiver's gain made the engine's rule) re-recorded the WAV
// hashes of the 40 cases with the auto-gain on whose samples it changes.
// Seven did not move: the two with the auto-gain off; voice_maxgain 3,
// whose every block's target is the cap under both rules; three shorter
// than one block, which both rules run at unity at voice_scale 1 (an
// empty source, one sample, 100 samples); and a source the gate holds
// back whole, silent under any gain. No codecInfo hash moved.
// W3-06 (the CELT profiles as the game's module has them, on the module's
// build: the pitch filter compiled in, the reset after creation, 16-bit in
// and out) re-recorded the six CELT cases: the WAV and codecInfo hashes of
// five, and the codecInfo hash of the one-sample case, whose output is
// unchanged (its codecInfo names the new build and complexity 5). The
// celt_44 loss case became 'celt_44, gate on, loss 15%': at 5% its 172 frames
// of 46.4 ms lost none. No other hash moved.
// W3-12b (the speex profile runs the game's module: Speex 1.0.2 on 11025 Hz
// sound, no resampling to 8000 Hz) re-recorded the four Speex cases: the WAV
// and codecInfo hashes of 'speex' and of its gate and loss case, and the
// codecInfo hash of the 100-sample case, whose output is unchanged. The case
// 'speex, source at 8 kHz' became 'speex, source at 11.025 kHz', so that it
// still needs no resampling into the codec. No other hash moved.
// W3-12b's review fix round added 'speex, source at 8 kHz' back, as a new
// case on the new profile: a Speex source below the codec's rate, resampled up
// into it. No other hash moved.
// W3-11a (the steam profile sends and decodes as Steam does: Steam's sender,
// 16 bits, Steam's decoder rules, libswresample once per message, the gain
// fed the decoded packets; complexity 9; the page's -39.5 sent as no number)
// re-recorded the 32 cases that render `steam` with the codec on: the WAV and
// codecInfo hashes of 29, and the codecInfo hash only of three whose output
// is unchanged: the empty source, the source silent but for a quarter frame
// (gated under either gate), and the test profile with a decoder EQ (a copy
// of steam kept on the frame path, which moves only by complexity 9; 9 and
// 10 give the same packets). steam_48, the CELT and Speex cases, the codec
// bypassed and the received voice did not move. W3-11a also added
// 'steam_48, silent but for a quarter frame of sine at the end', the frame
// gate's partial last frame (W2-02's F2) on a profile that keeps the frame
// gate; its hashes were made by origin/main's audio.js (35e278e) and the
// branch's alike.
// W3-10 (the mixer and the output stage as the engine has them: the entry at
// 255/256, the engine codecs' upsampling by two, the clip, volume as a single
// and the 16-bit rounding, the device stage to 48000 Hz; no filter and no
// limiter; the WAV writer writing each 16-bit value as itself) re-recorded
// the WAV hashes of 48 cases. Three did not move: the empty source, and the
// two sources the gate holds back whole, which render as zeros at 48000 Hz
// before and after. No codecInfo hash moved, and the gain's output
// (GAIN_GOLDEN, recorded before the change) is the same in all 51 cases.
// W3-17c (the room module in the render after W3-10's entry) moved none of
// them; it removed 'test position with a low-pass' with the low-pass, and
// recorded its eleven room cases once, from the run in which every check of
// them passed (the room by hand, section 1b; the stream at their plans;
// dsp_room 137 equal to the same render with no room), in a commit of
// their own.
// Its review's fix round added two room cases (a seed of 7 on preset 17, and
// preset 6 on a 96000 Hz device), recorded once the same way in a commit of
// their own; no hash moved.
// W3-18 (Speex 1.0.2 with the arithmetic of the game's module: the packets of
// the speex profile's codec are those of before, its decoded output moves)
// re-recorded the WAV hashes of four Speex cases, 'speex', 'speex, gate on,
// loss 15%, jitter 300 ms', 'speex, source at 11.025 kHz' and 'speex, source
// at 8 kHz', and their GAIN_GOLDEN hashes (the codec is before the mix point),
// in a commit of their own. Their codecInfo hashes did not move (the same
// frames and the same count of wrapped samples), nor did any hash of
// 'speex, 100 samples at 96 kHz', whose one frame decodes the same. No hash
// of a case that does not run Speex moved.
// W3-19 added five cases of the engine codecs whose renders it must not move
// (voice_maxgain 1 on each profile, the auto-gain off on two), recorded by
// the audio.js it changes (main at W3-18's merge), in a commit of their own.
// W3-19 (the engine codecs' receiver gain run on the decoder's stream from
// its first sample, the codec's delay dropped after it) re-recorded the WAV
// and GAIN_GOLDEN hashes of the nine cases of celt_22, celt_44 and speex
// with the gain on at voice_maxgain 10 whose output it moves, in a commit of
// its own. No codecInfo hash moved. 'celt_44, gate on, loss 15%' did not
// move: celt_44's delay is 128 samples, one whole block, so its blocks fell
// on the game's already and only the first blocks change, and there the
// gate holds the first frames back, so those blocks are zeros either way.
// 'celt_22, one sample' and 'speex, 100 samples' are shorter than a block.
// The five cases added for W3-19 did not move, nor did any case of another
// profile.
// W3-20b (the miles profile: vaudio_miles of the Source engines of 2006 and
// 2007, not a TF2 codec) added eight cases of it, recorded once from the
// branch's code after every check of tests/miles.verify.mjs passed, in a
// commit of their own, beside the W3-19 cases. No other hash moved.
// BC-1 (on `steam` loss takes whole messages: one draw a message, a lost end
// marker carrying the decoder, the refusal over 12 frames, each played frame
// at its own time) re-recorded the WAV, codecInfo and GAIN_GOLDEN hashes of
// the five `steam` cases with loss, in a commit of its own: 'steam, loss 15%,
// jitter 50 ms, net_split 40 ms', 'steam, gate off, loss 80%, seed 1 (long
// runs lost inside a spurt)', 'steam, gate off, loss 40%, seed 3 (long runs
// lost inside a spurt)', 'steam, listenerPos tunnel (preset 6), loss 15%,
// jitter 50 ms' and 'odd options' (its unknown codec renders as `steam`, with
// lossPct 12). No other hash moved: not 'steam, jitter 500 ms (late frames
// play as silence)', whose late frames bring no packet past 12 frames and
// make no gap of more than ten, nor any render at loss 0 or of another
// profile, loss cases included.
// W3-21 (the sender's capture steps take the clock's phase against the sound:
// the lead's zeros before the source, the ticks and positions shifted back by
// it) re-recorded the hashes of the 50 cases that run Steam's sender: the
// WAV, codecInfo and GAIN_GOLDEN hashes of 49, and the codecInfo hash only of
// the empty source (the chunk its lead's zeros make; its output is empty
// either way). The gate-off cases are among them (the
// orchestrator's ruling of 2026-11-13: the phase does not depend on the
// gate). With the lead forced to 0 every recorded hash before W3-21 came
// back, all 83 cases. No case of another profile moved, nor 'steam, codec
// bypassed', the received voice, or the two sources silent but for a
// quarter frame at the end (gated whole either way).
// BC-4a (on `steam` jitter draws no late frame: on the game's timeline it is
// the tick each message reaches the voice channel, steamArrivals; on the
// source's timeline it does nothing) re-recorded the WAV, codecInfo and
// GAIN_GOLDEN hashes of the four `steam` cases with jitter, in a commit of
// its own: 'steam, timeline game, loss 15%, jitter 50 ms', 'steam, loss 15%,
// jitter 50 ms, net_split 40 ms', 'steam, listenerPos tunnel (preset 6), loss
// 15%, jitter 50 ms', and 'steam, jitter 500 ms (late frames play as
// silence)', renamed 'steam, jitter 500 ms on the file's own timing (does
// nothing)', whose hashes are now those of 'steam, dsp_room 1 (no effect)',
// the same source and settings without jitter. No other hash moved: no render
// at jitter 0, no render of another profile (the celt_22, speex, steam_48 and
// miles cases with jitter among them), and not 'odd options'.
// W3-02g (a demo's own packets through Steam's decoder and the voice channel
// on the game's timeline) added two cases of a demo on the game's timeline
// and recorded them in a commit of their own. No other hash moved.
// W3-26b (the steam capture runs Windows's converter as read,
// capture-converter.js, in place of the app's resampler and the filter fitted
// to three points) re-recorded the WAV, codecInfo and GAIN_GOLDEN hashes of
// the 50 cases that run Steam's sender with the codec on: the 48 named
// `steam` that do, 'odd options' (its unknown codec renders as `steam`) and
// 'test profile with a decoder EQ' (a copy of steam on the frame path that
// keeps the capture member), in a commit of its own, from the run in which
// every other check of this suite and of tests/stages.verify.mjs passed. It
// added three cases of the converter streamed from 44,056, 16,000 and
// 96,000 Hz (test 3), recorded with them. No other hash moved, 35 cases:
// every case of steam_48, celt_22, celt_44, speex and miles; 'steam, codec
// bypassed' (the app's resampler, as before); 'steam, empty source'; 'steam,
// silent but for a quarter frame of sine at the end' (gated whole either
// way); and the four renders of a demo's voice, on either timeline.
// W3-26b's fix round 1 gave the 16,000 Hz case of test 3 a source that sounds
// to its last sample (with the talk's quiet end a flush to the floored length
// passed it) and recorded that case's WAV, codecInfo and GAIN_GOLDEN hashes
// again, in a commit of its own. No other hash moved.
// W3-28 (the steam capture's step to 16 bits dithered as Windows's is,
// engine/steam.js createSteamCapture) re-recorded the WAV, codecInfo and
// GAIN_GOLDEN hashes of the 50 cases that run Steam's sender with the codec
// on from a source the converter converts, in a commit of its own, from the
// run in which every other check passed. No other hash moved, 38 cases: the
// two at 24,000 Hz ('steam, source at 24 kHz' and 'steam, 192004 samples at
// 24000 Hz'), where the step is not dithered; 'test profile with a decoder
// EQ' (the frame path, with no 16-bit step); 'steam, empty source'; 'steam,
// silent but for a quarter frame of sine at the end' (gated whole either
// way); 'steam, codec bypassed'; the four renders of a demo's voice; and
// every case of steam_48, celt_22, celt_44, speex and miles.
// W3-28's fix round 1 (the table's seed 0x28D17E6, the order's ruling after
// the build) recorded the same 50 cases again, in a commit of their own, from
// the run in which every other check passed. No other hash moved.
const GOLDEN = {
  // W3-02g: a demo's own packets on the game's timeline, recorded once from the run in which every
  // other check of this suite passed (every recorded hash above and below unmoved, and these two
  // cases streamed at their plans equal to process()), and every check of
  // tests/render-channel.verify.mjs, in a commit of their own.
  "demo voice on the game's timeline": ["0e339664734108571cf3bdd723070f02b391becf8bd8dcc7d0c1e64474541ceb", "88939d83252ac45b55fdd69d2412c55d425b8d48d54e180c9bbb8de1ec4b93bd"],
  "demo voice on the game's timeline at 66.67 fps, auto-gain off": ["fa987b36a70fc7cfe5362097940b1149b27c97c2799dce61dd5556a5a269ecb0", "70ba435eb738bd7fcf92c068739c8cc4359e8e2cf6ada53bbb676383aa6ec453"],
  // W3-02c-2: the renders on the game's timeline (opts.timeline 'game'), recorded once from
  // the run in which every check of tests/render-channel.verify.mjs passed, in a commit of
  // their own. No hash above or below moved.
  "steam, timeline game": ["db1c0c11b440a0139ef145e453a54ff9a11be91137880c02fd993d871f9cd523", "24e67ee3e90c89327968a3fa82b684d25814229f1748f241572f59bc2c3a1666"],
  "steam, timeline game at 66.67 fps": ["97ebecf35afc68d5c720ec9be9a0aff9023767a9076b1630e78d53e67e5b9fd6", "68f9b546b144b514296a06609cea831e0013c3d2d946931318564c13da0fc0d3"],
  "steam, timeline game, gate off": ["ea76f4c7cd259bff8437dd88cbb1b288c5d1e97887a1326f4eef2d408bf7c4ce", "1784d3eb7f4465b1e26b0239e326a3de4d45c8a9d3a1b6ed030f981d7a1ca8af"],
  "steam, timeline game, loss 15%, jitter 50 ms": ["5432962ca2b78d46d88687f0867ed8a01fb3439e7c13a76c7b328a89ccd897e6", "c4072eb19bc3e1c19d8223dbc744afde42a4110d758fccfbd1d61664a78985d3"],
  "steam, timeline game, auto-gain off, voice_scale 0.5": ["3c2b537ebdee6fdd5e90db330db01eb8e1f150c969e22602b9e890141d6a6fa3", "cb332705dcfd7f01106d64cb073b7973344beed91d4210018caa899140bb0a07"],
  "steam, timeline game, device at 44100 Hz": ["13b29eb1917a4023004485234f85d3f82fdc512c9663e675fad08c29653da9da", "24e67ee3e90c89327968a3fa82b684d25814229f1748f241572f59bc2c3a1666"],
  "steam, timeline game, room: preset 6, seed 7": ["eedd9f692dc1e7ef025791c5b099190c79625bc215e209754f9d340446d11305", "e37709220af8ab01663bcf59df470e2c66e87c675e41ecfe01f341fdd5354ad9"],
  "steam": ["76540a092934691569640e1c30b7a8ab5d2b6879f5eeec2e6c13e3597a82f452", "3ce698398c8f9ab3c7a6bc611176e6440ee06a9afe7753d75620212b7253969c"],
  "steam_48": ["cb106e3f224599e2a7d6bb5d8b3cea9092d99c91a8d9b736f5248d80a819e483", "f2d0bc919678d26d9c0893d1a49a20ff1aed231910a8600ddf95fb83cef1f08e"],
  "celt_22": ["8cc3cb51c948a21b6257e07495b5ce2ccb9871297d43561431d7b2ab4baf9142", "9bd2fb89789a272ca4c6ed7467eca4d5454d368133a14441b04c8d91c7c36573"],
  "celt_44": ["130a4e3a0116fc955eb639ecf931bde8558bf4552ecfa4134bad2d5614d8818f", "3c1c8b31ad9e977030b54e7a629670e6ceca9a3f9a16298f5e87a5e23671866c"],
  "speex": ["f93a46c4fb737c9121dd498cfc27c7723d8041ee4569f73ba941e88d7842c304", "84f3baeb535d4cf1a04749100ac193c393ae0ad3d9d1dd6ae5fb13e07a0d8f90"],
  "steam, gate off": ["45fc0362769d27cd04d9673e8a9dff0653033e409698fc625de796be3698bf3e", "ecf7acb8401cbe0f00b4d99adcb03c5e315c97c4e024cc6aec16425e94adde6a"],
  "steam, gate on at -30 dBFS": ["c31945116988a363187049edb77290044effea0e4eb6cbecda0e3ef2dd539628", "ce30c674faaaf75335befa7a88c2d9aa6b63252e9a88edf7ace5cdac781d4996"],
  "steam, codec bypassed": ["8b9bbd78568debf709476f3965984385bc0204f43a876ca995d9406a6a170d42", "810a49448ad689b02b1555c661fba6262bb81ba529de20ea502e56251f2df335"],
  "steam, high-pass 250 Hz and low-pass 3500 Hz": ["95f7c7fad8ae76ec618947d0c1b036d9ebe09b98cc4ccfe1c963c63a490dd3b3", "4149089027a85d388a229c9813aaf05176732a707df89946cbe98ef6cc252b64"],
  "steam, mic gain 4 (capture clipping)": ["d6e532662ea576785b0eacadc34618b183817af156380ae46911d65c944e7334", "8631fdde88a2766cf4aada6843e5337698d70e1bfdb297a05972d5a5b9411c7c"],
  "steam, auto-gain off": ["c1759635f2135e7c8c5cd78adce2926900f0bf441291ba89b89fdaf85a142706", "1ff77d4613b2094b26631b3ae481bfe73a5f662aa0e4352d991bea9c0f59935f"],
  "steam, voice_scale 0.5": ["b638e97afca1747bc210495c7d08f35cca69d386ed732a820ddcd45a631b897a", "c378390db84a813b2ee105964fbb028f900c9c9c9ab53ec790cce0d7903c16e0"],
  "steam, voice_avggain 0.25": ["4d5f6482734786bb08ea04e68c4beaf91f5ec0cab3d625bb52321c8243fb6657", "c378390db84a813b2ee105964fbb028f900c9c9c9ab53ec790cce0d7903c16e0"],
  "steam, loss 15%, jitter 50 ms, net_split 40 ms": ["b9cd2d89286be27d9e4e85e8889b3869cb2ddf6786794ebffec22a9905c5bb62", "c00cace6c1f1fd0946584f318de3442cac20b831f83526174f586fecbf078eed"],
  "steam, source at 44100 Hz": ["af5934f52e9c10ee87831ef3204d2e06f3a0357bb4e52abb6fdbeec63e954c8a", "14266896b00911caa3a387536a993b6caa43ff555d4869eb7a9740de60685caa"],
  "steam, source at 96000 Hz": ["fa9b89a4ae682db14fbbf0b1dab1d964393067a88fcaa892137e4f28b8b29662", "c4d0ccb44df5f9ba7eda53d665304ea55ac39f134f64c9a137444f5ea0fbae94"],
  "steam, source at 22050 Hz": ["adb7421af76506fa22733d167a4dbf1a2db495e5806c2bd587536bc3189040b5", "42ff4c6ca5240166b46170edcf8b89f22be654d40960ead4991ab97cc83a754b"],
  "steam, 1,000,003 samples (a prime) at 48 kHz": ["a5a47a14e8538947ddfdacdf614a663102f09e6a6648f1b98d0a0e8841c101fc", "a03c3ba180ad9967800d28705af8bfa82272c000004a24ebc3b813f01cdd2e87"],
  // W3-26b, test 3: the steam capture's converter streamed from 44,056, 16,000 and 96,000 Hz, recorded with the moved hashes.
  "steam, the capture converter from 44,056 Hz (not rated)": ["0b00bb6e8ac5ecea0aabb2861be068505024cbe9b20f9355e4531df7eb83dc86", "cc632bfbd8658cf0ddfadd1865da349d07e9452985c91f5e23d782c5a42bfbc7"],
  "steam, the capture converter from 16,000 Hz (below 24 kHz)": ["84411126e2b7e15f1eaf3214f3f388c8c37733528e26dc907a0e473515f11c67", "491bbc451bb8ba9af639af9292ae435bf414059355af54f5f2a4b1ce9d553377"],
  "steam, the capture converter from 96,000 Hz, 8 s": ["e28daf3205d45236ae00ff66715bb4b8d3dc8f50df8cc5b69dc53a89820ac41c", "ed48586e4db250f066a44a57e04051fdcd448ed1fa64978cadbca7c044e12ae6"],
  "demo voice as received": ["cedfd94434a7e342b7f3a3cc78c1c88c023f8e04facb0471ef16e7a58527a03c", "ffd2b8850430d49b04e086cbf71d8b281e5018468b93980e8c903882e86857bd"],
  "steam, 1 s pushed a sample at a time": ["e85a14c5dbe625ddc9339cb18a4a7fdcbff2eabffe757e9d54525190f0294be2", "f25716e04cf470d35e49e96d2df98e894846baaddc35529cf6bd71613d46a266"],
  "steam, six minutes": ["83123a05fc25d020886d7cdf251ff1e940f74c11a15c7f59bd09dbea202a5151", "8c5e6fcab76549d985f114f88b1895a84bf2e386e37a5a6ed033e220cc867977"],
  "celt_22, gate on, loss 15%, jitter 300 ms": ["302c6f9610826f85d913b4351aa261f4e4f7055003d12b0f8fab38b92c933012", "0b575fca37ebf68ae116815c18a1f77f11fd1a4990f620892c1aad3b28ec8c4b"],
  "celt_44, gate on, loss 15%": ["4857d88188fec06e658f6cf80a24a52c53e2cf129ac1a49d2700d1a208f1e8f6", "4face18f89426f7e520f9e687eef9ae7d0aa994fd11d0a71d0bdf3e730bb7aab"],
  "speex, gate on, loss 15%, jitter 300 ms": ["732897e85b9c12b748c4436f405a8495221a1094b253232696a8f229b4a5706e", "479d2149a32db551af6623328cbf7ed1e9c5b4579e5cfa102a2278201fc8578c"],
  "steam, jitter 500 ms on the file's own timing (does nothing)": ["d1224fee79fd25a5d7eaf81496b69bc3626569b8412b284173a810805e21a030", "d1797971500e6cc9ff4f24c51772a1f174563705970efe7e23b7e29a138e5d14"],
  "steam, snd_bits 4 (SILK frames)": ["b97d6c7f79305724583283b2a908ad1fd524fd40c47ead8f5d9e8d7729bad923", "379a57efc4bfa4f881b9d9a19be05a531c6d879701c1bd9fd5300ecb3b4d7de5"],
  "steam_48, loss 10%, jitter 100 ms, snd_bits 10": ["5e5ce262e57ec4f9a06a7858a5f875b9a621b99f3cec7912c4460db26c6125b9", "06decdb78d78b561d40c522b901ddc0d374ff401fcd45a02676705bec3ea3a02"],
  "steam, source at 24 kHz": ["ae09d0508b863ffdefd4d84aa4b7f2e3f89a6af68a53a8954209bd0cf5d8b9ff", "8c6110982151edae87c29105de8f14879bc0474bbe1498d7615a622b7e52763b"],
  "celt_22, source at 22.05 kHz": ["1befc25d8d501cc74b1de048bf577f4a3877624304bf5d071dcbc4fc7d9af80f", "9b67647157556b164aa32ad69d116915e881ce1d41cd76a6c832559d126710a2"],
  "speex, source at 11.025 kHz": ["f2c38164a1b3655c93d456f4a8f3cdd58eb22dde87807a2a7480a5ade7ba6ffd", "41787e0c606f0f7a809b62b8f250db41a1f2069af26ad28e90af0eb815707665"],
  "speex, source at 8 kHz": ["3c4058aebb5db410c461bb20837bb6d31b1a6aa2547c9e6a5821b735cedee1ac", "41787e0c606f0f7a809b62b8f250db41a1f2069af26ad28e90af0eb815707665"],
  "steam, volume 1, voice_maxgain 3": ["b939ceec1bac501aecc3eb696a8d17a5003ee2d6654a56684337925a9d2cfa41", "d1797971500e6cc9ff4f24c51772a1f174563705970efe7e23b7e29a138e5d14"],
  "steam, volume 0.3 (a volume whose product rounds)": ["d82e3a099211d7d5cb1d2cf7ce5ace45f033df00e02430e9b67d238479236b9c", "d1797971500e6cc9ff4f24c51772a1f174563705970efe7e23b7e29a138e5d14"],
  "steam, auto-gain off, voice_scale 3": ["b397b5c4e369447002f3e5d2b537f477680ee0790d55bb253c1c40d1d26c7b86", "f770231a190faf83a83976093c3a5a30b739f10f674cf25ed900bfa2eca004bb"],
  "steam, dsp_room 1 (no effect)": ["d1224fee79fd25a5d7eaf81496b69bc3626569b8412b284173a810805e21a030", "d1797971500e6cc9ff4f24c51772a1f174563705970efe7e23b7e29a138e5d14"],
  "steam, custom room at mix 0 (no effect)": ["d1224fee79fd25a5d7eaf81496b69bc3626569b8412b284173a810805e21a030", "d1797971500e6cc9ff4f24c51772a1f174563705970efe7e23b7e29a138e5d14"],
  "odd options": ["5f3a1a4192524207b01d3a41a9a864c8c64e155e8b399af8557c773a79c5b867", "7790084d71e2ef3e58a1a20a6349a3227fbb302f344f0d6dc4b191506d3c266b"],
  "test profile with a decoder EQ": ["ce6cdf0405cdd3b8361683887c9ba147c0ab852fb7d7f5525747722e6fd795ed", "826fed0c07c793049cbe665f42068222a0d9a397e030306e977ad2213f52856a"],
  "steam, empty source": ["531cd597b25052b4845ef2f3887dec2183240802a93b6e044960de8ba017caa0", "a8aaa71a85416c4d7d34dbfd5bc2318c4470880c51ae197f8963b18978d1817f"],
  "steam, gate off, loss 80%, seed 1 (long runs lost inside a spurt)": ["f1d603fafecb49e179c3c618ba7f942f2caf013760fbdefa52639f0674213d9d", "5dcab585850d3569716beb2965251450c077655121e4a34c89576b63f2c3b0fd"],
  "steam, gate off, loss 40%, seed 3 (long runs lost inside a spurt)": ["0ae4702ed6b2686de5fd61dbc2f5e77e549e7f43bdcf7d1e7ef3d95d0745a58d", "7bcb82d6e4290c5e148be654fb46ffa1839af3e6c4142434d9f5bab789f23dbd"],
  "celt_22, one sample at 22.05 kHz": ["d16bcaf5ffe07bcf982a161469d1dc9aff4f5d3c606ec408c0071893e6c34ad9", "eb96641cf9ac28d1e20117dcbb88da71d51d3cc4d94394ed8db507c1ad29ce32"],
  "speex, 100 samples at 96 kHz": ["5eae3af6f9b58664dfbd497083689b6ee2555d4b8db3087da2ccd95d660ebc98", "e66f178a6e1b38a504c0806750fd7df1cd70281e04f3656c26a4ecf98f8974da"],
  "celt_22, voice_maxgain 1": ["2c669b8273e98667d984c2664c1e0b9a8c62b68d11a2bda46d57da0e11402839", "9b67647157556b164aa32ad69d116915e881ce1d41cd76a6c832559d126710a2"],
  "celt_44, voice_maxgain 1, gate on": ["9baf28ced1a421d8eb930dccdbb657b7166a9f4fe347ee2d05485ca0e4c824b5", "69bfabe6d693e11d1f24a18e54c8f859d2b037a178a006d682da00e26970271c"],
  "speex, voice_maxgain 1, gate on, loss 15%": ["caea3afdfcf22a35a9ef1c5ad4901fa03c7e2c12f2955b5267b0d9e9a684e720", "8ad2ba901507b7bb789da1640bd75ae31030abbf43acc287d53565bf6e5071d6"],
  "celt_22, auto-gain off": ["2c669b8273e98667d984c2664c1e0b9a8c62b68d11a2bda46d57da0e11402839", "75e87f1ae98592ac715d9df84f113f03a394b0dd3bc2db6395e248e74270d7f0"],
  "speex, auto-gain off": ["464708d2ee000726b7a8c6207213a4c58ae5e1baff4f6c38204353581a303942", "e09f64118c40ee075f889a916162de4334a3bca400233fcda302dc646d1c56a1"],
  "miles": ["34e380ce9b0ca2fc87dbcbbc86b2b2da3eab5a4443f99a78e4db3952130b5762", "bae44dbb31ceaf49bece3e1c1d0ef12973dff0a37958017d4a4459d3fa86c9c0"],
  "miles, gate on, loss 15%, jitter 300 ms": ["029d9c7f8a232feb781572d51f23ae0ad0f840e1845f46ddd5a60a86007a1042", "f8e7c3265f0a82af91beee2def97c7f23234019fda98bb86d25f00ebf9c61cff"],
  "miles, loss 15%, net_split 40 ms": ["294db754f1eb7315726c77d8ceb64dca40258772fc24148cd5c6ce16d90c75a9", "0fddfd7a8c18b3f5ea7ae9ce60231894752fe106e2f0538c1ef246e865ecf94d"],
  "miles, source at 11.025 kHz": ["5390c0d2d1bbf235822812a521bfa8d54680e0d0db755de1cdaa18d3486b1a55", "287dd4f4e2da9b6128500a61e804604d6089916be485c20f2854770386ff49a9"],
  "miles, source at 8 kHz": ["a4911fb7124bb5c3dc488552ccfefb95720f5024215079149827bafa41e34bca", "287dd4f4e2da9b6128500a61e804604d6089916be485c20f2854770386ff49a9"],
  "miles, 100 samples at 96 kHz": ["d0ecac18c80cdcd89e4886cb09250ef382184643379d6bce996ce00cc4327e25", "8841b76a34de8756e4a36b23a4050070288033c5f6dfea0661fe2d9f5ef3339b"],
  "miles, voice_maxgain 1, gate on, loss 15%": ["88dd402c87a5efef714b1066d7ab1126482981f4c95d66e354e4840e11a888ef", "fbaa48443545fa715a1bece6517994d6c3b6bac2dea9f53b7725ca5fc7810dae"],
  "miles, auto-gain off": ["f3c25fde1d33be115865f2ed6a0bbc8584047cd63716bd0d460e7181aa3cc2e2", "9c237e99c7c3a8e2e668d4715c5912933fc4aae63edddd54c05f2670aa951c24"],
  "steam, 192004 samples at 24000 Hz (an output length of 352807.35)": ["802c334c65d79273d91a3a638abddb695c7a1e0a4c96c4b61cf213ac2fe48392", "5a39ee662f02e542ff2330fa3f0d538958a57b2cbbddae03071dcf095a87eb84"],
  "steam, 256007 samples at 32000 Hz (an output length of 352809.65)": ["5ee5a718bd7e32d8556e24bfc37a0983d69725770223e7419374465bcd2a6254", "9975e2c2ac62324f834220e2edc5c6851af40890b7c1f18626b26110cf4a22fe"],
  "steam, 302401 samples at 37800 Hz (an output length of 352801.17)": ["c58d733fbb235502528ceecd55aa952c27b480c0042a1bcd570f27f3107301b9", "8b20af6b7f09c686b28ac3b3bc0334c09f1a4bd0fcdfaba9d4420c9a11cee2d0"],
  "steam, 88203 samples at 11025 Hz (an output length of 352812.00)": ["c0e7ca731350a4c5c93ce66789869fc68dc60da22ffabbec9da0e74cb9a90022", "43a87bf3536986c0169fbbcb144511736688050b4323100e466ade6f76a7f640"],
  "steam, silent but for a quarter frame of sine at the end": ["0e7551d1a6a29d2465b83e4719334870fb0135c31f2d4e921511bfdde1841712", "a2735f316ac6640c3218fc07b539a03ce00498a00bc401678dbea87c1bae5769"],
  "steam_48, silent but for a quarter frame of sine at the end": ["0e7551d1a6a29d2465b83e4719334870fb0135c31f2d4e921511bfdde1841712", "a2ab787d46a1cdf2a53b25fdb56752994849a33fc9af2ebe979bfcd5fa32ecb1"],
  "demo voice as received, past full scale": ["29fa4ca146921e4bff09bc0d8f621bbaf91983be531276c72272a800f56622fd", "e6a7ce0f09e5683c1726bbea1d2500d2aaebf930359a22246c73eeb4a1325eb6"],
  "steam, room: preset 6": ["3f335778262626d54998636f735df7a869ed558824e1aa6d37802784c00611bf", "531da58448faf47675827b2248e9ddc38ee352cb813fed04b609a0dea63d1dc9"],
  "steam, room: preset 17 (random taps)": ["cd17b95b52e62f68755a99a699d5229b607bac6c1a87f357bad7ce4eac77a678", "3e73177b892b3c02c734bac5a4827c6fb0b0a31ed0c062f8bfad408a7d97ec8c"],
  "steam, room: automatic, tunnel": ["dac23bc9a43a5fd111018f9ea4a98a987691eb4c1242c33e0deae52ac6b37767", "95ed6357e6d27a390b70eb8e378781f0ea1f1198ef7fc7d8af47c497101fda42"],
  "steam, room: automatic, great_hall": ["927f652489f7324cbd9e5eb41610acf5022a2bff834d8a888addb5596d53c9c6", "dc3e4fb25591028c2109707a601c1896033e6279034a169dec5c149e1699cb16"],
  "steam, room: automatic, set_c_room": ["30b44497b5e06e8f9beac28db7cd337ec9f0e0fe66d1fb3251da49ac6dc9ad99", "805c61fd78c137e94b793e5f9094f89cea4faae860bc80da413afec7fc076f1d"],
  "steam, under water": ["ef5020f39a032b3e0cf7aafdf9f894c2927ddd1dcbde87a636a5b2605fc3cb98", "7cb86aa131d480db0e766792a618b0b48eb46d49454e10ce2d156954f0c35d13"],
  "steam, under water, preset 6": ["d799d0b8c3ba87372484a42b80ae6bbc4a98889dd51888f0c54f489add3184ad", "80beda24c4e2ff40791e6147a19585c4a3ebedd043d1995121c7e3846626e2e4"],
  "steam, custom room at mix 0.3": ["14b2edc133afc4a5b0ef457034f2ce651217e82c49e9af1f651b9271ca4c5836", "13de4fc2aaecba0708fa4bc4473981ceab68c2e913a0cf8056025b761b8b5ac3"],
  "celt_22, room: preset 6": ["6a6382078f2f52bf57befe64b921ef36caa8f30e07317b18773422e096d98ccb", "ba4e531902cc0467c08d674a260cbcb33e010d08dc767681527122be8ce2beda"],
  "steam, listenerPos tunnel (preset 6), loss 15%, jitter 50 ms": ["45494ce8589f618772b9b91c0882e4ddde7c442447d84baaf5e2efe95a61561b", "817e5d9b35853da87d200600158f57ae86e2730037ebd839340bbe00e3e77d1f"],
  "steam, dsp_room 137 (no room)": ["1ede6f18950a9e5bd62a2ca025dcb6d8982fceace5ea8f30e004fad8203d0060", "c9d102c588681e53b6f820903f6043c9e6eaecc440e1357212d99ee727c42138"],
  "steam, room: preset 17 (random taps), seed 7": ["ced3be62e90d31ba75bcbb1273466707373cd0cabce663793624745fa0a3618a", "a4f69a192f17befac37b9191b709411e6dfc031d96d2ccb32b9e0425d950e5ba"],
  "steam, room: preset 6, device at 96000 Hz": ["6eefed5cfe4edc7982fb7f6541bcfc0eafc00ea591042da807f8264d4b910a67", "531da58448faf47675827b2248e9ddc38ee352cb813fed04b609a0dea63d1dc9"]
};

// The control of W3-10 (docs/work-orders/W3-10-output-stage.md, "Golden
// hashes"): the SHA-256 of each case's gain output, the Float32Array that
// process()'s onGain hook is handed at the mix point (every profile since
// W3-10's first commit), as little-endian bytes. Recorded with that hook
// added and nothing else changed, before the output stage was rebuilt, so
// a later change to the stages after the mix point can show that what
// reaches the mix did not move. Never re-record them for a change to the
// output stage; a change before the mix point re-records them in a commit
// of its own that says why.
const GAIN_GOLDEN = {
  // W3-02g: a demo's own packets on the game's timeline.
  "demo voice on the game's timeline": "a144401c71c91c480a8d9bd0d5472d6293a2f766c1ff84be7a5fc33fcc48f5e5",
  "demo voice on the game's timeline at 66.67 fps, auto-gain off": "42ebf4e2789b759267f67c353f33e6d9aae1c18a21e5ac3815c87ee4913b0f7b",
  // W3-02c-2: the renders on the game's timeline.
  "steam, timeline game": "e67cedddb735689efdf9f26eb49e4beda4cdc1b3fb94b733268fbfbba8ac6c69",
  "steam, timeline game at 66.67 fps": "e739da1fb3d3191aa4959aa0830b9f34b9e4bbd2f3263d845f91c4fe28fc1a6a",
  "steam, timeline game, gate off": "1c4b21a9a16c237b39bf4c1788cfda3637654e0bf47c402b7044f4eeae40a75a",
  "steam, timeline game, loss 15%, jitter 50 ms": "7fc42175ed367b20a5a16e2ff4ecb85dd61b88d880abbe152f1cda735c430e3e",
  "steam, timeline game, auto-gain off, voice_scale 0.5": "cc5da3cdafe5b0fdf33ea6f94360563db571f6e8da095ced84d7ee4104c37836",
  "steam, timeline game, device at 44100 Hz": "e67cedddb735689efdf9f26eb49e4beda4cdc1b3fb94b733268fbfbba8ac6c69",
  "steam, timeline game, room: preset 6, seed 7": "d9b6f80b5ff515a36aa4b5d95c0afecda878b00c11ec3a35112a300a5c10c500",
  "steam": "4c520eed16d09453fba64f964d3b756c4c1f608a2296962ef96efd853eed51bd",
  "steam_48": "67ae552c948f640673b3cc9e5f967228dc96f40010d21300b844a5d1e97b98dc",
  "celt_22": "0f1760425be904c6c334a026621ed737ddbcec4f384e90dc783b5cf16a75ce23",
  "celt_44": "c4fe90a8e00da5bf319fb21c1ed8ddc40f5e93f5dbf5935baf64e1e52c280fe6",
  "speex": "1bdccfbdf42abf0fa3d4761d82ecb013904232facb91ebb609e355486e1e10f8",
  "steam, gate off": "2c5249e877c24c131834c08a75f2483348f802624e597efc556eb1b89e8c408f",
  "steam, gate on at -30 dBFS": "5dc9dd759a80ad6f9b565e89ee9ae1bc5fcfec4a199b01c26f133f628aeb86c8",
  "steam, codec bypassed": "14902e758a56117e56e389f2f260f101ed6cdbdd4c36a8c93a95764127c691c2",
  "steam, high-pass 250 Hz and low-pass 3500 Hz": "6983f731eed22ff042efb94000c6025c95dc0e86ee4e1df754ee000ad1b2e79f",
  "steam, mic gain 4 (capture clipping)": "82f28ac6d7f8a0903c25661c840b3d033c4c642fe9ade403a1ef104003c3622d",
  "steam, auto-gain off": "a064674f1e7c8cb10a8859d26816e537edd0a49fc285ad58e0b8f442d374ee86",
  "steam, voice_scale 0.5": "06ab9e151ae4177197b6ede9a2835b8e618ca3cb1f126b2555e927098f3871a5",
  "steam, voice_avggain 0.25": "580a867fafd6ff12601494e55f86991fe7a0dda2a467b00b9c143c533c156729",
  "steam, loss 15%, jitter 50 ms, net_split 40 ms": "b18ffc4b14e6a1376160582a722bbb7215d0faf84990b4cf953790fbe7608eef",
  "steam, source at 44100 Hz": "f33c9b0901cb3cf5f1c918d91600a1b6af4836313a66a96439b18d13be33ee46",
  "steam, source at 96000 Hz": "a3a85ff688040b850b144311ac832b940a2bb8f0861a7aab8f12c0e70974d31e",
  "steam, source at 22050 Hz": "86e8510be6d5244d8cf66e931741087911c401d2541423e18b21050d8995e208",
  "steam, 1,000,003 samples (a prime) at 48 kHz": "3213c22079bc316238d35a0c56e147f1c7b9febb7cb6f8c6ac490c8c43881564",
  // W3-26b, test 3: the steam capture's converter streamed from 44,056, 16,000 and 96,000 Hz, recorded with the moved hashes.
  "steam, the capture converter from 44,056 Hz (not rated)": "722f6f859862db6bb00bd8fb1ec189dcb6158246fa8d12b357b062fe0b1c2332",
  "steam, the capture converter from 16,000 Hz (below 24 kHz)": "94c7f8e800c0f3fe3407b139f1605071ae77588d0197c304c26c6f6fba6a493a",
  "steam, the capture converter from 96,000 Hz, 8 s": "89f1161a6f5a9fac7ea2f3a18446db9df93af7b06dfb8725d69b6da286b9644f",
  "demo voice as received": "2c27d598935f09f2b919fabd94146d19b2479f080cea0ade3821b5e374383102",
  "steam, 1 s pushed a sample at a time": "ca6ae3efbce811acef5b86fe9a68292dfe61bb30c42b7ebc28ccb14ee0e35637",
  "steam, six minutes": "6baf9f2c81e7f9899acbf391dca96f9d60e570fbb304b08653b974703b706a3f",
  "celt_22, gate on, loss 15%, jitter 300 ms": "49d594aa6f0caa9490066ed6ae1742c15063326002cd8836fd9d88f07c300f11",
  "celt_44, gate on, loss 15%": "a887ab28283d73ee61018636afe804942bf998c59a6ff75e8ec01f8885a40c6b",
  "speex, gate on, loss 15%, jitter 300 ms": "e7bfb2524f39f29b794443969bab51d41b797aacc4254d735d3803c768fa6aa1",
  "steam, jitter 500 ms on the file's own timing (does nothing)": "771d81b5d50c242f50d4b5383262b63e4bb7c742cec71ceef3f9428123267e66",
  "steam, snd_bits 4 (SILK frames)": "1ffed86dbf912c6cf4ad5e83684f2089ca3e0926a905e0cde7be9ac142746d1d",
  "steam_48, loss 10%, jitter 100 ms, snd_bits 10": "60a29df9af7e58794da2e2a0f463a879d3e534cb393ef1fb4adf70c235145940",
  "steam, source at 24 kHz": "1a5bdc865ee2c0ca4edac3dada11da66bf88c449b4ba01dca8277fa9da00b18c",
  "celt_22, source at 22.05 kHz": "37cc90ff07dd39d9f951bee0fce23d7ab5e9d4bbdffaa4c235eb2645805495c7",
  "speex, source at 11.025 kHz": "6d4ff782056d55f41ace12c18a2a844076353f078c9dd63afcda51bb5669d530",
  "speex, source at 8 kHz": "6d92c34e965cc721ae150a58b186fd4ee0148d16c4e7651803f78f4d574d7942",
  "steam, volume 1, voice_maxgain 3": "ac94546757ced458577b5e53b74b17ca1b22529d34f290c090a0647956944e2a",
  "steam, volume 0.3 (a volume whose product rounds)": "771d81b5d50c242f50d4b5383262b63e4bb7c742cec71ceef3f9428123267e66",
  "steam, auto-gain off, voice_scale 3": "9bef30efb72c767b778a3232476cda3ad64bd421acc038aa549d9e65752f0001",
  "steam, dsp_room 1 (no effect)": "771d81b5d50c242f50d4b5383262b63e4bb7c742cec71ceef3f9428123267e66",
  "steam, custom room at mix 0 (no effect)": "771d81b5d50c242f50d4b5383262b63e4bb7c742cec71ceef3f9428123267e66",
  "odd options": "5fd40002e1d5710ceb23809c2bdab93fff7accfc7c674a639770c25e3501149c",
  "test profile with a decoder EQ": "709d8696cdafca59de6854a5ffd9817ad85ce93a3ff858b83da55cb64b3a1189",
  "steam, empty source": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "steam, gate off, loss 80%, seed 1 (long runs lost inside a spurt)": "1cad2a26caedaa5baa5b7b1951e684e563ea38035ceab93fa0455f6ac2a115b8",
  "steam, gate off, loss 40%, seed 3 (long runs lost inside a spurt)": "9c205fb22490daf2644d67329dcc4ab6360fd82a9e9e80e274cba7f7b63d8f63",
  "celt_22, one sample at 22.05 kHz": "7ec2225478271c68195bba12ee36ff65c7e706f0886d0b05a86e8b2d18d7bebb",
  "speex, 100 samples at 96 kHz": "eae3fbcabcc943196634b7c1dfd48940c62e91f2c42abe4725845d49739891b7",
  "celt_22, voice_maxgain 1": "244966c198753c4fe6b309120edd95d5deb36fde2378a9cece96cec73b25f80a",
  "celt_44, voice_maxgain 1, gate on": "cec5e196b950aec7b5e62b4caee0f55d6d738149ccacd564ea002f5fe57cea8b",
  "speex, voice_maxgain 1, gate on, loss 15%": "3172a6c4e7475272a4e497f0cdbfe1b7a23ad570328e4082788b77c7e1932d7f",
  "celt_22, auto-gain off": "244966c198753c4fe6b309120edd95d5deb36fde2378a9cece96cec73b25f80a",
  "speex, auto-gain off": "f7371400ffd34ddb2e312029cc7bf37b5d224273ffcaec4bedcd2b7b815ecfe6",
  "miles": "365994ce07ae8cb75a3ae36815873d4c17cdee58abc2308a85cb0ca31ea33733",
  "miles, gate on, loss 15%, jitter 300 ms": "9c33c2e4245ebe4d79abd2b1dc1397d93fdff8beb1647dbb723349d4907952cc",
  "miles, loss 15%, net_split 40 ms": "e9936e476e6adb2a8ceba6e7c343186e3a75e7f7accaa0f472f81a3d156c5c55",
  "miles, source at 11.025 kHz": "1d349ac4a3e3cf153c1526f54d0aab1e9a17b8ae5c648f35d4d8cb3627e76a2e",
  "miles, source at 8 kHz": "26fa5cc2a52d15a9ef5406c8f4fde5a8c6e0d108dbb21209c04372fd2139db9a",
  "miles, 100 samples at 96 kHz": "edb4aebe22367a72fb3dc44672a31d6c018a31b11db1eaaa2582e0bb2e54755c",
  "miles, voice_maxgain 1, gate on, loss 15%": "663beb6f267484d58b3fed730c37a9dce2b58ab14a344fd9cfe431b74e9bca41",
  "miles, auto-gain off": "a7a8f07cb6716f76366acd622e60b3a1a6370df8d27e7c78e8cf6b985a7fb2d8",
  "steam, 192004 samples at 24000 Hz (an output length of 352807.35)": "e9d8d56a26e6408bbaf65b7bca3cd5eef6f8eef41dfee61e7fb0cbda787cffc5",
  "steam, 256007 samples at 32000 Hz (an output length of 352809.65)": "0ec1fb13169e7de720de4e338a22d2b284d1cee5e9dbc925f609573c079c7bc0",
  "steam, 302401 samples at 37800 Hz (an output length of 352801.17)": "f78012270cd473771e2a818cc236c8fd2e9caa6c2152e46b66455539a2682fa1",
  "steam, 88203 samples at 11025 Hz (an output length of 352812.00)": "5d0dff6ec202e3fac80c874a2339bda23d16b77b94453d26f9250c9c0415c35d",
  "steam, silent but for a quarter frame of sine at the end": "7c083cfbf0884b8b9232667bf60221dc226ae42757cd61b4e1fb7afc770f1ef1",
  "steam_48, silent but for a quarter frame of sine at the end": "7c083cfbf0884b8b9232667bf60221dc226ae42757cd61b4e1fb7afc770f1ef1",
  "demo voice as received, past full scale": "05a8491b26e4add98f106914427ab6f23bef798c32cb5ba8293c4fa37ba1f1a5",
  "steam, room: preset 6": "ca0a85e7301c4caee46269cc147250149228c022c2d756136ca79b945c612a26",
  "steam, room: preset 17 (random taps)": "ca0a85e7301c4caee46269cc147250149228c022c2d756136ca79b945c612a26",
  "steam, room: automatic, tunnel": "ca0a85e7301c4caee46269cc147250149228c022c2d756136ca79b945c612a26",
  "steam, room: automatic, great_hall": "ca0a85e7301c4caee46269cc147250149228c022c2d756136ca79b945c612a26",
  "steam, room: automatic, set_c_room": "ca0a85e7301c4caee46269cc147250149228c022c2d756136ca79b945c612a26",
  "steam, under water": "ca0a85e7301c4caee46269cc147250149228c022c2d756136ca79b945c612a26",
  "steam, under water, preset 6": "ca0a85e7301c4caee46269cc147250149228c022c2d756136ca79b945c612a26",
  "steam, custom room at mix 0.3": "ca0a85e7301c4caee46269cc147250149228c022c2d756136ca79b945c612a26",
  "celt_22, room: preset 6": "9e9ff38ca1d70685f73688c24adb0c80b14b16ef97b801f57d93657b4244a878",
  "steam, listenerPos tunnel (preset 6), loss 15%, jitter 50 ms": "53cf4d8a8c147bc89fd2b1e95edd42f1528b106139904e0c0ba6af7e7f447f87",
  "steam, dsp_room 137 (no room)": "ca0a85e7301c4caee46269cc147250149228c022c2d756136ca79b945c612a26",
  "steam, room: preset 17 (random taps), seed 7": "b10643d7f59d94b4d4987933186a1465c698e9a4863c44f72697c082b4e87baf",
  "steam, room: preset 6, device at 96000 Hz": "ca0a85e7301c4caee46269cc147250149228c022c2d756136ca79b945c612a26"
};

/* ---------------- helpers ---------------- */

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const f32Bytes = (x) => new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
// The pieces an onGain hook was handed, joined.
const joined = (parts) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((o, p) => { out.set(p, o); return o + p.length; }, 0);
  return out;
};
const joinedInts = (parts) => {
  const out = new Int32Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((o, p) => { out.set(p, o); return o + p.length; }, 0);
  return out;
};
const sameBitsF = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
// codecInfo as JSON with sorted keys and typed arrays as { Type: [values] }.
function canonical(value) {
  if (ArrayBuffer.isView(value)) return { [value.constructor.name]: Array.from(value) };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const infoHash = (info) => sha256(JSON.stringify(canonical(info)));
const buffer = (samples, rate) => ({ sampleRate: rate, length: samples.length, numberOfChannels: 1, getChannelData: () => samples });
const wavBytes = async (blob) => new Uint8Array(await blob.arrayBuffer());

/* ---------------- the memory check (--memory) ---------------- */

if (process.argv.includes('--memory')) {
  const minutes = Number(process.argv[process.argv.indexOf('--memory') + 1]) || 60, rate = 48000, MB = 1048576;
  const src = voice(minutes * 60, rate, 6);
  const t0 = performance.now();
  const render = await A.createRender({ sampleRate: rate, length: src.length, numberOfChannels: 1 }, pageFor({}));
  // A render with a room would add up to maxTail (0 here: the page's options, no room).
  const out = new Float32Array(render.outputLength + render.maxTail);
  let filled = 0;
  for (let o = 0; o < src.length; o += rate) {
    const y = await render.push(src.subarray(o, Math.min(src.length, o + rate)));
    out.set(y, filled);
    filled += y.length;
  }
  const end = await render.finish();
  out.set(end.samples, filled);
  filled += end.samples.length;
  const seconds = (performance.now() - t0) / 1000, peak = process.resourceUsage().maxRSS * 1024;
  const limit = src.byteLength + out.byteLength + 300 * MB;
  check(`${minutes} minutes streamed in 1 s chunks peak under source + output + 300 MB of RSS`, filled === out.length && peak < limit,
    `peak ${Math.round(peak / MB)} MB: source ${Math.round(src.byteLength / MB)} MB + output ${Math.round(out.byteLength / MB)} MB`
    + ` + ${Math.round((peak - src.byteLength - out.byteLength) / MB)} MB; ${seconds.toFixed(0)} s (${(minutes * 60 / seconds).toFixed(1)}x real time)`
    + `, ${end.codecInfo.spurts} spurts`);
  process.exit(failed ? 1 : 0);
}

/* ---------------- 1. golden renders ---------------- */

console.log('\n[1] process() gives the recorded renders');
const sources = new Map(), renders = new Map(), gains = new Map(), mixes = new Map(), madePaths = new Map();
const hashLines = [], gainLines = [];
const t1 = performance.now();
let roomSeconds = 0;
for (const c of CASES) {
  const samples = c.make();
  sources.set(c.name, samples);
  const t0 = performance.now(), gained = [], blocks = [];
  paths.length = 0;
  const whole = await A.process(buffer(samples, c.rate), { ...c.opts, onGain: (g) => gained.push(Float32Array.from(g)),
    ...(ROOM_CASES.includes(c) ? { onMixBlock: (start, length, mix) => blocks.push(mix) } : {}) });
  const seconds = (performance.now() - t0) / 1000;
  if (ROOM_CASES.includes(c)) roomSeconds += seconds;
  madePaths.set(c.name, paths.splice(0));
  renders.set(c.name, whole);
  gains.set(c.name, joined(gained));
  if (blocks.length) mixes.set(c.name, joinedInts(blocks));
  const wav = sha256(await wavBytes(whole.blob)), info = infoHash(whole.codecInfo), gain = sha256(f32Bytes(gains.get(c.name)));
  hashLines.push(`  ${JSON.stringify(c.name)}: [${JSON.stringify(wav)}, ${JSON.stringify(info)}],`);
  gainLines.push(`  ${JSON.stringify(c.name)}: ${JSON.stringify(gain)},`);
  if (printHashes) { console.log(hashLines[hashLines.length - 1]); continue; }
  const golden = GOLDEN[c.name];
  check(`${c.name}: process() gives the recorded WAV and codecInfo`, golden && golden[0] === wav && golden[1] === info,
    golden ? `${(samples.length / c.rate).toFixed(1)} s in ${seconds.toFixed(1)} s, ${whole.codecInfo.spurts ?? 0} spurts`
      : `no recorded hash; this run gives ${wav} ${info}`);
  check(`${c.name}: the gain's output (onGain, called once) is the recorded one`, gained.length === 1 && GAIN_GOLDEN[c.name] === gain,
    GAIN_GOLDEN[c.name] ? `${gains.get(c.name).length} samples at the voice rate` : `no recorded hash; this run gives ${gain}`);
}
if (printHashes) {
  console.log('\nThe gain\'s output (GAIN_GOLDEN):');
  for (const line of gainLines) console.log(line);
  process.exit(0);
}
check('every recorded render is a case of the matrix', Object.keys(GOLDEN).every(name => renders.has(name))
  && Object.keys(GAIN_GOLDEN).length === CASES.length && Object.keys(GAIN_GOLDEN).every(name => renders.has(name)));

// W3-17c. A render with no room and not under water makes no room path and
// has no `room` in its codecInfo (Decision 4); one with a room makes one
// path, for the render's first sample, with the render's seed.
{
  const noRoom = CASES.filter(c => !c.room);
  const bad = noRoom.filter(c => madePaths.get(c.name).length !== 0 || 'room' in renders.get(c.name).codecInfo).map(c => c.name);
  check(`no room, not under water: no room path made and no codecInfo.room, in all ${noRoom.length} such cases`, bad.length === 0, bad.join('; '));
  const rooms = ROOM_CASES.filter(c => c.room);
  const one = rooms.filter(c => madePaths.get(c.name).length === 1 && madePaths.get(c.name)[0].opts.seed === seedOf(c)
    && madePaths.get(c.name)[0].opts.water === c.room.water);
  check(`with a room or under water: one room path, the render's seed (7 in the seed case, else the default 0xC0FFEE), under water as asked, in all ${rooms.length} such cases`,
    one.length === rooms.length && madePaths.get('steam, room: preset 17 (random taps), seed 7')[0].opts.seed === 7,
    rooms.filter(c => !one.includes(c)).map(c => c.name).join('; '));
  // What codecInfo.room says.
  const r = (name) => renders.get(name).codecInfo.room || {};
  const sh = (name) => `${r(name).shares?.room}/${r(name).shares?.direct}`;
  check('codecInfo.room: preset 6 at 26/229, preset 17 at 26/229, the custom room at 76/179 with its knobs, not under water',
    r('steam, room: preset 6').preset === 6 && sh('steam, room: preset 6') === '26/229' && r('steam, room: preset 17 (random taps)').preset === 17
    && sh('steam, room: preset 17 (random taps)') === '26/229' && sh('steam, custom room at mix 0.3') === '76/179'
    && isDeepStrictEqual(r('steam, custom room at mix 0.3').custom, { duration: 1, decay: 2, mix: 0.3 })
    && [r('steam, room: preset 6'), r('steam, custom room at mix 0.3')].every(x => x.underwater === false),
    JSON.stringify({ ...r('steam, room: preset 6'), tail: undefined }));
  check('codecInfo.room: the automatic rooms by key, shape and classes: tunnel 72/183 (size class 2), great_hall 41/214 (4), set_c_room 41/214 (2, reflectivity 3)',
    r('steam, room: automatic, tunnel').auto === 'tunnel' && r('steam, room: automatic, tunnel').shape === 'tunnel' && sh('steam, room: automatic, tunnel') === '72/183'
    && r('steam, room: automatic, tunnel').classes.size === 2 && r('steam, room: automatic, great_hall').classes.size === 4
    && sh('steam, room: automatic, great_hall') === '41/214' && r('steam, room: automatic, set_c_room').shape === 'room'
    && r('steam, room: automatic, set_c_room').classes.size === 2 && r('steam, room: automatic, set_c_room').classes.reflectivity === 3
    && sh('steam, room: automatic, set_c_room') === '41/214' && isDeepStrictEqual(r('steam, room: automatic, set_c_room').pair, [102, 103]),
    JSON.stringify(r('steam, room: automatic, set_c_room').classes));
  check('codecInfo.room: under water alone at 0/256, under water with preset 6 at 26/229; listenerPos tunnel is preset 6',
    r('steam, under water').underwater === true && sh('steam, under water') === '0/256' && !('preset' in r('steam, under water'))
    && r('steam, under water, preset 6').underwater === true && r('steam, under water, preset 6').preset === 6
    && sh('steam, under water, preset 6') === '26/229' && r('steam, listenerPos tunnel (preset 6), loss 15%, jitter 50 ms').preset === 6);
  // The tail: under the cap, and the output that much longer at 48 kHz.
  const tails = rooms.map(c => {
    const t = r(c.name).tail, n = sources.get(c.name).length, R = renders.get(c.name).sampleRate;
    return { name: c.name, t, ok: Number.isInteger(t) && t > 0 && t < roomModule.TAIL_CAP
      && renders.get(c.name).samples.length === Math.round(n * R / c.rate) + Math.round(t * R / 44100) };
  });
  check('each room render has a tail under the cap, and is as long as the source at the device\'s rate plus the tail at that rate (48 kHz, and 96 kHz in one case)',
    tails.every(x => x.ok), tails.map(x => `${x.t}`).join(', '));
  // dsp_room 137 is no room: the same render as dsp_room 0's.
  const c137 = CASES.find(c => c.name === 'steam, dsp_room 137 (no room)');
  const none = await A.process(buffer(sources.get(c137.name), 48000), { ...c137.opts, dspRoom: 0 });
  check('dsp_room 137 (not in the table) renders as no room: the WAV and codecInfo of the same render with dsp_room 0',
    sha256(await wavBytes(none.blob)) === sha256(await wavBytes(renders.get(c137.name).blob))
    && infoHash(none.codecInfo) === infoHash(renders.get(c137.name).codecInfo));
  // The room comes after the mix point: the gain's output is the same with
  // any room as with none (the steam cases on the same source, no loss).
  const sameGain = ROOM_CASES.filter(c => c.opts.codec === 'steam' && !c.opts.lossPct && c.opts.seed === undefined)
    .every(c => sameBitsF(gains.get(c.name), gains.get(c137.name)));
  check('the gain\'s output of every steam room case without loss is that of the same source with no room', sameGain);
  console.log(`  (the ${ROOM_CASES.length} room cases' process() renders took ${roomSeconds.toFixed(1)} s of section 1's ${((performance.now() - t1) / 1000).toFixed(1)} s)`);
}

// The cases exercise what their names say.
{
  const info = (name) => renders.get(name).codecInfo;
  check('the profile cases open and close Steam\'s gate', info('steam').spurts >= 5 && info('steam_48').spurts >= 5
    && info('steam').gatedFrames > 0, `${info('steam').spurts} spurts, ${info('steam').gatedFrames} of ${info('steam').frames} frames held back`);
  check('the codec cases cover SILK, hybrid, DTX, CELT and Speex frames', info('steam, snd_bits 4 (SILK frames)').modes.silk > 0
    && info('steam').modes.hybrid > 0 && info('steam').dtxFrames > 0 && info('celt_22').modes.celt > 0 && info('speex').modes.speex > 0,
    `snd_bits 4: ${JSON.stringify(info('steam, snd_bits 4 (SILK frames)').modes)}`);
  const T = 32767 / 32768, loud = sources.get('steam, mic gain 4 (capture clipping)').filter(v => Math.abs(v * 4) > T).length;
  check('mic gain 4 clips the capture', loud > 1000, `${loud} samples`);
  for (const name of ['steam, loss 15%, jitter 50 ms, net_split 40 ms', 'celt_22, gate on, loss 15%, jitter 300 ms', 'celt_44, gate on, loss 15%',
    'speex, gate on, loss 15%, jitter 300 ms', 'steam_48, loss 10%, jitter 100 ms, snd_bits 10']) {
    check(`${name}: frames are lost`, info(name).lostFrames > 0, `${info(name).lostFrames} lost, ${info(name).underrunFrames} late`);
  }
  for (const name of ['celt_22, gate on, loss 15%, jitter 300 ms', 'speex, gate on, loss 15%, jitter 300 ms']) {
    check(`${name}: some frames arrive too late and play as silence`, info(name).underrunFrames > 0, `${info(name).underrunFrames} late`);
  }
  // BC-4: on `steam` jitter is when messages reach the game's voice queue, and on the file's
  // own timing it does nothing: the case renders as the same source and settings at jitter 0,
  // made here (BC-4a's fix round, point 4).
  {
    const name = 'steam, jitter 500 ms on the file\'s own timing (does nothing)', c = CASES.find((k) => k.name === name);
    const zero = await A.process(buffer(sources.get(name), c.rate), { ...c.opts, jitterMs: 0 });
    check(`${name}: no late frame, and the WAV and codecInfo of a render of the same source and settings at jitter 0`,
      info(name).underrunFrames === 0 && sha256(await wavBytes(renders.get(name).blob)) === sha256(await wavBytes(zero.blob))
      && infoHash(info(name)) === infoHash(zero.codecInfo), `${info(name).underrunFrames} late`);
  }
  for (const name of ['celt_22, gate on, loss 15%, jitter 300 ms', 'celt_44, gate on, loss 15%', 'speex, gate on, loss 15%, jitter 300 ms']) {
    check(`${name}: the gate opens and closes on the codec's own frames`, info(name).spurts > 1 && info(name).gatedFrames > 0);
  }
  // vaudio_celt_high is the 44100 Hz mode on 22050 Hz sound: its codecInfo
  // says so (and section 2 holds createRender's to it); vaudio_celt has no
  // mode rate of its own.
  check('the celt_44 cases report the 44100 Hz mode on 22050 Hz sound, and the celt_22 cases no mode rate',
    ['celt_44', 'celt_44, gate on, loss 15%'].every(name => info(name).modeRate === 44100 && info(name).sampleRate === 22050 && info(name).frameSamples === 1024)
    && ['celt_22', 'celt_22, gate on, loss 15%, jitter 300 ms', 'celt_22, source at 22.05 kHz'].every(name => !('modeRate' in info(name))),
    `celt_44: ${info('celt_44').modeRate} Hz mode, ${info('celt_44').sampleRate} Hz sound`);
  // Every 20 ms slot of the source is sent; since W3-11a the sender's frames
  // end with the source, so a slot whose centre lies past its end (the codec's
  // delay) can stay empty.
  const offInfo = info('steam, gate off'), offLength = 15 * 24000;
  check('the gate-off case sends every frame as one spurt', offInfo.spurts === 1 && offInfo.sender.gate === false
    && Array.from(offInfo.frameLog).every((c, i) => c !== 0 || i * 480 + 240 - offInfo.lookahead >= offLength), `${offInfo.gatedFrames} slot(s) past the end`);
  check('the six-minute case has many spurts', info('steam, six minutes').spurts > 50, `${info('steam, six minutes').spurts}`);
  check('the received case is the demo\'s frames', info('demo voice as received').backend === 'demo'
    && info('demo voice as received').lostFrames === 1 && info('demo voice as received').dtxFrames === 1);
  // The fix round's cases. resampleSinc's length gives what reaches the
  // output stage (here the voice-rate signal: the mixer and the output are
  // at 44.1 kHz), against process()'s rounded output length.
  const gcd = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };
  const sincLength = (n, from, to) => (!n || from === to ? n : Math.max(1, Math.round(n * (to / gcd(from, to)) / (from / gcd(from, to)))));
  const ends = [[24000, 192004], [32000, 256007], [37800, 302401], [11025, 88203]].map(([rate, n]) => {
    const exact = n * 44100 / rate, last = sincLength(sincLength(n, rate, 24000), 24000, 44100);
    return { fraction: exact % 1, short: Math.round(exact) - last };
  });
  check('the fix round\'s lengths: a fraction under .5 at 24 and 37.8 kHz, the output padded at 32 kHz and cut at 37.8 and 11.025 kHz',
    ends[0].fraction > 0 && ends[0].fraction < 0.5 && ends[2].fraction > 0 && ends[2].fraction < 0.5
    && ends[1].short === 1 && ends[2].short === -1 && ends[3].short === -1, JSON.stringify(ends.map(e => [+e.fraction.toFixed(4), e.short])));
  const tail = sources.get('steam, silent but for a quarter frame of sine at the end'), rmsDb = (from, to) => {
    let e = 0;
    for (let i = from; i < to; i++) e += tail[i] * tail[i];
    return 20 * Math.log10(Math.sqrt(e / (to - from)));
  };
  check('the quarter frame at the end is loud over its own samples and not over a frame, so it is gated',
    rmsDb(tail.length - 240, tail.length) > -39.5 && rmsDb(tail.length - 960, tail.length) < -39.5
    && info('steam, silent but for a quarter frame of sine at the end').spurts === 0
    && info('steam_48, silent but for a quarter frame of sine at the end').spurts === 0,
    `${rmsDb(tail.length - 240, tail.length).toFixed(1)} and ${rmsDb(tail.length - 960, tail.length).toFixed(1)} dBFS`);
  check('the received voice past full scale peaks above 1', sources.get('demo voice as received, past full scale').some(v => Math.abs(v) > 1.1));
}

// The vm load the suites used before tests/lib/engine.cjs gives the same renders.
{
  const B = engineInVm().audio;
  for (const name of ['steam, 1 s pushed a sample at a time', 'celt_22, gate on, loss 15%, jitter 300 ms']) {
    const c = CASES.find(x => x.name === name);
    const whole = await B.process(buffer(sources.get(name), c.rate), c.opts);
    check(`${name}: the engine loaded in a vm context gives the same render`, sha256(await wavBytes(whole.blob)) === GOLDEN[name]?.[0]
      && infoHash(whole.codecInfo) === GOLDEN[name]?.[1]);
  }
}

/* ---------------- 1b. W3-10's control: the spec's model ---------------- */

// A model of docs/work-orders/W3-10-output-stage.md, written here from the
// order's text and not from audio.js: from a case's gain output (its hash
// checked above) to the render's samples. The voice-rate value as a whole
// 16-bit value (nearest, ties to even, clamped); the entry,
// trunc(fround(s x 255) / 256); the upsampling by two, out[2k] = (prev +
// x[k]) >> 1 and out[2k + 1] = x[k] from state 0, once at 22050 Hz and
// twice at 11025 Hz, run on over a voice sample of zeros and cut to 2N + 1
// (4N + 3); the clip to +-32767, volume as a single, rounded to even; the
// device stage, y[n] = roundEven((x[k] (D - r) + x[k + 1] r) / D) with
// n N = D k + r (147 and 160 at 48000 Hz) and zeros past the mix; cut or
// padded to round(source length x device rate / source rate); over 32768.
// (Until W3-17c the listener's low-pass sat at the seam; it went with the
// old room code.)
//   W3-17c's room, by hand from that order's part c (item 4) and the room
// module (the order's tested statement of the room): the voice entered
// twice, trunc(fround(s x fround(255 x share / 256)) / 256) at the case's
// direct and room shares; each buffer upsampled on its own; the module's
// room path, made with the case's room (or none), under water or not, and
// the render's seed, run on the two buffers, then on zeros until its tail
// rule holds; the mix ends there, or at the voice's own end if the rule held
// before it; the output is longer by round(tail x device rate / 44100).
// Nothing of audio.js is used. (specModel is used again in section 2b.)
let specModel;
{
  const roundEven = (v) => { const fl = Math.floor(v), d = v - fl; return d > 0.5 ? fl + 1 : d < 0.5 ? fl : (fl % 2 === 0 ? fl : fl + 1); };
  const f32 = Math.fround;
  const upsampled = (mix, stages) => {
    if (!stages || !mix.length) return mix;
    const n = mix.length;
    mix = [...mix, 0];
    for (let s = 0; s < stages; s++) {
      const up = new Array(2 * mix.length);
      let prev = 0;
      for (let k = 0; k < mix.length; k++) { up[2 * k] = (prev + mix[k]) >> 1; up[2 * k + 1] = mix[k]; prev = mix[k]; }
      mix = up;
    }
    mix.length = (1 << stages) * n + (1 << stages) - 1;
    return mix;
  };
  // The sum before the clip, and the tail in mix samples.
  function roomMix(voice, c, stages) {
    const { room, water, shares } = c.room;
    const enter = (share) => upsampled(voice.map((s) => Math.trunc(f32(s * f32(255 * share / 256)) / 256)), stages);
    const direct = enter(shares.direct), wet = enter(shares.room), end = direct.length;
    const path = roomModule.createRoomPath({ seed: seedOf(c), room, water, table: roomTable });
    const parts = [Array.from(path.process(Int32Array.from(direct), Int32Array.from(wet)))];
    let t = path.tailLeft(), ruleEnd = t.ended ? (t.at >= 0 ? t.at + 1 : 0) : -1, at = end;
    while (ruleEnd < 0) {
      parts.push(Array.from(path.process(new Int32Array(512), new Int32Array(512))));
      t = path.tailLeft();
      if (t.ended) ruleEnd = at + t.at + 1;
      at += 512;
    }
    const mixEnd = Math.max(end, ruleEnd);
    return { mix: parts.flat().slice(0, mixEnd), tail: mixEnd - end };
  }
  specModel = function (gain, c, sourceLength) {
    const o = c.opts, num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const profile = Object.hasOwn(engine.CODEC_PROFILES, o.codec) ? engine.CODEC_PROFILES[o.codec] : engine.CODEC_PROFILES.steam;
    const volume = Math.min(1, Math.max(0, num(o.volume, 1)));
    const device = Number.isInteger(o.deviceRate) && o.deviceRate >= 44100 && o.deviceRate <= 192000 ? o.deviceRate : 48000;
    const stages = { 44100: 0, 22050: 1, 11025: 2 }[profile.voiceRate];
    const voice = Array.from(gain, (g) => Math.max(-32768, Math.min(32767, roundEven(g * 32768))));
    let mix, tail = 0;
    if (c.room) ({ mix, tail } = roomMix(voice, c, stages));
    else mix = upsampled(voice.map((s) => Math.trunc(f32(s * 255) / 256)), stages);
    const out = mix.map((v) => roundEven(f32(f32(Math.max(-32767, Math.min(32767, v))) * f32(volume))));
    const length = Math.round(sourceLength * device / c.rate) + Math.round(tail * device / 44100), y = new Float32Array(length);
    // Whole numbers (| 0: a zero has no sign here).
    if (device === 44100) for (let n = 0; n < Math.min(length, out.length); n++) y[n] = (out[n] | 0) / 32768;
    else {
      const g = (a, b) => (b ? g(b, a % b) : a), N = 44100 / g(44100, device), D = device / g(44100, device);
      for (let n = 0; n < length; n++) {
        const k = Math.floor(n * N / D), r = n * N - k * D;
        y[n] = (roundEven(((out[k] ?? 0) * (D - r) + (out[k + 1] ?? 0) * r) / D) | 0) / 32768;
      }
    }
    return { y, mix, tail };
  };
  console.log('\n[1b] W3-10\'s control: a model of the order\'s spec, applied to each case\'s gain output, gives the render (W3-17c: the room by hand)');
  for (const c of CASES) {
    const model = specModel(gains.get(c.name), c, sources.get(c.name).length), want = model.y, got = renders.get(c.name).samples;
    let first = -1;
    for (let i = 0; i < Math.max(want.length, got.length); i++) if (!Object.is(want[i], got[i])) { first = i; break; }
    check(`${c.name}: the spec's model gives process()'s samples, bit for bit`, first === -1 && want.length === got.length,
      first === -1 ? `${got.length} samples` : `${got.length} samples, the model ${want.length}; the first difference at ${first}: render ${got[first] * 32768}, model ${want[first] * 32768}`);
    // Before the clip: the room path's output (onMixBlock), sample for
    // sample, and the tail's length.
    if (c.room) {
      const sum = mixes.get(c.name);
      let at = -1;
      for (let i = 0; i < Math.max(sum.length, model.mix.length); i++) if (sum[i] !== model.mix[i]) { at = i; break; }
      check(`${c.name}: the render's room path is the module run by hand on the render's own 16-bit voice, before the clip, tail included`,
        at === -1 && sum.length === model.mix.length && renders.get(c.name).codecInfo.room.tail === model.tail,
        at === -1 ? `${sum.length} mix samples, a tail of ${model.tail}` : `the first difference at ${at}: ${sum[at]} against ${model.mix[at]}; tail ${renders.get(c.name).codecInfo.room.tail} against ${model.tail}`);
    }
  }
}

/* ---------------- 2. the stream equals process() ---------------- */

// Streams `samples` through createRender in the chunks `plan` gives (a
// plan's name, or a chunk size), into one preallocated array of
// outputLength + maxTail, as a caller with a long source would. Until
// finish() no more than outputLength samples come out (the length of a
// room's tail is known only then).
async function streamed(rate, samples, opts, plan, onPush = null) {
  const render = await A.createRender({ sampleRate: rate, length: samples.length, numberOfChannels: 1 }, opts);
  const all = new Float32Array(render.outputLength + render.maxTail);
  let filled = 0, pushes = 0;
  const put = (y, limit) => {
    assert.ok(y instanceof Float32Array && filled + y.length <= limit, 'the stream gives Float32Arrays and no more than outputLength samples before finish(), outputLength + maxTail in all');
    all.set(y, filled);
    filled += y.length;
  };
  const sizeOf = typeof plan === 'number' ? () => plan : PLANS[plan];
  for (let o = 0, k = 0; o < samples.length; k++) {
    const size = Math.min(sizeOf(k, rate, samples.length), samples.length - o);
    put(await render.push(samples.subarray(o, o + size)), render.outputLength);
    o += size;
    pushes++;
    onPush?.(o);
  }
  const end = await render.finish();
  put(end.samples, all.length);
  return { render, out: all.subarray(0, filled), filled, pushes, end };
}

// How a streamed render differs from process()'s, or null when it does not.
async function difference(whole, got) {
  if (got.filled !== whole.samples.length || got.out.length !== whole.samples.length) return `${got.filled} samples, not ${whole.samples.length}`;
  if (got.render.maxTail !== ('room' in whole.codecInfo ? Math.round(882000 * whole.sampleRate / 44100) : 0)) return `maxTail ${got.render.maxTail}`;
  if (got.render.sampleRate !== whole.sampleRate) return `rate ${got.render.sampleRate}, not ${whole.sampleRate}`;
  // Bit for bit, which is stricter than ===: -0 and +0 count as different.
  const a = new Uint32Array(got.out.buffer, got.out.byteOffset, got.out.length);
  const b = new Uint32Array(whole.samples.buffer, whole.samples.byteOffset, whole.samples.length);
  let unequal = 0, signs = 0, first = -1;
  for (let i = 0; i < b.length; i++) {
    if (a[i] === b[i]) continue;
    if (first < 0) first = i;
    if (got.out[i] === whole.samples[i]) signs++; else unequal++;
  }
  if (first >= 0) return `${unequal} samples differ and ${signs} more are zeros of the other sign; the first at ${first} (${Object.is(got.out[first], -0) ? '-0' : got.out[first]} for ${Object.is(whole.samples[first], -0) ? '-0' : whole.samples[first]})`;
  if (Buffer.compare(Buffer.from(await wavBytes(A.encodeWav(got.out, got.render.sampleRate))), Buffer.from(await wavBytes(whole.blob)))) return 'the WAV bytes differ';
  if (!isDeepStrictEqual(got.end.codecInfo, whole.codecInfo)) {
    const keys = [...new Set([...Object.keys(got.end.codecInfo), ...Object.keys(whole.codecInfo)])];
    return `codecInfo differs: ${keys.filter(k => !isDeepStrictEqual(got.end.codecInfo[k], whole.codecInfo[k])).join(', ')}`;
  }
  if (got.end.realOpus !== whole.realOpus) return 'realOpus differs';
  return null;
}
// The same at the mix point: the pieces createRender's onGain is handed,
// joined, are process()'s gain output, bit for bit.
const sameBits = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(f32Bytes(a)), Buffer.from(f32Bytes(b))) === 0;
console.log('\n[2] createRender, fed in chunks, gives process()\'s samples (bit for bit), WAV and codecInfo, and its gain output');
for (const c of CASES) {
  const whole = renders.get(c.name), samples = sources.get(c.name);
  for (const plan of c.plans) {
    const t0 = performance.now(), gained = [];
    let got, diff;
    try {
      got = await streamed(c.rate, samples, { ...c.opts, onGain: (g) => gained.push(Float32Array.from(g)) }, plan);
      diff = await difference(whole, got);
      if (!diff && !sameBits(joined(gained), gains.get(c.name))) diff = 'the gain\'s output (onGain) differs from process()\'s';
    }
    catch (error) { diff = `threw ${error.message}`; }
    const seconds = (performance.now() - t0) / 1000;
    check(`${c.name}, chunks: ${plan}`, diff === null, diff || `${got.filled} samples in ${got.pushes} pushes, ${seconds.toFixed(1)} s`);
  }
}

// Settings process() ignores here are ignored by the stream as well.
for (const [name, extra] of [['demo voice as received', { retime: true }], ['steam, codec bypassed', { retime: true }]]) {
  const c = CASES.find(x => x.name === name), opts = { ...c.opts, ...extra };
  const whole = await A.process(buffer(sources.get(name), c.rate), opts);
  let diff;
  try { diff = await difference(whole, await streamed(c.rate, sources.get(name), opts, 'uneven')); }
  catch (error) { diff = `threw ${error.message}`; }
  check(`${name}, with ${Object.keys(extra).join(', ')} (which process() ignores): streamed, and the recorded render`,
    diff === null && sha256(await wavBytes(whole.blob)) === GOLDEN[name][0], diff || '');
}

// Renders pushed in turn share the codec modules, not their state.
{
  const group = ['steam, gate on at -30 dBFS', 'steam, loss 15%, jitter 50 ms, net_split 40 ms', 'celt_22, gate on, loss 15%, jitter 300 ms',
    'speex, gate on, loss 15%, jitter 300 ms'].map(name => CASES.find(c => c.name === name));
  const runs = await Promise.all(group.map(c => A.createRender({ sampleRate: c.rate, length: sources.get(c.name).length, numberOfChannels: 1 }, c.opts)));
  const outs = group.map(() => []);
  for (let o = 0; o < Math.max(...group.map(c => sources.get(c.name).length)); o += 9600) {
    for (let k = 0; k < group.length; k++) {
      const x = sources.get(group[k].name);
      if (o < x.length) outs[k].push(await runs[k].push(x.subarray(o, Math.min(x.length, o + 9600))));
    }
  }
  const ends = [];
  for (const r of runs) ends.push(await r.finish());
  const same = group.map((c, k) => {
    const parts = [...outs[k], ends[k].samples], got = new Float32Array(parts.reduce((t, y) => t + y.length, 0));
    parts.reduce((o, y) => { got.set(y, o); return o + y.length; }, 0);
    const want = renders.get(c.name).samples;
    return got.length === want.length && Buffer.compare(Buffer.from(got.buffer), Buffer.from(want.buffer, want.byteOffset, want.byteLength)) === 0
      && isDeepStrictEqual(ends[k].codecInfo, renders.get(c.name).codecInfo);
  });
  check('four renders pushed in turn (two Opus, CELT, Speex) each give their own process() render', same.every(Boolean), same.join(' '));
}

/* ---------------- 2b. W3-17c: the room's blocks, entry and clip ---------------- */

console.log('\n[2b] W3-17c: the room path gets whole mixer blocks; the entry is the module\'s; the sum is clipped');
{
  // Every process() call of the room path starts on a block's first sample
  // (512 x i from the render's first mix sample) and is a whole block;
  // onMixBlock's blocks start on the same samples (its last may be short,
  // and the path may have run one block past the end), in process() and in
  // the stream at chunk sizes 1, 127 and 4096, for a voice at 44100, 22050
  // and 11025 Hz.
  const speexOne = { name: 'speex, room: preset 6 (1 s of talk, not a golden case)', rate: 48000, opts: pageFor({ codec: 'speex', room: { preset: 6 } }) };
  sources.set(speexOne.name, voice(1, 48000, 12));
  for (const c of [CASES.find(x => x.name === 'steam, room: preset 6'), CASES.find(x => x.name === 'celt_22, room: preset 6'), speexOne]) {
    const samples = sources.get(c.name);
    let whole = null;
    for (const plan of ['process()', 1, 127, 4096]) {
      const blocks = [];
      paths.length = 0;
      const opts = { ...c.opts, onMixBlock: (start, length) => blocks.push([start, length]) };
      let samplesOut;
      if (plan === 'process()') { whole = await A.process(buffer(samples, c.rate), opts); samplesOut = whole.samples; }
      else samplesOut = (await streamed(c.rate, samples, opts, plan)).out;
      const calls = paths.length === 1 ? paths[0].calls : [];
      const whole512 = calls.length > 0 && calls.every((k, i) => k.start === 512 * i && k.length === 512);
      const aligned = blocks.length > 0 && blocks.length <= calls.length && calls.length <= blocks.length + 1
        && blocks.every(([start, length], i) => start === calls[i].start && (length === 512 || i === blocks.length - 1));
      const same = plan === 'process()' || sameBitsF(samplesOut, whole.samples);
      check(`${c.name}, ${typeof plan === 'number' ? `chunks of ${plan}` : plan}: every room path call is a whole block from a block's first sample, onMixBlock's blocks the same${plan === 'process()' ? '' : ', the samples process()\'s'}`,
        paths.length === 1 && whole512 && aligned && same, `${calls.length} calls, ${blocks.length} blocks, the last ${blocks.length ? blocks[blocks.length - 1][1] : '-'} long`);
    }
    if (c === speexOne) {
      // Not a golden case: the by-hand model of section 1b checks it here.
      const want = roomModule.shares(roomTable[6]);
      check(`${c.name}: codecInfo.room is preset 6 at ${want.room}/${want.direct}, with a tail`, whole.codecInfo.room?.preset === 6
        && whole.codecInfo.room.shares.room === want.room && whole.codecInfo.room.tail > 0);
    }
  }

  // W3-10's entry function against the module's statement of the law.
  for (const share of [256, 229, 26, 23]) {
    let differ = 0;
    for (let s = -32768; s <= 32767; s++) if (A.mixEntry(s, 255 * share / 256) !== roomModule.entry(s, share)) differ++;
    check(`mixEntry(s, 255 x ${share} / 256) is TF2Room.entry(s, ${share}) on all 65,536 16-bit samples`, differ === 0, `${differ} differ`);
  }

  // Where the tail rule holds inside the voice. A voice that ends in a
  // silence longer than the room's tail has no tail: the rule held before the
  // voice's end, and the output is the source's length. A voice with such a
  // silence in its middle, then sound again, has the tail of its end: the
  // rule's hold in the pause is started over by the voice. Each against the
  // room by hand (section 1b), on the gain's own output.
  for (const [name, gaps, tailed] of [['a tone, then 3 s of silence', [[0, 0.5]], false],
    ['a tone, 3 s of silence, a tone', [[0, 0.5], [3.5, 4]], true]]) {
    const rate = 48000, x = new Float32Array(Math.round((tailed ? 4 : 3.5) * rate));
    for (const [a, b] of gaps) for (let i = Math.round(a * rate); i < Math.round(b * rate); i++) x[i] = 0.5 * Math.sin(i * 0.05);
    const c = { name, rate, opts: pageFor({ enableWarble: false, agc: false, volume: 1, room: { preset: 6 } }), room: presetRoom(6) };
    const gained = [], blocks = [];
    const r = await A.process(buffer(x, rate), { ...c.opts, onGain: (g) => gained.push(Float32Array.from(g)), onMixBlock: (s, l, m) => blocks.push(m) });
    const model = specModel(joined(gained), c, x.length), sum = joinedInts(blocks);
    const same = sameBitsF(model.y, r.samples) && sum.length === model.mix.length && sum.every((v, i) => v === model.mix[i]);
    check(`preset 6 on ${name}: ${tailed ? 'a tail after the last tone' : 'no tail, the source\'s length'}, the room by hand's samples and tail`,
      same && r.codecInfo.room.tail === model.tail && (tailed ? model.tail >= 22050 : model.tail === 0 && r.samples.length === x.length),
      `tail ${r.codecInfo.room.tail} (by hand ${model.tail}), ${r.samples.length} samples`);
  }

  // The custom room at its knobs' ends, where the old mapping's clamps act
  // (the reverb's longest line 25 and 220 ms, the feedback 0.3 and 0.97, the
  // cutoff 12000 and 1125 Hz), against the room by hand with the mapping as
  // the order gives it (customByHand).
  for (const custom of [{ duration: 0.05, decay: 0.5, mix: 0.5 }, { duration: 6, decay: 8, mix: 0.5 }]) {
    const rate = 48000, x = Float32Array.from({ length: rate }, (_, i) => (i < 12000 ? 0.4 * Math.sin(i * 0.07) : 0));
    const c = { name: 'custom', rate, opts: pageFor({ enableWarble: false, agc: false, volume: 1, room: { custom } }),
      room: { room: customByHand(custom), water: false, shares: { room: 128, direct: 128 } } };
    const gained = [];
    const r = await A.process(buffer(x, rate), { ...c.opts, onGain: (g) => gained.push(Float32Array.from(g)) });
    const model = specModel(joined(gained), c, x.length);
    check(`the custom room ${JSON.stringify(custom)}: the room by hand's samples and tail, 128/128`, sameBitsF(model.y, r.samples)
      && r.codecInfo.room.tail === model.tail && r.codecInfo.room.shares.room === 128, `tail ${r.codecInfo.room.tail} (by hand ${model.tail})`);
  }

  // A full-scale square wave through preset 6 (the codec bypassed, the gain
  // off, a 44100 Hz device so the output is the clipped mix itself): the
  // direct part alone tops out at entry(32767, 229) = 29196; with the room's
  // part the sum passes 32767, and the output is clipped there.
  const square = Float32Array.from({ length: 44100 }, (_, k) => (k % 441 < 220 ? 1 : -1));
  const blocks = [];
  paths.length = 0;
  const sq = await A.process(buffer(square, 44100), { ...PAGE, enableWarble: false, agc: false, volume: 1, deviceRate: 44100,
    room: { preset: 6 }, onMixBlock: (start, length, mix) => blocks.push(mix) });
  const sum = joinedInts(blocks), peakDirect = Math.max(...paths[0].calls.map(k => k.peak));
  let over = 0, wrong = 0, peakSum = -Infinity;
  for (let i = 0; i < sum.length; i++) {
    if (sum[i] > peakSum) peakSum = sum[i];
    const want = Math.max(-32767, Math.min(32767, sum[i]));
    if (Math.abs(sum[i]) > 32767) over++;
    if (sq.samples[i] * 32768 !== want) wrong++;
  }
  check('a full-scale square through preset 6: the direct part tops out at 29196, the sum passes 32767 and the output is clipped at +-32767',
    peakDirect === 29196 && roomModule.entry(32767, 229) === 29196 && peakSum > 32767 && over > 0 && wrong === 0 && sq.samples.length === sum.length,
    `direct ${peakDirect}, sum up to ${peakSum}, ${over} samples past the clip, ${wrong} outputs not the clipped sum`);
}

console.log('\n[3] What createRender reports, refuses and leaves alone');
{
  const c = CASES.find(x => x.name === 'steam, 1,000,003 samples (a prime) at 48 kHz'), samples = sources.get(c.name);
  const before = sha256(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
  const shares = [];
  const got = await streamed(c.rate, samples, { ...c.opts, onProgress: (f) => shares.push(f) }, 'uneven');
  check('onProgress gets the share of the source pushed, ending at 1', shares.length === got.pushes + 1 && shares[shares.length - 1] === 1
    && shares.every((f, i) => i === 0 || f >= shares[i - 1]) && Math.abs(shares[shares.length - 2] - 1) < 1e-12, `${shares.length} reports`);
  check('the pushed chunks are left as they were', sha256(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)) === before);
  check('outputLength and sampleRate are process()\'s', got.render.outputLength === renders.get(c.name).samples.length
    && got.render.sampleRate === renders.get(c.name).sampleRate);
}
const mono = (rate, length) => ({ sampleRate: rate, length, numberOfChannels: 1 });
async function refusal(make) {
  try { await make(); return null; } catch (error) { return error; }
}
{
  const roomed = await A.createRender(mono(48000, 4800), { ...PAGE, room: { preset: 6 } }), dry = await A.createRender(mono(44100, 4410), PAGE);
  const at96 = await A.createRender(mono(48000, 4800), { ...PAGE, room: { preset: 6 }, deviceRate: 96000 });
  check('createRender with a room: outputLength without the tail, maxTail the cap of 882,000 mix samples at the device\'s rate (960,000 at 48 kHz, 1,920,000 at 96 kHz); with none, maxTail 0',
    roomed.outputLength === 4800 && roomed.maxTail === 960000 && at96.outputLength === 9600 && at96.maxTail === 1920000
    && renders.get('steam, room: preset 6, device at 96000 Hz').sampleRate === 96000 && dry.outputLength === 4800 && dry.maxTail === 0,
    `${roomed.maxTail}, ${at96.maxTail}, ${dry.maxTail}`);
  roomed.free(); dry.free(); at96.free();
}
// The page's older options map onto the new ones: the same render.
{
  const src = voice(1, 48000, 13), hashOf = async (opts) => {
    const r = await A.process(buffer(src, 48000), { ...PAGE, ...opts });
    return `${sha256(await wavBytes(r.blob))} ${infoHash(r.codecInfo)}`;
  };
  for (const [old, now] of [
    [{ listenerPos: 'water' }, { underwater: true }], [{ listenerPos: 'tunnel' }, { room: { preset: 6 } }],
    [{ listenerPos: null, dspRoom: 6 }, { room: { preset: 6 } }], [{ listenerPos: 'not-a-place', dspRoom: '17' }, { room: { preset: 17 } }],
    [{ listenerPos: null, dspRoom: 99, customEnv: { duration: 1, decay: 2, mix: 0.3 } }, { room: { custom: { duration: 1, decay: 2, mix: 0.3 } } }],
    [{ listenerPos: null, dspRoom: 99, customEnv: null }, { room: { custom: { duration: 1.5, decay: 3, mix: 0.25 } } }],
    [{ listenerPos: null, dspRoom: 1 }, { room: null }], [{ room: { preset: 1 } }, { room: null }], [{ room: { preset: 0 } }, { room: null }],
    [{ room: { custom: { duration: 1, decay: 2, mix: 0.003 } } }, { room: null }], [{ room: { preset: 40 } }, { room: null }],
    [{ room: { preset: 104 } }, { room: null }], [{ room: { auto: 'room' }, underwater: false }, { room: { auto: { ...roomModule.roomCase('room').measures } } }],
    // Added in the review's fix round. dspRoom as a string is a room only
    // when written as a number is (the old code's key lookup); and opts.room,
    // when given, wins over the old position's water.
    [{ listenerPos: null, dspRoom: ' 6' }, { room: null }], [{ listenerPos: null, dspRoom: '0x6' }, { room: null }],
    [{ listenerPos: null, dspRoom: '6e0' }, { room: null }], [{ listenerPos: null, dspRoom: '06' }, { room: null }],
    [{ listenerPos: null, dspRoom: 6.5 }, { room: null }],
    [{ listenerPos: 'water', room: { preset: 6 } }, { room: { preset: 6 } }], [{ listenerPos: 'water', room: null }, { room: null }],
    [{ listenerPos: 'water', room: null, underwater: true }, { underwater: true }]
  ]) {
    const a = await hashOf(old), b = await hashOf(now);
    const label = (o) => JSON.stringify(o).replace(/"([a-zA-Z]+)":/g, '$1:');
    check(`${label(old)} renders as ${label(now)}`, old.room?.auto ? a.split(' ')[0] === b.split(' ')[0] : a === b,
      old.room?.auto ? 'the same WAV (codecInfo.room names a key for one and the measures for the other)' : '');
  }
}
// The room module absent from the engine: a render with no room and not
// under water does not need it and gives its recorded hashes; one with a
// room says what it needs.
{
  const bare = engineInThisRealm(false).audio;
  for (const name of ['steam, dsp_room 1 (no effect)', 'steam, custom room at mix 0 (no effect)', 'celt_22, gate on, loss 15%, jitter 300 ms',
    'demo voice as received', 'speex, 100 samples at 96 kHz', 'steam, empty source']) {
    const c = CASES.find(x => x.name === name), whole = await bare.process(buffer(sources.get(name), c.rate), c.opts);
    check(`${name}: with the room module absent the render succeeds, with its recorded WAV and codecInfo`,
      sha256(await wavBytes(whole.blob)) === GOLDEN[name][0] && infoHash(whole.codecInfo) === GOLDEN[name][1]);
  }
  for (const opts of [{ room: { preset: 6 } }, { underwater: true }, { listenerPos: null, dspRoom: 137 }]) {
    const error = await refusal(() => bare.process(buffer(new Float32Array(480), 48000), { ...PAGE, ...opts }));
    const error2 = await refusal(() => bare.createRender(mono(48000, 480), { ...PAGE, ...opts }));
    check(`with the module absent, ${JSON.stringify(opts)} stops and names room-dsp.js and room-presets.js (process() and createRender)`,
      [error, error2].every(e => e instanceof Error && /room-dsp\.js/.test(e.message) && /room-presets\.js/.test(e.message)), error?.message);
  }
}
// The tail loop's own bound: a path whose tail rule never holds stops the
// render with an error that names the cap, after ceil(882,000 / 512) + 2
// blocks past the voice, in process() and createRender.
{
  neverEnds.on = true;
  const x = Float32Array.from({ length: 4800 }, (_, i) => 0.3 * Math.sin(i * 0.05)), o = { ...PAGE, enableWarble: false, room: { preset: 6 } };
  paths.length = 0;
  const error = await refusal(() => A.process(buffer(x, 48000), o));
  const blocks = paths.length ? paths[0].calls.length : 0;
  const r = await A.createRender(mono(48000, x.length), o);
  await r.push(x);
  const error2 = await refusal(() => r.finish());
  neverEnds.on = false;
  check('a room path whose tail never ends: process() and createRender stop with an error that names the cap of 882000, after 1725 blocks past the voice\'s 8 whole ones',
    [error, error2].every(e => e instanceof Error && /882000/.test(e.message)) && blocks === Math.floor(4410 / 512) + Math.ceil(882000 / 512) + 2,
    `${blocks} blocks; ${error?.message}`);
}
{
  const error = await refusal(() => A.createRender({ sampleRate: 48000, length: 10, numberOfChannels: 2 }, PAGE));
  check('createRender refuses a source that is not mono', error instanceof TypeError, error?.message);
  const r = await A.createRender(mono(48000, 1000), PAGE);
  const tooMany = await refusal(() => r.push(new Float32Array(1001)));
  check('a push past the source\'s length is refused', tooMany instanceof RangeError, tooMany?.message);
  const r2 = await A.createRender(mono(48000, 1000), PAGE);
  await r2.push(new Float32Array(500));
  const early = await refusal(() => r2.finish());
  check('finish() before the whole source is pushed is refused', early instanceof RangeError, early?.message);
  const r3 = await A.createRender(mono(48000, 1000), PAGE);
  const first = r3.push(new Float32Array(400)), overlap = await refusal(() => r3.push(new Float32Array(400)));
  await first;
  check('a push before the previous one resolved is refused', overlap instanceof Error && /before the previous call/.test(overlap.message), overlap?.message);
  await r3.push(new Float32Array(600));
  await r3.finish();
  const late = await refusal(() => r3.push(new Float32Array(0)));
  check('a push after finish() is refused', late instanceof Error && /finished/.test(late.message), late?.message);
  const r4 = await A.createRender(mono(48000, 1000), PAGE);
  await r4.push(new Float32Array(300));
  const bad = new Float32Array(300); bad[7] = NaN;
  const nan = await refusal(() => r4.push(bad));
  check('a non-finite sample is refused with its index in the source', nan instanceof TypeError && nan.message.includes('307'), nan?.message);
  const r5 = await A.createRender(mono(48000, 1000), PAGE);
  r5.free();
  const freed = await refusal(() => r5.push(new Float32Array(10)));
  check('free() ends a render', freed instanceof Error && /freed/.test(freed.message), freed?.message);
  const r6 = await A.createRender(mono(48000, 48000), PAGE), running = r6.push(voice(1, 48000, 9));
  r6.free();
  const ran = await refusal(() => running), after = await refusal(() => r6.finish());
  check('free() during a push lets that push finish, then ends the render', ran === null && after instanceof Error && /freed/.test(after.message),
    after?.message);
}

console.log(`\n${passed} render-stream checks passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
