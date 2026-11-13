// The check `queue` (docs/REPRODUCE.md, "queue"): the receiver's voice queue,
// from the game's console log. Each speaker's voice waits in a ring of 22050
// samples; a packet for a speaker with no channel opens one, and the channel
// waits ceil(0.1 x frames a second) ticks before it plays, the packet's own
// tick counted; each packet of N samples adds N - 1; a channel ends on the
// first tick after the mixer has emptied its ring (read, W3-03; findings 22,
// 23 and 24).
//
//   queue <the game's console log> --fps <frames a second> [--section <marker>] [--buffer-ms <voice_buffer_ms>]
//
// file 1 is a log the game wrote with con_logfile while voice_showincoming 1
// and voice_showchannels 1 were set. tests/voicequeue/log-to-fixture.mjs
// turns it into events (its rules and its stops are its own), and
// tests/voicequeue/replay.mjs replays them through voice-channel.js, as the
// suite `voice-channel` does with --fixture. The pass line (Q1): the rule
// gives the logged queue on every tick. Expected (measured, Set G, finding
// 22): every one of 9,808 ticks over 2,375 packets. The six faults of that
// replay are printed as information: a log shows a fault only where the
// thing happened (the ring's faults need an overflow, "no grace" a grace), so
// 0 there is not a failure (order RP-01b, "Why the pass line is not the old
// one").
//
// Q1 tests the wait only from below: a frame rate given lower than the game's
// passes it, since the log's demand is 0 while the true wait runs on. Q2
// tests it from above, from the tick lines between a channel's packet and the
// first fall of its queue: every channel whose queue fell first fell on line
// W to W + SLACK (W the wait), and at least one on W or W + 1 (measured: so in
// each of Set G's six parts; the record's entry "The checks gate and queue").
//
// A log with fewer than MIN_TICKS tick lines (a choice of this check), or in
// which no channel's queue ever fell (no channel played), cannot show the
// rule and is "differs". Nothing of the log is printed: its lines are counted,
// the voice lines give their numbers, and the marker of --section, which the
// tool puts into the fixture's name, is never printed.
import { logToFixture, FixtureError } from '../voicequeue/log-to-fixture.mjs';
import { replayFixture } from '../voicequeue/replay.mjs';
import { cannot, differs, fmt, numberOption, parseArgs, readBytes } from './common.mjs';

// The fewest tick lines a log must hold: a choice of this check (1.5 s of
// ticks; the record's shortest part has 511).
export const MIN_TICKS = 100;
// Q2's band: a channel's queue first falls W to W + SLACK tick lines after its
// packet, W the wait (a choice of order RP-01b's fix round: Set G's logs have W
// to W + 2 in 34 channels, measured; one more line because a packet that
// refills a full ring hides the mixer's pull from the log, inferred).
export const SLACK = 3;
const CAP = 44100;            // the ring, in bytes (finding 22)
const FRAME = 882;            // one 20 ms frame of Steam voice at 44100 Hz (finding 25)
const BLOCK = 512;            // the mixer's block (finding 22)

// The lines of the part the tool reads, as it cuts them: all of them, or with
// a marker the lines after the line that is the marker, up to the next line
// that starts with MARK.
function partLines(text, section) {
  if (text.startsWith('ï»¿')) text = text.slice(3);
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (section === undefined) return lines;
  const at = lines.findIndex((l) => l.trim() === String(section).trim());
  if (at < 0) return [];
  let end = lines.findIndex((l, i) => i > at && l.startsWith('MARK'));
  if (end < 0) end = lines.length;
  return lines.slice(at + 1, end);
}

// Each channel in the events, from its opening packet: the tick lines before
// its queue first fell (null for one whose queue never fell), and the packets'
// counts.
function channelsOf(events) {
  const channels = [], packets = [];
  let ch = null, opening = false, prev = 0, packet = null;
  for (let k = 0; k < events.length; k += 2) {
    const kind = events[k], v = events[k + 1];
    if (kind === 0) { ch = null; continue; }
    if (kind === 1) {
      packets.push(v);
      if (!ch) { ch = { lines: 0, fell: null }; channels.push(ch); opening = true; prev = 0; }
      packet = v;
      continue;
    }
    if (kind !== 3) continue;
    if (v === -1) { ch = null; continue; }
    if (!ch) continue;
    ch.lines++;
    const brought = packet === null ? 0 : 2 * Math.max(0, packet - 1);
    if (!opening && ch.fell === null && v < Math.min(CAP, prev + brought)) ch.fell = ch.lines - 1;
    opening = false; prev = v; packet = null;
  }
  return { channels, packets };
}

const plural = (n, one, more) => `${fmt(n)} ${n === 1 ? one : more}`;

export default {
  name: 'queue',
  summary: 'the receiver\'s queue, from the game\'s console log',
  usage: ['queue <the game\'s console log> --fps <frames a second> [--section <marker>] [--buffer-ms <voice_buffer_ms>]'],
  async run(args, report) {
    const { files, options } = parseArgs(args, { values: ['--fps', '--section', '--buffer-ms'] });
    if (files.length !== 1) throw cannot('give one file: the game\'s console log');
    if (options.fps == null) throw cannot('give --fps with the frame rate the game ran at, as its counter showed it: the wait is counted in frames');
    const fps = numberOption(options, 'fps', null, 10, 1000);
    const bufferMs = numberOption(options, 'buffer-ms', 100, 1, 5000);
    const section = options.section;
    if (section !== undefined && !String(section).trim()) throw cannot('--section takes the word you echoed before the part, such as MARK100');
    const text = readBytes(files[0], 'file 1').toString('latin1');
    const lines = partLines(text, section);
    if (section === undefined && lines.some((l) => l.startsWith('MARK'))) {
      throw differs('the log holds marked parts; give --section with the word that starts the part to check');
    }
    let fixture, stats;
    try {
      ({ fixture, stats } = logToFixture(text, { fps, bufferMs, section }));
    } catch (error) {
      if (!(error instanceof FixtureError)) throw error;
      // The tool's own words and a line number: it quotes no line.
      throw differs(`the log cannot be read as the rule asks: ${error.message}`);
    }
    report.line(`file 1: a console log${section === undefined ? '' : ', the marked part given (the marker is not printed)'}`);
    report.info(`lines read: ${fmt(lines.length)}: ${fmt(stats.packets)} packet lines, ${fmt(stats.ticks)} tick lines, ${fmt(Math.max(0, lines.length - stats.packets - stats.ticks))} other lines (counted, not kept)`);
    if (stats.unendedLastLine) report.info('the last line has no line end and was read as it stands (was the log cut off?)');
    report.info(`frame rate given: ${fps} a second; voice_buffer_ms: ${bufferMs}; the wait: ${plural(stats.waitTicks, 'tick', 'ticks')} (ceil(voice_buffer_ms / 1000 x frames a second), finding 23)`);
    report.info(`channels opened: ${fmt(stats.opens)}, of which after a free the log did not print: ${fmt(stats.opensAfterFree)}; graces (a packet on the tick after the ring ran dry): ${fmt(stats.graces)}; empty packets: ${fmt(stats.emptyPackets)}; sessions after the first: ${fmt(stats.sessions)}`);
    const row = replayFixture(fixture)[0];
    const { channels, packets } = channelsOf(fixture.sections[0].events);
    const fell = channels.filter((c) => c.fell !== null);
    const byLines = new Map();
    for (const c of fell) byLines.set(c.fell, (byLines.get(c.fell) || 0) + 1);
    report.info(`channels by the tick lines from their packet to the first fall of their queue: ${[...byLines].sort((a, b) => a[0] - b[0]).map(([n, k]) => `${n} lines in ${fmt(k)}`).join(', ') || 'none'}${channels.length > fell.length ? `; ${fmt(channels.length - fell.length)} whose queue never fell` : ''} (finding 23 has 7 at 67 frames a second, 10 at 100, 30 to 32 at 300)`);
    const whole = packets.filter((n) => n > 0 && n % FRAME === 0).length;
    report.info(`packets of whole 882-sample frames: ${fmt(whole)}; others (silence records and empty packets): ${fmt(packets.length - whole)}`);
    report.info(`pulls read from the log that are not whole blocks of ${BLOCK} samples: ${fmt(stats.offGrid)}`);
    if (stats.ticks < MIN_TICKS) {
      throw differs(`only ${plural(stats.ticks, 'tick line', 'tick lines')}, fewer than ${MIN_TICKS} (a choice of this check): too few to show the rule; speak for longer with voice_showchannels 1 on`);
    }
    if (!fell.length) {
      throw differs('no channel played: the queue never fell, so the log cannot show the rule; hold the key for a few seconds and speak');
    }
    const e = row.engine, W = stats.waitTicks;
    const ok = report.figure(`Q1, ticks on which the rule gives the logged queue: ${fmt(e.ticks - e.bad)} of ${fmt(e.ticks)}, expected all`, e.bad === 0);
    // Q2: the wait seen from above. Every channel whose queue fell first fell
    // W to W + SLACK tick lines after its packet, and at least one on W or
    // W + 1 (channels whose queue never fell are counted apart).
    const inBand = fell.filter((c) => c.fell >= W && c.fell <= W + SLACK).length, early = fell.some((c) => c.fell <= W + 1 && c.fell >= W);
    const ok2 = report.figure(`Q2, channels whose queue first fell on tick line ${W} to ${W + SLACK} after their packet: ${fmt(inBand)} of ${fmt(fell.length)}, expected all; one on line ${W} or ${W + 1}: ${early ? 'yes' : 'no'}, expected yes`, inBand === fell.length && early);
    report.info(`each fault of the rule, put in on purpose, with the ticks it mismatches${ok ? ' (0 means this log cannot tell that fault from the rule)' : ''}:`);
    for (const f of row.faults) report.info(`  ${f.label}: ${fmt(f.bad)}`);
    if (!ok) {
      const off = row.faults.filter((f) => /^wait [+-] 1$/.test(f.label) && f.bad === 0).map((f) => (f.label === 'wait + 1' ? 'longer' : 'shorter'));
      const where = `the rule mismatches the log on ${plural(e.bad, 'tick', 'ticks')} of ${fmt(e.ticks)}, the first at tick ${fmt(e.first.tick)}`;
      const steady = 'a frame rate the PC did not hold, or one frame of 0.1 s or more during a wait, which ends the wait at once (finding 23)';
      if (off.length) {
        throw differs(`${where}; with the wait one tick ${off.join(' or ')} it mismatches nowhere: check the frame rate given with --fps, and look for ${steady}`);
      }
      throw differs(`${where}: look for ${steady}, a frame rate other than the one given, or a second speaker; if none of these, the finding is wrong for your PC`);
    }
    if (!ok2) {
      const took = [...byLines].sort((a, b) => a[0] - b[0]).map(([n, k]) => `line ${n} in ${plural(k, 'channel', 'channels')}`).join(', ');
      throw differs(`Q2 does not hold: the wait at the frame rate given is ${plural(W, 'tick', 'ticks')}, and the queues first fell on ${took}; the frame rate given may be lower than the game's: give the number the counter showed`);
    }
  }
};
