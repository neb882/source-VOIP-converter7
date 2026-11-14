# W3-02c-3a: the live chain runs the game's voice queue (the module, the arrival model, the chain)

The builder's report, 2026-11-14, for [W3-02c3-live-channel.md](../work-orders/W3-02c3-live-channel.md), part
W3-02c-3a, with the order's last three sections (the rulings, the note on `retime` and "After the plan review")
holding over the text above them. Branch `claude/w3-02c3a-live-channel`, from `main` at `0617875` (cache v46).
Nothing of the owner's record was read. Every figure carries its standing. Part b (the worker, the page, the
recorded take, the documents) is not built: after this part the page still asks the chain for the file's own
timing, so the monitor does not change yet.

## What changes, in one paragraph

Given `opts.timeline` `'game'`, the live chain on Steam voice now plays its packets through the receiver's voice
channel, as the stream render does on the game's timeline. It runs `steamChannel` with no end, with BC-4's arrival
times made from its own seed, frame rate and jitter, and gives out at its mix point the render's own samples: after
P samples given to Steam's sender it has given out `floor(P × 147 / 80) − D` of them, where D is the channel's zero,
and sample n of the chain is sample n of `createRender` with the same sound and settings. The room's limits are
fixed at each open of the channel, just before the open's first sample. `'game'` is read as a render reads it and
refused where a render refuses it; the chain also refuses low latency and `opts.arriveAt` with it. Without the
option, or with `'source'`, the chain gives `main`'s samples. No render moves.

## What changed, file by file

- `voice-channel.js`: `createTimeline` takes `length: Infinity`, a timeline with no end. `push` and `advance` return
  what a whole length returns for the same calls; it keeps no source map, no record of a message, a spurt or an
  overflow, and nothing that grows with time. `counts()` gives the info's counters at any time, on either kind of
  timeline; `held()` counts the entries the timeline keeps in its lists, for the tests. `finish()` on a timeline
  with no end runs no block and returns `counts()` as its info. `createChannel` takes `listDrops: false`, under
  which nothing is added to `drops`. The module exports `zero(bufferMs, fps, codecDelay)`, the expression
  `createTimeline` used for D, which it now calls. A whole length gives what it gave, to the sample and to the
  field of `info`.
- `engine/network.js`: `steamArrivals` takes `endless`. With it `at()` takes ticks that never fall, refuses a tick
  below the last asked with a RangeError (the same tick again is taken), keeps for each crossing only the leaving
  tick a later call can ask for, and gives the whole model's answers tick for tick; `held()` counts what it keeps.
  `steamArrivalPlan` passes `endless` on. Without the option both are what they were.
- `engine/steam.js`, `steamChannel` only: `length: Infinity` is handed to `createTimeline`, and the list of the
  arrival's answers then keeps only the highest tick asked (a lower tick is a RangeError). It gives `zero`,
  `counts()` and `held()`, and takes `onOpen(index)`, called once for each open after the push that opened the
  channel, with the count of samples the timeline has returned by then. With a whole length and no `onOpen` it is
  what it was.
- `engine/live-chain.js`: `createLiveChain` reads `opts.timeline` through `steamGameTimeline` at its entry, as
  `process()` does, with no received voice; with `'game'` it refuses `opts.lowLatency` and `opts.arriveAt`, each a
  RangeError that names the reason. `steamLiveChain` on `'game'`: the channel as `createRender` makes it, with no
  end and `onOpen`, handed to `steamTimeline` as its channel with no gain; `add()` with no third argument; after
  each pushed sample's messages the channel advanced to `steamBoundTick(S, lastTick, P)` when that tick rises;
  `floor(P × 147 / 80) − D` given out, and an Error if the channel has returned fewer; the chain's own scale and
  clip after the mix point left out; `spurtStarts()` called for each open just before the mix stages are handed
  the open's first sample (a list of opens waits for that), and no longer at the sender's spurts; the panel's
  frame counts kept the sender's, final at the render's bound (`steamGiveOut` with no limit on the wait). The chain
  reports `zero`, `timeline`, `queueCostMs` (on every Steam chain, at its own `fps` and `bufferMs`) and `held()`;
  on `'game'` `stats` gains `pushed`, `channel` (the timeline's `counts()`), `margin` and, with jitter above 0,
  `arrivals` (as a render's `codecInfo.arrivals`), and `stats.latencyMs` counts D over 44,100 in place of the reach
  and the look-ahead over 24,000. The comment on the room's stand-in for a channel's start says where it now runs.
- `engine/room.js`: the comment at `resolveRoom` only; "not built yet" is gone.
- `tests/voice-channel.verify.mjs`: the list of the module's exported names gains `zero`; a new group of checks,
  "The timeline with no end".
- `tests/render-channel.verify.mjs`: section 10 replaced by the order's checks; the suite's reference
  (`referenceRender`) takes an optional spy that is told where each open falls, which nothing before used.
- `tests/README.md`: the two suites' rows. `tests/predictions/PREDICTIONS.md`: the note for the hashed model files.
- `tests/browser.verify.js`, one line, by the orchestrator's ruling of 2026-11-14 (the order's last section): in
  [Browser 3f2] (`verifyLiveRoom`) the options handed to the live worker carry `timeline: 'source', fps: undefined,
  bufferMs: undefined`, as `live.js`'s `liveOptions()` sends them, with a comment that says so and that part b adds
  the queue's case. Nothing else of that file changed.

`sw.js` is not touched: no file the site loads was added, removed or renamed.

## The figures

| Figure | 66.67 fps | 100 fps | 300 fps | Standing |
| --- | ---: | ---: | ---: | --- |
| D, with the codec's 156 samples | 13,312 samples (301.9 ms) | 15,360 (348.3 ms) | 24,576 (557.3 ms) | read (`voice-channel.js` `zero()`) |
| What the chain holds back on the queue, more than on the file's own timing (`queueCostMs`) | 101.6 ms | 148.0 ms | 357.0 ms | the chain's own figure, `1000 × (D / 44,100 − 4,806 / 24,000)` |
| `stats.latencyMs` at a 48 kHz device, on the file's own timing | 206.9 ms | 206.9 ms | 206.9 ms | the chain's own figure |
| `stats.latencyMs` at a 48 kHz device, on the queue | 308.5 ms | 354.9 ms | 563.9 ms | the chain's own figure |

The hold is D at the mix point and nothing more, as the order's "The hold-back" infers. On the build the chain
never ran short in any run (the check of every run would have thrown), and the least margin by which what the
channel had returned was ahead of what the chain gave out is below.

| Run (talk of the suite's own `talk()`) | Least margin | Standing |
| --- | ---: | --- |
| 30 s at jitter 0, at 66.67, 100 and 300 fps (24 kHz microphone) | 90 samples at each | measured on the build |
| 12 s at jitter 0 from a 48 kHz microphone, at 66.67 fps, and at 300 fps with a room attached | 92 and 91 samples | measured on the build |
| Every run at jitter 50 and 100 (12 s; 8 s for the plans of blocks) | 755 to 5,075 samples | measured on the build |
| 30 s at jitter 500 and 10 fps, seeds 1 and 2 (the second from a 48 kHz microphone, the gate off), with the key released inside phrases | 48,742 and 45,530 samples | measured on the build; the plan reviewer's prototype gave 48,742 for the first setting |
| 30 minutes of unbroken sound at 66.67 fps, jitter 0, the gate off | 89 samples, from between the 4th and the 6th minute on | measured on the build |

The margin is measured after each pushed sample, where the chain decides what it gives out (the plan review's point
11). The order's least of 89 samples is the bound's arithmetic, first reached at P = 597,912 (24.913 s); in the
30 s run at 300 fps a message on tick 1,661 had raised the bound there to 1,662 (the bound is the larger of the last
message's tick plus one and the arithmetic), so the margin at that sample was 1,113 (measured on the build), and 90
was the least seen in the suite's runs. The thirty-minute run met the 89 and nothing lower. A hold one block shorter
runs short at once (the breaks below).

## The checks

`tests/render-channel.verify.mjs`, section 10 (replaced):

| What it shows | How |
| --- | --- |
| The chain is the render | at 66.67, 100 and 300 fps each at jitter 0 (30 s), 50 and 100 (12 s); seeds 1, 2 and 3 at 300 fps and jitter 50; loss 15% at jitter 50 at each frame rate; a 48 kHz microphone at 66.67 fps (jitter 0) and at 300 (jitter 50): the chain gave exactly `G = floor(P × 147 / 80) − D` samples at `opts.onGain`, G is printed and is not zero, D is the figure above, and sample n is `createRender`'s for every n below G |
| The plan of blocks | blocks of 1, 480 and 4,800 samples and a seeded uneven plan (1 to 5,000), 8 s at 300 fps and jitter 50: each gives `createRender`'s samples |
| The gate off, push-to-talk, the gain off, a room | the gate off; the key released inside a phrase and pressed again, twice (48 kHz); the receiver's gain off at voice_scale 2 with the microphone's gain at 3, so the render clips; a room (preset 6) attached after the mix point at 48 and at 44.1 kHz, with `spurtStart` called once for each open: each gives `createRender`'s samples |
| The hold is D and no less | `stats.margin` is a whole number of 0 or more in every run, and under 512 in the three 30 s runs at jitter 0 |
| The delay | `queueCostMs` is `1000 × (D / 44100 − 4806 / 24000)` at the three frame rates, and `stats.latencyMs` on the queue is the figure on the file's own timing plus `queueCostMs`, each within 1e-9 ms; `zero` is D on the queue and null off it |
| A channel's start | the layouts P and Q at 300 fps, seeds 1 and 2: `spurtStart` is called once for each open of the render's channel (the reference's opens, those below G), where the sender made more spurts (on Q a spurt joins a running channel); each call comes before the same mix sample at blocks of 480, 4,800 and an uneven plan (and of 1 on Q, seed 1), a multiple of 512; the first at `512 × ceil(1323 a / 1024) − D` (here 22,528, a = 71) |
| `stats` | `stats.channel.opens` above 0 after talk in every run; `stats.arrivals` there with the jitter given at jitter 50 and 100, absent at 0; the frame codes (`takeFrameCodes()`, `stats.frames`) are the render's `codecInfo.sent.frameLog`, slot for slot, in every run |
| What the chain keeps | `chain.held()` (the entries the channel and the arrival model keep in lists) is no larger at the end of each run than after 5 s: 0 at jitter 0, 3 with jitter |
| The refusals | `'game'` on `celt_22`, with the codec skipped, with `lowLatency` and with `arriveAt`: a RangeError naming the reason; `timeline` `'gmae'`, `''`, `0` and `'GAME'`: the RangeError `process()` gives, word for word; `lowLatency: false` and `arriveAt: null` with `'game'` are taken |
| Without the option | with no `timeline` and with `'source'`, four settings (`celt_22` among them), the SHA-256 of the output and of the voice at the mix point are those recorded from `main` at `0617875` before the change |
| The arrival model with no end | over 20,000 ticks at jitter 25, 50, 100 and 500 and at 10, 66.67 and 300 fps it gives the whole model's answers, with every seventh tick asked twice; a tick below the last is a RangeError; after an hour of ticks (240,000) `held()` is no more than after a minute (2 and 2) |

`tests/voice-channel.verify.mjs`, "The timeline with no end":

| What it shows | How |
| --- | --- |
| The same returns | the 48 made-up message streams of the clock's first check (six settings, seeds 1 to 8, with and without `advance()`, two settings with the codec's delay): every return of `push()` and `advance()` with `length: Infinity` equals the whole length's, call for call |
| `counts()` and `finish()` | after the last call `counts()` has the whole length's `info` in each of its fields, and only those; `finish()` returns no more samples and `counts()` as its info |
| Nothing cut | `advance()` to tick 40,000 (10 minutes) returns every block that starts before the tick, from sample 0 |
| What it keeps | an hour of packets at 300 fps, a little more sound than the hour so the ring overflows again and again (3.18 million samples dropped): `held()` 0 after a minute and after an hour, where a whole length's grows (8,496 then 8,988 over its 70 s) |
| `listDrops` | the same samples, tags, opens and `dropped` as without it, and an empty `drops` |
| The zero | 13,312, 15,360 and 24,576 at 66.67, 100 and 300 fps with the codec's 156 samples, 24,064 at 300 with none, equal to the suite's own reading, and a bad `codecDelay` refused |
| The names | the module exports `zero` with the five names before it, in a page and in a worker |

## The breaks

Each break was made in a copy of the sources outside the repository and the named suite run there
(`node tests/render-channel.verify.mjs 10`, or `node tests/voice-channel.verify.mjs`, which stops at its first
failing check). The order's table, then the builder's own.

| Break | The check that failed | Result |
| --- | --- | --- |
| the chain ignores `timeline` (the code before this order) | the chain is the render | every run fails: no counts, no G; the refusals and the hold fail too |
| the hold one block shorter (D less 512) | the chain throws for running short | the four runs at jitter 0 throw "the hold-back runs short" (at the first sample given out); the runs with jitter give 512 samples too many and fail |
| the hold one block longer | `stats.margin` under 512 | the hold's check fails: 602 at each frame rate over 30 s at jitter 0 |
| the chain pushes each message at the sender's tick with jitter | the chain is the render at jitter 50 | every run with jitter fails (the first difference at sample 15,394 at 66.67 fps) |
| the arrival plan made from another seed | the chain is the render at jitter 50 | every run with jitter fails |
| the chain's own scale and clip kept with the receiver's gain off | the gain-off case | fails, the first difference at sample 20,002 |
| `spurtStarts` left at the sender's spurt | called `opens` times on P and Q | fails (3 calls on P seed 1, where the render opens 2); the room cases at 48 and 44.1 kHz fail too |
| `spurtStarts` called at once, not before its sample | the same sample at every plan of blocks | fails: the calls fall at 20,172 and 372,972 on P seed 1, not on whole blocks and not the same at every plan |
| `lowLatency` accepted with `'game'` | the refusals | fails |
| `arriveAt` accepted with `'game'` | the refusals | fails |
| the timeline with no end keeps its records | an hour keeps no more than a minute | `voice-channel` fails (4,004 entries after a minute, 240,000 after an hour); section 10's `held()` check fails too |
| the timeline with no end drops nothing before sample 0 | its samples are the whole length's | `voice-channel` fails at the first call of the first stream |
| a whole length goes through the path with no end | `tests/voice-channel.verify.mjs`'s checks | `voice-channel` fails at its first check that reads a whole length's `info` (a TypeError: `info.spurts` is missing), before any recorded value is compared |
| the arrival model with no end forgets a tick it is asked again | its answers are the whole model's | fails, and every chain run with jitter throws (an arrival tick that is not a whole number) |
| `steamChannel` with no end keeps every answer (builder's) | what the chain keeps | fails (337 entries after 5 s, 805 at the end) |
| `createChannel` ignores `listDrops` (builder's) | an hour keeps no more than a minute | `voice-channel` fails (495 entries after a minute, 29,764 after an hour) |
| `onOpen` tells the sample a block late (builder's) | a channel's start | fails (the first call at 23,040 where the formula gives 22,528) |
| the arrival model with no end keeps every leaving tick (builder's) | the arrival model's `held()`; what the chain keeps | both fail |
| `queueCostMs` counts the reach, not D (builder's) | the delay | fails (0.00 where 101.61 is wanted) |
| the frame codes reported before they are final (builder's) | `stats`: the codes are the render's log as sent | fails |

The order's break "`add()` called with what was given out" was dropped by the plan review's point 1 and not made.

## Done means

Heavy runs inside `flock /tmp/tf2ve-heavy.lock`, on the branch at `c38895e` (the code of this order; the tests'
README and the report changed after it).

1. `node tests/run.mjs render-channel`: passed, inside the whole run below (`== render-channel: passed, 142.2 s`),
   section 10 replaced by the checks above.
2. `node tests/run.mjs voice-channel`: passed, inside the whole run (`== voice-channel: passed, 104.3 s`).
3. `flock /tmp/tf2ve-heavy.lock pnpm test`: `27 of 27 suites passed. 1147.9 s summed`. So every recorded value
   held: `render-stream` (317.5 s), `stages` (250.5 s), `steam` (137.0 s, section [10b] unchanged), `verify`
   (10.2 s) and `output-stage` (7.9 s, section [14] unchanged) passed with their files untouched; section 17 of
   `render-channel` passed unchanged.
   The browser suite, `CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1)
   flock /tmp/tf2ve-heavy.lock pnpm test:browser`: **failed**, `== browser: FAILED (exit 1), 171.1 s`, at
   [Browser 3f2]: "a voice channel starts at each talk spurt and nowhere else ... (2 spurt starts for 4 spurts;
   26/256 for 192 blocks after the hall, then 41/256 after a spurt start)". The suite stops at its first failure.
   See "The question" below. In a copy of the branch outside the repository where that one check's options were
   given the file's own timing (`timeline: 'source', fps: undefined, bufferMs: undefined`, as `live.js`'s
   `liveOptions()` sends them), the whole browser suite passed: `== browser: passed, 400.7 s`. No other browser
   check fails.
   `node tests/cache-number.mjs origin/main --report`: "cached files changed since origin/main (23ef54c):
   engine/live-chain.js, engine/network.js, engine/room.js, engine/steam.js, voice-channel.js" and "cache number
   against origin/main (23ef54c): the number is v46, not above v46: it must rise (node tests/cache-number.mjs
   origin/main --set)". The builder did not set the number.
4. `git diff origin/main --stat` (against the merge base): `engine/live-chain.js`, `engine/network.js`,
   `engine/room.js`, `engine/steam.js`, `voice-channel.js`, `tests/render-channel.verify.mjs`,
   `tests/voice-channel.verify.mjs`, `tests/README.md`, `tests/predictions/PREDICTIONS.md` and this report: every
   one in "May touch". `tests/browser.verify.js` is not touched.
5. This report.

CI (`tests`) on the branch: run 43533980213 on `c38895e`: `verify` failure; `units`, `engine`, `render` and
`stages` success, `browser` failure at the same check as above. Run 43539904627 on the head `8f1f017` (the report,
the suites' times and a merge of `main`): `verify` failure; `units`, `engine`, `render` and `stages` success;
`browser` failure at [Browser 3f2], the same line. This line's commit changes only `docs/` and starts no run.

## The question, and what was not done

### The question, and the ruling

**Ruled 2026-11-14 by the orchestrator: the first way below**, made as the file-by-file list says; the result is
under "After the ruling" at the end.

[Browser 3f2] (`tests/browser.verify.js`, `verifyLiveRoom`, about line 1553) starts the live monitor's worker
itself and hands it `{ ...renderOptions(), codec, ... }`, not `live.js`'s `liveOptions()`. Since W3-02d-1 the page's
`renderOptions()` sends `timeline: 'game'` with `fps` 300 and `bufferMs` 100 on Steam voice. Until this order the
chain ignored `timeline`, so the check ran on the file's own timing and held `spurtStart` to each spurt the sender
opens. The chain now reads `timeline` as the order says, runs the queue there, and calls `spurtStart` at each open
of its channel: 2 for the sender's 4 spurts, since at 300 frames a second the 0.8 s pauses of that check's signal do
not free the channel (a spurt joins the running channel). That is what the order asks of the chain on the queue
(section 10's "a channel's start" holds it to the render's opens). The page itself is unchanged: `liveOptions()`
still sends `'source'`, so the monitor does not change until part b.

The order says the browser suite passes unchanged and lists `tests/browser.verify.js` under "May not touch" for
part a, and nothing in the engine may keep ignoring `'game'` without going against the order. So the builder
stopped there. Two ways out, for the orchestrator to choose:

1. Let part a change that one line of `tests/browser.verify.js`: the check's options take the monitor's own timing,
   `timeline: 'source', fps: undefined, bufferMs: undefined`, as `liveOptions()` sends them today, so the check holds
   what it was written for. The run above shows the whole suite then passes. Part b, which owns the page's queue
   switch, would add the queue's case to [Browser 3f2] (spurt starts at the channel's opens).
2. Or restate the check in part a so that on the game's timeline it counts the channel's opens
   (`TF2Live`'s or the worker's `stats.channel.opens`) in place of the sender's spurts.

### Not done, or uncertain

- **Part b** (the worker, the page's switch, the recorded take, the documents) is not built. `docs/LIVE.md`,
  `README.md`, `docs/PAGE.md` and `docs/ACCURACY.md` still say jitter does nothing in the monitor, which stays
  true on the page until part b.
- **The reviewer's attacks, run early on the build** (outside the suites, measured): jitter 500 at 10 frames a
  second (24 kHz with blocks of 1, 480 and 4,800 in turn; 48 kHz with the gate off and blocks of 960, 128, 4,096
  and 7) and at 1,000 frames a second, and jitter 100 at 66.67, each 30 s with the key released inside phrases and
  pressed inside the next channel's wait: every one equal to `createRender` over what it gave out, with
  `spurtStart` called once for each of the render's opens (35, 2, 10 and 12) and the largest arrival delay 1,635
  ms at 10 frames a second. Thirty minutes of unbroken sound (the gate off) at 66.67 frames a second: equal to
  `createRender` over all 79,366,454 samples given out, `held()` 0 throughout, the least margin 89 (reached between
  the 4th and 6th minute), the chain 98 s and the render 90 s of one core. On that signal the channel opened once
  and dropped nothing, so the attack's thinning and restart did not occur there; whether the level dipped was not
  measured. A room switched while a channel is open was not tried.
- **What still grows**: `steamTimeline`'s open-ended frame log, on either timeline (PROGRESS's deferred list). The
  chain's own `held()` does not count it.
- **`queueCostMs`** is reported on every Steam chain, at the chain's own `fps` and `bufferMs`; the page sends
  neither on the file's own timing, so there it is the figure at the voice channel's defaults (300 and 100). Which
  figure the box's help shows is part b's.
- **`stats.channel` and `stats.arrivals`** count what the chain has handed the channel so far. They are not
  compared with a render's `codecInfo` at the end: a render's sender also gives its closing messages at the end,
  which a chain never does.
- **Choices this build made where the order did not say**: `steamGameTimeline` is called with no received voice
  (the chain never takes a demo's); `lowLatency: false` and `arriveAt: null` with `'game'` are taken; `counts()`
  and `held()` are on whole-length timelines too (nothing in `info` changed); the arrival model with no end at
  jitter 0 also refuses a falling tick; `stats.pushed` and `stats.margin` exist only on the queue (`margin` is null
  until the chain gives out its first sample).
- **The break "a whole length goes through the path with no end"** fails the module's suite by a TypeError where
  the suite first reads a whole length's `info`, not at a recorded value.
- The diff and the commit messages were scanned for recordings, personal details, SteamIDs and model names: none,
  but the commits' attribution lines.

## After the ruling

The one line of [Browser 3f2] changed as ruled. The browser suite, `CHROMIUM_EXECUTABLE=$(ls -d
/opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) flock /tmp/tf2ve-heavy.lock pnpm test:browser`:
`== browser: passed, 383.5 s`, the check reading "4 spurt starts for 4 spurts; 26/256 for 91 blocks after the hall,
then 41/256 after a spurt start". `main` was merged first (the ruling, documents only).

CI (`tests`) on the head `005aacb`: run 43542875412, `verify` success, with `units`, `engine`, `render`, `stages`
and `browser` each success. This line's commit changes only `docs/` and starts no run.
