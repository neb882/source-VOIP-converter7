// The game's voice queue from a console log, as numbers only.
//
//   node tests/voicequeue/log-to-fixture.mjs <console log> --fps <frames a second>
//        [--name <name>] [--section <marker>] [--buffer-ms 100]
//
// Reads the two kinds of line that voice_showincoming 1 and voice_showchannels 1 print
// ("Voice - N incoming samples added to channel C" for each packet, "Voice - chan C, ent E,
// bufsize: B" for each channel in use on each client tick) and prints a fixture with one
// section on stdout: { about, sections: [{ name, fps, bufferMs, events }] }, events a flat
// list of pairs kind, value: 0, 0 a new session (a fresh channel); 1, N a packet of N
// decoded samples; 2, n the mixer wanting n samples before the next tick; 3, B a client tick
// after which the channel holds B bytes, or 3, -1 a tick after which the channel is free.
// tests/voice-channel.verify.mjs --fixture <file> replays it through voice-channel.js.
//
// Nothing but counts leaves the log: every other line is only counted, the two voice
// lines give their numbers, and no message quotes a line. The rules are W3-02a's
// (docs/work-orders/W3-02-receiver-queue.md, spec 5); a line that breaks them stops the
// tool with a message, not a guess. tests/voicequeue/README.md says how to make a log.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { waitTicks } = require('../../voice-channel.js');

const CAP = 44100;                      // the ring in bytes
const PACKET = /^Voice - (\d{1,9}) incoming samples added to channel (\d{1,9})$/;
const TICK = /^Voice - chan (\d{1,9}), ent (\d{1,9}), bufsize: (\d{1,9})$/;
// voice_showchannels 2 also prints a line per pull; such a log is not one this tool reads.
const MIXED = /^Voice - mixed /;
const ABOUT = 'The game\'s voice queue from a console log (voice_showincoming 1, voice_showchannels 1), '
  + 'by tests/voicequeue/log-to-fixture.mjs: numbers only. Events are pairs: 0, 0 a new session; '
  + '1, N a packet of N decoded samples; 2, n the mixer wanting n samples before the next tick; '
  + '3, B a client tick after which the channel holds B bytes (-1: free).';

export class FixtureError extends Error {}
const stop = (line, what) => { throw new FixtureError(line ? `line ${line}: ${what}` : what); };

// text: the console log; opts: { fps, bufferMs = 100, name, section }.
// Returns { fixture, stats }; throws a FixtureError when a line breaks the rules.
export function logToFixture(text, opts) {
  const fps = opts.fps, bufferMs = opts.bufferMs === undefined ? 100 : opts.bufferMs;
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0) stop(0, '--fps must be a number of frames a second');
  if (typeof bufferMs !== 'number' || !Number.isFinite(bufferMs) || bufferMs <= 0) stop(0, '--buffer-ms must be a number');
  const name = opts.name !== undefined ? String(opts.name) : opts.section !== undefined ? String(opts.section) : 'log';
  const wait = waitTicks(bufferMs, fps);

  let lines = text.split('\n'), first = 1;        // first: the file's line number of lines[0]
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (opts.section !== undefined) {
    const marker = String(opts.section);
    if (!marker) stop(0, '--section needs a marker');
    const at = lines.findIndex((l) => l.startsWith(marker));
    if (at < 0) stop(0, 'no line starts with the marker');
    let end = lines.findIndex((l, i) => i > at && l.startsWith('MARK'));
    if (end < 0) end = lines.length;
    lines = lines.slice(at + 1, end);
    first = at + 2;
  }

  // The steps: one per tick line, with the packet line before it, and the sessions.
  const steps = [];
  let others = 0, pending = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd(), at = first + i;
    if (MIXED.test(line)) stop(at, 'a pull line: the log was made with voice_showchannels 2 (use 1)');
    const p = PACKET.exec(line), t = p ? null : TICK.exec(line);
    if (!p && !t) { others++; continue; }
    if (others >= 2) {
      if (pending) stop(pending.line, 'a packet line whose tick line is in another session');
      steps.push({ session: true });
    }
    others = 0;
    if (p) {
      if (pending) stop(at, 'a second packet line before a tick line (the engine adds at most one packet a tick)');
      pending = { n: Number(p[1]), chan: Number(p[2]), line: at };
    } else {
      steps.push({ packet: pending ? pending.n : null, pchan: pending ? pending.chan : null,
        b: Number(t[3]), chan: Number(t[1]), ent: Number(t[2]), line: at });
      pending = null;
    }
  }
  if (pending) stop(pending.line, 'a packet line with no tick line after it');

  const bytes = (s) => (s.packet === null ? 0 : 2 * Math.max(0, s.packet - 1));
  // Does the queue fall in any of the three steps after step i (in its session)?
  function fallsSoon(i) {
    let q = steps[i].b;
    for (let j = i + 1; j <= i + 3 && j < steps.length; j++) {
      const s = steps[j];
      if (s.session) break;
      if (s.b < Math.min(CAP, q + bytes(s))) return true;
      q = s.b;
    }
    return false;
  }

  const events = [];
  const stats = { packets: 0, ticks: 0, sessions: 0, opens: 0, opensAfterFree: 0, graces: 0, emptyPackets: 0 };
  let alive = false, age = 0, prev = 0, synth = 0, life = null;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.session) { events.push(0, 0); stats.sessions++; alive = false; continue; }
    stats.ticks++;
    if (s.packet !== null) { stats.packets++; if (s.packet === 0) stats.emptyPackets++; }
    const w = bytes(s), playing = alive && age >= wait;
    let open = false;
    if (s.packet !== null) {
      if (!alive) open = true;
      else if (playing && prev <= 4096 && s.b === Math.min(CAP, w)) {
        if (!fallsSoon(i)) {                // the ring ran out and the channel was freed unseen
          events.push(2, 1024, 3, -1);
          open = true;
          stats.opensAfterFree++;
        } else {                            // the grace: the packet came before the free
          if (wait <= 3) stop(s.line, `at a wait of ${wait} ticks a grace cannot be told from a new channel`);
          sameChannel(s);
          events.push(2, 1024, 1, s.packet, 3, s.b);
          stats.graces++;
          prev = s.b; age++;
          continue;
        }
      }
    }
    if (open) {
      if (s.b !== Math.min(CAP, w)) stop(s.line, `a new channel holds ${s.b} bytes, its packet ${w}`);
      events.push(1, s.packet, 3, s.b);
      stats.opens++;
      alive = true; age = 1; prev = s.b;
      life = { chan: s.chan, ent: s.ent, pchan: s.pchan };
      continue;
    }
    if (!alive) stop(s.line, 'a tick line with no channel open in the log');
    sameChannel(s);
    let demand;
    if (age < wait) {                       // the wait: the log has no demand; one that plays early fails
      demand = synth++ % 2 === 0 ? 512 : 1024;
      if (s.b !== Math.min(CAP, prev + w)) stop(s.line, `the queue moved during the wait: ${prev} + ${w} to ${s.b}`);
    } else {
      const raw = prev + w - s.b;
      if (s.b === CAP && s.packet !== null) demand = raw >= 2048 ? 1024 : raw >= 1024 ? 512 : 0;   // an overflow hides it
      else {
        if (raw < 0 || raw % 2) stop(s.line, `the queue cannot go from ${prev} + ${w} to ${s.b}`);
        demand = raw / 2;
      }
    }
    events.push(2, demand);
    if (s.packet !== null) events.push(1, s.packet);
    events.push(3, s.b);
    prev = s.b; age++;
  }
  if (!stats.ticks) stop(0, 'no voice lines (voice_showincoming 1 and voice_showchannels 1)');

  // One channel's lines all name that channel: a log of one speaker.
  function sameChannel(s) {
    if (s.chan !== life.chan || s.ent !== life.ent || (s.pchan !== null && life.pchan !== null && s.pchan !== life.pchan)) {
      stop(s.line, 'a second channel while one is in use: the tool reads one speaker');
    }
    if (life.pchan === null) life.pchan = s.pchan;
  }

  return { fixture: { about: ABOUT, sections: [{ name, fps, bufferMs, events }] }, stats: { ...stats, waitTicks: wait } };
}

function usage(what) {
  process.stderr.write(`log-to-fixture: ${what}\nusage: node tests/voicequeue/log-to-fixture.mjs <console log> --fps <frames a second> [--name <name>] [--section <marker>] [--buffer-ms 100]\n`);
  process.exit(2);
}

function main(argv) {
  const opts = {};
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fps' || a === '--buffer-ms' || a === '--name' || a === '--section') {
      if (i + 1 >= argv.length) usage(`${a} needs a value`);
      const v = argv[++i];
      if (a === '--fps') opts.fps = Number(v);
      else if (a === '--buffer-ms') opts.bufferMs = Number(v);
      else if (a === '--name') opts.name = v;
      else opts.section = v;
    } else if (a.startsWith('--')) usage(`unknown option ${a}`);
    else if (file === null) file = a;
    else usage('one console log at a time');
  }
  if (file === null) usage('no console log given');
  if (opts.fps === undefined) usage('--fps is needed: the wait depends on the frame rate');
  let text;
  try { text = fs.readFileSync(file, 'latin1'); } catch { usage('cannot read the console log'); }
  try {
    const { fixture, stats } = logToFixture(text, opts);
    process.stdout.write(`${JSON.stringify(fixture)}\n`);
    const s = stats;
    process.stderr.write(`log-to-fixture: ${s.packets} packets, ${s.ticks} ticks, ${s.opens} opens (${s.opensAfterFree} after an unseen free), `
      + `${s.graces} graces, ${s.emptyPackets} empty packets, ${s.sessions} new sessions; a wait of ${s.waitTicks} ticks\n`);
  } catch (e) {
    if (!(e instanceof FixtureError)) throw e;
    process.stderr.write(`log-to-fixture: ${e.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
