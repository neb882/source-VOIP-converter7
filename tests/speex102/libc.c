/* What Speex 1.0.2 needs from the C library beyond tests/libopus11/libc.c, for
 * the WebAssembly build. libspeex/misc.c calls these as it is, unchanged.
 *
 * - The build has no stderr: printing does nothing, so a warning (such as the
 *   one the decoder gives for the module's request 4) is dropped.
 * - exit, which misc.c calls only after a fatal error, traps.
 * - rand is glibc's (the additive generator it uses by default, seeded with
 *   1), so a decode that draws noise gives what a native glibc build gives.
 *   Speex draws it only for a lost frame and for sub-modes 0 and 1, which
 *   this module never makes. */
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct OC_FILE { int unused; };
static struct OC_FILE null_file;
FILE *stderr = &null_file;
int fprintf(FILE *stream, const char *format, ...) { (void)stream; (void)format; return 0; }
int printf(const char *format, ...) { (void)format; return 0; }
int fputc(int c, FILE *stream) { (void)stream; return c & 255; }
void exit(int status) { (void)status; __builtin_trap(); }

char *strncpy(char *dst, const char *src, size_t n) {
  size_t i = 0;
  for (; i < n && src[i]; i++) dst[i] = src[i];
  for (; i < n; i++) dst[i] = 0;
  return dst;
}

/* glibc's random() with its default table (TYPE_3: degree 31, separation 3):
 * r[0] = 1, r[i] = 16807 r[i-1] mod (2^31 - 1) up to r[30], r[31..33] =
 * r[0..2], then r[i] = r[i-31] + r[i-3] modulo 2^32; the first 310 of those
 * are discarded and each call returns the next one shifted right by one. */
static unsigned int ring[31];
static int at = -1;
static unsigned int step(void) {
  unsigned int v = ring[at] + ring[(at + 28) % 31];
  ring[at] = v;
  at = (at + 1) % 31;
  return v;
}
int rand(void) {
  if (at < 0) {
    unsigned int r[34];
    int i;
    r[0] = 1;
    for (i = 1; i < 31; i++) r[i] = (unsigned int)((16807ULL * r[i - 1]) % 2147483647ULL);
    for (i = 31; i < 34; i++) r[i] = r[i - 31];
    for (i = 0; i < 31; i++) ring[i] = r[i + 3];
    at = 0;
    for (i = 0; i < 310; i++) step();
  }
  return (int)(step() >> 1);
}
