// The loudness meter (meter.js) against ITU-R BS.1770-4 and EBU Tech 3341/3342
// reference behaviour, and the analyzer that takes a render a piece at a time
// against analyze().
//
//   node tests/meter.verify.mjs
//   node tests/meter.verify.mjs --memory <minutes> <limit MB>   (what [Meter 7] runs)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const TF2Meter = require('../meter.js');
let passed = 0;
function check(name, ok, detail = '') { assert.ok(ok, `${name}${detail ? ` (${detail})` : ''}`); passed++; console.log(`  ok    ${name}${detail ? `   [${detail}]` : ''}`); }

// Sine with 50 ms raised-cosine fades, so the edges add no inter-sample overshoot.
function sine(freq, amplitude, seconds, rate, phase = 0) {
  const n = Math.round(seconds * rate), fade = rate * 0.05;
  return Float32Array.from({ length: n }, (_, i) =>
    amplitude * Math.sin(2 * Math.PI * freq * i / rate + phase) * Math.sin(Math.PI / 2 * Math.min(1, Math.min(i, n - 1 - i) / fade)));
}
const concat = (...parts) => { const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

// Speech-like and deterministic: a 95-155 Hz voice with 8 harmonics and a
// 3.2 Hz syllable envelope, in talk spurts of 0.5-6 s between pauses of
// 0.1-4 s, over a -72 dBFS noise floor.
function speechLike(seconds, rate, seed) {
  const n = Math.round(seconds * rate), out = new Float32Array(n);
  let s = seed >>> 0;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const floor = 10 ** (-72 / 20);
  for (let i = 0; i < n; i++) out[i] = floor * (random() * 2 - 1);
  for (let t = Math.round(0.3 * rate); t < n;) {
    const length = Math.round((0.5 + 5.5 * random()) * rate), level = 10 ** ((-26 + 14 * random()) / 20);
    const f0 = 95 + 60 * random(), phase = 6.28 * random();
    for (let i = 0; i < length && t + i < n; i++) {
      const time = i / rate, envelope = Math.max(0, Math.sin(Math.PI * 3.2 * time + phase)) ** 1.5;
      let v = 0;
      for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f0 * h * time) / h;
      out[t + i] += level * envelope * (0.5 * v + 0.1 * (random() * 2 - 1));
    }
    t += length + Math.round((0.1 + 3.9 * random() ** 2) * rate);
  }
  return out;
}

// The child run of [Meter 7]: a speech-like signal at 48 kHz pushed into the
// analyzer in 1 s chunks for <minutes>. Each chunk is made in one reused buffer
// from a minute of speech, at a level that drifts up over the run (so the true
// peak keeps finding new pairs), so nothing but the analyzer can grow. Prints
// the resident memory above the start, as JSON; stops early once the memory
// passes <limit MB>, so a broken analyzer cannot take the machine's memory.
if (process.argv[2] === '--memory') {
  const minutes = Number(process.argv[3]), limitMB = Number(process.argv[4]), rate = 48000, MB = 1048576;
  const minute = speechLike(60, rate, 5), chunk = new Float32Array(rate), seconds = Math.round(minutes * 60);
  let s = 99;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const startRss = process.memoryUsage.rss(), start = performance.now();
  let sampledMB = 0;
  const analyzer = TF2Meter.createAnalyzer(rate);
  for (let second = 0; second < seconds; second++) {
    const gain = (0.25 + 0.75 * second / seconds) * (0.75 + 0.5 * random()), from = (second % 60) * rate;
    for (let i = 0; i < rate; i++) chunk[i] = minute[from + i] * gain;
    analyzer.push(chunk);
    sampledMB = Math.max(sampledMB, (process.memoryUsage.rss() - startRss) / MB);
    if (sampledMB > limitMB) {
      console.log(JSON.stringify({ stoppedAfter: second + 1, aboveMB: sampledMB }));
      process.exit(0);
    }
  }
  const stats = analyzer.finish();
  // The run's peak above the resident memory at its start. Linux keeps
  // resourceUsage().maxRSS across exec, so in a spawned process it counts the
  // parent's memory at the fork; /proc's VmHWM is this program's own.
  let peak = process.resourceUsage().maxRSS * 1024, source = 'maxRSS';
  try {
    peak = Number(/VmHWM:\s*(\d+) kB/.exec(readFileSync('/proc/self/status', 'utf8'))[1]) * 1024;
    source = 'VmHWM';
  } catch {}
  console.log(JSON.stringify({ seconds, aboveMB: (peak - startRss) / MB, source, sampledMB,
    startMB: startRss / MB, time: (performance.now() - start) / 1000, values: stats.history.momentary.length }));
  process.exit(0);
}

console.log('\n[Meter 1] K-weighting');
{
  // BS.1770-4 table 1 and 2: the filters at 48 kHz.
  const [shelf, highpass] = TF2Meter.kWeighting(48000);
  const expect = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585, -1.99004745483398, 0.99007225036621];
  const got = [...shelf.b, ...shelf.a, ...highpass.a];
  check('48 kHz coefficients match BS.1770-4', got.every((v, i) => near(v, expect[i], 1e-12)));
}

console.log('\n[Meter 2] Integrated loudness');
for (const rate of [44100, 48000, 96000]) {
  const r = TF2Meter.analyze(sine(997, 1, 10, rate), rate);
  check(`${rate} Hz: a full-scale 997 Hz sine in one channel reads -3.01 LUFS`, near(r.integrated, -3.01, 0.05), r.integrated.toFixed(3));
}
{
  const r = TF2Meter.analyze(sine(1000, 0.1, 20, 48000), 48000);
  check('a 1 kHz sine at -20 dBFS reads -23.0 LUFS', near(r.integrated, -23.0, 0.05), r.integrated.toFixed(3));
  // Gating: silence around the tone does not lower the reading.
  const gated = TF2Meter.analyze(concat(new Float32Array(48000 * 10), sine(1000, 0.1, 20, 48000), new Float32Array(48000 * 10)), 48000);
  // Blocks straddling the tone's edges pass the gates and pull it down slightly.
  check('the absolute gate ignores silence', near(gated.integrated, r.integrated, 0.1), gated.integrated.toFixed(3));
  // Relative gate: a part 20 LU down is excluded from the integrated level.
  const quiet = TF2Meter.analyze(concat(sine(1000, 0.1, 20, 48000), sine(1000, 0.01, 20, 48000)), 48000);
  check('the relative gate ignores a part 20 LU quieter', near(quiet.integrated, r.integrated, 0.1), quiet.integrated.toFixed(3));
  check('silence has no loudness', TF2Meter.analyze(new Float32Array(48000), 48000).integrated === -Infinity);
  check('under 400 ms there is no integrated loudness', TF2Meter.analyze(sine(1000, 0.1, 0.3, 48000), 48000).integrated === null);
}

console.log('\n[Meter 3] Loudness range and maxima');
{
  // EBU Tech 3342 case 1 (as one channel): 20 s at -20 LUFS then 20 s at -30 LUFS -> LRA 10 LU.
  const level = (lufs) => Math.pow(10, (lufs + 3.01) / 20);
  const r = TF2Meter.analyze(concat(sine(1000, level(-20), 20, 48000), sine(1000, level(-30), 20, 48000)), 48000);
  check('EBU 3342 two-level case: LRA 10 LU', near(r.lra, 10, 0.2), r.lra.toFixed(2));
  check('maximum short-term and momentary loudness read the loud part', near(r.shortTermMax, -20, 0.1) && near(r.momentaryMax, -20, 0.1),
    `${r.shortTermMax.toFixed(2)} / ${r.momentaryMax.toFixed(2)}`);
  check('a steady tone has no loudness range', near(TF2Meter.analyze(sine(1000, 0.1, 10, 48000), 48000).lra, 0, 0.1));
  check('under 3 s there is no loudness range', TF2Meter.analyze(sine(1000, 0.1, 2, 48000), 48000).lra === null);
}

console.log('\n[Meter 4] Peaks, RMS, DC');
{
  // A sine at a quarter of the rate, 45 degrees off the sample grid: samples
  // peak at -3.01 dBFS, the waveform between them at 0 dBTP.
  for (const rate of [44100, 48000]) {
    const r = TF2Meter.analyze(sine(rate / 4, 1, 1, rate, Math.PI / 4), rate);
    check(`${rate} Hz: fs/4 sine at 45°: sample peak -3.01, true peak 0.0 dBTP`,
      near(r.samplePeak, -3.01, 0.02) && near(r.truePeak, 0, 0.05), `${r.samplePeak.toFixed(2)} / ${r.truePeak.toFixed(2)}`);
  }
  const r = TF2Meter.analyze(Float32Array.from({ length: 96000 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 1000 * i / 48000)), 48000);
  check('true peak never reads below the sample peak', r.truePeak >= r.samplePeak);
  check('sine RMS and crest factor', near(r.rms, -9.03, 0.05) && near(r.crest, 3.01, 0.05), `${r.rms.toFixed(2)} dBFS, crest ${r.crest.toFixed(2)}`);
  check('peak-to-loudness ratio', near(r.plr, r.truePeak - r.integrated, 1e-9));
  const dc = TF2Meter.analyze(Float32Array.from({ length: 48000 }, () => 0.05), 48000);
  check('DC offset', near(dc.dc, 0.05, 1e-6));
}

console.log('\n[Meter 5] Loudness history');
{
  // 5 s at -20 LUFS then 5 s at -30 LUFS: 100 ms steps; momentary value k
  // covers k * 0.1 .. k * 0.1 + 0.4 s, short-term k * 0.1 .. k * 0.1 + 3 s.
  const level = (lufs) => Math.pow(10, (lufs + 3.01) / 20);
  const x = concat(sine(1000, level(-20), 5, 48000), sine(1000, level(-30), 5, 48000));
  const { history } = TF2Meter.analyze(x, 48000);
  check('one momentary value per 100 ms from 0.4 s, one short-term value from 3 s',
    history.hop === 0.1 && history.momentary.length === 97 && history.shortTerm.length === 71, `${history.momentary.length} / ${history.shortTerm.length}`);
  check('momentary loudness follows the level step', near(history.momentary[20], -20, 0.1) && near(history.momentary[70], -30, 0.1)
    && history.momentary[48] < -20.5 && history.momentary[48] > -29.5, `${history.momentary[20].toFixed(2)} / ${history.momentary[48].toFixed(2)} / ${history.momentary[70].toFixed(2)}`);
  check('short-term loudness settles 3 s after the step', near(history.shortTerm[10], -20, 0.1) && near(history.shortTerm[60], -30, 0.1)
    && history.shortTerm[35] < -20.5 && history.shortTerm[35] > -29.5);
  check('silence reads −∞ in the history', TF2Meter.analyze(new Float32Array(48000), 48000).history.momentary.every(v => v === -Infinity));
}

console.log('\n[Meter 6] The analyzer, a piece at a time, equals analyze()');
{
  // The first field where two stats differ, or null: with Object.is, so -0,
  // NaN, null and -Infinity count, and the history element by element.
  const difference = (a, b, path = 'stats') => {
    if (a === null || typeof a !== 'object') return Object.is(a, b) ? null : `${path}: ${b}, not ${a}`;
    if (b === null || typeof b !== 'object' || b.constructor !== a.constructor) return `${path}: ${b}, not a ${a.constructor.name}`;
    if (ArrayBuffer.isView(a)) {
      if (b.length !== a.length) return `${path}: ${b.length} values, not ${a.length}`;
      for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return `${path}[${i}]: ${b[i]}, not ${a[i]}`;
      return null;
    }
    if (Object.keys(b).join() !== Object.keys(a).join()) return `${path}: fields ${Object.keys(b)}, not ${Object.keys(a)}`;
    for (const key of Object.keys(a)) { const d = difference(a[key], b[key], `${path}.${key}`); if (d) return d; }
    return null;
  };
  // Chunks of 1, 7, 4096 and 48,000 samples, an uneven mix (empty pieces
  // included; 2 s at 48 kHz a cycle) and one chunk. The uneven pieces go
  // through one buffer that is filled with NaN after each push, so an analyzer
  // that keeps the caller's buffer would show.
  const UNEVEN = [1, 0, 2, 15, 16, 17, 31, 32, 33, 0, 4095, 777, 12345, 3, 48001, 5, 30627];
  const SPLITS = [['1', [1]], ['7', [7]], ['4096', [4096]], ['48,000', [48000]], ['uneven', UNEVEN], ['one chunk', null]];
  const inPieces = (x, rate, sizes) => {
    const analyzer = TF2Meter.createAnalyzer(rate);
    if (!sizes) analyzer.push(x);
    const buffer = sizes === UNEVEN ? new Float32Array(Math.max(...sizes)) : null;
    for (let at = 0, k = 0; sizes && at < x.length; k++) {
      const piece = x.subarray(at, at + sizes[k % sizes.length]);
      at += sizes[k % sizes.length];
      if (!buffer) { analyzer.push(piece); continue; }
      buffer.set(piece);
      analyzer.push(buffer.subarray(0, piece.length));
      buffer.fill(NaN);
    }
    return analyzer.finish();
  };
  const fixed = (v) => (v === null ? 'null' : v.toFixed(2));

  // Pairs of samples whose 4x interpolation peaks far above them: the signs of
  // the half-sample interpolator's taps around pair p (+ + in the middle,
  // alternating outward), `outer` on the 30 outer taps and `inner` on the pair.
  const overshoot = (x, p, outer, inner) => {
    for (let k = -15; k <= 16 && p + k < x.length; k++) {
      const sign = k === 0 || k === 1 ? 1 : (k < 0 ? -k : k - 1) % 2 ? -1 : 1;
      x[p + k] = sign * (k === 0 || k === 1 ? inner : outer);
    }
    return x;
  };
  const samplePeak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  // The loudest pair comes after a quieter stretch that set a lower threshold:
  // 1 s at a sample peak of 0.45, holding a decoy pair of level 0.195 whose
  // interpolation reaches 0.75, then 1 s of a fs/4 sine at 45° whose samples
  // peak at 0.5 and whose true peak is 0.71. The decoy passes 0.4 of the peak
  // so far (0.18) but not 0.4 of the final peak (0.2), so analyze() never
  // evaluates it; an analyzer that kept every pair above its running
  // threshold would read the decoy.
  const decoy = concat(overshoot(sine(200, 0.2, 1, 48000), 24000, 0.45, 0.195), sine(12000, 0.5 * Math.SQRT2, 1, 48000, Math.PI / 4));
  {
    const quiet = decoy.subarray(0, 48000), whole = TF2Meter.analyze(decoy, 48000);
    const decoyPeak = TF2Meter.analyze(decoy.subarray(24000 - 15, 24000 + 17), 48000).truePeak;
    check('the decoy: its level passes 0.4 of the quiet stretch\'s peak, not 0.4 of the final peak, and it reads above the true peak',
      Math.abs(decoy[24000]) >= 0.4 * samplePeak(quiet) && Math.abs(decoy[24000]) < 0.4 * samplePeak(decoy)
      && decoyPeak > whole.truePeak && whole.truePeak === TF2Meter.analyze(decoy.subarray(48000), 48000).truePeak,
      `decoy ${decoyPeak.toFixed(2)} dBTP, true peak ${whole.truePeak.toFixed(2)} dBTP, from the loud second`);
  }
  // The largest true peak 6 samples before 32 s (1,536,000 samples), an edge
  // of every split here but the single chunk, so its 16 following samples come
  // in the next piece; and one 6 samples before the end, evaluated in finish().
  const edgeAt = 1536000, atEdge = overshoot(sine(440, 0.1, 33, 48000), edgeAt - 6, 0.5, 0.5);
  const atEnd = sine(440, 0.1, 1, 48000);
  overshoot(atEnd, atEnd.length - 6, 0.5, 0.5);
  check('the edge signals: their true peak, above 0 dBTP from samples at 0.5, is the burst\'s',
    TF2Meter.analyze(atEdge, 48000).truePeak === TF2Meter.analyze(atEdge.subarray(edgeAt - 21, edgeAt + 11), 48000).truePeak
    && TF2Meter.analyze(atEnd, 48000).truePeak > 0 && samplePeak(atEnd) === 0.5,
    `${TF2Meter.analyze(atEdge, 48000).truePeak.toFixed(2)} / ${TF2Meter.analyze(atEnd, 48000).truePeak.toFixed(2)} dBTP`);

  // At 22,051 Hz the 31st segment ends at round(68,358.1) = 68,358 samples,
  // but analyze() counts floor(68,358 / 2205.1) = 30 segments in a signal of
  // that length: the analyzer must count them the same way.
  const oddRate = speechLike(3.2, 22051, 4).subarray(0, 68358);
  check('the odd rate: a whole segment that analyze() does not count',
    Math.round(31 * 22051 / 10) === oddRate.length && Math.floor(oddRate.length / (22051 / 10)) === 30);

  const signals = [
    ['speech-like with pauses, 60 s at 48 kHz', speechLike(60, 48000, 1), 48000],
    ['speech-like, 20 s at 11,025 Hz (100 ms is 1102.5 samples)', speechLike(20, 11025, 2), 11025],
    ['speech-like, 3.1 s at 22,051 Hz, cut at the end of a segment analyze() leaves out', oddRate, 22051],
    ['a full-scale 997 Hz sine', sine(997, 1, 5, 48000), 48000],
    ['a fs/4 sine at 45° at 44.1 kHz (true peak 3 dB above the samples)', sine(44100 / 4, 1, 1, 44100, Math.PI / 4), 44100],
    ['silence', new Float32Array(5 * 48000), 48000],
    ['0.3 s (no integrated loudness)', sine(1000, 0.1, 0.3, 48000), 48000],
    ['2 s (no loudness range)', speechLike(2, 48000, 3), 48000],
    ['the loudest pair after a quieter stretch with a lower threshold', decoy, 48000],
    ['the largest true peak 6 samples before a chunk edge', atEdge, 48000],
    ['the largest true peak 6 samples before the end', atEnd, 48000],
    ['no samples at all', new Float32Array(0), 48000]
  ];
  for (const [name, x, rate] of signals) {
    const whole = TF2Meter.analyze(x, rate);
    const failed = SPLITS.map(([label, sizes]) => { const d = difference(whole, inPieces(x, rate, sizes)); return d && `in chunks of ${label}: ${d}`; }).find(Boolean);
    check(`${name}: equal in every split`, !failed, failed || `${fixed(whole.integrated)} LUFS, ${fixed(whole.truePeak)} dBTP, ${whole.history.momentary.length} values`);
  }
  const spent = TF2Meter.createAnalyzer(48000), throws = (f) => { try { f(); return false; } catch { return true; } };
  spent.push(new Float32Array(100));
  spent.finish();
  check('after finish() the analyzer is spent', throws(() => spent.push(new Float32Array(1))) && throws(() => spent.finish()));

  // Six hours at 8 kHz: a click, then a noise floor (exact zeros would leave
  // the K-weighting's tail in slow subnormal numbers). 216,000 values per
  // list, more than Node 22 can spread into Math.max (it fails between
  // 125,000 and 200,000). The maxima are the click's, as in its first 4 s.
  let seed = 6;
  const rate = 8000, six = TF2Meter.createAnalyzer(rate);
  const floor = Float32Array.from({ length: rate }, () => 1e-4 * ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2147483648 - 1));
  const first = floor.slice();
  first[0] = 1;
  six.push(first);
  for (let second = 1; second < 6 * 3600; second++) six.push(floor);
  const long = six.finish(), head = TF2Meter.analyze(concat(first, floor, floor, floor), rate);
  check('six hours of history: the loudness maxima need no engine argument limit',
    long.history.momentary.length === 215997 && long.momentaryMax === head.momentaryMax && long.shortTermMax === head.shortTermMax,
    `${long.history.momentary.length} values, maxima ${long.momentaryMax.toFixed(2)} / ${long.shortTermMax.toFixed(2)} LUFS`);
}

console.log('\n[Meter 7] The analyzer\'s memory');
{
  // In its own process (the run above holds signals), with a small V8 heap and
  // a time limit. Typed arrays live outside the heap, so the child also stops
  // itself once its resident memory passes the limit.
  const minutes = 60, limitMB = 200, timeLimit = 240;
  const run = spawnSync(process.execPath, ['--max-old-space-size=256', fileURLToPath(import.meta.url), '--memory', String(minutes), String(limitMB)],
    { encoding: 'utf8', timeout: timeLimit * 1000 });
  assert.ok(run.status === 0, `the memory run failed${run.error ? ` (${run.error.message}; time limit ${timeLimit} s)` : ''}: ${run.stderr}`);
  const r = JSON.parse(run.stdout);
  check(`${minutes} minutes at 48 kHz in 1 s chunks: under ${limitMB} MB above the start (today's analyze: about 2.6 GB)`,
    r.stoppedAfter === undefined && r.aboveMB < limitMB,
    r.stoppedAfter === undefined ? `${r.aboveMB.toFixed(1)} MB peak (${r.source}), ${r.values} momentary values, ${r.time.toFixed(1)} s`
      : `${r.aboveMB.toFixed(0)} MB after ${r.stoppedAfter} s of the signal; stopped`);
}

console.log(`\n${passed} passed, 0 failed`);
