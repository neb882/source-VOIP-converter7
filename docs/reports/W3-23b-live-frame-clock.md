# W3-23b: the live monitor's chain on the frame clock

The builder's report, 2026-11-14, for [W3-23-low-frame-rates.md](../work-orders/W3-23-low-frame-rates.md), part
W3-23b, with the order's later sections holding over the text above them ("W3-23a: after the review and the second
read", "After the plan review" with its edits 1, 11 and 12, the orchestrator's rulings, "W3-23r: what was read").
Branch `claude/w3-23b-live-frame-clock`, from `main` at `2f0212e` (cache v51). Nothing of the owner's record or
install was read. Every figure carries its standing.

## What changes, in one paragraph

Under 1000/15 frames a second the live monitor's chain on the game's voice queue now runs the same frame clock as a
render (W3-23a): in each frame the messages whose tick has come, then the ticks due, then the mixer's blocks due. At
jitter 0 each message reaches its channel by the same rule as a render's, the listener's first look after the
server's relay tick. The timeline tells where each channel opens (`onOpen`), in the frame that adds the message.
Because the queue then mixes only once a frame, the chain holds back a frame's mixer blocks more than the queue's
zero D: ceil(88200 / (1024 × fps)) blocks of 512 samples, 2 at 60 frames a second, 3 at 30, 5 at 20 and 9 at 10
(arithmetic), 23 to 104 ms. The delay it reports rises by the same. At 66.67 frames a second and above nothing
changes, in the render or in the chain.

## What changed, file by file

- `voice-channel.js`: the frame clock runs with no end too (`frames = 88200 / fps > 1323`; the `!endless` W3-23a
  left is gone). `createTimeline` takes `onOpen(index)` (a function or none; anything else a `RangeError`) and calls
  it where the channel opens, with the count of output samples made by then (`made`). The comments say that a
  timeline with no end holds the messages waiting for their frame, never more than those pushed since the last frame
  ran.
- `engine/network.js`: `steamArrivals` at jitter 0 under 1000/15 with `endless` gives W3-23a's rule (`frames`
  true), with the endless model's refusal of a falling tick and `held()` 0; `steamArrivalPlan` returns it with
  `endless` too. At 1000/15 and above both are as before.
- `engine/steam.js`: `steamChannel` hands its `onOpen` to the timeline and no longer counts opens across `push`.
- `engine/live-chain.js`: `liveQueueHold(fps)` (exported in `TF2Engine.liveChain`) is the formula, written from the
  voice channel's own constants and limits; the chain's `hold` is D plus it, used for G = floor(P × 147 / 80) − hold
  and for the hold-back the delay reports (`queueCostMs`, `stats.latencyMs`). The chain returns `hold` beside `zero`.
  The rule at jitter 0 is not reported as `stats.arrivals`, as a render does not report it as `codecInfo.arrivals`.
- `live.js` (the delay's words): the switch's help counts the frame's blocks in its figure and, under 67, says so in
  one sentence ("That counts 104 ms of a frame's mixing, since under 67 frames a second the queue mixes once a
  frame."); the latency's title names it under 67. Both read `TF2Engine.liveChain.liveQueueHold`.
- `tests/voice-channel.verify.mjs`: the endless case `[30, 200, 0.1, 0]` is back (below); "a timeline with no end has
  the frame clock" in place of "keeps even ticks"; an hour of packets at 10 fps; the group `onOpen` (`--frames` runs
  it too).
- `tests/render-channel.verify.mjs`: section 10 under 1000/15; `referenceRender` gives `onOpen` under the frame
  clock; section 22 holds the endless model and plan to the rule; section 27 (new), `onOpen` through
  `steamChannel`.
- `docs/LIVE.md`, `README.md`, `docs/VOICE-PATH.md`, `docs/PAGE.md`, `docs/work-orders/W3-02-receiver-queue.md`,
  `tests/README.md`: every "not built yet" W3-23a left for part b made true; `docs/LIVE.md`'s latency table gains
  60, 30, 20 and 10 with a paragraph on the hold.
- `tests/REFERENCE_2026.md`: dated marks at the three statements W3-23a left (finding 9, finding 22, the Model
  table) and a dated block under finding 22 with the hold and each standing.
- `tests/predictions/PREDICTIONS.md`: the note for the hashed model files that changed (`engine/network.js`,
  `engine/steam.js`, `engine/live-chain.js`). It is not in the order's list for part b; the hard rule asks for it.

## The hold, by arithmetic (the plan review's edit 11)

Advanced to a tick t, a timeline on the frame clock has run the blocks of every frame before 1323 t half samples.
The frames not run start at or after 1323 t, so the last frame run is at most a frame before it, and the blocks not
yet run start in the open stretch between that frame and 1323 t. A stretch no longer than 88200 / fps half samples
holds at most ceil(88200 / (1024 × fps)) starts of a block of 1024 half samples. So the chain's output at its mix
point is final up to floor(P × 147 / 80) − D − 512 ceil(88200 / (1024 × fps)), and that is what it gives out.

| fps | D | blocks over D | hold | `queueCostMs` | the chain's `latencyMs` at 48 kHz |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 60 | 12,800 | 2 | 13,824 | 113.22 | 320.12 |
| 50 | 12,288 | 2 | 13,312 | | |
| 30 | 10,752 | 3 | 12,288 | 78.39 | 285.29 |
| 20 | 10,240 | 5 | 12,800 | 90.00 | 296.90 |
| 10 | 9,728 | 9 | 14,336 | 124.83 | 331.73 |
| 66.67, 100, 300 | 13,312, 15,360, 24,576 | 0 | D | 101.61, 148.05, 357.03 | 308.51, 354.95, 563.93 |

D and the hold are read from `zero()` and arithmetic; the delays are what the suite printed (section 10).

**One block less fails at a phase built for it.** Two checks in section 10:

1. **The timeline.** A timeline with no end, nothing pushed, advanced tick by tick for 30 s at 60, 30, 20 and 10
   fps: what it has returned is never less than 512 ceil(1323 t / 1024) − D − 512 × blocks, and at the first tick
   where, by the suite's own arithmetic, the stretch after the last frame holds that many starts it is exactly that
   (tick 21 at 60, 20 at 30, 90 at 20, 60 at 10; measured). There a hold one block shorter runs short.
2. **The chain.** On 20 s of silence at jitter 0 (no message, so the bound tick is ceil((P / 24000 + 0.002) /
   0.015)), the suite computes the margin at every sample from frameTime, the second model's rule at jitter 0 and
   the hold, and feeds the chain to the instant it picks and one sample more. At 60 and 50 fps the margin falls under
   512 at that instant (512 then 510 at P = 28,701; 513 then 511 at P = 10,032; measured), so a hold one block
   shorter throws "the hold-back runs short" there. At each rate the chain's `stats.margin` is the arithmetic's at
   both instants and after 20 s.

**A reading where the order and the chain part (inferred, measured).** At 30, 20 and 10 fps the chain at jitter 0
does not come within a block of the hold: its least margin in 20 s of silence is 892, 1,327 and 1,183 samples
(measured; over 120 s, more than the phases' whole period of 76.8 s, the arithmetic gives 892, 1,327 and 1,171). The reason: the
rule's look comes after the relay tick, so the tick the chain is advanced to is later than the bound, and the last
frame run is more than a tick closer to it than a whole frame. A scan of the engine's arrival model with jitter 45,
90 and 150 ms, seeds 1 to 6, 120 s each, by the same arithmetic (a script in the builder's scratch folder, not in
the repository) gave least margins of 787 to 10,649 at those rates: above a block too. So one block less fails in
the chain at 60 and 50, and at 30, 20 and 10 only at the timeline's level. The hold is built as the order says,
by the arithmetic and not by a search: it does not depend on jitter (W3-02c-3's rule), and a tick on which the
arrival adds nothing leaves only the bound (inferred). A tighter hold at 30 and under would need the arrival model's
least lift in closed form; the orchestrator may want it as a question. The cost: in those runs a hold one block shorter at 30,
and two shorter at 20 and at 10, would not have run short, so the monitor there is 12 to 23 ms later than it had to
be in them.

## The three cases put back (the plan review's edit 1)

- `tests/voice-channel.verify.mjs`, `endlessChecks`: `[30, 200, 0.1, 0]` again in place of `[100, 200, 0.1, 0]`.
  Under the frame clock the last messages wait for a frame after the last push, so `counts()` would lack them where
  a whole length's `finish()` adds them (edit 3). Where the frame clock runs, both timelines are advanced 7 ticks past
  the last message (a frame at 30 fps is 2.2 ticks), a call compared like the others, before `counts()` is read.
- `tests/render-channel.verify.mjs` section 10: the two cases of jitter 500 are at 10 fps again, the second with
  blocks of 96,000 again. Their `grows` thresholds are as they were: at 10 fps the margin is now 50,644 samples
  (measured), so a block of 48,000 holds at least 94,744 (over 65,536) and one of 96,000 at least 138,844 (over
  131,072).

## The check at the mix point

Section 10 at 60, 30 and 10 fps: jitter 0 and 50, loss 15% with jitter 50, a 48 kHz microphone at 30, blocks of 1,
480, 4,800 and an uneven plan at 30 (jitter 50) and at 10 (jitter 0): the chain gives floor(P × 147 / 80) − hold
samples at its mix point and they are `createRender`'s, sample for sample. The checks at 66.67, 100 and 300 are
unchanged and pass. `spurtStart` under the frame clock (layouts P and Q at 30 and 10): once for each open of the
render's channel, at the reference's index, the same at every plan. The "what the chain keeps" check gained a
reading: under 1000/15 the lists hold the messages that wait for their frame, which come and go with the frames'
phase (3 then 5, 1 then 3 at the end against 5 s on the first try), so there it asks for no more after 5 s than the
most in the first 5 s.

## `onOpen` (the order's check 8, the plan review's edit 12)

- On the even clock (66.67 and 300 fps) the indices `steamChannel` gives are `main`'s: recorded at `d788ce5` before
  the change on made-up traffic of the suite's own, seeds 1 and 2, as counts and SHA-256 (section 27), and equal to
  the count once the opening push has returned, read again by the voice-channel suite, whole and with no end.
- Under the frame clock (60, 30 and 10) each index is the second model's 512 b − D, b the blocks of the frames before
  the frame that adds the message (voice-channel suite), and `steamChannel` passes the timeline's own through
  (section 27). In every one of the 36 runs some index differs from the count once the opening push has returned.

## What moved, and what did not

- **Nothing at 66.67 frames a second and above.** `node tests/render-stream.verify.mjs --hashes` (under the heavy
  lock) before the first change, at `2f0212e`, and after the last engine change: equal byte for byte, 174 lines,
  SHA-256 `f73fee8b488eca1fd3c5d750a7af135a885c00b58c3486e9f850f701608ccc0f` both (the same as W3-23a's). Both are in
  the builder's scratch folder (`hashes-before.txt`, `hashes-after.txt`). Every recorded hash and value of
  `render-stream`, `stages`, `steam`, `reproduce`, `demo` and `verify` is as it was (their files are untouched, and
  they pass). Section 10's checks at 66.67, 100 and 300 pass unchanged; the main pin of the chain without the
  option (`LIVE_MAIN`) and section 14's pin pass.
- **Moved, each with its reason:** the three cases above (back to their old rates); section 10's check "what the
  chain keeps" (the reading above); section 22's check of the plan "with no end it is null" now asks for the rule.
  No recorded value of any other suite moved.

## The breaks

Each break was made in a copy of the branch (`git archive`), one string replaced, the command run from the copy
(the render-channel suite through `TF2_DIR`), the file restored.

| Break | Command | What failed |
| --- | --- | --- |
| a timeline with no end on the even clock (`!endless &&` put back) | `node tests/voice-channel.verify.mjs --frames` | "a timeline with no end has the frame clock"; `onOpen` under the frame clock |
| `onOpen` given the count after the frame's first block (`made + 512`) | the same | both `onOpen` checks |
| the arrival model with no end without the rule at jitter 0 | `node tests/render-channel.verify.mjs 22` | section 22's first check |
| `steamChannel` does not pass `onOpen` | `node tests/render-channel.verify.mjs 27` | both checks of section 27 |
| the hold one block less | `node tests/render-channel.verify.mjs 10` | every setting under 1000/15 (at 60 fps jitter 0 the chain threw "the hold-back runs short"); "one block less runs short" (the chain threw at 60 and 50); the delay; the plans; `spurtStart` under the frame clock |
| the hold one block more | the same | every setting under 1000/15 (the hold pinned); "one block less runs short" (margin 1,022 at 60, not under 512); the delay |
| the rule at jitter 0 reported as `stats.arrivals` | the same | the stats check |
| the delay without the frame's blocks (`D` in the hold-back) | the same | the delay check |

Each made its command exit non-zero. One break passes every suite: the frame's blocks taken out of `live.js`'s
`queueCost` ("Not done").

## Done means

Heavy runs inside `flock /tmp/tf2ve-heavy.lock`.

1. `node tests/voice-channel.verify.mjs`: `166 voice channel checks passed`. `node tests/render-channel.verify.mjs`:
   `343 render-channel checks passed, 0 failed` (inside the whole run).
2. `flock /tmp/tf2ve-heavy.lock pnpm test` at `b8a143e`: `26 of 27 suites passed; FAILED: harness. 1592.0 s summed`.
   The harness failed on `live.js` naming `TF2Engine` ("no shipped file outside engine/ and audio.js names
   TF2Engine"); `8a6000d` works the hold in `live.js` from the voice channel's constants, and `node
   tests/harness.verify.mjs` then gives `34 passed, 0 failed`. Among the others: `voice-channel: passed, 183.3 s`,
   `render-channel: passed, 277.7 s`, `render-stream: passed, 408.3 s`, `stages: passed, 304.4 s`, `steam: passed,
   166.5 s`, `reproduce: passed, 106.8 s`, `demo: passed, 2.4 s`, `verify: passed, 12.4 s`.
3. The browser suite at `8a6000d`, `CHROMIUM_EXECUTABLE=... flock /tmp/tf2ve-heavy.lock pnpm test:browser`: `browser
   passed 520.0` and `1 of 1 suites passed. 520.0 s summed`.
4. The `--hashes` outputs: equal ("What moved").
5. Each break above failed its check.
6. CI's `verify` on the branch: see "CI".

## CI

The `tests` workflow on the branch, read with `gh run`:

| Run | Head | `verify` | The jobs |
| --- | --- | --- | --- |
| 43640039306 | `b8a143e` (the code and the words) | failure | `units` failure (the harness: `live.js` named `TF2Engine`); the other four success |
| 43640708955 | `8a6000d` (`live.js` fixed) | success | all five success |

| 43644151421 | `f65a41d` (the merge of `main` `cdefc3f`, this report, the one-block check's guard) | success | all five success |

This line's commit changes only `docs/` and starts no run, so `f65a41d`'s run is the branch's last.

## The cache number

`node tests/cache-number.mjs origin/main --report` after `main` (`cdefc3f`) was merged in: "cached files changed since
origin/main (cdefc3f): engine/live-chain.js, engine/network.js, engine/steam.js, live.js, voice-channel.js" and "cache
number against origin/main (cdefc3f): the number is v51, not above v51: it must rise (node tests/cache-number.mjs
origin/main --set)". The builder did not set it.

## Not done, or uncertain

- The page's figure under 67 (`live.js`) is checked by no suite: the browser suite asserts the help at 300 and 67
  frames a second only, where the hold is D, and `tests/browser.verify.js` is not among the files part b may touch.
  A break of the frame's blocks in `queueCost` passes every suite.
- One block less does not run short in the chain at 30, 20 and 10 frames a second in any run measured ("A reading
  where the order and the chain part").
- No log under 66 frames a second exists; every figure here is the model's, on synthetic signals.
- The work order's status line and `docs/README.md` say W3-23b is not built; they are the orchestrator's.
- The branch's diff, its commit messages and this report were scanned for recordings, personal details, real
  SteamIDs, machine paths and model names: none, but the branch's name and the attribution lines on each commit.
