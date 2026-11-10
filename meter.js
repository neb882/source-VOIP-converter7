/* Level and loudness of a render, for the meter under the visualizer and the
 * loudness-matched A/B:
 *   - integrated loudness per ITU-R BS.1770-4: K-weighting, 400 ms blocks with
 *     75% overlap, gates at -70 LUFS and 10 LU below. The render is one
 *     channel and is measured as one (a dual-mono playback reads 3 dB higher).
 *   - loudness range per EBU Tech 3342: 3 s short-term loudness every 100 ms,
 *     gates at -70 LUFS and 20 LU below, 10th to 95th percentile
 *   - maximum momentary (400 ms) and short-term (3 s) loudness
 *   - true peak, 4x oversampled with a 32-tap windowed-sinc interpolator,
 *     evaluated between every pair of samples within 8 dB of the sample peak
 *   - sample peak, RMS, crest factor, peak-to-loudness ratio, DC offset
 * Runs in the page and in audio-worker.js.
 *
 * TF2Meter.analyze(samples, sampleRate) -> stats; levels in dB, -Infinity for
 * silence, null where the file is too short (under 0.4 s, or 3 s for LRA).
 * stats.history holds momentary and short-term loudness every 100 ms
 * (Float32Array, LUFS); value k covers the window ending at (k + 4) * 0.1 s
 * (momentary) or (k + 30) * 0.1 s (short-term).
 *
 * TF2Meter.createAnalyzer(sampleRate) -> { push(samples), finish() } takes the
 * same measurement a piece at a time, for a render too long to hold twice:
 * push each piece in order (any length, zero included), then finish() returns
 * exactly what analyze() returns for the whole, however it was split. It keeps
 * one value per 100 ms and copies what it needs, so the caller may reuse a
 * piece's buffer once push returns. After finish() the analyzer is spent.
 */
(function () {
  'use strict';

  const toDb = (power) => (power > 0 ? 10 * Math.log10(power) : -Infinity);
  const loudness = (meanSquare) => -0.691 + toDb(meanSquare);

  // The two K-weighting stages (high shelf, then high-pass) at any rate, from
  // the BS.1770 prototypes' parameters, as libebur128 derives them.
  function kWeighting(rate) {
    let K = Math.tan(Math.PI * 1681.974450955533 / rate), Q = 0.7071752369554196;
    const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const shelf = { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0],
      a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
    K = Math.tan(Math.PI * 38.13547087602444 / rate); Q = 0.5003270373238773;
    a0 = 1 + K / Q + K * K;
    const highpass = { b: [1, -2, 1], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
    return [shelf, highpass];
  }

  function biquad(x, { b, a }) {
    const y = new Float64Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }

  // Loudness of the blocks that pass the absolute gate and the relative one
  // `relative` LU below their power mean.
  function gated(energies, relative) {
    const above = energies.filter(e => loudness(e) > -70);
    if (!above.length) return { energies: [], level: -Infinity };
    const threshold = loudness(above.reduce((s, e) => s + e, 0) / above.length) - relative;
    const kept = above.filter(e => loudness(e) > threshold);
    return { energies: kept, level: loudness(kept.reduce((s, e) => s + e, 0) / kept.length) };
  }

  // 4x interpolation phases (1/4, 2/4, 3/4 between samples): 32 taps each,
  // Kaiser-windowed sinc, normalized to unity gain at DC.
  const TAPS = 16;
  const PHASES = [1, 2, 3].map((p) => {
    const h = new Float64Array(2 * TAPS);
    let sum = 0;
    for (let k = -TAPS + 1; k <= TAPS; k++) {
      const t = k - p / 4, r = t / TAPS;
      const sinc = Math.sin(Math.PI * t) / (Math.PI * t);
      const w = besselI0(8 * Math.sqrt(Math.max(0, 1 - r * r))) / besselI0(8);
      h[k + TAPS - 1] = sinc * w;
      sum += sinc * w;
    }
    for (let i = 0; i < h.length; i++) h[i] /= sum;
    return h;
  });
  function besselI0(x) {
    let sum = 1, term = 1;
    for (let k = 1; k < 50; k++) { term *= (x / (2 * k)) ** 2; sum += term; if (term < 1e-12 * sum) break; }
    return sum;
  }

  function truePeak(x, samplePeak) {
    let peak = samplePeak;
    const threshold = samplePeak * 0.4;              // -8 dB
    const n = x.length;
    for (let i = 0; i + 1 < n; i++) {
      if (Math.abs(x[i]) < threshold && Math.abs(x[i + 1]) < threshold) continue;
      // Points between x[i] and x[i + 1]: taps x[i - 15] .. x[i + 16].
      for (const h of PHASES) {
        let v = 0;
        for (let k = 0; k < 2 * TAPS; k++) {
          const j = i - TAPS + 1 + k;
          if (j >= 0 && j < n) v += x[j] * h[k];
        }
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
    }
    return peak;
  }

  function analyze(samples, sampleRate) {
    const rate = Math.round(sampleRate), n = samples.length;
    let peak = 0, sum = 0, sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = samples[i], a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v; sumSq += v * v;
    }
    const [shelf, highpass] = kWeighting(rate);
    const k = biquad(biquad(samples, shelf), highpass);
    // Sum of K-weighted squares per 100 ms segment.
    const segments = Math.floor(n / (rate / 10));
    const segment = new Float64Array(segments);
    for (let s = 0; s < segments; s++) {
      const from = Math.round(s * rate / 10), to = Math.round((s + 1) * rate / 10);
      let e = 0;
      for (let i = from; i < to; i++) e += k[i] * k[i];
      segment[s] = e;
    }
    const tp = n ? truePeak(samples, peak) : 0;
    return report({ sampleRate, rate, n, peak, sum, sumSq, tp, segment, segments });
  }

  // analyze() a piece at a time; see the header. Every sum runs in the order
  // analyze() runs it, so the results are equal, not close:
  //   - peak, sum and sum of squares accumulate in sample order;
  //   - the two K-weighting biquads keep their state across pieces, and a
  //     100 ms segment's energy is summed from its first sample to its last
  //     wherever the pieces end (segment s covers round(s * rate / 10) up to
  //     round((s + 1) * rate / 10), as in analyze);
  //   - the true peak. analyze() interpolates only the pairs of samples where
  //     either reaches 0.4 of the file's sample peak, which is known only at
  //     the end. Here every pair that reaches 0.4 of the peak so far (a
  //     superset) is interpolated once its 16 following samples have arrived
  //     (the last ones in finish(), with the zeros analyze assumes past the
  //     end), and kept as its level, the larger of its two samples, and its
  //     largest interpolated magnitude, unless another pair beats it on both.
  //     The sample peak counts as such a pair (its level and magnitude are the
  //     peak), so only pairs that rise above the peak so far are kept: a short
  //     list for real signals (a built one can make it long; see `keep`).
  //     finish() takes the largest magnitude among the kept pairs whose
  //     level reaches 0.4 of the final peak, and the sample peak. Each pair
  //     analyze() evaluates is either kept or beaten on both by one that is
  //     (or by the sample peak), which analyze() evaluates too, so the largest
  //     is the same number.
  function createAnalyzer(sampleRate) {
    const rate = Math.round(sampleRate);
    if (!(rate > 0 && rate < Infinity)) throw new RangeError(`TF2Meter.createAnalyzer: no sample rate (${sampleRate})`);
    const [shelf, highpass] = kWeighting(rate);
    const [sb0, sb1, sb2] = shelf.b, [sa0, sa1] = shelf.a, [hb0, hb1, hb2] = highpass.b, [ha0, ha1] = highpass.a;
    let n = 0, peak = 0, sum = 0, sumSq = 0, spent = false;
    // The K-weighting's state (0-3: the shelf's last two inputs and last two
    // outputs; 4-7: the high-pass's) and the open segment's energy so far (8).
    // In a typed array rather than variables: in a loop it compiled while
    // running, V8 boxes variables that shift along a delay line or cross a
    // call, which made about 100 bytes of garbage a sample.
    const state = new Float64Array(9);
    // Segment energies (one value per 100 ms) and the index of the first
    // sample past the open segment.
    const edge = (s) => Math.round(s * rate / 10);
    let segment = new Float64Array(1024), segments = 0, end = edge(1);
    // The last 2 * TAPS samples (sample j at j & MASK).
    const MASK = 2 * TAPS - 1, recent = new Float64Array(2 * TAPS);
    // The kept pairs: a staircase (`levels` falling, `tops` rising: no pair in
    // it beaten on both by another or by the sample peak), and the pairs found
    // since it was last rebuilt. It is rebuilt when those are as many as it
    // holds, and at least 32, so a pair costs a share of one sort however the
    // levels and tops arrive (inserting each into a sorted list in place is
    // quadratic for a signal built to grow the list). `found` and `handled`
    // count the pairs offered and the pairs the rebuilds went through.
    let levels = [], tops = [], newLevels = [], newTops = [], found = 0, handled = 0;

    // Stores the open segment's energy and starts the next segment; returns
    // the index of the first sample past it.
    function closeSegment() {
      if (segments === segment.length) {
        const grown = new Float64Array(2 * segments);
        grown.set(segment);
        segment = grown;
      }
      segment[segments++] = state[8];
      state[8] = 0;
      return edge(segments + 1);
    }

    // Pair i (samples i and i + 1), with samples up to count - 1 present:
    // interpolated from the taps i - 15 .. i + 16 that exist, in truePeak's
    // order.
    function consider(i, count, threshold) {
      const a = Math.abs(recent[i & MASK]), b = Math.abs(recent[(i + 1) & MASK]);
      if (a < threshold && b < threshold) return;
      const first = Math.max(0, TAPS - 1 - i), stop = Math.min(2 * TAPS, count - i + TAPS - 1);
      let top = 0;
      for (let p = 0; p < PHASES.length; p++) {
        const h = PHASES[p];
        let v = 0;
        for (let k = first; k < stop; k++) v += recent[(i - TAPS + 1 + k) & MASK] * h[k];
        if (Math.abs(v) > top) top = Math.abs(v);
      }
      if (top > peak) keep(Math.max(a, b), top);
    }
    function keep(level, top) {
      newLevels.push(level); newTops.push(top); found++;
      if (newLevels.length >= Math.max(32, levels.length)) rebuild();
    }
    // All kept pairs by level, highest first (equal levels: highest top
    // first). A pair stays if its top is above every top before it and above
    // the sample peak; each one dropped is beaten on both by one before it or
    // by the peak.
    function rebuild() {
      const ls = levels.concat(newLevels), ts = tops.concat(newTops), order = ls.map((_, i) => i);
      handled += ls.length;
      order.sort((i, j) => (ls[j] > ls[i] ? 1 : ls[j] < ls[i] ? -1 : ts[j] > ts[i] ? 1 : ts[j] < ts[i] ? -1 : 0));
      levels = []; tops = []; newLevels = []; newTops = [];
      let best = peak;
      for (const i of order) if (ts[i] > best) { best = ts[i]; levels.push(ls[i]); tops.push(ts[i]); }
    }

    function push(samples) {
      if (spent) throw new Error('TF2Meter: push() after finish()');
      scan(samples);
      weigh(samples, peak * 0.4);
    }
    // The two loops over a piece keep their running values in local variables
    // or typed arrays (much faster than the closure's variables). Each is a
    // function of its own: V8 compiles a long first piece while inside its
    // loop, and code after that loop that had not run yet undid that on every
    // call.
    function scan(samples) {
      const length = samples.length;
      let p = peak, s = sum, s2 = sumSq;
      for (let i = 0; i < length; i++) {
        const v = samples[i], a = Math.abs(v);
        if (a > p) p = a;
        s += v; s2 += v * v;
      }
      peak = p; sum = s; sumSq = s2;
    }
    function weigh(samples, threshold) {
      const length = samples.length, d = state;
      let g = n, next = end;
      for (let i = 0; i < length; i++, g++) {
        const x = samples[i];
        recent[g & MASK] = x;
        if (g >= TAPS) consider(g - TAPS, g + 1, threshold);   // its 16 following samples are in
        const y = sb0 * x + sb1 * d[0] + sb2 * d[1] - sa0 * d[2] - sa1 * d[3];
        d[1] = d[0]; d[0] = x; d[3] = d[2]; d[2] = y;
        const k = hb0 * y + hb1 * d[4] + hb2 * d[5] - ha0 * d[6] - ha1 * d[7];
        d[5] = d[4]; d[4] = y; d[7] = d[6]; d[6] = k;
        while (next <= g) next = closeSegment();
        d[8] += k * k;
      }
      n = g; end = next;
    }

    function finish() {
      if (spent) throw new Error('TF2Meter: finish() twice');
      spent = true;
      const threshold = peak * 0.4;
      for (let i = Math.max(0, n - TAPS); i + 1 < n; i++) consider(i, n, threshold);
      while (end <= n) end = closeSegment();
      rebuild();
      let tp = peak;
      for (let k = 0; k < levels.length; k++) if (levels[k] >= threshold && tops[k] > tp) tp = tops[k];
      // As many segments as analyze() counts (every one of them is closed).
      return report({ sampleRate, rate, n, peak, sum, sumSq, tp, segment, segments: Math.floor(n / (rate / 10)) });
    }

    // `pairs` is for the tests: how much work the kept pairs have taken.
    return { push, finish, get pairs() { return { found, handled, kept: levels.length + newLevels.length }; } };
  }

  // The stats from what both ways gather: the sample count, the sample peak,
  // sum and sum of squares, the true peak, and the K-weighted energy of each of
  // the first `segments` 100 ms segments.
  function report({ sampleRate, rate, n, peak, sum, sumSq, tp, segment, segments }) {
    const windows = (count) => {
      const out = [], length = count * rate / 10;
      let e = 0;
      for (let s = 0; s < segments; s++) {
        e += segment[s];
        if (s >= count) e -= segment[s - count];
        if (s >= count - 1) out.push(Math.max(0, e) / length);
      }
      return out;
    };
    const momentary = windows(4), shortTerm = windows(30);
    const integrated = momentary.length ? gated(momentary, 10).level : null;
    let lra = null;
    if (shortTerm.length) {
      const kept = gated(shortTerm, 20).energies.map(loudness).sort((a, b) => a - b);
      if (kept.length) {
        const at = (q) => kept[Math.min(kept.length - 1, Math.max(0, Math.round(q * (kept.length - 1))))];
        lra = at(0.95) - at(0.10);
      }
    }
    // A loop, not Math.max(...values): an hour is 36,000 arguments, and how
    // many a call takes depends on the engine. Math.max pair by pair gives the
    // same result, NaN and -0 included.
    const max = (values) => {
      if (!values.length) return null;
      let m = -Infinity;
      for (let i = 0; i < values.length; i++) m = Math.max(m, values[i]);
      return loudness(m);
    };
    const history = {
      hop: 0.1,
      momentary: Float32Array.from(momentary, loudness),
      shortTerm: Float32Array.from(shortTerm, loudness)
    };
    const rms = n ? Math.sqrt(sumSq / n) : 0;
    const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
    return {
      duration: n / sampleRate,
      integrated,
      lra,
      momentaryMax: max(momentary),
      shortTermMax: max(shortTerm),
      truePeak: db(tp),
      samplePeak: db(peak),
      rms: db(rms),
      crest: peak > 0 && rms > 0 ? db(peak) - db(rms) : null,
      plr: integrated !== null && Number.isFinite(integrated) && tp > 0 ? db(tp) - integrated : null,
      dc: n ? sum / n : 0,
      history
    };
  }

  const TF2Meter = { analyze, createAnalyzer, kWeighting };
  if (typeof window !== 'undefined') window.TF2Meter = TF2Meter;
  else if (typeof self !== 'undefined') self.TF2Meter = TF2Meter;
  if (typeof module !== 'undefined' && module.exports) module.exports = TF2Meter;
})();
