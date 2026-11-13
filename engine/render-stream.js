/* TF2 Voice Emulator, engine/render-stream.js: `createRender`: the same render a piece at a time.
 *
 * One of the engine's files (the list and the load order are in audio.js's header). It takes what it needs from the
 * files before it as TF2Engine's parts and adds its own. */
(function (root) {
  'use strict';
  const E = root.TF2Engine;
  const { INT16_FULL_SCALE, biquadCoefs, biquadStage, clamp, dropStage, finiteOr, firStage, hardClip, joinSamples,
    microYield, mulberry32, sampleStage, sincLength, sincStage } = E.dsp;
  const { createGain, decodedFromFrames, gainLead, streamAutoGain } = E.gain;
  const { createOutputStage, deviceRateOf, mixToFloat } = E.mix;
  const { buildLossMask, steamArrivalPlan, steamLoser, streamLossMask } = E.network;
  const { DEFAULT_SENDER_GATE, FRAME_CODES, celtModeRate, gateThresholdDb, loadOpusModule, profileEq,
    receivedCodecInfo } = E.codec;
  const { resolveRoom, roomModule, tailAtDevice } = E.room;
  const { STEAM_RATE, STEAM_VOICE_RATE, steamArriveAt, steamBoundTick, steamCapture, steamChannel, steamCodecInfo,
    steamGameTimeline, steamGiveOut, steamModules, steamPlayedInfo, steamReach, steamSenderOptions, steamTimeline } = E.steam;

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
  /* room streams (W3-17c).                                             */
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
   * codecInfo; steamUptime is taken as process() takes it.
   * timeline 'game' (W3-02c-2) streams, and is refused where process()
   * refuses it, before anything else is refused; so does opts.arriveAt
   * (BC-4), refused next.
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

    // The game's timeline (W3-02c-2), or a RangeError where it was asked for
    // and cannot run, as process() decides it (steamGameTimeline).
    const game = steamGameTimeline(opts.timeline, { codecKey, codec, enableCodec, received });
    // opts.arriveAt (BC-4), or a RangeError where it cannot run, as process()
    // decides it (steamArriveAt).
    const arriveAt = steamArriveAt(opts.arriveAt, game);

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
      // made once per message in the sender's order, and the per-frame mask
      // a frame at a time in the sender's frame order (streamLossMask gives
      // buildLossMask's values); as in process() it is made with a loss and a
      // jitter of 0 and gives no late frame (BC-4). A sample is given out once
      // no later packet can reach it: past the open spurt's next packet, and a
      // spurt not yet opened starts at most a chunk and the pre-roll before
      // the last sample given to the sender.
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
      const nextMiss = streamLossMask(framesPerPacket, 0, rand, 0);
      const loser = steamLoser(opts, lossPct, finiteOr(opts.seed, 0xC0FFEE) >>> 0);
      let frame = 0, given = 0, fed = 0, index = 0, lastTick = -1, voiceOut = 0;
      const miss = (f) => {
        if (f !== frame++) throw new Error(`createRender: frame ${f} reached the network out of order`);
        return nextMiss();
      };
      const resampler = opts.swrKernel !== undefined ? swr.createResampler({ kernel: opts.swrKernel }) : swr.createResampler();
      // On the game's timeline, process()'s channel, given the messages as
      // they come, each on its arrival tick from process()'s arrival model
      // (BC-4: the same seed and frame rate); steamTimeline lays nothing.
      const arrivals = game ? steamArrivalPlan({ jitterMs, fps: opts.fps, seed: finiteOr(opts.seed, 0xC0FFEE) >>> 0, arriveAt }) : null;
      const channel = game ? steamChannel({ length: voiceLength, lookahead: stream.lookahead, fps: opts.fps, bufferMs: opts.bufferMs,
        autoGain, avgGain, maxGain, voiceScale, arrive: arrivals ? arrivals.at : null }) : null;
      const timeline = steamTimeline({ voiceLength, codecLength, lookahead: stream.lookahead, resampler,
        gain: autoGain && !channel ? createGain({ avgGain, maxGain, scale: voiceScale }) : null,
        onDecoded: opts.onDecoded, onResampled: opts.onResampled, channel });
      const feed = async (messages) => {
        for (const msg of messages) {
          lastTick = msg.tick;
          timeline.add(msg, await stream.message(msg, miss, loser.lose(index++, msg)));
          if ((++fed & 63) === 63) await microYield();
        }
      };
      steam = { sender, settings, resampler, timeline, lossSet: loser.set, played: null, arrivals, channel };
      // The game's timeline: after a chunk's messages, no later message has a
      // tick below max(lastTick + 1, ceil((given / 24000 + relay) / tick)), with
      // given the samples handed to the sender so far, and relay and tick the
      // sender's constants. A read is never earlier than the end of the last
      // capture step it takes (steam-sender.js), and a message's tick is
      // max(lastTick + 1, ceil((since + relay) / tick)): the sender's next read
      // takes samples from `given` on, so its since is at least given / 24000.
      // The channel runs every block that starts before that tick; with
      // arrival times (BC-4) before the bound's arrival tick, which is a bound
      // too, since no later message has a sender tick below the bound and the
      // arrival tick never falls (steamChannel's advance maps it).
      const S = SteamSender.STEAM_SENDER;
      const bound = () => steamBoundTick(S, lastTick, given);
      stages.push({
        async push(x) {
          given += x.length;
          await feed(sender.push(steamCapture(x)));
          if (channel) {
            channel.advance(bound());
            const y = channel.take();
            voiceOut += y.length;
            return y;
          }
          return timeline.take(steamGiveOut(given, timeline.cursor, steamReach(SteamSender.STEAM_SENDER), stream.lookahead, false));
        },
        async flush() {
          await feed(sender.finish());
          if (channel) {
            // The arrival of every tick through the render's last, as
            // process() asks it, before the end.
            channel.ask(bound());
            steam.played = channel.finish();
            const y = channel.take();
            voiceOut += y.length;
            if (voiceOut !== voiceLength) {
              throw new Error(`TF2Audio: the voice channel gave ${voiceOut} samples for a voice of ${voiceLength}.`);
            }
            return y;
          }
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
      // The gain ran on the decoded packets (steamTimeline), or in the
      // channel's gain object on the game's timeline, which also scaled,
      // clipped and rounded them with the auto-gain off.
      if (!autoGain && !game) {
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
          if (steam.played) codecInfo = steamPlayedInfo(codecInfo, steam.played, voice.lookahead);
          if (steam.arrivals) {
            codecInfo.arrivals = { jitterMs: steam.arrivals.jitterMs, fps: steam.arrivals.fps, floorTicks: steam.arrivals.floorTicks,
              ...steam.channel.arrivals() };
          }
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

  E.renderStream = Object.freeze({
    createRender
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
