/* The libopus 1.1 build's math.h, plus the arc cosine Speex's float LSP code
 * calls (musl's, compiled into the module by ../build.mjs). */
#ifndef SX_MATH_H
#define SX_MATH_H
#include_next <math.h>
double acos(double x);
#endif
