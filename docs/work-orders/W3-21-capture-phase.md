# W3-21: the phase of Steam's capture steps against the sound

**Status 2026-11-13: being built** (the builder stopped once with two questions; the rulings are at the end). Written by the orchestrator from the investigation of 2026-11-13
([the report](../reports/W3-02c2-render-channel.md), "The investigation that followed").

**Kind:** a change to how a `steam` render is computed. **Roles:** `tf-builder` (effort high), then `tf-reviewer`
and a second reader on the stronger model (`docs/PIPELINE.md`: an order that changes how renders are computed).
**Branch:** `claude/w3-21-capture-phase`, from `main`. **Worktree:** in the brief.
**Report:** `docs/reports/W3-21-capture-phase.md`. **Budget:** 6 hours.

## Why

Steam captures the microphone in steps of 750 samples at 24 kHz (31.25 ms) and its capture runs free of whatever
is played into it (read; the record's findings on Steam's sender and the W3-16 report). `steam-sender.js` cuts its steps from the render's first sample:
step j is samples 750 j to 750 j + 749 of the source. The project's test signals have every edge on a multiple of
31.25 ms, so in a render each burst's edge falls on a step's edge, which in a real session happens only by chance.

Measured on 2026-11-13 against the packets of Set D's session (private; numbers only): at the eight 1 s bursts
before the signal's 440 ms pauses Steam sent 79.63 frames a phrase in the mean and the model sends 78.45; the gap
from a phrase's last sound packet to the next phrase's first is 37.5 ticks in the session and 39.67 in the model.
With the source moved 318 samples against the steps the model gives 79.82 and 37.86. That one step is the margin
by which a render that runs the game's queue restarts the channel at such a pause where the game more often did
not (45% of such pauses keep the channel with a phase, 20% without; the take kept 4 of 6).

The clock already draws the capture's phase: `c0`, 0 to 31.25 ms, the time by which a step is ready after its
end. It is used as a delay only. This order makes it the phase of the steps against the sound as well.

## The rule

Let `c0` be the clock's draw as today, and `lead = (750 - round(c0 x 24000)) mod 750`, a whole number of samples
from 0 to 749.

1. **The steps.** The sender takes `lead` samples of silence before the source's first sample. Step j is then
   samples 750 j - lead to 750 j - lead + 749 of the source, with silence where that is before the source. In
   the source's time the steps' edges lie `c0` after the multiples of 31.25 ms (to the rounding of one sample).
2. **The times.** Every time the sender takes from a read for anything that is counted from the render's start
   (`since`: the arrival ticks, and whatever else uses it) is the read's less `lead / 24000` seconds. A step is
   then ready `c0` plus its lateness after its last sample, as today, so the measured arrival figure (50.5 ms,
   `ARRIVAL_SECONDS` in `voice-channel.js`) is expected not to move. Steam's own clock (`time`, which with the
   uptime sets the float's grid for the hold) is not shifted.
3. **The positions.** Everything the sender reports in samples of its input (`info().spurts[].start`, and any
   position a caller uses to place a frame in the source) is in samples of the source: the sender's own count
   less `lead`. A spurt may then begin up to `lead` samples before the source's first sample; what lies before
   the source is silence, and the render, the stream render and the live chain place it so.
4. **The clock is not changed.** `createClock` draws what it draws today in the same order (`CLOCK_HASH` and
   `REF_READS` in `tests/steam-sender.verify.mjs` do not move). It gains one read-only property, `lead`.
5. **A caller's clock.** With `opts.clock` the lead is `opts.lead` (a whole number from 0 to 749, default 0; a
   `RangeError` otherwise), so every test that feeds its own reads gives what it gave. `opts.lead` with the seeded
   clock overrides the draw (the tests and a later take's known phase need it).
6. `info()` gains `lead`.

Nothing else of the sender changes: the gate, the hold, the pre-roll, the read clock, the relay, the tick rule.
`voice-channel.js` is not touched.

## Files

May touch: `steam-sender.js`; `engine/render.js`, `engine/render-stream.js` and `engine/live-chain.js` only where
they take a position or a time from the sender; `tests/steam-sender.verify.mjs`; the suites whose recorded values
for a seeded `steam` render move (below); `tests/REFERENCE_2026.md` (added lines under the finding that holds the sender's clock: the rule, the
measurement above with its standing, marked with the order's name and date); `tests/predictions/PREDICTIONS.md`
(the note `tests/accuracy.mjs` asks for when a file of `MODEL_FILES` changes); `README.md` and `docs/ACCURACY.md`
(the sentence each has on the sender's clock, if it has one); the report. `sw.js`: the list only if a file is
added (none should be); never the number.

May not touch: `voice-channel.js`, any codec module, `constants.js`, any file under `app/`, `docs/PROGRESS.json`,
`docs/PROGRESS-LOG.md`, `CLAUDE.md`.

## Recorded values

This order moves recorded values, and only these, each for the reason "the capture's steps now have the clock's
phase": every recorded hash or reference of a **seeded `steam` render or sender run** (`REF_MESSAGES` in
`tests/steam-sender.verify.mjs`; `GOLDEN` and `GAIN_GOLDEN` rows for `steam` in `tests/render-stream.verify.mjs`;
the `steam` rows of `tests/stages.verify.mjs`, `tests/steam.verify.js` and `tests/render-channel.verify.mjs`; the
seed-7 fixture of `tests/voicequeue/synthetic-results.mjs`; what `tests/retiming.mjs --engine` pins, if anything).
The report lists each with its old and new value. **Before pinning a new value, show that the old value comes
back with `lead: 0` forced** (a temporary run, not a committed switch): that is the proof that nothing but the
phase moved. Stop and report if any of these moves:

- a recorded value of another profile, or of `steam` with the gate off or with a caller's clock;
- `CLOCK_HASH` or `REF_READS`;
- the live chain's equality with the render (the suites that hold it must pass unchanged in what they assert);
- `ARRIVAL_MS` in `tests/voice-channel.verify.mjs` as that suite measures it. If the suite's own measurement of
  the arrival moves by more than 0.5 ms, stop: the rule's point 2 is then wrong and the order is planned again.

## Done means

1. `node tests/run.mjs steam-sender` passes with new checks, each of which fails when the code it covers is
   broken:
   - `createClock({ seed }).lead` is `(750 - round(c0 x 24000)) mod 750` for 1,000 seeds, by a second
     computation in the test; it is spread over 0 to 749 (no value missing over 100,000 seeds, or a stated bound).
   - With `lead` forced to L, the messages are those of `lead: 0` on the same source with L zeros put before it,
     their positions less L and their ticks as rule 2 gives, for L of 0, 1, 318 and 749 and three seeds.
   - A tone burst of exactly 1.000 s that begins on a multiple of 31.25 ms, after 2 s of silence: over 200 seeds
     the count of 750-sample steps that hold any of the burst is 33 in at least 85% of seeds, and 32 in every
     seed with `lead: 0`. The frames sent for the burst rise by the same step in the mean; the report gives both
     means.
   - `opts.lead` refuses -1, 750, 1.5, NaN and a string.
2. A render's sound is not moved: for 20 seeds, the lag of the default render against its source (by the
   suite's own correlation, at the mix point) is what it is on `main`, to the sample, and so is the stream
   render's and the live chain's.
3. `flock /tmp/tf2ve-heavy.lock pnpm test` and the browser suite pass. `node tests/cache-number.mjs origin/main
   --report` says the number must rise (a cached file changed); its line is in the report.
4. `git diff origin/main --stat` shows no file outside "May touch".
5. The report: the rule as built, each moved value old and new, the `lead: 0` proof, the suite's arrival figure
   before and after, the two means of done-means 1, and what was not checked. The private runs against the takes
   are the orchestrator's and are named under "Not done".

## Stop and ask

- A position before the source's first sample cannot be placed by the render, the stream render or the live
  chain without a change larger than a few lines in each.
- Any value listed under "Stop and report" above moves.
- The live chain cannot know the lead before its first sample arrives (it should: the seed is known at start).

## What the reviewer attacks

The `lead: 0` proof (run it); a render whose sound is shifted by the lead; a spurt that opens in the first step;
a source shorter than the lead; `lead` 749 and 0 at the edges; the live chain against the render at three seeds;
any recorded value moved that the order does not name; the words in `tests/REFERENCE_2026.md` (standings, no
figure from a private file beyond those this order gives).

## Rulings of 2026-11-13, after the builder's first stop

The builder's draft changed `steam-sender.js` only (the render, the stream render and the live chain already place
positions before the source), and with the lead forced to 0 every recorded value came back (83 of 83 cases of
`render-stream`, 109 of 109 checks of `steam-sender`, 141 of 141 of `voice-channel`; measured by the builder).
It stopped on two things this order had wrong.

1. **The gate off.** The lead applies whatever the gate is: Steam's capture phase does not depend on it. The
   seeded `steam` rows with the gate off may move, under the same proof. In the check that holds the live chain
   equal to the render, the spurt's start becomes the pre-roll and the lead before the source; that the samples
   are equal must pass unchanged. "Recorded values" above is corrected by this: the stop stands for another
   profile, for `steam` with a caller's clock and no `opts.lead`, for `CLOCK_HASH` and `REF_READS`, and for the
   samples' equality between the live chain and the render.
2. **`tests/voice-channel.verify.mjs` may be touched,** for values that move because of the lead only, each listed
   old and new: its pins at seed 4, its seeded statistics, and its zero check. The zero check is measured first
   with four times the spurts, at lead 0 and with the lead, each mean with its standard error. Within 3 standard
   errors of zero: the arrival figure stays 50.5 ms and the check's bound becomes the larger of 0.1 ms and 3
   standard errors. Off zero by more than that and by less than 0.5 ms: `ARRIVAL_SECONDS` in `voice-channel.js`
   (that constant and its comment only) and `ARRIVAL_MS` take the re-measured figure to 0.1 ms, and every further
   value that moves is listed. Off by 0.5 ms or more: stop.

