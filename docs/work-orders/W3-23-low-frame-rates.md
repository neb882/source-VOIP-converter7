# W3-23: frame rates under 67 on the game's voice queue

**Status 2026-11-14: planned, not built.** Written by a planner from the repository alone, at `main` `7e5e9e6`
(cache v50). It is read by a plan reviewer before any build. Three rulings are wanted first ("Rulings wanted before
the build").

**Kind:** a change to how renders are computed. A render of Steam voice on the game's voice queue at a listener
frame rate under 1000/15 (66.67) frames a second changes. No other render's samples change.
**Parts:** W3-23r (a read of the game's frame, no code), W3-23a (the voice channel's clock, the arrival at jitter
0, the render and its stream, the records) and W3-23b (the live monitor's chain). Each is merged on its own, in
that order.
**Roles:** a reader with the owner's install for W3-23r, as W3-03 and W3-07 were read. `tf-builder` (effort xhigh
for W3-23a, high for W3-23b), then `tf-reviewer`. W3-23a also needs a second reader on the stronger model
(`docs/PIPELINE.md`: it changes how renders are computed).
**Branches:** `claude/w3-23r-frame-read`, `claude/w3-23a-frame-clock`, `claude/w3-23b-live-frame-clock`, each from
`main` as it stands when the part starts. **Worktrees:** in the brief.
**Reports:** `docs/reports/W3-23r-frame-read.md`, `docs/reports/W3-23a-frame-clock.md`,
`docs/reports/W3-23b-live-frame-clock.md`. The planning report is `docs/reports/W3-23-plan.md`.
**Budget:** 3 hours for W3-23r, 10 hours for W3-23a, 4 hours for W3-23b.
**Cache number:** rises once with W3-23a and once with W3-23b (`voice-channel.js` and files of `engine/` change).
The builder does not set it.

## Why

The page takes the listener's frame rate from 10 to 1000 (`index.html`, the field `fps`, 300 by default; it is a
number field, with no list of rates). The engine limits it the same way (`VOICE_CHANNEL.fpsRange`). A visitor who
types a rate under 67 meets this order: someone who wants to hear a phrase as a listener at 60, 30 or 20 frames a
second hears it.

Under 66.67 frames a second a frame lasts longer than the game's 15 ms tick. The game then does three things once
a frame that the render does evenly:

| What | The game, as the record reads it | The render today |
| --- | --- | --- |
| Ticks | Several in one frame: the voice channel's pass runs in the frame's tick loop, once for each tick due (read, W3-03, "Every client tick") | One every 15 ms (`voice-channel.js`, `createTimeline`; the order W3-02's table calls this "approximated below 67 fps") |
| The mixer's pulls | Once a frame the mixer paints blocks of 512 samples until 10 to 13 are queued at the device under 66.67 frames a second (9 at 223 and above), so a frame's worth at once (read, W3-07, "Mix-ahead", and W3-23r: the target is `snd_mixahead` plus a smoothed frame duration). *Corrected 2026-11-14 (W3-23a, from W3-23r's read): this said "until 9 are queued".* | One block every 512 samples (the same table: "approximated") |
| When packets are taken | Once for each tick, at its head, before that tick's pass; under 66.67 frames a second every frame has a tick, so once a frame in effect, before the frame's ticks (read, W3-23r). *Corrected 2026-11-14 (W3-23a, from W3-23r's read): this said "at most once a frame (inferred, finding 9; where the client reads its socket is not read)".* | On each message's own tick at jitter 0. The model with jitter looks at the listener's socket once a frame (chosen, BC-4) |

The record measured the third row alone (finding 9, "The render at jitter 0 has no look once a frame"): no tick
moves at 75 frames a second and above; at 66.67, 6.5% of ticks come a tick later; at 60 the mean is 1.5 ms; at 30,
10 ms; at 10, 43 ms (measured on the model at jitter 0.5 and 1). `docs/PROGRESS.json`'s deferred entry asks for
ticks, pulls and looks together. This order is that.

**The look alone would move the render the wrong way.** The planner ran three clocks around the repository's own
channel and sender (`docs/reports/W3-23-plan.md`; measured on the prototype, 60 s of talk, seeds 1 to 10):

| Frames a second | Mean delay of a message's first heard sample: today | With the look alone | With ticks, pulls and looks in frames |
| ---: | ---: | ---: | ---: |
| 66.67 | 291.4 ms | 291.4 | not used (a frame is shorter than a tick) |
| 60 | 278.2 | 280.5 | 266.7 |
| 30 | 236.7 | 247.0 | 231.4 |
| 20 | 222.5 | 242.9 | 201.9 |
| 10 | 208.1 | 261.7 | 185.4 |

A message taken at a frame is taken later, but the mixer's blocks for that stretch of output are also painted at
the frame, after the message is in the ring (inferred from the two reads above). The two cancel in the mean. So the
look is built with the other two or not at all.

**What is heard** (measured on the prototype; a figure of the model, no recording):

- At 60 and 50 frames a second nothing but a few milliseconds of timing: the level is the same within 0.01 dB on
  every clock tried, and a minute of talk opens 14.0 to 14.2 channels on each.
- At 40 and under the level dips more, because the last block of a frame's burst is pulled with less behind it and
  the queue's last 100 ms are faded (finding 22). The mean loss over the playing samples of the talk signal:

| Frames a second | Today | In frames | Share of samples more than 3 dB down: today | In frames |
| ---: | ---: | ---: | ---: | ---: |
| 40 | 0.14 dB | 0.18 | 2.2% | 2.5% |
| 30 | 0.15 | 0.22 | 2.2% | 2.9% |
| 20 | 0.21 | 0.55 | 2.5% | 7.7% |
| 10 | 0.36 | 0.69 | 3.9% | 10.6% |

- The size at 30 and under depends on things that are chosen, not read (the order of a frame's three steps, and
  one tick of phase): on 60 s of unbroken sound at 30 frames a second the loss is 0.13 dB with the arrival rule of
  this order and 0.74 dB without its tick of relay. That is why W3-23r comes first, and why the game's own log is
  asked for ("What would settle it against the game").

## What is read, inferred and chosen

| Part | Statement | Standing |
| --- | --- | --- |
| Ticks | The tick is 15 ms. A frame runs one pass of the voice channel for each tick due, in a loop; above 66.7 frames a second most frames have none, below it a frame has several | read (W3-03) |
| Ticks | How many are due in a frame: the ticks whose time has come, so `floor(t / 15 ms)` of them by time `t` | read (W3-23r: the frame's limited duration is added to a remainder and the whole ticks are taken off it; a tick whose time has just come runs in that frame). *Corrected 2026-11-14 (W3-23a, from W3-23r's read): this said "inferred (the loop's count is read; the arithmetic of the remainder is not)".* |
| The wait | Each tick takes the frame's duration off `voice_buffer_ms`, the duration limited to 0.001 to 0.1 s, so the wait is `ceil(0.1 × fps)` ticks, the packet's tick the first | read (W3-03); 7 ticks logged at `fps_max 67` (measured, finding 23). Nothing under 66 frames a second is logged |
| The wait | At 30 frames a second it is 3 ticks, at 20 it is 2, at 10 it is 1, so a new phrase can start in the frame its packet is taken in | inferred from the two rows above |
| Pulls | The mixer is called once a frame and paints blocks of 512 samples up to a target of `snd_mixahead` plus a smoothed frame duration: 10 blocks kept from 63 to 222 frames a second, 11 from 37 to 62, 12 from 26 to 36, the device's 13 at 25 and under (9 at 223 and above), never more than the device has free of its 13. At a steady rate that is a fixed lead | read (W3-07, corrected by W3-23r; the counts are arithmetic on the read rule). *Corrected 2026-11-14 (W3-23a, from W3-23r's read): this said "paints `9 − queued` blocks".* |
| Pulls | So block `b` is painted at the first frame at or after a fixed time before it plays; the fixed time delays every sound alike | inferred |
| Pulls | An "extra update" paints again when 90 ms have passed since the last paint of either kind (read, W3-07 and W3-23r). It can act only under 11.1 frames a second, and only while the view is drawn, after the frame's packets and ticks | read; it need not be modelled: it moves a few of a frame's blocks to an earlier paint in the same frame, behind the same packets and ticks, so it changes no sample of the model (inferred from read, W3-23r). 10 frames a second stays the least sure rate because nothing under 66 frames a second is logged. *Corrected 2026-11-14 (W3-23a, from W3-23r's read): this said "not modelled (chosen), so 10 frames a second is the model's least sure rate".* |
| Looks | With lag off the client takes packets once for each tick, at its head: under 66.67 frames a second once a frame in effect, before the frame's ticks | read (W3-23r). *Corrected 2026-11-14 (W3-23a, from W3-23r's read): this said "at most once a frame", inferred (finding 9).* |
| Looks | The server relays a message on its next tick, and the listener's socket is looked at once a frame | chosen in BC-4 for the model with jitter; kept here at jitter 0 so the two are one rule |
| Order in a frame | Packets, then the ticks, then the mixer | read (W3-23r). In the game the paint comes later in the frame than the packets, by the time the frame takes to draw; the model puts the three at one instant (chosen). *Corrected 2026-11-14 (W3-23a, from W3-23r's read): this said "chosen; not read. W3-23r reads it".* |
| Exactly 66.67 | A frame of 14.9993 ms is shorter than a tick, so this order's clock does not run and nothing moves. At jitter 0 no tick drifts: the rule below gives `at(p) = p` for every frame of 15 ms or less (arithmetic, and run over 40,000 ticks) | computed |
| Exactly 66.67 with jitter | Finding 9's drift (96.3 ms in the first minute, 108.1 in the fifth) is the model with jitter's and stays as it is | measured (BC-4a's second reader); not changed here |
| A steady frame rate | One figure for the whole render; the game's frames vary | chosen (as the wait already is) |
| Pulls at 66.67 and above | The game paints once a frame at every rate (read, W3-23r), so below about 86 frames a second, where a frame outlasts a block of 512 samples (arithmetic), its pulls come in bursts. The model keeps one block every 512 samples at 66.67 and above | chosen, to keep every recorded figure at 66.67 and above. *Added 2026-11-14 (W3-23a, the plan review's edit 9).* |

## W3-23r: the read

A reader with the owner's install, by W3-03's method (the files read as data, nothing copied but what was learnt,
every statement marked read or inferred). W3-03 and W3-07 give the places to start from: the tick loop of
`_Host_RunFrame`, the per-tick client call, `S_Update`, the "extra update".

Three questions:

1. Where in a frame the client takes its packets, against the tick loop: before it, inside it once a tick, or
   after it.
2. Where in a frame `S_Update` paints, against the tick loop and the packets.
3. From where the "extra update" can paint inside a frame, and whether one can fall between the packets and the
   ticks.

The answers go into `tests/REFERENCE_2026.md` as dated lines under findings 22 and 30, and into this order as a
dated section. If the order of a frame's steps is not "packets, ticks, mixer", W3-23a builds the order that was
read, and the planner's figures above are run again on it before the build.

If no reader can be started, W3-23a may still be built on the chosen order, by ruling 1 below.

*Settled 2026-11-14 (W3-23a): W3-23r ran and read the order "packets, ticks, mixer", so neither condition above
applies. W3-23a builds that order, and the planner's figures need no second run for it ("W3-23r: what was read").*

## W3-23r: what was read (2026-11-14)

The read is done. Its report is `docs/reports/W3-23r-frame-read.md`. The evidence is in
`tests/REFERENCE_2026.md`, in the lines added to findings 22 and 30.

**The order of a frame's steps is packets, ticks, mixer, as this order chose it.** W3-23a builds the order of
steps it already has.

| Question | Answer | Standing |
| --- | --- | --- |
| 1. Where the client takes its packets | Inside the tick loop, once for each tick, at the head of the client's part of the tick and before that tick's pass over the voice channels. One read takes every packet waiting. A frame with no tick takes none | read |
| 2. Where `S_Update` paints | Once a frame, after the tick loop and after the frame is drawn | read |
| 3. Where the "extra update" can paint | Only from the client module's drawing of the view, between the tick loop and `S_Update`. None falls between the packets and the ticks | the engine's side read; the client module's six calls read by a search; "no other way in" inferred |

What this changes in the tables of "What is read, inferred and chosen":

| Row | Was | Is |
| --- | --- | --- |
| Order in a frame: packets, then the ticks, then the mixer | chosen | read |
| Looks: the client takes packets at most once a frame | inferred (finding 9) | read: once for each tick, at its head. Under 66.67 frames a second every frame has a tick, so it is once a frame in effect, before the frame's ticks |
| Ticks: `floor(t / 15 ms)` are due by time `t` | inferred | read. The frame's duration, limited to 0.001 to 0.1 s, is added to a remainder and the whole ticks are taken off it. A tick whose time has just come runs in that frame, which is the clock's `1323 i <= F(k)` |
| Pulls: the mixer paints `9 − queued` blocks | read (W3-07) | corrected. The target is `snd_mixahead` plus a smoothed frame duration. The blocks kept are 9 at 223 frames a second and above, 10 from 63 to 222, 11 from 37 to 62, 12 from 26 to 36 and the device's 13 at 25 and under (arithmetic on the read rule). At a steady rate that is a fixed lead, as the next row of the table assumes, so step 3 of the clock keeps its form |
| Pulls: the "extra update" is not modelled | chosen | need not be modelled (inferred from read). When it acts it paints a few of the frame's blocks a little before `S_Update` does, after the same packets and ticks, so it changes no sample of the model. Its 90 ms run from the last paint of either kind (read), so it acts only at 11.1 frames a second and under |

What W3-23a must change: **nothing in the clock or the arrival rule.** Its words change in three places.

1. The standings above go into its records (finding 22's and finding 30's lines of W3-23a, the Model table's
   rows, the help sentence). "Read in part" in the help sentence stands.
2. The report and the records do not say "9 blocks" for a rate under 66.67. They say the count by the table
   above, or "a fixed lead".
3. 10 frames a second is no longer the least sure rate because of the extra update. It stays unlogged, like every
   rate under 66.

One thing the model does not have, and this order does not add: in the game the paint comes later in the frame
than the packets, by the time the frame takes to draw. On a machine held by `fps_max` that time is short. On a
machine that is slow because drawing is slow it is most of the frame (inferred).

**The log request needs one more line.** With `sv_cheats` 0 the game sets `fps_max` back to 30 when it is set
under 30 (read). So the section at `fps_max 20` of "What would settle it against the game" needs `sv_cheats 1`
typed first on the owner's local game, or it is recorded at 30. It also means a player's game is under 30 frames
a second only on a machine that cannot draw faster. The page's rates from 10 to 29 stand for that machine.

The planner's figures were run on this order of steps (its clock CL). They need no second run for the order.

## W3-23a: the clock, the arrival at jitter 0, the render

### The frame clock (`voice-channel.js`, `createTimeline`)

Time stays in half samples at 44.1 kHz: a tick is 1323, a block is 1024.

- **When it runs.** With `fps` limited to 10 to 1000 as `waitTicks` limits it, a frame lasts `88200 / fps` half
  samples. The frame clock runs when `88200 / fps > 1323`, a frame longer than a tick. Otherwise the clock is
  today's, to the last sample. At 66.67 the quotient is 1322.93 and at 1000/15 it is 1323, so neither uses it
  (computed).
- **Frames.** Frame `k` (0, 1, 2 and so on) is at `F(k) = (88200 × k) / fps`, in double precision, compared with
  the whole numbers `1323 × tick` and `1024 × block`. The tests' second model uses the same expression: it is the
  definition.
- **A frame's three steps, in this order:**
  1. every message given and not yet added whose arrival tick `a` has `1323 a <= F(k)` is added, in the order
     given;
  2. every tick `i` not yet run with `1323 i <= F(k)` runs its pass;
  3. every block `b` not yet run with `1024 b <= F(k)` runs, as `runBlock` runs it today (513 on the first block
     after a start, the kept sample, the same output samples `512 b − D` to `512 b − D + 511`).
- **Nothing else changes:** the channel (`createChannel`), `waitTicks`, `latency`, `zero`, `arrivalZero`, the
  output's length, `info`'s fields and their meaning. `D` is not changed (ruling 3).
- **`push` and `advance`.** `push({ tick })` and `advance(tick)` still mean that no later message has a lower
  tick. Under the frame clock they run every frame with `F(k) < 1323 × tick` and return what those frames'
  blocks made. A pushed message waits in the timeline until its frame runs. `finish()` runs frames until the
  blocks cover the length.
- **An open happens in a frame, not in a push.** Today `steamChannel` sees an open by counting opens across its
  own `push` (`engine/steam.js`, `onOpen`). `createTimeline` takes `onOpen(index)` itself and calls it where the
  channel opens, with the count of output samples made by then. `steamChannel` passes its own through. On
  today's clock the index it gives is the one `steamChannel` computes now (a check).
- **A message's frames' blocks travel with it.** `steamChannel` sets `blocks` at its `push` and the gain reads
  them when the channel adds the packet. Under the frame clock the add comes later, so `steamChannel` keeps each
  pushed message's blocks in a queue and the gain takes the head at each `process`. Without this a late frame's
  samples would pass around the wrong packet's gain.
- **With no end** (`length` Infinity, the live monitor's): W3-23a keeps today's clock at every frame rate.
  `steamChannel` says so with one option, removed by W3-23b.

### The arrival at jitter 0 (`engine/network.js`)

- `steamArrivals` at `jitterMs` 0 or less, when a frame is longer than a tick (`1000 / fps > 15`, `fps` as
  `steamArrivalFps` limits it), gives the model with jitter as its jitter goes to 0, in closed form:
  - the message of tick `p` is in the listener's list from `15 (p + 1)` ms (the server's relay tick);
  - it leaves at the first look `r = lookTime(k)` with `r − 15 (p + 1) > 0`, the looks being
    `STEAM_CROSSINGS`' listener looks, `k × 1000 / fps`;
  - `at(p) = ceil(r / 15) − 2`. Nothing is drawn. `floorTicks` is reported as 0 and `jitterMs` as 0.
- At every other frame rate `at(p)` stays `p`, and `steamArrivalPlan` returns `null` there as today, so no render
  at 66.67 or above meets new code.
- `at(p) >= p` (run on the planner's prototype: 40,000 ticks at 18 frame rates), and it never falls, since a later
  packet's look is never an earlier one.
- `codecInfo.arrivals` stays absent at jitter 0 without `opts.arriveAt`, at every frame rate: the page's lines and
  logs read it as "jitter is on".
- `endless` (the live chain's) takes the same rule in W3-23b; in W3-23a the endless model at jitter 0 is today's.
- `opts.arriveAt` and a demo's own packets give their own ticks, as today; under the frame clock each is added at
  the first frame at or after its tick's time.

What the rule moves, by itself (measured on the planner's prototype, `at(p) − p` over 40,000 ticks):

| Frames a second | Ticks moved | Mean | Most |
| ---: | ---: | ---: | ---: |
| 1000/15 and above | none | 0 | 0 |
| 66 | 1.0% | 0.15 ms | 1 tick |
| 60 | 10.0% | 1.5 ms | 1 |
| 30 | 55.0% | 9.75 ms | 2 |
| 20 | 70.0% | 18.0 ms | 3 |
| 10 | 85.0% | 42.75 ms | 6 |

These are finding 9's figures (1.5, 10 and 43 ms). They are the same as `steamArrivals` at jitter 0.000001, tick
for tick, at each of the 18 rates tried.

### What moves, and what must not

**Nothing moves at 66.67 frames a second and above**, so nothing at the page's default of 300. How that is
checked:

1. `node tests/render-stream.verify.mjs --hashes` before the first change and after the last: the two outputs are
   equal, byte for byte. The builder keeps both in the report's folder. Its cases on the game's voice queue run at
   66.67 and at the default.
2. `pnpm test stages`, `pnpm test steam`, `pnpm test reproduce`, `pnpm test demo` and `pnpm test verify` pass
   with no recorded value changed in their files.
3. `tests/render-channel.verify.mjs`: every recorded figure at 66.67, 100, 150, 300 and 1000 stays, the pin of
   BC-4a's section 14 included.
4. A check that fails if the threshold slips: a render and a timeline at 66.67 and at 1000/15 give today's
   samples (compared with a reference on today's clock, written in the suite), and at 66.6 they do not.

**What may move:** in `tests/voice-channel.verify.mjs` and `tests/render-channel.verify.mjs`, the cases of a
whole-length timeline or render at 10, 30, 40, 59.94 or 60 frames a second, with or without jitter. Each such
case compares with a reference the suite builds; the reference gets the frame clock, written again from this
order's text. A recorded value in any other suite that moves is a reason to stop.

### The tests

Every check with its break. Runnable without the owner's recordings.

1. **The clock against a second model.** `tests/voicequeue/reference-frames.mjs`, written from this order's text
   with plain loops over frames (no shared code with `createTimeline`): for made-up traffic (the suite's
   `madeUpMessages`) at 10, 20, 24, 30, 40, 50, 59.94, 60 and 66 frames a second, `createTimeline`'s samples and
   `info` counts equal the second model's, pushed whole and with `advance` between pushes at odd ticks.
2. **The coincidences.** At 60 frames a second a frame falls on a tick every 150 ms, and at 30 and 10 every
   300 ms (arithmetic). A case with a message on such a tick, one a tick before and one a tick after shows each
   added in the frame the rule says. Breaks: `<` for `<=` in each of the three steps fails it.
3. **The order of the three steps.** At 10 frames a second with `voice_buffer_ms` 100 the wait is one tick: a
   message taken at frame `k` is heard from the first block of frame `k`'s burst. Breaks: the mixer before the
   ticks, and the ticks before the packets, each fail.
4. **Ticks in a frame.** At 30 frames a second nine frames run 20 ticks, seven with two and two with three
   (arithmetic); a channel with a wait of 3 starts in its packet's frame only when that frame has three.
5. **The arrival rule against the model with jitter** (the measure of finding 9's item). For each of the nine
   frame rates of check 1, and 66.67, 75 and 300: `steamArrivals({ jitterMs: 0 })` equals
   `steamArrivals({ jitterMs: 1e-6 })` tick for tick over 40,000 ticks, and equals the second model of
   `tests/voicequeue/reference-arrivals.mjs`, which gets the closed form written again. Against jitter 0.5 and 1,
   seeds 1 to 3, the mean of the difference is under 2.1 ms at 66 and 59.94 and under 1.1 ms at the other rates
   below 66.67 (the planner's prototype gave 0 to 1.9; the builder records the figures). Break: `>=` for `>` in
   the look fails the first comparison at 50 frames a second.
6. **Renders.** `process()` on Steam voice on the game's voice queue at 60, 30 and 10 frames a second, at jitter 0
   and 50, with loss, and with the auto-gain off, equals section 1's reference (`referenceRender`) with the second
   model's clock. `createRender` in pieces of odd sizes gives `process()`'s samples and `codecInfo`.
7. **Late frames with the frame clock.** A render at 30 frames a second with a late-frame mask of the suite's own
   equals the reference. Break: `steamChannel` reading the blocks of the last pushed message fails it.
8. **`onOpen`.** On today's clock, at 66.67 and 300, the indices given are those of `main` (recorded from `main`
   before the change). Under the frame clock each index is the output count at the frame of the open.
9. **The stage keys.** With `stages`: a render at 30 frames a second after one at 300 gives a fresh render's
   samples, starting from the stage the lists in `engine/render.js` say for `fps`.
10. **What a listener gets**, recorded as figures in the report, not as bounds: on the suite's layouts P and Q,
    seeds 1 to 50, at 60, 30, 20 and 10 frames a second, the mean and range of an opened spurt's `offsetStartMs`,
    the opens, the dropped samples, and the share of playing blocks pulled with under 100 ms queued, on `main` and
    on the branch.
11. **Determinism.** The same render twice gives the same samples.

### The records and the words

- `tests/REFERENCE_2026.md`, dated lines only: finding 9 (the look at jitter 0 is built, and what it moves);
  finding 22 (the mixer's pulls and the ticks under 66.67, with each standing from this order's table and
  W3-23r's answers); finding 23 (the wait at 30, 20 and 10); the Model table's rows on ticks and pulls.
- `docs/work-orders/W3-02-receiver-queue.md`: a dated line at the table's rows "When the mixer pulls" and
  "Ticks".
- `docs/VOICE-PATH.md`, `docs/PAGE.md` (the frame rate's entry), `README.md` where it describes the queue: under
  67 the model takes packets, counts and mixes once a frame.
- The frame rate's help text (`index.html`, `app/console.js`): one sentence, with its standing: "Under 67 the
  game takes packets, counts down and mixes once a frame, which the model follows (read in part, no recording)."
- `tests/README.md`: the two suites' rows.
- `docs/PROGRESS.json`'s deferred entry is closed by the orchestrator at the merge.

### Files

May touch: `voice-channel.js`, `engine/network.js`, `engine/steam.js`, `engine/render.js`,
`engine/render-stream.js` (only if the bound or `codecInfo.arrivals` needs it), `index.html` and `app/console.js`
(the one help sentence), `tests/voice-channel.verify.mjs`, `tests/render-channel.verify.mjs`,
`tests/voicequeue/reference-frames.mjs` (new), `tests/voicequeue/reference-arrivals.mjs`,
`tests/voicequeue/README.md`, `tests/browser.verify.js` (only if the help sentence is asserted there),
`tests/REFERENCE_2026.md`, `tests/README.md`, the documents named above, and the report.

May not touch: `sw.js` (the number is set at the merge), `steam-sender.js`, `engine/live-chain.js` (W3-23b's),
the codecs and `vendor/`, `tests/predictions/`, `tests/recordings/`, any recorded hash of
`tests/render-stream.verify.mjs`, `tests/stages.verify.mjs`, `tests/steam.verify.js`, `tests/demo.verify.mjs` or
`tests/reproduce.verify.mjs`, and `docs/PROGRESS.json`.

No new engine file: the five lists stay as they are.

### Done means

- `pnpm test voice-channel render-channel` passes; then `flock /tmp/tf2ve-heavy.lock pnpm test`; then the
  browser suite the same way if `index.html` or `app/console.js` changed.
- The two `--hashes` outputs are equal.
- Each break above was made and seen to fail its check, and is listed in the report.
- A render of 10 minutes at 10 frames a second takes no more than 1.2 times the time and memory of the same
  render on `main` (measured, in the report).
- CI's `verify` is green on the branch's head.

### Stop and ask

- A recorded value moves at 66.67 frames a second or above.
- `createRender`'s samples cannot equal `process()`'s under the frame clock without changing the stream's bound.
- W3-23r's answer contradicts a statement this order marks read.
- The budget is spent.

## W3-23b: the live monitor's chain

- `createTimeline` with no end takes the frame clock, and the endless arrival model takes the rule at jitter 0
  (ticks that never fall, nothing kept that grows: `held()` stays flat over an hour of packets at 10 frames a
  second).
- **The hold.** The chain gives out a sample only when the channel has made it final. Under the frame clock a
  block is final one frame later at most, so the hold rises above `D` by whole mixer blocks covering one frame.
  The builder finds the least such count with the chain's own guard (`stats.margin`, and the error "the hold-back
  runs short") at 60, 30, 20 and 10 frames a second over odd plans of blocks, writes it as a formula in
  `engine/live-chain.js`, and shows that one block less fails. The delay the chain reports rises by the same.
- **The check:** at its mix point the chain gives `createRender`'s samples held back by the new hold, at 60, 30
  and 10 frames a second, at jitter 0 and 50, with loss, at any plan of blocks (the checks W3-02c-3a has at 66.67,
  100 and 300, which stay as they are).
- Words: `docs/LIVE.md` and the monitor's delay line.
- Files: `voice-channel.js` (the option's removal), `engine/network.js`, `engine/steam.js`,
  `engine/live-chain.js`, `live.js` only for the delay's words, `tests/render-channel.verify.mjs`,
  `tests/voice-channel.verify.mjs`, the documents. Not `sw.js`.
- Until it merges, the monitor under 66.67 frames a second keeps even ticks and blocks, and the documents of
  W3-23a say so with "not built yet".

## What would settle it against the game

The record has no log under 66 frames a second. Two things would settle the chosen parts.

1. **W3-23r**, above, without the owner.
2. **A log**, three typed lines more in the run sheet's queue block (block 2 or block 5, whichever is recorded
   first), after its section at `fps_max 67`: `voice_showchannels 2`, then about 20 s of speech at `fps_max 30`
   and 20 s at `fps_max 20`, then the settings back. `sv_cheats 1` is typed first on the PC that ran `map`: with
   `sv_cheats` 0 the game sets `fps_max` back to 30 when it is set under 30 (read, W3-23r), and the section at 20
   would be recorded at 30. *Added 2026-11-14 (W3-23a); the run sheet's lines in `docs/owner-runs.md` already have
   it.* `voice_showchannels 2` adds a line for every pull of the
   mixer (read, W3-03), so the console's own order of lines shows a frame's steps. Read without a model first:
   - **the tick lines come in runs** with no pull line between them: twos and threes at 30 (seven twos to two
     threes), threes and fours at 20 (two threes to one four);
   - **the pull lines come in runs** too: two or three at 30, four or five at 20;
   - **the order** of a packet's line, the tick lines and the pull lines within a run (chosen here: packet,
     ticks, pulls);
   - **the wait:** 3 tick lines at 30 and 2 at 20 before the first pull line of a channel, in one run or across
     two;
   - **two packet lines in one run** at 20, which the log at 300 never shows on one tick (finding 25);
   - **the queue's size at the last pull of a run**, which is what the fade acts on.
   Then the log's packets and tick lines replayed through `tests/voicequeue/replay.mjs` with the frame clock.
   `tests/voicequeue/log-to-fixture.mjs` refuses pull lines today; a log tool for this is its own small change,
   written when the log exists.

10 frames a second is left out of the log on purpose: there the "extra update" can paint inside a frame.
*Corrected 2026-11-14 (W3-23a, from W3-23r's read): the extra update paints in the same frame, after the same packets
and ticks, so it changes no sample of the model. In a log at 10 it would still split a frame's pull lines into two
runs, which the reading above does not tell from two frames (inferred); that is why 10 stays out.*

## Rulings wanted before the build

1. **Build on the chosen order of a frame's steps, or wait for W3-23r.** The planner's advice: run W3-23r first.
   It costs a reader's three hours and no build, and the size of what is heard at 30 and under turns on it.
2. **The tick of relay at jitter 0.** The rule keeps the model with jitter's relay tick, so jitter 0 and a very
   small jitter give the same ticks (check 5). The other choice is no relay tick at jitter 0: the frame clock's
   own look, `at(p) = p`, and a step of up to 15 ms in the mean between jitter 0 and jitter above 0. The planner's
   advice: keep one rule.
3. **The zero `D`.** Under the frame clock a message's first heard sample comes earlier in the mean than today
   (the first table: 11.5 ms at 60, 5.3 at 30, 20.6 at 20, 22.7 at 10; measured on the prototype over every
   message, not over opened spurts). The order leaves `D` as it is, so a render under 66.67 sits that much early
   against its source. Check 10 records the figure for opened spurts; a term in `zero()` could take it out later.

## What the reviewer attacks

- The threshold: 66.67, 1000/15 and the first double below it.
- A message pushed and never added: a source that ends inside a frame, an end marker alone, a silence record.
- `advance` at a tick inside a frame, twice, and at a tick before the last.
- Two messages on one tick, and two ticks' messages in one frame, in the order given.
- The gain's blocks under a mask of late frames (check 7).
- A demo's own packets on the game's voice queue at 30 frames a second (`opts.received`): its ticks, its zero.
- The second model: that it shares nothing with `createTimeline` but the definition of `F(k)`.

## The orchestrator's rulings (2026-11-14)

1. **W3-23r first.** The read runs now, by a reader on the stronger model with the owner's install (the x64
   `engine.dll` W3-03 and W3-07 read, SHA-256 `4802a74c…`). W3-23a waits for the read, for a plan reviewer's pass on
   this order as the read leaves it, and for the account's weekly usage to reset (2026-11-16): at the page's
   default nothing moves, and at 60 frames a second about 10 ms.
2. **One rule for the relay tick.** Jitter 0 keeps the model with jitter's relay tick, so jitter 0 and a very small
   jitter give the same ticks (check 5).
3. **`D` stays as it is.** A render under 66.67 sits early against its source by the figure check 10 records, and
   the order's records say so with that figure (measured). A term in `zero()` waits for a take at a low frame rate.
4. **The typed lines join the run sheet.** The three lines of "What would settle it against the game" go into
   `docs/owner-runs.md`'s block on the queue with W3-23r's merge, as a request that waits on nothing else.

The planner's commit on `claude/w3-23-plan` was not merged: its two files came to `main` in the orchestrator's
commit, with the repository's own attribution line.

*Ruling 1 amended 2026-11-14, after W3-23r: W3-23a does not wait for the usage reset. The owner said on 2026-11-13 "I'm not worried about running out of usage this weekend", and that stands over the orchestrator's caution. It waits for the plan reviewer's pass only.*

## After the plan review (2026-11-14)

The plan review (build after edits; reviewed at `main` `3ef4990`) found what follows. Each edit holds over the text
above it; the builder of W3-23a reads this section first.

1. **What may move, two checks more (blocking).**
   - `tests/voice-channel.verify.mjs` `endlessChecks` has the case `[30, 200, 0.1, 0]`, which asks the endless
     timeline for what the whole-length one gives. In W3-23a only the whole-length one has the frame clock, and its
     `counts()` differs once the last message is still waiting. In W3-23a that case moves to `[100, 200, 0.1, 0]`.
   - `tests/render-channel.verify.mjs` section 10 has two cases of the live chain at 10 frames a second and jitter
     500 (about `:854-857`) that ask `sameAsRender(live, ren)`. In W3-23a they move to 66.67, with their `grows`
     thresholds checked again.
   - W3-23b puts all three back at their old rates, and its checks list them beside 66.67, 100 and 300.
2. **The predictions' note (blocking).** W3-23a changes hashed model files (`engine/network.js`, `engine/steam.js`,
   `engine/render.js`). "May touch" gains `tests/predictions/PREDICTIONS.md`, the note only, in the form of the
   notes before it.
3. **`finish()` under the frame clock.** Today every message pushed is added, because `push` runs the events up to
   its tick. Under the frame clock a message whose frame lies past the blocks that cover the length would never be
   added. Its spurt would then count as `appended`, and `opens`, `gainResets` and `droppedSamples` would fall. That
   happens in real renders at jitter 500. `finish()` runs frames until the blocks cover the length and every
   message given has been added; the second model does the same.
4. **The reference of checks 6 and 7.** `referenceRender` drives `VC.createTimeline` itself, and sets the gain's
   blocks (`use(blocks)`) before `tl.push`: the stale blocks this order fixes in `steamChannel`. The reference:
   - takes the second model's clock;
   - queues each message's blocks with it;
   - uses the closed form at jitter 0 under 66.67, with `arrivals` left absent.
5. **The arrival rule under the frame clock** (the reviewer's computation). Composed with the frame clock, the rule
   puts a message in a later frame than `at(p) = p` would for 0% of messages at 66, 60 and 50 frames a second. The
   share is 10% at 59.94, 20% at 40, 50% at 30, 40% at 20 and 20% at 10. So at 60 the rule's 1.5 ms moves no
   sample. Three consequences:
   - finding 9's added line and the report do not call that 1.5 ms heard;
   - the rule's breaks are caught by check 5 and by renders at 30 or 10, not at 60;
   - the level at 30 and under rests on a chosen phase between the server's ticks and the listener's frames (0.13
     against 0.74 dB). In the game that phase is not fixed. Ruling 2 stands; this is its cost, and the records say
     so.
6. **Check 4.** It does not use "a reference on today's clock". A render at 1000/15 equals the render at 66.67
   sample for sample (same wait, same `D`, arrival plan null); the render at 66.67 has a recorded hash; and a render
   at 66.6 differs.
7. **Check 2.** Frames fall exactly on blocks only when k is a multiple of 512 at 60 frames a second (every 8.53 s),
   and of 256 at 30 (8.53 s) and at 10 (25.6 s). The case that breaks step 3's `<` must sit at one of those frames.
8. **A demo at 30 frames a second.** Section 21's rates (`[300, 66.67]`) gain 30. Any "behind" bound in it, and in
   check 6's `createRender` in pieces, becomes the old bound plus `512 × ceil(88200 / (1024 × fps))` samples.
9. **Words.**
   - The lines the read made stale are the builder's to make true, with a dated mark: about lines 36 ("until 9 are
     queued") and 37 (its standing), 86, 88, 89 and 91, the conditional at 111 to 114, and "What would settle it"
     (no `sv_cheats 1`; 10 frames a second left out for the extra update). The run sheet's lines in
     `docs/owner-runs.md` already have `sv_cheats 1`.
   - The game paints once a frame at every rate, so below about 86 frames a second its pulls come in bursts.
     Even pulls at 66.67 and above are chosen, to keep the recorded figures; the order and the records say so. The
     help sentence "mixes once a frame" is true at every rate and is worded so.
   - The help text and `VOICE_CHANNEL`'s comment say 300 is `fps_max`'s default. W3-23r read a start value of 400
     in `engine.dll`; the record's 300 is what the owner's game ran at (logged, Set G). W3-23a words both so; the
     page's default stays 300.
10. **Figures.** The 40 row and the claim at 50 have no source in `W3-23-plan.md`. Check 10 measures again the dB
    figures of "What is heard": the mean level lost in talk and the share of samples more than 3 dB down, at 60,
    30, 20 and 10. Any figure not measured again is labelled the prototype's.
11. **W3-23b's hold.** By arithmetic, not by search: at most one frame short, so `ceil(88200 / (1024 × fps))`
    blocks (9 at 10 frames a second, 2 at 60). One block less fails at a phase built to make it fail, not over
    random plans.
12. **`onOpen` moves to W3-23b.** No whole-length caller uses it, only the live chain. W3-23a leaves it alone.

## W3-23a: after the review and the second read (2026-11-14)

The review said merge as is. It reproduced the hash list byte for byte at `91d37c6` and `4f7e160`, every changed
recorded value and its reason, and check 10's figures. It judged the browser timeout on the branch's first commit
timing: nothing in the diff runs at 300 frames a second but one push and pop per message.

The second reader said the model is right with corrections. It wrote its own frame model from W3-23r alone and
compared it with the branch at 60, 30, 20 and 10 frames a second, and at 59.94, 50, 40, 24 and 66, on 180 s of talk
and three seeds: the same events in the same order and the same samples (measured). Nothing moves at 66.67 and above
by any path it tried (18 of 18 `process()` hashes).

Fixed on the branch before the merge:

1. **Frame rates under 10** (the review). The code clamps them to 10, but two breaks pass every suite: a frame time
   from the raw `fps`, and the arrival plan from the raw `fps`. The page passes a typed 5. Check 1 gains 5, against
   fps 10's run. Section 22 gains 5, its plan's ticks against fps 10's.
2. **The rounding of a look** (the second reader, finding 2). At 60 of the 567 one-decimal rates from 10.0 to 66.6
   (36.8, 32.8, 33.3 and 66.6 among them), the rule at jitter 0 differs from jitter 1e-6 on up to 77 of 20,000
   ticks, always one look earlier. The cause is `k * 1000 / fps` rounding a look a hair past a relay tick it should
   fall on. The look times are computed as the frame clock computes its frames (the same `F(k)`). The check runs
   over all 567 rates.
3. **The words of the rule** (finding 1). "The listener's first look after the relay tick" is true in ticks. From 34
   to 66 frames a second the two ticks taken off put the message in the first frame at or after its own tick; the
   whole look is in the delay only at 30 and under (measured: 100% of messages a frame earlier at 50, 60 and 64 to
   66, 0% at 30 and under). That is why the offsets are not monotonic. Say so at `engine/render.js:433`,
   `engine/network.js:265`, the report's first paragraph and the record's line under finding 9.
4. **The block's phase is chosen** (finding 3). The read gives block `b` painted at the first frame with
   `512 b <= A + played`, where `A = (0.1 + frame) × 44100` samples is not whole blocks. Step 3 is the case
   `A mod 512 = 0`, the plainest. The device's phase is free in the game. The records mark the block phase chosen,
   beside the tick and frame phase, and "a fixed lead moves no sample" holds for a lead of whole blocks.

For a later order, not built (finding 4): a closed form for `D` under the frame clock exists. As built it is
−10.8 ms at 60, −12.5 at 50, −20.0 at 40, −5.8 at 30, −26.7 at 24, −22.5 at 20 and −32.5 at 10 (the second
reader's arithmetic). It agrees with check 10 except at 10, where the gap of 13 ms is put down to underruns in the
first 0.2 s (inferred, not checked). Ruling 3 stands: the form rests on the chosen phase, and the game's lead of 10
to 13 blocks pushes the other way by about as much. A take at a low frame rate is its gate.
