// tests/room-dsp.verify.mjs: room-dsp.js and room-presets.js, the room effects as the engine does them
// (order W3-17, part a).
//
// Every expected value here comes from outside room-dsp.js: the reference's recorded outputs
// (tests/roomdsp/reference.out and tails.out, made by reference.py on the model dspmodel.py), the order and
// the reports (typed in below, each with where it is from), and tests/roomdsp/lines.json, which lines.py reads
// out of the model's own instances. Where a check compares the module with itself (chunking, a number the table
// does not hold), it says so.
//
//   node tests/room-dsp.verify.mjs
//   TF2_DIR=<folder> node tests/room-dsp.verify.mjs      the module and the table from a copy (to break one)
//   ROOM_ONLY=<word> ...                                 only the sections whose name holds the word
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.TF2_DIR || join(here, '..');
const data = join(here, 'roomdsp');

const TABLE_SHA = '0586a404ca16112dfc7c2b40d5685c237294a32047fd10d1a0267339ad669350';   // the order, "The table"
const TABLE_KEYS = [...Array(30).keys(), 102, 103, 106, 107, 110, 111, 114, 115, 118, 119, 122, 123, 126, 127, 130, 131];

// ---------------------------------------------------------------- inputs (the order, "The model's outputs")

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// RandomInt(lo, hi) = lo + floor(u x (hi - lo + 1)), as reference.py's randint_from.
const drawOf = (seed) => { const u = mulberry32(seed); return (lo, hi) => lo + Math.floor(u() * (hi - lo + 1)); };
const upper = (lo, hi) => hi, lower = (lo, hi) => lo;

function noise() { const u = mulberry32(1); return Array.from({ length: 22050 }, () => Math.floor(u() * 65536) - 32768); }
function speech() {
  const u = mulberry32(3), out = [];
  for (let k = 0; k < 88200; k++) {
    const ph = k % 17640;
    out.push(ph >= 8820 ? 0 : Math.trunc((Math.floor(u() * 65536) - 32768) * Math.min(ph, 8820 - ph) / 4410));
  }
  return out;
}
const quiet = () => noise().map((s) => Math.trunc(s / 64));
const square = (n = 44100) => Array.from({ length: n }, (_, k) => ((k % 441) < 220 ? 32767 : -32767));

function sha(arr) {
  const a = arr instanceof Int32Array ? arr : Int32Array.from(arr);
  return createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
}

// ---------------------------------------------------------------- the recorded outputs

function parseReference() {
  const rows = new Map();
  let built = null;
  for (const line of readFileSync(join(data, 'reference.out'), 'utf8').split('\n')) {
    const m = line.match(/^(.*?)\s+(\d+)\/(\d+)\s+([0-9a-f]{64})$/);
    if (m) rows.set(m[1], { room: +m[2], direct: +m[3], hash: m[4] });
    const b = line.match(/^\s+built: (.*)$/);
    if (b) built = b[1].trim().split(/\s+/);
  }
  return { rows, built };
}

function parseTails() {
  const rows = new Map();
  for (const line of readFileSync(join(data, 'tails.out'), 'utf8').split('\n')) {
    let m = line.match(/^(.*?)\s+(\d+|-)\s+(\d+|-)\s+(\d+)\s+(\d+)$/);
    if (m) { rows.set(m[1], { quiet: +m[2], square: +m[3], qwater: +m[4], swater: +m[5] }); continue; }
    m = line.match(/^(.*?)\s+-\s+(\d+)\s+\(after the long square\)$/);
    if (m) { rows.set(`${m[1]} long`, { long: +m[2] }); continue; }
    m = line.match(/^(synthetic: the cap)\s+-\s+(\d+)$/);
    if (m) rows.set(m[1], { square: +m[2] });
  }
  return rows;
}

// Shortest decimal that reads back to the same single (as reference.py prints a value).
function f32text(v) {
  for (let p = 1; p <= 9; p++) {
    const s = Number(v.toPrecision(p));
    if (Math.fround(s) === v) return String(s);
  }
  return String(v);
}

// The model's "peaks" (dspmodel.py): the first n local maxima of |y|, largest within +-22 samples, at least 1% of
// the largest sample.
function peaks(y, n = 10, win = 22, floor = 0.01) {
  let pk = 0;
  for (const v of y) pk = Math.max(pk, Math.abs(v));
  const out = [];
  for (let t = 0; t < y.length && out.length < n; t++) {
    const v = Math.abs(y[t]);
    if (v < floor * pk || v === 0) continue;
    const lo = Math.max(0, t - win);
    let best = 0, earlier = true;
    for (let k = lo; k <= Math.min(y.length - 1, t + win); k++) best = Math.max(best, Math.abs(y[k]));
    for (let k = lo; k < t; k++) if (Math.abs(y[k]) >= v) { earlier = false; break; }
    if (v === best && earlier) out.push([t, y[t]]);
  }
  return out;
}

// ---------------------------------------------------------------- the suite

export async function main() {
  const T0 = performance.now();
  const R = require(join(root, 'room-dsp.js'));
  const TABLE = require(join(root, 'room-presets.js'));
  R.setTable(TABLE);
  const L = JSON.parse(readFileSync(join(data, 'lines.json'), 'utf8'));
  const REF = parseReference(), TAILS = parseTails();
  const only = process.env.ROOM_ONLY || '';
  let passed = 0;
  const failed = [];
  function check(name, ok, detail = '') {
    if (ok) passed++; else failed.push(name);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail && !ok ? `   [${detail}]` : ''}`);
  }
  const same = (a, b) => isDeepStrictEqual(a, b);
  const firstDiff = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i; return -1; };
  const section = (name) => { const on = !only || name.includes(only); if (on) console.log(`\n${name}`); return on; };
  const HDR = [0.2, 0.7, 0, 0, 80, 0.5];
  const one = (...procs) => ({ h: HDR, p: procs });
  const run = (inst, input, zeros = 0) => {
    const out = new Int32Array(input.length + zeros);
    for (let i = 0; i < input.length; i++) out[i] = inst.next(input[i]);
    for (let i = input.length; i < out.length; i++) out[i] = inst.next(0);
    return out;
  };
  const NOISE = noise(), SPEECH = speech();

  // -------------------------------------------------------------- the table
  if (section('The table (room-presets.js)')) {
    const text = readFileSync(join(root, 'room-presets.js'), 'utf8');
    const lines = text.split('\n').filter((l) => l.startsWith('{"0":'));
    const json = lines.length === 1 ? lines[0] : '';
    check('the wrapped JSON is one line whose SHA-256 is the order\'s', lines.length === 1 &&
      createHash('sha256').update(json).digest('hex') === TABLE_SHA && json.length === 5515);
    check('it is tests/roomdsp/room-presets.json byte for byte', json === readFileSync(join(data, 'room-presets.json'), 'utf8'));
    check('the module exports that JSON and nothing else', same(JSON.parse(JSON.stringify(TABLE)), JSON.parse(json || '{}')));
    check('the 46 presets: 0 to 29 and the automatic room\'s 16 templates', same(Object.keys(TABLE).map(Number), TABLE_KEYS));
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(text, sandbox);
    check('as a classic script it sets TF2_ROOM_PRESETS, frozen', !!sandbox.TF2_ROOM_PRESETS &&
      same(JSON.parse(JSON.stringify(sandbox.TF2_ROOM_PRESETS)), JSON.parse(json || '{}')) &&
      vm.runInContext('Object.isFrozen(TF2_ROOM_PRESETS["6"].p[1][1])', sandbox));
    const presets = Object.values(TABLE);
    check('every header\'s duration and fade are 0', presets.every((p) => p.h[2] === 0 && p.h[3] === 0));
    const counts = {};
    for (const p of presets) for (const [t] of p.p) counts[t] = (counts[t] || 0) + 1;
    check('processor counts: RVA 35, DFR 26, DLY 16, NULL 2, AMP 1, MDY 1, no FLT',
      same(counts, { 0: 2, 1: 16, 2: 35, 9: 1, 10: 26, 11: 1 }), JSON.stringify(counts));
    check('the amplifier is preset 14\'s and the modulating delay preset 16\'s',
      presets.filter((p) => p.p.some(([t]) => t === 11)) .length === 1 && TABLE[14].p.some(([t]) => t === 11) &&
      TABLE[16].p.some(([t]) => t === 9));
    // The range tables, typed in from R2 0 (RVA, DLY, DFR) and AM 0 (AMP, MDY).
    const RANGES = {
      2: [[0, 1000], [0, 1000], [1, 12], [0, 1], [0, 10], [10, 22050], [0, 1], [0, 50], [0, 10], [-1000, 1000],
        [-1000, 1000], [-1000, 1000], [-1, 1], [-1, 1], [-1, 1], [0, 0.333]],
      1: [[0, 6], [-1, 1000], [0, 0.99], [0, 10], [0, 2], [10, 22050], [100, 11025], [0, 3], [-1, 1000], [-1, 1000], [-1, 1000]],
      10: [[0, 1], [0, 4], [0, 1], [0, 10]],
      11: [[0, 1000], [0, 1], [0, 1], [0, 1], [0, 200], [0, 1], [0.01, 100], [0, 1]],
      9: [[0, 6], [0, 1000], [0, 0.99], [0, 1], [0, 2], [10, 22050], [100, 11025], [0, 3], [0.01, 200], [0, 1], [0.01, 100], [0, 1]],
    };
    check('the module\'s range tables are R2 0\'s and AM 0\'s', same(R.RANGES, RANGES));
    const outside = [];
    for (const [n, p] of Object.entries(TABLE)) {
      for (const [t, v] of p.p) {
        (RANGES[t] || []).forEach(([lo, hi], i) => {
          const x = v[i];
          if (x !== 0 && (x > Math.fround(hi) || x < Math.fround(lo))) outside.push(`${n}:${t}:${i}=${x}`);
        });
      }
    }
    check('no non-zero value is outside the engine\'s range tables', outside.length === 0, outside.join(' '));
    // Against today's DSP_PRESETS, in the fields it carries (W3-15 section 3's mapping).
    const sb = { window: {} };
    vm.createContext(sb);
    vm.runInContext(readFileSync(join(here, '..', 'constants.js'), 'utf8') + '\n;globalThis.__P = DSP_PRESETS;', sb);
    const OLD = sb.__P;
    const FIELDS = { rva: [[2, 'sizeMax', 0], [2, 'sizeMin', 1], [2, 'ndly', 2], [2, 'fb', 3], [2, 'gain', 4], [2, 'cutoff', 5],
      [2, 'fpar', 6], [2, 'fmod', 7], [2, 'rate', 8]], dfr: [[10, 'size', 0], [10, 'ndly', 1], [10, 'fb', 2]],
    dly: [[1, 'delay', 1], [1, 'fb', 2], [1, 'gain', 3], [1, 'cutoff', 5]],
    amp: [[11, 'gain', 0], [11, 'vthresh', 1], [11, 'distmix', 2], [11, 'modrate', 4], [11, 'moddepth', 5], [11, 'modglide', 6]],
    mdy: [[9, 'delay', 1], [9, 'fb', 2], [9, 'gain', 3], [9, 'modrate', 8], [9, 'moddepth', 9], [9, 'modglide', 10]] };
    const diffs = [];
    for (let n = 0; n < 30; n++) {
      const chain = OLD[n].chain, procs = TABLE[n].p.filter(([t]) => t !== 0);
      if (chain.length !== procs.length) { diffs.push(`${n}: ${chain.length} vs ${procs.length} processors`); continue; }
      chain.forEach((c, i) => {
        for (const [t, name, idx] of FIELDS[c.type]) {
          if (procs[i][0] !== t) { diffs.push(`${n}.${i}: type`); continue; }
          if (Math.fround(c[name]) !== Math.fround(procs[i][1][idx])) diffs.push(`${n}.${i}.${name}: ${c[name]} vs ${procs[i][1][idx]}`);
        }
      });
    }
    check('presets 0 to 29 hold today\'s DSP_PRESETS values, but for preset 23\'s reverb count (1.3 here, 1 there)',
      same(diffs, ['23.1.ndly: 1 vs 1.3']), diffs.join('; '));
  }

  // -------------------------------------------------------------- the coefficients
  if (section('The filter\'s coefficients (coefs.mjs)')) {
    const { compare } = await import(pathToFileURL(join(data, 'coefs.mjs')).href);
    const c = compare();
    check('Node\'s Math.tan gives the module\'s table and the order\'s list, each at least 0.005 from a boundary',
      c.ok && c.least >= 0.005, `least margin ${c.least}`);
    const k = R.filterCoefs(0, 2850), u = R.filterCoefs(0, 2851), hp = R.filterCoefs(1, 2000);
    check('a pinned cutoff is pinned; another or a high-pass is computed and marked "not pinned"',
      k.pinned && k.a1 === -2697 && k.b0 === 699 && !u.pinned && !hp.pinned && hp.b1 === -hp.b0);
    const inst = R.createInstance({ h: HDR, p: [[2, [100, 15, 2, 0.92, 1.1, 5001, 1]]] }, upper);
    check('an instance with a cutoff the table does not hold says so in its description',
      same(inst.describe()[0].notPinned, [5001]) && R.createInstance(6, upper).describe().every((d) => !d.notPinned));
  }

  // -------------------------------------------------------------- built integers against the model
  if (section('Built integers against the model (lines.json)')) {
    let bad = [];
    for (const n of TABLE_KEYS) if (!same(R.createInstance(n, upper).describe(), L.presets[n])) bad.push(n);
    check('every preset of the table: describe() is the model\'s', bad.length === 0, bad.join(' '));
    bad = [];
    for (const [name, c] of Object.entries(L.synthetic)) {
      if (!same(R.createInstance({ h: c.h, p: c.p }, upper).describe(), c.d)) bad.push(name);
    }
    check(`every synthetic case (${Object.keys(L.synthetic).length}): describe() is the model's`, bad.length === 0, bad.join('; '));
    bad = [];
    for (const [name, c] of Object.entries(L.auto)) if (!same(R.createInstance({ h: c.h, p: c.p }, upper).describe(), c.d)) bad.push(name);
    check('the 14 named cases, from the model\'s built parameters: describe() is the model\'s', bad.length === 0, bad.join(' '));
    bad = [];
    for (const [name, c] of Object.entries(L.clamped)) if (!same(R.createInstance(one(...c.p), upper).describe(), c.d)) bad.push(name);
    check('values outside the range tables: clamped as the engine does, describe() is the model\'s', bad.length === 0, bad.join('; '));
    bad = [];
    const marks = {};
    const unmarked = (d) => d.map((u) => { const { notPinned, ...rest } = u; if (notPinned) marks[JSON.stringify(rest)] = notPinned; return rest; });
    for (const [name, c] of Object.entries(L.extra)) if (!same(unmarked(R.createInstance(one(...c.p), upper).describe()), c.d)) bad.push(name);
    check(`rules no reference case runs (${Object.keys(L.extra).length}): describe() is the model's`, bad.length === 0, bad.join('; '));
    check('of those, only the delay\'s high-pass first section is marked "not pinned" (its tan is not in the table)',
      same(Object.values(marks), [['high-pass 2000']]));
    // The model's short outputs for the clamped and extra cases (the noise at share 26, 8820 samples, 8820 zeros).
    bad = [];
    for (const [name, c] of [...Object.entries(L.clamped), ...Object.entries(L.extra)]) {
      const y = run(R.createInstance(one(...c.p), drawOf(2)), NOISE.slice(0, 8820).map((s) => R.entry(s, 26)), 8820);
      if (sha(y) !== c.hash) bad.push(name);
    }
    check('those cases\' outputs are the model\'s', bad.length === 0, bad.join('; '));
    // Quality does nothing inside a delay (R2 difference 8): reference.out gives the two cases one hash.
    const q2 = L.synthetic['quality 2 in a delay'], q0 = L.synthetic['quality 0 in a delay'];
    const yq2 = run(R.createInstance({ h: q2.h, p: q2.p }, upper), NOISE.slice(0, 8820), 8820);
    const yq0 = run(R.createInstance({ h: q0.h, p: q0.p }, upper), NOISE.slice(0, 8820), 8820);
    check('quality 2 and quality 0 in a delay give the same samples, one filter section in the loop',
      q2.p[0][1][7] === 2 && q0.p[0][1][7] === 0 && same(Array.from(yq2), Array.from(yq0)) &&
      REF.rows.get('synthetic: quality 2 in a delay').hash === REF.rows.get('synthetic: quality 0 in a delay').hash);
    // A value of exactly 0 is never clamped, though 0 is below some minimums (R2 0).
    const zero = R.clampParams(2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    check('a value of exactly 0 is never clamped (the reverb\'s count and cutoff stay 0)', zero[2] === 0 && zero[5] === 0);
  }

  // -------------------------------------------------------------- R2's and W3-15's pinned numbers
  if (section('The reads\' pinned lines and echoes')) {
    const lines = (n) => R.createInstance(n, upper).describe().find((d) => d.t === 'RVA').lines;
    const pick = (ls, ...keys) => ls.map((l) => keys.map((k) => l[k]));
    // R2 "Model" 1 and W3-15 section 2: presets 5 and 6.
    check('preset 5: lines 352 and 1278 samples, feedbacks 3768 and 3026, gains 721 and 2252 (W3-15; R2 cross-checks)',
      same(pick(lines(5), 'D', 'a', 'g'), [[352, 3768, 721], [1278, 3026, 2252]]));
    const d6 = R.createInstance(6, upper).describe();
    check('preset 6: all-passes 573 and 837, feedback 614, gain 4096 (R2 "Model" 1)',
      same(d6[0].stages.map((s) => [s.kind, s.D, s.a, s.g]), [[1, 573, 614, 4096], [1, 837, 614, 4096]]));
    check('preset 6: lines 661 and 2513 samples, LOWPASS, feedbacks 3768 and 2983, gains 721 and 2252, a1 -1874, b 1021 and 808',
      same(pick(d6[1].lines, 'kind', 'D', 'a', 'g', 'lp'), [[2, 661, 3768, 721, [-1874, 1021, 1021]], [2, 2513, 2983, 2252, [-1874, 808, 808]]]));
    check('preset 17: gains 381, 470, 558, 642, 725, 806 (R2 difference 7: the first is 381, not 382)',
      same(lines(17).map((l) => l.g), [381, 470, 558, 642, 725, 806]));
    check('preset 102: lines 1323 and 2425 samples, feedbacks 3194 and 2597, gains 1983 and 2252 (R2 "Model" 2)',
      same(pick(lines(102), 'D', 'a', 'g'), [[1323, 3194, 1983], [2425, 2597, 2252]]));
    check('preset 114 as written: 1940 FLINEAR 3686 | 970, 1638, 1365 | 352, 3850, 341 | 793, 3686, 545 | 1278, 1638, 1365 | 661, 3850, 341 (R2 "Model" 3)',
      same(lines(114).map((l) => [l.D, l.fb, l.g]),
        [[1940, -3686, 4096], [970, 1638, 1365], [352, 3850, 341], [793, 3686, 545], [1278, 1638, 1365], [661, 3850, 341]]));
    check('presets 4, 6 and 7: the delays of the read\'s two truncations (the model\'s lines; 2535 would be one rounding)',
      [4, 6, 7].every((n) => same(lines(n).map((l) => l.D), L.presets[n].find((d) => d.t === 'RVA').lines.map((l) => l.D))) &&
      lines(6)[1].D === 2513);
    check('the diffusor at size 1: 573, 837, 1146, 926 samples (the time cut to whole ms first)',
      same(R.createInstance(one([10, [1, 4, 0.15, 0]]), upper).describe()[0].stages.map((s) => s.D), [573, 837, 1146, 926]));
    // R2 "Model" 2 and 3: the small room and the tunnel from the built parameters R2 lists.
    const smallRoom = { h: [0.3, 0.8, 0, 0, 80, 0.5], p: [[2, [80, 30, 2, 0.78, 1.1, 2850, 1]]] };
    const tunnel = { h: [0.4, 0.9, 0, 0, 80, 0.7], p: [[10, [1, 2.4, 0.14898, 0]],
      [2, [0, 0, 7.2, 0, 2.0, 4500, 1, 0, 0, 14.4, 89.6, 18.64, 0.952, -0.6, 0.44, 0]]] };
    const sr = R.createInstance(smallRoom, upper).describe()[0].lines;
    check('the small room (R2): lines 1323 (3194; 1983; a1 -2697, b 545) and 2425 (2597; 2252; b 443)',
      same(pick(sr, 'D', 'a', 'g', 'lp'), [[1323, 3194, 1983, [-2697, 545, 545]], [2425, 2597, 2252, [-2697, 443, 443]]]));
    const td = R.createInstance(tunnel, upper).describe();
    check('the tunnel (R2): all-passes 573 and 837, feedback 610',
      same(td[0].stages.map((s) => [s.D, s.a]), [[573, 610], [837, 610]]));
    check('the tunnel (R2): predelay 3924 FLINEAR factor 2457 gain 4096 (not scaled by gain / m); 1543, 617, 1278, 1852, 926, 1587, 2160, 1234',
      same(td[1].lines.map((l) => [l.D, l.kind, l.fb, l.g]), [[3924, 4, -2457, 4096], [1543, 2, 1802, 910], [617, 2, 3899, 227],
        [1278, 2, 2457, 910], [1852, 2, 1802, 910], [926, 2, 3899, 227], [1587, 2, 2457, 910], [2160, 2, 1802, 910], [1234, 2, 3899, 227]]) &&
      td[1].lines.every((l) => l.lp[0] === -2054));
    // R2's echo tables: the room share times 64 fed straight in (R2's convention), 6 s, the model's peak picking.
    const echoes = (preset, x0, n = 10) => peaks(run(R.createInstance(preset, upper), [x0], 6 * 44100 - 1), n);
    check('preset 6 fed 1664: (0, 26) (573, -178) (837, -179) (1146, -28) (1235, -16) (1410, 1152) (1499, -16) (1674, -28) (1983, 171) (2072, 101)',
      same(echoes(6, 1664), [[0, 26], [573, -178], [837, -179], [1146, -28], [1235, -16], [1410, 1152], [1499, -16], [1674, -28], [1983, 171], [2072, 101]]));
    check('the small room fed 2432: (0, 2514) (1324, 259) (2426, 239) (2649, 105) (3974, 61) (4853, 79) (5299, 39) (6625, 27) (7280, 37)',
      same(echoes(smallRoom, 2432), [[0, 2514], [1324, 259], [2426, 239], [2649, 105], [3974, 61], [4853, 79], [5299, 39], [6625, 27], [7280, 37]]));
    check('the tunnel fed 4608: (0, 125) (573, -864) (837, -864) (1146, -133) (1410, 5622) (1674, -133) (1983, 833) (2028, 86) (2247, 833) (2337, 85)',
      same(echoes(tunnel, 4608), [[0, 125], [573, -864], [837, -864], [1146, -133], [1410, 5622], [1674, -133], [1983, 833], [2028, 86], [2247, 833], [2337, 85]]));
    check('preset 102 as written fed 2432: (0, 2514) (1324, 394) (2426, 363) (2648, 203) (3972, 125) (4852, 152) (5296, 83) (6620, 57) (7278, 76) (7944, 40)',
      same(echoes(102, 2432), [[0, 2514], [1324, 394], [2426, 363], [2648, 203], [3972, 125], [4852, 152], [5296, 83], [6620, 57], [7278, 76], [7944, 40]]));
    check('preset 114 as written fed 4608: (0, 95) (573, -647) (837, -647) (1146, -98) (1410, 4255) (1544, -48) (1631, -46) (1674, -100) (1763, 148) (1808, -43)',
      same(echoes(114, 4608), [[0, 95], [573, -647], [837, -647], [1146, -98], [1410, 4255], [1544, -48], [1631, -46], [1674, -100], [1763, 148], [1808, -43]]));
    // The order ("Echo tables"): preset 6 through entry, at the room share and fully wet.
    const at = (y, list) => list.map(([t]) => [t, y[t]]);
    const y1657 = run(R.createInstance(6, upper), [R.entry(16384, 26)], 3000);
    check('through entry (16384 at share 26 = 1657): (0, 26) (573, -177) (837, -178) (1146, -28) (1235, -16) (1410, 1147) (1499, -16) (1674, -28)',
      R.entry(16384, 26) === 1657 && same(at(y1657, [[0], [573], [837], [1146], [1235], [1410], [1499], [1674]]),
        [[0, 26], [573, -177], [837, -178], [1146, -28], [1235, -16], [1410, 1147], [1499, -16], [1674, -28]]));
    const y16320 = run(R.createInstance(6, upper), [R.entry(16384, 256)], 3000);
    check('fully wet (16320): (0, 265) (573, -1738) (837, -1738) (1146, -262) (1235, -153) (1410, 11317) (1499, -153) (1674, -262) (1983, 1696) (2072, 997)',
      same(at(y16320, [[0], [573], [837], [1146], [1235], [1410], [1499], [1674], [1983], [2072]]),
        [[0, 265], [573, -1738], [837, -1738], [1146, -262], [1235, -153], [1410, 11317], [1499, -153], [1674, -262], [1983, 1696], [2072, 997]]));
    // A hand case for the shift: a plain comb of 44 samples, feedback 0.5 (2048), gain 1, fed one -1. The shift
    // rounds down, so (-1 x 2048) >> 12 = -1 and the comb stays at -1 for ever (R1 1, "The tail"; R2 difference 18):
    // -1 on every 44th sample. A shift toward zero would give 0 from sample 44 on.
    const comb = run(R.createInstance(one([1, [0, 1, 0.5, 1]]), upper), [-1], 44 * 50);
    check('a comb fed -1 stays at -1 every 44 samples for 50 turns (>> 12 rounds down)',
      comb.every((v, i) => v === (i % 44 === 0 ? -1 : 0)));
  }

  // -------------------------------------------------------------- the amplifier and the modulating delay
  if (section('The amplifier and the modulating delay (AM 2, AM 3, AM 5)')) {
    const AMP14 = [11, [1, 0, 0, 0, 10, 0.6, 80, 0]], MDY16 = [9, [0, 500, 0.4, 1, 0, 0, 0, 0, 2, 0.01, 15, 1]];
    check('preset 14\'s amplifier and preset 16\'s modulating delay are these lines of the table',
      same(TABLE[14].p[1], [11, [1, 0, 0, 0, 10, 0.6, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0]]) &&
      same(TABLE[16].p[2], [9, [0, 500, 0.4, 1, 0, 0, 0, 0, 2, 0.01, 15, 1, 0, 0, 0, 0]]));
    const amp = R.createInstance(one(AMP14), upper);
    check('the amplifier: gain 4096, threshold 0, mix 0, PERIOD 4410, DEPTH 2457, glide 3528 samples, no random',
      same(amp.describe()[0], { t: 'AMP', g0: 4096, vth: 0, dmix: 0, vfeed: 0, period: 4410, depth: 2457, glide: 3528, rand: 0 }));
    // Fed 4096, the output is the gain that multiplied the sample.
    const gains = run(amp, new Array(60000).fill(4096));
    const firstLess = gains.findIndex((g) => g !== 4096);
    check('the gain: 4096 for samples 0 to 4412, 4095 at 4413, 2867 at 6176, 1640 from 7938 on, for good (60,000 samples)',
      firstLess === 4413 && gains[4413] === 4095 && gains[6176] === 2867 && gains[7937] !== 1640 &&
      gains.subarray(7938).every((g) => g === 1640));
    const r14 = L.ramps['preset 14 amplifier'];
    check('the glide 4096 to 1639 (model): step 730258, 3,529 calls, ends on 1640, never on its target',
      r14.step === 730258 && r14.values.length === 3529 && r14.values.at(-1) === 1640 && !r14.values.includes(1639) &&
      same(Array.from(gains.subarray(4412, 4412 + 3529)), r14.values));
    // Firings: the same counter with a recorded draw (the random flag set, the rest preset 14's).
    const fires = []; let k = 0;
    const ampR = R.createInstance(one([11, [1, 0, 0, 0, 10, 0.6, 80, 1]]), (lo, hi) => { fires.push(k); return hi; });
    for (k = 0; k < 14000; k++) ampR.next(1000);
    check('the amplifier fires on samples 4410, 8821, 13232 (PERIOD, then every PERIOD + 1)', same(fires, [4410, 8821, 13232]));
    // A constant 8000 (AM 2): 8000, then 7998 at 4413, 5599 at 6176, 3203 from 7938 on.
    const c8 = run(R.createInstance(one(AMP14), upper), new Array(9000).fill(8000));
    check('a constant 8000 comes out as 8000, 7998 at 4413, 5599 at 6176, 3203 from 7938 on',
      c8[4412] === 8000 && c8[4413] === 7998 && c8[6176] === 5599 && c8.subarray(7938).every((v) => v === 3203));
    const mdy = R.createInstance(one(MDY16), upper).describe()[0];
    check('the modulating delay: kind 0, 22,050 samples, feedback 1638, gain 4096, PERIOD 22050, draws 21829 to 22050, glide 661, step 6497681, mix 4096',
      same(mdy, { t: 'MDY', line: { kind: 0, D: 22050, a: 1638, g: 4096, lp: null }, period: 22050, lo: 21829, glide: 661, step: 6497681, mix: 4096 }));
    const draws = []; let j = 0;
    const md = R.createInstance(one(MDY16), (lo, hi) => { draws.push([j, lo, hi]); return lo; });
    const mdOut = [];
    for (j = 0; j < 70000; j++) mdOut.push(md.next(j === 0 ? 16384 : 0));
    check('it draws on samples 22050, 44101, 66152, each between 21829 and 22050',
      same(draws, [[22050, 21829, 22050], [44101, 21829, 22050], [66152, 21829, 22050]]));
    const r16 = L.ramps['preset 16 tap fade'];
    check('its fade (model): 662 calls, step 6497681, weights 6, 12, 18, ... 4089, 4095, 4095',
      r16.values.length === 662 && r16.step === 6497681 && same(r16.values.slice(0, 3), [6, 12, 18]) &&
      same(r16.values.slice(-3), [4089, 4095, 4095]));
    {
      const ap = R.createInstance(one([9, [1, 500, 0, 1, 0, 0, 0, 0, 2, 0.01, 15, 1]]), lower);
      const got = Array.from({ length: 23000 }, (_, t) => ap.next(t));
      const Wf = [0, ...r16.values.slice(0, -1)];          // sample 22051 + k: weight Wf[k], k = 0 .. 661
      const want = got.map((_, t) => (t < 22050 ? 0 : t <= 22050 ? t - 22050
        : t <= 22712 ? (t - 22050) + ((221 * Wf[t - 22051]) >> 12) : t - 21829));
      check('the modulating delay\'s tap fade, sample by sample: weight 0 on the first faded sample, then 6, 12, ... 4089, 4095, the new tap alone from the 663rd',
        same(got, want), `first difference at ${firstDiff(got, want)}`);
    }
    check('fed an impulse, drawing the lower bound: 16384 at 0, 6552 at 22050, the third echo 2620 at 43879 (AM 5)',
      mdOut[0] === 16384 && mdOut[22050] === 6552 && mdOut[43879] === 2620);
    // AM 5's hashes, 44100 samples from a fresh instance, under "upper" and "lower".
    const impulse = [16384, ...new Array(44099).fill(0)];
    const tone = Array.from({ length: 44100 }, (_, n) => (n < 22050 ? Math.round(8000 * Math.sin(2 * Math.PI * 1000 * n / 44100)) : 0));
    check('the tone is AM 5\'s (its SHA-256, first eight 0 1136 2249 3316 4316 5229 6036 6720)',
      sha(tone) === '22e9dbee2b6f0bbab1507c0cda76f56d99f7fe5fe7b68ce268255fe632975eee' &&
      same(tone.slice(0, 8), [0, 1136, 2249, 3316, 4316, 5229, 6036, 6720]));
    const AM5 = [
      ['preset 14, impulse', 14, impulse, '3f7b9669342f51857b15936a9f38b43e0db5113610440e6aec8a30f7c9ffe8e2', 'c9f8a84a59102432495762351ad60337941b458c6302cc675b9e8d13da82141c'],
      ['preset 14, tone', 14, tone, '1095b738e2c616ad98fcdd314b3748fea8e99ae3b0dfb5268a67747099159030', '314f3c78eaead30c45c982967d94a06d3413b64d2846661cedd04b290d94288c'],
      ['preset 16, impulse', 16, impulse, 'bbdbf9aec77340b628837e1855e7dbe55a21a405553559cd7e4f01e85300a534', 'fac1e98abbdcd8f73d411a9a3564411931f95779df2dd4adb6179a76433a088d'],
      ['preset 16, tone', 16, tone, 'f0c7c88832add99d441cf9072ce7ce3763fbecd415b602783ca13ff7d9c8d6d6', 'cd26dcf7b9d1bc36d19ea9b8df48c02b8f8c23ee2a6430a5afb2d73e2056b9c5'],
      ['amplifier of 14, impulse', one(AMP14), impulse, '5e90608f3607b734f007b5aa34d824c17e37bb885070c0dc791afbb0a13567aa', '5e90608f3607b734f007b5aa34d824c17e37bb885070c0dc791afbb0a13567aa'],
      ['amplifier of 14, tone', one(AMP14), tone, 'e5827f7a0f34d219618a62c3297541b1986a8374dab61a38f4efd3bdae613f2d', 'e5827f7a0f34d219618a62c3297541b1986a8374dab61a38f4efd3bdae613f2d'],
      ['modulating delay of 16, impulse', one(MDY16), impulse, '378dc5c41f0c5643c942902d0dd903847e394fe742a51875bf8ad09c08bd03b3', '2a4225152a725a0c42780fcc19d40d6e76822f548a369d2e8b08f3ab194f1d91'],
      ['modulating delay of 16, tone', one(MDY16), tone, '792fa706c374d9f2b5584573e1f1318c798f9c19d821eb0175dd140ace2afa3c', '3485ad663138fe3d98ae4304b0a6fe9e8c442eabb555e2dfeb8cfc078adad96f'],
    ];
    for (const [name, p, input, hu, hl] of AM5) {
      const yu = run(R.createInstance(p, upper), input), yl = run(R.createInstance(p, lower), input);
      check(`AM 5: ${name}, "upper" and "lower"`, sha(yu) === hu && sha(yl) === hl);
    }
    const i14 = run(R.createInstance(14, upper), impulse);
    let pk = 0, pkAt = 0;
    i14.forEach((v, i) => { if (Math.abs(v) > Math.abs(pk)) { pk = v; pkAt = i; } });
    check('preset 14 on the impulse: first 20 -2 -6 -9 -11 -11 -11 -10 -9 -8 -7 -6 -5 -4 -3 -3 -2 -2 -1 -1 -1, peak 2867 at 2560',
      same(Array.from(i14.subarray(0, 20)), [-2, -6, -9, -11, -11, -11, -10, -9, -8, -7, -6, -5, -4, -3, -3, -2, -2, -1, -1, -1]) &&
      pk === 2867 && pkAt === 2560);
    const at14 = run(R.createInstance(one(AMP14), upper), tone);
    check('the amplifier of 14 on the tone: out[4413] = 3315, out[7936..7939] = -902, -456, 0, 454',
      at14[4413] === 3315 && same(Array.from(at14.subarray(7936, 7940)), [-902, -456, 0, 454]));
    // The amplifier's clip at threshold 0 with a mix of 1 clips everything to 0 (AM 2; the reference's synthetic).
    const clip0 = run(R.createInstance(one([11, [1, 0, 1, 0, 0, 0, 0, 0]]), upper), NOISE.slice(0, 4410));
    check('threshold 0 with mix 1: every output is 0', clip0.every((v) => v === 0));
  }

  // -------------------------------------------------------------- the draws
  if (section('Random taps: when and between what (lines.json)')) {
    const cases = {};
    for (const n of [8, 9, 10, 14, 15, 16, 17, 18, 19, 23, 24, 25, 130, 131]) cases[`preset ${n}`] = n;
    for (const [k, c] of Object.entries(L.synthetic)) cases[`synthetic: ${k}`] = { h: c.h, p: c.p };
    for (const [k, c] of Object.entries(L.extra)) cases[`extra: ${k}`] = one(...c.p);
    const bad = [];
    for (const [name, expect] of Object.entries(L.draws)) {
      const rec = []; let k = 0;
      const inst = R.createInstance(cases[name], (lo, hi) => { rec.push([k, lo, hi]); return hi; });
      for (k = 0; k < 60000; k++) inst.next(0);
      if (!same(rec, expect)) bad.push(name);
    }
    check(`the first 60,000 samples of ${Object.keys(L.draws).length} modulating cases: each draw on the model's sample, between its bounds`,
      bad.length === 0, bad.join('; '));
    // In 10 s: a draw every period + 1 samples, the first on sample `period` (R2 difference 5), periods the model's.
    const N = 441000, bad10 = [];
    const expected = (periods) => periods.reduce((s, p) => s + (p !== 0 && N > p ? Math.floor((N - 1 - p) / (p + 1)) + 1 : 0), 0);
    for (const name of Object.keys(L.draws)) {
      const d = name.startsWith('preset') ? L.presets[cases[name]] : null;
      const desc = d || R.createInstance(cases[name], upper).describe();
      if (!d) {
        const model = (name.startsWith('synthetic') ? L.synthetic[name.slice(11)] : L.extra[name.slice(7)]).d;
        if (!same(desc, model)) { bad10.push(`${name}: description`); continue; }
      }
      const periods = desc.flatMap((u) => (u.mod ? u.mod.map((m) => m.period) : u.t === 'MDY' ? [u.period] :
        u.t === 'AMP' && u.rand ? [u.period] : []));
      let count = 0;
      const inst = R.createInstance(cases[name], (lo, hi) => { count++; return hi; });
      for (let i = 0; i < N; i++) inst.next(0);
      if (count !== expected(periods)) bad10.push(`${name}: ${count} vs ${expected(periods)}`);
    }
    check('in 10 s, as many draws as a draw every period + 1 samples gives', bad10.length === 0, bad10.join('; '));
  }

  // -------------------------------------------------------------- the seeded streams (Decision 7)
  if (section('The seeded streams (Decision 7)')) {
    const ranges = Array.from({ length: 2000 }, (_, i) => [i % 97, (i % 97) + (i * 7919) % 30000]);
    check('seededDraw(seed) is reference.py\'s randint_from: lo + floor(u x (hi - lo + 1)), u from mulberry32(seed)',
      [1, 2, 5, 0xC0FFEE].every((seed) => { const a = R.seededDraw(seed), b = drawOf(seed); return ranges.every(([lo, hi]) => a(lo, hi) === b(lo, hi)); }));
    const seed = 0x1234abcd;
    const voice = Int32Array.from(NOISE, (s) => R.entry(s, 26)), dry = Int32Array.from(NOISE, (s) => R.entry(s, 229));
    const padded = (a) => { const o = new Int32Array(60000); o.set(a); return o; };
    const viaSeed = R.createRoomPath({ seed, room: 17, water: true }).process(padded(dry), padded(voice));
    const viaDraw = R.createRoomPath({ room: 17, water: true, roomDraw: drawOf((seed ^ 0x524F4F4D) >>> 0),
      waterDraw: drawOf((seed ^ 0x57415452) >>> 0) }).process(padded(dry), padded(voice));
    check('a path\'s room slot draws from mulberry32((seed ^ 0x524F4F4D) >>> 0), its water slot from mulberry32((seed ^ 0x57415452) >>> 0)',
      same(Array.from(viaSeed), Array.from(viaDraw)));
  }

  // -------------------------------------------------------------- the reference hashes
  if (section('The reference hashes (reference.out)')) {
    const done = new Set();
    const roomCase = (name, preset, voice, zeros) => {
      const exp = REF.rows.get(name);
      const sh = R.shares(typeof preset === 'number' ? TABLE[preset] : preset);
      const inst = R.createInstance(preset, drawOf(2));
      const y = run(inst, voice.map((s) => R.entry(s, sh.room)), zeros);
      done.add(name);
      return !!exp && sh.room === exp.room && sh.direct === exp.direct && sha(y) === exp.hash;
    };
    let bad = [];
    for (const n of TABLE_KEYS.filter((n) => n > 1)) if (!roomCase(`preset ${n}`, n, NOISE, 66150)) bad.push(n);
    check('every preset of the table, 2 to 131, on the noise: shares and hash (44 cases)', bad.length === 0, bad.join(' '));
    bad = [];
    for (const [k, c] of Object.entries(L.auto)) if (!roomCase(`auto ${k}`, { h: c.h, p: c.p }, NOISE, 66150)) bad.push(k);
    check('the 14 named cases, built by the model, on the noise (part b builds them; here the processors)', bad.length === 0, bad.join(' '));
    bad = [];
    for (const n of [6, 14, 17, 21, 25, 103]) if (!roomCase(`speech preset ${n}`, n, SPEECH, 44100)) bad.push(n);
    check('six presets on the speech', bad.length === 0, bad.join(' '));
    bad = [];
    for (const [k, c] of Object.entries(L.synthetic)) if (!roomCase(`synthetic: ${k}`, { h: c.h, p: c.p }, NOISE, 66150)) bad.push(k);
    check(`the ${Object.keys(L.synthetic).length} synthetic cases, the template case included`, bad.length === 0, bad.join('; '));
    const tpl = L.synthetic['negative width and depth in templates'].p[0][1].map(f32text);
    check('the template case\'s built reverb is the one reference.out prints', same(tpl, REF.built));
    const tunnel = { h: L.auto.tunnel.h, p: L.auto.tunnel.p };
    const pathCase = (name, room, water) => {
      const exp = REF.rows.get(name);
      const path = R.createRoomPath({ room, water, roomDraw: drawOf(2), waterDraw: drawOf(5) });
      path.spurtStart();
      const sh = path.shares();
      const voice = [...NOISE, ...new Array(66150).fill(0)];
      const out = path.process(Int32Array.from(voice, (s) => R.entry(s, sh.direct)), Int32Array.from(voice, (s) => R.entry(s, sh.room)));
      done.add(name);
      return !!exp && sh.room === exp.room && sh.direct === exp.direct && sha(out) === exp.hash;
    };
    check('path, preset 6', pathCase('path, preset 6', 6, false));
    check('path, tunnel', pathCase('path, tunnel', tunnel, false));
    check('under water, no room (the water slot started 44,100 samples before)', pathCase('under water, no room', null, true));
    check('under water, preset 6', pathCase('under water, preset 6', 6, true));
    check('under water, tunnel', pathCase('under water, tunnel', tunnel, true));
    // The path's order (item 11), pointed: direct + room slot(room), then the water slot, whose instance of 14 has
    // run 44,100 samples of silence first. Built by hand from two instances on the two streams.
    {
      const voice = [...NOISE, ...new Array(22050).fill(0)];
      const sh = R.shares(TABLE[17]);
      const d = Int32Array.from(voice, (s) => R.entry(s, sh.direct)), r = Int32Array.from(voice, (s) => R.entry(s, sh.room));
      const got = R.createRoomPath({ room: 17, water: true, roomDraw: drawOf(2), waterDraw: drawOf(5) }).process(d, r);
      const room = R.createInstance(17, drawOf(2)), water = R.createInstance(14, drawOf(5));
      for (let i = 0; i < 44100; i++) water.next(0);
      const want = Array.from(d, (x, i) => water.next((x + room.next(r[i])) | 0));
      check('a path under water is water(direct + room(room)), its water instance 44,100 samples of silence ahead',
        same(Array.from(got), want), `first difference at ${firstDiff(Array.from(got), want)}`);
    }
    check(`every line of reference.out was checked (${REF.rows.size})`, done.size === REF.rows.size && [...REF.rows.keys()].every((k) => done.has(k)));
  }

  // -------------------------------------------------------------- the tails
  const tailOf = (room, water, input, chunks) => {
    const path = R.createRoomPath({ room, water, roomDraw: drawOf(2), waterDraw: drawOf(5) });
    path.spurtStart();
    const sh = path.shares();
    const B = 4096;
    for (let i = 0; i < input.length; i += B) {
      const part = input.slice(i, i + B);
      path.process(Int32Array.from(part, (s) => R.entry(s, sh.direct)), Int32Array.from(part, (s) => R.entry(s, sh.room)));
    }
    const z = new Int32Array(B);
    let t = path.tailLeft();
    for (let guard = 0; !t.ended && guard < 300; guard++) { path.process(z, z.slice()); t = path.tailLeft(); }
    return t.length;
  };
  if (section('Where each tail ends (tails.out)')) {
    const t0 = performance.now();
    const Q = quiet(), S = square(), LONG = square(220500);
    const cases = [...TABLE_KEYS.filter((n) => n > 1).map((n) => [`preset ${n}`, n]),
      ...Object.entries(L.auto).map(([k, c]) => [`auto ${k}`, { h: c.h, p: c.p }])];
    const bad = [];
    let count = 0;
    for (const [name, preset] of cases) {
      const e = TAILS.get(name);
      const got = { quiet: tailOf(preset, false, Q), square: tailOf(preset, false, S), qwater: tailOf(preset, true, Q), swater: tailOf(preset, true, S) };
      count += 4;
      if (!same(got, e)) bad.push(`${name}: ${JSON.stringify(got)}`);
    }
    check(`every preset and named case, quiet and square, alone and under water (${count} tails)`, bad.length === 0, bad.join('; '));
    const nr = TAILS.get('no room');
    check('no room, under water: quiet and square', tailOf(null, true, Q) === nr.qwater && tailOf(null, true, S) === nr.swater);
    const lb = [];
    for (const name of ['preset 22', 'preset 103', 'preset 115', 'auto great_hall']) {
      const preset = name.startsWith('auto') ? { h: L.auto.great_hall.h, p: L.auto.great_hall.p } : Number(name.slice(7));
      const got = tailOf(preset, false, LONG);
      if (got !== TAILS.get(`${name} long`).long) lb.push(`${name}: ${got}`);
    }
    check('after the long square: presets 22, 103, 115 and the great hall', lb.length === 0, lb.join('; '));
    const cap = L.synthetic['never settles (the cap)'];
    check('synthetic: never settles: the cap, 882,000', tailOf({ h: cap.h, p: cap.p }, false, S) === 882000 &&
      TAILS.get('synthetic: the cap').square === 882000);
    // A hand case for the rule's band: a reverb comb of feedback 1 (4091), 441 samples, gain cut to 1024, holding
    // -400 keeps it for ever ((-400 x 4091) >> 12 = -400), so the output rests at (-400 x 1024) >> 12 = -100 from
    // the first sample. Its values lie within 32 of each other, far from 0: the output ends 22,050 samples after the
    // voice (Decision 8: a band, not a level).
    {
      const path = R.createRoomPath({ room: one([2, [10, 10, 1, 1, 1, 0, 0]]) });
      const n = 441 + 30000, r = new Int32Array(n);
      r.fill(-400, 0, 441);
      const out = path.process(new Int32Array(n), r);
      const t = path.tailLeft();
      check('a tail resting at -100 ends 22,050 samples after the voice (the rule is a band, not a level)',
        out.every((v) => v === -100) && t.ended && t.length === 22050 && t.at === 441 + 22049);
    }
    console.log(`        (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  }

  // -------------------------------------------------------------- chunking (the module against itself)
  if (section('Chunking: any block sizes give the same samples')) {
    const sizes = {
      whole: () => Infinity, 1: () => 1, 127: () => 127, 512: () => 512, 4096: () => 4096,
      random: (() => { const u = mulberry32(77); return () => 1 + Math.floor(u() * 3000); })(),
    };
    // Five cases: the room, a change of room at sample 30,000 (a fade), water on or off.
    const CASES = [
      ['preset 6, then 17 at 30,000', 6, 17, false],
      ['preset 16 (two drawing processors), then none', 16, null, false],
      ['the tunnel under water, then preset 25', { h: L.auto.tunnel.h, p: L.auto.tunnel.p }, 25, true],
      ['preset 131, then the water fades in', 131, 'water', false],
      ['no room under water, then preset 14', null, 14, true],
    ];
    const voice = NOISE.concat(NOISE).slice(0, 40000);
    const bad = [];
    for (const [name, a, b, water] of CASES) {
      const results = [];
      for (const [label, size] of Object.entries(sizes)) {
        const path = R.createRoomPath({ room: a, water, seed: 1234 });
        path.spurtStart();
        const sh = path.shares();
        const parts = [];
        let i = 0, t = path.tailLeft();
        const step = (n, from) => {           // n samples of the voice from `from`, or zeros past its end
          const d = new Int32Array(n), r = new Int32Array(n);
          for (let k = 0; k < n; k++) {
            const s = from + k < voice.length ? voice[from + k] : 0;
            d[k] = R.entry(s, sh.direct); r[k] = R.entry(s, sh.room);
          }
          const o = path.process(d, r);
          t = path.tailLeft();
          parts.push(t.ended && t.at >= 0 ? o.slice(0, t.at + 1) : o);
          return n;
        };
        while (i < voice.length) {
          const until = i < 30000 ? 30000 : voice.length;
          i += step(Math.min(size(), until - i), i);
          if (i === 30000) { if (b === 'water') path.setWater(true); else path.setRoom(b); }
        }
        while (!t.ended && i < 2000000) i += step(Math.min(size(), 1 << 20), i);
        const all = new Int32Array(parts.reduce((s, q) => s + q.length, 0));
        let o = 0;
        for (const q of parts) { all.set(q, o); o += q.length; }
        results.push([label, sha(all), t.length, all.length]);
      }
      const ok = results.every(([, h, len, n]) => h === results[0][1] && len === results[0][2] && n === results[0][3]) &&
        results[0][3] === voice.length + results[0][2];
      if (!ok) bad.push(`${name}: ${JSON.stringify(results)}`);
    }
    check('five cases, a fade in each, in pieces of 1, 127, 512, 4096 and random sizes: the same samples and tail length, the output as long as the voice and its tail',
      bad.length === 0, bad.join('; '));
  }

  // -------------------------------------------------------------- the slot
  if (section('The slot')) {
    // A preset whose output is 0 (an amplifier of gain 0) fed 4096 shows the fade's weight on each sample:
    // out = 4096 + (((0 - 4096) x r) >> 12) = 4096 - r.
    const ZERO = one([11, [0]]), GAIN = (g) => one([11, [g]]);
    const weights = (fade) => {
      const s = R.createSlot({ fade });
      s.set(ZERO);
      return Array.from(s.process(new Int32Array(Math.round(fade * 44100) + 600).fill(4096)), (v) => 4096 - v);
    };
    const room = L.ramps['room slot 0.2 s'], water = L.ramps['water slot 0.1 s'];
    check('the model\'s 0.2 s ramp: step 486957; 0, 0, 1, 1, 2, ...; 2048 at the 4,411th call; 4095 at the last; done at the 8,821st',
      room.step === 486957 && same(room.values.slice(0, 5), [0, 0, 1, 1, 2]) && room.values[4410] === 2048 &&
      room.values.length === 8821 && room.values[8819] === 4095);
    const valuesOf = (seconds, a, b) => {
      const r = new R.Ramp(seconds, a, b), v = [];
      for (let k = 0; k < 10000; k++) { v.push(r.next()); if (r.done) break; }
      return v;
    };
    check('ramps of 0, 1, 2 and 3 samples: the model\'s values (AM 1: a step the 12.20 form cannot hold is done at once, at its start)',
      same(valuesOf(0, 0, 4096), L.ramps['0 samples'].values) && same(valuesOf(1.5 / 44100, 0, 4096), L.ramps['1 sample'].values) &&
      same(valuesOf(2.5 / 44100, 0, 4096), L.ramps['2 samples'].values) && same(valuesOf(3.5 / 44100, 0, 4096), L.ramps['3 samples'].values) &&
      same(valuesOf(1.5 / 44100, 4096, 1639), L.ramps['1 sample, 4096 to 1639'].values) && same(L.ramps['0 samples'].values, [0]));
    check('the room slot\'s, the water slot\'s, the glide\'s and the tap fade\'s ramps, call by call, are the model\'s',
      same(valuesOf(0.2, 0, 4096), room.values) && same(valuesOf(0.1, 0, 4096), water.values) &&
      same(valuesOf(Math.fround(80) * Math.fround(0.001), 4096, 1639), L.ramps['preset 14 amplifier'].values) &&
      same(valuesOf(Math.fround(15) * Math.fround(0.001), 0, 4096), L.ramps['preset 16 tap fade'].values));
    check('the model\'s 0.1 s ramp: step 973915; 0, 1, 2, ...; done at the 4,411th call',
      water.step === 973915 && same(water.values.slice(0, 3), [0, 1, 2]) && water.values.length === 4411);
    // As "The slot's ramp" assumes: sample 0 weight 0, sample k the k-th call's value, new alone after the done call.
    const lined = (r) => [0, ...r.values.slice(0, -1), ...new Array(600).fill(4096)];
    const w2 = weights(0.2), w1 = weights(0.1);
    check('a room fade covers samples 0 to 8820: weight 0 on sample 0, the ramp\'s k-th value on sample k, the new preset alone from 8821',
      same(w2, lined(room).slice(0, w2.length)), `first difference at ${firstDiff(w2, lined(room))}`);
    check('a water fade (0.1 s) the same way: samples 0 to 4410', same(w1, lined(water).slice(0, w1.length)),
      `first difference at ${firstDiff(w1, lined(water))}`);
    // A change is taken at the next 512-sample block of the slot's own count, and not while a fade runs.
    const s = R.createSlot({ fade: 0.2, preset: GAIN(0.5) });
    const x = new Int32Array(30000).fill(4096);
    const o = new Int32Array(30000);
    s.process(x.subarray(0, 700), o.subarray(0, 700));
    s.set(GAIN(0));                                   // asked on sample 700: taken on 1024
    s.process(x.subarray(700, 2000), o.subarray(700, 2000));
    const waiting = s.state().requested;
    s.set(GAIN(1));                                   // asked during the fade (1024 to 9844): taken on 10240
    const during = s.state();
    s.process(x.subarray(2000), o.subarray(2000));
    const fadeA = Array.from(o.subarray(1024, 1024 + 8821), (v, k) => 2048 - v);
    const expA = lined(room).slice(0, 8821).map((w) => 2048 - (2048 + ((Math.imul(-2048, w)) >> 12)));
    check('a change asked mid-block is taken at the next block (sample 1024), not before',
      o.subarray(0, 1024).every((v) => v === 2048) && same(fadeA, expA) && waiting === undefined);
    check('a change asked during a fade waits for it to end and for the next block (taken at 10240)',
      during.fading && during.requested !== undefined && o.subarray(9845, 10240).every((v) => v === 0) &&
      same(Array.from(o.subarray(10240, 10240 + 8821)), lined(room).slice(0, 8821)) &&
      o.subarray(10240 + 8821).every((v) => v === 4096));
    // A fade to "none" ends on the input bit for bit.
    const sn = R.createSlot({ fade: 0.2, preset: 6, draw: upper });
    const inp = Int32Array.from({ length: 30000 }, (_, i) => NOISE[i % NOISE.length] >> 2);
    const on = new Int32Array(30000);
    sn.process(inp.subarray(0, 5000), on.subarray(0, 5000));
    sn.set(null);                                     // taken on 5120; the fade ends after sample 5120 + 8820
    sn.process(inp.subarray(5000), on.subarray(5000));
    check('a fade to none: from sample 13941 on, the output is the input bit for bit (and not during the fade)',
      same(Array.from(on.subarray(13941)), Array.from(inp.subarray(13941))) &&
      on.subarray(5120, 13941).some((v, k) => v !== inp[5120 + k]) &&
      sn.state().preset === null && !sn.active());
    // Numbers the table does not hold change nothing (Decision 11); the module against itself.
    const refOut = R.createSlot({ preset: 6, draw: upper }).process(inp);
    const badN = [];
    for (const n of [40, 104, 137]) {
      const sl = R.createSlot({ preset: 6, draw: upper });
      const out = new Int32Array(30000);
      sl.process(inp.subarray(0, 1000), out.subarray(0, 1000));
      const r = sl.set(n);
      sl.process(inp.subarray(1000), out.subarray(1000));
      if (r !== false || !same(out, refOut) || sl.state().preset !== 6) badN.push(n);
    }
    check('set(40), set(104), set(137): nothing changes', badN.length === 0, badN.join(' '));
    const sl = R.createSlot({ preset: 6, draw: upper });
    const out2 = new Int32Array(30000);
    sl.process(inp.subarray(0, 1000), out2.subarray(0, 1000));
    sl.set(17); sl.set(137);
    sl.process(inp.subarray(1000), out2.subarray(1000));
    check('set(17) then set(137) before the block: the slot keeps 6, as the engine keeps what it had', same(out2, refOut));
    const p137 = R.createRoomPath({ room: 137 }), s40 = R.createSlot({ preset: 40 });
    check('made with 137 (a path) or 40 (a slot): no room; the slot passes its input, the shares are 0/256',
      p137.state().room.preset === null && same(p137.shares(), { room: 0, direct: 256 }) &&
      same(Array.from(s40.process(inp.subarray(0, 2000))), Array.from(inp.subarray(0, 2000))));
    check('a slot made with a preset starts with the fade over: the instance alone from sample 0',
      same(Array.from(R.createSlot({ preset: 6, draw: upper }).process(inp.subarray(0, 3000))),
        Array.from(run(R.createInstance(6, upper), Array.from(inp.subarray(0, 3000))))));
    // During a fade both instances run on the same input and draw from the slot's one stream, the old one first in
    // each sample (the order, part a, item 9). Expected: two instances stepped by hand, old then new, on one
    // stream, mixed with the model's 0.2 s weights lined up as above (the module's instances, the order's rule).
    const sd = R.createSlot({ preset: 17, draw: drawOf(9) });
    sd.set(16);
    const got = sd.process(inp);
    const shared = drawOf(9), A = R.createInstance(17, shared), B = R.createInstance(16, shared);
    const W = lined(room);
    const want = Array.from(inp, (x, k) => {
      if (k > 8820) return B.next(x);
      const a = A.next(x), b = B.next(x);
      return (a + (Math.imul(b - a, W[k]) >> 12)) | 0;
    });
    check('during a fade from 17 to 16 (both draw), the old instance draws first in each sample', same(Array.from(got), want),
      `first difference at ${firstDiff(Array.from(got), want)}`);
  }

  // -------------------------------------------------------------- shares and entry
  if (section('The voice\'s shares and entry')) {
    const bad = [];
    for (const [h, s12, s11] of L.shares) {
      const s = R.shares(h);
      if (s.room !== s12[0] || s.direct !== s12[1] || s12[0] !== s11[0] || s12[1] !== s11[1]) bad.push(JSON.stringify(h));
    }
    check(`every header of the table and ${L.shares.length - 9} more: the model's shares (distance 12; 11 gives the same)`,
      bad.length === 0, bad.join(' '));
    const ORDER = [[[0.2, 0.7, 80, 0.5], 26, 229], [[0.3, 0.8, 80, 0.5], 38, 217], [[0.32, 0.8, 80, 0.5], 41, 214],
      [[0.4, 0.9, 80, 0.5], 51, 204], [[0.4, 0.9, 80, 0.7], 72, 183], [[0.3, 0.8, 75, 0.3], 23, 232],
      [[0.32, 0.8, 60, 0.3], 24, 231], [[0.21, 0.8, 95, 0.1], 5, 250], [[0.22, 0.6, 95, 0.1], 5, 250],
      [[1, 1, 80, 1], 256, 0], [[1, 1, 0, 1], 256, 0], [[0.2, 0.8, 80, 0.5], 26, 229]];
    check('the order\'s share table, (1, 1, any, 1) 256/0, and the start-up values 26/229',
      ORDER.every(([h, r, d]) => same(R.shares(h), { room: r, direct: d })));
    check('the table\'s every header gives a share of the order\'s list',
      Object.values(TABLE).every((p) => ORDER.some(([h, r, d]) => same(R.shares(p), { room: r, direct: d }))));
    // The path's shares: per block, the slot's preset now and before.
    const path = R.createRoomPath({ seed: 5 });
    path.spurtStart();
    const z = new Int32Array(512);
    const blocks = (n) => { for (let i = 0; i < n; i++) path.process(z, z.slice()); };
    const a = path.shares();
    path.setRoom(114);
    const b = path.shares();                          // asked, not yet taken
    blocks(1);                                        // taken at sample 0; the mix values become 114's
    const c = path.shares();                          // this spurt's limits are the start-up values'
    path.spurtStart();
    const d = path.shares();
    blocks(17);                                       // the fade in (samples 0 to 8820) is over
    path.setRoom(null);
    blocks(1);                                        // taken at 9216: the fade to none starts
    const e = path.shares();
    blocks(17);                                       // 9216 samples later it has ended
    const f = path.shares();
    path.spurtStart();
    const g = path.shares();
    check('shares(): 0/256 with no room, and while a room is asked but not yet taken',
      same(a, { room: 0, direct: 256 }) && same(b, a));
    check('after setRoom(114) is taken: the running spurt keeps its limits (26/229); the next spurt has 114\'s (72/183)',
      same(c, { room: 26, direct: 229 }) && same(d, { room: 72, direct: 183 }) && same(path.state().mix.map((v) => +v.toFixed(3)), [0.4, 0.9, 80, 0.7]));
    check('during a fade to none the shares stay; once it has ended they are 0/256 again',
      same(e, { room: 72, direct: 183 }) && same(f, { room: 0, direct: 256 }) && same(g, f));
    // The two slots' fade times (R1 1's slot table): the room's 0.2 s, the water's 0.1 s.
    {
      const pf = R.createRoomPath({ seed: 1 });
      pf.setRoom(6); pf.setWater(true);
      const zz = new Int32Array(4411);
      pf.process(zz, zz.slice());
      const at4411 = pf.state();
      pf.process(new Int32Array(4410), new Int32Array(4410));
      const at8821 = pf.state();
      check('a path\'s water slot fades over 0.1 s (4,411 samples), its room slot over 0.2 s (8,821)',
        !at4411.water.fading && at4411.room.fading && !at8821.room.fading && at8821.water.preset === 14 && at8821.room.preset === 6);
    }
    const made = R.createRoomPath({ room: 126 });
    check('a path made with a room has its shares at once (126: 5/250)', same(made.shares(), { room: 5, direct: 250 }));
    // The four mix values change when the slot takes a preset (R2 d, "setting a preset on a slot"), not when it is
    // asked for: a spurt that starts in between keeps the old values (a reading; the report says so).
    const p6 = R.createRoomPath({ room: 6 });
    p6.setRoom(114);
    p6.spurtStart();
    const asked = p6.shares();
    p6.process(z, z.slice());
    p6.spurtStart();
    check('the four mix values change when the slot takes the preset, not when it is asked (26/229, then 72/183)',
      same(asked, { room: 26, direct: 229 }) && same(p6.shares(), { room: 72, direct: 183 }));
    // entry: the order's fixed points.
    const FIX = [[-32690, 229, -29128], [31388, 23, 2809], [32767, 256, 32639], [-32768, 256, -32640], [32767, 229, 29196],
      [32767, 26, 3314], [16384, 229, 14598], [16384, 26, 1657], [16384, 256, 16320]];
    check('entry: -29128 at (-32690, 229), 2809 at (31388, 23), and the order\'s other fixed points',
      FIX.every(([s, sh, v]) => R.entry(s, sh) === v));
    check('lines.json: 28 samples differ from exact division at share 229, 2 at 23, none at 256 (the order\'s counts)',
      L.entry['229'].length === 28 && L.entry['23'].length === 2 && L.entry['256'].length === 0);
    const badE = [];
    for (const [share, diffs] of Object.entries(L.entry)) {
      const sp = new Map(diffs);
      for (let s = -32768; s < 32768; s++) {
        const exact = Math.trunc(s * 255 * share / 65536);
        const want = sp.has(s) ? sp.get(s) : exact;
        if (R.entry(s, +share) !== want) { badE.push(`${s}@${share}`); break; }
      }
    }
    check(`entry: every 16-bit sample at ${Object.keys(L.entry).length} shares is the reference's`, badE.length === 0, badE.join(' '));
    let e256 = true;
    for (let s = -32768; s < 32768; s++) if (R.entry(s, 256) !== Math.trunc(s * 255 / 256)) { e256 = false; break; }
    check('entry(s, 256) = trunc(s x 255 / 256) for every 16-bit sample', e256);
  }

  // -------------------------------------------------------------- what is refused
  if (section('What is not built is refused by name')) {
    const refused = (p, word) => { try { R.createInstance(p, upper); return false; } catch (e) { return e.message.includes(word); } };
    check('the FLT processor', refused(one([3, [0, 1000]]), 'FLT'));
    check('the other processor types (a chorus)', refused(one([4, [1]]), 'CRS'));
    check('the delay kinds DLINEAR, LOWPASS_4TAP and PLAIN_4TAP',
      refused(one([1, [3, 10, 0.5, 1]]), 'DLINEAR') && refused(one([1, [5, 10, 0.5, 1]]), 'LOWPASS_4TAP') &&
      refused(one([1, [6, 10, 0.5, 1]]), 'PLAIN_4TAP') && refused(one([9, [6, 10, 0.5, 1]]), 'PLAIN_4TAP'));
    check('a reverb with a tap factor', refused(one([2, [50, 20, 3, 0.9, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2]]), 'tap factor'));
    check('a one-shot duration and a header\'s own fade time',
      refused({ h: [0.2, 0.7, 1.6, 0, 80, 0.5], p: [[0, []]] }, 'one-shot') &&
      refused({ h: [0.2, 0.7, 0, -0.5, 80, 0.5], p: [[0, []]] }, 'fade time'));
    check('more than five processors', refused(one(...new Array(6).fill([0, []])), 'processors'));
  }

  // -------------------------------------------------------------- loading and speed
  if (section('Loading and speed')) {
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(readFileSync(join(root, 'room-presets.js'), 'utf8'), sandbox);
    vm.runInContext(readFileSync(join(root, 'room-dsp.js'), 'utf8'), sandbox);
    const V = sandbox.TF2Room;
    check('as classic scripts, the two files set TF2Room, which reads TF2_ROOM_PRESETS itself',
      !!V && same(JSON.parse(JSON.stringify(V.createInstance(6).describe())), L.presets[6]));
    const speed = [];
    for (const n of [6, 25, 103, 115, 131]) {
      const inst = R.createInstance(n, drawOf(2));
      const x = Int32Array.from({ length: 441000 }, (_, i) => (i < 22050 ? R.entry(NOISE[i], 26) : 0));
      const y = new Int32Array(x.length);
      inst.process(x.subarray(0, 44100), y);
      const t = performance.now();
      inst.process(x, y);
      speed.push([n, (performance.now() - t) * 1e6 / x.length]);
    }
    const worst = speed.reduce((a, b) => (b[1] > a[1] ? b : a));
    console.log(`        ns a sample: ${speed.map(([n, v]) => `${n} ${v.toFixed(0)}`).join(', ')}; ` +
      `the heaviest, preset ${worst[0]}, ${(1e9 / worst[1] / 1e6).toFixed(1)} M samples a second, ${(1e9 / worst[1] / 44100).toFixed(0)} times real time`);
    check('every preset runs well over real time (under 2,000 ns a sample)', worst[1] < 2000);
  }

  console.log(`\n${passed} room checks passed${failed.length ? `, ${failed.length} FAILED` : ''} (${((performance.now() - T0) / 1000).toFixed(1)} s)`);
  assert.deepEqual(failed, [], `${failed.length} room checks failed`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
