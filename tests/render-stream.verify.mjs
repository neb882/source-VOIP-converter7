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
// context as the older suites do: the same code gives the same samples (two
// cases below are rendered both ways), and Math runs several times faster
// outside a vm context. TF2_DIR points the suite at a copy of the sources.
// Every signal is synthetic, made here.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = process.env.TF2_DIR ? pathToFileURL(path.resolve(process.env.TF2_DIR) + '/') : new URL('..', import.meta.url);
const engineCode = ['constants.js', 'steam-sender.js', 'vendor/swresample/swresample.js', 'audio.js'].map(f => fs.readFileSync(new URL(f, root), 'utf8')).join('\n');
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
const room = { ...roomModule, createRoomPath(o) {
  const p = roomModule.createRoomPath(o), log = { opts: o, calls: [] };
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

// constants.js and audio.js as the page's classic scripts see them, inside
// one function: no timers (as in the vm suites, the codec loop's yields
// resolve at once), the codec module injected, the tables returned. With
// rooms false the room module is absent, as for a page that did not load it.
function engineInThisRealm(rooms = true) {
  const window = {};
  const tables = new Function('window', 'TF2Opus', 'setTimeout', 'self', 'module', 'TF2Room', 'TF2_ROOM_PRESETS',
    `${engineCode}\nreturn { CODEC_PROFILES, VOICE_ENGINE, LISTENER_POSITIONS, DSP_PRESETS };`)(window, TF2Opus, undefined, undefined, undefined,
    rooms ? room : undefined, rooms ? roomTable : undefined);
  return { audio: window.TF2Audio, ...tables };
}
// The way tests/verify.js and tests/reference.compare.mjs load it.
function engineInVm() {
  const sandbox = { window: {}, Blob, console, TF2Room: roomModule, TF2_ROOM_PRESETS: roomTable };
  vm.createContext(sandbox);
  vm.runInContext(engineCode, sandbox);
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
  ['steam, jitter 500 ms (late frames play as silence)', 48000, { jitterMs: 500 }, '960'],
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
// its concealment) lands at that cursor. createRender may give out samples
// only up to it; without that bound these cases throw at chunks of 960 and 7.
const noise = (seconds, seed) => () => {
  let s = seed >>> 0;
  return Float32Array.from({ length: Math.round(seconds * 48000) }, () => 0.3 * ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2147483648 - 1));
};
add('steam, gate off, loss 80%, seed 1 (long runs lost inside a spurt)', 48000, noise(4, 1), { gate: false, lossPct: 80, seed: 1 }, ['960', '7']);
add('steam, gate off, loss 40%, seed 3 (long runs lost inside a spurt)', 48000, noise(4, 3), { gate: false, lossPct: 40, seed: 3 }, ['960', '7']);
add('celt_22, one sample at 22.05 kHz', 22050, () => Float32Array.of(0.25), { codec: 'celt_22' }, ['whole']);
add('speex, 100 samples at 96 kHz', 96000, () => voice(0, 96000, 8, 100), { codec: 'speex' }, ['7']);
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
// A number the table does not hold (Decision 11): no room. Its hashes are
// those of the same render with none (section 1).
addRoom('steam, dsp_room 137 (no room)', { listenerPos: null, dspRoom: 137 }, null, ['uneven', '960']);

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
const GOLDEN = {
  "steam": ["bb7ef37d9d65f1c03672fe6bb14933036cc8d8174847fd4e4c3e9671a98f4a61", "4992fbdbd3efbe23ae9c2640825202a57429755fdc7d331ea4f37e210a9d91b9"],
  "steam_48": ["cb106e3f224599e2a7d6bb5d8b3cea9092d99c91a8d9b736f5248d80a819e483", "f2d0bc919678d26d9c0893d1a49a20ff1aed231910a8600ddf95fb83cef1f08e"],
  "celt_22": ["c95ee49ed8fdf4e95b19ba10628e33404024690e9741221da39f84352cbfaa06", "9bd2fb89789a272ca4c6ed7467eca4d5454d368133a14441b04c8d91c7c36573"],
  "celt_44": ["c428ba4428a08e3ed68cae499768bcead1a96fa00fcae340da82470451524817", "3c1c8b31ad9e977030b54e7a629670e6ceca9a3f9a16298f5e87a5e23671866c"],
  "speex": ["171b89161fdf29e9d21f7c10c036d01e0b8c1cf9874dcda6462c1ccad2e624d8", "84f3baeb535d4cf1a04749100ac193c393ae0ad3d9d1dd6ae5fb13e07a0d8f90"],
  "steam, gate off": ["6e461e765c979f4dbe2894ae1bf43340cb4eb94731cdcc52a113a2e76f487a1c", "e1fee0afcc93245bc286df33cb2201e8e84738735f3cfb30adc6c574a16904ee"],
  "steam, gate on at -30 dBFS": ["45eda63a770cc5e761e845c0a9532baf61cc7702f771727af7af885513240203", "a925df4dc5809279781bcf15758ce933a20a1c521b405259f41bddff4c9e8615"],
  "steam, codec bypassed": ["8b9bbd78568debf709476f3965984385bc0204f43a876ca995d9406a6a170d42", "810a49448ad689b02b1555c661fba6262bb81ba529de20ea502e56251f2df335"],
  "steam, high-pass 250 Hz and low-pass 3500 Hz": ["b9e5adab6d0a999541da9cfe4e5a627d268336e5f5ea657960f7fb85b21436ce", "be86cbc6a614e078a2bfda214c74d98215d615979c0b9eeabb6046d2a1ed5fd6"],
  "steam, mic gain 4 (capture clipping)": ["3eca5251d65596c35eed7b129fd51cb557765354c0dcf2684f31845a7443a6ab", "a079b08a14d41dac18bc5c9e18e9aad78c33fe2ba95223425d0b760849dc6331"],
  "steam, auto-gain off": ["164d52e0c9804bbf6a2ff99c5226cfb955aaea70929347370f3f53fa7c5017fa", "d4f9815a5782eb2d4dce9b46233b6bf7a44fc6059a56ecc64056b424a5151719"],
  "steam, voice_scale 0.5": ["6402ef67462b8fd2d710b4c407323b0e784d7a24e50c22555cceca2d738d80a8", "e102db2318a5a8fcc9d9bdbf1094f9dce52bc3c55e117c89ef770964677427ce"],
  "steam, voice_avggain 0.25": ["aa415b8c63422251d31c26d6966447fcf43652e740ceb0daff335a2442c285a8", "e102db2318a5a8fcc9d9bdbf1094f9dce52bc3c55e117c89ef770964677427ce"],
  "steam, loss 15%, jitter 50 ms, net_split 40 ms": ["a98e709311e4e87f8ba47d036350c6ce98a9558c6e2bc71571acb4cd55fbbf7a", "6dcf80dab8b503152027a43cef01ad12bf18720c3c9c01acdb0d8469144de8bb"],
  "steam, source at 44100 Hz": ["57399adf16efce4e3ca9c6d9521be213877ee4b1b108e18515cc72f52031b348", "d911f7b597eb206c614481ec79933d6cbcb299eac022f62c7aacab0cef469f43"],
  "steam, source at 96000 Hz": ["e135aa8e27b5a8df9a8b8b2ad35cd327d2f0f9afb095e7e1a31a5d33079bc782", "e6f329418ead922efb6cf8ce1df5e550667cf6f0b764f26d4fc9c21e5aadc4c0"],
  "steam, source at 22050 Hz": ["f89979184968a9849e8a62770cf41bcaaea87ec4d0c085532be059b4f8815434", "37e827b164cedd747fcfbf373f6d58435d95651f5c6b48809936086d8058bce8"],
  "steam, 1,000,003 samples (a prime) at 48 kHz": ["9fa59334706f2eed6d33fc8f6a877dc0f2aff1efaf513cef6e38242cf1293613", "d0f1b82783595bc31b0e3e6f9e1a7a17b737df54a7a1f361bd5d1f4eaeafe210"],
  "demo voice as received": ["cedfd94434a7e342b7f3a3cc78c1c88c023f8e04facb0471ef16e7a58527a03c", "ffd2b8850430d49b04e086cbf71d8b281e5018468b93980e8c903882e86857bd"],
  "steam, 1 s pushed a sample at a time": ["7e3bb253d9a22548d75bc09f3d67e4586e0c58f4fddc039bdb6b0aa57d1654c9", "8b1fd91dd197bd3d28371d304f50af75093976d86c0d7d2fc5752ccadf428a20"],
  "steam, six minutes": ["4d2dba65f5eabb232e29ff223add78ecb51e265b212eefd3aaf3f0c9e60c9c71", "5a8ab9cae5cc205d449e669b2d00fc988db194deaf81b5e4fed8aac5ed7a04bf"],
  "celt_22, gate on, loss 15%, jitter 300 ms": ["bc09cb2c057fda5c64a19ba17bda6fdf1d3ab4b06bc84434cecbe47030f1bccf", "0b575fca37ebf68ae116815c18a1f77f11fd1a4990f620892c1aad3b28ec8c4b"],
  "celt_44, gate on, loss 15%": ["4857d88188fec06e658f6cf80a24a52c53e2cf129ac1a49d2700d1a208f1e8f6", "4face18f89426f7e520f9e687eef9ae7d0aa994fd11d0a71d0bdf3e730bb7aab"],
  "speex, gate on, loss 15%, jitter 300 ms": ["db12e9c7374c5d57bed5bc257ec75c9c3f0909af468cce24fb68724f3894148f", "479d2149a32db551af6623328cbf7ed1e9c5b4579e5cfa102a2278201fc8578c"],
  "steam, jitter 500 ms (late frames play as silence)": ["38c43494a760052a2f63a7a7982cdb67d804748c4761d474a190009b51458067", "cb26383f153ef8ca9718dfef2c40817f48896e4d586ff9650e2e7e624a7b81dd"],
  "steam, snd_bits 4 (SILK frames)": ["ff80b3c0ba5e3d31aaedf5edec04a53ea8f6c973c0ae4a300b0db47ae8f57e14", "0f3e32b5a3943f11a73a3d20dca1c85901f8cad3694f3dd5d9c69e4e477cfdb2"],
  "steam_48, loss 10%, jitter 100 ms, snd_bits 10": ["5e5ce262e57ec4f9a06a7858a5f875b9a621b99f3cec7912c4460db26c6125b9", "06decdb78d78b561d40c522b901ddc0d374ff401fcd45a02676705bec3ea3a02"],
  "steam, source at 24 kHz": ["76c8e189892a4915826eda4fd41541c735f73648fa286a7bfb44f9e27cf49f93", "1baeda17efb0d11e0a9494c18ef5d99e9e6a99bfaa9d84100047feea5567dc5d"],
  "celt_22, source at 22.05 kHz": ["4f167c9146b722d5958b5fc8d882e80901da82bd19aa5aae8e7539e4fb4d8b0c", "9b67647157556b164aa32ad69d116915e881ce1d41cd76a6c832559d126710a2"],
  "speex, source at 11.025 kHz": ["00eaeb6bbdc13c64b06ee93c6ffac859ed73d78bb039cfa1a558311cd37ee725", "41787e0c606f0f7a809b62b8f250db41a1f2069af26ad28e90af0eb815707665"],
  "speex, source at 8 kHz": ["88f92e8bc02a3d808bb6798d60e0968f5529c46277831bd339e35e5e6568c7fc", "41787e0c606f0f7a809b62b8f250db41a1f2069af26ad28e90af0eb815707665"],
  "steam, volume 1, voice_maxgain 3": ["840051d93a5c935181cadbccf7449986168f19668aa5e6b021c70cdba08525b3", "ad208ca860fd98a0fdd18c6ae1cbb854bc4f73bdc65a113d61d00a01f08047bf"],
  "steam, volume 0.3 (a volume whose product rounds)": ["7ce019df36b80bd0e2a0279c56734699176b768371da89739138b51919abdead", "ad208ca860fd98a0fdd18c6ae1cbb854bc4f73bdc65a113d61d00a01f08047bf"],
  "steam, auto-gain off, voice_scale 3": ["f4bcb71b9b5b758ed9186d178e079b04834f7237d8e95571d94744e603e41792", "e6a5f35e19d62bd888597259c5feaca5f7ab2c04b9f7117ed5fa341e142f9870"],
  "steam, dsp_room 1 (no effect)": ["b673515cfa58978fc847ad8a45bc3405ceed9c2ad5f04afbee83ba47d070f81d", "ad208ca860fd98a0fdd18c6ae1cbb854bc4f73bdc65a113d61d00a01f08047bf"],
  "steam, custom room at mix 0 (no effect)": ["b673515cfa58978fc847ad8a45bc3405ceed9c2ad5f04afbee83ba47d070f81d", "ad208ca860fd98a0fdd18c6ae1cbb854bc4f73bdc65a113d61d00a01f08047bf"],
  "odd options": ["163b94e6bd13d78a4e119d0eee2a9f36314fc0133d0144df92dc3afdcecebbfe", "e63fe11e6c1e7c6c2adef7f941495f411a3648575876db4e732890d5c338f4d6"],
  "test profile with a decoder EQ": ["ad0ba0879966a6dfe862458009c8b4abd942bebe143b85fec5aa7e2ce169eb5f", "a0a4fdedffca8a05994dabcd30e4c15c05977bd0f2ba7e5a6188192616030df8"],
  "steam, empty source": ["531cd597b25052b4845ef2f3887dec2183240802a93b6e044960de8ba017caa0", "09ce131d4df4147794412a84312b8b781287be1bec8525a2d9ed1a825df72613"],
  "steam, gate off, loss 80%, seed 1 (long runs lost inside a spurt)": ["d5ed5c6566444bd8d34d21b05447af71cd238398efd7a14f1eecc136e570325e", "1a9df010f9c8945d262a582ede3f0d73abfbb328f928fd005f9eb4b3f1868c3c"],
  "steam, gate off, loss 40%, seed 3 (long runs lost inside a spurt)": ["7285017eb9d4dca883bedfd0d4de8a1742e9a9e777ca61295f7ffcf8acabbfea", "6b8a3789a23f3a9878275888868146062fab39c7c8b8f159811b2d23b61d9328"],
  "celt_22, one sample at 22.05 kHz": ["d16bcaf5ffe07bcf982a161469d1dc9aff4f5d3c606ec408c0071893e6c34ad9", "eb96641cf9ac28d1e20117dcbb88da71d51d3cc4d94394ed8db507c1ad29ce32"],
  "speex, 100 samples at 96 kHz": ["5eae3af6f9b58664dfbd497083689b6ee2555d4b8db3087da2ccd95d660ebc98", "e66f178a6e1b38a504c0806750fd7df1cd70281e04f3656c26a4ecf98f8974da"],
  "steam, 192004 samples at 24000 Hz (an output length of 352807.35)": ["f0a8821f065aaaed88a257a6626e966d1d1c75c9c7a528749f9818c537bf91ce", "4ff570d0b80d42531e0ee8c80450d73c6e9c5f13bade05fad73715c704711405"],
  "steam, 256007 samples at 32000 Hz (an output length of 352809.65)": ["246207f8891188114c92855cc66d3e9bd771475bfe8cf342d54b11ca0c6255a2", "924b7ab9c414cd20107b2422a3f5f5867c6bd5ddb93efbbed4797ba8fafed15d"],
  "steam, 302401 samples at 37800 Hz (an output length of 352801.17)": ["558c0e3b035fe5aeedf9c87b1e124edd60423d7fd21b811b0a8a1c525d420774", "28af3a677cef1f5f3b3919770a5285c604983d096c638794b28d6d46d450c3de"],
  "steam, 88203 samples at 11025 Hz (an output length of 352812.00)": ["ce5956fa77247c22e7015bdb9c462c865105e0a8432edd0cf4488c6747e4d34e", "63be92b7f61d5541f90ea7e2261119f3568075a607da1423cc30a72555ff72e0"],
  "steam, silent but for a quarter frame of sine at the end": ["0e7551d1a6a29d2465b83e4719334870fb0135c31f2d4e921511bfdde1841712", "a2735f316ac6640c3218fc07b539a03ce00498a00bc401678dbea87c1bae5769"],
  "steam_48, silent but for a quarter frame of sine at the end": ["0e7551d1a6a29d2465b83e4719334870fb0135c31f2d4e921511bfdde1841712", "a2ab787d46a1cdf2a53b25fdb56752994849a33fc9af2ebe979bfcd5fa32ecb1"],
  "demo voice as received, past full scale": ["29fa4ca146921e4bff09bc0d8f621bbaf91983be531276c72272a800f56622fd", "e6a7ce0f09e5683c1726bbea1d2500d2aaebf930359a22246c73eeb4a1325eb6"]
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
  "steam": "58c2c5c4a9d2bcfaa3920f0f4ed0a3db6046ac9967dfbfbe1beb288566059512",
  "steam_48": "67ae552c948f640673b3cc9e5f967228dc96f40010d21300b844a5d1e97b98dc",
  "celt_22": "21aed940ff7c26e1d4e7042c4352b2dc04319d4e55328d011203cafc96841152",
  "celt_44": "3ddd31b3aaf82ab940d5cdbed58056ea89819b43097a04bc7c776f03eb342837",
  "speex": "e53997b91477f7278dc990f977737720b32d6c1979b08b5bba79e71a5d47eb5a",
  "steam, gate off": "47a1391636a1a677949598d1896c4d98d817c6995564afe8158946f55a8e634e",
  "steam, gate on at -30 dBFS": "7189011696a829fd20bb67fe9bb909cee0b4bb2e27877b32e41745dbab5fe9a5",
  "steam, codec bypassed": "14902e758a56117e56e389f2f260f101ed6cdbdd4c36a8c93a95764127c691c2",
  "steam, high-pass 250 Hz and low-pass 3500 Hz": "a48a816f067b42dc2d1fb46c7d7522324946742d286a99a07fb58ce805fce6a2",
  "steam, mic gain 4 (capture clipping)": "80d66d33e1f5d49153ef636e84fe2b8c95c57522856c00fa39d96396e05311b9",
  "steam, auto-gain off": "7793f0856b6cadd6db810bdafeebf9d817a41c277a80e0c6222f432e37f1bffe",
  "steam, voice_scale 0.5": "e701a59e4d62539721316848e29a9a99222cb19dbcfb98948ca65e2c52fac913",
  "steam, voice_avggain 0.25": "789ddec205abc69e971be4ad56bc34dbcf40e80f78032e1a54bbf034f7b39cb1",
  "steam, loss 15%, jitter 50 ms, net_split 40 ms": "d4c36c58acc3ecdee69a41985419aa5c15c5bc02163d5f155fd227bdf6c2dbec",
  "steam, source at 44100 Hz": "b484bf7e8e0e35f146190dbea87a085c9597cc73ec3842526e937c0c4761d3ef",
  "steam, source at 96000 Hz": "ff5a5f15c5fbcb5b2212ca8223be0c6b955010cfc981184bb2d36b82bf38d580",
  "steam, source at 22050 Hz": "98732c1bcae5c82d89367982ce6bcda4f47c503053cfdf72a761965b94c6d9d1",
  "steam, 1,000,003 samples (a prime) at 48 kHz": "59a59a3dd7747d6a23dfc6ad29564ac91f80f570904241d640c93a71353e02c5",
  "demo voice as received": "2c27d598935f09f2b919fabd94146d19b2479f080cea0ade3821b5e374383102",
  "steam, 1 s pushed a sample at a time": "6dcad2dc5ace8809bf2a7be7e3f870e6bf8b44f995c8fbeb0343d1e4ccad4823",
  "steam, six minutes": "6e8b9dac852070d13f73ec4aadaafb174332c2aaf20e3605ac8df7d0d83d3882",
  "celt_22, gate on, loss 15%, jitter 300 ms": "eb7d94043f8200262342124bd60b0d620cc82028c9de80df28b836b7b5531146",
  "celt_44, gate on, loss 15%": "a887ab28283d73ee61018636afe804942bf998c59a6ff75e8ec01f8885a40c6b",
  "speex, gate on, loss 15%, jitter 300 ms": "52b05aa5284e805ed48158fad683aaf1d0e64b7cd4b704112e7a7b82e46626a3",
  "steam, jitter 500 ms (late frames play as silence)": "9d4c60bf861872574a4d7336f7eb78f1ae902c095a3a0b1c5d5333ce19ed9d89",
  "steam, snd_bits 4 (SILK frames)": "df32d452cba5f765a32bb650cf077618c3a8b5ee804f61cfc467e716bf7f3643",
  "steam_48, loss 10%, jitter 100 ms, snd_bits 10": "60a29df9af7e58794da2e2a0f463a879d3e534cb393ef1fb4adf70c235145940",
  "steam, source at 24 kHz": "0923ce2fff4d58135bee8981879196c019360e12b0b36f91ff65a4364df4101b",
  "celt_22, source at 22.05 kHz": "e3ddb3a41b93f0ba38532d993f31784015e7959968a517881dcf372f27349b43",
  "speex, source at 11.025 kHz": "c6c570174516fa79283235a051ac364c7acc4c78a82eb5b17a1873d27ea4bd0e",
  "speex, source at 8 kHz": "50d2def8b103ab07721ad239121e696f7f14797548632fbf4425fa30355aff1e",
  "steam, volume 1, voice_maxgain 3": "461e531f514ea927cf1102f1e50478ae33c0696fc40814c460eee67fa10204b4",
  "steam, volume 0.3 (a volume whose product rounds)": "92643715eabd05accfc09b983921e388c64f5ae6127c53747a69d059292f0c32",
  "steam, auto-gain off, voice_scale 3": "2f2373fd6de358832a5ad6178ebce324de299262c3f4b1c2fdd303cca02ac1b2",
  "steam, dsp_room 1 (no effect)": "92643715eabd05accfc09b983921e388c64f5ae6127c53747a69d059292f0c32",
  "steam, custom room at mix 0 (no effect)": "92643715eabd05accfc09b983921e388c64f5ae6127c53747a69d059292f0c32",
  "odd options": "52c76c0135b7667233f516c2f1c2991e44b812b4c4c86f5b4a933120634ba33f",
  "test profile with a decoder EQ": "9356252def077c6f884a029f57b71d7a09095ad8cf9cafbeced8b8cf6b54a033",
  "steam, empty source": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "steam, gate off, loss 80%, seed 1 (long runs lost inside a spurt)": "d172def5fdf4f1901269da8cf46391e3aa0a9d7167af16d7d632fd2ff0c6e8c5",
  "steam, gate off, loss 40%, seed 3 (long runs lost inside a spurt)": "2d23678c8e2f9ddcbb2f40622353a822784ee86b70d82cf251c37a85f8eab237",
  "celt_22, one sample at 22.05 kHz": "7ec2225478271c68195bba12ee36ff65c7e706f0886d0b05a86e8b2d18d7bebb",
  "speex, 100 samples at 96 kHz": "eae3fbcabcc943196634b7c1dfd48940c62e91f2c42abe4725845d49739891b7",
  "steam, 192004 samples at 24000 Hz (an output length of 352807.35)": "a82b7c82a2715817377f21d35c03ecb152e2c082f9ad51aa281c4ce5cae3ff00",
  "steam, 256007 samples at 32000 Hz (an output length of 352809.65)": "24ea514ae6b60a115046b478043e144b0ee8d09bafcccccc3410602388b6d9b9",
  "steam, 302401 samples at 37800 Hz (an output length of 352801.17)": "a73c7d15d47d6d0b9a85b8fa2919ee11b74f2ade5306e9fa2dda588eead2b9a7",
  "steam, 88203 samples at 11025 Hz (an output length of 352812.00)": "bd2d74515725195f67c70487fdb5a488f79ca5db15e9a84299386a34be102db8",
  "steam, silent but for a quarter frame of sine at the end": "7c083cfbf0884b8b9232667bf60221dc226ae42757cd61b4e1fb7afc770f1ef1",
  "steam_48, silent but for a quarter frame of sine at the end": "7c083cfbf0884b8b9232667bf60221dc226ae42757cd61b4e1fb7afc770f1ef1",
  "demo voice as received, past full scale": "05a8491b26e4add98f106914427ab6f23bef798c32cb5ba8293c4fa37ba1f1a5"
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
  const out = new Float32Array(render.outputLength);
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
  const one = rooms.filter(c => madePaths.get(c.name).length === 1 && madePaths.get(c.name)[0].opts.seed === 0xC0FFEE
    && madePaths.get(c.name)[0].opts.water === c.room.water);
  check(`with a room or under water: one room path, the render's seed, under water as asked, in all ${rooms.length} such cases`, one.length === rooms.length,
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
    const t = r(c.name).tail, n = sources.get(c.name).length;
    return { name: c.name, t, ok: Number.isInteger(t) && t > 0 && t < roomModule.TAIL_CAP
      && renders.get(c.name).samples.length === Math.round(n * 48000 / c.rate) + Math.round(t * 48000 / 44100) };
  });
  check('each room render has a tail under the cap, and is as long as the source at 48 kHz plus the tail at 48 kHz',
    tails.every(x => x.ok), tails.map(x => `${x.t}`).join(', '));
  // dsp_room 137 is no room: the same render as dsp_room 0's.
  const c137 = CASES.find(c => c.name === 'steam, dsp_room 137 (no room)');
  const none = await A.process(buffer(sources.get(c137.name), 48000), { ...c137.opts, dspRoom: 0 });
  check('dsp_room 137 (not in the table) renders as no room: the WAV and codecInfo of the same render with dsp_room 0',
    sha256(await wavBytes(none.blob)) === sha256(await wavBytes(renders.get(c137.name).blob))
    && infoHash(none.codecInfo) === infoHash(renders.get(c137.name).codecInfo));
  // The room comes after the mix point: the gain's output is the same with
  // any room as with none (the steam cases on the same source, no loss).
  const sameGain = ROOM_CASES.filter(c => c.opts.codec === 'steam' && !c.opts.lossPct)
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
  for (const name of ['steam, jitter 500 ms (late frames play as silence)', 'celt_22, gate on, loss 15%, jitter 300 ms', 'speex, gate on, loss 15%, jitter 300 ms']) {
    check(`${name}: some frames arrive too late and play as silence`, info(name).underrunFrames > 0, `${info(name).underrunFrames} late`);
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

// The vm load the other suites use gives the same renders.
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
// Nothing of audio.js is used.
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
    const path = roomModule.createRoomPath({ seed: 0xC0FFEE, room, water, table: roomTable });
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
  function specModel(gain, c, sourceLength) {
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
  }
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
  check('createRender with a room: outputLength without the tail, maxTail the cap of 882,000 mix samples at 48 kHz (960,000); with none, maxTail 0',
    roomed.outputLength === 4800 && roomed.maxTail === 960000 && dry.outputLength === 4800 && dry.maxTail === 0, `${roomed.maxTail}, ${dry.maxTail}`);
  roomed.free(); dry.free();
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
    [{ room: { preset: 104 } }, { room: null }], [{ room: { auto: 'room' }, underwater: false }, { room: { auto: { ...roomModule.roomCase('room').measures } } }]
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
