/* The seven math functions that the game's build of Speex 1.0.2 calls where the
 * C source says cos, acos, exp and log (vsx.h, and the changes in patch.mjs).
 *
 * vsx_cosf and vsx_acosf compute the float cosine and arc cosine of the game
 * module's C runtime, step for step as SPEC-cosf-acosf.md (in this folder)
 * states them; the steps below are numbered as there. Neither is correctly rounded, and the codec's packets depend on their
 * last bits (clips clip-cosf and clip-acosf). Their constants and tables are
 * in vsx_tables.h, made by gen-tables.mjs from the mathematical definitions.
 * Every operation is one IEEE operation in the type written, in the order
 * written: this file must be compiled without contraction and without
 * fast-math, with float arithmetic in float (FLT_EVAL_METHOD 0: SSE2 or
 * WebAssembly).
 *
 * The other five are the C library's double functions (musl's in the
 * WebAssembly build, the system's natively): the codec's use of each was
 * measured to give the module's values with them (see each). */
#include <math.h>
#include "vsx.h"
#include "vsx_tables.h"

static unsigned int bits_of(float x)
{
   union { float f; unsigned int u; } v;
   v.f = x;
   return v.u;
}
static float float_of(unsigned int u)
{
   union { float f; unsigned int u; } v;
   v.u = u;
   return v.f;
}
/* x with its k lowest bits cleared (toward zero; the sign kept). */
static float clear_low(float x, int k)
{
   return float_of(bits_of(x) & ~((1u << k) - 1u));
}
/* The group of a float y in [1/16, 1): 64 to a binade, 256 in all. */
static int group_of(float y)
{
   return (int)((bits_of(y) - 0x3d800000u) >> 17);
}
/* The midpoint of group J. */
static float group_mid(int J)
{
   return float_of(0x3d800000u + ((unsigned int)J << 17) + (1u << 16));
}

float vsx_cosf(float x)
{
   float ax = fabsf(x), k, nf;
   double xd, nd, p, r, q, rho, r2, r4, cp, sp, y;
   int n, j;
   if (!(ax < 8192.0f)) {
      /* |x| >= 8192, infinities, NaN: not specified (Speex passes (0, pi)). */
      if (ax != ax || ax == __builtin_inff()) return x - x;
      return (float)cos((double)x);
   }
   if (ax < 0x1p-126f) return 1.0f;
   /* 1, 2: n = x times K in float, rounded to the nearest integer, ties to even
    * (|x K| < 2^22, so adding and taking away 1.5 x 2^23 rounds it in float). */
   k = x * VSX_K;
   nf = (k + 0x1.8p23f) - 0x1.8p23f;
   n = (int)nf;
   /* 3 to 10 in double. */
   xd = (double)x;
   nd = (double)n;
   p = nd * VSX_P1;
   r = xd - p;
   q = nd * VSX_P2;
   rho = q + r;
   r2 = r * r;
   r4 = r2 * r2;
   cp = (1.0 - r2 * 0.5) + VSX_C4 * r4;
   sp = (1.0 - VSX_S2 * r2) + VSX_S4 * r4;
   j = (n + 16) & 63;
   y = vsx_sin_tab[j] * cp + (rho * vsx_cos_tab[j]) * sp;
   return (float)y;
}

float vsx_acosf(float x)
{
   float ax = fabsf(x);
   if (ax < 0x1p-16f) {
      /* Range 1. */
      float u = x - VSX_HPI, w = VSX_HPI + u, e = w - x;
      return (VSX_LPI + e) - u;
   }
   if (ax < 0x1p-4f) {
      /* Range 2. */
      float x2 = x * x;
      float p3 = -((VSX_A1 * x) * x2);
      float p5 = -((x2 * x2) * (VSX_A2 * x));
      float u = x - VSX_HPI, w = VSX_HPI + u, e = x - w;
      return ((p5 + (p3 + VSX_LPI)) - e) - u;
   }
   if (ax < VSX_B) {
      /* Range 3: the table entered with |x|; c, hi and lo carry x's sign. */
      int J = group_of(ax);
      float c = group_mid(J), hi = vsx_acos_hi[J], lo = vsx_acos_lo[J], A = vsx_acos_a[J];
      float s, xa, cs, q, d, p, Lj, Hj, t, e;
      if (x < 0) { c = -c; hi = -hi; lo = -lo; }
      s = __builtin_sqrtf(1.0f - x * x);
      xa = x * A;
      cs = c * s;
      q = ((x - c) * (x + c)) / (xa + cs);
      d = cs - xa;
      p = (VSX_A1 * d) * (d * d);
      Lj = VSX_LPI - lo;
      Hj = VSX_HPI - hi;
      t = Hj - q;
      e = q - (Hj - t);
      return ((p + Lj) - e) + t;
   }
   if (ax < 0x1.fcp-1f) {
      /* Range 4: the table entered with s = sqrt(1 - x^2); only c has x's sign. */
      float xh = clear_low(x, 12), xl = x - xh;
      float w = 1.0f - xh * xh;
      float v = (x + xh) * xl;
      float s = __builtin_sqrtf(w - v);
      int J = group_of(s);
      float c = group_mid(J), A = vsx_acos_a[J], r0, r1, sA, d, num, q, p, y;
      if (x < 0) c = -c;
      sA = s * A;
      d = ((xh * c) - sA) + (xl * c);
      num = (w - c * c) - v;
      q = num / ((sA + sA) + d);
      p = -((VSX_A1 * d) * (d * d));
      if (x > 0) {
         r0 = vsx_acos_lo[J];
         r1 = vsx_acos_hi[J];
      } else {
         r0 = (-VSX_PL) + vsx_acos_lo[J];
         r1 = (-VSX_PH) + vsx_acos_hi[J];
      }
      y = ((p + r0) + q) + r1;
      return x > 0 ? y : -y;
   }
   if (ax < 1.0f) {
      /* Range 5: |x| throughout. */
      float t = 0.5f - ax * 0.5f;
      float r = __builtin_sqrtf(t);
      float P = -((VSX_A1 + VSX_A2 * t) + VSX_A3 * (t * t));
      float Pt = P * t;
      float rh = clear_low(r, 12), rl = r - rh;
      float cr = ((t - rh * rh) - (rl * ((r + r) - rl))) / r;
      float r2 = r + r;
      if (x > 0) return -(((Pt * r2) - cr) - r2);
      return VSX_PH + ((((Pt * r2) + VSX_PL) - cr) - r2);
   }
   if (x == 1.0f) return 0.0f;
   if (x == -1.0f) return VSX_PH;
   /* |x| > 1, infinities, NaN: a NaN (Speex passes (-1, 1)). */
   return (x - x) / (x - x);
}

/* expf: Speex calls it only on the 10 entries of the two gain tables
 * (nb_celp.c, ener-expf), and on all 10 the module's result is the nearest
 * float, which the double exp rounded to float gives. */
float vsx_expf(float x) { return (float)exp((double)x); }
/* logf: its result only picks the nearest entry of a gain table (ener-logf);
 * on every float within 30,000 floats of each of the 8 decision points the
 * module's logf and the double log rounded to float pick the same entry. */
float vsx_logf(float x) { return (float)log((double)x); }
/* exp, log and cos in double: the double exp and cos values the codec uses
 * (538 fixed ones) lie at least 383,104 double units from a float rounding
 * boundary, so a double function a few units off still gives the same floats;
 * floor(3.5*log(x)) has a margin of 2.26e-9 against a last place of 3.6e-15. */
double vsx_exp(double x) { return exp(x); }
double vsx_log(double x) { return log(x); }
double vsx_cos(double x) { return cos(x); }
