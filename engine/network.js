/* TF2 Voice Emulator, engine/network.js: loss and late frames: the retiming, the loss masks, the steam profile's
 * loss by message.
 *
 * One of the engine's files (the list and the load order are in audio.js's header). It takes what it needs from the
 * files before it as TF2Engine's parts and adds its own. */
(function (root) {
  'use strict';
  const E = root.TF2Engine;
  const { clamp, finiteOr, mulberry32 } = E.dsp;

  /* ------------------------------------------------------------------ */
  /* Network: packet loss and jitter                                    */
  /*                                                                    */
  /* `steam` (BC-1): lossPct is the share of the sender's messages that */
  /* never reach the listener, each message one packet with a draw of   */
  /* its own (steamMessageLoss), as the game loses a packet (read; see   */
  /* finding 8 in tests/REFERENCE_2026.md). The other profiles keep the  */
  /* earlier fit: a two-state (Gilbert-Elliott) process over packets of  */
  /* net_split frames whose stationary rate is lossPct of voice frames   */
  /* and whose bursts last 2.2 frames on average, fitted to the 2026     */
  /* net_fakeloss takes by a per-frame model; the decoder conceals lost  */
  /* frames (mask 1). Jitter, on every profile, makes frames arrive too  */
  /* late: 3.2% of frames at net_fakejitter 50, scaled linearly; one in  */
  /* ten plays as silence (mask 2) instead of being concealed (a fit,    */
  /* finding 9). See tests/REFERENCE_2026.md.                            */
  /* ------------------------------------------------------------------ */

  // TF2's receiver re-timing of talk spurts (tests/REFERENCE_2026.md,
  // finding 19): after a silence of up to 0.45 s, 41% of spurts play early,
  // by the silence less 0-130 ms (at most 350 ms); the spurt after keeps its
  // time. Moves the decoded audio (codec rate) and the frame log in place;
  // returns the moves as { time, shiftMs }.
  // A spurt's samples are its frames' on the frame path. On the steam path
  // (info.spans: the laid packets' sample ranges, which run up to half a slot
  // past the slots they mark) they are every laid span its slots meet, moved
  // whole, and never onto the spurt before; slots whose spans meet are one
  // spurt, so the empty time a gap of more than ten lost frames leaves inside
  // a sender's spurt (BC-1) does not split it.
  const RETIME = { maxGap: 0.45, chance: 0.41, leftMax: 0.13, maxShift: 0.35 };
  function retimeSpurts(samples, info, rate, rand) {
    const log = info.frameLog, size = info.frameSamples, lookahead = info.lookahead || 0;
    if (!log || !size) return [];
    const spurts = [];
    for (let f = 0; f < log.length; f++) {
      if (!log[f]) continue;
      const first = f;
      while (f + 1 < log.length && log[f + 1]) f++;
      spurts.push({ first, last: f });
    }
    const range = ({ first, last }) => {
      let from = first * size - lookahead, to = (last + 1) * size - lookahead;
      if (info.spans) {
        let a = Infinity, b = -Infinity;
        for (const [p, q] of info.spans) if (q > from && p < to) { a = Math.min(a, p); b = Math.max(b, q); }
        if (a < b) { from = a; to = b; }
      }
      return { from, to };
    };
    if (info.spans) {
      for (let k = spurts.length - 1; k > 0; k--) {
        if (range(spurts[k - 1]).to > range(spurts[k]).from) { spurts[k - 1].last = spurts[k].last; spurts.splice(k, 1); }
      }
    }
    const moves = [];
    let early = false;
    for (let k = 1; k < spurts.length; k++) {
      const gap = (spurts[k].first - spurts[k - 1].last - 1) * size / rate;
      if (early || gap > RETIME.maxGap || rand() >= RETIME.chance) { early = false; continue; }
      let shift = Math.round(Math.min(RETIME.maxShift, gap - RETIME.leftMax * rand()) * rate);
      const here = range(spurts[k]);
      if (info.spans) shift = Math.min(shift, here.from - range(spurts[k - 1]).to);
      const frames = Math.round(shift / size);
      if (frames < 1) { early = false; continue; }
      const { first, last } = spurts[k];
      const start = Math.max(shift, here.from), end = Math.min(samples.length, here.to);
      if (end > start) { samples.copyWithin(start - shift, start, end); samples.fill(0, Math.max(start - shift, end - shift), end); }
      log.copyWithin(first - frames, first, last + 1); log.fill(0, last + 1 - frames, last + 1);
      if (info.frameBytes) { info.frameBytes.copyWithin(first - frames, first, last + 1); info.frameBytes.fill(0, last + 1 - frames, last + 1); }
      moves.push({ time: start / rate, shiftMs: 1000 * shift / rate });
      early = true;
    }
    return moves;
  }

  function buildLossMask(nFrames, framesPerPacket, lossPct, rand, jitterMs = 0) {
    nFrames = Math.max(0, Math.floor(finiteOr(nFrames, 0)));
    framesPerPacket = Math.max(1, Math.round(finiteOr(framesPerPacket, 1)));
    rand = typeof rand === 'function' ? rand : mulberry32(0xC0FFEE);
    const net = VOICE_ENGINE.network;
    const p = clamp(finiteOr(lossPct, 0) / 100, 0, 1);
    const late = clamp(net.lateFramesAt50ms * finiteOr(jitterMs, 0) / 50, 0, 0.5);
    if ((p <= 0 && late <= 0) || nFrames <= 0) return null;
    const mask = new Uint8Array(nFrames);
    if (p >= 1) { mask.fill(1); return mask; }
    // Mean burst in packets; at high loss, lengthen bursts rather than cap the rate.
    const meanBurst = Math.max(1, net.burstMeanFrames / framesPerPacket);
    const pBG = p > 0 ? Math.min(1 / meanBurst, 0.98 * (1 - p) / p) : 1;
    const pGB = p > 0 ? pBG * p / (1 - p) : 0;
    let bad = rand() < p;
    for (let f = 0; f < nFrames; f += framesPerPacket) {
      const end = Math.min(f + framesPerPacket, nFrames);
      if (bad) mask.fill(1, f, end);
      else if (late > 0) {
        for (let i = f; i < end; i++) {
          if (rand() < late) mask[i] = rand() < net.underrunShare ? 2 : 1;
        }
      }
      bad = bad ? (rand() >= pBG) : (rand() < pGB);
    }
    return mask;
  }

  // The `steam` message draw (BC-1, decision 1): a function that says, once
  // per call, whether the next sender message is lost on its way to the
  // listener. Each message has a draw of its own, u < p, from a random stream
  // of its own, so the late-frame draw (jitter) and net_split do not change
  // which messages are lost, and raising lossPct only adds lost messages.
  // seed is the render's (finiteOr(opts.seed, 0xC0FFEE) >>> 0).
  function steamMessageLoss(lossPct, seed) {
    const p = clamp(finiteOr(lossPct, 0), 0, 100) / 100;
    const u = mulberry32(((finiteOr(seed, 0xC0FFEE) >>> 0) ^ 0x4C4F5353) >>> 0);
    return () => u() < p;
  }
  // What process(), createRender and the live chain call once per message, in
  // the sender's order: opts.loseMessage(index, message) when given (tests,
  // and replaying a log's dropped packets), else the draw. Whether loss is set
  // decides whether codecInfo.network is reported.
  function steamLoser(opts, lossPct, seed) {
    if (typeof opts.loseMessage === 'function') return { set: true, lose: (k, m) => !!opts.loseMessage(k, m) };
    const draw = steamMessageLoss(lossPct, seed);
    return { set: lossPct > 0, lose: () => draw() };
  }

  // buildLossMask, a frame at a time, with the same random sequence.
  function streamLossMask(framesPerPacket, lossPct, rand, jitterMs = 0) {
    framesPerPacket = Math.max(1, Math.round(finiteOr(framesPerPacket, 1)));
    const net = VOICE_ENGINE.network;
    const p = clamp(finiteOr(lossPct, 0) / 100, 0, 1);
    const late = clamp(net.lateFramesAt50ms * finiteOr(jitterMs, 0) / 50, 0, 0.5);
    if (p <= 0 && late <= 0) return () => 0;
    if (p >= 1) return () => 1;
    const meanBurst = Math.max(1, net.burstMeanFrames / framesPerPacket);
    const pBG = p > 0 ? Math.min(1 / meanBurst, 0.98 * (1 - p) / p) : 1;
    const pGB = p > 0 ? pBG * p / (1 - p) : 0;
    let bad = rand() < p, frame = 0, packet = [];
    return () => {
      if (frame % framesPerPacket === 0) {
        packet = new Uint8Array(framesPerPacket);
        if (bad) packet.fill(1);
        else if (late > 0) for (let i = 0; i < framesPerPacket; i++) if (rand() < late) packet[i] = rand() < net.underrunShare ? 2 : 1;
        bad = bad ? (rand() >= pBG) : (rand() < pGB);
      }
      return packet[frame++ % framesPerPacket];
    };
  }

  E.network = Object.freeze({
    buildLossMask, retimeSpurts, steamLoser, steamMessageLoss, streamLossMask
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
