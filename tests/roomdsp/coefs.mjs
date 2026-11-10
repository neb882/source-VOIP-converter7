// tests/roomdsp/coefs.mjs: the low-pass section's coefficients by cutoff, recomputed under Node (order W3-17,
// part a, item 3). The filter of R2 c: w = tan(cutoff x pi / 44100) in double, p = (1 - w) / (1 + w),
// a1 = trunc(-4096 p), b0 = b1 = trunc(2048 (1 - p)). room-dsp.js keeps them as a table so that no browser's tan
// decides a sample; this recomputes them with Node's Math.tan, compares them with that table and with the
// order's list, and says how far each value lies from the next whole number (how much a tan that differs in its
// last bits would need to move it).
//
//   node tests/roomdsp/coefs.mjs          prints the table; exits 1 if anything disagrees
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = process.env.TF2_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The order's list (part a, item 3): cutoff, a1, b0.
export const ORDER = [
  [900, -3601, 247], [1000, -3550, 272], [1050, -3524, 285], [1200, -3449, 323], [1350, -3375, 360],
  [1500, -3302, 396], [1520, -3292, 401], [1750, -3183, 456], [1800, -3160, 467], [2000, -3068, 513],
  [2140, -3004, 545], [2500, -2846, 624], [2760, -2735, 680], [2850, -2697, 699], [3000, -2635, 730],
  [3250, -2533, 781], [3380, -2481, 807], [3500, -2433, 831], [3900, -2278, 908], [4000, -2240, 927],
  [4500, -2054, 1020], [4950, -1892, 1101], [5000, -1874, 1110], [5500, -1700, 1197], [6000, -1532, 1281],
];

export const PI_OVER_SR = Math.PI / 44100;

// The section by the formula, with the distance of each value from the whole number its truncation passes.
export function recompute(cutoff) {
  const w = Math.tan(Math.fround(cutoff) * PI_OVER_SR);
  const p = (1 - w) / (1 + w);
  const ra1 = -4096 * p, rb0 = 2048 * (1 - p);
  const margin = (x) => Math.min(Math.abs(x - Math.trunc(x)), Math.abs(x - Math.trunc(x) - Math.sign(x)));
  return { a1: Math.trunc(ra1), b0: Math.trunc(rb0), margin: Math.min(margin(ra1), margin(rb0)) };
}

export function compare() {
  const R = require(join(root, 'room-dsp.js'));
  const table = new Map(R.PINNED_LP.map(([c, a1, b0]) => [c, [a1, b0]]));
  const rows = [];
  let ok = table.size === ORDER.length && PI_OVER_SR === 7.123792865282977e-05;
  let least = Infinity;
  for (const [c, a1, b0] of ORDER) {
    const r = recompute(c);
    const t = table.get(c);
    const agree = r.a1 === a1 && r.b0 === b0 && !!t && t[0] === a1 && t[1] === b0;
    ok = ok && agree;
    least = Math.min(least, r.margin);
    rows.push({ cutoff: c, a1: r.a1, b0: r.b0, margin: r.margin, agree });
  }
  return { ok, least, rows };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { ok, least, rows } = compare();
  for (const r of rows) {
    console.log(`  ${String(r.cutoff).padStart(5)} Hz  a1 ${String(r.a1).padStart(6)}  b0 ${String(r.b0).padStart(5)}  ` +
      `margin ${r.margin.toFixed(4)}  ${r.agree ? 'ok' : 'DIFFERS'}`);
  }
  console.log(`pi / 44100 = ${PI_OVER_SR}; smallest margin ${least.toFixed(4)}; ${ok ? 'all agree' : 'DISAGREEMENT'}`);
  process.exit(ok ? 0 : 1);
}
