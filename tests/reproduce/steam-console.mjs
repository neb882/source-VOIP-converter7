// Steam's console text as numbers, for the check `gate`: the text copied out
// of Steam's console window, or Steam's own console_log.txt, which holds the
// same lines with a stamp in front of each (measured; tests/REFERENCE_2026.md,
// "Steam's chunk line" and "The checks gate and queue (2026-11-13)").
//
// readSteamConsole(bytes) -> { chunks, marks, counts }:
//   chunks  one per chunk line that @voice_spew_activity_check 1 prints, in
//           order: { line, active, mean, peak, ms, avg, max, high }: its line
//           number, its three marks (active, mean passed, peak passed), the
//           length in hundredths of a millisecond, the mean of |x| in
//           hundredths of a percent of 32767, the peak in thousandths of a
//           percent of 32768, and the count of high samples, all whole
//           numbers as printed;
//   marks   the lines that end a walk through the clip, in order, each with
//           its place among the chunk lines (`at`: the chunk lines before
//           it): { kind: 'loaded', at, samples } for "loaded voice input file
//           <path>, <N> samples (<S> seconds)", keeping N only; { kind:
//           'answer', at } for the console's answer to mic_inputfile; {
//           kind: 'typed', at } for the typed command; and { kind: 'looped',
//           at } for "voice input file <path> looped";
//   counts  lines, chunk lines, the lines with a stamp, and every other line,
//           counted and not kept.
//
// The path that four kinds of line carry (loaded, looped, the typed command
// and the answer) is never kept: those lines are known by their fixed start
// and end and give a number or a count. Every other line is counted only. A
// line that begins as a chunk line (after the optional stamp: a bracket of
// three characters, each + or a space, then " [") and does not read as one
// whole stops the reading with its line number and no text: ConsoleError.
//
// The bytes: UTF-16 with a byte-order mark (an editor may save the text so;
// Steam's own files are plain ASCII, measured), else one character a byte, a
// UTF-8 byte-order mark dropped. Lines end in a line feed, with or without a
// carriage return before it, both in one file (measured in console_log.txt).
export class ConsoleError extends Error {}

const STAMP = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] /;
const LIKE_CHUNK = /^\[[+ ]{3}\] \[/;
const CHUNK = /^\[([+ ])([+ ])([+ ])\] \[ *(\d{1,6})\.(\d{2}) msec\] avgsample +(\d{1,3})\.(\d{2}) \| max +(\d{1,3})\.(\d{3}) \| high samples +(\d{1,9})$/;
const LOADED = /^loaded voice input file .*, (\d{1,12}) samples \(\d{1,9}(?:\.\d{1,9})? seconds\)$/;
const LOOPED = /^voice input file .* looped$/;
const ANSWER = /^"mic_inputfile" = /;
const TYPED = /^\] mic_inputfile(?: |$)/;

export function decode(bytes) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) return b.subarray(2, b.length - (b.length & 1)).toString('utf16le');
  if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) {
    const s = Buffer.from(b.subarray(2, b.length - (b.length & 1)));
    s.swap16();
    return s.toString('utf16le');
  }
  const start = b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF ? 3 : 0;
  return b.subarray(start).toString('latin1');
}

export function readSteamConsole(bytes) {
  const text = decode(bytes);
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const chunks = [], marks = [];
  const counts = { lines: lines.length, chunks: 0, stamped: 0, loaded: 0, looped: 0, answers: 0, typed: 0, other: 0 };
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.endsWith('\r')) line = line.slice(0, -1);
    const stamp = STAMP.exec(line);
    if (stamp) { counts.stamped++; line = line.slice(stamp[0].length); }
    if (LIKE_CHUNK.test(line)) {
      const m = CHUNK.exec(line);
      if (!m) throw new ConsoleError(`line ${i + 1} begins as a chunk line and does not read as one`);
      chunks.push({
        line: i + 1, active: m[1] === '+', mean: m[2] === '+', peak: m[3] === '+',
        ms: Number(m[4]) * 100 + Number(m[5]), avg: Number(m[6]) * 100 + Number(m[7]), max: Number(m[8]) * 1000 + Number(m[9]), high: Number(m[10])
      });
      counts.chunks++;
      continue;
    }
    let m;
    if ((m = LOADED.exec(line))) { marks.push({ kind: 'loaded', at: chunks.length, samples: Number(m[1]) }); counts.loaded++; }
    else if (LOOPED.test(line)) { marks.push({ kind: 'looped', at: chunks.length }); counts.looped++; }
    else if (ANSWER.test(line)) { marks.push({ kind: 'answer', at: chunks.length }); counts.answers++; }
    else if (TYPED.test(line)) { marks.push({ kind: 'typed', at: chunks.length }); counts.typed++; }
    else counts.other++;
  }
  return { chunks, marks, counts };
}
