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
// TF2_DIR points the page's files and the loads at a copy of the sources.
// Every signal is synthetic, made here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ENGINE_FILES, HANDED, TABLES, loadEngine, sourceRoot } from './lib/engine.cjs';

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
