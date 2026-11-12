# W1-03: a plan for renders longer than 10 minutes

> **Status 2026-11-12: done (plan)** at `32ef7f6`: it wrote W2-01 to W2-06. Report: `docs/reports/W1-03-long-renders-plan.md`.

**Branch:** `claude/w1-03-long-renders-plan`, from `main`. **Worktree:** given in the brief. **Agent:** a planner (a
fresh agent that reads only the repository). It writes work orders; it builds nothing. **Time budget:** 90 minutes.

## Why

Every source is cut at 10 minutes (`MAX_AUDIO_SECONDS` in `app/core.js`; 5 minutes for a recording), a limit from
the app's first version. It now contradicts the features around it: a video may be 1 GB but only 10 minutes of it
render, and a demo of a whole match keeps one speaker's first 10 minutes. The rule is retired
(`docs/PROGRESS.json`, `retired_rules`); what replaces it has to be planned, because it changes how renders are
computed and held in memory.

## What the plan must settle

Write the plan as work orders in `docs/work-orders/` (named `W2-01-…`, `W2-02-…`), each in the form of
`W1-01-speex.md`: why, files, spec, done means, time budget. Before writing them, measure; put the measurements in
the orders.

1. **Where the limit really is.** For a source of 10, 30, 60 and 120 minutes, what each stage holds in memory and
   how long it takes: decoding (`decodeAudioData` gives the whole file as float samples at the audio device's rate),
   `TF2Audio.process` and its worker (how many whole-length buffers exist at once), the WAV blob, the dry copy for
   A/B, the visualizer and its decimated copies, the meter, FLAC and MP3 export, the video remux, the real-take
   alignment, the batch queue, the demo decode. Measure in Node where the code runs there (`tests/verify.js` shows
   how the engine is loaded) and reason from the code where it needs a browser.
2. **What changes, in what order.** Candidates to weigh, not a list to accept:
   - rendering in pieces: the live chain's streaming stages already equal the offline ones sample for sample
     (`tests/verify.js`, section 10b), and each talk spurt starts a fresh encoder and decoder, so a long render
     might be cut where the gate is closed;
   - holding renders as 16-bit samples instead of float;
   - decoding without `decodeAudioData` for the formats the repository already parses (WAV, the audio track of an
     MP4 through WebCodecs), and what remains for the rest;
   - a demo's voice past 10 minutes, where decoding is already per talk spurt;
   - what the visualizer, the meter and the A/B players need so that a long file does not freeze the page.
3. **What must not change.** A render of a source up to 10 minutes gives exactly the samples it gives today (the
   tests and the registered predictions depend on it; CLAUDE.md). Say how each order proves that.
4. **The new limits.** Propose them per source type (audio file, video, demo, recording), with the measured reason
   for each, and what the page says when a file is over them.
5. **The order of work,** which orders can run side by side (their files must not overlap), and what would make you
   stop and ask the owner.

Also add, at the end of the first order's file, a short list of anything you found in the repository that
contradicts README.md or the tests while measuring. Do not fix it.

## Done means

- The work orders are committed on the plan branch and pushed.
- A report in `docs/reports/W1-03-long-renders-plan.md` with the measurements (a table), how each was taken, and
  what was not measured.
- No code outside `docs/` is changed.
