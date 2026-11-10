// Speex 1.0.2 as the game's vaudio_speex module runs it (vendor/speex-1.0.2,
// tests/speex102/build.mjs), checked against a native build of the same source
// and against the reading of the module (docs/reports/W3-09-steam-voice.md,
// section 5), point by point; then the speex profile that runs it (W3-12b).
//   node tests/speex102.verify.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import * as opus from '../opus-codec.mjs';
import { createCodec, createFramer, toInt16, frameSize, packetBytes, version } from '../vendor/speex-1.0.2/index.mjs';
import { testSignals, testRuns, wasmStream, digest, RESET_AT } from './speex102/native.mjs';

let passed = 0;
function check(name, ok, detail = '') {
  assert.ok(ok, `${name}${detail ? ` (${detail})` : ''}`);
  passed++;
  console.log(`  ok    ${name}${detail ? `   [${detail}]` : ''}`);
}
// Speex requests (libspeex/speex.h in 1.0.2).
const GET_ENH = 1, GET_FRAME_SIZE = 3, GET_MODE = 7, GET_COMPLEXITY = 17, GET_BITRATE = 19, GET_SAMPLING_RATE = 25;
const signals = testSignals();
const frames = (x) => Array.from({ length: Math.floor(x.length / frameSize) }, (_, f) => x.subarray(f * frameSize, (f + 1) * frameSize));
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const join = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => { out.set(p, at); return at + p.length; }, 0);
  return out;
};
// Every packet and every decoded frame (floats) of a signal through a new codec.
async function code(x) {
  const codec = await createCodec(), packets = [], floats = new Float32Array(x.length - x.length % frameSize);
  try {
    frames(x).forEach((frame, f) => {
      const packet = codec.encode(frame);
      packets.push(packet);
      floats.set(codec.decodeFloats(packet), f * frameSize);
    });
  } finally {
    codec.free();
  }
  return { packets, floats };
}
function correlate(a, b, lag, margin) {
  let dot = 0, ea = 0, eb = 0;
  for (let i = margin; i < a.length - margin; i++) { dot += a[i] * b[i + lag]; ea += a[i] ** 2; eb += b[i + lag] ** 2; }
  return dot / Math.sqrt(ea * eb);
}
function peakLag(a, b, from, to, margin) {
  let best = from, r = -Infinity;
  for (let lag = from; lag <= to; lag++) { const c = correlate(a, b, lag, margin); if (c > r) { r = c; best = lag; } }
  return { lag: best, r };
}
// Voiced sound with its harmonics from the second up to 3.4 kHz (of the codec's
// 8 kHz, as it believes), for timing: nothing low enough for a high-pass filter
// to turn its phase.
function voiceBand(length) {
  const x = new Int16Array(length);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / 8000, f0 = 180 + 50 * Math.sin(2 * Math.PI * 0.9 * t);
    phase += f0 / 8000;
    let v = 0;
    for (let h = 2; h * f0 <= 3400; h++) v += Math.sin(2 * Math.PI * h * phase + 0.3 * h * h) / h;
    x[i] = Math.round(6000 * v * Math.abs(Math.sin(Math.PI * 2.7 * t)) ** 0.5);
  }
  return x;
}

console.log('[Speex 1.0.2] The WebAssembly build agrees with a native build (tests/speex102/native.mjs)');
{
  // Recorded once from `node tests/speex102/native.mjs`: the pinned sources built
  // natively with gcc 13.3 and glibc on x86-64 (SSE2, no contraction, no
  // fast-math); a new codec per signal, and the speech-like signal again with
  // reset() before frame 138. SHA-256 of the packets, of the decoded floats and
  // of the 16-bit output the module makes of them.
  const NATIVE = {
    speech: [276, '6892b0435185a87350f4e25113d5555c105db884c74f76e530f6b0dc5b093daf',
      'e1a5ce6e673baa0c163e044ecb6539daafb30d1227e6fe2622db56783647de5f', 'dd3443590a45aa5c7ace86858f9e0a0183567b264a5904735a0dfd90e2159e21'],
    square: [100, '5133a8131899b9940b969dc07e2c50e7e29a9c107015ceda475f639186ffe930',
      '819e3457f21d8c03bd49016f52271855b419584d03629b02d60680286fd34b41', '923fca5e620d615f60a4182800c858e7a38332b195d130af807cf7ce785e4e41'],
    silence: [40, 'd584f088de8f8f1e50cb2f09cdd9b38ea531deaac3ebc1b535e68aea56aed0e1',
      'c65206769723a13afe80c0d925531639ceef9c2eb97eee3b1b542739ec40597f', '59ec91dcb7dc65b5f928091cb0e25c26729a0a4453ebe7d8244fc1ceae7d9712'],
    noise: [100, 'c06f01fbebf29af8d7535a0d2d42c59c49eccd719f08c44b592057c6f301b1a7',
      '08d9358482294a39c536ede86eec919f8e4c42f48ee2f3adf4e5fec7acccc7f2', 'b3e57a538ac7ab3344111b6c4ae845d3124c24786d1090e676bf0266c4c18903'],
    speechReset: [276, 'c105432d886f024fdd2d7ecbab934f5f5eabc89ff44f91fe9ba8a656b810de66',
      '74f0b71c19f806d24846999ac794bb3a33f540b2774b9552d114e4f6124f4266', '57172332a339ebdb3f2bf5d70342aa6f1472ce109866f14c0f13aa180f3c1594']
  };
  const label = (name) => (name === 'speechReset' ? `speech with reset() before frame ${RESET_AT}` : name);
  for (const { name, signal, resetAt } of testRuns()) {
    const [count, packets, floats, samples] = NATIVE[name];
    const wasm = digest(await wasmStream(signal, resetAt));
    check(`${label(name)}: packets, decoded floats and 16-bit output match the native build bit for bit`,
      wasm.frames === count && wasm.packets === packets && wasm.floats === floats && wasm.samples === samples,
      `${wasm.frames} frames`);
  }
  // wasmStream converts the floats itself; the codec's own decode() must give
  // the 16-bit output of the native build, which converts with a C cast. The
  // reset case pins what request 26 leaves of the decoder: a new decoder in
  // its place, or no decoder reset, gives other sound.
  for (const { name, signal, resetAt } of testRuns()) {
    const codec = await createCodec(), hash = crypto.createHash('sha256');
    frames(signal).forEach((frame, f) => {
      if (f === resetAt) codec.reset();
      hash.update(new Uint8Array(codec.decode(codec.encode(frame)).buffer));
    });
    codec.free();
    const got = hash.digest('hex');
    check(`${label(name)}: decode() gives the native build's 16-bit output`, got === NATIVE[name][3], got.slice(0, 16));
  }
}

console.log('\n[Speex 1.0.2] Section 5, point by point');
{
  const codec = await createCodec();
  check('the frame is 160 samples and the packet 20 bytes (the library\'s own frame size, request 3, on both)',
    codec.frameSize === 160 && frameSize === 160 && codec.packetBytes === 20 && packetBytes === 20
    && codec.encoderCtl(GET_FRAME_SIZE) === 160 && codec.decoderCtl(GET_FRAME_SIZE) === 160,
    `${codec.encoderCtl(GET_FRAME_SIZE)} / ${codec.decoderCtl(GET_FRAME_SIZE)}`);
  check('the encoder is in sub-mode 3 (request 7) at 8000 bit/s (request 19), complexity 2 (request 17)',
    codec.encoderCtl(GET_MODE) === 3 && codec.encoderCtl(GET_BITRATE) === 8000 && codec.encoderCtl(GET_COMPLEXITY) === 2,
    `mode ${codec.encoderCtl(GET_MODE)}, ${codec.encoderCtl(GET_BITRATE)} bit/s, complexity ${codec.encoderCtl(GET_COMPLEXITY)}`);
  check('the decoder\'s enhancement is on (request 1)', codec.decoderCtl(GET_ENH) === 1, `${codec.decoderCtl(GET_ENH)}`);
  check('both are told 8000 Hz (request 24, read back with 25)',
    codec.encoderCtl(GET_SAMPLING_RATE) === 8000 && codec.decoderCtl(GET_SAMPLING_RATE) === 8000,
    `${codec.encoderCtl(GET_SAMPLING_RATE)} / ${codec.decoderCtl(GET_SAMPLING_RATE)}`);
  codec.free();
  const all = [];
  for (const signal of Object.values(signals)) {
    const encoder = await createCodec();
    for (const frame of frames(signal)) all.push(encoder.encode(frame));
    encoder.free();
  }
  check(`every packet is 20 bytes (${all.length} packets of the four test signals)`,
    all.length === 516 && all.every(p => p.length === 20));
  // A narrowband frame starts with the wideband bit (0) and a 4-bit sub-mode.
  const wrong = all.filter(p => p[0] >> 3 !== 0b00011);
  check('the first five bits of every packet say narrowband, sub-mode 3', wrong.length === 0,
    `${wrong.length} packets otherwise${wrong.length ? `, first ${wrong[0][0].toString(2).padStart(8, '0')}` : ''}`);
  check('the version is Speex 1.0.2', version === 'Speex 1.0.2');
}

console.log('\n[Speex 1.0.2] It is 1.0.2 and not a neighbour');
{
  // The Speex 1.2.1 module the profile ran before W3-12b (vendor/speex, since
  // removed): the SHA-256 of its packets back to back on the speech-like
  // signal, recorded before it was removed. To reproduce it, take
  // vendor/speex/index.mjs and speex-1.2.1.wasm.mjs from main at b492111 (the
  // last commit that has them: `git show b492111:vendor/speex/index.mjs`),
  // make createCodec(4) (quality 4, the same sub-mode as the module's), and
  // encode testSignals().speech (tests/speex102/native.mjs) 160 samples at a
  // time, each 16-bit sample / 32768 as a float. A 1.2.1 build behind this
  // module's interface would give these packets.
  const SPEEX_121_SPEECH_PACKETS = '4de57d83ef2dc9e6c30e84233ec44b3b68a2588509efbb21c2efa43618525f80';
  const own = await code(signals.speech);
  const hash = crypto.createHash('sha256');
  for (const packet of own.packets) hash.update(packet);
  const got = hash.digest('hex');
  check('on the speech-like signal the packets are not those of the Speex 1.2.1 module (its recorded hash)',
    got !== SPEEX_121_SPEECH_PACKETS, got.slice(0, 16));
}

console.log('\n[Speex 1.0.2] Decoded samples wrap past full scale');
{
  const codec = await createCodec(), floatsOf = await createCodec();
  let passedFull = 0, jumps = 0, mismatches = 0, peak = 0, firstJump = '';
  let previous = null;   // the last 16-bit sample and float of the frame before
  for (const frame of frames(signals.square)) {
    const packet = codec.encode(frame);
    floatsOf.encode(frame);
    const out = codec.decode(packet), floats = floatsOf.decodeFloats(packet);
    for (let i = 0; i < frameSize; i++) {
      const x = floats[i];
      peak = Math.max(peak, Math.abs(x));
      if (out[i] !== ((Math.trunc(x) << 16) >> 16)) mismatches++;
      const over = x > 32767 || x < -32768;
      if (over) passedFull++;
      const before = i ? [out[i - 1], floats[i - 1]] : previous;
      // A wrap: the output leaps by more than 60000 where the wave itself
      // moved by less (a clamp can never move the output more than the wave).
      if (over && before && Math.abs(out[i] - before[0]) > 60000 && Math.abs(x - before[1]) < 60000) {
        if (!jumps++) firstJump = `${before[0]} to ${out[i]} where the float went from ${before[1].toFixed(1)} to ${x.toFixed(1)}`;
      }
    }
    previous = [out[frameSize - 1], floats[frameSize - 1]];
  }
  codec.free(); floatsOf.free();
  check('a full-scale square wave decodes past full scale, and the 16-bit output wraps there (a jump of more than 60000)',
    passedFull > 0 && jumps > 0, `peak ${peak.toFixed(1)}; ${passedFull} samples past full scale, ${jumps} jumps; first ${firstJump}`);
  check('the 16-bit output is (trunc(x) << 16) >> 16 of the decoded floats, sample for sample', mismatches === 0,
    `${mismatches} samples differ`);
  const examples = toInt16(Float32Array.of(32768.7, -32769.2, 32767.9, -32768.9, 0.9, -0.9));
  check('32768.7 gives -32768, -32769.2 gives 32767; truncation toward zero inside the range',
    sameBytes(examples, Int16Array.of(-32768, 32767, 32767, -32768, 0, 0)), Array.from(examples).join(' '));
}

console.log('\n[Speex 1.0.2] The frame wrapper');
{
  // 165 samples a call: what the engine hands over each 15 ms tick at 11025 Hz.
  const signal = signals.speech, codec = await createCodec(), framer = createFramer(codec), lengths = [], packets = [];
  let keptBefore32 = -1;
  for (let k = 1; k <= 64; k++) {
    if (k === 32) keptBefore32 = framer.kept;
    const packet = framer.compress(signal.subarray((k - 1) * 165, k * 165));
    lengths.push(packet.length);
    packets.push(packet);
  }
  codec.free();
  const odd = lengths.map((n, k) => (n === 20 ? '' : `call ${k + 1}: ${n}`)).filter(Boolean);
  check('165 samples a call give one 20-byte packet, and a 40-byte one every 32nd call',
    lengths.every((n, k) => n === ((k + 1) % 32 === 0 ? 40 : 20)) && keptBefore32 === 155,
    `${odd.join(', ')}; the 32nd call starts with ${keptBefore32} kept`);
  // The packets are the frames back to back, with nothing before, between or after.
  const direct = await code(signal.subarray(0, 64 * 165));
  check('the packets are the frames of a frame-by-frame encoding, back to back',
    sameBytes(join(packets), join(direct.packets)), `${join(packets).length} bytes`);
  // Ten seconds of 11025 Hz sound in 165-sample calls.
  const tenSeconds = new Int16Array(110250).map((_, i) => signal[i % signal.length]);
  const c2 = await createCodec(), f2 = createFramer(c2);
  let bytes = 0;
  for (let at = 0; at < tenSeconds.length; at += 165) bytes += f2.compress(tenSeconds.subarray(at, at + 165)).length;
  c2.free();
  check('68.9 frames a second', bytes / 20 === 689, `${bytes / 20} frames in 10 s`);
  // The final call pads what is kept with zeros to a frame.
  // 300 samples, then 100 with `final`: two whole frames, and 80 kept that the
  // final call pads to a third.
  const c3 = await createCodec(), f3 = createFramer(c3);
  const head = f3.compress(signal.subarray(0, 300)), tail = f3.compress(signal.subarray(300, 400), true);
  const third = new Int16Array(160);
  third.set(signal.subarray(320, 400));
  const r2 = await createCodec(), want = join([r2.encode(signal.subarray(0, 160)), r2.encode(signal.subarray(160, 320)), r2.encode(third)]);
  c3.free(); r2.free();
  check('the final call pads what is kept with zeros to a frame',
    head.length === 20 && tail.length === 40 && sameBytes(join([head, tail]), want) && f3.kept === 0,
    `${head.length} + ${tail.length} bytes`);
  // decompress of the joined packets equals frame-by-frame decoding, and a
  // remainder under 20 bytes is ignored.
  const all = join(packets), c4 = await createCodec(), f4 = createFramer(c4), c5 = await createCodec();
  const out = f4.decompress(join([all, new Uint8Array(13).fill(0x5a)]));
  const byFrame = new Int16Array(all.length / 20 * 160);
  for (let f = 0; f < all.length / 20; f++) byFrame.set(c5.decode(all.subarray(f * 20, (f + 1) * 20)), f * 160);
  c4.free(); c5.free();
  check('decompress of the joined packets equals frame-by-frame decoding, and ignores a remainder',
    sameBytes(out, byFrame), `${out.length} samples from ${all.length + 13} bytes`);
}

console.log('\n[Speex 1.0.2] Reset and delay');
{
  const signal = signals.speech, half = 138;
  const used = await createCodec(), fresh = await createCodec();
  const parts = frames(signal);
  parts.slice(0, half).forEach(frame => used.decode(used.encode(frame)));
  used.reset();
  const after = parts.slice(half).map(frame => used.encode(frame)), anew = parts.slice(half).map(frame => fresh.encode(frame));
  used.free(); fresh.free();
  const differ = after.filter((p, f) => !sameBytes(p, anew[f])).length;
  check('after reset() the same input gives the same packets as a new codec', differ === 0,
    `${differ} of ${after.length} packets differ`);
  // The encode and decode pair's delay, which 1.0.2 has no request for: the
  // decoded voice lines up with its source 80 samples later.
  const x = voiceBand(200 * 160), { floats } = await code(x);
  const { lag, r } = peakLag(x, floats, 0, 300, 2000);
  check('the encoder and decoder together delay the sound by 80 samples (7.26 ms at 11025 Hz)', lag === 80 && r > 0.9,
    `peak at ${lag}, r ${r.toFixed(3)}`);
}

console.log('\n[Speex 1.0.2] Codecs side by side');
{
  // The module's memory grows as codecs are made (about a page each), which
  // detaches every view of it made before. A codec made first, used while many
  // others are made, must give what it gives alone.
  const parts = frames(signals.speech), alone = await createCodec(), solo = [];
  for (const frame of parts) { const p = alone.encode(frame); solo.push([p, alone.decode(p)]); }
  alone.free();
  const first = await createCodec(), others = [];
  let wrong = -1, failure = '';
  for (let f = 0; f < parts.length && wrong < 0; f++) {
    try {
      if (f % 10 === 0) for (let k = 0; k < 4; k++) others.push(await createCodec());
      const p = first.encode(parts[f]), d = first.decode(p);
      if (!sameBytes(p, solo[f][0]) || !sameBytes(d, solo[f][1])) wrong = f;
    } catch (error) {
      wrong = f;
      failure = `: ${error.message}`;
    }
  }
  // And two codecs interleaved frame by frame, each on its own signal.
  const a = await createCodec(), b = await createCodec();
  let interleaved = true;
  parts.forEach((frame, f) => {
    const pa = a.encode(frame), pb = b.encode(parts[parts.length - 1 - f]);
    const da = a.decode(pa);
    b.decode(pb);
    if (!sameBytes(pa, solo[f][0]) || !sameBytes(da, solo[f][1])) interleaved = false;
  });
  for (const c of [first, a, b, ...others]) c.free();
  check('a codec gives what it gives alone while other codecs are made and used beside it', wrong < 0 && interleaved,
    `${others.length} codecs made during the run${wrong >= 0 ? `; wrong at frame ${wrong}${failure}` : ''}${interleaved ? '' : '; interleaved differs'}`);
}


// ---------------------------------------------------------------------------
// The speex profile (W3-12b): the module above on the engine's 11025 Hz sound,
// with no resampling to 8000 Hz, through audio.js.
// ---------------------------------------------------------------------------
// Steam's sender and the decoder's resampler load beside audio.js, as on the page.
const engineCode = ['../constants.js', '../steam-sender.js', '../vendor/swresample/swresample.js', '../audio.js']
  .map((f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
// audio.js on an opus-codec.mjs whose Speex calls are watched: the samples and
// packets of each speexRoundTrip a render makes (the 11025 Hz voice signal,
// before the receiver), and each frame-by-frame stream's restarts, decodes and
// lost frames.
function watchedEngine() {
  const log = { trips: [], restarts: 0, decodes: 0, conceals: 0, sent: [] };
  const watch = (make) => async (...args) => {
    const stream = await make(...args);
    return { ...stream,
      get wrapped() { return stream.wrapped; },
      async restart() { log.restarts++; log.sent.push('restart'); return stream.restart(); },
      encode(frame) { const encoded = stream.encode(frame); log.sent.push(Array.from(encoded.packet).join()); return encoded; },
      decode(packet) { log.decodes++; return stream.decode(packet); },
      conceal() { log.conceals++; return stream.conceal(); },
      free() { stream.free(); } };
  };
  const watched = { ...opus, createVoiceStream: watch(opus.createVoiceStream), createCeltStream: watch(opus.createCeltStream),
    createSpeexStream: watch(opus.createSpeexStream),
    async speexRoundTrip(samples, rate, options) {
      const packets = [];
      const result = await opus.speexRoundTrip(samples, rate, { ...options, onPacket: (f, packet) => packets.push({ f, packet }) });
      log.trips.push({ input: Float32Array.from(samples), rate, output: result.samples, info: result.info, packets });
      return result;
    } };
  const box = { window: {}, Blob, console, TF2Opus: watched };
  vm.createContext(box);
  vm.runInContext(engineCode, box);
  return { A: box.window.TF2Audio, log, profiles: vm.runInContext('CODEC_PROFILES', box) };
}
const { A, profiles: PROFILES } = watchedEngine();
const { FRAME } = opus;
const NB = 11025;   // the engine's rate for vaudio_speex: the codec's and the voice's
const buffer = (data, sampleRate) => ({ sampleRate, length: data.length, numberOfChannels: 1, getChannelData: () => data });
const rms = (x, a = 0, b = x.length) => { let t = 0; for (let i = a; i < b; i++) t += x[i] * x[i]; return Math.sqrt(t / Math.max(1, b - a)); };
const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
function lcgFloat(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 * 2 - 1; };
}
// Voiced sound with harmonics from the second up to 4.5 kHz, in syllables.
function voiced(seconds, rate, level = 0.2) {
  const x = new Float32Array(Math.round(seconds * rate));
  let phase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / rate, f0 = 170 + 50 * Math.sin(2 * Math.PI * 0.9 * t);
    phase += f0 / rate;
    let v = 0;
    for (let h = 2; h * f0 <= 4500; h++) v += Math.sin(2 * Math.PI * h * phase + 0.3 * h * h) / h;
    x[i] = level * v * Math.abs(Math.sin(Math.PI * 2.7 * t)) ** 0.5;
  }
  return x;
}
// Mean power per bin in [lo, hi) Hz, in dB (Welch, 1024-point Hann): a
// spectral level, so bands of different widths compare.
function bandLevel(x, rate, lo, hi) {
  const n = 1024, re = new Float64Array(n), im = new Float64Array(n);
  let power = 0, bins = 0;
  for (let start = 0; start + n <= x.length; start += n / 2) {
    for (let i = 0; i < n; i++) { re[i] = x[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)); im[i] = 0; }
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(-2 * Math.PI * k / len), sn = Math.sin(-2 * Math.PI * k / len), q = i + k + len / 2;
        const xr = re[q] * c - im[q] * sn, xi = re[q] * sn + im[q] * c;
        re[q] = re[i + k] - xr; im[q] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi;
      }
    }
    for (let k = 1; k < n / 2; k++) {
      const f = k * rate / n;
      if (f >= lo && f < hi) { power += re[k] ** 2 + im[k] ** 2; bins++; }
    }
  }
  return 10 * Math.log10(Math.max(power / Math.max(1, bins), 1e-30));
}
// The lag of the highest normalised correlation of b against a within +-span,
// with its parabolic fraction.
function bestLag(a, b, span, margin) {
  const r = {};
  let lag = -span;
  for (let l = -span; l <= span; l++) { r[l] = correlate(a, b, l, margin); if (r[l] > r[lag]) lag = l; }
  const fraction = lag > -span && lag < span ? 0.5 * (r[lag - 1] - r[lag + 1]) / (r[lag - 1] - 2 * r[lag] + r[lag + 1]) : 0;
  return { lag, at: lag + fraction, r: r[lag] };
}

console.log('\n[speex profile] The profile and what a render says it ran');
{
  const p = PROFILES.speex;
  check('the profile: Speex at 11025 Hz (the voice rate too), 160-sample frames in 20 bytes, 11025 bit/s, no sender gate',
    p.engine === 'speex' && p.codecRate === 11025 && p.voiceRate === 11025 && p.frameSize === 160 && p.packetBytes === 20
    && p.bitrate === 11025 && p.mixer === 'linear' && !p.senderGate && !('qualityBitrates' in p)
    && p.displayName === 'vaudio_speex (Speex 1.0.2 on 11 kHz sound, 11 kbps)',
    `${p.codecRate} Hz, ${p.frameSize} samples, ${p.packetBytes} bytes, ${p.bitrate} bit/s; ${p.displayName}`);
  const src = voiced(1, 48000);
  const r = await A.process(buffer(src, 48000), { codec: 'speex' });
  const info = r.codecInfo;
  check('a render\'s codecInfo: Speex 1.0.2 at 11025 Hz, 14.51 ms frames of 160 samples, 20 bytes, 11025 bit/s',
    r.realOpus && info.backend === 'speex' && info.version === 'Speex 1.0.2' && info.runtime === 'speex-1.0.2'
    && info.sampleRate === 11025 && info.frameSamples === 160 && info.frameMs.toFixed(2) === '14.51' && info.packetBytes === 20
    && info.bitrate === 11025 && info.lookahead === 80 && info.voiceRate === 11025,
    `${info.version}, ${info.sampleRate} Hz, ${info.frameMs.toFixed(2)} ms, ${info.packetBytes} bytes, ${info.bitrate} bit/s`);
  check('quality 4, complexity 2 and enhancement on, read back from the codec; constant bit rate, no DTX; a lost frame plays as zeros',
    info.quality === 4 && info.complexity === 2 && info.enhancement === true && !info.vbr && !info.dtx && info.dtxFrames === 0
    && info.plc === 'zeros', `quality ${info.quality}, complexity ${info.complexity}, enhancement ${info.enhancement}, plc ${info.plc}`);
  check('every frame is one 20-byte packet, logged and counted as Speex (code 7)', info.frames === Math.ceil((Math.round(src.length * NB / 48000) + 80) / 160)
    && info.frameBytes.every(b => b === 20) && info.encodedBytes === 20 * info.frames && info.frameLog.every(c => c === FRAME.speex)
    && FRAME.speex === 7 && JSON.stringify(info.modes) === JSON.stringify({ silk: 0, hybrid: 0, celt: 0, speex: info.frames }),
    `${info.frames} frames, ${info.encodedBytes} bytes`);
  check('no sender gate by default: the engine codec transmits continuously', info.gate === null && info.gatedFrames === 0);
  // snd_bits picks nothing: the module has one table row for the engine's argument.
  const short = src.subarray(0, 24000), base = await A.process(buffer(short, 48000), { codec: 'speex' }), differ = [];
  for (const bits of [2, 4, 10, 15, 24, 32]) {
    const other = await A.process(buffer(short, 48000), { codec: 'speex', bits });
    if (!same(other.samples, base.samples) || other.codecInfo.bitrate !== 11025 || !other.codecInfo.frameBytes.every(b => b === 20)) differ.push(bits);
  }
  check('snd_bits changes nothing: every value gives the same samples, 20-byte packets and 11025 bit/s', differ.length === 0,
    differ.length ? `differs at snd_bits ${differ.join(' ')}` : 'snd_bits 2, 4, 10, 15, 24, 32 as 16');
  await assert.rejects(() => opus.speexRoundTrip(new Float32Array(160), 8000), /runs on 11025 Hz sound/);
  await assert.rejects(() => opus.createSpeexStream(8000), /runs on 11025 Hz sound/);
  check('the codec refuses sound at any rate but 11025 Hz', true);
}

console.log('\n[speex profile] Where the 16 bits are made');
{
  // speexInput: x * 32768 to nearest, ties to even, clamped.
  const got = opus.speexInput(Float32Array.of(0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 3.25, 32767.5, 40000, -32768.5, -40000).map(v => v / 32768));
  check('the float sound is rounded to 16 bits with ties to even and clamped (0.5 to 0, 1.5 to 2, 2.5 to 2, past full scale to 32767 and -32768)',
    sameBytes(got, Int16Array.of(0, 2, 2, 0, -2, -2, 3, 32767, 32767, -32768, -32768)), Array.from(got).join(' '));
  // The stream's encode is the module's encode of that rounding, and its
  // decode the module's 16-bit output / 32768. A frame of half steps would
  // code otherwise if anything rounded another way, or earlier.
  const stream = await opus.createSpeexStream(NB), codec = await createCodec();
  const frames160 = Array.from({ length: 40 }, (_, f) => Float32Array.from({ length: 160 }, (_, i) => (Math.round(9000 * Math.sin((f * 160 + i) * 0.07)) + 0.5) / 32768));
  let packetsDiffer = 0, outputDiffer = 0, notSteps = 0;
  for (const frame of frames160) {
    const e = stream.encode(frame), want = codec.encode(opus.speexInput(frame));
    if (!sameBytes(e.packet, want)) packetsDiffer++;
    const out = stream.decode(e.packet), q = codec.decode(want);
    for (let i = 0; i < 160; i++) { if (out[i] * 32768 !== q[i]) outputDiffer++; if (!Number.isInteger(out[i] * 32768)) notSteps++; }
  }
  stream.free(); codec.free();
  check('the stream encodes that rounding with the module, and decodes to the module\'s 16-bit samples / 32768',
    packetsDiffer === 0 && outputDiffer === 0 && notSteps === 0, `${packetsDiffer} packets and ${outputDiffer} samples differ; ${notSteps} not whole steps`);
}

console.log('\n[speex profile] Sound: the band to 5.5 kHz, nothing shifted, the delay trimmed');
{
  // Seeded white noise at -20 dBFS RMS, at 11025 Hz, the gain off. Measured
  // on the 11025 Hz voice signal, the codec's output in the render (the hook),
  // so that the mixer's images and its droop are not in the bands.
  const { A: W, log } = watchedEngine();
  const next = lcgFloat(20261110), amp = 0.1 * Math.sqrt(3);
  const noise = Float32Array.from({ length: 6 * NB }, () => amp * next());
  const r = await W.process(buffer(noise, NB), { codec: 'speex', agc: false, volume: 1 });
  const voice = log.trips[0].output, rate = log.trips[0].info.sampleRate;
  const speech = bandLevel(voice, rate, 700, 2700), top = bandLevel(voice, rate, 4300, 4900);
  const renderTop = bandLevel(r.samples, r.sampleRate, 4300, 4900) - bandLevel(r.samples, r.sampleRate, 700, 2700);
  check('white noise at -20 dBFS: 4.3 to 4.9 kHz is within 8 dB of 0.7 to 2.7 kHz (the codec sees 3.1 to 3.6 kHz)',
    rate === NB && Math.abs(top - speech) <= 8 && log.trips.length === 1,
    `${(top - speech).toFixed(1)} dB at the voice rate (${rate} Hz); ${renderTop.toFixed(1)} dB in the render at ${r.sampleRate} Hz, the mixer's droop included`);
  // A train of pulses 200 a second: one sample of 0.5 every 55.125 samples.
  const pulses = new Float32Array(3 * NB);
  for (let k = 0; Math.round(k * 55.125) < pulses.length; k++) pulses[Math.round(k * 55.125)] = 0.5;
  const out = (await A.process(buffer(pulses, NB), { codec: 'speex', agc: false, volume: 1 })).samples, sr = 44100;
  let best = 0, bestR = -Infinity;
  for (let lag = Math.round(0.002 * sr); lag <= Math.round(0.0075 * sr); lag++) {
    const c = correlate(out, out, lag, sr / 4);
    if (c > bestR) { bestR = c; best = lag; }
  }
  const ms = 1000 * best / sr;
  check('nothing is shifted: pulses 200 a second come out with their strongest autocorrelation lag between 4.9 and 5.1 ms',
    ms >= 4.9 && ms <= 5.1, `${ms.toFixed(3)} ms, r ${bestR.toFixed(3)}`);
  // A voice-band source: on the codec's own timeline, and in the render.
  const { A: W2, log: log2 } = watchedEngine();
  const x = voiced(3, NB);
  await W2.process(buffer(x, NB), { codec: 'speex', agc: false, volume: 1 });
  const own = bestLag(log2.trips[0].input, log2.trips[0].output, 40, 800);
  const x48 = voiced(3, 48000), r48 = (await A.process(buffer(x48, 48000), { codec: 'speex', agc: false, volume: 1 })).samples;
  const at48 = bestLag(x48, r48, 60, 12000);
  check('the codec\'s 80 samples are trimmed: a voice-band source comes out aligned within one sample at 11025 Hz',
    own.lag === 0 && Math.abs(own.at) < 1 && Math.abs(at48.at) < 48000 / NB && own.r > 0.8 && log2.trips[0].info.lookahead === 80,
    `at 11025 Hz ${own.at.toFixed(2)} samples (r ${own.r.toFixed(3)}); the render at 48 kHz ${at48.at.toFixed(2)} samples (r ${at48.r.toFixed(3)})`);
}

console.log('\n[speex profile] Decoded samples wrap: the count at the decoder\'s output');
{
  // A loud voice: some decoded samples pass full scale and wrap.
  const loud = Float32Array.from(voiced(2, 48000, 1.2), v => Math.max(-1, Math.min(1, v)));
  const r = await A.process(buffer(loud, 48000), { codec: 'speex', agc: false, volume: 1 });
  check('a loud source gives wrapped samples in the render (counted at the decoder\'s output)', r.codecInfo.wrappedSamples > 0,
    `${r.codecInfo.wrappedSamples} samples wrapped`);
  // createRender, pushed in uneven pieces, gives process()'s samples and
  // codecInfo, at a snd_bits other than 16 (which changes nothing).
  const at4 = await A.process(buffer(loud, 48000), { codec: 'speex', agc: false, volume: 1, bits: 4 });
  const piecewise = await A.createRender({ sampleRate: 48000, length: loud.length, numberOfChannels: 1 }, { codec: 'speex', agc: false, volume: 1, bits: 4 });
  const parts = [];
  for (let o = 0, k = 0; o < loud.length; k++) {
    const size = 3000 + 777 * (k % 5);
    parts.push(await piecewise.push(loud.subarray(o, Math.min(loud.length, o + size))));
    o += size;
  }
  const end = await piecewise.finish();
  parts.push(end.samples);
  const pieces = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((o, p) => { pieces.set(p, o); return o + p.length; }, 0);
  const infoDiffers = Object.keys(at4.codecInfo).filter(k => JSON.stringify(at4.codecInfo[k]) !== JSON.stringify(end.codecInfo[k]));
  check('createRender at snd_bits 4 gives that render too: its samples, its count and the rest of its codecInfo',
    same(pieces, r.samples) && same(at4.samples, r.samples) && end.codecInfo.wrappedSamples === r.codecInfo.wrappedSamples
    && infoDiffers.length === 0 && end.codecInfo.bitrate === 11025,
    `${end.codecInfo.wrappedSamples} wrapped; ${pieces.length} samples${infoDiffers.length ? `; codecInfo differs: ${infoDiffers.join(', ')}` : ''}`);
  // The count's edges, on made-up decoder floats through the module's toInt16:
  // 32768 is the first float that wraps, -32769 the first below.
  const edges = Float32Array.of(32767.9, 32768, 32768.5, -32768.5, -32769, -32769.5, 1000, -1000);
  const counted = opus.countWrapped(edges, toInt16(edges));
  check('the count takes a float of 32768 or more, or -32769 or less, whose 16-bit sample crossed zero', counted === 4,
    `${counted} of 32767.9, 32768, 32768.5, -32768.5, -32769, -32769.5, 1000, -1000 (4 expected)`);
  // Part a's own speech-like signal as the module gets it: its 16-bit samples
  // at 11025 Hz, each / 32768, the microphone gain at 1 and no filter, so that
  // only the new rounding stands before the codec. Through the profile's
  // stream, frame by frame, its 276 frames wrap 2,106 samples (part a's
  // count); a render codes a 277th frame to flush the codec's 80-sample delay,
  // which wraps 16 more.
  const speech = Float32Array.from(signals.speech, v => v / 32768);
  const stream = await opus.createSpeexStream(NB);
  for (let f = 0; f < speech.length / 160; f++) stream.decode(stream.encode(speech.subarray(f * 160, (f + 1) * 160)).packet);
  const streamed = stream.wrapped;
  stream.free();
  const rs = await A.process(buffer(speech, NB), { codec: 'speex', agc: false, volume: 1 });
  check('part a\'s speech-like signal wraps 2,106 samples in its 276 frames, and 2,122 in a render (277 frames)',
    streamed === 2106 && rs.codecInfo.wrappedSamples === 2122 && rs.codecInfo.frames === 277,
    `${streamed} through the stream; ${rs.codecInfo.wrappedSamples} in a render of ${rs.codecInfo.frames} frames`);
}

// Two identical 1.4 s parts at 48 kHz: a -65 dBFS noise floor and a voiced
// burst from 0.4 to 0.9 s. With the gate on they make two talk spurts.
const gateParts = (() => {
  const part = new Float32Array(Math.round(1.4 * 48000)), next = lcgFloat(11);
  let phase = 0;
  for (let i = 0; i < part.length; i++) {
    part[i] = 0.001 * next();
    if (i >= 0.4 * 48000 && i < 0.9 * 48000) {
      const f0 = 170 + 30 * Math.sin(2 * Math.PI * 1.3 * i / 48000);
      phase += f0 / 48000;
      for (let h = 2; h * f0 <= 4500; h++) part[i] += 0.1 * Math.sin(2 * Math.PI * h * phase + 0.3 * h * h) / h;
    }
  }
  const x = new Float32Array(2 * part.length);
  x.set(part); x.set(part, part.length);
  return x;
})();

console.log('\n[speex profile] A new talk spurt is the codec\'s reset, never a new codec');
{
  const { A: W, log } = watchedEngine();
  const r = await W.process(buffer(gateParts, 48000), { codec: 'speex', gate: true, agc: false, volume: 1 });
  const info = r.codecInfo, trip = log.trips[0];
  // The gate counts 14.51 ms frames: 120 ms of pre-roll is 8, 440 ms of hold 30.
  check('the profile\'s gate switch reaches the Speex round trip, in 14.51 ms frames (pre-roll 8, hold 30)',
    info.gate === -39.5 && info.spurts === 2 && info.prerollFrames === 8 && info.holdFrames === 30
    && info.frameBytes.every((n, f) => (info.frameLog[f] === FRAME.gated) === (n === 0)),
    `${info.spurts} spurts, ${info.gatedFrames} of ${info.frames} frames gated, pre-roll ${info.prerollFrames}, hold ${info.holdFrames}`);
  // The spurts, from the packets sent.
  const spurts = [];
  trip.packets.forEach(({ f, packet }, k) => {
    if (!k || f !== trip.packets[k - 1].f + 1) spurts.push([]);
    spurts[spurts.length - 1].push({ f, packet });
  });
  // The decoder as the module runs it: the first spurt, reset(), the second;
  // and the second spurt by a new codec instead.
  const decodeAll = (codec, list) => list.map(({ packet }) => codec.decode(packet));
  const kept = await createCodec(), fresh = await createCodec();
  decodeAll(kept, spurts[0]);
  kept.reset();
  const withReset = decodeAll(kept, spurts[1]), withNew = decodeAll(fresh, spurts[1]);
  kept.free(); fresh.free();
  // Frame f plays from f * 160 - 80.
  const played = (f) => trip.output.subarray(f * 160 - 80, f * 160 + 80);
  const frameAs = (q) => Float32Array.from(q.subarray(0, 160), v => v / 32768);
  const second = spurts[1] || [];
  const asReset = second.every(({ f }, k) => same(played(f), frameAs(withReset[k]).subarray(0, played(f).length)));
  const firstThree = second.slice(0, 3).map(({ f }, k) => same(played(f), frameAs(withNew[k]).subarray(0, played(f).length)));
  check('the second spurt\'s decoded frames are those of a decoder reset (request 26) between the spurts',
    spurts.length === 2 && second.length > 20 && asReset, `${spurts.length} spurts of ${spurts.map(s => s.length).join(' and ')} frames`);
  check('and not those of a new codec: at least one of its first three frames differs', firstThree.includes(false),
    `the first three frames ${firstThree.map(v => (v ? 'equal' : 'differ')).join(', ')} with a new codec`);
  // The encoder side: the packets are those of an encoder reset between the
  // spurts, fed the same frames of the codec's input.
  const enc = await createCodec(), frameOf = (f) => {
    const frame = new Float32Array(160);
    frame.set(trip.input.subarray(f * 160, Math.min(trip.input.length, (f + 1) * 160)));
    return opus.speexInput(frame);
  };
  let encoderAgrees = true;
  spurts.forEach((list, k) => {
    if (k) enc.reset();
    for (const { f, packet } of list) if (!sameBytes(enc.encode(frameOf(f)), packet)) encoderAgrees = false;
  });
  enc.free();
  check('the encoder is reset too: every packet is that of an encoder reset (request 26) between the spurts', encoderAgrees);
  // The stream (createRender and the live chain): restart() is the same reset.
  const stream = await opus.createSpeexStream(NB), ref = await createCodec();
  const frames40 = Array.from({ length: 40 }, (_, f) => Float32Array.from(signals.speech.subarray(f * 160, f * 160 + 160), v => v / 32768));
  const pass = () => frames40.map(frame => stream.decode(stream.encode(frame).packet));
  pass();
  await stream.restart();
  const again = pass();
  frames40.forEach(frame => ref.decode(ref.encode(opus.speexInput(frame))));
  ref.reset();
  const refAgain = frames40.map(frame => frameAs(ref.decode(ref.encode(opus.speexInput(frame)))));
  stream.free(); ref.free();
  const newCodec = await opus.createSpeexStream(NB), fromNew = frames40.map(frame => newCodec.decode(newCodec.encode(frame).packet));
  newCodec.free();
  check('the stream\'s restart() is the codec\'s reset, not a new codec',
    again.every((o, i) => same(o, refAgain[i])) && !again.slice(0, 3).every((o, i) => same(o, fromNew[i])));
}

console.log('\n[speex profile] Loss: a lost frame plays as zeros, and the decoder never sees it');
{
  const x = voiced(2, NB), lost = 40, late = 60, packets = [];
  const clean = await opus.speexRoundTrip(x, NB, { onPacket: (f, packet) => packets.push(packet) });
  const lossy = await opus.speexRoundTrip(x, NB, { makeLossMask: count => Uint8Array.from({ length: count }, (_, f) => f === lost ? 1 : f === late ? 2 : 0) });
  const info = lossy.info, at = (samples, f) => samples.subarray(f * 160 - 80, f * 160 + 80);
  check('the frame log marks the lost frame and the late one; the counts agree; plc says zeros',
    info.frameLog[lost] === FRAME.lost && info.frameLog[late] === FRAME.late && info.lostFrames === 1 && info.underrunFrames === 1
    && info.plc === 'zeros' && info.frameBytes[lost] === 20, `frame ${lost}: code ${info.frameLog[lost]}, frame ${late}: code ${info.frameLog[late]}`);
  check('the lost frame and the late one play as zeros', at(lossy.samples, lost).every(v => v === 0) && at(lossy.samples, late).every(v => v === 0)
    && rms(at(clean.samples, lost)) > 0.01 && rms(at(clean.samples, late)) > 0.01);
  // The frame after the lost one is what a decoder gives that never saw it.
  const ref = await createCodec();
  for (let f = 0; f < lost; f++) ref.decode(packets[f]);
  const after = Float32Array.from(ref.decode(packets[lost + 1]), v => v / 32768);
  ref.free();
  check('the decoder is not called for a lost frame: the next frame is decoded as if the packet never came',
    same(at(lossy.samples, lost + 1), after) && !same(at(clean.samples, lost + 1), after));
  const r = await A.process(buffer(voiced(3, 48000), 48000), { codec: 'speex', lossPct: 15, seed: 3 });
  check('net_fakeloss in a render: lost frames are logged and play as zeros',
    r.codecInfo.lostFrames > 5 && r.codecInfo.frameLog.filter(c => c === FRAME.lost).length === r.codecInfo.lostFrames
    && r.codecInfo.plc === 'zeros' && r.samples.every(Number.isFinite), `${r.codecInfo.lostFrames} of ${r.codecInfo.frames} frames lost`);
  const stream = await opus.createSpeexStream(NB);
  const silent = stream.conceal();
  stream.free();
  check('the stream\'s conceal() is a frame of zeros', silent.length === 160 && silent.every(v => v === 0));
}

// A live chain fed `x` 20 ms at a time: its output, frame codes and stats.
async function runLive(engine, x, opts, rate = 48000) {
  const chain = await engine.createLiveChain(opts, rate);
  const parts = [];
  for (let o = 0; o < x.length; o += rate / 50) parts.push(await chain.process(x.subarray(o, o + rate / 50)));
  const codes = chain.takeFrameCodes();
  chain.free();
  const out = new Float32Array(parts.reduce((t, p) => t + p.length, 0));
  parts.reduce((o, p) => { out.set(p, o); return o + p.length; }, 0);
  return { out, codes, stats: chain.stats, chain };
}

console.log('\n[speex profile] The live chain runs the same codec frame by frame');
{
  const src = voiced(3, 48000), opts = { codec: 'speex', volume: 1 };
  const { out: live, codes, stats, chain } = await runLive(A, src, opts);
  const offline = (await A.process(buffer(src, 48000), opts)).samples;
  // The chain's delay: the codec's 80 samples at 11025 Hz and the output FIR's one sample at 44.1 kHz.
  const shift = Math.round((80 / NB + 1 / 44100) * 48000);
  const r = correlate(offline, live.subarray(shift), 0, 24000);
  const level = db(rms(live, shift + 24000, live.length - 24000) / rms(offline, 24000, live.length - shift - 24000));
  let peak = 0;
  for (let d = -3; d <= 3; d++) if (correlate(offline, live.subarray(shift), d, 24000) > correlate(offline, live.subarray(shift), peak, 24000)) peak = d;
  check('the live chain codes with Speex 1.0.2 at 11025 bit/s and reproduces the render (waveform and level)',
    chain.version === 'Speex 1.0.2' && chain.bitrate === 11025 && r > 0.9 && Math.abs(level) < 0.5, `r ${r.toFixed(3)}, ${level.toFixed(2)} dB`);
  check('its stated delay includes the codec\'s 80 samples at 11025 Hz, and lines it up with the render to the sample',
    chain.contentDelay === shift && peak === 0 && chain.frameSize === 160 && chain.codecRate === NB, `contentDelay ${chain.contentDelay}, peak at ${peak}`);
  check('its frames are 20-byte Speex packets, logged and counted as Speex',
    codes.length === stats.frames && codes.every(c => c === FRAME.speex) && stats.bytes === 20 * stats.sent
    && stats.modes.speex === stats.sent && stats.lastMode === 'speex', `${stats.sent} frames, ${stats.bytes} bytes`);
  const lossOpts = { codec: 'speex', lossPct: 15, seed: 4, agc: false, volume: 1 };
  const lossy = await runLive(A, src, lossOpts), lossyRender = await A.process(buffer(src, 48000), lossOpts);
  const lossR = correlate(lossyRender.samples, lossy.out.subarray(shift), 0, 24000);
  check('with net_fakeloss the live chain loses the render\'s frames and plays them as zeros, as the render does',
    lossy.stats.lost > 10 && lossy.codes.every((c, f) => c === lossyRender.codecInfo.frameLog[f]) && lossR > 0.99,
    `${lossy.stats.lost} of ${lossy.stats.frames} lost, r ${lossR.toFixed(4)}`);
  // The gate: the render's frames, and one reset per talk spurt after the first.
  const watched = watchedEngine();
  const gated = await runLive(watched.A, gateParts, { codec: 'speex', gate: true });
  const render = (await A.process(buffer(gateParts, 48000), { codec: 'speex', gate: true })).codecInfo.frameLog;
  const wrong = gated.codes.filter((c, f) => (c === FRAME.gated) !== (render[f] === FRAME.gated)).length;
  check('with the gate on, the live chain sends the render\'s frames, and restarts the codec once, for the second spurt',
    gated.codes.length > 150 && wrong === 0 && gated.stats.spurts === 2 && watched.log.restarts === 1,
    `${gated.codes.length} frames, ${gated.stats.spurts} spurts, ${watched.log.restarts} restart; ${wrong} differ from the render`);
  // snd_bits in the live chain: nothing changes.
  const short = src.subarray(0, 24000), base = await runLive(A, short, { codec: 'speex' }), off = [];
  for (const bits of [4, 10, 24]) {
    const run = await runLive(A, short, { codec: 'speex', bits });
    if (!same(run.out, base.out) || run.chain.bitrate !== 11025 || run.stats.bytes !== base.stats.bytes) off.push(bits);
  }
  check('snd_bits changes nothing in the live chain either', off.length === 0, off.length ? `differs at ${off.join(' ')}` : 'snd_bits 4, 10, 24 as 16');
}

console.log('\n[Live chain] Every profile: a codec restart per talk spurt, and late frames play silence');
{
  // Shared code in audio.js, so Opus and vaudio_celt as well as Speex. Since
  // W3-11b the `steam` profile's live chain runs the render's own stages
  // (Steam's sender and createSteamStream, not createVoiceStream), and
  // tests/verify.js [10b] proves its encoder and decoder per spurt and its
  // concealed and late blocks by equality with the render; steam_48 keeps
  // this frame path.
  for (const codec of ['steam_48', 'celt_22', 'speex']) {
    const w1 = watchedEngine();
    const run1 = await runLive(w1.A, gateParts, { codec, gate: true });
    check(`${codec}: the live chain restarts the codec for each talk spurt after the first`,
      run1.stats.spurts === 2 && w1.log.restarts === 1, `${run1.stats.spurts} spurts, ${w1.log.restarts} restarts`);
    const w2 = watchedEngine();
    const run = await runLive(w2.A, voiced(3, 48000), { codec, gate: false, jitterMs: 500, seed: 9 });
    const late = run.codes.filter(c => c === FRAME.late).length, lostCount = run.codes.filter(c => c === FRAME.lost).length;
    check(`${codec}: a late frame plays silence; a lost one goes to the stream's conceal()`,
      run.stats.late > 0 && late === run.stats.late && lostCount === run.stats.lost && w2.log.conceals === run.stats.lost
      && w2.log.decodes === run.stats.sent - run.stats.lost - run.stats.late,
      `${run.stats.late} late, ${run.stats.lost} lost; ${w2.log.conceals} to conceal(), ${w2.log.decodes} decoded of ${run.stats.sent}`);
  }
}

console.log('\n[speex profile] Determinism, and the last partial frame');
{
  const src = voiced(2, 48000), opts = { codec: 'speex', lossPct: 10, jitterMs: 50, seed: 7 };
  const a = await A.process(buffer(src, 48000), opts), b = await A.process(buffer(src, 48000), opts);
  check('the same input and settings give the same samples', same(a.samples, b.samples) && same(a.codecInfo.frameLog, b.codecInfo.frameLog));
  for (const length of [100 * 160 + 37, 100 * 160]) {
    const x = voiced(length / NB + 0.01, NB).subarray(0, length);
    const { samples, info } = await opus.speexRoundTrip(x, NB);
    const tail = rms(samples, length - 80, length), source = rms(x, length - 80, length);
    check(`the last 80 samples of a ${length}-sample source are coded (frames ${info.frames})`,
      info.frames === Math.ceil((length + 80) / 160) && tail > 0.3 * source, `${db(tail).toFixed(1)} dB against ${db(source).toFixed(1)} dB`);
  }
}

console.log('\n[speex profile] Wording');
{
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const option = /<option value="speex">([^<]*)<\/option>/.exec(html)?.[1] || '';
  check('the page\'s option names Speex 1.0.2 on 11.025 kHz sound in 20-byte frames of 14.51 ms at 11.025 kbit/s',
    option === 'vaudio_speex (Speex 1.0.2 on 11.025 kHz sound · 20-byte frames of 14.51 ms · 11.025 kbit/s)', option);
}

console.log(`\n${passed} Speex 1.0.2 and speex profile checks passed`);
