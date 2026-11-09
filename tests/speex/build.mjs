// Build Speex 1.2.1 (float) to WebAssembly for the speex profile.
//
//   node tests/speex/build.mjs [speex-1.2.1-checkout] [musl-1.2.5-checkout]
//
// Source's vaudio_speex is Speex narrowband at 8 kHz (tests/LEGACY_CODECS.md).
// This builds the Speex-1.2.1 release tag of xiph/speex, floating point, the
// library's own sources unchanged. Same toolchain as tests/celt011/build.mjs:
// git, clang with the wasm32 target and wasm-ld; the minimal libc in
// tests/libopus11 and musl's libm are compiled in, so the module has no
// imports. Checkouts not given are cloned at the pinned commits. Writes
// vendor/speex/speex-1.2.1.wasm.mjs and copies the licences beside it.
//
// tests/speex/native.mjs builds the same sources natively for comparison.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TAG = 'Speex-1.2.1', COMMIT = '5dceaaf3e23ee7fd17c80cb5f02a838fd6c18e01';
export const MUSL_TAG = 'v1.2.5', MUSL_COMMIT = '0784374d561435f7c787a555aeab8ede699ed298';
// musl's double-precision functions that Speex calls, and their helpers
// (acos needs musl's own square root, which rounds as the instruction does).
const MUSL_MATH = ['exp', 'exp_data', 'log', 'log_data', 'log10', 'pow', 'pow_data', 'cos', '__cos', '__sin', 'sin',
  '__rem_pio2', '__rem_pio2_large', 'acos', 'sqrt', 'sqrt_data', 'atan', '__math_oflow', '__math_uflow', '__math_xflow',
  '__math_invalid', '__math_divzero', 'scalbn', 'floor', 'fabs'];
// libspeex_la_SOURCES in libspeex/Makefile.am, without the optional Vorbis
// psychoacoustics and FFT (off by default; only the preprocessor uses them).
export const SOURCES = ['cb_search', 'exc_10_32_table', 'exc_8_128_table', 'filters', 'gain_table', 'hexc_table',
  'high_lsp_tables', 'lsp', 'ltp', 'speex', 'stereo', 'vbr', 'vq', 'bits', 'exc_10_16_table', 'exc_20_32_table',
  'exc_5_256_table', 'exc_5_64_table', 'gain_table_lbr', 'hexc_10_32_table', 'lpc', 'lsp_tables_nb', 'modes',
  'modes_wb', 'nb_celp', 'quant_lsp', 'sb_celp', 'speex_callbacks', 'speex_header', 'window'];
// What configure defines for a floating-point build with C99 arrays. The
// warnings and notifications print to stderr, which this build has none of.
export const DEFINES = ['-DFLOATING_POINT', '-DVAR_ARRAYS', '-DEXPORT=', '-DOS_SUPPORT_CUSTOM', '-DDISABLE_WARNINGS',
  '-DDISABLE_NOTIFICATIONS'];
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
export const cloneSpeex = (given, tmp) => checkout(given, tmp, 'speex', 'https://github.com/xiph/speex.git', TAG, COMMIT);
export const cloneMusl = (given, tmp) => checkout(given, tmp, 'musl', 'https://git.musl-libc.org/git/musl', MUSL_TAG, MUSL_COMMIT);

// speex_config_types.h, as configure writes it on a system with stdint.h.
export function configTypes(src, dir) {
  const text = fs.readFileSync(path.join(src, 'include/speex/speex_config_types.h.in'), 'utf8')
    .replace('@INCLUDE_STDINT@', '#include <stdint.h>').replace('@SIZE16@', 'int16_t').replace('@USIZE16@', 'uint16_t')
    .replace('@SIZE32@', 'int32_t').replace('@USIZE32@', 'uint32_t');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'speex_config_types.h'), text);
  return dir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'speex-'));
  try {
    const src = cloneSpeex(process.argv[2], tmp);
    const musl = cloneMusl(process.argv[3], tmp);
    const generated = configTypes(src, path.join(tmp, 'generated'));
    const sources = [...SOURCES.map(s => path.join(src, 'libspeex', `${s}.c`)), path.join(libc, 'libc.c'), path.join(here, 'api.c')];
    const cflags = ['--target=wasm32', '-O2', '-nostdlibinc', '-isystem', path.join(here, 'include'), '-isystem',
      path.join(libc, 'include'), `-I${path.join(src, 'include')}`, `-I${generated}`, `-I${here}`, ...DEFINES, '-ffp-contract=off', '-w'];
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
    const exports = ['sx_encoder_create', 'sx_decoder_create', 'sx_encoder_get', 'sx_decoder_get', 'sx_encode', 'sx_decode',
      'speex_encoder_destroy', 'speex_decoder_destroy', 'malloc', 'free'];
    const wasm = path.join(tmp, 'speex.wasm');
    run('wasm-ld', ['--no-entry', '--stack-first', '-z', 'stack-size=1048576', '--gc-sections',
      ...exports.map(e => `--export=${e}`), ...objects, '-o', wasm]);

    const bytes = fs.readFileSync(wasm);
    const imports = WebAssembly.Module.imports(new WebAssembly.Module(bytes)).map(i => `${i.module}.${i.name}`);
    if (imports.length) throw new Error(`Unexpected imports: ${imports.join(', ')}`);
    const clang = run('clang', ['--version']).split('\n')[0];
    const vendor = path.join(root, 'vendor/speex');
    const out = path.join(vendor, 'speex-1.2.1.wasm.mjs');
    fs.mkdirSync(vendor, { recursive: true });
    fs.copyFileSync(path.join(src, 'COPYING'), path.join(vendor, 'COPYING.speex'));
    fs.copyFileSync(path.join(musl, 'COPYRIGHT'), path.join(vendor, 'COPYRIGHT.musl'));
    fs.writeFileSync(out, `// Speex 1.2.1 (xiph/speex ${TAG} ${COMMIT}, floating point) with musl 1.2.5 libm\n` +
      `// (${MUSL_COMMIT}) as WebAssembly, built by tests/speex/build.mjs with ${clang}.\n` +
      `export default '${bytes.toString('base64')}';\n`);
    console.log(`${path.relative(root, out)}: ${bytes.length} bytes of wasm, ${sources.length + MUSL_MATH.length} sources, no imports`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
