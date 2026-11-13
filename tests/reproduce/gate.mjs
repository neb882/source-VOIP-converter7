// The check `gate` (docs/REPRODUCE.md, "gate"): Steam's sender gate, chunk by
// chunk. Steam judges each chunk of the capture whole: a chunk is sent when
// the mean of its absolute samples is at least 1.0% of 32767, or when one
// sample reaches 4915 (read; finding 28, with finding 5). With
// @voice_spew_activity_check 1 Steam's console prints one line a chunk with
// three marks (active, mean passed, peak passed), the chunk's length, mean,
// peak and count of high samples (measured, Set J; finding 27).
//
//   gate <Steam's console text>
//   gate <Steam's console text> <the 24 kHz WAV that mic_inputfile played>
//
// file 1 is the text copied out of Steam's console window, or Steam's own
// console_log.txt; steam-console.mjs reads it into numbers. The two limits
// are the app's (STEAM_SENDER.meanMin and peakMin of steam-sender.js), so
// the check tests the app's constants. With file 1 alone:
//   G1 the first mark is set exactly when the second or the third is;
//   G2 the third exactly when the count of high samples is above 0, and
//      exactly when the printed peak, as whole samples of 32768, is 4915 or
//      more (every peak has a three-decimal print of its own);
//   G3 on lines whose printed mean is not 1.00, the second exactly when the
//      printed mean is above 1.00 (a print of 1.00 lies on either side and is
//      counted apart).
// Lines of one sample (0.04 ms) are counted apart from all figures: the
// code's mean of one sample is 0 (read; one such line in Set J, measured).
//
// With file 2, every chunk after a `loaded` line whose N is file 2's count of
// samples is recomputed from the clip, as W3-14 did: the walk starts at the
// clip's first sample, moves on by each line's length (the printed
// milliseconds times 24, rounded) and wraps at the clip's end, up to the next
// `loaded` line, the console's answer to mic_inputfile or the typed command.
//   G4 the printed mean, peak and count are the clip's at that place: the
//      count equal, the mean and the peak within one unit of their last
//      printed digit (a choice of this check, for the print's rounding);
//   G5 the three marks are the rule's on the clip's own samples; a chunk
//      whose exact mean lies within a millionth of a percent of 1.0% is
//      counted apart (the code compares in 32-bit floats; read).
// When the text has no `loaded` line at all, the place in the clip is found
// by the first five chunk lines (more, while five fit several places, up to
// 200, a choice of this check).
//
// Expected (measured, Set J, finding 28): all 789 verdicts follow the rule;
// 788 of 789 lines carry the clip's numbers, the one other a chunk of one
// sample. A text with fewer than MIN_CHUNKS chunk lines (a choice of this
// check), or with no chunk on each side of 1.0%, cannot show the rule and is
// "differs". Nothing of the text is printed: the path that the loaded and
// looped lines, the typed command and the console's answer carry is never
// kept; file 2's checksum is compared, never printed.
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { cannot, differs, fmt, parseArgs, readBytes, readWav } from './common.mjs';
import { ConsoleError, readSteamConsole } from './steam-console.mjs';
import { steamClipWav } from './steam-clip.mjs';

const { STEAM_SENDER } = createRequire(import.meta.url)('../../steam-sender.js');
const MEAN_MIN = STEAM_SENDER.meanMin, PEAK_MIN = STEAM_SENDER.peakMin;
// The fewest chunk lines a text must hold: a choice of this check (about 3 s
// of chunks; the record's texts hold 590 to 2,706).
export const MIN_CHUNKS = 50;
const RATE = 24000;
const ONE_SAMPLE = 4;                                     // 0.04 ms, in hundredths
const MEAN_PRINT = Math.round(MEAN_MIN / 32767 * 10000);  // 1.00, in hundredths of a percent
const peakSamples = (max) => Math.round(max * 32768 / 100000);
const lengthOf = (c) => Math.round(c.ms * 24 / 100);      // the printed milliseconds times 24
const pct = (h, d = 2) => (h / 10 ** d).toFixed(d);
const plural = (n, one, more) => `${fmt(n)} ${n === 1 ? one : more}`;

// The rule on a stretch of samples: { sum, peak, high } of |x|.
function measure(clip, pos, len) {
  const n = clip.length;
  let sum = 0, peak = 0, high = 0;
  for (let i = 0; i < len; i++) {
    const a = Math.abs(clip[(pos + i) % n]);
    sum += a; if (a > peak) peak = a; if (a >= PEAK_MIN) high++;
  }
  return { sum, peak, high };
}
// Whether a line's printed numbers are the clip's (G4's tolerance).
function fits(c, len, m) {
  if (m.high !== c.high) return false;
  const mean = m.sum / len / 32767 * 100, peak = m.peak / 32768 * 100;
  return Math.abs(c.avg / 100 - mean) <= 0.01 + 1e-9 && Math.abs(c.max / 1000 - peak) <= 0.001 + 1e-9;
}

// The place in the clip where the chunk lines fit, by their first five (more
// while five fit several places, up to MAX_SEARCH): { at, used } or {
// places, used } when none or several fit. A line of one sample moves the
// place on by its length and rules no place out, as in the walk. Sums and
// counts by prefix over the clip twice; the peak only where they fit.
export const MAX_SEARCH = 200;   // a choice of this check
function search(lines, clip) {
  const n = clip.length, S = new Float64Array(2 * n + 1), H = new Int32Array(2 * n + 1);
  for (let i = 0; i < 2 * n; i++) { const a = Math.abs(clip[i % n]); S[i + 1] = S[i] + a; H[i + 1] = H[i] + (a >= PEAK_MIN ? 1 : 0); }
  let places = null, used = 0, offset = 0;
  for (const c of lines) {
    const len = lengthOf(c);
    const ok = (p) => {
      if (c.ms === ONE_SAMPLE || len === 0) return true;
      const at = (p + offset) % n, sum = S[at + len] - S[at], high = H[at + len] - H[at];
      if (high !== c.high || Math.abs(c.avg / 100 - (len ? sum / len / 32767 * 100 : 0)) > 0.01 + 1e-9) return false;
      return fits(c, len, measure(clip, at, len));
    };
    if (places === null) { places = []; for (let p = 0; p < n; p++) if (ok(p)) places.push(p); }
    else places = places.filter(ok);
    offset += len; used++;
    if ((used >= 5 && places.length <= 1) || used >= MAX_SEARCH) break;
  }
  return places && places.length === 1 ? { at: places[0], used } : { places: places ? places.length : 0, used };
}

export default {
  name: 'gate',
  summary: 'Steam\'s sender gate, chunk by chunk, from Steam\'s console text',
  usage: ['gate <Steam\'s console text>', 'gate <Steam\'s console text> <the 24 kHz WAV that mic_inputfile played>'],
  async run(args, report) {
    const { files } = parseArgs(args);
    if (files.length < 1 || files.length > 2) throw cannot('give Steam\'s console text, and if a file was the microphone, that file as file 2');
    let text;
    try {
      text = readSteamConsole(readBytes(files[0], 'file 1'));
    } catch (error) {
      if (error instanceof ConsoleError) throw differs(`file 1: ${error.message} (its text is not printed)`);
      throw error;
    }
    const { chunks, marks, counts } = text;
    report.line(`file 1: Steam's console text, ${plural(counts.lines, 'line', 'lines')}: ${plural(counts.chunks, 'chunk line', 'chunk lines')}${counts.stamped ? `, ${fmt(counts.stamped)} with a stamp` : ''}; loaded lines ${fmt(counts.loaded)}, looped lines ${fmt(counts.looped)}, mic_inputfile typed ${fmt(counts.typed)} and answered ${fmt(counts.answers)}; other lines ${fmt(counts.other)} (counted, not kept)`);
    if (!chunks.length) throw differs('file 1 holds no chunk lines: type @voice_spew_activity_check 1 in Steam\'s console before the press');
    if (chunks.length < MIN_CHUNKS) throw differs(`only ${plural(chunks.length, 'chunk line', 'chunk lines')}, fewer than ${MIN_CHUNKS} (a choice of this check): too few to show the rule; hold the key longer`);

    const bracket = (c) => `[${c.active ? '+' : ' '}${c.mean ? '+' : ' '}${c.peak ? '+' : ' '}]`;
    const brackets = new Map();
    for (const c of chunks) brackets.set(bracket(c), (brackets.get(bracket(c)) || 0) + 1);
    report.info(`brackets: ${['[+++]', '[++ ]', '[+ +]', '[   ]'].filter((b) => brackets.has(b)).map((b) => `${b} ${fmt(brackets.get(b))}`).concat([...brackets].filter(([b]) => !['[+++]', '[++ ]', '[+ +]', '[   ]'].includes(b)).map(([b, k]) => `${b} ${fmt(k)}`)).join(', ')}`);
    const lengths = new Map();
    for (const c of chunks) lengths.set(c.ms, (lengths.get(c.ms) || 0) + 1);
    const top = [...lengths].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    report.info(`chunk lengths, the six most frequent: ${top.slice(0, 6).map(([ms, k]) => `${pct(ms)} ms on ${fmt(k)}`).join(', ')}${top.length > 6 ? `; ${fmt(top.length - 6)} other lengths` : ''}`);
    const judged = chunks.filter((c) => c.ms !== ONE_SAMPLE), single = chunks.length - judged.length;
    const sides = judged.filter((c) => c.avg !== MEAN_PRINT), atLine = judged.length - sides.length;
    report.info(`lines of one sample (0.04 ms), counted apart from every figure: ${fmt(single)}; lines that print a mean of 1.00, counted apart from G3: ${fmt(atLine)}`);
    if (!sides.some((c) => c.mean) || !sides.some((c) => !c.mean)) {
      throw differs('no chunk on each side of 1.0%: the text cannot show the mean rule; play the clip, or speak and pause');
    }

    const g1 = judged.filter((c) => c.active === (c.mean || c.peak)).length;
    const ok1 = report.figure(`G1, the first mark set exactly when the second or the third is: ${fmt(g1)} of ${fmt(judged.length)}, expected all`, g1 === judged.length);
    const g2 = judged.filter((c) => c.peak === (c.high > 0) && c.peak === (peakSamples(c.max) >= PEAK_MIN)).length;
    const ok2 = report.figure(`G2, the third mark set exactly when a sample reached ${fmt(PEAK_MIN)} (the count above 0, the printed peak ${fmt(PEAK_MIN)} or more): ${fmt(g2)} of ${fmt(judged.length)}, expected all`, g2 === judged.length);
    const g3 = sides.filter((c) => c.mean === (c.avg > MEAN_PRINT)).length;
    const ok3 = report.figure(`G3, the second mark set exactly when the printed mean is above ${pct(MEAN_PRINT)}: ${fmt(g3)} of ${fmt(sides.length)}, expected all`, g3 === sides.length);
    const most = (list, f, pick) => (list.length ? list.reduce((a, c) => pick(f(a), f(c)) === f(c) ? c : a) : null);
    const failMean = most(judged.filter((c) => !c.mean), (c) => c.avg, Math.max), passMean = most(judged.filter((c) => c.mean), (c) => c.avg, Math.min);
    report.info(`the highest printed mean without the second mark: ${failMean ? pct(failMean.avg) : 'none'}; the lowest with it: ${passMean ? pct(passMean.avg) : 'none'}`);
    const failPeak = most(judged.filter((c) => !c.peak), (c) => c.max, Math.max), passPeak = most(judged.filter((c) => c.peak), (c) => c.max, Math.min);
    report.info(`the highest peak without the third mark: ${failPeak ? `${fmt(peakSamples(failPeak.max))} samples (${pct(failPeak.max, 3)})` : 'none'}; the lowest with it: ${passPeak ? `${fmt(peakSamples(passPeak.max))} samples (${pct(passPeak.max, 3)})` : 'none'}`);
    const byPeak = judged.filter((c) => c.peak && !c.mean).length;
    report.info(byPeak ? `chunks that passed by their peak alone: ${fmt(byPeak)}` : 'no chunk passed by its peak alone: the mean rule is all this text shows');

    let ok4 = true, ok5 = true;
    if (files.length === 2) [ok4, ok5] = withClip(files[1], chunks, marks, report);

    const failed = [[ok1, 'G1'], [ok2, 'G2'], [ok3, 'G3'], [ok4, 'G4'], [ok5, 'G5']].filter(([ok]) => !ok).map(([, g]) => g);
    if (failed.length) {
      throw differs(`${failed.join(', ')} ${failed.length === 1 ? 'does' : 'do'} not hold: Steam's verdicts or its printed numbers are not the rule's${ok4 ? '' : ' (for G4: is file 2 the file mic_inputfile played?)'}; if the steps were followed, the finding is wrong for your PC`);
    }
  }
};

// The walk through file 2, the clip; returns [G4 holds, G5 holds].
function withClip(file, chunks, marks, report) {
  const wav = readWav(file, 'file 2');
  if (wav.rate !== RATE || !wav.plain) {
    throw differs(`file 2 is not a 16-bit mono WAV at 24000 Hz with a plain 44-byte header (it is at ${wav.rate} Hz${wav.plain ? '' : ', with more than the plain header'}): Steam reads from byte 44 on as sound`);
  }
  const clip = wav.samples, n = clip.length;
  if (!n) throw differs('file 2 holds no samples');
  const generated = crypto.createHash('sha256').update(readBytes(file, 'file 2')).digest('hex') === crypto.createHash('sha256').update(steamClipWav()).digest('hex');
  report.line(`file 2: 24000 Hz, ${fmt(n)} samples, a plain 44-byte header; the generated steam_mic_24000.wav: ${generated ? 'yes' : 'no'}`);

  // The stretches of chunk lines, each ended by a loaded line, the answer or
  // the typed command; looped lines only counted.
  const ends = marks.filter((m) => m.kind !== 'looped');
  const stretches = [];
  for (let k = 0; k <= ends.length; k++) {
    const from = k ? ends[k - 1].at : 0, to = k < ends.length ? ends[k].at : chunks.length;
    stretches.push({ after: k ? ends[k - 1] : null, from, to });
  }
  let walked = stretches.filter((s) => s.after && s.after.kind === 'loaded' && s.after.samples === n).map((s) => ({ ...s, start: 0 }));
  if (!walked.length) {
    const loaded = marks.filter((m) => m.kind === 'loaded');
    if (loaded.length) throw differs(`file 1's loaded lines name ${[...new Set(loaded.map((m) => fmt(m.samples)))].join(', ')} samples and file 2 holds ${fmt(n)}: the text is not of that clip`);
    const first = stretches.find((s) => s.to - s.from >= 5);
    if (!first) throw differs('the text holds no loaded line and no five chunk lines in a row to place in file 2: it does not start before the file was loaded; set mic_inputfile to "" and back, or restart Steam, and press again');
    const found = search(chunks.slice(first.from, first.to), clip);
    if (found.at === undefined) {
      throw differs(found.places ? `the text holds no loaded line and does not say where in the clip it starts: its first ${found.used} chunk lines (at most ${MAX_SEARCH}, a choice of this check) still fit ${fmt(found.places)} places in file 2; set mic_inputfile to "" and back, or restart Steam, so that Steam prints the loaded line, and press again`
        : 'the text is not of that clip: no place in file 2 fits its printed numbers (or the text does not start after the file was loaded)');
    }
    report.info(`the text holds no loaded line: the place in file 2 was found by its first ${found.used} chunk lines, at sample ${fmt(found.at)}`);
    walked = [{ ...first, start: found.at }];
  }

  let lines = 0, single = 0, g4 = 0, near = 0, g5n = 0, g5 = 0, wraps = 0, looped = 0;
  let failMean = -Infinity, passMean = Infinity;
  for (const s of walked) {
    let pos = s.start;
    looped += marks.filter((m) => m.kind === 'looped' && m.at > s.from && m.at <= s.to).length;
    for (const c of chunks.slice(s.from, s.to)) {
      const len = lengthOf(c), m = measure(clip, pos, len);
      pos += len; wraps += Math.floor(pos / n); pos %= n;
      lines++;
      if (c.ms === ONE_SAMPLE || len === 0) { single++; continue; }
      if (fits(c, len, m)) g4++;
      const mean = m.sum / len / 32767 * 100;
      if (c.mean) passMean = Math.min(passMean, mean); else failMean = Math.max(failMean, mean);
      if (Math.abs(mean - 1) <= 1e-6) { near++; continue; }
      g5n++;
      const meanOn = m.sum * 100 >= Math.round(MEAN_MIN * 100) * len, peakOn = m.peak >= PEAK_MIN;
      if (c.mean === meanOn && c.peak === peakOn && c.active === (meanOn || peakOn)) g5++;
    }
  }
  if (!lines) throw differs('no chunk line follows the loaded line of file 2\'s length: hold the key after setting mic_inputfile');
  const judged = lines - single;
  report.info(`chunk lines walked through file 2: ${fmt(lines)}, of which ${fmt(single)} of one sample, counted apart; chunk lines not walked, judged by file 1's figures alone: ${fmt(chunks.length - lines)}`);
  const ok4 = report.figure(`G4, the printed mean, peak and count are the clip's (the mean within 0.01, the peak within 0.001, a choice of this check): ${fmt(g4)} of ${fmt(judged)}, expected all`, g4 === judged);
  const ok5 = report.figure(`G5, the three marks are the rule's on the clip's samples: ${fmt(g5)} of ${fmt(g5n)}, expected all`, g5 === g5n);
  report.info(`chunks within a millionth of a percent of 1.0%, counted apart from G5: ${fmt(near)}`);
  report.info(`the highest exact mean without the second mark: ${Number.isFinite(failMean) ? `${failMean.toFixed(4)}%` : 'none'}; the lowest with it: ${Number.isFinite(passMean) ? `${passMean.toFixed(4)}%` : 'none'} (the record's clip gave 0.9998% and 1.0315%, measured, finding 28)`);
  report.info(`passes through the clip that the walk made: ${fmt(wraps)}; looped lines in the walked text: ${fmt(looped)}`);
  return [ok4, ok5];
}
