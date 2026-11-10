/* The native counterpart of the WebAssembly module, for tests/speex102/native.mjs.
 * Reads 16-bit mono samples on stdin and runs them through api.c as
 * vendor/speex-1.0.2/index.mjs does: each 160 samples become floats with
 * their integer values, are encoded to 20 bytes, and the 20 bytes are decoded
 * by the same codec's decoder. Writes, per frame: the 20 bytes, the 160
 * decoded floats (little-endian) and the 160 samples the game's module makes
 * of them, in its own way: a C conversion to int (truncation toward zero),
 * stored as 16 bits with no clamp. With an argument N, the codec is reset
 * (sx_reset: request 26 on the encoder and the decoder) before frame N. */
#include <stdio.h>
#include <stdlib.h>

typedef struct Codec Codec;
Codec *sx_create(void);
void sx_destroy(Codec *c);
void sx_reset(Codec *c);
int sx_encode(Codec *c, float *pcm, char *packet);
int sx_decode(Codec *c, char *packet, float *pcm);

int main(int argc, char **argv) {
  Codec *c = sx_create();
  long frame = 0, reset_at = argc > 1 ? atol(argv[1]) : -1;
  short in[160], out[160];
  float pcm[160];
  char packet[20];
  int i;
  if (!c) return 1;
  for (; fread(in, sizeof(short), 160, stdin) == 160; frame++) {
    if (frame == reset_at) sx_reset(c);
    for (i = 0; i < 160; i++) pcm[i] = in[i];
    if (sx_encode(c, pcm, packet) != 20) return 2;
    if (sx_decode(c, packet, pcm) < 0) return 3;
    for (i = 0; i < 160; i++) out[i] = (short)(unsigned short)((unsigned int)(int)pcm[i] & 0xffff);
    fwrite(packet, 1, 20, stdout);
    fwrite(pcm, sizeof(float), 160, stdout);
    fwrite(out, sizeof(short), 160, stdout);
  }
  sx_destroy(c);
  return 0;
}
