/* =========================================================================
 * tests/verify.js: headless verification of the TF2 voice pipeline.
 *
 * The engine is plain JS, so it runs under Node, loaded in this realm by the
 * tests' one loader (tests/lib/engine.cjs):
 *     node tests/verify.js
 * TF2_DIR points the suite at a copy of the sources elsewhere.
 *
 * Covers, by the labels it prints:
 *   [1] the resampler: passband, stopband, alignment and exact lengths
 *   [2] the profile calibration FIR's response
 *   [3] the receiver's auto-gain: target, cap, int16 clamp, silence, voice_scale
 *   [4] the measured clipping signature on dense input
 *   [5] [5b] real codec modes for every profile; the sender's voice gate
 *   [6] the clean path and the codec bypass
 *   [7] [8] room presets, the automatic room, the custom room and under water
 *   [9] packet loss and jitter, and the codec's own concealment
 *   [10] [10b] [10c] option robustness; the live chain a block at a time;
 *       talk-spurt re-timing
 *   [11] WAV integrity
 * The steam profile's three sections ([5c], [5d], and [10b] for steam) are in
 * tests/steam.verify.js; the signals both files use are in tests/lib/signals.cjs.
 * ========================================================================= */

'use strict';

const path = require('path');
const { loadEngine, sourceRoot } = require('./lib/engine.cjs');
const { mkBuffer, tone, speechLike, rms, peakAbs, db } = require('./lib/signals.cjs');

const root = sourceRoot();
// The engine in this realm, from the tests' one loader (tests/lib/engine.cjs):
// its six files, the room module and its table among them, as the page loads
// them. The codec module is set in main().
const engine = loadEngine({ root });
// The suite's own copy of the room module, for its checks in [7] and [8]
// (the one the engine was handed: Node loads a module once).
const TF2Room = require(path.join(root, 'room-dsp.js'));
const TF2Audio = engine.audio;
const ENGINE = engine.VOICE_ENGINE;

/* ---------------- helpers ---------------- */

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

function meanAbs(x, from = 0, to = x.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += Math.abs(x[i]);
  return s / Math.max(1, to - from);
}

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

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok    ${name}${detail ? '   [' + detail + ']' : ''}`); }
  else      { fail++; console.error(`  FAIL  ${name}${detail ? '   [' + detail + ']' : ''}`); }
}

// Clean path: no codec, unity receiver gain, full output volume.
const clean = { enableWarble: false, agc: false, volume: 1, listenerPos: 'open' };

/* ---------------- tests ---------------- */

async function main() {
  engine.codec = await import(require('url').pathToFileURL(path.join(root, 'opus-codec.mjs')).href);
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
    check('steam has no decoder EQ', engine.CODEC_PROFILES.steam.decoderEq == null);
    const eq = engine.CODEC_PROFILES.steam.captureEq;
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
    // At a 44.1 kHz device: the codec's band edge, with no device stage after
    // the mixer. At 48 kHz (W3-10) the device stage's linear interpolation
    // adds its own images up there (the listener's PC's, in the takes as
    // well): -43.7 dB on this source without the clamp.
    const noAgc = await TF2Audio.process(mkBuffer(src.map(v => v * 0.3), SR), { codec: 'steam', volume: 1, agc: false, deviceRate: 44100 });
    const hfOff = bandDb(noAgc.samples.subarray(44100 / 2), 44100, 14500, 20000);
    // Since W3-11a the receiver's 24 to 44.1 kHz step is Steam's own (libswresample's
    // 32-tap default filter, finding 29), which rejects its images above 14 kHz by
    // over 65 dB where the app's own filter gave 75 dB or more, and decoded sound is
    // whole 16-bit steps: -78.7 dB here, against -37 to -56 with the clamp.
    check('without the receiver clamp, the codec band edge holds (at a 44.1 kHz device)', hfOff < -70, `${hfOff.toFixed(1)} dB rel`);
    // Volume 0.3 against 1, both passed (W3-10: the default is 1, so a render
    // at the default would compare a render with itself). The volume
    // multiplies the mix's 16-bit integers after the clip and is rounded to
    // 16 bits, then the device stage rounds again: within 1.5 units of 32768
    // of 0.3 times the render at 1, sample for sample.
    check('the default volume is the game\'s, 1', ENGINE.volume === 1);
    const vol = await TF2Audio.process(mkBuffer(src, SR), { codec: 'steam', volume: 0.3 });
    let worstUnits = 0;
    for (let i = 0; i < vol.samples.length; i++) worstUnits = Math.max(worstUnits, Math.abs(vol.samples[i] - 0.3 * r.samples[i]) * 32768);
    check('output volume scales the rendered file linearly', Math.abs(rms(vol.samples) / rms(r.samples) - 0.3) < 0.001 && worstUnits <= 1.5
      && vol.samples.length === r.samples.length, `${(rms(vol.samples) / rms(r.samples)).toFixed(5)}; within ${worstUnits.toFixed(2)} of 32768`);
  }

  console.log('\n[5] Real codec modes per profile');
  {
    const src = musicLike(1, SR, 3);
    const expect = { steam: ['hybrid', 32000], steam_48: ['hybrid', 64000], celt_22: ['celt', 22050], celt_44: ['celt', 22050], speex: ['speex', 11025],
      miles: ['vr12', 2940] };
    for (const [codec, [mode, bitrate]] of Object.entries(expect)) {
      const r = await TF2Audio.process(mkBuffer(src, SR), { codec });
      const m = r.codecInfo.modes;
      const total = Object.values(m).reduce((sum, n) => sum + n, 0);
      // The engine codecs run their own libraries in fixed-size packets: CELT
      // 0.11, and Speex 1.0.2 and VR12 (vaudio_miles, not a TF2 codec), whose
      // frames have a mode of their own. The Steam profiles run the libopus
      // release Steam's packets match.
      const engine = codec.startsWith('celt') ? 'celt' : codec === 'speex' ? 'speex' : codec === 'miles' ? 'vr12' : 'libopus';
      const name = { celt: 'CELT 0.11', speex: 'Speex 1.0.2', vr12: 'Voxware VR12', libopus: `libopus runs in ${mode} mode` }[engine];
      check(`${codec}: ${name} at ${bitrate / 1000} kbps`,
        r.codecInfo.backend === engine && r.codecInfo.bitrate === bitrate && m[mode] / total > 0.8, JSON.stringify(m));
      const release = { celt: 'CELT 0.11 (celt-0.11.0, pitch filter in)', speex: 'Speex 1.0.2', vr12: 'Voxware VR12 (voxware-vr12 eedf465)',
        libopus: 'libopus 1.1.5' }[engine];
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

  console.log('\n[6] Clean path and codec bypass');
  {
    const src = tone(1000, 2, SR, 0.25);
    const { samples, sampleRate, codecInfo } = await TF2Audio.process(mkBuffer(src, SR), clean);
    const ratio = rms(samples) / rms(src);
    check('no NaN/Inf', !hasBadValues(samples));
    // The output is at the listener's device's rate (W3-10): 48000 Hz by
    // default, whatever the source's rate; deviceRate takes an integer from
    // 44100 to 192000, and anything else is the default.
    check('the render is at the device\'s rate, 48000 Hz by default', sampleRate === 48000 && ENGINE.deviceRate === 48000, String(sampleRate));
    check('bypass with unity gain is level-transparent', Math.abs(db(ratio)) < 0.2, `${db(ratio).toFixed(2)} dB`);
    check('bypass is reported honestly', codecInfo.backend === 'bypass');
    const lowSrc = tone(1000, 0.5, 16000, 0.2), rates = [];
    for (const deviceRate of [undefined, 44100, 96000, 192000, '44100', 44100.5, 32000, 192001, null]) {
      const low = await TF2Audio.process(mkBuffer(lowSrc, 16000), { ...clean, deviceRate });
      rates.push(`${deviceRate}: ${low.sampleRate}/${low.samples.length}`);
    }
    const lengthAt = (rate) => Math.round(lowSrc.length * rate / 16000);
    check('a 16 kHz source renders at the device\'s rate: 48000 by default, 44100, 96000 and 192000 as given, the default for a string, a fraction or a rate outside 44100 to 192000',
      rates.join() === [`undefined: 48000/${lengthAt(48000)}`, `44100: 44100/${lengthAt(44100)}`, `96000: 96000/${lengthAt(96000)}`, `192000: 192000/${lengthAt(192000)}`,
        `44100: 48000/${lengthAt(48000)}`, `44100.5: 48000/${lengthAt(48000)}`, `32000: 48000/${lengthAt(48000)}`, `192001: 48000/${lengthAt(48000)}`, `null: 48000/${lengthAt(48000)}`].join(), rates.join(', '));
  }

  console.log('\n[7] Room presets and the automatic room (the engine\'s arithmetic, W3-17c)');
  {
    // Every preset 2 to 29 of the table, every named case of the automatic
    // room and every place of ROOM_PLACES renders; its tail ends under the
    // cap (Decision 8: 882,000 mixer samples), the output is the source's
    // length plus the tail at the device's rate, and no sample is past the
    // clip. (No level check: tests/room-dsp.verify.mjs pins the module's
    // outputs, and tests/render-stream.verify.mjs the render's.)
    const src = tone(440, 1.5, SR, 0.5);
    const inLen = Math.round(1.5 * SR);
    const settings = [];
    for (let id = 2; id <= 29; id++) settings.push([`preset ${id}`, { room: { preset: id } }]);
    for (const row of [...TF2Room.ROOM_CASES, ...TF2Room.ROOM_PLACES]) settings.push([`automatic: ${row.key}`, { room: { auto: row.key } }]);
    const bad = [];
    let longest = 0;
    for (const [name, opts] of settings) {
      const { samples, codecInfo } = await TF2Audio.process(mkBuffer(src, SR), { ...clean, ...opts });
      const tail = codecInfo.room && codecInfo.room.tail;
      const whole = samples.every(v => Number.isInteger(v * 32768) && Math.abs(v * 32768) <= 32767);
      if (!(Number.isInteger(tail) && tail > 0 && tail < TF2Room.TAIL_CAP && samples.length === inLen + Math.round(tail * SR / 44100) && whole)) {
        bad.push(`${name}: tail ${tail}, ${samples.length} samples${whole ? '' : ', a sample past the clip or not whole'}`);
      }
      longest = Math.max(longest, tail || 0);
    }
    check(`${settings.length} rooms (presets 2 to 29, ${TF2Room.ROOM_CASES.length} named cases, ${TF2Room.ROOM_PLACES.length} places) render, each tail under the cap, no sample past the clip`,
      bad.length === 0 && settings.length === 28 + TF2Room.ROOM_CASES.length + TF2Room.ROOM_PLACES.length, bad.join('; ') || `the longest tail ${longest} mixer samples`);
    for (const id of [0, 1]) {
      const r = await TF2Audio.process(mkBuffer(src, SR), { ...clean, room: { preset: id } });
      check(`dsp ${id}: no room, the source's length exactly, no codecInfo.room`, r.samples.length === inLen && !('room' in r.codecInfo));
    }
  }

  console.log('\n[8] The custom room (dsp_room 99) and under water');
  {
    const src = tone(440, 1.5, SR, 0.25);
    const opts = { ...clean, listenerPos: null, dspRoom: 99 };
    const wet = await TF2Audio.process(mkBuffer(src, SR), { ...opts, customEnv: { duration: 1.2, decay: 2.0, mix: 0.6 } });
    const dry = await TF2Audio.process(mkBuffer(src, SR), { ...opts, customEnv: { duration: 1.2, decay: 2.0, mix: 0.0 } });
    check('custom mix adds a tail', wet.samples.length > dry.samples.length && wet.codecInfo.room.tail > 0, `${wet.samples.length} vs ${dry.samples.length}`);
    check('custom mix changes output', diffRms(wet.samples, dry.samples) > 0.02 * rms(dry.samples));
    check('custom shares: trunc(mix x 256) to the room, trunc(256 - mix x 256) direct (0.6: 153 and 102)',
      wet.codecInfo.room.shares.room === 153 && wet.codecInfo.room.shares.direct === 102, JSON.stringify(wet.codecInfo.room.shares));
    check('custom mix 0 is no room', dry.samples.length === Math.round(1.5 * SR) && !('room' in dry.codecInfo));
    // The custom room's knobs at their limits, and fully wet: finite, whole
    // and within the clip.
    for (const custom of [{ duration: 0.05, decay: 0.5, mix: 1 }, { duration: 6, decay: 8, mix: 1 }]) {
      const r = await TF2Audio.process(mkBuffer(whiteNoise(0.5, SR, 0.2, 3), SR), { ...clean, room: { custom } });
      check(`custom room ${JSON.stringify(custom)} renders, finite and within the clip`, !hasBadValues(r.samples)
        && r.samples.every(v => Math.abs(v * 32768) <= 32767) && r.codecInfo.room.shares.room === 256, `tail ${r.codecInfo.room.tail}`);
    }
    // Under water: the whole sum through the water preset, no room of its
    // own; quieter (its amplifier settles at 1640/4096 and the reverb after
    // it builds the low end back up) and with a tail.
    const under = await TF2Audio.process(mkBuffer(src, SR), { ...clean, underwater: true });
    const level = rms(under.samples, Math.round(0.5 * SR), Math.round(1.4 * SR)) / rms(src, Math.round(0.5 * SR), Math.round(1.4 * SR));
    check('under water: a tail, codecInfo.room at 0/256 under water, and the voice lower than dry', under.codecInfo.room.underwater === true
      && under.codecInfo.room.shares.room === 0 && under.codecInfo.room.tail > 0 && level < 0.9 && level > 0.1, `${db(level).toFixed(2)} dB`);
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
    // BC-1: on `steam` a packet is the sender's message, so with no jitter
    // net_split no longer changes what is lost; on the other profiles it
    // still groups the frames the burst draw loses.
    const f80 = await TF2Audio.process(mkBuffer(src, SR), { ...opts, frameMs: 80 });
    const celt = { ...opts, codec: 'celt_22', gate: true };
    const c20 = await TF2Audio.process(mkBuffer(src, SR), celt), c80 = await TF2Audio.process(mkBuffer(src, SR), { ...celt, frameMs: 80 });
    check('net_split on steam with no jitter: 20 and 80 ms give the same samples at 25% loss; on celt_22 they still differ',
      lossy.samples.length === f80.samples.length && lossy.samples.every((v, i) => v === f80.samples[i]) && lossy.codecInfo.network?.lostMessages > 0
      && diffRms(c20.samples, c80.samples) > 1e-6, `${lossy.codecInfo.network?.lostMessages} of ${lossy.codecInfo.network?.messages} messages lost`);
    check('net_split is reported in whole frames', f80.codecInfo.framesPerPacket === 4);
    const dead = await TF2Audio.process(mkBuffer(src, SR), { ...opts, lossPct: 100 });
    check('100% loss -> silence', rms(dead.samples) < 1e-6, `rms ${rms(dead.samples).toExponential(2)}`);

    // BC-4: the late-frame fit stays on the other codecs (celt_22 here); on Steam voice
    // jitter is when messages reach the game's voice queue, so on the file's own timing a
    // render at any jitter is the render at jitter 0.
    const cnone = await TF2Audio.process(mkBuffer(src, SR), { ...celt, lossPct: 0 });
    const jproc = await TF2Audio.process(mkBuffer(src, SR), { ...celt, lossPct: 0, jitterMs: 100 });
    check('jitterMs wired into process() on celt_22: late frames concealed or silent', diffRms(jproc.samples, cnone.samples) > 1e-4
      && jproc.codecInfo.lostFrames + jproc.codecInfo.underrunFrames > 0, `${jproc.codecInfo.lostFrames} concealed, ${jproc.codecInfo.underrunFrames} silent`);
    const sameAt = [];
    for (const jitterMs of [10, 100, 500]) {
      const r = await TF2Audio.process(mkBuffer(src, SR), { ...opts, lossPct: 0, jitterMs });
      sameAt.push(r.samples.length === none.samples.length && r.samples.every((v, i) => Object.is(v, none.samples[i])) && r.codecInfo.underrunFrames === 0);
    }
    check('Steam voice on the file\'s own timing: a render at jitter 10, 100 and 500 ms is the render at jitter 0, sample for sample, with no late frame',
      sameAt.every(Boolean), sameAt.join(', '));
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
    const tinyMiles = await TF2Audio.process(mkBuffer(tiny, 22050), { codec: 'miles' });
    check('very short buffers render safely with miles too', tinyMiles.samples.length === tinyResult.samples.length && !hasBadValues(tinyMiles.samples));

    // An empty source through a room is the room's silent tail, whatever the
    // profile. resampleLinear (the legacy profiles' mixer until W3-10, a plain
    // utility since) gives nothing for nothing: it once gave one NaN sample,
    // which the room carried past the output's cut.
    check('resampleLinear: an empty input gives an empty output', TF2Audio.resampleLinear(new Float32Array(0), 22050, 44100).length === 0);
    const emptyRooms = [];
    for (const codec of ['steam', 'steam_48', 'celt_22', 'celt_44', 'speex', 'miles']) {
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
    // (the capture EQ's half length, Opus lookahead; until W3-10 also the
    // output FIR's 1 sample at 44.1 kHz) is allowed for. `steam_48` runs the 20 ms frame gate, the
    // float decode and the app's resampler in both, so it holds the frame
    // path's live chain to the render here; the `steam` live chain is proved
    // in liveSteamSection, sample for sample.
    const src = speechLike(3, SR, -20);
    const opts = { codec: 'steam_48', volume: 1 };
    const chain = await TF2Audio.createLiveChain(opts, SR);
    const parts = [];
    for (let o = 0; o < src.length; o += SR / 50) parts.push(await chain.process(src.subarray(o, o + SR / 50)));
    const live = new Float32Array(parts.reduce((t, p) => t + p.length, 0));
    parts.reduce((o, p) => { live.set(p, o); return o + p.length; }, 0);
    chain.free();
    const whole = await TF2Audio.process(mkBuffer(src, SR), opts), offline = whole.samples;
    const live48 = engine.CODEC_PROFILES.steam_48, eqHalf = live48.captureEq ? (live48.captureEq.taps - 1) / 2 : 0;
    const delay = (eqHalf + whole.codecInfo.lookahead) / live48.codecRate, shift = Math.round(delay * SR);
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
