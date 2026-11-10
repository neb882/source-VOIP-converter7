// Compare the Speex 1.0.2 WebAssembly module with a native build of the same
// sources.
//
//   node tests/speex102/native.mjs [speex-1.0.2-checkout] [musl-1.2.5-checkout]
//
// Compiles the pinned Speex 1.0.2 sources that tests/speex102/build.mjs builds,
// with the same defines and api.c, natively with the machine's C compiler (`cc`,
// its own C library and libm) plus native.c. The flags keep the native
// arithmetic to the WebAssembly module's: no contraction into fused
// multiply-adds, no fast-math, and on x86 SSE2 for floats and doubles (not the
// x87 unit). Then codes each test signal below with both, a fresh codec per
// signal, and compares the packets, the decoded floats and the 16-bit output
// bit for bit, printing the SHA-256 of each. They are recorded in
// tests/speex102.verify.mjs. A one-off: it needs git, a C compiler and network
// access, which the test suite does not.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCodec } from '../../vendor/speex-1.0.2/index.mjs';
import { DEFINES, cloneSpeex, cloneMusl, sourceFiles } from './build.mjs';

export const RATE = 11025;   // what the game feeds the module, which believes it is 8000 Hz

function lcg(seed) {
  return () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
}
// The test signals, 16-bit samples at the game's 11025 Hz, each a whole number
// of 160-sample frames; 516 frames in all.
export function testSignals() {
  // Speech-like, 276 frames (4.0 s): voiced syllables on a gliding pitch, a
  // noisy stretch, a pause and a loud vowel that clips at full scale.
  const speech = new Int16Array(276 * 160), noise1 = lcg(12345);
  let phase = 0;
  for (let i = 0; i < speech.length; i++) {
    const t = i / RATE;
    const f0 = 140 + 40 * Math.sin(2 * Math.PI * 0.8 * t) + 15 * Math.sin(2 * Math.PI * 2.9 * t);
    phase += f0 / RATE;
    let v = 0;
    for (let h = 1; h * f0 < 5200; h++) v += Math.sin(2 * Math.PI * h * phase + 0.3 * h * h) / h;
    const noise = noise1() * 2 - 1, syllable = Math.abs(Math.sin(Math.PI * 3.1 * t)) ** 0.6;
    const s = t < 1.6 ? 0.25 * v * syllable : t < 2.2 ? 0.2 * noise * syllable : t < 2.6 ? 0 : 1.6 * v * syllable;
    speech[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32768)));
  }
  // A full-scale square wave, 100 frames: 50 samples a period (220.5 Hz).
  const square = Int16Array.from({ length: 100 * 160 }, (_, i) => (i % 50 < 25 ? 32767 : -32768));
  // Silence, 40 frames.
  const silence = new Int16Array(40 * 160);
  // White noise at -6 dBFS (RMS half of full scale; uniform, so its peak is
  // 28378), 100 frames.
  const noise2 = lcg(777), peak = 16384 * Math.sqrt(3);
  const noise = Int16Array.from({ length: 100 * 160 }, () => Math.round((noise2() * 2 - 1) * peak));
  return { speech, square, silence, noise };
}

// A signal through the WebAssembly module, framed as native.c writes it: per
// frame the packet, the decoded floats and the 16-bit output. With `resetAt`,
// the codec is reset before that frame, as native.c does with its argument.
export async function wasmStream(signal, resetAt = -1) {
  const codec = await createCodec();
  const chunks = [];
  try {
    for (let f = 0; (f + 1) * 160 <= signal.length; f++) {
      if (f === resetAt) codec.reset();
      const packet = codec.encode(signal.subarray(f * 160, (f + 1) * 160));
      const floats = codec.decodeFloats(packet);
      const samples = Int16Array.from(floats, v => (Math.trunc(v) << 16) >> 16);
      chunks.push(packet, new Uint8Array(floats.buffer), new Uint8Array(samples.buffer));
    }
  } finally {
    codec.free();
  }
  return Buffer.concat(chunks);
}
// The runs compared: each test signal through a new codec, and the speech-like
// signal again with a reset before its frame 138 (the game resets with request
// 26, which in 1.0.2 leaves part of the decoder's state as it was).
export const RESET_AT = 138;
export function testRuns() {
  const signals = testSignals();
  return [...Object.entries(signals).map(([name, signal]) => ({ name, signal, resetAt: -1 })),
    { name: 'speechReset', signal: signals.speech, resetAt: RESET_AT }];
}
export const FRAME_BYTES = 20 + 640 + 320;

// Splits a stream into its packets, floats and 16-bit output, and hashes each.
export function digest(stream) {
  const hash = () => crypto.createHash('sha256');
  const packets = hash(), floats = hash(), samples = hash();
  for (let at = 0; at < stream.length; at += FRAME_BYTES) {
    packets.update(stream.subarray(at, at + 20));
    floats.update(stream.subarray(at + 20, at + 660));
    samples.update(stream.subarray(at + 660, at + FRAME_BYTES));
  }
  return { frames: stream.length / FRAME_BYTES, packets: packets.digest('hex'), floats: floats.digest('hex'),
    samples: samples.digest('hex') };
}

// Where two streams first differ: the frame, and the packet byte or the sample.
function firstDifference(a, b) {
  for (let at = 0; at < Math.min(a.length, b.length); at++) {
    if (a[at] === b[at]) continue;
    const frame = Math.floor(at / FRAME_BYTES), within = at % FRAME_BYTES, base = frame * FRAME_BYTES;
    if (within < 20) return `frame ${frame}, packet byte ${within}: native ${a[at]}, WebAssembly ${b[at]}`;
    const float = (s, i) => s.readFloatLE(base + 20 + 4 * i);
    if (within < 660) {
      const i = Math.floor((within - 20) / 4);
      return `frame ${frame}, decoded float ${i}: native ${float(a, i)}, WebAssembly ${float(b, i)}`;
    }
    const i = Math.floor((within - 660) / 2);
    return `frame ${frame}, 16-bit sample ${i}: native ${a.readInt16LE(base + 660 + 2 * i)} (float ${float(a, i)}), ` +
      `WebAssembly ${b.readInt16LE(base + 660 + 2 * i)} (float ${float(b, i)})`;
  }
  return a.length === b.length ? 'none' : `lengths ${a.length} and ${b.length}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'speex102-native-'));
  try {
    const src = cloneSpeex(process.argv[2], tmp);
    cloneMusl(process.argv[3], tmp);   // not used natively; checked so both builds name the same inputs
    const binary = path.join(tmp, 'speex102-native');
    const x86 = ['x64', 'ia32'].includes(os.arch()) ? ['-msse2', '-mfpmath=sse'] : [];
    run('cc', ['-O2', '-ffp-contract=off', '-fno-fast-math', ...x86, '-w', `-I${path.join(src, 'libspeex')}`, ...DEFINES,
      ...sourceFiles(src), path.join(here, 'api.c'), path.join(here, 'native.c'), '-lm', '-o', binary]);
    const compiler = run('cc', ['--version']).split('\n')[0];
    const runs = testRuns();
    const frames = runs.reduce((n, r) => n + r.signal.length / 160, 0);
    console.log(`Native: ${compiler}, ${os.arch()}, -O2 -ffp-contract=off -fno-fast-math ${x86.join(' ')}. ` +
      `${frames} frames of test signal (${runs.map(r => r.name).join(', ')}).`);
    let same = true;
    for (const { name, signal, resetAt } of runs) {
      const result = spawnSync(binary, resetAt >= 0 ? [String(resetAt)] : [], { input: Buffer.from(signal.buffer), maxBuffer: 1 << 26 });
      if (result.status !== 0) throw new Error(`The native build failed on ${name} (status ${result.status})`);
      const stderr = result.stderr.toString().trim();
      const native = result.stdout, wasm = await wasmStream(signal, resetAt);
      const n = digest(native), w = digest(wasm), match = native.equals(wasm);
      same &&= match;
      console.log(`${name}: ${n.frames} frames; packets ${n.packets}, floats ${n.floats}, 16-bit ${n.samples}` +
        (match ? ' (WebAssembly identical)' : `\n  WebAssembly packets ${w.packets}, floats ${w.floats}, 16-bit ${w.samples} DIFFER;` +
          ` first difference: ${firstDifference(native, wasm)}`) + (stderr ? `\n  native stderr: ${stderr}` : ''));
    }
    console.log(same ? 'The WebAssembly module matches the native build bit for bit.' : 'The builds differ.');
    process.exitCode = same ? 0 : 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
