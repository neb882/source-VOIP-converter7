# W2-04: rooms and talk-spurt re-timing in the streaming render

**Branch:** `claude/w2-04-stream-rooms-retime`, from `main` **after W2-02 has merged**. **Worktree:** given in the
brief. **Agent:** `tf-builder`, then `tf-reviewer`. May push its branch to run CI. **Time budget:** 1 day. May run
beside W2-03 (no shared files).

## Why

W2-02's `createRender` rejects a room (`dsp_room`, the custom room, listener positions with a room) and
`voice_retime`, so a long source with either gets a message instead of a render (W2-03). Both are sequential and can
stream exactly; they were left out to keep W2-02 to a day.

## Files

May touch: `audio.js` (`createRender` and helpers; `process()` and `runDspChain` unchanged), `tests/render-stream.verify.mjs`,
`tests/predictions/PREDICTIONS.md` (the hashed-file note only, if needed).

May not touch: `process()`'s body, `app/`, `audio-worker.js`, `meter.js`, `constants.js`, `docs/PROGRESS.json`.

## Spec

1. **Rooms.** Each processor in `runDspChain` (DFR, RVA, DLY, AMP, MDY) keeps its delay lines, filter states and its
   absolute sample counter (AMP's modulation and the modulated delays read `t` from the start) across chunks. RVA
   sums its combs into `out[t]` in comb order; streaming must add them in the same order for each sample (outer loop
   over samples, inner over combs gives the same order per sample). The room renders `min(4, 6) * rate` samples of
   tail after the input, mixes dry and wet with the same `norm`, and trims trailing samples under 0.0005 back to the
   input's end plus 150 ms: hold back the last 4 s of output until the input ends, then trim as `runDspChain` does.
   The listener position's low-pass (`water`) runs before the room as in `process()`.
2. **Re-timing.** `retimeSpurts` moves a spurt earlier by up to 350 ms into the silence before it, deciding spurt by
   spurt with its own seeded random sequence (drawn only for spurts after a gap of at most 0.45 s, and not after an
   early start). Stream it with a delay line of at least 350 ms at the codec rate after the codec and decoder EQ:
   a spurt's first frame is known before its samples leave the delay line, so the move can be applied as they pass;
   the frame log and packet sizes move with it. The draws must be the ones `process()` makes, in the same order.
3. With both, `createRender` accepts every option `process()` accepts, and the rejections are removed.

## Done means

- `node tests/render-stream.verify.mjs` passes, with equality to `process()` (W2-02's point 2: samples, WAV bytes,
  `codecInfo` including `retimed`) for: every room preset 1-29 on a 20 s source; the custom room at its extremes
  (duration 0.05 and 6 s, decay 0.5 and 8, mix 0 and 1); `water`; `voice_retime` with three seeds on the
  re-timing test source of tests/verify.js section 10c; a room with re-timing; chunk sizes 7, 12,345 and one second.
- `pnpm test` passes.
- Each new check fails when broken (AMP's counter restarted per chunk; the trim applied per chunk; one re-timing draw
  skipped); say how.
- CI passes on the pushed branch.
- W2-03's "settings limited to 10-minute sources" message is then obsolete: say so in the report so the
  orchestrator can schedule its removal (a one-line change in `app/render.js`, done directly or in W2-05).
