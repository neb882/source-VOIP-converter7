/* The libopus 1.1 build's math.h, plus the arc cosine Speex 1.0.2's LSP code
 * calls (musl's, compiled into the module by ../build.mjs). */
#ifndef SX102_MATH_H
#define SX102_MATH_H
#include_next <math.h>
double acos(double x);
#endif
