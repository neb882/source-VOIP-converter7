// tests/room-dsp.verify.mjs: room-dsp.js and room-presets.js, the room effects as the engine does them
// (order W3-17, parts a and b).
//
// Every expected value here comes from outside room-dsp.js: the reference's recorded outputs
// (tests/roomdsp/reference.out and tails.out, made by reference.py on the model dspmodel.py), the order and
// the reports (typed in below, each with where it is from), and tests/roomdsp/lines.json and auto.json, which
// lines.py and auto.py read out of the model's own instances and builds. Where a check compares the module with
// itself (chunking, a number the table does not hold), it says so.
//
//   node tests/room-dsp.verify.mjs
//   TF2_DIR=<folder> node tests/room-dsp.verify.mjs      the module and the table from a copy (to break one)
//   ROOM_ONLY=<word> ...                                 only the sections whose name holds the word (part b's:
//                                                        "automatic")
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
    // Part d strips DSP_PRESETS to names (order, part d, item 3): then this comparison has nothing to read.
    const chains = !!OLD && [...Array(30).keys()].every((n) => OLD[n] && Array.isArray(OLD[n].chain));
    const FIELDS = { rva: [[2, 'sizeMax', 0], [2, 'sizeMin', 1], [2, 'ndly', 2], [2, 'fb', 3], [2, 'gain', 4], [2, 'cutoff', 5],
      [2, 'fpar', 6], [2, 'fmod', 7], [2, 'rate', 8]], dfr: [[10, 'size', 0], [10, 'ndly', 1], [10, 'fb', 2]],
    dly: [[1, 'delay', 1], [1, 'fb', 2], [1, 'gain', 3], [1, 'cutoff', 5]],
    amp: [[11, 'gain', 0], [11, 'vthresh', 1], [11, 'distmix', 2], [11, 'modrate', 4], [11, 'moddepth', 5], [11, 'modglide', 6]],
    mdy: [[9, 'delay', 1], [9, 'fb', 2], [9, 'gain', 3], [9, 'modrate', 8], [9, 'moddepth', 9], [9, 'modglide', 10]] };
    const diffs = [];
    for (let n = 0; chains && n < 30; n++) {
      const chain = OLD[n].chain, procs = TABLE[n].p.filter(([t]) => t !== 0);
      if (chain.length !== procs.length) { diffs.push(`${n}: ${chain.length} vs ${procs.length} processors`); continue; }
      chain.forEach((c, i) => {
        for (const [t, name, idx] of FIELDS[c.type]) {
          if (procs[i][0] !== t) { diffs.push(`${n}.${i}: type`); continue; }
          if (Math.fround(c[name]) !== Math.fround(procs[i][1][idx])) diffs.push(`${n}.${i}.${name}: ${c[name]} vs ${procs[i][1][idx]}`);
        }
      });
    }
    if (chains) {
      check('presets 0 to 29 hold today\'s DSP_PRESETS values, but for preset 23\'s reverb count (1.3 here, 1 there)',
        same(diffs, ['23.1.ndly: 1 vs 1.3']), diffs.join('; '));
    } else {
      console.log('  skip  presets 0 to 29 against DSP_PRESETS: constants.js no longer carries their chains (part d)');
    }
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
    // The clip's switch-off (AM 2, step 1, 0x180033260: VTH = trunc(vthresh x 32767) is tested against 4096, so
    // a threshold of 0.125 or more turns the clip off). At 0.5 with a mix of 1 the input passes (gain 1): 20000
    // gives 20000. At exactly 0.125, VTH = trunc(4095.875) = 4095 < 4096: the clip is on, 20000 gives 4095.
    const off = run(R.createInstance(one([11, [1, 0.5, 1, 0, 0, 0, 0, 0]]), upper), [20000, -20000, 32767, -32768]);
    const at125 = run(R.createInstance(one([11, [1, 0.125, 1, 0, 0, 0, 0, 0]]), upper), [20000, -20000, 4095, 100]);
    check('the clip is off from a threshold of 0.125 x 32767 >= 4096: at 0.5, 20000 gives 20000; at exactly 0.125 it is on (4095)',
      same(Array.from(off), [20000, -20000, 32767, -32768]) && same(Array.from(at125), [4095, -4095, 4095, 100]));
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
      // The band's width (32, Decision 8): the same comb holding -400 and -272 by turns rests on -100 and -68 (a
      // span of 32) and ends 22,050 samples after the voice; holding -400 and -268 it rests on -100 and -67 (33)
      // and has not ended 60,000 samples later.
      const band = (b) => {
        const pb = R.createRoomPath({ room: one([2, [10, 10, 1, 1, 1, 0, 0]]) });
        const rb = new Int32Array(441 + 60000);
        for (let i = 0; i < 441; i++) rb[i] = i % 2 ? b : -400;
        const ob = pb.process(new Int32Array(rb.length), rb);
        return { t: pb.tailLeft(), set: [...new Set(ob)].sort((p, q) => p - q) };
      };
      const b32 = band(-272), b33 = band(-268);
      check('the band is 32 wide: a tail on -100 and -68 ends 22,050 samples after the voice; one on -100 and -67 has not ended 60,000 later',
        same(b32.set, [-100, -68]) && b32.t.ended && b32.t.length === 22050 &&
        same(b33.set, [-100, -67]) && !b33.t.ended && b33.t.length === 60000);
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
      ['preset 131, then under water (switched at a block start)', 131, 'water', false],
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
    const weights = (fade, n) => {
      const s = R.createSlot({ fade });
      s.set(ZERO);
      return Array.from(s.process(new Int32Array(n).fill(4096)), (v) => 4096 - v);
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
    // The engine's fade (docs/reports/W3-17a-second-read.md, F1; rows 3 and 4: 0x1800383de to 0x180038472,
    // 0x1800383b3 to 0x1800383c9, 0x18003fd21 to 0x18003fd3a). For a change taken at block start S, sample S + k
    // has the ramp's (k + 1)-th value (the ramp is stepped, then used); the call that reports done repeats 4095;
    // the weight then stays 4095, both instances running, to the end of that block; from the next block the new
    // preset is alone (4096 here). The ramp's values are the model's (lines.json).
    const engineWeights = (r, S, total) => {
      const w = r.values.slice();
      while ((S + w.length) % 512 !== 0) w.push(4095);
      while (w.length < total) w.push(4096);
      return w.slice(0, total);
    };
    const w2 = weights(0.2, 10240), w1 = weights(0.1, 5120);
    check('a room fade taken at 0 (second read, F1): 0, 0, 1, 1, 2 on samples 0 to 4; 4095 on 8819 and on 8820 (the done call); 4095 on 8821 to 9215; the new preset alone from 9216',
      same(w2, engineWeights(room, 0, w2.length)) && same(w2.slice(0, 5), [0, 0, 1, 1, 2]) &&
      w2[8819] === 4095 && w2[8820] === 4095 && w2.slice(8821, 9216).every((v) => v === 4095) && w2[9216] === 4096,
      `first difference at ${firstDiff(w2, engineWeights(room, 0, w2.length))}`);
    check('a 0.1 s slot (the water\'s and the player\'s time, row 10) the same way: done on 4410, 4095 to 4607, alone from 4608',
      same(w1, engineWeights(water, 0, w1.length)) && w1[4410] === 4095 && w1.slice(4411, 4608).every((v) => v === 4095) &&
      w1[4608] === 4096, `first difference at ${firstDiff(w1, engineWeights(water, 0, w1.length))}`);
    // A change is taken at the next 512-sample block of the slot's own count, and only once the ramp has reported
    // done (row 1: 0x18003f254 to 0x18003f29c).
    const s = R.createSlot({ fade: 0.2, preset: GAIN(0.5) });
    const x = new Int32Array(30000).fill(4096);
    const o = new Int32Array(30000);
    s.process(x.subarray(0, 700), o.subarray(0, 700));
    s.set(GAIN(0));                                   // asked on sample 700: taken on 1024
    s.process(x.subarray(700, 2000), o.subarray(700, 2000));
    const waiting = s.state().requested;
    s.set(GAIN(1));                                   // asked during the fade (done on 9844): taken on 10240
    const during = s.state();
    s.process(x.subarray(2000), o.subarray(2000));
    const expA = engineWeights(room, 1024, 9216).map((w) => 2048 + (Math.imul(-2048, w) >> 12));
    check('a change asked mid-block is taken at the next block (1024), not before; its fade as the engine\'s',
      o.subarray(0, 1024).every((v) => v === 2048) && same(Array.from(o.subarray(1024, 10240)), expA) && waiting === undefined);
    check('a change asked during a fade waits for the ramp\'s done and the next block (10240): 0 on 9845 to 10239, then its own fade, alone from 19456',
      during.fading && during.requested !== undefined && o.subarray(9845, 10240).every((v) => v === 0) &&
      same(Array.from(o.subarray(10240, 30000)), engineWeights(room, 10240, 30000 - 10240)) && o[19455] === 4095 && o[19456] === 4096);
    // A fade to "none" ends on the input bit for bit, at the block after the done call.
    const sn = R.createSlot({ fade: 0.2, preset: 6, draw: upper });
    const inp = Int32Array.from({ length: 30000 }, (_, i) => NOISE[i % NOISE.length] >> 2);
    const on = new Int32Array(30000);
    sn.process(inp.subarray(0, 5000), on.subarray(0, 5000));
    sn.set(null);                                     // taken on 5120; done on 5120 + 8820; mixed to 14335
    sn.process(inp.subarray(5000), on.subarray(5000));
    check('a fade to none taken at 5120: still mixed on 13941 to 14335, the input bit for bit from 14336 (F1)',
      same(Array.from(on.subarray(14336)), Array.from(inp.subarray(14336))) &&
      on.subarray(13941, 14336).some((v, k) => v !== inp[13941 + k]) && sn.state().preset === null && !sn.active());
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
    // During a fade both instances run on the same input and draw from the slot's one stream: the new instance
    // first, then the old (second read, row 7 and F5: 0x1800383a0, 0x1800383ae). Expected: two instances stepped
    // by hand in that order on one stream, mixed with the engine's weights (the module's instances, the rule read).
    const sd = R.createSlot({ preset: 17, draw: drawOf(9) });
    sd.set(16);
    const got = sd.process(inp);
    const shared = drawOf(9), A = R.createInstance(17, shared), B = R.createInstance(16, shared);
    const W = engineWeights(room, 0, inp.length);
    const want = Array.from(inp, (x, k) => {
      if (k >= 9216) return B.next(x);
      const b = B.next(x), a = A.next(x);
      return (a + (Math.imul(b - a, W[k]) >> 12)) | 0;
    });
    check('during a fade from 17 to 16 (both draw), the new instance runs and draws first in each sample', same(Array.from(got), want),
      `first difference at ${firstDiff(Array.from(got), want)}`);
    // An equal preset is no change (row 19, "equal to the current number: return"): numbers compare by number,
    // a preset object by its value. So an equal copy starts no fade, while 26 and 27 (equal presets, two numbers)
    // do.
    const copy = () => JSON.parse(JSON.stringify(TABLE[6]));
    const sc = R.createSlot({ preset: copy(), draw: upper });
    sc.set(copy()); sc.process(inp.subarray(0, 1024));
    const sc6 = R.createSlot({ preset: 6, draw: upper });
    sc6.set(copy()); sc6.process(inp.subarray(0, 1024));
    const s26 = R.createSlot({ preset: 26, draw: upper });
    s26.set(27); s26.process(inp.subarray(0, 1024));
    check('setting an equal copy of the preset held (as an object, or for its number) starts no fade; 26 to 27 does',
      !sc.state().fading && sc.state().requested === undefined && !sc6.state().fading && sc6.state().preset === 6 &&
      s26.state().fading && s26.state().preset === 27);
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
    // The path's shares, per block in the engine's order: the update (a take), then the mix (the shares), then
    // the slot stage (second read, F2; row 6: 0x1800469ce, 0x180046cd9, 0x1800470d8). Values from the order's share
    // table: the start-up values 26/229, preset 114's header 72/183, preset 0's header 26/229.
    const z = new Int32Array(512);
    const run1 = (path, n) => { const q = new Int32Array(n); path.process(q, q.slice()); };
    {
      const path = R.createRoomPath({ seed: 5 });
      path.spurtStart();                              // the start-up values
      const a = path.shares();
      run1(path, 100);
      path.setRoom(114);                              // asked mid-block
      const b = path.shares();                        // this block was mixed with 0/256
      run1(path, 412);
      const c = path.shares();                        // block 512: the update takes 114, then the mix
      path.spurtStart();
      const d = path.shares();
      check('a room asked mid-block: 0/256 for that block; at the next block\'s start the update takes it before the mix, so that block already has the room share (26/229, F2)',
        same(a, { room: 0, direct: 256 }) && same(b, a) && same(c, { room: 26, direct: 229 }));
      check('the running spurt keeps its limits after the take (26/229); the next spurt has 114\'s (72/183)',
        same(d, { room: 72, direct: 183 }) && same(path.state().mix.map((v) => +v.toFixed(3)), [0.4, 0.9, 80, 0.7]));
    }
    {
      // F2's case, a block later: a fade to none taken at 512 (asked after block 0's update). Done on 9332, mixed
      // to 9727; the old instance and "before" go in the slot stage of block 9728, after that block's mix: the room
      // share for block 9728 still, 0/256 from block 10240 (for a take at 0: 9216 and 9728, as F2 gives them).
      const path = R.createRoomPath({ room: 114, seed: 5 });
      path.spurtStart();                              // block 0's update, then 114's values: 72/183
      path.setRoom(null);                             // waits for block 512's update
      const at0 = path.shares();
      run1(path, 9728);
      const at9728 = path.shares();
      run1(path, 512);
      const at10240 = path.shares();
      check('a fade to none taken at 512: the room share still for block 9728 (72/183), 0/256 from block 10240 (F2)',
        same(at0, { room: 72, direct: 183 }) && same(at9728, { room: 72, direct: 183 }) && same(at10240, { room: 0, direct: 256 }));
    }
    {
      // F3 (row 9: 0x180038927, 0x1800389c6): taking "none" sets the four values from preset 0's header (0.2, 0.7,
      // 80, 0.5), so a spurt that starts during the fade to none has 26/229, not the old room's 72/183.
      const path = R.createRoomPath({ room: 114, seed: 5 });
      path.setRoom(null);
      run1(path, 1024);
      path.spurtStart();
      check('taking none overwrites the four values with preset 0\'s header (0.2, 0.7, 80, 0.5): a spurt in the fade to none has 26/229 (F3)',
        same(path.state().mix, [0.2, 0.7, 80, 0.5].map(Math.fround)) && same(path.shares(), { room: 26, direct: 229 }));
    }
    const made = R.createRoomPath({ room: 126 });
    check('a path made with a room has its shares at once (126: 5/250)', same(made.shares(), { room: 5, direct: 250 }));
    {
      // The four values change when the slot takes the preset (row 8: 0x1800389a1 to 0x180038a31), at a block's
      // update, not when it is asked: a spurt that starts mid-block keeps the old values.
      const p6 = R.createRoomPath({ room: 6 });
      run1(p6, 100);
      p6.setRoom(114);
      p6.spurtStart();
      const asked = p6.shares();
      run1(p6, 412);
      p6.spurtStart();
      check('the four mix values change when the slot takes the preset, not when it is asked (26/229 mid-block, 72/183 from the next block)',
        same(asked, { room: 26, direct: 229 }) && same(p6.shares(), { room: 72, direct: 183 }));
    }
    // The water (second read, row 11 and F4: 0x180047256 to 0x18004729b): one instance for the path's life, run on
    // the whole sum or not run at all, block by block, with no fade; frozen while not run. With the amplifier of
    // preset 14 alone as the water preset (dsp_water's place), fed 4096, the output is the gain on that sample of
    // the instance's own life: 4096 for its samples 0 to 4412, then the model's glide, 1640 from 7938 on (AM 2).
    {
      const r14 = L.ramps['preset 14 amplifier'].values;
      const gainAt = (k) => (k < 4412 ? 4096 : k - 4412 < r14.length ? r14[k - 4412] : 1640);
      const path = R.createRoomPath({ waterPreset: one([11, [1, 0, 0, 0, 10, 0.6, 80, 0]]) });
      const plan = [[1024, false], [4096, true], [1024, false], [6144, true], [1024, false], [3072, true]];
      const got = [], want = [];
      let k = 0;                                      // the instance's own sample count
      for (const [n, wet] of plan) {
        path.setWater(wet);
        const o = path.process(new Int32Array(n).fill(4096), new Int32Array(n));
        got.push(...o);
        for (let i = 0; i < n; i++) want.push(wet ? gainAt(k++) : 4096);
      }
      // Asked mid-block, a switch waits for the next block's start: out of the water after 100 samples of a block.
      const p1 = path.process(new Int32Array(100).fill(4096), new Int32Array(100));
      path.setWater(false);
      const p2 = path.process(new Int32Array(924).fill(4096), new Int32Array(924));
      const late = [...p1, ...p2];
      check('the water switched at block starts with no fade, its instance frozen while dry: full gain only for the first 4,413 samples it ever runs, 1640 at once on a later dive; a switch asked mid-block waits for the next block',
        same(got, want) && got[1024 + 4096 + 1024 + 316] === 4096 && got[1024 + 4096 + 1024 + 317] === 4095 &&
        got.slice(-3072).every((v) => v === 1640) && got[1024 + 4096 + 1024 + 6144 - 1] === 1640 &&
        got[1024 + 4096 + 1024 + 6144] === 4096 && late.slice(0, 512).every((v) => v === 1640) &&
        late.slice(512).every((v) => v === 4096), `first difference at ${firstDiff(got, want)}`);
      // The same with preset 14 itself, on the noise: expected from one instance of 14, made fresh and stepped
      // only on the wet blocks (the module's instance, the rule read).
      const p14 = R.createRoomPath({ waterDraw: drawOf(5) });
      const inst = R.createInstance(14, drawOf(5));
      const g14 = [], w14 = [];
      let pos = 0;
      for (const [n, wet] of [[512, false], [2048, true], [1536, false], [4096, true], [512, false], [1024, true]]) {
        p14.setWater(wet);
        const d = Int32Array.from({ length: n }, (_, i) => NOISE[(pos + i) % NOISE.length] >> 1);
        g14.push(...p14.process(d, new Int32Array(n)));
        for (let i = 0; i < n; i++) w14.push(wet ? inst.next(d[i]) : d[i]);
        pos += n;
      }
      check('preset 14 as the water: one instance, run only on the wet blocks, the dry blocks the sum itself', same(g14, w14),
        `first difference at ${firstDiff(g14, w14)}`);
    }
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

  // ================================================================ part b: the automatic room
  // Expected values: the order's tables (part b, items 3 and 5: typed in below), R2 e1 and e2 and the W3-17a
  // second read (typed in, each with where it is from), reference.out and tails.out, and tests/roomdsp/auto.json,
  // which auto.py reads out of the model's own build_auto and instances.
  const AUTO = JSON.parse(readFileSync(join(data, 'auto.json'), 'utf8'));
  const toMeasures = (m) => ({ sky: !!m[0], width: m[1], length: m[2], height: m[3], reflectivity: m[4], openSides: m[5] });
  const classList = (c) => [c.size, c.width, c.length, c.height, c.reflectivity, c.diffusion];
  const singles = (p) => p.map(([t, v]) => [t, v.map(Math.fround)]);
  // The module's build against one of auto.json's records: shape, classes, pair, copy, shares, header, parameters.
  const againstModel = (rec, table) => {
    let b;
    try { b = R.buildAutomatic(toMeasures(rec.m), { table }); } catch (e) { return `${rec.label || ''}: ${e.message}`; }
    const bad = [];
    if (b.shapeNumber !== rec.shape) bad.push(`shape ${b.shapeNumber}`);
    if (!same(classList(b.classes), rec.classes)) bad.push(`classes ${classList(b.classes)}`);
    if (b.pair[0] !== rec.base || b.pair[1] !== rec.base + 1 || b.copy !== rec.copy) bad.push(`pair ${b.pair} copy ${b.copy}`);
    if (!same(R.shares(b.preset), { room: rec.shares[0], direct: rec.shares[1] })) bad.push('shares');
    if (!same(b.preset.h, rec.h.map(Math.fround))) bad.push('header');
    if (!same(b.preset.p, singles(rec.p))) bad.push('parameters');
    return bad.length ? `${rec.label || rec.m}: ${bad.join(', ')}` : null;
  };
  const allAgainstModel = (recs, table) => recs.map((r) => againstModel(r, table)).filter(Boolean);
  // A copy of the table with templates edited as auto.py edits them.
  const editedTable = (edits) => {
    const t = JSON.parse(JSON.stringify(TABLE));
    for (const e of edits) {
      if (e.length === 2) t[e[0]].p = e[1].map(([ty, v]) => [ty, v.slice()]);
      else t[e[0]].p[e[1]][1][e[2]] = e[3];
    }
    return t;
  };
  // The order's tables (part b, items 3 and 5): key, label, sky, width, length, height, reflectivity, open sides;
  // shape; classes size, width, length, height; the template copied; room / direct.
  const ORDER_CASES = [
    ['closet', 'Very small room', false, 120, 140, 100, 0.3, 0, 'room', [0, 1, 0, 1], 102, 38, 217],
    ['small_room', 'Small room', false, 200, 260, 120, 0.4, 0, 'room', [1, 2, 1, 1], 102, 38, 217],
    ['room', 'Room', false, 300, 400, 160, 0.4, 0, 'room', [2, 3, 2, 2], 103, 41, 214],
    ['large_room', 'Large room', false, 500, 700, 220, 0.4, 0, 'room', [3, 3, 3, 3], 103, 41, 214],
    ['great_hall', 'Great hall', false, 700, 1300, 400, 0.4, 0, 'room', [4, 4, 4, 4], 103, 41, 214],
    ['vent', 'Vent or duct', false, 48, 400, 64, 0.4, 0, 'duct', [1, 0, 2, 1], 106, 51, 204],
    ['corridor', 'Corridor', false, 80, 400, 120, 0.4, 0, 'hall', [1, 1, 2, 1], 110, 38, 217],
    ['long_corridor', 'Long corridor', false, 90, 1200, 120, 0.4, 0, 'hall', [2, 1, 4, 1], 111, 38, 217],
    ['tunnel', 'Tunnel', false, 200, 1000, 150, 0.3, 0, 'tunnel', [2, 2, 3, 2], 115, 72, 183],
    ['big_tunnel', 'Big tunnel', false, 280, 1400, 250, 0.4, 0, 'tunnel', [3, 2, 4, 3], 115, 72, 183],
    ['alley', 'Alley, walls all round', true, 120, 600, 4800, 0.4, 0, 'alley', [1, 1, 3, 4], 122, 24, 231],
    ['street', 'Street, walls all round', true, 300, 1300, 4800, 0.4, 0, 'street', [3, 3, 4, 4], 119, 23, 232],
    ['courtyard', 'Courtyard', true, 500, 700, 4800, 0.4, 0, 'courtyard', [3, 3, 3, 4], 127, 5, 250],
    ['open', 'Open ground (a guess)', true, 2, 2, 4800, 0.08, 4, 'open space', [0, 0, 0, 4], 130, 5, 250],
  ];
  const ORDER_MEASURED = [   // item 5: the classes the order gives (null: not given), the reflectivity class
    ['set_c_room', 'Spawn-sized room (as recorded, Set C)', false, 300, 400, 160, 0.9, 0, 'room', [2, null, null, null], 103, 41, 214, 3, 'Set C'],
    ['set_d_street', 'Street (as recorded, Set D)', true, 300, 1000, 4800, 0.4, 0, 'street', [3, 3, 3, null], 119, 23, 232, 1, 'Set D'],
  ];
  const KEYS = [...ORDER_CASES, ...ORDER_MEASURED].map((c) => c[0]);
  // A check whose expression may throw on a broken module: the throw fails the check, with its message.
  const checkTry = (name, fn) => { let ok = false, msg = ''; try { ok = !!fn(); } catch (e) { msg = e.message; } check(name, ok, msg); };
  const built = Object.fromEntries(KEYS.map((k) => { try { return [k, R.buildAutomatic(k)]; } catch (e) { return [k, null]; } }));

  if (section('The automatic room: shapes and classes (part b)')) {
    const rows = R.ROOM_CASES || [];
    check('ROOM_CASES: the 14 examples and the two measured cases, in the order\'s order, with its labels and measures',
      same(rows.map((r) => [r.key, r.label, r.measures.sky, r.measures.width, r.measures.length, r.measures.height,
        r.measures.reflectivity, r.measures.openSides]), [...ORDER_CASES, ...ORDER_MEASURED].map((c) => c.slice(0, 8))));
    check('the two measured cases are marked measured, with their sets; no example is; ROOM_PLACES starts empty',
      same(rows.filter((r) => r.measured).map((r) => [r.key, r.set]), [['set_c_room', 'Set C'], ['set_d_street', 'Set D']]) &&
      Array.isArray(R.ROOM_PLACES) && R.ROOM_PLACES.length === 0 && Object.isFrozen(R.ROOM_CASES) &&
      typeof (rows.find((r) => r.key === 'open') || {}).note === 'string');
    // The two notes the page shows, typed here from the W3-17b second read, section 3 (what each take fixes and
    // which measures build the same preset) and the order's item 5 (the reflectivity classes).
    const NOTES = {
      set_c_room: 'Fitted to the owner\'s Set C: a room whose shorter side is 145 to 576 units (12 to 48 feet); the take ' +
        'fixes the size class (2), not the size. Reflectivity class 3 fits best, class 2 nearly as well. These ' +
        'measures are one room that builds this preset.',
      set_d_street: 'Fitted to the owner\'s Set D, PC A (echoes at 68, 120 and 308 ms): a street 289 to 460 units wide and ' +
        '723 to 1152 long (24 to 38 by 60 to 96 feet). An open street (two walls open) with the same classes builds ' +
        'the same preset, so the take cannot tell the two apart. The take does not fix the reflectivity class; class ' +
        '1 is taken. These measures are one such street.',
    };
    check('the two measured cases\' notes say what the takes fix, word for word as typed here (second read, section 3)',
      Object.entries(NOTES).every(([k, t]) => (rows.find((r) => r.key === k) || {}).note === t));
    let bad = [];
    for (const [k, , , , , , , , shape, cls, copy, room, direct] of ORDER_CASES) {
      const b = built[k];
      if (!b || b.shape !== shape || !same(classList(b.classes), [...cls, 1, 0]) || b.copy !== copy ||
        b.pair[0] !== (copy & ~1) || !same(R.shares(b.preset), { room, direct })) bad.push(k);
    }
    check('the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair, copy and shares as the order\'s table gives them',
      bad.length === 0, bad.join(' '));
    bad = [];
    for (const [k, , , , , , , , shape, cls, copy, room, direct, refl] of ORDER_MEASURED) {
      const b = built[k];
      if (!b || b.shape !== shape || b.copy !== copy || b.classes.reflectivity !== refl || b.classes.diffusion !== 0 ||
        !cls.every((v, i) => v === null || v === classList(b.classes)[i]) || !same(R.shares(b.preset), { room, direct })) bad.push(k);
    }
    check('the two measured cases: set_c_room a room of size class 2 and reflectivity class 3, from 103, 41/214; set_d_street a street of size, width and length class 3, from 119, 23/232',
      bad.length === 0, bad.join(' '));
    bad = [];
    for (const k of KEYS) {
      const rec = AUTO.cases[k], b = built[k];
      if (!b || b.shapeNumber !== rec.shape || !same(classList(b.classes), rec.classes) || b.pair[0] !== rec.base || b.copy !== rec.copy) bad.push(k);
    }
    check('the 16 cases: shape, classes, pair and copy are the model\'s (auto.json)', bad.length === 0, bad.join(' '));
    // No case sits on a threshold of a class or of the reflectivity (the order, item 3; the thresholds of R2 e1),
    // nor on a ratio of the shape rules (R2 e2); vent's width of 48 is the order's own: the widest a duct can be.
    const near = [];
    for (const [k, , sky, W, Lm, H, refl] of [...ORDER_CASES, ...ORDER_MEASURED]) {
      if ([72, 144, 288, 576].includes(W)) near.push(`${k} width`);
      const courtyard = k === 'courtyard';         // the courtyards' size class has a length scale of its own
      if ([144, 288, 576, 1152].includes(Lm) || (courtyard && [120, 240, 480, 1200].includes(Lm))) near.push(`${k} length`);
      if ([48, 128, 216, 384].includes(H)) near.push(`${k} height`);
      if ([0.04, 0.5, 0.8].some((t) => Math.abs(refl - t) < 0.01)) near.push(`${k} reflectivity`);
      if (Lm === 4 * W || Lm === 2.5 * W || (!sky && H === 3 * Lm)) near.push(`${k} a shape ratio`);
      if ([96, 144].includes(W) || (W === 48 && k !== 'vent')) near.push(`${k} a shape width`);
    }
    check('no case sits on a threshold (of the widths, lengths, courtyard lengths, heights, reflectivities, the shape rules\' ratios and widths but vent\'s 48)',
      near.length === 0, near.join(' '));
    // Each threshold of R2 e1 and e2, on, one under and one over, judged against the model.
    const groups = [
      ['the width class at 72, 144, 288 and 576 (indoors, and under the sky where the size class is the width class)', /^width \d+,/],
      ['the length class at 144, 288, 576 and 1152', /^length \d+/],
      ['the height class at 48, 128, 216 and 384', /^height \d+/],
      ['the courtyards\' size class at lengths 120, 240, 480 and 1200 (courtyard and open courtyard)', /courtyard, length \d+/],
      ['the reflectivity class at 0.04, 0.5 and 0.8 (the single on it, one single under and over, doubles 1e-9 either side), and 0 and 1', /^reflectivity/],
      ['the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the shaft swap, 0 to 4 open sides, open sides indoors', /^(duct|hall|tunnel|courtyard:|alley|the shaft|a duct|\d open|open sides)/],
      ['the other reading of `open`, a width larger than the length, all measures 0', /^(open:|width larger|all zero)/],
    ];
    const used = new Set();
    for (const [name, re] of groups) {
      const recs = AUTO.probes.filter((p) => re.test(p.label));
      recs.forEach((r) => used.add(r.label));
      const errs = allAgainstModel(recs);
      check(`${name}: the model's shape, classes, pair, copy, shares, header and parameters (${recs.length} measures)`,
        recs.length > 0 && errs.length === 0, errs.slice(0, 4).join('; '));
    }
    check('every probe of auto.json was judged', used.size === AUTO.probes.length, `${used.size} of ${AUTO.probes.length}`);
    // The reflectivity's thresholds as R2 e1 gives them, with the second read's row 20 for 0.8: above 0.04 as a
    // double, at most 0.5, above 0.8 as a double against the double 0.8, so the single 0.8 (0.800000012) is class 3.
    const rc = (r) => R.buildAutomatic({ sky: false, width: 300, length: 400, height: 160, reflectivity: r, openSides: 0 }).classes.reflectivity;
    checkTry('reflectivity classes: 0.04 is 0 and the next single 1; 0.5 is 1 and the next single 2; 0.8 is 3 (the single 0.800000012 > 0.8), the single under it 2',
      () => rc(0) === 0 && rc(0.04) === 0 && rc(0.040000003) === 1 && rc(0.5) === 1 && rc(0.50000006) === 2 && rc(0.8) === 3 &&
      rc(0.79999995) === 2 && rc(0.6) === 2 && rc(0.9) === 3 && rc(1) === 3);
    // The size class's three rules (R2 e1): the courtyards by the length's own scale, street and alley by the
    // width class, the rest by the mean of the width and length classes, truncated. An open street is "the rest".
    const sz = (sky, W, Lm, open, H = 4800) => R.buildAutomatic({ sky, width: W, length: Lm, height: H, reflectivity: 0.4, openSides: open });
    checkTry('the size class: an alley 120 x 600 is 1 (its width class), an open street of the same measures 2 (the mean of 1 and 3), a courtyard of length 250 is 2, a room 300 x 700 is 3', () => {
      const alley = sz(true, 120, 600, 0), ost = sz(true, 120, 600, 2), cy = sz(true, 200, 250, 0), room = sz(false, 300, 700, 0, 200);
      return alley.shape === 'alley' && alley.classes.size === 1 && ost.shape === 'open street' && ost.classes.size === 2 &&
        cy.shape === 'courtyard' && cy.classes.size === 2 && room.shape === 'room' && room.classes.size === 3;
    });
    // The other reading of `open` (the order, item 3): spans of 9600 give size class 4, a copy of 131, 5/250 too.
    checkTry('`open` read the other way (spans of 9600): open space, size class 4, a copy of 131, and 5/250 as well', () => {
      const other = R.buildAutomatic({ sky: true, width: 9600, length: 9600, height: 4800, reflectivity: 0.08, openSides: 4 });
      return other.shape === 'open space' && other.classes.size === 4 && other.copy === 131 &&
        same(R.shares(other.preset), { room: 5, direct: 250 }) && same(R.shares(built.open.preset), { room: 5, direct: 250 });
    });
    // The vertical shaft (W3-17b second read, finding 1): indoors, a height over three lengths (strictly), the engine
    // exchanges length and height in its record (0x180032059 to 0x180032083), names the shape and works out the
    // classes from that record, and exchanges them back afterwards (0x18003219f to 0x1800321b1). Typed from that read.
    const indoor = (width, length, height) => R.buildAutomatic({ sky: false, width, length, height, reflectivity: 0.4, openSides: 0 });
    checkTry('a vertical shaft has the classes of its exchanged length and height: 100 x 100 x 400 a room of size 1, width 1, length 2, height 1 (102); 200 x 250 x 800 size 2, width 2, length 3, height 3 (103); 100 x 100 x 300 is no shaft', () => {
      const a = indoor(100, 100, 400), b = indoor(200, 250, 800), c = indoor(100, 100, 300);
      return a.shaft && a.shape === 'room' && same(classList(a.classes), [1, 1, 2, 1, 1, 0]) && a.copy === 102 &&
        b.shaft && b.shape === 'room' && same(classList(b.classes), [2, 2, 3, 3, 1, 0]) && b.copy === 103 &&
        !c.shaft && same(classList(c.classes), [0, 1, 0, 3, 1, 0]);
    });
    {
      const f = Math.fround, rv = (b) => b.preset.p.find(([t]) => t === 2)[1], df = (b) => b.preset.p.find(([t]) => t === 10)[1];
      const at = (v, idx) => idx.map((i) => v[i]);
      checkTry('the second read\'s three shafts, value for value: 200 x 250 x 800 (room, 103: DFR 1, 3, 0.150000006; RVA 105.599998, 33.2000008, 5.19999981, 0.856000006, 1.62000012, cutoff 2850), 60 x 100 x 400 (hall, 110), 120 x 150 x 600 (tunnel, 115)', () => {
        const r = indoor(200, 250, 800), h = indoor(60, 100, 400), t = indoor(120, 150, 600);
        return r.shape === 'room' && same(classList(r.classes).slice(0, 4), [2, 2, 3, 3]) && r.copy === 103 &&
          same(r.preset.h, [0.32, 0.8, 0, 0, 80, 0.5].map(f)) && same(df(r).slice(0, 3), [1, 3, 0.150000006].map(f)) &&
          same(at(rv(r), [0, 1, 2, 3, 4, 5]), [105.599998, 33.2000008, 5.19999981, 0.856000006, 1.62000012, 2850].map(f)) &&
          h.shape === 'hall' && same(classList(h.classes).slice(0, 4), [1, 0, 2, 1]) && h.copy === 110 &&
          same(at(rv(h), [2, 4, 5, 9, 10, 11, 12, 13, 14]),
            [3.5999999, 1.96000004, 4500, 7, 47.5200043, 12.1599998, 0.850000024, -0.659999967, 0.300000012].map(f)) &&
          t.shape === 'tunnel' && same(classList(t.classes).slice(0, 4), [2, 1, 3, 2]) && t.copy === 115 &&
          same(df(t).slice(0, 3), [1, 2.4000001, 0.148980007].map(f)) &&
          same(at(rv(t), [2, 4, 5, 9, 10, 11, 12, 13, 14]),
            [7.19999981, 2, 4500, 9.60000038, 89.6000061, 18.6399994, 0.94599998, -0.600000024, 0.439999998].map(f));
      });
      checkTry('a shaft\'s measures in place of negative values stay the true ones: the hall pair with w, d, h -1 in both, 60 x 100 x 400, gives 6, 8.33333302, 33.3333321 (feet of 60, 100 and 400)', () => {
        const t = editedTable([[110, 0, 9, -1], [110, 0, 10, -1], [110, 0, 11, -1], [111, 0, 9, -1], [111, 0, 10, -1], [111, 0, 11, -1]]);
        const b = R.buildAutomatic({ sky: false, width: 60, length: 100, height: 400, reflectivity: 0.4, openSides: 0 }, { table: t });
        return b.shaft && b.shape === 'hall' && same(at(rv(b), [9, 10, 11]), [6, 8.33333302, 33.3333321].map(f));
      });
    }
  }

  if (section('The automatic room: the build (part b)')) {
    let bad = [];
    for (const k of KEYS) {
      const rec = AUTO.cases[k], b = built[k];
      if (!b || !same(b.preset.h, rec.h.map(Math.fround)) || !same(b.preset.p, singles(rec.p))) { bad.push(k); continue; }
      const la = L.auto[k];                        // part a's record of the same build (lines.py), for the 14
      if (la && (!same(b.preset.h, la.h) || !same(b.preset.p, la.p))) bad.push(`${k} (lines.json)`);
    }
    check('the 16 cases: the built header and parameters are the model\'s, value for value in single precision (auto.json; the 14 also lines.json)',
      bad.length === 0, bad.join(' '));
    bad = [];
    for (const k of KEYS) if (!built[k] || !same(R.createInstance(built[k].preset, upper).describe(), AUTO.cases[k].d)) bad.push(k);
    check('the 16 cases: describe() is the model\'s built integers', bad.length === 0, bad.join(' '));
    // The order's tables (items 3 and 5), typed in: the built integers each row names.
    const d = (k) => (built[k] ? R.createInstance(built[k].preset, upper).describe() : []);
    const rva = (k) => (d(k).find((u) => u.t === 'RVA') || { lines: [] }).lines;
    const pv = (k, type, i) => { const q = built[k] && built[k].preset.p.find(([t]) => t === type); return q ? q[1][i] : NaN; };
    const lines3 = (k) => rva(k).map((l) => [l.D, l.a, l.g]);
    const firstLast = (k) => { const ls = rva(k); return ls.length ? [ls.length, ls[0].D, ls[0].a, ls[0].g, ls.at(-1).D, ls.at(-1).a, ls.at(-1).g] : []; };
    const allpasses = (k) => (d(k).find((u) => u.t === 'DFR') || { stages: [] }).stages.map((s) => [s.D, s.a]);
    const C_LINES = [[1464, 3506, 764], [2081, 3283, 1053], [2698, 3075, 1323], [3360, 2866, 1327], [3977, 2684, 1327]];
    const AP3 = [[573, 614], [837, 614], [1146, 614]];
    const PINS = [
      ['closet: lines 1323 (3194; 1983), 2425 (2597; 2252); cutoff 2850 (R2\'s example 2)', () =>
        same(lines3('closet'), [[1323, 3194, 1983], [2425, 2597, 2252]]) && pv('closet', 2, 5) === 2850],
      ['small_room: 3 lines 1358 (3350; 1350), 2152 (2979; 1856), 2989 (2632; 1856)', () =>
        same(lines3('small_room'), [[1358, 3350, 1350], [2152, 2979, 1856], [2989, 2632, 1856]])],
      ['room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684; 764 to 1327), Set C\'s lines; cutoff 2850', () =>
        same(allpasses('room'), AP3) && same(lines3('room'), C_LINES) && pv('room', 2, 5) === 2850],
      ['large_room: 3 all-passes; 6 lines 1640 to 5300 (3661 to 2851; 545 to 1283)', () =>
        allpasses('large_room').length === 3 && same(firstLast('large_room'), [6, 1640, 3661, 545, 5300, 2851, 1283])],
      ['great_hall: 3 all-passes; 8 lines 1887 to 7267 (3817 to 3123; 298 to 1039)', () =>
        allpasses('great_hall').length === 3 && same(firstLast('great_hall'), [8, 1887, 3817, 298, 7267, 3123, 1039])],
      ['vent: lines 444 (3727; 1472), 3619 (1898; 4096); cutoff 3000', () =>
        same(lines3('vent'), [[444, 3727, 1472], [3619, 1898, 4096]]) && pv('vent', 2, 5) === 3000],
      ['corridor: predelay 2072 (factor 2703), 617 (1228; 2676), 308 (3481; 1607); cutoff 4500', () =>
        same(rva('corridor').map((l) => [l.kind, l.D, l.fb, l.g]), [[4, 2072, -2703, 4096], [2, 617, 1228, 2676], [2, 308, 3481, 1607]]) &&
        pv('corridor', 2, 5) === 4500],
      ['long_corridor: predelay 5733 (1720) and 5 lines 926, 308, 1719, 1234, 617', () =>
        same(rva('long_corridor').map((l) => l.D), [5733, 926, 308, 1719, 1234, 617]) && rva('long_corridor')[0].kind === 4 &&
        rva('long_corridor')[0].fb === -1720],
      ['tunnel: R2\'s example 3: 2 all-passes (573, 837; 610), predelay 3924 (2457) and 8 lines', () =>
        same(allpasses('tunnel'), [[573, 610], [837, 610]]) && same(rva('tunnel').map((l) => [l.D, l.kind, l.fb, l.g]),
          [[3924, 4, -2457, 4096], [1543, 2, 1802, 910], [617, 2, 3899, 227], [1278, 2, 2457, 910], [1852, 2, 1802, 910],
            [926, 2, 3899, 227], [1587, 2, 2457, 910], [2160, 2, 1802, 910], [1234, 2, 3899, 227]])],
      ['big_tunnel: 2 all-passes (feedback 611), predelay 5909 (2048) and 8 lines', () =>
        same(allpasses('big_tunnel'), [[573, 611], [837, 611]]) && rva('big_tunnel').length === 9 &&
        same([rva('big_tunnel')[0].kind, rva('big_tunnel')[0].D, rva('big_tunnel')[0].fb], [4, 5909, -2048])],
      ['alley: predelays 5997 (1130) and 3087 (901), line 2205 (2048; 3686); cutoff 3500', () =>
        same(rva('alley').map((l) => [l.kind, l.D, l.fb, l.g]), [[4, 5997, -1130, 4096], [4, 3087, -901, 4096], [2, 2205, 2048, 3686]]) &&
        pv('alley', 2, 5) === 3500],
      ['street: predelays 17287 (524) and 5292 (901), line 2998 (1769; 3686); cutoff 1750', () =>
        same(rva('street').map((l) => [l.kind, l.D, l.fb, l.g]), [[4, 17287, -524, 4096], [4, 5292, -901, 4096], [2, 2998, 1769, 3686]]) &&
        pv('street', 2, 5) === 1750],
      ['courtyard: one echo, 5144 samples (116.67 ms, the length / 6), feedback 1802, gain 4915; cutoff 2760', () =>
        same(d('courtyard').map((u) => u.line && [u.t, u.line.kind, u.line.D, u.line.a, u.line.g]), [['DLY', 2, 5144, 1802, 4915]]) &&
        pv('courtyard', 1, 5) === 2760 && pv('courtyard', 1, 1) === Math.fround(700 / 6)],
      ['open: all-pass 13230, 3 all-passes, delay 7937, 6 modulated lines 9702 to 14112', () => {
        const u = d('open');
        return u.length === 4 && u[0].t === 'DLY' && u[0].line.kind === 1 && u[0].line.D === 13230 && u[1].stages.length === 3 &&
          u[2].t === 'DLY' && u[2].line.D === 7937 && u[3].lines.length === 6 && u[3].lines[0].D === 9702 &&
          u[3].lines[5].D === 14112 && Array.isArray(u[3].mod);
      }],
      ['set_c_room: 3 all-passes (573, 837, 1146; 614); 5 lines 1464, 2081, 2698, 3360, 3977 (feedback 3506 ... 2684; gain 764 ... 1327); cutoff 4950', () =>
        same(allpasses('set_c_room'), AP3) && same(lines3('set_c_room'), C_LINES) && pv('set_c_room', 2, 5) === 4950],
      ['set_d_street: predelays 13582 (308 ms; 557) and 5292 (120 ms; 901), line 2998 (68 ms; 1769; 3686); cutoff 1750', () =>
        same(rva('set_d_street').map((l) => [l.kind, l.D, l.fb, l.g]), [[4, 13582, -557, 4096], [4, 5292, -901, 4096], [2, 2998, 1769, 3686]]) &&
        pv('set_d_street', 2, 5) === 1750 && same([9, 10, 11].map((i) => pv('set_d_street', 2, i)), [68, 308, 120])],
    ];
    for (const [name, fn] of PINS) check(`the order's numbers, ${name}`, (() => { try { return fn(); } catch (e) { return false; } })());
    // R2's two examples by their echo tables (R2 "Model" 2 and 3: 64 x the room share fed straight in).
    const echoes = (preset, x0) => peaks(run(R.createInstance(preset, upper), [x0], 6 * 44100 - 1), 10);
    check('closet (R2\'s small room) fed 2432: (0, 2514) (1324, 259) (2426, 239) (2649, 105) (3974, 61) (4853, 79) (5299, 39) (6625, 27) (7280, 37)',
      !!built.closet && same(echoes(built.closet.preset, 2432), [[0, 2514], [1324, 259], [2426, 239], [2649, 105], [3974, 61], [4853, 79], [5299, 39], [6625, 27], [7280, 37]]));
    check('tunnel (R2\'s) fed 4608: (0, 125) (573, -864) (837, -864) (1146, -133) (1410, 5622) (1674, -133) (1983, 833) (2028, 86) (2247, 833) (2337, 85)',
      !!built.tunnel && same(echoes(built.tunnel.preset, 4608), [[0, 125], [573, -864], [837, -864], [1146, -133], [1410, 5622], [1674, -133], [1983, 833], [2028, 86], [2247, 833], [2337, 85]]));
    // Templates edited for the rules no template of the table runs (auto.json, the model's build of each).
    for (const rec of AUTO.templates) {
      const err = againstModel(rec, editedTable(rec.edits));
      let dOk = false;
      try {
        // A delay's high-pass first section (a width over 0) is computed and marked "not pinned"; the mark aside.
        const b = R.buildAutomatic(toMeasures(rec.m), { table: editedTable(rec.edits) });
        const desc = rec.d === null ? [] : R.createInstance(b.preset, upper).describe();
        // (null: a template the app cannot build, a filter; its parameters are still the model's)
        dOk = rec.d === null || same(desc.map(({ notPinned, ...u }) => u), rec.d);
      } catch (e) { /* err says */ }
      check(`edited templates, ${rec.label}: the model's build and built integers`, !err && dOk, err || 'describe()');
    }
    // The order's synthetic pair (part b's checks; reference.py's template case): built width 6.6666665, depth
    // 33.333332, and its hash in reference.out.
    checkTry('the synthetic pair "negative width and depth in templates" (110 width -1, 111 depth -1, the corridor\'s measures): width 6.6666665, depth 33.333332, the reverb reference.out prints, and its hash', () => {
      const corridor = { sky: false, width: 80, length: 400, height: 120, reflectivity: 0.4, openSides: 0 };
      const tpl = R.buildAutomatic(corridor, { table: editedTable([[110, 0, 9, -1], [111, 0, 10, -1]]) });
      const exp = REF.rows.get('synthetic: negative width and depth in templates');
      const sh = R.shares(tpl.preset);
      const y = run(R.createInstance(tpl.preset, drawOf(2)), NOISE.map((s) => R.entry(s, sh.room)), 66150);
      return tpl.preset.p[0][1][9] === Math.fround(6.6666665) && tpl.preset.p[0][1][10] === Math.fround(33.333332) &&
        same(tpl.preset.p[0][1].map(f32text), REF.built) && sh.room === exp.room && sh.direct === exp.direct && sha(y) === exp.hash;
    });
    const errs = allAgainstModel(AUTO.sweep);
    check(`${AUTO.sweep.length} seeded random measures over every shape: the model's shape, classes, pair, copy, shares, header and parameters`,
      errs.length === 0 && new Set(AUTO.sweep.map((r) => r.shape)).size === 11, errs.slice(0, 4).join('; '));
    // AMP on the size class and MDY on the length class, linear (R2 e1; difference 12): no template of the table holds
    // either and the model's build does not blend them, so the expected values are R2 e1's formula, typed here:
    // A + (B - A) x class / 5 in single precision, step by step. The first and second of a type, not the third.
    checkTry('an amplifier blended on the size class and a modulating delay on the length class, linear (R2 e1); a third amplifier copied as it is', () => {
      const f = Math.fround, lin = (a, b, c) => f(f(a) + f(f(f(b) - f(a)) * f(f(c) / f(5))));
      const ampA = [1, 0.1, 0.2, 0, 10, 0.6, 80, 0], ampB = [2, 0.3, 0.5, 0, 4, 0.2, 20, 1];
      const mdyA = [0, 100, 0.4, 1, 0, 2000, 0, 0, 8, 0.2, 10, 0.5, 0.25], mdyB = [2, 400, 0.6, 0.5, 1, 5000, 300, 2, 2, 0.4, 30, 1, 0.75];
      const pad = (v) => [...v, ...new Array(16 - v.length).fill(0)];
      const t = editedTable([[102, [[11, pad(ampA)], [9, pad(mdyA)], [11, pad(ampA)], [11, pad(ampA)]]],
        [103, [[11, pad(ampB)], [9, pad(mdyB)], [11, pad(ampB)], [11, pad(ampB)]]]]);
      const b = R.buildAutomatic({ sky: false, width: 600, length: 400, height: 160, reflectivity: 0.4, openSides: 0 }, { table: t });
      return b.classes.size === 3 && b.classes.length === 2 && b.copy === 103 &&
        same(b.preset.p[0][1], pad(ampA.map((a, i) => lin(a, ampB[i], 3)))) && same(b.preset.p[2][1], b.preset.p[0][1]) &&
        same(b.preset.p[3][1], pad(ampB).map(f)) && same(b.preset.p[1][1], pad(mdyA.map((a, i) => lin(a, mdyB[i], 2))));
    });
  }

  if (section('The automatic room: outputs (part b)')) {
    // The 14 examples built here, on the noise: reference.out's "auto" rows. The two measured: the order's numbers.
    const roomHash = (preset, sh) => { try { return sha(run(R.createInstance(preset, drawOf(2)), NOISE.map((s) => R.entry(s, sh.room)), 66150)); } catch (e) { return e.message; } };
    const tailTry = (preset, water, input) => { try { return tailOf(preset, water, input); } catch (e) { return e.message; } };
    let bad = [];
    for (const [k] of ORDER_CASES) {
      const exp = REF.rows.get(`auto ${k}`), b = built[k];
      const sh = b && R.shares(b.preset);
      if (!b || !exp || sh.room !== exp.room || sh.direct !== exp.direct || roomHash(b.preset, sh) !== exp.hash) bad.push(k);
    }
    check('the 14 examples built here, on the noise: the shares and hash of reference.out', bad.length === 0, bad.join(' '));
    const MEASURED_OUT = {   // the order, part b, item 5
      set_c_room: [41, 214, 'b8160db1baa79bbf672458a508da2590c72479c17d403f14bd7bbf1274d8167f', 32481, 80874],
      set_d_street: [23, 232, '337b9b8673dd8fd76e028ca611165e1b3cc85cd871c9a88e5d1612efb14a285c', 22050, 39889],
    };
    bad = [];
    for (const [k, [room, direct, hash]] of Object.entries(MEASURED_OUT)) {
      const b = built[k], sh = b && R.shares(b.preset);
      if (!b || sh.room !== room || sh.direct !== direct || roomHash(b.preset, sh) !== hash) bad.push(k);
    }
    check('set_c_room 41/214 b8160db1... and set_d_street 23/232 337b9b86... on the noise (the order\'s hashes)', bad.length === 0, bad.join(' '));
    check('the model gives the order\'s numbers for the two (auto.json, which auto.py stops without)',
      Object.entries(MEASURED_OUT).every(([k, [room, direct, hash, q, s]]) => same(AUTO.measured[k], { shares: [room, direct], hash, quiet: q, square: s })));
    const Q = quiet(), S = square();
    bad = [];
    for (const [k] of ORDER_CASES) {
      const e = TAILS.get(`auto ${k}`), p = built[k] && built[k].preset;
      const got = p && { quiet: tailTry(p, false, Q), square: tailTry(p, false, S), qwater: tailTry(p, true, Q), swater: tailTry(p, true, S) };
      if (!got || !same(got, e)) bad.push(`${k}: ${JSON.stringify(got)}`);
    }
    check('the 14 examples built here: where each tail ends, quiet and square, alone and under water (tails.out, 56 tails)', bad.length === 0, bad.join('; '));
    check('the great hall built here, after the long square: tails.out\'s 173162',
      !!built.great_hall && tailTry(built.great_hall.preset, false, square(220500)) === TAILS.get('auto great_hall long').long);
    bad = [];
    for (const [k, [, , , q, s]] of Object.entries(MEASURED_OUT)) {
      const p = built[k] && built[k].preset;
      if (!p || tailTry(p, false, Q) !== q || tailTry(p, false, S) !== s) bad.push(k);
    }
    check('set_c_room\'s tails 32481 (quiet) and 80874 (square), set_d_street\'s 22050 and 39889 (the order\'s)', bad.length === 0, bad.join(' '));
  }

  if (section('The automatic room: the API (part b)')) {
    const m = { sky: false, width: 200, length: 1000, height: 150, reflectivity: 0.3, openSides: 0 };
    checkTry('buildAutomatic takes a case\'s key, its row or the measures alike, and says what it built', () => {
      const byKey = R.buildAutomatic('tunnel'), byRow = R.buildAutomatic(R.roomCase('tunnel')), byMeasures = R.buildAutomatic(m);
      return same(byKey.preset, byMeasures.preset) && same(byRow.preset, byMeasures.preset) && byKey.key === 'tunnel' && byMeasures.key === null &&
        byKey.shape === 'tunnel' && byKey.variable === 'adsp_tunnel_min' && same(byKey.pair, [114, 115]) && byKey.copy === 115 &&
        same(byKey.measures, m) && R.roomCase('nowhere') === null;
    });
    const refused = (arg, word) => { try { R.buildAutomatic(arg); return false; } catch (e) { return e.message.includes(word); } };
    check('measures refused by name: a width that is not a whole number, a negative height, a reflectivity over 1, five open sides, an unknown key',
      refused({ ...m, width: 200.5 }, 'width') && refused({ ...m, height: -1 }, 'height') && refused({ ...m, reflectivity: 1.2 }, 'reflectivity') &&
      refused({ ...m, sky: true, openSides: 5 }, 'open sides') && refused('nowhere', 'nowhere') && refused(undefined, 'measures'));
    {
      const { sky, openSides, ...noSky } = m;
      checkTry('nothing passes silently: sky must be true or false (not "false", 1 or missing), open sides must be given (not missing or null); a row with measures and no key builds with key null',
        () => refused({ ...m, sky: 'false' }, 'sky') && refused({ ...m, sky: 1 }, 'sky') && refused({ ...noSky, openSides }, 'sky') &&
          refused({ ...noSky, sky }, 'open sides') && refused({ ...m, openSides: null }, 'open sides') &&
          R.buildAutomatic({ label: 'a row', measures: m }).key === null);
    }
    // The built preset is a preset of the table's form: frozen, its values singles, and it goes straight into the
    // room path (the module's own path, run on it against an instance of it: the module against itself).
    checkTry('the built preset is frozen, of the table\'s form, its values singles; a path made with it gives its shares (72/183) and direct + its output', () => {
      const p = R.buildAutomatic('tunnel').preset;
      const path = R.createRoomPath({ room: p, roomDraw: drawOf(2) });
      path.spurtStart();
      const sh = path.shares();
      const r = Int32Array.from(NOISE.slice(0, 4410), (s) => R.entry(s, sh.room)), dd = Int32Array.from(NOISE.slice(0, 4410), (s) => R.entry(s, sh.direct));
      const out = path.process(dd, r), inst = R.createInstance(p, drawOf(2));
      return Object.isFrozen(p) && Object.isFrozen(p.p[1][1]) && p.h.length === 6 && p.p.every(([, v]) => v.length === 16 && v.every((x) => x === Math.fround(x))) &&
        same(sh, { room: 72, direct: 183 }) && same(Array.from(out), Array.from(dd, (x, i) => (x + inst.next(r[i])) | 0)) &&
        R.createSlot({ preset: p }).state().preset === p;
    });
    checkTry('SHAPES: the eleven shapes, their variables and the defaults of W3-15 section 4',
      () => same(R.SHAPES.map((s) => [s.name, s.variable, s.base]), [['room', 'adsp_room_min', 102], ['duct', 'adsp_duct_min', 106],
        ['hall', 'adsp_hall_min', 110], ['tunnel', 'adsp_tunnel_min', 114], ['street', 'adsp_street_min', 118],
        ['alley', 'adsp_alley_min', 122], ['courtyard', 'adsp_courtyard_min', 126], ['open space', 'adsp_openspace_min', 130],
        ['open wall', 'adsp_openwall_min', 130], ['open street', 'adsp_openstreet_min', 118], ['open courtyard', 'adsp_opencourtyard_min', 126]]));
  }

  if (section('The automatic room: the console\'s log (part b)')) {
    // The W3-17b second read, section 4: "NEW DSP NODE: size:(a,b) height:(c) ... refl r ... sky s". The first size
    // number is the length, the second the width, each units / 12 rounded to a whole foot; height 400 under an open
    // sky is 4800; a printed N stands for 12N - 6 to 12N + 6 units. A class is open where the printed feet sit on a
    // threshold: width 6, 12, 24, 48; length 12, 24, 48, 96; height 4, 11, 18, 32; a courtyard's length 10, 20, 40,
    // 100; the reflectivity at 0.0400, 0.5000, 0.8000. The mix values tell an open-sided shape's pair: 0.21, 0.8, 95,
    // 0.1 one side open; 0.3, 0.8, 75, 0.3 two; 0.22, 0.6, 95, 0.1 three or four; and a room's copy: 0.3 first is 102,
    // 0.32 is 103. All typed from that section.
    const pd = (line) => R.placeFromDebug(line);
    checkTry('size:(33,25) height:(13) refl 0.9000 sky 0 is length 396, width 300, height 156 (the first number the length): set_c_room\'s room, size class 2, reflectivity class 3, copy 103, nothing open', () => {
      const p = pd({ size: [33, 25], height: 13, refl: 0.9, sky: 0 });
      return same(p.measures, { sky: false, width: 300, length: 396, height: 156, reflectivity: 0.9, openSides: 0 }) &&
        p.shape === 'room' && p.classes.size === 2 && p.classes.reflectivity === 3 && p.copy === 103 && p.open.length === 0 &&
        p.candidates.length === 1 && !p.shaft;
    });
    checkTry('size:(83,25) height:(400) sky 1 with "OUTSIDE STREET Detected": height 4800, a street of size, width and length class 3 from 119 (set_d_street\'s), no open side', () => {
      const p = pd({ size: [83, 25], height: 400, refl: 0.4, sky: 1, shape: 'OUTSIDE STREET Detected' });
      return same(p.measures, { sky: true, width: 300, length: 996, height: 4800, reflectivity: 0.4, openSides: 0 }) &&
        p.shape === 'street' && same(classList(p.classes).slice(0, 4), [3, 3, 3, 4]) && p.copy === 119 && p.open.length === 0;
    });
    const openAt = (name, make, top) => {
      const got = [];
      for (let n = 1; n <= top; n++) if (pd(make(n)).open.includes(name)) got.push(n);
      return got;
    };
    checkTry('the width class is open exactly at printed widths 6, 12, 24, 48 (1 to 60)',
      () => same(openAt('width', (n) => ({ size: [200, n], height: 1, refl: 0.4, sky: 0 }), 60), [6, 12, 24, 48]));
    checkTry('the length class is open exactly at printed lengths 12, 24, 48, 96 (1 to 110)',
      () => same(openAt('length', (n) => ({ size: [n, 25], height: 1, refl: 0.4, sky: 0 }), 110), [12, 24, 48, 96]));
    checkTry('the height class is open exactly at printed heights 4, 11, 18, 32 (1 to 60)',
      () => same(openAt('height', (n) => ({ size: [400, 25], height: n, refl: 0.4, sky: 0 }), 60), [4, 11, 18, 32]));
    checkTry('a courtyard\'s size class is open exactly at printed lengths 10, 20, 40, 100 (1 to 110)',
      () => same(openAt('size', (n) => ({ size: [n, 100], height: 400, refl: 0.4, sky: 1, shape: 'OUTSIDE COURTYARD' }), 110), [10, 20, 40, 100]));
    checkTry('the reflectivity class is open at 0.0400 (0 or 1), 0.5000 (1 or 2) and 0.8000 (2 or 3), not at 0.0399, 0.0401, 0.4999, 0.5001, 0.7999, 0.8001', () => {
      const cls = (r) => [...new Set(pd({ size: [33, 25], height: 13, refl: r, sky: 0 }).candidates.map((c) => c.classes.reflectivity))].sort();
      return same(cls(0.04), [0, 1]) && same(cls(0.5), [1, 2]) && same(cls(0.8), [2, 3]) &&
        [0.0399, 0.0401, 0.4999, 0.5001, 0.7999, 0.8001].every((r) => cls(r).length === 1);
    });
    checkTry('the open-sided line\'s pair by the mix: 0.21, 0.8, 95, 0.1 one side open; 0.3, 0.8, 75, 0.3 two; 0.22, 0.6, 95, 0.1 three or four (built alike); with no mix all four stay open', () => {
      const line = { size: [83, 25], height: 400, refl: 0.4, sky: 1, shape: 'OPEN SIDED OUTDOOR AREA Detected' };
      const shapes = (mix) => pd({ ...line, mix }).candidates.map((c) => [c.shape, c.measures.openSides]);
      const none = pd(line);
      const three = pd({ ...line, mix: [0.22, 0.6, 95, 0.1] }).candidates;
      return same(shapes([0.21, 0.8, 95, 0.1]), [['open courtyard', 1]]) && same(shapes([0.3, 0.8, 75, 0.3]), [['open street', 2]]) &&
        same(three.map((c) => [c.shape, c.measures.openSides]), [['open wall', 3], ['open space', 4]]) &&
        same(R.buildAutomatic(three[0].measures).preset.p, R.buildAutomatic(three[1].measures).preset.p) &&
        none.open.includes('openSides') && same([...new Set(none.candidates.map((c) => c.measures.openSides))].sort(), [1, 2, 3, 4]);
    });
    checkTry('a room\'s copy by the mix: on the width and length thresholds (12 and 24 feet) the copy is open; 0.3, 0.8, 80, 0.5 leaves 102 (size class 0 or 1), 0.32, 0.8, 80, 0.5 leaves 103 (size class 2)', () => {
      const line = { size: [24, 12], height: 13, refl: 0.4, sky: 0 };
      const a = pd(line), b = pd({ ...line, mix: [0.3, 0.8, 80, 0.5] }), c = pd({ ...line, mix: [0.32, 0.8, 80, 0.5] });
      return a.open.includes('copy') && b.candidates.every((x) => x.copy === 102 && x.classes.size <= 1) &&
        c.candidates.every((x) => x.copy === 103 && x.classes.size === 2) && b.candidates.length > 0 && c.candidates.length > 0;
    });
    // A printed N is 12N - 6 to 12N + 6 units; with R2 e2's hall rule (length over 2.5 widths, width 49 to 96):
    // size:(11,5) is length 126 to 138 and width 54 to 66, and 136 > 2.5 x 54 = 135, so a hall or a room; size:(13,6)
    // is 150 to 162 by 66 to 78, and 2.5 x 66 = 165 > 162, so a room only (by hand, from those two sentences).
    checkTry('a printed foot is 12N - 6 to 12N + 6 units: size:(11,5) may be a hall or a room, size:(13,6) only a room',
      () => {
        const shapes = (size) => [...new Set(pd({ size, height: 1, refl: 0.4, sky: 0 }).candidates.map((c) => c.shape))].sort();
        return same(shapes([11, 5]), ['hall', 'room']) && same(shapes([13, 6]), ['room']);
      });
    // size:(8,5) height:(66) indoors: length 90 to 102, width 54 to 66, height 786 to 798, a shaft throughout; by
    // the second read's finding 1 the classes come from the exchanged record: width class 0, length class 3 (786 to
    // 798), height class 1 (90 to 102), size class 1; the shape a hall (786 > 2.5 x 66, width 54 to 66); copy 110.
    checkTry('a shaft in the log (size:(8,5) height:(66) indoors): a hall of classes 1, 0, 3, 1 from 110 (finding 1); printed numbers that are not feet, a sky of 2, an unknown shape line, or a shape the numbers cannot build are refused by name', () => {
      const refusedP = (line, word) => { try { R.placeFromDebug(line); return false; } catch (e) { return e.message.includes(word); } };
      const sh = pd({ size: [8, 5], height: 66, refl: 0.4, sky: 0 });
      return sh.candidates.length === 1 && sh.shaft && sh.shape === 'hall' && same(classList(sh.classes).slice(0, 4), [1, 0, 3, 1]) &&
        sh.copy === 110 &&
        refusedP({ size: [33.5, 25], height: 13, refl: 0.9, sky: 0 }, 'size') && refusedP({ size: [33, 25], height: 13, refl: 0.9, sky: 2 }, 'sky') &&
        refusedP({ size: [33, 25], height: 13, refl: 0.9, sky: 0, shape: 'CAVE Detected' }, 'shape line') &&
        refusedP({ size: [33, 25], height: 13, refl: 0.9, sky: 0, shape: 'DUCT Detected' }, 'no space');
    });
  }

  console.log(`\n${passed} room checks passed${failed.length ? `, ${failed.length} FAILED` : ''} (${((performance.now() - T0) / 1000).toFixed(1)} s)`);
  assert.deepEqual(failed, [], `${failed.length} room checks failed`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
