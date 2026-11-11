// The VR12 codec of the engine's vaudio_miles module (vendor/voxware-vr12,
// tests/vr12/build.mjs), checked against the game's own plug-in and wrapper,
// measured by running them in a CPU emulator on signals of our own
// (tests/vr12/vectors, W3-20a), against a native build of the same sources
// (tests/vr12/native.mjs), and against the reading of the wrapper, fact by
// fact (tests/LEGACY_CODECS.md, vaudio_miles).
//   node tests/vr12.verify.mjs
//
// VR12_INDEX=<path of an index.mjs> runs the same checks on another build
// (tests/vr12/mutations.mjs uses it to show that each check fails when the
// fact it pins is broken). Every check runs, and the failures are listed at
// the end.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VECTORS, signalNames, loadSignal, scoreSignal, gameRun, resetBefore } from './vr12/native.mjs';

const module = await import(process.env.VR12_INDEX ? pathToFileURL(path.resolve(process.env.VR12_INDEX)).href
  : '../vendor/voxware-vr12/index.mjs');
const { createCodec, createFramer, createPluginEncoder, createPluginDecoder } = module;

let passed = 0;
const failed = [];
function check(name, ok, detail = '') {
  const line = `${name}${detail ? `   [${detail}]` : ''}`;
  if (ok) { passed++; console.log(`  ok    ${line}`); } else { failed.push(name); console.log(`  FAIL  ${line}`); }
}
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const join = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => { out.set(p, at); return at + p.length; }, 0);
  return out;
};
const frames360 = (x) => Array.from({ length: Math.floor(x.length / 360) }, (_, f) => x.subarray(f * 360, (f + 1) * 360));
const zeros = new Int16Array(360);
// The cut as read: the high byte, sign-extended, times 256.
const cut8 = (x) => Int16Array.from(x, v => ((v >> 8) << 24 >> 24) * 256);

console.log('[VR12] The vendored sources and the vectors');
{
  // coffeegrind123/voxware-vr12 at eedf465fd0de65ae28fcc11e2457e7ee01decc22:
  // the four files taken, unchanged.
  const VENDORED = {
    'LICENSE': 'd11274e01b9c481f9130c65b4691c5526892f413ea2e8733c2da5a3157255f56',
    'vr12.c': '59901cb44601d2d908d90a94a32a08f61c2a54055825cd74a3108c6670aacda1',
    'vr12.h': '2aa28570d3ea9bad77f9a364a372140a7eea6010e142c0abac78d9ad3837de3e',
    'vr12_tables.h': '81701ed618e3625bf617c49dd309a3977cd24eaf5f9a39ea8eac8d17d9633284'
  };
  const vendor = new URL('../vendor/voxware-vr12/', import.meta.url);
  const wrong = Object.entries(VENDORED).filter(([f, h]) => sha256(fs.readFileSync(new URL(f, vendor))) !== h).map(([f]) => f);
  check('vendor/voxware-vr12: LICENSE, vr12.c, vr12.h and vr12_tables.h are the upstream files at eedf465, unchanged',
    wrong.length === 0, wrong.length ? `changed: ${wrong.join(', ')}` : '4 files');
  // The vectors are measurements, so first that they are the files measured:
  // SHA256SUMS (its own SHA-256 recorded here) lists every file of the folder,
  // and each file has its listed hash, the hash of the measurement.
  const sums = fs.readFileSync(path.join(VECTORS, 'SHA256SUMS'));
  const listed = new Map(sums.toString().trim().split('\n').map(line => line.split(/\s+\*?/)).map(([h, f]) => [f, h]));
  const present = fs.readdirSync(VECTORS).filter(f => f !== 'SHA256SUMS').sort();
  const bad = [...listed].filter(([f, h]) => !present.includes(f) || sha256(fs.readFileSync(path.join(VECTORS, f))) !== h).map(([f]) => f);
  const unlisted = present.filter(f => !listed.has(f));
  check('tests/vr12/vectors: every file is listed in SHA256SUMS with its hash, and SHA256SUMS is the recorded one',
    sha256(sums) === '9eb685d075bec3a1ddb6649726e3202817e7379c0b9e464ee1f19fe5557a7bea'
    && listed.size === 15 && bad.length === 0 && unlisted.length === 0,
    `${listed.size} files listed, ${present.length} present${bad.length ? `; wrong or missing: ${bad.join(', ')}` : ''}${unlisted.length ? `; unlisted: ${unlisted.join(', ')}` : ''}`);
}

// What each committed signal gives (W3-20a; the report has all eight signals).
// game: frames before and after the reset; the decoded samples that differ
// from the game's by one step, before and after the reset. plugin: the codec
// frames whose packet is not the plug-in's; the decoded samples that differ by
// one step. native: SHA-256 of the native build's game-level packets and
// samples, and plug-in-level packets and samples (`node tests/vr12/native.mjs`,
// gcc 13.3 on x86-64 with musl's math, the order's flags).
const EXPECTED = {
  clipped: {
    game: { before: 100, after: 100, differ: [20, 14] }, plugin: { unequal: [], differ: 37 },
    native: ['fece9248f83469e72898ccd61c987bfc825e931981c2c2c4c7fa4751788ad1a3', '1997a7bff307662121c8b7621abb19b4b07c1c0ec5ab4fde75864fe242f31d49',
      '1b4c396bd652d6e9e74d4801a689bc6ee9f045eb6cbc2e19bdaec7a31cb0e89d', '17774fc865167a879680c35186b4e7c8ecfc6f801f08185776d83da1fbf4368d']
  },
  noise: {
    game: { before: 77, after: 78, differ: [1, 3] }, plugin: { unequal: [], differ: 1 },
    native: ['78eb1082db60b33ac08beef58744aab13fbbec6d44713d46c92b7afd2984fc87', 'f5b8c7046508267dc0cce2a4a3de56eed8d0265b3d85c0cbf64dfaa34f1f7381',
      '0f0163b481ce98fe9559b85faba8194eda3bbd4d9d1922746c2e0a19d43df102', 'be5b88edfdadf68825f6986830438e2765d7a22f75f9c68839b77a88f4dbad44']
  },
  tones: {
    game: { before: 162, after: 163, differ: [41, 22] }, plugin: { unequal: [66, 71, 395], differ: 84 },
    native: ['6ccd5b7a14e98ab1d2ed6ecb416b94135cdfe1741bc371d1922f6fc0ac07bb58', '8500ebfa02bca59cb55a2dcfa33a0975a4cee0fe48092b85903ca79dcd574c4c',
      'd53e0852e6a80efa1c6c79aae4f235d6cddb6429175ee61af3fa8820127f2d28', 'ae9c8438b3d6d4a16b7c83e1f9f9d70f357bb735374273d835186818527924bf']
  }
};

console.log('\n[VR12] The game\'s wrapper and plug-in, on the committed signals');
const names = signalNames();
check('the committed signals are clipped, noise and tones', JSON.stringify(names) === JSON.stringify(Object.keys(EXPECTED)), names.join(', '));
for (const name of names) {
  const want = EXPECTED[name];
  if (!want) continue;
  const signal = loadSignal(name);
  let score;
  try {
    ({ score } = await scoreSignal(module, signal));
  } catch (error) {
    check(`${name}: the build runs the signal`, false, error.message);
    continue;
  }
  const g = score.gamePackets, gp = score.gamePcm, p = score.pluginPackets, pp = score.pluginPcm;
  check(`${name}, game level: every 12-byte packet is the game's, before and after the reset`,
    g.unequal.length === 0 && g.before[1] === want.game.before && g.after[1] === want.game.after,
    `before the reset ${g.before.join(' of ')}, after ${g.after.join(' of ')}${g.unequal.length ? `; first unequal frame ${g.unequal[0]}` : ''}`);
  check(`${name}, game level: decoding the game's packets gives its samples within one step, ${want.game.differ[0]} + ${want.game.differ[1]} off by one`,
    gp.maxdiff <= 1 && gp.differBefore === want.game.differ[0] && gp.differAfter === want.game.differ[1] && gp.compared === gp.samples,
    `${gp.equal} of ${gp.samples} equal, ${gp.differBefore} differ before the reset and ${gp.differAfter} after, largest difference ${gp.maxdiff}`);
  check(`${name}, plug-in level: every 6-byte packet is the plug-in's${want.plugin.unequal.length ? ` but frames ${want.plugin.unequal.join(', ')}` : ''}`,
    JSON.stringify(p.unequal) === JSON.stringify(want.plugin.unequal),
    `${p.frames - p.unequal.length} of ${p.frames}${p.unequal.length ? `; unequal ${p.unequal.join(', ')}` : ''}`);
  check(`${name}, plug-in level: decoding the plug-in's packets gives its samples within one step, ${want.plugin.differ} off by one`,
    pp.maxdiff <= 1 && pp.differ === want.plugin.differ && pp.compared === pp.samples,
    `${pp.equal} of ${pp.samples} equal, largest difference ${pp.maxdiff}`);
  const got = [score.gameHashes.packets, score.gameHashes.pcm, score.pluginHashes.packets, score.pluginHashes.pcm];
  const parts = ['game packets', 'game samples', 'plug-in packets', 'plug-in samples'].filter((_, i) => got[i] !== want.native[i]);
  check(`${name}: packets and decoded samples at both levels are the native build's, bit for bit`, parts.length === 0,
    parts.length ? `differ: ${parts.join(', ')}` : got.map(h => h.slice(0, 12)).join(' '));
}

console.log('\n[VR12] The wrapper, fact by fact');
const noise = loadSignal('noise').input, tones = loadSignal('tones').input;
// A signal through a new frame codec, 360 samples at a time, each packet
// decoded by the same codec (unless `decode` is false): the packets and the
// decoded samples (as bytes). With `resetAt`, the codec is reset before that
// frame, or the reset is done by hand through encode and decode.
async function codecRun(x, { resetAt = -1, manualReset = false, decode = true } = {}) {
  const codec = await createCodec(), packets = [], pcm = [];
  try {
    frames360(x).forEach((frame, f) => {
      if (f === resetAt) {
        if (!manualReset) codec.reset();
        else for (let i = 0; i < 2; i++) codec.decode(codec.encode(zeros));
      }
      const packet = codec.encode(frame);
      packets.push(packet);
      if (decode) pcm.push(new Uint8Array(codec.decode(packet).buffer));
    });
  } finally {
    codec.free();
  }
  return { packets: join(packets), pcm: join(pcm) };
}
// A group of checks that fails as a whole if the build throws.
async function guard(name, fn) {
  try { await fn(); } catch (error) { check(`${name}: runs without an error`, false, error.message); }
}
await guard('the frame', async () => {
  const codec = await createCodec();
  check('a frame is 360 samples in and 12 bytes out, two VR12 frames of 180 samples and 6 bytes: 2133 bit/s at 8000 Hz',
    module.frameSize === 360 && module.packetBytes === 12 && module.codecFrameSize === 180 && module.codecPacketBytes === 6
    && module.sampleRate === 8000 && codec.encode(zeros).length === 12 && codec.decode(new Uint8Array(12)).length === 360
    && Math.round(12 * 8 * 8000 / 360) === 2133);
  codec.free();
});
await guard('the 8-bit cut and the start-up block', async () => {
  // The 8-bit cut, with the start-up block: a new codec's packets are a new
  // plug-in encoder's after one block of 360 zeros, on each sample cut to its
  // top 8 bits (the noise signal opens with noise of amplitude 30, so the cut
  // takes most samples to 0 or -256). Its packets do not change when each
  // sample's low byte does, and do change without the cut.
  const x = noise.subarray(0, 40 * 360);
  const game = (await codecRun(x, { decode: false })).packets;
  // A new plug-in encoder's packets after `blocks` blocks of 360 zeros.
  const plugin = async (input, blocks) => {
    const encoder = await createPluginEncoder(), out = [];
    for (let i = 0; i < 2 * blocks; i++) encoder.encode(zeros.subarray(0, 180));
    for (let f = 0; f < input.length / 180; f++) out.push(encoder.encode(input.subarray(f * 180, (f + 1) * 180)));
    encoder.free();
    return join(out);
  };
  const cutWithStartup = await plugin(cut8(x), 1);
  check('the 8-bit cut: a new codec\'s packets are a plug-in encoder\'s, after one block of zeros, on the samples\' high bytes times 256',
    same(game, cutWithStartup), `${game.length / 12} frames`);
  const lowBytes = Int16Array.from(x, (v, i) => (v & ~255) | ((i * 2654435761) >>> 24));
  const relow = (await codecRun(lowBytes, { decode: false })).packets;
  const uncut = await plugin(x, 1);
  check('the 8-bit cut: other low bytes give the same packets, and the uncut samples other packets',
    same(game, relow) && !same(uncut, game), `${same(game, relow) ? 'same' : 'different'} with other low bytes; ${same(uncut, game) ? 'same' : 'different'} uncut`);
  // The start-up block: without it a plug-in encoder gives other packets on
  // this signal (frames 29 and 30), so the block is seen.
  const noStartup = await plugin(cut8(x), 0), twoBlocks = await plugin(cut8(x), 2);
  const differing = [];
  for (let f = 0; f < noStartup.length / 6; f++) if (!same(noStartup.subarray(f * 6, f * 6 + 6), cutWithStartup.subarray(f * 6, f * 6 + 6))) differing.push(f);
  check('the start-up block: one block of 360 zeros, not none and not two; without it codec frames 29 and 30 differ here',
    JSON.stringify(differing) === '[29,30]' && !same(game, noStartup) && !same(game, twoBlocks), `differing without it: ${differing.join(', ')}`);
});
await guard('decoding', async () => {
  // Nothing is done to decoded samples, and the start-up block leaves the
  // decoder alone: a new codec decodes as a new plug-in decoder, frame for
  // frame. The packets are the game's own for tones.
  const v12 = loadSignal('tones').game.v12.subarray(0, 120 * 12);
  const codec = await createCodec(), decoder = await createPluginDecoder();
  let equal = 0;
  for (let f = 0; f < 120; f++) {
    const mine = codec.decode(v12.subarray(f * 12, f * 12 + 12));
    const ref = new Int16Array(360);
    ref.set(decoder.decode(v12.subarray(f * 12, f * 12 + 6)), 0);
    ref.set(decoder.decode(v12.subarray(f * 12 + 6, f * 12 + 12)), 180);
    if (same(mine, ref)) equal++;
  }
  codec.free(); decoder.free();
  check('decoding: a new codec gives a new plug-in decoder\'s samples as they come (nothing done to them, decoder untouched at start)',
    equal === 120, `${equal} of 120 frames`);
});
await guard('the reset', async () => {
  // The reset: twice over, 360 zeros through the encoder and its 12 bytes
  // through the decoder; nothing cleared. Equal to doing it by hand through
  // encode and decode; and it is seen: unlike no reset, unlike a new codec,
  // unlike one block, and in both halves.
  const x = tones.subarray(0, 90 * 360), at = 60;
  const reset = await codecRun(x, { resetAt: at }), manual = await codecRun(x, { resetAt: at, manualReset: true });
  check('the reset equals two blocks of zeros through encode and decode, by hand: same packets and samples after it',
    same(reset.packets, manual.packets) && same(reset.pcm, manual.pcm));
  const none = await codecRun(x), fresh = await codecRun(x.subarray(at * 360));
  const tail = (r) => ({ packets: r.packets.subarray(at * 12), pcm: r.pcm.subarray(at * 720) });
  const r = tail(reset), n = tail(none);
  // One block by hand, and each half alone by hand.
  const by = async (blocks, decodeToo) => {
    const codec = await createCodec(), packets = [], pcm = [];
    frames360(x).forEach((frame, f) => {
      if (f === at) for (let i = 0; i < blocks; i++) { const p = codec.encode(zeros); if (decodeToo) codec.decode(p); }
      const p = codec.encode(frame);
      packets.push(p);
      pcm.push(new Uint8Array(codec.decode(p).buffer));
    });
    codec.free();
    return tail({ packets: join(packets), pcm: join(pcm) });
  };
  const oneBlock = await by(1, true), encoderOnly = await by(2, false);
  check('the reset is seen: its packets differ from no reset and from a new codec, and one block differs from two',
    !same(r.packets, n.packets) && !same(r.packets, fresh.packets) && !same(r.packets, oneBlock.packets));
  check('the reset goes through the decoder too: without its decoding half the decoded samples differ',
    same(r.packets, encoderOnly.packets) && !same(r.pcm, encoderOnly.pcm));
});
await guard('compress and decompress', async () => {
  // Compress keeps left-over samples until 360 are there and writes whole
  // frames end to end, with no header; with the final flag a part frame is
  // padded with zeros and coded. Decompress decodes as many whole 12-byte
  // frames as fit.
  const x = tones.subarray(0, 12 * 360);
  const whole = (await codecRun(x, { decode: false })).packets;
  const framer = createFramer(await createCodec()), pieces = [1, 359, 361, 100, 7, 1000, 2492], out = [], kept = [];
  let at = 0;
  for (const n of pieces) { out.push(framer.compress(x.subarray(at, at + n))); at += n; kept.push(framer.kept); }
  check('compress: left-overs are kept until 360 are there; the frames come end to end, as frame-by-frame encoding gives them',
    at === x.length && same(join(out), whole) && out[0].length === 0 && out[1].length === 12 && kept.join() === '1,0,1,101,108,28,0',
    `bytes per call ${out.map(o => o.length).join(', ')}; kept ${kept.join(', ')}`);
  const part = x.subarray(0, 400), padded = new Int16Array(720);
  padded.set(part);
  const f2 = createFramer(await createCodec()), finalBytes = f2.compress(part, true);
  const expected = (await codecRun(padded, { decode: false })).packets;
  check('compress with the final flag: a part frame is padded with zeros and coded (400 samples give 24 bytes)',
    finalBytes.length === 24 && same(finalBytes, expected) && f2.kept === 0, `${finalBytes.length} bytes`);
  const d = createFramer(await createCodec()), ref = createFramer(await createCodec());
  const eleven = d.decompress(whole.subarray(0, 11));
  const thirteen = d.decompress(whole.subarray(0, 13)), first = ref.decompress(whole.subarray(0, 12));
  check('decompress: 11 bytes give no samples, 13 give 360 (the 12 whole bytes)', eleven.length === 0 && thirteen.length === 360 && same(thirteen, first),
    `${eleven.length} and ${thirteen.length} samples`);
  // As many whole frames as fit, each from its own 12 bytes, in order: 0, 24,
  // 25 and 36 bytes in turn on a new framer (frames 0-1, 2-3 and a byte left
  // over, 4-6 of tones' packets) against decode() frame by frame on a new
  // codec.
  const many = createFramer(await createCodec()), byFrame = await createCodec();
  const calls = [[0, 0, 0], [0, 24, 2], [24, 25, 2], [48, 36, 3]];
  const got = calls.map(([at, n]) => many.decompress(whole.subarray(at, at + n)));
  const wantFrames = [];
  for (let f = 0; f < 7; f++) wantFrames.push(byFrame.decode(whole.subarray(f * 12, (f + 1) * 12)));
  byFrame.free();
  let next = 0;
  const want = calls.map(([, , frames]) => {
    const out = new Int16Array(frames * 360);
    for (let i = 0; i < frames; i++) out.set(wantFrames[next++], i * 360);
    return out;
  });
  const distinct = wantFrames.every((w, i) => i === 0 || !same(w, wantFrames[i - 1]));
  check('decompress: 0, 24, 25 and 36 bytes give 0, 720, 720 and 1080 samples, frame by frame as decode() gives them',
    distinct && got.every((g, i) => g.length === want[i].length && same(g, want[i])),
    `${got.map(g => g.length).join(', ')} samples`);
  let threw = false;
  try { d.decompress(null); } catch { threw = true; }
  const codec = await createCodec();
  check('no lost-frame path: decompress needs bytes, and the codec has only encode, decode, reset and free',
    threw && JSON.stringify(Object.keys(codec).filter(k => typeof codec[k] === 'function').sort()) === '["decode","encode","free","reset"]');
  codec.free();
});

console.log(`\n${passed} passed, ${failed.length} failed${failed.length ? `:\n${failed.map(f => `  - ${f}`).join('\n')}` : ''}`);
if (failed.length) process.exitCode = 1;
