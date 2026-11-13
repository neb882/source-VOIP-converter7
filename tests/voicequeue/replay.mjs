// The replay of a fixture of the game's voice queue through voice-channel.js: as the
// engine, and once under each of six faults. Moved here unchanged from
// tests/voice-channel.verify.mjs (order RP-01b), so that that suite and the check `queue` of
// tests/reproduce.mjs load one copy.
//
// A fixture is what tests/voicequeue/log-to-fixture.mjs prints: { about, sections: [{ name,
// fps, bufferMs, events }] }. replayFixture(fixture) returns, per section, { name, waitTicks,
// engine, faults }: engine and each fault give { packets, ticks, opens, bad, first }, `bad`
// being the ticks on which the channel's bytes are not the logged ones.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { VOICE_CHANNEL, waitTicks, createChannel } = require('../../voice-channel.js');

export const FAULTS = [
  ['ring + 1', () => ({ ring: VOICE_CHANNEL.ring + 1 })],
  ['ring - 1', () => ({ ring: VOICE_CHANNEL.ring - 1 })],
  ['wait + 1', (w) => ({ waitTicks: w + 1 })],
  ['wait - 1', (w) => ({ waitTicks: w - 1 })],
  ['sample kept', () => ({ keepSample: true })],
  ['no grace', () => ({ noGrace: true })],
];

// A section without a name is named by its place, one without bufferMs has voice_buffer_ms's
// default; fps and the events must be there.
export function validFixture(f) {
  if (!f || !Array.isArray(f.sections) || !f.sections.length) throw new Error('a fixture is { about, sections: [...] } with at least one section');
  f = { ...f, sections: f.sections.map((s, i) => ({ ...s, name: typeof s.name === 'string' ? s.name : `section ${i + 1}`, bufferMs: s.bufferMs === undefined ? VOICE_CHANNEL.bufferMs : s.bufferMs })) };
  for (const [i, s] of f.sections.entries()) {
    const where = `section ${i + 1}`;
    for (const k of ['fps', 'bufferMs']) if (typeof s[k] !== 'number' || !Number.isFinite(s[k]) || s[k] <= 0) throw new Error(`${where}: ${k} is not a positive number`);
    const ev = s.events;
    if (!Array.isArray(ev) || ev.length % 2) throw new Error(`${where}: events must be a flat list of pairs`);
    for (let k = 0; k < ev.length; k += 2) {
      const kind = ev[k], v = ev[k + 1];
      if (!Number.isInteger(kind) || kind < 0 || kind > 3 || !Number.isInteger(v)) throw new Error(`${where}: event pair ${k / 2} is not kind 0 to 3 and a whole number`);
      // A packet is at most 11264 samples (Steam's decoder writes into 22528 bytes, W3-03 §3);
      // a million bounds packets and pulls far above any log.
      if ((kind === 0 && v !== 0) || ((kind === 1 || kind === 2) && (v < 0 || v > 1e6)) || (kind === 3 && v < -1)) throw new Error(`${where}: event pair ${k / 2} has an impossible value`);
    }
  }
  return f;
}

// One section through createChannel: packets of zeros, the mixer's demand, ticks; after each
// tick the channel's bytes (-1 when free) against the log's.
export function replay(section, test) {
  const opts = { fps: section.fps, bufferMs: section.bufferMs, test };
  const ev = section.events;
  let ch = createChannel(opts), opens = 0, packets = 0, ticks = 0, bad = 0, first = null;
  for (let k = 0; k < ev.length; k += 2) {
    const kind = ev[k], v = ev[k + 1];
    if (kind === 0) { opens += ch.opens; ch = createChannel(opts); }
    else if (kind === 1) { ch.add(new Float32Array(v)); packets++; }
    else if (kind === 2) { if (v > 0) ch.pull(v); }      // a demand of 0: the mixer did not ask
    else {
      ch.tick(); ticks++;
      const got = ch.inUse ? 2 * ch.count : -1;
      if (got !== v) { bad++; if (!first) first = { pair: k / 2, tick: ticks, logged: v, model: got }; }
    }
  }
  return { packets, ticks, opens: opens + ch.opens, bad, first };
}

export function replayFixture(fixture) {
  return validFixture(fixture).sections.map((s) => {
    const w = waitTicks(s.bufferMs, s.fps);
    return { name: s.name, waitTicks: w, engine: replay(s), faults: FAULTS.map(([label, make]) => ({ label, ...replay(s, make(w)) })) };
  });
}
