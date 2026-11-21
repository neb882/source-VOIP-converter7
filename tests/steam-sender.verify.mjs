// Steam's sender (steam-sender.js), checked against "The sender's packets" in
// docs/work-orders/W3-02-receiver-queue.md, against docs/work-orders/W3-16-sender-hold-clock.md
// (the hold in 32-bit floats on Steam's clock, a read that brings nothing) and against
// docs/work-orders/W3-27-sender-clock.md (the clock on the rule as read): the clock, the float
// arithmetic, the empty read, the reference schedule, the statistics, the gate, the pre-roll,
// the hold, the gate off and every sample sent once.
//
//   node tests/steam-sender.verify.mjs
//
// A second model of the orders' text, written with plain arrays (plainSender below), runs
// beside the module: the two must agree read for read and message for message, and it gives
// what the module does not show (which read made which message). Its seeded clock (refClock)
// is the study's generator, tests/steam-sender/gen.mjs, run in this process, with the steps,
// the lead and the phase computed here a second time from the order's text (W3-27b, check 2).
// The clock of W3-16 (plainClock), which no longer runs, is kept as the break of W3-27a's
// check 8.
//
// W3-27a (docs/work-orders/W3-27-sender-clock.md): the clock on the rule as read (createClock
// since W3-27b) against the study's generator: its reads to the last bit, three steps at most,
// the capture's place, the draws, the reads never ahead of the capture, its statistics against
// the order's bands, the old clock through the same counting, 20 ms packets, the other
// senders, the refusals. These sections come last, with W3-27b's check of the capture's place
// through the sender.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const M = require('../steam-sender.js');
const { STEAM_SENDER, createClock, createSender } = M;
const GEN = fileURLToPath(new URL('./steam-sender/gen.mjs', import.meta.url));
const { createReadClock: genClock } = await import('./steam-sender/gen.mjs');

let passed = 0;
function check(name, ok, detail = '') { assert.ok(ok, `${name} ${detail}`); passed++; console.log(`  ok    ${name}${detail ? `   [${detail}]` : ''}`); }

const f32 = Math.fround;

// ---------------------------------------------------------------------------------------
// The orders' text, a second time: the clock and the sender with plain arrays.

function mulberry32(seed) {   // as in engine/dsp.js
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The seeded clock a second time (W3-27b, check 2): the reference's reads (gen.mjs: the time of
// each read in ms and what ended the pass before it), with the steps, the lead and the phase
// computed here from the order's text: the suite's own draws of P (phasesOf, below), its own
// C, and ready(k) as "The rule" writes it, three steps a read at most. place: in place of the
// drawn one (the draws are made either way). Returns next() with .lead and .place.
function refClock(seed, { place } = {}) {
  const g = genClock({ seed }), d = phasesOf(seed), P = place ?? d.place, C = mulberry32((seed ^ 0x3C6EF372) >>> 0);
  const ready = (k) => (d.capPhase + (10 * Math.ceil(31.25 * (k + P) / 10 - 1e-9) - 31.25 * P)) + 9 * C();
  let k = 0, top = -Infinity, next = ready(1);
  return Object.assign(() => {
    const t = g.next().time;
    let n = 0;
    while (n < 3 && Math.max(next, top) <= t) { top = Math.max(next, top); k++; n++; next = ready(k + 1); }
    const since = t / 1000;
    return { time: d.phase + since, since, samples: 750 * n };
  }, { lead: d.lead, place: P });
}

// The clock of W3-16 (the W3-16 order, item 1, as written there), which no longer runs: the
// reads from A, the capture from B; the capture steps' ready times kept in an array. Kept as
// the break of W3-27a's check 8, so that the counting of the statistics is tested.
function plainClock(seed) {
  const A = mulberry32((seed ^ 0x51ED270B) >>> 0), B = mulberry32((seed ^ 0x2545F491) >>> 0);
  const phase = 0.25 * A();
  let r = 0.0637 * A();
  const c0 = 0.03125 * B();
  const ready = [];
  // The W3-21 order: the capture's lead, the zeros it reads before the source.
  const lead = (750 - Math.round(c0 * 24000)) % 750;
  let taken = 0;
  const readyAt = (j) => {
    while (ready.length <= j) {
      const k = ready.length, v = c0 + (k + 1) * 0.03125 + 0.013 * B();
      ready.push(k === 0 ? v : Math.max(ready[k - 1], v));
    }
    return ready[j];
  };
  return Object.assign(() => {
    let n = 0;
    while (readyAt(taken) <= r) { taken++; n++; }
    const read = { time: phase + r, since: r, samples: 750 * n };
    r = r + (0.0480 + (0.0637 - 0.0480) * A());
    return read;
  }, { lead, c0 });
}

// The whole signal at once; next() gives reads { time, since?, samples }. Returns
// { messages, frames }: frames has one entry per read, { time, since, nowF, count, len,
// active, final, made } (count: the samples read once it is done; made: the index of the
// message it sent, or -1). lead (W3-21; next.lead when left out, else 0): the capture reads
// that many zeros before the signal; since is the read's less lead / 24000 and a start is
// in samples of the signal (count is in samples read, the zeros included).
function plainSender(signal, next, { gate = true, meanMin = 327.67, uptime = 777600, lead = next.lead ?? 0 } = {}) {
  const HOLD = f32(0.4);
  const L = lead + signal.length, at = (i) => (i >= lead && i < L ? signal[i - lead] : 0);
  let state = 'SILENT', past = [], kept = [], noted = 0, lastTick = -1, read = 0, total = 0;
  let spurt = -1, spurtStart = 0, spurtFrames = 0;
  const messages = [], frames = [];
  const tickOf = (since) => (lastTick = Math.max(lastTick + 1, Math.ceil((since + 0.002) / 0.015)));
  const encode = (since, pcm, final) => {
    let buf = kept.concat(pcm);
    const count = final ? Math.ceil(buf.length / 480) : Math.floor(buf.length / 480);
    while (buf.length < count * 480) buf.push(0);
    kept = final ? [] : buf.slice(count * 480);
    buf = buf.slice(0, count * 480);
    if (!count && !final) return -1;
    messages.push({ tick: tickOf(since), spurt, first: total, last: total + count - 1, start: spurtStart - lead + 480 * spurtFrames, end: final, pcm: buf });
    total += count; spurtFrames += count;
    return messages.length - 1;
  };
  for (;;) {
    if (gate && read >= L && state === 'SILENT') break;
    const x = next();
    const since = (x.since === undefined ? x.time : x.since) - lead / 24000, nowF = f32(uptime + x.time);
    if (x.samples === 0) {
      const f = { time: x.time, since, nowF, count: read, len: 0, made: -1, final: false };
      frames.push(f);
      if (gate && state === 'ENDED') state = 'SILENT';
      else if (gate && (state === 'ACTIVE' || state === 'HANGING')) {
        state = 'HANGING';
        if (nowF > f32(noted + HOLD)) { f.final = true; f.made = encode(since, [], true); state = 'ENDED'; }
      }
      continue;
    }
    const count = read + x.samples;
    const lastFrame = !gate && count > L;
    const end = lastFrame ? L : count;
    const chunk = [];
    for (let k = read; k < end; k++) chunk.push(at(k));
    const from = read;
    read = count;
    const f = { time: x.time, since, nowF, count, len: chunk.length, made: -1, final: false };
    frames.push(f);
    if (!chunk.length) {                        // the gate off, nothing left: the end marker
      if (state === 'ACTIVE') f.made = encode(since, [], true);
      break;
    }
    const sum = chunk.reduce((a, v) => a + Math.abs(v), 0), peak = Math.max(...chunk.map(Math.abs));
    f.active = !gate || sum / chunk.length >= meanMin || peak >= 4915;
    if (state === 'SILENT' || state === 'ENDED') {
      if (f.active) {
        let pcm = chunk, pre = 0;
        if (state === 'SILENT') { if (!past.length) past = new Array(2400).fill(0); pre = past.length; pcm = past.concat(chunk); past = []; }
        spurt++; spurtStart = from - pre; spurtFrames = 0;
        kept = []; state = 'ACTIVE'; noted = nowF;
        f.final = lastFrame;
        f.made = encode(since, pcm, lastFrame);
        if (lastFrame) state = 'ENDED';
      } else {
        past = past.concat(chunk).slice(-2400);
        if (state === 'ENDED') { messages.push({ tick: tickOf(since), silence: chunk.length }); f.made = messages.length - 1; }
        state = 'SILENT';
      }
    } else {
      if (f.active) { state = 'ACTIVE'; noted = nowF; } else state = 'HANGING';
      f.final = lastFrame || (state === 'HANGING' && nowF > f32(noted + HOLD));
      f.made = encode(since, chunk, f.final);
      if (f.final) state = 'ENDED';
    }
    if (lastFrame) break;
  }
  return { messages, frames };
}

// The module on a whole signal, pushed in pieces of `piece` samples (Infinity: at once).
function run(signal, opts, piece = Infinity) {
  const s = createSender(opts);
  const out = [];
  for (let i = 0; i < signal.length; i += Math.min(piece, signal.length)) out.push(...s.push(signal.subarray(i, Math.min(signal.length, i + piece))));
  out.push(...s.finish());
  return { messages: out, info: s.info() };
}

// The old hand clocks (whole numbers n[i] of 15.625 ms timer ticks, the capture at
// 750 x floor(n / 2)) as reads (the W3-16 order, item 8): { time: n[i] x 0.015625, samples:
// 750 x (floor(n[i] / 2) - floor(n[i-1] / 2)) }, a read whose samples are 0 left out. They run
// with uptime 0.
const readsOfTicks = (nextTick) => {
  let prev = 0;
  return () => {
    for (;;) {
      const n = nextTick(), samples = 750 * (Math.floor(n / 2) - Math.floor(prev / 2));
      prev = n;
      if (samples > 0) return { time: n * 0.015625, samples };
    }
  };
};
const tickStep = (step) => { let i = 0; return () => step * (++i); };
const handReads = (step) => readsOfTicks(tickStep(step));
const handClock = (step) => ({ next: handReads(step) });
const HAND = (step, extra = {}) => ({ clock: handClock(step), uptime: 0, ...extra });
const listClock = (list) => { let i = 0; return { next: () => list[i++] }; };
const fmt = (m) => (!m ? 'none' : m.silence !== undefined ? `[${m.tick},-1,${m.silence}]` : `[${m.tick},${m.first},${m.last}${m.end ? ',e' : ''}]`);
const plainOf = (m) => (m.silence !== undefined ? m : { ...m, pcm: Array.from(m.pcm) });
const same = (a, b) => JSON.stringify(a.map(plainOf)) === JSON.stringify(b.map(plainOf));
const sound = (ms) => ms.filter((m) => m.silence === undefined);
const threw = (fn, re) => { try { fn(); } catch (e) { return e instanceof RangeError && re.test(e.message); } return false; };

// The order's signals.
function referenceSignal() {
  const s = new Int16Array(96000);
  s.fill(1000, 24000, 60000); s.fill(1000, 72000, 78000);
  return s;
}
function statsSignal() {
  const s = new Int16Array(240000);
  s.fill(1000, 24000, 216000);
  return s;
}

// The W3-16 order's "The reference schedule", recorded again on the clock of W3-27b: the
// default seed's 50 messages on the reference signal (lead 377, place 4). On the clock of
// W3-16 with W3-21's lead (49) they were the list below it, and with lead 0 the W3-16 order's.
const REF_MESSAGES = `[74,0,7] [78,8,10] [82,11,11] [86,12,14] [90,15,18] [93,19,21] [97,22,24] [101,25,25] [105,26,30] [109,31,33]
[112,34,35] [116,36,38] [119,39,41] [123,42,43] [127,44,46] [131,47,49] [134,50,52] [138,53,54] [142,55,57] [146,58,60]
[150,61,63] [153,64,66] [157,67,68] [160,69,71] [164,72,74] [168,75,77] [172,78,80] [176,81,83] [180,84,85] [183,86,88]
[187,89,91] [190,92,94] [194,95,96] [198,97,100,e] [202,-1,1500] [205,101,106] [209,107,107] [212,108,110] [216,111,114]
[220,115,117] [224,118,120] [228,121,121] [231,122,125] [235,126,128] [238,129,131] [242,132,132] [246,133,135]
[250,136,140,e] [253,-1,1500]`.split(/\s+/);
// W3-27b, check 3: seed 1's first ten reads, as samples at since (to 1 us) and what ended the
// pass before each, each time 0.055458 s more; and the SHA-256 of its first 100,000 reads,
// recorded from the build (the reference's reads to the last bit, with the place drawn: 1).
const REF_READS = [[0, 0.001072, 'start'], [750, 0.05264, 'timeout'], [1500, 0.113422, 'timeout'], [1500, 0.173888, 'timeout'],
  [1500, 0.235859, 'game'], [1500, 0.294736, 'game'], [750, 0.345659, 'timeout'], [1500, 0.398448, 'game'], [1500, 0.455014, 'timeout'],
  [1500, 0.518194, 'timeout']];
const REF_PHASE = 0.055458;
const CLOCK_HASH = '32ef4221aea9a0a1d9d2c5dda2a08a291ae53b6bef6f971ac2c64c3f11157130';
// The hand clock n = 4 (i + 1), from W3-02b's order: unchanged at uptime 0.
const HAND_FIRST = '[71,0,7] [76,8,10] [80,11,13] [84,14,16] [88,17,19] [92,20,22] [96,23,25] [101,26,29] [105,30,32]'.split(' ');
const HAND_LAST = '[246,136,139,e] [251,-1,1500]'.split(' ');

// ---------------------------------------------------------------------------------------

console.log('The module');
{
  const src = fs.readFileSync(fileURLToPath(new URL('../steam-sender.js', import.meta.url)), 'utf8');
  const page = vm.createContext({}), worker = vm.createContext({ self: {} });
  vm.runInContext(src, page); vm.runInContext(src, worker);
  check('it loads as a page script and in a worker as TF2SteamSender, with no imports',
    ['STEAM_SENDER', 'createClock', 'createSender'].every((k) => k in page.TF2SteamSender && k in worker.self.TF2SteamSender)
    && Object.keys(M).join() === 'STEAM_SENDER,createClock,createSender' && !/\bimport\b|\brequire\(/.test(src));
  check('it draws only from its seed: no Math.random, no clock, no date', !/Math\.random|Date\b|performance\.now|process\.hrtime/.test(src));
  const S = STEAM_SENDER;
  check('its constants are frozen and the orders\'', Object.isFrozen(S) && S.rate === 24000 && S.frame === 480 && S.grid === 750 && S.preroll === 2400
    && S.hold === 0.4 && S.meanMin === 327.67 && S.peakMin === 4915 && S.phaseSpan === 0.25 && S.uptime === 777600 && S.relay === 0.002 && S.tick === 0.015
    && Object.isFrozen(S.clock));
  check('the timer-tick clock\'s constants are gone (timer, period, late, lateMax)', ['timer', 'period', 'late', 'lateMax'].every((k) => !(k in S)));
  check('the clock of W3-16 is gone with its constants (readMin, readMax, captureLate, seedMix, seedMixCapture) and the name createReadClock (W3-27b)',
    ['readMin', 'readMax', 'captureLate', 'seedMix', 'seedMixCapture'].every((k) => !(k in S)) && !('createReadClock' in M) && !/createReadClock/.test(src));
}

console.log('The clock (W3-27b: the rule as read; checks 2 and 3)');
{
  const c = createClock({ seed: 1 }), first = Array.from({ length: 10 }, () => c.next());
  const bad = first.findIndex((r, i) => r.samples !== REF_READS[i][0] || Math.abs(r.since - REF_READS[i][1]) > 1e-6 || Math.abs(r.time - r.since - REF_PHASE) > 1e-6 || r.by !== REF_READS[i][2]);
  check('seed 1: its first ten reads as recorded, as samples at since (to 1 us) with what ended the pass before each, each time 0.055458 more', bad < 0,
    first.map((r) => `${r.samples}@${r.since.toFixed(6)} ${r.by}`).join(' '));
  const hash = (seed, k) => {
    const cl = createClock({ seed }), buf = Buffer.alloc(18 * k);
    for (let i = 0; i < k; i++) { const r = cl.next(); buf.writeDoubleLE(r.time, 18 * i); buf.writeDoubleLE(r.since, 18 * i + 8); buf.writeUInt16LE(r.samples, 18 * i + 16); }
    return crypto.createHash('sha256').update(buf).digest('hex');
  };
  const h = hash(1, 100000);
  check('seed 1, 100,000 reads as time, since (64-bit floats) and samples (16 bits), little-endian: the SHA-256 recorded from the build (W3-27b, check 3)', h === CLOCK_HASH, h);
  const take = (seed, k) => { const cl = createClock({ seed }); return JSON.stringify(Array.from({ length: k }, () => cl.next())); };
  check('two seeds differ; one seed repeats', take(1, 50) !== take(2, 50) && take(5, 1000) === take(5, 1000));
  check('an unseeded clock is seed 0xC0FFEE\'s', take(undefined, 50) === take(0xC0FFEE, 50));
  let refused = 0;
  for (const v of [NaN, Infinity, '7', null]) {
    try { createClock({ seed: v }); } catch (e) { if (e instanceof RangeError) refused++; }
    try { createSender({ seed: v }); } catch (e) { if (e instanceof RangeError) refused++; }
  }
  check('a seed that is given but is not a finite number is refused, not taken as 0xC0FFEE', refused === 8);
  // Read for read, bit for bit, against the second copy: the reference's times with the
  // steps, the lead and the phase computed here (refClock).
  let agree = true, where = '';
  for (let seed = 1; seed <= 400 && agree; seed++) {
    const a = createClock({ seed }), b = refClock(seed);
    if (a.lead !== b.lead || a.place !== b.place) { agree = false; where = `seed ${seed}: lead ${a.lead} for ${b.lead}, place ${a.place} for ${b.place}`; break; }
    for (let i = 0; i < 2000; i++) {
      const x = a.next(), y = b();
      if (!Object.is(x.time, y.time) || !Object.is(x.since, y.since) || x.samples !== y.samples) { agree = false; where = `seed ${seed} read ${i}`; break; }
    }
  }
  check('seeds 1 to 400, 2000 reads each, with the place drawn: time, since and samples bit for bit, and the lead and the place, against the second copy (the reference\'s times, the steps, lead and phase computed here)', agree, where);
  // The time is since plus a phase that moves with the seed over 0 to 0.25 s.
  const phases = Array.from({ length: 400 }, (_, s) => { const r = createClock({ seed: s + 1 }).next(); return r.time - r.since; });
  check('the phase: time less since at the first read, over seeds 1 to 400, spreads over 0 to 0.25 s',
    phases.every((p) => p >= 0 && p < 0.25) && Math.min(...phases) < 0.01 && Math.max(...phases) > 0.24,
    `${Math.min(...phases).toFixed(4)} to ${Math.max(...phases).toFixed(4)} s`);
}

// W3-27b: the bands of W3-27a's check 7 (below) take the place of W3-16's chunk shares, pairs,
// reads a second and intervals; here are the frames a message and the hold's ends, each band
// the build's figure (the order's prototype's, "How each kind is handled" and the table under
// "The hold") with about five times its spread over seeds.
console.log('The clock\'s statistics (the frames a message, seeds 1 to 40; the hold\'s ends, 300,000 reads of createClock at the default seed)');
{
  const HOLD = f32(0.4), N = 300000;
  const pct = (k, n) => (100 * k) / n;
  // As one endless spurt, pooled over seeds 1 to 40 of 20,000 reads: the share of one frame
  // follows the capture's place (9.0% at places 0 and 1, 10.8 to 10.9% at the others; the
  // order), so the check pools seeds. The spread of the pool is 0.13 points (0.02 for 5).
  const fpm = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const c = createClock({ seed });
    let kept = 0;
    for (let i = 0; i < 20000; i++) {
      const r = c.next();
      if (!r.samples) continue;
      const t = kept + r.samples, n = Math.floor(t / 480); kept = t - 480 * n; fpm[Math.min(n, 6)]++; total++;
    }
  }
  const F = [1, 2, 3, 4, 5].map((n) => pct(fpm[n], total)), FW = [10.6, 13.3, 65.0, 9.9, 1.1], FB = [0.6, 0.6, 0.6, 0.6, 0.15];
  check('frames per message 1 to 5, as one endless spurt, seeds 1 to 40 pooled: within 0.6 of 10.6 / 13.3 / 65.0 / 9.9% and 0.15 of 1.1% (W3-16\'s clock: 10.3 / 13.0 / 65.2 / 10.0 / 1.4)',
    F.every((x, i) => Math.abs(x - FW[i]) <= FB[i]) && fpm[0] === 0 && fpm[6] === 0, F.map((x) => x.toFixed(2)).join(' / '));
  const cl = createClock();
  const reads = Array.from({ length: N }, () => cl.next());
  const firstChunk = reads.findIndex((r) => r.samples > 0);
  const chunks = reads.filter((r) => r.samples > 0);
  const over = chunks.filter((r) => r.samples > 2250 || r.samples % 750).length, emptyAfter = reads.slice(firstChunk).filter((r) => r.samples === 0).length;
  check('no chunk over 2250 (and every chunk whole steps); the first read brings nothing, the first chunk comes with the second or third, and no read after it brings nothing',
    over === 0 && emptyAfter === 0 && reads[0].samples === 0 && firstChunk >= 1 && firstChunk <= 2, `the first chunk is read ${firstChunk + 1}`);
  // Each read with samples in turn as a spurt's last active one, all later reads inactive: the
  // spurt's last chunk is the first later read with fround(uptime + time) > fround(noted + 0.4).
  // The reads come more evenly over half a second than W3-16's free walk, so fewer spurts end a
  // chunk early (the order's table under "The hold": 10.0, 90.0 and 0%; 22.0, 76.3 and 1.7%;
  // 11.0, 44.3 and 41.3%; over seeds 1 to 5 each figure moves by 0.15 points at most).
  const ends = (uptime) => {
    const n = {}, nowF = chunks.map((r) => f32(uptime + r.time));
    let count = 0;
    for (let i = 0; i < chunks.length; i++) {
      const limit = f32(nowF[i] + HOLD);
      let k = 1;
      while (i + k < chunks.length && !(nowF[i + k] > limit)) k++;
      if (i + k >= chunks.length) break;
      n[k] = (n[k] || 0) + 1; count++;
    }
    return (k) => pct(n[k] || 0, count);
  };
  const e9 = ends(777600), e4 = ends(14400), e18 = ends(1555200);
  const show = (e, ks) => ks.map((k) => e(k).toFixed(2)).join(' / ');
  check('ends on the 7th / 8th / 9th chunk at uptime 777600: 21.0 to 23.0 / 75.3 to 77.3 / 1.2 to 2.2%, none on the 6th or the 10th (W3-16\'s clock: 26.5 / 70.8 / 2.8)',
    e9(7) >= 21.0 && e9(7) <= 23.0 && e9(8) >= 75.3 && e9(8) <= 77.3 && e9(9) >= 1.2 && e9(9) <= 2.2 && e9(6) === 0 && e9(10) === 0, show(e9, [6, 7, 8, 9, 10]));
  check('the same at uptime 14400: 9.0 to 11.0 / 89.0 to 91.0 / under 0.1%', e4(7) >= 9.0 && e4(7) <= 11.0 && e4(8) >= 89.0 && e4(8) <= 91.0 && e4(9) < 0.1, show(e4, [6, 7, 8, 9]));
  check('the same at uptime 1555200: 10.0 to 12.0 / 43.3 to 45.3 / 40.3 to 42.3%, and the 10th 2.8 to 4.0%',
    e18(7) >= 10.0 && e18(7) <= 12.0 && e18(8) >= 43.3 && e18(8) <= 45.3 && e18(9) >= 40.3 && e18(9) <= 42.3 && e18(10) >= 2.8 && e18(10) <= 4.0,
    show(e18, [6, 7, 8, 9, 10, 11]));
}

// ---------------------------------------------------------------------------------------
// The float arithmetic (the W3-16 order, "Checks"): a spurt whose only active chunk is read at
// `noted`, then inactive reads at chosen times, with uptime 0 (or as given). Each read brings
// 750 samples, loud in the first chunk only, so each read sends one message, returned by the
// push of its chunk. endsOn gives the index in `times` of the read whose message carries the
// end marker, or -1.
function endsOn(noted, times, { uptime = 0 } = {}) {
  const list = [noted, ...times].map((time) => ({ time, samples: 750 }));
  let i = 0;
  const s = createSender({ clock: { next: () => (i < list.length ? list[i++] : { time: list[list.length - 1].time, samples: 750 }) }, uptime });
  const sig = new Int16Array(750 * list.length); sig.fill(1000, 0, 750);
  for (let k = 0; k < list.length; k++) {
    const ms = s.push(sig.subarray(750 * k, 750 * k + 750));
    if (ms.length !== 1) throw new Error(`read ${k} sent ${ms.length} messages`);
    if (ms[0].end) return k - 1;
  }
  return -1;
}

console.log('The float arithmetic (the W3-16 order\'s table; uptime 0, a hand clock)');
{
  const TABLE = [
    ['1 hour', 3600.123, 3600.123046875, 3600.52294921875, 3600.523193359375, 1639, 400.15],
    ['4 hours', 14400.5, 14400.5, 14400.900390625, 14400.9013671875, 411, 401.37],
    ['13 hours', 46800.3, 46800.30078125, 46800.69921875, 46800.703125, 103, 402.34],
    ['27 hours', 97200.3, 97200.296875, 97200.6953125, 97200.703125, 52, 406.25],
    ['2.2 days', 190080.3, 190080.296875, 190080.703125, 190080.71875, 27, 421.875],
    ['4.5 days', 388800.3, 388800.3125, 388800.71875, 388800.75, 14, 437.5],
    ['9 days', 777600.3, 777600.3125, 777600.6875, 777600.75, 7, 437.5],
    ['18 days', 1555200.3, 1555200.25, 1555200.625, 1555200.75, 4, 500],
    ['36 days', 3110400.3, 3110400.25, 3110400.75, 3110401, 3, 750],
  ];
  for (const [label, noted, itsF, limit, endsAt, steps, ms] of TABLE) {
    const at = endsOn(noted, [limit]), above = endsOn(noted, [endsAt]), both = endsOn(noted, [limit, endsAt]);
    const step = endsAt - limit;
    check(`${label}: noted ${noted} (its float ${itsF}): a read at the limit ${limit} does not end the spurt; one at ${endsAt}, the next float, does (${steps} steps, ${ms} ms)`,
      f32(noted) === itsF && at === -1 && above === 0 && both === 1 && Math.abs((endsAt - itsF) * 1000 - ms) < 0.01 && Math.round((endsAt - itsF) / step) === steps,
      `${at}, ${above}, ${both}`);
  }
  // "now less noted, over 0.4" would end these: 406.25 ms on the float clock is over 0.4.
  for (const [label, noted] of [['2.2 days', 190080.3], ['4.5 days', 388800.3]]) {
    const t = f32(noted) + 0.40625;
    check(`${label}: a read 406.25 ms after the noted float on the float clock does not end the spurt (the other form would)`, endsOn(noted, [t]) === -1 && t - f32(noted) > 0.4);
  }
  check('9 days: reads at 777600.343 and 777600.719, 376 ms apart, end the spurt (on the first inactive read: it is tested)', endsOn(777600.343, [777600.719]) === 0);
  check('9 days: reads at 777600.282 and 777600.718, 436 ms apart, do not', endsOn(777600.282, [777600.718]) === -1);
  check('18 days: active at 1555200.3, the next read, inactive, at 1555200.7: it ends the spurt', endsOn(1555200.3, [1555200.7]) === 0);
  check('the float 0.4: noted 0.3 (its float 0.30000001192092896), the limit 0.7000000476837158: a read there does not end the spurt; one at 0.7000001072883606 does',
    f32(0.3) === 0.30000001192092896 && endsOn(0.3, [0.7000000476837158]) === -1 && endsOn(0.3, [0.7000001072883606]) === 0
    && endsOn(0.3, [0.7000000476837158, 0.7000001072883606]) === 1);
  check('uptime is added: uptime 777600 with reads at 0.343 and 0.719 ends the spurt; 0.282 and 0.718 does not',
    endsOn(0.343, [0.719], { uptime: 777600 }) === 0 && endsOn(0.282, [0.718], { uptime: 777600 }) === -1);
  check('with uptime 0 the same reads go the other way: 0.343 then 0.719 (376 ms) does not end it; 0.282 then 0.718 (436 ms) does',
    endsOn(0.343, [0.719]) === -1 && endsOn(0.282, [0.718]) === 0);
  // One narrowing of the sum in doubles: uptime 777600 and time 0.03125 + 1e-9 is a hair above
  // the tie between 777600 and 777600.0625, so "now" is 777600.0625 (narrowing each first would
  // give 777600). Its limit is 777600.4375: a read at 0.42 (777600.4375) does not end the
  // spurt, one at 0.47 (777600.5) does.
  check('"now" is narrowed once, from the sum in doubles: uptime 777600, the active read at 0.03125 + 1e-9: a read at 0.42 does not end the spurt, one at 0.47 does',
    f32(777600 + (0.03125 + 1e-9)) === 777600.0625 && endsOn(0.03125 + 1e-9, [0.42], { uptime: 777600 }) === -1
    && endsOn(0.03125 + 1e-9, [0.42, 0.47], { uptime: 777600 }) === 1);
}

console.log('An empty read (the W3-16 order, item 2)');
{
  // uptime 0; noted 1 s, its limit fround(1 + fround(0.4)) = 1.399999976158142.
  const LIMIT = 1.399999976158142, ABOVE = 1.4000000953674316;
  const opening = (len, sig) => { const s = new Int16Array(len); s.fill(1000); return sig ? sig : s; };
  const go = (list, sig, opts = {}) => {
    let i = 0;
    const last = list[list.length - 1];
    const s = createSender({ clock: { next: () => (i < list.length ? list[i++] : { time: last.time, samples: 750 }) }, uptime: 0, ...opts });
    const pushes = [];
    let at = 0;
    for (const x of list) {
      if (!x.samples) continue;
      pushes.push(s.push(sig.subarray(at, at + x.samples)));
      at += x.samples;
    }
    return pushes;
  };
  {
    // 1440 + 2400 of pre-roll is 8 frames, nothing kept; 1440 more is 3, nothing kept.
    const sig = new Int16Array(2880); sig.fill(1000, 0, 1440);
    const p = go([{ time: 1, since: 1, samples: 1440 }, { time: 1.2, since: 1.2, samples: 1440 }, { time: 1.5, since: 1.5, samples: 0 }], sig);
    const m = p[1][1] || {};
    check('hanging with the hold passed and nothing kept: the end marker alone, returned with the chunk before',
      p[0].length === 1 && p[1].length === 2 && m.end && m.last === m.first - 1 && m.pcm.length === 0 && m.first === 11, fmt(m));
    // The marker's tick is the empty read's own: max(last + 1, ceil((since + 0.002) / 0.015))
    // with its since, 1.5 (the chunk before was read at 1.2).
    const before = p[1][0] || {}, want = Math.max(before.tick + 1, Math.ceil((1.5 + 0.002) / 0.015));
    check('the end marker of an empty read is ticked from that read\'s since (1.5), not from the chunk before\'s (1.2)',
      m.tick === want && want === 101 && before.tick === 81, `${before.tick} then ${m.tick}`);
  }
  {
    // An empty read in the silent state changes nothing: two quiet chunks, an empty read, then an
    // onset, whose pre-roll is the quiet chunks' 1500 samples, not 2400 zeros.
    const sig = new Int16Array(3000); sig.fill(5, 0, 1500); sig.fill(1000, 1500, 2250);
    let i = 0;
    const list = [{ time: 1, samples: 750 }, { time: 1.05, samples: 750 }, { time: 1.1, samples: 0 }, { time: 1.15, samples: 750 }];
    const s = createSender({ clock: { next: () => (i < list.length ? list[i++] : { time: 2, samples: 750 }) }, uptime: 0 });
    const out = s.push(sig.subarray(0, 2250)), sp = s.info().spurts[0] || {}, o = out[0] || { pcm: new Int16Array(0) };
    check('silent, an empty read keeps the past sound: the onset after it gets the two quiet chunks (1500 samples) as its pre-roll',
      sp.preroll === 1500 && sp.start === 0 && o.pcm.subarray(0, 1500).every((v) => v === 5), JSON.stringify(sp));
  }
  {
    // 750 + 2400 is 6 frames and 270 kept; 750 more is 2 frames and 60 kept.
    const sig = new Int16Array(1500); sig.fill(1000, 0, 750); sig.fill(7, 750, 1500);
    const p = go([{ time: 1, samples: 750 }, { time: 1.2, samples: 750 }, { time: 1.5, samples: 0 }], sig);
    const m = p[1][1] || { pcm: new Int16Array(0) };
    check('hanging with the hold passed and 60 samples kept: one frame, the 60 padded with 420 zeros, and the end marker',
      p[1].length === 2 && m.end && m.last === m.first && m.pcm.subarray(0, 60).every((v) => v === 7) && m.pcm.subarray(60).every((v) => v === 0), fmt(m));
    const q = go([{ time: 1, samples: 750 }, { time: 1.5, samples: 0 }], sig.subarray(0, 750));
    const n = q[0][1] || { pcm: new Int16Array(0) };
    check('active, past the limit: it ends the spurt, the 270 kept samples padded to a frame',
      q[0].length === 2 && n.end && n.last === n.first && n.pcm.subarray(0, 270).every((v) => v === 1000) && n.pcm.subarray(270).every((v) => v === 0), fmt(n));
  }
  {
    // Active, then an empty read before the limit: nothing; the next inactive read is tested
    // against the same noted time.
    const sig = new Int16Array(1500); sig.fill(1000, 0, 750);
    const before = go([{ time: 1, samples: 750 }, { time: 1.2, samples: 0 }, { time: LIMIT, samples: 750 }], sig);
    const after = go([{ time: 1, samples: 750 }, { time: 1.2, samples: 0 }, { time: ABOVE, samples: 750 }], sig);
    check('active, an empty read before the limit sends nothing; the next inactive read at the limit does not end the spurt, one a float above it does',
      before[0].length === 1 && before[1].length === 1 && !before[1][0].end && after[1].length === 1 && after[1][0].end,
      `${before.map((x) => x.map(fmt).join(' ')).join(' | ')} || ${after.map((x) => x.map(fmt).join(' ')).join(' | ')}`);
    const empty = go([{ time: 1, samples: 750 }, { time: 1.2, samples: 0 }, { time: LIMIT, samples: 0 }, { time: ABOVE, samples: 0 }], sig.subarray(0, 750));
    check('the same with empty reads only: none at the limit, the end marker at the read a float above', empty[0].length === 2 && empty[0][1].end);
  }
  {
    // In the ended state an empty read makes the state silent: the next inactive chunk sends
    // no silence record. Without it there is one.
    const sig = new Int16Array(3000); sig.fill(1000, 0, 750);
    const withEmpty = go([{ time: 1, samples: 750 }, { time: 1.5, samples: 750 }, { time: 1.55, samples: 0 }, { time: 1.6, samples: 750 }, { time: 1.65, samples: 750 }], sig).flat();
    const without = go([{ time: 1, samples: 750 }, { time: 1.5, samples: 750 }, { time: 1.6, samples: 750 }, { time: 1.65, samples: 750 }], sig).flat();
    check('ended, an empty read: the next inactive chunk sends no silence record (without the empty read it does)',
      withEmpty.filter((m) => m.end).length === 1 && !withEmpty.some((m) => m.silence !== undefined)
      && without.filter((m) => m.silence !== undefined).length === 1, `${withEmpty.map(fmt).join(' ')} | ${without.map(fmt).join(' ')}`);
    // After it, a new onset is a spurt from the silent state: its pre-roll is the silent
    // chunk's 750 samples.
    const sig2 = new Int16Array(3000); sig2.fill(1000, 0, 750); sig2.fill(1000, 2250, 3000);
    let i = 0;
    const list = [{ time: 1, samples: 750 }, { time: 1.5, samples: 750 }, { time: 1.55, samples: 0 }, { time: 1.6, samples: 750 }, { time: 1.65, samples: 750 }];
    const s = createSender({ clock: { next: () => (i < list.length ? list[i++] : { time: 9, samples: 750 }) }, uptime: 0 });
    s.push(sig2); const inf = s.info();
    check('then an onset gets the silent chunk as its pre-roll, as from any silent state', inf.spurts.length === 2 && inf.spurts[1].preroll === 750, JSON.stringify(inf.spurts));
  }
  {
    const sig = new Int16Array(1500); sig.fill(1000);
    const p = go([{ time: 1, samples: 750 }, { time: 5, samples: 0 }, { time: 9, samples: 0 }, { time: 10, samples: 750 }], sig, { gate: false });
    check('with the gate off an empty read past any limit sends nothing and the spurt goes on', p[0].length === 1 && p[1].length === 1 && !p.flat().some((m) => m.end) && p[1][0].spurt === 0);
  }
  {
    // Pushed one sample at a time: the end marker of an empty read comes from the push of the
    // last sample of the chunk before it.
    const sig = new Int16Array(2880); sig.fill(1000, 0, 1440);
    const list = [{ time: 1, samples: 1440 }, { time: 1.2, samples: 1440 }, { time: 1.5, samples: 0 }];
    let i = 0;
    const s = createSender({ clock: { next: () => (i < list.length ? list[i++] : { time: 2, samples: 750 }) }, uptime: 0 });
    const when = [];
    for (let k = 0; k < sig.length; k++) for (const m of s.push(sig.subarray(k, k + 1))) when.push([k + 1, m]);
    const fin = when.find(([, m]) => m.end);
    check('pushed one sample at a time, the end marker of an empty read comes back from the push of the chunk before\'s last sample', fin && fin[0] === 2880, fin && `sample ${fin[0]}`);
  }
}

console.log('Determinism and the reference schedule (the W3-16 order, recorded again on the clock of W3-27b)');
{
  const sig = referenceSignal();
  const r = run(sig, { seed: 0xC0FFEE });
  const got = r.messages.map(fmt);
  const bad = got.findIndex((m, i) => m !== REF_MESSAGES[i]);
  check('seed 0xC0FFEE at the default uptime: the 49 messages recorded from the build, message for message', got.length === REF_MESSAGES.length && bad < 0,
    bad >= 0 ? `first difference at ${bad}: ${got[bad]} for ${REF_MESSAGES[bad]}` : `${got.length} messages`);
  // W3-27b: on W3-16's clock with W3-21's lead (49) the spurts started at 21551 (104 frames)
  // and 71201 (38, straight from the ended state), with 73 chunks.
  check('its two spurts: start 21973 with 101 frames (pre-roll 2400), start 70123 with 40 (pre-roll 1500, from the silent state); 73 chunks; lead 377',
    JSON.stringify(r.info.spurts) === JSON.stringify([{ start: 21973, frames: 101, preroll: 2400 }, { start: 70123, frames: 40, preroll: 1500 }]) && r.info.chunks === 73
    && r.info.uptime === 777600 && r.info.lead === 377, `${JSON.stringify(r.info.spurts)}, ${r.info.chunks} chunks, lead ${r.info.lead}`);
  // With lead 0 the same reads, the source 377 samples earlier against the steps: the second
  // copy's messages at lead 0 (on W3-16's clock it gave back the W3-16 order's schedule).
  const r0 = run(sig, { seed: 0xC0FFEE, lead: 0 });
  check('with lead 0: the second copy\'s messages at lead 0, spurts from 20850 (104 frames) and 70500 (40, pre-roll 1500), 72 chunks',
    same(r0.messages, plainSender(sig, refClock(0xC0FFEE), { lead: 0 }).messages)
    && JSON.stringify(r0.info.spurts) === JSON.stringify([{ start: 20850, frames: 104, preroll: 2400 }, { start: 70500, frames: 40, preroll: 1500 }]) && r0.info.chunks === 72,
    `${JSON.stringify(r0.info.spurts)}, ${r0.info.chunks} chunks`);
  check('the same seed and uptime give the same messages twice; seeds 1 and 2 differ',
    same(run(sig, { seed: 3, uptime: 14400 }).messages, run(sig, { seed: 3, uptime: 14400 }).messages) && !same(run(sig, { seed: 1 }).messages, run(sig, { seed: 2 }).messages));
  const at = (seed, uptime) => run(sig, { seed, uptime });
  // W3-21 moved these: before it, seed 1 gave 102 and 40 frames (from 21600 and 70500) at
  // uptime 14400 and 104 and 38 (from 21600 and 71250) at 777600, and the default seed and
  // seeds 4 to 10 the same spurts at both. With the capture's lead seed 1 gave the same
  // spurts at both values, and seed 2 was the one shown here: 102 and 40 frames (from 21046
  // and 69946) at 14400, 105 and 33 (from 21046 and 71446) at 777600. Recorded again on the
  // clock of W3-27b.
  const a = at(2, 14400), b = at(2, 777600);
  check('seed 2: spurts of 105 and 35 frames (from 20828 and 71228) at uptime 14400, of 105 and 36 (from 20828 and 71228) at 777600, with the same chunks',
    JSON.stringify(a.info.spurts.map((s) => [s.frames, s.start])) === '[[105,20828],[35,71228]]'
    && JSON.stringify(b.info.spurts.map((s) => [s.frames, s.start])) === '[[105,20828],[36,71228]]', `${JSON.stringify(a.info.spurts)} ${JSON.stringify(b.info.spurts)}`);
  {
    // The same chunks: the reads the second copy ran at the two values are the same reads, as
    // far as the shorter run goes.
    const fa = plainSender(sig, refClock(2), { uptime: 14400 }).frames, fb = plainSender(sig, refClock(2), { uptime: 777600 }).frames;
    const k = Math.min(fa.length, fb.length);
    check('seed 2: the chunks do not depend on uptime (the reads of both runs are the same, as far as the shorter goes)',
      k > 60 && fa.slice(0, k).every((x, j) => x.count === fb[j].count && x.since === fb[j].since && x.time === fb[j].time), `${fa.length} and ${fb.length} reads`);
  }
  // W3-16's clock with W3-21's lead: [71,0,7] for both seeds at both values (seed 1's was
  // [73,0,7] before W3-21).
  check('seeds 2 and 1: the first message is [71,0,7] and [72,0,7] at both values of uptime', fmt(a.messages[0]) === '[71,0,7]' && fmt(b.messages[0]) === '[71,0,7]'
    && fmt(at(1, 14400).messages[0]) === '[72,0,7]' && fmt(at(1, 777600).messages[0]) === '[72,0,7]', `${fmt(a.messages[0])} ${fmt(at(1, 14400).messages[0])}`);
  const sp = (seed, uptime) => JSON.stringify(at(seed, uptime).info.spurts);
  // W3-16's clock with W3-21's lead: the same at both for the default seed and seeds 1, 5, 6,
  // 7, 8 and 10, not for seeds 2, 3, 4 and 9.
  check('the default seed\'s two spurts are the same at both values of uptime, as are seeds 4 and 5\'s; seeds 1, 2, 3, 6, 7, 8, 9 and 10\'s are not',
    [0xC0FFEE, 4, 5].every((s) => sp(s, 14400) === sp(s, 777600)) && [1, 2, 3, 6, 7, 8, 9, 10].every((s) => sp(s, 14400) !== sp(s, 777600)));
  let agree = 0, where = '';
  for (let seed = 1; seed <= 400; seed++) {
    if (same(run(sig, { seed }).messages, plainSender(sig, refClock(seed)).messages)) agree++;
    else where ||= `seed ${seed}`;
  }
  // W3-27b, check 2: the seeded sender is the reference's reads through the sender.
  check('the second copy, on the reference\'s reads with its own steps, lead and phase, gives the same messages, samples included, for seeds 1 to 400 (and 0xC0FFEE)', agree === 400
    && same(r.messages, plainSender(sig, refClock(0xC0FFEE)).messages), where || `${agree} of 400`);
  // Ticks: each message's is max(last + 1, ceil((since + 0.002) / 0.015)) of the read that made
  // it, the read's since taken from the second copy's reads.
  let ticksOk = true;
  for (let seed = 1; seed <= 50 && ticksOk; seed++) {
    const p = plainSender(sig, refClock(seed)), ms = run(sig, { seed }).messages;
    let last = -1;
    for (const f of p.frames) {
      if (f.made < 0) continue;
      const want = Math.max(last + 1, Math.ceil((f.since + 0.002) / 0.015));
      if (ms[f.made].tick !== want) { ticksOk = false; break; }
      last = want;
    }
  }
  check('ticks: every message\'s is max(last + 1, ceil((since + 0.002) / 0.015)) of the read that made it (seeds 1 to 50)', ticksOk);
  const firstTicks = (u) => at(7, u).messages.filter((m, k, all) => m.silence === undefined && (k === 0 || all[k - 1].spurt !== m.spurt)).map((m) => m.tick);
  check('a spurt\'s first message has the same tick at uptime 14400 and at 3110400', firstTicks(14400)[0] === firstTicks(3110400)[0] && firstTicks(14400).length >= 1,
    `${firstTicks(14400).join(',')} | ${firstTicks(3110400).join(',')}`);
  // Stream equals offline, at two values of uptime and on the hand clock.
  for (const [label, opts] of [['seed 0xC0FFEE, uptime 777600', () => ({ seed: 0xC0FFEE })], ['seed 0xC0FFEE, uptime 14400', () => ({ seed: 0xC0FFEE, uptime: 14400 })],
    ['seed 11, uptime 3110400', () => ({ seed: 11, uptime: 3110400 })], ['the hand clock', () => HAND(4)]]) {
    const whole = run(sig, opts()).messages;
    const ok = [1, 7, 480, 12345].every((p) => same(run(sig, opts(), p).messages, whole));
    check(`${label}: pushed in pieces of 1, 7, 480 and 12,345 samples, the same messages as whole`, ok);
  }
  // Pushed one sample at a time, each message comes back from the push of its chunk's last
  // sample: never before it (and not later either).
  for (const [label, opts, reads, uptime] of [['seed 0xC0FFEE', () => ({ seed: 0xC0FFEE }), () => refClock(0xC0FFEE), 777600],
    ['seed 2, uptime 1555200', () => ({ seed: 2, uptime: 1555200 }), () => refClock(2), 1555200], ['the hand clock', () => HAND(4), () => handReads(4), 0]]) {
    // A read's count includes the capture's lead (W3-21); the source's samples are count - lead.
    const clock = reads(), ref = plainSender(sig, clock, { uptime }), lead = clock.lead ?? 0;
    const due = new Map();
    for (const f of ref.frames) if (f.made >= 0) due.set(f.made, f.count - lead);
    const s = createSender(opts());
    let k = 0, wrong = 0, early = 0;
    for (let i = 0; i < sig.length; i++) for (let r2 = s.push(sig.subarray(i, i + 1)).length; r2 > 0; r2--) { if (due.get(k) !== i + 1) { wrong++; if (i + 1 < due.get(k)) early++; } k++; }
    const tail = s.finish();
    const lateOk = tail.every((m, j) => due.get(k + j) > sig.length);
    check(`${label}: one sample at a time, every message comes from the push of its chunk's last sample`, wrong === 0 && lateOk && k + tail.length === ref.messages.length,
      `${k} during the pushes (${early} early, ${wrong - early} late), ${tail.length} from finish()`);
  }
}

console.log('The hand clock n = 4 (i + 1) as reads, uptime 0 (W3-02b\'s schedule, unchanged)');
{
  const sig = referenceSignal();
  const h = run(sig, HAND(4));
  const hm = h.messages.map(fmt);
  check('its first nine messages and last two as given',
    hm.slice(0, 9).join(' ') === HAND_FIRST.join(' ') && hm.slice(-2).join(' ') === HAND_LAST.join(' '), `${hm.slice(0, 9).join(' ')} ... ${hm.slice(-2).join(' ')}`);
  check('spurts of 102 and 38 frames from 21600 and 70500',
    JSON.stringify(h.info.spurts) === JSON.stringify([{ start: 21600, frames: 102, preroll: 2400 }, { start: 70500, frames: 38, preroll: 1500 }]),
    JSON.stringify(h.info.spurts));
  const open = h.messages[0];
  check('the opening: 2400 + 1500 samples is 8 frames with 60 kept; the kept grow by 60 a chunk until a fourth frame fits',
    open.last - open.first + 1 === 8 && sound(h.messages).slice(1, 8).map((m) => m.last - m.first + 1).join() === '3,3,3,3,3,3,4');
  check('the second copy agrees', same(h.messages, plainSender(sig, handReads(4), { uptime: 0 }).messages));
}

// W3-27b, check 8: recorded from the build, each share within 0.03 (the order's band), the
// messages a second within 0.02. On W3-16's clock with W3-21's lead they were: ticks 0.305,
// 0.666 and 0.029; openings 0.790, 0.165 and 0.045; records 0.210, 0.758 and 0.033; 17.90 a
// second. The order's prototype: openings 0.783, 0.195 and 0.023.
console.log('The statistics through the sender (seeds 1 to 400; a signal of 240,000 samples, 1000 from 24000 to 215999; the default uptime)');
{
  const sig = statsSignal();
  const count = {}, inc = (row, k) => { (count[row] ||= {})[k] = (count[row][k] || 0) + 1; };
  let agree = 0, rateCount = 0, rateTicks = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const { messages } = run(sig, { seed });
    const ref = plainSender(sig, refClock(seed));
    if (same(messages, ref.messages)) agree++;
    const snd = sound(messages);
    inc('opening', snd[0].last - snd[0].first + 1);
    for (let k = 1; k < messages.length; k++) inc('ticks', messages[k].tick - messages[k - 1].tick);
    for (const m of messages) if (m.silence !== undefined) inc('record', m.silence);
    rateCount += messages.length - 2;
    rateTicks += snd[snd.length - 1].tick - messages[0].tick;
  }
  check('the module and the second copy agree on all 400 seeds, samples included', agree === 400, `${agree} of 400`);
  const share = (row, k) => (count[row][k] || 0) / Object.values(count[row]).reduce((a, b) => a + b, 0);
  const rows = [
    ['game ticks between messages, 3 / 4 / 5', 'ticks', [[3, 0.316], [4, 0.667], [5, 0.018]]],
    ['openings of 8 / 6 / 9 frames', 'opening', [[8, 0.783], [6, 0.195], [9, 0.023]]],
    ['silence records of 750 / 1500 / 2250 samples', 'record', [[750, 0.205], [1500, 0.778], [2250, 0.018]]],
  ];
  for (const [label, row, want] of rows) {
    const got = want.map(([k]) => share(row, k));
    check(`${label}: each within 0.03 of the build's`, want.every(([, w], j) => Math.abs(got[j] - w) <= 0.03), got.map((g) => g.toFixed(4)).join(', '));
  }
  check('2 and 6 game ticks between messages do not occur', !count.ticks[2] && !count.ticks[6], Object.keys(count.ticks).join(', '));
  const rate = rateCount / (rateTicks * 0.015);
  check('messages a second: 18.01, within 0.02', Math.abs(rate - 18.01) <= 0.02, rate.toFixed(3));
}

// ---------------------------------------------------------------------------------------
// With the hand clock n = 4 (i + 1) chunk c is samples 1500 c to 1500 c + 1499, read at
// (c + 1) x 0.0625 s.

const chunks = (n, fill) => { const s = new Int16Array(1500 * n); fill(s); return s; };
const C = (c) => 1500 * c;

console.log('The gate (the hand clock: chunks of 1500)');
{
  const opens = (s, opts = {}) => sound(run(s, HAND(4, opts)).messages).length > 0;
  check('a chunk of 1500 samples of 327 is not active; one of 328 is',
    !opens(chunks(20, (s) => s.fill(327, C(5), C(6)))) && opens(chunks(20, (s) => s.fill(328, C(5), C(6)))));
  // 1005 x 328 + 495 x 327 = 491505 = 1500 x 327.67: the mean is 327.67 to the last bit.
  check('a chunk whose mean is exactly 327.67 is active; one sample less and it is not',
    opens(chunks(20, (s) => { s.fill(327, C(5), C(6)); s.fill(328, C(5), C(5) + 1005); }))
    && !opens(chunks(20, (s) => { s.fill(327, C(5), C(6)); s.fill(328, C(5), C(5) + 1004); })));
  check('a chunk of zeros with one sample of 4915 is active; with 4914 it is not',
    opens(chunks(20, (s) => { s[C(5) + 700] = 4915; })) && !opens(chunks(20, (s) => { s[C(5) + 700] = 4914; })));
  check('the peak is of |x|: one sample of -4915 is active', opens(chunks(20, (s) => { s[C(5) + 700] = -4915; })));
  check('the mean is of |x|: a chunk of +-330 is active, and a chunk of +-327 is not',
    opens(chunks(20, (s) => { for (let i = C(5); i < C(6); i++) s[i] = i & 1 ? 330 : -330; }))
    && !opens(chunks(20, (s) => { for (let i = C(5); i < C(6); i++) s[i] = i & 1 ? 327 : -327; })));
  const sine = (db) => chunks(40, (s) => { const a = 32767 * 10 ** (db / 20); for (let i = C(5); i < C(30); i++) s[i] = Math.round(a * Math.sin(2 * Math.PI * 440 * i / 24000)); });
  check('a 440 Hz sine with a peak of -36 dBFS opens; one of -40 dBFS does not (finding 5)', opens(sine(-36)) && !opens(sine(-40)));
  const m250 = chunks(20, (s) => s.fill(250, C(5), C(6)));
  check('meanMin replaces 327.67: a chunk of 250 opens with meanMin 200 and not without it', opens(m250, { meanMin: 200 }) && !opens(m250));
  check('meanMin does not move the peak rule: one sample of 4914 stays shut with meanMin 1000, 4915 opens',
    !opens(chunks(20, (s) => { s[C(5)] = 4914; }), { meanMin: 1000 }) && opens(chunks(20, (s) => { s[C(5)] = 4915; }), { meanMin: 1000 }));
  let threwN = 0;
  for (const v of [0, -1]) try { createSender({ meanMin: v }); } catch (e) { if (e instanceof RangeError) threwN++; }
  check('meanMin at or below 0 is refused (a chunk of zeros would never end a spurt)', threwN === 2);
  let bad = 0;
  for (const v of [NaN, Infinity, -Infinity, '300', null]) try { createSender({ meanMin: v }); } catch (e) { if (e instanceof RangeError) bad++; }
  check('a meanMin that is given but is not a finite number is refused, not taken as 327.67', bad === 5 && opens(m250, { meanMin: undefined }) === false);
  // The gate judges the chunk alone, even while silent with past sound kept: eleven chunks of
  // 750 with a mean of 327.6, and one whose sound is all in its last 150 samples (sum 245700),
  // are each inactive, though the last 2400 samples of past and chunk together are not.
  const near = new Int16Array(750 * 12);
  for (const c of [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11]) for (let i = 0; i < 750; i++) near[750 * c + i] = i < 450 ? 328 : 327;
  near.fill(1638, 750 * 4 + 600, 750 * 5);
  check('the gate judges each chunk alone, not the pre-roll with it', run(near, HAND(2)).messages.length === 0);
}

console.log('The pre-roll');
{
  // Distinct values, so that which samples a frame holds shows.
  const loud = (s, a, b) => { for (let i = a; i < b; i++) s[i] = 1000 + (i % 997); };
  const quiet = (s, a, b) => { for (let i = a; i < b; i++) s[i] = 1 + (i % 199); };
  {
    const sig = chunks(20, (s) => loud(s, 0, C(3)));
    const r = run(sig, HAND(4));
    const m = r.messages[0];
    check('an onset in the first chunk: start -2400, and the opening holds 2400 zeros then the chunk',
      r.info.spurts[0].start === -2400 && r.info.spurts[0].preroll === 2400 && m.start === -2400
      && m.pcm.subarray(0, 2400).every((v) => v === 0) && m.pcm.subarray(2400, 3840).every((v, k) => v === sig[k]));
  }
  {
    // Sound in chunks 2 to 4: ended on chunk 11 (the hold), the record is chunk 12, the next
    // onset in chunk 13 gets chunk 12 as its pre-roll and nothing of chunk 11.
    const sig = chunks(30, (s) => { quiet(s, 0, s.length); loud(s, C(2), C(5)); loud(s, C(13), C(15)); });
    const r = run(sig, HAND(4));
    const recIdx = r.messages.findIndex((m) => m.silence !== undefined), next = r.messages[recIdx + 1];
    check('an onset one chunk after a silence record: its pre-roll is that chunk only',
      r.messages[recIdx].silence === 1500 && r.info.spurts[1].preroll === 1500 && r.info.spurts[1].start === C(12)
      && next.start === C(12) && next.pcm.subarray(0, 3000).every((v, k) => v === sig[C(12) + k]), JSON.stringify(r.info.spurts[1]));
  }
  {
    // Sound to the end of chunk 4: the final chunk is 11; sound again in chunk 12 (ENDED).
    const sig = chunks(30, (s) => { quiet(s, 0, s.length); loud(s, C(2), C(5)); loud(s, C(12), C(14)); });
    const r = run(sig, HAND(4));
    const fin = r.messages.findIndex((m) => m.end), next = r.messages[fin + 1];
    check('an onset in the ENDED state (the chunk after the final one): no pre-roll and no silence record',
      next.silence === undefined && next.spurt === 1 && r.info.spurts[1].preroll === 0 && r.info.spurts[1].start === C(12)
      && next.start === C(12) && next.pcm.every((v, k) => v === sig[C(12) + k]) && next.first === r.messages[fin].last + 1,
      JSON.stringify(r.info.spurts[1]));
  }
  {
    // Nine quiet chunks before the onset: the pre-roll is the last 2400 samples of them.
    const sig = chunks(20, (s) => { quiet(s, 0, s.length); loud(s, C(9), C(11)); });
    const r = run(sig, HAND(4));
    check('after several silent chunks the pre-roll is their last 2400 samples', r.info.spurts[0].start === C(9) - 2400
      && r.messages[0].pcm.subarray(0, 3840).every((v, k) => v === sig[C(9) - 2400 + k]));
  }
}

console.log('The hold (hand clocks as reads, uptime 0)');
{
  const stop = 6;                                       // sound in chunks 0 to stop - 1
  const ending = (step, extra) => {
    const sig = new Int16Array(24000 * 4);
    sig.fill(1000, 0, C(stop));
    if (extra) extra(sig);
    const plain = plainSender(sig, handReads(step), { uptime: 0 });
    const r = run(sig, HAND(step));
    const fin = r.messages.find((m) => m.end), f = plain.frames.findIndex((x) => x.final);
    return { r, fin, frame: f, plain };
  };
  {
    const { r, fin, frame, plain } = ending(4);
    // The read that reads chunk c is read c with this clock.
    const real = plain.frames[frame].count - fin.start;
    check('the hand clock: sound that stops at the end of chunk c ends on chunk c + 7, its last frame padded',
      frame === stop - 1 + 7 && real < fin.pcm.length && fin.pcm.subarray(real).every((v) => v === 0) && fin.pcm.length - real < 480,
      `the end marker on chunk ${frame}; ${fin.pcm.length - real} zeros of padding`);
    check('the same in the module: the end marker is returned by the push of chunk c + 7\'s last sample', r.messages.indexOf(fin) === plain.frames[frame].made
      && same(r.messages, plain.messages));
  }
  {
    const { frame, plain } = ending(3);
    const lastActive = plain.frames.map((f, i) => (f.active ? i : -1)).filter((i) => i >= 0).pop();
    check('with n = 3 (i + 1), every 46.875 ms: on chunk c + 9', frame - lastActive === 9, `${frame - lastActive} reads after the last active one`);
  }
  {
    const { r, plain } = ending(4, (s) => s.fill(1000, C(stop - 1 + 5), C(stop - 1 + 5) + 600));
    const finFrame = plain.frames.findIndex((x) => x.final);
    const before = r.messages.filter((m) => m.end && m.first * 480 + r.info.spurts[0].start < C(stop + 5));
    check('a burst of sound in chunk c + 5 keeps the spurt going with no end marker: the noted time moves on with every active chunk', before.length === 0 && r.info.spurts.length === 1
      && finFrame === stop - 1 + 5 + 7, `the end marker on chunk ${finFrame}`);
  }
}

console.log('The gate off');
{
  const sig = referenceSignal();
  const r = run(sig, HAND(4, { gate: false }));
  const snd = sound(r.messages), last = r.messages[r.messages.length - 1];
  const F = snd.reduce((a, m) => a + m.last - m.first + 1, 0);
  check('the hand clock on the reference signal: every chunk is sent, one message each', snd.length - 1 === 64 && snd.slice(0, -1).every((m) => m.last >= m.first), `${snd.length} sound messages`);
  check('one spurt from -2400, and no silence record', r.info.spurts.length === 1 && r.info.spurts[0].start === -2400 && r.messages.every((m) => m.silence === undefined));
  check('finish() returns the end marker last; the frames cover the source and at most 479 zeros more (here none: the end marker alone)',
    last.end && -2400 + 480 * F >= sig.length && -2400 + 480 * F - sig.length <= 479 && last.last === last.first - 1 && last.pcm.length === 0,
    `${F} frames, ${-2400 + 480 * F - sig.length} zeros after the source`);
  check('the second copy agrees', same(r.messages, plainSender(sig, handReads(4), { gate: false, uptime: 0 }).messages));
  // The spurt starts at -2400 - lead (W3-21): 2400 + lead + 95,003 samples, the last frame
  // padded to 480 (with lead 0, 2400 + 96000 samples are 205 frames exactly and 95,003 leave
  // 37 zeros).
  const cut = sig.slice(0, 95003);
  let ok = true, padded = 0, detail = '';
  const leads = new Set();
  for (let seed = 1; seed <= 50 && ok; seed++) {
    const g = run(cut, { seed, gate: false }), s = sound(g.messages), z = s[s.length - 1], lead = createClock({ seed }).lead;
    const frames = s.reduce((a, m) => a + m.last - m.first + 1, 0), over = -2400 - lead + 480 * frames - cut.length;
    ok = g.info.spurts.length === 1 && g.info.spurts[0].start === -2400 - lead && g.info.lead === lead && g.messages.every((m) => m.silence === undefined)
      && s.filter((m) => m.end).length === 1 && z.end
      && over >= 0 && over <= 479 && (over === 0 || z.pcm.subarray(z.pcm.length - over).every((v) => v === 0))
      && same(g.messages, plainSender(cut, refClock(seed), { gate: false }).messages);
    if (over === (480 - (2400 + lead + 95003) % 480) % 480) padded++;
    leads.add(lead);
    if (!ok) detail = `seed ${seed}`;
  }
  const s0 = sound(run(cut, { seed: 1, gate: false, lead: 0 }).messages), over0 = -2400 + 480 * s0.reduce((a, m) => a + m.last - m.first + 1, 0) - cut.length;
  check('seeds 1 to 50 on 95,003 samples: one spurt from -2400 - lead, the end marker on the last message only, its last frame padded to a whole frame (37 zeros with lead 0)',
    ok && padded === 50 && leads.size > 40 && over0 === 37, detail || `${padded} of 50 padded, ${leads.size} leads; ${over0} zeros with lead 0`);
  const quietSig = new Int16Array(30000);
  check('the gate off sends silence too', sound(run(quietSig, { seed: 3, gate: false }).messages).length > 5 && sound(run(quietSig, { seed: 3 }).messages).length === 0);
}

console.log('Every sample once (seeds 1 to 50, seeded noise bursts; uptime 777600 and 1555200)');
{
  let worst = '', bad = 0, spurtsSeen = 0, messagesSeen = 0, maxKept = 0, ends = 0, records = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const uptime = seed % 2 ? 777600 : 1555200;
    const rand = mulberry32(seed * 7919);
    const n = 24000 * 8, sig = new Int16Array(n);
    // Quiet noise everywhere (never zero, never active), bursts of loud noise of 30 to 900 ms.
    for (let i = 0; i < n; i++) sig[i] = (1 + Math.floor(rand() * 60)) * (rand() < 0.5 ? -1 : 1);
    for (let t = Math.floor(rand() * 4000); t < n;) {
      const len = 720 + Math.floor(rand() * 21000), amp = 1500 + Math.floor(rand() * 8000);
      for (let i = t; i < Math.min(n, t + len); i++) sig[i] = Math.round((rand() * 2 - 1) * amp) || 1;
      t += len + Math.floor(rand() * 24000);
    }
    const clock = refClock(seed), plain = plainSender(sig, clock, { uptime });
    // In samples of the source: a read's count less the capture's lead (W3-21).
    const due = new Map(); for (const f of plain.frames) if (f.made >= 0) due.set(f.made, f.count - clock.lead);
    const s = createSender({ seed, uptime });
    const msgs = [], when = [];
    for (let i = 0; i < n; i += 37) for (const m of s.push(sig.subarray(i, Math.min(n, i + 37)))) { msgs.push(m); when.push(Math.min(n, i + 37)); }
    for (const m of s.finish()) { msgs.push(m); when.push(Infinity); }
    if (!same(msgs, plain.messages)) { bad++; worst ||= `seed ${seed}: the module and the second copy differ`; continue; }
    const covered = new Uint8Array(n);
    let spurt = -1, next = 0, chunkEnd = 0;
    for (const [k, m] of msgs.entries()) {
      if (m.silence !== undefined) { records++; continue; }
      messagesSeen++;
      if (m.spurt !== spurt) { spurt = m.spurt; next = m.start; spurtsSeen++; }
      if (m.start !== next) { bad++; worst ||= `seed ${seed}: a gap or overlap in spurt ${spurt}`; }
      next = m.start + 480 * (m.last - m.first + 1);
      chunkEnd = due.get(k);
      // What the frames hold is the source from start, but zeros before sample 0 and in the
      // padding after the final chunk; the padding is the last message's tail only.
      const real = m.end ? Math.min(m.pcm.length, chunkEnd - m.start) : m.pcm.length;
      for (let j = 0; j < m.pcm.length; j++) {
        const p = m.start + j, want = j < real && p >= 0 && p < n ? sig[p] : 0;
        if (m.pcm[j] !== want) { bad++; worst ||= `seed ${seed}: message ${k} sample ${j}`; break; }
        if (j < real && p >= 0 && p < n && covered[p]++) { bad++; worst ||= `seed ${seed}: sample ${p} in two frames`; break; }
      }
      if (!m.end) {
        const kept = chunkEnd - next;
        maxKept = Math.max(maxKept, kept);
        if (kept < 0 || kept >= 480) { bad++; worst ||= `seed ${seed}: ${kept} kept`; }
      } else ends++;
      if (when[k] < chunkEnd) { bad++; worst ||= `seed ${seed}: message ${k} before its chunk was pushed`; }
    }
    const info = s.info();
    if (info.messages !== msgs.length || info.chunks !== plain.frames.filter((f) => f.len > 0).length) { bad++; worst ||= `seed ${seed}: info() counts`; }
  }
  check('each spurt\'s frames are contiguous from its start, hold the source there, and no source sample is in two frames', bad === 0,
    worst || `${spurtsSeen} spurts, ${messagesSeen} sound messages, ${ends} end markers, ${records} records`);
  check('what is kept between chunks never reaches 480', bad === 0 && maxKept < 480 && maxKept > 400, `at most ${maxKept}`);
}

console.log('The capture\'s phase against the sound (the W3-21 order)');
{
  // 1. The lead (W3-27b, check 4): a draw of its own since W3-27, floor(750 x the sixth draw
  // of P) (on W3-16's clock it was (750 - round(c0 x 24000)) mod 750, from the capture's
  // draw c0), computed a second time for 1,000 seeds; over 100,000 seeds no value from 0 to
  // 749 is missing (each 77 to 168 times, the order's "W3-27a as built").
  let bad = '';
  for (let seed = 1; seed <= 1000 && !bad; seed++) {
    const want = Math.floor(750 * Array.from({ length: 6 }, mulberry32((seed ^ 0x1F123BB5) >>> 0))[5]);
    if (createClock({ seed }).lead !== want || refClock(seed).lead !== want) bad = `seed ${seed}: ${createClock({ seed }).lead} for ${want}`;
  }
  check('createClock({ seed }).lead is floor(750 x the sixth draw of the phases), seeds 1 to 1,000, by a second computation', !bad, bad);
  const seen = new Uint32Array(750);
  let outside = 0;
  for (let seed = 1; seed <= 100000; seed++) {
    const L = createClock({ seed }).lead;
    if (Number.isInteger(L) && L >= 0 && L < 750) seen[L]++; else outside++;
  }
  const missing = seen.reduce((a, n) => a + (n === 0), 0);
  check('over seeds 1 to 100,000 the lead takes every whole value from 0 to 749 and no other', outside === 0 && missing === 0,
    `${missing} missing; each value ${Math.min(...seen)} to ${Math.max(...seen)} times`);
  let readOnly = false;
  const cl = createClock({ seed: 3 });
  try { cl.lead = 5; } catch (e) { readOnly = e instanceof TypeError; }
  check('the clock\'s lead is read only, and drawing it leaves the reads as they were (CLOCK_HASH above)', readOnly && cl.lead === createClock({ seed: 3 }).lead);
  check('info().lead: the seeded clock\'s draw; opts.lead in its place; 0 with a caller\'s clock, or opts.lead with one',
    createSender({ seed: 5 }).info().lead === createClock({ seed: 5 }).lead && createSender({ seed: 5, lead: 318 }).info().lead === 318
    && createSender({ clock: handClock(4) }).info().lead === 0 && createSender({ clock: handClock(4), lead: 7 }).info().lead === 7);

  // 2. A forced lead L is L zeros before the source: the messages of lead 0 on that longer
  // source, their positions less L and their ticks from each read's since less L / 24000
  // (rule 2: a caller's clock that gives the same reads with since moved so, run at lead 0).
  const shifted = (clock, L) => ({ next: () => { const x = clock.next(); return { time: x.time, since: x.since - L / 24000, samples: x.samples }; } });
  const padded = (sig, L) => { const p = new Int16Array(L + sig.length); p.set(sig, L); return p; };
  const opening = new Int16Array(36000); for (let i = 0; i < 12000; i++) opening[i] = Math.round(6000 * Math.sin(i / 7));   // loud from sample 0
  const short = new Int16Array(100).fill(9000);                                                                              // shorter than most leads
  const signals = [['the reference signal', referenceSignal()], ['sound from sample 0', opening], ['100 samples', short]];
  const fails = [];
  let moved = 0, total = 0;
  for (const [label, sig] of signals) for (const seed of [1, 0xC0FFEE, 77]) for (const L of [0, 1, 318, 749]) for (const gate of [true, false]) {
    const extra = gate ? {} : { gate: false };
    const got = run(sig, { seed, lead: L, ...extra });
    const ref = run(padded(sig, L), { clock: shifted(createClock({ seed }), L), ...extra });
    const plain = run(padded(sig, L), { seed, lead: 0, ...extra });
    const want = ref.messages.map((m) => (m.silence !== undefined ? m : { ...m, start: m.start - L }));
    const spurtsOk = JSON.stringify(got.info.spurts) === JSON.stringify(ref.info.spurts.map((x) => ({ ...x, start: x.start - L })));
    // The same messages as lead 0 on the longer source but for the positions and the ticks.
    const asPlain = plain.messages.length === got.messages.length && plain.messages.every((m, k) => {
      const g = got.messages[k];
      return m.silence !== undefined ? g.silence === m.silence : g.first === m.first && g.last === m.last && g.end === m.end && g.start === m.start - L
        && g.pcm.length === m.pcm.length && g.pcm.every((v, j) => v === m.pcm[j]);
    });
    const ticksEarlier = plain.messages.every((m, k) => got.messages[k]?.tick <= m.tick);
    moved += got.messages.filter((m, k) => m.tick !== plain.messages[k]?.tick).length; total += got.messages.length;
    if (!same(got.messages, want) || !spurtsOk || !asPlain || !ticksEarlier || !same(got.messages, plainSender(sig, refClock(seed), { lead: L, gate }).messages)) {
      fails.push(`${label}, seed ${seed}, lead ${L}, gate ${gate}`);
    }
  }
  check('with lead L of 0, 1, 318 and 749 (seeds 1, 0xC0FFEE and 77; three sources, one shorter than the lead, one loud from sample 0; the gate on and off): the messages of lead 0 on L zeros and the source, starts less L, ticks from since less L / 24000; the second copy agrees',
    fails.length === 0 && moved > 0, fails.slice(0, 3).join('; ') || `${moved} of ${total} ticks earlier than lead 0's on the longer source`);
  // W3-27b: on W3-16's clock seed 1's first chunk was two steps, so lead 749 opened in it. On
  // the rule the first chunk is one step (seeds 1 to 20), and with lead 749 it holds one sample
  // of the source, a zero: lead 600 leaves 150 samples of the loud source in it. Its opening
  // message is then 6 frames of the pre-roll and the lead's zeros, and the source follows in the
  // spurt's next message.
  const firstStep = run(opening, { seed: 1, lead: 600 });
  const opened = Int16Array.from(firstStep.messages.slice(0, 2).flatMap((m) => (m.spurt === 0 ? Array.from(m.pcm) : [])));
  check('a spurt that opens in the first step (lead 600): its pre-roll and the lead\'s zeros lie before sample 0, and the source is in its frames from sample 0',
    firstStep.info.spurts[0].start === -2400 - 600 && firstStep.info.spurts[0].preroll === 2400 && opened.subarray(0, 2400 + 600).every((v) => v === 0)
    && opened[2400 + 600 + 1] === opening[1] && opened[2400 + 600 + 100] === opening[100], JSON.stringify(firstStep.info.spurts[0]));

  // A caller's clock whose first reads are shorter than the lead, the gate off: the lead's
  // zeros make messages before any push, and they come back from the first push, in order.
  const small = (L) => { let t = 0; return { next: () => { t += 0.01; return { time: t, since: t - L / 24000, samples: 100 }; } }; };
  const early = run(opening.subarray(0, 3000), { clock: small(0), gate: false, lead: 749 }, 1000);
  const earlyRef = run(padded(opening.subarray(0, 3000), 749), { clock: small(749), gate: false });
  const firstPush = createSender({ clock: small(0), gate: false, lead: 749 }).push(new Int16Array(1));
  check('a caller\'s clock of 100-sample reads, lead 749, the gate off: what the lead\'s zeros make comes back from the first push, as the rule gives',
    same(early.messages, earlyRef.messages.map((m) => ({ ...m, start: m.start - 749 }))) && firstPush.length === 2 && same(firstPush, early.messages.slice(0, 2))
    && firstPush[0].start === -2400 - 749,
    `${firstPush.length} messages from a first push of one sample`);

  // 3. A tone burst of exactly 1 s, 48000 to 71999 (multiples of 31.25 ms), after 2 s of
  // silence: the capture steps that hold any of it (the steps of each read, at the read's
  // count less the lead), and the frames its spurt sends.
  const burst = new Int16Array(96000);
  for (let i = 48000; i < 72000; i++) burst[i] = Math.round(8000 * Math.sin(2 * Math.PI * 440 * (i - 48000) / 24000));
  const steps = (seed, lead) => {
    const base = createClock({ seed }), L = lead ?? base.lead;
    let count = 0, n = 0;
    const clock = { next: () => { const x = base.next(); for (let k = 0; k < x.samples; k += 750) { const a = count + k - L; if (a < 72000 && a + 750 > 48000) n++; } count += x.samples; return x; } };
    const r = run(burst, { clock, lead: L });
    return { n, frames: r.info.spurts.reduce((a, x) => a + x.frames, 0), spurts: r.info.spurts.length, same: same(r.messages, run(burst, { seed, lead: L }).messages) };
  };
  let n33 = 0, all32 = true, sameRuns = true, oneSpurt = true, fLead = 0, f0 = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const a = steps(seed), z = steps(seed, 0);
    if (a.n === 33) n33++;
    if (z.n !== 32) all32 = false;
    sameRuns &&= a.same && z.same; oneSpurt &&= a.spurts === 1 && z.spurts === 1;
    fLead += a.frames; f0 += z.frames;
  }
  fLead /= 200; f0 /= 200;
  check('a 1 s burst on the 31.25 ms grid, seeds 1 to 200: 33 steps hold some of it in at least 85% of seeds, 32 in every seed with lead 0',
    n33 >= 170 && all32 && sameRuns && oneSpurt, `${n33} of 200 with 33 steps`);
  check('the frames its spurt sends rise by about one step (750 / 480 = 1.5625 frames) in the mean',
    fLead - f0 >= 1.0 && fLead - f0 <= 2.1, `${fLead.toFixed(3)} frames with the lead, ${f0.toFixed(3)} with lead 0: ${(fLead - f0).toFixed(3)} more`);

  // 4. opts.lead is a whole number from 0 to 749.
  const refusedLeads = [-1, 750, 1.5, NaN, '5', null, Infinity].filter((v) => threw(() => createSender({ seed: 1, lead: v }), /lead/)
    && threw(() => createSender({ clock: handClock(4), lead: v }), /lead/));
  check('opts.lead -1, 750, 1.5, NaN, \'5\', null and Infinity are refused with a RangeError naming lead (seeded clock or a caller\'s); 0 and 749 are taken',
    refusedLeads.length === 7 && createSender({ seed: 1, lead: 0 }).info().lead === 0 && createSender({ seed: 1, lead: 749 }).info().lead === 749,
    `${refusedLeads.length} of 7 refused`);
}

console.log('Refusals');
{
  const s = createSender({ seed: 1 });
  let a = false, b = false;
  try { s.push(new Float32Array(10)); } catch (e) { a = e instanceof TypeError; }
  s.finish();
  try { s.push(new Int16Array(10)); } catch (e) { b = /after finish/.test(e.message); }
  check('push() takes an Int16Array, not after finish(); finish() a second time returns nothing', a && b && s.finish().length === 0);
  // A clock's reads: each refusal a RangeError whose message names the clock. The list goes
  // on with good reads after the bad one, so that only the bad one can be refused.
  const reads = (...list) => () => {
    let i = 0;
    const next = () => (i < list.length ? list[i++] : { time: 10 + 0.05 * i++, samples: 750 });
    createSender({ clock: { next }, uptime: 0 }).push(new Int16Array(9000));
  };
  const ok = { time: 0.1, samples: 750 };
  const cases = [
    ['time below the last', reads(ok, { time: 0.05, samples: 750 }), /clock's time/],
    ['time not finite', reads(ok, { time: Infinity, samples: 750 }), /clock's time/],
    ['time NaN', reads({ time: NaN, samples: 750 }), /clock's time/],
    ['time not a number', reads({ time: '0.2', samples: 750 }), /clock's time/],
    ['since not finite', reads(ok, { time: 0.2, since: NaN, samples: 750 }), /clock's since/],
    ['since Infinity', reads({ time: 0.2, since: -Infinity, samples: 750 }), /clock's since/],
    ['samples not a whole number', reads(ok, { time: 0.2, samples: 750.5 }), /clock's samples/],
    ['samples under 0', reads(ok, { time: 0.2, samples: -750 }), /clock's samples/],
    ['samples over 2250', reads(ok, { time: 0.2, samples: 3000 }), /clock's samples/],
    ['a read that is not an object', reads(ok, 7), /clock must give reads/],
    ['no read at all', reads(ok, undefined), /clock must give reads/],
    ['no next', () => createSender({ clock: {} }), /clock must be/],
    ['a clock that is not an object', () => createSender({ clock: 5 }), /clock must be/],
    ['a null clock', () => createSender({ clock: null }), /clock must be/],
  ];
  check('the good reads that follow each bad one are taken', !threw(reads(ok), /./));
  const failed = cases.filter(([, fn, re]) => !threw(fn, re)).map(([n]) => n);
  check('a clock is refused with a RangeError naming the clock: time below the last; time or since not finite; samples not a whole number, under 0 or over 2250; no next',
    failed.length === 0, failed.join('; '));
  check('a clock may repeat a time, give samples of 0 and 2250, and leave since out',
    !threw(() => createSender({ clock: listClock([ok, { time: 0.1, samples: 0 }, { time: 0.1, samples: 2250 }, { time: 0.2, since: 0.1, samples: 750 }, { time: 0.3, samples: 750 }]), uptime: 0 })
      .push(new Int16Array(750 + 2250 + 750)), /./));
  const ups = [-1, 4000001, NaN, Infinity, '7', null].filter((u) => !threw(() => createSender({ uptime: u }), /uptime/));
  check('uptime -1, 4,000,001, NaN, Infinity, \'7\' and null are refused with a RangeError naming uptime; 0 and 4,000,000 are taken', ups.length === 0
    && createSender({ uptime: 0 }).info().uptime === 0 && createSender({ uptime: 4000000 }).info().uptime === 4000000 && createSender().info().uptime === 777600,
    ups.map(String).join(', '));
}

// ---------------------------------------------------------------------------------------
// W3-27a: the clock on the rule as read (createReadClock, beside the clock that ran, until
// W3-27b made it createClock). docs/work-orders/W3-27-sender-clock.md, "W3-27a: the suite",
// checks 1 to 12. The
// reference is the study's generator, tests/steam-sender/gen.mjs, run in this process
// (genClock), so that Math.log and Math.cos are the same on both sides. Times of the
// reference are in ms; the port's since and time are in seconds.

const SIDE = { seed: 0xC0FFEE };
// The port's reads at place 0 against the reference's, read for read: since is the
// reference's time / 1000 bit for bit, samples and by equal. Returns '' or where they part.
function againstGen(opts, reads) {
  const a = createClock({ ...opts, place: 0 }), b = genClock(opts);
  for (let i = 0; i < reads; i++) {
    const x = a.next(), y = b.next();
    if (!Object.is(x.since, y.time / 1000) || x.samples !== y.samples || x.by !== y.by) return `${JSON.stringify(opts)} read ${i}: ${x.since * 1000} ${x.samples} ${x.by} for ${y.time} ${y.samples} ${y.by}`;
  }
  return '';
}
// The suite's own draws of the phases: the seven of the order's list, in its order.
function phasesOf(seed, packet = 10) {
  const P = mulberry32((seed ^ 0x1F123BB5) >>> 0), d = Array.from({ length: 7 }, () => P());
  return { capPhase: packet * d[2], place: Math.floor((packet === 10 ? 8 : 16) * d[4]), lead: Math.floor(750 * d[5]), phase: 0.25 * d[6] };
}
// The counting of the statistics (check 7). reads: the clock's reads in order; place: the
// clock's place; cycle: the places counted (8, or 16). The place of a chunk's end is its
// running count of steps plus the clock's place, modulo the cycle. The window is the fullest
// stretch of 4.5 ms of since modulo 15 ms, in bins of 0.25 ms, found for each clock.
function tally(acc, reads, place, cycle = 8) {
  const ms = reads.map((r) => r.since * 1000), N = ms.length;
  acc.series.push(ms.slice(1).map((t, i) => t - ms[i]));
  acc.reads += N - 1; acc.span += reads[N - 1].since - reads[0].since;
  const bins = new Array(60).fill(0);
  const binOf = (t) => Math.floor((t % 15) / 0.25);
  for (const t of ms) bins[binOf(t)]++;
  let best = -1, from = 0;
  for (let b = 0; b < 60; b++) { let s = 0; for (let j = 0; j < 18; j++) s += bins[(b + j) % 60]; if (s > best) { best = s; from = b; } }
  const inside = ms.map((t) => (binOf(t) - from + 60) % 60 < 18);
  acc.inWindow += best; acc.all += N;
  let lastOff = -1;
  for (let i = 0; i < N; i++) {
    if (i > 0) { if (inside[i - 1]) { acc.on++; acc.offAfterOn += !inside[i]; } else { acc.off++; acc.offAfterOff += !inside[i]; } }
    if (!inside[i]) {
      if (lastOff >= 0) { const d = ms[i] - ms[lastOff]; if (d < 200) { acc.offPairs++; acc.offNear += d >= 107 && d <= 111; } }
      lastOff = i;
    }
  }
  let k = 0, before = 0;
  for (const r of reads) {
    if (!r.samples) { acc.empty += k > 0; continue; }
    const n = r.samples / 750;
    k += n;
    const p = (k + place) % cycle;
    acc.chunks++; acc.size[n]++; acc.at[p]++; acc.bySize[n][p]++;
    if (before) { acc.pairs++; acc.pair[`${before}-${n}`] = (acc.pair[`${before}-${n}`] || 0) + 1; }
    before = n;
  }
}
function statsOf(make, { seeds = 20, reads = 20000, cycle = 8 } = {}) {
  const acc = { series: [], reads: 0, span: 0, inWindow: 0, all: 0, on: 0, off: 0, offAfterOn: 0, offAfterOff: 0, offPairs: 0, offNear: 0, empty: 0,
    chunks: 0, size: [0, 0, 0, 0], at: new Array(cycle).fill(0), bySize: [0, 1, 2, 3].map(() => new Array(cycle).fill(0)), pairs: 0, pair: {} };
  for (let seed = 1; seed <= seeds; seed++) {
    const c = make(seed);
    tally(acc, Array.from({ length: reads }, () => c.next()), c.place ?? 0, cycle);
  }
  const all = acc.series.flat(), mean = all.reduce((a, b) => a + b, 0) / all.length;
  const v = all.reduce((a, d) => a + (d - mean) ** 2, 0);
  const lag = (L) => acc.series.reduce((a, s) => { for (let i = L; i < s.length; i++) a += (s[i] - mean) * (s[i - L] - mean); return a; }, 0) / v;
  const pct = (a, b) => (100 * a) / b;
  const sizeSum = (n) => acc.bySize[n].reduce((a, b) => a + b, 0);
  return {
    mean, lo: all.reduce((a, b) => Math.min(a, b), Infinity), hi: all.reduce((a, b) => Math.max(a, b), -Infinity), under49: pct(all.filter((d) => d < 49).length, all.length),
    window: pct(acc.inWindow, acc.all), offAfterOn: pct(acc.offAfterOn, acc.on), offAfterOff: pct(acc.offAfterOff, acc.off), near: pct(acc.offNear, acc.offPairs),
    lag2: lag(2), lag4: lag(4), sizes: [1, 2, 3].map((n) => pct(acc.size[n], acc.chunks)), at: acc.at.map((x) => pct(x, acc.chunks)),
    sizeAt: (n, p) => pct(acc.bySize[n][p], sizeSum(n)), pair: (key) => pct(acc.pair[key] || 0, acc.pairs), perSecond: acc.reads / acc.span, empty: acc.empty,
  };
}
const within = (x, lo, hi) => x >= lo && x <= hi;
const f2 = (x) => x.toFixed(2);

console.log('The read clock: the reference is the study\'s (W3-27a, check 1)');
{
  const out = execFileSync(process.execPath, [GEN, '300', 'seed=1']);
  const want = fs.readFileSync(fileURLToPath(new URL('./steam-sender/vector-seed1.json', import.meta.url)));
  const sha = crypto.createHash('sha256').update(want).digest('hex');
  check('gen.mjs run as its own program for 300 reads at seed 1 prints vector-seed1.json byte for byte, whose SHA-256 begins a64fc17735f4dc63',
    Buffer.compare(out, want) === 0 && sha.startsWith('a64fc17735f4dc63'), `${out.length} bytes; ${sha.slice(0, 16)}`);
}

console.log('The read clock is the reference, to the last bit (check 2; place 0)');
{
  let where = '';
  for (let seed = 1; seed <= 400 && !where; seed++) where = againstGen({ seed }, 2000);
  check('seeds 1 to 400, 2,000 reads each: since is the reference\'s time / 1000 bit for bit, samples and by equal', !where, where);
  const S1 = { seed: 1 };
  const settings = [S1, { seed: 2 }, SIDE, { ...S1, packet: 20 }, { ...S1, late: 20 }, { ...S1, fps: 30 }, { ...S1, fps: 60 }, { ...S1, fps: 144 }, { ...S1, tick: 30 }];
  const parted = settings.map((s) => againstGen(s, 200000)).filter(Boolean);
  check('200,000 reads at each of the nine settings of "Precision" (seeds 1, 2 and the default at the default options; at seed 1, 20 ms packets, a lateness of 20 ms, 30, 60 and 144 frames a second, a tick of 30 ms): the same, bit for bit',
    parted.length === 0, parted[0] || '');
}

// The four settings of checks 3 and 6.
const EDGES = [['the defaults', {}], ['20 ms packets', { packet: 20 }], ['a lateness of 0', { late: 0 }], ['30 frames a second, 20 ms packets, a lateness of 31.25 ms', { fps: 30, packet: 20, late: 31.25 }]];

console.log('The read clock: three steps at most (check 3)');
{
  const opts = { seed: 9, fps: 144, late: 20, packet: 20 };
  const a = createClock({ ...opts, place: 0 }), b = genClock(opts);
  const differ = [];
  let timesEqual = true, sumA = 0, sumB = 0;
  for (let i = 0; i < 20000; i++) {
    const x = a.next(), y = b.next();
    sumA += x.samples; sumB += y.samples;
    if (!Object.is(x.since, y.time / 1000) || x.by !== y.by) timesEqual = false;
    if (x.samples !== y.samples) differ.push([i, x.samples / 750, y.samples / 750]);
  }
  check('seed 9, 144 frames a second, 20 ms packets, a lateness of 20 ms: the reference\'s read 9,858 brings four steps, the port\'s three and its next one more; every other read is the reference\'s',
    timesEqual && differ.length === 2 && differ[0].join() === '9858,3,4' && differ[1][0] === 9859 && differ[1][1] === differ[1][2] + 1 && sumA === sumB,
    differ.map((d) => `read ${d[0]}: ${d[1]} for ${d[2]}`).join('; '));
}

{
  // At the ends of the ranges the limit binds often. The reference's steps less the port's,
  // summed read by read (place 0), is what the port has left over: never more than one step,
  // and never left over for two reads running.
  const opts = { seed: 1, fps: 10, tick: 100, packet: 20, late: 31.25 };
  const a = createClock({ ...opts, place: 0 }), b = genClock(opts);
  let owed = 0, binds = 0, carried = 0, wrong = '', biggest = 0;
  for (let i = 0; i < 2000000 && !wrong; i++) {
    const x = a.next(), y = b.next(), before = owed;
    owed += (y.samples - x.samples) / 750;
    biggest = Math.max(biggest, x.samples);
    if (!Object.is(x.since, y.time / 1000) || x.by !== y.by) wrong = `read ${i}: the times or by part`;
    else if (owed < 0 || owed > 1 || x.samples > 2250) wrong = `read ${i}: ${owed} steps left over, ${x.samples} samples`;
    if (before === 0 && owed === 1) { binds++; if (x.samples !== 2250) wrong ||= `read ${i}: bound at ${x.samples}`; }
    if (before === 1 && owed === 1) carried++;
  }
  check('seed 1, 10 frames a second, a tick of 100 ms, 20 ms packets, a lateness of 31.25 ms, 2,000,000 reads: the limit binds (6,215 times), each time one step is left over and the next read takes it, and no read is above 2250 samples',
    !wrong && binds === 6215 && carried === 0 && owed === 0 && biggest === 2250, wrong || `${binds} times; ${carried} carried twice`);
}

console.log('The read clock: the reads never run ahead of the capture (checks 3 and 6; 300 seeds of 20,000 reads at four settings)');
{
  const bad = [], over = [], margins = [];
  let leastAll = Infinity;
  for (const [label, opts] of EDGES) {
    let least = Infinity;
    for (let seed = 1; seed <= 300; seed++) {
      const c = createClock({ seed, ...opts });
      let taken = 0, last = -Infinity;
      for (let i = 0; i < 20000; i++) {
        const r = c.next();
        if (r.samples > 2250 || r.samples % 750 || r.samples < 0) { over.push(`${label}, seed ${seed}, read ${i}: ${r.samples}`); break; }
        taken += r.samples;
        const ahead = r.since * 24000 - taken;
        if (r.samples > 0 && ahead < least) least = ahead;
        if (ahead < leastAll) leastAll = ahead;
        if (ahead < 0 || r.time < last) { bad.push(`${label}, seed ${seed}, read ${i}`); break; }
        last = r.time;
      }
    }
    margins.push(`${label} ${least.toFixed(2)}`);
  }
  check('no read brings more than 2250 samples or samples off whole steps', over.length === 0, over[0] || '');
  check('at every read since x 24000 is at least the samples taken so far, and time never falls', bad.length === 0, bad[0] || `on reads that bring a chunk, the least margin: ${margins.join('; ')} samples; on any read, an empty first one included, ${leastAll.toFixed(2)}`);
}

console.log('The read clock: the place turns the pattern and nothing else (check 4)');
{
  // The steps a second time, from the reads' times, the suite's own draws of capPhase and of
  // C, and ready(k) as the order writes it.
  const stepsOf = (seed, place, times, { packet = 10, late = 9 } = {}) => {
    const { capPhase } = phasesOf(seed, packet), C = mulberry32((seed ^ 0x3C6EF372) >>> 0);
    const ready = (k) => (capPhase + (packet * Math.ceil(31.25 * (k + place) / packet - 1e-9) - 31.25 * place)) + late * C();
    let k = 0, top = -Infinity, next = ready(1);
    return times.map((t) => {
      let n = 0;
      while (n < 3 && Math.max(next, top) <= t) { top = Math.max(next, top); k++; n++; next = ready(k + 1); }
      return 750 * n;
    });
  };
  let moved = '', wrong = '';
  for (let seed = 1; seed <= 50; seed++) {
    const g = genClock({ seed }), ref = Array.from({ length: 2000 }, () => g.next());
    const times = ref.map((y) => y.time);
    for (const place of [0, 1, 2, 3, 4, 5, 6, 7, undefined]) {
      const c = createClock({ seed, place }), reads = Array.from({ length: 2000 }, () => c.next());
      const p = place ?? phasesOf(seed).place;
      const base = createClock({ seed, place: 0 });
      if (c.place !== p) { wrong ||= `seed ${seed}: place ${c.place} for ${p}`; continue; }
      for (let i = 0; i < 2000 && !moved; i++) {
        const b = base.next(), r = reads[i];
        if (!Object.is(r.since, ref[i].time / 1000) || !Object.is(r.since, b.since) || !Object.is(r.time, b.time) || r.by !== b.by || r.by !== ref[i].by) moved = `seed ${seed}, place ${place}, read ${i}`;
      }
      const want = stepsOf(seed, p, times), at = reads.findIndex((r, i) => r.samples !== want[i]);
      if (at >= 0) wrong ||= `seed ${seed}, place ${place}: read ${at} ${reads[at].samples} for ${want[at]}`;
    }
  }
  check('seeds 1 to 50, each place from 0 to 7 and the drawn one: since, time and by are place 0\'s and the reference\'s bit for bit', !moved, moved);
  check('the steps equal a second computation from the reads\' times, the suite\'s own draws of capPhase and C, and ready(k) as written (the drawn place the suite\'s fifth draw)', !wrong, wrong);
  const seen = new Set();
  for (let seed = 1; seed <= 400; seed++) seen.add(createClock({ seed }).place);
  check('the drawn place takes every value from 0 to 7 over seeds 1 to 400', seen.size === 8 && [...seen].every((p) => Number.isInteger(p) && p >= 0 && p < 8), [...seen].sort().join());
}

console.log('The read clock: the draws (check 5)');
{
  let bad = '';
  for (let seed = 1; seed <= 1000 && !bad; seed++) {
    const c = createClock({ seed }), d = phasesOf(seed);
    if (c.lead !== d.lead || c.place !== d.place) bad = `seed ${seed}: lead ${c.lead} for ${d.lead}, place ${c.place} for ${d.place}`;
    const c20 = createClock({ seed, packet: 20 }), d20 = phasesOf(seed, 20);
    if (!bad && (c20.place !== d20.place || c20.lead !== d.lead)) bad = `seed ${seed}, 20 ms packets: place ${c20.place} for ${d20.place}`;
  }
  check('lead and place are the suite\'s own sixth and fifth draws of P (seeds 1 to 1,000; 16 places with 20 ms packets)', !bad, bad);
  // time - since is the draw to the last bit only at a clock's early reads (the sum rounds),
  // so the test is time === phase + since.
  let off = '';
  for (let seed = 1; seed <= 200 && !off; seed++) {
    const c = createClock({ seed }), { phase } = phasesOf(seed);
    for (let i = 0; i < 1000; i++) { const r = c.next(); if (r.time !== phase + r.since) { off = `seed ${seed}, read ${i}`; break; } }
  }
  check('the phase: time === phase + since at every one of the first 1,000 reads of seeds 1 to 200, phase the suite\'s own seventh draw (the test is not time - since, which is the draw to the last bit only at early reads)', !off, off);
  const seen = new Uint32Array(750);
  let outside = 0;
  for (let seed = 1; seed <= 100000; seed++) {
    const L = createClock({ seed }).lead;
    if (Number.isInteger(L) && L >= 0 && L < 750) seen[L]++; else outside++;
  }
  check('over seeds 1 to 100,000 the lead takes every whole value from 0 to 749 and no other', outside === 0 && seen.every((n) => n > 0),
    `each value ${Math.min(...seen)} to ${Math.max(...seen)} times`);
  const phases = Array.from({ length: 400 }, (_, s) => { const r = createClock({ seed: s + 1 }).next(); return r.time - r.since; });
  check('the phase spreads over 0 to 0.25 s over seeds 1 to 400', phases.every((p) => p >= 0 && p < 0.25) && Math.min(...phases) < 0.01 && Math.max(...phases) > 0.24,
    `${Math.min(...phases).toFixed(4)} to ${Math.max(...phases).toFixed(4)} s`);
  const take = (seed, k) => { const c = createClock({ seed }); return JSON.stringify([c.lead, c.place, Array.from({ length: k }, () => c.next())]); };
  check('an unseeded clock is seed 0xC0FFEE\'s; two seeds differ; one seed repeats', take(undefined, 500) === take(0xC0FFEE, 500) && take(1, 500) !== take(2, 500) && take(5, 2000) === take(5, 2000));
  let readOnly = 0;
  const c = createClock({ seed: 3 });
  for (const k of ['lead', 'place', 'next']) try { c[k] = 1; } catch (e) { readOnly += e instanceof TypeError; }
  check('the clock is frozen: lead, place and next cannot be set', readOnly === 3 && Object.isFrozen(c));
}

console.log('The read clock\'s statistics (check 7; seeds 1 to 20, 20,000 reads each, pooled; the order\'s bands, the record\'s figures for the sets in brackets)');
{
  const s = statsOf((seed) => createClock({ seed }));
  check('mean interval 55.42 to 55.62 ms (Sets J and L 55.43 and 55.37)', within(s.mean, 55.42, 55.62), s.mean.toFixed(3));
  check('least at least 47.5 ms, most at most 69 ms (Sets J and L 47.75 to 64.13 and 47.85 to 64.44)', s.lo >= 47.5 && s.hi <= 69, `${f2(s.lo)} to ${f2(s.hi)}`);
  check('intervals under 49 ms 1.9 to 2.7% (3.0 and 2.3)', within(s.under49, 1.9, 2.7), f2(s.under49));
  check('reads in the fullest 4.5 ms window of the 15 ms tick 63.4 to 64.7% (61.9 and 62.9)', within(s.window, 63.4, 64.7), f2(s.window));
  check('a read off that window after one in it 50.7 to 53.0% (54.4 and 54.4)', within(s.offAfterOn, 50.7, 53.0), f2(s.offAfterOn));
  check('a read off it after one off it 5.9 to 9.4% (13.9 and 7.7)', within(s.offAfterOff, 5.9, 9.4), f2(s.offAfterOff));
  check('neighbouring reads off it 107 to 111 ms apart, of those under 200 ms, 56.5 to 62.5% (54 and 59)', within(s.near, 56.5, 62.5), f2(s.near));
  check('the intervals\' autocorrelation at lag 2 -0.22 to -0.16 and at lag 4 -0.27 to -0.21 (-0.08 and -0.18; -0.19 and -0.23)',
    within(s.lag2, -0.22, -0.16) && within(s.lag4, -0.27, -0.21), `${s.lag2.toFixed(3)}, ${s.lag4.toFixed(3)}`);
  const [c1, c2, c3] = s.sizes;
  check('chunks of one, two and three steps 23.5 to 24.4, 73.8 to 75.1 and 1.3 to 1.9% (Set L 24.1, 74.7, 1.2; Set D 23.4, 74.8, 1.8)',
    within(c1, 23.5, 24.4) && within(c2, 73.8, 75.1) && within(c3, 1.3, 1.9), s.sizes.map(f2).join(', '));
  check('chunk ends at the favoured place in 8 (place 0) 15.6 to 16.6% (15.3 and 15.5)', within(s.at[0], 15.6, 16.6), f2(s.at[0]));
  check('chunk ends at each other place 11.5 to 12.6% (11.7 to 12.5)', s.at.slice(1).every((x) => within(x, 11.5, 12.6)), s.at.slice(1).map(f2).join(' '));
  check('one-step chunks ending at that place and at the next 22.5 to 26.5% each (22.5 and 23.2, 21.8 and 24.3)', within(s.sizeAt(1, 0), 22.5, 26.5) && within(s.sizeAt(1, 1), 22.5, 26.5),
    `${f2(s.sizeAt(1, 0))}, ${f2(s.sizeAt(1, 1))}`);
  check('two-step chunks ending at the next 7.4 to 9.0% (9.1 and 8.8)', within(s.sizeAt(2, 1), 7.4, 9.0), f2(s.sizeAt(2, 1)));
  check('three-step chunks ending at the two places after under 0.5% (0 of 7, 1 of 31)', s.sizeAt(3, 1) + s.sizeAt(3, 2) < 0.5, (s.sizeAt(3, 1) + s.sizeAt(3, 2)).toFixed(3));
  check('pairs one-one under 0.12%; one-three and three-one 1.0 to 1.45% each (Set D 0.3, 1.4, 1.7)',
    s.pair('1-1') < 0.12 && within(s.pair('1-3'), 1.0, 1.45) && within(s.pair('3-1'), 1.0, 1.45), ['1-1', '1-3', '3-1'].map((k) => s.pair(k).toFixed(3)).join(', '));
  check('reads a second 17.97 to 18.05', within(s.perSecond, 17.97, 18.05), s.perSecond.toFixed(3));
}

console.log('The clock as built fails the places (check 8; the second copy of the old clock through the same counting)');
{
  const s = statsOf((seed) => { const next = plainClock(seed); return { next }; });
  check('12.5% at every place in 8 (12.0 to 13.0 each), where the rule has 16% at one', s.at.every((x) => within(x, 12.0, 13.0)), s.at.map(f2).join(' '));
  check('no autocorrelation of the intervals at lag 2 (within 0.02 of 0), where the rule has -0.19', Math.abs(s.lag2) < 0.02, s.lag2.toFixed(4));
}

console.log('Packets of 20 ms give the 16-place form (check 9; seeds 1 to 20, 20,000 reads each)');
{
  const LONG = [1, 3, 5, 7, 8, 10, 12, 14, 0], SHORT = [2, 4, 6, 9, 11, 13, 15];
  const meanOf = (at, ps) => ps.reduce((a, p) => a + at[p], 0) / ps.length;
  const s20 = statsOf((seed) => createClock({ seed, packet: 20 }), { cycle: 16 }), s10 = statsOf((seed) => createClock({ seed }), { cycle: 16 });
  const r20 = meanOf(s20.at, LONG) / meanOf(s20.at, SHORT), r10 = meanOf(s10.at, LONG) / meanOf(s10.at, SHORT);
  check('with 20 ms packets each of the nine long places (1, 3, 5, 7, 8, 10, 12, 14 and 0 of 16) holds more chunk ends than any of the seven short ones',
    Math.min(...LONG.map((p) => s20.at[p])) > Math.max(...SHORT.map((p) => s20.at[p])), s20.at.map(f2).join(' '));
  check('the mean of the long over the mean of the short 1.7 to 2.4 with 20 ms packets (measured 2.02), and 0.9 to 1.1 with 10 ms packets', within(r20, 1.7, 2.4) && within(r10, 0.9, 1.1),
    `${r20.toFixed(3)}, ${r10.toFixed(3)}`);
}

console.log('The other senders (check 10; seeds 1 to 20, 20,000 reads each)');
{
  const near = (got, want, d) => got.every((x, i) => Math.abs(x - want[i]) <= d);
  const s30 = statsOf((seed) => createClock({ seed, fps: 30 }));
  check('30 frames a second: 58.5 to 58.8 ms a read, chunks within 0.8 of 16.7, 78.9 and 4.4%', within(s30.mean, 58.5, 58.8) && near(s30.sizes, [16.7, 78.9, 4.4], 0.8),
    `${s30.mean.toFixed(3)} ms; ${s30.sizes.map(f2).join(', ')}`);
  const s60 = statsOf((seed) => createClock({ seed, fps: 60 }));
  check('60 frames a second: 49.99 to 50.01 ms a read, chunks within 0.1 of 40, 60 and 0%', within(s60.mean, 49.99, 50.01) && near(s60.sizes, [40, 60, 0], 0.1),
    `${s60.mean.toFixed(4)} ms; ${s60.sizes.map(f2).join(', ')}`);
  const t30 = statsOf((seed) => createClock({ seed, tick: 30 }));
  check('a tick of 30 ms: 59.6 to 59.9 ms a read', within(t30.mean, 59.6, 59.9), t30.mean.toFixed(3));
  const l20 = statsOf((seed) => createClock({ seed, late: 20 }));
  check('a lateness of 20 ms: chunks within 0.8 of 26.9, 68.4 and 4.7%, and at least one empty read after the first chunk in 400,000', near(l20.sizes, [26.9, 68.4, 4.7], 0.8) && l20.empty >= 1,
    `${l20.sizes.map(f2).join(', ')}; ${l20.empty} empty reads`);
}

console.log('The read clock\'s refusals (check 11)');
{
  const refused = (opts, name) => threw(() => createClock(opts), new RegExp(`^${name} `));
  const cases = [['fps', 9], ['fps', 1001], ['tick', 4], ['tick', 101], ['packet', 15], ['late', -1], ['late', 32], ['place', 8], ['place', 1.5], ['place', -1]];
  for (const name of ['fps', 'tick', 'packet', 'late', 'place', 'seed']) cases.push([name, NaN], [name, '10'], [name, null]);
  const failed = cases.filter(([name, v]) => !refused({ [name]: v }, name)).map(([n, v]) => `${n} ${String(v)}`);
  if (!refused({ packet: 20, place: 16 }, 'place')) failed.push('place 16 with 20 ms packets');
  check('fps 9 and 1001, tick 4 and 101, packet 15, late -1 and 32, place 8 (16 with 20 ms packets), 1.5 and -1, and each given as NaN, a string or null: a RangeError that names it',
    failed.length === 0, failed.join('; '));
  const taken = [{ fps: 10 }, { fps: 1000 }, { tick: 5 }, { tick: 100 }, { packet: 20 }, { late: 0 }, { late: 31.25 }, { place: 7 }, { packet: 20, place: 15 }, { place: 0 }]
    .filter((o) => { try { createClock(o).next(); return true; } catch (e) { return false; } });
  check('the ends of each range are taken: fps 10 and 1000, tick 5 and 100, packet 20, late 0 and 31.25, place 0 and 7 (15 with 20 ms packets)', taken.length === 10, `${taken.length} of 10`);
}

console.log('The module, again (check 12)');
{
  const K = STEAM_SENDER.clock;
  const want = { pass: 50, tick: 15, fps: 294, fetchSpread: 1, otherRate: 3, timerStep: 15.625, slip: 1.3, tolerance: 1, work: 0.05, workSpread: 1.5, packet: 10, late: 9, maxSteps: 3 };
  const mix = { phase: 0x1F123BB5, game: 0x2545F491, timer: 0x51ED270B, work: 0x6C8E9CF5, capture: 0x3C6EF372, other: 0x7F4A7C15 };
  check('STEAM_SENDER.clock is frozen and holds the order\'s numbers and the six mix values, and nothing else',
    Object.isFrozen(K) && Object.isFrozen(K.mix) && JSON.stringify(K) === JSON.stringify({ ...want, mix }), JSON.stringify(K));
  check('its exports are the three again (W3-27b): STEAM_SENDER, createClock, createSender', Object.keys(M).join() === 'STEAM_SENDER,createClock,createSender');
}

// W3-27b, check 5: the capture's place through the sender. On the suite's signal the
// silence record after the spurt is one step long in a share of seeds that the place's draw
// sets: with the place fixed at 0 the long step of 8 falls at one place of the source in
// every seed. Measured on the build: 22.55% with the place drawn and 33.55% with place 0 (the
// order's prototype: 22.6 and 34.6%; W3-16's clock 23.3%; Set D's demo 2 of 19).
console.log('The capture\'s place, through the sender (W3-27b, check 5; seeds 1 to 2,000 of the statistics signal)');
{
  const sig = statsSignal();
  let one = 0, one0 = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const rec = run(sig, { seed }).messages.find((m) => m.silence !== undefined);
    const fixed = refClock(seed, { place: 0 });
    const rec0 = run(sig, { clock: { next: fixed }, lead: fixed.lead }).messages.find((m) => m.silence !== undefined);
    if (rec && rec.silence === 750) one++;
    if (rec0 && rec0.silence === 750) one0++;
  }
  check('the silence record is one step long in 20 to 26% of seeds; with place 0 forced through a clock of the suite\'s own, in over 31%',
    one >= 400 && one <= 520 && one0 > 620, `${(one / 20).toFixed(2)}% and ${(one0 / 20).toFixed(2)}%`);
}

console.log(`\n${passed} steam sender checks passed`);
