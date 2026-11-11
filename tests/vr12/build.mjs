// Build the VR12 codec (vendor/voxware-vr12, unchanged) with the game's
// vaudio_miles wrapper (./api.c) to WebAssembly.
//
//   node tests/vr12/build.mjs [--mutate=name,...] [--out=file] [musl-1.2.5-checkout]
//
// Built as the other codec builds are (tests/speex102/build.mjs): clang with
// the wasm32 target and wasm-ld, -O2, no contraction into fused multiply-adds,
// no fast-math; the small C library of tests/libopus11 and musl's libm
// compiled in, so the module has no imports and calls the same math routines
// as the native twin (./native.mjs). -fno-builtin keeps the compiler from
// evaluating or rewriting a math call itself (folding cos of a constant with
// the build machine's library, or joining cos and sin into sincos), so every
// call reaches musl's function in both builds. The codec's sources are the
// vendored files as they are; musl is cloned at the pinned commit unless a
// checkout is given (the script stops if its commit differs). Writes
// vendor/voxware-vr12/voxware-vr12.wasm.mjs and copies musl's licence beside
// it.
//
// --mutate builds with the named changes of ./mutations.mjs made to api.c, for
// the mutation run (`node tests/vr12/mutations.mjs`); such a build is written
// to --out, never to the vendor folder.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutateApi } from './mutations.mjs';

export const MUSL_TAG = 'v1.2.5', MUSL_COMMIT = '0784374d561435f7c787a555aeab8ede699ed298';
// The vendored codec: coffeegrind123/voxware-vr12 at this commit, four files.
export const UPSTREAM = 'https://github.com/coffeegrind123/voxware-vr12';
export const UPSTREAM_COMMIT = 'eedf465fd0de65ae28fcc11e2457e7ee01decc22';
// musl's double-precision functions that vr12.c calls (cos, sin, acos, pow,
// log10) and their helpers; acos needs musl's own square root. Square root,
// floor, ceil, absolute value and lrintf are WebAssembly instructions
// (tests/libopus11/include/math.h).
export const MUSL_MATH = ['cos', 'sin', '__cos', '__sin', '__rem_pio2', '__rem_pio2_large', 'scalbn', 'floor', 'acos',
  'sqrt', 'sqrt_data', 'pow', 'pow_data', 'exp_data', 'log10', '__math_oflow', '__math_uflow', '__math_xflow',
  '__math_invalid', '__math_divzero', 'fabs'];
// The flags both builds give the codec and the wrapper (with the target's own).
export const CODEC_FLAGS = ['-O2', '-ffp-contract=off', '-fno-builtin', '-w'];
export const EXPORTS = ['vm_create', 'vm_destroy', 'vm_encode', 'vm_decode', 'vm_reset', 'vr12_encoder_create',
  'vr12_encoder_destroy', 'vr12_encode_frame6', 'vr12_create', 'vr12_destroy', 'vr12_decode_frame', 'malloc', 'free'];
export const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.join(here, '../..');
export const vendor = path.join(root, 'vendor/voxware-vr12');
const libc = path.join(here, '../libopus11');
export const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts }).toString();

export function cloneMusl(given, tmp) {
  const dir = given || path.join(tmp, 'musl');
  if (!given) run('git', ['clone', '--quiet', '-c', 'advice.detachedHead=false', '--depth', '1', '--branch', MUSL_TAG,
    'https://git.musl-libc.org/git/musl', dir]);
  const head = run('git', ['-C', dir, 'rev-parse', 'HEAD']).trim();
  if (head !== MUSL_COMMIT) throw new Error(`Expected musl ${MUSL_TAG} at ${MUSL_COMMIT}, found ${head}`);
  return dir;
}
// musl's math functions compiled with musl's own headers for one target: the
// object files. `arch` is musl's architecture folder whose type definitions
// match the target (arm's for wasm32: ILP32, FLT_EVAL_METHOD 0). `extra`
// names functions beyond MUSL_MATH (the native twin's ceil and lrintf, which
// the module has as instructions).
export function buildMusl(musl, tmp, cc, targetFlags, arch, extra = []) {
  const bits = path.join(tmp, `musl-bits-${arch}/bits`);
  fs.mkdirSync(bits, { recursive: true });
  fs.writeFileSync(path.join(bits, 'alltypes.h'), run('sed', ['-f', path.join(musl, 'tools/mkalltypes.sed'),
    path.join(musl, `arch/${arch}/bits/alltypes.h.in`), path.join(musl, 'include/alltypes.h.in')]));
  const flags = [...targetFlags, '-O2', '-nostdinc', '-ffreestanding', '-std=c99', '-D_XOPEN_SOURCE=700', '-w',
    '-ffp-contract=off', ...[`arch/${arch}`, 'arch/generic'].map(d => `-I${path.join(musl, d)}`), `-I${path.dirname(bits)}`,
    ...['src/include', 'src/internal', 'include'].map(d => `-I${path.join(musl, d)}`)];
  return [...MUSL_MATH, ...extra].map(f => {
    const o = path.join(tmp, `musl-${arch}-${f}.o`);
    run(cc, [...flags, '-c', path.join(musl, 'src/math', `${f}.c`), '-o', o]);
    return o;
  });
}
// api.c as it is, or with the named mutations made to a copy in tmp.
export function apiSource(tmp, mutate = []) {
  const api = path.join(here, 'api.c');
  if (!mutate.length) return api;
  const out = path.join(tmp, 'api-mutated.c');
  fs.writeFileSync(out, mutateApi(fs.readFileSync(api, 'utf8'), mutate));
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const mutate = (args.find(a => a.startsWith('--mutate=')) ?? '--mutate=').slice(9).split(',').filter(Boolean);
  const outArg = args.find(a => a.startsWith('--out='))?.slice(6);
  const rest = args.filter(a => !a.startsWith('--'));
  if (mutate.length && !outArg) throw new Error('A mutated build needs --out=file');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vr12-'));
  try {
    const musl = cloneMusl(rest[0], tmp);
    const sources = [path.join(vendor, 'vr12.c'), apiSource(tmp, mutate), path.join(libc, 'libc.c')];
    const cflags = ['--target=wasm32', ...CODEC_FLAGS, '-nostdlibinc', '-isystem', path.join(here, 'include'), '-isystem',
      path.join(libc, 'include'), `-I${vendor}`];
    const objects = sources.map((s, i) => {
      const o = path.join(tmp, `${i}.o`);
      run('clang', [...cflags, '-c', s, '-o', o]);
      return o;
    });
    objects.push(...buildMusl(musl, tmp, 'clang', ['--target=wasm32'], 'arm'));
    const wasm = path.join(tmp, 'vr12.wasm');
    run('wasm-ld', ['--no-entry', '--stack-first', '-z', 'stack-size=1048576', '--gc-sections',
      ...EXPORTS.map(e => `--export=${e}`), ...objects, '-o', wasm]);

    const bytes = fs.readFileSync(wasm);
    const imports = WebAssembly.Module.imports(new WebAssembly.Module(bytes)).map(i => `${i.module}.${i.name}`);
    if (imports.length) throw new Error(`Unexpected imports: ${imports.join(', ')}`);
    const clang = run('clang', ['--version']).split('\n')[0];
    const out = outArg ? path.resolve(outArg) : path.join(vendor, 'voxware-vr12.wasm.mjs');
    if (!outArg) fs.copyFileSync(path.join(musl, 'COPYRIGHT'), path.join(vendor, 'COPYRIGHT.musl'));
    fs.writeFileSync(out, `// Voxware VR12 (${UPSTREAM.replace('https://github.com/', '')} ${UPSTREAM_COMMIT}, vendor/voxware-vr12)\n` +
      `// with the game's vaudio_miles wrapper (tests/vr12/api.c${mutate.length ? `, mutated: ${mutate.join(', ')}` : ''}) and musl 1.2.5 libm\n` +
      `// (${MUSL_COMMIT}) as WebAssembly, built by tests/vr12/build.mjs with ${clang}.\n` +
      `export default '${bytes.toString('base64')}';\n`);
    console.log(`${outArg ? out : path.relative(root, out)}: ${bytes.length} bytes of wasm, ${sources.length + MUSL_MATH.length} sources, no imports`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
