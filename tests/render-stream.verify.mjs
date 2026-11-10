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
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = process.env.TF2_DIR ? pathToFileURL(path.resolve(process.env.TF2_DIR) + '/') : new URL('..', import.meta.url);
const engineCode = ['constants.js', 'audio.js'].map(f => fs.readFileSync(new URL(f, root), 'utf8')).join('\n');
const TF2Opus = await import(new URL('opus-codec.mjs', root).href);
const printHashes = process.argv.includes('--hashes');

// constants.js and audio.js as the page's classic scripts see them, inside
// one function: no timers (as in the vm suites, the codec loop's yields
// resolve at once), the codec module injected, the tables returned.
function engineInThisRealm() {
  const window = {};
  const tables = new Function('window', 'TF2Opus', 'setTimeout', 'self', 'module',
    `${engineCode}\nreturn { CODEC_PROFILES, VOICE_ENGINE, LISTENER_POSITIONS, DSP_PRESETS };`)(window, TF2Opus, undefined, undefined, undefined);
  return { audio: window.TF2Audio, ...tables };
}
// The way tests/verify.js and tests/reference.compare.mjs load it.
function engineInVm() {
  const sandbox = { window: {}, Blob, console };
  vm.createContext(sandbox);
  vm.runInContext(engineCode, sandbox);
  sandbox.TF2Opus = TF2Opus;
  return { audio: sandbox.window.TF2Audio };
}

const engine = engineInThisRealm(), A = engine.audio;
// Two code paths no shipped profile or position reaches, given test-only
// entries: a decoder EQ (a zero-phase FIR after the codec) and a listener
// low-pass without a room (the one shipped position with a low-pass, water,
// also has a room).
engine.CODEC_PROFILES.test_decoder_eq = { ...engine.CODEC_PROFILES.steam, displayName: 'test only: Steam with a decoder EQ',
  decoderEq: { taps: 63, freqs: [0, 3000, 7000, 12000], gainsDb: [0, -1, -6, -12] } };
engine.LISTENER_POSITIONS.test_lowpass = { label: 'test only: a low-pass, no room', dsp: 0, extraLpf: 1500 };

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

// The options the page sends for its default settings (app/render.js).
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
const add = (name, rate, make, opts, plans = ['uneven']) => CASES.push({ name, rate, make, opts: { ...PAGE, ...opts }, plans });
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
  ['celt_44, gate on, loss 5%', 48000, { codec: 'celt_44', gate: true, lossPct: 5 }, '960'],
  ['speex, gate on, loss 15%, jitter 300 ms', 48000, { codec: 'speex', gate: true, lossPct: 15, jitterMs: 300 }, 'uneven'],
  ['steam, jitter 500 ms (late frames play as silence)', 48000, { jitterMs: 500 }, '960'],
  ['steam, snd_bits 4 (SILK frames)', 48000, { bits: 4 }, 'uneven'],
  ['steam_48, loss 10%, jitter 100 ms, snd_bits 10', 48000, { codec: 'steam_48', lossPct: 10, jitterMs: 100, bits: 10 }, '12345'],
  ['steam, source at 24 kHz', 24000, {}, 'uneven'],
  ['celt_22, source at 22.05 kHz', 22050, { codec: 'celt_22' }, 'uneven'],
  ['speex, source at 8 kHz', 8000, { codec: 'speex' }, 'uneven'],
  ['steam, volume 1, voice_maxgain 3', 48000, { volume: 1, maxGain: 3 }, 'uneven'],
  ['steam, volume 0.3 (a volume whose product rounds)', 48000, { volume: 0.3 }, 'uneven'],
  ['steam, auto-gain off, voice_scale 3', 48000, { agc: false, voiceScale: 3 }, 'uneven'],
  ['steam, dsp_room 1 (no effect)', 48000, { listenerPos: null, dspRoom: 1 }, 'uneven'],
  ['steam, custom room at mix 0 (no effect)', 48000, { listenerPos: null, dspRoom: 99, customEnv: { duration: 1, decay: 2, mix: 0 } }, 'uneven'],
  ['odd options', 48000, { codec: 'nope', micGain: '2', gateThresholdDb: 'x', frameMs: 70, seed: -5, volume: 3, bits: 40, lossPct: '12', hp: -4, lp: 1e9 }, 'uneven'],
  ['test profile with a decoder EQ', 48000, { codec: 'test_decoder_eq' }, 'uneven'],
  ['test position with a low-pass', 48000, { listenerPos: 'test_lowpass' }, 'uneven']
]) add(name, rate, () => voice(8, rate, 4), opts, [plan]);
add('steam, empty source', 48000, () => new Float32Array(0), {}, ['whole']);
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
add('steam, silent but for a quarter frame of sine at the end', 48000, () => {
  const x = new Float32Array(100 * 960 + 240);
  for (let i = x.length - 240; i < x.length; i++) x[i] = 0.02 * Math.sin(i * 0.2);
  return x;
}, {}, ['whole', 'uneven']);
// A demo's received voice past full scale (a decoder's float output is not
// clamped): the capture's int16 clip applies to it as to any source.
add('demo voice as received, past full scale', 24000, () => {
  const x = new Float32Array(48000);
  for (let i = 0; i < 24000; i++) x[i] = 1.2 * Math.sin(i * 0.05);
  return x;
}, { received: { frameLog: Array.from({ length: 100 }, (_, f) => (f < 50 ? 2 : 0)), frameBytes: Array(100).fill(60), frameMs: 20, spurts: 1 } },
  ['uneven']);

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
const GOLDEN = {
  "steam": ["5444343b90249dca5ce53c1141708c994240877b647fd06516258c142406dd35", "67cfe1bbede8e10591d27f9c6228b896dc4b20ddc143f5f12ad91ac1af1ae8bb"],
  "steam_48": ["abc36ae7f3f7794aea98c7abc3cc3cd68e631ea299dc6b08e1d4a05caba5ce91", "f2d0bc919678d26d9c0893d1a49a20ff1aed231910a8600ddf95fb83cef1f08e"],
  "celt_22": ["e2f1920f9f59b7bb940a335c614251a6d9f2da8bbe21811da1d1db67abb0f2e4", "bd7bd309d3c4069bbcb8489c544c8dc2fdc783509c03eb0d8f0a152bc7e968f6"],
  "celt_44": ["ee96a32904c9d8c4b61aaef747e4155d61c476c82738f61b7be2902d703b978a", "0d7560877e7367fba631283450aaad251d6c84f4039ced21c89961700dc6cf96"],
  "speex": ["64f059ef929b375db8b37583a3dd1fd9f605b1c851cdb7885a00d2093e493c79", "1d765ab05b04f62696729e3c0fe97350fbd7f4a684872b8e1def263f3e0cd4fe"],
  "steam, gate off": ["4c7789f9c390526589f7231f4a39828fd030623b628895bab7371d90d814ca28", "2967f372ad612a1849065c0cfe4137c832616921fe7297d4281e651245d638fc"],
  "steam, gate on at -30 dBFS": ["58be46082d57e8c2397e2f463ee2aa1695812fca3e308e25d2a5b971ed566b3c", "fb3efc3eccff6a1839610a45bf880a4131bf649641c53efa898c82b44ee8cec5"],
  "steam, codec bypassed": ["2c62a55fd85f764e1fff0292890db32e2158631dd5927331f375623f60d2a40a", "810a49448ad689b02b1555c661fba6262bb81ba529de20ea502e56251f2df335"],
  "steam, high-pass 250 Hz and low-pass 3500 Hz": ["19eddefec02a3bd62571133017d2421ccebf52ad62ed4adf70d352e4c6056d3a", "e1f94bca182f8b644b60bfad976ed66ff0e0e60eaea942f68f79e01c5de3b242"],
  "steam, mic gain 4 (capture clipping)": ["9272848c9cf0fa0ca5745e5e7b8bfbe8d5a98021d63a42bc824b6c99c2a90f06", "c0bbb650eb47249a71bc62ff55e75eb3cfa6805ea5bf6195db1060f3f076ac9e"],
  "steam, auto-gain off": ["2b0ec034ea50bae82a77820eaa4f9ebf60b84e74c28f8b2acdf1195984d22707", "d9c368a59fc4bec2ebcd6f2c474dda8a521d21fc0bd5fbf1a37b5219e68358c9"],
  "steam, voice_scale 0.5": ["713403d039fce00b449a610973406d442037f425c66ee33b62a911f74da56d4d", "0a9bdfbd1f55d3031a82fae73ace7af93753d6572bce8340101ae63fd9ac6565"],
  "steam, voice_avggain 0.25": ["e0beb3a77e8d1d2e7d979b1a2bd7a84f2e9077d5002b8fd8b73c125e1ef72e86", "0a9bdfbd1f55d3031a82fae73ace7af93753d6572bce8340101ae63fd9ac6565"],
  "steam, loss 15%, jitter 50 ms, net_split 40 ms": ["763cd962b8286a5be4da5ce662832ca45ad41cc02b067e0a0521b62c86fb02bd", "6ff03de4eec7947dd5e979559002c988496b9462cae50fe8b4780ae55973280d"],
  "steam, source at 44100 Hz": ["89a9be2ae26415d0ed9edbb85066ea893d19cbd643e36bde793f226d6d207b95", "ec9c7def36b240d61478d1dc988e06189557644d89cfebcc8d77ab3e33698bf6"],
  "steam, source at 96000 Hz": ["70db84612751728f581e30605540bb830e6fd15970967f02715373fa6a3c5f35", "1fb51fa07d026260bd8b47ea0fa20782bcf2556c53b947fb64866e7d94528874"],
  "steam, source at 22050 Hz": ["ae308cb368225f04334ac0df14c49521dc51ddff14e31e414766c18841a028a6", "fb47c02f7e0881c2fc23e0e617e7ae509ee925c627324552dc12d9ea71dabdb8"],
  "steam, 1,000,003 samples (a prime) at 48 kHz": ["60a6a728ba3b2436f41531b7954179a95f161c45701ed95a469d8dc9f1cb5c80", "c4c306c3a1bb17045187da2d9c75fcca1df5dc895ef2683a86c01897bf0686e1"],
  "demo voice as received": ["e95c293b650b787ea53051cc3bc9f048ad17846500b7dcd9da2d6b732b9203d4", "ffd2b8850430d49b04e086cbf71d8b281e5018468b93980e8c903882e86857bd"],
  "steam, 1 s pushed a sample at a time": ["a998b9cee0faac8cfa0ceea040a1807ba7bd6dccb93b002dd5b8df48c588cc61", "3572055e8820cf027166190c56ac37740f4d00c63ed3b4f9e7571a9962a89e67"],
  "steam, six minutes": ["1c3d828109f9f5d26682e821c699f5b6494753e04cf2a6143b994911e37cabe7", "ac11446f7c4efda7f6e7b0c5d5a4b5e6e02c38a89ccbe5af7e17eaca27f1f852"],
  "celt_22, gate on, loss 15%, jitter 300 ms": ["60df83263f5ebd3f7f278544d383bb557cb6ddb9e71baae1b2c7182bb4b90644", "c82d45e3360f952c860ecba6dbf22417e3ec847cffcc3bbc8aa1f3b879eceb4a"],
  "celt_44, gate on, loss 5%": ["d9b8fcf3a80c4e35422ed38e8870218a6fd3901a088f090d3790542fded7f04e", "a56c56b29734e911a9ac1c86d2aa899a1e65a232bf7e8de26a79bb03cf8f6344"],
  "speex, gate on, loss 15%, jitter 300 ms": ["ceabf8976060676d84479fddbde7814ea31709fa17ea1947a8e6f7f2bebc0e1f", "e0986f3eb5951b13b48ba579f746e0de082229eedf2fefd483f1283e093fe448"],
  "steam, jitter 500 ms (late frames play as silence)": ["6335912e33325f277d438200d906afe5bde880634e4ab20c4cd0ea2576476d4a", "a9cb32351f7babd9092b2e4aa0e7fd40459b29df1dd706fa2f93ba268bf963ed"],
  "steam, snd_bits 4 (SILK frames)": ["d211918ee2c096c717a7e3011209f3ccd07101ae114bbf271b0ffd1103738c00", "65fee37c18de059d0c3c55cc3ec3045f391e537c05db55667e9b1c3d851cd151"],
  "steam_48, loss 10%, jitter 100 ms, snd_bits 10": ["a840275fdf953cf4010c40d87e55ed786f867b5196ce7a6ce44b621fecc1e7c0", "06decdb78d78b561d40c522b901ddc0d374ff401fcd45a02676705bec3ea3a02"],
  "steam, source at 24 kHz": ["ba0e01f7f871ac37280ca0ba8e0c18cda352cf63987b6fefc50c0ed7fe22edcd", "6d9367ebcae0078f3f61f537caca45043ba94971a9788b1ca659b5616e509111"],
  "celt_22, source at 22.05 kHz": ["2e23a470d32590712ba63598cb44125fdbd18d7a9740d0d5c425dcba7d5194b1", "edac031357eb92528b2320cc09bd7c1873b70cefc81d3376900da5669ff09be6"],
  "speex, source at 8 kHz": ["58245dae8392a4917ffdbe41df03a51d6cf1942961b080e20796f026a13c599e", "3a087f939ab49d04d39ce7b5f0888b4963e6bffa3e4d15d0d406929355f19179"],
  "steam, volume 1, voice_maxgain 3": ["504e0ae610a190f2d696493a34822c42bde1d92e4428b2b449e176ba3df864d5", "f30befe79e342d9e341aaf0aa7b57be72fd5d8b1bcacb98c645b2d7f7c8f90fd"],
  "steam, volume 0.3 (a volume whose product rounds)": ["6470e3d7e4fc44d9744d0b1fc63dea02b26d4b865f276f9cf3074457a388abbf", "f30befe79e342d9e341aaf0aa7b57be72fd5d8b1bcacb98c645b2d7f7c8f90fd"],
  "steam, auto-gain off, voice_scale 3": ["81dc0d3e91c5736afece6846a0cbc0536c5cedeca6ef5e95a12a39829eef2dc0", "7b3a3ef57fe145669138f8c115b35bc2f0eb747e0cdd9fa40d8c88137890a7e4"],
  "steam, dsp_room 1 (no effect)": ["8141a51cabe7b9f609137c9624fb0f062d4626ea178557b91296c857eedf5912", "f30befe79e342d9e341aaf0aa7b57be72fd5d8b1bcacb98c645b2d7f7c8f90fd"],
  "steam, custom room at mix 0 (no effect)": ["8141a51cabe7b9f609137c9624fb0f062d4626ea178557b91296c857eedf5912", "f30befe79e342d9e341aaf0aa7b57be72fd5d8b1bcacb98c645b2d7f7c8f90fd"],
  "odd options": ["74425c7e62d8494c5effba1b4f46520aff5b4655433cfd614ae02e607bdf227b", "db2adc59ebc1937f4472bc4b4ab3a90fc2d0ba6a88af6b094616fb8d3a5ef562"],
  "test profile with a decoder EQ": ["b1fae4aac64f241cda3a0cde547c77c4d361292b489f2c81137edca255da3fb5", "3c8f58abd24ad108d9f30daa5e41c61771a9a0764da142d3327bfa2159225fae"],
  "test position with a low-pass": ["016653c752a420d220ef3dcbce5f98de40819ba8bf21242b3479beaebc11c893", "f30befe79e342d9e341aaf0aa7b57be72fd5d8b1bcacb98c645b2d7f7c8f90fd"],
  "steam, empty source": ["531cd597b25052b4845ef2f3887dec2183240802a93b6e044960de8ba017caa0", "b32404c22fdf86532c9f8b847bb12e0e34ea69c064d8878fe91dcb037b2c2956"],
  "celt_22, one sample at 22.05 kHz": ["8bdb40f7f19fd74497e62f74abf6fd726353ab0c65d941eb81f714723d322133", "a032a8533eefecb38c033caee92275c8b1b3ff3d80f5c3b9a48fa4ead9f94fb6"],
  "speex, 100 samples at 96 kHz": ["e6ba94cf55d4c02145702356be2fdb23e2611a566f95160892e31bbcf231406a", "7378c5937d73b07b2caf0066088b2b36f40454a3226768229cd65c6546e6088f"],
  "steam, 192004 samples at 24000 Hz (an output length of 352807.35)": ["fbd0f6709f17922fed7eda7a5b28aa28f873b5c89b72f2f8f54b4c05c77fc1b6", "b27d4df10af9fb2cdba36f99440f710c9d66d44e99d04e6a02b437aa95029c53"],
  "steam, 256007 samples at 32000 Hz (an output length of 352809.65)": ["2db463275ccf0b7a78a0a7fcbc367087bf9d206370f47db0764ce402757ff750", "d509400ab5141857ca18e176b685c95ca99c4022132771f8835423d112e556af"],
  "steam, 302401 samples at 37800 Hz (an output length of 352801.17)": ["2572bd7ce006c830c1b115c3f8533596f4cb770533164b9c50936a8df4f648e9", "5a79bda3615c5bc801adba431b45b69d58894cda2b984ff091886cc46f534c67"],
  "steam, 88203 samples at 11025 Hz (an output length of 352812.00)": ["5ed8886eb308b83b2547488674d2ecbecbb5e75956f89ae779ebf71c0b6d5cce", "b0ec161479f3554d289cf7c7d5639b590e68520e41ffb62c058b53ad8f6e62e3"],
  "steam, silent but for a quarter frame of sine at the end": ["0e7551d1a6a29d2465b83e4719334870fb0135c31f2d4e921511bfdde1841712", "9418ecb85fa67a120ba445822242bb01708ab2bb2204f0620b3feec8d7424127"],
  "demo voice as received, past full scale": ["defc7e4cbbcb1c4c82b0e31bbee7949ecc9fcae3ab06c472e8868d65cbc822f3", "e6a7ce0f09e5683c1726bbea1d2500d2aaebf930359a22246c73eeb4a1325eb6"]
};

/* ---------------- helpers ---------------- */

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
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
  const render = await A.createRender({ sampleRate: rate, length: src.length, numberOfChannels: 1 }, PAGE);
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
const sources = new Map(), renders = new Map();
const hashLines = [];
for (const c of CASES) {
  const samples = c.make();
  sources.set(c.name, samples);
  const t0 = performance.now();
  const whole = await A.process(buffer(samples, c.rate), c.opts);
  const seconds = (performance.now() - t0) / 1000;
  renders.set(c.name, whole);
  const wav = sha256(await wavBytes(whole.blob)), info = infoHash(whole.codecInfo);
  hashLines.push(`  ${JSON.stringify(c.name)}: [${JSON.stringify(wav)}, ${JSON.stringify(info)}],`);
  if (printHashes) { console.log(hashLines[hashLines.length - 1]); continue; }
  const golden = GOLDEN[c.name];
  check(`${c.name}: process() gives the recorded WAV and codecInfo`, golden && golden[0] === wav && golden[1] === info,
    golden ? `${(samples.length / c.rate).toFixed(1)} s in ${seconds.toFixed(1)} s, ${whole.codecInfo.spurts ?? 0} spurts`
      : `no recorded hash; this run gives ${wav} ${info}`);
}
if (printHashes) process.exit(0);
check('every recorded render is a case of the matrix', Object.keys(GOLDEN).every(name => renders.has(name)));

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
  for (const name of ['steam, loss 15%, jitter 50 ms, net_split 40 ms', 'celt_22, gate on, loss 15%, jitter 300 ms', 'celt_44, gate on, loss 5%',
    'speex, gate on, loss 15%, jitter 300 ms', 'steam_48, loss 10%, jitter 100 ms, snd_bits 10']) {
    check(`${name}: frames are lost`, info(name).lostFrames > 0, `${info(name).lostFrames} lost, ${info(name).underrunFrames} late`);
  }
  for (const name of ['steam, jitter 500 ms (late frames play as silence)', 'celt_22, gate on, loss 15%, jitter 300 ms', 'speex, gate on, loss 15%, jitter 300 ms']) {
    check(`${name}: some frames arrive too late and play as silence`, info(name).underrunFrames > 0, `${info(name).underrunFrames} late`);
  }
  for (const name of ['celt_22, gate on, loss 15%, jitter 300 ms', 'celt_44, gate on, loss 5%', 'speex, gate on, loss 15%, jitter 300 ms']) {
    check(`${name}: the gate opens and closes on the codec's own frames`, info(name).spurts > 1 && info(name).gatedFrames > 0);
  }
  check('the gate-off case sends every frame as one spurt', info('steam, gate off').spurts === 1 && info('steam, gate off').gatedFrames === 0);
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
    && info('steam, silent but for a quarter frame of sine at the end').spurts === 0,
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

/* ---------------- 2. the stream equals process() ---------------- */

// Streams `samples` through createRender in the chunks `plan` gives, into
// one preallocated array, as a caller with a long source would.
async function streamed(rate, samples, opts, plan, onPush = null) {
  const render = await A.createRender({ sampleRate: rate, length: samples.length, numberOfChannels: 1 }, opts);
  const out = new Float32Array(render.outputLength);
  let filled = 0, pushes = 0;
  const put = (y) => {
    assert.ok(y instanceof Float32Array && filled + y.length <= out.length, 'the stream gives Float32Arrays and no more than outputLength samples');
    out.set(y, filled);
    filled += y.length;
  };
  for (let o = 0, k = 0; o < samples.length; k++) {
    const size = Math.min(PLANS[plan](k, rate, samples.length), samples.length - o);
    put(await render.push(samples.subarray(o, o + size)));
    o += size;
    pushes++;
    onPush?.(o);
  }
  const end = await render.finish();
  put(end.samples);
  return { render, out, filled, pushes, end };
}

// How a streamed render differs from process()'s, or null when it does not.
async function difference(whole, got) {
  if (got.filled !== whole.samples.length || got.out.length !== whole.samples.length) return `${got.filled} samples, not ${whole.samples.length}`;
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
console.log('\n[2] createRender, fed in chunks, gives process()\'s samples (bit for bit), WAV and codecInfo');
for (const c of CASES) {
  const whole = renders.get(c.name), samples = sources.get(c.name);
  for (const plan of c.plans) {
    const t0 = performance.now();
    let got, diff;
    try { got = await streamed(c.rate, samples, c.opts, plan); diff = await difference(whole, got); }
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
for (const [opts, named] of [
  [{ listenerPos: 'tunnel' }, 'listenerPos'], [{ listenerPos: 'water' }, 'listenerPos'], [{ listenerPos: null, dspRoom: 6 }, 'dspRoom'],
  [{ listenerPos: null, dspRoom: 99, customEnv: { duration: 1, decay: 2, mix: 0.3 } }, 'dspRoom'], [{ retime: true }, 'retime']
]) {
  const error = await refusal(() => A.createRender(mono(48000, 4800), { ...PAGE, ...opts }));
  check(`createRender refuses ${JSON.stringify(opts)} by name`, error instanceof RangeError && error.message.includes(named), error?.message);
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
