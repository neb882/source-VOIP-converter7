// Speex 1.0.2, the library inside the game's vaudio_speex module, compiled to
// WebAssembly by tests/speex102/build.mjs, set up and framed as the module does
// (docs/reports/W3-09-steam-voice.md, section 5).
//
// createCodec() gives the module's codec: narrowband, quality 4 (the engine's
// quality 3), constant bit rate, the decoder's enhancement on, complexity the
// library's default. A frame is 160 16-bit samples and a packet 20 bytes.
// The module does not resample: the game hands it 11025 Hz sound, so a frame
// lasts 14.51 ms there, though the codec believes it is 8000 Hz.
//
// createFramer(codec) is the module's wrapper, which turns the engine's runs
// of samples into packets of whole frames and back.
import wasmBase64 from './speex-1.0.2.wasm.mjs';

export const version = 'Speex 1.0.2';
export const frameSize = 160, packetBytes = 20;

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

// The module's conversion of a decoded float to a 16-bit sample: truncation
// toward zero, then the low 16 bits as a signed number, with no clamp. So a
// value past full scale wraps to the other end: 32768.7 gives -32768 and
// -32769.2 gives 32767.
export function toInt16(floats) {
  const out = new Int16Array(floats.length);
  for (let i = 0; i < floats.length; i++) out[i] = (Math.trunc(floats[i]) << 16) >> 16;
  return out;
}

// encode(Int16Array of 160) gives 20 bytes; decode(20 bytes) gives an
// Int16Array of 160, and decodeFloats(20 bytes) the decoder's floats before
// that conversion. reset() is the module's ResetState. encoderCtl and
// decoderCtl read one integer from a Speex request (for the tests).
export async function createCodec() {
  const x = await load();
  let codec = x.sx_create();
  if (!codec) throw new Error('Speex could not create its encoder or decoder');
  const pcm = x.malloc(frameSize * 4), packet = x.malloc(packetBytes);
  const decodeInto = (bytes) => {
    if (!codec) throw new Error('This Speex codec has been freed');
    if (bytes.length !== packetBytes) throw new RangeError(`Expected a ${packetBytes}-byte packet`);
    new Uint8Array(x.memory.buffer, packet, packetBytes).set(bytes);
    const status = x.sx_decode(codec, packet, pcm);
    if (status < 0) throw new Error(`Speex decode failed (error ${status})`);
    return new Float32Array(x.memory.buffer, pcm, frameSize).slice();
  };
  return {
    frameSize, packetBytes, version,
    // The samples go in as floats with their integer values: no division.
    encode(samples) {
      if (!codec) throw new Error('This Speex codec has been freed');
      if (samples.length !== frameSize) throw new RangeError(`Expected ${frameSize} samples`);
      new Float32Array(x.memory.buffer, pcm, frameSize).set(samples);
      const n = x.sx_encode(codec, pcm, packet);
      if (n !== packetBytes) throw new Error(`Speex wrote ${n} bytes, not ${packetBytes}`);
      return new Uint8Array(x.memory.buffer, packet, packetBytes).slice();
    },
    decodeFloats: decodeInto,
    decode(bytes) { return toInt16(decodeInto(bytes)); },
    reset() { if (codec) x.sx_reset(codec); },
    encoderCtl(request) { if (!codec) throw new Error('This Speex codec has been freed'); return x.sx_encoder_get(codec, request); },
    decoderCtl(request) { if (!codec) throw new Error('This Speex codec has been freed'); return x.sx_decoder_get(codec, request); },
    free() {
      if (!codec) return;
      x.sx_destroy(codec);
      x.free(pcm);
      x.free(packet);
      codec = 0;
    }
  };
}

// The module's frame wrapper. compress(samples, final) keeps the samples that
// did not fill a frame for the next call, encodes every whole 160 (kept
// samples first) and returns the packets back to back, with nothing before,
// between or after them; on the final call what is kept is padded with zeros
// to a frame and encoded too. decompress(bytes) decodes every whole 20 bytes
// in order and ignores a remainder.
export function createFramer(codec) {
  const kept = new Int16Array(frameSize);
  let count = 0;
  return {
    get kept() { return count; },
    compress(samples, final = false) {
      const packets = [];
      for (let i = 0; i < samples.length; i++) {
        kept[count++] = samples[i];
        if (count === frameSize) { packets.push(codec.encode(kept)); count = 0; }
      }
      if (final && count > 0) {
        kept.fill(0, count);
        packets.push(codec.encode(kept));
        count = 0;
      }
      const out = new Uint8Array(packets.length * packetBytes);
      packets.forEach((p, i) => out.set(p, i * packetBytes));
      return out;
    },
    decompress(bytes) {
      const frames = Math.floor(bytes.length / packetBytes), out = new Int16Array(frames * frameSize);
      for (let f = 0; f < frames; f++) out.set(codec.decode(bytes.subarray(f * packetBytes, (f + 1) * packetBytes)), f * frameSize);
      return out;
    }
  };
}
