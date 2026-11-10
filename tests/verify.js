/* =========================================================================
 * tests/verify.js — headless verification of the TF2 voice pipeline.
 *
 * The DSP core (audio.js) is pure JS, so it runs under Node:
 *     node tests/verify.js
 * TF2_DIR env var points the suite at a copy of the sources elsewhere.
 *
 * Covers:
 *   - resampler passband, stopband, alignment and exact lengths
 *   - profile calibration FIR response
 *   - receiver auto-gain: target, cap, int16 clamp, silence, voice_scale
 *   - the measured clipping signature on dense input
 *   - real libopus modes for every codec profile
 *   - Valve DSP room presets, burst loss, WAV integrity, option robustness
 * ========================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.env.TF2_DIR || path.join(__dirname, '..');
const code =
  fs.readFileSync(path.join(root, 'constants.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(root, 'audio.js'), 'utf8');

const sandbox = { window: {}, Blob: globalThis.Blob, console };
vm.createContext(sandbox);
// Steam's sender and the decoder's resampler load beside audio.js, as on the page.
for (const file of ['steam-sender.js', 'vendor/swresample/swresample.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox);
}
vm.runInContext(code, sandbox);
const TF2Audio = sandbox.window.TF2Audio;
const ENGINE = vm.runInContext('VOICE_ENGINE', sandbox);

/* ---------------- helpers ---------------- */

function mkBuffer(channelData, sampleRate) {
  return { sampleRate, length: channelData.length, numberOfChannels: 1, getChannelData: () => channelData };
}

function tone(freq, seconds, rate, amp) {
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * i / rate);
  return out;
}

function whiteNoise(seconds, rate, amp, seed) {
  const rnd = TF2Audio.mulberry32(seed);
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * (rnd() * 2 - 1);
  return out;
}

// Dense, music-like material: harmonic tones plus noise with a beat envelope.
function musicLike(seconds, rate, seed) {
  const rnd = TF2Audio.mulberry32(seed);
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const beat = 0.55 + 0.45 * Math.exp(-((t * 2) % 1) * 6);
    let v = 0;
    for (const [f, a] of [[110, .3], [220, .2], [330, .12], [660, .08], [1320, .05]]) v += a * Math.sin(2 * Math.PI * f * t);
    out[i] = beat * (v + 0.12 * (rnd() * 2 - 1));
  }
  return out;
}

// Syllabic voiced signal: 115 Hz harmonics with a 3.2 Hz syllable envelope, scaled to an RMS level.
// Opus's voice detector keeps it active, as it did the test signal's vowel synth.
function speechLike(seconds, rate, rmsDb) {
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.pow(Math.abs(Math.sin(Math.PI * ((t * 3.2) % 1))), 0.6);
    const f0 = 115 * (1 + 0.05 * Math.sin(2 * Math.PI * 0.7 * t));
    let v = 0;
    for (let h = 1; h <= 30; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
    out[i] = env * v; sum += out[i] * out[i];
  }
  const k = 10 ** (rmsDb / 20) / Math.sqrt(sum / n);
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

function rms(x, from, to) {
  const a = from || 0, b = to || x.length;
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
}

function meanAbs(x, from = 0, to = x.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += Math.abs(x[i]);
  return s / Math.max(1, to - from);
}

function peakAbs(x) { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; }

function diffRms(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s / Math.max(1, n));
}

function hasBadValues(x) {
  for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) return true;
  return false;
}

function clipFraction(x, thr) {
  let c = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > thr) c++;
  return c / Math.max(1, x.length);
}

function bandRms(x, rate, type, f0) {
  let y = TF2Audio.applyBiquad(x, TF2Audio.biquadCoefs(type, rate, f0, 0.707));
  y = TF2Audio.applyBiquad(y, TF2Audio.biquadCoefs(type, rate, f0, 0.707));
  return rms(y);
}

// Magnitude of an FIR at one frequency.
function firGainDb(taps, f, rate) {
  let re = 0, im = 0;
  for (let k = 0; k < taps.length; k++) { re += taps[k] * Math.cos(2 * Math.PI * f * k / rate); im -= taps[k] * Math.sin(2 * Math.PI * f * k / rate); }
  return 20 * Math.log10(Math.hypot(re, im));
}

// Average power in [lo, hi) Hz relative to 300-3000 Hz (Hann, 4096-point FFT).
function bandDb(x, rate, lo, hi) {
  const n = 4096, re = new Float64Array(n), im = new Float64Array(n);
  let band = 0, ref = 0;
  for (let start = 0; start + n <= x.length; start += n / 2) {
    for (let i = 0; i < n; i++) { re[i] = x[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)); im[i] = 0; }
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -2 * Math.PI / len;
      for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(a * k), d = Math.sin(a * k), p = i + k, q = p + len / 2;
        const vr = re[q] * c - im[q] * d, vi = re[q] * d + im[q] * c;
        re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi;
      }
    }
    for (let k = 1; k < n / 2; k++) {
      const hz = k * rate / n, pw = re[k] * re[k] + im[k] * im[k];
      if (hz >= lo && hz < hi) band += pw / Math.max(1, (hi - lo) * n / rate);
      if (hz >= 300 && hz < 3000) ref += pw / (2700 * n / rate);
    }
  }
  return 10 * Math.log10(Math.max(1e-30, band) / Math.max(1e-30, ref));
}

function db(ratio) { return 20 * Math.log10(Math.max(ratio, 1e-12)); }

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok    ${name}${detail ? '   [' + detail + ']' : ''}`); }
  else      { fail++; console.error(`  FAIL  ${name}${detail ? '   [' + detail + ']' : ''}`); }
}

// Clean path: no codec, unity receiver gain, full output volume.
const clean = { enableWarble: false, agc: false, volume: 1, listenerPos: 'open' };

/* ---------------- the steam profile (W3-11a) ---------------- */

// The `steam` render sends as Steam's client does and decodes as its decoder
// does (docs/work-orders/W3-11-steam-gate.md, part a). Sources are made at
// 24 kHz, so no resampler stands between a test and the gate: the capture is
// the source, clipped, through the profile's capture roll-off, rounded to 16
// bits, as process() makes it.
async function steamSection() {
  console.log('\n[5c] The steam profile: Steam\'s sender and decoder (W3-11a)');
  const R = 24000, VR = 44100, opus = sandbox.TF2Opus;
  // The test's own copies, in this realm (the sender takes only this realm's Int16Array).
  const Sender = require(path.join(root, 'steam-sender.js')), Swr = require(path.join(root, 'vendor/swresample/swresample.js'));
  const PROFILES = vm.runInContext('CODEC_PROFILES', sandbox), steam = PROFILES.steam;
  const eqTaps = TF2Audio.firwin2(steam.captureEq.taps, steam.captureEq.freqs, steam.captureEq.gainsDb, R);
  const round16 = (y) => Int16Array.from(y, (v) => {
    const s = v * 32768;
    let r = Math.round(s);
    if (r - s === 0.5 && (r & 1)) r -= 1;
    return Math.max(-32768, Math.min(32767, r));
  });
  const captured = (x) => round16(TF2Audio.applyFirZeroPhase(TF2Audio.hardClip(x, 32767 / 32768), eqTaps));
  const senderOf = (x, opts = {}) => {
    const s = Sender.createSender(opts), msgs = s.push(captured(x));
    for (const m of s.finish()) msgs.push(m);
    return { msgs, info: s.info() };
  };
  const holding = (msgs) => msgs.filter((m) => m.silence !== undefined || m.last >= m.first).length;
  // The test hooks: each message's 16-bit samples as given to the resampler,
  // each packet() result, and the voice-rate signal after the gain.
  const hooked = () => {
    const h = { decoded: [], resampled: [], gained: null };
    h.opts = {
      onDecoded: (p, m) => h.decoded.push({ pcm: Int16Array.from(p), msg: JSON.parse(JSON.stringify({ ...m, pcm: undefined })) }),
      onResampled: (y, m) => h.resampled.push({ y: Int16Array.from(y), msg: JSON.parse(JSON.stringify({ ...m, pcm: undefined })) }),
      onGain: (g) => { h.gained = Float32Array.from(g); }
    };
    return h;
  };
  const render = (x, opts = {}, h = null) => TF2Audio.process(mkBuffer(x, R), { codec: 'steam', volume: 1, ...opts, ...(h ? h.opts : {}) });
  // A hand-made loss mask through the codec module's makeLossMask hook.
  const withMask = async (make, run) => {
    const real = sandbox.TF2Opus;
    sandbox.TF2Opus = { ...real, steamRoundTrip: (m, b, o) => real.steamRoundTrip(m, b, { ...o, makeLossMask: make }) };
    try { return await run(); } finally { sandbox.TF2Opus = real; }
  };
  const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const sine = (f, seconds, peak) => Float32Array.from({ length: Math.round(seconds * R) }, (_, i) => peak * Math.sin(2 * Math.PI * f * i / R));
  // Seeded speech-like talk: voiced syllables on a noise floor, with pauses.
  const talk = (seconds, seed, level = 0.2) => {
    const rnd = TF2Audio.mulberry32(seed), n = Math.round(seconds * R), x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 3e-4 * (rnd() * 2 - 1);
    let t = Math.round(0.3 * R);
    while (t < n) {
      const len = Math.round((0.4 + 1.2 * rnd()) * R), f0 = 100 + 80 * rnd(), amp = level * (0.3 + 0.7 * rnd());
      for (let i = 0; i < len && t + i < n; i++) {
        const time = i / R, env = Math.sin(Math.PI * i / len) * Math.abs(Math.sin(Math.PI * 3.3 * time)) ** 0.7;
        let v = 0;
        for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f0 * h * time) / h;
        x[t + i] += amp * env * (0.7 * v + 0.2 * (rnd() * 2 - 1));
      }
      t += len + Math.round((0.3 + 1.2 * rnd()) * R);
    }
    return x;
  };
  // A source of loud bursts (speech-like) at the given seconds, each `length`
  // long, over a uniform noise floor at `floorDb` dBFS RMS.
  const bursts = (seconds, starts, length, floorDb, seed = 5) => {
    const rnd = TF2Audio.mulberry32(seed), x = new Float32Array(Math.round(seconds * R)), floor = 10 ** (floorDb / 20) * Math.sqrt(3);
    for (let i = 0; i < x.length; i++) x[i] = floor * (rnd() * 2 - 1);
    for (const s of starts) {
      for (let i = 0, at = Math.round(s * R); i < Math.round(length * R) && at + i < x.length; i++) {
        const time = i / R;
        let v = 0;
        for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * 140 * h * time) / h;
        x[at + i] = 0.25 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * time)) * v;
      }
    }
    return x;
  };

  // The gate is the sender's.
  {
    const x = talk(10, 3), seed = 7;
    const r = await render(x, { seed }), want = senderOf(x, { seed }).info.spurts;
    check('the gate is the sender\'s: codecInfo.sender.spurts are createSender\'s on the rounded 24 kHz capture with the render\'s seed',
      JSON.stringify(r.codecInfo.sender.spurts) === JSON.stringify(want) && want.length >= 3 && r.codecInfo.sender.rule === 'steam'
      && r.codecInfo.sender.gate === true && r.codecInfo.sender.meanMin === 327.67 && r.codecInfo.gate === -40
      && r.codecInfo.prerollFrames === 0 && r.codecInfo.holdFrames === 0 && r.codecInfo.spurts === want.length,
      `${want.length} spurts from ${want.map((s) => s.start).join(', ')}`);
  }
  // A typed threshold is the mean a chunk must reach: 32767 x 10^(dB/20).
  {
    const x = talk(10, 3), seed = 7, meanMin = 32767 * 10 ** (-30 / 20);
    const r = await render(x, { seed, gateThresholdDb: -30 }), want = senderOf(x, { seed, meanMin }).info.spurts;
    const asRms = senderOf(x, { seed, meanMin: meanMin * Math.SQRT2 }).info.spurts;
    check('a typed threshold is the mean a chunk must reach: -30 dB gives meanMin 32767 x 10^(-30/20) and createSender\'s spurts with it',
      r.codecInfo.sender.meanMin === meanMin && r.codecInfo.gate === -30 && JSON.stringify(r.codecInfo.sender.spurts) === JSON.stringify(want)
      && JSON.stringify(want) !== JSON.stringify(asRms), `${want.length} spurts from ${want.map((s) => s.start).join(', ')}`);
  }
  // The mean of |x| over a chunk, not a 20 ms frame's RMS.
  {
    const a = new Float32Array(3 * R);
    for (let k = 0; k * 960 + 48 <= a.length; k++) for (let i = 0; i < 48; i++) a[k * 960 + i] = 0.12 * Math.sin(2 * Math.PI * 3000 * i / R);
    const ra = await render(a), frameRms = db(rms(a, 0, 480)), old = await render(a, { codec: 'steam_48' });
    check('mean, not RMS: 2 ms bursts of a 3 kHz sine every 40 ms (20 ms frames at -31 dBFS RMS, every chunk\'s mean about 0.4%, no sample at 15%) send nothing',
      ra.codecInfo.spurts === 0 && peakAbs(ra.samples) === 0 && frameRms > -32 && old.codecInfo.spurts > 0,
      `frame RMS ${frameRms.toFixed(1)} dBFS; steam ${ra.codecInfo.spurts} spurts; the frame gate (steam_48) ${old.codecInfo.spurts}`);
    const b = Float32Array.from({ length: 3 * R }, (_, i) => (Math.floor(i / 60) % 2 ? -344 : 344) / 32768);
    const rb = await render(b);
    check('mean, not RMS: a 200 Hz square wave of height 344 (-39.6 dBFS RMS, a mean of 1.05%) is sent',
      rb.codecInfo.spurts >= 1 && rb.codecInfo.sender.spurts[0].start <= 0 && peakAbs(rb.samples) > 0,
      `RMS ${db(rms(b)).toFixed(2)} dBFS; ${rb.codecInfo.spurts} spurt(s)`);
  }
  // Finding 5's cases, and the peak rule.
  {
    const open = await render(sine(1000, 3, 10 ** (-35.8 / 20))), shut = await render(sine(1000, 3, 10 ** (-40 / 20)));
    const rnd = TF2Audio.mulberry32(42), white = Float32Array.from({ length: 3 * R }, () => rnd() * 2 - 1);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    const pink = Float32Array.from(white, (w) => {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      return v;
    });
    const k = 10 ** (-42 / 20) / rms(pink);
    for (let i = 0; i < pink.length; i++) pink[i] *= k;
    const noisy = await render(pink);
    check('finding 5: a 1 kHz sine with a peak of -35.8 dBFS is sent; -40 dBFS is not; pink noise at -42 dBFS RMS is not',
      open.codecInfo.spurts >= 1 && shut.codecInfo.spurts === 0 && noisy.codecInfo.spurts === 0 && peakAbs(shut.samples) === 0 && peakAbs(noisy.samples) === 0,
      `${open.codecInfo.spurts} / ${shut.codecInfo.spurts} / ${noisy.codecInfo.spurts} spurts; pink ${db(rms(pink)).toFixed(1)} dBFS RMS`);
    const click = (level) => { const x = new Float32Array(2 * R); x.fill(level, R, R + 24); return x; };
    const hit = await render(click(0.2)), miss = await render(click(0.1));
    check('the peak rule: 1 ms at 0.2 of full scale in silence is sent; at 0.1 it is not',
      hit.codecInfo.spurts === 1 && miss.codecInfo.spurts === 0, `${hit.codecInfo.spurts} / ${miss.codecInfo.spurts}`);
  }
  // The pre-roll and the hold, seeds 1 to 20: a 1 kHz square wave at 0.5 of
  // full scale (every sample passes the peak rule) from B to E, after 2 s of
  // noise at -50 dBFS.
  {
    const B = 2 * R, E = 3 * R, floor = 10 ** (-50 / 20) * Math.sqrt(3);
    const rnd = TF2Audio.mulberry32(9), x = Float32Array.from({ length: Math.round(4.5 * R) }, () => floor * (rnd() * 2 - 1));
    for (let i = B; i < E; i++) x[i] = Math.floor((i - B) / 12) % 2 ? -0.5 : 0.5;
    const pre = [], hold = [];
    for (let seed = 1; seed <= 20; seed++) {
      const s = (await render(x, { seed })).codecInfo.sender.spurts;
      pre.push(B - s[0].start);
      hold.push(s[0].start + 480 * s[0].frames - E);
    }
    check('the pre-roll: 100 ms and what of the onset\'s chunk lies before the burst (2400 to 4649 samples), seeds 1 to 20',
      pre.every((v) => v >= 2400 && v <= 4649), `${Math.min(...pre)} to ${Math.max(...pre)}`);
    check('the hold: the spurt ends 9,000 to 13,500 samples (375 to 562 ms) after the burst, seeds 1 to 20',
      hold.every((v) => v >= 9000 && v <= 13500), `${Math.min(...hold)} to ${Math.max(...hold)}`);
  }
  // The gate off: a sender setting; the same path after it.
  {
    const x = talk(4, 5), r = await render(x, { gate: false }), s = senderOf(x, { gate: false });
    check('the gate off: one spurt from -2400, sender.gate false, codecInfo.gate null, one resampler call a message that holds samples',
      r.codecInfo.spurts === 1 && r.codecInfo.sender.spurts[0].start === -2400 && r.codecInfo.sender.gate === false
      && r.codecInfo.gate === null && r.codecInfo.resampler.calls === holding(s.msgs) && r.codecInfo.sender.messages === s.msgs.length,
      `${r.codecInfo.resampler.calls} calls, ${s.msgs.length} messages`);
  }
  // 16 bits: the library's own 16-bit decoder.
  const lib = await import(require('url').pathToFileURL(path.join(root, 'vendor/libopus-1.1/index.mjs')).href);
  const encoderOptions = { sampleRate: R, channels: 1, frameSize: 480, application: 2048, signal: 3001, bitrate: 32000, complexity: 9, vbr: true, dtx: true, fec: false };
  {
    const loud = talk(3, 9, 2);
    const h = hooked();
    await render(loud, {}, h);
    const { msgs } = senderOf(loud);
    const sound = h.decoded.filter((d) => d.msg.silence === undefined);
    let enc = null, dec = null, floatDec = null, frames = 0, equal = sound.length === msgs.filter((m) => m.silence === undefined).length, soft = 0, k = 0;
    for (const m of msgs) {
      if (m.silence !== undefined) continue;
      if (!enc) { enc = await lib.createEncoder(encoderOptions); dec = await lib.createDecoder({ sampleRate: R, channels: 1 }); floatDec = await lib.createDecoder({ sampleRate: R, channels: 1 }); }
      const got = sound[k];
      for (let f = 0; f <= m.last - m.first; f++) {
        const packet = enc.encodeFloat(Float32Array.from(m.pcm.subarray(f * 480, (f + 1) * 480), (v) => v / 32768));
        const want = dec.decodeInt16(packet, { frameSize: 480 }), flt = round16(floatDec.decodeFloat(packet, { frameSize: 480 }));
        if (!got || !same(Array.from(got.pcm.subarray(f * 480, (f + 1) * 480)), Array.from(want))) equal = false;
        for (let i = 0; i < 480; i++) if (flt[i] !== want[i]) soft++;
        frames++;
      }
      if (m.end) { enc.free(); dec.free(); floatDec.free(); enc = dec = floatDec = null; }
      k++;
    }
    check('16 bits: the samples handed to the resampler are the module\'s decodeInt16 frame for frame, not clamp-and-round of decodeFloat',
      equal && frames > 100 && soft >= 1, `${frames} frames; ${soft} samples differ from clamp-and-round of decodeFloat`);
  }
  // The decoder's rules under loss: concealment capped at 10 frames a gap,
  // a late frame 480 zeros and no gap. One long spurt (the gate off).
  {
    const x = talk(8, 13, 0.3);
    const lossAt = (from, n, code = 1) => (count) => Uint8Array.from({ length: count }, (_, f) => (f >= from && f < from + n ? code : 0));
    const plain = await render(x, { gate: false });
    const lost15 = await withMask(lossAt(150, 15), () => render(x, { gate: false }));
    const lost10 = await withMask(lossAt(150, 10), () => render(x, { gate: false }));
    const lost5 = await withMask(lossAt(150, 5), () => render(x, { gate: false }));
    const slots = (r) => Array.from(r.codecInfo.frameLog).flatMap((c, i) => (c === 5 ? [i] : []));
    const s15 = slots(lost15), s0 = s15[0], bytes = (r) => Array.from(r.codecInfo.frameBytes);
    const p = bytes(plain), b15 = bytes(lost15), b10 = bytes(lost10), b5 = bytes(lost5);
    const run = (n) => Array.from({ length: n }, (_, k) => s0 + k);
    check('the cap: 15 frames lost in a row give exactly 10 lost slots, the gap\'s first 10 (where those frames lie without loss)',
      same(s15, run(10)) && same(slots(lost10), run(10)) && same(b15.slice(s0, s0 + 10), p.slice(s0, s0 + 10)),
      `lost slots ${s15[0]} to ${s15[s15.length - 1]}`);
    const tail = b15.length - s0 - 20;
    check('the cap: the sound after a gap of 15 is 100 ms (5 frames) earlier than after a gap of 10',
      same(b15.slice(s0 + 10, s0 + 10 + tail), b10.slice(s0 + 15, s0 + 15 + tail)) && !same(b15.slice(s0 + 10, s0 + 20), b10.slice(s0 + 10, s0 + 20)),
      `${tail} slots compared`);
    check('a gap of 5: 5 lost slots and nothing moves', same(slots(lost5), run(5)) && same(b5, p));
    const h = hooked(), late = await withMask(lossAt(150, 1, 2), () => render(x, { gate: false }, h));
    const d = h.decoded.find((e) => e.msg.first <= 150 && e.msg.last >= 150), j = 150 - d.msg.first;
    const total = (hh) => hh.decoded.reduce((n, e) => n + e.pcm.length, 0), hp = hooked();
    await render(x, { gate: false }, hp);
    check('a late frame: 480 zeros at its place in the decoded samples, and nothing concealed',
      d.pcm.length === 480 * (d.msg.last - d.msg.first + 1) && d.pcm.subarray(480 * j, 480 * (j + 1)).every((v) => v === 0)
      && total(h) === total(hp) && late.codecInfo.underrunFrames === 1 && late.codecInfo.lostFrames === 0,
      `block ${j} of the message from frame ${d.msg.first}`);
  }
  // Once per message, and one resampler for the render.
  {
    const x = talk(10, 11), s = senderOf(x), r = await render(x);
    check('once per message: one resampler call for each message that holds samples (silence records among them)',
      r.codecInfo.resampler.calls === holding(s.msgs) && s.msgs.some((m) => m.silence !== undefined) && r.codecInfo.resampler.kernel === Swr.DEFAULT_KERNEL,
      `${r.codecInfo.resampler.calls} calls, ${s.msgs.length} messages`);
    const exact = talk(4, 17).subarray(0, 96000), g = senderOf(exact, { seed: 0xC0FFEE, gate: false }), last = g.msgs[g.msgs.length - 1];
    const rg = await render(exact, { seed: 0xC0FFEE, gate: false });
    check('once per message: the gate off, 96,000 samples and seed 0xC0FFEE end on an empty end message, which makes no call',
      last.end && last.last === last.first - 1 && last.pcm.length === 0 && rg.codecInfo.resampler.calls === g.msgs.length - 1,
      `${rg.codecInfo.resampler.calls} calls, ${g.msgs.length} messages`);
    const three = bursts(8, [0.5, 3, 5.5], 1, -60), h = hooked();
    const r3 = await render(three, {}, h);
    const one = Swr.createResampler(), reset = Swr.createResampler();
    let match = true, resetMatch = true;
    h.decoded.forEach((e, k) => {
      if (!same(Array.from(one.packet(e.pcm)), Array.from(h.resampled[k].y))) match = false;
      if (!same(Array.from(reset.packet(e.pcm)), Array.from(h.resampled[k].y))) resetMatch = false;
      if (e.msg.end) reset.reset();
    });
    check('one resampler, never reset: its outputs are one createResampler() fed the decoded arrays in order; with a reset at each end marker they are not',
      r3.codecInfo.spurts === 3 && match && !resetMatch && h.decoded.length === h.resampled.length, `${h.resampled.length} packets in ${r3.codecInfo.spurts} spurts`);
  }
  // The gain is fed the decoded packets and nothing else, in the sender's
  // order: the silence records' zeros among them; a late frame's samples not.
  {
    const second = 3.3, x = bursts(6, [0.5, second], 0.8, -50), L = 156;   // 2 s apart
    const relay = (h, settings, lateMode = 'out') => {
      const gain = TF2Audio.createGain(settings), out = new Float32Array(h.gained.length), states = [];
      let spurt = null, cursor = 0;
      for (const { y, msg } of h.resampled) {
        let g = Float32Array.from(y, (v) => v / 32768);
        const F = msg.silence !== undefined ? 0 : msg.last - msg.first + 1, n = g.length;
        const lateFrames = (msg.lateBlocks || []);
        if (lateMode === 'out' && lateFrames.length) {
          for (let j = 0; j < F;) {
            if (lateFrames.includes(j)) { j++; continue; }
            let k = j;
            while (k < F && !lateFrames.includes(k)) k++;
            const a = Math.round(j * n / F), b = Math.round(k * n / F);
            g.set(gain.process(g.subarray(a, b)), a);
            j = k;
          }
        } else g = gain.process(g);
        states.push({ silence: msg.silence !== undefined, ...gain.state() });
        if (msg.silence !== undefined) continue;
        if (msg.spurt !== spurt) { spurt = msg.spurt; cursor = Math.round((msg.start - L) * VR / R); }
        for (let i = 0; i < n; i++) if (cursor + i >= 0 && cursor + i < out.length) out[cursor + i] = g[i];
        cursor += n;
      }
      return { out, states };
    };
    const settings = { avgGain: 0.5, maxGain: 10, scale: 1 }, h = hooked(), r = await render(x, {}, h);
    const mine = relay(h, settings), silence = mine.states.find((s) => s.silence);
    check('the gain is fed the decoded packets: the render\'s gain output is a fresh createGain fed every resampled packet in order (the silence record\'s included), laid as the render lays them',
      r.codecInfo.spurts === 2 && same(Array.from(mine.out), Array.from(h.gained)) && h.resampled.some((e) => e.msg.silence !== undefined),
      `${h.resampled.length} packets`);
    check('a silence record\'s samples are decoded zeros: they send the gain to its cap', silence && silence.current === 10 && silence.next === 10,
      silence ? `after the record: current ${silence.current}, next ${silence.next}` : 'no record');
    // Main's rule: receiverAutoGain with W3-05's decoded() over the same laid
    // signal, its blocks on the source's grid and a block not decoded held.
    const raw = new Float32Array(h.gained.length);
    { let spurt = null, cursor = 0;
      for (const { y, msg } of h.resampled) {
        if (msg.silence !== undefined) continue;
        if (msg.spurt !== spurt) { spurt = msg.spurt; cursor = Math.round((msg.start - L) * VR / R); }
        for (let i = 0; i < y.length; i++) if (cursor + i >= 0 && cursor + i < raw.length) raw[cursor + i] = y[i] / 32768;
        cursor += y.length;
      } }
    const old = TF2Audio.receiverAutoGain(raw, { ...settings, decoded: TF2Audio.decodedFromFrames(r.codecInfo.frameLog, 480, L, R, VR) });
    // The burst's onset where its decoded sound arrives on the timeline: a
    // decoded sample is laid where its source sample is (times 147/80), and
    // after the first packet the resampler is 16 inputs (29 outputs) late.
    let onset = Math.round(second * VR) - 200;
    while (Math.abs(raw[onset]) < 0.02) onset++;
    let first = -1;
    for (let i = onset; i < onset + 128; i++) if (old[i] !== h.gained[i]) { first = i - onset; break; }
    check('the gain\'s blocks run over the decoded samples, not the source\'s grid: it differs from main\'s rule in the first 128 samples of the second burst',
      first >= 0, `first difference ${first} samples after the onset, ${onset - Math.round(second * VR)} after the source's`);
    // One late frame inside the second burst: its samples are left out of
    // what the gain is given (and laid as they are), not fed to it.
    const frame = r.codecInfo.sender.spurts[1].frames > 30 ? (() => { const m = h.decoded.find((e) => e.msg.spurt === 1); return m.msg.first + 20; })() : -1;
    const hl = hooked();
    await withMask((count) => Uint8Array.from({ length: count }, (_, f) => (f === frame ? 2 : 0)), () => render(x, {}, hl));
    for (const e of hl.resampled) if (e.msg.first <= frame && e.msg.last >= frame) e.msg.lateBlocks = [frame - e.msg.first];
    const left = relay(hl, settings, 'out'), fed = relay(hl, settings, 'in');
    check('a late frame\'s samples are not decoded: the gain after its packet is the gain with them left out, not with them fed',
      frame > 0 && same(Array.from(left.out), Array.from(hl.gained)) && !same(Array.from(fed.out), Array.from(hl.gained)), `frame ${frame}`);
  }
  // Laying (point 8) and the slots (point 9). On this source two spurts meet
  // (the gate closes and opens again, its pre-roll over the last one's end),
  // and some anchors round up. The gain off: what is laid is what reaches onGain.
  {
    const x = talk(12, 11), h = hooked(), r = await render(x, { seed: 1, agc: false, voiceScale: 1 }, h), L = r.codecInfo.lookahead;
    const want = new Float32Array(h.gained.length);
    let spurt = null, cursor = 0, twice = 0, up = 0;
    for (const { y, msg } of h.resampled) {
      if (msg.silence !== undefined) continue;
      if (msg.spurt !== spurt) {
        spurt = msg.spurt;
        const a = (msg.start - L) * VR / R, anchor = Math.round(a);
        if (anchor > a) up++;
        twice += Math.max(0, cursor - anchor);
        cursor = anchor;
      }
      for (let i = 0; i < y.length; i++) if (cursor + i >= 0 && cursor + i < want.length) want[cursor + i] = y[i] / 32768;
      cursor += y.length;
    }
    check('laying: a spurt\'s first packet at round((start - lookahead) x 147/80), each later one after it, the later packet winning where two spurts meet',
      same(Array.from(want), Array.from(h.gained)) && twice > 0 && up > 0, `${r.codecInfo.spurts} spurts; ${twice} samples laid twice; ${up} anchors rounded up`);
    const n = r.codecInfo.frameLog.length, spurts = r.codecInfo.sender.spurts;
    const covered = (p) => Array.from({ length: n }, (_, i) => (spurts.some((s) => 480 * i + p >= s.start && 480 * i + p < s.start + 480 * s.frames) ? 1 : 0));
    check('slots: a 20 ms slot of the source holds a frame where a spurt\'s laid frames cover its centre, not its start',
      n === Math.ceil((x.length + L) / 480) && same(Array.from(r.codecInfo.frameLog, (c) => (c ? 1 : 0)), covered(240)) && !same(covered(240), covered(0)),
      `${n} slots, ${covered(240).reduce((t, v) => t + v, 0)} holding a frame`);
  }
  // The seed, the resampler's kernel, the complexity.
  {
    const x = talk(6, 21), a = await render(x, { seed: 3 }), b = await render(x, { seed: 3 }), c = await render(x, { seed: 4 });
    check('the same seed gives the same samples; another moves a spurt\'s start or the messages',
      same(Array.from(a.samples), Array.from(b.samples)) && (JSON.stringify(a.codecInfo.sender.spurts) !== JSON.stringify(c.codecInfo.sender.spurts)
        || a.codecInfo.sender.messages !== c.codecInfo.sender.messages || !same(Array.from(a.samples), Array.from(c.samples))),
      `${JSON.stringify(a.codecInfo.sender.spurts.map((s) => s.start))} / ${JSON.stringify(c.codecInfo.sender.spurts.map((s) => s.start))}`);
    const loud = talk(4, 23, 1.2), hf = hooked(), hc = hooked();
    await render(loud, {}, hf);
    await render(loud, { swrKernel: 'c' }, hc);
    let n = 0, differ = 0;
    hf.resampled.forEach((e, k) => { n += e.y.length; for (let i = 0; i < e.y.length; i++) if (e.y[i] !== hc.resampled[k].y[i]) differ++; });
    check('swrKernel \'c\' on a loud source changes at least one of the resampler\'s output samples and at most 1 in 500',
      peakAbs(loud) > 0.5 && differ >= 1 && differ <= n / 500, `${differ} of ${n}`);
    const signals = [talk(4, 25), loud, bursts(4, [0.5], 2, -50)];
    let identical = true, frames = 0;
    for (const sig of signals) {
      const q = Float32Array.from(captured(sig), (v) => v / 32768), hashes = [];
      for (const complexity of [9, 10]) {
        const packets = [];
        await opus.roundTrip(q, R, 32000, { runtime: '1.1.5', application: 'voip', signal: 'voice', complexity, vbr: true, dtx: true, onPacket: (f, p) => packets.push(Array.from(p).join()) });
        hashes.push(packets.join('|'));
        frames += packets.length / 2;
      }
      if (hashes[0] !== hashes[1]) identical = false;
    }
    check('complexity 9 (Steam sets none: the library\'s default) and 10 give identical packets on these signals',
      identical && steam.encoder.complexity === 9, `${frames} frames`);
  }
}

/* ---------------- tests ---------------- */

async function main() {
  sandbox.TF2Opus = await import(require('url').pathToFileURL(path.join(root, 'opus-codec.mjs')).href);
  const SR = 48000;

  console.log('\n[1] Resampler');
  {
    for (const f of [1000, 8000, 10000]) {
      const x = tone(f, 1, SR, 0.5);
      const y = TF2Audio.resampleSinc(x, SR, 24000);
      const g = db(rms(y, 2000, y.length - 2000) / rms(x, 4000, x.length - 4000));
      check(`48k->24k passband flat at ${f} Hz`, Math.abs(g) < 0.05, `${g.toFixed(3)} dB`);
    }
    const alias = TF2Audio.resampleSinc(tone(16000, 1, SR, 1), SR, 24000);
    const aliasDb = db(rms(alias, 2000, alias.length - 2000) / Math.SQRT1_2);
    check('16 kHz tone is rejected, not aliased, when decimating', aliasDb < -90, `${aliasDb.toFixed(1)} dB`);
    const imp = new Float32Array(4410); imp[2205] = 1;
    const up = TF2Audio.resampleSinc(imp, 44100, 48000);
    let at = 0; for (let i = 1; i < up.length; i++) if (Math.abs(up[i]) > Math.abs(up[at])) at = i;
    check('resampling preserves timing (impulse lands at 2400)', at === 2400, String(at));
    for (const [a, b] of [[44100, 48000], [48000, 44100], [8000, 44100], [24000, 44100], [96000, 24000]]) {
      const n = 12345;
      const out = TF2Audio.resampleSinc(new Float32Array(n), a, b);
      check(`${a} -> ${b} length is round(n * ratio)`, out.length === Math.round(n * b / a), String(out.length));
    }
    const src = tone(330, 0.25, SR, 0.2);
    const roundTrip = TF2Audio.resampleSinc(TF2Audio.resampleSinc(src, SR, SR / 2), SR / 2, SR);
    check('resampler round-trip reconstructs an in-band tone', diffRms(roundTrip.subarray(500, -500), src.subarray(500, -500)) < 1e-3);
  }

  console.log('\n[2] Profile calibration FIR');
  {
    // libopus 1.1.5 reproduces Steam's decoded spectrum, so only the capture resampler's band edge remains.
    check('steam has no decoder EQ', vm.runInContext('CODEC_PROFILES.steam.decoderEq', sandbox) == null);
    const eq = vm.runInContext('CODEC_PROFILES.steam.captureEq', sandbox);
    const taps = TF2Audio.firwin2(eq.taps, eq.freqs, eq.gainsDb, 24000);
    const gains = [1000, 5000, 9000, 10500].map(f => firGainDb(taps, f, 24000));
    check('steam capture EQ is transparent up to 10.5 kHz', gains.every(g => Math.abs(g) < 0.15), gains.map(g => g.toFixed(2)).join(' / '));
    const g114 = firGainDb(taps, 11450, 24000), g1175 = firGainDb(taps, 11750, 24000), g12 = firGainDb(taps, 12000, 24000);
    check('steam capture EQ follows the capture resampler roll-off from 11.1 kHz', Math.abs(g114 + 2.2) < 0.6 && Math.abs(g1175 + 6.6) < 1 && g12 < -7,
      `${g114.toFixed(2)} / ${g1175.toFixed(2)} / ${g12.toFixed(2)} dB`);
    const js = TF2Audio.firwin2(95, [0, 6000, 12000], [0, -6, -6], 24000);
    // Gains interpolate linearly: halfway from 1.0 to 0.501 is 0.75 (-2.5 dB).
    check('firwin2 design follows its gain points', Math.abs(firGainDb(js, 9000, 24000) + 6) < 0.1 && Math.abs(firGainDb(js, 3000, 24000) + 2.5) < 0.2);
    const impulse = new Float32Array(301); impulse[150] = 1;
    const y = TF2Audio.applyFirZeroPhase(impulse, taps);
    let at = 0; for (let i = 1; i < y.length; i++) if (Math.abs(y[i]) > Math.abs(y[at])) at = i;
    check('zero-phase FIR keeps the signal time-aligned', at === 150, String(at));
  }

  console.log('\n[3] Receiver auto-gain (Source voice channel model)');
  {
    const R = 44100;
    // Gain actually applied at sample i (only where the input is large and the output unclipped).
    const gainAt = (y, x, i) => (Math.abs(x[i]) > 0.05 && Math.abs(y[i]) < 0.99 ? y[i] / x[i] : NaN);
    const avgGainOver = (y, x, offsets, fromBlock, toBlock) => {
      let s = 0, n = 0;
      for (let b = fromBlock; b < toBlock; b++) for (const j of offsets) { const g = gainAt(y, x, b * 128 + j); if (Number.isFinite(g)) { s += g; n++; } }
      return s / Math.max(1, n);
    };
    // Steady sine: the default mean/peak blend (voice_avggain 0.5) overdrives by 1 / (2/pi + 0.5 (1 - 2/pi)) = 1.22.
    const sine = tone(440, 1, R, 0.2);
    const def = TF2Audio.receiverAutoGain(sine, {});
    const c1 = clipFraction(def.subarray(R / 2), 0.95 * 32767 / 32768), m1 = meanAbs(def, R / 2);
    check('voice_avggain 0.5 overdrives a steady sine 1.22x into the clamp (takes: 42% clipped, mean 0.71)', c1 > 0.40 && c1 < 0.46 && Math.abs(m1 - 0.71) < 0.02,
      `${(c1 * 100).toFixed(1)}% / ${m1.toFixed(3)}`);
    const c25 = clipFraction(TF2Audio.receiverAutoGain(sine, { avgGain: 0.25 }).subarray(R / 2), 0.95 * 32767 / 32768);
    check('voice_avggain 0.25 drives harder (take: 50% clipped)', c25 > 0.47 && c25 < 0.53, `${(c25 * 100).toFixed(1)}%`);
    const pk = TF2Audio.receiverAutoGain(sine, { avgGain: 1 });
    const p1 = peakAbs(pk.subarray(R / 2));
    check('voice_avggain 1 normalizes the block peak to full scale', p1 > 0.985 && p1 <= 1, p1.toFixed(4));
    const tiny = tone(440, 1, R, 0.001);
    const gain10 = rms(TF2Audio.receiverAutoGain(tiny, {}), R / 2) / rms(tiny, R / 2);
    const gain16 = rms(TF2Audio.receiverAutoGain(tiny, { maxGain: 16 }), R / 2) / rms(tiny, R / 2);
    check('quiet input stops at voice_maxgain (default 10)', Math.abs(gain10 - 10) < 0.05 && Math.abs(gain16 - 16) < 0.08,
      `${gain10.toFixed(3)} / ${gain16.toFixed(3)}`);
    const dense = TF2Audio.receiverAutoGain(musicLike(1, R, 5), {});
    const dpk = peakAbs(dense);
    check('output is int16 PCM clamped to full scale', dpk <= 1 && dpk > 0.99 && dense.every(v => Number.isInteger(v * 32768)), dpk.toFixed(6));
    check('dense input is hard-clipped at the ceiling', clipFraction(dense, 0.999) > 0.02, `${(clipFraction(dense, 0.999) * 100).toFixed(1)}%`);
    const onsetAt = 128 * 172;          // a block boundary
    const silentThenTone = new Float32Array(R);
    silentThenTone.set(tone(440, 0.5, R, 0.3), onsetAt);
    const onset = TF2Audio.receiverAutoGain(silentThenTone, {});
    check('digital silence stays silent', peakAbs(onset.subarray(0, onsetAt)) === 0);
    // A decoded block of zeros has mean and peak 0, so its target is the cap (W3-03, Set H): 0.3 x 10 clips.
    check('decoded silent blocks send the gain to its cap', peakAbs(onset.subarray(onsetAt, onsetAt + 128)) > 0.99,
      peakAbs(onset.subarray(onsetAt, onsetAt + 128)).toFixed(3));
    // Level step at a block edge: the old gain covers the next block, the ramp the one after, then the new target holds.
    const stepIn = new Float32Array(128 * 40);
    stepIn.set(tone(440, 128 * 8 / R, R, 0.02));
    stepIn.set(tone(440, 128 * 32 / R, R, 0.3), 128 * 8);
    const st = TF2Audio.receiverAutoGain(stepIn, {});
    const clipBlock = (b0, b1) => clipFraction(st.subarray(b0 * 128, b1 * 128), 0.95 * 32767 / 32768);
    check('after a level step the old gain holds for one block, then settles', clipBlock(8, 9) > 0.7 && Math.abs(clipBlock(10, 40) - 0.43) < 0.04,
      `${(clipBlock(8, 9) * 100).toFixed(0)}% -> ${(clipBlock(10, 40) * 100).toFixed(0)}%`);
    // voice_scale s: each block starts at s*s*T_prev and steps toward s*T by whole 1/128 increments (truncated).
    const x12 = tone(1000, 1, R, 0.25);
    const saw = TF2Audio.receiverAutoGain(x12, { scale: 0.5 });
    const gStart = avgGainOver(saw, x12, [0, 1, 2, 3, 4, 5, 6, 7], 100, 300), gEnd = avgGainOver(saw, x12, [120, 121, 122, 123, 124, 125, 126, 127], 100, 300);
    // T = 32767 / (mean + 0.5 (peak - mean)) = 4.89 here: s*s*T = 1.22; step = trunc(0.5 (T - s T)) = 1/128 per sample.
    check('voice_scale 0.5 saws from s*s*T toward s*T in 1/128 steps (take: 0.32 -> 0.55 FS at -12 dBFS)',
      Math.abs(gStart - 1.23) < 0.04 && Math.abs(gEnd - 2.19) < 0.04, `${gStart.toFixed(3)} -> ${gEnd.toFixed(3)}`);
    const loudSine = tone(1000, 1, R, 0.5);
    const flat = TF2Audio.receiverAutoGain(loudSine, { scale: 0.5 });
    const flatDb = 20 * Math.log10(rms(flat, R / 2));
    check('voice_scale 0.5 on a loud sine truncates the step to zero (take: -13.4 dB rms)', Math.abs(flatDb + 13.3) < 0.2, `${flatDb.toFixed(2)} dB`);
    // The first block after a reset is at unity whatever voice_scale is (fixed = 128).
    const t0 = tone(440, .2, R, .2), muted = TF2Audio.receiverAutoGain(t0, { scale: 0 });
    check('voice_scale 0 mutes exactly after the first block, which is at unity',
      peakAbs(muted.subarray(128)) === 0 && muted.subarray(0, 128).every((v, i) => v === Math.round(t0[i] * 32768) / 32768));
  }

  console.log('\n[4] Measured signature: dense music through the Steam path');
  {
    const src = musicLike(4, SR, 7);
    const r = await TF2Audio.process(mkBuffer(src, SR), { codec: 'steam', volume: 1 });
    const y = r.samples.subarray(SR / 2);
    const C = 32767 / 32768;
    const mc = meanAbs(y) / C, clipped = clipFraction(y, 0.95 * C), crest = db(C / rms(y));
    check('mean |y| sits near half the clip ceiling (recording: 0.49-0.52)', mc > 0.42 && mc < 0.58, mc.toFixed(3));
    check('a large share of samples reaches the ceiling (recording: ~13%)', clipped > 0.05 && clipped < 0.3, `${(clipped * 100).toFixed(1)}%`);
    check('crest factor is compressed (recording: 4.3-4.7 dB)', crest > 3 && crest < 6.5, `${crest.toFixed(2)} dB`);
    const hf = bandDb(y, SR, 14500, 20000);
    check('clipping after decode puts energy above the 12 kHz codec edge (recording: -37 to -56 dB)', hf > -70 && hf < -25, `${hf.toFixed(1)} dB rel`);
    const noAgc = await TF2Audio.process(mkBuffer(src.map(v => v * 0.3), SR), { codec: 'steam', volume: 1, agc: false });
    const hfOff = bandDb(noAgc.samples.subarray(SR / 2), SR, 14500, 20000);
    // Since W3-11a the receiver's 24 to 44.1 kHz step is Steam's own (libswresample's
    // 32-tap default filter, finding 29), which rejects its images above 14 kHz by
    // over 65 dB where the app's own filter gave 75 dB or more, and decoded sound is
    // whole 16-bit steps: -78.7 dB here, against -37 to -56 with the clamp.
    check('without the receiver clamp, the codec band edge holds', hfOff < -70, `${hfOff.toFixed(1)} dB rel`);
    const vol = await TF2Audio.process(mkBuffer(src, SR), { codec: 'steam' });
    const expected = ENGINE.volume;
    // RMS rather than peak: at volume 1 the final soft limiter touches the clipped peaks.
    check('output volume scales the rendered file linearly', Math.abs(rms(vol.samples) / rms(r.samples) - expected) < 0.01,
      (rms(vol.samples) / rms(r.samples)).toFixed(4));
  }

  console.log('\n[5] Real codec modes per profile');
  {
    const src = musicLike(1, SR, 3);
    const expect = { steam: ['hybrid', 32000], steam_48: ['hybrid', 64000], celt_22: ['celt', 22050], celt_44: ['celt', 22050], speex: ['speex', 11025] };
    for (const [codec, [mode, bitrate]] of Object.entries(expect)) {
      const r = await TF2Audio.process(mkBuffer(src, SR), { codec });
      const m = r.codecInfo.modes;
      const total = Object.values(m).reduce((sum, n) => sum + n, 0);
      // The engine codecs run their own libraries in fixed-size packets: CELT
      // 0.11, and Speex 1.0.2, whose frames have a mode of their own. The
      // Steam profiles run the libopus release Steam's packets match.
      const engine = codec.startsWith('celt') ? 'celt' : codec === 'speex' ? 'speex' : 'libopus';
      const name = { celt: 'CELT 0.11', speex: 'Speex 1.0.2', libopus: `libopus runs in ${mode} mode` }[engine];
      check(`${codec}: ${name} at ${bitrate / 1000} kbps`,
        r.codecInfo.backend === engine && r.codecInfo.bitrate === bitrate && m[mode] / total > 0.8, JSON.stringify(m));
      const release = { celt: 'CELT 0.11 (celt-0.11.0, pitch filter in)', speex: 'Speex 1.0.2', libopus: 'libopus 1.1.5' }[engine];
      check(`${codec}: encodes and decodes with ${release}`, r.codecInfo.version === release, r.codecInfo.version);
      // The game's module never sets the complexity, so the library's
      // default, 5, applies (W3-03); vaudio_celt_high's mode is the 44100 Hz
      // one, run on 22050 Hz sound, and vaudio_celt's has no mode rate of its own.
      if (engine === 'celt') {
        check(`${codec}: complexity 5 reaches the codec`, r.codecInfo.complexity === 5, String(r.codecInfo.complexity));
        const modeRate = { celt_22: undefined, celt_44: 44100 }[codec];
        check(`${codec}: ${modeRate ? `the ${modeRate} Hz mode on ${r.codecInfo.sampleRate} Hz sound, ${r.codecInfo.packetBytes}-byte packets of ${r.codecInfo.frameMs.toFixed(1)} ms` : 'no mode rate of its own'}`,
          r.codecInfo.modeRate === modeRate && ('modeRate' in r.codecInfo) === !!modeRate && r.codecInfo.sampleRate === 22050
          && r.codecInfo.packetBytes === { celt_22: 64, celt_44: 128 }[codec] && r.codecInfo.frameSamples === { celt_22: 512, celt_44: 1024 }[codec],
          JSON.stringify({ modeRate: r.codecInfo.modeRate, sampleRate: r.codecInfo.sampleRate, packetBytes: r.codecInfo.packetBytes, frameSamples: r.codecInfo.frameSamples }));
      }
      check(`${codec}: finite output`, !hasBadValues(r.samples) && r.samples.length === Math.round(src.length * r.sampleRate / SR));
    }
    const wide = whiteNoise(1, SR, 0.15, 7);
    const sp = await TF2Audio.process(mkBuffer(wide, SR), { codec: 'speex', agc: false, volume: 1 });
    // The narrowband codec on 11025 Hz sound, not resampled to 8000 Hz: its
    // band reaches 5.5 kHz (at 8000 Hz this band was empty, under -50 dB).
    const top = bandDb(sp.samples, SR, 4500, 5000);
    check('speex: Speex on 11.025 kHz sound keeps the band from 4.5 to 5 kHz', top > -15, `${top.toFixed(1)} dB rel`);
    const st = await TF2Audio.process(mkBuffer(wide, SR), { codec: 'steam', agc: false, volume: 1 });
    const stHi = bandRms(st.samples, SR, 'highpass', 4000) / rms(st.samples);
    check('steam keeps its 4-12 kHz band', db(stHi) > -8, `${db(stHi).toFixed(1)} dB rel`);
  }

  console.log('\n[5b] Sender voice gate (Steam VAD, measured)');
  {
    const rmsDbfs = (db) => 10 ** (db / 20) * Math.SQRT2;          // sine amplitude for an RMS level
    const quiet = await TF2Audio.process(mkBuffer(tone(1000, 1.5, SR, rmsDbfs(-45)), SR), { codec: 'steam', volume: 1 });
    check('a steady -45 dBFS RMS tone never opens the gate (take: -42 dB sine silent)', peakAbs(quiet.samples) === 0 && quiet.codecInfo.gatedFrames === quiet.codecInfo.frames,
      `${quiet.codecInfo.gatedFrames}/${quiet.codecInfo.frames}`);
    const open = await TF2Audio.process(mkBuffer(speechLike(1.5, SR, -38), SR), { codec: 'steam', volume: 1 });
    check('speech-like input at -38 dBFS RMS is transmitted and boosted to the 20 dB cap', open.codecInfo.gatedFrames === 0 && open.codecInfo.dtxFrames === 0 && Math.abs(db(rms(open.samples, SR / 2)) + 18) < 1.5,
      `${open.codecInfo.gatedFrames} gated, ${db(rms(open.samples, SR / 2)).toFixed(1)} dB`);
    const forced = await TF2Audio.process(mkBuffer(speechLike(1.5, SR, -45), SR), { codec: 'steam', volume: 1, gate: false });
    // Every 20 ms slot of the source is sent. Since W3-11a the sender's frames end
    // with the source (gate off: the rest is the last chunk), so the codec's delay
    // (6.5 ms) past the last frame is never decoded: a slot whose centre lies past
    // the source's end can stay empty.
    const pastEnd = (info, n) => Array.from(info.frameLog).every((c, i) => c !== 0 || (i * 480 + 240 - info.lookahead) >= n);
    check('gate: false transmits everything', pastEnd(forced.codecInfo, 1.5 * 24000) && forced.codecInfo.gate === null && forced.codecInfo.spurts === 1
      && Math.abs(db(rms(forced.samples, SR / 2)) + 25) < 1.5, `${db(rms(forced.samples, SR / 2)).toFixed(1)} dB; ${forced.codecInfo.gatedFrames} slot past the end`);
    const lower = await TF2Audio.process(mkBuffer(tone(1000, 1.5, SR, rmsDbfs(-45)), SR), { codec: 'steam', volume: 1, gateThresholdDb: -50 });
    check('the gate threshold is adjustable', lower.codecInfo.gatedFrames === 0 && lower.codecInfo.gate === -50);
    const legacy = await TF2Audio.process(mkBuffer(tone(1000, 1, SR, rmsDbfs(-45)), SR), { codec: 'speex', volume: 1 });
    check('push-to-talk engine codecs have no gate by default', legacy.codecInfo.gatedFrames === 0 && legacy.codecInfo.gate === null);
    // 0.5 s at -20 dBFS then 1.5 s at -60 dBFS. Steam's packets: the quiet tail is coded normally for ~10
    // frames, then DTX comfort noise, and transmission ends when the hold, 0.4 s of Steam's clock after
    // the last active chunk was read, has run out (W3-11a: Steam's rule; it was 22 frames of 20 ms).
    const burst = new Float32Array(2 * SR);
    burst.set(tone(700, 0.5, SR, rmsDbfs(-20)));
    burst.set(tone(700, 1.5, SR, rmsDbfs(-60)), SR / 2);
    const hb = await TF2Audio.process(mkBuffer(burst, SR), { codec: 'steam', volume: 1 });
    const tail = (a, b) => rms(hb.samples, Math.round(a * SR), Math.round(b * SR));
    const holdEnd = (hb.codecInfo.sender.spurts[0].start + 480 * hb.codecInfo.sender.spurts[0].frames) / 24000;
    check('the gate holds 0.4 s of its clock after speech (the spurt ends 375 to 562 ms after it), carrying the quiet tail at full auto-gain',
      Math.abs(db(tail(0.52, 0.66)) + 40) < 1.5 && holdEnd - 0.5 >= 0.375 && holdEnd - 0.5 <= 0.562
      && peakAbs(hb.samples.subarray(Math.round((holdEnd + 0.005) * SR))) === 0 && hb.codecInfo.spurts === 1,
      `${db(tail(0.52, 0.66)).toFixed(1)} dB, then silence from ${holdEnd.toFixed(3)} s`);
    check('the held tail falls into DTX comfort noise', hb.codecInfo.dtxFrames >= 5 && db(tail(0.74, 0.92)) < db(tail(0.52, 0.66)) - 6,
      `${hb.codecInfo.dtxFrames} DTX frames, ${db(tail(0.74, 0.92)).toFixed(1)} dB`);
    check('closed frames are neither encoded nor sent', hb.codecInfo.gatedFrames > 50 && hb.codecInfo.modes.hybrid + hb.codecInfo.modes.silk + hb.codecInfo.modes.celt === hb.codecInfo.frames - hb.codecInfo.gatedFrames,
      JSON.stringify({ gated: hb.codecInfo.gatedFrames, frames: hb.codecInfo.frames }));
    // A -60 dBFS floor, then speech at 1.0 s: the 120 ms before the onset is sent too (Steam's pre-roll).
    const onset = new Float32Array(2 * SR);
    onset.set(whiteNoise(1, SR, 10 ** (-60 / 20) * Math.sqrt(3), 5));
    onset.set(speechLike(1, SR, -20), SR);
    const po = await TF2Audio.process(mkBuffer(onset, SR), { codec: 'steam', volume: 1 });
    const pre = db(rms(po.samples, Math.round(0.89 * SR), Math.round(0.99 * SR)));
    // The white floor loses half its power in the 24 kHz resample and ~3 dB in the codec, then gains 20 dB.
    check('the gate sends 120 ms of pre-roll before an onset', peakAbs(po.samples.subarray(0, Math.round(0.86 * SR))) === 0 && pre > -49 && pre < -43, `${pre.toFixed(1)} dB`);
    const twoBursts = (gap) => { const x = new Float32Array(Math.round((1 + gap) * SR)); x.set(speechLike(0.5, SR, -20)); x.set(speechLike(0.5, SR, -20), Math.round((0.5 + gap) * SR)); return x; };
    // Since W3-11a Steam's rule: a pause shorter than the hold keeps the spurt
    // going (there is no 560 ms rule of hold and pre-roll, finding 12).
    const near = await TF2Audio.process(mkBuffer(twoBursts(0.3), SR), { codec: 'steam', volume: 1 });
    const far = await TF2Audio.process(mkBuffer(twoBursts(0.8), SR), { codec: 'steam', volume: 1 });
    check('a pause under the hold stays in one talk spurt; a longer one restarts the encoder', near.codecInfo.spurts === 1 && far.codecInfo.spurts === 2,
      `${near.codecInfo.spurts} / ${far.codecInfo.spurts}`);
    // Steam's encoder put the test signal's steady -36 and -30 dB sines into DTX; so does the model.
    // Finding 13's segments as the test signal has them: 1 s of silence, then 1 kHz sines at -60 to
    // -24 dBFS peak, 2 s each, one after the other. Steam: the -36 sine's first DTX frame at 0.42 s and
    // 75 DTX frames; the -30 sine's at 1.16 s and 40; none at -24. (W3-11a: a lone tone from digital
    // silence, the check before, now meets 100 ms of zeros as its pre-roll and 16-bit samples, which
    // keep a clean sine active longer; the measured sequence is what the model answers to.)
    const levels = [-60, -54, -48, -42, -36, -30, -24], seq = new Float32Array(SR * (1 + 2 * levels.length));
    levels.forEach((L, k) => seq.set(tone(1000, 2, SR, 10 ** (L / 20)), SR + 2 * k * SR));
    const steady = await TF2Audio.process(mkBuffer(seq, SR), { codec: 'steam', volume: 1 });
    const dtxIn = (k) => {
      const a = Math.ceil((1 + 2 * k) / 0.02), log = steady.codecInfo.frameLog;
      let n = 0, first = -1;
      for (let f = a; f < a + 100 && f < log.length; f++) if (log[f] === 4) { n++; if (first < 0) first = (f - a) * 0.02; }
      return { n, first };
    };
    const [s36, s30, s24] = [4, 5, 6].map(dtxIn);
    check('steady sines fall into DTX comfort noise as Steam\'s did (finding 13: -36 dBFS from 0.42 s, 75 frames; -30 from 1.16 s, 40; -24 none)',
      Math.abs(s36.first - 0.42) <= 0.08 && Math.abs(s36.n - 75) <= 5 && Math.abs(s30.first - 1.16) <= 0.08 && Math.abs(s30.n - 40) <= 5 && s24.n === 0,
      `-36: ${s36.n} from ${s36.first.toFixed(2)} s; -30: ${s30.n} from ${s30.first.toFixed(2)} s; -24: ${s24.n}`);
    // Stereo capture: the measured default takes the left channel, as a mono read of a stereo cable does.
    const L = tone(500, 1, SR, 0.2), Rch = new Float32Array(SR);
    const stereoSrc = { sampleRate: SR, length: SR, numberOfChannels: 2, getChannelData: (c) => c ? Rch : L };
    const capL = await TF2Audio.process(stereoSrc, { codec: 'steam', volume: 1, enableWarble: false, agc: false });
    const capR = await TF2Audio.process(stereoSrc, { codec: 'steam', volume: 1, enableWarble: false, agc: false, captureChannel: 'right' });
    const capM = await TF2Audio.process(stereoSrc, { codec: 'steam', volume: 1, enableWarble: false, agc: false, captureChannel: 'mix' });
    check('stereo input: left channel by default, right and mix on request', Math.abs(db(rms(capL.samples) / rms(L))) < 0.3 && rms(capR.samples) === 0 && Math.abs(db(rms(capM.samples) / rms(L)) + 6.02) < 0.3,
      `${db(rms(capL.samples) / rms(L)).toFixed(2)} / ${db(rms(capM.samples) / rms(L)).toFixed(2)} dB`);
  }

  await steamSection();

  console.log('\n[6] Clean path and codec bypass');
  {
    const src = tone(1000, 2, SR, 0.25);
    const { samples, sampleRate, codecInfo } = await TF2Audio.process(mkBuffer(src, SR), clean);
    const ratio = rms(samples) / rms(src);
    check('no NaN/Inf', !hasBadValues(samples));
    check('playback rate = source rate', sampleRate === SR, String(sampleRate));
    check('bypass with unity gain is level-transparent', Math.abs(db(ratio)) < 0.2, `${db(ratio).toFixed(2)} dB`);
    check('bypass is reported honestly', codecInfo.backend === 'bypass');
    const low = await TF2Audio.process(mkBuffer(tone(1000, 0.5, 16000, 0.2), 16000), clean);
    check('low-rate sources render at the 44.1 kHz mixer rate', low.sampleRate === 44100, String(low.sampleRate));
  }

  console.log('\n[7] Valve DSP room presets (real dsp_presets.txt parameters)');
  {
    const src = tone(440, 1.5, SR, 0.25);
    const inLen = Math.round(1.5 * SR);
    for (let id = 0; id <= 29; id++) {
      const { samples } = await TF2Audio.process(mkBuffer(src, SR), { ...clean, listenerPos: null, dspRoom: id });
      const ratio = rms(samples, 0, Math.min(inLen, samples.length)) / rms(src);
      check(`dsp ${id}: level sane`, ratio > 0.2 && ratio < 2.5, `${db(ratio).toFixed(2)} dB`);
      check(`dsp ${id}: not crushed`, clipFraction(samples, 0.95) < 0.02, `clip ${(clipFraction(samples, 0.95) * 100).toFixed(2)}%`);
      check(`dsp ${id}: no NaN/Inf`, !hasBadValues(samples));
    }
    for (const id of [7, 22]) {
      const { samples } = await TF2Audio.process(mkBuffer(src, SR), { ...clean, listenerPos: null, dspRoom: id });
      check(`dsp ${id}: has a tail`, samples.length > inLen + 0.3 * SR, `${((samples.length - inLen) / SR).toFixed(2)}s`);
    }
    const dry = await TF2Audio.process(mkBuffer(src, SR), { ...clean, listenerPos: null, dspRoom: 0 });
    check('dsp 0: exact passthrough length', dry.samples.length === inLen);
  }

  console.log('\n[8] Custom env (dsp_room 99) and processor robustness');
  {
    const src = tone(440, 1.5, SR, 0.25);
    const opts = { ...clean, listenerPos: null, dspRoom: 99 };
    const wet = await TF2Audio.process(mkBuffer(src, SR), { ...opts, customEnv: { duration: 1.2, decay: 2.0, mix: 0.6 } });
    const dry = await TF2Audio.process(mkBuffer(src, SR), { ...opts, customEnv: { duration: 1.2, decay: 2.0, mix: 0.0 } });
    check('custom mix adds a tail', wet.samples.length > dry.samples.length, `${wet.samples.length} vs ${dry.samples.length}`);
    check('custom mix changes output', diffRms(wet.samples, dry.samples) > 0.02 * rms(dry.samples));
    const ratio = rms(wet.samples, 0, dry.samples.length) / rms(src);
    check('custom level sane', ratio > 0.25 && ratio < 2.5, `${db(ratio).toFixed(2)} dB`);
    const x = whiteNoise(0.5, SR, 0.2, 3);
    const out = await TF2Audio.runDspChain(x, SR, [
      { type: 'rva', sizeMax: 60, sizeMin: 0, ndly: 3, fb: 0.9, gain: 1.0, cutoff: 4000, fpar: 1, fmod: 0, rate: 0 }
    ], 0.45);
    const r2 = rms(out, 0, x.length) / rms(x);
    check('rva with sizeMin=0 stays finite and sane', !hasBadValues(out) && r2 > 0.2 && r2 < 3, `${db(r2).toFixed(2)} dB`);
  }

  console.log('\n[9] Packet loss and jitter (measured) + native PLC');
  {
    const burstStats = (mask, value = 1) => {
      let ones = 0, runs = 0, runLen = 0, runSum = 0;
      for (let i = 0; i <= mask.length; i++) {
        if (i < mask.length && mask[i] === value) { ones++; runLen++; }
        else if (runLen > 0) { runs++; runSum += runLen; runLen = 0; }
      }
      return { rate: ones / mask.length, meanBurst: runs ? runSum / runs : 0, runs };
    };
    const lossMask = TF2Audio.buildLossMask(40000, 1, 22, TF2Audio.mulberry32(1234));
    const ls = burstStats(lossMask);
    check('loss rate near target 22%', Math.abs(ls.rate - 0.22) < 0.02, `${(ls.rate * 100).toFixed(1)}%`);
    // Measured: net_fakeloss 5 on a listen server lost ~22% of frames in bursts of ~2.2 frames,
    // i.e. about 50 * 0.22 / 2.2 = 5 bursts per second.
    check('bursts average ~2.2 frames, ~5 per second at 22%', Math.abs(ls.meanBurst - 2.2) < 0.25 && Math.abs(ls.runs / (40000 / 50) - 5) < 0.6,
      `${ls.meanBurst.toFixed(2)} frames, ${(ls.runs / (40000 / 50)).toFixed(2)}/s`);
    for (const target of [1, 50, 70, 90, 99]) {
      const m = TF2Audio.buildLossMask(200000, 3, target, TF2Audio.mulberry32(56));
      const measured = m.reduce((a, b) => a + b, 0) * 100 / m.length;
      check(`loss ${target}% stays near target`, Math.abs(measured - target) < 1.5, `${measured.toFixed(2)}%`);
      check(`loss ${target}% groups complete packets`, m.every((x, i) => x === m[i - i % 3]));
    }
    const jm = TF2Audio.buildLossMask(200000, 1, 0, TF2Audio.mulberry32(9), 50);
    const late = jm.reduce((a, v) => a + (v > 0 ? 1 : 0), 0) / jm.length;
    const silentShare = jm.reduce((a, v) => a + (v === 2 ? 1 : 0), 0) / Math.max(1, jm.reduce((a, v) => a + (v > 0 ? 1 : 0), 0));
    check('50 ms jitter makes ~3.2% of frames late, a tenth of them silent', Math.abs(late - 0.032) < 0.003 && Math.abs(silentShare - 0.1) < 0.02,
      `${(late * 100).toFixed(2)}% late, ${(silentShare * 100).toFixed(0)}% silent`);
    check('late frames are isolated, not bursts', burstStats(jm, 1).meanBurst < 1.1, burstStats(jm, 1).meanBurst.toFixed(2));
    check('no loss and no jitter means no mask', TF2Audio.buildLossMask(100, 1, 0, TF2Audio.mulberry32(1), 0) === null);

    const src = whiteNoise(2, SR, 0.2, 42);
    const opts = { codec: 'steam', agc: false, volume: 1, listenerPos: 'open', lossPct: 25, frameMs: 20 };
    const none = await TF2Audio.process(mkBuffer(src, SR), { ...opts, lossPct: 0 });
    const lossy = await TF2Audio.process(mkBuffer(src, SR), opts);
    const eRatio = Math.pow(rms(lossy.samples) / rms(none.samples), 2);
    check('25% loss reduces energy, PLC fills some', eRatio > 0.35 && eRatio < 0.99, `energy ${eRatio.toFixed(3)}`);
    const f80 = await TF2Audio.process(mkBuffer(src, SR), { ...opts, frameMs: 80 });
    check('net_split changes the loss pattern', diffRms(lossy.samples, f80.samples) > 1e-6);
    check('net_split is reported in whole frames', f80.codecInfo.framesPerPacket === 4);
    const dead = await TF2Audio.process(mkBuffer(src, SR), { ...opts, lossPct: 100 });
    check('100% loss -> silence', rms(dead.samples) < 1e-6, `rms ${rms(dead.samples).toExponential(2)}`);

    const jproc = await TF2Audio.process(mkBuffer(src, SR), { ...opts, lossPct: 0, jitterMs: 100 });
    check('jitterMs wired into process(): late frames concealed or silent', diffRms(jproc.samples, none.samples) > 1e-4
      && jproc.codecInfo.lostFrames + jproc.codecInfo.underrunFrames > 0, `${jproc.codecInfo.lostFrames} concealed, ${jproc.codecInfo.underrunFrames} silent`);
  }

  console.log('\n[10] Input and option robustness');
  {
    const left = new Float32Array([1, -1, 0.5]);
    const right = new Float32Array([-1, 1, 0.5]);
    const stereo = { sampleRate: SR, length: left.length, numberOfChannels: 2, getChannelData: (c) => c ? right : left };
    const mono = TF2Audio.bufferToMono(stereo);
    check('stereo downmix averages channels', mono[0] === 0 && mono[1] === 0 && Math.abs(mono[2] - 0.5) < 1e-6);

    const src = tone(330, 0.25, SR, 0.2);
    const robust = await TF2Audio.process(mkBuffer(src, SR), {
      codec: 'not-a-codec', listenerPos: 'not-a-place', dspRoom: 99,
      customEnv: { duration: NaN, decay: Infinity, mix: 'bad' },
      micGain: NaN, voiceScale: Infinity, hp: 'bad', lp: NaN, maxGain: NaN, avgGain: 'x', volume: -3,
      bits: NaN, lossPct: Infinity, jitterMs: NaN, frameMs: 'bad', seed: NaN
    });
    check('invalid options fall back without NaN/Inf', robust.samples.length > 0 && !hasBadValues(robust.samples));
    const unknown = await TF2Audio.process(mkBuffer(src, SR), { codec: 'not-a-codec' });
    const known = await TF2Audio.process(mkBuffer(src, SR), { codec: 'steam' });
    check('unknown codec falls back to steam', diffRms(unknown.samples, known.samples) === 0);
    const again = await TF2Audio.process(mkBuffer(src, SR), { codec: 'steam' });
    check('deterministic render', again.samples.every((v, i) => v === known.samples[i]));

    const tiny = new Float32Array(17);
    tiny[0] = 0.5;
    const tinyResult = await TF2Audio.process(mkBuffer(tiny, 22050), { codec: 'speex' });
    check('very short buffers render safely', tinyResult.samples.length > 0 && !hasBadValues(tinyResult.samples));

    // An empty source through a room is the room's silent tail, whatever the
    // mixer: resampleLinear of nothing is nothing (it once gave one NaN sample,
    // which the room carried past the output's cut).
    check('linear mixer: an empty input gives an empty output', TF2Audio.resampleLinear(new Float32Array(0), 22050, 44100).length === 0);
    const emptyRooms = [];
    for (const codec of ['steam', 'steam_48', 'celt_22', 'celt_44', 'speex']) {
      try {
        const r = await TF2Audio.process(mkBuffer(new Float32Array(0), SR), { codec, dspRoom: 6 });
        emptyRooms.push(r.samples.length > 0 && r.samples.every(v => v === 0) ? r.samples.length : `${codec}: not silent`);
      } catch (error) { emptyRooms.push(`${codec}: ${error.message}`); }
    }
    check('an empty source through a room renders the same silent tail with every profile',
      emptyRooms.every(n => n === emptyRooms[0] && typeof n === 'number'), emptyRooms.join(', '));

    const hot = await TF2Audio.process(mkBuffer(tone(440, 0.5, SR, 0.9), SR), { ...clean, micGain: 4 });
    check('mic gain above unity clips the int16 capture', peakAbs(hot.samples) < 1.02 && clipFraction(hot.samples, 0.9) > 0.2);

    let rejected = false;
    try { await TF2Audio.process(null, {}); } catch (error) { rejected = error && error.name === 'TypeError'; }
    check('invalid source is rejected clearly', rejected);
  }

  console.log('\n[10b] Live chain: process() a block at a time');
  {
    // Each streaming stage, fed uneven blocks, equals its offline counterpart.
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
    const x = Float32Array.from({ length: 24000 }, (_, i) => 0.3 * Math.sin(i * 0.013 + 1e-5 * i * i) + 0.05 * rnd());
    const inBlocks = (stage) => {
      const parts = [], sizes = [100, 960, 7, 1234, 480];
      for (let o = 0, k = 0; o < x.length; k++) { const n = Math.min(sizes[k % sizes.length], x.length - o); parts.push(stage(x.subarray(o, o + n))); o += n; }
      const out = new Float32Array(parts.reduce((t, p) => t + p.length, 0));
      parts.reduce((o, p) => { out.set(p, o); return o + p.length; }, 0);
      return out;
    };
    const maxDiff = (a, b, n, shift = 0) => { let d = 0; for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(a[i] - b[i + shift])); return d; };
    for (const [from, to] of [[48000, 24000], [44100, 24000], [24000, 44100], [44100, 48000]]) {
      const offline = TF2Audio.resampleSinc(x, from, to), live = inBlocks(TF2Audio.streamResampleSinc(from, to));
      check(`streaming ${from} -> ${to} Hz resampler equals resampleSinc`, maxDiff(offline, live, Math.min(offline.length, live.length) - 100) === 0,
        `${live.length} of ${offline.length} samples out`);
    }
    const taps = TF2Audio.firwin2(255, [0, 11000, 12000], [0, 0, -8.5], 24000);
    check('streaming FIR equals the zero-phase FIR, 127 samples late',
      maxDiff(TF2Audio.applyFirZeroPhase(x, taps), inBlocks(TF2Audio.streamFir(taps)), x.length - 300, 127) === 0);
    const agc = { blockSize: 128, avgGain: 0.5, maxGain: 10, scale: 1 };
    const agcLive = inBlocks(TF2Audio.streamAutoGain(agc));
    check('streaming auto-gain equals receiverAutoGain', maxDiff(TF2Audio.receiverAutoGain(x, agc), agcLive, agcLive.length) === 0);
    const mask = TF2Audio.buildLossMask(600, 2, 18, TF2Audio.mulberry32(5), 50), next = TF2Audio.streamLossMask(2, 18, TF2Audio.mulberry32(5), 50);
    check('streaming loss model draws the same frames as buildLossMask', mask.every(v => v === next()));

    // The whole chain, 20 ms at a time, against a render of the same audio:
    // the same level, and the same waveform once the live chain's own delay
    // (the capture EQ's half length, Opus lookahead, output FIR 1 sample at
    // 44.1 kHz) is allowed for. Since W3-11a a `steam` render runs Steam's
    // sender and decoder, while the live chain keeps the 20 ms frame gate,
    // the float decode and the app's resampler until W3-11b; `steam_48` runs
    // that path in both, so it holds the live chain to the render here.
    const src = speechLike(3, SR, -20);
    const opts = { codec: 'steam_48', volume: 1 };
    const chain = await TF2Audio.createLiveChain(opts, SR);
    const parts = [];
    for (let o = 0; o < src.length; o += SR / 50) parts.push(await chain.process(src.subarray(o, o + SR / 50)));
    const live = new Float32Array(parts.reduce((t, p) => t + p.length, 0));
    parts.reduce((o, p) => { live.set(p, o); return o + p.length; }, 0);
    chain.free();
    const whole = await TF2Audio.process(mkBuffer(src, SR), opts), offline = whole.samples;
    const live48 = vm.runInContext('CODEC_PROFILES.steam_48', sandbox), eqHalf = live48.captureEq ? (live48.captureEq.taps - 1) / 2 : 0;
    const delay = (eqHalf + whole.codecInfo.lookahead) / live48.codecRate + 1 / 44100, shift = Math.round(delay * SR);
    const correlate = (d) => {
      let dot = 0, ea = 0, eb = 0;
      for (let i = SR / 2; i < live.length - shift - SR / 2; i++) { dot += offline[i] * live[i + shift + d]; ea += offline[i] ** 2; eb += live[i + shift + d] ** 2; }
      return { r: dot / Math.sqrt(ea * eb), levelDb: 10 * Math.log10(eb / ea) };
    };
    const { r, levelDb } = correlate(0);
    check('live chain reproduces the render (waveform and level)', r > 0.9 && Math.abs(levelDb) < 0.5, `r ${r.toFixed(3)}, ${levelDb.toFixed(2)} dB`);
    let peak = 0;
    for (let d = -3; d <= 3; d++) if (correlate(d).r > correlate(peak).r) peak = d;
    check('live chain output lines up with the render to the sample once its stated delay is removed',
      chain.contentDelay === shift && peak === 0, `contentDelay ${chain.contentDelay} samples, peak at ${peak}`);
    check('live chain holds back the gate pre-roll (120 ms) and reports its delay',
      offline.length - live.length >= 0.12 * SR && Math.abs(chain.stats.latencyMs - 1000 * (0.12 + delay)) < 0.01,
      `${chain.stats.latencyMs.toFixed(2)} ms; ${chain.stats.sent} of ${chain.stats.frames} frames sent`);

    {
      // vaudio_celt_high's gate counts its own frames, 46.4 ms of 22050 Hz
      // sound (not of the 44100 Hz mode): 120 ms of pre-roll is 3 frames and
      // 440 ms of hold is 9. The live chain sends the frames process() sends.
      const rate = 48000, n = 8 * rate;
      let seed = 3;
      const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
      const bursts = new Float32Array(n);
      for (let i = 0; i < n; i++) bursts[i] = 2e-4 * (rnd() * 2 - 1);
      for (const t0 of [0.5, 2.2, 2.9, 5.5]) for (let i = 0; i < 0.7 * rate; i++) bursts[Math.round(t0 * rate) + i] += 0.2 * Math.sin(i * 0.04) * (0.5 + 0.5 * rnd());
      const gated = { codec: 'celt_44', gate: true };
      const whole = (await TF2Audio.process(mkBuffer(bursts, rate), gated)).codecInfo;
      const celtChain = await TF2Audio.createLiveChain(gated, rate);
      for (let o = 0; o < n; o += 960) await celtChain.process(bursts.subarray(o, o + 960));
      const sent = celtChain.stats.sent;
      celtChain.free();
      check('celt_44 live chain: its gate counts 46.4 ms frames (pre-roll 3, hold 9) and sends the frames process() sends',
        whole.prerollFrames === 3 && whole.holdFrames === 9 && whole.spurts > 1 && sent === whole.frames - whole.gatedFrames,
        `live ${sent} sent; process() ${whole.frames - whole.gatedFrames} of ${whole.frames}, pre-roll ${whole.prerollFrames}, hold ${whole.holdFrames}`);
    }
  }

  console.log('\n[10c] Receiver talk-spurt re-timing (voice_retime)');
  {
    // Noise bursts 0.6 s long with 0.8 s between them: the gate's 440 ms hold
    // leaves about 0.24 s of silence, short enough for TF2 to start early.
    const src = new Float32Array(SR * 12);
    let seed = 11;
    for (let b = 0; b < 8; b++) for (let i = 0; i < SR * .6; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      src[Math.round((.3 + b * 1.4) * SR) + i] = ((seed / 2 ** 32) - .5) * .3;
    }
    // The same seed for both: since W3-11a the seed also sets the sender's clock.
    const plain = await TF2Audio.process(mkBuffer(src, SR), { codec: 'steam', seed: 3 });
    const moved = await TF2Audio.process(mkBuffer(src, SR), { codec: 'steam', retime: true, seed: 3 });
    const again = await TF2Audio.process(mkBuffer(src, SR), { codec: 'steam', retime: true, seed: 3 });
    const moves = moved.codecInfo.retimed || [];
    check('re-timing starts some spurts early, never the one after an early start, and never by more than the silence',
      moves.length > 0 && moves.length < 7 && moves.every(m => m.shiftMs > 0 && m.shiftMs <= 350)
      && moves.every((m, i) => i === 0 || m.time - moves[i - 1].time > 2), moves.map(m => `${m.time.toFixed(2)} s −${m.shiftMs.toFixed(0)} ms`).join(', '));
    check('re-timing is repeatable for a seed and keeps the length', moved.samples.length === plain.samples.length
      && moved.samples.every((v, i) => v === again.samples[i]));
    // The moved burst is the same audio, earlier.
    const m = moves[0], shift = Math.round(m.shiftMs / 1000 * plain.sampleRate), at = Math.round((m.time + .1) * plain.sampleRate);
    let dot = 0, ea = 0, eb = 0;
    for (let i = at; i < at + plain.sampleRate * .3; i++) { dot += plain.samples[i] * moved.samples[i - shift]; ea += plain.samples[i] ** 2; eb += moved.samples[i - shift] ** 2; }
    check('a re-timed spurt is the same audio, earlier', dot / Math.sqrt(ea * eb) > .9, `r ${(dot / Math.sqrt(ea * eb)).toFixed(3)}`);
    check('off by default: the render keeps the source timing', !plain.codecInfo.retimed);
  }

  console.log('\n[11] WAV encoding');
  {
    const src = tone(440, 0.5, SR, 0.25);
    const { samples, sampleRate, blob } = await TF2Audio.process(mkBuffer(src, SR), { codec: 'steam' });
    check('blob size = 44 + 2N', blob.size === 44 + samples.length * 2, String(blob.size));
    const ab = Buffer.from(await blob.arrayBuffer());
    check('RIFF/WAVE header', ab.toString('ascii', 0, 4) === 'RIFF' && ab.toString('ascii', 8, 12) === 'WAVE');
    check('header sample rate matches', ab.readUInt32LE(24) === sampleRate, String(ab.readUInt32LE(24)));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
