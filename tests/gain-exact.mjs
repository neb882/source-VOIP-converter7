// The receiver's gain against the game's own decoded voice (W3-05).
//
//   node tests/gain-exact.mjs --takes <takes folder>
//     Finds celt_gain1.wav and celt_gain10.wav under the folder (Set H: the
//     game's decoded voice with voice_maxgain 1, where the gain does nothing,
//     and with 10; 16-bit mono, 22050 Hz), runs
//     TF2Audio.receiverAutoGain(gain1 / 32768, { maxGain: 10, avgGain: 0.5,
//     scale: 1 }), converts back with round(y x 32768) and compares with
//     gain10. Prints how many samples differ before the last 512 (one
//     packet; the last packet differs between the two key presses) and in
//     the last 512, and exits non-zero unless the first count is 0. It prints
//     nothing of the recordings but those counts.
//
//   node tests/gain-exact.mjs --synthetic
//     The same check on two files it makes in a temporary folder: a seeded
//     signal, and the engine's rule (the transcription below) applied to it,
//     with the last 512 samples made to differ as the takes' do. Run once as
//     made (0 must differ) and once with one sample of the second file
//     changed (1 must differ, and the run must fail). Nothing is kept.
//
// The engine is loaded as tests/verify.js loads it. The transcription is
// exported for tests/gain.verify.mjs, so the rule is written out once in
// the tests and once in audio.js, by different hands.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEngine as loadShared, sourceRoot } from './lib/engine.cjs';

const root = sourceRoot();

// The engine's rule as docs/work-orders/W3-05-receiver-gain.md writes it
// (from docs/reports/W3-03-engine-binary.md, section 2; the script that
// matched Set H), on integer samples, as the engine's gain function was
// read a second time: every float operation a separate single-precision
// one (the box rounds the denominator once; at avggain 0.5 the two agree),
// the cap kept only when the quotient is strictly less, and the gain and
// product as 32-bit integers that wrap. Returns the output samples and the
// value of `fixed` at the start of each block. notDecoded(n), when given,
// is spec point 4 of the order, which is not in the engine: an all-zero
// block whose first sample n was not decoded holds the gain.
export function engineGain(xs, settings, notDecoded = null) {
  const f32 = Math.fround;
  const avggain = f32(settings.avgGain), maxgain = f32(settings.maxGain), scale = f32(settings.scale);
  let current = 1, next = 1, fixed = 128, step = 0, pos = 0, sum = 0, peak = 0;   // a reset
  const out = new Int32Array(xs.length), fixedAt = [];
  for (let n = 0; n < xs.length; n++) {
    const x = xs[n];
    if (pos === 0) fixedAt.push(fixed);
    const a = Math.abs(x); sum += a; peak = Math.max(peak, a);
    const g = (fixed + Math.imul(pos, step)) | 0;          // 32-bit
    const y = Math.imul(g, x) >> 7;                        // 32-bit product, low 32 bits kept; arithmetic shift
    out[n] = Math.min(32767, Math.max(-32768, y));
    pos += 1;
    if (pos === 128) {
      if (notDecoded && peak === 0 && notDecoded(n - 127)) {
        fixed += 128 * step; step = 0;                     // spec 4: held
      } else {
        current = f32(next * scale);
        fixed   = Math.trunc(current * 128);
        const mean = Math.floor(sum / 128);                // integer division
        const den  = f32(mean + f32((peak - mean) * avggain));   // product, then sum
        let t      = f32(32767 / den);                     // a zero blend: +infinity
        t = t < maxgain ? t : maxgain;                     // the cap (a NaN gives maxgain)
        next = f32(t * scale);
        step = Math.trunc(f32(f32(f32(next - current) / 127) * 128));   // toward zero
      }
      pos = 0; sum = 0; peak = 0;
    }
  }
  return { out, fixedAt };
}

function loadEngine() {
  return loadShared({ root }).audio;
}

// A 16-bit mono PCM WAV: its rate and samples (Int16Array).
function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path.basename(file)}: not a WAV file`);
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= b.length;) {
    const id = b.toString('ascii', o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(o + 8), channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') data = b.subarray(o + 8, Math.min(b.length, o + 8 + size));
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error(`${path.basename(file)}: no fmt or data chunk`);
  if (fmt.format !== 1 || fmt.channels !== 1 || fmt.bits !== 16) throw new Error(`${path.basename(file)}: not 16-bit mono PCM`);
  const samples = new Int16Array(data.length >> 1);
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(2 * i);
  return { rate: fmt.rate, samples };
}

function writeWav(file, samples, rate) {
  const b = Buffer.alloc(44 + 2 * samples.length);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36 + 2 * samples.length, 4); b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii'); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(2 * rate, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(2 * samples.length, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(samples[i], 44 + 2 * i);
  fs.writeFileSync(file, b);
}

function find(folder, name) {
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === name) hits.push(full);
    }
  };
  walk(folder);
  if (hits.length !== 1) throw new Error(`${hits.length} files named ${name} under the takes folder (one is needed)`);
  return hits[0];
}

const PACKET = 512;

function exactCheck(folder) {
  const gain1 = readWav(find(folder, 'celt_gain1.wav')), gain10 = readWav(find(folder, 'celt_gain10.wav'));
  if (gain1.rate !== 22050 || gain10.rate !== 22050) throw new Error('the files are not at 22050 Hz');
  if (gain1.samples.length !== gain10.samples.length) throw new Error(`the files differ in length (${gain1.samples.length} and ${gain10.samples.length} samples)`);
  const n = gain1.samples.length, body = n - PACKET;
  const A = loadEngine();
  const x = Float32Array.from(gain1.samples, v => v / 32768);
  const y = A.receiverAutoGain(x, { maxGain: 10, avgGain: 0.5, scale: 1 });
  let before = 0, last = 0;
  for (let i = 0; i < n; i++) {
    if (Math.round(y[i] * 32768) === gain10.samples[i]) continue;
    if (i < body) before++; else last++;
  }
  console.log(`samples that differ before the last ${PACKET}: ${before} of ${body}`);
  console.log(`samples that differ in the last ${PACKET}: ${last} of ${PACKET}`);
  return before === 0;
}

// A seeded stand-in for the gain-1 take: noise of changing levels, with
// runs of exact zeros, 571 packets of 512 as the takes have.
function syntheticTake() {
  const n = 571 * PACKET, out = new Int16Array(n);
  let s = 0x5EED;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n;) {
    const len = 300 + Math.floor(rnd() * 6000);
    if (rnd() < 0.2) { i += len; continue; }   // zeros
    const level = 20 + Math.floor(rnd() ** 2 * 32747);
    for (let k = 0; k < len && i < n; k++, i++) out[i] = Math.round(level * (rnd() * 2 - 1) * Math.sin(Math.PI * k / len));
  }
  return out;
}

function synthetic() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gain-exact-'));
  try {
    const gain1 = syntheticTake();
    const { out } = engineGain(gain1, { maxGain: 10, avgGain: 0.5, scale: 1 });
    const gain10 = Int16Array.from(out);
    for (let i = gain10.length - PACKET + 1; i < gain10.length; i++) gain10[i] = gain10[i] === 0 ? 1 : 0;   // 511 differ, as in the takes
    writeWav(path.join(dir, 'celt_gain1.wav'), gain1, 22050);
    writeWav(path.join(dir, 'celt_gain10.wav'), gain10, 22050);
    const run = () => spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--takes', dir], { encoding: 'utf8', env: process.env });
    const asMade = run();
    console.log(`as made (exit ${asMade.status}):\n${asMade.stdout.trim()}${asMade.stderr ? `\n${asMade.stderr.trim()}` : ''}`);
    gain10[100000] += gain10[100000] === 32767 ? -1 : 1;
    writeWav(path.join(dir, 'celt_gain10.wav'), gain10, 22050);
    const changed = run();
    console.log(`one sample of celt_gain10.wav changed (exit ${changed.status}):\n${changed.stdout.trim()}${changed.stderr ? `\n${changed.stderr.trim()}` : ''}`);
    const ok = asMade.status === 0 && /before the last 512: 0 of /.test(asMade.stdout)
      && changed.status !== 0 && /before the last 512: 1 of /.test(changed.stdout);
    console.log(ok ? 'gain-exact --synthetic: ok' : 'gain-exact --synthetic: FAIL');
    return ok;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--takes');
  try {
    if (args.includes('--synthetic')) process.exitCode = synthetic() ? 0 : 1;
    else if (at >= 0 && args[at + 1]) process.exitCode = exactCheck(path.resolve(args[at + 1])) ? 0 : 1;
    else { console.error('usage: node tests/gain-exact.mjs --takes <takes folder> | --synthetic'); process.exitCode = 2; }
  } catch (error) {
    console.error(`gain-exact: ${error.message}`);
    process.exitCode = 1;
  }
}
