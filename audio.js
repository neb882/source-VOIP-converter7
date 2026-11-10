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
 *           44.1 kHz mixer (room DSP) -> output stage -> output rate
 *
 * The Steam profile, voice gate and receiver path are identified from 2026
 * voice_loopback recordings of music, speech and a calibrated test signal,
 * and from Steam's own voice packets in a SourceTV demo
 * (tests/REFERENCE_2026.md). Room processors are effects built from Valve's
 * preset data, not Valve's implementations.
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

  // Deterministic hash -> [0,1). Used for comb detuning in the room DSP.
  function hash01(a, b, c) {
    const s = Math.sin(a * 12.9898 + b * 78.233 + (c || 0) * 37.719) * 43758.5453;
    return s - Math.floor(s);
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

  // Source's software mixer converts voice to the mix rate by linear
  // interpolation; used for the low-rate legacy profiles. Nothing in gives
  // nothing out, as resampleSinc.
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

  function softLimit(samples, threshold = 0.85) {
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i];
      if (Math.abs(x) <= threshold) out[i] = x;
      else {
        const sign = x < 0 ? -1 : 1;
        const over = (Math.abs(x) - threshold) / (1 - threshold);
        out[i] = sign * (threshold + (1 - threshold) * Math.tanh(over));
      }
    }
    return out;
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
  // gain asks, so a stream may fill it as it goes.
  function decodedFromFrames(frameLog, frameSamples, lookahead, codecRate, voiceRate) {
    return (m) => {
      const f = Math.floor((Math.floor(m * codecRate / voiceRate) + lookahead) / frameSamples);
      return f >= 0 && f < frameLog.length && frameLog[f] !== 0;
    };
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

  /* ==================================================================== */
  /* SOURCE ENGINE DSP PROCESSORS                                         */
  /*                                                                      */
  /* The engine's dsp_room is not a convolution reverb — it's a serial    */
  /* chain of small IIR processors. These implement the ones the room     */
  /* presets use, with parameters transcribed from dsp_presets.txt into   */
  /* constants.js: DFR (series allpass diffusor), RVA (parallel feedback  */
  /* combs, low-passed and optionally modulated), DLY (low-passed echo),  */
  /* AMP (tremolo/distortion), MDY (modulated delay).                     */
  /* ==================================================================== */

  const DFR_BASE_MS = [13.7, 21.3, 29.1, 40.9];

  function dspDFR(x, rate, p) {
    const n = clamp(Math.round(p.ndly) || 2, 1, 4);
    const g = clamp(p.fb != null ? p.fb : 0.15, 0, 0.9);
    const size = p.size != null ? p.size : 1.0;
    let cur = x;
    for (let i = 0; i < n; i++) {
      const D = Math.max(1, Math.round(DFR_BASE_MS[i] * size * rate / 1000));
      const out = new Float32Array(cur.length);
      const buf = new Float32Array(D);
      let w = 0;
      for (let t = 0; t < cur.length; t++) {
        const vd = buf[w];
        const v = cur[t] + g * vd;
        out[t] = vd - g * v;
        buf[w] = v;
        w = (w + 1) % D;
      }
      cur = out;
    }
    return cur;
  }

  async function dspRVA(x, rate, p) {
    const n = clamp(Math.round(p.ndly) || 1, 1, 12);
    const fb = clamp(p.fb || 0, 0, 0.97);
    const gain = p.gain != null ? p.gain : 1.0;
    const lpA = p.cutoff > 0 ? Math.exp(-TAU * p.cutoff / rate) : 0;
    const fpar = p.fpar !== 0;
    const modSamp = (p.fmod || 0) * rate / 1000;
    const modHz = p.rate || 0;
    // Normalise each comb to unity *average* power (not unity peak), so the
    // preset gains behave like Valve's "0 dB in = 0 dB out" convention.
    const combScale = Math.sqrt(Math.max(0.06, 1 - fb * fb));

    const out = new Float32Array(x.length);
    for (let c = 0; c < n; c++) {
      // spread comb delays sizeMin..sizeMax with a deterministic detune
      const frac = n === 1 ? 1 : c / (n - 1);
      const hiMs = p.sizeMax != null ? p.sizeMax : 50;
      const loMs = p.sizeMin != null ? Math.min(p.sizeMin, hiMs) : hiMs;
      let dMs = loMs + (hiMs - loMs) * frac;
      dMs *= 1 + 0.017 * (hash01(c, 7, 3) - 0.5);
      const D = Math.max(2, Math.round(dMs * rate / 1000));
      const bufSize = D + Math.ceil(modSamp) + 4;
      const buf = new Float32Array(bufSize);
      let w = 0, lpState = 0;
      const phase = TAU * hash01(c, 13, 1);

      for (let t = 0; t < x.length; t++) {
        // modulated fractional delay read
        let Dt = D;
        if (modSamp > 0 && modHz > 0) {
          Dt = D + modSamp * Math.sin(TAU * modHz * t / rate + phase);
          if (Dt < 1) Dt = 1;
        }
        const rp = w - Dt;
        const ri = Math.floor(rp);
        const rf = rp - ri;
        const i0 = ((ri % bufSize) + bufSize) % bufSize;
        const i1 = (i0 + 1) % bufSize;
        let dl = buf[i0] * (1 - rf) + buf[i1] * rf;
        if (fpar && lpA > 0) {                    // low-pass inside the loop
          lpState = lpState * lpA + dl * (1 - lpA);
          dl = lpState;
        }
        const y = x[t] + fb * dl;
        buf[w] = y;
        w = (w + 1) % bufSize;
        out[t] += y * combScale;
      }
      await microYield();               // one yield per comb keeps UI alive
    }
    const sc = gain / Math.sqrt(n);
    for (let t = 0; t < out.length; t++) out[t] *= sc;
    if (!fpar && p.cutoff > 0) {                  // filter on the summed output
      const a = Math.exp(-TAU * p.cutoff / rate);
      let s = 0;
      for (let t = 0; t < out.length; t++) { s = s * a + out[t] * (1 - a); out[t] = s; }
    }
    return out;
  }

  function dspDLY(x, rate, p) {
    const D = Math.max(1, Math.round((p.delay || 100) * rate / 1000));
    const fb = clamp(p.fb || 0, 0, 0.95);
    const gain = p.gain != null ? p.gain : 1.0;
    const lpA = p.cutoff > 0 ? Math.exp(-TAU * p.cutoff / rate) : 0;
    const out = new Float32Array(x.length);
    const buf = new Float32Array(D);
    let w = 0, lpState = 0;
    for (let t = 0; t < x.length; t++) {
      let dl = buf[w];
      if (lpA > 0) { lpState = lpState * lpA + dl * (1 - lpA); dl = lpState; }
      const e = x[t] + fb * dl;
      buf[w] = e;
      w = (w + 1) % D;
      out[t] = gain * e;
    }
    return out;
  }

  function dspAMP(x, rate, p) {
    const gain = p.gain != null ? p.gain : 1.0;
    const out = new Float32Array(x.length);
    const modrate = p.modrate || 0;
    const depth = p.moddepth || 0;
    const glideA = Math.exp(-1 / (Math.max(1, p.modglide || 10) / 1000 * rate));
    const interval = modrate > 0 ? Math.max(1, Math.round(rate / modrate)) : 0;
    let cur = gain, target = gain, phaseHigh = true;

    const vthresh = p.vthresh || 0;
    const distmix = p.distmix || 0;

    for (let t = 0; t < x.length; t++) {
      if (interval > 0 && t % interval === 0) {
        phaseHigh = !phaseHigh;                   // alternate gain / gain*(1-depth)
        target = phaseHigh ? gain : gain * (1 - depth);
      }
      cur = cur * glideA + target * (1 - glideA);
      let y = x[t] * cur;
      if (distmix > 0 && vthresh > 0 && vthresh < 1) {
        const clipped = clamp(y, -vthresh, vthresh) / vthresh;
        y = y * (1 - distmix) + clipped * distmix;
      }
      out[t] = y;
    }
    return out;
  }

  function dspMDY(x, rate, p) {
    const D = Math.max(2, Math.round((p.delay || 100) * rate / 1000));
    const fb = clamp(p.fb || 0, 0, 0.95);
    const gain = p.gain != null ? p.gain : 1.0;
    const depthSamp = D * (p.moddepth || 0);
    const modHz = p.modrate || 0;
    const bufSize = D + Math.ceil(depthSamp) + 4;
    const out = new Float32Array(x.length);
    const buf = new Float32Array(bufSize);
    let w = 0;
    for (let t = 0; t < x.length; t++) {
      let Dt = D;
      if (depthSamp > 0 && modHz > 0) {
        Dt = D - depthSamp * 0.5 * (1 + Math.sin(TAU * modHz * t / rate));
        if (Dt < 1) Dt = 1;
      }
      const rp = w - Dt;
      const ri = Math.floor(rp);
      const rf = rp - ri;
      const i0 = ((ri % bufSize) + bufSize) % bufSize;
      const i1 = (i0 + 1) % bufSize;
      const dl = buf[i0] * (1 - rf) + buf[i1] * rf;
      const e = x[t] + fb * dl;
      buf[w] = e;
      w = (w + 1) % bufSize;
      out[t] = gain * e;
    }
    return out;
  }

  // Map the emulator's custom knobs (duration s, decay, mix) onto an RVA.
  function customChain(env) {
    const duration = Math.max(0.05, env.duration != null ? env.duration : 1.5);
    const decay = Math.max(0.5, env.decay != null ? env.decay : 3.0);
    const fb = clamp(Math.pow(0.001, 0.045 / duration), 0.3, 0.97); // T60 ≈ duration
    const cutoff = clamp(9000 / decay, 800, 12000);
    return [
      { type: 'dfr', size: 1.0, ndly: 2, fb: 0.15 },
      { type: 'rva', sizeMax: clamp(duration * 60, 25, 220), sizeMin: 12,
        ndly: 5, fb, gain: 1.2, cutoff, fpar: 1, fmod: 0, rate: 0 }
    ];
  }

  /**
   * Run a preset's processor chain and crossfade with the dry signal
   * (Source crossfades dsp output by `mix`). Renders extra tail and trims
   * trailing silence below -66 dBFS.
   */
  async function runDspChain(x, rate, chain, mix) {
    if (!chain || !chain.length || mix <= 0) return x;
    const tail = Math.min(4 * rate, 6 * rate);
    let wet = new Float32Array(x.length + tail);
    wet.set(x);
    for (const p of chain) {
      if (p.type === 'dfr') wet = dspDFR(wet, rate, p);
      else if (p.type === 'rva') wet = await dspRVA(wet, rate, p);
      else if (p.type === 'dly') wet = dspDLY(wet, rate, p);
      else if (p.type === 'amp') wet = dspAMP(wet, rate, p);
      else if (p.type === 'mdy') wet = dspMDY(wet, rate, p);
      await microYield();
    }
    const m = clamp(mix, 0, 1);
    // The diffusor decorrelates wet from dry, so the crossfade adds
    // incoherently; normalise so the blend stays near 0 dB overall.
    const norm = 1 / Math.sqrt((1 - m) * (1 - m) + m * m);
    const out = new Float32Array(wet.length);
    for (let i = 0; i < wet.length; i++) {
      out[i] = ((i < x.length ? x[i] * (1 - m) : 0) + wet[i] * m) * norm;
    }
    // trim trailing silence
    const thr = 0.0005;
    let end = out.length - 1;
    while (end > x.length && Math.abs(out[end]) < thr) end--;
    return out.slice(0, Math.min(out.length, end + 1 + Math.round(0.15 * rate)));
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

  function resolveRoom(opts) {
    let dspId = 0;
    if (opts.listenerPos && LISTENER_POSITIONS[opts.listenerPos]) {
      dspId = LISTENER_POSITIONS[opts.listenerPos].dsp;
    } else if (opts.dspRoom != null && DSP_PRESETS[opts.dspRoom]) {
      dspId = opts.dspRoom;
    }
    const preset = DSP_PRESETS[dspId] || DSP_PRESETS[0];
    if (!preset.custom) return { chain: preset.chain || [], mix: preset.mix || 0 };
    const supplied = opts.customEnv || {};
    const env = {
      duration: clamp(finiteOr(supplied.duration, finiteOr(preset.duration, 1.5)), 0.05, 6),
      decay: clamp(finiteOr(supplied.decay, finiteOr(preset.decay, 3)), 0.5, 8),
      mix: clamp(finiteOr(supplied.mix, finiteOr(preset.mix, 0.25)), 0, 1)
    };
    return { chain: customChain(env), mix: env.mix };
  }

  // opus-codec.mjs FRAME: what happened to each codec frame.
  const FRAME_CODES = { gated: 0, silk: 1, hybrid: 2, celt: 3, dtx: 4, lost: 5, late: 6, speex: 7 };

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
  //     belongs;
  //   - any other packet is moved: laid whole from given, the cursor
  //     following it (moved() counts them; cfg.onMove(from, to) is told the
  //     cursor as it stood and given). The gain has already run on it, as in
  //     a render: a move changes only where the packet lands.
  // The frame log marks only slots at or after given (those before are
  // final). A render passes no given and keeps the fixed log and the throw.
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
    function mark(blocks, n, at, floor) {
      const F = blocks.length;
      if (growing) room(at + n);
      for (let j = 0; j < F; j++) {
        const a = at + Math.round(j * n / F), b = at + Math.round((j + 1) * n / F);
        let i = Math.max(0, Math.floor((a * STEAM_RATE / STEAM_VOICE_RATE + lookahead) / STEAM_FRAME - 0.5) - 1);
        for (; i < slots; i++) {
          const c = centre(i);
          if (c >= b) break;
          if (c >= a && !(c < floor)) { frameLog[i] = blocks[j].code; frameBytes[i] = blocks[j].bytes; frameMode[i] = blocks[j].mode; }
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
            if (given !== undefined && at < given) {
              if (opening) dropped += Math.max(0, Math.min(at + y.length, given) - Math.max(at, 0));
              else {
                cfg.onMove?.(at, given);
                moved++;
                at = given;
                spans.push([at, at]);
              }
            }
            lay(y, at, given);
            mark(made.blocks, y.length, at, given);
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
   *   listenerPos:  key of LISTENER_POSITIONS. Overrides dspRoom.
   *   dspRoom:      numeric id into DSP_PRESETS (when listenerPos absent)
   *   customEnv:    { duration, decay, mix } override for DSP_PRESETS[99]
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
   *                 over a capture chunk in dBFS, null for Steam's own (-40)
   *   steamUptime:  `steam` only: seconds the sender's Steam had been running,
   *                 0 to 4,000,000; its float clock sets the hold's real
   *                 length (W3-16). null for the sender's own   [777600]
   *   onDecoded, onResampled, onGain, swrKernel: tests only, `steam` only:
   *                 each message's 16-bit samples as given to the
   *                 resampler; each packet() result; the voice-rate signal
   *                 after the gain; a resampler kernel in place of the
   *                 module's default
   *   agc:          receiver auto-gain (false = unity gain)             [true]
   *   retime:       TF2's early talk-spurt starts (finding 19)          [false]
   *   avgGain:      voice_avggain, mean (0) to peak (1) normalization   [0.5]
   *   maxGain:      voice_maxgain gain cap                              [10]
   *   voiceScale:   voice_scale, applied inside the auto-gain           [1]
   *   volume:       output level after the mixer                        [0.5]
   *   seed:         PRNG seed for the loss pattern / crackle        [0xC0FFEE]
   *   received:     the source is voice as the game received it, already
   *                 through a sender and the codec (a demo's packets,
   *                 demo.js): { frameLog, frameBytes, frameMs, spurts,
   *                 concealed, version }. Only the receiver runs; sender,
   *                 gate, codec and network settings are ignored.      [null]
   * }
   *
   * Resolves to { samples: Float32Array, sampleRate, blob, codecInfo }
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
    const room = resolveRoom(opts);
    const listenerCfg = opts.listenerPos ? LISTENER_POSITIONS[opts.listenerPos] : null;

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
    const mixRate = engine.mixRate;
    const playbackRate = Math.max(mixRate, Math.round(srcRate));
    const frameMs = 20;
    const framesPerPacket = clamp(Math.round(finiteOr(opts.frameMs, frameMs) / frameMs), 1, 10);
    const report = (f) => { if (typeof opts.onProgress === 'function') opts.onProgress(f); };

    /* ---- 1) Sender capture: downmix, capture gain, int16 clip ---- */
    let samples = bufferToMono(audioBuffer, captureChannel);
    if (!samples.every(Number.isFinite)) throw new TypeError('Source PCM contains a non-finite sample.');
    const playbackLength = Math.round(samples.length * playbackRate / srcRate);
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
    let steamVoice = null;
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
      // The codec's own frame length: 20 ms for Opus, frameSize for CELT and Speex.
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
        : await opus.roundTrip(samples, codecRate, bitrate, { ...common,
          application: codec.application, signal: codec.signal,
          runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
      samples = result.samples;
      codecInfo = { ...result.info, framesPerPacket };
      const eq = profileEq(codec);
      if (eq) samples = applyFirZeroPhase(samples, eq);
      // The receiver's re-timing, from its own seed so loss patterns stay put.
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
      opts.onGain?.(samples);
    } else if (autoGain) {
      samples = resampleSinc(samples, codecRate, codec.voiceRate);
      // With the gate on, the gain knows which blocks were decoded; with
      // no gate (or the codec bypassed) every block was.
      const decoded = received || (enableCodec && gateOn)
        ? decodedFromFrames(codecInfo.frameLog, codecInfo.frameSamples, codecInfo.lookahead || 0, codecRate, codec.voiceRate) : undefined;
      samples = receiverAutoGain(samples, { avgGain, maxGain, scale: voiceScale, decoded });
    } else {
      samples = resampleSinc(samples, codecRate, codec.voiceRate);
      for (let i = 0; i < samples.length; i++) samples[i] *= voiceScale;
      samples = hardClip(samples, INT16_FULL_SCALE);
    }

    /* ---- 5) Mixer at 44.1 kHz: rate conversion, room DSP, output ---- */
    samples = codec.mixer === 'linear'
      ? resampleLinear(samples, codec.voiceRate, mixRate)
      : resampleSinc(samples, codec.voiceRate, mixRate);
    const dryMixLength = samples.length;
    report(0.8);
    await microYield();
    if (listenerCfg && listenerCfg.extraLpf) {
      samples = applyBiquad(samples, biquadCoefs('lowpass', mixRate, listenerCfg.extraLpf, 0.8));
    }
    samples = await runDspChain(samples, mixRate, room.chain, room.mix);
    if (engine.outputFir) samples = applyFirZeroPhase(samples, engine.outputFir);
    if (volume !== 1) {
      for (let i = 0; i < samples.length; i++) samples[i] *= volume;
    }
    report(0.9);
    await microYield();

    /* ---- 6) Output rate; keep every source frame plus any room tail ---- */
    const tail = Math.max(0, Math.round((samples.length - dryMixLength) * playbackRate / mixRate));
    samples = resampleSinc(samples, mixRate, playbackRate);
    const outLength = playbackLength + tail;
    if (samples.length !== outLength) {
      const aligned = new Float32Array(outLength);
      aligned.set(samples.subarray(0, outLength));
      samples = aligned;
    }
    samples = softLimit(samples, 0.98);
    for (let i = 0; i < samples.length; i++) {
      if (!Number.isFinite(samples[i])) throw new Error(`DSP produced a non-finite sample at index ${i}.`);
    }

    const blob = encodeWav(samples, playbackRate);
    report(1);
    return { samples, sampleRate: playbackRate, blob, realOpus: enableCodec,
      codecInfo: { ...codecInfo, codec: codecKey, autoGain, voiceRate: codec.voiceRate } };
  }

  /* ------------------------------------------------------------------ */
  /* WAV encoder (16-bit PCM mono)                                      */
  /* ------------------------------------------------------------------ */

  // Float samples to 16-bit PCM, the conversion every download format uses.
  function toInt16(samples) {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = clamp(samples[i], -1, 1);
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
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
  /* frames back for its pre-roll (120 ms), as the sender must. Rooms   */
  /* (dsp_room) are not applied.                                        */
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

  // resampleLinear, a block at a time.
  function streamResampleLinear(inRate, outRate) {
    if (inRate === outRate) return (x) => x;
    const ratio = inRate / outRate;
    let buf = new Float32Array(0), start = 0, total = 0, next = 0;
    return (x) => {
      const merged = new Float32Array(buf.length + x.length);
      merged.set(buf); merged.set(x, buf.length);
      buf = merged; total += x.length;
      const out = [];
      for (;;) {
        const pos = next * ratio, i0 = pos | 0;
        if (i0 + 1 > total - 1) break;
        const frac = pos - i0;
        out.push(buf[i0 - start] * (1 - frac) + buf[i0 + 1 - start] * frac);
        next++;
      }
      const keep = Math.floor(next * ratio);
      if (keep > start) { buf = buf.slice(keep - start); start = keep; }
      return Float32Array.from(out);
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
      framesPerPacket, rand, mixStages } = c;
    const { sender: SteamSender, swr } = steamModules();
    if (codec.codecRate !== STEAM_RATE || codec.voiceRate !== STEAM_VOICE_RATE || codec.decoderEq) {
      throw new Error('The steam rule runs at 24000 Hz into a 44100 Hz voice rate, with no decoder EQ.');
    }
    const S = SteamSender.STEAM_SENDER, engine = VOICE_ENGINE, mixRate = engine.mixRate;
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
    // behind the input's. Here only the causal stages after the mix point
    // shift it (the output FIR, run causally; a render runs it zero-phase):
    // the capture FIR's delay is dropped, the lookahead is trimmed where
    // packets are laid, and the reach only holds samples back. latencyMs is
    // that and every hold-back: the resamplers' waits (to 24 kHz, Steam's
    // resampler's 16 inputs, the mixer's and the context's), the capture
    // FIR's dropped delay, the reach and the lookahead.
    const firDelay = (taps) => (taps ? (taps.length - 1) / 2 : 0);
    const contentSeconds = firDelay(engine.outputFir) / mixRate;
    const contentDelay = Math.round(contentSeconds * ioRate);
    const holdBack = (r) => sincWait(ioRate, STEAM_RATE) + (firDelay(captureEq) + r + lookahead + swr.TAPS / 2) / STEAM_RATE
      + sincWait(STEAM_VOICE_RATE, mixRate) + sincWait(mixRate, ioRate);
    const latencyMs = (r) => 1000 * (contentDelay / ioRate + holdBack(r));

    let talking = true, pushed = 0, given = 0, slot = 0;
    const one = new Int16Array(1), codes = [];
    const stats = { codec: codecKey, frames: 0, sent: 0, modes: { silk: 0, hybrid: 0, celt: 0, speex: 0 }, dtx: 0, lost: 0, late: 0,
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
      // The key up (the app's stand-in): zeros in place of the microphone.
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
    const listenerCfg = opts.listenerPos ? LISTENER_POSITIONS[opts.listenerPos] : null;
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
    const mixRate = engine.mixRate;

    // The mix point, a stage boundary (opts.onGain, a test hook, sees the
    // voice-rate signal there as a render's does), and the stages after it:
    // the mixer's rate, the listener's low-pass, the output FIR, the volume,
    // the context's rate, the limiter.
    const mixStages = () => {
      const stages = [];
      if (typeof opts.onGain === 'function') stages.push((x) => { opts.onGain(x); return x; });
      stages.push(codec.mixer === 'linear' ? streamResampleLinear(codec.voiceRate, mixRate) : streamResampleSinc(codec.voiceRate, mixRate));
      if (listenerCfg && listenerCfg.extraLpf) stages.push(streamBiquad(biquadCoefs('lowpass', mixRate, listenerCfg.extraLpf, 0.8)));
      if (engine.outputFir) stages.push(streamFir(engine.outputFir));
      stages.push((x) => { if (volume !== 1) for (let i = 0; i < x.length; i++) x[i] *= volume; return x; });
      stages.push(streamResampleSinc(mixRate, ioRate));
      stages.push((x) => softLimit(x, 0.98));
      return stages;
    };

    // The `steam` profile with the codec on runs the render's own stages.
    if (enableCodec && codec.senderGate?.rule === 'steam') {
      return steamLiveChain({ opts, ioRate, codecKey, codec, micGain, hp, lp, bits, lossPct, jitterMs, autoGain, gateOn,
        avgGain, maxGain, voiceScale, framesPerPacket, rand, mixStages });
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
        : await opus.createVoiceStream(codecRate, Math.max(6000, Math.round(codec.bitrate * bits / 16)), {
          application: codec.application, signal: codec.signal,
          runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
    }
    // 20 ms for Opus; CELT and Speex have their own frame (23.2 ms for vaudio_celt, 14.51 ms for vaudio_speex).
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
    // rate, the output FIR at the mix rate), which a render applies
    // zero-phase, and the Opus lookahead, which a render trims. The pre-roll
    // only holds output back; it does not shift it.
    const firDelay = (taps) => (taps ? (taps.length - 1) / 2 : 0);
    const delaySeconds = (firDelay(captureEq) + firDelay(decoderEq) + (voice ? voice.lookahead : 0)) / codecRate + firDelay(engine.outputFir) / mixRate;
    const contentDelay = Math.round(delaySeconds * ioRate);
    const stats = { codec: codecKey, frames: 0, sent: 0, modes: { silk: 0, hybrid: 0, celt: 0, speex: 0 }, dtx: 0, lost: 0, late: 0,
      bytes: 0, gateOpen: false, lastMode: null, inputPeak: 0, outputPeak: 0, spurts: 0, talking,
      latencyMs: 1000 * (preroll * frameSeconds + delaySeconds) };

    async function codecFrame(frame, sent) {
      stats.frames++;
      recordSent(sent);
      if (!voice) { stats.gateOpen = sent; codes.push(sent ? 2 : 0); return sent ? frame : new Float32Array(frame.length); }
      if (!sent) { open = false; stats.gateOpen = false; codes.push(0); return new Float32Array(frameSize); }
      if (!open) {
        if (spurts > 0) await voice.restart();
        spurts++;
        stats.spurts = spurts;
        open = true;
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
      // Speex reports its own bitrate (11025 bit/s), whatever snd_bits says.
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
  /* roundTrip does; the loss mask is drawn once over all frames.       */
  /* Rooms and talk-spurt re-timing are not streamed yet.               */
  /* ------------------------------------------------------------------ */

  const NO_SAMPLES = new Float32Array(0);
  const passStage = { push: (x) => x, flush: () => NO_SAMPLES };

  // The lengths resampleSinc and resampleLinear give.
  function sincLength(n, inRate, outRate) {
    inRate = Math.round(inRate); outRate = Math.round(outRate);
    if (!n || inRate === outRate) return n;
    const g = gcd(inRate, outRate);
    return Math.max(1, Math.round(n * (outRate / g) / (inRate / g)));
  }
  const linearLength = (n, inRate, outRate) => (!n || inRate === outRate ? n : Math.max(1, Math.round(n / (inRate / outRate))));

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

  // resampleLinear of an inLength-sample signal, ending as it ends: the last
  // outputs lean on the last input, not on zeros past it. An empty signal
  // gives none (outLength 0).
  function linearStage(inRate, outRate, inLength) {
    if (inRate === outRate) return passStage;
    const ratio = inRate / outRate, last = inLength - 1, outLength = linearLength(inLength, inRate, outRate);
    let buf = NO_SAMPLES, start = 0, total = 0, next = 0;
    const run = () => {
      const out = [];
      for (; next < outLength; next++) {
        const pos = next * ratio, i0 = Math.min(last, pos | 0), i1 = Math.min(last, i0 + 1);
        if (i1 >= total) break;
        const frac = pos - (pos | 0);
        out.push(buf[i0 - start] * (1 - frac) + buf[i1 - start] * frac);
      }
      const keep = Math.max(start, Math.min(last, (next * ratio) | 0));
      if (keep > start) { buf = buf.slice(keep - start); start = keep; }
      return Float32Array.from(out);
    };
    return {
      push(x) {
        const merged = new Float32Array(buf.length + x.length);
        merged.set(buf); merged.set(x, buf.length);
        buf = merged; total += x.length;
        return run();
      },
      flush: run
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
  const sampleStage = (f) => ({ push: f, flush: () => NO_SAMPLES });

  // The voice gate and the codec a frame at a time, as roundTrip,
  // celtRoundTrip and speexRoundTrip run them over a length-sample signal at
  // the codec rate. Frame f is final once frame f + preroll is measured (no
  // later frame's pre-roll reaches it), so the input held is a few frames.
  // Decoded frame f lands at f * size - lookahead; gated and late frames
  // leave zeros. kind: 'opus' | 'celt' | 'speex'.
  function codecStage(voice, kind, length, gate, makeLossMask) {
    const size = voice.frameSize, lookahead = voice.lookahead;
    const frames = Math.ceil((length + lookahead) / size);
    const lossMask = makeLossMask(frames);
    const frameLog = new Uint8Array(frames), frameBytes = new Uint16Array(frames);
    const modes = kind === 'speex' ? { silk: 0, hybrid: 0, celt: 0, speex: 0 } : { silk: 0, hybrid: 0, celt: 0 };
    const preroll = gate ? gate.preroll : 0, hold = gate ? gate.hold : 0, input = new Float32Array(size);
    let encodedBytes = 0, lostFrames = 0, underrunFrames = 0, gatedFrames = 0, dtxFrames = 0, spurts = 0, open = false;
    let held = new Float32Array(8 * size), heldStart = 0, heldLength = 0, received = 0;
    let measured = 0, loudest = -Infinity, next = 0;

    async function code(f) {
      const dest = f * size - lookahead, begin = Math.max(0, -dest), span = Math.max(0, Math.min(size, length - dest) - begin);
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
      // The counts roundTrip, celtRoundTrip and speexRoundTrip report.
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
   * { outputLength, sampleRate, push(chunk), finish(), free() }:
   *   push(chunk)  float PCM of the source in order, any size; resolves to
   *                the output samples that became final (maybe none)
   *   finish()     after exactly `length` samples were pushed; resolves to
   *                { samples, codecInfo, realOpus }, samples the rest of
   *                the output
   *   free()       releases the codec (finish() does too)
   * Concatenated, the output is process()'s samples and codecInfo is its
   * codecInfo; steamUptime is taken as process() takes it. A room (dspRoom,
   * listenerPos, customEnv) and retime are rejected with a RangeError: not
   * streamed yet. Each push and finish must resolve before the next call.
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
    const room = resolveRoom(opts);
    const listenerCfg = opts.listenerPos ? LISTENER_POSITIONS[opts.listenerPos] : null;

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
    const mixRate = engine.mixRate;
    const playbackRate = Math.max(mixRate, Math.round(srcRate));
    const frameMs = 20;
    const framesPerPacket = clamp(Math.round(finiteOr(opts.frameMs, frameMs) / frameMs), 1, 10);
    const report = (f) => { if (typeof opts.onProgress === 'function') opts.onProgress(f); };

    // What process() would do that is not streamed yet. A room setting that
    // resolves to no effect (dsp_room 1, a custom room at mix 0) streams.
    if (room.chain && room.chain.length && room.mix > 0) {
      const setting = opts.listenerPos && LISTENER_POSITIONS[opts.listenerPos] ? `listenerPos "${opts.listenerPos}"` : `dspRoom ${opts.dspRoom}`;
      throw new RangeError(`TF2Audio.createRender does not stream a room yet (${setting}); use TF2Audio.process.`);
    }
    if (opts.retime && enableCodec && !received) {
      throw new RangeError('TF2Audio.createRender does not stream talk-spurt re-timing yet (retime); use TF2Audio.process.');
    }

    // Each stage's whole length, as process()'s stages give them.
    const codecLength = sincLength(length, srcRate, codecRate);
    const voiceLength = sincLength(codecLength, codecRate, codec.voiceRate);
    const mixLength = codec.mixer === 'linear' ? linearLength(voiceLength, codec.voiceRate, mixRate)
      : sincLength(voiceLength, codec.voiceRate, mixRate);
    const outLength = Math.round(length * playbackRate / srcRate);

    /* ---- 1-2) Sender: resample to the codec rate; capture filters ---- */
    const stages = [sincStage(srcRate, codecRate, length)];
    if (hp > 10 && !received) stages.push(biquadStage(biquadCoefs('highpass', codecRate, hp, 0.707)));
    if (lp < codecRate * 0.45 && !received) {
      stages.push(biquadStage(biquadCoefs('lowpass', codecRate, lp, 0.707)), biquadStage(biquadCoefs('lowpass', codecRate, lp, 0.707)));
    }
    const captureEq = enableCodec && !received ? profileEq(codec, 'captureEq') : null;
    if (captureEq) stages.push(firStage(captureEq, codecLength));

    /* ---- 3) Gate, encode, lose packets, decode ---- */
    let voice = null, kind = null, coder = null, gate = null, gateOpts = null, bitrate = 0, packetBytes = 0;
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
      } else {
        kind = 'opus';
        voice = await opus.createVoiceStream(codecRate, bitrate, { application: codec.application, signal: codec.signal,
          runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
      }
      coder = codecStage(voice, kind, codecLength, gate,
        count => buildLossMask(count, framesPerPacket, lossPct, rand, jitterMs));
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
      if (typeof opts.onGain === 'function') stages.push(sampleStage((x) => { opts.onGain(x); return x; }));
    } else if (autoGain) {
      stages.push(sincStage(codecRate, codec.voiceRate, codecLength));
      // decoded() as process() builds it. The codec stage fills its frame
      // log as it goes, and a frame is logged before any voice-rate sample
      // it makes reaches the gain (the stages between only wait).
      let decoded;
      if (received) {
        const info = receivedCodecInfo(received, codecRate);
        decoded = decodedFromFrames(info.frameLog, info.frameSamples, info.lookahead, codecRate, codec.voiceRate);
      } else if (coder && gate) {
        decoded = decodedFromFrames(coder.counts().frameLog, voice.frameSize, voice.lookahead, codecRate, codec.voiceRate);
      }
      const run = streamAutoGain({ avgGain, maxGain, scale: voiceScale, decoded });
      stages.push({ push: run, flush: run.flush });
    } else {
      stages.push(sincStage(codecRate, codec.voiceRate, codecLength));
      stages.push(sampleStage((x) => {
        const y = new Float32Array(x);
        for (let i = 0; i < y.length; i++) y[i] *= voiceScale;
        return hardClip(y, INT16_FULL_SCALE);
      }));
    }

    /* ---- 5) Mixer at 44.1 kHz and the output stage ---- */
    stages.push(codec.mixer === 'linear' ? linearStage(codec.voiceRate, mixRate, voiceLength)
      : sincStage(codec.voiceRate, mixRate, voiceLength));
    if (listenerCfg && listenerCfg.extraLpf) stages.push(biquadStage(biquadCoefs('lowpass', mixRate, listenerCfg.extraLpf, 0.8)));
    if (engine.outputFir) stages.push(firStage(engine.outputFir, mixLength));
    if (volume !== 1) {
      stages.push(sampleStage((x) => {
        const y = new Float32Array(x);
        for (let i = 0; i < y.length; i++) y[i] *= volume;
        return y;
      }));
    }

    /* ---- 6) Output rate, cut or padded to process()'s length ---- */
    stages.push(sincStage(mixRate, playbackRate, mixLength));
    let emitted = 0;
    const finalSamples = (y) => {
      y = softLimit(y, 0.98);
      for (let i = 0; i < y.length; i++) {
        if (!Number.isFinite(y[i])) throw new Error(`DSP produced a non-finite sample at index ${emitted + i}.`);
      }
      emitted += y.length;
      return y;
    };
    const cut = cutAt(outLength);
    stages.push({ push: (y) => finalSamples(cut(y)), flush: () => finalSamples(new Float32Array(outLength - emitted)) });

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
      sampleRate: playbackRate,
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
          codecInfo: { ...codecInfo, codec: codecKey, autoGain, voiceRate: codec.voiceRate } };
      }),
      // During a push, the codec is released once that push has finished.
      free() { if (state === 'open') state = 'been freed'; if (!busy) release(); }
    };
  }

  // The info roundTrip, celtRoundTrip and speexRoundTrip return, from a
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
    softLimit,
    hardClip,
    receiverAutoGain,
    createGain,
    decodedFromFrames,
    biquadCoefs,
    applyBiquad,
    mulberry32,
    buildLossMask,
    runDspChain,
    realOpusRoundTrip,
    createLiveChain,
    createRender,
    streamResampleSinc,
    streamFir,
    streamAutoGain,
    streamLossMask,
    steamGiveOut
  };

  if (typeof window !== 'undefined') window.TF2Audio = TF2Audio;
  else if (typeof self !== 'undefined') self.TF2Audio = TF2Audio;
  else if (typeof globalThis !== 'undefined') globalThis.TF2Audio = TF2Audio;
  if (typeof module !== 'undefined' && module.exports) module.exports = TF2Audio;
})();
