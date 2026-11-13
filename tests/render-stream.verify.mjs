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
  const sandbox = { window: {}, Blob, console, TF2Room: roomModule, TF2_ROOM_PRESETS: roomTable };
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
const GOLDEN = {
  // W3-02c-2: the renders on the game's timeline (opts.timeline 'game'), recorded once from
  // the run in which every check of tests/render-channel.verify.mjs passed, in a commit of
  // their own. No hash above or below moved.
  "steam, timeline game": ["07b120e216fba62ab414bab15bfc4913d38fba26aa777579c690aea49cbba57b", "8a25c06f1d993999efabfc2a389c004a9f79a7c52926f9f3d89a25767bf28cc1"],
  "steam, timeline game at 66.67 fps": ["9bc778b77e21d641caa818b2982f332f52c626b334c21a4ad68a082e12f8edca", "d300088812a91a662500ee3b1b3f70210a50dce85d21b1060b94d48756b42790"],
  "steam, timeline game, gate off": ["aa5e30bf5d30ff3c93909072121605979846a918fc0c3b4b182f10c4617d0cb1", "251b697774da04ed9d68ba9fefd9ee7a8c9572ad43484634a00c6038e0f7406c"],
  "steam, timeline game, loss 15%, jitter 50 ms": ["6fef3ffd71a71adccab2cc454e696847e1b22a2216b8092dbf6ca4cbc13b8de8", "d409363d140bc79e7c9db151a5ca485ce2f28b220b7682e6cc17078b978f1eed"],
  "steam, timeline game, auto-gain off, voice_scale 0.5": ["3897ca3055786a35b21e2c3e31f4148fffa1b2bdeea577e522e0332a259c3c5d", "41d484b1afc3331de9c1bfc78bc39162ca64d2eed8b0056c628afed319bbcdc4"],
  "steam, timeline game, device at 44100 Hz": ["46e7354c06d6861e3eefde14e6bd2aa81d1f82c91a834325a9ae8c6623e01ee3", "8a25c06f1d993999efabfc2a389c004a9f79a7c52926f9f3d89a25767bf28cc1"],
  "steam, timeline game, room: preset 6, seed 7": ["8f5fb47b06d1525971cc1ed83e16e8d079fa436fb0530881bf042978bcd1e463", "527e01a3a706601a0fafbed53bfa3aeb8c271977aeec19c2557665ad40ca6876"],
  "steam": ["425c012e59ae54feb5a82f255865bf2ccef56acb47624aa93a738972e6198dbf", "a47b6c428d0c95a493e597bc0c97db785c7542d73fe2f276f7cb7a8a477c9c64"],
  "steam_48": ["cb106e3f224599e2a7d6bb5d8b3cea9092d99c91a8d9b736f5248d80a819e483", "f2d0bc919678d26d9c0893d1a49a20ff1aed231910a8600ddf95fb83cef1f08e"],
  "celt_22": ["8cc3cb51c948a21b6257e07495b5ce2ccb9871297d43561431d7b2ab4baf9142", "9bd2fb89789a272ca4c6ed7467eca4d5454d368133a14441b04c8d91c7c36573"],
  "celt_44": ["130a4e3a0116fc955eb639ecf931bde8558bf4552ecfa4134bad2d5614d8818f", "3c1c8b31ad9e977030b54e7a629670e6ceca9a3f9a16298f5e87a5e23671866c"],
  "speex": ["f93a46c4fb737c9121dd498cfc27c7723d8041ee4569f73ba941e88d7842c304", "84f3baeb535d4cf1a04749100ac193c393ae0ad3d9d1dd6ae5fb13e07a0d8f90"],
  "steam, gate off": ["b79a0095e357999851c7d4876d13553383d038fee1c4fd97c97abca63dcacf51", "cd4059e403a428449df6efe078da1f8dcf4f5060d532d6dd08181932bbade71d"],
  "steam, gate on at -30 dBFS": ["634a8add0f6204db24cc134c33563cd3a0beb572b57bc9f9e7355334d3d12c30", "94ffa390cfd5ea36ca1841f8e45fd50ea44d029643aeb76d2e8c9f6f37a4dcd3"],
  "steam, codec bypassed": ["8b9bbd78568debf709476f3965984385bc0204f43a876ca995d9406a6a170d42", "810a49448ad689b02b1555c661fba6262bb81ba529de20ea502e56251f2df335"],
  "steam, high-pass 250 Hz and low-pass 3500 Hz": ["f66c6c59b7509c52106e2b2478ad06bf75abf1dcd992ef142c750b90b2e3b102", "f0e60509be595f929673428109015141e46a2a49db3a63351d340239daeda606"],
  "steam, mic gain 4 (capture clipping)": ["35c0a5edb23c2e14ac2fc4ca0d63288679aa34dd6b41bf8747361bc298762501", "656fc2fe4297bdfc52963edb308ad912016c764ba2384c13a61ebf3e9201e1cc"],
  "steam, auto-gain off": ["0788808deeda9af474ba43d577bc7d4606be1d5c7f8e4ddea8efd24557562548", "de3d85de3e4c3fd517125e5a24444cc7f0b201a205bc2dcbd4bf7970aeeb79a9"],
  "steam, voice_scale 0.5": ["480c84f1306e3a7533ce7f8b91778cdcf9b2370413ff33d81f762e22bc842deb", "e791ed03f2d6579873093980b972829bc436cc3e5f933bb516c09560305dfcff"],
  "steam, voice_avggain 0.25": ["71e6f5e25f977c7c9d19d302157a7f33b1cee698cf59a79657e0a8fa941de778", "e791ed03f2d6579873093980b972829bc436cc3e5f933bb516c09560305dfcff"],
  "steam, loss 15%, jitter 50 ms, net_split 40 ms": ["851350d329c304c4cbd65c05280cf9087119c824821b375e3cae53f10ee3df45", "6c210e8940cf35a19e8e3853dd6ca15e2f489562c1eb02f8d588c78030416f02"],
  "steam, source at 44100 Hz": ["b090235c8331fa45f3e86d86928f885e02056799831376193ccd52fe51fd87f8", "5f2093e176826105af9e65fe5f07e0899f11770c037a321b658eb31558c738f3"],
  "steam, source at 96000 Hz": ["78a9098e0ca72b312023d1653635b83725e0035ad63486958bbfd9032120febb", "cb0fcf7faafe0c63c246cd79f95de940d1105d9bdf159a7deb17a7979b77b3bd"],
  "steam, source at 22050 Hz": ["c63bb3460c60dd8c061846a624b9f754d59161240b5aeba14874beb03c2cd6c8", "4f8bf12cd60f03c1043e86433d9f8005c80c128613b0e326de76735d8cce8ac3"],
  "steam, 1,000,003 samples (a prime) at 48 kHz": ["924c2005038c90dd3ba619674a9c81a5ade3596b91b63881d5fe8322eea6920e", "7693b2fb32937395f414a38ab81b950f64dc72652eb1c623025f7871a32bda74"],
  "demo voice as received": ["cedfd94434a7e342b7f3a3cc78c1c88c023f8e04facb0471ef16e7a58527a03c", "ffd2b8850430d49b04e086cbf71d8b281e5018468b93980e8c903882e86857bd"],
  "steam, 1 s pushed a sample at a time": ["1d825c8196d086dcde3f26046bc0bf3d0ab843ae55ee8a621c79f441046c20a8", "3b05b305a695f95d2b22d3438fb6a4f90625a84c6e03b027224afa86c5250230"],
  "steam, six minutes": ["17ff4250d7a5a2c8f0db76ef216d387fa0e8a6ccda0eb38653c17a9bf1df3102", "ecbd41be1e20a1d141130e45df2e66308b7abdf71fd3f83219b2efc8244b28f8"],
  "celt_22, gate on, loss 15%, jitter 300 ms": ["302c6f9610826f85d913b4351aa261f4e4f7055003d12b0f8fab38b92c933012", "0b575fca37ebf68ae116815c18a1f77f11fd1a4990f620892c1aad3b28ec8c4b"],
  "celt_44, gate on, loss 15%": ["4857d88188fec06e658f6cf80a24a52c53e2cf129ac1a49d2700d1a208f1e8f6", "4face18f89426f7e520f9e687eef9ae7d0aa994fd11d0a71d0bdf3e730bb7aab"],
  "speex, gate on, loss 15%, jitter 300 ms": ["732897e85b9c12b748c4436f405a8495221a1094b253232696a8f229b4a5706e", "479d2149a32db551af6623328cbf7ed1e9c5b4579e5cfa102a2278201fc8578c"],
  "steam, jitter 500 ms on the file's own timing (does nothing)": ["7a84d9b55600c1dc3aff1808be550cb01aab3bfff5fbfbfdace2d4addbb12142", "7fd1c7b9f1b69860a84e8e8f85888e759ceb63ca6a839a1c25284c4ee730deda"],
  "steam, snd_bits 4 (SILK frames)": ["405cfa452821f2afcc5f94e8921ab8cb6f2749c2834a325a6e459412f8bb00d8", "90752a2c322c8ff797779f0b336f8db827ed4f7dd531c4484b2b2265a5fecfbe"],
  "steam_48, loss 10%, jitter 100 ms, snd_bits 10": ["5e5ce262e57ec4f9a06a7858a5f875b9a621b99f3cec7912c4460db26c6125b9", "06decdb78d78b561d40c522b901ddc0d374ff401fcd45a02676705bec3ea3a02"],
  "steam, source at 24 kHz": ["046a1199d8304460e68965d4c47131775f80f99fc0739c03c0764fa457aef70b", "4f8276463d2593c03caf8a0c208a8eaf2922f5566c0a25d00bfab4c7c4e679a4"],
  "celt_22, source at 22.05 kHz": ["1befc25d8d501cc74b1de048bf577f4a3877624304bf5d071dcbc4fc7d9af80f", "9b67647157556b164aa32ad69d116915e881ce1d41cd76a6c832559d126710a2"],
  "speex, source at 11.025 kHz": ["f2c38164a1b3655c93d456f4a8f3cdd58eb22dde87807a2a7480a5ade7ba6ffd", "41787e0c606f0f7a809b62b8f250db41a1f2069af26ad28e90af0eb815707665"],
  "speex, source at 8 kHz": ["3c4058aebb5db410c461bb20837bb6d31b1a6aa2547c9e6a5821b735cedee1ac", "41787e0c606f0f7a809b62b8f250db41a1f2069af26ad28e90af0eb815707665"],
  "steam, volume 1, voice_maxgain 3": ["0ad7c9bff192626118ab50416598abbd2d5540a55517ede2de7a5489e7a308f7", "a26aab671b17e677745b7286f0a4bce695496d113208675de169f8eeaadd165b"],
  "steam, volume 0.3 (a volume whose product rounds)": ["3bf9a489dd0b33629eda1fdea4100eb2c51e64cbf63e6e23f9128cf3ec74086e", "a26aab671b17e677745b7286f0a4bce695496d113208675de169f8eeaadd165b"],
  "steam, auto-gain off, voice_scale 3": ["da673383e1d372f7bf5599dbfef9c3fa67fb601d63387394502f24a55041cf11", "ee181ca25aba2632533cdcf855fcbebd522dc3a53e72bf39b3e3582b8673fc3a"],
  "steam, dsp_room 1 (no effect)": ["2e4881230bb5994e29ac9bee72cdd52792b33038b34cc47f1e555c3f65aa4e3e", "a26aab671b17e677745b7286f0a4bce695496d113208675de169f8eeaadd165b"],
  "steam, custom room at mix 0 (no effect)": ["2e4881230bb5994e29ac9bee72cdd52792b33038b34cc47f1e555c3f65aa4e3e", "a26aab671b17e677745b7286f0a4bce695496d113208675de169f8eeaadd165b"],
  "odd options": ["25002ac7817595312deae5f8545e78e7ef066afe751c881be27d7034285bee6d", "1f5f97dab4ce404f61f54e119d06c5294846401e28822a6249757aee4ab364f3"],
  "test profile with a decoder EQ": ["ad0ba0879966a6dfe862458009c8b4abd942bebe143b85fec5aa7e2ce169eb5f", "a0a4fdedffca8a05994dabcd30e4c15c05977bd0f2ba7e5a6188192616030df8"],
  "steam, empty source": ["531cd597b25052b4845ef2f3887dec2183240802a93b6e044960de8ba017caa0", "a8aaa71a85416c4d7d34dbfd5bc2318c4470880c51ae197f8963b18978d1817f"],
  "steam, gate off, loss 80%, seed 1 (long runs lost inside a spurt)": ["c88912d5ff3e037ef134ef5f951fcc6b9fff0451f770952e19a47faaa7e7a9a8", "8369938e2df354dbeac20a32cab65d85f8fb0be53ba8eef13b1796c8d27c902d"],
  "steam, gate off, loss 40%, seed 3 (long runs lost inside a spurt)": ["6598778986641c1b27c7f625e03c8424fe815195e622ae2ee49bd21d98aad1cb", "22c357527d3d2702d2b187550c68d67dba3b85db29a659e5a75573174bd162be"],
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
  "steam, 192004 samples at 24000 Hz (an output length of 352807.35)": ["db4c97e7032a92f49cb52898c07483fe29ae4541c54c50724850910998e45f01", "18e20f044956a03a77fd48dfe47b66a0c02e25298e1aa5e2804471bf5a957f87"],
  "steam, 256007 samples at 32000 Hz (an output length of 352809.65)": ["1028ff4f55bd12269addb77412d366599a403cc334f3c47909ad1db70570a2a8", "a43cf5907c0c2bee571380343f92cd7cbe1d6028c4f04b9ed730ac1deebd767b"],
  "steam, 302401 samples at 37800 Hz (an output length of 352801.17)": ["e3532619ff896d2ee7e9d13d2bf1cb27e5d9c9215de33e455f713446c9b48ca6", "8b991b8e07bc1a4e57140aac223d4a601f18cd534a3704695a0ab9e0f2f610a5"],
  "steam, 88203 samples at 11025 Hz (an output length of 352812.00)": ["f986906be8e49621dd7b1f5a087b5392a0a46a4038c3e49671dec5c549cbedbe", "c21e5ea940439d85875139e7a0f95153e1fbc3cd5928cb5d8eb4fa7ae87da530"],
  "steam, silent but for a quarter frame of sine at the end": ["0e7551d1a6a29d2465b83e4719334870fb0135c31f2d4e921511bfdde1841712", "a2735f316ac6640c3218fc07b539a03ce00498a00bc401678dbea87c1bae5769"],
  "steam_48, silent but for a quarter frame of sine at the end": ["0e7551d1a6a29d2465b83e4719334870fb0135c31f2d4e921511bfdde1841712", "a2ab787d46a1cdf2a53b25fdb56752994849a33fc9af2ebe979bfcd5fa32ecb1"],
  "demo voice as received, past full scale": ["29fa4ca146921e4bff09bc0d8f621bbaf91983be531276c72272a800f56622fd", "e6a7ce0f09e5683c1726bbea1d2500d2aaebf930359a22246c73eeb4a1325eb6"],
  "steam, room: preset 6": ["ae520e3a97cf4e8980bebb540b8424814d4fafccb17b17f37b8a73ccd9df9de2", "156a761064f93154163918925159791e55db47a3de1fb83c372bbd9838e98fa9"],
  "steam, room: preset 17 (random taps)": ["4414f4f3e223ababed9e34f88e580dfa605ba3a0f49907ae3369116daaaa935a", "6ffc2471227687505d182fe9bbea3848c888b9d66c1e76f3c161df565c5f8c98"],
  "steam, room: automatic, tunnel": ["7acd6966ffa758038b64f0412399bd96945a4f95547aa269ba8c40b79059946a", "46e530ef6e37879156b4fd464caaf7c6ede41478c5ea95497701744917a240e3"],
  "steam, room: automatic, great_hall": ["59992681c65dbb6a42f8e6e02a71ad0cba5cabc55b344abfaa608b34a22c21bc", "6688f28df0420acf25d9b23f1ad5e8705999693707fa729e196ea4bcb1cfc9e2"],
  "steam, room: automatic, set_c_room": ["0824116c8a8743aa4775e579d46eefe77af7a990d5311220339868b5b2852af1", "a84b1afd8c41b48efa32a96b2c93351ecc378b223c8cccf7603d6e70d9991792"],
  "steam, under water": ["23756d86685650c7e4602497722fd32321e4765b583bb102119d203b3014e088", "ed3a699a789412b15c3c4bf3ecbfcc5c823a21fea6e0705fbf2bc96ae8173351"],
  "steam, under water, preset 6": ["3753eee04d1ad9efae6789e068ce65725001a1405877311925f6e0abaf6e9f06", "f59e46a6e481e8b12bccb7493fea8bdab119dc935efca9691786f088d84bdb94"],
  "steam, custom room at mix 0.3": ["d3daf78a6faec0c266ec9a5f177f1754ff80fe7fd220cb2b44d4bb997b08b854", "835d169325e2b5044db6955c9feda280a2d3a183536d50305c449ef5ba7328fa"],
  "celt_22, room: preset 6": ["6a6382078f2f52bf57befe64b921ef36caa8f30e07317b18773422e096d98ccb", "ba4e531902cc0467c08d674a260cbcb33e010d08dc767681527122be8ce2beda"],
  "steam, listenerPos tunnel (preset 6), loss 15%, jitter 50 ms": ["81dcafd4f8e5e61270591815e81184f8b785b231c118281047429bc2feffc70e", "a7e430f6cfd74f23006754306add34f955feacc0807b2b34b8f358bcdf79f543"],
  "steam, dsp_room 137 (no room)": ["1f5a480181f46c6e017cafcf448dd90df60a0a8fb6b79ce5540bfed4616b430b", "b7fef488e643b4d23b7e36c78128a5828de0afab77dc50006a7e7b83f4f284e4"],
  "steam, room: preset 17 (random taps), seed 7": ["41d01e9476f8626b50ac760d656d4e24e25df0bea8a1a264baf29f96c5b041c3", "28d88b4c65c1fa937cfc97b26b5a503a632f0f3369c1c76330d7a430e7d288b5"],
  "steam, room: preset 6, device at 96000 Hz": ["702e6b2546da09babd070212436e7aa217b642c09dede1b2c4a148f6022d061e", "156a761064f93154163918925159791e55db47a3de1fb83c372bbd9838e98fa9"]
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
  // W3-02c-2: the renders on the game's timeline.
  "steam, timeline game": "4c9e3a714e5a012aa94bf8e553007356391c4a533797bc9950b8921bd9ce0fe0",
  "steam, timeline game at 66.67 fps": "d41873a687070d12d2bc3e522a2038aee66af37e91a3271719b1add7271ccb04",
  "steam, timeline game, gate off": "2d766c34b2cc2bcb17beb5c610c0680f7e16d02018f6ba27409b4ae72aeb0be2",
  "steam, timeline game, loss 15%, jitter 50 ms": "a4fff0acbfea547a4c2b82f8fe6db643aceb75234e116770c2f5b633345d3da7",
  "steam, timeline game, auto-gain off, voice_scale 0.5": "90f9a0af8b8492d104b646413a8f2d47abbbe16bde7f81da68a4bb3396e4f6bc",
  "steam, timeline game, device at 44100 Hz": "4c9e3a714e5a012aa94bf8e553007356391c4a533797bc9950b8921bd9ce0fe0",
  "steam, timeline game, room: preset 6, seed 7": "9637b96443caf569695a3ef9dfb8f68e15128daceae5aef9414f7dffa7c9f719",
  "steam": "563d66526152a2ad7f112ec4506091088b35818151f3ed407a637268b72c5ef9",
  "steam_48": "67ae552c948f640673b3cc9e5f967228dc96f40010d21300b844a5d1e97b98dc",
  "celt_22": "0f1760425be904c6c334a026621ed737ddbcec4f384e90dc783b5cf16a75ce23",
  "celt_44": "c4fe90a8e00da5bf319fb21c1ed8ddc40f5e93f5dbf5935baf64e1e52c280fe6",
  "speex": "1bdccfbdf42abf0fa3d4761d82ecb013904232facb91ebb609e355486e1e10f8",
  "steam, gate off": "77679c0789b4d0f4d57bd3b706dfa966107a2345d3857d20cc9f0e93478203a2",
  "steam, gate on at -30 dBFS": "e8e46a166d70672aa105b0ee59b474061de4f4714ff8584eda39059df0c50026",
  "steam, codec bypassed": "14902e758a56117e56e389f2f260f101ed6cdbdd4c36a8c93a95764127c691c2",
  "steam, high-pass 250 Hz and low-pass 3500 Hz": "7b337e4e39c90e95ee5f4cf1f5c6c293b2de458f1f94ef3fa25026dc83a7c7ed",
  "steam, mic gain 4 (capture clipping)": "a17ed830a1e38afb348bc86bf0335d184c04917030cb4c85acf342cc4503ae9a",
  "steam, auto-gain off": "9fcdf4965de08e10cadc992b2be26443c8ad9ddb18bac80ffcd216f82ed7f84f",
  "steam, voice_scale 0.5": "abfba531a69ff49660c65c84bc136e3b271c1f928ae41525ec47f892713a0126",
  "steam, voice_avggain 0.25": "b4b0131756d5c83591e90f05d734422e72696ade6670cd892cea50360dc551f4",
  "steam, loss 15%, jitter 50 ms, net_split 40 ms": "26faab1ba90f8dfc70d44768f2e51de53a75e9a2df0bf8c2a490d0de53f931df",
  "steam, source at 44100 Hz": "738eb36b8984f8e14bcebf527a4fd3bfbd69fcd2698b41207707f2d1486751f6",
  "steam, source at 96000 Hz": "9acc67088d22434fb4e6ff86e996ec4bf563fa51ca8bde04a395a64aae224f5e",
  "steam, source at 22050 Hz": "608f5f8f3c2ed2b063a9c2d06322f52c697c05e693583012994b33fcad6ab0be",
  "steam, 1,000,003 samples (a prime) at 48 kHz": "e8ba93a8a7d5890c45e9c3cebe4d6c1c804c7f3c4267af057e9fa3fb2e6bb3ec",
  "demo voice as received": "2c27d598935f09f2b919fabd94146d19b2479f080cea0ade3821b5e374383102",
  "steam, 1 s pushed a sample at a time": "9185183acac0c07266b188646ed2fe737db81bb52f9090950b0b0dda63843fd5",
  "steam, six minutes": "01bc8c0740b4c9036d3ccdcb94500b986f0a0a9beed735858298335ca3fa1310",
  "celt_22, gate on, loss 15%, jitter 300 ms": "49d594aa6f0caa9490066ed6ae1742c15063326002cd8836fd9d88f07c300f11",
  "celt_44, gate on, loss 15%": "a887ab28283d73ee61018636afe804942bf998c59a6ff75e8ec01f8885a40c6b",
  "speex, gate on, loss 15%, jitter 300 ms": "e7bfb2524f39f29b794443969bab51d41b797aacc4254d735d3803c768fa6aa1",
  "steam, jitter 500 ms on the file's own timing (does nothing)": "d26dcad0c05b38d3d0b47e9437ac92cb2a4bc47839f58090a59b0a6765978ad6",
  "steam, snd_bits 4 (SILK frames)": "51a31415805709755787b52a9c0e80943dce51e737baced5454627fd182a14b6",
  "steam_48, loss 10%, jitter 100 ms, snd_bits 10": "60a29df9af7e58794da2e2a0f463a879d3e534cb393ef1fb4adf70c235145940",
  "steam, source at 24 kHz": "99276e7b0692d89c89f37310e72729449c04a59898888bcb59ea8ac0ad6d942c",
  "celt_22, source at 22.05 kHz": "37cc90ff07dd39d9f951bee0fce23d7ab5e9d4bbdffaa4c235eb2645805495c7",
  "speex, source at 11.025 kHz": "6d4ff782056d55f41ace12c18a2a844076353f078c9dd63afcda51bb5669d530",
  "speex, source at 8 kHz": "6d92c34e965cc721ae150a58b186fd4ee0148d16c4e7651803f78f4d574d7942",
  "steam, volume 1, voice_maxgain 3": "b115cd2170a57b98bf15d79fb51644c12cc72327a0c4dfd2b56358d011cb2d6d",
  "steam, volume 0.3 (a volume whose product rounds)": "d7ca57fe6b6a2561b6f9e5a4619c16fbc3e2a9490745356ae8c0e186fa27019b",
  "steam, auto-gain off, voice_scale 3": "d74f421b1bf9b4d1c6d4957f79a4694179771ced6616d0505ea4d62b0e913864",
  "steam, dsp_room 1 (no effect)": "d7ca57fe6b6a2561b6f9e5a4619c16fbc3e2a9490745356ae8c0e186fa27019b",
  "steam, custom room at mix 0 (no effect)": "d7ca57fe6b6a2561b6f9e5a4619c16fbc3e2a9490745356ae8c0e186fa27019b",
  "odd options": "a04d7965764a276f2f375ffc9115110cebfe1f99977c70c7d3d1c0c398d47d6e",
  "test profile with a decoder EQ": "9356252def077c6f884a029f57b71d7a09095ad8cf9cafbeced8b8cf6b54a033",
  "steam, empty source": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "steam, gate off, loss 80%, seed 1 (long runs lost inside a spurt)": "3f03f512d92d371abad9e8f78e23923c68c0b384fe3c952a18010d246299585f",
  "steam, gate off, loss 40%, seed 3 (long runs lost inside a spurt)": "6525c4623fe78a3875eaa238c2da57c9613c81e1e5d2489cb4ea3f5ac4a99dbc",
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
  "steam, 192004 samples at 24000 Hz (an output length of 352807.35)": "a3761720d2c621af0adf25e754ed061f7cfda195700b15d3de7a161c5e89c138",
  "steam, 256007 samples at 32000 Hz (an output length of 352809.65)": "d7238bd19fd06a24d2146e17a6743e6a5c94c6d279382f82e11df9d275ca3ff0",
  "steam, 302401 samples at 37800 Hz (an output length of 352801.17)": "f5661a015077695ccf0d0c788c61201d9025f62149754b701d3654b1e6160ca5",
  "steam, 88203 samples at 11025 Hz (an output length of 352812.00)": "3fdec844d41bc4ad05d298a37c67e1955b1a5fa58cebda9a8a59e3185b3b5e0c",
  "steam, silent but for a quarter frame of sine at the end": "7c083cfbf0884b8b9232667bf60221dc226ae42757cd61b4e1fb7afc770f1ef1",
  "steam_48, silent but for a quarter frame of sine at the end": "7c083cfbf0884b8b9232667bf60221dc226ae42757cd61b4e1fb7afc770f1ef1",
  "demo voice as received, past full scale": "05a8491b26e4add98f106914427ab6f23bef798c32cb5ba8293c4fa37ba1f1a5",
  "steam, room: preset 6": "45119698b16277ff866736b78a958b064cb681bc8778765c801372c2b9e57a37",
  "steam, room: preset 17 (random taps)": "45119698b16277ff866736b78a958b064cb681bc8778765c801372c2b9e57a37",
  "steam, room: automatic, tunnel": "45119698b16277ff866736b78a958b064cb681bc8778765c801372c2b9e57a37",
  "steam, room: automatic, great_hall": "45119698b16277ff866736b78a958b064cb681bc8778765c801372c2b9e57a37",
  "steam, room: automatic, set_c_room": "45119698b16277ff866736b78a958b064cb681bc8778765c801372c2b9e57a37",
  "steam, under water": "45119698b16277ff866736b78a958b064cb681bc8778765c801372c2b9e57a37",
  "steam, under water, preset 6": "45119698b16277ff866736b78a958b064cb681bc8778765c801372c2b9e57a37",
  "steam, custom room at mix 0.3": "45119698b16277ff866736b78a958b064cb681bc8778765c801372c2b9e57a37",
  "celt_22, room: preset 6": "9e9ff38ca1d70685f73688c24adb0c80b14b16ef97b801f57d93657b4244a878",
  "steam, listenerPos tunnel (preset 6), loss 15%, jitter 50 ms": "7e4a24e1a6b3285e9259909e4d30039a45b2766711c534b820532c5279393b23",
  "steam, dsp_room 137 (no room)": "45119698b16277ff866736b78a958b064cb681bc8778765c801372c2b9e57a37",
  "steam, room: preset 17 (random taps), seed 7": "ce4c69a3bb9f95a300e6f6b26dc1ce1674dc5045975e488215fb84d38908c0b1",
  "steam, room: preset 6, device at 96000 Hz": "45119698b16277ff866736b78a958b064cb681bc8778765c801372c2b9e57a37"
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
  // own timing it does nothing: the case renders as the same source and settings without
  // jitter, which 'steam, dsp_room 1 (no effect)' is (no room either way).
  {
    const name = 'steam, jitter 500 ms on the file\'s own timing (does nothing)', plain = 'steam, dsp_room 1 (no effect)';
    const wavOf = async (n) => sha256(await wavBytes(renders.get(n).blob));
    check(`${name}: no late frame, and the WAV and codecInfo of '${plain}', the same source and settings without jitter`,
      info(name).underrunFrames === 0 && await wavOf(name) === await wavOf(plain) && infoHash(info(name)) === infoHash(info(plain)),
      `${info(name).underrunFrames} late`);
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
  check(`${name}, with ${Object.keys(extra).join(', ')} (which process() ignores there): streamed, and the recorded render`,
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
// Since W3-17c a room streams; the flat re-timing rule still does not, with
// a room or without (W3-02f removes it).
for (const [opts, named] of [[{ retime: true }, 'retime'], [{ retime: true, room: { preset: 6 } }, 'retime']]) {
  const error = await refusal(() => A.createRender(mono(48000, 4800), { ...PAGE, ...opts }));
  check(`createRender refuses ${JSON.stringify(opts)} by name`, error instanceof RangeError && error.message.includes(named), error?.message);
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
