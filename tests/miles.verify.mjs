// The `miles` profile (W3-20b): vaudio_miles as the Source engines of 2006 and
// 2007 ran it, set into the app's chain. vaudio_miles is not a Team Fortress 2
// codec: it is a codec of the Source engine family that could be selected in
// the Source engines of 2006 and 2007, and current TF2 ships its files and
// refuses the name. It has not been checked against any recording of a running
// engine.
//   node tests/miles.verify.mjs
//
// The reference samples and packets come from the vendored module
// (vendor/voxware-vr12) driven here, as the order says the engines drive it:
// two codec objects (the sender's and the receiver's), the wrapper's reset on
// each, a framer on each, the 16 bits made from the float sound by rounding to
// nearest with ties to even and clamping. Nothing of the reference comes from
// opus-codec.mjs. Every signal is synthetic, made here, or one of the committed
// vectors of tests/vr12/vectors. A failed check is reported and the suite goes
// on; the run fails at the end.
import fs from 'node:fs';
import * as opus from '../opus-codec.mjs';
import * as VR12 from '../vendor/voxware-vr12/index.mjs';
import { loadEngine } from './lib/engine.cjs';

let passed = 0;
const failed = [];
function check(name, ok, detail = '') {
  const line = `${name}${detail ? `   [${detail}]` : ''}`;
  if (ok) { passed++; console.log(`  ok    ${line}`); } else { failed.push(name); console.log(`  FAIL  ${line}`); }
}
const measure = (line) => console.log(`  ..    ${line}`);

const NB = 11025, SIZE = 360, BYTES = 12, DELAY = 305;
const root = new URL('..', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, root), 'utf8');

// audio.js on an opus-codec.mjs whose VR12 calls are watched: each round trip
// (its 11025 Hz input, packets, output, head and info) and each frame-by-frame
// stream (the frames given to encode, the packets, restarts, decodes and lost
// frames, in order).
function watchedEngine() {
  const log = { trips: [], speexTrips: [], streams: [] };
  const watched = { ...opus,
    async vr12RoundTrip(samples, rate, options) {
      const packets = [];
      const result = await opus.vr12RoundTrip(samples, rate, { ...options, onPacket: (f, packet) => packets.push({ f, packet }) });
      log.trips.push({ input: Float32Array.from(samples), rate, output: result.samples, head: result.head, info: result.info, packets });
      return result;
    },
    async speexRoundTrip(samples, rate, options) {
      const result = await opus.speexRoundTrip(samples, rate, options);
      log.speexTrips.push({ input: Float32Array.from(samples), output: result.samples, info: result.info });
      return result;
    },
    async createVr12Stream(rate) {
      const stream = await opus.createVr12Stream(rate), s = { events: [], restarts: 0, decodes: 0, conceals: 0, stream };
      log.streams.push(s);
      return { ...stream,
        get resets() { return stream.resets; },
        async restart() { s.restarts++; s.events.push({ restart: true }); return stream.restart(); },
        encode(frame) { const e = stream.encode(frame); s.events.push({ frame: Float32Array.from(frame), packet: e.packet }); return e; },
        decode(packet) { s.decodes++; return stream.decode(packet); },
        conceal() { s.conceals++; return stream.conceal(); },
        free() { stream.free(); } };
    } };
  const { audio, CODEC_PROFILES, PRESETS, VOICE_ENGINE } = loadEngine({ root, codec: watched });
  return { A: audio, log, CODEC_PROFILES, PRESETS, VOICE_ENGINE };
}
const { A, CODEC_PROFILES, PRESETS } = watchedEngine();
const { FRAME } = opus;
const buffer = (data, sampleRate) => ({ sampleRate, length: data.length, numberOfChannels: 1, getChannelData: () => data });
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const differing = (a, b) => { let n = Math.abs(a.length - b.length); for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) n++; return n; };
const rms = (x, a = 0, b = x.length) => { let t = 0; for (let i = a; i < b; i++) t += x[i] * x[i]; return Math.sqrt(t / Math.max(1, b - a)); };
const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
const join = (parts, Type = Float32Array) => {
  const out = new Type(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((o, p) => { out.set(p, o); return o + p.length; }, 0);
  return out;
};
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/* ---------------- the reference: the module, driven here ---------------- */

// The 16 bits the engines' capture holds: x * 32768 to nearest, ties to even,
// clamped. Written here apart from opus-codec.mjs.
function q16(floats) {
  const out = new Int16Array(floats.length);
  for (let i = 0; i < floats.length; i++) {
    const v = floats[i] * 32768, lo = Math.floor(v), d = v - lo;
    const r = d > 0.5 ? lo + 1 : d < 0.5 ? lo : (lo % 2 === 0 ? lo : lo + 1);
    out[i] = Math.max(-32768, Math.min(32767, r));
  }
  return out;
}
// A sender and a receiver as the order has them. mode: 'two' (two codec
// objects, each reset at the start and at a new spurt: the profile's rule),
// 'sender' (two objects, a new spurt resets the sender alone), 'shared' (one
// object codes and decodes, reset once at the start and at a new spurt), 'new'
// (a new spurt makes two new codecs, each reset). start: { sender, receiver },
// whether each is reset at the start (both by default).
async function reference(mode = 'two', start = { sender: true, receiver: true }) {
  let s, r, send, receive;
  async function open(resetSender, resetReceiver) {
    s = await VR12.createCodec();
    r = mode === 'shared' ? s : await VR12.createCodec();
    if (resetSender) s.reset();
    if (resetReceiver && r !== s) r.reset();
    send = VR12.createFramer(s); receive = VR12.createFramer(r);
  }
  await open(start.sender, start.receiver);
  return {
    encode: (q) => send.compress(q),
    decode: (bytes) => receive.decompress(bytes),
    async spurt() {
      if (mode === 'new') { s.free(); r.free(); await open(true, true); return; }
      s.reset();
      if (mode === 'two') r.reset();
      send = VR12.createFramer(s); receive = VR12.createFramer(r);
    },
    free() { s.free(); if (r !== s) r.free(); }
  };
}
// The reference over a whole capture (floats at 11025 Hz) and a frame log as
// a render gives it: a frame logged gated (0) is not coded and starts a new
// spurt at the next coded frame; lost (5) and late (6) are coded and not
// decoded; every other frame is coded and decoded. Without a log, every frame
// of ceil((length + delay) / 360) is coded and decoded. Returns the packets
// (null where none was sent) and the decoded stream from the decoder's first
// sample (zeros where nothing was decoded), as floats over 32768.
async function referenceRun(input, log = null, mode = 'two', start) {
  const frames = log ? log.length : Math.ceil((input.length + DELAY) / SIZE);
  const q = new Int16Array(frames * SIZE);
  q.set(q16(input).subarray(0, q.length));
  const ref = await reference(mode, start), packets = [], decoded = new Float32Array(frames * SIZE);
  let open = false, spurts = 0;
  for (let f = 0; f < frames; f++) {
    const code = log ? log[f] : FRAME.vr12;
    if (code === FRAME.gated) { packets.push(null); open = false; continue; }
    if (!open) { if (spurts++ > 0) await ref.spurt(); open = true; }
    const packet = ref.encode(q.subarray(f * SIZE, (f + 1) * SIZE));
    packets.push(packet);
    if (code === FRAME.lost || code === FRAME.late) continue;
    decoded.set(Float32Array.from(ref.decode(packet), v => v / 32768), f * SIZE);
  }
  ref.free();
  return { packets, decoded, frames };
}
const tripStream = (trip) => join([trip.head, trip.output]);

/* ---------------- signals ---------------- */

// tests/render-stream.verify.mjs's speech-like signal: 90-170 Hz harmonics with
// a 3.2 Hz syllable envelope and a little noise, in talk spurts of 0.4-3 s with
// pauses of 0.15-2.4 s, over a -72 dBFS noise floor.
function voice(seconds, rate, seed, length = Math.round(seconds * rate)) {
  const out = new Float32Array(length);
  const rnd = lcg(seed);
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
// A steady voiced sound at pitch p: the harmonics 1/h below 5 kHz, phases
// 0.3 h^2, scaled to an RMS of `dbfs`, `length` samples at 11025 Hz.
function steady(p, dbfs, length) {
  const x = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let v = 0;
    for (let h = 1; h * p < 5000; h++) v += Math.sin(2 * Math.PI * h * p * i / NB + 0.3 * h * h) / h;
    x[i] = v;
  }
  const g = 10 ** (dbfs / 20) / rms(x);
  for (let i = 0; i < length; i++) x[i] *= g;
  return x;
}
const whiteNoise = (seconds, rate, level, seed) => { const r = lcg(seed), a = level * Math.sqrt(3); return Float32Array.from({ length: Math.round(seconds * rate) }, () => a * (2 * r() - 1)); };
const vector = (name) => {
  const bytes = fs.readFileSync(new URL(`vr12/vectors/${name}.s16`, import.meta.url));
  return Float32Array.from(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2), v => v / 32768);
};
// Two identical 1.4 s parts at 48 kHz: a -65 dBFS noise floor and a voiced
// burst from 0.4 to 0.9 s. With the gate on they make two talk spurts.
const gateParts = (() => {
  const part = new Float32Array(Math.round(1.4 * 48000)), next = lcg(11);
  let phase = 0;
  for (let i = 0; i < part.length; i++) {
    part[i] = 0.001 * (2 * next() - 1);
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

console.log('[miles] 1. The profile, and what a render says it ran');
{
  const p = CODEC_PROFILES.miles;
  check('the entry: vaudio_miles\'s VR12 at 11025 Hz (the voice rate too), 360 samples in 12 bytes, 2940 bit/s, unverified, no sender gate',
    JSON.stringify(Object.keys(p)) === JSON.stringify(['displayName', 'engine', 'codecRate', 'frameSize', 'packetBytes', 'bitrate', 'voiceRate', 'status'])
    && p.displayName === 'vaudio_miles (Voxware VR12 on 11 kHz sound, 2.9 kbps; Source 2006/2007, not TF2)'
    && p.engine === 'vr12' && p.codecRate === NB && p.frameSize === SIZE && p.packetBytes === BYTES && p.bitrate === 2940
    && p.voiceRate === NB && p.status === 'unverified' && !p.senderGate,
    `${p.displayName}; ${p.codecRate} Hz, ${p.frameSize} samples, ${p.packetBytes} bytes, ${p.bitrate} bit/s, ${p.status}`);
  check('it follows speex in the table, and no preset uses it',
    Object.keys(CODEC_PROFILES).indexOf('miles') === Object.keys(CODEC_PROFILES).indexOf('speex') + 1
    && Object.values(PRESETS).every(q => q.codec !== 'miles'), Object.keys(CODEC_PROFILES).join(', '));
  const src = voiced(1, 48000);
  const r = await A.process(buffer(src, 48000), { codec: 'miles' }), info = r.codecInfo;
  const frames = Math.ceil((Math.round(src.length * NB / 48000) + DELAY) / SIZE);
  check('a render\'s codecInfo: Voxware VR12 at 11025 Hz, 32.65 ms frames of 360 samples, 12 bytes, 2940 bit/s',
    r.realOpus && info.backend === 'vr12' && info.version === VR12.version && info.runtime === 'voxware-vr12' && info.sampleRate === NB
    && info.frameSamples === SIZE && info.frameMs.toFixed(2) === '32.65' && info.packetBytes === BYTES && info.bitrate === 2940
    && info.lookahead === DELAY && info.voiceRate === NB && info.codec === 'miles',
    `${info.version}, ${info.sampleRate} Hz, ${info.frameMs.toFixed(2)} ms, ${info.packetBytes} bytes, ${info.bitrate} bit/s, delay ${info.lookahead}`);
  check('constant bit rate, no DTX, a lost frame plays as zeros; no gate by default (push-to-talk)',
    !info.vbr && !info.dtx && info.dtxFrames === 0 && info.plc === 'zeros' && info.gate === null && info.gatedFrames === 0 && info.spurts === 1,
    `plc ${info.plc}, gate ${info.gate}`);
  check('every frame is one 12-byte packet, logged as code 8 and counted in modes.vr12',
    FRAME.vr12 === 8 && info.frames === frames && info.frameBytes.every(b => b === BYTES) && info.encodedBytes === BYTES * frames
    && info.frameLog.every(c => c === FRAME.vr12)
    && JSON.stringify(info.modes) === JSON.stringify({ silk: 0, hybrid: 0, celt: 0, vr12: frames }), `${info.frames} frames, ${info.encodedBytes} bytes`);
  // createRender in pieces of odd sizes gives process()'s samples and its
  // codecInfo, key for key (with the gate, loss and jitter, so every count moves).
  const lossy = { codec: 'miles', gate: true, lossPct: 15, jitterMs: 300, seed: 2 }, x = voice(6, 48000, 3);
  const whole = await A.process(buffer(x, 48000), lossy);
  const render = await A.createRender({ sampleRate: 48000, length: x.length, numberOfChannels: 1 }, lossy), parts = [];
  for (let o = 0, k = 0; o < x.length; k++) {
    const m = Math.min(x.length - o, [1, 7, 333, 4097, 129, 1021, 12345][k % 7]);
    parts.push(await render.push(x.subarray(o, o + m)));
    o += m;
  }
  const end = await render.finish();
  parts.push(end.samples);
  const keys = [...new Set([...Object.keys(whole.codecInfo), ...Object.keys(end.codecInfo)])];
  const unlike = keys.filter(k => JSON.stringify(whole.codecInfo[k]) !== JSON.stringify(end.codecInfo[k]));
  check('createRender in pieces of odd sizes gives process()\'s samples and codecInfo, key for key (gate, loss and jitter on)',
    same(join(parts), whole.samples) && unlike.length === 0 && whole.codecInfo.lostFrames > 0 && whole.codecInfo.gatedFrames > 0,
    `${keys.length} keys${unlike.length ? `; differ: ${unlike.join(', ')}` : ''}; ${whole.codecInfo.spurts} spurts, ${whole.codecInfo.lostFrames} lost`);
  let refused = 0;
  for (const make of [() => opus.vr12RoundTrip(new Float32Array(360), 8000), () => opus.createVr12Stream(8000), () => opus.createVr12Stream(22050)]) {
    try { await make(); } catch (e) { if (/runs on 11025 Hz sound/.test(e.message)) refused++; }
  }
  check('the codec refuses sound at any rate but 11025 Hz', refused === 3, `${refused} of 3 refused`);
}

console.log('\n[miles] 2. The delay: the median of the envelope lags, measured again');
{
  // As opus-codec.mjs's comment says it was measured: a steady voiced sound
  // (harmonics 1/h at pitch P below 5 kHz, RMS -12 dBFS, 0.36 s) switched on
  // after zeros at sample 3600 + 15 k (k 0 to 23, a whole frame in steps of
  // 15), then 0.33 s of zeros; P of 100, 140 and 190 Hz; through the two
  // codecs, no gain. The lag from -200 to 1200 samples with the highest
  // normalised correlation of the 55-sample RMS envelopes (each sample's RMS
  // over itself and the 54 before).
  const envelope = (x) => {
    const e = new Float64Array(x.length);
    let acc = 0;
    for (let i = 0; i < x.length; i++) { acc += x[i] * x[i]; if (i >= 55) acc -= x[i - 55] * x[i - 55]; e[i] = Math.sqrt(Math.max(0, acc) / 55); }
    return e;
  };
  const bestLag = (a, b) => {
    let best = 0, top = -Infinity;
    for (let lag = -200; lag <= 1200; lag++) {
      let d = 0, ea = 0, eb = 0;
      for (let i = Math.max(0, -lag); i < Math.min(a.length, b.length - lag); i++) { d += a[i] * b[i + lag]; ea += a[i] * a[i]; eb += b[i + lag] * b[i + lag]; }
      const c = d / Math.sqrt(ea * eb);
      if (c > top) { top = c; best = lag; }
    }
    return best;
  };
  const tone = { 100: steady(100, -12, Math.round(0.36 * NB)), 140: steady(140, -12, Math.round(0.36 * NB)), 190: steady(190, -12, Math.round(0.36 * NB)) };
  const lags = [];
  for (const p of [100, 140, 190]) {
    for (let k = 0; k < 24; k++) {
      const onset = 3600 + 15 * k, length = Math.ceil((onset + tone[p].length + Math.round(0.33 * NB)) / SIZE) * SIZE;
      const x = new Float32Array(length);
      x.set(tone[p], onset);
      const { decoded } = await referenceRun(x, new Uint8Array(length / SIZE).fill(FRAME.vr12));
      lags.push(bestLag(envelope(x), envelope(decoded)));
    }
  }
  const sorted = [...lags].sort((a, b) => a - b);
  const quantile = (q) => { const i = (sorted.length - 1) * q, lo = Math.floor(i); return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo); };
  const median = quantile(0.5);
  measure(`the 72 lags: median ${median}, quartiles ${quantile(0.25)} and ${quantile(0.75)}, range ${sorted[0]} to ${sorted[71]}`);
  check('the delay is the median of the 72 lags, rounded: 305 samples (27.66 ms), as the profile drops it',
    lags.length === 72 && Math.round(median) === DELAY && await (async () => { const s = await opus.createVr12Stream(NB), d = s.lookahead; s.free(); return d === DELAY; })(),
    `median ${median}`);
  check('the lags spread over less than a frame (360 samples), so one delay describes them', sorted[71] - sorted[0] < SIZE,
    `${sorted[71] - sorted[0]} samples from the shortest to the longest`);
}

console.log('\n[miles] 3. The codec stage is the module');
{
  // Each source through process() and through the reference: the codec's
  // input is the 11025 Hz capture signal; every packet is the reference
  // sender's; every decoded sample is the reference receiver's over 32768;
  // `samples` is that stream with the delay dropped (`head` is what was
  // dropped). The same 16 bits through the module's framer in pieces of odd
  // sizes, the last call with the final flag, give the same bytes for every
  // frame that holds source samples.
  const quiet = Float32Array.from(voiced(3, 48000), v => v * 10 ** (-40 / 20) / 0.08);
  const sources = [
    ['speech-like at 48 kHz', voice(6, 48000, 1), 48000],
    ['a quiet voice near -40 dBFS at 48 kHz', quiet, 48000],
    ['white noise at -20 dBFS at 48 kHz', whiteNoise(2, 48000, 0.1, 5), 48000],
    ['tests/vr12/vectors/noise.s16 as 11025 Hz', vector('noise'), NB],
    ['tests/vr12/vectors/tones.s16 as 11025 Hz', vector('tones'), NB]
  ];
  for (const [name, x, rate] of sources) {
    const { A: W, log } = watchedEngine();
    await W.process(buffer(x, rate), { codec: 'miles' });
    const trip = log.trips[0], length = trip.input.length;
    const capture = A.resampleSinc(A.hardClip(x, 32767 / 32768), rate, NB);
    // A vector's 16 bits come back, but for -32768, which the capture's clip
    // (to 32767 / 32768 either way) makes -32767; the cut gives both -32768.
    const own = Int16Array.from(x, v => Math.max(-32767, Math.round(v * 32768))), clipped = x.filter(v => v * 32768 < -32767).length;
    const vectorBack = rate !== NB || sameBytes(q16(trip.input), own);
    check(`${name}: the codec's input is the 11025 Hz capture signal${rate === NB ? ', the vector\'s own 16 bits' : ''}`,
      log.trips.length === 1 && same(trip.input, capture) && vectorBack,
      `${length} samples, ${db(rms(trip.input)).toFixed(1)} dBFS${rate === NB ? `; ${clipped} samples of -32768 clipped to -32767` : ''}`);
    const ref = await referenceRun(trip.input);
    const packetsEqual = trip.packets.length === ref.frames && trip.packets.every(({ f, packet }, k) => f === k && sameBytes(packet, ref.packets[k]));
    const stream = tripStream(trip);
    check(`${name}: every packet is the reference sender's, every decoded sample the reference receiver's / 32768, the ${DELAY}-sample delay dropped`,
      packetsEqual && trip.head.length === DELAY && same(stream, ref.decoded.subarray(0, DELAY + length)),
      `${trip.packets.length} packets; ${differing(stream, ref.decoded.subarray(0, DELAY + length))} samples differ`);
    // The module's framer in pieces of odd sizes, the final flag on the last.
    const q = q16(trip.input), framer = VR12.createFramer(await (async () => { const c = await VR12.createCodec(); c.reset(); return c; })());
    const pieces = [];
    for (let o = 0, k = 0; o < q.length; k++) {
      const n = Math.min(q.length - o, [1, 359, 361, 1000, 7, 4097][k % 6]);
      pieces.push(framer.compress(q.subarray(o, o + n), o + n === q.length));
      o += n;
    }
    const bytes = join(pieces, Uint8Array), sourceFrames = Math.ceil(length / SIZE);
    check(`${name}: the 16-bit capture through the module's framer in odd pieces, the final flag last, gives the bytes of each of the ${sourceFrames} frames that hold source samples`,
      bytes.length === BYTES * sourceFrames && trip.packets.slice(0, sourceFrames).every(({ packet }, k) => sameBytes(packet, bytes.subarray(k * BYTES, (k + 1) * BYTES))),
      `${bytes.length / BYTES} frames from the framer${length % SIZE ? `, the last part frame of ${length % SIZE} samples padded by the final flag` : ''}`);
    // The resets at the start, where they show.
    const noReceiver = await referenceRun(trip.input, null, 'two', { sender: true, receiver: false });
    const noSender = await referenceRun(trip.input, null, 'two', { sender: false, receiver: true });
    const sentDiffer = noSender.packets.map((p, k) => (sameBytes(p, ref.packets[k]) ? -1 : k)).filter(k => k >= 0);
    check(`${name}: the receiver's reset at the start shows: without it the decoded samples differ`,
      differing(noReceiver.decoded, ref.decoded) > 0, `${differing(noReceiver.decoded, ref.decoded)} samples differ`);
    if (rate === NB) {
      check(`${name}: the sender's reset at the start shows: without it some packets differ`, sentDiffer.length > 0,
        `frames ${sentDiffer.join(', ')}`);
    } else measure(`${name}: without the sender's reset at the start ${sentDiffer.length} packets differ`);
  }
}

console.log('\n[miles] 4. The resets: one on each object at the start, both at a new spurt');
{
  const stream = await opus.createVr12Stream(NB), opened = stream.resets;
  await stream.restart();
  const after = stream.resets;
  stream.free();
  check('the stream counts one reset of each object when it opens, and one more of each at restart()',
    opened.sender === 1 && opened.receiver === 1 && after.sender === 2 && after.receiver === 2, `${JSON.stringify(opened)}, then ${JSON.stringify(after)}`);
  const plain = await A.process(buffer(voiced(1, 48000), 48000), { codec: 'miles' });
  check('a render without the gate resets each object once, before the first frame, and never again',
    JSON.stringify(plain.codecInfo.resets) === JSON.stringify({ sender: 1, receiver: 1 }), JSON.stringify(plain.codecInfo.resets));

  // The gate on, two spurts.
  const { A: W, log } = watchedEngine();
  const r = await W.process(buffer(gateParts, 48000), { codec: 'miles', gate: true, agc: false, volume: 1 });
  const info = r.codecInfo, trip = log.trips[0];
  check('the gate switch reaches the round trip in 32.65 ms frames (pre-roll 4, hold 13): two spurts, each object reset twice',
    info.gate === -39.5 && info.spurts === 2 && info.prerollFrames === 4 && info.holdFrames === 13
    && JSON.stringify(info.resets) === JSON.stringify({ sender: 2, receiver: 2 })
    && info.frameBytes.every((n, f) => (info.frameLog[f] === FRAME.gated) === (n === 0)),
    `${info.spurts} spurts, ${info.gatedFrames} of ${info.frames} frames gated; resets ${JSON.stringify(info.resets)}`);
  const log2 = info.frameLog, stream2 = tripStream(trip);
  const want = await referenceRun(trip.input, log2, 'two');
  // The spurts' first and last frames; the second spurt's decoded samples.
  const starts = [], ends = [];
  log2.forEach((c, f) => {
    if (c !== FRAME.gated && (f === 0 || log2[f - 1] === FRAME.gated)) starts.push(f);
    if (c !== FRAME.gated && (f === log2.length - 1 || log2[f + 1] === FRAME.gated)) ends.push(f);
  });
  const sentPackets = trip.packets.every(({ f, packet }) => sameBytes(packet, want.packets[f]));
  const n = DELAY + trip.output.length, at = starts[1] * SIZE, to = Math.min(n, (ends[1] + 1) * SIZE);
  check('both spurts: the packets and the decoded samples are the reference\'s with both objects reset between the spurts',
    starts.length === 2 && sentPackets && same(stream2, want.decoded.subarray(0, n)),
    `spurts at frames ${starts.map((f, k) => `${f} to ${ends[k]}`).join(' and ')}; ${differing(stream2, want.decoded.subarray(0, n))} samples differ`);
  const second = (d) => d.subarray(at, to), level = rms(second(want.decoded));
  for (const [mode, words] of [['sender', 'a sender reset alone'], ['shared', 'one shared codec object'], ['new', 'new codecs']]) {
    const other = await referenceRun(trip.input, log2, mode);
    const diff = Float32Array.from(second(other.decoded), (v, i) => v - second(want.decoded)[i]);
    const packetsSame = other.packets.every((p, f) => (p === null) === (want.packets[f] === null) && (p === null || sameBytes(p, want.packets[f])));
    const firstSame = same(other.decoded.subarray(0, at), want.decoded.subarray(0, at));
    check(`the second spurt's decoded samples are not those of ${words}`, differing(second(other.decoded), second(stream2)) > 0,
      `${differing(second(other.decoded), second(stream2))} of ${to - at} samples differ${firstSame ? '' : ' (and the first spurt\'s too)'}; the difference at ${db(rms(diff) / level).toFixed(1)} dB against the spurt's own level${packetsSame ? '; the packets are the same' : ''}`);
    if (mode !== 'new') measure(`decision 3: the second spurt decoded by ${words}: the difference at ${db(rms(diff) / level).toFixed(1)} dB against the sound's own level (${db(level).toFixed(1)} dBFS)`);
  }
  // createRender: the same, by the stream's own count.
  const watched = watchedEngine();
  const rr = await watched.A.createRender({ sampleRate: 48000, length: gateParts.length, numberOfChannels: 1 }, { codec: 'miles', gate: true, agc: false, volume: 1 });
  for (let o = 0; o < gateParts.length; o += 7777) await rr.push(gateParts.subarray(o, Math.min(gateParts.length, o + 7777)));
  const end = await rr.finish(), s = watched.log.streams[0];
  check('createRender: restart() runs once, at the second spurt, and each object is reset twice in all',
    s.restarts === 1 && JSON.stringify(end.codecInfo.resets) === JSON.stringify({ sender: 2, receiver: 2 }),
    `${s.restarts} restart; resets ${JSON.stringify(end.codecInfo.resets)}`);
}

console.log('\n[miles] 5. The 8-bit cut reaches the render');
{
  // Sources at 11025 Hz given as 16-bit values over 32768, so the capture's
  // 16 bits are those values (section 3 shows it for the vectors).
  const next = lcg(77), n = 40 * SIZE;
  const small = Float32Array.from({ length: n }, () => (Math.floor(next() * 511) - 255) / 32768);
  const signs = Float32Array.from(small, v => (v < 0 ? -256 / 32768 : 0));
  const packetsOf = async (x) => {
    const { A: W, log } = watchedEngine();
    await W.process(buffer(x, NB), { codec: 'miles' });
    return { packets: log.trips[0].packets.map(p => p.packet), output: tripStream(log.trips[0]) };
  };
  const a = await packetsOf(small), b = await packetsOf(signs);
  check('a source whose 16-bit samples all lie from -255 to 255 gives the packets of the same source with every negative sample -256 and every other 0',
    a.packets.length === b.packets.length && a.packets.every((p, k) => sameBytes(p, b.packets[k])) && rms(a.output) > 0, `${a.packets.length} packets`);
  const hi = Float32Array.from({ length: n }, () => Math.floor(next() * 200) - 100);
  const lowA = Float32Array.from(hi, v => (v * 256 + Math.floor(next() * 256)) / 32768);
  const lowB = Float32Array.from(hi, v => (v * 256 + Math.floor(next() * 256)) / 32768);
  const c = await packetsOf(lowA), d = await packetsOf(lowB);
  check('two sources that differ only in their low bytes give the same packets',
    differing(lowA, lowB) > n / 2 && c.packets.every((p, k) => sameBytes(p, d.packets[k])), `${differing(lowA, lowB)} of ${n} samples differ`);
  const silent = await packetsOf(new Float32Array(n));
  check('digital silence decodes to digital silence', silent.output.every(v => v === 0), `${silent.output.length} samples`);
}

console.log('\n[miles] 6. Where the 16 bits are made');
{
  const got = opus.speexInput(Float32Array.of(0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 3.25, 32767.5, 40000, -32768.5, -40000).map(v => v / 32768));
  check('the float sound is rounded to 16 bits with ties to even and clamped (0.5 to 0, 1.5 to 2, 2.5 to 2, past full scale to 32767 and -32768)',
    sameBytes(got, Int16Array.of(0, 2, 2, 0, -2, -2, 3, 32767, 32767, -32768, -32768)) && sameBytes(q16(Float32Array.of(0.5, 1.5, 2.5, -0.5).map(v => v / 32768)), Int16Array.of(0, 2, 2, 0)),
    Array.from(got).join(' '));
  // After the cut only a crossing of a multiple of 256 shows: 255.7 rounds to
  // 256 (truncated, 255 cuts to 0); -0.3 rounds to 0 (floored, -1 cuts to
  // -256); past full scale clamps (wrapped, 40000 would be -25536). Ties to
  // even and to the nearest above cannot be told apart behind the cut: a tie
  // x.5 with x even rounds to x, and x + 1 is odd, never a multiple of 256.
  const values = [255.7, -0.3, 511.6, -256.2, 40000, -40000, 1000.4, 255.5];
  const frames = Array.from({ length: 30 }, (_, f) => Float32Array.from({ length: SIZE }, (_, i) => values[(i + f) % values.length] * (i % 3 === 0 ? 1 : -1) / 32768));
  const stream = await opus.createVr12Stream(NB), ref = await reference(), trunc = await reference();
  let differ = 0, truncDiffer = 0;
  for (const frame of frames) {
    const p = stream.encode(frame).packet, want = ref.encode(q16(frame));
    if (!sameBytes(p, want)) differ++;
    if (!sameBytes(trunc.encode(Int16Array.from(frame, v => Math.trunc(v * 32768))), want)) truncDiffer++;
  }
  stream.free(); ref.free(); trunc.free();
  check('the stream gives the module that rounding: every packet of frames on the cut\'s edges is the reference\'s (truncation would change some)',
    differ === 0 && truncDiffer > 0, `${differ} of ${frames.length} differ; ${truncDiffer} differ under truncation`);
}

console.log('\n[miles] 7. Loss: a lost or late frame plays as 360 zeros in its own place; the receiver never sees it');
{
  const x = voiced(3, NB), lost = 40, late = 60;
  const clean = await opus.vr12RoundTrip(x, NB);
  const lossy = await opus.vr12RoundTrip(x, NB, { makeLossMask: count => Uint8Array.from({ length: count }, (_, f) => (f === lost ? 1 : f === late ? 2 : 0)) });
  const info = lossy.info;
  const frameAt = (out, f) => out.subarray(f * SIZE - DELAY, f * SIZE - DELAY + SIZE);
  check('the frame log marks the lost frame and the late one; the counts agree; their packets were sent (12 bytes)',
    info.frameLog[lost] === FRAME.lost && info.frameLog[late] === FRAME.late && info.lostFrames === 1 && info.underrunFrames === 1
    && info.plc === 'zeros' && info.frameBytes[lost] === BYTES && info.frameBytes[late] === BYTES, `codes ${info.frameLog[lost]} and ${info.frameLog[late]}`);
  check('both play as 360 zeros in their own place, where the loss-free render has sound',
    frameAt(lossy.samples, lost).every(v => v === 0) && frameAt(lossy.samples, late).every(v => v === 0)
    && rms(frameAt(clean.samples, lost)) > 0.01 && rms(frameAt(clean.samples, late)) > 0.01);
  const log = Uint8Array.from(info.frameLog);
  const ref = await referenceRun(x, log);
  const whole = join([lossy.head, lossy.samples]);
  check('the output is a reference receiver\'s that never saw those packets, every frame in its loss-free place, the length unchanged',
    lossy.samples.length === clean.samples.length && same(whole, ref.decoded.subarray(0, whole.length)) && same(frameAt(lossy.samples, lost - 1), frameAt(clean.samples, lost - 1)),
    `${lossy.samples.length} samples`);
  check('the frame after the lost one is not the loss-free render\'s', !same(frameAt(lossy.samples, lost + 1), frameAt(clean.samples, lost + 1)),
    `${differing(frameAt(lossy.samples, lost + 1), frameAt(clean.samples, lost + 1))} of 360 differ`);
  // net_fakeloss in a render.
  const src = voiced(4, 48000);
  const { A: W, log: wl } = watchedEngine();
  const r = await W.process(buffer(src, 48000), { codec: 'miles', lossPct: 15, jitterMs: 300, seed: 3, agc: false });
  const free = await A.process(buffer(src, 48000), { codec: 'miles', seed: 3, agc: false });
  const trip = wl.trips[0], rl = r.codecInfo.frameLog, refR = await referenceRun(trip.input, Uint8Array.from(rl));
  const stream = tripStream(trip);
  check('net_fakeloss and jitter in a render: lost and late frames are logged and counted, and the decoded stream is the reference receiver\'s that never saw them',
    r.codecInfo.lostFrames > 5 && r.codecInfo.underrunFrames > 0 && rl.filter(c => c === FRAME.lost).length === r.codecInfo.lostFrames
    && rl.filter(c => c === FRAME.late).length === r.codecInfo.underrunFrames && r.codecInfo.plc === 'zeros'
    && same(stream, refR.decoded.subarray(0, stream.length)) && r.samples.length === free.samples.length,
    `${r.codecInfo.lostFrames} lost and ${r.codecInfo.underrunFrames} late of ${r.codecInfo.frames}`);
  // The stream: conceal() is zeros and the frame after is decoded as if the packet never came.
  const s = await opus.createVr12Stream(NB), ref2 = await reference();
  const fr = Array.from({ length: 12 }, (_, f) => x.subarray(f * SIZE, (f + 1) * SIZE));
  let ok = true, concealed = null;
  for (let f = 0; f < fr.length; f++) {
    const e = s.encode(fr[f]), want = ref2.encode(q16(fr[f]));
    if (f === 5) { concealed = s.conceal(); continue; }
    if (!same(s.decode(e.packet), Float32Array.from(ref2.decode(want), v => v / 32768))) ok = false;
  }
  s.free(); ref2.free();
  check('the stream\'s conceal() is 360 zeros, and the frames after it are those of a receiver that never saw the packet',
    ok && concealed.length === SIZE && concealed.every(v => v === 0));
}

console.log('\n[miles] 8. snd_bits changes nothing');
{
  const short = voiced(1, 48000), base = await A.process(buffer(short, 48000), { codec: 'miles' }), differ = [];
  for (const bits of [2, 4, 10, 15, 24, 32]) {
    const other = await A.process(buffer(short, 48000), { codec: 'miles', bits });
    if (!same(other.samples, base.samples) || other.codecInfo.bitrate !== 2940 || !other.codecInfo.frameBytes.every(b => b === BYTES)) differ.push(bits);
  }
  check('in a render: every snd_bits gives the same samples, 12-byte packets and 2940 bit/s', differ.length === 0,
    differ.length ? `differs at snd_bits ${differ.join(' ')}` : 'snd_bits 2, 4, 10, 15, 24, 32 as 16');
  const live = async (bits) => {
    const chain = await A.createLiveChain({ codec: 'miles', ...(bits ? { bits } : {}) }, 48000), parts = [];
    for (let o = 0; o < short.length; o += 960) parts.push(await chain.process(short.subarray(o, o + 960)));
    chain.free();
    return { out: join(parts), chain };
  };
  const b0 = await live(0), off = [];
  for (const bits of [4, 10, 24]) {
    const run = await live(bits);
    if (!same(run.out, b0.out) || run.chain.bitrate !== 2940 || run.chain.stats.bytes !== b0.chain.stats.bytes) off.push(bits);
  }
  check('in the live chain: the same samples, bytes and 2940 bit/s', off.length === 0 && b0.chain.bitrate === 2940,
    off.length ? `differs at ${off.join(' ')}` : 'snd_bits 4, 10, 24 as 16');
}

console.log('\n[miles] 9. net_split: the frames in a packet');
{
  const src = voiced(6, 48000);
  const pairs = async (frameMs) => {
    const r = await A.process(buffer(src, 48000), { codec: 'miles', lossPct: 25, seed: 5, frameMs });
    const log = r.codecInfo.frameLog, lost = [];
    for (let f = 0; f < log.length; f++) if (log[f] === FRAME.lost) lost.push(f);
    const whole = lost.every(f => (f ^ 1) >= log.length || log[f ^ 1] === FRAME.lost);
    return { lost, whole, per: r.codecInfo.framesPerPacket };
  };
  const at40 = await pairs(40), at20 = await pairs(20);
  check('net_split 40 with no jitter: the lost frames come as whole packets of two 32.65 ms frames',
    at40.lost.length > 10 && at40.whole && at40.per === 2, `${at40.lost.length} lost`);
  check('... and at 20, one frame a packet, some lost frame\'s neighbour in a pair arrives', !at20.whole && at20.per === 1, `${at20.lost.length} lost`);
}

console.log('\n[miles] 10. The live chain');
{
  const settings = { avgGain: 0.5, maxGain: 10, scale: 1 };
  // A live chain fed `x` 20 ms at a time, through a watched engine: its output,
  // what its onGain saw, its frame codes and stats, and the stream's log.
  const runLive = async (x, opts, rate, key = null) => {
    const w = watchedEngine(), gained = [];
    const chain = await w.A.createLiveChain({ ...opts, onGain: (g) => gained.push(Float32Array.from(g)) }, rate);
    const parts = [], block = rate / 50;
    for (let o = 0, k = 0; o < x.length; o += block, k++) {
      if (key) chain.setTalking(key(k));
      parts.push(await chain.process(x.subarray(o, Math.min(x.length, o + block))));
    }
    const codes = chain.takeFrameCodes();
    chain.free();
    return { out: join(parts), gained: join(gained), codes, stats: chain.stats, chain, s: w.log.streams[0], streams: w.log.streams.length };
  };
  // The reference for what a live stream coded: the frames it was given, in
  // order, as 16 bits, a reset of both objects at each restart; the decoded
  // stream with zeros for the frames not sent. `complete` says whether the
  // first stream's log held a frame for every frame sent (a chain that made a
  // new stream at a key press leaves the rest in the second).
  const referenceLive = async (run) => {
    const ref = await reference(), parts = [], events = run.s.events;
    let k = 0, packetsEqual = true, complete = true;
    for (const code of run.codes) {
      if (code === FRAME.gated) { parts.push(new Float32Array(SIZE)); continue; }
      while (k < events.length && events[k].restart) { await ref.spurt(); k++; }
      if (k >= events.length) { complete = false; packetsEqual = false; parts.push(new Float32Array(SIZE)); continue; }
      const e = events[k++], p = ref.encode(q16(e.frame));
      if (!sameBytes(p, e.packet)) packetsEqual = false;
      parts.push(code === FRAME.lost || code === FRAME.late ? new Float32Array(SIZE) : Float32Array.from(ref.decode(p), v => v / 32768));
    }
    ref.free();
    return { decoded: join(parts), packetsEqual, complete };
  };
  const src = voiced(3, 48000);
  for (const rate of [48000, 44100]) {
    const x = rate === 48000 ? src : voiced(3, 44100);
    const run = await runLive(x, { codec: 'miles', volume: 1 }, rate);
    const ref = await referenceLive(run);
    const want = A.receiverAutoGain(ref.decoded, settings).subarray(0, run.gained.length);
    check(`${rate} Hz, the key held: the packets are the reference sender's, and onGain sees the reference receiver's decoded stream through receiverAutoGain, bit for bit (no delay dropped)`,
      ref.packetsEqual && run.gained.length > 2 * NB && same(run.gained, want), `${run.gained.length} samples; ${differing(run.gained, want)} differ`);
    check(`${rate} Hz: its stated delay is the codec's ${DELAY} samples at 11025 Hz in the context's samples; 2940 bit/s, 360-sample frames at 11025 Hz`,
      run.chain.contentDelay === Math.round(DELAY / NB * rate) && run.chain.bitrate === 2940 && run.chain.frameSize === SIZE && run.chain.codecRate === NB
      && run.chain.version === VR12.version, `contentDelay ${run.chain.contentDelay}`);
    check(`${rate} Hz: its stats count 12 bytes a frame sent, modes.vr12, and lastMode vr12`,
      run.stats.sent > 50 && run.stats.bytes === BYTES * run.stats.sent && run.stats.modes.vr12 === run.stats.sent && run.stats.lastMode === 'vr12'
      && run.codes.every(c => c === FRAME.vr12), `${run.stats.sent} frames, ${run.stats.bytes} bytes`);
  }
  // A scripted key: held, up for 30 blocks of 20 ms, down again.
  const keyed = await runLive(src, { codec: 'miles', volume: 1 }, 48000, (k) => k < 50 || k >= 80);
  const kref = await referenceLive(keyed);
  const sentFlags = keyed.codes.map(c => c !== FRAME.gated);
  const kwant = A.receiverAutoGain(kref.decoded, { ...settings, decoded: (m) => sentFlags[Math.floor(m / SIZE)] === true }).subarray(0, keyed.gained.length);
  const notSent = keyed.codes.map((c, f) => (c === FRAME.gated ? f : -1)).filter(f => f >= 0);
  check('a scripted key: the frames not sent are zeros at the gain\'s input, restart() runs once, at the press',
    notSent.length > 10 && keyed.s.restarts === 1 && keyed.s.events.findIndex(e => e.restart) > 0 && keyed.stats.spurts === 2,
    `${notSent.length} frames not sent, ${keyed.s.restarts} restart`);
  check('... and the chain keeps its one stream (its two codec objects) through the press: it makes no new codecs there',
    keyed.streams === 1 && kref.complete, `${keyed.streams} stream${keyed.streams === 1 ? '' : 's'} made; the first coded ${kref.complete ? 'every' : 'not every'} frame sent`);
  check('... and the gain\'s output is the reference\'s with both objects reset at the press',
    kref.packetsEqual && same(keyed.gained, kwant), `${differing(keyed.gained, kwant)} of ${keyed.gained.length} differ`);
  // With loss: the render's frame codes.
  const lossOpts = { codec: 'miles', lossPct: 15, seed: 4, agc: false, volume: 1 };
  const lossy = await runLive(src, lossOpts, 48000), lossyRender = await A.process(buffer(src, 48000), lossOpts);
  check('with net_fakeloss the live chain loses the render\'s frames',
    lossy.stats.lost > 5 && lossy.codes.every((c, f) => c === lossyRender.codecInfo.frameLog[f]), `${lossy.stats.lost} of ${lossy.stats.frames} lost`);
}

console.log('\n[miles] 11. The last part frame, and determinism');
{
  const src = voiced(2, 48000), opts = { codec: 'miles', lossPct: 10, jitterMs: 50, seed: 7 };
  const a = await A.process(buffer(src, 48000), opts), b = await A.process(buffer(src, 48000), opts);
  check('the same source and settings give the same samples twice', same(a.samples, b.samples) && same(a.codecInfo.frameLog, b.codecInfo.frameLog));
  for (const length of [100 * SIZE + 37, 100 * SIZE]) {
    const x = voiced(length / NB + 0.01, NB, 0.3).subarray(0, length);
    const { A: W, log } = watchedEngine();
    await W.process(buffer(x, NB), { codec: 'miles', agc: false });
    const trip = log.trips[0], info = trip.info, out = trip.output;
    const tail = rms(out, length - DELAY, length), source = rms(x, length - DELAY, length);
    const lastSource = Math.floor((length - 1) / SIZE);
    check(`a ${length}-sample source at 11025 Hz has ceil((length + ${DELAY}) / 360) = ${Math.ceil((length + DELAY) / SIZE)} frames, and its last samples are coded`,
      info.frames === Math.ceil((length + DELAY) / SIZE) && trip.packets.some(p => p.f === lastSource) && tail > 0.3 * source,
      `${info.frames} frames; the last ${DELAY} samples at ${db(tail).toFixed(1)} dB against ${db(source).toFixed(1)} dB`);
  }
}

console.log('\n[miles] 12. Where the 8-bit cut shows (measurements for the documents)');
{
  // The suite's speech-like signal at 48 kHz, through miles and speex: the
  // level of the codec's input, of the same after the cut (each sample's high
  // byte times 256), of the decoded stream and of the gain's output, in its
  // pauses and in its spurts. A 360-sample frame of the capture is a pause
  // under -60 dBFS and a spurt over -35 dBFS; frames within two of the other
  // kind are left out.
  const x = voice(20, 48000, 1);
  const runOf = async (codec) => {
    const { A: W, log } = watchedEngine();
    let gained = null;
    await W.process(buffer(x, 48000), { codec, onGain: (g) => { gained = Float32Array.from(g); } });
    const trip = codec === 'miles' ? log.trips[0] : log.speexTrips[0];
    return { input: trip.input, output: trip.output, gained };
  };
  const m = await runOf('miles'), s = await runOf('speex');
  const frames = Math.floor(m.input.length / SIZE), kind = [];
  for (let f = 0; f < frames; f++) { const l = db(rms(m.input, f * SIZE, (f + 1) * SIZE)); kind.push(l < -60 ? 'pause' : l > -35 ? 'spurt' : 'mid'); }
  const pick = (k) => {
    const idx = [];
    for (let f = 2; f < frames - 2; f++) if ([-2, -1, 0, 1, 2].every(d => kind[f + d] === k)) for (let i = f * SIZE; i < (f + 1) * SIZE; i++) idx.push(i);
    return idx;
  };
  const level = (y, idx) => db(Math.sqrt(idx.reduce((t, i) => t + y[i] * y[i], 0) / idx.length));
  const cut = Float32Array.from(q16(m.input), v => ((v >> 8) * 256) / 32768);
  const rows = {};
  for (const k of ['pause', 'spurt']) {
    const idx = pick(k);
    rows[k] = { input: level(m.input, idx), cut: level(cut, idx), decoded: level(m.output, idx), gain: level(m.gained, idx),
      speexDecoded: level(s.output, idx), speexGain: level(s.gained, idx), seconds: idx.length / NB };
    const r = rows[k];
    measure(`${k}s (${r.seconds.toFixed(1)} s): input ${r.input.toFixed(1)} dBFS; after the cut ${r.cut.toFixed(1)}; miles decoded ${r.decoded.toFixed(1)}, after the gain ${r.gain.toFixed(1)}; speex decoded ${r.speexDecoded.toFixed(1)}, after the gain ${r.speexGain.toFixed(1)}`);
  }
  check('the pauses: the cut lifts the -72 dBFS floor to the sign pattern, and the decoded floor is louder than the input\'s',
    rows.pause.input < -65 && rows.pause.cut > rows.pause.input + 15 && rows.pause.decoded > rows.pause.input + 5,
    `${rows.pause.input.toFixed(1)}, ${rows.pause.cut.toFixed(1)}, ${rows.pause.decoded.toFixed(1)} dBFS`);
  // A steady voiced sound (pitch 140 Hz) at each level: the decoded level.
  const lines = [];
  let signsOnlyAt = null;
  for (const lvl of [0, -12, -24, -36, -42, -48, -60]) {
    const y = steady(140, lvl, 60 * SIZE), q = q16(y);
    const { decoded } = await referenceRun(y);
    const out = decoded.subarray(DELAY + 10 * SIZE, DELAY + 50 * SIZE);
    const onlySigns = q.every(v => v >= -256 && v <= 255);
    if (onlySigns && signsOnlyAt === null) signsOnlyAt = lvl;
    lines.push(`${lvl} in: ${db(rms(out)).toFixed(1)} out${onlySigns ? ' (only the signs left)' : ''}`);
  }
  const probe = steady(140, 0, 60 * SIZE), peak = probe.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
  measure(`a steady voiced sound at 140 Hz, dBFS RMS: ${lines.join('; ')}`);
  measure(`only the signs are left for this sound below ${db(255.5 / 32768 / peak).toFixed(1)} dBFS RMS (its peak under 256 of 32768; crest ${db(peak).toFixed(1)} dB)`);
  check('digital silence stays digital silence; only the signs are left at -60 dBFS and not at -48 (the edge near -50 for this sound)',
    signsOnlyAt === -60 && (await referenceRun(new Float32Array(20 * SIZE))).decoded.every(v => v === 0), `first at ${signsOnlyAt}`);
}

console.log('\n[miles] 13. The words');
{
  const html = read('index.html');
  const note = /<p id="codec-note"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1].replace(/\s+/g, ' ').trim() || '';
  const NOTE = 'vaudio_miles is not a TF2 codec. The Source engines of 2006 and 2007 could run it; current TF2 ships its files and refuses the name. '
    + 'It has not been checked against any recording of a running engine. Everything after the receiver\'s gain is TF2\'s of today.';
  check('index.html holds the note\'s four sentences word for word', note === NOTE, note);
  const group = /<optgroup label="Not in Team Fortress 2">([\s\S]*?)<\/optgroup>/.exec(html)?.[1] || '';
  check('the Miles option is inside the group labelled "Not in Team Fortress 2"', /<option value="miles">vaudio_miles: not in TF2/.test(group),
    /<option value="miles">([^<]*)/.exec(html)?.[1] || 'no option');
  const SENTENCE = 'It has not been checked against any recording of a running engine.';
  const files = ['README.md', 'tests/LEGACY_CODECS.md', 'tests/REFERENCE_2026.md', 'vendor/voxware-vr12/README.md'];
  const missing = files.filter(f => !read(f).replace(/\s+/g, ' ').includes(SENTENCE));
  check('README.md, tests/LEGACY_CODECS.md, tests/REFERENCE_2026.md and vendor/voxware-vr12/README.md each say it has not been checked against any recording',
    missing.length === 0, missing.length ? `missing in ${missing.join(', ')}` : '');
  const readme = read('README.md'), accuracy = /\n## Accuracy\n([\s\S]*?)(\n## |$)/.exec(readme)?.[1] || '';
  check('README\'s "Accuracy" section names neither the profile nor the codec', accuracy.length > 100 && !/miles|vr12|voxware/i.test(accuracy),
    `${accuracy.length} characters`);
}

console.log(`\n${passed} miles checks passed${failed.length ? `, ${failed.length} failed:\n  ${failed.join('\n  ')}` : ''}`);
if (failed.length) process.exit(1);
