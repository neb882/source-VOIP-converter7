/* TF2 Voice Emulator, capture-converter.js: Windows's rate converter at quality 30, from a
 * source's own rate to Steam's 24,000 Hz.
 *
 * Steam opens its microphone at 24,000 Hz (read) and Windows converts the device's sound to
 * that rate. The converter's design was read twice from Windows's files (tests/REFERENCE_2026.md,
 * finding 28); the rule as this file runs it is docs/work-orders/W3-26-capture-conversion.md,
 * "The rule", steps 1 to 12. That a capture stream gets this converter at quality 30 is not
 * read: it fits one take made through a virtual cable (measured once). The port is held bit for
 * bit to the first reader's converter on the vectors of tests/capture-converter/.
 *
 *   - The phases: L = 24000 / gcd, M = rate / gcd. Output k is centred on the input instant
 *     k M / L, so output 0 sits on the source's first sample and nothing is delayed.
 *   - A Kaiser-windowed sinc (beta 10, 30 zero crossings; read, twice). It is looked up in two
 *     stored tables with linear steps in 32-bit floats: the sinc's on the grid 35 k / 16384 and
 *     its interpolation are read, as the first reader's converter has them (the second reader's
 *     converter has another grid for the sinc, k x 65536 / 30678338). The cutoff is 0.96634 of
 *     the lower rate's half (read; computed), 11,596 Hz going down to 24 kHz.
 *   - The table is one sum over all its entries, scaled to L, as a running 32-bit float sum,
 *     where the pair of rates is inside Windows's limits for a stored table, (H + 1) L < 100000
 *     and max(L, M) <= 1280 (the sum and the limits: read, as the first reader's converter has
 *     them). Outside them (not rated) the sum is in double precision: the app's own (chosen),
 *     since what Windows does there was not read.
 *   - An output is the sum of its products in double precision, rounded to a 32-bit float. The
 *     order of adding is chosen, the oldest input first: the first reader's converter adds the
 *     newest first, with a library routine whose order is not this one. Either order gives the
 *     same bits on every vector (measured); on longer signals a rare sample can differ from the
 *     first reference in its last bit (measured: one of about 2.8 million, by 1.3e-6).
 *   - A stream starts with zeros for history (read in part) and gives output k as soon as the
 *     H inputs after its centre are in: it holds back H / rate seconds (computed).
 *   - A finite source of n samples gives max(1, round(n L / M)) outputs, the length the app's
 *     resampler gives (chosen), with zeros read after its end.
 *   - At 24,000 Hz the converter is not run: the samples pass as they are (chosen).
 *   - Above TABLE_LIMIT entries a phase's row is made when an output needs it, by the same
 *     rule and with the same scale (chosen); the samples do not depend on which way.
 *
 * design(rate, limit) -> { rate, L, M, H, T, cutoff, scale, rated, stored, row(p) }; null at
 * 24000 Hz, where no table is made. A design kept is given again as the same object. length(n,
 * rate), wait(rate), createStream(rate, limit) -> { push(x), end(count) }, convert(x, rate),
 * gain(rate, hz).
 * No imports; runs as a page script, in a worker and under Node.
 */
(function (root) {
  'use strict';

  const OUT_RATE = 24000;
  const QUALITY = 30;
  // Entries of a table that is stored whole (16.8 MB); above it rows are made as needed (chosen).
  const TABLE_LIMIT = 4194304;
  const f32 = Math.fround;
  const NONE = new Float32Array(0);

  function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }

  // A rate is rounded to a whole number, as the engine does.
  function wholeRate(rate) {
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 1) {
      throw new RangeError(`capture converter: a rate must be a finite number of at least 1 Hz, not ${String(rate)}`);
    }
    return Math.round(rate);
  }

  // The two stored tables (step 4), made once on first use.
  let S = null, Sd = null, W = null, Wd = null;
  function besselI0(x) {
    // The series sum of (x^2 / 4)^k / (k!)^2, to double precision.
    const q = x * x / 4;
    let s = 1, t = 1;
    for (let k = 1; k < 500; k++) {
      t *= q / (k * k);
      const next = s + t;
      if (next === s) break;
      s = next;
    }
    return s;
  }
  function makeTables() {
    S = new Float32Array(16385);
    S[0] = 1;
    for (let k = 1; k <= 16384; k++) {
      const px = Math.PI * (35 * k / 16384);
      S[k] = Math.sin(px) / px;
    }
    // One entry more than the rule's, 0, so that an index rounded up to the table's end reads S[16384].
    Sd = new Float32Array(16385);
    for (let k = 0; k < 16384; k++) Sd[k] = (S[k + 1] - S[k]) / 65536;
    W = new Float32Array(1025);
    const i0beta = besselI0(10);
    for (let k = 0; k <= 1024; k++) {
      const t = k / 1024;
      W[k] = besselI0(10 * Math.sqrt(Math.max(0, 1 - t * t))) / i0beta;
    }
    Wd = new Float32Array(1025);
    for (let k = 0; k < 1024; k++) Wd[k] = (W[k + 1] - W[k]) / 1048576;
  }

  const SINC_SCALE = f32(2 ** 30 / 35);   // 30,678,338
  // The kernel at x >= 0 zero crossings from its centre (step 5), a 32-bit float.
  function kernel(x) {
    const u = f32(x / QUALITY);
    let w = 0;
    if (u < 1) {
      const n = Math.trunc(f32(u * 1073741824));
      w = f32(f32((n & 0xFFFFF) * Wd[n >> 20]) + W[n >> 20]);
    }
    const xf = f32(x);
    let s = 0;
    if (xf < 35) {
      const n = Math.trunc(f32(xf * SINC_SCALE));
      s = f32(f32((n & 0xFFFF) * Sd[n >> 16]) + S[n >> 16]);
    }
    return f32(w * s);
  }

  // The design's numbers for a whole rate other than 24000 (steps 1 to 3).
  const shapes = new Map();
  function shape(R) {
    let d = shapes.get(R);
    if (d) return d;
    const g = gcd(R, OUT_RATE), L = OUT_RATE / g, M = R / g;
    const y = f32(Math.log(QUALITY));
    const share = f32(0.067308 * y - 0.00579496 * y * y + 0.804446);
    const Rf = f32(R);
    const lp = f32(Math.min(f32(Rf / OUT_RATE), 1) * share);
    const cutoff = f32(f32(Math.max(R, OUT_RATE)) / Math.max(f32(Rf / lp), OUT_RATE));
    const H = Math.ceil(QUALITY * Math.max(1, Rf / OUT_RATE) / cutoff);
    const T = 4 * Math.floor((2 * H + 4) / 4);
    const rated = (H + 1) * L < 100000 && Math.max(L, M) <= 1280;
    d = Object.freeze({ L, M, H, T, cutoff, rated, step: cutoff / Math.max(L, M) });
    if (shapes.size > 64) shapes.clear();
    shapes.set(R, d);
    return d;
  }

  // The kept designs, oldest first, at most 2 x TABLE_LIMIT entries in all.
  const designs = new Map();
  let keptEntries = 0;
  const entriesOf = (d) => (d.stored ? d.L * d.T : d.T);
  function keep(key, d) {
    const n = entriesOf(d);
    if (n > 2 * TABLE_LIMIT) return;
    for (const [k, old] of designs) {
      if (keptEntries + n <= 2 * TABLE_LIMIT) break;
      designs.delete(k);
      keptEntries -= entriesOf(old);
    }
    designs.set(key, d);
    keptEntries += n;
  }

  function wholeLimit(limit) {
    if (typeof limit !== 'number' || Number.isNaN(limit) || limit < 0) {
      throw new RangeError(`capture converter: a table limit must be a number of at least 0, not ${String(limit)}`);
    }
    return limit;
  }

  // Makes (or finds) the design for a rate. The internal form adds `rowInto(p, out)` and,
  // when stored, `table` (L rows of T, the oldest input's tap first).
  function build(R, limit) {
    const s = shape(R), { L, H, T, step, rated } = s;
    const stored = L * T <= limit;
    const key = `${R}:${stored ? 1 : 0}`;
    const found = designs.get(key);
    if (found) {
      designs.delete(key);
      designs.set(key, found);
      return found;
    }
    if (!S) makeTables();
    const C = T - H - 1;
    // Steps 6 and 7: the raw table, one sum over it in its order, the scale.
    let table = null, sum = 0;
    if (stored) {
      table = new Float32Array(L * T);
      for (let p = 0, at = 0; p < L; p++) {
        for (let q = 0; q < T; q++, at++) {
          const v = kernel(Math.abs(L * (C - q) + p) * step);
          table[at] = v;
          sum = rated ? f32(sum + v) : sum + v;
        }
      }
    } else {
      for (let p = 0; p < L; p++) {
        for (let q = 0; q < T; q++) {
          const v = kernel(Math.abs(L * (C - q) + p) * step);
          sum = rated ? f32(sum + v) : sum + v;
        }
      }
    }
    const scale = sum !== 0 ? f32(L / sum) : f32(L);
    if (stored) for (let i = 0; i < table.length; i++) table[i] = table[i] * scale;
    function rowInto(p, out) {
      if (stored) {
        out.set(table.subarray(p * T, p * T + T));
      } else {
        for (let q = 0; q < T; q++) out[q] = kernel(Math.abs(L * (C - q) + p) * step) * scale;
      }
      return out;
    }
    const shared = new Float32Array(T);
    function row(p) {
      if (!Number.isInteger(p) || p < 0 || p >= L) {
        throw new RangeError(`capture converter: a phase must be a whole number from 0 to ${L - 1}, not ${String(p)}`);
      }
      return stored ? rowInto(p, new Float32Array(T)) : rowInto(p, shared);
    }
    const given = Object.freeze({ rate: R, L, M: s.M, H, T, cutoff: s.cutoff, scale, rated, stored, row });
    const d = Object.freeze({ ...given, rowInto, table, given });
    keep(key, d);
    return d;
  }

  function design(rate, limit = TABLE_LIMIT) {
    const R = wholeRate(rate);
    wholeLimit(limit);
    if (R === OUT_RATE) return null;
    return build(R, limit).given;
  }

  // The outputs of a finite source of n samples (step 10); n at 24000 Hz.
  function length(n, rate) {
    if (!Number.isInteger(n) || n < 0) {
      throw new RangeError(`capture converter: a length must be a whole number of at least 0, not ${String(n)}`);
    }
    const R = wholeRate(rate);
    if (R === OUT_RATE || n === 0) return n;
    const { L, M } = shape(R);
    return Math.max(1, Math.round(n * L / M));
  }

  // Seconds a stream holds back: H / rate; 0 at 24000 Hz.
  function wait(rate) {
    const R = wholeRate(rate);
    return R === OUT_RATE ? 0 : shape(R).H / R;
  }

  function createStream(rate, limit = TABLE_LIMIT) {
    const R = wholeRate(rate);
    wholeLimit(limit);
    let ended = false;
    const open = (what) => {
      if (ended) throw new Error(`capture converter: ${what} after end()`);
    };
    if (R === OUT_RATE) {
      return Object.freeze({
        push(x) { open('push()'); return Float32Array.from(x); },
        end(count) { open('end()'); wholeCount(count); ended = true; return NONE; }
      });
    }
    const d = build(R, limit), { L, M, H, T } = d, C = T - H - 1;
    const table = d.stored ? d.table : null;
    const row = new Float32Array(T);
    let rowPhase = -1;
    // The kept inputs: hist[j] is input base + j; inputs before 0 are zeros (step 9).
    let hist = new Float32Array(Math.max(4 * T, 4096));
    let base = -C, filled = C;
    let n = 0;                    // inputs in
    // The next output, its centre's input and its phase, by whole-number steps. Exact while
    // (i + 1) L stays under 2^53: about 90 days of a stream at 47,999 Hz, 80 years at
    // 44,100 Hz (computed).
    let k = 0, i = 0, p = 0;

    function room(extra) {
      if (filled + extra <= hist.length) return;
      // Drop what the next output no longer needs, then grow if that is not enough.
      const keepFrom = Math.max(0, i - C - base);
      const live = filled - keepFrom;
      if (live + extra <= hist.length) {
        hist.copyWithin(0, keepFrom, filled);
      } else {
        const next = new Float32Array(Math.max(2 * hist.length, live + extra));
        next.set(hist.subarray(keepFrom, filled), 0);
        hist = next;
      }
      base += keepFrom;
      filled = live;
    }

    // The outputs with centre input at most `last`, from k on, and never past output cap - 1.
    function outputsTo(last, cap = Infinity) {
      if (last < 0) return NONE;
      const total = Math.min(cap, Math.floor(((last + 1) * L - 1) / M) + 1);
      if (total <= k) return NONE;
      const out = new Float32Array(total - k);
      for (let j = 0; j < out.length; j++) {
        let tab, off;
        if (table) { tab = table; off = p * T; } else {
          if (p !== rowPhase) { d.rowInto(p, row); rowPhase = p; }
          tab = row; off = 0;
        }
        const at = i - C - base;
        let acc = 0;
        for (let q = 0; q < T; q++) acc += tab[off + q] * hist[at + q];
        out[j] = acc;
        k++;
        p += M;
        if (p >= L) { i += Math.floor(p / L); p %= L; }
      }
      return out;
    }

    function push(x) {
      open('push()');
      const m = x.length;
      if (m) {
        room(m);
        hist.set(x, filled);
        filled += m;
        n += m;
      }
      return outputsTo(n - 1 - H);
    }

    function end(count) {
      open('end()');
      wholeCount(count);
      ended = true;
      if (count <= k) return NONE;
      // The centre input of output count - 1, and the zeros read up to H after it. Where L > M
      // several outputs share that centre: the cap stops at output count - 1.
      const lastCentre = Math.floor(((count - 1) * M) / L);
      const need = lastCentre + H + 1 - (base + filled);
      if (need > 0) {
        room(need);
        hist.fill(0, filled, filled + need);
        filled += need;
      }
      return outputsTo(lastCentre, count);
    }

    return Object.freeze({ push, end });
  }

  function wholeCount(count) {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`capture converter: end() takes a whole number of outputs of at least 0, not ${String(count)}`);
    }
  }

  // The whole conversion of a finite source: push(x) then end(length(x.length, rate)), joined.
  function convert(x, rate) {
    const R = wholeRate(rate);
    if (R === OUT_RATE) return Float32Array.from(x);
    const s = createStream(R);
    const a = s.push(x), b = s.end(length(x.length, R));
    if (!b.length) return a;
    if (!a.length) return b;
    const out = new Float32Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  // The conversion's gain at hz of the source, linear: the table taken as one filter at L times
  // the source's rate, divided by L. With j = q - (T - H - 1), the input offset of tap q from
  // the output's instant, the tap of phase p sits at L j - p fine steps (the table's own index,
  // step 6, is |L j - p|): gain = |sum over p and q of table[p][q] e^(-2 pi i hz (L j - p) / (R L))| / L.
  // 1 at 24000 Hz.
  function gain(rate, hz) {
    const R = wholeRate(rate);
    if (typeof hz !== 'number' || !Number.isFinite(hz)) {
      throw new RangeError(`capture converter: a frequency must be a finite number, not ${String(hz)}`);
    }
    if (R === OUT_RATE) return 1;
    const d = build(R, TABLE_LIMIT), { L, H, T } = d, C = T - H - 1;
    const row = new Float32Array(T);
    let re = 0, im = 0;
    for (let p = 0; p < L; p++) {
      d.rowInto(p, row);
      for (let q = 0; q < T; q++) {
        const a = -2 * Math.PI * hz * ((L * (q - C) - p) / (R * L));
        re += row[q] * Math.cos(a);
        im += row[q] * Math.sin(a);
      }
    }
    return Math.hypot(re, im) / L;
  }

  const TF2CaptureConverter = Object.freeze({
    OUT_RATE, QUALITY, TABLE_LIMIT, design, length, wait, createStream, convert, gain
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = TF2CaptureConverter;
  else root.TF2CaptureConverter = TF2CaptureConverter;
})(typeof self !== 'undefined' ? self : this);
