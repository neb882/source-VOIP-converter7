// tests/swresample/native.mjs: the port against the machine's libswresample,
// sample for sample, under each of the four kernels.
//
// A one-off check, not in CI: it needs gcc, pkg-config and libswresample-dev
// (this project's reference is libswresample 4.12.100, FFmpeg 6.1.1, x86-64).
// It compiles native.c, forces the library to each kernel with
// av_force_cpu_flags before the context is made, drives it with Steam's three
// calls per packet, and compares with vendor/swresample/swresample.js on the
// four reference streams of tests/swresample.verify.mjs and on 50 seeded
// streams of random packets. A kernel this processor lacks is reported as not
// confirmed here, not as a failure.
//
//   node tests/swresample/native.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HASHES, STREAMS, randomStreams, streamPackets } from '../swresample.verify.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const SW = require('../../vendor/swresample/swresample.js');

const work = mkdtempSync(join(tmpdir(), 'swr-native-'));
const exe = join(work, 'native');
let failed = 0;
try {
  const pc = execFileSync('pkg-config', ['--cflags', '--libs', 'libswresample', 'libavutil'], { encoding: 'utf8' })
    .trim().split(/\s+/).filter(Boolean);
  execFileSync('gcc', ['-O2', '-o', exe, join(here, 'native.c'), ...pc], { stdio: 'inherit' });
  const info = execFileSync(exe, ['--info'], { encoding: 'utf8' });
  process.stdout.write(info);
  const has = (flag) => new RegExp(`\\b${flag}=1\\b`).test(info);
  const available = { c: true, sse: has('sse4\\.2'), avx: has('avx') && !has('avxslow'),
    fma3: has('avx2') && has('fma3') && !has('avxslow') };

  // Every stream the comparison runs: the four references, then the random ones.
  const streams = [
    ...Object.keys(STREAMS).map((name) => ({ name, packets: streamPackets(name) })),
    ...randomStreams(50).map((packets, i) => ({ name: `random ${i + 1}`, packets })),
  ];
  const parts = [];
  streams.forEach((s, i) => {
    if (i) parts.push(Buffer.from(new Int32Array([-1]).buffer));
    for (const p of s.packets) {
      parts.push(Buffer.from(new Int32Array([p.length]).buffer));
      parts.push(Buffer.from(p.buffer, p.byteOffset, p.byteLength));
    }
  });
  const input = Buffer.concat(parts);

  for (const kernel of SW.KERNELS) {
    if (!available[kernel]) {
      console.log(`${kernel}: this processor lacks it; not confirmed here`);
      continue;
    }
    const raw = execFileSync(exe, [kernel], { input, maxBuffer: 1 << 30 });
    let off = 0;
    const take = () => {
      const m = raw.readInt32LE(off); off += 4;
      const out = new Int16Array(m);
      for (let j = 0; j < m; j++) out[j] = raw.readInt16LE(off + 2 * j);
      off += 2 * m;
      return out;
    };
    const rs = SW.createResampler({ kernel });
    let refsOk = 0, portOk = 0, samples = 0;
    for (const s of streams) {
      rs.reset();
      const hash = createHash('sha256');
      let diff = null;
      s.packets.forEach((p, pi) => {
        const nat = take();
        const mine = rs.packet(p);
        hash.update(Buffer.from(nat.buffer));
        samples += nat.length;
        if (diff) return;
        if (mine.length !== nat.length) { diff = `packet ${pi}: ${mine.length} samples, the library ${nat.length}`; return; }
        for (let j = 0; j < nat.length; j++) {
          if (mine[j] !== nat[j]) { diff = `packet ${pi}, sample ${j}: ${mine[j]}, the library ${nat[j]}`; return; }
        }
      });
      if (diff) { failed++; console.log(`${kernel} ${s.name}: the port differs, first at ${diff}`); } else portOk++;
      if (STREAMS[s.name]) {
        const h = hash.digest('hex');
        if (h === HASHES[kernel][s.name]) refsOk++;
        else { failed++; console.log(`${kernel} ${s.name}: the library gives ${h}, the order ${HASHES[kernel][s.name]}`); }
      }
    }
    if (off !== raw.length) { failed++; console.log(`${kernel}: output left over`); }
    console.log(`${kernel}: the library meets ${refsOk} of 4 reference hashes; the port equals it on ${portOk} of ` +
      `${streams.length} streams (${samples} samples)`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (failed) { console.log(`FAIL: ${failed}`); process.exit(1); }
console.log('native comparison: pass');
