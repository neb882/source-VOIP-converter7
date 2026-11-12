/* TF2 Voice Emulator — local DSP and codec orchestration.
 *
 * Sender:   mono capture (left channel by default) -> capture gain / int16
 *           clip -> resample to the codec rate -> optional capture filters
 *           -> Steam capture roll-off -> Steam voice gate (pre-roll, hold, one
 *           encoder per talk spurt) -> libopus 1.1.5 encode, as in Steam
 * Network:  `steam`: each sender message is one packet, lost whole by its
 *           own draw (BC-1); the other profiles: 20 ms packets grouped by
 *           net_split, lost in bursts (the earlier fit); late (jittered)
 *           frames on every profile; all seeded
 * Receiver: libopus 1.1.5 decode + native concealment and comfort noise ->
 *           engine voice rate -> Source-style auto-gain with int16 clamp ->
 *           the 44.1 kHz mixer as integers (the voice entered at 255/256,
 *           upsampled by two for the engine codecs; with a room entered
 *           twice, its room share through the room's slot, and under water
 *           the sum through the water preset) -> clip, volume and 16-bit
 *           rounding -> the listener's device rate by linear interpolation
 *           (48 kHz by default)
 *
 * The Steam profile, voice gate and receiver path are identified from 2026
 * voice_loopback recordings of music, speech and a calibrated test signal,
 * and from Steam's own voice packets in a SourceTV demo
 * (tests/REFERENCE_2026.md). The room is the engine's arithmetic as read
 * (room-dsp.js and its table room-presets.js, order W3-17), loaded before
 * this file as the globals TF2Room and TF2_ROOM_PRESETS; a render with no
 * room and not under water does not need them.
 * Same decoded PCM + settings + pinned runtime gives repeatable output.
 *
 * TF2Audio.process(buffer, opts) -> { samples, sampleRate, blob, codecInfo }
 * TF2Audio.createRender(source, opts) -> the same render, a chunk at a time
 * TF2Audio.createGain({ avgGain, maxGain, scale }) -> one channel's auto-gain
 * TF2Audio.encodeWav(samples, rate) -> 16-bit mono WAV
 *
 * The engine's files, in load order. Each is one function that adds its part
 * to TF2Engine (engine/dsp.js makes it); this file loads after them, takes
 * from the parts what it needs and builds TF2Audio:
 * - engine/dsp.js: signal arithmetic with nothing of the game in it: the
 *   seeded draw, the yield, the FFT, the downmix, the resampler, the filters,
 *   the clip, 16-bit rounding and the WAV, each whole and a piece at a time.
 * - engine/gain.js: the receiver's gain.
 * - engine/mix.js: the mixer and the output stage.
 * - engine/network.js: loss and late frames: the retiming, the loss masks,
 *   the steam profile's loss by message.
 * - engine/codec.js: what the renderers share about a profile and its codec:
 *   the gate's defaults and threshold, the profile's filters, the frame
 *   codes, a demo's frame statistics, the call to the loader.
 * - engine/room.js: the room's settings and what the mix is told.
 * - engine/steam.js: the steam profile: its constants, its capture, its
 *   sender's options, its timeline, its codec information.
 */

(function () {
  'use strict';
  const E = (typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis).TF2Engine;
  const { INT16_FULL_SCALE, applyBiquad, applyFirZeroPhase, biquadCoefs, biquadStage, bufferToMono, clamp,
    dropStage, encodeWav, finiteOr, firStage, firwin2, hardClip, joinSamples, microYield, mulberry32,
    resampleLinear, resampleSinc, sampleStage, sincLength, sincStage, sincWait, streamBiquad, streamFir,
    streamResampleSinc, toInt16 } = E.dsp;
  const { GAIN_BLOCK, createGain, decodedFromFrames, gainLead, receiverAutoGain, streamAutoGain } = E.gain;
  const { MIX_BLOCK, MIX_RATE, createDeviceStage, createMixStage, createOutStage, createOutputStage, deviceRateOf,
    joinInts, mixClip, mixDevicePosition, mixEntry, mixOut, mixToFloat, mixUpsample2 } = E.mix;
  const { buildLossMask, retimeSpurts, steamLoser, steamMessageLoss, streamLossMask } = E.network;
  const { DEFAULT_SENDER_GATE, FRAME_CODES, celtModeRate, gateThresholdDb, profileEq, receivedCodecInfo } = E.codec;
  const { resolveRoom, roomModule, roomPreset, tailAtDevice } = E.room;
  const { STEAM_FRAME, STEAM_RATE, STEAM_VOICE_RATE, steamCapture, steamCodecInfo, steamFits, steamGiveOut,
    steamModules, steamReach, steamSenderOptions, steamTimeline } = E.steam;

  // The same pinned codec runs in browsers, workers, and the Node tests.
  // Tests inject the module because their DSP sandbox has no import loader.
  let opusModulePromise;
  function loadOpusModule() {
    if (typeof TF2Opus !== 'undefined') return Promise.resolve(TF2Opus);
    if (!opusModulePromise) {
      opusModulePromise = import('./opus-codec.mjs').catch(error => {
        opusModulePromise = null;
        throw new Error('The bundled Opus codec could not load. Serve the complete folder over HTTP(S). ' +
          error.message);
      });
    }
    return opusModulePromise;
  }

  // Compatibility helper for external callers; no browser-dependent fallback.
  async function realOpusRoundTrip(samples, rate, bitrate, options = {}) {
    const opus = await loadOpusModule();
    return (await opus.roundTrip(samples, rate, bitrate, options)).samples;
  }
  E.audio = Object.freeze({ loadOpusModule });

  /* ------------------------------------------------------------------ */
  /* The stages a render keeps (W4-01b)                                 */
  /*                                                                    */
  /* process() can keep two results in an object its caller holds for   */
  /* one source (opts.stages), named by opts.sourceKey, a value the      */
  /* caller changes whenever the source's samples change:               */
  /*   A, the capture signal at the codec's rate (after stage 2);       */
  /*   B, the codec stage's result (after stage 3): for `steam` the     */
  /*      sender's messages, their decoded packets and what codecInfo   */
  /*      is made from; for the other profiles the decoded samples at   */
  /*      the codec's rate (after the decoder's filter, where a profile */
  /*      has one), the samples the delay's trim dropped, and their     */
  /*      codecInfo.                                                    */
  /* Each is taken when its key is the render's. A's key is the source  */
  /* and every option not on AFTER_A_OPTIONS; B's is A's and every      */
  /* option not on AFTER_B_OPTIONS. So an option nobody has listed is   */
  /* in both keys: forgetting one costs a reuse, never a stale render.  */
  /* Nothing taken is written to: the stages after a place copy what    */
  /* they change. One A and one B are held; a render that makes another */
  /* replaces it.                                                       */
  /* ------------------------------------------------------------------ */

  // process() reads every option once, at its entry (readOptions): a render
  // is the render of the options as they were when it was called, whatever
  // is done to the object while it runs. The lists below say where each is
  // first used.
  // The options process() uses only after B, each first used after the
  // codec stage (the receiver's gain, re-timing, the room, volume, the
  // device). An option used at or before B must not be on this list.
  const AFTER_B_OPTIONS = ['voiceScale', 'agc', 'avgGain', 'maxGain', 'retime', 'volume',
    'room', 'underwater', 'listenerPos', 'dspRoom', 'customEnv', 'deviceRate'];
  // The options used only after A: those, and the sender's and the
  // network's, first used in the codec stage. An option used at or before A
  // (the codec, the capture's channel, gain and filters, the codec switch,
  // a demo's received voice) must not be on this list.
  const AFTER_A_OPTIONS = [...AFTER_B_OPTIONS, 'gate', 'gateThresholdDb', 'steamUptime', 'bits', 'lossPct', 'jitterMs',
    'frameMs', 'seed'];
  // Function-valued options that only observe, and observe nothing at or
  // before B: progress, the gain's output, the mixer's blocks. Any other
  // option whose value is a function (onDecoded and onResampled watch the
  // decoded packets, loseMessage decides which are lost) makes the render
  // keep and take nothing, so a caller that watches or steers an early
  // stage has that stage run. An observer must never be handed an object a
  // kept stage holds: it could write into it.
  const STAGE_OBSERVERS = ['onProgress', 'onGain', 'onMixBlock'];
  // The keeping's own options, in neither key.
  const STAGE_CONTROLS = ['stages', 'sourceKey', 'signal'];
  // Every option process() reads, in readOptions: the codec, the capture's,
  // the sender's and the network's, the tests' hooks into the codec stage,
  // and those used only after B, the observers and the controls.
  const READ_OPTIONS = ['codec', 'enableWarble', 'received', 'micGain', 'captureChannel', 'hp', 'lp',
    'bits', 'lossPct', 'jitterMs', 'gate', 'gateThresholdDb', 'steamUptime', 'seed', 'frameMs',
    'loseMessage', 'swrKernel', 'onDecoded', 'onResampled', ...AFTER_B_OPTIONS, ...STAGE_OBSERVERS, ...STAGE_CONTROLS];

  // The options as process() reads them, each read once (`o`, a record of
  // its own) and converted as the stages use it, in the order the engine
  // read them before W4-01b (so of two invalid options the same one
  // throws); with makeRoom, the room is made as the seed is read, first.
  // `used` is what the stages up to B use of each option they read: the
  // keys are made from it (keysOf), so two values the engine reads alike
  // share a key and two it reads differently do not. The hooks into the
  // codec stage, the steam sender's uptime and the resampler's kernel are
  // used as they are given.
  function readOptions(opts, makeRoom = false) {
    const o = {};
    for (const name of READ_OPTIONS) o[name] = opts[name];
    const codecKey = Object.hasOwn(CODEC_PROFILES, o.codec) ? o.codec : 'steam';
    const codec = CODEC_PROFILES[codecKey];
    const engine = VOICE_ENGINE;
    const seedNumber = finiteOr(o.seed, 0xC0FFEE), seed = seedNumber >>> 0;
    // The room, made for the render's first sample (null: none, nothing of
    // it runs).
    const room = makeRoom ? resolveRoom(o, seed) : null;
    const codecRate = codec.codecRate;
    const micGain = clamp(finiteOr(o.micGain, 1), 0, 20);
    const hp = clamp(finiteOr(o.hp, 0), 0, codecRate * 0.45);
    const lp = clamp(finiteOr(o.lp, codecRate / 2), 100, codecRate / 2);
    const bits = clamp(finiteOr(o.bits, 16), 2, 32);
    const lossPct = clamp(finiteOr(o.lossPct, 0), 0, 100);
    const jitterMs = clamp(finiteOr(o.jitterMs, 0), 0, 500);
    const enableCodec = o.enableWarble !== false;
    const autoGain = o.agc !== false;
    const captureChannel = ['left', 'right', 'mix'].includes(o.captureChannel) ? o.captureChannel : 'left';
    const gateSpec = codec.senderGate || DEFAULT_SENDER_GATE;
    const gateOn = o.gate == null ? !!codec.senderGate : !!o.gate;
    const gateDb = gateThresholdDb(o.gateThresholdDb, gateSpec.thresholdDb);
    const avgGain = clamp(finiteOr(o.avgGain, engine.autoGain.avgGain), 0, 2);
    const maxGain = clamp(finiteOr(o.maxGain, engine.autoGain.maxGain), 1, 100);
    const voiceScale = clamp(finiteOr(o.voiceScale, 1), 0, 4);
    const volume = clamp(finiteOr(o.volume, engine.volume), 0, 1);
    const received = o.received && o.received.frameLog ? o.received : null;
    const deviceRate = deviceRateOf(o.deviceRate);
    const framesPerPacket = clamp(Math.round(finiteOr(o.frameMs, 20) / 20), 1, 10);
    // A demo's frames, as codecInfo gives them (read here, not in the codec
    // stage).
    const receivedInfo = received ? receivedCodecInfo(received, codecRate) : null;
    const used = {
      codec: Object.keys(CODEC_PROFILES).find((name) => CODEC_PROFILES[name] === codec),
      enableWarble: enableCodec, received: !!received, micGain, captureChannel, hp, lp,
      bits, lossPct, jitterMs, gate: gateOn, gateThresholdDb: gateThresholdDb(o.gateThresholdDb, null),
      steamUptime: o.steamUptime == null ? null : o.steamUptime, seed, frameMs: framesPerPacket,
      loseMessage: o.loseMessage, swrKernel: o.swrKernel, onDecoded: o.onDecoded, onResampled: o.onResampled
    };
    return { o, codecKey, codec, seedNumber, seed, room, micGain, captureChannel, hp, lp, bits, lossPct, jitterMs,
      enableCodec, autoGain, gateSpec, gateOn, gateDb, avgGain, maxGain, voiceScale, volume, received, receivedInfo,
      deviceRate, framesPerPacket, used };
  }

  // A value as text for a key: two values give the same text only when they
  // are the same value. Each part starts with its type; a number is as
  // String() writes it (NaN, Infinity and -0 apart), a string quoted, a
  // typed array by its type and its elements, an array or a plain object by
  // its own keys in order (so a hole, an undefined member and an absent one
  // differ). null for anything else (a function, a symbol, a DataView, an
  // instance of a class, a cycle): the render then keeps nothing.
  function keyText(value, open = new Set()) {
    if (value === undefined) return 'u';
    if (value === null) return 'n';
    switch (typeof value) {
      case 'boolean': return value ? 'T' : 'F';
      case 'number': return Object.is(value, -0) ? 'd-0' : `d${value}`;
      case 'bigint': return `i${value}`;
      case 'string': return `s${JSON.stringify(value)}`;
      case 'object': break;
      default: return null;
    }
    const tag = Object.prototype.toString.call(value);
    if (ArrayBuffer.isView(value)) {
      if (tag === '[object DataView]') return null;
      const parts = new Array(value.length);
      for (let i = 0; i < value.length; i++) parts[i] = keyText(value[i]);
      return `t${tag.slice(8, -1)}[${parts.join(',')}]`;
    }
    const proto = Object.getPrototypeOf(value);
    const array = Array.isArray(value);
    if (open.has(value) || !(array || (tag === '[object Object]' && (proto === null || Object.getPrototypeOf(proto) === null)))) return null;
    open.add(value);
    const parts = [];
    for (const name of Object.keys(value).sort()) {
      const text = keyText(value[name], open);
      if (text === null) return null;
      parts.push(`${JSON.stringify(name)}:${text}`);
    }
    open.delete(value);
    return `${array ? `a${value.length}` : 'o'}{${parts.join(',')}}`;
  }

  // The keys of a render's two places, { a, b }, from its read options `r`
  // (readOptions), or null when it may keep nothing (no sourceKey, a
  // function that is not an observer, a value with no key). A's names the
  // source by sourceKey and its shape. Each option the stages up to B use
  // is in it as they use it (r.used); an option process() does not read is
  // in both keys as it is given, so that one read and not listed in
  // readOptions costs a reuse, never a stale render.
  function keysOf(audioBuffer, r, opts) {
    const source = r.o.sourceKey == null ? null : keyText(r.o.sourceKey);
    if (source === null) return null;
    let a = `source ${source} ${audioBuffer.sampleRate} Hz ${audioBuffer.length} x ${audioBuffer.numberOfChannels}`, b = '';
    const values = new Map(Object.entries(r.used));
    for (const name in opts) if (!READ_OPTIONS.includes(name)) values.set(name, opts[name]);
    for (const name of [...values.keys()].sort()) {
      const value = values.get(name);
      if (typeof value === 'function') return null;
      const text = keyText(value);
      if (text === null) return null;
      if (!AFTER_A_OPTIONS.includes(name)) a += `; ${JSON.stringify(name)} ${text}`;
      else if (!AFTER_B_OPTIONS.includes(name)) b += `; ${JSON.stringify(name)} ${text}`;
    }
    return { a, b: `${a} |${b}` };
  }

  // TF2Audio.stageKeys(source, opts): the keys a render with these options
  // keeps its places under, or null (the tests read them).
  function stageKeys(audioBuffer, opts = {}) {
    try { return keysOf(audioBuffer, readOptions(opts), opts); } catch (e) { return null; }
  }

  // What the engine itself kept: the counts it made and each place's
  // record. A render takes only these, and keeps nothing in a stages
  // object whose counts it did not make.
  const ENGINE_COUNTS = new WeakSet(), ENGINE_HELD = new WeakSet();
  // A stages object a render can keep in: an object that can take new
  // members, whose counts (if any) the engine made. Anything else (frozen,
  // sealed, counts of the caller's own) keeps nothing, and the render is
  // made from the start.
  function usableStages(stages) {
    if (!stages || typeof stages !== 'object' || !Object.isExtensible(stages)) return false;
    const counts = stages.counts;
    return counts === undefined || ENGINE_COUNTS.has(counts);
  }
  // The value held at `place` for `key`, or undefined.
  function heldValue(stages, place, key) {
    const held = stages[place];
    return ENGINE_HELD.has(held) && held.key === key ? held : undefined;
  }

  // What a render takes from opts.stages and keeps there: { take(place),
  // keep(place, value) } for place 'a' or 'b', or null when it may keep
  // nothing. take() gives the value held for this render's key, or null,
  // and lets go of one held for another key (the render is about to make
  // its own). stages.counts: { a: { kept, reused }, b: { kept, reused } },
  // how often each place was kept and taken (the tests read it). A stages
  // object that fails as it is used (a member the caller made read-only, a
  // getter that throws) takes and keeps nothing more; the render goes on.
  function stagePlan(audioBuffer, r, opts) {
    const stages = r.o.stages;
    let keys, counts;
    try {
      if (!usableStages(stages)) return null;
      keys = keysOf(audioBuffer, r, opts);
      if (!keys) return null;
      counts = stages.counts;
      if (counts === undefined) {
        counts = { a: { kept: 0, reused: 0 }, b: { kept: 0, reused: 0 } };
        ENGINE_COUNTS.add(counts);
        stages.counts = counts;
      }
    } catch (e) { return null; }
    return {
      take(place) {
        try {
          const held = heldValue(stages, place, keys[place]);
          if (held) { counts[place].reused++; return held.value; }
          if (stages[place] !== undefined) delete stages[place];
        } catch (e) { /* the caller's stages object: take nothing */ }
        return null;
      },
      keep(place, value) {
        try {
          const held = { key: keys[place], value };
          ENGINE_HELD.add(held);
          stages[place] = held;
          counts[place].kept++;
        } catch (e) { /* likewise: keep nothing */ }
      }
    };
  }

  // TF2Audio.stagesHold(source, opts): which place of opts.stages a render
  // with these options would start from, 'b', 'a' or null, without
  // rendering (the worker leaves out the first seconds when B is held).
  function stagesHold(audioBuffer, opts = {}) {
    try {
      const r = readOptions(opts), stages = r.o.stages;
      const keys = usableStages(stages) ? keysOf(audioBuffer, r, opts) : null;
      if (!keys) return null;
      if (r.enableCodec && !r.received && heldValue(stages, 'b', keys.b)) return 'b';
      return heldValue(stages, 'a', keys.a) ? 'a' : null;
    } catch (e) { return null; }
  }

  // A copy of a codecInfo held in B, for each render made from it: its
  // arrays and objects are the render's own (re-timing writes into the frame
  // log, and a caller may write into what it is given).
  function copyInfo(value) {
    if (ArrayBuffer.isView(value)) return value.slice();
    if (Array.isArray(value)) return value.map(copyInfo);
    if (value && typeof value === 'object') {
      const out = {};
      for (const name of Object.keys(value)) out[name] = copyInfo(value[name]);
      return out;
    }
    return value;
  }

  // TF2Audio.previewAllowed(opts): whether a render of a source's first 15 s
  // is, over its first 14 s, the render of the whole source, sample for
  // sample (W4-01b, step 3), as tests/stages.verify.mjs shows for every
  // profile at these settings. Not for a demo's voice, with loss or jitter,
  // with talk-spurt re-timing, with a room that runs or under water (none
  // of them was shown), nor at a device rate the test does not cover.
  const PREVIEW_DEVICE_RATES = [44100, 48000];
  function previewAllowed(opts = {}) {
    if (opts.received || opts.retime || typeof opts.loseMessage === 'function') return false;
    if (clamp(finiteOr(opts.lossPct, 0), 0, 100) > 0 || clamp(finiteOr(opts.jitterMs, 0), 0, 500) > 0) return false;
    let room;
    try { room = roomPreset(opts); } catch (e) { return false; }
    if (room.preset !== null || room.water) return false;
    return PREVIEW_DEVICE_RATES.includes(deviceRateOf(opts.deviceRate));
  }

  // A render stopped by its caller ends with this error (opts.signal).
  function abortError() {
    const error = new Error('The render was cancelled.');
    error.name = 'AbortError';
    return error;
  }
  // process()'s yield: microYield, with a stop asked for by opts.signal
  // (anything with `aborted`: an AbortSignal in the worker) seen before and
  // after it. The codec stages are given it as their yieldControl.
  function pauseFor(signal) {
    const stop = () => { if (signal && signal.aborted) throw abortError(); };
    return async () => { stop(); await microYield(); stop(); };
  }

  /**
   * Render a source AudioBuffer (or any { sampleRate, length,
   * numberOfChannels, getChannelData }) through the TF2 voice pipeline.
   *
   * opts = {
   *   codec:        key of CODEC_PROFILES                               ['steam']
   *   room:         the listener's room (W3-17c; resolveRoom): null,
   *                 { preset: n } (a preset of the table, 2 to 29),
   *                 { auto: a key of TF2Room.ROOM_CASES or ROOM_PLACES, or
   *                 measures } (the automatic room), or { custom: {
   *                 duration, decay, mix } } (the app's own room)     [none]
   *   underwater:   the listener under water: the mix's sum through the
   *                 water preset (14)                               [false]
   *   listenerPos, dspRoom, customEnv: the page's older room options, read
   *                 when `room` is not given: a key of LISTENER_POSITIONS
   *                 gives its preset (`water`: under water, no room), else
   *                 dspRoom gives that preset (99: the custom room, its
   *                 knobs customEnv)
   *   captureChannel: 'left' | 'right' | 'mix' for stereo input    ['left']
   *   micGain:      sender capture gain; > 1 clips the int16 capture   [1]
   *   hp / lp:      optional sender filters in Hz (off: hp <= 10,
   *                 lp >= 0.45 x codec rate)                           [off]
   *   bits:         bitrate scale; 16 = profile bitrate                 [16]
   *   lossPct:      % of voice packets lost: on `steam` the share of the
   *                 sender's messages, each lost whole by its own draw
   *                 (steamMessageLoss); on the other profiles the share of
   *                 voice frames, in bursts of ~2.2 frames                [0]
   *   loseMessage:  `steam` only, tests and replays (the page never sends
   *                 it): (index, message) => boolean, in place of the draw,
   *                 called once per sender message in order          [none]
   *   frameMs:      net_split packet duration (whole 20 ms frames); on
   *                 `steam` it no longer sets what a lost packet holds  [20]
   *   jitterMs:     net_fakejitter in ms: late frames, measured          [0]
   *   enableWarble: false bypasses the codec (filters/engine remain)    [true]
   *   gate:         Steam sender voice gate; null = profile default     [null]
   *   gateThresholdDb: gate opening level, frame RMS in dBFS [profile/-39.5];
   *                 for `steam` (senderGate.rule 'steam') the mean of |x|
   *                 over a capture chunk in dBFS [Steam's own, -40]; null,
   *                 undefined and '' are the profile's own (gateThresholdDb())
   *   steamUptime:  `steam` only: seconds the sender's Steam had been running,
   *                 0 to 4,000,000; its float clock sets the hold's real
   *                 length (W3-16). null for the sender's own   [777600]
   *   onDecoded, onResampled, swrKernel: tests only, `steam` only: each
   *                 message's 16-bit samples as given to the resampler;
   *                 each packet() result; a resampler kernel in place of
   *                 the module's default
   *   onGain:       tests only, every profile: the voice-rate signal after
   *                 the gain (the auto-gain's, or voice_scale and the clip
   *                 with agc off), as it reaches the mixer
   *   onMixBlock:   tests only: (start, length, mix) for each 512-sample
   *                 block of the 44100 Hz mix and a short last one, mix a
   *                 copy of the block's sum before the clip (an Int32Array;
   *                 with a room, the room path's output, its tail included)
   *   agc:          receiver auto-gain (false = unity gain)             [true]
   *   retime:       TF2's early talk-spurt starts (finding 19)          [false]
   *   avgGain:      voice_avggain, mean (0) to peak (1) normalization   [0.5]
   *   maxGain:      voice_maxgain gain cap                              [10]
   *   voiceScale:   voice_scale, applied inside the auto-gain           [1]
   *   volume:       the game's `volume`, after the mixer's clip         [1]
   *   deviceRate:   snd_device_rate, the app's own (not a TF2 variable):
   *                 the listener's sound device, an integer from 44100 to
   *                 192000; anything else is the default. The output is
   *                 at this rate. Only 48000 is measured.           [48000]
   *   seed:         PRNG seed for the loss pattern / crackle        [0xC0FFEE]
   *   received:     the source is voice as the game received it, already
   *                 through a sender and the codec (a demo's packets,
   *                 demo.js): { frameLog, frameBytes, frameMs, spurts,
   *                 concealed, version }. Only the receiver runs; sender,
   *                 gate, codec and network settings are ignored.      [null]
   *   stages:       W4-01b: an object the caller keeps between renders of
   *                 one source. The render keeps A (the capture at the
   *                 codec's rate) and B (the codec stage's result) in it,
   *                 and starts from either when the options used before it
   *                 are the same (stagePlan; the key lists AFTER_A_OPTIONS
   *                 and AFTER_B_OPTIONS). The samples are the same as
   *                 without it. An object that cannot take new members, or
   *                 whose `counts` the engine did not make, keeps nothing
   *                                                                  [none]
   *   sourceKey:    with stages: a value the caller changes whenever the
   *                 source's samples change; with none nothing is kept
   *                                                                  [none]
   *   signal:       { aborted } (the worker's AbortSignal): looked at at
   *                 each of the render's yields; once true, the render ends
   *                 with an error named AbortError                   [none]
   * }
   * Each option is read once, when process() is called (readOptions): a
   * change to the object while the render runs does not reach it.
   *
   * Resolves to { samples: Float32Array, sampleRate, blob, codecInfo }:
   * samples at sampleRate, the device's rate; each a whole 16-bit value
   * over 32768, which the WAV holds exactly; as long as the source at that
   * rate, round(length x deviceRate / sourceRate), plus a room's tail at
   * that rate, round(tail x deviceRate / 44100). With a room or under water
   * codecInfo has one key more, `room`: the preset's number, or the case's
   * key (null for measures, which are then given) with the shape, classes,
   * pair and copy of the automatic room, or the custom room's knobs; the
   * shares of 256; underwater; tail, the tail's length in mixer samples.
   */
  async function process(audioBuffer, opts = {}) {
    if (!audioBuffer || typeof audioBuffer.getChannelData !== 'function' ||
        !Number.isFinite(audioBuffer.sampleRate) || audioBuffer.sampleRate <= 0 ||
        !Number.isInteger(audioBuffer.length) || audioBuffer.length < 0 ||
        !Number.isInteger(audioBuffer.numberOfChannels) || audioBuffer.numberOfChannels < 1) {
      throw new TypeError('TF2Audio.process requires a valid AudioBuffer-like source.');
    }
    // Every option, read once, now (readOptions); the room made for the
    // render's first sample (null: none, nothing of it runs).
    const r = readOptions(opts, true);
    const { o, codecKey, codec, room } = r;
    const report = (f) => { if (typeof o.onProgress === 'function') o.onProgress(f); };
    const pause = pauseFor(o.signal);
    // What the caller's stages hold for this render and where it keeps what
    // it makes (W4-01b; null: it keeps and takes nothing).
    const kept = stagePlan(audioBuffer, r, opts);

    // Used at or before A: the codec, the codec switch, a demo's voice; the
    // capture's settings in stages 1 and 2.
    const codecRate    = codec.codecRate;
    const { enableCodec, received } = r;
    const srcRate      = audioBuffer.sampleRate;
    const frameMs      = 20;
    // The `steam` profile: Steam's sender and decoder, through to the voice
    // rate (stage 4's gain included), on the source's timeline.
    const steamPath = enableCodec && !received && codec.senderGate?.rule === 'steam';
    // B is kept where a codec runs: not for a demo's voice, not with the
    // codec skipped.
    const coded = enableCodec && !received;

    // B, when the stages hold it for these settings: stages 1 to 3 are done.
    let b = kept && coded ? kept.take('b') : null;
    if (b) report(steamPath ? 0.6 : 0.72);
    else {
      let samples, sourceLength;
      const a = kept ? kept.take('a') : null;
      if (a) ({ samples, sourceLength } = a);
      else {
        /* ---- 1) Sender capture: downmix, capture gain, int16 clip ---- */
        const { micGain, captureChannel } = r;
        samples = bufferToMono(audioBuffer, captureChannel);
        if (!samples.every(Number.isFinite)) throw new TypeError('Source PCM contains a non-finite sample.');
        // The source's length, for the output's (the source's duration at
        // the device's rate).
        sourceLength = samples.length;
        if (micGain !== 1 && !received) {
          for (let i = 0; i < samples.length; i++) samples[i] *= micGain;
        }
        samples = hardClip(samples, INT16_FULL_SCALE);
        report(0.05);
        await pause();

        /* ---- 2) Resample to the codec rate; optional capture filters ---- */
        const { hp, lp } = r;
        samples = resampleSinc(samples, srcRate, codecRate);
        if (hp > 10 && !received) samples = applyBiquad(samples, biquadCoefs('highpass', codecRate, hp, 0.707));
        if (lp < codecRate * 0.45 && !received) {
          samples = applyBiquad(samples, biquadCoefs('lowpass', codecRate, lp, 0.707));
          samples = applyBiquad(samples, biquadCoefs('lowpass', codecRate, lp, 0.707));
        }
        const captureEq = enableCodec && !received ? profileEq(codec, 'captureEq') : null;
        if (captureEq) samples = applyFirZeroPhase(samples, captureEq);
        // KEPT PLACE A (W4-01b): the capture signal at the codec's rate and
        // the source's length. Every option used above is in A's key, as it
        // is used (readOptions, `used`): none of them may be put on
        // AFTER_A_OPTIONS. Nothing below writes into
        // these samples (the codec stages read them; stage 4 resamples them
        // into a new array).
        if (kept) kept.keep('a', { samples, sourceLength });
      }
      report(0.2);
      await pause();

      /* ---- 3) Encode -> lose packets -> decode / conceal ---- */
      // Used from here on: the sender's and the network's settings
      // (AFTER_A_OPTIONS less AFTER_B_OPTIONS).
      const { bits, lossPct, jitterMs, gateSpec, gateOn, gateDb, seed, framesPerPacket } = r;
      const rand         = mulberry32(seed);
      if (received) b = { kind: 'received', info: r.receivedInfo, samples, sourceLength };
      else if (steamPath) {
        const { sender: SteamSender } = steamModules();
        if (codecRate !== STEAM_RATE || codec.voiceRate !== STEAM_VOICE_RATE || codec.decoderEq) {
          throw new Error('The steam rule runs at 24000 Hz into a 44100 Hz voice rate, with no decoder EQ.');
        }
        const opus = await loadOpusModule();
        const bitrate = Math.max(6000, Math.round(codec.bitrate * bits / 16));
        const settings = steamSenderOptions(o, gateOn, seed);
        const sender = SteamSender.createSender(settings.sender);
        const messages = sender.push(steamCapture(samples));
        for (const m of sender.finish()) messages.push(m);
        // Loss takes whole messages (BC-1), one draw each; the per-frame mask
        // keeps only the late frames (jitter), drawn as before with a loss of 0.
        const loser = steamLoser(o, lossPct, seed);
        const trip = await opus.steamRoundTrip(messages, bitrate, {
          application: codec.application, signal: codec.signal, runtime: codec.encoder?.runtime,
          complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx,
          makeLossMask: count => buildLossMask(count, framesPerPacket, 0, rand, jitterMs),
          lose: loser.lose,
          yieldControl: pause,
          onProgress: f => report(0.2 + 0.4 * f)
        });
        b = { kind: 'steam', messages, trip, sender, settings, bitrate, lossSet: loser.set, framesPerPacket,
          codecLength: samples.length, sourceLength };
      } else if (enableCodec) {
        const opus = await loadOpusModule();
        const bitrate = Math.max(6000, Math.round(codec.bitrate * bits / 16));
        // The codec's own frame length: 20 ms for Opus, frameSize for CELT, Speex and VR12.
        const codecFrameMs = codec.frameSize ? 1000 * codec.frameSize / codecRate : frameMs;
        const common = {
          gate: gateOn ? { thresholdDb: gateDb, prerollFrames: Math.round(gateSpec.prerollMs / codecFrameMs),
            holdFrames: Math.round(gateSpec.holdMs / codecFrameMs) } : null,
          makeLossMask: count => buildLossMask(count, framesPerPacket, lossPct, rand, jitterMs),
          yieldControl: pause,
          onProgress: f => report(0.2 + 0.5 * f)
        };
        const result = codec.engine === 'celt011'
          ? await opus.celtRoundTrip(samples, codecRate, { ...common, frameSize: codec.frameSize, complexity: codec.complexity,
            packetBytes: Math.max(8, Math.round(codec.packetBytes * bits / 16)), ...celtModeRate(codec) })
          : codec.engine === 'speex'
          ? await opus.speexRoundTrip(samples, codecRate, common)
          : codec.engine === 'vr12'
          ? await opus.vr12RoundTrip(samples, codecRate, common)
          : await opus.roundTrip(samples, codecRate, bitrate, { ...common,
            application: codec.application, signal: codec.signal,
            runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
        const eq = profileEq(codec);
        // `head`: the engine codecs' decoded samples the delay's trim dropped,
        // for the gain to run on first (gainLead, after B).
        b = { kind: 'frames', samples: eq ? applyFirZeroPhase(result.samples, eq) : result.samples,
          info: { ...result.info, framesPerPacket }, head: result.head, gateOn, sourceLength };
      } else b = { kind: 'bypass', info: { backend: 'bypass', sampleRate: codecRate, frameMs }, samples, sourceLength };
      // KEPT PLACE B (W4-01b): the codec stage's result. For `steam` the
      // sender's messages (their ticks among them), the decoded packets and
      // what codecInfo is made from (the stream's lookahead and version, the
      // sender, its settings, the bitrate, whether loss was set); for the
      // frame path the decoded samples after the decoder's filter, the head
      // and the codecInfo. Loss and jitter are drawn above it. Every option
      // used above is in B's key, as it is used: none of them may be put on
      // AFTER_B_OPTIONS. Below, the decoded packets and their blocks are
      // read only, the frame log is a new array, and the frame path's
      // samples and codecInfo are copied before re-timing writes into them.
      // `steam`'s messages are kept without their `pcm`, the encoder's
      // input, which nothing after B reads.
      if (kept && coded) kept.keep('b', b.kind === 'steam' ? { ...b, messages: b.messages.map(({ pcm, ...rest }) => rest) } : b);
      if (!steamPath) report(0.72);
    }

    /* ---- after B: used from here on, the receiver's settings ---- */
    const { autoGain, avgGain, maxGain, voiceScale } = r;
    // Re-timing's own seed, so loss patterns stay put.
    const retimeSeed = (r.seedNumber ^ 0x9E3779B9) >>> 0;
    let samples, codecInfo, steamVoice = null, lead = null;
    if (steamPath) {
      // Steam's resampler, the 12-frame refusal, the gain and the laying,
      // from B's messages and decoded packets (steamTimeline), on the
      // source's timeline.
      const { swr } = steamModules();
      const { messages, trip, sender, settings, bitrate, lossSet, framesPerPacket, codecLength } = b;
      const resampler = o.swrKernel !== undefined ? swr.createResampler({ kernel: o.swrKernel }) : swr.createResampler();
      const voiceLength = sincLength(codecLength, STEAM_RATE, STEAM_VOICE_RATE);
      const timeline = steamTimeline({ voiceLength, codecLength, lookahead: trip.lookahead, resampler,
        gain: autoGain ? createGain({ avgGain, maxGain, scale: voiceScale }) : null, capacity: voiceLength,
        onDecoded: o.onDecoded, onResampled: o.onResampled });
      // Progress once per 64 messages, from 60% to 72%.
      for (let k = 0; k < messages.length; k++) {
        timeline.add(messages[k], trip.results[k]);
        if ((k & 63) === 63) {
          report(0.6 + 0.12 * (k + 1) / messages.length);
          await pause();
        }
      }
      steamVoice = timeline.take(voiceLength);
      codecInfo = { ...steamCodecInfo(codec, trip, timeline, sender, settings, resampler, bitrate, lossSet), framesPerPacket };
      // The receiver's re-timing (finding 19), on the voice-rate timeline: the
      // laid spurts, moved earlier as the frame path moves its decoded sound;
      // the slots of 480 codec samples are 882 here.
      if (o.retime) {
        codecInfo.retimed = retimeSpurts(steamVoice, { frameLog: codecInfo.frameLog, frameBytes: codecInfo.frameBytes,
          frameSamples: STEAM_FRAME * STEAM_VOICE_RATE / STEAM_RATE, lookahead: Math.round(trip.lookahead * STEAM_VOICE_RATE / STEAM_RATE),
          spans: timeline.spans() },
        STEAM_VOICE_RATE, mulberry32(retimeSeed));
      }
      report(0.72);
    } else if (b.kind === 'frames') {
      // Re-timing moves samples and the frame log in place: it is given
      // copies of B's.
      samples = o.retime ? b.samples.slice() : b.samples;
      codecInfo = copyInfo(b.info);
      // The engine codecs: the decoded samples the delay's trim dropped, for
      // the gain to run on first (gainLead).
      if (autoGain && gainLead(codec, codecInfo.lookahead)) lead = b.head;
      // The receiver's re-timing, from its own seed so loss patterns stay put.
      // It never moves the first spurt, so the samples in `lead` stay where
      // they are.
      if (o.retime) codecInfo.retimed = retimeSpurts(samples, codecInfo, codecRate, mulberry32(retimeSeed));
    } else {
      // A demo's voice, or the codec skipped: stage 4 runs on A's samples.
      samples = b.samples;
      codecInfo = b.info;
    }
    await pause();

    /* ---- 4) Receiver voice channel: auto-gain + int16 clamp ---- */
    if (steamPath) {
      // The gain ran on the decoded packets (steamTimeline).
      samples = steamVoice;
      if (!autoGain) {
        for (let i = 0; i < samples.length; i++) samples[i] *= voiceScale;
        samples = hardClip(samples, INT16_FULL_SCALE);
      }
    } else if (autoGain) {
      // The engine codecs: the gain runs on the decoder's stream from its
      // first sample, and the delay is dropped after it (gainLead).
      const ahead = lead ? lead.length : 0;
      samples = resampleSinc(ahead ? joinSamples([lead, samples]) : samples, codecRate, codec.voiceRate);
      // With the gate on, the gain knows which blocks were decoded; with
      // no gate (or the codec bypassed) every block was. On the decoder's
      // stream a block's first sample is in frame floor(m / frameSamples):
      // no shift.
      const decoded = received || (b.kind === 'frames' && b.gateOn)
        ? decodedFromFrames(codecInfo.frameLog, codecInfo.frameSamples, ahead ? 0 : codecInfo.lookahead || 0, codecRate, codec.voiceRate) : undefined;
      samples = receiverAutoGain(samples, { avgGain, maxGain, scale: voiceScale, decoded });
      if (ahead) samples = samples.slice(ahead);
    } else {
      samples = resampleSinc(samples, codecRate, codec.voiceRate);
      for (let i = 0; i < samples.length; i++) samples[i] *= voiceScale;
      samples = hardClip(samples, INT16_FULL_SCALE);
    }
    // The mix point, on every profile (a test hook): the gain's output at
    // the voice rate, as it reaches the mixer.
    if (typeof o.onGain === 'function') o.onGain(samples);

    /* ---- 5) The mixer at 44.1 kHz: the entry and the upsampling ---- */
    // The same stages as createRender and the live chain run, here given
    // the whole voice and ended. With a room (createRoomMix, made at the
    // render's entry) the voice is entered twice and the room path gives
    // the sum before the clip, its tail after the voice's end.
    const whole = (stage, x) => joinInts([stage.push(x), stage.flush()]);
    const mixStage = createMixStage(codec.voiceRate, room);
    const mix = whole(mixStage, samples);
    const tail = room ? mixStage.tail() : 0;
    report(0.8);
    await pause();
    report(0.9);
    await pause();

    /* ---- 6) mixOut, the device's rate, the output's length ---- */
    // The blocks, the clip, volume and the 16-bit rounding, then the device
    // stage. The output keeps the source's duration at the device's rate,
    // cut or padded with zeros, plus the room's tail at that rate.
    const { volume, deviceRate } = r;
    const playbackLength = Math.round(b.sourceLength * deviceRate / srcRate);
    const atDevice = whole(createOutStage(volume, deviceRate, o.onMixBlock), mix);
    const outLength = playbackLength + tailAtDevice(tail, deviceRate);
    samples = new Float32Array(outLength);
    for (let i = 0, n = Math.min(outLength, atDevice.length); i < n; i++) samples[i] = atDevice[i] / 32768;

    const blob = encodeWav(samples, deviceRate);
    report(1);
    return { samples, sampleRate: deviceRate, blob, realOpus: enableCodec,
      codecInfo: { ...codecInfo, codec: codecKey, autoGain, voiceRate: codec.voiceRate, ...(room ? { room: { ...room.info, tail } } : {}) } };
  }

  /* ------------------------------------------------------------------ */
  /* Live chain: process() one block at a time                          */
  /*                                                                    */
  /* The same stages and settings as process(), each keeping its state  */
  /* between blocks, for the live monitor. Where process() can look     */
  /* ahead, the live chain waits instead: the zero-phase FIRs become    */
  /* linear-phase (half their length late), and the voice gate holds    */
  /* frames back for its pre-roll (120 ms), as the sender must. The     */
  /* `steam` profile with the codec on runs the render's own stages     */
  /* (steamLiveChain, W3-11b) and holds back the sender's reach. A room */
  /* and under water run on a room path the worker keeps (W3-17d).      */
  /* ------------------------------------------------------------------ */

  // How long the live chain's last stage waits, in seconds: above 44.1 kHz
  // the device stage waits for the next mix sample (one 44100 Hz sample at
  // most); at 44.1 kHz there is no stage; below, the sinc resampler's wait.
  function outputWait(ioRate) {
    const rate = Math.round(ioRate);
    return rate > MIX_RATE ? 1 / MIX_RATE : rate === MIX_RATE ? 0 : sincWait(MIX_RATE, rate);
  }

  // The live chain of the `steam` profile with the codec on (W3-11b): the
  // render's own stages (createRender's steam stage), fed as the
  // microphone's blocks arrive, with the key held from the chain's start to
  // its stop. What it hands its mix point is, sample for sample, what
  // createRender hands its own for the same sound, seed and settings. Since
  // BC-1 a gap of more than ten lost frames leaves its time empty and later
  // sound does not move, so no packet lands on what was given out (a packet
  // that would is still moved, and counted in movedLate).
  //   - Capture: the mic gain and the clip, the context's rate to 24 kHz, the
  //     optional filters, the capture roll-off with its delay dropped from
  //     the front (firStage, as createRender runs it), the 16 bits.
  //   - Steam's sender with the render's seed, settings and steamUptime; the
  //     message draw once per message (BC-1) and the late-frame mask a frame
  //     at a time by the sender's frame number;
  //     createSteamStream; steamTimeline with one resampler and one gain for
  //     the chain. No wall clock is read: the sender's seeded clock runs on
  //     the samples pushed to it, as in a render.
  //   - What is given out is decided per pushed sample: first that sample's
  //     messages are laid, against what was given out before it; then
  //     given = max(given, steamGiveOut(pushed, cursor, reach, lookahead,
  //     ten frames)). The plan of blocks does not change the output. There is
  //     no flush: what is held back when the chain stops is never given out.
  //   - Low latency (opts.lowLatency, the app's own): the reach is the
  //     longest chunk and a frame less a sample, not the longest chunk and
  //     the pre-roll; the sender runs as before, and only a spurt's pre-roll
  //     is lost (cut from its opening packet).
  //   - Push-to-talk, the app's stand-in until W3-11c (not Steam's key rules):
  //     while the key is up each block is zeros from before the mic gain; the
  //     clock and every position run on, and the gate ends a spurt by its own
  //     hold. The input meter still shows the microphone.
  //   - A settings change rebuilds the chain (live-worker.js): the new chain
  //     starts with a silent sender, a new decoder, a resampler that has not
  //     flushed and a reset gain. That is the app's own; Steam has no such
  //     thing.
  async function steamLiveChain(c) {
    const { opts, ioRate, codecKey, codec, micGain, hp, lp, bits, lossPct, jitterMs, autoGain, gateOn, avgGain, maxGain, voiceScale,
      framesPerPacket, rand, mixStages, roomHoldSeconds = () => 0, spurtStarts = () => {} } = c;
    const { sender: SteamSender, swr } = steamModules();
    if (codec.codecRate !== STEAM_RATE || codec.voiceRate !== STEAM_VOICE_RATE || codec.decoderEq) {
      throw new Error('The steam rule runs at 24000 Hz into a 44100 Hz voice rate, with no decoder EQ.');
    }
    const S = SteamSender.STEAM_SENDER;
    const opus = await loadOpusModule();
    const bitrate = Math.max(6000, Math.round(codec.bitrate * bits / 16));

    /* ---- Capture, as createRender's stages 1 and 2 ---- */
    const toCodec = streamResampleSinc(ioRate, STEAM_RATE);
    const filters = [];
    if (hp > 10) filters.push(streamBiquad(biquadCoefs('highpass', STEAM_RATE, hp, 0.707)));
    if (lp < STEAM_RATE * 0.45) {
      filters.push(streamBiquad(biquadCoefs('lowpass', STEAM_RATE, lp, 0.707)), streamBiquad(biquadCoefs('lowpass', STEAM_RATE, lp, 0.707)));
    }
    const captureEq = profileEq(codec, 'captureEq');
    if (captureEq) filters.push(firStage(captureEq, Infinity).push);

    /* ---- The sender, the codec, the network and the receiver ---- */
    const settings = steamSenderOptions(opts, gateOn, finiteOr(opts.seed, 0xC0FFEE) >>> 0);
    const sender = SteamSender.createSender(settings.sender);
    let stream = await opus.createSteamStream(bitrate, { application: codec.application, signal: codec.signal,
      runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
    const lookahead = stream.lookahead;
    const nextMiss = streamLossMask(framesPerPacket, 0, rand, jitterMs);
    const loser = steamLoser(opts, lossPct, finiteOr(opts.seed, 0xC0FFEE) >>> 0);
    let frame = 0, index = 0;
    const miss = (f) => {
      if (f !== frame++) throw new Error(`TF2Audio live chain: frame ${f} reached the network out of order`);
      return nextMiss();
    };
    const resampler = opts.swrKernel !== undefined ? swr.createResampler({ kernel: opts.swrKernel }) : swr.createResampler();
    const timeline = steamTimeline({ lookahead, resampler, gain: autoGain ? createGain({ avgGain, maxGain, scale: voiceScale }) : null,
      onDecoded: opts.onDecoded, onResampled: opts.onResampled, onMove: opts.onMove });
    // Full: a spurt not yet opened starts at most the longest chunk and the
    // pre-roll before the last sample pushed. Low latency: a message's first
    // frame starts at most the longest chunk and a frame less a sample before
    // it (up to a frame less a sample is kept from the chunk before).
    const fullReach = steamReach(S), lowReach = steamReach(S) - S.preroll + S.frame - 1;
    const reach = opts.lowLatency ? lowReach : fullReach;

    /* ---- After the mix point: the live chain's own stages ---- */
    const after = [];
    if (!autoGain) after.push((x) => hardClip(x.map(v => v * voiceScale), INT16_FULL_SCALE));
    after.push(...mixStages());

    // contentDelay: how many samples (at ioRate) the output's index sits
    // behind the input's: 0 (W3-10). Nothing shifts it: the capture FIR's
    // delay is dropped, the lookahead is trimmed where packets are laid, the
    // reach only holds samples back, and after the mix point the entry and
    // mixOut have no memory, the voice is not upsampled, and the device
    // stage starts at phase 0 (below 44.1 kHz the sinc resampler is
    // time-aligned). latencyMs is every hold-back: the resamplers' waits (to
    // 24 kHz, Steam's resampler's 16 inputs, and the context's: outputWait),
    // the capture FIR's dropped delay, the reach and the lookahead.
    const firDelay = (taps) => (taps ? (taps.length - 1) / 2 : 0);
    const contentDelay = 0;
    const holdBack = (r) => sincWait(ioRate, STEAM_RATE) + (firDelay(captureEq) + r + lookahead + swr.TAPS / 2) / STEAM_RATE
      + outputWait(ioRate) + roomHoldSeconds();
    const latencyMs = (r) => 1000 * (contentDelay / ioRate + holdBack(r));

    let talking = true, pushed = 0, given = 0, slot = 0, roomSpurt = null;
    const one = new Int16Array(1), codes = [];
    const stats = { codec: codecKey, frames: 0, sent: 0, modes: { silk: 0, hybrid: 0, celt: 0, speex: 0, vr12: 0 }, dtx: 0, lost: 0, late: 0,
      bytes: 0, gateOpen: false, lastMode: null, inputPeak: 0, outputPeak: 0, spurts: 0, talking,
      droppedLate: 0, movedLate: 0, lostMessages: 0, refusedMessages: 0, latencyMs: 0 };
    // What the chain holds back now (the room's block only while it holds one).
    Object.defineProperty(stats, 'latencyMs', { enumerable: true, get: () => latencyMs(reach) });
    // The sender's own count, read when asked.
    Object.defineProperty(stats, 'spurts', { enumerable: true, get: () => sender.info().spurts.length });

    async function process(block) {
      if (!stream) throw new Error('TF2Audio live chain: this chain has been freed.');
      const x = Float32Array.from(block);
      let peak = 0;
      for (let i = 0; i < x.length; i++) {
        const v = clamp(x[i] * micGain, -INT16_FULL_SCALE, INT16_FULL_SCALE);
        x[i] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      stats.inputPeak = Math.max(stats.inputPeak, peak);
      // The key up (the app's stand-in): zeros in place of the microphone,
      // after its meter. The order puts them before the mic gain; the gain
      // and the clip are memoryless, so after them is the same samples.
      if (!talking) x.fill(0);
      let y = toCodec(x);
      for (const f of filters) y = f(y);
      const q = steamCapture(y);
      for (let i = 0; i < q.length; i++) {
        one[0] = q[i];
        const messages = sender.push(one);
        pushed++;
        for (const msg of messages) {
          const made = await stream.message(msg, miss, loser.lose(index++, msg));
          // The room's stand-in for a voice channel's start: the spurt's
          // opening message, delivered or lost (BC-1), where the timeline
          // opens the spurt.
          if (!made.silence && msg.spurt !== roomSpurt) { roomSpurt = msg.spurt; spurtStarts(); }
          for (const b of made.blocks) {
            const dtx = b.bytes <= 2;
            stats.bytes += b.bytes;
            stats.modes[b.mode]++;
            if (dtx) stats.dtx++;
            stats.lastMode = dtx ? 'dtx' : b.mode;
          }
          timeline.add(msg, made, given);
        }
        const bound = steamGiveOut(pushed, timeline.cursor, reach, lookahead, true);
        if (bound > given) given = bound;
      }
      // The 20 ms slots that became final: nothing is laid before given.
      const final = timeline.final(slot, given);
      for (let k = 0; k < final.frameLog.length; k++) {
        const code = final.frameLog[k];
        stats.frames++;
        if (code !== FRAME_CODES.gated) stats.sent++;
        if (code === FRAME_CODES.lost) stats.lost++;
        if (code === FRAME_CODES.late) stats.late++;
        codes.push(code);
      }
      slot = final.to;
      stats.gateOpen = timeline.cursor !== Infinity;
      stats.droppedLate = timeline.dropped();
      stats.movedLate = timeline.moved();
      const network = timeline.network();
      stats.lostMessages = network.lostMessages;
      stats.refusedMessages = network.refusedMessages;
      let out = timeline.take(given);
      for (const f of after) out = f(out);
      let outPeak = 0;
      for (const v of out) if (Math.abs(v) > outPeak) outPeak = Math.abs(v);
      stats.outputPeak = Math.max(stats.outputPeak, outPeak);
      return out;
    }

    return { process, stats, contentDelay, codecRate: STEAM_RATE, frameSize: STEAM_FRAME, frameSeconds: STEAM_FRAME / STEAM_RATE,
      // Slot k covers the codec's samples from 480 k - lookahead (the render's slot rule).
      slotOffsetSeconds: -lookahead / STEAM_RATE,
      // How much low latency saves: the difference of the two reaches.
      lowLatencySavingMs: latencyMs(fullReach) - latencyMs(lowReach),
      version: stream.version, bitrate, vbr: !!codec.encoder?.vbr, dtx: !!codec.encoder?.dtx,
      gateDb: settings.gate ? settings.thresholdDb : null, autoGain, voiceRate: STEAM_VOICE_RATE, realOpus: true,
      setTalking(on) { talking = !!on; stats.talking = talking; },
      takeFrameCodes() { return codes.splice(0); },
      free() { if (stream) stream.free(); stream = null; } };
  }

  // The live chain for `opts` (process()'s options) at the audio device's
  // rate. process(block) takes and returns Float32Arrays at ioRate (the
  // output a little shorter or longer as the resamplers work); `stats`
  // counts what the codec did.
  async function createLiveChain(opts = {}, ioRate = 48000) {
    const codecKey = Object.hasOwn(CODEC_PROFILES, opts.codec) ? opts.codec : 'steam';
    const codec = CODEC_PROFILES[codecKey];
    const engine = VOICE_ENGINE;
    const codecRate = codec.codecRate;
    const micGain = clamp(finiteOr(opts.micGain, 1), 0, 20);
    const hp = clamp(finiteOr(opts.hp, 0), 0, codecRate * 0.45);
    const lp = clamp(finiteOr(opts.lp, codecRate / 2), 100, codecRate / 2);
    const bits = clamp(finiteOr(opts.bits, 16), 2, 32);
    const lossPct = clamp(finiteOr(opts.lossPct, 0), 0, 100);
    const jitterMs = clamp(finiteOr(opts.jitterMs, 0), 0, 500);
    const enableCodec = opts.enableWarble !== false;
    const autoGain = opts.agc !== false;
    const gateSpec = codec.senderGate || DEFAULT_SENDER_GATE;
    const gateOn = enableCodec && (opts.gate == null ? !!codec.senderGate : !!opts.gate);
    const gateDb = gateThresholdDb(opts.gateThresholdDb, gateSpec.thresholdDb);
    const avgGain = clamp(finiteOr(opts.avgGain, engine.autoGain.avgGain), 0, 2);
    const maxGain = clamp(finiteOr(opts.maxGain, engine.autoGain.maxGain), 1, 100);
    const voiceScale = clamp(finiteOr(opts.voiceScale, 1), 0, 4);
    const volume = clamp(finiteOr(opts.volume, engine.volume), 0, 1);
    const framesPerPacket = clamp(Math.round(finiteOr(opts.frameMs, 20) / 20), 1, 10);
    const rand = mulberry32(finiteOr(opts.seed, 0xC0FFEE) >>> 0);

    // The mix point, a stage boundary (opts.onGain, a test hook, sees the
    // voice-rate signal there as a render's does), and the stages after it,
    // the render's own (W3-10): the entry and the upsampling (their states
    // made with the chain), the blocks (opts.onMixBlock, counted from the
    // chain's first sample at its mix point), mixOut. Then the context's
    // rate: the device stage's linear rule at any rate above 44.1 kHz (the
    // context is the listener's device, so opts.deviceRate is not read
    // here), nothing at 44.1 kHz, and below it the sinc resampler: a context
    // under 44.1 kHz is the browser's, not the game's. The old listener's
    // low-pass is gone (W3-17c).
    //   The room (W3-17d): opts.liveRoom, the live monitor's worker's holder
    // { path, attached } of a room path (room-dsp.js createRoomPath) kept
    // outside the chain, so a rebuilt chain keeps the room's lines and the
    // slot's count of blocks; the worker sets its room and its water, and
    // attaches it while a room or the water is on (createLiveRoomMix): a room
    // switched on or off needs no new chain, so Steam's sender and the gain
    // run on. Attached, the chain holds the voice's partial block until it
    // is whole: up to 511 samples at 44100 Hz, 11.6 ms, counted in
    // stats.latencyMs while it holds (roomHoldSeconds), not in contentDelay,
    // since it holds samples back and shifts none. Not attached it holds
    // nothing, as W3-10 left it. A chain never flushes, so the path's tail
    // rule is not asked.
    const liveRoom = opts.liveRoom && typeof opts.liveRoom === 'object' ? opts.liveRoom : null;
    const roomHoldSeconds = () => (liveRoom && liveRoom.holding ? (MIX_BLOCK - 1) / MIX_RATE : 0);
    // A voice channel starts (path.spurtStart(): its two limits are fixed
    // from the room's four mix values as they stand), attached or not, as the
    // engine fixes them whatever the room. There is no voice channel live yet
    // (W3-02c); the stand-in is the first delivered message (frame) of each
    // spurt the sender opens.
    const spurtStarts = () => { if (liveRoom && liveRoom.path) liveRoom.path.spurtStart(); };
    const mixStages = () => {
      const stages = [];
      if (typeof opts.onGain === 'function') stages.push((x) => { opts.onGain(x); return x; });
      const rate = Math.round(ioRate);
      const out = createOutputStage({ voiceRate: codec.voiceRate, volume, deviceRate: rate > MIX_RATE ? rate : MIX_RATE, onMixBlock: opts.onMixBlock,
        liveRoom });
      stages.push(out.push, mixToFloat);
      if (rate < MIX_RATE) stages.push(streamResampleSinc(MIX_RATE, rate));
      return stages;
    };

    // The `steam` profile with the codec on runs the render's own stages.
    if (enableCodec && codec.senderGate?.rule === 'steam') {
      return steamLiveChain({ opts, ioRate, codecKey, codec, micGain, hp, lp, bits, lossPct, jitterMs, autoGain, gateOn,
        avgGain, maxGain, voiceScale, framesPerPacket, rand, mixStages, roomHoldSeconds, spurtStarts });
    }

    const toCodec = streamResampleSinc(ioRate, codecRate);
    const filters = [];
    if (hp > 10) filters.push(streamBiquad(biquadCoefs('highpass', codecRate, hp, 0.707)));
    if (lp < codecRate * 0.45) {
      filters.push(streamBiquad(biquadCoefs('lowpass', codecRate, lp, 0.707)), streamBiquad(biquadCoefs('lowpass', codecRate, lp, 0.707)));
    }
    const captureEq = enableCodec ? profileEq(codec, 'captureEq') : null;
    if (captureEq) filters.push(streamFir(captureEq));
    const decoderEq = enableCodec ? profileEq(codec) : null;
    const after = [];
    if (decoderEq) after.push(streamFir(decoderEq));
    after.push(streamResampleSinc(codecRate, codec.voiceRate));
    // The gain's decoded(): whether the frame a voice-rate sample came from
    // was sent (no lookahead is trimmed here: frame f's decoded samples are
    // f * frameSize onward, after the decoder EQ's delay). Frames not sent
    // are the gate's, or push-to-talk's with the key up: in both nothing
    // reaches the receiver. One call codes all its frames before any of
    // their samples reach the gain, so the flags are kept, however many,
    // until the gain has passed the block their samples begin in.
    let sentFlags = new Uint8Array(64), flagBase = 0, framesCoded = 0, gainSamples = 0;
    const decoderDelay = decoderEq ? (decoderEq.length - 1) >> 1 : 0;
    const frameOf = (m) => Math.floor(Math.max(0, Math.floor(m * codecRate / codec.voiceRate) - decoderDelay) / frameSize);
    const decoded = (m) => {
      const f = frameOf(m);
      return f < flagBase || f >= framesCoded ? true : sentFlags[f - flagBase] === 1;
    };
    const recordSent = (sent) => {
      if (!autoGain) return;
      if (framesCoded - flagBase === sentFlags.length) {
        const grown = new Uint8Array(2 * sentFlags.length);
        grown.set(sentFlags);
        sentFlags = grown;
      }
      sentFlags[framesCoded++ - flagBase] = sent ? 1 : 0;
    };
    if (autoGain) {
      const gain = streamAutoGain({ avgGain, maxGain, scale: voiceScale, decoded });
      after.push((x) => {
        const y = gain(x);
        gainSamples += x.length;
        // The gain asks only about the block it is in or later ones.
        const keep = Math.min(framesCoded, frameOf(gainSamples - gainSamples % GAIN_BLOCK));
        if (keep > flagBase) {
          sentFlags.copyWithin(0, keep - flagBase, framesCoded - flagBase);
          flagBase = keep;
        }
        return y;
      });
    } else after.push((x) => hardClip(x.map(v => v * voiceScale), INT16_FULL_SCALE));
    after.push(...mixStages());

    let voice = null;
    if (enableCodec) {
      const opus = await loadOpusModule();
      if (typeof opus.createVoiceStream !== 'function') throw new Error('This Opus build has no frame-by-frame interface.');
      voice = codec.engine === 'celt011'
        ? await opus.createCeltStream(codecRate, { frameSize: codec.frameSize, complexity: codec.complexity,
          packetBytes: Math.max(8, Math.round(codec.packetBytes * bits / 16)), ...celtModeRate(codec) })
        : codec.engine === 'speex'
        ? await opus.createSpeexStream(codecRate)
        : codec.engine === 'vr12'
        ? await opus.createVr12Stream(codecRate)
        : await opus.createVoiceStream(codecRate, Math.max(6000, Math.round(codec.bitrate * bits / 16)), {
          application: codec.application, signal: codec.signal,
          runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
    }
    // 20 ms for Opus; CELT, Speex and VR12 have their own frame (23.2 ms for vaudio_celt, 14.51 ms for
    // vaudio_speex, 32.65 ms for vaudio_miles).
    const frameSize = codec.frameSize || codecRate / 50, frameSeconds = frameSize / codecRate;
    const threshold = 10 ** (gateDb / 20);
    // opts.lowLatency (live only, not how TF2 behaves): no pre-roll, so the
    // gate opens on the loud frame itself and 120 ms sooner.
    const preroll = gateOn && !opts.lowLatency ? Math.round(gateSpec.prerollMs / 1000 / frameSeconds) : 0, hold = Math.round(gateSpec.holdMs / 1000 / frameSeconds);
    const lossMask = streamLossMask(framesPerPacket, lossPct, rand, jitterMs);
    let pending = new Float32Array(0);
    const queue = [];   // frames waiting out the gate's pre-roll: { samples, sent, talk }
    let frameIndex = 0, holdUntil = -1, open = false, spurts = 0;
    // Push-to-talk: frames captured while the key is up are never sent, as
    // the game does not capture them at all.
    let talking = true;
    const codes = [];   // opus-codec.mjs FRAME codes of the frames since takeFrameCodes()
    // The output is the input this many samples (at ioRate) later: the
    // group delay of the causal FIRs (capture and decoder EQ at the codec
    // rate), which a render applies zero-phase, and the codec's lookahead,
    // which a render trims. The pre-roll only holds output back; it does not
    // shift it. The stages after the mix point shift nothing against a
    // render (the upsampler's one or three mix samples of lateness are in
    // the render too).
    const firDelay = (taps) => (taps ? (taps.length - 1) / 2 : 0);
    const delaySeconds = (firDelay(captureEq) + firDelay(decoderEq) + (voice ? voice.lookahead : 0)) / codecRate;
    const contentDelay = Math.round(delaySeconds * ioRate);
    const stats = { codec: codecKey, frames: 0, sent: 0, modes: { silk: 0, hybrid: 0, celt: 0, speex: 0, vr12: 0 }, dtx: 0, lost: 0, late: 0,
      bytes: 0, gateOpen: false, lastMode: null, inputPeak: 0, outputPeak: 0, spurts: 0, talking,
      latencyMs: 0 };
    // What the chain holds back now: the room's block only while it holds one.
    Object.defineProperty(stats, 'latencyMs', { enumerable: true, get: () => 1000 * (preroll * frameSeconds + delaySeconds + roomHoldSeconds()) });

    // The room's stand-in for a voice channel's start: the spurt's first
    // frame that is delivered (not lost, not late).
    let spurtUndelivered = false;
    async function codecFrame(frame, sent) {
      stats.frames++;
      recordSent(sent);
      if (!voice) {
        if (sent && !stats.gateOpen) spurtStarts();
        stats.gateOpen = sent; codes.push(sent ? 2 : 0); return sent ? frame : new Float32Array(frame.length);
      }
      if (!sent) { open = false; stats.gateOpen = false; codes.push(0); return new Float32Array(frameSize); }
      if (!open) {
        if (spurts > 0) await voice.restart();
        spurts++;
        stats.spurts = spurts;
        open = true;
        spurtUndelivered = true;
      }
      stats.gateOpen = true;
      stats.sent++;
      const encoded = voice.encode(frame);
      stats.bytes += encoded.bytes;
      stats.modes[encoded.mode]++;
      if (encoded.dtx) stats.dtx++;
      stats.lastMode = encoded.dtx ? 'dtx' : encoded.mode;
      const miss = lossMask();
      if (miss === 1) { stats.lost++; codes.push(5); return voice.conceal().slice(); }
      if (miss === 2) { stats.late++; codes.push(6); return new Float32Array(frameSize); }
      codes.push(encoded.dtx ? FRAME_CODES.dtx : FRAME_CODES[encoded.mode]);
      if (spurtUndelivered) { spurtUndelivered = false; spurtStarts(); }
      return voice.decode(encoded.packet).slice();
    }

    async function process(block) {
      let x = Float32Array.from(block);
      let peak = 0;
      for (let i = 0; i < x.length; i++) {
        const v = clamp(x[i] * micGain, -INT16_FULL_SCALE, INT16_FULL_SCALE);
        x[i] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      stats.inputPeak = Math.max(stats.inputPeak, peak);
      x = toCodec(x);
      for (const f of filters) x = f(x);
      const merged = new Float32Array(pending.length + x.length);
      merged.set(pending); merged.set(x, pending.length);
      const whole = Math.floor(merged.length / frameSize) * frameSize;
      pending = merged.slice(whole);
      const decoded = [];
      for (let start = 0; start < whole; start += frameSize) {
        const frame = merged.slice(start, start + frameSize);
        if (!gateOn) { decoded.push(await codecFrame(frame, talking)); continue; }
        // Steam's gate: a frame over the threshold sends the pre-roll before
        // it and the hold after it. A frame leaves the queue once no later
        // frame's pre-roll can reach it.
        let energy = 0;
        for (const v of frame) energy += v * v;
        const loud = talking && Math.sqrt(energy / frameSize) > threshold;
        const f = frameIndex++;
        queue.push({ samples: frame, index: f, sent: false, talk: talking });
        if (loud) {
          holdUntil = Math.max(holdUntil, f + hold);
          for (const q of queue) if (q.index >= f - preroll) q.sent = true;
        }
        while (queue.length > preroll) {
          const q = queue.shift();
          decoded.push(await codecFrame(q.samples, q.talk && (q.sent || q.index <= holdUntil)));
        }
      }
      let y = new Float32Array(decoded.reduce((n, d) => n + d.length, 0));
      let offset = 0;
      for (const d of decoded) { y.set(d, offset); offset += d.length; }
      for (const f of after) y = f(y);
      let outPeak = 0;
      for (const v of y) if (Math.abs(v) > outPeak) outPeak = Math.abs(v);
      stats.outputPeak = Math.max(stats.outputPeak, outPeak);
      return y;
    }

    return { process, stats, contentDelay, codecRate, frameSize, frameSeconds, version: voice ? voice.version : null,
      // Speex and VR12 report their own bitrate (11025 and 2940 bit/s), whatever snd_bits says.
      bitrate: voice?.bitrate ?? Math.max(6000, Math.round(codec.bitrate * bits / 16)), vbr: !!codec.encoder?.vbr, dtx: !!codec.encoder?.dtx,
      gateDb: gateOn ? gateDb : null, autoGain, voiceRate: codec.voiceRate, realOpus: !!voice,
      setTalking(on) { talking = !!on; stats.talking = talking; },
      takeFrameCodes() { return codes.splice(0); },
      free() { if (voice) voice.free(); voice = null; } };
  }

  /* ------------------------------------------------------------------ */
  /* A render a piece at a time                                         */
  /*                                                                    */
  /* createRender(source, opts) is process() for a source pushed in     */
  /* chunks of any size: the same samples, WAV bytes and codecInfo,     */
  /* while each stage keeps only its state. A stage that reads ahead in  */
  /* process() waits instead and is flushed at the end with the zeros   */
  /* process() reads as missing. The gate decides a frame once its      */
  /* pre-roll is measured; the codec restarts at each talk spurt as     */
  /* roundTrip does; the loss mask is drawn once over all frames. A     */
  /* room streams (W3-17c); talk-spurt re-timing does not.              */
  /* ------------------------------------------------------------------ */

  // The voice gate and the codec a frame at a time, as roundTrip,
  // celtRoundTrip, speexRoundTrip and vr12RoundTrip run them over a
  // length-sample signal at the codec rate. Frame f is final once frame
  // f + preroll is measured (no later frame's pre-roll reaches it), so the
  // input held is a few frames. Decoded frame f lands at f * size - lookahead;
  // gated and late frames leave zeros. kind: 'opus' | 'celt' | 'speex' |
  // 'vr12'. lead (gainLead): how many
  // of the delay's samples are kept in front, for the gain to run on before
  // they are dropped; the stage then gives length + lead samples, frame f at
  // f * size - lookahead + lead.
  function codecStage(voice, kind, length, gate, makeLossMask, lead = 0) {
    const size = voice.frameSize, lookahead = voice.lookahead, shift = lookahead - lead, total = length + lead;
    const frames = Math.ceil((length + lookahead) / size);
    const lossMask = makeLossMask(frames);
    const frameLog = new Uint8Array(frames), frameBytes = new Uint16Array(frames);
    const modes = kind === 'speex' ? { silk: 0, hybrid: 0, celt: 0, speex: 0 }
      : kind === 'vr12' ? { silk: 0, hybrid: 0, celt: 0, vr12: 0 } : { silk: 0, hybrid: 0, celt: 0 };
    const preroll = gate ? gate.preroll : 0, hold = gate ? gate.hold : 0, input = new Float32Array(size);
    let encodedBytes = 0, lostFrames = 0, underrunFrames = 0, gatedFrames = 0, dtxFrames = 0, spurts = 0, open = false;
    let held = new Float32Array(8 * size), heldStart = 0, heldLength = 0, received = 0;
    let measured = 0, loudest = -Infinity, next = 0;

    async function code(f) {
      const dest = f * size - shift, begin = Math.max(0, -dest), span = Math.max(0, Math.min(size, total - dest) - begin);
      // Sent: some frame from f - hold to f + preroll is loud.
      if (gate && loudest < f - hold) { gatedFrames++; open = false; return new Float32Array(span); }
      if (!open) {
        if (spurts > 0) await voice.restart();
        spurts++;
        open = true;
      }
      input.fill(0);
      const start = f * size;
      if (start < length) input.set(held.subarray(start - heldStart, Math.min(length, start + size) - heldStart));
      const encoded = voice.encode(input);
      encodedBytes += encoded.bytes;
      frameBytes[f] = encoded.bytes;
      if (kind === 'opus') {
        modes[encoded.mode]++;
        if (encoded.dtx) dtxFrames++;
        frameLog[f] = encoded.dtx ? FRAME_CODES.dtx : FRAME_CODES[encoded.mode];
      } else {
        modes[kind]++;
        frameLog[f] = FRAME_CODES[kind];
      }
      const miss = lossMask ? lossMask[f] : 0;
      if (miss === 1) { lostFrames++; frameLog[f] = FRAME_CODES.lost; }
      else if (miss === 2) { underrunFrames++; frameLog[f] = FRAME_CODES.late; }
      let out = new Float32Array(span);
      if (miss !== 2) {
        const decoded = miss === 1 ? voice.conceal() : voice.decode(encoded.packet);
        if (kind === 'opus' && decoded.length !== size) throw new Error('Unexpected Opus frame length');
        out.set(decoded.subarray(begin, begin + span));
      }
      if ((f & 31) === 31) await microYield();
      return out;
    }

    async function advance() {
      const parts = [];
      while (measured < frames) {
        const start = measured * size, end = Math.min(length, start + size);
        if (end > received) break;
        if (gate) {
          let energy = 0;
          for (let i = start; i < end; i++) { const v = held[i - heldStart]; energy += v * v; }
          if (Math.sqrt(energy / size) > gate.threshold) loudest = measured;
        }
        measured++;
        while (next < frames && (next + preroll < measured || measured === frames)) parts.push(await code(next++));
      }
      const drop = Math.min(heldLength, next * size - heldStart);
      if (drop > 0) { held.copyWithin(0, drop, heldLength); heldLength -= drop; heldStart += drop; }
      return joinSamples(parts);
    }

    return {
      async push(x) {
        if (heldLength + x.length > held.length) {
          const grown = new Float32Array(Math.max(2 * held.length, heldLength + x.length));
          grown.set(held.subarray(0, heldLength));
          held = grown;
        }
        held.set(x, heldLength);
        heldLength += x.length;
        received += x.length;
        return advance();
      },
      async flush() {
        if (received !== length) throw new Error(`createRender: the codec got ${received} of ${length} samples`);
        return advance();
      },
      // The counts roundTrip, celtRoundTrip, speexRoundTrip and vr12RoundTrip report.
      counts() {
        return { lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames, spurts, encodedBytes, modes, frameLog, frameBytes };
      }
    };
  }

  /**
   * process() a piece at a time, for sources too long to hold several
   * copies of. source = { sampleRate, length, numberOfChannels: 1 } (the
   * mono capture signal; no samples); opts are process()'s. Resolves to
   * { outputLength, maxTail, sampleRate, push(chunk), finish(), free() }:
   *   outputLength the output's length without a room's tail (the source's
   *                duration at the device's rate)
   *   maxTail      the most a room's tail can add to it: the tail's cap
   *                (882,000 mixer samples, 20 s) at the device's rate; 0
   *                with no room and not under water. A caller with one
   *                buffer for the output makes it outputLength + maxTail
   *   push(chunk)  float PCM of the source in order, any size; resolves to
   *                the output samples that became final (maybe none); with
   *                a room never more than outputLength in all
   *   finish()     after exactly `length` samples were pushed; resolves to
   *                { samples, codecInfo, realOpus }, samples the rest of
   *                the output, a room's tail included
   *   free()       releases the codec (finish() does too)
   * Concatenated, the output is process()'s samples and codecInfo is its
   * codecInfo; steamUptime is taken as process() takes it. retime is
   * rejected with a RangeError: not streamed (W3-02f removes the rule).
   * Each push and finish must resolve before the next call.
   */
  async function createRender(source, opts = {}) {
    if (!source || !Number.isFinite(source.sampleRate) || source.sampleRate <= 0 ||
        !Number.isInteger(source.length) || source.length < 0 || source.numberOfChannels !== 1) {
      throw new TypeError('TF2Audio.createRender requires a mono source: { sampleRate, length, numberOfChannels: 1 }.');
    }
    // process()'s settings, resolved as it resolves them.
    const codecKey = Object.hasOwn(CODEC_PROFILES, opts.codec) ? opts.codec : 'steam';
    const codec = CODEC_PROFILES[codecKey];
    const engine = VOICE_ENGINE;
    const room = resolveRoom(opts, finiteOr(opts.seed, 0xC0FFEE) >>> 0);

    const codecRate    = codec.codecRate;
    const micGain      = clamp(finiteOr(opts.micGain, 1), 0, 20);
    const hp           = clamp(finiteOr(opts.hp, 0), 0, codecRate * 0.45);
    const lp           = clamp(finiteOr(opts.lp, codecRate / 2), 100, codecRate / 2);
    const bits         = clamp(finiteOr(opts.bits, 16), 2, 32);
    const lossPct      = clamp(finiteOr(opts.lossPct, 0), 0, 100);
    const jitterMs     = clamp(finiteOr(opts.jitterMs, 0), 0, 500);
    const enableCodec  = opts.enableWarble !== false;
    const autoGain     = opts.agc !== false;
    const gateSpec     = codec.senderGate || DEFAULT_SENDER_GATE;
    const gateOn       = opts.gate == null ? !!codec.senderGate : !!opts.gate;
    const gateDb       = gateThresholdDb(opts.gateThresholdDb, gateSpec.thresholdDb);
    const avgGain      = clamp(finiteOr(opts.avgGain, engine.autoGain.avgGain), 0, 2);
    const maxGain      = clamp(finiteOr(opts.maxGain, engine.autoGain.maxGain), 1, 100);
    const voiceScale   = clamp(finiteOr(opts.voiceScale, 1), 0, 4);
    const volume       = clamp(finiteOr(opts.volume, engine.volume), 0, 1);
    const rand         = mulberry32(finiteOr(opts.seed, 0xC0FFEE) >>> 0);
    const received     = opts.received && opts.received.frameLog ? opts.received : null;

    const srcRate = source.sampleRate, length = source.length;
    const deviceRate = deviceRateOf(opts.deviceRate);
    const frameMs = 20;
    const framesPerPacket = clamp(Math.round(finiteOr(opts.frameMs, frameMs) / frameMs), 1, 10);
    const report = (f) => { if (typeof opts.onProgress === 'function') opts.onProgress(f); };

    // What process() would do that is not streamed: the flat re-timing rule,
    // with a room or without (W3-02f removes the rule).
    if (opts.retime && enableCodec && !received) {
      throw new RangeError('TF2Audio.createRender does not stream talk-spurt re-timing yet (retime); use TF2Audio.process.');
    }

    // Each stage's whole length, as process()'s stages give them; the
    // output's is the source's duration at the device's rate.
    const codecLength = sincLength(length, srcRate, codecRate);
    const voiceLength = sincLength(codecLength, codecRate, codec.voiceRate);
    const outLength = Math.round(length * deviceRate / srcRate);

    /* ---- 1-2) Sender: resample to the codec rate; capture filters ---- */
    const stages = [sincStage(srcRate, codecRate, length)];
    if (hp > 10 && !received) stages.push(biquadStage(biquadCoefs('highpass', codecRate, hp, 0.707)));
    if (lp < codecRate * 0.45 && !received) {
      stages.push(biquadStage(biquadCoefs('lowpass', codecRate, lp, 0.707)), biquadStage(biquadCoefs('lowpass', codecRate, lp, 0.707)));
    }
    const captureEq = enableCodec && !received ? profileEq(codec, 'captureEq') : null;
    if (captureEq) stages.push(firStage(captureEq, codecLength));

    /* ---- 3) Gate, encode, lose packets, decode ---- */
    let voice = null, kind = null, coder = null, gate = null, gateOpts = null, bitrate = 0, packetBytes = 0, lead = 0;
    const steamPath = enableCodec && !received && codec.senderGate?.rule === 'steam';
    let steam = null;
    if (steamPath) {
      // Steam's sender and decoder through to the voice rate, the gain
      // included, as process() runs them: the same sender, stream, resampler,
      // gain and timeline, given the sound as it comes. The message draw is
      // made once per message in the sender's order, and the late-frame mask
      // a frame at a time in the sender's frame order (streamLossMask gives
      // buildLossMask's values). A sample is given out once no later packet
      // can reach it: past the open spurt's next packet, and a spurt not yet
      // opened starts at most a chunk and the pre-roll before the last sample
      // given to the sender.
      const { sender: SteamSender, swr } = steamModules();
      if (codecRate !== STEAM_RATE || codec.voiceRate !== STEAM_VOICE_RATE || codec.decoderEq) {
        throw new Error('The steam rule runs at 24000 Hz into a 44100 Hz voice rate, with no decoder EQ.');
      }
      const opus = await loadOpusModule();
      bitrate = Math.max(6000, Math.round(codec.bitrate * bits / 16));
      const settings = steamSenderOptions(opts, gateOn, finiteOr(opts.seed, 0xC0FFEE) >>> 0);
      const sender = SteamSender.createSender(settings.sender);
      voice = await opus.createSteamStream(bitrate, { application: codec.application, signal: codec.signal,
        runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
      const stream = voice;
      const nextMiss = streamLossMask(framesPerPacket, 0, rand, jitterMs);
      const loser = steamLoser(opts, lossPct, finiteOr(opts.seed, 0xC0FFEE) >>> 0);
      let frame = 0, given = 0, fed = 0, index = 0;
      const miss = (f) => {
        if (f !== frame++) throw new Error(`createRender: frame ${f} reached the network out of order`);
        return nextMiss();
      };
      const resampler = opts.swrKernel !== undefined ? swr.createResampler({ kernel: opts.swrKernel }) : swr.createResampler();
      const timeline = steamTimeline({ voiceLength, codecLength, lookahead: stream.lookahead, resampler,
        gain: autoGain ? createGain({ avgGain, maxGain, scale: voiceScale }) : null,
        onDecoded: opts.onDecoded, onResampled: opts.onResampled });
      const feed = async (messages) => {
        for (const msg of messages) {
          timeline.add(msg, await stream.message(msg, miss, loser.lose(index++, msg)));
          if ((++fed & 63) === 63) await microYield();
        }
      };
      steam = { sender, settings, resampler, timeline, lossSet: loser.set };
      stages.push({
        async push(x) {
          given += x.length;
          await feed(sender.push(steamCapture(x)));
          return timeline.take(steamGiveOut(given, timeline.cursor, steamReach(SteamSender.STEAM_SENDER), stream.lookahead, false));
        },
        async flush() {
          await feed(sender.finish());
          return timeline.take(voiceLength);
        }
      });
    } else if (enableCodec && !received) {
      const opus = await loadOpusModule();
      bitrate = Math.max(6000, Math.round(codec.bitrate * bits / 16));
      const codecFrameMs = codec.frameSize ? 1000 * codec.frameSize / codecRate : frameMs;
      // As process() passes the gate and roundTrip reads it.
      gateOpts = gateOn ? { thresholdDb: gateDb, prerollFrames: Math.round(gateSpec.prerollMs / codecFrameMs),
        holdFrames: Math.round(gateSpec.holdMs / codecFrameMs) } : null;
      gate = gateOpts ? { threshold: 10 ** (Number(gateOpts.thresholdDb) / 20),
        preroll: Math.max(0, Math.round(Number(gateOpts.prerollFrames) || 0)),
        hold: Math.max(0, Math.round(Number(gateOpts.holdFrames) || 0)) } : null;
      if (codec.engine === 'celt011') {
        kind = 'celt';
        packetBytes = Math.max(8, Math.round(codec.packetBytes * bits / 16));
        voice = await opus.createCeltStream(codecRate, { frameSize: codec.frameSize, complexity: codec.complexity, packetBytes, ...celtModeRate(codec) });
      } else if (codec.engine === 'speex') {
        kind = 'speex';
        voice = await opus.createSpeexStream(codecRate);
      } else if (codec.engine === 'vr12') {
        kind = 'vr12';
        voice = await opus.createVr12Stream(codecRate);
      } else {
        kind = 'opus';
        voice = await opus.createVoiceStream(codecRate, bitrate, { application: codec.application, signal: codec.signal,
          runtime: codec.encoder?.runtime, complexity: codec.encoder?.complexity, vbr: codec.encoder?.vbr, dtx: codec.encoder?.dtx });
      }
      if (autoGain) lead = gainLead(codec, voice.lookahead);
      coder = codecStage(voice, kind, codecLength, gate,
        count => buildLossMask(count, framesPerPacket, lossPct, rand, jitterMs), lead);
      stages.push(coder);
      const eq = profileEq(codec);
      if (eq) stages.push(firStage(eq, codecLength));
    }

    /* ---- 4) Receiver voice channel: auto-gain + int16 clamp ---- */
    if (steamPath) {
      // The gain ran on the decoded packets (steamTimeline).
      if (!autoGain) {
        stages.push(sampleStage((x) => {
          const y = new Float32Array(x);
          for (let i = 0; i < y.length; i++) y[i] *= voiceScale;
          return hardClip(y, INT16_FULL_SCALE);
        }));
      }
    } else if (autoGain) {
      // With a lead (the engine codecs) the codec stage gave the decoder's
      // stream from its first sample; the gain runs on it and the lead is
      // dropped after, as process() does.
      stages.push(sincStage(codecRate, codec.voiceRate, codecLength + lead));
      // decoded() as process() builds it. The codec stage fills its frame
      // log as it goes, and a frame is logged before any voice-rate sample
      // it makes reaches the gain (the stages between only wait).
      let decoded;
      if (received) {
        const info = receivedCodecInfo(received, codecRate);
        decoded = decodedFromFrames(info.frameLog, info.frameSamples, info.lookahead, codecRate, codec.voiceRate);
      } else if (coder && gate) {
        decoded = decodedFromFrames(coder.counts().frameLog, voice.frameSize, lead ? 0 : voice.lookahead, codecRate, codec.voiceRate);
      }
      const run = streamAutoGain({ avgGain, maxGain, scale: voiceScale, decoded });
      stages.push({ push: run, flush: run.flush });
      if (lead) stages.push(dropStage(lead));
    } else {
      stages.push(sincStage(codecRate, codec.voiceRate, codecLength));
      stages.push(sampleStage((x) => {
        const y = new Float32Array(x);
        for (let i = 0; i < y.length; i++) y[i] *= voiceScale;
        return hardClip(y, INT16_FULL_SCALE);
      }));
    }
    // The mix point, on every profile, as process() has it.
    if (typeof opts.onGain === 'function') stages.push(sampleStage((x) => { opts.onGain(x); return x; }));

    /* ---- 5-6) The mixer, mixOut and the device stage (W3-10) ---- */
    // process()'s stages, as they come: the entry and the upsampling (with a
    // room: createRoomMix, which keeps the voice's partial mixer block until
    // it is whole, and gives the tail at the end), the blocks, mixOut, the
    // device stage. With no room nothing waits for a block; the device stage
    // waits for one mix sample.
    const output = createOutputStage({ voiceRate: codec.voiceRate, volume, deviceRate, onMixBlock: opts.onMixBlock, room });
    stages.push(output);
    // Cut, or padded with zeros, to process()'s length; as floats over 32768.
    // With a room that length is known at the end (the tail's): until then
    // at most outLength samples are given out, and what the device stage
    // gives past them waits for finish(), which cuts or pads it to the tail.
    let emitted = 0;
    const over = [];
    const finalSamples = (y) => { emitted += y.length; return mixToFloat(y); };
    stages.push({
      push(y) {
        const keep = Math.max(0, Math.min(y.length, outLength - emitted));
        if (room && keep < y.length) over.push(y.slice(keep));
        return finalSamples(keep < y.length ? y.subarray(0, keep) : y);
      },
      flush() {
        const rest = new Int32Array(outLength + (room ? tailAtDevice(output.mix.tail(), deviceRate) : 0) - emitted);
        let at = 0;
        for (const y of over) { if (at >= rest.length) break; rest.set(y.subarray(0, rest.length - at), at); at += y.length; }
        return finalSamples(rest);
      }
    });

    async function through(k, x) {
      for (; k < stages.length; k++) x = await stages[k].push(x);
      return x;
    }

    let pushed = 0, state = 'open', busy = false;
    const release = () => { if (voice) voice.free(); voice = null; };
    async function guarded(run) {
      if (busy) throw new Error('TF2Audio.createRender: push() or finish() called before the previous call resolved.');
      if (state !== 'open') throw new Error(`TF2Audio.createRender: this render has ${state}.`);
      busy = true;
      try { return await run(); }
      catch (error) { if (state === 'open') state = 'failed'; throw error; }
      finally { busy = false; if (state !== 'open') release(); }
    }

    return {
      outputLength: outLength,
      maxTail: room ? tailAtDevice(roomModule().R.TAIL_CAP, deviceRate) : 0,
      sampleRate: deviceRate,
      push: (chunk) => guarded(async () => {
        if (pushed + chunk.length > length) {
          throw new RangeError(`TF2Audio.createRender: ${pushed + chunk.length} samples pushed to a ${length}-sample source.`);
        }
        /* ---- 1) Sender capture: capture gain, int16 clip ---- */
        const x = new Float32Array(chunk);
        for (let i = 0; i < x.length; i++) {
          if (!Number.isFinite(x[i])) throw new TypeError(`Source PCM contains a non-finite sample (at ${pushed + i}).`);
        }
        if (micGain !== 1 && !received) {
          for (let i = 0; i < x.length; i++) x[i] *= micGain;
        }
        pushed += x.length;
        const out = await through(0, hardClip(x, INT16_FULL_SCALE));
        if (length) report(pushed / length);
        return out;
      }),
      finish: () => guarded(async () => {
        if (pushed !== length) throw new RangeError(`TF2Audio.createRender: finish() after ${pushed} of ${length} samples.`);
        const parts = [];
        for (let k = 0; k < stages.length; k++) parts.push(await through(k + 1, await stages[k].flush()));
        let codecInfo = { backend: 'bypass', sampleRate: codecRate, frameMs };
        if (received) codecInfo = receivedCodecInfo(received, codecRate);
        else if (steam) {
          codecInfo = { ...steamCodecInfo(codec, voice, steam.timeline, steam.sender, steam.settings, steam.resampler, bitrate, steam.lossSet),
            framesPerPacket };
        } else if (coder) codecInfo = { ...codecResultInfo(kind, voice, codec, coder.counts(), gate, gateOpts, bitrate, packetBytes, codecRate), framesPerPacket };
        release();
        state = 'finished';
        report(1);
        return { samples: joinSamples(parts), realOpus: enableCodec,
          codecInfo: { ...codecInfo, codec: codecKey, autoGain, voiceRate: codec.voiceRate,
            ...(room ? { room: { ...room.info, tail: output.mix.tail() } } : {}) } };
      }),
      // During a push, the codec is released once that push has finished.
      free() { if (state === 'open') state = 'been freed'; if (!busy) release(); }
    };
  }

  // The info roundTrip, celtRoundTrip, speexRoundTrip and vr12RoundTrip return, from a
  // codec stage's counts and the settings process() gives them.
  function codecResultInfo(kind, voice, codec, counts, gate, gateOpts, bitrate, packetBytes, sampleRate) {
    const { lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames, spurts, encodedBytes, modes, frameLog, frameBytes } = counts;
    const gateInfo = { gate: gate ? Number(gateOpts.thresholdDb) : null, prerollFrames: gate ? gate.preroll : 0, holdFrames: gate ? gate.hold : 0 };
    const size = voice.frameSize;
    if (kind === 'celt') {
      return { backend: 'celt', version: voice.version, runtime: 'celt-0.11', sampleRate, bitrate: Math.round(packetBytes * 8 * sampleRate / size),
        application: 'celt', signal: 'auto', complexity: codec.complexity ?? 10, vbr: false, dtx: false,
        frameSamples: size, frameMs: 1000 * size / sampleRate, packetBytes, ...celtModeRate(codec),
        lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames: 0, spurts, ...gateInfo,
        encodedBytes, modes, plc: 'celt', frameLog, frameBytes };
    }
    if (kind === 'speex') {
      // The game's Speex 1.0.2 module on 11025 Hz sound; a lost frame plays as
      // zeros; wrappedSamples counts decoded samples that wrapped past full scale.
      return { backend: 'speex', version: voice.version, runtime: 'speex-1.0.2', sampleRate,
        bitrate: voice.bitrate, quality: voice.quality, application: 'speex', signal: 'auto', complexity: voice.complexity,
        vbr: false, dtx: false, enhancement: voice.enhancement, frameSamples: size, frameMs: 1000 * size / sampleRate,
        packetBytes: voice.packetBytes,
        lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames: 0, spurts, ...gateInfo,
        encodedBytes, modes, plc: 'zeros', wrappedSamples: voice.wrapped, frameLog, frameBytes };
    }
    if (kind === 'vr12') {
      // vaudio_miles's VR12 on 11025 Hz sound (not a TF2 codec); a lost frame
      // plays as zeros; resets counts each codec object's resets.
      return { backend: 'vr12', version: voice.version, runtime: 'voxware-vr12', sampleRate,
        bitrate: voice.bitrate, application: 'vr12', signal: 'auto',
        vbr: false, dtx: false, frameSamples: size, frameMs: 1000 * size / sampleRate,
        packetBytes: voice.packetBytes,
        lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames: 0, spurts, ...gateInfo,
        encodedBytes, modes, plc: 'zeros', resets: voice.resets, frameLog, frameBytes };
    }
    // Opus, with the defaults roundTrip and its encoder settings give.
    return { backend: 'libopus', version: voice.version, runtime: codec.encoder?.runtime ?? '1.6.1', sampleRate, bitrate,
      application: codec.application ?? 'voip', signal: codec.signal ?? 'auto', complexity: codec.encoder?.complexity ?? 10,
      vbr: !!codec.encoder?.vbr, dtx: !!codec.encoder?.dtx, frameSamples: size, frameMs: 20,
      lookahead, frames, lostFrames, underrunFrames, gatedFrames, dtxFrames, spurts, ...gateInfo,
      encodedBytes, modes, plc: 'opus', frameLog, frameBytes };
  }

  /* ------------------------------------------------------------------ */
  /* Public surface                                                     */
  /* ------------------------------------------------------------------ */

  const TF2Audio = {
    process,
    // the stages a render keeps (W4-01b): which place a render would start
    // from, the keys, the lists the keys are made by and every option
    // process() reads, and whether a render's first seconds are the whole
    // render's (step 3)
    stagesHold,
    stageKeys,
    STAGE_OPTIONS: Object.freeze({ afterB: Object.freeze([...AFTER_B_OPTIONS]), afterA: Object.freeze([...AFTER_A_OPTIONS]),
      observers: Object.freeze([...STAGE_OBSERVERS]), read: Object.freeze([...READ_OPTIONS]) }),
    previewAllowed,
    encodeWav,
    toInt16,
    bufferToMono,
    // exposed for tests / tools
    resampleSinc,
    resampleLinear,
    firwin2,
    applyFirZeroPhase,
    hardClip,
    receiverAutoGain,
    createGain,
    decodedFromFrames,
    biquadCoefs,
    applyBiquad,
    mulberry32,
    buildLossMask,
    realOpusRoundTrip,
    createLiveChain,
    createRender,
    roomPreset,
    streamResampleSinc,
    streamFir,
    streamAutoGain,
    streamLossMask,
    steamGiveOut,
    steamMessageLoss,
    steamFits,
    // the mixer and the output stage (W3-10); a room's mix (W3-17c) calls
    // the first two, its entries checked against TF2Room.entry
    mixEntry,
    mixUpsample2,
    mixOut,
    mixClip,
    mixDevicePosition,
    createDeviceStage,
    createOutputStage
  };

  if (typeof window !== 'undefined') window.TF2Audio = TF2Audio;
  else if (typeof self !== 'undefined') self.TF2Audio = TF2Audio;
  else if (typeof globalThis !== 'undefined') globalThis.TF2Audio = TF2Audio;
  if (typeof module !== 'undefined' && module.exports) module.exports = TF2Audio;
})();
