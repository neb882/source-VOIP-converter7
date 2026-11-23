// The suite's writing of the queue's rule for the game timeline's zero (W3-29,
// docs/work-orders/W3-29-timeline-zero.md, "The receiver's rule" and "The checks"), for
// tests/voice-channel.verify.mjs, tests/render-channel.verify.mjs and the second model
// (reference-frames.mjs) to hold voice-channel.js's zeroSeconds(), zero() and relayTick() against.
// It shares no code with the module, and it does not use the order's closed steps: it steps the
// clock as createTimeline does, under 1000/15 frames a second one frame at a time (in each frame the
// messages whose tick has come, then every tick due, then every block due), and on the clock of even
// ticks and blocks one event at a time (a tick before a block that starts on it, a message added on
// its tick before the tick's pass). Each opening has a fresh channel of its own, and all of them ride
// one walk of the clock. A channel counts the tick passes run since its message was added; it plays
// once it has counted `wait` of them, from the first block that runs after that pass. What it shares
// with the module is the clock's definitions only: tick i at 1323 i, block b at 1024 b and frame k at
// (88200 k) / rate half samples at 44.1 kHz, compared as the clock compares them (1323 i <= F(k),
// 1024 b <= F(k)), with rate the frame rate limited to 10..1000 (300 when not a number); and the relay
// of engine/network.js at jitter 0 under 1000/15, as that file states it: the message of tick p is in
// the listener's list from 1323 (p + 1), leaves at the listener's first frame past that, F(k), and
// reaches the channel on ceil(F(k) / 1323) - 2.
//
// suiteFirsts({ fps, wait, ticks, relay }) -> Float64Array: for p = 0 .. ticks - 1 (5,120 when not
//   given), the half samples from the sender's tick p to the start of the first block that plays an
//   opening sent on tick p, as the walk gives them. relay (default true) pushes each message on the
//   relay's tick under 1000/15; false pushes it on tick p. The even clock has no relay.
// suiteArrival(p, fps): the relay's tick for tick p, by a walk of the frames from frame 0.
// suiteWait(bufferMs, fps): the channel's wait in ticks, as the engine counts it.
// suiteMeanFirst(fps, wait): the mean of suiteFirsts over ticks 0 to 5,119, in half samples.
// suiteQueueSeconds(bufferMs, fps): the queue's part of the zero, min(0.16 + mean first(wait),
//   0.5 + mean first(1)), the means in half samples / 88200.
// suiteZeroSeconds(bufferMs, fps, codecDelay, senderSeconds) and suiteZero(...): the zero before and
//   after it is put on whole blocks of 512 samples, 512 round(44100 x seconds / 512).
// SENDER_MEASURED and SUITE_SENDER_SECONDS: the sender's part as the suite measured it, and the
//   figure it takes, to the tenth of a millisecond.
// Synthetic only: nothing of the game's is read.

const TICK = 1323, BLOCK = 1024, HALF = 88200, RATE = 44100, N = 512;
const rateOf = (fps) => Math.min(1000, Math.max(10, Number.isFinite(fps) ? fps : 300));
export const suiteWait = (bufferMs, fps) => {
  const pad = Math.min(5000, Math.max(1, Number.isFinite(bufferMs) ? bufferMs : 100));
  return Math.ceil(pad / 1000 * rateOf(fps) - 1e-6);
};
const framesRun = (rate) => HALF / rate > TICK;

// The sender's part as measured (W3-29, "The sender's part"; tests/voice-channel.verify.mjs, check 4,
// and --arrival, which measures it again): the mean of 15 ms x tick - start / 24 - 160 ms over the
// opening message of every spurt of layout R, steam-sender.js alone, over seeds 1 to 12,000 and over
// seeds 1 to 4,000 (the default run's), with the openings by their frames and the standard error by
// seed. Every opening has the full pre-roll of 2400 samples. Measured on the model, 2026-11-22.
export const SENDER_MEASURED = Object.freeze({
  all: Object.freeze({ seeds: 12000, mean: 35.33053385416652, openings: 96000, seBySeed: 0.04649959899339636, frames: Object.freeze({ 6: 17516, 8: 76382, 9: 2102 }) }),
  part: Object.freeze({ seeds: 4000, mean: 35.34187760416755, openings: 32000, seBySeed: 0.07961102167541023, frames: Object.freeze({ 6: 5857, 8: 25424, 9: 719 }) }),
});
// The sender's part the suite takes: the mean over seeds 1 to 12,000 to the tenth of a millisecond
// (chosen, the order's ruling 1), in seconds: 353 / 10000, the double nearest 0.0353.
export const SUITE_SENDER_SECONDS = Math.round(10 * SENDER_MEASURED.all.mean) / 10000;

export function suiteFirsts({ fps, wait, ticks = 5120, relay = true }) {
  const rate = rateOf(fps), F = (k) => (HALF * k) / rate;
  if (!Number.isInteger(wait) || wait < 1) throw new RangeError('suiteFirsts: wait is a whole number of ticks, 1 or more');
  const out = new Float64Array(ticks).fill(NaN);
  // The channels in their wait, in the order added (each the pass count at its add), and those that
  // play and have had no block yet.
  const waiting = [], playing = [];
  let head = 0, passes = 0, done = 0;
  const add = (p) => waiting.push([p, passes]);
  const pass = () => {
    passes++;
    while (head < waiting.length && passes - waiting[head][1] >= wait) playing.push(waiting[head++][0]);
  };
  const mix = (block) => {
    for (const p of playing) { out[p] = BLOCK * block - TICK * p; done++; }
    playing.length = 0;
  };
  if (!framesRun(rate)) {
    // The even clock: events in time order; opening p's message is added on tick p, before its pass.
    for (let tick = 0, block = 0, p = 0; done < ticks;) {
      if (TICK * tick <= BLOCK * block) {
        if (p < ticks && p === tick) add(p++);
        pass();
        tick++;
      } else mix(block++);
    }
    return out;
  }
  // The relay, on a walk of its own: the message of tick p comes on the tick its look gives, which can
  // be a tick whose frame runs before the look's (from 34 to 66 frames a second the two ticks taken off
  // put it in the first frame at or after its own tick), so it is known before the walk that adds it.
  const arrive = new Float64Array(ticks);
  if (relay) {
    for (let k = 0, p = 0; p < ticks; k++) {
      const t = F(k);
      while (p < ticks && TICK * (p + 1) < t) arrive[p++] = Math.ceil(t / TICK) - 2;
    }
  } else for (let p = 0; p < ticks; p++) arrive[p] = p;
  // The frame clock, one frame at a time.
  for (let k = 0, tick = 0, block = 0, p = 0; done < ticks; k++) {
    const t = F(k);
    while (p < ticks && TICK * arrive[p] <= t) add(p++);       // 1. what has come, in order
    for (; TICK * tick <= t; tick++) pass();                    // 2. every tick due
    for (; BLOCK * block <= t; block++) mix(block);             // 3. every block due
  }
  return out;
}

// The relay's tick for one tick p, by a walk of the frames from frame 0.
export function suiteArrival(p, fps) {
  const rate = rateOf(fps);
  if (!framesRun(rate)) return p;
  let k = 0;
  while ((HALF * k) / rate <= TICK * (p + 1)) k++;
  return Math.ceil(((HALF * k) / rate) / TICK) - 2;
}

// The mean of first over ticks 0 to 5,119, in half samples: the sum of the walk's whole numbers over
// 5,120. Kept by wait and, under the frame clock, by rate (the even clock has no frames).
const kept = new Map();
export function suiteMeanFirst(fps, wait) {
  const rate = rateOf(fps), key = `${framesRun(rate) ? rate : 'even'} ${wait}`;
  if (!kept.has(key)) {
    let sum = 0;
    for (const x of suiteFirsts({ fps: rate, wait })) sum += x;
    kept.set(key, sum / 5120);
  }
  return kept.get(key);
}

export function suiteQueueSeconds(bufferMs, fps) {
  const wait = suiteWait(bufferMs, fps);
  return Math.min(0.16 + suiteMeanFirst(fps, wait) / HALF, 22050 / RATE + suiteMeanFirst(fps, 1) / HALF);
}

export function suiteZeroSeconds(bufferMs, fps, codecDelay = 0, senderSeconds = SUITE_SENDER_SECONDS) {
  return senderSeconds + suiteQueueSeconds(bufferMs, fps) + codecDelay;
}

export const suiteZero = (bufferMs, fps, codecDelay = 0, senderSeconds = SUITE_SENDER_SECONDS) =>
  N * Math.round(RATE * suiteZeroSeconds(bufferMs, fps, codecDelay, senderSeconds) / N);
