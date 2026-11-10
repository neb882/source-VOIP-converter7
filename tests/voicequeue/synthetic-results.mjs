// A stand-in for the private accuracy results, made by the sender (steam-sender.js) and the
// game's timeline (voice-channel.js, createTimeline): W3-02b's spec 4 in
// docs/work-orders/W3-02-receiver-queue.md.
//
//   node tests/voicequeue/synthetic-results.mjs > synthetic.json
//
// It prints a file in the shape tests/retiming.mjs reads: one result, synthetic_speech, set S,
// of 12 spurts of 2 s separated by silences of 300, 900, 160, 140, 1200, 360, 440, 200, 600,
// 120 and 300 ms, with one segment per spurt whose delayMs is 2000 + the spurt's start offset
// at 300 fps and seed 7. The sound is 1000 in a spurt and 0 outside; a message's pcm is zeros,
// 882 samples a frame, and round(samples x 44100 / 24000) for a silence record.
//
// It also exports what tests/retiming.mjs --engine runs on a take: engineRun (a signal of
// loud spans through the sender and the timeline) and offsetsOf (each source span's start and
// end offset, read from the timeline's info.source).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createSender, STEAM_SENDER } = require('../../steam-sender.js');
const { createTimeline, VOICE_CHANNEL } = require('../../voice-channel.js');

const RATE = STEAM_SENDER.rate, OUT = VOICE_CHANNEL.rate, PER_FRAME = OUT * STEAM_SENDER.frame / RATE;   // 882
const SLOT = OUT * 0.02, MID = SLOT / 2, INTO = 0.2;

// loud: [[from, to)] in seconds, each 1000 in a signal of `seconds` at 24 kHz, 0 elsewhere.
// Returns the timeline's info (44.1 kHz positions) and the sender's messages.
export function engineRun({ loud, seconds, fps, bufferMs, seed }) {
  const n = Math.round(seconds * RATE);
  const signal = new Int16Array(n);
  for (const [a, b] of loud) signal.fill(1000, Math.max(0, Math.round(a * RATE)), Math.min(n, Math.round(b * RATE)));
  const sender = createSender({ seed });
  const messages = [...sender.push(signal), ...sender.finish()];
  const timeline = createTimeline({ fps, bufferMs, length: Math.round(n * OUT / RATE) });
  for (const m of messages) {
    if (m.silence !== undefined) timeline.push({ tick: m.tick, pcm: new Float32Array(Math.round(m.silence * OUT / RATE)), source: -1 });
    else timeline.push({ tick: m.tick, pcm: new Float32Array(PER_FRAME * (m.last - m.first + 1)), source: Math.round(m.start * OUT / RATE) });
  }
  return { info: timeline.finish().info, messages };
}

// spans: [[start, end)] in source seconds. For each, the offset in ms (output less source,
// latency taken out) at the first 20 ms slot that plays a sample at least 0.2 s into the span
// (or its first slot, if none does), and at its last slot; null where nothing of it played.
// The timeline's info.source gives the source position at each slot's centre, so the offset
// there is exact.
export function offsetsOf(info, spans) {
  const src = info.source;
  return spans.map(([s, e]) => {
    const a = s * OUT, b = e * OUT, into = (s + INTO) * OUT;
    let first = null, start = null, end = null;
    for (let i = 0; i < src.length; i++) {
      const p = src[i];
      if (p < 0 || p < a || p >= b) continue;
      const off = (i * SLOT + MID - p) / (OUT / 1000);
      if (first === null) first = off;
      if (start === null && p >= into) start = off;
      end = off;
    }
    return { start: start !== null ? start : first, end };
  });
}

const SILENCES = [300, 900, 160, 140, 1200, 360, 440, 200, 600, 120, 300];

export function syntheticResults() {
  const lead = 1, spurt = 2, tail = 1.5;
  const loud = [];
  let t = lead;
  for (let k = 0; k <= SILENCES.length; k++) {
    loud.push([t, t + spurt]);
    t += spurt + (k < SILENCES.length ? SILENCES[k] / 1000 : 0);
  }
  const seconds = t + tail;
  const { info } = engineRun({ loud, seconds, fps: 300, seed: 7 });
  const offsets = offsetsOf(info, loud);
  // The gate model's spurts around the loud parts: its 120 ms of pre-roll and 440 ms of hold.
  const round = (x) => Math.round(x * 1e6) / 1e6;
  const gateSpurts = loud.map(([a, b]) => ({ start: round(a - 0.12), end: round(b + 0.44) }));
  return {
    generated: 'tests/voicequeue/synthetic-results.mjs: steam-sender.js and createTimeline at 300 fps, seed 7',
    results: [{
      name: 'synthetic_speech', set: 'S', random: false, gateSpurts,
      timeline: { segments: gateSpurts.map((g, k) => ({ spurt: k, start: g.start, end: g.end, delayMs: round(2000 + offsets[k].start) })) },
    }],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(`${JSON.stringify(syntheticResults(), null, 2)}\n`);
}
