// The voice in a SourceTV demo, per speaker, with the app's own reader
// (demo.js) and its bundled codecs.
//
//   node tests/demovoice/extract.mjs <demo.dem> [--out <folder>]
//
// Prints the demo's header and, per speaker, the frames, talk spurts, DTX
// frames, frames lost before the server, the bitrate while coding and the
// Opus TOC configurations. Writes per speaker, into --out (default: the
// demo's folder):
//   <demo>.<speaker>.wav          16-bit, at the codec's rate, each spurt at its tick
//   <demo>.<speaker>.packets.tsv  every packet: tick, kind, sequence number, bytes
//   <demo>.<speaker>.frames.tsv   the decoded frame log: frame, start (s), code, bytes
// Frame codes are opus-codec.mjs's: 0 nothing sent, 1 SILK, 2 hybrid,
// 3 CELT, 4 DTX, 5 lost (concealed).
//
// Speakers are named by SteamID. Demos and everything written here hold
// players' voices and SteamIDs: keep them out of the repository.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as opus from '../../vendor/libopus-1.1/index.mjs';
import { createCodec } from '../../vendor/celt-0.11/index.mjs';

const require = createRequire(import.meta.url);
const D = require('../../demo.js');

const args = process.argv.slice(2), outAt = args.indexOf('--out');
const outDir = outAt >= 0 ? args[outAt + 1] : null;
const input = args.find((a, i) => outAt < 0 || (i !== outAt && i !== outAt + 1));
if (!input || (outAt >= 0 && !outDir)) {
  console.error('usage: node tests/demovoice/extract.mjs <demo.dem> [--out <folder>]');
  process.exit(2);
}
const folder = outDir || path.dirname(input), base = path.basename(input).replace(/\.dem$/i, '');
fs.mkdirSync(folder, { recursive: true });

const parsed = D.parse(fs.readFileSync(input));
const h = parsed.header;
const codecs = parsed.codecs.map(c => `${c.codec}${c.rate ? ` (${c.rate} Hz)` : ''}`).join(' / ') || 'none announced';
console.log(`${h.server || 'server'} on ${h.map}, ${h.seconds.toFixed(1)} s, ${h.ticks} ticks of ${(parsed.intervalPerTick * 1000).toFixed(1)} ms; voice codec ${codecs}`);
console.log(`${parsed.voice.length} voice messages, ${parsed.unreadable} unreadable, ${parsed.errors} packets with unreadable messages; ${parsed.speakers.length} speaker${parsed.speakers.length === 1 ? '' : 's'}`);
if (parsed.voice.length && !parsed.speakers.length) console.log('  no voice payloads: a client demo (`record`) keeps the messages but not the audio');

function writeWav(file, samples, rate) {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples.length * 2, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(samples.length * 2, 40);
  for (let k = 0; k < samples.length; k++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[k] * 32768))), 44 + 2 * k);
  fs.writeFileSync(file, out);
}

for (const sp of parsed.speakers) {
  const decoded = await D.decode(parsed, sp, {
    opus: (rate) => opus.createDecoder({ sampleRate: rate, channels: 1 }),
    celt: (rate, frame, bytes) => createCodec(rate, frame, { packetBytes: bytes })
  });
  // The bitrate while coding: frames over 2 bytes (DTX frames are 1-2).
  const coded = sp.packets.filter(p => p.data && p.data.length > 2);
  const kbps = coded.length ? coded.reduce((n, p) => n + p.data.length, 0) * 8 / (coded.length * decoded.frameSeconds) / 1000 : 0;
  const tocs = Object.entries(sp.tocs).map(([c, n]) => `${c}: ${n}`).join(', ');
  console.log(`  ${sp.id}: ${sp.frames} frames in ${sp.spurts} talk spurt${sp.spurts === 1 ? '' : 's'}, ${sp.dtx} DTX, ${sp.lost} lost before the server, `
    + `${kbps.toFixed(1)} kbps while coding${sp.codec === 'steam' ? `, TOC configurations {${tocs}}` : ''}; codec ${sp.codec} at ${decoded.rate} Hz`);
  console.log(`    decoded: ${(decoded.samples.length / decoded.rate).toFixed(2)} s in ${decoded.spurts} spurt${decoded.spurts === 1 ? '' : 's'} placed at their ticks, ${decoded.concealed} lost frame${decoded.concealed === 1 ? '' : 's'} concealed`);
  const name = path.join(folder, `${base}.${sp.id.replace(/[^\w-]+/g, '')}`);
  writeWav(`${name}.wav`, decoded.samples, decoded.rate);
  fs.writeFileSync(`${name}.packets.tsv`, ['tick\tkind\tseq\tbytes', ...sp.packets.map(p =>
    [p.tick, p.kind, p.seq ?? '', p.data ? p.data.length : p.kind === 'silence' ? `${p.samples} samples` : ''].join('\t'))].join('\n') + '\n');
  fs.writeFileSync(`${name}.frames.tsv`, ['frame\tstart_s\tcode\tbytes', ...Array.from(decoded.frameLog, (code, f) =>
    [f, (f * decoded.frameSeconds).toFixed(3), code, decoded.frameBytes[f]].join('\t'))].join('\n') + '\n');
  console.log(`    -> ${name}.wav, .packets.tsv, .frames.tsv`);
}
