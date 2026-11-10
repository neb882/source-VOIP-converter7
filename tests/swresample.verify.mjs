// tests/swresample.verify.mjs: vendor/swresample/swresample.js, the port of
// libswresample's 24000 to 44100 Hz path (W3-13).
//
// The reference hashes were made by the native library (libswresample
// 4.12.100, FFmpeg 6.1.1, x86-64) forced to each kernel and driven as Steam
// drives it; tests/swresample/native.mjs re-makes them on a machine that has
// the library. This suite needs neither the library nor an FMA processor.
//
//   node tests/swresample.verify.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
// TF2_DIR points the suite at a copy of the sources elsewhere (to break one).
const root = process.env.TF2_DIR || join(dirname(fileURLToPath(import.meta.url)), '..');

// The draw of audio.js.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A negative size is a silence record of that many zeros (no draw).
export const STREAMS = {
  A: { seed: 1, sizes: [3840, 1440, 1440, 480, 960, 1920, 1440, -1500, -1500, -1500, -1500, -1500, 3840, 1440, 480],
    counts: [7056, 2646, 2646, 882, 1764, 3528, 2646, 2757, 2756, 2756, 2756, 2757, 7056, 2646, 882] },
  B: { seed: 2, sizes: [-1500, 3840, 1440, 480, -750, -750, 1440], counts: [2757, 7056, 2646, 882, 1378, 1378, 2646] },
  C: { seed: 3, sizes: [480, 480, 960, 1440, -1500, 1440], counts: [882, 882, 1764, 2646, 2757, 2646] },
  D: { seed: 4, square: true, sizes: [3840, 1440, 1440, 480, -1500, 1440], counts: [7056, 2646, 2646, 882, 2757, 2646] },
};

export const HASHES = {
  fma3: { A: '69e8e07f7477e544b8270e0cb46a3a5d2174f2e69cf672dd7f7966ded3770fd2',
    B: 'e04a83224d7fc0b116a77b828b840b05e07c55268a5e624dfc4a11f9a2d79790',
    C: '1e5a3be7b8952575439ef9517d6744cd6d512414c81790f89636522ef024468a',
    D: '508b5f66e70a15a37072dd373d6f86278298d05bfb59b839c93bb7fcfffb292e' },
  avx: { A: '5b982fe0b8cf475772a180502203f733fc6f0e4a0c5b3b2cc380f35f0b9f1a34',
    B: '6b19ea47a5c84b0faa615981ca4375cb2f4bf72f66357861ef3a381367a0b77c',
    C: 'c4426f77d734e9560530837248cde61948f8c2e9f7e1a8205e11f93268a8b940',
    D: 'd367265cf1431adee40f49e87d28446cc376cf8336e02b2da38977f0c23b69da' },
  sse: { A: 'b60ad3d97bb0724cf0be54fb664dd8f16a61d7035ad5db44ad771176a2858fb8',
    B: '9c495e6c7598168254ddf75f3a8d1248d7eed0349133af3948dfaa80a1ac243b',
    C: 'b9aff6a4500cc46601f9d3afc0b2cdf06baa83f918682d25e079b8c5f46f6b17',
    D: 'ad2bcf294b4055f636c62a6b62e85e2f231bdab0f17ed9ea93da12cc183fede9' },
  c: { A: 'e1289e6e0f9e7c64a4156b5a35a94bd7b6bebad4696c8edb19a419f0ad99b0b7',
    B: '4ccb02e9e2110662c0e0285c5ba40f5ba4d05f5ae885f226704fbf541b5d4b70',
    C: 'f2bf8bc05718ee3e86351b7bbb8f214ce190a915ba8c68fffb4b6d255d5ed3fa',
    D: '8fde33cb6e7a7e07f16ab9b3728a1115f22e6bc2718b824254aa8cc7c0366d31' },
};

export function streamPackets(name) {
  const s = STREAMS[name];
  const draw = mulberry32(s.seed);
  return s.sizes.map((n) => {
    const p = new Int16Array(Math.abs(n));
    if (n > 0) {
      for (let i = 0; i < n; i++) {
        p[i] = s.square ? (draw() < 0.5 ? -32768 : 32767) : Math.floor(draw() * 65536) - 32768;
      }
    }
    return p;
  });
}

// Seeded streams of random packets for the native comparison: 5 to 40 packets
// each, a packet a multiple of 480 up to 3840 or a silence record of 750 or
// 1500 zeros; the level full scale, a square wave at the limits, or quiet.
export function randomStreams(count) {
  const streams = [];
  for (let k = 1; k <= count; k++) {
    const draw = mulberry32(0x5EED0000 + k);
    const level = k % 3;
    const n = 5 + Math.floor(draw() * 36);
    const packets = [];
    for (let i = 0; i < n; i++) {
      const r = draw();
      if (r < 0.2) { packets.push(new Int16Array(r < 0.1 ? 750 : 1500)); continue; }
      const p = new Int16Array(480 * (1 + Math.floor(draw() * 8)));
      for (let j = 0; j < p.length; j++) {
        const d = draw();
        p[j] = level === 0 ? Math.floor(d * 65536) - 32768 : level === 1 ? (d < 0.5 ? -32768 : 32767)
          : Math.floor(d * 2048) - 1024;
      }
      packets.push(p);
    }
    streams.push(packets);
  }
  return streams;
}

export function sha256(chunks) {
  const h = createHash('sha256');
  for (const c of chunks) h.update(Buffer.from(c.buffer, c.byteOffset, c.byteLength));
  return h.digest('hex');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();

async function main() {
  const SW = require(join(root, 'vendor/swresample/swresample.js'));
  const { computeBank, bankBase64, bankSha256, BANK_SHA256 } = await import(
    pathToFileURL(join(root, 'tests/swresample/bank.mjs')).href);

  // Every check runs, so a break shows all the checks it fails.
  let passed = 0;
  const failed = [];
  function check(name, ok, detail = '') {
    if (ok) passed++; else failed.push(name);
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `   [${detail}]` : ''}`);
  }
  const run = (kernel, packets) => {
    const rs = SW.createResampler({ kernel });
    return packets.map((p) => rs.packet(p));
  };
  const concat = (parts) => {
    const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
    parts.reduce((at, p) => { out.set(p, at); return at + p.length; }, 0);
    return out;
  };
  const argmaxAbs = (x) => x.reduce((best, v, i) => (Math.abs(v) > Math.abs(x[best]) ? i : best), 0);

  console.log('swresample: the 24000 to 44100 Hz step of Steam\'s decoder');

  // The interface.
  check('the four kernels, fma3 the default',
    SW.KERNELS.join(' ') === 'fma3 avx sse c' && SW.DEFAULT_KERNEL === 'fma3' &&
    SW.createResampler().kernel === 'fma3' && SW.createResampler({ kernel: 'c' }).kernel === 'c');
  let rangeError = false;
  try { SW.createResampler({ kernel: 'avx512' }); } catch (e) { rangeError = e instanceof RangeError; }
  check('an unknown kernel is a RangeError', rangeError);

  // The bank.
  const stored = SW.bank();
  check('the stored bank is the order\'s (SHA-256 of the 4,704 floats as little-endian bytes)',
    stored.length === 4704 && bankSha256(stored) === BANK_SHA256, bankSha256(stored).slice(0, 16));
  const computed = computeBank();
  check('bank.mjs computes the stored bank under this Node', bankBase64(computed) === SW.BANK_BASE64 &&
    bankSha256(computed) === BANK_SHA256, `Node ${process.versions.node}`);
  check('phase 0 is one 1.0 at tap 15', stored.subarray(0, 32).every((v, i) => (i === 15 ? v === 1 : v === 0)));

  // The sixteen reference hashes and the counts.
  const outputs = {};
  for (const kernel of SW.KERNELS) {
    outputs[kernel] = {};
    for (const name of Object.keys(STREAMS)) {
      const parts = run(kernel, streamPackets(name));
      outputs[kernel][name] = concat(parts);
      const counts = parts.map((p) => p.length);
      const hash = sha256(parts);
      check(`${kernel} stream ${name}: the native library's hash and counts`,
        hash === HASHES[kernel][name] && counts.join() === STREAMS[name].counts.join(),
        hash === HASHES[kernel][name] ? `${counts.length} packets` : `got ${hash}; counts ${counts.join(' ')}`);
    }
  }
  const first12 = Array.from(outputs.fma3.A.subarray(0, 12)).join(' ');
  check('fma3 stream A: the first 12 samples', first12 === '8327 -10860 -32768 -20761 11737 28819 32767 32767 18040 -10327 -17743 6650', first12);
  const limits = outputs.fma3.D.reduce((n, v) => n + (v === 32767 || v === -32768), 0);
  check('fma3 stream D: 6833 of its 18633 samples at a 16-bit limit', outputs.fma3.D.length === 18633 && limits === 6833,
    `${limits} of ${outputs.fma3.D.length}`);

  // The kernels differ in the last bit of a few samples at full scale.
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      const ka = SW.KERNELS[a], kb = SW.KERNELS[b], x = outputs[ka].A, y = outputs[kb].A;
      let n = 0, worst = 0;
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { n++; worst = Math.max(worst, Math.abs(x[i] - y[i])); }
      check(`stream A: ${ka} and ${kb} differ in 1 to 199 samples, each by 1`, n >= 1 && n < 200 && worst === 1,
        `${n} samples`);
    }
  }

  // The fused multiply-add on cases where rounding the double sum would be
  // wrong (from the C library's fmaf; tests/swresample/native.mjs runs a million).
  const f32 = (hex) => new DataView(Uint32Array.of(parseInt(hex, 16)).buffer).getFloat32(0, true);
  const hard = [
    ['3ed5ace8', '41995aa6', '4d69c8c5', '4d69c8c5'], ['3c31d2c3', 'bb3845d8', 'c46296be', 'c46296bf'],
    ['3c0a54f8', '436ce12a', '4c155895', '4c155895'], ['44e6c5f6', '398dfdff', '4b2a8940', '4b2a8941'],
    ['36d88ba0', '3c975255', '4038d1cb', '4038d1cb'], ['3b16ed4f', '44591c92', '4c5d8bb1', '4c5d8bb1'],
  ].map((c) => c.map(f32));
  check('fma32 rounds once, where the double sum lies halfway between two floats',
    hard.every(([a, b, c, r]) => SW.fma32(a, b, c) === r && Math.fround(a * b + c) !== r), `${hard.length} cases`);

  // Where the sound lands.
  const click = (at) => {
    const p = [new Int16Array(3840), new Int16Array(3840)];
    p[Math.floor(at / 3840)][at % 3840] = 16384;
    return argmaxAbs(concat(run('fma3', p)));
  };
  const landed = [click(100), click(3835), click(4000)];
  check('a click at input 100, 3835 and 4000 peaks at output 184, 7047 and 7379 (none, none, 16 inputs late)',
    landed.join() === '184,7047,7379', landed.join(' '));

  // Phase 0 passes its input: output 147 m is input 80 m within the first packet.
  {
    const input = streamPackets('A')[0], out = outputs.fma3.A;
    let ok = true;
    for (let m = 0; 147 * m < STREAMS.A.counts[0]; m++) if (out[147 * m] !== input[80 * m]) ok = false;
    check('stream A: output 147 m equals input 80 m for every m in the first packet', ok);
  }

  // A constant passes within 1.
  {
    const sizes = [3840, 1440, 480, 1440, 960, 3840, 1920, 480];
    const out = concat(run('fma3', sizes.map((n) => new Int16Array(n).fill(12345))));
    const off = out.reduce((m, v) => Math.max(m, Math.abs(v - 12345)), 0);
    check('a constant 12345 comes out within 1 of 12345 everywhere', off <= 1, `largest error ${off}`);
  }

  // The response on sines at -6 dBFS, 1 s in packets of 480, over the middle
  // half: 0.25 s to 0.75 s holds a whole number of cycles of every tone here.
  {
    const level = (x, rate, f) => {
      const from = rate / 4, n = rate / 2;
      let c = 0, s = 0;
      for (let i = 0; i < n; i++) {
        const w = 2 * Math.PI * f * (from + i) / rate;
        c += x[from + i] * Math.cos(w); s += x[from + i] * Math.sin(w);
      }
      return 2 * Math.hypot(c, s) / n;
    };
    const dB = (r) => 20 * Math.log10(r);
    const response = [];
    let image = 0;
    for (const [f, want] of [[1000, 0], [10500, -0.11], [11000, -0.71], [11500, -2.43], [11750, -3.95]]) {
      const x = Int16Array.from({ length: 24000 }, (_, i) => Math.round(16384 * Math.sin(2 * Math.PI * f * i / 24000)));
      const packets = Array.from({ length: 50 }, (_, k) => x.subarray(480 * k, 480 * (k + 1)));
      const y = concat(run('fma3', packets));
      const inLevel = level(x, 24000, f), got = dB(level(y, 44100, f) / inLevel);
      response.push([f, got, want]);
      if (f === 11500) image = dB(level(y, 44100, 24000 - f) / inLevel);
    }
    check('the response at 1, 10.5, 11, 11.5 and 11.75 kHz is 0, -0.11, -0.71, -2.43 and -3.95 dB within 0.1',
      response.every(([, got, want]) => Math.abs(got - want) <= 0.1), response.map(([, g]) => g.toFixed(2)).join(' '));
    check('an 11.5 kHz sine leaves an image at 12.5 kHz 12.2 dB under it, within 0.5', Math.abs(image + 12.2) <= 0.5,
      `${image.toFixed(2)} dB`);
  }

  // reset() is a new stream.
  {
    const rs = SW.createResampler();
    for (const p of streamPackets('B')) rs.packet(p);
    rs.reset();
    check('after reset() stream A comes out as from a new resampler', sha256(streamPackets('A').map((p) => rs.packet(p))) === HASHES.fma3.A);
  }

  // The buffer stays small over 10 minutes of packets (silence records included).
  {
    const rs = SW.createResampler();
    const draw = mulberry32(99), sizes = [3840, 1440, 480, 960, 1920, -1500, -750];
    const pool = Array.from({ length: 64 }, () => {
      const n = sizes[Math.floor(draw() * sizes.length)];
      return n < 0 ? new Int16Array(-n) : Int16Array.from({ length: n }, () => Math.floor(draw() * 65536) - 32768);
    });
    let inputs = 0, outs = 0, largest = 0, k = 0;
    while (inputs < 600 * 24000) {
      const p = pool[k++ % pool.length];
      inputs += p.length;
      outs += rs.packet(p).length;
      largest = Math.max(largest, rs.bufferSize);
    }
    check('10 minutes of packets: the input buffer stays under 4,096 samples, and the output keeps the rate',
      largest < 4096 && Math.abs(outs - inputs * 147 / 80) <= 2, `largest ${largest}; ${outs} out for ${inputs} in`);
  }

  // A classic script: the same samples when loaded as the page and a worker load it.
  {
    const sandbox = { console };
    vm.createContext(sandbox);
    vm.runInContext(readFileSync(join(root, 'vendor/swresample/swresample.js'), 'utf8'), sandbox);
    const T = sandbox.TF2Swresample;
    const rs = T && T.createResampler();
    check('loaded as a classic script it sets TF2Swresample and gives stream A\'s hash',
      !!rs && sha256(streamPackets('A').map((p) => rs.packet(p))) === HASHES.fma3.A);
  }

  assert.deepEqual(failed, [], `${failed.length} swresample checks failed`);
  console.log(`\n${passed} swresample checks passed`);
}
