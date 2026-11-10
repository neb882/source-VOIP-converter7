// tests/swresample/bank.mjs: libswresample's filter bank for 24000 to 44100 Hz,
// computed as build_filter() in libswresample/resample.c does it (FFmpeg
// n8.1.2, the same in n6.1.1), with av_bessel_i0 of libavutil/mathematics.c.
//
// Defaults: filter size 32, exact rational on (147 phases, since 44100/24000
// is 147/80), Kaiser window with beta 9, cut-off factor 1.0 (the output rate is
// higher), float coefficients (the library works in float for this path).
// All arithmetic is in doubles, in the C source's order; each coefficient is
// divided by the sum of phase 0 and rounded to a 32-bit float.
//
// vendor/swresample/swresample.js stores the result as base64, because the
// page must not depend on the browser's Math.sin. This script prints that
// base64 and the SHA-256 of the 4,704 floats as 18,816 little-endian bytes.
//
//   node tests/swresample/bank.mjs
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const TAPS = 32;
export const PHASES = 147;
export const BANK_SHA256 = '318831365a80e9e689d9f730e975fc5713aeafacb5ead762a9b52a95802f867e';

// av_bessel_i0, for the arguments the window uses (0 to 9: the first branch).
const P1 = [
  -2.2335582639474375249e+15, -5.5050369673018427753e+14, -3.2940087627407749166e+13,
  -8.4925101247114157499e+11, -1.1912746104985237192e+10, -1.0313066708737980747e+08,
  -5.9545626019847898221e+05, -2.4125195876041896775e+03, -7.0935347449210549190e+00,
  -1.5453977791786851041e-02, -2.5172644670688975051e-05, -3.0517226450451067446e-08,
  -2.6843448573468483278e-11, -1.5982226675653184646e-14, -5.2487866627945699800e-18,
];
const Q1 = [
  -2.2335582639474375245e+15, 7.8858692566751002988e+12, -1.2207067397808979846e+10,
  1.0377081058062166144e+07, -4.8527560179962773045e+03, 1.0,
];
function evalPoly(coeff, x) {
  let sum = coeff[coeff.length - 1];
  for (let i = coeff.length - 2; i >= 0; --i) { sum *= x; sum += coeff[i]; }
  return sum;
}
export function besselI0(x) {
  if (x === 0) return 1.0;
  x = Math.abs(x);
  if (x > 15) throw new RangeError('besselI0: only the branch up to 15 is ported');
  const y = x * x;
  return evalPoly(P1, y) / evalPoly(Q1, y);
}

export function computeBank() {
  const factor = 1.0, beta = 9, scale = 1;
  const center = (TAPS - 1) >> 1; // 15
  const bank = new Float32Array(PHASES * TAPS);
  const tab = new Float64Array(TAPS);
  let norm = 0;
  for (let ph = 0; ph < PHASES; ph++) {
    // sin_lut[ph]: the sign is +1 because center is odd.
    let s = Math.sin(Math.PI * ph / PHASES) * (center & 1 ? 1 : -1);
    for (let i = 0; i < TAPS; i++) {
      const x = Math.PI * ((i - center) - ph / PHASES) * factor;
      let y = x === 0 ? 1.0 : s / x;
      const w = 2.0 * x / (factor * TAPS * Math.PI);
      y *= besselI0(beta * Math.sqrt(Math.max(1 - w * w, 0)));
      tab[i] = y;
      s = -s;
      if (!ph) norm += y;
    }
    for (let i = 0; i < TAPS; i++) bank[ph * TAPS + i] = tab[i] * scale / norm;
  }
  return bank;
}

export function bankBytes(bank) {
  const bytes = new Uint8Array(bank.length * 4);
  const dv = new DataView(bytes.buffer);
  for (let i = 0; i < bank.length; i++) dv.setFloat32(i * 4, bank[i], true);
  return bytes;
}

export function bankSha256(bank) {
  return createHash('sha256').update(bankBytes(bank)).digest('hex');
}

export function bankBase64(bank) {
  return Buffer.from(bankBytes(bank)).toString('base64');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bank = computeBank();
  const hash = bankSha256(bank);
  console.log(bankBase64(bank));
  console.log(`sha256 ${hash} (${hash === BANK_SHA256 ? 'the order\'s' : 'NOT the order\'s ' + BANK_SHA256})`);
}
