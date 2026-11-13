// The two clips the game was fed as its microphone in Sets H, I, M and O
// (tests/REFERENCE_2026.md, "The file-input runs, measured again"), made bit
// for bit: 16-bit mono with a plain 44-byte header, one at 22050 Hz (Set H)
// and one at 11025 Hz (Sets I, M and O). 13.2 s each: half a second of
// silence; three 1 kHz tone bursts; a sweep from 300 Hz to 3 kHz over 3 s;
// six bursts of an 11-harmonic 150 Hz tone with pauses of 0.2, 0.3, 0.44,
// 0.6, 1.0 and 0.5 s; two 500 Hz bursts; half a second of silence.
//
//   node tests/recordings/make-inputs.mjs <folder>
//     writes voice_input_22050.wav and voice_input_11025.wav into the folder
//     (tests/reproduce.mjs inputs does the same and checks their SHA-256).
//
// The arithmetic is the original script's, ported line for line: the
// checksums the suite pins are those of the files the game was fed, and any
// change here (the order of a sum, a rounding, a ramp) moves them. Node alone,
// no package, no randomness.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RATES = [22050, 11025];

export const fileName = (rate) => `voice_input_${rate}.wav`;

// The clip's samples as floats (full scale 1), in the order they were made.
function clipFloats(rate) {
  if (!RATES.includes(rate)) throw new RangeError(`the clips are made at ${RATES.join(' and ')} Hz only`);
  const ramp = rate === 22050 ? 220 : 110;
  const out = [];
  const tone = (f, sec, amp = 0.25) => { const n = Math.trunc(sec * rate); for (let i = 0; i < n; i++) { const e = Math.min(1, i / ramp, (n - i) / ramp); out.push(amp * e * Math.sin(2 * Math.PI * f * i / rate)); } };
  const sil = (sec) => { const n = Math.trunc(sec * rate); for (let i = 0; i < n; i++) out.push(0); };
  sil(0.5);
  for (let k = 0; k < 3; k++) { tone(1000, 0.2); sil(0.2); }
  sil(0.6);
  { const n = Math.trunc(3 * rate); let ph = 0;
    for (let i = 0; i < n; i++) { const f = 300 * (10 ** (i / n)); ph += 2 * Math.PI * f / rate; const e = Math.min(1, i / ramp, (n - i) / ramp); out.push(0.25 * e * Math.sin(ph)); } }
  sil(0.6);
  for (const p of [0.2, 0.3, 0.44, 0.6, 1.0, 0.5]) {
    const n = Math.trunc(0.5 * rate);
    for (let i = 0; i < n; i++) { const t = i / rate, e = Math.min(1, i / ramp, (n - i) / ramp); let v = 0; for (let h = 1; h < 12; h++) v += Math.sin(2 * Math.PI * 150 * h * t) / h; out.push(0.12 * e * v); }
    sil(p);
  }
  for (let k = 0; k < 2; k++) { tone(500, 0.2); sil(0.2); }
  sil(0.5);
  return out;
}

// The clip's 16-bit samples: each float clamped to [-1, 1], times 32767,
// truncated toward zero.
export function clipSamples(rate) {
  return Int16Array.from(clipFloats(rate), (v) => Math.trunc(Math.max(-1, Math.min(1, v)) * 32767));
}

// The clip as the WAV file's bytes: the plain 44-byte header, then the samples.
export function clipWav(rate) {
  const samples = clipSamples(rate);
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(v, 44 + 2 * i));
  return b;
}

// Writes both clips into the folder (made if missing); returns the files'
// names and bytes, in RATES's order.
export function writeClips(folder) {
  fs.mkdirSync(folder, { recursive: true });
  return RATES.map((rate) => {
    const bytes = clipWav(rate);
    fs.writeFileSync(path.join(folder, fileName(rate)), bytes);
    return { rate, name: fileName(rate), bytes };
  });
}

const realPath = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
if (process.argv[1] && realPath(process.argv[1]) === realPath(fileURLToPath(import.meta.url))) {
  if (!process.argv[2]) {
    console.error('usage: node tests/recordings/make-inputs.mjs <folder>');
    process.exitCode = 2;
  } else {
    for (const { name, bytes } of writeClips(path.resolve(process.argv[2]))) console.log(`${name}: ${bytes.length} bytes`);
  }
}
