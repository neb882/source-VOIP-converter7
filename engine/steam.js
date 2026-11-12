/* TF2 Voice Emulator, engine/steam.js: the steam profile: its constants, its capture, its sender's options, its
 * timeline, its codec information.
 *
 * One of the engine's files (the list and the load order are in audio.js's header). It takes what it needs from the
 * files before it as TF2Engine's parts and adds its own. */
(function (root) {
  'use strict';
  const E = root.TF2Engine;
  const { FRAME_CODES, gateThresholdDb } = E.codec;

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
  function steamTimeline(cfg) {
    const { lookahead, resampler, gain } = cfg;
    const voiceLength = cfg.voiceLength ?? Infinity, growing = cfg.codecLength === undefined;
    let slots = growing ? 256 : Math.ceil((cfg.codecLength + lookahead) / STEAM_FRAME);
    let frameLog = new Uint8Array(slots), frameBytes = new Uint16Array(slots), frameMode = new Array(slots).fill(null);
    let buf = new Float32Array(cfg.capacity || 1 << 16), base = 0, high = 0;
    let spurt = null, cursor = 0, open = false, laid = false, calls = 0, dropped = 0, moved = 0;
    let messages = 0, lostMessages = 0, refusedMessages = 0;
    const spans = [];   // each spurt's laid spans, [from, to) on the voice timeline
    const centre = (i) => (i * STEAM_FRAME + STEAM_FRAME / 2 - lookahead) * STEAM_VOICE_RATE / STEAM_RATE;

    function lay(y, at, floor) {
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
          spans.push([cursor, cursor]);
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
          if (!made.silence) {
            let at = place;
            if (given !== undefined && Math.max(at, 0) < given) {
              if (!laid) dropped += Math.max(0, Math.min(at + y.length, given) - Math.max(at, 0));
              else {
                cfg.onMove?.(at, given);
                moved++;
                at = given;
                spans.push([at, at]);
              }
            }
            lay(y, at, given);
            mark(made.blocks, y.length, at);
            cursor = at + y.length;
            spans[spans.length - 1][1] = cursor;
            laid = true;
          }
        }
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
      // The spurts' laid spans, inside [0, voiceLength).
      spans: () => spans.map(([a, b]) => [Math.max(a, 0), Math.min(b, voiceLength)]).filter(([a, b]) => b > a),
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
    STEAM_FRAME, STEAM_RATE, STEAM_VOICE_RATE, steamCapture, steamCodecInfo, steamFits, steamGiveOut, steamModules,
    steamReach, steamSenderOptions, steamTimeline
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
