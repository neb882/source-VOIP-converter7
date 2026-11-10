/* The libopus 1.1 build's stdlib.h, plus what libspeex/misc.c calls: exit
 * (only after a fatal error) and rand (only for lost frames and sub-modes 0
 * and 1, which this module never makes). See ../libc.c. */
#ifndef SX102_STDLIB_H
#define SX102_STDLIB_H
#include_next <stdlib.h>
#define RAND_MAX 2147483647
void exit(int status) __attribute__((noreturn));
int rand(void);
#endif
