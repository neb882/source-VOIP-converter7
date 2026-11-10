/* The libopus 1.1 build's stdio.h, plus fputc: libspeex/misc.c prints its
 * warnings and in-band characters, which this build discards (../libc.c). */
#ifndef SX102_STDIO_H
#define SX102_STDIO_H
#include_next <stdio.h>
int fputc(int c, FILE *stream);
#endif
