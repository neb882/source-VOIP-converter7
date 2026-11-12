/* TF2 Voice Emulator, engine/dsp.js: signal arithmetic with nothing of the game in it: the seeded draw, the yield,
 * the FFT, the downmix, the resampler, the filters, the clip, 16-bit rounding and the WAV, each whole and a piece
 * at a time.
 *
 * One of the engine's files (the list and the load order are in audio.js's header), and the first: it makes
 * TF2Engine, the object the engine's files share, takes nothing and adds its own part. */
(function (root) {
  'use strict';
  const E = root.TF2Engine = {};

  /* ------------------------------------------------------------------ */
  /* Math helpers                                                       */
  /* ------------------------------------------------------------------ */

  const TAU = Math.PI * 2;
  const INT16_FULL_SCALE = 32767 / 32768;

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

  // Cooperative yield, so that the page or the worker can do other work
  // during a long render. On a page, a timer (a browser makes each nested
  // setTimeout(0) wait at least 4 ms). In a worker (W4-01b), a turn of a
  // MessageChannel: no 4 ms, yet a message waiting for the worker (a cancel)
  // is taken in before the render goes on. In bare JS contexts with no
  // timers (the Node test sandboxes), a resolved promise.
  const microYield = (() => {
    if (typeof WorkerGlobalScope !== 'undefined' && typeof MessageChannel === 'function') {
      const channel = new MessageChannel(), waiting = [];
      channel.port1.onmessage = () => { const next = waiting.shift(); if (next) next(); };
      return () => new Promise((resolve) => { waiting.push(resolve); channel.port2.postMessage(0); });
    }
    return typeof setTimeout === 'function' ? () => new Promise(r => setTimeout(r, 0)) : () => Promise.resolve();
  })();

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

  // How long streamResampleSinc(inRate, outRate) waits, in seconds: output i
  // needs the inputs up to (i x down + half) / up, half / up inputs past its
  // own time.
  function sincWait(inRate, outRate) {
    inRate = Math.round(inRate); outRate = Math.round(outRate);
    if (inRate === outRate) return 0;
    const g = gcd(inRate, outRate), up = outRate / g, down = inRate / g;
    return resampleKernel(up, down).half / up / inRate;
  }

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

  function joinSamples(parts) {
    if (parts.length === 1) return parts[0];
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) { out.set(p, offset); offset += p.length; }
    return out;
  }

  E.dsp = Object.freeze({
    INT16_FULL_SCALE, applyBiquad, applyFirZeroPhase, biquadCoefs, biquadStage, bufferToMono, clamp, dropStage,
    encodeWav, finiteOr, firStage, firwin2, gcd, hardClip, joinSamples, microYield, mulberry32, resampleLinear,
    resampleSinc, roundEven, sampleStage, sincLength, sincStage, sincWait, streamBiquad, streamFir,
    streamResampleSinc, toInt16
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
