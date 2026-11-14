# W3-02c-3: the live monitor can run the game's voice queue

**Status 2026-11-13: planned again after BC-4, not built.** Written by a planner from the repository alone, at
`main` `bc28875` (cache v45). Line numbers are that commit's. It replaces the text planned before BC-4, which is
in git as this file stood at `584466e`. That text's stop-and-ask said the order is planned again once BC-4 is
merged; BC-4a and BC-4b were merged on 2026-11-13. The planning report is
[W3-02c3-replan.md](../reports/W3-02c3-replan.md). The order is read by a plan reviewer before any build.

**Kind:** a change to how the live chain computes its sound when a setting of its own is on, and changes to
`voice-channel.js`, `engine/network.js` and `engine/steam.js`, which every render on the game's timeline runs.
No render may move.
**Parts:** W3-02c-3a (the module, the arrival model, the chain, their suites) and W3-02c-3b (the worker, the
page, the recorded take, the documents). Each is merged on its own, part a first. After part a the page still
asks the chain for the file's own timing, so the monitor does not change until part b.
**Roles:** `tf-builder` (effort xhigh for part a, high for part b), then `tf-reviewer`. Part a also needs a
second reader on the stronger model (`docs/PIPELINE.md`: it touches the module renders run). Part b needs none.
**Branches:** `claude/w3-02c3a-live-channel` and `claude/w3-02c3b-live-page`, each from `main` as it stands when
the part starts. **Worktrees:** in the brief.
**Reports:** `docs/reports/W3-02c3a-live-channel.md` and `docs/reports/W3-02c3b-live-page.md`.
**Budget:** 10 hours for part a, 6 hours for part b.
**Cache number:** rises once with each part. The builder does not set it.

## Why

The live monitor plays the microphone through a render's own stages. Since W3-02d-1 the page's render on Steam
voice plays its packets through the receiver's voice queue, and since BC-4 jitter on Steam voice is the tick on
which each packet reaches that queue. The monitor does neither. It lays each packet where the source has it
(`engine/live-chain.js:109`, `:182`), so in the monitor no phrase starts early, none waits, and jitter does
nothing (`docs/work-orders/BC-4-jitter-arrivals.md`, "Where it runs", c).

Ruled: the queue in the monitor is a setting, off on every load. The owner said on 2026-11-13 to keep moving
with the list that named this order next, and left the monitor's default to the orchestrator
(`docs/PROGRESS.json`, `waiting_on_the_owner` and `next`).

## What is known

| What | Figure | Standing |
| --- | --- | --- |
| The monitor's chain holds back today | about 207 ms on `steam` | measured by the browser suite (`docs/LIVE.md`) |
| Of that, the sender's reach and the codec's look-ahead | 4,650 and 156 samples at 24 kHz, 200.25 ms | read (`engine/steam.js:35`, `engine/live-chain.js:134`) |
| The zero of a render on the game's timeline, D | 13,312 samples at 66.67 frames a second, 15,360 at 100, 24,576 at 300 (301.9, 348.3 and 557.3 ms) | read (`voice-channel.js:336`) |
| What the chain must hold back with the queue, at its mix point | D, in place of the reach and the look-ahead | inferred from the stream's bound and the module's clock ("The hold-back"); not built yet |
| How far the queue's final sound runs ahead of that hold | never less than 89 samples | measured on a prototype (the planning report) |
| The chain's hold with the queue | about 309 ms at 66.67 frames a second, 355 at 100, 564 at 300: 101.6, 148.0 and 357.0 ms more than today | inferred; not built yet |
| Jitter and the hold | the hold does not grow with jitter | inferred; measured on a prototype at jitter 50 and 100 |
| A packet's largest delay above the least | 195 ms at jitter 50 and 405 ms at jitter 100, from 66.67 frames a second up | inferred from the list's rule; not passed in 2,000,000 ticks a setting (measured on the engine's model) |
| Unbroken talk through the queue | at 300 frames a second the level starts to dip after 11.6 to 12.0 minutes; at 66.67 after 0.4 to 3.2 minutes | measured on the model (`docs/reports/W3-02cd-plan.md`); no take |

The monitor has no ten-minute limit, so the last row can be reached in a session. Speech pauses, and each pause
that closes the channel fills the queue again.

## What BC-4 changed for this order

- **A packet's tick.** `steamChannel` (`engine/steam.js:182-253`) takes an `arrive` function. It pushes each
  message at `arrive(tick)` and advances to `arrive(bound)`. The renders make it with `steamArrivalPlan`
  (`engine/network.js:287-290`) from the render's seed and frame rate (`engine/render.js:640`,
  `engine/render-stream.js:258`).
- **The hold-back.** The earlier plan expected a delayed packet to make the chain wait longer. It does not. The
  model takes the least delay out, so a message never arrives before its sender's tick
  (`engine/network.js:237-246`), and an arrival tick never falls. The channel can then be run to the arrival
  tick of the stream's bound, which is at or after the bound itself. Jitter moves the sound later inside the
  render and inside the monitor alike. It does not move what the chain must wait for.
- **What is kept.** The arrival model keeps one number for every tick and crossing (`engine/network.js:260-268`)
  and `steamChannel` one for every tick (`engine/steam.js:185-199`). A monitor that runs for hours needs both
  to forget.
- **The words.** The page and the documents now say jitter does nothing in the monitor on Steam voice
  (`live.js:126-135`, `docs/LIVE.md:14`, `README.md:105` and `:115`, `docs/PAGE.md:202-204`,
  `docs/ACCURACY.md:30` and `:146`). Part b changes them.

## The hold-back

The chain gives its sender one sample at a time (`engine/live-chain.js:165-168`). Let P be the samples given so
far, at 24 kHz.

1. No later message has a sender tick below `B = steamBoundTick(S, lastTick, P)`, which is at least
   `ceil((P / 24000 + relay) / tick)` (`engine/steam.js:123`; the reasoning is at
   `engine/render-stream.js:272-282`). The relay is 2 ms and the tick 15 ms (`steam-sender.js:87-92`).
2. No later message arrives before `arrive(B)`, and `arrive(B)` is at least B.
3. Advanced to a tick, the timeline has run every mixer block that starts before it
   (`voice-channel.js:416-423`, `:480-485`). Block b starts at 512 b samples and gives output samples
   `512 b - D` onward (`:377`). So the output is final up to at least `661.5 B - D`.
4. `661.5 B` is at least `P × 147 / 80 + 88.2`. So after P samples the output is final up to at least
   `floor(P × 147 / 80) - D`, with 89 samples to spare at the least.

So the chain holds back D at its mix point and nothing more. D is a whole number of mixer blocks, and a hold one
block shorter runs short. The 89 samples are the sender's relay, which is an arbitrary constant
(`steam-sender.js:87-89`), so the hold is not cut by them.

The chain gives out the render's own sample numbers. Sample n at the chain's mix point is sample n of a render
of the same sound made with the same options. Nothing is given out until `floor(P × 147 / 80)` passes D, as
today nothing is given out until P passes the reach (`engine/steam.js:67-70`). The chain's `contentDelay` stays
0, so the worker's recording lines up as it does today (`live-worker.js:148-149`).

## Jitter in the monitor

**With the queue on the monitor runs BC-4's arrivals:** `steamArrivalPlan` with the chain's seed, its frame rate
and its `jitterMs`, as `engine/render-stream.js:258` makes it. The monitor then equals a render of the same
sound with the same settings, at any jitter.

**No cap, no refusal.** The hold does not depend on jitter, so nothing forces a cap. The chain takes the
engine's range (0 to 500 ms, `engine/live-chain.js:238`); the page offers 0 to 100.

**What it costs in delay.** The hold is fixed by the frame rate. The rest is the sound itself coming later, as
it does in a render with jitter.

| Frame rate | Jitter | The hold, more than today's monitor | A phrase starts later than at jitter 0, in the mean | A packet's largest delay above the least: seen, and the rule's bound |
| ---: | ---: | ---: | ---: | --- |
| 66.67 | 0 | 102 ms | 0 | 0 |
| 66.67 | 50 | 102 ms | 96 ms | 195 ms, 195 ms |
| 66.67 | 100 | 102 ms | 209 ms | 390 ms, 405 ms |
| 300 | 0 | 357 ms | 0 | 0 |
| 300 | 50 | 357 ms | 59 ms | 165 ms, 195 ms |
| 300 | 100 | 357 ms | 128 ms | 300 ms, 405 ms |

The hold is inferred and not built yet. The other columns are measured on a prototype and on the engine's model
(the planning report). At 300 frames a second and jitter 100 a phrase is heard about 0.49 s later than in today's
monitor.

**The page says so.** The panel's delay is what the chain holds back. With jitter the box's help says that each
phrase comes later again by the time its first packet took, which that figure does not count.

## Whether this order is on the finish line

The finish line (`docs/PROGRESS.json`, `finish_line`) is a measurement: every stage of the modern preset equal to
a take, or its difference measured and explained. This order closes no stage against a take. The switch is off
on every load, and no take is of a live session. So the measurement does not wait for it.

The same entry lists the last builds before the line, and this order is in that list ("the receiver's queue
(W3-02c-2, c-3, d)"). The orchestrator ruled on 2026-11-13 that it stays on the list of builds. With BC-4 merged
it is the one build of that list not built yet.

## Part W3-02c-3a: the module, the arrival model, the chain

### Build

**1. `voice-channel.js`: a timeline with no end.**

`createTimeline` refuses a missing `length` (`:322-323`). It keeps a source map of the whole length (`:343`), a
record for every message (`:348`), every spurt and every overflow (`:350`) until `finish()` (`:487-506`).
`createChannel` keeps a record of every overflow (`:142`, `:150`, `:186`).

- **The zero as a function.** The module exports the expression at `:336` as a function of `bufferMs`, `fps`
  and `codecDelay`, and `createTimeline` calls it. D does not change. The suite's check of the module's
  exported names (`tests/voice-channel.verify.mjs:239-242`) gains that one name.
- **`createChannel`** takes one new option under which it adds nothing to its `drops` list. `dropped` and every
  sample stay as they are. Without the option nothing changes.
- **`createTimeline` with `length: Infinity`** is accepted. Any other `length` gives what it gives today, to the
  sample and to the field of `info`.
- With `length: Infinity`, `push` and `advance` return the samples a whole length returns for the same calls.
  Output before sample 0 is dropped as today (`:410`), and nothing is cut at an end.
- With `length: Infinity` the timeline keeps no source map and no list that grows with time. A message's record
  goes once all its samples have left the ring. Overflows are counted and not listed.
- **`counts()`**, on the endless timeline at any time: `{ timeline, fps, bufferMs, codecDelay, waitTicks,
  latency, packets, opens, appended, gainResets, droppedSamples }`, each as a whole-length timeline over the same
  calls has it in `info` (`:494-497`).
- `finish()` on an endless timeline ends it and returns what was final and not yet returned, with `counts()` as
  its `info`. It runs no block.

**2. `engine/network.js`: an arrival model with no end.**

`steamArrivals` (`:253-279`) takes an option for a caller with no end. With it `at()` takes ticks that never
fall, refuses one below the last with a RangeError, and keeps no leaving tick that a later call cannot ask
for. It gives the same answers, tick for tick. `steamArrivalPlan` (`:287-290`) passes the option on. Without the
option both are what they are today.

**3. `engine/steam.js`: `steamChannel` with no end.**

- `length: Infinity` is handed to `createTimeline` (`:223`). Its list of answers (`:185-199`) then keeps only
  what a later call can ask for. The chain asks it ticks that never fall.
- It gives its caller the zero D and the timeline's `counts()`.
- **`onOpen(index)`**: called once for each open, where the channel resets the gain (`:203`, `:219`). `index`
  is the count of samples the timeline has returned once the push that opened the channel has returned. Every
  block that starts before the open's tick has run by then and none after it (`voice-channel.js:447`, `:464`).
  So `index` is the first sample of the first block that starts at or after the open's tick.
- With a whole `length` and no `onOpen` it is what it is today.

**4. `engine/live-chain.js`: the chain runs the render's channel.**

`steamLiveChain` (`:72-222`) makes its timeline at `:109` with no channel, hands each message to it at `:182`
with what was already given out, bounds what it may give out at `:184` and takes it at `:204`.
`createLiveChain` (`:228`) ignores `opts.timeline`.

With `opts.timeline: 'game'`:

- **The option is read as a render reads it.** `createLiveChain` calls `steamGameTimeline`
  (`engine/steam.js:101-114`) at its entry, as `process()` does (`engine/render.js:124`). Where a render refuses
  `'game'` the chain's promise rejects with the same error: another codec (the chain of `:298` onward
  included), the codec skipped, `retime`. The chain also refuses `opts.lowLatency` with `'game'`, because the
  reach it shortens is not used, and `opts.arriveAt`, because a test's own arrival ticks can fall below the
  sender's and the hold then runs short. The names are the render's own three: `timeline`, `fps`, `bufferMs`.
- **The channel is the stream render's.** `steamChannel` is made as `engine/render-stream.js:258-260` makes
  it, with `length: Infinity`, the arrival plan in its endless form, and `onOpen`. It is handed to
  `steamTimeline` as `cfg.channel` (`engine/steam.js:387`), with no gain (`engine/render-stream.js:262`). The
  timeline then lays nothing and pushes each message to the channel (`engine/steam.js:454`, `:473`, `:492`).
- **`add()` is called as a render calls it,** with no third argument. With one, the rules for a packet behind
  what was given out (`engine/steam.js:476-484`) would move the cursor and the channel would be told another
  place than a render's.
- **What the chain gives out.** After each sample's messages are fed, the chain advances the channel to
  `steamBoundTick(S, lastTick, P)` and keeps what the channel returns. It gives out the samples before
  `floor(P × 147 / 80) - D`. If the channel has returned fewer, the chain throws: by "The hold-back" that
  cannot happen. The plan of blocks does not change the output.
- **The receiver's gain off.** The channel's own gain object scales, clips and rounds
  (`engine/steam.js:218-222`). So the chain leaves out its stage at `engine/live-chain.js:120`, as
  `engine/render-stream.js:350-352` leaves out its own.
- **A channel's start.** `spurtStarts()` is called today at the first message of each spurt the sender opens
  (`engine/live-chain.js:174`; the reason is at `:275-280` and `engine/room.js:99-106`). With the queue it is
  called once for each open, before the chain hands its mix stages the sample `index` that `onOpen` gave. A
  spurt that joins a running channel calls nothing. So the room fixes its limits for the block the open falls
  before (`room-dsp.js:960-967`), whatever the plan of blocks.
- **The delay the chain reports.** `holdBack` (`engine/live-chain.js:134-136`, the getter at `:144`) counts
  the reach and the look-ahead over 24,000. With the queue it counts D over 44,100 in their place. The chain
  reports `queueCostMs`, the difference of the two, as it reports `lowLatencySavingMs` (`:216`).
- **The panel's counts.** `stats.frames`, `sent`, `lost`, `late` and the frame codes (`:188-197`) stay the
  sender's, on the file's own timing. Their bound is the render's, `steamGiveOut` with no limit on the wait
  (`engine/render-stream.js:295`). A log of what was played is not built in the monitor: the endless timeline
  keeps no source map.
- **What `stats` gains with the queue:** `channel` (the timeline's `counts()`), `arrivals` when jitter is
  above 0 (`{ jitterMs, fps, floorTicks, messages, meanMs, maxMs, sameTick }`, as `engine/steam.js:240-241`
  counts them), and `margin`, the least count of samples by which the channel's returned sound was ahead of
  what the chain gave out.
- After the mix point nothing changes (`engine/live-chain.js:119-121`, `:281-290`).

Without the option, or with `'source'`, the chain is what it is today, to the sample.

**5. Comments that say "not built yet":** `engine/room.js:104-106` and `engine/live-chain.js:277-279`, the
comment only.

### The suites that hold "the live chain is the render"

| Suite | What it holds today | After part a |
| --- | --- | --- |
| `tests/steam.verify.js`, section [10b] (`:1060`) | at the mix point the chain gives the render's samples on the file's own timing, at 24 and 48 kHz, with loss, late frames by the suite's mask, the gate off and push-to-talk | unchanged, and passes unchanged |
| `tests/output-stage.verify.mjs`, section [14] (`:492`) | after the mix point the chain is the render, at 48 and 44.1 kHz | unchanged, and passes unchanged |
| `tests/render-channel.verify.mjs`, section 10 (`:684-703`) | a chain made with `timeline: 'game'` gives the samples of one made without | replaced: "Done means", 1 |
| `tests/render-channel.verify.mjs`, section 17 (`:964-973`) | on the file's own timing the chain at jitter 50 is the chain at jitter 0 | unchanged, and passes unchanged |

### Files

May touch: `voice-channel.js`; `engine/network.js` (`steamArrivals` and `steamArrivalPlan` only);
`engine/steam.js` (`steamChannel` only); `engine/live-chain.js`; `engine/room.js` (the comment at `:104-106`
only); `tests/voice-channel.verify.mjs`, `tests/render-channel.verify.mjs` (new checks, the replaced section 10 and
the list of exported names; no recorded value changed); `tests/README.md` (the two suites' rows); `tests/predictions/PREDICTIONS.md`
(the note `tests/accuracy.mjs` asks for when a hashed model file changes); the report. `sw.js`: never the
number.

May not touch: `engine/render.js`, `engine/render-stream.js`, `audio.js`, `audio-worker.js`, `live.js`,
`live-worker.js`, `index.html`, `steam-sender.js`, `constants.js`, any codec module, any file under `app/`,
`tests/steam.verify.js`, `tests/output-stage.verify.mjs`, `tests/browser.verify.js`,
`tests/predictions/predictions.json`, `tests/REFERENCE_2026.md`, `docs/PROGRESS.json`, `docs/README.md`,
`CLAUDE.md`.

### What must not move

- Every recorded value of every suite: `git diff origin/main -- tests/` shows added checks and the replaced
  section 10, and no changed hash, reference or tolerance.
- Every render: `flock /tmp/tf2ve-heavy.lock node tests/run.mjs voice-channel render-channel render-stream
  stages steam verify output-stage` passes with those files' recorded values untouched.
- The chain without the option: sections [10b], [14] and 17 pass unchanged in what they assert.
- `ARRIVAL_MS` and D in `tests/voice-channel.verify.mjs`.
- The page: the browser suite passes unchanged.

### Done means

1. `node tests/run.mjs render-channel` passes with section 10 replaced by these. Each fails when the code it
   covers is broken.
   - **The chain is the render.** At the mix point (`opts.onGain`), for 66.67, 100 and 300 frames a second
     each at jitter 0, 50 and 100, three seeds at 300 frames a second and jitter 50, loss 15% at each frame
     rate, and a 48 kHz microphone at 66.67 and at 300: the chain gave `G = floor(P × 147 / 80) - D` samples,
     and sample n of the chain is sample n of the render made with the same options, for every n below G. The
     check prints G, which is not zero. The render is `createRender`'s.
   - The same samples for blocks of 1, of 480, of 4,800 samples and an uneven plan.
   - The same with the gate off, with push-to-talk pressed and released, with the receiver's gain off, and
     with a room attached (`opts.liveRoom`) after the mix point at 48 and at 44.1 kHz.
   - **The hold is D and no less.** `stats.margin` is 0 or more in every run, and under 512 in the runs of 30 s
     or more at jitter 0.
   - **The delay.** `queueCostMs` is `1000 × (D / 44100 - 4806 / 24000)` at the three frame rates, and
     `stats.latencyMs` with the queue is the figure without it plus `queueCostMs`.
   - **A channel's start.** On the suite's layouts P and Q, where a spurt joins a running channel,
     `spurtStarts` is called as many times as the render's `codecInfo.channel.opens`, and not once for each
     spurt. Each call comes before the same mix sample at every plan of blocks, a whole number of blocks. For
     the first open that sample is `512 × ceil(1323 a / 1024) - D`, or 0 if that is below 0, with a the tick
     of the first message that reaches the channel.
   - **`stats`.** With the queue `stats.channel.opens` is above 0 after talk. `stats.arrivals` is there at
     jitter 50 and absent at jitter 0.
   - **The refusals.** A chain made with `timeline: 'game'` on `celt_22`, with the codec skipped, with
     `retime`, with `lowLatency` and with `arriveAt` rejects, each with a RangeError that names the reason. A
     `timeline` that is neither name rejects as a render's does.
   - **The chain without the option.** A chain made with no `timeline` and one made with `'source'` give the
     same samples as `main`'s chain, against a value recorded from `main` before the change and kept in the
     suite.
   - **The arrival model with no end.** Its `at()` gives the whole model's answers tick for tick over 20,000
     ticks at jitter 25, 50, 100 and 500 and at 10, 66.67 and 300 frames a second. A tick below the last is
     refused. After an hour of ticks it keeps no more than after a minute (the test reads a count the model
     gives for this, or measures the heap, and says which).
2. `node tests/run.mjs voice-channel` passes with new checks.
   - With `length: Infinity` the samples `push` and `advance` return are those of a whole length over the same
     calls, for the suite's seeds, and `counts()` has the whole length's `info` in each of its fields.
   - An hour of packets leaves what the endless timeline keeps no larger than a minute does, at 300 frames a
     second, where the ring overflows (the test says how it measures).
   - `createChannel` with the new option gives the samples and the `dropped` of one without it, and an empty
     `drops`.
   - The exported zero gives 13,312, 15,360 and 24,576 at the three frame rates with the codec's 156 samples,
     and 24,064 at 300 with none.
3. `flock /tmp/tf2ve-heavy.lock pnpm test` and the browser suite pass. `node tests/cache-number.mjs origin/main
   --report` says the number must rise; its line is in the report.
4. `git diff origin/main --stat` shows no file outside "May touch".
5. The report: D and the hold at the three frame rates; `stats.margin` as measured; the monitor's delay with
   and without the queue as the chain reports it; the breaks; what was not checked.

### The breaks the builder makes

| Break | The check that must fail |
| --- | --- |
| the chain ignores `timeline` (today's code) | the chain is the render |
| the hold one block shorter (D less 512) | the chain throws for running short |
| the hold one block longer | `stats.margin` under 512 |
| the chain pushes each message at the sender's tick with jitter | the chain is the render at jitter 50 |
| the arrival plan made from another seed | the chain is the render at jitter 50 |
| `add()` called with what was given out | the chain is the render |
| the chain's own scale and clip kept with the receiver's gain off | the gain-off case |
| `spurtStarts` left at the sender's spurt | called `opens` times on P and Q |
| `spurtStarts` called at once, not before its sample | the same sample at every plan of blocks |
| `lowLatency` or `arriveAt` accepted with `'game'` | the refusals |
| the endless timeline keeps its records | an hour keeps no more than a minute |
| the endless timeline drops nothing before sample 0 | the endless samples are the whole length's |
| a whole `length` goes through the endless path | `tests/voice-channel.verify.mjs`'s recorded values |
| the endless arrival model forgets a tick it is asked again | its answers are the whole model's |

### Stop and ask

- The sound the chain can give out is not the render's from some sample on.
- The channel runs short of `floor(P × 147 / 80) - D` in any run. The hold is then not D.
- The module cannot be given its endless form with the one option on `createChannel`, or what a whole `length`
  returns would change.
- A recorded value of any suite moves.

### What the reviewer attacks

The hold against the module's clock (run the chain at D less one block). A chain fed in blocks of 1, of 480
and of 4,800 samples. Jitter 500 at 10 frames a second, where a packet can be 139 ticks late (inferred from the
list's rule). Push-to-talk released inside a phrase and pressed inside the channel's wait. A room switched
while a channel is open. Thirty minutes of unbroken sound at 66.67 frames a second: the chain must do what the
render's rules do, thin and restart, and must not grow or stall. Every `createTimeline` and `steamArrivals`
caller with a whole length, against `main`.

## Part W3-02c-3b: the worker, the page, the recorded take

Built on `main` after part a.

### Build

**1. `live-worker.js`.** It already loads `voice-channel.js` (`:26`) and hands the chain the page's options
(`:124-125`). With `ready` (`:134`) it posts `queueCostMs` and the timeline the chain runs, as it posts
`lowLatencySavingMs`. A recording's `info` (`:201-203`) gains the last chain's timeline and, on the game's
timeline, its `fps`, `bufferMs` and `channel` counts, the counts taken as the difference between the
recording's start and its stop.

**2. The switch.** A checkbox `live-queue` in the Extras box beside `live-lowlat` (`index.html:305-308`), off
on every load: "Live monitor: the game's voice queue". It is kept as `live-lowlat` is kept: on the page only,
not in the remembered settings, not in a share link, with no console name. It joins `CONTROLS_EXTRAS`
(`tests/browser.verify.js:1317-1318`) and the labelled controls (`:4229-4232`).

**3. What the page sends.** `liveOptions()` (`live.js:42-43`) sends `timeline: 'game'` with the page's
`fps_max` and `voice_buffer_ms`, read as `renderOptions()` reads them (`app/render.js:395-396`), when the box
is checked, the codec is `steam` and the codec is on. It sends the file's own timing otherwise, as today. The
render's Phrase timing control does not decide the monitor. While the box is checked the low-latency box is
disabled and sent as off. A changed `fps_max` or `voice_buffer_ms` while the box is checked builds a new chain,
as any setting the chain reads does (`live-worker.js:47`).

**4. The words.**

- The box's help gives the chain's figure, as `live.js:51-52` and `:66` give the low-latency saving: each
  phrase waits as in the game, and the monitor plays so many milliseconds later. It adds that with jitter each
  phrase comes later again by the time its first packet took.
- The panel's delay (`live.js:309-311`) follows the chain's figure already. Its tooltip (`live.js:50`) names
  the queue's wait while the queue runs.
- The jitter note (`live.js:126-135`). With the queue off it says "Jitter does nothing in the live monitor on
  the file's own timing." With the queue on it adds nothing.
- Phrase timing's help (`index.html:302`) ends "The live monitor keeps the file's own timing unless its own
  switch for the queue is on."

**5. The recorded take** (`app/render.js:753-772`). A take's key is the page's on the timing the monitor ran:
the file's own, as today, or the game's with the frame rate and `voice_buffer_ms` the chain had. A take made on
the queue carries `codecInfo.channel`, so the line beside Hear shows (`app/render.js:777-779`) and the console
prints the queue's line (`:530-535`). A take held back from a render by itself says which way it was made
(`:941-947`): the text there today, or "on the game's voice queue; Render gives it on the file's own timing".
The take's codec lane stays the sender's frames on the file's own timing.

**6. The documents.**

| Document | What changes |
| --- | --- |
| `docs/LIVE.md` | the `steam` row (`:14`): with the switch on, the monitor equals a render on the game's voice queue, with jitter; "Two things differ" (`:24-28`); the recorded session (`:31-33`); "Latency": the hold with the queue at the three frame rates, as the chain reports it, and what jitter adds; the switch among the extras; unbroken talk thins after minutes at a low frame rate (measured on the model, no take) |
| `docs/PAGE.md` | the switch; `:83`, `:164`, `:175`, `:202-204` |
| `README.md` | step 3 (`:35`), "Not built yet" (`:105`), "Live monitor" (`:113-115`) |
| `docs/ACCURACY.md` | `:24`, `:30`, `:104`, `:107`, `:146` |
| `docs/VOICE-PATH.md` | `:71` |

Every figure in the new words carries its standing. The hold is the chain's own figure, computed from the
module's zero.

### Files

May touch: `live-worker.js`; `live.js`; `index.html` (the one control and the sentence at `:302`);
`app/render.js` (`mountLiveTake`, the held take's text); `app/core.js` (the control's entry, if the page's
lists need it); `tests/browser.verify.js` (new checks; the jitter note's check at `:1291-1294` restated); the
documents of item 6; the report. `sw.js`: never the number.

May not touch: `voice-channel.js`, any file under `engine/`, `audio.js`, `audio-worker.js`, `steam-sender.js`,
`constants.js`, any codec module, every suite but the browser's, `tests/predictions/predictions.json`,
`tests/REFERENCE_2026.md`, `docs/PROGRESS.json`, `docs/README.md`, `CLAUDE.md`.

### What must not move

- Every render and the engine: `git diff origin/main --stat -- engine audio.js constants.js voice-channel.js`
  prints nothing.
- The monitor with the box unchecked: the checks of [Browser 3f] that are there today pass, the restated
  note's check aside.

### Done means

1. The browser suite passes with new checks, each of which fails under its break.
   - The box is off on load, and off after a reload made with it checked. It is in no remembered setting and
     no share link.
   - Checked on Steam voice: the chain's options hold `timeline: 'game'` and the page's two numbers; the
     panel's delay rises by the cost the chain reports, within the suite's bounds for that figure; the box's
     help holds that cost; the low-latency box is disabled and sent as off; `TF2Live.stats.channel.opens`
     rises above 0.
   - Checked with Phrase timing on the file's own timing: the monitor still runs the queue.
   - A changed `fps_max` while the box is checked builds a new chain; unchecked it posts nothing, as today.
   - On `celt_22` and with the codec skipped the checked box does nothing: the chain is made with the file's
     own timing and no error is shown. The same on `steam_48` and `miles` (neither in TF2).
   - The jitter note: with the queue off on Steam voice at jitter 50 the note holds the new sentence; with the
     queue on it does not, and `TF2Live.stats.arrivals` is there.
   - A session recorded with the box checked is not silent. Its key holds `timeline: 'game'` and the two
     numbers. With Phrase timing on the queue it is not marked as made with other settings and no render
     starts by itself. With Phrase timing on the file's own timing it is held, with the new line.
2. `flock /tmp/tf2ve-heavy.lock pnpm test` passes. `node tests/cache-number.mjs origin/main --report` says the
   number must rise; its line is in the report.
3. `git diff origin/main --stat` shows no file outside "May touch".
4. The report: the monitor's delay with the box on and off as the panel shows it at 48 kHz; the breaks; what
   was not checked. A live session in a browser starts in mid-stream and is not compared with a render sample
   for sample; the report says so.

### The breaks the builder makes

| Break | The check that must fail |
| --- | --- |
| the box is remembered across a reload | off after a reload |
| `liveOptions()` reads Phrase timing | the monitor runs the queue with Phrase timing on the file's own timing |
| `liveOptions()` sends `'game'` on another codec | the checked box does nothing on `celt_22` |
| the low-latency box stays live | disabled and sent as off |
| the help's figure is a constant | the help holds the chain's cost, at another frame rate |
| the jitter note unchanged | the note's two cases |
| the take's key keeps the file's own timing | the recorded session's key |
| the held take's text unchanged | the held line with Phrase timing on the file's own timing |

### Stop and ask

- The panel's dropouts rise with the box checked (the playback queue runs dry). The chain then does not give
  its sound out evenly, which "The hold-back" says it does.
- A take recorded on the queue cannot be given a key the page's own key can equal.

## Rulings wanted before the build

Each has the planner's recommendation.

1. **Jitter in the monitor.** With the queue on the monitor runs BC-4's arrivals, with no cap, no refusal and
   no warning beyond the box's help. Recommended.
2. **The hold is D,** not D less the relay's 89 samples. Recommended: the difference is 2 ms, and the relay is
   arbitrary.
3. **Two parts.** Recommended: part a changes files every render on the game's timeline runs and needs the
   second reader; part b is the page. If ruled one build, the parts are built in order on one branch in 16
   hours.
4. **The chain refuses `opts.arriveAt`.** Recommended: the page never sends it, and an arrival below the
   sender's tick breaks the hold.
5. **The recorded take's key follows the timing the monitor ran.** Recommended. The other way, a take always
   keyed on the file's own timing, would mark a take made on the queue as made on the file's own timing.
6. **The finish line.** Recommended wording for PROGRESS: this order is the last build the line's list names,
   and the line's measurement does not wait for it.

## Rulings (2026-11-13, the orchestrator)

All six as the planner recommends: the monitor runs BC-4's arrivals with no cap, no refusal and no warning beyond
the box's help; the hold is D; two parts, a then b, a with a second reader; the chain refuses `opts.arriveAt`; a
recorded take's key follows the timing the monitor ran (part b may touch `app/render.js` for that); PROGRESS gets
the finish line's wording. The owner said on 2026-11-13 to keep moving with the list that named this order next;
the box is off on every load, the default left with the orchestrator. PROGRESS's line to the owner gave the
queue's wait (about 90 ms and 435 ms) as the monitor's cost: it is corrected to the hold's cost over today's
monitor, about 102 ms at 66.67 frames a second and 357 ms at 300 (inferred, this order's "The hold-back"). Today's
chain growing about 2 MB an hour in `steamTimeline`'s open-ended frame log (inferred from the code, with or
without the queue) goes on PROGRESS's deferred list; this order does not fix it. A plan reviewer reads the order
before part a is built.

*Added 2026-11-13 (the orchestrator), from W3-02ef's ruling 9:* W3-02f is merged before part a. After it no render
refuses `retime`, so part a's item 4 and its check of the refusals lose `retime`: the chain does not name it.

## After the plan review (2026-11-13, the orchestrator)

A plan reviewer read the order as its builder would (ready with edits). It re-ran the derivation and the planner's
prototypes and a chain of its own (jitter 500 at 10 and 1,000 frames a second, 24 and 48 kHz, the gate off,
push-to-talk across a channel's wait, blocks of 1, 480 and 4,800, bunches held within 62 samples of a block's
start): 12 of 12 equal to `createRender` and never short, the least margin 89 samples (measured). Each point binds
the builder and holds over the text above.

1. **`add()` with what was given out** cannot fail a check: `steamTimeline.add` pushes to the channel with `place`
   (`engine/steam.js:473`) before any move (`:476-484`), and the given-out count is D behind the packets, so no
   packet is ever moved (measured: 0 moves, samples equal). "No third argument" stays as an instruction; the break
   row goes; the sentence "the channel would be told another place than a render's" is corrected.
2. **The gain-off case** uses a `voiceScale` other than 1 (2, loud enough to clip), so the break "the chain's own
   scale and clip kept" can fail: at 1 the channel's gain object already clamps and rounds
   (`engine/steam.js:220-221`) and the chain's stage changes nothing.
3. **P, the samples pushed,** is exposed by part a (`stats.pushed` or the like), so the check
   "G = floor(P × 147 / 80) − D" can be computed; with a 48 kHz microphone P depends on the capture resampler.
4. **The low-latency box (part b)** is disabled and sent as off only while the queue actually runs (the box
   checked, `steam`, the codec on). A check: on `celt_22` with the box checked, low latency still works.
5. **The endless arrival model's check** asks some ticks twice; an equal tick is accepted and only a lower one is
   refused.
6. **A channel's start.** In `512 × ceil(1323 a / 1024) − D`, `a` is the arrival tick. Only the render's opens
   whose sample is below G are counted. The test sees "before the same mix sample" through a spy (for example the
   count of samples `onGain` has seen when the room path's `spurtStart` is called). An open lies at least 89 samples
   past what was given out and up to the largest arrival delay ahead (1,650 ms seen at jitter 500 and 10 frames a
   second), so the chain keeps a list of pending opens.
7. **The thirty-minute attack** reads "must not grow beyond `steamTimeline`'s frame log (deferred, about 2 MB an
   hour)"; memory is judged by counts the endless forms expose, not the heap.
8. **The recording's `channel` (part b).** The counters (packets, opens, appended, gainResets, droppedSamples) are
   taken as the difference between start and stop; `fps`, `bufferMs`, `waitTicks`, `latency` and `codecDelay` as
   they stand. The order says what happens when the chain is rebuilt during a recording, and whether a take
   carries `arrivals` (the console's BC-4a line reads it).
9. **Part b may touch** `updateStale`'s held line in `app/render.js` (near `:955-957`, `LIVE_HELD_TEXT`),
   `presentRender`'s comment near `:562-566` ("it was made on the file's own timing") and the stale comments at
   `live.js:38-41` and `:76-77`.
10. **Lines:** `engine/render-stream.js:350-352` is `:348-358` (the skipped stage is the `if` at `:352-358`);
    section 10 of `tests/render-channel.verify.mjs` is `:684-699`.
11. **May:** the chain advances the timeline only when the bound tick rises, not after each sample (same output;
    the report measures the margin where the chain gives out).

Size stands: 10 hours for part a, 6 for part b. Part a starts after W3-02f is merged (W3-02ef's ruling 9).

## Ruling 2026-11-14 (the orchestrator): [Browser 3f2] in part a

Part a's builder stopped on one check. [Browser 3f2] (`verifyLiveRoom`, `tests/browser.verify.js` near `:1553`)
starts the live worker with `{ ...renderOptions(), codec, … }`, and since W3-02d-1 `renderOptions()` asks for the
game's timeline on Steam voice. The chain used to ignore `timeline`; after part a it runs the queue there, and the
check's count of spurt starts (one a sender's spurt) no longer holds (2 opens for 4 spurts at 300 frames a second,
the 0.8 s pauses not freeing the channel). The page itself is unchanged: `liveOptions()` still sends `'source'`.
**Ruled:** part a may change that one line of `tests/browser.verify.js`, so the check's options carry
`timeline: 'source', fps: undefined, bufferMs: undefined`, as `liveOptions()` sends them, with a comment saying so.
Part b adds the queue's case to the check when the page can send it. Nothing else of `tests/browser.verify.js` is
part a's.
