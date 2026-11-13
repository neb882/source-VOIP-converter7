// The suite `reproduce`: tests/reproduce.mjs, the script of docs/REPRODUCE.md,
// on stand-ins it makes itself.
//
//   node tests/reproduce.verify.mjs
//
// The repository's own codecs, run on the generated clips, stand in for the
// game's files. A stand-in made by the code a check runs proves the script's
// reading, counting and verdicts, not that its alignment is the game's (order
// RP-01, section 5; part e's private runs and part f prove that). What each
// stand-in shows:
//
//   check   the stand-in                          what its pass shows
//   inputs  none: the SHA-256 of the two clips    the clips are the record's bytes on this Node: the pins
//           are pinned here, apart from the       are independent of the script's own copy; the verdict
//           script's own copy                     is shown to say "differs" on a wrong hash
//   --against  the clip from its third sample,    the two-sample shift and the two zeros are checked:
//           then two zeros                        no zeros, extra samples, one sample moved, all differ
//   celt    W3-08's loop on the CELT build        the check's own call (the same codec at the same
//           directly (vendor/celt-0.11)           settings): reading, counting, the pass line, and that
//                                                 the settings were not changed; a shift by one sample
//                                                 or one packet differs (no lag search)
//   speex   the Speex codec frame by frame and    a second route (the whole render at onGain against
//           the gain's transcription on it        the decoder's stream and engineGain): the lag of 80,
//                                                 the two zeros, the gain's blocks; shifts differ
//   gain    engineGain (tests/gain-exact.mjs's    a second route (receiverAutoGain against the
//           transcription) on the CELT stand-in   transcription): the rule, the last packet apart, the
//                                                 lengths within one packet
//   ceiling a render's clamped voice with a hum    the reading of 16-bit, 24-bit, float, stereo and
//           and noise added before the clip, on    tagged files; the largest and smallest found, the
//           TF2Audio's own mixer functions, at     samples on the largest counted, both pass lines; the
//           volume 0.15 and 0.5                    voice alone (its 255/256) stays under the ceiling
//   clock   a render with timeline 'game' at      the render, the line-up and the clock's verdicts:
//           66.67 frames a second against the     the 'game' render drops one sample a packet as read,
//           default render                        so its clock comes from the rule as built, not from
//                                                 the game's output; a take 100 parts in a million
//                                                 faster differs
//   demo    a demo written here: libopus 1.1.5's  the reading of the frames, the rate records and the
//           frames at Steam's settings in Steam's numbering, and that nothing of the header or a
//           payload, numbered from 0 per phrase   SteamID is printed; one frame, record or number
//                                                 changed differs
//   queue   a console log written by the          the tool's reading, and that the two models of the
//           synthetic log's writer from the       channel agree on every tick (the suite voice-channel
//           second model of the channel           holds that too); not that the game prints the lines
//           (reference-channel.mjs), at 300       so; a queue line 2 bytes off differs
//           and 66.67 frames a second
//   gate    Steam's console text written here:    the check's reading and its rule agree with the
//           a file input's chunks over two        app's sender on every chunk, and its walk through
//           passes of the 24 kHz clip, the        the clip with the suite's sums; not that Steam
//           numbers the suite's own sums, the     prints the lines so; a mark, a number, a length
//           marks the built sender's              or a line changed differs
//
// [1] The list: every check by name, hold saying "not built yet" with no
//     order and exiting 3; gate's and queue's usage lines.
// [2] inputs: the pins (the 24 kHz clip's too), the verdict, --against.
// [3] gain, [4] celt, [5] speex: each on its stand-in prints "as expected";
//     with one sample moved by three steps "differs" and an exit other than
//     0; on a file of zeros, on one too short, on one that ends more than a
//     packet before the input does (and for gain on a pair more than a packet
//     apart in length), on stand-ins shifted by a sample and a packet,
//     "differs" with the reason. celt also takes Set I's case with
//     --any-rate.
// [8] ceiling, [9] clock, [10] demo: each on its stand-in prints "as
//     expected"; with the ceiling two and three steps up and down, a sample
//     three steps over it, a take 100 parts in a million faster, the stand-in
//     judged at another packet rate, a phrase numbered from 7, a frame of
//     another kind, of two channels or of two frames, a rate record of 48000
//     or two records, "differs"; on zeros, the voice alone, too few samples on
//     the ceiling, a take too short or unrelated, a demo with no voice, with
//     one phrase or of vaudio_celt, "differs" with the reason. The window the
//     clock prints is pinned. demo on tests/demo/synthetic.dem prints none of
//     its header's fields, its print line or its SteamIDs; the stand-in demos
//     carry markers in their server info and a string table too, and the
//     recordings of ceiling and clock in LIST/INFO and bext chunks.
// [11] queue: its stand-ins at 300 and 66.67 frames a second (CRLF and line
//     feeds, marker lines in place of the unrelated ones, and both in one log
//     of marked parts read with --section) print "as expected", the faults as
//     information (the ring's print 0 at 66.67), Q2 on both; a queue line 2
//     bytes off at four kinds of line, the 66.67 log judged at 300, the 300
//     log judged at 66.67 and at 280 (Q2), a pull line, a second
//     speaker, the packet lines alone, 99 tick lines, a queue that never
//     falls, no voice line, a line cut short, marked parts without --section:
//     "differs"; bad options: "cannot check".
// [12] gate: its stand-in, copied text, console_log.txt with stamps and mixed
//     line ends, line feeds alone and UTF-16, prints "as expected" alone and
//     with the clip; with lines worked by hand (327 and 328, 4914, 4915,
//     -4915, one sample) too; a first mark flipped, a third mark or a count
//     changed, a mean raised to 1.01 differ alone; a mean or a peak moved, a
//     length moved, a count moved, a 1.00 line's mark against the clip, a
//     line removed and another clip differ with the clip; the walk ends at
//     mic_inputfile typed or answered; a one-sample line inside the walk and
//     at the head of the place search; the search capped at 200 lines; the
//     quiet lines alone, no chunk
//     line, 49 chunk lines, a line with text after its count: "differs".
// [13] The game's recordings that are published (order RP-01, part f): for
//     every row of tests/recordings/manifest.json, the check its row names
//     (its options; its files the row's own, the generated clip the row's
//     input names, written here by tests/recordings/make-inputs.mjs into the
//     temporary folder, or another row's), run on the file in
//     tests/recordings/files/, prints "as expected" with the row's own lag,
//     samples compared, samples equal and largest difference; gain runs on
//     each voice_maxgain 1 file with the voice_maxgain 10 file of the same
//     codec and a shared set (the Speex pair) and finds 0 samples differ
//     before the last packet. Each row's codec is the one its check runs
//     (celt vaudio_celt, celt --high vaudio_celt_high, speex vaudio_speex),
//     and every voice_maxgain 1 file sharing a set with a voice_maxgain 10
//     file is in a gain pair. Every sample of a published file outside what
//     its check compared is zero (the order's section 16). On a copy of the
//     folder the suite makes: each file removed, one sample of each file
//     moved by three steps, one sample of each file's part apart made 3, and
//     one sample of each gain pair's voice_maxgain 1 file moved: each fails.
//     A manifest with no rows fails here. Nothing is fetched.
// [6] Nothing leaves the PC: the text of the script, of every file under
//     tests/reproduce/, of the clips' generator, of every file a run loaded
//     and of the engine's files holds no network module, child process,
//     worker, module reached by name, fetch or browser network object; every
//     run of this suite is made in a child whose net, dns, dgram, fetch,
//     WebSocket, child process functions, worker threads and socket bindings
//     are replaced by functions that record a call and throw, and none is
//     recorded. Both detectors are shown to catch what they look for.
// [7] The output holds nothing of the files: the stand-ins lie in a folder,
//     under names and with a header chunk that carry marker strings (the
//     demos in their header's text fields and a printed line), and no marker
//     appears in anything a run prints, passing, differing or refused.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHECKS } from './reproduce.mjs';
import { clipSamples, clipWav } from './recordings/make-inputs.mjs';
import { engineGain } from './gain-exact.mjs';
import { EXPECTED, verdicts } from './reproduce/inputs.mjs';
import { createRequire } from 'node:module';
import { ENGINE_FILES, loadEngine } from './lib/engine.cjs';
import { synthesize, UNRELATED } from './voicequeue/synthetic-log.mjs';
import { createReferenceChannel } from './voicequeue/reference-channel.mjs';
import { steamClipSamples, steamClipWav } from './reproduce/steam-clip.mjs';

const TF2Reference = createRequire(import.meta.url)('../reference.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const SCRIPT = path.join(here, 'reproduce.mjs');

// The record's checksums of the two clips the game was fed
// (tests/REFERENCE_2026.md, "The file-input runs, measured again
// (2026-11-13)"), and their lengths; and the 24 kHz clip's, computed by order
// RP-01b's planning run (the record's entry "The checks gate and queue
// (2026-11-13)"), not yet played into Steam.
const PINNED = {
  'voice_input_22050.wav': { sha256: 'fc1c6cbd9aabd8ed1b64d4381eae3c2f56dce23eff36e14ba7d9f67dc5505a58', samples: 291942, bytes: 583928 },
  'voice_input_11025.wav': { sha256: 'bd31df844cee4b38fe705be1fbdfb1b17acb9f161f9314b06b1eb2ba0d560dbd', samples: 145966, bytes: 291976 },
  'steam_mic_24000.wav': { sha256: '3e02aaa585001e562e133aea7985bce4208563e39c00655d153f34b88e873fde', samples: 679200, bytes: 1358444 }
};

// The marker strings stand where a private detail would be. Any of them in
// any output fails [7].
const MARK = 'QX7-Marker';
const MARKERS = [`${MARK}-Folder`, `${MARK}-Player`, `${MARK}-File`, `${MARK}-Header`, `${MARK}-Option`, `${MARK}-Check`];
const hasMarker = (text) => text.includes(MARK);

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `   [${detail}]` : ''}`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `reproduce-${MARKERS[0]}-`));
const folder = path.join(tmp, `${MARKERS[0]}-saved`);
fs.mkdirSync(folder);
const at = (name) => path.join(folder, `${MARKERS[1]}_${name}`);

// The child's guard: net, dns, dgram, fetch, WebSocket, the child process
// functions, worker threads and the socket bindings replaced by functions
// that append what was called to the log and throw; and every file the child
// loads (import or require) appended to a second log, so that [6] can read the
// text of each.
const netLog = path.join(tmp, 'network-calls.log'), loadLog = path.join(tmp, 'loaded.log');
fs.writeFileSync(netLog, '');
fs.writeFileSync(loadLog, '');
const guard = path.join(tmp, 'guard.mjs');
fs.writeFileSync(guard, `
import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns';
import dgram from 'node:dgram';
import cp from 'node:child_process';
import wt from 'node:worker_threads';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
const log = process.env.REPRODUCE_NET_LOG, loaded = process.env.REPRODUCE_LOAD_LOG;
const trap = (what) => function () { fs.appendFileSync(log, what + '\\n'); throw new Error('refused by the suite: ' + what); };
for (const k of ['connect', 'createConnection', 'createServer']) net[k] = trap('net.' + k);
net.Socket.prototype.connect = trap('net.Socket.prototype.connect');
for (const k of Object.keys(dns)) if (typeof dns[k] === 'function' && /^(lookup|resolve|reverse)/.test(k)) dns[k] = trap('dns.' + k);
for (const k of Object.keys(dns.promises)) if (typeof dns.promises[k] === 'function' && /^(lookup|resolve|reverse)/.test(k)) dns.promises[k] = trap('dns.promises.' + k);
dgram.createSocket = trap('dgram.createSocket');
for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[k] = trap('child_process.' + k);
wt.Worker = trap('worker_threads.Worker');
const binding = process.binding;
process.binding = function (name) {
  if (/^(tcp_wrap|udp_wrap|pipe_wrap|tls_wrap|cares_wrap|stream_wrap|js_stream)$/.test(name)) return trap('process.binding ' + name)();
  return binding.call(process, name);
};
globalThis.fetch = trap('fetch');
globalThis.WebSocket = trap('WebSocket');
syncBuiltinESMExports();
registerHooks({ resolve(specifier, context, next) {
  const r = next(specifier, context);
  if (r.url.startsWith('file:')) fs.appendFileSync(loaded, r.url + '\\n');
  return r;
} });
`);

// Every run of the script, guarded; its output kept for [7].
const runs = [];
function guarded(file, args) {
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(guard).href, file, ...args],
    { cwd: root, encoding: 'utf8', env: { ...process.env, REPRODUCE_NET_LOG: netLog, REPRODUCE_LOAD_LOG: loadLog, REPRODUCE_DEBUG: '' } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
function run(...args) {
  const r = guarded(SCRIPT, args);
  runs.push({ args: args.map((a) => (a.startsWith(tmp) ? '<file>' : a)).join(' '), ...r });
  return r;
}
const lastLine = (r) => r.out.trim().split('\n').pop();
const verdict = (r) => (/: as expected$/.test(lastLine(r)) ? 'as expected' : /: differs: /.test(lastLine(r)) ? 'differs' : /: cannot check: /.test(lastLine(r)) ? 'cannot check' : 'none');
const passes = (r) => r.status === 0 && verdict(r) === 'as expected';
const fails = (r, reason) => r.status !== 0 && verdict(r) === 'differs' && (!reason || reason.test(lastLine(r)));
const show = (r) => `exit ${r.status}: ${lastLine(r)}`;

function wavBytes(samples, rate, extra = null) {
  const head = Buffer.alloc(44);
  const body = Buffer.alloc(2 * samples.length);
  samples.forEach((v, i) => body.writeInt16LE(v, 2 * i));
  const chunk = extra ? Buffer.concat([Buffer.from('LIST'), Buffer.alloc(4), Buffer.from(extra), Buffer.alloc(extra.length & 1)]) : Buffer.alloc(0);
  if (extra) chunk.writeUInt32LE(extra.length, 4);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(36 + chunk.length + body.length, 4); head.write('WAVEfmt ', 8, 'latin1');
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(2 * rate, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  const data = Buffer.alloc(8); data.write('data', 0, 'latin1'); data.writeUInt32LE(body.length, 4);
  return Buffer.concat([head.subarray(0, 36), chunk, data, body]);
}
// A recording of the output as a recorder writes it: channels (in 16-bit
// steps) interleaved, as 16- or 24-bit integers or 32-bit floats. With
// `tagged`, a LIST/INFO chunk (a title and an artist) and a bext chunk (a
// description and an originator) carrying markers lie before the samples, as
// a recorder may write them.
const TAGS = [`${MARK}-Title`, `${MARK}-Artist`, `${MARK}-Description`, `${MARK}-Originator`];
function tagChunks() {
  const info = (id, text) => { const t = Buffer.from(`${text}\0`, 'latin1'), c = Buffer.alloc(8 + t.length + (t.length & 1)); c.write(id, 0, 'latin1'); c.writeUInt32LE(t.length, 4); t.copy(c, 8); return c; };
  const list = Buffer.concat([Buffer.from('INFO', 'latin1'), info('INAM', TAGS[0]), info('IART', TAGS[1])]);
  const bext = Buffer.alloc(602);
  bext.write(TAGS[2], 0, 'latin1'); bext.write(TAGS[3], 256, 'latin1');
  const chunk = (id, b) => { const h = Buffer.alloc(8); h.write(id, 0, 'latin1'); h.writeUInt32LE(b.length, 4); return Buffer.concat([h, b, Buffer.alloc(b.length & 1)]); };
  return Buffer.concat([chunk('LIST', list), chunk('bext', bext)]);
}
function writeOutput(name, channels, rate, bits, float = false, tagged = false) {
  const n = channels[0].length, step = bits / 8, body = Buffer.alloc(n * channels.length * step);
  for (let i = 0; i < n; i++) {
    channels.forEach((c, k) => {
      const o = (i * channels.length + k) * step;
      if (float) body.writeFloatLE(c[i] / 32768, o);
      else if (bits === 16) body.writeInt16LE(Math.max(-32768, Math.min(32767, c[i])), o);
      else body.writeIntLE(Math.round(c[i] * 256), o, 3);
    });
  }
  const tags = tagged ? tagChunks() : Buffer.alloc(0), head = Buffer.alloc(44);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(36 + tags.length + body.length, 4); head.write('WAVEfmt ', 8, 'latin1');
  head.writeUInt32LE(16, 16); head.writeUInt16LE(float ? 3 : 1, 20); head.writeUInt16LE(channels.length, 22); head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * channels.length * step, 28); head.writeUInt16LE(channels.length * step, 32); head.writeUInt16LE(bits, 34);
  head.write('data', 36, 'latin1'); head.writeUInt32LE(body.length, 40);
  const file = at(name);
  fs.writeFileSync(file, Buffer.concat([head.subarray(0, 36), tags, head.subarray(36), body]));
  return file;
}

// A SourceTV demo, as tests/demo.verify.mjs writes one: bits least
// significant first, a header whose text fields carry markers, then one
// packet frame per entry of network messages.
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
}
function crc32(d) {
  let crc = 0xFFFFFFFF;
  for (const b of d) { crc ^= b; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); }
  return (~crc) >>> 0;
}
// A Steam voice payload: the SteamID, a sample-rate record, the Opus frames
// (or `silence` samples of a silence record), the CRC-32.
function steamPayload(steamId, frames, rate = 24000, silence = 0) {
  const rates = Array.isArray(rate) ? rate : [rate];
  const body = [], id = Buffer.alloc(8);
  id.writeBigUInt64LE(BigInt(steamId));
  body.push(...id);
  for (const r of rates) body.push(11, r & 255, r >> 8);
  if (silence) body.push(0, silence & 255, silence >> 8);
  else {
    const opus = [];
    for (const f of frames) {
      if (f === 'end') { opus.push(0xFF, 0xFF); continue; }
      opus.push(f.data.length & 255, f.data.length >> 8, f.seq & 255, f.seq >> 8, ...f.data);
    }
    body.push(6, opus.length & 255, opus.length >> 8, ...opus);
  }
  const crc = crc32(body);
  body.push(crc & 255, (crc >>> 8) & 255, (crc >>> 16) & 255, crc >>> 24);
  return Uint8Array.from(body);
}
function demoFile(packets) {
  const header = Buffer.alloc(1072);
  header.write('HL2DEMO', 0, 'latin1'); header.writeInt32LE(3, 8); header.writeInt32LE(24, 12);
  header.write(`${MARK}-Server`, 16, 'latin1'); header.write(`${MARK}-Nick`, 276, 'latin1');
  header.write(`${MARK}-Map`, 536, 'latin1'); header.write(`${MARK}-Game`, 796, 'latin1');
  header.writeFloatLE(123.25, 1056); header.writeInt32LE(8217, 1060); header.writeInt32LE(packets.length, 1064);
  const parts = [header];
  for (const { tick, messages } of packets) {
    const w = new BitWriter();
    for (const m of messages) m(w);
    const data = Uint8Array.from(w.bytes), frame = Buffer.alloc(1 + 4 + 84 + 4 + data.length);
    frame[0] = 2; frame.writeInt32LE(tick, 1); frame.writeUInt32LE(data.length, 89); frame.set(data, 93);
    parts.push(frame);
  }
  parts.push(Buffer.from([7, 0, 0, 0, 0]));
  return Buffer.concat(parts);
}
const demoMsg = {
  print: (text) => (w) => { w.write(7, 6); w.string(text); },
  // Server info as demo.js reads it at protocol 24: the fields it skips,
  // the tick length, then the game folder, the map, the sky and the server's
  // name.
  serverInfo: (map, server) => (w) => {
    w.write(8, 6); w.write(24, 16); w.write(0, 32); w.write(0, 1); w.write(1, 1); w.write(0, 32); w.write(24, 16);
    for (let k = 0; k < 4; k++) w.write(0, 32);
    w.write(24, 16);
    const f = Buffer.alloc(4); f.writeFloatLE(0.015); w.data(f);
    w.write(0, 8); w.string('tf'); w.string(map); w.string('sky'); w.string(server); w.write(0, 1);
  },
  // A string table whose one entry is a player's name (protocol 24: the
  // data's length in bits as a varint).
  userTable: (player) => (w) => {
    const data = Buffer.from(`${player}\0`, 'latin1'), bits = data.length * 8;
    w.write(12, 6); w.string('userinfo'); w.write(256, 16); w.write(1, 9);
    for (let v = bits; ; v = Math.floor(v / 128)) { const more = v >= 128; w.write((v % 128) | (more ? 128 : 0), 8); if (!more) break; }
    w.write(0, 1); w.write(0, 1); w.data(data);
  },
  voiceInit: (codec) => (w) => { w.write(14, 6); w.string(codec); w.write(255, 8); w.write(codec === 'steam' ? 24000 : 22050, 16); },
  voice: (client, payload) => (w) => { w.write(15, 6); w.write(client, 8); w.write(0, 8); w.write(payload.length * 8, 16); w.data(payload); }
};

function writeWav(name, samples, rate, extra) {
  const file = at(name);
  fs.writeFileSync(file, wavBytes(samples, rate, extra));
  return file;
}
const moved = (s, i, by = 3) => { const t = Int16Array.from(s); t[i] = t[i] + by > 32767 ? t[i] - by : t[i] + by; return t; };
// The samples k later (k > 0: k zeros in front, the end cut) or earlier.
const shifted = (s, k) => { const t = new Int16Array(s.length); if (k > 0) t.set(s.subarray(0, s.length - k), k); else t.set(s.subarray(-k)); return t; };
const padded = (s, n) => { const t = new Int16Array(n); t.set(s.subarray(0, Math.min(n, s.length))); return t; };

// The stand-ins. CELT: W3-08's method on the 22050 Hz clip from its third
// sample, through the build directly. Speex: the codec of the speex profile
// frame by frame on the 11025 Hz clip's capture (from its third sample, then
// two zeros), its decoded stream in whole frames.
async function celtStandIn(input, rate, frame, bytes) {
  const { createCodec } = await import(pathToFileURL(path.join(root, 'vendor', 'celt-0.11', 'index.mjs')).href);
  const codec = await createCodec(rate, frame, { packetBytes: bytes, complexity: 5 });
  const packets = Math.ceil(input.length / frame), out = new Int16Array(packets * frame), buf = new Float32Array(frame);
  for (let p = 0; p < packets; p++) {
    for (let i = 0; i < frame; i++) { const j = p * frame + i; buf[i] = j < input.length ? input[j] / 32768 : 0; }
    const y = codec.decode(codec.encode(buf));
    for (let i = 0; i < frame; i++) out[p * frame + i] = Math.round(y[i] * 32768);
  }
  codec.free();
  return out;
}
async function speexStandIn(capture) {
  const { createSpeexStream } = await import(pathToFileURL(path.join(root, 'opus-codec.mjs')).href);
  const v = await createSpeexStream(11025), F = 160, frames = Math.ceil(capture.length / F), out = new Int16Array(frames * F), buf = new Float32Array(F);
  for (let f = 0; f < frames; f++) {
    buf.fill(0);
    for (let i = 0; i < F && f * F + i < capture.length; i++) buf[i] = capture[f * F + i] / 32768;
    const y = v.decode(v.encode(buf).packet);
    for (let i = 0; i < F; i++) out[f * F + i] = Math.round(y[i] * 32768);
  }
  v.free();
  return out;
}
const gained = (s) => Int16Array.from(engineGain(s, { maxGain: 10, avgGain: 0.5, scale: 1 }).out);

try {
  console.log('\n[1] The list of checks, and those not built yet');
  {
    const r = run();
    const built = CHECKS.filter((c) => c.run).map((c) => c.name), later = CHECKS.filter((c) => !c.run).map((c) => c.name);
    const named = CHECKS.every((c) => new RegExp(`^  ${c.name} `, 'm').test(r.out));
    check('node tests/reproduce.mjs lists every check by name and exits 0', r.status === 0 && named, `${CHECKS.length} checks`);
    check('the built checks are inputs, gain, celt, speex, gate, queue, ceiling, clock and demo; hold is listed as not built yet',
      built.join(' ') === 'inputs gain celt speex gate queue ceiling clock demo' && later.join(' ') === 'hold'
      && later.every((n) => new RegExp(`^  ${n} +not built yet: `, 'm').test(r.out)));
    check('gate and queue are listed with their usage lines', /^ +node tests\/reproduce\.mjs gate <Steam's console text>$/m.test(r.out)
      && /^ +node tests\/reproduce\.mjs gate <Steam's console text> <the 24 kHz WAV that mic_inputfile played>$/m.test(r.out)
      && /^ +node tests\/reproduce\.mjs queue <the game's console log> --fps <frames a second> \[--section <marker>\] \[--buffer-ms <voice_buffer_ms>\]$/m.test(r.out));
    const hold = run('hold');
    check('hold exits 3 and names no order: "not built yet", and where the page gives its steps by hand', hold.status === 3 && /^hold: not built yet: .*No order builds it yet; docs\/REPRODUCE\.md, "The hold and Steam's clock"/.test(hold.out) && !/order undefined|RP-01/.test(hold.out), show(hold));
    const bad = later.map((n) => [n, run(n)]).filter(([n, x]) => x.status === 0 || !x.out.includes(`${n}: not built yet`));
    check('each check not built yet prints "<check>: not built yet" and exits other than 0', bad.length === 0, bad.map(([n]) => n).join(', '));
    const u = run(MARKERS[5]);
    check('a name that is no check is refused with exit 2 and the list, the name not repeated', u.status === 2 && /not the name of a check/.test(u.out) && !hasMarker(u.out));
  }

  console.log('\n[2] inputs: the three clips');
  {
    const out = path.join(folder, `${MARKERS[2]}-clips`);
    const r = run('inputs', out);
    const files = Object.entries(PINNED).map(([name, want]) => {
      const b = fs.existsSync(path.join(out, name)) ? fs.readFileSync(path.join(out, name)) : Buffer.alloc(0);
      return { name, want, b, sha: crypto.createHash('sha256').update(b).digest('hex') };
    });
    for (const f of files) {
      check(`${f.name} has the record's SHA-256 and length`, f.sha === f.want.sha256 && f.b.length === f.want.bytes && (f.b.length - 44) / 2 === f.want.samples,
        `${f.sha.slice(0, 16)}…, ${f.b.length} bytes`);
    }
    check('the command prints each checksum with "as expected" (three) and exits 0', passes(r) && (r.out.match(/SHA-256 [0-9a-f]{64}, expected [0-9a-f]{64}: as expected/g) || []).length === 3, show(r));
    check('the files are the generator modules\' bytes, a plain 44-byte header and the samples',
      files.every((f, k) => f.b.equals(k < 2 ? clipWav([22050, 11025][k]) : steamClipWav())) && files.every((f) => f.b.readUInt32LE(40) === f.b.length - 44));
    check('the 24 kHz clip is 16-bit mono at 24000 Hz in its header', files[2].b.readUInt16LE(22) === 1 && files[2].b.readUInt32LE(24) === 24000 && files[2].b.readUInt16LE(34) === 16);
    check('nothing in the output names the folder written to', !r.out.includes(out) && !hasMarker(r.out));

    const clip = clipSamples(11025), capture = new Int16Array(clip.length);
    capture.set(clip.subarray(2));
    const good = run('inputs', '--against', writeWav('voice_micdata.wav', capture, 11025));
    check('--against a stand-in capture (the clip from its third sample, then two zeros): as expected, 145,964 of 145,964',
      passes(good) && /145,964 of 145,964/.test(good.out), show(good));
    const c22 = clipSamples(22050), cap22 = new Int16Array(c22.length);
    cap22.set(c22.subarray(2));
    check('--against the same at 22050 Hz: as expected', passes(run('inputs', '--against', writeWav('voice_micdata_22050.wav', cap22, 22050))));
    const off = run('inputs', '--against', writeWav('voice_micdata_moved.wav', moved(capture, 70000), 11025));
    check('--against with one sample moved by three steps: differs, exit other than 0', fails(off) && /145,963 of 145,964/.test(off.out), show(off));
    const zero = run('inputs', '--against', writeWav('voice_micdata_zeros.wav', new Int16Array(capture.length), 11025));
    check('--against a file of zeros: differs, "no sound"', fails(zero, /no sound/), show(zero));
    const rate = run('inputs', '--against', writeWav('voice_micdata_rate.wav', capture, 44100));
    check('--against a file at 44100 Hz: differs, naming the rate', fails(rate, /44100 Hz/), show(rate));
    const bare = run('inputs', '--against', writeWav('voice_micdata_nozeros.wav', capture.slice(0, capture.length - 2), 11025));
    check('--against the clip from its third sample with no zeros after it: differs (zeros 0 of 2, length short)',
      fails(bare) && /zeros after them: 0 of 2/.test(bare.out) && /length: 145,964 samples, expected 145,966, the clip's: differs/.test(bare.out), show(bare));
    const extra = run('inputs', '--against', writeWav('voice_micdata_extra.wav', padded(capture, capture.length + 100), 11025));
    check('--against the capture with 100 samples more: differs, on the length', fails(extra) && /length: 146,066 samples, expected 145,966, the clip's: differs/.test(extra.out), show(extra));
    const lines = [], wrong = { ...EXPECTED, 11025: { ...EXPECTED[11025], sha256: '0'.repeat(64) } };
    const ok = verdicts(Object.keys(PINNED).slice(0, 2).map((name, k) => ({ rate: [22050, 11025][k], name, bytes: clipWav([22050, 11025][k]) })), { line: (t) => lines.push(t), figure: (t, v) => { lines.push(`${t}: ${v ? 'as expected' : 'differs'}`); return v; } }, wrong);
    check('the clips\' verdict, given a wrong expected SHA-256 for the 11025 Hz clip, says "differs" on that clip and "as expected" on the other',
      !ok && /expected 0{64}: differs$/.test(lines[3]) && /: as expected$/.test(lines[1]), lines[3]);
  }

  // The stand-ins of the game's files.
  const input22 = clipSamples(22050).slice(2);
  const celt1 = await celtStandIn(input22, 22050, 512, 64);
  const high1 = await celtStandIn(input22, 44100, 1024, 128);
  const clip11 = clipSamples(11025), capture11 = new Int16Array(clip11.length);
  capture11.set(clip11.subarray(2));
  const speex1 = await speexStandIn(capture11), speex10 = gained(speex1);

  console.log('\n[3] gain');
  {
    // The gain-10 stand-in: the transcription of the rule on the gain-1 one,
    // its last packet made to differ as two key presses' do.
    const ten = gained(celt1);
    for (let i = ten.length - 300; i < ten.length; i++) ten[i] = ten[i] === 7 ? 8 : 7;
    const f1 = writeWav('celt_gain1.wav', celt1, 22050), f10 = writeWav('celt_gain10.wav', ten, 22050);
    const r = run('gain', f1, f10);
    check('on its stand-in (vaudio_celt, 571 packets): as expected, 0 of 291,840 differ, the last packet counted apart',
      passes(r) && /differ before the last packet: 0 of 291,840/.test(r.out) && /in the last packet \(512 samples, counted apart\): 300/.test(r.out), show(r));
    const off = run('gain', f1, writeWav('celt_gain10_moved.wav', moved(ten, 150000), 22050));
    check('one sample of the gain-10 file moved by three steps: differs, 1 of 291,840, exit other than 0',
      fails(off, /in 1 sample before/) && /1 of 291,840, expected 0: differs/.test(off.out), show(off));
    const zero = run('gain', writeWav('zeros1.wav', new Int16Array(celt1.length), 22050), writeWav('zeros10.wav', new Int16Array(celt1.length), 22050));
    check('a file of zeros: differs, "no sound"', fails(zero, /no sound/), show(zero));
    const short = run('gain', writeWav('short1.wav', celt1.slice(0, 600), 22050), writeWav('short10.wav', ten.slice(0, 600), 22050));
    check('files of 600 samples, too short to hold a block before the last packet: differs, "too short"', fails(short, /too short/), show(short));
    const loud = Int16Array.from({ length: 22050 }, (_, i) => (i & 1 ? 32767 : -32767));
    const flat = run('gain', writeWav('full1.wav', loud, 22050), writeWav('full10.wav', loud, 22050));
    check('files at full scale, where the gain is 1 on every block: differs, "changes no sample"', fails(flat, /changes no sample/), show(flat));
    const s10 = Int16Array.from(speex10);
    const shorter = run('gain', writeWav('speex_gain1_short.wav', speex1.slice(0, speex1.length - 160), 11025), writeWav('speex_gain10.wav', s10, 11025));
    check('Speex stand-ins at 11025 Hz, the gain-1 file one frame shorter: as expected, compared over the shorter and said so',
      passes(shorter) && /compared over the shorter, 145,920/.test(shorter.out), show(shorter));
    const rates = run('gain', f1, writeWav('speex_gain10_b.wav', s10, 11025));
    check('two files at different rates: differs, naming both', fails(rates, /22050 and 11025 Hz/), show(rates));
    const cut = run('gain', f1, writeWav('celt_gain10_short30.wav', ten.slice(0, 30 * 512), 22050));
    check('a gain-10 file of 30 packets beside a gain-1 file of 571 (a key released early): differs, on the lengths',
      fails(cut, /differ in length by 276,992 samples \(12\.56 s\), more than one packet of 512/), show(cut));
    const onePacket = run('gain', writeWav('celt_gain1_570.wav', celt1.slice(0, 570 * 512), 22050), f10);
    check('a gain-1 file one packet shorter (Set I\'s pair differs so): as expected, compared over the shorter', passes(onePacket) && /compared over the shorter, 291,840/.test(onePacket.out), show(onePacket));
  }

  console.log('\n[4] celt');
  {
    // One sample one step off, as Set H's vaudio_celt recording has.
    const one = moved(celt1, 100001, 1);
    const f = writeWav('celt_gain1.wav', one, 22050);
    const r = run('celt', f);
    check('vaudio_celt on its stand-in with one sample one step off: as expected, "one step off: 1"',
      passes(r) && /samples one step off: 1, expected at most 145/.test(r.out) && /more than one step off: 0/.test(r.out), show(r));
    const input = writeWav('voice_input.wav', clipSamples(22050), 22050);
    check('... with the input given as file 2: as expected', passes(run('celt', f, input)));
    const mic = new Int16Array(input22.length + 2); mic.set(input22);
    check('... with the captured input and --micdata: as expected', passes(run('celt', f, writeWav('voice_micdata_celt.wav', mic, 22050), '--micdata')));
    const high = run('celt', writeWav('celthigh_gain1.wav', high1, 22050), '--high');
    check('vaudio_celt_high on its stand-in with --high: as expected, the last packet of 1,024 apart',
      passes(high) && /compared: the first 291,840 samples, the last packet \(1,024 samples\)/.test(high.out), show(high));
    const off = run('celt', writeWav('celt_moved.wav', moved(one, 200000), 22050));
    check('one sample moved by three steps: differs, exit other than 0', fails(off) && /more than one step off: 1, expected 0: differs/.test(off.out), show(off));
    let many = Int16Array.from(celt1);
    for (let k = 0; k < 146; k++) many = moved(many, 1000 + 1500 * k, 1);
    const share = run('celt', writeWav('celt_share.wav', many, 22050));
    check('146 samples one step off, past 0.05% of 291,840: differs', fails(share) && /one step off: 146, expected at most 145 \(0\.05%\): differs/.test(share.out), show(share));
    const zero = run('celt', writeWav('celt_zeros.wav', new Int16Array(celt1.length), 22050));
    check('a file of zeros: differs, "no sound"', fails(zero, /no sound/), show(zero));
    const short = run('celt', writeWav('celt_short.wav', celt1.slice(0, 512), 22050));
    check('a file of one packet: differs, "fewer than two packets"', fails(short, /fewer than two packets/), show(short));
    const wrong = run('celt', writeWav('celthigh_as_celt.wav', high1, 22050));
    check('the vaudio_celt_high stand-in without --high: differs, and says to give --high', fails(wrong, /give --high/), show(wrong));
    const cut = run('celt', writeWav('celt_short30.wav', celt1.slice(0, 30 * 512), 22050));
    check('a stand-in cut to 30 packets (a key released early): differs, "ends 12.56 s before the input does", "hold the key"',
      fails(cut, /file 1 ends 12\.56 s before the input does .*hold the key until the clip has ended, about 15 s/), show(cut));
    const one570 = run('celt', writeWav('celt_570.wav', celt1.slice(0, 570 * 512), 22050));
    check('a stand-in one packet short (Set I\'s case): as expected, compared over 570 packets', passes(one570) && /holds 570 packets and the input makes 571/.test(one570.out), show(one570));
    for (const [k, what] of [[1, 'one sample'], [512, 'one packet']]) {
      const late = run('celt', writeWav(`celt_shift${k}.wav`, shifted(celt1, k), 22050));
      check(`the stand-in ${what} late: differs`, fails(late, /not this build's vaudio_celt output/), show(late));
    }
    const early = run('celt', writeWav('celt_early.wav', shifted(celt1, -1), 22050));
    check('the stand-in one sample early: differs', fails(early, /not this build's vaudio_celt output/), show(early));
    const long1 = run('celt', writeWav('celt_287.wav', padded(celt1, 287 * 1024), 22050));
    check('a vaudio_celt stand-in padded to 287 packets of 1024 (one past vaudio_celt_high\'s 286): differs, "goes on", with the --high hint',
      fails(long1, /file 1 goes on 0\.07 s past the input .*give --high/), show(long1));
    const long2 = run('celt', writeWav('celt_288.wav', padded(celt1, 288 * 1024), 22050));
    check('... padded to 288 packets of 1024, where --high would not fit either: differs, "goes on", no --high hint', fails(long2, /goes on/) && !/--high/.test(lastLine(long2)), show(long2));
    // Set I's case: the 11025 Hz clip under vaudio_celt, its samples taken as 22050 Hz sound (W3-03, read);
    // Set I's recording is 145,920 samples, 285 packets, one fewer than the input makes.
    const seti = await celtStandIn(clipSamples(11025).slice(2), 22050, 512, 64);
    const fi = writeWav('seti_gain1.wav', seti.slice(0, 285 * 512), 22050), clip11file = writeWav('voice_input_11025_for_celt.wav', clipSamples(11025), 11025);
    const anyRate = run('celt', fi, clip11file, '--any-rate');
    check('Set I\'s case (the 11025 Hz clip under vaudio_celt) with --any-rate: as expected, and one line says the header\'s rate is not used',
      passes(anyRate) && /file 2's header says 11025 Hz; its samples are taken as 22050 Hz sound \(--any-rate\)/.test(anyRate.out) && /holds 285 packets and the input makes 286/.test(anyRate.out), show(anyRate));
    const noAny = run('celt', fi, clip11file);
    check('... without --any-rate: differs, naming the option', fails(noAny, /file 2 is at 11025 Hz; this codec takes 22050 Hz\. .*give --any-rate/), show(noAny));
    const noFile = run('celt', fi, '--any-rate');
    check('--any-rate with no file 2: cannot check, asking for the file', noFile.status === 2 && /--any-rate needs the file you gave the game as file 2/.test(noFile.out), show(noFile));
  }

  console.log('\n[5] speex');
  {
    const f1 = writeWav('speex_gain1.wav', speex1, 11025);
    const r = run('speex', f1);
    check('on its stand-in at voice_maxgain 1 (the decoder\'s stream, 913 frames): as expected, 145,966 of 145,966 at the lag of 80',
      passes(r) && /samples equal: 145,966 of 145,966/.test(r.out) && /lag: 80 samples/.test(r.out), show(r));
    const f10 = writeWav('speex_gain10.wav', speex10, 11025);
    const r10 = run('speex', f10, writeWav('voice_input_11025.wav', clip11, 11025), '--maxgain', '10');
    check('on its stand-in at voice_maxgain 10 (the transcription of the gain on that stream), with the input as file 2: as expected',
      passes(r10) && /145,966 of 145,966/.test(r10.out), show(r10));
    check('... and with the captured input and --micdata: as expected',
      passes(run('speex', f10, writeWav('voice_micdata_speex.wav', capture11, 11025), '--micdata', '--maxgain', '10')));
    const wrongGain = run('speex', f10);
    check('the voice_maxgain 10 stand-in run as voice_maxgain 1: differs', fails(wrongGain), show(wrongGain));
    const off = run('speex', writeWav('speex_moved.wav', moved(speex1, 50000), 11025));
    check('one sample moved by three steps: differs, 145,965 of 145,966, exit other than 0', fails(off) && /145,965 of 145,966/.test(off.out), show(off));
    const zero = run('speex', writeWav('speex_zeros.wav', new Int16Array(speex1.length), 11025));
    check('a file of zeros: differs, "no sound"', fails(zero, /no sound/), show(zero));
    const short = run('speex', writeWav('speex_short.wav', speex1.slice(0, 160), 11025));
    check('a file of one frame: differs, "fewer than two Speex frames"', fails(short, /fewer than two Speex frames/), show(short));
    const celt = run('speex', writeWav('speex_celt.wav', celt1, 22050));
    check('a file at 22050 Hz: differs, naming the 64-bit game\'s fall-back', fails(celt, /fall-back to vaudio_celt/), show(celt));
    const cut = run('speex', writeWav('speex_short40.wav', speex1.slice(0, 40 * 160), 11025));
    check('a stand-in cut to 40 frames (a key released early): differs, "ends 12.67 s before the input does", "hold the key"',
      fails(cut, /file 1 ends 12\.67 s before the input does .*hold the key/), show(cut));
    const m = run('speex', writeWav('speex_912.wav', speex1.slice(0, 912 * 160), 11025));
    check('a stand-in one frame short (Set M\'s gain-1 file is so): as expected, 145,840 of 145,840', passes(m) && /samples equal: 145,840 of 145,840/.test(m.out), show(m));
    for (const [k, what] of [[1, 'one sample late'], [160, 'one frame late'], [-1, 'one sample early']]) {
      const x = run('speex', writeWav(`speex_shift${k}.wav`, shifted(speex1, k), 11025));
      check(`the stand-in ${what}: differs`, fails(x, /not this build's speex render/), show(x));
    }
  }

  // The checks on a recording of the PC's output and on a demo. The engine,
  // as tests/reference.verify.mjs loads it, makes their stand-ins.
  const engine = loadEngine({ codec: await import(pathToFileURL(path.join(root, 'opus-codec.mjs')).href) }), A = engine.audio;
  globalThis.TF2Audio = A;
  const asBuffer = (x, rate) => ({ sampleRate: rate, length: x.length, numberOfChannels: 1, getChannelData: () => x });

  console.log('\n[8] ceiling');
  {
    // The stand-in: the game's mixer on its own functions (TF2Audio.mixEntry,
    // mixOut and createDeviceStage, as built from finding 30), not the
    // check's arithmetic. The voice is a render's gain output for a 1 kHz tone
    // at 0.3 with pauses, which the gain clamps; the game's own sound is a
    // 157 Hz hum at 2,000 steps with seeded noise of 600 under it, added to
    // the voice at 255/256 before the clip, so the sum passes 32767 and is
    // flattened at the ceiling. Then `volume`, the 16 bits, and 48000 Hz.
    const sr = 48000, tone = Float32Array.from({ length: 4 * sr }, (_, i) => (i % sr < .7 * sr && i > .2 * sr ? .3 * Math.sin(2 * Math.PI * 1000 * i / sr) : 0));
    let voice = null;
    await A.process(asBuffer(tone, sr), { codec: 'steam', onGain: (g) => { voice = Float32Array.from(g); } });
    let seed = 3;
    const noise = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
    const game = Int32Array.from(voice, (_, i) => Math.round(2000 * Math.sin(2 * Math.PI * 157 * i / 44100) + 600 * noise()));
    const output = (volume, withGame = true) => {
      const mix = Int32Array.from(voice, (v, i) => A.mixOut(A.mixEntry(Math.round(v * 32768), 255) + (withGame ? game[i] : 0), volume));
      const device = A.createDeviceStage(sr), a = device.push(mix), z = device.flush(), out = new Float64Array(a.length + z.length);
      out.set(a); out.set(z, a.length);
      return out;
    };
    const s15 = output(0.15), s5 = output(0.5);
    const f15 = writeOutput('ceiling_015.wav', [s15, s15], sr, 24);
    const r = run('ceiling', f15, '--volume', '0.15');
    const onTop = (x) => Number(((/exactly on the largest: ([\d,]+)/.exec(x.out) || [])[1] || '0').replace(/,/g, ''));
    check('on its stand-in (a clamped voice with the game\'s sound under it, the sum clipped, at volume 0.15, written as 24-bit stereo): as expected, largest 4,915 and smallest -4,915',
      passes(r) && /largest sample 4,915, expected 4,915 within one step: as expected/.test(r.out) && /smallest sample -4,915, expected -4,915 within one step: as expected/.test(r.out) && onTop(r) >= 100, `${show(r)}; ${onTop(r)} on the largest`);
    const r5 = run('ceiling', writeOutput('ceiling_05.wav', [s5], sr, 16), '--volume', '0.5');
    check('... at volume 0.5, written as 16-bit mono: as expected, largest 16,384', passes(r5) && /largest sample 16,384, expected 16,384/.test(r5.out), show(r5));
    check('... written as 32-bit float: as expected', passes(run('ceiling', writeOutput('ceiling_float.wav', [s15], sr, 32, true), '--volume', '0.15')));
    const tagged = run('ceiling', writeOutput('ceiling_tagged.wav', [s15, s15], sr, 16, false, true), '--volume', '0.15');
    check('... written with LIST/INFO and bext chunks carrying a title, an artist, a description and an originator: as expected, none of them printed',
      passes(tagged) && TAGS.every((t) => !tagged.out.includes(t)), show(tagged));
    const leftOnly = run('ceiling', writeOutput('ceiling_left.wav', [s15, new Float64Array(s15.length)], sr, 16), '--volume', '0.15');
    check('... in stereo with a silent second channel: as expected (the first channel is read)', passes(leftOnly), show(leftOnly));
    const alone = run('ceiling', writeOutput('ceiling_voice_alone.wav', [output(0.15, false)], sr, 16), '--volume', '0.15');
    check('the voice alone, with no other sound (its tops at 4,896, its 255/256): differs, the sound stays under the ceiling',
      fails(alone, /stays under the game's ceiling/) && /largest sample 4,896/.test(alone.out), show(alone));
    const shift = (x, by) => Float64Array.from(x, (v) => (Math.abs(v) === 4915 ? v + by * Math.sign(v) : v));
    const up3 = run('ceiling', writeOutput('ceiling_up3.wav', [shift(s15, 3)], sr, 16), '--volume', '0.15');
    check('the ceiling three steps up (4,918): differs, "pass the game\'s ceiling"', fails(up3, /pass the game's ceiling/), show(up3));
    const up2 = run('ceiling', writeOutput('ceiling_up2.wav', [shift(s15, 2)], sr, 16), '--volume', '0.15');
    check('... two steps up (4,917): differs', fails(up2, /pass the game's ceiling/), show(up2));
    const down3 = run('ceiling', writeOutput('ceiling_down3.wav', [Float64Array.from(s15, (v) => Math.max(-4912, Math.min(4912, v)))], sr, 16), '--volume', '0.15');
    check('the ceiling three steps down (4,912): differs, the sound stays under the ceiling', fails(down3, /stays under the game's ceiling/), show(down3));
    const down2 = run('ceiling', writeOutput('ceiling_down2.wav', [Float64Array.from(s15, (v) => Math.max(-4913, Math.min(4913, v)))], sr, 16), '--volume', '0.15');
    check('... two steps down (4,913): differs', fails(down2, /stays under the game's ceiling/), show(down2));
    const lowSide = run('ceiling', writeOutput('ceiling_low_side.wav', [Float64Array.from(s15, (v) => Math.max(-4912, v))], sr, 16), '--volume', '0.15');
    check('the top at 4,915 and the bottom held at -4,912, three steps short: differs', fails(lowSide, /stays under the game's ceiling/) && /smallest sample -4,912, expected -4,915 within one step: differs/.test(lowSide.out), show(lowSide));
    const spike = Float64Array.from(s15); spike[sr] = 4918;
    const over = run('ceiling', writeOutput('ceiling_over.wav', [spike], sr, 16), '--volume', '0.15');
    check('one sample three steps over the ceiling (4,918): differs, "pass the game\'s ceiling"', fails(over, /pass the game's ceiling/) && /largest sample 4,918/.test(over.out), show(over));
    const wrong = run('ceiling', f15, '--volume', '0.2');
    check('the stand-in at 0.15 checked as volume 0.2: differs', fails(wrong, /stays under the game's ceiling/), show(wrong));
    const zero = run('ceiling', writeOutput('ceiling_zeros.wav', [new Float64Array(sr)], sr, 16), '--volume', '0.15');
    check('a file of zeros: differs, "no sound"', fails(zero, /no sound/), show(zero));
    // Too few on the top: the stand-in held under 4,914, with 99 samples at
    // 4,915 and -4,915 (one fewer than the check asks).
    const few = Float64Array.from(s15, (v) => Math.max(-4914, Math.min(4914, v)));
    for (let k = 0; k < 99; k++) { few[1000 + 400 * k] = 4915; few[1200 + 400 * k] = -4915; }
    const tooFew = run('ceiling', writeOutput('ceiling_few.wav', [few], sr, 16), '--volume', '0.15');
    check('99 samples on the ceiling, one fewer than the check asks: differs, "too few to show a clip"', fails(tooFew, /only 99 samples sit exactly on the largest, fewer than 100/), show(tooFew));
    few[50000] = 4915;
    check('... and 100: as expected', passes(run('ceiling', writeOutput('ceiling_few100.wav', [few], sr, 16), '--volume', '0.15')));
    const noVolume = run('ceiling', f15);
    check('no --volume: cannot check, exit 2', noVolume.status === 2 && /give --volume/.test(noVolume.out), show(noVolume));
  }

  console.log('\n[9] clock');
  {
    // A speech-like source (shaped noise and gliding harmonics in syllables)
    // in phrases of 8 s with pauses of 1.5 s, 30 s at 48000 Hz, made 16-bit
    // as the file is. Its stand-in take is the render that runs the game's
    // voice channel (timeline 'game'), which drops one sample from every
    // packet, at 66.67 frames a second, where the channel's wait drops
    // nothing (finding 23); the check renders the source by default.
    const sr = 48000, seconds = 30;
    let seed = 11, lp = 0;
    const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
    const src = new Float32Array(sr * seconds);
    for (let i = 0; i < src.length; i++) {
      const t = i / sr;
      if (t < .5 || t % 9.5 >= 8) continue;
      const syllable = Math.floor(t / .23), f0 = 110 + 40 * Math.sin(t * 1.3) + 15 * (syllable % 4);
      lp += .3 * (random() - lp);
      let v = .25 * lp;
      for (let h = 1; h <= 12; h++) v += Math.sin(2 * Math.PI * f0 * h * t + h) / (h + 1);
      src[i] = Math.round(.12 * Math.sin(Math.PI * ((t / .23) % 1)) ** 2 * v * 32768) / 32768;
    }
    const game = await A.process(asBuffer(src, sr), { codec: 'steam', timeline: 'game', fps: 66.67, seed: 2 });
    const take = Float64Array.from(game.samples, (v) => Math.round(v * 32768)), source = Float64Array.from(src, (v) => v * 32768);
    // The stand-in's packets a second, as the page has the stranger count
    // them: packets over the seconds their decoded sound lasts.
    const ch = game.codecInfo.channel, played = ch.spurts.reduce((n, s) => n + s.end - s.start, 0), packetsPerSecond = +(ch.packets / played).toFixed(1);
    const fTake = writeOutput('clock_take.wav', [take, take], sr, 24, false, true), fSource = writeOutput('clock_source.wav', [source], sr, 16);
    const r = run('clock', fTake, fSource);
    const clockOf = (x) => Number(((/plays ([+-][\d,]+) parts/.exec(x.out) || [])[1] || '').replace(/,/g, ''));
    check('on its stand-in (a \'game\' render at 66.67 frames a second against the default render): as expected, within +386 to +427 (the record\'s +397 to +416 widened by 11)',
      passes(r) && /expected \+386 to \+427/.test(r.out), `${show(r)}; clock ${clockOf(r)}`);
    const withPackets = run('clock', fTake, fSource, '--packets', String(packetsPerSecond));
    check(`... with --packets ${packetsPerSecond}, the stand-in's own packets a second: as expected, judged around ${packetsPerSecond} over 44100`,
      passes(withPackets) && new RegExp(`${packetsPerSecond} packets a second over 44100 is`).test(withPackets.out), show(withPackets));
    const e = packetsPerSecond / 44100 * 1e6, window = `expected ${'+' + Math.round(e - 17)} to ${'+' + Math.round(e + 24)}`;
    check(`... its window from 17 under to 24 over ${e.toFixed(1)} (6 and 13, widened by 11): "${window}"`, withPackets.out.includes(window), window);
    check('the take, written with LIST/INFO and bext chunks carrying markers: none of them in what clock prints, with or without --packets',
      [r, withPackets].every((x) => TAGS.every((t) => !x.out.includes(t))));
    // The take on a clock 100 parts in a million faster still.
    const fast = TF2Reference.warp(Float32Array.from(take), sr, { offsetSeconds: 0, scale: 0.9999 }, sr, take.length);
    const fFast = writeOutput('clock_fast.wav', [Float64Array.from(fast, Math.round)], sr, 16);
    const quick = run('clock', fFast, fSource);
    check('the take made 100 parts in a million faster: differs, outside the range, asking for --packets', fails(quick, /outside the record's range, widened for this check's spread: .*--packets/) && clockOf(quick) > 427, `${show(quick)}; clock ${clockOf(quick)}`);
    const quick2 = run('clock', fFast, fSource, '--packets', String(packetsPerSecond));
    check('... and with --packets: differs', fails(quick2, /is not about/), show(quick2));
    const wrongRate = run('clock', fTake, fSource, '--packets', '22.3');
    check('the stand-in judged at 22.3 packets a second (+506): differs', fails(wrongRate, /is not about 22\.3 packets/), show(wrongRate));
    const zero = run('clock', writeOutput('clock_zeros.wav', [new Float64Array(10 * sr)], sr, 16), fSource);
    check('a recording of zeros: differs, "no sound"', fails(zero, /file 1 holds no sound/), show(zero));
    const short = run('clock', writeOutput('clock_short.wav', [take.slice(0, 7 * sr)], sr, 16), fSource);
    check('a recording of its first 7 s: differs, too few windows line up', fails(short, /one-second windows line up, fewer than 20/), show(short));
    const shorter = run('clock', writeOutput('clock_shorter.wav', [take.slice(0, 5 * sr)], sr, 16), fSource);
    check('a recording of its first 5 s, too short for a clock: differs, the windows span too little time', fails(shorter, /span too little time/), show(shorter));
    const other = Float64Array.from({ length: take.length }, () => Math.round(3000 * random()));
    const unrelated = run('clock', writeOutput('clock_unrelated.wav', [other], sr, 16), fSource);
    check('a recording of something else (noise): differs, "does not line up"', fails(unrelated, /does not line up/), show(unrelated));
    const silentSource = run('clock', fTake, writeOutput('clock_source_zeros.wav', [new Float64Array(sr)], sr, 16));
    check('a source of zeros: differs, "no sound"', fails(silentSource, /file 2 holds no sound/), show(silentSource));
  }

  console.log('\n[10] demo');
  {
    // A SourceTV demo written here as the server writes one: Steam voice
    // messages of a SteamID in universe 0 (no account can have it), a
    // sample-rate record and Opus frames from libopus 1.1.5 at Steam's
    // settings, three frames a message (eight in a phrase's first), numbered
    // from 0 in each phrase, an end marker and a silence record after each.
    // The header's text fields carry marker strings.
    const { createEncoder, Application, Signal } = await import(pathToFileURL(path.join(root, 'vendor', 'libopus-1.1', 'index.mjs')).href);
    const encoder = await createEncoder({ sampleRate: 24000, channels: 1, application: Application.Voip, bitrate: 32000, signal: Signal.Voice, dtx: true, complexity: 9 });
    let seed = 5, lp = 0;
    const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
    const phrase = (n, quietFrom) => Array.from({ length: n }, (_, f) => encoder.encodeFloat(Float32Array.from({ length: 480 }, (_, i) => {
      const t = (f * 480 + i) / 24000;
      lp += .3 * (random() - lp);
      let v = .25 * lp;
      for (let h = 1; h < 10; h++) v += Math.sin(2 * Math.PI * (120 + 30 * Math.sin(t * 2)) * h * t) / (h + 1);
      return f >= quietFrom ? 0 : .15 * v * Math.sin(Math.PI * ((t / .23) % 1)) ** 2;
    })));
    const phrases = [phrase(60, 40), phrase(45, 99), phrase(30, 99)];
    encoder.free();
    const ID = '4503603922337795';
    // The map, the server's name and a player's name, in the demo's messages.
    const DEMO_TAGS = [`${MARK}-ServerMap`, `${MARK}-ServerName`, `${MARK}-PlayerName`];
    const demoRuns = runs.length;
    const messagesOf = (frames, { firstSeq = 0, rate = 24000, end = true } = {}) => {
      const out = [];
      for (let k = 0; k < frames.length;) {
        const n = k === 0 ? 8 : 3, part = frames.slice(k, k + n).map((data, j) => ({ seq: (firstSeq + k + j) & 0xFFFF, data }));
        k += n;
        if (k >= frames.length && end) part.push('end');
        out.push(steamPayload(ID, part, rate));
      }
      if (end) out.push(steamPayload(ID, [], rate, 1500));
      return out;
    };
    const demoOf = (phraseMessages, options = {}) => {
      const packets = [{ tick: 50, messages: [demoMsg.serverInfo(DEMO_TAGS[0], DEMO_TAGS[1]), demoMsg.userTable(DEMO_TAGS[2]),
        demoMsg.print(`${MARKERS[1]} joined the game`), demoMsg.voiceInit(options.codec || 'steam')] }];
      let tick = 100;
      for (const list of phraseMessages) { for (const m of list) { packets.push({ tick, messages: [demoMsg.voice(1, m)] }); tick += 4; } tick += 60; }
      return demoFile(packets);
    };
    const writeDemo = (name, bytes) => { const f = at(name); fs.writeFileSync(f, bytes); return f; };
    const good = writeDemo('standin.dem', demoOf(phrases.map((p) => messagesOf(p))));
    const r = run('demo', good);
    const oneByte = phrases.flat().filter((p) => p.length === 1).length, frames = phrases.flat().length;
    check(`on its stand-in (three phrases, ${frames} frames, ${oneByte} of one byte): as expected, every frame of the kind, every message 24000 Hz, 2 of 2 phrases after an end marker at 0`,
      passes(r) && new RegExp(`TOC configuration 13\\): ${frames} of ${frames}, expected all: as expected`).test(r.out) && new RegExp(`one-byte frames \\(the encoder sent no sound\\): ${oneByte} of ${frames}`).test(r.out)
      && /numbered 0: 2 of 2, expected all: as expected/.test(r.out) && oneByte > 0, show(r));
    const late = run('demo', writeDemo('standin_seq7.dem', demoOf([messagesOf(phrases[0]), messagesOf(phrases[1], { firstSeq: 7 }), messagesOf(phrases[2])])));
    check('the second phrase numbered from 7: differs, 1 of 2 at 0', fails(late, /1 phrase after an end marker does not start at frame number 0/) && /numbered 0: 1 of 2/.test(late.out), show(late));
    const silk = phrases.map((p) => p.map((d) => d.slice()));
    silk[1][5][0] = (9 << 3);   // SILK, 16 kHz band, 20 ms: another kind of frame
    const other = run('demo', writeDemo('standin_silk.dem', demoOf(silk.map((p) => messagesOf(p)))));
    check('one frame\'s TOC made SILK-only: differs, 1 frame not of the kind', fails(other, /1 frame is not a 20 ms hybrid Opus frame/), show(other));
    const stereo = phrases.map((p) => p.map((d) => d.slice()));
    stereo[2][3][0] |= 4;   // the same configuration, marked as two channels
    const two = run('demo', writeDemo('standin_stereo.dem', demoOf(stereo.map((p) => messagesOf(p)))));
    check('one frame\'s TOC marked two channels: differs', fails(two, /1 frame is not a 20 ms hybrid Opus frame/), show(two));
    const twoFrames = phrases.map((p) => p.map((d) => d.slice()));
    twoFrames[0][12][0] |= 1;   // the same configuration, frame-count code 1: two frames in the packet
    const code1 = run('demo', writeDemo('standin_code1.dem', demoOf(twoFrames.map((p) => messagesOf(p)))));
    check('one frame\'s TOC with frame-count code 1: differs', fails(code1, /1 frame is not a 20 ms hybrid Opus frame/), show(code1));
    const twoRates = run('demo', writeDemo('standin_tworates.dem', demoOf([messagesOf(phrases[0]), messagesOf(phrases[1], { rate: [24000, 24000] }), messagesOf(phrases[2])])));
    check('one phrase\'s messages with two sample-rate records of 24000: differs', fails(twoRates, /15 voice messages do not carry one sample-rate record of 24000 Hz/), show(twoRates));
    const r48 = run('demo', writeDemo('standin_48k.dem', demoOf([messagesOf(phrases[0]), messagesOf(phrases[1], { rate: 48000 }), messagesOf(phrases[2])])));
    check('one phrase\'s messages with a sample-rate record of 48000: differs', fails(r48, /15 voice messages do not carry one sample-rate record of 24000 Hz/), show(r48));
    const none = run('demo', writeDemo('novoice.dem', demoOf([])));
    check('a demo with no voice: differs, "no voice"', fails(none, /holds no voice/), show(none));
    const one = run('demo', writeDemo('onephrase.dem', demoOf([messagesOf(phrases[0])])));
    check('a demo of one phrase, nothing after its end marker: differs, the numbering cannot be shown', fails(one, /no phrase follows an end marker/), show(one));
    const celt = run('demo', writeDemo('celt.dem', demoOf([[Uint8Array.from({ length: 64 }, (_, i) => i)]], { codec: 'vaudio_celt' })));
    check('a demo of vaudio_celt: differs, naming the codec', fails(celt, /voice is vaudio_celt/), show(celt));
    const notDemo = run('demo', writeDemo('not-a-demo.dem', Buffer.from(`${MARKERS[1]} said hello\n`)));
    check('a file that is not a demo: differs', fails(notDemo, /not a Source demo/), show(notDemo));
    // tests/demo/synthetic.dem: two speakers, numbers from 100 and 7, a lost
    // frame. Its header's fields and its SteamIDs must not be printed.
    const fixture = path.join(here, 'demo', 'synthetic.dem');
    const syn = run('demo', fixture);
    const secrets = ['Synthetic test', 'ctf_2fort', '4503603922337793', '4503603922337794', 'hello'];
    check('tests/demo/synthetic.dem: read, a verdict given (differs: its second phrase is numbered from 7), and none of its header fields, its print or its SteamIDs printed',
      fails(syn) && secrets.every((x) => !syn.out.includes(x)) && /voice messages read: 5 of 6/.test(syn.out), show(syn));
    const demoOut = runs.slice(demoRuns);
    check(`the demos' map, server name and player name (in their messages) and header fields appear in no output of demo (${demoOut.length} runs: the stand-in, every break and floor)`,
      demoOut.length >= 12 && demoOut.every((x) => !hasMarker(x.out)), demoOut.filter((x) => hasMarker(x.out)).map((x) => x.args).join('; '));
    const leaked = runs.filter((x) => x.out.includes(ID) || secrets.some((s) => x.out.includes(s)));
    check('no run of this suite prints a SteamID of the stand-ins or a header field of the fixture', leaked.length === 0, leaked.map((x) => x.args).join('; '));
  }

  console.log('\n[11] queue');
  {
    // The stand-in: a console log in the game's format written by the
    // synthetic log's writer (tests/voicequeue/synthetic-log.mjs) from the
    // second model of the channel (tests/voicequeue/reference-channel.mjs,
    // plain arrays, no ring arithmetic), which the check then replays through
    // voice-channel.js. Its pass shows the tool's reading and that the two
    // models agree, which the suite voice-channel holds over its own cases
    // too; it does not show that the game prints these lines so. The log's
    // unrelated lines are replaced by lines that carry markers where a
    // player's name, an address and a path would be, and two more stand at
    // its head and two at its tail; the game writes its log with CRLF ends.
    const standIn = (fps, seed) => synthesize({ fps, seed }, createReferenceChannel);
    check('the stand-in is written from the second model: the suite passes createReferenceChannel to the writer',
      /synthesize\(\{ fps, seed \}, createReferenceChannel\)/.test(standIn.toString()) && typeof createReferenceChannel === 'function');
    const PRIVATE = [`${MARK}-Player connected`, `Connecting to ${MARK}-Address:27015...`, `Writing C:\\${MARK}-Folder\\tf\\cfg\\config.cfg`, `${MARK}-Player :  ${MARK}-Chat`];
    const HEAD = [`] connect ${MARK}-Address`, `${MARK}-Player has joined the game`], TAIL = [`Disconnect: ${MARK}-Player left`, `] quit ${MARK}-Option`];
    const withPrivate = (lines) => { let k = 0; return lines.map((l) => (l === UNRELATED ? PRIVATE[k++ % PRIVATE.length] : l)); };
    const writeLog = (name, lines, end = '\r\n') => { const f = at(name); fs.writeFileSync(f, `${[...HEAD, ...withPrivate(lines), ...TAIL].join(end)}${end}`); return f; };
    const s300 = standIn(300, 0x5EED300), s67 = standIn(66.67, 0x5EED067);
    const q1 = (x) => (/Q1, ticks on which the rule gives the logged queue: ([\d,]+) of ([\d,]+)/.exec(x.out) || []).slice(1).map((v) => Number(v.replace(/,/g, '')));
    const fault = (x, label) => Number(((new RegExp(`^ +${label.replace('+', '\\+')}: ([\\d,]+)$`, 'm').exec(x.out)) || [])[1]?.replace(/,/g, '') ?? NaN);
    const f300 = writeLog('voice_q300.log', s300.lines);
    const r300 = run('queue', f300, '--fps', '300');
    const want300 = s300.truth.ticks + s300.truth.opensAfterFree;
    check(`on its stand-in at 300 frames a second (${s300.truth.packets} packets, ${s300.truth.ticks} tick lines, the ring overflowing while a channel waits): as expected, Q1 ${want300} of ${want300}`,
      passes(r300) && q1(r300).join() === `${want300},${want300}` && s300.truth.dropped > 0, show(r300));
    check('... every fault prints a count, and each mismatches somewhere on this log', ['ring + 1', 'ring - 1', 'wait + 1', 'wait - 1', 'sample kept', 'no grace'].every((l) => fault(r300, l) > 0)
      && /0 means this log cannot tell that fault from the rule/.test(r300.out));
    const f67 = writeLog('voice_q67.log', s67.lines);
    const r67 = run('queue', f67, '--fps', '66.67');
    const want67 = s67.truth.ticks + s67.truth.opensAfterFree;
    check(`on its stand-in at 66.67 frames a second: as expected, Q1 ${want67} of ${want67}; the two ring faults print 0 (nothing overflows) and the check still says "as expected"`,
      passes(r67) && q1(r67).join() === `${want67},${want67}` && fault(r67, 'ring + 1') === 0 && fault(r67, 'ring - 1') === 0 && s67.truth.dropped === 0, show(r67));
    check('... with line feeds alone: as expected', passes(run('queue', writeLog('voice_q67_lf.log', s67.lines, '\n'), '--fps', '66.67')));
    check('... the channels by their lines before the queue fell: 7 at 66.67 frames a second (the wait), 30 at 300',
      /first fall of their queue: 7 lines in \d+/.test(r67.out) && /first fall of their queue: 30 lines in \d+/.test(r300.out), `${(/first fall[^\n]*/.exec(r67.out) || [''])[0]}`);
    const q2 = (x) => (/Q2, [^\n]*/.exec(x.out) || [''])[0];
    check('Q2 on both stand-ins at their own frame rates: every first fall on line W to W + 3, one on W or W + 1',
      /Q2, channels whose queue first fell on tick line 30 to 33 after their packet: (\d+) of \1, expected all; one on line 30 or 31: yes, expected yes: as expected/.test(r300.out)
      && /Q2, channels whose queue first fell on tick line 7 to 10 after their packet: (\d+) of \1, expected all; one on line 7 or 8: yes, expected yes: as expected/.test(r67.out), `${q2(r300)} | ${q2(r67)}`);
    // Both parts in one log, each after a marker line of the suite's own
    // word, as `echo` writes it; the word is the stranger's and is never
    // printed.
    const word = (n) => `MARK${MARK}${n}`;
    const both = at('voice_q_marked.log');
    fs.writeFileSync(both, `${[...HEAD, `] echo ${word(300)}`, word(300), ...withPrivate(s300.lines), `] echo ${word(67)}`, word(67), ...withPrivate(s67.lines), ...TAIL].join('\r\n')}\r\n`);
    const m300 = run('queue', both, '--section', word(300), '--fps', '300'), m67 = run('queue', both, '--section', word(67), '--fps', '66.67');
    check('a log of two marked parts, each read with --section and its frame rate: as expected on both, the same Q1 as alone, the marker word not printed',
      passes(m300) && passes(m67) && q1(m300).join() === q1(r300).join() && q1(m67).join() === q1(r67).join() && !hasMarker(m300.out + m67.out), `${show(m300)}; ${show(m67)}`);
    const noSection = run('queue', both, '--fps', '300');
    check('... without --section: differs, "the log holds marked parts; give --section"', fails(noSection, /holds marked parts; give --section/), show(noSection));
    const missing = run('queue', both, '--section', word(100), '--fps', '100');
    check('... --section with a word no line is: differs, and the word not printed', fails(missing, /no line is the marker/) && !hasMarker(missing.out), show(missing));

    // One queue line off by one sample (2 bytes), at the four kinds of line
    // the suite voice-channel names (the writer's marks say which line is
    // which). On a line where the mixer took sound while the channel played a
    // change of one sample moves a sample of demand from one tick to the next:
    // the log cannot tell it from a true one, and no break is made there.
    const marks = s300.marks, opening = marks.findIndex((m) => m.opened);
    const changedLines = [
      ['at an opening', marks[opening]],
      ['during a wait', marks.find((m, j) => j > opening && !m.playedBefore && !m.opened)],
      ['at the ring\'s limit, with a packet, while playing', marks.find((m) => m.playedBefore && m.b === 44100 && m.packet !== null)],
      ['where the playing channel\'s mixer took nothing', marks.find((m, j) => j > 0 && m.playedBefore && m.packet === null && m.b === marks[j - 1].b && m.b > 4096 && marks[j - 1].line === m.line - 1)]
    ];
    changedLines.forEach(([where, m], k) => {
      const c = s300.lines.slice();
      if (m) c[m.line] = `Voice - chan 0, ent 1, bufsize: ${m.b + 2}`;
      const x = run('queue', writeLog(`voice_q_changed_${k}.log`, c), '--fps', '300');
      check(`one queue line 2 bytes off, ${where}: differs`, !!m && fails(x), show(x));
    });
    const fast = run('queue', f67, '--fps', '300');
    check('the 66.67 log judged at --fps 300 (a wait of 30 where the log\'s was 7): differs', fails(fast), show(fast));
    const slow = run('queue', f300, '--fps', '66.67');
    check('the 300 log judged at --fps 66.67 (a wait of 7 where the log\'s was 30): differs on Q2, naming the wait and the lines, Q1 as expected',
      fails(slow, /Q2 does not hold: the wait at the frame rate given is 7 ticks, and the queues first fell on line 30 in \d+ channels; the frame rate given may be lower than the game's/)
      && /Q1, [^\n]*: as expected/.test(slow.out), show(slow));
    const slower = run('queue', f300, '--fps', '280');
    check('... judged at --fps 280 (a wait of 28, two ticks short): differs on Q2', fails(slower, /Q2 does not hold/), show(slower));
    const q1Fails = run('queue', writeLog('voice_q_changed_2.log', (() => { const c = s300.lines.slice(), m = changedLines[2][1]; c[m.line] = `Voice - chan 0, ent 1, bufsize: ${m.b + 2}`; return c; })()), '--fps', '300');
    check('the sentence "0 means this log cannot tell that fault from the rule" is printed only when Q1 holds', fails(q1Fails, /rule mismatches the log/) && !/0 means/.test(q1Fails.out)
      && /0 means/.test(r300.out), show(q1Fails));
    const pull = s300.lines.slice();
    pull.splice(marks[opening + 40].line, 0, 'Voice - mixed 512 samples from channel 0');
    const pulls = run('queue', writeLog('voice_q_pull.log', pull), '--fps', '300');
    check('a pull line added (voice_showchannels 2): differs, naming the setting', fails(pulls, /voice_showchannels 2/), show(pulls));
    const second = s300.lines.slice();
    second.splice(marks[opening + 40].line + 1, 0, 'Voice - chan 1, ent 3, bufsize: 14110');
    const two = run('queue', writeLog('voice_q_second.log', second), '--fps', '300');
    check('a second speaker\'s line added: differs, "a second channel"', fails(two, /second channel/), show(two));
    const packetsOnly = run('queue', writeLog('voice_q_packets.log', s300.lines.filter((l) => !/bufsize/.test(l))), '--fps', '300');
    check('the packet lines alone: differs', fails(packetsOnly), show(packetsOnly));
    const cut = (n) => { const out = []; let ticks = 0; for (const l of s67.lines) { if (ticks === n) break; out.push(l); if (/bufsize/.test(l)) ticks++; } return out; };
    const r99 = run('queue', writeLog('voice_q_99.log', cut(99)), '--fps', '66.67');
    check('99 tick lines: differs, fewer than 100 (a choice of this check)', fails(r99, /only 99 tick lines, fewer than 100/), show(r99));
    check('... and 100: as expected', passes(run('queue', writeLog('voice_q_100.log', cut(100)), '--fps', '66.67')));
    const never = ['Voice - 7056 incoming samples added to channel 0', ...Array(120).fill('Voice - chan 0, ent 1, bufsize: 14110')];
    const still = run('queue', writeLog('voice_q_still.log', never), '--fps', '66.67');
    check('a channel whose queue never falls: differs, no channel played', fails(still, /no channel played/), show(still));
    const none = run('queue', writeLog('voice_q_none.log', PRIVATE), '--fps', '300');
    check('a log with no voice line: differs, naming voice_showincoming 1 and voice_showchannels 1', fails(none, /no voice lines \(voice_showincoming 1 and voice_showchannels 1\)/), show(none));
    const short = s300.lines.slice();
    short[marks[opening + 5].line] = `Voice - chan 0, ent 1, bufsi${MARK}`;
    const shortened = run('queue', writeLog('voice_q_short.log', short), '--fps', '300');
    check('a voice line cut short and followed by a marker: differs by its line number, the line not printed', fails(shortened, /line \d+: a voice line that does not read as one/) && !hasMarker(shortened.out), show(shortened));
    const binary = at('voice_q_binary.log');
    fs.writeFileSync(binary, Buffer.concat([Buffer.from([0, 255, 1, 2, 3, 0x89]), Buffer.from(`${MARK}-Header`), Buffer.alloc(300, 7)]));
    check('a file that is not text: differs, no voice lines', fails(run('queue', binary, '--fps', '300'), /no voice lines/));
    const refused = [
      ['no --fps', [f300]], ['--fps 5', [f300, '--fps', '5']], ['--fps 1001', [f300, '--fps', '1001']], ['--buffer-ms 0', [f300, '--fps', '300', '--buffer-ms', '0']],
      ['two files', [f300, f67, '--fps', '300']], ['no file', ['--fps', '300']], ['a file that does not exist', [path.join(folder, `${MARKERS[2]}-missing.log`), '--fps', '300']]
    ].map(([what, args]) => [what, run('queue', ...args)]).filter(([, x]) => x.status !== 2 || verdict(x) !== 'cannot check');
    check('no --fps, --fps 5 or 1001, --buffer-ms 0, two files, no file, a missing file: cannot check, exit 2', refused.length === 0, refused.map(([w, x]) => `${w}: ${show(x)}`).join('; '));
    const longer = run('queue', f67, '--fps', '66.67', '--buffer-ms', '200');
    check('--buffer-ms 200 on the 66.67 stand-in (a wait of 14 ticks where the log\'s was 7): differs', fails(longer), show(longer));
  }

  console.log('\n[12] gate');
  {
    // The stand-in: Steam's console text written here, by a route that uses
    // nothing of tests/reproduce/gate.mjs or steam-console.mjs. The chunks
    // are a file input's: a first chunk of 6000 samples, then seeded read
    // intervals of 48.0 to 63.7 ms times 24000, truncated, over two passes of
    // the generated clip. A line's numbers are the suite's own sums over the
    // clip, printed with the suite's own formatting. Its marks come from the
    // built sender (steam-sender.js), not from a rule written here: one sender
    // a chunk, given that chunk as its first read with lead 0 (later reads of
    // 750 samples), and the chunk pushed; the first mark is whether a spurt
    // opened, the third the same with meanMin far above any mean, the second
    // the first where the third is off and 100 x sum >= 32767 x length where
    // it is on. The clock refuses a chunk over 2250 samples, so the first
    // chunk, which is silence, has spaces typed for its marks. A pass shows
    // that the check's reading and its rule agree with the app's sender on
    // every chunk; it does not show that Steam prints these lines so.
    const { createSender } = createRequire(import.meta.url)('../steam-sender.js');
    const clip = steamClipSamples(), N = clip.length;
    const senderOpens = (chunk, meanMin) => {
      let reads = 0;
      const clock = { next: () => { const k = reads++; return { time: 0.05 * k, since: 0.05 * k, samples: k === 0 ? chunk.length : 750 }; } };
      const s = createSender({ clock, lead: 0, meanMin });
      s.push(chunk);
      return s.info().spurts.length > 0;
    };
    const sums = (pos, len) => { let sum = 0, peak = 0, high = 0; for (let i = 0; i < len; i++) { const a = Math.abs(clip[(pos + i) % N]); sum += a; if (a > peak) peak = a; if (a >= 4915) high++; } return { sum, peak, high }; };
    const printed = (marks, len, { sum, peak, high }) => ({ marks, ms: (len / 24).toFixed(2), avg: (len ? sum / len / 32767 * 100 : 0).toFixed(2), max: (peak / 32768 * 100).toFixed(3), high: String(high) });
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    // One chunk line at a place of the clip, its marks from the sender.
    const chunkAt = (pos, len) => {
      const s = sums(pos, len);
      const samples = Int16Array.from({ length: len }, (_, i) => clip[(pos + i) % N]);
      const active = senderOpens(samples), peak = senderOpens(samples, 1e12), mean = peak ? 100 * s.sum >= 32767 * len : active;
      return { kind: 'chunk', pos, len, ...printed(`${active ? '+' : ' '}${mean ? '+' : ' '}${peak ? '+' : ' '}`, len, s) };
    };
    const chunks = [];   // { kind: 'chunk', pos, len, ... } and { kind: 'looped' }
    for (let pos = 0, total = 0, first = true; total < 2 * N; first = false) {
      const len = first ? 6000 : Math.trunc((0.048 + 0.0157 * random()) * 24000);
      if (pos + len > N) chunks.push({ kind: 'looped' });
      chunks.push(first ? { kind: 'chunk', pos, len, ...printed('   ', len, sums(pos, len)) } : chunkAt(pos, len));
      pos = (pos + len) % N; total += len;
    }
    const PATH = `C:\\${MARKERS[0]}\\${MARK}-Clip.wav`;
    const HEAD = [`Logged in as ${MARK}-Account`, `] mic_inputfile ${PATH}`, `"mic_inputfile" = "${PATH}"`, `Connected to ${MARK}-Address:27017`];
    const LOADED = `loaded voice input file ${PATH}, ${N} samples (${(N / 24000).toFixed(1)} seconds)`;
    const TAIL = [`${MARK}-Account is now offline`];
    const chunkText = (c) => `[${c.marks}] [${c.ms.padStart(6)} msec] avgsample ${c.avg.padStart(6)} | max ${c.max.padStart(7)} | high samples ${c.high.padStart(4)}`;
    const toLines = (list) => list.map((c) => (c.kind === 'chunk' ? chunkText(c) : c.kind === 'looped' ? `voice input file ${PATH} looped` : c.text));
    // Lines worked by hand, with their marks typed: constant chunks of 327 and
    // 328 (both print 1.00; the first fails, the second passes), single
    // samples of 4914, 4915 and -4915 in 1500 zeros, a chunk of one sample.
    const constant = (v, len) => ({ sum: v * len, peak: v, high: v >= 4915 ? 1 : 0 });
    const HAND = [printed('   ', 1500, constant(327, 1500)), printed('++ ', 1500, constant(328, 1500)), printed('   ', 1500, { sum: 4914, peak: 4914, high: 0 }),
      printed('+ +', 1500, { sum: 4915, peak: 4915, high: 1 }), printed('+ +', 1500, { sum: 4915, peak: 4915, high: 1 }), printed('   ', 1, { sum: 0, peak: 0, high: 0 })].map((c) => ({ kind: 'chunk', ...c }));
    const textOf = (list, { stamps = false, end = '\r\n', loaded = true, hand = false, head = HEAD } = {}) => {
      let lines = [...head, ...(hand ? toLines(HAND) : []), ...(loaded ? [LOADED] : []), ...toLines(list), ...TAIL];
      if (stamps) lines = lines.map((l, i) => `[2026-01-02 03:${String(4 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}] ${l}`);
      // console_log.txt ends most lines with CRLF and some with a line feed alone (measured).
      return lines.map((l, i) => l + (end === 'mixed' ? (i % 7 === 3 ? '\n' : '\r\n') : end)).join('');
    };
    const writeText = (name, text, utf16 = false) => { const f = at(name); fs.writeFileSync(f, utf16 ? Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(text, 'utf16le')]) : Buffer.from(text, 'latin1')); return f; };
    const clipFile = at('steam_mic_24000.wav');
    fs.writeFileSync(clipFile, steamClipWav());
    const lineCount = chunks.filter((c) => c.kind === 'chunk').length, loops = chunks.filter((c) => c.kind === 'looped').length;
    const kinds = new Set(chunks.filter((c) => c.kind === 'chunk').map((c) => c.marks));
    const at100 = chunks.filter((c) => c.kind === 'chunk' && c.avg === '1.00').length;
    check(`the stand-in: ${lineCount} chunk lines over two passes (${loops} looped lines), all four kinds of bracket, ${at100} that print a mean of 1.00`,
      lineCount > 900 && loops === 2 && ['+++', '++ ', '+ +', '   '].every((k) => kinds.has(k)) && kinds.size === 4 && at100 > 5);
    const G = (x, g) => (new RegExp(`${g}, [^\\n]*: ([\\d,]+) of ([\\d,]+), expected all: (as expected|differs)`).exec(x.out) || []).slice(1).join(' ');
    const copies = [
      ['the text copied from the console (CRLF, no stamps)', writeText('steam_console.txt', textOf(chunks))],
      ['console_log.txt (stamps, CRLF and some line feeds alone)', writeText('console_log.txt', textOf(chunks, { stamps: true, end: 'mixed' }))],
      ['the text with line feeds alone', writeText('steam_console_lf.txt', textOf(chunks, { end: '\n' }))],
      ['the text saved as UTF-16 with a byte-order mark', writeText('steam_console_utf16.txt', textOf(chunks), true)]
    ];
    for (const [what, f] of copies) {
      const one = run('gate', f), two = run('gate', f, clipFile);
      check(`on ${what}, file 1 alone: as expected, G1 to G3 on every line`, passes(one) && ['G1', 'G2', 'G3'].every((g) => /^(\d[\d,]*) \1 as expected$/.test(G(one, g))), `${show(one)}; G1 ${G(one, 'G1')}`);
      check(`... with the clip as file 2: as expected, G4 and G5 on every line walked, two passes`, passes(two) && ['G4', 'G5'].every((g) => /^(\d[\d,]*) \1 as expected$/.test(G(two, g))) && /passes through the clip that the walk made: 2; looped lines in the walked text: 2/.test(two.out)
        && /the generated steam_mic_24000\.wav: yes/.test(two.out), `${show(two)}; G4 ${G(two, 'G4')}`);
    }
    const base = copies[0][1], r1 = run('gate', base), r2 = run('gate', base, clipFile);
    check('the information lines: the four brackets counted, the peaks 4,914 without the third mark and 4,915 with it, chunks passed by their peak alone, the means nearest 1.0% on either side',
      /brackets: \[\+\+\+\] [\d,]+, \[\+\+ \] [\d,]+, \[\+ \+\] [\d,]+, \[   \] [\d,]+/.test(r1.out) && /the highest peak without the third mark: 4,914 samples \(14\.996\); the lowest with it: 4,915 samples \(14\.999\)/.test(r1.out)
      && /chunks that passed by their peak alone: [1-9]/.test(r1.out) && /the highest exact mean without the second mark: 0\.99\d\d%; the lowest with it: 1\.00\d\d%/.test(r2.out), (/the highest exact[^\n]*/.exec(r2.out) || [''])[0]);
    const hand = writeText('steam_console_hand.txt', textOf(chunks, { hand: true }));
    const h1 = run('gate', hand), h2 = run('gate', hand, clipFile);
    check('with the lines worked by hand before the loaded line (327 and 328, single samples of 4914, 4915 and -4915, one sample): as expected alone and with the clip; one more line of one sample and two more of 1.00',
      passes(h1) && passes(h2) && /lines of one sample \(0\.04 ms\), counted apart from every figure: 1; lines that print a mean of 1\.00, counted apart from G3: (\d+)/.test(h1.out)
      && Number(/counted apart from G3: (\d+)/.exec(h1.out)[1]) === at100 + 2, `${show(h1)}; ${show(h2)}`);

    // The breaks, each on one line of the stand-in.
    const variant = (change) => { const list = chunks.map((c) => ({ ...c })); change(list); return list; };
    const idx = (test, from = 0) => chunks.findIndex((c, i) => i >= from && c.kind === 'chunk' && test(c));
    const flip = (m, k) => m.slice(0, k) + (m[k] === '+' ? ' ' : '+') + m.slice(k + 1);
    const mid = Math.floor(chunks.length / 2);
    const breaks = [
      ['one first mark flipped', variant((l) => { const i = idx((c) => c.marks === '+++', mid); l[i].marks = flip(l[i].marks, 0); }), 'G1'],
      ['one third mark set on a line with no high sample', variant((l) => { const i = idx((c) => c.marks === '   ' && c.high === '0' && Number(c.avg) > 0.2, mid); l[i].marks = '+ +'; }), 'G2'],
      ['one count of high samples set to 0 on a line that passed by its peak', variant((l) => { const i = idx((c) => c.marks === '+ +'); l[i].high = '0'; }), 'G2'],
      ['one printed mean raised from under 1.00 to 1.01, its marks kept', variant((l) => { const i = idx((c) => c.marks === '   ' && Number(c.avg) >= 0.95 && Number(c.avg) < 1); l[i].avg = '1.01'; }), 'G3']
    ];
    for (const [what, list, g] of breaks) {
      const x = run('gate', writeText(`steam_console_${g}_${breaks.findIndex(([w]) => w === what)}.txt`, textOf(list)));
      check(`${what}: differs, ${g}`, fails(x, new RegExp(`${g} does not hold`)) && /differs$/.test(G(x, g)), show(x));
    }
    // Breaks that only the clip can see (G4 and G5): as expected with file 1
    // alone, differs with the clip.
    const clipOnly = [
      ['a printed mean far from 1.00 moved by 0.02, its marks kept', variant((l) => { const i = idx((c) => Number(c.avg) > 5, mid); l[i].avg = (Number(l[i].avg) + 0.02).toFixed(2); }), 'G4'],
      ['a printed peak under 14.9 moved by 0.010', variant((l) => { const i = idx((c) => Number(c.max) > 1 && Number(c.max) < 14.9, mid); l[i].max = (Number(l[i].max) + 0.01).toFixed(3); }), 'G4'],
      ['one length moved by 0.04 ms', variant((l) => { const i = idx((c) => c.marks === '+++', mid); l[i].ms = (Number(l[i].ms) + 0.04).toFixed(2); }), 'G4'],
      ['one line that prints 1.00 with its second mark (and so its first) against the clip\'s', variant((l) => { const i = idx((c) => c.avg === '1.00' && c.marks[2] === ' '); l[i].marks = flip(flip(l[i].marks, 0), 1); }), 'G5'],
      ['one count of high samples moved from n to n + 1 on a line whose third mark is set', variant((l) => { const i = idx((c) => c.marks[2] === '+' && Number(c.high) > 0, mid); l[i].high = String(Number(l[i].high) + 1); }), 'G4']
    ];
    for (const [what, list, g] of clipOnly) {
      const f = writeText(`steam_console_${g}_clip_${clipOnly.findIndex(([w]) => w === what)}.txt`, textOf(list));
      const alone = run('gate', f), x = run('gate', f, clipFile);
      check(`${what}: as expected with file 1 alone, differs with the clip on ${g}`, passes(alone) && fails(x, new RegExp(`${g} does not hold`)) && /differs$/.test(G(x, g)), `${show(alone)}; ${show(x)}`);
    }
    const removed = variant((l) => { l.splice(idx((c) => c.marks === '+++', mid), 1); });
    const rm = run('gate', writeText('steam_console_removed.txt', textOf(removed)), clipFile);
    check('one chunk line removed from the middle, with the clip: differs, G4', fails(rm, /G4/), show(rm));
    const shorter = at('steam_mic_short.wav');
    fs.writeFileSync(shorter, wavBytes(clip.subarray(0, N - 28800), 24000));
    const other = run('gate', base, shorter);
    check('another clip as file 2 (the clip less its last 1.2 s): differs, the text is not of that clip', fails(other, /not of that clip/), show(other));
    const reversed = at('steam_mic_reversed.wav');
    fs.writeFileSync(reversed, wavBytes(Int16Array.from(clip).reverse(), 24000));
    const rev = run('gate', base, reversed);
    check('another clip of the same length (the clip reversed): differs, G4', fails(rev, /G4/) && /the generated steam_mic_24000\.wav: no/.test(rev.out), show(rev));
    const at22 = run('gate', base, writeWav('steam_mic_22050.wav', clip.subarray(0, 22050), 22050));
    check('a clip at 22050 Hz: differs, naming 24000 Hz and the plain header', fails(at22, /not a 16-bit mono WAV at 24000 Hz/), show(at22));
    const tagged = run('gate', base, writeWav('steam_mic_tagged.wav', clip, 24000, Buffer.from(`INFOINAM\u0010\u0000\u0000\u0000${MARKERS[3]}`)));
    check('the clip with a LIST chunk before its samples (not the plain 44-byte header): differs', fails(tagged, /plain 44-byte header/), show(tagged));
    // A second try in one Steam session: no loaded line, the text starting at
    // a later chunk; the place is found by the chunk lines.
    const later = chunks.slice(idx((c) => true, 40));
    const noLoad = run('gate', writeText('steam_console_noload.txt', textOf(later, { loaded: false })), clipFile);
    check('a text with no loaded line, starting at a later chunk: as expected with the clip, the place found by its chunk lines', passes(noLoad) && /the place in file 2 was found by its first \d+ chunk lines/.test(noLoad.out), show(noLoad));
    const noLoadOther = run('gate', writeText('steam_console_noload2.txt', textOf(later, { loaded: false })), reversed);
    check('... given the reversed clip: differs, no place fits', fails(noLoadOther, /no place in file 2 fits/), show(noLoadOther));
    // The walk ends at the typed command and at the console's answer: after
    // the walked lines, mic_inputfile set to nothing and 40 lines of another
    // place (a microphone's, as far as the clip can tell), which would not fit
    // the walk.
    const micLines = chunks.slice(idx((c) => true, 100)).filter((c) => c.kind === 'chunk').slice(0, 40);
    const ended = (lines) => run('gate', writeText(`steam_console_end_${lines.length}.txt`, textOf([...chunks, ...lines.map((text) => ({ kind: 'text', text })), ...micLines])), clipFile);
    const typedEnd = ended(['] mic_inputfile ""', '"mic_inputfile" = ""']), answerEnd = ended(['"mic_inputfile" = ""']);
    check('the walk ends at the typed command and the answer: 40 chunk lines after them are not walked, as expected with the clip',
      passes(typedEnd) && /chunk lines not walked, judged by file 1's figures alone: 40$/m.test(typedEnd.out) && /G1, [^\n]*: 1,053 of 1,053/.test(typedEnd.out), show(typedEnd));
    check('... and at the answer alone', passes(answerEnd) && /chunk lines not walked, judged by file 1's figures alone: 40$/m.test(answerEnd.out), show(answerEnd));
    // A chunk inside the walk split into one sample and the rest, as Set J
    // printed one: the one-sample line prints a mean of 0.00, no mark and no
    // high sample, and moves the walk and the search on by one sample.
    const k = idx((c) => c.marks === '+++' && Math.abs(clip[c.pos]) > 1000), whole = chunks[k];
    const split = [...chunks.slice(0, k), { kind: 'chunk', pos: whole.pos, len: 1, ...printed('   ', 1, { sum: 0, peak: Math.abs(clip[whole.pos]), high: 0 }) }, chunkAt(whole.pos + 1, whole.len - 1), ...chunks.slice(k + 1)];
    const withLoad = run('gate', writeText('steam_console_split.txt', textOf(split)), clipFile);
    check('a chunk split into one sample and the rest, inside the walk: as expected with the clip, the one-sample line counted apart',
      passes(withLoad) && /chunk lines walked through file 2: [\d,]+, of which 1 of one sample, counted apart/.test(withLoad.out), show(withLoad));
    const noLoadSplit = run('gate', writeText('steam_console_split_noload.txt', textOf(split.slice(k), { loaded: false })), clipFile);
    check('... the text from that one-sample line on, with no loaded line: as expected, the place found by the search, which the one-sample line does not rule out',
      passes(noLoadSplit) && /the place in file 2 was found by its first \d+ chunk lines, at sample ([\d,]+)/.test(noLoadSplit.out)
      && Number(/at sample ([\d,]+)/.exec(noLoadSplit.out)[1].replace(/,/g, '')) === whole.pos, show(noLoadSplit));
    // The search is capped: the clip twice over as file 2, so that every line
    // fits two places.
    const twice = at('steam_mic_twice.wav');
    fs.writeFileSync(twice, wavBytes(Int16Array.from({ length: 2 * N }, (_, i) => clip[i % N]), 24000));
    const capped = run('gate', writeText('steam_console_noload_all.txt', textOf(chunks, { loaded: false })), twice);
    check('a text with no loaded line against the clip twice over: differs after 200 chunk lines, which still fit 2 places',
      fails(capped, /does not say where in the clip it starts: its first 200 chunk lines \(at most 200, a choice of this check\) still fit 2 places/), show(capped));
    // The floors.
    const quiet = run('gate', writeText('steam_console_quiet.txt', textOf(chunks.filter((c) => c.kind === 'chunk' && c.marks === '   '))));
    check('the quiet lines alone: differs, no chunk on each side of 1.0%', fails(quiet, /no chunk on each side of 1\.0%/), show(quiet));
    const noChunk = run('gate', writeText('steam_console_none.txt', textOf([])));
    check('no chunk line: differs, naming @voice_spew_activity_check 1', fails(noChunk, /no chunk lines: type @voice_spew_activity_check 1/), show(noChunk));
    const firstN = (n) => { const out = []; for (const c of chunks) { if (out.filter((x) => x.kind === 'chunk').length === n) break; out.push(c); } return out; };
    const r49 = run('gate', writeText('steam_console_49.txt', textOf(firstN(49))));
    check('49 chunk lines: differs, fewer than 50 (a choice of this check)', fails(r49, /only 49 chunk lines, fewer than 50/), show(r49));
    check('... and 50: as expected', passes(run('gate', writeText('steam_console_50.txt', textOf(firstN(50))))));
    const trailing = variant((l) => { const i = idx((c) => true, mid); l[i] = { kind: 'text', text: `${chunkText(l[i])} ${MARK}-After` }; });
    const tr = run('gate', writeText('steam_console_trailing.txt', textOf(trailing)));
    check('a chunk line with text after its count: differs, by its line number, the text not printed', fails(tr, /file 1: line \d+ begins as a chunk line and does not read as one/) && !hasMarker(tr.out), show(tr));
    const binary = at('steam_console_binary.txt');
    fs.writeFileSync(binary, Buffer.concat([Buffer.from([0, 255, 1, 2, 3, 0x89]), Buffer.from(`${MARK}-Header`), Buffer.alloc(300, 7)]));
    check('a file that is not text: differs, no chunk lines', fails(run('gate', binary), /no chunk lines/));
    const refused = [['no file', []], ['three files', [base, clipFile, clipFile]], ['a missing file', [path.join(folder, `${MARKERS[2]}-missing.txt`)]], ['an option', [base, '--fps', '300']]]
      .map(([what, args]) => [what, run('gate', ...args)]).filter(([, x]) => x.status !== 2 || verdict(x) !== 'cannot check');
    check('no file, three files, a missing file, an option gate does not take: cannot check, exit 2', refused.length === 0, refused.map(([w, x]) => `${w}: ${show(x)}`).join('; '));
    const missingClip = run('gate', base, path.join(folder, `${MARKERS[2]}-missing.wav`));
    check('a missing clip: cannot check, exit 2', missingClip.status === 2 && /file 2 cannot be read/.test(missingClip.out), show(missingClip));
  }

  console.log('\n[13] The game\'s recordings that are published (tests/recordings/files/)');
  {
    const manifest = JSON.parse(fs.readFileSync(path.join(here, 'recordings', 'manifest.json'), 'utf8'));
    const rows = manifest.rows || [];
    const published = path.join(here, 'recordings', 'files');
    const n = (s) => Number(s.replace(/,/g, ''));
    const fmt = (v) => v.toLocaleString('en-US');
    // The clips the rows' inputs name, made here by the generator: nothing is
    // fetched.
    const clips = path.join(tmp, 'published-clips');
    fs.mkdirSync(clips);
    const clipBySha = {};
    for (const rate of [22050, 11025]) {
      const b = clipWav(rate), f = path.join(clips, `voice_input_${rate}.wav`);
      fs.writeFileSync(f, b);
      clipBySha[crypto.createHash('sha256').update(b).digest('hex')] = f;
    }
    // The samples of a WAV's data chunk, read here apart from the script.
    const samplesOf = (file) => {
      const b = fs.readFileSync(file);
      for (let o = 12; o + 8 <= b.length;) {
        const id = b.toString('latin1', o, o + 4), size = b.readUInt32LE(o + 4);
        if (id === 'data') return Int16Array.from({ length: Math.floor(Math.min(size, b.length - o - 8) / 2) }, (_, i) => b.readInt16LE(o + 8 + 2 * i));
        o += 8 + size + (size & 1);
      }
      return null;
    };
    // The command of a row's check, on the files in `dir`.
    const argsOf = (row, dir) => [row.check.name, ...row.check.options, ...row.check.files.map((f) =>
      (f === 'this' ? path.join(dir, row.name) : f === 'input' ? clipBySha[row.input.sha256] || path.join(clips, 'no-such-clip.wav') : path.join(dir, f)))];
    // What a run printed, as the row's figures.
    const figures = (name, out) => {
      const g = (re) => { const m = re.exec(out); return m ? n(m[1]) : undefined; };
      if (name === 'celt') {
        return { lag: g(/lag: ([\d,]+) samples; compared: the first/), compared: g(/compared: the first ([\d,]+) samples/),
          equal: g(/samples equal: ([\d,]+) of/), of: g(/samples equal: [\d,]+ of ([\d,]+)/), largest: g(/largest difference: ([\d,]+) step/) };
      }
      if (name === 'speex') {
        return { lag: g(/lag: ([\d,]+) samples \(the codec's delay\)/), compared: g(/compared: ([\d,]+) samples, file 1's/),
          equal: g(/samples equal: ([\d,]+) of/), of: g(/samples equal: [\d,]+ of ([\d,]+)/), largest: g(/largest difference: ([\d,]+)/) };
      }
      if (name === 'inputs') {
        // The capture against the clip from its third sample: no lag, and no
        // largest difference printed, which is 0 when every sample is equal.
        const equal = g(/samples equal to the clip's: ([\d,]+) of/), of = g(/samples equal to the clip's: [\d,]+ of ([\d,]+)/);
        return { lag: /from its third sample/.test(out) ? 0 : undefined, compared: of, equal, of, largest: equal !== undefined && equal === of ? 0 : undefined };
      }
      return null;
    };
    // A row's check on the files in `dir`: its problems, none when the run
    // says "as expected" with the row's own figures.
    const checkRow = (row, dir) => {
      const problems = [];
      const named = row.check.files.filter((f) => f !== 'input').map((f) => (f === 'this' ? row.name : f));
      const missing = named.filter((f) => !fs.existsSync(path.join(dir, f)));
      if (missing.length) problems.push(`no file ${missing.join(', ')}`);
      if (row.check.files.includes('input') && !clipBySha[row.input.sha256]) problems.push('its input is not a clip the generator makes');
      const r = run(...argsOf(row, dir));
      if (!passes(r)) problems.push(show(r));
      const fig = figures(row.check.name, r.out);
      if (!fig) problems.push(`the suite does not read the check ${row.check.name}`);
      else {
        for (const k of ['lag', 'compared', 'equal', 'largest']) if (fig[k] !== row.check[k]) problems.push(`${k} ${fig[k]}, the row's ${row.check[k]}`);
        if (fig.of !== fig.compared) problems.push(`the count is out of ${fig.of}, not of the ${fig.compared} compared`);
      }
      return { problems, fig };
    };
    // The samples of a file outside [lag, lag + compared): how many, and how
    // many are not zero.
    const apart = (file, lag, compared) => {
      const s = samplesOf(file);
      if (!s) return { count: 0, nonzero: 1, length: 0 };
      let count = 0, nonzero = 0;
      for (let i = 0; i < s.length; i++) if (i < lag || i >= lag + compared) { count++; if (s[i] !== 0) nonzero++; }
      return { count, nonzero, length: s.length };
    };
    // gain on each voice_maxgain 1 file with the voice_maxgain 10 file of the
    // same codec and a shared set; its last packet is counted apart.
    const PACKET = { vaudio_speex: 160, vaudio_celt: 512, vaudio_celt_high: 1024 };
    const voice = rows.filter((r) => r.kind === 'decoded voice');
    const pairs = voice.filter((r) => r.made_with.voice_maxgain === 10).flatMap((ten) => voice
      .filter((one) => one.made_with.voice_maxgain === 1 && one.made_with.codec === ten.made_with.codec && one.sets.some((s) => ten.sets.includes(s)))
      .map((one) => [one, ten]));
    const checkGain = (one, ten, dir) => {
      const problems = [];
      const r = run('gain', path.join(dir, one.name), path.join(dir, ten.name));
      if (!passes(r)) problems.push(show(r));
      const m = /samples that differ before the last packet: ([\d,]+) of ([\d,]+)/.exec(r.out);
      const want = Math.min(one.format.samples, ten.format.samples) - PACKET[one.made_with.codec];
      if (!m || n(m[1]) !== 0 || n(m[2]) !== want) problems.push(`differ before the last packet: ${m ? `${m[1]} of ${m[2]}` : 'not printed'}, expected 0 of ${fmt(want)}`);
      return { problems, compared: m ? fmt(n(m[2])) : '?' };
    };

    check('the manifest lists published recordings, and every row names this suite in its used_by',
      rows.length > 0 && rows.every((r) => Array.isArray(r.used_by) && r.used_by.includes('tests/reproduce.verify.mjs')), `${rows.length} rows`);
    for (const row of rows) {
      const { problems, fig } = checkRow(row, published);
      const what = [row.check.name, ...row.check.options].join(' ');
      // The codec the row names is the one its check runs: the pairs for
      // gain are built from it.
      const codec = row.check.name === 'celt' ? (row.check.options.includes('--high') ? 'vaudio_celt_high' : 'vaudio_celt') : row.check.name === 'speex' ? 'vaudio_speex' : null;
      if (codec) check(`${row.name}: its row's codec, ${row.made_with.codec}, is the one ${what} runs`, row.made_with.codec === codec, `${what} runs ${codec}`);
      check(`${row.name}: ${what} is as expected with its row's count${fig && fig.equal !== undefined ? `, ${fmt(fig.equal)} of ${fmt(fig.compared)} equal at lag ${fig.lag}, largest ${fig.largest}` : ''}`,
        problems.length === 0, problems.join('; '));
      const there = fs.existsSync(path.join(published, row.name));
      const a = there ? apart(path.join(published, row.name), row.check.lag, row.check.compared) : { count: 0, nonzero: 0, length: 0 };
      check(`${row.name}: the ${fmt(a.count)} samples its check does not compare are all zero`,
        there && a.nonzero === 0 && a.length > 0 && row.check.lag + row.check.compared <= a.length, there ? `${a.nonzero} not zero` : 'no file');
    }
    check('gain has a pair to run on', pairs.length > 0, `${pairs.length} pairs`);
    // Every voice_maxgain 1 file that shares a set with a voice_maxgain 10
    // file, whatever codec its row names, is in a pair: a wrong codec in a
    // row cannot drop one unseen.
    const unpaired = voice.filter((one) => one.made_with.voice_maxgain === 1
      && voice.some((ten) => ten.made_with.voice_maxgain === 10 && one.sets.some((s) => ten.sets.includes(s)))
      && !pairs.some(([p]) => p === one));
    check('every voice_maxgain 1 file that shares a set with a voice_maxgain 10 file is paired with it for gain (same codec)', unpaired.length === 0,
      unpaired.map((r) => `${r.name} (${r.made_with.codec}) has no pair`).join('; ') || pairs.map(([o]) => o.name).join(', '));
    for (const [one, ten] of pairs) {
      const { problems, compared } = checkGain(one, ten, published);
      check(`gain ${one.name} ${ten.name}: as expected, 0 of ${compared} differ before the last packet`, problems.length === 0, problems.join('; '));
    }

    // The breaks, on a copy of the folder this suite makes, for the rows
    // whose files are there (a missing one has failed above).
    const copy = path.join(tmp, 'published-copy');
    fs.mkdirSync(copy);
    for (const row of rows) if (fs.existsSync(path.join(published, row.name))) fs.copyFileSync(path.join(published, row.name), path.join(copy, row.name));
    const present = (row) => fs.existsSync(path.join(copy, row.name));
    const broken = rows.filter((row) => row.check.files.every((f) => f === 'input' || present(f === 'this' ? row : { name: f })));
    const brokenPairs = pairs.filter(([one, ten]) => present(one) && present(ten));
    const withSamples = (row, edit, body) => {
      const file = path.join(copy, row.name), original = fs.readFileSync(file);
      const s = samplesOf(file), bytes = Buffer.from(original), start = bytes.length - 2 * s.length;
      edit(s).forEach((v, i) => bytes.writeInt16LE(v, start + 2 * i));
      fs.writeFileSync(file, bytes);
      try { return body(file); } finally { fs.writeFileSync(file, original); }
    };
    const removedMissed = [], movedMissed = [], apartMissed = [], gainMissed = [];
    for (const row of broken) {
      const file = path.join(copy, row.name), away = path.join(tmp, 'removed.wav');
      fs.renameSync(file, away);
      try {
        const { problems } = checkRow(row, copy);
        if (!problems.some((p) => /^no file /.test(p)) || !problems.some((p) => /cannot check/.test(p))) removedMissed.push(row.name);
      } finally { fs.renameSync(away, file); }
      const mid = row.check.lag + Math.floor(row.check.compared / 2);
      withSamples(row, (s) => moved(s, mid), () => { if (checkRow(row, copy).problems.length === 0) movedMissed.push(row.name); });
      const outside = row.check.lag > 0 ? 0 : row.check.lag + row.check.compared;
      withSamples(row, (s) => { const t = Int16Array.from(s); t[outside] = 3; return t; }, (f) => {
        if (apart(f, row.check.lag, row.check.compared).nonzero !== 1) apartMissed.push(row.name);
      });
    }
    for (const [one, ten] of brokenPairs) {
      withSamples(one, (s) => moved(s, Math.floor(s.length / 2)), () => { if (checkGain(one, ten, copy).problems.length === 0) gainMissed.push(one.name); });
    }
    check('with each file removed from a copy of the folder, its row fails ("no file", the check cannot check)', removedMissed.length === 0 && broken.length > 0, removedMissed.join(', '));
    check('with one sample of each file moved by three steps, on a copy, its row fails', movedMissed.length === 0 && broken.length > 0, movedMissed.join(', '));
    check('with one sample of each file\'s part its check does not compare made 3, on a copy, the zero test finds it', apartMissed.length === 0 && broken.length > 0, apartMissed.join(', '));
    check('with one sample of each gain pair\'s voice_maxgain 1 file moved by three steps, on a copy, gain fails', gainMissed.length === 0 && brokenPairs.length > 0, gainMissed.join(', '));
  }

  console.log('\n[6] Nothing leaves the PC');
  {
    const MODS = 'net|dns|dgram|http|https|http2|tls|child_process|worker_threads|cluster|inspector';
    const NETWORK = [
      [/\bfetch\s*\(/, 'a call to fetch'],
      [new RegExp(`(?:from\\s*|require\\s*\\(\\s*|import\\s*\\(\\s*)['"](?:node:)?(?:${MODS})(?:/[a-z]+)?['"]`), 'a network module, a child process or a worker'],
      [new RegExp(`\\bnode:(?:${MODS})\\b`), 'such a module by its node: name'],
      [/\b(?:getBuiltinModule|internalBinding)\b|\bprocess\.binding\b/, 'a module or binding reached by name'],
      [/\b(?:WebSocket|XMLHttpRequest|EventSource)\b/, 'a browser network object']
    ];
    const scan = (text) => NETWORK.filter(([re]) => re.test(text)).map(([, what]) => what);
    // What is read: the script, every file under tests/reproduce/, the
    // clips' generator, every file a run of this suite loaded (the guard's
    // log), and the engine's files, which tests/lib/engine.cjs reads as text.
    const files = new Set([SCRIPT, path.join(here, 'recordings', 'make-inputs.mjs')]);
    const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else files.add(p); } };
    walk(path.join(here, 'reproduce'));
    const loaded = [...new Set(fs.readFileSync(loadLog, 'utf8').split('\n').filter(Boolean))].map((u) => fileURLToPath(u)).filter((f) => !f.startsWith(tmp));
    for (const f of loaded) files.add(f);
    for (const f of ENGINE_FILES) files.add(path.join(root, f));
    const outside = loaded.filter((f) => path.relative(root, f).startsWith('..'));
    const named = ['tests/reproduce/gain-compare.mjs', 'tests/lib/engine.cjs', 'opus-codec.mjs', 'vendor/celt-0.11/index.mjs', 'vendor/speex-1.0.2/index.mjs',
      'reference.js', 'demo.js'];
    check('the guard\'s log names the modules the checks load (the comparison of the gain, the engine\'s loader, the codec module, CELT, Speex, the real-take check\'s reference.js and demo.js), all in the repository',
      named.every((f) => loaded.includes(path.join(root, f))) && outside.length === 0 && !loaded.includes(path.join(here, 'gain-exact.mjs')),
      outside.length ? `outside: ${outside.length}` : `${loaded.length} files loaded`);
    const found = [...files].map((f) => [path.relative(root, f), scan(fs.readFileSync(f, 'latin1'))]).filter(([, w]) => w.length);
    check('none of them, nor the script, tests/reproduce/, the generator or the engine\'s files, holds a network module, a child process, a worker, fetch or a browser network object',
      found.length === 0 && files.size > 20, found.map(([f, w]) => `${f}: ${w.join(', ')}`).join('; ') || `${files.size} files`);
    const planted = ['await fetch(url)', "import net from 'node:net';", "const d = require('dgram');", "import https from 'https';", "await import('node:child_process')",
      "const { Worker } = await import('node:worker_threads')", "process.getBuiltinModule('net')", "process.binding('tcp_wrap')", 'new WebSocket(u)'];
    const missed = planted.filter((t) => scan(t).length === 0);
    check('the text check catches each planted form (fetch, node:net, require dgram, https, child_process, worker_threads, getBuiltinModule, process.binding, WebSocket)',
      missed.length === 0, missed.join(' | '));
    check('tests/gain-exact.mjs, which starts a child process, is caught by the text check (the reason the comparison is a file of its own)',
      scan(fs.readFileSync(path.join(here, 'gain-exact.mjs'), 'utf8')).length > 0);

    const calls = fs.readFileSync(netLog, 'utf8');
    check(`no run of this suite (${runs.length}) called the network, a process or a worker`, calls === '' && runs.length > 30, calls.trim().split('\n').join(', '));
    const probe = path.join(tmp, 'probe.mjs');
    fs.writeFileSync(probe, `import net from 'node:net'; import dns from 'node:dns'; import dgram from 'node:dgram';
import cp from 'node:child_process'; import { Worker } from 'node:worker_threads';
const unguarded = "require('fs').appendFileSync(process.env.REPRODUCE_NET_LOG, 'RAN-UNGUARDED\\\\n')";
const tries = [() => net.connect(80, 'example.invalid'), () => new net.Socket().connect(80, 'example.invalid'), () => dns.lookup('example.invalid', () => {}),
  () => dgram.createSocket('udp4'), () => fetch('https://example.invalid/'), () => process.getBuiltinModule('net').connect(80, 'example.invalid'),
  () => cp.spawnSync(process.execPath, ['-e', unguarded]), () => cp.spawn(process.execPath, ['-e', unguarded]), () => cp.exec('true'), () => cp.execFile('true'), () => cp.fork('x.js'),
  () => new Worker(unguarded + "; require('net').connect(80, '127.0.0.1').on('error', () => {})", { eval: true }),
  () => process.binding('tcp_wrap')];
for (const t of tries) { try { t(); } catch {} }
await new Promise((r) => setTimeout(r, 300));`);
    guarded(probe, []);
    const caught = fs.readFileSync(netLog, 'utf8').trim().split('\n').filter(Boolean);
    const want = ['net.connect', 'net.Socket.prototype.connect', 'dns.lookup', 'dgram.createSocket', 'fetch', 'child_process.spawnSync', 'child_process.spawn',
      'child_process.exec', 'child_process.execFile', 'child_process.fork', 'worker_threads.Worker', 'process.binding tcp_wrap'];
    check('the guard records and refuses, in a guarded child, a socket, a stream connect, a lookup, a datagram socket, a fetch, a module reached by getBuiltinModule, spawnSync, spawn, exec, execFile, fork, a worker that would connect and the TCP binding; nothing ran unguarded',
      want.every((w) => caught.includes(w)) && !caught.includes('RAN-UNGUARDED'), caught.join(', '));
    fs.writeFileSync(netLog, '');
  }

  console.log('\n[7] The output holds nothing of the files');
  {
    const missing = run('celt', path.join(folder, `${MARKERS[2]}-missing.wav`));
    check('a file that does not exist: cannot check, exit 2, no path', missing.status === 2 && /file 1 cannot be read \(there is no such file\)/.test(missing.out), show(missing));
    const text = at('not-a-wav.wav');
    fs.writeFileSync(text, `${MARKERS[1]} said hello\n`);
    const notWav = run('gain', text, text);
    check('a text file given as a WAV: differs, "not a WAV file"', fails(notWav, /file 1 is not a WAV file/), show(notWav));
    const tagged = run('speex', writeWav('tagged.wav', speex1, 11025, Buffer.from(`INFOINAM\u0010\u0000\u0000\u0000${MARKERS[3]}`)));
    check('a WAV with a LIST chunk holding a name: read, as expected, its header called not the plain one', passes(tagged) && /more than the plain 44 bytes/.test(tagged.out), show(tagged));
    const option = run('gain', `--${MARKERS[4]}`, 'x');
    check('an option no check takes: cannot check, exit 2, by its place', option.status === 2 && /argument 1 is not an option/.test(option.out), show(option));
    const leaking = runs.filter((r) => hasMarker(r.out));
    const kinds = { pass: runs.filter((r) => r.status === 0).length, differ: runs.filter((r) => r.status === 1).length, refused: runs.filter((r) => r.status >= 2).length };
    check(`no marker in the output of any run (${runs.length}: ${kinds.pass} as expected, ${kinds.differ} differing, ${kinds.refused} refused or not built)`,
      leaking.length === 0 && kinds.pass > 10 && kinds.differ > 10 && kinds.refused > 5, leaking.map((r) => r.args).join('; '));
    const echo = path.join(tmp, 'echo.mjs');
    fs.writeFileSync(echo, 'console.log(`file 1: ${process.argv[2]}`);');
    check('the marker check catches a run that prints its file\'s path', hasMarker(guarded(echo, [at('x.wav')]).out));
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} reproduce checks passed${failed ? `, ${failed} failed` : ''}`);
if (failed) process.exit(1);
