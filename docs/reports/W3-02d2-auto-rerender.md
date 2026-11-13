# W3-02d-2: a longer source re-renders by itself after a receiver-side change

The builder's report. The order is `docs/work-orders/W3-02d2-auto-rerender.md`. Branch
`claude/w3-02d2-auto-rerender`, from `main` at `fd2d60d`, with `main` at `28e9c79` (RP-01b) and then at `9e1ff27` (BC-4 ordered, documents only) merged in.

**Status:** built, and fixed after the review (the section "The fix round" at the end). The build stopped on one
question: the timing (below) put a render from the kept stage of a ten-minute source at about half the whole render's
time in the page, once above half. Ruling 17 answered it: `AUTO_RENDER_KEPT_MS` stays 30,000. Each break of the
order's table was made (below).

## What changed

| File | Change |
| --- | --- |
| `app/core.js` | `AUTO_RENDER_KEPT_MS = 30000` beside `AUTO_RENDER_SECONDS`; `state.renderedTook` (the render on screen's time on this device, in ms), `state.renderedFrom` (where the worker started it) and `state.workerKeepsShown` (rule C's mark) |
| `app/render.js` | `changedAfterCodecOnly(from, to)` (rule B: every option that differs between two keys is a name of `TF2Audio.STAGE_OPTIONS.afterB`, read at each call); `rendersFromKept(key)` (rules A to D); `reconcileRender` starts a render 400 ms after the last change for a source of 60 s or less as before, and for a longer one when `rendersFromKept` allows it, with a cancelled render's settings held back for both; `runRender` clears the mark when a render starts whose settings differ from the render on screen's outside the list; `dropPageWorker` clears it; `presentRender` stores the time and where the render started, sets the mark for a render made in the page's worker and clears it for a live take and for a render made on the page's own thread; `processInWorker` tags its result as made in the worker; `renderReply` carries the worker's `startedFrom`; the console's line "ChangeLevel: rendered …" ends with "from the kept codec result", "from the kept capture signal" or "from the start" |
| `app/source.js` | `mountSource` clears the mark |
| `audio-worker.js` | the `result` reply's one field `startedFrom`: `TF2Audio.stagesHold(source, opts)`, taken before the render (and before its first seconds) |
| `tests/browser.verify.js` | the new section [Browser 8d]; two earlier checks on a 61 s source changed (below) |
| `docs/PAGE.md`, `README.md` | the rule in plain words, with the 30 s and "on this device"; PAGE.md also names the console line's ending |

`sw.js` is unchanged: no file was added or renamed. Nothing under `engine/` changed.

## Judgment calls

- **Rule A has no test of its own for a live take.** The order says a live take is shown with a time of 0 and that
  the worker never held its source. So rule D (0 is not known) and rule C (the mark is cleared for a live take)
  hold it back; rule A's code is only "a render of this source is on screen".
- **Where the mark is set.** `presentRender` sets it when the result came from `processInWorker` (the result's
  `inWorker`), and clears it for a live take whatever else is true. A render made by `TF2Audio.process` on the
  page's thread (opened from `file://`, or the worker's compatibility path after a failure) carries no tag and
  clears it.
- **No key is never a change on the receiver's side.** `changedAfterCodecOnly` returns false when either key is
  missing (after a source is mounted the key on screen is null).
- **Where a render started is kept with the render** (`state.renderedFrom`), and named at the end of the console's
  "ChangeLevel" line. `undefined` stands for a render the page's worker did not make.
- **Two earlier checks on a 61 s source changed**, because the order changes what they checked: on a 61 s source a
  changed `voice_scale` (journey, [Browser 8] part 4) and a changed volume, `fps_max` or Phrase timing ([Browser 8c])
  used to be marked; they now render by itself.
  - [Browser 8] part 4 now changes **jitter**, which needs a new encode. `snd_bits` was tried first: it renders from
    the kept capture signal with first seconds, so the status line read "The first 14 s; the rest is rendering…"
    where the check reads "Rendering 61.0 s…". Jitter allows no first seconds.
  - [Browser 8c] sets the render on screen's time over the limit before its changes, so that the render stays marked
    and the line beside Hear can still be seen to follow the render on screen.
  - No check on a source of 60 s or less was changed.

## The new checks ([Browser 8d])

On a synthetic speech source of 61 s, whose first render took about 4 s in the suite's Chromium:

- volume changed twice within 400 ms starts exactly one render, of the last value, and the worker started it from
  the kept codec result (`state.renderedFrom` 'b', and the console line says so); that render is, byte for byte, a
  render made afresh on the page's own thread;
- `fps_max` 67, Phrase timing set to the file's own timing, and a room (a small room) each start exactly one render,
  from the kept codec result;
- `snd_bits` 8, `net_fakeloss` 5, and volume with `snd_bits` together each mark the render and start none;
- with the render on screen's time set over the limit, and set to 0, a changed volume marks the render;
- an automatic render the user cancelled is not started again by a return to its settings;
- the reviewer's sequence (`snd_bits` 8; Render; Cancel at 10% or more; `snd_bits` back; volume changed): marked, and
  none starts; after one press of Render (which started from the kept capture signal) a changed volume starts
  exactly one render, from the kept codec result;
- after `dropPageWorker()` (what a cancel that does not stop in time calls), a changed volume marks the render;
- with the first render cancelled, a changed volume starts none; and again with the mark, the time and the key set by
  hand as if a render were on screen (this isolates rule A, which rule C would otherwise cover);
- a recorded live take of 90 s: a changed volume marks it and starts none; and again with its time set to 1,000 ms
  by hand (this isolates rule C);
- no page errors.

## The timing

Measured in headless Chromium on the build machine (a four-core machine shared with other agents), with the
script of the order's section "The timing" in the builder's scratch folder (not committed). The source is the
browser suite's synthetic speech (`wavSpeech`) at 48 kHz; the page at its defaults (Steam voice on the game's voice
queue). One run of 1 and 3 minutes, five runs of 10 minutes.

**1. The page's own render, at full speed.** The whole first render is `state.renderedTook` (it includes the first
seconds' render for a source over 30 s). The others are the time from the change to the render shown, less the
400 ms delay. "Phrase timing to the game's" is `voice_timeline` changed from `source` to `game`.

| Source | Whole first render | Volume changed | Phrase timing to the game's | Share of the whole |
| --- | --- | --- | --- | --- |
| 1 min | 4.0 s | 1.8 s, then 1.5 s | 1.5 s | 0.37 to 0.44 |
| 3 min | 9.6 s | 4.6 s, then 4.4 s | 4.6 s | 0.46 to 0.48 |
| 10 min, run 1 | 31.2 s | 14.6 s (Render pressed), then 15.6 s | 14.9 s | 0.47 to 0.50 |
| 10 min, run 2 | 30.1 s | 14.1 s (Render pressed), then 15.0 s | 14.1 s | 0.47 to 0.50 |
| 10 min, run 3 | 31.0 s | 14.4 s (Render pressed), then 15.0 s | 16.6 s | 0.47 to 0.54 |
| 10 min, run 4 | 30.9 s | 14.2 s (Render pressed), then 14.6 s | 15.3 s | 0.46 to 0.50 |
| 10 min, run 5 | 29.5 s | 13.2 s, then 14.4 s | 14.6 s | 0.45 to 0.50 |

Every render after a change started from the kept codec result. A ten-minute source's whole render took 29.5 to
31.2 s here, on either side of the limit: in four runs of five the first change was marked and Render was pressed
(its time from the press is given), in one it rendered by itself. Phrase timing changed the other way (from the
game's to the file's own) took 11.1 to 12.8 s on ten minutes.

**2. The engine's render from the kept stage, slowed.** On the page's main thread, `TF2Audio.process` with a stages
object: a whole render at full speed, then a render with volume changed at each processor throttle rate. This is the
engine's from-the-kept-stage time on a main thread slowed 4 and 6 times, not the page's render (which runs in a
worker the throttle does not slow).

| Source | Whole render, rate 1 | From the kept stage, rate 1 | Rate 4 | Rate 6 |
| --- | --- | --- | --- | --- |
| 1 min | 3.4 s | 1.3 s | 6.1 s | 8.6 s |
| 3 min | 10.1 s | 4.3 s | 18.0 s | 25.9 s |
| 10 min (five runs) | 34.3 to 37.8 s | 13.4 to 13.8 s | 56.2 to 59.1 s | 81.6 to 83.5 s |

**What it shows.** The time grows about in step with the length. In the page a render from the kept stage of a ten-
minute source took 0.45 to 0.54 of the whole first render, most often just under half, and above half once (Phrase
timing to the game's, run 3). On the main thread the same render took 0.36 to 0.40 of the whole. A processor four to
six times slower would take about 56 to 84 s for the engine's part of a ten-minute re-render, which rule D would
mark (its first render would be over the limit too).

**A wait inside these times** (found by the reviewer). The script changed a setting while the worker still ran the
previous render's meter (about 4.0 s after a ten-minute first render), so the kept-stage times of the first table
include that wait. With the worker free the reviewer measured a whole render of 33.1 s and renders from the kept
stage of 13.9 and 12.5 s (0.38 to 0.42 of it), and 15.4 s right after another render (one run, headless Chromium on
the build machine). `renderedTook` includes such waits too, so rule D errs toward marking.

**What it does not show.** A phone's memory limit, its heat, another browser's engine, a tab in the background, and
whether the share would differ on another machine. The first render's time includes the first seconds' render; the
renders after a change make none.

**The stop.** The order's "Stop and ask" and the brief name a kept-stage render of a ten-minute source that takes
more than half the whole render's time in the page. Here it took about half: 0.45 to 0.50 for volume in every run,
and 0.47 to 0.54 for Phrase timing to the game's. Ruling 17: the limit stays at 30,000.

## Done means

1. `CHROMIUM_EXECUTABLE=… flock /tmp/tf2ve-heavy.lock node tests/run.mjs browser`, on the final tree (after the
   merge of `main`): the suite passed ("== browser: passed, 356.6 s"). The new checks are in
   [Browser 8d]; every check on a source of 60 s or less is unchanged and passed.
2. `flock /tmp/tf2ve-heavy.lock pnpm test`, final tree: every suite passed ("27 of 27 suites passed", the runner's own line).
   `git diff origin/main --stat -- engine audio.js voice-channel.js steam-sender.js constants.js` prints nothing;
   `git diff origin/main -- audio-worker.js` shows the one field (`startedFrom`, the line that takes it, and its
   comment); `git diff origin/main --stat -- tests/` shows `tests/browser.verify.js` only.
3. `node tests/cache-number.mjs origin/main --report`: "cached files changed since origin/main (9e1ff27):
   app/core.js, app/render.js, app/source.js, audio-worker.js" and "cache number against origin/main (9e1ff27): the
   number is v42, not above v42: it must rise". The builder did not set it.
4. `git diff origin/main --stat` shows `README.md`, `app/core.js`, `app/render.js`, `app/source.js`,
   `audio-worker.js`, `docs/PAGE.md`, `tests/browser.verify.js` and this report: all in "May touch".
5. This report. (Before the fix round:) the suites ran on the tree after the merge of `28e9c79`; the merge of `9e1ff27` after them brought
   documents only (`docs/`), so no file a suite runs changed. CI ran on `6ce8050` (the first merge), whose files
   outside `docs/` are the final head's: `verify` succeeded.

### The breaks

Each break was made in `app/render.js`, [Browser 8d] was run alone through a temporary harness that does not stop
at a failed check (the last break: [Browser 8]), the failed checks were read, and the break was taken back. The
harness passed every check with no break first.

| Break | As made | The checks that failed |
| --- | --- | --- |
| rule B lets every option through | the line of rule B taken out of `rendersFromKept` | `snd_bits` 8, `net_fakeloss` 5, and volume with `snd_bits`: each started a render (from the kept capture signal) |
| the list of rule B is a copy that lacks `fps` | the engine's list written out without `fps` | `fps_max` 67 started none (and, with `fps_max` left at 67, the next two) |
| rule B compares with the last render started | the key of the last render `runRender` started in place of the one on screen | **none** (see below) |
| rule C is left out | the line of rule C taken out | the reviewer's sequence (the render it started began from the kept capture signal); the worker ended; the live take with a time set |
| the mark is not cleared for a live take | `presentRender` sets the mark for a live take | the live take with a time set under the limit |
| rule D is left out | `rendersFromKept` ends `return true` | the time over the limit; the time 0 |
| a time of 0 counts as fast | the test `> 0` taken out | the time 0 |
| rule A is left out | the line of rule A taken out | rule A on its own (the mark, time and key set by hand); the first render cancelled, as is, still passed (see below) |
| the rule is applied to a source of 60 s or less | `reconcileRender` asks `rendersFromKept` whatever the length | [Browser 8] stopped at its 40 s source: `net_fakeloss` 5 started no render, and the wait for one ran out |
| the timer is not cleared when a second change comes | `clearAutoRender()` taken out of the start of `reconcileRender` | volume changed twice (four renders started), and every later check of a render started by itself |

**Two breaks the named check does not see, and why.**

- *Rule B against the last render started.* Rule C hides it in every sequence. A render that started and did not
  end on screen either differs from the render on screen outside the list (then it cleared the mark at its start,
  and rule C marks the change whichever key rule B reads) or only inside it (then the controls differ from both keys
  outside the list in the same names, and rule B gives the same answer). So no sequence of the page's own tells the
  two apart; a check could only by setting the mark by hand into a state the page never reaches. None was added.
- *Rule A, with the first render cancelled.* `mountSource` clears the mark and sets the key on screen to null, so
  rules B and C already hold the render back. The check "rule A on its own" sets the mark, a time and the key by
  hand, and fails on the break.

The reviewer's sequence with rule C left out shows what rule C is for: the render that started by itself began from
the kept capture signal, not from the kept codec result.

## Not done, or uncertain

- **A demo's sender settings** were not held by the build; the fix round's point 3 holds them (below).
- **The first seconds.** A render from the kept capture signal of a source over 30 s with the codec skipped makes
  first seconds, as an automatic render of a source of 31 to 60 s already does. A demo makes none (`previewAllowed`
  refuses a demo's received voice), and a render from the kept codec result makes none (`audio-worker.js`). Read from
  the code; the suite checks the last only. *Corrected in the fix round: this item first said a demo makes them.*
- **The timing** is one machine's, and its ten-minute share sits at the edge the order names (above).

## The fix round (2026-11-13)

The order's section "After the review", its five points, and ruling 17 (the limit stays 30,000; the constant is
unchanged). `main` at `39bdd8e` (documents only) was merged in first.

| Point | What was done |
| --- | --- |
| 1. Ruling 18 | `reconcileRender` starts a longer source's render by itself with `fromKept`; `startRender` carries it (through `renderAfter` and the batch's retry; the button, a new source and a source of 60 s or less never carry it); `runRender` passes it to `runAudioProcess` and `processInWorker`. In `prepare`, before the source is posted, such a render with `state.workerKeepsShown` false throws `keptLostError()`, an `AbortError` with the flag `keptLost`. `pumpPageWorker`'s catch settles the job, frees the queue, and keeps the worker for that error (it is sound). `runAudioProcess` rethrows an `AbortError`, and when the worker breaks during such a render it throws `keptLostError()` in place of the compatibility path. `runRender`'s catch has one branch for the flag: the mark cleared, the console line "S_StopSound: the render by itself did not run: the worker no longer holds what the render on screen left. Render makes it.", no `cancelledKey`; its `finally`'s `reconcileRender` marks the render. A change made while such a render waits to start (`renderAfter`) is not decided again, so a render that would now need a new encode clears the mark at its start and is refused too |
| 2. Three checks | the first render's `renderedFrom` is null and the press in the reviewer's sequence `'a'`, as values; `vad_threshold` -30 (a name the key on screen does not hold) marks and starts none (`changedAfterCodecOnly` already read both keys' names); the page opened from `file://` with the codec skipped: the render is made on the page's thread, and a changed volume marks it and starts none |
| 3. A demo's sender settings | `demoSenderValues()`: the `DEMO_IGNORES` values of the page's options for a demo, as JSON (null for another source); `presentRender` keeps the render on screen's in `state.renderedSender`; `rendersFromKept` refuses a difference, and `runRender` clears the mark when a render starts with other values. Checks on a synthetic Steam demo of 64.6 s, written by the suite (`longDemo`, the layout of `tests/demo.verify.mjs`): a changed volume starts one render, from the kept capture signal; then mic gain 2 and volume: marked, none starts |
| 4. The words | `docs/PAGE.md`: the render by itself starts from the codec's result, and with the codec skipped from the kept capture signal with first seconds; a demo's voice from the kept capture signal with none (`previewAllowed` refuses a demo, as PAGE.md's "The first seconds" says; the order's text gives a demo first seconds, which the code does not); it runs only in the worker that holds those stages. "In about a third of a first render's time" became about half a whole render's time in the page, 0.38 to 0.54 (measured in headless Chromium on the build machine). README step 3: a change on the receiver's side alone plays no first seconds with the codec on, and plays them with the codec skipped. [Browser 8] part 4's comment: jitter is read in the codec stage today (on `AFTER_A`, not `AFTER_B`) |
| 5. The timing | the paragraph "A wait inside these times", beside the table, with the reviewer's figures |

### The checks of ruling 18

On the rig of "a worker that does not answer a cancel" ([Browser 10], `speedKeptLost`, right after it): a 61 s source;
volume changed, and changed again while that render runs. The worker is ended at the cancel's bound (1415 ms), and the
render queued for the second change is refused: no render is shown, no line "from the start", the render is marked,
no `cancelledKey`, nothing on the page's thread, and the console has the line. The worker's `onerror` can be raised
in the suite: the test calls the page's own handler on the worker during a render by itself. Nothing renders on the
page's thread, and the render is marked.

### The fix round's breaks

Made as in the first round (the files taken back with `git checkout` after each), through the harness.

| Break | As made | The checks that failed |
| --- | --- | --- |
| the flag ignored in `prepare` | the line in `prepare` taken out | the worker ended at the bound (the queued render ran and was shown; no line); then the onerror check, whose press now started from the kept codec result |
| the worker breaking sends the render to the page's thread | the `fromKept` line in `runAudioProcess`'s catch taken out | the onerror check ("Audio worker unavailable; using compatibility path", one render shown) |
| `startedFrom` taken after the render | the line moved below `TF2Audio.process` in `audio-worker.js` | the first render's `startedFrom` (b, not null); the press in the reviewer's sequence (b, not a) |
| rule B over the names of the key on screen only | `Object.keys(a)` in place of both keys' names | `vad_threshold` -30 (one render started, from the kept capture signal) |
| the mark set without the worker | `workerKeepsShown = !made.live` | `file://` with the codec skipped (one render started on the page's thread) |
| a demo's sender values ignored | the line in `rendersFromKept` taken out | the demo with mic gain changed (one render started; ruling 18 then refused it, since `runRender` cleared the mark) |

### Done means, again

`CHROMIUM_EXECUTABLE=… flock /tmp/tf2ve-heavy.lock node tests/run.mjs browser` on the fixed tree: "== browser: passed,
417.2 s". `flock /tmp/tf2ve-heavy.lock pnpm test`: "27 of 27 suites passed" (the runner's own line). `git diff origin/main --stat -- engine audio.js voice-channel.js steam-sender.js
constants.js` prints nothing; `git diff origin/main -- audio-worker.js` shows the one field as before;
`git diff origin/main --stat -- tests/` shows `tests/browser.verify.js` only. `node tests/cache-number.mjs origin/main --report`: "cached files changed since
origin/main (39bdd8e): app/core.js, app/render.js, app/source.js, audio-worker.js" and "cache number against
origin/main (39bdd8e): the number is v42, not above v42: it must rise". `git diff origin/main --stat` shows the same
eight files as before, all in "May touch".
