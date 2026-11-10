# W3-02: `voice_retime` runs the receiver's queue

**Branch:** `claude/w3-02-queue-retime`, from `main` **after W2-02 has merged and W3-03's report has been read
beside W3-01's** (see "Before it starts"). **Worktree:** given in the brief. **Agent:** `tf-builder`, then
`tf-reviewer`, then a second reader on the stronger model (it changes how a render is computed). May push its branch
to run CI. **Time budget:** 1 day.

## Why

`voice_retime 1` moves talk spurts by a flat rule: after a silence of up to 0.45 s a spurt starts early with
probability 0.41, never two in a row. W3-01 (`docs/reports/W3-01-phrase-timing.md`) measured what the game does
instead: the receiver appends a spurt to the voice it still has queued and restarts when the queue has run out. On
the owner's speech take the flat rule is wrong in kind (it cannot chain early starts; the take has two chains in
nine transitions), and the queue rule scores -9.7 against -20.0 on the held-out takes. The option stays an option
and the default stays the source's timeline.

## Before it starts

- W3-03 reads the receiver out of the owner's engine binary. The orchestrator compares its rule with the six rules
  of W3-01's "The rule as fitted" and writes any corrected constant into this order before the build. Three are
  fitted and may change: L0 (350 ms), the ceiling (L0), and the append condition at an empty queue.
- W2-04 streams the present rule. If it has not been built, its point 2 is rewritten to stream this one (a delay
  line of L0 is still enough: nothing moves by more than L0 and nothing moves later than the source). If it has,
  this order includes `createRender`.

## Files

May touch: `audio.js` (`RETIME`, `retimeSpurts`, a new pure `retimePlan`, and the gate only to expose which frames
were loud), `tests/verify.js` (section 10c), `tests/retiming.mjs` (to use `retimePlan`), `index.html` and
`app/console.js` (the option's title and help text only), `README.md` (the two `voice_retime` lines),
`tests/predictions/PREDICTIONS.md` (the hashed-file note: `audio.js` changes, default renders do not).

May not touch: anything a default render depends on, `constants.js`, `reference.js`, `tests/REFERENCE_2026.md` (the
orchestrator writes the finding), `docs/PROGRESS.json`.

## Spec

1. **Constants** (`RETIME` in `audio.js`, each with its source in a comment): `L0` 0.350 s; `silence` 0.0625 s;
   `hold` [0.425, 0.485] s and `preroll` [0.115, 0.152] s, Steam's ranges; the gate model's own hold and pre-roll
   read from where the gate has them, not repeated.
2. **`retimePlan(spurts, rand)`**, pure and exported on `TF2Audio`. `spurts` is the gate's talk spurts in order,
   each `{ start, end, pauses }` in seconds, `pauses` being the lengths of the runs of quiet frames inside the spurt
   that are longer than `hold[0]`, with the time each ends. It returns, for each spurt, a list of pieces
   `{ from, to, offset }` covering it, `offset` ≤ 0 in seconds (how much earlier than the source the piece plays).
   With `l` the queue, starting at `L0`:
   - between spurts: `g` = the silence + (model hold - a draw from `hold`) + (model pre-roll - a draw from
     `preroll`), not below 0; if `l + silence - g > 0` then `l = min(L0, l + silence - g)`, else `l = L0`;
   - at each pause inside a spurt, in order: draw `hold` and `preroll`; if the pause is longer than the hold drawn,
     a new piece starts at the pause's end with `l = min(L0, l + silence - max(0, pause - hold - preroll))`;
   - a piece's `offset` is `l - L0`.
   Draws are made in that order and only there, so a seed gives one plan.
3. **`retimeSpurts`** applies the plan as it applies moves now: each piece's decoded audio, frame log and packet
   sizes move earlier by its offset rounded to whole frames, into the silence before it; what a piece leaves behind
   is silence (frame code 0). A piece that moves less than one frame stays. It returns the moves as
   `{ time, shiftMs }`, one per piece that moved. No piece may overlap the one before it: by the rule an appended
   piece ends up at least 42 ms after it; assert it.
4. **Off by default**, seeded from `opts.seed` as now. With `retime` off, every render is bit for bit what it is on
   `main`.
5. **Words.** The option's title and help say what it does now: "TF2's receiver appends a phrase to the voice it
   still has queued, so phrases after short pauses start early until the queue runs out (measured; the queue's
   length is one PC's)". README likewise.
6. **`tests/retiming.mjs --generative`** calls `TF2Audio.retimePlan` and `RETIME` instead of its own copies
   (`arrive`, `arrivalGap`, `queueRun`, `GEN`), so the takes score the function the app runs.

Not in this order: the restart skips and the 0.04% playback speed of W3-01's section 3, a control for L0, any
change to the default.

## Done means

- `pnpm test` passes, with section 10c of `tests/verify.js` rewritten. Each of these is a check that fails when the
  named line is broken; say how you broke it:
  - `retimePlan` with a stub `rand` that always returns 0.5 (hold 455, pre-roll 133.5: `g` = silence - 28.5 ms), by
    hand: silences of 300, 160, 120 and 200 ms in a row give offsets -209, -278, -307 and 0 ms (the queue goes
    350, 141, 72, 43, then 43 + 62.5 - 171.5 is negative and the spurt restarts); a silence of 500 ms from a full
    queue gives 0; a silence of 20 ms from a full queue gives 0 (the ceiling); a pause of 500 ms inside a spurt at
    offset -209 gives a second piece at -146.5.
  - a chain: three early pieces in a row exist for some seed on a source with silences of 150 ms (the flat rule
    never gives two).
  - no early start after a silence of 0.6 s in 200 seeds; none later than the source ever.
  - a rendered source: the moved spurt's samples equal the unmoved render's samples at the shifted position
    (as 10c does now), the frame log moves with them, and the same seed gives the same samples.
  - `retime` off: the render's samples and `codecInfo` equal `main`'s for the 10c source (and W2-02's golden
    hashes, which are default renders, still pass).
- `node tests/retiming.mjs --accuracy <results.json> --generative --takes <folder>` (the orchestrator runs it; the
  takes are private) prints the tables of W3-01's section 2 to the digits shown, or, if the order of draws had to
  change, the new tables go in the build report with the held-out one-step scores within 0.5 of -9.7 and -20.0.
  Without `--generative` its output is unchanged.
- The browser suite passes (`voice_retime 1` in the console still renders; the option's text is the new one).
- CI passes on the pushed branch.
- The report says what a listener hears on the app's own demo speech with the option on, for three seeds: how many
  pieces moved, the largest move, the longest chain.
