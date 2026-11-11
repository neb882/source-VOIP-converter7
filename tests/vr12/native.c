/* The native twin of the WebAssembly module, for tests/vr12/native.mjs: the
 * same vr12.c and api.c, run as tests/vr12/native.mjs runs the module.
 *
 *   native game <reset-before> <packets>   16-bit input on stdin
 *   native plugin <packets>                16-bit input on stdin (may be empty)
 *
 * game: one wrapper codec (vm_create). For each 12-byte frame f of the packet
 * file: if f is <reset-before>, vm_reset; then, while input lasts, encode the
 * next 360 input samples; and decode frame f of the file. plugin: a new VR12
 * encoder codes the input 180 samples at a time, and a new VR12 decoder decodes
 * the file 6 bytes at a time. Writes the packets made, then the samples decoded
 * (16-bit little-endian). */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vr12.h"

typedef struct Miles Miles;
Miles *vm_create(void);
void vm_destroy(Miles *m);
int vm_encode(Miles *m, const int16_t *pcm, uint8_t *packet);
int vm_decode(Miles *m, const uint8_t *packet, int16_t *pcm);
int vm_reset(Miles *m);

static uint8_t *slurp(FILE *f, long *size) {
  long cap = 1 << 16, n = 0;
  uint8_t *buf = malloc(cap);
  size_t got;
  while ((got = fread(buf + n, 1, cap - n, f)) > 0) {
    n += got;
    if (n == cap) buf = realloc(buf, cap *= 2);
  }
  *size = n;
  return buf;
}

int main(int argc, char **argv) {
  int game = argc == 4 && !strcmp(argv[1], "game"), plugin = argc == 3 && !strcmp(argv[1], "plugin");
  long in_size, v12_size, f;
  FILE *pf;
  uint8_t *in, *v12;
  if (!game && !plugin) return 1;
  pf = fopen(argv[argc - 1], "rb");
  if (!pf) return 2;
  v12 = slurp(pf, &v12_size);
  fclose(pf);
  in = slurp(stdin, &in_size);
  if (game) {
    long frames = v12_size / 12, reset_before = atol(argv[2]), inframes = in_size / 720;
    uint8_t *packets = malloc(frames * 12 + 12);
    int16_t *pcm = malloc(frames * 720 + 2);
    Miles *m = vm_create();
    if (!m) return 3;
    for (f = 0; f < frames; f++) {
      if (f == reset_before && vm_reset(m) < 0) return 4;
      if (f < inframes) vm_encode(m, (const int16_t *)(in + f * 720), packets + f * 12);
      if (vm_decode(m, v12 + f * 12, pcm + f * 360) != 360) return 5;
    }
    fwrite(packets, 1, (inframes < frames ? inframes : frames) * 12, stdout);
    fwrite(pcm, 2, frames * 360, stdout);
    vm_destroy(m);
  } else {
    long frames = v12_size / 6, inframes = in_size / 360;
    uint8_t *packets = malloc(inframes * 6 + 6);
    int16_t *pcm = malloc(frames * 360 + 2);
    vr12_encoder_t *e = vr12_encoder_create();
    vr12_decoder_t *d = vr12_create();
    if (!e || !d) return 3;
    for (f = 0; f < inframes; f++) vr12_encode_frame6(e, (const int16_t *)(in + f * 360), packets + f * 6);
    for (f = 0; f < frames; f++) if (vr12_decode_frame(d, v12 + f * 6, pcm + f * 180) != 180) return 5;
    fwrite(packets, 1, inframes * 6, stdout);
    fwrite(pcm, 2, frames * 180, stdout);
    vr12_encoder_destroy(e);
    vr12_destroy(d);
  }
  return 0;
}
