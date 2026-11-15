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

// A real server's console log in the game's format (W3-25), from seeded runs of several
// speakers' channels on the frame clock. synthesizeServer({ fps, seed, pulls, speakers },
// makeChannel) runs one channel a slot (makeChannel({ fps }) makes each) and prints what the
// game prints with voice_showincoming 1 and voice_showchannels 1, or 2 with pulls: true.
//
// The clock is the frame clock of W3-23a at every frame rate (frame k at 88200 k / fps half
// samples, a tick every 1323, a block of the mixer every 1024), and a frame's order is the one
// W3-23r read: the packets of every tick due in the frame first (each prints its incoming line
// as it is added), then the ticks due (each channel in use prints its tick line, in the
// channels' order), then the blocks due (each playing channel is pulled 512 samples, 513 on its
// first block after it starts, and prints a pull line with pulls: true). A packet from a
// speaker with no channel in use takes the lowest free one, so a channel freed by one speaker
// can be taken by another.
//
// speakers: [{ ent, script }], a script being spurts in order as in SCRIPT, each starting
// when its condition holds (tick, below, dry, freed, after as in SCRIPT; freedOf: { ent, ticks }
// that many ticks after that speaker's last spurt and its channel's free), plus burst: [sizes] (those packets on
// one tick, at the spurt's packet burstAt) and unrelatedAt. The mixer is the clock's own, not
// drawn. Returns { lines, marks, truth }: marks one per tick line ({ line, chan, ent, b,
// packets, opened, playedBefore, tick, frame }), truth what the channels did, per channel number.
export const SERVER_SCRIPT = [
  { ent: 1, script: [
    { start: { tick: 5 }, later: 30, burstAt: 4, burst: [2646, 0, 1764], unrelatedAt: 6 },   // opens; three packets on a tick, one empty
    { start: { below: 6000 }, later: 6, burstAt: 1, burst: [7938, 7938, 7938] },             // appended; a burst that overflows the ring
    { start: { dry: true }, later: 8 },                                                      // the grace
    { start: { freed: 12 }, later: 10, burstAt: 3, burst: [2646, 1764] },                    // a new channel after a free nobody printed
  ] },
  { ent: 2, script: [
    { start: { tick: 20 }, later: 60, burstAt: 10, burst: [1764, 0] },                       // a second channel in use at once
  ] },
  { ent: 3, script: [
    { start: { freedOf: { ent: 1, ticks: 6 } }, later: 12 },                                 // channel 0 taken by a second speaker after the first's last free
  ] },
];

export function synthesizeServer({ fps, seed, pulls = false, speakers = SERVER_SCRIPT }, makeChannel) {
  const rand = mulberry32(seed);
  const pick = (table) => { const u = rand(); for (const [v, p] of table) if (u < p) return v; return table[table.length - 1][0]; };
  const OPENING = [[7056, 0.77], [5292, 0.92], [6174, 0.96], [7938, 1]];
  const SIZES = [[2646, 0.65], [1764, 0.79], [3528, 0.90], [882, 1]];
  const GAPS = [[3, 0.41], [4, 0.90], [5, 1]];
  const RECORD = [[2756, 0.85], [1378, 1]];
  const TICK = 1323, BLOCK = 1024;
  const slots = [];                     // { ch, ent, first, lastEnt }
  const people = speakers.map((s) => ({ ent: s.ent, script: s.script, si: 0, schedule: null, last: -1, freedAt: -1, first: false }));
  const lines = [], marks = [];
  const truth = { packets: 0, ticks: 0, opens: 0, opensAfterFree: 0, graces: 0, emptyPackets: 0, severalPackets: 0, dropped: 0, reuses: 0, pullLines: 0, perChannel: [] };
  const per = (c) => (truth.perChannel[c] ||= { packets: 0, ticks: 0, opens: 0, opensAfterFree: 0, graces: 0, emptyPackets: 0, severalPackets: 0, reuses: 0, pullLines: 0, speakers: [] });
  const slotOf = (ent) => slots.findIndex((s) => s.ch.inUse && s.ent === ent);
  const at = (k) => (88200 * k) / fps;
  let tick = 0, block = 0;
  const done = () => people.every((p) => p.si === p.script.length && !p.schedule) && slots.every((s) => !s.ch.inUse);
  for (let k = 0; ; k++) {
    if (k > 200000) throw new Error('the synthetic server script did not finish');
    const t = at(k);
    // 1. The packets of every tick due in this frame, in tick order.
    const due = [];
    while (TICK * (tick + due.length) <= t) due.push(tick + due.length);
    const added = new Map();             // slot -> packets this frame, for the marks
    for (const i of due) {
      for (const p of people) {
        const sl = slotOf(p.ent), ch = sl >= 0 ? slots[sl].ch : null;
        if (!p.schedule && p.si < p.script.length) {
          const c = p.script[p.si].start;
          let go;
          if (c.tick !== undefined) go = i >= c.tick;
          else if (c.below !== undefined) go = !!ch && ch.playing && !ch.starved && ch.count > 0 && ch.count < c.below;
          else if (c.dry) go = !!ch && ch.starved;
          else if (c.freed !== undefined) go = p.freedAt > p.last && i >= p.freedAt + c.freed;
          else if (c.freedOf) {
            const o = people.find((q) => q.ent === c.freedOf.ent);
            go = o.si === o.script.length && !o.schedule && o.freedAt > o.last && i >= o.freedAt + c.freedOf.ticks;
          }
          else go = i >= p.last + c.after;
          if (go) {
            const sp = p.script[p.si++];
            const sched = new Map();
            let a = i;
            const put = (tk, sizes) => sched.set(tk, sizes);
            put(a, [pick(OPENING)]);
            for (let j = 0; j < sp.later; j++) { a += pick(GAPS); put(a, j + 1 === sp.burstAt ? sp.burst.slice() : [pick(SIZES)]); }
            a += pick(GAPS); put(a, [pick(RECORD)]);
            sched.last = a;
            sched.unrelated = sp.unrelatedAt === undefined ? -1 : [...sched.keys()][sp.unrelatedAt];
            p.schedule = sched; p.first = true;
          }
        }
        if (p.schedule && p.schedule.has(i)) {
          const sizes = p.schedule.get(i);
          for (const n of sizes) {
            let s = slotOf(p.ent);
            let opened = false;
            if (s < 0) {
              s = slots.findIndex((x) => !x.ch.inUse);
              if (s < 0) { s = slots.length; slots.push({ ch: makeChannel({ fps }), ent: -1, lastEnt: -1, firstBlock: true, freedSeen: false }); }
              const x = slots[s];
              opened = true;
              truth.opens++; per(s).opens++;
              if (x.lastEnt !== -1) { if (x.lastEnt === p.ent) { truth.opensAfterFree++; per(s).opensAfterFree++; } else { truth.reuses++; per(s).reuses++; } }
              if (!per(s).speakers.includes(p.ent)) per(s).speakers.push(p.ent);
              x.ent = p.ent; x.lastEnt = p.ent;
            } else if (slots[s].ch.starved) { truth.graces++; per(s).graces++; }
            if (n === 0) { truth.emptyPackets++; per(s).emptyPackets++; }
            lines.push(`Voice - ${n} incoming samples added to channel ${s}`);
            slots[s].ch.add(new Float32Array(n));
            truth.packets++; per(s).packets++;
            const list = added.get(s) || { packets: [], opened: false };
            list.packets.push(n); list.opened ||= opened;
            added.set(s, list);
          }
          if (sizes.length > 1) { truth.severalPackets++; per(slotOf(p.ent)).severalPackets++; }
          if (p.schedule.unrelated === i) lines.push(UNRELATED);
          if (i === p.schedule.last) { p.last = i; p.schedule = null; }
        }
      }
    }
    // 2. The ticks due: each channel's pass, then its line.
    for (const i of due) {
      slots.forEach((x, c) => {
        const was = x.ch.inUse, playedBefore = x.ch.playing;
        x.ch.tick();
        if (was && !x.ch.inUse) { const p = people.find((q) => q.ent === x.ent); if (p) p.freedAt = i; }
        if (x.ch.inUse) {
          const a = added.get(c);
          marks.push({ line: lines.length, chan: c, ent: x.ent, b: 2 * x.ch.count, packets: a ? a.packets : [], opened: a ? a.opened : false, playedBefore, tick: i, frame: k });
          lines.push(`Voice - chan ${c}, ent ${x.ent}, bufsize: ${2 * x.ch.count}`);
          truth.ticks++; per(c).ticks++;
        }
        added.delete(c);
      });
      tick++;
    }
    // 3. The blocks due: each playing channel pulled.
    while (BLOCK * block <= t) {
      slots.forEach((x, c) => {
        if (!x.ch.playing) { x.firstBlock = true; return; }
        const n = x.firstBlock ? VOICE_CHANNEL.firstBlock : VOICE_CHANNEL.mixBlock;
        x.ch.pull(n);
        x.firstBlock = false;
        if (pulls) { lines.push(`Voice - mixed ${n} samples from channel ${c}`); truth.pullLines++; per(c).pullLines++; }
      });
      block++;
    }
    if (done()) break;
  }
  for (const x of slots) truth.dropped += x.ch.dropped;
  return { lines, marks, truth };
}
