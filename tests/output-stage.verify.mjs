// The mixer and the output stage as the game's listener gets it (W3-10,
// docs/work-orders/W3-10-output-stage.md): the voice's entry into the mix,
// the engine's upsampler by two, the clip, `volume` and the 16-bit rounding,
// the system's mixer's linear conversion to the device's rate, the
// output's length, the file's bytes, and the live chain after its mix
// point.
//
//   node tests/output-stage.verify.mjs
//
// Expected values come from the order and from the engine's read
// (docs/reports/W3-10-upsampler-read.md, whose tables are this suite's test
// vectors), from arithmetic written here, or from BigInt; never from the
// stage's own output. Every signal is synthetic, made here. TF2_DIR points
// the suite at a copy of the sources.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.TF2_DIR ? pathToFileURL(path.resolve(process.env.TF2_DIR) + '/') : new URL('..', import.meta.url);
const engineCode = ['constants.js', 'steam-sender.js', 'vendor/swresample/swresample.js', 'audio.js'].map(f => fs.readFileSync(new URL(f, root), 'utf8')).join('\n');
const TF2Opus = await import(new URL('opus-codec.mjs', root).href);
const window = {};
const tables = new Function('window', 'TF2Opus', 'setTimeout', 'self', 'module',
  `${engineCode}\nreturn { CODEC_PROFILES, VOICE_ENGINE };`)(window, TF2Opus, undefined, undefined, undefined);
const A = window.TF2Audio, ENGINE = tables.VOICE_ENGINE;

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `   [${detail}]` : ''}`);
}

/* ---------------- the test's own arithmetic ---------------- */

const f32 = Math.fround;
// Ties to even, written here.
const roundEven = (v) => { const fl = Math.floor(v), d = v - fl; return d > 0.5 ? fl + 1 : d < 0.5 ? fl : (fl % 2 === 0 ? fl : fl + 1); };
const int16Of = (v) => Math.max(-32768, Math.min(32767, roundEven(v * 32768)));
// The entry, the upsampler and mixOut as the order writes them.
const entry = (s, vol = 255) => Math.trunc(f32(s * f32(vol)) / 256);
function upsampleRun(x, stages) {
  // The whole voice through `stages` upsamplings by two from state 0, run on
  // over one voice sample of zeros, cut to factor N + factor - 1.
  if (!stages || !x.length) return Array.from(x);
  let y = [...x, 0];
  for (let s = 0; s < stages; s++) {
    const z = [];
    let prev = 0;
    for (const v of y) { z.push(Math.floor((prev + v) / 2)); z.push(v); prev = v; }
    y = z;
  }
  return y.slice(0, (1 << stages) * x.length + (1 << stages) - 1);
}
const same = (a, b) => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
const firstDiff = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i; return -1; };
const join = (parts, Type = Float32Array) => {
  const out = new Type(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((o, p) => { out.set(p, o); return o + p.length; }, 0);
  return out;
};
const lcg = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const buffer = (x, rate) => ({ sampleRate: rate, length: x.length, numberOfChannels: 1, getChannelData: () => x });

// Seeded speech-like talk with pauses (voiced syllables on a noise floor).
function talk(seconds, rate, seed, level = 0.2) {
  const rnd = lcg(seed), n = Math.round(seconds * rate), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 3e-4 * (rnd() * 2 - 1);
  let t = Math.round(0.2 * rate);
  while (t < n) {
    const len = Math.round((0.4 + 1.0 * rnd()) * rate), f0 = 100 + 80 * rnd(), amp = level * (0.3 + 0.7 * rnd());
    for (let i = 0; i < len && t + i < n; i++) {
      const time = i / rate, env = Math.sin(Math.PI * i / len) * Math.abs(Math.sin(Math.PI * 3.3 * time)) ** 0.7;
      let v = 0;
      for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f0 * h * time) / h;
      x[t + i] += amp * env * (0.7 * v + 0.2 * (rnd() * 2 - 1));
    }
    t += len + Math.round((0.3 + 0.8 * rnd()) * rate);
  }
  return x;
}
const tone = (f, seconds, rate, amp) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amp * Math.sin(2 * Math.PI * f * i / rate));

// A render with its hooks: the gain's output (onGain) and the mixer's
// blocks (onMixBlock), joined.
async function hooked(x, rate, opts) {
  const gains = [], blocks = [];
  const r = await A.process(buffer(x, rate), { ...opts, onGain: (g) => gains.push(Float32Array.from(g)),
    onMixBlock: (start, length, mix) => blocks.push({ start, length, mix: Int32Array.from(mix) }) });
  return { r, gain: join(gains), blocks, mix: join(blocks.map(b => b.mix), Int32Array) };
}
// createRender in chunks of plan(k) samples, with its hooks.
async function streamed(x, rate, opts, plan) {
  const gains = [], blocks = [];
  const render = await A.createRender({ sampleRate: rate, length: x.length, numberOfChannels: 1 }, { ...opts,
    onGain: (g) => gains.push(Float32Array.from(g)), onMixBlock: (start, length, mix) => blocks.push({ start, length, mix: Int32Array.from(mix) }) });
  const parts = [];
  for (let o = 0, k = 0; o < x.length; k++) {
    const size = Math.max(1, Math.min(plan(k), x.length - o));
    parts.push(await render.push(x.subarray(o, o + size)));
    o += size;
  }
  const end = await render.finish();
  parts.push(end.samples);
  return { render, samples: join(parts), gain: join(gains), blocks, mix: join(blocks.map(b => b.mix), Int32Array) };
}
const blocksOk = (blocks, length) => blocks.length === Math.ceil(length / 512) && blocks.every((b, i) => b.start === 512 * i
  && b.length === (i < blocks.length - 1 ? 512 : length - 512 * i) && b.mix.length === b.length);
const sameBlocks = (a, b) => a.length === b.length && a.every((x, i) => x.start === b[i].start && x.length === b[i].length && same(x.mix, b[i].mix));

/* ---------------- 1. the entry ---------------- */

console.log('\n[1] The voice\'s entry: trunc(fround(s x volume) / 256), the volume a single');
{
  let bad = 0;
  for (let s = -32768; s <= 32767; s++) if (A.mixEntry(s, 255) !== Math.trunc(s * 255 / 256)) bad++;
  check('mixEntry(s, 255) is trunc(s x 255 / 256) for all 65,536 16-bit samples', bad === 0, `${bad} differ`);
  const direct = 255 * 229 / 256, room = 255 * 23 / 256;
  check('at the room\'s volumes the single rounding shows: mixEntry(-32690, 255 x 229 / 256) is -29128 and mixEntry(31388, 255 x 23 / 256) is 2809 (exact division: -29127 and 2808)',
    A.mixEntry(-32690, direct) === -29128 && A.mixEntry(31388, room) === 2809
    && Math.trunc(-32690 * direct / 256) === -29127 && Math.trunc(31388 * room / 256) === 2808,
    `${A.mixEntry(-32690, direct)}, ${A.mixEntry(31388, room)}`);
  check('32767 enters as 32639 and -32768 as -32640', A.mixEntry(32767, 255) === 32639 && A.mixEntry(-32768, 255) === -32640);
  // A double that is not a single: the function narrows it itself.
  const v = direct + 3e-6;
  let unnarrowed = 0, differ = 0;
  for (let s = -32768; s <= 32767; s++) {
    if (A.mixEntry(s, v) !== A.mixEntry(s, f32(v))) differ++;
    if (Math.trunc(f32(s * v) / 256) !== entry(s, v)) unnarrowed++;
  }
  check('a volume handed as a double that is not a single gives what its single gives (for all 65,536 samples)', v !== f32(v) && differ === 0 && unnarrowed > 0,
    `${differ} differ; left unnarrowed, ${unnarrowed} would`);
  // The test's own entry agrees with the function on the room's volumes too.
  let mine = 0;
  for (let s = -32768; s <= 32767; s++) if (A.mixEntry(s, direct) !== entry(s, direct) || A.mixEntry(s, room) !== entry(s, room)) mine++;
  check('the entry at 255 x 229 / 256 and 255 x 23 / 256 is the order\'s formula on all 65,536 samples', mine === 0, `${mine} differ`);
}

/* ---------------- 2. a value that is not whole ---------------- */

console.log('\n[2] A voice-rate value that is not whole is rounded to the nearest, ties to even');
{
  // The auto-gain off on `steam`: the decoded voice (whole values over 32768)
  // times voice_scale 0.5, so every odd value lands on k + 0.5.
  const x = talk(4, 24000, 3, 0.3);
  const { r, gain, mix } = await hooked(x, 24000, { codec: 'steam', agc: false, voiceScale: 0.5, volume: 1 });
  let halves = 0, wrong = 0, truncDiffers = 0, upDiffers = 0;
  for (let i = 0; i < gain.length; i++) {
    const v = gain[i] * 32768, want = entry(int16Of(gain[i]));
    if (mix[i] !== want) wrong++;
    if (Math.abs(v - Math.trunc(v)) === 0.5) {
      halves++;
      if (entry(Math.trunc(v)) !== want) truncDiffers++;
      if (entry(Math.floor(v + 0.5)) !== want) upDiffers++;
    }
  }
  check('auto-gain off, voice_scale 0.5: each value is entered as its even neighbour (onGain against onMixBlock, sample for sample)',
    mix.length === gain.length && wrong === 0 && halves > 10000 && truncDiffers > 1000 && upDiffers > 1000 && r.samples.length === Math.round(x.length * 48000 / 24000),
    `${halves} of ${gain.length} on k + 0.5; truncated, ${truncDiffers} would enter otherwise; half up, ${upDiffers}`);
}

/* ---------------- 3. the upsampler ---------------- */

console.log('\n[3] The upsampler by two: the engine\'s rule, its kept sample, its state per stage');
{
  const up = (x, st) => Array.from(A.mixUpsample2(Int32Array.from(x), st));
  const run1 = (...calls) => { const st = { prev: 0 }; return calls.flatMap(c => up(c, st)); };
  const run2 = (...calls) => { const a = { prev: 0 }, b = { prev: 0 }; return calls.flatMap(c => up(up(c, a), b)); };
  const t = [
    ['[255, 254] then a zero', run1([255, 254], [0]), [127, 255, 254, 254, 127, 0]],
    ['[-1, 0]', run1([-1, 0]), [-1, -1, -1, 0]],
    ['[5] then a zero', run1([5], [0]), [2, 5, 2, 0]],
    ['[5] then a zero, through two stages', run2([5], [0]), [1, 2, 3, 5, 3, 2, 1, 0]],
    ['[-5] then a zero', run1([-5], [0]), [-3, -5, -3, 0]],
    ['[255, 254] then a zero, through two stages', run2([255, 254], [0]), [63, 127, 191, 255, 254, 254, 254, 254, 190, 127, 63, 0]],
    ['[-1, 0] then a zero, through two stages', run2([-1, 0], [0]), [-1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0]]
  ];
  for (const [name, got, want] of t) check(`the read's table: ${name} gives ${want.join(', ')}`, same(got, want), got.join(', '));
  // The ramp across a block's edge, in calls of 256 (the read's first table).
  const ramp = [];
  { const st = { prev: 0 }; for (let c = 0; c < 4; c++) ramp.push(...up(Array.from({ length: 256 }, (_, i) => 3 * (256 * c + i) - 766), st)); }
  check('x[k] = 3k - 766 in calls of 256: outputs 510 to 513 are -3, -1, 0, 2 (the mean across the edge from the kept sample)', same(ramp.slice(510, 514), [-3, -1, 0, 2]), ramp.slice(502, 522).join(', '));
  check('... and the run\'s first four are -383, -766, -765, -763 (the input before the first is 0)', same(ramp.slice(0, 4), [-383, -766, -765, -763]), ramp.slice(0, 4).join(', '));
  const ramp2 = [];
  { const a = { prev: 0 }, b = { prev: 0 }; for (let c = 0; c < 4; c++) ramp2.push(...up(up(Array.from({ length: 128 }, (_, i) => 7 * (128 * c + i) - 892), a), b)); }
  check('two stages, x[k] = 7k - 892 in calls of 128: outputs 508 to 515 are -9, -7, -5, -3, -2, 0, 2, 4', same(ramp2.slice(508, 516), [-9, -7, -5, -3, -2, 0, 2, 4]), ramp2.slice(508, 516).join(', '));
  // One call over a whole run equals calls of 1, 127, 128 and 256, on seeded inputs.
  const rnd = lcg(11), x = Array.from({ length: 6000 }, () => Math.round((rnd() * 2 - 1) * 40000));
  const whole1 = run1(x), whole2 = run2(x);
  const sizes = [1, 127, 128, 256];
  const pieces = (k0) => { const out = []; for (let o = 0, k = k0; o < x.length; k++) { const n = sizes[k % 4]; out.push(x.slice(o, o + n)); o += n; } return out; };
  check('one call over a whole run equals calls of 1, 127, 128 and 256 samples, one stage and two (seeded, 6000 samples)',
    same(run1(...pieces(0)), whole1) && same(run1(...pieces(2)), whole1) && same(run2(...pieces(0)), whole2) && same(run2(...pieces(3)), whole2));
  check('the upsampler is the order\'s rule written here (one stage and two, with the trailing zero)',
    same(run1(x, [0]), upsampleRun(x, 1).concat([0])) && same(run2(x, [0]).slice(0, 4 * x.length + 3), upsampleRun(x, 2)));
}

/* ---------------- 4. entered first, then upsampled ---------------- */

console.log('\n[4] The entry comes first, at the voice\'s own rate');
{
  const st = { prev: 0 };
  const entered = [...A.mixUpsample2(Int32Array.of(A.mixEntry(257, 255), A.mixEntry(255, 255)), st), ...A.mixUpsample2(Int32Array.of(0), st)];
  const s2 = { prev: 0 };
  const after = [...A.mixUpsample2(Int32Array.of(257, 255), s2), ...A.mixUpsample2(Int32Array.of(0), s2)].map(v => A.mixEntry(v, 255));
  check('entered first: [mixEntry(257), mixEntry(255)] and a zero give 127, 255, 254, 254, 127, 0; upsampled first, 127, 255, 255, 254, 126, 0',
    same(entered, [127, 255, 254, 254, 127, 0]) && same(after, [127, 255, 255, 254, 126, 0]), `${entered.join(', ')} / ${after.join(', ')}`);
  for (const [codec, stages] of [['celt_22', 1], ['speex', 2]]) {
    const x = talk(3, 48000, 5);
    const { gain, mix, blocks, r } = await hooked(x, 48000, { codec, volume: 1 });
    const want = upsampleRun(Array.from(gain, (v) => entry(int16Of(v))), stages);
    const factor = 1 << stages;
    check(`${codec}: the render's mix before the clip (onMixBlock) is the gain's output (onGain) entered and upsampled ${stages === 1 ? 'once' : 'twice, with two states,'} by hand, sample for sample from the first block`,
      same(mix, want) && mix.length === factor * gain.length + factor - 1 && blocksOk(blocks, mix.length) && r.sampleRate === 48000,
      `${gain.length} voice samples, a mix of ${mix.length}; first difference ${firstDiff(mix, want)}`);
  }
}

/* ---------------- 5. mixOut ---------------- */

console.log('\n[5] mixOut: the clip, volume as a single, the rounding to even');
{
  const t = [[40000, 0.15, 4915, 'volume before the clip gives 6000'], [-27270, 0.15, -4091, 'the product in doubles is -4090.5 and gives -4090'],
    [30, 0.15, 4, 'a tie: half up gives 5'], [-30, 0.15, -4, 'a tie: half away from zero gives -5'], [10, 0.15, 2, 'a tie'], [-10, 0.15, -2, 'a tie: half up gives -1'],
    [3, 0.5, 2, 'a tie'], [5, 0.5, 2, 'a tie'], [-3, 0.5, -2, 'a tie'], [32767, 0.15, 4915, 'the ceiling at 0.15'], [32767, 0.11, 3604, 'the ceiling at 0.11'],
    [32639, 0.15, 4896, 'the voice\'s clamp at 0.15'], [-32640, 0.15, -4896, ''], [-32768, 1, -32767, 'the clip'], [70000, 1, 32767, '']];
  for (const [s, v, want, why] of t) check(`mixOut(${s}, ${v}) is ${want}${why ? ` (${why})` : ''}`, A.mixOut(s, v) === want, String(A.mixOut(s, v)));
  check('mixClip(-32768) is -32767, mixClip(32768) is 32767, mixClip(-5) is -5', A.mixClip(-32768) === -32767 && A.mixClip(32768) === 32767 && A.mixClip(-5) === -5);
  check('the doubles would round -27270 x 0.15 to -4090 and the ties half up', Math.round(-27270 * 0.15) === -4090 && Math.round(30 * 0.15) === 5 && Math.round(-10 * 0.15) === -1);
}

/* ---------------- 6. the order at the mix, in a render ---------------- */

console.log('\n[6] The order at the mix, in a render: entry, clip, volume, rounding');
const clamped = {};
{
  // A loud 1 kHz tone at 44.1 kHz: Steam's codec and the gain at its cap
  // clamp it at full scale, a 44100 Hz voice (no upsampling).
  const x = tone(1000, 2, 44100, 0.9);
  for (const deviceRate of [44100, 48000]) {
    for (const [volume, top, bottom] of [[0.15, 4896, -4896], [1, 32639, -32640], [0.11, 3590, -3590]]) {
      const { r, gain } = await hooked(x, 44100, { codec: 'steam', volume, deviceRate });
      const ints = Int32Array.from(r.samples, v => v * 32768);
      let max = -Infinity, min = Infinity, atTop = 0, atBottom = 0, whole = true;
      for (let i = 0; i < ints.length; i++) {
        if (ints[i] !== r.samples[i] * 32768) whole = false;
        if (ints[i] > max) max = ints[i];
        if (ints[i] < min) min = ints[i];
        if (ints[i] === top) atTop++;
        if (ints[i] === bottom) atBottom++;
      }
      let gmax = -Infinity, gmin = Infinity;
      for (const g of gain) { gmax = Math.max(gmax, g); gmin = Math.min(gmin, g); }
      const ceiling = Math.round(32767 * volume);
      check(`volume ${volume}, device ${deviceRate} Hz: the gain clamps at full scale, and the render's plateaus are exactly ${top} and ${bottom}, none reaching ${ceiling}`,
        gmax === 32767 / 32768 && gmin === -1 && max === top && min === bottom && atTop > 1000 && atBottom > 1000 && whole && r.sampleRate === deviceRate
        && (volume === 1 || max < ceiling), `${atTop} samples at ${top}, ${atBottom} at ${bottom}; max ${max}, min ${min}`);
      if (deviceRate === 48000) clamped[volume] = r;
    }
  }
}

/* ---------------- 7. the device stage, by vector ---------------- */

console.log('\n[7] The device stage: linear interpolation, phase 0, rounded to even, as integers');
const device = (x, R = 48000) => { const d = A.createDeviceStage(R); return [...d.push(Int32Array.from(x)), ...d.flush()]; };
{
  const ramp = device(Array.from({ length: 400 }, (_, k) => 160 * k));
  check('a ramp x[k] = 160 k gives y[n] = 147 n exactly (the first twelve: 0, 147, ..., 1617)',
    same(ramp.slice(0, 12), [0, 147, 294, 441, 588, 735, 882, 1029, 1176, 1323, 1470, 1617]) && ramp.slice(0, 430).every((v, n) => v === 147 * n), ramp.slice(0, 12).join(', '));
  const imp = device([0, 16000, 0, 0, 0, 0]);
  check('an impulse x[1] = 16000 gives 0, 14700, 2600, 0', same(imp.slice(0, 4), [0, 14700, 2600, 0]), imp.slice(0, 6).join(', '));
  const p80 = A.mixDevicePosition(80, 48000);
  check('output 80 reads k 73 with r 80 (80 x 147 = 160 x 73 + 80): half way', p80.k === 73 && p80.r === 80, JSON.stringify(p80));
  for (const [a, b, want] of [[1, 2, 2], [2, 3, 2], [-1, -2, -2], [-2, -3, -2]]) {
    const x = new Array(90).fill(0); x[73] = a; x[74] = b;
    const y = device(x);
    check(`a tie at output 80: inputs ${a} and ${b} give ${want} (to even)`, y[80] === want, String(y[80]));
  }
  // 2000 inputs: the outputs that read inputs inside the run (k + 1 < 2000).
  const flat = device(new Array(2000).fill(4915)), inside = Math.ceil(1999 * 160 / 147);
  check('a flat run of 4915 stays 4915 (every output whose two inputs are in the run)', flat.slice(0, inside).every(v => v === 4915) && flat[inside] < 4915,
    `${inside} of ${flat.length} outputs`);
  const rnd = lcg(5), x = Int32Array.from({ length: 3000 }, () => Math.round((rnd() * 2 - 1) * 32767));
  check('a 44100 Hz device returns its input unchanged', same(device(x, 44100), x));
  // The rule by hand at the other rates the option takes.
  for (const R of [88200, 96000, 192000]) {
    const g = (a, b) => (b ? g(b, a % b) : a), N = 44100 / g(44100, R), D = R / g(44100, R), y = device(x, R);
    let bad = 0;
    for (let n = 0; n < y.length; n++) {
      const k = Math.floor(n * N / D), r = n * N - k * D, num = (x[k] ?? 0) * (D - r) + (x[k + 1] ?? 0) * r;
      if (y[n] !== roundEven(num / D)) bad++;
    }
    check(`${R} Hz: every output is roundEven((x[k] (D - r) + x[k + 1] r) / D)`, bad === 0 && y.length > x.length * R / 44100 - 2, `${bad} of ${y.length} differ`);
  }
}

/* ---------------- 8. the positions ---------------- */

console.log('\n[8] The positions in whole numbers, against BigInt');
{
  const rnd = lcg(7);
  for (const R of [48000, 88200, 96000, 192000]) {
    const g = (a, b) => (b ? g(b, a % b) : a), N = BigInt(44100 / g(44100, R)), D = BigInt(R / g(44100, R));
    const ns = [0, 1, 79, 80, 160, 160000000, 2 ** 40, 2 ** 40 - 1];
    for (let i = 0; i < 2000; i++) ns.push(Math.floor(rnd() * 2 ** 40));
    let bad = 0;
    for (const n of ns) {
      const p = A.mixDevicePosition(n, R), t = BigInt(n) * N;
      if (BigInt(p.k) !== t / D || BigInt(p.r) !== t % D) bad++;
    }
    check(`${R} Hz: mixDevicePosition(n) is n x N = D k + r in BigInt for ${ns.length} seeded n up to 2^40 and at 160,000,000`, bad === 0, `${bad} differ`);
  }
}

/* ---------------- 9. the stage's sound ---------------- */

console.log('\n[9] The device stage\'s sound at 48 kHz: the images and the roll-off');
{
  // Amplitude of frequency f, Blackman-Harris window (sidelobes under -92 dB).
  const level = (x, rate, f) => {
    const n = x.length;
    let re = 0, im = 0, ws = 0;
    for (let i = 0; i < n; i++) {
      const p = 2 * Math.PI * i / (n - 1), w = 0.35875 - 0.48829 * Math.cos(p) + 0.14128 * Math.cos(2 * p) - 0.01168 * Math.cos(3 * p);
      ws += w;
      re += w * x[i] * Math.cos(2 * Math.PI * f * i / rate);
      im -= w * x[i] * Math.sin(2 * Math.PI * f * i / rate);
    }
    return 2 * Math.hypot(re, im) / ws;
  };
  const db = (v) => 20 * Math.log10(v);
  const sinc2Db = (f) => { const t = Math.PI * f / 44100; return db((Math.sin(t) / t) ** 2); };
  const at48 = (f) => {
    const x = Int32Array.from({ length: 44100 + 2205 }, (_, i) => Math.round(0.9 * 32767 * Math.sin(2 * Math.PI * f * i / 44100)));
    const y = device(x, 48000).slice(0, 48000);
    return { x: Array.from(x.slice(0, 44100)), y };
  };
  const { y: y1 } = at48(1000);
  const t1 = level(y1, 48000, 1000), i4900 = db(level(y1, 48000, 4900) / t1), i2900 = db(level(y1, 48000, 2900) / t1);
  check('a 1 kHz tone at -1 dBFS has images at 4900 Hz and 2900 Hz within 0.3 dB of -65.4 and -66.2 dB under the tone',
    Math.abs(i4900 - -65.38) < 0.3 && Math.abs(i2900 - -66.17) < 0.3, `${i4900.toFixed(2)} and ${i2900.toFixed(2)} dB`);
  for (const [f, want] of [[13000, -2.56], [18000, -5.05]]) {
    const { x, y } = at48(f), gain = db(level(y, 48000, f) / level(x, 44100, f));
    check(`the response at ${f} Hz is within 0.1 dB of sinc²(f / 44100) (${want} dB)`, Math.abs(gain - sinc2Db(f)) < 0.1 && Math.abs(sinc2Db(f) - want) < 0.01,
      `${gain.toFixed(3)} dB; sinc² ${sinc2Db(f).toFixed(3)}`);
  }
}

/* ---------------- 10. the stream ---------------- */

console.log('\n[10] The stream: the same samples at any chunking');
{
  const rnd = lcg(21), sizes = (k0) => (k) => [1, 127, 512, 4096][(k + k0) % 4];
  const randomPlan = (seed) => { const r = lcg(seed); return () => 1 + Math.floor(r() * 3000); };
  const plans = { '1': () => 1, '127': () => 127, '512': () => 512, '4096': () => 4096, 'seeded random': randomPlan(3), 'mixed': sizes(0) };
  const chunked = (stage, x, plan) => { const out = []; for (let o = 0, k = 0; o < x.length; k++) { const n = plan(k); out.push(stage.push(x.subarray(o, o + n))); o += n; } out.push(stage.flush()); return join(out, Int32Array); };
  const ints = Int32Array.from({ length: 12000 }, () => Math.round((rnd() * 2 - 1) * 32767));
  const whole = chunked(A.createDeviceStage(48000), ints, () => ints.length);
  let ok = true;
  for (const [name, plan] of Object.entries(plans)) if (!same(chunked(A.createDeviceStage(48000), ints, plan), whole)) { ok = false; console.log(`    device stage differs at ${name}`); }
  check('the device stage gives the same samples at chunk sizes 1, 127, 512, 4096, seeded random and mixed as in one piece', ok, `${whole.length} outputs`);
  // The whole stage, from the gain's output: whole values, values that are
  // not whole and values past full scale, at each voice rate and both devices.
  const floats = Float32Array.from({ length: 9000 }, (_, i) => (i % 7 === 0 ? (rnd() * 2.4 - 1.2) : Math.round((rnd() * 2 - 1) * 32767) / 32768 * (i % 3 ? 1 : 0.5)));
  let all = true;
  for (const voiceRate of [44100, 22050, 11025]) for (const deviceRate of [44100, 48000]) {
    const make = () => A.createOutputStage({ voiceRate, volume: 0.5, deviceRate });
    const one = chunked(make(), floats, () => floats.length);
    for (const [name, plan] of Object.entries(plans)) if (!same(chunked(make(), floats, plan), one)) { all = false; console.log(`    ${voiceRate} -> ${deviceRate}: differs at ${name}`); }
  }
  check('the whole stage (entry, upsampling, blocks, mixOut, device) gives the same samples at those chunk sizes, for 44100, 22050 and 11025 Hz voices at both device rates', all);
  // createRender against process() where a limiter would show: volume 1, a gain capped at 3.
  const x = talk(4, 48000, 9, 0.6), opts = { codec: 'steam', volume: 1, maxGain: 3 };
  const p = await A.process(buffer(x, 48000), opts), s = await streamed(x, 48000, opts, () => 960);
  let peak = 0;
  for (const v of p.samples) peak = Math.max(peak, Math.abs(v));
  check('createRender equals process() on steam, volume 1, voice_maxgain 3 (a limiter left in one of them would show)', same(s.samples, p.samples) && peak > 0.98,
    `peak ${(peak * 32768).toFixed(0)}`);
}

/* ---------------- 11. the blocks ---------------- */

console.log('\n[11] The mixer\'s blocks: positions from the render\'s first sample, nothing held back');
{
  const plans = { '1': () => 1, '127': () => 127, '512': () => 512, '4096': () => 4096, 'seeded random': (() => { const r = lcg(8); return () => 1 + Math.floor(r() * 5000); })() };
  for (const codec of ['steam', 'celt_22', 'speex']) {
    const x = talk(codec === 'steam' ? 0.6 : 1.5, 48000, 12);
    const p = await hooked(x, 48000, { codec, volume: 0.5 });
    let ok = blocksOk(p.blocks, p.mix.length) && p.blocks.at(-1).length < 512 && p.blocks.at(-1).length > 0, which = [];
    for (const [name, plan] of Object.entries(plans)) {
      const s = await streamed(x, 48000, { codec, volume: 0.5 }, plan);
      if (!sameBlocks(s.blocks, p.blocks) || !same(s.samples, p.r.samples)) { ok = false; which.push(name); }
    }
    check(`${codec}: onMixBlock reports starts 0, 512, 1024, ... and one short last block, the same in process() and in createRender at chunk sizes 1, 127, 512, 4096 and seeded random`,
      ok, `${p.blocks.length} blocks, the last of ${p.blocks.at(-1).length}${which.length ? `; differ at ${which.join(', ')}` : ''}`);
  }
}

/* ---------------- 12. the length ---------------- */

console.log('\n[12] The output\'s length: the source\'s duration at the device\'s rate');
{
  const g = (a, b) => (b ? g(b, a % b) : a);
  for (const rate of [8000, 22050, 44100, 48000, 96000]) {
    const n = Math.round(0.4 * rate) + 7;
    const src = Float32Array.from({ length: n }, (_, i) => 0.3 * Math.sin(2 * Math.PI * 300 * i / rate) * (i > n / 4 ? 1 : 0));
    for (const deviceRate of [48000, 44100]) {
      const want = Math.round(n * deviceRate / rate);
      const { r, mix } = await hooked(src, rate, { codec: 'steam', deviceRate });
      const render = await A.createRender({ sampleRate: rate, length: n, numberOfChannels: 1 }, { codec: 'steam', deviceRate });
      render.free();
      // What the mix's own length would give (its ceil at the device's rate).
      const byMix = Math.ceil(mix.length * deviceRate / 44100);
      check(`a source of ${n} samples at ${rate} Hz, device ${deviceRate} Hz: ${want} samples (round(n x ${deviceRate} / ${rate})), createRender's outputLength too`,
        r.samples.length === want && render.outputLength === want && r.sampleRate === deviceRate && render.sampleRate === deviceRate,
        `${r.samples.length}; by the mix's length it would be ${byMix}`);
    }
  }
  for (const [codec, stages] of [['celt_22', 1], ['speex', 2]]) {
    for (const [rate, n] of [[48000, 24011], [22050, 11017], [8000, 4003]]) {
      const src = Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 440 * i / rate));
      const { r, gain, mix, blocks } = await hooked(src, rate, { codec, volume: 1 });
      const N = gain.length, factor = 1 << stages, e = Array.from(gain, (v) => entry(int16Of(v)));
      // The last mean: the last entered value with zeros after it.
      const last = upsampleRun(e, stages).at(-1);
      check(`${codec}, a voice of ${N} samples from ${n} at ${rate} Hz: the mix is ${factor} N + ${factor - 1} long, its last sample the last mean (${last}), and the file is the contract's length`,
        mix.length === factor * N + factor - 1 && mix.at(-1) === last && last !== 0 && blocksOk(blocks, mix.length) && r.samples.length === Math.round(n * 48000 / rate),
        `mix ${mix.length}, file ${r.samples.length}`);
    }
  }
}

/* ---------------- 13. the file's bytes ---------------- */

console.log('\n[13] The file holds exactly the render\'s 16-bit integers');
{
  const pcm = async (blob) => { const b = Buffer.from(await blob.arrayBuffer()); return Int16Array.from({ length: (b.length - 44) / 2 }, (_, i) => b.readInt16LE(44 + 2 * i)); };
  const at15 = await pcm(clamped[0.15].blob), at1 = await pcm(clamped[1].blob);
  const has = (p, v) => p.some(x => x === v);
  check('the WAV of the clamped voice at volume 0.15 holds 4896 and -4896 (the old writer wrote 4895)', has(at15, 4896) && has(at15, -4896) && Math.max(...at15) === 4896);
  check('at volume 1, 32639 and -32640', has(at1, 32639) && has(at1, -32640) && Math.max(...at1) === 32639 && Math.min(...at1) === -32640);
  const flat = await pcm(A.encodeWav(new Float32Array(100).fill(4915 / 32768), 48000));
  check('a flat run at the ceiling, 4915 / 32768, is written 4915 (the old writer wrote 4914)', flat.every(v => v === 4915));
  let exact = true;
  for (const r of [clamped[0.15], clamped[1], (await hooked(talk(2, 48000, 6), 48000, { codec: 'celt_22', volume: 0.5 })).r,
    (await hooked(talk(2, 44100, 7), 44100, { codec: 'speex', volume: 0.3, deviceRate: 44100 })).r]) {
    const p = await pcm(r.blob);
    if (p.length !== r.samples.length || !p.every((v, i) => v === r.samples[i] * 32768)) exact = false;
  }
  check('every sample of a render\'s WAV equals samples x 32768 exactly (four renders: two profiles, two volumes, both device rates)', exact);
  const header = Buffer.from(await clamped[1].blob.arrayBuffer());
  check('the WAV\'s header gives the device\'s rate', header.readUInt32LE(24) === 48000);
}

/* ---------------- 14. the live chain after its mix point ---------------- */

console.log('\n[14] The live chain is the render after the mix point');
{
  async function liveRun(x, rate, opts, block) {
    const blocks = [];
    const chain = await A.createLiveChain({ ...opts, onMixBlock: (start, length, mix) => blocks.push({ start, length, mix: Int32Array.from(mix) }) }, rate);
    const parts = [];
    for (let o = 0; o < x.length; o += block) parts.push(await chain.process(x.subarray(o, Math.min(x.length, o + block))));
    chain.free();
    return { out: join(parts), contentDelay: chain.contentDelay, latencyMs: chain.stats.latencyMs, blocks };
  }
  for (const rate of [48000, 44100]) {
    const x = talk(6, rate, 31, 0.3);
    for (const volume of rate === 48000 ? [1, 0.5] : [1]) {
      const opts = { codec: 'steam', volume };
      const ren = await streamed(x, rate, { ...opts, deviceRate: rate }, () => 4096);
      const live = await liveRun(x, rate, opts, rate / 50);
      const L = live.out.length, d = firstDiff(live.out, ren.samples.subarray(0, L));
      const fullBlocks = live.blocks.length;
      const blocksSame = fullBlocks > 0 && live.blocks.every((b, i) => b.start === ren.blocks[i].start && b.length === 512 && same(b.mix, ren.blocks[i].mix));
      check(`a ${rate} Hz context, volume ${volume}: the live chain's output is createRender({ deviceRate: ${rate} })'s, sample for sample, over what it gave out; onMixBlock the same starts and samples`,
        d === -1 && L > 0.9 * ren.samples.length && blocksSame, `${L} of ${ren.samples.length} samples; ${fullBlocks} blocks; first difference ${d}`);
      if (volume === 1) {
        const correlate = (lag) => { let dot = 0, ea = 0, eb = 0; for (let i = rate / 2; i < L - 8; i++) { dot += ren.samples[i] * live.out[i + lag]; ea += ren.samples[i] ** 2; eb += live.out[i + lag] ** 2; } return dot / Math.sqrt(ea * eb); };
        let peak = -3;
        for (let lag = -3; lag <= 3; lag++) if (correlate(lag) > correlate(peak)) peak = lag;
        check(`a ${rate} Hz context: contentDelay is 0, where the correlation with the render peaks`, live.contentDelay === 0 && peak === 0, `peak at ${peak}, r ${correlate(peak).toFixed(5)}`);
      }
    }
  }
}

console.log(`\n${passed} output-stage checks passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
