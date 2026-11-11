// The vectors of the game's plug-in and wrapper, the runs that score a build
// against them, and the native twin of the WebAssembly module.
//
//   node tests/vr12/native.mjs [--vectors=dir] [musl-1.2.5-checkout]
//
// Builds the vendored vr12.c and ./api.c natively with the machine's C
// compiler (`cc`), with the flags of the WebAssembly build (-O2, no
// contraction, no fast-math, -fno-builtin; SSE2 for floats and doubles on
// x86, not the x87 unit) and musl's math functions compiled natively from the
// same pinned checkout, linked without the system's libm, so that both builds
// call the same routines. Then, for every signal of the folder (default
// ./vectors), runs ./native.c and the module the same way and compares them bit
// for bit, prints the SHA-256 of each run's packets and samples (recorded in
// tests/vr12.verify.mjs) and scores both against the vectors. A one-off: it
// needs a C compiler and git (or the checkout), which the test suite does not.
//
// A vector folder holds, per signal, `<signal>.s16` (the input: 8000 Hz,
// 16-bit mono), `.asi.v12` and `.asi.pcm` (the plug-in alone: new streams,
// full 16-bit input, 6-byte frames) and `.game.v12` and `.game.pcm` (the game's
// wrapper started with a block of zeros: 12-byte frames, one reset before
// frame floor(frames / 2)), each measured by running the game's own modules in
// a CPU emulator (docs/reports/W3-20a-miles-codec.md). A signal may lack its
// input and sound files (only the packets were kept).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CODEC_FLAGS, buildMusl, cloneMusl, run, vendor, here } from './build.mjs';

export const VECTORS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vectors');
const int16 = (buf) => new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const bytes = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

// The signals of a folder (those with game-level packets) and their files.
export function signalNames(dir = VECTORS) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.game.v12')).map(f => f.slice(0, -9)).sort();
}
export function loadSignal(name, dir = VECTORS) {
  const read = (ext) => {
    const file = path.join(dir, `${name}.${ext}`);
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  };
  const input = read('s16'), gamePcm = read('game.pcm'), asiPcm = read('asi.pcm');
  return {
    name, input: input && int16(input),
    game: { v12: read('game.v12'), pcm: gamePcm && int16(gamePcm) },
    asi: { v12: read('asi.v12'), pcm: asiPcm && int16(asiPcm) }
  };
}
// The reset of the game-level vectors: before frame floor(frames / 2).
export const resetBefore = (frames) => Math.floor(frames / 2);

// The game level through a module (an index.mjs): one wrapper codec; per
// 12-byte frame of the vector, the reset where the vectors have it, the next
// 360 input samples encoded (while input lasts) and the vector's frame decoded.
// The decoder is fed the vector's packets, as the measurement fed the real
// one, and resets with the same codec, whose encoder gives the bytes it
// decodes then.
export async function gameRun(module, signal) {
  const { v12 } = signal.game, frames = v12.length / 12, reset = resetBefore(frames);
  const input = signal.input ?? new Int16Array(0), inFrames = Math.min(frames, Math.floor(input.length / 360));
  const codec = await module.createCodec();
  const packets = new Uint8Array(inFrames * 12), pcm = new Int16Array(frames * 360);
  try {
    for (let f = 0; f < frames; f++) {
      if (f === reset) codec.reset();
      if (f < inFrames) packets.set(codec.encode(input.subarray(f * 360, (f + 1) * 360)), f * 12);
      pcm.set(codec.decode(v12.subarray(f * 12, (f + 1) * 12)), f * 360);
    }
  } finally {
    codec.free();
  }
  return { packets, pcm, reset };
}
// The plug-in level: a new encoder codes the input 180 samples at a time; a
// new decoder decodes the vector's 6-byte frames.
export async function pluginRun(module, signal) {
  const { v12 } = signal.asi, frames = v12.length / 6;
  const input = signal.input ?? new Int16Array(0), inFrames = Math.floor(input.length / 180);
  const encoder = await module.createPluginEncoder(), decoder = await module.createPluginDecoder();
  const packets = new Uint8Array(inFrames * 6), pcm = new Int16Array(frames * 180);
  try {
    for (let f = 0; f < inFrames; f++) packets.set(encoder.encode(input.subarray(f * 180, (f + 1) * 180)), f * 6);
    for (let f = 0; f < frames; f++) pcm.set(decoder.decode(v12.subarray(f * 6, (f + 1) * 6)), f * 180);
  } finally {
    encoder.free();
    decoder.free();
  }
  return { packets, pcm };
}

// Packets against the vector's, frame by frame (`size` bytes a frame), with
// the frames before `split` and from it counted apart: the unequal frames.
export function scorePackets(mine, theirs, size, split = Infinity) {
  const frames = theirs.length / size, unequal = [];
  for (let f = 0; f < frames; f++) {
    const a = mine.subarray(f * size, (f + 1) * size), b = theirs.subarray(f * size, (f + 1) * size);
    if (a.length !== size || !a.every((v, i) => v === b[i])) unequal.push(f);
  }
  const before = Math.min(frames, split);
  return { frames, unequal, before: [before - unequal.filter(f => f < split).length, before],
    after: [frames - before - unequal.filter(f => f >= split).length, frames - before] };
}
// Samples against the vector's: how many equal, the largest difference and
// the first sample that differs; `split` counts the differing samples before
// and from that sample apart.
export function scoreSamples(mine, theirs, split = Infinity) {
  let equal = 0, maxdiff = 0, first = -1, differBefore = 0;
  const n = Math.min(mine.length, theirs.length);
  for (let i = 0; i < n; i++) {
    const d = Math.abs(mine[i] - theirs[i]);
    if (d === 0) { equal++; continue; }
    if (first < 0) first = i;
    if (i < split) differBefore++;
    if (d > maxdiff) maxdiff = d;
  }
  return { samples: theirs.length, compared: n, equal, differ: n - equal, differBefore, differAfter: n - equal - differBefore,
    maxdiff, first };
}
export const sha256 = (a) => crypto.createHash('sha256').update(bytes(a)).digest('hex');

// Every score of one module on one signal.
export async function scoreSignal(module, signal) {
  const out = { name: signal.name };
  const game = await gameRun(module, signal);
  out.gameHashes = { packets: sha256(game.packets), pcm: sha256(game.pcm) };
  if (game.packets.length) out.gamePackets = scorePackets(game.packets, signal.game.v12, 12, game.reset);
  if (signal.game.pcm && signal.input) out.gamePcm = scoreSamples(game.pcm, signal.game.pcm, game.reset * 360);
  const plugin = await pluginRun(module, signal);
  out.pluginHashes = { packets: sha256(plugin.packets), pcm: sha256(plugin.pcm) };
  if (plugin.packets.length) out.pluginPackets = scorePackets(plugin.packets, signal.asi.v12, 6);
  if (signal.asi.pcm) out.pluginPcm = scoreSamples(plugin.pcm, signal.asi.pcm);
  return { score: out, game, plugin };
}
export function describe(s) {
  const lines = [];
  const pk = (p) => `${p.frames - p.unequal.length} of ${p.frames}${p.unequal.length ? ` (unequal ${p.unequal.join(', ')})` : ''}`;
  const pc = (p) => `${p.equal} of ${p.samples} equal, largest difference ${p.maxdiff}${p.first >= 0 ? `, first at ${p.first}` : ''}`;
  if (s.gamePackets) lines.push(`game packets ${pk(s.gamePackets)}; before the reset ${s.gamePackets.before.join(' of ')}, after ${s.gamePackets.after.join(' of ')}`);
  if (s.gamePcm) lines.push(`game samples ${pc(s.gamePcm)} (differing ${s.gamePcm.differBefore} before the reset, ${s.gamePcm.differAfter} after)`);
  if (s.pluginPackets) lines.push(`plug-in packets ${pk(s.pluginPackets)}`);
  if (s.pluginPcm) lines.push(`plug-in samples ${pc(s.pluginPcm)}`);
  return lines;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const dir = path.resolve((args.find(a => a.startsWith('--vectors=')) ?? `--vectors=${VECTORS}`).slice(10));
  const rest = args.filter(a => !a.startsWith('--'));
  const module = await import('../../vendor/voxware-vr12/index.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vr12-native-'));
  const x86 = ['x64', 'ia32'].includes(os.arch()) ? ['-msse2', '-mfpmath=sse'] : [];
  try {
    const musl = cloneMusl(rest[0], tmp);
    // musl's math natively, from the same checkout: the functions of the
    // WebAssembly build, and those the module has as instructions.
    const arch = { x64: 'x86_64', arm64: 'aarch64' }[os.arch()];
    if (!arch) throw new Error(`No musl architecture for ${os.arch()}`);
    const muslObjects = buildMusl(musl, tmp, 'cc', [], arch, ['ceil', 'lrintf', 'rintf']);
    const binary = path.join(tmp, 'vr12-native');
    run('cc', [...CODEC_FLAGS, '-fno-fast-math', ...x86, `-I${vendor}`, path.join(vendor, 'vr12.c'), path.join(here, 'api.c'),
      path.join(here, 'native.c'), ...muslObjects, '-o', binary]);
    const linked = run('nm', ['-u', binary]).split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean);
    const compiler = run('cc', ['--version']).split('\n')[0];
    console.log(`Native: ${compiler}, ${os.arch()}, ${[...CODEC_FLAGS, '-fno-fast-math', ...x86].join(' ')}; musl ${arch} math; ` +
      `undefined symbols: ${linked.join(' ')}`);
    const native = (signal, mode) => {
      const v12 = path.join(dir, `${signal.name}.${mode === 'game' ? 'game' : 'asi'}.v12`);
      const argv = mode === 'game' ? ['game', String(resetBefore(signal.game.v12.length / 12)), v12] : ['plugin', v12];
      const result = spawnSync(binary, argv, { input: signal.input ? bytes(signal.input) : Buffer.alloc(0), maxBuffer: 1 << 28 });
      if (result.status !== 0) throw new Error(`The native build failed (status ${result.status})`);
      return result.stdout;
    };
    const firstDifference = (a, b, packetBytes, what) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] === b[i]) continue;
        if (i < packetBytes) return `${what} packet byte ${i} (frame ${Math.floor(i / (what === 'game' ? 12 : 6))}): native ${a[i]}, WebAssembly ${b[i]}`;
        const s = (i - packetBytes) >> 1;
        return `${what} sample ${s}: native ${a.readInt16LE(packetBytes + 2 * s)}, WebAssembly ${b.readInt16LE(packetBytes + 2 * s)}`;
      }
      return a.length === b.length ? 'none' : `lengths ${a.length} and ${b.length}`;
    };
    let same = true;
    const totals = {};
    for (const name of signalNames(dir)) {
      const signal = loadSignal(name, dir);
      const { score, game, plugin } = await scoreSignal(module, signal);
      const wasm = { game: Buffer.concat([bytes(game.packets), bytes(game.pcm)]), plugin: Buffer.concat([bytes(plugin.packets), bytes(plugin.pcm)]) };
      const nat = { game: native(signal, 'game'), plugin: native(signal, 'plugin') };
      console.log(`\n${name}${signal.input ? '' : ' (packets only: no input or sound files)'}`);
      for (const mode of ['game', 'plugin']) {
        const match = nat[mode].equals(wasm[mode]);
        same &&= match;
        const h = score[`${mode}Hashes`];
        console.log(`  ${mode}: native ${match ? 'equals the WebAssembly build bit for bit' : `DIFFERS from the WebAssembly build: first at ${firstDifference(nat[mode], wasm[mode], (mode === 'game' ? game : plugin).packets.length, mode)}`}` +
          `; packets ${h.packets}, samples ${h.pcm}`);
      }
      for (const line of describe(score)) console.log(`  ${line}`);
      for (const [key, value] of Object.entries(score)) {
        if (!/Pcm$|Packets$/.test(key)) continue;
        const t = totals[key] ??= { a: 0, b: 0, maxdiff: 0 };
        if (value.unequal) { t.a += value.frames - value.unequal.length; t.b += value.frames; }
        else { t.a += value.equal; t.b += value.samples; t.maxdiff = Math.max(t.maxdiff, value.maxdiff); }
      }
    }
    console.log('\nAll signals:');
    for (const [key, t] of Object.entries(totals)) console.log(`  ${key}: ${t.a} of ${t.b}${/Pcm$/.test(key) ? ` equal, largest difference ${t.maxdiff}` : ''}`);
    console.log(same ? 'The WebAssembly module matches the native build bit for bit on every signal.' : 'The builds differ.');
    process.exitCode = same ? 0 : 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
