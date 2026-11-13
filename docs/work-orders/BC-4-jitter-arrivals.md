# BC-4: jitter as arrival times through the game's voice queue

**Status 2026-11-13: planned, not built.** Written by a planner from the repository alone, at `main` `28e9c79`
(cache v42). Line numbers are that commit's. It is read by a plan reviewer before any build, and one private
check (section "The private checks", i) comes before the build.

**Kind:** a change to how renders are computed. Renders on Steam voice with jitter above 0 change. No other
render's samples change.
**Parts:** BC-4a (the engine, the render and its stream, the records) and BC-4b (the page). Each is merged on
its own, BC-4a first.
**Roles:** `tf-builder` (effort xhigh for BC-4a, high for BC-4b), then `tf-reviewer`. BC-4a also needs a second
reader on the stronger model (`docs/PIPELINE.md`: it changes how renders are computed and what the evidence is
said to show). BC-4b needs none.
**Branches:** `claude/bc-4a-jitter-arrivals` and `claude/bc-4b-jitter-page`, each from `main` as it stands when
the part starts. **Worktrees:** in the brief.
**Reports:** `docs/reports/BC-4a-jitter-arrivals.md` and `docs/reports/BC-4b-jitter-page.md`.
**Budget:** 10 hours for BC-4a, 4 hours for BC-4b.
**Cache number:** rises once with each part. The builder does not set it.

## Why

The jitter setting marks single 20 ms frames as late: 3.2% of them at 50 ms (a fit, finding 9), nine in ten
filled by the decoder and one in ten played as zeros. The game has no such path (read, finding 9's correction):
`net_fakelag` and `net_fakejitter` hold each packet in a list and let the packets out in the order they came, so
nothing is lost and nothing is reordered. The receiver has no deadline. A message that comes late is added to
the speaker's queue, or opens a new channel if the queue ran dry first (read, finding 22).

Since W3-02c-2 and W3-02d-1 the page's render on Steam voice plays its packets through that queue
(`voice-channel.js`, `opts.timeline` `'game'`). So jitter can be what it is in the game: a later arrival tick
for each message, with the queue's own rules doing the rest. A bunch that does not fit the half-second ring
pushes the oldest sound out (a skip). A gap that outlasts what is queued fades the sound and ends the channel,
and the next message waits again and resets the gain (a restart).

By the finish line (`docs/PROGRESS.json`, `finish_line`) this is the last build on the modern preset's path.

## What is known

| What | Figure | Standing |
| --- | --- | --- |
| The lag list | one first-in-first-out list per socket; only its head is looked at; the head leaves when its age has passed `lag + RandomFloat(-j, +j)`, `j = min(net_fakejitter, lag / 2)`, drawn again at every look | read (`docs/reports/bad-connections-plan.md`, read 6) |
| The lag in force | moves toward `net_fakelag` at 200 ms a second | read (the same) |
| A listen server's own voice | crosses the network layer twice, client to server and server to client | read (reads 3 and 4 of the same report) |
| Packets on each crossing | one every 15 ms tick for a listen server's own player | read for the in-process path (read 8); inferred to hold with `net_usesocketsforloopback 1` |
| How often each socket is looked at | not read | the order fixes it below, as a choice |
| Set C's jitter take | `net_fakelag 100; net_fakejitter 50` at 300 frames a second; 96.0% of the sound present against the baseline's 96.5%, 0.2% silent in both | measured (finding 9) |
| The same take's events | 1.36 a second more than the baseline's, 81% one frame long | measured (finding 9; what they are is not known) |
| `net_graph`'s ping in Set C | 14 to 19 ms without `net_fakelag`, 204 to 210 ms with `net_fakelag 100` | measured (the record's Set C; the two takes with lag both had jitter 50, so the reading is taken as made with jitter on: inferred) |

**What a prototype of the model gave** (measured by the planner on a script outside the repository: the
repository's `steam-sender.js` and `voice-channel.js`, packets of zeros, the delay rule of the next section;
`docs/reports/BC-4-plan.md` has the script's rule and every figure). It is not a render and not a take.

| At jitter 50 | Without jitter | With jitter |
| --- | ---: | ---: |
| Delay above the least possible, 300 frames a second | 0 | mean 70 ms, 45 to 90 ms for the middle four fifths |
| The same at 66.67 frames a second | 0 | mean 96 ms, 60 to 135 ms |
| Messages that arrive on the tick of the one before, 300 frames a second | none | 5% |
| Skips inside a long sound past its first second, 300 frames a second | 0.19 a second, 0.7 ms of sound a second | 0.22 a second, 1.9 ms a second |
| Of them 10 ms or longer | 0.02 a second | 0.07 a second |
| Skips at 150 frames a second and under | none | none |
| Channels opened on a signal laid out like Set C's | 6.8 | 6.8 |

So by the model jitter at 50 ms is a small thing on the modern preset: at 300 frames a second somewhat larger
skips, and at lower frame rates only phrase starts that move. The model does not give finding 9's 1.36 events a
second. The order does not hide that: private check (i) says what those events are, and private check (ii)
measures the difference.

## The model

One function gives each sender tick its arrival tick. It lives in `engine/network.js`.

**One list** (`fakeLagList({ lagMs, jitterMs, periodMs, rand })`, with `release(enterMs)` called with enter
times that never fall):

- `j = min(jitterMs, lagMs / 2)` (read).
- The list is looked at at the times `k × periodMs`, k a whole number.
- Only the head is looked at (read). A head younger than `lagMs - j` cannot leave, and no number is drawn for
  it (the model's choice: the game draws and the draw cannot release it).
- An older head: `u = rand()`, and it leaves when its age is at least `lagMs + (2u - 1) × j` (read, with the
  game's `RandomFloat` taken as uniform: inferred). Otherwise it is looked at again at the next look, with a
  new number (read).
- When the head leaves, the packet behind it is the head and is looked at in the same look (inferred: a socket
  is read until it gives nothing).
- So packets leave in the order they came, and none is lost (read).

**The path of a listen server's own voice** (`steamArrivals({ jitterMs, fps, seed })`, with `at(tick)` called
with ticks that never fall, and `floorTicks`):

1. The lag is taken as twice the jitter: `lagMs = 2 × jitterMs`, so `j` is the jitter itself. A lag that
   stays the same delays every packet alike and a render does not show it. Twice the jitter is the least lag at
   which the game applies the whole jitter (read: `j = min(jitter, lag / 2)`), and it is Set C's setting.
2. Every tick p the client sends one packet. It enters the first list at `15 × p` ms. The first list is the
   server's socket and is looked at once a tick: `periodMs` 15.
3. A packet that leaves the first list at time r rides the server's packet of tick `q = ceil(r / 15)`, which
   enters the second list at `15 × q` ms. The server sends one packet a tick, so the second list also holds one
   packet for every tick.
4. The second list is the listener's socket and is looked at once a frame: `periodMs` is `1000 / fps`, with
   `fps` limited as the voice channel limits it (10 to 1000; 300 when not given).
5. A packet that leaves the second list at time r reaches the voice channel on tick `ceil(r / 15)`.
6. `floorTicks = 2 × ceil(jitterMs / 15)` is the least delay any packet can have, in ticks. `at(p)` is the
   arrival tick less `floorTicks`. So `at(p) >= p`, `at` never falls, and two messages can share a tick.
7. Each list has a random stream of its own, `mulberry32((seed ^ 0x4A495431) >>> 0)` and
   `mulberry32((seed ^ 0x4A495432) >>> 0)` (arbitrary constants), with `seed` the render's. The loss draw
   (`steamMessageLoss`) keeps its own stream, so the same messages are lost at every jitter.
8. With `jitterMs` 0 or less `at(p)` is p and nothing is drawn.

`at` depends on the tick alone, not on which ticks carry voice or on which messages are lost. A lost packet is
kept in the lists as if it had come (the model's simplification: in the game a packet lost on the way in never
enters the list, read 2, so the packets behind it wait a little less).

**What is read, inferred and chosen.**

| Part | Standing |
| --- | --- |
| The list's rule, the half-width, the order kept, nothing lost | read |
| Two crossings | read |
| One packet a tick on each crossing | read for the in-process path; inferred for sockets |
| A uniform draw; the next head looked at in the same look | inferred |
| The server's socket looked at once a tick, the listener's once a frame | chosen. Grounds: a server runs in ticks and a client in frames (inferred), and of the three combinations tried on the prototype this one adds 190 ms to the round trip at jitter 50 and 300 frames a second, where Set C's `net_graph` showed 185 to 196 ms more with lag than without (measured, one reading). Both sockets once a frame adds 164 ms; both once a tick adds 215 ms; one draw a packet in place of a new draw at every look adds about 245 ms |
| The lag taken as twice the jitter | chosen (item 1) |
| The least delay taken out, the rest heard | chosen: a render is lined up with its source, and only the part of the delay that varies can be heard |
| A lost packet kept in the lists | chosen (a simplification) |

The two periods and the two crossings are named constants in `engine/network.js`, each with its standing in a
comment, so a later read or log changes one number.

**What the render then plays later.** The delay above the floor is not taken out. A render with jitter 50 plays
about 70 ms later than its source at 300 frames a second and about 96 ms later at 66.67 (measured on the
prototype), and that much of a sound that runs to the source's last sample is cut at the render's end, as the
voice channel already cuts what falls past the length.

## The controls

**Recommended: the jitter control alone, with the lag implied.** A lag control would change nothing a render
can show, apart from capping the jitter at half of it. The page keeps one number.

| | What it is | What it claims |
| --- | --- | --- |
| Jitter ms (built by this order) | `jitterMs`, 0 to 100 on the page (0 to 500 in the engine, as today) | On Steam voice with the game's voice queue: arrival times spread as `net_fakelag 2N; net_fakejitter N` spreads them for your own voice on a listen server, at the listener's frame rate. Nothing is lost and the order is kept |
| A lag control | not built by this order | It would claim nothing audible. Not recommended |
| A lag spike | not built yet, and no order | A lag that jumps by S ms holds every packet back while the lag in force rises at 200 ms a second (read) and lets them out faster while it falls: a pause that can restart the queue, then a bunch that can skip. It needs the lag in force as a function of time in `steamArrivals`. Listed as an idea in the BC-4a report |

- **The engine's option** stays `jitterMs`. No new option reaches the page.
- **The share link's key** stays `jit`, and the preset field stays `jitter` (`app/core.js:194`,
  `app/console.js:837`). An old link with `jit=50` and Steam voice now renders jitter 50 through the queue. An
  old link with `jit=50` and another codec renders as it did.
- **The Laggy preset** (`constants.js:233`) keeps loss 18 and jitter 50. Its words stay true.
- **`net_fakejitter`** keeps its name, its link to the control and its alias `net_jitter`. Its help becomes:
  `How far voice packets' arrival times spread, in ms, with their order kept and none lost. Steam's codec on the game's voice queue: as the game's net_fakejitter with net_fakelag at twice it, for your own voice on a listen server. Bunched packets can skip sound and a gap can restart a phrase. The other codecs: still a fit, single frames marked late (3.2% at 50 ms)`.
- **`net_fakelag`** (BC-4b) is a console command with no control and no key. With or without a value it prints
  one line and changes nothing: `A steady lag delays every packet alike and a render does not show it. The app takes net_fakelag as twice net_fakejitter, the least at which the game applies the whole jitter`.
- **The control's help** (`index.html:154`) becomes: `How far packets' arrival times spread. On Steam voice the packets reach the game's voice queue later and in bunches; none is lost.`

## Where it runs

Four decisions, each the orchestrator's to reverse before the build.

**(a) Steam voice on the file's own timing (`voice_timeline source`): jitter does nothing.** That timeline has
no queue, and without a queue a later arrival has nothing to act on. Forcing the queue would overrule a setting
the user chose. Keeping the late-frame fit there would keep, on the modern codec, a thing the game does not do.
So a `steam` render on `'source'` with any `jitterMs` is the render at `jitterMs` 0, and BC-4b puts a line under
the control that says so. The code that plays a late frame on the `steam` path stays, reachable only by the
tests' own mask; taking it out is a later tidy-up.

**(b) The other codecs keep the fit, marked as a fit.** `celt_22`, `celt_44`, `speex`, `steam_48` (not in TF2)
and `miles` (not in TF2) have no sender model and do not run the queue. Their late frames stay as they are,
sample for sample. Routing them through a queue is W3-02e and W3-02f's ground, not this order's. The page and
the documents call their jitter a fit.

**(c) The live monitor: jitter does nothing on Steam voice until W3-02c-3.** The live chain keeps the file's
own timing (`live.js`), so it follows (a). It still equals a render made with the same options. W3-02c-3 (not
built yet) puts the queue in the monitor and takes `steamArrivals` with it. On the other codecs the monitor
keeps the fit.

**(d) Loss and jitter together.** Loss is drawn first, per message, as BC-1 built it. A lost message never
reaches the channel. The next message brings its concealed frames and arrives on its own delayed tick. The
delay of a tick does not depend on what was lost.

**Where the delay enters the code.** `steamChannel` (`engine/steam.js:136`) is given an `arrive` function and
uses it in the two places a tick reaches `voice-channel.js`: `push(tick, …)` pushes at `arrive(tick)`, and
`advance(tick)` advances to `arrive(tick)`. `process()` (`engine/render.js:595`) and `createRender`
(`engine/render-stream.js:252`) make it from `steamArrivals` with the render's seed and `opts.fps`. The
stream's bound (`engine/render-stream.js:274`) stays a bound: no later message has a sender tick below it, `at`
never falls, so no later message arrives before `at(bound)`. `voice-channel.js` and `steam-sender.js` do not
change.

**The stage keys.** On `steam` the codec stage no longer reads `jitterMs`, so `readOptions`'s `used.jitterMs`
(`engine/render.js:123`) is 0 on the `steam` path and the value elsewhere. A changed jitter on Steam voice then
starts from the kept codec result. The name stays on `AFTER_A_OPTIONS` and off `AFTER_B_OPTIONS`, because the
other codecs read it in the codec stage.

**A hook for tests and replays.** `opts.arriveAt`, `steam` on `'game'` only: `(tick) => tick`, in place of the
model, called with ticks that never fall, for messages and for the stream's bounds. It must return a whole
number that never falls; anything else is a RangeError. The page never sends it. Like `loseMessage` it makes a
render keep nothing in `stages` and makes `previewAllowed` false. It is how a log's own arrival ticks are
replayed (private check iii).

**What `codecInfo` gains.** On `'game'` with `jitterMs` above 0 or with `arriveAt`:
`codecInfo.arrivals = { jitterMs, fps, floorTicks, messages, meanMs, maxMs, sameTick }`, over the messages that
reached the channel (`meanMs` and `maxMs` are the delay above the floor; `sameTick` counts messages that
arrived on the tick of the one before). It is absent otherwise, so no recorded `codecInfo` at jitter 0 moves.
`process()` and `createRender` give the same object.

## Part BC-4a: the engine, the render, its stream, the records

### Build

1. `engine/network.js`: `fakeLagList`, `steamArrivals`, the constants, and the header comment (it says "Jitter,
   on every profile, makes frames arrive too late"). Both functions are exported as `TF2Audio`'s
   (`audio.js:63` and `:118`), for the tests.
2. `engine/steam.js`: `steamChannel` takes `arrive`.
3. `engine/render.js`: the `steam` path passes jitter 0 to `buildLossMask` (`:528`); `process()` makes the
   arrivals for `'game'`; `opts.arriveAt`; `used.jitterMs`; `codecInfo.arrivals`; `previewAllowed`; the option
   comments (`:351` says "late frames, measured"; `:388-389` says the page does not offer the game's timeline,
   which W3-02d-1 made false: both are corrected).
4. `engine/render-stream.js`: the same in the stream (`:242` and `:252`).
5. `engine/live-chain.js`: the `steam` chain passes jitter 0 to `streamLossMask` (`:99`). Nothing else.
6. `constants.js`: the comment at `:433-442` only. `VOICE_ENGINE.network`'s three numbers stay: the other
   codecs use them.
7. Three strings, so that the page is true on the day BC-4a is merged: the control's help
   (`index.html:154`), `net_fakejitter`'s help (`app/console.js:374`), and the render's console line
   (`app/render.js:496`), which on Steam voice stops speaking of late frames and, when `codecInfo.arrivals` is
   there, adds one line:
   `S_Voice: jitter: packets up to <maxMs> ms late, <sameTick> on a tick with another; the queue skipped <ms> ms in <n> places and opened <opens> channels`
   (from `codecInfo.channel.drops`, `droppedSamples` and `opens`).

### The tests

In `tests/render-channel.verify.mjs` (new sections, numbered after those it has) and one new file,
`tests/voicequeue/reference-arrivals.mjs`.

**The second model.** `reference-arrivals.mjs` is written from the words of "The model" as explicit lists: an
array of packets for each list, every look visited in time order, the head tested, a released packet handed
on. It shares no code with `engine/network.js`. Both compute a look's time as `k * 1000 / fps` (and `k * 15`
for the first list), so the two can agree exactly.

1. **The list against a closed form.** A packet with nothing in front of it leaves at its i-th look past
   `lagMs - j` with probability `p_i × (1 - p_1) × … × (1 - p_(i-1))`, where `p_i` is its age at that look less
   `lagMs - j`, over `2 × j`, limited to 0 and 1. For `lagMs` 100, `jitterMs` 50 and `periodMs` 15, with a
   packet entering every 10 s, over 20,000 packets, the share that leaves at each look is within 4 standard
   errors of that. The same for `lagMs` 60 and `jitterMs` 50, where `j` is 30.
2. **The order is kept and nothing is lost.** For jitter 25, 50, 100 and 500 at 300 and 66.67 frames a second,
   five seeds each, over 20,000 ticks: `at` never falls and `at(p) >= p`. At jitter 25 and 50 the least of
   `at(p) - p` is 0: the floor is reached.
3. **The engine's arrivals are the second model's**, tick for tick, over 4,000 ticks, for the same settings.
4. **The render is the module's.** Section 1's reference (`referenceRender`) takes its ticks from the second
   model and feeds `voice-channel.js` as it does today. For jitter 50 at 300 frames a second, jitter 100 with
   loss 15%, and jitter 200 at 66.67 frames a second (the two cases the suite already has, and one more), the
   `'game'` render's voice and `codecInfo.channel` equal the reference's, and `codecInfo.arrivals` equals what
   the reference counts.
5. **A closed-form bunch**, with `arriveAt`: 3 s of unbroken sound at 66.67 frames a second, every message
   from 1 s on held to one tick 40 ticks later. The queue held under 0.3 s when the hold began (the wait is 7
   ticks, finding 23), so the channel is freed during the hold: `opens` is 2. The bunch brings more than the
   ring's 0.5 s: `droppedSamples` is above 0 and a drop is logged at the bunch's tick. With the same messages
   held 4 ticks, `opens` is 1 and nothing is dropped.
6. **The stream.** `createRender` in pieces of odd sizes gives `process()`'s samples and `codecInfo`, key for
   key, at jitter 50 and at jitter 500 with loss 15%.
7. **The file's own timing.** A `steam` render on `'source'` with `jitterMs` 50 equals the render with
   `jitterMs` 0: samples and `codecInfo`, key for key. The live chain likewise.
8. **The stage keys.** With `stages`: after a `steam` render, a render with only `jitterMs` changed takes B and
   keeps none; on `celt_22` the same change makes B again.
9. **The hook's refusals**: `arriveAt` on `'source'`, a result that is not a whole number, a result below the
   last.
10. **Determinism.** The same seed twice gives the same render; another seed gives other arrival ticks and the
    same lost messages.

`tests/steam.verify.js` holds checks that reach a late frame on the `steam` path through `jitterMs` (`:651`,
`:913`, `:941`, `:1022`, `:1335` and those near them). Each is kept with its late frame given by the suite's
own mask (`withMask`, `:279`), or, where the check's subject was the option, replaced by the statement that the
option draws no late frame on `steam` (`underrunFrames` 0, `stats.late` 0). The builder lists each in the
report with what became of it.

### What must not move

- Every render with `jitterMs` 0: every recorded hash of `tests/render-stream.verify.mjs`,
  `tests/render-channel.verify.mjs`, `tests/stages.verify.mjs`, `tests/verify.js`, `tests/steam.verify.js` and
  `tests/miles.verify.mjs` whose case has no jitter.
- Every render on a codec other than `steam`, with jitter or without: `celt_22`, `celt_44`, `speex`, `steam_48`
  (not in TF2), `miles` (not in TF2). Among them the cases 'celt_22, gate on, loss 15%, jitter 300 ms', 'speex,
  gate on, loss 15%, jitter 300 ms', 'steam_48, loss 10%, jitter 100 ms, snd_bits 10' and 'miles, gate on, loss
  15%, jitter 300 ms'.
- The case 'odd options' (its unknown codec renders as `steam`, with no jitter).
- The decoder, every codec module and its hash, `voice-channel.js`, `steam-sender.js`,
  `tests/predictions/predictions.json`.
- `tests/accuracy.mjs`: its four renders stay pinned to `timeline: 'source'` (`:100`, `:135`, `:167`, `:411`),
  and the file is not edited.
- Which messages are lost at a given seed and loss.

**What moves, and only this:** recorded values of cases on `steam` with `jitterMs` above 0. In
`tests/render-stream.verify.mjs` they are 'steam, timeline game, loss 15%, jitter 50 ms', 'steam, loss 15%,
jitter 50 ms, net_split 40 ms', 'steam, jitter 500 ms (late frames play as silence)' and 'steam, listenerPos
tunnel (preset 6), loss 15%, jitter 50 ms'. The third is renamed 'steam, jitter 500 ms on the file's own timing
(does nothing)'. `tests/stages.verify.mjs`'s jitter rows on a `steam` base change with the stage keys. They are
re-recorded in a commit of their own, old and new listed in the report. A moved value outside this list is a
stop.

### The records

- `tests/REFERENCE_2026.md`: under finding 9, a dated paragraph "What the app does since BC-4" (the rule, where
  it runs, what stays a fit, the prototype's figures with their standing, and that the model does not give the
  take's 1.36 events a second). Finding 8's "Open" entry on the combined take keeps its text and gains one dated
  sentence: BC-4 built the delays, and whether they give that take's silence is the private run's. The Model
  table's Network row, the "Not built" line that lists BC-4, and "What remains unverified", Network settings.
  Nothing is deleted.
- `docs/ACCURACY.md` (`:30`, `:83-86`, `:146`, `:189`, `:197`), `docs/FINDINGS.md` (`:118-122`), `README.md`
  (`:93`, `:103-104`, `:114`, `:160`), `docs/LIVE.md` (`:14`), `tests/README.md` (the suites' rows): each
  sentence that says jitter is a fit on every codec, or that BC-4 is not built yet, is made true. The live
  monitor "with loss and jitter included" becomes: with loss; jitter does nothing there on Steam voice.
- `tests/accuracy.takes.json`: the rows `net_jitter` and `net_combined` keep `"jitterMs": 50` and gain a
  `note`: on the file's own timing, where the accuracy suite renders, jitter does nothing on Steam voice since
  BC-4, so the row compares the take with a render without jitter; the render through the queue is measured in
  the private run.
- `docs/ACCURACY.md`'s table: the two rows are not edited. A dated note under the table says their renders
  held late frames when they were measured and no longer do. The orchestrator replaces the rows after its run.
- `tests/predictions/PREDICTIONS.md`: the note for changed model files. No registered prediction has jitter
  (`tests/predictions/plan.json`).

### Files

May touch: `engine/network.js`, `engine/steam.js`, `engine/render.js`, `engine/render-stream.js`,
`engine/live-chain.js`, `audio.js` (the two exports), `constants.js` (the comment), `index.html` (the one help
string), `app/console.js` (the one help string), `app/render.js` (the console lines at `:493-499`),
`tests/render-channel.verify.mjs`, `tests/voicequeue/reference-arrivals.mjs`, `tests/render-stream.verify.mjs`,
`tests/stages.verify.mjs`, `tests/steam.verify.js`, `tests/harness.verify.mjs` (the list of exported names),
`tests/browser.verify.js` (only the checks that hold the two help strings, `:1705` and near it),
`tests/accuracy.takes.json`, `tests/README.md`, `tests/REFERENCE_2026.md`, `tests/predictions/PREDICTIONS.md`,
`docs/ACCURACY.md`, `docs/FINDINGS.md`, `docs/LIVE.md`, `README.md`, the report. `sw.js`: never the number.

May not touch: `voice-channel.js`, `steam-sender.js`, `opus-codec.mjs` and every codec module, `demo.js`,
`live.js`, `live-worker.js`, `audio-worker.js`, `batch.js`, `app/core.js`, `app/netgraph.js`,
`tests/accuracy.mjs`, `tests/predictions/predictions.json`, `tests/voicequeue/replay.mjs`, `docs/PAGE.md`
(BC-4b's), `docs/PROGRESS.json`, `docs/README.md`, `CLAUDE.md`.

### Done means

1. `node tests/run.mjs render-channel` passes with the checks above.
2. `flock /tmp/tf2ve-heavy.lock node tests/run.mjs render-stream`, then `stages`, then `steam`, each pass. The
   report lists every recorded value that moved, old and new, and each is a `steam` case with jitter.
3. `flock /tmp/tf2ve-heavy.lock pnpm test` passes, and
   `CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) flock /tmp/tf2ve-heavy.lock pnpm test:browser`
   passes.
4. `git diff origin/main --stat -- voice-channel.js steam-sender.js opus-codec.mjs tests/accuracy.mjs tests/predictions/predictions.json`
   prints nothing.
5. `git diff origin/main --stat` shows no file outside "May touch".
6. `node tests/cache-number.mjs origin/main --report` says the number must rise. Its line is in the report.
7. `grep -n "does not offer it" engine/render.js` prints nothing.
8. The report holds: the moved values; what became of each `steam.verify.js` check; on the suite's own
   speech-like signal, 60 s, five seeds, at jitter 25, 50 and 100 and at 300 and 66.67 frames a second,
   `codecInfo.arrivals` and the channel's `opens`, `drops` and `droppedSamples` beside the same at jitter 0;
   the breaks; what was not checked.

### The breaks the builder makes

| Break | The check that must fail |
| --- | --- |
| one draw a packet, not a new one at every look | 1 |
| `j` is `jitterMs`, not capped at half the lag | 1, the second case |
| a head can leave from age `lagMs`, not `lagMs - j` | 1 |
| the draw is from 0 to `j` | 1 |
| a packet behind the head can leave first | 2 and 3 |
| the second list is looked at once a tick | 3 at 300 frames a second |
| one crossing, not two | 3 |
| the floor is not taken out, or too much is | 2 |
| `steamChannel` pushes at the sender's tick | 4 and 5 |
| the stream's `advance` is not mapped | 6 |
| the stream makes its arrivals from another seed | 6 |
| the `steam` path still draws late frames from `jitterMs` | 7 |
| `used.jitterMs` keeps the value on `steam` | 8 |
| the arrivals are drawn from the loss stream | 10 |

### Stop and ask

- A recorded value moves that is not a `steam` case with jitter above 0.
- `process()` and `createRender` cannot be made to agree with jitter on.
- The second model and the engine cannot be made to agree tick for tick without sharing code.
- A `steam` render on `'source'` with jitter differs from the one without in a key of `codecInfo`.
- The work passes 10 hours.

### What the reviewer attacks

The first and the last tick of a render. A jitter of 0.5 and of 500. Frame rates of 10, 66.67, 300 and 1000. A
source of silence, and one message alone. A message lost just before a bunch. Two messages on one tick, and an
end marker on the tick of the sound before it. The stream given one sample at a time. `arriveAt` that returns
the same tick for every message. The words of finding 9 against the code.

## Part BC-4b: the page

Built after BC-4a is merged.

### Build

1. **A line under the Jitter control**, shown only while the control is above 0 and the jitter cannot run as
   the game's (`index.html`, a `<p id="jitter-note" class="control-help" hidden>` as `timeline-note` is at
   `:302`; `app/console.js`, beside `updateTimelineNote`, `:586`; `app/core.js`, the element):
   - Steam voice with the file's own timing, for any of the reasons `sourceTimingReason()` gives (the setting,
     a demo's voice, a video): `Jitter does nothing on the file's own timing: it moves when packets reach the game's voice queue.`
   - another codec: `On this codec jitter is a fit: single frames marked late, 3.2% of them at 50 ms. The game makes no frame late.`
   - neither: hidden.
   The control names the line in `aria-describedby` only while it is shown, as `timeline-note` is named.
2. **The live monitor's status** says, while the monitor runs on Steam voice with jitter above 0:
   `Jitter does nothing in the live monitor yet.` The builder puts it where the monitor's other notes are and
   names the place in the report.
3. **`net_fakelag`**, as under "The controls".
4. **The signal chain's Network row** (`app/console.js:659`) keeps `· N ms jitter` where it runs and says
   `· N ms jitter (a fit)` on another codec and `· jitter off (no queue)` on Steam voice with the file's own
   timing.
5. **`docs/PAGE.md`** (`:85`, `:101`, `:217`, `:315` and the settings' table): the control, the line under it,
   `net_fakelag`, and what a changed jitter runs again. **`README.md`**: the settings' sentence on jitter.

### Files

May touch: `index.html`, `app/console.js`, `app/core.js`, `live.js` (the monitor's status text only),
`tests/browser.verify.js`, `docs/PAGE.md`, `README.md`, the report. `sw.js`: never the number.

May not touch: anything under `engine/`, `audio.js`, `constants.js`, `voice-channel.js`, `steam-sender.js`,
`audio-worker.js`, `live-worker.js`, `app/render.js`, every Node suite, `tests/predictions/predictions.json`,
`docs/PROGRESS.json`, `docs/README.md`, `CLAUDE.md`.

### What must not move

Every render's samples: `git diff origin/main --stat -- engine audio.js constants.js voice-channel.js` prints
nothing. No recorded value of any Node suite: `git diff origin/main --stat -- tests/` shows
`tests/browser.verify.js` only.

### Done means

1. The browser suite passes with new checks, each failing when its code is broken:
   - Steam voice, the game's queue, jitter 50: the line is hidden, and the render's `codecInfo.arrivals` is
     there;
   - `voice_timeline source`, jitter 50: the line shows the first text, the control's `aria-describedby` names
     it, and the render equals the render at jitter 0;
   - `sv_voicecodec celt_22`, jitter 50: the second text;
   - jitter back to 0: hidden in each case;
   - a link with `jit=50` and nothing else sets the control to 50 on Steam voice with the game's queue;
   - `net_fakelag 100` prints its line and no control changes; `net_jitter 30` sets the control to 30;
   - the Laggy preset sets jitter 50 and the next preset sets it to 0, as today.
2. `flock /tmp/tf2ve-heavy.lock pnpm test` passes, and the two `git diff` commands print what "What must not
   move" says.
3. `node tests/cache-number.mjs origin/main --report` says the number must rise.
4. `git diff origin/main --stat` shows no file outside "May touch".

### The breaks the builder makes

| Break | The check that must fail |
| --- | --- |
| the line is shown whenever jitter is above 0 | the first check |
| the line is not cleared at jitter 0 | jitter back to 0 |
| a demo's voice is not counted as the file's own timing | the builder adds a check with a demo and names it |
| `net_fakelag` is linked to the jitter control | `net_fakelag 100` changes no control |

### Stop and ask

- The line cannot be shown without a change to `app/render.js`.
- A check of the suite that was there before stops passing.

## Where this meets W3-02d-2

W3-02d-2 (`docs/work-orders/W3-02d2-auto-rerender.md`) is being built and reaches `main` first. Both parts
start from `main` after it.

| Place | W3-02d-2 | BC-4 |
| --- | --- | --- |
| `app/render.js` | `reconcileRender`, `presentRender`, `runRender` | BC-4a: the console lines at `:493-499` only (inside `presentRender`'s reach: merge `main` in first and place the line where W3-02d-2 left that code) |
| `audio-worker.js` | one field of the reply | not touched |
| `tests/browser.verify.js` | checks on long sources | BC-4a: two strings; BC-4b: the checks above |
| The list `TF2Audio.STAGE_OPTIONS.afterB` | its rule B reads it, and its text says "BC-4 moves `jitterMs`" | `jitterMs` stays off the list, because the other codecs read it in the codec stage. So a changed jitter on a long source is marked and waits for the button, on every codec. The engine still starts from the kept codec result on Steam voice. W3-02d-2's sentence is corrected by BC-4a's report, not in that order |
| `docs/PAGE.md`, `README.md` | "What a render runs again" | BC-4b: jitter's sentences |

## The private checks

The orchestrator runs these on the owner's record. Nothing of a take comes back but numbers.

### (i) Before the build: what the jitter take's events are

On Set C's jitter take and its baseline take, each against the network test signal.

1. Render the signal with `main`'s engine at the manifest's `net_baseline` settings, `timeline` `'source'`,
   no loss and no jitter. This is the guide, as in finding 9.
2. Find each take's events as finding 9 did: 10 ms windows every 2.5 ms, correlation at 300 to 4000 Hz, the
   delay followed at 20 ms resolution, a window under 0.4 damaged, a damaged stretch of 15 ms or more one
   event. Keep the events of the 12 s of noise and the 10 s chirp that start at least 1 s after the segment
   begins and end at least 0.3 s before it ends.
3. For each event measure the delay before it and after it at one-sample resolution: the lag of the largest
   cross-correlation of 150 ms of the take against the guide, searched 80 ms each way around the followed
   delay. "Before" ends 10 ms before the event; "after" starts 10 ms after it. The step is after less before.
   A negative step means the take plays earlier after the event: sound was skipped.
4. For each event with a step inside 1.5 ms of 0, measure the level of the event's stretch against the guide's
   at the same place.

**Send back, for each take:** the number of events and events a second; how many have a step of -1.5 ms or
lower, how many within 1.5 ms of 0, how many +1.5 ms or higher; the median, the tenth and the ninetieth
percentile of the downward steps; the downward steps' sum in ms for each second of sound, and how many a second
are 10 ms or more; of the events with no step, how many are within 6 dB of the guide's level and how many more
than 20 dB under it.

| Result | What follows |
| --- | --- |
| At least two thirds of the jitter take's events have a downward step, and the baseline's events are of the same kind | Confirms: the events are skips. BC-4a is built as written, and finding 9 says what the events are, with the counts |
| At least half of the jitter take's events have no step and carry sound within 6 dB of the guide's level | Stops the build. Sound was replaced in place, which only a lost packet does, and the read says jitter loses none. The read and the take's setting are looked at again, by a read or a skeptic, before any code |
| Neither | BC-4a is built, since it rests on the read. Finding 9 then says that what its events are is not known, with the counts |

The same numbers size the model. The prototype gives, for jitter over the baseline, 0.9 to 1.9 ms more sound
skipped each second and 0.05 to 0.09 more skips a second of 10 ms or more (measured on the prototype, the three
look rates tried). If the take's figures are several times those, the game's packets bunch more than the
model's, the report says so beside the figures, and block 2's log becomes the next evidence. That does not stop
the build.

**One question of the record, not of a take:** does the record say whether `net_graph`'s 204 to 210 ms was
read with `net_fakejitter 50` on? The choice of look rates leans on it.

### (ii) After BC-4a is built, on its branch before the merge

Render the network test signal at the manifest's Set C settings (`volume` 0.15, the room `set_c_room`) with
`timeline` `'game'`, `fps` 300, `bufferMs` 100, seeds 1 to 10: once with nothing else (the baseline render),
once with `jitterMs` 50, once with `lossPct` 37.0, once with both. Measure each as the takes were measured
(finding 8's and finding 9's methods, and check i's steps). Every tolerance below is fixed here, before the
run.

| Measure | The take | What the build should give | Standing of the expectation |
| --- | --- | --- | --- |
| Jitter: sound present and silent in the 12 s of noise | 99.7% and 0.3% | at least 98.5% present and at most 1% silent, in every seed | read (nothing is lost); the bounds are guessed |
| Jitter: events a second, less the baseline render's by the same detector | 1.36 | 0 to 0.4 in the mean of the seeds | measured on the prototype. If it is 0.9 to 1.9 the model gives the take's rate. If it is 0 to 0.4 the record says the model gives a part of the take's events and the rest is not explained |
| Jitter: downward steps' sum, less the baseline render's | check i's figure | 0.5 to 2.5 ms a second | measured on the prototype. Within a factor of two of the take's: the record says the skips are of the take's size. Outside: the difference is recorded as measured and not explained |
| Jitter: events one frame long | 81% | 60% or more | guessed |
| Jitter: the clock, measured on the render as the accuracy suite measures a take, less the baseline render's | +310 parts in a million (726 less 416) | +100 to +1500 | guessed from the prototype's 1.2 ms more skipped a second; how the suite's clock counts a skip was not worked through |
| Combined: silent in the 12 s of noise | 10.3% | 5% to 14% in the mean of the seeds | measured on the prototype (8.5% over a whole layout, with zeros for sound) |
| Combined: the silent share with jitter less the share without, same seeds | not known | -1 to +3 points | measured on the prototype (+0.4) |
| Combined: channels opened, with jitter less without | not known | -1 to +2 in the mean | measured on the prototype (+0.4) |
| Combined: the accuracy suite's level column | +0.3 dB before | within 0.5 dB of 0 | guessed |

A figure outside its tolerance does not undo the build: the rule is the game's as read. It is written into
finding 9 or finding 8 as a measured difference, and where the jitter take's present or silent share fails,
the merge waits for the orchestrator's look, because a model that loses sound contradicts the read.

The finding 8 entry on the combined take's extra silence is closed only if the "combined" render's silent share
is inside 5% to 14% and the render without the queue stays near 4.0%. The prototype says the queue's restarts
give that silence with or without jitter, so the entry would then say: the queue's (BC-3), not the jitter's.

### (iii) Block 2 of the owner's run sheet (not recorded yet)

Nothing in BC-4 waits on it. Its log (`voice_showincoming`, `voice_showchannels`, `net_showdrop`, with lag and
jitter on) would check four things.

1. **Nothing lost, nothing reordered.** No `Dropped`, `duplicate packet` or `out of order packet` line beyond
   a run without lag.
2. **How late and how bunched.** The ticks between one voice message and the next. The prototype gives, at
   jitter 50 and 300 frames a second, 5% on the same tick, 9% one tick apart, 15% two, and 1% nine or more;
   without jitter every gap is 3 to 5 ticks (finding 25). A log far from those changes the look rates or the
   draw, in a small order of its own.
3. **The look rate.** The same block at `fps_max 67` (one more line for the owner, typed after the map has
   loaded: `fps_max 67`). The prototype gives a wider spread there (the middle four fifths of the delay 60 to
   135 ms, against 45 to 90 ms at 300). If the two frame rates give the same spread, the listener's socket is
   not looked at once a frame.
4. **The queue under bunches.** The log's own packets and ticks replayed through `voice-channel.js`, queue size
   for queue size, as Set G was (`tests/reproduce.mjs`, the check `queue`), and the render run with the log's
   arrival ticks through `opts.arriveAt`.

## Rulings wanted before the build

Each has the planner's recommendation in the section named.

1. One jitter control with the lag implied, and no lag control ("The controls").
2. Steam voice on the file's own timing: jitter does nothing ("Where it runs", a).
3. The other codecs keep the fit, marked ("Where it runs", b).
4. The live monitor: jitter does nothing on Steam voice until W3-02c-3 ("Where it runs", c).
5. The look rates: the server's socket once a tick, the listener's once a frame ("The model").
6. The least delay is taken out and the rest is heard, so a render with jitter plays later than its source
   ("The model").
7. `jitterMs` stays off `STAGE_OPTIONS.afterB` ("Where this meets W3-02d-2").
8. The two accuracy rows keep their settings and gain a note ("The records").
9. Two parts, BC-4a and BC-4b.

## The orchestrator's private look and rulings (2026-11-13)

**Check (i), run on Set C's jitter and baseline takes** (measured, private; the takes stay private). The guide is
`main`'s render of the network test signal at volume 0.15 on the file's own timing, no room, no loss, no jitter.
Events by finding 8's method as the BC-1 premise made it again; each event's delay before and after at
one-sample resolution as item 3 of check (i) says, with shorter windows near a burst's edges.

- **The 12 s of pink noise.** The baseline has 8 events and the jitter take 10. Seven of each sit at the same
  places (within 30 ms) with the same lengths, have no step (all within 0.15 ms of 0) and carry sound at the
  guide's level (-2.1 to +0.9 dB). They are the method's own false events, not jitter. The jitter take's three
  others are downward steps: -46.0 ms in the segment's first window, -32.2 and -38.7 ms inside it. No event of
  either take has an upward step.
- **The chirp.** No event in either take.
- **The eight 1.2 s bursts.** The baseline has 4 events, all downward steps (-11.0 to -36.8 ms). The jitter take
  has 8 downward steps, 15.5 to 70.4 ms (three of them in one burst within 0.16 s, about 70 ms in all), in five of
  the eight bursts, each 0.03 to 0.46 s after the burst's start, and one event at a burst's first window that is
  not read.
- **In the window the order chose** (from 1 s after the segment's start): 2 skips, 70.8 ms of sound in 10.7 s of
  noise, 6.6 ms a second, 0.19 a second of 10 ms or more; the baseline none. The prototype gives 1.2 ms a second
  more skipped and 0.05 to 0.09 a second more skips of 10 ms or more: the take's are three to five times the
  model's (measured against measured on the prototype).

**Ruling on check (i): it confirms.** Every event the jitter take has beyond the method's false events is a
skip. BC-4a is built as written. Finding 9 says what its events are, with these counts, and that the take's
skips are several times the model's in size and number (the difference measured, not explained; block 2's log
is the next evidence).

**Two corrections to the order's checks, binding on the builder and on check (ii):**

1. An event with no step counts against the model only if the baseline (or the baseline render, for renders) has
   no event at the same place within 30 ms. The method's false events recur at fixed places.
2. Check (ii) measures the bursts too, from 60 ms after each burst's start: that is where most of the skips are,
   in the take with jitter and in the one without. Its tolerances on the skips are judged in the noise and in the
   bursts separately, and the bursts' figures are reported beside the noise's.

**The record's question.** The jitter take's own `net_graph` photograph shows a ping of 210 ms with lag 100 and
jitter 50 on, about 336 frames a second, and the baseline's 14 ms at 295 (read off the owner's photographs). So
the 204 to 210 ms was read with jitter on. The same photographs show 59.0 packets a second in and 58.9 out with
lag on, against 67.8 and 66.9 without (read off them, not explained). The model's "one packet a tick on each
crossing" stands as inferred; the plan reviewer says whether the lower rate weakens it, and block 2's log would
show it.

**The rulings wanted before the build.** All nine as the planner recommends. On item 7: W3-02d-2's order says
"BC-4 moves `jitterMs`"; that sentence is corrected when W3-02d-2 is merged, not left for BC-4a's report.

## After the plan review (2026-11-13)

The plan reviewer read the order as its builder would and ran the model twice on prototypes of its own (look by
look, and by jumping to the first look that can draw; the two agreed on 4,000 ticks in each of 480 settings).
Its figures below are measured on those prototypes. Each point binds the builder and holds over the text above.

1. **`tests/verify.js` may be touched, for one check.** `tests/verify.js:550-552` renders `codec: 'steam'` on
   `'source'` with `jitterMs: 100` and expects a difference from jitter 0; after BC-4a there is none (tried on a
   stand-in of the two engine changes). The check moves to `celt_22`, and a second states that on Steam voice
   with the file's own timing a render at any jitter equals the render at jitter 0, sample for sample.
2. **`tests/stages.verify.mjs`, section 2.** Its `startsFrom` predicts from the lists where a render starts. With
   `used.jitterMs` 0 on Steam voice, a changed `jitterMs` alone on a coded Steam render starts from stage B while
   the lists say A. `startsFrom` learns that case; it is not a re-recorded row. If `arriveAt` joins
   `READ_OPTIONS`, it joins that section's `HOOKS` too.
3. **Step 3 of the model, in words.** The second list holds one packet for every server tick: the server's packet
   of tick q enters the second list at `15 × q` ms, whether or not a client packet left the first list for it, and
   a client packet that leaves the first list rides the first server tick at or after its leaving. Two client
   packets that leave the first list for the same server tick ride the same server packet (one entry in the
   second list, both messages in it). This is the reading the planner's prototype used; the other reading (each
   client packet entering the second list by itself) gives 73.6 and 99.7 ms in place of 69.6 and 96. **A pin that
   does not share the builder's reading:** over seeds 1 to 20, 4,000 ticks each, at jitter 50, the mean delay
   above the floor is 69.5 ± 3 ms at 300 fps and 95.6 ± 3 ms at 66.67, and the share of voice messages that
   arrive on the tick of the one before is 5.2 ± 1.5% at 300 fps (measured on two prototypes). It fails the
   other reading of step 3 and the reading "the next head is looked at only at the next look" (115 and 194 ms,
   and no two messages on one tick, so no bunch and no skip).
4. **Check 10.** The loss draw is seeded by the render's seed (`tests/steam.verify.js:651` holds that another seed
   loses other messages). The check becomes: the same seed at jitter 0 and at 50 loses the same messages; another
   seed gives other arrival ticks. The break "arrivals drawn from the loss stream" is caught by check 3.
5. **The lists start before tick 0**, at tick -200 with a packet a tick, so the first ticks of a render are not
   early (with empty lists the first 20 ticks come 2 ms early at jitter 50, 23 ms at 200 and 131 ms at 500, at 300
   fps).
6. **Look times as a function, not a period.** `fakeLagList` takes the time of look k as a function
   (`k => 15 * k` for the server, `k => k * 1000 / fps` for the listener), not a `periodMs` multiplied out:
   `k × (1000 / fps)` and `k × 1000 / fps` give other arrival ticks at 120 and 240 fps within the first 230 ticks
   and at 59.94 fps near tick 10,000.
7. **Check 5's bunch as a formula.** `arriveAt = (t) => (t >= T && t < T + 40) ? T + 40 : t`, with T the first
   tick of a message at least 1 s into a phrase: ticks T to T+39 arrive together on T+40, later messages on their
   own tick. Five seeds: a hold of 40 ticks gives two channel opens and 213 to 289 ms dropped; a hold of 4 gives
   one open and nothing dropped. A channel's drops carry output times, not ticks: the check reads the drop where
   the bunch's sound is written, not "at the bunch's tick".
8. **What `codecInfo.arrivals` counts.** `messages` counts the messages pushed into the channel (lost messages are
   not). Under `arriveAt`, `jitterMs` and `fps` are the render's, `floorTicks` is 0 and the delays are
   `arriveAt(t) - t`.
9. **Other suites that change.** `tests/render-stream.verify.mjs:835-836` (late frames for "steam, jitter 500
   ms") and `tests/render-channel.verify.mjs:265-268` (`rest(g)` against `rest(s)`, which differ once `arrivals`
   exists) are restated, each with its reason in the report. `withMask` wraps `steamRoundTrip`, which only
   `process()` calls, so the stream's and the live chain's late-frame code on Steam voice stays untested after
   BC-4a; the report says so.
10. **Words.** `docs/VOICE-PATH.md:16` and `:54` ("marks some frames late" on Steam's path) are BC-4a's.
    `net_fakejitter`'s help says the look rates are chosen and the same-look rule inferred, not "as the game's".
    The new console line gives the arrival figures only; the channel opens and dropped milliseconds stay on the
    queue's line (`app/render.js:508`). In the record the places are `tests/REFERENCE_2026.md:750`, `:758`, `:762`,
    `:1444` and `:1580` (there is no "Not built" line naming BC-4). `steam.verify.js:1022` uses a hand-made mask
    and is left as it is; `withMask` is defined at `:70`.
11. **BC-4b.** `sourceTimingReason()` (`app/console.js:577`) returns null when the timeline setting itself is
    'source'; the line under the control needs its own test of that case.

**Check (ii), restated.**

- **Frame rates.** Each case is rendered at 300 fps and also at the photographs' rates: jitter and combined at 336
  fps, the baseline at 295 (read off the photographs).
- **Bursts** (from 60 ms after each burst's start), jitter render less baseline render, the mean of seeds 1 to 10:
  sound skipped +3 to +15 ms a second; skips of 10 ms or more +0.1 to +0.7 a second (the prototype gives +6.3 ms
  and +0.24 a second at 300 fps; the bounds are guessed). At 336 against 295 the prototype's extra skips of 10 ms
  or more in the bursts are +0.45 a second; the take has about +0.44 (8 against 4 in 8.6 s, measured).
- **Noise:** the downward steps' sum less the baseline render's, 0 to 2.5 ms a second in the mean of the seeds
  (the prototype gives +1.0 over 20 seeds with a spread of 1.6 a seed). Compared with the take by counts, with a
  Poisson bound, not by a factor of the take's 6.6 ms a second.
- **The events row** uses check (i)'s counts (2 events beyond the baseline's in the noise, 9 against 4 in the
  bursts), not 1.36, which came from a script that did not survive.
- **"One frame long" and the clock** are reported only, with no tolerance: the 81% is that script's, and the
  accuracy suite's clock is one slope with skips taken as segment steps (`reference.js:821`, `tests/accuracy.mjs`
  `timing()`).

**Correction to the private look above.** "Three to five times the model's" is not shown in the noise: it rests
on two skips, and at the model's rate two or more in 10.7 s has a probability of 0.08 to 0.17 (the reviewer's
arithmetic). In the bursts at the photographs' frame rates the model's extra skips match the take's. Finding 9
says so, in those words, and the order's prototype table loses the 1.36 and the 81% as targets.

**On the 59 packets a second** (the reviewer, measured on its prototype): voice messages come three to five
ticks apart, so a skipped tick only moves a message one tick later. With one tick in eight skipped on each
crossing the mean delay does not move (189.7 against 189.6 ms) and the same-tick share rises from 4.9 to 6.4% at
300 fps. The model keeps one packet a tick and says the reading is the one open point; a send schedule per
crossing is for block 2's log.

**Size.** 10 hours and 1,000 to 1,300 lines stands; these edits add about 80.
