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
import { EDGE_STREAMS, FMA_CASES, HASHES, STREAMS, mulberry32, randomStreams, streamPackets } from '../swresample.verify.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const SW = require('../../vendor/swresample/swresample.js');

const work = mkdtempSync(join(tmpdir(), 'swr-native-'));
const exe = join(work, 'native');
let failed = 0;
try {
  const pc = execFileSync('pkg-config', ['--cflags', '--libs', 'libswresample', 'libavutil'], { encoding: 'utf8' })
    .trim().split(/\s+/).filter(Boolean);
  execFileSync('gcc', ['-O2', '-o', exe, join(here, 'native.c'), ...pc, '-lm'], { stdio: 'inherit' });
  const info = execFileSync(exe, ['--info'], { encoding: 'utf8' });
  process.stdout.write(info);
  const has = (flag) => new RegExp(`\\b${flag}=1\\b`).test(info);
  const available = { c: true, sse: has('sse4\\.2'), avx: has('avx') && !has('avxslow'),
    fma3: has('avx2') && has('fma3') && !has('avxslow') };

  // The fused multiply-add of the fma3 kernel against the C library's fmaf
  // (correctly rounded, in hardware or not), on cases built to be hard.
  {
    const raw = execFileSync(exe, ['--fma'], { maxBuffer: 1 << 26 });
    const f = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
    let wrong = 0, hard = 0;
    for (let i = 0; i < f.length; i += 4) {
      if (SW.fma32(f[i], f[i + 1], f[i + 2]) !== f[i + 3]) wrong++;
      if (Math.fround(f[i] * f[i + 1] + f[i + 2]) !== f[i + 3]) hard++;
    }
    console.log(`fma32: ${f.length / 4 - wrong} of ${f.length / 4} equal fmaf (${hard} where rounding the double sum would not)`);
    if (wrong) failed++;
  }
  // The suite's recorded fma32 cases: each result is fmaf's.
  {
    const bits = Uint32Array.from(FMA_CASES.flatMap((c) => c.slice(0, 3).map((h) => parseInt(h, 16))));
    const raw = execFileSync(exe, ['--fmaf'], { input: Buffer.from(bits.buffer) });
    const got = new Uint32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
    const bad = FMA_CASES.filter((c, i) => got[i] !== parseInt(c[3], 16));
    console.log(`the suite's ${FMA_CASES.length} fma32 cases: ${FMA_CASES.length - bad.length} are fmaf's results`);
    if (bad.length) { failed++; for (const c of bad) console.log(`  ${c.join(' ')}: fmaf differs`); }
  }

  // Every stream the comparison runs: the four references, the 50 random
  // ones, and streams Steam does not send, to show the port follows the
  // library's start and flush for any packet sizes: a first packet of 0 to 100
  // samples, and packets of 0 to 200 samples throughout.
  const noise = (n, draw) => Int16Array.from({ length: n }, () => Math.floor(draw() * 65536) - 32768);
  const edge = [];
  for (const first of [0, 1, 2, 5, 15, 16, 17, 18, 20, 31, 32, 33, 34, 47, 48, 100]) {
    const draw = mulberry32(0xED6E0000 + first);
    edge.push({ name: `first packet ${first}`, packets: [first, 480, 7, 1440, 1, 0, 3840, 33].map((n) => noise(n, draw)) });
  }
  for (let k = 1; k <= 10; k++) {
    const draw = mulberry32(0x5A11000 + k);
    edge.push({ name: `small packets ${k}`, packets: Array.from({ length: 60 }, () => noise(Math.floor(draw() * 201), draw)) });
  }
  const streams = [
    ...[...Object.keys(STREAMS), ...Object.keys(EDGE_STREAMS)].map((name) => ({ name, packets: streamPackets(name) })),
    ...randomStreams(50).map((packets, i) => ({ name: `random ${i + 1}`, packets })),
    ...edge,
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
      const h = hash.digest('hex');
      if (STREAMS[s.name]) {
        if (h === HASHES[kernel][s.name]) refsOk++;
        else { failed++; console.log(`${kernel} ${s.name}: the library gives ${h}, the order ${HASHES[kernel][s.name]}`); }
      }
      if (EDGE_STREAMS[s.name] && kernel === 'fma3' && h !== EDGE_STREAMS[s.name].hash) {
        failed++;
        console.log(`fma3 ${s.name}: the library gives ${h}, the suite records ${EDGE_STREAMS[s.name].hash}`);
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
