// The cache number (CACHE in sw.js) against a base commit. A tool, not a
// suite: it reads the history.
//
//   node tests/cache-number.mjs <base>            exit 1 if a cached file changed and the number did not rise
//   node tests/cache-number.mjs <base> --set      then write the base's number plus one into sw.js
//   node tests/cache-number.mjs <base> --report   never fails: says which case holds
//
// The files compared are every file in either commit's ASSETS (sw.js at
// <base>, and in the working tree), and sw.js itself apart from the number's
// line; each is compared as it is at <base> with as it is in the working
// tree. The number is set by the orchestrator at the merge and by nobody
// else (CLAUDE.md, the hard rules; docs/PIPELINE.md, step 6): a builder
// runs this with --report and puts its line in the report.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { swAssets } from './lib/site-files.cjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NUMBER = /^(const CACHE = `\$\{CACHE_PREFIX\}v)(\d+)(`;)$/m;

const args = process.argv.slice(2);
const set = args.includes('--set'), report = args.includes('--report');
const rest = args.filter((a) => a !== '--set' && a !== '--report');
if (rest.length !== 1 || (set && report)) {
  console.error('usage: node tests/cache-number.mjs <base> [--set | --report]');
  process.exit(2);
}
const git = (...a) => execFileSync('git', ['-C', root, ...a], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
let base;
try { base = git('rev-parse', '--verify', '--quiet', `${rest[0]}^{commit}`).toString().trim(); } catch {
  console.error(`${rest[0]}: not a commit of this repository (CI needs the history: a checkout with fetch-depth 0)`);
  process.exit(2);
}
const atBase = (f) => { try { return git('show', `${base}:${f}`); } catch { return null; } };
const here = (f) => { const p = path.join(root, f); return fs.existsSync(p) ? fs.readFileSync(p) : null; };

const swBase = atBase('sw.js'), swHere = here('sw.js');
if (!swBase || !swHere) { console.error(`sw.js is missing ${swBase ? 'in the working tree' : `at ${rest[0]}`}`); process.exit(2); }
const number = (text) => { const m = NUMBER.exec(text); return m ? Number(m[2]) : null; };
const before = number(swBase.toString()), now = number(swHere.toString());
if (before === null || now === null) { console.error(`sw.js has no line "const CACHE = \`\${CACHE_PREFIX}vN\`;" ${before === null ? `at ${rest[0]}` : 'in the working tree'}`); process.exit(2); }

const files = new Set();
for (const text of [swBase.toString(), swHere.toString()]) {
  for (const entry of swAssets(text).entries) if (entry !== './') files.add(entry.replace(/^\.\//, ''));
}
const same = (a, b) => (a === null ? b === null : b !== null && a.equals(b));
const changed = [...files].sort().filter((f) => !same(atBase(f), here(f)));
const withoutNumber = (text) => text.toString().replace(NUMBER, '$1N$3');
if (withoutNumber(swBase) !== withoutNumber(swHere)) changed.push('sw.js');

const short = rest[0] === base ? base.slice(0, 7) : `${rest[0]} (${base.slice(0, 7)})`;
let exit = 0, line;
if (!changed.length) {
  line = now === before ? `no cached file changed; the number stays v${now}`
    : `no cached file changed; the number went from v${before} to v${now} all the same`;
} else {
  console.log(`cached files changed since ${short}: ${changed.join(', ')}`);
  if (now > before) line = `v${before} to v${now}`;
  else if (set) {
    fs.writeFileSync(path.join(root, 'sw.js'), swHere.toString().replace(NUMBER, `$1${before + 1}$3`));
    line = `v${before} to v${before + 1}, written into sw.js`;
  } else {
    line = `the number is v${now}, not above v${before}: it must rise (node tests/cache-number.mjs ${rest[0]} --set)`;
    exit = report ? 0 : 1;
  }
}
console.log(report ? `cache number against ${short}: ${line}` : line);
process.exitCode = exit;
