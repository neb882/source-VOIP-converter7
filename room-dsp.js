/* TF2 Voice Emulator, room-dsp.js: the engine's room effects on a voice (order W3-17, parts a and b).
 *
 * The arithmetic is the engine's as read from its binary, not an approximation of it:
 *   docs/reports/W3-17-room-dsp-second-read.md (R2; it wins where the first read differs),
 *   docs/reports/W3-17-amp-mdy-second-read.md (AM: the amplifier, the modulating delay and the ramp both use),
 *   docs/reports/W3-15-room-dsp.md (R1: where the room sits, the slots, the shares),
 *   docs/reports/W3-17a-second-read.md (this file against the engine's code: the slot, the block's order, the
 *   water; it wins over the order where they differ).
 * tests/roomdsp/dspmodel.py is a second implementation by other hands; tests/room-dsp.verify.mjs holds this file
 * to its recorded outputs. Where the reports leave a detail open, this file does what the model does, and says so.
 *
 * Sample arithmetic is 32-bit signed integers: a product is Math.imul (it wraps), a sum is `| 0`, and `>> 12`
 * rounds down (toward minus infinity), never toward zero. The builders' single-precision steps are Math.fround
 * per operation, in the order the reads give; their double steps are plain doubles. 4096 is 1.0.
 *
 * What is built: the processors NULL, DLY (kinds PLAIN 0, ALLPASS 1, LOWPASS 2, FLINEAR 4), DFR, RVA (plain and
 * from three dimensions, random taps), AMP and MDY; a preset as a plain chain; the slot with its cross-fade; the
 * voice's shares and entry; the room path (room slot, then the water instance) with the tail's end; the automatic
 * room's build from two templates by its shape and classes (R2 e1, e2), and its named cases. Refused by name
 * when a preset asks for one: FLT and the other processor types, the delay kinds DLINEAR 3, LOWPASS_4TAP 5 and
 * PLAIN_4TAP 6 (so a reverb's tap factor), a one-shot duration and a header's own fade time.
 *
 * The table of presets is not in this file: room-presets.js sets the global TF2_ROOM_PRESETS (or is require'd
 * under Node and handed over with setTable or a `table` option).
 *
 * TF2Room.entry(s, share), shares(header), createInstance(preset, draw), createSlot(opts),
 * createRoomPath(opts), buildAutomatic(measures or case key), ROOM_CASES: see each below.
 */
(function (root) {
  'use strict';

  const fround = Math.fround, trunc = Math.trunc, imul = Math.imul;

  // ---------------------------------------------------------------- constants

  const SR = 44100;
  const MS = fround(44.1);                         // samples per millisecond, a single in the binary (R2 0)
  const PI_OVER_SR = 7.123792865282977e-05;        // pi / 44100, a double in the binary (R2 c)
  const F_0999 = fround(0.999);
  const F_SAMPLE_S = fround(2.2675736545352265e-05); // 1 / 44100 as the binary's single (R2 a4)
  // The mixer's block: one paint call mixes 512 samples (W3-07). Per block the engine updates the slots (a
  // change is taken), then mixes the channels (the shares' test), then runs the slots (W3-17a second read, row 1
  // and F2: 0x1800469ce, 0x180046cd9, 0x1800470d8).
  const BLOCK = 512;
  const ROOM_FADE = 0.2;                           // seconds: the room slot's cross-fade (second read, row 10)
  const WATER_PRESET = 14;                         // dsp_water's preset
  const WATER_PREROLL = 44100;                     // a path made under water has run its water instance this long
  const ROOM_SEED_XOR = 0x524F4F4D;                // 'ROOM': the room slot's stream is mulberry32((seed ^ this) >>> 0)
  const WATER_SEED_XOR = 0x57415452;               // 'WATR': the water instance's
  const MIX_START = [0.2, 0.8, 80, 0.5];           // the engine's start-up dsp_mix_min, _max, dsp_db_min, _mixdrop
  const VOICE_DB = 60;                             // a voice's sound level (R2 f)
  const VOICE_DIST = 12;                           // units: a voice is placed 12 units to the side (R2 f)
  const DIST_MIN = 0, DIST_MAX = 1440;             // dsp_dist_min, dsp_dist_max
  const TAIL_BAND = 32, TAIL_WINDOW = 22050, TAIL_CAP = 882000;   // Decision 8

  const TYPE = { NULL: 0, DLY: 1, RVA: 2, FLT: 3, CRS: 4, PTC: 5, ENV: 6, LFO: 7, EFO: 8, MDY: 9, DFR: 10, AMP: 11 };
  const TYPE_NAME = ['NULL', 'DLY', 'RVA', 'FLT', 'CRS', 'PTC', 'ENV', 'LFO', 'EFO', 'MDY', 'DFR', 'AMP'];
  const KIND_NAME = ['PLAIN', 'ALLPASS', 'LOWPASS', 'DLINEAR', 'FLINEAR', 'LOWPASS_4TAP', 'PLAIN_4TAP'];

  // Range tables, [low, high] per value, applied before a processor is built; a value of exactly 0 is never
  // clamped (R2 0 for RVA, DLY and DFR; AM 0 for AMP and MDY). MDY's own delay is clamped by MDY's table.
  const RANGES = {
    [TYPE.RVA]: [[0, 1000], [0, 1000], [1, 12], [0, 1], [0, 10], [10, 22050], [0, 1], [0, 50], [0, 10],
      [-1000, 1000], [-1000, 1000], [-1000, 1000], [-1, 1], [-1, 1], [-1, 1], [0, 0.333]],
    [TYPE.DLY]: [[0, 6], [-1, 1000], [0, 0.99], [0, 10], [0, 2], [10, 22050], [100, 11025], [0, 3],
      [-1, 1000], [-1, 1000], [-1, 1000]],
    [TYPE.DFR]: [[0, 1], [0, 4], [0, 1], [0, 10]],
    [TYPE.AMP]: [[0, 1000], [0, 1], [0, 1], [0, 1], [0, 200], [0, 1], [0.01, 100], [0, 1]],
    [TYPE.MDY]: [[0, 6], [0, 1000], [0, 0.99], [0, 1], [0, 2], [10, 22050], [100, 11025], [0, 3], [0.01, 200],
      [0, 1], [0.01, 100], [0, 1]],
  };

  // The one-pole low-pass section's (a1, b0) by cutoff, so no browser's tan decides a sample (order part a,
  // item 3). Every cutoff of the table and every cutoff part b's build can give; tests/roomdsp/coefs.mjs
  // recomputes them. b1 = b0 for a low-pass.
  const PINNED_LP = new Map([
    [900, [-3601, 247]], [1000, [-3550, 272]], [1050, [-3524, 285]], [1200, [-3449, 323]], [1350, [-3375, 360]],
    [1500, [-3302, 396]], [1520, [-3292, 401]], [1750, [-3183, 456]], [1800, [-3160, 467]], [2000, [-3068, 513]],
    [2140, [-3004, 545]], [2500, [-2846, 624]], [2760, [-2735, 680]], [2850, [-2697, 699]], [3000, [-2635, 730]],
    [3250, [-2533, 781]], [3380, [-2481, 807]], [3500, [-2433, 831]], [3900, [-2278, 908]], [4000, [-2240, 927]],
    [4500, [-2054, 1020]], [4950, [-1892, 1101]], [5000, [-1874, 1110]], [5500, [-1700, 1197]],
    [6000, [-1532, 1281]],
  ]);

  // The diffusor's lengths in ms (R2 c); the count cannot pass 4 after the range clamp.
  const DFR_MS = [13, 19, 26, 21, 32, 36, 38, 16, 24, 28, 41, 35, 10, 46, 50, 27];

  // ---------------------------------------------------------------- small helpers

  // float -> int32 as the x86 truncating conversion does it: NaN, infinities and out-of-range give -2^31 (AM 1).
  function cvtt(x) {
    return (x > -2147483649 && x < 2147483648) ? trunc(x) : -2147483648;
  }

  function f32array(values, n) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = values && i < values.length ? +values[i] : 0;
      out[i] = fround(v);
    }
    return out;
  }

  // The per-type range clamp (R2 0, AM 0): a value of exactly 0 is never clamped.
  function clampParams(type, values) {
    const p = f32array(values, 16);
    const table = RANGES[type];
    if (!table) return p;
    for (let i = 0; i < table.length; i++) {
      const v = p[i], lo = fround(table[i][0]), hi = fround(table[i][1]);
      if (v !== 0 && (v > hi || !(v >= lo))) p[i] = Math.min(Math.max(v, lo), hi);
    }
    return p;
  }

  // The generator of engine/dsp.js.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = imul(a ^ (a >>> 15), 1 | a);
      t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The engine draws RandomInt(lo, hi) from its shared stream, which cannot be reproduced. The app draws
  // lo + floor(u x (hi - lo + 1)), u from mulberry32 (Decision 7).
  function seededDraw(seed) {
    const u = mulberry32(seed >>> 0);
    return (lo, hi) => lo + Math.floor(u() * (hi - lo + 1));
  }

  function drawFrom(opts, fallbackSeed) {
    if (opts && typeof opts.draw === 'function') return opts.draw;
    const seed = opts && opts.seed !== undefined ? opts.seed : fallbackSeed;
    return seededDraw(Number(seed) >>> 0);
  }

  // ---------------------------------------------------------------- the ramp (AM 1)

  // Set(seconds, start, target): the value runs from start toward target, one step per call, in 12.20 fixed
  // point. The offset stays strictly under |target - start|, so the target is never produced: the call that would
  // reach it returns the previous value again and reports done. A ramp of zero length is done at once, at start.
  class Ramp {
    constructor(seconds, start, target) {
      const diff = (target - start) | 0;
      this.start = start;
      this.dir = diff < 0 ? -1 : 1;
      this.limit = Math.abs(diff);
      this.n = cvtt(fround(fround(seconds) * SR));
      let step = fround(Math.abs(fround(diff)) / fround(this.n));
      const i = cvtt(step);
      if (i > 0xFFF) step = fround(fround(step - fround(i)) + 4095);
      this.step = cvtt(fround(step * 1048576));
      this.reset();
    }
    reset() {
      this.acc = 0; this.pos = 0; this.done = false; this.cur = this.start;
    }
    next() {
      if (this.done) return this.cur;
      let r = this.pos;
      const acc = (this.acc + this.step) | 0;
      const npos = ((acc >> 20) + this.pos) | 0;
      this.acc = acc & 0xFFFFF;
      this.pos = npos;
      if (this.step !== 0 && npos >= 0 && npos < this.limit) r = npos;
      else this.done = true;
      this.cur = this.dir > 0 ? (this.start + r) | 0 : (this.start - r) | 0;
      return this.cur;
    }
  }

  // ---------------------------------------------------------------- the filter section (R2 c)

  function computeCoefs(type, cutoff) {
    const w = Math.tan(fround(cutoff) * PI_OVER_SR);
    const p = (1 - w) / (1 + w);
    const a1 = trunc(-4096 * p);
    if (type === 1) {
      const b0 = trunc(2048 * (p + 1));
      return { a1, b0, b1: -b0 };
    }
    const b0 = trunc(2048 * (1 - p));
    return { a1, b0, b1: b0 };
  }

  // One first-order section's (a1, b0, b1): a low-pass from the pinned table, anything else (a cutoff the table
  // does not hold, or a high-pass) with Math.tan, marked "not pinned".
  function filterCoefs(type, cutoff) {
    const c = fround(cutoff);
    if (type !== 1) {
      const pin = PINNED_LP.get(c);
      if (pin) return { a1: pin[0], b0: pin[1], b1: pin[1], pinned: true };
    }
    const k = computeCoefs(type, c);
    k.pinned = false;
    return k;
  }

  class Section {
    constructor(k) {
      this.a1 = k.a1; this.b0 = k.b0; this.b1 = k.b1; this.w1 = 0;
    }
    next(x) {
      const w1 = this.w1;
      if (w1 === 0 && x === 0) return 0;          // a section whose state and input are both 0 returns 0
      const w0 = (x - (imul(w1, this.a1) >> 12)) | 0;
      this.w1 = w0;
      return (imul(w0, this.b0) + imul(w1, this.b1)) >> 12;
    }
    describe() { return [this.a1, this.b0, this.b1]; }
  }

  // ---------------------------------------------------------------- the delay line (R2 b)

  // A line of D samples, feedback integer a, gain integer b, kind 0 PLAIN, 1 ALLPASS, 2 LOWPASS or 4 FLINEAR;
  // sec is the filter's first section for kinds 2 and 4. With modulate(), the random taps of R2 a4 and AM 3.
  class Line {
    constructor(D, a, b, kind, sec) {
      if (!(D >= 0) || D !== trunc(D)) throw new Error(`TF2Room: a delay line of ${D} samples`);
      this.kind = kind; this.D = D; this.len = D + 1;
      this.buf = new Int32Array(D + 1); this.w = 0;
      this.tap = D; this.tapnew = D; this.xf = 0;
      this.fa1 = 0; this.fb0 = 0; this.fb1 = 0; this.fw1 = 0;
      if (kind === 2 || kind === 4) {
        // The feedback lives in the filter: its b0, b1 times a / 4096, truncated.
        const g = fround(a * (1 / 4096));
        this.fa1 = sec.a1; this.fb0 = trunc(fround(sec.b0 * g)); this.fb1 = trunc(fround(sec.b1 * g));
      }
      this.a = Math.min(a, 4095);
      if (kind === 4) {
        this.a = 0; this.g = 4096;                 // FLINEAR: no feedback, gain 4096 whatever was asked (R2 diff. 4)
      } else {
        // The gain cut, in its exact form (R2 b, difference 7); a gain integer of 0 counts as 4096.
        const g = Math.min(fround(a * (1 / 4096)), F_0999);
        const inv = fround(1 / fround(1 - g));
        const e = trunc(4096 / inv);
        const k = Math.min(Math.max(fround(e * 4), 1024), 4096);
        this.g = trunc(fround(fround(k * (b !== 0 ? b : 4096)) * (1 / 4096)));
      }
      this.period = 0; this.cnt = 0; this.lo = 0; this.ramp = null; this.draw = null; this.fading = false;
    }

    // Random taps: a draw every period + 1 samples (the counter is read, decremented, and acts if it read 0), of
    // a whole-sample tap in [lo, D]; the tap cross-faded in by a 0 to 4096 ramp over rampSeconds.
    modulate(period, lo, rampSeconds, draw) {
      this.period = period; this.cnt = period; this.lo = lo;
      this.ramp = new Ramp(rampSeconds, 0, 4096); this.draw = draw;
    }

    lp(d) {
      const w1 = this.fw1;
      if (w1 === 0 && d === 0) return 0;
      const w0 = (d - (imul(w1, this.fa1) >> 12)) | 0;
      this.fw1 = w0;
      return (imul(w0, this.fb0) + imul(w1, this.fb1)) >> 12;
    }

    next(x) {
      const buf = this.buf, len = this.len, w = this.w;
      let r = w + this.tap; if (r >= len) r -= len;
      let d = buf[r];
      if (this.fading) {
        let rn = w + this.tapnew; if (rn >= len) rn -= len;
        d = (d + (imul(buf[rn] - d, this.xf) >> 12)) | 0;
      }
      let out;
      switch (this.kind) {
        case 0: {
          const v = ((imul(d, this.a) >> 12) + x) | 0;
          buf[w] = v;
          out = imul(v, this.g) >> 12;
          break;
        }
        case 1: {
          const v = ((imul(d, this.a) >> 12) + x) | 0;
          buf[w] = v;
          out = imul((((-imul(v, this.a)) >> 12) + d) | 0, this.g) >> 12;
          break;
        }
        case 2: {
          const v = (this.lp(d) + x) | 0;
          buf[w] = v;
          out = imul(v, this.g) >> 12;
          break;
        }
        default: {                                 // 4 FLINEAR
          const f = this.lp(d);
          buf[w] = x;
          out = imul(f, this.g) >> 12;
        }
      }
      this.w = w === 0 ? len - 1 : w - 1;
      if (this.period !== 0) this.step();
      return out;
    }

    step() {
      if (this.fading) {
        this.xf = this.ramp.next();
        if (this.ramp.done) { this.tap = this.tapnew; this.fading = false; }
      }
      const c = this.cnt;
      this.cnt = c - 1;
      if (c === 0) {
        this.cnt = this.period;
        const nw = this.draw(this.lo, this.D);
        this.fading = true;
        this.ramp.reset();
        this.tapnew = Math.max(0, Math.min(nw | 0, this.D));
        this.xf = 0;
      }
    }

    describe() {
      return { kind: this.kind, D: this.D, a: this.a, g: this.g,
        lp: (this.kind === 2 || this.kind === 4) ? [this.fa1, this.fb0, this.fb1] : null };
    }
  }

  // ---------------------------------------------------------------- the processors

  class NullProc {
    next(x) { return x; }
    describe() { return { t: 'NULL' }; }
  }

  // DLY (R2 b): D = trunc(|ms| x 44.1) in single, a = trunc(fb x 4096), b = trunc(gain x 4096); only the filter's
  // first section goes in the line, so "quality" does nothing.
  function lineFromDelayParams(p, label, notPinned) {
    const kind = trunc(p[0]);
    if (kind === 3 || kind === 5 || kind === 6 || kind < 0 || kind > 6) {
      throw new Error(`TF2Room: ${label} asks for the delay kind ${KIND_NAME[kind] || kind}, which is not built`);
    }
    const D = trunc(fround(Math.abs(p[1]) * MS));
    const a = trunc(fround(p[2] * 4096));
    const b = trunc(fround(p[3] * 4096));
    let sec = null;
    if (kind === 2 || kind === 4) {
      // A width over 0 makes the first section the band-pass's high-pass half (R2 b); else the kind asked for.
      sec = p[6] > 0 ? filterCoefs(1, p[5]) : filterCoefs(trunc(p[4]), p[5]);
      if (!sec.pinned) notPinned.push(p[6] > 0 ? `high-pass ${p[5]}` : p[5]);
    }
    return new Line(D, a, b, kind, sec);
  }

  class DlyProc {
    constructor(p, label) {
      this.notPinned = [];
      this.line = lineFromDelayParams(p, label, this.notPinned);
    }
    next(x) { return this.line.next(x); }
    describe() {
      const d = { t: 'DLY', line: this.line.describe() };
      if (this.notPinned.length) d.notPinned = this.notPinned;
      return d;
    }
  }

  // DFR (R2 c): n all-passes in series; stage i: D = trunc(size x T[i]) x 44100 / 1000 in integers (the time
  // cut to whole milliseconds first), a = trunc(min(fb x 4096, 4091.9)), gain 0 means 1.
  class DfrProc {
    constructor(p) {
      const size = p[0], fb = p[2];
      const gain = p[3] !== 0 ? p[3] : fround(1);
      const n = Math.min(Math.max(trunc(p[1]), 1), 8);
      this.stages = [];
      for (let i = 0; i < n; i++) {
        const D = Math.floor(trunc(fround(size * DFR_MS[i])) * 44100 / 1000);
        const a = trunc(Math.min(fround(fround(1 * 4096) * fb), 4091.9));
        this.stages.push(new Line(D, a, trunc(fround(gain * 4096)), 1, null));
      }
    }
    next(x) {
      const s = this.stages;
      for (let i = 0; i < s.length; i++) x = s[i].next(x);
      return x;
    }
    describe() { return { t: 'DFR', stages: this.stages.map((s) => s.describe()) }; }
  }

  function powf(x, y) { return fround(Math.pow(fround(x), fround(y))); }

  // RVA (R2 a): m lines in parallel, their outputs summed; then two low-pass sections on the sum when the filter
  // is not in the loop. The delays from size and min (a1) or from width, depth and height (a2); the lines as a3;
  // random taps as a4.
  class RvaProc {
    constructor(p, label, draw) {
      const size = p[0], mn = p[1], feedbk = p[3], gain = p[4], cutoff = p[5];
      const fpar = trunc(p[6]), fmod = p[7], rate = p[8], ftap = p[15];
      if (ftap > 0) throw new Error(`TF2Room: ${label} asks for a reverb with a tap factor (the four-tap delay kinds), which is not built`);
      const w = Math.abs(p[9]), dd = Math.abs(p[10]), h = Math.abs(p[11]);
      let m = trunc(Math.min(Math.max(p[2], fround(1)), fround(12)));
      const D = [], A = [], B = [];
      if (trunc(w) === 0 && trunc(dd) === 0 && trunc(h) === 0) {
        // a1: step = (size - min) x (1/m), a reciprocal multiplied; two truncations; the far delay never reached.
        const inv = fround(1 / m);
        const b = trunc(fround(fround(gain * 4096) * inv));
        const step = fround(fround(size - mn) * inv);
        for (let i = 0; i < m; i++) {
          const Di = trunc(fround(fround(trunc(fround(i * step)) + mn) * MS));
          D.push(Di);
          const fb = i === 0 ? feedbk : powf(feedbk, fround(Di / D[0]));
          A.push(trunc(Math.min(fb * 4096, 4091.9)));
          B.push(b);
        }
      } else {
        // a2: the count forced to 3, 6, 9 or 12; sizes and factors sorted together, longest first.
        m = m < 3 ? 3 : (m === 4 || m === 5) ? 6 : (m === 7 || m === 8) ? 9 : m > 9 ? 12 : m;
        const sz = [w, dd, h], f = [p[12], p[13], p[14]];
        const sw = (i, j) => { let t = sz[i]; sz[i] = sz[j]; sz[j] = t; t = f[i]; f[i] = f[j]; f[j] = t; };
        if (sz[2] > sz[1]) sw(1, 2);
        if (sz[1] > sz[0]) sw(0, 1);
        if (sz[2] > sz[1]) sw(1, 2);
        if (f[0] === 0 && f[1] === 0 && f[2] === 0) {
          // The feedbacks from the truncated sizes.
          f[0] = powf(feedbk, fround(trunc(sz[0]) / trunc(sz[2])));
          f[1] = powf(feedbk, fround(trunc(sz[1]) / trunc(sz[2])));
          f[2] = feedbk;
        }
        // The push-apart term is computed once and reused for the largest size (R2 difference 2).
        const L = fround(7 * Math.floor(m / 3));
        const d12 = fround(sz[1] - sz[2]), e = fround(L - d12);
        if (!(d12 > L)) sz[1] = fround(e + sz[1]);
        if (!(fround(sz[0] - sz[1]) > L)) sz[0] = fround(e + sz[0]);
        const b = trunc(fround(fround(gain * 4096) / fround(m)));   // a division here
        for (let i = 0; i < m; i++) {
          const j = i % 3, fj = f[j];
          let S = trunc(sz[j]), pre = false, extra = 0;
          if (fj < 0 && i < 3) {
            // The first round: the whole size, no extra, the factor kept negative. With a loop filter the line is
            // a predelay (FLINEAR); with none, a plain comb with the factor's size and |factor| (R2 a3).
            pre = true;
          } else {
            // A later round: a negative factor's size is quartered, floor 7 ms, its sign dropped (R2 difference 1).
            // As the model has it, this does not depend on the loop filter.
            if (fj < 0) S = Math.max(trunc(fround(sz[j] * fround(0.25))), 7);
            if (i >= 3) {
              const q = Math.floor(i / 3);
              extra = fround(Math.max(S * 0.18 * q, 7 * q));
            }
          }
          const total = trunc(extra) + S;
          if (total < 0) throw new Error(`TF2Room: ${label} builds a reverb line of negative length`);
          D.push(Math.floor(total * 44100 / 1000));
          const a = trunc(Math.min(fround(Math.abs(fj) * 4096), 4091.9));
          A.push(pre ? -a : a);
          B.push(b);
        }
      }
      for (let i = 0; i < m; i++) {
        if (!Number.isInteger(D[i]) || !Number.isInteger(A[i])) {
          throw new Error(`TF2Room: ${label} builds a reverb line that is not whole numbers (${D[i]} samples, feedback ${A[i]})`);
        }
      }
      this.m = m; this.A = A; this.notPinned = [];
      let sec = null;
      if (cutoff !== 0) {
        sec = filterCoefs(0, cutoff);
        if (!sec.pinned) this.notPinned.push(cutoff);
      }
      // No filter in the loop (the flag clear): plain lines and, with a cutoff, two sections on the sum.
      this.out = (sec && fpar === 0) ? [new Section(sec), new Section(sec)] : [];
      this.lines = [];
      for (let i = 0; i < m; i++) {
        const kind = (sec && fpar !== 0) ? (A[i] < 0 ? 4 : 2) : 0;
        this.lines.push(new Line(D[i], Math.abs(A[i]), B[i], kind, sec));
      }
      this.modulated = fmod > 0;
      if (this.modulated) {
        for (const line of this.lines) {
          // Per line, from its own length: depth, period and glide (R2 a4).
          const T = fround(line.D * F_SAMPLE_S);
          const depth = Math.min(Math.max(fround(fround(fmod * fround(0.001)) / T), fround(0.01)), fround(0.99));
          const Tr = fround(T * rate);
          const glide = Math.min(fround(Tr * 0.5), fround(0.02));
          const period = trunc(fround(Tr * SR));
          const lo = trunc(fround(fround(1 - depth) * line.D));
          line.modulate(period, lo, glide, draw);
        }
      }
    }
    next(x) {
      const lines = this.lines;
      let tot = 0;
      for (let i = 0; i < lines.length; i++) tot = (tot + lines[i].next(x)) | 0;
      const out = this.out;
      if (out.length) { tot = out[0].next(tot); tot = out[1].next(tot); }
      return tot;
    }
    describe() {
      const d = {
        t: 'RVA',
        lines: this.lines.map((l, i) => Object.assign(l.describe(), { fb: this.A[i] })),
        out: this.out.map((s) => s.describe()),
        mod: this.modulated
          ? this.lines.map((l) => ({ period: l.period, lo: l.lo, glide: l.ramp.n, step: l.ramp.step }))
          : null,
      };
      if (this.notPinned.length) d.notPinned = this.notPinned;
      return d;
    }
  }

  // AMP (AM 2): the clip (only when VTH < 4096 and DMIX != 0), out = (G x x) >> 12 with the gain as it stood at
  // the sample's start, the glide, then the counter (a firing on sample PERIOD, then every PERIOD + 1).
  class AmpProc {
    constructor(p, draw) {
      const gain = p[0], vth = p[1], dmix = p[2], vfeed = p[3], rate = p[4], depth = p[5], glide = p[6], rnd = p[7];
      let per;
      if (rate > 0) {
        this.glide = fround(glide * fround(0.001));
        this.depth = trunc(fround(depth * 4096));
        per = fround(1 / Math.max(rate, 0.01));
      } else {
        this.glide = 0; this.depth = 0; per = 0;
      }
      this.period = this.cnt = trunc(fround(per * SR));
      this.vth = trunc(fround(vth * 32767));
      this.g0 = this.g = trunc(fround(gain * 4096));
      this.dmix = trunc(fround(dmix * 4096));
      this.vfeed = trunc(fround(vfeed * 4096));    // stored, never read: "feed" does nothing
      this.rand = rnd > 0;
      this.ramping = false; this.ramp = null; this.draw = draw;
      this.glideN = cvtt(fround(this.glide * SR));
    }
    next(x) {
      if (this.vth < 0x1000 && this.dmix !== 0) {  // the threshold (x 32767) is tested against 4096
        const v = this.vth;
        const c = x > v ? v : Math.max(x, -v);
        x = this.dmix >= 0x1000 ? c : (x + (imul((c - x) | 0, this.dmix) >> 12)) | 0;
      }
      let g = this.g;
      const out = imul(g, x) >> 12;
      if (this.ramping) {
        g = this.g = this.ramp.next();
        if (this.ramp.done) this.ramping = false;
      } else if (this.period === 0) {
        return out;
      }
      if (this.period !== 0) {
        const c = this.cnt;
        this.cnt = c - 1;
        if (c === 0) {
          this.cnt = this.period;
          const g0 = this.g0;
          const lo = (g0 - (imul(g0, this.depth) >> 12)) | 0;
          const tgt = this.rand ? this.draw(Math.min(lo, g0), Math.max(lo, g0)) | 0 : (g === lo ? g0 : lo);
          this.ramp = new Ramp(this.glide, this.g, tgt);
          this.ramping = true;
        }
      }
      return out;
    }
    describe() {
      return { t: 'AMP', g0: this.g0, vth: this.vth, dmix: this.dmix, vfeed: this.vfeed, period: this.period,
        depth: this.depth, glide: this.glideN, rand: this.rand ? 1 : 0 };
    }
  }

  // MDY (AM 3): a delay built by the delay's own rules under MDY's clamp; a draw every PERIOD + 1 samples of a
  // whole-sample tap in [trunc((1 - depth) x max), max], cross-faded by a 0 to 4096 ramp over the glide; then
  // the mix: 4096 the delay's output, 2048 (y + x) >> 1, else x + (((y - x) x MIX) >> 12).
  class MdyProc {
    constructor(p, label, draw) {
      this.notPinned = [];
      this.line = lineFromDelayParams(p, label, this.notPinned);
      const glide = fround(p[10] * fround(0.001));
      const per = p[8] !== 0 ? fround(1 / p[8]) : 0;
      const period = trunc(fround(per * SR));
      const lo = trunc(fround(fround(1 - p[9]) * this.line.D));
      this.line.modulate(period, lo, glide, draw);
      this.mix = trunc(fround(p[11] * 4096));
    }
    next(x) {
      const y = this.line.next(x);
      const mix = this.mix;
      if (mix === 0x1000) return y;
      if (mix === 0x800) return ((y + x) | 0) >> 1;
      return ((imul((y - x) | 0, mix) >> 12) + x) | 0;
    }
    describe() {
      const l = this.line;
      const d = { t: 'MDY', line: l.describe(), period: l.period, lo: l.lo, glide: l.ramp.n, step: l.ramp.step,
        mix: this.mix };
      if (this.notPinned.length) d.notPinned = this.notPinned;
      return d;
    }
  }

  // ---------------------------------------------------------------- a preset and its instance (R2 d)

  let defaultTable = null;
  function setTable(table) { defaultTable = table || null; }
  function getTable(table) {
    if (table) return table;
    if (defaultTable) return defaultTable;
    if (root && root.TF2_ROOM_PRESETS) return root.TF2_ROOM_PRESETS;
    return null;
  }

  // A preset of the table by number, or null if the table does not hold it.
  function presetOf(n, table) {
    const t = getTable(table);
    if (typeof n !== 'number' || !Number.isInteger(n) || !t) return null;
    return Object.prototype.hasOwnProperty.call(t, String(n)) ? t[String(n)] : null;
  }

  function labelOf(preset, n) {
    if (n !== undefined && n !== null) return `preset ${n}`;
    return preset && preset.name ? `preset "${preset.name}"` : 'a preset';
  }

  // Checks a preset's form and refuses by name what is not built. Returns the preset.
  function checkPreset(preset, label) {
    if (!preset || !Array.isArray(preset.p) || !Array.isArray(preset.h) || preset.h.length < 6) {
      throw new Error(`TF2Room: ${label} is not a preset ({h: [6 values], p: [[type, [values]], ...]})`);
    }
    if (fround(+preset.h[2]) !== 0) throw new Error(`TF2Room: ${label} has a one-shot duration, which is not built`);
    if (fround(+preset.h[3]) !== 0) throw new Error(`TF2Room: ${label} has a fade time of its own, which is not built`);
    if (preset.p.length < 1 || preset.p.length > 5) {
      throw new Error(`TF2Room: ${label} has ${preset.p.length} processors (1 to 5 in a plain chain)`);
    }
    for (const proc of preset.p) {
      const type = proc && proc[0];
      if (!Array.isArray(proc) || !Array.isArray(proc[1]) || proc[1].length > 16) {
        throw new Error(`TF2Room: ${label} has a processor that is not [type, [up to 16 values]]`);
      }
      if (![TYPE.NULL, TYPE.DLY, TYPE.RVA, TYPE.MDY, TYPE.DFR, TYPE.AMP].includes(type)) {
        throw new Error(`TF2Room: ${label} asks for the ${TYPE_NAME[type] || `processor type ${type}`} processor, which is not built`);
      }
    }
    return preset;
  }

  // An instance of a preset: the processors in the file's order, out of one into the next, nothing after.
  // `draw(lo, hi)` gives the random taps' whole numbers, in the order the processors ask (per sample, in chain
  // order, a reverb's lines in line order), as the model does it.
  class Instance {
    constructor(preset, draw, label) {
      checkPreset(preset, label);
      if (typeof draw !== 'function') draw = seededDraw(0);
      this.header = preset.h.slice(0, 6).map((v) => fround(+v));
      this.units = preset.p.map(([type, values]) => {
        const p = clampParams(type, values);
        switch (type) {
          case TYPE.NULL: return new NullProc();
          case TYPE.DLY: return new DlyProc(p, label);
          case TYPE.DFR: return new DfrProc(p);
          case TYPE.RVA: return new RvaProc(p, label, draw);
          case TYPE.AMP: return new AmpProc(p, draw);
          default: return new MdyProc(p, label, draw);
        }
      });
      // A one-, two- or three-processor chain gets a direct path, without a loop.
      const u = this.units;
      this.next = u.length === 1 ? (x) => u[0].next(x)
        : u.length === 2 ? (x) => u[1].next(u[0].next(x))
        : u.length === 3 ? (x) => u[2].next(u[1].next(u[0].next(x)))
        : (x) => { for (let i = 0; i < u.length; i++) x = u[i].next(x); return x; };
    }
    process(input, output = new Int32Array(input.length)) {
      const n = input.length, next = this.next;
      for (let i = 0; i < n; i++) output[i] = next(input[i] | 0);
      return output;
    }
    describe() { return this.units.map((u) => u.describe()); }
  }

  function resolvePreset(p, table) {
    if (typeof p === 'number') return presetOf(p, table);
    return p;
  }

  // createInstance(preset or number, draw): a fresh instance, its lines silent.
  function createInstance(preset, draw, table) {
    const n = typeof preset === 'number' ? preset : undefined;
    const p = resolvePreset(preset, table);
    if (!p) throw new Error(`TF2Room: the table holds no preset ${preset}`);
    return new Instance(p, draw, labelOf(p, n));
  }

  // ---------------------------------------------------------------- the voice's shares and entry (R2 f)

  // The two limits of a voice channel from the four mix values (dsp_mix_min, dsp_mix_max, dsp_db_min,
  // dsp_db_mixdrop): the drop applies when 60 <= trunc(dB min). Singles.
  function limitsOf(mixMin, mixMax, dbMin, drop) {
    let mn = fround(mixMin), mx = fround(mixMax);
    if (VOICE_DB <= trunc(fround(dbMin))) { mn = fround(mn * fround(drop)); mx = fround(mx * fround(drop)); }
    return { mn, mx };
  }

  // { room, direct } of 256 from a channel's limits, at the voice's distance; dsp_volume 1.
  function sharesOfLimits(lim) {
    const d = Math.min(Math.max(fround(VOICE_DIST), fround(DIST_MIN)), fround(DIST_MAX));
    const t = fround(fround(d - fround(DIST_MIN)) / fround(fround(DIST_MAX) - fround(DIST_MIN)));
    const mix = fround(fround(t * fround(lim.mx - lim.mn)) + lim.mn);
    const M = fround(mix * 256);
    return { room: Math.min(trunc(M), 256), direct: trunc(fround(256 - M)) };
  }

  // The four mix values of a header: a preset ({h}), its 6-value header, or the 4 values (min, max, dB min, drop).
  function mixValuesOf(header) {
    const h = header && Array.isArray(header.h) ? header.h : header;
    if (!Array.isArray(h) || (h.length !== 4 && h.length !== 6)) {
      throw new Error('TF2Room: a header is [mix min, mix max, dB min, mixdrop] or the 6 values of a preset');
    }
    return h.length === 6 ? [h[0], h[1], h[4], h[5]] : h.slice();
  }

  // shares(header) -> { room, direct }: a voice's two shares of 256 under that header (R2 f).
  function shares(header) {
    const v = mixValuesOf(header);
    return sharesOfLimits(limitsOf(v[0], v[1], v[2], v[3]));
  }

  // entry(s, share): the voice's 16-bit sample times the channel's float volume 255 x share / 256, rounded to
  // single precision once, times 1/256, truncated toward zero (W3-07 section 1; R2 f).
  function entry(s, share) {
    return trunc(fround(s * (255 * share / 256)) / 256);
  }

  // ---------------------------------------------------------------- the slot (R2 d; the W3-17a second read)

  const NO_REQUEST = Symbol('none requested');

  // A preset's value as one string (its header and processors as singles), so that two equal presets compare
  // equal, as the engine compares numbers (the second read, row 19).
  function signatureOf(preset) {
    return JSON.stringify([preset.h.slice(0, 6).map((v) => fround(+v)),
      preset.p.map(([t, v]) => [t, f32array(v, 16)])]);
  }

  // createSlot({ fade, preset, seed | draw, table, preroll }): one channel; set(preset, number or null);
  // process(input, output) on 32-bit integers. "None" is the input itself. At the start of each 512-sample block
  // of the slot's own count, in the engine's order (second read, rows 1 to 5, F1, F2):
  //   1. the update: a waiting request is taken only if the ramp has reported done (0x18003f254 to 0x18003f29c);
  //      taking it makes the instance now the one before, and starts the ramp;
  //   2. (the mixer's shares are asked here: they see the update and not yet the slot stage);
  //   3. the slot stage: once the ramp has reported done, the old instance is dropped and "before" is cleared
  //      (0x18003fd21 to 0x18003fd3a, 0x180036595).
  // In a fade, each sample: the new instance, then the old (they draw in that order: row 7); the ramp is stepped,
  // then used (row 3); out = old + (((new - old) x r) >> 12). The call that reports done repeats the last weight
  // (4095), and the weight stays there, both instances running, to the end of that block (row 4). For a change
  // taken at sample 0: sample k has the ramp's (k + 1)-th value, 4095 on 8819 and 8820, and 8821 to 9215 at 4095;
  // the new preset alone from 9216.
  // A slot made with a preset starts with the ramp done and the lines silent (row 18); `preroll` runs that
  // instance on so many zeros first (the slot's count does not move). One random stream for the slot.
  class Slot {
    constructor(opts = {}) {
      this.table = opts.table || null;
      this.fadeSeconds = opts.fade !== undefined ? opts.fade : ROOM_FADE;
      this.draw = drawFrom(opts, 0);
      this.onTake = typeof opts.onTake === 'function' ? opts.onTake : null;
      this.ramp = new Ramp(this.fadeSeconds, 0, 4096);
      this.rampDone = true;
      this.count = 0;
      this.key = null; this.sig = null; this.inst = null;   // now
      this.prevKey = null; this.prevInst = null;           // before (in a fade: the outgoing instance)
      this.fading = false; this.xf = 0;
      this.request = NO_REQUEST;
      this.updatedAt = -1; this.blockActive = false;
      // Made with a number the table does not hold, the slot keeps what it had, which at its start is nothing
      // (Decision 11).
      const r = opts.preset === undefined ? null : this.resolve(opts.preset);
      if (r && r.inst) {
        this.key = r.key; this.sig = r.sig; this.inst = r.inst;
        if (this.onTake) this.onTake(r.key, r.preset);
        for (let i = 0, n = opts.preroll | 0; i < n; i++) this.inst.next(0);
      }
    }

    // { key, sig, preset, inst } for a request; for "none" no instance, and the table's preset 0 as the preset
    // whose header is taken (row 9); null for a number the table does not hold.
    resolve(p) {
      if (p === null || p === undefined || p === 0) {
        return { key: null, sig: null, preset: presetOf(0, this.table), inst: null };
      }
      const n = typeof p === 'number' ? p : undefined;
      const preset = resolvePreset(p, this.table);
      if (!preset) return null;
      return { key: n !== undefined ? n : preset, sig: signatureOf(preset), preset,
        inst: new Instance(preset, this.draw, labelOf(preset, n)) };
    }

    // The latest request wins, as the engine compares its variable with the number last used once per block. A
    // number the table does not hold leaves the slot as it is (Decision 11), and so drops an earlier request.
    set(p) {
      const r = this.resolve(p);
      if (r === null) { this.request = NO_REQUEST; return false; }
      this.request = r;
      return true;
    }

    // Step 1 of a block, once per block: the update.
    update() {
      if (this.updatedAt === this.count) return;
      this.updatedAt = this.count;
      if (this.request === NO_REQUEST || !this.rampDone) return;
      const r = this.request;
      this.request = NO_REQUEST;
      if (this.sameAsNow(r)) return;              // the same preset as now: no change
      this.prevKey = this.key; this.prevInst = this.inst;
      this.key = r.key; this.sig = r.sig; this.inst = r.inst;
      this.fading = true; this.rampDone = false; this.ramp.reset(); this.xf = 0;
      if (this.onTake) this.onTake(r.key, r.preset);
    }

    // The engine compares numbers (row 19): two numbers by number (26 and 27 are equal presets, and a change);
    // a preset given as an object by its value, so an equal copy of the preset now changes nothing.
    sameAsNow(r) {
      if (r.key === null || this.key === null) return r.key === this.key;
      if (typeof r.key === 'number' && typeof this.key === 'number') return r.key === this.key;
      return r.sig === this.sig;
    }

    // Before the next sample: if it starts a block, that block's update. (The path calls this before it reads
    // the four mix values or the shares, which the engine reads after the update.)
    prepare() {
      if ((this.count & (BLOCK - 1)) === 0) this.update();
    }

    // Whether the room slot counts as holding a preset for the block of the next sample (what the mixer tests for
    // the shares, after the update and before the slot stage): now or before.
    activeForBlock() {
      if ((this.count & (BLOCK - 1)) === 0) {
        this.update();
        return this.key !== null || this.prevKey !== null;
      }
      return this.blockActive;
    }

    process(input, output = new Int32Array(input.length)) {
      const n = input.length;
      for (let i = 0; i < n; i++) {
        if ((this.count & (BLOCK - 1)) === 0) {
          this.update();
          this.blockActive = this.key !== null || this.prevKey !== null;
          if (this.fading && this.rampDone) {     // the slot stage after a finished fade
            this.fading = false; this.prevInst = null; this.prevKey = null;
          }
        }
        const x = input[i] | 0;
        let out;
        if (!this.fading) {
          out = this.inst ? this.inst.next(x) : x;
        } else {
          const b = this.inst ? this.inst.next(x) : x;
          const a = this.prevInst ? this.prevInst.next(x) : x;
          this.xf = this.ramp.next();
          if (this.ramp.done) this.rampDone = true;
          out = (a + (imul((b - a) | 0, this.xf) >> 12)) | 0;
        }
        output[i] = out;
        this.count++;
      }
      return output;
    }

    // Whether the slot holds a preset now, or held one before.
    active() { return this.key !== null || this.prevKey !== null; }

    state() {
      return { preset: this.key, previous: this.prevKey, fading: this.fading, rampDone: this.rampDone,
        requested: this.request === NO_REQUEST ? undefined : this.request.key, count: this.count };
    }

    describe() { return this.inst ? this.inst.describe() : null; }
  }

  function createSlot(opts) { return new Slot(opts); }

  // ---------------------------------------------------------------- the tail's end (Decision 8)

  // Over the path's output, sample by sample: a sample is "made with no voice" when both of its inputs are 0. The
  // output ends at the first sample where its last 22,050 values, all made with no voice, lie within 32 units of
  // each other (max - min <= 32), or when 882,000 such samples have passed. A voice sample starts it over.
  class TailRule {
    constructor() {
      const cap = 32768;                          // > TAIL_WINDOW + 1: ring buffers for two monotonic deques
      this.mask = cap - 1;
      this.hiV = new Int32Array(cap); this.hiN = new Int32Array(cap);
      this.loV = new Int32Array(cap); this.loN = new Int32Array(cap);
      this.reset();
      this.at = -1;
    }
    reset() {
      this.run = 0; this.ended = false; this.length = 0;
      this.hiH = 0; this.hiT = 0; this.loH = 0; this.loT = 0;
    }
    push(y, voice, i) {
      if (voice) { if (this.run !== 0 || this.ended) this.reset(); return; }
      if (this.ended) return;
      const n = ++this.run, m = this.mask;
      while (this.hiT !== this.hiH && this.hiV[(this.hiT - 1) & m] <= y) this.hiT = (this.hiT - 1) & m;
      this.hiV[this.hiT] = y; this.hiN[this.hiT] = n; this.hiT = (this.hiT + 1) & m;
      while (this.loT !== this.loH && this.loV[(this.loT - 1) & m] >= y) this.loT = (this.loT - 1) & m;
      this.loV[this.loT] = y; this.loN[this.loT] = n; this.loT = (this.loT + 1) & m;
      if (this.hiN[this.hiH] <= n - TAIL_WINDOW) this.hiH = (this.hiH + 1) & m;
      if (this.loN[this.loH] <= n - TAIL_WINDOW) this.loH = (this.loH + 1) & m;
      if ((n >= TAIL_WINDOW && this.hiV[this.hiH] - this.loV[this.loH] <= TAIL_BAND) || n >= TAIL_CAP) {
        this.ended = true; this.length = n; this.at = i;
      }
    }
  }

  // ---------------------------------------------------------------- the room path

  // createRoomPath({ seed, room, water, roomDraw, waterDraw, waterPreset, table }): the engine's order after the
  // voice's two entries. The room slot (0.2 s) on the room buffer, its output added to the direct buffer, then,
  // under water, the whole sum through the water instance. Returns the sum before the clip.
  //   room: what the room slot is made with (no fade at the path's start). A number the table does not hold gives
  //     no room (Decision 11).
  //   water: under water from the first sample. There is no water fade and no fresh water instance (second read,
  //     row 11, F4: 0x180047256 to 0x18004729b): the water instance (preset 14, dsp_water's; `waterPreset` in its
  //     place) is made once with the path and, block by block, either runs on the whole sum or is not run at all,
  //     its lines, amplifier and draws waiting where they were. Made under water, it has first run 44,100 samples
  //     of silence (it has been under water before, so its amplifier rests on 1640); made dry, it is fresh, and the
  //     first dive has the amplifier's 100 ms at full gain (a first dive since the level loaded).
  //   seed: the render's; the room slot draws from mulberry32((seed ^ 0x524F4F4D) >>> 0), the water instance from
  //     mulberry32((seed ^ 0x57415452) >>> 0). roomDraw, waterDraw: draw functions (lo, hi) in their place.
  // Note that a path is never "nothing": it always holds the room slot and the water instance. A render with no
  // room and not under water should make no path at all (Decision 4).
  class RoomPath {
    constructor(opts = {}) {
      const seed = Number(opts.seed || 0) >>> 0;
      this.table = opts.table || null;
      this.mix = MIX_START.map(fround);
      this.limits = null;
      this.room = new Slot({
        fade: ROOM_FADE, table: this.table, preset: opts.room,
        draw: typeof opts.roomDraw === 'function' ? opts.roomDraw : seededDraw((seed ^ ROOM_SEED_XOR) >>> 0),
        // Setting a preset on the room slot overwrites the four mix values from its header when the slot takes
        // it (R2 d; second read, row 8); "none" is preset 0, whose header is taken too (row 9, F3).
        onTake: (key, preset) => {
          if (preset) this.mix = [preset.h[0], preset.h[1], preset.h[4], preset.h[5]].map((v) => fround(+v));
        },
      });
      const wp = opts.waterPreset !== undefined ? opts.waterPreset : WATER_PRESET;
      const waterPreset = resolvePreset(wp, this.table);
      if (!waterPreset) throw new Error(`TF2Room: the table holds no preset ${wp} for the water`);
      this.waterInst = new Instance(waterPreset, typeof opts.waterDraw === 'function' ? opts.waterDraw
        : seededDraw((seed ^ WATER_SEED_XOR) >>> 0), labelOf(waterPreset, typeof wp === 'number' ? wp : undefined));
      if (opts.water) for (let i = 0; i < WATER_PREROLL; i++) this.waterInst.next(0);
      this.waterOn = !!opts.water; this.waterAsked = this.waterOn;
      this.count = 0;
      this.tail = new TailRule();
      this.scratch = new Int32Array(0);
      this.voice = new Uint8Array(0);
    }

    // A preset number, a preset ({h, p}) or null; taken at the room slot's next block once its ramp is done,
    // with its 0.2 s fade.
    setRoom(p) { return this.room.set(p); }
    // Under water or not: from the next block's start, at once (no fade).
    setWater(on) { this.waterAsked = !!on; return true; }

    // A voice channel starts: its two limits are fixed from the four mix values as the block of the next sample
    // has them (after that block's update, as the engine's mix comes after it: R2 f; second read, F2).
    spurtStart() {
      this.room.prepare();
      const v = this.mix;
      this.limits = limitsOf(v[0], v[1], v[2], v[3]);
      return this.limits;
    }

    // { room, direct } for the block of the next sample: 0 and 256 while the room slot holds no preset now and
    // held none before, as the mixer tests it after the block's update and before its slot stage (F2); else from
    // the channel's limits (fixed now if no spurt has started).
    shares() {
      const active = this.room.activeForBlock();
      if (!this.limits) this.spurtStart();
      if (!active) return { room: 0, direct: 256 };
      return sharesOfLimits(this.limits);
    }

    // direct, room: Int32Arrays at 44100 Hz, already entered (and upsampled by the caller). Returns out (made if
    // not given): direct + room slot(room), then the water instance on the blocks under water. out may be either
    // input.
    process(direct, room, out) {
      const n = direct.length;
      if (room.length !== n) throw new Error('TF2Room: the direct and room buffers differ in length');
      if (!out) out = new Int32Array(n);
      if (this.scratch.length < n) { this.scratch = new Int32Array(n); this.voice = new Uint8Array(n); }
      const wet = this.room.process(room, this.scratch.length === n ? this.scratch : this.scratch.subarray(0, n));
      const voice = this.voice, water = this.waterInst;
      for (let i = 0; i < n; i++) {
        const d = direct[i] | 0, r = room[i] | 0;
        voice[i] = (d !== 0 || r !== 0) ? 1 : 0;
        if ((this.count & (BLOCK - 1)) === 0) this.waterOn = this.waterAsked;
        const sum = (d + wet[i]) | 0;
        out[i] = this.waterOn ? water.next(sum) : sum;
        this.count++;
      }
      const tail = this.tail;
      tail.at = -1;
      for (let i = 0; i < n; i++) tail.push(out[i], voice[i] === 1, i);
      return out;
    }

    // Decision 8's rule after the last process(): { ended, at, length }. ended: the output has ended (the rule
    // held, or the cap was reached) since the last voice sample. at: the index, in the last block, of the output's
    // last sample, if it ended in that block; else -1. length: how many samples made with no voice the output
    // has at its end (the tail's length), or so far.
    tailLeft() {
      const t = this.tail;
      return { ended: t.ended, at: t.at, length: t.ended ? t.length : t.run };
    }

    state() {
      return { room: this.room.state(), water: { on: this.waterOn, asked: this.waterAsked }, mix: this.mix.slice(),
        limits: this.limits ? { min: this.limits.mn, max: this.limits.mx } : null, count: this.count };
    }
  }

  function createRoomPath(opts) { return new RoomPath(opts); }

  // ---------------------------------------------------------------- the automatic room (order part b)

  // dsp_room 1: the engine measures the space around the listener (R2 e4: not built here; the app has no map),
  // names its shape (R2 e2), classes its measures (R2 e1) and builds a preset from the shape's two templates A
  // ("small, bright") and B ("huge, dull"): a whole copy of B if the size class is above 1, else of A, then chosen
  // parameters blended between A and B by a class (R2 e1; differences 10 to 13).

  // The shapes by the engine's number (R2 e1, e2): the name, the variable that holds the pair's first template,
  // and that variable's default (W3-15 section 4). Shapes 7 and 8, 4 and 9, 6 and 10 share a pair.
  const SHAPES = [
    ['room', 'adsp_room_min', 102], ['duct', 'adsp_duct_min', 106], ['hall', 'adsp_hall_min', 110],
    ['tunnel', 'adsp_tunnel_min', 114], ['street', 'adsp_street_min', 118], ['alley', 'adsp_alley_min', 122],
    ['courtyard', 'adsp_courtyard_min', 126], ['open space', 'adsp_openspace_min', 130],
    ['open wall', 'adsp_openwall_min', 130], ['open street', 'adsp_openstreet_min', 118],
    ['open courtyard', 'adsp_opencourtyard_min', 126],
  ].map(([name, variable, base], number) => ({ number, name, variable, base }));

  // The measures as the engine has them (R2 e1: whole units, inches to this code), checked:
  // { sky, width, length, height, reflectivity, openSides }, every one given (none defaults). Open sides (the
  // horizontal rays whose reflectivity is 0: met nothing or sky, R2 e4) count only under the sky. Diffusion is not a
  // measure: this build of the engine never measures it, so its class is always 0 and the "diffuse" pairs
  // (104/105 ... 132/133) are never chosen (R2 e4, difference 10).
  function measuresOf(m) {
    if (!m || typeof m !== 'object') {
      throw new Error('TF2Room: the automatic room needs measures { sky, width, length, height, reflectivity, openSides }');
    }
    if (typeof m.sky !== 'boolean') {
      throw new Error(`TF2Room: the automatic room's sky is ${m.sky}; true (under the sky) or false`);
    }
    const out = { sky: m.sky, width: m.width, length: m.length, height: m.height, reflectivity: m.reflectivity,
      openSides: m.openSides };
    for (const k of ['width', 'length', 'height']) {
      if (!Number.isInteger(out[k]) || out[k] < 0 || out[k] > 0x7FFFFFFF) {
        throw new Error(`TF2Room: the automatic room's ${k} is ${m[k]}; the engine measures whole units, 0 or more`);
      }
    }
    if (typeof out.reflectivity !== 'number' || !(out.reflectivity >= 0 && out.reflectivity <= 1)) {
      throw new Error(`TF2Room: the automatic room's reflectivity is ${m.reflectivity}; it is a mean of values from 0 to 1`);
    }
    if (!Number.isInteger(out.openSides) || out.openSides < 0 || out.openSides > 4) {
      throw new Error(`TF2Room: the automatic room's open sides are ${m.openSides}; 0 to 4`);
    }
    return out;
  }

  // A vertical shaft: indoors, a space more than three times as high as it is long (doubles, strictly). The engine
  // exchanges height and length in its record (0x180032059 to 0x180032083), names the shape and works out the
  // classes from that record, and only then exchanges them back (0x18003219f to 0x1800321b1): so in a shaft the
  // length class comes from the height, the height class from the length, and the size class follows (W3-17b second
  // read, finding 1, which corrects R2 e2's "swapped for the test"). The measures that replace a negative template
  // value are read after the exchange back: they stay the true ones.
  const isShaft = (m) => !m.sky && m.height > 3 * m.length;
  const classRecord = (m) => (isShaft(m) ? Object.assign({}, m, { length: m.height, height: m.length }) : m);

  // The shape (R2 e2, 0x180032040), from the record (a shaft's exchanged). Under the sky n open sides (1 to 4) give
  // shape 11 - n.
  function shapeOf(m) {
    const W = m.width;
    let L = m.length;
    if (!m.sky) {
      if (isShaft(m)) L = m.height;
      if (L > 4 * W && W <= 48) return 1;                       // duct
      if (L > 2.5 * W && W > 48 && W <= 96) return 2;           // hall
      if (L > 4 * W && W > 96) return 3;                        // tunnel
      return 0;                                                 // room
    }
    if (m.openSides > 0) return 11 - m.openSides;
    if (L <= 2.5 * W) return 6;                                 // courtyard
    return W <= 144 ? 5 : 4;                                    // alley, street
  }

  // The classes (R2 e1, 0x180032320; difference 13), each "over the lower limit, up to the upper"; `m` is the
  // engine's record, a shaft's length and height exchanged (classRecord).
  function classesOf(shape, m) {
    const W = m.width, L = m.length, H = m.height;
    const width = W > 576 ? 4 : W > 288 ? 3 : W > 144 ? 2 : W > 72 ? 1 : 0;
    const length = L > 1152 ? 4 : L > 576 ? 3 : L > 288 ? 2 : L > 144 ? 1 : 0;
    const height = H > 384 ? 4 : H > 216 ? 3 : H > 128 ? 2 : H > 48 ? 1 : 0;
    // The reflectivity is a single. Above 0.04 is tested as a double, at most 0.5 as a single, and above 0.8 as a
    // double against the double 0.8, so a reflectivity of exactly 0.8, the single 0.800000012, is class 3 (the
    // model's code, which the second read of the binary confirmed: W3-17a second read, row 20, 0x1800324c1 to
    // 0x18003254c). R2 e1's "2 for 0.5 < R <= 0.8" holds for every other value.
    const R = fround(m.reflectivity);
    const reflectivity = (R > 0.04 && R <= fround(0.5)) ? 1 : (R > fround(0.5) && R <= 0.8) ? 2 : R > 0.8 ? 3 : 0;
    let size;
    if (shape === 6 || shape === 10) size = L > 1200 ? 4 : L > 480 ? 3 : L > 240 ? 2 : L > 120 ? 1 : 0;  // courtyards
    else if (shape === 4 || shape === 5) size = width;          // street, alley
    else size = (width + length) >> 1;                          // the mean, truncated
    return { size, width, length, height, reflectivity, diffusion: 0 };
  }

  // A value written negative in a template is replaced by the measure (R2 e1): a reverb's width, depth or height by
  // the measure in feet, a delay's time or taps by the measure / 6 in ms; the arithmetic as the model has it (a
  // double product, the clamp, then a single).
  const feet = (units) => fround(Math.min(Math.max(fround(units) * (1 / 12), 6), 500));
  const sixth = (units) => fround(Math.min(Math.max(units * (1 / 6), 14), 500));

  // What is blended, per processor type, for its first and its second processor (R2 e1; difference 12 for which
  // are squared, 11 for the cutoffs blended from the dull template B toward A): [value index, class, squared,
  // from B, divisor, the measure that replaces a negative template value].
  const SQ = true, DULL = true;
  const BLEND = [
    [TYPE.DFR, [[0, 'size'], [1, 'size'], [2, 'size'], [3, 'size']]],
    [TYPE.RVA, [[3, 'size'], [1, 'size', SQ], [0, 'size', SQ], [4, 'size'], [2, 'size'], [7, 'size'], [8, 'size'],
      [9, 'width', SQ, false, 5, (m) => feet(m.width)], [10, 'length', SQ, false, 5, (m) => feet(m.length)],
      [11, 'height', SQ, false, 5, (m) => feet(m.height)], [12, 'width'], [13, 'length'], [14, 'height'],
      // The cutoff from the dull end by quarters of the reflectivity class (0 to 3): never all the way to A's.
      [5, 'reflectivity', false, DULL, 4]]],
    [TYPE.DLY, [[1, 'length', SQ, false, 5, (m) => sixth(m.length)], [2, 'length'], [3, 'length'],
      [8, 'length', SQ, false, 5, (m) => sixth(m.width)], [9, 'length', SQ, false, 5, (m) => sixth(m.length)],
      [10, 'length', SQ, false, 5, (m) => sixth(m.length)], [5, 'length', false, DULL], [6, 'length', false, DULL]]],
    // The other types, linear, A to B, divisor 5 (R2 e1; the W3-17b second read, section 1, confirmed each at its
    // address): FLT 0 to 4 on the size class (0x180032eb0), MDY 0 to 12 on the length class (0x180032e30), AMP 0 to 7
    // (0x180032e70), PTC 0 to 2 (0x180032ef0), CRS 0 to 3 (0x180032f30), ENV 0 to 8 (0x180032f70), EFO 0 to 3
    // (0x180032fb0) and LFO 0 to 3 (0x180032ff0) on the size class. No template of the table holds any of them; the
    // module builds no FLT, PTC, CRS, ENV, EFO or LFO instance, but the built values are the engine's.
    [TYPE.FLT, [0, 1, 2, 3, 4].map((i) => [i, 'size'])],
    [TYPE.MDY, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => [i, 'length'])],
    [TYPE.AMP, [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i, 'size'])],
    [TYPE.PTC, [0, 1, 2].map((i) => [i, 'size'])],
    [TYPE.CRS, [0, 1, 2, 3].map((i) => [i, 'size'])],
    [TYPE.ENV, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [i, 'size'])],
    [TYPE.EFO, [0, 1, 2, 3].map((i) => [i, 'size'])],
    [TYPE.LFO, [0, 1, 2, 3].map((i) => [i, 'size'])],
  ];

  // from + (to - from) x (class / divisor), the factor applied twice when squared: singles, step by step, as
  // R2 e1 reads it and the model computes it.
  function blendValue(from, to, cls, divisor, squared) {
    const t = fround(fround(cls) / fround(divisor));
    let d = fround(fround(to - from) * t);
    if (squared) d = fround(d * t);
    return fround(from + d);
  }

  // The index in a preset's processors of the n-th processor of a type, or -1.
  function nthOfType(preset, type, n) {
    for (let i = 0, k = 0; i < preset.p.length; i++) if (preset.p[i][0] === type && k++ === n) return i;
    return -1;
  }

  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const k of Object.keys(o)) deepFreeze(o[k]);
    }
    return o;
  }

  // The named cases (order part b, items 3 and 5). The app has no map, so a case is a set of measures that the
  // shape rules name the way its label says; no case sits on a threshold of a class or of the reflectivity
  // (`vent`'s width of 48 is the widest a duct can be, an integer test). Units are inches; the 14 examples are
  // examples, not measured spots. The two marked `measured` have their classes from a recording; their measures in
  // units are stand-ins that give those classes, since a take shows classes, not units.
  const caseRow = (key, label, sky, width, length, height, reflectivity, openSides, more) =>
    Object.assign({ key, label, measures: { sky, width, length, height, reflectivity, openSides } }, more || {});
  const ROOM_CASES = deepFreeze([
    caseRow('closet', 'Very small room', false, 120, 140, 100, 0.3, 0),
    caseRow('small_room', 'Small room', false, 200, 260, 120, 0.4, 0),
    caseRow('room', 'Room', false, 300, 400, 160, 0.4, 0),
    caseRow('large_room', 'Large room', false, 500, 700, 220, 0.4, 0),
    caseRow('great_hall', 'Great hall', false, 700, 1300, 400, 0.4, 0),
    caseRow('vent', 'Vent or duct', false, 48, 400, 64, 0.4, 0),
    caseRow('corridor', 'Corridor', false, 80, 400, 120, 0.4, 0),
    caseRow('long_corridor', 'Long corridor', false, 90, 1200, 120, 0.4, 0),
    caseRow('tunnel', 'Tunnel', false, 200, 1000, 150, 0.3, 0),
    caseRow('big_tunnel', 'Big tunnel', false, 280, 1400, 250, 0.4, 0),
    caseRow('alley', 'Alley, walls all round', true, 120, 600, 4800, 0.4, 0),
    caseRow('street', 'Street, walls all round', true, 300, 1300, 4800, 0.4, 0),
    caseRow('courtyard', 'Courtyard', true, 500, 700, 4800, 0.4, 0),
    caseRow('open', 'Open ground (a guess)', true, 2, 2, 4800, 0.08, 4, {
      note: 'A guess between two readings of how the engine measures under the sky: a level ray that meets the sky ' +
        'gives a distance of 1 (spans of 2: these measures, a copy of preset 130) or keeps 4800 (spans of 9600: size ' +
        'class 4, a copy of preset 131). Both give 5/256 to the room and the same level, which cannot be heard.',
    }),
    caseRow('set_c_room', 'Spawn-sized room (as recorded, Set C)', false, 300, 400, 160, 0.9, 0, {
      measured: true, set: 'Set C',
      note: 'Fitted to the owner\'s Set C: a room whose shorter side is 145 to 576 units (12 to 48 feet); the take ' +
        'fixes the size class (2), not the size. Reflectivity class 3 fits best, class 2 nearly as well. These ' +
        'measures are one room that builds this preset.',
    }),
    caseRow('set_d_street', 'Street (as recorded, Set D)', true, 300, 1000, 4800, 0.4, 0, {
      measured: true, set: 'Set D',
      note: 'Fitted to the owner\'s Set D, PC A (echoes at 68, 120 and 308 ms): a street 289 to 460 units wide and ' +
        '723 to 1152 long (24 to 38 by 60 to 96 feet). An open street (two walls open) with the same classes builds ' +
        'the same preset, so the take cannot tell the two apart. The take does not fix the reflectivity class; class ' +
        '1 is taken. These measures are one such street.',
    }),
  ]);

  // Places from the owner's log (order part b, item 4), when it comes: one row each, of the same shape as a case:
  //   { key, label, map, spot, measures: { sky, width, length, height, reflectivity, openSides }, shape, log, note }
  // `measures` in units, as buildAutomatic takes them. The console does not print units: its `adsp_debug` line
  // ("NEW DSP NODE: size:(a,b) height:(c) ... refl r ... sky s") prints whole feet, the length first, and no count
  // of open sides (W3-17b second read, section 4). placeFromDebug turns the printed numbers into measures and says
  // which classes the log leaves open. `shape`: the module's name for the shape line the console printed, to check
  // the build against; `log`: the printed numbers; `note`: which class was taken where the log left two open.
  // Nothing else is needed to add one.
  //   The rows: the owner's `adsp_debug 2` walk on ctf_2fort (Set K, 2026-11-10; the order's amendment after Sets K
  // and L). `log` is the printed line's numbers and, where they were read, the four mix values after the build.
  const placeRow = (key, label, spot, sky, width, length, height, reflectivity, shape, log, note) =>
    caseRow(key, label, sky, width, length, height, reflectivity, 0,
      Object.assign({ map: 'ctf_2fort', spot, shape, log }, note ? { note } : {}));
  const ROOM_PLACES = deepFreeze([
    placeRow('2fort_spawn_room', '2Fort: spawn room', 'the spawn room, the node measured on the spot',
      false, 372, 516, 240, 0.66, 'room', { size: [43, 31], height: 20, refl: 0.66, sky: 0, mix: [0.32, 0.8, 80, 0.5] },
      'The same spawn room also gave the remembered node 2fort_spawn_long: among remembered nodes in reach the ' +
      'largest width times length wins.'),
    placeRow('2fort_spawn_long', '2Fort: spawn room, remembered node', 'the same spawn room, the remembered node the engine went back to',
      false, 252, 1140, 192, 0.66, 'tunnel', { size: [95, 21], height: 16, refl: 0.66, sky: 0, mix: [0.4, 0.9, 80, 0.7] }),
    placeRow('2fort_indoor', '2Fort: indoors', 'indoors (soundscape 2fort.Indoor)',
      false, 708, 1440, 180, 0.55, 'room', { size: [120, 59], height: 15, refl: 0.55, sky: 0, mix: [0.32, 0.8, 80, 0.5] }),
    placeRow('2fort_tunnel', '2Fort: tunnel', 'the tunnel',
      false, 168, 2160, 192, 0.555, 'tunnel', { size: [180, 14], height: 16, refl: 0.555, sky: 0 },
      'The four mix values were not read at this node.'),
    placeRow('2fort_pond', '2Fort: pond', 'the pond (soundscape 2fort.OutdoorPond)',
      true, 912, 1344, 4800, 0.34, 'courtyard', { size: [112, 76], height: 400, refl: 0.34, sky: 1, mix: [0.21, 0.8, 95, 0.1] },
      'The printed numbers leave the open sides open; the shape line, OUTSIDE COURTYARD, and the mix values say none.'),
  ]);

  // The console's shape lines (`adsp_debug 2`; second read, section 4) and the shapes each can be: the open-sided
  // line is the same for all four open-sided shapes.
  const SHAPE_LINES = {
    'ROOM': [0], 'DUCT': [1], 'HALL': [2], 'TUNNEL': [3], 'OUTSIDE STREET': [4], 'OUTSIDE ALLEY': [5],
    'OUTSIDE COURTYARD': [6], 'OPEN SIDED OUTDOOR AREA': [7, 8, 9, 10],
  };

  // placeFromDebug({ size: [a, b], height: c, refl: r, sky: s, mix, shape }, { table }): the measures a new node's
  // printed line stands for (second read, section 4). The console prints each span as units / 12 rounded to a whole
  // foot, so a printed N is any whole number of units from 12N - 6 to 12N + 6 (which way a half foot goes was not
  // read): length = 12a (the first number), width = 12b, height = 12c (400 under an open sky: 4800, the ray's
  // length, the most a height can be). The reflectivity is printed to four decimals, so r stands for r - 0.00005 to r + 0.00005. `sky`: the
  // printed 1 or 0 (or a boolean). Optional: `mix`, the four values dsp_mix_min, dsp_mix_max, dsp_db_min and
  // dsp_db_mixdrop read after the build (the built preset's header: it tells an open-sided shape's pair, and a room's
  // copy), and `shape`, the console's shape line (or the module's name). Every space the printed numbers allow is
  // tried; spaces whose shape and classes agree are one candidate, kept with the measures nearest the printed ones
  // (fewer open sides first). Returns { measures, shape, shaft, classes, copy, candidates, open }: the first
  // candidate's, all the candidates, and the names of what differs among them ('shape', 'openSides', 'size',
  // 'width', 'length', 'height', 'reflectivity', 'copy'). A class is open where a printed number sits on a threshold
  // in feet: width 6, 12, 24, 48; length 12, 24, 48, 96; height 4, 11, 18, 32; a courtyard's length 10, 20, 40, 100;
  // reflectivity 0.0400, 0.5000, 0.8000. Under the sky without `mix` or `shape` the open sides stay open.
  function placeFromDebug(line, opts = {}) {
    if (!line || typeof line !== 'object') throw new Error('TF2Room: placeFromDebug needs the printed numbers { size: [a, b], height, refl, sky }');
    const { size, height, refl, mix } = line;
    const whole = (v) => Number.isInteger(v) && v >= 0;
    if (!Array.isArray(size) || size.length !== 2 || !whole(size[0]) || !whole(size[1])) {
      throw new Error(`TF2Room: the printed size is ${JSON.stringify(size)}; two whole numbers of feet, the length first`);
    }
    if (!whole(height)) throw new Error(`TF2Room: the printed height is ${height}; a whole number of feet`);
    if (typeof refl !== 'number' || !(refl >= 0 && refl <= 1)) throw new Error(`TF2Room: the printed reflectivity is ${refl}; 0 to 1`);
    if (![0, 1, true, false].includes(line.sky)) throw new Error(`TF2Room: the printed sky is ${line.sky}; 1 or 0`);
    const sky = line.sky === 1 || line.sky === true;
    let shapes = null;
    if (line.shape !== undefined) {
      const word = String(line.shape).trim().toUpperCase().replace(/\s+DETECTED$/, '');
      shapes = SHAPE_LINES[word] || SHAPES.filter((x) => x.name === line.shape).map((x) => x.number);
      if (!shapes.length) throw new Error(`TF2Room: "${line.shape}" is not a shape line the console prints`);
    }
    if (mix !== undefined && (!Array.isArray(mix) || mix.length !== 4 || !mix.every((v) => typeof v === 'number'))) {
      throw new Error('TF2Room: mix is [dsp_mix_min, dsp_mix_max, dsp_db_min, dsp_db_mixdrop]');
    }
    const table = opts.table || null;
    const units = (feet, max) => {
      const out = [];
      for (let u = Math.max(0, 12 * feet - 6); u <= Math.min(max, 12 * feet + 6); u++) out.push(u);
      return out;
    };
    // Spans are two rays of 4800, a height one ray: 400 printed under an open sky is 4800, the nearest in its range.
    const lengths = units(size[0], 9600), widths = units(size[1], 9600), heights = units(height, 4800);
    // The reflectivity: the printed value, and either side of a threshold within the printing's half step.
    const refls = [refl];
    const bits = new Float32Array(1), word = new Int32Array(bits.buffer);
    const nextSingle = (v, step) => { bits[0] = v; word[0] += step; return bits[0]; };   // v > 0: the neighbouring single
    for (const t of [0.04, 0.5, 0.8]) {
      if (Math.abs(refl - t) <= 0.00005) {
        const f = fround(t);
        for (const v of [f, nextSingle(f, 1), nextSingle(f, -1)]) {
          if (v >= 0 && v <= 1 && Math.abs(v - refl) <= 0.00005 && !refls.includes(v)) refls.push(v);
        }
      }
    }
    const header = (n) => { const t = presetOf(n, table); return t ? [t.h[0], t.h[1], t.h[4], t.h[5]].map((v) => fround(+v)) : null; };
    const found = new Map();
    for (const openSides of sky ? [0, 1, 2, 3, 4] : [0]) {
      for (const length of lengths) {
        for (const width of widths) {
          for (const h of heights) {
            for (const reflectivity of refls) {
              const m = { sky, width, length, height: h, reflectivity, openSides };
              const shapeNumber = shapeOf(m);
              if (shapes && !shapes.includes(shapeNumber)) continue;
              const classes = classesOf(shapeNumber, classRecord(m));
              const copy = SHAPES[shapeNumber].base + (classes.size > 1 ? 1 : 0);
              if (mix) {
                const hd = header(copy);
                if (!hd || !hd.every((v, i) => v === fround(mix[i]))) continue;
              }
              const key = [shapeNumber, classes.size, classes.width, classes.length, classes.height, classes.reflectivity, copy].join();
              const dist = Math.abs(length - 12 * size[0]) + Math.abs(width - 12 * size[1]) + Math.abs(h - 12 * height) +
                (reflectivity === refl ? 0 : 1);
              const was = found.get(key);
              if (!was || openSides < was.measures.openSides || (openSides === was.measures.openSides && dist < was.dist)) {
                found.set(key, { measures: m, shape: SHAPES[shapeNumber].name, shaft: isShaft(m), classes, copy, dist });
              }
            }
          }
        }
      }
    }
    if (!found.size) throw new Error('TF2Room: no space the printed numbers allow builds that shape and header');
    const candidates = [...found.values()].sort((x, y) => x.measures.openSides - y.measures.openSides || x.dist - y.dist)
      .map(({ dist, ...c }) => c);
    const differ = (f) => new Set(candidates.map(f)).size > 1;
    const open = [['shape', (c) => c.shape], ['openSides', (c) => c.measures.openSides], ['size', (c) => c.classes.size],
      ['width', (c) => c.classes.width], ['length', (c) => c.classes.length], ['height', (c) => c.classes.height],
      ['reflectivity', (c) => c.classes.reflectivity], ['copy', (c) => c.copy]].filter(([, f]) => differ(f)).map(([n]) => n);
    return Object.assign({}, candidates[0], { candidates, open });
  }

  // A named case or place by its key, or null.
  function roomCase(key) {
    return ROOM_CASES.find((r) => r.key === key) || ROOM_PLACES.find((r) => r.key === key) || null;
  }

  // buildAutomatic(measures, { table }): the engine's automatic room for these measures (R2 e1, e2; the W3-17b
  // second read). `measures` is { sky, width, length, height, reflectivity, openSides }, or a row of ROOM_CASES or
  // ROOM_PLACES, or its key. Returns { preset, shape, shapeNumber, variable, shaft, classes, pair, copy, measures,
  // key }: `preset` is of the table's form ({ name, h, p }, its values singles, frozen), ready for createInstance,
  // createSlot, createRoomPath and setRoom; `shaft` whether the space is a vertical shaft (the console says so);
  // `pair` the two templates [A, B]; `copy` the one copied whole; `key` the row's key, or null. The measuring
  // itself (R2 e3, e4) is not built.
  function buildAutomatic(arg, opts = {}) {
    let row = null;
    if (typeof arg === 'string') {
      row = roomCase(arg);
      if (!row) throw new Error(`TF2Room: no automatic room case or place is called "${arg}"`);
    } else if (arg && typeof arg === 'object' && arg.measures) {
      row = arg;
    }
    const m = measuresOf(row ? row.measures : arg);
    const shapeNumber = shapeOf(m);
    const shape = SHAPES[shapeNumber];
    const shaft = isShaft(m);
    const classes = classesOf(shapeNumber, classRecord(m));
    // The pair from the shape's variable, + 2 if the diffusion class is above 1 (R2 e1): it never is (R2 e4).
    const base = shape.base + (classes.diffusion > 1 ? 2 : 0);
    const table = opts.table || null;
    const A = presetOf(base, table), B = presetOf(base + 1, table);
    if (!A || !B) throw new Error(`TF2Room: the table holds no templates ${base} and ${base + 1} for the automatic ${shape.name}`);
    for (const [n, t] of [[base, A], [base + 1, B]]) {
      if (!Array.isArray(t.h) || !Array.isArray(t.p) || !t.p.every((q) => Array.isArray(q) && Array.isArray(q[1]))) {
        throw new Error(`TF2Room: template ${n} is not a preset ({h: [6 values], p: [[type, [values]], ...]})`);
      }
    }
    // A whole copy of B if the size class is above 1, else of A: header, processors, every value not blended.
    const copy = classes.size > 1 ? base + 1 : base;
    const src = copy === base ? A : B;
    const preset = { name: `automatic ${shape.name}`, h: f32array(src.h, 6),
      p: src.p.map(([type, values]) => [type, f32array(values, 16)]) };
    // Then the first and the second processor of each type, where the copy, A and B all have one.
    for (let n = 0; n < 2; n++) {
      for (const [type, rules] of BLEND) {
        const io = nthOfType(preset, type, n), ia = nthOfType(A, type, n), ib = nthOfType(B, type, n);
        if (io < 0 || ia < 0 || ib < 0) continue;
        const va = f32array(A.p[ia][1], 16), vb = f32array(B.p[ib][1], 16), out = preset.p[io][1];
        for (const [i, cls, squared, fromDull, divisor, measure] of rules) {
          if (measure && (va[i] < 0 || vb[i] < 0)) out[i] = measure(m);
          else out[i] = fromDull ? blendValue(vb[i], va[i], classes[cls], divisor || 5, squared)
            : blendValue(va[i], vb[i], classes[cls], divisor || 5, squared);
        }
      }
    }
    return { preset: deepFreeze(preset), shape: shape.name, shapeNumber, variable: shape.variable, shaft, classes,
      pair: [base, base + 1], copy, measures: m, key: row && row.key !== undefined ? row.key : null };
  }

  const api = {
    // the readings and the constants
    SR, BLOCK, ROOM_FADE, WATER_PRESET, WATER_PREROLL, ROOM_SEED_XOR, WATER_SEED_XOR,
    MIX_START: MIX_START.slice(), TAIL_BAND, TAIL_WINDOW, TAIL_CAP, TYPE: Object.assign({}, TYPE),
    RANGES: JSON.parse(JSON.stringify(RANGES)),
    PINNED_LP: Array.from(PINNED_LP, ([c, k]) => [c, k[0], k[1]]),
    // the table
    setTable, getTable: () => getTable(null), presetOf,
    // the parts
    entry, shares, createInstance, createSlot, createRoomPath, checkPreset: (p) => checkPreset(p, labelOf(p)),
    clampParams, filterCoefs, computeCoefs, Ramp, mulberry32, seededDraw,
    // the automatic room (part b)
    buildAutomatic, roomCase, placeFromDebug, ROOM_CASES, ROOM_PLACES,
    SHAPES: deepFreeze(SHAPES.map((s) => Object.assign({}, s))),
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TF2Room = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this);
