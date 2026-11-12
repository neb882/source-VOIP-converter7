/* TF2 Voice Emulator, engine/codec.js: what the renderers share about a profile and its codec: the gate's defaults
 * and threshold, the profile's filters, the frame codes, a demo's frame statistics, the call to the loader.
 *
 * One of the engine's files (the list and the load order are in audio.js's header). It takes what it needs from the
 * files before it as TF2Engine's parts and adds its own. */
(function (root) {
  'use strict';
  const E = root.TF2Engine;
  const { clamp, finiteOr, firwin2 } = E.dsp;

  const DEFAULT_SENDER_GATE = { thresholdDb: -39.5, prerollMs: 120, holdMs: 440 };

  const firCache = new Map();
  function profileEq(codec, stage = 'decoderEq') {
    const eq = codec[stage];
    if (!eq) return null;
    const key = `${codec.codecRate}:${eq.taps}:${eq.freqs}:${eq.gainsDb}`;
    if (!firCache.has(key)) firCache.set(key, firwin2(eq.taps, eq.freqs, eq.gainsDb, codec.codecRate));
    return firCache.get(key);
  }
  // A CELT profile's mode rate, as the option celtRoundTrip and
  // createCeltStream take and the field their info gains; nothing for a
  // profile without one (vaudio_celt_high is the 44100 Hz mode fed 22050 Hz
  // sound).
  function celtModeRate(codec) {
    return codec.modeRate != null ? { modeRate: codec.modeRate } : {};
  }

  // opus-codec.mjs FRAME: what happened to each codec frame.
  const FRAME_CODES = { gated: 0, silk: 1, hybrid: 2, celt: 3, dtx: 4, lost: 5, late: 6, speex: 7, vr12: 8 };

  // Frame statistics for voice that arrived already coded (opts.received),
  // in the shape roundTrip's info takes, for the codec lane and net_graph.
  function receivedCodecInfo(received, sampleRate) {
    const frameLog = Uint8Array.from(received.frameLog);
    const frameBytes = received.frameBytes ? Uint16Array.from(received.frameBytes) : new Uint16Array(frameLog.length);
    const count = (code) => frameLog.reduce((n, c) => n + (c === code ? 1 : 0), 0);
    const frameMs = finiteOr(received.frameMs, 20);
    return { backend: 'demo', version: received.version || 'as received', sampleRate, frameMs, framesPerPacket: 1,
      frameSamples: Math.round(sampleRate * frameMs / 1000), frames: frameLog.length,
      gatedFrames: count(FRAME_CODES.gated), dtxFrames: count(FRAME_CODES.dtx), lostFrames: count(FRAME_CODES.lost), underrunFrames: 0,
      spurts: finiteOr(received.spurts, 0), encodedBytes: frameBytes.reduce((n, b) => n + b, 0), gate: null,
      modes: { silk: count(FRAME_CODES.silk), hybrid: count(FRAME_CODES.hybrid), celt: count(FRAME_CODES.celt) },
      plc: 'opus', frameLog, frameBytes, lookahead: 0 };
  }

  // The threshold control's one reading (W3-11b), for the sender and the
  // frame gate alike: null, undefined and '' (or a string of spaces) give the
  // profile's own, `own`; a number, or a string that reads as one, is
  // clamped to -90..0 dBFS; anything else gives the profile's own.
  function gateThresholdDb(raw, own) {
    if (raw == null) return own;
    const typed = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    return Number.isFinite(typed) ? clamp(typed, -90, 0) : own;
  }

  // The codec module (opus-codec.mjs), by audio.js's loader: a script's import() is resolved against the
  // script's own address, and the module lies beside audio.js, not in this folder. audio.js loads after this
  // file and nothing calls this before a render.
  const loadOpusModule = () => E.audio.loadOpusModule();

  E.codec = Object.freeze({
    DEFAULT_SENDER_GATE, FRAME_CODES, celtModeRate, gateThresholdDb, loadOpusModule, profileEq, receivedCodecInfo
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
