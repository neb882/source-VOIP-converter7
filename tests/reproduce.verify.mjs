// The suite `reproduce`: tests/reproduce.mjs, the script of docs/REPRODUCE.md,
// on stand-ins it makes itself.
//
//   node tests/reproduce.verify.mjs
//
// The repository's own codecs, run on the generated clips, stand in for the
// game's files: the CELT build driven directly (vendor/celt-0.11, W3-08's
// method), the Speex profile's codec frame by frame, and the gain rule as
// tests/gain-exact.mjs transcribes it. The checks themselves take other
// routes (the codec module's CELT stream, the whole render's onGain, the
// engine's receiverAutoGain), so a stand-in that passes shows that the
// script reads, lines up, counts and judges as the record's runs did; it
// does not show that its alignment is the game's (order RP-01, section 5).
//
// [1] The list: every check by name, those not built yet saying so and
//     exiting other than 0.
// [2] inputs: the two clips have the SHA-256 the record gives (pinned here,
//     apart from the script's own copy); --against on a stand-in capture.
// [3] gain, [4] celt, [5] speex: each on its stand-in prints "as expected";
//     with one sample moved by three steps "differs" and an exit other than
//     0; on a file of zeros, and on one too short (or one where the gain
//     changes nothing), "differs" with the reason.
// [6] Nothing leaves the PC: the text of the script, of every file under
//     tests/reproduce/ and of the clips' generator holds no network module and
//     no call to fetch; every run of this suite is made in a child whose net,
//     dns, dgram, fetch and WebSocket are replaced by functions that record a
//     call and throw, and none is recorded. Both detectors are shown to catch
//     what they look for.
// [7] The output holds nothing of the files: the stand-ins lie in a folder,
//     under names and with a header chunk that carry marker strings, and no
//     marker appears in anything a run prints, passing, differing or
//     refused.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHECKS } from './reproduce.mjs';
import { clipSamples, clipWav } from './recordings/make-inputs.mjs';
import { engineGain } from './gain-exact.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const SCRIPT = path.join(here, 'reproduce.mjs');

// The record's checksums of the two clips the game was fed
// (tests/REFERENCE_2026.md, "The file-input runs, measured again
// (2026-11-13)"), and their lengths.
const PINNED = {
  'voice_input_22050.wav': { sha256: 'fc1c6cbd9aabd8ed1b64d4381eae3c2f56dce23eff36e14ba7d9f67dc5505a58', samples: 291942, bytes: 583928 },
  'voice_input_11025.wav': { sha256: 'bd31df844cee4b38fe705be1fbdfb1b17acb9f161f9314b06b1eb2ba0d560dbd', samples: 145966, bytes: 291976 }
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

// The child's guard: net, dns, dgram, fetch and WebSocket replaced by
// functions that append what was called to the log and throw.
const netLog = path.join(tmp, 'network-calls.log');
fs.writeFileSync(netLog, '');
const guard = path.join(tmp, 'guard.mjs');
fs.writeFileSync(guard, `
import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';
const log = process.env.REPRODUCE_NET_LOG;
const trap = (what) => function () { fs.appendFileSync(log, what + '\\n'); throw new Error('refused by the suite: ' + what); };
for (const k of ['connect', 'createConnection', 'createServer']) net[k] = trap('net.' + k);
net.Socket.prototype.connect = trap('net.Socket.prototype.connect');
for (const k of Object.keys(dns)) if (typeof dns[k] === 'function' && /^(lookup|resolve|reverse)/.test(k)) dns[k] = trap('dns.' + k);
for (const k of Object.keys(dns.promises)) if (typeof dns.promises[k] === 'function' && /^(lookup|resolve|reverse)/.test(k)) dns.promises[k] = trap('dns.promises.' + k);
dgram.createSocket = trap('dgram.createSocket');
globalThis.fetch = trap('fetch');
globalThis.WebSocket = trap('WebSocket');
syncBuiltinESMExports();
`);

// Every run of the script, guarded; its output kept for [7].
const runs = [];
function guarded(file, args) {
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(guard).href, file, ...args],
    { cwd: root, encoding: 'utf8', env: { ...process.env, REPRODUCE_NET_LOG: netLog, REPRODUCE_DEBUG: '' } });
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
function writeWav(name, samples, rate, extra) {
  const file = at(name);
  fs.writeFileSync(file, wavBytes(samples, rate, extra));
  return file;
}
const moved = (s, i, by = 3) => { const t = Int16Array.from(s); t[i] = t[i] + by > 32767 ? t[i] - by : t[i] + by; return t; };

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
    check('the built checks are inputs, gain, celt and speex; hold, gate, queue, ceiling, clock and demo are listed as not built yet',
      built.join(' ') === 'inputs gain celt speex' && later.join(' ') === 'hold gate queue ceiling clock demo'
      && later.every((n) => new RegExp(`^  ${n} +not built yet: `, 'm').test(r.out)));
    const bad = later.map((n) => [n, run(n)]).filter(([n, x]) => x.status === 0 || !x.out.includes(`${n}: not built yet`));
    check('each check not built yet prints "<check>: not built yet" and exits other than 0', bad.length === 0, bad.map(([n]) => n).join(', '));
    const u = run(MARKERS[5]);
    check('a name that is no check is refused with exit 2 and the list, the name not repeated', u.status === 2 && /not the name of a check/.test(u.out) && !hasMarker(u.out));
  }

  console.log('\n[2] inputs: the two clips');
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
    check('the command prints each checksum with "as expected" and exits 0', passes(r) && (r.out.match(/SHA-256 [0-9a-f]{64}, expected [0-9a-f]{64}: as expected/g) || []).length === 2, show(r));
    check('the files are the generator module\'s bytes, a plain 44-byte header and the samples',
      files.every((f, k) => f.b.equals(clipWav([22050, 11025][k]))) && files.every((f) => f.b.readUInt32LE(40) === f.b.length - 44));
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
  }

  console.log('\n[6] Nothing leaves the PC');
  {
    const NETWORK = [
      [/\bfetch\s*\(/, 'a call to fetch'],
      [/(?:from\s*|require\s*\(\s*|import\s*\(\s*)['"](?:node:)?(?:net|dns|dgram|http|https|http2|tls|child_process)(?:\/[a-z]+)?['"]/, 'a network module or a child process'],
      [/\bnode:(?:net|dns|dgram|http|https|http2|tls|child_process)\b/, 'a network module or a child process by its node: name'],
      [/\b(?:WebSocket|XMLHttpRequest|EventSource)\b/, 'a browser network object']
    ];
    const scan = (text) => NETWORK.filter(([re]) => re.test(text)).map(([, what]) => what);
    const files = [SCRIPT, path.join(here, 'recordings', 'make-inputs.mjs')];
    const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
    walk(path.join(here, 'reproduce'));
    const found = files.map((f) => [path.relative(root, f), scan(fs.readFileSync(f, 'utf8'))]).filter(([, w]) => w.length);
    check('the script, every file under tests/reproduce/ and the clips\' generator hold no network module, child process, fetch call or browser network object',
      found.length === 0 && files.length >= 7, found.map(([f, w]) => `${f}: ${w.join(', ')}`).join('; ') || `${files.length} files`);
    const planted = ['await fetch(url)', "import net from 'node:net';", "const d = require('dgram');", "import https from 'https';", "await import('node:child_process')", 'new WebSocket(u)'];
    const missed = planted.filter((t) => scan(t).length === 0);
    check('the text check catches each planted form (fetch, node:net, require dgram, https, child_process, WebSocket)', missed.length === 0, missed.join(' | '));

    const calls = fs.readFileSync(netLog, 'utf8');
    check(`no run of this suite (${runs.length}) called the network`, calls === '' && runs.length > 30, calls.trim().split('\n').join(', '));
    const probe = path.join(tmp, 'probe.mjs');
    fs.writeFileSync(probe, `import net from 'node:net'; import dns from 'node:dns'; import dgram from 'node:dgram';
const tries = [() => net.connect(80, 'example.invalid'), () => new net.Socket().connect(80, 'example.invalid'), () => dns.lookup('example.invalid', () => {}),
  () => dgram.createSocket('udp4'), () => fetch('https://example.invalid/')];
for (const t of tries) { try { t(); } catch {} }`);
    guarded(probe, []);
    const caught = fs.readFileSync(netLog, 'utf8').trim().split('\n').filter(Boolean);
    check('the guard records and refuses a socket, a stream connect, a lookup, a datagram socket and a fetch in a guarded child',
      ['net.connect', 'net.Socket.prototype.connect', 'dns.lookup', 'dgram.createSocket', 'fetch'].every((w) => caught.includes(w)), caught.join(', '));
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
