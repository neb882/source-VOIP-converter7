// Speex 1.2.1, the codec behind Source's vaudio_speex (tests/LEGACY_CODECS.md),
// compiled to WebAssembly by tests/speex/build.mjs. Narrowband (8 kHz), mono:
// createCodec(quality) gives an encoder and decoder pair that code one
// 160-sample (20 ms) frame per packet, at constant bitrate.
import wasmBase64 from './speex-1.2.1.wasm.mjs';

// Speex ctl requests (include/speex/speex.h).
const GET_ENH = 1, GET_FRAME_SIZE = 3, GET_COMPLEXITY = 17, GET_BITRATE = 19, GET_LOOKAHEAD = 39;
const SCALE = 32768;   // Speex's float API works at 16-bit scale

let exportsPromise;
function wasmBytes() {
  if (typeof atob === 'function') {
    const text = atob(wasmBase64);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes;
  }
  return Uint8Array.from(Buffer.from(wasmBase64, 'base64'));
}
function load() {
  exportsPromise ??= WebAssembly.instantiate(wasmBytes(), {}).then(result => result.instance.exports);
  return exportsPromise;
}

export const version = 'Speex 1.2.1';
export const sampleRate = 8000, frameSize = 160;
// Narrowband bitrate of each quality 0-10, from the library itself. Several
// qualities share a mode (3 and 4 are both the 8 kbps mode).
let bitratesPromise;
export function qualityBitrates() {
  bitratesPromise ??= load().then(x => Array.from({ length: 11 }, (_, quality) => {
    const encoder = x.sx_encoder_create(quality);
    const bitrate = x.sx_encoder_get(encoder, GET_BITRATE);
    x.speex_encoder_destroy(encoder);
    return bitrate;
  }));
  return bitratesPromise;
}
// The quality whose bitrate is nearest `bitrate`; of qualities that share a
// mode, the highest.
export async function qualityForBitrate(bitrate) {
  const rates = await qualityBitrates();
  let best = 0;
  rates.forEach((rate, quality) => { if (Math.abs(rate - bitrate) <= Math.abs(rates[best] - bitrate)) best = quality; });
  return best;
}

// encode(frame) takes frameSize floats (full scale 1) and returns the packet;
// decode(packet) and conceal() return frameSize floats. The output is
// delayed by `lookahead` samples (the encoder's and decoder's together).
export async function createCodec(quality = 4) {
  const x = await load();
  if (!Number.isInteger(quality) || quality < 0 || quality > 10) throw new RangeError(`Speex has no quality ${quality}`);
  let encoder = 0, decoder = 0;
  const pcm = x.malloc(frameSize * 4), packet = x.malloc(256);
  const open = () => {
    encoder = x.sx_encoder_create(quality);
    decoder = x.sx_decoder_create();
    if (!encoder || !decoder) throw new Error('Speex could not create its encoder or decoder');
  };
  const close = () => {
    if (encoder) x.speex_encoder_destroy(encoder);
    if (decoder) x.speex_decoder_destroy(decoder);
    encoder = decoder = 0;
  };
  open();
  if (x.sx_encoder_get(encoder, GET_FRAME_SIZE) !== frameSize) throw new Error('Speex narrowband frame size is not 160');
  const lookahead = x.sx_encoder_get(encoder, GET_LOOKAHEAD) + x.sx_decoder_get(decoder, GET_LOOKAHEAD);
  const decodeInto = (data, length) => {
    const status = x.sx_decode(decoder, data, length, pcm);
    if (status < 0) throw new Error(`Speex decode failed (error ${status})`);
    const out = new Float32Array(x.memory.buffer, pcm, frameSize).slice();
    for (let i = 0; i < frameSize; i++) out[i] /= SCALE;
    return out;
  };
  return {
    frameSize, sampleRate, quality, lookahead, version,
    bitrate: x.sx_encoder_get(encoder, GET_BITRATE),
    complexity: x.sx_encoder_get(encoder, GET_COMPLEXITY),
    enhancement: x.sx_decoder_get(decoder, GET_ENH) === 1,
    encode(frame) {
      if (frame.length !== frameSize) throw new RangeError(`Expected ${frameSize} samples`);
      const input = new Float32Array(x.memory.buffer, pcm, frameSize);
      for (let i = 0; i < frameSize; i++) input[i] = frame[i] * SCALE;
      const n = x.sx_encode(encoder, pcm, packet, 256);
      return new Uint8Array(x.memory.buffer, packet, n).slice();
    },
    decode(bytes) {
      if (bytes.length > 256) throw new RangeError('A Speex narrowband packet is at most 256 bytes here');
      new Uint8Array(x.memory.buffer, packet, bytes.length).set(bytes);
      return decodeInto(packet, bytes.length);
    },
    // Speex's own concealment: a decode with no bits.
    conceal() { return decodeInto(0, 0); },
    // A new talk spurt: fresh encoder and decoder state.
    restart() { close(); open(); },
    free() {
      close();
      if (pcm) { x.free(pcm); x.free(packet); }
    }
  };
}
