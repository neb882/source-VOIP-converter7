// tests/capture-converter.verify.mjs: capture-converter.js, Windows's rate converter at quality 30 to
// 24,000 Hz as read (tests/REFERENCE_2026.md, finding 28), against docs/work-orders/W3-26-capture-conversion.md,
// "W3-26a: the module, its vectors and its suite", checks 1 to 8.
//
// Every expected sample comes from outside capture-converter.js: the two readers' converters' outputs in
// tests/capture-converter/vectors.json (made by make_vectors.py), the order's computed figures (typed in below,
// each with where it is from), or arithmetic this file does itself (a tone's level by a least-squares fit, the
// outputs a stream may give by counting). Where a check holds the module to itself (a stream in blocks against
// the whole, the rows made on demand against the stored table), it says so.
//
//   node tests/capture-converter.verify.mjs
//   TF2_DIR=<folder> node tests/capture-converter.verify.mjs    the module from a copy (to break one)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.TF2_DIR || join(here, '..');
const C = require(join(root, 'capture-converter.js'));
const V = JSON.parse(readFileSync(join(here, 'capture-converter', 'vectors.json'), 'utf8'));

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : 'FAIL  '}${name}${detail ? `   [${detail}]` : ''}`);
}
function threw(fn, type) {
  try { fn(); } catch (e) { return e instanceof type; }
  return false;
}

// ---------------------------------------------------------------- inputs (the order, "The vectors")

function mulberry32(seed) {   // as in engine/dsp.js
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A case's source: whole 16-bit steps at half scale, 40 samples at positive full scale from sample 100.
function source(n, seed) {
  const r = mulberry32(seed), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (Math.floor(r() * 32768) - 16384) / 32768;
  for (let i = 100; i < 140 && i < n; i++) x[i] = 32767 / 32768;
  return x;
}
function floats(b64) {
  const u = Buffer.from(b64, 'base64'), dv = new DataView(u.buffer, u.byteOffset, u.length);
  const out = new Float32Array(u.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = dv.getFloat32(4 * i, true);
  return out;
}
function tone(rate, hz, seconds, amp = 0.5) {
  const n = Math.round(rate * seconds), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin(2 * Math.PI * hz * i / rate);
  return x;
}
// A tone's amplitude at hz in y (at `rate`) over [a, b): the least-squares fit of a cosine and a sine.
function amplitude(y, rate, hz, a, b) {
  let cc = 0, ss = 0, cs = 0, yc = 0, ys = 0;
  for (let k = a; k < b; k++) {
    const w = 2 * Math.PI * hz * k / rate, c = Math.cos(w), s = Math.sin(w);
    cc += c * c; ss += s * s; cs += c * s; yc += y[k] * c; ys += y[k] * s;
  }
  const det = cc * ss - cs * cs;
  return Math.hypot((yc * ss - ys * cs) / det, (ys * cc - yc * cs) / det);
}
const dB = (v) => 20 * Math.log10(v);
const sameBits = (a, b) => {
  if (a.length !== b.length) return `length ${a.length}, not ${b.length}`;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return `sample ${i}: ${a[i]}, not ${b[i]}`;
  return '';
};
const farthest = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
function join2(parts) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
// The order's table "The source rates" (computed from the rule), for the checks that need L, M, H and T
// without asking the module.
const RATES = {
  8000: [3, 1, 32, 68], 11025: [320, 147, 32, 68], 16000: [3, 2, 32, 68], 22050: [160, 147, 32, 68],
  32000: [3, 4, 42, 88], 44100: [80, 147, 58, 120], 48000: [1, 2, 63, 128], 96000: [1, 4, 125, 252],
  44056: [3000, 5507, 57, 116], 47999: [24000, 47999, 63, 128]
};

// ---------------------------------------------------------------- 1. the vectors

console.log('1. The vectors (tests/capture-converter/vectors.json: every sample bit for bit to the first reference, within 3e-6 of the second)');
for (const c of V.cases) {
  const d = C.design(c.rate), x = source(c.samples, c.seed), y = C.convert(x, c.rate);
  const first = floats(c.first);
  check(`${c.rate} Hz: L ${c.L}, M ${c.M}, H ${c.H}, T ${c.T}, cutoff ${c.cutoff[0]}, ${c.unrated ? 'not rated' : 'rated'}`,
    d.L === c.L && d.M === c.M && d.H === c.H && d.T === c.T && Object.is(d.cutoff, c.cutoff[0]) && d.rated === !c.unrated,
    `${d.L} ${d.M} ${d.H} ${d.T} ${d.cutoff} rated ${d.rated}`);
  const diff = sameBits(y, first);
  check(`${c.rate} Hz: ${c.outputs} outputs, each the first reference's bit for bit`, y.length === c.outputs && !diff,
    `${diff ? `${diff}; ` : ''}largest difference ${farthest(y, first).toExponential(2)}`);
  if (c.second) {
    const apart = farthest(y, floats(c.second));
    check(`${c.rate} Hz: within 3e-6 of the second reference`, apart <= 3e-6, `${apart.toExponential(2)}`);
  }
  if (c.row0) {
    const r = d.row(0), r1 = floats(c.row0[0]), r2 = floats(c.row0[1]);
    const rd = sameBits(r, r1), apart = farthest(r, r2);
    check(`${c.rate} Hz: row 0 of the table bit for bit to the first reference's, within 1e-6 of the second's`,
      !rd && apart <= 1e-6, rd || `${apart.toExponential(2)} from the second`);
  }
}

// ---------------------------------------------------------------- 2. the gain

console.log('2. The gain (the vectors\' gain_db, computed by both references; a tone through convert() fitted over its middle)');
const GAIN_AT = [1000, 10000, 11000, 11250, 11450, 11750, 11950];
for (const rate of [48000, 44100]) {
  const c = V.cases.find((v) => v.rate === rate);
  const got = GAIN_AT.map((f) => dB(C.gain(rate, f)));
  const off = GAIN_AT.map((f, j) => Math.abs(got[j] - c.gain_db[f]));
  check(`gain(${rate}, f) within 0.01 dB of the vectors at ${GAIN_AT.join(', ')} Hz`, Math.max(...off) <= 0.01,
    got.map((g) => g.toFixed(3)).join(' '));
  const heard = GAIN_AT.map((f) => {
    const y = C.convert(tone(rate, f, 1), rate);
    return dB(amplitude(y, 24000, f, 6000, 18000) / 0.5);
  });
  const apart = heard.map((h, j) => Math.abs(h - got[j]));
  check(`${rate} Hz: a 1 s tone of 0.5 through convert() at each of those keeps gain()'s level within 0.02 dB`,
    Math.max(...apart) <= 0.02, `largest ${Math.max(...apart).toFixed(4)} dB`);
}

// ---------------------------------------------------------------- 3. nothing folds back

console.log('3. Nothing folds back (24000 Hz less the tone: the vectors\' gain_db at 12,500 Hz within 0.3 dB, under -95 dB above it; a sweep)');
for (const rate of [48000, 44100]) {
  const c = V.cases.find((v) => v.rate === rate);
  const lands = [12500, 13000, 13500].map((f) => {
    const y = C.convert(tone(rate, f, 1), rate);
    return dB(amplitude(y, 24000, 24000 - f, 6000, 18000) / 0.5);
  });
  check(`${rate} Hz: a 12,500 Hz tone lands at 11,500 Hz at ${c.gain_db[12500]} dB within 0.3 dB; 13,000 and 13,500 Hz under -95 dB`,
    Math.abs(lands[0] - c.gain_db[12500]) <= 0.3 && lands[1] < -95 && lands[2] < -95, lands.map((v) => v.toFixed(2)).join(' '));
  // A linear sweep from 12,000 to 13,500 Hz in 2 s: above 12,700 Hz (from 0.9333 s) to 10 ms before its end
  // (its abrupt end is not what is measured), the output's rms against the sweep's.
  const n = 2 * rate, x = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / rate; x[i] = 0.5 * Math.sin(2 * Math.PI * (12000 * t + 375 * t * t)); }
  const y = C.convert(x, rate);
  const from = (12700 - 12000) / 750, to = 2 - 0.010;
  let ey = 0, ny = 0, ex = 0, nx = 0;
  for (let k = Math.ceil(from * 24000); k < to * 24000; k++) { ey += y[k] * y[k]; ny++; }
  for (let i = Math.ceil(from * rate); i < to * rate; i++) { ex += x[i] * x[i]; nx++; }
  const under = dB(Math.sqrt(ex / nx)) - dB(Math.sqrt(ey / ny));
  check(`${rate} Hz: a sweep above 12,700 Hz comes out at least 70 dB under itself`, under >= 70, `${under.toFixed(1)} dB under`);
}

// ---------------------------------------------------------------- 4. whole against blocks

console.log('4. Whole against blocks (the module against itself: a stream in pieces gives convert()\'s samples)');
const PLAN = [1, 7, 128, 3, 0, 511, 64, 2, 1000];
function streamed(x, rate, limit, plan) {
  const s = limit === undefined ? C.createStream(rate) : C.createStream(rate, limit), parts = [];
  for (let at = 0, j = 0; at < x.length; j++) {
    const len = plan[j % plan.length];
    parts.push(s.push(x.subarray(at, at + len)));
    at += len;
  }
  parts.push(s.end(C.length(x.length, rate)));
  return join2(parts);
}
for (const [rate, limit] of [...V.cases.map((c) => [c.rate]), [24000], [44100, 0]]) {
  const x = source(5000, 7 + rate), whole = C.convert(x, rate);
  const a = sameBits(streamed(x, rate, limit, PLAN), whole), b = sameBits(streamed(x, rate, limit, [1]), whole);
  check(`${rate} Hz${limit === 0 ? ', limit 0 (rows made as needed)' : ''}: blocks of ${PLAN.join(', ')}, and one sample a block, give convert()'s samples`,
    !a && !b, a || b);
}

// ---------------------------------------------------------------- 5. what a stream holds back

console.log('5. What a stream holds back (after n inputs, exactly the outputs k with floor(k M / L) + H <= n - 1; L, M, H from the order\'s table)');
for (const rate of [48000, 44100, 16000, 8000]) {
  const [L, M, H] = RATES[rate];
  const x = source(1200, 99), whole = C.convert(x, rate), s = C.createStream(rate);
  let given = 0, wrong = '';
  for (let n = 1; n <= 1000; n++) {
    const out = s.push(x.subarray(n - 1, n));
    const d = sameBits(out, whole.subarray(given, given + out.length));
    given += out.length;
    let expect = 0;
    while (Math.floor(expect * M / L) + H <= n - 1) expect++;
    if (!wrong && (given !== expect || d)) wrong = `after ${n} inputs ${given} outputs, not ${expect}${d ? `; ${d}` : ''}`;
  }
  check(`${rate} Hz: after every input from 1 to 1,000 (H = ${H}, H + 1 and H + 2 among them), the outputs given are those and convert()'s`,
    !wrong, wrong || `${given} outputs after 1,000 inputs`);
}
check('wait(48000) is 63 / 48000 and wait(44100) is 58 / 44100 (the order\'s table)',
  C.wait(48000) === 63 / 48000 && C.wait(44100) === 58 / 44100, `${C.wait(48000)} ${C.wait(44100)}`);
{
  // An up-conversion: at 8,000 Hz the input that completes output 0 completes 1 and 2 as well.
  const s = C.createStream(8000), x = source(40, 3);
  const before = s.push(x.subarray(0, 32)).length, at = s.push(x.subarray(32, 33)).length;
  check('8,000 Hz: the 33rd input gives three outputs at once, none before it', before === 0 && at === 3, `${before}, then ${at}`);
}

// ---------------------------------------------------------------- 6. the start, the end and the level

console.log('6. The start, the end and the level (the order\'s figures: the first reader\'s self-test)');
for (const [rate, peak, lo, hi] of [[48000, 1000, 969, 1031], [44100, 1088, 1058, 1119]]) {
  const x = new Float32Array(4000); x[2000] = 1;
  const y = C.convert(x, rate);
  let top = 0, first = -1, last = -1;
  for (let k = 0; k < y.length; k++) {
    if (Math.abs(y[k]) > Math.abs(y[top])) top = k;
    if (y[k] !== 0) { if (first < 0) first = k; last = k; }
  }
  check(`${rate} Hz: an impulse at sample 2,000 of 4,000 peaks at output ${peak}, not zero from ${lo} to ${hi}`,
    top === peak && first === lo && last === hi, `peak ${top}, ${first} to ${last}`);
  const z = new Float32Array(4000); z[0] = 1;
  const yz = C.convert(z, rate);
  let topz = 0;
  for (let k = 0; k < yz.length; k++) if (Math.abs(yz[k]) > Math.abs(yz[topz])) topz = k;
  check(`${rate} Hz: an impulse at sample 0 peaks at output 0`, topz === 0, `peak ${topz}`);
  const [L, M, H, T] = RATES[rate], N = 4000;
  const yc = C.convert(new Float32Array(N).fill(0.25), rate);
  let worst = 0, counted = 0;
  for (let k = 0; k < yc.length; k++) {
    const i = Math.floor(k * M / L);
    if (i - (T - H - 1) < 0 || i + H > N - 1) continue;
    worst = Math.max(worst, Math.abs(yc[k] - 0.25)); counted++;
  }
  check(`${rate} Hz: a constant 0.25 comes out as 0.25 within 2e-6 where no tap reads past either end`, counted > 1800 && worst <= 2e-6,
    `${worst.toExponential(2)} over ${counted} outputs`);
}
check('length(0, R) is 0, length(1, 48000) 1, length(12345, 44100) 6,718, length(12345, 48000) 6,173',
  [8000, 44100, 48000, 44056].every((r) => C.length(0, r) === 0) && C.length(1, 48000) === 1
  && C.length(12345, 44100) === 6718 && C.length(12345, 48000) === 6173,
  `${C.length(1, 48000)} ${C.length(12345, 44100)} ${C.length(12345, 48000)}`);
check('a source of n samples gives length(n) outputs, at 1, 2, 3 and 1,201 samples from 44,100, 48,000 and 8,000 Hz',
  [44100, 48000, 8000].every((r) => [1, 2, 3, 1201].every((n) => C.convert(source(n, n), r).length === C.length(n, r)))
  && C.convert(new Float32Array(0), 44100).length === 0);

// ---------------------------------------------------------------- 7. the two ways to hold a table

console.log('7. The two ways to hold a table (rows made as needed against the stored table: the module against itself; 47,999 Hz against a tone\'s own level)');
{
  const kept = C.design(44100), made = C.design(44100, 0);
  let diff = '';
  for (let p = 0; p < 80 && !diff; p++) diff = sameBits(made.row(p), kept.row(p)) && `row ${p}: ${sameBits(made.row(p), kept.row(p))}`;
  check('design(44100, 0) stores nothing and its 80 rows equal the stored design\'s bit for bit', kept.stored && !made.stored && !diff,
    diff || `scale ${made.scale} and ${kept.scale}`);
  const x = source(3000, 44);
  const d2 = sameBits(streamed(x, 44100, 0, [3000]), C.convert(x, 44100));
  check('createStream(44100, 0) gives convert()\'s samples bit for bit', !d2, d2);
  const r3 = made.row(3), copy3 = Float32Array.from(r3), r5 = made.row(5);
  check('a row made as needed is good until the next call of row(): row(5) returns the same array, now row 5',
    r3 === r5 && !sameBits(r5, kept.row(5)) && sameBits(copy3, kept.row(5)) !== '');
}
{
  const d = C.design(47999);
  check('design(47999): L 24,000, M 47,999, H 63, T 128, not rated, stored', d.L === 24000 && d.M === 47999 && d.H === 63 && d.T === 128
    && !d.rated && d.stored, `${d.L} ${d.M} ${d.H} ${d.T} rated ${d.rated} stored ${d.stored}`);
  const y = C.convert(tone(47999, 1000, 1), 47999);
  const level = dB(amplitude(y, 24000, 1000, 6000, 18000) / 0.5);
  check('47,999 Hz: a 1 kHz tone keeps its level within 0.001 dB', Math.abs(level) <= 0.001, `${level.toFixed(5)} dB`);
}

// ---------------------------------------------------------------- 8. at 24,000 Hz

console.log('8. At 24,000 Hz (no conversion), and what the interface promises');
{
  const x = source(1000, 24);
  const y = C.convert(x, 24000);
  check('convert() returns a copy, equal sample for sample and not the same array', y !== x && !sameBits(y, x) && y instanceof Float32Array);
  const s = C.createStream(24000), a = s.push(x), b = s.end(1000);
  check('push() at 24,000 Hz returns a copy, not the caller\'s array; nothing at the end; wait 0; length n; no design; gain 1',
    a !== x && a.buffer !== x.buffer && !sameBits(a, x) && b.length === 0 && C.wait(24000) === 0 && C.length(777, 24000) === 777
    && C.design(24000) === null && C.gain(24000, 11000) === 1);
}
{
  const x = source(3000, 5), copy = Float32Array.from(x), changed = [];
  for (const rate of [24000, 48000, 44100, 8000, 44056]) {
    for (const limit of [undefined, 0]) {
      const s = limit === undefined ? C.createStream(rate) : C.createStream(rate, limit);
      s.push(x.subarray(0, 10)); s.push(x.subarray(10, 2000)); s.push(x.subarray(2000)); s.end(C.length(3000, rate));
      C.convert(x, rate);
      if (sameBits(x, copy)) changed.push(`${rate}${limit === 0 ? ', limit 0' : ''}`);
    }
  }
  check('push(), end() and convert() leave the array they are given unchanged, at 24,000, 48,000, 44,100, 8,000 and 44,056 Hz, stored or not',
    changed.length === 0, changed.join('; '));
  const whole = C.convert(x, 44100);
  check('a rate of 44100.4 behaves as 44,100: the same samples, the same wait, the same kept design',
    !sameBits(C.convert(x, 44100.4), whole) && C.wait(44100.4) === C.wait(44100) && C.design(44100.4) === C.design(44100)
    && C.length(12345, 44100.4) === 6718);
  const bad = [NaN, Infinity, -Infinity, 0, 0.5, -48000, '48000', null, undefined].filter((r) => !threw(() => C.convert(x, r), RangeError)
    || !threw(() => C.createStream(r), RangeError) || !threw(() => C.design(r), RangeError) || !threw(() => C.wait(r), RangeError)
    || !threw(() => C.length(10, r), RangeError) || !threw(() => C.gain(r, 1000), RangeError));
  check('a rate that is not a finite number of at least 1 is a RangeError, in every member', bad.length === 0, bad.map(String).join(', '));
  // The kept designs' bound, by what design() gives again: a kept design is the same object. Three tables of
  // 3,072,000 entries each (computed: L 24,000, T 128) are more than 2 x TABLE_LIMIT (8,388,608), so the oldest of
  // the three cannot be kept beside the other two.
  const [x1, x2, x3] = [47993, 47989, 47983].map((r) => C.design(r));
  const kept = C.design(47983) === x3 && C.design(47989) === x2 && C.design(48000) === C.design(48000);
  const dropped = C.design(47993) !== x1;
  check('a design is kept (given again as the same object), and the kept designs never hold more than 2 x TABLE_LIMIT entries: of three tables of 3,072,000, the oldest was dropped',
    kept && dropped && x1.stored, `newest two kept ${kept}, oldest dropped ${dropped}`);
}

// ---------------------------------------------------------------- the edges (the order, "What the reviewer attacks")

console.log('The edges');
{
  const x = source(2000, 5);
  // end() with a count that needs no more input: the outputs given are all there are.
  const t = C.createStream(48000), given = t.push(source(1000, 6)).length;
  check(`end() with a count the stream has already given returns nothing (48,000 Hz, 1,000 inputs, ${given} given; the order's rule gives 469)`,
    given === 469 && t.end(given).length === 0);
  check('push() and end() after end() are refused', threw(() => t.push(x), Error) && threw(() => t.end(500), Error));
  const u = C.createStream(48000);
  u.push(source(1000, 6));
  check('end() gives the outputs not yet given, up to count in all', u.end(600).length === 600 - 469);
  check('end() refuses a count that is not a whole number of at least 0',
    [-1, 1.5, NaN, '3'].every((n) => threw(() => C.createStream(48000).end(n), RangeError)));
  check('row() refuses a phase outside 0 to L - 1', threw(() => C.design(44100).row(80), RangeError) && threw(() => C.design(44100, 0).row(-1), RangeError));
}

// ---------------------------------------------------------------- time

{
  const lines = [];
  for (const rate of [48000, 44100]) {
    const x = source(60 * rate, 60);
    const t0 = performance.now();
    C.convert(x, rate);
    lines.push(`${rate} Hz ${((performance.now() - t0) / 1000).toFixed(2)} s`);
  }
  console.log(`One minute of sound through convert(): ${lines.join(', ')} (measured on this machine; not a check)`);
}

if (failed) {
  console.log(`\n${failed} capture converter check${failed === 1 ? '' : 's'} FAILED`);
  process.exitCode = 1;
} else {
  console.log('\ncapture converter: every check passed');
}
