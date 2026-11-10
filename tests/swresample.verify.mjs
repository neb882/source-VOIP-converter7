// tests/swresample.verify.mjs: vendor/swresample/swresample.js, the port of
// libswresample's 24000 to 44100 Hz path (W3-13).
//
// The reference hashes were made by the native library (libswresample
// 4.12.100, FFmpeg 6.1.1, x86-64) forced to each kernel and driven as Steam
// drives it; tests/swresample/native.mjs re-makes them on a machine that has
// the library. This suite needs neither the library nor an FMA processor.
//
//   node tests/swresample.verify.mjs
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

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
  // The checks are added below.
}
