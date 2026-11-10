// Steam's sender (steam-sender.js), checked against "The sender's packets" in
// docs/work-orders/W3-02-receiver-queue.md: the clock, the reference schedule, the
// statistics, the gate, the pre-roll, the hold, the gate off and every sample sent once.
//
//   node tests/steam-sender.verify.mjs
//
// A second model of the order's text, written with plain arrays (plainSender below), runs
// beside the module: the two must agree message for message, and it gives what the module
// does not show (which clock frame read which chunk, for the statistics' third rule).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const M = require('../steam-sender.js');
const { STEAM_SENDER, createClock, createSender } = M;

let passed = 0;
function check(name, ok, detail = '') { assert.ok(ok, `${name} ${detail}`); passed++; console.log(`  ok    ${name}${detail ? `   [${detail}]` : ''}`); }

// ---------------------------------------------------------------------------------------
// The order's text, a second time: the clock and the sender with plain arrays.

function mulberry32(seed) {   // as in audio.js
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function plainClock(seed) {
  const draw = mulberry32((seed ^ 0x51ED270B) >>> 0);
  const phase = 0.03125 * draw();
  let i = 0, prev = 0;
  return () => {
    const u1 = draw(), u2 = draw();
    const late = u1 < 0.06 ? 0.030 * u2 : 0;
    prev = Math.max(prev + 1, Math.ceil((phase + i * 0.05585 + late) / 0.015625));
    i++;
    return prev;
  };
}

// The whole signal at once. Returns { messages, frames }: frames has one entry per clock
// frame run, { n, count, len, active, final, made } (made: the index of the message it sent).
function plainSender(signal, next, { gate = true, meanMin = 327.67 } = {}) {
  const L = signal.length, at = (i) => (i >= 0 && i < L ? signal[i] : 0);
  let state = 'SILENT', past = [], kept = [], last = 0, lastTick = -1, read = 0, total = 0;
  let spurt = -1, spurtStart = 0, spurtFrames = 0;
  const messages = [], frames = [];
  const tickOf = (now) => (lastTick = Math.max(lastTick + 1, Math.ceil((now + 0.002) / 0.015)));
  const encode = (now, pcm, final) => {
    let buf = kept.concat(pcm);
    const count = final ? Math.ceil(buf.length / 480) : Math.floor(buf.length / 480);
    while (buf.length < count * 480) buf.push(0);
    kept = final ? [] : buf.slice(count * 480);
    buf = buf.slice(0, count * 480);
    if (!count && !final) return -1;
    messages.push({ tick: tickOf(now), spurt, first: total, last: total + count - 1, start: spurtStart + 480 * spurtFrames, end: final, pcm: buf });
    total += count; spurtFrames += count;
    return messages.length - 1;
  };
  for (;;) {
    if (gate && read >= L && state === 'SILENT') break;
    const n = next(), now = n * 0.015625, count = 750 * Math.floor(n / 2);
    if (count === read) { frames.push({ n, count, len: 0 }); continue; }
    const lastFrame = !gate && count > L;
    const end = lastFrame ? L : count;
    const chunk = [];
    for (let k = read; k < end; k++) chunk.push(at(k));
    const from = read;
    read = count;
    const f = { n, count, len: chunk.length, made: -1, final: false };
    frames.push(f);
    if (!chunk.length) {                        // the gate off, nothing left: the end marker
      if (state === 'ACTIVE') f.made = encode(now, [], true);
      break;
    }
    const sum = chunk.reduce((a, v) => a + Math.abs(v), 0), peak = Math.max(...chunk.map(Math.abs));
    f.active = !gate || sum / chunk.length >= meanMin || peak >= 4915;
    if (state === 'SILENT' || state === 'ENDED') {
      if (f.active) {
        let pcm = chunk, pre = 0;
        if (state === 'SILENT') { if (!past.length) past = new Array(2400).fill(0); pre = past.length; pcm = past.concat(chunk); past = []; }
        spurt++; spurtStart = from - pre; spurtFrames = 0;
        kept = []; state = 'ACTIVE'; last = now;
        f.final = lastFrame;
        f.made = encode(now, pcm, lastFrame);
        if (lastFrame) state = 'ENDED';
      } else {
        past = past.concat(chunk).slice(-2400);
        if (state === 'ENDED') { messages.push({ tick: tickOf(now), silence: chunk.length }); f.made = messages.length - 1; }
        state = 'SILENT';
      }
    } else {
      if (f.active) { state = 'ACTIVE'; last = now; } else state = 'HANGING';
      f.final = lastFrame || (state === 'HANGING' && now > last + 0.4);
      f.made = encode(now, chunk, f.final);
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

const handClock = (step) => { let i = 0; return { next: () => step * (++i) }; };
const listClock = (list) => { let i = 0; return { next: () => list[i++] }; };
const fmt = (m) => (m.silence !== undefined ? `[${m.tick},-1,${m.silence}]` : `[${m.tick},${m.first},${m.last}${m.end ? ',e' : ''}]`);
const plainOf = (m) => (m.silence !== undefined ? m : { ...m, pcm: Array.from(m.pcm) });
const same = (a, b) => JSON.stringify(a.map(plainOf)) === JSON.stringify(b.map(plainOf));
const sound = (ms) => ms.filter((m) => m.silence === undefined);

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

const REF_CLOCK = [2, 6, 9, 13, 16, 20, 24, 27, 31, 34, 38, 41, 45, 49, 52, 57, 59, 63, 66, 70, 75, 77, 81, 84];
const REF_MESSAGES = `[69,0,7] [74,8,10] [79,11,13] [81,14,14] [85,15,18] [88,19,21] [92,22,24] [95,25,25] [100,26,29] [104,30,32]
[107,33,35] [111,36,38] [114,39,39] [118,40,43] [123,44,46] [126,47,49] [130,50,52] [133,53,54] [137,55,57]
[140,58,60] [144,61,63] [149,64,66] [154,67,69] [156,70,71] [159,72,74] [163,75,77] [167,78,80] [170,81,82]
[175,83,85] [178,86,88] [183,89,91] [185,92,93] [189,94,96] [192,97,99] [196,100,103,e] [201,-1,1500]
[204,104,107] [209,108,112] [211,113,113] [215,114,117] [218,118,118] [223,119,121] [227,122,124] [230,125,128]
[234,129,131] [237,132,132] [241,133,135] [244,136,138] [249,139,143,e] [253,-1,1500]`.split(/\s+/);
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
  check('its constants are frozen and the order\'s', Object.isFrozen(S) && S.rate === 24000 && S.frame === 480 && S.grid === 750 && S.preroll === 2400
    && S.hold === 0.4 && S.meanMin === 327.67 && S.peakMin === 4915 && S.timer === 0.015625 && S.period === 0.05585 && S.late === 0.06
    && S.lateMax === 0.030 && S.relay === 0.002 && S.tick === 0.015 && S.seedMix === 0x51ED270B);
}

console.log('The clock');
{
  const c = createClock({ seed: 0xC0FFEE }), got = REF_CLOCK.map(() => c.next());
  check('seed 0xC0FFEE starts with the reference\'s 24 numbers', got.join() === REF_CLOCK.join(), got.join(','));
  const take = (seed, k) => { const c = createClock({ seed }); return Array.from({ length: k }, () => c.next()).join(); };
  check('two seeds differ', take(1, 24) !== take(2, 24));
  check('one seed repeats', take(5, 1000) === take(5, 1000));
  let agree = true, steps = new Set();
  for (let seed = 1; seed <= 400 && agree; seed++) {
    const a = createClock({ seed }), b = plainClock(seed);
    let prev = 0;
    for (let i = 0; i < 260; i++) { const x = a.next(); if (x !== b()) { agree = false; break; } steps.add(x - prev); prev = x; }
  }
  check('it is the order\'s formula, drawn in its order (seeds 1 to 400, 260 frames each, against a second reading)', agree,
    `steps ${[...steps].sort((a, b) => a - b).join(', ')}`);
  check('an unseeded clock is seed 0xC0FFEE\'s', take(undefined, 24) === REF_CLOCK.join());
}

console.log('The reference schedule');
{
  const sig = referenceSignal();
  const r = run(sig, { seed: 0xC0FFEE });
  const got = r.messages.map(fmt);
  const bad = got.findIndex((m, i) => m !== REF_MESSAGES[i]);
  check('seed 0xC0FFEE: the order\'s 50 messages, message for message', got.length === REF_MESSAGES.length && bad < 0,
    bad >= 0 ? `first difference at ${bad}: ${got[bad]} for ${REF_MESSAGES[bad]}` : `${got.length} messages`);
  check('its two spurts: start 20850 with 104 frames (pre-roll 2400), start 70500 with 40 (pre-roll 1500)',
    JSON.stringify(r.info.spurts) === JSON.stringify([{ start: 20850, frames: 104, preroll: 2400 }, { start: 70500, frames: 40, preroll: 1500 }]),
    JSON.stringify(r.info.spurts));
  check('the second reading gives the same messages, samples included', same(r.messages, plainSender(sig, plainClock(0xC0FFEE)).messages));
  const h = run(sig, { clock: handClock(4) });
  const hm = h.messages.map(fmt);
  check('the hand clock n = 4 (i + 1): its first nine messages and last two as given',
    hm.slice(0, 9).join(' ') === HAND_FIRST.join(' ') && hm.slice(-2).join(' ') === HAND_LAST.join(' '), `${hm.slice(0, 9).join(' ')} ... ${hm.slice(-2).join(' ')}`);
  check('the hand clock: spurts of 102 and 38 frames from 21600 and 70500',
    JSON.stringify(h.info.spurts) === JSON.stringify([{ start: 21600, frames: 102, preroll: 2400 }, { start: 70500, frames: 38, preroll: 1500 }]),
    JSON.stringify(h.info.spurts));
  const open = h.messages[0];
  check('the hand clock\'s opening: 2400 + 1500 samples is 8 frames with 60 kept; the kept grow by 60 a chunk until a fourth frame fits',
    open.last - open.first + 1 === 8 && sound(h.messages).slice(1, 8).map((m) => m.last - m.first + 1).join() === '3,3,3,3,3,3,4');
  for (const [label, opts] of [['seed 0xC0FFEE', () => ({ seed: 0xC0FFEE })], ['the hand clock', () => ({ clock: handClock(4) })]]) {
    const whole = run(sig, opts()).messages;
    const ok = [1, 479, 750, 10000].every((p) => same(run(sig, opts(), p).messages, whole));
    check(`${label}: pushed in pieces of 1, 479, 750 and 10,000 samples, the same messages`, ok);
  }
  // Pushed one sample at a time, each message comes back from the push of its chunk's last
  // sample: never before it (and not later either).
  for (const [label, opts, clock] of [['seed 0xC0FFEE', () => ({ seed: 0xC0FFEE }), () => plainClock(0xC0FFEE)], ['the hand clock', () => ({ clock: handClock(4) }), () => { let i = 0; return () => 4 * (++i); }]]) {
    const ref = plainSender(sig, clock());
    const due = new Map();
    for (const f of ref.frames) if (f.made >= 0) due.set(f.made, f.count);
    const s = createSender(opts());
    let k = 0, wrong = 0, early = 0;
    for (let i = 0; i < sig.length; i++) for (let r = s.push(sig.subarray(i, i + 1)).length; r > 0; r--) { if (due.get(k) !== i + 1) { wrong++; if (i + 1 < due.get(k)) early++; } k++; }
    const tail = s.finish();
    const lateOk = tail.every((m, j) => due.get(k + j) > sig.length);
    check(`${label}: one sample at a time, every message comes from the push of its chunk's last sample`, wrong === 0 && lateOk && k + tail.length === ref.messages.length,
      `${k} during the pushes (${early} early, ${wrong - early} late), ${tail.length} from finish()`);
  }
}

console.log('The statistics (seeds 1 to 400; a signal of 240,000 samples, 1000 from 24000 to 215999)');
{
  const sig = statsSignal();
  const count = {}, inc = (row, k) => { (count[row] ||= {})[k] = (count[row][k] || 0) + 1; };
  let agree = 0, rateCount = 0, rateTicks = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const c = createClock({ seed });
    let prev = 0;
    for (let i = 0; i < 260; i++) { const x = 750 * Math.floor(c.next() / 2); if (i) inc('chunks', x - prev); prev = x; }     // rule 1
    const { messages } = run(sig, { seed });
    const ref = plainSender(sig, plainClock(seed));
    if (same(messages, ref.messages)) agree++;
    const snd = sound(messages);
    inc('opening', snd[0].last - snd[0].first + 1);
    for (const m of snd.slice(1)) if (!m.end) inc('frames', m.last - m.first + 1);                                   // rule 2
    for (let k = 1; k < messages.length; k++) inc('ticks', messages[k].tick - messages[k - 1].tick);
    for (const m of messages) if (m.silence !== undefined) inc('record', m.silence);
    const idx = ref.frames.map((f, i) => i), lastActive = idx.filter((i) => ref.frames[i].active).pop(), fin = idx.find((i) => ref.frames[i].final);
    inc('final', fin - lastActive);                                                                                     // rule 3
    rateCount += messages.length - 2;
    rateTicks += snd[snd.length - 1].tick - messages[0].tick;
  }
  check('the module and the second reading agree on all 400 seeds, samples included', agree === 400, `${agree} of 400`);
  const share = (row, k) => (count[row][k] || 0) / Object.values(count[row]).reduce((a, b) => a + b, 0);
  const rows = [
    ['chunks of 750, 1500, 2250 samples, and empty (rule 1)', 'chunks', [[750, 0.228], [1500, 0.755], [2250, 0.017], [0, 0.001]]],
    ['frames in a message after the opening, 1 to 5 (rule 2)', 'frames', [[1, 0.080], [2, 0.148], [3, 0.684], [4, 0.076], [5, 0.011]]],
    ['game ticks between messages, 2 to 6', 'ticks', [[2, 0.021], [3, 0.359], [4, 0.500], [5, 0.111], [6, 0.008]]],
    ['opening of 8, 6, 9 frames', 'opening', [[8, 0.943], [6, 0.037], [9, 0.020]]],
    ['the final chunk is the 7th, 8th after the last active one (rule 3)', 'final', [[7, 0.058], [8, 0.943]]],
    ['silence record of 750, 1500, 2250 samples', 'record', [[750, 0.233], [1500, 0.750], [2250, 0.018]]],
  ];
  for (const [label, row, want] of rows) {
    const got = want.map(([k]) => share(row, k));
    check(label, want.every(([, w], j) => Math.abs(got[j] - w) <= 0.005), got.map((g) => g.toFixed(4)).join(', '));
  }
  const rate = rateCount / (rateTicks * 0.015);
  check('messages a second: 17.88', Math.abs(rate - 17.88) <= 0.005, rate.toFixed(3));
}

// ---------------------------------------------------------------------------------------
// With the hand clock n = 4 (i + 1) chunk c is samples 1500 c to 1500 c + 1499.

const chunks = (n, fill) => { const s = new Int16Array(1500 * n); fill(s); return s; };
const C = (c) => 1500 * c;

console.log('The gate (the hand clock: chunks of 1500)');
{
  const opens = (s, opts = {}) => sound(run(s, { clock: handClock(4), ...opts }).messages).length > 0;
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
  let threw = 0;
  for (const v of [0, -1]) try { createSender({ meanMin: v }); } catch (e) { if (e instanceof RangeError) threw++; }
  check('meanMin at or below 0 is refused (a chunk of zeros would never end a spurt)', threw === 2);
}

console.log('The pre-roll');
{
  // Distinct values, so that which samples a frame holds shows.
  const loud = (s, a, b) => { for (let i = a; i < b; i++) s[i] = 1000 + (i % 997); };
  const quiet = (s, a, b) => { for (let i = a; i < b; i++) s[i] = 1 + (i % 199); };
  {
    const sig = chunks(20, (s) => loud(s, 0, C(3)));
    const r = run(sig, { clock: handClock(4) });
    const m = r.messages[0];
    check('an onset in the first chunk: start -2400, and the opening holds 2400 zeros then the chunk',
      r.info.spurts[0].start === -2400 && r.info.spurts[0].preroll === 2400 && m.start === -2400
      && m.pcm.subarray(0, 2400).every((v) => v === 0) && m.pcm.subarray(2400, 3840).every((v, k) => v === sig[k]));
  }
  {
    // Sound in chunks 2 to 4: ended on chunk 11 (the hold), the record is chunk 12, the next
    // onset in chunk 13 gets chunk 12 as its pre-roll and nothing of chunk 11.
    const sig = chunks(30, (s) => { quiet(s, 0, s.length); loud(s, C(2), C(5)); loud(s, C(13), C(15)); });
    const r = run(sig, { clock: handClock(4) });
    const recIdx = r.messages.findIndex((m) => m.silence !== undefined), next = r.messages[recIdx + 1];
    check('an onset one chunk after a silence record: its pre-roll is that chunk only',
      r.messages[recIdx].silence === 1500 && r.info.spurts[1].preroll === 1500 && r.info.spurts[1].start === C(12)
      && next.start === C(12) && next.pcm.subarray(0, 3000).every((v, k) => v === sig[C(12) + k]), JSON.stringify(r.info.spurts[1]));
  }
  {
    // Sound to the end of chunk 4: the final chunk is 11; sound again in chunk 12 (ENDED).
    const sig = chunks(30, (s) => { quiet(s, 0, s.length); loud(s, C(2), C(5)); loud(s, C(12), C(14)); });
    const r = run(sig, { clock: handClock(4) });
    const fin = r.messages.findIndex((m) => m.end), next = r.messages[fin + 1];
    check('an onset in the ENDED state (the chunk after the final one): no pre-roll and no silence record',
      next.silence === undefined && next.spurt === 1 && r.info.spurts[1].preroll === 0 && r.info.spurts[1].start === C(12)
      && next.start === C(12) && next.pcm.every((v, k) => v === sig[C(12) + k]) && next.first === r.messages[fin].last + 1,
      JSON.stringify(r.info.spurts[1]));
  }
  {
    // Nine quiet chunks before the onset: the pre-roll is the last 2400 samples of them.
    const sig = chunks(20, (s) => { quiet(s, 0, s.length); loud(s, C(9), C(11)); });
    const r = run(sig, { clock: handClock(4) });
    check('after several silent chunks the pre-roll is their last 2400 samples', r.info.spurts[0].start === C(9) - 2400
      && r.messages[0].pcm.subarray(0, 3840).every((v, k) => v === sig[C(9) - 2400 + k]));
  }
}

console.log('The hold');
{
  const stop = 6;                                       // sound in chunks 2 to stop - 1
  const ending = (step, extra) => {
    const sig = new Int16Array(24000 * 4);
    sig.fill(1000, 0, C(stop));
    if (extra) extra(sig);
    const plain = plainSender(sig, (() => { let i = 0; return () => step * (++i); })());
    const r = run(sig, { clock: handClock(step) });
    const fin = r.messages.find((m) => m.end), f = plain.frames.findIndex((x) => x.final);
    return { r, fin, frame: f, plain };
  };
  {
    const { r, fin, frame, plain } = ending(4);
    // The frame that reads chunk c is clock frame c with this clock.
    const real = plain.frames[frame].count - fin.start;
    check('the hand clock: sound that stops at the end of chunk c ends on chunk c + 7, its last frame padded',
      frame === stop - 1 + 7 && real < fin.pcm.length && fin.pcm.subarray(real).every((v) => v === 0) && fin.pcm.length - real < 480,
      `the end marker on chunk ${frame}; ${fin.pcm.length - real} zeros of padding`);
    check('the same in the module: the end marker is returned by the push of chunk c + 7\'s last sample', r.messages.indexOf(fin) === plain.frames[frame].made);
  }
  {
    const { frame, plain } = ending(3);
    const lastActive = plain.frames.map((f, i) => (f.active ? i : -1)).filter((i) => i >= 0).pop();
    check('with n = 3 (i + 1), every 46.875 ms: on chunk c + 9', frame - lastActive === 9, `${frame - lastActive} frames after the last active one`);
  }
  {
    const { r, plain } = ending(4, (s) => s.fill(1000, C(stop - 1 + 5), C(stop - 1 + 5) + 600));
    const finFrame = plain.frames.findIndex((x) => x.final);
    const before = r.messages.filter((m) => m.end && m.first * 480 + r.info.spurts[0].start < C(stop + 5));
    check('a burst of sound in chunk c + 5 keeps the spurt going with no end marker', before.length === 0 && r.info.spurts.length === 1
      && finFrame === stop - 1 + 5 + 7, `the end marker on chunk ${finFrame}`);
  }
  {
    // With the frame that would end the spurt gaining nothing, the end comes with the next frame
    // that gains samples: an empty read does nothing.
    const list = []; for (let i = 0; i < 400; i++) list.push(4 * (i + 1));
    const c = stop - 1 + 7;                             // the frame that ends it with the plain hand clock
    const skip = list.slice(0, c).concat([list[c - 1] + 1], list.slice(c).map((x) => x + 2));
    const sig = new Int16Array(24000 * 4); sig.fill(1000, 0, C(stop));
    const plain = plainSender(sig, (() => { let i = 0; return () => skip[i++]; })());
    const r = run(sig, { clock: listClock(skip) });
    check('a frame that gains nothing does nothing, even when the hold has run out: the end comes on the next frame that reads a chunk',
      plain.frames[c].len === 0 && plain.frames[c + 1].final && same(r.messages, plain.messages));
  }
}

console.log('The gate off');
{
  const sig = referenceSignal();
  const r = run(sig, { clock: handClock(4), gate: false });
  const snd = sound(r.messages), last = r.messages[r.messages.length - 1];
  const F = snd.reduce((a, m) => a + m.last - m.first + 1, 0);
  check('the hand clock on the reference signal: every chunk is sent, one message each', snd.length - 1 === 64 && snd.slice(0, -1).every((m) => m.last >= m.first), `${snd.length} sound messages`);
  check('one spurt from -2400, and no silence record', r.info.spurts.length === 1 && r.info.spurts[0].start === -2400 && r.messages.every((m) => m.silence === undefined));
  check('finish() returns the end marker last; the frames cover the source and at most 479 zeros more (here none: the end marker alone)',
    last.end && -2400 + 480 * F >= sig.length && -2400 + 480 * F - sig.length <= 479 && last.last === last.first - 1 && last.pcm.length === 0,
    `${F} frames, ${-2400 + 480 * F - sig.length} zeros after the source`);
  check('the second reading agrees', same(r.messages, plainSender(sig, (() => { let i = 0; return () => 4 * (++i); })(), { gate: false }).messages));
  // 2400 + 96000 samples are 205 frames exactly; cut to 95,003 the last frame has 37 zeros.
  const cut = sig.slice(0, 95003);
  let ok = true, padded = 0, detail = '';
  for (let seed = 1; seed <= 50 && ok; seed++) {
    const g = run(cut, { seed, gate: false }), s = sound(g.messages), z = s[s.length - 1];
    const frames = s.reduce((a, m) => a + m.last - m.first + 1, 0), over = -2400 + 480 * frames - cut.length;
    ok = g.info.spurts.length === 1 && g.messages.every((m) => m.silence === undefined) && s.filter((m) => m.end).length === 1 && z.end
      && over >= 0 && over <= 479 && (over === 0 || z.pcm.subarray(z.pcm.length - over).every((v) => v === 0))
      && same(g.messages, plainSender(cut, plainClock(seed), { gate: false }).messages);
    if (over === 37) padded++;
    if (!ok) detail = `seed ${seed}`;
  }
  check('seeds 1 to 50 on 95,003 samples: one spurt, the end marker on the last message only, its last frame padded with 37 zeros', ok && padded === 50, detail || `${padded} of 50 padded`);
  const quietSig = new Int16Array(30000);
  check('the gate off sends silence too', sound(run(quietSig, { seed: 3, gate: false }).messages).length > 5 && sound(run(quietSig, { seed: 3 }).messages).length === 0);
}

console.log('Every sample once (seeds 1 to 50, seeded noise bursts)');
{
  let worst = '', bad = 0, spurtsSeen = 0, messagesSeen = 0, maxKept = 0, ends = 0, records = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const rand = mulberry32(seed * 7919);
    const n = 24000 * 8, sig = new Int16Array(n);
    // Quiet noise everywhere (never zero, never active), bursts of loud noise of 30 to 900 ms.
    for (let i = 0; i < n; i++) sig[i] = (1 + Math.floor(rand() * 60)) * (rand() < 0.5 ? -1 : 1);
    for (let t = Math.floor(rand() * 4000); t < n;) {
      const len = 720 + Math.floor(rand() * 21000), amp = 1500 + Math.floor(rand() * 8000);
      for (let i = t; i < Math.min(n, t + len); i++) sig[i] = Math.round((rand() * 2 - 1) * amp) || 1;
      t += len + Math.floor(rand() * 24000);
    }
    const plain = plainSender(sig, plainClock(seed));
    const due = new Map(); for (const f of plain.frames) if (f.made >= 0) due.set(f.made, f.count);
    const s = createSender({ seed });
    const msgs = [], when = [];
    for (let i = 0; i < n; i += 37) for (const m of s.push(sig.subarray(i, Math.min(n, i + 37)))) { msgs.push(m); when.push(Math.min(n, i + 37)); }
    for (const m of s.finish()) { msgs.push(m); when.push(Infinity); }
    if (!same(msgs, plain.messages)) { bad++; worst ||= `seed ${seed}: the module and the second reading differ`; continue; }
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

console.log('Refusals');
{
  const s = createSender({ seed: 1 });
  let a = false, b = false, c = false;
  try { s.push(new Float32Array(10)); } catch (e) { a = e instanceof TypeError; }
  s.finish();
  try { s.push(new Int16Array(10)); } catch (e) { b = /after finish/.test(e.message); }
  try { createSender({ clock: listClock([2, 2, 4, 6, 8, 10, 12]) }).push(new Int16Array(3000)); } catch (e) { c = e instanceof RangeError; }
  check('push() takes an Int16Array, not after finish(); a clock that does not move on is refused', a && b && c);
  let d = false;
  try { createSender({ clock: listClock([2, 9, 13, 17, 21]) }).push(new Int16Array(9000)); } catch (e) { d = e instanceof RangeError && /clock/.test(e.message); }
  check('a clock that moves by more than 6 (a chunk over 2250 samples) is refused', d);
  check('finish() a second time returns nothing', s.finish().length === 0);
}

console.log(`\n${passed} steam sender checks passed`);
