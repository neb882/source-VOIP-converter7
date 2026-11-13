// What the checks of tests/reproduce.mjs share: reading a WAV, the report
// they print, the reasons they give, and the parsing of their arguments.
//
// Nothing a check prints may come from a file it was given or from its path:
// a file is named by its place among the arguments ("file 1"), and an error
// is described in the script's own words. The output is figures and those
// words only, so it can be posted as it is (docs/REPRODUCE.md).
import fs from 'node:fs';

// A step that cannot go on: `exit` 1 is "differs" (the files cannot show the
// rule, or do not), 2 is "cannot check" (the arguments, or a file that cannot
// be read). The message is the script's own words.
export class Stop extends Error {
  constructor(message, exit = 1) { super(message); this.exit = exit; }
}
export const differs = (reason) => new Stop(reason, 1);
export const cannot = (reason) => new Stop(reason, 2);

// 291840 as 291,840.
export function fmt(n) {
  const s = String(Math.abs(Math.trunc(n)));
  return `${n < 0 ? '-' : ''}${s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

// The lines a check prints, in order.
export function createReport() {
  const lines = [];
  return {
    lines,
    line(text = '') { lines.push(text); },
    // A figure with what was expected and the verdict beside it.
    figure(text, ok) { lines.push(`  ${text}: ${ok ? 'as expected' : 'differs'}`); return ok; },
    info(text) { lines.push(`  ${text}`); }
  };
}

// The arguments of a check: files in order, and the options it takes
// (`flags`, given alone, and `values`, each followed by a value). Anything
// else stops with its place among the arguments, never its text.
export function parseArgs(args, { flags = [], values = [] } = {}) {
  const files = [], options = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      if (flags.includes(a)) options[a.slice(2)] = true;
      else if (values.includes(a)) {
        if (i + 1 >= args.length) throw cannot(`argument ${i + 1} needs a value after it`);
        options[a.slice(2)] = args[++i];
      } else throw cannot(`argument ${i + 1} is not an option this check takes`);
    } else files.push(a);
  }
  return { files, options };
}

// A number option within [lo, hi], or the default.
export function numberOption(options, name, fallback, lo, hi) {
  if (options[name] == null) return fallback;
  const v = Number(options[name]);
  if (!Number.isFinite(v) || v < lo || v > hi) throw cannot(`--${name} takes a number from ${lo} to ${hi}`);
  return v;
}

// A whole-number option within [lo, hi], or the default.
export function wholeOption(options, name, fallback, lo, hi) {
  const v = numberOption(options, name, fallback, lo, hi);
  if (!Number.isInteger(v)) throw cannot(`--${name} takes a whole number from ${lo} to ${hi}`);
  return v;
}

function readBytes(file, label) {
  try {
    return fs.readFileSync(file);
  } catch (error) {
    const why = { ENOENT: 'there is no such file', EISDIR: 'it is a folder', EACCES: 'it may not be read', EPERM: 'it may not be read' }[error.code];
    throw cannot(`${label} cannot be read${why ? ` (${why})` : ''}`);
  }
}

// A 16-bit mono PCM WAV: { rate, samples (Int16Array), plain }. `plain` is
// true for a file that is exactly a 44-byte header and its samples, as the
// game writes them. `label` ("file 1") is the only name a message uses.
export function readWav(file, label) {
  const b = readBytes(file, label);
  if (b.length < 12 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WAVE') throw differs(`${label} is not a WAV file`);
  let fmtChunk = null, data = null, dataAt = 0;
  for (let o = 12; o + 8 <= b.length;) {
    const id = b.toString('latin1', o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === 'fmt ' && size >= 16 && o + 24 <= b.length) {
      fmtChunk = { format: b.readUInt16LE(o + 8), channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    }
    if (id === 'data' && !data) { data = b.subarray(o + 8, Math.min(b.length, o + 8 + size)); dataAt = o + 8; }
    o += 8 + size + (size & 1);
  }
  if (!fmtChunk || !data) throw differs(`${label} is a WAV file with no ${fmtChunk ? 'sound (no data chunk)' : 'format chunk'}`);
  if (fmtChunk.format !== 1 || fmtChunk.channels !== 1 || fmtChunk.bits !== 16) {
    throw differs(`${label} is not 16-bit mono PCM (it holds ${fmtChunk.channels} channel${fmtChunk.channels === 1 ? '' : 's'} of ${fmtChunk.bits} bits, format ${fmtChunk.format}), and the game writes only that`);
  }
  const samples = new Int16Array(data.length >> 1);
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(2 * i);
  const plain = dataAt === 44 && b.length === 44 + 2 * samples.length;
  return { rate: fmtChunk.rate, samples, plain };
}

// One line on a file as read: its rate, its samples, and whether its header
// is the plain one the game writes.
export function describe(label, wav) {
  return `${label}: ${wav.rate} Hz, ${fmt(wav.samples.length)} samples, ${wav.plain ? 'a plain 44-byte header' : 'a header with more than the plain 44 bytes (the game writes the plain one)'}`;
}

// Whether any sample in [from, to) is not zero.
export function hasSound(samples, from = 0, to = samples.length) {
  for (let i = from; i < to; i++) if (samples[i] !== 0) return true;
  return false;
}
