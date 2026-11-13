/* TF2 Voice Emulator, engine/steam.js: the steam profile: its constants, its capture, its sender's options, its
 * timeline, the receiver's voice channel on the game's timeline (W3-02c-2) with each message on its arrival tick
 * (BC-4), its codec information.
 *
 * One of the engine's files (the list and the load order are in audio.js's header). It takes what it needs from the
 * files before it as TF2Engine's parts and adds its own. */
(function (root) {
  'use strict';
  const E = root.TF2Engine;
  const { FRAME_CODES, gateThresholdDb } = E.codec;
  const { INT16_FULL_SCALE, clamp, joinSamples, roundEven } = E.dsp;
  const { createGain } = E.gain;

  /* ------------------------------------------------------------------ */
  /* The `steam` profile: Steam's own sender and decoder                */
  /*                                                                    */
  /* A profile whose senderGate.rule is 'steam' renders as Steam does   */
  /* (docs/reports/W3-09-steam-voice.md; docs/work-orders/W3-11-steam-  */
  /* gate.md, part a). The capture is rounded to 16 bits; Steam's       */
  /* sender (steam-sender.js) gates chunks of it and cuts its messages; */
  /* each message's frames are encoded and decoded with the library's   */
  /* own 16-bit decoder under Steam's decoder rules (opus-codec.mjs     */
  /* createSteamStream); each message's samples go, whole, through one  */
  /* FFmpeg libswresample for the whole render (vendor/swresample) as   */
  /* Steam's decoder calls it; the gain is fed the decoded packets in   */
  /* order; and the packets are laid on the source's timeline.          */
  /* ------------------------------------------------------------------ */

  // The codec's stream rate and the voice rate: the resampler's 147/80.
  const STEAM_RATE = 24000, STEAM_VOICE_RATE = 44100, STEAM_FRAME = 480;
  // How far before the last sample the sender was given a spurt can still
  // open: its longest chunk (the clock gains at most 3 grid steps between two
  // frames: steam-sender.js's MAX_CHUNK) and its pre-roll, from the sender's
  // own constants (4650 samples).
  const steamReach = (S) => 3 * S.grid + S.preroll;
  // The decoder conceals at most this many lost frames before a frame that
  // arrives (createSteamDecoder in opus-codec.mjs; W3-11a, point 6).
  const STEAM_CONCEAL_MAX = 10;
  // One frame at the voice rate: 480 samples at 24 kHz are 882 at 44.1 kHz,
  // and the resampler gives exactly 882 F samples for a packet of F frames.
  const STEAM_SLOT = STEAM_FRAME * STEAM_VOICE_RATE / STEAM_RATE;
  // The game's tick in ms, at which a delay in ticks is reported (read: the
  // client tick, W3-03).
  const STEAM_TICK_MS = 15;
  // The engine's room for one message's sound: 22,528 bytes, 11,264 16-bit
  // samples (W3-03, read). Steam copies nothing when a message's resampled
  // sound is longer, and the engine queues nothing of it (the W3-16 read;
  // seen in Set J and by its effect in Set C, finding 29): 12 frames are
  // 10,584 samples and fit, 13 are 11,466 and do not.
  const STEAM_ROOM = 22528 / 2;
  // Whether the game takes a packet of n voice-rate samples (BC-1, rule D).
  const steamFits = (n) => n <= STEAM_ROOM;

  // What a `steam` stage can give out (W3-11b), shared by createRender and
  // the live chain: the voice-rate samples before the returned index. pushed
  // is the samples given to the sender so far, cursor where the open spurt's
  // next packet will be laid (Infinity when no spurt is open), reach how far
  // before the last sample pushed a message can start (steamReach, or the
  // live chain's low-latency reach). R is the render's own bound: no spurt
  // not yet opened can be laid before it. createRender (bounded false) waits
  // for the cursor without limit: min(R, cursor). The live chain (bounded
  // true) waits for it at most ten frames at the voice rate
  // (STEAM_CONCEAL_MAX), so that a gap of up to ten lost frames, during which
  // nothing is decoded and the cursor stands still, is laid exactly as the
  // render lays it: min(R, max(cursor, R - 8820)).
  const STEAM_WAIT = STEAM_CONCEAL_MAX * STEAM_FRAME * STEAM_VOICE_RATE / STEAM_RATE;
  function steamGiveOut(pushed, cursor, reach, lookahead, bounded) {
    const R = Math.floor((pushed - reach - lookahead) * STEAM_VOICE_RATE / STEAM_RATE) - 1;
    return Math.min(R, Math.max(cursor, bounded ? R - STEAM_WAIT : -Infinity));
  }

  function steamModules() {
    const sender = typeof TF2SteamSender !== 'undefined' ? TF2SteamSender : null;
    const swr = typeof TF2Swresample !== 'undefined' ? TF2Swresample : null;
    if (!sender || !swr) {
      throw new Error('The steam profile needs steam-sender.js and vendor/swresample/swresample.js loaded beside audio.js.');
    }
    return { sender, swr };
  }

  // The receiver's voice channel (voice-channel.js), for a render on the
  // game's timeline (W3-02c-2), found as steamModules() finds the sender.
  function steamChannelModule() {
    const channel = typeof TF2VoiceChannel !== 'undefined' ? TF2VoiceChannel : null;
    if (!channel) throw new Error('The game\'s timeline (opts.timeline \'game\') needs voice-channel.js loaded beside audio.js.');
    return channel;
  }

  // opts.timeline (W3-02c-2): the timeline a render plays the voice on.
  // 'source' (undefined and null too): the packets laid on the source's
  // timeline, as every render before. 'game': the receiver's voice channel
  // plays them on the game's clock (steamChannel). 'game' runs where the
  // render has the game's own packets: the steam codec, on, with the sender's
  // messages (not a demo's received voice); the older codecs have no sender
  // model and their ring is another size. Anywhere else it is refused, never
  // ignored: a render that asked for it and was given the source's timeline
  // would let a caller compare two renders that are one. Any other value is
  // refused too. process() and createRender() call this at their entry, with
  // their own reading of the other options; true for 'game'.
  function steamGameTimeline(value, { codecKey, codec, enableCodec, received }) {
    if (value === undefined || value === null || value === 'source') return false;
    if (value !== 'game') {
      let text;
      try { text = typeof value === 'string' ? JSON.stringify(value) : String(value); } catch (e) { text = `a ${typeof value}`; }
      throw new RangeError(`TF2Audio: opts.timeline is 'source' or 'game' (undefined and null are 'source'), not ${text}.`);
    }
    const refuse = (why) => { throw new RangeError(`TF2Audio: opts.timeline 'game' is refused here, not ignored: ${why}.`); };
    if (received) refuse('a demo\'s received voice (opts.received) has no packets of the sender\'s to give the channel');
    if (!enableCodec) refuse('with the codec bypassed (enableWarble false) no packet reaches the channel');
    if (codec.senderGate?.rule !== 'steam') refuse(`it runs on the steam codec only, and ${codecKey} has no sender model`);
    return true;
  }

  // The game's timeline: once the sender has been given `given` samples and
  // its messages up to the tick `lastTick` (-1 for none), no later message
  // has a tick below this (createRender's bound, W3-02c-2; its reasoning is
  // there). With every sample given and every message made it is the render's
  // last tick, through which process() and createRender both ask the arrival
  // (steamChannel's ask) before finish(), so that both ask the same ticks
  // (BC-4a's fix round, point 2). S is the sender's STEAM_SENDER.
  const steamBoundTick = (S, lastTick, given) => Math.max(lastTick + 1, Math.ceil((given / S.rate + S.relay) / S.tick));

  // opts.arriveAt (BC-4): tests and replays only (the page never sends it),
  // a function (tick) => the tick on which the message the sender gave that
  // tick reaches the voice channel, in place of the arrival model: how a
  // log's own arrival ticks are replayed. It runs on the game's timeline
  // only (game: what steamGameTimeline decided); anywhere else, and for
  // anything but a function, a RangeError, never ignored. undefined and null
  // are none. The channel asks it for every whole tick from 0 to the
  // render's last tick, once each and in order, in process() and
  // createRender alike; what it gives is checked there (steamChannel).
  function steamArriveAt(value, game) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'function') throw new RangeError(`TF2Audio: opts.arriveAt is a function (tick) => tick, not a ${typeof value}.`);
    if (!game) throw new RangeError('TF2Audio: opts.arriveAt runs on the game\'s timeline only (opts.timeline \'game\' on the steam codec), and is refused here, not ignored.');
    return value;
  }

  // The receiver's voice channel in a render on the game's timeline
  // (W3-02c-2): voice-channel.js's createTimeline, made with the render's
  // length at the voice rate, the listener's fps and voice_buffer_ms as given
  // (the module takes its own defaults and limits), the codec's look-ahead as
  // codecDelay (each source is the packet's place, which is that much
  // earlier than the sender's frame), and the gain object:
  //   - with the auto-gain on, reset() makes a new gain from the receiver's
  //     three settings, and the channel calls it at each open, which is where
  //     the engine resets its gain (finding 26, read); process(y) runs the
  //     gain over the packet, a late frame's samples passed around it as
  //     steamTimeline passes them on the source's timeline (frame j of F in
  //     a packet of n samples is samples round(j n / F) to round((j + 1) n /
  //     F));
  //   - with it off there is no gain: process(y) is stage 4's scale and clip
  //     (in single precision, as stage 4 keeps them) and the mix entry's
  //     rounding to the nearest whole 16-bit value, ties to even, so the
  //     channel, which works in whole values and truncates in its blend, is
  //     given the value the source's timeline brings to the mix.
  // steamTimeline's add() hands it each message that arrived:
  // push(tick, y, blocks, source), y the packet over 32768 (empty for an end
  // marker alone or a refused packet), blocks its frames' blocks. What the
  // timeline gives out is kept in order: take() returns it joined, and
  // finish() ends the timeline and returns its info. Nothing pushed is kept
  // or written to: the gain's output is a new array.
  // arrive (BC-4; null: none): the tick on which the message the sender gave
  // a tick reaches the channel (steamArrivalPlan's at: the arrival model, or
  // opts.arriveAt). It is used in the two places a tick reaches the module:
  // push(tick) pushes at arrive(tick), and advance(tick) (createRender's
  // bound: no later message has a sender tick below it) advances to
  // arrive(tick), which is a bound too, since arrive never falls. arrive is
  // asked for every whole tick from 0 up to the highest asked so far, once
  // each and in order, whatever ticks the messages and the bounds fall on;
  // ask(tick) asks through a tick without moving the channel, which both
  // renderers do with the render's last tick before finish(), so that
  // process() and createRender ask it the same ticks (the fix round of
  // BC-4a, point 2). What it gives must be a whole number, 0 or more, that
  // never falls, or a RangeError.
  // arrivals() counts the messages pushed (lost ones never are): { messages,
  // meanMs, maxMs, sameTick }, the delays arrive(tick) - tick at 15 ms a
  // tick and how many came on the tick of the message before; null without
  // arrive.
  function steamChannel({ length, lookahead, fps, bufferMs, autoGain, avgGain, maxGain, voiceScale, arrive = null }) {
    const { createTimeline } = steamChannelModule();
    let lastArrival = -Infinity, messages = 0, sumTicks = 0, maxTicks = -Infinity, sameTick = 0;
    const answers = [];   // arrive's answer for each tick from 0, asked in order
    const at = (tick) => {
      if (!arrive) return tick;
      if (!Number.isInteger(tick) || tick < 0) throw new RangeError(`TF2Audio: the channel takes whole ticks from 0, not ${tick}.`);
      while (answers.length <= tick) {
        const t = answers.length, a = arrive(t);
        const said = `tick ${t} arrived on ${a}`, who = '(opts.arriveAt or the arrival model)';
        if (!Number.isInteger(a)) throw new RangeError(`TF2Audio: an arrival tick is a whole number; ${said} ${who}.`);
        if (a < 0) throw new RangeError(`TF2Audio: an arrival tick is 0 or more; ${said} ${who}.`);
        if (a < lastArrival) throw new RangeError(`TF2Audio: an arrival tick never falls; ${said} after ${lastArrival} ${who}.`);
        answers.push(a);
        lastArrival = a;
      }
      return answers[tick];
    };
    let blocks = [], g = null;
    const late = (j) => blocks[j].code === FRAME_CODES.late;
    const gain = autoGain ? {
      reset() { g = createGain({ avgGain, maxGain, scale: voiceScale }); },
      process(y) {
        const F = blocks.length, n = y.length;
        if (!blocks.some((b) => b.code === FRAME_CODES.late)) return g.process(y);
        const out = Float32Array.from(y);
        for (let j = 0; j < F;) {
          if (late(j)) { j++; continue; }
          let k = j;
          while (k < F && !late(k)) k++;
          const a = Math.round(j * n / F), b = Math.round(k * n / F);
          out.set(g.process(y.subarray(a, b)), a);
          j = k;
        }
        return out;
      }
    } : {
      reset() {},
      process: (y) => Float32Array.from(y, (v) =>
        roundEven(clamp(Math.fround(v * voiceScale), -INT16_FULL_SCALE, INT16_FULL_SCALE) * 32768) / 32768)
    };
    const timeline = createTimeline({ length, fps, bufferMs, codecDelay: lookahead / STEAM_RATE, gain });
    let pieces = [], lastMessage = null;
    return {
      push(tick, y, packetBlocks, source) {
        blocks = packetBlocks;
        const a = at(tick);
        if (arrive) {
          messages++;
          sumTicks += a - tick;
          if (a - tick > maxTicks) maxTicks = a - tick;
          if (a === lastMessage) sameTick++;
          lastMessage = a;
        }
        pieces.push(timeline.push({ tick: a, pcm: y, source }));
      },
      advance(tick) { pieces.push(timeline.advance(at(tick))); },
      ask(tick) { at(tick); },
      arrivals: () => (arrive ? { messages, meanMs: messages ? STEAM_TICK_MS * sumTicks / messages : 0,
        maxMs: messages ? STEAM_TICK_MS * maxTicks : 0, sameTick } : null),
      finish() {
        const end = timeline.finish();
        pieces.push(end.samples);
        return end.info;
      },
      take() {
        const out = joinSamples(pieces);
        pieces = [];
        return out;
      }
    };
  }

  // codecInfo of a render on the game's timeline (W3-02c-2), from the
  // source's (steamCodecInfo's) and the channel's info: frameLog and
  // frameBytes become what was played, new arrays of the sent logs' length,
  // slot i taking the sent slot floor((source[i] x 80 / 147 + lookahead) /
  // 480), the inverse of steamTimeline's centre(), or 0 where source[i] is
  // -1 or i is past its end; `sent` holds the source's logs; `channel` is the
  // channel's info, whole. The counters stay the sender's, and `network` is
  // the source timeline's, which the two timelines share.
  function steamPlayedInfo(codecInfo, info, lookahead) {
    const sent = { frameLog: codecInfo.frameLog, frameBytes: codecInfo.frameBytes };
    const n = sent.frameLog.length, source = info.source;
    const frameLog = new sent.frameLog.constructor(n), frameBytes = new sent.frameBytes.constructor(n);
    for (let i = 0; i < Math.min(n, source.length); i++) {
      if (source[i] === -1) continue;
      const k = Math.floor((source[i] * STEAM_RATE / STEAM_VOICE_RATE + lookahead) / STEAM_FRAME);
      if (k >= 0 && k < n) { frameLog[i] = sent.frameLog[k]; frameBytes[i] = sent.frameBytes[k]; }
    }
    return { ...codecInfo, frameLog, frameBytes, sent, channel: info };
  }

  // The capture's 16 bits, after the capture roll-off at 24 kHz: Steam's
  // recorder hands its gate and encoder 16-bit samples. q = round(x * 32768),
  // ties to even, clamped to -32768..32767.
  function steamCapture(x) {
    const q = new Int16Array(x.length);
    for (let i = 0; i < x.length; i++) {
      const v = x[i] * 32768;
      let r = Math.round(v);
      if (r - v === 0.5 && (r & 1)) r -= 1;
      q[i] = r > 32767 ? 32767 : r < -32768 ? -32768 : r;
    }
    return q;
  }

  // The sender's settings from process()'s options. opts.gateThresholdDb
  // as gateThresholdDb() reads it: the profile's own is Steam's own gate
  // exactly (no meanMin passed: 327.67, 1% of full scale); a typed number is
  // the mean of |x| in dBFS (-90 to 0), meanMin = 32767 x 10^(dB / 20); the
  // peak rule does not move. The gate off is the sender's own setting: every chunk is sent, as
  // one spurt, and everything after the sender is the same path.
  // opts.steamUptime (W3-16): undefined or null passes nothing (the sender's
  // own 777600 s); anything else is passed as the sender's uptime, unclamped,
  // so a value that is not a finite number from 0 to 4,000,000 throws the
  // sender's RangeError.
  function steamSenderOptions(opts, gateOn, seed) {
    const S = steamModules().sender.STEAM_SENDER;
    const db = gateThresholdDb(opts.gateThresholdDb, null);
    const meanMin = db === null ? S.meanMin : 32767 * 10 ** (db / 20);
    const sender = { seed };
    if (!gateOn) sender.gate = false;
    if (db !== null) sender.meanMin = meanMin;
    if (opts.steamUptime != null) sender.uptime = opts.steamUptime;
    return { sender, gate: gateOn, meanMin, thresholdDb: db === null ? -40 : db };
  }

  // The receiver on the source's timeline, fed each sender message with
  // what createSteamStream made of it (W3-11a, points 6 to 9; BC-1). Every
  // message is given to add(), lost or not: the timeline follows the sender,
  // a spurt anchored at its opening message's start and closed at its last.
  //   - One resampler for the whole render, given each message's samples
  //     whole (a silence record's as zeros): never reset, not by an Opus
  //     decoder reset either; a message with no samples makes no call (a lost
  //     message, a lost silence record among them).
  //   - The refusal (BC-1, rule D): a packet whose resampled sound is longer
  //     than STEAM_ROOM is taken by nothing after the resampler: not the
  //     gain, not laid, no slot marked; the decoder and the resampler keep the
  //     state it left them in, and the cursor moves past its place.
  //   - One gain, reset once (at the render's start: no channel is assigned
  //     on this timeline), fed the resampled packets in the sender's order,
  //     each as its 16-bit values / 32768, the silence records' zeros among
  //     them: those are decoded zeros and send it to its cap, as in the game.
  //     A late frame's samples were not decoded, so they are left out of what
  //     the gain is given and laid as they are: frame j of F in a packet of n
  //     output samples is samples round(j n / F) to round((j + 1) n / F).
  //     That span is approximate, and meant to be (the resampler is 16 inputs
  //     late after its first packet and spreads a frame over 16 inputs each
  //     side). The zeros between spurts never reach the gain: its blocks of
  //     128 run over the decoded samples end to end, across packets and spurts.
  //   - Laying: a spurt's anchor is round((start - lookahead) x 147 / 80) of
  //     its opening message, arrived or lost. A packet is laid whole at the
  //     cursor (where the spurt's last packet laid or refused ended; the
  //     anchor at first) plus 882 samples for each frame in front of it that
  //     no block stands for (made.skipped: past the ten concealed frames of a
  //     gap, or lost before a reset), so a frame that is played is played at
  //     its own time and later sound does not move (BC-1, decision 2); that
  //     time stays empty. With no gap of more than ten this is each packet
  //     directly after the one before, as W3-11a laid them. A silence record
  //     is not laid; where packets overlap the later one wins; samples before
  //     0 or past voiceLength are dropped (they have still been through the
  //     gain).
  //   - The frame log: 20 ms slots on the source's time, slot i covering the
  //     codec samples i x 480 - lookahead onwards, as the frame path's frames
  //     do; each takes the code and size of the frame whose laid samples cover
  //     its centre (a concealed frame's: lost; a late one's: late), or 0.
  // add() returns nothing; take(end) gives the samples up to end, which the
  // caller must know no later packet can reach (createRender's bound).
  //
  // A chain with no end (the live chain, W3-11b) leaves out codecLength and
  // voiceLength: the frame log grows as packets are laid, and nothing is cut
  // at an end. It passes add() a third argument, given: the samples already
  // given out (indexes 0 to given - 1), before which nothing may be laid. A
  // packet that would land there is not refused:
  //   - the first packet laid in a spurt (the opening message's, which
  //     carries the pre-roll, or whichever message brings the spurt's first
  //     packet when that one was lost) is cut: its samples before given are
  //     dropped, and those at or after index 0 are counted in dropped(); the
  //     rest is laid where it belongs. Where the cut overlaps the spurt
  //     before, that spurt's tail stays (it has been given out), where a
  //     render has the new pre-roll;
  //   - a packet before index 0 while nothing at or after 0 has been given
  //     out (a spurt anchored before 0, at the chain's start) is not late:
  //     it is laid as the render lays it, what lies before 0 dropped;
  //   - any other packet is moved: laid whole from given, the cursor
  //     following it (moved() counts them; cfg.onMove(from, to) is told the
  //     cursor as it stood and given). The gain has already run on it, as in
  //     a render: a move changes only where the packet lands.
  // A slot whose centre is before given is final (final()). A render passes
  // no given and keeps the fixed log and the throw.
  //
  // A render on the game's timeline (W3-02c-2) passes cfg.channel, a
  // steamChannel, and no gain. Then each message runs as above (the counts,
  // the spurt's anchor, the resampler, the place, the refusal, the frame log
  // and the cursor) but nothing is laid: what arrived goes to the
  // channel on its message's tick instead, with its source position, the
  // channel's gain running on it there. A sound packet: the resampler's
  // samples over 32768, whole, at its place; a silence record: its resampled
  // zeros, at -1; a message that arrived with no samples (an end marker
  // alone): nothing, at the cursor; a refused packet: nothing, at its place.
  // A lost message is not handed on (BC-3). With no channel, add() is what it
  // was before W3-02c-2, statement for statement.
  function steamTimeline(cfg) {
    const { lookahead, resampler, gain } = cfg;
    const channel = cfg.channel || null;
    const voiceLength = cfg.voiceLength ?? Infinity, growing = cfg.codecLength === undefined;
    let slots = growing ? 256 : Math.ceil((cfg.codecLength + lookahead) / STEAM_FRAME);
    let frameLog = new Uint8Array(slots), frameBytes = new Uint16Array(slots), frameMode = new Array(slots).fill(null);
    let buf = new Float32Array(cfg.capacity || 1 << 16), base = 0, high = 0;
    let spurt = null, cursor = 0, open = false, laid = false, calls = 0, dropped = 0, moved = 0;
    let messages = 0, lostMessages = 0, refusedMessages = 0;
    const centre = (i) => (i * STEAM_FRAME + STEAM_FRAME / 2 - lookahead) * STEAM_VOICE_RATE / STEAM_RATE;

    function lay(y, at, floor) {
      if (channel) return;   // on the game's timeline the channel plays the packet: nothing is laid
      const from = Math.max(at, 0, floor ?? 0), to = Math.min(at + y.length, voiceLength);
      if (to <= from) return;
      if (from < base) throw new Error('TF2Audio: a Steam packet landed on samples already given out.');
      if (to - base > buf.length) {
        const grown = new Float32Array(Math.max(to - base, 2 * buf.length));
        grown.set(buf.subarray(0, high - base));
        buf = grown;
      }
      buf.set(y.subarray(from - at, to - at), from - base);
      if (to > high) high = to;
    }
    // The open-ended log grows to hold every slot whose centre is before `to`.
    function room(to) {
      const need = Math.ceil((to * STEAM_RATE / STEAM_VOICE_RATE + lookahead) / STEAM_FRAME) + 1;
      if (need <= slots) return;
      const n = Math.max(need, 2 * slots);
      const log = new Uint8Array(n), bytes = new Uint16Array(n), mode = new Array(n).fill(null);
      log.set(frameLog); bytes.set(frameBytes);
      for (let i = 0; i < slots; i++) mode[i] = frameMode[i];
      frameLog = log; frameBytes = bytes; frameMode = mode; slots = n;
    }
    function mark(blocks, n, at) {
      const F = blocks.length;
      if (growing) room(at + n);
      for (let j = 0; j < F; j++) {
        const a = at + Math.round(j * n / F), b = at + Math.round((j + 1) * n / F);
        let i = Math.max(0, Math.floor((a * STEAM_RATE / STEAM_VOICE_RATE + lookahead) / STEAM_FRAME - 0.5) - 1);
        for (; i < slots; i++) {
          const c = centre(i);
          if (c >= b) break;
          if (c >= a) { frameLog[i] = blocks[j].code; frameBytes[i] = blocks[j].bytes; frameMode[i] = blocks[j].mode; }
        }
      }
    }
    return {
      add(msg, made, given) {
        messages++;
        if (made.lost) lostMessages++;
        if (!made.silence && msg.spurt !== spurt) {
          spurt = msg.spurt; open = true; laid = false;
          cursor = Math.round((msg.start - lookahead) * STEAM_VOICE_RATE / STEAM_RATE);
        }
        const pcm = made.pcm;
        if (pcm.length) {
          cfg.onDecoded?.(pcm, msg);
          const y16 = resampler.packet(pcm);
          calls++;
          cfg.onResampled?.(y16, msg);
          // Where the packet belongs: past the frames nobody fills.
          const place = cursor + STEAM_SLOT * (made.skipped || 0);
          if (!steamFits(y16.length)) {
            refusedMessages++;
            if (!made.silence) cursor = place + y16.length;
            if (msg.end) open = false;
            if (channel) channel.push(msg.tick, new Float32Array(0), [], made.silence ? -1 : place);
            return;
          }
          let y = Float32Array.from(y16, v => v / 32768);
          if (gain) {
            const blocks = made.blocks, F = blocks.length, n = y.length;
            const late = (j) => blocks[j].code === FRAME_CODES.late;
            if (!blocks.some((b) => b.code === FRAME_CODES.late)) y = gain.process(y);
            else {
              for (let j = 0; j < F;) {
                if (late(j)) { j++; continue; }
                let k = j;
                while (k < F && !late(k)) k++;
                const a = Math.round(j * n / F), b = Math.round(k * n / F);
                y.set(gain.process(y.subarray(a, b)), a);
                j = k;
              }
            }
          }
          if (channel) channel.push(msg.tick, y, made.blocks, made.silence ? -1 : place);
          if (!made.silence) {
            let at = place;
            if (given !== undefined && Math.max(at, 0) < given) {
              if (!laid) dropped += Math.max(0, Math.min(at + y.length, given) - Math.max(at, 0));
              else {
                cfg.onMove?.(at, given);
                moved++;
                at = given;
              }
            }
            lay(y, at, given);
            mark(made.blocks, y.length, at);
            cursor = at + y.length;
            laid = true;
          }
        }
        if (channel && !pcm.length && !made.lost) channel.push(msg.tick, new Float32Array(0), [], cursor);
        if (msg.end) open = false;
      },
      // Where the next packet of the spurt now open will be laid (Infinity
      // when none is open): nothing of this spurt lands before it.
      get cursor() { return open ? cursor : Infinity; },
      take(end) {
        end = Math.min(end, voiceLength);
        if (end <= base) return new Float32Array(0);
        const out = new Float32Array(end - base);
        out.set(buf.subarray(0, Math.max(0, Math.min(end, high) - base)));
        const keep = Math.max(0, high - end);
        if (keep) buf.copyWithin(0, end - base, high - base);
        buf.fill(0, keep, Math.max(keep, high - base));
        base = end;
        if (high < base) high = base;
        return out;
      },
      // The open-ended log: the slots whose centre is before `end` (final
      // once nothing can be laid before end), as { frameLog, frameBytes,
      // frameMode } from slot `from` on.
      final(from, end) {
        if (growing) room(Math.max(end, 0));
        let to = from;
        while (centre(to) < end) to++;
        return { from, to, frameLog: frameLog.subarray(from, to), frameBytes: frameBytes.subarray(from, to), frameMode: frameMode.slice(from, to) };
      },
      slots: () => ({ frames: slots, frameLog, frameBytes, frameMode }),
      calls: () => calls,
      dropped: () => dropped,
      moved: () => moved,
      // The messages given to add(), those lost on the way and those refused.
      network: () => ({ messages, lostMessages, refusedMessages })
    };
  }

  // codecInfo for a `steam` render. Its counters keep their meaning on the
  // frame log's slots, by what was laid: frames is the slots; gated, lost,
  // late and DTX frames the slots with those codes; modes and encodedBytes
  // the coding mode and packet size of the frame laid at each slot that is
  // not gated (a lost or late slot's frame was coded too). So, as on the frame
  // path, the modes add up to frames - gatedFrames and frameBytes to
  // encodedBytes. Then the sender's spurts, and what the sender and the
  // resampler did. network (BC-1): { messages, lostMessages, refusedMessages },
  // when loss is set (lossSet: lossPct above 0, or opts.loseMessage given) or
  // a message was refused; absent otherwise.
  function steamCodecInfo(codec, voice, timeline, sender, settings, resampler, bitrate, lossSet) {
    const { frames, frameLog, frameBytes, frameMode } = timeline.slots();
    const count = (code) => { let n = 0; for (let i = 0; i < frameLog.length; i++) if (frameLog[i] === code) n++; return n; };
    const modes = { silk: 0, hybrid: 0, celt: 0 };
    let encodedBytes = 0;
    for (let i = 0; i < frames; i++) if (frameLog[i] !== FRAME_CODES.gated) { modes[frameMode[i]]++; encodedBytes += frameBytes[i]; }
    const sent = sender.info();
    const info = { backend: 'libopus', version: voice.version, runtime: codec.encoder?.runtime ?? '1.1.5', sampleRate: STEAM_RATE, bitrate,
      application: codec.application ?? 'voip', signal: codec.signal ?? 'auto', complexity: codec.encoder?.complexity ?? 10,
      vbr: !!codec.encoder?.vbr, dtx: !!codec.encoder?.dtx, frameSamples: STEAM_FRAME, frameMs: 20,
      lookahead: voice.lookahead, frames, lostFrames: count(FRAME_CODES.lost), underrunFrames: count(FRAME_CODES.late),
      gatedFrames: count(FRAME_CODES.gated), dtxFrames: count(FRAME_CODES.dtx), spurts: sent.spurts.length,
      gate: settings.gate ? settings.thresholdDb : null, prerollFrames: 0, holdFrames: 0,
      encodedBytes, modes, plc: 'opus', frameLog, frameBytes,
      sender: { rule: 'steam', gate: settings.gate, meanMin: settings.meanMin, uptime: sent.uptime, chunks: sent.chunks, messages: sent.messages, spurts: sent.spurts },
      resampler: { kernel: resampler.kernel, calls: timeline.calls() } };
    const network = timeline.network();
    if (lossSet || network.refusedMessages > 0) info.network = network;
    return info;
  }

  E.steam = Object.freeze({
    STEAM_FRAME, STEAM_RATE, STEAM_VOICE_RATE, steamArriveAt, steamBoundTick, steamCapture, steamChannel, steamChannelModule,
    steamCodecInfo, steamFits, steamGameTimeline, steamGiveOut, steamModules, steamPlayedInfo, steamReach, steamSenderOptions, steamTimeline
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
