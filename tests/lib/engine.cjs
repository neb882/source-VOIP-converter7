/* tests/lib/engine.cjs: the engine for the Node suites, loaded in the suite's own realm.
 *
 * This is the one list of the engine's files in the tests. A file added to the
 * engine is added to ENGINE_FILES here, in the page's order, and nowhere else in
 * the tests; tests/harness.verify.mjs holds the list to index.html and both
 * workers, and fails on a private copy of it in a suite.
 *
 * loadEngine() joins the files' text into the body of one function, as the page's
 * classic scripts share one global scope, and calls it in the suite's realm (not a
 * vm context: there every use of Math or a typed array's constructor is slower,
 * tests/verify.js three times over). The function's parameters stand for the
 * globals the page gives (window) and hide those it does not (self, module,
 * setTimeout, and Node's Buffer, global, setImmediate, clearImmediate, require
 * and process): each of those names is undefined inside the engine. An engine
 * file that comes to use one of Node's at its top level therefore fails at the
 * load; a use inside a function fails only when that function is called; a use
 * behind a typeof guard quietly takes the browser's branch; and
 * globalThis.process and globalThis.Buffer stay reachable, so a use through
 * globalThis is not caught at all. With no setTimeout a render's yields
 * resolve at once, as in every loader before this one.
 *
 * steam-sender.js and the resampler attach themselves to Node's global object
 * (TF2SteamSender, TF2Swresample), and audio.js finds them there: the engine's
 * files find one another by global name, and these two do so as the page's do.
 * Two engines in one process therefore share those two objects, and nothing
 * else: each load has its own tables, its own TF2Audio and its own codec module.
 * The engine's own files (PART_FILES, under engine/) find one another through
 * TF2Engine on the load's window, so two engines share none of them; a load
 * returns that object as `parts`. steam-sender.js and the resampler still
 * attach to Node's global object.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const REPO = path.join(__dirname, '..', '..');

// The page's order: index.html's first script tags, live-worker.js's
// importScripts, and the head of audio-worker.js's.
const ENGINE_FILES = ['constants.js', 'steam-sender.js', 'vendor/swresample/swresample.js', 'room-presets.js',
  'room-dsp.js', 'engine/dsp.js', 'engine/gain.js', 'audio.js'];

// The engine's own files, each one part of TF2Engine: the entries of
// ENGINE_FILES in the folder PART_DIR, in load order. The folder is named here
// and nowhere else in the tests.
const PART_DIR = 'engine';
const PART_FILES = ENGINE_FILES.filter((f) => f.startsWith(`${PART_DIR}/`));

// The files loaded as Node loads a module and handed to the engine under their
// global's name instead of being joined into its text: the two a suite wraps
// (tests/render-stream.verify.mjs watches every room path) or withholds (a page
// that did not load them).
const HANDED = { 'room-presets.js': 'TF2_ROOM_PRESETS', 'room-dsp.js': 'TF2Room' };

// constants.js's top-level tables, returned by loadEngine (the engine's own
// objects, not copies).
const TABLES = ['TF2_DATA', 'DEFAULT_LISTENER', 'PRESETS', 'PRESET_ALIASES', 'CODEC_PROFILES', 'VOICE_ENGINE',
  'DSP_PRESETS', 'ENV_ALIAS', 'ROOM_NUMBERS', 'LISTENER_POSITIONS', 'FCVAR'];

// The names the engine's function hides: undefined inside it.
const HIDDEN = ['self', 'module', 'setTimeout', 'Buffer', 'global', 'setImmediate', 'clearImmediate', 'require',
  'process'];

// A folder from a path, a file: URL or a URL object.
function folder(root) {
  if (root instanceof URL || /^file:/.test(String(root))) return fileURLToPath(root);
  return String(root);
}

// TF2_DIR as a folder, or the repository: for the suites that follow TF2_DIR.
function sourceRoot() {
  return process.env.TF2_DIR ? path.resolve(process.env.TF2_DIR) : REPO;
}

// The joined text of the files that are not handed in, in order: what the
// engine's function runs. tests/render-stream.verify.mjs also runs it in a vm
// context, for the two cases it renders both ways.
function engineSource(root = REPO) {
  const dir = folder(root);
  return ENGINE_FILES.filter((f) => !(f in HANDED)).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
}

// The engine from `options.root` (a path or a file: URL; the repository by
// default). `options.codec` is what the engine sees as TF2Opus: the returned
// object's `codec` reads it and `engine.codec = m` sets it, so the engine's
// next loadOpusModule() takes m, and a render already running keeps the module
// it took. Unset, the engine sees no TF2Opus. `options.TF2Room` and
// `options.TF2_ROOM_PRESETS` are what it sees under those names: left out, the
// modules as Node loads them from root; null, absent. The returned `parts` is
// the load's TF2Engine (undefined while PART_FILES is empty): a suite can call
// what a part gives and cannot replace it, since each part is frozen and every
// caller took its functions at the load. To break one internal function, load
// a copy of the files with that line changed (`root`).
function loadEngine(options = {}) {
  const dir = folder(options.root || REPO);
  const handedNames = Object.values(HANDED);
  const handed = Object.entries(HANDED).map(([file, name]) => {
    const given = options[name];
    if (given === undefined) return require(path.join(dir, file));
    return given === null ? undefined : given;
  });
  const window = {};
  const body = `${engineSource(dir)}\n` +
    `return { tables: { ${TABLES.join(', ')} }, getCodec: function () { return TF2Opus; }, ` +
    'setCodec: function (m) { TF2Opus = m; } };';
  const made = new Function('window', 'TF2Opus', ...handedNames, ...HIDDEN, body)(
    window, options.codec, ...handed, ...HIDDEN.map(() => undefined));
  const engine = { audio: window.TF2Audio, parts: window.TF2Engine, ...made.tables };
  Object.defineProperty(engine, 'codec', { enumerable: true, get: made.getCodec, set: made.setCodec });
  return engine;
}

module.exports = { ENGINE_FILES, PART_DIR, PART_FILES, HANDED, TABLES, loadEngine, engineSource, sourceRoot };
