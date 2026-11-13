// The check `ceiling` (docs/REPRODUCE.md, "ceiling"): the voice enters the
// game's mix at 255/256, and the sum is clipped at +-32767 before `volume`
// (read, finding 30). So a voice loud enough for the receiver's gain to clamp
// it has flat tops at 32639 x volume, and no sample of the output passes
// round(32767 x volume).
//
//   ceiling <recording of the output.wav> --volume <the game's volume>
//
// file 1 is a recording of the PC's output while the voice played, as a
// recorder saves it (any WAV: 16- or 24-bit, float, stereo; the first
// channel is read; common.mjs, readOutputWav). The flat tops are found by
// TF2Reference.clampLevel (reference.js), the clamp's plateau the real-take
// check uses; their value is the commonest whole step among the samples that
// plateau holds, and only samples in a run of four or more at it count as
// flat. Expected (measured, findings 30 and 32): flat tops at 4895 to 4896
// under a ceiling of 4915 at volume 0.15, and exactly 16320 at volume 0.5;
// the pass line is one 16-bit step on both figures (measured). A recording
// with no sound, or with no flat top (a voice too quiet to be clamped), is
// "differs" with the reason.
import { createRequire } from 'node:module';
import { describeOutput, differs, cannot, fmt, numberOption, parseArgs, readOutputWav } from './common.mjs';

const TF2Reference = createRequire(import.meta.url)('../../reference.js');

// The voice's clamped top in the mix, and the clip on the sum (finding 30).
export const VOICE_TOP = 32639, CLIP = 32767;
// The flat samples a top needs: at least this share of the recording (the
// share clampLevel asks of its plateau), and at least MIN_FLAT samples.
const FLAT_SHARE = 0.002, MIN_FLAT = 100, FLAT_RUN = 4;

// The flat tops of x (16-bit steps): { level, top, flat } or null.
export function flatTops(x) {
  let level;
  try { level = TF2Reference.clampLevel(x); } catch { return null; }
  if (!(level > 0)) return null;
  const low = level * 10 ** (-0.05 / 20) - 0.5, high = level + 0.5;
  const counts = new Map();
  for (const v of x) { const m = Math.abs(v); if (m >= low && m <= high) { const k = Math.round(m); counts.set(k, (counts.get(k) || 0) + 1); } }
  let top = null;
  for (const [k, n] of counts) if (top === null || n > counts.get(top) || (n === counts.get(top) && k > top)) top = k;
  if (top === null) return null;
  // A sample is flat when it lies in a run of FLAT_RUN or more samples at the
  // top on the same side (the peak of an unclamped tone holds two or three).
  let flat = 0;
  const at = (i) => (Math.round(Math.abs(x[i])) === top ? Math.sign(x[i]) : 0);
  for (let i = 0; i < x.length;) {
    const s = at(i);
    let j = i + 1;
    if (s) while (j < x.length && at(j) === s) j++;
    if (s && j - i >= FLAT_RUN) flat += j - i;
    i = j;
  }
  return { level, top, flat };
}

export default {
  name: 'ceiling',
  summary: 'the mixer\'s ceiling and volume, in a recording of the output',
  usage: ['ceiling <recording of the output.wav> --volume <the game\'s volume>'],
  async run(args, report) {
    const { files, options } = parseArgs(args, { values: ['--volume'] });
    if (files.length !== 1) throw cannot('give one file: a recording of the PC\'s output while the voice played');
    if (options.volume == null) throw cannot('give --volume with the value the game\'s console prints for `volume`');
    const volume = Math.fround(numberOption(options, 'volume', 1, 0.01, 1));
    const wav = readOutputWav(files[0], 'file 1');
    report.line(describeOutput('file 1 (the PC\'s output)', wav));
    const x = wav.first;
    let largest = 0;
    for (const v of x) largest = Math.max(largest, Math.abs(v));
    if (Math.round(largest) === 0) throw differs('file 1 holds no sound (every sample is zero)');
    const expectTop = VOICE_TOP * volume, ceiling = Math.round(CLIP * volume);
    report.info(`volume ${+volume.toFixed(4)}: the voice's flat tops expected at 32639 x volume = ${expectTop.toFixed(2)}, the ceiling round(32767 x volume) = ${fmt(ceiling)}`);
    const found = flatTops(x), need = Math.max(MIN_FLAT, Math.ceil(FLAT_SHARE * x.length));
    if (!found || found.flat < need) {
      throw differs(`file 1 has no flat top (${fmt(found ? found.flat : 0)} samples sit flat at its loudest level, fewer than ${fmt(need)}): the voice was not loud enough for the receiver's gain to clamp it; play a louder sound at voice_maxgain 10, the default`);
    }
    report.info(`flat samples at the top: ${fmt(found.flat)} of ${fmt(x.length)}`);
    const ok1 = report.figure(`flat tops at ${fmt(found.top)}, expected ${expectTop.toFixed(2)} within one step`, Math.abs(found.top - expectTop) <= 1);
    const ok2 = report.figure(`largest sample ${fmt(Math.round(largest))}, expected at most ${fmt(ceiling)} within one step`, Math.round(largest) <= ceiling + 1);
    report.info(`the volume the flat tops give: ${(found.top / VOICE_TOP).toFixed(4)}; the share of the ceiling they reach: ${(found.top / (CLIP * volume)).toFixed(4)} (255/256 is 0.9961)`);
    if (!ok1 && found.top < 0.9 * expectTop) {
      throw differs(`the loudest flat parts of file 1 sit at ${(found.top / expectTop).toFixed(2)} of 32639 x volume: either the voice was not loud enough for the receiver's gain to clamp it (play a louder sound at voice_maxgain 10, the default), or --volume is not the game's value, or the system plays the game under 100%`);
    }
    if (!ok1) {
      throw differs(`the flat tops are not at 32639 x volume: they give a volume of ${(found.top / VOICE_TOP).toFixed(4)} where --volume says ${+volume.toFixed(4)}. Check that --volume is the game's value, that the system plays the game at 100% with no effects, and that the recorder adds no gain`);
    }
    if (!ok2) throw differs('samples pass the game\'s ceiling: something after the game raised the level (the system\'s volume, an effect, or the recorder\'s gain)');
  }
};
