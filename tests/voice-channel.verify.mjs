// The receiver's voice channel (voice-channel.js), checked against the rule read from the
// game's engine and the values the work order worked by hand (W3-02a in
// docs/work-orders/W3-02-receiver-queue.md), and the console-log replay:
//
//   node tests/voice-channel.verify.mjs                     the public checks
//   node tests/voice-channel.verify.mjs --fixture <file>    and a replay of a fixture
//
// The public checks write a console log in the game's format from a seeded run of the
// channel itself under a mixer of their own, turn it into a fixture with
// tests/voicequeue/log-to-fixture.mjs and replay it. With --fixture every section of the
// file is replayed as the engine and once under each of six faults (the ring a sample
// longer or shorter, the wait a tick longer or shorter, the packet's first sample kept, no
// grace before a free), and the mismatching ticks are printed per section; the exit code is
// non-zero if the engine row mismatches anywhere, or if a fault mismatches nowhere in the
// file. Fixtures made from real logs stay private: none is in this repository.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { logToFixture } from './voicequeue/log-to-fixture.mjs';
import { createReferenceChannel, referenceWaitTicks, referenceLatency } from './voicequeue/reference-channel.mjs';

const require = createRequire(import.meta.url);
const V = require('../voice-channel.js');
const { VOICE_CHANNEL, waitTicks, latency, createChannel } = V;
const TOOL = fileURLToPath(new URL('./voicequeue/log-to-fixture.mjs', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
// Set for the copies of this script that the public checks start: they only replay.
const REPLAY_ONLY = 'TF2VE_VOICE_REPLAY_ONLY';

let passed = 0;
function check(name, ok, detail = '') { assert.ok(ok, `${name} ${detail}`); passed++; console.log(`  ok    ${name}${detail ? `   [${detail}]` : ''}`); }

// ---------------------------------------------------------------------------------------
// The replay of a fixture.

const FAULTS = [
  ['ring + 1', () => ({ ring: VOICE_CHANNEL.ring + 1 })],
  ['ring - 1', () => ({ ring: VOICE_CHANNEL.ring - 1 })],
  ['wait + 1', (w) => ({ waitTicks: w + 1 })],
  ['wait - 1', (w) => ({ waitTicks: w - 1 })],
  ['sample kept', () => ({ keepSample: true })],
  ['no grace', () => ({ noGrace: true })],
];

// A section without a name is named by its place, one without bufferMs has voice_buffer_ms's
// default; fps and the events must be there.
function validFixture(f) {
  if (!f || !Array.isArray(f.sections) || !f.sections.length) throw new Error('a fixture is { about, sections: [...] } with at least one section');
  f = { ...f, sections: f.sections.map((s, i) => ({ ...s, name: typeof s.name === 'string' ? s.name : `section ${i + 1}`, bufferMs: s.bufferMs === undefined ? VOICE_CHANNEL.bufferMs : s.bufferMs })) };
  for (const [i, s] of f.sections.entries()) {
    const where = `section ${i + 1}`;
    for (const k of ['fps', 'bufferMs']) if (typeof s[k] !== 'number' || !Number.isFinite(s[k]) || s[k] <= 0) throw new Error(`${where}: ${k} is not a positive number`);
    const ev = s.events;
    if (!Array.isArray(ev) || ev.length % 2) throw new Error(`${where}: events must be a flat list of pairs`);
    for (let k = 0; k < ev.length; k += 2) {
      const kind = ev[k], v = ev[k + 1];
      if (!Number.isInteger(kind) || kind < 0 || kind > 3 || !Number.isInteger(v)) throw new Error(`${where}: event pair ${k / 2} is not kind 0 to 3 and a whole number`);
      // A packet is at most 11264 samples (Steam's decoder writes into 22528 bytes, W3-03 §3);
      // a million bounds packets and pulls far above any log.
      if ((kind === 0 && v !== 0) || ((kind === 1 || kind === 2) && (v < 0 || v > 1e6)) || (kind === 3 && v < -1)) throw new Error(`${where}: event pair ${k / 2} has an impossible value`);
    }
  }
  return f;
}

// One section through createChannel: packets of zeros, the mixer's demand, ticks; after each
// tick the channel's bytes (-1 when free) against the log's.
function replay(section, test) {
  const opts = { fps: section.fps, bufferMs: section.bufferMs, test };
  const ev = section.events;
  let ch = createChannel(opts), opens = 0, packets = 0, ticks = 0, bad = 0, first = null;
  for (let k = 0; k < ev.length; k += 2) {
    const kind = ev[k], v = ev[k + 1];
    if (kind === 0) { opens += ch.opens; ch = createChannel(opts); }
    else if (kind === 1) { ch.add(new Float32Array(v)); packets++; }
    else if (kind === 2) { if (v > 0) ch.pull(v); }      // a demand of 0: the mixer did not ask
    else {
      ch.tick(); ticks++;
      const got = ch.inUse ? 2 * ch.count : -1;
      if (got !== v) { bad++; if (!first) first = { pair: k / 2, tick: ticks, logged: v, model: got }; }
    }
  }
  return { packets, ticks, opens: opens + ch.opens, bad, first };
}

function replayFixture(fixture) {
  return validFixture(fixture).sections.map((s) => {
    const w = waitTicks(s.bufferMs, s.fps);
    return { name: s.name, waitTicks: w, engine: replay(s), faults: FAULTS.map(([label, make]) => ({ label, ...replay(s, make(w)) })) };
  });
}

// Prints the table; returns the reasons the replay fails (none: it passed).
function report(rows) {
  const reasons = [];
  console.log(`| Section (packets, ticks, opens) | wait | engine | ${FAULTS.map(([l]) => l).join(' | ')} |`);
  console.log(`| --- | ---: | ---: | ${FAULTS.map(() => '---:').join(' | ')} |`);
  for (const r of rows) console.log(`| \`${r.name}\` (${r.engine.packets}, ${r.engine.ticks}, ${r.engine.opens}) | ${r.waitTicks} | ${r.engine.bad} | ${r.faults.map((f) => f.bad).join(' | ')} |`);
  for (const r of rows) {
    if (!r.engine.bad) continue;
    const f = r.engine.first;
    console.log(`\`${r.name}\`, engine: first mismatch at event pair ${f.pair} (tick ${f.tick}): logged ${f.logged}, model ${f.model}`);
    reasons.push(`the engine mismatches on ${r.engine.bad} ticks of \`${r.name}\``);
  }
  for (const [i, [label]] of FAULTS.entries()) {
    if (!rows.some((r) => r.faults[i].bad)) reasons.push(`the fault "${label}" mismatches nowhere: the replay cannot see it`);
  }
  console.log(reasons.length ? `replay FAILED: ${reasons.join('; ')}` : 'replay passed: the engine matches every tick and each fault mismatches somewhere');
  return reasons;
}

// ---------------------------------------------------------------------------------------
// A console log in the game's format, from a seeded run of the channel itself.

function mulberry32(seed) {   // as in audio.js
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UNRELATED = 'Not a voice line: synthetic console output qXzUnrelated';
// Spurts in order; each starts when its condition holds after the previous one's last packet.
//   tick: at that tick; below: when the playing ring holds fewer samples (an append);
//   dry: on the tick after a pull emptied the ring (the grace); freed: that many ticks after
//   the channel was freed; after: that many ticks after the previous spurt's last packet.
const SCRIPT = [
  { start: { tick: 5 }, later: 30, unrelatedAt: 6 },   // opens a channel; at 300 fps it overflows while it waits
  { start: { below: 6000 }, later: 12 },               // appended to the playing channel
  { start: { dry: true }, later: 8 },                  // the grace
  { start: { freed: 12 }, later: 10 },                 // a new channel after a free nobody printed
  { start: { freed: 6 }, empty: true },                // a key press: an empty packet, then a short silence record
  { start: { after: 18 }, later: 10 },                 // speech 20 ticks after it (inside its wait at 300 fps)
  { start: { below: 3000 }, session: true, later: 6 }, // three unrelated lines, then a second session (the old channel still queued)
];

function synthesize({ fps, seed }) {
  const rand = mulberry32(seed);
  const pick = (table) => { const u = rand(); for (const [v, p] of table) if (u < p) return v; return table[table.length - 1][0]; };
  // The logs' sizes and spacing (W3-02's "The sender's packets"); the mixer takes 0, 1 or 2
  // blocks of 512 between ticks, 0.07 / 0.568 / 0.362 (44.1 kHz on average).
  const OPENING = [[7056, 0.77], [5292, 0.92], [6174, 0.96], [7938, 1]];
  const SIZES = [[2646, 0.65], [1764, 0.79], [3528, 0.90], [882, 1]];
  const GAPS = [[3, 0.41], [4, 0.90], [5, 1]];
  const RECORD = [[2756, 0.85], [1378, 1]];
  const BLOCKS = [[0, 0.07], [1, 0.638], [2, 1]];

  const lines = [];
  // marks: one per bufsize line: { line, b, packet (n or null), opened, playedBefore (the
  // channel was playing while the mixer ran before this tick) }.
  const marks = [];
  const truth = { packets: 0, ticks: 0, opens: 0, opensAfterFree: 0, appends: 0, graces: 0, emptyPackets: 0, sessions: 0, dropped: 0, starts: 0, firstBlocks: 0 };
  let ch = createChannel({ fps }), openedThisSession = false, firstBlock = true;
  let si = 0, schedule = null, lastPacketTick = -1, freedAt = -1, spurtFirst = false;
  for (let k = 0; ; k++) {
    if (k > 50000) throw new Error('the synthetic script did not finish');
    // The mixer, between the last tick and this one: only a playing channel is pulled.
    const blocks = pick(BLOCKS), playedBefore = ch.playing;
    let packet = null, opened = false;
    if (ch.playing) {
      for (let b = 0; b < blocks; b++) {
        ch.pull(firstBlock ? VOICE_CHANNEL.firstBlock : VOICE_CHANNEL.mixBlock);
        if (firstBlock) truth.firstBlocks++;
        firstBlock = false;
      }
    } else firstBlock = true;

    // Does the next spurt start on this tick?
    if (!schedule && si < SCRIPT.length) {
      const c = SCRIPT[si].start;
      const go = c.tick !== undefined ? k >= c.tick
        : c.below !== undefined ? ch.inUse && ch.playing && !ch.starved && ch.count > 0 && ch.count < c.below
          : c.dry ? ch.inUse && ch.starved
            : c.freed !== undefined ? freedAt > lastPacketTick && k >= freedAt + c.freed
              : k >= lastPacketTick + c.after;
      if (go) {
        const sp = SCRIPT[si++];
        if (sp.session) {
          for (let i = 0; i < 3; i++) lines.push(UNRELATED);
          truth.dropped += ch.dropped;
          ch = createChannel({ fps }); openedThisSession = false; firstBlock = true; truth.sessions++;
        }
        schedule = new Map();
        let at = k;
        if (sp.empty) { schedule.set(at, 0); at += 2; schedule.set(at, pick(RECORD)); }
        else {
          schedule.set(at, pick(OPENING));
          for (let i = 0; i < sp.later; i++) { at += pick(GAPS); schedule.set(at, pick(SIZES)); }
          at += pick(GAPS); schedule.set(at, pick(RECORD));
        }
        schedule.last = at; schedule.unrelated = sp.unrelatedAt === undefined ? -1 : [...schedule.keys()][sp.unrelatedAt];
        spurtFirst = true;
      }
    }

    // This tick's packet, then the tick's pass, then the channel's line.
    if (schedule && schedule.has(k)) {
      const n = schedule.get(k);
      packet = n; opened = !ch.inUse;
      if (!ch.inUse) { truth.opens++; if (openedThisSession) truth.opensAfterFree++; openedThisSession = true; }
      else if (ch.starved) truth.graces++;
      else if (spurtFirst && ch.playing && ch.count > 0) truth.appends++;
      if (n === 0) truth.emptyPackets++;
      spurtFirst = false;
      lines.push(`Voice - ${n} incoming samples added to channel 0`);
      if (schedule.unrelated === k) lines.push(UNRELATED);
      ch.add(new Float32Array(n));
      truth.packets++;
      if (k === schedule.last) { lastPacketTick = k; schedule = null; }
    }
    const was = ch.inUse, wasPlaying = ch.playing;
    ch.tick();
    if (!wasPlaying && ch.playing) truth.starts++;
    if (was && !ch.inUse) freedAt = k;
    if (ch.inUse) {
      marks.push({ line: lines.length, b: 2 * ch.count, packet, opened, playedBefore });
      lines.push(`Voice - chan 0, ent 1, bufsize: ${2 * ch.count}`);
      truth.ticks++;
    }
    if (!schedule && si === SCRIPT.length && !ch.inUse) break;
  }
  truth.dropped += ch.dropped;
  return { lines, marks, truth };
}

// ---------------------------------------------------------------------------------------
// The channel against the second model (tests/voicequeue/reference-channel.mjs), on seeded
// traffic in small rings, where every read, write and drop crosses the ring's end often.
// After every operation the two must agree on the state, the count, what was dropped and the
// gain's calls, and on every sample and tag of every pull; the full drops lists and gain
// logs are compared at the end of each case. Returns the counts and the first disagreement.

function differential(seeds) {
  const RINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 64, 513, 4411];
  const FPS = [5, 10, 30, 59.94, 66.67, 100, 144, 239.76, 300, 1000, 5000];
  const BUF = [0, 1, 50, 70, 100, 499, 1000, 9000];
  const FADE = [0.1, 0, 0.00002, 0.0001, 0.001, 0.05, 1];
  const seen = { cases: 0, ops: 0, packets: 0, pulls: 0, ticks: 0, opens: 0, frees: 0, longPackets: 0, drops: 0, dropsAcrossTheEnd: 0, readsAcrossTheEnd: 0, fades: 0, underruns: 0 };
  let bad = null;
  for (let seed = 1; seed <= seeds && !bad; seed++) {
    const r = mulberry32(0xD1FF0000 + seed), pick = (a) => a[Math.floor(r() * a.length)];
    const size = RINGS[seed % RINGS.length];
    const test = { ring: size };
    if (r() < 0.1) test.waitTicks = Math.floor(r() * 4);
    if (r() < 0.15) test.keepSample = true;
    if (r() < 0.15) test.noGrace = true;
    const opts = { fps: r() < 0.2 ? 5 + r() * 995 : pick(FPS), bufferMs: r() < 0.2 ? r() * 1200 : pick(BUF), fadeTime: pick(FADE), test };
    const logA = [], logB = [];
    const stub = (log) => ({ reset() { log.push('reset'); }, process(p) { log.push(`process ${p.length} ${p[0]}`); return Float32Array.from(p, (v) => v * 0.75); } });
    const withGain = r() < 0.5;
    const a = createChannel({ ...opts, gain: withGain ? stub(logA) : undefined });
    const b = createReferenceChannel({ ...opts, gain: withGain ? stub(logB) : null });
    seen.cases++;
    let tagNo = 0, head = 0, wasInUse = false;                 // head: where the module's ring is read
    const nOps = 100 + Math.floor(r() * 300);
    for (let o = 0; o < nOps && !bad; o++) {
      const u = r();
      let what;
      if (u < 0.3) {
        const v = r();
        let n = v < 0.1 ? 0 : v < 0.18 ? 1 : v < 0.25 ? 2 : v < 0.35 ? size + Math.floor(r() * 3) - 1
          : v < 0.42 ? size + 2 + Math.floor(r() * size) : Math.floor(r() * (1.5 * size + 3));
        if (v >= 0.35 && v < 0.42) seen.longPackets++;
        n = Math.min(n, 7000);
        const pcm = Float32Array.from({ length: n }, () => r() * 2 - 1);
        const w = r(), tag = w < 0.05 ? undefined : w < 0.1 ? 16777216 + tagNo++ : w < 0.5 ? Math.floor(r() * 3) : tagNo++;
        const before = b.count, droppedBefore = b.dropped, opened = !b.inUse;
        a.add(pcm.slice(), tag); b.add(pcm.slice(), tag);
        if (opened) head = 0;
        const lostOld = Math.min(b.dropped - droppedBefore, opened ? 0 : before);
        if (lostOld > 0) { seen.drops++; if (head + lostOld > size) seen.dropsAcrossTheEnd++; head = (head + lostOld) % size; }
        seen.packets++;
        what = `add ${n} tag ${tag}`;
      } else if (u < 0.62) {
        const k = r() < 0.05 ? 40 : 1;
        for (let i = 0; i < k; i++) { a.tick(); b.tick(); }
        seen.ticks += k;
        what = `tick x${k}`;
      } else {
        const v = r();
        const n = v < 0.06 ? 0 : v < 0.12 ? 1 : v < 0.18 ? 2 : v < 0.26 ? size - 1 : v < 0.34 ? size : v < 0.42 ? size + 1
          : v < 0.5 ? 512 : v < 0.55 ? 513 : Math.floor(r() * (2 * size + 5));
        const before = b.count, live = b.inUse && b.playing;
        const pa = a.pull(n), pb = b.pull(n);
        if (live) {
          const got = Math.min(n, before);
          if (got > 0 && head + got > size) seen.readsAcrossTheEnd++;
          head = (head + got) % size;
          if (got > 0 && before - got < Math.max(2, Math.floor(44100 * opts.fadeTime))) seen.fades++;
          if (got > 0 && got < n) seen.underruns++;
        }
        seen.pulls++;
        what = `pull ${n}`;
        if (pa.samples.length !== n || pa.tags.length !== n) bad = { seed, o, what, why: 'a pull of the wrong length' };
        for (let i = 0; !bad && i < n; i++) {
          if (!Object.is(pa.samples[i], pb.samples[i]) || pa.tags[i] !== pb.tags[i]) bad = { seed, o, what, why: `sample ${i}: ${pa.samples[i]} tag ${pa.tags[i]}, the model ${pb.samples[i]} tag ${pb.tags[i]}` };
        }
      }
      seen.ops++;
      if (wasInUse && !b.inUse) seen.frees++;
      wasInUse = b.inUse;
      const sa = [a.inUse, a.playing, a.starved, a.count, a.opens, a.dropped, a.waitTicks, logA.length].join();
      const sb = [b.inUse, b.playing, b.starved, b.count, b.opens, b.dropped, b.waitTicks, logB.length].join();
      if (!bad && sa !== sb) bad = { seed, o, what, why: `state ${sa}, the model ${sb}` };
    }
    if (!bad && JSON.stringify(a.drops) !== JSON.stringify(b.drops)) bad = { seed, what: 'the drops list', why: `${JSON.stringify(a.drops).slice(0, 200)}, the model ${JSON.stringify(b.drops).slice(0, 200)}` };
    if (!bad && logA.join('|') !== logB.join('|')) bad = { seed, what: 'the gain\'s calls', why: `${logA.slice(-3)}, the model ${logB.slice(-3)}` };
    seen.opens += b.opens;
  }
  return { seen, bad };
}

// Runs the log tool on a file; returns { status, out, err, fixture }.
function runTool(file, args) {
  const r = spawnSync(process.execPath, [TOOL, file, ...args], { encoding: 'utf8' });
  let fixture = null;
  if (r.status === 0) fixture = JSON.parse(r.stdout);
  return { status: r.status, out: r.stdout, err: r.stderr, fixture };
}

// Runs this script on a fixture file, replay only.
function runReplay(file) {
  const r = spawnSync(process.execPath, [SELF, '--fixture', file], { encoding: 'utf8', env: { ...process.env, [REPLAY_ONLY]: '1' } });
  return { status: r.status, out: r.stdout + r.stderr };
}

// ---------------------------------------------------------------------------------------
// The public checks.

function publicChecks() {
  const near = (a, b) => Math.abs(a - b) < 1e-12;
  const f32 = Math.fround;

  console.log('The module');
  {
    const src = fs.readFileSync(fileURLToPath(new URL('../voice-channel.js', import.meta.url)), 'utf8');
    const page = vm.createContext({}), worker = vm.createContext({ self: {} });
    vm.runInContext(src, page); vm.runInContext(src, worker);
    // W3-02a exported four names; W3-02b adds createTimeline.
    check('it loads as a page script and in a worker as TF2VoiceChannel, with no imports',
      ['VOICE_CHANNEL', 'waitTicks', 'latency', 'createChannel', 'createTimeline'].every((k) => k in page.TF2VoiceChannel && k in worker.self.TF2VoiceChannel)
      && Object.keys(V).join() === 'VOICE_CHANNEL,waitTicks,latency,createChannel,createTimeline' && !/\bimport\b|\brequire\(/.test(src));
    check('its constants are frozen: 22050, 0.015 s, 100 ms, 300 fps, 0.1 s, 512 and 513', Object.isFrozen(VOICE_CHANNEL) && Object.isFrozen(VOICE_CHANNEL.fpsRange)
      && VOICE_CHANNEL.ring === 22050 && VOICE_CHANNEL.tick === 0.015 && VOICE_CHANNEL.bufferMs === 100 && VOICE_CHANNEL.fps === 300
      && VOICE_CHANNEL.fadeTime === 0.1 && VOICE_CHANNEL.mixBlock === 512 && VOICE_CHANNEL.firstBlock === 513 && VOICE_CHANNEL.rate === 44100);
  }

  console.log('The wait and the latency');
  check('waitTicks: 7, 10, 30 at 66.67, 100, 300 fps', waitTicks(100, 66.67) === 7 && waitTicks(100, 100) === 10 && waitTicks(100, 300) === 30,
    `${waitTicks(100, 66.67)}, ${waitTicks(100, 100)}, ${waitTicks(100, 300)}`);
  check('waitTicks: 15 at 300 fps with voice_buffer_ms 50', waitTicks(50, 300) === 15);
  // 0.07 x 100 is 7.000000000000001 in doubles: the formula's - 1e-6 counts it as 7 ticks.
  check('waitTicks: 7 at 100 fps with voice_buffer_ms 70 (a product a rounding error above a whole number)', waitTicks(70, 100) === 7);
  check('waitTicks: 1 at 5 fps (a frame counts at most 0.1 s)', waitTicks(100, 5) === 1);
  check('waitTicks: voice_buffer_ms is limited to 1..5000 and the rate to 10..1000',
    waitTicks(0, 300) === 1 && waitTicks(10000, 300) === 1500 && waitTicks(100, 5000) === 100 && waitTicks(1000, 5) === 10,
    `${waitTicks(0, 300)}, ${waitTicks(10000, 300)}, ${waitTicks(100, 5000)}, ${waitTicks(1000, 5)}`);
  check('latency: 0.25, 0.295, 0.5 s at 66.67, 100, 300 fps', near(latency(100, 66.67), 0.25) && near(latency(100, 100), 0.295) && near(latency(100, 300), 0.5),
    `${latency(100, 66.67)}, ${latency(100, 100)}, ${latency(100, 300)}`);
  check('a channel takes its wait from its settings', createChannel({ fps: 100 }).waitTicks === 10 && createChannel().waitTicks === 30
    && createChannel({ fps: 300, bufferMs: 50 }).waitTicks === 15);

  console.log('By hand: 7056 samples on tick 0, then 2646 on ticks 4, 8, ..., 28; add, tick, no pulls until it plays');
  {
    const ch = createChannel({ fps: 300 });
    let playsAt = -1, fullFrom = -1, fullStays = true;
    for (let k = 0; k <= 29; k++) {
      if (k === 0) ch.add(new Float32Array(7056), 0);
      else if (k % 4 === 0) ch.add(new Float32Array(2646), k / 4);
      ch.tick();
      if (ch.playing && playsAt < 0) playsAt = k;
      if (fullFrom < 0 && ch.count === 22050) fullFrom = k;
      else if (fullFrom >= 0 && ch.count !== 22050) fullStays = false;
    }
    check('300 fps: playing from tick 29', playsAt === 29, `tick ${playsAt}`);
    check('300 fps: the ring holds 22050 from the packet of tick 24 on', fullFrom === 24 && fullStays, `from tick ${fullFrom}`);
    check('300 fps: 7055 + 7 x 2645 - 22050 = 3520 samples dropped, the oldest: the first packet\'s', ch.dropped === 3520
      && JSON.stringify(ch.drops) === JSON.stringify([{ pulled: 0, count: 875, tag: 0 }, { pulled: 0, count: 2645, tag: 0 }]), JSON.stringify(ch.drops));
  }
  {
    // At 67 fps it plays on tick 6; from then on a mixer takes a block of 512 every 512
    // samples (513 the first), so the rest of the packets are played, not dropped.
    const ch = createChannel({ fps: 66.67 });
    let playsAt = -1, countThen = -1, droppedThen = -1, block = 0, first = true;
    for (let k = 0; k <= 28; k++) {
      while (1024 * block < 1323 * k) { if (ch.playing) { ch.pull(first ? 513 : 512); first = false; } block++; }
      if (k === 0) ch.add(new Float32Array(7056));
      else if (k % 4 === 0) ch.add(new Float32Array(2646));
      ch.tick();
      if (ch.playing && playsAt < 0) { playsAt = k; countThen = ch.count; droppedThen = ch.dropped; }
    }
    check('67 fps: playing on tick 6 with 9700 queued and nothing dropped', playsAt === 6 && countThen === 9700 && droppedThen === 0,
      `tick ${playsAt}, ${countThen} queued`);
    check('67 fps: nothing dropped through tick 28 once a mixer plays it', ch.dropped === 0 && ch.drops.length === 0, `${ch.count} queued at tick 28`);
  }

  console.log('Packets, overflow and tags');
  {
    const ch = createChannel();
    ch.add(new Float32Array(0));
    check('an empty packet opens a channel and writes nothing', ch.inUse && ch.opens === 1 && ch.count === 0 && !ch.playing);
    ch.add(new Float32Array(1));
    check('a packet of one sample writes nothing; a packet of n writes n - 1', ch.count === 0 && (ch.add(new Float32Array(10)), ch.count === 9) && ch.opens === 1);
    const early = ch.pull(4);
    check('a waiting channel gives zeros and keeps its queue', early.samples.every((v) => v === 0) && early.tags.every((t) => t === -1) && ch.count === 9 && !ch.starved);
    check('its state is read-only', ['inUse', 'playing', 'starved', 'count', 'opens', 'waitTicks', 'dropped', 'drops'].every((k) => {
      const d = Object.getOwnPropertyDescriptor(ch, k); return d && d.get && !d.set;
    }) && Object.isFrozen(ch));
  }
  {
    // 6000 of tag 0 queued and 100 of them played (5900 stay: above the fade), 16150 of tag 1
    // fill the ring, then 7000 of tag 2 overflow it: the oldest 7000 go, 5900 of tag 0 and
    // 1100 of tag 1. "Pulled so far" counts every sample pull() returned, the 64 zeros a
    // mixer took while the channel waited included: the output position.
    const ch = createChannel({ fps: 300 });
    const a = Float32Array.from({ length: 6001 }, (_, i) => i), b = Float32Array.from({ length: 16151 }, (_, i) => 10000 + i);
    ch.add(a, 0);
    ch.pull(64);
    for (let k = 0; k < 30; k++) ch.tick();
    const head = ch.pull(100);
    check('the packet\'s first sample is left out: the ring holds samples 1..n-1', head.samples[0] === 1 && head.samples[99] === 100 && head.tags.every((t) => t === 0));
    ch.add(b, 1);
    check('a packet that fills the ring exactly drops nothing', ch.count === 22050 && ch.dropped === 0 && ch.drops.length === 0);
    ch.add(new Float32Array(7001).fill(5), 2);
    check('an overflow drops the oldest, recorded per tag with the samples pulled so far', ch.dropped === 7000 && ch.count === 22050
      && JSON.stringify(ch.drops) === JSON.stringify([{ pulled: 164, count: 5900, tag: 0 }, { pulled: 164, count: 1100, tag: 1 }]), JSON.stringify(ch.drops));
    const rest = ch.pull(22050);
    check('what is left is the newest: tag 1 from its sample 1101, then tag 2', rest.samples[0] === 11101 && rest.tags[0] === 1
      && rest.tags[15049] === 1 && rest.samples[15049] === 10000 + 16150 && rest.tags[15050] === 2 && rest.tags[22049] === 2);
  }

  console.log('The fade (packets written whole with test.keepSample, pulls of 512)');
  for (const N of [4410, 8820]) {
    const ch = createChannel({ fps: 300, test: { keepSample: true } });
    ch.add(new Float32Array(N).fill(1));
    for (let k = 0; k < 30; k++) ch.tick();
    const out = [];
    while (out.length < N) out.push(...ch.pull(512).samples);
    let bad = -1;
    for (let k = 0; k < N && bad < 0; k++) if (out[k] !== f32(Math.min(1, (N - 1 - k) / 4409))) bad = k;
    check(`${N} samples of 1.0 come out as min(1, (N - 1 - k) / 4409)`, bad < 0, bad < 0 ? '' : `first wrong at ${bad}: ${out[bad]}`);
    if (N === 4410) check('  1 at k = 0, 4408/4409 at k = 1, 0 at the last', out[0] === 1 && out[1] === f32(4408 / 4409) && out[N - 1] === 0);
    else check('  the first 4411 are 1 and sample 4411 is 4408/4409', out.slice(0, 4411).every((v) => v === 1) && out[4411] === f32(4408 / 4409));
  }

  console.log('The underrun');
  {
    const queued = () => {
      const ch = createChannel({ fps: 300 });
      const pcm = new Float32Array(201).fill(1); pcm[0] = 9;
      ch.add(pcm, 7);
      for (let k = 0; k < 30; k++) ch.tick();
      return ch;
    };
    let ch = queued();
    const { samples, tags } = ch.pull(512);
    let bad = -1;
    for (let k = 0; k < 200 && bad < 0; k++) if (samples[k] !== f32((199 - k) / 4409) || samples[200 + k] !== samples[k] || tags[k] !== 7 || tags[200 + k] !== -1) bad = k;
    check('200 queued, pull(512): the 200 faded as (199 - k) / 4409, the same 200 again, then 112 zeros', bad < 0
      && samples.subarray(400).every((v) => v === 0) && tags.subarray(400).every((t) => t === -1), bad < 0 ? '' : `first wrong at ${bad}`);
    check('the pull that empties the ring marks the channel starved', ch.starved && ch.inUse && ch.playing);
    ch.tick();
    check('the next tick frees it', !ch.inUse && !ch.playing);
    const silent = ch.pull(64);
    check('a free channel gives zeros tagged -1', silent.samples.every((v) => v === 0) && silent.tags.every((t) => t === -1));
    ch = queued();
    ch.pull(512);
    ch.add(new Float32Array(101).fill(2), 8);
    ch.tick();
    check('a packet before that tick keeps it, playing with no wait', ch.inUse && ch.playing && !ch.starved && ch.opens === 1 && ch.count === 100);
    const next = ch.pull(64);
    let bad2 = -1;
    for (let k = 0; k < 64 && bad2 < 0; k++) if (next.samples[k] !== f32(2 * (99 - k) / 4409) || next.tags[k] !== 8) bad2 = k;
    check('and the next pull reads the new packet', bad2 < 0, bad2 < 0 ? '' : `first wrong at ${bad2}`);
    // More read than missing: the repeat is the last of what was read, as many as are missing.
    const ch4 = createChannel({ fps: 300 });
    ch4.add(Float32Array.from({ length: 401 }, (_, i) => i), 5);
    for (let k = 0; k < 30; k++) ch4.tick();
    const four = ch4.pull(512).samples;
    let bad4 = -1;
    for (let k = 0; k < 512 && bad4 < 0; k++) {
      const want = k < 400 ? f32((k + 1) * ((399 - k) / 4409)) : four[k - 112];
      if (four[k] !== want) bad4 = k;
    }
    check('400 queued, pull(512): the 400 faded, then their last 112 once more', bad4 < 0 && four[400] === four[288] && four[511] === four[399], bad4 < 0 ? '' : `first wrong at ${bad4}`);
  }

  console.log('The gain is called as the engine calls it');
  {
    const calls = [];
    const gain = {
      reset() { calls.push('reset'); },
      process(pcm) { calls.push(`process ${pcm.length} ${pcm[0]}`); return Float32Array.from(pcm, (v) => 2 * v); },
    };
    const packet = (n, firstValue) => { const p = new Float32Array(n).fill(1); p[0] = firstValue; return p; };
    const ch = createChannel({ fps: 300, gain });
    ch.add(packet(100, 11));                          // opens
    for (let k = 0; k < 30; k++) ch.tick();
    const played = ch.pull(50).samples[0];
    ch.add(packet(50, 22));                           // appended
    ch.pull(ch.count);
    ch.add(packet(30, 33));                           // the grace
    ch.tick();
    ch.pull(ch.count);
    ch.tick();                                        // freed
    ch.add(packet(20, 44));                           // opens again
    const want = ['reset', 'process 100 11', 'process 50 22', 'process 30 33', 'reset', 'process 20 44'];
    check('reset() once per open, never on an append or a grace; process() once per packet, in order, whole',
      JSON.stringify(calls) === JSON.stringify(want) && ch.opens === 2, calls.join(', '));
    check('what the gain returns is what is queued', played === f32(2 * 98 / 4409), `${played}`);
    const plain = createChannel({ fps: 300 });
    const p = packet(10, 3);
    plain.add(p);
    check('without a gain the samples pass unchanged', plain.count === 9 && p[0] === 3);
  }

  console.log('What the logs cannot show, case by case (the review\'s cases A to I)');
  {
    const ramp = (n, from) => Float32Array.from({ length: n }, (_, i) => from + i);
    const toPlay = (ch) => { for (let k = 0; k < 1000 && !ch.playing; k++) ch.tick(); return ch; };
    const list = (x) => Array.from(x).join(',');
    // A: ring 10, a read that wraps the ring's end and the read after it.
    {
      const ch = createChannel({ fadeTime: 0, test: { ring: 10 } });
      ch.add(ramp(9, 100), 1); toPlay(ch); ch.pull(6);
      ch.add(ramp(9, 200), 2);
      const across = list(ch.pull(6).samples);
      ch.add(ramp(5, 300), 3);
      const next = list(ch.pull(4).samples);
      check('A. ring 10: a read across the ring\'s end, then the next read', `${across} | ${next}` === '107,108,201,202,203,204 | 205,206,207,208', `${across} | ${next}`);
    }
    // B: ring 10, an overflow whose oldest samples straddle the ring's end.
    {
      const ch = createChannel({ fadeTime: 0, test: { ring: 10 } });
      ch.add(ramp(9, 100), 1); toPlay(ch); ch.pull(6);
      ch.add(ramp(6, 200), 2); ch.pull(2);
      ch.add(ramp(9, 300), 3);
      const out = list(ch.pull(10).samples);
      check('B. ring 10: an overflow that drops across the ring\'s end keeps the newest', out === '204,205,301,302,303,304,305,306,307,0'
        && ch.dropped === 3 && JSON.stringify(ch.drops) === JSON.stringify([{ pulled: 8, count: 3, tag: 2 }]), `${out}; ${JSON.stringify(ch.drops)}`);
    }
    // C: an empty packet (a key press) opens a channel with nothing behind it.
    {
      const ch = createChannel({ fps: 66.67 });
      ch.add(new Float32Array(0), 1);
      for (let k = 0; k < 7; k++) ch.tick();
      const playing = ch.playing;
      ch.pull(512);
      const starved = ch.starved;
      ch.tick();
      check('C. an empty packet, its wait, a pull that reads nothing: starved, then freed', playing && starved && !ch.inUse, `playing ${playing}, starved ${starved}, in use after the tick ${ch.inUse}`);
      // pull(0) is the pseudo-code as written: an empty playing ring is starved by it too (a
      // fixture's 2, 0 is replayed as no pull at all).
      const zero = createChannel({ fps: 66.67 });
      zero.add(new Float32Array(0), 1);
      for (let k = 0; k < 7; k++) zero.tick();
      zero.pull(0);
      check('C. and so is a pull of 0 samples', zero.starved, `starved ${zero.starved}`);
    }
    // D, E, F: other voice_fadeouttime values: fade = max(2, floor(44100 x fadeTime)).
    const fadeOut = (fadeTime, n, take) => {
      const ch = createChannel({ fps: 300, fadeTime, test: { keepSample: true } });
      ch.add(new Float32Array(n).fill(1));
      toPlay(ch);
      return ch.pull(take).samples;
    };
    {
      const o = fadeOut(0.05, 2205, 2205);
      check('D. fadeTime 0.05 fades 2205 samples: 2205 of 1.0 give 1, 2203/2204, ..., 0', o[0] === 1 && o[1] === f32(2203 / 2204) && o[2204] === 0, `${o[0]}, ${o[1]}, ${o[2204]}`);
    }
    {
      const o = fadeOut(0.0999, 4405, 4405);
      check('E. fadeTime 0.0999 fades floor(4405.59) = 4405 samples: sample 1 is 4403/4404', o[1] === f32(4403 / 4404), `${o[1]}`);
    }
    {
      const o = fadeOut(0, 5, 5);
      check('F. fadeTime 0 fades max(2, 0) = 2 samples: 5 of 1.0 give 1,1,1,1,0', list(o) === '1,1,1,1,0', list(o));
    }
    // G: the fade window's edge: 4408 left after a read is under the fade.
    {
      const o = fadeOut(0.1, 4410, 2);
      check('G. 4410 of 1.0, pull(2): 4408 stay, so sample 1 is 4408/4409', o[0] === 1 && o[1] === f32(4408 / 4409), `${o[0]}, ${o[1]}`);
    }
    // H: a packet longer than the ring (none comes from the game: Steam's decoder writes at
    // most 11264 samples): the queue goes, then the packet's oldest; the newest 5 stay.
    {
      const ch = createChannel({ fadeTime: 0, test: { ring: 5 } });
      ch.add(ramp(4, 0), 1); toPlay(ch);
      ch.add(ramp(9, 10), 2);
      const out = list(ch.pull(5).samples);
      check('H. ring 5: 3 queued, then a packet of 9 (8 kept): the 3, then the packet\'s oldest 3, are dropped', out === '14,15,16,17,0' && ch.dropped === 6
        && JSON.stringify(ch.drops) === JSON.stringify([{ pulled: 0, count: 3, tag: 1 }, { pulled: 0, count: 3, tag: 2 }]), `${out}; ${JSON.stringify(ch.drops)}`);
    }
    // I: tags are kept as doubles: a sample position past 2^24 (a render of 6.3 minutes) comes back whole.
    {
      const ch = createChannel({ fps: 300 });
      ch.add(ramp(22051, 0), 16777217); toPlay(ch);
      ch.add(ramp(11, 0), 16777219);
      const t = ch.pull(1).tags[0], d = ch.drops[0];
      const other = createChannel({ fps: 300 });
      other.add(ramp(3, 0), 'not a number'); toPlay(other);
      check('I. a tag above 2^24 comes back exact, in a pull and in a drop; a tag that is not a number is -1', t === 16777217 && d.tag === 16777217 && other.pull(1).tags[0] === -1,
        `${t}, ${d.tag}`);
    }
    {
      const log = [];
      const ch = createChannel({ gain: { reset() { log.push('reset'); }, process(p) { log.push(`process ${p.length}`); return p; } } });
      ch.add(new Float32Array(0)); ch.add(new Float32Array(3));
      check('the gain runs on an empty packet too: once per packet', log.join(', ') === 'reset, process 0, process 3', log.join(', '));
    }
  }

  console.log('The channel against a second model, written with plain arrays (tests/voicequeue/reference-channel.mjs)');
  {
    let grid = 0;
    for (const bm of [0, 0.5, 1, 33.3, 50, 70, 99.9999999, 100, 100.0000001, 499, 500, 1000, 4999, 5000, 9000]) {
      for (const fps of [0.5, 5, 10, 30, 59.94, 60, 66.666, 66.67, 67, 100, 143.88, 143.9, 144, 200, 239.76, 240, 300, 999.9, 1000, 5000]) {
        if (waitTicks(bm, fps) !== referenceWaitTicks(bm, fps) || latency(bm, fps) !== referenceLatency(bm, fps)) grid++;
      }
    }
    check('waitTicks and latency agree with the model on a grid of 300 settings', grid === 0, `${grid} differ`);
    const t0 = Date.now();
    const { seen, bad } = differential(320);
    check('320 seeded cases in rings of 1 to 13, 64, 513 and 4411 samples: every state and every pulled sample and tag agree', !bad && seen.readsAcrossTheEnd > 1000 && seen.dropsAcrossTheEnd > 100,
      bad ? `seed ${bad.seed}, operation ${bad.o}, ${bad.what}: ${bad.why}` : `${seen.ops} operations: ${seen.packets} packets (${seen.longPackets} longer than the ring), ${seen.pulls} pulls, ${seen.ticks} ticks; `
        + `${seen.opens} opens, ${seen.frees} frees, ${seen.drops} overflows (${seen.dropsAcrossTheEnd} across the ring's end), ${seen.readsAcrossTheEnd} reads across it, `
        + `${seen.fades} fades, ${seen.underruns} underruns; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }

  console.log('The log tool, event for event, on three logs worked by hand');
  {
    const P = (n) => `Voice - ${n} incoming samples added to channel 0`, T = (b) => `Voice - chan 0, ent 1, bufsize: ${b}`;
    // 66.67 fps, a wait of 7 ticks: an open, its wait (the mixer's demand made up: 512 and
    // 1024 in turn), a demand read from the log, a grace, a free nobody printed and a new
    // channel (the made-up demand runs on from one counter), a new session.
    // The grace's queue falls on the third step after it (the mixer took nothing for two).
    const h1 = [P(101), T(200), T(200), T(200), T(200), T(200), T(200), T(200), T(100), P(51), T(100), T(100), T(100), T(40), P(31), T(60), T(60), T(60), T(60),
      UNRELATED, UNRELATED, P(11), T(20), T(20)];
    const e1 = [1, 101, 3, 200, 2, 512, 3, 200, 2, 1024, 3, 200, 2, 512, 3, 200, 2, 1024, 3, 200, 2, 512, 3, 200, 2, 1024, 3, 200,
      2, 50, 3, 100, 2, 1024, 1, 51, 3, 100, 2, 0, 3, 100, 2, 0, 3, 100, 2, 30, 3, 40, 2, 1024, 3, -1, 1, 31, 3, 60, 2, 512, 3, 60, 2, 1024, 3, 60, 2, 512, 3, 60,
      0, 0, 1, 11, 3, 20, 2, 1024, 3, 20];
    const g1 = logToFixture(h1.join('\n'), { fps: 66.67 });
    check('open, wait, demand, grace, unseen free, session: the events are the order\'s', JSON.stringify(g1.fixture.sections[0].events) === JSON.stringify(e1),
      JSON.stringify(g1.fixture.sections[0].events));
    // 10 fps, a wait of 1 tick: overflows that hide the demand, read as 512 (1024 to 2047
    // bytes over the ring), 1024 (2048 or more) and 0 (less).
    const h2 = [P(20001), T(40000), P(3001), T(44100), T(43076), P(1765), T(44100), P(442), T(44100), T(44100), T(42052)];
    const e2 = [1, 20001, 3, 40000, 2, 512, 1, 3001, 3, 44100, 2, 512, 3, 43076, 2, 1024, 1, 1765, 3, 44100, 2, 0, 1, 442, 3, 44100,
      2, 0, 3, 44100, 2, 1024, 3, 42052];
    const g2 = logToFixture(h2.join('\n'), { fps: 10 });
    check('an overflow hides the demand: 512, 1024 or 0 by what went over', JSON.stringify(g2.fixture.sections[0].events) === JSON.stringify(e2),
      JSON.stringify(g2.fixture.sections[0].events));
    // 40 fps, a wait of 4 ticks: a channel opened after an unseen free first falls on the
    // fourth step after its packet, outside the three the test looks at.
    const h3 = [P(101), T(200), T(200), T(200), T(200), T(100), P(31), T(60), T(60), T(60), T(60), T(20)];
    const e3 = [1, 101, 3, 200, 2, 512, 3, 200, 2, 1024, 3, 200, 2, 512, 3, 200, 2, 50, 3, 100,
      2, 1024, 3, -1, 1, 31, 3, 60, 2, 1024, 3, 60, 2, 512, 3, 60, 2, 1024, 3, 60, 2, 20, 3, 20];
    const g3 = logToFixture(h3.join('\n'), { fps: 40 });
    check('the grace and the new channel are told apart by the next three steps, no more', JSON.stringify(g3.fixture.sections[0].events) === JSON.stringify(e3),
      JSON.stringify(g3.fixture.sections[0].events));
    const bare = replayFixture({ sections: [{ fps: 66.67, events: g1.fixture.sections[0].events }] })[0];
    check('a fixture section without a name or bufferMs replays at voice_buffer_ms 100', bare.name === 'section 1' && bare.waitTicks === 7 && bare.engine.bad === 0);
    const both = replayFixture({ sections: [g1.fixture.sections[0], g2.fixture.sections[0], g3.fixture.sections[0]] });
    check('and all three replay cleanly', both.every((r) => r.engine.bad === 0), both.map((r) => `${r.engine.ticks} ticks`).join(', '));

    // The rules' edges, each a log worked by hand at 66.67 fps (a wait of 7) unless said.
    const events = (lines, fps = 66.67) => JSON.stringify(logToFixture(lines.join('\n'), { fps }).fixture.sections[0].events);
    const wait7 = [P(101), T(200), T(200), T(200), T(200), T(200), T(200), T(200)];
    const made7 = [1, 101, 3, 200, 2, 512, 3, 200, 2, 1024, 3, 200, 2, 512, 3, 200, 2, 1024, 3, 200, 2, 512, 3, 200, 2, 1024, 3, 200];
    const opens6000 = [P(3001), T(6000), T(6000), T(6000), T(6000), T(6000), T(6000), T(6000)];
    const made6000 = [1, 3001, 3, 6000, 2, 512, 3, 6000, 2, 1024, 3, 6000, 2, 512, 3, 6000, 2, 1024, 3, 6000, 2, 512, 3, 6000, 2, 1024, 3, 6000];
    // A queue of 4096 bytes before the ring is found empty is a grace (or a free); 4098 is not.
    const at4096 = [...opens6000, T(4096), P(51), T(100), T(40)], at4098 = [...opens6000, T(4098), P(51), T(100), T(40)];
    const e4096 = [...made6000, 2, 952, 3, 4096, 2, 1024, 1, 51, 3, 100, 2, 30, 3, 40];
    const e4098 = [...made6000, 2, 951, 3, 4098, 2, 2049, 1, 51, 3, 100, 2, 30, 3, 40];
    const replay4096 = replayFixture(logToFixture(at4096.join('\n'), { fps: 66.67 }).fixture)[0].engine.bad;
    check('edge: a queue of 4096 bytes before it is found empty may be a grace, 4098 may not', events(at4096) === JSON.stringify(e4096) && events(at4098) === JSON.stringify(e4098)
      && replay4096 > 0, `${events(at4096)}; ${events(at4098)}; the 4096 case's replay mismatches on ${replay4096} ticks (the order's 1024 cannot empty 2048 samples)`);
    // An overflow that hides the demand, at 1024 and 2048 bytes over the ring and just under.
    const over = [P(20001), T(40000), P(2563), T(44100), P(512), T(44100), P(1025), T(44100), P(1024), T(44100)];
    const eOver = [1, 20001, 3, 40000, 2, 512, 1, 2563, 3, 44100, 2, 0, 1, 512, 3, 44100, 2, 1024, 1, 1025, 3, 44100, 2, 512, 1, 1024, 3, 44100];
    check('edge: 1024 bytes over the ring is 512, 1022 is 0; 2048 is 1024, 2046 is 512', events(over, 10) === JSON.stringify(eOver), events(over, 10));
    // The next three steps end at a session break: what follows it is another channel.
    const atBreak = [...wait7, T(100), P(31), T(60), T(60), UNRELATED, UNRELATED, P(11), T(20), T(20)];
    const eBreak = [...made7, 2, 50, 3, 100, 2, 1024, 3, -1, 1, 31, 3, 60, 2, 512, 3, 60, 0, 0, 1, 11, 3, 20, 2, 1024, 3, 20];
    check('edge: the next three steps stop at a session break', events(atBreak) === JSON.stringify(eBreak), events(atBreak));
    // A new channel that overflows while it waits does not fall: 44100 is not below the cap.
    const atCap = [...wait7, T(100), P(20001), T(40000), P(3001), T(44100), T(44100), T(44100)];
    const eCap = [...made7, 2, 50, 3, 100, 2, 1024, 3, -1, 1, 20001, 3, 40000, 2, 512, 1, 3001, 3, 44100, 2, 1024, 3, 44100, 2, 512, 3, 44100];
    check('edge: a queue held at the 44100 cap does not fall', events(atCap) === JSON.stringify(eCap), events(atCap));
    // The first step after the wait (the 8th tick line) is already a playing one.
    const firstPlaying = [...wait7, P(101), T(200), T(100)];
    const eFirst = [...made7, 2, 1024, 1, 101, 3, 200, 2, 50, 3, 100];
    check('edge: the first tick line after the wait can show a grace', events(firstPlaying) === JSON.stringify(eFirst), events(firstPlaying));
  }

  console.log('The synthetic console log, the log tool and the replay');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf2ve-voicequeue-'));
  try {
    const run300 = synthesize({ fps: 300, seed: 0x5EED300 });
    const run67 = synthesize({ fps: 66.67, seed: 0x5EED067 });
    const t = run300.truth;
    check('the 300 fps log has two opens, one after an unseen free, an append, a grace, an overflow, an empty packet and a second session',
      t.opens >= 2 && t.opensAfterFree >= 1 && t.appends >= 1 && t.graces >= 1 && t.emptyPackets === 1 && t.sessions === 1
      && run300.lines.filter((l) => l === UNRELATED).length === 4 && run300.lines.join('\n').includes('channel 0\nVoice - chan 0, ent 1, bufsize: 44100'),
      `${t.packets} packets, ${t.ticks} ticks, ${t.opens} opens (${t.opensAfterFree} after a free), ${t.appends} appends, ${t.graces} graces, ${t.starts} starts`);
    const log300 = path.join(dir, 'console300.log');
    fs.writeFileSync(log300, `${run300.lines.join('\n')}\n`);
    const tool = runTool(log300, ['--fps', '300', '--name', 'synthetic-300']);
    check('log-to-fixture reads it', tool.status === 0, tool.err.trim());
    const section = tool.fixture.sections[0];
    const own = logToFixture(fs.readFileSync(log300, 'latin1'), { fps: 300 }).stats;
    check('it finds what the channel did: the packets, ticks, opens, frees nobody printed, graces, the empty packet and the session',
      own.packets === t.packets && own.ticks === t.ticks && own.opens === t.opens && own.opensAfterFree === t.opensAfterFree
      && own.graces === t.graces && own.emptyPackets === 1 && own.sessions === 1, tool.err.trim());
    check('its output is numbers and its own words only', Object.keys(tool.fixture).join() === 'about,sections' && Object.keys(section).join() === 'name,fps,bufferMs,events'
      && section.events.every(Number.isInteger) && !tool.out.includes('qXz') && !tool.err.includes('qXz') && section.name === 'synthetic-300' && section.fps === 300 && section.bufferMs === 100);
    const rows = replayFixture(tool.fixture), r = rows[0];
    // Ticks: the bufsize lines and, before each new channel after an unseen free, that free.
    check('the replay matches every tick', r.engine.bad === 0 && r.engine.ticks === t.ticks + t.opensAfterFree && r.engine.packets === t.packets && r.engine.opens === t.opens,
      `${r.engine.ticks} ticks, ${r.engine.packets} packets, ${r.engine.opens} opens`);
    check('each of the six faults mismatches', r.faults.every((f) => f.bad > 0), r.faults.map((f) => `${f.label} ${f.bad}`).join(', '));

    // The same log at 66.67 fps, in a file of marked sections with Windows line ends.
    const marked = path.join(dir, 'console-marked.log');
    fs.writeFileSync(marked, ['] echo MARK67', 'MARK67', ...run67.lines, '] echo MARK300', 'MARK300', ...run300.lines, 'MARKEND', 'Voice - 10 incoming samples added to channel 0'].join('\r\n'));
    const tool67 = runTool(marked, ['--section', 'MARK67', '--fps', '66.67']);
    const rows67 = tool67.status === 0 ? replayFixture(tool67.fixture) : null;
    check('a second log at 66.67 fps, read as a marked section, replays cleanly', tool67.status === 0 && rows67[0].engine.bad === 0
      && rows67[0].engine.ticks === run67.truth.ticks + run67.truth.opensAfterFree && rows67[0].engine.opens === run67.truth.opens && rows67[0].waitTicks === 7 && tool67.fixture.sections[0].name === 'MARK67',
      tool67.status === 0 ? `${rows67[0].engine.ticks} ticks, ${rows67[0].engine.opens} opens, ${run67.truth.graces} graces, ${run67.truth.dropped} dropped` : tool67.err.trim());
    const again = runTool(marked, ['--section', 'MARK300', '--fps', '300']);
    check('a marked section reads only up to the next MARK line', again.status === 0 && JSON.stringify(again.fixture.sections[0].events) === JSON.stringify(section.events));

    // One bufsize changed by 2 bytes, at four kinds of line (the generator's own record says
    // which line is which). A change on a line where the mixer took something while the
    // channel played moves one sample of demand from one tick to the next: the log cannot
    // tell it from a true one, and the order's rules do not ask the tool to.
    const marks = run300.marks;
    const changedLog = (m) => { const c = run300.lines.slice(); c[m.line] = `Voice - chan 0, ent 1, bufsize: ${m.b + 2}`; return c; };
    const outcome = (c) => {
      const file = path.join(dir, 'changed.log');
      fs.writeFileSync(file, `${c.join('\n')}\n`);
      const x = runTool(file, ['--fps', '300']);
      if (x.status !== 0) return { stopped: true, why: x.err.trim() };
      return { stopped: false, bad: replayFixture(x.fixture)[0].engine.bad };
    };
    const opening = marks.findIndex((m) => m.opened);
    const cases = [
      ['at an opening', marks[opening]],
      ['during a wait', marks.find((m, j) => j > opening && !m.playedBefore && !m.opened)],
      ['at the ring\'s limit, with a packet, while playing', marks.find((m) => m.playedBefore && m.b === 44100 && m.packet !== null)],
      ['where the playing channel\'s mixer took nothing', marks.find((m, j) => j > 0 && m.playedBefore && m.packet === null && m.b === marks[j - 1].b && m.b > 4096 && marks[j - 1].line === m.line - 1)],
    ];
    for (const [where, m] of cases) {
      const o = m ? outcome(changedLog(m)) : { stopped: false, bad: 0 };
      check(`one bufsize changed by 2, ${where}: the tool stops or the replay fails`, !!m && (o.stopped || o.bad > 0), o.stopped ? o.why : `${o.bad} mismatching ticks`);
    }

    // What the tool refuses.
    const refuse = (name, text, args, expect) => {
      const file = path.join(dir, 'refused.log');
      fs.writeFileSync(file, text);
      const x = runTool(file, args);
      check(`the tool stops: ${name}`, x.status !== 0 && expect.test(x.err) && !x.err.includes('qXz') && x.out === '', x.err.trim());
    };
    const P = (n) => `Voice - ${n} incoming samples added to channel 0`, T = (b) => `Voice - chan 0, ent 1, bufsize: ${b}`;
    refuse('two packet lines before a tick line', [P(100), T(198), P(100), P(100), T(594)].join('\n'), ['--fps', '300'], /second packet line/);
    refuse('a packet line with no tick line', [P(100), T(198), P(100)].join('\n'), ['--fps', '300'], /no tick line/);
    refuse('a tick line before any packet', [T(198), P(100), T(396)].join('\n'), ['--fps', '300'], /no channel/);
    refuse('a session break between a packet and its tick line', [P(100), T(198), P(100), UNRELATED, UNRELATED, T(396)].join('\n'), ['--fps', '300'], /another session/);
    refuse('a second speaker', [P(100), T(198), 'Voice - chan 1, ent 3, bufsize: 198'].join('\n'), ['--fps', '300'], /second channel/);
    refuse('a second speaker on the same channel number', [P(100), T(198), 'Voice - chan 0, ent 3, bufsize: 198'].join('\n'), ['--fps', '300'], /second channel/);
    refuse('a grace at a wait of 3 ticks, which cannot be told from a new channel', [P(101), T(200), T(200), T(200), T(100), P(51), T(100), T(40)].join('\n'), ['--fps', '30'], /cannot be told/);
    refuse('an odd number of bytes leaving the queue', [P(100), T(198), ...Array(29).fill(T(198)), T(197)].join('\n'), ['--fps', '300'], /cannot go/);
    refuse('pull lines (voice_showchannels 2)', [P(100), 'Voice - mixed 512 samples from channel 0', T(198)].join('\n'), ['--fps', '300'], /showchannels 2/);
    refuse('a marker that is not there', [P(100), T(198)].join('\n'), ['--fps', '300', '--section', 'MARK99'], /marker/);
    refuse('no frame rate', [P(100), T(198)].join('\n'), [], /--fps/);
    refuse('a new channel whose queue is not its packet', [P(100), T(200)].join('\n'), ['--fps', '300'], /new channel holds/);
    refuse('the queue falling while it waits', [P(100), T(198), T(196)].join('\n'), ['--fps', '300'], /during the wait/);
    refuse('a queue that cannot come from its packets', [P(100), T(198), ...Array(29).fill(T(198)), T(100), T(102)].join('\n'), ['--fps', '300'], /cannot go/);

    // What a log may hold that the game does not write.
    {
      const base = [P(100), T(198), T(198)];
      const twoParts = ['MARK67', ...base, 'MARK6 ', P(30), T(58), 'MARKEND'].join('\r\n');
      const file = path.join(dir, 'markers.log');
      fs.writeFileSync(file, twoParts);
      const x = runTool(file, ['--fps', '300', '--section', 'MARK6']);
      check('--section is the line that is the marker, trimmed: MARK6 does not read MARK67\'s part', x.status === 0
        && JSON.stringify(x.fixture.sections[0].events) === JSON.stringify([1, 30, 3, 58]), x.status === 0 ? JSON.stringify(x.fixture.sections[0].events) : x.err.trim());
      fs.writeFileSync(file, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(`${base.join('\n')}\n`)]));
      const bom = runTool(file, ['--fps', '300']);
      check('a byte-order mark before the first line is not part of it', bom.status === 0 && JSON.stringify(bom.fixture.sections[0].events) === JSON.stringify([1, 100, 3, 198, 2, 512, 3, 198]), bom.err.trim());
      fs.writeFileSync(file, base.join('\n'));
      const cut = runTool(file, ['--fps', '300']);
      fs.writeFileSync(file, `${base.join('\n')}\n`);
      const whole = runTool(file, ['--fps', '300']);
      check('a last line with no line end is read, and said', cut.status === 0 && cut.fixture.sections[0].events.length === 8 && /no line end/.test(cut.err)
        && whole.status === 0 && !/no line end/.test(whole.err), cut.err.trim());
      const secret = 'qXzPrivate';
      for (const [what, line] of [['a negative number', 'Voice - chan 0, ent 1, bufsize: -2'], ['ten digits', 'Voice - chan 0, ent 1, bufsize: 1234567890'],
        ['a space before it', ' Voice - chan 0, ent 1, bufsize: 198'], ['a tab before it', '\tVoice - 100 incoming samples added to channel 0'],
        ['cut short', 'Voice - chan 0, ent 1, bufsiz'], ['text after it', `Voice - chan 0, ent 1, bufsize: 198 ${secret}`], ['a signed packet', `Voice - -5 incoming samples added to channel 0 ${secret}`]]) {
        fs.writeFileSync(file, `${[P(100), T(198), line, T(198)].join('\n')}\n`);
        const y = runTool(file, ['--fps', '300']);
        check(`the tool stops on a voice line that does not read as one: ${what}`, y.status !== 0 && /line 3: a voice line that does not read/.test(y.err) && !y.err.includes(secret) && !y.err.includes('Voice -'), y.err.trim());
      }
    }
    // The pulls the log shows are whole blocks of 512, but for one more on a channel's first.
    {
      const m = run300.marks, at = m.findIndex((x, j) => j > 60 && x.playedBefore && x.packet === null && m[j - 1].b - x.b === 1024 && m[j + 1].playedBefore);
      const c = run300.lines.slice();
      c[m[at].line] = `Voice - chan 0, ent 1, bufsize: ${m[at].b + 2}`;
      const file = path.join(dir, 'grid.log');
      fs.writeFileSync(file, `${c.join('\n')}\n`);
      const lax = runTool(file, ['--fps', '300']), strict = runTool(file, ['--fps', '300', '--strict']), clean = runTool(log300, ['--fps', '300', '--strict']);
      check('pulls off the 512-sample blocks are counted (0 in the synthetic logs; 2 with one bufsize 2 off), and --strict refuses them',
        / 0 pulls off the 512-sample blocks/.test(tool.err) && / 0 pulls off/.test(tool67.err) && clean.status === 0
        && lax.status === 0 && / 2 pulls off the 512-sample blocks/.test(lax.err) && JSON.stringify(lax.fixture.sections[0].events) !== JSON.stringify(section.events)
        && strict.status !== 0 && new RegExp(`line ${m[at].line + 1}: a pull of 511 samples, not whole blocks of 512 \\(--strict\\)`).test(strict.err), `${lax.err.trim()} | ${strict.err.trim()}`);
    }

    // This script's --fixture path, replay only.
    const fx300 = path.join(dir, 'fixture300.json'), fx67 = path.join(dir, 'fixture67.json'), both = path.join(dir, 'fixture-both.json'), broken = path.join(dir, 'fixture-broken.json');
    fs.writeFileSync(fx300, JSON.stringify(tool.fixture));
    fs.writeFileSync(fx67, JSON.stringify(tool67.fixture));
    fs.writeFileSync(both, JSON.stringify({ about: 'two sections', sections: [section, tool67.fixture.sections[0]] }));
    const ev = section.events.slice();
    let k = ev.length / 2 & ~1;
    while (ev[k] !== 3 || ev[k + 1] <= 0) k += 2;
    ev[k + 1] += 2;
    fs.writeFileSync(broken, JSON.stringify({ about: 'one tick changed', sections: [{ ...section, events: ev }] }));
    const a = runReplay(fx300), b = runReplay(both), c = runReplay(broken), d = runReplay(fx67);
    check('--fixture: the synthetic fixture replays and passes', a.status === 0 && /\| `synthetic-300` \(\d+, \d+, \d+\) \| 30 \| 0 \|/.test(a.out) && /replay passed/.test(a.out));
    check('--fixture: two sections, a fault seen in one of them is enough', b.status === 0 && /replay passed/.test(b.out));
    check('--fixture: one tick off fails, naming the first mismatch', c.status !== 0 && /first mismatch at event pair \d+ \(tick \d+\): logged \d+, model \d+/.test(c.out));
    const notJson = path.join(dir, 'not-a-fixture.log');
    const privateLine = 'Player qPrivateNameq connected from qPrivateAddressq, STEAM_0:1:qPrivateIdq';
    fs.writeFileSync(notJson, `${privateLine}\n${privateLine}\n`);
    const e = runReplay(notJson);
    check('--fixture: a file that is not JSON gives "not JSON" and nothing of the file', e.status !== 0 && /not JSON/.test(e.out)
      && !/qPrivate|Player|connected|STEAM/.test(e.out) && !e.out.includes(privateLine.slice(0, 10)), e.out.trim());
    check('--fixture: a file in which a fault mismatches nowhere fails', d.status !== 0 && /mismatches nowhere/.test(d.out) && /\| `MARK67` .* \| 7 \| 0 \|/.test(d.out),
      (d.out.match(/fault "[^"]+" mismatches nowhere/g) || []).join('; '));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${passed} voice channel checks passed`);
}

// ---------------------------------------------------------------------------------------

const argv = process.argv.slice(2);
let fixtureFile = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--fixture' && i + 1 < argv.length) fixtureFile = argv[++i];
  else { console.error('usage: node tests/voice-channel.verify.mjs [--fixture <file>]'); process.exit(2); }
}
if (process.env[REPLAY_ONLY] !== '1') publicChecks();
if (fixtureFile) {
  // Nothing of the file is printed: a console log given here by mistake holds names.
  let text, fixture;
  try { text = fs.readFileSync(fixtureFile, 'utf8'); } catch (e) { console.error(`cannot read the fixture (${e.code || 'error'})`); process.exit(2); }
  try { fixture = JSON.parse(text); } catch { console.error('cannot replay the fixture: not JSON'); process.exit(2); }
  try { fixture = validFixture(fixture); } catch (e) { console.error(`cannot replay the fixture: ${e.message}`); process.exit(2); }
  console.log(`\nReplay of a fixture of ${fixture.sections.length} section(s): mismatching ticks`);
  if (report(replayFixture(fixture)).length) process.exitCode = 1;
}
