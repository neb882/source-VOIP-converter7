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
 * channel starts; that is the mixer's doing, so pull(n) takes exactly n.
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
    // The logs: the mixer takes 512 samples at a time, and its first block after a channel
    // starts takes 513 (16 of 16 starts in the first log; what it does with the extra
    // sample was not read). For the clock that drives a channel; pull() takes what it is
    // asked for.
    mixBlock: 512,
    firstBlock: 513,
  });
  Object.freeze(VOICE_CHANNEL.bufferMsRange);
  Object.freeze(VOICE_CHANNEL.fpsRange);

  // The burst a restarted spurt opens with: eight 20 ms frames in 17 of 23 openings of the
  // first log and 16 of its 17 restarts (W3-03, "Checked against the owner's console log").
  const OPENING_SECONDS = 0.16;

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
      let from = keepSample ? 0 : Math.min(1, pcm.length), n = pcm.length - from;
      if (n > size) {                             // more than the ring: the packet's oldest go too
        dropOldest(count);
        const lost = n - size;
        drops.push({ pulled, count: lost, tag: label });
        dropped += lost; from += lost; n = size;
      } else if (count + n > size) dropOldest(count + n - size);
      let w = (head + count) % size;
      for (let i = 0; i < n; i++) {
        data[w] = pcm[from + i];
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

  const TF2VoiceChannel = { VOICE_CHANNEL, waitTicks, latency, createChannel };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF2VoiceChannel;
  else root.TF2VoiceChannel = TF2VoiceChannel;
})(typeof self !== 'undefined' ? self : this);
