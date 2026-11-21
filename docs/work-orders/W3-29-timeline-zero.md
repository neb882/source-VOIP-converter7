# W3-29: the game timeline's zero at every frame rate

**Status 2026-11-21: planned; rulings wanted ("Questions for the orchestrator", at the end); not built yet.**
Written by a planner on `claude/w3-27b-sender-clock` at `6bc90f6` (expected on `main` as cache v58) from the
repository and from scratch scripts run on that tree. The sender's warm-up is being changed from 1.5 s to 4.5 s
after this plan (the W3-27 order, "A second ruling (2026-11-21)"). Every figure here that runs the sender was
measured with 1.5 s. The builder measures each again on the head it builds from, and this order says which.

**Kind:** a change to how renders are computed. A render of Steam voice on the game's voice queue is placed by the
queue's zero, `D`. Under 66.67 frames a second `D` falls by one to four mixer blocks of 512 samples, so the same
sound sits 11.6 to 46.4 ms later in the render. At 66.67 frames a second and above `D` moves at a few settings by
one block and stays at the others, the page's default among them. The queue, the sender, a demo's packets, the
file's own timing and every other profile do not change by a sample.
**Parts:** one order, one merge (the reasons are in "One build").
**Roles:** `tf-builder` (effort xhigh), then `tf-reviewer`, then a second reader on the stronger model
(`docs/PIPELINE.md`: it changes how renders are computed and what a constant is).
**Branch:** `claude/w3-29-timeline-zero` from `main` after W3-27b's merge. **Worktree:** in the brief.
**Reports:** `docs/reports/W3-29-timeline-zero.md` (the builder's). The planning report is
`docs/reports/W3-29-plan.md`.
**Budget:** 6 hours.
**Cache number:** it rises at the merge, since `voice-channel.js` is a file the site keeps offline. A builder
never sets it.

## Why

A render on the game's voice queue takes `D` samples out of the queue's clock, so that a phrase which opens the
queue sits where its source has it. `voice-channel.js` computes `D` as `latency() + 42.0 ms + the codec's delay`
on whole blocks of 512 samples. The 42.0 ms is one measured constant (W3-27b): the mean of what is left of an opened
phrase's delay when `latency()` is taken out. It was measured at 66.67 and 300 frames a second only.

The constant is two things added. One is the sender's: how long after a phrase's first sample its opening message
leaves. The other is the receiver's: how long after the message's tick the queue first mixes it. The sender's part
does not depend on the listener's frame rate. The receiver's does, and under 66.67 frames a second it is far from
the 5.8 ms it is above.

Measured again for this plan on `6bc90f6` (seeds 1 to 400, layouts P and Q of `tests/voice-channel.verify.mjs`,
`voice_buffer_ms` 100, no codec delay; the order's measure, `offsetStartMs + (D - 44100 latency) / 44.1` over
opened spurts; the standard error by seed in brackets). The suite's `engineRun` pushes each message on the sender's
own tick. A render under 66.67 frames a second pushes it on the tick the engine's arrival rule gives
(`engine/network.js`, `steamFrameArrivals`), so the second column is what a render runs.

| Frames a second | The suite's measure, ms | As a render runs, ms | The sender's part, ms | The receiver's part by the rule, ms |
| ---: | ---: | ---: | ---: | ---: |
| 10 | -24.95 (0.74) | +14.63 (0.93) | 35.22 | -26.67 |
| 20 | -1.97 (0.48) | +19.24 (0.45) | 35.23 | -16.68 |
| 30 | +5.57 (0.58) | +34.93 (0.62) | 35.24 | -0.01 |
| 50 | +29.06 (0.37) | the same | 35.23 | -6.67 |
| 60 | +29.06 (0.39) | the same | 35.22 | -5.01 |
| 66.67 | +41.20 (0.35) | the same | 35.21 | +5.80 |
| 100 | +41.38 (0.33) | the same | 35.21 | +5.80 |
| 144 and 150 | +41.22 (0.35) | the same | 35.25 | +5.80 |
| 200 | +40.56 (0.37) | the same | 35.53 | +5.80 |
| 300 | +42.66 (0.35) | the same | 35.40 | +5.80 by the form kept there |
| 1,000 | +73.49 (0.58) | the same | 35.39 | +5.80 by the form kept there |

The first three columns are measured, the last is computed from the queue's rule ("The receiver's rule"), less
the wait of `15 ms x (waitTicks - 1)`. The sender's part is the mean of `15 ms x tick - start - 160 ms` over the
same opened spurts (standard error 0.33 to 0.36 ms by seed). It differs a little by row because fewer spurts open
the queue at a longer wait: 2,000 to 2,032 up to 100 frames a second, 1,989 at 144 and 150, 1,762 at 200 and
1,664 at 300. At 50 and 60 frames a second the arrival rule moves no message. The first column agrees with the
figures of the W3-27 order's ruling: 41.0 to 43.1 from 66.67 to 300, 28.6 at 60, 29.4 at 50, 4.1 at 30, -2.7 at
20, -24.7 at 10 and 71.9 at 1,000.

So a constant of 42.0 ms is 13 ms too large at 50 and 60 frames a second, 7 at 30, 23 at 20 and 27 at 10, as a
render runs (computed from the second column), and the phrase starts early by that, to the block grid. At 10, 20
and 30 the mean over these two layouts is not the rule's mean, for a reason given under "The phase is fixed".

Real renders show the same (measured for this plan: `process()` with the codec on, the render suite's `talk`
signal of 60 s at two seeds of the signal, render seeds 1 to 6, and the public test signal at render seeds 1 to 8;
the mean `offsetStartMs` of opened spurts, the standard error by render in brackets):

| Frames a second | Talk, today's zero, ms | Talk, the rule's zero, ms | Test signal, today's, ms | Test signal, the rule's, ms |
| ---: | ---: | ---: | ---: | ---: |
| 10 | -32.1 (1.9) | +2.7 | | |
| 20 | -20.1 (1.8) | +3.1 | | |
| 30 | -14.5 (1.4) | -2.9 | -14.4 (2.7) | -2.8 |
| 50 | -13.5 (1.2) | -1.9 | | |
| 60 | -8.8 (1.3) | +2.9 | -5.8 (1.8) | +5.8 |
| 66.67 | -4.9 (1.1) | the same | -2.7 (1.6) | the same |
| 100 | -6.3 (1.2) | the same | | |
| 150 | -1.4 (1.1) | the same | | |
| 300 | +2.8 (1.5) | the same | +4.0 (1.5) | the same |

The rule's column is today's figure moved by the blocks `D` would fall (computed from the measured column, not
rendered). The fix round's builder had +3.6 ms at 300, -3.3 at 66.67 and -15.0 at 30 on the test signal, and the
second reader -12.4 at 30, -4.9 at 60, -11.4 at 50, -19.7 at 20 and -32.5 at 10 on speech. Speech was not
measured for this plan, since the recordings are the owner's.

## What is read, measured, computed and chosen

- **Read** (the repository at `6bc90f6`): the queue's clocks in `createTimeline` (`voice-channel.js`): ticks every
  1,323 half samples and mixer blocks every 1,024, a half sample being 1/88,200 s. Under 1000/15 frames a second
  frame `k` is at `88200 k / fps` half samples, and each frame adds the messages whose tick has come, then runs
  every tick due, then every block due (W3-23r). The arrival at jitter 0 under 1000/15
  (`engine/network.js`, `steamFrameArrivals`). `waitTicks`, `latency()` and the ring of 22,050 samples.
- **Measured on the model** for this plan: the tables above, the sender's part, the capped path and the rule
  against the module opening by opening. The figures are under each heading.
- **Computed**: the receiver's part at each frame rate, every `D`, which `D` moves, the live monitor's figures.
- **Chosen**: that the zero is the mean first sample of an opening with a full pre-roll, the tenth of a
  millisecond the sender's part is taken to, the ticks the mean runs over, the form kept where the ring caps the
  wait, and that the capture's phase stays in the mean.

## The zero, defined

The zero is the delay, on the render's clock, at which the first sample of a phrase that opens the queue is first
heard, in the mean. The render's clock has the source's first sample at 0. "A phrase that opens the queue" is a
spurt whose opening message finds the channel closed and brings the sender's full pre-roll of 2,400 samples at
24 kHz. Its first sample is the first sample of that pre-roll. The mean is over the sender's draws and over where
the opening's tick falls against the listener's frames and mixer blocks.

For one such opening the delay is exact, with no mean in it (measured: every opened spurt with nothing dropped,
seeds 1 to 400, at each frame rate from 10 to 250 of the plan's list, to the half sample the suite's slot reads
to):

    delay of the first sample = (15 ms x p - start) + first(p)

Here `p` is the sender's tick of the opening message, `start` the source time of the spurt's first sample, and
`first(p)` the time from tick `p` to the first mixer block that plays the opening. The first term is the sender's
alone. The second is the receiver's alone and has no draw in it.

So the zero is

    zeroSeconds = S + 0.16 s + the mean of first(p) + the codec's delay
    D = 512 x round(44100 x zeroSeconds / 512)

with `S` the mean of `15 ms x p - start - 160 ms`. The 0.16 s is the eight 20 ms frames of the usual opening,
which `latency()` already counts (`OPENING_SECONDS`), and `S` is counted from their end so that it stays the
figure the old constant held. `D` is on whole mixer blocks, so a zero holds only to within half a block, 5.8 ms
either way. The part left over, `D / 44100 - zeroSeconds`, is known for each setting and is reported.

## The sender's part

`S` is one measured constant. On `6bc90f6` it is 35.3 ms (chosen to the tenth from the measurement below). The
builder measures it again on the head it builds from, the same way, and takes that mean to the tenth of a
millisecond.

**What it is the mean of.** For every spurt of the sender's that begins with a full pre-roll: 15 ms times the tick
of its first message, less the source time of its first sample (`start / 24` ms, `start` in samples at 24 kHz as
the sender reports it), less 160 ms. The signal is layout R: 22 s at 24 kHz, zeros but for eight bursts of 1 s at
the constant level 1000, beginning at 0.7, 3.313, 6.021, 8.857, 11.409, 14.133, 16.799 and 19.571 s. Every pause is
over 1.5 s, so every spurt begins with a full pre-roll. It runs the sender alone (`createSender({ seed })`, `push`,
`finish`), with no queue, so it does not depend on a frame rate.

Measured on `6bc90f6`:

| Seeds | Layout | S, ms | Openings | Standard error by seed, ms |
| --- | --- | ---: | ---: | ---: |
| 1 to 12,000 | R | 35.273 | 96,000 | 0.047 |
| 1 to 4,000 | R | 35.310 | 32,000 | 0.082 |
| 1 to 800 | R | 35.031 | 6,400 | 0.181 |
| 1 to 12,000 | P and Q, full pre-rolls only | 35.142 | 70,778 | 0.058 |

- Seeds 1 to 800 alone read 0.24 ms under the long mean, so the suite's figure runs over seeds 1 to 4,000 (10.5 s
  on the planner's machine) and `--arrival` over 1 to 12,000 (about half a minute).
- By the opening's length (seeds 1 to 4,000, layout R): six frames in 18.3% of openings, eight in 79.5%, nine in
  2.2%. Their own means are 21.3, 37.9 and 56.1 ms (seeds 1 to 12,000, all three layouts). One opening's `S`
  spreads 11.6 ms.
- By the burst's level (seeds 1 to 2,000, all three layouts): 33.3 ms at 400, 35.2 at 1000, 36.4 at 10000. So the
  tenth is not resolved against a real signal. The talk signal's renders above at 66.67, 100 and 150 frames a
  second start 0.6 to 1.0 ms earlier than the rule's own remainder on the block grid gives.
- Today's constant holds the same thing: 41.31 ms at 66.67 frames a second (`ARRIVAL_MEASURED.at67`) is 35.5 plus
  the 5.80 ms of the queue, on the spurts of P and Q that open the queue over seeds 1 to 800. The 42.0 came from
  pooling that with the 42.73 at 300 frames a second, where the measure reads another thing ("Where the ring caps
  the wait").

**A spurt with a short pre-roll is not in the mean.** After a pause just over the sender's hold of 0.4 s a spurt
begins with 750, 1,500 or 2,250 samples of pre-roll. Its `S` is lower: -4.3 ms in the mean after layout P's pause
of 0.5 s and 32.5 after Q's of 0.6 s (measured, seeds 1 to 12,000: 7,987 and 1,952 such openings). Such a spurt
starts early against the zero by the part of the pre-roll it lacks. Most of them join a running queue and are not
opened spurts at all.

## The capture's phase stays in the mean (the 5 ms)

About 5 ms of `S` is a convention: the sender's capture begins 0 to 10 ms after the render's start, drawn from the
seed, 5.0 ms in the mean (measured: `S` against the seed's capture phase has a slope of 0.997 ms a ms, the mean
phase is 4.998 ms, and `S` less the phase is 30.2 ms; seeds 1 to 12,000).

It stays in the mean and is named. The reasons:

- Taking it out of each seed's render would give each seed its own zero. `D` is on whole blocks, so about one
  seed in five would move by a block over all settings, and about one in nine at the page's default (computed: a
  shift of -5 to +5 ms, 2.5 ms in the mean, against a block of 11.6 ms). Which renders move would then depend on
  the seed, and no stop rule by setting would be left.
- The gain is small. A seed's own mean `S` over many openings spreads 3.5 ms across seeds, and 1.7 ms with its
  phase taken out (measured, seeds 1 to 20 over 400 openings each). Both are under the half block of 5.8 ms. The
  page's seed (0xC0FFEE) has a phase of 6.9 ms and an `S` of 39.5 ms over 400 openings, so the page's render sits
  4.2 ms later than the mean, and 2.3 ms with the phase out (measured).
- The documents say it: "of the sender's part about 5 ms is where the capture's first packet falls against the
  render's start, drawn from the seed; the zero takes its mean".

A zero that follows each seed's phase goes with an order that moves every render for another reason (not built
yet; `docs/PROGRESS.json` lists the capture's phase).

## The receiver's rule

All times are in half samples at 44.1 kHz. `TICK` is 1,323 and `BLOCK` is 1,024. `W` is `waitTicks(bufferMs, fps)`.
`first(p, W, rate)` is the time from the sender's tick `p` to the start of the first mixer block that plays an
opening sent on that tick.

**With even ticks (1000/15 frames a second and above).** The message is added on tick `p`, the wait ends on tick
`p + W - 1`, and the opening plays from the first block that starts at or after it:

    first(p) = BLOCK x ceil(TICK x (p + W - 1) / BLOCK) - TICK x p

`TICK` is odd, so over any 1,024 ticks in a row `TICK x n` takes each remainder of 1,024 once, and the mean is
exact (arithmetic):

    mean of first = TICK x (W - 1) + 511.5        that is, 15 ms x (W - 1) + 5.80 ms

**With the frame clock (under 1000/15).** `rate` is the frame rate limited to 10 to 1,000 as `waitTicks` limits it,
and frame `k` is at `f(k) = 88200 x k / rate`, computed in that order as `createTimeline` computes it.

1. The relay, as the engine has it at jitter 0: the message of tick `p` comes on tick
   `a = ceil(f(k) / TICK) - 2`, with `k` the least frame for which `f(k) > TICK x (p + 1)`.
2. The frame that adds it is `k1`, the least frame with `f(k1) >= TICK x a`.
3. Frame `k1` then runs every tick it has, and all of them count toward the wait, also those before tick `a`.
   Its first tick is `i1 = floor(f(k1 - 1) / TICK) + 1`, or 0 when `k1` is 0. The wait ends on tick `i1 + W - 1`.
4. The frame that runs that tick is `k2`, the least frame with `f(k2) >= TICK x (i1 + W - 1)`. Its first block is
   `b0 = floor(f(k2 - 1) / BLOCK) + 1`, or 0 when `k2` is 0.
5. `first(p) = BLOCK x b0 - TICK x p`.

Step 3 is the one a reader gets wrong. The planner's first writing counted the wait from tick `a`, and it missed
the module at 768 of 5,120 ticks at 30 frames a second, 1,024 at 40, 1,023 at 60 and 3,688 at 24, by 5.0, 5.0,
3.3 and 30.0 ms in the mean (computed).

The rule gives the module's first sample exactly (measured: one message of eight frames of a constant on a fresh
timeline, pushed on tick `a`; the first output sample that is not 0 is sample `(TICK x p + first(p)) / 2 - D`; at
`voice_buffer_ms` 100, 40 and 250, at 10, 20, 24, 30, 40, 50, 59.94, 60, 66, 66.67, 100 and 150 frames a second,
ticks 40 to 439, with the relay and without it; no opening differed. The same from tick 0 to 39 with nothing
taken out, `zeroSamples` 0, at 10, 20, 30, 40, 60, 66.6, 66.67 and 100 frames a second).

**The mean under the frame clock** is taken over the sender's ticks 0 to 5,119 (chosen). That is 76.8 s. It is a
whole period of ticks, frames and blocks at 10, 20, 30, 40, 50 and 60 frames a second, and on the even clock it is
five periods, so the closed form above is the same mean. Against ticks 0 to 102,399 it differs by at most 0.29 ms
at the whole rates from 10 to 66 at `voice_buffer_ms` 100 (computed).

The mean of `first`, less the wait of `15 ms x (W - 1)`, at `voice_buffer_ms` 100 (computed):

| Frames a second | Wait, ticks | Mean of first less the wait, ms |
| ---: | ---: | ---: |
| 10 | 1 | -26.67 |
| 20 | 2 | -16.68 |
| 24 | 3 | -20.84 |
| 30 | 3 | -0.01 |
| 40 | 4 | -14.19 |
| 50 | 5 | -6.67 |
| 59.94 | 6 | -2.55 |
| 60 | 6 | -5.01 |
| 66 | 7 | -2.01 |
| 1000/15 and above | 7 and more | +5.80 |

Less the 5.80 ms the old constant held, these are the errors the W3-23 order's second reader computed for `D` as
built: -10.8 ms at 60, -12.5 at 50, -20.0 at 40, -5.8 at 30, -26.7 at 24, -22.5 at 20 and -32.5 at 10.

### The phase is fixed, and what follows

The model starts frame 0, tick 0 and block 0 on the render's first sample (chosen in W3-23, ruling 3). The zero
follows the model as it runs. Three things follow, and the documents say them.

- **A whole frame rate meets the ticks exactly, and the model's queue is then faster than beside it.** At the
  same wait the mean of `first` is 12.5 ms less at 40 frames a second than at 39.99, 7.4 less at 50 than at 49.99,
  7.6 more at 25 than at 24.99, and 2.5 ms apart at 20, 30 and 60 (computed; the rule is the module's, opening by
  opening). With the frames started anywhere in a frame, the mean at 40 is -1.70 ms where the model has -14.19
  (computed with the rule and a phase added, which the module does not have). `README.md` already says the level
  depends on this phase, "which the model fixes and the game does not". The zero is right for the model's render
  at each rate. Whether the model should draw the phase is not this order's ("Not in this order").
- **A rate just beside one whose frame is a whole number of ticks drifts slowly.** At 33.33 frames a second the
  phase between frames and ticks takes about 150 s to go round. Less the wait, the mean over ticks 0 to 5,119
  is -12.85 ms there, the mean over ticks 0 to 102,399 is -9.33 and the mean over a render's first 10 s is -16.17
  (computed). The same holds near 66.66, 22.22, 16.67, 13.33 and 11.11. There the zero is right for a render
  about a minute long and up to about 7 ms off for a short one (computed at 16.67: -23.99 ms over ticks 0 to
  5,119 and -17.00 over the first 10 s).
- **One phrase lands on one phase.** At a low frame rate the frames and ticks repeat every 150 to 300 ms, and a
  phrase at a given place in the file meets the same phase whatever the seed moves by a few ms. So the mean over
  seeds of one layout is the rule at those phrases' phases, not the rule's mean: layouts P and Q read -22.55 ms
  for the receiver's part at 10 frames a second where the mean is -26.67, and on raw ticks at 30, with the wait
  in both, +0.37 where the mean is +11.66 (measured against computed). A check under 66.67 frames a second
  therefore holds the rule opening by opening, and does not hold a mean over seeds to the rule's mean.

### Where the ring caps the wait

Where the wait is longer than the ring's 0.5 s (`latency()` is then 0.5 s; at `voice_buffer_ms` 100 from 231
frames a second up) the opening's first sample is never heard: the ring fills, and the queue drops from its
start. The zero keeps its form there (chosen):

    queue's part = min(0.16 s + mean of first(W), 0.5 s + mean of first(1))

On the even clock that is `latency() + 5.80 ms`, as now. What it is the mean of, measured (seeds 1 to 400, layouts
P and Q, ms over `latency()`; the form gives 41.1 with `S` 35.3):

| Frames a second | First sample heard, into the spurt | Its delay | 100 ms on | 200 ms | 500 ms | 1 s | 1.5 s | Dropped |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 200 | 10 ms | +40.4 | +40.4 | +40.4 | +40.3 | +40.1 | +39.9 | 2.5 ms |
| 240 | 11 ms | +46.7 | +39.9 | +37.1 | +33.9 | +31.4 | +29.9 | 30.1 ms |
| 300 | 80 ms | +67.5 | +42.3 | +39.5 | +34.6 | +31.8 | +30.2 | 119.5 ms |
| 400 | 221 ms | +76.5 | +51.8 | +42.0 | +35.8 | +32.3 | +30.7 | 269.6 ms |
| 1,000 | 1,127 ms | +69.2 | +45.7 | +42.5 | +35.8 | +28.8 | | 1,168.1 ms |

So at 300 frames a second an opened phrase is first heard about 26 ms late against the zero, is on it 0.1 s later,
and runs up to 11 ms early over the next 1.5 s as more is dropped. The suite's `offsetStartMs` reads the first
slot at least 0.2 s into the spurt. At 400 and 1,000 frames a second nothing is heard before that, so it reads the
first sample heard, and that is the 71.9 ms the W3-27 ruling met at 1,000. It is the measure's reading and the
queue's dropping, not a fault of `D`. No single figure is the start of such a phrase, so the form is kept and the
documents give the path. With the frame clock the same form holds as well as it does on the even one (measured at
`voice_buffer_ms` 1000, seeds 1 to 40: the delay 100 ms after the first sample heard is +38.8 ms at 30 frames a
second where the form gives +40.3, and +32.0 at 60 where it gives +32.0).

## A phrase that joins a running queue

There is one zero, the opening's. A phrase that joins a queue still running is not moved by it: the queue has cut
the pause before it, and the phrase comes early by what was cut. That is the game's doing and is what the queue is
run for (finding 7 of `docs/FINDINGS.md`). The game timeline promises this much, and the documents say it so:

- a phrase that opens the queue with a full pre-roll is first heard where its source has it in the mean, to
  within half a mixer block (5.8 ms either way), at every frame rate where the ring does not cap the wait;
- a phrase that joins a running queue comes early by what the queue cut, and no figure is promised for it;
- where the ring caps the wait, the path of "Where the ring caps the wait".

## The change (`voice-channel.js`)

- `ARRIVAL_SECONDS` goes. In its place `SENDER_SECONDS`, the sender's part: `0.0353` on `6bc90f6`, and on the
  builder's head the mean it measures, to the tenth of a millisecond.
- `relayTick(tick, fps)`: step 1 of the rule, for the frame clock; on the even clock it returns `tick`. Exported.
  `engine/network.js` keeps its own writing of the same rule, and the render suite holds the two equal tick for
  tick. `voice-channel.js` imports nothing, as now.
- `first(p, W, rate)` and its mean, as "The receiver's rule" has them. The even clock uses the closed form. The
  frame clock runs the mean over ticks 0 to 5,119, which costs about 1.4 ms on the planner's machine, so the
  module keeps the last results by wait and rate (a small table, emptied when it passes 64 entries).
- `zeroSeconds(bufferMs, fps, codecDelay)`: `SENDER_SECONDS` plus the queue's part plus `codecDelay`, in seconds,
  not rounded. It reads `bufferMs` and `fps` as `waitTicks` reads them and refuses a bad `codecDelay` as `zero()`
  does now. Exported.
- `zero(bufferMs, fps, codecDelay)`: `512 x round(44100 x zeroSeconds / 512)`. Its callers do not change:
  `engine/steam.js`, `engine/live-chain.js`, `live.js` and `createTimeline` call it as now.
- `latency()`, `waitTicks()`, `frameHold()`, `arrivalZero()`, `createChannel` and the queue itself do not change.
- **What a render reports.** The timeline's `info` and `counts()` gain `zero` (the samples taken out, `D`) and
  `zeroSeconds` (the figure before rounding, or `null` where the caller gave `zeroSamples`, as a demo does). They
  reach `codecInfo.channel` as the other fields do. `D / 44100 - zeroSeconds` is then what the block grid leaves at
  this setting, and a reader of `offsetStartMs` can take it out.

`D` at `voice_buffer_ms` 100 with `S` 35.3 ms (computed on `6bc90f6`; with the codec's look-ahead of 156 samples
at 24 kHz, then with no codec delay; the range of `S` over which the rule's `D` with the look-ahead stays):

| Frames a second | D now | D by the rule | Blocks | D / 44100 - zeroSeconds, ms | Stays for S from, to, ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 9216, 8704 | 7680, 7680 | -3, -2 | -0.98, +5.52 | 28.52, 40.13 |
| 20 | 9728, 9728 | 8704, 8704 | -2, -2 | -2.75, +3.75 | 26.75, 38.36 |
| 24 | 10752, 10240 | 9216, 9216 | -3, -2 | -1.98, +4.52 | 27.51, 39.12 |
| 30 | 10752, 10240 | 10240, 9728 | -1, -1 | +0.41, -4.70 | 29.90, 41.51 |
| 40 | 11264, 10752 | 10240, 9728 | -2, -2 | -0.41, -5.52 | 29.08, 40.69 |
| 50 | 11776, 11776 | 11264, 10752 | -1, -2 | +0.29, -4.82 | 29.79, 41.40 |
| 59.94 | 12288, 12288 | 12288, 11776 | 0, -1 | +4.39, -0.72 | 33.89, 45.50 |
| 60 | 12288, 12288 | 11776, 11776 | -1, -1 | -4.76, +1.74 | 24.74, 36.35 |
| 66 | 13312, 12800 | 12800, 12288 | -1, -1 | +0.46, -4.65 | 29.96, 41.57 |
| 66.67 and 1000/15 | 13312, 12800 | the same | 0, 0 | +4.26, -0.85 | 33.76, 45.37 |
| 100 | 15360, 14848 | the same | 0, 0 | +5.70, +0.59 | 35.20, 46.80 |
| 144 and 150 | 18432, 17920 | the same | 0, 0 | +0.36, -4.75 | 29.85, 41.46 |
| 200 | 22016, 21504 | 21504, 21504 | -1, 0 | -4.98, +1.52 | 24.51, 36.12 |
| 230 | 23552, 23552 | the same | 0, 0 | -3.54, +2.96 | |
| 240, 300, 400 and 1,000 | 24064, 24064 | the same | 0, 0 | -1.93, +4.57 | 27.56, 39.17 |

The fifth column is what the block grid leaves: where it is positive an opened phrase starts that much early in
the mean, and where it is negative that much late. At the whole rates from 10 to 66, `D` with the look-ahead
falls at 51 of the 57, by one to four blocks, and stays at 53 to 55 and 57 to 59 (computed).

## What must not move, and what moves

**The stop rule.** Nothing moves but through `D`, and `D` moves only where the table the builder prints says so.
Before the switch the builder prints, for `voice_buffer_ms` 20, 40, 50, 100, 150, 200, 250, 300 and 500, with the
look-ahead and with no codec delay, every whole frame rate from 10 to 1,000 and the rates 59.94, 66.67 and 1000/15
at which the new `zero()` differs from the old, with both values. The table goes into the report. A recorded hash
or a pinned figure that moves at a setting not in the table is a reason to stop and ask.

On `6bc90f6` with `S` 35.3 ms that table has, at 67 frames a second and above (computed; one block less in each):

| voice_buffer_ms | With the look-ahead, frames a second | With no codec delay |
| ---: | --- | --- |
| 20 | 101 to 150, 951 to 1,000 | 201 to 250 |
| 40 | 66.67 and 1000/15, 67 to 75, 476 to 500 | 101 to 125, 526 to 550 |
| 50 | 381 to 400 | 81 to 100, 421 to 440 |
| 100 | 191 to 200 | 211 to 220 |
| 150 | 127 to 133 | 141 to 146 |
| 200 | 96 to 100 | 106 to 110 |
| 250 | 77 to 80 | 85 to 88 |
| 300 | 1000/15 only | 71 to 73 |
| 500 | none | none |

At 59.94 frames a second `D` moves at most of these buffers, as under the frame clock everywhere. The settings at
67 and above move because the old constant, 42.0 ms, is 0.9 ms over `S + 5.80`, and a block's edge lies in that
0.9 ms at one setting in thirteen.

**Must not move, at `voice_buffer_ms` 100:** `D` at 66.67, 1000/15, 144, 150, 300 and 1,000 frames a second, with
the look-ahead and without. It stays for any `S` from 34.06 to 36.35 ms (computed). So the page's default render
(300 frames a second, `voice_buffer_ms` 100) does not change by a byte, nor a render at 66.67 with that buffer.
If the builder's `S` is outside 34.8 to 35.8 ms, stop and ask.

**The edge at 100 frames a second.** With the look-ahead `D` at 91 to 100 frames a second stays 15360 only while
`S` is 35.20 ms or more, and the measured `S` is 35.27. If the builder's `S` comes to 35.1 or less at the tenth,
`D` there falls to 14848. That is the rule's doing and no reason to stop, but the pins and the figures at 100
then move too (the live monitor's 148.0 ms becomes 136.4), and the report says so.

**Recorded hashes and pins, by case.** Every seeded hash moves once more with the warm-up of 4.5 s before this
order, so the cases are named and no value is given. On the builder's base:

- `tests/render-channel.verify.mjs`, section 29 (a render's end, the WAV hashes at 300, 66.67, 60 and 30 frames a
  second, jitter 0 and 50): the four at 60 and 30 move, and are recorded again in a commit of their own. The four
  at 300 and 66.67 must not move. Each of the eight still has the source's length and no `over`.
- The same suite, section 24 (the threshold): the render at 66.67 stays the recorded one, and 1000/15 equals it.
  The detail's "differs from sample" figures at 66.6 and the double below may move.
- The same suite, section 10 (the live chain): `LIVE_D` moves at 10, 20, 30, 50 and 60 to the rule's values and
  stays at 66.67, 100 and 300. The suite's own values come from its own writing of the rule ("The checks", 2), not
  from numbers copied from the module.
- The same suite, section 7 (`D = { 300: 24064, 66.67: 13312 }`) and section 21's pin of 24064 at 300: stay.
- The same suite, section 27 (`OPEN_MAIN`, the ticks on which the channel opens): must not move at any frame
  rate, since the queue does not change.
- `tests/voice-channel.verify.mjs`: the threshold's two hashes (made-up messages at 66.67 frames a second, no
  codec delay). The samples' hash must not move. The info's hash moves only by the two fields added: the check
  takes `zero` and `zeroSeconds` out before it hashes, and the recorded hash then stays.
- The same suite: the pins `12800, 14848, 24064` and `13312, 15360, 24064` at 66.67, 100 and 300 stay. `zeroOf`,
  `ARRIVAL_MS` and `ARRIVAL_MEASURED` are rewritten ("The checks").
- `tests/voicequeue/reference-frames.mjs` holds its own copy of the old formula (`latency + 0.042 + delay`). It
  takes the rule in the suite's own writing.
- `tests/render-stream.verify.mjs` (`--hashes`: the game's timeline at the default 300, a demo at 66.67) and
  `tests/stages.verify.mjs` (300 and 66.67): must not move. Its `--hashes` output is the same byte for byte before
  and after, unless a case hashes `codecInfo.channel`, in which case it moves by the two fields only and the
  builder shows that.
- `tests/reference.verify.mjs`, the beep take: its second render is at 200 frames a second with seed 3, where `D`
  falls a block. No hash is recorded there. The check must pass as written.
- `tests/browser.verify.js`: a pinned figure of the live monitor's at the page's default does not move.
- A demo's packets (`arrivalZero`), the file's own timing, every profile but `steam`, the sender
  (`steam-sender.js` and its suite) and `tests/predictions/predictions.json`: untouched. Every prediction renders
  on the source's timeline.

**What a moved render is.** Where `D` falls by `n` blocks, the voice at the mix point is the same samples
`512 n` later, with `512 n` samples more of the queue's start in the render and as much less of its end before
the play-out. After the mix point a render at a device rate other than 44,100 Hz is not the old one shifted, since
512 samples are not a whole number of device samples.

## The live monitor

The monitor on the queue holds back `D` and, under 67 frames a second, a frame's blocks (`engine/live-chain.js`:
`hold = D + liveQueueHold(fps)`, and the render's sample `n` is the chain's sample `n`).

- **Its sound does not come sooner or later** (read, and to be checked). The chain gives out the queue's output a
  frame's blocks after the queue makes it, whatever `D` is: a lower `D` puts the same sound later in the render
  and the chain holds back as much less. From the old hold on, the chain's output is the old output sample for
  sample.
- **The figure it reports falls where `D` falls.** The panel, the switch's help and `queueCostMs` read the hold.
  At `voice_buffer_ms` 100 the step over the switch off becomes (computed with `S` 35.3): 78.4 ms at 10 frames a
  second where it is 113.2, 55.2 at 20 where it is 78.4, 66.8 at 30 where it is 78.4, 78.4 at 50 where it is 90.0,
  90.0 at 60 where it is 101.6. At 66.67, 100 and 300 it stays 101.6, 148.0 and 345.4 ms.
- The old figure was too high by that much: the true mean time from the microphone to the queue's output is the
  zero before rounding, and the old `D` was over it by one to four blocks under 67 frames a second.

## The checks

Each is run by the suite's own code. "The suite's rule" is a writing of "The receiver's rule" that steps the
frames one at a time, as `createTimeline` does and as the module's closed arithmetic does not: for each frame it
adds what has come, runs each tick due and each block due, and notes the first block mixed after the wait. It
lives beside the second model in `tests/voicequeue/`. Every expected figure below is the planner's on `6bc90f6`,
and the builder states its own beside it where the sender is in it.

1. **The rule against the queue, opening by opening** (`tests/voice-channel.verify.mjs`). One message of eight
   frames of a constant on a fresh timeline made with `zeroSamples` 0, pushed on `relayTick(p, fps)`; the first
   output sample that is not 0 is sample `(1323 p + first(p)) / 2` by the suite's rule. At `voice_buffer_ms` 100,
   40 and 250 and 10, 20, 24, 30, 40, 50, 59.94, 60, 66, 66.6, 66.67, 100 and 150 frames a second, ticks 0 to 439,
   with the relay and,
   under 1000/15, without it, wherever the ring does not cap the wait. Expected: every opening equal. It must
   fail when the wait is counted from the message's own tick (step 3; 768 of 5,120 ticks at 30 frames a second).
2. **`zeroSeconds` and `zero` against the suite's rule.** Over the grid of the stop rule's table the module's
   `zeroSeconds` equals `S` plus the suite's own queue's part plus the delay to 1e-12 s, and `zero` is that on
   whole blocks. On the even clock the suite's mean over ticks 0 to 5,119 equals `1323 (W - 1) + 511.5` half
   samples exactly. It must fail when the mean runs over 1,000 ticks in place of 5,120, when the cap's term uses
   `W` in place of 1, and when `SENDER_SECONDS` is 0.042.
3. **`relayTick` is the engine's rule** (`tests/render-channel.verify.mjs`, with section 22): equal to
   `engine/network.js`'s arrival at jitter 0 for ticks 0 to 5,119 at 10, 20, 24, 30, 40, 50, 59.94, 60, 66 and
   66.6 frames a second, and the tick itself at 66.67 and above. It must fail when either writing's `- 2` is
   `- 1`.
4. **The sender's part.** Layout R, seeds 1 to 4,000, the sender alone: the mean of
   `15 x tick - start / 24 - 160` over every spurt's first message. Expected on `6bc90f6`: 35.310 ms over 32,000
   openings, every one with a full pre-roll, six, eight and nine frames in 5,859, 25,434 and 707 of them. The
   suite records the builder's figure (`SENDER_MEASURED`) and holds it to 1e-9 ms, holds `SENDER_SECONDS` to the
   recorded mean over seeds 1 to 12,000 at the tenth, and holds the 4,000-seed mean within 0.3 ms of the constant.
   `--arrival` measures seeds 1 to 12,000 again (35.273 ms over 96,000 on `6bc90f6`). It must fail when the
   constant is 0.5 ms off.
5. **The identity through the sender.** `engineRun` gains an option that pushes each message on
   `relayTick(tick, fps)`; without it it runs as now, so no check that stands moves. Layouts P and Q, seeds 1 to
   50, with the option, at 20, 30, 50, 60, 66.67, 100 and 150 frames a second: for every opened spurt with nothing
   dropped, `offsetStartMs + D / 44.1` is `15 p - start + first(p) / 88.2` to within 0.05 ms, `p` and `start`
   read from the spurt's first message. Expected: every such spurt (the planner's differences were -0.034 to
   -0.012 ms, the slot's half sample). At 10 frames a second `offsetStartMs` is later than that, by 1.7 to 1.9 ms
   in the mean, since the queue runs dry between the bursts of a frame and pads; the check there holds the mean
   between 0 and 4 ms. It must fail without the option at 20 and 30 frames a second (the relay is 20.0 and 18.3
   ms in the mean there).
6. **The mean at 66.67 frames a second and above.** The check that stands ("an opened spurt's `offsetStartMs`
   averages within 5.8 ms of 0, and with the block grid taken out to within 3 standard errors of 0") stays, with
   the grid's part read from `zeroSeconds`, at 66.67 and 100 frames a second. At 300 the ring caps the wait and
   the check holds what is measured there: with the grid out, the mean is +1.6 ms (42.66 against 41.1), within
   3 ms of 0.
7. **Real renders under 67** (`tests/render-channel.verify.mjs`). The suite's `talk(60, 24000, 1)` through
   `process()` on the queue with the codec on, render seeds 1 to 3: the mean `offsetStartMs` of opened spurts is
   within 6 ms of 0 at 30 frames a second and at 10. The planner's figures: -3.2 ms at 30 and +4.0 at 10 by the
   rule's zero (computed from renders on today's), where today's zero gives -14.8 and -30.8 (measured, 58 and 57
   opened spurts). It must fail on the old zero.
8. **The live chain** (section 10). The chain's sample `n` is the render's sample `n` at 60, 30 and 10 frames a
   second, as now, with the hold from the rule. One more check: at 30 frames a second a hash of the chain's output
   from the old hold on, recorded on the commit before the switch, is the hash after it, while `latencyMs` is
   11.6 ms less. It must fail when the chain's hold does not follow `D`.
9. **What a render reports.** `codecInfo.channel.zero` is `zero()` at the render's settings and `zeroSeconds` the
   module's; with a demo's packets `zero` is the given zero and `zeroSeconds` is `null`.
10. **The ring's cap.** At 300 frames a second, layouts P and Q, seeds 1 to 50: the delay of an opened spurt
    100 ms after its first slot heard, less `zeroSeconds`, is within 3 ms of 0 in the mean (the planner's: +1.2 ms
    over seeds 1 to 400), and the first slot heard is 15 to 35 ms over it (+26.4). This is a record of the path,
    so that a change of it is seen.

The whole suite passes: `npm test`, and each suite named above by itself.

## One build

One order and one merge. W3-27 was split because its first part could be merged with no render changed and its
clock needed a reference of its own. Here the function is short, its check is an exact identity against the queue
that already runs, and nothing at the page's default moves. The order of the commits keeps the halves apart:

1. `relayTick`, `first`, `zeroSeconds` beside the old `zero()`, with checks 1 to 4. `--hashes` of the render
   stream's suite is the same byte for byte, and no render changes.
2. The stop rule's table, printed and put in the report.
3. The switch: `zero()` reads `zeroSeconds`, the reported fields, `engineRun`'s option, the rewritten pins and
   checks 5 to 10.
4. The recorded hashes that moved, in a commit of their own, from the run in which every other check passed.
5. The words.

## The words

- `README.md` and `docs/VOICE-PATH.md`, "Under 67 frames a second": the sentence that a phrase which opens the
  queue plays early by 18, 8, 18 and 19 ms goes, and `docs/ACCURACY.md` and `docs/FINDINGS.md` wherever they
  repeat it. In its place: the zero follows the queue's rule at each frame
  rate, a phrase that opens the queue is placed to within half a mixer block in the mean, the model's phase is
  fixed and a whole frame rate meets the ticks exactly (the figures of "The phase is fixed"), measured on the
  model. The builder measures the sentence's figures again on its head.
- `docs/LIVE.md`: the table's rows at 60, 30, 20 and 10, its paragraph on the zero, and that the monitor's sound
  did not move while its figure did.
- `tests/REFERENCE_2026.md`: added lines to finding 28 (the arrival constant) and finding 22 (the frame clock):
  what the constant was the sum of, the sender's part and how it is measured, the rule, the capped path, the
  capture's phase named as a convention, the phase's three consequences. Each figure with its standing.
- `tests/README.md`: the suite's row and `--arrival`'s.
- `tests/predictions/PREDICTIONS.md`: a "Changed after registration" paragraph. `voice-channel.js` is not a
  hashed model file, and no prediction renders on the queue.
- `docs/PAGE.md` and the page's help, only where a figure of the queue's wait at a frame rate under 67 is stated.
- Comments in `voice-channel.js` at `zero()`, `createTimeline` and `arrivalZero()`.
- `docs/PROGRESS.json` and `docs/README.md` are the orchestrator's.

## Files

May touch: `voice-channel.js`; `tests/voice-channel.verify.mjs`, `tests/voicequeue/` (the suite's rule, the
second model's zero, `engineRun`'s option), `tests/render-channel.verify.mjs`, and `tests/render-stream.verify.mjs`,
`tests/stages.verify.mjs`, `tests/browser.verify.js` only where a pinned figure or a hash of the fields moves; the
documents of "The words"; the report. `live.js` and `app/render.js` only in a text that states the zero's parts.

May not touch: `steam-sender.js`, the files under `engine/` (the engine calls `zero()` as now; if a field does not
reach `codecInfo.channel` without a change there, stop and ask), `tests/predictions/predictions.json`, `sw.js`'s
number.

## Done means

- The checks pass, each fails on its break, and the report shows each break's output.
- The report has the stop rule's table, every pin and hash that moved by case with the setting, the sender's part
  measured on the builder's head with its standard error, and the tables of "Why" measured again at 10, 20, 30,
  50, 60, 66.67, 100, 150 and 300 frames a second.
- No render at the page's default moved: the render stream's `--hashes` before and after are in the report.

## Stop and ask

- An opening at which the queue differs from the rule.
- `S` on the builder's head outside 34.8 to 35.8 ms.
- A hash or pin that moves at a setting not in the printed table, or `D` moving at 66.67, 144, 150, 300 or 1,000
  frames a second at `voice_buffer_ms` 100.
- A field that needs a change under `engine/` to be reported.
- Check 8's hash differing: the monitor's sound would then have moved.

## Not in this order

- **A demo's zero.** `arrivalZero()` is `latency() - 0.16 s` on whole blocks and counts none of the receiver's
  part. With no relay that part, less the wait, is +5.8 ms on the even clock and -46.7 ms at 10 frames a second,
  -36.7 at 20, -18.3 at 30, -6.7 at 50 and -5.0 at 60 (computed). No page path runs a demo's
  packets on the queue (W3-02g-b is withdrawn). Not built yet.
- **A drawn frame phase.** The model starts its frames on the render's first sample. A phase drawn from the seed
  would take away the exact meeting at whole frame rates, would move every render under 67 frames a second, and
  needs a ruling on W3-23's ruling 3. Not built yet.
- **A zero that follows the seed's capture phase.** Not built yet; the reasons are above.
- **The start of a phrase where the ring caps the wait.** The queue drops it; a take at 300 frames a second would
  settle whether the game does (`docs/owner-runs.md`).

## Questions for the orchestrator

1. **The constant to the tenth.** The W3-27 order took its constant to the half millisecond. Here the measured
   35.27 ms lies 0.02 ms from the half millisecond's edge at 35.25, and a block's edge at 100 frames a second lies
   at 35.20. The plan takes the tenth (35.3). Either way `D` at 100 frames a second rests on under 0.1 ms.
2. **The zero follows the model's fixed phase.** At 40 frames a second that is 12.5 ms from the zero with the
   frames anywhere. The plan follows the model, since the order is to line the model's render up. If the phase is
   to be drawn instead, this order waits for that one.
3. **The capped form.** The plan keeps it and records the path. The other choice is a zero for the first sample
   heard, which would move `D` at the page's default by two blocks (about 26 ms) and every recorded hash there.
4. **A demo's zero**: an order of its own, or left while no page path runs it.
