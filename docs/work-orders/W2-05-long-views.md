# W2-05: the visualizer stays quick on long files

**Branch:** `claude/w2-05-long-views`, from `main` **after W2-03 has merged** (and W1-01, which edits
`tests/browser.verify.js`). **Worktree:** given in the brief. **Agent:** `tf-builder`, then `tf-reviewer`. May push
its branch to run CI. **Time budget:** 1 day. May run beside W2-04 and W2-06.

## Why

Reasoned from the code, not measured in a browser: WAVE at FIT scans every sample of the audible version on the main
thread for each redraw (86 million samples for 30 minutes at 48 kHz), and SPEC's tiers decimate the whole signal by
2, 4, ... 64 (`decimated()` in `app/visualizer.js`), which adds about one more copy of each version viewed (wet and
dry) and is computed before the first long-file spectrogram appears. The meter's selection statistics copy the
selection and analyse it in a worker (W2-01 makes that cheaper). AVG is already bounded (at most 1,500 windows).

## Files

May touch: `app/visualizer.js`, `app/meter.js` (selection statistics only), `tests/browser.verify.js` (new checks).

May not touch: `audio.js`, `meter.js`, `audio-worker.js`, `app/render.js`, `app/source.js`, `docs/PROGRESS.json`.

## Spec

1. **An overview for WAVE.** Per sample array (keyed as `bufferId` keys its images), a min/max/sum-of-squares
   summary per 256 samples and per 4,096 samples, built in slices with `yieldToUi` like `halve()`; columns wider than
   256 samples read the summary instead of the samples. A column then shows the same peak and RMS as now for
   columns that cover whole summary blocks; columns that cut a block read the samples at their edges, so the
   picture does not change at any zoom (the browser test compares the pixels with and without the summary).
2. **SPEC reads only what it shows.** Decimate the visible range plus the filter's margin (`halve()` already works
   in blocks with a 64-sample margin), cached per range, instead of the whole signal. A decimated sample must equal
   the one the whole-signal decimation gives (block offsets on even input indices, as `halve()` aligns them).
3. **Budget.** For a 30-minute render at 48 kHz, FIT in WAVE and in SPEC paints within 500 ms after the overview is
   built, and the overview takes under 2 s, in the browser suite's Chromium on CI. Inject the render as a synthetic
   `Float32Array` (the visualizer's own state), not by rendering 30 minutes.

## Done means

- The browser suite passes, with: the pixel comparison of point 1 at FIT, at a 1 s span and at a sample-level zoom;
  the equality of point 2 for a range in the middle of a long file; the timings of point 3 logged and checked.
- Each new check fails when broken (summary used for a column that cuts a block; decimation offset by one input
  sample); say how.
- CI passes on the pushed branch.
