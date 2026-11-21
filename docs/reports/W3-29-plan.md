# W3-29, the plan: what was read and measured

The order is `docs/work-orders/W3-29-timeline-zero.md`. This report says what the planner read and measured to
write it, on `claude/w3-27b-sender-clock` at `6bc90f6`, on 2026-11-21. No recording of the owner's was opened, and
no file of the game or of Steam. Every figure here is of the model at that commit, with the sender's warm-up of
1.5 s. The warm-up is being changed to 4.5 s after this plan, so the order has the builder measure every figure
that runs the sender again.

## What was read

- `CLAUDE.md`, `docs/PIPELINE.md`, `docs/PROGRESS.json`, the W3-27 order whole with its "A ruling after the second
  read (2026-11-21)" (read from the branch that holds it), and the W3-23 order.
- The code: `voice-channel.js` (`latency`, `zero`, `arrivalZero`, `frameHold`, `createTimeline`), `steam-sender.js`
  (`createClock`, `createSender`), `engine/network.js` (`steamFrameArrivals`, `steamArrivalPlan`),
  `engine/steam.js` (`steamChannel`), `engine/live-chain.js` (the hold on the queue), `live.js` (`queueCost`).
- The tests: `tests/voice-channel.verify.mjs` (`--arrival`, `ARRIVAL_MEASURED`, the opened-spurt checks, the
  burst check, the threshold's hashes), `tests/voicequeue/` (`engineRun`, the second model's zero),
  `tests/render-channel.verify.mjs` (the pins of `D`, sections 10, 24, 27 and 29).
- The documents that state the zero or a figure that rests on it: `docs/LIVE.md`, `README.md`,
  `docs/VOICE-PATH.md`, finding 28 of `tests/REFERENCE_2026.md`, `tests/predictions/PREDICTIONS.md`.

## What was built, in the scratch folder

Nothing in the repository but the order and this report. The scripts are in the planner's scratch folder and are
not committed. Each is described well enough in the order for the builder to write it again in the suite.

- A measure of the queue through the sender: layouts P and Q, the sender once a seed, then a timeline at each of
  10, 20, 30, 50, 60, 66.67, 100, 144, 150, 200, 230, 240, 250, 300, 400 and 1,000 frames a second, on the sender's
  own ticks and, under 66.67, on the ticks the arrival rule gives. For each spurt: whether it opened, the suite's
  two offsets, the opening message's tick and start, the first slot heard and the delay at six later times.
- A measure of the sender alone: layouts P, Q and R, the tick, start, pre-roll and frames of each opening.
- A prototype of the order's function (the rule, its mean, the queue's part, `zeroSeconds`, `zero`).
- A check of the rule against the module on single openings.
- Real renders through `process()` with the codec on, on the render suite's `talk` signal and the public test
  signal.

## What was measured

### The order's measure at each frame rate

Seeds 1 to 400, layouts P and Q, `voice_buffer_ms` 100, no codec delay; the mean of
`offsetStartMs + (D - 44100 latency) / 44.1` over opened spurts, the standard error by seed in brackets.

| Frames a second | On the sender's ticks, ms | On the arrival rule's ticks, ms | Opened spurts |
| ---: | ---: | ---: | ---: |
| 10 | -24.95 (0.74) | +14.63 (0.93) | 2,012 and 2,008 |
| 20 | -1.97 (0.48) | +19.24 (0.45) | 2,032 and 2,027 |
| 30 | +5.57 (0.58) | +34.93 (0.62) | 2,020 and 2,014 |
| 50 | +29.06 (0.37) | the same | 2,005 |
| 60 | +29.06 (0.39) | the same | 2,001 |
| 66.67 | +41.20 (0.35) | | 2,000 |
| 100 | +41.38 (0.33) | | 2,000 |
| 144 and 150 | +41.22 (0.35) | | 1,989 |
| 200 | +40.56 (0.37) | | 1,762 |
| 230 | +40.46 (0.34) | | 1,670 |
| 240 | +37.79 (0.28) | | 1,665 |
| 250 | +40.23 (0.29) | | 1,664 |
| 300 | +42.66 (0.35) | | 1,664 |
| 400 | +74.17 (0.57) | | 1,663 |
| 1,000 | +73.49 (0.58) | | 1,661 |

The brief's figures are met: 41.0 to 43.1 from 66.67 to 300, 28.6 at 60, 29.4 at 50, 4.1 at 30, -2.7 at 20, -24.7
at 10, 71.9 at 1,000. The suite's `engineRun` applies no arrival rule, so under 66.67 frames a second its measure
is not of what a render runs. The second column is.

### The measure taken apart

- For every opened spurt with nothing dropped, the first slot's delay is
  `(15 p - start) + first(p)` to within -0.034 to -0.012 ms, the slot's half sample, at every rate from 10 to 250
  (1,989 or more spurts a rate up to 150, 1,548 at 200, 466 at 230, 71 at 240, 3 at 250).
- `offsetStartMs` is the first slot's offset less 0.03 ms at every rate where the ring does not cap the wait,
  but at 10 frames a second, where it is 1.7 to 1.9 ms later (the queue pads between a frame's bursts).
- The sender's part over these opened spurts is 35.21 to 35.25 ms from 10 to 150 frames a second, 35.53 at 200
  and 35.39 to 35.43 from 230 to 1,000 (standard error 0.33 to 0.36 by seed). The set of spurts that open differs
  by rate.

### The rule against the module

One message of eight frames on a fresh timeline; the first output sample that is not 0.

- With today's `D`: ticks 40 to 439, `voice_buffer_ms` 100, 40 and 250, at 10, 20, 24, 30, 40, 50, 59.94, 60, 66,
  66.67, 100 and 150 frames a second, with the relay and without it. Every opening is where the rule says (800 of
  800 under the frame clock, 400 of 400 on the even clock, for each setting where the ring does not cap).
- With `zeroSamples` 0: ticks 0 to 39, the same three buffers, at 10, 20, 30, 40, 60, 66.6, 66.67 and 100. Every
  opening is where the rule says.
- At 40, 50, 60 and 30 frames a second and beside each (40.01, 40.1 and so on, 59.94, 29.97), 423 openings each:
  none differs from the rule.
- The planner's first writing of the rule counted the wait from the message's own tick. It missed the module at
  some openings under the frame clock by two to five blocks. In the frame that adds a message every
  tick of that frame counts, also those before the message's own.

### The receiver's part by the rule

The mean of `first` over ticks 0 to 5,119, less `15 ms x (W - 1)`, at `voice_buffer_ms` 100 (computed):

| Frames a second | With the relay, ms | On the sender's ticks, ms |
| ---: | ---: | ---: |
| 10 | -26.67 | -46.65 |
| 20 | -16.68 | -36.67 |
| 24 | -20.84 | -39.15 |
| 30 | -0.01 | -18.33 |
| 40 | -14.19 | the same |
| 50 | -6.67 | the same |
| 59.94 | -2.55 | the same |
| 60 | -5.01 | the same |
| 66 | -2.01 | the same |
| 1000/15 and above | +5.80 | the same |

Less 5.80 ms these are the W3-23 order's second reader's errors of `D` (-10.8 at 60, -12.5 at 50, -20.0 at 40,
-5.8 at 30, -26.7 at 24, -22.5 at 20, -32.5 at 10).

### The fixed phase

- At the same wait: 40 frames a second -14.19 ms, 39.99 -1.57; 50 -6.67, 49.99 +0.73; 25 -11.65, 24.99 -19.25;
  60 -5.01, 59.99 -2.55; 30 -0.01, 29.99 -2.56; 20 -16.68, 19.99 -19.30 (computed, ticks 0 to 5,119).
- With a phase added to the frames and the mean taken over 48 phases (computed; the module has no such option):
  -29.20 at 10, -19.20 at 20, -2.53 at 30, -1.70 at 40, +0.80 at 50, -2.53 at 60. The model's fixed phase is up
  to 12.5 ms from that at a whole rate (40), and 2.5 ms at 10, 20, 30 and 60.
- The mean over ticks 0 to 5,119 against ticks 0 to 102,399: at most 0.29 ms apart at the whole rates from 10 to
  66. At rates beside a frame of a whole number of ticks it is more: 3.5 ms at 33.33, 22.22, 11.11 and 66.66, 3.8
  at 100/3 as a double, 0.9 at 13.33.
- The first 10 s of a render against ticks 0 to 5,119: at most 0.86 ms apart at the whole rates, 3.3 ms at 33.33,
  7.0 at 16.67.

### The sender's part

`15 ms x tick - start - 160 ms` over openings with a full pre-roll, bursts at level 1000.

| Seeds | Layout R, ms | Layouts P and Q, ms | All three, ms |
| --- | ---: | ---: | ---: |
| 1 to 800 | 35.031 (0.181) | 34.966 (0.213) | 35.003 (0.160) |
| 1 to 2,000 | 35.185 (0.114) | 35.142 (0.138) | 35.167 (0.103) |
| 1 to 4,000 | 35.310 (0.082) | 35.174 (0.099) | 35.252 (0.073) |
| 4,001 to 8,000 | 35.273 (0.081) | 35.068 (0.101) | 35.186 (0.074) |
| 8,001 to 12,000 | 35.237 (0.080) | 35.183 (0.101) | 35.214 (0.073) |
| 1 to 12,000 | 35.273 (0.047) | 35.142 (0.058) | 35.217 (0.042) |

- Layout R over seeds 1 to 4,000 takes 10.5 s and over 1 to 12,000 about half a minute, the sender alone.
- Openings of six, eight and nine frames: 18.5, 79.3 and 2.2% over all three layouts, at 21.3, 37.9 and 56.1 ms.
  One opening's spread is 11.6 ms, its range -5.0 to 73.9.
- Short pre-rolls (seeds 1 to 12,000): 7,987 in layout P at -4.33 ms, 1,952 in Q at 32.49. All openings of P and
  Q, short ones among them: 31.3 ms.
- By level, seeds 1 to 2,000: 36.35 ms at 10000, 35.17 at 1000, 33.31 at 400.
- From the loud onset to the opening message's tick: 85.3 ms. From the pre-roll's start to the onset: 109.9 ms.
- The capture's phase: `S` against it has a slope of 0.997, the mean phase is 4.998 ms, `S` less the phase 30.22.
  A seed's mean `S` over its 13.9 openings spreads 4.64 ms, 3.65 with the phase out. A seed's own `S` over 400
  openings (seeds 1 to 20) spreads 3.53 ms, from 28.7 to 40.5, and 1.74 with the phase out. The page's seed has
  39.52 ms with a phase of 6.91 ms.

### Where the ring caps the wait

The delay path is in the order's table (seeds 1 to 400). With the frame clock, at `voice_buffer_ms` 1000 and seeds
1 to 40: at 30 frames a second the first sample heard is 88 ms into the spurt at +59.2 ms over `latency()`, then
+38.8 at 100 ms on, +34.6, +30.8, +28.3, +24.6 and +22.6 at 1.5 s, with 127 ms dropped. At 60 it is 513 ms in at
+66.4, then +32.0, +28.1, +26.6, +24.4, +20.8 and +18.3, with 568 ms dropped. At 20 the ring does not cap, and
the measure is -1.9 ms where the rule gives -1.4.

### Real renders

`process()` on the queue with the codec on, `voice_buffer_ms` 100; the mean `offsetStartMs` of opened spurts and
what the rule's `D` would leave (the measured figure moved by the blocks; not rendered).

| Signal | Frames a second | Opened | Today's zero, ms | The rule's, ms | The grid's part by the rule, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| talk, two signals, seeds 1 to 6 | 10 | 218 | -32.10 (1.87) | +2.73 | +0.98 |
| | 20 | 222 | -20.12 (1.81) | +3.10 | +2.75 |
| | 30 | 221 | -14.46 (1.38) | -2.85 | -0.41 |
| | 50 | 219 | -13.48 (1.22) | -1.87 | -0.29 |
| | 60 | 218 | -8.75 (1.31) | +2.86 | +4.76 |
| | 66.67 | 217 | -4.86 (1.10) | the same | -4.26 |
| | 100 | 214 | -6.34 (1.17) | the same | -5.70 |
| | 150 | 212 | -1.38 (1.05) | the same | -0.36 |
| | 300 | 188 | +2.81 (1.53) | the same | +1.93 |
| test signal, seeds 1 to 8 | 30 | 144 | -14.37 (2.73) | -2.76 | -0.41 |
| | 60 | 144 | -5.82 (1.76) | +5.79 | +4.76 |
| | 66.67 | 144 | -2.67 (1.57) | the same | -4.26 |
| | 300 | 122 | +4.03 (1.53) | the same | +1.93 |

The last column is `zeroSeconds - D / 44100`, what an opened phrase would start at if the rule were exact for
the signal. The talk signal reads 0.6 to 2.4 ms under it from 30 to 150 frames a second, which fits its lower
level (the sender's part is 33.3 ms at level 400). At 10 it reads 1.8 ms over, the padding named above, and at
300 the ring caps the wait. At 1,000 frames a second the talk renders' mean is +159.6 ms with a
median of +44.0 and 1,035 ms dropped: the measure reads the first sample heard there. The fix round's builder had
+3.6, -3.3 and -15.0 ms at 300, 66.67 and 30 on the test signal.

### Which `D` moves

In the order's tables (computed with `S` 35.3 ms). With 35.5 in place of 35.3, `D` is another at 105 of 17,838
settings (nine buffers, two codec delays, the whole rates from 10 to 1,000). With 36.2, today's 42.0 less 5.80,
no `D` on the even clock moves at `voice_buffer_ms` 100. With 35.0, `D` at 91 to 100 frames a second with the
look-ahead also falls a block.

### The live monitor

`engine/live-chain.js` holds back `D + liveQueueHold(fps)` and gives out the render's sample `n` as its own
sample `n` (read). So the queue's output leaves the chain a frame's blocks after the queue makes it, whatever `D`
is, and the monitor's sound does not move in time (inferred from the code; the order has a check). The figure it
reports falls with `D`: the figures are in the order (computed).

## Choices made in the order

- The zero is the mean first sample of an opening with a full pre-roll. The identity above is exact for it, and
  `offsetStartMs` equals it where nothing is padded or dropped.
- The sender's part is taken to the tenth of a millisecond, 35.3 on this commit. The brief's "about 35.5" is
  today's 41.31 less 5.80 on seeds 1 to 800 of P and Q; over 12,000 seeds the mean is 35.14 to 35.27 by layout.
- The mean runs over ticks 0 to 5,119, and the zero follows the model's fixed phase.
- The capture's phase stays in the mean and is named.
- One zero, the opening's. A phrase that joins a running queue is not moved by it.
- The capped form is kept, and the path is recorded.
- One build.

## Open questions for the orchestrator

They are at the end of the order: the tenth against the half millisecond with the edge at 100 frames a second,
the fixed phase at whole frame rates, the capped form, and a demo's zero.

## What was not done

- Speech was not rendered: the recordings are the owner's. The brief's speech figures are quoted, not measured.
- No render with the rule's `D` was made. The rule's columns are the measured ones moved by whole blocks.
- The live chain was not run. That its sound does not move is read from its code.
- Nothing was measured with the warm-up of 4.5 s.
- The every-phase means are from the prototype's rule with a phase added; the module cannot run them.
- `tests/browser.verify.js` and `tests/stages.verify.mjs` were searched for frame rates and pins, not read whole.
