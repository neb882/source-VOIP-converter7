// The check `inputs` (docs/REPRODUCE.md, "The clips").
//
//   inputs <folder>
//     writes voice_input_22050.wav and voice_input_11025.wav, the clips of
//     tests/recordings/make-inputs.mjs, into the folder, and prints each
//     file's SHA-256 with "as expected" or "differs" beside it: the files the
//     game was fed in Sets H, I, M and O had these checksums (measured,
//     2026-11-13). A Node whose arithmetic differs would show here. It also
//     writes steam_mic_24000.wav, the 24 kHz clip for Steam's mic_inputfile
//     (steam-clip.mjs; the check gate), with the checksum order RP-01b
//     computed for it (not yet played into Steam).
//   inputs --against <voice_micdata.wav>
//     the file the game wrote beside voice_decompressed.wav, which holds what
//     it captured, against the clip at the file's rate from its third sample
//     on (the game's reader skips the first two): every sample equal, then
//     two zeros (measured on Sets M and O: 145,964 of 145,964).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RATES, clipSamples, fileName, writeClips } from '../recordings/make-inputs.mjs';
import { cannot, describe, differs, fmt, hasSound, parseArgs, readWav } from './common.mjs';
import { NAME as STEAM_NAME, RATE as STEAM_RATE, steamClipWav } from './steam-clip.mjs';

// The clips' figures (tests/REFERENCE_2026.md, "The file-input runs,
// measured again (2026-11-13)").
// The 24 kHz clip's (tests/REFERENCE_2026.md, "The checks gate and queue
// (2026-11-13)"): computed by order RP-01b's planning run, a choice of that
// order, not yet played into Steam.
export const EXPECTED = {
  22050: { samples: 291942, bytes: 583928, sha256: 'fc1c6cbd9aabd8ed1b64d4381eae3c2f56dce23eff36e14ba7d9f67dc5505a58' },
  11025: { samples: 145966, bytes: 291976, sha256: 'bd31df844cee4b38fe705be1fbdfb1b17acb9f161f9314b06b1eb2ba0d560dbd' },
  24000: { samples: 679200, bytes: 1358444, sha256: '3e02aaa585001e562e133aea7985bce4208563e39c00655d153f34b88e873fde' }
};

// The game's reader skips the first two samples of the file (finding 27).
export const SKIP = 2;

// Each clip written against its expected figures: one line on the file, one
// with its SHA-256 and the verdict. Returns whether every clip is as
// expected. `expected` is EXPECTED but for the suite, which gives a wrong
// one to show the verdict "differs".
export function verdicts(made, report, expected = EXPECTED) {
  let ok = true;
  for (const { rate, name, bytes } of made) {
    const want = expected[rate], sha = crypto.createHash('sha256').update(bytes).digest('hex');
    report.line(`${name}: ${rate} Hz, 16-bit mono, ${fmt((bytes.length - 44) / 2)} samples, ${fmt(bytes.length)} bytes`);
    ok = report.figure(`SHA-256 ${sha}, expected ${want.sha256}`, sha === want.sha256 && bytes.length === want.bytes) && ok;
  }
  return ok;
}

function write(folder, report) {
  let made, steam;
  try {
    made = writeClips(path.resolve(folder));
    steam = { rate: STEAM_RATE, name: STEAM_NAME, bytes: steamClipWav() };
    fs.writeFileSync(path.join(path.resolve(folder), STEAM_NAME), steam.bytes);
  } catch {
    throw cannot('the clips cannot be written into the folder given (argument 1)');
  }
  const ok = verdicts(made, report);
  const okSteam = verdicts([steam], report);
  report.line('Copy the one your codec needs into the game\'s folder as voice_input.wav: 22050 Hz for vaudio_celt and vaudio_celt_high, 11025 Hz for vaudio_speex.');
  report.line(`${STEAM_NAME} is for Steam's mic_inputfile (the check gate); it has not been played into Steam yet.`);
  if (!ok) throw differs('a clip\'s SHA-256 is not the one the game was fed; this Node computes the clip differently, and the other checks would compare with another input');
  if (!okSteam) throw differs(`the SHA-256 of ${STEAM_NAME} is not the one computed for it; this Node computes the clip differently`);
}

function against(file, report) {
  const wav = readWav(file, 'file 1');
  report.line(describe('file 1', wav));
  if (!RATES.includes(wav.rate)) throw differs(`file 1 is at ${wav.rate} Hz; the clips are at 22050 and 11025 Hz`);
  if (!hasSound(wav.samples)) throw differs('file 1 holds no sound (every sample is zero)');
  const clip = clipSamples(wav.rate), n = clip.length - SKIP, got = wav.samples;
  report.info(`against ${fileName(wav.rate)}, from its third sample (the game's reader skips the first two)`);
  let equal = 0;
  for (let i = 0; i < Math.min(n, got.length); i++) if (got[i] === clip[i + SKIP]) equal++;
  let zeros = 0;
  for (let i = n; i < Math.min(clip.length, got.length); i++) if (got[i] === 0) zeros++;
  const ok1 = report.figure(`samples equal to the clip's: ${fmt(equal)} of ${fmt(n)}, expected all`, equal === n);
  const ok2 = report.figure(`zeros after them: ${zeros} of ${SKIP}, expected ${SKIP}`, zeros === SKIP);
  const ok3 = report.figure(`length: ${fmt(got.length)} samples, expected ${fmt(clip.length)}, the clip's`, got.length === clip.length);
  if (!(ok1 && ok2 && ok3)) throw differs('file 1 is not the clip from its third sample followed by two zeros');
}

export default {
  name: 'inputs',
  summary: 'the two clips for voice_inputfromfile and the one for Steam\'s mic_inputfile; with --against, a voice_micdata.wav against its clip',
  usage: ['inputs <folder>', 'inputs --against <voice_micdata.wav>'],
  async run(args, report) {
    const { files, options } = parseArgs(args, { flags: ['--against'] });
    if (files.length !== 1) throw cannot(options.against ? 'give one file after --against' : 'give one folder to write the clips into');
    if (options.against) against(files[0], report); else write(files[0], report);
  }
};
