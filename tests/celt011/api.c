/* Entry points for JavaScript: CELT's ctl calls take varargs, which a
 * WebAssembly caller cannot pass, and its create calls report errors
 * through a pointer. Mono only, as Source's vaudio_celt. */
#include "celt.h"
#include "modes.h"

CELTMode *cc_mode_create(int rate, int frame) {
  int error = 0;
  CELTMode *mode = celt_mode_create(rate, frame, &error);
  return error == CELT_OK ? mode : 0;
}
/* The codec's delay in samples: the MDCT window overlap. */
int cc_mode_overlap(const CELTMode *mode) { return mode->overlap; }
CELTEncoder *cc_encoder_create(const CELTMode *mode) {
  int error = 0;
  CELTEncoder *st = celt_encoder_create_custom(mode, 1, &error);
  return error == CELT_OK ? st : 0;
}
int cc_encoder_set(CELTEncoder *st, int request, int value) { return celt_encoder_ctl(st, request, value); }
CELTDecoder *cc_decoder_create(const CELTMode *mode) {
  int error = 0;
  CELTDecoder *st = celt_decoder_create_custom(mode, 1, &error);
  return error == CELT_OK ? st : 0;
}
/* For request 8 (CELT_RESET_STATE), which takes no argument: the extra one
 * is not read. */
int cc_decoder_set(CELTDecoder *st, int request, int value) { return celt_decoder_ctl(st, request, value); }

#ifdef CC_NATIVE
/* The native counterpart of vendor/celt-0.11/index.mjs, for
 * `node tests/celt011/build.mjs --native`, making the same calls in the same
 * order:
 *   celt011-native rate frame bytes complexity restartAt lossEvery < samples
 * reads 16-bit mono samples on stdin and, per whole frame, encodes it with
 * celt_encode into a `bytes` packet and decodes that packet with celt_decode,
 * or conceals (a null packet) on every lossEvery-th frame (0: never). The
 * encoder and decoder are opened as index.mjs's open() does: created, the
 * complexity set, VBR off, then request 8 to each; before frame restartAt
 * (-1: never) both are destroyed and opened again, as restart() does. Writes,
 * per frame, the packet and the frame's 16-bit output. */
#include <stdio.h>
#include <stdlib.h>

static CELTEncoder *enc;
static CELTDecoder *dec;
static void open_codec(const CELTMode *mode, int complexity) {
  enc = cc_encoder_create(mode);
  dec = cc_decoder_create(mode);
  if (!enc || !dec) exit(3);
  if (cc_encoder_set(enc, 2, complexity) < 0) exit(4);   /* CELT_SET_COMPLEXITY */
  cc_encoder_set(enc, 12, 0);                             /* CELT_SET_VBR */
  cc_encoder_set(enc, 8, 0);                              /* CELT_RESET_STATE */
  cc_decoder_set(dec, 8, 0);
}
int main(int argc, char **argv) {
  int rate, frame, bytes, complexity, n, lost;
  long restart_at, loss_every, f;
  CELTMode *mode;
  celt_int16 *in, *out;
  unsigned char *packet;
  if (argc < 7) return 2;
  rate = atoi(argv[1]); frame = atoi(argv[2]); bytes = atoi(argv[3]); complexity = atoi(argv[4]);
  restart_at = atol(argv[5]); loss_every = atol(argv[6]);
  mode = cc_mode_create(rate, frame);
  if (!mode) return 5;
  in = malloc(frame * sizeof *in);
  out = malloc(frame * sizeof *out);
  packet = malloc(bytes > 1275 ? bytes : 1275);
  open_codec(mode, complexity);
  for (f = 0; fread(in, sizeof *in, frame, stdin) == (size_t)frame; f++) {
    if (f == restart_at) {
      celt_encoder_destroy(enc);
      celt_decoder_destroy(dec);
      open_codec(mode, complexity);
    }
    n = celt_encode(enc, in, frame, packet, bytes);
    if (n != bytes) return 6;
    lost = loss_every > 0 && f % loss_every == loss_every - 1;
    if (celt_decode(dec, lost ? 0 : packet, lost ? 0 : n, out, frame) < 0) return 7;
    fwrite(packet, 1, n, stdout);
    fwrite(out, sizeof *out, frame, stdout);
  }
  return 0;
}
#endif
