// The Voxware MetaVoice VR12 codec inside the Miles Sound System plug-in that
// the engine's vaudio_miles module wraps, compiled to WebAssembly with the
// wrapper by tests/vr12/build.mjs: the vendored C implementation in this
// folder (vr12.c, unchanged) and the wrapper as read from the game's module
// (tests/vr12/api.c). A codec of the engine family (selectable in the Source
// engines of 2006 and 2007, where the default was already vaudio_speex);
// current TF2 ships it and refuses it. Nothing in the app loads this yet.
//
// createCodec() is the wrapper's frame codec: 360 samples to 12 bytes and
// back (two VR12 frames of 180 samples and 6 bytes). The codec's nominal rate
// is 8000 Hz (45 ms and 2133 bit/s a frame); the engines that accepted it ran
// voice at 11025 Hz and resampled nothing, so there a frame was 32.65 ms and
// 2940 bit/s. The encoder
// sees each sample cut to its top 8 bits; decoded samples are the codec's, as
// they come. A new codec has coded one block of zeros (the game codes a block
// of uninitialised memory there). reset() is the wrapper's: two blocks of
// zeros through the encoder and the bytes they give through the decoder.
// There is no way to decode a lost frame: the wrapper has none.
//
// createFramer(codec) is the wrapper's Compress and Decompress.
//
// createPluginEncoder() and createPluginDecoder() are the plug-in level for
// the tests: one 180-sample frame of full 16-bit input to 6 bytes and back,
// no wrapper.
import wasmBase64 from './voxware-vr12.wasm.mjs';

export const version = 'Voxware VR12 (voxware-vr12 eedf465)';
// The codec's own nominal rate, not the rate an engine fed it (11025 Hz).
export const sampleRate = 8000;
export const frameSize = 360, packetBytes = 12;
export const codecFrameSize = 180, codecPacketBytes = 6;

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

// encode(Int16Array of 360) gives 12 bytes; decode(12 bytes) gives an
// Int16Array of 360. reset() is the wrapper's ResetState; free() releases it.
export async function createCodec() {
  const x = await load();
  let codec = x.vm_create();
  if (!codec) throw new Error('VR12 could not create its encoder or decoder');
  const pcm = x.malloc(frameSize * 2), packet = x.malloc(packetBytes);
  const live = () => { if (!codec) throw new Error('This VR12 codec has been freed'); };
  return {
    frameSize, packetBytes, sampleRate, version,
    encode(samples) {
      live();
      if (samples.length !== frameSize) throw new RangeError(`Expected ${frameSize} samples`);
      new Int16Array(x.memory.buffer, pcm, frameSize).set(samples);
      const n = x.vm_encode(codec, pcm, packet);
      if (n !== packetBytes) throw new Error(`VR12 wrote ${n} bytes, not ${packetBytes}`);
      return new Uint8Array(x.memory.buffer, packet, packetBytes).slice();
    },
    decode(bytes) {
      live();
      if (!bytes || bytes.length !== packetBytes) throw new RangeError(`Expected a ${packetBytes}-byte packet`);
      new Uint8Array(x.memory.buffer, packet, packetBytes).set(bytes);
      if (x.vm_decode(codec, packet, pcm) !== frameSize) throw new Error('VR12 refused a frame');
      return new Int16Array(x.memory.buffer, pcm, frameSize).slice();
    },
    reset() {
      live();
      if (x.vm_reset(codec) !== 0) throw new Error('VR12 refused a frame during the reset');
    },
    free() {
      if (!codec) return;
      x.vm_destroy(codec);
      x.free(pcm);
      x.free(packet);
      codec = 0;
    }
  };
}

// The wrapper's Compress and Decompress. compress(samples, final) keeps the
// samples that do not fill a frame for the next call, encodes every whole 360
// (kept samples first) and returns the 12-byte frames end to end, with no
// header or count; on the final call what is kept is padded with zeros to a
// frame and encoded too. decompress(bytes) decodes as many whole 12-byte
// frames as fit and ignores the rest: 11 bytes give no samples, 13 give 360.
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
      if (!bytes) throw new TypeError('VR12 has no lost-frame path: decompress needs bytes');
      const frames = Math.floor(bytes.length / packetBytes), out = new Int16Array(frames * frameSize);
      for (let f = 0; f < frames; f++) out.set(codec.decode(bytes.subarray(f * packetBytes, (f + 1) * packetBytes)), f * frameSize);
      return out;
    }
  };
}

// The plug-in level, for the tests: a new VR12 encoder (one 180-sample frame
// of full 16-bit samples to 6 bytes) and a new VR12 decoder (6 bytes to 180
// samples), each a fresh stream.
export async function createPluginEncoder() {
  const x = await load();
  let encoder = x.vr12_encoder_create();
  if (!encoder) throw new Error('VR12 could not create its encoder');
  const pcm = x.malloc(codecFrameSize * 2), packet = x.malloc(codecPacketBytes);
  return {
    encode(samples) {
      if (!encoder) throw new Error('This VR12 encoder has been freed');
      if (samples.length !== codecFrameSize) throw new RangeError(`Expected ${codecFrameSize} samples`);
      new Int16Array(x.memory.buffer, pcm, codecFrameSize).set(samples);
      x.vr12_encode_frame6(encoder, pcm, packet);
      return new Uint8Array(x.memory.buffer, packet, codecPacketBytes).slice();
    },
    free() {
      if (!encoder) return;
      x.vr12_encoder_destroy(encoder);
      x.free(pcm);
      x.free(packet);
      encoder = 0;
    }
  };
}
export async function createPluginDecoder() {
  const x = await load();
  let decoder = x.vr12_create();
  if (!decoder) throw new Error('VR12 could not create its decoder');
  const pcm = x.malloc(codecFrameSize * 2), packet = x.malloc(codecPacketBytes);
  return {
    decode(bytes) {
      if (!decoder) throw new Error('This VR12 decoder has been freed');
      if (!bytes || bytes.length !== codecPacketBytes) throw new RangeError(`Expected a ${codecPacketBytes}-byte frame`);
      new Uint8Array(x.memory.buffer, packet, codecPacketBytes).set(bytes);
      if (x.vr12_decode_frame(decoder, packet, pcm) !== codecFrameSize) throw new Error('VR12 refused a frame');
      return new Int16Array(x.memory.buffer, pcm, codecFrameSize).slice();
    },
    free() {
      if (!decoder) return;
      x.vr12_destroy(decoder);
      x.free(pcm);
      x.free(packet);
      decoder = 0;
    }
  };
}
