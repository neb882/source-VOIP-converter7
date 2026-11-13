// The stages a render keeps (W4-01b): TF2Audio.process with opts.stages
// gives the samples and codecInfo a render made afresh gives.
//
//   node tests/stages.verify.mjs
//
// process() can keep A (the capture signal at the codec's rate) and B (the
// codec stage's result) in an object its caller holds for one source, and
// starts a later render from either when every option read before it is the
// same (audio.js: stagePlan, AFTER_A_OPTIONS, AFTER_B_OPTIONS). These checks:
//   1. every recorded render of tests/render-stream.verify.mjs (its CASES and
//      GOLDEN, read from that file as it stands) made with stages first used
//      for the same source with voiceScale 0.5, and with stages first used
//      with lossPct 5, gives its recorded WAV and codecInfo hashes;
//   2. each option the page sends (RENDER_OPTION_NAMES; the browser suite
//      checks the list against the page's renderOptions()) and each other
//      option process() reads (ENGINE_OPTION_NAMES), changed alone and
//      rendered with warm stages, gives a fresh render's hashes, starting
//      from the place its lists say; then the first settings again give
//      theirs (nothing kept was written to);
//   3. the keys: an option the engine does not know, a changed sourceKey,
//      function-valued options (loseMessage decides, onDecoded and
//      onResampled watch an early stage: nothing is kept or taken; the
//      observers keep the reuse), values JSON would make equal, options
//      changed while the render runs (read once, at the call), values the
//      engine reads differently that look alike (the keys hold each option
//      as the stages use it), a stages object that cannot keep, a caller
//      writing into what it was given, retime (which the engine no longer
//      reads, W3-02f), what `steam`'s B holds, a render stopped part way;
//   4. W4-01b's step 3: the first 14 s of a render of a source's first 15 s
//      are the first 14 s of the render of the whole source, sample for
//      sample, for each profile on three seeded clips and for each setting
//      TF2Audio.previewAllowed() allows; and previewAllowed() allows nothing
//      else.
// A later order adds its case to EXTRA_OPTION_CASES (section 2).
// Every signal is synthetic, made here or in render-stream.verify.mjs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEngine } from './lib/engine.cjs';

const root = process.env.TF2_DIR ? pathToFileURL(path.resolve(process.env.TF2_DIR) + '/') : new URL('..', import.meta.url);
const TF2Opus = await import(new URL('opus-codec.mjs', root).href);
const requireHere = createRequire(import.meta.url);
const roomModule = requireHere(fileURLToPath(new URL('room-dsp.js', root)));
const roomTable = requireHere(fileURLToPath(new URL('room-presets.js', root)));

// The engine as tests/render-stream.verify.mjs loads it, from the tests' one
// loader (tests/lib/engine.cjs): one function of this realm, no timers, the
// codec module and the room module injected.
const engine = loadEngine({ root, codec: TF2Opus, TF2Room: roomModule, TF2_ROOM_PRESETS: roomTable }), A = engine.audio;
// render-stream's test-only profile, as it defines it (its cases use it).
engine.CODEC_PROFILES.test_decoder_eq = { ...engine.CODEC_PROFILES.steam, displayName: 'test only: Steam with a decoder EQ',
  senderGate: { thresholdDb: -39.5, prerollMs: 120, holdMs: 440 },
  decoderEq: { taps: 63, freqs: [0, 3000, 7000, 12000], gainsDb: [0, -1, -6, -12] } };

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `   [${detail}]` : ''}`);
}

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (ArrayBuffer.isView(value)) return { [value.constructor.name]: Array.from(value) };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
const infoHash = (info) => sha256(JSON.stringify(canonical(info)));
const buffer = (samples, rate) => ({ sampleRate: rate, length: samples.length, numberOfChannels: 1, getChannelData: () => samples });
const stereo = (left, right, rate) => ({ sampleRate: rate, length: left.length, numberOfChannels: 2, getChannelData: (c) => (c ? right : left) });
const hashes = async (r) => `${sha256(new Uint8Array(await r.blob.arrayBuffer()))} ${infoHash(r.codecInfo)}`;
// How often each place was taken and kept, as a string to compare.
const counts = (stages) => (stages.counts ? `A taken ${stages.counts.a.reused}, kept ${stages.counts.a.kept}; B taken ${stages.counts.b.reused}, kept ${stages.counts.b.kept}` : 'nothing');
const taken = (stages) => (stages.counts ? { a: stages.counts.a.reused, b: stages.counts.b.reused } : { a: 0, b: 0 });
const sameSamples = (x, y) => x.length === y.length && Buffer.compare(Buffer.from(x.buffer, x.byteOffset, x.byteLength), Buffer.from(y.buffer, y.byteOffset, y.byteLength)) === 0;

/* ---------------- 1. the recorded renders through warm stages ---------------- */

// The cases and their hashes as tests/render-stream.verify.mjs holds them:
// its signals and cases section, run here with the engine's tables and the
// room module it uses, so that the two suites cannot hold different lists.
const streamText = fs.readFileSync(new URL('tests/render-stream.verify.mjs', root), 'utf8');
const from = streamText.indexOf('/* ---------------- signals ---------------- */');
const to = streamText.indexOf('/* ---------------- helpers ---------------- */');
const { CASES, GOLDEN, voice, receivedVoice } = new Function('engine', 'roomModule', 'roomTable', `${streamText.slice(from, to)}\nreturn { CASES, GOLDEN, voice, receivedVoice };`)(
  engine, roomModule, roomTable);

console.log('\n[1] Every recorded render, made with stages first used for other settings of the same source');
check('render-stream.verify.mjs gives a case for every recorded render', from > 0 && to > from && CASES.length > 0
  && CASES.length === Object.keys(GOLDEN).length && CASES.every(c => GOLDEN[c.name]), `${CASES.length} cases`);
const t1 = performance.now();
for (const c of CASES) {
  const source = buffer(c.make(), c.rate);
  // B is kept where a codec runs: not for a demo's voice, not with the codec skipped.
  const coded = c.opts.enableWarble !== false && !c.opts.received;
  for (const [warm, change, place] of [['voiceScale 0.5', { voiceScale: 0.5 }, coded ? 'b' : 'a'], ['lossPct 5', { lossPct: 5 }, 'a']]) {
    const stages = {};
    await A.process(source, { ...c.opts, ...change, stages, sourceKey: c.name });
    const r = await A.process(source, { ...c.opts, stages, sourceKey: c.name });
    const got = taken(stages), ok = (place === 'b' ? got.b === 1 : got.a === 1 && got.b === 0);
    check(`${c.name}: with stages first used with ${warm}, the recorded WAV and codecInfo, from ${place.toUpperCase()}`,
      `${sha256(new Uint8Array(await r.blob.arrayBuffer()))} ${infoHash(r.codecInfo)}` === GOLDEN[c.name].join(' ') && ok, counts(stages));
  }
}
console.log(`  (${((performance.now() - t1) / 1000).toFixed(1)} s)`);

/* ---------------- 2. each option the page sends, changed alone ---------------- */

// The option names app/render.js's renderOptions() sends (the browser suite
// checks this list against the page's), with the page's defaults, and a
// changed value for each (two for some), each changed alone.
// Since W3-02d-1 the page renders on the game's timeline by default
// (timeline 'game' at 300 frames a second, voice_buffer_ms 100), and no
// longer sends retime, which since W3-02f the engine does not read either.
const RENDER_OPTION_NAMES = ['codec', 'room', 'underwater', 'captureChannel', 'micGain', 'voiceScale', 'hp', 'lp', 'bits', 'agc',
  'maxGain', 'avgGain', 'gate', 'gateThresholdDb', 'steamUptime', 'volume', 'deviceRate', 'lossPct', 'frameMs', 'enableWarble', 'jitterMs',
  'timeline', 'fps', 'bufferMs'];
const PAGE_DEFAULTS = { codec: 'steam', room: null, underwater: false, captureChannel: 'left', micGain: 1, voiceScale: 1, hp: 0, lp: 20000,
  bits: 16, agc: true, maxGain: 10, avgGain: 0.5, gate: null, gateThresholdDb: undefined, steamUptime: 777600, volume: 1,
  deviceRate: 48000, lossPct: 0, frameMs: 20, enableWarble: true, jitterMs: 0, timeline: 'game', fps: 300, bufferMs: 100 };
// What the page sends where a render keeps the file's own timing: any codec
// but `steam`, the codec skipped, a demo's voice (app/render.js). The engine
// refuses the game's timeline there with a RangeError.
const SOURCE_BASE = { ...PAGE_DEFAULTS, timeline: 'source', fps: undefined, bufferMs: undefined };
const CHANGES = {
  codec: [{ codec: 'celt_22' }, { codec: 'miles' }],
  room: [{ room: { preset: 6 } }, { room: { custom: { duration: 1, decay: 2, mix: 0.3 } } }],
  underwater: [{ underwater: true }],
  captureChannel: [{ captureChannel: 'right' }, { captureChannel: 'mix' }],
  micGain: [{ micGain: 3 }],
  voiceScale: [{ voiceScale: 0.5 }],
  hp: [{ hp: 300 }],
  lp: [{ lp: 3000 }],
  bits: [{ bits: 8 }],
  agc: [{ agc: false }],
  maxGain: [{ maxGain: 3 }],
  avgGain: [{ avgGain: 0.25 }],
  gate: [{ gate: false }],
  gateThresholdDb: [{ gateThresholdDb: -30 }],
  steamUptime: [{ steamUptime: 14400 }],
  volume: [{ volume: 0.5 }],
  deviceRate: [{ deviceRate: 44100 }],
  lossPct: [{ lossPct: 15 }],
  frameMs: [{ frameMs: 60 }],
  enableWarble: [{ enableWarble: false }],
  jitterMs: [{ jitterMs: 100 }],
  timeline: [{ timeline: 'source' }],
  fps: [{ fps: 66.67 }],
  bufferMs: [{ bufferMs: 200 }]
};
// The other options process() reads, and options whose effect shows only
// on a base of their own (net_split with jitter, the seed with loss), each
// changed alone: [name, base options, changed options, source?] (the
// source a demo's voice where it is one). With the page's cases these change
// every name process() reads (the check below).
const ENGINE_OPTION_NAMES = ['listenerPos', 'dspRoom', 'customEnv', 'seed', 'received', 'swrKernel'];
const CELT_BASE = { ...SOURCE_BASE, codec: 'celt_22', steamUptime: undefined };
const demoVoice = receivedVoice(5, 23);
const ENGINE_OPTION_CASES = [
  ['steam, jitter 50 ms: {"frameMs":60}', { ...PAGE_DEFAULTS, jitterMs: 50 }, { frameMs: 60 }],
  ['celt_22, jitter 50 ms: {"frameMs":60}', { ...CELT_BASE, jitterMs: 50 }, { frameMs: 60 }],
  ['steam, loss 15%: {"seed":2}', { ...PAGE_DEFAULTS, lossPct: 15 }, { seed: 2 }],
  ['celt_22, loss 15%: {"seed":2}', { ...CELT_BASE, lossPct: 15 }, { seed: 2 }],
  ['steam, the older room options: {"dspRoom":6}', { ...PAGE_DEFAULTS, room: undefined }, { dspRoom: 6 }],
  ['steam, the older room options: {"listenerPos":"auto_closet"}', { ...PAGE_DEFAULTS, room: undefined }, { listenerPos: 'auto_closet' }],
  ['steam, dspRoom 99: {"customEnv":{"duration":1,"decay":2,"mix":0.5}}', { ...PAGE_DEFAULTS, room: undefined, dspRoom: 99,
    customEnv: { duration: 1, decay: 2, mix: 0.3 } }, { customEnv: { duration: 1, decay: 2, mix: 0.5 } }],
  ['steam: {"swrKernel":"c"}', { ...PAGE_DEFAULTS }, { swrKernel: 'c' }],
  ['steam, a demo\'s samples: {"received":…}', { ...SOURCE_BASE, micGain: 2 }, { received: demoVoice.received },
    buffer(demoVoice.samples, 24000)]
];
// A later order's case, in the same form. W3-02c-2's timeline, fps and
// bufferMs are the page's since W3-02d-1, in the cases above.
const EXTRA_OPTION_CASES = [];
// Where a render with `change` should start from, by the lists: B when every
// option changed is read only after B, A when only after A, else neither.
const { afterA, afterB, read, observers } = A.STAGE_OPTIONS;
// The names process() reads that no case of section 2 changes: the codec
// stage's hooks and the channel's (arriveAt, BC-4; section 3 and
// tests/render-channel.verify.mjs: each keeps and takes nothing), the
// observers and the keeping's own controls.
const HOOKS = ['loseMessage', 'arriveAt', 'onDecoded', 'onResampled'], CONTROLS = ['stages', 'sourceKey', 'signal'];
const startsFrom = (base, change) => {
  const changed = Object.keys(change).filter((k) => !Object.is(change[k], base[k]));
  const coded = (change.enableWarble ?? base.enableWarble) !== false && !(change.received ?? base.received);
  // BC-4 (the plan review's point 2): where Steam's sender and decoder run (the
  // steam codec, or a name the engine does not know, with the codec on), the
  // codec stage does not read jitterMs, which the keys then hold as 0: a
  // changed jitterMs starts from B there while the lists say A.
  const codec = change.codec ?? base.codec;
  const profile = Object.hasOwn(engine.CODEC_PROFILES, codec) ? engine.CODEC_PROFILES[codec] : engine.CODEC_PROFILES.steam;
  const steamPath = coded && profile.senderGate?.rule === 'steam';
  if (coded && changed.every((k) => afterB.includes(k) || (k === 'jitterMs' && steamPath))) return 'b';
  return changed.every((k) => afterA.includes(k)) ? 'a' : null;
};

console.log('\n[2] Each option process() reads, changed alone, rendered with warm stages, against a fresh render');
check('every option the page sends has a changed value here, and every name the lists hold, and every name process() reads, is one the page sends, the engine\'s own, a hook, an observer or a control',
  RENDER_OPTION_NAMES.every((k) => CHANGES[k] && Object.hasOwn(PAGE_DEFAULTS, k)) && Object.keys(CHANGES).length === RENDER_OPTION_NAMES.length
  && afterA.every((k) => RENDER_OPTION_NAMES.includes(k) || ENGINE_OPTION_NAMES.includes(k))
  && read.every((k) => [...RENDER_OPTION_NAMES, ...ENGINE_OPTION_NAMES, ...HOOKS, ...observers, ...CONTROLS].includes(k))
  && [...RENDER_OPTION_NAMES, ...ENGINE_OPTION_NAMES, ...HOOKS, ...observers, ...CONTROLS].every((k) => read.includes(k)),
  `${RENDER_OPTION_NAMES.length} names; after A: ${afterA.length}, after B: ${afterB.length}; read: ${read.length}`);
{
  const t2 = performance.now();
  // A stereo source, so that the capture channel matters: speech-like talk
  // on the left, other talk on the right.
  const left = voice(5, 48000, 21), right = voice(5, 48000, 22);
  const stereoSource = stereo(left, right, 48000);
  const cases = [];
  for (const baseCodec of ['steam', 'celt_22']) {
    const base = baseCodec === 'steam' ? { ...PAGE_DEFAULTS } : { ...CELT_BASE };
    for (const name of RENDER_OPTION_NAMES) {
      // celt_22 takes no other timeline than the file's own (a RangeError).
      if (name === 'timeline' && baseCodec !== 'steam') continue;
      for (const change of CHANGES[name]) {
        // On celt_22 the codec and the gate change to what the base is not
        // (celt_22 has no sender gate: gate false is its own setting).
        const c = name === 'codec' && baseCodec !== 'steam' ? { codec: 'steam' }
          : name === 'gate' && baseCodec !== 'steam' ? { gate: true } : change;
        // Another codec, or the codec skipped, on `steam`'s base: what the
        // page sends there, the file's own timing (W3-02d-1).
        const from = baseCodec === 'steam' && (name === 'codec' || name === 'enableWarble') ? { ...SOURCE_BASE } : base;
        cases.push([`${baseCodec}: ${JSON.stringify(c)}`, from, c]);
      }
    }
  }
  const all = [...cases, ...ENGINE_OPTION_CASES, ...EXTRA_OPTION_CASES];
  // Each name process() reads (the page's, the engine's own, and every name
  // on the two lists; not the hooks, observers and controls) is the one
  // option changed in at least one case.
  const alone = new Set(all.map(([, base, change]) => Object.keys(change).filter((k) => !Object.is(change[k], base[k])))
    .filter((names) => names.length === 1).map(([k]) => k));
  const names = [...new Set([...RENDER_OPTION_NAMES, ...ENGINE_OPTION_NAMES, ...afterA,
    ...read.filter((k) => ![...HOOKS, ...observers, ...CONTROLS].includes(k))])];
  check('each option process() reads, and each name on the two lists, is changed alone in a case below',
    names.every((k) => alone.has(k)), `missing: ${names.filter((k) => !alone.has(k)).join(', ') || 'none'}`);
  for (const [name, base, change, own] of all) {
    const source = own || stereoSource;
    const stages = {}, key = `stereo ${name}`;
    const first = await A.process(source, { ...base, stages, sourceKey: key });
    const opts = { ...base, ...change };
    const before = taken(stages);
    const warm = await A.process(source, { ...opts, stages, sourceKey: key });
    const got = taken(stages), place = got.b > before.b ? 'b' : got.a > before.a ? 'a' : null;
    const fresh = await A.process(source, opts);
    const want = startsFrom(base, change);
    check(`${name}: with warm stages, a fresh render's WAV and codecInfo, from ${place ? place.toUpperCase() : 'the start'}`,
      await hashes(warm) === await hashes(fresh) && place === want, `the lists say ${want ? want.toUpperCase() : 'the start'}`);
    const again = await A.process(source, { ...base, stages, sourceKey: key });
    check(`${name}: then the first settings again give their own render`, await hashes(again) === await hashes(first));
  }
  console.log(`  (${((performance.now() - t2) / 1000).toFixed(1)} s)`);
}

/* ---------------- 3. the keys ---------------- */

console.log('\n[3] The keys');
{
  // The file's own timing (W3-02d-1): the base feeds a celt_22 render
  // below, which the game's timeline refuses.
  const x = voice(4, 48000, 31), source = buffer(x, 48000), base = { ...SOURCE_BASE };
  const fresh = async (opts) => hashes(await A.process(source, opts));
  const warmed = async (key = 'k') => { const stages = {}; await A.process(source, { ...base, stages, sourceKey: key }); return stages; };

  // An option the engine does not know is in both keys.
  {
    const stages = await warmed();
    const r = await A.process(source, { ...base, zzNew: 1, stages, sourceKey: 'k' });
    const got = taken(stages);
    check('an option the engine does not know (zzNew: 1) is in both keys: neither A nor B is taken', got.a === 0 && got.b === 0
      && await hashes(r) === await fresh(base), counts(stages));
  }
  // sourceKey names the source.
  {
    const stages = await warmed('one');
    const other = voice(4, 48000, 32);
    const r = await A.process(buffer(other, 48000), { ...base, voiceScale: 0.5, stages, sourceKey: 'two' });
    check('a changed sourceKey takes nothing, even for a change read after B', taken(stages).a === 0 && taken(stages).b === 0
      && await hashes(r) === await hashes(await A.process(buffer(other, 48000), { ...base, voiceScale: 0.5 })), counts(stages));
    const s2 = await warmed('same');
    await A.process(source, { ...base, voiceScale: 0.5, stages: s2, sourceKey: 'same' });
    const b = taken(s2);
    await A.process(source, { ...base, lossPct: 15, stages: s2, sourceKey: 'same' });
    const a = taken(s2);
    check('the same samples under the same sourceKey: voiceScale changed takes B; lossPct changed takes A and not B',
      b.b === 1 && a.a === 1 && a.b === 1, counts(s2));
    const none = {};
    await A.process(source, { ...base, stages: none });
    await A.process(source, { ...base, stages: none });
    check('no sourceKey: nothing is kept', !none.a && !none.b && !none.counts);
    const s3 = await warmed('shape');
    await A.process(buffer(x.subarray(0, 48000 * 3), 48000), { ...base, voiceScale: 0.5, stages: s3, sourceKey: 'shape' });
    check('a source of another length under the same sourceKey takes nothing (the key holds its rate, length and channels)',
      taken(s3).a === 0 && taken(s3).b === 0, counts(s3));
  }
  // Function-valued options: loseMessage decides which messages are lost;
  // onDecoded and onResampled watch the decoded packets. Each makes the
  // render keep and take nothing. The observers keep the reuse.
  {
    const stages = await warmed();
    const held = counts(stages);
    const loseMessage = (k) => k % 5 === 2;
    const lose = await A.process(source, { ...base, loseMessage, stages, sourceKey: 'k' });
    check('loseMessage passed with warm stages gives the fresh render with it, and takes and keeps nothing',
      await hashes(lose) === await fresh({ ...base, loseMessage }) && counts(stages) === held && await hashes(lose) !== await fresh(base), held);
    const plain = await A.process(source, { ...base, stages, sourceKey: 'k' });
    check('then loseMessage not passed: the fresh render without it, from B', await hashes(plain) === await fresh(base) && taken(stages).b === 1,
      counts(stages));
    for (const hook of ['onDecoded', 'onResampled']) {
      let warmCalls = 0, freshCalls = 0;
      const before = counts(stages);
      await A.process(source, { ...base, [hook]: () => { warmCalls++; }, stages, sourceKey: 'k' });
      await A.process(source, { ...base, [hook]: () => { freshCalls++; } });
      check(`${hook} passed with warm stages is called as often as on a fresh render, and nothing is taken or kept`,
        warmCalls === freshCalls && warmCalls > 0 && counts(stages) === before, `${warmCalls} and ${freshCalls} calls`);
    }
    let gains = null, blocks = 0, progress = 0;
    const observed = await A.process(source, { ...base, stages, sourceKey: 'k', onGain: (g) => { gains = Float32Array.from(g); },
      onMixBlock: () => { blocks++; }, onProgress: () => { progress++; } });
    let freshGains = null, freshBlocks = 0;
    await A.process(source, { ...base, onGain: (g) => { freshGains = Float32Array.from(g); }, onMixBlock: () => { freshBlocks++; } });
    check('the observers (onProgress, onGain, onMixBlock) keep the reuse and see what a fresh render shows them',
      taken(stages).b === 2 && sameSamples(gains, freshGains) && blocks === freshBlocks && progress > 0 && await hashes(observed) === await fresh(base),
      `${blocks} mix blocks; ${counts(stages)}`);
    const other = await A.process(source, { ...base, stages, sourceKey: 'k', custom: () => 0 });
    check('any other function-valued option takes and keeps nothing', counts(stages).includes('B taken 2') && await hashes(other) === await fresh(base));
  }
  // The keys hold what JSON would lose or make equal.
  {
    const values = [undefined, null, NaN, Infinity, -Infinity, 0, -0, 1, '1', '', true, false, 1n, [], {}, [undefined], [, ], [null], [[]],
      { a: undefined }, { a: null }, { a: 1, b: 2 }, Float32Array.of(1), Float64Array.of(1), Int16Array.of(1), Float32Array.of(NaN),
      Float32Array.of(-0), Float32Array.of(0), [1], { room: { custom: { mix: 0.3 } } }, { room: { custom: { mix: 0.30000000000000004 } } },
      { room: { custom: { mix: 0.3, decay: 2 } } }, { room: { custom: { decay: 2, mix: 0.3 } } }];
    const keys = values.map((v) => A.stageKeys(source, { sourceKey: 's', thing: v }));
    const distinct = new Set(keys.map((k) => k && k.a));
    check('values JSON would make equal or drop (undefined, NaN, -0, typed arrays, holes, nested numbers) give different keys',
      keys.every(Boolean) && distinct.size === values.length - 1 && keys[31].a === keys[32].a, `${distinct.size} keys for ${values.length} values, two of them one object`);
    const instance = new (class Thing {})();
    const cycle = {}; cycle.self = cycle;
    check('a value with no key (a class\'s instance, a cycle, a symbol, a DataView, a nested function) keeps nothing',
      [instance, cycle, Symbol('s'), new DataView(new ArrayBuffer(2)), { f: () => 0 }].every((v) => A.stageKeys(source, { sourceKey: 's', thing: v }) === null));
    const stages = await warmed();
    const r = await A.process(source, { ...base, gateThresholdDb: NaN, stages, sourceKey: 'k' });
    check('NaN where the page sends undefined (gateThresholdDb, used in the codec stage) is read as undefined is, the profile\'s own: B is taken, and the render is the same',
      taken(stages).b === 1 && await hashes(r) === await fresh(base), counts(stages));
  }
  // The options are read once, at the call (the second reader's finding
  // 1): a change to the object while the render runs reaches neither the
  // render nor what it keeps.
  {
    const celt = { codec: 'celt_22', micGain: 1 }, loud = { ...base, lossPct: 60 };
    const callCelt = await fresh(celt), changedCelt = await fresh({ ...celt, bits: 4 });
    const callSteam = await fresh(base), changedSteam = await fresh(loud);
    for (const withStages of [true, false]) {
      const stages = {}, keep = withStages ? { stages, sourceKey: 'live' } : {}, how = withStages ? 'with stages' : 'without stages';
      const opts = { ...celt, ...keep };
      const p = A.process(source, opts);
      opts.bits = 4;
      const got = await hashes(await p);
      const next = withStages ? await hashes(await A.process(source, { ...celt, ...keep })) : callCelt;
      check(`celt_22, ${how}: bits set to 4 on the line after the call; the render is the call's${withStages ? ', and so is the next, from B' : ''}`,
        got === callCelt && next === callCelt && callCelt !== changedCelt && (!withStages || taken(stages).b === 1), withStages ? counts(stages) : '');
      const s2 = {}, keep2 = withStages ? { stages: s2, sourceKey: 'live' } : {};
      const live = { ...base, ...keep2 };
      let set = false;
      live.onProgress = (f) => { if (!set && f >= 0.05) { set = true; live.lossPct = 60; } };
      const steamGot = await hashes(await A.process(source, live));
      const steamNext = withStages ? await hashes(await A.process(source, { ...base, ...keep2 })) : callSteam;
      check(`steam, ${how}: lossPct set to 60 from onProgress during the render; the render is the call's${withStages ? ', and so is the next, from B' : ''}`,
        set && steamGot === callSteam && steamNext === callSteam && callSteam !== changedSteam && (!withStages || taken(s2).b === 1),
        withStages ? counts(s2) : '');
    }
  }
  // Values the keys would write alike and the engine reads differently
  // (the second reader's finding 2, each of the reader's cases): the keys
  // are made of each option as the stages use it, so each second render
  // gives what a fresh render gives (the same error, where it throws).
  {
    const outcome = async (promise) => { try { return `ok ${await hashes(await promise)}`; } catch (e) { return `${e.name}: ${e.message}`; } };
    const hiddenValueOf = (v) => Object.defineProperty({}, 'valueOf', { value: () => v });
    const ownValueOf = (v) => { const t = Float32Array.of(0); t.valueOf = () => v; return t; };
    const hiddenLoss = (o) => Object.defineProperty(o, 'lossPct', { value: 60, enumerable: false });
    class GetterOpts { constructor(keep) { this.codec = 'celt_22'; Object.assign(this, keep); } get micGain() { return 4; } }
    // The randomised run's seed 20001, step 122 (its options; a source of its shape).
    const step122 = (micGain) => ({ codec: 'celt_44', hp: 300, jitterMs: NaN, frameMs: null, micGain, retime: true, bits: 2, onMixBlock: 7,
      onProgress: 'x', gate: null, voiceScale: 1, deviceRate: NaN, captureChannel: Float32Array.of(2), seed: '7', lp: 50, onDecoded: undefined,
      gateThresholdDb: 5, maxGain: 10, lossPct: true, zzz: undefined, volume: 1, swrKernel: undefined, agc: true });
    const fuzzSource = buffer(voice(2.434, 32000, 1002), 32000);
    const pairs = [
      ['speex: lossPct {} then Object.create(null) (a fresh render throws)', source,
        (k) => ({ codec: 'speex', lossPct: {}, ...k }), (k) => ({ codec: 'speex', lossPct: Object.create(null), ...k })],
      ['steam: lossPct {} then { [Symbol.toPrimitive]: () => 60 }', source,
        (k) => ({ codec: 'steam', lossPct: {}, ...k }), (k) => ({ codec: 'steam', lossPct: { [Symbol.toPrimitive]: () => 60 }, ...k })],
      ['celt_22: micGain {} then an object whose valueOf (not enumerable) gives 3', source,
        (k) => ({ codec: 'celt_22', micGain: {}, ...k }), (k) => ({ codec: 'celt_22', micGain: hiddenValueOf(3), ...k })],
      ['speex: lossPct Float32Array.of(0) then the same with a valueOf of its own giving 70', source,
        (k) => ({ codec: 'speex', lossPct: Float32Array.of(0), ...k }), (k) => ({ codec: 'speex', lossPct: ownValueOf(70), ...k })],
      ['steam: no lossPct, then lossPct 60 as an own member that is not enumerable', source,
        (k) => ({ codec: 'steam', ...k }), (k) => hiddenLoss({ codec: 'steam', ...k })],
      ['celt_22: no micGain, then options of a class whose getter gives micGain 4', source,
        (k) => ({ codec: 'celt_22', ...k }), (k) => new GetterOpts(k)],
      ['the randomised run\'s seed 20001, step 122: micGain {} then Object.create(null) (a fresh render throws)', fuzzSource,
        (k) => ({ ...step122({}), ...k }), (k) => ({ ...step122(Object.create(null)), ...k })]
    ];
    for (const [name, src, first, second] of pairs) {
      const stages = {};
      await A.process(src, first({ stages, sourceKey: 'k' }));
      const warm = await outcome(A.process(src, second({ stages, sourceKey: 'k' })));
      const cold = await outcome(A.process(src, second({})));
      check(`${name}: the second render with warm stages gives a fresh render's outcome`, warm === cold,
        `${warm.slice(0, 48)}; ${counts(stages)}`);
    }
  }
  // A stages object the render cannot keep in (the second reader's finding
  // 4): frozen, or with counts the engine did not make. The render is made
  // from the start, keeps nothing and does not throw.
  {
    const want = await fresh(base);
    for (const [name, stages] of [['frozen', Object.freeze({})], ['{ counts: 5 }', { counts: 5 }], ['{ counts: {} }', { counts: {} }]]) {
      const before = JSON.stringify(stages);
      let got = null, error = null;
      try { got = await hashes(await A.process(source, { ...base, stages, sourceKey: 'k' })); } catch (e) { error = e; }
      check(`stages ${name}: a fresh render's WAV and codecInfo, nothing kept, no error`,
        !error && got === want && JSON.stringify(stages) === before && A.stagesHold(source, { ...base, stages, sourceKey: 'k' }) === null,
        error ? `${error.name}: ${error.message}` : JSON.stringify(stages));
    }
  }
  // Nothing kept is written to: a caller writing into what it was given (the
  // render that kept B, and a render made from it), a render stopped. With
  // them, retime, which the engine no longer reads (W3-02f): it is in both
  // keys as it is given, as any name the engine does not read is.
  {
    const rx = voice(4, 48000, 36), written = buffer(rx, 48000);
    const freshOf = async (opts) => hashes(await A.process(written, opts));
    const celt = { ...base, codec: 'celt_22', steamUptime: undefined, gate: true };
    const stages = {};
    const r1 = await A.process(written, { ...celt, stages, sourceKey: 'r' });
    r1.codecInfo.frameLog.fill(0);
    r1.codecInfo.frameBytes.fill(0);
    r1.codecInfo.modes.celt = -1;
    const r2 = await A.process(written, { ...celt, stages, sourceKey: 'r' });
    const r2Hashes = await hashes(r2);
    r2.codecInfo.frameLog.fill(0);
    r2.codecInfo.frameBytes.fill(0);
    r2.codecInfo.modes.celt = -1;
    const r3 = await A.process(written, { ...celt, stages, sourceKey: 'r' });
    check('a caller writing into a render\'s codecInfo, the render that kept B and one made from it, changes nothing kept (the frame path: three renders, B reused by each after the first, 2 times)',
      taken(stages).b === 2 && r2Hashes === await freshOf(celt) && await hashes(r3) === await freshOf(celt), counts(stages));
    const steamStages = {};
    await A.process(written, { ...base, stages: steamStages, sourceKey: 'r' });
    const s1 = await A.process(written, { ...base, stages: steamStages, sourceKey: 'r' });
    const s1Hashes = await hashes(s1);
    s1.codecInfo.frameLog.fill(0);
    s1.codecInfo.sender.spurts.length = 0;
    const s2 = await A.process(written, { ...base, stages: steamStages, sourceKey: 'r' });
    check('the same on `steam`: a caller\'s writes change nothing kept (three renders, B reused by each after the first, 2 times)', taken(steamStages).b === 2
      && s1Hashes === await freshOf(base) && await hashes(s2) === await freshOf(base), counts(steamStages));
    // retime with warm stages of the same source, on both paths: neither A nor
    // B is taken, and the render is a fresh render's and the render without it.
    const unread = [];
    for (const [name, opts] of [['celt_22', celt], ['steam', base]]) {
      const warm = {};
      await A.process(written, { ...opts, stages: warm, sourceKey: 'u' });
      const r = await A.process(written, { ...opts, retime: true, stages: warm, sourceKey: 'u' });
      const got = taken(warm), h = await hashes(r);
      const same = h === await freshOf({ ...opts, retime: true }) && h === await freshOf(opts);
      unread.push({ name, ok: got.a === 0 && got.b === 0 && same, same, counts: counts(warm) });
    }
    check('retime, which the engine no longer reads, with warm stages of the same source: neither A nor B is taken, and the render is a fresh render\'s and the render without it (celt_22 and `steam`)',
      unread.every((u) => u.ok), unread.map((u) => `${u.name}: ${u.same ? 'as fresh' : 'differs'}, ${u.counts}`).join('; '));
    // steam's B keeps the sender's messages without their pcm, the encoder's
    // input, which nothing after B reads (the second reader's finding 5).
    const messages = steamStages.b.value.messages;
    check('`steam`\'s B holds its messages without their pcm, and the renders from it above are fresh renders\'',
      messages.length > 0 && messages.every((m) => !('pcm' in m)) && messages.some((m) => m.spurt !== undefined),
      `${messages.length} messages`);
    // A render stopped part way (opts.signal): it ends with an AbortError; A,
    // finished before the stop, is kept, and the next render takes it.
    const stopped = {}, signal = { aborted: false };
    let error = null;
    try {
      await A.process(source, { ...base, stages: stopped, sourceKey: 'k', signal, onProgress: (f) => { if (f >= 0.3) signal.aborted = true; } });
    } catch (e) { error = e; }
    const keptA = !!stopped.a, keptB = !!stopped.b;
    const next = await A.process(source, { ...base, stages: stopped, sourceKey: 'k', signal: { aborted: false } });
    check('a render stopped by its signal in the codec stage ends with an AbortError, A kept and B not; the next takes A and gives the fresh render',
      error && error.name === 'AbortError' && keptA && !keptB && taken(stopped).a === 1 && await hashes(next) === await fresh(base),
      `${error && error.name}; ${counts(stopped)}`);
    let early = null;
    try { await A.process(source, { ...base, signal: { aborted: true } }); } catch (e) { early = e; }
    check('a render whose signal is already set does not start', early && early.name === 'AbortError');
  }
}

/* ---------------- 4. the first seconds (step 3) ---------------- */

console.log('\n[4] The first 14 s of a render of the first 15 s are the whole render\'s');
{
  const t4 = performance.now();
  const rate = 48000, head = (x, s) => x.subarray(0, s * rate);
  // The first 14 s of the output of a render of the source's first 15 s,
  // against the render of the whole source: where they first differ, or -1.
  const firstDiffer = async (left, right, opts) => {
    const whole = await A.process(right ? stereo(left, right, rate) : buffer(left, rate), opts);
    const part = await A.process(right ? stereo(head(left, 15), head(right, 15), rate) : buffer(head(left, 15), rate), opts);
    const n = 14 * whole.sampleRate;
    if (part.samples.length < n || whole.samples.length < n) return -2;
    for (let i = 0; i < n; i++) if (!Object.is(part.samples[i], whole.samples[i])) return i;
    return -1;
  };
  const clips = [41, 42, 43].map((seed) => voice(32, rate, seed));
  for (const codec of ['steam', 'steam_48', 'celt_22', 'celt_44', 'speex', 'miles']) {
    const opts = codec === 'steam' ? { ...PAGE_DEFAULTS } : { ...SOURCE_BASE, codec, steamUptime: undefined };
    const at = [];
    for (const clip of clips) at.push(await firstDiffer(clip, null, opts));
    check(`${codec}: on three seeded 32 s clips, the first 14 s of the render of the first 15 s are the whole render's`,
      at.every((i) => i === -1) && A.previewAllowed(opts), at.every((i) => i === -1) ? 'sample for sample' : `first differing sample ${at.join(', ')}`);
  }
  // The page's settings that previewAllowed() allows, one at a time.
  const right = voice(32, rate, 44);
  for (const change of [{ gate: false }, { gate: true }, { gateThresholdDb: -30 }, { steamUptime: 14400 }, { bits: 6 }, { micGain: 3 }, { hp: 300, lp: 3000 },
    { agc: false }, { voiceScale: 2 }, { maxGain: 3 }, { avgGain: 0.25 }, { volume: 0.5 }, { deviceRate: 44100 }, { enableWarble: false },
    { timeline: 'source', fps: undefined, bufferMs: undefined }, { timeline: 'game', fps: 66.67 },
    { frameMs: 60 }, { captureChannel: 'right' }, { captureChannel: 'mix' }, { codec: 'celt_22', steamUptime: undefined, gate: true, voiceScale: 2 }]) {
    // The codec skipped and celt_22 on the file's own timing, as the page sends them (W3-02d-1).
    const opts = { ...(change.enableWarble === false || change.codec ? SOURCE_BASE : PAGE_DEFAULTS), ...change };
    const at = await firstDiffer(clips[0], change.captureChannel ? right : null, opts);
    check(`${JSON.stringify(change)}: the first 14 s are the whole render's, and the first seconds are allowed`, at === -1 && A.previewAllowed(opts),
      at === -1 ? 'sample for sample' : `first differing sample ${at}`);
  }
  // Nothing else is allowed.
  const refused = [{ lossPct: 5 }, { jitterMs: 50 }, { room: { preset: 6 } }, { underwater: true },
    { room: { custom: { duration: 1, decay: 2, mix: 0.3 } } }, { room: { auto: 'tunnel' } }, { deviceRate: 96000 },
    { received: { frameLog: [2], frameBytes: [60], frameMs: 20, spurts: 1 } }, { loseMessage: () => false }, { arriveAt: (t) => t }];
  check('previewAllowed() allows nothing else: loss, jitter, a room, under water, an untested device rate, a demo\'s voice, loseMessage, arriveAt; retime, which the engine no longer reads, is allowed',
    refused.every((change) => !A.previewAllowed({ ...PAGE_DEFAULTS, ...change })) && A.previewAllowed({ ...PAGE_DEFAULTS, room: { preset: 0 } })
    && A.previewAllowed({ ...SOURCE_BASE, retime: true }),
    `${refused.length} refused; a room number that is no room is allowed; { ...SOURCE_BASE, retime: true } ${A.previewAllowed({ ...SOURCE_BASE, retime: true }) ? 'allowed' : 'refused'}`);
  console.log(`  (${((performance.now() - t4) / 1000).toFixed(1)} s)`);
}

console.log(`\n${passed} stages checks passed, ${failed} failed`);
if (failed) process.exitCode = 1;
