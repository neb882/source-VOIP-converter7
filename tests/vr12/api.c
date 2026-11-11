/* The game's vaudio_miles wrapper around the VR12 codec, for the WebAssembly
 * module (tests/vr12/build.mjs) and its native twin (tests/vr12/native.mjs).
 * Written from the reading of the wrapper (docs/reports/W3-20a-miles-codec.md
 * and tests/LEGACY_CODECS.md, section vaudio_miles), not from the vendored
 * project's own notes. The codec is vendor/voxware-vr12/vr12.c, unchanged.
 *
 * One game frame is 360 samples in and 12 bytes out: two VR12 frames of 180
 * samples and 6 bytes, end to end. Before the encoder each sample is cut to
 * its top 8 bits: the wrapper keeps the high byte and the codec reads it back
 * sign-extended and shifted left by 8. Nothing is done to decoded samples.
 * A new codec's encoder first codes one block of 360 zero samples whose bytes
 * are thrown away (in the game that block is uninitialised memory; zeros here).
 * A reset codes, twice over, 360 zero samples and decodes the 12 bytes they
 * give, and clears nothing. There is no path for a lost frame.
 *
 * The plug-in level (one 180-sample frame to 6 bytes and back, full 16-bit
 * input, no wrapper) is vr12.h's own vr12_encoder_create, vr12_encode_frame6,
 * vr12_create and vr12_decode_frame, exported as they are. */
#include <stdint.h>
#include <stdlib.h>
#include "vr12.h"

#define FRAME 360         /* samples in a game frame */
#define CODEC_FRAME 180   /* samples in a VR12 frame */
#define PACKET 12         /* bytes of a game frame */
#define CODEC_PACKET 6    /* bytes of a VR12 frame */

typedef struct {
  vr12_encoder_t *encoder;
  vr12_decoder_t *decoder;
} Miles;

/* EncodeFrame: 360 samples to 12 bytes through the 8-bit cut. */
int vm_encode(Miles *m, const int16_t *pcm, uint8_t *packet) {
  int16_t cut[FRAME];
  int i;
  for (i = 0; i < FRAME; i++) {
    int8_t high = (int8_t)(uint8_t)((uint16_t)pcm[i] >> 8);   /* the byte the wrapper keeps */
    cut[i] = (int16_t)(high * 256);                             /* what the codec reads back */
  }
  vr12_encode_frame6(m->encoder, cut, packet);
  vr12_encode_frame6(m->encoder, cut + CODEC_FRAME, packet + CODEC_PACKET);
  return PACKET;
}

/* DecodeFrame: 12 bytes to 360 samples, written as the codec gives them.
 * Returns 360, or -1 if the codec refuses a frame. */
int vm_decode(Miles *m, const uint8_t *packet, int16_t *pcm) {
  if (vr12_decode_frame(m->decoder, packet, pcm) < 0) return -1;
  if (vr12_decode_frame(m->decoder, packet + CODEC_PACKET, pcm + CODEC_FRAME) < 0) return -1;
  return FRAME;
}

void vm_destroy(Miles *m) {
  if (!m) return;
  if (m->encoder) vr12_encoder_destroy(m->encoder);
  if (m->decoder) vr12_destroy(m->decoder);
  free(m);
}

/* Init: a new encoder and decoder; the encoder codes one block of zeros to
 * learn the packet size, and its 12 bytes are thrown away. */
Miles *vm_create(void) {
  static const int16_t zeros[FRAME];
  uint8_t packet[PACKET];
  Miles *m = (Miles *)calloc(1, sizeof(Miles));
  if (!m) return 0;
  m->encoder = vr12_encoder_create();
  m->decoder = vr12_create();
  if (!m->encoder || !m->decoder) {
    vm_destroy(m);
    return 0;
  }
  vm_encode(m, zeros, packet);
  return m;
}

/* ResetState: twice over, encode 360 zero samples and decode what they give.
 * No state is cleared. Returns 0, or -1 if the decoder refused a frame. */
int vm_reset(Miles *m) {
  static const int16_t zeros[FRAME];
  uint8_t packet[PACKET];
  int16_t pcm[FRAME];
  int i;
  for (i = 0; i < 2; i++) {
    vm_encode(m, zeros, packet);
    if (vm_decode(m, packet, pcm) < 0) return -1;
  }
  return 0;
}
