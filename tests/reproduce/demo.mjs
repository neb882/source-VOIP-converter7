// The check `demo` (docs/REPRODUCE.md, "With a server"): Steam's voice
// packets, as a SourceTV demo keeps them, are 20 ms Opus frames in hybrid
// mode at 24000 Hz, one-byte frames where the encoder sent no sound, and
// frame numbers that start again at 0 after every end marker (measured, Set D:
// findings 2, 11 and 16).
//
//   demo <the demo.dem>
//
// The demo is read with demo.js (TF2Demo.parse), as the page and
// tests/demovoice/extract.mjs read it. The script prints counts only: nothing
// of the demo's header (its server, name, map, game, length or ticks), no
// SteamID, no player and no address, and a speaker is never named. Per frame
// it checks the first byte (the TOC of RFC 6716): configuration 13 (hybrid,
// 12 kHz band, 20 ms), one channel, one frame. Per voice message it checks
// the sample-rate record: exactly one, saying 24000. Per phrase it checks
// that a frame after an end marker is numbered 0. Expected (measured, Set D's
// demo): every frame of that kind, 693 of 5,109 frames of one byte, all 20
// phrases starting at 0, 1,816 messages; the counts are the demo's own. A demo
// with no Steam voice, or with no phrase after an end marker, is "differs"
// with the reason.
import { createRequire } from 'node:module';
import { cannot, differs, fmt, parseArgs, readBytes } from './common.mjs';

const TF2Demo = createRequire(import.meta.url)('../../demo.js');

// The TOC byte of a 20 ms hybrid frame with a 12 kHz band, one channel and
// one frame (RFC 6716: configuration 13, s = 0, c = 0).
export const HYBRID_SWB_20MS = 13 << 3;
export const STEAM_RATE = 24000;
const CODECS = ['steam', 'vaudio_celt', 'vaudio_celt_high', 'vaudio_speex', 'vaudio_miles'];

// Each Steam voice message's sample-rate records, read as demo.js reads the
// payload (SteamID, sections, CRC-32): a list of the rates a message names,
// or null for a message that is not Steam voice.
function rateRecords(d) {
  if (d.length < 12) return null;
  const view = new DataView(d.buffer, d.byteOffset, d.length);
  if (TF2Demo.crc32(d, d.length - 4) !== view.getUint32(d.length - 4, true)) return null;
  const rates = [], end = d.length - 4;
  for (let i = 8; i + 3 <= end;) {
    const kind = d[i], value = view.getUint16(i + 1, true);
    i += 3;
    if (kind === 11) rates.push(value);
    else if (kind === 6) i += value;
    else if (kind !== 0) break;
  }
  return rates;
}

export default {
  name: 'demo',
  summary: 'Steam\'s packets in a SourceTV demo',
  usage: ['demo <the demo.dem>'],
  async run(args, report) {
    const { files } = parseArgs(args);
    if (files.length !== 1) throw cannot('give one file: a SourceTV demo');
    const bytes = readBytes(files[0], 'file 1');
    let parsed;
    try { parsed = TF2Demo.parse(bytes); } catch { throw differs('file 1 is not a Source demo this script can read'); }
    report.line(`file 1: a Source demo with ${fmt(parsed.voice.length)} voice message${parsed.voice.length === 1 ? '' : 's'} (nothing of its header is printed)`);
    if (parsed.errors) report.info(`packets of the demo that could not be read to their end: ${fmt(parsed.errors)}`);
    const named = parsed.codecs.length ? parsed.codecs[parsed.codecs.length - 1].codec : null;
    if (named !== null) report.info(`the codec the server announced: ${CODECS.includes(named) ? named : 'a name this script does not know'}`);
    if (!parsed.voice.length) throw differs('file 1 holds no voice: record a demo with SourceTV while someone speaks');
    const steam = parsed.speakers.filter((s) => s.codec === 'steam');
    if (named !== null && named !== 'steam') throw differs(`the demo's voice is ${CODECS.includes(named) ? named : 'not Steam voice'}: record with sv_voicecodec steam, the game's default`);
    const messages = parsed.voice.map((m) => rateRecords(m.data)).filter(Boolean);
    let frames = 0, oneByte = 0, ofKind = 0, ends = 0, silences = 0, after = 0, atZero = 0, skips = 0, firstAtZero = 0;
    for (const s of steam) {
      let afterEnd = false, first = true, next = null;
      for (const p of s.packets) {
        if (p.kind === 'end') { ends++; afterEnd = true; next = null; continue; }
        if (p.kind === 'silence') { silences++; continue; }
        if (p.kind !== 'opus') continue;
        frames++;
        if (p.data.length === 1) oneByte++;
        if (p.data.length >= 1 && p.data[0] === HYBRID_SWB_20MS) ofKind++;
        if (afterEnd) { after++; if (p.seq === 0) atZero++; }
        else if (first && p.seq === 0) firstAtZero++;
        if (next !== null && ((p.seq - next) & 0xFFFF) > 0 && ((p.seq - next) & 0xFFFF) < 0x8000) skips++;
        next = (p.seq + 1) & 0xFFFF;
        afterEnd = false; first = false;
      }
    }
    if (!frames || !messages.length) throw differs('file 1 holds no Steam voice frames (no voice message carries a SteamID, sections and a CRC that checks)');
    report.info(`speakers with Steam voice: ${fmt(steam.length)}; voice messages read: ${fmt(messages.length)} of ${fmt(parsed.voice.length)}`);
    const oneRate = messages.filter((r) => r.length === 1 && r[0] === STEAM_RATE).length;
    const ok1 = report.figure(`frames that are 20 ms Opus frames in hybrid mode, one channel (TOC configuration 13): ${fmt(ofKind)} of ${fmt(frames)}, expected all`, ofKind === frames);
    const ok2 = report.figure(`voice messages with one sample-rate record, of 24000 Hz: ${fmt(oneRate)} of ${fmt(messages.length)}, expected all`, oneRate === messages.length);
    report.info(`one-byte frames (the encoder sent no sound): ${fmt(oneByte)} of ${fmt(frames)}`);
    report.info(`end markers: ${fmt(ends)}; silence records: ${fmt(silences)}; frame numbers that skip forward (frames lost before the demo): ${fmt(skips)}`);
    report.info(`the first phrase of ${steam.length === 1 ? 'the speaker' : 'each speaker'} starts at number 0: ${fmt(firstAtZero)} of ${fmt(steam.length)} (a demo started in mid-phrase starts elsewhere)`);
    if (!after) throw differs('no phrase follows an end marker, so the numbering cannot be shown: record at least two phrases with a pause between them');
    const ok3 = report.figure(`phrases after an end marker whose first frame is numbered 0: ${fmt(atZero)} of ${fmt(after)}, expected all`, atZero === after);
    const many = (n, one, more) => `${fmt(n)} ${n === 1 ? one : more}`;
    if (!ok1) throw differs(`${many(frames - ofKind, 'frame is not a 20 ms hybrid Opus frame', 'frames are not 20 ms hybrid Opus frames')} of one channel`);
    if (!ok2) throw differs(`${many(messages.length - oneRate, 'voice message does', 'voice messages do')} not carry one sample-rate record of 24000 Hz`);
    if (!ok3) throw differs(`${many(after - atZero, 'phrase after an end marker does', 'phrases after an end marker do')} not start at frame number 0`);
  }
};
