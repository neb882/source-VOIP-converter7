// The check `ceiling` (docs/REPRODUCE.md, "ceiling"): the game adds all of
// its sound, the voice and the rest, clips the sum at +-32767, applies
// `volume` and rounds to 16 bits, in that order (read, finding 30). So no
// sample of its output passes round(32767 x volume), and a sum that passes
// the clip is flattened exactly there: the game's ceiling.
//
//   ceiling <recording of the output.wav> --volume <the game's volume>
//
// file 1 is a recording of the PC's output while a loud voice played over the
// game's own sound, as a recorder saves it (any WAV: 16- or 24-bit, float,
// stereo; the first channel is read; common.mjs, readOutputWav). Expected:
// the largest sample at round(32767 x volume) and the smallest at minus that,
// each within one 16-bit step, and at least MIN_ON_TOP samples exactly on the
// largest, enough to show a clip (a choice of this check). Measured
// 2026-11-13 by the orchestrator, privately, on eight takes of the record:
// the largest sample exactly round(32767 x volume) in all eight (4915 at
// volume 0.15, 3604 at 0.11), the smallest the same with a minus, none
// beyond. What a pass does not show is the voice's own level in the mix
// (255/256, finding 30): the map's sound rides on the voice, and what passes
// the clip sits on the ceiling, so a recording's flat tops are the ceiling's.
// A recording with no sound, or with too few samples on its largest, is
// "differs" with the reason.
import { describeOutput, differs, cannot, fmt, numberOption, parseArgs, readOutputWav } from './common.mjs';

export const CLIP = 32767;
// The fewest samples that must sit exactly on the largest to show a clip: a
// choice of this check (about 2 ms at 48000 Hz). The record's takes hold 3,603
// or more in six of eight, and 10 in the one made at voice_maxgain 1, which
// shows no clip (measured 2026-11-13 by the orchestrator, privately).
export const MIN_ON_TOP = 100;
// The tolerance on the ceiling, in 16-bit steps (measured: the record's takes
// sit exactly on it).
export const STEPS = 1;

export default {
  name: 'ceiling',
  summary: 'the mixer\'s clip and volume, in a recording of the output',
  usage: ['ceiling <recording of the output.wav> --volume <the game\'s volume>'],
  async run(args, report) {
    const { files, options } = parseArgs(args, { values: ['--volume'] });
    if (files.length !== 1) throw cannot('give one file: a recording of the PC\'s output while the voice played');
    if (options.volume == null) throw cannot('give --volume with the value the game\'s console prints for `volume`');
    const volume = Math.fround(numberOption(options, 'volume', 1, 0.01, 1));
    const wav = readOutputWav(files[0], 'file 1');
    report.line(describeOutput('file 1 (the PC\'s output)', wav));
    let top = -Infinity, bottom = Infinity;
    for (const v of wav.first) { const r = Math.round(v); if (r > top) top = r; if (r < bottom) bottom = r; }
    if (top === 0 && bottom === 0) throw differs('file 1 holds no sound (every sample is zero)');
    const ceiling = Math.round(CLIP * volume);
    let onTop = 0, onBottom = 0;
    for (const v of wav.first) { const r = Math.round(v); if (r === top) onTop++; if (r === bottom) onBottom++; }
    report.info(`volume ${+volume.toFixed(4)}: the game's ceiling round(32767 x volume) = ${fmt(ceiling)}`);
    const ok1 = report.figure(`largest sample ${fmt(top)}, expected ${fmt(ceiling)} within one step`, Math.abs(top - ceiling) <= STEPS);
    const ok2 = report.figure(`smallest sample ${fmt(bottom)}, expected ${fmt(-ceiling)} within one step`, Math.abs(bottom + ceiling) <= STEPS);
    report.info(`samples exactly on the largest: ${fmt(onTop)}; on the smallest: ${fmt(onBottom)}`);
    report.info(`the volume the largest sample gives: ${(top / CLIP).toFixed(5)}`);
    if (top > ceiling + STEPS || bottom < -ceiling - STEPS) {
      throw differs('samples pass the game\'s ceiling: something after the game raised the level (the system\'s volume, an effect, or the recorder\'s gain), or --volume is not the game\'s value');
    }
    if (!(ok1 && ok2)) {
      throw differs(`the sound stays under the game's ceiling: either nothing reached the clip (play a louder voice with the game's own sound on, at voice_maxgain 10: the clip acts on the sum), or --volume is not the game's value (the largest sample gives ${(top / CLIP).toFixed(5)}), or the system plays the game under 100%`);
    }
    if (onTop < MIN_ON_TOP) {
      throw differs(`only ${fmt(onTop)} sample${onTop === 1 ? ' sits' : 's sit'} exactly on the largest, fewer than ${MIN_ON_TOP} (a choice of this check): too few to show a clip; play a louder voice with the game's own sound on`);
    }
  }
};
