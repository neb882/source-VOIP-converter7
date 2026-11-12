// Real Opus packets, 20 ms framing, and decoder packet-loss concealment.
// Two pinned libopus builds: 1.1.5, the release Steam's voice packets match
// (tests/REFERENCE_2026.md), and 1.6.1 from libopus-wasm for a video's audio
// track and as roundTrip's default. Source's engine codecs run their own
// libraries: CELT 0.11 (the game's build, pitch filter in), Speex 1.0.2
// (the game's vaudio_speex module, on 11025 Hz sound) and Voxware VR12
// (vaudio_miles of the Source engines of 2006 and 2007, not a TF2 codec, on
// 11025 Hz sound).
const RUNTIMES = {
  '1.6.1': () => import('./vendor/libopus/index.mjs'),
  '1.1.5': () => import('./vendor/libopus-1.1/index.mjs')
};
const loaded = new Map();
let celtModule = null, speexModule = null, vr12Module = null;
const loadCelt = () => (celtModule ??= import('./vendor/celt-0.11/index.mjs'));
const loadSpeex = () => (speexModule ??= import('./vendor/speex-1.0.2/index.mjs'));
const loadVr12 = () => (vr12Module ??= import('./vendor/voxware-vr12/index.mjs'));
function runtime(version) {
  if (!(version in RUNTIMES)) throw new RangeError(`Unknown libopus runtime "${version}"`);
  if (!loaded.has(version)) loaded.set(version, RUNTIMES[version]());
  return loaded.get(version);
}

// Opus API constants, identical in every libopus release.
const APPLICATIONS = { voip: 2048, audio: 2049, lowdelay: 2051 };
const SIGNALS = { auto: -1000, voice: 3001, music: 3002 };

// Codes in roundTrip's info.frameLog, one per 20 ms frame (info.frameBytes
// holds each frame's packet size; 0 when the gate held it back).
export const FRAME = { gated: 0, silk: 1, hybrid: 2, celt: 3, dtx: 4, lost: 5, late: 6, speex: 7, vr12: 8 };

// RFC 6716 section 3.1: the TOC configuration number selects the coding mode.
function packetMode(packet) {
  const config = packet[0] >> 3;
  return config < 12 ? 'silk' : config < 16 ? 'hybrid' : 'celt';
}

// Steam's sender voice gate, measured frame by frame from SourceTV packets:
// a frame whose RMS exceeds the threshold is sent together with the
// prerollFrames before it and the holdFrames after it. Returns 1 per sent frame.
function gatePlan(samples, frames, frameSize, gate) {
  const sent = new Uint8Array(frames);
  for (let f = 0; f < frames; f++) {
    const start = f * frameSize;
    const end = Math.min(samples.length, start + frameSize);
    let energy = 0;
    for (let i = start; i < end; i++) energy += samples[i] * samples[i];
    if (Math.sqrt(energy / frameSize) > gate.threshold) {
      sent.fill(1, Math.max(0, f - gate.preroll), Math.min(frames, f + gate.hold + 1));
    }
  }
  return sent;
}

// Encoder settings shared by roundTrip and createVoiceStream.
function encoderSettings(sampleRate, bitrate, options) {
  const frameSize = sampleRate / 50;
  const application = options.application ?? 'voip';
  const signal = options.signal ?? 'auto';
  if (!(application in APPLICATIONS)) throw new RangeError(`Unknown Opus application "${application}"`);
  if (!(signal in SIGNALS)) throw new RangeError(`Unknown Opus signal "${signal}"`);
  const complexity = options.complexity ?? 10;
  const vbr = !!options.vbr, dtx = !!options.dtx;
  return { sampleRate, channels: 1, frameSize,
    application: APPLICATIONS[application], signal: SIGNALS[signal], bitrate, complexity, vbr, dtx, fec: false };
}

// One 20 ms frame at a time, with roundTrip's settings: for the live monitor.
// restart() starts a new talk spurt with a fresh encoder and decoder, as
// roundTrip does. encode() returns the packet with its mode; decode() and
// conceal() return frameSize samples.
export async function createVoiceStream(sampleRate, bitrate, options = {}) {
  const encoderOptions = encoderSettings(sampleRate, bitrate, options);
  const { frameSize } = encoderOptions;
  const { createEncoder, createDecoder, loadLibopus } = await runtime(options.runtime ?? '1.6.1');
  let encoder = await createEncoder(encoderOptions);
  let decoder = await createDecoder({ sampleRate, channels: 1 });
  return {
    frameSize,
    version: (await loadLibopus()).version,
    lookahead: encoder.getLookahead(),
    async restart() {
      encoder.free(); decoder.free();
      encoder = await createEncoder(encoderOptions);
      decoder = await createDecoder({ sampleRate, channels: 1 });
    },
    encode(frame) {
      const packet = encoder.encodeFloat(frame);
      return { bytes: packet.byteLength, mode: packetMode(packet), dtx: packet.byteLength <= 2, packet };
    },
    decode(packet) { return decoder.decodeFloat(packet, { frameSize }); },
    conceal() { return decoder.decodePacketLossFloat(frameSize); },
    free() { encoder?.free(); decoder?.free(); encoder = decoder = null; }
  };
}

export async function roundTrip(samples, sampleRate, bitrate, options = {}) {
  const encoderOptions = encoderSettings(sampleRate, bitrate, options);
  const { frameSize, complexity, vbr, dtx } = encoderOptions;
  const application = options.application ?? 'voip', signal = options.signal ?? 'auto';
  const { createEncoder, createDecoder, loadLibopus } = await runtime(options.runtime ?? '1.6.1');
  let encoder, decoder;
  try {
    encoder = await createEncoder(encoderOptions);
    decoder = await createDecoder({ sampleRate, channels: 1 });
    const lookahead = encoder.getLookahead();
    const frames = Math.ceil((samples.length + lookahead) / frameSize);
    const lossMask = options.makeLossMask ? options.makeLossMask(frames) : null;
    const output = new Float32Array(samples.length);
    const input = new Float32Array(frameSize);
    const modes = { silk: 0, hybrid: 0, celt: 0 };
    const gate = options.gate ? {
      threshold: 10 ** (Number(options.gate.thresholdDb) / 20),
      preroll: Math.max(0, Math.round(Number(options.gate.prerollFrames) || 0)),
      hold: Math.max(0, Math.round(Number(options.gate.holdFrames) || 0))
    } : null;
    // Frames outside the plan are neither encoded nor sent, so the receiver
    // outputs silence for them. Each talk spurt starts a fresh encoder and
    // decoder, as Steam's end-of-transmission marker resets the decoder.
    const plan = gate ? gatePlan(samples, frames, frameSize, gate) : null;
    // What happened to each frame, for the visualizer's codec lane.
    const frameLog = new Uint8Array(frames), frameBytes = new Uint16Array(frames);
    let encodedBytes = 0, lostFrames = 0, underrunFrames = 0, gatedFrames = 0, dtxFrames = 0, spurts = 0;
    let open = false;
    for (let f = 0; f < frames; f++) {
      if (plan && !plan[f]) {
        gatedFrames++;
        open = false;
        continue;
      }
      if (!open) {
        if (spurts > 0) {
          encoder.free(); encoder = null;
          decoder.free(); decoder = null;
          encoder = await createEncoder(encoderOptions);
          decoder = await createDecoder({ sampleRate, channels: 1 });
        }
        spurts++;
        open = true;
      }
      input.fill(0);
      const start = f * frameSize;
      if (start < samples.length) input.set(samples.subarray(start, Math.min(samples.length, start + frameSize)));
      // Encode even lost packets: capture/encoder state continues at the sender.
      const packet = encoder.encodeFloat(input);
      encodedBytes += packet.byteLength;
      frameBytes[f] = packet.byteLength;
      const mode = packetMode(packet);
      modes[mode]++;
      // A DTX packet is the TOC byte alone (plus at most one byte); the
      // decoder answers it with comfort noise.
      const dtx = packet.byteLength <= 2;
      if (dtx) dtxFrames++;
      frameLog[f] = dtx ? FRAME.dtx : FRAME[mode];
      options.onPacket?.(f, packet);
      // Loss mask: 1 = lost, concealed by the decoder; 2 = arrived too late
      // for playback, so the slot plays silence and the decoder skips it.
      const miss = lossMask ? lossMask[f] : 0;
      if (miss === 1) { lostFrames++; frameLog[f] = FRAME.lost; }
      else if (miss === 2) { underrunFrames++; frameLog[f] = FRAME.late; }
      if (miss !== 2) {
        const decoded = miss === 1 ? decoder.decodePacketLossFloat(frameSize)
          : decoder.decodeFloat(packet, { frameSize });
        if (decoded.length !== frameSize) throw new Error('Unexpected Opus frame length');
        // Trim only libopus's declared delay. Padding remains at the END.
        const destStart = start - lookahead;
        const begin = Math.max(0, -destStart);
        const end = Math.min(frameSize, samples.length - destStart);
        if (end > begin) output.set(decoded.subarray(begin, end), destStart + begin);
      }
      if ((f & 31) === 31) {
        options.onProgress?.((f + 1) / frames);
        if (options.yieldControl) await options.yieldControl();
      }
    }
    options.onProgress?.(1);
    return { samples: output, info: { backend: 'libopus', version: (await loadLibopus()).version,
      runtime: options.runtime ?? '1.6.1', sampleRate, bitrate, application, signal, complexity, vbr, dtx, frameSamples: frameSize, frameMs: 20,
      lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames, spurts,
      gate: gate ? Number(options.gate.thresholdDb) : null,
      prerollFrames: gate ? gate.preroll : 0, holdFrames: gate ? gate.hold : 0,
      encodedBytes, modes, plc: 'opus', frameLog, frameBytes } };
  } finally {
    decoder?.free();
    encoder?.free();
  }
}

// Steam's decoder for one speaker, as its client runs it (docs/reports/
// W3-09-steam-voice.md, section 4, read): libopus's own 16-bit decoder
// (opus_decode: in this float build the soft clipper over the decoded frame,
// then each sample rounded, ties to even), at 24000 Hz, frame by frame:
//   - a sequence number ahead of the expected one: the gap is concealed first,
//     at most 10 frames of it (the decoder called with no data), then the frame
//     is decoded;
//   - one behind: the decoder is reset and nothing is concealed;
//   - the end marker: the decoder is reset (a new one: a spurt starts with a
//     fresh decoder), expected 0.
// Sequence numbers are 16 bits, as the packets carry them (W3-16 section 3,
// read): the expected one is (seq + 1) & 0xFFFF, so 65535 is followed by 0,
// and "behind" compares the two numbers as they are.
// A lost frame is one the decoder never sees: the gap in front of the next
// frame is counted from the numbers, so a frame lost at 65535 makes number 0
// behind and resets, as in Steam. The render's network model adds a call the
// client does not have: late(seq) for a frame the mask made late (the measured
// stand-in, finding 9: one in ten late frames plays as silence), which the
// decoder does not see, gives 480 zeros in its place and is not a gap: a late
// frame at or above the expected number is taken off the next gap. And
// carry(): the render's numbers start again at 0 for a new spurt whose
// previous end marker was lost (BC-1, rule C), so the decoder keeps its state
// and its expected number, and late frames counted before are forgotten.
// receive() returns the 480-sample blocks it made, the concealed ones first.
export async function createSteamDecoder(options = {}) {
  const { createDecoder } = await runtime(options.runtime ?? '1.1.5');
  const sampleRate = 24000, frameSize = 480;
  // next: the number the decoder expects (one past the last frame it was
  // given); late: the late frames at or above it since then.
  let decoder = await createDecoder({ sampleRate, channels: 1 }), next = 0, late = 0;
  async function reset() {
    decoder.free();
    decoder = await createDecoder({ sampleRate, channels: 1 });
    next = 0; late = 0;
  }
  return {
    frameSize,
    async receive(seq, packet) {
      seq &= 0xFFFF;
      const blocks = [];
      if (seq < next) await reset();
      else {
        const conceal = Math.min(seq - next - late, 10);
        for (let k = 0; k < conceal; k++) blocks.push(decoder.decodePacketLossInt16(frameSize));
      }
      blocks.push(decoder.decodeInt16(packet, { frameSize }));
      next = (seq + 1) & 0xFFFF; late = 0;
      return blocks;
    },
    late(seq) { if ((seq & 0xFFFF) >= next) late++; return new Int16Array(frameSize); },
    carry() { late = 0; },
    end: reset,
    free() { decoder?.free(); decoder = null; }
  };
}

// The `steam` profile's codec, fed the messages of Steam's sender
// (steam-sender.js) one at a time: the sender, not a frame gate, decides what
// is sent. Each sound message's frames are its pcm (16-bit samples, 480 a
// frame), given to the encoder as q / 32768 through the float entry point,
// which is what the library's own 16-bit opus_encode does in a float build.
// Each spurt starts with a fresh encoder (the sender resets it at the spurt's
// end); the decoder is reset by an end marker that arrives, and otherwise
// carries its state and expected number into the next spurt (BC-1, rule C).
// miss(f), called once per frame in the sender's frame order, gives the
// network's per-frame verdict: 0 sent, 1 lost, 2 late. lost (BC-1), once per
// message: the whole message is lost. Its frames are still encoded (the sender
// sent them), the decoder is given none of them, so they count toward the gap
// in front of the next frame to arrive; its end marker is not delivered; a
// lost silence record makes no samples. message() returns
//   { pcm, blocks, silence, lost, skipped }
// pcm: the message's decoded samples (an Int16Array; concealed and late blocks
// included, in the order the decoder made them; a silence record's are zeros);
// blocks: one entry per 480 samples of pcm, { frame, code, bytes, mode }: the
// frame it stands for, its FRAME code (lost for a concealed block, late for a
// late one), the frame's packet size and its coding mode. A concealed block
// stands for one of the lost frames directly before the frame that arrived
// (the last ten of a longer gap). skipped: the lost frames in front of this
// message's first frame to arrive that no block stands for (past the ten
// concealed, or before a reset), whose time nothing fills. Frames lost at the
// end of a spurt, with no later frame in it, make no block.
export async function createSteamStream(bitrate, options = {}) {
  const sampleRate = 24000;
  const encoderOptions = encoderSettings(sampleRate, bitrate, options);
  const lib = await runtime(options.runtime ?? '1.1.5');
  const probe = await lib.createEncoder(encoderOptions), lookahead = probe.getLookahead();
  probe.free();
  const version = (await lib.loadLibopus()).version;
  const frameSize = encoderOptions.frameSize, input = new Float32Array(frameSize);
  let encoder = null, decoder = null, spurt = null, spurtFirst = 0, pending = [];
  async function close() {
    encoder?.free(); decoder?.free(); encoder = decoder = null; pending = [];
  }
  return {
    frameSize, version, lookahead, sampleRate,
    async message(msg, miss, lost = false) {
      if (msg.silence !== undefined) {
        return lost ? { pcm: new Int16Array(0), blocks: [], silence: true, lost: true, skipped: 0 }
          : { pcm: new Int16Array(msg.silence), blocks: [], silence: true, lost: false, skipped: 0 };
      }
      if (msg.spurt !== spurt || !encoder) {
        encoder?.free();
        encoder = await lib.createEncoder(encoderOptions);
        if (decoder) decoder.carry();
        else decoder = await createSteamDecoder(options);
        spurt = msg.spurt; spurtFirst = msg.first; pending = [];
      }
      const parts = [], blocks = [];
      let skipped = 0, arrived = false;
      for (let f = msg.first; f <= msg.last; f++) {
        const at = (f - msg.first) * frameSize;
        for (let i = 0; i < frameSize; i++) input[i] = msg.pcm[at + i] / 32768;
        const packet = encoder.encodeFloat(input), mode = packetMode(packet), dtx = packet.byteLength <= 2;
        const frame = { frame: f, code: dtx ? FRAME.dtx : FRAME[mode], bytes: packet.byteLength, mode };
        const seq = (f - spurtFirst) & 0xFFFF, m = miss(f);
        if (lost || m === 1) { pending.push(frame); continue; }
        if (m === 2) { parts.push(decoder.late(seq)); blocks.push({ ...frame, code: FRAME.late }); continue; }
        const made = await decoder.receive(seq, packet), conceal = made.length - 1;
        if (!arrived) skipped = pending.length - conceal;
        arrived = true;
        for (let k = pending.length - conceal; k < pending.length; k++) blocks.push({ ...pending[k], code: FRAME.lost });
        pending = [];
        parts.push(...made);
        blocks.push(frame);
      }
      if (msg.end) {
        encoder.free(); encoder = null;
        if (!lost) { await decoder.end(); pending = []; }
      }
      const pcm = new Int16Array(parts.length * frameSize);
      parts.forEach((p, k) => pcm.set(p, k * frameSize));
      return { pcm, blocks, silence: false, lost: !!lost, skipped };
    },
    free: close
  };
}

// createSteamStream over all of a render's messages at once, for
// TF2Audio.process(); options.makeLossMask(count) gives the mask over the
// count frames the messages hold, by frame number (as roundTrip's), and
// options.lose(index, msg), called once per message in the sender's order,
// whether that message is lost whole (BC-1).
export async function steamRoundTrip(messages, bitrate, options = {}) {
  const stream = await createSteamStream(bitrate, options);
  try {
    const count = messages.reduce((n, m) => (m.silence === undefined ? Math.max(n, m.last + 1) : n), 0);
    const mask = options.makeLossMask ? options.makeLossMask(count) : null;
    const miss = (f) => (mask ? mask[f] : 0);
    const results = [];
    let done = 0;
    for (let k = 0; k < messages.length; k++) {
      const msg = messages[k];
      results.push(await stream.message(msg, miss, options.lose ? !!options.lose(k, msg) : false));
      if (msg.silence === undefined && Math.floor((msg.last + 1) / 32) > Math.floor(done / 32)) {
        options.onProgress?.(count ? (msg.last + 1) / count : 1);
        if (options.yieldControl) await options.yieldControl();
      }
      if (msg.silence === undefined) done = msg.last + 1;
    }
    options.onProgress?.(1);
    return { results, lookahead: stream.lookahead, version: stream.version };
  } finally {
    await stream.free();
  }
}

// Source's engine CELT codecs (vaudio_celt, vaudio_celt_high): CELT 0.11 in a
// custom mode, one frameSize-sample frame per fixed packetBytes packet, the
// same gate, loss and delay handling as roundTrip. Frames are
// frameSize / sampleRate long (23.2 ms for vaudio_celt), not 20 ms.
// options.modeRate, when given, is the rate the CELT mode is created with
// in place of sampleRate: vaudio_celt_high is the 44100 Hz mode fed 22050 Hz
// sound. Frame times, the bitrate and the delay stay at sampleRate.
// `head` is the decoded stream's first `lookahead` samples, which the trim
// drops from `samples`: the receiver's gain runs on the decoder's stream from
// its first sample, and TF2Audio.process puts them back in front for it (W3-19).
export async function celtRoundTrip(samples, sampleRate, options = {}) {
  const frameSize = options.frameSize ?? 512, packetBytes = options.packetBytes ?? 64;
  const { createCodec, version } = await loadCelt();
  const codec = await createCodec(options.modeRate ?? sampleRate, frameSize, { packetBytes, complexity: options.complexity ?? 10 });
  try {
    const lookahead = codec.lookahead;
    const frames = Math.ceil((samples.length + lookahead) / frameSize);
    const lossMask = options.makeLossMask ? options.makeLossMask(frames) : null;
    const output = new Float32Array(samples.length), head = new Float32Array(lookahead);
    const input = new Float32Array(frameSize);
    const gate = options.gate ? {
      threshold: 10 ** (Number(options.gate.thresholdDb) / 20),
      preroll: Math.max(0, Math.round(Number(options.gate.prerollFrames) || 0)),
      hold: Math.max(0, Math.round(Number(options.gate.holdFrames) || 0))
    } : null;
    const plan = gate ? gatePlan(samples, frames, frameSize, gate) : null;
    const frameLog = new Uint8Array(frames), frameBytes = new Uint16Array(frames);
    let encodedBytes = 0, lostFrames = 0, underrunFrames = 0, gatedFrames = 0, spurts = 0, coded = 0, open = false;
    for (let f = 0; f < frames; f++) {
      if (plan && !plan[f]) { gatedFrames++; open = false; continue; }
      if (!open) { if (spurts > 0) codec.restart(); spurts++; open = true; }
      input.fill(0);
      const start = f * frameSize;
      if (start < samples.length) input.set(samples.subarray(start, Math.min(samples.length, start + frameSize)));
      const packet = codec.encode(input);
      encodedBytes += packet.byteLength;
      frameBytes[f] = packet.byteLength;
      frameLog[f] = FRAME.celt;
      coded++;
      const miss = lossMask ? lossMask[f] : 0;
      if (miss === 1) { lostFrames++; frameLog[f] = FRAME.lost; }
      else if (miss === 2) { underrunFrames++; frameLog[f] = FRAME.late; }
      if (miss !== 2) {
        const decoded = miss === 1 ? codec.conceal() : codec.decode(packet);
        if (start < lookahead) head.set(decoded.subarray(0, Math.min(frameSize, lookahead - start)), start);
        const destStart = start - lookahead;
        const begin = Math.max(0, -destStart), end = Math.min(frameSize, samples.length - destStart);
        if (end > begin) output.set(decoded.subarray(begin, end), destStart + begin);
      }
      if ((f & 31) === 31) {
        options.onProgress?.((f + 1) / frames);
        if (options.yieldControl) await options.yieldControl();
      }
    }
    options.onProgress?.(1);
    const bitrate = Math.round(packetBytes * 8 * sampleRate / frameSize);
    return { samples: output, head, info: { backend: 'celt', version, runtime: 'celt-0.11', sampleRate, bitrate,
      application: 'celt', signal: 'auto', complexity: options.complexity ?? 10, vbr: false, dtx: false,
      frameSamples: frameSize, frameMs: 1000 * frameSize / sampleRate, packetBytes,
      ...(options.modeRate != null ? { modeRate: options.modeRate } : {}),
      lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames: 0, spurts,
      gate: gate ? Number(options.gate.thresholdDb) : null,
      prerollFrames: gate ? gate.preroll : 0, holdFrames: gate ? gate.hold : 0,
      encodedBytes, modes: { silk: 0, hybrid: 0, celt: coded }, plc: 'celt', frameLog, frameBytes } };
  } finally {
    codec.free();
  }
}

// One CELT frame at a time with celtRoundTrip's settings, for the live
// monitor; the same interface as createVoiceStream. options.modeRate as
// for celtRoundTrip.
export async function createCeltStream(sampleRate, options = {}) {
  const frameSize = options.frameSize ?? 512;
  const { createCodec, version } = await loadCelt();
  const codec = await createCodec(options.modeRate ?? sampleRate, frameSize, { packetBytes: options.packetBytes ?? 64, complexity: options.complexity ?? 10 });
  return {
    frameSize, version, lookahead: codec.lookahead,
    async restart() { codec.restart(); },
    encode(frame) { const packet = codec.encode(frame); return { bytes: packet.byteLength, mode: 'celt', dtx: false, packet }; },
    decode(packet) { return codec.decode(packet); },
    conceal() { return codec.conceal(); },
    free() { codec.free(); }
  };
}

// Source's vaudio_speex as the game's module runs it (docs/reports/
// W3-09-steam-voice.md, section 5; vendor/speex-1.0.2, W3-12a): Speex 1.0.2
// narrowband at quality 4 (the engine's 3), one 160-sample frame in 20 bytes,
// constant bit rate, enhancement on, complexity the library's default (2).
// The module does not resample: the codec, which believes it runs at 8000 Hz,
// is fed the engine's 11025 Hz sound, so a frame lasts 14.51 ms, 20 bytes a
// frame is 11.025 kbit/s and the band reaches 5.5 kHz. snd_bits picks nothing
// (the module has one table row for the engine's argument).
export const SPEEX_RATE = 11025;
// The encode and decode pair's delay, trimmed as roundTrip trims libopus's:
// 80 samples (7.26 ms at 11025 Hz), the encoder's 240-sample window less the
// frame. 1.0.2 has no look-ahead request; measured in W3-12a and pinned by
// tests/speex102.verify.mjs.
const SPEEX_DELAY = 80;

// Where the float sound becomes 16 bits for this codec: here, at the call to
// the module's encode, for every caller, and nowhere earlier. x * 32768
// rounded to nearest with ties to even, then clamped to -32768..32767 (the
// game's capture is 16-bit). On the way out the module's own conversion
// stands: the decoder's floats truncated toward zero to 16 bits with no clamp,
// so a value past full scale wraps to the other end; those samples go on as
// q / 32768.
export function speexInput(frame) {
  const out = new Int16Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i] * 32768, r = Math.round(v);
    const even = r - v === 0.5 && (r & 1) ? r - 1 : r;
    out[i] = Math.max(-32768, Math.min(32767, even));
  }
  return out;
}

// How many decoded samples wrapped: the float is past full scale and its
// 16-bit sample is on the other side of zero.
export function countWrapped(floats, samples) {
  let n = 0;
  for (let i = 0; i < floats.length; i++) {
    if ((floats[i] >= 32768 && samples[i] < 0) || (floats[i] <= -32769 && samples[i] >= 0)) n++;
  }
  return n;
}

// The codec and its frame wrapper, as the module holds them. reset() is a new
// talk spurt: the module's ResetState (request 26 on the encoder and the
// decoder), never a new codec. In 1.0.2 that reset is partial on the decoder
// (W3-12a, "For part b"), so a new codec would give other sound for the first
// frames of a spurt. The wrapper has no reset; what it kept was already sent,
// padded, so each spurt gets a new one on the same codec. A lost frame plays
// as zeros: the module has no concealment, and what the engine plays for a
// lost Speex packet was not read (decided 2026-11-10); the decoder is not
// called for it. `wrapped` counts the decoded samples that wrapped to the
// other side of zero.
async function openSpeex(sampleRate) {
  if (sampleRate !== SPEEX_RATE) throw new RangeError(`vaudio_speex runs on ${SPEEX_RATE} Hz sound, not ${sampleRate}`);
  const speex = await loadSpeex();
  const codec = await speex.createCodec();
  let wrapped = 0;
  const counted = {
    encode: (samples) => codec.encode(samples),
    decode(bytes) {
      const floats = codec.decodeFloats(bytes), samples = speex.toInt16(floats);
      wrapped += countWrapped(floats, samples);
      return samples;
    }
  };
  let framer = speex.createFramer(counted);
  return {
    frameSize: speex.frameSize, packetBytes: speex.packetBytes, version: speex.version, lookahead: SPEEX_DELAY,
    quality: 4, bitrate: Math.round(speex.packetBytes * 8 * SPEEX_RATE / speex.frameSize),
    // Requests 17 (complexity) and 1 (enhancement), read back from the codec.
    complexity: codec.encoderCtl(17), enhancement: codec.decoderCtl(1) === 1,
    get wrapped() { return wrapped; },
    reset() { codec.reset(); framer = speex.createFramer(counted); },
    encode(frame) {
      const packet = framer.compress(speexInput(frame));
      if (packet.length !== speex.packetBytes) throw new Error(`Expected one ${speex.packetBytes}-byte Speex frame, not ${packet.length} bytes`);
      return packet;
    },
    decode(packet) { return Float32Array.from(framer.decompress(packet), q => q / 32768); },
    lost() { return new Float32Array(speex.frameSize); },
    free() { codec.free(); }
  };
}

// The same gate, loss and delay handling as roundTrip, on 11025 Hz sound.
// Coded frames are logged as FRAME.speex, and counted in modes.speex. `head`
// as for celtRoundTrip: the decoded stream's first 80 samples.
export async function speexRoundTrip(samples, sampleRate, options = {}) {
  const codec = await openSpeex(sampleRate);
  try {
    const { frameSize, lookahead } = codec;
    const frames = Math.ceil((samples.length + lookahead) / frameSize);
    const lossMask = options.makeLossMask ? options.makeLossMask(frames) : null;
    const output = new Float32Array(samples.length), head = new Float32Array(lookahead);
    const input = new Float32Array(frameSize);
    const gate = options.gate ? {
      threshold: 10 ** (Number(options.gate.thresholdDb) / 20),
      preroll: Math.max(0, Math.round(Number(options.gate.prerollFrames) || 0)),
      hold: Math.max(0, Math.round(Number(options.gate.holdFrames) || 0))
    } : null;
    const plan = gate ? gatePlan(samples, frames, frameSize, gate) : null;
    const frameLog = new Uint8Array(frames), frameBytes = new Uint16Array(frames);
    let encodedBytes = 0, lostFrames = 0, underrunFrames = 0, gatedFrames = 0, spurts = 0, coded = 0, open = false;
    for (let f = 0; f < frames; f++) {
      if (plan && !plan[f]) { gatedFrames++; open = false; continue; }
      if (!open) { if (spurts > 0) codec.reset(); spurts++; open = true; }
      input.fill(0);
      const start = f * frameSize;
      if (start < samples.length) input.set(samples.subarray(start, Math.min(samples.length, start + frameSize)));
      const packet = codec.encode(input);
      encodedBytes += packet.byteLength;
      frameBytes[f] = packet.byteLength;
      frameLog[f] = FRAME.speex;
      coded++;
      options.onPacket?.(f, packet);
      const miss = lossMask ? lossMask[f] : 0;
      if (miss === 1) { lostFrames++; frameLog[f] = FRAME.lost; }
      else if (miss === 2) { underrunFrames++; frameLog[f] = FRAME.late; }
      if (miss !== 2) {
        const decoded = miss === 1 ? codec.lost() : codec.decode(packet);
        if (start < lookahead) head.set(decoded.subarray(0, Math.min(frameSize, lookahead - start)), start);
        const destStart = start - lookahead;
        const begin = Math.max(0, -destStart), end = Math.min(frameSize, samples.length - destStart);
        if (end > begin) output.set(decoded.subarray(begin, end), destStart + begin);
      }
      if ((f & 31) === 31) {
        options.onProgress?.((f + 1) / frames);
        if (options.yieldControl) await options.yieldControl();
      }
    }
    options.onProgress?.(1);
    return { samples: output, head, info: { ...speexInfo(codec, sampleRate),
      lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames: 0, spurts,
      gate: gate ? Number(options.gate.thresholdDb) : null,
      prerollFrames: gate ? gate.preroll : 0, holdFrames: gate ? gate.hold : 0,
      encodedBytes, modes: { silk: 0, hybrid: 0, celt: 0, speex: coded }, plc: 'zeros', wrappedSamples: codec.wrapped, frameLog, frameBytes } };
  } finally {
    codec.free();
  }
}

// The codec's settings as speexRoundTrip reports them (codecResultInfo in
// engine/render-stream.js gives the same for TF2Audio.createRender).
function speexInfo(voice, sampleRate) {
  return { backend: 'speex', version: voice.version, runtime: 'speex-1.0.2', sampleRate,
    bitrate: voice.bitrate, quality: voice.quality, application: 'speex', signal: 'auto', complexity: voice.complexity,
    vbr: false, dtx: false, enhancement: voice.enhancement, frameSamples: voice.frameSize, frameMs: 1000 * voice.frameSize / sampleRate,
    packetBytes: voice.packetBytes };
}

// One Speex frame at a time with speexRoundTrip's settings, for the live
// monitor and TF2Audio.createRender; the same interface as
// createVoiceStream. restart() is the codec's reset (above), not a new codec;
// conceal() is a lost frame, zeros, with the decoder not called.
export async function createSpeexStream(sampleRate) {
  const codec = await openSpeex(sampleRate);
  return {
    frameSize: codec.frameSize, version: codec.version, lookahead: codec.lookahead, quality: codec.quality, bitrate: codec.bitrate,
    complexity: codec.complexity, enhancement: codec.enhancement, packetBytes: codec.packetBytes,
    get wrapped() { return codec.wrapped; },
    async restart() { codec.reset(); },
    encode(frame) { const packet = codec.encode(frame); return { bytes: packet.byteLength, mode: 'speex', dtx: false, packet }; },
    decode(packet) { return codec.decode(packet); },
    conceal() { return codec.lost(); },
    free() { codec.free(); }
  };
}

// vaudio_miles: not a TF2 codec. A codec of the Source engine family that
// could be selected in the Source engines of 2006 and 2007; current TF2 ships
// its files and refuses the name. Its codec is Voxware's VR12
// (vendor/voxware-vr12, W3-20a) behind the module's wrapper: 360 samples in 12
// bytes, each sample cut to its top 8 bits before the codec (the module does
// that cut). Those engines capture, code, decode and play voice at 11025 Hz
// for every codec and resample nothing, so VR12, an 8000 Hz codec, codes
// 11025 Hz sound as if it were 8000 Hz: a frame lasts 32.65 ms and the wire
// carries 2940 bit/s (read from those engines' files). Unverified: nothing of
// a running engine with this codec has been recorded.
export const VR12_RATE = 11025;
// The encode and decode pair's delay, dropped as the other engine codecs'
// is. VR12 is a vocoder, so the delay shows only in the envelope; measured
// (W3-20b) on a steady voiced sound (harmonics 1/h at pitch P below 5 kHz,
// RMS -12 dBFS, 0.36 s) switched on after zeros at sample 3600 + 15 k, k 0
// to 23, for P 100, 140 and 190 Hz (72 runs, two codecs opened as below, no
// gain): the lag from -200 to 1200 that best lines up the 55-sample RMS
// envelopes of input and decoded sound. Median 304.5 (quartiles 274.75 and
// 348, range 200 to 411), rounded: 305 samples, 27.66 ms. tests/miles.verify.mjs
// measures it again.
const VR12_DELAY = 305;

// The two codec objects of the engines: the sender's encoder and the
// receiver's channel, each with both halves (decision 2 of W3-20b). Opening is
// the render's start, the key press and the channel's assignment: reset() on
// each (the wrapper's reset: twice over, 360 zeros encoded and their 12 bytes
// decoded, in that object) and a framer on each. reset() is a new talk spurt:
// both objects reset and a new framer on each, never a new codec (a stand-in
// for the receiver after a short pause: W3-20b, decision 3). A lost frame
// plays as zeros and the receiver's codec is not called (the engines never
// call it without data). `resets` counts the resets of each object.
async function openVr12(sampleRate) {
  if (sampleRate !== VR12_RATE) throw new RangeError(`vaudio_miles runs on ${VR12_RATE} Hz sound, not ${sampleRate}`);
  const vr12 = await loadVr12();
  const sender = await vr12.createCodec(), receiver = await vr12.createCodec();
  const resets = { sender: 0, receiver: 0 };
  let send, receive;
  function reset() {
    sender.reset(); resets.sender++;
    receiver.reset(); resets.receiver++;
    send = vr12.createFramer(sender);
    receive = vr12.createFramer(receiver);
  }
  reset();
  return {
    frameSize: vr12.frameSize, packetBytes: vr12.packetBytes, version: vr12.version, lookahead: VR12_DELAY,
    bitrate: Math.round(vr12.packetBytes * 8 * VR12_RATE / vr12.frameSize),
    get resets() { return { ...resets }; },
    reset,
    // 16 bits as for vaudio_speex (speexInput); the 8-bit cut is the module's.
    encode(frame) {
      const packet = send.compress(speexInput(frame));
      if (packet.length !== vr12.packetBytes) throw new Error(`Expected one ${vr12.packetBytes}-byte VR12 frame, not ${packet.length} bytes`);
      return packet;
    },
    decode(packet) { return Float32Array.from(receive.decompress(packet), q => q / 32768); },
    lost() { return new Float32Array(vr12.frameSize); },
    free() { sender.free(); receiver.free(); }
  };
}

// The same gate, loss and delay handling as speexRoundTrip, on 11025 Hz
// sound. Coded frames are logged as FRAME.vr12 and counted in modes.vr12.
// `head` as for celtRoundTrip: the decoded stream's first 305 samples.
export async function vr12RoundTrip(samples, sampleRate, options = {}) {
  const codec = await openVr12(sampleRate);
  try {
    const { frameSize, lookahead } = codec;
    const frames = Math.ceil((samples.length + lookahead) / frameSize);
    const lossMask = options.makeLossMask ? options.makeLossMask(frames) : null;
    const output = new Float32Array(samples.length), head = new Float32Array(lookahead);
    const input = new Float32Array(frameSize);
    const gate = options.gate ? {
      threshold: 10 ** (Number(options.gate.thresholdDb) / 20),
      preroll: Math.max(0, Math.round(Number(options.gate.prerollFrames) || 0)),
      hold: Math.max(0, Math.round(Number(options.gate.holdFrames) || 0))
    } : null;
    const plan = gate ? gatePlan(samples, frames, frameSize, gate) : null;
    const frameLog = new Uint8Array(frames), frameBytes = new Uint16Array(frames);
    let encodedBytes = 0, lostFrames = 0, underrunFrames = 0, gatedFrames = 0, spurts = 0, coded = 0, open = false;
    for (let f = 0; f < frames; f++) {
      if (plan && !plan[f]) { gatedFrames++; open = false; continue; }
      if (!open) { if (spurts > 0) codec.reset(); spurts++; open = true; }
      input.fill(0);
      const start = f * frameSize;
      if (start < samples.length) input.set(samples.subarray(start, Math.min(samples.length, start + frameSize)));
      const packet = codec.encode(input);
      encodedBytes += packet.byteLength;
      frameBytes[f] = packet.byteLength;
      frameLog[f] = FRAME.vr12;
      coded++;
      options.onPacket?.(f, packet);
      const miss = lossMask ? lossMask[f] : 0;
      if (miss === 1) { lostFrames++; frameLog[f] = FRAME.lost; }
      else if (miss === 2) { underrunFrames++; frameLog[f] = FRAME.late; }
      if (miss !== 2) {
        const decoded = miss === 1 ? codec.lost() : codec.decode(packet);
        if (start < lookahead) head.set(decoded.subarray(0, Math.min(frameSize, lookahead - start)), start);
        const destStart = start - lookahead;
        const begin = Math.max(0, -destStart), end = Math.min(frameSize, samples.length - destStart);
        if (end > begin) output.set(decoded.subarray(begin, end), destStart + begin);
      }
      if ((f & 31) === 31) {
        options.onProgress?.((f + 1) / frames);
        if (options.yieldControl) await options.yieldControl();
      }
    }
    options.onProgress?.(1);
    return { samples: output, head, info: { ...vr12Info(codec, sampleRate),
      lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames: 0, spurts,
      gate: gate ? Number(options.gate.thresholdDb) : null,
      prerollFrames: gate ? gate.preroll : 0, holdFrames: gate ? gate.hold : 0,
      encodedBytes, modes: { silk: 0, hybrid: 0, celt: 0, vr12: coded }, plc: 'zeros', resets: codec.resets, frameLog, frameBytes } };
  } finally {
    codec.free();
  }
}

// The codec's settings as vr12RoundTrip reports them (codecResultInfo in
// engine/render-stream.js gives the same for TF2Audio.createRender).
function vr12Info(voice, sampleRate) {
  return { backend: 'vr12', version: voice.version, runtime: 'voxware-vr12', sampleRate,
    bitrate: voice.bitrate, application: 'vr12', signal: 'auto',
    vbr: false, dtx: false, frameSamples: voice.frameSize, frameMs: 1000 * voice.frameSize / sampleRate,
    packetBytes: voice.packetBytes };
}

// One VR12 frame at a time with vr12RoundTrip's settings, for the live
// monitor and TF2Audio.createRender; the same interface as
// createSpeexStream. restart() resets both codec objects (above), never a new
// codec; conceal() is a lost frame, zeros, with the receiver not called.
export async function createVr12Stream(sampleRate) {
  const codec = await openVr12(sampleRate);
  return {
    frameSize: codec.frameSize, version: codec.version, lookahead: codec.lookahead, bitrate: codec.bitrate,
    packetBytes: codec.packetBytes,
    get resets() { return codec.resets; },
    async restart() { codec.reset(); },
    encode(frame) { const packet = codec.encode(frame); return { bytes: packet.byteLength, mode: 'vr12', dtx: false, packet }; },
    decode(packet) { return codec.decode(packet); },
    conceal() { return codec.lost(); },
    free() { codec.free(); }
  };
}

// A finished recording as Opus packets for a container (video.js): libopus
// 1.6.1, fullband music settings, 20 ms frames. The first preSkip samples
// of the decoded stream are the encoder's delay.
export async function encodeForContainer(samples, sampleRate, bitrate = 128000) {
  const { createEncoder } = await runtime('1.6.1');
  const encoder = await createEncoder({ sampleRate, channels: 1, frameSize: sampleRate / 50, application: APPLICATIONS.audio,
    signal: SIGNALS.auto, bitrate, complexity: 10, vbr: true, dtx: false, fec: false });
  try {
    const frameSize = sampleRate / 50, preSkip = encoder.getLookahead();
    const frames = Math.ceil((samples.length + preSkip) / frameSize), packets = [], frame = new Float32Array(frameSize);
    for (let f = 0; f < frames; f++) {
      frame.fill(0);
      const start = f * frameSize;
      if (start < samples.length) frame.set(samples.subarray(start, Math.min(samples.length, start + frameSize)));
      packets.push(encoder.encodeFloat(frame));
    }
    return { packets, preSkip, frameSize };
  } finally {
    encoder.free();
  }
}
