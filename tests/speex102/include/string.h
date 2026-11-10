/* The libopus 1.1 build's string.h, plus the strncpy libspeex/speex_header.c calls. */
#ifndef SX102_STRING_H
#define SX102_STRING_H
#include_next <string.h>
char *strncpy(char *dst, const char *src, size_t n);
#endif
