# W3-02c-3: the live monitor can run the game's voice queue

**Status 2026-11-13: planned, not built; ruled by the orchestrator to be built after BC-4** (it stays on the list of builds; the reason is the planner's: BC-4 changes when packets arrive, so the monitor's hold-back would be derived twice). The planner's recommendation is that this order
is not part of the finish line and is built only on the owner's word, after [W3-02d](W3-02d-page-timeline.md)
and after BC-4 if BC-4 is built (the case each way is under "When to build it"). Written by a planner from the
repository as it stands at `9d5113a` (cache v41). It takes the place of section 9 of W3-02c's amendment in
[the old order](W3-02-receiver-queue.md), which no longer needs to be read.

**Note of 2026-11-13.** W3-02d was split in two after its plan review. Where this order says W3-02d it means
[W3-02d-1](W3-02d-page-timeline.md), which adds the controls this order reads.

**Kind:** a change to how the live chain computes its sound when a new setting is on, and a change to
`voice-channel.js`, which every render on the game's timeline runs. No render may move.
**Roles:** `tf-builder` (effort high), then `tf-reviewer` and a second reader on the stronger model
(`docs/PIPELINE.md`: an order that changes how renders are computed; this one touches the module they run).
**Branch:** `claude/w3-02c3-live-channel`, from `main` after W3-02d. **Worktree:** in the brief.
**Report:** `docs/reports/W3-02c3-live-channel.md`. **Budget:** 12 hours.
**Cache number:** rises. The builder does not set it.

## Why

The live monitor plays the microphone through a render's own stages. Since W3-02c-2 a render can run the
receiver's voice queue, and after W3-02d the page's render does so by default. The monitor does not: it lays each
packet where the source has it, so in the monitor no phrase starts early and none waits.

Ruled (PROGRESS, `waiting_on_the_owner`, the orchestrator's default): the queue in the monitor is a setting,
off until chosen, because it adds the game's wait to the monitor's delay.

| What | Figure | Standing |
| --- | --- | --- |
| The monitor's chain holds back today | about 207 ms on `steam` | measured by the browser suite (`docs/LIVE.md`) |
| The zero of a render on the game's timeline, D | 13,312 samples at 66.67 frames a second, 15,360 at 100, 24,576 at 300 (302, 348 and 557 ms) | read from `voice-channel.js:262-275` |
| The monitor's hold-back with the queue | D, plus up to a tick and a mixer block, plus the resamplers' waits: about 0.34 s at 66.67 frames a second, 0.38 s at 100, 0.59 s at 300 | inferred from the figures above; not built yet |
| Unbroken talk through the queue | at 300 frames a second the level starts to dip after 11.6 to 12.0 minutes; at 66.67 after 0.4 to 3.2 minutes | measured on the model (the plan's report); no take |

The monitor has no ten-minute limit, so the last row can be reached in a session. Speech pauses, and each pause
that closes the channel fills the queue again.

## When to build it

| Choice | For | Against |
| --- | --- | --- |
| Before W3-02d | none found: W3-02d needs one line in `live.js` to keep the monitor as it is | the monitor's switch reads the frame-rate control that W3-02d adds |
| Folded into W3-02d | one cache rise and one browser pass | it puts a change to `voice-channel.js` and the live chain, which needs a second reader, into a page order that is already 12 hours |
| After W3-02d, on the finish line | the monitor and the render then sound alike when the switch is on | the switch is off by default, so by default nobody hears it; hearing oneself 0.6 s late is hard to use; the finish line is about the modern preset's stages against takes, and no take is a live session |
| After BC-4, off the finish line (recommended) | BC-4 changes how packets reach the channel (each gets an arrival delay). Built before it, this order's hold-back and its equality check are done twice | the monitor differs from the page's default render until then, and the documents must say so (W3-02d does) |

## What changes

### 1. The module: a timeline with no end

`createTimeline` (`voice-channel.js:320-323`) refuses a missing `length`, and it keeps one record for every
packet, every overflow and every 20 ms slot until `finish()` (`:494-506`). A monitor has no length and runs for
hours.

- `length: Infinity` is accepted. Everything a whole `length` gives stays as it is, to the sample and to the
  field of `info`.
- With `length: Infinity` the timeline keeps no record older than the channel still needs: no `source` slots, no
  list of spurts or drops that grows with time. `advance(tick)` and `push` return the same samples as with a
  whole `length`. `finish()` returns what is final and an `info` with the counters only (`packets`, `opens`,
  `appended`, `gainResets`, `droppedSamples`).
- The zero D is not changed. The module takes out D for an endless timeline as it does for a render, and drops
  the output before sample 0 as it does for a render. So the chain is the render, moved, from its first sample.

### 2. The engine: the chain runs the render's channel

`steamLiveChain` (`engine/live-chain.js:72-220`) makes its timeline at `:107` with no channel, gives each message
to it at `:180` with what was already given out, bounds what it may give out by the reach at `:182`
(`steamGiveOut`), and takes it at `:202`. `createLiveChain` (`:226`) ignores `opts.timeline`.

With `opts.timeline: 'game'`:

- **The option is read as a render reads it.** `createLiveChain` calls `steamGameTimeline`
  (`engine/steam.js:97-110`) at its entry, as `process()` does (`engine/render.js:119`). Where a render refuses
  `'game'` the chain's promise rejects with the same error: another codec (the chain of `:366-422` included), the
  codec skipped, `retime`. `opts.lowLatency` with `'game'` is refused too: the reach it shortens is not used.
  The names are the render's own three, `timeline`, `fps` and `bufferMs`, so that a chain and a render made with
  the same options are compared.
- **The channel is the stream render's.** `steamChannel` (`engine/steam.js:136-180`) is made as
  `engine/render-stream.js:252-253` makes it, with `length: Infinity`, and handed to `steamTimeline` as
  `cfg.channel` (`engine/steam.js:314`). The timeline then lays nothing and pushes each message to the channel
  (`:381`, `:400`, `:419`). The rules for a packet that comes behind what was given out (`:403-411`) are not
  reached.
- **What the chain gives out.** After a block's messages are fed (`engine/live-chain.js:165-180`), the chain
  advances the channel to the tick no later message can be under, by the stream render's bound
  (`engine/render-stream.js:265-274`), and takes what became final. It gives out as many samples as it was
  given, from that sound, held back by a fixed number H of samples at the voice's rate. Before the first H
  samples it gives zeros.
- **H** is the least whole number of 512-sample blocks for which the held sound never runs short, derived from
  the bound and the module's clock (a block is final once a tick at or after its start has run), not found by
  trial. H is a whole number of blocks so that the channel's blocks are the room mix's
  (`createLiveRoomMix`, which counts 512-sample blocks from the chain's first mix sample).
- **The delay the chain reports.** `holdBack` and `latencyMs` (`engine/live-chain.js:132-134`, the getter at
  `:142`) count the reach and the codec's look-ahead today. With the queue they count H in their place. The
  chain also reports what the queue costs against the chain without it, as it reports `lowLatencySavingMs`
  (`:214`).
- **A channel's start.** `spurtStarts()` is called today at the first delivered message of each spurt the
  sender opens (`engine/live-chain.js:172`; the reason is at `:273-278` and `engine/room.js:99-106`). With the
  queue it is called where the channel opens, which is where the channel resets the gain
  (`engine/steam.js:141`), and not for a spurt that joins a running channel.
- After the mix point nothing changes (`engine/live-chain.js:116-119`).

Without the option, or with `'source'`, the chain is what it is today, to the sample.

### 3. The worker and the page

- `live-worker.js` already loads `voice-channel.js` (`:26`) and hands the chain the page's options
  (`:122-124`). It posts the queue's cost with `ready` (`:134`), as it posts `lowLatencySavingMs`.
- **The switch.** A checkbox `live-queue` in the Extras box beside `live-lowlat` (`index.html:293-296`), off on
  every load: "Live monitor: the game's voice queue". It is kept as `live-lowlat` is kept: on the page only, not
  in the remembered settings, not in a share link, with no console name. It joins `CONTROLS_EXTRAS`
  (`tests/browser.verify.js:1222-1223`).
- **What the page sends.** `liveOptions()` (`live.js:39`) sends `timeline: 'game'` with the page's `fps_max` and
  `voice_buffer_ms` (W3-02d's controls) when the box is checked, the codec is `steam` and the codec is on. It
  sends `'source'` otherwise, as W3-02d leaves it. The render's own Phrase timing control does not decide the
  monitor. While the box is checked the low-latency box is disabled and sent as off.
- **The words.** The box's help says what the chain reports: that each phrase waits as in the game and that the
  monitor plays so many milliseconds later (the figure from the chain, as `live.js:47-48` and `:62` show the
  low-latency saving). The latency figure of the panel (`live.js:291-292`) already follows the chain's.
- A changed `fps_max` or `voice_buffer_ms` while the box is checked restarts the chain, as any setting the chain
  reads does (`live-worker.js:47`).

### 4. The suites that hold "the live chain is the render"

| Suite | What it holds today | After this order |
| --- | --- | --- |
| `tests/steam.verify.js`, section [10b] (`:1033`) | at the mix point the chain gives the render's samples, at 24 and 48 kHz, with loss, with jitter, with the gate off and with push-to-talk | unchanged, and passes unchanged |
| `tests/output-stage.verify.mjs`, section [14] (`:492`) | after the mix point the chain is the render, at 48 and 44.1 kHz | unchanged, and passes unchanged |
| `tests/render-channel.verify.mjs`, check 10 (`:618-633`) | a chain made with `timeline: 'game'` gives the samples of one made without | replaced: see "Done means", 1 |

### 5. The documents

`docs/LIVE.md` (`:25-26`: the monitor can run the queue; the switch, its cost, and that unbroken talk thins after
minutes at a low frame rate, measured on the model with no take), `docs/PAGE.md` (the switch), `README.md` (the
sentence on what the monitor equals, `:110`, and "not built yet" at `:100`), `docs/ACCURACY.md` (`:46`),
`tests/predictions/PREDICTIONS.md` (the note `tests/accuracy.mjs` asks for when a file under `engine/` changes).

## Files

May touch: `voice-channel.js` (`createTimeline` only); `engine/live-chain.js`; `engine/steam.js`
(`steamChannel`'s `length` and the open's hook only); `live-worker.js`; `live.js`; `index.html` (the one
control); `tests/voice-channel.verify.mjs`, `tests/render-channel.verify.mjs`, `tests/browser.verify.js` (new
checks; no recorded value changed); the documents of part 5; the report. `sw.js`: never the number.

May not touch: `engine/render.js`, `engine/render-stream.js`, `engine/room.js`, `audio.js`, `audio-worker.js`,
`steam-sender.js`, `constants.js`, any codec module, any file under `app/`, `tests/steam.verify.js`,
`tests/output-stage.verify.mjs`, `tests/predictions/predictions.json`, `tests/REFERENCE_2026.md`,
`docs/PROGRESS.json`, `docs/PROGRESS-LOG.md`, `docs/README.md`, `CLAUDE.md`.

## What must not move

- Every recorded value of every suite: `git diff origin/main -- tests/` shows added checks and the replaced
  check 10, and no changed hash, reference or tolerance.
- Every render: `node tests/run.mjs voice-channel render-channel render-stream stages steam verify
  output-stage` passes with those files' recorded values untouched.
- The chain without the option: sections [10b] and [14] pass unchanged in what they assert.
- `ARRIVAL_MS` and D in `tests/voice-channel.verify.mjs`.

## Done means

1. `node tests/run.mjs render-channel` passes with check 10 replaced by these, each of which fails when the
   code it covers is broken:
   - at the mix point (`opts.onGain`), for 66.67, 100 and 300 frames a second, three seeds, a 24 kHz and a
     48 kHz microphone, with no loss and with 15% loss: sample n of the chain is sample n - H of the render made
     with the same options and `timeline: 'game'`, for every n from H on, and the chain's first H samples are
     zero. The check prints H and the count of samples compared, which is not zero;
   - the same with the gate off, with push-to-talk pressed and released, and with a room attached
     (`opts.liveRoom`), after the mix point;
   - H is the figure the derivation gives, and with H less one block the chain runs short for at least one of
     the seeds (the test builds that chain through a hook of its own or shows the shortfall from the bound);
   - `spurtStarts` is called `info.opens` times on the suite's layouts P and Q, where a spurt joins a running
     channel, and not once for each spurt;
   - a chain made with `timeline: 'game'` on `celt_22`, with the codec skipped, with `retime` and with
     `lowLatency` rejects, each with a `RangeError` that names the reason;
   - a chain made with no `timeline` and one made with `'source'` give the same samples as `main`'s chain
     (against a value recorded from `main` before the change, kept in the suite).
2. `node tests/run.mjs voice-channel` passes with new checks: with `length: Infinity` the samples `push` and
   `advance` return are those of a timeline of a whole length over the same packets, for the suite's seeds; an
   hour of packets leaves what the timeline keeps no larger than after a minute (the test reads a count the
   module gives for this, or measures the heap, and says which).
3. `node tests/run.mjs browser` passes with new checks: the box is off on load and after a reload with it
   checked; checked, the chain's options hold `timeline: 'game'` and the page's two numbers, the panel's delay
   rises by the cost the chain reports, and the low-latency box is disabled; on another codec the box does
   nothing and the chain is made with `'source'`; a recorded session with the box checked is not silent.
4. `flock /tmp/tf2ve-heavy.lock pnpm test` and the browser suite pass. `node tests/cache-number.mjs origin/main
   --report` says the number must rise; its line is in the report.
5. `git diff origin/main --stat` shows no file outside "May touch".
6. The report: H at the three frame rates and how it is derived; the monitor's delay with and without the queue
   as the chain reports it; the breaks; what was not checked. A live session in a browser starts in mid-stream
   and is not compared with a render sample for sample; the report says so.

## The breaks the builder makes

| Break | The check that must fail |
| --- | --- |
| the chain ignores `timeline` (today's code) | the chain is the render moved by H |
| H one block smaller | H is the least; the chain runs short |
| H not a whole number of blocks | the room case after the mix point |
| `spurtStarts` left at the sender's spurt | called `info.opens` times on P and Q |
| `lowLatency` accepted with `'game'` | the refusals |
| the endless timeline keeps its per-packet records | an hour keeps no more than a minute |
| the endless timeline drops D | the chain is the render moved by H (H would be wrong by D) |
| a whole `length` goes through the new path | `tests/voice-channel.verify.mjs`'s recorded values |

## Stop and ask

- The sound the chain can give out is not the render's from some sample on, for a reason that is not H (a
  message whose tick the bound does not cover, a block the module finishes later than the derivation says).
- H at 300 frames a second is more than 0.65 s. The owner's ruling rests on a cost of about 0.44 s over today's
  delay.
- The module cannot be given an endless form without a change to `createChannel` or to what a whole `length`
  returns.
- A recorded value of any suite moves.
- BC-4 was merged before this order is built. The arrival tick is then no longer the sender's tick, the bound
  and H change, and the order is planned again.

## What the reviewer attacks

The derivation of H against the module's clock (run the chain at H less one block). A chain fed in blocks of 1,
of 480 and of 4,800 samples. Push-to-talk released inside a phrase and pressed inside the channel's wait. A room
switched while a channel is open. Thirty minutes of unbroken sound at 66.67 frames a second: the chain must do
what the render's rules do, thin and restart, and must not grow or stall. The page with the box checked and the
codec changed to one that was never in TF2 (`steam_48`, `miles`): no error, the file's own timing. Every figure
in the new words against its standing.
