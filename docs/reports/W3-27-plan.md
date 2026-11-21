# W3-27, the plan: what was read and tried

The order is `docs/work-orders/W3-27-sender-clock.md`. This report says what the planner read, built and
measured to write it, at `main` `5505782` (cache v54), on 2026-11-21. No recording of the owner's was opened,
and no file of the game, of Steam or of Windows. Every figure here is of the model (the app's clock as built, the
study's generator, or a prototype of the order's clock), unless it is quoted from the record.

## What was read

- `CLAUDE.md`, `docs/PIPELINE.md`, the open question of `docs/PROGRESS.json` that begins "Steam's sender, after
  the private reads", and finding 28 of `tests/REFERENCE_2026.md` whole, with its paragraphs added on 2026-11-20
  and 2026-11-21.
- The study's four files: its generator, its vector of 300 reads, its note on the rule and each number's
  standing, and its scores. They hold numbers and the project's own code.
- The code: `steam-sender.js` whole; `voice-channel.js` (the zero, `ARRIVAL_SECONDS`, the timeline);
  `engine/steam.js` (`steamReach`, `steamBoundTick`, `steamSenderOptions`, `steamChannel`); where
  `engine/render.js`, `engine/render-stream.js` and `engine/live-chain.js` make the sender; the page, which
  gives no seed.
- The tests that make or read a clock, and the documents that describe the sender's clock.

## What was built, in a scratch folder

- **A port of the rule into `steam-sender.js`**, as the order's section "The rule" writes it, in two forms: with
  the capture's place fixed at 0 (the study's clock) and with the place drawn (the order's clock).
- **Three copies of the tree:** `main` as it is and one for each form of the port. In each, the queue's `pull()`
  counts its pulls, its fades, its empty pulls, its low pulls and the samples queued. In the two prototypes the
  suites' `check` goes on after a failure, so that every moved check is listed.
- **`tests/steam-sender/gen.mjs` and `tests/steam-sender/vector-seed1.json`** are in the worktree, unchanged
  from the study's, for the orchestrator to commit with the order. The order holds W3-27a's port to them.
  `gen.mjs`'s header names a `README.md` that is the study's private note and is not in the repository; W3-27a's
  builder writes the folder's own.
- Scripts that count the clock's statistics, render a fixture and report the sender's and the queue's figures,
  and measure the arrival of an opening packet on the voice-channel suite's two layouts.

## What was measured

### The port against the reference

- With the place at 0 the port gives the reference's reads **to the last bit** (time, steps, and what ended the
  pass) over 200,000 reads at each of eight settings: seeds 1, 2 and the default; 20 ms packets; a lateness of
  20 ms; 30, 60 and 144 frames a second; a tick of 30 ms.
- What it needs: the grouping of each sum as the order writes it, and the same `Math.log`, `Math.cos` and
  `Math.sqrt`, which one Node process gives both sides.
- The vector holds times to a thousandth of a millisecond, so alone it holds a port to 0.0005 ms only. The
  order's check runs the generator itself beside the port, and uses the vector to show the generator is the
  study's.
- **The reference has no limit on a read.** Reads of four steps in 2,000,000: none with the defaults, with a
  lateness of 20 ms, with 20 ms packets, at 30 or 60 frames a second, or with a 30 ms tick; 9 with 20 ms
  packets and a lateness of 20 ms together; 34 with a lateness of 31.25 ms. The order keeps the app's limit of
  three and leaves the fourth step for the next read. At seed 9, 144 frames a second, 20 ms packets and a
  lateness of 20 ms, the reference's read 9,858 has four steps; the port's has three and its next read one more,
  and the two agree from then on.
- **The reads never run ahead of the capture.** Over 1,200 clocks of 20,000 reads at four settings, the time of
  a read less the capture's time of the last sample it takes was never under 1.6 samples.

### The clock's statistics

Seeds 1 to 40, 20,000 reads each; the clock as built beside the prototype. The record's figures for the sets are
in finding 28 and in the order's table of checks.

| | The clock as built | The prototype |
| --- | ---: | ---: |
| Interval, least and most | 48.00 and 63.70 ms | 47.54 and 67.40 ms |
| Mean interval | 55.85 ms | 55.52 ms |
| Its spread | 4.53 ms | 4.12 ms |
| Intervals under 49 ms | 6.4% | 2.3% |
| Reads in the fullest 4.5 ms window of the 15 ms tick | 30.6% | 64.0% |
| A read off that window after one in it | 69.5% | 51.9% |
| A read off it after one off it | 69.4% | 7.8% |
| Neighbouring reads off it 107 to 111 ms apart | 4.9% | 59.5% |
| Autocorrelation of the intervals at lags 1, 2, 4 and 6 | 0 | +0.06, −0.19, −0.24, +0.21 |
| Chunks of one, two and three steps | 23.3, 74.6, 2.0% | 23.9, 74.5, 1.6% |
| Chunk ends at the favoured place in 8 | 12.5% | 16.1% |
| One-step chunks ending there and at the next | 12.6, 12.4% | 24.6, 24.5% |
| Two-step chunks ending at the next | 12.5% | 8.2% |
| Three-step chunks ending at the two after | 25% | 0.04% |
| Reads a second | 17.90 | 18.01 |
| What ended the pass before a read: the game, a timeout, another wake | | 52.6, 45.4, 2.0% |

These counts are the planner's own, by the time of a read on the 15 ms tick. The study counts by what ended
each pass, so its figures for the rule are close and not the same: 62.7% on the tick, 54.7 and 8.0% for the two
timeout shares, 58% at 107 to 111 ms.

### The breaks, tried on the reference

Each row changes one number of the rule. Twenty seeds of 20,000 reads. This is the table the order's check 7
takes its bands from.

| The change | Mean, ms | Under 49 ms, % | In the window, % | Off after on, % | Off after off, % | 107 to 111 ms, % | Lag 2 | Chunks 1, 2, 3, % | Favoured place, % | Three-step at the two after, % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| the rule | 55.52 | 2.30 | 64.0 | 51.8 | 7.7 | 59.6 | −0.19 | 23.9, 74.5, 1.6 | 16.1 | 0.06 |
| a step may not come early (`tolerance` 0) | 56.05 | 1.30 | 67.0 | 45.4 | 8.0 | 60.3 | −0.20 | 22.5, 75.6, 1.9 | 16.0 | 0.03 |
| `tolerance` 2 ms | 55.12 | 3.19 | 62.1 | 56.7 | 7.1 | 59.5 | −0.18 | 25.0, 73.6, 1.4 | 16.1 | 0.02 |
| no other wakes | 55.65 | 2.23 | 65.0 | 50.5 | 6.1 | 64.7 | −0.20 | 23.5, 74.8, 1.6 | 16.1 | 0.04 |
| 12 other wakes a second | 55.17 | 2.49 | 61.2 | 55.5 | 12.2 | 47.2 | −0.15 | 24.9, 73.7, 1.4 | 16.0 | 0.04 |
| no slip | 55.73 | 3.14 | 63.7 | 51.8 | 9.2 | 66.4 | −0.25 | 23.4, 74.9, 1.7 | 16.1 | 0.04 |
| a slip of 2.6 ms | 55.71 | 1.97 | 64.6 | 49.5 | 9.5 | 38.7 | −0.12 | 23.4, 74.9, 1.7 | 16.1 | 0.03 |
| the fetch at its frame's start | 55.46 | 2.65 | 64.1 | 52.2 | 6.9 | 60.2 | −0.19 | 24.1, 74.3, 1.6 | 16.1 | 0.05 |
| the read at its pass's start | 55.52 | 0.00 | 65.0 | 50.8 | 5.5 | 65.0 | −0.19 | 23.9, 74.5, 1.6 | 16.1 | 0.06 |
| a timeout not on the timer's steps | 55.04 | 1.88 | 58.5 | 54.7 | 23.0 | 13.4 | −0.05 | 25.2, 73.5, 1.3 | 16.0 | 0.02 |
| a timer step of 15 ms | 54.21 | 2.37 | 52.0 | 73.8 | 19.9 | 6.0 | +0.49 | 27.5, 71.6, 0.9 | 16.0 | 0.05 |
| a timer step of 16 ms | 55.88 | 1.85 | 65.7 | 48.3 | 7.7 | 20.6 | −0.40 | 23.1, 75.0, 1.9 | 16.1 | 0.10 |
| a pass of 49 ms | 54.50 | 10.50 | 63.5 | 54.1 | 5.7 | 60.8 | −0.11 | 26.8, 72.1, 1.2 | 16.1 | 0.04 |
| a pass of 51 ms | 56.70 | 0.07 | 66.2 | 44.5 | 12.7 | 55.0 | −0.19 | 20.8, 76.9, 2.3 | 16.0 | 0.05 |
| no fetch by the game | 61.98 | 0.15 | 30.5 | 56.0 | 75.4 | 0.7 | −0.01 | 8.8, 84.0, 7.2 | 15.9 | 0.33 |
| a lateness of 0 | 55.52 | 2.30 | 64.0 | 51.8 | 7.7 | 59.6 | −0.19 | 23.0, 76.4, 0.6 | 16.1 | 0.00 |
| a lateness of 13 ms | 55.52 | 2.30 | 64.0 | 51.8 | 7.7 | 59.6 | −0.19 | 24.8, 72.8, 2.4 | 16.1 | 0.67 |

Two of the fitted numbers are weak in these counts, as the study says: the fetch's place in its frame moves no
statistic outside a band, and the other wakes move two of them by little. Only the bit-for-bit check holds
them.

### The options

Twenty seeds of 20,000 reads. The order's table "What the rule says of other senders" has the figures. They
agree with the record's (58.7, 50.0, 54.9 and 59.8 ms for 30, 60 and 144 frames a second and a 30 ms tick).
With 20 ms packets each of the nine long places of 16 holds more chunk ends than any short one, 2.02 times as
many in the mean (1.64 to 2.08 by seed for the emptiest long against the fullest short).

### The capture's place in its pattern

The study's generator starts the capture with the clock, which its scores do not depend on. In a render it
would put the long step of eight at one place of the source for every seed. On the sender suite's own signal the
silence record after the spurt is one step long in 34.6% of 2,000 seeds with the place fixed, 22.6% with it
drawn and 23.3% on the clock as built; Set D's demo has 2 of 19 (measured, finding 28). The order draws the
place. With it drawn, the reads' times and what ended each pass are the place-0 clock's bit for bit, and the
steps equal a second computation.

One more thing follows the place: the share of messages of one frame, counted as one endless spurt, is 9.0% at
places 0 and 1 and 10.8 to 10.9% at the others.

### The capture's phase against the sound

The lead as its own draw takes every value from 0 to 749 over seeds 1 to 100,000 (87 to 166 times each). W3-21's
checks hold on the prototype; the order's table has the rows.

### The arrival of a spurt's opening packet

Layouts P and Q of `tests/voice-channel.verify.mjs`, at 300 and 66.67 frames a second, `latency()` taken out.

| Seeds | As built | Place fixed | Place drawn |
| --- | ---: | ---: | ---: |
| 1 to 400 | 51.74 ms | 42.53 ms | 42.47 ms |
| 401 to 800 | 51.12 ms | 42.20 ms | 41.82 ms |

The standard error of each cell, by seed, is 0.3 ms (0.5 as built). The constant in the code is 50.5 ms, from
seeds 1 to 50. By rate the drawn-place prototype has 43.1 ms at 300 and 41.4 at 66.67. The order has the
arithmetic of the 9.3 ms and the values of `D`.

### The queue and the render on the public fixtures

The order's two tables have the figures: the test signal at 300, 66.67 and 30 frames a second on the listener's
side over seeds 1 to 40, and the network test signal over seeds 1 to 10. In short:

- The queue's opens, empty pulls, fades and low pulls differ by less than two standard errors at every rate.
- At 300 frames a second there are 8% fewer overflows and 5% fewer samples dropped.
- One seed's mean start of a phrase differs from another's half as much.
- The level moves by 0.02 dB at most and no octave band by more than 0.07 dB, each inside one seed's spread.
- The low-tone fixture (three seeds) opens the queue 19 times on both and drops 94,594 and 94,411 samples at 300
  frames a second (the first prototype).

All of it is on `main` as it is, before W3-26b. What W3-26b's base needs measured again is in the order.

### The live chain

The live sender is `createSender` with the render's seed on the samples pushed; it reads no wall clock. So the
order changes the monitor's chunks as a render's. Its latency without the queue does not move. On the queue it
follows `D`: 11.6 ms sooner at 300 frames a second with the new constant, and unchanged at 66.67, 100 and 30.

### The suites

| Suite | The first prototype (place fixed) | The second (place drawn) | Time |
| --- | --- | --- | ---: |
| `reproduce`, `recordings`, `harness`, `site`, `verify` | pass, no line changed | not run again | 97 s the longest |
| `steam-sender` | the seeded sections fail; the sections on a caller's clock pass | the same | 14 s |
| `voice-channel` | the zero's two checks, a pinned start before sample 0, the tool's `--uptime 0` line | the zero's two checks, the pinned start, a pinned count of seeds | 190 s |
| `steam` | three premises: the pink noise, two spurts that meet, the low-latency onset | two premises: two spurts that meet, lost messages in a row | 158 s |
| `render-channel` | three sets of recorded hashes, seed 8's appended spurt, what the chain keeps | the three sets of hashes, seed 8's appended spurt | 278 s |
| `render-stream` | the recorded hashes of the `steam` cases with the sender and the codec on, and three checks that hold a render to them | not run | 349 s |
| `stages` | the recorded hashes only | not run | 264 s |
| `browser` | stops at one check that lost its premise | passes whole | about 6 min |

The order names each failed check and says how each kind is handled. The checks that fail on one prototype and
not the other are premises of one seed: which spurts meet, which is appended, whether noise opens the gate once.

## Choices made in the order

- **Two parts.** W3-27a adds the clock under a name of its own with its whole suite and moves no render. It can
  be built now beside W3-26b, since their files do not overlap. W3-27b switches the sender and records what
  moved, after W3-26b. One order after W3-26b would do the same with one rise of the cache number; two keep the
  bit-for-bit port apart from the re-recording of the hashes.
- **The capture's place is drawn**, a fifth phase beyond the four of the ruling.
- **The lead is a draw of its own.**
- **Three steps a read at most**, the app's own, where Steam's own room is larger.
- **The arrival constant is measured again inside W3-27b** and set to the mean over seeds 1 to 800 (42.0 ms on
  the prototype).
- **The clock gains two members the sender does not read:** `place` on the clock and `by` on each read, for the
  tests.
- **The options reach `createClock` only.** `createSender` and a render pass none.

## Open questions for the orchestrator

1. **The place's draw and the two new members.** The ruling names four phases. Is a fifth, chosen by the order,
   accepted?
2. **The arrival constant in this order.** It moves `D` by a block at 10, 20, 50, 60, 144 and 300 frames a
   second, so a render on the queue at the page's defaults plays 11.6 ms sooner and the live monitor on the
   queue is 11.6 ms sooner. The other course is to leave 50.5 ms and let every opened spurt lie 10 ms early.
3. **30 frames a second on the listener's side.** With the new constant an opened spurt starts 17 ms before its
   source in the mean there, where it starts 3.5 ms before it now (seeds 1 to 40 of the test signal). The
   constant is measured at 300 and 66.67 only, and `D` at 30 is 0.5 ms from the edge of a block. Is that left
   as it is, or is the constant's measure widened to 30?
4. **Where the render's time starts.** 10.6 ms of the arrival's move are the capture starting 0 to 10 ms after
   the render's start in place of 0 to 31.25 ms. The constant absorbs it. The clock could instead count from the
   capture's start.
5. **The split:** two merges and two rises of the cache number, or one order after W3-26b.
6. **The sender's own tick.** The clock now models the game's fetch on the sender's side. A message still
   reaches the receiver on the first tick of the render's grid at or after 2 ms after the read. Which message a
   fetch takes was not reached by the study, so the order leaves the ticks alone.
7. **The options' ranges:** 10 to 1000 frames a second, a tick of 5 to 100 ms, a lateness of 0 to 31.25 ms.
8. **The default uptime.** 9 days rests on Set D's ends tested on the demo's own chunks. On the prototype 22% of
   spurts end on the seventh chunk at 9 days where the clock as built has 26.5%, and Set D has 7 of 19. A private
   run of Set D's ends against the new clock at each uptime is in the order's list.

## What was not done

- `tests/accuracy.mjs`, `tests/retiming.mjs` and the study's scores were not run: they need the owner's takes.
  They are the order's private runs.
- `render-stream` and `stages` were not run on the second prototype. Their failures on the first are recorded
  hashes only.
- Neither prototype had the new arrival constant, so the checks that pin `D` were not seen to move.
- Nothing was measured on W3-26b's base, which is not on `main` yet.
- The breaks of the order's checks were tried on the reference's numbers and on the statistics. The breaks of
  the port itself (a wait not truncated, a slip drawn again) were not each made; the builder makes them.
