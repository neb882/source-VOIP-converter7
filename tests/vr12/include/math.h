/* The libopus 1.1 build's math.h, plus the arc cosine VR12 calls (musl's,
 * compiled into the module by ../build.mjs, as are its cos, sin, pow and
 * log10). */
#ifndef VR12_MATH_H
#define VR12_MATH_H
#include_next <math.h>
double acos(double x);
#endif
