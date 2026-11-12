/* TF2 Voice Emulator, steam-sender.js: Steam's voice sender, as its client runs it.
 *
 * A source file has no packets, so a render makes them as Steam does. The rule was read
 * from Steam's client (docs/reports/W3-09-steam-voice.md, sections 1 and 2, and (a)); the
 * form it takes here is docs/work-orders/W3-02-receiver-queue.md, "The sender's packets";
 * the hold's arithmetic and the read clock are docs/work-orders/W3-16-sender-hold-clock.md,
 * from docs/reports/W3-16-steam-hold-read.md and W3-14-steam-file-input.md. Only the clock
 * that says when Steam reads the capture is a model, and it is the only thing drawn: every
 * render is reproducible from its seed.
 *
 *   - Steam reads the capture every 48.0 to 63.7 ms, uniformly (createClock). The capture
 *     moves in steps of 750 samples at 24 kHz, each ready up to 13 ms after its time; a
 *     read's chunk is the steps that became ready since the read before (750, 1500 or 2250
 *     samples; none at all for the first read or two). A read is { time, since, samples }:
 *     its time on the clock (since plus a seeded phase on the float's grid), its time from
 *     the render's start, and its chunk's length.
 *   - Steam's clock is seconds since Steam started (uptime, then the read's time), narrowed to
 *     a 32-bit float at every read: nowF.
 *   - The gate judges each chunk whole: active when the mean of |x| is at least 327.67 or a
 *     sample reaches 4915. An active chunk notes nowF, in every state.
 *   - Four states. Silent: an inactive chunk goes into the last 2400 samples of past sound; an
 *     active one is sent with that past sound in front (2400 zeros if there was none). Active
 *     or hanging: every chunk is sent; the spurt's last chunk is the first one read, in the
 *     hanging state, with nowF > fround(noted + fround(0.4)): a float sum and a strict test
 *     (its frame padded, the end marker, the codec reset). So the hold's real length depends
 *     on how long the sender's Steam has run. Ended: an inactive chunk is sent as its length
 *     only (the silence record); an active one goes on in a new spurt with no pre-roll.
 *   - A read that brings nothing runs the states too: active becomes hanging and the hold is
 *     tested (if it fires, what is kept is padded to a frame and sent with the end marker);
 *     ended becomes silent with no record. With the gate off it does nothing.
 *   - One chunk is one message: the whole 480-sample frames of what the last chunk left over
 *     plus this chunk. It reaches the game on the first 15 ms tick at or after 2 ms after the
 *     read (counted from the render's start), and on a later tick than the message before
 *     (the engine adds at most one packet a tick).
 *
 * createClock({ seed }) -> { next() }: one read, { time, since, samples }, per call.
 * createSender({ seed, clock, uptime, gate, meanMin }) -> { push(int16), finish(), info() }.
 * No imports; runs as a page script, in a worker and under Node.
 */
(function (root) {
  'use strict';

  const STEAM_SENDER = Object.freeze({
    // Steam's recorder runs at 24000 Hz, one channel, 16 bits (W3-09 §1, read), and its
    // encoder cuts frames of 480 samples, 20 ms (W3-09 §2 and §3, read).
    rate: 24000,
    frame: 480,
    // Samples: how far the capture moves at a time, 31.25 ms: one 32nd of the one-second
    // looping capture buffer Steam asks Windows for (W3-16 second read). The number is not in
    // Steam's code; that Windows moves the read position in 32nds of the buffer is inferred.
    // Every packet of the Set D demo and all but 39 of Set G's fit chunks of whole steps
    // (W3-09 §2).
    grid: 750,
    // Samples of past sound sent in front of the chunk that opens the gate; 2400 zeros when
    // nothing was kept (W3-09 §1, read: the constants 0x960 and 0x12c0).
    preroll: 2400,
    // Seconds of Steam's clock after the read of the last active chunk: the first chunk read
    // later than that is the last of the spurt (W3-09 §1, read: 0x3ecccccd). The code's
    // constant is its 32-bit float, 0.4000000059604645, added and compared in floats
    // (W3-16 read, §1c): the sender uses Math.fround(hold).
    hold: 0.4,
    // The level test (W3-09 §1, read): the mean of |x| over the chunk at 1.0% of full scale
    // (voice_minavg 1.0 of 32767), or a sample at trunc(0.15 x 32767) (voice_minabs 0.15).
    meanMin: 327.67,
    peakMin: 4915,
    // The read clock (the W3-16 order, item 1). Seconds between two reads, uniform: measured
    // on Set J's rebuilt read intervals, flat from 48 to 64 ms and none late (W3-14 §3); the
    // pair gives the microphone runs' mean of 55.85 ms (W3-09 §2).
    readMin: 0.0480,
    readMax: 0.0637,
    // Seconds: each capture step is ready up to this long after its time (uniform). Fitted to
    // Set D's chunk shares and pairs (the W3-16 order, "The capture's lateness").
    captureLate: 0.013,
    // Seconds: the span of the seeded phase of the reads' times, a multiple of every float
    // step up to 24.3 days, so the seed spreads the reads over the float's grid (chosen).
    phaseSpan: 0.25,
    // Seconds Steam had been running when the render begins, by default: 9 days, where a
    // float of seconds moves in steps of 1/16 s. Set D's spurt ends tested on the demo's own
    // chunks single out a Steam of 6.1 to 12.1 days (W3-16 second read); 9 days is the
    // middle of that range.
    uptime: 777600,
    // Seconds from Steam's read to the game's relay of the message: arbitrary, it only sets
    // the phase against the game's ticks (the order's table).
    relay: 0.002,
    // Seconds: the game's client tick, on which it adds a message (as VOICE_CHANNEL.tick in
    // voice-channel.js; W3-03 §1, read).
    tick: 0.015,
    // The clock's two random sources: mulberry32((seed ^ seedMix) >>> 0) for the reads and
    // mulberry32((seed ^ seedMixCapture) >>> 0) for the capture (arbitrary).
    seedMix: 0x51ED270B,
    seedMixCapture: 0x2545F491,
  });

  const SILENT = 0, ACTIVE = 1, HANGING = 2, ENDED = 3;
  const MAX_CHUNK = 3 * STEAM_SENDER.grid;        // a microphone's read never brings more (see createClock)
  const HOLD_F = Math.fround(STEAM_SENDER.hold);  // 0.4000000059604645, the code's constant
  const UPTIME_MAX = 4000000;                     // seconds, 46 days: the page's choices end at 36

  // A setting left out is the default; one given must be a finite number.
  function setting(x, d, name) {
    if (x === undefined) return d;
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new RangeError(`${name} must be a finite number`);
    return x;
  }

  function mulberry32(seed) {                     // as in engine/dsp.js
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The clock, drawn in exactly the order's order, all arithmetic in doubles as written
  // (the W3-16 order, item 1; its reference hash pins the grouping):
  //   A = mulberry32((seed ^ seedMix) >>> 0), B = mulberry32((seed ^ seedMixCapture) >>> 0)
  //   phase = 0.25 x A(); r = 0.0637 x A(); c0 = 0.03125 x B()
  //   step j (samples 750 j to 750 j + 749) is ready at
  //     a[j] = max(a[j-1], c0 + (j + 1) x 0.03125 + 0.013 x B()), a[-1] = -Infinity
  //   next(): n = the steps with a[j] <= r not yet taken; { time: phase + r, since: r,
  //     samples: 750 n }; then r = r + (0.0480 + (0.0637 - 0.0480) x A())
  // With 13 ms of lateness under one step, a read 48 to 63.7 ms after the last finds one to
  // three steps (a chunk is at most 2250 samples); only a read before the first step is ready
  // finds none. The clock knows nothing of uptime: the sender adds it.
  function createClock(opts) {
    const o = opts || {};
    const S = STEAM_SENDER;
    const seed = setting(o.seed, 0xC0FFEE, 'seed');
    const A = mulberry32(((seed ^ S.seedMix) >>> 0));
    const B = mulberry32(((seed ^ S.seedMixCapture) >>> 0));
    const STEP = S.grid / S.rate;                 // 0.03125 s, exact
    const phase = S.phaseSpan * A();
    let r = S.readMax * A();
    const c0 = STEP * B();
    let j = 0;
    let ready = Math.max(-Infinity, c0 + (j + 1) * STEP + S.captureLate * B());   // a[0]
    return Object.freeze({
      next() {
        let n = 0;
        while (ready <= r) {
          n++; j++;
          ready = Math.max(ready, c0 + (j + 1) * STEP + S.captureLate * B());
        }
        const read = { time: phase + r, since: r, samples: S.grid * n };
        r = r + (S.readMin + (S.readMax - S.readMin) * A());
        return read;
      },
    });
  }

  // opts: seed (the clock's), clock (an object whose next() gives reads in place of the
  // seeded clock: { time, since, samples }, time in seconds from the render's start, finite
  // and not below the last; since the same without any phase, finite (left out: time);
  // samples a whole number from 0 to 2250), uptime (seconds the sender's Steam had been
  // running when the render begins, 0 to 4,000,000; default 777600: it is added to every
  // read's time before the narrowing to a float, and changes the hold only), gate (false:
  // every chunk that is not empty counts as active, and a read with no samples does
  // nothing), meanMin (in place of 327.67: the page's threshold control; the peak rule does
  // not move).
  //
  // push(samples): an Int16Array of 24 kHz sound, any length, any number of calls. Returns the
  // messages that became known, in order: a message is known once the last sample of its chunk
  // has been pushed, and one made by a read with no samples comes with the chunk before it.
  // finish(): the source has ended; the reads go on, reading zeros, until the state is silent
  // (with the gate off: the rest of the source is the last chunk, sent with the end marker).
  // Returns the rest.
  //
  // A message is { tick, spurt, first, last, start, end, pcm }: the game tick it reaches the
  // receiver on; the spurt's number (from 0); its first and last frame, numbered through the
  // whole render (last = first - 1 for an end marker alone); start, the source sample of frame
  // first's first sample (negative in a pre-roll before sample 0, which is zeros); end, whether
  // it carries the end marker; pcm, its frames' samples (an Int16Array of 480 a frame, the
  // padding of a last frame included). Or { tick, silence }: the silence record, in samples.
  //
  // info(): { spurts: [{ start, frames, preroll }], chunks, messages, uptime }: each spurt's
  // start, its frame count and the pre-roll it was given; the chunks read that were not
  // empty; the messages sent; the uptime it ran with. It keeps at most 2400 + 2250 + 479
  // samples of sound.
  function createSender(opts) {
    const o = opts || {};
    const S = STEAM_SENDER, FRAME = S.frame;
    const gate = o.gate !== false;
    const meanMin = setting(o.meanMin, S.meanMin, 'meanMin');
    if (!(meanMin > 0)) throw new RangeError('meanMin must be above 0: a chunk of zeros would never end a spurt');
    const uptime = o.uptime === undefined ? S.uptime : o.uptime;
    if (typeof uptime !== 'number' || !Number.isFinite(uptime) || uptime < 0 || uptime > UPTIME_MAX) {
      throw new RangeError(`uptime must be a finite number of seconds from 0 to ${UPTIME_MAX}`);
    }
    let clock;
    if (o.clock === undefined) clock = createClock({ seed: o.seed });
    else if (o.clock && typeof o.clock.next === 'function') clock = o.clock;
    else throw new RangeError('the clock must be an object with next()');

    const past = new Int16Array(S.preroll);     // the last silent sound, oldest first
    const chunk = new Int16Array(MAX_CHUNK);     // the capture since the last frame
    const kept = new Int16Array(FRAME - 1);      // what the last chunk left of a frame
    let pastLen = 0, chunkLen = 0, keptLen = 0;
    let state = SILENT, notedF = 0, lastTick = -1, finished = false;
    // The clock: the last read's time, Steam's float "now" and the time from the render's
    // start of the read in hand; the samples read; the count the read in hand brings them to.
    let lastTime = -Infinity, nowF = 0, since = 0, read = 0, target = 0;
    let frames = 0, spurt = -1, spurtStart = 0, spurtFrames = 0, chunks = 0, messages = 0;
    const spurts = [];

    // The next read that brings samples. Each read sets Steam's float "now" first; a read
    // with no samples runs the states at once (emptyRead), its message going into out.
    function nextRead(out) {
      for (;;) {
        const x = clock.next();
        if (!x || typeof x !== 'object') throw new RangeError('the clock must give reads: { time, since, samples }');
        const { time, samples } = x;
        if (typeof time !== 'number' || !Number.isFinite(time) || time < lastTime) throw new RangeError('the clock\'s time must be finite and not below the last');
        if (x.since !== undefined && (typeof x.since !== 'number' || !Number.isFinite(x.since))) throw new RangeError('the clock\'s since must be finite');
        if (!Number.isInteger(samples) || samples < 0 || samples > MAX_CHUNK) throw new RangeError(`the clock's samples must be a whole number from 0 to ${MAX_CHUNK}`);
        lastTime = time;
        nowF = Math.fround(uptime + time);
        since = x.since === undefined ? time : x.since;
        if (samples > 0) { target = read + samples; return; }
        emptyRead(out);
      }
    }

    function arrival() {
      lastTick = Math.max(lastTick + 1, Math.ceil((since + S.relay) / S.tick));
      return lastTick;
    }

    // The hold, as read: all in 32-bit floats, the sum rounded to a float, strictly greater.
    const holdOver = () => nowF > Math.fround(notedF + HOLD_F);

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

    // A read that brought no samples (W3-16 read, §1c): silent, nothing; ended, the state
    // becomes silent and nothing is sent (no silence record); active, it becomes hanging;
    // hanging, the hold is tested, and if it has run out what is kept is padded to a frame
    // and sent with the end marker (the marker alone if nothing is kept). With the gate off
    // it does nothing.
    function emptyRead(out) {
      if (!gate || state === SILENT) return;
      if (state === ENDED) { state = SILENT; return; }
      state = HANGING;
      if (holdOver()) { encode(out, 0, 0, true); state = ENDED; }
    }

    // Steam's read, on a chunk that is not empty: the samples read - len .. read - 1.
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
          state = ACTIVE; notedF = nowF;
          encode(out, pre, len, !!forceFinal);
          pastLen = 0;
          if (forceFinal) state = ENDED;
        } else {
          remember(len);
          if (state === ENDED) { out.push({ tick: arrival(), silence: len }); messages++; }
          state = SILENT;
        }
      } else {
        if (on) { state = ACTIVE; notedF = nowF; } else state = HANGING;
        const final = !!forceFinal || (state === HANGING && holdOver());
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
          nextRead(out);
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
        nextRead(out);
      }
      while (state !== SILENT) {
        const len = target - read;
        chunk.fill(0, 0, len);
        read = target;
        frame(out, len);
        nextRead(out);
      }
      return out;
    }

    function info() {
      return { spurts: spurts.map((s) => ({ start: s.start, frames: s.frames, preroll: s.preroll })), chunks, messages, uptime };
    }

    // The first read: the state is silent, so a read with no samples sends nothing.
    nextRead([]);

    return Object.freeze({ push, finish, info });
  }

  const TF2SteamSender = { STEAM_SENDER, createClock, createSender };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF2SteamSender;
  else root.TF2SteamSender = TF2SteamSender;
})(typeof self !== 'undefined' ? self : this);
