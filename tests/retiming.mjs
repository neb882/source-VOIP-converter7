/* Talk-spurt re-timing (REFERENCE_2026.md, finding 21): TF2's receiver
 * against a queue model, from the accuracy suite's results.
 *
 * The queue model: the receiver holds l seconds of voice ahead of playback.
 * A spurt that starts on an empty queue waits the restart latency L0. After
 * each spurt the sender sends a 62.5 ms silence record (demo.js shows it
 * after every end of transmission). If the next spurt's first packet
 * arrives g seconds after the previous one ended and l + 62.5 ms > g, the
 * spurt is appended: it starts g - 62.5 ms early and the queue shrinks by
 * as much. Otherwise the queue has drained and the spurt restarts at L0.
 *
 *   node tests/retiming.mjs --accuracy results.json [--demo voicetest.dem] [--jitter 0.03]
 *   node tests/retiming.mjs --accuracy results.json --generative [--takes <folder>] [--seeds 4000] [--shift ms]
 *   node tests/retiming.mjs --accuracy results.json --generative --engine [--fps 300] [--seeds 200] ...
 *
 * results.json is `pnpm accuracy --takes <folder> --json results.json`.
 * With the Set D SourceTV demo, the Set D takes are checked transition by
 * transition against the packets' arrival at the server. Every take is then
 * predicted transition by transition from its own earlier transitions only
 * (the model learns the session's L0), against the app's current rule (a
 * 41% chance after a silence of at most 0.45 s, `voice_retime`).
 *
 * --generative adds, after the output above, the queue model as a render
 * could run it: from the gate model's talk spurts alone, with every
 * parameter fixed in GEN below (docs/reports/W3-01-phrase-timing.md says
 * where each comes from). With --takes, the folder of recordings, it also
 * reads each take's source WAV for the pauses inside a spurt at which Steam
 * ends one spurt and starts the next.
 *
 * --engine adds a third model to section 2 of --generative: the game's own
 * path. Each take's gate-model spurts become a 24 kHz signal that is 1000
 * in the loud part of a spurt (its start + 0.12 s to its end - 0.44 s: the
 * gate model's pre-roll and hold taken off) and 0 elsewhere; it goes through
 * Steam's sender (steam-sender.js) and the receiver's channel on the game's
 * clock (voice-channel.js, createTimeline) at --fps (300), seeds 1 to
 * --seeds (200 for this model when not given). A spurt's start and end are
 * the timeline's offsets at 0.2 s into it and at its last sample.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const D = require('../demo.js');
const arg = (name, fallback = null) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const accuracyFile = arg('--accuracy'), demoFile = arg('--demo'), J = Number(arg('--jitter', .03));
if (!accuracyFile) { console.log('node tests/retiming.mjs --accuracy results.json [--demo voicetest.dem] [--jitter 0.03]'); process.exit(1); }
const accuracy = JSON.parse(fs.readFileSync(accuracyFile, 'utf8'));

const SILENCE = .0625;   // the silence record after each end of transmission (1500 samples at 24 kHz)
const EARLY = -80, LATE = 80;
const kindOf = (ms) => (ms <= EARLY ? 'early' : ms >= LATE ? 'late' : 'kept');
const mark = { early: 'E', late: 'L', kept: '.' };

// Every transition from one gate-model spurt to the next: the silence
// between them in the gate model and the change in delay across it.
const transitions = [];
for (const r of accuracy.results) {
  if (!r.timeline || !r.gateSpurts || r.random) continue;
  const segs = r.timeline.segments, gs = r.gateSpurts;
  for (let k = 1; k < gs.length; k++) {
    const prev = segs.filter(s => s.spurt === k - 1), next = segs.filter(s => s.spurt === k);
    if (!prev.length || !next.length) continue;
    const change = next[0].delayMs - prev[prev.length - 1].delayMs;
    transitions.push({ take: r.name, set: r.set, k, gap: gs[k].start - gs[k - 1].end, change, kind: kindOf(change) });
  }
}
for (const t of transitions) { const p = transitions.find(x => x.take === t.take && x.k === t.k - 1); t.afterEarly = !!(p && p.kind === 'early'); }
console.log('\nTransitions (gate-model silence in ms : delay change in ms, E early, L late)');
for (const take of [...new Set(transitions.map(t => t.take))]) {
  console.log(`  ${take.padEnd(26)} ${transitions.filter(t => t.take === take).map(t => `${Math.round(t.gap * 1000)}:${Math.round(t.change)}${mark[t.kind]}`).join(' ')}`);
}

// Set D: the arrival gap of each of Steam's own spurts at the server.
if (demoFile) {
  const parsed = D.parse(fs.readFileSync(demoFile));
  const tick = parsed.intervalPerTick, spurts = [];
  let cur = null;
  for (const p of parsed.speakers[0].packets) {
    if (p.kind === 'end') { if (cur) spurts.push(cur); cur = null; continue; }
    if (p.kind !== 'opus') continue;
    if (!cur) cur = { t0: p.tick * tick, frames: 0 };
    cur.frames++;
  }
  if (cur) spurts.push(cur);
  // Server time minus test-signal time: the offset that puts the most of
  // Steam's spurt starts within 0.1 s of a gate-model spurt start.
  const takes = accuracy.results.filter(r => r.set === 'D' && r.timeline);
  const starts = takes[0].gateSpurts.map(g => g.start);
  const score = (o) => spurts.filter(sp => starts.some(st => Math.abs(sp.t0 - o - st) < .1)).length;
  const offset = spurts.flatMap(sp => starts.map(st => sp.t0 - st)).reduce((best, o) => (score(o) > score(best) ? o : best));
  const rows = spurts.slice(1).map((b, i) => {
    const a = spurts[i], dur = a.frames * .02;
    return { k: i + 1, gap: b.t0 - a.t0 - dur, start: b.t0 - offset, end: a.t0 - offset + dur };
  });
  const simulate = (L0) => {
    let l = L0;
    return rows.map(r => { const next = l + SILENCE - r.gap > 0 ? l + SILENCE - r.gap : L0; const c = (next - l) * 1000; l = next; return c; });
  };
  console.log(`\nSet D: ${spurts.length} Steam spurts; arrival gaps from the demo (${Math.round(tick * 4000)} ms resolution: SourceTV writes voice every 4 ticks)`);
  for (const take of takes) {
    const delayAt = (t) => (take.timeline.segments.find(x => t >= x.start && t < x.end) || take.timeline.segments[take.timeline.segments.length - 1]).delayMs;
    const observed = rows.map(r => delayAt(r.start + .05) - delayAt(r.end - .05));
    // Spurts whose packets overlap (gap under 0.1 s) are one spurt in the gate
    // model: their change is not observable, but they still move the queue.
    const fits = [];
    for (let L0 = .1; L0 <= .8 + 1e-9; L0 += .005) {
      const p = simulate(L0);
      if (rows.every((r, i) => r.gap < .1 || kindOf(p[i]) === kindOf(observed[i]))) fits.push(Math.round(L0 * 1000));
    }
    const L0 = fits.length ? fits[Math.floor(fits.length / 2)] / 1000 : null, pred = L0 !== null ? simulate(L0) : null;
    const largest = Math.max(...observed.map(Math.abs));
    console.log(`  ${take.name}: ${fits.length ? `every observable transition reproduced for L0 ${fits[0]}-${fits[fits.length - 1]} ms` : 'no single L0 reproduces every transition'}; largest change ${Math.round(largest)} ms`);
    console.log(`    ${rows.map((r, i) => `${Math.round(r.gap * 1000)}:${Math.round(observed[i])}${r.gap < .1 ? '(merged)' : mark[kindOf(observed[i])]}${pred ? `/${Math.round(pred[i])}` : ''}`).join(' ')}`);
  }
}

// Prequential comparison: each transition predicted from the take's earlier ones.
const B = .03, FLOOR = .02;   // gate-model silences run ~30 ms longer than Steam's arrival gaps (Set D)
const L0s = Array.from({ length: 61 }, (_, i) => .25 + i * .005);
let totalM = 0, totalR = 0, n = 0;
console.log(`\nPrequential log-likelihood (queue model with arrival jitter ±${J * 1000} ms, against the current rule)`);
for (const take of [...new Set(transitions.map(t => t.take))]) {
  const rows = transitions.filter(t => t.take === take);
  let w = L0s.map(() => 1 / L0s.length), l = L0s.slice(), M = 0, R = 0;
  for (const r of rows) {
    const g = r.gap - B, early = r.kind === 'early';
    const p = l.map(x => Math.min(1, Math.max(0, (x + SILENCE - (g - J)) / (2 * J))));
    const pM = Math.min(1 - FLOOR, Math.max(FLOOR, p.reduce((s, x, i) => s + w[i] * x, 0)));
    const pR = Math.min(1 - FLOOR, Math.max(FLOOR, r.gap <= .45 && !r.afterEarly ? .41 : 0));
    M += Math.log(early ? pM : 1 - pM); R += Math.log(early ? pR : 1 - pR);
    w = w.map((x, i) => x * Math.max(FLOOR, early ? p[i] : 1 - p[i]));
    const sum = w.reduce((a, b) => a + b, 0); w = w.map(x => x / sum);
    l = l.map((x, i) => (early ? Math.max(0, x + r.change / 1000) : r.kind === 'late' ? L0s[i] : x));
  }
  const learnt = L0s.reduce((s, x, i) => s + w[i] * x, 0);
  console.log(`  ${take.padEnd(26)} ${String(rows.length).padStart(2)} transitions: queue ${M.toFixed(1).padStart(6)}, rule ${R.toFixed(1).padStart(6)}; L0 learnt ${Math.round(learnt * 1000)} ms`);
  totalM += M; totalR += R; n += rows.length;
}
console.log(`  all ${n}: queue ${(totalM / n).toFixed(3)} per transition, rule ${(totalR / n).toFixed(3)}`);

// ---------------------------------------------------------------------------
// --generative: the queue model from the source alone, parameters fixed.
// ---------------------------------------------------------------------------
if (process.argv.includes('--generative')) {
  // Fixed before the held-out takes were scored (W3-01). L0: the restart
  // latency, from Set D and the four test-signal takes (largest early start
  // 350 ms; Set D's packets allow at most 375). hold and preroll: Steam's own
  // ranges in the Set D demo (finding 12), against the gate model's 440 and
  // 120 ms. The queue never exceeds L0 (the receiver trims what is over).
  const GEN = { L0: .35, silence: SILENCE, hold: [.425, .485], preroll: [.115, .152], modelHold: .44, modelPreroll: .12, thresholdDb: -39.5 };
  const HELD_OUT = new Set(['take4_my_own_speech', 'net_baseline']);
  const seeds = Number(arg('--seeds', 4000)), takesFolder = arg('--takes');
  const mulberry32 = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const uniform = (rand, [a, b]) => a + (b - a) * rand();
  const classes = ['early', 'late', 'kept'];
  // --engine: the sender and the game's timeline, run on each take's gate-model spurts.
  const engine = process.argv.includes('--engine');
  const engineSeeds = Number(arg('--seeds', 200)), engineFps = Number(arg('--fps', 300));
  const E = engine ? await import('./voicequeue/synthetic-results.mjs') : null;
  const engineRun = (r, rows, seed) => {
    const loud = r.gateSpurts.map(g => [g.start + GEN.modelPreroll, g.end - GEN.modelHold]).filter(([a, b]) => b > a);
    const seconds = Math.max(...r.gateSpurts.map(g => g.end)) + 1;
    const offs = E.offsetsOf(E.engineRun({ loud, seconds, fps: engineFps, seed }).info, r.gateSpurts.map(g => [g.start, g.end]));
    return rows.map(x => { const o = offs[x.k], start = o.start !== null ? o.start : 0; return { start: start / 1000, end: (o.end !== null ? o.end : start) / 1000 }; });
  };

  // One arrival: the queue after a spurt whose first packet comes g seconds
  // after the end of the one before it.
  const arrive = (l, g) => (l + GEN.silence - g > 0 ? Math.min(GEN.L0, l + GEN.silence - g) : GEN.L0);
  // The arrival gap for a silence of `gap` in the gate model: Steam's hold
  // and pre-roll in place of the model's.
  // --shift <ms> adds a constant to every gap: an exploration only (the report
  // says what it shows); the fixed model has none.
  const shift = Number(arg('--shift', 0)) / 1000;
  const arrivalGap = (gap, rand) => gap + shift + (GEN.modelHold - uniform(rand, GEN.hold)) + (GEN.modelPreroll - uniform(rand, GEN.preroll));

  // The pauses inside each gate-model spurt that are long enough for Steam's
  // hold to run out (from the source WAV: 16-bit PCM, first channel).
  const key = (name) => name.toLowerCase().replace(/[^a-z0-9.]/g, '');
  const files = new Map();
  const walk = (dir, depth) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const full = `${dir}/${e.name}`; if (e.isDirectory() && depth < 2) walk(full, depth + 1); else if (e.isFile() && !files.has(key(e.name))) files.set(key(e.name), full); } };
  if (takesFolder && fs.existsSync(takesFolder)) walk(takesFolder, 0);
  const local = new URL('./testsignal/', import.meta.url).pathname;
  if (fs.existsSync(local)) walk(local.replace(/\/$/, ''), 2);
  const pausesOf = (r) => {
    const file = files.get(key(r.source || ''));
    if (!file || !/\.wav$/i.test(file)) return null;
    const b = fs.readFileSync(file);
    let at = 12, fmt = null, data = null;
    while (at + 8 <= b.length) { const id = b.toString('latin1', at, at + 4), size = b.readUInt32LE(at + 4); if (id === 'fmt ') fmt = { channels: b.readUInt16LE(at + 10), rate: b.readUInt32LE(at + 12), bits: b.readUInt16LE(at + 22), format: b.readUInt16LE(at + 8) }; if (id === 'data') { data = [at + 8, Math.min(size, b.length - at - 8)]; break; } at += 8 + size + (size & 1); }
    if (!fmt || !data || fmt.bits !== 16 || fmt.format !== 1) return null;
    const step = 2 * fmt.channels, frame = Math.round(fmt.rate / 50), count = Math.floor(data[1] / step / frame), threshold = 10 ** (GEN.thresholdDb / 20);
    const loud = new Uint8Array(count);
    for (let f = 0; f < count; f++) { let e = 0; for (let i = 0; i < frame; i++) { const v = b.readInt16LE(data[0] + (f * frame + i) * step) / 32768; e += v * v; } loud[f] = Math.sqrt(e / frame) > threshold ? 1 : 0; }
    const out = r.gateSpurts.map(() => []);
    let last = -1;
    for (let f = 0; f < count; f++) {
      if (!loud[f]) continue;
      const pause = (f - last - 1) * .02, t = f * .02, k = r.gateSpurts.findIndex(g => t >= g.start && t < g.end);
      if (last >= 0 && k >= 0 && (last + 1) * .02 >= r.gateSpurts[k].start && pause > GEN.hold[0]) out[k].push(pause);
      last = f;
    }
    return out;
  };

  // The take as measured: each spurt's first and last delay, and the restart
  // level (the median of the highest third of the spurts' last delays).
  const measured = (r) => {
    const segs = r.timeline.segments, rows = [];
    r.gateSpurts.forEach((g, k) => { const mine = segs.filter(s => s.spurt === k); if (mine.length) rows.push({ k, first: mine[0].delayMs, last: mine[mine.length - 1].delayMs, gap: k ? g.start - r.gateSpurts[k - 1].end : null }); });
    const top = rows.map(x => x.last).sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(rows.length / 3)));
    return { rows, level: top[Math.floor(top.length / 2)] };
  };

  // The current rule as a simulation of spurt offsets (audio.js RETIME).
  const ruleRun = (gaps, rand) => { let early = false; return gaps.map((gap) => { if (early || gap > .45 || rand() >= .41) { early = false; return 0; } early = true; return -Math.min(.35, gap - .13 * rand()); }); };
  // The queue model: each spurt's offset from the restart level at its start
  // and at its end (pauses inside it can refill the queue).
  const queueRun = (gaps, pauses, rand) => {
    let l = GEN.L0; const out = [];
    gaps.forEach((gap, i) => {
      if (i) l = arrive(l, arrivalGap(gap, rand));
      const start = l - GEN.L0;
      for (const pause of (pauses && pauses[i]) || []) { const hold = uniform(rand, GEN.hold), pre = uniform(rand, GEN.preroll); if (pause > hold) l = arrive(l, Math.max(0, pause - hold - pre)); }
      out.push({ start, end: l - GEN.L0 });
    });
    return out;
  };

  console.log(`\nGenerative queue model, parameters fixed: L0 ${GEN.L0 * 1000} ms (also the most the queue holds), silence record ${GEN.silence * 1000} ms, Steam's hold ${GEN.hold.map(x => x * 1000).join('-')} ms and pre-roll ${GEN.preroll.map(x => x * 1000).join('-')} ms (uniform)`);
  if (shift) console.log(`EXPLORATION, not the fixed model: every arrival gap lengthened by ${shift * 1000} ms`);
  if (engine) console.log(`Engine (section 2): Steam's sender and the receiver's channel on the game's clock at ${engineFps} fps, seeds 1 to ${engineSeeds}; the loud part of each gate-model spurt is its start + ${GEN.modelPreroll * 1000} ms to its end - ${GEN.modelHold * 1000} ms`);
  console.log(`Held out: ${[...HELD_OUT].join(', ')}. ${seeds} seeds per take and model.`);
  console.log('\n1. One step ahead (each transition from the take\'s own delay before it; log-likelihood of early/late/kept, floor 0.02; size: mean error in ms of the predicted change where the take moved)');
  console.log('   take                        n   queue    rule   none | size error, ms: queue  rule  (moved)');
  const levelOf = (rows) => { const top = rows.map(x => x.last).sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(rows.length / 3))); return top[Math.floor(top.length / 2)]; };
  const floored = (p) => { const q = classes.map(c => Math.max(FLOOR, p[c])), t = q.reduce((a, b) => a + b, 0); return Object.fromEntries(classes.map((c, j) => [c, q[j] / t])); };
  // Rows of { k, first, last, gap } (delays in ms): both models' scores, each
  // transition predicted from the delay before it.
  const oneStep = (rows, draws, rand, detail = null) => {
    const level = levelOf(rows);
    let Q = 0, R = 0, N = 0, n = 0, sizeQ = 0, sizeR = 0, moved = 0, prevChange = 0, prevKind = 'kept';
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].k !== rows[i - 1].k + 1) { prevKind = 'kept'; continue; }
      const gap = rows[i].gap, change = rows[i].first - rows[i - 1].last, kind = kindOf(change);
      const l = Math.min(GEN.L0, Math.max(0, GEN.L0 + (rows[i - 1].last - level) / 1000));
      const count = { early: 0, late: 0, kept: 0 }, sum = { early: 0, late: 0, kept: 0 };
      for (let s = 0; s < draws; s++) { const c = (arrive(l, arrivalGap(gap, rand)) - l) * 1000, k = kindOf(c); count[k]++; sum[k] += c; }
      const pQ = floored(Object.fromEntries(classes.map(c => [c, count[c] / draws])));
      const pR = floored(prevKind === 'early' ? { early: 0, late: 1, kept: 0 } : gap <= .45 ? { early: .41, late: 0, kept: .59 } : { early: 0, late: 0, kept: 1 });
      const pN = floored({ early: 0, late: 0, kept: 1 });
      Q += Math.log(pQ[kind]); R += Math.log(pR[kind]); N += Math.log(pN[kind]); n++;
      // The size each model gives a move of this kind (the queue's mean over its draws of that kind, or, when it had none, its mean over all).
      const q = count[kind] ? sum[kind] / count[kind] : (sum.early + sum.late + sum.kept) / draws;
      const rule = kind === 'early' ? -1000 * Math.min(.35, gap - .065) : kind === 'late' ? -prevChange : 0;
      if (kind !== 'kept') { sizeQ += Math.abs(q - change); sizeR += Math.abs(rule - change); moved++; }
      if (detail) detail.push(`${Math.round(gap * 1000)}:${Math.round(change)}${mark[kind]} queue ${Math.round(l * 1000)} ms, p ${pQ[kind].toFixed(2)}, size ${Math.round(q)}; rule p ${pR[kind].toFixed(2)}`);
      prevChange = change; prevKind = kind;
    }
    return { Q, R, N, n, sizeQ, sizeR, moved };
  };
  const total = { held: [0, 0, 0, 0], fit: [0, 0, 0, 0] };
  const perTake = [], details = [];
  for (const r of accuracy.results) {
    if (!r.timeline || !r.gateSpurts || r.random) continue;
    const m = measured(r), held = HELD_OUT.has(r.name), detail = held ? [] : null;
    const { Q, R, N, n, sizeQ, sizeR, moved } = oneStep(m.rows, seeds, mulberry32(0xC0FFEE), detail);
    const t = held ? total.held : total.fit;
    t[0] += Q; t[1] += R; t[2] += N; t[3] += n;
    console.log(`   ${(r.name + (held ? ' *' : '')).padEnd(26)} ${String(n).padStart(2)}  ${Q.toFixed(1).padStart(6)}  ${R.toFixed(1).padStart(6)} ${N.toFixed(1).padStart(6)} | ${moved ? `${(sizeQ / moved).toFixed(0).padStart(5)} ${(sizeR / moved).toFixed(0).padStart(5)}  (${moved})` : '    -     -'}`);
    perTake.push({ r, m });
    if (detail) details.push(`   ${r.name}:\n${detail.map(d => `     ${d}`).join('\n')}`);
  }
  for (const [label, t] of [['held out (*)', total.held], ['used for the parameters', total.fit]]) console.log(`   ${label.padEnd(26)} ${String(t[3]).padStart(2)}  ${t[0].toFixed(1).padStart(6)}  ${t[1].toFixed(1).padStart(6)} ${t[2].toFixed(1).padStart(6)}`);

  console.log('   The held-out transitions (silence:change, the queue before it, each model\'s probability of what happened):');
  console.log(details.join('\n'));

  console.log('\n2. Free running (the whole take from the gate model alone, each seed a different draw): the share of seeds that give the take\'s early/late/kept pattern exactly, the mean share of transitions each seed gets right, and the mean error in ms of where each spurt starts against the restart level');
  if (engine) console.log('   take                        n   exact pattern, %: queue  rule engine | transitions right, %: queue  rule engine  none | start error, ms: queue  rule engine  none | pauses read');
  else console.log('   take                        n   exact pattern, %: queue  rule | transitions right, %: queue  rule  none | start error, ms: queue  rule  none | pauses read');
  for (const { r, m } of perTake) {
    const rows = m.rows.filter((x, i) => !i || x.k === m.rows[i - 1].k + 1);
    if (rows.length !== m.rows.length || rows.length < 2) continue;
    const gaps = rows.map(x => x.gap || 0), pauses = pausesOf(r), observed = rows.slice(1).map((x, i) => kindOf(x.first - rows[i].last));
    const offsets = rows.map(x => x.first - m.level);
    const score = { queue: [0, 0, 0], rule: [0, 0, 0] };
    const randQ = mulberry32(0xC0FFEE), randR = mulberry32(0xC0FFEE);
    for (let s = 0; s < seeds; s++) {
      const q = queueRun(gaps, pauses && rows.map(x => pauses[x.k]), randQ), rule = ruleRun(gaps, randR).map(v => ({ start: v, end: v }));
      for (const [name, run] of [['queue', q], ['rule', rule]]) {
        let right = 0, err = 0;
        for (let i = 1; i < run.length; i++) if (kindOf((run[i].start - run[i - 1].end) * 1000) === observed[i - 1]) right++;
        for (let i = 0; i < run.length; i++) err += Math.abs(run[i].start * 1000 - offsets[i]);
        score[name][0] += right === observed.length ? 1 : 0; score[name][1] += right / observed.length; score[name][2] += err / run.length;
      }
    }
    const none = [observed.filter(k => k === 'kept').length / observed.length, offsets.reduce((a, v) => a + Math.abs(v), 0) / offsets.length];
    const pct = (v) => (100 * v / seeds).toFixed(v / seeds < .1 ? 1 : 0).padStart(6);
    if (engine) {
      const sc = [0, 0, 0];
      for (let s = 1; s <= engineSeeds; s++) {
        const run = engineRun(r, rows, s);
        let right = 0, err = 0;
        for (let i = 1; i < run.length; i++) if (kindOf((run[i].start - run[i - 1].end) * 1000) === observed[i - 1]) right++;
        for (let i = 0; i < run.length; i++) err += Math.abs(run[i].start * 1000 - offsets[i]);
        sc[0] += right === observed.length ? 1 : 0; sc[1] += right / observed.length; sc[2] += err / run.length;
      }
      const pe = (v) => (100 * v / engineSeeds).toFixed(v / engineSeeds < .1 ? 1 : 0).padStart(6);
      console.log(`   ${(r.name + (HELD_OUT.has(r.name) ? ' *' : '')).padEnd(26)} ${String(observed.length).padStart(2)}  ${' '.repeat(18)}${pct(score.queue[0])} ${pct(score.rule[0])} ${pe(sc[0])} | ${' '.repeat(22)}${pct(score.queue[1])} ${pct(score.rule[1])} ${pe(sc[1])} ${(100 * none[0]).toFixed(0).padStart(5)} | ${' '.repeat(16)}${(score.queue[2] / seeds).toFixed(0).padStart(6)} ${(score.rule[2] / seeds).toFixed(0).padStart(5)} ${(sc[2] / engineSeeds).toFixed(0).padStart(6)} ${none[1].toFixed(0).padStart(5)} | ${pauses ? pauses.reduce((a, p) => a + p.length, 0) : 'no source WAV'}`);
      continue;
    }
    console.log(`   ${(r.name + (HELD_OUT.has(r.name) ? ' *' : '')).padEnd(26)} ${String(observed.length).padStart(2)}  ${' '.repeat(18)}${pct(score.queue[0])} ${pct(score.rule[0])} | ${' '.repeat(22)}${pct(score.queue[1])} ${pct(score.rule[1])} ${(100 * none[0]).toFixed(0).padStart(5)} | ${' '.repeat(16)}${(score.queue[2] / seeds).toFixed(0).padStart(6)} ${(score.rule[2] / seeds).toFixed(0).padStart(5)} ${none[1].toFixed(0).padStart(5)} | ${pauses ? pauses.reduce((a, p) => a + p.length, 0) : 'no source WAV'}`);
  }

  // 3. Could the held-out result be luck? Takes made by each model in turn
  // (the held-out takes' own silences and pauses), scored the same way.
  const worlds = Math.min(seeds, 2000), draws = 400, observedDiff = total.held[0] - total.held[1];
  const diffs = { rule: [], queue: [] };
  const held = perTake.filter(x => HELD_OUT.has(x.r.name)).map(({ r, m }) => ({ rows: m.rows, gaps: m.rows.map(x => x.gap || 0), pauses: (pausesOf(r) || []) }));
  const randW = mulberry32(0xBADA55), randS = mulberry32(0xFACADE);
  for (let w = 0; w < worlds; w++) {
    for (const world of ['rule', 'queue']) {
      let d = 0;
      for (const h of held) {
        const run = world === 'rule' ? ruleRun(h.gaps, randW).map(v => ({ start: v, end: v })) : queueRun(h.gaps, h.rows.map(x => h.pauses[x.k]), randW);
        const rows = h.rows.map((x, i) => ({ k: x.k, gap: x.gap, first: run[i].start * 1000, last: run[i].end * 1000 }));
        const sc = oneStep(rows, draws, randS);
        d += sc.Q - sc.R;
      }
      diffs[world].push(d);
    }
  }
  const share = (v, f) => (100 * v.filter(f).length / v.length).toFixed(1);
  const median = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
  console.log(`\n3. Luck. On the held-out takes the queue model scores ${observedDiff.toFixed(1)} above the rule (section 1). Over ${worlds} made-up takes with the same silences:`);
  console.log(`   if the current rule were how the game behaves: median difference ${median(diffs.rule).toFixed(1)}, and ${share(diffs.rule, d => d >= observedDiff)}% of them favour the queue model by as much`);
  console.log(`   if the fixed queue model were: median difference ${median(diffs.queue).toFixed(1)}, and ${share(diffs.queue, d => d <= observedDiff)}% of them favour it by as little or less`);
}
