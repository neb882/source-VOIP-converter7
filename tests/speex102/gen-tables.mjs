// The tables and constants of vsx_cosf and vsx_acosf (tests/speex102/vsx_math.c),
// computed from their mathematical definitions in tests/speex102/SPEC-cosf-acosf.md
// (sections 1.2, 2.2 and 2.3), with nothing but integer arithmetic.
//
//   node tests/speex102/gen-tables.mjs          writes tests/speex102/vsx_tables.h
//   node tests/speex102/gen-tables.mjs --check  stops unless the header is what it makes
//
// Every value is a real number (pi, a sine, an arc sine, a square root) worked
// out in fixed point with 320 fractional bits in JavaScript's BigInt, then
// rounded to the nearest float or double (or to the stated number of
// significant bits). pi is Machin's formula; sin and cos are their Taylor
// series; asin(c) is Newton's method on sin(y) = c; the square root is an
// integer square root. The rounding refuses any value that lies within the
// working error of a halfway point, so a wrong last bit cannot pass silently.
// Each table's SHA-256 and each constant's hexadecimal form are checked against
// the values the specification states.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const P = 320n;                 // fractional bits of the fixed point
const ONE = 1n << P;
const SLACK = 1n << 40n;        // working error allowed, in units of 2^-320
const bitLength = (a) => a.toString(2).length;

function atanInv(n) {           // atan(1/n), n an integer > 1
  const N = BigInt(n), n2 = N * N;
  let term = ONE / N, sum = 0n;
  for (let k = 0n; term !== 0n; k++) {
    sum += (k % 2n ? -term : term) / (2n * k + 1n);
    term /= n2;
  }
  return sum;
}
const PI = 16n * atanInv(5) - 4n * atanInv(239);
const mul = (a, b) => (a * b) >> P;
const div = (a, b) => (a << P) / b;

function sinCos(x) {            // Taylor series of sin and cos at x (fixed point)
  let s = 0n, c = 0n, term = ONE;
  for (let k = 0n; term !== 0n; k++) {
    // term = x^k / k!
    const sign = (k / 2n) % 2n ? -1n : 1n;
    if (k % 2n) s += sign * term; else c += sign * term;
    term = mul(term, x) / (k + 1n);
  }
  return [s, c];
}
function asin(c) {              // Newton's method on sin(y) = c, from the double asin
  let y = BigInt(Math.round(Math.asin(Number(c) / Number(ONE)) * 2 ** 60)) << (P - 60n);
  for (let i = 0; i < 6; i++) {
    const [s, co] = sinCos(y);
    y -= div(s - c, co);
  }
  return y;
}
function isqrt(n) {             // floor(sqrt(n)) for a BigInt n >= 0
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(bitLength(n) / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}
const sqrtFixed = (v) => isqrt(v << P);
// A dyadic number (a float or a double) as fixed point; exact.
function fixed(value) {
  if (value === 0) return 0n;
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, Math.abs(value));
  const bits = dv.getBigUint64(0), exp = Number(bits >> 52n) - 1075;
  const mant = (bits & ((1n << 52n) - 1n)) | (1n << 52n);
  const shift = BigInt(exp) + P;
  const v = shift >= 0n ? mant << shift : mant >> -shift;
  if (shift < 0n && (v << -shift) !== mant) throw new Error(`${value} is not exact in the fixed point`);
  return value < 0 ? -v : v;
}
// The real number v (fixed point) rounded to the nearest number with `bits`
// significant bits, ties to even; refused if v is within SLACK of a tie.
function round(v, bits) {
  if (v === 0n) return 0;
  const negative = v < 0n, a = negative ? -v : v;
  const shift = BigInt(bitLength(a) - bits);
  if (shift <= 0n) return (negative ? -1 : 1) * Number(a) * 2 ** -Number(P);
  let m = a >> shift;
  const rem = a - (m << shift), half = 1n << (shift - 1n);
  const gap = rem > half ? rem - half : half - rem;
  if (gap <= SLACK) throw new Error(`A value lies at a rounding tie (${bits} bits)`);
  if (rem > half) m += 1n;
  return (negative ? -1 : 1) * Number(m) * 2 ** Number(shift - P);
}
const RN64 = (v) => round(v, 53);
const RN32 = (v) => { const r = round(v, 24); if (Math.fround(r) !== r) throw new Error('not a float'); return r; };

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const floatBits = (x) => { f32[0] = x; return u32[0]; };
const fromBits = (b) => { u32[0] = b >>> 0; return f32[0]; };
const clearLow = (x, k) => fromBits(floatBits(x) & ~((1 << k) - 1));

// C99 hexadecimal constant of a double (exact); a float's is the same value.
export function hex(value) {
  if (value === 0) return Object.is(value, -0) ? '-0x0p+0' : '0x0p+0';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, value);
  const bits = dv.getBigUint64(0), sign = bits >> 63n ? '-' : '';
  const exp = Number((bits >> 52n) & 0x7ffn), frac = bits & ((1n << 52n) - 1n);
  if (exp === 0) throw new Error('subnormal constant');
  const digits = frac.toString(16).padStart(13, '0').replace(/0+$/, '');
  return `${sign}0x1${digits ? `.${digits}` : ''}p${exp - 1023 >= 0 ? '+' : ''}${exp - 1023}`;
}

export function generate() {
  // cosf (section 1.2 of the specification).
  const K = RN32(div(32n * ONE, PI));
  const piOver32 = PI / 32n;
  const P1 = round(piOver32, 39);
  const P2 = RN64(fixed(P1) - piOver32);
  const c4 = RN64(ONE / 24n), s2 = RN64(ONE / 6n), s4 = RN64(ONE / 120n);
  const SIN = [], COS = [];
  for (let j = 0; j < 64; j++) {
    const exactZero = (j % 32 === 0);       // sin(0), sin(pi)
    const exactZeroCos = (j % 32 === 16);   // cos(pi/2), cos(3pi/2)
    const [s, c] = sinCos(BigInt(j) * PI / 32n);
    SIN.push(exactZero ? 0 : RN64(s));
    COS.push(exactZeroCos ? 0 : RN64(c));
  }
  SIN[16] = 1; SIN[48] = -1; COS[0] = 1; COS[32] = -1;   // the true values are 1 and -1
  // acosf (section 2.2).
  const B = RN32(sqrtFixed(3n * ONE) / 2n);
  const half = PI / 2n;
  const H = round(half, 22), L = RN32(half - fixed(H));
  const PH = RN32(PI), PL = RN32(PI - fixed(PH));
  const a1 = RN32(ONE / 6n), a2 = RN32(3n * ONE / 40n), a3 = RN32(5n * ONE / 112n);
  // The 256 groups of [1/16, 1) (section 2.3).
  const A = [], HI = [], LO = [], base = floatBits(1 / 16);
  for (let J = 0; J < 256; J++) {
    const c = fromBits(base + J * 2 ** 17 + 2 ** 16), cf = fixed(c);
    A.push(RN32(sqrtFixed(ONE - mul(cf, cf))));
    const y = asin(cf), hi = clearLow(RN32(y), 5);
    HI.push(hi);
    LO.push(RN32(y - fixed(hi)));
  }

  // The specification's check values.
  const sha = (values, Type) => crypto.createHash('sha256').update(new Uint8Array(Type.from(values).buffer)).digest('hex');
  const want = {
    K: '0x1.45f306p+3', P1: '0x1.921fb54444p-4', P2: '0x1.2e7b9676733afp-44', c4: '0x1.5555555555555p-5',
    s2: '0x1.5555555555555p-3', s4: '0x1.1111111111111p-7', B: '0x1.bb67aep-1', H: '0x1.921fb8p+0',
    L: '-0x1.5dde98p-23', PH: '0x1.921fb6p+1', PL: '-0x1.777a5cp-24', a1: '0x1.555556p-3', a2: '0x1.333334p-4',
    a3: '0x1.6db6dcp-5'
  };
  const got = { K, P1, P2, c4, s2, s4, B, H, L, PH, PL, a1, a2, a3 };
  for (const [name, value] of Object.entries(want)) {
    if (hex(got[name]) !== value) throw new Error(`${name} is ${hex(got[name])}, the specification says ${value}`);
  }
  const hashes = {
    SIN: [sha(SIN, Float64Array), 'f902f0033b701e4565a86c54f351fcd7671272c5fa521b161c769b60b1af3b29'],
    COS: [sha(COS, Float64Array), 'd213f2d6db7ba5abd75b3a7ff997d32b3b8d1095fcb4377a6b5e6c392b3795f1'],
    A: [sha(A, Float32Array), '58f7f662f103983f3bd11744e59e134dfacc7f7680efabd46ae06ee5db3be874'],
    HI: [sha(HI, Float32Array), 'b2944aa92880c42670939a06d768494665f1abbaa6bdc54d241830e274e40167'],
    LO: [sha(LO, Float32Array), 'b00cd7465933165564672754236e9e7f702e5fe17ad85591bb36a2a93a211426']
  };
  for (const [name, [have, spec]] of Object.entries(hashes)) {
    if (have !== spec) throw new Error(`The ${name} table hashes to ${have}, the specification says ${spec}`);
  }
  if (hex(SIN[1]) !== '0x1.917a6bc29b42cp-4' || hex(COS[1]) !== '0x1.fd88da3d12526p-1') throw new Error('SIN[1] or COS[1]');
  if (A[100] !== Math.fround(0.9805460572242737) || HI[100] !== Math.fround(0.1975717544555664)
    || LO[100] !== Math.fround(1.6050380224896799e-07)) throw new Error('group 100');

  const list = (values, f) => values.map(v => hex(v) + f).reduce((rows, v, i) => {
    if (i % 4 === 0) rows.push([]);
    rows[rows.length - 1].push(v);
    return rows;
  }, []).map(r => `  ${r.join(', ')}`).join(',\n');
  const constant = (type, name, value, note) => `static const ${type} ${name} = ${hex(value)}${type === 'float' ? 'f' : ''};   /* ${note} */`;
  return `/* Generated by tests/speex102/gen-tables.mjs: do not edit. The constants and
 * tables of vsx_cosf and vsx_acosf (vsx_math.c), each the stated real number
 * rounded as stated, ties to even. */
#ifndef VSX_TABLES_H
#define VSX_TABLES_H

/* vsx_cosf */
${constant('float', 'VSX_K', K, 'RN32(32/pi)')}
${constant('double', 'VSX_P1', P1, 'pi/32 to 39 significant bits')}
${constant('double', 'VSX_P2', P2, 'RN64(P1 - pi/32)')}
${constant('double', 'VSX_C4', c4, 'RN64(1/24)')}
${constant('double', 'VSX_S2', s2, 'RN64(1/6)')}
${constant('double', 'VSX_S4', s4, 'RN64(1/120)')}
/* RN64(sin(j pi/32)) and RN64(cos(j pi/32)), j = 0..63; the zeros exact. */
static const double vsx_sin_tab[64] = {
${list(SIN, '')}
};
static const double vsx_cos_tab[64] = {
${list(COS, '')}
};

/* vsx_acosf */
${constant('float', 'VSX_B', B, 'RN32(sqrt(3)/2)')}
${constant('float', 'VSX_HPI', H, 'pi/2 to 22 significant bits')}
${constant('float', 'VSX_LPI', L, 'RN32(pi/2 - H)')}
${constant('float', 'VSX_PH', PH, 'RN32(pi)')}
${constant('float', 'VSX_PL', PL, 'RN32(pi - PH)')}
${constant('float', 'VSX_A1', a1, 'RN32(1/6)')}
${constant('float', 'VSX_A2', a2, 'RN32(3/40)')}
${constant('float', 'VSX_A3', a3, 'RN32(5/112)')}
/* For each of the 256 groups J of [1/16, 1), with c_J its midpoint:
 * RN32(sqrt(1 - c_J^2)); RN32(asin(c_J)) with its 5 lowest bits cleared (HI);
 * RN32(asin(c_J) - HI). */
static const float vsx_acos_a[256] = {
${list(A, 'f')}
};
static const float vsx_acos_hi[256] = {
${list(HI, 'f')}
};
static const float vsx_acos_lo[256] = {
${list(LO, 'f')}
};

#endif
`;
}

export const HEADER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vsx_tables.h');

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const text = generate();
  if (process.argv.includes('--check')) {
    const same = fs.readFileSync(HEADER, 'utf8') === text;
    console.log(same ? 'vsx_tables.h is what the generator makes.' : 'vsx_tables.h differs from what the generator makes.');
    process.exitCode = same ? 0 : 1;
  } else {
    fs.writeFileSync(HEADER, text);
    console.log(`Wrote ${path.basename(HEADER)}: the constants and tables match the specification's check values.`);
  }
}
