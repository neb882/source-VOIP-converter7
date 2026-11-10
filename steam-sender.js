/* TF2 Voice Emulator, steam-sender.js: Steam's voice sender, as its client runs it.
 *
 * A source file has no packets, so a render makes them as Steam does. The rule was read
 * from Steam's client (docs/reports/W3-09-steam-voice.md, sections 1 and 2, and (a)); the
 * form it takes here is docs/work-orders/W3-02-receiver-queue.md, "The sender's packets".
 * Only the clock that says when Steam's frames fall is a model, and it is the only thing
 * drawn: every render is reproducible from its seed.
 *
 *   - Steam's frame i runs at clock time n[i] x 15.625 ms (createClock). By then the capture
 *     holds 750 x floor(n[i] / 2) samples at 24 kHz; the frame's chunk is what it gained since
 *     the frame before (0, 750, 1500 or 2250 samples). A frame whose chunk is empty does nothing.
 *   - The gate judges each chunk whole: active when the mean of |x| is at least 327.67 or a
 *     sample reaches 4915.
 *   - Four states. Silent: an inactive chunk goes into the last 2400 samples of past sound; an
 *     active one is sent with that past sound in front (2400 zeros if there was none). Active
 *     or hanging: every chunk is sent; the first chunk read more than 0.4 s after the last
 *     active one is the last of the spurt (its frame padded, the end marker, the codec reset).
 *     Ended: an inactive chunk is sent as its length only (the silence record); an active one
 *     goes on in a new spurt with no pre-roll.
 *   - One chunk is one message: the whole 480-sample frames of what the last chunk left over
 *     plus this chunk. It reaches the game on the first 15 ms tick at or after 2 ms later, and
 *     on a later tick than the message before (the engine adds at most one packet a tick).
 *
 * createClock({ seed }) -> { next() }: the clock's n[i], one per call.
 * createSender({ seed, clock, gate, meanMin }) -> { push(int16), finish(), info() }.
 * No imports; runs as a page script, in a worker and under Node.
 */
(function (root) {
  'use strict';

  const STEAM_SENDER = Object.freeze({
    // Steam's recorder runs at 24000 Hz, one channel, 16 bits (W3-09 §1, read), and its
    // encoder cuts frames of 480 samples, 20 ms (W3-09 §2 and §3, read).
    rate: 24000,
    frame: 480,
    // Samples: how far the capture moves at a time on the owner's PC, 31.25 ms. Shown, not
    // read: every packet of the Set D demo and all but 39 of Set G's fit chunks of whole
    // steps (W3-09 §2).
    grid: 750,
    // Samples of past sound sent in front of the chunk that opens the gate; 2400 zeros when
    // nothing was kept (W3-09 §1, read: the constants 0x960 and 0x12c0).
    preroll: 2400,
    // Seconds of Steam's clock after the read of the last active chunk: the first chunk read
    // later than that is the last of the spurt (W3-09 §1, read: 0x3ecccccd).
    hold: 0.4,
    // The level test (W3-09 §1, read): the mean of |x| over the chunk at 1.0% of full scale
    // (voice_minavg 1.0 of 32767), or a sample at trunc(0.15 x 32767) (voice_minabs 0.15).
    meanMin: 327.67,
    peakMin: 4915,
    // The clock: the planner's model, not a reading (the order, "The clock"). Windows's timer
    // ticks every 15.625 ms; the capture gains one grid step on every second tick; Steam's
    // frame i runs on the first tick at or after phase + i x period, a few of them late.
    timer: 0.015625,
    // Seconds: the mean time between Steam's frames, measured on Set G and the demo (W3-09 §2).
    period: 0.05585,
    // The share of frames that run late, and by how much at most (uniform): fitted to the
    // share of 2250-sample chunks (the order's table).
    late: 0.06,
    lateMax: 0.030,
    // Seconds from Steam's frame to the game's relay of the message: arbitrary, it only sets
    // the phase against the game's ticks (the order's table).
    relay: 0.002,
    // Seconds: the game's client tick, on which it adds a message (as VOICE_CHANNEL.tick in
    // voice-channel.js; W3-03 §1, read).
    tick: 0.015,
    // The clock's random source is mulberry32((seed ^ seedMix) >>> 0) (the order, "The clock").
    seedMix: 0x51ED270B,
  });

  const SILENT = 0, ACTIVE = 1, HANGING = 2, ENDED = 3;
  const MAX_CHUNK = 3 * STEAM_SENDER.grid;        // the clock never gains more (see createClock)

  // A setting left out is the default; one given must be a finite number.
  function setting(x, d, name) {
    if (x === undefined) return d;
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new RangeError(`${name} must be a finite number`);
    return x;
  }

  function mulberry32(seed) {                     // as in audio.js
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The clock, drawn in exactly the order's order, all arithmetic in doubles as written:
  //   phase = 0.03125 x draw()
  //   frame i: u1, u2 (always both); late = u1 < 0.06 ? 0.030 x u2 : 0
  //            n[i] = max(n[i-1] + 1, ceil((phase + i x 0.05585 + late) / 0.015625)), n[-1] = 0
  // Two frames' times differ by at most period + lateMax (85.85 ms, 5.5 timer ticks), so n moves
  // by at most 6 and a chunk is at most 3 grid steps.
  function createClock(opts) {
    const o = opts || {};
    const S = STEAM_SENDER;
    const draw = mulberry32(((setting(o.seed, 0xC0FFEE, 'seed') ^ S.seedMix) >>> 0));
    const phase = 2 * S.timer * draw();
    let i = 0, last = 0;
    return Object.freeze({
      next() {
        const u1 = draw(), u2 = draw();
        const late = u1 < S.late ? S.lateMax * u2 : 0;
        const n = Math.max(last + 1, Math.ceil((phase + i * S.period + late) / S.timer));
        i++; last = n;
        return n;
      },
    });
  }

  // opts: seed (the clock's), clock (an object with next() giving n[i] in place of the seeded
  // clock: whole numbers, each above the last, at most 6 apart), gate (false: every chunk that
  // is not empty counts as active), meanMin (in place of 327.67: the page's threshold control;
  // the peak rule does not move).
  //
  // push(samples): an Int16Array of 24 kHz sound, any length, any number of calls. Returns the
  // messages that became known, in order: a message is known once the last sample of its chunk
  // has been pushed. finish(): the source has ended; the frames go on, reading zeros, until the
  // state is silent (with the gate off: the rest of the source is the last chunk, sent with the
  // end marker). Returns the rest.
  //
  // A message is { tick, spurt, first, last, start, end, pcm }: the game tick it reaches the
  // receiver on; the spurt's number (from 0); its first and last frame, numbered through the
  // whole render (last = first - 1 for an end marker alone); start, the source sample of frame
  // first's first sample (negative in a pre-roll before sample 0, which is zeros); end, whether
  // it carries the end marker; pcm, its frames' samples (an Int16Array of 480 a frame, the
  // padding of a last frame included). Or { tick, silence }: the silence record, in samples.
  //
  // info(): { spurts: [{ start, frames, preroll }], chunks, messages }: each spurt's start, its
  // frame count and the pre-roll it was given; the chunks read that were not empty; the messages
  // sent. It keeps at most 2400 + 2250 + 479 samples of sound.
  function createSender(opts) {
    const o = opts || {};
    const S = STEAM_SENDER, FRAME = S.frame;
    const gate = o.gate !== false;
    const meanMin = setting(o.meanMin, S.meanMin, 'meanMin');
    if (!(meanMin > 0)) throw new RangeError('meanMin must be above 0: a chunk of zeros would never end a spurt');
    const clock = o.clock || createClock({ seed: o.seed });
    if (typeof clock.next !== 'function') throw new TypeError('clock must have next()');

    const past = new Int16Array(S.preroll);     // the last silent sound, oldest first
    const chunk = new Int16Array(MAX_CHUNK);     // the capture since the last frame
    const kept = new Int16Array(FRAME - 1);      // what the last chunk left of a frame
    let pastLen = 0, chunkLen = 0, keptLen = 0;
    let state = SILENT, lastActive = 0, lastTick = -1, finished = false;
    let n = 0, now = 0, read = 0, target = 0;   // the clock; samples read by frames; the next frame's count
    let frames = 0, spurt = -1, spurtStart = 0, spurtFrames = 0, chunks = 0, messages = 0;
    const spurts = [];

    function nextFrame() {
      do {
        const m = clock.next();
        if (!Number.isInteger(m) || m <= n || m > n + 6) throw new RangeError('the clock must give whole numbers, each 1 to 6 above the last');
        n = m;
        target = S.grid * Math.floor(n / 2);
      } while (target === read);                 // a frame that gained nothing does nothing
      now = n * S.timer;
    }
    nextFrame();

    function arrival() {
      lastTick = Math.max(lastTick + 1, Math.ceil((now + S.relay) / S.tick));
      return lastTick;
    }

    function active(len) {
      if (!gate) return true;
      let sum = 0, peak = 0;
      for (let i = 0; i < len; i++) { const a = Math.abs(chunk[i]); sum += a; if (a > peak) peak = a; }
      return sum / len >= meanMin || peak >= S.peakMin;
    }

    // The whole frames of kept + pre-roll + chunk (pre: the pre-roll's length, 0 for none; the
    // pre-roll is the past sound, or zeros when there was none). final pads the frames to a
    // whole number and adds the end marker; what is left of a frame is kept for the next chunk.
    function encode(out, pre, len, final) {
      const total = keptLen + pre + len;
      const count = final ? Math.ceil(total / FRAME) : Math.floor(total / FRAME);
      const buf = new Int16Array(Math.max(total, count * FRAME));
      buf.set(kept.subarray(0, keptLen), 0);
      if (pre && pastLen) buf.set(past.subarray(0, pre), keptLen);
      buf.set(chunk.subarray(0, len), keptLen + pre);
      keptLen = final ? 0 : total - count * FRAME;
      kept.set(buf.subarray(count * FRAME, count * FRAME + keptLen), 0);
      if (!count && !final) return;              // nothing written: no message
      const first = frames;
      frames += count;
      out.push({ tick: arrival(), spurt, first, last: frames - 1, start: spurtStart + FRAME * spurtFrames, end: !!final,
        pcm: buf.slice(0, count * FRAME) });
      spurtFrames += count;
      spurts[spurt].frames = spurtFrames;
      messages++;
    }

    // past = the last 2400 samples of (past + chunk). A chunk is at most 2250 samples.
    function remember(len) {
      const P = S.preroll;
      const keep = Math.min(pastLen, P - len);
      past.copyWithin(0, pastLen - keep, pastLen);
      past.set(chunk.subarray(0, len), keep);
      pastLen = keep + len;
    }

    function openSpurt(chunkStart, pre) {
      spurt++;
      spurtStart = chunkStart - pre;
      spurtFrames = 0;
      spurts.push({ start: spurtStart, frames: 0, preroll: pre });
    }

    // Steam's frame, on a chunk that is not empty: the samples read - len .. read - 1.
    function frame(out, len, forceFinal) {
      chunks++;
      const chunkStart = read - len;
      const on = active(len);
      if (state === SILENT || state === ENDED) {
        if (on) {
          let pre = 0;
          if (state === SILENT) pre = pastLen || S.preroll;
          openSpurt(chunkStart, pre);
          keptLen = 0;
          state = ACTIVE; lastActive = now;
          encode(out, pre, len, !!forceFinal);
          pastLen = 0;
          if (forceFinal) state = ENDED;
        } else {
          remember(len);
          if (state === ENDED) { out.push({ tick: arrival(), silence: len }); messages++; }
          state = SILENT;
        }
      } else {
        if (on) { state = ACTIVE; lastActive = now; } else state = HANGING;
        const final = !!forceFinal || (state === HANGING && now > lastActive + S.hold);
        encode(out, 0, len, final);
        if (final) state = ENDED;
      }
    }

    function push(samples) {
      if (finished) throw new Error('push() after finish()');
      if (!(samples instanceof Int16Array)) throw new TypeError('push() takes an Int16Array of 24 kHz samples');
      const out = [];
      let i = 0;
      while (i < samples.length) {
        const want = target - read;
        const take = Math.min(want, samples.length - i);
        chunk.set(samples.subarray(i, i + take), chunkLen);
        chunkLen += take; read += take; i += take;
        if (read === target) {
          frame(out, chunkLen);
          chunkLen = 0;
          nextFrame();
        }
      }
      return out;
    }

    function finish() {
      if (finished) return [];
      finished = true;
      const out = [];
      if (!gate) {
        // The next frame reads the rest of the source as its chunk and is the last: what is
        // kept is padded to a frame and sent with the end marker (alone, if nothing is left).
        if (chunkLen) frame(out, chunkLen, true);
        else if (state === ACTIVE) { encode(out, 0, 0, true); state = ENDED; }
        chunkLen = 0;
        return out;
      }
      // The frame that reads the source's end reads zeros after it; then frames of zeros go on
      // until the state is silent.
      if (chunkLen) {
        chunk.fill(0, chunkLen, target - (read - chunkLen));
        const len = target - (read - chunkLen);
        read = target;
        frame(out, len);
        chunkLen = 0;
        nextFrame();
      }
      while (state !== SILENT) {
        const len = target - read;
        chunk.fill(0, 0, len);
        read = target;
        frame(out, len);
        nextFrame();
      }
      return out;
    }

    function info() {
      return { spurts: spurts.map((s) => ({ start: s.start, frames: s.frames, preroll: s.preroll })), chunks, messages };
    }

    return Object.freeze({ push, finish, info });
  }

  const TF2SteamSender = { STEAM_SENDER, createClock, createSender };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF2SteamSender;
  else root.TF2SteamSender = TF2SteamSender;
})(typeof self !== 'undefined' ? self : this);
