// A sound file's own sample rate, read from its header (filerate.js). The
// headers here are written byte by byte; the files in tests/filerate are
// half-second 440 Hz tones made with ffmpeg 6.1 (libmp3lame, its aac,
// libvorbis, libopus), for example:
//   ffmpeg -f lavfi -i sine=frequency=440:duration=0.5:sample_rate=48000 -af volume=0.3 \
//     -ac 1 -map_metadata -1 -ar 22050 -c:a libmp3lame -b:a 32k tone_22050.mp3
// (tone_22050.aac and .m4a: -c:a aac -b:a 32k; .ogg: -c:a libvorbis -q:a 0;
// tone_16000.opus and .webm: -ar 16000 -c:a libopus -b:a 24k.) The browser
// suite decodes them at the rates read here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../filerate.js');
let passed = 0;
function check(name, ok, detail = '') { assert.ok(ok, `${name} ${detail}`); passed++; console.log(`  ok    ${name}${detail ? `   [${detail}]` : ''}`); }
const file = (folder, name) => new Uint8Array(fs.readFileSync(new URL(`./${folder}/${name}`, import.meta.url)));
const ascii = (s) => [...s].map(c => c.charCodeAt(0));
const le32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
const le16 = (v) => [v & 255, (v >> 8) & 255];
const be32 = (v) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
function bytes(...parts) {
  const out = [];
  const add = (p) => { if (Array.isArray(p) || p instanceof Uint8Array) for (const x of p) add(x); else out.push(p); };
  add(parts);
  return Uint8Array.from(out);
}
const RATES = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000];

console.log('\n[File rate] WAV');
function wav(rate, { kind = 'RIFF', extensible = false, before = [] } = {}) {
  const fmt = extensible
    ? ['fmt ', 40, [le16(0xfffe), le16(1), le32(rate), le32(rate * 2), le16(2), le16(16), le16(22), le16(16), le32(4), le16(1), new Array(14).fill(0)]]
    : ['fmt ', 16, [le16(1), le16(1), le32(rate), le32(rate * 2), le16(2), le16(16)]];
  const chunks = [...before, fmt, ['data', 8, new Array(8).fill(0)]];
  if (kind !== 'RIFF') chunks.unshift(['ds64', 28, new Array(28).fill(0)]);
  return bytes(ascii(kind), le32(kind === 'RIFF' ? 0 : 0xffffffff), ascii('WAVE'),
    chunks.map(([id, size, body]) => [ascii(id), le32(size), body, size & 1 ? [0] : []]));
}
for (const rate of RATES) {
  const got = R.read(wav(rate));
  check(`a ${rate} Hz WAV reads as ${rate} Hz`, got && got.rate === rate && got.format === 'WAV', JSON.stringify(got));
}
check('WAVE_FORMAT_EXTENSIBLE reads its rate', R.read(wav(96000, { extensible: true })).rate === 96000);
check('RF64 and BW64 (with ds64) read their rate', R.read(wav(22050, { kind: 'RF64' })).rate === 22050 && R.read(wav(44100, { kind: 'BW64' })).rate === 44100,
  R.read(wav(22050, { kind: 'RF64' })).format);
check('chunks before fmt are skipped, odd sizes padded', R.read(wav(11025, { before: [['LIST', 5, [1, 2, 3, 4, 5]], ['junk', 2, [0, 0]]] })).rate === 11025);
check('a WAV whose fmt chunk is missing or cut off gives no rate', R.read(bytes(ascii('RIFF'), le32(0), ascii('WAVE'), ascii('data'), le32(4), [0, 0, 0, 0])) === null
  && R.read(wav(22050).subarray(0, 26)) === null);

console.log('\n[File rate] AIFF');
// The 80-bit extended rate: exponent 16383 + e, mantissa with its top bit set.
function extended(rate) {
  const e = Math.floor(Math.log2(rate)), m = BigInt(rate) << BigInt(63 - e);
  return [((16383 + e) >> 8) & 0x7f, (16383 + e) & 255, ...Array.from({ length: 8 }, (_, i) => Number((m >> BigInt(56 - 8 * i)) & 255n))];
}
const aiff = (rate, kind = 'AIFF') => bytes(ascii('FORM'), be32(46), ascii(kind), ascii('COMM'), be32(18), [0, 1], be32(100), [0, 16], extended(rate),
  ascii('SSND'), be32(8), new Array(8).fill(0));
check('AIFF and AIFF-C read their COMM rate', [22050, 44100, 96000, 8000].every(r => R.read(aiff(r)).rate === r) && R.read(aiff(32000, 'AIFC')).format === 'AIFF-C');

console.log('\n[File rate] FLAC');
const streamInfo = (rate) => [0, 16, 16, 0, 0, 0, 0, 0, 0, 0, (rate >> 12) & 255, (rate >> 4) & 255, ((rate & 15) << 4) | 0x0, 0xf0, ...new Array(20).fill(0)];
const flacFile = (rate) => bytes(ascii('fLaC'), [0x80, 0, 0, 34], streamInfo(rate));
const id3 = (size, footer = false) => bytes(ascii('ID3'), [4, 0, footer ? 0x10 : 0], [(size >> 21) & 127, (size >> 14) & 127, (size >> 7) & 127, size & 127], new Array(size + (footer ? 10 : 0)).fill(0));
check('FLAC reads STREAMINFO\'s 20-bit rate', RATES.every(r => R.read(flacFile(r)).rate === r) && R.read(flacFile(192000)).rate === 192000);
check('FLAC after an ID3v2 tag (with a footer) reads its rate', R.read(bytes(id3(300, true), flacFile(22050))).rate === 22050);
check('the file made by flac.js reads its rate', R.read(require('../flac.js').encode(new Int16Array(4096), 32000)).rate === 32000);

console.log('\n[File rate] MPEG audio');
// One frame: MPEG version bits (3: MPEG-1, 2: MPEG-2, 0: MPEG-2.5), Layer III,
// a bitrate index and rate index; the body fills the frame's length.
function mpegFrames(version, rateIndex, count = 4, bitrate = 5) {
  const rate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
  const kbps = (version === 3 ? [0, 32, 40, 48, 56, 64] : [0, 8, 16, 24, 32, 40])[bitrate];
  const length = Math.floor((version === 3 ? 144000 : 72000) * kbps / rate);
  const frame = [0xff, 0xe0 | (version << 3) | (1 << 1) | 1, (bitrate << 4) | (rateIndex << 2), 0xc4, ...new Array(length - 4).fill(0x55)];
  return { rate, data: bytes(new Array(count).fill(frame)) };
}
const mpegSeen = [];
for (const version of [3, 2, 0]) for (const rateIndex of [0, 1, 2]) {
  const { rate, data } = mpegFrames(version, rateIndex);
  const got = R.read(data);
  mpegSeen.push(`${got && got.format} ${got && got.rate}`);
  assert.ok(got && got.rate === rate, `MPEG version ${version} rate index ${rateIndex}: ${JSON.stringify(got)}`);
}
check('MPEG-1, 2 and 2.5 Layer III frames read all nine rates', true, mpegSeen.join(', '));
check('MP3 after ID3v2 tags reads its rate', R.read(bytes(id3(1000), id3(20), mpegFrames(2, 1).data)).rate === 24000);
const fake = [0xff, 0xfb, 0x50, 0xc4, 1, 2, 3, 4, 5, 6, 7, 8];
check('a stray frame sync is not taken for a frame', R.read(bytes(fake, mpegFrames(0, 2).data)).rate === 8000
  && R.read(bytes(new Array(64).fill(7), fake, new Array(500).fill(9))) === null);
check('a run of frames that ends with the file still reads', R.read(mpegFrames(3, 0, 1).data).rate === 44100);

console.log('\n[File rate] AAC');
// ADTS: profile (object type - 1) and frequency index; frame length 32.
const adts = (aot, index, count = 3) => bytes(new Array(count).fill([0xff, 0xf1, ((aot - 1) << 6) | (index << 2), 0x40, 0x04, 0x1f, 0xfc, ...new Array(25).fill(0)]));
check('ADTS AAC-LC at 44.1 and 48 kHz reads its rate', R.read(adts(2, 4)).rate === 44100 && R.read(adts(2, 3)).rate === 48000, R.read(adts(2, 3)).format);
check('ADTS AAC-LC with a core of 24 kHz or less is decoded at twice it (implicit SBR)',
  R.read(adts(2, 6)).rate === 48000 && R.read(adts(2, 7)).rate === 44100 && R.read(adts(2, 11)).rate === 16000, R.read(adts(2, 7)).note);
// AudioSpecificConfig bit strings.
const asc = (bits) => { const out = []; for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).padEnd(8, '0'), 2)); return Uint8Array.from(out); };
const b = (v, n) => v.toString(2).padStart(n, '0');
check('AudioSpecificConfig: AAC-LC at 44.1 kHz', R.ascRate(asc(b(2, 5) + b(4, 4) + b(2, 4) + '000')).rate === 44100);
check('AudioSpecificConfig: explicit HE-AAC (object type 5 and 29) gives the SBR rate',
  R.ascRate(asc(b(5, 5) + b(6, 4) + b(2, 4) + b(3, 4) + b(2, 5) + '000')).rate === 48000
  && R.ascRate(asc(b(29, 5) + b(7, 4) + b(1, 4) + b(4, 4) + b(2, 5) + '000')).rate === 44100);
check('AudioSpecificConfig: the backward-compatible SBR extension gives its rate, or the core when it says no SBR',
  R.ascRate(asc(b(2, 5) + b(6, 4) + b(2, 4) + '000' + b(0x2b7, 11) + b(5, 5) + '1' + b(3, 4))).rate === 48000
  && R.ascRate(asc(b(2, 5) + b(6, 4) + b(2, 4) + '000' + b(0x2b7, 11) + b(5, 5) + '0')).rate === 24000);
check('AudioSpecificConfig: an explicit 24-bit frequency is read', R.ascRate(asc(b(2, 5) + b(15, 4) + b(44100, 24) + b(1, 4) + '000')).rate === 44100);

console.log('\n[File rate] Ogg');
const oggPage = (packet) => bytes(ascii('OggS'), [0, 2], new Array(20).fill(0), [1, packet.length], packet);
const vorbis = (rate) => oggPage(bytes([1], ascii('vorbis'), le32(0), [1], le32(rate), le32(0), le32(64000), le32(0), [0xb8, 1]));
const opus = (inputRate) => oggPage(bytes(ascii('OpusHead'), [1, 1], le16(312), le32(inputRate), le16(0), [0]));
const oggFlac = (rate) => oggPage(bytes([0x7f], ascii('FLAC'), [1, 0], [0, 0], ascii('fLaC'), [0x80, 0, 0, 34], streamInfo(rate)));
check('Ogg Vorbis reads its identification header', R.read(vorbis(32000)).rate === 32000 && R.read(vorbis(11025)).rate === 11025);
check('Ogg Opus decodes at 48 kHz whatever its input rate field says', R.read(opus(16000)).rate === 48000 && R.read(opus(44100)).rate === 48000, R.read(opus(16000)).note);
check('Ogg FLAC reads its STREAMINFO', R.read(oggFlac(88200)).rate === 88200);
check('an Ogg stream of another codec gives no rate', R.read(oggPage(bytes([0x80], ascii('theora'), new Array(30).fill(0)))) === null);

console.log('\n[File rate] Files made by ffmpeg');
const expected = {
  'filerate/tone_44100.mp3': [44100, 'MP3 (MPEG-1)'], 'filerate/tone_22050.mp3': [22050, 'MP3 (MPEG-2)'], 'filerate/tone_11025.mp3': [11025, 'MP3 (MPEG-2.5)'],
  'filerate/tone_44100.m4a': [44100, 'MP4 AAC'], 'filerate/tone_22050.m4a': [22050, 'MP4 AAC'], 'filerate/tone_22050.aac': [44100, 'AAC (ADTS)'],
  'filerate/tone_22050.ogg': [22050, 'Ogg Vorbis'], 'filerate/tone_16000.opus': [48000, 'Ogg Opus'],
  'video/h264_aac.mp4': [48000, 'MP4 AAC'], 'video/aac_h264_fragmented_nobase.mp4': [48000, 'MP4 AAC'], 'video/h264_pcm.mov': [8000, 'MOV sowt'],
  'video/vp9_opus.mp4': [48000, 'MP4 Opus']
};
// ffmpeg's AAC encoder ends its AudioSpecificConfig with the SBR extension
// saying "no SBR", so its 22.05 kHz M4A reads as 22.05 kHz; ADTS cannot say
// so, and the same audio there reads as possible HE-AAC at twice the rate.
for (const [name, [rate, format]] of Object.entries(expected)) {
  const [folder, base] = name.split('/'), got = R.read(file(folder, base));
  check(`${name}: ${format} at ${rate} Hz`, got && got.rate === rate && got.format === format, JSON.stringify(got));
}
check('WebM is not read (video.js does not parse it): the page decodes it at the device rate', R.read(file('filerate', 'tone_16000.webm')) === null);
check('unknown bytes, a short file and an MP4 with no sound give no rate',
  R.read(new Uint8Array(4096).fill(3)) === null && R.read(new Uint8Array(5)) === null
  && R.read(bytes(be32(16), ascii('ftyp'), ascii('isom'), be32(0), be32(8), ascii('moov'))) === null);

console.log('\n[File rate] decode()');
// decode() with stand-ins for the browser's contexts: the file's rate is
// tried first, and the device's context takes over on each kind of failure.
function contexts({ accept = () => true, fail = false } = {}) {
  const made = [];
  globalThis.OfflineAudioContext = class {
    constructor(channels, length, rate) { if (!accept(rate)) throw new Error('NotSupportedError'); this.rate = rate; made.push(rate); }
    async decodeAudioData(data) { if (fail) throw new Error('EncodingError'); return { sampleRate: this.rate, bytes: data.byteLength }; }
  };
  const device = { sampleRate: 48000, async decodeAudioData(data) { return { sampleRate: 48000, bytes: data.byteLength }; } };
  return { made, deviceContext: () => device };
}
let c = contexts();
let out = await R.decode(wav(22050).buffer.slice(0), c);
check('a readable rate is decoded on an OfflineAudioContext at that rate', out.native && out.buffer.sampleRate === 22050 && c.made[0] === 22050);
c = contexts({ accept: (rate) => rate >= 8000 });
out = await R.decode(wav(4000).buffer.slice(0), c);
check('a rate the context refuses falls back to the device rate, saying why', !out.native && out.buffer.sampleRate === 48000 && /4,000 Hz/.test(out.why), out.why);
c = contexts({ fail: true });
const source = wav(44100).buffer.slice(0);
out = await R.decode(source, c);
check('a failed decode at the file\'s rate falls back on a copy of the bytes', !out.native && out.buffer.bytes === source.byteLength && /failed/.test(out.why), out.why);
let fetched = 0;
out = await R.decode(wav(44100).buffer.slice(0), { ...contexts({ fail: true }), again: async () => { fetched++; return new ArrayBuffer(7); } });
check('with again(), the second try gets the bytes anew', !out.native && fetched === 1 && out.buffer.bytes === 7);
out = await R.decode(file('filerate', 'tone_16000.webm').buffer, contexts());
check('a rate that cannot be read falls back to the device rate, saying why', !out.native && out.buffer.sampleRate === 48000 && /could not be read/.test(out.why), out.why);
c = contexts();
delete globalThis.OfflineAudioContext;
out = await R.decode(wav(22050).buffer.slice(0), c);
check('a browser without OfflineAudioContext decodes at the device rate', !out.native && out.buffer.sampleRate === 48000, out.why);

console.log(`\n${passed} file-rate checks passed`);
