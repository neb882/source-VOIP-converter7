// The check `clock` (docs/REPRODUCE.md, "clock"): the game drops one sample
// from every packet it plays (read, finding 24), so a recording of its output
// runs ahead of a render that keeps every sample by about the packets a
// second over 44100.
//
//   clock <recording of the output.wav> <the source that was played.wav> [--packets <a second>]
//
// file 1 is a recording of the PC's output while the voice played (any WAV;
// the first channel is read: common.mjs, readOutputWav); file 2 is the file
// that was played into the game's voice, whose first channel is what Steam
// captured. The script renders file 2 with the steam profile at its defaults
// (TF2Audio.process, loaded through tests/lib/engine.cjs as
// tests/reference.verify.mjs loads it), at file 1's rate, and lines file 1 up
// against that render with TF2Reference.track (reference.js), as the
// accuracy suite does: phrase by phrase, one clock for the whole take. The
// clock is how much faster file 1 plays, in parts in a million.
//
// Expected, without --packets: +397 to +416, the range of the plain takes in
// the table of docs/ACCURACY.md (measured; finding 24: 17.8 packets a second
// over 44100 is 403, computed). With --packets P (the packets a second the
// game's console gave, docs/REPRODUCE.md says how): P / 44100 in parts in a
// million, from 6 under to 13 over, which is that table's range around
// finding 24's 403 (computed from the record's figures; a choice of this
// check). The take at 22.3 packets a second read +510 (measured) where 506 is
// computed, inside that window. A recording too short or too quiet to track
// is "differs" with the reason.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEngine } from '../lib/engine.cjs';
import { describeOutput, differs, cannot, fmt, numberOption, parseArgs, readOutputWav } from './common.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TF2Reference = createRequire(import.meta.url)('../../reference.js');

// The record's range for the plain takes (docs/ACCURACY.md's table), and the
// window around P / 44100 with --packets (the same range around 403).
export const RANGE = [397, 416];
export const WINDOW = [-6, 13];
// The fewest one-second windows that must line up for the clock to count
// (ten seconds of voice; a choice of this check).
export const MIN_WINDOWS = 20;
const VOICE_RATE = 44100;

const signed = (v) => `${v >= 0 ? '+' : ''}${fmt(v)}`;

function hasSound(x) { for (const v of x) if (Math.round(v) !== 0) return true; return false; }

export default {
  name: 'clock',
  summary: 'the one sample a packet, in a recording of the output',
  usage: ['clock <recording of the output.wav> <the source that was played.wav> [--packets <a second>]'],
  async run(args, report) {
    const { files, options } = parseArgs(args, { values: ['--packets'] });
    if (files.length !== 2) throw cannot('give two files: a recording of the PC\'s output, then the file that was played into the game\'s voice');
    const packets = options.packets == null ? null : numberOption(options, 'packets', 0, 1, 100);
    const take = readOutputWav(files[0], 'file 1');
    report.line(describeOutput('file 1 (the PC\'s output)', take));
    const source = readOutputWav(files[1], 'file 2');
    report.line(describeOutput('file 2 (the source played)', source));
    if (take.rate < 44100 || take.rate > 192000) throw differs(`file 1 is at ${take.rate} Hz; a recording of the game's output is at 44100 Hz or more (48000 Hz on most PCs)`);
    if (!hasSound(take.first)) throw differs('file 1 holds no sound (every sample is zero)');
    if (!hasSound(source.first)) throw differs('file 2 holds no sound (every sample is zero)');
    const rate = take.rate, x = Float32Array.from(take.first, (v) => v / 32768), src = Float32Array.from(source.first, (v) => v / 32768);
    if (x.length < 4 * rate) throw differs(`file 1 holds ${(x.length / rate).toFixed(1)} s, too short to measure a clock: record the whole source`);

    const TF2Opus = await import(pathToFileURL(path.join(root, 'opus-codec.mjs')).href);
    const engine = loadEngine({ root, codec: TF2Opus }), A = engine.audio;
    globalThis.TF2Audio = A;   // reference.js finds its filters there, as on the page
    const spec = engine.CODEC_PROFILES.steam.senderGate;
    const render = await A.process({ sampleRate: source.rate, length: src.length, numberOfChannels: 1, getChannelData: () => src },
      { codec: 'steam', deviceRate: rate });
    report.info(`render: file 2 through the steam profile at its defaults, at ${rate} Hz; it keeps every sample, as the game does not`);
    let tracked;
    try {
      tracked = TF2Reference.track(x, rate, src, source.rate, {
        gate: { thresholdDb: spec.thresholdDb, prerollMs: spec.prerollMs, holdMs: spec.holdMs },
        reference: { samples: render.samples, rate, frames: render.codecInfo.frameLog, frameSeconds: (render.codecInfo.frameMs || 20) / 1000 }
      });
    } catch (error) {
      const text = String(error && error.message);
      if (/nothing loud enough/.test(text)) throw differs('file 2 has nothing loud enough for Steam\'s gate to send: is it the file that was played?');
      if (/not found|line up|at least 0\.4 s/.test(text)) throw differs('file 1 does not line up with the render of file 2: is file 2 the source that was played, and file 1 a recording of the game\'s output while it played, loud enough to hear?');
      throw error;
    }
    const seg = tracked.segments[0], windows = tracked.points;
    report.info(`lined up: ${fmt(tracked.segments.length)} pieces, ${fmt(windows)} one-second windows, correlation ${tracked.correlation.toFixed(2)}`);
    // track() falls back to the coarse placement's clock when its windows
    // span too little time to fit one: that clock is not measured.
    if (seg.b === 1 / tracked.coarse.scale) throw differs('the windows that line up span too little time to measure the clock: record more of the source, with the voice loud enough to hear over the game');
    if (windows < MIN_WINDOWS) throw differs(`only ${fmt(windows)} one-second windows line up, fewer than ${MIN_WINDOWS} (a choice of this check): record more of the source, with the voice loud enough to hear over the game`);
    const clock = Math.round(seg.clockPpm);
    let lo = RANGE[0], hi = RANGE[1], from;
    if (packets === null) from = 'the range of the record\'s plain takes (docs/ACCURACY.md)';
    else {
      const e = packets / VOICE_RATE * 1e6;
      lo = Math.round(e + WINDOW[0]); hi = Math.round(e + WINDOW[1]);
      from = `${packets} packets a second over 44100 is ${signed(Math.round(e))}, from 6 under to 13 over`;
    }
    const ok = report.figure(`clock: file 1 plays ${signed(clock)} parts in a million faster than the render, expected ${signed(lo)} to ${signed(hi)} (${from})`, clock >= lo && clock <= hi);
    if (!ok) {
      throw differs(packets === null
        ? `the clock ${signed(clock)} is outside the record's range: count the packets a second in the game's console (docs/REPRODUCE.md, "clock") and give them as --packets`
        : `the clock ${signed(clock)} is not about ${packets} packets a second over 44100`);
    }
  }
};
