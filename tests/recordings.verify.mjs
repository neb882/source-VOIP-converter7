// The suite `recordings`: the files the read findings rest on, and the game's
// recordings that are published (order RP-01, sections 6 and 7, part d).
//
//   node tests/recordings.verify.mjs
//
// [1] The table "The files that were read" in tests/REFERENCE_2026.md: its
//     status line; its columns; ids F1 and up, in order; no empty cell; each
//     SHA-256 64 lowercase hex digits or "not kept" with words; nothing that
//     looks like an address (0x or 0X and four or more hex digits, or five or
//     more followed by h), a listing of bytes, or a path of a PC in a cell; no
//     cell longer than a name, a date, a build line or a hash
//     needs; "pending" only in the orchestrator's columns, and only while the
//     status line says "the orchestrator's cells are pending" (a skip line
//     then says some are left); the findings each row is read for are the
//     record's, and the section ends with one line a finding that names
//     exactly the rows read for it; the column "Files" of the table "What was
//     read" names only rows of the table.
// [2] The manifest, tests/recordings/manifest.json: its frame; every row's
//     fields, and nothing else; each hash 64 lowercase hex digits; the name of
//     the form set-<letter>_<what>_<settings>.wav with no date; sets only H,
//     I, M and O; the kind; input.script tests/recordings/make-inputs.mjs and
//     input.sha256 one of the clips it makes; the check of tests/reproduce.mjs
//     that showed the file, with at least 999 samples in 1,000 equal and none
//     more than one step off; no file the record gives as private (a hash in
//     any "### Set X" entry of its Provenance but those of H, I, M and O).
// [3] The folder, tests/recordings/files/: every file has a row and every row
//     a file; each file's SHA-256 and the SHA-256 of its data chunk are its
//     row's; each file is exactly a 44-byte header and its samples, in its
//     row's format; nothing else is in it; nothing ignores it (where git
//     cannot say, a skip line, but a failure on CI).
// [4] tests/recordings/inspect.mjs: every chunk with its size, the metadata
//     chunks by name, the plain 44-byte header said yes or no, the SHA-256s
//     and the format; no path or file name in what it prints; WAV only.
//
// Each check runs first on the repository's own files, then on stand-ins
// the suite makes (text, manifests, folders, WAV files), and each is shown to
// fail on its break. With no rows and an empty folder the suite passes and
// says that no recording is published yet. The stand-in manifest's example
// rows are shaped by the counts of the orchestrator's private run (the record,
// "The script run on the game's files"); their files are synthetic tones.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RATES, clipWav } from './recordings/make-inputs.mjs';
import { inspectWav } from './recordings/inspect.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = 'tests/REFERENCE_2026.md';
const MANIFEST = 'tests/recordings/manifest.json';
const FOLDER = 'tests/recordings/files';
const INSPECT = 'tests/recordings/inspect.mjs';
const MAKE_INPUTS = 'tests/recordings/make-inputs.mjs';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `   [${detail}]` : ''}`);
  if (!ok) failed++;
  return ok;
}
const skip = (what, why) => console.log(`  skip  ${what}: ${why}`);
const info = (line) => console.log(`  ..    ${line}`);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const short = (list, n = 3) => list.slice(0, n).join('; ') + (list.length > n ? `; and ${list.length - n} more` : '');
// A check on a stand-in that must fail: some problem matches `pattern`.
function breaks(name, problems, pattern) {
  const hit = problems.some((p) => pattern.test(p));
  return check(name, hit, hit ? problems.find((p) => pattern.test(p)) : `no problem matched ${pattern}; got: ${short(problems) || 'none'}`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recordings-suite-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// What the record holds, read from it.

const referenceText = read(REFERENCE);

// The findings' numbers (### N. in "## Findings").
function findingNumbers(text) {
  const findings = /\n## Findings\n([\s\S]*?)\n## /.exec(text)?.[1] || '';
  return new Set([...findings.matchAll(/^### (\d+)\. /gm)].map((m) => Number(m[1])));
}

// The sets whose files can be published: their entries may come to hold a
// published file's SHA-256 (order RP-01, part e).
const PUBLISHABLE = ['H', 'I', 'M', 'O'];

// The SHA-256s the record gives for the owner's private files: every hash in
// each "### Set X" entry of "## Provenance", wherever the entry stands, but
// the entries of Sets H, I, M and O. An entry runs to the next heading of its
// level or higher. Returns the hashes and the sets whose entries were read.
// The entry "The file-input runs" is no set's: its two clips are ours.
function privateHashes(text) {
  const hashes = new Set(), sets = [];
  const at = text.indexOf('\n## Provenance\n');
  if (at < 0) return { hashes, sets };
  const rest = text.slice(at + 1), end = rest.slice(1).search(/^## /m);
  const provenance = end < 0 ? rest : rest.slice(0, end + 1);
  for (const m of provenance.matchAll(/^### Set ([A-Z])\b[^\n]*\n([\s\S]*?)(?=^#{1,3} |(?![\s\S]))/gm)) {
    if (PUBLISHABLE.includes(m[1])) continue;
    sets.push(m[1]);
    for (const h of m[2].matchAll(/\b([0-9a-f]{64})\b/g)) hashes.add(h[1]);
  }
  return { hashes, sets };
}

// The record's SHA-256 of a private file, by the first cell of its row.
function recordHashOf(text, firstCell) {
  const line = text.split('\n').find((l) => l.startsWith(`| ${firstCell} |`));
  return line && /`([0-9a-f]{64})`/.exec(line)?.[1];
}

// The record's table of the two clips: rate to SHA-256.
function recordClips(text) {
  const entry = /\n### The file-input runs[^\n]*\n([\s\S]*?)\n### /.exec(text)?.[1] || '';
  const out = new Map();
  for (const m of entry.matchAll(/^\| the clip of [^|]+\| (\d+) Hz \|[^|]+\|[^|]+\| `([0-9a-f]{64})` \|$/gm)) out.set(Number(m[1]), m[2]);
  return out;
}

// The reports' file names, for the column "Report".
const REPORTS = fs.readdirSync(path.join(ROOT, 'docs/reports'));

// ---------------------------------------------------------------------------
// [1] The table of the files that were read.

const COLUMNS = ['Id', 'File', 'From', 'Build, as its owner can read it', 'Built', 'Taken', 'SHA-256', 'Read for', 'Report'];
// The columns whose cells may say "pending" while the status line says so:
// the orchestrator's, and those of a file whose name or source the reports do
// not state.
const MAY_PEND = new Set(['File', 'From', 'Build, as its owner can read it', 'Built', 'Taken', 'SHA-256']);
// A name, a date, a build line or a hash needs no more.
export const CELL_MAX = 100;
const EMPTY = new Set(['', '-', '–', '—', '``']);

const cellsOf = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

// The section "The files that were read": from its heading to the next
// heading of the same level or higher.
function filesSection(text) {
  const m = /^#### The files that were read\n/m.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length), next = /^#{1,4} /m.exec(rest);
  return rest.slice(0, next ? next.index : rest.length);
}

// The table "What was read": its header and rows.
function whatWasReadTable(text) {
  const m = /^### What was read\n([\s\S]*?)(?=^#{1,4} )/m.exec(text);
  if (!m) return null;
  const lines = m[1].split('\n'), at = lines.findIndex((l) => l.startsWith('| What |'));
  if (at < 0) return null;
  const rows = [];
  for (let i = at + 2; i < lines.length && lines[i].startsWith('|'); i++) rows.push(cellsOf(lines[i]));
  return { header: cellsOf(lines[at]), rows };
}

// The findings a "Read for" cell names: "2, 4, 21 to 27, 29 (words)".
function readFor(cell) {
  const bare = cell.replace(/\([^)]*\)/g, '').trim(), out = [];
  for (const part of bare.split(',').map((s) => s.trim())) {
    const m = /^(\d+)(?: to (\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (b < a) return null;
    for (let n = a; n <= b; n++) out.push(n);
  }
  return out;
}

// Every problem with the record's text as it bears on the table; and whether
// the orchestrator's cells are still pending, and the table's rows.
export function checkFilesTable(text, { findings = findingNumbers(text), reports = REPORTS } = {}) {
  const problems = [];
  const section = filesSection(text);
  if (section == null) return { problems: ['no section "#### The files that were read"'], pending: false, rows: [] };

  const status = [...section.matchAll(/^\*\*Status:\*\* the orchestrator's cells are (pending|filled)\.$/gm)];
  if (status.length !== 1) problems.push(`the section needs one status line "**Status:** the orchestrator's cells are pending." or "... are filled.", and has ${status.length}`);
  const pending = status[0]?.[1] === 'pending';

  // Nothing that looks like an address or a listing of bytes, anywhere in the section.
  const address = /0[xX][0-9a-fA-F]{4,}|\b[0-9a-fA-F]{5,}h\b/.exec(section);
  if (address) problems.push(`the section holds what looks like an address (${address[0]})`);
  const listing = /\b[0-9a-fA-F]{2}(?: [0-9a-fA-F]{2}){3,}\b/.exec(section);
  if (listing) problems.push(`the section holds what looks like a listing of bytes (${listing[0]})`);
  for (const m of section.matchAll(/[0-9a-fA-F]{9,}/g)) {
    if (m[0].length !== 64 && /[a-fA-F]/.test(m[0])) { problems.push(`the section holds a run of ${m[0].length} hex digits, which is no SHA-256`); break; }
  }

  const lines = section.split('\n'), at = lines.findIndex((l) => l.startsWith('| Id |'));
  const rows = [];
  if (at < 0) problems.push('the section has no table with the header "| Id | ..."');
  else {
    const header = cellsOf(lines[at]);
    if (header.join('|') !== COLUMNS.join('|')) problems.push(`the table's columns are not ${COLUMNS.join(', ')}`);
    if (!/^\|(\s*-+\s*\|)+$/.test((lines[at + 1] || '').trim())) problems.push('the table has no separator line under its header');
    for (let i = at + 2; i < lines.length && lines[i].startsWith('|'); i++) rows.push({ line: i, cells: cellsOf(lines[i]) });
    if (!rows.length) problems.push('the table has no rows');
  }

  const ids = [];
  rows.forEach((row, k) => {
    const c = row.cells, id = c[0] || `row ${k + 1}`;
    row.findings = new Set();
    if (c.length !== COLUMNS.length) { problems.push(`${id}: ${c.length} cells, not ${COLUMNS.length}`); return; }
    if (c[0] !== `F${k + 1}`) problems.push(`row ${k + 1}: its id is "${c[0]}", not F${k + 1} (ids run F1, F2 and on, in order, and never change)`);
    ids.push(c[0]);
    c.forEach((cell, j) => {
      const col = COLUMNS[j];
      if (EMPTY.has(cell)) problems.push(`${id}: the cell "${col}" is empty`);
      if (/\b[A-Za-z]:\\|(?:^|[\s`(])\/[^\s/`]+\//.test(cell)) problems.push(`${id}: the cell "${col}" holds a path of a PC (a drive letter and backslash, or a path from /)`);
      if (cell.length > CELL_MAX) problems.push(`${id}: the cell "${col}" is ${cell.length} characters, longer than a name, a date, a build line or a hash needs (${CELL_MAX})`);
      if (/\bpending\b/i.test(cell)) {
        if (!MAY_PEND.has(col)) problems.push(`${id}: the cell "${col}" says pending, and it is not one of the orchestrator's`);
        else if (!pending) problems.push(`${id}: the cell "${col}" says pending under a status line that says the cells are filled`);
      }
    });
    const hash = c[6].replace(/`/g, '');
    if (!(/^[0-9a-f]{64}$/.test(hash) || /^not kept\b\W*\w+(?:\W+\w+){2,}/.test(hash) || (pending && hash === 'pending'))) {
      problems.push(`${id}: the SHA-256 cell is neither 64 lowercase hex digits nor "not kept" with the reason in words${pending ? ' nor pending' : ''}`);
    }
    for (const [j, col] of [[4, 'Built'], [5, 'Taken']]) {
      const v = c[j];
      if (!/\bpending\b/.test(v) && !/^\d{4}-\d{2}-\d{2}\b/.test(v) && !/^none\b/.test(v)) problems.push(`${id}: the cell "${col}" is not a date (YYYY-MM-DD) or "none" with the reason`);
    }
    const nums = readFor(c[7]);
    if (!nums || !nums.length) problems.push(`${id}: "Read for" is not a list of finding numbers`);
    else for (const n of nums) if (!findings.has(n)) problems.push(`${id}: "Read for" names finding ${n}, which the record does not have`);
    row.findings = new Set(nums || []);
    for (const part of /^none\b/.test(c[8]) ? [] : c[8].split(',').map((s) => s.trim())) {
      if (part === 'BC plan') continue;
      if (!/^W\d-\d+[a-z0-9]*$/.test(part) || !reports.some((f) => f.startsWith(`${part}-`))) problems.push(`${id}: "Report" names ${part}, which is no report in docs/reports/`);
    }
  });

  // The lines a finding at the section's end, and the rows they name.
  const tail = lines.map((l) => l.trim()).filter(Boolean);
  const findingLines = [];
  for (let i = tail.length - 1; i >= 0 && /^- Finding /.test(tail[i]); i--) findingLines.unshift(tail[i]);
  if (!findingLines.length) problems.push('the section does not end with one line a finding ("- Finding N: F1, F2.")');
  const listed = new Map();
  let last = 0;
  for (const l of findingLines) {
    const m = /^- Finding (\d+): (F\d+(?:, F\d+)*)\.$/.exec(l);
    if (!m) { problems.push(`a finding's line is not "- Finding N: F1, F2.": ${l.slice(0, 40)}`); continue; }
    const n = Number(m[1]);
    if (n <= last) problems.push(`the finding lines are not one a finding in rising order (finding ${n} after ${last})`);
    last = Math.max(last, n);
    if (!findings.has(n)) problems.push(`the line of finding ${n} names a finding the record does not have`);
    const named = m[2].split(', ');
    for (const id of named) if (!ids.includes(id)) problems.push(`the line of finding ${n} names ${id}, which is no row`);
    listed.set(n, new Set(named));
  }
  for (const row of rows) {
    const id = row.cells[0];
    for (const n of row.findings) if (!listed.get(n)?.has(id)) problems.push(`${id} is read for finding ${n}, and the line of finding ${n} does not name it`);
  }
  for (const [n, named] of listed) {
    for (const id of named) {
      const row = rows.find((r) => r.cells[0] === id);
      if (row && !row.findings.has(n)) problems.push(`the line of finding ${n} names ${id}, whose "Read for" does not hold ${n}`);
    }
  }

  // The column of ids in "What was read".
  const what = whatWasReadTable(text);
  if (!what) problems.push('no table "What was read"');
  else if (what.header[what.header.length - 1] !== 'Files') problems.push('the table "What was read" has no last column "Files"');
  else {
    for (const r of what.rows) {
      const cell = r[r.length - 1];
      if (r.length !== what.header.length || !/^F\d+(?:, F\d+)*$/.test(cell)) problems.push(`a row of "What was read" has no list of ids in "Files" (${r[0].slice(0, 30)})`);
      else for (const id of cell.split(', ')) if (!ids.includes(id)) problems.push(`"What was read" names ${id}, which is no row of the table`);
    }
  }
  return { problems, pending, rows: rows.map((r) => r.cells) };
}

// ---------------------------------------------------------------------------
// [2] The manifest.

export const ROW_FIELDS = ['name', 'sets', 'kind', 'input', 'made_with', 'format', 'bytes', 'sha256', 'pcm_sha256', 'check', 'findings', 'used_by'];
const SETS = ['H', 'I', 'M', 'O'];
const KINDS = ['decoded voice', 'capture'];
const CODECS = ['vaudio_celt', 'vaudio_celt_high', 'vaudio_speex'];
const HEX64 = /^[0-9a-f]{64}$/;
// The check of tests/reproduce.mjs for each kind, and the options each takes:
// a flag alone, or an option with the values it may take.
const CHECK_OPTIONS = {
  celt: { flags: ['--high', '--any-rate', '--micdata'], values: {} },
  gain: { flags: [], values: { '--packet': /^\d+$/ } },
  speex: { flags: ['--micdata'], values: { '--maxgain': /^(1|10)$/ } },
  inputs: { flags: ['--against'], values: {} }
};
const NAME = /^set-([a-z])(?:-([a-z]))?_([a-z0-9]+(?:-[a-z0-9]+)*)_([a-z0-9]+(?:-[a-z0-9]+)*)\.wav$/;

// Whether a file name holds a date: a year (19xx or 20xx) standing alone, or
// a run of six or eight digits.
export function nameHasDate(name) {
  return (name.match(/\d+/g) || []).some((run) => (run.length === 4 && /^(19|20)/.test(run)) || run.length === 6 || run.length >= 8);
}

const isInt = (v) => Number.isInteger(v);
const isObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

// Every problem with a manifest (the parsed JSON). `root` is the repository
// the paths are read against; `clips` the SHA-256s of the clips the
// generator makes; `privates` the record's SHA-256s of private files.
export function checkManifest(manifest, { root = ROOT, clips, privates, findings }) {
  const problems = [];
  if (!isObject(manifest)) return ['the manifest is not a JSON object'];
  for (const key of Object.keys(manifest)) if (!['about', 'fields', 'rows'].includes(key)) problems.push(`the manifest has a key "${key}" beside about, fields and rows`);
  if (typeof manifest.about !== 'string' || !manifest.about) problems.push('the manifest has no "about"');
  if (!isObject(manifest.fields) || Object.keys(manifest.fields).join('|') !== ROW_FIELDS.join('|')) problems.push(`the manifest's "fields" does not name ${ROW_FIELDS.join(', ')}, in that order`);
  if (!Array.isArray(manifest.rows)) return [...problems, 'the manifest has no "rows" list'];
  const names = manifest.rows.map((r) => r?.name);
  manifest.rows.forEach((row, k) => {
    const id = typeof row?.name === 'string' ? row.name : `row ${k + 1}`, p = (s) => problems.push(`${id}: ${s}`);
    if (!isObject(row)) { p('is not an object'); return; }
    for (const f of ROW_FIELDS) if (!(f in row)) p(`the field "${f}" is missing`);
    for (const f of Object.keys(row)) if (!ROW_FIELDS.includes(f)) p(`the field "${f}" is not one of the manifest's`);

    // The name.
    const m = typeof row.name === 'string' ? NAME.exec(row.name) : null;
    if (!m) p('the name is not of the form set-<letter>_<what>_<settings>.wav, in lower case');
    if (typeof row.name === 'string' && nameHasDate(row.name)) p('the name holds a date');
    if (names.indexOf(row.name) !== k) p('another row has the same name');

    // The sets.
    const sets = Array.isArray(row.sets) ? row.sets : [];
    if (!Array.isArray(row.sets) || sets.length < 1 || sets.length > 2 || new Set(sets).size !== sets.length) p('"sets" is not a list of one or two sets');
    for (const s of sets) if (!SETS.includes(s)) p(`"sets" holds ${JSON.stringify(s)}: only Sets H, I, M and O can be published`);
    if (m && sets.length && [m[1], m[2]].filter(Boolean).join('') !== sets.map((s) => String(s).toLowerCase()).join('')) p('the sets in the name are not the row\'s "sets"');

    if (!KINDS.includes(row.kind)) p(`"kind" is not one of ${KINDS.join(', ')}`);

    // The input.
    const input = isObject(row.input) ? row.input : {};
    if (!isObject(row.input)) p('"input" is not an object');
    for (const f of Object.keys(input)) if (!['script', 'sha256'].includes(f)) p(`"input" has a field "${f}" beside script and sha256`);
    if (typeof input.script !== 'string' || path.isAbsolute(input.script) || input.script.split(/[\\/]/).includes('..')) p('"input.script" is not a path inside the repository');
    else {
      let isFile = false;
      try { isFile = fs.statSync(path.join(root, input.script)).isFile(); } catch { /* none */ }
      if (!isFile) p('"input.script" is not a file of the repository');
      else if (input.script !== MAKE_INPUTS) p(`"input.script" is not ${MAKE_INPUTS}, which makes the only clips that can be published`);
    }
    if (!HEX64.test(input.sha256 ?? '')) p('"input.sha256" is not 64 lowercase hex digits');
    else if (!clips.has(input.sha256)) p('"input.sha256" is not the SHA-256 of a clip the script makes');

    // What made it.
    const w = isObject(row.made_with) ? row.made_with : {};
    if (!isObject(row.made_with)) p('"made_with" is not an object');
    for (const f of ['game', 'bits', 'codec', 'voice_maxgain', 'other']) if (!(f in w)) p(`"made_with.${f}" is missing`);
    if (typeof w.game !== 'string' || !/^[A-Za-z0-9 ]{2,30}$/.test(w.game)) p('"made_with.game" is not the game\'s short name');
    if (![32, 64].includes(w.bits)) p('"made_with.bits" is not 32 or 64');
    if (!CODECS.includes(w.codec)) p(`"made_with.codec" is not one of ${CODECS.join(', ')}`);
    if (![1, 10].includes(w.voice_maxgain)) p('"made_with.voice_maxgain" is not 1 or 10');
    if (!isObject(w.other)) p('"made_with.other" is not an object of the other settings changed');

    // The format and the bytes.
    const f = isObject(row.format) ? row.format : {};
    if (!isObject(row.format)) p('"format" is not an object');
    if (![22050, 11025].includes(f.rate)) p('"format.rate" is not 22050 or 11025');
    if (f.channels !== 1) p('"format.channels" is not 1');
    if (f.bits !== 16) p('"format.bits" is not 16');
    if (!isInt(f.samples) || f.samples < 1) p('"format.samples" is not a whole number of samples');
    if (!isInt(row.bytes) || row.bytes !== 44 + 2 * f.samples) p('"bytes" is not 44 plus two a sample');

    // The hashes.
    for (const h of ['sha256', 'pcm_sha256']) {
      if (!HEX64.test(row[h] ?? '')) p(`"${h}" is not 64 lowercase hex digits`);
      else if (privates.has(row[h])) p(`"${h}" is the record's SHA-256 of a private file, which is never published`);
    }
    if (HEX64.test(row.sha256 ?? '') && manifest.rows.findIndex((r) => r?.sha256 === row.sha256) !== k) p('another row has the same file (a file is published once, and its row names both sets)');

    // The check.
    const c = isObject(row.check) ? row.check : {};
    if (!isObject(row.check)) p('"check" is not an object');
    for (const fld of ['name', 'options', 'files', 'lag', 'compared', 'equal', 'largest', 'apart']) if (!(fld in c)) p(`"check.${fld}" is missing`);
    const spec = CHECK_OPTIONS[c.name];
    if (!spec) p(`"check.name" is not one of ${Object.keys(CHECK_OPTIONS).join(', ')}`);
    else {
      if (row.kind === 'capture' && c.name !== 'inputs') p('a capture is checked by "inputs"');
      if (row.kind === 'decoded voice' && c.name === 'inputs') p('a decoded voice is checked by celt, gain or speex, not inputs');
      const opts = Array.isArray(c.options) ? c.options : null;
      if (!opts || opts.some((o) => typeof o !== 'string')) p('"check.options" is not a list of strings');
      else for (let i = 0; i < opts.length; i++) {
        if (spec.flags.includes(opts[i])) continue;
        if (spec.values[opts[i]]) { if (!spec.values[opts[i]].test(opts[i + 1] ?? '')) p(`"check.options": ${opts[i]} needs a value it takes`); i++; continue; }
        p(`"check.options" holds ${JSON.stringify(opts[i]).slice(0, 20)}, which ${c.name} does not take`);
      }
      if (c.name === 'inputs' && !(opts || []).includes('--against')) p('"check.options" of inputs is --against');
    }
    const files = Array.isArray(c.files) ? c.files : null;
    if (!files || !files.length) p('"check.files" is not a list');
    else {
      if (!files.includes('this')) p('"check.files" does not name this row\'s file ("this")');
      for (const fl of files) if (fl !== 'this' && fl !== 'input' && (!names.includes(fl) || fl === row.name)) p(`"check.files" names ${JSON.stringify(fl).slice(0, 40)}, which is not "this", "input" or another row`);
    }
    if (!isInt(c.lag) || c.lag < 0) p('"check.lag" is not a whole number of samples');
    if (!isInt(c.compared) || c.compared < 1) p('"check.compared" is not a number of samples');
    if (!isInt(c.equal) || c.equal < 0 || c.equal > c.compared) p('"check.equal" is not a number of samples within "compared"');
    else if (isInt(c.compared) && c.equal * 1000 < c.compared * 999) p('"check.equal" is under 999 samples in 1,000 of "compared": the file stays out');
    if (!isInt(c.largest) || c.largest < 0) p('"check.largest" is not a number of 16-bit steps');
    else if (c.largest > 1) p('"check.largest" is more than one step: the file stays out');
    if (c.largest === 0 && isInt(c.equal) && c.equal !== c.compared) p('"check.largest" is 0 and not every compared sample is equal');
    if (typeof c.apart !== 'string' || !c.apart) p('"check.apart" does not say what the check left out');
    if (isInt(c.compared) && isInt(f.samples) && c.compared > f.samples + 2) p('"check.compared" is more than the file holds');

    // The findings and the files that read it.
    if (!Array.isArray(row.findings) || !row.findings.length || row.findings.some((n) => !findings.has(n))) p('"findings" is not a list of the record\'s findings');
    if (!Array.isArray(row.used_by)) p('"used_by" is not a list');
    else for (const u of row.used_by) {
      let isFile = false;
      try { isFile = typeof u === 'string' && !path.isAbsolute(u) && fs.statSync(path.join(root, u)).isFile(); } catch { /* none */ }
      if (!isFile) p(`"used_by" names ${JSON.stringify(u).slice(0, 40)}, which is not a file of the repository`);
    }
  });
  return problems;
}

// ---------------------------------------------------------------------------
// [3] The folder.

// Every problem with the folder against the manifest's rows. A folder that is
// not there is empty (git keeps no empty folder).
export function checkFolder(dir, rows) {
  const problems = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT') return [`the folder cannot be read (${error.code})`]; }
  const byName = new Map((Array.isArray(rows) ? rows : []).filter((r) => r && typeof r.name === 'string').map((r) => [r.name, r]));
  const named = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r.name === 'string').map((r) => r.name);
  for (const name of new Set(named.filter((n, i) => named.indexOf(n) !== i))) problems.push(`${name}: two rows name this file`);
  for (const e of entries) {
    if (!e.isFile()) { problems.push(`${e.name}: is not a plain file (a folder or a link); the folder holds only the published files`); continue; }
    const row = byName.get(e.name);
    if (!row) { problems.push(`${e.name}: a file in the folder with no row in the manifest`); continue; }
    const r = inspectWav(fs.readFileSync(path.join(dir, e.name)));
    if (!r.wav) { problems.push(`${e.name}: is not a WAV file`); continue; }
    if (!r.plain) problems.push(`${e.name}: is not exactly a 44-byte header and its samples (${r.metadata.length ? `metadata: ${r.metadata.join(', ')}` : r.problems[0] || `chunks ${r.chunks.map((c) => c.id).join(', ')}`})`);
    if (r.sha256 !== row.sha256) problems.push(`${e.name}: its SHA-256 is not its row's`);
    if (r.pcmSha256 !== row.pcm_sha256) problems.push(`${e.name}: the SHA-256 of its data chunk is not its row's pcm_sha256`);
    if (r.bytes !== row.bytes) problems.push(`${e.name}: it holds ${r.bytes} bytes, its row says ${row.bytes}`);
    const f = row.format || {};
    if (!r.format || r.format.tag !== 1 || r.format.rate !== f.rate || r.format.channels !== f.channels || r.format.bits !== f.bits || r.samples !== f.samples) {
      problems.push(`${e.name}: its format is not its row's (${r.format ? `${r.format.rate} Hz, ${r.format.channels} channel, ${r.format.bits} bits, ${r.samples} samples` : 'no format chunk'})`);
    }
  }
  const present = new Set(entries.map((e) => e.name));
  for (const name of byName.keys()) if (!present.has(name)) problems.push(`${name}: a row with no file in the folder`);
  return problems;
}

// Whether git ignores the folder or a file in it: null where git cannot say
// (no git, or not a repository), else the paths it ignores. `config` adds
// `-c key=value` pairs (the suite's break gives an excludes file).
export function ignoredPaths(root, probes, config = []) {
  const args = [...config.flatMap((c) => ['-c', c]), 'check-ignore', '--no-index', '--', ...probes];
  const run = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (run.error || (run.status !== 0 && run.status !== 1)) return null;
  return run.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

// What to make of git's answer: 'check' when it answered, else 'fail' on CI
// (where git is always there, so no answer is a fault) and 'skip' elsewhere
// (a copy of the repository with no git).
export function ignoreVerdict(ignored, env) {
  if (ignored != null) return 'check';
  return env.CI ? 'fail' : 'skip';
}

// ---------------------------------------------------------------------------
// WAV files for the stand-ins: a plain 44-byte header and a tone, or with
// chunks put in before or after.

function wavBytes(rate, samples, { before = [], after = [], fmtSize = 16, riffDelta = 0, trailing = 0 } = {}) {
  const data = Buffer.alloc(2 * samples.length);
  samples.forEach((s, i) => data.writeInt16LE(s, 2 * i));
  const chunk = (id, body) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, 'latin1');
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, body, Buffer.alloc(body.length & 1)]);
  };
  const fmtBody = Buffer.alloc(fmtSize);
  fmtBody.writeUInt16LE(1, 0); fmtBody.writeUInt16LE(1, 2); fmtBody.writeUInt32LE(rate, 4);
  fmtBody.writeUInt32LE(rate * 2, 8); fmtBody.writeUInt16LE(2, 12); fmtBody.writeUInt16LE(16, 14);
  const body = Buffer.concat([Buffer.from('WAVE', 'latin1'), chunk('fmt ', fmtBody), ...before.map(([id, b]) => chunk(id, b)), chunk('data', data), ...after.map(([id, b]) => chunk(id, b)), Buffer.alloc(trailing)]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length - trailing + riffDelta, 4);
  return Buffer.concat([head, body]);
}
const tone = (n, hz, rate, amp = 3000) => Array.from({ length: n }, (_, i) => Math.round(amp * Math.sin((2 * Math.PI * hz * i) / rate)));
const infoList = (text) => Buffer.concat([Buffer.from('INFO', 'latin1'), Buffer.from('INAM', 'latin1'), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(text.length + 1, 0); return b; })(), Buffer.from(`${text}\0`, 'latin1'), Buffer.alloc((text.length + 1) & 1)]);

// ---------------------------------------------------------------------------

const findings = findingNumbers(referenceText);
const { hashes: privates, sets: privateSets } = privateHashes(referenceText);
const clipBytes = new Map(RATES.map((rate) => [rate, clipWav(rate)]));
const clips = new Set([...clipBytes.values()].map(sha256));

console.log('[0] What the suite takes from the record and the generator');
{
  const rec = recordClips(referenceText);
  const mismatch = RATES.filter((rate) => rec.get(rate) !== sha256(clipBytes.get(rate)));
  check('the two clips tests/recordings/make-inputs.mjs makes have the SHA-256 the record gives ("The file-input runs")', rec.size === 2 && mismatch.length === 0,
    mismatch.length ? `differs at ${mismatch.join(', ')} Hz` : RATES.map((r) => `${r} Hz ${rec.get(r).slice(0, 12)}…`).join(', '));
  const speechTake = recordHashOf(referenceText, 'take4_my_own_speech'), speechSource = recordHashOf(referenceText, 'my_own_speech_raw_from_audacity.wav');
  check('the record\'s SHA-256s of private files are read from each Set entry of Provenance but H, I, M and O, the speech take and its source among them',
    privateSets.length > 0 && privates.size >= 10 && privates.has(speechTake) && privates.has(speechSource) && ![...clips].some((h) => privates.has(h)),
    `${privates.size} hashes from Sets ${privateSets.join(', ')}; none of them a clip's`);
  const none = privateHashes(referenceText.replace(/^### Set /gm, '### Lot '));
  check('a record with no Set entry gives no hash, so the check above fails on it', none.sets.length === 0 && none.hashes.size === 0);
  check('the record\'s findings are read', findings.size >= 30 && findings.has(1) && findings.has(32), `${findings.size} findings`);
}

// ---------------------------------------------------------------------------
console.log('\n[1] The table "The files that were read" (tests/REFERENCE_2026.md)');
const table = checkFilesTable(referenceText);
check('the record\'s table: its status line, columns, ids, cells, hashes, findings and the lines a finding', table.problems.length === 0,
  table.problems.length ? short(table.problems, 6) : `${table.rows.length} rows, F1 to F${table.rows.length}`);
check('the table is not empty and starts at F1', table.rows.length > 0 && table.rows[0][0] === 'F1');
if (table.pending) {
  const left = table.rows.reduce((n, r) => n + r.filter((c) => /\bpending\b/.test(c)).length, 0);
  skip('no cell of the table is left pending', `the section's status line says the orchestrator's cells are pending (${left} cells; order RP-01, part e fills them)`);
} else check('no cell of the table is left pending (the status line says filled)', !table.rows.some((r) => r.some((c) => /\bpending\b/.test(c))));

{
  const section = filesSection(referenceText);
  const swap = (from, to) => {
    if (!referenceText.includes(from)) throw new Error(`the stand-in cannot be made: "${from.slice(0, 40)}" is not in the record`);
    return referenceText.replace(from, to);
  };
  const f1 = table.rows[0], f2 = table.rows[1];
  const rowOf = (cells) => `| ${cells.join(' | ')} |`;
  check('the stand-ins below are made from the record\'s own rows', section.includes(rowOf(f1)) && section.includes(rowOf(f2)));
  const withCell = (cells, j, value) => rowOf(cells.map((c, i) => (i === j ? value : c)));

  const hash63 = withCell(f1, 6, `\`${f1[6].replace(/`/g, '').slice(1)}\``);
  breaks('a SHA-256 of 63 digits fails', checkFilesTable(swap(rowOf(f1), hash63)).problems, /^F1: the SHA-256 cell is neither 64/);
  breaks('a SHA-256 in capitals fails', checkFilesTable(swap(rowOf(f1), withCell(f1, 6, f1[6].toUpperCase()))).problems, /^F1: the SHA-256 cell/);
  breaks('"not kept" with no reason fails', checkFilesTable(swap(rowOf(f1), withCell(f1, 6, 'not kept'))).problems, /^F1: the SHA-256 cell/);
  check('"not kept" with the reason in words passes', checkFilesTable(swap(rowOf(f1), withCell(f1, 6, 'not kept: the copy was not saved'))).problems.length === 0);
  breaks('an empty cell fails', checkFilesTable(swap(rowOf(f2), withCell(f2, 4, ''))).problems, /^F2: the cell "Built" is empty/);
  breaks('a cell holding 0x180058d80 fails', checkFilesTable(swap(rowOf(f1), withCell(f1, 2, 'the owner\'s TF2, 64-bit, at 0x180058d80'))).problems, /looks like an address \(0x180058d80\)/);
  breaks('an address in the section\'s words fails', checkFilesTable(swap('Not rows: Valve', 'Read at 0x1234abcd. Not rows: Valve')).problems, /looks like an address/);
  breaks('a listing of bytes fails', checkFilesTable(swap('Not rows: Valve', 'Bytes 48 8b 05 c3. Not rows: Valve')).problems, /listing of bytes/);
  breaks('a run of hex that is no SHA-256 fails', checkFilesTable(swap('Not rows: Valve', 'Code deadbeefcafe. Not rows: Valve')).problems, /run of 12 hex digits/);
  breaks('pending left under a status line that says "filled" fails', checkFilesTable(swap('the orchestrator\'s cells are pending.', 'the orchestrator\'s cells are filled.')).problems, /says pending under a status line that says the cells are filled/);
  breaks('no status line fails', checkFilesTable(swap('**Status:** the orchestrator\'s cells are pending.', '')).problems, /one status line/);
  breaks('pending in "Report" fails', checkFilesTable(swap(rowOf(f2), withCell(f2, 8, 'pending'))).problems, /^F2: the cell "Report" says pending/);
  breaks('a cell longer than a name, a date, a build line or a hash needs fails', checkFilesTable(swap(rowOf(f2), withCell(f2, 2, 'x'.repeat(CELL_MAX + 1)))).problems, /longer than a name/);
  breaks('a date that is not a date fails', checkFilesTable(swap(rowOf(f2), withCell(f2, 4, 'September'))).problems, /^F2: the cell "Built" is not a date/);
  breaks('an id out of order fails', checkFilesTable(swap(rowOf(f2), withCell(f2, 0, 'F3'))).problems, /^row 2: its id is "F3"/);
  breaks('a row with a cell too many fails', checkFilesTable(swap(rowOf(f2), rowOf([...f2, 'more']))).problems, /^F2: 10 cells/);
  breaks('an address of four hex digits (0x58d8) fails', checkFilesTable(swap(rowOf(f1), withCell(f1, 2, 'the owner\'s TF2, at 0x58d8'))).problems, /looks like an address \(0x58d8\)/);
  breaks('an address in capitals (0X180058D80) fails', checkFilesTable(swap(rowOf(f1), withCell(f1, 2, 'the owner\'s TF2, at 0X180058D80'))).problems, /looks like an address \(0X180058D80\)/);
  breaks('an address written with an h (1000a2f0h) fails', checkFilesTable(swap(rowOf(f1), withCell(f1, 2, 'the owner\'s TF2, at 1000a2f0h'))).problems, /looks like an address \(1000a2f0h\)/);
  breaks('a Windows path in a cell fails', checkFilesTable(swap(rowOf(f1), withCell(f1, 1, 'C:\\Games\\tf\\engine.dll'))).problems, /^F1: the cell "File" holds a path/);
  breaks('a Unix path in a cell fails', checkFilesTable(swap(rowOf(f1), withCell(f1, 1, '/home/someone/engine.dll'))).problems, /^F1: the cell "File" holds a path/);
  breaks('a row with a cell too few fails', checkFilesTable(swap(rowOf(f2), rowOf(f2.slice(0, -1)))).problems, /^F2: 8 cells/);
  breaks('a column renamed fails', checkFilesTable(swap('| Id | File | From |', '| Id | Name | From |')).problems, /columns are not/);
  breaks('a finding the record does not have in "Read for" fails', checkFilesTable(swap(rowOf(f2), withCell(f2, 7, '31, 99'))).problems, /names finding 99/);
  breaks('a report that is not in docs/reports/ fails', checkFilesTable(swap(rowOf(f2), withCell(f2, 8, 'W3-03, W9-99'))).problems, /names W9-99, which is no report/);
  breaks('a row read for a finding whose line does not name it fails', checkFilesTable(swap(rowOf(f2), withCell(f2, 7, '30, 31'))).problems, /F2 is read for finding 30, and the line of finding 30 does not name it/);
  breaks('a finding\'s line naming a row not read for it fails', checkFilesTable(swap('- Finding 2: F1.', '- Finding 2: F1, F2.')).problems, /the line of finding 2 names F2, whose "Read for" does not hold 2/);
  breaks('a finding\'s line naming no row fails', checkFilesTable(swap('- Finding 2: F1.', '- Finding 2: F1, F99.')).problems, /names F99, which is no row/);
  breaks('the lines a finding out of order fail', checkFilesTable(swap('- Finding 2: F1.\n- Finding 4: F1.', '- Finding 4: F1.\n- Finding 2: F1.')).problems, /rising order/);
  breaks('a section that does not end with its finding lines fails', checkFilesTable(swap('- Finding 32: F1, F19, F20, F21, F22, F23.', '- Finding 32: F1, F19, F20, F21, F22, F23.\n\nA last word.')).problems, /does not end with one line a finding/);
  breaks('"What was read" naming an id that is no row fails', checkFilesTable(swap('| W3-07 | F1 |', '| W3-07 | F1, F77 |')).problems, /"What was read" names F77/);
  breaks('"What was read" without its column of ids fails', checkFilesTable(swap('| What | Read from | Report | Files |', '| What | Read from | Report | Ids |')).problems, /no last column "Files"/);

  // A table whose cells are all filled passes under "filled": the check does
  // not fail on every table so marked.
  const filled = [
    '#### The files that were read', '', '**Status:** the orchestrator\'s cells are filled.', '',
    `| ${COLUMNS.join(' | ')} |`, `| ${COLUMNS.map(() => '---').join(' | ')} |`,
    `| F1 | \`bin/x64/engine.dll\` | the owner's TF2, 64-bit | Exe build 11191711 | 2026-10-05 | 2026-11-10 | \`${'a'.repeat(64)}\` | 2, 4 | W3-03 |`,
    '| F2 | `scripts/soundmixers.txt` | the owner\'s TF2, the game\'s own archive | the game\'s version line | none: a text file | 2026-11-10 | not kept: the copy was replaced before a hash was taken | 30 | W3-15 |',
    '', '- Finding 2: F1.', '- Finding 4: F1.', '- Finding 30: F2.', ''
  ].join('\n');
  const standIn = `### What was read\n\n| What | Read from | Report | Files |\n| --- | --- | --- | --- |\n| a | b | W3-03 | F1, F2 |\n\n${filled}\n## Findings\n\n### 2. a\n### 4. b\n### 30. c\n\n## Model\n`;
  const t = checkFilesTable(standIn);
  check('a stand-in table with every cell filled passes under "filled"', t.problems.length === 0 && !t.pending, short(t.problems));
  breaks('the same with one cell pending fails', checkFilesTable(standIn.replace('2026-11-10 | not kept', 'pending | not kept')).problems, /^F2: the cell "Taken" says pending under a status line that says the cells are filled/);
}

// ---------------------------------------------------------------------------
console.log('\n[2] The manifest (tests/recordings/manifest.json)');
let manifest = null;
try { manifest = JSON.parse(read(MANIFEST)); } catch (error) { check('the manifest is JSON', false, error.message); }
const realProblems = manifest ? checkManifest(manifest, { clips, privates, findings }) : ['no manifest'];
check('the manifest\'s frame and every row', realProblems.length === 0, realProblems.length ? short(realProblems, 6) : `${manifest.rows.length} rows`);

// The stand-in: three example rows, shaped by the private run's counts and the
// recordings' lengths (the record, "The script run on the game's files" and
// order RP-01, section 14), with synthetic tones of those lengths as files.
const standIns = path.join(tmp, 'files');
fs.mkdirSync(standIns);
const exampleFiles = [];
function exampleRows() {
  const h22 = sha256(clipBytes.get(22050)), h11 = sha256(clipBytes.get(11025));
  const rows = [
    { name: 'set-h_vaudio-celt_maxgain-1.wav', sets: ['H'], kind: 'decoded voice', input: { script: MAKE_INPUTS, sha256: h22 },
      made_with: { game: 'TF2', bits: 64, codec: 'vaudio_celt', voice_maxgain: 1, other: {} }, format: { rate: 22050, channels: 1, bits: 16, samples: 292352 },
      check: { name: 'celt', options: [], files: ['this'], lag: 2, compared: 291840, equal: 291839, largest: 1, apart: 'the last packet, 512 samples' },
      findings: [26, 31], used_by: ['tests/reproduce.verify.mjs'] },
    { name: 'set-h_vaudio-celt_maxgain-10.wav', sets: ['H'], kind: 'decoded voice', input: { script: MAKE_INPUTS, sha256: h22 },
      made_with: { game: 'TF2', bits: 64, codec: 'vaudio_celt', voice_maxgain: 10, other: {} }, format: { rate: 22050, channels: 1, bits: 16, samples: 292352 },
      check: { name: 'gain', options: [], files: ['set-h_vaudio-celt_maxgain-1.wav', 'this'], lag: 0, compared: 291840, equal: 291840, largest: 0, apart: 'the last packet, 512 samples' },
      findings: [26], used_by: ['tests/reproduce.verify.mjs'] },
    { name: 'set-m-o_vaudio-speex_voice-micdata.wav', sets: ['M', 'O'], kind: 'capture', input: { script: MAKE_INPUTS, sha256: h11 },
      made_with: { game: 'TF2', bits: 32, codec: 'vaudio_speex', voice_maxgain: 1, other: { sv_voicecodec: 'vaudio_speex' } }, format: { rate: 11025, channels: 1, bits: 16, samples: 145966 },
      check: { name: 'inputs', options: ['--against'], files: ['this'], lag: 2, compared: 145964, equal: 145964, largest: 0, apart: 'the two zeros after the clip' },
      findings: [31], used_by: ['tests/reproduce.verify.mjs'] }
  ];
  rows.forEach((row, k) => {
    const bytes = exampleFiles[k] ??= wavBytes(row.format.rate, tone(row.format.samples, 440 + 110 * k, row.format.rate));
    row.bytes = bytes.length;
    row.sha256 = sha256(bytes);
    row.pcm_sha256 = sha256(bytes.subarray(44));
    row.file = bytes;
  });
  return rows;
}
const ordered = (row) => Object.fromEntries(ROW_FIELDS.map((f) => [f, row[f]]));
function standIn(edit = () => {}, { privates: known = privates } = {}) {
  const rows = exampleRows();
  const m = { about: manifest?.about || 'stand-in', fields: { ...(manifest?.fields || Object.fromEntries(ROW_FIELDS.map((f) => [f, f]))) }, rows: rows.map(ordered) };
  const files = new Map(rows.map((r) => [r.name, r.file]));
  edit(m, files);
  fs.rmSync(standIns, { recursive: true, force: true });
  fs.mkdirSync(standIns);
  for (const [name, bytes] of files) fs.writeFileSync(path.join(standIns, name), bytes);
  return { manifest: m, problems: [...checkManifest(m, { clips, privates: known, findings }), ...checkFolder(standIns, m.rows)] };
}
{
  const base = standIn();
  check('the stand-in manifest of three example rows and its folder pass', base.problems.length === 0, short(base.problems));
  const speechTake = recordHashOf(referenceText, 'take4_my_own_speech'), speechSource = recordHashOf(referenceText, 'my_own_speech_raw_from_audacity.wav');
  const row = (m) => m.rows[0];
  breaks('a missing field fails', standIn((m) => { delete row(m).pcm_sha256; }).problems, /: the field "pcm_sha256" is missing/);
  breaks('a field that is not the manifest\'s fails', standIn((m) => { row(m).private_sha256 = speechTake; }).problems, /the field "private_sha256" is not one of the manifest's/);
  breaks('a name with a date in it fails (2026-11-10)', standIn((m, files) => { files.set('set-h_vaudio-celt_2026-11-10.wav', files.get(row(m).name)); files.delete(row(m).name); row(m).name = 'set-h_vaudio-celt_2026-11-10.wav'; }).problems, /the name holds a date/);
  breaks('a name with a date in it fails (20261110)', standIn((m) => { row(m).name = 'set-h_vaudio-celt_maxgain-1-20261110.wav'; }).problems, /the name holds a date/);
  breaks('a name not of the form fails', standIn((m) => { row(m).name = 'Set H celt.wav'; }).problems, /the name is not of the form/);
  breaks('a name whose sets are not the row\'s fails', standIn((m) => { row(m).name = 'set-i_vaudio-celt_maxgain-1.wav'; }).problems, /the sets in the name are not/);
  breaks('an input.script that is not a file fails', standIn((m) => { row(m).input.script = 'tests/recordings/make-inputs.js'; }).problems, /"input\.script" is not a file of the repository/);
  breaks('an input.script outside the repository fails', standIn((m) => { row(m).input.script = '../make-inputs.mjs'; }).problems, /"input\.script" is not a path inside/);
  breaks('an input.script that is another file fails', standIn((m) => { row(m).input.script = 'tests/reproduce.mjs'; }).problems, /"input\.script" is not tests\/recordings\/make-inputs\.mjs/);
  breaks('an input.sha256 that is no clip\'s fails', standIn((m) => { row(m).input.sha256 = 'b'.repeat(64); }).problems, /"input\.sha256" is not the SHA-256 of a clip/);
  breaks('a sha256 that is the record\'s for the speech take fails', standIn((m) => { row(m).sha256 = speechTake; }).problems, /"sha256" is the record's SHA-256 of a private file/);
  breaks('a pcm_sha256 that is the record\'s for the speech source fails', standIn((m) => { row(m).pcm_sha256 = speechSource; }).problems, /"pcm_sha256" is the record's SHA-256 of a private file/);
  breaks('a hash of 63 digits fails', standIn((m) => { row(m).sha256 = row(m).sha256.slice(1); }).problems, /"sha256" is not 64 lowercase hex digits/);
  breaks('a kind that is neither fails', standIn((m) => { row(m).kind = 'device recording'; }).problems, /"kind" is not one of/);
  breaks('a codec that is not an engine codec fails', standIn((m) => { row(m).made_with.codec = 'steam'; }).problems, /"made_with\.codec" is not one of/);
  breaks('fewer than 999 samples in 1,000 equal fails', standIn((m) => { row(m).check.equal = 291547; }).problems, /under 999 samples in 1,000/);
  breaks('a sample two steps off fails', standIn((m) => { row(m).check.largest = 2; }).problems, /more than one step/);
  breaks('a check that is not one of the script\'s fails', standIn((m) => { row(m).check.name = 'hold'; }).problems, /"check\.name" is not one of/);
  breaks('an option the check does not take fails', standIn((m) => { row(m).check.options = ['--maxgain', '10']; }).problems, /"check\.options" holds "--maxgain"/);
  breaks('a check naming a file that is no row fails', standIn((m) => { m.rows[1].check.files = ['set-h_vaudio-celt_maxgain-3.wav', 'this']; }).problems, /"check\.files" names "set-h_vaudio-celt_maxgain-3\.wav"/);
  breaks('a capture not checked by inputs fails', standIn((m) => { m.rows[2].check.name = 'speex'; m.rows[2].check.options = []; }).problems, /a capture is checked by "inputs"/);
  breaks('bytes that are not 44 plus two a sample fail', standIn((m) => { row(m).bytes += 2; }).problems, /"bytes" is not 44 plus two a sample/);
  breaks('a finding the record does not have fails', standIn((m) => { row(m).findings = [99]; }).problems, /"findings" is not a list of the record's findings/);
  breaks('a used_by that is not a file fails', standIn((m) => { row(m).used_by = ['tests/nosuch.mjs']; }).problems, /"used_by" names "tests\/nosuch\.mjs"/);
  breaks('two rows of one file fail', standIn((m) => { m.rows[1].sha256 = row(m).sha256; }).problems, /another row has the same file/);
  breaks('two rows of one name, the first with a wrong sha256, fail', standIn((m) => { m.rows[1].name = row(m).name; m.rows[1].check.files = ['this']; row(m).sha256 = 'c'.repeat(64); }).problems, /another row has the same name/);
  breaks('the folder check alone fails two rows of one name', (() => { const r = standIn(); const rows = r.manifest.rows.map((x) => ({ ...x })); rows[1].name = rows[0].name; return checkFolder(standIns, rows); })(), /: two rows name this file/);
  breaks('sets holding one letter twice fail', standIn((m) => { row(m).sets = ['H', 'H']; }).problems, /"sets" is not a list of one or two sets/);
  {
    // The record's hashes by entry: a published file's hash written into Set
    // H's entry is no private file's; the same in a new Set entry is.
    const hash = exampleRows()[0].sha256;
    const inH = referenceText.replace('\n### Set I: ', `\nPublished: \`${hash}\`.\n\n### Set I: `);
    check('a row\'s hash written into Set H\'s entry of the record passes', inH !== referenceText &&
      standIn(() => {}, { privates: privateHashes(inH).hashes }).problems.length === 0);
    const inP = referenceText.replace('\n### The script run on the game\'s files', `\n### Set P: a later set\n\n| File | SHA-256 |\n| --- | --- |\n| a take | \`${hash}\` |\n\n### The script run on the game\'s files`);
    breaks('the same hash in a new Set entry after "The file-input runs" fails', standIn(() => {}, { privates: privateHashes(inP).hashes }).problems, /"sha256" is the record's SHA-256 of a private file/);
  }
  breaks('a manifest whose fields are not the rows\' fails', standIn((m) => { delete m.fields.used_by; }).problems, /"fields" does not name/);
  check('the record holds the speech take\'s SHA-256, so its break above uses the record\'s own hash', HEX64.test(speechTake || '') && HEX64.test(speechSource || ''));
}

// ---------------------------------------------------------------------------
console.log('\n[3] The folder (tests/recordings/files/)');
{
  const real = checkFolder(path.join(ROOT, FOLDER), manifest?.rows || []);
  check('every file in the folder has a row and every row a file, each file its row\'s', real.length === 0, short(real, 6));
  let count = 0;
  try { count = fs.readdirSync(path.join(ROOT, FOLDER)).length; } catch { /* not there: empty */ }
  if (manifest && manifest.rows.length === 0 && count === 0) info('no recording is published yet: the manifest has no rows and tests/recordings/files/ holds no file');
  else info(`${manifest?.rows.length ?? 0} rows, ${count} files`);

  const probes = [`${FOLDER}/`, `${FOLDER}/set-h_vaudio-celt_maxgain-1.wav`, ...(manifest?.rows || []).map((r) => `${FOLDER}/${r.name}`)];
  const ignored = ignoredPaths(ROOT, probes);
  const verdict = ignoreVerdict(ignored, process.env);
  if (verdict === 'fail') check('nothing ignores tests/recordings/files/: git must answer on CI', false, 'git could not say (no git, or not a repository)');
  else if (verdict === 'skip') skip('nothing ignores tests/recordings/files/', 'git cannot say here (no git, or not a repository)');
  else {
    check('nothing ignores tests/recordings/files/ or a file in it (git check-ignore)', ignored.length === 0, ignored.length ? `ignored: ${ignored.join(', ')}` : `${probes.length} paths`);
    const excludes = path.join(tmp, 'excludes');
    for (const pattern of ['tests/recordings/files/', '*.wav']) {
      fs.writeFileSync(excludes, `${pattern}\n`);
      const hit = ignoredPaths(ROOT, probes, [`core.excludesFile=${excludes}`]);
      check(`an ignore line "${pattern}" is caught`, Array.isArray(hit) && hit.length > 0, hit ? hit.join(', ') : 'git could not say');
    }
  }

  check('where git cannot say, the check fails on CI and is skipped elsewhere', ignoreVerdict(null, { CI: 'true' }) === 'fail' &&
    ignoreVerdict(null, {}) === 'skip' && ignoreVerdict([], { CI: 'true' }) === 'check');
  const outside = ignoredPaths(tmp, ['x.wav']);
  check('git\'s "cannot say" is read as no answer (a folder outside any repository)', outside === null, outside === null ? 'no answer, as on a copy with no git' : `answered ${JSON.stringify(outside)}`);
  const name0 = 'set-h_vaudio-celt_maxgain-1.wav';
  breaks('a file in the folder with no row fails', standIn((m, files) => { files.set('set-o_vaudio-speex_maxgain-1.wav', wavBytes(11025, tone(500, 300, 11025))); }).problems, /set-o_vaudio-speex_maxgain-1\.wav: a file in the folder with no row/);
  breaks('a placeholder file with no row fails', standIn((m, files) => { files.set('.gitkeep', Buffer.alloc(0)); }).problems, /\.gitkeep: a file in the folder with no row/);
  breaks('a row with no file fails', standIn((m, files) => { files.delete(name0); }).problems, new RegExp(`${name0.replace(/\./g, '\\.')}: a row with no file`));
  breaks('a file whose SHA-256 is not its row\'s fails', standIn((m, files) => { const b = Buffer.from(files.get(name0)); b[100] ^= 1; files.set(name0, b); }).problems, /: its SHA-256 is not its row's/);
  breaks('a file whose data chunk is not its row\'s pcm_sha256 fails', standIn((m, files) => { const b = Buffer.from(files.get(name0)); b[1000] ^= 1; files.set(name0, b); }).problems, /: the SHA-256 of its data chunk is not its row's/);
  breaks('a row whose sets holds J fails', standIn((m) => { m.rows[0].sets = ['J']; }).problems, /"sets" holds "J": only Sets H, I, M and O/);
  breaks('a row whose sets holds K fails', standIn((m) => { m.rows[2].sets = ['M', 'K']; }).problems, /"sets" holds "K"/);
  breaks('a file with a LIST chunk, its row made to match, fails', standIn((m, files) => {
    const b = wavBytes(22050, tone(292352, 440, 22050), { before: [['LIST', infoList('a title')]] });
    files.set(name0, b); Object.assign(m.rows[0], { sha256: sha256(b), pcm_sha256: inspectWav(b).pcmSha256, bytes: b.length });
  }).problems, /is not exactly a 44-byte header and its samples \(metadata: LIST \(INFO\)\)/);
  breaks('a file in another format than its row\'s fails', standIn((m, files) => {
    const b = wavBytes(11025, tone(292352, 440, 11025)); files.set(name0, b); Object.assign(m.rows[0], { sha256: sha256(b), pcm_sha256: sha256(b.subarray(44)) });
  }).problems, /its format is not its row's/);
  breaks('a folder in the folder fails', (() => { const r = standIn(); fs.mkdirSync(path.join(standIns, 'more')); return checkFolder(standIns, r.manifest.rows); })(), /more: is not a plain file/);
}

// ---------------------------------------------------------------------------
console.log('\n[4] tests/recordings/inspect.mjs');
{
  const rate = 22050, samples = tone(1000, 440, rate);
  const clean = wavBytes(rate, samples);
  const r = inspectWav(clean);
  check('a clean file: exactly a 44-byte header and its samples', r.wav && r.plain && r.chunks.map((c) => `${c.id}:${c.size}`).join(',') === 'fmt :16,data:2000' && r.metadata.length === 0);
  check('a clean file: its SHA-256, the SHA-256 of its data chunk and its format', r.sha256 === sha256(clean) && r.pcmSha256 === sha256(clean.subarray(44)) &&
    r.format.rate === rate && r.format.channels === 1 && r.format.bits === 16 && r.samples === 1000);
  check('the generated 11025 Hz clip is a plain file to inspect.mjs too', inspectWav(clipBytes.get(11025)).plain && inspectWav(clipBytes.get(11025)).samples === 145966);

  const tagged = wavBytes(rate, samples, { before: [['LIST', infoList('a title')], ['bext', Buffer.alloc(602)]] });
  const t = inspectWav(tagged);
  check('a file with a LIST and a bext chunk: both named, and it is not plain', t.wav && !t.plain && t.metadata.join(', ') === 'LIST (INFO), bext' &&
    t.chunks.map((c) => c.id).join(',') === 'fmt ,LIST,bext,data', `${t.metadata.join(', ')}; ${t.chunks.map((c) => `${c.id} ${c.size}`).join(', ')}`);
  check('the data chunk\'s SHA-256 is the samples\' whatever the header holds', t.pcmSha256 === r.pcmSha256 && t.sha256 !== r.sha256);
  const more = inspectWav(wavBytes(rate, samples, { after: [['iXML', Buffer.from('<x/>')], ['cart', Buffer.alloc(16)], ['id3 ', Buffer.alloc(10)]] }));
  check('iXML, cart and id3 chunks after the samples: each named, not plain', !more.plain && more.metadata.join(', ') === 'iXML, cart, id3 ', more.metadata.join(', '));
  check('an 18-byte fmt chunk (a header of 46 bytes): not plain', !inspectWav(wavBytes(rate, samples, { fmtSize: 18 })).plain);
  check('bytes after the data chunk: not plain', !inspectWav(wavBytes(rate, samples, { trailing: 4 })).plain);
  check('a RIFF size that is not the file\'s: not plain', !inspectWav(wavBytes(rate, samples, { riffDelta: 2 })).plain);
  const cut = clean.subarray(0, clean.length - 10);
  check('a data chunk that runs past the file\'s end: not plain, and said so', !inspectWav(cut).plain && inspectWav(cut).problems.some((p) => /runs past the end/.test(p)));
  const odd = Buffer.concat([wavBytes(rate, []).subarray(0, 40), Buffer.from([3, 0, 0, 0, 1, 2, 3, 0])]);
  odd.writeUInt32LE(odd.length - 8, 4);
  check('a data chunk of an odd size, with its pad byte: not plain', inspectWav(odd).wav && !inspectWav(odd).plain && inspectWav(odd).problems.length === 0);
  const flac = Buffer.concat([Buffer.from('fLaC', 'latin1'), Buffer.alloc(64)]);
  check('a FLAC file is not read: not a WAV', inspectWav(flac).wav === false);

  // The command, on files whose folder and names carry a marker, as the
  // orchestrator will run it: no path, no file name in what it prints.
  const marker = 'MARKER-q7f3-private-folder', dir = path.join(tmp, marker);
  fs.mkdirSync(dir);
  const files = { [`${marker}-clean.wav`]: clean, [`${marker}-tagged.wav`]: tagged, [`${marker}.flac`]: flac };
  for (const [n, b] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), b);
  const run = (names) => spawnSync(process.execPath, [path.join(ROOT, INSPECT), ...names.map((n) => path.join(dir, n))], { encoding: 'utf8' });
  const one = run([`${marker}-clean.wav`]);
  check('the command on a clean file: exit 0, "yes", its SHA-256s and format', one.status === 0 && /exactly a 44-byte header and its samples: yes/.test(one.stdout) &&
    one.stdout.includes(sha256(clean)) && one.stdout.includes(sha256(clean.subarray(44))) && /22050 Hz, 1 channel, 16 bits, 1000 samples/.test(one.stdout), `exit ${one.status}`);
  const two = run([`${marker}-clean.wav`, `${marker}-tagged.wav`]);
  check('the command on a clean and a tagged file: exit 1, the second "no", LIST and bext named, every chunk with its size',
    two.status === 1 && /file 2: [\s\S]*metadata chunks: LIST \(INFO\), bext[\s\S]*exactly a 44-byte header and its samples: no/.test(two.stdout) && /bext\s+at byte \d+, 602 bytes/.test(two.stdout), `exit ${two.status}`);
  const three = run([`${marker}.flac`, `${marker}-missing.wav`]);
  check('the command on a FLAC file and a missing one: "not a WAV file", "cannot be read", exit 2', three.status === 2 && /file 1: not a WAV file/.test(three.stdout) && /file 2: cannot be read \(there is no such file\)/.test(three.stdout), `exit ${three.status}`);
  const all = [one, two, three].map((x) => x.stdout + x.stderr).join('\n');
  check('the command prints no path and no file name (the folder and names carry a marker)', !all.includes(marker) && !all.includes(tmp) && !/\.wav|\.flac/.test(all), all.includes(marker) ? 'the marker is printed' : '');
  check('the command names a file only by its place ("file 1")', /^file 1: /m.test(two.stdout) && /^file 2: /m.test(two.stdout));
  const text = read(INSPECT);
  const network = /\bfetch\s*\(|['"]node:(net|dns|dgram|http|https|http2|tls|child_process)['"]|require\(\s*['"](net|dns|dgram|http|https|http2|tls|child_process)['"]/.exec(text);
  check('inspect.mjs loads no network module or child process and calls no fetch', !network, network ? network[0] : '');
}

console.log(`\n${failed ? `FAIL  ${failed} check${failed === 1 ? '' : 's'} failed` : 'recordings: all checks passed'}`);
if (failed) process.exit(1);
