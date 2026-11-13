# W3-02d-1: the page renders on the game's timeline

**Status 2026-11-13: planned, read by a plan reviewer, not built.** This is the second text of the order. The
first was written by a planner at `9d5113a`, ruled on by the orchestrator, and read by a plan reviewer as its
builder would read it. The reviewer's ten findings are written in, the rulings are folded into the text (a list
of them is at the end), and the order is split in two: this one, and
[W3-02d-2](W3-02d2-auto-rerender.md), the automatic re-render of longer sources, which is built after it. Line
numbers are those of `main` at `b3d2647` (cache v41). The section "W3-02d" of
[the old order](W3-02-receiver-queue.md) no longer needs to be read. The planning run is in
[the plan's report](../reports/W3-02cd-plan.md).

**Kind:** a change to the page, the console and the documents. It does not change how the engine computes a
render. It changes which render the page asks for by default, so the page's default sound moves.
**Roles:** `tf-builder` (effort high), then `tf-reviewer`, and a second reader on the stronger model for the diff
of `app/render.js` and `app/source.js` (a wrong mapping of the new options makes a render throw or silently keep
the other timeline). **Branch:** `claude/w3-02d1-page-timeline`, from `main`. **Worktree:** in the brief.
**Report:** `docs/reports/W3-02d1-page-timeline.md`. **Budget:** 12 hours.
**Cache number:** rises (files the site keeps offline change). The builder does not set it.

## Why

Since W3-02c-2 a render runs the game's voice queue when it is asked with `timeline: 'game'`, `fps` and
`bufferMs`. The page does not ask. Its render keeps every sound where the source has it, and its only timing
control is "Talk-spurt timing", a flat rule that was fitted to one set of takes.

Decided (PROGRESS, 2026-11-10, and the rulings of 2026-11-13): the page's default is the game's timeline at 300
frames a second with `voice_buffer_ms` 100; the file's own timing stays one setting away; the flat rule is no
longer offered. The figures behind it:

| What | Figure | Standing |
| --- | --- | --- |
| A `'game'` render at 300 frames a second has the take's kind of change between phrases | 327 of 360 seed-changes at pauses of 240 ms; 114 of 300 around 420 to 440 ms; 155 of 270 on the speech take | measured, private runs (finding 28, the W3-21 report) |
| The same at 66.67 frames a second | no better than no timing model | measured, private (the same runs) |
| The wait before a new phrase plays | about 90 ms at 67 frames a second, 135 ms at 100, 435 ms at 300 | read; the game's logs agree (finding 23) |
| Unbroken sound for ten minutes at 300 frames a second | no dip and no gap in 26 seeds; the level first dips at 11.6 to 12.0 minutes | measured on the model (the plan's report) |
| Unbroken sound at 66.67 frames a second | the level first dips at 0.4 to 3.2 minutes (median 2.2); it is first more than 3 dB down at 2.4 to 4.8 minutes (median 3.7); from minute 7 two thirds of it is more than 3 dB down | measured on the model; the rules are read; no take |
| The same at 100, 144 and 200 frames a second | first dip at 2.5 to 4.9 minutes, at 5.1 to 8.0, and at 8.7 to 9.9 in 9 of 20 seeds | measured on the model; no take |
| The render's clock on the game's timeline | 0.04% fast. At 300 frames a second it gains about 0.4 ms every second and the end of ten minutes plays 0.24 to 0.28 s ahead of the source. At 66.67 the gain stops once the queue is empty, at 0.12 to 0.16 s | measured on the model; the takes' +400 parts in a million is measured |
| What a channel drops when it opens at 300 frames a second | 74 to 136 ms in the first seconds of an unbroken source (the game's logs: 55 to 136 ms) | measured on the model; the logs are measured (finding 23) |

The owner's clips are mostly music, often longer than a minute. At 300 frames a second the queue does not thin
such a clip inside the page's ten-minute limit. At a low frame rate it does, and the page says so beside the
control.

**What this order leaves as it is.** A source longer than 60 s is marked after any changed setting and waits for
the button (`app/render.js:766`), exactly as today. W3-02d-2 changes that.

## What changes

### 1. Three controls

| Control | `id` | Where in `index.html` | Console name | Values | Default | Settings key | A preset |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Listener's frame rate | `fps` | the Receiver box, after `voice_scale` (`index.html:170-174`) | `fps_max`, shown on the label (the game has it) | a number, 10 to 1000 | 300 | `fps` | leaves it alone |
| Voice buffer | `buffer_ms` | the Receiver box, after `fps` | `voice_buffer_ms`, shown on the label | a whole number, 1 to 5000 | 100 | `buf` | sets it to 100 |
| Phrase timing | `timeline` | the Extras box, in the place of `retime` (`index.html:285-292`) | `voice_timeline`, the app's name, not shown on the label | `game` "The game's voice queue"; `source` "The file's own timing" | `game` | `tl` | sets it to `game` |

The limits are the module's own (`voice-channel.js:52-57`). The engine's default stays `'source'`; only the page's
moves.

- **The frame rate is the rate the listener's game reaches.** The game's `fps_max` caps it. The page takes one
  figure for the whole render, and the help says both. It is a property of the listener's PC, like the sound
  device's rate, so a preset leaves it alone.
- **The lists hold settings keys, not ids** (`tests/browser.verify.js:1857-1860` holds them to `CONFIG_FIELDS`).
  `CONFIG_FIELDS` (`app/console.js:748-783`): the key `retime` (`:782`) goes; `tl`, `fps` and `buf` come.
  `PRESET_SET_FIELDS` (`app/core.js:173-175`): `retime` goes; `tl` and `buf` come. `KEPT_ACROSS_PRESETS`
  (`app/core.js:176`) reads `["uptime","dev","chan","fps"]`, and the suite's literal at `:1859` with it.
- **The suite's lists of controls hold ids.** `fps` joins `CONTROLS_PCS` (`tests/browser.verify.js:1221`) and
  `buffer_ms` joins `CONTROLS_GAME` (`:1219`), with `fps: 'fps_max'` and `buffer_ms: 'voice_buffer_ms'` in
  `CONTROLS_NAMED` (`:1225`). `timeline` takes `retime`'s place in `CONTROLS_EXTRAS` (`:1222`). It is an extra
  because its second value is the app's own.
- `els.retime` (`app/core.js:78`) goes; `els.timeline`, `els.fps` and `els.bufferMs` come.
- `constants.js` is not touched: no built-in preset names a timeline.

**The words.** Three rules of the suites bind them:

- `verifySettingsWords` (`tests/browser.verify.js:1594-1606`) fails a help text that has a sentence over 115
  characters.
- The same check wants each linked console command's help to contain the first sentence of its control's help.
- `tests/miles.verify.mjs:747-780` reads `README.md`, `docs/VOICE-PATH.md` and `docs/PAGE.md` for sentences it
  holds word for word. A paragraph edited there must leave those sentences as they are.

The facts each help must carry (`class="control-help"`). The sentences in quotes fit the 115 characters and may
be used as they are; the builder may word them otherwise but drops no fact and adds no figure.

- `fps`: "How many frames a second the listener's game draws." "A new phrase waits before it plays, longer at a
  higher rate: about 0.09 s at 67 and 0.44 s at 300." "The game's fps_max caps the rate; 300 is its default."
  "At 200 or less, sound that never pauses for minutes thins out; at 67 the level first dips after about 2
  minutes." "That is the game's rule as read, run on the model; no recording shows it." The 2 minutes are the
  median of the table's row for 66.67.
- `buffer_ms`: "The wait before a new phrase plays, in milliseconds." "The game counts it down one frame at a
  time, so it lasts longer at a higher frame rate." "The game's default is 100."
- `timeline`: "The game queues each voice, so a phrase after a short pause can start early." "It can come early
  by up to about the wait, and the sound runs 0.04% fast." "Which phrases move depends on the sender's clock,
  which no recording shows." "The file's own timing keeps every sound where the source has it." "The live
  monitor always keeps the file's own timing."

"Up to about the wait" is the bound the rule gives (read): a phrase that joins a running queue comes early by no
more than the queue holds, which is about the wait, 0.44 s at 300 frames a second and less at a lower rate. The
takes' early starts were 80 to 350 ms (measured, finding 19); the page does not give that figure as the model's.

### 2. What the page sends

`renderOptions()` (`app/render.js:308-344`) no longer sends `retime` (`:321`). It sends:

| Case | `timeline` | `fps`, `bufferMs` |
| --- | --- | --- |
| the codec is `steam`, the codec is on (`warble_on` 1) and Phrase timing is `game` | `'game'` | the two controls' numbers |
| anything else | `'source'` | not sent (`undefined`) |

`fps` and `bufferMs` are left out under `'source'` for the reason `gateThresholdDb` and `steamUptime` are left out
at `:331` and `:334`: a change that changes no sample must not change the key a render is kept by. The engine
reads the two numbers only on the game's timeline (`engine/render.js:595`).

`renderOptions()` reads the controls only, because the batch shares it (`batch.js:291`). Three kinds of source
keep the file's own timing whatever the control says. The override is made where the source is known,
`settingsKey()` (`app/render.js:298-305`) and `runRender` (`app/render.js:821-824`):

- **A demo's voice.** The engine refuses `'game'` with `opts.received` (`engine/steam.js:105`). W3-02g lifts
  that; it is not built yet.
- **A source from a video file.** On the game's timeline the sound would lead the picture, by up to about the
  wait at a phrase and by a quarter of a second at the end of ten minutes. The flag must be set before the first
  render starts. `mountSource` (`app/source.js:15`) starts that render itself (`:56`), and `state.sourceVideo` is
  set only after the load returns (`:418`), and only for an MP4 or MOV the page can write back. So the flag is
  an option of `mountSource`, handed down from `loadSourceFile` (`:400-402`, `isVideoFile` at `:322`) through
  `loadSourceFromArrayBuffer` (`:83`, its call at `:416`, its call of `mountSource` at `:91`). `mountSource` sets
  it on `state` before `renderNewSource()`, true for every video file and false for every other source.
- **A recorded live take.** The monitor keeps the file's own timing (below), so the key `mountLiveTake` gives its
  take (`app/render.js:670`, `key: settingsKey()`) is the page's key with `timeline: 'source'` and no `fps` or
  `bufferMs`. With Phrase timing on `game` the take is then a render made with other settings. It is marked as
  one, and no render starts by itself until a setting changes or Render is pressed, as for a render the user
  cancelled (`app/render.js:762-766`). Without that, `presentRender`'s own call of `reconcileRender` (`:527`)
  would replace a recording of 60 s or less with an offline render 400 ms after it is shown. Its status line
  says it was recorded live on the file's own timing and that Render gives it on the game's queue.

Where Phrase timing says `game` and the render keeps the file's timing, a line under the control gives the
reason: "the codec is skipped", "a demo's voice", "a video keeps its picture's timing". For another codec than
`steam` the three controls are hidden, as "Sender's Steam has been running" is (`app/console.js:554`), so that
case needs no line.

Other callers:

- **The batch** (`batch.js:291`) takes `renderOptions()` as it is. A video file in the batch gives audio only and
  takes the page's setting.
- **The live monitor** (`live.js:39`) keeps the file's own timing: `liveOptions()` sends `timeline: 'source'` and
  no `fps` or `bufferMs`, so a changed frame rate does not restart the monitor's chain
  (`live-worker.js:47`, `:122`). The monitor's own switch for the queue is
  [W3-02c-3](W3-02c3-live-channel.md), not built yet, ruled to come after BC-4.
- **`tests/accuracy.mjs`** builds its options from the page's `renderOptions()` in four places (`:100`, `:135`,
  `:167`, `:411`). Each gets `timeline: 'source'` before `...settings`, with `fps` and `bufferMs` not sent.
  Without the pins the `steam` hypotheses of the registered predictions would be made on another timeline and
  the note at `tests/predictions/PREDICTIONS.md:188` would stop being true. Whether the accuracy tables move to
  the game's timeline is a later order's.
- **The early play of a long clip's first 14 s** is still made on the game's timeline:
  `TF2Audio.previewAllowed` (`engine/render.js:296-303`) allows it, and `tests/stages.verify.mjs:491` holds it
  at 300 and at 66.67 frames a second. The documents' list of what stops it loses "talk-spurt timing".

### 3. The console

- `fps_max`, `voice_buffer_ms` and `voice_timeline` join the linked variables (`app/console.js:326-345`), each
  with a help that contains its control's first help sentence. `voice_timeline` says it is the app's name.
- `voice_retime` (`app/console.js:332`) stays as an old name: `voice_retime 1` sets `voice_timeline game`,
  `voice_retime 0` sets `voice_timeline source`, and each prints one line saying that the flat rule is no longer
  offered and which variable took its place.
- A preset (`runPreset`, `app/console.js:643-690`) runs `voice_timeline game` and `voice_buffer_ms 100` where it
  runs `voice_retime 0` today (`:675`). It does not touch `fps_max`. This holds for every preset, the ones with
  loss included: one timeline for every `steam` render.
- **Saved settings.** `applyConfig` (`app/console.js:915-937`) reads the remembered settings, a share link and
  the user's presets. A saved `retime` of `1` becomes `tl=game` when no `tl` is saved. A saved `retime` of `0`
  is dropped, so a returning visitor gets the new default. The new migration is a function in `app/console.js`,
  called where `migrateRoomConfig` is called (`:918`; that function is defined at `app/rooms.js:221` and is the
  pattern).
- **The chain strip's Receiver cell** (`app/console.js:614-616`) loses "spurts re-timed". It says
  "queue at 300 fps" (the number is the control's) when the controls ask for the queue, and "the file's own
  timing" when the codec is `steam` and they do not.
- **After a render on the game's timeline** one console line, from `codecInfo.channel`
  (`presentRender`, `app/render.js:436-528`): the frame rate, the wait in ticks and milliseconds, how many phrases
  opened the channel and how many joined a running one (`opens`, `appended`), and the milliseconds dropped to
  overflow (`droppedSamples`).

### 4. Beside "Hear"

A line beside the group `#ab-group` (`index.html:340-345`) is shown while the render on screen was made on the
game's timeline. It follows the render, not the controls: it is shown when `state.lastCodecInfo`
(`app/render.js:508`) has a `channel`, and hidden otherwise. Its facts: Rendered and Original do not stay in
step; a phrase can start early by up to about the wait; at 300 frames a second the render also gains about
0.4 ms every second.

### 5. The tests' lists

**`tests/stages.verify.mjs`.** `RENDER_OPTION_NAMES` and `PAGE_DEFAULTS` (`:115-119`) are the page's, and
`tests/browser.verify.js:2960-2964` holds the first to the page's `renderOptions()`.

- `retime` leaves `RENDER_OPTION_NAMES` for the engine's own names (`:149`), with a case of its own in the
  suite's extra cases. `timeline`, `fps` and `bufferMs` join it, with `'game'`, 300 and 100 in `PAGE_DEFAULTS`
  and a changed value each in `CHANGES`. The rows of `:171-173` are then covered and go.
- With those defaults the engine refuses, with a `RangeError`, every case that is not `steam` with its codec on
  (the reviewer's probe showed each). So the suite gets
  `SOURCE_BASE = { ...PAGE_DEFAULTS, timeline: 'source', fps: undefined, bufferMs: undefined }`, which is what
  the page sends there, and uses it for:
  - `CELT_BASE` (`:150`) and the demo's row (`:162`);
  - section 2's changes of `codec` (`:121`) and of `enableWarble` (`:141`) on the `steam` base, and the
    `retime` case;
  - section 3's base (`:246`), which feeds a `celt_22` render (`:419`) and the `retime` renders (`:432-438`);
  - section 4's loop for every codec but `steam` (`:480-481`), and its cases with the codec skipped, with
    `celt_22` and with `retime` (`:489-499`).
- Sections 2, 3 and 4 compare one render with another and hold no recorded value. Section 1's recorded values
  are read from `tests/render-stream.verify.mjs`, which is not touched.

**`tests/browser.verify.js`.** `:1024-1025` (a preset turns re-timing off), `:1608-1637` (the words of
`retime`) and `:1859` (the kept list) change with the controls. A check that compares the live monitor's
recording with a render (`docs/LIVE.md`'s smoke test) renders with `voice_timeline source`, and says why.

### 6. The documents

| File | What changes |
| --- | --- |
| `docs/PAGE.md` | the three controls under "Settings"; in "What a render runs again" (`:68`, `:87`) the new names only, the rule itself unchanged; the console's variables; the batch, the video and the live take; the line beside Hear |
| `docs/ACCURACY.md` | every "the page does not offer it" (`:15`, `:24`, `:46`, `:98`, `:192`): the page's render runs the queue by default; the flat rule's row (`:18`) says the page no longer offers it; the list below |
| `README.md` | step 3 (`:35`): the names, the rule unchanged; "What is not exact" (`:87-91`); "Where the modern preset stands" (`:96-100`): the fade and the voice channel leave "not in the page's render" and "not built yet"; the files table (`:164`) |
| `docs/VOICE-PATH.md` | `:19`, `:71-80`: the page runs the queue; the stand-in is gone from the page |
| `docs/LIVE.md` | `:25-26`: the monitor keeps the file's own timing while a render runs the queue (W3-02c-3, not built yet); `:14` names `tests/verify.js` for section 10b, which is in `tests/steam.verify.js` |
| `docs/FINDINGS.md` | only a sentence that says the page does not run the queue, if one is found |

**What the page says is not exact** (each with its standing, phrase timing first, in `README.md` and
`docs/ACCURACY.md`; `docs/PAGE.md` points there):

1. Which phrases start early. A render shows one draw of the sender's clock. The first two rows of the table
   under "Why".
2. The frame rate is one number. A real game's rate moves, and one long frame ends the wait at once (read). What
   that does to a render is guessed.
3. The start and the end. A render can lose its first moments (up to 56 ms at 66.67 and 100 frames a second;
   11 ms at 300 in about one seed in a hundred) and up to 47 ms of its end at the lower rates (measured on the
   model, the W3-02c-2 report).
4. Long unbroken sound at a low frame rate: the rows of the table under "Why", with their standing.
5. Loss on the game's timeline: at 15% the render at 300 frames a second is silent 16.4% of the time against
   10.1% in the one take (measured, private; the check against the game's log, BC-3, is not done).
6. Jitter is still the fit to one recording; jitter as the game does it (BC-4) is not built yet.
7. The codec lane and the real-take panel were made for the file's own timing (W3-02e, not built yet).

## Files

May touch: `index.html`; `app/core.js`, `app/console.js`, `app/render.js`; `app/source.js` (the video flag's
path only: `mountSource`, `loadSourceFromArrayBuffer`, `loadSourceFile`); `live.js` (`liveOptions` only);
`batch.js` (only if a test shows it needs a line); `style.css` (only the line beside Hear and the note under
the control); `tests/browser.verify.js`; `tests/stages.verify.mjs` (the lists, `SOURCE_BASE`, and the bases of
sections 2, 3 and 4 only); `tests/accuracy.mjs` (the four lines `:100`, `:135`, `:167`, `:411` only); the
documents of part 6; the report. `sw.js`: never the number.

May not touch: anything under `engine/`; `audio.js`, `audio-worker.js`, `live-worker.js`, `voice-channel.js`,
`steam-sender.js`, `constants.js`, `reference.js`, any codec module; `app/rooms.js`; `app/realtake.js`,
`app/visualizer.js`, `app/netgraph.js` (W3-02e's); `tests/REFERENCE_2026.md`;
`tests/predictions/predictions.json`; every other suite; `docs/PROGRESS.json`, `docs/PROGRESS-LOG.md`,
`docs/README.md`, `CLAUDE.md`.

## What must not move

- No recorded value of any Node suite. `git diff origin/main --stat -- tests/` shows `tests/browser.verify.js`,
  `tests/stages.verify.mjs` and `tests/accuracy.mjs` only.
- The engine: `git diff origin/main --stat -- engine audio.js audio-worker.js live-worker.js voice-channel.js
  steam-sender.js constants.js` prints nothing. So the engine's default render, with no `timeline` given, is
  what it was.
- The page's render with Phrase timing on "The file's own timing" (done means, 1).
- The registered predictions: `tests/predictions/predictions.json` is not written, and the four pins keep what
  `tests/accuracy.mjs` renders.
- The live monitor's sound: its chain's options hold `timeline: 'source'` and no `fps` or `bufferMs`.
- A source longer than 60 s: after any changed setting it is marked and no render starts.

## Done means

1. `node tests/run.mjs browser` passes with new checks. Each fails when the code it covers is broken (the breaks
   are below):
   - on load, and after "Reset", the three controls read `game`, 300 and 100, and `renderOptions()` gives
     `timeline: 'game'`, `fps: 300`, `bufferMs: 100` and no `retime`;
   - the page's default render of the suite's speech fixture is, sample for sample, `TF2Audio.process` of the
     same source with those options, and differs from the render with `voice_timeline source`;
   - at `fps_max 67` and `voice_buffer_ms 200` the page's render is, sample for sample, `TF2Audio.process` with
     those two numbers, and its `codecInfo.channel.fps` and `.bufferMs` are 67 and 200;
   - with `voice_timeline source` the page's render is, sample for sample, `TF2Audio.process` of the same source
     with the options `main`'s `renderOptions()` sends for the same controls, written out in the test as a
     literal (they hold `retime: false` and no `timeline`);
   - each built-in preset renders without an error; the `legacy` preset (its codec is `celt_22`) sends
     `timeline: 'source'` and no `fps`, and the three controls are hidden;
   - with the codec skipped and with a demo as the source, the render is made with `'source'`, the line under
     the control gives the reason, and no render throws;
   - a source from a video file, 60 s or less and longer: exactly one render follows the load, its `codecInfo`
     has no `channel`, it is not marked, and the line under the control gives the reason. The suite's own
     fixtures are used: one the page can write back (`vp9_opus.mp4`, `tests/browser.verify.js:661`) and one it
     cannot (`tests/filerate/tone_16000.webm`, `:231`);
   - under "The file's own timing", a changed frame rate changes no key: the render on screen is not marked and
     nothing renders;
   - `voice_retime 1` and `voice_retime 0` set the timeline and print their line; a remembered `retime` of `0`
     leaves `game`; with `voice_timeline source` set first, a share link with `retime=1` gives `game`; a link
     with `tl=source&fps=67&buf=200` gives those three values, and `writeconfig` writes them back;
   - a preset leaves `fps_max` as it was and sets `voice_buffer_ms` to 100 and `voice_timeline` to `game`;
   - the line beside Hear is shown after a render on the game's timeline and hidden after one on the file's; on
     a source longer than 60 s, a changed Phrase timing marks the render and the line stays as the render on
     screen has it;
   - a recorded live take with Phrase timing on `game`: its key holds `timeline: 'source'` and no `fps`; it is
     marked; no render starts by itself, whatever its length; the line beside Hear is hidden; one press of
     Render gives a render on the game's timeline;
   - the monitor: a changed `fps_max` while it runs does not restart its chain;
   - on a source longer than 60 s, a changed `volume` and a changed `fps_max` each mark the render and start
     none.
2. `node tests/run.mjs stages` passes, and the browser check that holds its list to the page's passes.
3. `flock /tmp/tf2ve-heavy.lock pnpm test` passes, and the two `git diff` commands of "What must not move"
   print what that section says.
4. `node tests/cache-number.mjs origin/main --report` says the number must rise. Its line is in the report.
5. `git diff origin/main --stat` shows no file outside "May touch".
6. The report holds: each sentence of the page that carries a figure, with the figure's standing and the row it
   comes from; the documents changed; the breaks; what was not checked.

## The breaks the builder makes

Each is made, the named check is seen to fail, and the break is taken back. The report lists them.

| Break | The check that must fail |
| --- | --- |
| `renderOptions()` sends `'game'` whatever the codec | each built-in preset renders without an error |
| `renderOptions()` sends 300 and 100 whatever the two controls say | the render at `fps_max 67` and `voice_buffer_ms 200` |
| with Phrase timing on `source` the page still sends `'game'` | the render with `voice_timeline source` is `main`'s |
| `fps` is sent under `'source'` | a changed frame rate under the file's own timing changes no key |
| the demo's override is left out | a demo renders with `'source'` and does not throw |
| the video flag is set after the load returns, as `state.sourceVideo` is | a video's load is followed by exactly one render, with no `channel` |
| the flag is set only for a video the page can write back | the same, on the other fixture |
| a saved `retime` of `0` is read as `tl=source` | a remembered `retime` of `0` leaves `game` |
| the migration of `retime=1` is left out | with `voice_timeline source` set first, a link with `retime=1` gives `game` |
| a preset sets `fps_max` to 300 | a preset leaves `fps_max` as it was |
| the line beside Hear follows the controls | on a long source a changed Phrase timing leaves the line as it was |
| the live take keeps the page's key | a live take's key holds `timeline: 'source'` |
| the live take is not held back | no render starts by itself after a live take |
| `liveOptions()` passes the page's timeline on | a changed `fps_max` does not restart the monitor |

## Stop and ask

- A browser check that is not named above stops passing and the reason is not the new default.
- The page's render on "The file's own timing" is not `main`'s render, sample for sample.
- A help sentence cannot carry its facts inside 115 characters, or a paragraph that must change holds a sentence
  `tests/miles.verify.mjs` reads word for word.
- The video flag cannot reach `mountSource` without a change outside the three functions named.
- Holding a live take back needs more than the rule a cancelled render follows.
- The real-take panel or the codec lane shows something false, not only something shifted, for a render on the
  game's timeline. The real-take panel compares levels over the whole overlap
  (`app/realtake.js:183-205`), which a shift of under half a second should not disturb (inferred from the code,
  not measured).

## What the reviewer attacks

A render that throws: every codec in the menu (the two that were never in TF2 included, `steam_48` and `miles`),
the codec skipped, a demo, a video, the batch with a video file. A change that renders twice or not at all. The
key under `'source'` when the two numbers change. Old share links and old user presets with `retime`. A video
loaded after an audio file and an audio file after a video. A live take of 20 s and of 90 s. Every figure in the
page's new words against the table of "Why" and its standing. The words "not built yet" wherever W3-02c-3,
W3-02d-2, W3-02e, W3-02g, BC-3 or BC-4 is named.

## Rulings

The orchestrator's rulings of 2026-11-13 that apply to this order. Each is in the text above.

1. The default is the game's timeline at 300 frames a second with `voice_buffer_ms` 100.
2. "Talk-spurt timing" gives way to "Phrase timing"; the page no longer sends `retime`; `voice_retime` stays as
   an old name.
3. A remembered `retime` of 0 is dropped.
4. The frame rate is kept across presets.
5. `voice_buffer_ms` is a control in the Receiver box, set to 100 by presets.
6. The presets with loss render on the game's timeline too; the documents carry the figure known to be off.
7. A source from a video file keeps the file's own timing.

Ruling 8 goes with [W3-02d-2](W3-02d2-auto-rerender.md). Rulings 9 and 10 are
[W3-02c-3](W3-02c3-live-channel.md)'s.

Two points of this text are the second plan pass's own and no ruling covers them yet: a live take is held back
from an automatic render (part 2), and the break for the `voice_timeline source` check is "the page still sends
`'game'`", because the engine reads no `fps` under `'source'` and a sample check cannot see one sent.

### Ruled after the second plan pass (2026-11-13, the orchestrator)

11. A recorded live take is held back from an automatic render, as a cancelled render is (part 2). The take is
    what the person just made; replacing it 400 ms after it is shown would lose it without their asking. Its
    status line says how it was made and that Render gives it on the game's queue.
12. The break for the `voice_timeline source` check is "the page still sends `'game'`". A sent `fps` under
    `'source'` is caught by the key check, which is where it does harm.

Both are in the text above and bind the builder as the other rulings do.
