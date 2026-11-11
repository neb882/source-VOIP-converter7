/*
 * vr12.h -- Voxware MetaVoice VR12 speech codec (Half-Life "voice_miles"), our own
 * reconstruction of Mssv12.asi. Both halves are verified against the real plugin:
 * the decoder to 1 LSB, the encoder bit-exact. See VENDORED.md.
 *
 * Wire format as Half-Life's voice_miles.dll emitted it: fixed 12-byte frames, each
 * two 6-byte codec frames of 180 samples (16-bit mono, 8 kHz), no header.
 */
#pragma once
#include <stdint.h>

/* decoder */
typedef struct vr12_decoder_s vr12_decoder_t;
vr12_decoder_t *vr12_create(void);
void vr12_destroy(vr12_decoder_t *d);
void vr12_reset(vr12_decoder_t *d);
/* one 6-byte codec frame -> 180 samples; returns 180 or -1 if the frame is empty */
int vr12_decode_frame(vr12_decoder_t *d, const uint8_t *frame6, int16_t *out180);
/* one 12-byte Half-Life voice_miles frame -> 360 samples */
int vr12_decode_hl_frame(vr12_decoder_t *d, const uint8_t *frame12, int16_t *out360);

/* encoder */
typedef struct vr12_encoder_s vr12_encoder_t;
vr12_encoder_t *vr12_encoder_create(void);
void vr12_encoder_destroy(vr12_encoder_t *e);
void vr12_encoder_reset(vr12_encoder_t *e);
/* one 180-sample codec frame -> 6 bytes (zero padded); returns 6 */
int vr12_encode_frame6(vr12_encoder_t *e, const int16_t *pcm180, uint8_t *out6);
/* one 360-sample (45 ms, 8 kHz) Half-Life frame -> 12 bytes; returns 12 */
int vr12_encode_hl_frame(vr12_encoder_t *e, const int16_t *pcm360, uint8_t *out12);
