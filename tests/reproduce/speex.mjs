// The check `speex` (docs/REPRODUCE.md, "speex"): the repository's Speex
// 1.0.2, set up and computed as the game's vaudio_speex module was read and
// run (finding 31), with the receiver's gain after it, gives the game's
// decoded voice.
//
//   speex <voice_decompressed.wav> [<input>] [--micdata] [--maxgain 1|10]
//
// file 1 is the game's decoded voice from the 32-bit game, at the
// voice_maxgain given (1 by default). The input is file 2, the
// voice_input.wav the game was given, taken from its third sample (the
// game's reader skips the first two; finding 27) and followed by two zeros,
// as the game's capture of Sets M and O was (measured); with --micdata
// file 2 is the voice_micdata.wav the game wrote, taken whole; with no
// file 2, the generated 11025 Hz clip. The method is the record's private
// runs (finding 31; Set O): the whole render of the `speex` profile
// (TF2Audio.process) with the gain's output taken at onGain, against the
// file at the codec's delay (80 samples). Expected: every sample equal
// (measured, Set O: 145,966 of 145,966 at voice_maxgain 1 and at 10). A
// file 1 more than one 160-sample frame shorter or longer than the input's
// frames is refused (celt.mjs, lengthFloor).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEngine } from '../lib/engine.cjs';
import { inputFor, lengthFloor } from './celt.mjs';
import { cannot, describe, differs, fmt, hasSound, numberOption, parseArgs, readWav } from './common.mjs';

export const RATE = 11025;
const FRAME = 160;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The gain's output of the speex profile's render of the input (16-bit
// samples) and the codec's delay.
async function rendered(input, maxGain) {
  const TF2Opus = await import(pathToFileURL(path.join(root, 'opus-codec.mjs')).href);
  const A = loadEngine({ root, codec: TF2Opus }).audio;
  const x = Float32Array.from(input, (v) => v / 32768);
  let gained = null;
  const r = await A.process({ sampleRate: RATE, length: x.length, numberOfChannels: 1, getChannelData: () => x },
    { codec: 'speex', maxGain, onGain: (g) => { gained = Float32Array.from(g); } });
  return { samples: Int16Array.from(gained, (v) => Math.round(v * 32768)), lag: r.codecInfo.lookahead };
}

export default {
  name: 'speex',
  summary: 'vaudio_speex (the 32-bit game): the game\'s decoded voice from its input',
  usage: ['speex <voice_decompressed.wav> [<voice_input.wav>] [--maxgain 1|10]', 'speex <voice_decompressed.wav> <voice_micdata.wav> --micdata [--maxgain 1|10]'],
  async run(args, report) {
    const { files, options } = parseArgs(args, { flags: ['--micdata'], values: ['--maxgain'] });
    if (files.length < 1 || files.length > 2) throw cannot('give the game\'s voice_decompressed.wav, and the input after it if it is not the generated clip');
    if (options.micdata && files.length !== 2) throw cannot('--micdata needs the voice_micdata.wav as file 2');
    const maxGain = numberOption(options, 'maxgain', 1, 1, 100);
    const game = readWav(files[0], 'file 1');
    report.line(describe(`file 1 (the game's decoded voice at voice_maxgain ${maxGain})`, game));
    if (game.rate !== RATE) throw differs(`file 1 is at ${game.rate} Hz; vaudio_speex writes 11025 Hz (a file at 22050 Hz is the 64-bit game's fall-back to vaudio_celt)`);
    const g = game.samples;
    if (g.length % FRAME !== 0) throw differs(`file 1 holds ${fmt(g.length)} samples, not a whole number of ${FRAME}-sample Speex frames as the game writes them`);
    if (g.length < 2 * FRAME) throw differs(`file 1 holds fewer than two Speex frames of ${FRAME} samples`);
    if (!hasSound(g)) throw differs('file 1 holds no sound (every sample is zero)');
    let input = inputFor(files, options, RATE, report);
    if (!options.micdata) {
      const padded = new Int16Array(input.length + 2);
      padded.set(input);
      input = padded;
      report.info('then two zeros, as the game\'s capture ends');
    }
    lengthFloor(g.length, Math.ceil(input.length / FRAME) * FRAME, FRAME, 'frame', RATE);
    report.info(`render: the speex profile at voice_maxgain ${maxGain}, voice_avggain 0.5, voice_scale 1, the gain's output`);
    const { samples: mine, lag } = await rendered(input, maxGain);
    const n = Math.min(mine.length, g.length - lag);
    if (n < FRAME) throw differs(`file 1 holds too few samples after the codec's delay of ${lag}`);
    if (!hasSound(g, lag, lag + n)) throw differs('file 1 holds no sound where it is compared');
    let same = 0, largest = 0;
    for (let i = 0; i < n; i++) { const d = Math.abs(g[i + lag] - mine[i]); if (!d) same++; largest = Math.max(largest, d); }
    report.info(`lag: ${lag} samples (the codec's delay); compared: ${fmt(n)} samples, file 1's from its sample ${fmt(lag + 1)}`);
    if (mine.length > g.length - lag) report.info(`file 1 ends ${fmt(mine.length - (g.length - lag))} samples before the render`);
    const ok = report.figure(`samples equal: ${fmt(same)} of ${fmt(n)}, expected all; largest difference: ${fmt(largest)}`, same === n);
    if (!ok) throw differs(`file 1 is not this build's speex render of the input at voice_maxgain ${maxGain}`);
  }
};
