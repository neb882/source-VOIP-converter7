# W3-16: the sender's hold on Steam's float clock, and the read clock as measured

**Depends on:** W3-11a merged (this order re-records the `steam` hashes that W3-11a records, and edits the lines
of `audio.js` it adds). The reads behind it: `docs/reports/W3-16-steam-hold-read.md` ("the read" below) and
`docs/reports/W3-14-steam-file-input.md`. **Where W3-14's proposed model and the read disagree, the read wins.**
**Before it merges** the orchestrator writes the text of "The reference's text" into `tests/REFERENCE_2026.md`
and makes the two corrections to `docs/reports/W3-09-steam-voice.md` (CLAUDE.md: a measured constant changes
with its evidence).
**Kind:** code. `tf-builder` (effort high), then `tf-reviewer`, then a second reader on the stronger model (it
changes how renders are computed). **Branch:** `claude/w3-16-sender-hold-clock`, from `main` after W3-11a's
merge. **Worktree:** given in the brief. **Time budget:** half a day.

## Why

The sender (`steam-sender.js`, W3-02b) ends a spurt at the first chunk read more than 0.4 s after the last
active one, in doubles, on a clock tied to Windows's 15.625 ms timer with a few late frames. Two things are now
known that it does not do.

- **The hold is float arithmetic on Steam's own clock** (read, the read's section 1). "Now" is seconds since
  Steam started, narrowed to a 32-bit float once per frame. The test is `now > noted + 0.4`, the sum rounded to
  a float, strictly greater. A float of seconds gets coarser as Steam runs: its step is under 1 ms in the first
  4.5 hours, 1/16 s from 6.1 to 12.1 days, 1/8 s from 12.1 to 24.3 days. So the hold's real length depends on
  how long the sender's Steam has been running. Set J measured it at a step of 1/8 s: 12 of 12 spurt ends.
- **Steam reads every 48 to 64 ms, evenly spread, never late** (measured, Set J: 723 intervals, W3-14 section
  3). The app's clock has reads 46.9 or 62.5 ms apart and 6% of them late by up to 30 ms.

The result today, against Set D's demo (20 spurts of a real microphone path): the model ends a spurt on the 8th
chunk after the last active one in 94% of cases where Steam did so in 12 of 19; its tails are 20 ms longer than
Steam's; and a 440 ms pause that Steam split is bridged in 194 of 200 seeds.

## What was fitted for this order (the planner's runs; private data, numbers only)

The scripts are in the session's scratch (`agents/w3-16-plan/`: `sim.mjs`, `fit-clock.mjs`, `fit-hold.mjs`,
`setj.mjs`, a prototype of this order's sender in `proto/`, and adapted copies of the private demo check in
`sd/`). Nothing here needs re-fitting by the builder.

### The capture's lateness (LATE)

Reads uniform 48.0 to 63.7 ms apart; each 750-sample capture step ready 0 to LATE after its time. 300,000 reads
a row, against the demo's 1,797 chunks (the real packets). The last column is a chi-square over the eight pair
counts at the demo's size (lower is better; 7 degrees of freedom).

| Model | Chunks of 750 / 1500 / 2250, % | Pairs 2-2, 2-1, 1-2, % | Pairs 3-1, 1-3, 1-1, 2-3, 3-2, % | Frames per message 1 to 5, % | Messages a second | Chi-square |
| --- | --- | --- | --- | --- | ---: | ---: |
| Set D's demo (measured) | 23.3 / 75.0 / 1.7 | 53.1, 21.5, 21.7 | 1.63, 1.35, 0.28, 0.39, 0.11 | 10.2 / 13.2 / 64.9 / 10.6 / 1.1 | 17.91 | |
| Set G's logs (measured; chunks as W3-09 fitted them) | 23.6 / 74.0 / 2.3 | | | 11.2 / 13.0 / 63.2 / 11.4 / 1.1 | 18.0 | |
| The app's clock today | 22.8 / 75.5 / 1.7 | 53.8, 20.9, 21.6 | 1.55, 0.86, 0.35, 0.81, 0.12 | 10.0 / 12.8 / 66.1 / 10.0 / 1.1 | 17.89 | 9.7 |
| LATE 0 | 21.4 / 78.4 / 0.2 | 57.2, 21.3, 21.3 | 0.13, 0.13, 0.00, 0.01, 0.01 | 9.3 / 12.1 / 68.7 / 9.8 / 0.1 | 17.90 | 663 |
| LATE 8 ms | 22.2 / 76.8 / 1.0 | 55.4, 21.4, 21.4 | 0.85, 0.85, 0.01, 0.11, 0.11 | 9.8 / 12.4 / 67.2 / 10.0 / 0.7 | 17.90 | 78 |
| LATE 11 ms | 22.9 / 75.6 / 1.6 | 53.9, 21.4, 21.4 | 1.38, 1.39, 0.04, 0.20, 0.21 | 10.0 / 12.8 / 66.1 / 10.0 / 1.1 | 17.90 | 31 |
| LATE 12 ms | 23.1 / 75.1 / 1.8 | 53.4, 21.5, 21.5 | 1.58, 1.58, 0.06, 0.24, 0.24 | 10.1 / 12.9 / 65.7 / 10.0 / 1.3 | 17.90 | 18 |
| **LATE 13 ms** | **23.3 / 74.6 / 2.1** | **52.9, 21.5, 21.5** | **1.77, 1.77, 0.09, 0.28, 0.29** | **10.2 / 13.1 / 65.3 / 10.0 / 1.4** | **17.90** | **11.9** |
| LATE 14 ms | 23.6 / 74.1 / 2.3 | 52.3, 21.5, 21.5 | 1.99, 1.98, 0.11, 0.33, 0.33 | 10.3 / 13.3 / 64.9 / 10.0 / 1.6 | 17.90 | 12.4 |
| LATE 16 ms | 24.2 / 72.9 / 2.9 | 50.9, 21.5, 21.5 | 2.48, 2.47, 0.20, 0.45, 0.44 | 10.6 / 13.6 / 63.8 / 10.0 / 2.0 | 17.90 | 21 |
| LATE 20 ms | 25.5 / 70.2 / 4.3 | 47.9, 21.6, 21.6 | 3.52, 3.53, 0.45, 0.74, 0.75 | 11.2 / 14.4 / 61.4 / 10.1 / 2.9 | 17.90 | 66 |

**LATE stays 13 ms** (W3-14's value; 12 to 14 fit equally). Read intervals of 50 to 61.7 ms or 46 to 65.7 ms fit
no better (chi-square 46 and 13 at their best LATE). "Half of the steps late by up to 16 ms" fits worse (39).
With LATE under 16.75 ms a read always finds at least one step, as a microphone's reads do. The one pair the
model misses is 1-1 (5 seen, 1.6 expected).

### The hold, by how long Steam has run

For each row: the 300,000 reads above, each taken as a spurt's last active read (weighted by its chunk's
length), the hold as read. Against the demo's 19 clear spurt ends (the test signal as the microphone): the
chunk that ended the spurt was the 7th after the last active one 7 times and the 8th 12 times; the capture
steps of 31.25 ms from the end of the last active chunk to the end of the last one were 12 three times, 13 five
times and 14 eleven times (mean 13.42). "Log-likelihood" is of those 19 ends, each as (which chunk, steps at
the last, steps before it); higher is better, and 2.3 apart is a factor of ten.

| Steam has run | Float step | Ends on the 7th / 8th / 9th chunk, % | Steps 12 / 13 / 14 / 15 / 16, % | Mean steps | Mean real time, ms | Log-likelihood |
| --- | --- | --- | --- | ---: | ---: | ---: |
| Set D's demo (measured) | | 37 / 63 / 0 | 16 / 26 / 58 / 0 / 0 | 13.42 | | |
| today's model (its clock, doubles) | | 6 / 94 / 0 | 0 / 7 / 71 / 21 / 0 | 14.14 | 444 | -68.3 |
| 1 hour | 0.24 ms | 21 / 79 / 0 | 2 / 25 / 57 / 16 / 0 | 13.87 | 435 | -37.1 |
| 4 hours | 1 ms | 20 / 80 / 0 | 2 / 24 / 58 / 17 / 0 | 13.89 | 436 | -37.6 |
| 13 hours | 1/256 s | 22 / 78 / 0 | 2 / 26 / 57 / 16 / 0 | 13.86 | 435 | -36.6 |
| 27 hours | 1/128 s | 18 / 82 / 0 | 1 / 22 / 58 / 18 / 0 | 13.93 | 437 | -38.4 |
| 2.2 days | 1/64 s | 4 / 96 / 1 | 0 / 10 / 61 / 29 / 0 | 14.19 | 445 | -54.1 |
| 4.5 days | 1/32 s | 2 / 92 / 6 | 0 / 8 / 57 / 33 / 3 | 14.31 | 449 | -73.8 |
| **9 days** | **1/16 s** | **27 / 71 / 3** | **8 / 24 / 47 / 20 / 1** | **13.83** | **433** | **-35.2** |
| 18 days | 1/8 s | 13 / 44 / 39 (and 3 on the 10th) | 4 / 12 / 27 / 22 / 26 | 14.84 | 465 | -47.1 |
| 36 days | 1/4 s | none before the 9th | none under 16 | 20.87 | 653 | under -200 |
| not the code: W3-14's form at 1/32 s | | 50 / 50 / 0 | 21 / 34 / 38 / 7 / 0 | 13.32 | 419 | -33.9 |

- **Two ranges fit Set D: under 1.5 days, and 6.1 to 12.1 days.** 1.5 to 6.1 days and anything over 12.1 days
  do not (a factor of e^12 or more, and the demo has no end on a 9th chunk).
- **6.1 to 12.1 days fits a little better** (1 to 3 log units over the first range): more ends on the 7th
  chunk and at 12 steps, which the demo has and a fresh Steam almost never gives.
- **Neither closes the gap wholly.** The demo's ends are still 0.4 of a step (13 ms) earlier than either, and
  it has no end at 15 steps where both give 16 to 20%. Today's model is 0.7 of a step late. See "Not settled".
- Other clocks at 4 hours, 27 hours, 9 days and 18 days (LATE 11 and 15; intervals 46 to 65.7, 50 to 61.7, 47.8
  to 64.1 ms) give the same ranking, every log-likelihood within 1.5 of its row.

**Set J's case** (file input, a step of 1/8 s, the chunk formula of the read's section 1d): simulated, the last
chunk is the 7th, 8th and 9th read that brought samples in 31, 47 and 21% of ends, against the run's 4, 5 and 3
of 12; 5.4% of reads bring nothing, against the run's 41 of 766 (5.4%); mean real time 465 ms against 452.

**The prototype against Set D's demo** (seeds 1 to 200; the demo's bars are starts within 62.5 ms in 17 of 20
and ends within 125 ms in 16 of 20):

| | Both bars met, decoded sound as the microphone | Both bars met, the test signal as the microphone | The 440 ms pause split, as Steam did | Tail after the loud part, 12 spurts (Steam: 462.3 ms) |
| --- | ---: | ---: | ---: | ---: |
| main today | 179 seeds | 200 | 6 seeds | 481.9 ms |
| 4 hours | 193 | 200 | 33 | 474.4 |
| 27 hours | 193 | 200 | 26 | 476.0 |
| 4.5 days | 174 | 200 | 7 | 487.8 |
| **9 days** | **194** | **200** | **42** | **472.6** |
| 18 days | 93 | 149 | 17 | 503.4 |

### The default: 9 days (777,600 s)

The middle of the range that fits Set D best, and it agrees with the one thing known of that PC's habit: at Set
J the same Steam had been running 12 to 24 days without a restart. A fresh Steam ("today") is the other
defensible default and is one click away. **If the owner says Steam had been started within a day and a half of
recording Set D, the default becomes 4 hours (14,400 s): one constant, one re-record.**

## What to build

1. **The clock** (`createClock({ seed, uptime })` in `steam-sender.js`), replacing the timer-tick clock.
   `next()` returns one read: `{ time, since, samples }`. All arithmetic in doubles, in exactly this order:

   ```
   A = mulberry32((seed ^ 0x51ED270B) >>> 0)       # the reads (the present seedMix)
   B = mulberry32((seed ^ 0x2545F491) >>> 0)       # the capture (new: seedMixCapture)
   t0 = uptime + 0.25 * A()                        # the render begins 0 to 0.25 s after `uptime`
   r  = 0.0637 * A()                               # seconds from the render's start to the first read
   c0 = 0.03125 * B()                              # the capture's phase
   step j = 0, 1, 2, ... (source samples 750 j to 750 j + 749) is ready at
       a[j] = max(a[j-1], c0 + (j + 1) * 0.03125 + 0.013 * B())      # a[-1] = -Infinity; one draw of B per step, in order
   next():  n = the steps with a[j] <= r not yet taken (take them)
            result = { time: t0 + r, since: r, samples: 750 * n }      # since: seconds from the render's start
            r = r + 0.0480 + (0.0637 - 0.0480) * A()
   ```

   | Constant | Value | Source |
   | --- | --- | --- |
   | `readMin`, `readMax` | 0.0480, 0.0637 s | measured: Set J's rebuilt read intervals, flat from 48 to 64 ms, none late (W3-14 section 3); the pair gives the microphone runs' mean of 55.85 ms (W3-09 section 2) |
   | `grid` (stays) | 750 samples, 31.25 ms | measured: Set D and Set G (W3-09 section 2) |
   | `captureLate` | 0.013 s | fitted: the table "The capture's lateness" |
   | `phaseSpan` | 0.25 s | chosen: a multiple of every float step up to 24.3 days, so the seed spreads the reads over the float's grid |
   | `uptime` (default) | 777600 s | fitted: the table "The hold, by how long Steam has run" |
   | `seedMixCapture` | 0x2545F491 | arbitrary |

   `timer`, `period`, `late` and `lateMax` leave `STEAM_SENDER`. Two generators, so the order of draws does
   not depend on the sound. A chunk is at most 2250 samples (three steps), so `STEAM_REACH` in `audio.js`
   stands. A read before the first step is ready brings nothing (the first read, now and then the second);
   after the first chunk none does.
   For seed 1 the first ten reads are, as samples at seconds after `uptime` (to 1 µs): 0 at 0.143463, 1500 at
   0.202867, 1500 at 0.257393, 1500 at 0.318663, 750 at 0.375494, 1500 at 0.423535, 1500 at 0.481491, 750 at
   0.532617, 1500 at 0.594268, 1500 at 0.643507. The planner's prototype gives, for seed 1 and uptime 777600,
   SHA-256 `b2b24e93c0162d1920e6759f1af4b42648de7fb59352cdc2f7c38a1b21ef5d79` over the first 100,000 reads,
   each as `time` (a 64-bit float, little-endian) then `samples` (16 bits, little-endian). If the builder's
   differs, compare the ten reads first; if those agree and the hash does not, report it and go on.

2. **The hold, as read** (the read's section 1 and its pseudo-code). In `createSender`:
   - at each read, before anything else: `nowF = Math.fround(read.time)`;
   - whenever a chunk with samples is active, in every state: `notedF = nowF`;
   - the spurt's last chunk: `state === HANGING && nowF > Math.fround(notedF + HOLD_F)`, with
     `HOLD_F = Math.fround(0.4)` (0.4000000059604645; read, `0x139199e04`). Strictly greater. No double takes
     part. It is tested in the same read that turns active into hanging;
   - **a read that brings no samples** runs the state machine too (read, 1c; W3-14 "Messages against the game's
     log"): silent, nothing; ended, the state becomes silent and nothing is sent (no silence record); active, it
     becomes hanging; hanging (or just made so), the hold is tested, and if it fires the kept samples are padded
     to a frame and sent with the end marker (the marker alone if nothing is kept), and the state is ended.
   - `STEAM_SENDER.hold` stays 0.4 with the comment that the code's constant is its float.

3. **`uptime`**, a new option of `createSender` and `createClock`: seconds, how long the sender's Steam had been
   running when the render begins. A finite number from 0 to 4,000,000 (46 days), else a `RangeError`. It
   changes the hold only: the same seed gives the same chunks at every `uptime`.

4. **The `clock` option stays, in the new form**: an object whose `next()` gives `{ time, since, samples }`: `time` in
   seconds on Steam's clock and not below the last, `since` the seconds from the render's start (left out: `time`
   is used), `samples` a whole number from 0 to 2250; anything else is a `RangeError` naming the clock. Tests and
   the private demo check drive the sender with it. The old form (whole numbers of timer ticks) goes. A message's
   `tick` is `max(last + 1, ceil((since + relay) / tick))`: the game's ticks count from the render's start, not
   from Steam's, and not from the 0.25 s phase. **`gate: false` and `meanMin` do not
   change.**

5. **The render** (`audio.js`, W3-11a's `steamSenderOptions` and the option list of `process()` and
   `createRender`): a new option `steamUptime` (seconds), passed to the sender as `uptime` when it is a finite
   number, left out otherwise. Nothing else in `audio.js` changes. `codecInfo.sender` gains `uptime`.

6. **The page**: beside the gate's threshold, shown for the `steam` profile only, a choice
   "Sender's Steam has been running", sent as `steamUptime`:

   | Choice | Seconds | The hold in real time (the read's table) |
   | --- | ---: | --- |
   | since today | 14400 | 400 to 402 ms |
   | a few days | 388800 | 406 to 437 ms |
   | about a week (the default) | 777600 | 375 to 437 ms |
   | about two weeks | 1555200 | 375 to 500 ms |
   | about a month | 3110400 | 500 to 750 ms |

   Its help, one sentence: "Steam times the 0.4 s it keeps sending after speech on a clock that gets coarser
   the longer Steam has run, so the tail is 0.40 s on a fresh start and anywhere from 0.38 to 0.50 s after two
   weeks." The choice is kept with the other settings, is part of what a render is cached and compared by, and
   the seed still fixes the render: the same sound, settings, seed and choice give the same samples.

7. **Words.** `steam-sender.js`'s header (the clock's paragraph; "more than 0.4 s" becomes the float test).
   `constants.js`, the `steam` profile's comment: "a 0.4 s hold" becomes "a 0.4 s hold on Steam's 32-bit float
   clock, whose length depends on how long the sender's Steam has run". `README.md`: one sentence where the
   gate is described. No other text.

8. **What moves, and nothing else.**
   - `tests/steam-sender.verify.mjs`: the clock's section is rewritten for the new clock (its reference
     schedule, the second copy of the order's text in plain arrays, the statistics). Every check that drives
     the sender with a hand clock keeps its meaning: a helper turns the old `n[i]` into
     `{ time: n[i] * 0.015625, since: n[i] * 0.015625, samples: 750 * (floor(n[i] / 2) - floor(n[i-1] / 2)) }`, a read whose samples
     are 0 left out as before. With that helper and `uptime` 0 those checks' expected messages do not change
     (at these times a float still resolves 8 µs). Say in the report each expectation that had to change and why.
   - `tests/render-stream.verify.mjs`: the golden hashes of the cases for which its `steamRule` is true, and of
     no other case. `tests/verify.js` and `tests/browser.verify.js`: only expectations that the `steam`
     sender's schedule moves; say each. **A hash of any other profile, or of a `steam` case with the codec
     bypassed or a received stream, that moves is a stop.**
   - `sw.js`: the cache version goes up by one.
   - `tests/predictions/PREDICTIONS.md`: a "Changed after registration" note for `steam-sender.js`, `audio.js`
     and `constants.js`, with what moves at spurt ends (the table of "The orchestrator runs privately").

## The decoder's 17-frame cut: not here

Read (the read's section 3): one record's 24 kHz buffer holds 17 frames, and the game takes at most 12 frames of
a message (22,528 bytes). **Neither limit can be reached in a render of a file**, with or without the loss
option:

- A message is a spurt's opening or a later chunk. An opening is at most 2400 + 2250 samples: 9 frames (10 if
  it is also the last, with the gate off). Its first frame has number 0 after an end marker, which is never
  "ahead", so nothing is concealed in front of it. 10 frames fit both limits.
- A later message is at most 479 + 2250 samples: 5 frames, 6 when padded. With the loss option a gap in front
  of it conceals at most 10: 16 frames, inside the 17.
- So the 17-frame cut needs a chunk of 6000 samples (file input, or a first read after a stall) or numbers that
  ran on over frames never collected. Those exist only in a demo's own packets and across key presses.
  **It goes to W3-02g** (a demo's packets through the decoder), as two lines of `createSteamStream`'s rules,
  and W3-11b should name it where a key press can leave numbers running.
- **The game's refusal of a message over 12 frames can be reached with loss**: 8 or more concealed frames in
  front of a 5-frame message is 13. That is the loss model's matter (whether loss takes whole messages is
  still open in `tests/REFERENCE_2026.md`); it goes to the order that settles it, not here.

## Checks

### The builder runs (no private data)

`node tests/steam-sender.verify.mjs`, each new check failing when its line is broken (say how; at least: the
sum left in doubles; `>` made `>=`; `HOLD_F` made the double 0.4; `nowF` taken as the double; the noted time
set from the chunk's end; the hold not tested on the read that turns active into hanging; an empty read
skipped; one generator in place of two; `captureLate` 0; the phase draw left out).

- **The float arithmetic**, driving the sender with a hand clock: a spurt whose last active read is at
  `noted`, then inactive reads at chosen times. The spurt must end exactly at the first read whose time,
  rounded to a float, is at or over "ends at", and must not end on a read at "limit":

  | Case | `noted` (s) | Its float | Float step | Limit `fround(notedF + HOLD_F)` | Ends at the first float above it | That is |
  | --- | --- | --- | --- | --- | --- | --- |
  | 1 hour | 3600.123 | 3600.123046875 | 1/4096 | 3600.52294921875 | 3600.523193359375 | 1639 steps, 400.15 ms |
  | 4 hours | 14400.5 | 14400.5 | 1/1024 | 14400.900390625 | 14400.9013671875 | 411 steps, 401.37 ms |
  | 13 hours | 46800.3 | 46800.30078125 | 1/256 | 46800.69921875 | 46800.703125 | 103 steps, 402.34 ms |
  | 27 hours | 97200.3 | 97200.296875 | 1/128 | 97200.6953125 | 97200.703125 | 52 steps, 406.25 ms |
  | 2.2 days | 190080.3 | 190080.296875 | 1/64 | 190080.703125 | 190080.71875 | 27 steps, 421.875 ms |
  | 4.5 days | 388800.3 | 388800.3125 | 1/32 | 388800.71875 | 388800.75 | 14 steps, 437.5 ms |
  | 9 days | 777600.3 | 777600.3125 | 1/16 | 777600.6875 | 777600.75 | 7 steps, 437.5 ms |
  | 18 days | 1555200.3 | 1555200.25 | 1/8 | 1555200.625 | 1555200.75 | 4 steps, 500 ms |
  | 36 days | 3110400.3 | 3110400.25 | 1/4 | 3110400.75 | 3110401 | 3 steps, 750 ms |

  For each: a read at the limit exactly does not end the spurt (the strict comparison); a read one float above
  does. At 2.2 and 4.5 days a read at 406.25 ms on the float clock does not end it (the form "now less noted,
  over 0.4" would: that is the check that tells the two forms apart). At 9 days, reads at 777600.343 and
  777600.719 are 376 ms apart and end the spurt, and reads at 777600.282 and 777600.718 are 436 ms apart and
  do not.
- **An empty read:** hanging with the hold passed, it sends the end marker (alone when nothing is kept, with
  the padded frame when something is); in the ended state it makes the next inactive chunk send no record.
- **Determinism:** the ten reads and the hash of item 1; the same seed and `uptime` give the same messages
  twice; seeds 1 and 2 differ; the same seed at `uptime` 14400 and 777600 gives the same chunk lengths, and on
  the reference signal at least one spurt of a different length.
- **The clock's statistics** over 300,000 reads of the default seed (the prototype's figures; the bounds are
  five times the spread seen between seeds):

  | What | The prototype | Must lie in |
  | --- | --- | --- |
  | Chunks of 750 / 1500 / 2250, % | 23.30 / 74.65 / 2.06 | 22.8 to 23.8 / 74.1 to 75.2 / 1.8 to 2.3 |
  | Chunks over 2250; reads that bring nothing after the first chunk | 0; 0 | exactly 0 |
  | Pairs 2-2, 2-1, 1-2, % | 52.95, 21.42, 21.43 | 52.3 to 53.6; 21.0 to 21.9 each |
  | Pairs 3-1, 1-3, % | 1.78, 1.78 | 1.5 to 2.1 each |
  | Pairs 1-1, 2-3, 3-2, 3-3, % | 0.09, 0.28, 0.28, 0 | under 0.2; 0.15 to 0.45 each; under 0.02 |
  | Frames per message 1 to 5, % | 10.3 / 13.0 / 65.2 / 10.0 / 1.4 | each within 0.6 |
  | Reads a second | 17.90 | 17.85 to 17.95 |
  | Shortest and longest interval | 48.00, 63.70 ms | at least 48.0, at most 63.7 |
  | Ends on the 7th / 8th / 9th chunk at `uptime` 777600, %: each read with samples taken in turn as a last active one, all later reads inactive | 26.5 / 70.8 / 2.8 | 24.5 to 28.5 / 68.8 to 72.8 / 2.0 to 3.6 |
  | The same at `uptime` 14400 | 20.0 / 80.0 / 0.01 | 18 to 22 / 78 to 82 / under 0.1 |
  | The same at `uptime` 1555200 (and the 10th) | 13.2 / 44.3 / 39.1 (3.4) | 11.2 to 15.2 / 42.3 to 46.3 / 37.1 to 41.1 (2.6 to 4.2) |

- **Stream equals offline:** `push()` in pieces of 1, 7, 480, 12345 samples and whole gives the same messages
  (the present check, kept), at two values of `uptime`.
- `pnpm test`, `pnpm test:vendor` and the browser suite pass (`flock /tmp/tf2ve-heavy.lock` for the browser
  suite); CI passes on the pushed branch. In the browser suite: the choice is on the page for `steam` only, and
  two renders that differ only in it differ.

### The orchestrator runs privately

1. **Set D's demo**, `sh checks/sender-demo/reproduce.sh <checkout> <takes>` in the private repository, after
   two edits there (the planner's adapted copies are `run-new.mjs` and `tail-new.mjs` in its scratch): the hand
   clock returns `{ time: n * 0.015625, since: n * 0.015625, samples: 750 * k }` and is run at `uptime` 0; the seeded runs pass
   `uptime`.

   | What | Today | Expected (the prototype) | Bar |
   | --- | --- | --- | --- |
   | Hand clock, decoded sound: starts within 62.5 ms, ends within 125 ms | 18 and 18 of 20 | 18 and 18; the table the same row for row | not below 18 and 18 |
   | Hand clock, the test signal: starts, ends, the "same messages" column | 20, 19, and the column as it prints today | the same, row for row | no row changes |
   | Seeds 1 to 200 at the default, decoded sound: both bars met | 179 seeds | 194 | at least 185 |
   | Seeds 1 to 200, the test signal: both bars met | 200 | 200 | 200 |
   | The 440 ms pause between spurts 19 and 20 kept split (the test signal) | 6 seeds | 42 | at least 30 |
   | `tail.mjs`: the model's mean tail over 12 spurts (Steam: 462.3 ms) | 481.9 ms | 472.6 | 468 to 477 |

2. **The accuracy table** (`tests/accuracy.mjs --takes`), before (W3-11a's merged state) and after. What may
   move: the `steam` rows only. Spurt ends move earlier by 9 ms on average and scatter more (the hold is 375 to
   437 ms in real time where it was 400). Level and spectrum figures of steady signals: within 0.1 dB. A figure
   that rests on where a spurt ends (the gate rows, pause lengths on the speech take): report each, with its
   before and after. Any row of another profile that moves is a stop. The planner did not run this table.
3. **The re-timing check** (`node tests/retiming.mjs ... --engine`): today 58% of transitions right and 87 ms
   of start error on the speech take. The planner did not simulate it. The bar: not under 55% and not over
   92 ms; report both figures at the default and at `steamUptime` 14400.
4. **Set J**, by the planner's `setj.mjs` or the like: at a step of 1/8 s the hold as read gives the run's
   split of ends (31 / 47 / 21% against 4, 5 and 3 of 12). Already run; repeat only if item 2's rule changes.

## The reference's text (`tests/REFERENCE_2026.md`, written by the orchestrator before the merge)

**Finding 16**, after "Its packets are bit-identical to a native build of the same release.": W3-14's proposed
paragraph, as it stands in that report.

**Finding 28.** The bullet "The hold" becomes:

> - **The hold** is 0.4 s on Steam's clock, in 32-bit floats (read, W3-16): the time of the read is narrowed to
>   a float once per frame, the read of each active chunk notes it, and the first chunk whose read has
>   `now > noted + 0.4` (the sum rounded to a float; strictly greater) is the last. Its final frame is padded
>   with zeros, the end marker follows, the encoder is reset and the sequence number returns to 0. The next
>   chunk goes out as its length only: the silence record. The test also runs in the read that first finds the
>   chunk inactive, and on a read that brings nothing.
> - **So the hold's real length depends on how long the sender's Steam has run.** The clock is seconds since
>   Steam's process started (read in Valve's public timer library; that the process is Steam's is inferred). A
>   float of that size moves in steps: 4 ms or less for 18 hours, 1/128 s to 36 hours, 1/64 s to 3 days, 1/32 s
>   to 6.1 days, 1/16 s to 12.1 days, 1/8 s to 24.3 days. The hold is then 398 to 402 ms, 398 to 406, 406 to
>   422, 406 to 437, 375 to 437 and 375 to 500 ms of real time. Measured at 1/8 s (Set J, W3-14): all 12 spurt ends
>   fall on the first read four steps after the last active one, 389 to 514 ms. Set D's 19 clear ends (the 7th
>   chunk 7 times, the 8th 12 times, never the 9th) fit a Steam under 1.5 days old or one of 6.1 to 12.1 days,
>   the second a little better, and no other age (simulated, W3-16's order). The app's default is 9 days.
> - **Checked on a run where every chunk is known** (Set J, W3-14): W3-14's proposed bullet, as it stands.
> - **Steam reads every 48 to 64 ms** (mean 55.4, nearly flat, none late in 723; Set J's times rebuilt from the
>   chunk lengths). A microphone's chunk shares and pairs then follow when each capture step is ready up to
>   13 ms after its time (fitted to Set D's 1,797 chunks: 23.3 / 74.6 / 2.1% modelled against 23.3 / 75.0 /
>   1.7%). Under file input a chunk is the time since the last read's float, times 24000, truncated, at most
>   6000 (read, W3-16), so the printed lengths run from 0 to 125 ms.
> - **A key press**: W3-14's proposed bullet, as it stands.

The bullet "The clock" of finding 28 is deleted (the two above replace it). The sentence "In the demo the last
chunk is the 7th after the last active one in 9 spurts and the 8th in 9" becomes "7 and 12 of 19 with the test
signal as the microphone".

**Finding 29**: W3-14's three proposed bullets, with "Concealment, seen once" corrected by the read:

> - **Concealment, and a message that does not fit** (read, W3-16; seen once, Set J). One record's 24 kHz
>   buffer holds 17 frames. A frame that would be the 18th is not decoded, its number is spent, and the rest of
>   the record is skipped. The game is given a message only if its resampled sound fits 22,528 bytes (12
>   frames); otherwise it gets nothing and the sound is lost. In Set J, after 34 frames the game never
>   collected, a 12-frame message was decoded as 10 concealed frames and 7 coded ones, the game logged 0
>   samples, and the next message concealed 4 and decoded its 5. A render of a file cannot reach either limit.

**The Model table**, row "Voice gate", the game's column: "held 0.4 s of Steam's clock" becomes "held 0.4 s on
Steam's 32-bit float clock of seconds since Steam started (375 to 500 ms of real time, by how long that is)";
the app's column gains "the hold in floats and the read clock as measured since W3-16, with the sender's Steam
at 9 days by default". Row "Network", the game's column, gains "a message over 12 frames is refused whole".

**`docs/reports/W3-09-steam-voice.md`** (two corrections, each marked with its date and source): in "The level
test", the printed peak is a percentage of 32768 and the mean a percentage of 32767 (W3-14 section 1); in "The
state machine", the clock's sentence becomes "it counts from Steam's start (read, W3-16), and its steps matter
from a day and a half on: 1/64 s at 2 days, 1/16 s at a week, 1/8 s at two weeks; Set J measured the last",
and the summary's "0.4 s of wall-clock time" becomes "0.4 s on that float clock".

## Not in this order

- The live chain's key-press rules (a press resets the encoder and the kept samples, not the gate's state or
  the sequence number; the 0.5 s after key up in floats and in doubles; the empty packet): W3-11b.
- The room effects: W3-17.
- Anything in the decode path: the decoder's 17 frames, the game's 12, the resampler, the gain.
- The tie between Steam's reads and the game's 15 ms tick (measured in Set J, not explained).
- A second sender PC: the 750-sample step and the 13 ms are the owner's PC.

## Not settled

- **Which of the two ranges Set D was.** Only the owner can say. The default follows the better fit.
- **About 10 ms of the tails' 20 ms.** With either range the model's ends are still 0.4 of a capture step later
  than the demo's, and the model gives ends at 15 steps that the demo never has. The hold is read, so what is
  left is in the clock: how a read's time sits against the capture's steps (a tie between the two would do
  it). A microphone run with `@voice_spew_activity_check`, Steam's age noted, would show it.
- **LATE** is fitted to one PC's pair counts; 12 to 14 ms fit alike.
- The accuracy table and the re-timing check were not run by the planner.

## Files

May touch: `steam-sender.js`, `tests/steam-sender.verify.mjs`, `audio.js` (only `steamSenderOptions`,
`steamCodecInfo`'s `sender` entry and the option comments of `process()` and `createRender`), `constants.js`
(the `steam` profile's comment), `index.html` and the page script that gathers a render's options (the new
choice), `style.css` if the choice needs it, `README.md` (one sentence), `sw.js` (the cache version),
`tests/render-stream.verify.mjs`, `tests/verify.js`, `tests/browser.verify.js` (as item 8 says),
`tests/predictions/PREDICTIONS.md` (the note). May add: `docs/reports/W3-16-sender-hold-clock.md`. May not
touch: `opus-codec.mjs`, `vendor/`, `voice-channel.js`, `live*.js`, `tests/REFERENCE_2026.md`,
`tests/predictions/predictions.json`, `docs/PROGRESS.json`, `docs/reports/W3-09-steam-voice.md`.

## Stop and ask

- If a hash outside the `steam` sender's cases moves.
- If a hand-clock check of `tests/steam-sender.verify.mjs` needs a different expected message at `uptime` 0:
  give the check and the two messages.
- If the clock's statistics fall outside a bound with the clock coded as item 1 says: report the figures; do
  not tune a constant.
