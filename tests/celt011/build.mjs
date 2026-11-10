// Build CELT 0.11 (float) to WebAssembly for the vaudio_celt profiles, with
// the pitch pre-filter and post-filter in, as the game's module has them
// (docs/reports/W3-08-celt-encoder.md).
//
//   node tests/celt011/build.mjs [celt-0.11.0-checkout] [musl-1.2.5-checkout]
//   node tests/celt011/build.mjs --native [celt-0.11.0-checkout] [musl-1.2.5-checkout]
//
// Source's vaudio_celt is CELT 0.11 in a custom mode (tests/LEGACY_CODECS.md).
// This builds the tree Mumble ships as celt-0.11.0, the source the game's
// module was built from, with custom modes and with OPUS_BUILD defined, which
// turns on the pitch filter (ENABLE_POSTFILTER) and two control requests the
// module also has. Same toolchain as tests/libopus11/build.mjs: git, clang with
// the wasm32 target and wasm-ld; its minimal libc and musl's libm are compiled
// in, so the module has no imports. Checkouts not given are cloned at the
// pinned commits. Writes vendor/celt-0.11/celt-0.11.wasm.mjs.
//
// --native builds nothing for the site. It compiles the same sources with the
// same defines natively, with the machine's C compiler and its own libm
// (api.c's CC_NATIVE harness makes vendor/celt-0.11/index.mjs's calls), codes
// the test signals below with both builds and compares the packets and the
// 16-bit output bit for bit, printing the SHA-256 of each. They are recorded
// in tests/opus.verify.mjs. A one-off, as tests/speex102/native.mjs is for
// Speex 1.0.2: it needs git and a C compiler, which the test suite does not.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const COMMIT = 'e18de7747fb1655e66bf8d291560587036bfe53c';
const MUSL_TAG = 'v1.2.5', MUSL_COMMIT = '0784374d561435f7c787a555aeab8ede699ed298';
// musl's double-precision functions that CELT calls, and their helpers.
const MUSL_MATH = ['exp', 'exp_data', 'exp2', 'log', 'log_data', 'log10', 'pow', 'pow_data', 'cos', '__cos', '__sin',
  'sin', '__rem_pio2', '__rem_pio2_large', 'atan2', 'atan', '__math_oflow', '__math_uflow', '__math_xflow',
  '__math_invalid', '__math_divzero', 'scalbn', 'floor', 'fabs'];
const SOURCES = ['bands', 'celt', 'cwrs', 'entcode', 'entdec', 'entenc', 'header', 'kiss_fft', 'laplace', 'mathops',
  'mdct', 'modes', 'pitch', 'plc', 'quant_bands', 'rate', 'vq'];
// The defines of both builds. OPUS_BUILD is the game's build switch.
export const DEFINES = ['-DCUSTOM_MODES', '-DOPUS_BUILD', '-DVAR_ARRAYS', '-DHAVE_LRINTF'];
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../..');
const libc = path.join(here, '../libopus11');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts }).toString();

function checkout(given, tmp, name, url, commit, tag) {
  const dir = given || path.join(tmp, name);
  if (!given) {
    run('git', ['clone', '--quiet', ...(tag ? ['--depth', '1', '--branch', tag] : []), url, dir]);
    if (!tag) run('git', ['-C', dir, 'checkout', '--quiet', commit]);
  }
  const head = run('git', ['-C', dir, 'rev-parse', 'HEAD']).trim();
  if (head !== commit) throw new Error(`Expected ${name} at ${commit}, found ${head}`);
  return dir;
}

// The two modes the engine selects (W3-03, W3-08): vaudio_celt and
// vaudio_celt_high. Both are fed 22050 Hz sound.
export const MODES = { celt: { rate: 22050, frame: 512, bytes: 64 }, high: { rate: 44100, frame: 1024, bytes: 128 } };
export const SOUND_RATE = 22050, COMPLEXITY = 5;

function lcg(seed) {
  return () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
}
// The test signals, 16-bit samples at 22050 Hz, each a whole number of
// 1024-sample frames (so of 512-sample frames too).
export function testSignals() {
  const R = SOUND_RATE, clamp = (s) => Math.max(-32768, Math.min(32767, Math.round(s * 32768)));
  // Speech-like, 65 frames of 1024 (3.0 s): voiced syllables on a gliding
  // pitch with harmonics to 9 kHz, a noisy stretch, a pause and a loud vowel
  // that clips at full scale. Pitched, so the encoder's pitch filter is on.
  const voiced = new Int16Array(65 * 1024), noise1 = lcg(12345);
  let phase = 0;
  for (let i = 0; i < voiced.length; i++) {
    const t = i / R;
    const f0 = 150 + 40 * Math.sin(2 * Math.PI * 0.8 * t) + 15 * Math.sin(2 * Math.PI * 2.9 * t);
    phase += f0 / R;
    let v = 0;
    for (let h = 1; h * f0 < 9000; h++) v += Math.sin(2 * Math.PI * h * phase + 0.3 * h * h) / h;
    const noise = noise1() * 2 - 1, syllable = Math.abs(Math.sin(Math.PI * 3.1 * t)) ** 0.6;
    voiced[i] = clamp(t < 1.3 ? 0.25 * v * syllable : t < 1.8 ? 0.2 * noise * syllable : t < 2.1 ? 0 : 1.6 * v * syllable);
  }
  // A steady 200 Hz tone with eight overtones after 4 frames of silence, 24
  // frames of 1024: a silent start, where the reset after creation shows.
  const tone = new Int16Array(24 * 1024);
  for (let i = 4 * 1024; i < tone.length; i++) {
    let v = 0;
    for (let h = 1; h <= 9; h++) v += Math.sin(2 * Math.PI * 200 * h * i / R + h) / h;
    tone[i] = clamp(0.15 * v);
  }
  // White noise at -6 dBFS (RMS half of full scale; uniform), 22 frames of 1024.
  const noise2 = lcg(777), peak = 16384 * Math.sqrt(3);
  const noise = Int16Array.from({ length: 22 * 1024 }, () => Math.round((noise2() * 2 - 1) * peak));
  return { voiced, tone, noise };
}
// The runs compared: each signal through a new codec in each mode, and the
// speech-like signal again with restart() before its middle frame and every
// fifth frame concealed in place of decoded.
export function testRuns() {
  const signals = testSignals(), runs = [];
  for (const [mode, spec] of Object.entries(MODES)) {
    for (const [name, signal] of Object.entries(signals)) runs.push({ name: `${mode} ${name}`, mode: spec, signal, restartAt: -1, lossEvery: 0 });
    const half = Math.floor(signals.voiced.length / spec.frame / 2);
    runs.push({ name: `${mode} voiced, restart and loss`, mode: spec, signal: signals.voiced, restartAt: half, lossEvery: 5 });
  }
  return runs;
}
// A run through vendor/celt-0.11/index.mjs (or the index.mjs in `dir`),
// framed as the native harness writes it: per frame the packet and the 16-bit
// output. The codec takes floats and gives floats at full scale 1; a 16-bit
// sample goes in as itself / 32768 and must come back as a whole number of
// 1/32768 steps.
export async function wasmStream({ mode, signal, restartAt, lossEvery }, dir = path.join(root, 'vendor/celt-0.11')) {
  const { createCodec } = await import(pathToFileURL(path.join(dir, 'index.mjs')).href);
  const codec = await createCodec(mode.rate, mode.frame, { packetBytes: mode.bytes, complexity: COMPLEXITY });
  const chunks = [];
  try {
    for (let f = 0; (f + 1) * mode.frame <= signal.length; f++) {
      if (f === restartAt) codec.restart();
      const packet = codec.encode(Float32Array.from(signal.subarray(f * mode.frame, (f + 1) * mode.frame), v => v / 32768));
      const lost = lossEvery > 0 && f % lossEvery === lossEvery - 1;
      const out = lost ? codec.conceal() : codec.decode(packet);
      const samples = Int16Array.from(out, v => {
        const s = v * 32768;
        if (!Number.isInteger(s)) throw new Error(`Frame ${f}: the decoder gave ${v}, not a 16-bit sample`);
        return s;
      });
      chunks.push(packet, new Uint8Array(samples.buffer));
    }
  } finally {
    codec.free();
  }
  return Buffer.concat(chunks);
}
// The SHA-256 of a stream's packets and of its 16-bit output.
export function digest(stream, { mode }) {
  const per = mode.bytes + 2 * mode.frame, packets = crypto.createHash('sha256'), samples = crypto.createHash('sha256');
  for (let at = 0; at < stream.length; at += per) {
    packets.update(stream.subarray(at, at + mode.bytes));
    samples.update(stream.subarray(at + mode.bytes, at + per));
  }
  return { frames: stream.length / per, packets: packets.digest('hex'), samples: samples.digest('hex') };
}
function firstDifference(a, b, { mode }) {
  const per = mode.bytes + 2 * mode.frame;
  for (let at = 0; at < Math.min(a.length, b.length); at++) {
    if (a[at] === b[at]) continue;
    const frame = Math.floor(at / per), within = at % per;
    if (within < mode.bytes) return `frame ${frame}, packet byte ${within}: native ${a[at]}, WebAssembly ${b[at]}`;
    const i = Math.floor((within - mode.bytes) / 2), base = frame * per + mode.bytes;
    return `frame ${frame}, sample ${i}: native ${a.readInt16LE(base + 2 * i)}, WebAssembly ${b.readInt16LE(base + 2 * i)}`;
  }
  return a.length === b.length ? 'none' : `lengths ${a.length} and ${b.length}`;
}

function build(src, musl, tmp) {
  const sources = [...SOURCES.map(s => path.join(src, 'libcelt', `${s}.c`)), path.join(libc, 'libc.c'), path.join(here, 'api.c')];
  const cflags = ['--target=wasm32', '-O2', '-nostdlibinc', '-isystem', path.join(libc, 'include'), `-I${path.join(src, 'libcelt')}`,
    ...DEFINES, '-ffp-contract=off', '-w'];
  const objects = sources.map((s, i) => {
    const o = path.join(tmp, `${i}.o`);
    run('clang', [...cflags, '-c', s, '-o', o]);
    return o;
  });
  // musl's own headers, with arm's 32-bit type definitions (ILP32, FLT_EVAL_METHOD 0).
  const bits = path.join(tmp, 'musl-bits/bits');
  fs.mkdirSync(bits, { recursive: true });
  fs.writeFileSync(path.join(bits, 'alltypes.h'), run('sed', ['-f', path.join(musl, 'tools/mkalltypes.sed'),
    path.join(musl, 'arch/arm/bits/alltypes.h.in'), path.join(musl, 'include/alltypes.h.in')]));
  const muslFlags = ['--target=wasm32', '-O2', '-nostdinc', '-ffreestanding', '-std=c99', '-D_XOPEN_SOURCE=700', '-w',
    ...['arch/arm', 'arch/generic'].map(d => `-I${path.join(musl, d)}`), `-I${path.dirname(bits)}`,
    ...['src/include', 'src/internal', 'include'].map(d => `-I${path.join(musl, d)}`)];
  for (const f of MUSL_MATH) {
    const o = path.join(tmp, `musl_${f}.o`);
    run('clang', [...muslFlags, '-c', path.join(musl, 'src/math', `${f}.c`), '-o', o]);
    objects.push(o);
  }
  // The 16-bit entry points, as the game's module calls them: celt_encode
  // takes 16-bit samples, celt_decode rounds its output to them (to nearest,
  // ties to even, clamped).
  const exports = ['cc_mode_create', 'cc_mode_overlap', 'celt_mode_destroy', 'cc_encoder_create', 'cc_encoder_set',
    'celt_encoder_destroy', 'celt_encode', 'cc_decoder_create', 'cc_decoder_set', 'celt_decoder_destroy', 'celt_decode',
    'malloc', 'free'];
  const wasm = path.join(tmp, 'celt.wasm');
  run('wasm-ld', ['--no-entry', '--stack-first', '-z', 'stack-size=1048576', '--gc-sections',
    ...exports.map(e => `--export=${e}`), ...objects, '-o', wasm]);

  const bytes = fs.readFileSync(wasm);
  const imports = WebAssembly.Module.imports(new WebAssembly.Module(bytes)).map(i => `${i.module}.${i.name}`);
  if (imports.length) throw new Error(`Unexpected imports: ${imports.join(', ')}`);
  const clang = run('clang', ['--version']).split('\n')[0];
  const out = path.join(root, 'vendor/celt-0.11/celt-0.11.wasm.mjs');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(path.join(src, 'COPYING'), path.join(root, 'vendor/celt-0.11/COPYING.celt'));
  fs.writeFileSync(out, `// CELT 0.11 (mumble-voip/celt-0.11.0 ${COMMIT}, custom modes, OPUS_BUILD: the pitch\n` +
    `// pre-filter and post-filter in) with musl 1.2.5 libm (${MUSL_COMMIT}) as\n` +
    `// WebAssembly, built by tests/celt011/build.mjs with ${clang}.\n` +
    `export default '${bytes.toString('base64')}';\n`);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  console.log(`${path.relative(root, out)}: ${bytes.length} bytes of wasm (SHA-256 ${sha}), ${sources.length + MUSL_MATH.length} sources, no imports`);
}

async function native(src, tmp) {
  const binary = path.join(tmp, 'celt011-native');
  // Native arithmetic kept to the WebAssembly module's: no contraction into
  // fused multiply-adds, no fast-math, and on x86 SSE2 (not the x87 unit).
  const x86 = ['x64', 'ia32'].includes(os.arch()) ? ['-msse2', '-mfpmath=sse'] : [];
  run('cc', ['-O2', '-ffp-contract=off', '-fno-fast-math', ...x86, '-w', `-I${path.join(src, 'libcelt')}`, ...DEFINES, '-DCC_NATIVE',
    ...SOURCES.map(s => path.join(src, 'libcelt', `${s}.c`)), path.join(here, 'api.c'), '-lm', '-o', binary]);
  const compiler = run('cc', ['--version']).split('\n')[0];
  const runs = testRuns();
  console.log(`Native: ${compiler}, ${os.arch()}, -O2 -ffp-contract=off -fno-fast-math ${x86.join(' ')} ${DEFINES.join(' ')}; ` +
    `complexity ${COMPLEXITY}.`);
  let same = true;
  for (const r of runs) {
    const args = [r.mode.rate, r.mode.frame, r.mode.bytes, COMPLEXITY, r.restartAt, r.lossEvery].map(String);
    const result = spawnSync(binary, args, { input: Buffer.from(r.signal.buffer), maxBuffer: 1 << 26 });
    if (result.status !== 0) throw new Error(`The native build failed on ${r.name} (status ${result.status})`);
    const ours = result.stdout, wasm = await wasmStream(r);
    const n = digest(ours, r), match = ours.equals(wasm);
    same &&= match;
    console.log(`  ${JSON.stringify(r.name)}: [${n.frames}, '${n.packets}', '${n.samples}'],` +
      (match ? '   // WebAssembly identical' : `   // WebAssembly DIFFERS: ${firstDifference(ours, wasm, r)}`));
  }
  console.log(same ? 'The WebAssembly module matches the native build bit for bit.' : 'The builds differ.');
  process.exitCode = same ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2).filter(a => a !== '--native');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celt011-'));
  try {
    const src = checkout(args[0], tmp, 'celt', 'https://github.com/mumble-voip/celt-0.11.0.git', COMMIT);
    const musl = checkout(args[1], tmp, 'musl', 'https://git.musl-libc.org/git/musl', MUSL_COMMIT, MUSL_TAG);
    if (process.argv.includes('--native')) await native(src, tmp);
    else build(src, musl, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
