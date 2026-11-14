// The voice in a SourceTV demo, per speaker, with the app's own reader
// (demo.js) and its bundled codecs.
//
//   node tests/demovoice/extract.mjs <demo.dem> [--out <folder>] [--speaker <id>]
//       [--timeline game [--fps <n>] [--buffer-ms <n>]]
//
// Prints the demo's header and, per speaker, the frames, talk spurts, DTX
// frames, frames lost before the server, the bitrate while coding and the
// Opus TOC configurations. Writes per speaker, into --out (default:
// tests/demovoice/out/, which .gitignore covers, wherever the demo is):
//   <demo>.<speaker>.wav          16-bit, at the codec's rate, each spurt at its tick
//   <demo>.<speaker>.packets.tsv  every packet: tick, kind, sequence number, bytes
//   <demo>.<speaker>.frames.tsv   the decoded frame log: frame, start (s), code, bytes
// Frame codes are opus-codec.mjs's: 0 nothing sent, 1 SILK, 2 hybrid,
// 3 CELT, 4 DTX, 5 lost (concealed).
// --speaker <id> keeps to that speaker. --timeline game (W3-02g) also
// renders each Steam speaker whose voice is at 24000 Hz on the game's voice
// queue, with TF2Audio.process (the engine as the suites load it,
// tests/lib/engine.cjs): the demo's own packets on the demo's own ticks,
// through Steam's decoder as read and the receiver's voice channel at --fps
// (fps_max, default 300) and --buffer-ms (voice_buffer_ms, default 100), the
// receiver's other settings the game's defaults, volume 1, the device at
// 48000 Hz and no room. It prints the counts of codecInfo.demo and the
// channel's opens, joins and dropped ms, and writes:
//   <demo>.<speaker>.game-<fps>.wav          16-bit at 48000 Hz, the render
//   <demo>.<speaker>.game-<fps>.phrases.tsv  each phrase of the channel
//     (codecInfo.channel.spurts): its start and end in the source's seconds,
//     opened or joined (the queue), offsetStartMs, offsetEndMs and droppedMs,
//     and its change against the phrase before (its offsetStartMs less that
//     phrase's offsetEndMs)
//
// Speakers are named by SteamID. Demos and everything written here hold
// players' voices and SteamIDs: keep them out of the repository.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as opus from '../../vendor/libopus-1.1/index.mjs';
import { createCodec } from '../../vendor/celt-0.11/index.mjs';

const require = createRequire(import.meta.url);
const D = require('../../demo.js');

const USAGE = 'usage: node tests/demovoice/extract.mjs <demo.dem> [--out <folder>] [--speaker <id>] [--timeline game [--fps <n>] [--buffer-ms <n>]]';
const args = process.argv.slice(2), opt = {}, rest = [];
for (let i = 0; i < args.length; i++) {
  const name = { '--out': 'out', '--speaker': 'speaker', '--timeline': 'timeline', '--fps': 'fps', '--buffer-ms': 'bufferMs' }[args[i]];
  if (!name) { rest.push(args[i]); continue; }
  if (i + 1 >= args.length) { console.error(USAGE); process.exit(2); }
  opt[name] = args[++i];
}
const outDir = opt.out ?? null, input = rest[0];
const number = (v, d) => (v === undefined ? d : Number(v));
const fps = number(opt.fps, 300), bufferMs = number(opt.bufferMs, 100);
if (!input || rest.length > 1 || (opt.timeline !== undefined && opt.timeline !== 'game') || !Number.isFinite(fps) || fps <= 0
    || !Number.isFinite(bufferMs) || bufferMs <= 0 || ((opt.fps !== undefined || opt.bufferMs !== undefined) && opt.timeline !== 'game')) {
  console.error(USAGE);
  process.exit(2);
}
// Never beside the demo: a demo in the repository's root would leave voices
// and SteamIDs where .gitignore does not reach.
const folder = outDir || fileURLToPath(new URL('./out/', import.meta.url)), base = path.basename(input).replace(/\.dem$/i, '');
fs.mkdirSync(folder, { recursive: true });

const parsed = D.parse(fs.readFileSync(input));
const h = parsed.header;
const codecs = parsed.codecs.map(c => `${c.codec}${c.rate ? ` (${c.rate} Hz)` : ''}`).join(' / ') || 'none announced';
console.log(`${h.server || 'server'} on ${h.map}, ${h.seconds.toFixed(1)} s, ${h.ticks} ticks of ${(parsed.intervalPerTick * 1000).toFixed(1)} ms; voice codec ${codecs}`);
console.log(`${parsed.voice.length} voice messages, ${parsed.unreadable} unreadable, ${parsed.errors} packets with unreadable messages; ${parsed.speakers.length} speaker${parsed.speakers.length === 1 ? '' : 's'}`);
console.log(`writing to ${path.resolve(folder)}`);
if (parsed.voice.length && !parsed.speakers.length) console.log('  no voice payloads: a client demo (`record`) keeps the messages but not the audio');

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function writeWav(file, samples, rate) {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples.length * 2, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(samples.length * 2, 40);
  for (let k = 0; k < samples.length; k++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[k] * 32768))), 44 + 2 * k);
  fs.writeFileSync(file, out);
}

// The engine, for --timeline game only.
const A = opt.timeline === 'game' ? (await (async () => {
  const { loadEngine } = require('../lib/engine.cjs');
  return loadEngine({ codec: await import('../../opus-codec.mjs') }).audio;
})()) : null;
const speakers = opt.speaker === undefined ? parsed.speakers : parsed.speakers.filter(sp => sp.id === opt.speaker);
if (opt.speaker !== undefined && !speakers.length) console.log(`  no speaker ${opt.speaker} in this demo`);

for (const sp of speakers) {
  const decoded = await D.decode(parsed, sp, {
    opus: (rate) => opus.createDecoder({ sampleRate: rate, channels: 1 }),
    celt: (rate, frame, bytes) => createCodec(rate, frame, { packetBytes: bytes })
  });
  // The bitrate while coding: frames over 2 bytes (DTX frames are 1-2).
  const coded = sp.packets.filter(p => p.data && p.data.length > 2);
  const kbps = coded.length ? coded.reduce((n, p) => n + p.data.length, 0) * 8 / (coded.length * decoded.frameSeconds) / 1000 : 0;
  const tocs = Object.entries(sp.tocs).map(([c, n]) => `${c}: ${n}`).join(', ');
  // Steam packets say where spurts start and what was lost; the legacy
  // codecs' bare packets do not, so their spurts come from the decode (gaps
  // in ticks) and their losses are unknown.
  console.log(sp.codec === 'steam'
    ? `  ${sp.id}: ${sp.frames} frames in ${plural(sp.spurts, 'talk spurt')}, ${sp.dtx} DTX, ${sp.lost} lost before the server, `
      + `${kbps.toFixed(1)} kbps while coding, TOC configurations {${tocs}}; codec ${sp.codec} at ${decoded.rate} Hz`
    : `  ${sp.id}: ${sp.frames} frames in ${plural(decoded.spurts, 'talk spurt')} (from gaps in ticks), losses before the server unknown (no sequence numbers), `
      + `${kbps.toFixed(1)} kbps; codec ${sp.codec} at ${decoded.rate} Hz`);
  console.log(`    decoded: ${(decoded.samples.length / decoded.rate).toFixed(2)} s in ${decoded.spurts} spurt${decoded.spurts === 1 ? '' : 's'} placed at their ticks, ${decoded.concealed} lost frame${decoded.concealed === 1 ? '' : 's'} concealed`);
  const name = path.join(folder, `${base}.${sp.id.replace(/[^\w-]+/g, '')}`);
  writeWav(`${name}.wav`, decoded.samples, decoded.rate);
  fs.writeFileSync(`${name}.packets.tsv`, ['tick\tkind\tseq\tbytes', ...sp.packets.map(p =>
    [p.tick, p.kind, p.seq ?? '', p.data ? p.data.length : p.kind === 'silence' ? `${p.samples} samples` : ''].join('\t'))].join('\n') + '\n');
  fs.writeFileSync(`${name}.frames.tsv`, ['frame\tstart_s\tcode\tbytes', ...Array.from(decoded.frameLog, (code, f) =>
    [f, (f * decoded.frameSeconds).toFixed(3), code, decoded.frameBytes[f]].join('\t'))].join('\n') + '\n');
  console.log(`    -> ${name}.wav, .packets.tsv, .frames.tsv`);
  if (A) await gameTimeline(sp, decoded, name);
}

// One speaker on the game's voice queue (--timeline game).
async function gameTimeline(sp, decoded, name) {
  if (sp.codec !== 'steam' || decoded.rate !== 24000 || !decoded.packets.every(p => p.rate === null || p.rate === 24000)) {
    console.log(`    game's timeline: not rendered, the voice is not Steam voice at 24000 Hz`);
    return;
  }
  const source = { sampleRate: decoded.rate, length: decoded.samples.length, numberOfChannels: 1, getChannelData: () => decoded.samples };
  const received = { frameLog: Array.from(decoded.frameLog), frameBytes: Array.from(decoded.frameBytes), frameMs: 20, spurts: decoded.spurts,
    packets: decoded.packets, firstTick: decoded.firstTick, tickSeconds: decoded.tickSeconds };
  const r = await A.process(source, { codec: 'steam', received, timeline: 'game', fps, bufferMs, volume: 1, deviceRate: 48000 });
  const d = r.codecInfo.demo, c = r.codecInfo.channel;
  console.log(`    game's timeline at ${fps} fps, voice_buffer_ms ${bufferMs}: ${plural(d.messages, 'message')}, ${d.pushed} given to the channel, `
    + `${d.sameTick} on the tick of the one before, ${d.refusedMessages} refused (over 12 frames), ${plural(d.cutRecords, 'record')} cut at 17 frames `
    + `(${plural(d.unreadFrames, 'frame')} not decoded), ${plural(d.concealed, 'frame')} concealed, ${plural(d.resets, 'decoder reset')}, `
    + `${plural(d.droppedSilence, 'silence record')} dropped, ${d.pastEnd} past the render's end; the channel opened ${plural(c.opens, 'time')}, `
    + `${plural(c.appended, 'phrase')} joined the queue, ${(c.droppedSamples / 44.1).toFixed(1)} ms dropped`);
  const file = `${name}.game-${fps}`;
  fs.writeFileSync(`${file}.wav`, Buffer.from(await r.blob.arrayBuffer()));
  const ms = (v) => (v === null ? '' : v.toFixed(1));
  fs.writeFileSync(`${file}.phrases.tsv`, ['start_s\tend_s\tqueue\toffset_start_ms\toffset_end_ms\tdropped_ms\tchange_ms', ...c.spurts.map((s, k) => {
    const before = k ? c.spurts[k - 1].offsetEndMs : null;
    const change = s.offsetStartMs !== null && before !== null ? s.offsetStartMs - before : null;
    return [s.start.toFixed(3), s.end.toFixed(3), s.opened ? 'opened' : 'joined', ms(s.offsetStartMs), ms(s.offsetEndMs), ms(s.droppedMs), ms(change)].join('\t');
  })].join('\n') + '\n');
  console.log(`    -> ${file}.wav, .phrases.tsv`);
}
