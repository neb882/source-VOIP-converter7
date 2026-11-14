# W3-23, the plan: what was read and tried

A planning report, 2026-11-14, for the order `docs/work-orders/W3-23-low-frame-rates.md`. No app code and no test
changed. The planner read the repository at `main` `7e5e9e6` and nothing of the owner's recordings, logs or
install. Every figure carries its standing.

## What was read

- `CLAUDE.md`, `docs/PIPELINE.md`, `docs/PROGRESS.json` (the deferred entry on the look at jitter 0, `next`,
  `waiting_on_the_owner`).
- `tests/REFERENCE_2026.md`: Set G, findings 9, 22 to 25, 27 and 30.
- `docs/work-orders/BC-4-jitter-arrivals.md` ("The model", and the section after the review, items 10 and 11),
  `docs/work-orders/W3-02-receiver-queue.md` ("The model" and section 7 of its amendment),
  `docs/work-orders/W3-02c2-render-channel.md` (its headings and spec).
- `docs/reports/W3-03-engine-binary.md` ("Every client tick", "The mixer pulls", "What was not read") and
  `docs/reports/W3-07-mixer-output.md` ("The mix runs at 44100 Hz in blocks of exactly 512 samples",
  "Mix-ahead").
- `voice-channel.js` whole, `engine/network.js` whole, `steamChannel` and `steamArriveAt` in `engine/steam.js`,
  the channel's places in `engine/render.js`, `engine/render-stream.js` and `engine/live-chain.js`, the sender's
  tick rule in `steam-sender.js`, the page's frame-rate field and its help text.
- The tests that run a frame rate under 67: `tests/voice-channel.verify.mjs` and
  `tests/render-channel.verify.mjs` (10, 30, 40, 59.94, 60). `tests/render-stream.verify.mjs`,
  `tests/stages.verify.mjs` and `tests/reproduce.verify.mjs` run the queue at 66.67 and at the default only.

## What the record already says

| What | Where | What it means for the order |
| --- | --- | --- |
| The voice channel's pass runs in the frame's tick loop, once a tick due; under 66.7 frames a second a frame has several | W3-03, read | Ticks in bursts are read, not a guess |
| The mixer is called once a frame and paints until 9 blocks are queued; an extra update paints again after 90 ms | W3-07, read | Pulls in bursts are read. The extra update can act only under 11.1 frames a second |
| Where the client takes its packets in a frame | not read (finding 9 says so) | The look once a frame stays inferred until W3-23r |
| The order of packets, ticks and the mixer in a frame | not in the record | Chosen in the order; W3-23r reads it |
| The render's ticks and blocks are even | the order W3-02's table, "approximated" in both rows | The order replaces the approximation under 66.67 only |
| The page offers 10 to 1000 in a number field, 300 by default | `index.html` | There is no list of rates; anyone who types under 67 meets the gap |

## What was tried

Two scratch scripts, run in Node against the worktree's own files. They are not in the repository; the order's
checks 5 and 10 make their measurements again on the build.

### The arrival rule at jitter 0

The model with jitter as its jitter goes to 0, in closed form: the message of tick `p` is in the listener's list
from `15 (p + 1)` ms, leaves at the first look strictly after, and reaches the channel on `ceil(r / 15) − 2`.
Against the engine's `steamArrivals`, 40,000 ticks at each of 1000, 300, 100, 75, 67, 1000/15, 66.67, 66.666, 66,
60, 59.94, 50, 40, 30, 24, 20, 15 and 10 frames a second (measured):

- it equals `steamArrivals` at jitter 0.000001, seed 1, on every tick at every rate;
- at 1000/15 and above it moves no tick;
- at 66 it moves 1.0% of ticks (0.15 ms in the mean), at 60 10.0% (1.5 ms), at 50 25% (3.75), at 40 40% (6.0),
  at 30 55% (9.75), at 24 64% (13.8), at 20 70% (18.0), at 15 77.5% (26.25), at 10 85% (42.75). Finding 9 has 1.5,
  10 and 43 for 60, 30 and 10;
- against jitter 0.5 and jitter 1 (seeds 1 to 3) the model with jitter is later in the mean by 0 to 1.0 ms and 0
  to 2.0 ms, most at 66.67, 67, 66 and 59.94, and by 2.5 and 5.0 ms at 66.666. That is the lists' least age,
  which a jitter of 0 does not have. Finding 9's "6.5% of ticks at 66.67" is this, not a look: at jitter 0 the
  rule moves nothing at 66.67.

### Three clocks around the channel

The repository's sender (`steam-sender.js`) on a signal of 1000 and 0, its messages as zeros through
`createChannel`, 60 s, seeds 1 to 10, two signals: talk (phrases of 0.3 to 3 s with pauses of 0.2 to 1.5 s, drawn
from the seed) and unbroken sound.

- **A**, today's clock: even ticks, a block every 512 samples, each message on its own tick.
- **B**, the look alone: A with the arrival rule above.
- **C**, frames without the relay tick: at each frame the messages whose tick has come, then the ticks due, then
  the blocks due.
- **CL**, the order's clock: C with the arrival rule above.
- **C2L**: CL with the blocks before the packets and the ticks.

Talk (measured on the prototype; means over the ten seeds):

| Frames a second | Clock | Opens | Pulls that ran short | Blocks with under 100 ms queued | Mean delay of a message's first heard sample | Mean level lost | Samples over 3 dB down |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 300 | A | 10.3 | 12.4 | 2.7% | 467.9 ms | 0.10 dB | 1.59% |
| 300 | CL (not used there) | 10.3 | 12.7 | 2.7% | 465.8 | 0.10 | 1.58% |
| 66.67 | A and B | 13.8 | 16.9 | 4.1% | 291.4 | 0.13 | 2.07% |
| 60 | A | 14.0 | 17.0 | 4.0% | 278.2 | 0.13 | 2.10% |
| 60 | B | 14.0 | 17.0 | 4.0% | 280.5 | 0.13 | 2.11% |
| 60 | CL | 14.2 | 18.0 | 3.8% | 266.7 | 0.13 | 2.12% |
| 60 | C2L | 14.0 | 18.1 | 4.1% | 282.9 | 0.14 | 2.13% |
| 30 | A | 14.9 | 17.9 | 7.2% | 236.7 | 0.15 | 2.23% |
| 30 | B | 14.8 | 17.4 | 9.1% | 247.0 | 0.17 | 2.41% |
| 30 | C | 14.7 | 30.2 | 15.4% | 211.6 | 0.25 | 3.19% |
| 30 | CL | 14.6 | 29.4 | 13.3% | 231.4 | 0.22 | 2.91% |
| 30 | C2L | 14.6 | 29.1 | 13.2% | 265.1 | 0.22 | 2.92% |
| 20 | A | 15.1 | 19.5 | 14.2% | 222.5 | 0.21 | 2.46% |
| 20 | B | 15.0 | 18.1 | 18.6% | 242.9 | 0.31 | 4.11% |
| 20 | CL | 14.4 | 44.6 | 30.7% | 201.9 | 0.55 | 7.72% |
| 20 | C2L | 14.5 | 41.9 | 30.5% | 251.9 | 0.55 | 7.69% |
| 10 | A | 15.5 | 18.9 | 27.4% | 208.1 | 0.36 | 3.91% |
| 10 | B | 15.7 | 23.3 | 28.7% | 261.7 | 0.68 | 10.48% |
| 10 | C | 13.5 | 86.7 | 34.6% | 159.7 | 0.87 | 13.57% |
| 10 | CL | 13.5 | 83.9 | 30.3% | 185.4 | 0.69 | 10.60% |
| 10 | C2L | 13.5 | 80.8 | 29.7% | 286.1 | 0.68 | 10.52% |

A pull "ran short" when the ring held less than the block asked for. Under the frame clock the blocks that follow
in the same frame count too, since the channel is freed only at the next tick; so the count rises more than the
sound changes.

Unbroken sound (the same, one channel throughout):

| Frames a second | Clock | Blocks with under 100 ms queued | Mean level lost | Samples over 3 dB down |
| ---: | --- | ---: | ---: | ---: |
| 60 | A, B, C, CL | 0.2 to 0.3% | 0.01 dB | 0.12% |
| 30 | A | 10.3% | 0.06 | 0.29% |
| 30 | C | 44.0% | 0.74 | 9.95% |
| 30 | CL | 13.4% | 0.13 | 1.14% |
| 20 | A | 24.8% | 0.20 | 1.32% |
| 20 | CL | 40.8% | 0.57 | 7.02% |
| 10 | A | 45.2% | 0.55 | 5.47% |
| 10 | CL | 28.3% | 0.55 | 7.79% |

## What the figures say

1. **At 66.67 and above nothing moves**, by the rule's arithmetic and by the run. The page's default is untouched.
2. **The look alone is not the smallest right change.** It delays every message by half a frame less half a tick
   in the mean and leaves the pulls even, so the queue is read as shallower than the reads say it is. With the
   pulls in frames too, the delay goes the other way. The order builds the three together.
3. **At 60 and 50 the change is timing of about 10 ms** and nothing in the level. Most visitors under 67 are
   there (inferred: 60 is the common rate).
4. **At 30 and under the level dips more**, and how much turns on two things that are not read: the order of a
   frame's steps moves the delay by a frame (CL against C2L), and the relay tick moves the unbroken sound's loss
   at 30 from 0.74 dB to 0.13 (C against CL). So the order asks for a read of the frame first (W3-23r).
5. **10 frames a second is the least sure rate**: the mixer's extra update can paint inside a frame there (read,
   W3-07), and the model leaves it out.

## Where the build is not mechanical

- A message is added in a frame, not in its `push`. Three things hang on the push today: `steamChannel` counts
  opens across its own `push` for `onOpen`; it sets the gain's `blocks` at the push; `createTimeline` marks a
  spurt as opened there. The order moves each.
- The live chain holds its sound back by `D` and throws if the channel has not made that much final. Under the
  frame clock a block is final up to a frame later, so the chain would throw at 10 frames a second. That is why
  the live chain is a part of its own (W3-23b) and W3-23a leaves a timeline with no end on today's clock.
- Frames fall exactly on ticks at round rates (every 150 ms at 60, every 300 ms at 30 and 10), so the three
  comparisons are written out as `<=` and tested one by one.

## Not done

- No engine file was changed and no suite was run: the plan changes documents only.
- The prototype's clocks were not compared with `createTimeline` sample for sample; clock A's counts were read
  against the suite's own figures for sense only.
- The owner's log at `fps_max 67` was not opened (private). It has one tick a frame in 99 frames of 100, so it
  cannot show the order of a frame's steps (inferred).
- `docs/README.md`'s index and `docs/PROGRESS.json` are left to the orchestrator.

## Open questions for the orchestrator

1. Run W3-23r before the build, or build on the chosen order of a frame's steps.
2. Keep the relay tick at jitter 0 (one rule with the model with jitter), or drop it.
3. Leave `D` as it is under the frame clock (a render under 66.67 sits 5 to 23 ms early in the mean), or add a
   term.
4. Whether the three typed lines at `fps_max 30` and `fps_max 20` with `voice_showchannels 2` join the run sheet's
   queue block.
5. Whether the order is worth its 17 hours now: at 60 frames a second it moves about 10 ms of timing and no
   level. The planner's view: W3-23r is worth doing now, and the build is worth doing once it has answered.
