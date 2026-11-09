/* Entry points for JavaScript: Speex's ctl calls take a pointer to the value
 * and its bit packer is a struct, neither of which a WebAssembly caller can
 * pass. Narrowband (8 kHz), mono, as Source's vaudio_speex. The encoder runs
 * at constant bitrate with no VAD and no DTX at its default complexity; the
 * decoder keeps its default perceptual enhancement. */
#include "speex/speex.h"

/* One bit packer, used only inside a single call. */
static SpeexBits bits;
static int bits_ready = 0;
static SpeexBits *packer(void) {
  if (!bits_ready) { speex_bits_init(&bits); bits_ready = 1; }
  return &bits;
}

void *sx_encoder_create(int quality) {
  void *st = speex_encoder_init(&speex_nb_mode);
  spx_int32_t off = 0, q = quality;
  if (!st) return 0;
  speex_encoder_ctl(st, SPEEX_SET_QUALITY, &q);
  speex_encoder_ctl(st, SPEEX_SET_VBR, &off);
  speex_encoder_ctl(st, SPEEX_SET_VAD, &off);
  speex_encoder_ctl(st, SPEEX_SET_DTX, &off);
  return st;
}
void *sx_decoder_create(void) { return speex_decoder_init(&speex_nb_mode); }

/* A ctl that reads one integer (frame size, lookahead, bitrate, complexity, enhancement). */
int sx_encoder_get(void *st, int request) {
  spx_int32_t value = 0;
  speex_encoder_ctl(st, request, &value);
  return value;
}
int sx_decoder_get(void *st, int request) {
  spx_int32_t value = 0;
  speex_decoder_ctl(st, request, &value);
  return value;
}

/* One frame of float PCM at 16-bit scale into a packet of at most `max`
 * bytes; returns the packet's length. Speex filters the frame in place. */
int sx_encode(void *st, float *pcm, char *packet, int max) {
  SpeexBits *b = packer();
  speex_bits_reset(b);
  speex_encode(st, pcm, b);
  return speex_bits_write(b, packet, max);
}

/* One packet into a frame of float PCM at 16-bit scale. A null packet is a
 * lost frame, which the decoder conceals. Returns 0, or a negative error. */
int sx_decode(void *st, char *packet, int length, float *pcm) {
  SpeexBits *b;
  if (!packet) return speex_decode(st, 0, pcm);
  b = packer();
  speex_bits_read_from(b, packet, length);
  return speex_decode(st, b, pcm);
}
