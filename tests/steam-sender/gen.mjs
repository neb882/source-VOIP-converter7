// A reference generator of Steam's microphone reads on the rule as read (finding 28 of the public record,
// the paragraphs of 2026-11-20). Our own code: nothing of the owner's files or logs is in it.
//
//   import { createReadClock, DEFAULTS } from './gen.mjs'
//   const c = createReadClock({ seed: 1 });  c.next() -> { time, samples, by }
//
// time: ms from the clock's start; samples: whole capture steps of 750 that became readable since the read before;
// by: what ended the pass before this read ('game' the game's fetch, 'timeout', 'other' another wake, 'start').
//
// As a program:  node gen.mjs <reads> [key=value ...]  prints JSON { opts, reads: [[time, steps, by], ...] }.
//
// The parts (each with its standing in README.md):
//  1. The pass. A pass starts at a wake or a timeout. Its read is made `work` later. It then waits, in whole
//     milliseconds, for what is left of start + 50 ms. A wake that leaves under 1 ms to the deadline ends the pass;
//     an earlier wake only makes it wait again for the whole milliseconds then left.
//  2. Wakes. The game fetches voice once for each tick it runs, in the first frame at or after the tick's time;
//     a frame that is due several ticks runs them, and fetches, back to back. Other wakes: a rate, 0 by default.
//  3. The timeout. It ends on a timer step counted on from the last timeout's end: last + n x step + slip, the
//     first such at or after the wait's due time less `tolerance`, and never before the due time.
//  4. The capture. Packets of `packet` ms fill steps of 750 samples at 24 kHz; step k can be read once the packet
//     holding its last sample is in: packet x ceil(31.25 k / packet) after the capture's start, plus `late`.
//  5. A read brings the steps readable at its time and not yet taken.

export const DEFAULTS = Object.freeze({
  seed: 0xC0FFEE,
  pass: 50,            // ms: the pass's length (read: 50,000 microseconds)
  tick: 15,            // ms: the game's tick (66.67 a second)
  fps: 294,            // the game's frame rate (measured on the owner's PC at fps_max 300)
  frameJitter: 0,      // share of a frame by which each frame's length varies, evenly (0: none)
  fetchSpread: 1,      // ms: the fetch falls evenly within this long after its frame's start
  recording: true,     // false: the game does not fetch (no wakes of its own)
  otherRate: 3,        // other wakes a second (Poisson)
  timerStep: 15.625,   // ms: Windows's default timer step
  slip: 1.3,           // ms: spread (normal) of a timeout's end about its step
  tolerance: 1,        // ms: a step this little before the due time still ends the wait (at the due time)
  fresh: 0,            // 1: no steps; a timeout ends an even 0 to timerStep after its due time, drawn each pass (for comparison)
  work: 0.05,          // ms from a pass's start to its read, least
  workSpread: 1.5,     // ms: the read falls evenly within this long after that
  packet: 10,          // ms: the capture's packets (10, or 20 as Set Q's sender had in two stretches)
  late: 9,             // ms: a step is readable up to this long after its last packet, evenly
  step: 750,           // samples a capture step
  rate: 24000,
});

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createReadClock(opts) {
  const o = Object.assign({}, DEFAULTS, opts || {});
  // separate sources, so that a change to one part does not move the others' draws
  const R = (mix) => mulberry32((o.seed ^ mix) >>> 0);
  const rPhase = R(0x1F123BB5), rGame = R(0x2545F491), rTimer = R(0x51ED270B), rWork = R(0x6C8E9CF5), rCap = R(0x3C6EF372), rOther = R(0x7F4A7C15);
  const gauss = () => { const u = 1 - rTimer(), v = rTimer(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const stepMs = 1000 * o.step / o.rate;                 // 31.25
  const frame = 1000 / o.fps;

  // the phases, as seeded draws: nothing read or measured ties them
  const tickPhase = o.tick * rPhase();
  const framePhase = frame * rPhase();
  const capPhase = (o.phaseCap === undefined) ? o.packet * rPhase() : o.phaseCap;   // the capture's start against the clock
  let anchor = -o.timerStep * rPhase();                  // the last timeout's end, before the clock's start

  // --- the game's fetches, in order
  let frameT = framePhase, tickN = 0;                    // frameT: the current frame's start; tickN: ticks run so far
  const fetchQ = [];
  function moreFetches() {
    // run frames until one is due at least a tick
    for (;;) {
      let due = 0;
      while (tickPhase + tickN * o.tick <= frameT) { tickN++; due++; }
      const t0 = frameT + o.fetchSpread * rGame();
      const jit = o.frameJitter ? 1 + o.frameJitter * (2 * rGame() - 1) : 1;
      frameT += frame * jit;
      if (due) { for (let i = 0; i < due; i++) fetchQ.push(t0 + 0.02 * i); return; }
    }
  }
  function nextFetchAfter(t) {
    if (!o.recording) return Infinity;
    for (;;) {
      while (fetchQ.length && fetchQ[0] <= t) fetchQ.shift();
      if (fetchQ.length) return fetchQ[0];
      moreFetches();
    }
  }
  // --- other wakes
  let otherT = o.otherRate > 0 ? -Math.log(1 - rOther()) * 1000 / o.otherRate : Infinity;
  function nextOtherAfter(t) {
    while (otherT <= t) otherT += -Math.log(1 - rOther()) * 1000 / o.otherRate;
    return otherT;
  }
  // --- the timeout: steps counted on from the last timeout's end
  let slipN = -1, slipV = 0;
  function timeoutEnd(due) {
    if (o.fresh) { if (slipN !== -2) { slipN = -2; slipV = o.timerStep * rTimer(); } return due + slipV; }
    let n = Math.max(1, Math.ceil((due - o.tolerance - anchor) / o.timerStep));
    for (;;) {
      if (n !== slipN) { slipN = n; slipV = o.slip * gauss(); }
      const q = anchor + n * o.timerStep + slipV;
      if (q >= due - o.tolerance) return Math.max(q, due);
      n++;
    }
  }
  // --- the capture
  let capK = 0, capReady = -Infinity;
  function readyOf(k) {                                  // when step k (1-based) can be read
    const pk = Math.ceil(stepMs * k / o.packet - 1e-9);
    return capPhase + o.packet * pk + (o.late ? o.late * rCap() : 0);
  }
  let nextReady = readyOf(1);

  let start = 0, by = 'start';
  return Object.freeze({
    opts: o,
    next() {
      const readT = start + o.work + o.workSpread * rWork();
      slipN = -1;
      let n = 0;
      while (Math.max(nextReady, capReady) <= readT) { capReady = Math.max(nextReady, capReady); capK++; n++; nextReady = readyOf(capK + 1); }
      const out = { time: readT, samples: o.step * n, by };
      // the wait
      let now = readT;
      const deadline = start + o.pass;
      for (;;) {
        const left = Math.floor(deadline - now);
        const due = now + Math.max(0, left);
        const tOut = left <= 0 ? now : timeoutEnd(due);
        const g = nextFetchAfter(now), w = nextOtherAfter(now);
        const wake = Math.min(g, w);
        if (wake < tOut) {
          now = wake;
          if (deadline - now < 1) { start = now; by = g <= w ? 'game' : 'other'; break; }
        } else {
          start = tOut; by = 'timeout'; anchor = tOut; slipN = -1; break;
        }
      }
      return out;
    },
  });
}

// As a program.
if (import.meta.url === `file://${process.argv[1]}`) {
  const n = parseInt(process.argv[2] || '300', 10);
  const opts = {};
  for (const a of process.argv.slice(3)) {
    const [k, v] = a.split('=');
    opts[k] = v === 'true' ? true : v === 'false' ? false : Number(v);
  }
  const c = createReadClock(opts);
  const reads = [];
  for (let i = 0; i < n; i++) { const r = c.next(); reads.push([Math.round(r.time * 1000) / 1000, r.samples / c.opts.step, r.by]); }
  process.stdout.write(JSON.stringify({ opts: c.opts, reads }) + '\n');
}
