/* TF2 Voice Emulator — local DSP and codec orchestration.
 *
 * Sender:   mono capture (left channel by default) -> capture gain / int16
 *           clip -> resample to the codec rate -> optional capture filters
 *           -> Steam capture roll-off -> Steam voice gate (pre-roll, hold, one
 *           encoder per talk spurt) -> libopus 1.1.5 encode, as in Steam
 * Network:  20 ms packets grouped by net_split; measured burst loss and
 *           late (jittered) frames, seeded
 * Receiver: libopus 1.1.5 decode + native concealment and comfort noise ->
 *           engine voice rate -> Source-style auto-gain with int16 clamp ->
 *           the 44.1 kHz mixer as integers (the voice entered at 255/256,
 *           upsampled by two for the engine codecs; with a room entered
 *           twice, its room share through the room's slot, and under water
 *           the sum through the water preset) -> clip, volume and 16-bit
 *           rounding -> the listener's device rate by linear interpolation
 *           (48 kHz by default)
 *
 * The Steam profile, voice gate and receiver path are identified from 2026
 * voice_loopback recordings of music, speech and a calibrated test signal,
 * and from Steam's own voice packets in a SourceTV demo
 * (tests/REFERENCE_2026.md). The room is the engine's arithmetic as read
 * (room-dsp.js and its table room-presets.js, order W3-17), loaded before
 * this file as the globals TF2Room and TF2_ROOM_PRESETS; a render with no
 * room and not under water does not need them.
 * Same decoded PCM + settings + pinned runtime gives repeatable output.
 *
 * TF2Audio.process(buffer, opts) -> { samples, sampleRate, blob, codecInfo }
 * TF2Audio.createRender(source, opts) -> the same render, a chunk at a time
 * TF2Audio.createGain({ avgGain, maxGain, scale }) -> one channel's auto-gain
 * TF2Audio.encodeWav(samples, rate) -> 16-bit mono WAV
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Math helpers                                                       */
  /* ------------------------------------------------------------------ */

  const TAU = Math.PI * 2;
  const INT16_FULL_SCALE = 32767 / 32768;
  const DEFAULT_SENDER_GATE = { thresholdDb: -39.5, prerollMs: 120, holdMs: 440 };
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const finiteOr = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };
  const gcd = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Cooperative yield — keeps the UI responsive during long renders
  // (no-op in bare JS contexts like the Node test sandbox).
  const microYield = (typeof setTimeout === 'function')
    ? () => new Promise(r => setTimeout(r, 0))
    : () => Promise.resolve();

  /* ------------------------------------------------------------------ */
  /* FFT — iterative radix-2, in-place, complex                          */
  /* ------------------------------------------------------------------ */

  function fftInPlace(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const tr = re[i]; re[i] = re[j]; re[j] = tr;
        const ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inverse ? TAU : -TAU) / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const vr = re[b] * cr - im[b] * ci;
          const vi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr;        im[a] += vi;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
    if (inverse) {
      const inv = 1 / n;
      for (let i = 0; i < n; i++) { re[i] *= inv; im[i] *= inv; }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Channel downmix                                                    */
  /* ------------------------------------------------------------------ */

  // Mono capture of a (possibly stereo) buffer: 'mix' averages every channel;
  // 'left' / 'right' take one channel, as a mono capture of a stereo virtual
  // cable does (the 2026 music loopback matched the left channel).
  function bufferToMono(buffer, channel = 'mix') {
    const ch = buffer.numberOfChannels;
    if (ch === 1) return buffer.getChannelData(0).slice(0);
    if (channel === 'left') return buffer.getChannelData(0).slice(0);
    if (channel === 'right') return buffer.getChannelData(1).slice(0);
    const out = new Float32Array(buffer.length);
    if (ch === 2) {
      const a = buffer.getChannelData(0), b = buffer.getChannelData(1);
      for (let i = 0; i < out.length; i++) out[i] = (a[i] + b[i]) * 0.5;
      return out;
    }
    for (let c = 0; c < ch; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) out[i] += d[i];
    }
    const inv = 1 / ch;
    for (let i = 0; i < out.length; i++) out[i] *= inv;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Resampling — exact rational polyphase, Kaiser-windowed sinc         */
  /*                                                                    */
  /* Equivalent to upsampling by `up`, filtering at the lower Nyquist and */
  /* decimating by `down`, but only the needed taps are evaluated. The    */
  /* filter is -6 dB at the lower Nyquist, flat to ~0.9 of it and at      */
  /* least 75 dB down 1.17x beyond it. Output is time-aligned to input.   */
  /* ------------------------------------------------------------------ */

  function besselI0(x) {
    let sum = 1, term = 1;
    const q = x * x / 4;
    for (let k = 1; k < 64; k++) {
      term *= q / (k * k);
      sum += term;
      if (term < sum * 1e-16) break;
    }
    return sum;
  }

  const KAISER_BETA = 8.6;
  const ZEROS_PER_SIDE = 16;
  const kernelCache = new Map();
  function resampleKernel(up, down) {
    const key = `${up}/${down}`;
    if (kernelCache.has(key)) return kernelCache.get(key);
    const m = Math.max(up, down);
    const half = ZEROS_PER_SIDE * m;
    const h = new Float64Array(2 * half + 1);
    const i0Beta = besselI0(KAISER_BETA);
    let sum = 0;
    for (let k = 0; k <= 2 * half; k++) {
      const t = (k - half) / m;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const r = (k - half) / half;
      const w = besselI0(KAISER_BETA * Math.sqrt(Math.max(0, 1 - r * r))) / i0Beta;
      h[k] = sinc * w;
      sum += h[k];
    }
    const scale = up / sum;
    for (let k = 0; k < h.length; k++) h[k] *= scale;
    const kernel = { h, half };
    if (kernelCache.size > 16) kernelCache.clear();
    kernelCache.set(key, kernel);
    return kernel;
  }

  function resampleSinc(input, inRate, outRate) {
    inRate = Math.round(inRate); outRate = Math.round(outRate);
    if (!input.length || inRate === outRate) return Float32Array.from(input);
    const g = gcd(inRate, outRate);
    const up = outRate / g, down = inRate / g;
    const { h, half } = resampleKernel(up, down);
    const n = input.length;
    const outLen = Math.max(1, Math.round(n * up / down));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const t = i * down;                          // position at the up-rate
      let j = Math.ceil((t - half) / up);
      if (j < 0) j = 0;
      let jEnd = Math.floor((t + half) / up);
      if (jEnd > n - 1) jEnd = n - 1;
      let k = half + t - j * up;
      let acc = 0;
      for (; j <= jEnd; j++, k -= up) acc += input[j] * h[k];
      out[i] = acc;
    }
    return out;
  }

  // Linear interpolation from inRate to outRate, a plain utility. (The
  // legacy profiles' voices reached the mixer this way until W3-10; the
  // mixer's own rule is mixUpsample2.) Nothing in gives nothing out, as
  // resampleSinc.
  function resampleLinear(input, inRate, outRate) {
    if (!input.length || inRate === outRate) return Float32Array.from(input);
    const ratio = inRate / outRate;
    const outLen = Math.max(1, Math.round(input.length / ratio));
    const out = new Float32Array(outLen);
    const last = input.length - 1;
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const i0 = Math.min(last, pos | 0);
      const i1 = Math.min(last, i0 + 1);
      const frac = pos - (pos | 0);
      out[i] = input[i0] * (1 - frac) + input[i1] * frac;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* FIR design / filtering                                             */
  /* ------------------------------------------------------------------ */

  // Frequency-sampling design with a Hamming window, matching
  // scipy.signal.firwin2 (linear gains interpolated between points).
  function firwin2(numtaps, freqs, gainsDb, rate) {
    const nyq = rate / 2;
    const nfreqs = 1 + (1 << Math.ceil(Math.log2(numtaps)));
    const size = 2 * (nfreqs - 1);
    const re = new Float64Array(size), im = new Float64Array(size);
    const gains = gainsDb.map(db => Math.pow(10, db / 20));
    for (let k = 0; k < nfreqs; k++) {
      const f = nyq * k / (nfreqs - 1);
      let seg = 0;
      while (seg < freqs.length - 2 && f > freqs[seg + 1]) seg++;
      const span = freqs[seg + 1] - freqs[seg];
      const mix = span > 0 ? clamp((f - freqs[seg]) / span, 0, 1) : 0;
      const gain = gains[seg] + (gains[seg + 1] - gains[seg]) * mix;
      const phase = -(numtaps - 1) / 2 * Math.PI * k / (nfreqs - 1);
      re[k] = gain * Math.cos(phase);
      im[k] = gain * Math.sin(phase);
      if (k > 0 && k < nfreqs - 1) { re[size - k] = re[k]; im[size - k] = -im[k]; }
    }
    im[nfreqs - 1] = 0;
    fftInPlace(re, im, true);
    const taps = new Float64Array(numtaps);
    for (let n = 0; n < numtaps; n++) {
      taps[n] = re[n] * (0.54 - 0.46 * Math.cos(TAU * n / (numtaps - 1)));
    }
    return taps;
  }

  // Linear-phase FIR with its group delay removed: output aligns to input.
  function applyFirZeroPhase(x, taps) {
    const n = x.length, m = taps.length, center = (m - 1) >> 1;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let acc = 0;
      const k0 = Math.max(0, i + center - (n - 1));
      const k1 = Math.min(m - 1, i + center);
      for (let k = k0; k <= k1; k++) acc += taps[k] * x[i + center - k];
      out[i] = acc;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Biquads (RBJ)                                                       */
  /* ------------------------------------------------------------------ */

  function biquadCoefs(type, rate, f0, Q) {
    const w0 = TAU * clamp(f0, 1, rate * 0.49) / rate;
    const cosw = Math.cos(w0), sinw = Math.sin(w0);
    const alpha = sinw / (2 * Math.max(0.05, Q));
    let b0, b1, b2;
    if (type === 'lowpass') { b0 = (1 - cosw) / 2; b1 = 1 - cosw;    b2 = b0; }
    else /* highpass */     { b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = b0; }
    const a0 = 1 + alpha;
    return {
      b0: b0 / a0, b1: b1 / a0, b2: b2 / a0,
      a1: (-2 * cosw) / a0, a2: (1 - alpha) / a0
    };
  }

  function applyBiquad(x, c) {
    const out = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const xi = x[i];
      const y = c.b0 * xi + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      out[i] = y;
      x2 = x1; x1 = xi; y2 = y1; y1 = y;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Nonlinearities                                                      */
  /* ------------------------------------------------------------------ */

  // int16 conversion: anything past full scale is flattened.
  function hardClip(samples, t) {
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) out[i] = clamp(samples[i], -t, t);
    return out;
  }

  // Rounded to the nearest integer, ties to even.
  function roundEven(v) {
    let r = Math.round(v);
    if (r - v === 0.5 && (r & 1)) r -= 1;
    return r;
  }

  /* ------------------------------------------------------------------ */
  /* The mixer and the output stage (W3-10)                             */
  /*                                                                    */
  /* As the engine does it, on whole numbers (docs/reports/W3-07-mixer- */
  /* output.md, sections 1 and 2; docs/reports/W3-10-upsampler-read.md): */
  /*   - the voice is entered into the mix at its own rate, at the      */
  /*     channel's volume of 255: trunc(fround(s x 255) / 256) (mixEntry); */
  /*   - a 22050 Hz voice is upsampled by two once, an 11025 Hz voice   */
  /*     twice, each stage keeping its last input (mixUpsample2);       */
  /*   - the sum is clipped to +-32767, multiplied by `volume` in single */
  /*     precision and rounded to 16 bits, ties to even (mixOut).       */
  /* Then, outside the engine, the system's mixer converts the 16-bit   */
  /* 44100 Hz stream to the device's rate by linear interpolation       */
  /* (createDeviceStage): a model, fixed by the recordings, not read.   */
  /* There is no filter and no limiter anywhere in this.                */
  /* ------------------------------------------------------------------ */

  // The mixer's rate: a constant of the engine's code (VOICE_ENGINE.mixRate).
  const MIX_RATE = 44100;
  // The mixer's blocks: block b is mix samples MIX_BLOCK_ORIGIN + 512 b to
  // MIX_BLOCK_ORIGIN + 512 b + 511, counted from the first sample of a render
  // (or of a live chain at its mix point). Nothing in this order's arithmetic
  // depends on them (the entry and mixOut have no memory, the upsampler
  // carries its state); they are reported to opts.onMixBlock for the room's
  // slot (W3-17c). Under the game's timeline W3-02c will set the origin to
  // its channel clock's blocks. An origin that is not a multiple of 4 mix
  // samples would cut an 11025 Hz voice sample in two: a later order may set
  // it only for a 44100 Hz voice, or to a multiple of 4.
  const MIX_BLOCK = 512, MIX_BLOCK_ORIGIN = 0;
  // The voice channel's volume in the mix: 255, of a full scale of 256
  // (headphones, the default snd_surround_speakers -1; W3-07, section 1).
  const MIX_VOICE_VOLUME = 255;
  const NO_INTS = new Int32Array(0);

  // A voice-rate sample as the whole 16-bit value the mix is given. The
  // gain's output is one already (y / 32768); a value that is not (the
  // auto-gain off: the voice times voice_scale, clipped at +-32767) is
  // rounded to the nearest, ties to even, and clamped to -32768..32767.
  function mixSample(v) {
    const r = roundEven(v * 32768);
    return r > 32767 ? 32767 : r < -32768 ? -32768 : r;
  }

  // TF2Audio.mixEntry(s, volume): a whole 16-bit sample s entered into the
  // mix at the channel's volume, a single from 0 to 255 (narrowed here, so no
  // caller can hand it a double that is not one): the product rounded to
  // single precision once, divided by 256 (exact), truncated toward zero.
  // The engine's 16-bit mono mix (W3-07 section 1; the read, section 4).
  // At 255 the rounding changes nothing; W3-17c calls this twice a sample,
  // at 255 x 229 / 256 and 255 x 26 / 256, where it does.
  function mixEntry(s, volume) {
    const f = Math.fround;
    return Math.trunc(f(s * f(volume)) / 256);
  }

  // TF2Audio.mixUpsample2(x, state): one upsampling by two of a mixer
  // buffer, the engine's linear rule (the read, section 1): output 2k + 1 is
  // input k, output 2k the mean of inputs k - 1 and k, rounded down (an
  // arithmetic shift). state = { prev }, one per buffer and per stage, 0 at
  // first: the last input, kept across calls, so the result does not depend
  // on where the calls fall. x: integers (an Int32Array).
  function mixUpsample2(x, state) {
    const y = new Int32Array(2 * x.length);
    let prev = state.prev;
    for (let k = 0; k < x.length; k++) {
      y[2 * k] = (prev + x[k]) >> 1;
      y[2 * k + 1] = x[k];
      prev = x[k];
    }
    state.prev = prev;
    return y;
  }

  // TF2Audio.mixClip(v): the clip on the mix's sum, -32767..32767.
  function mixClip(v) {
    return v > 32767 ? 32767 : v < -32767 ? -32767 : v;
  }

  // TF2Audio.mixOut(sum, volume): the stage after the sum, on a whole sample
  // of the 44100 Hz mix: the clip; the clipped integer as a single times
  // `volume` as a single, the product rounded to single (the engine
  // converts the block to floats and multiplies by volume x (1 - soundfade);
  // soundfade is 0 in play and not modelled); then rounded to the nearest
  // integer, ties to even (the device call rounds to nearest). The ceiling
  // is round(32767 x volume): 4915 at 0.15.
  function mixOut(sum, volume) {
    const f = Math.fround;
    return roundEven(f(f(mixClip(sum)) * f(volume)));
  }

  // TF2Audio.mixDevicePosition(n, R): where output n of the device stage at
  // R Hz reads the 44100 Hz mix, in whole numbers: with g = gcd(44100, R),
  // N = 44100 / g and D = R / g, n N = D k + r with 0 <= r < D. Exact for
  // any n up to 2^40 and more (n is split by D first, so no product passes
  // 2^53).
  function mixDevicePosition(n, R) {
    const g = gcd(MIX_RATE, R), N = MIX_RATE / g, D = R / g;
    let q = Math.floor(n / D), m = n - q * D;
    if (m < 0) { q--; m += D; } else if (m >= D) { q++; m -= D; }
    const t = m * N, j = Math.floor(t / D);
    return { k: q * N + j, r: t - j * D };
  }

  // TF2Audio.createDeviceStage(R): the 16-bit 44100 Hz mix converted to the
  // listener's sound device at R Hz, an integer from 44100 up. A model of the
  // system's mixer (XAudio2, between the game and the device; W3-07, section
  // 2): linear interpolation with its phase starting at 0, which the
  // recordings fix (images 65 dB under a 1 kHz tone at 2900 and 4900 Hz, and
  // flat tops that stay exactly on the ceiling); its precision and rounding
  // were not read and are this model's, and only 48000 Hz was measured.
  // Output n, with k and r from mixDevicePosition(n, R), is
  //   roundEven((x[k] (D - r) + x[k + 1] r) / D)
  // exactly: the numerator is a whole number, a tie is a remainder of D / 2,
  // and it goes to the even neighbour. An input past the mix's end is 0.
  // Stateful: it keeps the inputs from the next output's k on, waits for
  // x[k + 1], and gives the same samples at any chunking. push(x) takes
  // integers and gives integers; flush() ends the mix (the outputs that read
  // its last input). At 44100 Hz there is no stage: the mix passes as it is.
  function createDeviceStage(R) {
    if (R === MIX_RATE) return { push: (x) => x, flush: () => NO_INTS };
    if (!Number.isInteger(R) || R < MIX_RATE) throw new RangeError(`TF2Audio: the device stage takes a rate from 44100 Hz up, not ${R}.`);
    const D = R / gcd(MIX_RATE, R);
    let buf = NO_INTS, base = 0, total = 0, n = 0;
    const input = (i) => (i < total ? buf[i - base] : 0);
    // The outputs whose k is at most `last`.
    function run(last) {
      const out = [];
      for (;; n++) {
        const { k, r } = mixDevicePosition(n, R);
        if (k > last) break;
        const num = input(k) * (D - r) + input(k + 1) * r;
        let q = Math.floor(num / D), rem = num - q * D;
        if (rem < 0) { q--; rem += D; } else if (rem >= D) { q++; rem -= D; }
        if (2 * rem > D || (2 * rem === D && (q & 1))) q++;
        out.push(q);
      }
      const keep = Math.min(total, mixDevicePosition(n, R).k);
      if (keep > base) { buf = buf.slice(keep - base); base = keep; }
      return Int32Array.from(out);
    }
    return {
      push(x) {
        const merged = new Int32Array(buf.length + x.length);
        merged.set(buf); merged.set(x, buf.length);
        buf = merged; total += x.length;
        return run(total - 2);
      },
      flush: () => run(total - 1)
    };
  }

  // The voice's entry and the upsampling, for a voice at voiceRate (11025,
  // 22050 or 44100 Hz: the voice's own rate, never a codec's mode rate): each
  // voice-rate sample as mixSample makes it, entered by mixEntry at the
  // voice's volume, then upsampled once for 22050 Hz and twice for 11025 Hz,
  // each stage with its own state from 0 (the mixer's facing buffer: nothing
  // resets it, not a new spurt and not a block). Gives the mix's integers at
  // 44100 Hz. flush() ends the voice: a voice sample of zeros through the
  // stages gives the last mean, and the zeros after it are not part of the
  // mix, so a voice of N samples gives a mix of exactly 2N + 1 at 22050 Hz
  // and 4N + 3 at 11025 Hz (N at 44100 Hz, none for no voice). A voice
  // sample k sits at mix sample 2k + 1 (4k + 3): one 44100 Hz sample per
  // stage later than its own time, as in the game.
  function createMixEntry(voiceRate, volume = MIX_VOICE_VOLUME) {
    const stages = { 44100: 0, 22050: 1, 11025: 2 }[voiceRate];
    if (stages === undefined) throw new RangeError(`TF2Audio: the mixer takes a voice at 11025, 22050 or 44100 Hz, not ${voiceRate}.`);
    const states = Array.from({ length: stages }, () => ({ prev: 0 }));
    let fed = 0;
    const up = (e) => { for (const st of states) e = mixUpsample2(e, st); return e; };
    return {
      push(x) {
        const e = new Int32Array(x.length);
        for (let i = 0; i < x.length; i++) e[i] = mixEntry(mixSample(x[i]), volume);
        fed += x.length;
        return up(e);
      },
      flush() {
        if (!stages || !fed) return NO_INTS;
        return up(new Int32Array(1)).subarray(0, (1 << stages) - 1);
      }
    };
  }

  const mixToFloat = (x) => Float32Array.from(x, (v) => v / 32768);

  // The voice's mix with a room on or under water (W3-17c; the order's part
  // c, item 4), in the engine's order (W3-07 section 1; the order's Decision
  // 3): at the voice's own rate each sample is entered twice by mixEntry,
  // at the volumes 255 x direct / 256 and 255 x room / 256, the shares the
  // room path gives for the 512-sample mixer block the sample's mix samples
  // fall in (asked at the block's start, before the path runs it); each of
  // the two buffers is upsampled by mixUpsample2 with states of its own
  // (none for a 44100 Hz voice); the path (room-dsp.js createRoomPath) adds
  // the room slot's output to the direct buffer and, under water, runs the
  // sum through the water preset. Its output is the sum before the clip,
  // which goes on to W3-10's blocks, mixOut and device stage unchanged.
  //   The path is given whole blocks, each starting on a block's first
  // sample, counted from the render's first mix sample (MIX_BLOCK_ORIGIN 0,
  // the path's own count): a block is 512 voice samples at 44100 Hz, 256 at
  // 22050 and 128 at 11025 (a voice sample's mix samples never straddle two
  // blocks). So the stream keeps the voice's partial block until it is
  // whole: up to 511 mix samples. Nothing else is held back.
  //   flush() ends the voice. The voice's last block is filled with zeros
  // and, after it, blocks of zeros run until the path's tail rule holds
  // (room-dsp.js tailLeft: Decision 8): the mix is the voice's own mix (N,
  // 2N + 1 or 4N + 3 samples, as W3-10 makes it; zeros follow it) and the
  // tail, cut at the sample where the rule held, or at the voice's own end
  // if it held before that. tail() then gives the tail's length in mix
  // samples, what the mix runs on past the voice's own end (0 to 882,000).
  // An empty voice gives the path zeros from the start: the rule holds
  // after 22,050 of them, the room's silent tail.
  function createRoomMix(voiceRate, room) {
    const stages = { 44100: 0, 22050: 1, 11025: 2 }[voiceRate];
    if (stages === undefined) throw new RangeError(`TF2Audio: the mixer takes a voice at 11025, 22050 or 44100 Hz, not ${voiceRate}.`);
    const per = MIX_BLOCK >> stages, path = room.path;
    const directStates = Array.from({ length: stages }, () => ({ prev: 0 }));
    const roomStates = Array.from({ length: stages }, () => ({ prev: 0 }));
    const up = (e, states) => { for (const st of states) e = mixUpsample2(e, st); return e; };
    const held = new Int32Array(per);
    let fill = 0, fed = 0, start = 0, ruleEnd = -1, tail = 0;
    // The held voice samples (zeros past `fill`) as one mixer block.
    function block() {
      const asked = path.shares(), sh = room.shares || asked;
      const vd = MIX_VOICE_VOLUME * sh.direct / 256, vr = MIX_VOICE_VOLUME * sh.room / 256;
      const direct = new Int32Array(per), wet = new Int32Array(per);
      for (let i = 0; i < per; i++) { direct[i] = mixEntry(held[i], vd); wet[i] = mixEntry(held[i], vr); }
      const out = path.process(up(direct, directStates), up(wet, roomStates));
      // Where the tail rule last held (the mix sample after it), or -1 while
      // a voice sample has started it over since.
      const t = path.tailLeft();
      if (!t.ended) ruleEnd = -1;
      else if (t.at >= 0) ruleEnd = start + t.at + 1;
      start += MIX_BLOCK;
      return out;
    }
    return {
      push(x) {
        const parts = [];
        for (let i = 0; i < x.length; i++) {
          held[fill++] = mixSample(x[i]);
          if (fill === per) { parts.push(block()); fill = 0; }
        }
        fed += x.length;
        return parts.length ? joinInts(parts) : NO_INTS;
      },
      flush() {
        const voiceEnd = fed ? fed * (1 << stages) + (1 << stages) - 1 : 0, from = start, parts = [];
        // The rule holds at the latest TAIL_CAP samples after the voice's
        // last sample, which lies in the first of these blocks: a loop that
        // runs past that has met a path that does not end, and stops.
        const most = Math.ceil(room.cap / MIX_BLOCK) + 2;
        let blocks = 0;
        do {
          if (++blocks > most) {
            throw new Error(`TF2Audio: the room's tail did not end within its cap of ${room.cap} mixer samples (${most} blocks after the voice).`);
          }
          held.fill(0, fill);
          fill = 0;
          parts.push(block());
        } while (ruleEnd < 0);
        const end = Math.max(voiceEnd, ruleEnd);
        tail = end - voiceEnd;
        return joinInts(parts).subarray(0, end - from);
      },
      tail: () => tail
    };
  }

  // The mixer's blocks, reported to onMixBlock(start, length, mix), a test
  // hook: once each block's last sample has passed, and at the end a short
  // last block (flush); start counts from the first mix sample (a multiple
  // of 512), mix is a copy of the block's sum before the clip. The samples
  // pass on as they come: nothing is held back for a block, and with no hook
  // nothing is kept. (Holding a partial block until it is whole is W3-17c's,
  // with a room on.)
  function createMixBlocks(onMixBlock) {
    if (typeof onMixBlock !== 'function') return { push: (x) => x, flush: () => NO_INTS };
    const block = new Int32Array(MIX_BLOCK);
    let pos = 0, fill = 0;
    const report = () => { onMixBlock(pos - fill, fill, block.slice(0, fill)); fill = 0; };
    return {
      push(x) {
        for (let i = 0; i < x.length; i++) {
          block[fill++] = x[i];
          pos++;
          if ((pos - MIX_BLOCK_ORIGIN) % MIX_BLOCK === 0) report();
        }
        return x;
      },
      flush() { if (fill) report(); return NO_INTS; }
    };
  }

  function createMixOut(volume) {
    return {
      push(x) {
        const y = new Int32Array(x.length);
        for (let i = 0; i < x.length; i++) y[i] = mixOut(x[i], volume);
        return y;
      },
      flush: () => NO_INTS
    };
  }

  function joinInts(parts) {
    if (parts.length === 1) return parts[0];
    const out = new Int32Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) { out.set(p, offset); offset += p.length; }
    return out;
  }

  // Stages in a row as one: push() runs each in turn; flush() flushes each
  // in turn and runs what it gives through the ones after it, so a stage's
  // end reaches the next before that one ends.
  function stageChain(parts) {
    const through = (k, x) => { for (; k < parts.length; k++) x = parts[k].push(x); return x; };
    return {
      push: (x) => through(0, x),
      flush() {
        const out = [];
        for (let k = 0; k < parts.length; k++) out.push(through(k + 1, parts[k].flush()));
        return joinInts(out);
      }
    };
  }

  // The mix from the gain's output: the entry and the upsampling, or with a
  // room (a resolved room, below) createRoomMix.
  const createMixStage = (voiceRate, room) => (room ? createRoomMix(voiceRate, room) : createMixEntry(voiceRate));
  // From the mix's sum to the device: the blocks, mixOut, the device stage.
  const createOutStage = (volume, deviceRate, onMixBlock) =>
    stageChain([createMixBlocks(onMixBlock), createMixOut(volume), createDeviceStage(deviceRate)]);

  // TF2Audio.createOutputStage({ voiceRate, volume, deviceRate, onMixBlock }):
  // the whole stage, from the gain's output (voice-rate floats) to the
  // device's 16-bit integers, a piece at a time: what createRender and the
  // live chain run after their mix point. push(x) gives what became final;
  // flush() ends the voice. `room` (a render's resolved room) puts the room
  // into the mix; mix.tail() then gives the tail's length in mix samples.
  function createOutputStage({ voiceRate, volume, deviceRate = MIX_RATE, onMixBlock, room = null }) {
    const mix = createMixStage(voiceRate, room);
    return Object.assign(stageChain([mix, createOutStage(volume, deviceRate, onMixBlock)]), { mix });
  }

  // The device's rate from opts.deviceRate: an integer from 44100 to 192000;
  // anything else (a string, a fraction, a rate below 44100) is
  // VOICE_ENGINE.deviceRate. Only 48000 Hz is measured; another rate runs
  // the same rule.
  function deviceRateOf(value) {
    return Number.isInteger(value) && value >= 44100 && value <= 192000 ? value : VOICE_ENGINE.deviceRate;
  }

  /* ------------------------------------------------------------------ */
  /* Receiver auto-gain (Source voice channel)                          */
  /*                                                                    */
  /* The engine's rule, read from its binary (docs/reports/W3-03-       */
  /* engine-binary.md, section 2) and verified sample for sample        */
  /* against the game's own decoded voice (Set H: 0 of 291,840 samples  */
  /* differ). Decoded voice is int16. Per sample x:                     */
  /*   sum += |x|; peak = max(peak, |x|)                                */
  /*   y = clamp((fixed + pos * step) * x >> 7, int16)  (32-bit, wraps) */
  /* and at the end of each 128-sample block, in 32-bit floats, each    */
  /* operation a separate scalar single-precision one, in this order    */
  /* (read from the binary; no fused multiply-add, no double):          */
  /*   current = next * scale; fixed = trunc(current * 128)             */
  /*   mean = floor(sum / 128)                    (integer division)    */
  /*   next = min(maxgain, 32767 / (mean + (peak - mean) * avggain))    */
  /*          * scale                 (a block of zeros: the cap)       */
  /*   step = trunc((next - current) / 127 * 128)                       */
  /* so voice_scale enters twice: a block starts at s*s*T_prev and      */
  /* ramps toward s*T. A reset (a channel assigned to a speaker) sets   */
  /* current = next = 1, fixed = 128, step = pos = sum = peak = 0, so   */
  /* the first block is at unity whatever voice_scale is.               */
  /* ------------------------------------------------------------------ */

  const GAIN_BLOCK = 128;   // the engine's block; the ramp divides by GAIN_BLOCK - 1

  // The rule's state and its sample loop, shared by receiverAutoGain,
  // streamAutoGain and createGain. options: { avgGain, maxGain, scale,
  // decoded }. decoded(m), when given, says whether sample m of the signal
  // (counted from the first sample run) was decoded; see receiverAutoGain.
  function gainRule(options = {}) {
    const f32 = Math.fround;
    const avgGain = f32(Math.max(0, finiteOr(options.avgGain, 0.5)));
    const maxGain = f32(Math.max(0, finiteOr(options.maxGain, 10)));
    const scale = f32(Math.max(0, finiteOr(options.scale, 1)));
    const decoded = typeof options.decoded === 'function' ? options.decoded : null;
    let current, next, fixed, step, pos, sum, peak;
    let index = 0;   // the next sample's place in the signal, for decoded()
    function reset() { current = next = 1; fixed = 128; step = 0; pos = 0; sum = 0; peak = 0; }
    reset();
    // x[i] for i in [0, x.length) into out[at + i].
    function run(x, out, at = 0) {
      for (let i = 0; i < x.length; i++) {
        const v = clamp(Math.round(x[i] * 32768), -32768, 32767);
        const a = v < 0 ? -v : v;
        sum += a;
        if (a > peak) peak = a;
        // As the engine computes it (read): g = fixed + pos * step and the
        // product g * x are 32-bit signed integers that keep the low 32 bits
        // (nothing widens or saturates), then an arithmetic shift by 7, then
        // the clamp. The product can wrap: at a block start g reaches
        // maxgain x scale^2 x 128, 204,800 at the app's limits (100 and 4),
        // and 204,800 x 32,768 passes 2^31. At the defaults and the page's
        // own limits (scale up to 2) it does not.
        const g = (fixed + Math.imul(pos, step)) | 0;
        const y = Math.imul(g, v) >> 7;
        out[at + i] = (y > 32767 ? 32767 : (y < -32768 ? -32768 : y)) / 32768;
        index++;
        if (++pos < GAIN_BLOCK) continue;
        if (peak === 0 && decoded && !decoded(index - GAIN_BLOCK)) {
          // Nothing arrived: the engine would not have run. The gain holds
          // where the ramp reached it. This stands in for the gaps on the
          // source's timeline, which the engine's gain never sees; its
          // blocks run over the decoded samples end to end, the app's over
          // the timeline, so it is an approximation of that timeline only.
          fixed += GAIN_BLOCK * step;
          step = 0;
        } else {
          current = f32(next * scale);
          fixed = Math.trunc(current * 128);
          const mean = Math.floor(sum / GAIN_BLOCK);
          const den = f32(mean + f32((peak - mean) * avgGain));   // the product, then the sum
          let t = f32(32767 / den);              // no test for zero: a zero blend gives +infinity
          t = t < maxGain ? t : maxGain;          // kept only if strictly less (a NaN gives the cap)
          next = f32(t * scale);
          step = Math.trunc(f32(f32(f32(next - current) / (GAIN_BLOCK - 1)) * 128));
        }
        pos = 0; sum = 0; peak = 0;
      }
      return out;
    }
    return { run, reset, state: () => ({ current, next, fixed, step, pos, sum, peak }) };
  }

  // The gain over a whole signal, from a reset (every render starts with a
  // channel being assigned). Samples are floats, run as int16
  // (round(x * 32768), clamped) and returned as y / 32768. A last, partial
  // block follows the current ramp and makes no update.
  // options.decoded(m): whether voice-rate sample m was decoded. Without it
  // every sample was, and every block is run by the rule, a block of zeros
  // included (its target is the cap). With it, an all-zero block whose
  // first sample was not decoded is skipped (the gain held, see gainRule).
  function receiverAutoGain(samples, options = {}) {
    return gainRule(options).run(samples, new Float32Array(samples.length));
  }

  // TF2Audio.createGain({ avgGain, maxGain, scale }): the gain of one voice
  // channel, fed decoded samples in pieces of any size. process(pcm)
  // returns as many samples at once (a sample's gain is known when it
  // arrives; a block's update happens when its 128th sample does, across
  // calls); reset() is a channel being assigned; state() copies the rule's
  // seven variables, for tests.
  function createGain(options = {}) {
    const rule = gainRule({ avgGain: options.avgGain, maxGain: options.maxGain, scale: options.scale });
    return {
      process: (pcm) => rule.run(pcm, new Float32Array(pcm.length)),
      reset: rule.reset,
      state: rule.state
    };
  }

  // The gain's decoded() when a gate holds frames back (Steam on the
  // source's timeline, a demo's received voice): voice-rate sample m is
  // codec sample c = floor(m * codecRate / voiceRate), in frame
  // floor((c + lookahead) / frameSamples), and was decoded when that
  // frame's code is not 0 (gated: nothing sent). The log is read when the
  // gain asks, so a stream may fill it as it goes. lookahead is what lies
  // between the gain's sample 0 and the decoder's: the codec's delay when
  // the gain runs on the signal with that delay dropped (the Opus profiles
  // of the frame path), 0 when it runs on the decoder's stream from its first
  // sample (the engine codecs since W3-19: gainLead) or on a demo's voice.
  function decodedFromFrames(frameLog, frameSamples, lookahead, codecRate, voiceRate) {
    return (m) => {
      const f = Math.floor((Math.floor(m * codecRate / voiceRate) + lookahead) / frameSamples);
      return f >= 0 && f < frameLog.length && frameLog[f] !== 0;
    };
  }

  // The engine codecs on the frame path (codec.engine: CELT, Speex, VR12)
  // with the gain on (W3-19): the game's gain works in blocks of 128 samples
  // counted from the first sample the decoder gives, so it runs on the
  // decoder's stream from that sample, the codec's delay (lookahead: 64
  // samples for celt_22, 128 for celt_44, 80 for speex, 305 for miles, whose
  // engines' gain routine is the same) included, and the delay is
  // dropped after it. The output keeps its length and alignment; only the
  // gain's block grid and its first block move. Returns how many samples the
  // gain runs on before the render's first: the lookahead, or 0 for every
  // other profile. The Opus profiles of the frame path drop the delay first,
  // as before: steam_48's 312 samples at 48 kHz are no whole number of
  // samples at its 44.1 kHz voice rate, so dropping them after the gain
  // would move the output (a decision of its own). `steam` lays decoded
  // packets and has its own path. The engine profiles' voice rate is their
  // codec's, so the resampler between decoder and gain passes the samples as
  // they are and the grid is counted on the decoder's own samples; one that
  // differed is refused here rather than given a grid nobody chose.
  function gainLead(codec, lookahead) {
    if (!codec.engine) return 0;
    if (Math.round(codec.voiceRate) !== Math.round(codec.codecRate) || codec.decoderEq) {
      throw new Error('An engine codec\'s gain runs on its decoder\'s samples: a voice rate equal to the codec\'s, no decoder EQ.');
    }
    return lookahead || 0;
  }

  /* ------------------------------------------------------------------ */
  /* Network: packet loss and jitter, measured in TF2                   */
  /*                                                                    */
  /* Loss is a two-state (Gilbert-Elliott) process over packets whose   */
  /* stationary rate is lossPct of voice frames and whose bursts last    */
  /* 2.2 frames on average, which reproduces the event rate, burst       */
  /* sizes and lost share of the 2026 net_fakeloss takes. The decoder    */
  /* conceals lost frames (mask 1). Jitter makes frames arrive too late: */
  /* 3.2% of frames at net_fakejitter 50, scaled linearly; one in ten    */
  /* plays as silence (mask 2) instead of being concealed. Packets group */
  /* net_split frames. See tests/REFERENCE_2026.md.                      */
  /* ------------------------------------------------------------------ */

  // TF2's receiver re-timing of talk spurts (tests/REFERENCE_2026.md,
  // finding 19): after a silence of up to 0.45 s, 41% of spurts play early,
  // by the silence less 0-130 ms (at most 350 ms); the spurt after keeps its
  // time. Moves the decoded audio (codec rate) and the frame log in place;
  // returns the moves as { time, shiftMs }.
  // A spurt's samples are its frames' on the frame path. On the steam path
  // (info.spans: the laid packets' sample ranges, which run up to half a slot
  // past the slots they mark) they are every laid span its slots meet, moved
  // whole, and never onto the spurt before.
  const RETIME = { maxGap: 0.45, chance: 0.41, leftMax: 0.13, maxShift: 0.35 };
  function retimeSpurts(samples, info, rate, rand) {
    const log = info.frameLog, size = info.frameSamples, lookahead = info.lookahead || 0;
    if (!log || !size) return [];
    const spurts = [];
    for (let f = 0; f < log.length; f++) {
      if (!log[f]) continue;
      const first = f;
      while (f + 1 < log.length && log[f + 1]) f++;
      spurts.push({ first, last: f });
    }
    const range = ({ first, last }) => {
      let from = first * size - lookahead, to = (last + 1) * size - lookahead;
      if (info.spans) {
        let a = Infinity, b = -Infinity;
        for (const [p, q] of info.spans) if (q > from && p < to) { a = Math.min(a, p); b = Math.max(b, q); }
        if (a < b) { from = a; to = b; }
      }
      return { from, to };
    };
    const moves = [];
    let early = false;
    for (let k = 1; k < spurts.length; k++) {
      const gap = (spurts[k].first - spurts[k - 1].last - 1) * size / rate;
      if (early || gap > RETIME.maxGap || rand() >= RETIME.chance) { early = false; continue; }
      let shift = Math.round(Math.min(RETIME.maxShift, gap - RETIME.leftMax * rand()) * rate);
      const here = range(spurts[k]);
      if (info.spans) shift = Math.min(shift, here.from - range(spurts[k - 1]).to);
      const frames = Math.round(shift / size);
      if (frames < 1) { early = false; continue; }
      const { first, last } = spurts[k];
      const start = Math.max(shift, here.from), end = Math.min(samples.length, here.to);
      if (end > start) { samples.copyWithin(start - shift, start, end); samples.fill(0, Math.max(start - shift, end - shift), end); }
      log.copyWithin(first - frames, first, last + 1); log.fill(0, last + 1 - frames, last + 1);
      if (info.frameBytes) { info.frameBytes.copyWithin(first - frames, first, last + 1); info.frameBytes.fill(0, last + 1 - frames, last + 1); }
      moves.push({ time: start / rate, shiftMs: 1000 * shift / rate });
      early = true;
    }
    return moves;
  }

  function buildLossMask(nFrames, framesPerPacket, lossPct, rand, jitterMs = 0) {
    nFrames = Math.max(0, Math.floor(finiteOr(nFrames, 0)));
    framesPerPacket = Math.max(1, Math.round(finiteOr(framesPerPacket, 1)));
    rand = typeof rand === 'function' ? rand : mulberry32(0xC0FFEE);
    const net = VOICE_ENGINE.network;
    const p = clamp(finiteOr(lossPct, 0) / 100, 0, 1);
    const late = clamp(net.lateFramesAt50ms * finiteOr(jitterMs, 0) / 50, 0, 0.5);
    if ((p <= 0 && late <= 0) || nFrames <= 0) return null;
    const mask = new Uint8Array(nFrames);
    if (p >= 1) { mask.fill(1); return mask; }
    // Mean burst in packets; at high loss, lengthen bursts rather than cap the rate.
    const meanBurst = Math.max(1, net.burstMeanFrames / framesPerPacket);
    const pBG = p > 0 ? Math.min(1 / meanBurst, 0.98 * (1 - p) / p) : 1;
    const pGB = p > 0 ? pBG * p / (1 - p) : 0;
    let bad = rand() < p;
    for (let f = 0; f < nFrames; f += framesPerPacket) {
      const end = Math.min(f + framesPerPacket, nFrames);
      if (bad) mask.fill(1, f, end);
      else if (late > 0) {
        for (let i = f; i < end; i++) {
          if (rand() < late) mask[i] = rand() < net.underrunShare ? 2 : 1;
        }
      }
      bad = bad ? (rand() >= pBG) : (rand() < pGB);
    }
    return mask;
  }

  // The same pinned codec runs in browsers, workers, and the Node tests.
  // Tests inject the module because their DSP sandbox has no import loader.
  let opusModulePromise;
  function loadOpusModule() {
    if (typeof TF2Opus !== 'undefined') return Promise.resolve(TF2Opus);
    if (!opusModulePromise) {
      opusModulePromise = import('./opus-codec.mjs').catch(error => {
        opusModulePromise = null;
        throw new Error('The bundled Opus codec could not load. Serve the complete folder over HTTP(S). ' +
          error.message);
      });
    }
    return opusModulePromise;
  }

  // Compatibility helper for external callers; no browser-dependent fallback.
  async function realOpusRoundTrip(samples, rate, bitrate, options = {}) {
    const opus = await loadOpusModule();
    return (await opus.roundTrip(samples, rate, bitrate, options)).samples;
  }

  /* ------------------------------------------------------------------ */
  /* Main processing function                                            */
  /* ------------------------------------------------------------------ */

  const firCache = new Map();
  function profileEq(codec, stage = 'decoderEq') {
    const eq = codec[stage];
    if (!eq) return null;
    const key = `${codec.codecRate}:${eq.taps}:${eq.freqs}:${eq.gainsDb}`;
    if (!firCache.has(key)) firCache.set(key, firwin2(eq.taps, eq.freqs, eq.gainsDb, codec.codecRate));
    return firCache.get(key);
  }
  // A CELT profile's mode rate, as the option celtRoundTrip and
  // createCeltStream take and the field their info gains; nothing for a
  // profile without one (vaudio_celt_high is the 44100 Hz mode fed 22050 Hz
  // sound).
  function celtModeRate(codec) {
    return codec.modeRate != null ? { modeRate: codec.modeRate } : {};
  }

  /* ------------------------------------------------------------------ */
  /* The room (W3-17c)                                                  */
  /*                                                                    */
  /* room-dsp.js (TF2Room) and its table room-presets.js                */
  /* (TF2_ROOM_PRESETS) are the engine's arithmetic as read (order      */
  /* W3-17, parts a and b). This file reads them as globals, loaded     */
  /* before it (index.html, the workers' importScripts), and only for a */
  /* render with a room or under water; without them such a render     */
  /* stops and names them. The mix stage is createRoomMix, above.       */
  /* ------------------------------------------------------------------ */

  function roomModule() {
    const R = typeof TF2Room !== 'undefined' ? TF2Room : null;
    const table = typeof TF2_ROOM_PRESETS !== 'undefined' ? TF2_ROOM_PRESETS : null;
    if (!R || typeof R.createRoomPath !== 'function' || !table) {
      throw new Error('TF2Audio: a room or under water needs room-dsp.js (TF2Room) and room-presets.js (TF2_ROOM_PRESETS), loaded before audio.js.');
    }
    return { R, table };
  }

  // The custom room's knobs when a render gives none (the page's own
  // defaults; DSP_PRESETS[99] held them until W3-17d).
  const CUSTOM_ROOM = { duration: 1.5, decay: 3, mix: 0.25 };

  // The custom room (dsp_room 99: the app's own, not the game's) on the
  // engine's processors, as a preset of the table's form, its knobs mapped
  // as the old room code mapped them: a two-stage all-pass diffusor, then a
  // reverb of five lines from 12 ms to duration x 60 ms (25 to 220 ms), the
  // first line's feedback 0.001^(0.045 / duration) (0.3 to 0.97: a decay of
  // about `duration` seconds), gain 1.2, a low-pass in the loop at 9000 /
  // decay Hz (800 to 12000; not one of the module's pinned cutoffs, so it is
  // computed). Its shares are not the header's: trunc(mix x 256) to the
  // room, trunc(256 - mix x 256) direct (resolveRoom). At a high mix its
  // 32-bit products can wrap, as the engine's own do at a fully wet share.
  function customPreset(env) {
    const values = (v) => v.concat(new Array(16 - v.length).fill(0));
    const feedback = clamp(Math.pow(0.001, 0.045 / env.duration), 0.3, 0.97);
    const cutoff = clamp(9000 / env.decay, 800, 12000);
    return { name: 'custom', h: [env.mix, env.mix, 0, 0, 0, 0],
      p: [[10, values([1, 2, 0.15])], [2, values([clamp(env.duration * 60, 25, 220), 12, 5, feedback, 1.2, cutoff, 1])]] };
  }

  // What the options ask of the room: { spec, water }. spec is null (no
  // room), { preset: n }, { auto: key or measures } or { custom: { duration,
  // decay, mix } }; water is opts.underwater. The page sends opts.room and
  // opts.underwater (W3-17d). With no opts.room the older options are read
  // and mapped, so no caller breaks: a listenerPos of LISTENER_POSITIONS
  // gives its room (a place of the page, W3-17d) or, for a position of the
  // page before W3-17d, the preset number it stood for, and `water` under
  // water with no room; else dspRoom gives that preset, 99 the custom room
  // with customEnv's knobs. When opts.room is given (null included) it is
  // the room, and under water is opts.underwater alone.
  function roomRequest(opts) {
    const pos = typeof opts.listenerPos === 'string' && Object.hasOwn(LISTENER_POSITIONS, opts.listenerPos) ? opts.listenerPos : null;
    let spec = opts.room;
    const water = !!opts.underwater || (spec === undefined && pos === 'water');
    if (spec === undefined) {
      const n = dspRoomNumber(opts.dspRoom);
      const place = pos ? LISTENER_POSITIONS[pos] : null;
      if (pos) spec = pos === 'water' ? null : place.room !== undefined ? place.room : { preset: place.dsp };
      else if (n !== null) spec = n === 99 ? { custom: opts.customEnv || {} } : { preset: n };
      else spec = null;
    }
    return { spec: spec && typeof spec === 'object' ? spec : null, water };
  }

  // dspRoom as a number: a whole number, or a string of decimal digits as a
  // number is written (no sign, space, leading zero, exponent or other
  // base); anything else is null, no room, as the old code's key lookup in
  // DSP_PRESETS made it (" 6", "0x6", "6e0" and "06" were no room there).
  function dspRoomNumber(d) {
    if (typeof d === 'number') return Number.isInteger(d) ? d : null;
    return typeof d === 'string' && /^(0|[1-9][0-9]*)$/.test(d) ? Number(d) : null;
  }

  // A render's room (W3-17c, the order's part c, items 2 and 3), or null for
  // no room and not under water: then nothing of the room runs, no path is
  // made and the module is not needed (Decision 4). No room: null,
  // { preset: 0 }, { preset: 1 } alone (the automatic room with nothing
  // built yet, which is dry), a number the table does not hold (Decision
  // 11: 30 to 101, the diffuse pairs, 134 and up), a custom room whose
  // trunc(mix x 256) is 0. A room: { preset: n } for a number the table
  // holds (2 to 29, and the automatic room's templates); { auto } built by
  // buildAutomatic from a case's key or the measures; { custom }.
  //   Otherwise { path, shares, cap, info }: the room path made for the render's
  // first sample, the room set (no fade at the start) and under water from
  // the start if asked (its water preset already settled), its random taps
  // drawn from the render's seed (Decision 7); spurtStart() called once,
  // now: a render has no voice channel yet, so the one channel starts with
  // it (W3-02c will call it at each channel it opens). shares is the custom
  // room's own shares, or null for the path's; cap the tail's cap (in mixer
  // samples, the module's TAIL_CAP); info is codecInfo.room.
  function resolveRoom(opts, seed) {
    const { preset, info, shares, water } = roomPreset(opts);
    if (preset === null && !water) return null;
    const { R, table } = roomModule();
    const path = R.createRoomPath({ seed, room: preset, water, table });
    path.spurtStart();
    const sh = shares || path.shares();
    return { path, shares, cap: R.TAIL_CAP, info: { ...info, shares: { room: sh.room, direct: sh.direct }, underwater: water } };
  }

  // TF2Audio.roomPreset(opts): what resolveRoom builds a path from, without
  // the path: { preset, info, shares, water, unheld }. preset is a table
  // number, a built preset (the automatic room's, the custom room's) or null
  // for no room; info is codecInfo.room's start; shares the custom room's
  // own, or null; water whether under water; unheld the number asked for
  // when the table does not hold it (no room in a render; the live chain
  // leaves the room as it was: Decision 11), else null. The live monitor's
  // worker sets its room path from it (W3-17d).
  function roomPreset(opts) {
    const { spec, water } = roomRequest(opts);
    let preset = null, info = null, shares = null, unheld = null;
    if (spec && spec.custom !== undefined) {
      const c = spec.custom && typeof spec.custom === 'object' ? spec.custom : {};
      const env = { duration: clamp(finiteOr(c.duration, CUSTOM_ROOM.duration), 0.05, 6),
        decay: clamp(finiteOr(c.decay, CUSTOM_ROOM.decay), 0.5, 8), mix: clamp(finiteOr(c.mix, CUSTOM_ROOM.mix), 0, 1) };
      if (Math.trunc(env.mix * 256) > 0) {
        preset = customPreset(env);
        info = { custom: env };
        shares = { room: Math.trunc(env.mix * 256), direct: Math.trunc(256 - env.mix * 256) };
      }
    } else if (spec && spec.auto !== undefined) {
      const { R, table } = roomModule();
      const b = R.buildAutomatic(spec.auto, { table });
      preset = b.preset;
      info = { auto: b.key, ...(b.key === null ? { measures: { ...b.measures } } : {}), shape: b.shape, shaft: b.shaft,
        classes: { ...b.classes }, pair: [...b.pair], copy: b.copy };
    } else if (spec && Number.isInteger(spec.preset) && spec.preset !== 0 && spec.preset !== 1) {
      const { R, table } = roomModule();
      if (R.presetOf(spec.preset, table)) {
        preset = spec.preset;
        info = { preset: spec.preset };
      } else unheld = spec.preset;
    }
    return { preset, info, shares, water, unheld };
  }

  // A tail of `mix` samples at 44100 Hz as samples at the device's rate:
  // what it adds to the output's length.
  const tailAtDevice = (mix, deviceRate) => Math.round(mix * deviceRate / MIX_RATE);

  // opus-codec.mjs FRAME: what happened to each codec frame.
  const FRAME_CODES = { gated: 0, silk: 1, hybrid: 2, celt: 3, dtx: 4, lost: 5, late: 6, speex: 7, vr12: 8 };

  // Frame statistics for voice that arrived already coded (opts.received),
  // in the shape roundTrip's info takes, for the codec lane and net_graph.
  function receivedCodecInfo(received, sampleRate) {
    const frameLog = Uint8Array.from(received.frameLog);
    const frameBytes = received.frameBytes ? Uint16Array.from(received.frameBytes) : new Uint16Array(frameLog.length);
    const count = (code) => frameLog.reduce((n, c) => n + (c === code ? 1 : 0), 0);
    const frameMs = finiteOr(received.frameMs, 20);
    return { backend: 'demo', version: received.version || 'as received', sampleRate, frameMs, framesPerPacket: 1,
      frameSamples: Math.round(sampleRate * frameMs / 1000), frames: frameLog.length,
      gatedFrames: count(FRAME_CODES.gated), dtxFrames: count(FRAME_CODES.dtx), lostFrames: count(FRAME_CODES.lost), underrunFrames: 0,
      spurts: finiteOr(received.spurts, 0), encodedBytes: frameBytes.reduce((n, b) => n + b, 0), gate: null,
      modes: { silk: count(FRAME_CODES.silk), hybrid: count(FRAME_CODES.hybrid), celt: count(FRAME_CODES.celt) },
      plc: 'opus', frameLog, frameBytes, lookahead: 0 };
  }

  /* ------------------------------------------------------------------ */
  /* The `steam` profile: Steam's own sender and decoder                */
  /*                                                                    */
  /* A profile whose senderGate.rule is 'steam' renders as Steam does   */
  /* (docs/reports/W3-09-steam-voice.md; docs/work-orders/W3-11-steam-  */
  /* gate.md, part a). The capture is rounded to 16 bits; Steam's       */
  /* sender (steam-sender.js) gates chunks of it and cuts its messages; */
  /* each message's frames are encoded and decoded with the library's   */
  /* own 16-bit decoder under Steam's decoder rules (opus-codec.mjs     */
  /* createSteamStream); each message's samples go, whole, through one  */
  /* FFmpeg libswresample for the whole render (vendor/swresample) as   */
  /* Steam's decoder calls it; the gain is fed the decoded packets in   */
  /* order; and the packets are laid on the source's timeline.          */
  /* ------------------------------------------------------------------ */

  // The codec's stream rate and the voice rate: the resampler's 147/80.
  const STEAM_RATE = 24000, STEAM_VOICE_RATE = 44100, STEAM_FRAME = 480;
  // How far before the last sample the sender was given a spurt can still
  // open: its longest chunk (the clock gains at most 3 grid steps between two
  // frames: steam-sender.js's MAX_CHUNK) and its pre-roll, from the sender's
  // own constants (4650 samples).
  const steamReach = (S) => 3 * S.grid + S.preroll;
  // The decoder conceals at most this many lost frames before a frame that
  // arrives (createSteamDecoder in opus-codec.mjs; W3-11a, point 6).
  const STEAM_CONCEAL_MAX = 10;

  // What a `steam` stage can give out (W3-11b), shared by createRender and
  // the live chain: the voice-rate samples before the returned index. pushed
  // is the samples given to the sender so far, cursor where the open spurt's
  // next packet will be laid (Infinity when no spurt is open), reach how far
  // before the last sample pushed a message can start (steamReach, or the
  // live chain's low-latency reach). R is the render's own bound: no spurt
  // not yet opened can be laid before it. createRender (bounded false) waits
  // for the cursor without limit: min(R, cursor). The live chain (bounded
  // true) waits for it at most ten frames at the voice rate
  // (STEAM_CONCEAL_MAX), so that a gap of up to ten lost frames, during which
  // nothing is decoded and the cursor stands still, is laid exactly as the
  // render lays it: min(R, max(cursor, R - 8820)).
  const STEAM_WAIT = STEAM_CONCEAL_MAX * STEAM_FRAME * STEAM_VOICE_RATE / STEAM_RATE;
  function steamGiveOut(pushed, cursor, reach, lookahead, bounded) {
    const R = Math.floor((pushed - reach - lookahead) * STEAM_VOICE_RATE / STEAM_RATE) - 1;
    return Math.min(R, Math.max(cursor, bounded ? R - STEAM_WAIT : -Infinity));
  }

  function steamModules() {
    const sender = typeof TF2SteamSender !== 'undefined' ? TF2SteamSender : null;
    const swr = typeof TF2Swresample !== 'undefined' ? TF2Swresample : null;
    if (!sender || !swr) {
      throw new Error('The steam profile needs steam-sender.js and vendor/swresample/swresample.js loaded beside audio.js.');
    }
    return { sender, swr };
  }

  // The capture's 16 bits, after the capture roll-off at 24 kHz: Steam's
  // recorder hands its gate and encoder 16-bit samples. q = round(x * 32768),
  // ties to even, clamped to -32768..32767.
  function steamCapture(x) {
    const q = new Int16Array(x.length);
    for (let i = 0; i < x.length; i++) {
      const v = x[i] * 32768;
      let r = Math.round(v);
      if (r - v === 0.5 && (r & 1)) r -= 1;
      q[i] = r > 32767 ? 32767 : r < -32768 ? -32768 : r;
    }
    return q;
  }

  // The threshold control's one reading (W3-11b), for the sender and the
  // frame gate alike: null, undefined and '' (or a string of spaces) give the
  // profile's own, `own`; a number, or a string that reads as one, is
  // clamped to -90..0 dBFS; anything else gives the profile's own.
  function gateThresholdDb(raw, own) {
    if (raw == null) return own;
    const typed = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    return Number.isFinite(typed) ? clamp(typed, -90, 0) : own;
  }

  // The sender's settings from process()'s options. opts.gateThresholdDb
  // as gateThresholdDb() reads it: the profile's own is Steam's own gate
  // exactly (no meanMin passed: 327.67, 1% of full scale); a typed number is
  // the mean of |x| in dBFS (-90 to 0), meanMin = 32767 x 10^(dB / 20); the
  // peak rule does not move. The gate off is the sender's own setting: every chunk is sent, as
  // one spurt, and everything after the sender is the same path.
  // opts.steamUptime (W3-16): undefined or null passes nothing (the sender's
  // own 777600 s); anything else is passed as the sender's uptime, unclamped,
  // so a value that is not a finite number from 0 to 4,000,000 throws the
  // sender's RangeError.
  function steamSenderOptions(opts, gateOn, seed) {
    const S = steamModules().sender.STEAM_SENDER;
    const db = gateThresholdDb(opts.gateThresholdDb, null);
    const meanMin = db === null ? S.meanMin : 32767 * 10 ** (db / 20);
    const sender = { seed };
    if (!gateOn) sender.gate = false;
    if (db !== null) sender.meanMin = meanMin;
    if (opts.steamUptime != null) sender.uptime = opts.steamUptime;
    return { sender, gate: gateOn, meanMin, thresholdDb: db === null ? -40 : db };
  }

  // The receiver on the source's timeline, fed each sender message with
  // what createSteamStream made of it (W3-11a, points 6 to 9).
  //   - One resampler for the whole render, given each message's samples
  //     whole (a silence record's as zeros): never reset, not by an Opus
  //     decoder reset either; a message with no samples makes no call.
  //   - One gain, reset once (at the render's start: no channel is assigned
  //     on this timeline), fed the resampled packets in the sender's order,
  //     each as its 16-bit values / 32768, the silence records' zeros among
  //     them: those are decoded zeros and send it to its cap, as in the game.
  //     A late frame's samples were not decoded, so they are left out of what
  //     the gain is given and laid as they are: frame j of F in a packet of n
  //     output samples is samples round(j n / F) to round((j + 1) n / F).
  //     That span is approximate, and meant to be (the resampler is 16 inputs
  //     late after its first packet and spreads a frame over 16 inputs each
  //     side). The zeros between spurts never reach the gain: its blocks of
  //     128 run over the decoded samples end to end, across packets and spurts.
  //   - Laying: a spurt's first packet at round((start - lookahead) x 147 / 80),
  //     each later one directly after the one before; a silence record is not
  //     laid; where packets overlap the later one wins; samples before 0 or
  //     past voiceLength are dropped (they have still been through the gain).
  //   - The frame log: 20 ms slots on the source's time, slot i covering the
  //     codec samples i x 480 - lookahead onwards, as the frame path's frames
  //     do; each takes the code and size of the frame whose laid samples cover
  //     its centre (a concealed frame's: lost; a late one's: late), or 0.
  // add() returns nothing; take(end) gives the samples up to end, which the
  // caller must know no later packet can reach (createRender's bound).
  //
  // A chain with no end (the live chain, W3-11b) leaves out codecLength and
  // voiceLength: the frame log grows as packets are laid, and nothing is cut
  // at an end. It passes add() a third argument, given: the samples already
  // given out (indexes 0 to given - 1), before which nothing may be laid. A
  // packet that would land there is not refused:
  //   - the packet of a spurt's opening message (the one that carries the
  //     pre-roll) is cut: its samples before given are dropped, and those at
  //     or after index 0 are counted in dropped(); the rest is laid where it
  //     belongs. Where the cut overlaps the spurt before, that spurt's tail
  //     stays (it has been given out), where a render has the new pre-roll;
  //   - a packet before index 0 while nothing at or after 0 has been given
  //     out (a spurt anchored before 0, at the chain's start) is not late:
  //     it is laid as the render lays it, what lies before 0 dropped;
  //   - any other packet is moved: laid whole from given, the cursor
  //     following it (moved() counts them; cfg.onMove(from, to) is told the
  //     cursor as it stood and given). The gain has already run on it, as in
  //     a render: a move changes only where the packet lands.
  // A slot whose centre is before given is final (final()). A render passes
  // no given and keeps the fixed log and the throw.
  function steamTimeline(cfg) {
    const { lookahead, resampler, gain } = cfg;
    const voiceLength = cfg.voiceLength ?? Infinity, growing = cfg.codecLength === undefined;
    let slots = growing ? 256 : Math.ceil((cfg.codecLength + lookahead) / STEAM_FRAME);
    let frameLog = new Uint8Array(slots), frameBytes = new Uint16Array(slots), frameMode = new Array(slots).fill(null);
    let buf = new Float32Array(cfg.capacity || 1 << 16), base = 0, high = 0;
    let spurt = null, cursor = 0, open = false, calls = 0, dropped = 0, moved = 0;
    const spans = [];   // each spurt's laid spans, [from, to) on the voice timeline
    const centre = (i) => (i * STEAM_FRAME + STEAM_FRAME / 2 - lookahead) * STEAM_VOICE_RATE / STEAM_RATE;

    function lay(y, at, floor) {
      const from = Math.max(at, 0, floor ?? 0), to = Math.min(at + y.length, voiceLength);
      if (to <= from) return;
      if (from < base) throw new Error('TF2Audio: a Steam packet landed on samples already given out.');
      if (to - base > buf.length) {
        const grown = new Float32Array(Math.max(to - base, 2 * buf.length));
        grown.set(buf.subarray(0, high - base));
        buf = grown;
      }
      buf.set(y.subarray(from - at, to - at), from - base);
      if (to > high) high = to;
    }
    // The open-ended log grows to hold every slot whose centre is before `to`.
    function room(to) {
      const need = Math.ceil((to * STEAM_RATE / STEAM_VOICE_RATE + lookahead) / STEAM_FRAME) + 1;
      if (need <= slots) return;
      const n = Math.max(need, 2 * slots);
      const log = new Uint8Array(n), bytes = new Uint16Array(n), mode = new Array(n).fill(null);
      log.set(frameLog); bytes.set(frameBytes);
      for (let i = 0; i < slots; i++) mode[i] = frameMode[i];
      frameLog = log; frameBytes = bytes; frameMode = mode; slots = n;
    }
    function mark(blocks, n, at) {
      const F = blocks.length;
      if (growing) room(at + n);
      for (let j = 0; j < F; j++) {
        const a = at + Math.round(j * n / F), b = at + Math.round((j + 1) * n / F);
        let i = Math.max(0, Math.floor((a * STEAM_RATE / STEAM_VOICE_RATE + lookahead) / STEAM_FRAME - 0.5) - 1);
        for (; i < slots; i++) {
          const c = centre(i);
          if (c >= b) break;
          if (c >= a) { frameLog[i] = blocks[j].code; frameBytes[i] = blocks[j].bytes; frameMode[i] = blocks[j].mode; }
        }
      }
    }
    return {
      add(msg, made, given) {
        let opening = false;
        if (!made.silence && msg.spurt !== spurt) {
          spurt = msg.spurt; open = true; opening = true;
          cursor = Math.round((msg.start - lookahead) * STEAM_VOICE_RATE / STEAM_RATE);
          spans.push([cursor, cursor]);
        }
        const pcm = made.pcm;
        if (pcm.length) {
          cfg.onDecoded?.(pcm, msg);
          const y16 = resampler.packet(pcm);
          calls++;
          cfg.onResampled?.(y16, msg);
          let y = Float32Array.from(y16, v => v / 32768);
          if (gain) {
            const blocks = made.blocks, F = blocks.length, n = y.length;
            const late = (j) => blocks[j].code === FRAME_CODES.late;
            if (!blocks.some((b) => b.code === FRAME_CODES.late)) y = gain.process(y);
            else {
              for (let j = 0; j < F;) {
                if (late(j)) { j++; continue; }
                let k = j;
                while (k < F && !late(k)) k++;
                const a = Math.round(j * n / F), b = Math.round(k * n / F);
                y.set(gain.process(y.subarray(a, b)), a);
                j = k;
              }
            }
          }
          if (!made.silence) {
            let at = cursor;
            if (given !== undefined && Math.max(at, 0) < given) {
              if (opening) dropped += Math.max(0, Math.min(at + y.length, given) - Math.max(at, 0));
              else {
                cfg.onMove?.(at, given);
                moved++;
                at = given;
                spans.push([at, at]);
              }
            }
            lay(y, at, given);
            mark(made.blocks, y.length, at);
            cursor = at + y.length;
            spans[spans.length - 1][1] = cursor;
          }
        }
        if (msg.end) open = false;
      },
      // Where the next packet of the spurt now open will be laid (Infinity
      // when none is open): nothing of this spurt lands before it.
      get cursor() { return open ? cursor : Infinity; },
      take(end) {
        end = Math.min(end, voiceLength);
        if (end <= base) return new Float32Array(0);
        const out = new Float32Array(end - base);
        out.set(buf.subarray(0, Math.max(0, Math.min(end, high) - base)));
        const keep = Math.max(0, high - end);
        if (keep) buf.copyWithin(0, end - base, high - base);
        buf.fill(0, keep, Math.max(keep, high - base));
        base = end;
        if (high < base) high = base;
        return out;
      },
      // The open-ended log: the slots whose centre is before `end` (final
      // once nothing can be laid before end), as { frameLog, frameBytes,
      // frameMode } from slot `from` on.
      final(from, end) {
        if (growing) room(Math.max(end, 0));
        let to = from;
        while (centre(to) < end) to++;
        return { from, to, frameLog: frameLog.subarray(from, to), frameBytes: frameBytes.subarray(from, to), frameMode: frameMode.slice(from, to) };
      },
      slots: () => ({ frames: slots, frameLog, frameBytes, frameMode }),
      // The spurts' laid spans, inside [0, voiceLength).
      spans: () => spans.map(([a, b]) => [Math.max(a, 0), Math.min(b, voiceLength)]).filter(([a, b]) => b > a),
      calls: () => calls,
      dropped: () => dropped,
      moved: () => moved
    };
  }

  // codecInfo for a `steam` render. Its counters keep their meaning on the
  // frame log's slots, by what was laid: frames is the slots; gated, lost,
  // late and DTX frames the slots with those codes; modes and encodedBytes
  // the coding mode and packet size of the frame laid at each slot that is
  // not gated (a lost or late slot's frame was coded too). So, as on the frame
  // path, the modes add up to frames - gatedFrames and frameBytes to
  // encodedBytes. Then the sender's spurts, and what the sender and the
  // resampler did.
  function steamCodecInfo(codec, voice, timeline, sender, settings, resampler, bitrate) {
    const { frames, frameLog, frameBytes, frameMode } = timeline.slots();
    const count = (code) => { let n = 0; for (let i = 0; i < frameLog.length; i++) if (frameLog[i] === code) n++; return n; };
    const modes = { silk: 0, hybrid: 0, celt: 0 };
    let encodedBytes = 0;
    for (let i = 0; i < frames; i++) if (frameLog[i] !== FRAME_CODES.gated) { modes[frameMode[i]]++; encodedBytes += frameBytes[i]; }
    const info = sender.info();
    return { backend: 'libopus', version: voice.version, runtime: codec.encoder?.runtime ?? '1.1.5', sampleRate: STEAM_RATE, bitrate,
      application: codec.application ?? 'voip', signal: codec.signal ?? 'auto', complexity: codec.encoder?.complexity ?? 10,
      vbr: !!codec.encoder?.vbr, dtx: !!codec.encoder?.dtx, frameSamples: STEAM_FRAME, frameMs: 20,
      lookahead: voice.lookahead, frames, lostFrames: count(FRAME_CODES.lost), underrunFrames: count(FRAME_CODES.late),
      gatedFrames: count(FRAME_CODES.gated), dtxFrames: count(FRAME_CODES.dtx), spurts: info.spurts.length,
      gate: settings.gate ? settings.thresholdDb : null, prerollFrames: 0, holdFrames: 0,
      encodedBytes, modes, plc: 'opus', frameLog, frameBytes,
      sender: { rule: 'steam', gate: settings.gate, meanMin: settings.meanMin, uptime: info.uptime, chunks: info.chunks, messages: info.messages, spurts: info.spurts },
      resampler: { kernel: resampler.kernel, calls: timeline.calls() } };
  }

  /**
   * Render a source AudioBuffer (or any { sampleRate, length,
   * numberOfChannels, getChannelData }) through the TF2 voice pipeline.
   *
   * opts = {
   *   codec:        key of CODEC_PROFILES                               ['steam']
   *   room:         the listener's room (W3-17c; resolveRoom): null,
   *                 { preset: n } (a preset of the table, 2 to 29),
   *                 { auto: a key of TF2Room.ROOM_CASES or ROOM_PLACES, or
   *                 measures } (the automatic room), or { custom: {
   *                 duration, decay, mix } } (the app's own room)     [none]
   *   underwater:   the listener under water: the mix's sum through the
   *                 water preset (14)                               [false]
   *   listenerPos, dspRoom, customEnv: the page's older room options, read
   *                 when `room` is not given: a key of LISTENER_POSITIONS
   *                 gives its preset (`water`: under water, no room), else
   *                 dspRoom gives that preset (99: the custom room, its
   *                 knobs customEnv)
   *   captureChannel: 'left' | 'right' | 'mix' for stereo input    ['left']
   *   micGain:      sender capture gain; > 1 clips the int16 capture   [1]
   *   hp / lp:      optional sender filters in Hz (off: hp <= 10,
   *                 lp >= 0.45 x codec rate)                           [off]
   *   bits:         bitrate scale; 16 = profile bitrate                 [16]
   *   lossPct:      % of voice frames lost, in bursts of ~2.2 frames     [0]
   *   frameMs:      net_split packet duration (whole 20 ms frames)      [20]
   *   jitterMs:     net_fakejitter in ms: late frames, measured          [0]
   *   enableWarble: false bypasses the codec (filters/engine remain)    [true]
   *   gate:         Steam sender voice gate; null = profile default     [null]
   *   gateThresholdDb: gate opening level, frame RMS in dBFS [profile/-39.5];
   *                 for `steam` (senderGate.rule 'steam') the mean of |x|
   *                 over a capture chunk in dBFS [Steam's own, -40]; null,
   *                 undefined and '' are the profile's own (gateThresholdDb())
   *   steamUptime:  `steam` only: seconds the sender's Steam had been running,
   *                 0 to 4,000,000; its float clock sets the hold's real
   *                 length (W3-16). null for the sender's own   [777600]
   *   onDecoded, onResampled, swrKernel: tests only, `steam` only: each
   *                 message's 16-bit samples as given to the resampler;
   *                 each packet() result; a resampler kernel in place of
   *                 the module's default
   *   onGain:       tests only, every profile: the voice-rate signal after
   *                 the gain (the auto-gain's, or voice_scale and the clip
   *                 with agc off), as it reaches the mixer
   *   onMixBlock:   tests only: (start, length, mix) for each 512-sample
   *                 block of the 44100 Hz mix and a short last one, mix a
   *                 copy of the block's sum before the clip (an Int32Array;
   *                 with a room, the room path's output, its tail included)
   *   agc:          receiver auto-gain (false = unity gain)             [true]
   *   retime:       TF2's early talk-spurt starts (finding 19)          [false]
   *   avgGain:      voice_avggain, mean (0) to peak (1) normalization   [0.5]
   *   maxGain:      voice_maxgain gain cap                              [10]
   *   voiceScale:   voice_scale, applied inside the auto-gain           [1]
   *   volume:       the game's `volume`, after the mixer's clip         [1]
   *   deviceRate:   snd_device_rate, the app's own (not a TF2 variable):
   *                 the listener's sound device, an integer from 44100 to
   *                 192000; anything else is the default. The output is
   *                 at this rate. Only 48000 is measured.           [48000]
   *   seed:         PRNG seed for the loss pattern / crackle        [0xC0FFEE]
   *   received:     the source is voice as the game received it, already
   *                 through a sender and the codec (a demo's packets,
   *                 demo.js): { frameLog, frameBytes, frameMs, spurts,
   *                 concealed, version }. Only the receiver runs; sender,
   *                 gate, codec and network settings are ignored.      [null]
   * }
   *
   * Resolves to { samples: Float32Array, sampleRate, blob, codecInfo }:
   * samples at sampleRate, the device's rate; each a whole 16-bit value
   * over 32768, which the WAV holds exactly; as long as the source at that
   * rate, round(length x deviceRate / sourceRate), plus a room's tail at
   * that rate, round(tail x deviceRate / 44100). With a room or under water
   * codecInfo has one key more, `room`: the preset's number, or the case's
   * key (null for measures, which are then given) with the shape, classes,
   * pair and copy of the automatic room, or the custom room's knobs; the
   * shares of 256; underwater; tail, the tail's length in mixer samples.
   */
  async function process(audioBuffer, opts = {}) {
    if (!audioBuffer || typeof audioBuffer.getChannelData !== 'function' ||
        !Number.isFinite(audioBuffer.sampleRate) || audioBuffer.sampleRate <= 0 ||
        !Number.isInteger(audioBuffer.length) || audioBuffer.length < 0 ||
        !Number.isInteger(audioBuffer.numberOfChannels) || audioBuffer.numberOfChannels < 1) {
      throw new TypeError('TF2Audio.process requires a valid AudioBuffer-like source.');
    }
    const codecKey = Object.hasOwn(CODEC_PROFILES, opts.codec) ? opts.codec : 'steam';
    const codec = CODEC_PROFILES[codecKey];
    const engine = VOICE_ENGINE;
    // The room, made for the render's first sample (null: none, nothing of
    // it runs).
    const room = resolveRoom(opts, finiteOr(opts.seed, 0xC0FFEE) >>> 0);

    const codecRate    = codec.codecRate;
    const micGain      = clamp(finiteOr(opts.micGain, 1), 0, 20);
    const hp           = clamp(finiteOr(opts.hp, 0), 0, codecRate * 0.45);
    const lp           = clamp(finiteOr(opts.lp, codecRate / 2), 100, codecRate / 2);
    const bits         = clamp(finiteOr(opts.bits, 16), 2, 32);
    const lossPct      = clamp(finiteOr(opts.lossPct, 0), 0, 100);
    const jitterMs     = clamp(finiteOr(opts.jitterMs, 0), 0, 500);
    const enableCodec  = opts.enableWarble !== false;
    const autoGain     = opts.agc !== false;
    const captureChannel = ['left', 'right', 'mix'].includes(opts.captureChannel) ? opts.captureChannel : 'left';
    const gateSpec     = codec.senderGate || DEFAULT_SENDER_GATE;
    const gateOn       = opts.gate == null ? !!codec.senderGate : !!opts.gate;
    const gateDb       = gateThresholdDb(opts.gateThresholdDb, gateSpec.thresholdDb);
    const avgGain      = clamp(finiteOr(opts.avgGain, engine.autoGain.avgGain), 0, 2);
    const maxGain      = clamp(finiteOr(opts.maxGain, engine.autoGain.maxGain), 1, 100);
    const voiceScale   = clamp(finiteOr(opts.voiceScale, 1), 0, 4);
    const volume       = clamp(finiteOr(opts.volume, engine.volume), 0, 1);
    const rand         = mulberry32(finiteOr(opts.seed, 0xC0FFEE) >>> 0);
    const received     = opts.received && opts.received.frameLog ? opts.received : null;

    const srcRate = audioBuffer.sampleRate;
    const deviceRate = deviceRateOf(opts.deviceRate);
    const frameMs = 20;
    const framesPerPacket = clamp(Math.round(finiteOr(opts.frameMs, frameMs) / frameMs), 1, 10);
    const report = (f) => { if (typeof opts.onProgress === 'function') opts.onProgress(f); };

    /* ---- 1) Sender capture: downmix, capture gain, int16 clip ---- */
    let samples = bufferToMono(audioBuffer, captureChannel);
    if (!samples.every(Number.isFinite)) throw new TypeError('Source PCM contains a non-finite sample.');
    // The output's length: the source's duration at the device's rate.
    const playbackLength = Math.round(samples.length * deviceRate / srcRate);
    if (micGain !== 1 && !received) {
      for (let i = 0; i < samples.length; i++) samples[i] *= micGain;
    }
    samples = hardClip(samples, INT16_FULL_SCALE);
    report(0.05);
    await microYield();

    /* ---- 2) Resample to the codec rate; optional capture filters ---- */
    samples = resampleSinc(samples, srcRate, codecRate);
    if (hp > 10 && !received) samples = applyBiquad(samples, biquadCoefs('highpass', codecRate, hp, 0.707));
    if (lp < codecRate * 0.45 && !received) {
      samples = applyBiquad(samples, biquadCoefs('lowpass', codecRate, lp, 0.707));
      samples = applyBiquad(samples, biquadCoefs('lowpass', codecRate, lp, 0.707));
    }
    const captureEq = enableCodec && !received ? profileEq(codec, 'captureEq') : null;
    if (captureEq) samples = applyFirZeroPhase(samples, captureEq);
    report(0.2);
    await microYield();

    /* ---- 3) Encode -> lose packets -> decode / conceal ---- */
    let codecInfo = { backend: 'bypass', sampleRate: codecRate, frameMs };
    // The `steam` profile: Steam's sender and decoder, through to the voice
    // rate (stage 4's gain included), on the source's timeline.
    const steamPath = enableCodec && !received && codec.senderGate?.rule === 'steam';
    let steamVoice = null, lead = null;
    if (received) codecInfo = receivedCodecInfo(received, codecRate);
    else if (steamPath) {
      const { sender: SteamSender, swr } = steamModules();
      if (codecRate !== STEAM_RATE || codec.voiceRate !== STEAM_VOICE_RATE || codec.decoderEq) {
        throw new Error('The steam rule runs at 24000 Hz into a 44100 Hz voice rate, with no decoder EQ.');
      }
      const opus = await loadOpusModule();
      const bitrate = Math.max(6000, Math.round(codec.bitrate * bits / 16));
      const settings = steamSenderOptions(opts, gateOn, finiteOr(opts.seed, 0xC0FFEE) >>> 0);
      const sender = SteamSender.createSender(settings.sender);
      const messages = sender.push(steamCapture(samples));
      for (const m of sender.finish()) messages.push(m);
      const trip = await opus.steamRoundTrip(messages, bitrate, {
        application: codec.application, signal: codec.signal, runtime: codec.encoder?.runtime,
        complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx,
        makeLossMask: count => buildLossMask(count, framesPerPacket, lossPct, rand, jitterMs),
        yieldControl: microYield,
        onProgress: f => report(0.2 + 0.4 * f)
      });
      const resampler = opts.swrKernel !== undefined ? swr.createResampler({ kernel: opts.swrKernel }) : swr.createResampler();
      const voiceLength = sincLength(samples.length, STEAM_RATE, STEAM_VOICE_RATE);
      const timeline = steamTimeline({ voiceLength, codecLength: samples.length, lookahead: trip.lookahead, resampler,
        gain: autoGain ? createGain({ avgGain, maxGain, scale: voiceScale }) : null, capacity: voiceLength,
        onDecoded: opts.onDecoded, onResampled: opts.onResampled });
      for (let k = 0; k < messages.length; k++) {
        timeline.add(messages[k], trip.results[k]);
        if ((k & 63) === 63) await microYield();
      }
      steamVoice = timeline.take(voiceLength);
      codecInfo = { ...steamCodecInfo(codec, trip, timeline, sender, settings, resampler, bitrate), framesPerPacket };
      // The receiver's re-timing (finding 19), on the voice-rate timeline: the
      // laid spurts, moved earlier as the frame path moves its decoded sound;
      // the slots of 480 codec samples are 882 here.
      if (opts.retime) {
        codecInfo.retimed = retimeSpurts(steamVoice, { frameLog: codecInfo.frameLog, frameBytes: codecInfo.frameBytes,
          frameSamples: STEAM_FRAME * STEAM_VOICE_RATE / STEAM_RATE, lookahead: Math.round(trip.lookahead * STEAM_VOICE_RATE / STEAM_RATE),
          spans: timeline.spans() },
        STEAM_VOICE_RATE, mulberry32((finiteOr(opts.seed, 0xC0FFEE) ^ 0x9E3779B9) >>> 0));
      }
    } else if (enableCodec) {
      const opus = await loadOpusModule();
      const bitrate = Math.max(6000, Math.round(codec.bitrate * bits / 16));
      // The codec's own frame length: 20 ms for Opus, frameSize for CELT, Speex and VR12.
      const codecFrameMs = codec.frameSize ? 1000 * codec.frameSize / codecRate : frameMs;
      const common = {
        gate: gateOn ? { thresholdDb: gateDb, prerollFrames: Math.round(gateSpec.prerollMs / codecFrameMs),
          holdFrames: Math.round(gateSpec.holdMs / codecFrameMs) } : null,
        makeLossMask: count => buildLossMask(count, framesPerPacket, lossPct, rand, jitterMs),
        yieldControl: microYield,
        onProgress: f => report(0.2 + 0.5 * f)
      };
      const result = codec.engine === 'celt011'
        ? await opus.celtRoundTrip(samples, codecRate, { ...common, frameSize: codec.frameSize, complexity: codec.complexity,
          packetBytes: Math.max(8, Math.round(codec.packetBytes * bits / 16)), ...celtModeRate(codec) })
        : codec.engine === 'speex'
        ? await opus.speexRoundTrip(samples, codecRate, common)
        : codec.engine === 'vr12'
        ? await opus.vr12RoundTrip(samples, codecRate, common)
        : await opus.roundTrip(samples, codecRate, bitrate, { ...common,
          application: codec.application, signal: codec.signal,
          runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
      samples = result.samples;
      codecInfo = { ...result.info, framesPerPacket };
      // The engine codecs: the decoded samples the delay's trim dropped, for
      // the gain to run on first (gainLead).
      if (autoGain && gainLead(codec, codecInfo.lookahead)) lead = result.head;
      const eq = profileEq(codec);
      if (eq) samples = applyFirZeroPhase(samples, eq);
      // The receiver's re-timing, from its own seed so loss patterns stay put.
      // It never moves the first spurt, so the samples in `lead` stay where
      // they are.
      if (opts.retime) codecInfo.retimed = retimeSpurts(samples, codecInfo, codecRate, mulberry32((finiteOr(opts.seed, 0xC0FFEE) ^ 0x9E3779B9) >>> 0));
    }
    report(0.72);
    await microYield();

    /* ---- 4) Receiver voice channel: auto-gain + int16 clamp ---- */
    if (steamPath) {
      // The gain ran on the decoded packets (steamTimeline).
      samples = steamVoice;
      if (!autoGain) {
        for (let i = 0; i < samples.length; i++) samples[i] *= voiceScale;
        samples = hardClip(samples, INT16_FULL_SCALE);
      }
    } else if (autoGain) {
      // The engine codecs: the gain runs on the decoder's stream from its
      // first sample, and the delay is dropped after it (gainLead).
      const ahead = lead ? lead.length : 0;
      samples = resampleSinc(ahead ? joinSamples([lead, samples]) : samples, codecRate, codec.voiceRate);
      // With the gate on, the gain knows which blocks were decoded; with
      // no gate (or the codec bypassed) every block was. On the decoder's
      // stream a block's first sample is in frame floor(m / frameSamples):
      // no shift.
      const decoded = received || (enableCodec && gateOn)
        ? decodedFromFrames(codecInfo.frameLog, codecInfo.frameSamples, ahead ? 0 : codecInfo.lookahead || 0, codecRate, codec.voiceRate) : undefined;
      samples = receiverAutoGain(samples, { avgGain, maxGain, scale: voiceScale, decoded });
      if (ahead) samples = samples.slice(ahead);
    } else {
      samples = resampleSinc(samples, codecRate, codec.voiceRate);
      for (let i = 0; i < samples.length; i++) samples[i] *= voiceScale;
      samples = hardClip(samples, INT16_FULL_SCALE);
    }
    // The mix point, on every profile (a test hook): the gain's output at
    // the voice rate, as it reaches the mixer.
    if (typeof opts.onGain === 'function') opts.onGain(samples);

    /* ---- 5) The mixer at 44.1 kHz: the entry and the upsampling ---- */
    // The same stages as createRender and the live chain run, here given
    // the whole voice and ended. With a room (createRoomMix) the voice is
    // entered twice and the room path gives the sum before the clip, its
    // tail after the voice's end.
    const whole = (stage, x) => joinInts([stage.push(x), stage.flush()]);
    const mixStage = createMixStage(codec.voiceRate, room);
    const mix = whole(mixStage, samples);
    const tail = room ? mixStage.tail() : 0;
    report(0.8);
    await microYield();
    report(0.9);
    await microYield();

    /* ---- 6) mixOut, the device's rate, the output's length ---- */
    // The blocks, the clip, volume and the 16-bit rounding, then the device
    // stage. The output keeps the source's duration at the device's rate,
    // cut or padded with zeros, plus the room's tail at that rate.
    const atDevice = whole(createOutStage(volume, deviceRate, opts.onMixBlock), mix);
    const outLength = playbackLength + tailAtDevice(tail, deviceRate);
    samples = new Float32Array(outLength);
    for (let i = 0, n = Math.min(outLength, atDevice.length); i < n; i++) samples[i] = atDevice[i] / 32768;

    const blob = encodeWav(samples, deviceRate);
    report(1);
    return { samples, sampleRate: deviceRate, blob, realOpus: enableCodec,
      codecInfo: { ...codecInfo, codec: codecKey, autoGain, voiceRate: codec.voiceRate, ...(room ? { room: { ...room.info, tail } } : {}) } };
  }

  /* ------------------------------------------------------------------ */
  /* WAV encoder (16-bit PCM mono)                                      */
  /* ------------------------------------------------------------------ */

  // Float samples to 16-bit PCM, the conversion every download format uses:
  // round(s x 32768), ties to even, clamped to -32768..32767. A render's
  // samples are whole numbers over 32768, so each is written as itself.
  // (Until W3-10 positive samples were scaled by 32767 and truncated: every
  // positive sample of every file was one unit low.)
  function toInt16(samples) {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const r = roundEven(samples[i] * 32768);
      out[i] = r > 32767 ? 32767 : r < -32768 ? -32768 : r;
    }
    return out;
  }

  function encodeWav(samples, rate) {
    const pcm = toInt16(samples);
    const buf = new ArrayBuffer(44 + pcm.length * 2);
    const view = new DataView(buf);
    const wstr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    wstr(0, 'RIFF');
    view.setUint32(4, 36 + pcm.length * 2, true);
    wstr(8, 'WAVE');
    wstr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);        // PCM
    view.setUint16(22, 1, true);        // mono
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true); // byte rate
    view.setUint16(32, 2, true);        // block align
    view.setUint16(34, 16, true);       // bits per sample
    wstr(36, 'data');
    view.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) view.setInt16(44 + 2 * i, pcm[i], true);
    return new Blob([buf], { type: 'audio/wav' });
  }

  /* ------------------------------------------------------------------ */
  /* Live chain: process() one block at a time                          */
  /*                                                                    */
  /* The same stages and settings as process(), each keeping its state  */
  /* between blocks, for the live monitor. Where process() can look     */
  /* ahead, the live chain waits instead: the zero-phase FIRs become    */
  /* linear-phase (half their length late), and the voice gate holds    */
  /* frames back for its pre-roll (120 ms), as the sender must. The     */
  /* `steam` profile with the codec on runs the render's own stages     */
  /* (steamLiveChain, W3-11b) and holds back the sender's reach. A room */
  /* and under water run on a room path the worker keeps (W3-17d).      */
  /* ------------------------------------------------------------------ */

  // resampleSinc, a block at a time: the same kernel and output positions,
  // so the concatenated output equals resampleSinc of the concatenated input.
  function streamResampleSinc(inRate, outRate) {
    inRate = Math.round(inRate); outRate = Math.round(outRate);
    if (inRate === outRate) return (x) => x;
    const g = gcd(inRate, outRate), up = outRate / g, down = inRate / g;
    const { h, half } = resampleKernel(up, down);
    let buf = new Float32Array(0), start = 0, total = 0, next = 0;
    return (x) => {
      const merged = new Float32Array(buf.length + x.length);
      merged.set(buf); merged.set(x, buf.length);
      buf = merged; total += x.length;
      // Output i needs inputs up to (i * down + half) / up.
      const count = Math.max(0, Math.floor((total * up - 1 - half) / down) + 1 - next);
      const out = new Float32Array(count);
      for (let o = 0; o < count; o++, next++) {
        const t = next * down;
        let j = Math.max(0, Math.ceil((t - half) / up));
        const jEnd = Math.floor((t + half) / up);
        let k = half + t - j * up, acc = 0;
        for (; j <= jEnd; j++, k -= up) acc += buf[j - start] * h[k];
        out[o] = acc;
      }
      const keep = Math.max(start, Math.ceil((next * down - half) / up));
      if (keep > start) { buf = buf.slice(keep - start); start = keep; }
      return out;
    };
  }

  function streamBiquad(c) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => {
      const out = new Float32Array(x.length);
      for (let i = 0; i < x.length; i++) {
        const xi = x[i], y = c.b0 * xi + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
        out[i] = y; x2 = x1; x1 = xi; y2 = y1; y1 = y;
      }
      return out;
    };
  }

  // A symmetric FIR run causally: applyFirZeroPhase's output, (taps - 1) / 2 late.
  function streamFir(taps) {
    const m = taps.length, history = new Float32Array(m - 1);
    return (x) => {
      const out = new Float32Array(x.length);
      for (let i = 0; i < x.length; i++) {
        let acc = taps[0] * x[i];
        for (let k = 1; k < m; k++) acc += taps[k] * (i - k >= 0 ? x[i - k] : history[m - 1 + i - k]);
        out[i] = acc;
      }
      if (x.length >= m - 1) history.set(x.subarray(x.length - (m - 1)));
      else { history.copyWithin(0, x.length); history.set(x, m - 1 - x.length); }
      return out;
    };
  }

  // receiverAutoGain a piece at a time: each sample comes out as it goes in,
  // and the state (and options.decoded's count) carries across calls.
  // flush() ends the signal and gives nothing more: a last, partial block
  // has already followed the current ramp, as receiverAutoGain ends.
  function streamAutoGain(options = {}) {
    const rule = gainRule(options);
    return Object.assign((x) => rule.run(x, new Float32Array(x.length)), { flush: () => new Float32Array(0) });
  }

  // buildLossMask, a frame at a time, with the same random sequence.
  function streamLossMask(framesPerPacket, lossPct, rand, jitterMs = 0) {
    framesPerPacket = Math.max(1, Math.round(finiteOr(framesPerPacket, 1)));
    const net = VOICE_ENGINE.network;
    const p = clamp(finiteOr(lossPct, 0) / 100, 0, 1);
    const late = clamp(net.lateFramesAt50ms * finiteOr(jitterMs, 0) / 50, 0, 0.5);
    if (p <= 0 && late <= 0) return () => 0;
    if (p >= 1) return () => 1;
    const meanBurst = Math.max(1, net.burstMeanFrames / framesPerPacket);
    const pBG = p > 0 ? Math.min(1 / meanBurst, 0.98 * (1 - p) / p) : 1;
    const pGB = p > 0 ? pBG * p / (1 - p) : 0;
    let bad = rand() < p, frame = 0, packet = [];
    return () => {
      if (frame % framesPerPacket === 0) {
        packet = new Uint8Array(framesPerPacket);
        if (bad) packet.fill(1);
        else if (late > 0) for (let i = 0; i < framesPerPacket; i++) if (rand() < late) packet[i] = rand() < net.underrunShare ? 2 : 1;
        bad = bad ? (rand() >= pBG) : (rand() < pGB);
      }
      return packet[frame++ % framesPerPacket];
    };
  }

  // How long streamResampleSinc(inRate, outRate) waits, in seconds: output i
  // needs the inputs up to (i x down + half) / up, half / up inputs past its
  // own time.
  function sincWait(inRate, outRate) {
    inRate = Math.round(inRate); outRate = Math.round(outRate);
    if (inRate === outRate) return 0;
    const g = gcd(inRate, outRate), up = outRate / g, down = inRate / g;
    return resampleKernel(up, down).half / up / inRate;
  }

  // How long the live chain's last stage waits, in seconds: above 44.1 kHz
  // the device stage waits for the next mix sample (one 44100 Hz sample at
  // most); at 44.1 kHz there is no stage; below, the sinc resampler's wait.
  function outputWait(ioRate) {
    const rate = Math.round(ioRate);
    return rate > MIX_RATE ? 1 / MIX_RATE : rate === MIX_RATE ? 0 : sincWait(MIX_RATE, rate);
  }

  // The live chain of the `steam` profile with the codec on (W3-11b): the
  // render's own stages (createRender's steam stage), fed as the
  // microphone's blocks arrive, with the key held from the chain's start to
  // its stop. What it hands its mix point is, sample for sample, what
  // createRender hands its own for the same sound, seed and settings, but for
  // a packet moved after a gap of more than ten lost frames (below).
  //   - Capture: the mic gain and the clip, the context's rate to 24 kHz, the
  //     optional filters, the capture roll-off with its delay dropped from
  //     the front (firStage, as createRender runs it), the 16 bits.
  //   - Steam's sender with the render's seed, settings and steamUptime; the
  //     loss mask a frame at a time by the sender's frame number;
  //     createSteamStream; steamTimeline with one resampler and one gain for
  //     the chain. No wall clock is read: the sender's seeded clock runs on
  //     the samples pushed to it, as in a render.
  //   - What is given out is decided per pushed sample: first that sample's
  //     messages are laid, against what was given out before it; then
  //     given = max(given, steamGiveOut(pushed, cursor, reach, lookahead,
  //     ten frames)). The plan of blocks does not change the output. There is
  //     no flush: what is held back when the chain stops is never given out.
  //   - Low latency (opts.lowLatency, the app's own): the reach is the
  //     longest chunk and a frame less a sample, not the longest chunk and
  //     the pre-roll; the sender runs as before, and only a spurt's pre-roll
  //     is lost (cut from its opening packet).
  //   - Push-to-talk, the app's stand-in until W3-11c (not Steam's key rules):
  //     while the key is up each block is zeros from before the mic gain; the
  //     clock and every position run on, and the gate ends a spurt by its own
  //     hold. The input meter still shows the microphone.
  //   - A settings change rebuilds the chain (live-worker.js): the new chain
  //     starts with a silent sender, a new decoder, a resampler that has not
  //     flushed and a reset gain. That is the app's own; Steam has no such
  //     thing.
  async function steamLiveChain(c) {
    const { opts, ioRate, codecKey, codec, micGain, hp, lp, bits, lossPct, jitterMs, autoGain, gateOn, avgGain, maxGain, voiceScale,
      framesPerPacket, rand, mixStages, roomHoldSeconds = 0, spurtStarts = () => {} } = c;
    const { sender: SteamSender, swr } = steamModules();
    if (codec.codecRate !== STEAM_RATE || codec.voiceRate !== STEAM_VOICE_RATE || codec.decoderEq) {
      throw new Error('The steam rule runs at 24000 Hz into a 44100 Hz voice rate, with no decoder EQ.');
    }
    const S = SteamSender.STEAM_SENDER;
    const opus = await loadOpusModule();
    const bitrate = Math.max(6000, Math.round(codec.bitrate * bits / 16));

    /* ---- Capture, as createRender's stages 1 and 2 ---- */
    const toCodec = streamResampleSinc(ioRate, STEAM_RATE);
    const filters = [];
    if (hp > 10) filters.push(streamBiquad(biquadCoefs('highpass', STEAM_RATE, hp, 0.707)));
    if (lp < STEAM_RATE * 0.45) {
      filters.push(streamBiquad(biquadCoefs('lowpass', STEAM_RATE, lp, 0.707)), streamBiquad(biquadCoefs('lowpass', STEAM_RATE, lp, 0.707)));
    }
    const captureEq = profileEq(codec, 'captureEq');
    if (captureEq) filters.push(firStage(captureEq, Infinity).push);

    /* ---- The sender, the codec, the network and the receiver ---- */
    const settings = steamSenderOptions(opts, gateOn, finiteOr(opts.seed, 0xC0FFEE) >>> 0);
    const sender = SteamSender.createSender(settings.sender);
    let stream = await opus.createSteamStream(bitrate, { application: codec.application, signal: codec.signal,
      runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
    const lookahead = stream.lookahead;
    const nextMiss = streamLossMask(framesPerPacket, lossPct, rand, jitterMs);
    let frame = 0;
    const miss = (f) => {
      if (f !== frame++) throw new Error(`TF2Audio live chain: frame ${f} reached the network out of order`);
      return nextMiss();
    };
    const resampler = opts.swrKernel !== undefined ? swr.createResampler({ kernel: opts.swrKernel }) : swr.createResampler();
    const timeline = steamTimeline({ lookahead, resampler, gain: autoGain ? createGain({ avgGain, maxGain, scale: voiceScale }) : null,
      onDecoded: opts.onDecoded, onResampled: opts.onResampled, onMove: opts.onMove });
    // Full: a spurt not yet opened starts at most the longest chunk and the
    // pre-roll before the last sample pushed. Low latency: a message's first
    // frame starts at most the longest chunk and a frame less a sample before
    // it (up to a frame less a sample is kept from the chunk before).
    const fullReach = steamReach(S), lowReach = steamReach(S) - S.preroll + S.frame - 1;
    const reach = opts.lowLatency ? lowReach : fullReach;

    /* ---- After the mix point: the live chain's own stages ---- */
    const after = [];
    if (!autoGain) after.push((x) => hardClip(x.map(v => v * voiceScale), INT16_FULL_SCALE));
    after.push(...mixStages());

    // contentDelay: how many samples (at ioRate) the output's index sits
    // behind the input's: 0 (W3-10). Nothing shifts it: the capture FIR's
    // delay is dropped, the lookahead is trimmed where packets are laid, the
    // reach only holds samples back, and after the mix point the entry and
    // mixOut have no memory, the voice is not upsampled, and the device
    // stage starts at phase 0 (below 44.1 kHz the sinc resampler is
    // time-aligned). latencyMs is every hold-back: the resamplers' waits (to
    // 24 kHz, Steam's resampler's 16 inputs, and the context's: outputWait),
    // the capture FIR's dropped delay, the reach and the lookahead.
    const firDelay = (taps) => (taps ? (taps.length - 1) / 2 : 0);
    const contentDelay = 0;
    const holdBack = (r) => sincWait(ioRate, STEAM_RATE) + (firDelay(captureEq) + r + lookahead + swr.TAPS / 2) / STEAM_RATE
      + outputWait(ioRate) + roomHoldSeconds;
    const latencyMs = (r) => 1000 * (contentDelay / ioRate + holdBack(r));

    let talking = true, pushed = 0, given = 0, slot = 0, roomSpurt = null;
    const one = new Int16Array(1), codes = [];
    const stats = { codec: codecKey, frames: 0, sent: 0, modes: { silk: 0, hybrid: 0, celt: 0, speex: 0, vr12: 0 }, dtx: 0, lost: 0, late: 0,
      bytes: 0, gateOpen: false, lastMode: null, inputPeak: 0, outputPeak: 0, spurts: 0, talking,
      droppedLate: 0, movedLate: 0, latencyMs: latencyMs(reach) };
    // The sender's own count, read when asked.
    Object.defineProperty(stats, 'spurts', { enumerable: true, get: () => sender.info().spurts.length });

    async function process(block) {
      if (!stream) throw new Error('TF2Audio live chain: this chain has been freed.');
      const x = Float32Array.from(block);
      let peak = 0;
      for (let i = 0; i < x.length; i++) {
        const v = clamp(x[i] * micGain, -INT16_FULL_SCALE, INT16_FULL_SCALE);
        x[i] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      stats.inputPeak = Math.max(stats.inputPeak, peak);
      // The key up (the app's stand-in): zeros in place of the microphone,
      // after its meter. The order puts them before the mic gain; the gain
      // and the clip are memoryless, so after them is the same samples.
      if (!talking) x.fill(0);
      let y = toCodec(x);
      for (const f of filters) y = f(y);
      const q = steamCapture(y);
      for (let i = 0; i < q.length; i++) {
        one[0] = q[i];
        const messages = sender.push(one);
        pushed++;
        for (const msg of messages) {
          const made = await stream.message(msg, miss);
          // The room's stand-in for a voice channel's start: the spurt's
          // first delivered message, where the timeline opens the spurt.
          if (!made.silence && msg.spurt !== roomSpurt) { roomSpurt = msg.spurt; spurtStarts(); }
          for (const b of made.blocks) {
            const dtx = b.bytes <= 2;
            stats.bytes += b.bytes;
            stats.modes[b.mode]++;
            if (dtx) stats.dtx++;
            stats.lastMode = dtx ? 'dtx' : b.mode;
          }
          timeline.add(msg, made, given);
        }
        const bound = steamGiveOut(pushed, timeline.cursor, reach, lookahead, true);
        if (bound > given) given = bound;
      }
      // The 20 ms slots that became final: nothing is laid before given.
      const final = timeline.final(slot, given);
      for (let k = 0; k < final.frameLog.length; k++) {
        const code = final.frameLog[k];
        stats.frames++;
        if (code !== FRAME_CODES.gated) stats.sent++;
        if (code === FRAME_CODES.lost) stats.lost++;
        if (code === FRAME_CODES.late) stats.late++;
        codes.push(code);
      }
      slot = final.to;
      stats.gateOpen = timeline.cursor !== Infinity;
      stats.droppedLate = timeline.dropped();
      stats.movedLate = timeline.moved();
      let out = timeline.take(given);
      for (const f of after) out = f(out);
      let outPeak = 0;
      for (const v of out) if (Math.abs(v) > outPeak) outPeak = Math.abs(v);
      stats.outputPeak = Math.max(stats.outputPeak, outPeak);
      return out;
    }

    return { process, stats, contentDelay, codecRate: STEAM_RATE, frameSize: STEAM_FRAME, frameSeconds: STEAM_FRAME / STEAM_RATE,
      // Slot k covers the codec's samples from 480 k - lookahead (the render's slot rule).
      slotOffsetSeconds: -lookahead / STEAM_RATE,
      // How much low latency saves: the difference of the two reaches.
      lowLatencySavingMs: latencyMs(fullReach) - latencyMs(lowReach),
      version: stream.version, bitrate, vbr: !!codec.encoder?.vbr, dtx: !!codec.encoder?.dtx,
      gateDb: settings.gate ? settings.thresholdDb : null, autoGain, voiceRate: STEAM_VOICE_RATE, realOpus: true,
      setTalking(on) { talking = !!on; stats.talking = talking; },
      takeFrameCodes() { return codes.splice(0); },
      free() { if (stream) stream.free(); stream = null; } };
  }

  // The live chain for `opts` (process()'s options) at the audio device's
  // rate. process(block) takes and returns Float32Arrays at ioRate (the
  // output a little shorter or longer as the resamplers work); `stats`
  // counts what the codec did.
  async function createLiveChain(opts = {}, ioRate = 48000) {
    const codecKey = Object.hasOwn(CODEC_PROFILES, opts.codec) ? opts.codec : 'steam';
    const codec = CODEC_PROFILES[codecKey];
    const engine = VOICE_ENGINE;
    const codecRate = codec.codecRate;
    const micGain = clamp(finiteOr(opts.micGain, 1), 0, 20);
    const hp = clamp(finiteOr(opts.hp, 0), 0, codecRate * 0.45);
    const lp = clamp(finiteOr(opts.lp, codecRate / 2), 100, codecRate / 2);
    const bits = clamp(finiteOr(opts.bits, 16), 2, 32);
    const lossPct = clamp(finiteOr(opts.lossPct, 0), 0, 100);
    const jitterMs = clamp(finiteOr(opts.jitterMs, 0), 0, 500);
    const enableCodec = opts.enableWarble !== false;
    const autoGain = opts.agc !== false;
    const gateSpec = codec.senderGate || DEFAULT_SENDER_GATE;
    const gateOn = enableCodec && (opts.gate == null ? !!codec.senderGate : !!opts.gate);
    const gateDb = gateThresholdDb(opts.gateThresholdDb, gateSpec.thresholdDb);
    const avgGain = clamp(finiteOr(opts.avgGain, engine.autoGain.avgGain), 0, 2);
    const maxGain = clamp(finiteOr(opts.maxGain, engine.autoGain.maxGain), 1, 100);
    const voiceScale = clamp(finiteOr(opts.voiceScale, 1), 0, 4);
    const volume = clamp(finiteOr(opts.volume, engine.volume), 0, 1);
    const framesPerPacket = clamp(Math.round(finiteOr(opts.frameMs, 20) / 20), 1, 10);
    const rand = mulberry32(finiteOr(opts.seed, 0xC0FFEE) >>> 0);

    // The mix point, a stage boundary (opts.onGain, a test hook, sees the
    // voice-rate signal there as a render's does), and the stages after it,
    // the render's own (W3-10): the entry and the upsampling (their states
    // made with the chain), the blocks (opts.onMixBlock, counted from the
    // chain's first sample at its mix point), mixOut. Then the context's
    // rate: the device stage's linear rule at any rate above 44.1 kHz (the
    // context is the listener's device, so opts.deviceRate is not read
    // here), nothing at 44.1 kHz, and below it the sinc resampler: a context
    // under 44.1 kHz is the browser's, not the game's. The old listener's
    // low-pass is gone (W3-17c).
    //   The room (W3-17d): opts.roomPath, a room path (room-dsp.js
    // createRoomPath) that the live monitor's worker keeps outside the chain,
    // so a rebuilt chain keeps the room's lines and the slot's count of
    // blocks; the worker sets its room and its water. With it the mix stage
    // is a render's with a room (createRoomMix): per 512-sample block the
    // path's shares, the voice entered twice, each part upsampled on its
    // own, the path's sum, then the clip. The chain holds the voice's partial
    // block until it is whole: up to 511 samples at 44100 Hz, 11.6 ms,
    // counted in stats.latencyMs (roomHoldSeconds), not in contentDelay, since
    // it holds samples back and shifts none. Without it the chain holds
    // nothing, as W3-10 left it. A chain never flushes, so the path's tail
    // rule is not asked.
    const roomPath = opts.roomPath && typeof opts.roomPath.process === 'function' ? opts.roomPath : null;
    const liveRoom = roomPath ? { path: roomPath, shares: null, cap: Infinity } : null;
    const roomHoldSeconds = roomPath ? (MIX_BLOCK - 1) / MIX_RATE : 0;
    // A voice channel starts (path.spurtStart(): its two limits are fixed
    // from the room's four mix values as they stand). There is no voice
    // channel live yet (W3-02c); the stand-in is the first delivered message
    // (frame) of each spurt the sender opens.
    const spurtStarts = () => { if (roomPath) roomPath.spurtStart(); };
    const mixStages = () => {
      const stages = [];
      if (typeof opts.onGain === 'function') stages.push((x) => { opts.onGain(x); return x; });
      const rate = Math.round(ioRate);
      const out = createOutputStage({ voiceRate: codec.voiceRate, volume, deviceRate: rate > MIX_RATE ? rate : MIX_RATE, onMixBlock: opts.onMixBlock,
        room: liveRoom });
      stages.push(out.push, mixToFloat);
      if (rate < MIX_RATE) stages.push(streamResampleSinc(MIX_RATE, rate));
      return stages;
    };

    // The `steam` profile with the codec on runs the render's own stages.
    if (enableCodec && codec.senderGate?.rule === 'steam') {
      return steamLiveChain({ opts, ioRate, codecKey, codec, micGain, hp, lp, bits, lossPct, jitterMs, autoGain, gateOn,
        avgGain, maxGain, voiceScale, framesPerPacket, rand, mixStages, roomHoldSeconds, spurtStarts });
    }

    const toCodec = streamResampleSinc(ioRate, codecRate);
    const filters = [];
    if (hp > 10) filters.push(streamBiquad(biquadCoefs('highpass', codecRate, hp, 0.707)));
    if (lp < codecRate * 0.45) {
      filters.push(streamBiquad(biquadCoefs('lowpass', codecRate, lp, 0.707)), streamBiquad(biquadCoefs('lowpass', codecRate, lp, 0.707)));
    }
    const captureEq = enableCodec ? profileEq(codec, 'captureEq') : null;
    if (captureEq) filters.push(streamFir(captureEq));
    const decoderEq = enableCodec ? profileEq(codec) : null;
    const after = [];
    if (decoderEq) after.push(streamFir(decoderEq));
    after.push(streamResampleSinc(codecRate, codec.voiceRate));
    // The gain's decoded(): whether the frame a voice-rate sample came from
    // was sent (no lookahead is trimmed here: frame f's decoded samples are
    // f * frameSize onward, after the decoder EQ's delay). Frames not sent
    // are the gate's, or push-to-talk's with the key up: in both nothing
    // reaches the receiver. One call codes all its frames before any of
    // their samples reach the gain, so the flags are kept, however many,
    // until the gain has passed the block their samples begin in.
    let sentFlags = new Uint8Array(64), flagBase = 0, framesCoded = 0, gainSamples = 0;
    const decoderDelay = decoderEq ? (decoderEq.length - 1) >> 1 : 0;
    const frameOf = (m) => Math.floor(Math.max(0, Math.floor(m * codecRate / codec.voiceRate) - decoderDelay) / frameSize);
    const decoded = (m) => {
      const f = frameOf(m);
      return f < flagBase || f >= framesCoded ? true : sentFlags[f - flagBase] === 1;
    };
    const recordSent = (sent) => {
      if (!autoGain) return;
      if (framesCoded - flagBase === sentFlags.length) {
        const grown = new Uint8Array(2 * sentFlags.length);
        grown.set(sentFlags);
        sentFlags = grown;
      }
      sentFlags[framesCoded++ - flagBase] = sent ? 1 : 0;
    };
    if (autoGain) {
      const gain = streamAutoGain({ avgGain, maxGain, scale: voiceScale, decoded });
      after.push((x) => {
        const y = gain(x);
        gainSamples += x.length;
        // The gain asks only about the block it is in or later ones.
        const keep = Math.min(framesCoded, frameOf(gainSamples - gainSamples % GAIN_BLOCK));
        if (keep > flagBase) {
          sentFlags.copyWithin(0, keep - flagBase, framesCoded - flagBase);
          flagBase = keep;
        }
        return y;
      });
    } else after.push((x) => hardClip(x.map(v => v * voiceScale), INT16_FULL_SCALE));
    after.push(...mixStages());

    let voice = null;
    if (enableCodec) {
      const opus = await loadOpusModule();
      if (typeof opus.createVoiceStream !== 'function') throw new Error('This Opus build has no frame-by-frame interface.');
      voice = codec.engine === 'celt011'
        ? await opus.createCeltStream(codecRate, { frameSize: codec.frameSize, complexity: codec.complexity,
          packetBytes: Math.max(8, Math.round(codec.packetBytes * bits / 16)), ...celtModeRate(codec) })
        : codec.engine === 'speex'
        ? await opus.createSpeexStream(codecRate)
        : codec.engine === 'vr12'
        ? await opus.createVr12Stream(codecRate)
        : await opus.createVoiceStream(codecRate, Math.max(6000, Math.round(codec.bitrate * bits / 16)), {
          application: codec.application, signal: codec.signal,
          runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
    }
    // 20 ms for Opus; CELT, Speex and VR12 have their own frame (23.2 ms for vaudio_celt, 14.51 ms for
    // vaudio_speex, 32.65 ms for vaudio_miles).
    const frameSize = codec.frameSize || codecRate / 50, frameSeconds = frameSize / codecRate;
    const threshold = 10 ** (gateDb / 20);
    // opts.lowLatency (live only, not how TF2 behaves): no pre-roll, so the
    // gate opens on the loud frame itself and 120 ms sooner.
    const preroll = gateOn && !opts.lowLatency ? Math.round(gateSpec.prerollMs / 1000 / frameSeconds) : 0, hold = Math.round(gateSpec.holdMs / 1000 / frameSeconds);
    const lossMask = streamLossMask(framesPerPacket, lossPct, rand, jitterMs);
    let pending = new Float32Array(0);
    const queue = [];   // frames waiting out the gate's pre-roll: { samples, sent, talk }
    let frameIndex = 0, holdUntil = -1, open = false, spurts = 0;
    // Push-to-talk: frames captured while the key is up are never sent, as
    // the game does not capture them at all.
    let talking = true;
    const codes = [];   // opus-codec.mjs FRAME codes of the frames since takeFrameCodes()
    // The output is the input this many samples (at ioRate) later: the
    // group delay of the causal FIRs (capture and decoder EQ at the codec
    // rate), which a render applies zero-phase, and the codec's lookahead,
    // which a render trims. The pre-roll only holds output back; it does not
    // shift it. The stages after the mix point shift nothing against a
    // render (the upsampler's one or three mix samples of lateness are in
    // the render too).
    const firDelay = (taps) => (taps ? (taps.length - 1) / 2 : 0);
    const delaySeconds = (firDelay(captureEq) + firDelay(decoderEq) + (voice ? voice.lookahead : 0)) / codecRate;
    const contentDelay = Math.round(delaySeconds * ioRate);
    const stats = { codec: codecKey, frames: 0, sent: 0, modes: { silk: 0, hybrid: 0, celt: 0, speex: 0, vr12: 0 }, dtx: 0, lost: 0, late: 0,
      bytes: 0, gateOpen: false, lastMode: null, inputPeak: 0, outputPeak: 0, spurts: 0, talking,
      latencyMs: 1000 * (preroll * frameSeconds + delaySeconds + roomHoldSeconds) };

    // The room's stand-in for a voice channel's start: the spurt's first
    // frame that is delivered (not lost, not late).
    let spurtUndelivered = false;
    async function codecFrame(frame, sent) {
      stats.frames++;
      recordSent(sent);
      if (!voice) {
        if (sent && !stats.gateOpen) spurtStarts();
        stats.gateOpen = sent; codes.push(sent ? 2 : 0); return sent ? frame : new Float32Array(frame.length);
      }
      if (!sent) { open = false; stats.gateOpen = false; codes.push(0); return new Float32Array(frameSize); }
      if (!open) {
        if (spurts > 0) await voice.restart();
        spurts++;
        stats.spurts = spurts;
        open = true;
        spurtUndelivered = true;
      }
      stats.gateOpen = true;
      stats.sent++;
      const encoded = voice.encode(frame);
      stats.bytes += encoded.bytes;
      stats.modes[encoded.mode]++;
      if (encoded.dtx) stats.dtx++;
      stats.lastMode = encoded.dtx ? 'dtx' : encoded.mode;
      const miss = lossMask();
      if (miss === 1) { stats.lost++; codes.push(5); return voice.conceal().slice(); }
      if (miss === 2) { stats.late++; codes.push(6); return new Float32Array(frameSize); }
      codes.push(encoded.dtx ? FRAME_CODES.dtx : FRAME_CODES[encoded.mode]);
      if (spurtUndelivered) { spurtUndelivered = false; spurtStarts(); }
      return voice.decode(encoded.packet).slice();
    }

    async function process(block) {
      let x = Float32Array.from(block);
      let peak = 0;
      for (let i = 0; i < x.length; i++) {
        const v = clamp(x[i] * micGain, -INT16_FULL_SCALE, INT16_FULL_SCALE);
        x[i] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      stats.inputPeak = Math.max(stats.inputPeak, peak);
      x = toCodec(x);
      for (const f of filters) x = f(x);
      const merged = new Float32Array(pending.length + x.length);
      merged.set(pending); merged.set(x, pending.length);
      const whole = Math.floor(merged.length / frameSize) * frameSize;
      pending = merged.slice(whole);
      const decoded = [];
      for (let start = 0; start < whole; start += frameSize) {
        const frame = merged.slice(start, start + frameSize);
        if (!gateOn) { decoded.push(await codecFrame(frame, talking)); continue; }
        // Steam's gate: a frame over the threshold sends the pre-roll before
        // it and the hold after it. A frame leaves the queue once no later
        // frame's pre-roll can reach it.
        let energy = 0;
        for (const v of frame) energy += v * v;
        const loud = talking && Math.sqrt(energy / frameSize) > threshold;
        const f = frameIndex++;
        queue.push({ samples: frame, index: f, sent: false, talk: talking });
        if (loud) {
          holdUntil = Math.max(holdUntil, f + hold);
          for (const q of queue) if (q.index >= f - preroll) q.sent = true;
        }
        while (queue.length > preroll) {
          const q = queue.shift();
          decoded.push(await codecFrame(q.samples, q.talk && (q.sent || q.index <= holdUntil)));
        }
      }
      let y = new Float32Array(decoded.reduce((n, d) => n + d.length, 0));
      let offset = 0;
      for (const d of decoded) { y.set(d, offset); offset += d.length; }
      for (const f of after) y = f(y);
      let outPeak = 0;
      for (const v of y) if (Math.abs(v) > outPeak) outPeak = Math.abs(v);
      stats.outputPeak = Math.max(stats.outputPeak, outPeak);
      return y;
    }

    return { process, stats, contentDelay, codecRate, frameSize, frameSeconds, version: voice ? voice.version : null,
      // Speex and VR12 report their own bitrate (11025 and 2940 bit/s), whatever snd_bits says.
      bitrate: voice?.bitrate ?? Math.max(6000, Math.round(codec.bitrate * bits / 16)), vbr: !!codec.encoder?.vbr, dtx: !!codec.encoder?.dtx,
      gateDb: gateOn ? gateDb : null, autoGain, voiceRate: codec.voiceRate, realOpus: !!voice,
      setTalking(on) { talking = !!on; stats.talking = talking; },
      takeFrameCodes() { return codes.splice(0); },
      free() { if (voice) voice.free(); voice = null; } };
  }

  /* ------------------------------------------------------------------ */
  /* A render a piece at a time                                         */
  /*                                                                    */
  /* createRender(source, opts) is process() for a source pushed in     */
  /* chunks of any size: the same samples, WAV bytes and codecInfo,     */
  /* while each stage keeps only its state. A stage that reads ahead in  */
  /* process() waits instead and is flushed at the end with the zeros   */
  /* process() reads as missing. The gate decides a frame once its      */
  /* pre-roll is measured; the codec restarts at each talk spurt as     */
  /* roundTrip does; the loss mask is drawn once over all frames. A     */
  /* room streams (W3-17c); talk-spurt re-timing does not.              */
  /* ------------------------------------------------------------------ */

  const NO_SAMPLES = new Float32Array(0);
  const passStage = { push: (x) => x, flush: () => NO_SAMPLES };

  // The length resampleSinc gives.
  function sincLength(n, inRate, outRate) {
    inRate = Math.round(inRate); outRate = Math.round(outRate);
    if (!n || inRate === outRate) return n;
    const g = gcd(inRate, outRate);
    return Math.max(1, Math.round(n * (outRate / g) / (inRate / g)));
  }

  // Passes at most `length` samples in all.
  function cutAt(length) {
    let passed = 0;
    return (y) => {
      const keep = Math.max(0, Math.min(y.length, length - passed));
      passed += keep;
      return keep < y.length ? y.subarray(0, keep) : y;
    };
  }

  // resampleSinc of an inLength-sample signal: the streaming resampler,
  // given at the end the zeros its last outputs read (resampleSinc skips the
  // inputs past the end, which adds the same), cut to resampleSinc's length.
  function sincStage(inRate, outRate, inLength) {
    inRate = Math.round(inRate); outRate = Math.round(outRate);
    if (inRate === outRate) return passStage;
    const g = gcd(inRate, outRate), up = outRate / g, down = inRate / g, { half } = resampleKernel(up, down);
    const outLength = sincLength(inLength, inRate, outRate), run = streamResampleSinc(inRate, outRate), cut = cutAt(outLength);
    let fed = 0;
    return {
      push(x) { fed += x.length; return cut(run(x)); },
      // Output i reads the inputs up to (i * down + half) / up.
      flush() {
        if (!outLength) return NO_SAMPLES;
        return cut(run(new Float32Array(Math.max(0, Math.ceil(((outLength - 1) * down + half + 1) / up) - fed))));
      }
    };
  }

  // applyFirZeroPhase of a length-sample signal: a causal FIR with its
  // delay dropped, given at the end the zeros applyFirZeroPhase reads as
  // missing. Each sum starts at +0 and takes the taps in applyFirZeroPhase's
  // order, so the zeros read past either end change nothing, not even the
  // sign of a zero (streamFir starts at its first term, which gives -0 where
  // every term is -0).
  function firStage(taps, length) {
    const m = taps.length, delay = (m - 1) >> 1, cut = cutAt(length);
    let history = new Float32Array(m - 1), dropped = 0;
    const run = (x) => {
      const merged = new Float32Array(m - 1 + x.length);
      merged.set(history); merged.set(x, m - 1);
      const out = new Float32Array(x.length);
      for (let i = 0; i < x.length; i++) {
        let acc = 0;
        for (let k = 0, p = i + m - 1; k < m; k++, p--) acc += taps[k] * merged[p];
        out[i] = acc;
      }
      history = merged.slice(x.length);
      const d = Math.min(delay - dropped, out.length);
      dropped += d;
      return cut(d ? out.subarray(d) : out);
    };
    return { push: run, flush: () => run(new Float32Array(delay)) };
  }

  const biquadStage = (c) => ({ push: streamBiquad(c), flush: () => NO_SAMPLES });
  // Drops the first n samples it is given.
  function dropStage(n) {
    let left = n;
    return {
      push(x) { const d = Math.min(left, x.length); left -= d; return d ? x.subarray(d) : x; },
      flush: () => NO_SAMPLES
    };
  }
  const sampleStage = (f) => ({ push: f, flush: () => NO_SAMPLES });

  // The voice gate and the codec a frame at a time, as roundTrip,
  // celtRoundTrip, speexRoundTrip and vr12RoundTrip run them over a
  // length-sample signal at the codec rate. Frame f is final once frame
  // f + preroll is measured (no later frame's pre-roll reaches it), so the
  // input held is a few frames. Decoded frame f lands at f * size - lookahead;
  // gated and late frames leave zeros. kind: 'opus' | 'celt' | 'speex' |
  // 'vr12'. lead (gainLead): how many
  // of the delay's samples are kept in front, for the gain to run on before
  // they are dropped; the stage then gives length + lead samples, frame f at
  // f * size - lookahead + lead.
  function codecStage(voice, kind, length, gate, makeLossMask, lead = 0) {
    const size = voice.frameSize, lookahead = voice.lookahead, shift = lookahead - lead, total = length + lead;
    const frames = Math.ceil((length + lookahead) / size);
    const lossMask = makeLossMask(frames);
    const frameLog = new Uint8Array(frames), frameBytes = new Uint16Array(frames);
    const modes = kind === 'speex' ? { silk: 0, hybrid: 0, celt: 0, speex: 0 }
      : kind === 'vr12' ? { silk: 0, hybrid: 0, celt: 0, vr12: 0 } : { silk: 0, hybrid: 0, celt: 0 };
    const preroll = gate ? gate.preroll : 0, hold = gate ? gate.hold : 0, input = new Float32Array(size);
    let encodedBytes = 0, lostFrames = 0, underrunFrames = 0, gatedFrames = 0, dtxFrames = 0, spurts = 0, open = false;
    let held = new Float32Array(8 * size), heldStart = 0, heldLength = 0, received = 0;
    let measured = 0, loudest = -Infinity, next = 0;

    async function code(f) {
      const dest = f * size - shift, begin = Math.max(0, -dest), span = Math.max(0, Math.min(size, total - dest) - begin);
      // Sent: some frame from f - hold to f + preroll is loud.
      if (gate && loudest < f - hold) { gatedFrames++; open = false; return new Float32Array(span); }
      if (!open) {
        if (spurts > 0) await voice.restart();
        spurts++;
        open = true;
      }
      input.fill(0);
      const start = f * size;
      if (start < length) input.set(held.subarray(start - heldStart, Math.min(length, start + size) - heldStart));
      const encoded = voice.encode(input);
      encodedBytes += encoded.bytes;
      frameBytes[f] = encoded.bytes;
      if (kind === 'opus') {
        modes[encoded.mode]++;
        if (encoded.dtx) dtxFrames++;
        frameLog[f] = encoded.dtx ? FRAME_CODES.dtx : FRAME_CODES[encoded.mode];
      } else {
        modes[kind]++;
        frameLog[f] = FRAME_CODES[kind];
      }
      const miss = lossMask ? lossMask[f] : 0;
      if (miss === 1) { lostFrames++; frameLog[f] = FRAME_CODES.lost; }
      else if (miss === 2) { underrunFrames++; frameLog[f] = FRAME_CODES.late; }
      let out = new Float32Array(span);
      if (miss !== 2) {
        const decoded = miss === 1 ? voice.conceal() : voice.decode(encoded.packet);
        if (kind === 'opus' && decoded.length !== size) throw new Error('Unexpected Opus frame length');
        out.set(decoded.subarray(begin, begin + span));
      }
      if ((f & 31) === 31) await microYield();
      return out;
    }

    async function advance() {
      const parts = [];
      while (measured < frames) {
        const start = measured * size, end = Math.min(length, start + size);
        if (end > received) break;
        if (gate) {
          let energy = 0;
          for (let i = start; i < end; i++) { const v = held[i - heldStart]; energy += v * v; }
          if (Math.sqrt(energy / size) > gate.threshold) loudest = measured;
        }
        measured++;
        while (next < frames && (next + preroll < measured || measured === frames)) parts.push(await code(next++));
      }
      const drop = Math.min(heldLength, next * size - heldStart);
      if (drop > 0) { held.copyWithin(0, drop, heldLength); heldLength -= drop; heldStart += drop; }
      return joinSamples(parts);
    }

    return {
      async push(x) {
        if (heldLength + x.length > held.length) {
          const grown = new Float32Array(Math.max(2 * held.length, heldLength + x.length));
          grown.set(held.subarray(0, heldLength));
          held = grown;
        }
        held.set(x, heldLength);
        heldLength += x.length;
        received += x.length;
        return advance();
      },
      async flush() {
        if (received !== length) throw new Error(`createRender: the codec got ${received} of ${length} samples`);
        return advance();
      },
      // The counts roundTrip, celtRoundTrip, speexRoundTrip and vr12RoundTrip report.
      counts() {
        return { lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames, spurts, encodedBytes, modes, frameLog, frameBytes };
      }
    };
  }

  function joinSamples(parts) {
    if (parts.length === 1) return parts[0];
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) { out.set(p, offset); offset += p.length; }
    return out;
  }

  /**
   * process() a piece at a time, for sources too long to hold several
   * copies of. source = { sampleRate, length, numberOfChannels: 1 } (the
   * mono capture signal; no samples); opts are process()'s. Resolves to
   * { outputLength, maxTail, sampleRate, push(chunk), finish(), free() }:
   *   outputLength the output's length without a room's tail (the source's
   *                duration at the device's rate)
   *   maxTail      the most a room's tail can add to it: the tail's cap
   *                (882,000 mixer samples, 20 s) at the device's rate; 0
   *                with no room and not under water. A caller with one
   *                buffer for the output makes it outputLength + maxTail
   *   push(chunk)  float PCM of the source in order, any size; resolves to
   *                the output samples that became final (maybe none); with
   *                a room never more than outputLength in all
   *   finish()     after exactly `length` samples were pushed; resolves to
   *                { samples, codecInfo, realOpus }, samples the rest of
   *                the output, a room's tail included
   *   free()       releases the codec (finish() does too)
   * Concatenated, the output is process()'s samples and codecInfo is its
   * codecInfo; steamUptime is taken as process() takes it. retime is
   * rejected with a RangeError: not streamed (W3-02f removes the rule).
   * Each push and finish must resolve before the next call.
   */
  async function createRender(source, opts = {}) {
    if (!source || !Number.isFinite(source.sampleRate) || source.sampleRate <= 0 ||
        !Number.isInteger(source.length) || source.length < 0 || source.numberOfChannels !== 1) {
      throw new TypeError('TF2Audio.createRender requires a mono source: { sampleRate, length, numberOfChannels: 1 }.');
    }
    // process()'s settings, resolved as it resolves them.
    const codecKey = Object.hasOwn(CODEC_PROFILES, opts.codec) ? opts.codec : 'steam';
    const codec = CODEC_PROFILES[codecKey];
    const engine = VOICE_ENGINE;
    const room = resolveRoom(opts, finiteOr(opts.seed, 0xC0FFEE) >>> 0);

    const codecRate    = codec.codecRate;
    const micGain      = clamp(finiteOr(opts.micGain, 1), 0, 20);
    const hp           = clamp(finiteOr(opts.hp, 0), 0, codecRate * 0.45);
    const lp           = clamp(finiteOr(opts.lp, codecRate / 2), 100, codecRate / 2);
    const bits         = clamp(finiteOr(opts.bits, 16), 2, 32);
    const lossPct      = clamp(finiteOr(opts.lossPct, 0), 0, 100);
    const jitterMs     = clamp(finiteOr(opts.jitterMs, 0), 0, 500);
    const enableCodec  = opts.enableWarble !== false;
    const autoGain     = opts.agc !== false;
    const gateSpec     = codec.senderGate || DEFAULT_SENDER_GATE;
    const gateOn       = opts.gate == null ? !!codec.senderGate : !!opts.gate;
    const gateDb       = gateThresholdDb(opts.gateThresholdDb, gateSpec.thresholdDb);
    const avgGain      = clamp(finiteOr(opts.avgGain, engine.autoGain.avgGain), 0, 2);
    const maxGain      = clamp(finiteOr(opts.maxGain, engine.autoGain.maxGain), 1, 100);
    const voiceScale   = clamp(finiteOr(opts.voiceScale, 1), 0, 4);
    const volume       = clamp(finiteOr(opts.volume, engine.volume), 0, 1);
    const rand         = mulberry32(finiteOr(opts.seed, 0xC0FFEE) >>> 0);
    const received     = opts.received && opts.received.frameLog ? opts.received : null;

    const srcRate = source.sampleRate, length = source.length;
    const deviceRate = deviceRateOf(opts.deviceRate);
    const frameMs = 20;
    const framesPerPacket = clamp(Math.round(finiteOr(opts.frameMs, frameMs) / frameMs), 1, 10);
    const report = (f) => { if (typeof opts.onProgress === 'function') opts.onProgress(f); };

    // What process() would do that is not streamed: the flat re-timing rule,
    // with a room or without (W3-02f removes the rule).
    if (opts.retime && enableCodec && !received) {
      throw new RangeError('TF2Audio.createRender does not stream talk-spurt re-timing yet (retime); use TF2Audio.process.');
    }

    // Each stage's whole length, as process()'s stages give them; the
    // output's is the source's duration at the device's rate.
    const codecLength = sincLength(length, srcRate, codecRate);
    const voiceLength = sincLength(codecLength, codecRate, codec.voiceRate);
    const outLength = Math.round(length * deviceRate / srcRate);

    /* ---- 1-2) Sender: resample to the codec rate; capture filters ---- */
    const stages = [sincStage(srcRate, codecRate, length)];
    if (hp > 10 && !received) stages.push(biquadStage(biquadCoefs('highpass', codecRate, hp, 0.707)));
    if (lp < codecRate * 0.45 && !received) {
      stages.push(biquadStage(biquadCoefs('lowpass', codecRate, lp, 0.707)), biquadStage(biquadCoefs('lowpass', codecRate, lp, 0.707)));
    }
    const captureEq = enableCodec && !received ? profileEq(codec, 'captureEq') : null;
    if (captureEq) stages.push(firStage(captureEq, codecLength));

    /* ---- 3) Gate, encode, lose packets, decode ---- */
    let voice = null, kind = null, coder = null, gate = null, gateOpts = null, bitrate = 0, packetBytes = 0, lead = 0;
    const steamPath = enableCodec && !received && codec.senderGate?.rule === 'steam';
    let steam = null;
    if (steamPath) {
      // Steam's sender and decoder through to the voice rate, the gain
      // included, as process() runs them: the same sender, stream, resampler,
      // gain and timeline, given the sound as it comes. The loss mask is drawn
      // a frame at a time in the sender's frame order (streamLossMask gives
      // buildLossMask's values). A sample is given out once no later packet
      // can reach it: past the open spurt's next packet, and a spurt not yet
      // opened starts at most a chunk and the pre-roll before the last sample
      // given to the sender.
      const { sender: SteamSender, swr } = steamModules();
      if (codecRate !== STEAM_RATE || codec.voiceRate !== STEAM_VOICE_RATE || codec.decoderEq) {
        throw new Error('The steam rule runs at 24000 Hz into a 44100 Hz voice rate, with no decoder EQ.');
      }
      const opus = await loadOpusModule();
      bitrate = Math.max(6000, Math.round(codec.bitrate * bits / 16));
      const settings = steamSenderOptions(opts, gateOn, finiteOr(opts.seed, 0xC0FFEE) >>> 0);
      const sender = SteamSender.createSender(settings.sender);
      voice = await opus.createSteamStream(bitrate, { application: codec.application, signal: codec.signal,
        runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
      const stream = voice;
      const nextMiss = streamLossMask(framesPerPacket, lossPct, rand, jitterMs);
      let frame = 0, given = 0, fed = 0;
      const miss = (f) => {
        if (f !== frame++) throw new Error(`createRender: frame ${f} reached the network out of order`);
        return nextMiss();
      };
      const resampler = opts.swrKernel !== undefined ? swr.createResampler({ kernel: opts.swrKernel }) : swr.createResampler();
      const timeline = steamTimeline({ voiceLength, codecLength, lookahead: stream.lookahead, resampler,
        gain: autoGain ? createGain({ avgGain, maxGain, scale: voiceScale }) : null,
        onDecoded: opts.onDecoded, onResampled: opts.onResampled });
      const feed = async (messages) => {
        for (const msg of messages) {
          timeline.add(msg, await stream.message(msg, miss));
          if ((++fed & 63) === 63) await microYield();
        }
      };
      steam = { sender, settings, resampler, timeline };
      stages.push({
        async push(x) {
          given += x.length;
          await feed(sender.push(steamCapture(x)));
          return timeline.take(steamGiveOut(given, timeline.cursor, steamReach(SteamSender.STEAM_SENDER), stream.lookahead, false));
        },
        async flush() {
          await feed(sender.finish());
          return timeline.take(voiceLength);
        }
      });
    } else if (enableCodec && !received) {
      const opus = await loadOpusModule();
      bitrate = Math.max(6000, Math.round(codec.bitrate * bits / 16));
      const codecFrameMs = codec.frameSize ? 1000 * codec.frameSize / codecRate : frameMs;
      // As process() passes the gate and roundTrip reads it.
      gateOpts = gateOn ? { thresholdDb: gateDb, prerollFrames: Math.round(gateSpec.prerollMs / codecFrameMs),
        holdFrames: Math.round(gateSpec.holdMs / codecFrameMs) } : null;
      gate = gateOpts ? { threshold: 10 ** (Number(gateOpts.thresholdDb) / 20),
        preroll: Math.max(0, Math.round(Number(gateOpts.prerollFrames) || 0)),
        hold: Math.max(0, Math.round(Number(gateOpts.holdFrames) || 0)) } : null;
      if (codec.engine === 'celt011') {
        kind = 'celt';
        packetBytes = Math.max(8, Math.round(codec.packetBytes * bits / 16));
        voice = await opus.createCeltStream(codecRate, { frameSize: codec.frameSize, complexity: codec.complexity, packetBytes, ...celtModeRate(codec) });
      } else if (codec.engine === 'speex') {
        kind = 'speex';
        voice = await opus.createSpeexStream(codecRate);
      } else if (codec.engine === 'vr12') {
        kind = 'vr12';
        voice = await opus.createVr12Stream(codecRate);
      } else {
        kind = 'opus';
        voice = await opus.createVoiceStream(codecRate, bitrate, { application: codec.application, signal: codec.signal,
          runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
      }
      if (autoGain) lead = gainLead(codec, voice.lookahead);
      coder = codecStage(voice, kind, codecLength, gate,
        count => buildLossMask(count, framesPerPacket, lossPct, rand, jitterMs), lead);
      stages.push(coder);
      const eq = profileEq(codec);
      if (eq) stages.push(firStage(eq, codecLength));
    }

    /* ---- 4) Receiver voice channel: auto-gain + int16 clamp ---- */
    if (steamPath) {
      // The gain ran on the decoded packets (steamTimeline).
      if (!autoGain) {
        stages.push(sampleStage((x) => {
          const y = new Float32Array(x);
          for (let i = 0; i < y.length; i++) y[i] *= voiceScale;
          return hardClip(y, INT16_FULL_SCALE);
        }));
      }
    } else if (autoGain) {
      // With a lead (the engine codecs) the codec stage gave the decoder's
      // stream from its first sample; the gain runs on it and the lead is
      // dropped after, as process() does.
      stages.push(sincStage(codecRate, codec.voiceRate, codecLength + lead));
      // decoded() as process() builds it. The codec stage fills its frame
      // log as it goes, and a frame is logged before any voice-rate sample
      // it makes reaches the gain (the stages between only wait).
      let decoded;
      if (received) {
        const info = receivedCodecInfo(received, codecRate);
        decoded = decodedFromFrames(info.frameLog, info.frameSamples, info.lookahead, codecRate, codec.voiceRate);
      } else if (coder && gate) {
        decoded = decodedFromFrames(coder.counts().frameLog, voice.frameSize, lead ? 0 : voice.lookahead, codecRate, codec.voiceRate);
      }
      const run = streamAutoGain({ avgGain, maxGain, scale: voiceScale, decoded });
      stages.push({ push: run, flush: run.flush });
      if (lead) stages.push(dropStage(lead));
    } else {
      stages.push(sincStage(codecRate, codec.voiceRate, codecLength));
      stages.push(sampleStage((x) => {
        const y = new Float32Array(x);
        for (let i = 0; i < y.length; i++) y[i] *= voiceScale;
        return hardClip(y, INT16_FULL_SCALE);
      }));
    }
    // The mix point, on every profile, as process() has it.
    if (typeof opts.onGain === 'function') stages.push(sampleStage((x) => { opts.onGain(x); return x; }));

    /* ---- 5-6) The mixer, mixOut and the device stage (W3-10) ---- */
    // process()'s stages, as they come: the entry and the upsampling (with a
    // room: createRoomMix, which keeps the voice's partial mixer block until
    // it is whole, and gives the tail at the end), the blocks, mixOut, the
    // device stage. With no room nothing waits for a block; the device stage
    // waits for one mix sample.
    const output = createOutputStage({ voiceRate: codec.voiceRate, volume, deviceRate, onMixBlock: opts.onMixBlock, room });
    stages.push(output);
    // Cut, or padded with zeros, to process()'s length; as floats over 32768.
    // With a room that length is known at the end (the tail's): until then
    // at most outLength samples are given out, and what the device stage
    // gives past them waits for finish(), which cuts or pads it to the tail.
    let emitted = 0;
    const over = [];
    const finalSamples = (y) => { emitted += y.length; return mixToFloat(y); };
    stages.push({
      push(y) {
        const keep = Math.max(0, Math.min(y.length, outLength - emitted));
        if (room && keep < y.length) over.push(y.slice(keep));
        return finalSamples(keep < y.length ? y.subarray(0, keep) : y);
      },
      flush() {
        const rest = new Int32Array(outLength + (room ? tailAtDevice(output.mix.tail(), deviceRate) : 0) - emitted);
        let at = 0;
        for (const y of over) { if (at >= rest.length) break; rest.set(y.subarray(0, rest.length - at), at); at += y.length; }
        return finalSamples(rest);
      }
    });

    async function through(k, x) {
      for (; k < stages.length; k++) x = await stages[k].push(x);
      return x;
    }

    let pushed = 0, state = 'open', busy = false;
    const release = () => { if (voice) voice.free(); voice = null; };
    async function guarded(run) {
      if (busy) throw new Error('TF2Audio.createRender: push() or finish() called before the previous call resolved.');
      if (state !== 'open') throw new Error(`TF2Audio.createRender: this render has ${state}.`);
      busy = true;
      try { return await run(); }
      catch (error) { if (state === 'open') state = 'failed'; throw error; }
      finally { busy = false; if (state !== 'open') release(); }
    }

    return {
      outputLength: outLength,
      maxTail: room ? tailAtDevice(roomModule().R.TAIL_CAP, deviceRate) : 0,
      sampleRate: deviceRate,
      push: (chunk) => guarded(async () => {
        if (pushed + chunk.length > length) {
          throw new RangeError(`TF2Audio.createRender: ${pushed + chunk.length} samples pushed to a ${length}-sample source.`);
        }
        /* ---- 1) Sender capture: capture gain, int16 clip ---- */
        const x = new Float32Array(chunk);
        for (let i = 0; i < x.length; i++) {
          if (!Number.isFinite(x[i])) throw new TypeError(`Source PCM contains a non-finite sample (at ${pushed + i}).`);
        }
        if (micGain !== 1 && !received) {
          for (let i = 0; i < x.length; i++) x[i] *= micGain;
        }
        pushed += x.length;
        const out = await through(0, hardClip(x, INT16_FULL_SCALE));
        if (length) report(pushed / length);
        return out;
      }),
      finish: () => guarded(async () => {
        if (pushed !== length) throw new RangeError(`TF2Audio.createRender: finish() after ${pushed} of ${length} samples.`);
        const parts = [];
        for (let k = 0; k < stages.length; k++) parts.push(await through(k + 1, await stages[k].flush()));
        let codecInfo = { backend: 'bypass', sampleRate: codecRate, frameMs };
        if (received) codecInfo = receivedCodecInfo(received, codecRate);
        else if (steam) {
          codecInfo = { ...steamCodecInfo(codec, voice, steam.timeline, steam.sender, steam.settings, steam.resampler, bitrate),
            framesPerPacket };
        } else if (coder) codecInfo = { ...codecResultInfo(kind, voice, codec, coder.counts(), gate, gateOpts, bitrate, packetBytes, codecRate), framesPerPacket };
        release();
        state = 'finished';
        report(1);
        return { samples: joinSamples(parts), realOpus: enableCodec,
          codecInfo: { ...codecInfo, codec: codecKey, autoGain, voiceRate: codec.voiceRate,
            ...(room ? { room: { ...room.info, tail: output.mix.tail() } } : {}) } };
      }),
      // During a push, the codec is released once that push has finished.
      free() { if (state === 'open') state = 'been freed'; if (!busy) release(); }
    };
  }

  // The info roundTrip, celtRoundTrip, speexRoundTrip and vr12RoundTrip return, from a
  // codec stage's counts and the settings process() gives them.
  function codecResultInfo(kind, voice, codec, counts, gate, gateOpts, bitrate, packetBytes, sampleRate) {
    const { lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames, spurts, encodedBytes, modes, frameLog, frameBytes } = counts;
    const gateInfo = { gate: gate ? Number(gateOpts.thresholdDb) : null, prerollFrames: gate ? gate.preroll : 0, holdFrames: gate ? gate.hold : 0 };
    const size = voice.frameSize;
    if (kind === 'celt') {
      return { backend: 'celt', version: voice.version, runtime: 'celt-0.11', sampleRate, bitrate: Math.round(packetBytes * 8 * sampleRate / size),
        application: 'celt', signal: 'auto', complexity: codec.complexity ?? 10, vbr: false, dtx: false,
        frameSamples: size, frameMs: 1000 * size / sampleRate, packetBytes, ...celtModeRate(codec),
        lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames: 0, spurts, ...gateInfo,
        encodedBytes, modes, plc: 'celt', frameLog, frameBytes };
    }
    if (kind === 'speex') {
      // The game's Speex 1.0.2 module on 11025 Hz sound; a lost frame plays as
      // zeros; wrappedSamples counts decoded samples that wrapped past full scale.
      return { backend: 'speex', version: voice.version, runtime: 'speex-1.0.2', sampleRate,
        bitrate: voice.bitrate, quality: voice.quality, application: 'speex', signal: 'auto', complexity: voice.complexity,
        vbr: false, dtx: false, enhancement: voice.enhancement, frameSamples: size, frameMs: 1000 * size / sampleRate,
        packetBytes: voice.packetBytes,
        lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames: 0, spurts, ...gateInfo,
        encodedBytes, modes, plc: 'zeros', wrappedSamples: voice.wrapped, frameLog, frameBytes };
    }
    if (kind === 'vr12') {
      // vaudio_miles's VR12 on 11025 Hz sound (not a TF2 codec); a lost frame
      // plays as zeros; resets counts each codec object's resets.
      return { backend: 'vr12', version: voice.version, runtime: 'voxware-vr12', sampleRate,
        bitrate: voice.bitrate, application: 'vr12', signal: 'auto',
        vbr: false, dtx: false, frameSamples: size, frameMs: 1000 * size / sampleRate,
        packetBytes: voice.packetBytes,
        lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames: 0, spurts, ...gateInfo,
        encodedBytes, modes, plc: 'zeros', resets: voice.resets, frameLog, frameBytes };
    }
    // Opus, with the defaults roundTrip and its encoder settings give.
    return { backend: 'libopus', version: voice.version, runtime: codec.encoder?.runtime ?? '1.6.1', sampleRate, bitrate,
      application: codec.application ?? 'voip', signal: codec.signal ?? 'auto', complexity: codec.encoder?.complexity ?? 10,
      vbr: !!codec.encoder?.vbr, dtx: !!codec.encoder?.dtx, frameSamples: size, frameMs: 20,
      lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames, spurts, ...gateInfo,
      encodedBytes, modes, plc: 'opus', frameLog, frameBytes };
  }

  /* ------------------------------------------------------------------ */
  /* Public surface                                                     */
  /* ------------------------------------------------------------------ */

  const TF2Audio = {
    process,
    encodeWav,
    toInt16,
    bufferToMono,
    // exposed for tests / tools
    resampleSinc,
    resampleLinear,
    firwin2,
    applyFirZeroPhase,
    hardClip,
    receiverAutoGain,
    createGain,
    decodedFromFrames,
    biquadCoefs,
    applyBiquad,
    mulberry32,
    buildLossMask,
    realOpusRoundTrip,
    createLiveChain,
    createRender,
    roomPreset,
    streamResampleSinc,
    streamFir,
    streamAutoGain,
    streamLossMask,
    steamGiveOut,
    // the mixer and the output stage (W3-10); a room's mix (W3-17c) calls
    // the first two, its entries checked against TF2Room.entry
    mixEntry,
    mixUpsample2,
    mixOut,
    mixClip,
    mixDevicePosition,
    createDeviceStage,
    createOutputStage
  };

  if (typeof window !== 'undefined') window.TF2Audio = TF2Audio;
  else if (typeof self !== 'undefined') self.TF2Audio = TF2Audio;
  else if (typeof globalThis !== 'undefined') globalThis.TF2Audio = TF2Audio;
  if (typeof module !== 'undefined' && module.exports) module.exports = TF2Audio;
})();
