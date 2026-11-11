// Build Speex 1.0.2 (floating point) to WebAssembly: the library the game's
// vaudio_speex module links (docs/reports/W3-09-steam-voice.md, section 5).
//
//   node tests/speex102/build.mjs [--without=name,...] [speex-1.0.2-checkout] [musl-1.2.5-checkout]
//
// Builds the Speex-1.0.2 tag of Xiph's repository with the arithmetic of the
// game's module (W3-18): ./patch.mjs rewrites 25 places of libspeex in plain C
// before compiling, and ./vsx_math.c adds the module's float cosine and arc
// cosine (tables in ./vsx_tables.h, made by ./gen-tables.mjs). Built as the
// other codec builds are: git, clang with the wasm32 target and wasm-ld; the
// small C library of tests/libopus11 (with the few additions in ./libc.c) and
// musl's libm are compiled in, so the module has no imports. Checkouts not
// given are cloned at the pinned commits; the script stops if a checkout's
// commit differs. Writes vendor/speex-1.0.2/speex-1.0.2.wasm.mjs and copies the
// licences beside it. --without leaves the named changes of patch.mjs out (for
// the tests' mutations; such a build is not the vendored one).
//
// tests/speex102/native.mjs builds the same sources natively for comparison.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { patchLibspeex, parseWithout } from './patch.mjs';

export const URL_SPEEX = 'https://gitlab.xiph.org/xiph/speex.git';
export const TAG = 'Speex-1.0.2', COMMIT = '4a6fa8d6fd1283df196ebd9a67fb1514618406ba';
export const MUSL_TAG = 'v1.2.5', MUSL_COMMIT = '0784374d561435f7c787a555aeab8ede699ed298';
// musl's double-precision functions that Speex 1.0.2 calls (exp, log, log10,
// pow, cos, acos) and their helpers; acos needs musl's own square root.
// Square root, floor and absolute value are WebAssembly instructions
// (tests/libopus11/include/math.h).
const MUSL_MATH = ['exp', 'exp_data', 'log', 'log_data', 'log10', 'pow', 'pow_data', 'cos', '__cos', '__sin',
  '__rem_pio2', '__rem_pio2_large', 'acos', 'sqrt', 'sqrt_data', '__math_oflow', '__math_uflow', '__math_xflow',
  '__math_invalid', '__math_divzero', 'scalbn', 'floor', 'fabs'];
// libspeex_la_SOURCES in libspeex/Makefile.am, all of them, in its order.
export const SOURCES = ['nb_celp', 'sb_celp', 'lpc', 'ltp', 'lsp', 'quant_lsp', 'lsp_tables_nb', 'gain_table',
  'gain_table_lbr', 'cb_search', 'filters', 'bits', 'modes', 'vq', 'high_lsp_tables', 'vbr', 'hexc_table',
  'exc_5_256_table', 'exc_5_64_table', 'exc_8_128_table', 'exc_10_32_table', 'exc_10_16_table', 'exc_20_32_table',
  'hexc_10_32_table', 'misc', 'speex_header', 'speex_callbacks', 'math_approx', 'stereo'];
// What configure.in defines (VERSION; SSE is off unless asked for). 1.0.2 has
// no fixed-point build and no config header.
export const DEFINES = ['-DVERSION="1.0.2"'];
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../..');
const libc = path.join(here, '../libopus11');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts }).toString();

export function checkout(given, tmp, name, url, tag, commit) {
  const dir = given || path.join(tmp, name);
  if (!given) run('git', ['clone', '--quiet', '-c', 'advice.detachedHead=false', '--depth', '1', '--branch', tag, url, dir]);
  const head = run('git', ['-C', dir, 'rev-parse', 'HEAD']).trim();
  if (head !== commit) throw new Error(`Expected ${name} ${tag} at ${commit}, found ${head}`);
  return dir;
}
export const cloneSpeex = (given, tmp) => checkout(given, tmp, 'speex', URL_SPEEX, TAG, COMMIT);
export const cloneMusl = (given, tmp) => checkout(given, tmp, 'musl', 'https://git.musl-libc.org/git/musl', MUSL_TAG, MUSL_COMMIT);
// The C files of the build: libspeex of the checkout with the changes of
// patch.mjs (but those in `without`), copied to <tmp>/libspeex, and the math
// file. Returns the folder and the files.
export function patchedSources(src, tmp, without = []) {
  const dir = patchLibspeex(src, path.join(tmp, 'libspeex'), without);
  return { dir, files: [...SOURCES.map(s => path.join(dir, `${s}.c`)), path.join(here, 'vsx_math.c')] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { rest, without } = parseWithout(process.argv.slice(2));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'speex102-'));
  try {
    const src = cloneSpeex(rest[0], tmp);
    const musl = cloneMusl(rest[1], tmp);
    const patched = patchedSources(src, tmp, without);
    const sources = [...patched.files, path.join(libc, 'libc.c'), path.join(here, 'libc.c'), path.join(here, 'api.c')];
    const cflags = ['--target=wasm32', '-O2', '-nostdlibinc', '-isystem', path.join(here, 'include'), '-isystem',
      path.join(libc, 'include'), `-I${patched.dir}`, ...DEFINES, '-ffp-contract=off', '-w'];
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
      '-ffp-contract=off', ...['arch/arm', 'arch/generic'].map(d => `-I${path.join(musl, d)}`), `-I${path.dirname(bits)}`,
      ...['src/include', 'src/internal', 'include'].map(d => `-I${path.join(musl, d)}`)];
    for (const f of MUSL_MATH) {
      const o = path.join(tmp, `musl_${f}.o`);
      run('clang', [...muslFlags, '-c', path.join(musl, 'src/math', `${f}.c`), '-o', o]);
      objects.push(o);
    }
    // vsx_cosf and vsx_acosf are exported for the tests (index.mjs, mathFunctions).
    const exports = ['sx_create', 'sx_destroy', 'sx_encode', 'sx_decode', 'sx_reset', 'sx_encoder_get', 'sx_decoder_get',
      'malloc', 'free', 'vsx_cosf', 'vsx_acosf'];
    const wasm = path.join(tmp, 'speex.wasm');
    run('wasm-ld', ['--no-entry', '--stack-first', '-z', 'stack-size=1048576', '--gc-sections',
      ...exports.map(e => `--export=${e}`), ...objects, '-o', wasm]);

    const bytes = fs.readFileSync(wasm);
    const imports = WebAssembly.Module.imports(new WebAssembly.Module(bytes)).map(i => `${i.module}.${i.name}`);
    if (imports.length) throw new Error(`Unexpected imports: ${imports.join(', ')}`);
    const clang = run('clang', ['--version']).split('\n')[0];
    const vendor = path.join(root, 'vendor/speex-1.0.2');
    const out = without.length ? path.join(tmp, '..', `speex-1.0.2-without-${without.join('+')}.wasm.mjs`) : path.join(vendor, 'speex-1.0.2.wasm.mjs');
    if (!without.length) {
      fs.mkdirSync(vendor, { recursive: true });
      fs.copyFileSync(path.join(src, 'COPYING'), path.join(vendor, 'COPYING.speex'));
      fs.copyFileSync(path.join(musl, 'COPYRIGHT'), path.join(vendor, 'COPYRIGHT.musl'));
    }
    fs.writeFileSync(out, `// Speex 1.0.2 (xiph/speex ${TAG} ${COMMIT}, floating point) with the arithmetic of the game module\n` +
      `// (tests/speex102/patch.mjs${without.length ? `, without ${without.join(', ')}` : ''}, vsx_math.c) and musl 1.2.5 libm\n` +
      `// (${MUSL_COMMIT}) as WebAssembly, built by tests/speex102/build.mjs with ${clang}.\n` +
      `export default '${bytes.toString('base64')}';\n`);
    console.log(`${without.length ? out : path.relative(root, out)}: ${bytes.length} bytes of wasm, ${sources.length + MUSL_MATH.length} sources, no imports`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
