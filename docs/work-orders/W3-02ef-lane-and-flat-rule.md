# W3-02e and W3-02f: the codec lane and the real-take panel on the game's queue; the flat rule taken out of the engine

**Status 2026-11-13: planned, not built.** One order of two parts, written by a planner from the repository as it
stands at `bc28875` (cache v45). It takes the place of the sections "W3-02e" and "W3-02f" of
[the old order](W3-02-receiver-queue.md), written 2026-11-10, which no longer need to be read. Every `file:line`
below is of `bc28875`. The planning report is [docs/reports/W3-02ef-plan.md](../reports/W3-02ef-plan.md).

While this was written `main` moved to `a93ec66`. No file under `engine/` or `app/` and no suite changed. Lines
moved in `tests/REFERENCE_2026.md` alone among the files named here, and those are given for both commits.
W3-02c-3 was planned again in two parts; "The order of the parts" is written against that text.

| | Part W3-02f | Part W3-02e |
| --- | --- | --- |
| **What** | the flat rule for early phrases (`opts.retime`) is deleted from the engine | the codec lane and the real-take panel say what a render on the game's voice queue does |
| **Kind** | code that only a render asked with `retime` runs is deleted. No other render changes | drawing and words on the page. No render's samples change |
| **Roles** | `tf-builder` (effort high), then `tf-reviewer`. No second reader (ruling 1) | `tf-builder` (effort high), then `tf-reviewer`. No second reader |
| **Branch** | `claude/w3-02f-retire-flat-rule`, from `main` | `claude/w3-02e-lane-and-take`, from `main` |
| **Report** | `docs/reports/W3-02f-flat-rule.md` | `docs/reports/W3-02e-lane-and-take.md` |
| **Budget** | 3 hours | 8 hours |
| **Cache number** | rises (engine files). The builder does not set it | rises (page files). The builder does not set it |

The worktree of each part is in its brief. The two parts share no code file and no test file, so each has its
own builder and its own review. "The order of the parts" at the end says what may run beside what.

## Why

Since W3-02d-1 the page's render on Steam voice runs the game's voice queue by default
(`opts.timeline` `'game'`, 300 frames a second, `voice_buffer_ms` 100). Two things were left for after it.

**The flat rule is still in the engine.** It moved a phrase early with a chance of 41% after a silence of up to
0.45 s (a fit to the takes, finding 19). The page stopped sending it with W3-02d-1. A render that runs the queue
gets 57% of the speech take's changes between phrases right, and the flat rule 31% (measured, private;
`docs/ACCURACY.md:14-19`). Nothing on the page, in the batch or in the offline tools asks for it. It is code
that three suites still exercise and two renderers still refuse or run.

**The lane and the panel were written before the queue.** On the queue a phrase can start early, and the ring
skips sound when more arrives than it holds. The lane shows neither as such, and the panel's status line still
counts "5.8 ms latency trims", an operation the engine does not have (read, W3-03; finding 10).

| What | Figure | Standing |
| --- | --- | --- |
| Skips on the page's own render of 18 s of talk in nine phrases, 300 frames a second | 21 skips, 234 ms in all; none at 66.67 frames a second | measured on the model (the planner's run, the report) |
| The same with jitter 50 | 13 skips, 298 ms | measured on the model |
| The lane's place for a played slot today | 6.5 ms early: the codec's 156 samples at 24 kHz, which belong to the sent log | read from the code |
| A take with other early starts than the render, lined up against a render on the queue | the kind of each change between phrases found in 176 of 176 (takes made from the model's renders at seeds 1 to 8; worst error of a change 50 ms) | measured on the model, by the rule of part e, point 6 |

## What is there today

Read from the code at `bc28875`. A builder checks each against the file before relying on it.

**The engine's flat rule.**

- `RETIME` and `retimeSpurts` are in `engine/network.js:37-84`, exported at `:316`. The rule has two forms: the
  frame path's, and the `steam` path's, which moves each spurt's laid samples whole from `info.spans`.
- `process()` reads `retime` (`engine/render.js:52`, on `AFTER_B_OPTIONS`, and so on `READ_OPTIONS`), makes the
  rule's own seed (`:625`), and calls the rule twice: on the `steam` path (`:670-678`) and on the frame path
  (`:683` copies the samples for it, `:691` calls it). The result is `codecInfo.retimed`.
  `previewAllowed` refuses it (`:308`). The option's documentation is at `:405` and `:419`; comments at `:45`,
  `:286`, `:303` and `:615` name it.
- `createRender` refuses `retime` with a `RangeError` (`engine/render-stream.js:199-204`; its comments at
  `:29` and `:150-151`).
- The game's timeline refuses `retime` (`engine/steam.js:101`, `:112`; the comment at `:93-96`). Both renderers
  pass it in (`engine/render.js:124`, `engine/render-stream.js:195`).
- `steamTimeline` keeps `spans`, each spurt's laid spans, for the rule alone (`engine/steam.js:394`, `:440`,
  `:482`, `:488`, `:520-521`; the comment at `:377`). `engine/render.js:676` is its only reader in the repository.
- `seedNumber` in `readOptions` (`engine/render.js:94`, `:137`) is read by the rule's seed alone.
- The live chain never read `retime` (`engine/live-chain.js` does not name it).
- The engine refuses no option it does not read. Such an option is in both stage keys as it is given
  (`engine/render.js:184-190`), which costs a reuse and never gives a stale render.

**The page's old name.** `voice_retime` in the console sets `voice_timeline` and says the flat rule is no longer
offered (`app/console.js:351-362`). `migrateTimelineConfig` reads an old saved `retime` (`app/console.js:1056-1066`).
Neither calls the engine's rule. `renderOptions()` sends no `retime` (held by `tests/browser.verify.js:2219-2227`).

**The suites that name the rule.**

| Suite | Where | What it holds |
| --- | --- | --- |
| `tests/verify.js` | section [10c], `:701-727`; the header at `:18-19` | the rule moves some spurts, repeatably, the same sound earlier; off by default |
| `tests/steam.verify.js` | `:425-470` | on the `steam` path a moved spurt is its laid samples whole |
| `tests/steam.verify.js` | `:956-987` | under loss the frame log moves with the samples |
| `tests/stages.verify.mjs` | `:115-117`, `:159`, `:174-175` | `retime` is one of the engine's own option names, changed alone in one case |
| `tests/stages.verify.mjs` | `:433-459` | re-timing in place and a caller's writes change nothing kept, on both paths |
| `tests/stages.verify.mjs` | `:521-525` | `previewAllowed` refuses `retime` |
| `tests/stages.verify.mjs` | `:391` | a recorded fuzz step's options hold `retime: true` among others; it asserts nothing of the rule |
| `tests/render-stream.verify.mjs` | `:1088-1096` | with a demo's voice and with the codec skipped `retime` is ignored, and the recorded render is given |
| `tests/render-stream.verify.mjs` | `:1241-1246` | `createRender` refuses `retime`, with a room and without |
| `tests/render-stream.verify.mjs` | `:156` | `retime: false` in the page's options of before W3-10; it asserts nothing of the rule |
| `tests/render-channel.verify.mjs` | `:331-333`, `:652` | a `'game'` render has no `retimed`; `'game'` with `retime` throws |
| `tests/browser.verify.js` | `:2170`, `:2219-2274`, `:2421-2458` | the page sends no `retime`; the old name and old saved settings |

No suite holds a recorded hash of a re-timed render: each of the checks above makes both renders and compares
them. `tests/retiming.mjs` has its own copy of the rule (`:130`, `:218`, `:252`) and imports nothing from the
engine but `demo.js`.

**What a render on the queue gives the page.** `codecInfo` of a render with `timeline: 'game'`
(`engine/render.js:460-469`, `engine/steam.js:255-273`, `voice-channel.js:300-319`):

| Member | What it holds | Standing |
| --- | --- | --- |
| `frameLog`, `frameBytes` | the frames as played. Slot `i` is 20 ms of the render, voice samples `882 i` to `882 i + 881` at 44.1 kHz, and holds the sent frame heard at the slot's centre, or 0 where nothing of the source plays there | read from the code; on the 18 s render it held in every slot the channel has (measured on the model) |
| `sent.frameLog`, `sent.frameBytes` | the sender's logs, as a render on the file's own timing has them | read |
| `channel.source` | per slot, the source position heard at its centre in samples at 44.1 kHz, or -1 | read |
| `channel.drops` | one `{ time, ms }` for each message that overflowed the ring: `time` the render's second at which the skip is heard, `ms` the sound skipped. Two drops can share a `time`. A drop whose `time` is at or past the source's end was never heard (`voice-channel.js:493`) | read; both cases seen on the model |
| `channel.spurts` | one per phrase of the sender: `start` and `end` in source seconds, `opened` (it opened the channel; else it joined a running one), `offsetStartMs` and `offsetEndMs` (how much later than the source it plays, negative when early), `droppedMs` | read |
| `channel.opens`, `appended`, `droppedSamples`, `waitTicks`, `fps`, `bufferMs` | the counts the console line prints (`app/render.js:530-535`) | read |
| `arrivals` (with jitter) | `{ jitterMs, fps, floorTicks, messages, meanMs, maxMs, sameTick }`: totals over the render. No time of any one message | read (`engine/steam.js:240-241`) |

The counters (`frames`, `gatedFrames`, `encodedBytes`, `lostFrames`) stay the sender's. `net_graph` reads only
those (`app/netgraph.js:25-38`) and needs no change.

**The lane already draws what plays.** Since W3-02c-2 `frameLog` is the played log, and the lane draws
`frameLog` (`app/visualizer.js:337-340`, `:878-916`). So on the queue a phrase that starts early is drawn early.
The sentences that say the lane "was made for the file's own timing" (`README.md:94`, `docs/ACCURACY.md:31`)
state more than is wrong with it. What is wrong: the lane places slot `f` at `(480 f - lookahead) / 24000`
(`app/visualizer.js:872-876`), right for a sent log and 6.5 ms early for a played one; it does not mark a skip;
its hover does not say which part of the source plays; its word for an empty slot is "not sent", and on the
queue an empty slot can also be the wait or a queue that ran out.

**The real-take panel.**

- The take is lined up against the render on screen when that render has no lost and no late frame
  (`renderGuide`, `app/realtake.js:53-57`; `locateTake`, `:61-77`), and again after each such render
  (`app/render.js:613-617`). With that render on the queue, each piece's delay is the take's time less the
  render's, not less the source's: an early start the render shares does not show as a step (measured on the
  model, the report).
- The phrases come from a 20 ms frame gate over the source (`takeTrackOptions`, `app/realtake.js:41-48`;
  `gateSpurts`, `reference.js:408-427`), not from Steam's sender. `tests/accuracy.mjs` calls the same function
  (`:110`, `:171`).
- The status line (`describeTiming`, `app/realtake.js:138-156`) counts steps within 0.8 ms of 5.8 ms as
  "latency trims" and calls every other step a "re-timing". `docs/PAGE.md:367` repeats it. The comment at
  `reference.js:451-455` and the one at `tests/reference.verify.mjs:170-173` state the 256-sample skip as fact.
- The report compares levels and bands over the whole overlap (`app/realtake.js:183-232`).

## Part W3-02f: the flat rule taken out of the engine

### What changes

1. **`engine/network.js`.** `RETIME`, `retimeSpurts` and their comment go, with the export. The file's header
   line and the block comment above no longer name the retiming.
2. **`engine/render.js`.** `retime` leaves `AFTER_B_OPTIONS`. The rule's seed, both calls, the copy of the
   samples made for it (`:683` becomes `samples = b.samples`), `codecInfo.retimed`, the test in `previewAllowed`
   and `seedNumber` go. `copyInfo(b.info)` at `:684` stays: a caller may write into a render's `codecInfo`. The
   comments that name re-timing (`:45`, `:286`, `:303`, `:405`, `:419`, `:615`) are brought up to date.
3. **`engine/render-stream.js`.** The refusal at `:199-204`, the sentence at `:150-151` and the clause at `:29`
   go.
4. **`engine/steam.js`.** `steamGameTimeline` loses its `retime` member and its refusal, and both callers stop
   passing it. `spans` goes from `steamTimeline` with its member `spans()` (ruling 4): nothing else reads it.
5. **`audio.js:42`.** The header's line for `engine/network.js`.
6. **After this the engine does not read `opts.retime`.** It is treated as any name the engine does not read:
   ignored, and held in both stage keys as given (ruling 3). A render given `retime: true` is the render without
   it.
7. **`reference.js:451-455`, the comment only.** It says the receiver "trims buffered latency in 256-sample
   (5.8 ms) skips". It is corrected to what was read: one sample dropped from every packet and the ring's
   overflow, any size, with no 256-sample step (finding 10). No statement of code changes. It is done in this
   part so that one note in `tests/predictions/PREDICTIONS.md` covers every hashed file of this order and part e
   touches none.
8. **The page is not touched.** `voice_retime` and `migrateTimelineConfig` stay as they are (ruling 2): they are
   the page's, they set `voice_timeline`, and their words ("no longer offered") stay true.

### The tests

Every fix comes with a test that fails without it. For a removal that test is: the option no longer does
anything.

1. **`tests/verify.js`, section [10c], rewritten under its label** ("`opts.retime` is no longer read"). On the
   section's own source (eight noise bursts, `:703-709`) and seed 3:
   - on `steam`, and on `celt_22` with `gate: true`, `process()` with `retime: true` gives the WAV bytes and the
     `codecInfo` of `process()` without it, and neither `codecInfo` has a member `retimed`;
   - `createRender` with `retime: true` does not throw and gives the same bytes, on both codecs.
   On `main` the first fails on both codecs (the rule moves three spurts on this source on each, measured in
   the planner's run) and the second throws. The header's line `:18-19` follows.
2. **`tests/steam.verify.js`.** The two blocks at `:425-470` and `:956-987` go. Nothing else in the file changes.
3. **`tests/stages.verify.mjs`.** `retime` leaves `ENGINE_OPTION_NAMES` and its case leaves
   `ENGINE_OPTION_CASES` (`:159`, `:174-175`; the comment at `:115-117`). The block at `:433-459` keeps what
   it holds about a caller's writes on both paths (the writes into `frameLog`, `frameBytes`, `modes` and
   `sender.spurts`, the render after them equal to a fresh one, B taken twice) and loses the re-timed renders.
   `{ retime: true }` leaves the list at `:521`, the check's name and the `change.retime` test at `:525`
   follow, and the same check gains one term: `previewAllowed` allows `{ ...SOURCE_BASE, retime: true }`. One
   check is added to the block at `:433-459`: a render with `retime: true` made from warm stages of the same
   source is a fresh render's WAV and `codecInfo`, and the render without it. The fuzz step at `:391` is a
   record and stays as it is.
4. **`tests/render-stream.verify.mjs`.** The refusal check at `:1241-1246` goes (its comment too). The two
   cases at `:1088-1096` stay and pass as they are; their name says "which process() ignores there", which is
   now true everywhere, so the name loses "there". `:156` stays.
5. **`tests/render-channel.verify.mjs`.** The row `'retime on'` leaves section 8's refusals (`:652`). One check
   is added in its place: `timeline: 'game'` with `retime: true` gives the `'game'` render's WAV and `codecInfo`
   from `process()` and from `createRender()`. `:331-333` keeps its assertion.
6. **`tests/browser.verify.js` is not touched** and passes: the page never sent the option to the rule.
7. **`tests/retiming.mjs`: its code is not touched.** It keeps its own copy of the rule for scoring. One
   sentence of its header (`:19-21`) calls the rule "the app's current rule"; it becomes "the flat rule the app
   ran until W3-02f, kept here as a copy".

### The documents

- `README.md:161`, the files table's row for `engine/network.js`: without "the retiming".
- `docs/ACCURACY.md:18`: the row's name says the engine no longer has the rule and that `tests/retiming.mjs`
  scores its own copy.
- `docs/VOICE-PATH.md:80`: one clause, that the engine no longer has the rule.
- `tests/REFERENCE_2026.md`: three statements are marked where they stand, not deleted, each with
  "*Corrected by W3-02f (date): the flat rule is no longer in the engine; `tests/retiming.mjs` keeps a copy for
  scoring.*": the paragraph "This flat rule is what the app runs today when the option is on" (`:1036`; `:1078`
  at `a93ec66`), the table row "Voice channel" (`:1500`; `:1542`), and "Talk-spurt timing" (`:1601-1602`;
  `:1643-1644`). No figure and no finding changes.
- `tests/predictions/PREDICTIONS.md`: one paragraph after the last "Changed after registration" (BC-4a's,
  `:196`), in
  the form of the ones before it: which hashed files changed (`engine/network.js`, `engine/render.js`,
  `engine/render-stream.js`, `engine/steam.js`, and `audio.js` and `reference.js` in comments only), that no
  prediction's options hold `retime` (`tests/predictions/plan.json` does not name it), and so no prediction's
  render changes. `tests/predictions/predictions.json` is never edited.
- The report says that W2-04's point 2 (streaming the flat rule) is void, for the orchestrator to note in
  PROGRESS.

### Files

May touch: `engine/network.js`, `engine/render.js`, `engine/render-stream.js`, `engine/steam.js`
(`steamGameTimeline`, its comment, and `spans` in `steamTimeline` only); `audio.js` (the header's line);
`reference.js` (the comment at `:451-455` only); `tests/verify.js` (section [10c] and the header's line),
`tests/steam.verify.js` (the two blocks), `tests/stages.verify.mjs`, `tests/render-stream.verify.mjs`,
`tests/render-channel.verify.mjs` (each only as "The tests" says); `tests/retiming.mjs` (the header's sentence);
the documents above; the report. `sw.js`: never the number.

May not touch: anything under `app/`; `index.html`, `live.js`, `batch.js`, `audio-worker.js`,
`live-worker.js`; `engine/live-chain.js`, `engine/mix.js`, `engine/gain.js`, `engine/room.js`, `engine/dsp.js`,
`engine/codec.js`; `voice-channel.js`, `steam-sender.js`, `constants.js`, any codec module;
`tests/browser.verify.js`, `tests/accuracy.mjs`; `tests/predictions/predictions.json`; `docs/PROGRESS.json`,
`docs/README.md`, `CLAUDE.md`.

### What must not move

- Every recorded hash, reference and tolerance of every suite. `git diff origin/main -- tests/` shows the
  removed and rewritten checks named above and no changed recorded value.
- Every render not given `retime: true`: the recorded renders of `tests/render-stream.verify.mjs` and the same
  made again from stages in `tests/stages.verify.mjs` pass untouched.
- The live chain: `tests/steam.verify.js` [10b] and `tests/output-stage.verify.mjs` [14] pass untouched.
- The page: `git diff origin/main --stat -- app index.html live.js batch.js audio-worker.js live-worker.js` is
  empty.
- `tests/retiming.mjs`'s code: `git diff origin/main -- tests/retiming.mjs` shows the comment's sentence only.

### Done means

1. `grep -rniE "re-?tim" engine audio.js` prints nothing. `grep -n "spans" engine/steam.js engine/render.js`
   prints nothing. `grep -rn "seedNumber" engine` prints nothing.
2. `node tests/run.mjs verify render-channel` passes, with the new checks of "The tests", 1 and 5.
3. `flock /tmp/tf2ve-heavy.lock node tests/run.mjs steam stages render-stream` passes.
4. `flock /tmp/tf2ve-heavy.lock pnpm test` passes.
5. The browser suite passes untouched:
   `CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) flock /tmp/tf2ve-heavy.lock pnpm test:browser`.
6. CI's `verify` on the branch's head is success (read the run, its conclusion and its head SHA).
7. The report: each break below with the check that failed; the lines of "What is there today" that were not as
   written; what was not done.

### The breaks the builder makes

Each is made, seen to fail the named check, and undone.

| Break | The check that must fail |
| --- | --- |
| the frame path's call is put back (`codecInfo.retimed = retimeSpurts(...)` with the function restored) | `tests/verify.js` [10c], `celt_22` |
| the `steam` path's call is put back | `tests/verify.js` [10c], `steam` |
| `createRender`'s refusal is put back | `tests/verify.js` [10c], the stream |
| `steamGameTimeline`'s refusal is put back | `tests/render-channel.verify.mjs`, the new check |
| `retime` is put back on `AFTER_B_OPTIONS` | `tests/stages.verify.mjs`, the check that every name the lists hold is the page's or the engine's own |
| `previewAllowed` refuses `retime` again | `tests/stages.verify.mjs`, the check that `previewAllowed` allows nothing else, by its new term |
| the stage keys leave out a name the engine does not read (a break of `keysOf`, `engine/render.js:184-190`, made to show the new check has teeth) | `tests/stages.verify.mjs`, the new check from warm stages |

### Stop and ask

- A recorded hash, reference or tolerance would have to change.
- A check fails that "What is there today" does not list. The planner's trial removal (the report) found
  none; a difference means `main` moved.
- Something outside the list reads `spans`, `seedNumber`, `retimeSpurts` or `codecInfo.retimed`.
- `tests/predictions/PREDICTIONS.md`, "Results", shows a predicted take scored. The note's words "before any
  predicted take existed" would then be false.
- W3-02c-3a has been merged before this part starts. `engine/live-chain.js` then calls `steamGameTimeline`,
  and that file is not on this part's list.
- The work passes 3 hours.

### What the reviewer attacks

A render given `retime: true`, `retime: 1` and `retime: 'x'` on every codec in the menu (the two that were never
in TF2 included, `steam_48` and `miles`), in `process()`, in `createRender()` and in the live chain: each is the
render without it. The stage keys with `retime` as a name the engine does not read: first with it, then without,
with warm stages. The page: `voice_retime 1`, a share link with `retime=1`, a user preset saved with `retime`,
the batch. Anything left that only the rule used. Each new check gutted a few ways. The marks in
`tests/REFERENCE_2026.md`: nothing deleted, no figure changed.

## Part W3-02e: the lane and the real-take panel on the game's queue

Everything below applies to a render whose `codecInfo.channel` holds `source`, the played log's map, called
here "a render on the queue". The test is `source`, not `channel` alone: W3-02c-3b (not built yet) gives a
recorded live take a `channel` of counts while its frame log stays the sender's. For
any other render (the file's own timing, a demo's voice, the other codecs, a live take) the lane, its hover, its
legend and the panel's alignment stay as they are today, pixel for pixel and character for character, except
the status line's words (point 5).

### What changes

1. **The lane's place for a played slot.** For a render on the queue, slot `f` covers the render's seconds
   `0.02 f` to `0.02 (f + 1)`: `frameAt` and `frameStart` (`app/visualizer.js:872-876`) take the look-ahead as 0
   there. For every other render they stay as they are.
2. **A mark for each skip.** After the frames, the lane draws one vertical line for each entry of
   `channel.drops` whose `time` is before the source's end: 1 CSS pixel wide, the lane's whole height, in a
   colour of its own that none of `FRAME_STYLE` uses (a constant, `LANE_SKIP_COLOR`; white unless it reads badly
   on a frame colour), at the pixel of its `time`. Entries at one pixel draw once. An entry at or past the
   source's end gets no mark and is left out of the legend's count. The source's end is the source's duration,
   not the render's: a render with a room is longer by the room's tail.
3. **The hover on the lane.** Its text comes from one function, `laneHoverText(info, t, halfPixel)`, which the
   drawing calls and the browser suite can call (`halfPixel` is half a pixel's width in seconds). For a render
   on the queue it gives, in this order:
   - the time, the kind of frame, and the packet's bytes and rate as today;
   - `frame k`, the sent frame's own number, `k = floor((source[f] × sampleRate / voiceRate + lookahead) /
     frameSamples)`, the rule `engine/steam.js:255-273` states, so the same sound has the same number on either
     timing. An empty slot has no number;
   - where `channel.source[f]` is not -1: `the source's S s, M ms early` (or `late`, or `on time` under 0.5 ms),
     with `M = (882 f + 441 - source[f]) / 44.1`;
   - `opened the queue` or `joined the queue`, from the phrase of `channel.spurts` whose `start` to `end` holds
     that source second, when one does;
   - where one or more marks lie within `halfPixel` of `t`: `queue overflow: N ms skipped`, their `ms` summed,
     with `(n skips)` when more than one.
   For every other render the function gives today's text, character for character.
4. **The words for an empty slot and the legend.** For a render on the queue, code 0 reads `silence` in the
   hover and the legend, with the title "nothing of the source plays here: the gate was closed, the queue was
   waiting, or it had run out". The legend's heading keeps "Codec" and its title says the lane shows what plays
   in each 20 ms of the render. After the kinds of frame the legend has one item more when there is a heard
   skip: the mark's colour, `skips N · M ms`, with the title "The game's voice queue holds half a second of
   sound. When more arrives than fits, the oldest is dropped and the voice jumps ahead (read; findings 22 and
   23). Each mark is one skip." The legend's cache key (`app/visualizer.js:1445`) already changes with the
   render.
5. **The status line's words** (`describeTiming`, `app/realtake.js:138-156`), for every render:
   - the count of "5.8 ms latency trims" goes, and with it the constant `256 / 44100`;
   - steps are counted as what they are: `B changes between phrases, W within a phrase` (a change is between
     phrases when the two pieces have different `spurt`);
   - the bracket says what the delay is measured against: `take minus render` when the take was lined up against
     a render (`timeline.guided`), `take minus source` otherwise; the trailing ", lined up against the render"
     goes, since the bracket says it;
   - "talk spurt" becomes "phrase", the page's word since W3-02d-1.
   One piece: `delay +1.234 s (take minus render), clock +403 ppm, correlation 0.77.` More:
   `12 phrases in 14 pieces, delay +1.201 s to +1.552 s (take minus render; 11 changes between phrases, 2 within
   a phrase), clock +403 ppm, correlation 0.77.` The comment above the function says what the engine does: one
   sample dropped from every packet and the ring's overflow (finding 10).
6. **Which phrases start early, the take's beside the render's.** A function `phraseChanges(timeline,
   guideSpurts, renderSpurts)` in `app/realtake.js` gives one entry for each pair of consecutive pieces of
   `timeline.segments` with different `spurt`:
   - `at`: the later piece's `start`, in seconds;
   - `stepMs`: the later piece's `delayMs` less the earlier one's;
   - `guideMs`: `changeAt(guideSpurts, at)` when the take was lined up against a render, else 0;
   - `takeMs = stepMs + guideMs`: the take's own change against the source;
   - `renderMs`: `changeAt(renderSpurts, at)`;
   - `takeKind`, `renderKind`: `early` at -80 ms or less, `late` at +80 ms or more, else `kept` (the limits of
     `tests/retiming.mjs:51`; chosen).
   `changeAt(spurts, at)`: `null` when `spurts` is `null` (the render was not on the queue). Otherwise take the
   pause between two consecutive phrases of `spurts` whose middle, `(end of the earlier + start of the later) /
   2`, is nearest `at`. If it is within 0.2 s of `at`, the change is the later phrase's `offsetStartMs` less the
   earlier one's `offsetEndMs` (`null` if either is `null`). If none is, the sender did not end a phrase there
   and the change is 0.
   - `guideSpurts` is `channel.spurts` of the render the take was lined up against, kept on `state.realTake`
     when the take is aligned (`renderGuide` hands it on; it is not sent to the worker's `track()`), or `null`.
     It can differ from the render on screen: a render with loss does not line the take up again
     (`app/render.js:613-617`).
   - `renderSpurts` is `state.lastCodecInfo.channel.spurts` of the render on screen, or `null` when that render
     has no `channel` or its `channel` has no `spurts`.
7. **What the panel prints from it.** `updateReferenceReport` (`app/realtake.js:183-232`) adds, after the lines
   it has, when there is at least one change:
   - with a render on the queue on screen: `Phrase starts: at N changes from one phrase to the next the take
     starts early (by 80 ms or more) at T and the render at R; they are of one kind (early, kept or late) at G
     of N.`
   - with any other render on screen: `Phrase starts: at N changes from one phrase to the next the take starts
     early (by 80 ms or more) at T. This render keeps the file's own timing and starts none early.`
   - then one line of the changes themselves, the first 30: `Take | render, ms: 9.11 s -294 | -299; 10.91 s
     +289 | +315; …`, with `and K more` past 30, and `—` where a figure is `null`.
   A source with one phrase (music that keeps the gate open) has no change and prints nothing more than today.
8. **What does not change in the panel.** The take is lined up against the render on screen as today, on
   whichever timing that render has (ruling 5): Hear then switches between the render and the take phrase by
   phrase in step, and the bands and levels compare like with like. The phrases still come from the 20 ms frame
   gate (`takeTrackOptions`), which `tests/accuracy.mjs` shares. `reference.js` is not touched.
9. **No mark for jitter's bunches** (ruling 7). `codecInfo.arrivals` holds totals and no time of any message.
   What a bunch does to the sound is a skip, which is marked, or a late start, which the hover gives. A mark for
   each message's arrival is not built.

### The documents

- `docs/PAGE.md:306-314` (the codec lane): on a render on the queue the lane shows what plays in each 20 ms of
  the render; the marks; the hover's parts; `silence`. `:343-367` (lining a take up): the delay is against the
  render the take was lined up with; the status line's new words; the sentence on phrase starts, how a change's
  kind is decided, and its limits (below).
- `README.md:94` and `docs/ACCURACY.md:31`: the sentence "were made for the file's own timing … not built yet"
  gives way to what is not exact now, each with its standing: the take's phrases come from a 20 ms frame gate,
  a fit, not from Steam's sender; 80 ms is chosen; the count of phrase starts was checked on takes made from the
  model's own renders and not on a recording (measured on the model); against a render on the queue the take's
  clock reads near 0 parts in a million in place of about +400, because that render drops the one sample from
  every packet too (inferred from the rule; not measured on a take).
- `tests/reference.verify.mjs:170-173`, the comment only: it states the 5.8 ms skip as the game's. The check
  under it is of a step of that size in a made take and stays as it is; the comment says so.
- `docs/ACCURACY.md:158` ("5.8 ms steps … the engine as read has no such operation") stays: it describes a
  column of the private table, which `tests/accuracy.mjs:259-275` still counts (ruling 6).

### Files

May touch: `app/visualizer.js` (the lane, its hover, the legend); `app/realtake.js`; `style.css` (the legend's
new item, only if it needs a rule); `tests/browser.verify.js` (new checks; no recorded value changed);
`tests/reference.verify.mjs` (the comment at `:170-173` only); `docs/PAGE.md`, `README.md:94`,
`docs/ACCURACY.md:31`; the report. `sw.js`: never the number.

May not touch: anything under `engine/`; `audio.js`, `audio-worker.js`, `live-worker.js`, `live.js`,
`voice-channel.js`, `steam-sender.js`, `reference.js`, `constants.js`, any codec module; `app/render.js`,
`app/console.js`, `app/core.js`, `app/netgraph.js`, `app/source.js`, `app/meter.js`; `index.html`;
`tests/accuracy.mjs`, `tests/retiming.mjs`, every Node suite but the one comment;
`tests/REFERENCE_2026.md`, `tests/predictions/`; `docs/PROGRESS.json`, `docs/README.md`, `CLAUDE.md`.

### What must not move

- Every render: `git diff origin/main --stat -- engine audio.js audio-worker.js live-worker.js voice-channel.js
  reference.js` is empty.
- No recorded value of any suite. `git diff origin/main --stat -- tests/` shows `tests/browser.verify.js` and
  the one comment.
- The lane, the hover and the legend of a render that is not on the queue: the existing checks of
  [Browser 3d] (`tests/browser.verify.js:490-524`), the demo's (`:731`, `:757-759`), Speex's (`:791`, `:830`),
  `miles`'s (not in TF2; `:927`) and the live take's (`:1147-1153`) pass untouched.
- The alignment: `state.realTake.timeline` for a given take and render is what `main` gives. The existing take
  checks (`:392-404`, `:630-662`) pass untouched.
- What `tests/accuracy.mjs` reads from the page: `renderOptions`, `takeChannel`, `takeTrackOptions` keep their
  names, arguments and results.

### Done means

New checks in the browser suite, in a section of their own. Each fails when its part is broken (the breaks
below). The source for them is talk with pauses near one second, where the queue at 300 frames a second runs
out for some draws of the sender's clock and not for others. The planner's signal (the report gives the
generator: twelve phrases of 0.8 to 2 s with pauses of 0.95, 1.0, 1.05, 0.9, 1.1, 0.6, 1.0, 0.97, 1.02, 0.92
and 1.4 s, 30 s at 48 kHz) gave, measured on the model in Node: at the engine's own seed phrases 5 and 11
early by 303 and 321 ms, and at seed 1 phrases 5, 9 and 11. In the browser the source passes through a 16-bit
WAV, so the builder measures again and, if the draws differ, picks the seed by a search written into the
check.

1. **The lane's place.** After a render on the queue, `frameStart(info, f)` is `0.02 f` for a played slot, and
   `frameAt(info, 0.02 f + 0.01)` is `f`. After a render on the file's own timing both are today's values.
2. **Marks.** After the page's render of the source at its defaults, the lane's pixels (the suite's
   `lanePixels`, `:501-510`) hold `LANE_SKIP_COLOR` at the pixel of every heard entry of `channel.drops` in view
   and at no pixel more than one away from one; zoomed into the first second there is at least one. With
   `voice_timeline source` no pixel has the colour. A drop past the
   source's end, made with a source that ends in sound (a 1 s tone gave one at 1.0217 s, measured on the
   model), draws nothing, with a room on (the render is then longer than the source).
3. **The hover.** `laneHoverText` on the first slot of a phrase that joined the queue names the source's second
   `channel.source[f] / 44100`, an `early` figure within 1 ms of `(882 f + 441 - source[f]) / 44.1`, the sent
   frame's number by the rule, and `joined the queue`; on a slot at a mark it gives the `ms` of the entries
   there, summed; on an empty slot it says `silence` and no frame number. On a render on the file's own timing
   it is today's text for the same slot (the check holds the text `main` gives).
4. **The legend.** `skips N · M ms` with N and M the heard entries' count and sum; absent with none; `silence`
   in place of `not sent` on the queue only.
5. **The status line.** For a take lined up against a render its text holds `take minus render`, the two
   counts of changes, `phrase` and no `5.8`, `trim` or `re-timing`. For a take lined up with no render to guide
   it (loaded after a render with loss) it holds `take minus source`.
6. **Phrase starts.** A take made in the page from `TF2Audio.process` of the source with `renderOptions()` and
   another seed, delayed 0.25 s and at half level (the form of `:394-397`), is loaded against the page's
   render. With `X` the take's render's `channel.spurts` and `Y` the page's:
   - for every entry of `phraseChanges(...)`, `takeKind` is the kind of `changeAt(X, at)` and `renderKind` the
     kind of `changeAt(Y, at)`, and `takeMs` is within 60 ms of `changeAt(X, at)` (the planner's worst was 50);
   - at least one entry has `takeKind` early and `renderKind` kept, or the other way round (else the seeds were
     badly chosen);
   - `changeAt` called with lists made by hand: `null` gives `null`; a list with no pause within 0.2 s of `at`
     gives 0; of two pauses the nearer is taken; a `null` offset gives `null`;
   - the sentence's T, R, G and N are those counts, and the line of changes holds each `at`;
   - with `voice_timeline source` rendered after, the take is lined up again, `guideSpurts` is `null`, every
     `takeKind` is still the kind of `changeAt(X, at)`, and the sentence is the second form.
7. `git diff origin/main --stat` shows only files of "May touch".
8. `flock /tmp/tf2ve-heavy.lock pnpm test` passes, untouched.
9. The browser suite passes:
   `CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) flock /tmp/tf2ve-heavy.lock pnpm test:browser`.
10. CI's `verify` on the branch's head is success.
11. The report: a picture of the lane with a mark and of the panel with the sentence, at desktop and phone
    width; each break with the check that failed; the seeds used and what each render's phrases did; what was
    not done.

### The breaks the builder makes

| Break | The check that must fail |
| --- | --- |
| the played slot keeps the look-ahead | 1 |
| the look-ahead is dropped for every render | 1, its second half |
| a drop past the source's end is drawn | 2, the tone with a room |
| no mark is drawn, or each mark is drawn one slot late | 2 |
| the hover's `early` figure made from the slot's start, not its centre | 3 |
| the hover's skip text takes one entry where two share a pixel | 3 |
| `silence` on every render | 4 |
| the status line always says `take minus source` | 5 |
| `takeMs` without `guideMs` | 6, first point (a phrase the render and the take both start early reads `kept`) |
| `guideMs` taken from the render on screen, not from the render the take was lined up with | 6, a case the builder adds: a render with loss made after the alignment, on another frame rate |
| `changeAt` without the 0.2 s limit | 6, the lists made by hand |

### Stop and ask

- The lane, the hover or the panel needs a member `codecInfo` does not have, so that a file under `engine/` or
  `voice-channel.js` would have to change.
- On the builder's source `track()` puts a piece's delay more than 80 ms from the truth, so that a kind is
  wrong. The planner's run had none in 176; a wrong kind means the method does not hold in the browser and the
  order needs another look, not a wider tolerance.
- An existing browser check stops passing.
- Lining the take up against a render on the queue makes the report's band or level figures plainly worse than
  against the file's own timing on the builder's take (the planner's run: level 0.8 to 1.1 dB rms against 0.5 to
  1.3, measured on the model).
- The work passes 8 hours.

### What the reviewer attacks

A render on the queue with a room, under water, with loss, with jitter, at 67 and at 300 frames a second, a
half-second source, a source of one phrase: the marks, the hover at the first and the last slot, the legend. A
render that is not on the queue: every codec in the menu (the two that were never in TF2 included, `steam_48`
and `miles`), a demo, a live take, the codec skipped: pixel and text as on `main`. Zoomed far out (several marks
a pixel) and far in (a slot wider than the view). A take loaded before any render, after a render with loss,
with the render changed under it (frame rate, timing, codec), removed and loaded again. `phraseChanges` with
`null` offsets, with one phrase, with a take shorter than the source. Every figure in the new words against its
standing. Each new check gutted a few ways.

## The order of the parts

- **W3-02f first, and before W3-02c-3a.** It is the smaller and W3-02g waits for it. It shares four files
  with W3-02c-3a ([its order](W3-02c3-live-channel.md), "Files" of part a): `engine/network.js`,
  `engine/steam.js`, `tests/render-channel.verify.mjs` and `tests/predictions/PREDICTIONS.md`. The two are never
  built side by side. W3-02c-3a's item 4 has the chain refuse `'game'` with `retime` "as a render does"; after
  part f no render refuses it and the chain ignores it too (ruling 9). If W3-02c-3a is merged first, part f
  stops and asks, as its list says.
- **W3-02e does not wait for W3-02f.** They share no code file and no test file; in `README.md` and
  `docs/ACCURACY.md` they change different lines. They may be built side by side when a builder is free
  (`docs/PIPELINE.md`: at most two builds at once). W3-02e shares no file with W3-02c-3a either.
- **W3-02e is not built beside W3-02c-3b.** Both add checks to `tests/browser.verify.js` and both change
  `docs/PAGE.md`, `README.md` and `docs/ACCURACY.md`. Whichever starts second starts from `main` with the other
  merged, and its builder reads the merged files first.
- **A live take.** Today a recorded live take has no `channel` (`app/render.js:753-771`). W3-02c-3b (not built
  yet) gives a take made on the queue `codecInfo.channel` with the counts, and says its lane stays the sender's
  frames on the file's own timing. Part e's test for a render on the queue is `channel.source`, so such a take
  keeps today's lane, hover and legend whichever part is merged first. The builder of the later part adds the
  check that holds it: a live take with a `channel` and no `source` draws no mark and reads `not sent`.

## Rulings wanted before the build

Each with the planner's recommendation.

1. **No second reader for part f.** Recommended. The diff under `engine/` is deletions; the recorded hashes of
   two suites say whether any render moved; the orchestrator reads the diff it merges.
2. **The console's `voice_retime` and the reading of an old saved `retime` stay.** Recommended. They are the
   page's, they never called the engine's rule, and old share links keep working.
3. **After part f the engine ignores `opts.retime` as any name it does not read.** Recommended over a
   `RangeError` by name: the engine refuses no name it does not read, and a refusal kept for one retired name
   would have to be kept for good.
4. **`spans` goes from `steamTimeline` with the rule.** Recommended. The rule was its only reader. If the
   orchestrator would rather not have `steamTimeline` touched while W3-02c-3 is planned against the same file,
   part f leaves it and the report names it as dead code.
5. **The panel keeps lining a take up against the render on screen, on the queue too, and keeps the frame gate's
   phrases.** Recommended. The first keeps Hear in step phrase by phrase; the second keeps the page and
   `tests/accuracy.mjs` on one method (W3-11's decision 9). The deferred finding "the real-take check's spurts
   still come from the old 20 ms frame gate" stays deferred: moving it changes what the private table measures
   and needs the takes to judge.
6. **`tests/accuracy.mjs` keeps its "5.8 ms steps" count** and `docs/ACCURACY.md` its column. Recommended. The
   table is dated and the document already says the engine has no such operation. Only the page's words change.
7. **No mark for jitter's bunches.** Recommended, for the reason in part e, point 9.
8. **`reference.js`'s comment is corrected in part f**, so that part e touches no hashed file. Recommended.
9. **Part f is built and merged before W3-02c-3a, and W3-02c-3a's item 4 loses the word `retime`.** Recommended.
   After part f `steamGameTimeline` has no such refusal to hand on, and the two parts share four files. The
   other way round costs part f a file outside its list (`engine/live-chain.js`).

The private looks are in the planning report, under "For the orchestrator's private look".
