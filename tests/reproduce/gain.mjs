// The check `gain` (docs/REPRODUCE.md, "gain"): the receiver's gain rule
// (finding 26) applied to the game's decoded voice recorded at
// voice_maxgain 1 gives the one recorded at voice_maxgain 10.
//
//   gain <voice_maxgain 1 file> <voice_maxgain 10 file> [--packet <samples>]
//
// Both are voice_decompressed.wav from one input and one codec. The rule is
// the engine's (receiverAutoGain at voice_maxgain 10, voice_avggain 0.5,
// voice_scale 1), compared by tests/gain-exact.mjs's compareGain. The last
// packet differs between two key presses (measured, Set H) and is counted
// apart: --packet gives its length, by default 512 at 22050 Hz (vaudio_celt's
// packet) and 160 at 11025 Hz (one Speex frame: a choice of this script; the
// record has no gain-10 figure under Speex but the whole render's). Two files of different lengths are compared over the shorter, and
// the check says so. Expected: no sample differs before the last packet
// (measured, Set H: 0 of 291,840).
import { compareGain } from '../gain-exact.mjs';
import { cannot, describe, differs, fmt, hasSound, parseArgs, readWav, wholeOption } from './common.mjs';

const PACKETS = { 22050: 512, 11025: 160 };

export default {
  name: 'gain',
  summary: 'the receiver\'s gain: the voice_maxgain 10 recording from the voice_maxgain 1 one',
  usage: ['gain <voice_maxgain 1 file> <voice_maxgain 10 file> [--packet <samples>]'],
  async run(args, report) {
    const { files, options } = parseArgs(args, { values: ['--packet'] });
    if (files.length !== 2) throw cannot('give two files: the recording at voice_maxgain 1, then the one at 10');
    const one = readWav(files[0], 'file 1'), ten = readWav(files[1], 'file 2');
    report.line(describe('file 1 (voice_maxgain 1)', one));
    report.line(describe('file 2 (voice_maxgain 10)', ten));
    if (one.rate !== ten.rate) throw differs(`the two files are at different rates (${one.rate} and ${ten.rate} Hz): not two recordings of one codec`);
    if (!(one.rate in PACKETS)) throw differs(`the files are at ${one.rate} Hz; the game writes 22050 Hz under vaudio_celt and vaudio_celt_high and 11025 Hz under vaudio_speex`);
    const packet = wholeOption(options, 'packet', PACKETS[one.rate], 1, 8192);
    const n = Math.min(one.samples.length, ten.samples.length);
    if (one.samples.length !== ten.samples.length) {
      report.info(`the files differ in length (${fmt(one.samples.length)} and ${fmt(ten.samples.length)} samples): compared over the shorter, ${fmt(n)}`);
    }
    if (n < packet + 128) throw differs(`the shorter file holds ${fmt(n)} samples: too short to hold one 128-sample block of the gain before its last packet of ${fmt(packet)}`);
    const a = one.samples.subarray(0, n), b = ten.samples.subarray(0, n);
    if (!hasSound(a, 0, n - packet)) throw differs('file 1 holds no sound before its last packet (every sample is zero)');
    const r = compareGain(a, b, packet);
    report.info(`the rule: voice_maxgain 10, voice_avggain 0.5, voice_scale 1, in blocks of 128 samples, applied to file 1`);
    report.info(`samples the gain changes before the last packet: ${fmt(r.changed)} of ${fmt(r.body)}`);
    if (r.changed === 0) throw differs('the gain changes no sample of file 1 before its last packet, so the files cannot show the rule (is file 1 at full scale throughout, or too short?)');
    const ok = report.figure(`samples that differ before the last packet: ${fmt(r.before)} of ${fmt(r.body)}, expected 0`, r.before === 0);
    report.info(`samples that differ in the last packet (${fmt(packet)} samples, counted apart): ${fmt(r.last)}`);
    if (!ok) throw differs(`file 2 is not the rule applied to file 1 in ${fmt(r.before)} sample${r.before === 1 ? '' : 's'} before the last packet`);
  }
};
