/* TF2 Voice Emulator, voice-channel.js: the receiver's voice channel, as the
 * game's engine runs it.
 *
 * The rule was read from the game's engine (docs/reports/W3-03-engine-binary.md,
 * "1. The receiver's queue") and replayed tick for tick against the game's own
 * console logs of the queue (docs/reports/W3-02-plan.md, "The replay"); the
 * pseudo-code it implements is in docs/work-orders/W3-02-receiver-queue.md,
 * "The model". For the Steam profiles, whose voice rate is the mixer's 44.1 kHz.
 *
 * One speaker's channel:
 *   - a packet for a speaker with no channel opens one: the ring is emptied, the
 *     gain is reset, and the channel waits waitTicks(bufferMs, fps) client ticks
 *     (voice_buffer_ms counted down by one frame's duration per 15 ms tick; the
 *     packet's own tick is the first) before it plays;
 *   - every packet runs through the gain whole, then all but its first sample go
 *     into a 0.5 s ring (the engine's interpolator writes n - 1 samples, each
 *     0.999 of the next one: under the 16-bit step, so the kept samples are the
 *     packet's samples 1..n-1); what does not fit drops the oldest samples;
 *   - the mixer's pull reads what it asks for, fades the last voice_fadeouttime
 *     of the queue, pads an underrun with one repeat of what it read and then
 *     zeros, and marks the channel starved when the ring is empty;
 *   - the next tick frees a starved channel, unless a packet came first (it is
 *     appended: no wait, no gain reset).
 * The game's mixer asks for one sample more (513) on its first block after a
 * channel starts and keeps it for its next block (one sample of look-ahead,
 * nothing dropped); that is the mixer's doing, so pull(n) takes exactly n, and
 * createTimeline plays the mixer's way.
 *
 * createChannel(opts) -> { add(pcm, tag), tick(), pull(n), and read-only
 * inUse, playing, starved, count, opens, waitTicks, dropped, drops }.
 * No imports; runs as a page script, in a worker and under Node.
 */
(function (root) {
  'use strict';

  const VOICE_CHANNEL = Object.freeze({
    // Steam voice and the mixer: Voice_Init sets the voice rate to 44100 whatever Steam's
    // optimal rate is, and Steam's decoder returns 44.1 kHz (W3-03 §1, read).
    rate: 44100,
    // Samples (44100 bytes): one ring per channel, sized once at start-up for every codec
    // (W3-03 §1, read). Every logged bufsize is at most 44100, and 103 adds of the first
    // log land on it.
    ring: 22050,
    // Seconds: the client tick, the start-up value of the tick interval (W3-03 §1, read);
    // the logs' bufsize lines come every 15.04 ms of sound.
    tick: 0.015,
    // voice_buffer_ms's default; limited to 1..5000 when a channel is assigned (W3-03 §1, read).
    bufferMs: 100,
    bufferMsRange: [1, 5000],
    // fps_max's default. The countdown loses one frame's duration per tick, and the frame's
    // duration is limited to 0.001..0.1 s (W3-03 §1, read): so the rate counts as 10..1000.
    fps: 300,
    fpsRange: [10, 1000],
    // voice_fadeouttime's default (W3-03 §1, read): the fade covers
    // max(2, floor(rate x fadeTime)) = 4410 samples.
    fadeTime: 0.1,
    // The mixer takes 512 samples a block, and 513 on its first block after a channel
    // starts (the logs: 16 of 16 starts in the first log). The extra one is look-ahead: the
    // first block mixes the first 512 and keeps the last, which is the first sample mixed in
    // the next block (read: docs/reports/W3-10-upsampler-read.md, section 3). For the clock
    // that drives a channel; pull() takes what it is asked for.
    mixBlock: 512,
    firstBlock: 513,
  });
  Object.freeze(VOICE_CHANNEL.bufferMsRange);
  Object.freeze(VOICE_CHANNEL.fpsRange);

  // The burst a restarted spurt opens with: eight 20 ms frames in 17 of 23 openings of the
  // first log and 16 of its 17 restarts (W3-03, "Checked against the owner's console log").
  const OPENING_SECONDS = 0.16;

  // The mean time from the last sample of a spurt's opening packet to the packet's arrival,
  // with Steam's sender (steam-sender.js): the model's figure, not the game's. Measured
  // (W3-02c-1, docs/reports/W3-02c1-channel-as-read.md): offsetStartMs of every opened spurt of
  // the suite's layouts P and Q (tests/voice-channel.verify.mjs: 2 s spurts after 300, 500 and
  // 1200 ms, and after 900, 600 and 1200 ms), seeds 1 to 50, at 300 and 66.67 fps, with only
  // latency() taken out: 455 spurts, mean 50.5 ms (50.9 at 300 fps, 50.2 at 66.67; 8.5 to 88.7,
  // sd 14.1; means of ten seeds at a time 45.7 to 58.0).
  const ARRIVAL_SECONDS = 0.0505;

  const finiteOr = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  // Ticks a new channel waits, its packet's own tick included: ceil(pad / frame duration)
  // with the pad and the frame's duration limited as the engine limits them. 7 at 66.67 fps,
  // 10 at 100, 30 at 300.
  function waitTicks(bufferMs, fps) {
    const pad = clamp(finiteOr(bufferMs, VOICE_CHANNEL.bufferMs), VOICE_CHANNEL.bufferMsRange[0], VOICE_CHANNEL.bufferMsRange[1]);
    const rate = clamp(finiteOr(fps, VOICE_CHANNEL.fps), VOICE_CHANNEL.fpsRange[0], VOICE_CHANNEL.fpsRange[1]);
    return Math.ceil(pad / 1000 * rate - 1e-6);
  }

  // Seconds after its source a restarted spurt plays: the wait after its first packet
  // (the packet's tick is the first of the wait) plus the burst that packet carries, but no
  // more than the ring holds. 0.25 s at 66.67 fps, 0.295 at 100, 0.5 at 235 and above.
  function latency(bufferMs, fps) {
    return Math.min(VOICE_CHANNEL.ring / VOICE_CHANNEL.rate,
      (waitTicks(bufferMs, fps) - 1) * VOICE_CHANNEL.tick + OPENING_SECONDS);
  }

  // opts: fps, bufferMs, fadeTime (seconds), gain ({ process(pcm) -> pcm, reset() }: run on
  // every packet whole and reset when the channel opens; without it samples pass unchanged),
  // test (only to show that a replay of a log can fail, never from the page:
  // { ring: samples, waitTicks: number } replace the constants, keepSample writes the whole
  // packet, noGrace frees the channel inside the pull that empties the ring).
  function createChannel(opts) {
    const o = opts || {};
    const t = o.test || {};
    const gain = o.gain || null;
    const size = t.ring !== undefined ? t.ring : VOICE_CHANNEL.ring;
    if (!Number.isInteger(size) || size < 1) throw new RangeError('test.ring must be a positive whole number of samples');
    const wait = t.waitTicks !== undefined ? t.waitTicks : waitTicks(o.bufferMs, o.fps);
    if (!Number.isInteger(wait)) throw new RangeError('test.waitTicks must be a whole number');
    const fade = Math.max(2, Math.floor(VOICE_CHANNEL.rate * finiteOr(o.fadeTime, VOICE_CHANNEL.fadeTime)));
    const keepSample = !!t.keepSample, noGrace = !!t.noGrace;

    // The ring, preallocated, and the tag of the packet each sample came from.
    const data = new Float32Array(size), tags = new Float64Array(size);
    let head = 0, count = 0;                      // read position and samples queued
    let inUse = false, playing = false, starved = false, left = 0;
    let opens = 0, dropped = 0, pulled = 0;
    const drops = [];                             // { pulled, count, tag }, one per run of one tag

    // k samples leave from the play position: an overflow, heard as a skip.
    function dropOldest(k) {
      for (let i = 0; i < k;) {
        const tag = tags[(head + i) % size];
        let j = i + 1;
        while (j < k && tags[(head + j) % size] === tag) j++;
        drops.push({ pulled, count: j - i, tag });
        i = j;
      }
      head = (head + k) % size;
      count -= k;
      dropped += k;
    }

    // A packet, processed in a tick before the tick's pass. pcm: its decoded samples at
    // 44.1 kHz (a Float32Array); tag: a number kept with its samples (-1 when not given).
    function add(pcm, tag) {
      if (!pcm || typeof pcm.length !== 'number') throw new TypeError('add() takes the packet\'s samples');
      const label = typeof tag === 'number' ? tag : -1;
      if (!inUse) {                               // Voice_AssignChannel
        inUse = true; head = 0; count = 0; left = wait; playing = false;
        if (gain) gain.reset();
        opens++;
      }
      if (gain) pcm = gain.process(pcm);          // the whole packet, in arrival order
      // The packet writes `total` samples, and written(k) is the value of its k-th: the one
      // place where a written value is made (the interpolator's output; today the packet's
      // sample k + 1, or sample k with test.keepSample).
      const shift = keepSample ? 0 : 1;
      const total = Math.max(0, pcm.length - shift);
      const written = (k) => pcm[k + shift];
      let skip = 0, n = total;
      if (n > size) {                             // more than the ring: the packet's oldest go too
        dropOldest(count);
        const lost = n - size;
        drops.push({ pulled, count: lost, tag: label });
        dropped += lost; skip = lost; n = size;
      } else if (count + n > size) dropOldest(count + n - size);
      let w = (head + count) % size;
      for (let k = skip; k < total; k++) {
        data[w] = written(k);
        tags[w] = label;
        if (++w === size) w = 0;
      }
      count += n;
      starved = false;
    }

    // The channel pass of a client tick, after the tick's packets.
    function tick() {
      if (!inUse) return;
      if (starved) { inUse = false; playing = false; return; }
      if (!playing) { left -= 1; if (left <= 0) playing = true; }
    }

    // The mixer wants n samples; returns exactly n, with the tag of the packet each came
    // from (-1 for padding and silence).
    function pull(n) {
      if (!Number.isInteger(n) || n < 0) throw new RangeError('pull() takes a whole number of samples');
      const samples = new Float32Array(n), from = new Float64Array(n).fill(-1);
      pulled += n;
      if (!(inUse && playing)) return { samples, tags: from };
      const got = Math.min(n, count);
      for (let i = 0; i < got; i++) {
        const j = (head + i) % size;
        samples[i] = data[j];
        from[i] = tags[j];
      }
      head = (head + got) % size;
      count -= got;
      const after = count;
      if (after < fade) {                         // the samples with fewer than fade - 1 behind them
        for (let i = 0; i < got; i++) {
          const r = (got - 1 - i) + after;
          if (r < fade - 1) samples[i] *= r / (fade - 1);
        }
      }
      if (got < n) {                              // underrun: the last samples read once more, then zeros
        const k = Math.min(got, n - got);
        samples.copyWithin(got, got - k, got);
      }
      if (count === 0) {
        starved = true;
        if (noGrace) { inUse = false; playing = false; }
      }
      return { samples, tags: from };
    }

    return Object.freeze({
      add, tick, pull,
      get inUse() { return inUse; },
      get playing() { return playing; },
      get starved() { return starved; },
      get count() { return count; },
      get opens() { return opens; },
      get waitTicks() { return wait; },
      get dropped() { return dropped; },
      get drops() { return drops.map((d) => ({ pulled: d.pulled, count: d.count, tag: d.tag })); },
    });
  }

  // The game's timeline: one channel driven by the clock of "The model" in the work order.
  // Time is counted in half samples at 44.1 kHz, so nothing rounds: client tick k is at 1323 k
  // and mixer block b at 1024 b. Events run in time order; a block that starts before a tick
  // runs before it, one that starts on it runs after it. A message with arrival tick k is added
  // on tick k, before the tick's pass. Block b is output samples 512 b - D to 512 b - D + 511.
  // D, the zero, is taken out so that a restarted spurt sits where the source has it, in the
  // mean: the delay at which a restarted spurt plays (latency) plus the mean time its opening
  // packet takes to arrive after its last sample (ARRIVAL_SECONDS), on whole blocks so that
  // the channel's blocks are the mixer's: D = 512 x round(44100 x (latency + arrival) / 512),
  // 13312 samples at 66.67 fps, 15360 at 100, 24064 at 300. The game has no such figure: it is
  // the model's, for lining a render up with its source. Output before sample 0 or past length
  // is dropped. The mixer runs one sample ahead of what it plays (W3-10's upsampler read, section
  // 3): the first block after each start asks the channel for 513 samples, plays the first 512
  // and keeps the last; every later block plays the kept sample and then the first 511 of the
  // 512 it asks for, and keeps the last. So every sample pulled is heard, in order.
  //
  // opts: fps, bufferMs, fadeTime (as createChannel), gain (as createChannel: reset when a
  // channel opens, run on every message whole), length (output samples, required).
  //
  // push({ tick, pcm, source }): one message as the receiver gets it: its game tick (never
  // before the last one given), its decoded samples at 44.1 kHz (a Float32Array of any length;
  // empty for an end marker alone; zeros for a silence record) and source, the 44.1 kHz source
  // position of pcm[0] (-1 for a silence record). advance(tick): no message will come before
  // tick. Both return the output samples that became final (a Float32Array, maybe empty): those
  // of every block that starts before the tick. finish() -> { samples, info }: the rest, so
  // that everything returned is length samples. The timeline calls no sender, codec or
  // resampler: its caller does.
  //
  // info: { timeline: 'game', fps, bufferMs, waitTicks, latency, packets, opens, appended,
  // gainResets, droppedSamples, drops: [{ time, ms }], spurts: [{ start, end, opened,
  // offsetStartMs, offsetEndMs, droppedMs }], source: Int32Array }.
  //   - latency: the channel's own figure, latency(bufferMs, fps), not D.
  //   - A spurt is a run of messages up to a silence record (the record is its last). start and
  //     end are source seconds (the first sound message's first sample; the last one's end).
  //     opened: its first message opened a channel (else it was appended). An offset is how
  //     much later than the source a sample came out, D taken out (negative: early):
  //     offsetStartMs at the first played sample at least 0.2 s into the spurt (its first played
  //     sample if none is), offsetEndMs at its last played sample; null if none played.
  //     droppedMs: its samples lost to overflow (its silence record's included).
  //   - drops: each overflow (one per message that caused one), at the output time (seconds)
  //     where the skip is heard: the first sample of the next block the channel plays that
  //     left the ring after the overflow (sample 1 of a block, after the sample the mixer
  //     kept; sample 0 of the first block after a start, for a drop during a wait).
  //   - source[i]: the source position heard at the centre of output slot i (20 ms slots of
  //     882 samples), or -1 for silence, padding, a silence record and a pre-roll before
  //     sample 0.
  //   - appended: the spurts that did not open a channel; gainResets: the channel's calls to
  //     the gain's reset (one per open).
  function createTimeline(opts) {
    const o = opts || {};
    const length = o.length;
    if (!Number.isInteger(length) || length < 0) throw new RangeError('createTimeline needs length, the output\'s whole number of samples');
    const fps = finiteOr(o.fps, VOICE_CHANNEL.fps), bufferMs = finiteOr(o.bufferMs, VOICE_CHANNEL.bufferMs);
    const user = o.gain || null;
    let gainResets = 0;
    const gain = {
      process: (pcm) => (user ? user.process(pcm) : pcm),
      reset() { gainResets++; if (user) user.reset(); },
    };
    const ch = createChannel({ fps, bufferMs, fadeTime: o.fadeTime, gain });
    const lat = latency(bufferMs, fps);
    const D = VOICE_CHANNEL.mixBlock * Math.round(VOICE_CHANNEL.rate * (lat + ARRIVAL_SECONDS) / VOICE_CHANNEL.mixBlock);
    const TICK = Math.round(2 * VOICE_CHANNEL.rate * VOICE_CHANNEL.tick);      // 1323 half samples
    const N = VOICE_CHANNEL.mixBlock, BLOCK = 2 * N;                          // 512 samples; 1024
    const PER_MS = VOICE_CHANNEL.rate / 1000;
    const SLOT = Math.round(VOICE_CHANNEL.rate * 0.02), MID = SLOT >> 1;      // 882; its centre 441
    const INTO = Math.round(VOICE_CHANNEL.rate * 0.2);                        // 0.2 s into a spurt

    const slots = new Int32Array(Math.ceil(length / SLOT)).fill(-1);
    // Per message: where pcm[0] is in the source (null: a record), its spurt (-1: none), how
    // many of its samples the ring took (all but pcm[0]) and how many have left it (pulled or
    // dropped). They leave in order, so the next one out is pcm[1 + that]. An overflow drops
    // the oldest: the samples left of the oldest messages, from `oldest` on.
    const pSource = [], pSpurt = [], pIn = [], pOut = [];
    let oldest = 0;
    const spurts = [], drops = [], unheard = [];
    let nextTick = 0, nextBlock = 0, floor = 0, fresh = false, open = false, finished = false;
    let kept = null;                              // the sample the mixer loaded last and has not played
    let pieces = [];                              // the output of the blocks run since the last return

    function runTick() { ch.tick(); nextTick++; }

    // A pulled sample's place in the source: its position, or -1 for padding, silence and a
    // silence record's zeros (they have no spurt to time); its spurt, -1 for none. The samples
    // of a message leave the ring in order, so the next one out is pcm[1 + pOut]; pOut counts
    // a sample when it leaves the ring, heard now or kept for the next block.
    const placeOf = (t) => {
      if (t < 0) return { pos: -1, s: -1 };
      const idx = 1 + pOut[t]++, src = pSource[t], s = pSpurt[t];
      return src === null || s < 0 ? { pos: -1, s: -1 } : { pos: src + idx, s };
    };
    // A sample of the source heard at output sample `out`: the spurt's offsets and the source map.
    function hear(pos, s, out) {
      if (s < 0) return;
      const sp = spurts[s], off = (out - pos) / PER_MS;
      if (sp.offsetFirst === null) sp.offsetFirst = off;
      if (sp.offsetStartMs === null && pos >= sp.from + INTO) sp.offsetStartMs = off;
      sp.offsetEndMs = off;
      if (pos >= 0 && out >= 0 && out < length && out % SLOT === MID) slots[(out - MID) / SLOT] = pos;
    }

    function runBlock() {
      const at = N * nextBlock - D;               // the block's first output sample
      nextBlock++;
      let samples = null;                         // a free or waiting channel gives zeros
      if (ch.playing) {
        // The mixer runs one sample ahead of what it plays (W3-10's upsampler read, section
        // 3): on the first block after a start it asks for 513, mixes the first 512 and keeps
        // the last; every later block mixes the kept sample, then the first 511 of its 512
        // new ones, and keeps the last. Nothing is dropped and the stream stays in order.
        const first = fresh;
        fresh = false;
        // A skip is heard where the channel next plays: at the first sample of this block that
        // left the ring after it (here, for every drop not yet placed).
        for (const d of unheard) d.time = (at + (first ? 0 : 1)) / VOICE_CHANNEL.rate;
        unheard.length = 0;
        const r = ch.pull(first ? N + 1 : N), n = r.samples.length;
        samples = new Float32Array(N);
        let j = 0;
        if (!first) {                             // the sample the last block kept
          samples[j] = kept.value;
          hear(kept.pos, kept.s, at + j);
          j++;
        }
        for (let i = 0; i < n - 1; i++, j++) {
          const p = placeOf(r.tags[i]);
          samples[j] = r.samples[i];
          hear(p.pos, p.s, at + j);
        }
        const p = placeOf(r.tags[n - 1]);
        kept = { value: r.samples[n - 1], pos: p.pos, s: p.s };
      } else kept = null;
      // (A channel stops playing only when it is freed, after a pull that emptied the ring; the
      // fade and the padding leave that pull's last sample 0, so the kept sample is silence.
      // What the engine does with it was not read.)
      const a = Math.max(0, at), b = Math.min(length, at + N);   // what falls inside 0 .. length - 1
      if (b > a) pieces.push(samples ? samples.slice(a - at, b - at) : new Float32Array(b - a));
    }

    // Every event that starts before time t (half samples), in time order; a tick before a
    // block that starts on it.
    function runBefore(t) {
      for (;;) {
        const tt = TICK * nextTick, tb = BLOCK * nextBlock;
        if (tt <= tb && tt < t) runTick();
        else if (tb < t) runBlock();
        else break;
      }
    }

    function take() {
      let n = 0;
      for (const p of pieces) n += p.length;
      const out = new Float32Array(n);
      let k = 0;
      for (const p of pieces) { out.set(p, k); k += p.length; }
      pieces = [];
      return out;
    }

    function push(message) {
      if (finished) throw new Error('push() after finish()');
      const m = message || {};
      const { tick, pcm } = m;
      // -1 marks a silence record; any other number is where pcm[0] sits, before sample 0 too
      // (a pre-roll at the very start of the source).
      const record = m.source === -1;
      const source = m.source;
      if (!record && !Number.isFinite(source)) throw new RangeError('push() takes the source position of pcm[0], or -1 for a silence record');
      if (!Number.isInteger(tick) || tick < floor) throw new RangeError('push() takes messages in tick order: a whole tick at or after the last one given');
      if (!(pcm instanceof Float32Array)) throw new TypeError('push() takes the message\'s decoded samples as a Float32Array');
      floor = tick;
      runBefore(TICK * tick);
      const p = pSource.length;
      let s = -1, first = false;
      if (!record) {
        if (!open) {                              // a spurt's first message
          open = first = true;
          spurts.push({ from: source, start: source / VOICE_CHANNEL.rate, end: source / VOICE_CHANNEL.rate,
            opened: false, offsetFirst: null, offsetStartMs: null, offsetEndMs: null, dropped: 0 });
        }
        s = spurts.length - 1;
        spurts[s].end = Math.max(spurts[s].end, (source + pcm.length) / VOICE_CHANNEL.rate);
      } else {                                    // a silence record closes the spurt
        if (open) s = spurts.length - 1;
        open = false;
      }
      pSource.push(record ? null : source); pSpurt.push(s); pIn.push(Math.max(0, pcm.length - 1)); pOut.push(0);
      const opensBefore = ch.opens, droppedBefore = ch.dropped;
      ch.add(pcm, p);
      if (ch.opens > opensBefore) { fresh = true; if (first) spurts[s].opened = true; }
      if (ch.dropped > droppedBefore) {           // an overflow: the oldest samples in the ring went
        const total = ch.dropped - droppedBefore;
        for (let k = total; k > 0;) {
          while (pOut[oldest] >= pIn[oldest]) oldest++;
          const take = Math.min(k, pIn[oldest] - pOut[oldest]);
          pOut[oldest] += take; k -= take;
          if (pSpurt[oldest] >= 0) spurts[pSpurt[oldest]].dropped += take;
        }
        const d = { time: null, ms: total / PER_MS };
        drops.push(d); unheard.push(d);
      }
      return take();
    }

    function advance(tick) {
      if (finished) throw new Error('advance() after finish()');
      if (!Number.isInteger(tick)) throw new RangeError('advance() takes a whole tick');
      if (tick > floor) { floor = tick; runBefore(TICK * tick); }
      return take();
    }

    function finish() {
      if (finished) throw new Error('finish() twice');
      finished = true;
      while (N * nextBlock - D < length) {
        if (TICK * nextTick <= BLOCK * nextBlock) runTick(); else runBlock();
      }
      for (const d of unheard) d.time = (N * nextBlock - D) / VOICE_CHANNEL.rate;   // never heard: after the end
      const info = {
        timeline: 'game', fps, bufferMs, waitTicks: ch.waitTicks, latency: lat,
        packets: pSource.length, opens: ch.opens, appended: spurts.filter((s) => !s.opened).length, gainResets,
        droppedSamples: ch.dropped, drops,
        spurts: spurts.map((s) => ({
          start: s.start, end: s.end, opened: s.opened,
          offsetStartMs: s.offsetStartMs !== null ? s.offsetStartMs : s.offsetFirst,
          offsetEndMs: s.offsetEndMs, droppedMs: s.dropped / PER_MS,
        })),
        source: slots,
      };
      return { samples: take(), info };
    }

    return Object.freeze({ push, advance, finish });
  }

  const TF2VoiceChannel = { VOICE_CHANNEL, waitTicks, latency, createChannel, createTimeline };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF2VoiceChannel;
  else root.TF2VoiceChannel = TF2VoiceChannel;
})(typeof self !== 'undefined' ? self : this);
