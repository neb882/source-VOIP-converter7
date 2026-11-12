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
//      checks the list against the page's renderOptions()), changed alone
//      and rendered with warm stages, gives a fresh render's hashes, starting
//      from the place its lists say; then the first settings again give
//      theirs (nothing kept was written to);
//   3. the keys: an option the engine does not know, a changed sourceKey,
//      function-valued options (loseMessage decides, onDecoded and
//      onResampled watch an early stage: nothing is kept or taken; the
//      observers keep the reuse), values JSON would make equal, a caller
//      writing into what it was given, a render stopped part way;
// A later order adds its case to EXTRA_OPTION_CASES (section 2).
// Every signal is synthetic, made here or in render-stream.verify.mjs.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.env.TF2_DIR ? pathToFileURL(path.resolve(process.env.TF2_DIR) + '/') : new URL('..', import.meta.url);
const engineCode = ['constants.js', 'steam-sender.js', 'vendor/swresample/swresample.js', 'audio.js'].map(f => fs.readFileSync(new URL(f, root), 'utf8')).join('\n');
const TF2Opus = await import(new URL('opus-codec.mjs', root).href);
const requireHere = createRequire(import.meta.url);
const roomModule = requireHere(fileURLToPath(new URL('room-dsp.js', root)));
const roomTable = requireHere(fileURLToPath(new URL('room-presets.js', root)));

// The engine as tests/render-stream.verify.mjs loads it: constants.js and
// audio.js in one function of this realm, no timers, the codec module and
// the room module injected.
const window = {};
const tables = new Function('window', 'TF2Opus', 'setTimeout', 'self', 'module', 'TF2Room', 'TF2_ROOM_PRESETS',
  `${engineCode}\nreturn { CODEC_PROFILES, VOICE_ENGINE };`)(window, TF2Opus, undefined, undefined, undefined, roomModule, roomTable);
const engine = { audio: window.TF2Audio, ...tables }, A = engine.audio;
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
const { CASES, GOLDEN, voice } = new Function('engine', 'roomModule', 'roomTable', `${streamText.slice(from, to)}\nreturn { CASES, GOLDEN, voice };`)(
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
// changed value for each (two for some).
const RENDER_OPTION_NAMES = ['codec', 'room', 'underwater', 'captureChannel', 'micGain', 'voiceScale', 'hp', 'lp', 'bits', 'agc', 'retime',
  'maxGain', 'avgGain', 'gate', 'gateThresholdDb', 'steamUptime', 'volume', 'deviceRate', 'lossPct', 'frameMs', 'enableWarble', 'jitterMs'];
const PAGE_DEFAULTS = { codec: 'steam', room: null, underwater: false, captureChannel: 'left', micGain: 1, voiceScale: 1, hp: 0, lp: 20000,
  bits: 16, agc: true, retime: false, maxGain: 10, avgGain: 0.5, gate: null, gateThresholdDb: undefined, steamUptime: 777600, volume: 1,
  deviceRate: 48000, lossPct: 0, frameMs: 20, enableWarble: true, jitterMs: 0 };
const CHANGES = {
  codec: [{ codec: 'celt_22', steamUptime: undefined }, { codec: 'miles', steamUptime: undefined }],
  room: [{ room: { preset: 6 } }, { room: { custom: { duration: 1, decay: 2, mix: 0.3 } } }],
  underwater: [{ underwater: true }],
  captureChannel: [{ captureChannel: 'right' }, { captureChannel: 'mix' }],
  micGain: [{ micGain: 3 }],
  voiceScale: [{ voiceScale: 0.5 }],
  hp: [{ hp: 300 }],
  lp: [{ lp: 3000 }],
  bits: [{ bits: 8 }],
  agc: [{ agc: false }],
  retime: [{ retime: true }],
  maxGain: [{ maxGain: 3 }],
  avgGain: [{ avgGain: 0.25 }],
  gate: [{ gate: false }],
  gateThresholdDb: [{ gateThresholdDb: -30 }],
  steamUptime: [{ steamUptime: 14400 }],
  volume: [{ volume: 0.5 }],
  deviceRate: [{ deviceRate: 44100 }],
  lossPct: [{ lossPct: 15 }],
  frameMs: [{ frameMs: 60, lossPct: 15 }],
  enableWarble: [{ enableWarble: false }],
  jitterMs: [{ jitterMs: 100 }]
};
// A later order's case: [name, base options, changed options] (W3-02c-2
// adds its timeline here).
const EXTRA_OPTION_CASES = [];
// Where a render with `change` should start from, by the lists: B when every
// option changed is read only after B, A when only after A, else neither.
const { afterA, afterB } = A.STAGE_OPTIONS;
const startsFrom = (base, change) => {
  const changed = Object.keys(change).filter((k) => !Object.is(change[k], base[k]));
  const coded = (change.enableWarble ?? base.enableWarble) !== false && !(change.received ?? base.received);
  if (coded && changed.every((k) => afterB.includes(k))) return 'b';
  return changed.every((k) => afterA.includes(k)) ? 'a' : null;
};

console.log('\n[2] Each option the page sends, changed alone, rendered with warm stages, against a fresh render');
check('every option the page sends has a changed value here, and every name the lists hold is one the page sends or the engine\'s own',
  RENDER_OPTION_NAMES.every((k) => CHANGES[k] && Object.hasOwn(PAGE_DEFAULTS, k)) && Object.keys(CHANGES).length === RENDER_OPTION_NAMES.length
  && afterA.every((k) => RENDER_OPTION_NAMES.includes(k) || ['listenerPos', 'dspRoom', 'customEnv', 'seed'].includes(k)),
  `${RENDER_OPTION_NAMES.length} names; after A: ${afterA.length}, after B: ${afterB.length}`);
{
  const t2 = performance.now();
  // A stereo source, so that the capture channel matters: speech-like talk
  // on the left, other talk on the right.
  const left = voice(5, 48000, 21), right = voice(5, 48000, 22);
  const source = stereo(left, right, 48000);
  const cases = [];
  for (const baseCodec of ['steam', 'celt_22']) {
    const base = baseCodec === 'steam' ? { ...PAGE_DEFAULTS } : { ...PAGE_DEFAULTS, codec: 'celt_22', steamUptime: undefined };
    for (const name of RENDER_OPTION_NAMES) {
      for (const change of CHANGES[name]) {
        const c = name === 'codec' && baseCodec !== 'steam' ? { codec: 'steam', steamUptime: 777600 } : change;
        cases.push([`${baseCodec}: ${JSON.stringify(c)}`, base, c]);
      }
    }
  }
  for (const [name, base, change] of [...cases, ...EXTRA_OPTION_CASES]) {
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
  const x = voice(4, 48000, 31), source = buffer(x, 48000), base = { ...PAGE_DEFAULTS };
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
    check('NaN where the page sends undefined (gateThresholdDb, read in the codec stage) is another B key: A is taken, B is not, and the render is the same',
      taken(stages).a === 1 && taken(stages).b === 0 && await hashes(r) === await fresh(base), counts(stages));
  }
  // Nothing kept is written to: a caller writing into what it was given,
  // re-timing (which works in place), a render stopped. On a source whose
  // re-timing moves a spurt on both paths.
  {
    const rx = voice(4, 48000, 36), retimable = buffer(rx, 48000);
    const freshOf = async (opts) => hashes(await A.process(retimable, opts));
    const celt = { ...base, codec: 'celt_22', steamUptime: undefined, gate: true };
    const stages = {};
    const r1 = await A.process(retimable, { ...celt, stages, sourceKey: 'r' });
    r1.codecInfo.frameLog.fill(0);
    r1.codecInfo.frameBytes.fill(0);
    r1.codecInfo.modes.celt = -1;
    const retimed = await A.process(retimable, { ...celt, retime: true, stages, sourceKey: 'r' });
    const r2 = await A.process(retimable, { ...celt, stages, sourceKey: 'r' });
    check('a caller writing into a render\'s codecInfo, and re-timing in place, change nothing kept (the frame path, from B)',
      taken(stages).b === 2 && await hashes(r2) === await freshOf(celt) && await hashes(retimed) === await freshOf({ ...celt, retime: true })
      && retimed.codecInfo.retimed.length > 0, `${retimed.codecInfo.retimed.length} spurt moved; ${counts(stages)}`);
    const steamStages = {};
    await A.process(retimable, { ...base, stages: steamStages, sourceKey: 'r' });
    const s1 = await A.process(retimable, { ...base, retime: true, stages: steamStages, sourceKey: 'r' });
    const s1Hashes = await hashes(s1);
    s1.codecInfo.frameLog.fill(0);
    s1.codecInfo.sender.spurts.length = 0;
    const s2 = await A.process(retimable, { ...base, stages: steamStages, sourceKey: 'r' });
    check('the same on `steam`: re-timing and a caller\'s writes change nothing kept', taken(steamStages).b === 2 && s1.codecInfo.retimed.length > 0
      && await hashes(s2) === await freshOf(base) && s1Hashes === await freshOf({ ...base, retime: true }), counts(steamStages));
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

console.log(`\n${passed} stages checks passed, ${failed} failed`);
if (failed) process.exitCode = 1;
