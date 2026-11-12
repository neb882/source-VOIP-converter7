/* TF2 Voice Emulator, engine/render.js: `process`, and the stages it keeps (W4-01b).
 *
 * One of the engine's files (the list and the load order are in audio.js's header). It takes what it needs from the
 * files before it as TF2Engine's parts and adds its own. */
(function (root) {
  'use strict';
  const E = root.TF2Engine;
  const { INT16_FULL_SCALE, applyBiquad, applyFirZeroPhase, biquadCoefs, bufferToMono, clamp, encodeWav, finiteOr,
    hardClip, joinSamples, microYield, mulberry32, resampleSinc, sincLength } = E.dsp;
  const { createGain, decodedFromFrames, gainLead, receiverAutoGain } = E.gain;
  const { createMixStage, createOutStage, deviceRateOf, joinInts } = E.mix;
  const { buildLossMask, retimeSpurts, steamLoser } = E.network;
  const { DEFAULT_SENDER_GATE, celtModeRate, gateThresholdDb, loadOpusModule, profileEq, receivedCodecInfo } = E.codec;
  const { resolveRoom, roomPreset, tailAtDevice } = E.room;
  const { STEAM_FRAME, STEAM_RATE, STEAM_VOICE_RATE, steamCapture, steamCodecInfo, steamModules, steamSenderOptions,
    steamTimeline } = E.steam;

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

  E.render = Object.freeze({
    AFTER_A_OPTIONS, AFTER_B_OPTIONS, READ_OPTIONS, STAGE_OBSERVERS, previewAllowed, process, stageKeys, stagesHold
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
