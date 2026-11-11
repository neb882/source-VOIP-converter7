/* Arithmetic of the game's build of Speex 1.0.2 (SSE2 scalar and packed
 * single precision, sums re-ordered by the compiler), stated in plain C.
 * Everything here is float or double IEEE arithmetic, round to nearest. */
#ifndef VSX_H
#define VSX_H

/* A sum of n float terms as the game's build adds them when it runs a
 * summing loop eight terms at a time: two groups of four running sums
 * (terms 0-3 and 4-7 of each eight), folded as
 * ((s0+s4)+(s2+s6)) + ((s1+s5)+(s3+s7)); the terms left over after the last
 * whole eight are then added one by one. With fewer than eight terms the sum
 * is the plain left-to-right one. */
static float vsx_sum8_head(const float *t, int n, int *done)
{
   float a[4] = {0, 0, 0, 0}, b[4] = {0, 0, 0, 0}, c[4];
   int i, k, m = n & ~7;
   if (n < 8) { *done = 0; return 0; }
   for (i = 0; i < m; i += 8)
      for (k = 0; k < 4; k++) {
         a[k] = a[k] + t[i + k];
         b[k] = b[k] + t[i + 4 + k];
      }
   for (k = 0; k < 4; k++) c[k] = b[k] + a[k];
   *done = m;
   return (c[2] + c[0]) + (c[3] + c[1]);
}
static float vsx_sum8(const float *t, int n)
{
   int i;
   float s = vsx_sum8_head(t, n, &i);
   for (; i < n; i++) s = s + t[i];
   return s;
}

float vsx_cosf(float x);
float vsx_acosf(float x);
float vsx_expf(float x);
float vsx_logf(float x);
double vsx_exp(double x);
double vsx_log(double x);
double vsx_cos(double x);
#endif
