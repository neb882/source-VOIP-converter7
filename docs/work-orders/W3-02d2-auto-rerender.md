# W3-02d-2: a longer source re-renders by itself after a receiver-side change

**Status 2026-11-13: planned, not built.** It is the second half of the order that was W3-02d, split off after a
plan reviewer read that order as its builder would. The first half is
[W3-02d-1](W3-02d-page-timeline.md), and this order is built after it. Line numbers are those of `main` at
`b3d2647` (cache v41); W3-02d-1 moves some of them in `app/render.js` and `app/core.js`.

**Kind:** a change to when the page starts a render. No render's samples change.
**Roles:** `tf-builder` (effort high), then `tf-reviewer`. No second reader: nothing a render computes changes.
**Branch:** `claude/w3-02d2-auto-rerender`, from `main` after W3-02d-1 is merged. **Worktree:** in the brief.
**Report:** `docs/reports/W3-02d2-auto-rerender.md`. **Budget:** 6 hours.
**Cache number:** rises. The builder does not set it.

## Why

A changed setting renders by itself only when the source is at most 60 s long
(`AUTO_RENDER_SECONDS`, `app/core.js:165`; the test is `short` at `app/render.js:766`). A longer source is
marked and waits for the button. The owner's clips are mostly music over a minute, so most of them are marked
after every change.

Agreed with the owner (PROGRESS, `next`, 2026-11-12): a changed setting re-renders a longer source by itself
when the change needs no new encode, because the render then starts from the kept codec result; a change that
needs a new encode still waits for the button. Ruled (2026-11-13, ruling 8): the limit goes by the device's own
time, not by a length. That departs from the letter of the earlier ruling ("set the length limit from a phone's
timing") and keeps its purpose: no render the user did not ask for runs long on a slow device. No phone is at
hand, and the device's own time needs none.

| What | Figure | Standing |
| --- | --- | --- |
| A whole render of a ten-minute source | 24.2 s | measured in Node on the build machine, one run (the plan's report) |
| The same from the kept codec result | 7.9 s on the file's own timing; 12.4 to 12.9 s on the game's (the gain off) | measured, the same run |
| The same with the page's defaults | 11.2 to 11.3 s and 13.2 to 13.7 s | measured (the W3-02c-2 report) |
| The browser's processor throttle and the page's worker | a loop in a worker took 394 ms unthrottled and 376 ms at rate 4; on the main thread 127 ms and 550 ms | measured here in headless Chrome, the reviewer's probe run again |

## The rule

`reconcileRender` (`app/render.js:758-775`) decides after each changed setting and after each render. For a
source of 60 s or less it stays exactly as it is. For a longer source it starts a render by itself, 400 ms after
the last change (`AUTO_RENDER_DELAY_MS`), when all four of these hold. Otherwise the render is marked, as today.

**A. A render of this source is on screen, and it is not a recorded live take.** `state.renderedSource` is
`state.decodedSource` and there is a render to show. With none on screen (the first render was cancelled or
failed) nothing starts. A live take is shown with a time of 0 (`mountLiveTake`, `app/render.js:669-670`) and the
page's worker never held its source.

**B. The change needs no new encode.** Every option that differs between the key of the render on screen
(`state.renderedKey`) and the key of the controls (`currentRenderKey()`, `app/render.js:715`) is a name in
`TF2Audio.STAGE_OPTIONS.afterB` (`audio.js:100`; the engine's `AFTER_B_OPTIONS`, `engine/render.js:49-50`). The
page reads the list from the engine when it decides and keeps no copy, so an order that moves an option across
stage B (BC-4 moves `jitterMs`) moves this rule with it. After W3-02d-1 `timeline`, `fps` and `bufferMs` are
names the page sends and names of the list.

**C. The worker still holds what the render on screen left.** Comparing keys is not enough. The engine deletes
a held codec result as soon as a render with another key for that stage takes from the stages
(`engine/render.js:243-248`), and the worker's stages go with the worker (`dropPageWorker`,
`app/render.js:117-121`). The sequence the reviewer gave: a long source; change `snd_bits` (marked); Render;
cancel; set `snd_bits` back and change `volume`. Rule B alone then starts a render that encodes again. So the
page keeps one mark on `state`, "the kept stage is the render on screen's":

- set when a render of this source made in the page's worker is shown (`presentRender`,
  `app/render.js:436-528`; the worker's path is `processInWorker`, `:245-262`);
- cleared when a render starts for this source whose options differ from the render on screen's in a name
  outside the list (`runRender`, `app/render.js:796-824`), whether it then finishes, fails or is cancelled;
- cleared when the worker is dropped, when another source is mounted, when a live take is shown, and when a
  render is made without the worker (`canUseWorker()`, `app/render.js:18`, false from `file://`).

With the mark clear the render is marked, and the next render the user asks for sets it again.

**D. The render on screen took at most `AUTO_RENDER_KEPT_MS` on this device**, a new constant beside
`AUTO_RENDER_SECONDS`, 30,000. `presentRender` stores the time it is given in `state.renderedTook`; today the
figure is a local of `runRender` (`took`, `app/render.js:839`). A time of 0 or none counts as not known, and the
render is marked.

- **What D compares.** The time of the render on screen, whichever stage that render started from. The limit is
  a limit on the automatic render's own time, and the render on screen gives the best figure the page has for
  it. When the render on screen was itself made from the kept stage, its time is what the next one will take,
  unless the timeline goes from the file's to the game's, which adds 2 to 5 s on ten minutes (measured, the
  table). When it was a whole render, its time is two to three times what the next one will take (measured:
  24.2 s against 7.9 to 12.9 s), so D errs toward marking: a clip whose whole render took 40 s is marked after
  its first receiver-side change, and after one press of Render, which then takes 13 to 21 s by those
  figures, it re-renders by itself.
- The other choice, keeping the whole render's time and comparing that, would hold a slow device to a third of
  the limit for good. It is not taken.
- 30,000 stands unless the timing below shows a render from the kept stage of a ten-minute source taking far
  less than the whole render in the page itself. The builder then says so in the report and the orchestrator
  may lower it.

A render the user cancelled is not started again by itself, as today (`app/render.js:762-766`). A demo and a
source with the codec skipped have no codec result to keep; rule B still passes for them, the render starts from
the kept capture, and rule D bounds it.

**Where the automatic render started.** `audio-worker.js` adds one field to its `result` reply: the value of
`TF2Audio.stagesHold(source, opts)` taken before the render starts (it already calls that at `:62`). The page
keeps it with the render. The checks below read it, and the console line of a render names it.

## The timing

The ruling asks that a re-render from the kept stage is timed before the limit moves. The first text of this
order asked for the browser's processor throttle. That does not work: `Emulation.setCPUThrottlingRate` slows the
page's main thread only, and the page renders in a worker (the table under "Why"; the worker's own target
refuses the call). So the builder times two things, with a script in the builder's scratch folder that is not
committed and is not a suite check:

1. **The page's own re-render, at full speed.** In the browser suite's Chromium (`launchBrowser`,
   `tests/browser.verify.js:2115-2124`, and the suite's server), a synthetic source of 1, 3 and 10 minutes: the
   time from a changed `volume` to the render shown, less the 400 ms delay, and the same for `voice_timeline`
   changed from `source` to `game`. Beside each, the time of the whole first render.
2. **The engine's render from the kept stage, slowed.** On the page's main thread, `TF2Audio.process` with a
   `stages` object: a whole render first, then a render with `volume` changed, timed at throttle rates 1, 4 and
   6, for the same three lengths. It is labelled as what it is: the engine's from-the-kept-stage time on a main
   thread slowed 4 and 6 times.

The table goes in the report with its standing: measured in headless Chromium on the build machine. It shows how
the time grows with the length, what share of a whole render a kept-stage render is in the page, and what a
processor 4 to 6 times slower would take for the engine's part. It does not show a phone's memory limit, its
heat, another browser's engine or a tab in the background.

## The documents

`docs/PAGE.md` ("What a render runs again", `:63-72`, and the sentence on what renders by itself), `README.md`
(step 3, `:35`): the rule in plain words, with the 30 s and "on this device". Both are read word for word in
places by `tests/miles.verify.mjs:747-780`; the sentences it holds stay as they are.

## Files

May touch: `app/render.js` (`reconcileRender`, `presentRender`, `runRender`, the worker's reply where the page
reads it, `dropPageWorker`, `mountLiveTake`); `app/core.js` (the constant, the fields of `state`);
`app/source.js` (only to clear the mark where a source is mounted); `audio-worker.js` (the one field of the
`result` reply); `tests/browser.verify.js`; `docs/PAGE.md`, `README.md`; the report. `sw.js`: never the number.

May not touch: anything under `engine/`; `audio.js`, `live-worker.js`, `live.js`, `voice-channel.js`,
`steam-sender.js`, `constants.js`, any codec module; `app/console.js`, `index.html`, `batch.js`; every Node
suite; `tests/predictions/predictions.json`; `docs/PROGRESS.json`, `docs/PROGRESS-LOG.md`, `docs/README.md`,
`CLAUDE.md`.

## What must not move

- Every render's samples. `git diff origin/main --stat -- engine audio.js voice-channel.js steam-sender.js
  constants.js` prints nothing, and `git diff origin/main -- audio-worker.js` shows the one field.
- Every behaviour for a source of 60 s or less: what renders by itself, when, and what is marked, as after
  W3-02d-1. The browser suite's checks on it pass unchanged.
- No recorded value of any suite: `git diff origin/main --stat -- tests/` shows `tests/browser.verify.js` only.
- The batch and the live monitor.

## Done means

1. `node tests/run.mjs browser` passes with new checks, on a synthetic source longer than 60 s whose render took
   under the limit. Each fails when the code it covers is broken:
   - a changed `volume`, a changed `fps_max`, a changed Phrase timing and a changed room each start exactly one
     render by themselves, and the worker reports that it started from the kept codec result;
   - a changed `snd_bits` and a changed `net_fakeloss` mark the render and start none;
   - a changed `volume` together with a changed `snd_bits` marks it and starts none;
   - the reviewer's sequence (change `snd_bits`; Render; cancel; `snd_bits` back; change `volume`): the render
     is marked and none starts; after one press of Render a changed `volume` starts exactly one;
   - with `state.renderedTook` set over the limit, and with it 0, a changed `volume` marks the render;
   - with no render of the source on screen (the first render cancelled), a changed `volume` starts none;
   - a recorded live take longer than 60 s: a changed `volume` marks it and starts none;
   - after the page's worker is dropped (the suite ends it as a cancel that does not stop in time does), a
     changed `volume` marks the render;
   - a render the user cancelled is not started again by a return to the same settings;
   - on a source of 60 s or less every check of the suite that was there before passes unchanged.
2. `flock /tmp/tf2ve-heavy.lock pnpm test` passes, and the `git diff` commands of "What must not move" print
   what that section says.
3. `node tests/cache-number.mjs origin/main --report` says the number must rise. Its line is in the report.
4. `git diff origin/main --stat` shows no file outside "May touch".
5. The report holds the timing table with its standing and what it does not show; the share of a whole render
   that a kept-stage render took in the page; the breaks; what was not checked.

## The breaks the builder makes

| Break | The check that must fail |
| --- | --- |
| rule B lets every option through | a changed `snd_bits` on a long source starts no render |
| the list of rule B is a copy that lacks `fps` | a changed `fps_max` starts exactly one render |
| rule B compares the controls with the last render started, not the one on screen | the reviewer's sequence |
| rule C is left out | the reviewer's sequence; the worker dropped |
| the mark is not cleared for a live take | a live take: a changed `volume` starts none |
| rule D is left out | with the time over the limit a changed `volume` marks the render |
| a time of 0 counts as fast | with the time 0 a changed `volume` marks the render |
| rule A is left out | with no render on screen nothing starts |
| the rule is applied to a source of 60 s or less | the suite's earlier checks on a short source |
| the timer is not cleared when a second change comes | exactly one render |

## Stop and ask

- An automatic render of a source with a codec stage is seen to start from another place than the kept codec
  result. Rule C then misses a way the stage is lost, and the way is named before anything else is built.
- The page cannot know that a render started without cost to a short source's behaviour.
- In the page a render from the kept stage of a ten-minute source takes more than half the whole render's time,
  or less than a fifth. The limit of rule D is then the orchestrator's to set again.
- A check of the suite on a source of 60 s or less stops passing.

## What the reviewer attacks

Every way a kept stage is lost: another key, a cancel in the middle of the encode, a failed render, a new file
and the old one loaded again, the capture channel changed and changed back, a render made while the batch held
the workers, a page opened from `file://`. Two changes inside 400 ms. A change while an automatic render runs. A
demo and a source with the codec skipped. The first seconds played early: none are made when the render starts
from the kept stage (`audio-worker.js:62`). The words of the two documents against the rule.

## Rulings

The orchestrator's ruling of 2026-11-13 that applies to this order:

8. The automatic re-render of a longer source goes by the device's own time (rule D), not by a length.
   `AUTO_RENDER_KEPT_MS` is 30,000 unless the builder's timing shows a render from the kept stage of a
   ten-minute source taking far less than the whole render, in which case the builder says so and the
   orchestrator may lower it.

Written in after the plan review, and not ruled on yet: rules A and C; what rule D compares; the timing's two
measurements in place of the processor throttle; the one field `audio-worker.js` adds.

### Ruled after the second plan pass (2026-11-13, the orchestrator)

13. Rules A and C stand as written. A missed way of losing the kept stage is a stop-and-ask, not a reason to
    widen the rule by guess.
14. Rule D compares the time of the render on screen, whichever stage it started from. It errs toward marking
    after a whole render and corrects itself after one press of Render.
15. The timing is the two measurements of "The timing". The browser's processor throttle is not used for the
    page's own render, since it does not slow the worker (measured, the table under "Why").
16. `audio-worker.js` may add the one field to its `result` reply. Nothing else in that file changes.

### Ruled after the build (2026-11-13, the orchestrator)

17. **`AUTO_RENDER_KEPT_MS` stays 30,000.** The builder stopped on the stop condition: in the page, a render from
    the kept stage of a ten-minute source took 0.45 to 0.54 of the whole render (five runs; once 16.6 s against
    31.0 s), about half, not two to three times faster as "What D compares" put it (measured by the builder in
    headless Chromium on the build machine; the report has the table). The limit is a limit on the automatic
    render's own time. At about half, an automatic render after a whole render under 30 s takes at most about
    16 s, and one after a render from the kept stage under 30 s takes at most about 30 s, a few seconds more when
    the timeline goes from the file's to the game's. Both are what ruling 8 meant. "Two to three times" in "What
    D compares" reads "about twice (0.45 to 0.54 of the whole render, measured in the page)".
