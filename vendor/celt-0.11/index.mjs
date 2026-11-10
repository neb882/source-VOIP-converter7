// CELT 0.11, the codec behind Source's vaudio_celt (tests/LEGACY_CODECS.md),
// compiled to WebAssembly by tests/celt011/build.mjs with the pitch
// pre-filter and post-filter in, as the game's module has them
// (docs/reports/W3-08-celt-encoder.md). Mono custom modes:
// createCodec(rate, frameSize) gives an encoder and decoder pair that code
// one frame into a fixed-size packet, as the engine does.
import wasmBase64 from './celt-0.11.wasm.mjs';

// CELT_SET_COMPLEXITY, CELT_SET_VBR and CELT_RESET_STATE requests.
const COMPLEXITY = 2, VBR = 12, RESET = 8;

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

export const version = 'CELT 0.11 (celt-0.11.0, pitch filter in)';

// A float sample (full scale 1) as the 16-bit sample the codec is given: to
// nearest, ties to even, clamped, as the library's own conversion does.
export function toInt16(v) {
  const x = Math.max(-32768, Math.min(32767, v * 32768)), r = Math.round(x);
  return r - x === 0.5 && (r & 1) ? r - 1 : r;
}

// options: { packetBytes, complexity }. encode(frame) takes frameSize floats
// (full scale 1), codes them as 16-bit samples (toInt16) and returns a
// packetBytes packet; decode(packet) and conceal() return frameSize floats,
// the decoder's 16-bit samples / 32768. The output is delayed by `lookahead`
// samples (the MDCT overlap). As the game's module does, the library's 16-bit
// entry points (celt_encode, celt_decode) are used, and the new encoder and
// decoder get request 8 (reset) after creation.
export async function createCodec(rate, frameSize, options = {}) {
  const x = await load();
  const packetBytes = options.packetBytes ?? 64;
  const mode = x.cc_mode_create(rate, frameSize);
  if (!mode) throw new Error(`CELT 0.11 has no mode for ${rate} Hz / ${frameSize} samples`);
  let encoder = 0, decoder = 0;
  const pcm = x.malloc(frameSize * 2), packet = x.malloc(Math.max(packetBytes, 1275));
  const open = () => {
    encoder = x.cc_encoder_create(mode);
    decoder = x.cc_decoder_create(mode);
    if (!encoder || !decoder) throw new Error('CELT 0.11 could not create its encoder or decoder');
    if (x.cc_encoder_set(encoder, COMPLEXITY, options.complexity ?? 10) < 0) throw new Error('CELT 0.11 rejected the complexity');
    x.cc_encoder_set(encoder, VBR, 0);
    x.cc_encoder_set(encoder, RESET, 0);
    x.cc_decoder_set(decoder, RESET, 0);
  };
  const close = () => {
    if (encoder) x.celt_encoder_destroy(encoder);
    if (decoder) x.celt_decoder_destroy(decoder);
    encoder = decoder = 0;
  };
  open();
  const decodeInto = (data, length) => {
    const n = x.celt_decode(decoder, data, length, pcm, frameSize);
    if (n < 0) throw new Error(`CELT 0.11 decode failed (error ${n})`);
    return Float32Array.from(new Int16Array(x.memory.buffer, pcm, frameSize), v => v / 32768);
  };
  return {
    frameSize, packetBytes, lookahead: x.cc_mode_overlap(mode), version,
    encode(frame) {
      if (frame.length !== frameSize) throw new RangeError(`Expected ${frameSize} samples`);
      const input = new Int16Array(x.memory.buffer, pcm, frameSize);
      for (let i = 0; i < frameSize; i++) input[i] = toInt16(frame[i]);
      const n = x.celt_encode(encoder, pcm, frameSize, packet, packetBytes);
      if (n < 0) throw new Error(`CELT 0.11 encode failed (error ${n})`);
      return new Uint8Array(x.memory.buffer, packet, n).slice();
    },
    decode(bytes) {
      new Uint8Array(x.memory.buffer, packet, bytes.length).set(bytes);
      return decodeInto(packet, bytes.length);
    },
    conceal() { return decodeInto(0, 0); },
    // A new talk spurt: a fresh encoder and decoder, reset as at creation.
    restart() { close(); open(); },
    free() {
      close();
      if (pcm) { x.free(pcm); x.free(packet); }
      x.celt_mode_destroy(mode);
    }
  };
}
