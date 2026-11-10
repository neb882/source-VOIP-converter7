// TF2 demos (demo.js): a synthetic SourceTV demo, written here bit by bit,
// with Steam voice (Opus packets with sequence numbers, a lost frame, a DTX
// frame and end-of-transmission markers, from two speakers), messages that
// must be skipped at odd bit offsets, and a legacy vaudio_celt demo; then
// talk spurts whose end marker was lost, real and impossible losses and the
// 16-bit wrap of sequence numbers, and the extraction tool
// (tests/demovoice/extract.mjs). Real demos are players' voices and stay out
// of the repository.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as opus from '../vendor/libopus-1.1/index.mjs';
import { createCodec } from '../vendor/celt-0.11/index.mjs';
import { audioEngine } from './reference.compare.mjs';

const require = createRequire(import.meta.url);
const D = require('../demo.js');
const engine = audioEngine(), A = engine.audio;
// The sandbox has no import loader; the full chain gets the codec module injected.
engine.sandbox.TF2Opus = await import('../opus-codec.mjs');
let passed = 0;
function check(name, ok, detail = '') { assert.ok(ok, `${name} ${detail}`); passed++; console.log(`  ok    ${name}${detail ? `   [${detail}]` : ''}`); }

// Bits least significant first, as Source writes them.
class BitWriter {
  constructor() { this.bytes = []; this.bit = 0; }
  write(value, n) {
    for (let i = 0; i < n; i++) {
      if ((this.bit & 7) === 0) this.bytes.push(0);
      if (Math.floor(value / 2 ** i) % 2) this.bytes[this.bytes.length - 1] |= 1 << (this.bit & 7);
      this.bit++;
    }
  }
  string(s) { for (const c of s) this.write(c.charCodeAt(0), 8); this.write(0, 8); }
  data(u8) { for (const b of u8) this.write(b, 8); }
  get u8() { return Uint8Array.from(this.bytes); }
}

function crc32(d) {
  let crc = 0xFFFFFFFF;
  for (const b of d) { crc ^= b; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); }
  return (~crc) >>> 0;
}

// Steam voice payload: SteamID, sample rate section, Opus section, CRC32.
// The test speakers' SteamIDs are in universe 0, which Steam reserves as
// invalid, so they cannot be anyone's account: 4503603922337793 and
// 4503603922337794 are individual accounts 1 and 2 there.
function steamPayload(steamId, frames) {
  const opusBytes = [];
  for (const f of frames) {
    if (f === 'end') { opusBytes.push(0xFF, 0xFF); continue; }
    opusBytes.push(f.data.length & 255, f.data.length >> 8, f.seq & 255, f.seq >> 8, ...f.data);
  }
  const body = [];
  const id = new DataView(new ArrayBuffer(8));
  id.setBigUint64(0, BigInt(steamId), true);
  body.push(...new Uint8Array(id.buffer), 11, 24000 & 255, 24000 >> 8, 6, opusBytes.length & 255, opusBytes.length >> 8, ...opusBytes);
  const crc = crc32(body);
  body.push(crc & 255, (crc >>> 8) & 255, (crc >>> 16) & 255, crc >>> 24);
  return Uint8Array.from(body);
}

// A demo: header, then frames of network messages (one packet per frame).
function demoFile(packets, { ticks = 1000, seconds = 15 } = {}) {
  const header = new Uint8Array(1072), dv = new DataView(header.buffer);
  header.set([...'HL2DEMO'].map(c => c.charCodeAt(0)));
  dv.setInt32(8, 3, true); dv.setInt32(12, 24, true);
  header.set([...'Synthetic test'].map(c => c.charCodeAt(0)), 16);
  header.set([...'ctf_2fort'].map(c => c.charCodeAt(0)), 536);
  dv.setFloat32(1056, seconds, true); dv.setInt32(1060, ticks, true); dv.setInt32(1064, packets.length, true);
  const parts = [header];
  // A data table frame the parser skips.
  const table = new Uint8Array(1 + 4 + 4 + 5); table[0] = 6; new DataView(table.buffer).setUint32(5, 5, true); parts.push(table);
  for (const { tick, messages } of packets) {
    const w = new BitWriter();
    for (const m of messages) m(w);
    const data = w.u8, frame = new Uint8Array(1 + 4 + 84 + 4 + data.length), fv = new DataView(frame.buffer);
    frame[0] = 2; fv.setInt32(1, tick, true); fv.setUint32(89, data.length, true); frame.set(data, 93);
    parts.push(frame);
  }
  parts.push(Uint8Array.of(7, 0, 0, 0, 0));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => { out.set(p, at); return at + p.length; }, 0);
  return out;
}
const msg = {
  pause: (w) => { w.write(11, 6); w.write(1, 1); },                                   // leaves the stream off byte alignment
  print: (text) => (w) => { w.write(7, 6); w.string(text); },
  netTick: (w) => { w.write(3, 6); w.write(1234, 32); w.write(15, 16); w.write(1, 16); },
  gameEvent: (w) => { w.write(25, 6); w.write(37, 11); w.write(0x1FFFFFFFFF, 37); },
  entities: (w) => { w.write(26, 6); w.write(24, 11); w.write(1, 1); w.write(77, 32); w.write(0, 1); w.write(3, 11); w.write(13, 20); w.write(0, 1); w.write(8191, 13); },
  voiceInit: (codec, quality = 255, rate = 0) => (w) => { w.write(14, 6); w.string(codec); w.write(quality, 8); if (quality === 255) w.write(rate, 16); },
  voice: (client, payload) => (w) => { w.write(15, 6); w.write(client, 8); w.write(0, 8); w.write(payload.length * 8, 16); w.data(payload); }
};

console.log('\n[Demo] Voice in a TF2 demo');
const rate = 24000, tone = (n, at) => Float32Array.from({ length: n }, (_, i) => .3 * Math.sin(2 * Math.PI * 440 * (at + i) / rate));
const encoder = await opus.createEncoder({ sampleRate: rate, channels: 1, bitrate: 32000, vbr: true, complexity: 10 });
const packets = Array.from({ length: 30 }, (_, k) => encoder.encodeFloat(tone(480, 480 * k)));
encoder.free();
// Speaker 1: frames 0-13, frame 14 lost, 15-19, a DTX frame, end; a second
// spurt of frames 0-9 at tick 400 (6 s at 15 ms). Speaker 2: one spurt.
const first = [...packets.slice(0, 14).map((data, i) => ({ seq: 100 + i, data })), ...packets.slice(15, 20).map((data, i) => ({ seq: 115 + i, data })),
  { seq: 120, data: Uint8Array.of(packets[0][0]) }, 'end'];
const second = [...packets.slice(20, 30).map((data, i) => ({ seq: 7 + i, data })), 'end'];
const bytes = demoFile([
  { tick: 100, messages: [msg.netTick, msg.print('hello'), msg.voiceInit('steam'), msg.pause, msg.entities] },
  { tick: 200, messages: [msg.pause, msg.voice(1, steamPayload('4503603922337793', first.slice(0, 10))), msg.gameEvent] },
  { tick: 201, messages: [msg.voice(1, steamPayload('4503603922337793', first.slice(10))), msg.pause, msg.voice(2, steamPayload('4503603922337794', second.slice(0, 5)))] },
  { tick: 400, messages: [msg.voice(1, steamPayload('4503603922337793', second)), msg.voice(2, steamPayload('4503603922337794', second.slice(5)))] },
  { tick: 401, messages: [msg.voice(3, Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12))] }  // bad CRC
]);
// tests/demo/synthetic.dem is this demo, for the browser test (browser.verify.js).
const fixture = new URL('./demo/synthetic.dem', import.meta.url);
if (process.argv.includes('--write-fixture')) { fs.mkdirSync(new URL('./demo/', import.meta.url), { recursive: true }); fs.writeFileSync(fixture, bytes); }
check('tests/demo/synthetic.dem is this demo', fs.existsSync(fixture) && Buffer.compare(fs.readFileSync(fixture), Buffer.from(bytes)) === 0,
  'node tests/demo.verify.mjs --write-fixture rewrites it');
const parsed = D.parse(bytes);
check('The header and the tick length are read', parsed.header.map === 'ctf_2fort' && parsed.header.protocol === 24 && Math.abs(parsed.intervalPerTick - .015) < 1e-9,
  `${parsed.header.map}, protocol ${parsed.header.protocol}`);
check('Every message is read, including ones that leave the stream off byte alignment', parsed.errors === 0 && parsed.voice.length === 6 && parsed.codecs[0].codec === 'steam',
  `${parsed.voice.length} voice messages, ${parsed.errors} errors`);
const [s1, s2] = parsed.speakers;
check('Speakers are told apart by SteamID; a payload that fails its CRC is not taken for voice', parsed.speakers.length === 2 && parsed.unreadable === 1
  && s1.id === '4503603922337793' && s2.id === '4503603922337794');
const opusPackets = s1.packets.filter(p => p.kind === 'opus');
check('Every Opus packet comes out byte for byte with its sequence number', opusPackets.length === 30
  && opusPackets.slice(0, 19).every((p, i) => p.seq === first[i].seq && Buffer.compare(Buffer.from(p.data), Buffer.from(first[i].data)) === 0));
check('Frames, talk spurts, DTX and the lost frame are counted', s1.frames === 30 && s1.spurts === 2 && s1.dtx === 1 && s1.lost === 1 && s2.spurts === 1,
  `${s1.frames} frames, ${s1.spurts} spurts, ${s1.dtx} DTX, ${s1.lost} lost`);

const decoded = await D.decode(parsed, s1, { opus: (r) => opus.createDecoder({ sampleRate: r, channels: 1 }) });
const second0 = Math.round(200 * .015 * rate);
check('Talk spurts sit at their demo tick; frames within one run back to back, the lost one concealed',
  decoded.concealed === 1 && decoded.spurts === 2 && decoded.samples.length === second0 + 10 * 480, `${(decoded.samples.length / rate).toFixed(3)} s`);
// Speaker 2's numbers run on (7-16) though its second half arrives 3 s later
// with no marker between: one run, frames back to back.
const decoded2 = await D.decode(parsed, s2, { opus: (r) => opus.createDecoder({ sampleRate: r, channels: 1 }) });
check('A run whose numbers continue stays one run, however late its second half', decoded2.spurts === 1 && decoded2.samples.length === 10 * 480 && decoded2.concealed === 0,
  `${decoded2.spurts} spurt, ${decoded2.samples.length} samples`);
check('The frame log marks coded, lost, DTX and silent frames', decoded.frameLog[14] === 5 && decoded.frameLog[20] === 4
  && decoded.frameLog[5] === 2 && decoded.frameLog[25] === 0 && decoded.frameLog[second0 / 480] === 2);
// The decoded tone: Opus's lookahead delays it by 6.5 ms (156 samples), and
// the SILK layer shifts a low tone a little further (finding 20).
const match = (lag) => {
  let dot = 0, ea = 0, eb = 0;
  const ref = tone(14 * 480, -lag);
  for (let i = 480; i < 14 * 480; i++) { dot += decoded.samples[i] * ref[i]; ea += ref[i] ** 2; eb += decoded.samples[i] ** 2; }
  return dot / Math.sqrt(ea * eb);
};
const lags = Array.from({ length: 41 }, (_, k) => 136 + k), best = lags.reduce((b, l) => (match(l) > match(b) ? l : b));
check('The voice decodes back to the tone', match(best) > .98, `r ${match(best).toFixed(3)} at ${best} samples`);

// Talk spurts after a lost end marker. One speaker's frames as SourceTV
// writes them: the 3 frames (60 ms) sent since the last batch go out together
// every 4 ticks. `lost` frames never reached the server; `end` closes the
// run with its marker.
const opusDecoders = { opus: (r) => opus.createDecoder({ sampleRate: r, channels: 1 }) };
const run = (tick0, seq0, n, { lost = [], end = false } = {}) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const tick = tick0 + 4 * Math.floor(i / 3);
    if (!out.length || out[out.length - 1].tick !== tick) out.push({ tick, frames: [] });
    if (!lost.includes(i)) out[out.length - 1].frames.push({ seq: (seq0 + i) & 0xFFFF, data: packets[i % packets.length] });
  }
  if (end) out[out.length - 1].frames.push('end');
  return out.filter(m => m.frames.length);
};
const steamDemo = (...runs) => D.parse(demoFile(runs.flat().map(({ tick, frames }) => ({ tick, messages: [msg.voice(1, steamPayload('4503603922337793', frames))] }))));
const decodeOne = (demo) => D.decode(demo, demo.speakers[0], opusDecoders);
const at = (tick) => Math.round((tick - 100) * .015 * rate);   // every case starts at tick 100
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
{
  // Ten frames at tick 100 (written up to sample 4800, tick 113.3), then a
  // second spurt whose numbers start again: its marker-carrying packet lost.
  const lostMarkerDemo = steamDemo(run(100, 0, 10), run(300, 0, 10, { end: true }));
  const lostMarker = await decodeOne(lostMarkerDemo), lostCount = lostMarkerDemo.speakers[0].lost;
  const intact = await decodeOne(steamDemo(run(100, 0, 10, { end: true }), run(300, 0, 10, { end: true })));
  check('A spurt after a lost end marker, its numbers starting again, sits at its tick with a fresh decoder, and no frame counts as lost',
    lostMarker.spurts === 2 && lostMarker.concealed === 0 && lostMarker.samples.length === at(300) + 10 * 480 && same(lostMarker.samples, intact.samples) && lostCount === 0,
    `${lostMarker.spurts} spurts, ${(lostMarker.samples.length / rate).toFixed(3)} s, ${same(lostMarker.samples, intact.samples) ? 'the same samples as with its marker' : 'not the samples it has with its marker'}, ${lostCount} counted lost`);
  // The same after 30 minutes of silence: a number going backwards is a
  // break whatever time has passed (65526 frames would fit in 30 minutes).
  const tick30 = 100 + 30 * 60 / .015, longDemo = steamDemo(run(100, 0, 10), run(tick30, 0, 10, { end: true }));
  const long = await decodeOne(longDemo);
  check('and after 30 minutes of silence it is still a new spurt at its tick, nothing concealed',
    long.spurts === 2 && long.concealed === 0 && long.samples.length === at(tick30) + 10 * 480 && longDemo.speakers[0].lost === 0,
    `${long.spurts} spurts, ${long.concealed} concealed, ends at ${(long.samples.length / rate / 60).toFixed(2)} min`);
  // Tick 117 is sample 6120, within four frames (sample 6720) of the write position.
  const close = await decodeOne(steamDemo(run(100, 0, 10), run(117, 0, 10, { end: true })));
  check('the same spurt arriving within four frames of the write position is decoded in place',
    close.spurts === 1 && close.concealed === 0 && close.samples.length === 20 * 480, `${close.spurts} spurt, ${close.samples.length} samples`);
  // Numbers 10-19 continue the run, though they arrive 3.8 s late.
  const late = await decodeOne(steamDemo(run(100, 0, 10), run(500, 10, 10, { end: true })));
  check('A run whose numbers continue is not split however late its packets are',
    late.spurts === 1 && late.concealed === 0 && late.samples.length === 20 * 480, `${late.spurts} spurt, ${late.samples.length} samples`);
  // Frames 10-49 (0.8 s) lost before the server; frame 50 arrives at its time.
  const gap = await decodeOne(steamDemo(run(100, 0, 60, { lost: Array.from({ length: 40 }, (_, k) => 10 + k), end: true })));
  check('A real loss longer than four frames, its numbers jumping by as much, is concealed and not split',
    gap.spurts === 1 && gap.concealed === 40 && gap.samples.length === 60 * 480 && gap.frameLog.slice(10, 50).every(c => c === 5) && gap.frameLog[50] !== 5,
    `${gap.concealed} frames concealed, ${gap.spurts} spurt`);
  // Number 5000 one batch after number 9: 4990 frames in 60 ms.
  const corrupt = await decodeOne(steamDemo(run(100, 0, 10), run(116, 5000, 10, { end: true })));
  check('A jump far larger than the time that passed conceals nothing',
    corrupt.concealed === 0 && corrupt.spurts === 1 && corrupt.samples.length === 20 * 480, `${corrupt.concealed} frames concealed, ${(corrupt.samples.length / rate).toFixed(2)} s`);
  // The slack, from both sides: frames 0-2, then a jump of 24 or 26 frames
  // in the same batch (no time elapsed). 25 frames is half a second.
  const jumpAt = (j) => steamDemo([{ tick: 100, frames: [0, 1, 2, 3 + j, 4 + j, 5 + j].map((seq, i) => ({ seq, data: packets[i] })).concat(['end']) }]);
  const [inside, outside] = await Promise.all([24, 26].map(j => decodeOne(jumpAt(j))));
  check('A jump just inside half a second with no time elapsed is concealed; one just outside it is a break that conceals nothing',
    inside.concealed === 24 && inside.spurts === 1 && inside.samples.length === 30 * 480 && outside.concealed === 0 && outside.spurts === 1 && outside.samples.length === 6 * 480,
    `${inside.concealed} and ${outside.concealed} frames concealed`);
  // The time that passed is counted from the previous packet, not from the
  // spurt's start: 150 frames (3 s), then a 100-frame jump in the last batch.
  const lastTickAt = 100 + 4 * 49;
  const deep = await decodeOne(steamDemo(run(100, 0, 150), [{ tick: lastTickAt, frames: [{ seq: 250, data: packets[0] }, 'end'] }]));
  check('A large jump late in a long spurt with no time since the previous packet conceals nothing',
    deep.concealed === 0 && deep.spurts === 1 && deep.samples.length === 151 * 480, `${deep.concealed} frames concealed`);
  // 65530-65534, then 65535 or 0 lost, then on past the wrap.
  const wrap = [5, 6].map(i => steamDemo(run(100, 65530, 12, { lost: [i], end: true })));
  const wrapped = await Promise.all(wrap.map(decodeOne));
  check('A frame lost at the 16-bit wrap of sequence numbers is concealed and counted',
    wrapped.every((w, k) => w.concealed === 1 && w.frameLog[5 + k] === 5 && w.samples.length === 12 * 480 && w.spurts === 1)
      && wrap.every(w => w.speakers[0].lost === 1 && w.speakers[0].spurts === 1),
    `${wrapped.map(w => w.concealed).join(' and ')} concealed, ${wrap.map(w => w.speakers[0].lost).join(' and ')} counted lost`);
}

// The extraction tool on the fixture: the summary of the checks above, a WAV
// with each spurt at its tick and the packet and frame tables.
{
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tf2ve-extract-'));
  try {
    const printed = execFileSync(process.execPath, [fileURLToPath(new URL('./demovoice/extract.mjs', import.meta.url)), fileURLToPath(fixture), '--out', out], { encoding: 'utf8' });
    const wav = fs.readFileSync(path.join(out, 'synthetic.4503603922337793.wav'));
    const packetRows = fs.readFileSync(path.join(out, 'synthetic.4503603922337793.packets.tsv'), 'utf8').trim().split('\n');
    const frameRows = fs.readFileSync(path.join(out, 'synthetic.4503603922337793.frames.tsv'), 'utf8').trim().split('\n');
    check('tests/demovoice/extract.mjs summarises the fixture as these checks do', /4503603922337793: 30 frames in 2 talk spurts, 1 DTX, 1 lost before the server/.test(printed)
      && /4503603922337794: 10 frames in 1 talk spurt, 0 DTX, 0 lost before the server/.test(printed) && /2 speakers/.test(printed),
      printed.split('\n').find(l => l.includes('4503603922337793')).trim());
    check('and writes the decoded voice, its packets and its frame log', wav.readUInt32LE(24) === rate && wav.readUInt32LE(40) === 2 * decoded.samples.length
      && wav.readInt16LE(44 + 2 * 1000) === Math.max(-32768, Math.min(32767, Math.round(decoded.samples[1000] * 32768)))
      && packetRows.length === 1 + 32 && frameRows.length === 1 + decoded.frameLog.length,
      `${(wav.readUInt32LE(40) / 2 / rate).toFixed(2)} s, ${packetRows.length - 1} packets, ${frameRows.length - 1} frames`);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
  // Without --out it writes to tests/demovoice/out/ (git-ignored), never
  // beside the demo, wherever the demo is and whatever the working folder.
  const away = fs.mkdtempSync(path.join(os.tmpdir(), 'tf2ve-demo-')), base = `tf2ve-check-${process.pid}`;
  const outDir = fileURLToPath(new URL('./demovoice/out/', import.meta.url)), existed = fs.existsSync(outDir);
  try {
    fs.copyFileSync(fixture, path.join(away, `${base}.dem`));
    const printed = execFileSync(process.execPath, [fileURLToPath(new URL('./demovoice/extract.mjs', import.meta.url)), `${base}.dem`], { cwd: away, encoding: 'utf8' });
    const beside = fs.readdirSync(away), written = (fs.existsSync(outDir) ? fs.readdirSync(outDir) : []).filter(f => f.startsWith(`${base}.`));
    check('Without --out the tool writes into tests/demovoice/out/ and nothing beside the demo', beside.join() === `${base}.dem` && written.length === 6
      && printed.includes(`writing to ${path.resolve(outDir)}`), `${beside.length - 1} files beside the demo, ${written.length} in tests/demovoice/out/`);
  } finally {
    fs.rmSync(away, { recursive: true, force: true });
    if (fs.existsSync(outDir)) for (const f of fs.readdirSync(outDir)) if (f.startsWith(`${base}.`)) fs.rmSync(path.join(outDir, f));
    if (!existed && fs.existsSync(outDir) && !fs.readdirSync(outDir).length) fs.rmdirSync(outDir);
  }
}

// Legacy engine codec: bare 64-byte CELT packets, no SteamID or CRC.
const celt = await createCodec(22050, 512, { packetBytes: 64 });
const celtTone = Float32Array.from({ length: 512 * 20 }, (_, i) => .3 * Math.sin(2 * Math.PI * 440 * i / 22050));
const celtPackets = Array.from({ length: 20 }, (_, k) => celt.encode(celtTone.subarray(512 * k, 512 * (k + 1))));
celt.free();
const join = (list) => { const out = new Uint8Array(list.reduce((n, p) => n + p.length, 0)); list.reduce((at, p) => { out.set(p, at); return at + p.length; }, 0); return out; };
const legacyBytes = demoFile([
  { tick: 10, messages: [msg.voiceInit('vaudio_celt', 5)] },
  { tick: 20, messages: [msg.voice(4, join(celtPackets.slice(0, 10)))] },
  { tick: 21, messages: [msg.pause, msg.voice(4, join(celtPackets.slice(10)))] }
]);
const legacy = D.parse(legacyBytes);
const ls = legacy.speakers[0];
check('A vaudio_celt demo gives its 64-byte packets at 22050 Hz', legacy.codecs[0].rate === 22050 && ls && ls.codec === 'vaudio_celt' && ls.frames === 20,
  ls ? `${ls.frames} packets` : 'no speaker');
const legacyAudio = await D.decode(legacy, ls, { celt: (r, f, b) => createCodec(r, f, { packetBytes: b }) });
check('and decodes with CELT 0.11 into one talk spurt', legacyAudio.samples.length === 20 * 512 && legacyAudio.spurts === 1 && legacyAudio.frameLog.every(c => c === 3));
{
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tf2ve-extract-'));
  try {
    fs.writeFileSync(path.join(out, 'legacy.dem'), legacyBytes);
    const line = execFileSync(process.execPath, [fileURLToPath(new URL('./demovoice/extract.mjs', import.meta.url)), path.join(out, 'legacy.dem'), '--out', out], { encoding: 'utf8' })
      .split('\n').find(l => l.includes('client 4:')) || '';
    check('and the tool counts its talk spurts from the decode', /20 frames in 1 talk spurt \(from gaps in ticks\)/.test(line), line.trim());
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
}

// vaudio_celt_high: the 44100 Hz CELT mode with 1024-sample frames and
// 128-byte packets, fed 22050 Hz sound (W3-03). Before W3-06 the reader cut
// such a demo's voice into 120-byte packets of 256 samples at 44100 Hz, and
// none of it came out as sound.
const lag = (a, b, from, to) => {
  let best = from, r = -Infinity;
  for (let l = from; l <= to; l++) {
    let dot = 0, ea = 0, eb = 0;
    for (let i = 2048; i < a.length - 2048; i++) { dot += a[i] * b[i + l]; ea += a[i] ** 2; eb += b[i + l] ** 2; }
    if (dot / Math.sqrt(ea * eb) > r) { r = dot / Math.sqrt(ea * eb); best = l; }
  }
  return { lag: best, r };
};
{
  const high = await createCodec(44100, 1024, { packetBytes: 128, complexity: 5 });
  const tone = Float32Array.from({ length: 1024 * 12 }, (_, i) => .3 * Math.sin(2 * Math.PI * 440 * i / 22050));
  const packets = Array.from({ length: 12 }, (_, k) => high.encode(tone.subarray(1024 * k, 1024 * (k + 1))));
  const lookahead = high.lookahead;
  high.free();
  const parsedHigh = D.parse(demoFile([
    { tick: 10, messages: [msg.voiceInit('vaudio_celt_high', 5)] },
    { tick: 20, messages: [msg.voice(4, join(packets.slice(0, 6)))] },
    { tick: 21, messages: [msg.voice(4, join(packets.slice(6)))] }
  ]));
  const hs = parsedHigh.speakers[0];
  check('A vaudio_celt_high demo gives its 128-byte packets, at 22050 Hz', hs && hs.codec === 'vaudio_celt_high' && hs.rate === 22050
    && hs.frames === 12 && hs.packets.every(p => p.data.length === 128), hs ? `${hs.frames} packets` : 'no speaker');
  const made = [];
  const audio = await D.decode(parsedHigh, hs, { celt: (r, f, b) => { made.push([r, f, b]); return createCodec(r, f, { packetBytes: b }); } });
  const { lag: at, r } = lag(tone, audio.samples, 0, 200);
  check('and decodes with the 44100 Hz mode into the tone it was made from, at 22050 Hz', made.join() === '44100,1024,128' && audio.rate === 22050
    && audio.samples.length === 12 * 1024 && audio.frameSamples === 1024 && Math.abs(audio.frameSeconds - 1024 / 22050) < 1e-12
    && at === lookahead && r > .99, `codec ${made.join(' ')}, delay ${at} samples, r ${r.toFixed(4)}`);
}

// With the pitch filter compiled in (the game's build, W3-08), a vaudio_celt
// packet whose filter flag is set decodes. The build bundled before refused
// every such packet (CELT_CORRUPTED_DATA), so a real vaudio_celt demo of a
// pitched voice did not decode.
{
  const { filterFlag } = await import('./celt011/build.mjs');
  const enc = await createCodec(22050, 512, { packetBytes: 64, complexity: 5 });
  const voiced = Float32Array.from({ length: 512 * 24 }, (_, i) => {
    let v = 0;
    for (let h = 1; h <= 9; h++) v += Math.sin(2 * Math.PI * 200 * h * i / 22050 + h) / h;
    return .15 * v;
  });
  const packets = Array.from({ length: 24 }, (_, k) => enc.encode(voiced.subarray(512 * k, 512 * (k + 1))));
  const lookahead = enc.lookahead;
  enc.free();
  const flagged = packets.filter(filterFlag).length;
  const parsedPitched = D.parse(demoFile([
    { tick: 10, messages: [msg.voiceInit('vaudio_celt', 5)] },
    { tick: 20, messages: [msg.voice(4, join(packets))] }
  ]));
  const ps = parsedPitched.speakers[0];
  const audio = await D.decode(parsedPitched, ps, { celt: (r, f, b) => createCodec(r, f, { packetBytes: b }) });
  const { lag: at, r } = lag(voiced, audio.samples, 0, 200);
  check('A vaudio_celt demo of a pitched voice, its packets made with the pitch filter on, decodes into that voice',
    flagged >= 20 && ps.frames === 24 && audio.samples.length === 24 * 512 && at === lookahead && r > .98,
    `${flagged} of 24 packets with the filter flag, delay ${at} samples, r ${r.toFixed(4)}`);
}

// A vaudio_celt packet the decoder refuses (here one whose first byte gives
// another frame size) plays as one frame of silence and is counted. The
// decoder never takes it in: the frames before it are as in the clean demo,
// and the frames after it are what the decoder gives the other packets alone.
{
  const enc = await createCodec(22050, 512, { packetBytes: 64, complexity: 5 });
  const voiced = Float32Array.from({ length: 512 * 12 }, (_, i) => {
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * 180 * h * i / 22050 + h) / h;
    return .2 * v;
  });
  const packets = Array.from({ length: 12 }, (_, k) => enc.encode(voiced.subarray(512 * k, 512 * (k + 1))));
  enc.free();
  const bad = packets.map(p => p.slice());
  bad[6][0] = (bad[6][0] & ~0x18) | (1 << 3);
  const decodeDemo = async (list) => {
    const parsedOne = D.parse(demoFile([{ tick: 10, messages: [msg.voiceInit('vaudio_celt', 5)] }, { tick: 20, messages: [msg.voice(4, join(list))] }]));
    return D.decode(parsedOne, parsedOne.speakers[0], { celt: (r, f, b) => createCodec(r, f, { packetBytes: b }) });
  };
  const clean = await decodeDemo(packets), hurt = await decodeDemo(bad);
  const alone = await createCodec(22050, 512, { packetBytes: 64 });
  const without = packets.filter((_, k) => k !== 6).map(p => alone.decode(p));
  alone.free();
  const others = Array.from({ length: 12 }, (_, f) => f).filter(f => f !== 6);
  const frameSame = (f) => hurt.samples.subarray(f * 512, (f + 1) * 512).every((v, i) => v === without[f < 6 ? f : f - 1][i])
    && (f > 6 || hurt.samples.subarray(f * 512, (f + 1) * 512).every((v, i) => v === clean.samples[f * 512 + i]));
  check('A vaudio_celt demo with one packet the decoder refuses decodes: that frame silent and counted, every other frame as if it had not come',
    clean.undecodable === 0 && hurt.undecodable === 1 && hurt.samples.length === clean.samples.length
    && hurt.samples.subarray(6 * 512, 7 * 512).every(v => v === 0) && others.every(frameSame) && hurt.frameLog[6] === 3,
    `${hurt.undecodable} undecodable; ${others.filter(frameSame).length} of 11 other frames as expected`);
}

// Each talk spurt of a vaudio_celt demo is decoded by a new decoder. That is
// the app's choice: whether the game's receiver resets its decoder between
// spurts was not read. Without the reset the second spurt would start from
// the first's state.
{
  const make = async (signal) => {
    const enc = await createCodec(22050, 512, { packetBytes: 64, complexity: 5 });
    const out = Array.from({ length: 10 }, (_, k) => enc.encode(signal.subarray(512 * k, 512 * (k + 1))));
    enc.free();
    return out;
  };
  const toneA = Float32Array.from({ length: 5120 }, (_, i) => .3 * Math.sin(2 * Math.PI * 300 * i / 22050));
  const toneB = Float32Array.from({ length: 5120 }, (_, i) => .3 * Math.sin(2 * Math.PI * 523 * i / 22050));
  const first = await make(toneA), second = await make(toneB);
  const parsedTwo = D.parse(demoFile([
    { tick: 10, messages: [msg.voiceInit('vaudio_celt', 5)] },
    { tick: 20, messages: [msg.voice(4, join(first))] },
    { tick: 80, messages: [msg.voice(4, join(second))] }
  ]));
  const two = await D.decode(parsedTwo, parsedTwo.speakers[0], { celt: (r, f, b) => createCodec(r, f, { packetBytes: b }) });
  const fresh = await createCodec(22050, 512, { packetBytes: 64 });
  const want = second.map(p => fresh.decode(p));
  fresh.free();
  const start = Math.round(60 * parsedTwo.intervalPerTick * 22050);
  const same = want.every((frame, k) => frame.every((v, i) => v === two.samples[start + 512 * k + i]));
  check('A vaudio_celt demo\'s second talk spurt is decoded by a new decoder: the same samples as its packets alone',
    two.spurts === 2 && same && two.samples.length === start + 5120, `${two.spurts} spurts, the second at sample ${start}`);
}

// A demo recorded with `record` keeps voice messages without their payloads.
const client = D.parse(demoFile([{ tick: 5, messages: [msg.voiceInit('steam'), msg.voice(1, new Uint8Array(0))] }]));
check('A client demo has voice messages but no speakers', client.voice.length === 1 && client.speakers.length === 0);
assert.throws(() => D.parse(new Uint8Array(2000)), /not a Source demo/);
check('A file that is not a demo is refused', true);

// A demo cut short (a crash, or a recording still being written) keeps the
// voice before the cut, wherever the cut falls, frame headers included.
{
  let thrown = 0, shrank = 0, last = 0;
  for (let n = 1072; n <= bytes.length; n++) {
    let count;
    try { count = D.parse(bytes.subarray(0, n)).voice.length; } catch (error) { thrown++; continue; }
    if (count < last) shrank++;
    last = count;
  }
  check('A demo cut off at any byte keeps the voice before the cut', thrown === 0 && shrank === 0 && last === 6,
    `${bytes.length - 1071} cuts, ${thrown} refused`);
}

// Voice deep in a long demo: bit positions in the file pass 2^31 at 256 MiB.
{
  const pad = 257 * 1048576, big = new Uint8Array(bytes.length + 9 + pad);
  big.set(bytes.subarray(0, 1072));
  big[1072] = 4;                                             // a console command frame `pad` bytes long
  new DataView(big.buffer).setUint32(1072 + 5, pad, true);
  big.set(bytes.subarray(1072), 1072 + 9 + pad);
  const late = D.parse(big);
  check('Voice more than 256 MiB into a demo is read', late.voice.length === 6 && late.errors === 0
    && late.speakers.map(s => s.frames).join() === parsed.speakers.map(s => s.frames).join());
}

// The receiver alone: voice that arrives already coded skips the sender. A
// quiet spurt the sender's gate would silence comes through, raised by the
// receiver's auto-gain, and the render reports the demo's own frames.
const quiet = Float32Array.from(decoded.samples, v => v * .01);
const buffer = { sampleRate: rate, length: quiet.length, numberOfChannels: 1, getChannelData: () => quiet };
const received = await A.process(buffer, { codec: 'steam', received: { frameLog: Array.from(decoded.frameLog), frameBytes: Array.from(decoded.frameBytes), frameMs: 20, spurts: 2 } });
const full = await A.process(buffer, { codec: 'steam' });
const rms = (x) => 10 * Math.log10(x.reduce((t, v) => t + v * v, 0) / x.length + 1e-30);
check('Received voice runs through the receiver only: the sender gate does not apply', rms(received.samples) > rms(full.samples) + 20,
  `${rms(received.samples).toFixed(1)} dBFS against ${rms(full.samples).toFixed(1)} dBFS through the full chain`);
check('and its codec lane is the demo\'s frames', received.codecInfo.backend === 'demo' && received.codecInfo.frames === decoded.frameLog.length
  && received.codecInfo.lostFrames === 1 && received.codecInfo.dtxFrames === 1 && received.codecInfo.modes.hybrid + received.codecInfo.modes.silk + received.codecInfo.modes.celt === 29
  && received.codecInfo.lookahead === 0);   // the lane places frame f at (f * frame - lookahead) / rate
console.log(`\n${passed} demo checks passed`);
