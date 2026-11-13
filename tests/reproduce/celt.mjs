// The check `celt` (docs/REPRODUCE.md, "celt"): the repository's CELT 0.11,
// set up as the game's vaudio_celt module was read (finding 31), gives the
// game's decoded voice.
//
//   celt <voice_decompressed.wav> [<input>] [--high] [--micdata] [--any-rate]
//
// file 1 is the game's decoded voice at voice_maxgain 1 (where the gain does
// nothing; finding 27). The input is file 2, the voice_input.wav the game
// was given, taken from its third sample (the game's reader skips the first
// two; finding 27); with --micdata file 2 is the voice_micdata.wav the game
// wrote, taken whole; with no file 2, the generated 22050 Hz clip. --high is
// vaudio_celt_high (the 44100 Hz mode, 1024-sample frames, 128 bytes, fed
// 22050 Hz sound); without it vaudio_celt (512 samples, 64 bytes). The game
// takes the file's samples at its codec's rate whatever the header says (read,
// W3-03): with --any-rate file 2's samples are taken as 22050 Hz sound
// whatever its header says (Set I: the 11025 Hz clip under vaudio_celt, at
// double speed); without it a file 2 at another rate is refused. A file 1
// that ends, or goes on, more than one packet from the length the input
// decodes to is refused: a key released early, or another input. The method
// is W3-08's ("Expected, exactly"): one encoder and decoder, complexity 5,
// the input in whole frames padded with zeros, each frame encoded and its
// packet decoded, the decoded samples against the file's at zero lag.
// Expected: all but a few samples equal and those one step off (measured,
// Set H: 292,351 of 292,352 and 292,789 of 292,864); the pass line allows
// 0.05% one step off and none further (a choice of the order, RP-01: Set H's
// larger share doubled), the last packet counted apart.
import { createCeltStream } from '../../opus-codec.mjs';
import { clipSamples } from '../recordings/make-inputs.mjs';
import { SKIP } from './inputs.mjs';
import { cannot, describe, differs, fmt, hasSound, parseArgs, readWav } from './common.mjs';

export const RATE = 22050;
// At most this share of the compared samples may be one step off.
export const ONE_STEP_SHARE = 0.0005;

const MODES = {
  vaudio_celt: { frame: 512, bytes: 64 },
  vaudio_celt_high: { frame: 1024, bytes: 128, modeRate: 44100 }
};

// The input as the encoder takes it (Int16Array) and how it was taken.
// `anyRate` says whether the check takes --any-rate (celt does).
export function inputFor(files, options, rate, report, anyRate = false) {
  if (!files[1]) {
    if (options['any-rate']) throw cannot('--any-rate needs the file you gave the game as file 2');
    report.info(`input: the generated ${rate} Hz clip (tests/recordings/make-inputs.mjs), from its third sample`);
    return clipSamples(rate).slice(SKIP);
  }
  const wav = readWav(files[1], 'file 2');
  report.line(describe(`file 2 (${options.micdata ? 'what the game captured' : 'the input given to the game'})`, wav));
  if (wav.rate !== rate && options['any-rate']) {
    report.info(`file 2's header says ${wav.rate} Hz; its samples are taken as ${rate} Hz sound (--any-rate), as the game takes a file at its codec's rate whatever the header says (read, W3-03's report; Set I)`);
  } else if (wav.rate !== rate) {
    throw differs(`file 2 is at ${wav.rate} Hz; this codec takes ${rate} Hz${anyRate ? '. The game takes a file\'s samples at its codec\'s rate whatever the header says: if this is the file you gave the game, give --any-rate' : ''}`);
  }
  if (!hasSound(wav.samples)) throw differs('file 2 holds no sound (every sample is zero)');
  if (options.micdata) { report.info('input: file 2 whole (--micdata)'); return wav.samples; }
  report.info('input: file 2 from its third sample (the game\'s reader skips the first two)');
  return wav.samples.slice(SKIP);
}

// A recording that ends more than one packet before the length the input
// decodes to (a key released early), or goes on more than one packet past it
// (another input), cannot show the codec over the clip: refused with the
// reason in seconds. Within one packet it is compared over the shorter.
export function lengthFloor(have, want, packet, word, rate, hint = '') {
  const s = (n) => (n / rate).toFixed(2);
  if (have < want - packet) {
    throw differs(`file 1 ends ${s(want - have)} s before the input does (${fmt(have)} samples where the input decodes to ${fmt(want)}): hold the key until the clip has ended, about 15 s, and copy the file before the next press`);
  }
  if (have > want + packet) {
    throw differs(`file 1 goes on ${s(have - want)} s past the input (${fmt(have)} samples where the input decodes to ${fmt(want)}, more than one ${word} apart): was it made from another input?${hint}`);
  }
}

// The decoded samples of the input through the codec, in whole frames.
async function decoded(input, mode) {
  const codec = await createCeltStream(RATE, { frameSize: mode.frame, packetBytes: mode.bytes, complexity: 5,
    ...(mode.modeRate ? { modeRate: mode.modeRate } : {}) });
  try {
    const packets = Math.ceil(input.length / mode.frame), out = new Int16Array(packets * mode.frame), buf = new Float32Array(mode.frame);
    for (let p = 0; p < packets; p++) {
      for (let i = 0; i < mode.frame; i++) { const j = p * mode.frame + i; buf[i] = j < input.length ? input[j] / 32768 : 0; }
      const y = codec.decode(codec.encode(buf).packet);
      for (let i = 0; i < mode.frame; i++) out[p * mode.frame + i] = Math.round(y[i] * 32768);
    }
    return out;
  } finally {
    codec.free();
  }
}

export default {
  name: 'celt',
  summary: 'vaudio_celt and vaudio_celt_high: the game\'s decoded voice from its input',
  usage: ['celt <voice_decompressed.wav> [<voice_input.wav>] [--high] [--any-rate]', 'celt <voice_decompressed.wav> <voice_micdata.wav> --micdata [--high]'],
  async run(args, report) {
    const { files, options } = parseArgs(args, { flags: ['--high', '--micdata', '--any-rate'] });
    if (files.length < 1 || files.length > 2) throw cannot('give the game\'s voice_decompressed.wav, and the input after it if it is not the generated clip');
    if (options.micdata && files.length !== 2) throw cannot('--micdata needs the voice_micdata.wav as file 2');
    const name = options.high ? 'vaudio_celt_high' : 'vaudio_celt', mode = MODES[name];
    const game = readWav(files[0], 'file 1');
    report.line(describe('file 1 (the game\'s decoded voice)', game));
    report.info(`codec: ${name}, ${fmt(mode.frame)}-sample frames of ${mode.bytes} bytes${mode.modeRate ? ' (the 44100 Hz mode fed 22050 Hz sound)' : ''}, complexity 5`);
    if (game.rate !== RATE) throw differs(`file 1 is at ${game.rate} Hz; vaudio_celt and vaudio_celt_high write 22050 Hz`);
    const g = game.samples;
    if (g.length % mode.frame !== 0) {
      const hint = options.high && g.length % 512 === 0 ? ' (it is whole packets of vaudio_celt\'s 512: leave out --high)' : '';
      throw differs(`file 1 holds ${fmt(g.length)} samples, not a whole number of ${fmt(mode.frame)}-sample packets as the game writes them under ${name}${hint}`);
    }
    if (g.length < 2 * mode.frame) throw differs(`file 1 holds fewer than two packets of ${fmt(mode.frame)} samples`);
    if (!hasSound(g, 0, g.length - mode.frame)) throw differs('file 1 holds no sound before its last packet (every sample is zero)');
    const input = inputFor(files, options, RATE, report, true);
    const mine = await decoded(input, mode);
    // vaudio_celt_high would fit: whole 1024-sample packets, within one of the input's.
    const highFits = !options.high && g.length % 1024 === 0 && Math.abs(g.length - Math.ceil(input.length / 1024) * 1024) <= 1024;
    lengthFloor(g.length, mine.length, mode.frame, 'packet', RATE, highFits ? ' If the game ran vaudio_celt_high, give --high.' : '');
    const n = Math.min(g.length, mine.length), body = n - mode.frame;
    if (g.length !== mine.length) report.info(`file 1 holds ${fmt(g.length / mode.frame)} packets and the input makes ${fmt(mine.length / mode.frame)}: compared over ${fmt(n)} samples`);
    if (body <= 0) throw differs('the input makes fewer than two packets');
    let same = 0, one = 0, further = 0, largest = 0, lastDiffer = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(g[i] - mine[i]);
      if (i >= body) { if (d) lastDiffer++; continue; }
      if (!d) same++; else if (d === 1) one++; else further++;
      largest = Math.max(largest, d);
    }
    const allowed = Math.floor(ONE_STEP_SHARE * body);
    report.info(`lag: 0 samples; compared: the first ${fmt(body)} samples, the last packet (${fmt(mode.frame)} samples) counted apart`);
    report.info(`samples equal: ${fmt(same)} of ${fmt(body)}; largest difference: ${fmt(largest)} step${largest === 1 ? '' : 's'}`);
    const ok1 = report.figure(`samples one step off: ${fmt(one)}, expected at most ${fmt(allowed)} (0.05%)`, one <= allowed);
    const ok2 = report.figure(`samples more than one step off: ${fmt(further)}, expected 0`, further === 0);
    report.info(`samples that differ in the last packet (counted apart): ${fmt(lastDiffer)} of ${fmt(mode.frame)}`);
    if (!(ok1 && ok2)) {
      const hint = highFits ? ' If the game ran vaudio_celt_high, give --high.' : '';
      throw differs(`file 1 is not this build's ${name} output of the input.${hint}`);
    }
  }
};
