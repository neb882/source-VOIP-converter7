// Copy the pinned runtime verbatim; --check verifies the checked-in assets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'node_modules/libopus-wasm');
const target = path.join(root, 'vendor/libopus');
const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
if (pkg.version !== '0.4.0') throw new Error('Expected libopus-wasm 0.4.0');
const files = {
  'dist/index.js': 'index.mjs',
  'dist/generated/libopus.generated.mjs': 'generated/libopus.generated.mjs',
  'LICENSE': 'LICENSE',
  'THIRD_PARTY_NOTICES.md': 'THIRD_PARTY_NOTICES.md'
};
for (const [from, to] of Object.entries(files)) {
  const dest = path.join(target, to);
  if (process.argv.includes('--check')) {
    if (!fs.readFileSync(path.join(source, from)).equals(fs.readFileSync(dest))) {
      throw new Error(`Vendored Opus differs from the pinned package: ${to}`);
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(source, from), dest);
  }
}
console.log('Opus runtime matches libopus-wasm 0.4.0.');

// The libopus 1.1.5 build for the Steam profile comes from tests/libopus11/build.mjs,
// which needs clang and wasm-ld; here only its recorded hash is checked (since W3-11a
// the build exports the 16-bit decoder opus_decode too).
if (process.argv.includes('--check')) {
  const { createHash } = await import('node:crypto');
  const built = fs.readFileSync(path.join(root, 'vendor/libopus-1.1/libopus-1.1.5.wasm.mjs'));
  const expected = 'a753f6b88d215f710568299c4f4aa9cca081735efbf7f983e017346482649f3d';
  if (createHash('sha256').update(built).digest('hex') !== expected) {
    throw new Error('vendor/libopus-1.1/libopus-1.1.5.wasm.mjs differs from the recorded build');
  }
  console.log('libopus 1.1.5 build matches its recorded hash.');
  // Likewise the CELT 0.11 build (tests/celt011/build.mjs) for vaudio_celt,
  // with the pitch filter in (OPUS_BUILD) and the 16-bit entry points.
  const celt = fs.readFileSync(path.join(root, 'vendor/celt-0.11/celt-0.11.wasm.mjs'));
  if (createHash('sha256').update(celt).digest('hex') !== '37b5677f5dd77a2a91bd007b2a7cb6981115ca27c5f704327f9667797977b2c4') {
    throw new Error('vendor/celt-0.11/celt-0.11.wasm.mjs differs from the recorded build');
  }
  console.log('CELT 0.11 build matches its recorded hash.');
  // And the Speex 1.0.2 build (tests/speex102/build.mjs), the library of the
  // game's vaudio_speex module and of the speex profile.
  const speex102 = fs.readFileSync(path.join(root, 'vendor/speex-1.0.2/speex-1.0.2.wasm.mjs'));
  if (createHash('sha256').update(speex102).digest('hex') !== '65dd8bcb81988f21e12d814b45c8860764fa20838168f46644b192b3f6c491b1') {
    throw new Error('vendor/speex-1.0.2/speex-1.0.2.wasm.mjs differs from the recorded build');
  }
  console.log('Speex 1.0.2 build matches its recorded hash.');
}
