// Compare the Speex WebAssembly module with a native build of the same sources.
//
//   node tests/speex/native.mjs [speex-1.2.1-checkout] [musl-1.2.5-checkout]
//
// Compiles the pinned Speex 1.2.1 sources that tests/speex/build.mjs builds,
// with the same defines and api.c, natively with the machine's C compiler
// (`cc`, its own C library and libm) plus native.c. Then codes the test signal
// below at several qualities with both, losing every seventh frame, and
// prints the SHA-256 of each one's packets and decoded output. Bit-identical
// results are recorded in tests/speex.verify.mjs. A one-off: it needs git, a
// C compiler and network access, which the test suite does not.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCodec } from '../../vendor/speex/index.mjs';
import { SOURCES, DEFINES, cloneSpeex, cloneMusl, configTypes } from './build.mjs';

export const QUALITIES = [0, 2, 4, 8, 10], LOSE_EVERY = 7;

// Four seconds of 16-bit test speech at 8 kHz: voiced syllables on a gliding
// pitch, a noisy stretch, a pause and a loud vowel that clips at full scale.
export function testSignal() {
  const rate = 8000, x = new Int16Array(4 * rate);
  let phase = 0, seed = 12345;
  for (let i = 0; i < x.length; i++) {
    const t = i / rate;
    const f0 = 140 + 40 * Math.sin(2 * Math.PI * 0.8 * t) + 15 * Math.sin(2 * Math.PI * 2.9 * t);
    phase += f0 / rate;
    let v = 0;
    for (let h = 1; h * f0 < 3800; h++) v += Math.sin(2 * Math.PI * h * phase + 0.3 * h * h) / h;
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const noise = (seed / 4294967296) * 2 - 1;
    const syllable = Math.abs(Math.sin(Math.PI * 3.1 * t)) ** 0.6;
    let s = t < 1.6 ? 0.25 * v * syllable : t < 2.2 ? 0.2 * noise * syllable : t < 2.6 ? 0 : 1.6 * v * syllable;
    x[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32768)));
  }
  return x;
}

// The packets and decoded output (16-bit scale floats, little-endian) of the
// WebAssembly module, framed as native.c writes them.
export async function wasmStream(signal, quality, lose = LOSE_EVERY) {
  const codec = await createCodec(quality);
  const chunks = [], frame = new Float32Array(160);
  try {
    for (let f = 0; (f + 1) * 160 <= signal.length; f++) {
      for (let i = 0; i < 160; i++) frame[i] = signal[f * 160 + i] / 32768;
      const packet = codec.encode(frame);
      const decoded = lose && f % lose === lose - 1 ? codec.conceal() : codec.decode(packet);
      chunks.push(Uint8Array.of(packet.length), packet, new Uint8Array(Float32Array.from(decoded, v => v * 32768).buffer));
    }
  } finally {
    codec.free();
  }
  return Buffer.concat(chunks);
}

// Splits a stream into its packets and its decoded floats, and hashes each.
export function digest(stream) {
  const packets = crypto.createHash('sha256'), decoded = crypto.createHash('sha256');
  let frames = 0, bytes = 0;
  for (let at = 0; at < stream.length; frames++) {
    const n = stream[at];
    packets.update(stream.subarray(at, at + 1 + n));
    decoded.update(stream.subarray(at + 1 + n, at + 1 + n + 640));
    bytes += n;
    at += 1 + n + 640;
  }
  return { frames, bytes, packets: packets.digest('hex'), decoded: decoded.digest('hex') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts }).toString();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'speex-native-'));
  try {
    const src = cloneSpeex(process.argv[2], tmp);
    cloneMusl(process.argv[3], tmp);   // not used natively; checked so both builds name the same inputs
    const generated = configTypes(src, path.join(tmp, 'generated'));
    const binary = path.join(tmp, 'speex-native');
    run('cc', ['-O2', '-ffp-contract=off', '-w', `-I${path.join(src, 'include')}`, `-I${generated}`, `-I${here}`, ...DEFINES,
      ...SOURCES.map(s => path.join(src, 'libspeex', `${s}.c`)), path.join(here, 'api.c'), path.join(here, 'native.c'), '-lm', '-o', binary]);
    const compiler = run('cc', ['--version']).split('\n')[0];
    const signal = testSignal();
    console.log(`Native: ${compiler}, ${os.arch()}. Test signal: ${signal.length} samples, every ${LOSE_EVERY}th frame concealed.`);
    let same = true;
    for (const quality of QUALITIES) {
      const result = spawnSync(binary, [String(quality), String(LOSE_EVERY)], { input: Buffer.from(signal.buffer), maxBuffer: 1 << 26 });
      if (result.status !== 0) throw new Error(`The native build failed at quality ${quality}`);
      const native = digest(result.stdout), wasm = digest(await wasmStream(signal, quality));
      const match = native.packets === wasm.packets && native.decoded === wasm.decoded;
      same &&= match;
      console.log(`quality ${quality}: ${native.frames} frames, ${native.bytes} bytes; packets ${native.packets}, decoded ${native.decoded}` +
        (match ? ' (WebAssembly identical)' : `; WebAssembly packets ${wasm.packets}, decoded ${wasm.decoded} DIFFER`));
    }
    console.log(same ? 'The WebAssembly module matches the native build bit for bit.' : 'The builds differ.');
    process.exitCode = same ? 0 : 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
