// Mutations of the wrapper, each breaking one fact of the reading, to show
// that tests/vr12.verify.mjs notices (the report's mutation table).
//
//   node tests/vr12/mutations.mjs [musl-1.2.5-checkout]
//
// For each mutation: a module is built with the change made to a copy of
// ./api.c (./build.mjs --mutate), or index.mjs is copied with the change made
// to it, and the suite is run on that build (VR12_INDEX). Prints the checks
// each mutation fails; exits with an error if one fails none. A one-off: it
// needs clang and wasm-ld, which the test suite does not.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Changes to tests/vr12/api.c: the text replaced, which must occur once, and
// its replacement.
export const API_MUTATIONS = {
  'cut-none': {
    fact: 'the 8-bit cut: the codec gets the full 16-bit samples',
    from: '    cut[i] = (int16_t)(high * 256);                             /* what the codec reads back */',
    to: '    cut[i] = pcm[i]; (void)high;'
  },
  'cut-round': {
    fact: 'the 8-bit cut: rounded to the nearest multiple of 256 instead of cut',
    from: 'int8_t high = (int8_t)(uint8_t)((uint16_t)pcm[i] >> 8);',
    to: 'int8_t high = (int8_t)(uint8_t)((uint16_t)(pcm[i] + 128) >> 8);'
  },
  'cut-toward-zero': {
    fact: 'the 8-bit cut: truncated toward zero instead of taking the high byte',
    from: '    cut[i] = (int16_t)(high * 256);                             /* what the codec reads back */',
    to: '    cut[i] = (int16_t)(pcm[i] / 256 * 256); (void)high;'
  },
  'startup-none': {
    fact: 'the start-up block: none',
    from: '  vm_encode(m, zeros, packet);\n  return m;',
    to: '  (void)packet;\n  return m;'
  },
  'startup-twice': {
    fact: 'the start-up block: two blocks',
    from: '  vm_encode(m, zeros, packet);\n  return m;',
    to: '  vm_encode(m, zeros, packet);\n  vm_encode(m, zeros, packet);\n  return m;'
  },
  'startup-decodes': {
    fact: 'the start-up block: its bytes are also decoded',
    from: '  vm_encode(m, zeros, packet);\n  return m;',
    to: '  vm_encode(m, zeros, packet);\n  { int16_t pcm[FRAME]; vm_decode(m, packet, pcm); }\n  return m;'
  },
  'reset-none': {
    fact: 'the reset: does nothing',
    from: 'int vm_reset(Miles *m) {\n',
    to: 'int vm_reset(Miles *m) {\n  return 0;\n'
  },
  'reset-once': {
    fact: 'the reset: one block instead of two',
    from: 'for (i = 0; i < 2; i++) {',
    to: 'for (i = 0; i < 1; i++) {'
  },
  'reset-encoder-only': {
    fact: 'the reset: the decoder half left out',
    from: '    if (vm_decode(m, packet, pcm) < 0) return -1;\n  }\n  return 0;',
    to: '    (void)pcm;\n  }\n  return 0;'
  },
  'reset-clears': {
    fact: 'the reset: clears the encoder and decoder before the two blocks',
    from: '  int i;\n  for (i = 0; i < 2; i++) {',
    to: '  int i;\n  vr12_encoder_reset(m->encoder);\n  vr12_reset(m->decoder);\n  for (i = 0; i < 2; i++) {'
  },
  'decoded-changed': {
    fact: 'decoded samples: the lowest bit cleared (something done to them)',
    from: '  return FRAME;\n}',
    to: '  { int i; for (i = 0; i < FRAME; i++) pcm[i] = (int16_t)(pcm[i] & ~1); }\n  return FRAME;\n}'
  },
  'halves-swapped': {
    fact: 'the frame: its two VR12 frames written in the other order',
    from: '  vr12_encode_frame6(m->encoder, cut, packet);\n  vr12_encode_frame6(m->encoder, cut + CODEC_FRAME, packet + CODEC_PACKET);',
    to: '  vr12_encode_frame6(m->encoder, cut, packet + CODEC_PACKET);\n  vr12_encode_frame6(m->encoder, cut + CODEC_FRAME, packet);'
  }
};
// Changes to vendor/voxware-vr12/index.mjs (the framer).
export const INDEX_MUTATIONS = {
  'leftover-dropped': {
    fact: 'compress: what does not fill a frame is dropped',
    from: '      if (final && count > 0) {',
    to: '      if (!final) count = 0;\n      if (final && count > 0) {'
  },
  'final-ignored': {
    fact: 'compress: the final flag does not code the part frame',
    from: '      if (final && count > 0) {',
    to: '      if (false && count > 0) {'
  },
  'final-not-zeros': {
    fact: 'compress: the part frame is padded with what the buffer held, not zeros',
    from: '        kept.fill(0, count);\n',
    to: ''
  },
  'compress-header': {
    fact: 'compress: a count byte after the frames',
    from: '      const out = new Uint8Array(packets.length * packetBytes);',
    to: '      const out = new Uint8Array(packets.length * packetBytes + 1);\n      out[packets.length * packetBytes] = packets.length;'
  },
  'decompress-part-frame': {
    fact: 'decompress: a part frame is padded with zeros and decoded',
    from: '      const frames = Math.floor(bytes.length / packetBytes), out = new Int16Array(frames * frameSize);\n' +
      '      for (let f = 0; f < frames; f++) out.set(codec.decode(bytes.subarray(f * packetBytes, (f + 1) * packetBytes)), f * frameSize);',
    to: '      const frames = Math.ceil(bytes.length / packetBytes), out = new Int16Array(frames * frameSize);\n' +
      '      for (let f = 0; f < frames; f++) { const p = new Uint8Array(packetBytes); p.set(bytes.subarray(f * packetBytes, (f + 1) * packetBytes)); out.set(codec.decode(p), f * frameSize); }'
  },
  'lost-frame-path': {
    fact: 'a lost frame: decompress without bytes gives a frame of silence',
    from: "      if (!bytes) throw new TypeError('VR12 has no lost-frame path: decompress needs bytes');",
    to: '      if (!bytes) return new Int16Array(frameSize);'
  }
};
function apply(text, table, names) {
  for (const name of names) {
    const m = table[name];
    if (!m) throw new Error(`Unknown mutation ${name}`);
    const count = text.split(m.from).length - 1;
    if (count !== 1) throw new Error(`Mutation ${name}: its text occurs ${count} times, not once`);
    text = text.replace(m.from, m.to);
  }
  return text;
}
export const mutateApi = (text, names) => apply(text, API_MUTATIONS, names);
export const mutateIndex = (text, names) => apply(text, INDEX_MUTATIONS, names);

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '../..');
  const vendor = path.join(root, 'vendor/voxware-vr12');
  const musl = process.argv[2];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vr12-mutations-'));
  const index = fs.readFileSync(path.join(vendor, 'index.mjs'), 'utf8');
  let silent = 0;
  try {
    for (const [name, m] of [...Object.entries(API_MUTATIONS).map(e => [...e, 'api']), ...Object.entries(INDEX_MUTATIONS).map(e => [...e, 'index'])]
      .map(([name, m, kind]) => [name, { ...m, kind }])) {
      const dir = path.join(tmp, name);
      fs.mkdirSync(dir);
      if (m.kind === 'api') {
        const built = spawnSync(process.execPath, [path.join(here, 'build.mjs'), `--mutate=${name}`, `--out=${path.join(dir, 'voxware-vr12.wasm.mjs')}`,
          ...(musl ? [musl] : [])], { encoding: 'utf8' });
        if (built.status !== 0) throw new Error(`Building ${name} failed: ${built.stderr}`);
        fs.writeFileSync(path.join(dir, 'index.mjs'), index);
      } else {
        fs.copyFileSync(path.join(vendor, 'voxware-vr12.wasm.mjs'), path.join(dir, 'voxware-vr12.wasm.mjs'));
        fs.writeFileSync(path.join(dir, 'index.mjs'), mutateIndex(index, [name]));
      }
      const result = spawnSync(process.execPath, [path.join(root, 'tests/vr12.verify.mjs')], {
        encoding: 'utf8', env: { ...process.env, VR12_INDEX: path.join(dir, 'index.mjs') }, maxBuffer: 1 << 24 });
      const fails = result.stdout.split('\n').filter(l => l.startsWith('  FAIL')).map(l => l.slice(8).split('   [')[0]);
      if (!fails.length) silent++;
      console.log(`${name} (${m.fact}): ${fails.length ? `${fails.length} checks fail, exit ${result.status}` : `NO CHECK FAILS, exit ${result.status}`}`);
      for (const f of fails) console.log(`    ${f}`);
    }
    console.log(silent ? `${silent} mutations fail no check.` : 'Every mutation fails at least one check.');
    process.exitCode = silent ? 1 : 0;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
