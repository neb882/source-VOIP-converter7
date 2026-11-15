// A record of every call of the log tool, for an order's "what must not move" (W3-25): loaded with
//
//   TF2VE_TOOL_RECORD=<file> NODE_OPTIONS=--import=<file URL of this script> node tests/voice-channel.verify.mjs
//
// it wraps logToFixture of tests/voicequeue/log-to-fixture.mjs as the module loads, in the process and in every
// child that inherits NODE_OPTIONS (the tool run on its own, the check `queue` of tests/reproduce.mjs), and appends
// one line of JSON a call to the file: the SHA-256 of the log's text, the options, and the SHA-256 of the fixture
// with the summary's counts, or the message the tool stopped with. Nothing of a log is written but its hash.
// tests/voicequeue/compare-records.mjs compares two such files; tests/voicequeue/calls-main.jsonl is the
// record made on main (363f8cb) before W3-25 changed the tool. Without TF2VE_TOOL_RECORD it does nothing.
import { registerHooks } from 'node:module';

const out = process.env.TF2VE_TOOL_RECORD;
if (out) {
  registerHooks({
    load(url, context, next) {
      const r = next(url, context);
      if (!url.endsWith('/tests/voicequeue/log-to-fixture.mjs')) return r;
      const src = String(r.source);
      if (!src.includes('export function logToFixture(')) throw new Error('record-hook: logToFixture is not where the hook expects it');
      const wrapped = `${src.replace('export function logToFixture(', 'function logToFixtureUnrecorded(')}
import { appendFileSync as recordAppend } from 'node:fs';
import { createHash as recordHash } from 'node:crypto';
export function logToFixture(text, opts) {
  const sha = (s) => recordHash('sha256').update(s).digest('hex');
  const line = { input: sha(String(text)), opts: JSON.stringify(opts, Object.keys(opts || {}).sort()) };
  try {
    const r = logToFixtureUnrecorded(text, opts);
    recordAppend(${JSON.stringify(out)}, JSON.stringify({ ...line, fixture: sha(JSON.stringify(r.fixture)), stats: r.stats }) + '\\n');
    return r;
  } catch (e) {
    recordAppend(${JSON.stringify(out)}, JSON.stringify({ ...line, error: String(e && e.message) }) + '\\n');
    throw e;
  }
}
`;
      return { ...r, source: wrapped, shortCircuit: true };
    },
  });
}
