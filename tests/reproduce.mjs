// Check a finding on your own PC: one script, run on files your own game
// wrote, that prints the figures the record expects and "as expected" or
// "differs" beside each (docs/REPRODUCE.md says what to run in the game).
//
//   node tests/reproduce.mjs                     lists the checks
//   node tests/reproduce.mjs <check> <file>...   runs one
//
// Node 22 or later and a copy of the repository; no package, no network.
// Nothing leaves the PC: the script and the files under tests/reproduce/
// open no connection (tests/reproduce.verify.mjs holds that, by their text
// and by running every check with the network refused). The output is
// figures and the script's own words, never a line, a name or a path from
// a file it was given: a file is "file 1", "file 2", by its place among the
// file arguments. So it can be posted as it is.
//
// Exit 0: as expected. 1: differs (the reason is printed). 2: the check
// could not run (the arguments, or a file that cannot be read). 3: the check
// is not built yet. 4: an error the script does not describe; set
// REPRODUCE_DEBUG=1 to see it, which may print paths.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Stop, createReport } from './reproduce/common.mjs';
import inputs from './reproduce/inputs.mjs';
import gain from './reproduce/gain.mjs';
import celt from './reproduce/celt.mjs';
import speex from './reproduce/speex.mjs';
import ceiling from './reproduce/ceiling.mjs';
import clock from './reproduce/clock.mjs';
import demo from './reproduce/demo.mjs';
import queue from './reproduce/queue.mjs';

// Every check, in the page's order. A check not built yet has no run(), and
// `steps` says where the page gives its steps by hand (no order builds it
// yet).
export const CHECKS = [
  inputs,
  gain,
  celt,
  speex,
  { name: 'hold', summary: 'Steam\'s hold after speech and its clock', steps: 'docs/REPRODUCE.md, "The hold and Steam\'s clock", gives steps by hand, with Steam\'s console and the game\'s' },
  { name: 'gate', part: 'RP-01b', summary: 'Steam\'s sender gate, chunk by chunk' },
  queue,
  ceiling,
  clock,
  demo
];

function list() {
  const lines = ['node tests/reproduce.mjs <check> <file>...', '', 'The checks:'];
  const width = Math.max(...CHECKS.map((c) => c.name.length));
  for (const c of CHECKS) {
    lines.push(`  ${c.name.padEnd(width)}  ${c.run ? c.summary : `not built yet: ${c.summary}`}`);
    for (const u of c.usage || []) lines.push(`  ${' '.repeat(width)}    node tests/reproduce.mjs ${u}`);
  }
  lines.push('', 'docs/REPRODUCE.md says what to run in the game for each. The output holds figures only and can be posted as it is.');
  return lines;
}

export async function main(argv) {
  const [name, ...args] = argv;
  if (!name) { console.log(list().join('\n')); return 0; }
  const check = CHECKS.find((c) => c.name === name);
  if (!check) {
    console.log(['reproduce: argument 1 is not the name of a check.', '', ...list()].join('\n'));
    return 2;
  }
  if (!check.run) {
    console.log(`${check.name}: not built yet: ${check.summary}.${check.steps ? ` No order builds it yet; ${check.steps}.` : ''}`);
    return 3;
  }
  const report = createReport();
  report.line(`reproduce ${check.name}`);
  let exit = 0, verdict = 'as expected';
  try {
    await check.run(args, report);
  } catch (error) {
    if (error instanceof Stop) {
      exit = error.exit;
      verdict = exit === 2 ? `cannot check: ${error.message}` : `differs: ${error.message}`;
      if (exit === 2) for (const u of check.usage) report.line(`usage: node tests/reproduce.mjs ${u}`);
    } else {
      exit = 4;
      verdict = 'cannot check: the script met an error it does not describe (no detail is printed, so that nothing of your files is)';
      if (process.env.REPRODUCE_DEBUG === '1') console.error(error);
    }
  }
  report.line(`${check.name}: ${verdict}`);
  console.log(report.lines.join('\n'));
  return exit;
}

const realPath = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
if (process.argv[1] && realPath(process.argv[1]) === realPath(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
