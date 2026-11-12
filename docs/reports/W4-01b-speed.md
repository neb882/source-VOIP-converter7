# W4-01b: the render's speed with the same samples

The builder's report. The order is `docs/work-orders/W4-01-page.md`, section W4-01b with the order's top sections and
the owner's answers (step 3 is built), with the eight amendments of the orchestrator's plan review of 2026-11-11, which
win where they differ. Branch `claude/w4-01b-speed`, from `8035cfa` (main, cache v34), in three commits (steps 1, 2
and 3) and this report, then a fix round: the memory ruling, the two readers' findings, and main merged ("Fix round
1").

**Status:** built, and fixed after review. The build stopped at one of the order's stop-and-ask conditions, memory:
for a 9.8-minute source the browser's peak over the idle page is 2050 MB against 1592 MB on main (+29%, the order's
limit is a tenth). **The orchestrator ruled on 2026-11-12: accepted for this order** ("Memory" keeps the figures; a
way back, should long clips strain a browser, is to hand the stages to a new worker after a long render). The fix
round then took the first reader's six findings and the second reader's six items ("Fix round 1"): among them
`process()` now reads every option once, at the call, and keys the stages by what it uses. Everything holds: no golden
hash moved and none was re-recorded (`tests/render-stream.verify.mjs` is not touched and passes), the new
`tests/stages.verify.mjs` gives every one of its 76 recorded renders again from warm stages, every check the order,
the amendments and the two readers name passes, and every new check was shown to fail with the code it covers broken
(41 breaks in the build, 19 in the fix round). CI passed on the code's head (`c635b4f`, run 43163376113).

## Summary

- **Step 1, the worker.** `app/render.js` keeps one worker for the page's renders, the download formats, the meter
  and the real take's jobs, one job at a time. A render waits for it (its stages are there), before any other job
  waiting; another job waits too while it renders, and goes to a worker of its own, as before, while it runs a job
  that is not a render. Cancel asks the worker to stop: the render ends at its next yield with an AbortError
  (`process()`'s new `opts.signal`) and the worker is kept; one still busy after the bound (500 ms and 15 ms a second
  of source) is ended and the next job starts a new one. In a worker, `microYield` is a MessageChannel turn (no 4 ms
  clamp; a cancel still gets in): it costs 1.0% of a 60 s render against a resolved promise, so it yields at every
  call. The worker posts the result, then the meter as a message of its own; the page fills the table when that
  comes, for the render it belongs to. The `steam` render reports progress once per 64 messages from 60 to 72%.
- **Step 2, the stages.** `process()` takes `opts.stages` and `opts.sourceKey` and keeps A (the capture at the
  codec's rate) and B (the codec stage's result). The keys are safe by default (an unlisted option is in both), keyed
  by a serialisation that keeps NaN, -0, undefined, typed arrays, holes and nested objects apart, and a function-valued
  option that is not one of the three observers keeps and takes nothing. `process()` reads every option once, at the
  call (`readOptions`, since the fix round), and the keys hold each option as the stages use it; the two lists say
  where each is first used, so they can be checked against the code (the lists, with the line of first use, are
  below).
  The page sends its source once per source and capture channel; the worker holds it and its stages.
- **Step 3, the first seconds.** A source longer than 30 s, at the settings `TF2Audio.previewAllowed()` allows, first
  gets a render of its first 15 s; the player is given its first 14 s ("The first 14 s; the rest is rendering…" under
  the player) while the whole render runs, which then takes the player's place at its position and play state. The
  downloads, the views and the table wait. Two independent renders, the whole one from the start (the simple form);
  none when the stages hold B. The equality holds for all six profiles on three seeded clips and every allowed
  setting, sample for sample; nothing beyond the order's list had to be excluded.
- **Times** (median of three, this machine, the browser suite's Chromium): see "Times". A re-render with `voice_scale`
  changed takes about a third of a first render; one with Packets lost % changed about 55 to 70%; the first sound of
  a 5-minute source comes in about 1 s instead of about 17.
- **Memory: the stop-and-ask was met, and the figure is accepted** (the orchestrator, 2026-11-12). 9.8 minutes: 2050
  MB over the idle page against 1592 MB on main (+29%), most of it the kept worker's garbage, not the stages; 2032 MB
  (+28%) after the fix round, which keeps `steam`'s B without the messages' samples ("Memory").
- **The browser suite:** 374 checks on main (`8035cfa`), 386 after step 1, 392 after step 2, 401 at step 3,
  **409** after the fix round. `tests/stages.verify.mjs`: 297 checks at step 3, **331** after the fix
  round.

## Commits

| Commit | What |
| --- | --- |
| `bcfeaaa` | step 1: `audio.js` (`microYield`, `opts.signal`, the progress line), `audio-worker.js` (cancel, the meter after the result, `done`), `app/render.js` (the kept worker), `sw.js` v35, `tests/browser.verify.js`, `tests/predictions/PREDICTIONS.md` |
| `c76af7e` | step 2: `audio.js` (the two places, the keys, the reads moved to their first use), `audio-worker.js` (the held source and its stages), `app/render.js` (the source message, non-render jobs while the worker is busy), `tests/stages.verify.mjs` (new), `package.json` (in `pnpm test`), `tests/browser.verify.js`, `README.md`, `PREDICTIONS.md` |
| `c74d976` | step 3: `audio.js` (`previewAllowed`), `audio-worker.js` (the first seconds), `app/render.js` (the preview in the player, the cancel bound by length), `app/core.js` (`state.preview`), `tests/stages.verify.mjs` (section 4), `tests/browser.verify.js`, `README.md`, `PREDICTIONS.md` |
| `f32ec08` | this report, and the order's memory stop-and-ask |
| `a1984d5` | main merged (`9e0abd0`) |
| `3a37326` | main merged (`e3dacb7`) |
| `99fd5d0` | the first reader's findings: `tests/stages.verify.mjs` (every option read changed alone), `tests/browser.verify.js` (five new parts, `speedCancel` and W4-01a's check repaired), `app/render.js` (a cancelled waiting render taken out of the queue; `exportWav`'s `own`), `batch.js` (its files in workers of its own) |
| `c635b4f` | the second reader's items: `audio.js` (`readOptions`, the keys of what is used, `stagePlan`'s checks, `steam`'s B without the messages' samples, the observers' sentence), `tests/stages.verify.mjs` (section 3's new checks) |
| (after `c635b4f`) | `README.md` (step 3), `docs/PAGE.md`, `tests/README.md`, the order's ruling note, this report |

`index.html` and `style.css` are not touched: the preview's mark is W4-01a's status line under the player.

## Fix round 1 (2026-11-12)

The orchestrator's ruling on the memory stop-and-ask, the first reader's findings (F1 to F5 and B8), the second
reader's (1 to 6), and main merged (`e3dacb7`). Every new check was run against the break named beside it, in a copy
of the tree, and failed there; none of the breaks is left in the code.

### The memory ruling

"Ruled 2026-11-12 by the orchestrator: accepted for this order (the figures, docs/reports/W4-01b-speed.md); a way
back, should long clips strain a browser, is to hand the stages to a new worker after a long render." The order
carries this note at its memory stop-and-ask. No code was changed for it. "Memory" keeps the figures as measured; the
one change to what is held since then is the second reader's item 4 below, measured there again.

### The first reader

| Finding | What changed | The check | The break, and what fails |
| --- | --- | --- | --- |
| F1: section 2 could not catch `frameMs` or `seed` on the wrong list | `tests/stages.verify.mjs` changes every option `process()` reads alone: `frameMs` alone on `steam` and `celt_22` and on a base with jitter 50 ms, the seed on a base with loss 15%, the codec on a base without Steam's uptime, the older room options (`dspRoom`, `listenerPos`, `customEnv`), `swrKernel` and a demo's voice (`received`, on a base with mic gain 2); and a check that every option read and every name on the two lists is changed alone in some case | [2] `steam, jitter 50 ms: {"frameMs":60}` and the others; "each option process() reads, and each name on the two lists, is changed alone in a case below" | N1, `frameMs` put on `AFTER_B_OPTIONS`: the `{"frameMs":60}` cases (B taken). N2, `seed` put on it: `steam, loss 15%: {"seed":2}` and the `celt_22` one. `received` put on `AFTER_A_OPTIONS`: `{"received":…}` (A taken). A name put on the lists with no case: the "changed alone" check |
| F2: [Browser 10] could not catch the page losing track of the source the worker holds | `speedCancelUnanswered` also asks for 2 workers, 2 source messages and nothing rendered on the page's thread; a new part, `speedCaptureChannel`, switches a stereo file's capture channel | "a worker that does not answer a cancel is ended after the bound … the source goes to the new worker"; "a stereo file: the capture channel switched renders the other channel (a fresh render's WAV), sent to the worker as a source of its own" | B1, `pageWorker.held` not cleared with the worker: 2 workers, 1 source message. B2, the source id without the channel: the same WAV twice, 1 source message |
| F3: Cancel during a re-render's first seconds was untested | a new part, `speedFirstSecondsRerenderCancel` | "Cancel during the first seconds of a re-render gives the player back the earlier render, at its place, playing; its download is offered again, and the line marks it as made with the earlier settings" | B5, the restore in `dropPreview` disabled: the wait for the earlier render times out |
| F4: both halves of `speedCancel` could pass without testing what they name, and W4-01a's check had become vacuous | the worker must be free within 300 ms of Cancel (51 to 90 ms here, 66 to 67 ms on CI); the change during a render is now Packets lost % 5 then 10 on a 40 s source, which renders from A, with one "render stopped for newer settings" line; W4-01a's check in `verifyJourney` the same (40 s, loss 5 then 10, `stopped === 1`, the WAV against a render again and one made on the page's thread) | "Cancel stops a render from the start within 300 ms …"; "a 40 s source: Packets lost % changed while a render from A runs stops that render for the newer settings …"; W4-01a's "a short source: after a change made while a render runs, that render is stopped …" | B3, the worker's yield a resolved promise: free 817 ms after Cancel. No cancel in `startRender`: 0 stopped (Browser 10), and W4-01a's "a short source: after a change made while a render runs, that render is stopped …" fails (the journey) |
| F5: the batch's downloads used the page's kept worker | `exportWav(…, { own })` and `cachedExport` take `own`; `batch.js` passes it (`OWN`), so its files are made in workers of its own, as its renders are | a new part, `speedBatchExport`: "the batch's ZIP asked for while the page renders a long source is made in workers of its own and ends before the render" | the batch sent through the page's worker: the ZIP at 4662 ms, after the render's end at 3896 ms |
| B8: a render cancelled while it waits for the worker was left in the queue | `cancelPageJob` takes a waiting job out of the queue | a new part, `speedQueuedCancel` (an MP3 export holds the worker; a render asked for then is cancelled): "… cancelled while it waits, it never reaches the worker" | the job left in the queue: 1 render posted after the download |

### The second reader

Numbered as the orchestrator's message numbers the items; the reader's own finding is in brackets (`c635b4f`'s
message uses the reader's numbers).

1. (Finding 1.) **The options are read once, at the call.** `process()` now begins with `readOptions(opts)`, which reads each
   option it uses once into a record of its own (`READ_OPTIONS`, every name), converts each as the stages use it, in
   the order the engine read them before W4-01b, and makes the room first, as main did. The stages use what was read;
   nothing in `process()` reads `opts` again. The steam sender's settings and the loss draw are given the record, and
   a demo's frames are read at the call (`receivedCodecInfo`). The two lists keep their meaning: where each option is
   first used.
2. (Finding 2.) **The keys are made of what the stages use.** `keysOf` takes each option the stages up to B use as they use it
   (`used`: the profile's name for `codec`, the converted numbers, `gate` as on or off, `gateThresholdDb` as the
   threshold or the profile's own, `frameMs` as frames a packet, the seed as the 32-bit number, a demo's voice as
   given or not); the test hooks, Steam's uptime and the resampler's kernel as given. An option `process()` does not
   read is in both keys as given, as before. So `{}` and a null-prototype object, or `{}` and an object whose
   `Symbol.toPrimitive` gives 60, no longer share a key while the engine reads them differently; and NaN for
   `gateThresholdDb` is now read as `undefined` is and takes B.
3. (Finding 4.) **A stages object that cannot keep renders from the start.** `stagePlan` keeps nothing in an object that cannot
   take new members (frozen, sealed) or whose `counts` the engine did not make (a `WeakSet` of the counts it made); it
   takes only what it kept itself (likewise); and a stages object that fails while it is used takes and keeps nothing
   more, and the render goes on. `stagesHold` answers `null` for these.
4. (Finding 5.) **`steam`'s B holds the messages without their `pcm`.** The kept B is `{ ...b, messages }` with each message
   copied without `pcm` (`({ pcm, ...rest }) => rest`); the render that makes it uses its own whole messages. Nothing
   after B reads a message's samples; no hash moved (`render-stream.verify.mjs` 553 of 553, the stages suite's 152
   recorded renders from warm stages).
5. (Findings 3 and 6.) Notes, no code (below).
6. (The caution under the reader's item 7.) **`STAGE_OBSERVERS`** has the sentence: "An observer must never be handed an object a kept stage holds: it could
   write into it."

| Item | The check (`tests/stages.verify.mjs`, section 3) | The break, and what fails |
| --- | --- | --- |
| 1 | "celt_22, with stages: bits set to 4 on the line after the call; the render is the call's, and so is the next, from B"; the same without stages; "steam, with stages: lossPct set to 60 from onProgress during the render; the render is the call's, and so is the next, from B"; the same without stages | the engine the reader read (`99fd5d0`): all four. `bits` and `lossPct` read from `opts` in the codec stage again: all four |
| 2 | each of the reader's cases, the second render with warm stages against a fresh render (the same WAV and codecInfo, or the same error): `speex`, `lossPct` `{}` then `Object.create(null)`; `steam`, `{}` then `{ [Symbol.toPrimitive]: () => 60 }`; `celt_22`, `micGain` `{}` then an object whose non-enumerable `valueOf` gives 3; `speex`, `Float32Array.of(0)` then the same with its own `valueOf` giving 70; `steam`, no `lossPct` then 60 as a non-enumerable own member; `celt_22`, no `micGain` then a class whose getter gives 4; the randomised run's seed 20001, step 122 (its options, `micGain` `{}` then a null-prototype object, on a source of its shape) | the engine the reader read: all seven. The keys made from the values as given (`for…in` over `opts`, as before): the five that render (the two that throw throw at the call, before any key, once the options are read there) |
| 2 | the NaN check, changed: "NaN where the page sends undefined (gateThresholdDb, used in the codec stage) is read as undefined is, the profile's own: B is taken, and the render is the same" | the engine the reader read, and the keys from the values as given: A taken, B not |
| 3 | "stages frozen", "stages { counts: 5 }", "stages { counts: {} }": "a fresh render's WAV and codecInfo, nothing kept, no error" (and `stagesHold` gives `null`) | the engine the reader read: `TypeError: Cannot add property counts, object is not extensible` and `Cannot read properties of undefined (reading 'kept')`. `stagePlan` as before: all three. The check of the object taken out, the catch kept: the two `counts` cases (A and B written into the caller's object) |
| 4 | "`steam`'s B holds its messages without their pcm, and the renders from it above are fresh renders'" | the engine the reader read, and B kept whole: that check |
| — | section 2's first check now also asks that every name `process()` reads (`TF2Audio.STAGE_OPTIONS.read`) is the page's, the engine's own, a hook, an observer or a control, and the "changed alone" check covers them | a name added to `READ_OPTIONS` with no case: that check |

One case of section 2 changed with item 2: on `celt_22`, which has no sender gate, `gate: false` is its own setting,
so the case is now `gate: true` (with the keys of what is used, `false` took B, as it should).

**Notes (item 5; no code):**

- **What the keys cannot see.** Each gives a stale render from B: the same `sourceKey` for other samples (another
  buffer of the same rate, length and channels, or the samples changed in place: the caller's promise broken); the
  profile tables (`CODEC_PROFILES`, `VOICE_ENGINE`; neither is frozen) or the codec module (`TF2Opus`) changed between
  two renders. No caller that passes stages does either; `tests/verify.js` swaps `TF2Opus` four times, never with
  stages.
- **The worker makes a new stages object for each source.** A `source` message replaces the held source and its
  stages (`holdSource`, `stages: {}`), so the worker does not depend on the id changing.
- **The error order with two invalid options.** The options are converted at the call in the order main converted
  them (the seed, the room, `micGain`, `hp`, `lp`, `bits`, `lossPct`, `jitterMs`, `avgGain`, `maxGain`, `voiceScale`,
  `volume`, `frameMs`), so of two invalid options the one main reported is reported: `steamUptime: -1` with a room
  that throws gives the room's error, as on main (on the head the reader read, the uptime's). The uptime itself is
  checked where main checked it, when the sender is made in the codec stage. One difference remains: a demo's frame
  data is read at the call, so a demo whose frame data throws and a source with a non-finite sample report the demo's
  error, where main reported the sample's.

### The merge of main

`3a37326` merges main at `e3dacb7` (the documentation pass, S3-01 planned). File by file:

- `README.md`: main's text, whole. Then, in its "Use it", step 3, three sentences after the existing ones (CLAUDE.md's
  "Writing the documents": the reader's words, no order names):
  > A render after a changed setting runs again only the stages from that setting on: a change on the receiver's side
  > (its gain, talk-spurt timing, volume, the room, the sound device) skips the sender and the codec, and a change to
  > the sender's gate or bit rate or to the network skips the capture. A clip longer than 30 s can be played from its
  > first 14 s while the rest renders, except with loss, jitter, talk-spurt timing, a room or under water, a sound
  > device at a rate other than 44.1 or 48 kHz, a demo, or a change on the receiver's side alone. **Cancel** stops a
  > render and keeps what was already done for the next one.
- `docs/PAGE.md` (new on main): in "Rendering and the status line", a sentence that the meter's numbers follow the
  render a moment later; three paragraphs, "What a render runs again", the sound being a render from the start's, and
  Cancel; "The first seconds"; and in the batch's part, that it renders and makes its files in workers of its own.
- `tests/README.md` (new on main): a row for `stages.verify.mjs`, the browser suite's row extended, and the times
  corrected to CI's on this branch.
- `docs/README.md`'s W4-01b row, `docs/PROGRESS.json` and the order's status line: main's, untouched.
- `sw.js`: `CACHE` stays v35. `package.json`: main's test line with `node tests/stages.verify.mjs` after
  `render-stream.verify.mjs`. `.github/workflows/test.yml`: main's (the 45-minute limit).
- Everything else from main as it is; nothing of the branch's code conflicted.

## Step 1: the worker

**One worker, kept** (`app/render.js`, `pageWorker`, `startPageJob`). The page's renders (`processInWorker`), the
download formats (`exportWav`), the meter (`analyzeCopy` in `app/meter.js`, through `startWorker`, whose shape is
unchanged) and the real take's jobs (`app/realtake.js`, likewise) go to one worker. The choice the order leaves open
("a second job waits for the first, or goes to a worker of its own"):

- a render waits for the kept worker, and is put before any other job waiting: its stages are there;
- another job is started a moment (one timer turn) after it is asked for, so a render asked for in the same moment
  (a new source asks for its meter and its render together) comes first; it then waits while the worker renders, and
  while the worker runs another job that is not a render it goes to a worker of its own, as every job did before.
  That keeps one worker for the journey (a render, its meter, the original's meter) and keeps the real take's
  locate, compare and meter jobs side by side, as before (a strict queue for them made `[Browser 3e]`'s meter row
  late, and would make a render wait behind a long locate);
- the batch keeps workers of its own (`startWorkerJob` and the new `startOwnWorker`, as `startWorker` was), with the
  meter in the result (`measure`), and sends no stages. Since the fix round its downloads and ZIP files are made in
  workers of their own too (`exportWav`'s `own`); before, they went to the page's kept worker (the first reader's F5).

**Cancel** (amendment 4). `cancelPageJob` posts `{ type: 'cancel', id }`, rejects the job with an AbortError at once
(so the page's journey goes on as W4-01a has it) and waits for the worker's `done`. The worker's `AbortController`
is `opts.signal`; `process()`'s yields (`pauseFor`: before and after each `microYield`, and as the codec stages'
`yieldControl`) throw an AbortError once it is set; the codec modules free their state in their own `finally`. The
worker is kept with its source and stages: the next render takes what was finished (A, if the cancelled render had
kept it: `tests/stages.verify.mjs` stops a render in the codec stage and the next one takes its A). Measured: the
worker free 51 to 88 ms after Cancel in the codec stage of a 20 s render.

**The bound.** A worker still busy after the bound is ended, as before, and the next job makes a new one and sends
the source again. The bound is 500 ms and 15 ms for each second of the source, not a flat 500 ms: the longest
stretch between two yields grows with the source (measured in Node with a counting `signal`: for 60 s, 678 ms in a
first render, the capture's resampling and filter, and 351 ms from B, the output stage; for 5 minutes 3843 ms and
1679 ms), and a worker ended takes its stages with it. A flat 500 ms would end the worker whenever a 5-minute render
from B was stopped in its output stage, and the next render would start from nothing. 60 s: 1.4 s; 5 minutes: 5 s;
10 minutes: 9.5 s.

**No waiting in the worker** (item 2 with amendment 4). `microYield` in a worker (`WorkerGlobalScope`) is a turn of
one shared MessageChannel; on a page it stays the timer, and with no timers (the Node sandboxes) a resolved promise.
Its cost, measured as the amendment asks (a 60 s `steam` render in the page's worker, five runs each, the scripts
loaded first): 2664 ms with the MessageChannel, 2637 ms with a resolved promise, 27 ms or 1.0%. So it yields that
way at every call (no N).

**The result first, the meter after** (item 3). The worker posts `result`, then `meter` (`TF2Meter.analyze` on a copy
of the samples, which go to the page), then `done`. `processInWorker` gives `presentRender` a promise of the stats,
which `meterResults` holds under the render's samples (`bufferId`), so `updateMeter` takes it; the message is routed
by its job's id (amendment 5), so a meter that comes for a render no longer on screen fills nothing. If the worker
ends before the meter comes, the meter measures the render itself.

**Progress** (item 4): `report(0.6 + 0.12 × (k + 1) / messages)` before each yield of the timeline's loop, once per
64 messages (the loop W3-02c-2 extends).

## Step 2: the stages

### The two places

`process()` (`audio.js`, lines 1981 to 2242) now runs: every option read, once (`readOptions`, line 1990; the
function is at 1651); the keys (`stagePlan`, 1996); B from the stages, or else A from the stages or stages 1 and 2 (A
kept at line 2049), then stage 3 (B kept at line 2124); then the receiver from B. Each place has a note in the code:
what is kept there, and that an option used before it must not be on the list after it.

**A** is `{ samples, sourceLength }`: the capture at the codec's rate after the filters and the capture EQ, and the
source's length (for the output's).

**B** (amendment 2, read from the code as it is today):

- `steam`: `{ messages, trip, sender, settings, bitrate, lossSet, framesPerPacket, codecLength, sourceLength }`. The
  sender's messages (ticks, spurts, frames, start, end marker), each kept without its samples (`pcm`, the encoder's
  input, which nothing after B reads; since the fix round); `trip` is
  `steamRoundTrip`'s result, with BC-1's loss drawn per message before the decoder: each message's decoded packet
  (`pcm`, `blocks`, `silence`, `lost`, `skipped`), the stream's lookahead and version. After B, from these alone:
  `steamTimeline` (one resampler per render, never reset; the 12-frame refusal; the gain; the laying; the frame log;
  the network counts), `steamCodecInfo` (the sender's `info()`, called afresh for each render, its settings, the
  resampler's kernel and calls, the bitrate, `codecInfo.network` when loss was set or a message refused) and
  re-timing. The resampler is made after B (`swrKernel`), so its state is the render's own.
- the frame path (`steam_48`, `celt_22`, `celt_44`, `speex`, `miles`): `{ samples, info, head, gateOn,
  sourceLength }`: the decoded samples after the decoder's filter (where a profile has one), `codecInfo` with
  `framesPerPacket`, and W3-19's `head` (the decoder's first `lookahead` samples, which the gain runs on before
  they are dropped); `miles`' engine (W3-20b) has its resets and counts inside `vr12RoundTrip`, before B. Whether
  the gain uses `head` (`agc`, `gainLead`) is decided after B.
- a demo's voice (`received`) and the codec skipped keep nothing in B; A is kept for them.

`codecInfo` made from B equals a fresh render's in every member: the recorded info hashes of all 76 cases, each from
B warmed by `voiceScale` 0.5 and from A warmed by `lossPct` 5, and the hashes of section 2 (every option changed
alone, on `steam` and `celt_22`).

### The two lists, with the line of first use

Line numbers are the head's `audio.js`. Since the fix round every option is read once, at the call: `readOptions`
(lines 1651 to 1694) reads each into a record of its own and converts it, and `process()` (1981 to 2242) uses what
was read. "First used" is the line where a stage first uses the value. A is kept at 2049, B at 2124, and the part
after B starts at 2128.

`AFTER_B_OPTIONS` (used only after B):

| Option | First used | Where |
| --- | --- | --- |
| `agc`, `avgGain`, `maxGain`, `voiceScale` | 2142 | the gain on `steam`'s timeline (2171 and 2191 to 2202 on the frame path) |
| `retime` | 2157 | re-timing (`steam`; 2167 and 2175 on the frame path) |
| `room`, `underwater`, `listenerPos`, `dspRoom`, `customEnv` | 2219 | the mix (`createMixStage(…, room)`); the room is made at the call (`resolveRoom`, 1660), as on main |
| `deviceRate` | 2232 | the output's length |
| `volume` | 2233 | the output stage |

`AFTER_A_OPTIONS` adds (used in the codec stage, after A):

| Option | First used | Where |
| --- | --- | --- |
| `seed` | 2058 | the loss draw (`rand`; also the sender, the message loss, the room's taps and re-timing: in B's key) |
| `bits` | 2066 | the bitrate (`steam`; 2086 on the frame path) |
| `gate`, `gateThresholdDb`, `steamUptime` | 2067 | `steamSenderOptions` (the frame gate at 2090; stage 4 on the frame path uses B's own `gateOn`, 2200) |
| `lossPct` | 2073 | the message loss (`steamLoser`; 2092 on the frame path) |
| `jitterMs`, `frameMs` | 2077 | the late frames' mask (2092 on the frame path) |

Used at or before A (in both keys): `codec` (2000), `enableWarble` and `received` (2006), `captureChannel` (2021),
`micGain` (2026), `hp` (2036), `lp` (2037). Every name the order put on the lists is first used where the list says;
none had to move. Not on any list, so in both keys when not a function: `swrKernel` (first used at 2139, after B;
left off: a test option, a missed reuse at most), and any option a later order adds.

**Function-valued options** (amendment 1). The observers, `STAGE_OBSERVERS`: `onProgress` (1992, progress only),
`onGain` (2211, after B), `onMixBlock` (2233, after B). An observer must never be handed an object a kept stage holds
(the sentence at the list, the second reader's item 6): `onGain` gets the gain's output, a new array; `onMixBlock` a
copy of each block. Any other function makes the render keep and take nothing: `loseMessage` (2073, in the codec
stage; it decides which messages are lost), `onDecoded` and `onResampled` (2143; they watch the decoded packets).
`stages`, `sourceKey` and `signal` are the keeping's own and in neither key.

### The keys

`keysOf` builds A's key from `sourceKey`, the source's rate, length and channels, and every option not on
`AFTER_A_OPTIONS`; B's from A's and every option on it but not on `AFTER_B_OPTIONS`. Since the fix round each option
`process()` reads is in the keys as the stages use it (`readOptions`' `used`: the profile's name, the converted
numbers, the gate on or off, the threshold or the profile's own, frames a packet, the 32-bit seed, a demo's voice
given or not; the hooks, Steam's uptime and the resampler's kernel as given), and an option it does not read as it is
given. Each value goes through `keyText`: a type letter before each part; numbers as `String()` writes them (NaN, Infinity, -0 apart); strings
quoted; typed arrays by type and elements; arrays and plain objects by their own keys in order, so a hole, an
`undefined` member and an absent one differ; `null` (no key: keep nothing) for a function, a symbol, a `DataView`, an
instance of a class or a cycle. No `sourceKey`, no keeping. One A and one B are held; a render whose key differs lets
the held one go before it makes its own (it would replace it anyway), so the worker holds at most one of each.

### Nothing kept is changed afterwards (item 7): where a copy is made

- A is never copied: the codec stages read it (`steamCapture` makes the 16-bit copy, the round trips copy each frame
  into their input), and stage 4 resamples it into a new array (`resampleSinc` copies even at equal rates).
- The frame path's samples are copied (`slice`) only when re-timing runs, which moves them in place; for 60 s at
  22,050 Hz that is 5.3 MB and a few milliseconds, against a codec stage of about half a second saved.
- B's `codecInfo` is copied for each render made from it (`copyInfo`, arrays and typed arrays included): re-timing
  writes into its frame log and frame bytes, and a caller may write into what it is given. A few kilobytes.
- `steam`: nothing to copy after B. The timeline reads the decoded packets and their blocks and writes into arrays
  of its own (`Float32Array.from` of the resampler's output, which the gain writes into); the frame log is the
  timeline's new array; `sender.info()` is made afresh for each render. The messages are copied once, as B is kept,
  without their samples.

### The page and the worker (item 8, amendment 5)

The page gives each source an id (`workerSourceId`): a number per source object on the page (every file, recording,
live take and demo speaker mounts a new one) and the channel the render captures (`captureSource`). Before a render's
first message to a worker that does not hold that id, it sends `{ type: 'source', sourceId, sampleRate, samples }`
once; renders name the id and the worker passes its stages and the id as `opts.sourceKey`. A new source replaces the
old one and its stages; a worker ended forgets it. With a demo the key (`settingsKey`) leaves out the sender's
settings as W4-01a has it; a new speaker is a new source (the check shows the second source message), and so is a
stereo file switched to its other channel (checked since the fix round, the first reader's F2). The batch sends no
source and keeps no stages.

## Step 3: the first seconds

**The rule** (`TF2Audio.previewAllowed`, `app/render.js`'s `previewWanted`): a source longer than 30 s, with a worker,
no loss and no jitter, re-timing off, no room that runs and not under water (a room number the table does not hold
is no room and is allowed: its render is the no-room render), not a demo, a device at 44,100 or 48,000 Hz (the
page's two; others are untested and refused), and no `loseMessage`. The worker renders the first seconds only if the
stages do not hold B for the settings (`TF2Audio.stagesHold`): a render from B takes about a third of the time, so
for 60 s it would be ready about when the first seconds would.

**The equality test** (`tests/stages.verify.mjs`, section 4): for each of `steam`, `steam_48`, `celt_22`, `celt_44`,
`speex` and `miles`, three seeded 32 s clips of speech-like talk: the first 14 s of the render of the first 15 s are
the whole render's first 14 s, sample for sample (`Object.is`). Then on `steam`, one at a time: the gate off and on,
its threshold, Steam's uptime, `snd_bits` 6, mic gain 3, the filters, the gain off, `voice_scale` 2, `voice_maxgain`
3, `voice_avggain` 0.25, volume 0.5, the device at 44,100 Hz, the codec skipped, `net_split` 60 ms, the right and
the mixed channel of a stereo source; and `celt_22` with the gate on and `voice_scale` 2. All equal; nothing beyond
the order's list had to be excluded. For `steam`, as the amendment expects, the sender's clock and gate are seeded
and run forward, and the first 14 s are equal for the default preset.

**The page.** `showPreview` puts the first seconds' WAV into the player (keeping the position and play state of what
it held, clamped to 14 s), sets the status line under the player to "The first 14 s; the rest is rendering…", and
brings the player into view with the focus for a source's first render. Nothing else changes: `state.lastWav`, the
download buttons (off during a render, as W4-01a has them), `state.processedBuffer`, the views and the table wait.
`presentRender` takes the place from the first seconds as from an earlier render of the same source. A render that
does not finish (cancelled, failed, replaced by a newer one) gives the player back what it held: the earlier render
of the source at the same place, or nothing. A setting changed during the first seconds or the whole render follows
W4-01a's rules and the cancel above. The first seconds and the whole render are two independent renders, the whole
one from the start, sharing nothing (the simple form).

## Times

On this machine (4 cores, other agents' jobs running at times), the browser suite's Chromium, the page as served,
synthetic speech-like clips (`wavSpeech`), the default preset; each a fresh page, the median of three. A render's time
is from its start to its end on the page (W4-01a's `tf2:busy` events); the first sound is from a render's start until
the player can play. Before: main at `8035cfa` (its figures have no first seconds: the first sound is the whole
render).

| Clip | | Before | After | After / before |
| --- | --- | ---: | ---: | ---: |
| 10 s | first render | 721 ms | 634 ms | 0.88 |
| | re-render, `voice_scale` 0.5 (from B) | 735 ms | 204 ms | 0.28 |
| | re-render, then Packets lost % 5 (from A, not B) | 719 ms | 387 ms | 0.54 |
| | first sound | 721 ms (the render) | 634 ms (the render: no first seconds at 30 s or less) | |
| 60 s | first render, to the whole render | 3496 ms | 3716 ms | 1.06 |
| | first sound | 3496 ms (the render) | **872 ms** (the first 14 s) | 0.25 |
| | re-render, `voice_scale` 0.5 (from B) | 3389 ms | 1086 ms | 0.32 |
| | re-render, then Packets lost % 5 (from A, not B) | 3317 ms | 2147 ms | 0.65 |
| 5 minutes | first render, to the whole render | 16900 ms | 13879 ms | 0.82 |
| | first sound | 16900 ms (the render) | **880 ms** (the first 14 s) | 0.05 |
| | re-render, `voice_scale` 0.5 (from B) | 16329 ms | 6052 ms | 0.37 |
| | re-render, then Packets lost % 5 (from A, not B) | 16230 ms | 10895 ms | 0.67 |

The runs behind each median: before 717/721/754, 735/687/805, 719/726/683 (10 s); 3463/3671/3496, 3385/3389/3416,
3317/3405/3287 (60 s); 16886/16900/17027, 15806/16329/16375, 15963/16230/16281 (5 minutes; a second run of three
gave 16706, 16266, 16121). After 605/653/634, 218/190/204, 387/393/383 (10 s); 3716/3700/3747, 1086/1102/1037,
2140/2254/2147, first sound 872/864/899 (60 s); 14216/13794/13879, 6208/5844/6052, 10762/10921/10895, first sound
889/880/845 (5 minutes).

- A first render of 60 s or 5 minutes renders the first 15 s before the whole: about 0.85 s more to the whole render
  (the browser suite's step-2 run, before step 3, gave 2862 to 2888 ms for the same 60 s first render, 0.82 of
  before). The first sound comes at under 0.9 s for any length above 30 s.
- The audit's figures on its machine were 1.1 s, 4.5 s and 21 s for a first render and the same for a re-render.
  This machine is faster than the audit's (before: 0.72, 3.5 and 16.9 s).
- A re-render with `voice_scale` changed is about a third of a first render (0.28 to 0.37; the audit expected a third);
  with Packets lost % changed it starts from A, and the codec stage it runs again is most of the render (0.54 to 0.67).
- Step 1 alone (the MessageChannel yield, the kept worker, the meter after the result) is in the first render's 0.88
  at 10 s and 0.82 at 60 s (without the first seconds). The yield's cost against a resolved promise is 1.0% (above).

## Memory

The order's stop-and-ask: "if the worker's memory with the stages kept, for a 9.8-minute source, is more than a tenth
over today's peak, say the figure". **It is: +29%.**

**The ruling.** "Ruled 2026-11-12 by the orchestrator: accepted for this order (the figures,
docs/reports/W4-01b-speed.md); a way back, should long clips strain a browser, is to hand the stages to a new worker
after a long render." The figures below are kept as measured at `c74d976`; the fix round's one change to what is held
(`steam`'s B without the messages' samples, way 2's second half) is measured after them.

Measured as the audit measured it: the resident memory of all the browser's processes (the test's Chromium, its
process tree) over what they held with the page loaded and idle, sampled five times a second, while a fresh page
renders a 588 s synthetic speech-like WAV (48 kHz, 16-bit, chosen as a file), then renders again with `voice_scale`
0.5, then with Packets lost % 5 (a source this long renders on the button). One run each; the idle page is 946 to 952
MB in every run. (The audit's figure, 1.1 GB, was on its machine with its clip; the comparison here is main and the
branch on the same harness.)

| Peak over the idle page, MB | first render | `voice_scale` 0.5 | Packets lost % 5 | 2 s after, idle |
| --- | ---: | ---: | ---: | ---: |
| main (`8035cfa`) | 1525 | **1592** | 1580 | 730 |
| this branch (`c74d976`) | 2015 | 1890 | **2050** | 1516 |
| diagnostic: this branch, the worker keeping no stages | 1866 | **2103** | 1563 | 1376 |
| diagnostic: this branch, the worker's garbage collected after each job (`--js-flags=--expose-gc`, `gc()` after `done`) | **1879** | 1702 | 1635 | 961 |

What it shows:

- **The stages themselves are not most of it.** The branch with the worker keeping no stages peaks as high (2103 MB).
  The rise is the worker being kept: before W4-01b each render ran in a new worker that was ended with all its
  memory; a kept worker's heap keeps a render's garbage (about nine copies of the source at the peak, the audit's
  finding 11) until V8 collects it, and the next render runs on top of it.
- **With the garbage collected after each job** (a diagnostic only: a page cannot ask a worker for that), the peak is
  1879 MB (+18%), during the first render, and at rest the branch holds 231 MB more than main: the held source
  (588 s at 48 kHz in 32-bit floats, 113 MB), A (588 s at 24 kHz, 56 MB) and B (`steam`: the sender's messages and
  the decoded packets, 16-bit, up to 28 MB each for sound that is never gated, and their blocks). The first render's
  peak also holds the meter's copy of the output (113 MB, made so that the result can be sent first) and A and B
  past the codec stage.
- So the order's estimate "B's is small for `steam`" does not hold: B is about the size of A for continuous sound.

Ways back, each a decision (the ruling took 4; the second reader's item 4 then took the second half of 2):

1. For long sources, measure before sending the result, as before (no 113 MB copy; the meter's 0.27 s a minute comes
   back before the result for them).
2. Hold A for `steam` as the 16-bit capture the sender is given (28 MB, not 56), and B without the messages' samples
   (no later stage reads them today; W3-02c-2's channel reads ticks, not samples).
3. Keep the worker and its stages only up to a length (say 5 minutes), and end the worker after a render of a longer
   source, as before W4-01b (the order's own rule for Cancel, extended).
4. Accept the figure: the peak is the page's longest source on a desktop.

1 and 2 would take about 170 MB off the first render's peak and up to 56 MB off what is held at rest; neither
reaches the garbage a kept worker carries, which only 3 (or a GC the page cannot ask for) removes. The figures are
one run each; the differences are far larger than the 25% the audit saw between runs of a render's time.

**After the fix round** (`c635b4f`, the same harness, one run each):

| Peak over the idle page, MB | first render | `voice_scale` 0.5 | Packets lost % 5 | 2 s after, idle |
| --- | ---: | ---: | ---: | ---: |
| this branch (`c635b4f`) | 1777 | 1857 | **2032** | 1391 |
| diagnostic: the worker's garbage collected after each job | **1827** | 1644 | 1732 | 850 |

The peak is 2032 MB, +28% over main's 1592 (2050 at `c74d976`). With the garbage collected, the branch holds 120 MB
more than main at rest, against 231 MB at `c74d976`. The messages' samples are 28 MB of that drop (computed: 588 s at
24,000 Hz, 2 bytes a sample, sound that is never gated); the figures are one run each, and the rest of the
difference is not attributed.

## Checks

After the fix round, on its code's head (`c635b4f`), on this machine, each under `flock /tmp/tf2ve-heavy.lock`:

| Command | Last lines |
| --- | --- |
| `pnpm test` (19 min 13 s) | every suite passes; among them `553 render-stream checks passed, 0 failed` and `331 stages checks passed, 0 failed` |
| `git diff 8035cfa -- tests/render-stream.verify.mjs` | empty |
| `CHROMIUM_EXECUTABLE=… node tests/browser.verify.js` | `409 browser checks passed` |
| CI, the `tests` workflow, run 43163376113 on `c635b4f` | success; `pnpm test:all` took 17 min 56 s of the job's 45-minute limit (`pnpm test` 14 min 26 s with the stages suite 2 min 57 s of it, the browser suite 3 min 29 s); `331 stages checks passed, 0 failed`, `409 browser checks passed` |

At step 3, on the head of the three code commits (`c74d976`):

| Command | Last lines |
| --- | --- |
| `pnpm test` (17 min 51 s) | every suite passes; among them `553 render-stream checks passed, 0 failed` and `297 stages checks passed, 0 failed` (3 min 34 s) |
| `git diff 8035cfa -- tests/render-stream.verify.mjs` | empty: `GOLDEN` and the rest of the file unchanged |
| `CHROMIUM_EXECUTABLE=… flock /tmp/tf2ve-heavy.lock node tests/browser.verify.js` | `401 browser checks passed` (374 on main at `8035cfa`, run the same way) |
| CI, the `tests` workflow, run 43135876745 on `c74d976` | success; its verification step took 23 min 36 s of the job's 30-minute limit (the stages suite 3 min 41 s of it, the browser suite about 4 min) |

The order's checks, one by one:

- **The hashes:** `render-stream.verify.mjs` passes; its file is not changed. `pnpm test` passes.
- **Step 1** ([Browser 10]): two renders of one source construct one worker (with their meters and the original's);
  Cancel during a render, then a render, gives a result, from the same worker; the `result` message comes before the
  `meter` message and the table's numbers are `Object.is`-equal to `TF2Meter.analyze` of the render (every member,
  through the loudness history's arrays); a 60 s `steam` render shows 60, 61, … 72 on the button (13 percentages).
- **Step 2** (`tests/stages.verify.mjs`): [1] all 76 `GOLDEN` cases, each from stages first used with `voiceScale`
  0.5 (taken from B; from A for the demo's voice and the codec skipped) and with `lossPct` 5 (taken from A), give
  their recorded WAV and info hashes: 152 checks and one that every recorded render is a case; [2] each of the 22 options `renderOptions()` sends, changed alone
  (two values for three of them) on a `steam` and a `celt_22` base, gives a fresh render's hashes from the place its
  lists say, and the base again gives its own: 100 checks and one on the lists; the browser suite checks the list against
  `Object.keys(renderOptions())`; [3] `zzNew: 1` takes neither place; a changed `sourceKey` takes nothing; the same
  samples and `sourceKey` with `voiceScale` changed take B, with `lossPct` changed A and not B. In the browser: a
  60 s source, then `voice_scale` 0.5: 990 to 1077 ms against 2862 to 3598 ms for the first render, and the WAV's hash
  is a fresh page's render's.
- **Step 3:** in Node, each of the six profiles on three seeded clips, and each allowed setting, sample for sample
  over 14 s; in the browser, a 60 s source's player can play within 2.5 s (832 to 870 ms) while the progress is under
  100%, and the whole render then takes its place with the position kept (5.643 s → 5.643 s) and playing; with
  `lossPct` 5 no first seconds are posted.
- **The amendments' checks:** `loseMessage` passed, then not passed, with warm stages, gives the fresh render each
  time; `onDecoded` (and `onResampled`) with warm stages are called as often as on a fresh render (46 and 46); a
  setting changed during a 20 s render gives a fresh render's WAV (made on the page's own thread, nothing kept) and
  no second worker; a worker that does not answer a cancel is replaced after its bound and the render after it is
  right; a late meter of an older render leaves the table alone; a demo's other speaker is a new source; Cancel
  during the first seconds gives the player back.
- `sw.js` cache v35; `tests/predictions/PREDICTIONS.md` has a dated note (2026-11-12) that `audio.js` changed and no
  render moved.

### The new checks, and the break that fails each

Each break was made in a copy of the head's tree (`git ls-files`, the working files), the check run on it, and the
failing check's name read from its output. All 41 failed the check named; none was left in the code.

`tests/stages.verify.mjs` (section 1 run on a few cases where noted, sections 2 to 4 whole):

| Check | Break | Fails with |
| --- | --- | --- |
| [1] every recorded render from stages warmed by lossPct 5 | `lossPct` put on `AFTER_B_OPTIONS` | `steam`, `celt_22`, … with lossPct 5: B taken, not the recorded hashes |
| [1] … warmed by voiceScale 0.5, from B | `voiceScale` taken off the lists (a missed reuse) | the place: "from B" not met (B taken 0) |
| [1] … the engine codecs | B without W3-19's `head` | `celt_22`, `speex`, `miles`: not the recorded hashes |
| [1] … `steam` with loss | B's `lossSet` always false | `steam, gate off, loss 40%, seed 3`: no `codecInfo.network` (the case with loss 15% and jitter has refused messages, which report it anyway, so the break's first run on that case alone did not fail; run on every `steam` loss case it does) |
| [2] each option changed alone | `micGain` put on `AFTER_A_OPTIONS` | `{"micGain":3}`: A taken, not a fresh render's hashes |
| [2] … | `gate` put on `AFTER_B_OPTIONS` | `{"gate":false}`: B taken |
| [3] an option the engine does not know | the keys hold only the names the engine reads before B | `zzNew: 1`: B taken |
| [3] a changed sourceKey | A's key without the sourceKey | B taken for another source |
| [3] a source of another length | A's key without the source's rate, length and channels | B taken |
| [3] loseMessage with warm stages | `loseMessage` counted an observer | B taken: not the fresh render with it |
| [3] onDecoded as often as fresh | `onDecoded` counted an observer | the stages taken and kept (counts changed) |
| [3] the observers keep the reuse | `onProgress` not an observer | nothing taken |
| [3] values JSON would make equal | keys by `JSON.stringify` | 23 keys for 33 values |
| [3] a value with no key | a class's instance given a key | the instance keyed |
| [3] … (NaN) | NaN keyed as `undefined` | 31 keys for 33 values |
| [3] a caller's writes and re-timing, frame path | B's `codecInfo` handed out without a copy | the next render from B not a fresh render's |
| [3] … | B's samples re-timed in place | the same |
| [3] … `steam` | the sender's `info()` kept once in B | the caller's write reaches the next render |
| [3] a render stopped by its signal keeps A | A kept only with B | A not kept |
| [3] … ends with an AbortError | the signal not looked at | no AbortError |
| [4] the first 14 s, each profile | the sender seeded by the source's length | `steam`: first differing sample 176456 |
| [4] previewAllowed() allows nothing else | re-timing allowed | the refused list not refused |
| [4] … | any device rate allowed | the same (96,000 Hz) |

`tests/browser.verify.js`, [Browser 10] (run part by part):

| Check | Break | Fails with |
| --- | --- | --- |
| two renders, their meters and the original's: one worker | the worker ended after every job | 3 constructed |
| the result before the meter | the worker posts the meter first | the order |
| the table's numbers are `TF2Meter.analyze`'s | the worker measures other samples (one dropped) | the numbers |
| a late meter of an older render | every `meter` message put into the table of the render on screen (past the job's id) | the table changed (a first try that broke only `onMeter` did not fail: the message is routed by its job's id first, so it never reaches the older job's handler) |
| Cancel keeps the worker | Cancel ends the worker | 2 workers |
| an unanswered cancel: replaced after the bound | no bound | 1 worker, no line |
| progress from 60 to 72% | no report in the timeline's loop | 60, 72 only |
| the option list is the page's | one name left out of `RENDER_OPTION_NAMES` | 21 names |
| 60 s, voice_scale 0.5: under half, a fresh page's WAV | the worker keeps no stages | 3658 ms, then 4129 ms |
| the source sent once | the source sent with every render | first the time (a new source message drops the stages, so the reuse goes too) |
| … | the source sent with every render, the stages kept for the same id | 3 source messages |
| a demo's other speaker: a new source | one id for every source | 1, 1, 1 source messages |
| the first seconds within 2.5 s | the worker renders none | the wait times out |
| the line; the download and the views wait | the download offered with the first seconds | that check |
| the place kept | `presentRender` ignores the first seconds' place | the wait for the restored place times out |
| none with Packets lost % at 5 | the first seconds asked for whatever the settings (page and worker) | 1 posted |
| none for 30 s | the threshold at 20 s | that check |
| Cancel during the first seconds | the player not given back | that check |

## Not done, or uncertain

- The cancel bound grows with the source by a figure measured on this machine (about 11 ms a second, set at 15);
  a much slower machine would end the worker on a cancel more often, which is the old behaviour, not a wrong render.
- A render asked for while the kept worker runs a job that is not a render (a download's MP3, the real take's
  locate) waits for that job: the batch's and the real take's jobs run while the page is idle, so this is rare.
- The first seconds of a source whose earlier render was playing past 14 s start at 14 s (the position clamped to
  their length), as part a clamps a shorter render; the whole render then takes their place.
- Firefox and Safari were not run (the MessageChannel turn and `AbortController` are standard in both).
- CI's verification step took 23 min 36 s at step 3 (`tests/stages.verify.mjs` 3 min 41 s of it, [Browser 10]
  about 1.5 min); main has since raised the job's limit to 45 minutes. On the fix round's code head (`c635b4f`) it took 17 min 56 s.
- The memory figures are one run each (above).
- I scanned the branch's diff and commit messages for recordings, personal details, real SteamIDs and model names:
  none, beyond the attribution trailers the brief requires.
