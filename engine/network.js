/* TF2 Voice Emulator, engine/network.js: loss and jitter: the loss masks, the steam profile's loss by message and
 * its arrival times (BC-4).
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
  /* frames (mask 1).                                                    */
  /*                                                                    */
  /* Jitter (BC-4). On `steam` on the game's timeline it is when each   */
  /* message reaches the receiver's voice channel: net_fakelag's and     */
  /* net_fakejitter's lists as read (fakeLagList), on the path a listen  */
  /* server's own voice takes (steamArrivals). Nothing is lost and the   */
  /* order is kept; the channel's queue does the rest (finding 9). On    */
  /* `steam` on the file's own timing it does nothing. The other         */
  /* profiles keep the earlier fit: late frames, 3.2% of frames at       */
  /* net_fakejitter 50, scaled linearly; one in ten plays as silence     */
  /* (mask 2) instead of being concealed (a fit; the game makes no frame */
  /* late). See tests/REFERENCE_2026.md, finding 9.                      */
  /* ------------------------------------------------------------------ */

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

  /* ---------------- jitter on `steam`: arrival times (BC-4) ---------------- */

  // The game's tick, in ms: a client sends one packet a tick, and the
  // receiver's voice channel takes messages on whole ticks (read: the client
  // tick, W3-03; voice-channel.js VOICE_CHANNEL.tick).
  const STEAM_TICK_MS = 15;

  // net_fakelag's and net_fakejitter's list, one per socket (read 6 of
  // docs/reports/bad-connections-plan.md; the order's "The model"):
  // { lagMs, jitterMs, lookTime(k), rand } -> { j, release(enterMs) }.
  //   - j = min(jitterMs, lagMs / 2) (read).
  //   - The list is looked at at the times lookTime(k), k a whole number;
  //     lookTime rises with k. It is a function, not a period multiplied
  //     out, so that a caller's look times are its own arithmetic to the
  //     last bit (the plan review's point 6).
  //   - Only the head is looked at (read). A head younger than lagMs - j
  //     cannot leave and no number is drawn for it (the model's choice: the
  //     game draws, and the draw cannot release it).
  //   - An older head draws u = rand() and leaves when its age is at least
  //     lagMs + (2u - 1) j (read, with the game's RandomFloat taken as
  //     uniform: inferred); otherwise it is looked at again at the next
  //     look, with a new number (read).
  //   - When the head leaves, the packet behind it is the head and is looked
  //     at in the same look (inferred: a socket is read until it gives
  //     nothing). A packet is seen by the looks at or after its entry.
  // So packets leave in the order they came and none is lost (read).
  // release(enterMs), called once per packet with enter times that never
  // fall, returns the time of the look at which it leaves. Looks at which the
  // head is too young draw nothing, so they are passed over by arithmetic
  // and then by the same comparison a look would make.
  function fakeLagList({ lagMs, jitterMs, lookTime, rand }) {
    if (!Number.isFinite(lagMs) || lagMs < 0 || !Number.isFinite(jitterMs) || jitterMs < 0) {
      throw new RangeError('fakeLagList: lagMs and jitterMs are finite numbers, 0 or more.');
    }
    if (typeof lookTime !== 'function' || typeof rand !== 'function') throw new TypeError('fakeLagList: lookTime(k) and rand() are functions.');
    const j = Math.min(jitterMs, lagMs / 2);
    let left = null, lastEnter = -Infinity;    // the look at which the last packet left
    return {
      j,
      release(enterMs) {
        if (!Number.isFinite(enterMs) || enterMs < lastEnter) throw new RangeError('fakeLagList: enter times are finite and never fall.');
        lastEnter = enterMs;
        // The first look at which the packet is the head and old enough to
        // draw: not before the look at which the packet in front of it left,
        // and with lookTime(k) - enterMs >= lagMs - j (so at or after its
        // entry). A guess from the first two looks' spacing, then the exact
        // comparison each way.
        const step = lookTime(1) - lookTime(0);
        let k = Math.floor((enterMs + lagMs - j - lookTime(0)) / step) - 2;
        if (left !== null && k < left) k = left;
        while ((left === null || k > left) && lookTime(k - 1) - enterMs >= lagMs - j) k--;
        while (lookTime(k) - enterMs < lagMs - j) k++;
        for (;; k++) {
          const t = lookTime(k), u = rand();
          if (t - enterMs >= lagMs + (2 * u - 1) * j) { left = k; return t; }
        }
      }
    };
  }

  // The path of a listen server's own voice (BC-4, the order's "The
  // model"; reads 3, 4 and 8 of docs/reports/bad-connections-plan.md). It
  // crosses the network layer twice, client to server and server to client
  // (read). Each crossing is one list, holding one packet for every tick
  // (read for the in-process path, read 8; inferred for sockets): the
  // client's packet of tick p enters the first at 15 p ms; a packet that
  // leaves a list at time r rides the next side's packet of tick
  // ceil(r / 15), which enters the next list at 15 ceil(r / 15) whether or
  // not anything rides it, two that leave for the same tick riding the same
  // packet (the plan review's point 3). Each crossing's list is looked at at
  // its own times (chosen: a server runs in ticks and a client in frames,
  // inferred; of the three pairs the prototype tried, this one adds 190 ms
  // to the round trip at jitter 50 and 300 frames a second where Set C's
  // net_graph showed 185 to 196 ms, one reading) and draws from a stream of
  // its own, mulberry32((seed ^ salt) >>> 0) (arbitrary constants).
  const STEAM_CROSSINGS = Object.freeze([
    // Client to server: the server's socket, looked at once a tick (chosen).
    Object.freeze({ socket: 'server', salt: 0x4A495431, looks: () => (k) => 15 * k }),
    // Server to client: the listener's socket, looked at once a frame (chosen).
    Object.freeze({ socket: 'listener', salt: 0x4A495432, looks: (fps) => (k) => k * 1000 / fps })
  ]);
  // The lag the lists run at, as a multiple of the jitter (chosen): a lag
  // that stays the same delays every packet alike and a render does not show
  // it; twice the jitter is the least at which the game applies the whole
  // jitter (j = min(jitter, lag / 2), read), and it is Set C's setting.
  const FAKE_LAG_PER_JITTER = 2;
  // The tick the lists start at, a packet a tick from there, so that a
  // render's first ticks meet lists already in their running state (chosen;
  // the plan review's point 5: with empty lists the first 20 ticks come 2 ms
  // early at jitter 50 and 131 ms at 500, at 300 frames a second).
  const FAKE_LAG_START_TICK = -200;
  // The listener's frame rate as the voice channel limits it (10 to 1000;
  // 300 when not given: voice-channel.js, read).
  const steamArrivalFps = (fps) => clamp(finiteOr(fps, 300), 10, 1000);

  // steamArrivals({ jitterMs, fps, seed }) -> { jitterMs, fps, floorTicks,
  // at(tick) }: the tick on which the message the sender gave tick `tick`
  // reaches the voice channel, less floorTicks, the least delay any packet
  // can have: a crossing releases a packet only at a look past the age
  // lagMs - j = jitterMs (at exactly that age only on a draw of 0, a chance
  // of 2^-32), and its packet rides the next whole tick, so floor(jitterMs /
  // 15) + 1 ticks a crossing. That is ceil(jitterMs / 15) but at a jitter of
  // whole ticks (15, 30, 45 ms ...), where it is one tick more (the fix round
  // of BC-4a, point 1). So at(p) >= p, `at` never falls, and two messages can
  // share a tick. The rest of the delay
  // is heard: a render with jitter plays later than its source (the order's
  // ruling 6). at() takes whole ticks from FAKE_LAG_START_TICK on, in any
  // order; each is worked out once, in tick order. It depends on the tick
  // alone: a lost packet is kept in the lists as if it had come (the
  // model's simplification). With jitterMs 0 or less (or not a number)
  // at(p) is p and nothing is drawn, but where a frame is longer than a tick
  // (W3-23a, below). seed is the render's.
  //   At jitter 0 when a frame is longer than a tick (1000 / fps > 15, fps
  // as steamArrivalFps limits it: under 1000/15 frames a second), and not
  // endless (W3-23a, docs/work-orders/W3-23-low-frame-rates.md, "The arrival
  // at jitter 0"): the model above as its jitter goes to 0, in closed form,
  // so that jitter 0 and a very small jitter give the same ticks (the
  // orchestrator's ruling 2). The message of tick p is on the server's next
  // tick, so in the listener's list from 15 (p + 1) ms; it leaves at the
  // first of the listener's looks (STEAM_CROSSINGS' second) r with r - 15 (p
  // + 1) > 0, and reaches the channel on ceil(r / 15) - 2. Nothing is drawn;
  // floorTicks is 0, jitterMs 0, and frames true says it is this rule (a
  // render does not report it as codecInfo.arrivals: no jitter is on). at(p)
  // >= p and never falls. At 1000/15 and above, and endless (the live
  // monitor's chain: W3-23b, not built yet), at(p) is p, as before. That is
  // the listener's first look after the relay tick in ticks; in what is
  // heard, from 34 to 66 frames a second the two ticks taken off put the
  // message in the first frame at or after its own tick, and the whole look
  // is in the delay only at 30 and under (measured, the second reader of
  // W3-23a).
  //   endless (W3-02c-3, the live monitor's chain, which has no end): at()
  // takes ticks that never fall, refuses one below the last asked with a
  // RangeError (the same tick again is taken), and keeps no leaving tick
  // that a later call cannot ask for, so what it holds does not grow with
  // time. Its answers are the whole model's, tick for tick. held() is how
  // many leaving ticks the model holds, for a test.
  function steamArrivals({ jitterMs, fps, seed, endless = false } = {}) {
    const J = finiteOr(jitterMs, 0), F = steamArrivalFps(fps);
    let last = -Infinity;   // the last tick asked, with endless
    const rising = (tick) => {
      if (tick < last) throw new RangeError(`steamArrivals: with endless, at() takes ticks that never fall, not ${tick} after ${last}.`);
      last = tick;
    };
    if (!(J > 0)) {
      if (!endless && 1000 / F > STEAM_TICK_MS) return steamFrameArrivals(F);
      if (!endless) return { jitterMs: 0, fps: F, floorTicks: 0, at: (tick) => tick };
      return { jitterMs: 0, fps: F, floorTicks: 0, at: (tick) => { rising(tick); return tick; }, held: () => 0 };
    }
    const s = finiteOr(seed, 0xC0FFEE) >>> 0, lagMs = FAKE_LAG_PER_JITTER * J, start = FAKE_LAG_START_TICK;
    const floorTicks = STEAM_CROSSINGS.length * (Math.floor(J / STEAM_TICK_MS) + 1);
    // For each crossing, its list and, by tick from `start` (from `base`
    // with endless), the tick its packet leaves for (ceil of its leaving
    // time over 15).
    const legs = STEAM_CROSSINGS.map((c) => ({ list: fakeLagList({ lagMs, jitterMs: J, lookTime: c.looks(F),
      rand: mulberry32((s ^ c.salt) >>> 0) }), out: [], base: start }));
    const leave = (c, q) => {
      const leg = legs[c];
      while (leg.out.length <= q - leg.base) {
        const tick = leg.base + leg.out.length;
        leg.out.push(Math.ceil(leg.list.release(STEAM_TICK_MS * tick) / STEAM_TICK_MS));
      }
      const out = leg.out[q - leg.base];
      // With endless, the ticks a later call can ask of this crossing are q
      // and after: the first crossing is asked the tick given, which never
      // falls, and the second what the first gives, which never falls either.
      if (endless && q > leg.base) { leg.out.splice(0, q - leg.base); leg.base = q; }
      return out;
    };
    return {
      jitterMs: J, fps: F, floorTicks,
      at(tick) {
        if (!Number.isInteger(tick) || tick < start) throw new RangeError(`steamArrivals: at() takes a whole tick from ${start} on, not ${tick}.`);
        if (endless) rising(tick);
        let q = tick;
        for (let c = 0; c < legs.length; c++) q = leave(c, q);
        return q - floorTicks;
      },
      ...(endless ? { held: () => legs.reduce((n, leg) => n + leg.out.length, 0) } : {})
    };
  }

  // The model with jitter as its jitter goes to 0, where a frame is longer
  // than a tick (W3-23a; steamArrivals says the rule): the listener's look
  // after the server's relay tick. F is the frame rate, limited. at() takes
  // whole ticks from FAKE_LAG_START_TICK on, as the model with jitter does.
  // The looks are the listener's frames, timed as the voice channel's frame
  // clock times them (voice-channel.js: frame k at (88200 k) / fps half
  // samples at 44.1 kHz, compared with the whole numbers 1323 x tick), so the
  // look is the frame the clock runs after the relay tick, by the clock's own
  // arithmetic. A look exactly on a tick (in whole numbers at the rate) is
  // decided by that double, as the clock decides it; k x 1000 / fps in ms
  // decided some such looks the other way (the second reader of W3-23a; the
  // fix round, item 2).
  function steamFrameArrivals(F) {
    const frame = (k) => (88200 * k) / F, TICK = 1323;
    return {
      jitterMs: 0, fps: F, floorTicks: 0, frames: true,
      at(tick) {
        if (!Number.isInteger(tick) || tick < FAKE_LAG_START_TICK) {
          throw new RangeError(`steamArrivals: at() takes a whole tick from ${FAKE_LAG_START_TICK} on, not ${tick}.`);
        }
        const enter = TICK * (tick + 1);
        // The first look past the entry: a guess from the looks' spacing, then
        // the exact comparison each way.
        let k = Math.floor(enter * F / 88200);
        while (frame(k) > enter) k--;
        while (frame(k) <= enter) k++;
        return Math.ceil(frame(k) / TICK) - 2;
      }
    };
  }

  // What a render on the game's timeline hands its voice channel (BC-4):
  // null (every message on its own tick), or { jitterMs, fps, floorTicks,
  // at(tick) }. opts.arriveAt, a test's or a replay's own arrival ticks, in
  // place of the model (floorTicks 0); else the model with jitter above 0;
  // else, with a whole length (not endless) and a frame longer than a tick,
  // the model at jitter 0 (W3-23a: steamArrivals, with frames true, which a
  // render does not report as codecInfo.arrivals). So at 1000/15 frames a
  // second and above a render at jitter 0 gets null, as before.
  // jitterMs and fps are the render's; the model's draws use the render's
  // seed through streams of their own, so the loss draw is untouched.
  // endless is passed on to the model (the live monitor's chain, W3-02c-3).
  function steamArrivalPlan({ jitterMs, fps, seed, arriveAt, endless = false }) {
    if (typeof arriveAt === 'function') return { jitterMs: Math.max(0, finiteOr(jitterMs, 0)), fps: steamArrivalFps(fps), floorTicks: 0, at: arriveAt };
    if (finiteOr(jitterMs, 0) > 0) return steamArrivals(endless ? { jitterMs, fps, seed, endless } : { jitterMs, fps, seed });
    return !endless && 1000 / steamArrivalFps(fps) > STEAM_TICK_MS ? steamFrameArrivals(steamArrivalFps(fps)) : null;
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
    STEAM_CROSSINGS, buildLossMask, fakeLagList, steamArrivalPlan, steamArrivals, steamLoser, steamMessageLoss,
    streamLossMask
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
