/* The native counterpart of the WebAssembly module's 16-bit decoder, for
 * tests/libopus11/native.mjs. Reads 32-bit float mono samples at 24000 Hz on
 * stdin, 480 a frame, and runs them through libopus as
 * vendor/libopus-1.1/index.mjs and opus-codec.mjs do for the Steam profile:
 * opus_encoder_create(24000, 1, VOIP), then bit rate 32000, the complexity
 * given as the first argument, signal voice, VBR on, DTX on, FEC off, in that
 * order; each frame through opus_encode_float; each packet through the 16-bit
 * opus_decode with room for 480 samples and FEC off; after every tenth packet
 * one more opus_decode with no data (a lost frame concealed). Writes, per frame:
 * the packet's length as 16 bits, the packet, the 480 decoded samples, and after
 * every tenth packet the 480 concealed ones (all little-endian). */
#include <stdio.h>
#include <stdlib.h>
#include "opus.h"

int main(int argc, char **argv) {
  int err = 0, complexity = argc > 1 ? atoi(argv[1]) : 9;
  long frame = 0;
  float in[480];
  unsigned char packet[4000];
  opus_int16 out[480];
  OpusEncoder *enc = opus_encoder_create(24000, 1, OPUS_APPLICATION_VOIP, &err);
  OpusDecoder *dec;
  if (!enc || err != OPUS_OK) return 1;
  dec = opus_decoder_create(24000, 1, &err);
  if (!dec || err != OPUS_OK) return 1;
  if (opus_encoder_ctl(enc, OPUS_SET_BITRATE(32000)) != OPUS_OK) return 2;
  if (opus_encoder_ctl(enc, OPUS_SET_COMPLEXITY(complexity)) != OPUS_OK) return 2;
  if (opus_encoder_ctl(enc, OPUS_SET_SIGNAL(OPUS_SIGNAL_VOICE)) != OPUS_OK) return 2;
  if (opus_encoder_ctl(enc, OPUS_SET_VBR(1)) != OPUS_OK) return 2;
  if (opus_encoder_ctl(enc, OPUS_SET_DTX(1)) != OPUS_OK) return 2;
  if (opus_encoder_ctl(enc, OPUS_SET_INBAND_FEC(0)) != OPUS_OK) return 2;
  for (; fread(in, sizeof(float), 480, stdin) == 480; frame++) {
    int len = opus_encode_float(enc, in, 480, packet, sizeof packet), n;
    unsigned char size[2];
    if (len < 0) return 3;
    size[0] = (unsigned char)(len & 0xff); size[1] = (unsigned char)(len >> 8);
    fwrite(size, 1, 2, stdout);
    fwrite(packet, 1, (size_t)len, stdout);
    n = opus_decode(dec, packet, len, out, 480, 0);
    if (n != 480) return 4;
    fwrite(out, sizeof(opus_int16), 480, stdout);
    if (frame % 10 == 9) {
      n = opus_decode(dec, NULL, 0, out, 480, 0);
      if (n != 480) return 5;
      fwrite(out, sizeof(opus_int16), 480, stdout);
    }
  }
  opus_encoder_destroy(enc);
  opus_decoder_destroy(dec);
  return 0;
}
