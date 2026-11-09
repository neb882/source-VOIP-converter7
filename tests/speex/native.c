/* The native counterpart of the WebAssembly module, for tests/speex/native.mjs.
 * Reads 16-bit mono PCM at 8 kHz on stdin and runs it through api.c as
 * vendor/speex/index.mjs does: one 160-sample frame per packet at the quality
 * given, the decoder concealing every `lose`-th frame (0: none). Writes, per
 * frame, the packet's length as one byte, the packet, and the 160 decoded
 * floats (16-bit scale, little-endian). */
#include <stdio.h>
#include <stdlib.h>

void *sx_encoder_create(int quality);
void *sx_decoder_create(void);
int sx_encode(void *st, float *pcm, char *packet, int max);
int sx_decode(void *st, char *packet, int length, float *pcm);

int main(int argc, char **argv) {
  int quality = argc > 1 ? atoi(argv[1]) : 4, lose = argc > 2 ? atoi(argv[2]) : 0;
  void *enc = sx_encoder_create(quality), *dec = sx_decoder_create();
  short in[160];
  float pcm[160];
  char packet[256];
  unsigned char length;
  long f;
  int i;
  for (f = 0; fread(in, sizeof(short), 160, stdin) == 160; f++) {
    for (i = 0; i < 160; i++) pcm[i] = in[i];
    length = (unsigned char)sx_encode(enc, pcm, packet, 256);
    fwrite(&length, 1, 1, stdout);
    fwrite(packet, 1, length, stdout);
    if (lose && f % lose == lose - 1) sx_decode(dec, 0, 0, pcm);
    else sx_decode(dec, packet, length, pcm);
    fwrite(pcm, sizeof(float), 160, stdout);
  }
  return 0;
}
