// Compare the libopus 1.1.5 WebAssembly module's 16-bit decoder with a native
// build of the same sources.
//
//   node tests/libopus11/native.mjs <opus-1.1.5-checkout>
//
// Steam decodes to 16 bits with libopus's own opus_decode (W3-09, section 4).
// In this float build that runs the library's soft clipper over the decoded
// frame, with memory kept in the decoder, then rounds each sample to the
// nearest integer, ties to even, clamped. vendor/libopus-1.1 exports it since
// W3-11a. This script compiles the source list of tests/libopus11/build.mjs
// natively with gcc (its own C library and libm), the build's defines
// (-DOPUS_BUILD -DVAR_ARRAYS -DHAVE_LRINTF) and -ffp-contract=off, plus
// native.c; codes each test signal below with both, as the Steam profile does,
// and compares the packets and the 16-bit output byte for byte (a concealed
// frame after every tenth packet included), printing the SHA-256 of each.
// They are recorded in tests/opus.verify.mjs. A one-off, not in CI: it needs
// gcc and a checkout of the pinned commit (https://gitlab.xiph.org/xiph/opus.git
// at the tag v1.1.5), which the test suite does not.
//
// The module also exports the signals and the runs tests/opus.verify.mjs uses.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEncoder, createDecoder, Application, Signal } from '../../vendor/libopus-1.1/index.mjs';
import { DEFINES, COMMIT, opusSources, includeDirs } from './build.mjs';

export const RATE = 24000, FRAME = 480;
// The Steam profile's encoder (W3-09, section 3): what native.c sets.
export const ENCODER = { sampleRate: RATE, channels: 1, frameSize: FRAME, application: Application.Voip, signal: Signal.Voice,
  bitrate: 32000, complexity: 9, vbr: true, dtx: true, fec: false };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The test signals, 10 s at 24000 Hz (500 frames), seeded. Half-second
// segments in turn: a noise burst, a vowel-like tone (harmonics of a gliding
// pitch under three formant bumps), a near silence, a louder vowel. In `loud`
// the bursts and the louder vowels pass full scale (peaks of 1.3 to 1.6), so the
// decoder's output does too; `quiet` is the same at 1/50 of the level, so it
// never comes near it.
export function testSignals() {
  const make = (seed, scale) => {
    const rnd = mulberry32(seed), n = 10 * RATE, x = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE, seg = Math.floor(t / 0.5), u = (t - 0.5 * seg) / 0.5;
      const env = Math.sqrt(Math.sin(Math.PI * u));
      const f0 = 110 + 40 * Math.sin(2 * Math.PI * 0.37 * t) + 12 * (seg % 3);
      phase += f0 / RATE;
      let vowel = 0;
      for (let h = 1; h <= 30 && h * f0 < 11500; h++) {
        const f = h * f0;
        const w = (1 + 3 * Math.exp(-(((f - 650) / 180) ** 2)) + 2 * Math.exp(-(((f - 1150) / 220) ** 2))
          + Math.exp(-(((f - 2600) / 400) ** 2))) / h;
        vowel += w * Math.sin(2 * Math.PI * h * phase + 0.4 * h);
      }
      const noise = rnd() * 2 - 1, kind = seg % 4;
      const v = kind === 0 ? 1.6 * noise : kind === 1 ? 0.45 * vowel : kind === 2 ? 0.002 * noise : 0.75 * vowel;
      x[i] = scale * env * v;
    }
    return x;
  };
  return { loud: make(0x0D15EA5E, 1), quiet: make(0x0D15EA5E, 1 / 50) };
}

// The float path, as the Steam profile ran it before W3-11a: the packets, each
// packet through decodeFloat, and decodePacketLossFloat after every tenth.
// Their SHA-256, recorded from the module as built before opus_decode was
// exported, must not move (tests/opus.verify.mjs).
export async function floatRun(signal) {
  const encoder = await createEncoder(ENCODER), decoder = await createDecoder({ sampleRate: RATE, channels: 1 });
  const packets = crypto.createHash('sha256'), floats = crypto.createHash('sha256'), lost = crypto.createHash('sha256');
  try {
    for (let f = 0; (f + 1) * FRAME <= signal.length; f++) {
      const packet = encoder.encodeFloat(signal.subarray(f * FRAME, (f + 1) * FRAME));
      packets.update(packet);
      const out = decoder.decodeFloat(packet, { frameSize: FRAME });
      floats.update(new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
      if (f % 10 === 9) {
        const plc = decoder.decodePacketLossFloat(FRAME);
        lost.update(new Uint8Array(plc.buffer, plc.byteOffset, plc.byteLength));
      }
    }
  } finally {
    encoder.free(); decoder.free();
  }
  return { packets: packets.digest('hex'), floats: floats.digest('hex'), lost: lost.digest('hex') };
}

// The 16-bit path through the module, framed as native.c writes it.
export async function int16Stream(signal) {
  const encoder = await createEncoder(ENCODER), decoder = await createDecoder({ sampleRate: RATE, channels: 1 });
  const chunks = [];
  try {
    for (let f = 0; (f + 1) * FRAME <= signal.length; f++) {
      const packet = encoder.encodeFloat(signal.subarray(f * FRAME, (f + 1) * FRAME));
      chunks.push(Uint8Array.of(packet.length & 0xff, packet.length >> 8), packet);
      const out = decoder.decodeInt16(packet, { frameSize: FRAME });
      chunks.push(new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
      if (f % 10 === 9) {
        const plc = decoder.decodePacketLossInt16(FRAME);
        chunks.push(new Uint8Array(plc.buffer, plc.byteOffset, plc.byteLength));
      }
    }
  } finally {
    encoder.free(); decoder.free();
  }
  return Buffer.concat(chunks);
}

// Splits a stream into its packets and 16-bit samples, and hashes each.
export function digest(stream) {
  const packets = crypto.createHash('sha256'), samples = crypto.createHash('sha256');
  let at = 0, frames = 0, count = 0;
  while (at < stream.length) {
    const len = stream[at] | (stream[at + 1] << 8);
    packets.update(stream.subarray(at + 2, at + 2 + len));
    at += 2 + len;
    const n = frames % 10 === 9 ? 2 * FRAME : FRAME;
    samples.update(stream.subarray(at, at + 2 * n));
    at += 2 * n; count += n; frames++;
  }
  return { frames, samples: count, packets: packets.digest('hex'), int16: samples.digest('hex') };
}

// The 16-bit samples of a stream, without the packets.
export function samplesOf(stream) {
  const out = [];
  let at = 0, frames = 0;
  while (at < stream.length) {
    at += 2 + (stream[at] | (stream[at + 1] << 8));
    const n = frames % 10 === 9 ? 2 * FRAME : FRAME;
    out.push(new Int16Array(stream.buffer.slice(stream.byteOffset + at, stream.byteOffset + at + 2 * n)));
    at += 2 * n; frames++;
  }
  const all = new Int16Array(out.reduce((k, a) => k + a.length, 0));
  out.reduce((o, a) => { all.set(a, o); return o + a.length; }, 0);
  return all;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = process.argv[2];
  if (!src) throw new Error('Usage: node tests/libopus11/native.mjs <opus-1.1.5-checkout>');
  const head = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD']).toString().trim();
  if (head !== COMMIT) throw new Error(`Expected libopus at ${COMMIT}, found ${head}`);
  const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opus11-native-'));
  try {
    const binary = path.join(tmp, 'opus11-native');
    const flags = ['-O2', ...DEFINES, '-DPACKAGE_VERSION="1.1.5"', '-ffp-contract=off', '-w'];
    run('gcc', [...flags, ...includeDirs(src), ...opusSources(src), path.join(here, 'native.c'), '-lm', '-o', binary]);
    const compiler = run('gcc', ['--version']).split('\n')[0];
    console.log(`Native: ${compiler}, ${os.arch()}, ${flags.join(' ')}.`);
    let same = true;
    for (const [name, signal] of Object.entries(testSignals())) {
      const result = spawnSync(binary, [String(ENCODER.complexity)], { input: Buffer.from(signal.buffer), maxBuffer: 1 << 26 });
      if (result.status !== 0) throw new Error(`The native build failed on ${name} (status ${result.status})`);
      const native = result.stdout, wasm = await int16Stream(signal);
      const n = digest(native), match = native.equals(wasm);
      same &&= match;
      let detail = '';
      if (!match) {
        const a = samplesOf(native), b = samplesOf(wasm), w = digest(wasm);
        const differ = a.reduce((k, v, i) => k + (v !== b[i]), 0), first = a.findIndex((v, i) => v !== b[i]);
        detail = `\n  WebAssembly packets ${w.packets}, 16-bit ${w.int16} DIFFER: ${differ} samples, the first at ${first}` +
          ` (native ${a[first]}, WebAssembly ${b[first]})`;
      }
      console.log(`${name}: ${n.frames} frames, ${n.samples} samples; packets ${n.packets}, 16-bit ${n.int16}` +
        (match ? ' (WebAssembly identical)' : detail));
    }
    console.log(same ? 'The WebAssembly module\'s 16-bit decoder matches the native build sample for sample.' : 'The builds differ.');
    process.exitCode = same ? 0 : 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
