// A console log in the game's format, from a seeded run of a voice channel under a mixer of
// its own. Moved here from tests/voice-channel.verify.mjs (order RP-01b), so that that suite
// and the suite `reproduce` load one copy.
//
// synthesize({ fps, seed }, makeChannel) runs the channel that makeChannel({ fps }) makes:
// tests/voice-channel.verify.mjs gives createChannel of voice-channel.js, and the suite
// `reproduce` gives createReferenceChannel of tests/voicequeue/reference-channel.mjs, the
// second model, so that the check `queue` replays through the module a log the module did not
// write. It returns { lines, marks, truth }: the log's lines, one mark per tick line ({ line,
// b, packet, opened, playedBefore }) and what the channel did.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { VOICE_CHANNEL } = require('../../voice-channel.js');

export function mulberry32(seed) {   // as in engine/dsp.js
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const UNRELATED = 'Not a voice line: synthetic console output qXzUnrelated';
// Spurts in order; each starts when its condition holds after the previous one's last packet.
//   tick: at that tick; below: when the playing ring holds fewer samples (an append);
//   dry: on the tick after a pull emptied the ring (the grace); freed: that many ticks after
//   the channel was freed; after: that many ticks after the previous spurt's last packet.
export const SCRIPT = [
  { start: { tick: 5 }, later: 30, unrelatedAt: 6 },   // opens a channel; at 300 fps it overflows while it waits
  { start: { below: 6000 }, later: 12 },               // appended to the playing channel
  { start: { dry: true }, later: 8 },                  // the grace
  { start: { freed: 12 }, later: 10 },                 // a new channel after a free nobody printed
  { start: { freed: 6 }, empty: true },                // a key press: an empty packet, then a short silence record
  { start: { after: 18 }, later: 10 },                 // speech 20 ticks after it (inside its wait at 300 fps)
  { start: { below: 3000 }, session: true, later: 6 }, // three unrelated lines, then a second session (the old channel still queued)
];

export function synthesize({ fps, seed }, makeChannel) {
  const rand = mulberry32(seed);
  const pick = (table) => { const u = rand(); for (const [v, p] of table) if (u < p) return v; return table[table.length - 1][0]; };
  // The logs' sizes and spacing (W3-02's "The sender's packets"); the mixer takes 0, 1 or 2
  // blocks of 512 between ticks, 0.07 / 0.568 / 0.362 (44.1 kHz on average).
  const OPENING = [[7056, 0.77], [5292, 0.92], [6174, 0.96], [7938, 1]];
  const SIZES = [[2646, 0.65], [1764, 0.79], [3528, 0.90], [882, 1]];
  const GAPS = [[3, 0.41], [4, 0.90], [5, 1]];
  const RECORD = [[2756, 0.85], [1378, 1]];
  const BLOCKS = [[0, 0.07], [1, 0.638], [2, 1]];

  const lines = [];
  // marks: one per bufsize line: { line, b, packet (n or null), opened, playedBefore (the
  // channel was playing while the mixer ran before this tick) }.
  const marks = [];
  const truth = { packets: 0, ticks: 0, opens: 0, opensAfterFree: 0, appends: 0, graces: 0, emptyPackets: 0, sessions: 0, dropped: 0, starts: 0, firstBlocks: 0 };
  let ch = makeChannel({ fps }), openedThisSession = false, firstBlock = true;
  let si = 0, schedule = null, lastPacketTick = -1, freedAt = -1, spurtFirst = false;
  for (let k = 0; ; k++) {
    if (k > 50000) throw new Error('the synthetic script did not finish');
    // The mixer, between the last tick and this one: only a playing channel is pulled.
    const blocks = pick(BLOCKS), playedBefore = ch.playing;
    let packet = null, opened = false;
    if (ch.playing) {
      for (let b = 0; b < blocks; b++) {
        ch.pull(firstBlock ? VOICE_CHANNEL.firstBlock : VOICE_CHANNEL.mixBlock);
        if (firstBlock) truth.firstBlocks++;
        firstBlock = false;
      }
    } else firstBlock = true;

    // Does the next spurt start on this tick?
    if (!schedule && si < SCRIPT.length) {
      const c = SCRIPT[si].start;
      const go = c.tick !== undefined ? k >= c.tick
        : c.below !== undefined ? ch.inUse && ch.playing && !ch.starved && ch.count > 0 && ch.count < c.below
          : c.dry ? ch.inUse && ch.starved
            : c.freed !== undefined ? freedAt > lastPacketTick && k >= freedAt + c.freed
              : k >= lastPacketTick + c.after;
      if (go) {
        const sp = SCRIPT[si++];
        if (sp.session) {
          for (let i = 0; i < 3; i++) lines.push(UNRELATED);
          truth.dropped += ch.dropped;
          ch = makeChannel({ fps }); openedThisSession = false; firstBlock = true; truth.sessions++;
        }
        schedule = new Map();
        let at = k;
        if (sp.empty) { schedule.set(at, 0); at += 2; schedule.set(at, pick(RECORD)); }
        else {
          schedule.set(at, pick(OPENING));
          for (let i = 0; i < sp.later; i++) { at += pick(GAPS); schedule.set(at, pick(SIZES)); }
          at += pick(GAPS); schedule.set(at, pick(RECORD));
        }
        schedule.last = at; schedule.unrelated = sp.unrelatedAt === undefined ? -1 : [...schedule.keys()][sp.unrelatedAt];
        spurtFirst = true;
      }
    }

    // This tick's packet, then the tick's pass, then the channel's line.
    if (schedule && schedule.has(k)) {
      const n = schedule.get(k);
      packet = n; opened = !ch.inUse;
      if (!ch.inUse) { truth.opens++; if (openedThisSession) truth.opensAfterFree++; openedThisSession = true; }
      else if (ch.starved) truth.graces++;
      else if (spurtFirst && ch.playing && ch.count > 0) truth.appends++;
      if (n === 0) truth.emptyPackets++;
      spurtFirst = false;
      lines.push(`Voice - ${n} incoming samples added to channel 0`);
      if (schedule.unrelated === k) lines.push(UNRELATED);
      ch.add(new Float32Array(n));
      truth.packets++;
      if (k === schedule.last) { lastPacketTick = k; schedule = null; }
    }
    const was = ch.inUse, wasPlaying = ch.playing;
    ch.tick();
    if (!wasPlaying && ch.playing) truth.starts++;
    if (was && !ch.inUse) freedAt = k;
    if (ch.inUse) {
      marks.push({ line: lines.length, b: 2 * ch.count, packet, opened, playedBefore });
      lines.push(`Voice - chan 0, ent 1, bufsize: ${2 * ch.count}`);
      truth.ticks++;
    }
    if (!schedule && si === SCRIPT.length && !ch.inUse) break;
  }
  truth.dropped += ch.dropped;
  return { lines, marks, truth };
}
