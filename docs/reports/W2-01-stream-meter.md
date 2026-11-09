# W2-01 report: the meter measures a render a piece at a time

Branch `claude/w2-01-stream-meter`, from `main` at 084ba36, with `origin/main` (bded46b, W1-04) merged in before the
first push. Files changed: `meter.js`, `tests/meter.verify.mjs` and this report.

## Commits

- `Meter: an analyzer that takes a render a piece at a time`: `TF2Meter.createAnalyzer`, the shared stats tail, the
  loop for the loudness maxima, and the new checks [Meter 6] and [Meter 7].
- `Meter test: six hours of history need no argument limit`: the check that fails with the old `Math.max(...list)`.
- `Merge origin/main (W1-04) into claude/w2-01-stream-meter`.
- This report.

## What changed

### `TF2Meter.createAnalyzer(sampleRate)` → `{ push(samples), finish() }`

`push` takes a piece of any length (zero included); `finish()` returns the object `analyze()` returns, with the same
fields in the same order and the same `history`. After `finish()`, `push` and `finish` throw. The analyzer copies
what it needs, so the caller may reuse a piece's buffer once `push` returns (the test overwrites it with NaN). A rate
that does not round to a positive number throws a `RangeError` (`analyze()` returns garbage or throws there).

How each sum is kept in `analyze()`'s order (spec point 2):

- **Levels.** `peak`, `sum` and `sumSq` accumulate in sample order across pieces, with the same expressions.
- **K-weighting.** The two biquads run per sample with their four state values each kept across pieces; the
  expression is `analyze()`'s (`b0 * x + b1 * x1 + b2 * x2 - a0 * y1 - a1 * y2`), and the shelf's output feeds the
  high-pass as a double, as `analyze()`'s `Float64Array` holds it.
- **Segments.** The open segment's energy is summed from its first sample to its last wherever the pieces end;
  segment `s` ends at `Math.round((s + 1) * rate / 10)`, the same expression as `analyze()`'s, and segments are
  contiguous because the next one starts at that same value. `finish()` closes the segments that end at the last
  sample and then uses `Math.floor(n / (rate / 10))` of them, as `analyze()` counts them. The two counts differ only
  at a rate whose tenth has a fraction other than 0 or .5 (22,051 Hz in the test): there a whole last segment exists
  that `analyze()` leaves out.
- **True peak (point 3).** Every pair whose level, the larger of its two samples, reaches 0.4 of the sample peak so
  far (taken after the current piece's levels) is interpolated once its 16 following samples have arrived, from a
  32-sample ring buffer; the last 15 pairs are interpolated in `finish()` with only the taps before the end, which is
  what `truePeak`'s `j < n` test does. The taps run in `truePeak`'s order, so each value is the same double. A pair is
  kept as (level, largest magnitude of its three phases) unless another kept pair beats it on both, and it removes the
  pairs it beats on both. The sample peak counts as a pair (level and magnitude equal to the peak), so pairs whose
  magnitude does not rise above the peak so far are dropped when the peak grows. `finish()` returns the larger of the
  sample peak and the largest magnitude among kept pairs whose level reaches `peak * 0.4`.

  Why this is exact: the threshold so far, `peak_so_far * 0.4`, is never above the final one (rounding is monotonic),
  so every pair `truePeak` evaluates was evaluated here. The pair that sets `truePeak`'s result is either kept, or
  beaten on both by a kept pair (whose level then also passes the final threshold, so `truePeak` evaluated it too and
  its magnitude is no larger than the result), or beaten by the sample peak, which is part of the result anyway. Pairs
  evaluated here that `truePeak` skips are filtered out by their level. A pair involving NaN interpolates to NaN in
  both, which neither counts.

  On the speech-like signal the kept list never held more than 11 pairs (10 minutes, pieces of 1, 4096 and 48,000).
  The list has no bound in theory: a signal built so that each new pair has a lower level and a higher overshoot than
  the last would grow it. It holds two numbers per pair.

- **Memory (point 4).** Arrays that grow: the segment energies (one `Float64Array` value per 100 ms, doubled when
  full) and, in `finish()`, the history lists. Everything else is fixed: 9 doubles of filter and segment state, the
  32-sample ring and the kept pairs.

### `analyze()` (point 5)

It keeps its whole-signal code (the sample loop, `biquad`, the segment sums and `truePeak`), so the equality checks
compare the analyzer with an independent implementation. What follows the segment sums (the windows, gating, LRA,
maxima, history and dB conversions) moved unchanged into `report()`, which both call. `analyze()` on this branch was
compared with `analyze()` on main with `Object.is` on every field and history value for 50 noise signals (8, 11.025,
44.1, 48 and 96 kHz; 0 to 7.33 s) and the 60-minute signal below: no difference. Its speed is unchanged (6.9 s for
60 minutes on both).

### The maxima (point 6)

`max(momentary)` and `max(shortTerm)` fold `Math.max(m, v)` over the list. That is the same as `Math.max(...list)` by
the specification's own algorithm (NaN returns NaN; +0 beats -0), so the result is identical. Node 22 here spreads
125,000 arguments and fails at 200,000 (`RangeError: Maximum call stack size exceeded`), that is somewhere between a
3.5- and a 5.6-hour history.

### Speed: two V8 traps found on the way

The first version made about 100 bytes of garbage per sample and ran at about 100 ns a sample. V8 compiles a long
first piece while running inside its loop (on-stack replacement), and (1) code after the loop that had not run yet
(`if (peak > pruned)`) undid that compilation on every call, 299 times in 300 pushes, and (2) in that kind of compiled
loop, V8 kept boxing the variables that shift along the biquad delay line (`x2 = x1; x1 = x`) and the segment sum
that crosses a call. Each was found by bisecting a micro-benchmark with `--trace-gc` and `--trace-deopt`. The fix: the
two loops are functions of their own, and the filter state and the open segment's energy live in a `Float64Array`,
which stores doubles exactly, so no number changes. Garbage fell from 926 young-generation collections to 25 per
5 minutes of audio, and the analyzer now runs faster than `analyze()` (0.16 s against 0.24 s for 2 minutes of speech
at 48 kHz in 1 s pieces).

## Checks

| Check | Command | Result |
|---|---|---|
| Meter suite | `node tests/meter.verify.mjs` | `41 passed, 0 failed` (23 before; the 23 existing checks unchanged) |
| Node suites | `pnpm test` | exit 0 in 1 m 22 s; last lines `45 video checks passed`, `31 demo checks passed` |
| Browser suite | `flock /tmp/tf2ve-heavy.lock node tests/browser.verify.js` (with `CHROMIUM_EXECUTABLE`), after the merge of W1-04 | exit 0; last lines `48000 Hz browser: no page errors`, `170 browser checks passed` |
| CI | the `tests` workflow on the pushed branch | see [CI](#ci) at the end |

The meter suite's new lines, from the `pnpm test` run:

```
[Meter 6] The analyzer, a piece at a time, equals analyze()
  ok    the decoy: its level passes 0.4 of the quiet stretch's peak, not 0.4 of the final peak, and it reads above the true peak   [decoy -2.48 dBTP, true peak -3.01 dBTP, from the loud second]
  ok    the edge signals: their true peak, above 0 dBTP from samples at 0.5, is the burst's   [1.55 / 1.13 dBTP]
  ok    the odd rate: a whole segment that analyze() does not count
  ok    speech-like with pauses, 60 s at 48 kHz: equal in every split   [-34.33 LUFS, -16.47 dBTP, 597 values]
  ok    speech-like, 20 s at 11,025 Hz (100 ms is 1102.5 samples): equal in every split   [-34.61 LUFS, -15.90 dBTP, 197 values]
  ok    speech-like, 3.1 s at 22,051 Hz, cut at the end of a segment analyze() leaves out: equal in every split   [-34.22 LUFS, -19.64 dBTP, 27 values]
  ok    a full-scale 997 Hz sine: equal in every split   [-3.02 LUFS, 0.00 dBTP, 47 values]
  ok    a fs/4 sine at 45° at 44.1 kHz (true peak 3 dB above the samples): equal in every split   [0.27 LUFS, 0.00 dBTP, 7 values]
  ok    silence: equal in every split   [-Infinity LUFS, -Infinity dBTP, 47 values]
  ok    0.3 s (no integrated loudness): equal in every split   [null LUFS, -20.00 dBTP, 0 values]
  ok    2 s (no loudness range): equal in every split   [-31.94 LUFS, -18.18 dBTP, 17 values]
  ok    the loudest pair after a quieter stretch with a lower threshold: equal in every split   [-3.52 LUFS, -3.01 dBTP, 17 values]
  ok    the largest true peak 6 samples before a chunk edge: equal in every split   [-23.68 LUFS, 1.55 dBTP, 327 values]
  ok    the largest true peak 6 samples before the end: equal in every split   [-23.69 LUFS, 1.13 dBTP, 7 values]
  ok    no samples at all: equal in every split   [null LUFS, -Infinity dBTP, 0 values]
  ok    after finish() the analyzer is spent
  ok    six hours of history: the loudness maxima need no engine argument limit   [215997 values, maxima -32.83 / -41.58 LUFS]

[Meter 7] The analyzer's memory
  ok    60 minutes at 48 kHz in 1 s chunks: under 200 MB above the start (today's analyze: about 2.6 GB)   [14.0 MB peak (VmHWM), 35997 momentary values, 3.8 s]

41 passed, 0 failed
```

### [Meter 6]: equal, not close

Each signal is measured by `analyze()` whole and by the analyzer in six splits: pieces of 1, 7, 4096 and 48,000
samples, an uneven cycle (`1, 0, 2, 15, 16, 17, 31, 32, 33, 0, 4095, 777, 12345, 3, 48001, 5, 30627`, 2 s at 48 kHz,
empty pieces included, pushed through one buffer that is filled with NaN after each push), and one piece. The
comparison walks the result: same field names in the same order, `Object.is` on every value (so `-Infinity`, `null`,
NaN and `-0` count), and the history arrays' type, length and every element.

The signals the order lists, and where each is:

- speech-like with pauses, a minute at 48 kHz: a voice with 8 harmonics and a syllable envelope in spurts of 0.5-6 s
  with pauses of 0.1-4 s over a -72 dBFS floor (seeded);
- a full-scale sine (997 Hz, 5 s);
- silence (5 s of zeros);
- shorter than 0.4 s (0.3 s) and shorter than 3 s (2 s of speech);
- the loudest pair after a quieter stretch that set a lower threshold: 1 s whose samples peak at 0.45 and which holds
  a decoy pair of level 0.195 built to interpolate to 0.75 (the signs of the half-sample interpolator's taps), then
  1 s of a fs/4 sine at 45° whose samples peak at 0.5 and whose true peak, 0.71 (-3.01 dBTP), is the file's. The decoy
  passes the earlier threshold (0.18) and not the final one (0.2), so `analyze()` never evaluates it, and an analyzer
  without the final level filter reads it (-2.48 dBTP). The premise is checked in its own line;
- the largest true peak within 16 samples of a chunk edge: an overshoot burst whose top pair sits 6 samples before
  1,536,000 (32 s), an edge of every split but the single piece, so the pair's following samples come in the next
  piece; and a second burst 6 samples before the end of its signal, an edge of every split, evaluated in `finish()`.

Added beyond the list: speech at 11,025 Hz (100 ms is 1102.5 samples, so the segment edges round), speech cut where
22,051 Hz makes a whole segment that `analyze()` does not count, a fs/4 sine at 45° at 44.1 kHz, and an empty signal.

### [Meter 7]: memory

The test starts itself again as a child process (`--memory 60 200`) with `--max-old-space-size=256` and a 240 s time
limit. The child makes each 1 s piece in one reused buffer from a minute of speech at a level that drifts up over the
hour (so the true peak keeps meeting new pairs), pushes it, and samples its resident memory after each push; past the
200 MB limit it stops at once and reports how far it got, so a broken analyzer cannot take the machine's memory.
After `finish()` it reports its peak above its own start.

The peak is read from `/proc/self/status`'s `VmHWM`, falling back to `process.resourceUsage().maxRSS` where `/proc`
does not exist. The order said `maxRSS`, but Linux keeps `ru_maxrss` across `exec`, so a spawned child's `maxRSS`
already holds its parent's resident memory at the fork: inside the suite the child read 35-59 MB that way, against
11-15 MB run on its own. `VmHWM` belongs to the new program and read 13-15 MB in the suite. On a system without
`/proc` the fallback over-reads by the parent's memory, which errs towards failing, not passing.

The 200 MB bound is the order's, kept for the full 60 minutes because the run takes 3.6-3.9 s here. A correct run
peaks at 11-15 MB; keeping a copy of each piece fails after about 1,070 s of signal (B10 below). The child's time is
reported but not bounded, except by the 240 s limit.

**Time added to `pnpm test`:** `node tests/meter.verify.mjs` takes 14.9 s on this branch against 2.9 s on main
(+12 s): about 6 s for the equality checks, 2 s for the six-hour history, 4 s for the memory run.

## 60 minutes, next to today's

The W1-03 planner's own signal (its `speechLike(3600, 48000, 9)`, the one behind the 3.4 GB / 88 s line; its
integrated loudness, -33.368385746996246 LUFS, is the same to the last digit), one process, one phase at a time,
under the heavy lock, the peak of each phase read as `VmHWM` reset before the phase (`/proc/self/clear_refs`):

| Run | Loaded with | Time | Peak above the 659 MB signal |
|---|---|---|---|
| main's `analyze()` | `require` | 6.9 s | 2,650 MB |
| main's `analyze()` | `vm.runInContext` (as the planner's `measure.mjs`) | 87.0 s | 2,642 MB |
| this branch's `analyze()` | `require` / `vm` | 6.9 s / 86.4 s | 2,639 / 2,642 MB |
| the analyzer, 1 s pieces | `require` | 2.9 s | 10.1 MB |
| the analyzer, 1 s pieces | `vm` | 84.4 s | 5.2 MB |

A separate run of the same signal (`require`): the analyzer 2.8 s and 13.6 MB above the signal, peak RSS 726 MB for
the whole process at that point; `analyze()` 6.8 s and 3,366 MB peak; the two results equal on every field and
history value with `Object.is`.

So the memory claim stands (2.6 GB above the signal today, 10-14 MB with the analyzer, under the 200 MB the order
asks), but **today's 88 s was the loader, not the meter**: through `vm.runInContext` (a sandbox whose global object
is a plain `{ window: {} }`), the globals the meter reads per sample (`Math`) are looked up through the sandbox, and
both the old and the new code run about 12x slower. Checked on a minute of the same signal: main's `analyze()` takes
1.51 s in the sandbox and 0.15 s through `require`; with `Math` and the typed-array constructors bound as constants
inside its function it takes 0.17 s in the sandbox. Loaded as the page and the worker load it, `analyze()` takes
6.9 s for an hour and the analyzer 2.9 s.

## New checks, and how each was shown to bite

Each break was made in a scratch copy of `meter.js` next to a copy of the final `tests/meter.verify.mjs`, which was
then run whole. The first failing check:

| Break | Failed |
|---|---|
| B1. The biquad state reset at the start of each piece | speech-like 60 s, pieces of 1: `stats.integrated: -30.27, not -34.33` |
| B2. True peak over all pairs above the running threshold, without the final level filter | the decoy signal, pieces of 1: `stats.truePeak: -2.48, not -3.01` |
| B3. A segment's energy restarted at each piece | speech-like 60 s, pieces of 1: `stats.integrated: -Infinity, not -34.33` |
| B4. `finish()` skips the last 15 pairs | the end burst, pieces of 1: `stats.truePeak: -3.38, not 1.13` |
| B5. The last pairs read the ring's old samples instead of stopping at the end | the end burst, pieces of 1: `stats.truePeak: 1.134286591647348, not 1.1339631677988078` |
| B6. A pair interpolated with 15 following samples instead of 16 | speech-like 60 s, pieces of 1: `stats.truePeak: -16.46844571649335, not -16.468876501386802` |
| B7. A pair dropped when another beats it on either measure, not both | speech at 11,025 Hz, pieces of 1: `stats.truePeak: -16.05, not -15.90` |
| B8. Segments counted as closed instead of by `analyze()`'s formula | speech at 22,051 Hz, pieces of 1: `stats.lra: 0.0416, not 0` |
| B9. The tail read back from the caller's last piece instead of the analyzer's copy | the end burst, uneven pieces (NaN-filled buffer): `stats.truePeak: -3.38, not 1.13` |
| B10. A copy of each piece kept | the memory run: `200 MB after 1066 s of the signal; stopped` |
| B11. No pruning of kept pairs when the sample peak grows | nothing fails, as expected: it changes no result, only the list's length |
| B12. `Math.max(...list)` back in `report()` | the six-hour history: `RangeError: Maximum call stack size exceeded` |

B1, B2 and B3 are the three the order names. The breaking script and each run's output are in the scratch folder
(`agents/w2-01/break/`).

## Scan

`git diff origin/main...HEAD` (with this report staged) and `git log origin/main..HEAD --format=%B` were searched,
case-insensitively, for model and vendor names, `/home/`, `/tmp/` and `/root` paths, `steam_id`, SteamID-shaped
numbers, e-mail addresses, `.wav` and `.dem` file names and the owner's account name. The hits were the branch name
(the repository's branch convention, as in PROGRESS), the shared lock's path that PIPELINE.md documents, this
paragraph, and the required trailer lines. No recordings, personal details, SteamIDs or model names. The tests make
their own signals; no file outside the three named was changed.

## Not done, uncertain, decided on my own

- **Not wired in.** Nothing calls `createAnalyzer` yet (W2-03). `audio-worker.js`, `app/meter.js`, `batch.js` and the
  browser check still call `analyze()`, whose numbers are unchanged.
- **README's test list** (the `tests/meter.verify.mjs` entry) does not mention the new checks; README.md was outside
  this order's files. Suggested line: "the analyzer that takes a render in pieces equals `analyze()` exactly in every
  split, and holds 60 minutes in under 200 MB".
- **`maxRSS` replaced by `VmHWM`** in the memory check, for the reason above. This departs from the order's wording.
- **Shared tail.** `analyze()` and the analyzer share `report()`; the order allowed either keeping `analyze()` or
  rebuilding it on the analyzer. A change inside `report()` would move both and the equality checks would not see it;
  the 23 existing checks pin those numbers to within their tolerances.
- **The kept-pair list is short in practice, not bounded** (11 pairs at most on 10 minutes of speech).
- **Subnormal numbers (seen, not changed).** After a click followed by exact digital zeros, the K-weighting's decaying
  tail sits in subnormal doubles, which this machine computes about 9x slower (6 hours at 4 kHz: 9.1 s against 1.0 s
  over a -80 dB noise floor). `analyze()` does the same arithmetic, so this is today's behaviour too; flushing them
  would change numbers, which this order forbids. Whether renders end their talk spurts in exact zeros long enough
  for this to matter was not checked.
- **Other inputs.** `push` with a `Float64Array` or a plain array should equal `analyze()` on the same type (the
  analyzer keeps doubles), but only `Float32Array` was tested.
- The vm-context slowdown means anything else measured through `vm.runInContext` in the W1-03 plan (renders through
  `audio.js` were loaded that way too, at 6x real time) may also read slower than the page runs; not checked beyond
  the meter.

## CI

Run 42721246456 of the `tests` workflow on head f6a7ddf (the report's first commit, after the merge of main):
**success**, 23:32:21 to 23:34:51 UTC, `pnpm test:all` (vendor check, Node suites, browser suite). From its log:

```
  ok    speech-like with pauses, 60 s at 48 kHz: equal in every split   [-34.33 LUFS, -16.47 dBTP, 597 values]
  ok    six hours of history: the loudness maxima need no engine argument limit   [215997 values, maxima -32.83 / -41.58 LUFS]
[Meter 7] The analyzer's memory
  ok    60 minutes at 48 kHz in 1 s chunks: under 200 MB above the start (today's analyze: about 2.6 GB)   [10.9 MB peak (VmHWM), 35997 momentary values, 3.8 s]
41 passed, 0 failed
170 browser checks passed
```

The meter file ran from 23:34:01 to 23:34:15 on the runner, about as long as here. The commit that adds this section
changes only the report.
