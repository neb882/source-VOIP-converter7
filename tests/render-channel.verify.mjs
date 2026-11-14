// A render on the game's timeline (W3-02c-2, docs/work-orders/W3-02c2-render-channel.md):
// TF2Audio.process and TF2Audio.createRender with opts.timeline 'game' play the `steam`
// render's packets through the receiver's voice channel (voice-channel.js).
//
//   node tests/render-channel.verify.mjs          every check
//   node tests/render-channel.verify.mjs 3 6      only those (the numbers below)
//
//  1. The render is the module's: a reference made here, from a 'source' render's
//     messages, codec results and resampled packets and voice-channel.js loaded by this
//     test, gives the 'game' render's voice and codecInfo.channel. With jitter (BC-4,
//     the order's check 4) each message is pushed on its arrival tick from a second model
//     of the arrival times (tests/voicequeue/reference-arrivals.mjs), and
//     codecInfo.arrivals is what the reference counts; late frames reach the channel
//     only through the suite's own mask.
//  2. The logs: codecInfo.sent is the 'source' render's frame log, codecInfo.network
//     is equal, the played log follows the order's slot rule.
//  3. One sample dropped from every packet (finding 24).
//  4. The layouts P and Q: the early start and the overflow (findings 19, 21 and 22).
//  5. The gain is reset at each open (finding 26).
//  6. A lost message through the queue (BC-3).
//  7. The stream's bound: createRender gives process()'s render, and gives out its
//     samples as the source comes.
//  8. The refusals: 'game' runs or throws.
//  9. The same seed twice gives the same render; another seed gives another.
// 10. The live chain on the game's timeline (W3-02c-3a, docs/work-orders/W3-02c3-live-channel.md): at
//     its mix point it gives createRender's samples on 'game', held back by D, at any jitter, for any plan
//     of blocks; the hold is D and no less; the delay it reports; spurtStart at each open; its stats; its
//     refusals; without the option, main's samples; the arrival model with no end.
// Jitter as arrival times (BC-4, docs/work-orders/BC-4-jitter-arrivals.md, "The tests" and
// "After the plan review"):
// 11. One list (fakeLagList) against the closed form of a lone packet's leaving look.
// 12. The order is kept and nothing is lost: `at` never falls, at(p) >= p, the floor reached.
// 13. The engine's arrivals are the second model's, tick for tick.
// 14. The pin of figures: the mean delay above the floor and the share of messages on the
//     tick of the one before, against figures measured on two prototypes that are not this
//     build's reading.
// 15. A bunch by formula through opts.arriveAt: a hold of 40 ticks frees the channel and
//     skips sound; a hold of 4 does neither.
// 16. The stream: createRender gives process()'s render with jitter, and gives out what no
//     later message can reach.
// 17. The file's own timing: a `steam` render on 'source' (and the live chain) at jitter 50
//     is the render at jitter 0.
// 18. The stage keys: a changed jitter on `steam` starts from B; on celt_22 it makes B again.
// 19. opts.arriveAt's refusals.
// 20. Determinism: the same seed gives the same render and loses the same messages at any
//     jitter; another seed gives other arrival ticks.
// Renders use deviceRate 44100 and compare the voice at the mix point (opts.onGain).
// TF2_DIR points the suite at a copy of the sources. Every signal is synthetic, made here.
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { loadEngine, sourceRoot } from './lib/engine.cjs';
import { closedForm, referenceArrivals } from './voicequeue/reference-arrivals.mjs';

const root = sourceRoot();
const require = createRequire(import.meta.url);
const TF2Opus = await import(pathToFileURL(path.join(root, 'opus-codec.mjs')).href);
const engine = loadEngine({ root, codec: TF2Opus }), A = engine.audio;
// The module, loaded by the test itself (as Node loads it: nothing of the engine's).
const VC = require(path.join(root, 'voice-channel.js'));
const { FRAME } = TF2Opus;
const GAIN = engine.VOICE_ENGINE.autoGain;

const only = process.argv.slice(2).map(Number).filter(Number.isInteger);
const runs = (...k) => !only.length || k.some((n) => only.includes(n));

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `   [${detail}]` : ''}`);
}

/* ---------------- signals and renders ---------------- */

const buffer = (x, rate) => ({ sampleRate: rate, length: x.length, numberOfChannels: 1, getChannelData: () => x });
// A seeded generator of our own (an LCG), so the signals do not depend on the engine.
const lcg = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
// Speech-like talk: harmonics of 100 to 200 Hz under a syllable envelope, in spurts of 0.4
// to 2.5 s with pauses of 0.15 to 1.6 s, over a -72 dBFS floor.
function talk(seconds, rate, seed) {
  const rnd = lcg(seed), n = Math.round(seconds * rate), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 2.5e-4 * (rnd() * 2 - 1);
  let t = Math.round(0.3 * rate);
  while (t < n) {
    const len = Math.round((0.4 + 2.1 * rnd()) * rate), level = 0.08 + 0.2 * rnd(), f0 = 100 + 100 * rnd(), phase = 6.283 * rnd();
    for (let i = 0; i < len && t + i < n; i++) {
      const time = i / rate, env = Math.max(0, Math.sin(Math.PI * 3.1 * time + phase)) ** 1.5;
      let v = 0;
      for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f0 * h * time) / h;
      x[t + i] += level * env * (0.6 * v + 0.1 * (rnd() * 2 - 1));
    }
    t += len + Math.round((0.15 + 1.45 * rnd()) * rate);
  }
  return x;
}
// Uniform noise of the given amplitude: one unbroken spurt.
const noise = (seconds, rate, seed, amp) => { const rnd = lcg(seed); return Float32Array.from({ length: Math.round(seconds * rate) }, () => amp * (rnd() * 2 - 1)); };
// The layouts (the amendment of 2026-11-11 in docs/work-orders/W3-02-receiver-queue.md,
// section 10d and its section 5): at 24 kHz, a lead of 1 s, 2 s bursts of a 1 kHz square
// wave of height 1000 of 32768 with the given pauses between, a tail of 1.5 s; uniform
// noise at `db` dBFS RMS everywhere but in the bursts, the same noise for every seed.
function layout(pauses, db) {
  const R = 24000, parts = [1, ...pauses.flatMap((p) => [2, p]), 2, 1.5];
  const n = Math.round(parts.reduce((a, b) => a + b, 0) * R), rnd = lcg(77), amp = 10 ** (db / 20) * Math.sqrt(3);
  const x = Float32Array.from({ length: n }, () => amp * (rnd() * 2 - 1)), bursts = [];
  let t = 1;
  for (let k = 0; k <= pauses.length; k++) {
    const a = Math.round(t * R), b = a + 2 * R;
    for (let i = a; i < b; i++) x[i] = (Math.floor((i - a) / 12) % 2 ? -1000 : 1000) / 32768;
    bursts.push([t, t + 2]);
    t += 2 + (pauses[k] || 0);
  }
  return { x, bursts };
}

const BASE = { codec: 'steam', volume: 1, deviceRate: 44100 };
// The suite's own frame mask (BC-4: jitter draws no late frame on `steam`), through the
// codec module's makeLossMask hook as tests/steam.verify.js's withMask gives it: the late
// frames the earlier fit drew at `lateAt` ms of jitter from the render's seed, a frame a
// packet. null: none.
const lateMaskOf = (lateAt, seed) => (lateAt ? (count) => A.buildLossMask(count, 1, 0, A.mulberry32(seed), lateAt) : null);
// A 'source' render, with what the reference is made from: the sender's messages and the
// codec's result for each (the codec module's steamRoundTrip wrapped, as
// tests/steam.verify.js wraps it), each resampled packet (onResampled) and the voice at
// the mix point (onGain).
async function sourceRender(x, rate, opts = {}, mask = null) {
  const real = engine.codec;
  let messages = null, trip = null, voice = null;
  const packets = [];
  engine.codec = { ...real, steamRoundTrip: async (m, b, o) => {
    messages = m;
    trip = await real.steamRoundTrip(m, b, mask ? { ...o, makeLossMask: mask } : o);
    return trip;
  } };
  try {
    const r = await A.process(buffer(x, rate), { ...BASE, ...opts, onResampled: (y) => packets.push(Int16Array.from(y)),
      onGain: (g) => { voice = Float32Array.from(g); } });
    return { r, messages, trip, packets, voice };
  } finally { engine.codec = real; }
}
// A 'game' render: the render and its voice at the mix point.
async function gameRender(x, rate, opts = {}, mask = null) {
  let voice = null;
  const real = engine.codec;
  if (mask) engine.codec = { ...real, steamRoundTrip: (m, b, o) => real.steamRoundTrip(m, b, { ...o, makeLossMask: mask }) };
  try {
    const r = await A.process(buffer(x, rate), { ...BASE, ...opts, timeline: 'game', onGain: (g) => { voice = Float32Array.from(g); } });
    return { r, voice };
  } finally { engine.codec = real; }
}
const join = (parts) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
// Where two voices first differ, bit for bit, or -1.
const firstDiff = (a, b) => {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return i;
  return -1;
};
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const units = (y) => Int32Array.from(y, (v) => Math.round(v * 32768));

/* ---------------- the reference (check 1) ---------------- */

// Written from the order's table "What is pushed" and voice-channel.js's contract, over
// the 'source' render's messages, codec results and packets; nothing the order adds to the
// engine is called. Rounded to the nearest, ties to even.
const roundEven = (v) => { const f = Math.floor(v), d = v - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1; };
const FULL = 32767 / 32768;
// The gain object: with the auto-gain on, a gain made afresh at each reset() (the
// engine's createGain, made from the receiver's three settings), run over the packet,
// every frame that is not late through it and a late frame's samples as they are; with it
// off, voice_scale in single precision, stage 4's clip and the rounding to a whole 16-bit
// value.
function referenceGain(set) {
  if (set.agc === false) {
    const scale = set.voiceScale ?? 1;
    return { use() {}, gain: { reset() {}, process: (y) => Float32Array.from(y, (v) => roundEven(Math.min(FULL, Math.max(-FULL, Math.fround(v * scale))) * 32768) / 32768) } };
  }
  let blocks = [], g = null;
  return {
    use(b) { blocks = b; },
    gain: {
      reset() { g = A.createGain({ avgGain: set.avgGain ?? GAIN.avgGain, maxGain: set.maxGain ?? GAIN.maxGain, scale: set.voiceScale ?? 1 }); },
      process(y) {
        const n = y.length, F = blocks.length;
        if (!blocks.some((b) => b.code === FRAME.late)) return g.process(y);
        const out = Float32Array.from(y);
        for (let j = 0; j < F; j++) {
          if (blocks[j].code === FRAME.late) continue;
          const a = Math.round(j * n / F), b = Math.round((j + 1) * n / F);
          out.set(g.process(y.subarray(a, b)), a);
        }
        return out;
      }
    }
  };
}
// The channel driven by the test: each message in the sender's order, on its own tick, or
// with jitter (set.jitterMs above 0, BC-4) on its arrival tick from the second model
// (tests/voicequeue/reference-arrivals.mjs, with set.fps and set.seed), counting what
// codecInfo.arrivals reports over the messages pushed.
//   a sound packet that arrived: the resampler's Int16Array over 32768, whole, at its place
//     (the spurt's anchor round((start - lookahead) x 44100 / 24000) of its first message,
//     arrived or lost, then where the last packet played or refused ended, plus 882 for
//     each frame in front of it that no block stands for);
//   a silence record: its resampled zeros at -1;
//   an end marker alone (arrived, no samples): an empty packet at the cursor;
//   a refused packet (over 11,264 samples): an empty packet at its place;
//   a lost message: nothing.
// onOpen (W3-02c-3a's check 10; none elsewhere): told, at each open (where the module resets
// the gain), the count of samples the timeline has returned once that push has returned.
function referenceRender(src, set, onOpen = null) {
  const { messages, trip, packets, voice } = src;
  const L = trip.lookahead;
  const { gain: inner, use } = referenceGain(set);
  let opened = false, returned = 0;
  const gain = onOpen ? { process: (y) => inner.process(y), reset() { opened = true; inner.reset(); } } : inner;
  const tl = VC.createTimeline({ length: voice.length, fps: set.fps, bufferMs: set.bufferMs, codecDelay: L / 24000, gain });
  const out = [], kinds = { sound: 0, record: 0, empty: 0, refused: 0, lost: 0 };
  const lastTick = messages.reduce((m, msg) => Math.max(m, msg.tick), 0);
  const arrivals = set.jitterMs > 0 ? referenceArrivals({ jitterMs: set.jitterMs, fps: set.fps, seed: set.seed, ticks: lastTick + 1 }) : null;
  const count = { messages: 0, sum: 0, max: -Infinity, sameTick: 0, last: null };
  const push = (tick, pcm, source, blocks = []) => {
    use(blocks);
    const at = arrivals ? arrivals.at[tick] : tick;
    if (arrivals) {
      count.messages++; count.sum += at - tick; count.max = Math.max(count.max, at - tick);
      if (at === count.last) count.sameTick++;
      count.last = at;
    }
    const y = tl.push({ tick: at, pcm, source });
    out.push(y);
    returned += y.length;
    if (opened) { opened = false; onOpen(returned); }
  };
  let spurt = null, cursor = 0, p = 0;
  messages.forEach((msg, k) => {
    const made = trip.results[k], record = msg.silence !== undefined;
    if (!record && msg.spurt !== spurt) { spurt = msg.spurt; cursor = Math.round((msg.start - L) * 44100 / 24000); }
    if (made.lost) { kinds.lost++; return; }
    if (made.pcm.length === 0) { kinds.empty++; push(msg.tick, new Float32Array(0), cursor); return; }
    const y16 = packets[p++], place = cursor + 882 * made.skipped;
    if (y16.length > 11264) {
      kinds.refused++;
      push(msg.tick, new Float32Array(0), record ? -1 : place);
      if (!record) cursor = place + y16.length;
      return;
    }
    const pcm = Float32Array.from(y16, (v) => v / 32768);
    if (record) { kinds.record++; push(msg.tick, pcm, -1, made.blocks); return; }
    kinds.sound++;
    push(msg.tick, pcm, place, made.blocks);
    cursor = place + y16.length;
  });
  const end = tl.finish();
  out.push(end.samples);
  const counted = arrivals ? { jitterMs: set.jitterMs, fps: Math.min(1000, Math.max(10, set.fps ?? 300)), floorTicks: arrivals.floorTicks,
    messages: count.messages, meanMs: count.messages ? 15 * count.sum / count.messages : 0, maxMs: count.messages ? 15 * count.max : 0,
    sameTick: count.sameTick } : null;
  return { samples: join(out), info: end.info, kinds, used: p === packets.length, arrivals: counted };
}

/* ---------------- 1 and 2. the module's render, and the logs ---------------- */

if (runs(1, 2)) {
  const t0 = performance.now();
  const x = talk(12, 24000, 3);
  // [name, the options of both renders, the channel's options, the jitter of the suite's own
  // late-frame mask (lateMaskOf)]. Since BC-4 jitter on `steam` moves the messages' arrival
  // ticks on 'game' and draws no late frame: the jitter settings are the order's check 4
  // (jitter 50 at 300 fps, jitter 100 with loss 15%, jitter 200 at 66.67 fps), and the
  // late frames the jitter 200 setting drew before BC-4 come from the suite's own mask.
  const SETTINGS = [
    ['300 fps (the default)', {}, {}],
    ['100 fps', {}, { fps: 100 }],
    ['66.67 fps', {}, { fps: 66.67 }],
    ['bufferMs 50', {}, { bufferMs: 50 }],
    ['bufferMs 200', {}, { bufferMs: 200 }],
    ['the gate off', { gate: false }, {}],
    ['agc off', { agc: false }, {}],
    ['agc off, voiceScale 0.5', { agc: false, voiceScale: 0.5 }, {}],
    ['voiceScale 0.5', { voiceScale: 0.5 }, {}],
    ['loss 5%', { lossPct: 5 }, {}],
    ['loss 15%', { lossPct: 15 }, {}],
    ['loss 40%', { lossPct: 40 }, {}],
    ['jitter 50 ms', { jitterMs: 50 }, {}],
    ['loss 15%, jitter 100 ms', { lossPct: 15, jitterMs: 100 }, {}],
    ['jitter 200 ms at 66.67 fps', { jitterMs: 200 }, { fps: 66.67 }],
    ['late frames by the suite\'s own mask (the fit\'s draw at 200 ms) at 66.67 fps', {}, { fps: 66.67 }, 200],
    ['loss 60% at 66.67 fps', { lossPct: 60 }, { fps: 66.67 }],
    ['the gate off, loss 40% (long runs lost: refused packets)', { gate: false, lossPct: 40 }, {}]
  ];
  const done = [], total = { sound: 0, record: 0, empty: 0, refused: 0, lost: 0 };
  for (const [name, opts, channel, lateAt] of SETTINGS) {
    const seed = done.length + 1, both = { ...opts, seed };
    const src = await sourceRender(x, 24000, both, lateMaskOf(lateAt, seed));
    const game = await gameRender(x, 24000, { ...both, ...channel }, lateMaskOf(lateAt, seed));
    const ref = referenceRender(src, { ...opts, ...channel, seed });
    for (const k of Object.keys(total)) total[k] += ref.kinds[k];
    done.push({ name, opts, channel, src, game, ref });
  }
  if (runs(1)) {
    console.log('\n[1] The render is the module\'s: a reference of the test\'s own over voice-channel.js gives the \'game\' voice and codecInfo.channel');
    for (const { name, channel, game, ref } of done) {
      const at = firstDiff(game.voice, ref.samples), info = game.r.codecInfo.channel, arrivals = game.r.codecInfo.arrivals ?? null;
      check(`${name}: the 'game' voice at the mix point is the reference's, sample for sample, codecInfo.channel its info, member for member, and codecInfo.arrivals ${ref.arrivals ? 'what it counts' : 'absent'}`,
        at === -1 && ref.used && isDeepStrictEqual(info, ref.info) && isDeepStrictEqual(arrivals, ref.arrivals),
        (at === -1 ? `${ref.samples.length} samples; ${ref.info.packets} packets, ${ref.info.opens} opens, ${ref.info.spurts.length} spurts, ${ref.info.drops.length} drops; pushed ${JSON.stringify(ref.kinds)}`
          : `the first difference at ${at}: ${game.voice[at] * 32768} against ${ref.samples[at] * 32768}; info ${isDeepStrictEqual(info, ref.info) ? 'equal' : 'differs'}`)
        + (ref.arrivals || arrivals ? `; arrivals ${JSON.stringify(arrivals)}${isDeepStrictEqual(arrivals, ref.arrivals) ? '' : ` against ${JSON.stringify(ref.arrivals)}`}` : ''));
      if (channel.bufferMs) {
        check(`${name}: the channel waits ${channel.bufferMs * 300 / 1000} ticks at 300 fps`, info.waitTicks === channel.bufferMs * 300 / 1000 && info.bufferMs === channel.bufferMs,
          `waitTicks ${info.waitTicks}`);
      }
    }
    check('the settings above push every kind of message the order lists: sound, silence records, end markers alone, refused packets, and lose some',
      Object.values(total).every((n) => n > 0), JSON.stringify(total));
  }
  if (runs(2)) {
    console.log('\n[2] The logs: codecInfo.sent is the \'source\' render\'s, codecInfo.network is equal, the played log follows the slot rule');
    for (const { name, opts, src, game } of done) {
      const s = src.r.codecInfo, g = game.r.codecInfo, L = s.lookahead, slots = g.channel.source;
      const want = { frameLog: new Uint8Array(s.frameLog.length), frameBytes: new Uint16Array(s.frameBytes.length) };
      for (let i = 0; i < want.frameLog.length; i++) {
        const at = i < slots.length ? slots[i] : -1;
        if (at === -1) continue;
        const k = Math.floor((at * 80 / 147 + L) / 480);
        want.frameLog[i] = s.frameLog[k] ?? 0;
        want.frameBytes[i] = s.frameBytes[k] ?? 0;
      }
      // BC-4 (the plan review's point 9): a 'game' render with jitter has codecInfo.arrivals,
      // which no 'source' render has (section 1 checks its members), so it is left out here
      // with the logs and the channel's info; every other member is the 'source' render's.
      const rest = (info) => { const { frameLog, frameBytes, sent, channel, arrivals, ...others } = info; return others; };
      check(`${name}: sent is the 'source' render's frameLog and frameBytes; network ${s.network ? 'equal' : 'absent on both'}; the counters the 'source' render's; no retimed; arrivals ${opts.jitterMs > 0 ? 'on the \'game\' render only' : 'on neither'}`,
        isDeepStrictEqual(g.sent, { frameLog: s.frameLog, frameBytes: s.frameBytes }) && isDeepStrictEqual(g.network, s.network)
        && isDeepStrictEqual(rest(g), rest(s)) && !('retimed' in g) && !('arrivals' in s) && ('arrivals' in g) === (opts.jitterMs > 0),
        s.network ? JSON.stringify(s.network) : '');
      const played = g.frameLog.reduce((n, c) => n + (c !== 0), 0);
      check(`${name}: frameLog and frameBytes are the played logs, slot i the sent slot floor((source[i] x 80 / 147 + lookahead) / 480)`,
        isDeepStrictEqual(g.frameLog, want.frameLog) && isDeepStrictEqual(g.frameBytes, want.frameBytes) && g.frameLog !== s.frameLog,
        `${played} of ${g.frameLog.length} slots played, ${s.frameLog.reduce((n, c) => n + (c !== 0), 0)} sent`);
    }
  }
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

/* ---------------- the shift between the two voices (checks 3 and 6) ---------------- */

// In 16-bit units: the module's blend of two neighbours of the 'source' voice S, the k-th
// written sample of a packet being sample k + 1 pulled 0.1% toward sample k,
// trunc(a + (b - a) x 0.999). The module carries its fraction from packet to packet, and
// it drifts from 0.999 by a few parts in 10^13 (tests/voice-channel.verify.mjs pins it):
// that moves the truncation only where b - a is a whole multiple of 1000 other than 0 (the
// sum is then whole), and there either side is the module's. blends(S, m): the one value,
// or those two.
const blends = (S, m) => {
  const a = S[m], b = S[m + 1], v = a + (b - a) * 0.999;
  if (b !== a && (b - a) % 1000 === 0) return [Math.trunc(v - 1e-7) + 0, Math.trunc(v + 1e-7) + 0];
  return [Math.trunc(v) + 0];
};
const blendIs = (g, S, m) => blends(S, m).includes(g);
// A single shift d with G[n + i] the blend of S at n + i + d for i = 0..width - 1, at the first
// of the windows n, n + 300, ... that holds no packet's edge (the dropped sample breaks a
// single d), or null.
function shiftAt(G, S, n, width = 200, reach = 44100, tries = 10) {
  for (let q = 0; q < tries; q++) {
    const at = n + 300 * q;
    for (let d = -reach; d <= reach; d++) {
      if (at + d < 0 || at + d + width + 1 > S.length) continue;
      let i = 0;
      while (i < width && blendIs(G[at + i], S, at + i + d)) i++;
      if (i === width) return { d, at };
    }
  }
  return null;
}
// The packets the channel was handed (sound that arrived) whose ticks lie in [from, to) s.
const handedOn = (src, from, to) => src.messages.filter((m, k) => m.silence === undefined && !src.trip.results[k].lost
  && src.trip.results[k].pcm.length > 0 && m.tick * 0.015 >= from && m.tick * 0.015 < to).length;

/* ---------------- 3. one sample dropped from every packet ---------------- */

if (runs(3)) {
  console.log('\n[3] One sample dropped from every packet: a 40 s spurt of noise, agc off, 150 fps (finding 24)');
  const t0 = performance.now(), rate = 44100, x = noise(40, rate, 9, 0.2);
  for (const seed of [1, 2, 3]) {
    const src = await sourceRender(x, rate, { agc: false, seed }), game = await gameRender(x, rate, { agc: false, seed, fps: 150 });
    const S = units(src.voice), G = units(game.voice);
    const a = shiftAt(G, S, 10 * rate), b = shiftAt(G, S, 30 * rate), packets = handedOn(src, 10, 30);
    const grew = a && b ? b.d - a.d : null;
    check(`seed ${seed}: away from a packet's edge one shift makes the 'game' voice the module's blend of the 'source' voice, at 10 s and at 30 s; it grows by the packets between, within 2, and by 340 to 375`,
      grew !== null && Math.abs(grew - packets) <= 2 && grew >= 340 && grew <= 375 && game.r.codecInfo.channel.opens === 1,
      `d ${a ? a.d : 'none'} at 10 s, ${b ? b.d : 'none'} at 30 s: ${grew} against ${packets} packets with ticks between; ${game.r.codecInfo.channel.opens} open`);
  }
  // With the auto-gain off the channel is given, for each sample, the whole 16-bit value the
  // source's timeline brings to the mix entry: here that value is made from the 'source'
  // render's voice at the mix point as the entry makes it (nearest, ties to even, clamped to
  // 16 bits), and the 'game' voice is its blend. Loud noise, so that the clip and the ties
  // are met: at voice_scale 0.7 products fall on halves, at 2 most samples clip.
  const mixValue = (v) => Math.max(-32768, Math.min(32767, roundEven(v * 32768)));
  const loud = noise(12, rate, 17, 0.9);
  for (const voiceScale of [0.7, 2]) {
    const src = await sourceRender(loud, rate, { agc: false, voiceScale, seed: 1 });
    const game = await gameRender(loud, rate, { agc: false, voiceScale, seed: 1, fps: 150 });
    const S = Int32Array.from(src.voice, mixValue), G = units(game.voice);
    const at = shiftAt(G, S, 6 * rate, 1000, 44100, 30);
    let clipped = 0, ties = 0;
    for (let i = at ? at.at + at.d : 0; at && i < at.at + at.d + 1000; i++) {
      if (Math.abs(S[i]) === 32767) clipped++;
      const p = src.voice[i] * 32768;
      if (Math.abs(p - Math.trunc(p)) === 0.5) ties++;
    }
    check(`voice_scale ${voiceScale}, agc off, loud noise: over 1,000 samples one shift makes the 'game' voice the module's blend of the 'source' render's voice as the mix entry rounds it`,
      at !== null, at ? `d ${at.d} at ${(at.at / rate).toFixed(3)} s; of the 1,000 source samples ${clipped} at the clip, ${ties} on a half` : 'no shift fits');
  }
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

/* ---------------- 4. the layouts ---------------- */

const P = layout([0.3, 0.5, 1.2], -50), Q = layout([0.9, 0.6, 1.2], -50);
if (runs(4)) {
  console.log('\n[4] The layouts P and Q, seeds 1 to 10, at 300 and 66.67 fps: the early start and the overflow (findings 19, 21 and 22)');
  const t0 = performance.now(), SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const within = (v, lo, hi) => v !== null && v >= lo && v <= hi;
  const fmt = (xs) => (xs.length ? `${Math.min(...xs).toFixed(1)} to ${Math.max(...xs).toFixed(1)}` : 'none');
  const runAll = async (L, fps) => {
    const out = [];
    for (const seed of SEEDS) out.push((await gameRender(L.x, 24000, { seed, fps })).r.codecInfo.channel);
    return out;
  };
  const p300 = await runAll(P, 300), p67 = await runAll(P, 66.67), q300 = await runAll(Q, 300), q67 = await runAll(Q, 66.67);
  // P: the spurt that starts after the second burst's end and before the third's.
  const after500 = (info) => info.spurts.find((s) => s.start > P.bursts[1][1] && s.start < P.bursts[2][1]);
  const last = (info) => info.spurts[info.spurts.length - 1];
  check('P: the 300 ms pause makes no spurt (spurts[0] ends past the second burst), every seed, both rates',
    [...p300, ...p67].every((i) => i.spurts[0].end > P.bursts[1][1]), `spurts[0] ends ${fmt([...p300, ...p67].map((i) => i.spurts[0].end))} s`);
  const split = p300.map((i) => !!after500(i));
  check('P: the 500 ms pause makes its own spurt in some seeds and not in others, among seeds 1 to 10',
    split.some((s) => s) && split.some((s) => !s), `its own spurt in seeds ${SEEDS.filter((s, k) => split[k]).join(', ') || 'none'}`);
  for (const [rate, infos, lo, hi] of [[300, p300, -60, 50], [66.67, p67, 10, 140]]) {
    const own = infos.map(after500).filter(Boolean);
    check(`P at ${rate} fps: that spurt is not opened, its offsetStartMs ${lo} to +${hi}`,
      own.length > 0 && own.every((s) => !s.opened && within(s.offsetStartMs, lo, hi)), `${own.length} seeds: ${fmt(own.map((s) => s.offsetStartMs))} ms`);
  }
  const appended = q300.map((i) => i.spurts[1]).filter((s) => s && !s.opened);
  check('Q at 300 fps: spurts[1] (after 900 ms) is not opened in at least 7 of seeds 1 to 10, its offsetStartMs -380 to -215',
    appended.length >= 7 && appended.every((s) => within(s.offsetStartMs, -380, -215)), `${appended.length} of 10: ${fmt(appended.map((s) => s.offsetStartMs))} ms`);
  check('Q at 66.67 fps: spurts[1] is opened, every seed', q67.every((i) => i.spurts[1] && i.spurts[1].opened),
    `${q67.filter((i) => i.spurts[1] && i.spurts[1].opened).length} of 10`);
  const opened = [...p300, ...p67, ...q300, ...q67].flatMap((i) => i.spurts.filter((s) => s.opened));
  check('an opened spurt\'s offsetStartMs, both layouts, both rates: -50 to +60', opened.every((s) => within(s.offsetStartMs, -50, 60)),
    `${opened.length} spurts: ${fmt(opened.map((s) => s.offsetStartMs))} ms`);
  for (const [name, infos, lo, hi] of [['P', p300, 70, 230], ['Q', q300, 60, 145]]) {
    check(`${name} at 300 fps: spurts[0].droppedMs ${lo} to ${hi}`, infos.every((i) => within(i.spurts[0].droppedMs, lo, hi)),
      `${fmt(infos.map((i) => i.spurts[0].droppedMs))} ms`);
  }
  for (const [name, infos, L, lo, hi] of [['P', p300, P, 65, 155], ['Q', q300, Q, 65, 150]]) {
    const ok = infos.every((i) => last(i).start > L.bursts[2][1] && last(i).opened && within(last(i).droppedMs, lo, hi));
    check(`${name} at 300 fps: the spurt after 1.2 s is opened, its droppedMs ${lo} to ${hi}`, ok, `${fmt(infos.map((i) => last(i).droppedMs))} ms`);
  }
  check('300 fps: channel.drops is not empty, every seed, both layouts', [...p300, ...q300].every((i) => i.drops.length > 0),
    `${fmt([...p300, ...q300].map((i) => i.drops.length))} entries`);
  check('66.67 fps: every droppedMs 0 and drops empty, every seed, both layouts',
    [...p67, ...q67].every((i) => i.drops.length === 0 && i.spurts.every((s) => s.droppedMs === 0)));
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

/* ---------------- 5. the gain is reset at each open ---------------- */

if (runs(5)) {
  console.log('\n[5] The gain is reset at each open: layout Q with its noise at -40 dBFS, voiceScale 0, 66.67 fps (finding 26)');
  const t0 = performance.now(), Q40 = layout([0.9, 0.6, 1.2], -40);
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const { r, voice } = await gameRender(Q40.x, 24000, { seed, fps: 66.67, voiceScale: 0 });
    const info = r.codecInfo.channel;
    // The runs of samples that are not zero, apart where 2,000 zeros or more lie between.
    const runs = [];
    for (let i = 0; i < voice.length; i++) {
      if (voice[i] === 0) continue;
      const cur = runs[runs.length - 1];
      if (cur && i - cur.last < 2000) { cur.last = i; cur.count++; } else runs.push({ first: i, last: i, count: 1 });
    }
    const opens = info.spurts.filter((s) => s.opened);
    // Each run starts within 150 ms of an opened spurt's start (the source's sample).
    const placed = runs.length === opens.length && runs.every((u, k) => Math.abs(u.first - opens[k].start * 44100) < 0.15 * 44100);
    // W3-21: with the capture's phase seed 8's channel appends no spurt (info.appended 0; 1
    // before W3-21); every other seed's appends one.
    check(`seed ${seed}: opens 3 and gainResets 3; the voice is zero but one run after each open, at most 127 samples long with at least 40 not zero; the appended spurt adds none${seed === 8 ? ' (seed 8 with the capture\'s phase: none appended)' : ''}`,
      info.opens === 3 && info.gainResets === 3 && info.appended === (seed === 8 ? 0 : 1) && placed && runs.every((u) => u.last - u.first + 1 <= 127 && u.count >= 40),
      `${runs.length} runs: ${runs.map((u) => `${u.last - u.first + 1} long, ${u.count} not zero`).join('; ')}; opens ${info.opens}, gainResets ${info.gainResets}, appended ${info.appended}, placed ${placed}`);
  }
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

/* ---------------- 6. loss through the queue ---------------- */

if (runs(6)) {
  console.log('\n[6] A lost message through the queue (BC-3), against the \'source\' render of the same loss');
  const t0 = performance.now(), rate = 44100, x = noise(20, rate, 13, 0.2), seed = 4;
  // The sender's messages of this source and seed (they do not depend on the loss).
  const dry = await sourceRender(x, rate, { agc: false, seed });
  const sound = (m) => m.silence === undefined && m.last >= m.first;
  {
    // One message lost inside the spurt, at about 10 s.
    const k10 = dry.messages.findIndex((m) => sound(m) && m.tick * 0.015 >= 10);
    const lose = (k) => k === k10;
    const src = await sourceRender(x, rate, { agc: false, seed, loseMessage: lose });
    const game = await gameRender(x, rate, { agc: false, seed, fps: 150, loseMessage: lose });
    const S = units(src.voice), G = units(game.voice), info = game.r.codecInfo.channel, net = game.r.codecInfo.network;
    const at = [5, 9, 11, 15].map((t) => shiftAt(G, S, t * rate));
    const steps = [0, 1, 2].map((j) => (at[j] && at[j + 1] ? at[j + 1].d - at[j].d : null));
    const packets = [[5, 9], [9, 11], [11, 15]].map(([a, b]) => handedOn(src, a, b));
    check('one message lost in a long spurt at 150 fps: lostMessages 1, opens 1, and before, across and after the gap d grows by one for each packet handed on, within 2',
      net && net.lostMessages === 1 && info.opens === 1 && steps.every((s, j) => s !== null && Math.abs(s - packets[j]) <= 2),
      `steps ${steps.join(', ')} against ${packets.join(', ')} packets; lost ${net && net.lostMessages}, opens ${info.opens}`);
  }
  {
    // Messages lost for 0.26 s of ticks at 300 fps, the first at or after 10 s whose next
    // message is refused (10 concealed frames and its own make more than 12).
    let from = null, refused = -1;
    for (let k = 0; k < dry.messages.length && from === null; k++) {
      const m = dry.messages[k];
      if (!sound(m) || m.tick * 0.015 < 10) continue;
      const end = m.tick * 0.015 + 0.26;
      let j = k, frames = 0;
      while (j < dry.messages.length && dry.messages[j].tick * 0.015 < end) { frames += dry.messages[j].last - dry.messages[j].first + 1; j++; }
      const next = dry.messages[j];
      if (next && sound(next) && Math.min(10, frames) + next.last - next.first + 1 > 12) { from = m.tick * 0.015; refused = j; }
    }
    const lose = (k, m) => m.tick * 0.015 >= from && m.tick * 0.015 < from + 0.26;
    const src = await sourceRender(x, rate, { agc: false, seed, loseMessage: lose });
    const game = await gameRender(x, rate, { agc: false, seed, fps: 300, loseMessage: lose });
    const S = units(src.voice), G = units(game.voice), info = game.r.codecInfo.channel, net = game.r.codecInfo.network;
    const made = src.trip.results[refused], unfilled = made ? made.skipped : 0, frames = made ? made.pcm.length / 480 : 0;
    const before = shiftAt(G, S, Math.round((from - 1.5) * rate)), after = shiftAt(G, S, Math.round((from + 2) * rate));
    const grew = before && after ? after.d - before.d : null;
    check('messages lost for 0.26 s of ticks at 300 fps: opens stays 1, refusedMessages 1, and d grows across the gap by at least 882 for each frame nobody filled and each frame of the refused packet',
      from !== null && net && net.refusedMessages === 1 && info.opens === 1 && grew !== null && grew >= 882 * (unfilled + frames),
      `lost from ${from && from.toFixed(3)} s; d grew ${grew} against 882 x (${unfilled} + ${frames}) = ${882 * (unfilled + frames)}; refused ${net && net.refusedMessages}, opens ${info.opens}`);
  }
  {
    // Messages lost for 1.5 s of ticks at 150 fps: the queue runs dry and a new channel opens.
    const from = 10;
    const lose = (k, m) => m.tick * 0.015 >= from && m.tick * 0.015 < from + 1.5;
    const src = await sourceRender(x, rate, { agc: false, seed, loseMessage: lose });
    const game = await gameRender(x, rate, { agc: false, seed, fps: 150, loseMessage: lose });
    const S = units(src.voice), G = units(game.voice), info = game.r.codecInfo.channel;
    check('messages lost for 1.5 s of ticks at 150 fps: opens 2 and gainResets 2', info.opens === 2 && info.gainResets === 2,
      `opens ${info.opens}, gainResets ${info.gainResets}`);
    // The fade, in the module's single precision: sample j of the 4,410 is
    // trunc(f(f(1 - f(j x step)) x v)), v the plain blend.
    const C = VC.VOICE_CHANNEL, fade = Math.max(2, Math.trunc(Math.fround(C.rate * Math.fround(C.fadeTime)))), step = Math.fround(1 / (fade - 1));
    const faded = (j, v) => Math.trunc(Math.fround(Math.fround(1 - Math.fround(j * step)) * v)) + 0;
    const fadedIs = (g, j, m) => blends(S, m).some((v) => g === faded(j, v));
    // From 1 s before the gap to where the sound ends (the first of 2,000 zeros), the plain
    // blend followed sample by sample, the shift rising by one at each packet's edge.
    const start = shiftAt(G, S, (from - 1) * rate);
    let z = G.length;
    for (let m = start ? start.at : G.length, run = 0; m < G.length; m++) {
      if (G[m] !== 0) run = 0;
      else if (++run === 2000) { z = m - 1999; break; }
    }
    const shifts = [];
    for (let m = start ? start.at : z, d = start ? start.d : 0; m < z; m++) {
      if (!blendIs(G[m], S, m + d) && blendIs(G[m], S, m + d + 1)) d++;
      shifts.push(d);
    }
    // The fade's first sample: where, from 600 samples before the 4,410 that end at the
    // silence to 50 after, the most of them are the faded blend, followed the same way
    // from the shift there.
    let best = { f0: -1, count: -1 };
    for (let f0 = z - fade - 600; start && f0 <= z - fade + 50; f0++) {
      let dd = shifts[f0 - start.at], count = 0;
      for (let j = 0; j < fade; j++) {
        if (fadedIs(G[f0 + j], j, f0 + j + dd)) count++;
        else if (fadedIs(G[f0 + j], j, f0 + j + dd + 1)) { dd++; count++; }
      }
      if (count > best.count) best = { f0, count };
    }
    let plain = 0;
    for (let m = start ? start.at : 0; start && m < best.f0; m++) if (blendIs(G[m], S, m + shifts[m - start.at])) plain++;
    // After the fade: the padding, then zeros until the new channel plays.
    const end = best.f0 + fade;
    let next = z;
    while (next < G.length && G[next] === 0) next++;
    check('then the fade at the queue\'s end: the plain blend (one shift a packet), 4,410 samples of the faded blend (at least 4,400 of them), less than a block of padding, zeros until the new channel plays',
      start !== null && best.f0 - start.at > 2000 && plain === best.f0 - start.at && best.count >= 4400 && z - end < 512 && next - z > 0.5 * rate && next < G.length,
      `the plain blend on ${plain} of ${best.f0 - (start ? start.at : 0)} samples; the faded blend on ${best.count} of ${fade}; ${z - end} samples from the fade's end to the silence; ${next - z} zeros; the new channel at ${(next / rate).toFixed(3)} s`);
  }
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

/* ---------------- 7. the stream ---------------- */

// D, the delay the channel takes out, with the Opus codec's 156 samples at 24 kHz
// (pinned by tests/voice-channel.verify.mjs).
const D = { 300: 24576, 66.67: 13312 };
if (runs(7)) {
  console.log('\n[7] The stream: createRender under \'game\' gives process()\'s render, and gives out its samples as the source comes');
  const t0 = performance.now(), rate = 24000, x = talk(6, rate, 21), opts = { ...BASE, timeline: 'game', seed: 1, gate: false };
  const whole = await A.process(buffer(x, rate), opts);
  const streamed = async (size, o, onPush) => {
    const r = await A.createRender({ sampleRate: rate, length: x.length, numberOfChannels: 1 }, o), out = [];
    for (let at = 0; at < x.length; at += size) {
      out.push(await r.push(x.subarray(at, Math.min(x.length, at + size))));
      onPush?.(Math.min(x.length, at + size), out.reduce((n, p) => n + p.length, 0));
    }
    const end = await r.finish();
    out.push(end.samples);
    return { samples: join(out), codecInfo: end.codecInfo };
  };
  for (const size of [10, 48, 480]) {
    let got = null, error = null;
    try { got = await streamed(size, opts); } catch (e) { error = e; }
    const at = got ? firstDiff(got.samples, whole.samples) : -2;
    check(`seed 1, the gate off, pieces of ${size}: createRender gives process()'s samples and codecInfo`,
      at === -1 && isDeepStrictEqual(got.codecInfo, whole.codecInfo),
      error ? `threw ${error.message}` : at === -1 ? `${whole.samples.length} samples` : `the first difference at ${at}`);
  }
  // With the gate on, so that the source's pauses bring no message for a second at a time:
  // there only advance() gives out what became final. On the 24 kHz source and on a 48 kHz
  // one (the bound counts the sender's 24 kHz samples, not the source's).
  const x48 = talk(6, 48000, 21);
  for (const [srcRate, src, fps] of [[rate, x, 300], [rate, x, 66.67], [48000, x48, 300], [48000, x48, 66.67]]) {
    // How far the samples returned fall behind the source given, both counted at 44.1 kHz.
    let behind = 0;
    const o = { ...BASE, timeline: 'game', seed: 1, fps };
    const r = await A.createRender({ sampleRate: srcRate, length: src.length, numberOfChannels: 1 }, o), out = [];
    let returned = 0;
    for (let at = 0; at < src.length; at += 960) {
      const y = await r.push(src.subarray(at, Math.min(src.length, at + 960)));
      out.push(y);
      returned += y.length;
      behind = Math.max(behind, Math.round(Math.min(src.length, at + 960) * 44100 / srcRate) - returned);
    }
    out.push((await r.finish()).samples);
    const want = await A.process(buffer(src, srcRate), o);
    check(`${fps} fps, the gate on, a ${srcRate / 1000} kHz source, pieces of 960: the samples returned never fall more than D + 2,048 behind the source given, and are process()'s`,
      behind <= D[fps] + 2048 && firstDiff(join(out), want.samples) === -1,
      `at most ${behind} behind, D ${D[fps]}: ${behind - D[fps]} over D`);
  }
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

/* ---------------- 8. the refusals ---------------- */

if (runs(8)) {
  console.log('\n[8] The refusals: \'game\' runs or throws');
  const rate = 24000, x = talk(2, rate, 31);
  const received = { frameLog: Array.from({ length: 100 }, (_, f) => (f < 60 ? 2 : 0)), frameBytes: Array(100).fill(60), frameMs: 20, spurts: 1 };
  const ROWS = [
    ['celt_22', { codec: 'celt_22' }], ['celt_44', { codec: 'celt_44' }], ['speex', { codec: 'speex' }],
    ['steam_48 (not in TF2)', { codec: 'steam_48' }], ['miles (not in TF2)', { codec: 'miles' }],
    ['the codec bypassed', { enableWarble: false }], ['a demo\'s received voice', { received }],
    ['timeline \'gmae\'', { timeline: 'gmae' }], ['timeline \'\'', { timeline: '' }], ['timeline 0', { timeline: 0 }],
    ['timeline false', { timeline: false }], ['timeline \'GAME\'', { timeline: 'GAME' }]
  ];
  const thrown = async (run) => { try { await run(); return null; } catch (e) { return e; } };
  for (const [name, change] of ROWS) {
    const o = { ...BASE, timeline: 'game', ...change };
    const a = await thrown(() => A.process(buffer(x, rate), o));
    const b = await thrown(async () => { const r = await A.createRender({ sampleRate: rate, length: x.length, numberOfChannels: 1 }, o); await r.push(x); await r.finish(); });
    check(`${name}: process() and createRender() throw a RangeError that names timeline`,
      a instanceof RangeError && b instanceof RangeError && /timeline/.test(a.message) && /timeline/.test(b.message),
      `${a ? a.message : 'process() rendered'} | ${b ? b.message : 'createRender() rendered'}`);
  }
  const hashOf = async (r) => `${sha256(new Uint8Array(await r.blob.arrayBuffer()))} ${sha256(JSON.stringify(r.codecInfo, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v)))}`;
  const plain = await hashOf(await A.process(buffer(x, rate), BASE));
  for (const value of ['source', null, undefined]) {
    const r = await A.process(buffer(x, rate), { ...BASE, timeline: value });
    check(`timeline ${JSON.stringify(value) ?? 'undefined'}: the default render's WAV and codecInfo`, await hashOf(r) === plain && !('channel' in r.codecInfo) && !('sent' in r.codecInfo));
  }
  // retime, which the engine no longer reads (W3-02f): 'game' with it is the
  // 'game' render, from process() and from createRender().
  {
    const o = { ...BASE, timeline: 'game' };
    const game = await hashOf(await A.process(buffer(x, rate), o));
    let given;
    try { given = await hashOf(await A.process(buffer(x, rate), { ...o, retime: true })); } catch (e) { given = e; }
    let streamedHash = null;
    const failed = await thrown(async () => {
      const r = await A.createRender({ sampleRate: rate, length: x.length, numberOfChannels: 1 }, { ...o, retime: true });
      const first = await r.push(x), end = await r.finish();
      const out = new Float32Array(first.length + end.samples.length);
      out.set(first);
      out.set(end.samples, first.length);
      streamedHash = await hashOf({ blob: A.encodeWav(out, r.sampleRate), codecInfo: end.codecInfo });
    });
    const text = (h) => (h instanceof Error ? `${h.name}: ${h.message}` : h === game ? 'equal' : 'differs');
    check('timeline \'game\' with retime true: the \'game\' render\'s WAV and codecInfo, from process() and from createRender()',
      given === game && !failed && streamedHash === game,
      `process() ${text(given)}; createRender() ${failed ? text(failed) : text(streamedHash)}`);
  }
}

/* ---------------- 9. the seed ---------------- */

if (runs(9)) {
  console.log('\n[9] The same seed twice gives the same render; another seed gives another');
  const rate = 24000, x = talk(8, rate, 41);
  const a = await gameRender(x, rate, { seed: 5 }), b = await gameRender(x, rate, { seed: 5 }), c = await gameRender(x, rate, { seed: 6 });
  check('seed 5 twice: the same samples and codecInfo', firstDiff(a.r.samples, b.r.samples) === -1 && isDeepStrictEqual(a.r.codecInfo, b.r.codecInfo));
  check('seed 6: other samples', firstDiff(a.r.samples, c.r.samples) !== -1,
    `${a.r.codecInfo.channel.packets} and ${c.r.codecInfo.channel.packets} packets`);
}

/* ---------------- 10. the live chain on the game's timeline (W3-02c-3a) ---------------- */

// The order's figures (docs/work-orders/W3-02c3-live-channel.md, "The hold-back"): D at the three frame
// rates with the Opus codec's 156 samples, pinned by tests/voice-channel.verify.mjs; the full reach and
// the codec's look-ahead the chain holds back on the file's own timing, 4,650 and 156 samples at 24 kHz
// (read: engine/steam.js steamReach from the sender's constants, and the codec's look-ahead).
const LIVE_D = { 66.67: 13312, 100: 15360, 300: 24576 };
const REACH_AND_LOOKAHEAD = 4806;
// The live chain's samples on main before W3-02c-3a (0617875), with no timeline and with 'source': the
// SHA-256 of its output and of the voice at its mix point, for talk(4, 48000, 51) in blocks of 480.
const LIVE_MAIN = {
  'the defaults': ['e83c8b4dd19edb0b4eb872ee1442be1a78666ce8aa45cdf3f4040301f52f5756', '0bce2048c41e665a5d67482a2d3883205dcba873c39d3a63ecadae9bbf535c33'],
  'loss 15%, jitter 50 ms, seed 3': ['cb9688b450d213e3d5f5de5e8e26cc00816d12021ef95717d90ce181eac97803', 'b928d3cbe1f0e880fe732b7a12b27e2a3e0f50a787e5a7c97259002a318b9ce6'],
  'the gate off, agc off, voiceScale 2, low latency': ['f91452130410961465f8d83e084bc3e39f87700a754cf3ffe146e37fe4333e85', 'a578306ea42f1a673fe2f05e56f7ab89dc20deea7203410e77ebab33daf7dbee'],
  'celt_22, loss 15%, seed 5': ['ae240a8399c4e6abfd470959f7b1e85db244ebd05a6d36c37fe03f0c3ede4f0a', '1d30d0f8b40a265b63c1f1c5e7d9637f9ce32b75ac005bebe82244a6d2991e92']
};
const LIVE_MAIN_OPTS = {
  'the defaults': {}, 'loss 15%, jitter 50 ms, seed 3': { lossPct: 15, jitterMs: 50, seed: 3 },
  'the gate off, agc off, voiceScale 2, low latency': { gate: false, agc: false, voiceScale: 2, lowLatency: true, seed: 4 },
  'celt_22, loss 15%, seed 5': { codec: 'celt_22', lossPct: 15, seed: 5 }
};
const bytesOf = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
// A seeded uneven plan of blocks: 1 to 5,000 samples.
const unevenPlan = (seed) => { const rnd = lcg(seed); return Array.from({ length: 64 }, () => 1 + Math.floor(rnd() * 5000)); };

// The live chain on the game's timeline, fed x in blocks of `plan` (a size, or sizes taken in turn), with the
// key up (push-to-talk) for the blocks that start in a span of keyUp (sample spans at the chain's rate). The
// voice at its mix point (onGain), and at each call the chain makes to spurtStart() of the room path (a
// stand-in that only counts, or a real path seen through a proxy, so that the path's own call from shares()
// is not counted) the count of samples onGain had been handed. G is what the order's "The hold-back" says it
// gives out: floor(P x 147 / 80) - D, P the samples given to the sender (stats.pushed), D its zero.
async function liveGame(x, rate, opts, plan = 480, { keyUp = [], room = null } = {}) {
  const voice = [], starts = [];
  let seen = 0;
  const real = room ? room.path : { spurtStart() {} };
  const path = new Proxy(real, { get: (t, k) => (k === 'spurtStart' ? () => { starts.push(seen); return t.spurtStart(); }
    : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
  const liveRoom = { path, attached: !!room };
  const chain = await A.createLiveChain({ ...BASE, ...opts, timeline: 'game', liveRoom,
    onGain: (g) => { voice.push(Float32Array.from(g)); seen += g.length; } }, rate);
  const sizes = typeof plan === 'number' ? [plan] : plan;
  const marks = [];
  try {
    for (let at = 0, k = 0; at < x.length; k++) {
      const n = Math.min(sizes[k % sizes.length], x.length - at);
      chain.setTalking(!keyUp.some(([a, b]) => at >= a && at < b));
      await chain.process(x.subarray(at, at + n));
      at += n;
      marks.push({ at, held: chain.held() });
    }
  } finally { chain.free(); }
  const D = chain.zero, P = chain.stats.pushed;
  return { voice: join(voice), starts, stats: { ...chain.stats }, D, G: Math.floor(P * 147 / 80) - D, queueCostMs: chain.queueCostMs, marks };
}
// createRender on the game's timeline, its voice at the mix point and its codecInfo.
async function renderGame(x, rate, opts) {
  const voice = [];
  const r = await A.createRender({ sampleRate: rate, length: x.length, numberOfChannels: 1 },
    { ...BASE, ...opts, timeline: 'game', onGain: (g) => voice.push(Float32Array.from(g)) });
  for (let at = 0; at < x.length; at += 4096) await r.push(x.subarray(at, Math.min(x.length, at + 4096)));
  const end = await r.finish();
  return { voice: join(voice), info: end.codecInfo };
}
// The chain's voice against the render's: G samples given, G above 0, and sample n of the one sample n of the
// other for every n below G.
const sameAsRender = (live, ren) => live.G > 0 && live.voice.length === live.G && live.G <= ren.voice.length
  && firstDiff(live.voice, ren.voice.subarray(0, live.G)) === -1;
const liveText = (live, ren) => `G ${live.G} of the render's ${ren.voice.length}; ${live.voice.length === live.G ? '' : `${live.voice.length} given; `}`
  + `first difference ${live.G > 0 && live.voice.length === live.G ? firstDiff(live.voice, ren.voice.subarray(0, live.G)) : 'n/a'}; margin ${live.stats.margin}; `
  + `opens ${live.stats.channel.opens}`;

if (runs(10)) {
  console.log('\n[10] The live chain on the game\'s timeline (W3-02c-3a) gives at its mix point the stream render\'s samples, held back by D');
  const t0 = performance.now();

  // The chain is the render: [the microphone's rate, fps, jitter, loss, seed, seconds]. The three frame rates at
  // jitter 0, 50 and 100 (at jitter 0 for 30 s), three seeds at 300 fps and jitter 50, loss 15% at each rate, a
  // 48 kHz microphone at 66.67 and 300 fps.
  const SETTINGS = [];
  for (const fps of [66.67, 100, 300]) for (const jitterMs of [0, 50, 100]) SETTINGS.push([24000, fps, jitterMs, 0, 1, jitterMs ? 12 : 30]);
  SETTINGS.push([24000, 300, 50, 0, 2, 12], [24000, 300, 50, 0, 3, 12]);
  for (const fps of [66.67, 100, 300]) SETTINGS.push([24000, fps, 50, 15, 4, 12]);
  SETTINGS.push([48000, 66.67, 0, 0, 5, 12], [48000, 300, 50, 0, 5, 12]);
  const margins = [], held = [];
  let opensSeen = 0, arrivalsRight = true;
  for (const [rate, fps, jitterMs, lossPct, seed, seconds] of SETTINGS) {
    const x = talk(seconds, rate, 3), o = { fps, jitterMs, lossPct, seed };
    const ren = await renderGame(x, rate, o), live = await liveGame(x, rate, o);
    check(`${rate / 1000} kHz, ${fps} fps, jitter ${jitterMs}, loss ${lossPct}%, seed ${seed}, ${seconds} s: the chain gives floor(P x 147 / 80) - D samples at its mix point, D ${LIVE_D[fps]}, and they are createRender's`,
      sameAsRender(live, ren) && live.D === LIVE_D[fps], liveText(live, ren));
    margins.push({ jitterMs, seconds, fps, margin: live.stats.margin });
    held.push({ rate, marks: live.marks });
    if (live.stats.channel.opens > 0) opensSeen++;
    if (jitterMs > 0 ? !(live.stats.arrivals && live.stats.arrivals.jitterMs === jitterMs && live.stats.arrivals.messages > 0) : 'arrivals' in live.stats) arrivalsRight = false;
  }

  // The plan of blocks does not change the output.
  {
    const rate = 24000, x = talk(8, rate, 7), o = { fps: 300, jitterMs: 50, seed: 2 };
    const ren = await renderGame(x, rate, o);
    for (const [name, plan] of [['1', 1], ['480', 480], ['4,800', 4800], ['an uneven plan', unevenPlan(77)]]) {
      const live = await liveGame(x, rate, o, plan);
      check(`blocks of ${name} (300 fps, jitter 50, seed 2, 8 s): createRender's samples`, sameAsRender(live, ren), liveText(live, ren));
      margins.push({ jitterMs: 50, seconds: 8, fps: 300, margin: live.stats.margin });
    }
  }

  // The gate off, push-to-talk, the receiver's gain off (voice_scale 2, loud enough to clip, so the chain's
  // own scale and clip would change the sound), and a room attached after the mix point at 48 and 44.1 kHz.
  {
    const R = require(path.join(root, 'room-dsp.js')), table = require(path.join(root, 'room-presets.js'));
    const cases = [
      ['the gate off', 24000, { fps: 300, jitterMs: 50, seed: 6, gate: false }, {}],
      ['push-to-talk released inside a phrase and pressed again (48 kHz)', 48000, { fps: 66.67, jitterMs: 50, seed: 7 },
        { keyUp: [[480 * 120, 480 * 300], [480 * 700, 480 * 760]] }],
      ['the receiver\'s gain off, voice_scale 2', 24000, { fps: 100, jitterMs: 50, seed: 8, agc: false, voiceScale: 2, micGain: 3 }, {}],
      ['a room attached after the mix point (48 kHz)', 48000, { fps: 300, seed: 9 }, { room: true }],
      ['a room attached after the mix point (44.1 kHz)', 44100, { fps: 66.67, jitterMs: 50, seed: 10 }, { room: true }]
    ];
    for (const [name, rate, o, extra] of cases) {
      const x = talk(12, rate, 3), keyUp = extra.keyUp || [];
      const xr = Float32Array.from(x);
      for (const [a, b] of keyUp) xr.fill(0, a, b);
      const room = extra.room ? { path: R.createRoomPath({ seed: 9, room: 6, table }), attached: true } : null;
      const ren = await renderGame(xr, rate, o), live = await liveGame(x, rate, o, 480, { keyUp, room });
      let clipped = 0;
      if (o.agc === false) for (const v of ren.voice) if (Math.abs(v) >= 32767 / 32768) clipped++;
      check(`${name}: createRender's samples${room ? `, and spurtStart called at each open (${live.starts.length})` : ''}${o.agc === false ? ', where it clips' : ''}`,
        sameAsRender(live, ren) && (!room || live.starts.length === live.stats.channel.opens) && (o.agc !== false || clipped > 0),
        `${liveText(live, ren)}${o.agc === false ? `; ${clipped} samples at the clip` : ''}`);
      margins.push({ jitterMs: o.jitterMs || 0, seconds: 12, fps: o.fps, margin: live.stats.margin });
    }
  }

  // The hold is D and no less.
  const longZero = margins.filter((m) => m.seconds >= 30 && m.jitterMs === 0);
  check('the hold is D: stats.margin is a count of 0 or more in every run, and under 512 in the runs of 30 s at jitter 0',
    margins.every((m) => Number.isInteger(m.margin) && m.margin >= 0) && longZero.length === 3 && longZero.every((m) => m.margin < 512),
    `least ${Math.min(...margins.map((m) => m.margin))}; at jitter 0 over 30 s ${longZero.map((m) => `${m.margin} at ${m.fps} fps`).join(', ')}; with jitter ${margins.filter((m) => m.jitterMs > 0).map((m) => m.margin).join(', ')}`);

  // The delay the chain reports.
  {
    const rows = [];
    let ok = true;
    for (const fps of [66.67, 100, 300]) {
      const plain = await A.createLiveChain({ codec: 'steam' }, 48000), queued = await A.createLiveChain({ codec: 'steam', timeline: 'game', fps }, 48000);
      const want = 1000 * (LIVE_D[fps] / 44100 - REACH_AND_LOOKAHEAD / 24000);
      const cost = queued.queueCostMs, sum = plain.stats.latencyMs + cost;
      if (!(Math.abs(cost - want) < 1e-9 && Math.abs(queued.stats.latencyMs - sum) < 1e-9 && queued.zero === LIVE_D[fps] && plain.zero === null)) ok = false;
      rows.push(`${fps} fps: queueCostMs ${cost.toFixed(2)} (1000 x (${LIVE_D[fps]} / 44100 - 4806 / 24000) = ${want.toFixed(2)}), latencyMs ${plain.stats.latencyMs.toFixed(2)} without and ${queued.stats.latencyMs.toFixed(2)} with`);
      plain.free(); queued.free();
    }
    check('the delay: queueCostMs is 1000 x (D / 44100 - 4806 / 24000) at 66.67, 100 and 300 fps, and stats.latencyMs with the queue is the figure without it plus queueCostMs', ok, rows.join('; '));
  }

  // A channel's start: on the layouts P and Q at 300 fps a spurt can join a running channel. spurtStart is
  // called once for each open of the render's channel (each one whose first sample the chain gives out), before
  // the mix stages are handed that sample, and at every plan of blocks before the same sample, a whole number of
  // blocks; for the first open, 512 x ceil(1323 a / 1024) - D, or 0, a the tick of the first message that reaches
  // the channel. The render's opens and their samples come from the suite's reference (referenceRender).
  {
    const rows = [];
    let ok = true, joined = 0;
    for (const [name, L, seed] of [['P', P, 1], ['P', P, 2], ['Q', Q, 1], ['Q', Q, 2]]) {
      const o = { fps: 300, seed }, src = await sourceRender(L.x, 24000, { seed }), refOpens = [];
      referenceRender(src, { fps: 300, seed }, (index) => refOpens.push(index));
      const ren = await renderGame(L.x, 24000, o);
      const firstTick = src.messages.find((m, k) => !src.trip.results[k].lost).tick;
      const first = Math.max(0, 512 * Math.ceil(1323 * firstTick / 1024) - LIVE_D[300]);
      const plans = [['480', 480], ['4,800', 4800], ['an uneven plan', unevenPlan(seed)], ...(name === 'Q' && seed === 1 ? [['1', 1]] : [])];
      let same = true, base = null;
      for (const [, plan] of plans) {
        const live = await liveGame(L.x, 24000, o, plan);
        const want = refOpens.filter((i) => i < live.G);
        if (!base) base = { live, want };
        if (!(sameAsRender(live, ren) && isDeepStrictEqual(live.starts, want) && isDeepStrictEqual(live.starts, base.live.starts))) same = false;
      }
      const { live, want } = base;
      const spurts = live.stats.spurts, appended = ren.info.channel.appended;
      if (live.starts.length < spurts) joined++;
      const good = same && want.length === ren.info.channel.opens && live.starts.length === ren.info.channel.opens
        && live.starts.every((i) => i % 512 === 0) && live.starts[0] === first && refOpens.length === ren.info.channel.opens;
      if (!good) ok = false;
      rows.push(`${name} seed ${seed}: ${live.starts.length} calls at ${live.starts.join(', ')}; the render's opens ${ren.info.channel.opens}, the sender's spurts ${spurts}, appended ${appended}; the first at ${first} (tick ${firstTick})${same ? '' : '; NOT the same at every plan'}`);
    }
    check('a channel\'s start: spurtStart is called once for each open of the render\'s channel, not once for each spurt, before the open\'s first sample, the same at every plan of blocks, on whole blocks; the first where 512 x ceil(1323 a / 1024) - D says',
      ok && joined > 0, rows.join('; '));
  }

  check('stats: with the queue stats.channel.opens is above 0 after talk; stats.arrivals is there with jitter, with the jitter given, and absent at jitter 0',
    opensSeen === SETTINGS.length && arrivalsRight, `${opensSeen} of ${SETTINGS.length} runs opened a channel`);

  // What the chain keeps: the channel and the arrival model with no end hold no more at the end of a run (12 or
  // 30 s) than after 5 s (chain.held(): the entries in their lists; steamTimeline's frame log aside, which grows
  // on either timeline: PROGRESS's deferred list).
  {
    const grows = held.map(({ rate, marks }) => ({ five: marks.find((m) => m.at >= 5 * rate).held, end: marks[marks.length - 1].held }));
    check('what the chain keeps: its channel and arrival model hold no more entries at the end of each run than after 5 s (chain.held())',
      grows.length === SETTINGS.length && grows.every((g) => g.end <= g.five) && grows.some((g) => g.five > 0),
      `after 5 s and at the end: ${[...new Set(grows.map((g) => `${g.five} then ${g.end}`))].join(', ')}`);
  }

  // The refusals.
  {
    const rate = 24000;
    const reject = async (opts) => { try { const c = await A.createLiveChain({ codec: 'steam', ...opts }, rate); c.free(); return null; } catch (e) { return e; } };
    const rendered = async (opts) => { try { await A.process(buffer(new Float32Array(2400), rate), { ...BASE, ...opts }); return null; } catch (e) { return e; } };
    const ROWS = [
      ['celt_22', { codec: 'celt_22', timeline: 'game' }, /timeline 'game'.*steam codec only/],
      ['the codec skipped', { enableWarble: false, timeline: 'game' }, /timeline 'game'.*bypassed/],
      ['lowLatency', { timeline: 'game', lowLatency: true }, /lowLatency/],
      ['arriveAt', { timeline: 'game', arriveAt: (t) => t }, /arriveAt/]
    ];
    const rows = [];
    let ok = true;
    for (const [name, opts, why] of ROWS) {
      const e = await reject(opts);
      if (!(e instanceof RangeError && why.test(e.message))) ok = false;
      rows.push(`${name}: ${e ? e.message : 'made'}`);
    }
    for (const value of ['gmae', '', 0, 'GAME']) {
      const e = await reject({ timeline: value }), r = await rendered({ timeline: value });
      if (!(e instanceof RangeError && r instanceof RangeError && e.message === r.message)) ok = false;
    }
    const kept = await reject({ timeline: 'game', lowLatency: false, arriveAt: null });
    check('the refusals: \'game\' on celt_22, with the codec skipped, with lowLatency and with arriveAt is a RangeError that names the reason; a timeline that is neither name, the render\'s own RangeError; lowLatency false and arriveAt null are taken',
      ok && kept === null, rows.join(' | '));
  }

  // The chain without the option, and with 'source', against main's.
  {
    const rate = 48000, x = talk(4, rate, 51);
    const rows = [];
    let ok = true;
    for (const [name, o] of Object.entries(LIVE_MAIN_OPTS)) {
      for (const timeline of [undefined, 'source']) {
        const gained = [], out = [];
        const chain = await A.createLiveChain({ codec: 'steam', volume: 1, ...o, ...(timeline ? { timeline } : {}), onGain: (g) => gained.push(Float32Array.from(g)) }, rate);
        try { for (let at = 0; at < x.length; at += 480) out.push(await chain.process(x.subarray(at, at + 480))); } finally { chain.free(); }
        const got = [sha256(bytesOf(join(out))), sha256(bytesOf(join(gained)))];
        if (!isDeepStrictEqual(got, LIVE_MAIN[name])) { ok = false; rows.push(`${name}, ${timeline ?? 'no timeline'}: ${got.map((h) => h.slice(0, 12)).join(' ')}`); }
      }
    }
    check('the chain with no timeline and with \'source\' gives main\'s samples, at its output and at its mix point (recorded before W3-02c-3a; four settings, celt_22 among them)', ok, rows.join('; ') || 'all eight equal');
  }

  // The arrival model with no end.
  {
    const rows = [];
    let ok = true;
    for (const jitterMs of [25, 50, 100, 500]) for (const fps of [10, 66.67, 300]) {
      const whole = A.steamArrivals({ jitterMs, fps, seed: 4 }), endless = A.steamArrivals({ jitterMs, fps, seed: 4, endless: true });
      let at = -1;
      for (let p = 0; p < 20000 && at < 0; p++) {
        const a = endless.at(p);
        if (a !== whole.at(p) || (p % 7 === 3 && endless.at(p) !== a)) at = p;
      }
      if (at >= 0) { ok = false; rows.push(`jitter ${jitterMs} at ${fps} fps differs from tick ${at}`); }
    }
    const m = A.steamArrivals({ jitterMs: 50, fps: 300, seed: 4, endless: true });
    let fell = null;
    m.at(1000);
    try { m.at(999); } catch (e) { fell = e; }
    let minute = 0;
    for (let p = 1000; p < 1000 + 240000; p++) { m.at(p); if (p === 1000 + 4000) minute = m.held(); }
    const hour = m.held();
    check('the arrival model with no end gives the whole model\'s answers tick for tick over 20,000 ticks (jitter 25, 50, 100, 500 at 10, 66.67, 300 fps; a tick asked twice gives one answer), refuses a tick below the last with a RangeError, and holds no more after an hour of ticks than after a minute (held(): its leaving ticks)',
      ok && fell instanceof RangeError && hour <= minute && minute > 0, `${rows.join('; ') || 'all twelve the same'}; held ${minute} after a minute, ${hour} after an hour; ${fell ? fell.message : 'a fall taken'}`);
  }
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

/* ---------------- 11 to 20. jitter as arrival times (BC-4) ---------------- */

// The listener's frame rate as the arrival model limits it (the voice channel's limits).
const limitFps = (fps) => Math.min(1000, Math.max(10, fps ?? 300));
const meanOf = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/* ---------------- 11. one list against a closed form ---------------- */

if (runs(11)) {
  console.log('\n[11] One list (TF2Audio.fakeLagList) against the closed form: a packet alone leaves at its i-th look past lag - j with probability p_i (1 - p_1) ... (1 - p_(i-1))');
  for (const [lagMs, jitterMs] of [[100, 50], [60, 50]]) {
    // A packet every 10 s, so each is alone in the list; the server's looks, once a tick. The
    // entries fall on three phases of the looks (10 s is 666 2/3 ticks), so each packet's
    // closed form is its own and the expected count at each look is their sum.
    const lookTime = (k) => 15 * k, list = A.fakeLagList({ lagMs, jitterMs, lookTime, rand: A.mulberry32(11) });
    const N = 20000, got = new Map(), want = new Map(), variance = new Map();
    let outside = 0;
    for (let n = 0; n < N; n++) {
      const enter = 10000 * n, form = closedForm({ lagMs, jitterMs, lookTime, enter });
      const i = Math.round(list.release(enter) / 15) - form[0].k;
      if (i < 0 || i >= form.length) outside++;
      got.set(i, (got.get(i) || 0) + 1);
      form.forEach(({ p }, m) => { want.set(m, (want.get(m) || 0) + p); variance.set(m, (variance.get(m) || 0) + p * (1 - p)); });
    }
    const rows = [...want.keys()].sort((a, b) => a - b).map((i) => ({ i, got: got.get(i) || 0, want: want.get(i), se: Math.sqrt(variance.get(i)) }));
    const worst = Math.max(...rows.map((r) => (r.se > 0 ? Math.abs(r.got - r.want) / r.se : (r.got === r.want ? 0 : Infinity))));
    const j = Math.min(jitterMs, lagMs / 2);
    check(`lag ${lagMs}, jitter ${jitterMs} (j ${j}), looks every 15 ms, ${N} packets: the share that leaves at each look past lag - j is the closed form's within 4 standard errors, and none leaves outside its looks`,
      outside === 0 && worst <= 4 && list.j === j && rows.length >= 4,
      `looks ${rows.map((r) => `${r.i + 1}: ${r.got} (${r.want.toFixed(0)})`).join(', ')}; the worst ${worst.toFixed(2)} standard errors`);
  }
}

/* ---------------- 12. the order kept, nothing lost ---------------- */

if (runs(12)) {
  console.log('\n[12] The order is kept and nothing is lost: at never falls, at(p) >= p; at jitter 25, 30, 50 and 60 the floor is reached');
  const t0 = performance.now();
  // The floor is 2 x (floor(J / 15) + 1) ticks (BC-4a's fix round, point 1): at a jitter of whole
  // ticks (30 and 60 here) a packet leaves only after the age J, so 2 x ceil(J / 15) would leave two
  // ticks of every delay above it.
  const floorOf = (jitterMs) => 2 * (Math.floor(jitterMs / 15) + 1);
  for (const jitterMs of [25, 30, 50, 60, 100, 500]) for (const fps of [300, 66.67]) {
    let ok = true, least = Infinity, most = -Infinity, floor = null;
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = A.steamArrivals({ jitterMs, fps, seed });
      floor = m.floorTicks;
      let last = -Infinity;
      for (let p = 0; p < 20000; p++) {
        const a = m.at(p);
        if (!Number.isInteger(a) || a < last || a < p) { ok = false; break; }
        least = Math.min(least, a - p); most = Math.max(most, a - p);
        last = a;
      }
    }
    check(`jitter ${jitterMs} at ${fps} fps, seeds 1 to 5, 20,000 ticks: every tick arrives on a whole tick, at never falls, at(p) >= p, floorTicks ${floorOf(jitterMs)}${jitterMs <= 60 ? ', and the least of at(p) - p is 0' : ''}`,
      ok && least >= 0 && floor === floorOf(jitterMs) && (jitterMs > 60 || least === 0),
      `at(p) - p from ${least} to ${most} ticks above the floor of ${floor}`);
  }
  const none = [A.steamArrivals({ jitterMs: 0, fps: 300, seed: 1 }), A.steamArrivals({ jitterMs: -5, seed: 1 }), A.steamArrivals({ jitterMs: NaN, seed: 1 })];
  check('jitter 0, below 0 or not a number: at(p) is p and floorTicks 0', none.every((m) => m.floorTicks === 0 && [0, 1, 777, 1e6].every((p) => m.at(p) === p)));
  const refusal = (f) => { try { f(); return null; } catch (e) { return e; } };
  const m = A.steamArrivals({ jitterMs: 50, fps: 300, seed: 1 });
  check('at() takes whole ticks from -200 on: 0.5 and -201 are a RangeError; -200 and a tick asked again give one answer',
    refusal(() => m.at(0.5)) instanceof RangeError && refusal(() => m.at(-201)) instanceof RangeError && Number.isInteger(m.at(-200)) && m.at(500) === m.at(500)
    && m.at(3) === A.steamArrivals({ jitterMs: 50, fps: 300, seed: 1 }).at(3));
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

/* ---------------- 13. the engine is the second model ---------------- */

if (runs(13)) {
  console.log('\n[13] The engine\'s arrivals (TF2Audio.steamArrivals) are the second model\'s (tests/voicequeue/reference-arrivals.mjs), tick for tick, over 4,000 ticks');
  const t0 = performance.now();
  // The order's settings, then frame rates where k x (1000 / fps) and k x 1000 / fps give
  // other ticks (the plan review's point 6), the channel's limits, and a jitter under a tick.
  const SETTINGS = [];
  for (const jitterMs of [25, 30, 50, 60, 100, 500]) for (const fps of [300, 66.67]) SETTINGS.push([jitterMs, fps, [1, 2, 3, 4, 5]]);
  for (const fps of [10, 59.94, 120, 240, 1000, undefined]) SETTINGS.push([50, fps, [1, 2]]);
  SETTINGS.push([0.5, 300, [1, 2]], [0.5, 66.67, [1]]);
  for (const [jitterMs, fps, seeds] of SETTINGS) {
    const bad = [];
    for (const seed of seeds) {
      const ref = referenceArrivals({ jitterMs, fps, seed, ticks: 4000 }), m = A.steamArrivals({ jitterMs, fps, seed });
      let at = -1;
      for (let p = 0; p < 4000 && at < 0; p++) if (m.at(p) !== ref.at[p]) at = p;
      if (at >= 0 || m.floorTicks !== ref.floorTicks || m.fps !== limitFps(fps)) bad.push(`seed ${seed} from tick ${at}`);
    }
    check(`jitter ${jitterMs} at ${fps ?? 'no given'} fps, seeds ${seeds.join(', ')}: the engine's arrival ticks and floorTicks are the second model's`, bad.length === 0,
      bad.length ? bad.join('; ') : `the delay above the floor up to ${15 * Math.max(...Array.from(referenceArrivals({ jitterMs, fps, seed: seeds[0], ticks: 4000 }).at, (a, p) => a - p))} ms (seed ${seeds[0]})`);
  }
  // The model's frame-rate limits, the voice channel's (BC-4a's fix round, point 3): 0 and 5 run as
  // 10, 2000 as 1000, tick for tick, and say so.
  const limits = [[0, 10], [5, 10], [2000, 1000]].map(([fps, as]) => {
    const m = A.steamArrivals({ jitterMs: 50, fps, seed: 2 }), n = A.steamArrivals({ jitterMs: 50, fps: as, seed: 2 });
    let same = m.fps === as;
    for (let p = 0; p < 4000 && same; p++) same = m.at(p) === n.at(p);
    return { fps, as, same };
  });
  check('frame rates past the channel\'s limits: fps 0 and 5 give the arrivals of 10, and 2000 those of 1000, tick for tick, and report that rate',
    limits.every((l) => l.same), limits.map((l) => `${l.fps}: ${l.same ? `as ${l.as}` : 'NOT as ' + l.as}`).join(', '));
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

/* ---------------- 14. the pin of figures ---------------- */

if (runs(14)) {
  console.log('\n[14] The pin (the plan review\'s point 3): seeds 1 to 20, 4,000 ticks each, jitter 50');
  // The figures are those the planner's and the plan reviewer's prototypes measured, each on
  // a reading of the model of its own (docs/work-orders/BC-4-jitter-arrivals.md, "After the
  // plan review", point 3): they hold this build to the order's step 3 (one entry in the
  // second list for every server tick, client packets riding it) and to the next head
  // looked at in the same look. The messages are steam-sender.js's for 60 s of unbroken
  // sound (the gate off), as the prototypes took them.
  const Sender = require(path.join(root, 'steam-sender.js'));
  const sound = Int16Array.from({ length: 60 * 24000 }, (_, i) => Math.round(6000 * Math.sin(i * 0.37)));
  const figures = {};
  for (const fps of [300, 66.67]) {
    const delays = [];
    let same = 0, pairs = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const m = A.steamArrivals({ jitterMs: 50, fps, seed });
      for (let p = 0; p < 4000; p++) delays.push(15 * (m.at(p) - p));
      const sender = Sender.createSender({ seed, gate: false }), msgs = sender.push(sound);
      for (const e of sender.finish()) msgs.push(e);
      let last = null;
      for (const msg of msgs.filter((e) => e.tick < 4000)) {
        const a = m.at(msg.tick);
        if (last !== null) { pairs++; if (a === last) same++; }
        last = a;
      }
    }
    figures[fps] = { mean: meanOf(delays), same: 100 * same / pairs, pairs };
  }
  const f300 = figures[300], f67 = figures[66.67];
  check('the mean delay above the floor is 69.5 +/- 3 ms at 300 fps and 95.6 +/- 3 ms at 66.67 fps',
    Math.abs(f300.mean - 69.5) <= 3 && Math.abs(f67.mean - 95.6) <= 3, `${f300.mean.toFixed(2)} and ${f67.mean.toFixed(2)} ms`);
  check('the share of voice messages that arrive on the tick of the one before is 5.2 +/- 1.5% at 300 fps',
    Math.abs(f300.same - 5.2) <= 1.5, `${f300.same.toFixed(2)}% of ${f300.pairs} (at 66.67 fps ${f67.same.toFixed(2)}%)`);
}

/* ---------------- 15. a bunch by formula ---------------- */

if (runs(15)) {
  console.log('\n[15] A bunch through opts.arriveAt (the plan review\'s point 7): 3 s of unbroken sound at 66.67 fps, the messages of ticks T to T + 39 (or T + 3) held to one tick');
  const t0 = performance.now(), rate = 24000, x = noise(3, rate, 61, 0.3), fps = 66.67;
  const rows = { 40: [], 4: [] };
  let ok40 = true, ok4 = true;
  for (const seed of [1, 2, 3, 4, 5]) {
    const src = await sourceRender(x, rate, { seed, gate: false });
    const ticks = src.messages.filter((m) => m.silence === undefined && m.last >= m.first).map((m) => m.tick);
    // T: the first tick of a message at least 1 s (67 ticks) into the phrase.
    const T = ticks.find((t) => t >= ticks[0] + 67);
    for (const hold of [40, 4]) {
      const calls = [];
      const arriveAt = (t) => { calls.push(t); return t >= T && t < T + hold ? T + hold : t; };
      const game = await gameRender(x, rate, { seed, gate: false, fps, arriveAt });
      const info = game.r.codecInfo.channel, arrivals = game.r.codecInfo.arrivals, v = game.voice;
      const ms = 1000 * info.droppedSamples / 44100;
      if (hold === 40) {
        // Where the bunch's sound is written: the voice is silent for a while during the hold
        // (the first channel faded and freed) and comes back when the second channel plays;
        // a drop during its wait is heard at the first sample it plays.
        let zeros = 0, back = -1;
        for (let i = 0; i < v.length && back < 0; i++) { if (v[i] === 0) zeros++; else { if (zeros >= 2000) back = i; zeros = 0; } }
        const near = info.drops.filter((d) => Math.abs(d.time * 44100 - back) <= 512);
        // arriveAt is asked for every tick from 0 to the render's last, once and in order.
        const everyTick = calls.length > ticks[ticks.length - 1] && calls.every((t, k) => t === k);
        const good = info.opens === 2 && info.droppedSamples > 0 && back > 0 && near.length > 0 && arrivals.floorTicks === 0
          && arrivals.sameTick >= 5 && everyTick;
        ok40 = ok40 && good;
        rows[40].push(`seed ${seed}: T ${T}, opens ${info.opens}, ${ms.toFixed(1)} ms dropped, the voice back at ${(back / 44100).toFixed(3)} s, drops at ${info.drops.map((d) => d.time.toFixed(3)).join(' ')} s`);
      } else {
        ok4 = ok4 && info.opens === 1 && info.droppedSamples === 0 && info.drops.length === 0;
        rows[4].push(`seed ${seed}: opens ${info.opens}, ${ms.toFixed(1)} ms dropped`);
      }
    }
  }
  check('a hold of 40 ticks, seeds 1 to 5: the channel is freed during it (opens 2), the bunch overflows the ring (droppedSamples above 0), and a drop is heard where the second channel first plays',
    ok40, rows[40].join('; '));
  check('a hold of 4 ticks: one open and nothing dropped, seeds 1 to 5', ok4, rows[4].join('; '));
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

/* ---------------- 16. the stream ---------------- */

if (runs(16)) {
  console.log('\n[16] The stream with jitter: createRender in odd pieces gives process()\'s samples and codecInfo, and gives out every sample no later message can reach');
  const t0 = performance.now(), rate = 24000, x = talk(8, rate, 71);
  const PIECES = [1, 7, 2, 959, 961, 13, 4097, 333, 12345, 30011, 480, 481];
  const streamed = async (o, onPush) => {
    const r = await A.createRender({ sampleRate: rate, length: x.length, numberOfChannels: 1 }, o), out = [];
    for (let at = 0, k = 0; at < x.length; k++) {
      const n = Math.min(PIECES[k % PIECES.length], x.length - at);
      out.push(await r.push(x.subarray(at, at + n)));
      at += n;
      onPush?.();
    }
    const end = await r.finish();
    out.push(end.samples);
    return { samples: join(out), codecInfo: end.codecInfo };
  };
  for (const [name, change] of [['jitter 50 ms', { jitterMs: 50 }], ['jitter 500 ms, loss 15%', { jitterMs: 500, lossPct: 15 }],
    ['jitter 50 ms at 66.67 fps, the gate off', { jitterMs: 50, fps: 66.67, gate: false }]]) {
    const o = { ...BASE, timeline: 'game', seed: 3, ...change };
    const whole = await A.process(buffer(x, rate), o);
    let got = null, error = null;
    try { got = await streamed(o); } catch (e) { error = e; }
    const at = got ? firstDiff(got.samples, whole.samples) : -2;
    check(`${name}: createRender in odd pieces gives process()'s samples and codecInfo, key for key, arrivals among them`,
      at === -1 && isDeepStrictEqual(got.codecInfo, whole.codecInfo) && whole.codecInfo.arrivals.messages > 0,
      error ? `threw ${error.message}` : `${at === -1 ? `${whole.samples.length} samples` : `the first difference at ${at}`}; arrivals ${JSON.stringify(whole.codecInfo.arrivals)}`);
  }
  // What is given out: after each push, the channel has run every block that starts before
  // the arrival tick of the stream's bound (and of each message), and no other. opts.arriveAt
  // is asked for every tick from 0 up to the highest so far, once and in order (BC-4a's fix
  // round, point 2), here the model's own arrival ticks (seed 3, jitter 50, 300 fps), so the
  // test sees each one. The voice given out at the mix point after each push is then
  // min(length, max(0, 512 ceil(1323 A / 1024) - D)) samples, A the answer for the highest tick
  // asked.
  {
    let length = 0;
    await A.process(buffer(x, rate), { ...BASE, timeline: 'game', seed: 3, onGain: (g) => { length = g.length; } });
    const model = A.steamArrivals({ jitterMs: 50, fps: 300, seed: 3 });
    const asked = [];
    let last = null, voiceOut = 0, pushes = 0, wrong = 0, moved = 0, before = 0, ahead = 0;
    const o = { ...BASE, timeline: 'game', seed: 3, arriveAt: (t) => { asked.push(t); last = model.at(t); ahead = Math.max(ahead, last - t); return last; },
      onGain: (g) => { voiceOut += g.length; } };
    await streamed(o, () => {
      pushes++;
      if (asked.length > before) moved++;
      before = asked.length;
      const want = last === null ? 0 : Math.min(length, Math.max(0, 512 * Math.ceil(1323 * last / 1024) - D[300]));
      if (voiceOut !== want) wrong++;
    });
    const inOrder = asked.every((t, k) => t === k);
    check('the stream asks the arrival of every tick up to its bound as the source comes, once each and in order, and the voice it has given out at the mix point after each push is every block that starts before the answer for the highest tick asked',
      pushes > 30 && moved > 10 && inOrder && wrong === 0 && ahead > 0 && voiceOut === length,
      `${pushes} pushes, ${moved} of them asked ticks; ticks 0 to ${asked.length - 1}${inOrder ? ' in order' : ' NOT in order'}; ${wrong} gave another count; arrival ticks up to ${ahead} ahead of the tick asked`);
  }
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

/* ---------------- 17. the file's own timing ---------------- */

if (runs(17)) {
  console.log('\n[17] The file\'s own timing: on `steam` with timeline \'source\' jitter does nothing (the order\'s "Where it runs", a and c)');
  const rate = 24000, x = talk(6, rate, 81);
  const canonical = (v) => JSON.stringify(v, (k, y) => (ArrayBuffer.isView(y) ? Array.from(y) : y));
  for (const [name, o] of [['no loss', { seed: 2 }], ['loss 15%', { seed: 2, lossPct: 15 }], ['the gate off, loss 30%', { seed: 4, gate: false, lossPct: 30 }]]) {
    const plain = await A.process(buffer(x, rate), { ...BASE, ...o });
    const jit = await A.process(buffer(x, rate), { ...BASE, ...o, jitterMs: 50 }), big = await A.process(buffer(x, rate), { ...BASE, ...o, jitterMs: 500 });
    check(`${name}: process() at jitter 50 and 500 gives the render at jitter 0, samples and codecInfo key for key, with no late frame`,
      firstDiff(plain.samples, jit.samples) === -1 && firstDiff(plain.samples, big.samples) === -1 && canonical(plain.codecInfo) === canonical(jit.codecInfo)
      && canonical(plain.codecInfo) === canonical(big.codecInfo) && jit.codecInfo.underrunFrames === 0 && !('arrivals' in jit.codecInfo),
      `${plain.samples.length} samples; ${plain.codecInfo.lostFrames} concealed frames`);
    const r = await A.createRender({ sampleRate: rate, length: x.length, numberOfChannels: 1 }, { ...BASE, ...o, jitterMs: 50 });
    const out = [];
    for (let at = 0; at < x.length; at += 4096) out.push(await r.push(x.subarray(at, Math.min(x.length, at + 4096))));
    const end = await r.finish();
    out.push(end.samples);
    check(`${name}: createRender at jitter 50 likewise`, firstDiff(join(out), plain.samples) === -1 && canonical(end.codecInfo) === canonical(plain.codecInfo));
  }
  // The live chain keeps the file's own timing: jitter does nothing there either.
  const live = async (opts) => {
    const chain = await A.createLiveChain({ codec: 'steam', volume: 1, seed: 2, ...opts }, 48000), out = [];
    try { for (let at = 0; at < x48.length; at += 480) out.push(await chain.process(x48.subarray(at, at + 480))); return { out: join(out), stats: { ...chain.stats } }; }
    finally { chain.free(); }
  };
  const x48 = talk(4, 48000, 83);
  const a = await live({ lossPct: 15 }), b = await live({ lossPct: 15, jitterMs: 50 });
  check('the live chain at jitter 50 gives the samples of the chain at jitter 0, with no late slot', firstDiff(a.out, b.out) === -1 && a.out.some((v) => v !== 0)
    && b.stats.late === 0 && b.stats.lost === a.stats.lost, `${a.out.length} samples, ${b.stats.lost} lost slots`);
}

/* ---------------- 18. the stage keys ---------------- */

if (runs(18)) {
  console.log('\n[18] The stage keys: on `steam` the codec stage does not read jitterMs (used.jitterMs 0), so a changed jitter starts from B');
  const rate = 24000, x = talk(5, rate, 91), source = buffer(x, rate);
  const hashOf = async (r) => `${sha256(new Uint8Array(await r.blob.arrayBuffer()))} ${sha256(JSON.stringify(r.codecInfo, (k, v) => (ArrayBuffer.isView(v) ? Array.from(v) : v)))}`;
  const counts = (s) => JSON.stringify(s.counts);
  for (const [name, base, B] of [['steam on the game\'s timeline', { ...BASE, timeline: 'game' }, true], ['steam on the file\'s own timing', { ...BASE }, true],
    ['celt_22', { ...BASE, codec: 'celt_22' }, false]]) {
    const stages = {};
    await A.process(source, { ...base, stages, sourceKey: 'k' });
    const before = JSON.parse(counts(stages));
    const warm = await A.process(source, { ...base, jitterMs: 100, stages, sourceKey: 'k' });
    const after = stages.counts, fresh = await A.process(source, { ...base, jitterMs: 100 });
    const tookB = after.b.reused === before.b.reused + 1 && after.b.kept === before.b.kept && after.a.kept === before.a.kept && after.a.reused === before.a.reused;
    const madeB = after.a.reused === before.a.reused + 1 && after.b.kept === before.b.kept + 1 && after.b.reused === before.b.reused;
    check(`${name}: jitterMs 100 after a render at 0 ${B ? 'takes B and keeps nothing new' : 'takes A and makes B again'}, and is the fresh render`,
      (B ? tookB : madeB) && await hashOf(warm) === await hashOf(fresh), `${counts(stages)}`);
  }
  check('the B key on `steam` holds jitterMs as 0 and on celt_22 as given',
    A.stageKeys(source, { ...BASE, sourceKey: 'k', jitterMs: 100 }).b === A.stageKeys(source, { ...BASE, sourceKey: 'k' }).b
    && A.stageKeys(source, { ...BASE, codec: 'celt_22', sourceKey: 'k', jitterMs: 100 }).b !== A.stageKeys(source, { ...BASE, codec: 'celt_22', sourceKey: 'k' }).b);
  check('opts.arriveAt keeps nothing (a function in the keys) and makes previewAllowed false',
    A.stageKeys(source, { ...BASE, timeline: 'game', sourceKey: 'k', arriveAt: (t) => t }) === null && A.previewAllowed({ ...BASE, timeline: 'game' })
    && !A.previewAllowed({ ...BASE, timeline: 'game', arriveAt: (t) => t }));
}

/* ---------------- 19. arriveAt's refusals ---------------- */

if (runs(19)) {
  console.log('\n[19] opts.arriveAt\'s refusals: it runs on the game\'s timeline only and gives whole ticks that never fall');
  const rate = 24000, x = talk(3, rate, 101);
  const thrown = async (run) => { try { await run(); return null; } catch (e) { return e; } };
  const both = async (o) => [await thrown(() => A.process(buffer(x, rate), o)),
    await thrown(async () => { const r = await A.createRender({ sampleRate: rate, length: x.length, numberOfChannels: 1 }, o); await r.push(x); await r.finish(); })];
  const ROWS = [
    ['on the file\'s own timing', { ...BASE, arriveAt: (t) => t }, /arriveAt/],
    ['on celt_22', { ...BASE, codec: 'celt_22', arriveAt: (t) => t }, /arriveAt/],
    ['not a function (5)', { ...BASE, timeline: 'game', arriveAt: 5 }, /arriveAt/],
    ['a result that is not a whole number (t + 0.5)', { ...BASE, timeline: 'game', arriveAt: (t) => t + 0.5 }, /whole number/],
    ['a result that is not a number (NaN)', { ...BASE, timeline: 'game', arriveAt: () => NaN }, /whole number/],
    ['a result below the last (100 for the first messages, then each tick)', { ...BASE, timeline: 'game', arriveAt: (t) => (t < 60 ? 100 : t) }, /never falls/],
    // BC-4a's fix round, point 2: a tick below 0 has a message of its own.
    ['a result below 0 (t - 5)', { ...BASE, timeline: 'game', arriveAt: (t) => t - 5 }, /0 or more/]
  ];
  for (const [name, o, words] of ROWS) {
    const [a, b] = await both(o);
    check(`${name}: process() and createRender() throw a RangeError that says so, the same message`, a instanceof RangeError && b instanceof RangeError && words.test(a.message) && words.test(b.message)
      && a.message === b.message, `${a ? a.message : 'process() rendered'} | ${b ? b.message : 'createRender() rendered'}`);
  }
  // arriveAt answers for every whole tick (BC-4a's fix round, point 2): process() and createRender
  // ask it for each tick from 0 to the render's last, once and in order, whatever ticks the messages
  // and the stream's bounds fall on. A table that answers the message ticks only and falls between
  // them, or that falls only after the last message, throws in both with the same message; a table
  // that answers every tick renders the same in both.
  {
    const src = await sourceRender(x, rate, {}), ticks = src.messages.map((m) => m.tick), lastTick = ticks[ticks.length - 1];
    const messageTicks = new Set(ticks);
    for (const [name, arriveAt] of [['answers the message ticks only (each 5 ticks late) and 0 between them', (t) => (messageTicks.has(t) ? t + 5 : 0)],
      ['answers every tick up to the last message\'s, then 0', (t) => (t <= lastTick ? t : 0)]]) {
      const [a, b] = await both({ ...BASE, timeline: 'game', arriveAt });
      check(`a table that ${name}: process() and createRender() throw the same RangeError`, a instanceof RangeError && b instanceof RangeError
        && /never falls/.test(a.message) && a.message === b.message, `${a ? a.message : 'process() rendered'} | ${b ? b.message : 'createRender() rendered'}`);
    }
    const table = (t) => 4 * Math.floor(t / 4) + 6, o = { ...BASE, timeline: 'game', jitterMs: 70 };
    const asked = { whole: [], stream: [] };
    const whole = await A.process(buffer(x, rate), { ...o, arriveAt: (t) => { asked.whole.push(t); return table(t); } });
    const r = await A.createRender({ sampleRate: rate, length: x.length, numberOfChannels: 1 }, { ...o, arriveAt: (t) => { asked.stream.push(t); return table(t); } });
    const out = [];
    for (let at = 0; at < x.length; at += 997) out.push(await r.push(x.subarray(at, Math.min(x.length, at + 997))));
    const end = await r.finish();
    out.push(end.samples);
    const inOrder = (xs) => xs.every((t, k) => t === k);
    check('a table that answers every tick (bunches of four ticks): process() and createRender() ask ticks 0 to the render\'s last, once and in order, the same in both, and give the same samples and codecInfo',
      firstDiff(join(out), whole.samples) === -1 && isDeepStrictEqual(end.codecInfo, whole.codecInfo) && inOrder(asked.whole) && inOrder(asked.stream)
      && asked.whole.length === asked.stream.length && asked.whole.length > lastTick + 1,
      `ticks 0 to ${asked.whole.length - 1} and 0 to ${asked.stream.length - 1}; the last message on tick ${lastTick}`);
    // BC-4a's fix round, point 3: codecInfo.arrivals.jitterMs under arriveAt is the render's jitterMs.
    check('under arriveAt, codecInfo.arrivals reports the render\'s jitterMs (70) and fps, with floorTicks 0', whole.codecInfo.arrivals.jitterMs === 70
      && whole.codecInfo.arrivals.fps === 300 && whole.codecInfo.arrivals.floorTicks === 0, JSON.stringify(whole.codecInfo.arrivals));
  }
  const ok = await thrown(() => A.process(buffer(x, rate), { ...BASE, timeline: 'game', arriveAt: (t) => 50 }));
  const same = await A.process(buffer(x, rate), { ...BASE, timeline: 'game', arriveAt: () => 50 });
  check('the same tick for every message (50) renders: every message but the first on the tick of the one before', ok === null
    && same.codecInfo.arrivals.sameTick === same.codecInfo.arrivals.messages - 1 && same.codecInfo.arrivals.floorTicks === 0,
    JSON.stringify(same.codecInfo.arrivals));
  const plain = await A.process(buffer(x, rate), { ...BASE, timeline: 'game' }), identity = await A.process(buffer(x, rate), { ...BASE, timeline: 'game', arriveAt: (t) => t });
  check('arriveAt (t) => t gives the render without it, with arrivals of no delay', firstDiff(plain.samples, identity.samples) === -1
    && identity.codecInfo.arrivals.maxMs === 0 && identity.codecInfo.arrivals.meanMs === 0 && !('arrivals' in plain.codecInfo), JSON.stringify(identity.codecInfo.arrivals));
}

/* ---------------- 20. determinism ---------------- */

if (runs(20)) {
  console.log('\n[20] Determinism: the same seed gives the same render and loses the same messages at any jitter; another seed gives other arrival ticks');
  const rate = 24000, x = talk(8, rate, 111), o = { ...BASE, timeline: 'game', jitterMs: 50 };
  const a = await A.process(buffer(x, rate), { ...o, seed: 5 }), b = await A.process(buffer(x, rate), { ...o, seed: 5 });
  check('seed 5 twice at jitter 50: the same samples and codecInfo', firstDiff(a.samples, b.samples) === -1 && isDeepStrictEqual(a.codecInfo, b.codecInfo));
  const lostBy = async (opts) => {
    const real = engine.codec, seen = [];
    engine.codec = { ...real, steamRoundTrip: (m, bb, oo) => real.steamRoundTrip(m, bb, { ...oo, lose: (k, msg) => { const v = oo.lose(k, msg); if (v) seen.push(k); return v; } }) };
    try { await A.process(buffer(x, rate), opts); } finally { engine.codec = real; }
    return seen.join();
  };
  const at0 = await lostBy({ ...o, jitterMs: 0, seed: 5, lossPct: 30 }), at50 = await lostBy({ ...o, seed: 5, lossPct: 30 }), at500 = await lostBy({ ...o, jitterMs: 500, seed: 5, lossPct: 30 });
  const other = await lostBy({ ...o, seed: 6, lossPct: 30 });
  check('loss 30%, seed 5: the same messages lost at jitter 0, 50 and 500; seed 6 loses others', at0.length > 0 && at0 === at50 && at0 === at500 && other !== at0,
    `seed 5: messages ${at0.split(',').slice(0, 10).join(', ')}, ...`);
  const m5 = A.steamArrivals({ jitterMs: 50, fps: 300, seed: 5 }), m6 = A.steamArrivals({ jitterMs: 50, fps: 300, seed: 6 });
  let differ = 0;
  for (let p = 0; p < 4000; p++) if (m5.at(p) !== m6.at(p)) differ++;
  const c = await A.process(buffer(x, rate), { ...o, seed: 6 });
  check('seeds 5 and 6 give other arrival ticks (the model and the render\'s codecInfo.arrivals)', differ > 1000 && !isDeepStrictEqual(a.codecInfo.arrivals, c.codecInfo.arrivals),
    `${differ} of 4,000 ticks differ; ${JSON.stringify(a.codecInfo.arrivals)} against ${JSON.stringify(c.codecInfo.arrivals)}`);
}

console.log(`\n${passed} render-channel checks passed, ${failed} failed`);
if (failed) process.exitCode = 1;
