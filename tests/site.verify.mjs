// The files the site keeps offline, derived and held to sw.js; and the
// runner's table held to the workflow and to the suites on disk.
//
//   node tests/site.verify.mjs
//
// 1. Every way a shipped file loads another is one this check knows
//    (tests/lib/site-files.cjs has the rules), or a statement on its short
//    list of allowances, each with what was read there; an allowance whose
//    statement is gone fails too. The one file not read is pinned by hash.
// 2. sw.js's ASSETS holds './' and './index.html', no entry twice, every
//    entry a file that exists, and exactly the files the site loads: a
//    failure names each file "needed and not listed" and each "listed and
//    not needed". The page's link to a file opened online only is named in
//    the check's own list (ONLINE_ONLY) and is not in ASSETS.
// 3. The workflow's matrix.group is the runner's groups, with no exclude or
//    include, and its run step runs the job's own group; every
//    tests/*.verify.js and tests/*.verify.mjs is in the runner's table, the
//    three suites that are not (verify.js, the vendor check, gain-exact) are there with
//    their exact commands, and every command in the table is a file.
// Static and quick. It checks the folder it sits in (not TF2_DIR): run it
// in a copy to check a copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteFiles, swAssets, OPAQUE, ALLOWED, ONLINE_ONLY } from './lib/site-files.cjs';
import { SUITES, GROUPS } from './run.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `   [${detail}]` : ''}`);
}
const list = (xs) => xs.join(', ') || 'none';

console.log('\n[1] Every file the site loads is found by a rule this check knows');
const t0 = performance.now();
const site = siteFiles(root);
const ms = performance.now() - t0;
check('every loading form in the shipped files is one the rules read, or an allowance whose statement is there',
  site.problems.length === 0, site.problems.length ? `\n        ${site.problems.join('\n        ')}` : `${site.files.length} files, ${ms.toFixed(0)} ms`);
console.log(`        allowances: ${ALLOWED.map((a) => `${a.file} "${a.statement}"${a.times > 1 ? ` (${a.times} lines)` : ''}`).join('; ')}`);
console.log(`        not read: ${Object.keys(OPAQUE).join(', ')}; linked, opened online only: ${ONLINE_ONLY.map((o) => o.file).join(', ')}`);

console.log('\n[2] sw.js lists exactly the files the site loads');
{
  const assets = swAssets(read('sw.js'));
  const entries = assets.entries;
  const twice = entries.filter((e, i) => entries.indexOf(e) !== i);
  const bad = entries.filter((e) => !/^\.\//.test(e));
  const listed = entries.filter((e) => e !== './').map((e) => e.replace(/^\.\//, ''));
  const absent = listed.filter((f) => !fs.existsSync(path.join(root, f)) || !fs.statSync(path.join(root, f)).isFile());
  check('ASSETS is a list of plain quoted entries, each starting ./, none twice',
    assets.problems.length === 0 && twice.length === 0 && bad.length === 0,
    [...assets.problems, ...twice.map((e) => `${e} twice`), ...bad.map((e) => `${e} does not start ./`)].join('; ') || `${entries.length} entries`);
  check('ASSETS holds the folder (./) and ./index.html', entries.includes('./') && entries.includes('./index.html'));
  check('every entry of ASSETS is a file of the folder', absent.length === 0, absent.length ? `no such file: ${list(absent)}` : `${listed.length} files`);
  const needed = site.files.filter((f) => !listed.includes(f));
  const unneeded = listed.filter((f) => !site.files.includes(f));
  check('sw.js lists every file the site loads and nothing else', needed.length === 0 && unneeded.length === 0,
    needed.length || unneeded.length ? `needed and not listed: ${list(needed)}; listed and not needed: ${list(unneeded)}` : `${listed.length} files`);
  const online = site.online.filter((f) => listed.includes(f));
  check('the files linked to be opened online only are not in ASSETS', online.length === 0, list(site.online));
}

console.log('\n[3] The runner\'s table, the workflow\'s jobs and the suites on disk agree');
{
  const workflow = read('.github/workflows/test.yml');
  const groups = [...workflow.matchAll(/^\s*group:\s*\[([^\]]*)\]/gm)].map((m) => m[1].split(',').map((g) => g.trim()).filter(Boolean));
  const matrix = groups.length === 1 ? groups[0] : null;
  // The matrix is the groups and nothing else, and each job runs its own group.
  const narrowed = [...workflow.matchAll(/^\s*(exclude|include)\s*:/gm)].map((m) => m[1]);
  const runs = [...workflow.matchAll(/node tests\/run\.mjs[^\n]*/g)].map((m) => m[0].trim());
  check('the workflow\'s matrix has no exclude or include, and its one run of the runner is node tests/run.mjs ${{ matrix.group }}',
    narrowed.length === 0 && runs.length === 1 && runs[0] === 'node tests/run.mjs ${{ matrix.group }}',
    `${narrowed.length ? `${narrowed.join(', ')} under the matrix; ` : ''}runs: ${runs.join(' | ') || 'none'}`);
  check('the workflow\'s matrix.group is the runner\'s groups',
    matrix !== null && matrix.length === GROUPS.length && GROUPS.every((g) => matrix.includes(g)),
    matrix === null ? `${groups.length} group lists found in the workflow, not 1` : `workflow: ${list(matrix)}; runner: ${list(GROUPS)}`);
  const names = SUITES.map((s) => s.name);
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  const unknownGroup = SUITES.filter((s) => !GROUPS.includes(s.group)).map((s) => `${s.name} (${s.group})`);
  const empty = GROUPS.filter((g) => !SUITES.some((s) => s.group === g));
  check('each suite has one name and a known group, and each group has a suite', twice.length === 0 && unknownGroup.length === 0 && empty.length === 0,
    [...twice.map((n) => `${n} twice`), ...unknownGroup.map((s) => `unknown group: ${s}`), ...empty.map((g) => `no suite in ${g}`)].join('; ') || `${names.length} suites`);
  // The suites that are not tests/*.verify.* files, with their exact commands;
  // and a *.verify.* file runs with no arguments.
  const OTHER = { verify: 'tests/verify.js', vendor: 'tests/vendor-opus.mjs --check', 'gain-exact': 'tests/gain-exact.mjs --synthetic' };
  const others = SUITES.filter((s) => !/\.verify\.m?js$/.test(s.command[0]));
  const wrong = [
    ...Object.entries(OTHER).filter(([n, c]) => !SUITES.some((s) => s.name === n && s.command.join(' ') === c)).map(([n, c]) => `${n} is not "${c}"`),
    ...others.filter((s) => !(s.name in OTHER)).map((s) => `${s.name} (${s.command.join(' ')}) is not a verify file and not named here`),
    ...SUITES.filter((s) => /\.verify\.m?js$/.test(s.command[0]) && s.command.length > 1).map((s) => `${s.name} has arguments: ${s.command.join(' ')}`)
  ];
  check('the suites that are not *.verify.* files are in the table with their commands (verify.js, vendor-opus.mjs --check, gain-exact.mjs --synthetic)',
    wrong.length === 0, wrong.join('; ') || Object.values(OTHER).join(', '));
  const commands = SUITES.map((s) => s.command[0]);
  const onDisk = fs.readdirSync(here).filter((f) => /\.verify\.m?js$/.test(f)).map((f) => `tests/${f}`);
  const missing = onDisk.filter((f) => !commands.includes(f));
  check('every tests/*.verify.js and tests/*.verify.mjs is in the runner\'s table', missing.length === 0,
    missing.length ? `not in tests/run.mjs: ${list(missing)}` : `${onDisk.length} files`);
  const noFile = commands.filter((f) => !fs.existsSync(path.join(root, f)));
  check('every command in the runner\'s table is a file', noFile.length === 0, noFile.length ? `no such file: ${list(noFile)}` : `${commands.length} commands`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
