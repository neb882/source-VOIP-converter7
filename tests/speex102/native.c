/* The native counterpart of the WebAssembly module, for tests/speex102/native.mjs.
 * Reads 16-bit mono samples on stdin and runs them through api.c as
 * vendor/speex-1.0.2/index.mjs does: each 160 samples become floats with
 * their integer values, are encoded to 20 bytes, and the 20 bytes are decoded
 * by the same codec's decoder. Writes, per frame: the 20 bytes, the 160
 * decoded floats (little-endian) and the 160 samples the game's module makes
 * of them, in its own way: a C conversion to int (truncation toward zero),
 * stored as 16 bits with no clamp. */
#include <stdio.h>

typedef struct Codec Codec;
Codec *sx_create(void);
void sx_destroy(Codec *c);
int sx_encode(Codec *c, float *pcm, char *packet);
int sx_decode(Codec *c, char *packet, float *pcm);

int main(void) {
  Codec *c = sx_create();
  short in[160], out[160];
  float pcm[160];
  char packet[20];
  int i;
  if (!c) return 1;
  while (fread(in, sizeof(short), 160, stdin) == 160) {
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
