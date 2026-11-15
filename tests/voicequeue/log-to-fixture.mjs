// The game's voice queue from a console log, as numbers only.
//
//   node tests/voicequeue/log-to-fixture.mjs <console log> --fps <frames a second>
//        [--channel <n>] [--mid-play] [--name <name>] [--section <marker>] [--buffer-ms 100] [--strict]
//
// Reads the lines that voice_showincoming 1 and voice_showchannels 1 or 2 print ("Voice - N
// incoming samples added to channel C" for each packet, "Voice - chan C, ent E, bufsize: B" for
// each channel in use on each client tick, and with voice_showchannels 2 "Voice - mixed N
// samples from channel C" for each pull of the mixer) and prints a fixture with one section on
// stdout: { about, sections: [{ name, fps, bufferMs, events }] }, events a flat list of pairs
// kind, value: 0, 0 a new session (a fresh channel); 1, N a packet of N decoded samples; 2, n
// the mixer wanting n samples before the next tick; 3, B a client tick after which the channel
// holds B bytes, or 3, -1 a tick after which the channel is free; with --mid-play also 4, B a
// tick line of a channel already playing, which holds B bytes after it and is not compared.
// tests/voice-channel.verify.mjs --fixture <file> replays it through voice-channel.js.
//
// One channel is read: the one --channel names, or the log's only one. Every packet line of
// that channel before one of its tick lines is added on that tick, in the log's order. A log
// with pull lines has the mixer's demand read from them: the channel's pulls between two of its
// tick lines are that tick's demand, placed before the tick's packets (the frame's order is
// packets, ticks, mixer, so the pulls printed after one tick line come before the next tick's
// packets). A log without them has the demand worked out from the queue. The other channels'
// lines are counted and not kept.
//
// A log made on a real server can begin while the channel plays. With --mid-play a session's
// first tick line of the channel that is not an opening, and a line the queue cannot explain
// (with the demand worked out; a new session is written first), is a start in mid-play: the
// channel is taken as playing with the line's bytes (W3-25, fix round 1).
//
// Nothing but counts leaves the log: every other line is only counted, the voice lines give
// their numbers, and no message quotes a line. The rules are W3-02a's
// (docs/work-orders/W3-02-receiver-queue.md, spec 5), restated by W3-25
// (docs/work-orders/W3-25-server-logs.md) for several packets on a tick, several speakers and
// pull lines, but for the marker: --section takes the line that is the marker (trimmed), not
// the first that starts with it, so MARK6 cannot read MARK67's part (the orchestrator's
// decision, 2026-11-10). A line that breaks the rules stops the tool with a message, not a
// guess, and so does a line that begins like a voice line but does not read as one. The pulls
// read from the log are counted against the mixer's 512-sample blocks (stderr); --strict
// refuses one off them. tests/voicequeue/README.md says how to make a log.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { waitTicks } = require('../../voice-channel.js');

const CAP = 44100;                      // the ring in bytes
const PACKET = /^Voice - (\d{1,9}) incoming samples added to channel (\d{1,9})$/;
const TICK = /^Voice - chan (\d{1,9}), ent (\d{1,9}), bufsize: (\d{1,9})$/;
// voice_showchannels 2 also prints a line per pull of the mixer.
const MIXED = /^Voice - mixed (\d{1,9}) samples from channel (\d{1,9})$/;
// What begins like one of the voice lines (a number or sign straight after "Voice - ", or
// "Voice - chan", even after a space; or "Voice - mixed ") must read as one: a negative or
// overlong number, a space before it or a line cut short would otherwise pass as another line.
const LIKE_VOICE = /^\s*Voice - ([-+\d]|chan\b)/;
const LIKE_MIXED = /^Voice - mixed /;
const BLOCK = 512;                      // the mixer's block (W3-07: one device buffer)
const TICK_HALF = 1323;                 // a client tick in half samples at 44.1 kHz (15 ms)
const ABOUT = 'The game\'s voice queue from a console log (voice_showincoming 1, voice_showchannels 1), '
  + 'by tests/voicequeue/log-to-fixture.mjs: numbers only. Events are pairs: 0, 0 a new session; '
  + '1, N a packet of N decoded samples; 2, n the mixer wanting n samples before the next tick; '
  + '3, B a client tick after which the channel holds B bytes (-1: free).';
// A fixture whose demand was read from pull lines says so (a fixture of a log without them keeps ABOUT).
const ABOUT_PULLS = 'The game\'s voice queue from a console log (voice_showincoming 1, voice_showchannels 2), '
  + 'by tests/voicequeue/log-to-fixture.mjs: numbers only. Events are pairs: 0, 0 a new session; '
  + '1, N a packet of N decoded samples; 2, n the mixer wanting n samples before the next tick, read from the '
  + 'log\'s pull lines where it has them; 3, B a client tick after which the channel holds B bytes (-1: free).';

// A fixture with a start in mid-play (a pair 4, B) says what the pair is; one without keeps its text.
const MID_PLAY = '3, B a client tick after which the channel holds B bytes (-1: free); 4, B a tick line of a channel '
  + 'already playing when the log began (or began again), which holds B bytes after it and is not compared.';
const aboutOf = (read, mid) => {
  const base = read ? ABOUT_PULLS : ABOUT;
  return mid ? base.replace('3, B a client tick after which the channel holds B bytes (-1: free).', MID_PLAY) : base;
};

export class FixtureError extends Error {}
const stop = (line, what) => { throw new FixtureError(line ? `line ${line}: ${what}` : what); };

// text: the console log; opts: { fps, bufferMs = 100, name, section, strict, channel, midPlay }.
// Returns { fixture, stats }; throws a FixtureError when a line breaks the rules.
export function logToFixture(text, opts) {
  const fps = opts.fps, bufferMs = opts.bufferMs === undefined ? 100 : opts.bufferMs;
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0) stop(0, '--fps must be a number of frames a second');
  if (typeof bufferMs !== 'number' || !Number.isFinite(bufferMs) || bufferMs <= 0) stop(0, '--buffer-ms must be a number');
  if (opts.channel !== undefined && !(Number.isInteger(opts.channel) && opts.channel >= 0 && opts.channel <= 999999999)) stop(0, '--channel must be a channel\'s number');
  const name = opts.name !== undefined ? String(opts.name) : opts.section !== undefined ? String(opts.section) : 'log';
  const wait = waitTicks(bufferMs, fps);
  // The most ticks one frame can run at this frame rate (the frame clock's arithmetic, W3-23a):
  // a playing channel is pulled at the latest after the last of them.
  const frameTicks = Math.max(1, Math.ceil(88200 / fps / TICK_HALF));

  // A byte-order mark (UTF-8, read as bytes or as text) is not part of the first line.
  if (text.startsWith('\u00EF\u00BB\u00BF')) text = text.slice(3);
  else if (text.startsWith('\uFEFF')) text = text.slice(1);
  let lines = text.split('\n'), first = 1;        // first: the file's line number of lines[0]
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  // A last line with no line end is read as it stands, and said (the log may have been cut).
  let unended = text.length > 0 && !text.endsWith('\n');
  if (opts.section !== undefined) {
    const marker = String(opts.section).trim();
    if (!marker) stop(0, '--section needs a marker');
    const at = lines.findIndex((l) => l.trim() === marker);
    if (at < 0) stop(0, 'no line is the marker');
    let end = lines.findIndex((l, i) => i > at && l.startsWith('MARK'));
    if (end < 0) end = lines.length;
    else unended = false;
    lines = lines.slice(at + 1, end);
    first = at + 2;
  }

  // The lines as tokens: a packet, a tick or a pull of a channel, another line, or a line that
  // begins like a voice line and does not read as one (a stop where it is reached).
  const tokens = lines.map((l) => {
    const line = l.trimEnd();
    let m;
    if ((m = PACKET.exec(line))) return { kind: 'P', n: Number(m[1]), chan: Number(m[2]) };
    if ((m = TICK.exec(line))) return { kind: 'T', chan: Number(m[1]), ent: Number(m[2]), b: Number(m[3]) };
    if ((m = MIXED.exec(line))) return { kind: 'M', n: Number(m[1]), chan: Number(m[2]) };
    if (LIKE_VOICE.test(line) || LIKE_MIXED.test(line)) return { kind: 'bad' };
    return { kind: 'other' };
  });

  // The channel: the one asked for, or the log's only one.
  const tickLines = new Map();
  for (const t of tokens) if (t.kind === 'P' || t.kind === 'T' || t.kind === 'M') tickLines.set(t.chan, (tickLines.get(t.chan) || 0) + (t.kind === 'T' ? 1 : 0));
  let chan = opts.channel;
  if (chan === undefined && tickLines.size > 1) {
    const list = [...tickLines].sort((a, b) => a[0] - b[0]);
    const e = new FixtureError(`more than one channel: ${list.map(([c, n]) => `channel ${c} (${n} tick line${n === 1 ? '' : 's'})`).join(', ')}; the tool reads one channel at a time`);
    e.channels = list.map(([c, n]) => ({ channel: c, tickLines: n }));
    throw e;
  }
  if (chan === undefined) chan = tickLines.size ? [...tickLines.keys()][0] : 0;
  else if (tickLines.size && !tickLines.get(chan)) stop(0, `no tick line of channel ${chan}`);

  // The steps: one per tick line of the channel, with its packets and, where the log has pull
  // lines, its pulls; and the sessions. A pull line of any channel shows the log has them: the
  // demand is read from the next tick line of the channel on (the stretch the first one falls
  // in is worked out, as it may have begun before voice_showchannels 2 was set).
  const steps = [];
  let others = 0, packets = [], packetLine = 0, pulls = 0, pullsShown = false, readNext = false;
  const stats = { packets: 0, ticks: 0, sessions: 0, opens: 0, opensAfterFree: 0, graces: 0, emptyPackets: 0, offGrid: 0, unendedLastLine: unended,
    channel: chan, otherChannelLines: 0, pullLines: 0, readTicks: 0, severalPackets: 0, speakers: 0, midStarts: 0, unexplained: 0 };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i], at = first + i;
    if (t.kind === 'other') { others++; continue; }
    if (t.kind === 'bad') stop(at, 'a voice line that does not read as one (a sign, more than 9 digits, something before or after it, or cut short)');
    if (others >= 2) {
      if (packets.length) stop(packetLine, 'a packet line whose tick line is in another session');
      steps.push({ session: true });
      pulls = 0; readNext = pullsShown;
    }
    others = 0;
    if (t.kind === 'M') pullsShown = true;
    if (t.chan !== chan) { stats.otherChannelLines++; continue; }
    if (t.kind === 'P') {
      if (!packets.length) packetLine = at;
      packets.push(t.n);
    } else if (t.kind === 'M') {
      stats.pullLines++;
      pulls += t.n;
    } else {
      steps.push({ packets, pulls: readNext ? pulls : null, b: t.b, ent: t.ent, line: at });
      packets = []; pulls = 0; readNext = pullsShown;
    }
  }
  if (packets.length) stop(packetLine, 'a packet line with no tick line after it');

  const bytes = (s) => s.packets.reduce((sum, n) => sum + 2 * Math.max(0, n - 1), 0);
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
  // With the demand read: on which step after step i (1 the next; in its session) is the
  // channel first pulled? null if on none.
  function pulledOn(i) {
    for (let j = i + 1; j < steps.length; j++) {
      const s = steps[j];
      if (s.session) break;
      if (s.pulls !== null && s.pulls > 0) return j - i;
    }
    return null;
  }

  const events = [];
  let anyRead = false, anyMid = false;
  // firstPull: the channel has played nothing the log shows since it started, so its first
  // pull may be a multiple of 512 plus one (the 513 or 1025 of every start in the logs).
  let alive = false, age = 0, prev = 0, synth = 0, life = null, firstPull = false;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.session) { events.push(0, 0); stats.sessions++; alive = false; continue; }
    stats.ticks++;
    for (const n of s.packets) { stats.packets++; if (n === 0) stats.emptyPackets++; }
    if (s.packets.length > 1) stats.severalPackets++;
    const read = s.pulls !== null;
    if (read) { stats.readTicks++; anyRead = true; }
    const w = bytes(s), has = s.packets.length > 0, playing = alive && age >= wait;
    // The ring ran dry before this step: by the pulls read, or (worked out) if it held at most 4096 bytes.
    const ranDry = read ? 2 * s.pulls >= prev : prev <= 4096;
    const addPackets = () => { for (const n of s.packets) events.push(1, n); };
    // A second speaker on the channel: the first was freed on a tick that printed nothing, and
    // the second's packets opened the channel again. Anything else is a stop.
    if (alive && s.ent !== life.ent) {
      if (!(has && playing && ranDry && s.b === Math.min(CAP, w))) stop(s.line, 'a second channel while one is in use: the entity changed with no free tick between');
      events.push(0, 0);
      stats.sessions++; stats.speakers++;
      alive = false;
    }
    let open = false;
    if (has) {
      if (!alive) open = true;
      else if (playing && ranDry && s.b === Math.min(CAP, w)) {
        let grace;
        if (!read) {
          grace = fallsSoon(i);
          if (grace && wait <= 3) stop(s.line, `at a wait of ${wait} ticks a grace cannot be told from a new channel`);
        } else {
          // A new channel is not pulled before its wait is over; a kept one is pulled after the
          // last tick of its frame at the latest. Between the two, the pull itself tells: a
          // channel that starts is first pulled a sample more than whole blocks (513), a kept
          // one whole blocks.
          const j = pulledOn(i), left = j === null ? null : steps[i + j].pulls % BLOCK;
          if (j !== null && j <= wait - 1) grace = true;
          else if (j === null || j >= Math.max(wait, frameTicks + 1)) grace = false;
          else if (left === 0 || left === 1) grace = left === 0;
          else stop(s.line, `at a wait of ${wait} ticks a grace cannot be told from a new channel (the channel is next pulled ${j} tick lines on)`);
        }
        const pull = read ? s.pulls : 1024;
        if (!grace) {                       // the ring ran out and the channel was freed unseen
          events.push(2, pull, 3, -1);
          open = true;
          stats.opensAfterFree++;
        } else {                            // the grace: the packets came before the free
          events.push(2, pull);
          addPackets();
          events.push(3, s.b);
          stats.graces++;
          prev = s.b; age++;
          if (read && s.pulls > 0) firstPull = false;
          continue;
        }
      }
    }
    // With --mid-play, a session's first tick line of the channel that is not an opening is a start in
    // mid-play: the channel is taken as playing, its wait over, and holding the line's bytes; the line's
    // packets are counted and not written. Not known: whether the channel was still in its wait.
    const startMidPlay = (unexplained = false) => {
      events.push(4, s.b);
      if (unexplained) stats.unexplained++; else stats.midStarts++;
      anyMid = true;
      alive = true; age = wait; prev = s.b; firstPull = true;
      life = { ent: s.ent };
    };
    if (open && !alive && opts.midPlay && s.b !== Math.min(CAP, w)) { startMidPlay(); continue; }
    if (open) {
      if (s.b !== Math.min(CAP, w)) stop(s.line, `a new channel holds ${s.b} bytes, its packet${s.packets.length > 1 ? 's' : ''} ${w}`);
      addPackets();
      events.push(3, s.b);
      stats.opens++;
      alive = true; age = 1; prev = s.b; firstPull = true;
      life = { ent: s.ent };
      continue;
    }
    if (!alive && opts.midPlay) { startMidPlay(); continue; }
    if (!alive) stop(s.line, 'a tick line with no channel open in the log');
    let demand = null;
    if (age < wait) {                       // the wait: no demand reaches the channel; one that plays early fails
      if (read && s.pulls > 0) stop(s.line, `a pull of ${s.pulls} samples while the channel waits`);
      demand = synth++ % 2 === 0 ? 512 : 1024;
      if (s.b !== Math.min(CAP, prev + w)) stop(s.line, `the queue moved during the wait: ${prev} + ${w} to ${s.b}`);
    } else if (read) {
      demand = s.pulls;                     // read from the log; the replay judges the queue
    } else {
      const raw = prev + w - s.b;
      if (s.b === CAP && has) demand = raw >= 2048 ? 1024 : raw >= 1024 ? 512 : 0;   // an overflow hides it
      else {
        if (raw < 0 || raw % 2) {
          // With --mid-play the line is not guessed at: a new session, and the line a start in mid-play.
          if (opts.midPlay) { events.push(0, 0); startMidPlay(true); continue; }
          stop(s.line, `the queue cannot go from ${prev} + ${w} to ${s.b}`);
        }
        demand = raw / 2;
      }
    }
    if (age >= wait && demand > 0 && (read || !(s.b === CAP && has))) {   // a pull read from the log: whole blocks?
      const left = demand % BLOCK;
      if (left !== 0 && !(firstPull && left === 1)) {
        stats.offGrid++;
        if (opts.strict) stop(s.line, `a pull of ${demand} samples, not whole blocks of ${BLOCK} (--strict)`);
      }
      firstPull = false;
    }
    events.push(2, demand);
    addPackets();
    events.push(3, s.b);
    prev = s.b; age++;
  }
  if (!stats.ticks) stop(0, 'no voice lines (voice_showincoming 1 and voice_showchannels 1)');

  return { fixture: { about: aboutOf(anyRead, anyMid), sections: [{ name, fps, bufferMs, events }] }, stats: { ...stats, waitTicks: wait } };
}

function usage(what) {
  process.stderr.write(`log-to-fixture: ${what}\nusage: node tests/voicequeue/log-to-fixture.mjs <console log> --fps <frames a second> [--channel <n>] [--mid-play] [--name <name>] [--section <marker>] [--buffer-ms 100] [--strict]\n`);
  process.exit(2);
}

function main(argv) {
  const opts = {};
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fps' || a === '--buffer-ms' || a === '--name' || a === '--section' || a === '--channel') {
      if (i + 1 >= argv.length) usage(`${a} needs a value`);
      const v = argv[++i];
      if (a === '--fps') opts.fps = Number(v);
      else if (a === '--channel') {
        if (!/^\d{1,9}$/.test(v)) usage('--channel takes a channel\'s number');
        opts.channel = Number(v);
      }
      else if (a === '--buffer-ms') opts.bufferMs = Number(v);
      else if (a === '--name') opts.name = v;
      else opts.section = v;
    } else if (a === '--strict') opts.strict = true;
    else if (a === '--mid-play') opts.midPlay = true;
    else if (a.startsWith('--')) usage(`unknown option ${a}`);
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
      + `${s.graces} graces, ${s.emptyPackets} empty packets, ${s.sessions} new sessions; a wait of ${s.waitTicks} ticks; `
      + `${s.offGrid} pulls off the ${BLOCK}-sample blocks\n`);
    // What a log of a real server adds; nothing for a log of one speaker without pull lines.
    if (s.pullLines || s.readTicks || s.otherChannelLines || s.severalPackets || s.speakers || opts.channel !== undefined) {
      process.stderr.write(`log-to-fixture: channel ${s.channel}: ${s.pullLines} pull lines, the demand read on ${s.readTicks} ticks; `
        + `${s.severalPackets} ticks with several packets; ${s.speakers} new speakers on the channel; ${s.otherChannelLines} lines of other channels (counted, not kept)\n`);
    }
    if (opts.midPlay) {
      process.stderr.write(`log-to-fixture: ${s.midStarts} starts in mid-play (the channel taken as playing, its line not compared); `
        + `${s.unexplained} lines the queue could not explain (each a new session and a start in mid-play)\n`);
    }
    if (s.unendedLastLine) process.stderr.write('log-to-fixture: the last line has no line end; it was read as it stands (was the log cut off?)\n');
  } catch (e) {
    if (!(e instanceof FixtureError)) throw e;
    const midHint = !opts.midPlay && /: (a new channel holds|a tick line with no channel open)/.test(e.message) ? '; a log that begins while the channel plays: give --mid-play' : '';
    process.stderr.write(`log-to-fixture: ${e.message}${e.channels ? '; give --channel <n>' : ''}${midHint}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
