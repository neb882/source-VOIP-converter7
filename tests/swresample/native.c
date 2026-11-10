/* TF2 Voice Emulator, tests/swresample/native.c: the machine's libswresample,
 * driven as Steam's decoder drives it, with its kernel forced.
 *
 * Built and run by tests/swresample/native.mjs; not part of the app or of CI.
 *
 *   native <kernel>          kernel: fma3, avx, sse or c
 *   native --info            the library's version and the CPU flags it sees
 *
 * Input on stdin, little-endian int32 records:
 *   n >= 0   a packet of n 16-bit samples follows (24000 Hz, mono)
 *   -1       a new stream: the context is freed and made again
 * Output on stdout, for each packet: an int32 count m, then m 16-bit samples
 * (44100 Hz). Per packet, the three calls Steam makes: ask the upper bound,
 * convert, and when fewer came out than the bound, convert again with no
 * input. The kernel is forced with av_force_cpu_flags before the context is
 * made, so swr_init picks that kernel.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <libavutil/channel_layout.h>
#include <libavutil/cpu.h>
#include <libavutil/opt.h>
#include <libswresample/swresample.h>

#define SSE_FLAGS (AV_CPU_FLAG_MMX | AV_CPU_FLAG_MMXEXT | AV_CPU_FLAG_SSE | AV_CPU_FLAG_SSE2 | \
                   AV_CPU_FLAG_SSE3 | AV_CPU_FLAG_SSSE3 | AV_CPU_FLAG_SSE4 | AV_CPU_FLAG_SSE42)
#define AVX_FLAGS (SSE_FLAGS | AV_CPU_FLAG_AVX)
#define FMA3_FLAGS (AVX_FLAGS | AV_CPU_FLAG_AVX2 | AV_CPU_FLAG_FMA3)

static SwrContext *make_context(void) {
  SwrContext *s = NULL;
  AVChannelLayout mono = AV_CHANNEL_LAYOUT_MONO;
  if (swr_alloc_set_opts2(&s, &mono, AV_SAMPLE_FMT_S16, 44100, &mono, AV_SAMPLE_FMT_S16, 24000, 0, NULL) < 0
      || swr_init(s) < 0) {
    fprintf(stderr, "native: swr_init failed\n");
    exit(1);
  }
  return s;
}

static int read_i32(int32_t *v) { return fread(v, 4, 1, stdin) == 1; }

int main(int argc, char **argv) {
  if (argc != 2) { fprintf(stderr, "usage: native <fma3|avx|sse|c|--info>\n"); return 2; }
  if (!strcmp(argv[1], "--info")) {
    unsigned v = swresample_version();
    int f = av_get_cpu_flags();
    printf("libswresample %u.%u.%u\n", v >> 16, (v >> 8) & 255, v & 255);
    printf("cpu sse4.2=%d avx=%d avx2=%d fma3=%d avxslow=%d\n", !!(f & AV_CPU_FLAG_SSE42), !!(f & AV_CPU_FLAG_AVX),
           !!(f & AV_CPU_FLAG_AVX2), !!(f & AV_CPU_FLAG_FMA3), !!(f & AV_CPU_FLAG_AVXSLOW));
    return 0;
  }
  int flags;
  if (!strcmp(argv[1], "fma3")) flags = FMA3_FLAGS;
  else if (!strcmp(argv[1], "avx")) flags = AVX_FLAGS;
  else if (!strcmp(argv[1], "sse")) flags = SSE_FLAGS;
  else if (!strcmp(argv[1], "c")) flags = 0;
  else { fprintf(stderr, "native: unknown kernel %s\n", argv[1]); return 2; }
  av_force_cpu_flags(flags);

  SwrContext *s = make_context();
  int16_t *in = NULL, *out = NULL;
  size_t in_cap = 0, out_cap = 0;
  int32_t n;
  while (read_i32(&n)) {
    if (n == -1) { swr_free(&s); s = make_context(); continue; }
    if (n < 0) { fprintf(stderr, "native: bad record %d\n", n); return 1; }
    if ((size_t)n > in_cap) { in_cap = n; in = realloc(in, in_cap * 2); }
    if (n && fread(in, 2, n, stdin) != (size_t)n) { fprintf(stderr, "native: short packet\n"); return 1; }
    int bound = swr_get_out_samples(s, n);
    if (bound < 0) { fprintf(stderr, "native: swr_get_out_samples failed\n"); return 1; }
    if ((size_t)bound > out_cap) { out_cap = bound; out = realloc(out, out_cap * 2); }
    const uint8_t *ip[1] = { (const uint8_t *)in };
    uint8_t *op[1] = { (uint8_t *)out };
    int got = swr_convert(s, op, bound, ip, n);
    if (got < 0) { fprintf(stderr, "native: swr_convert failed\n"); return 1; }
    if (got < bound) {
      uint8_t *op2[1] = { (uint8_t *)(out + got) };
      int more = swr_convert(s, op2, bound - got, NULL, 0);
      if (more < 0) { fprintf(stderr, "native: flush failed\n"); return 1; }
      got += more;
    }
    int32_t m = got;
    fwrite(&m, 4, 1, stdout);
    fwrite(out, 2, got, stdout);
  }
  swr_free(&s);
  free(in);
  free(out);
  return 0;
}
