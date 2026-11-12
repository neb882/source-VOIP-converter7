// The test runner: the one table of the suites, their groups, and a run of
// any of them that goes on after a failure.
//
//   node tests/run.mjs                    every group but browser
//   node tests/run.mjs all                everything, the browser suite last
//   node tests/run.mjs <name or group>... those suites (an unknown name lists the names)
//   node tests/run.mjs --jobs 3 ...       Node suites three at a time, each one's output
//                                         printed whole when it ends (a heavy job)
//
// Each suite runs as its own Node process, with this process's environment
// (TF2_DIR, CHROMIUM_EXECUTABLE), from the repository's folder, in the
// table's order whatever order it was named in. Every suite asked for runs,
// whatever the earlier ones did. The browser suite runs alone, after the
// others, at any --jobs: it times a live microphone chain against the
// clock. After each suite, one line with its result and its seconds; at the
// end, the table, each failed suite's FAIL lines and last 15 lines again,
// the seconds summed and the wall time. Exit 1 if a suite failed, 2 on an
// unknown name, else 0.
//
// The groups are CI's jobs (.github/workflows/test.yml); tests/site.verify.mjs
// holds the workflow's list of groups to GROUPS and every tests/*.verify.*
// file to the table.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const GROUPS = ['units', 'engine', 'render', 'stages', 'browser'];

// name, group, command (the script under the repository's folder and its arguments).
export const SUITES = [
  ['harness', 'units', ['tests/harness.verify.mjs']],
  ['site', 'units', ['tests/site.verify.mjs']],
  ['vendor', 'units', ['tests/vendor-opus.mjs', '--check']],
  ['gain', 'units', ['tests/gain.verify.mjs']],
  ['gain-exact', 'units', ['tests/gain-exact.mjs', '--synthetic']],
  ['opus', 'units', ['tests/opus.verify.mjs']],
  ['speex102', 'units', ['tests/speex102.verify.mjs']],
  ['vr12', 'units', ['tests/vr12.verify.mjs']],
  ['miles', 'units', ['tests/miles.verify.mjs']],
  ['reference', 'units', ['tests/reference.verify.mjs']],
  ['formats', 'units', ['tests/formats.verify.mjs']],
  ['filerate', 'units', ['tests/filerate.verify.mjs']],
  ['meter', 'units', ['tests/meter.verify.mjs']],
  ['video', 'units', ['tests/video.verify.mjs']],
  ['demo', 'units', ['tests/demo.verify.mjs']],
  ['output-stage', 'units', ['tests/output-stage.verify.mjs']],
  ['voice-channel', 'units', ['tests/voice-channel.verify.mjs']],
  ['steam-sender', 'units', ['tests/steam-sender.verify.mjs']],
  ['swresample', 'units', ['tests/swresample.verify.mjs']],
  ['room-dsp', 'units', ['tests/room-dsp.verify.mjs']],
  ['verify', 'engine', ['tests/verify.js']],
  ['steam', 'engine', ['tests/steam.verify.js']],
  ['render-stream', 'render', ['tests/render-stream.verify.mjs']],
  ['stages', 'stages', ['tests/stages.verify.mjs']],
  ['browser', 'browser', ['tests/browser.verify.js']]
].map(([name, group, command]) => ({ name, group, command }));

// The suites a list of names and groups asks for, in the table's order, the
// browser suite last; null and the unknown names if any is unknown.
export function choose(names) {
  const wanted = names.length ? names : GROUPS.filter((g) => g !== 'browser');
  const known = (w) => w === 'all' || SUITES.some((s) => s.name === w || s.group === w);
  const unknown = wanted.filter((w) => !known(w));
  if (unknown.length) return { unknown, suites: null };
  const all = wanted.includes('all');
  const suites = SUITES.filter((s) => all || wanted.includes(s.name) || wanted.includes(s.group));
  return { unknown: [], suites: [...suites.filter((s) => s.group !== 'browser'), ...suites.filter((s) => s.group === 'browser')] };
}

function runSuite(suite, stream) {
  return new Promise((resolve) => {
    const t0 = performance.now(), chunks = [];
    const child = spawn(process.execPath, suite.command, { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { chunks.push(d); if (stream) process.stdout.write(d); });
    child.stderr.on('data', (d) => { chunks.push(d); if (stream) process.stderr.write(d); });
    child.on('error', (error) => chunks.push(Buffer.from(`\n${error.message}\n`)));
    child.on('close', (code, signal) => {
      const seconds = (performance.now() - t0) / 1000, out = Buffer.concat(chunks).toString('utf8');
      if (!stream) process.stdout.write(out.endsWith('\n') || !out ? out : `${out}\n`);
      const ok = code === 0 && !signal;
      const how = ok ? 'passed' : `FAILED (${signal ? `signal ${signal}` : `exit ${code}`})`;
      console.log(`\n== ${suite.name}: ${how}, ${seconds.toFixed(1)} s\n`);
      resolve({ suite, ok, how, seconds, out });
    });
  });
}

async function main(argv) {
  const args = argv.filter((a) => a !== '--');
  let jobs = 1;
  const at = args.indexOf('--jobs');
  if (at >= 0) {
    jobs = Number(args[at + 1]);
    args.splice(at, 2);
    if (!Number.isInteger(jobs) || jobs < 1) {
      console.error('--jobs takes a whole number of at least 1');
      return 2;
    }
  }
  const { unknown, suites } = choose(args);
  if (unknown.length) {
    console.error(`No suite or group named ${unknown.join(', ')}.`);
    console.error(`Groups: all, ${GROUPS.join(', ')}.`);
    console.error(`Suites: ${SUITES.map((s) => s.name).join(', ')}.`);
    return 2;
  }
  const t0 = performance.now(), results = new Map();
  const node = suites.filter((s) => s.group !== 'browser'), browser = suites.filter((s) => s.group === 'browser');
  const queue = [...node];
  await Promise.all(Array.from({ length: Math.min(jobs, Math.max(1, queue.length)) }, async () => {
    while (queue.length) {
      const suite = queue.shift();
      results.set(suite, await runSuite(suite, jobs === 1));
    }
  }));
  for (const suite of browser) results.set(suite, await runSuite(suite, true));
  const wall = (performance.now() - t0) / 1000;

  const done = suites.map((s) => results.get(s));
  const width = Math.max(5, ...done.map((r) => r.suite.name.length));
  console.log(`${'suite'.padEnd(width)}  ${'group'.padEnd(7)}  ${'result'.padEnd(22)}  seconds`);
  for (const r of done) console.log(`${r.suite.name.padEnd(width)}  ${r.suite.group.padEnd(7)}  ${r.how.padEnd(22)}  ${r.seconds.toFixed(1).padStart(7)}`);
  const failed = done.filter((r) => !r.ok);
  for (const r of failed) {
    const lines = r.out.replace(/\s+$/, '').split('\n');
    const fails = lines.filter((l) => /^\s*FAIL\b/.test(l));
    console.log(`\n---- ${r.suite.name} (${r.suite.command.join(' ')}): ${fails.length} FAIL line${fails.length === 1 ? '' : 's'}, then its last 15 lines`);
    for (const l of fails) console.log(l);
    console.log('  ...');
    for (const l of lines.slice(-15)) console.log(l);
  }
  const sum = done.reduce((n, r) => n + r.seconds, 0);
  console.log(`\n${done.length - failed.length} of ${done.length} suites passed${failed.length ? `; FAILED: ${failed.map((r) => r.suite.name).join(', ')}` : ''}.`
    + ` ${sum.toFixed(1)} s summed, ${wall.toFixed(1)} s of wall time, ${jobs} at a time.`);
  return failed.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
