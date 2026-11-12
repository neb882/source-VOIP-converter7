// A render on the game's timeline (W3-02c-2, docs/work-orders/W3-02c2-render-channel.md):
// TF2Audio.process and TF2Audio.createRender with opts.timeline 'game' play the `steam`
// render's packets through the receiver's voice channel (voice-channel.js).
//
//   node tests/render-channel.verify.mjs          every check
//   node tests/render-channel.verify.mjs 3 6      only those (the numbers below)
//
//  1. The render is the module's: a reference made here, from a 'source' render's
//     messages, codec results and resampled packets and voice-channel.js loaded by this
//     test, gives the 'game' render's voice and codecInfo.channel.
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
// 10. The live chain does not run the channel.
// Renders use deviceRate 44100 and compare the voice at the mix point (opts.onGain).
// TF2_DIR points the suite at a copy of the sources. Every signal is synthetic, made here.
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { loadEngine, sourceRoot } from './lib/engine.cjs';

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
// A 'source' render, with what the reference is made from: the sender's messages and the
// codec's result for each (the codec module's steamRoundTrip wrapped, as
// tests/steam.verify.js wraps it), each resampled packet (onResampled) and the voice at
// the mix point (onGain).
async function sourceRender(x, rate, opts = {}) {
  const real = engine.codec;
  let messages = null, trip = null, voice = null;
  const packets = [];
  engine.codec = { ...real, steamRoundTrip: async (m, b, o) => { messages = m; trip = await real.steamRoundTrip(m, b, o); return trip; } };
  try {
    const r = await A.process(buffer(x, rate), { ...BASE, ...opts, onResampled: (y) => packets.push(Int16Array.from(y)),
      onGain: (g) => { voice = Float32Array.from(g); } });
    return { r, messages, trip, packets, voice };
  } finally { engine.codec = real; }
}
// A 'game' render: the render and its voice at the mix point.
async function gameRender(x, rate, opts = {}) {
  let voice = null;
  const r = await A.process(buffer(x, rate), { ...BASE, ...opts, timeline: 'game', onGain: (g) => { voice = Float32Array.from(g); } });
  return { r, voice };
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
// The channel driven by the test: each message in the sender's order, on its own tick.
//   a sound packet that arrived: the resampler's Int16Array over 32768, whole, at its place
//     (the spurt's anchor round((start - lookahead) x 44100 / 24000) of its first message,
//     arrived or lost, then where the last packet played or refused ended, plus 882 for
//     each frame in front of it that no block stands for);
//   a silence record: its resampled zeros at -1;
//   an end marker alone (arrived, no samples): an empty packet at the cursor;
//   a refused packet (over 11,264 samples): an empty packet at its place;
//   a lost message: nothing.
function referenceRender(src, set) {
  const { messages, trip, packets, voice } = src;
  const L = trip.lookahead;
  const { gain, use } = referenceGain(set);
  const tl = VC.createTimeline({ length: voice.length, fps: set.fps, bufferMs: set.bufferMs, codecDelay: L / 24000, gain });
  const out = [], kinds = { sound: 0, record: 0, empty: 0, refused: 0, lost: 0 };
  const push = (tick, pcm, source, blocks = []) => { use(blocks); out.push(tl.push({ tick, pcm, source })); };
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
  return { samples: join(out), info: end.info, kinds, used: p === packets.length };
}

/* ---------------- 1 and 2. the module's render, and the logs ---------------- */

if (runs(1, 2)) {
  const t0 = performance.now();
  const x = talk(12, 24000, 3);
  // [name, the options of both renders, the channel's options]
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
    ['loss 15%, jitter 100 ms', { lossPct: 15, jitterMs: 100 }, {}],
    ['jitter 200 ms at 66.67 fps', { jitterMs: 200 }, { fps: 66.67 }],
    ['loss 60% at 66.67 fps', { lossPct: 60 }, { fps: 66.67 }],
    ['the gate off, loss 40% (long runs lost: refused packets)', { gate: false, lossPct: 40 }, {}]
  ];
  const done = [], total = { sound: 0, record: 0, empty: 0, refused: 0, lost: 0 };
  for (const [name, opts, channel] of SETTINGS) {
    const seed = done.length + 1, both = { ...opts, seed };
    const src = await sourceRender(x, 24000, both), game = await gameRender(x, 24000, { ...both, ...channel });
    const ref = referenceRender(src, { ...opts, ...channel });
    for (const k of Object.keys(total)) total[k] += ref.kinds[k];
    done.push({ name, opts, channel, src, game, ref });
  }
  if (runs(1)) {
    console.log('\n[1] The render is the module\'s: a reference of the test\'s own over voice-channel.js gives the \'game\' voice and codecInfo.channel');
    for (const { name, channel, game, ref } of done) {
      const at = firstDiff(game.voice, ref.samples), info = game.r.codecInfo.channel;
      check(`${name}: the 'game' voice at the mix point is the reference's, sample for sample, and codecInfo.channel its info, member for member`,
        at === -1 && ref.used && isDeepStrictEqual(info, ref.info),
        at === -1 ? `${ref.samples.length} samples; ${ref.info.packets} packets, ${ref.info.opens} opens, ${ref.info.spurts.length} spurts, ${ref.info.drops.length} drops; pushed ${JSON.stringify(ref.kinds)}`
          : `the first difference at ${at}: ${game.voice[at] * 32768} against ${ref.samples[at] * 32768}; info ${isDeepStrictEqual(info, ref.info) ? 'equal' : 'differs'}`);
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
    for (const { name, src, game } of done) {
      const s = src.r.codecInfo, g = game.r.codecInfo, L = s.lookahead, slots = g.channel.source;
      const want = { frameLog: new Uint8Array(s.frameLog.length), frameBytes: new Uint16Array(s.frameBytes.length) };
      for (let i = 0; i < want.frameLog.length; i++) {
        const at = i < slots.length ? slots[i] : -1;
        if (at === -1) continue;
        const k = Math.floor((at * 80 / 147 + L) / 480);
        want.frameLog[i] = s.frameLog[k] ?? 0;
        want.frameBytes[i] = s.frameBytes[k] ?? 0;
      }
      const rest = (info) => { const { frameLog, frameBytes, sent, channel, ...others } = info; return others; };
      check(`${name}: sent is the 'source' render's frameLog and frameBytes; network ${s.network ? 'equal' : 'absent on both'}; the counters the 'source' render's; no retimed`,
        isDeepStrictEqual(g.sent, { frameLog: s.frameLog, frameBytes: s.frameBytes }) && isDeepStrictEqual(g.network, s.network)
        && isDeepStrictEqual(rest(g), rest(s)) && !('retimed' in g), s.network ? JSON.stringify(s.network) : '');
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
// that moves the truncation only where b - a is a whole multiple of 1000 and the sum is
// whole, and there either side is the module's. blends(S, m): the one or two values.
const blends = (S, m) => {
  const v = S[m] + (S[m + 1] - S[m]) * 0.999;
  return [Math.trunc(v - 1e-7) + 0, Math.trunc(v + 1e-7) + 0];
};
const blendIs = (g, S, m) => { const [a, b] = blends(S, m); return g === a || g === b; };
// A single shift d with G[n + i] the blend of S at n + i + d for i = 0..width - 1, at the first
// of the windows n, n + 300, ... that holds no packet's edge (the dropped sample breaks a
// single d), or null.
function shiftAt(G, S, n, width = 200, reach = 44100) {
  for (let q = 0; q < 10; q++) {
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
    check(`seed ${seed}: opens 3 and gainResets 3; the voice is zero but one run after each open, at most 127 samples long with at least 40 not zero; the appended spurt adds none`,
      info.opens === 3 && info.gainResets === 3 && info.appended === 1 && placed && runs.every((u) => u.last - u.first + 1 <= 127 && u.count >= 40),
      `${runs.length} runs: ${runs.map((u) => `${u.last - u.first + 1} long, ${u.count} not zero`).join('; ')}; opens ${info.opens}, gainResets ${info.gainResets}`);
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
  for (const fps of [300, 66.67]) {
    // How far the samples returned fall behind the source given, both counted at 44.1 kHz.
    let behind = 0;
    const got = await streamed(960, { ...opts, fps }, (given, returned) => { behind = Math.max(behind, Math.round(given * 44100 / rate) - returned); });
    const want = fps === 300 ? whole : await A.process(buffer(x, rate), { ...opts, fps });
    check(`${fps} fps, pieces of 960: the samples returned never fall more than D + 2,048 behind the source given, and are process()'s`,
      behind <= D[fps] + 2048 && firstDiff(got.samples, want.samples) === -1,
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
    ['the codec bypassed', { enableWarble: false }], ['a demo\'s received voice', { received }], ['retime on', { retime: true }],
    ['timeline \'gmae\'', { timeline: 'gmae' }]
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

/* ---------------- 10. the live chain ---------------- */

if (runs(10)) {
  console.log('\n[10] The live chain does not run the channel');
  const rate = 48000, x = talk(4, rate, 51);
  const live = async (opts) => {
    const chain = await A.createLiveChain({ codec: 'steam', volume: 1, ...opts }, rate), out = [];
    try { for (let at = 0; at < x.length; at += 480) out.push(await chain.process(x.subarray(at, at + 480))); } finally { chain.free(); }
    return join(out);
  };
  const plain = await live({}), game = await live({ timeline: 'game', fps: 66.67, bufferMs: 200 });
  let loud = 0;
  for (const v of plain) if (v) loud++;
  check('a chain made with timeline \'game\', fps 66.67 and bufferMs 200 gives the samples of one made without', loud > 0 && firstDiff(plain, game) === -1,
    `${plain.length} samples, ${loud} not zero`);
}

console.log(`\n${passed} render-channel checks passed, ${failed} failed`);
if (failed) process.exitCode = 1;
