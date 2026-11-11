// Compare the Speex 1.0.2 WebAssembly module with a native build of the same
// sources, and the native build with the game module's measured output.
//
//   node tests/speex102/native.mjs [--without=name,...] [speex-1.0.2-checkout] [musl-1.2.5-checkout]
//   node tests/speex102/native.mjs --mutations [speex-1.0.2-checkout] [musl-1.2.5-checkout]
//
// Compiles the pinned Speex 1.0.2 sources that tests/speex102/build.mjs builds,
// with the same changes (patch.mjs), the same math file (vsx_math.c), defines
// and api.c, natively with the machine's C compiler (`cc`, its own C library
// and libm) plus native.c. The flags keep the native arithmetic to the
// WebAssembly module's: no contraction into fused multiply-adds, no fast-math,
// and on x86 SSE2 for floats and doubles (not the x87 unit). Then:
// - codes each test signal below with both, a fresh codec per signal, and
//   compares the packets, the decoded floats and the 16-bit output bit for bit,
//   printing the SHA-256 of each (recorded in tests/speex102.verify.mjs);
// - codes the seven clips of ./vectors and compares the packets and 16-bit
//   output with the game module's;
// - runs vsx_cosf and vsx_acosf on every argument of ./vectors.
// --without leaves changes of patch.mjs out of the native build. --mutations
// builds it once without each change that can alter output, in turn, and
// prints which clips each one fails (the report's mutation table). A one-off:
// it needs git, a C compiler and network access, which the test suite does not.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCodec } from '../../vendor/speex-1.0.2/index.mjs';
import { DEFINES, cloneSpeex, cloneMusl, patchedSources } from './build.mjs';
import { OUTPUT_CHANGES, parseWithout } from './patch.mjs';

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

// The seven clips the game's module was run on (tests/speex102/vectors): 16-bit
// input at 160 samples a frame (.s16), the module's 20-byte packets (.pk) and
// its 16-bit output (.pcm), a new codec each. Each pins at least one change of
// patch.mjs; its name says which (the order's table).
const VECTORS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vectors');
export const CLIPS = ['clip-acosf', 'clip-autocorr', 'clip-cb-energy', 'clip-cb-err', 'clip-cosf', 'clip-interp-whole',
  'clip-olp-energy0'];
export function loadClips() {
  const read = (name, ext) => fs.readFileSync(path.join(VECTORS, `${name}.${ext}`));
  return CLIPS.map(name => {
    const raw = read(name, 's16');
    const input = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
    return { name, input, packets: read(name, 'pk'), pcm: read(name, 'pcm') };
  });
}
// A stream (packet, floats, 16-bit output per frame, as native.c and wasmStream
// write it) against a clip: the frames whose packet and 16-bit output both
// equal the module's, and the first frame that does not.
export function scoreClip(stream, clip) {
  const frames = clip.input.length / 160;
  let equal = 0, first = -1;
  for (let f = 0; f < frames; f++) {
    const at = f * FRAME_BYTES;
    const ok = stream.length >= at + FRAME_BYTES
      && stream.subarray(at, at + 20).equals(clip.packets.subarray(f * 20, f * 20 + 20))
      && stream.subarray(at + 660, at + FRAME_BYTES).equals(clip.pcm.subarray(f * 320, f * 320 + 320));
    if (ok) equal++; else if (first < 0) first = f;
  }
  return { frames, equal, first };
}
// The arguments and the module's results for cosf or acosf (little-endian floats).
export function loadVectors(name) {
  const floats = (ext) => {
    const raw = fs.readFileSync(path.join(VECTORS, `${name}.${ext}.f32`));
    return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
  };
  return { args: floats('args'), out: floats('out') };
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
  const { rest, without } = parseWithout(process.argv.slice(2));
  const mutations = rest.includes('--mutations'), checkouts = rest.filter(a => a !== '--mutations');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'speex102-native-'));
  const x86 = ['x64', 'ia32'].includes(os.arch()) ? ['-msse2', '-mfpmath=sse'] : [];
  try {
    const src = cloneSpeex(checkouts[0], tmp);
    cloneMusl(checkouts[1], tmp);   // not used natively; checked so both builds name the same inputs
    const build = (leaveOut, name) => {
      const patched = patchedSources(src, path.join(tmp, name), leaveOut);
      const binary = path.join(tmp, name, 'speex102-native');
      run('cc', ['-O2', '-ffp-contract=off', '-fno-fast-math', ...x86, '-w', `-I${patched.dir}`, ...DEFINES,
        ...patched.files, path.join(here, 'api.c'), path.join(here, 'native.c'), '-lm', '-o', binary]);
      return binary;
    };
    const code = (binary, signal, resetAt = -1) => {
      const result = spawnSync(binary, resetAt >= 0 ? [String(resetAt)] : [], { input: Buffer.from(signal.buffer, signal.byteOffset, signal.byteLength), maxBuffer: 1 << 26 });
      if (result.status !== 0) throw new Error(`The native build failed (status ${result.status})`);
      return result;
    };
    const clips = loadClips(), clipFrames = clips.reduce((n, c) => n + c.input.length / 160, 0);
    const scoreClips = (binary) => clips.map(clip => ({ name: clip.name, ...scoreClip(code(binary, clip.input).stdout, clip) }));
    const compiler = run('cc', ['--version']).split('\n')[0];
    console.log(`Native: ${compiler}, ${os.arch()}, -O2 -ffp-contract=off -fno-fast-math ${x86.join(' ')}.`);

    if (mutations) {
      // Each change that can alter output, left out in turn: the clips it fails.
      const full = scoreClips(build([], 'full'));
      console.log(`All changes: ${full.filter(c => c.equal === c.frames).length} of ${clips.length} clips equal the module.`);
      let caught = 0;
      for (const name of OUTPUT_CHANGES) {
        const failing = scoreClips(build([name], `without-${name}`)).filter(c => c.equal !== c.frames);
        if (failing.length) caught++;
        console.log(`without ${name}: ${failing.length ? failing.map(c => `${c.name} (${c.frames - c.equal} of ${c.frames} frames differ, from frame ${c.first})`).join(', ') : 'NO CLIP FAILS'}`);
      }
      console.log(`${caught} of ${OUTPUT_CHANGES.length} changes left out fail at least one clip.`);
      process.exitCode = caught === OUTPUT_CHANGES.length && full.every(c => c.equal === c.frames) ? 0 : 1;
    } else {
      const binary = build(without, 'build');
      if (without.length) console.log(`Without ${without.join(', ')}.`);
      const runs = testRuns();
      const frames = runs.reduce((n, r) => n + r.signal.length / 160, 0);
      console.log(`${frames} frames of test signal (${runs.map(r => r.name).join(', ')}).`);
      let same = true;
      for (const { name, signal, resetAt } of runs) {
        const result = code(binary, signal, resetAt);
        const stderr = result.stderr.toString().trim();
        const native = result.stdout, wasm = await wasmStream(signal, resetAt);
        const n = digest(native), w = digest(wasm), match = native.equals(wasm);
        same &&= match;
        console.log(`${name}: ${n.frames} frames; packets ${n.packets}, floats ${n.floats}, 16-bit ${n.samples}` +
          (match ? ' (WebAssembly identical)' : `\n  WebAssembly packets ${w.packets}, floats ${w.floats}, 16-bit ${w.samples} DIFFER;` +
            ` first difference: ${firstDifference(native, wasm)}`) + (stderr ? `\n  native stderr: ${stderr}` : ''));
      }
      console.log(same ? 'The WebAssembly module matches the native build bit for bit.' : 'The builds differ.');
      const scored = scoreClips(binary);
      for (const c of scored) console.log(`${c.name}: ${c.equal} of ${c.frames} frames equal the module's${c.first >= 0 ? ` (first differs at ${c.first})` : ''}`);
      const clipsEqual = scored.every(c => c.equal === c.frames);
      console.log(`Clips: ${scored.reduce((n, c) => n + c.equal, 0)} of ${clipFrames} frames equal the game module's packets and 16-bit output.`);
      let vectorsEqual = true;
      for (const name of ['cosf', 'acosf']) {
        const { args, out } = loadVectors(name);
        const result = spawnSync(binary, [name], { input: Buffer.from(args.buffer), maxBuffer: 1 << 26 });
        const mine = new Uint32Array(result.stdout.buffer.slice(result.stdout.byteOffset, result.stdout.byteOffset + result.stdout.length));
        const want = new Uint32Array(out.buffer);
        let bad = 0, firstBad = -1;
        for (let i = 0; i < want.length; i++) if (mine[i] !== want[i]) { bad++; if (firstBad < 0) firstBad = i; }
        vectorsEqual &&= bad === 0 && mine.length === want.length;
        console.log(`vsx_${name}: ${want.length - bad} of ${want.length} results equal the module's` +
          (firstBad >= 0 ? ` (first differs at argument ${args[firstBad]})` : ''));
      }
      process.exitCode = same && (without.length || (clipsEqual && vectorsEqual)) ? 0 : 1;
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
