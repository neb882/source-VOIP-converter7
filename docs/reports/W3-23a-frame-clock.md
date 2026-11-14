# W3-23a: the voice channel's frame clock under 67 frames a second

The builder's report, 2026-11-14, for [W3-23-low-frame-rates.md](../work-orders/W3-23-low-frame-rates.md), part
W3-23a, with the order's last sections ("After the plan review", the orchestrator's rulings and "W3-23r: what was
read") holding over the text above them. Branch `claude/w3-23a-frame-clock`, from `main` at `91d37c6` (cache v50).
Nothing of the owner's record or install was read. Every figure carries its standing. Part b (the live monitor's
chain, and `onOpen`, which the plan review's edit 12 moved there) is not built.

## What changes, in one paragraph

On Steam voice on the game's voice queue, under 1000/15 frames a second, a render's voice channel now does once a
frame what the game does once a frame: it adds the messages whose arrival tick has come, in the order given, then
runs every tick due, then pulls every mixer block due (the order W3-23r read). Frame k is at (88200 k) / fps half
samples. At jitter 0 each message reaches the channel at the listener's first look after the server's relay tick,
the model with jitter as its jitter goes to 0, in closed form (the orchestrator's ruling 2); `codecInfo.arrivals`
stays absent there. `steamChannel` hands the gain each message's own frame blocks when the channel adds it, not
the last pushed message's. At 1000/15 frames a second and above nothing changes, to the last sample, and a
timeline with no end (the live monitor's) keeps even ticks and blocks at every rate until W3-23b.

## What changed, file by file

- `voice-channel.js`: `createTimeline` has the frame clock. It runs with a whole length when `88200 / fps > 1323`,
  fps limited to 10 to 1000 as `waitTicks` limits it. `push(tick)` and `advance(tick)` run every frame with
  `F(k) < 1323 tick` and return the blocks those frames ran; a pushed message waits until its frame. The add of a
  message moved into a function of its own (`addMessage`), so that whether its spurt opened a channel, the count
  `appended`, `fresh` and the overflow's record are made where the channel adds it. `finish()` runs frames until
  the blocks cover the length and every message given has been added (the plan review's edit 3). `held()` counts
  the waiting messages too. The comment of `VOICE_CHANNEL.fps` gives 300 as the rate the recordings' game ran at
  (logged) and 400 as the engine's start value (read, W3-23r). Without the frame clock every line runs as before.
- `engine/network.js`: `steamArrivals` at jitter 0 or less, when `1000 / fps > 15` and not `endless`, returns the
  closed form (`steamFrameArrivals`): the message of tick p enters the listener's list at 15 (p + 1) ms and
  leaves at the first of `STEAM_CROSSINGS`' listener looks r with r − 15 (p + 1) > 0; `at(p) = ceil(r / 15) − 2`,
  `floorTicks` 0, `jitterMs` 0, and `frames: true`. `steamArrivalPlan` returns it at jitter 0 for a whole length
  under 1000/15, and `null` at 1000/15 and above and with `endless`, as before.
- `engine/steam.js`: `steamChannel` queues each pushed message's blocks; the gain object takes the head of the
  queue at each `process()`, which the channel calls once for each message it adds, in the order pushed (the
  auto-gain on or off). `held()` counts the queue. `onOpen` is untouched (edit 12).
- `engine/render.js`, `engine/render-stream.js`: `codecInfo.arrivals` is set unless the plan has `frames`; the
  option's doc names the frame clock.
- `tests/voicequeue/reference-frames.mjs` (new): the second model of the frame clock, written from the order's
  text with plain loops over frames: the messages a list walked by an index, the caller's `createChannel`, and
  the timeline's record (spurts, offsets, overflows by the channel's own drops list, the source map) written again
  from `createTimeline`'s contract. It gives the samples and the whole `info`, so the suites compare member for
  member. It shares only `F(k) = (88200 k) / fps` with the module.
- `tests/voicequeue/reference-arrivals.mjs`: the closed form at jitter 0 under 1000/15, written again, walking the
  looks in order with one pointer where the engine guesses and corrects.
- `tests/voice-channel.verify.mjs`: the reference timeline takes the second model under 1000/15 (so the existing
  case at 30 fps is now checked against the frame clock); the endless case at 30 fps is at 100 (edit 1); a group
  "The frame clock" (below); `--frames` runs that group alone and, there only, reports every check instead of
  stopping at the first failure.
- `tests/render-channel.verify.mjs`: `referenceRender` and the demo's reference take the second model under
  1000/15, each message carrying its blocks to the gain (`beforeAdd`), and at jitter 0 the closed form with
  `arrivals` left absent (edit 4); sections 1 and 2 gain 13 settings at 60, 30 and 10 fps; section 10's two cases
  at 10 fps and jitter 500 are at 66.67 (edit 1); section 21 runs at 30 fps too (edit 8); sections 22 to 26 (below).
- `tests/browser.verify.js`: the frame rate's help sentence, as the page now has it (the suite asserts it word for
  word).
- `index.html`, `app/console.js`: the frame rate's help: "The game's fps_max caps the rate. The recordings' game
  ran at 300 (logged); the engine's own start value is 400 (read). The game mixes once a frame, and under 67 it
  also takes packets and counts down once a frame. Under 67 the model does the same (read in part, no
  recording); at 67 and above it mixes evenly." Every sentence is under the page's 115 characters.
- `tests/REFERENCE_2026.md`: dated lines only: finding 9 (the look at jitter 0 is built; what it moves; that it
  moves no sample at 60; its cost at 30), finding 22 (the frame clock's steps, each with its standing; what a
  listener gets, `main` against the build), finding 23 (the wait at 30, 20 and 10; `sv_cheats`), finding 30 (the
  lead of 10 to 13 blocks is not held), the Model table's voice channel row.
- `docs/work-orders/W3-02-receiver-queue.md`: dated lines in the rows "When the mixer pulls" and "Ticks".
- `docs/work-orders/W3-23-low-frame-rates.md`: the lines W3-23r made stale, each made true with a dated mark
  (edit 9): the mixer's 9 blocks, the standings of the packets' look, of the ticks' count, of the order of a
  frame's steps and of the extra update; the conditional on W3-23r; `sv_cheats 1` in "What would settle it"; why
  10 frames a second stays out of the log; a row saying even pulls at 66.67 and above are chosen.
- `docs/VOICE-PATH.md`, `docs/PAGE.md`, `README.md`: under 67 the game and the render take packets, count down
  and mix once a frame, with the figures and their standing; 300 as the rate the recordings' game ran at.
- `tests/README.md`, `tests/voicequeue/README.md`: the suites' rows, `--frames`, the second models.
- `tests/predictions/PREDICTIONS.md`: the note for the hashed model files that changed (edit 2).
- This report.

## Readings where the order left room

1. **The timeline with no end.** The order says "`steamChannel` says so with one option, removed by W3-23b"; edit
   1 says that in W3-23a "only the whole-length one has the frame clock", for `createTimeline` driven directly by
   the voice-channel suite. So the rule sits in `createTimeline` itself (`frames = !endless && 88200 / fps >
   1323`) and `steamChannel` passes nothing: one condition, which W3-23b removes. The behaviour is the order's; only
   where the switch lives is a reading. A check holds it ("a timeline with no end keeps even ticks and blocks").
2. **A message counts every tick of its frame.** By the order's three steps a message added in a frame of several
   ticks gets each of them, those numbered below its own included, so its wait counts from the frame's first tick
   (at 60 frames a second a message on tick 130, added in the frame that runs ticks 129 and 130, plays one tick
   earlier than tick 130 + 5 would say). This is what W3-23r read (the first tick's `CL_ReadPackets` takes what
   came since the last frame). The order's check 4 says it so ("starts in its packet's frame only when that frame
   has three"); the check holds the "exactly when".
3. **`onOpen`** is left as it is (edit 12), so the order's check 8 is W3-23b's. Its only caller is the live chain,
   which keeps today's clock.
4. **Section 10's second case** (edit 1: "their `grows` thresholds checked again"): at 66.67 the chain's margin is
   33,471 samples (49,620 at 10; measured), so blocks of 96,000 hold at least 121,671 samples, under the 131,072
   the case is about. The case takes blocks of 112,000 (136,371 held at least). W3-23b, which puts the case back
   at 10, can put 96,000 back too.
5. **Section 21's cut at 30 fps** (edit 8). There the demo's zero is 1,536 samples, and no message of the
   72,000-sample cut arrives between the end and the end plus the zero, which the check asks for. At 30 the cut is
   put on whole 480-sample frames just before the first message 3 s in or later, 73,920 samples, so that one
   message arrives after the end and is added by `finish()`'s frames (edit 3).
6. **The first double below 1000/15** (66.66666666666666). A frame there outlasts a tick by about 1.6e-15 ms, so
   jitter 0.000001 holds a packet that the rule lets go, and the two differ from tick 0 (measured). The order's
   comparison with 0.000001 does not list that rate; section 22 holds it to the second model alone and checks
   that its plan is the rule. At that rate the rule moves no tick (measured).
7. **No double gives `1000 / fps` exactly 15** (1000/15 gives 14.999999999999998, the next double below
   15.000000000000002), so `>=` for `>` in the arrival's threshold is the same rule; the breaks made there instead
   put the threshold at 66.67 or 66.66. The frame clock's own threshold differs: `88200 / (1000/15)` is exactly
   1323, and `>=` there is caught.

## The checks

In `tests/voice-channel.verify.mjs`, the group "The frame clock under 1000/15 frames a second (W3-23a)":

- **Check 1:** made-up traffic (the suite's `madeUpMessages`) at 10, 20, 24, 30, 40, 50, 59.94, 60 and 66 fps, three
  streams each (one at `voice_buffer_ms` 50 and a 50 ms fade; one whose length ends at 9 s while its messages run
  to 13.5 s), pushed whole, with `advance()` every 3 ticks, and with `advance()` at odd ticks twice over and at a
  tick before the last given: samples and `info` equal to the second model's, member for member.
- **`finish()` adds every message given:** a spurt 5 s past an end of 1 s opens a channel at 30 and 10 fps, as at
  66.67 (edit 3).
- **Check 2:** at 60, 30 and 10 fps, openings on a tick that falls on a frame and a tick either side, openings
  whose wait ends near such a tick, and a run of `advance()` at every tick through the frame on a block (frame
  512 at 60, 256 at 30 and at 10; edit 7). Each message is handed to the channel in the call that runs its frame;
  each channel plays from the first block of the frame of its wait's last tick; every call returns the blocks of
  every frame before its tick; and the run is the second model's.
- **Check 3:** at 10 fps (a wait of one tick) a message taken in frame k is heard from the first block of frame
  k's burst, 25 openings at every phase.
- **Check 4:** at 30 fps nine frames run 20 ticks (seven with two, two with three); a channel with a wait of 3
  plays in its packet's frame exactly when that frame has three ticks (6 of the 20 phases).
- **The threshold** (the order's "What moves", item 4, with edit 6): 66.67 and 1000/15 give one timeline, the even
  clock's (the suite's own reading) and `main`'s by hashes recorded on `main` before any change; 66.6 and the
  first double below 1000/15 give another, the second model's.
- **The timeline with no end** keeps the even clock at 30 and 10 fps.

In `tests/render-channel.verify.mjs`:

- **Sections 1 and 2** (checks 6 and 7): at 60, 30 and 10 fps, at jitter 0 and 50, with loss, with the auto-gain
  off (and `voice_scale` 2 at 10), and with the suite's own late-frame mask at 30: the voice at the mix point is
  the reference's sample for sample, `codecInfo.channel` its info member for member, `codecInfo.arrivals` what it
  counts with jitter and absent at jitter 0; the logs as sent and as played.
- **Section 21** (edit 8): `queue.dem` at 30 fps equal to the demo's reference (the auto-gain on and off), the cut
  source at 30, and `createRender` in pieces of 960 at 30 within 2,048 + 1,536 samples of the source given.
- **Section 22** (check 5): jitter 0 gives jitter 0.000001's ticks (seeds 1 to 3) and the second model's, tick for
  tick over 40,000 ticks, at the nine rates, 1000/15, 66.67, 75 and 300, and the second model's at the double below
  1000/15; `at(p) >= p` and never falls; the plan is the rule under 1000/15 and `null` at 1000/15 and above and
  with `endless`. Against jitter 0.5 and 1 (seeds 1 to 3) the mean difference is 0 or more and under 2.1 ms at 66
  and 59.94, under 1.1 ms elsewhere.
- **Section 23** (check 6): `createRender` in odd pieces gives `process()`'s samples and `codecInfo` at 60, 30 and 10
  fps, at jitter 0, at jitter 50 with loss 15%, and with the auto-gain and the gate off; with the gate on in pieces
  of 960 it never falls more than D + 2,048 + 512 × ceil(88200 / (1024 fps)) behind the source given (edit 8).
- **Section 24** (the threshold, edit 6): a render at 1000/15 is the render at 66.67 sample for sample (wait 7, the
  same D, no arrival plan); the render at 66.67 is `main`'s by the SHA-256 of its WAV and `codecInfo` recorded on
  `main`; at 66.6 and at the double below 1000/15 the render differs, with the same wait and D.
- **Section 25** (check 9): a render at 30 fps after one at 300 takes B and keeps nothing new, and is the fresh
  render at 30, at jitter 0 and 50.
- **Section 26** (check 11): the same render twice at 30 fps, and at 10 fps with jitter 50 and loss 15%, gives the
  same samples and `codecInfo`.

What the checks print, on the build (measured):

| What | Figure |
| --- | --- |
| Check 1 | 81 runs, 3,402 messages; in the streams that end at 9 s, 225 messages past the end |
| What the arrival rule moves, over 40,000 ticks | 66: 1.0% (0.15 ms in the mean); 60: 10.0% (1.50); 59.94: 10.1% (1.51); 50: 25% (3.75); 40: 40% (6.00); 30: 55% (9.75); 24: 64% (13.80); 20: 70% (18.00); 10: 85% (42.75 ms, 6 ticks at most); none at 1000/15 and above |
| The model with jitter less the rule, jitter 0.5 and 1, seeds 1 to 3 | 10, 20, 40, 50: 0.00 ms; 24: 0 to 0.82; 30: 0 to 1.02; 60: 0 to 1.00; 59.94: 0.90 to 1.79; 66: 0.91 to 1.91 |
| The stream, the gate on, pieces of 960: the most it fell behind | 60: 13,516 samples (D 12,800); 30: 11,296 (D 10,752); 10: 13,200 (D 9,728) |
| `queue.dem` at 30 fps, pieces of 960: the most it fell behind | 2,108 samples |

## The breaks

Each break was made in the worktree by a script that replaced one string, ran the named command, and restored the
file from a copy, checking it byte for byte. The voice-channel suite's whole run stops at its first failing check;
with `--frames` every frame-clock check runs, so the table names each check a break fails there. Every break below
made its command exit non-zero.

| Break | Command | What failed |
| --- | --- | --- |
| step 1: `<` for `<=` (messages) | `node tests/voice-channel.verify.mjs --frames` | checks 1, 2, 3 and 4 (the whole suite: the timeline's first check, at 30 fps) |
| step 2: `<` for `<=` (ticks) | the same | checks 1, 2 and 4 |
| step 3: `<` for `<=` (blocks) | the same | checks 1 and 2 (the whole suite: the timeline's first check, at sample 363,521, the block on frame 256 at 30 fps) |
| the mixer before the ticks | the same | checks 1, 2, 3 and 4, and the threshold (66.6 is not the second model's) |
| the ticks before the packets | the same | checks 1, 2, 3 and 4, and the threshold |
| `finish()` leaves waiting messages | the same | check 1 (the info differs at 10 fps, seed 3) and "finish() adds every message given" |
| the clock's threshold, `>=` for `>` | the same | the threshold (1000/15 gets the frame clock) |
| the clock's threshold at 66.66 | the same | the threshold (the double below 1000/15 keeps the even clock) |
| a timeline with no end on the frame clock | the same | "a timeline with no end keeps even ticks and blocks" |
| F(k) as k × (88200 / fps) | the same | check 1 |
| `steamChannel` reads the blocks of the last pushed message | `node tests/render-channel.verify.mjs 1` | the late frames of the suite's own mask at 30 fps (check 7) |
| the look: `>=` for `>` | `node tests/render-channel.verify.mjs 22` | both checks of section 22 |
| no relay tick at jitter 0 | the same | both checks of section 22 |
| the arrival rule under 66.67 (1000/15 taken in) | `node tests/render-channel.verify.mjs 22 24` | section 24 |
| the arrival rule under 66.66 (the double below left out) | the same | section 24 |
| `steamArrivals`' own rule under 66.67 | `node tests/render-channel.verify.mjs 22` | section 22's first check (1000/15 reports the rule) |
| the arrival rule for the chain with no end | the same | section 22's first check |
| no arrival rule at jitter 0 (the frame clock alone) | `node tests/render-channel.verify.mjs 1 22` | section 1 at 30 fps, at 10, with loss 15% at 30, with the auto-gain off at 30 and at 10, and the late frames at 30; section 22 |
| `process()` reports `codecInfo.arrivals` at jitter 0 | `node tests/render-channel.verify.mjs 1 2 23` | every jitter-0 setting under 1000/15 in sections 1 and 2; section 23's jitter-0 and gain-off cases |
| `createRender` reports `codecInfo.arrivals` at jitter 0 | `node tests/render-channel.verify.mjs 23` | section 23's jitter-0 and gain-off cases |
| `fps` taken off `AFTER_B_OPTIONS` (so read before B) | `node tests/render-channel.verify.mjs 25` | both checks of section 25 (check 9) |

The arrival rule at 60 frames a second moves no sample (finding 9's added lines), so its breaks show at 30 and 10
and in section 22, not at 60, as edit 5 says. The order's break of check 8 belongs to W3-23b.

## What moved, and what did not

- **Nothing at 1000/15 frames a second and above.** `node tests/render-stream.verify.mjs --hashes` before the first
  change (at `91d37c6`) and after the last engine change (at `3fa643c`) are equal byte for byte: 174 lines, the
  SHA-256 of both outputs `f73fee8b488eca1fd3c5d750a7af135a885c00b58c3486e9f850f701608ccc0f`. Both are kept in the
  builder's scratch folder (`hashes-before.txt`, `hashes-after.txt`). Every recorded hash and value of every suite
  is as it was ("Done means").
- **Moved, each with its reason** (all in the two suites the order names):
  - `tests/voice-channel.verify.mjs`: the timeline's first check at 30 fps compares with the frame clock now (the
    reference takes the second model under 1000/15); the endless case at 30 fps is at 100 (edit 1).
  - `tests/render-channel.verify.mjs`: section 10's two cases at 10 fps are at 66.67, the second with blocks of
    112,000 (reading 4); section 21 runs at 30 too, with its own cut (reading 5).
- **Nothing else moved.** Every other check of both suites passes unchanged, the recorded figures at 66.67, 100,
  150, 300 and 1000 included (section 14's pin, section 21's hashes recorded on `main`, section 10's hashes of the
  chain without the option).

## The figures (check 10, and the plan review's edit 10)

Measured on the build's timeline and on `main` `91d37c6`'s with one script (below): Steam's sender of each side on a
signal of 1000 and 0, each message on its tick by that side's `steamArrivals` at jitter 0 (as a render takes it;
on `main` every message on its own tick), each message's samples a constant 0.5, D taken out; the share of blocks
under 100 ms counted by a probe added to a copy of each side's `voice-channel.js`. Finding 22's added lines hold
the two tables (the layouts P and Q, seeds 1 to 50; a minute of talk and of unbroken sound, seeds 1 to 10), at 60,
50, 40, 30, 20 and 10. In short:

- An opened spurt's mean offset, `main` then the build: 60: −6.3 and −18.2 ms; 50: +1.1 and −11.3; 40: −2.4 and
  −23.0; 30: −5.6 and −7.7; 20: +2.8 and −18.5; 10: +0.3 and −19.2. So a render under 66.67 sits early against its
  source by 8 to 23 ms in the mean (ruling 3: D is left as it is). Nothing is dropped to overflow at these rates.
- The level lost over a minute of talk: 60: 0.12 and 0.12 dB; 50: 0.12 and 0.13; 40: 0.13 and 0.17; 30: 0.14 and
  0.22; 20: 0.18 and 0.48; 10: 0.32 and 0.78. More than 3 dB down: 30: 2.8% and 3.9%; 20: 3.0% and 8.4%; 10: 4.4%
  and 15.9%.
- The relay tick's cost (edit 5): unbroken sound at 30 fps is 0.12 dB down with the rule and 0.63 dB with every
  message on its own tick under the frame clock (the planner's clock C: the same script with the arrival rule left
  out). The planner's prototype gave 0.13 and 0.74 by its own measure of the level.
- The share of messages the rule puts a frame later than their own tick: 0% at 66, 60 and 50; 10.1% at 59.94; 20%
  at 40; 50% at 30; 40% at 24 and 20; 20% at 10 (measured on the build over 40,000 ticks, as edit 5 computed).
- At 66.67 and 300 the two sides are equal in every figure.
- The planner's figures not measured again here (the delay of a message's first heard sample over every message,
  the pulls that ran short) stay the prototype's.

**A render of 10 minutes at 10 frames a second** (`process()` on the game's voice queue, 10 minutes of the
render-channel suite's talk at 24 kHz, jitter 0, seed 1; each side in its own process, three runs each,
alternating, under the heavy-jobs lock; measured): `main` 27.95, 31.07 and 27.48 s, peak resident memory 880 to
882 MB; the build 31.64, 28.75 and 27.16 s, 884 to 885 MB. The medians: 28.75 against 27.95 s (1.03 times), 885
against 881 MB (1.005 times), within the order's 1.2.

## Done means

Heavy runs inside `flock /tmp/tf2ve-heavy.lock`, on the branch at `3fa643c` (every code change of this part;
`tests/README.md`'s times and this report changed after it).

1. `node tests/voice-channel.verify.mjs` and `node tests/render-channel.verify.mjs` (the order's `pnpm test
   voice-channel render-channel`, run as the two scripts while building): `162 voice channel checks passed` and
   `318 render-channel checks passed, 0 failed`; both passed again inside the whole run below.
2. `flock /tmp/tf2ve-heavy.lock pnpm test`: `27 of 27 suites passed. 1389.5 s summed, 1389.5 s of wall time, 1 at a
   time.` Among them `== voice-channel: passed, 173.1 s`, `== render-channel: passed, 199.3 s`, `== render-stream:
   passed, 360.3 s`, `== stages: passed, 262.2 s`, `== steam: passed, 150.0 s`, `== reproduce: passed, 103.6 s`,
   `== demo: passed, 2.4 s`, `== verify: passed, 10.4 s`. Their files are untouched by this part, so no recorded
   value of `render-stream`, `stages`, `steam`, `reproduce`, `demo` or `verify` changed.
3. The browser suite, `CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1)
   flock /tmp/tf2ve-heavy.lock pnpm test:browser`: `== browser: passed, 510.8 s` and `1 of 1 suites passed. 510.8 s summed, 510.8 s of wall time, 1 at a time.`
4. `node tests/render-stream.verify.mjs --hashes` before and after: equal byte for byte ("What moved").
5. Each break of "The breaks" was made and failed its check.
6. The 10-minute render at 10 frames a second: 1.03 times `main`'s time and 1.005 times its memory ("The figures").
7. CI's `verify` on the branch's head: see "CI".

## CI

The `tests` workflow on the branch, read with `gh run view` (only `verify` with the conclusion success counts):

| Run | Head | `verify` | The jobs |
| --- | --- | --- | --- |
| 43583785588 | `7219302` (the engine and the reference) | failure | `browser` failure (a 10 s timeout in `speedFirstSecondsRerenderCancel`, see "Not done"); the other four success |
| 43587100851 | `aefddd3` (the checks) | success | all five success |
| 43589826981 | `3fa643c` (the records and the words; every code change) | success | all five success |
| HEADRUN |

## The cache number

`node tests/cache-number.mjs origin/main --report`: "cached files changed since origin/main (91d37c6): app/console.js,
engine/network.js, engine/render-stream.js, engine/render.js, engine/steam.js, index.html, voice-channel.js" and
"cache number against origin/main (91d37c6): the number is v50, not above v50: it must rise (node
tests/cache-number.mjs origin/main --set)". The builder did not set it.

## Not done, or uncertain

- W3-23b: the live monitor's chain under 1000/15, `onOpen` from the timeline (and the order's check 8), and the
  three cases edit 1 moved, which W3-23b puts back at their old rates.
- `docs/FINDINGS.md` still calls 300 "TF2's default cap" (its entry 7); it is not among the files this part may
  touch. The page, the help, `VOICE_CHANNEL`, `README.md` and `docs/VOICE-PATH.md` now say 300 was logged and 400
  read.
- The figures of check 10 are of the model, on synthetic signals; no log under 66 frames a second exists. The
  level measure (−10 log10 of the mean of (output / input)² over playing samples) is this report's; the planner's
  prototype used one of its own, so the two sets agree in order of size, not in value.
- The model puts a frame's three steps at one instant; in the game the paint comes later in the frame by the time
  drawing takes (W3-23r). That is not modelled, as the order says.
- The first CI run (`7219302`) failed in the browser job by a 10 s timeout in `speedFirstSecondsRerenderCancel` (a
  page speed check at the default 300 frames a second); the next commit changed only tests, and its run passed
  every job. Read as timing, not as this change.
- The branch's diff, its commit messages and this report were scanned for recordings, personal details, real
  SteamIDs, paths of the machine and model names: none, but the branch's name and the attribution lines the
  session asks for on each commit.

## The scripts of the figures

Run from a folder outside the repository, with the side's folder as the argument (`main` made by `git archive
origin/main`, with the repository's `node_modules` linked into it). They were kept in the builder's scratch folder.

`figures.mjs` (check 10's tables; `node figures.mjs <folder>` prints JSON):

```js
// Check 10 of W3-23 and the figures of "What is heard" (the plan review's edit 10), on one side (main or the branch):
//   node figures.mjs <root>
// The timeline is the side's voice-channel.js, loaded from a copy with one probe added in runBlock: before each pull of a
// playing block, the samples the ring holds, and after it the block's 512 output samples. Messages are steam-sender.js's
// (the side's) on a signal of 1000 and 0, each on its tick by the side's arrival at jitter 0 (a render's), each message's pcm a constant 0.5 (16384 units, which the interpolator writes
// whole), a silence record's zeros. Nothing here is a recording.
//   - Layouts P and Q of tests/voice-channel.verify.mjs (2 s of sound after 300, 500 and 1200 ms and after 900, 600 and
//     1200 ms of silence), seeds 1 to 50: an opened spurt's offsetStartMs (mean, least, most), opens and dropped samples
//     a run (mean), the share of playing blocks pulled with under 4410 samples (100 ms) queued.
//   - Talk (phrases of 0.3 to 3 s of 1000 with pauses of 0.2 to 1.5 s, from mulberry32(seed)) and unbroken sound,
//     60 s, seeds 1 to 10: opens a run, the share of playing blocks under 100 ms, the level lost over the playing
//     samples, -10 log10(mean (out / 0.5)^2), and the share of playing samples more than 3 dB down (|out| < 0.5 x
//     10^(-3/20)). A playing sample is one of a block pulled while the channel plays.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const root = path.resolve(process.argv[2]);
const require = createRequire(import.meta.url);
const { createSender } = require(path.join(root, 'steam-sender.js'));
let src = fs.readFileSync(path.join(root, 'voice-channel.js'), 'utf8');
const pull = 'const r = ch.pull(first ? N + 1 : N), n = r.samples.length;';
const keep = 'kept = { value: r.samples[n - 1], pos: p.pos, s: p.s };';
if (src.split(pull).length !== 2 || src.split(keep).length !== 2) throw new Error('probe places not found once');
src = src.replace(pull, 'const __queued = ch.count; ' + pull).replace(keep, keep + ' if (globalThis.__probe) globalThis.__probe(__queued, samples);');
const sandbox = { module: { exports: {} }, globalThis: null, Math, Float32Array, Float64Array, Int32Array, Uint8Array, Object, Number, Array, Error, RangeError, TypeError, Infinity, NaN };
sandbox.globalThis = sandbox; sandbox.self = undefined;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const V = sandbox.module.exports;
// The side's arrival at jitter 0, as a render on the game's timeline takes it (engine/network.js's steamArrivals; on
// main it gives every message its own tick).
const { loadEngine } = require(path.join(root, 'tests/lib/engine.cjs'));
const A = loadEngine({ root, codec: null }).audio;
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function run(loud, seconds, fps, seed) {
  const n = Math.round(seconds * 24000), signal = new Int16Array(n);
  for (const [a, b] of loud) signal.fill(1000, Math.max(0, Math.round(a * 24000)), Math.min(n, Math.round(b * 24000)));
  const sender = createSender({ seed });
  const messages = [...sender.push(signal), ...sender.finish()];
  const tl = V.createTimeline({ fps, length: Math.round(n * 44100 / 24000) }), arrive = A.steamArrivals({ jitterMs: 0, fps, seed });
  let blocks = 0, low = 0, samples = 0, power = 0, down = 0;
  sandbox.__probe = (queued, s) => {
    blocks++; if (queued < 4410) low++;
    for (let i = 0; i < s.length; i++) { const g = s[i] / 0.5; samples++; power += g * g; if (Math.abs(g) < 10 ** (-3 / 20)) down++; }
  };
  for (const m of messages) {
    const tick = arrive.at(m.tick);
    tl.push(m.silence !== undefined ? { tick, pcm: new Float32Array(Math.round(m.silence * 44100 / 24000)), source: -1 }
      : { tick, pcm: new Float32Array(882 * (m.last - m.first + 1)).fill(0.5), source: Math.round(m.start * 44100 / 24000) });
  }
  const info = tl.finish().info;
  sandbox.__probe = null;
  return { info, blocks, low, samples, power, down };
}
const layout = (silences) => { const loud = []; let t = 0.5; for (let k = 0; k <= silences.length; k++) { loud.push([t, t + 2]); t += 2 + (k < silences.length ? silences[k] : 0); } return { loud, seconds: t + 1.5 }; };
const talk = (seed) => { const r = mulberry32(seed * 7919 + 3), loud = []; let t = 0.5; while (t < 58.5) { const len = 0.3 + 2.7 * r(); loud.push([t, Math.min(59, t + len)]); t += len + 0.2 + 1.3 * r(); } return loud; };
const FPS = [300, 66.67, 60, 50, 40, 30, 20, 10];
const out = { root, layouts: {}, talk: {}, unbroken: {} };
for (const fps of FPS) {
  const offs = [];
  let opens = 0, dropped = 0, blocks = 0, low = 0, runs = 0;
  for (const L of [layout([0.3, 0.5, 1.2]), layout([0.9, 0.6, 1.2])]) {
    for (let seed = 1; seed <= 50; seed++) {
      const r = run(L.loud, L.seconds, fps, seed);
      runs++; opens += r.info.opens; dropped += r.info.droppedSamples; blocks += r.blocks; low += r.low;
      for (const s of r.info.spurts) if (s.opened && s.offsetStartMs !== null) offs.push(s.offsetStartMs);
    }
  }
  const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
  out.layouts[fps] = { spurts: offs.length, offsetMean: +mean.toFixed(2), offsetLeast: +Math.min(...offs).toFixed(1), offsetMost: +Math.max(...offs).toFixed(1),
    opensPerRun: +(opens / runs).toFixed(2), droppedPerRun: +(dropped / runs).toFixed(1), lowBlocks: +(100 * low / blocks).toFixed(2) };
  for (const [kind, loudOf] of [['talk', talk], ['unbroken', () => [[0.5, 59.5]]]]) {
    let o = 0, b = 0, l = 0, n = 0, p = 0, d = 0;
    for (let seed = 1; seed <= 10; seed++) { const r = run(loudOf(seed), 60, fps, seed); o += r.info.opens; b += r.blocks; l += r.low; n += r.samples; p += r.power; d += r.down; }
    out[kind][fps] = { opensPerRun: +(o / 10).toFixed(1), lowBlocks: +(100 * l / b).toFixed(2), levelLostDb: +(-10 * Math.log10(p / n)).toFixed(3), downShare: +(100 * d / n).toFixed(2) };
  }
}
console.log(JSON.stringify(out, null, 1));
```

`perf.mjs` (the 10-minute render; `node perf.mjs <folder> 10 0`):

```js
// The order's "Done means": a render of 10 minutes at 10 frames a second, its time and memory, on one side.
//   node perf.mjs <root> [fps] [jitterMs]
// process() on the game's timeline of 10 minutes of the render-channel suite's talk (seed 3) at 24 kHz, seed 1; prints the
// wall time of process() and the peak resident memory of this process (resourceUsage().maxRSS, kB).
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(process.argv[2]), fps = Number(process.argv[3] || 10), jitterMs = Number(process.argv[4] || 0);
const { loadEngine } = require(path.join(root, 'tests/lib/engine.cjs'));
const TF2Opus = await import(pathToFileURL(path.join(root, 'opus-codec.mjs')).href);
const A = loadEngine({ root, codec: TF2Opus }).audio;
const lcg = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
function talk(seconds, rate, seed) {
  const rnd = lcg(seed), n = Math.round(seconds * rate), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 2.5e-4 * (rnd() * 2 - 1);
  let t = Math.round(0.3 * rate);
  while (t < n) {
    const len = Math.round((0.4 + 2.1 * rnd()) * rate), level = 0.08 + 0.2 * rnd(), f0 = 100 + 100 * rnd(), phase = 6.283 * rnd();
    for (let i = 0; i < len && t + i < n; i++) {
      const time = i / rate, env = Math.max(0, Math.sin(Math.PI * 3.1 * time + phase)) ** 1.5;
      let v = 0;
      for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f0 * h * time) / h;
      x[t + i] += level * env * (0.6 * v + 0.1 * (rnd() * 2 - 1));
    }
    t += len + Math.round((0.15 + 1.45 * rnd()) * rate);
  }
  return x;
}
const x = talk(600, 24000, 3);
const buffer = { sampleRate: 24000, length: x.length, numberOfChannels: 1, getChannelData: () => x };
const t0 = performance.now();
const r = await A.process(buffer, { codec: 'steam', volume: 1, deviceRate: 44100, timeline: 'game', seed: 1, fps, jitterMs });
const ms = performance.now() - t0;
console.log(JSON.stringify({ root: path.basename(root), fps, jitterMs, seconds: +(ms / 1000).toFixed(2), maxRssMb: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
  samples: r.samples.length, opens: r.codecInfo.channel.opens }));
```
