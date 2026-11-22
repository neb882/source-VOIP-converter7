// A second model of the frame clock (W3-23a, docs/work-orders/W3-23-low-frame-rates.md, "The frame clock"), for
// tests/voice-channel.verify.mjs and tests/render-channel.verify.mjs to compare voice-channel.js's createTimeline
// against under 1000/15 frames a second. It is written from the order's text with plain loops over frames and shares
// no code with createTimeline: the messages are a list known in advance, walked by an index; the channel is the
// caller's createChannel (voice-channel.js's, which the order does not change and the suite checks by itself); and
// the timeline's record (spurts, offsets, overflows, the source map) is written again from createTimeline's contract
// in voice-channel.js. The one thing it shares with the module is the definition of a frame's time:
// F(k) = (88200 k) / fps in double precision, compared with the whole numbers 1323 i (tick i) and 1024 b (block b).
//
// referenceFrames(messages, { fps, bufferMs, fadeTime, length, codecDelay, zeroSamples, gain, beforeAdd,
// createChannel, playOut, even }) -> { samples, info, spurtDropped, frames, over, voiceEnd, endsOnKept }
//   messages: [{ tick, pcm, source }] in the order given, ticks never falling; pcm a Float32Array at 1/32768 of the
//     channel's 16-bit units; source the 44.1 kHz place of pcm[0], -1 for a silence record.
//   fps, bufferMs, fadeTime: as createTimeline takes them (fps limited to 10..1000 for the clock as waitTicks limits
//     it). length: the output's samples, a whole number. codecDelay (seconds, default 0) or zeroSamples (D itself).
//   gain: { process(pcm) -> pcm, reset() } at 1/32768, or none. beforeAdd(message, index): called just before a
//     message reaches the channel (a caller that sets the gain's frame blocks per message does it here).
//   playOut (W3-24, docs/work-orders/W3-24-render-end.md, "The rule", written again here from the order's text): the
//     clock runs on past the base until the channel holds no sample and the sample the mixer kept is not one of a
//     sound message; the output runs on to one past the last sample at which a place of the source (a sample of a
//     sound message at 0 <= pos < length) was heard, and only such a place changes the record while it runs on.
//   even (W3-24): the clock of even ticks and blocks (1000/15 frames a second and above), for the record of a
//     play-out there: every tick and block in time order, a tick before a block that starts on it, a message with
//     tick a added on tick a before the tick's pass. Without it the frame rate must be under 1000/15.
//   samples: the output, length samples (length + over with playOut); info: what createTimeline's finish() gives,
//   member for member; spurtDropped: the samples each spurt lost to overflow; frames: [{ k, added: [indices],
//   ticks, blocks }] for every frame run (ticks and blocks: how many ran in it), for a test to read where each thing
//   happened (none with even); over: the run-on (0 without playOut); with playOut, voiceEnd: one past the last output
//   sample at which a place of the source was heard (0: none), and endsOnKept: that sample was the one the mixer
//   kept from the block before (a case for a test to look for).
// Synthetic only: no recording, log or file of the game is read.

const RATE = 44100;
const TICK = 1323, BLOCK = 1024, N = 512;               // half samples; samples a block
const SLOT = 882, MID = 441, INTO = 8820, PER_MS = 44.1;

// The clock's frame rate: the voice channel's limits (10 to 1000; 300 when not given).
export const frameRate = (fps) => Math.min(1000, Math.max(10, Number.isFinite(fps) ? fps : 300));
// The frame clock runs when a frame is longer than a tick: 88200 / fps > 1323.
export const frameClockRuns = (fps) => 88200 / frameRate(fps) > TICK;
// Frame k's time in half samples: the definition.
export const frameTime = (k, fps) => (88200 * k) / frameRate(fps);

export function referenceFrames(messages, { fps = 300, bufferMs = 100, fadeTime, length, codecDelay, zeroSamples, gain = null,
  beforeAdd = null, createChannel, playOut = false, even = false }) {
  if (!Number.isInteger(length) || length < 0) throw new RangeError('referenceFrames: length is a whole number of samples');
  if (typeof createChannel !== 'function') throw new TypeError('referenceFrames: createChannel is the channel to drive');
  const shownFps = Number.isFinite(fps) ? fps : 300, shownBuffer = Number.isFinite(bufferMs) ? bufferMs : 100;
  const F = frameRate(shownFps);
  if (!even && !(88200 / F > TICK)) throw new RangeError(`referenceFrames: at ${shownFps} frames a second a frame is no longer than a tick`);
  if (even && 88200 / F > TICK) throw new RangeError(`referenceFrames: at ${shownFps} frames a second the timeline runs the frame clock, not the even one`);
  let resets = 0;
  const ch = createChannel({ fps: shownFps, bufferMs: shownBuffer, fadeTime, gain: {
    process: (pcm) => Float64Array.from(gain ? gain.process(pcm) : pcm, (v) => v * 32768),
    reset() { resets++; if (gain) gain.reset(); }
  } });
  // The channel's latency and the zero, D, as voice-channel.js states them (latency(), zero()): the wait less its
  // first tick at 15 ms, plus the 0.16 s opening burst, no more than the 0.5 s ring; plus the mean arrival, 42.0 ms
  // since W3-27b (50.5 before it; 42.5 in W3-27b's second fix round only), and codecDelay, on whole 512-sample blocks. zeroSamples is D itself, with
  // codecDelay 0.
  const latency = Math.min(22050 / RATE, (ch.waitTicks - 1) * 0.015 + 0.16);
  const delay = zeroSamples !== undefined ? 0 : (codecDelay ?? 0);
  const D = zeroSamples !== undefined ? zeroSamples : N * Math.round(RATE * (latency + 0.042 + delay) / N);

  // Spurts, in the order given: a run of messages up to a silence record (the record its last).
  const spurtOf = [], spurts = [], firstOf = [];
  {
    let open = false;
    messages.forEach((m, i) => {
      if (m.source !== -1) {
        if (!open) {
          open = true;
          spurts.push({ from: m.source, start: m.source / RATE, end: m.source / RATE, opened: false, first: null, startMs: null, endMs: null, dropped: 0 });
          firstOf.push(i);
        }
        const sp = spurts[spurts.length - 1];
        sp.end = Math.max(sp.end, (m.source + m.pcm.length) / RATE);
        spurtOf.push(spurts.length - 1);
      } else {
        spurtOf.push(open ? spurts.length - 1 : -1);
        open = false;
      }
    });
  }
  const isFirst = new Set(firstOf);
  // Samples of each message that have left the ring (pulled or dropped); they leave in order.
  const gone = new Array(messages.length).fill(0);
  const out = new Float32Array(length), past = [];      // past: the output at or past length, by its index
  const slots = new Int32Array(Math.ceil(length / SLOT)).fill(-1), pastSlots = [];
  const drops = [], unplaced = [];
  let seenDrops = 0;
  // The play-out's state: whether the clock is running on past the base, the last output sample at which a place of
  // the source was heard (-1: none), and whether it was the sample the mixer kept.
  let runningOn = false, lastPlace = -1, lastWasKept = false;
  const isPlace = (pos, s) => s >= 0 && pos !== null && pos >= 0 && pos < length;
  const hear = (pos, s, at, wasKept) => {
    if (playOut && isPlace(pos, s) && at > lastPlace) { lastPlace = at; lastWasKept = wasKept; }
    if (runningOn && !isPlace(pos, s)) return;
    if (s < 0 || pos === null) return;
    const sp = spurts[s], off = (at - pos) / PER_MS;
    if (sp.first === null) sp.first = off;
    if (sp.startMs === null && pos >= sp.from + INTO) sp.startMs = off;
    sp.endMs = off;
    if (pos >= 0 && at >= 0 && at < length && at % SLOT === MID) slots[(at - MID) / SLOT] = pos;
    else if (pos >= 0 && at >= length && at % SLOT === MID) pastSlots.push({ i: (at - MID) / SLOT, pos, at });
  };
  // Where a sample that leaves the ring by a pull came from: its place in the source, or null (a record, padding).
  const placeOf = (tag) => {
    if (tag < 0) return { pos: null, s: -1 };
    const m = messages[tag], k = gone[tag]++;
    return m.source === -1 ? { pos: null, s: -1 } : { pos: m.source + 1 + k, s: spurtOf[tag] };
  };

  const frames = [];
  let next = 0, tick = 0, block = 0, fresh = false, kept = null;
  const addNext = (frame) => {
    const m = messages[next];
    if (beforeAdd) beforeAdd(m, next);
    const opens = ch.opens, dropped = ch.dropped;
    ch.add(m.pcm, next);
    if (ch.opens > opens) { fresh = true; if (isFirst.has(next)) spurts[spurtOf[next]].opened = true; }
    if (ch.dropped > dropped) {
      // The channel's own list of what left the ring, by message: each run counts against its message's samples.
      const list = ch.drops;
      for (; seenDrops < list.length; seenDrops++) {
        const d = list[seenDrops];
        if (d.tag < 0) continue;
        gone[d.tag] += d.count;
        if (spurtOf[d.tag] >= 0) spurts[spurtOf[d.tag]].dropped += d.count;
      }
      const d = { time: null, ms: (ch.dropped - dropped) / PER_MS };
      drops.push(d); unplaced.push(d);
    }
    if (frame) frame.added.push(next);
    next++;
  };
  // Block b: output samples 512 b - D to 512 b - D + 511. The mixer asks 513 on its first block after a start, plays
  // 512 and keeps the last; later blocks play the kept sample and the first 511 of their 512, and keep the last.
  const runBlock = () => {
    const at = N * block - D;
    block++;
    const s = new Float32Array(N);
    if (ch.playing) {
      const first = fresh;
      fresh = false;
      for (const d of unplaced) { d.heardAt = at + (first ? 0 : 1); d.time = d.heardAt / RATE; }
      unplaced.length = 0;
      const r = ch.pull(first ? N + 1 : N), n = r.samples.length;
      let j = 0;
      if (!first) { s[0] = kept.v / 32768; hear(kept.pos, kept.s, at, true); j = 1; }
      for (let i = 0; i < n - 1; i++, j++) { const p = placeOf(r.tags[i]); s[j] = r.samples[i] / 32768; hear(p.pos, p.s, at + j, false); }
      const p = placeOf(r.tags[n - 1]);
      kept = { v: r.samples[n - 1], pos: p.pos, s: p.s };
    } else kept = null;
    for (let j = 0; j < N; j++) {
      if (at + j >= 0 && at + j < length) out[at + j] = s[j];
      else if (playOut && at + j >= length) past[at + j - length] = s[j];
    }
  };
  // The frame clock: frame k at F(k), its three steps in order.
  const runFrame = (k) => {
    const t = (88200 * k) / F;
    const frame = { k, added: [], ticks: 0, blocks: 0 };
    // 1. Every message not yet added whose tick a has 1323 a <= F(k), in the order given.
    while (next < messages.length && TICK * messages[next].tick <= t) addNext(frame);
    // 2. Every tick i not yet run with 1323 i <= F(k).
    while (TICK * tick <= t) { ch.tick(); tick++; frame.ticks++; }
    // 3. Every block b not yet run with 1024 b <= F(k).
    while (BLOCK * block <= t) { runBlock(); frame.blocks++; }
    frames.push(frame);
  };
  // The even clock: the next tick (its messages first, then its pass) or the next block, whichever starts first.
  const runEvent = () => {
    if (TICK * tick <= BLOCK * block) {
      while (next < messages.length && messages[next].tick === tick) addNext(null);
      ch.tick(); tick++;
    } else runBlock();
  };
  let k = 0;
  const step = () => { if (even) runEvent(); else runFrame(k++); };
  // The base: until the blocks cover the length and every message has been added.
  while (N * block - D < length || next < messages.length) step();
  for (const d of unplaced) d.time = (N * block - D) / RATE;
  // The play-out: on until the channel holds nothing and the mixer's kept sample is not one of a sound message.
  const base = unplaced.map((d) => ({ d, time: d.time }));
  if (playOut) {
    runningOn = true;
    while (ch.count > 0 || (kept !== null && kept.pos !== null)) step();
  }
  const over = playOut ? Math.max(0, lastPlace + 1 - length) : 0;
  // An overflow heard by the play-out at or after length + over keeps the base's time.
  for (const { d, time } of base) if (!(d.heardAt !== undefined && d.heardAt < length + over && runningOn)) d.time = time;
  for (const d of drops) delete d.heardAt;
  let samples = out, source = slots;
  if (over > 0) {
    samples = new Float32Array(length + over);
    samples.set(out);
    for (let i = 0; i < over; i++) samples[length + i] = past[i];
    source = new Int32Array(Math.ceil((length + over) / SLOT)).fill(-1);
    source.set(slots);
    for (const { i, pos, at } of pastSlots) if (at < length + over) source[i] = pos;
  }
  const info = {
    timeline: 'game', fps: shownFps, bufferMs: shownBuffer, codecDelay: delay, waitTicks: ch.waitTicks, latency,
    packets: messages.length, opens: ch.opens, appended: spurts.filter((s) => !s.opened).length, gainResets: resets,
    droppedSamples: ch.dropped, drops,
    spurts: spurts.map((s) => ({ start: s.start, end: s.end, opened: s.opened, offsetStartMs: s.startMs !== null ? s.startMs : s.first,
      offsetEndMs: s.endMs, droppedMs: s.dropped / PER_MS })),
    source,
  };
  if (over > 0) info.over = over;
  return { samples, info, spurtDropped: spurts.map((s) => s.dropped), frames: even ? [] : frames, over,
    voiceEnd: lastPlace + 1, endsOnKept: lastPlace >= 0 && lastWasKept };
}
