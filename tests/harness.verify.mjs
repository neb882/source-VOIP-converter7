// The tests' one engine loader (tests/lib/engine.cjs) against the page.
//
//   node tests/harness.verify.mjs
//
// 1. Its list of the engine's files is, in order, the page's first script
//    tags, live-worker.js's importScripts and the head of audio-worker.js's.
// 2. Its table names are constants.js's top-level declarations.
// 3. No other file under tests/ names audio.js or constants.js in a quoted
//    string, but the few places listed below with their reason: the list
//    stays one list.
// 4. to 6. A load's codec module is its own, the engine takes a new one at
//    its next render and the old one again once it is set back, and a load
//    without the room module stops a render with a room as the page would.
// 7. A load leaves no engine name on Node's global object but the two it is
//    known to leave.
// 8. An engine file that uses one of Node's globals does not load.
// 9. to 14., run after 3 and before 4: the engine's own files (PART_FILES,
//    under engine/), whose code was moved out of audio.js unedited (S3-02).
//    Each file is one function that adds its own part to TF2Engine and
//    nothing at its top level; the files load nothing, the folder holds
//    exactly them, and TF2Engine is named only where it should be; TF2Audio
//    keeps its members in their order; every name a file takes from a part
//    is there and comes from an earlier file; a load has one frozen part for
//    each file; two loads have parts of their own, and neither is left on
//    Node's global object. Text is read, not parsed; the checks that read
//    only text come first, so a file they find wrong is named before a load
//    of it can stop the suite. With no file under engine/ they hold at once.
//    Check 3 also refuses a quoted engine/<name>.js under tests/.
// TF2_DIR points the page's files and the loads at a copy of the sources.
// Every signal is synthetic, made here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ENGINE_FILES, PART_DIR, PART_FILES, HANDED, TABLES, loadEngine, sourceRoot } from './lib/engine.cjs';
import { siteFiles, stripComments } from './lib/site-files.cjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = sourceRoot();
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `   [${detail}]` : ''}`);
}
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const quoted = (text) => [...text.matchAll(/'([^'\n]*)'/g)].map((m) => m[1]);

console.log('\n[1] The list of the engine\'s files is the page\'s and the workers\'');
{
  // Every script tag that has a src, found loosely, must be one this check
  // reads (<script src="...">): a tag in another form fails here, named,
  // rather than being skipped.
  const withSrc = [...read('index.html').matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]).filter((t) => /\ssrc\s*=/i.test(t));
  const tags = withSrc.map((t) => (t.match(/^<script\s+src="([^"]+)"/) || [])[1]);
  const unread = withSrc.filter((t, i) => tags[i] === undefined);
  check('index.html\'s first script tags are the list, in order', unread.length === 0 && same(tags.slice(0, ENGINE_FILES.length), ENGINE_FILES),
    unread.length ? `script tags this check cannot read: ${unread.join(' ')}` : tags.slice(0, ENGINE_FILES.length).join(', '));
  const imports = (file) => {
    const m = read(file).match(/importScripts\(([^)]*)\)/);
    return m ? quoted(m[1]) : [];
  };
  const live = imports('live-worker.js'), worker = imports('audio-worker.js');
  check('live-worker.js imports the list and nothing else, in order', same(live, ENGINE_FILES), live.join(', '));
  check('audio-worker.js imports the list first, in order', same(worker.slice(0, ENGINE_FILES.length), ENGINE_FILES),
    worker.slice(0, ENGINE_FILES.length).join(', '));
  check('the files handed in by name are in the list', Object.keys(HANDED).every((f) => ENGINE_FILES.includes(f)),
    Object.keys(HANDED).join(', '));
}

console.log('\n[2] The tables a load returns are constants.js\'s');
{
  const declared = [...read('constants.js').matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  check('the helper\'s table names are the top-level declarations of constants.js', same([...declared].sort(), [...TABLES].sort()),
    declared.join(', '));
}

console.log('\n[3] No suite holds its own list of the engine\'s files');
{
  // Each place allowed to name one of the two files, and why.
  const allowed = [
    { file: 'accuracy.mjs', name: null, why: 'MODEL_FILES: the files a registered prediction is hashed with' },
    { file: 'room-dsp.verify.mjs', name: 'constants.js', why: 'constants.js alone, for the rooms\' names' },
    { file: 'harness.verify.mjs', name: null, why: 'this suite' },
    { file: path.join('lib', 'engine.cjs'), name: null, why: 'the list' },
  ];
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(p); } else if (/\.(c|m)?js$/.test(entry.name)) files.push(p);
    }
  };
  walk(here);
  const found = [];
  for (const file of files) {
    const rel = path.relative(here, file);
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/(['"`])((?:[^'"`\n]*\/)?(audio|constants)\.js)\1/g)) {
        const name = path.basename(m[2]);
        if (!allowed.some((a) => a.file === rel && (a.name === null || a.name === name))) found.push(`${rel}:${i + 1} ${m[0]}`);
      }
    });
  }
  check(`no file under tests/ but the ${allowed.length} allowed names audio.js or constants.js in a quoted string`,
    files.length > 20 && found.length === 0, found.join('; ') || `${files.length} files read`);
  // The engine's own files are named in the helper only (PART_FILES).
  const parts = [];
  for (const file of files) {
    const rel = path.relative(here, file);
    if (rel === path.join('lib', 'engine.cjs')) continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/(['"`])((?:[^'"`\n]*\/)?engine\/[^'"`\n\/]+\.js)\1/g)) parts.push(`${rel}:${i + 1} ${m[0]}`);
    });
  }
  check('no file under tests/ but the helper names a file of engine/ in a quoted string', files.length > 20 && parts.length === 0,
    parts.join('; ') || `${files.length} files read`);
}

// A short render through `steam`, the codec module given.
const opus = await import(pathToFileURL(path.join(root, 'opus-codec.mjs')).href);
const rate = 48000;
const toneOf = (seconds) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => .25 * Math.sin(2 * Math.PI * 440 * i / rate));
const buffer = (data) => ({ sampleRate: rate, length: data.length, numberOfChannels: 1, getChannelData: () => data });
const counting = () => {
  const c = { calls: 0 };
  c.module = { ...opus, steamRoundTrip: (...args) => { c.calls++; return opus.steamRoundTrip(...args); } };
  return c;
};

// ---- The engine's own files (S3-02): engine/<name>.js gives the part <name>, in camel case.
const partOf = (file) => path.basename(file, '.js').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const lineAt = (text, index) => text.slice(0, index).split('\n').length;
// One load for checks 11 to 13; a load that throws is a failure of 11, after the checks that read only text.
let loaded = null, loadError = '';
try { loaded = loadEngine({ root }); } catch (error) { loadError = error.message; }

console.log('\n[9] Each engine file is one function that adds its own part, and nothing at its top level');
{
  const OPEN = ['(function (root) {', '  \'use strict\';'];
  const CLOSE = '})((typeof window !== \'undefined\' ? window : typeof self !== \'undefined\' ? self : globalThis));';
  const problems = [];
  PART_FILES.forEach((file, n) => {
    const text = read(file), part = partOf(file);
    // After the head comment, the function and nothing else.
    const code = text.replace(/^\/\*[\s\S]*?\*\/\n/, '').replace(/\n$/, '');
    const lines = code.split('\n');
    const own = n === 0 ? '  const E = root.TF2Engine = {};' : '  const E = root.TF2Engine;';
    if (lines[0] !== OPEN[0] || lines[1] !== OPEN[1]) problems.push(`${file}: does not open with "${OPEN[0]}" and "${OPEN[1].trim()}" after its head comment`);
    if (lines[2] !== own) problems.push(`${file}: its third line is not "${own.trim()}"`);
    if (lines[lines.length - 1] !== CLOSE) problems.push(`${file}: its last line is not the call that attaches it to window, else self, else globalThis`);
    lines.slice(1, -1).forEach((l, i) => {
      if (l.trim() && !l.startsWith('  ')) problems.push(`${file}: a line outside the function, after its head comment: ${i + 2}: ${l.slice(0, 80)}`);
      if (/^ {2}(let|var) /.test(l)) problems.push(`${file}: a ${l.trim().split(' ')[0]} at the function's top, after its head comment: ${i + 2}`);
    });
    const stripped = stripComments(text);
    const sets = [...stripped.matchAll(/\bE\s*\.\s*([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map((m) => m[1]);
    if (sets.length !== 1 || sets[0] !== part) problems.push(`${file}: sets ${sets.length ? sets.map((s) => `E.${s}`).join(', ') : 'no part'}, not E.${part} once`);
    if (!stripped.includes(`\n  E.${part} = Object.freeze({`)) problems.push(`${file}: does not set E.${part} = Object.freeze({ ... })`);
    const engines = [...stripped.matchAll(/\bTF2Engine\s*=(?!=)/g)].length;
    if (engines !== (n === 0 ? 1 : 0)) problems.push(`${file}: assigns TF2Engine ${engines} times; the first file does once, the others never`);
    if (/\bE\s*\[/.test(stripped)) problems.push(`${file}: reaches into TF2Engine by a computed name`);
  });
  check('each engine file opens with (function (root) { and \'use strict\', sets its own part once, sets no other, and has no let or var at its top',
    problems.length === 0, problems.join('; ') || `${PART_FILES.length} files: ${PART_FILES.join(', ') || 'none yet'}`);
}

console.log('\n[10] The engine files load nothing and touch no page, the folder holds exactly them, and TF2Engine is named only where it should be');
{
  const FORMS = [['import(', /\bimport\s*\(/], ['importScripts', /\bimportScripts\b/], ['new Worker', /\bnew\s+Worker\b/],
    ['new URL(', /\bnew\s+URL\s*\(/], ['fetch(', /\bfetch\s*\(/], ['require(', /\brequire\s*\(/], ['document', /\bdocument\b/]];
  const found = [];
  for (const file of PART_FILES) {
    stripComments(read(file)).split('\n').forEach((line, i) => {
      for (const [name, re] of FORMS) if (re.test(line)) found.push(`${file}:${i + 1}: ${name}`);
    });
  }
  check('no engine file holds import(, importScripts, new Worker, new URL(, fetch(, require( or document, its comments taken out',
    found.length === 0, found.join('; ') || `${PART_FILES.length} files read`);
  const shipped = siteFiles(root).files.filter((f) => !f.startsWith(`${PART_DIR}/`) && f !== 'audio.js');
  const named = shipped.filter((f) => fs.readFileSync(path.join(root, f)).includes('TF2Engine'));
  check(`no shipped file outside ${PART_DIR}/ and audio.js names TF2Engine`, shipped.length > 20 && named.length === 0,
    named.join(', ') || `${shipped.length} files read`);
  const tests = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(p); } else if (/\.(c|m)?js$/.test(entry.name)) tests.push(p);
    }
  };
  walk(here);
  const own = [path.join('lib', 'engine.cjs'), path.basename(fileURLToPath(import.meta.url))];
  const inTests = tests.map((f) => path.relative(here, f)).filter((f) => !own.includes(f) && fs.readFileSync(path.join(here, f), 'utf8').includes('TF2Engine'));
  check('no file under tests/ but the helper and this suite names TF2Engine', tests.length > 20 && inTests.length === 0,
    inTests.join(', ') || `${tests.length} files read`);
  // The folder holds exactly the engine files.
  const inFolder = [];
  const walkFolder = (dir) => {
    if (!fs.existsSync(path.join(root, dir))) return;
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walkFolder(rel); else inFolder.push(rel);
    }
  };
  walkFolder(PART_DIR);
  check(`the folder ${PART_DIR}/ holds exactly the engine files`, same([...inFolder].sort(), [...PART_FILES].sort()),
    `${PART_DIR}/: ${inFolder.join(', ') || 'nothing'}`);
}

console.log('\n[11] TF2Audio keeps its members, in their order');
{
  // Recorded when audio.js was split (S3-02a): the split changes none of them.
  const MEMBERS = ['process', 'stagesHold', 'stageKeys', 'STAGE_OPTIONS', 'previewAllowed', 'encodeWav', 'toInt16',
    'bufferToMono', 'resampleSinc', 'resampleLinear', 'firwin2', 'applyFirZeroPhase', 'hardClip', 'receiverAutoGain',
    'createGain', 'decodedFromFrames', 'biquadCoefs', 'applyBiquad', 'mulberry32', 'buildLossMask', 'realOpusRoundTrip',
    'createLiveChain', 'createRender', 'roomPreset', 'streamResampleSinc', 'streamFir', 'streamAutoGain', 'streamLossMask',
    'steamGiveOut', 'steamMessageLoss', 'steamFits', 'mixEntry', 'mixUpsample2', 'mixOut', 'mixClip', 'mixDevicePosition',
    'createDeviceStage', 'createOutputStage'];
  const keys = Object.keys((loaded && loaded.audio) || {});
  if (!loaded) check('the engine loads', false, loadError);
  check(`TF2Audio's members are the ${MEMBERS.length} recorded, in order`, same(keys, MEMBERS),
    same(keys, MEMBERS) ? `${keys.length} members` : `missing: ${MEMBERS.filter((k) => !keys.includes(k)).join(', ') || 'none'}; `
      + `not recorded: ${keys.filter((k) => !MEMBERS.includes(k)).join(', ') || 'none'}; order: ${keys.join(', ')}`);
  const stageOptions = Object.keys((loaded && loaded.audio && loaded.audio.STAGE_OPTIONS) || {});
  check('STAGE_OPTIONS has afterB, afterA, observers and read, in order', same(stageOptions, ['afterB', 'afterA', 'observers', 'read']),
    stageOptions.join(', '));
}

console.log('\n[12] What a file takes from a part, an earlier file gives');
{
  const problems = [];
  let taken = 0;
  for (const file of [...PART_FILES, 'audio.js']) {
    const stripped = stripComments(read(file));
    for (const m of stripped.matchAll(/\bconst\s*\{([^}]*)\}\s*=\s*E\s*\.\s*([A-Za-z_$][\w$]*)\s*;/g)) {
      const giver = m[2], from = PART_FILES.find((f) => partOf(f) === giver);
      const at = `${file}:${lineAt(stripped, m.index)}`;
      if (!from || ENGINE_FILES.indexOf(from) >= ENGINE_FILES.indexOf(file)) problems.push(`${at}: takes from E.${giver}, which no earlier engine file gives`);
      const part = loaded && loaded.parts && loaded.parts[giver];
      for (const name of m[1].split(',').map((x) => x.split(':')[0].trim()).filter(Boolean)) {
        taken++;
        if (!part || !Object.prototype.hasOwnProperty.call(part, name)) problems.push(`${at}: ${name} is not in E.${giver} of a loaded engine`);
      }
    }
  }
  check('every const { ... } = E.<part>; in the engine files and audio.js names an earlier file\'s part, and each name is an own key of it',
    problems.length === 0, problems.join('; ') || `${taken} names taken`);
}

console.log('\n[13] A load has one frozen part for each engine file');
{
  if (!PART_FILES.length) {
    check('with no engine file listed, a load has no parts', loaded !== null && loaded.parts === undefined, loaded ? String(loaded.parts) : loadError);
  } else {
    // audio.js gives a part too (the codec module's loader) when an engine file calls into it.
    const callsAudio = PART_FILES.some((f) => /\bE\s*\.\s*audio\b/.test(stripComments(read(f))));
    const expected = [...PART_FILES.map(partOf), ...(callsAudio ? ['audio'] : [])].sort();
    const have = Object.keys((loaded && loaded.parts) || {}).sort();
    const thawed = have.filter((p) => !Object.isFrozen(loaded.parts[p]));
    check(`the parts are one for each engine file${callsAudio ? ', and audio' : ''}, each frozen`, same(have, expected) && thawed.length === 0,
      `${have.join(', ')}${thawed.length ? `; not frozen: ${thawed.join(', ')}` : ''}${same(have, expected) ? '' : `; expected ${expected.join(', ')}`}`);
  }
}

console.log('\n[14] Two loads have parts of their own, and neither is left on Node\'s global object');
{
  const moduleA = { ...opus }, moduleB = { ...opus };
  let a = {}, b = {};
  try { a = loadEngine({ root, codec: moduleA }); b = loadEngine({ root, codec: moduleB }); } catch (error) { check('two loads', false, error.message); }
  if (!PART_FILES.length) {
    check('with no engine file listed, neither load has parts', a.parts === undefined && b.parts === undefined);
  } else {
    const shared = Object.keys(a.parts || {}).filter((p) => b.parts && a.parts[p] === b.parts[p]);
    check('two loads have different TF2Engine objects and share no part', !!a.parts && !!b.parts && a.parts !== b.parts && shared.length === 0,
      shared.length ? `shared: ${shared.join(', ')}` : Object.keys(a.parts || {}).join(', '));
  }
  check('after both loads the process has no global TF2Engine', !('TF2Engine' in globalThis));
  if (a.parts && a.parts.codec) {
    const [ma, mb] = [await a.parts.codec.loadOpusModule(), await b.parts.codec.loadOpusModule()];
    check('each load\'s parts.codec.loadOpusModule() gives the module that load was given', ma === moduleA && mb === moduleB,
      `${ma === moduleA ? 'a: its own' : 'a: another'}; ${mb === moduleB ? 'b: its own' : 'b: another'}`);
  }
}

console.log('\n[4] Each load has its own codec module');
{
  const a = counting(), b = counting();
  const withCodec = loadEngine({ root, codec: a.module }), without = loadEngine({ root });
  check('a load given a module has it; one given none has none', withCodec.codec === a.module && without.codec === undefined);
  without.codec = b.module;
  check('setting one load\'s module leaves the other\'s', withCodec.codec === a.module && without.codec === b.module);
  withCodec.codec = undefined;
  check('and setting it back leaves the other\'s too', withCodec.codec === undefined && without.codec === b.module);
}

console.log('\n[5] The module set through `codec` is the one the next render calls');
{
  const a = counting(), b = counting();
  const engine = loadEngine({ root, codec: a.module });
  const x = toneOf(.3), opts = { codec: 'steam' };
  await engine.audio.process(buffer(x), opts);
  const first = [a.calls, b.calls];
  engine.codec = b.module;
  await engine.audio.process(buffer(x), opts);
  const second = [a.calls, b.calls];
  engine.codec = a.module;
  await engine.audio.process(buffer(x), opts);
  const third = [a.calls, b.calls];
  check('the first render calls the module given at the load', first[0] > 0 && first[1] === 0, first.join(' / '));
  check('after `codec` is set, the next render calls the new module and not the old', second[0] === first[0] && second[1] === first[0],
    second.join(' / '));
  check('set back, the next render calls the first module again', third[0] === 2 * first[0] && third[1] === first[0], third.join(' / '));
}

console.log('\n[6] A load without the room module stops a render with a room');
{
  const x = toneOf(.3), opts = { codec: 'none', room: { preset: 2 } };
  const bare = loadEngine({ root, codec: opus, TF2Room: null, TF2_ROOM_PRESETS: null });
  let message = '';
  try { await bare.audio.process(buffer(x), opts); } catch (e) { message = e.message; }
  check('with TF2Room null, a render with a room stops with the engine\'s own message', /needs room-dsp\.js \(TF2Room\)/.test(message), message);
  const full = loadEngine({ root, codec: opus });
  const r = await full.audio.process(buffer(x), opts);
  check('with the default, it renders', r.samples.length > x.length && r.codecInfo.room != null, `${r.samples.length} samples`);
}

console.log('\n[7] What a load leaves on Node\'s global object');
{
  loadEngine({ root });
  check('TF2Audio and the tables are not globals of the process',
    !('TF2Audio' in globalThis) && TABLES.every((t) => !(t in globalThis)));
  check('TF2SteamSender and TF2Swresample are (they attach themselves, as on the page)',
    typeof globalThis.TF2SteamSender === 'object' && typeof globalThis.TF2Swresample === 'object');
}

console.log('\n[8] An engine file that uses one of Node\'s globals does not load');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf2-harness-'));
  try {
    for (const f of ENGINE_FILES) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.copyFileSync(path.join(root, f), path.join(dir, f));
    }
    let error = null;
    try { loadEngine({ root: dir }); } catch (e) { error = e; }
    check('an untouched copy of the files loads', error === null, error ? error.message : '');
    const last = ENGINE_FILES[ENGINE_FILES.length - 1];
    fs.writeFileSync(path.join(dir, last), `Buffer.from('a');\n${fs.readFileSync(path.join(dir, last), 'utf8')}`);
    error = null;
    try { loadEngine({ root: dir }); } catch (e) { error = e; }
    check(`a copy whose ${last} calls Buffer.from at its top level does not load`, error !== null, error ? error.message : 'it loaded');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}


console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
