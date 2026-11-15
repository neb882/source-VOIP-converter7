// Compares two records of the log tool's calls (tests/voicequeue/record-hook.mjs): the one made
// on main before an order and one made on its branch.
//
//   node tests/voicequeue/compare-records.mjs <main's record> <the branch's record> [--removed <regex>]...
//
// For each call of main's record (the hash of a log's text and the options), the branch's
// record must hold the same call with the same fixture's hash and the same values of every
// count main's summary has, or the same message where main's tool stopped. A call main's tool
// stopped on with a message that matches a --removed pattern (a refusal the order removes) is
// listed apart, with what the branch's tool did; a call missing from the branch's record is
// listed too. Exit 0 when every other call is the same.
import fs from 'node:fs';

const args = process.argv.slice(2);
const files = [], removed = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--removed') removed.push(new RegExp(args[++i]));
  else files.push(args[i]);
}
if (files.length !== 2) { console.error('usage: node tests/voicequeue/compare-records.mjs <main\'s record> <the branch\'s record> [--removed <regex>]...'); process.exit(2); }
const load = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const [before, after] = files.map(load);
const key = (r) => `${r.input} ${r.opts}`;
const byKey = new Map();
for (const r of after) { if (!byKey.has(key(r))) byKey.set(key(r), []); byKey.get(key(r)).push(r); }
const same = (a, b) => (a.error !== undefined ? b.error === a.error
  : b.fixture === a.fixture && Object.keys(a.stats).every((k) => JSON.stringify(a.stats[k]) === JSON.stringify(b.stats?.[k])));
let equal = 0, differ = 0, missing = 0, gone = 0;
const seen = new Set();
for (const a of before) {
  const k = key(a);
  if (seen.has(k)) continue;               // a call made twice on main: compared once
  seen.add(k);
  const bs = byKey.get(k) || [];
  const isRemoved = a.error !== undefined && removed.some((re) => re.test(a.error));
  if (!bs.length) { (isRemoved ? gone++ : missing++); console.log(`${isRemoved ? 'removed refusal' : 'MISSING'}: ${a.error ?? 'a fixture'}, not called on the branch`); continue; }
  if (bs.every((b) => same(a, b))) { equal++; continue; }
  if (isRemoved) { gone++; console.log(`removed refusal: "${a.error}"; on the branch: ${bs[0].error !== undefined ? `"${bs[0].error}"` : 'a fixture'}`); continue; }
  differ++;
  console.log(`DIFFERS: main ${a.error !== undefined ? `"${a.error}"` : `fixture ${a.fixture.slice(0, 12)}`}; the branch ${bs[0].error !== undefined ? `"${bs[0].error}"` : `fixture ${bs[0].fixture.slice(0, 12)}`}`);
}
console.log(`${seen.size} distinct calls on main (${before.length} in all): ${equal} the same on the branch, ${gone} on a removed refusal, ${differ} different, ${missing} not called`);
process.exitCode = differ || missing ? 1 : 0;
