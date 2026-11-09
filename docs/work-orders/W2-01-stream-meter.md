# W2-01: the meter measures a render a piece at a time

**Branch:** `claude/w2-01-stream-meter`, from `main`. **Worktree:** given in the brief. **Agent:** `tf-builder`, then
`tf-reviewer`. May push its branch to run CI. **Time budget:** 4 hours. **May start now:** its files overlap no W1
order and no other W2 order.

Part of the long-renders plan (`docs/reports/W1-03-long-renders-plan.md`). Read that report's measurements first.

## Why

`TF2Meter.analyze` runs the K-weighting as two whole-length `Float64Array`s, so measuring a render costs four
float-sized copies of it on top of the render itself (measured: +4.0 source-sized float buffers for 10 and 60
minutes at 48 kHz; 3.4 GB peak for a 60-minute signal in Node). It runs in the render worker after every render and
in a second worker for the dry source, so for a long file it is as large as the render itself. A long render (W2-03)
needs the meter to take the render in pieces, as they come out of the stream, and give exactly the numbers it gives
today.

## Files

May touch: `meter.js`, `tests/meter.verify.mjs`.

May not touch: `audio.js`, `constants.js`, `opus-codec.mjs`, `sw.js` (W1-01 is changing them), `audio-worker.js`,
`app/`, `package.json`, `README.md`, `docs/PROGRESS.json`.

## Spec

1. **`TF2Meter.createAnalyzer(sampleRate)`** returns `{ push(samples), finish() }`. `push` takes a `Float32Array`
   chunk of any length (zero included); `finish()` returns the stats object `analyze` returns today, with the same
   fields and the same `history`. After `finish` the analyzer is spent.
2. **Equal, not close.** For any split of a signal into chunks, `finish()` equals `analyze(whole, rate)` field by
   field with `Object.is` (so `-Infinity`, `null` and `-0` count), and `history.momentary` and `history.shortTerm`
   element by element. This holds if every sum runs in the same order as today: the K-weighting biquads keep their
   four state values across chunks; a 100 ms segment's energy is summed from its first sample to its last, wherever
   the chunk edges fall (segment `s` covers `round(s * rate / 10)` to `round((s + 1) * rate / 10)`); `peak`, `sum`
   and `sumSq` accumulate in sample order.
3. **True peak is the hard part.** Today the 4x interpolation runs only on sample pairs where `x[i]` or `x[i + 1]`
   reaches 0.4 of the file's sample peak, and that peak is known only at the end. Evaluate every pair that reaches
   0.4 of the peak so far (a superset), keep for each evaluated pair its level `max(|x[i]|, |x[i + 1]|)` and its
   largest interpolated magnitude, and keep only the pairs no other pair beats on both (a short list). In `finish`,
   the true peak is the larger of the sample peak and the largest magnitude among kept pairs whose level is at least
   `0.4 * peak`, which is exactly the set `truePeak` evaluates. The interpolator reads 15 samples before the pair and
   16 after, so keep that history across chunks and evaluate a pair once its 16 following samples have arrived (the
   last pairs in `finish`, with the zeros `truePeak` assumes past the end).
4. **Memory.** No array whose length grows with the signal, apart from one value per 100 ms segment and the history
   lists (36,000 values an hour). A 60-minute signal at 48 kHz pushed in 1 s chunks must stay under 200 MB above the
   signal itself (measure with `process.resourceUsage().maxRSS`; today it is about 2.6 GB above).
5. **`analyze` stays.** Re-implement it as `createAnalyzer` + one `push` + `finish`, or leave it as it is; either way
   the checks in point 2 compare the two, so a drift shows.
6. `max(momentary)` and `max(shortTerm)` spread the list into `Math.max`; an hour gives 36,000 arguments and two
   hours 72,000. That works in Node 22 (measured) but the limit is engine-specific: take the maximum with a loop. The
   result is identical.

Not in this order: wiring the analyzer into the worker or the page (W2-03), selection statistics, any change to the
measures themselves.

## Done means

Each with its command.

- `node tests/meter.verify.mjs` passes, with new checks:
  - equality as in point 2 for at least: a speech-like signal with pauses (a minute at 48 kHz), a full-scale sine,
    silence, a signal shorter than 0.4 s, one shorter than 3 s, one whose loudest pair comes after a quieter stretch
    that set an earlier, lower threshold, and one whose largest true peak sits within 16 samples of a chunk edge;
    each split into chunks of 1, 7, 4096 and 48,000 samples, an uneven mix of sizes, and one chunk
  - the memory bound of point 4 (it may run as a separate script the test starts, with `--max-old-space-size` and
    a timeout)
- `pnpm test` passes.
- Each new check fails when the code it covers is broken; at least: the biquad state reset at each chunk; the true
  peak taken over pairs above the running threshold without the final filter; a segment's energy restarted at a
  chunk edge. Say in the report how each was broken and what failed.
- CI passes on the pushed branch.
- The report gives the 60-minute memory and time next to today's (`analyze`: 3.4 GB peak RSS, 88 s in Node on this
  machine).

## Found while measuring (not fixed here)

Things in the repository that disagree with README.md, PROGRESS or the tests, found by the W1-03 planner:

- `docs/PROGRESS.json` (retired rule "Sources are cut at 10 minutes") says a 1 GB video is allowed "but only 10
  minutes of [it] rendered". The code refuses any audio or video file whose decoded length is over 10 minutes
  (`app/source.js`, `loadSourceFromArrayBuffer` and `mountSource`); only a demo is cut to its first 10 minutes.
- README's limits sentence ("100 MB (1 GB for video) and 10 minutes per file") does not mention demos, which have
  their own 512 MB limit and are cut rather than refused.
- README says the live chain's loss model equals the render's, and tests/verify.js section 10b checks
  `streamLossMask` against `buildLossMask` frame for frame. In the live chain, though, the mask is drawn only for
  frames the gate sends (`codecFrame` in `createLiveChain`), while a render draws it for every frame, gated ones
  included, so with the gate on the two lose different frames for the same seed. Not a defect in either, but the
  check does not cover the chain as it runs.
