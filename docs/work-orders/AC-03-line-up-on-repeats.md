# AC-03: the line-up on repeated tone bursts

Status: written 2026-11-14 by a planner; not built. Plan report: [AC-03-plan.md](../reports/AC-03-plan.md).

**Branch:** `claude/ac-03-line-up-on-repeats`, from `main` as it stands when the build starts. **Worktree:** in the
brief. **Budget:** 3 hours. One builder; a reviewer after; a second reader for the diff, since the change is in how
a take is lined up.

## Why

The accuracy suite cuts a take into pieces, one for each stretch the sender's gate sends, and gives each piece one
delay (`TF2Reference.track`, `reference.js`; the page's real-take check runs the same code). The orchestrator's
private run of 2026-11-14 read these delays (measured, in the owner's takes; the takes stay private):

| Take | Timing | Piece, s of the source | Delay, ms | The take's other pieces |
|---|---|---|---|---|
| `take3_voice_avggain_0.25` | the game's voice queue | 0 to 5.94 | +1599 | +2069 to +2116 |
| | | 5.94 to 30.16 | +1574 | |
| | | 47.16 to 49.16 | +2424 | |
| | | 59.16 to 61.16 | +2433 | |
| | the file's own | 51.16 to 53.16 | +1773 | |
| | | 57.16 to 59.16 | +1778 | |
| `take1_default` | the game's voice queue | 47.16 to 49.16 | +5154 | within about 50 ms of each other |
| | | 51.16 to 53.16 | +5127 | |
| | the file's own | 55.16 to 57.16 | +4514 | |
| | | 59.16 to 61.16 | +4510 | |

`docs/ACCURACY.md` ("Against the file's own timing") and `docs/PROGRESS.json` (`deferred`) read all ten as the
line-up landing on a neighbouring repeat of the test signal. The plan pass found two different things behind them.

1. **The first two rows are a wrong line-up.** A stand-in take reproduced the first one: 1577 ms where the take's
   other pieces sit at 2085 to 2126 ms (measured on a stand-in, which is the app's own render and not a take). This
   order fixes it.
2. **The other eight are most likely not a line-up fault** (inferred from the stand-ins; the private check below
   settles it). A piece's delay is the take's delay against the render it was lined up with, not against the source.
   On the game's voice queue the render starts some phrases early, by 294 to 335 ms at the default seed (measured on
   the app's render in Node; see the table under "The cause"). A take starts some phrases early too. Where only the
   render starts a phrase early, the piece reads about 0.3 s more. Where only the take does, it reads about 0.3 s
   less. Where both do, the piece reads like its neighbours. The page's real-take check already reads the pieces this
   way (`phraseChanges`, `app/realtake.js`). This order changes nothing for these pieces, and it must not.

## What was read in the code

All in `reference.js`, inside `track()`.

- `track()` takes the talk spurts from the gate model and places each in turn. A spurt's place is
  `a = wave !== null ? wave : delay + env.lag`. `wave` is the waveform's place (`coarseWave`), `env` the level
  envelope's (`envMatch`, through `placeBy`).
- `envMatch` knows about repeats. Of its peaks it takes the best once each loses 0.6 per second away from the
  prior, which is the median delay of the spurts placed so far. Its comment names the case: beeps 0.5 s apart.
- `coarseWave` does not. It cuts the spurt into windows of 1 s every 0.5 s, finds each in the take at 2 kHz within
  0.6 s of the running delay (`wideMatch`), and returns the median of two or more windows that agree within 2 ms.
  It has no prior. Neighbouring windows overlap by half, so two of them can hold the same burst.
- `wideMatch` returns nothing for a periodic window, but it judges that at 2 kHz, over lags of 4 to 50 ms.
  `waveMatch`, the fine search inside a spurt, judges it at 8 kHz.
- A spurt with no waveform and an envelope under 0.75 is not moved more than 0.1 s from the prior ("Weak evidence
  does not move a spurt far from where the others sit").
- With `options.reference` (the suite and the page both give the render) `source` is the render: every envelope
  and waveform of the "source" above is the render's. The spurts still come from the raw source.

## The cause

**The sync beeps (reproduced on a stand-in).** The test signal starts with three 1 kHz beeps 0.5 s apart. They are
one spurt, and its windows are 0 to 1 s and 0.5 to 1.5 s. At 2 kHz a 1 kHz tone is at the edge of the band: the tone
itself is filtered away and what is left of a beep is the clicks of its start and end. So the window is not periodic
there, and `wideMatch` goes on to match clicks. On the queue the render's beeps are not alike (the queue skipped part
of the first and the third: about 60, 80 and 60 ms of sound), so the clicks of one beep can fit a neighbouring beep
of the take better than their own. Both windows hold the second beep, so both land on the same wrong beep and
"agree". In the stand-in they did so at correlations of −0.75 and +0.77, opposite in sign, half a second early. The
envelope had the right place (0.86 at +0.07 s against 0.81 at −0.43 s, before the prior's penalty), but a waveform
place overrules the envelope.

**The piece after it (inferred, not reproduced).** The next spurt is the 1 kHz staircase from 10.4 s. It has no
waveform place (a steady tone), so its envelope is searched around the running delay, now half a second off, and the
right peak 0.5 s away loses 0.3 to the prior's penalty. A staircase still fits itself well half a second off. In
the stand-ins the right peak won all the same (0.98 against 0.69); in the take it did not, by the look of the
figures. Once the first spurt is placed right, the search for the second starts at the right delay.

**The eight pieces of 2 s.** The default seed's render on the queue starts three phrases early (measured on the
app's render in Node, the page's default settings with `volume` 0.15 and `avgGain` 0.25 or 0.5; the two give the
same three):

| Phrase starts at, s | Its piece | The render starts it early by |
|---|---|---|
| 47.36 | 47.16 to 49.16 | 316 ms |
| 51.36 | 51.16 to 53.16 | 294 ms |
| 59.36 | 59.16 to 61.16 | 335 ms |

Against the file's own timing a render starts nothing early, so the pieces that read about 0.33 s less there are
the take's own early starts: 51.16 and 57.16 in `take3_voice_avggain_0.25`, 55.16 and 59.16 in `take1_default`
(inferred). On the queue that predicts: take3 reads more at 47.16 and 59.16 and like its neighbours at 51.16; take1
reads more at 47.16 and 51.16 and like its neighbours at 59.16. All six agree with the private figures. It also
predicts take3's 57.16 and take1's 55.16 about 0.33 s less on the queue, which the figures handed to the planner do
not show. That is the open question of this order (see "The orchestrator's private check").

Stand-ins with the same pattern (a take that is the app's render at another seed, lined up against the default
seed's render) read every such piece where the two renders' own phrase logs put it, to within about 40 ms (measured
on stand-ins). So the line-up follows a real jump of 0.3 s on these bursts, in both directions.

## The change

`reference.js`, in `track()` only. Keep it this small.

1. A helper beside `wideMatch`: how periodic the source is over a window at 8 kHz, with `waveMatch`'s own sum (lags
   16 to 400 in steps of 4, every second sample, twice the sum over the energy). `waveMatch` may be made to call it,
   if its result stays the same number.
2. `coarseWave` returns the delay as today and, with it, whether every window that agreed is periodic at 8 kHz
   (above 0.9): call that tonal.
3. In the spurt loop, after `env` is settled and before `if (wave === null && env.value < .5) return;`: if there is
   a waveform place, it is tonal, `env.value` is 0.5 or more, and the waveform place lies more than 0.1 s from
   `delay + env.lag`, drop the waveform place (`wave = null`). The envelope then places the spurt, with its prior and
   with the weak-evidence rule, as it does for any tone.
4. Comments in the file's own style: what the lines do to the line-up and why (beeps 0.5 s apart; at 2 kHz only a
   1 kHz burst's clicks are left).

`env` is computed before the rule from the spurt's whole envelope, as today for a spurt with a waveform place. Do
not change which envelope a spurt gets.

The plan pass tried this change in a scratch copy (not committed). The stand-in's first piece went from 1577 to
2085 ms; every other piece of every stand-in stayed where it was; `pnpm test reference` passed; the committed
recordings lined up to the same numbers (all measured on stand-ins or on committed files).

What was tried and not ordered:

- Dropping every tonal window in `coarseWave`, whatever the envelope says. It fixes the stand-in too, but it moved
  the line-up of most of the seven committed recordings by up to 0.09 ms, since their clip starts with 1 kHz
  bursts.
- Searching the waveform again near the envelope's place and keeping the better of the two after the prior's
  penalty. At the right place the clicks correlate at 0.34 and 0.44, at the wrong one at 0.75 and 0.77: the wrong
  place wins. The clicks carry no evidence either way.

## Checks

Each with its command. None needs the takes.

1. `node --check reference.js`, then `pnpm test reference` and `pnpm test site`.
2. **A check that fails without the change**, in `tests/reference.verify.mjs`, beside the "spurt by spurt" checks.
   The stand-in that the plan pass measured:
   - Source: the first 12 s of `tests/testsignal/tf2_voice_testsignal_v1.wav`, mono.
   - The guide: `audio.process(source, opts)` with `codec: 'steam'`, `captureChannel: 'left'`, `micGain: 1`,
     `voiceScale: 1`, `hp: 0`, `lp: 20000`, `bits: 16`, `agc: true`, `maxGain: 10`, `avgGain: 0.25`, `gate: null`,
     `steamUptime: 777600`, `volume: 0.15`, `deviceRate: 48000`, `lossPct: 0`, `jitterMs: 0`, `frameMs: 20`,
     `enableWarble: true`, `room: null`, `timeline: 'game'`, `fps: 300`, `bufferMs: 100`, and no seed.
   - The take: the same with `seed: 3` and `fps: 200`, then put 2.07 s late on a clock 400 ppm off
     (`warpSegments` with one piece, `a: -2.07 / 1.0004`, `b: 1 / 1.0004`), 3 s longer than the render, plus seeded
     noise at −47 dBFS rms (the plan pass used low-passed noise with a little white noise in it).
   - `track(take, 48000, source, 48000, { gate: { thresholdDb: -39.5, prerollMs: 120, holdMs: 440 }, micGain: 1,
     reference: { samples, rate, frames: codecInfo.frameLog, frameSeconds: 0.02 } })`.
   - Before the change the first piece read 1576 ms and the second 2041 ms. After it they read 2083 and 2038 ms.
     The builder's noise will move these by a little. The check: the two pieces within 80 ms of each other.
   - If 12 s does not fail on `main` in the suite's realm, use the first 45 s (1578 against 2086 ms, the pieces
     after at 2085 to 2126). A cut of 30 s does not reproduce it: the starting delay differs. Say which was used.
   - Show the check failing on `main`'s `reference.js` and passing on the branch. The suite's time stays under 40 s.
3. **A real jump on bursts still reads as a jump.** One more check in the same suite, or in the report if it is too
   slow for the suite. The whole test signal, the guide as above, the take with `seed: 6` and `fps: 300`. The pieces
   at 47.16, 57.16, 59.16, 69.03 and 91.82 s read +305, −352, +330, −318 and −291 ms against the take's median
   (measured on a stand-in on `main`). They are the same numbers, to the millisecond, on the branch. The first two
   pieces are the same too.
4. **The committed recordings do not move.** Write nothing new into the repository for this; a scratch script will
   do. For each file under `tests/recordings/files/`, make its clip with `node tests/recordings/make-inputs.mjs
   <scratch folder>`, render the clip with the file's codec (`celt_22`, `celt_44` or `speex`, and the row's
   `maxGain`), and run `track(recording, its rate, clip, its rate, { reference })` and once more without the
   reference. Print every piece's `start`, `end`, `a`, `b` and `points`. The output on `main` and on the branch is
   the same byte for byte. One file gives the same error on both ("does not line up", the double-speed one). Show
   the comparison.
5. **The page's real-take check.** `CHROMIUM_EXECUTABLE=... flock /tmp/tf2ve-heavy.lock pnpm test:browser`, or the
   sections of `tests/browser.verify.js` that load a take ([Browser 3e] and [Browser 8f]) if the suite allows a
   subset. Their printed delays and counts are as on `main`.
6. Break the new rule and show the checks catching it: the 0.1 s limit set to 1 s (check 2 fails); the tonal test
   always false (check 2 fails); and one break of the builder's choosing that drops a waveform place it should keep
   (check 3 or `pnpm test reference`'s spurt checks fail, or the report says plainly that nothing catches it).

## What must not move

- Every piece of every stand-in but the first piece of check 2's (and what follows from it).
- The output of check 4, and the browser suite's real-take lines.
- Every figure in `docs/ACCURACY.md`, `tests/REFERENCE_2026.md` and `tests/predictions/`. The builder edits none of
  them. The rows of `take3_voice_avggain_0.25` change after the orchestrator's private run, and only then.
- `locate()`, `envMatch`, `wideMatch`'s result for any window, the windows inside a spurt, the clock fit and the
  breaks.

## Files

May touch: `reference.js` (inside `track()`), `tests/reference.verify.mjs`, `tests/README.md` (the `reference` row,
one clause, if the new checks change what the row says), the report `docs/reports/AC-03-line-up-on-repeats.md`.

May not touch: `sw.js` (`reference.js` is a file the site keeps offline, so the cache number rises; the orchestrator
sets it at the merge with `node tests/cache-number.mjs origin/main --set`), `app/`, `engine/`, `audio-worker.js`,
`tests/accuracy.mjs`, `tests/accuracy.takes.json`, `tests/predictions/`, `tests/recordings/`, `docs/ACCURACY.md`,
`docs/PROGRESS.json`, `docs/PROGRESS-LOG.md`, `docs/README.md`.

## The orchestrator's private check

It is the order's real check, and it is not the builder's. On the branch, with the takes:

1. `node tests/accuracy.mjs --takes <folder> --only take3_voice_avggain_0.25 --json <file>` on `main` and on the
   branch. The pieces 0 to 5.94 and 5.94 to 30.16 s read within about 50 ms of +2069 to +2116 ms on the branch. If
   the first does and the second does not, the staircase's envelope is a second fault and a new order. If neither
   does, the take's wrong place did not come through tonal windows: say so, and the order is not merged as a fix.
2. Every take, both timings, `main` against the branch: no piece of any other take moves. A piece that moves is
   read before the merge, with its delay on both sides.
3. The reading of the eight pieces of 2 s. In the queue run's JSON of `main`: does `take3_voice_avggain_0.25`'s
   piece at 57.16 s read about 0.33 s under its neighbours, and `take1_default`'s at 55.16 s? If yes, all ten early
   starts are accounted for, and the sentence in `docs/ACCURACY.md` ("That is the line-up, not the render") and the
   `deferred` entry are corrected: the pieces of 2 s are phrases that the take and the render do not both start
   early. If no, say what those two pieces read; the weak-evidence rule holding them at the prior is the first thing
   to look at.
4. The table row of `take3_voice_avggain_0.25` in `docs/ACCURACY.md` is replaced from a run with `--seeds 9`.

## Not in this order

- The suite does not say which phrases the take and the render start early. The page does (`phraseChanges`). Putting
  the same lines into the suite's output is not built yet and would be an order of its own.
- Whether a take's early starts fall where a render's do is a question about the queue and the sender's draw, not
  about the line-up.

## After the build (2026-11-14)

Built, reviewed (merge as is) and merged with cache v52. The orchestrator's private run on the owner's takes, every take
on main and on the branch at the default seed (measured; the takes stay private): four rows changed, each in its
first pieces only, each now at its neighbours' delay.
- `take3_voice_avggain_0.25`: +1599 / +1574 ms to +2092 / +2110; level 2.03 / 14.7 to 0.94 / 8.6 dB, r 0.916 to
  0.975.
- `listener_B`: +4347 to +4845; level unchanged.
- `lowtone_maxgain_1`: the first four pieces +4154 to +4159 to +3631 to +3665, and the piece at 82.66 s +3636 to
  +3622; level 5.20 / 19.1 to 4.92 / 14.4. The piece at 82.66 s is the 80 Hz control tone. The rule cannot fire
  there; it most likely moved through `prior`, the median of the placed spurts, which on main held the four wrong
  first pieces (the review, inferred).
- `net_loss5`: +2291 to +1789; level 2.27 / 11.8 to 2.65 / 13.7, a row with random loss.

Every other row is equal. The review's three test gaps are in `docs/PROGRESS.json`'s `deferred`.
