/* TF2 Voice Emulator, engine/live-chain.js: `createLiveChain`: the live monitor's chain.
 *
 * One of the engine's files (the list and the load order are in audio.js's header). It takes what it needs from the
 * files before it as TF2Engine's parts and adds its own. */
(function (root) {
  'use strict';
  const E = root.TF2Engine;
  const { INT16_FULL_SCALE, biquadCoefs, clamp, finiteOr, firStage, hardClip, mulberry32, sincWait, streamBiquad,
    streamFir, streamResampleSinc } = E.dsp;
  const { GAIN_BLOCK, createGain, streamAutoGain } = E.gain;
  const { MIX_BLOCK, MIX_RATE, createOutputStage, mixToFloat } = E.mix;
  const { steamLoser, streamLossMask } = E.network;
  const { DEFAULT_SENDER_GATE, FRAME_CODES, celtModeRate, gateThresholdDb, loadOpusModule, profileEq } = E.codec;
  const { STEAM_FRAME, STEAM_RATE, STEAM_VOICE_RATE, steamCapture, steamGiveOut, steamModules, steamReach,
    steamSenderOptions, steamTimeline } = E.steam;

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

  E.liveChain = Object.freeze({
    createLiveChain
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
