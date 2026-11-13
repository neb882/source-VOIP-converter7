// What a WAV file holds, chunk by chunk, before it may be published
// (order RP-01, section 7: "The header, read and listed"). WAV only: any
// other file is said not to be a WAV, and nothing in it is read further.
//
//   node tests/recordings/inspect.mjs <file>...
//
// For each file, named by its place among the arguments ("file 1"), never by
// its path or name, it prints: every chunk in order with its size; each
// metadata chunk it holds by name (LIST and its list type, bext, iXML, cart,
// id3 ); whether the file is exactly a 44-byte header and its samples, as
// the game writes it; the file's SHA-256 and the SHA-256 of the bytes of its
// data chunk; and its rate, channels, bits and samples. Those are the fields
// of a row of tests/recordings/manifest.json. Nothing of a chunk's contents
// is printed but its four-letter name and, for LIST, its list type, each
// with any character outside printable ASCII shown as \xNN.
//
// Exit 0: every file is a WAV that is exactly a plain 44-byte header and its
// samples. 1: some file is not (a file that is anything else stays out of
// the manifest; nothing is rewritten). 2: a file cannot be read, or no file
// was given.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// The chunks that carry metadata, by their four-letter names.
export const METADATA = ['LIST', 'bext', 'iXML', 'cart', 'id3 ', 'ID3 '];

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

// A four-byte name as printable text: \xNN for anything else.
export function printable(text) {
  return [...text].map((c) => {
    const code = c.charCodeAt(0);
    return code >= 0x20 && code < 0x7f && c !== '\\' ? c : `\\x${code.toString(16).padStart(2, '0')}`;
  }).join('');
}

// What a file's bytes hold: { wav: false } for a file that is not a RIFF
// WAVE; else { wav: true, riffSize, chunks: [{ id, at, size, listType,
// overruns }], trailing, metadata, format, data, plain, problems, sha256,
// pcmSha256 }. `plain` is true for exactly a 44-byte header and its samples:
// RIFF's size the file's length less 8, a 16-byte PCM `fmt ` chunk at byte
// 12, a `data` chunk at byte 36 that runs to the file's end, nothing else.
export function inspectWav(bytes) {
  if (bytes.length < 12 || bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WAVE') {
    return { wav: false, bytes: bytes.length, sha256: sha256(bytes) };
  }
  const riffSize = bytes.readUInt32LE(4), chunks = [], problems = [];
  let format = null, data = null, o = 12;
  while (o + 8 <= bytes.length) {
    const id = bytes.toString('latin1', o, o + 4), size = bytes.readUInt32LE(o + 4);
    const end = o + 8 + size, overruns = end > bytes.length;
    const chunk = { id, at: o, size, overruns };
    if (id === 'LIST' && size >= 4 && o + 12 <= bytes.length) chunk.listType = bytes.toString('latin1', o + 8, o + 12);
    chunks.push(chunk);
    if (id === 'fmt ' && !format) {
      if (size >= 16 && o + 24 <= bytes.length) {
        format = {
          tag: bytes.readUInt16LE(o + 8), channels: bytes.readUInt16LE(o + 10), rate: bytes.readUInt32LE(o + 12),
          byteRate: bytes.readUInt32LE(o + 16), blockAlign: bytes.readUInt16LE(o + 20), bits: bytes.readUInt16LE(o + 22)
        };
      } else problems.push('its fmt chunk is shorter than 16 bytes');
    }
    if (id === 'data' && !data) data = { at: o + 8, size, bytes: bytes.subarray(o + 8, Math.min(bytes.length, end)) };
    if (overruns) { problems.push(`its ${printable(id)} chunk runs past the end of the file`); o = bytes.length; break; }
    o = end + (size & 1);
  }
  const trailing = Math.max(0, bytes.length - o);
  if (trailing) problems.push(`${trailing} byte${trailing === 1 ? '' : 's'} after the last chunk`);
  if (riffSize !== bytes.length - 8) problems.push(`RIFF says ${riffSize + 8} bytes and the file holds ${bytes.length}`);
  if (!format) problems.push('no fmt chunk');
  if (!data) problems.push('no data chunk');
  const metadata = chunks.filter((c) => METADATA.includes(c.id)).map((c) => (c.id === 'LIST' ? `LIST (${c.listType != null ? printable(c.listType) : 'no list type'})` : printable(c.id)));
  const width = format ? (format.bits >> 3) * format.channels : 0;
  const samples = data && width ? Math.floor(data.bytes.length / width) : 0;
  const plain = problems.length === 0 && chunks.length === 2 &&
    chunks[0].id === 'fmt ' && chunks[0].at === 12 && chunks[0].size === 16 && format.tag === 1 &&
    chunks[1].id === 'data' && chunks[1].at === 36 && 44 + data.size === bytes.length;
  return {
    wav: true, bytes: bytes.length, riffSize, chunks, trailing, metadata, format, plain, problems, samples,
    sha256: sha256(bytes), pcmSha256: data ? sha256(data.bytes) : null
  };
}

// The lines for one file, named only by `label`.
export function describeWav(label, r) {
  if (!r.wav) return [`${label}: not a WAV file (no RIFF WAVE header); ${r.bytes} bytes; nothing more is read`, `  SHA-256 of the file: ${r.sha256}`];
  const lines = [`${label}: a WAV file of ${r.bytes} bytes`];
  lines.push('  chunks, in order:');
  for (const c of r.chunks) {
    lines.push(`    ${printable(c.id).padEnd(4)}  at byte ${c.at}, ${c.size} bytes${c.listType != null ? `, list type ${printable(c.listType)}` : ''}${c.overruns ? ' (runs past the end of the file)' : ''}`);
  }
  lines.push(`  metadata chunks: ${r.metadata.length ? r.metadata.join(', ') : 'none'}`);
  if (r.format) {
    const f = r.format;
    lines.push(`  format: ${f.tag === 1 ? 'PCM' : `format tag ${f.tag}, not PCM`}, ${f.rate} Hz, ${f.channels} channel${f.channels === 1 ? '' : 's'}, ${f.bits} bits, ${r.samples} samples`);
  }
  for (const p of r.problems) lines.push(`  problem: ${p}`);
  lines.push(`  SHA-256 of the file: ${r.sha256}`);
  lines.push(`  SHA-256 of the data chunk's bytes: ${r.pcmSha256 ?? 'none (no data chunk)'}`);
  lines.push(`  exactly a 44-byte header and its samples: ${r.plain ? 'yes' : 'no'}`);
  return lines;
}

export function main(argv) {
  if (!argv.length) {
    console.log('node tests/recordings/inspect.mjs <file>...\nPrints each WAV file\'s chunks, its metadata chunks, whether it is exactly a 44-byte header and its samples, and its SHA-256s and format. A file is named by its place among the arguments.');
    return 2;
  }
  let exit = 0;
  argv.forEach((file, i) => {
    const label = `file ${i + 1}`;
    let bytes;
    try {
      bytes = fs.readFileSync(file);
    } catch (error) {
      const why = { ENOENT: 'there is no such file', EISDIR: 'it is a folder', EACCES: 'it may not be read', EPERM: 'it may not be read' }[error.code];
      console.log(`${label}: cannot be read${why ? ` (${why})` : ''}`);
      exit = 2;
      return;
    }
    const r = inspectWav(bytes);
    console.log(describeWav(label, r).join('\n'));
    if (!r.plain && exit === 0) exit = 1;
  });
  return exit;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) process.exitCode = main(process.argv.slice(2));
