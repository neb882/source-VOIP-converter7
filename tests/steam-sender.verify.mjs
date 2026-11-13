// Steam's sender (steam-sender.js), checked against "The sender's packets" in
// docs/work-orders/W3-02-receiver-queue.md and against docs/work-orders/W3-16-sender-hold-clock.md
// (the hold in 32-bit floats on Steam's clock, the read clock as measured, a read that brings
// nothing): the clock, the float arithmetic, the empty read, the reference schedule, the
// statistics, the gate, the pre-roll, the hold, the gate off and every sample sent once.
//
//   node tests/steam-sender.verify.mjs
//
// A second model of the orders' text, written with plain arrays (plainClock and plainSender
// below), runs beside the module: the two must agree read for read and message for message,
// and it gives what the module does not show (which read made which message).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const M = require('../steam-sender.js');
const { STEAM_SENDER, createClock, createSender } = M;

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

// The W3-16 order, item 1, as written there: the reads from A, the capture from B; the
// capture steps' ready times kept in an array.
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

// The W3-16 order, "The reference schedule" and item 1's reference. W3-21 (the capture's
// lead, 49 samples at this seed) moved six ticks of REF_MESSAGES each one earlier (messages
// 3, 5, 15, 19, 27 and 40: 87, 94, 131, 146, 175 and 223 before); with lead 0 the W3-16
// list comes back (checked below).
const REF_MESSAGES = `[75,0,7] [79,8,10] [83,11,13] [86,14,16] [90,17,18] [93,19,21] [97,22,24] [101,25,27] [105,28,30] [109,31,32]
[113,33,35] [116,36,38] [120,39,41] [123,42,43] [127,44,46] [130,47,49] [134,50,50] [138,51,54] [141,55,57]
[145,58,60] [149,61,63] [152,64,64] [156,65,68] [159,69,71] [163,72,72] [167,73,75] [171,76,79] [174,80,82]
[179,83,85] [183,86,88] [186,89,89] [190,90,93] [194,94,96] [197,97,99] [201,100,103,e] [205,104,106]
[209,107,107] [213,108,110] [216,111,113] [219,114,115] [222,116,118] [226,119,121] [230,122,123] [234,124,126]
[238,127,129] [242,130,132] [245,133,135] [249,136,137] [252,138,141,e] [256,-1,1500]`.split(/\s+/);
const REF_MESSAGES_W316 = REF_MESSAGES.map((m, i) => ({ 3: '[87,14,16]', 5: '[94,19,21]', 15: '[131,47,49]', 19: '[146,58,60]', 27: '[175,80,82]', 40: '[223,116,118]' })[i] || m);
const REF_READS = [[0, 0.018701], [1500, 0.078105], [1500, 0.132631], [1500, 0.193900], [750, 0.250731], [1500, 0.298772],
  [1500, 0.356728], [750, 0.407854], [1500, 0.469505], [1500, 0.518744]];
const REF_PHASE = 0.124762;
const CLOCK_HASH = '480ce9b772e19e23d619af099a1292030b62278d75916efb8ae4cf882a843502';
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
    && S.hold === 0.4 && S.meanMin === 327.67 && S.peakMin === 4915 && S.readMin === 0.0480 && S.readMax === 0.0637 && S.captureLate === 0.013
    && S.phaseSpan === 0.25 && S.uptime === 777600 && S.relay === 0.002 && S.tick === 0.015 && S.seedMix === 0x51ED270B && S.seedMixCapture === 0x2545F491);
  check('the timer-tick clock\'s constants are gone (timer, period, late, lateMax)', ['timer', 'period', 'late', 'lateMax'].every((k) => !(k in S)));
}

console.log('The clock (the W3-16 order, item 1)');
{
  const c = createClock({ seed: 1 }), first = Array.from({ length: 10 }, () => c.next());
  const bad = first.findIndex((r, i) => r.samples !== REF_READS[i][0] || Math.abs(r.since - REF_READS[i][1]) > 1e-6 || Math.abs(r.time - r.since - REF_PHASE) > 1e-6);
  check('seed 1: the order\'s first ten reads, as samples at since (to 1 us), each time 0.124762 more', bad < 0,
    first.map((r) => `${r.samples}@${r.since.toFixed(6)}`).join(' '));
  const hash = (seed, k) => {
    const cl = createClock({ seed }), buf = Buffer.alloc(18 * k);
    for (let i = 0; i < k; i++) { const r = cl.next(); buf.writeDoubleLE(r.time, 18 * i); buf.writeDoubleLE(r.since, 18 * i + 8); buf.writeUInt16LE(r.samples, 18 * i + 16); }
    return crypto.createHash('sha256').update(buf).digest('hex');
  };
  const h = hash(1, 100000);
  check('seed 1, 100,000 reads as time, since (64-bit floats) and samples (16 bits), little-endian: the order\'s SHA-256', h === CLOCK_HASH, h);
  const take = (seed, k) => { const cl = createClock({ seed }); return JSON.stringify(Array.from({ length: k }, () => cl.next())); };
  check('two seeds differ; one seed repeats', take(1, 50) !== take(2, 50) && take(5, 1000) === take(5, 1000));
  check('an unseeded clock is seed 0xC0FFEE\'s', take(undefined, 50) === take(0xC0FFEE, 50));
  let refused = 0;
  for (const v of [NaN, Infinity, '7', null]) {
    try { createClock({ seed: v }); } catch (e) { if (e instanceof RangeError) refused++; }
    try { createSender({ seed: v }); } catch (e) { if (e instanceof RangeError) refused++; }
  }
  check('a seed that is given but is not a finite number is refused, not taken as 0xC0FFEE', refused === 8);
  // Read for read, bit for bit, against the second copy (the bracket of r included).
  let agree = true, where = '';
  for (let seed = 1; seed <= 400 && agree; seed++) {
    const a = createClock({ seed }), b = plainClock(seed);
    for (let i = 0; i < 2000; i++) {
      const x = a.next(), y = b();
      if (!Object.is(x.time, y.time) || !Object.is(x.since, y.since) || x.samples !== y.samples) { agree = false; where = `seed ${seed} read ${i}`; break; }
    }
  }
  check('it is the order\'s formula, drawn in its order: seeds 1 to 400, 2000 reads each, bit for bit against the second copy', agree, where);
  // The time is since plus a phase that moves with the seed over 0 to 0.25 s.
  const phases = Array.from({ length: 400 }, (_, s) => { const r = createClock({ seed: s + 1 }).next(); return r.time - r.since; });
  check('the phase: time less since is the same for every read of a seed, and over seeds 1 to 400 spreads over 0 to 0.25 s',
    phases.every((p) => p >= 0 && p < 0.25) && Math.min(...phases) < 0.01 && Math.max(...phases) > 0.24,
    `${Math.min(...phases).toFixed(4)} to ${Math.max(...phases).toFixed(4)} s`);
}

console.log('The clock\'s statistics (300,000 reads of createClock at the default seed; the order\'s bounds)');
{
  const U = STEAM_SENDER.uptime, HOLD = f32(0.4), N = 300000;
  const cl = createClock();
  const reads = Array.from({ length: N }, () => cl.next());
  const firstChunk = reads.findIndex((r) => r.samples > 0);
  const chunks = reads.filter((r) => r.samples > 0);
  const pct = (k, n) => (100 * k) / n;
  const shareOf = (len) => pct(chunks.filter((r) => r.samples === len).length, chunks.length);
  const s750 = shareOf(750), s1500 = shareOf(1500), s2250 = shareOf(2250);
  check('chunks of 750 / 1500 / 2250: 22.8 to 23.8 / 74.1 to 75.2 / 1.8 to 2.3%', s750 >= 22.8 && s750 <= 23.8 && s1500 >= 74.1 && s1500 <= 75.2 && s2250 >= 1.8 && s2250 <= 2.3,
    `${s750.toFixed(2)} / ${s1500.toFixed(2)} / ${s2250.toFixed(2)}`);
  const over = chunks.filter((r) => r.samples > 2250 || r.samples % 750).length, emptyAfter = reads.slice(firstChunk).filter((r) => r.samples === 0).length;
  check('no chunk over 2250 (and every chunk whole steps); no read that brings nothing after the first chunk', over === 0 && emptyAfter === 0 && firstChunk <= 2,
    `the first chunk is read ${firstChunk + 1}`);
  const pairs = {};
  for (let i = 1; i < chunks.length; i++) { const k = `${chunks[i - 1].samples / 750}-${chunks[i].samples / 750}`; pairs[k] = (pairs[k] || 0) + 1; }
  const P = (k) => pct(pairs[k] || 0, chunks.length - 1);
  check('pairs 2-2 52.3 to 53.6%; 2-1 and 1-2 21.0 to 21.9% each', P('2-2') >= 52.3 && P('2-2') <= 53.6 && [P('2-1'), P('1-2')].every((x) => x >= 21.0 && x <= 21.9),
    `${P('2-2').toFixed(2)}, ${P('2-1').toFixed(2)}, ${P('1-2').toFixed(2)}`);
  check('pairs 3-1 and 1-3 1.5 to 2.1% each', [P('3-1'), P('1-3')].every((x) => x >= 1.5 && x <= 2.1), `${P('3-1').toFixed(2)}, ${P('1-3').toFixed(2)}`);
  check('pairs 1-1 under 0.2%; 2-3 and 3-2 0.15 to 0.45% each; 3-3 under 0.02%',
    P('1-1') < 0.2 && [P('2-3'), P('3-2')].every((x) => x >= 0.15 && x <= 0.45) && P('3-3') < 0.02,
    `${P('1-1').toFixed(3)}, ${P('2-3').toFixed(3)}, ${P('3-2').toFixed(3)}, ${P('3-3').toFixed(3)}`);
  const fpm = [0, 0, 0, 0, 0, 0, 0];
  let kept = 0;
  for (const r of chunks) { const t = kept + r.samples, n = Math.floor(t / 480); kept = t - 480 * n; fpm[Math.min(n, 6)]++; }
  const F = [1, 2, 3, 4, 5].map((n) => pct(fpm[n], chunks.length)), FW = [10.3, 13.0, 65.2, 10.0, 1.4];
  check('frames per message 1 to 5, as one endless spurt: each within 0.6 of 10.3 / 13.0 / 65.2 / 10.0 / 1.4%', F.every((x, i) => Math.abs(x - FW[i]) <= 0.6) && fpm[0] === 0 && fpm[6] === 0,
    F.map((x) => x.toFixed(2)).join(' / '));
  const perSecond = chunks.length / (chunks[chunks.length - 1].since - chunks[0].since);
  check('reads a second: 17.85 to 17.95', perSecond >= 17.85 && perSecond <= 17.95, perSecond.toFixed(3));
  let lo = Infinity, hi = -Infinity;
  for (let i = 1; i < N; i++) { const d = reads[i].since - reads[i - 1].since; if (d < lo) lo = d; if (d > hi) hi = d; }
  // 1e-9 s of slack for the subtraction of two times of up to 4.7 hours.
  check('the shortest and longest interval: at least 48.0 ms, at most 63.7 ms', lo >= 0.0480 - 1e-9 && hi <= 0.0637 + 1e-9, `${(lo * 1000).toFixed(3)}, ${(hi * 1000).toFixed(3)} ms`);
  // Each read with samples in turn as a spurt's last active one, all later reads inactive: the
  // spurt's last chunk is the first later read with fround(uptime + time) > fround(noted + 0.4).
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
  check('ends on the 7th / 8th / 9th chunk at uptime 777600: 24.5 to 28.5 / 68.8 to 72.8 / 2.0 to 3.6%',
    e9(7) >= 24.5 && e9(7) <= 28.5 && e9(8) >= 68.8 && e9(8) <= 72.8 && e9(9) >= 2.0 && e9(9) <= 3.6, show(e9, [6, 7, 8, 9, 10]));
  check('the same at uptime 14400: 18 to 22 / 78 to 82 / under 0.1%', e4(7) >= 18 && e4(7) <= 22 && e4(8) >= 78 && e4(8) <= 82 && e4(9) < 0.1, show(e4, [6, 7, 8, 9]));
  check('the same at uptime 1555200: 11.2 to 15.2 / 42.3 to 46.3 / 37.1 to 41.1%, and the 10th 2.6 to 4.2%',
    e18(7) >= 11.2 && e18(7) <= 15.2 && e18(8) >= 42.3 && e18(8) <= 46.3 && e18(9) >= 37.1 && e18(9) <= 41.1 && e18(10) >= 2.6 && e18(10) <= 4.2,
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

console.log('Determinism and the reference schedule (the W3-16 order)');
{
  const sig = referenceSignal();
  const r = run(sig, { seed: 0xC0FFEE });
  const got = r.messages.map(fmt);
  const bad = got.findIndex((m, i) => m !== REF_MESSAGES[i]);
  check('seed 0xC0FFEE at the default uptime: the order\'s 50 messages, message for message', got.length === REF_MESSAGES.length && bad < 0,
    bad >= 0 ? `first difference at ${bad}: ${got[bad]} for ${REF_MESSAGES[bad]}` : `${got.length} messages`);
  // W3-21: 21551 and 71201 (21600 and 71250 before, less the lead of 49), and one chunk
  // more (73, 72 before): the lead's zeros make the capture one step longer.
  check('its two spurts: start 21551 with 104 frames (pre-roll 2400), start 71201 with 38 (pre-roll 0, straight from the ended state); 73 chunks; lead 49',
    JSON.stringify(r.info.spurts) === JSON.stringify([{ start: 21551, frames: 104, preroll: 2400 }, { start: 71201, frames: 38, preroll: 0 }]) && r.info.chunks === 73
    && r.info.uptime === 777600 && r.info.lead === 49, `${JSON.stringify(r.info.spurts)}, ${r.info.chunks} chunks, lead ${r.info.lead}`);
  const r0 = run(sig, { seed: 0xC0FFEE, lead: 0 });
  check('with lead 0 the W3-16 order\'s schedule comes back: its 50 messages, spurts from 21600 and 71250, 72 chunks',
    r0.messages.map(fmt).join(' ') === REF_MESSAGES_W316.join(' ')
    && JSON.stringify(r0.info.spurts) === JSON.stringify([{ start: 21600, frames: 104, preroll: 2400 }, { start: 71250, frames: 38, preroll: 0 }]) && r0.info.chunks === 72);
  check('the same seed and uptime give the same messages twice; seeds 1 and 2 differ',
    same(run(sig, { seed: 3, uptime: 14400 }).messages, run(sig, { seed: 3, uptime: 14400 }).messages) && !same(run(sig, { seed: 1 }).messages, run(sig, { seed: 2 }).messages));
  const at = (seed, uptime) => run(sig, { seed, uptime });
  // W3-21 moved these: before it, seed 1 gave 102 and 40 frames (from 21600 and 70500) at
  // uptime 14400 and 104 and 38 (from 21600 and 71250) at 777600, and the default seed and
  // seeds 4 to 10 the same spurts at both. With the capture's lead seed 1 gives the same
  // spurts at both values, and seed 2 is the one shown here.
  const a = at(2, 14400), b = at(2, 777600);
  check('seed 2: spurts of 102 and 40 frames (from 21046 and 69946) at uptime 14400, of 105 and 33 (from 21046 and 71446) at 777600, with the same chunks',
    JSON.stringify(a.info.spurts.map((s) => [s.frames, s.start])) === '[[102,21046],[40,69946]]'
    && JSON.stringify(b.info.spurts.map((s) => [s.frames, s.start])) === '[[105,21046],[33,71446]]', `${JSON.stringify(a.info.spurts)} ${JSON.stringify(b.info.spurts)}`);
  {
    // The same chunks: the reads the second copy ran at the two values are the same reads, as
    // far as the shorter run goes.
    const fa = plainSender(sig, plainClock(2), { uptime: 14400 }).frames, fb = plainSender(sig, plainClock(2), { uptime: 777600 }).frames;
    const k = Math.min(fa.length, fb.length);
    check('seed 2: the chunks do not depend on uptime (the reads of both runs are the same, as far as the shorter goes)',
      k > 60 && fa.slice(0, k).every((x, j) => x.count === fb[j].count && x.since === fb[j].since && x.time === fb[j].time), `${fa.length} and ${fb.length} reads`);
  }
  check('seeds 2 and 1: the first message is [71,0,7] at both values of uptime (seed 1\'s was [73,0,7] before W3-21)', fmt(a.messages[0]) === '[71,0,7]' && fmt(b.messages[0]) === '[71,0,7]'
    && fmt(at(1, 14400).messages[0]) === '[71,0,7]' && fmt(at(1, 777600).messages[0]) === '[71,0,7]', `${fmt(a.messages[0])} ${fmt(at(1, 14400).messages[0])}`);
  const sp = (seed, uptime) => JSON.stringify(at(seed, uptime).info.spurts);
  check('the default seed\'s two spurts are the same at both values of uptime, as are seeds 1, 5, 6, 7, 8 and 10\'s; seeds 2, 3, 4 and 9\'s are not',
    [0xC0FFEE, 1, 5, 6, 7, 8, 10].every((s) => sp(s, 14400) === sp(s, 777600)) && [2, 3, 4, 9].every((s) => sp(s, 14400) !== sp(s, 777600)));
  let agree = 0, where = '';
  for (let seed = 1; seed <= 400; seed++) {
    if (same(run(sig, { seed }).messages, plainSender(sig, plainClock(seed)).messages)) agree++;
    else where ||= `seed ${seed}`;
  }
  check('the second copy gives the same messages, samples included, for seeds 1 to 400 (and 0xC0FFEE)', agree === 400
    && same(r.messages, plainSender(sig, plainClock(0xC0FFEE)).messages), where || `${agree} of 400`);
  // Ticks: each message's is max(last + 1, ceil((since + 0.002) / 0.015)) of the read that made
  // it, the read's since taken from the second copy's reads.
  let ticksOk = true;
  for (let seed = 1; seed <= 50 && ticksOk; seed++) {
    const p = plainSender(sig, plainClock(seed)), ms = run(sig, { seed }).messages;
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
  for (const [label, opts, reads, uptime] of [['seed 0xC0FFEE', () => ({ seed: 0xC0FFEE }), () => plainClock(0xC0FFEE), 777600],
    ['seed 2, uptime 1555200', () => ({ seed: 2, uptime: 1555200 }), () => plainClock(2), 1555200], ['the hand clock', () => HAND(4), () => handReads(4), 0]]) {
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

console.log('The statistics through the sender (seeds 1 to 400; a signal of 240,000 samples, 1000 from 24000 to 215999; the default uptime)');
{
  const sig = statsSignal();
  const count = {}, inc = (row, k) => { (count[row] ||= {})[k] = (count[row][k] || 0) + 1; };
  let agree = 0, rateCount = 0, rateTicks = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const { messages } = run(sig, { seed });
    const ref = plainSender(sig, plainClock(seed));
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
    ['game ticks between messages, 3 / 4 / 5 (2 and 6 no longer occur)', 'ticks', [[3, 0.305], [4, 0.666], [5, 0.029], [2, 0], [6, 0]]],
    // W3-21: 0.790 / 0.165 / 0.045 with the capture's lead (the prototype's, before it: 0.820,
    // 0.135 and 0.045); the signal's edge at 24000 is on a step's edge only with lead 0.
    ['openings of 8 / 6 / 9 frames', 'opening', [[8, 0.790], [6, 0.165], [9, 0.045]]],
    ['silence records of 750 / 1500 / 2250 samples', 'record', [[750, 0.210], [1500, 0.758], [2250, 0.033]]],
  ];
  for (const [label, row, want] of rows) {
    const got = want.map(([k]) => share(row, k));
    check(`${label}: each within 0.01 of the prototype's`, want.every(([, w], j) => Math.abs(got[j] - w) <= 0.01), got.map((g) => g.toFixed(4)).join(', '));
  }
  const rate = rateCount / (rateTicks * 0.015);
  check('messages a second: 17.90, within 0.01', Math.abs(rate - 17.90) <= 0.01, rate.toFixed(3));
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
      && same(g.messages, plainSender(cut, plainClock(seed), { gate: false }).messages);
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
    const clock = plainClock(seed), plain = plainSender(sig, clock, { uptime });
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
  // 1. The lead: (750 - round(c0 x 24000)) mod 750, computed a second time from the second
  // copy's own c0, for 1,000 seeds; over 100,000 seeds no value from 0 to 749 is missing.
  let bad = '';
  for (let seed = 1; seed <= 1000 && !bad; seed++) {
    const c0 = 0.03125 * mulberry32((seed ^ 0x2545F491) >>> 0)(), want = ((750 - Math.round(c0 * 24000)) % 750 + 750) % 750;
    if (createClock({ seed }).lead !== want || plainClock(seed).lead !== want) bad = `seed ${seed}: ${createClock({ seed }).lead} for ${want}`;
  }
  check('createClock({ seed }).lead is (750 - round(c0 x 24000)) mod 750, seeds 1 to 1,000, by a second computation', !bad, bad);
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
    if (!same(got.messages, want) || !spurtsOk || !asPlain || !ticksEarlier || !same(got.messages, plainSender(sig, plainClock(seed), { lead: L, gate }).messages)) {
      fails.push(`${label}, seed ${seed}, lead ${L}, gate ${gate}`);
    }
  }
  check('with lead L of 0, 1, 318 and 749 (seeds 1, 0xC0FFEE and 77; three sources, one shorter than the lead, one loud from sample 0; the gate on and off): the messages of lead 0 on L zeros and the source, starts less L, ticks from since less L / 24000; the second copy agrees',
    fails.length === 0 && moved > 0, fails.slice(0, 3).join('; ') || `${moved} of ${total} ticks earlier than lead 0's on the longer source`);
  const firstStep = run(opening, { seed: 1, lead: 749 });
  check('a spurt that opens in the first step (lead 749): its pre-roll and the lead\'s zeros lie before sample 0, and the source is in its frames from sample 0',
    firstStep.info.spurts[0].start === -2400 - 749 && firstStep.messages[0].pcm.subarray(0, 2400 + 749).every((v) => v === 0)
    && firstStep.messages[0].pcm[2400 + 749 + 1] === opening[1], JSON.stringify(firstStep.info.spurts[0]));

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

console.log(`\n${passed} steam sender checks passed`);
