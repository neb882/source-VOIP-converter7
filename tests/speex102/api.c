/* Entry points for JavaScript, doing what the game's vaudio_speex module does
 * with Speex 1.0.2 and nothing else (docs/reports/W3-09-steam-voice.md,
 * section 5). Speex's ctl calls take a pointer to the value and its bit buffer
 * is a struct, neither of which a WebAssembly caller can pass.
 *
 * One codec is one bit buffer, one narrowband encoder and one narrowband
 * decoder, set up with the module's requests in the module's order. Samples
 * are floats at 16-bit scale (Speex 1.0 works on floats in the 16-bit range).
 * A frame is 160 samples, a packet 20 bytes (sub-mode 3, 160 bits). */
#include "speex.h"
#include "misc.h"

#define FRAME 160
#define PACKET 20

typedef struct {
  SpeexBits bits;
  void *encoder;
  void *decoder;
} Codec;

void sx_destroy(Codec *c) {
  if (!c) return;
  if (c->encoder) speex_encoder_destroy(c->encoder);
  if (c->decoder) speex_decoder_destroy(c->decoder);
  speex_bits_destroy(&c->bits);
  speex_free(c);
}

/* VoiceEncoder_Speex::Init with the engine's quality 3 (Speex quality 4). */
Codec *sx_create(void) {
  Codec *c = (Codec *)speex_alloc(sizeof(Codec));
  int quality = 4, enhancement = 1, rate = 8000;
  if (!c) return 0;
  speex_bits_init(&c->bits);
  c->encoder = speex_encoder_init(&speex_nb_mode);
  c->decoder = speex_decoder_init(&speex_nb_mode);
  if (!c->encoder || !c->decoder) {
    sx_destroy(c);
    return 0;
  }
  speex_encoder_ctl(c->encoder, SPEEX_SET_QUALITY, &quality);
  /* The module sends request 4 to the decoder too. 1.0.2's decoder does not
   * know it: it returns -1 and prints a warning, which this build drops. */
  speex_decoder_ctl(c->decoder, SPEEX_SET_QUALITY, &quality);
  speex_decoder_ctl(c->decoder, SPEEX_SET_ENH, &enhancement);
  speex_decoder_ctl(c->decoder, SPEEX_SET_SAMPLING_RATE, &rate);
  speex_encoder_ctl(c->encoder, SPEEX_SET_SAMPLING_RATE, &rate);
  return c;
}

/* EncodeFrame: 160 floats in, 20 bytes out; returns the bytes written. */
int sx_encode(Codec *c, float *pcm, char *packet) {
  speex_bits_reset(&c->bits);
  speex_encode(c->encoder, pcm, &c->bits);
  return speex_bits_write(&c->bits, packet, PACKET);
}

/* DecodeFrame: 20 bytes in, 160 floats out as the decoder gives them (the
 * module's conversion to 16 bits is done by the caller). Returns 0, or a
 * negative error. */
int sx_decode(Codec *c, char *packet, float *pcm) {
  speex_bits_read_from(&c->bits, packet, PACKET);
  return speex_decode(c->decoder, &c->bits, pcm);
}

/* ResetState: request 26 on the encoder and on the decoder. */
void sx_reset(Codec *c) {
  speex_encoder_ctl(c->encoder, SPEEX_RESET_STATE, 0);
  speex_decoder_ctl(c->decoder, SPEEX_RESET_STATE, 0);
}

/* A ctl that reads one integer, for the tests (frame size, mode, bitrate,
 * complexity, enhancement). The module makes no such call. */
int sx_encoder_get(Codec *c, int request) {
  int value = 0;
  speex_encoder_ctl(c->encoder, request, &value);
  return value;
}
int sx_decoder_get(Codec *c, int request) {
  int value = 0;
  speex_decoder_ctl(c->decoder, request, &value);
  return value;
}
