// Speex 1.0.2 as the game's vaudio_speex module runs it (vendor/speex-1.0.2,
// tests/speex102/build.mjs), checked against a native build of the same source
// and against the reading of the module (docs/reports/W3-09-steam-voice.md,
// section 5), point by point.
//   node tests/speex102.verify.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createCodec, createFramer, toInt16, frameSize, packetBytes, version } from '../vendor/speex-1.0.2/index.mjs';
import { createCodec as createCodec121 } from '../vendor/speex/index.mjs';
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
// 8 kHz), as tests/speex.verify.mjs makes for timing: nothing low enough for a
// high-pass filter to turn its phase.
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
  // The 1.2.1 module (vendor/speex) on the same samples: it takes and gives
  // floats at full scale 1, at its quality 4 (the same sub-mode).
  const signal = signals.speech;
  const own = await code(signal), other = await createCodec121(4), decoder121 = await createCodec121(4);
  const decoded121 = new Float64Array(own.floats.length);
  let differ = 0;
  frames(signal).forEach((frame, f) => {
    const packet121 = other.encode(Float32Array.from(frame, v => v / 32768));
    if (!sameBytes(packet121, own.packets[f])) differ++;
    decoded121.set(decoder121.decode(own.packets[f]).map(v => v * 32768), f * frameSize);
  });
  other.free(); decoder121.free();
  check('on the speech-like signal the packets differ from those of the Speex 1.2.1 module',
    differ > own.packets.length / 2, `${differ} of ${own.packets.length} packets differ`);
  // 1.2.1's decoder reads 1.0.2's packets (the bit-stream is the same). It
  // differs from 1.0.2's decoder in two known ways, so they are allowed for:
  // its output is 40 samples later (its decoder's look-ahead, half of the 80
  // the vendor/speex module reports), and it high-passes what it decodes
  // (libspeex/filters.c in 1.2.1: highpass(), filter 2, the narrowband output
  // one), which turns the phase of this signal's 140 Hz fundamental. The same
  // filter is run on 1.0.2's decode before the comparison.
  const num = [0.96723, -1.93445, 0.96723], den = [1, -1.93338, 0.93553];
  const filtered = new Float64Array(own.floats.length);
  let m0 = 0, m1 = 0;
  own.floats.forEach((x, i) => {
    const y = num[0] * x + m0;
    m0 = m1 + num[1] * x - den[1] * y;
    m1 = num[2] * x - den[2] * y;
    filtered[i] = y;
  });
  const { lag, r } = peakLag(filtered, decoded121, -80, 80, 400);
  check('Speex 1.2.1\'s decoder reads the 1.0.2 packets: its sound correlates above 0.9 with 1.0.2\'s own decode',
    lag === 40 && r > 0.9, `r ${r.toFixed(3)} at a lag of ${lag} samples; unfiltered at lag 0, r ${correlate(own.floats, decoded121, 0, 400).toFixed(3)}`);
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

console.log(`\n${passed} Speex 1.0.2 checks passed`);
