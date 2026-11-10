// The receiver's automatic gain is the engine's rule (W3-05).
//
//   node tests/gain.verify.mjs
//
// The rule was read from the engine's binary (docs/reports/W3-03-engine-
// binary.md, section 2) and matched the game's decoded voice sample for
// sample (Set H, docs/PROGRESS.json stands.gain_exact). Here it is checked
// against a literal transcription of the order's box (engineGain, in
// tests/gain-exact.mjs, written apart from audio.js), on seeded signals,
// whole and in pieces; then each detail that Set H or the review showed to
// matter, with the order's numbers; then the reset; then the gate's
// silences through process(). Every signal is synthetic, made here.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { engineGain } from './gain-exact.mjs';

const root = process.env.TF2_DIR ? pathToFileURL(path.resolve(process.env.TF2_DIR) + '/') : new URL('..', import.meta.url);
const engineCode = ['constants.js', 'audio.js'].map(f => fs.readFileSync(new URL(f, root), 'utf8')).join('\n');
const TF2Opus = await import(new URL('opus-codec.mjs', root).href);
// As tests/render-stream.verify.mjs loads it: one function in this realm.
const window = {};
const { CODEC_PROFILES, VOICE_ENGINE } = new Function('window', 'TF2Opus', 'setTimeout', 'self', 'module',
  `${engineCode}\nreturn { CODEC_PROFILES, VOICE_ENGINE };`)(window, TF2Opus, undefined, undefined, undefined);
const A = window.TF2Audio;

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `   [${detail}]` : ''}`);
}

const toFloat = (ints) => Float32Array.from(ints, v => v / 32768);
const toInts = (floats) => Int32Array.from(floats, v => Math.round(v * 32768));
const differing = (a, b) => { let n = a.length === b.length ? 0 : Math.max(a.length, b.length); for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) n++; return n; };
const blocks = (...parts) => Int32Array.from(parts.flat());
const block = (v, n = 128) => new Array(n).fill(v);
// Pieces of a signal through a function, joined.
function inPieces(run, x, size, flush = null) {
  const parts = [];
  for (let o = 0; o < x.length; o += size) parts.push(run(x.subarray(o, Math.min(x.length, o + size))));
  if (flush) parts.push(flush());
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((o, p) => { out.set(p, o); return o + p.length; }, 0);
  return out;
}

/* ---------------- 1. against the transcription ---------------- */

console.log('\n[1] receiverAutoGain, streamAutoGain and createGain against a literal transcription of the rule');
{
  let s = 0x1234;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const int16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));
  // Noise bursts at levels from 20 to 32767 with runs of exact zeros between
  // them: some runs a whole number of blocks, some not.
  const bursts = [];
  const levels = [20, 32767, 100, 1000, 5000, 300, 20000, 50, 12000, 2500];
  const zeros = [128 * 3, 200, 128, 77, 128 * 10, 1000, 256, 129, 128 * 5, 3];
  for (let k = 0; bursts.length < 48000; k++) {
    const level = levels[k % levels.length], len = 900 + Math.floor(rnd() * 3000);
    for (let i = 0; i < len; i++) bursts.push(int16(level * (rnd() * 2 - 1)));
    for (let i = 0; i < zeros[k % zeros.length]; i++) bursts.push(0);
  }
  const square = Array.from({ length: 40960 }, (_, i) => (Math.floor(i / 50) % 2 ? -32768 : 32767));
  const ramp = Array.from({ length: 40960 }, (_, i) => int16(-32768 + 65535 * i / 40959));
  // A length that is not a multiple of 128 (41,111 = 321 x 128 + 23).
  const odd = Array.from({ length: 41111 }, (_, i) => int16(3000 * Math.sin(i * 0.01) * (1 + Math.sin(i * 0.0007)) + 200 * (rnd() * 2 - 1)));
  const signals = { 'noise bursts with runs of zeros': bursts, 'a full-scale square wave': square, 'a slow ramp': ramp,
    'a length that is not a multiple of 128': odd };
  check('the signals are as described', bursts.length >= 40000 && Object.values(signals).every(x => x.length >= 40000)
    && odd.length % 128 !== 0 && Math.max(...levels) === 32767 && Math.min(...levels) === 20,
    Object.values(signals).map(x => x.length).join(', '));
  const settings = [];
  for (const scale of [0.5, 1, 2]) for (const maxGain of [1, 10, 255 / 128]) for (const avgGain of [0.25, 0.5, 1]) settings.push({ scale, maxGain, avgGain });
  const paths = {
    'receiverAutoGain': (x, o) => A.receiverAutoGain(x, o),
    ...Object.fromEntries([1, 7, 128, 1000].map(n => [`streamAutoGain in pieces of ${n}, flushed`, (x, o) => {
      const run = A.streamAutoGain(o);
      return inPieces(run, x, n, run.flush);
    }])),
    ...Object.fromEntries([882, 512].map(n => [`createGain().process in packets of ${n}`, (x, o) => {
      const gain = A.createGain(o);
      return inPieces(gain.process, x, n);
    }]))
  };
  for (const [signalName, ints] of Object.entries(signals)) {
    const x = toFloat(ints), xs = Int32Array.from(ints);
    const wants = settings.map(o => engineGain(xs, o).out);
    for (const [pathName, run] of Object.entries(paths)) {
      let bad = 0, total = 0, worst = '';
      settings.forEach((o, k) => {
        const n = differing(toInts(run(x, o)), wants[k]);
        total += xs.length;
        if (n) { bad += n; worst ||= `scale ${o.scale}, maxgain ${o.maxGain}, avggain ${o.avgGain}: ${n}`; }
      });
      check(`${signalName}: ${pathName}`, bad === 0, `${bad} of ${total} samples differ over ${settings.length} settings${worst ? `; first ${worst}` : ''}`);
    }
  }
  // The transcription's cases reach every branch: a target under the cap and
  // at it, a ramp up and down, a block of zeros, the int16 clamp.
  const reach = engineGain(Int32Array.from(bursts), { scale: 2, maxGain: 10, avgGain: 0.5 });
  check('the bursts clamp at full scale and ramp both ways', reach.out.some(v => v === 32767) && reach.out.some(v => v === -32768)
    && reach.fixedAt.some((f, i) => i > 0 && f > reach.fixedAt[i - 1]) && reach.fixedAt.some((f, i) => i > 0 && f < reach.fixedAt[i - 1]));
}

/* ---------------- 2. the details, with the order's numbers ---------------- */

console.log('\n[2] Each detail of the rule, with the order\'s numbers');
{
  const run = (ints, o, decoded) => toInts(A.receiverAutoGain(toFloat(ints), { ...o, decoded }));

  // The ramp divides by 127 (W3-03; Set H cannot tell): the step is 1.
  const d = run(blocks(block(32767), block(100), block(100)), { scale: 1, maxGain: 255 / 128, avgGain: 0.5 });
  check('127: block 1 comes out as 100 and the last sample of block 2 as 199 (with 128 it would be 100)',
    d.subarray(128, 256).every(v => v === 100) && d[383] === 199, `block 1 ${d[128]}..${d[255]}, last of block 2 ${d[383]}`);

  // The block mean is an integer: 3302, not 3302.99, so the target is 9.92188.
  const m = run(blocks(block(3303, 127), [3302], block(100), block(100)), { scale: 1, maxGain: 10, avgGain: 0.5 });
  check('the integer mean: the first sample of block 2 is 992 (fixed 1270; with the fractional mean 991)', m[256] === 992, `${m[256]}`);

  // A decoded block of zeros sends the gain to the cap.
  const zerosIn = blocks(block(16384), block(0), block(10), block(10));
  const z = run(zerosIn, { scale: 1, maxGain: 10, avgGain: 0.5 });
  check('zeros to the cap: block 2 runs 19 to 99 (fixed 255, step 8), block 3 starts at 100 (fixed 1280)',
    z[256] === 19 && z[383] === 99 && z[384] === 100, `${z[256]}, ${z[383]}, ${z[384]}`);
  // In general: the block after the zeros starts at scale^2 x T(loud) and
  // ramps toward scale x maxgain; the next starts at scale^2 x maxgain.
  const general = [0.5, 2].map(scale => {
    const y = run(blocks(block(16384), block(0), block(64), block(64)), { scale, maxGain: 10, avgGain: 0.5 });
    const f32 = Math.fround, T = f32(32767 / 16384), s = f32(scale);
    // Block 0 is at unity (a reset) and block 1 (the zeros) at s; block 2
    // starts at s^2 T(block 0), block 3 at s^2 x maxgain.
    const start2 = Math.trunc(f32(f32(T * s) * s) * 128), start3 = Math.trunc(f32(f32(f32(10) * s) * s) * 128);
    return y[256] === Math.floor(start2 * 64 / 128) && y[384] === Math.floor(start3 * 64 / 128) && y[383] > y[256];
  });
  check('zeros to the cap at voice_scale 0.5 and 2: s^2 x T(loud), a ramp up, then s^2 x maxgain', general.every(Boolean), general.join(' '));
  const held = run(zerosIn, { scale: 1, maxGain: 10, avgGain: 0.5 }, (i) => !(i >= 128 && i < 256));
  check('a block of zeros that was not decoded holds the gain: block 2 is flat at 20 (fixed 256, where block 1\'s ramp ended)',
    held.subarray(256, 384).every(v => v === 20), `${held[256]}..${held[383]}`);
  const heldDecoded = run(zerosIn, { scale: 1, maxGain: 10, avgGain: 0.5 }, () => true);
  check('a decoded() that says every sample was decoded changes nothing', differing(heldDecoded, z) === 0);
  // Only an all-zero block is held: one sample of 1 in a block not decoded runs the rule.
  const notAllZero = run(blocks(block(16384), [1, ...block(0, 127)], block(10)), { scale: 1, maxGain: 10, avgGain: 0.5 }, (i) => !(i >= 128 && i < 256));
  check('a block not decoded but not all zeros is run by the rule', notAllZero[256] !== 20, `${notAllZero[256]}`);

  // A last, partial block follows the ramp and makes no update.
  const part = run(blocks(block(16384), block(100, 50)), { scale: 1, maxGain: 10, avgGain: 0.5 });
  check('a last, partial block follows the current ramp', part.length === 178 && part[128] === 100 && part[177] === Math.floor((128 + 49 * 1) * 100 / 128),
    `${part[128]}..${part[177]}`);
}

/* ---------------- 3. the reset ---------------- */

console.log('\n[3] createGain: a reset, read with state()');
{
  const results = [0.5, 1, 2].map(scale => {
    const gain = A.createGain({ scale, maxGain: 10, avgGain: 0.5 });
    gain.process(toFloat(Array.from({ length: 1000 }, (_, i) => (i * 7919) % 20000 - 10000)));   // some state first
    gain.reset();
    const s0 = gain.state();
    const y = toInts(gain.process(toFloat(block(1000))));
    const s1 = gain.state();
    return { scale, ok: y.every(v => v === 1000) && s1.fixed === Math.trunc(scale * 128)
      && s0.current === 1 && s0.next === 1 && s0.fixed === 128 && s0.step === 0 && s0.pos === 0 && s0.sum === 0 && s0.peak === 0, fixed: s1.fixed };
  });
  check('after reset(), 128 samples of 1000 come out as 1000 at voice_scale 0.5, 1 and 2; then fixed is trunc(scale x 128)',
    results.every(r => r.ok), results.map(r => `${r.scale}: fixed ${r.fixed}`).join(', '));
  const gain = A.createGain({ scale: 1, maxGain: 10, avgGain: 0.5 });
  gain.process(toFloat(block(500, 300)));
  const mid = gain.state().pos;
  gain.reset();
  const after = gain.state();
  check('reset() in the middle of a block puts pos back to 0 (and sum and peak)', mid === 44 && after.pos === 0 && after.sum === 0 && after.peak === 0,
    `pos ${mid} -> ${after.pos}`);
  const copy = gain.state();
  copy.fixed = 999;
  check('state() is a copy of the seven variables', gain.state().fixed === 128
    && Object.keys(copy).sort().join() === 'current,fixed,next,peak,pos,step,sum');
  const g2 = A.createGain({ scale: 1, maxGain: 10, avgGain: 0.5 }), x = toFloat(block(1234, 100));
  const y = g2.process(x);
  check('process() returns a Float32Array of the same length at once', y instanceof Float32Array && y.length === 100 && g2.state().pos === 100);
}

/* ---------------- 4. the gate's silences, through process() ---------------- */

console.log('\n[4] The gate\'s silences: process(), the Steam profile');
{
  // Two noise bursts 2 s apart over a noise floor under the gate's
  // threshold. The floor makes the gain visible on each side of the gap:
  // the hold after the first burst and the pre-roll before the second
  // carry it. Its decoded target must be under the cap, or the tail would
  // leave the gain at the cap and a held gain could not be told from it;
  // a floor under the default threshold decodes too quiet for that (its
  // target is over 100), so the threshold is raised to -12 dBFS and the
  // floor is at -18 dBFS rms.
  const rate = 44100, n = Math.round(4.5 * rate), x = new Float32Array(n);
  let s = 77;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const floor = 10 ** (-18 / 20) * Math.sqrt(3), bursts = [[0.5, 1.0], [3.0, 3.5]];
  for (let i = 0; i < n; i++) x[i] = floor * (rnd() * 2 - 1);
  for (const [a, b] of bursts) for (let i = Math.round(a * rate); i < Math.round(b * rate); i++) x[i] = 0.9 * (rnd() * 2 - 1);
  const cap = 10, opts = { codec: 'steam', maxGain: cap, gateThresholdDb: -12, volume: 1 };
  const r = await A.process({ sampleRate: rate, length: n, numberOfChannels: 1, getChannelData: () => x }, opts);
  const gap = [Math.round((1.0 + 0.44 + 0.1) * rate), Math.round((3.0 - 0.12 - 0.1) * rate)];
  check('the gate closes between the bursts: two spurts, and the samples between them are zero',
    r.codecInfo.spurts === 2 && r.samples.subarray(gap[0], gap[1]).every(v => v === 0), `${r.codecInfo.spurts} spurts`);

  // The same decoded signal, made as process() makes it, at the voice rate.
  const steam = CODEC_PROFILES.steam, codecRate = steam.codecRate, voiceRate = steam.voiceRate;
  let c = A.resampleSinc(A.hardClip(x, 32767 / 32768), rate, codecRate);
  c = A.applyFirZeroPhase(c, A.firwin2(steam.captureEq.taps, steam.captureEq.freqs, steam.captureEq.gainsDb, codecRate));
  const trip = await TF2Opus.roundTrip(c, codecRate, steam.bitrate, {
    gate: { thresholdDb: opts.gateThresholdDb, prerollFrames: Math.round(steam.senderGate.prerollMs / 20), holdFrames: Math.round(steam.senderGate.holdMs / 20) },
    makeLossMask: () => null, application: steam.application, signal: steam.signal,
    runtime: steam.encoder.runtime, complexity: steam.encoder.complexity, vbr: steam.encoder.vbr, dtx: steam.encoder.dtx });
  const log = trip.info.frameLog, size = trip.info.frameSamples, lookahead = trip.info.lookahead;
  check('the frame log is process()\'s', log.length === r.codecInfo.frameLog.length && log.every((v, i) => v === r.codecInfo.frameLog[i]));
  const decodedVoice = A.resampleSinc(trip.samples, codecRate, voiceRate);
  // Spec 4's mapping, written out here.
  const decoded = (m) => {
    const f = Math.floor((Math.floor(m * codecRate / voiceRate) + lookahead) / size);
    return f < log.length && log[f] !== 0;
  };
  // The rest of the chain as process() runs it (no room, volume 1, output at 44.1 kHz).
  const finish = (y) => {
    y = A.applyFirZeroPhase(A.resampleSinc(y, voiceRate, VOICE_ENGINE.mixRate), VOICE_ENGINE.outputFir);
    const out = new Float32Array(n);
    out.set(A.resampleSinc(y, VOICE_ENGINE.mixRate, rate).subarray(0, n));
    return A.softLimit(out, 0.98);
  };
  const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
  const settings = { avgGain: 0.5, maxGain: cap, scale: 1 };
  const withLog = A.receiverAutoGain(decodedVoice, { ...settings, decoded });
  check('process() is receiverAutoGain on the decoded signal with decoded() from the frame log (bit for bit)', same(finish(withLog), r.samples));
  check('... and not receiverAutoGain with every block decoded (the gap would send the gain to the cap)',
    !same(finish(A.receiverAutoGain(decodedVoice, settings)), r.samples));

  // Where the second spurt's first block starts, by the transcription with
  // spec 4, on the decoded signal as int16 (clamped: the bursts' peaks pass
  // full scale after the codec).
  const ints = Int32Array.from(decodedVoice, v => Math.max(-32768, Math.min(32767, Math.round(v * 32768))));
  const t = engineGain(ints, settings, (i) => !decoded(i));
  check('the transcription with spec 4 gives the same samples', differing(t.out, toInts(withLog)) === 0);
  // The blocks at the gap's edges: the last before it and the first after
  // it that are not all zeros (here the output's rate is the voice rate).
  const zeroBlock = (k) => ints.subarray(k * 128, (k + 1) * 128).every(v => v === 0);
  const peakOf = (k) => ints.subarray(k * 128, (k + 1) * 128).reduce((p, v) => Math.max(p, Math.abs(v)), 0);
  let first = Math.floor(gap[1] / 128), last = Math.floor(gap[0] / 128);
  while (zeroBlock(first)) first++;
  while (zeroBlock(last)) last--;
  const start = t.fixedAt[first], gapBlocks = first - last - 1;
  check('the second burst\'s first block starts from the gain the first burst\'s tail left: not the cap, not 1',
    gapBlocks > 100 && !decoded((last + 1) * 128) && start !== 128 && start !== cap * 128
    && t.fixedAt.slice(last + 2, first + 1).every(f => f === start),
    `held at fixed ${start} from the gap's second block to the burst's first (${gapBlocks} blocks); the cap is ${cap * 128}, 1 is 128`);
  // What sits at the edges: the resampler's ringing past the last sent frame
  // and ahead of the first, in blocks whose first sample was not decoded but
  // which are not all zeros. The rule runs them; the one after the tail has
  // the cap for its target, so the held value is where the ramp toward the
  // cap reached, and the block after the first one starts at the cap.
  check('the gap\'s edges are the resampler\'s ringing, run by the rule: the block after the second burst\'s first starts at the cap',
    !decoded(last * 128) && !decoded(first * 128) && peakOf(last) < 100 && peakOf(first) < 100 && t.fixedAt[first + 1] === cap * 128,
    `peaks ${peakOf(last)} and ${peakOf(first)}; the tail's ringing block starts at ${t.fixedAt[last]}, the next at ${t.fixedAt[last + 1]}`
    + ` and ramps to ${start}; then ${t.fixedAt[first + 1]}`);
}

console.log(`\n${passed} gain checks passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
