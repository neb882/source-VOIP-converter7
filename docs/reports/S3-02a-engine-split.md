# S3-02a: `audio.js` moved, unedited, into ten files under `engine/`

The builder's report. The order is `docs/work-orders/S3-02-engine-split.md`, down to and including S3-02a, "The
documents" and Appendices A and B, with the rulings of 2026-11-12, and the orchestrator's brief. Branch
`claude/s3-02a-engine-split`, from `64d9001` (S3-01a, S3-01b and S3-03 merged, cache v36), which is `main` now.
`git hash-object audio.js` on `main` was `ec9780f401dd712f3db6c28cd27efd20570c1afa`, the blob the order was read
against.

**Status:** built. Every line of the old `audio.js` is in exactly one of the eleven files, unedited, except the
three lines of the stale banner "Main processing function", which were dropped; the only lines that are not moves
are the files' heads and tails, the list added to `audio.js`'s header, and the four things of step 4.5. No suite
that renders sound printed anything different (below). No recorded hash, `predictions.json`, the `CACHE` line, a
vendored file, `steam-sender.js`, `voice-channel.js`, `room-dsp.js` or `opus-codec.mjs` changed.

## Commits

| Commit | What |
| --- | --- |
| `7db4e3e` | Step 2: `loadEngine()` returns `parts`; `PART_DIR` and `PART_FILES`; the harness's checks of the split |
| `5f88b18` | Step 2, continued: those checks run before the loads, so a break names its file first (below) |
| `64ea7d9` | Step 3: `MODEL_FILES` is `PART_FILES`, then the nine names it had |
| `bc7fb19` | 4.1 `engine/dsp.js` |
| `bbbce3c` | 4.2 `engine/gain.js` |
| `6f94b22` | 4.3 `engine/mix.js` |
| `3f0c18a` | 4.4 `engine/network.js` |
| `2728653` | 4.5 `engine/codec.js`, with the four things that are not moves |
| `b44d21d` | 4.6 `engine/room.js` |
| `7a00654` | 4.7 `engine/steam.js` |
| `d0d5e02` | 4.8 `engine/render.js` |
| `0adcbc6` | 4.9 `engine/render-stream.js` |
| `0f93256` | 4.10 `engine/live-chain.js` |
| `1a7afdc` | Step 5: the resampler's licence in `ASSETS`; the allowance for it gone |
| `2e3c218` | Step 6: comments only |
| `2cde00b` | Step 7: the documents |
| this commit | Step 9: this report |

Step 2b was not built: S3-01b repaired `[Browser 3e]` (ruling 2; the brief).

## The ten moves

Each step's commit names `audio.js`, the new file and the five lists, and nothing else (`git show --stat`: 7 files
each). "Free" is the names the file uses and does not declare (the parser, `free-names.cjs`); "unused" is what it
declares at its function's top and never uses. Every file's "unused" is "none" at every step. The free names are
those of the order's table "What each file needs from the page" at every step, and `audio.js`'s shrink to the
page's globals its remaining code reads.

| Step | Move tool (`moved.mjs`) | Free names of the new file | `audio.js`'s free names after | CI run, wall time |
| --- | --- | --- | --- | --- |
| 4.1 dsp | 3,245 lines before, 2,801 after, body 444: a move | `WorkerGlobalScope`, `MessageChannel`, `setTimeout`, `Blob` | `VOICE_ENGINE`, `TF2Opus`, `TF2Room`, `TF2_ROOM_PRESETS`, `LISTENER_POSITIONS`, `TF2SteamSender`, `TF2Swresample`, `CODEC_PROFILES`, `module` | 43227278065, success, 5 min 4 s |
| 4.2 gain | 2,801, 2,648, body 153: a move | none | the same | 43228152917, success, 5 min 39 s |
| 4.3 mix | 2,648, 2,226, body 422: a move | `VOICE_ENGINE` | the same | 43230503520, success, 4 min 55 s |
| 4.4 network | 2,226, 2,085, body 141: a move | `VOICE_ENGINE` | the same | 43231410526, success, 5 min 20 s |
| 4.5 codec | 2,070, 2,029, body 41: a move, with `--but` (seven lines) | none | the same | 43232325155, success, 5 min 0 s |
| 4.6 room | 2,042, 1,909, body 133: a move | `TF2Room`, `TF2_ROOM_PRESETS`, `LISTENER_POSITIONS` | `TF2Opus`, `TF2SteamSender`, `TF2Swresample`, `CODEC_PROFILES`, `VOICE_ENGINE`, `module` | 43233323758, success, 4 min 47 s |
| 4.7 steam | 1,909, 1,585, body 324: a move | `TF2SteamSender`, `TF2Swresample` | `TF2Opus`, `CODEC_PROFILES`, `VOICE_ENGINE`, `module` | 43236441204, success, 4 min 48 s |
| 4.8 render | 1,585, 951, body 634: a move | `CODEC_PROFILES`, `VOICE_ENGINE` | the same | 43237362694, success, 5 min 1 s |
| 4.9 render-stream | 951, 522, body 429: a move | `CODEC_PROFILES`, `VOICE_ENGINE` | the same | 43238294174, success, 5 min 16 s |
| 4.10 live-chain | 522, 76, body 446: a move | `CODEC_PROFILES`, `VOICE_ENGINE` | `TF2Opus`, `module` | 43241494598, success, 5 min 1 s |

Every file also names `window`, `self` and `globalThis` in the line that finds or attaches `TF2Engine`. The body
counts are the plan's prototype's, file for file. On 4.5 `audio.js`'s "before" is 15 lines shorter than 4.4's
"after" because `--but` leaves out every line equal to the dropped banner's dashes line, as the order says.

The other pushes: step 2 `7db4e3e` run 43223950387 (5 min 3 s), `5f88b18` run 43225200565 (4 min 26 s), step 3
`64ea7d9` run 43226038891 (7 min 18 s), step 5 `1a7afdc` run 43242471630 (5 min 0 s), step 6 `2e3c218` run
43243401486 (4 min 54 s): each `verify` success, all five groups success. Each push waited for the run before it
to pass; none was cancelled. Step 7 and this report went up in one push (the report alone, being under `docs/`,
starts no run): its run is in the hand-back.

**What each file takes.** The import table was computed from the old file's scopes (espree and eslint-scope) and
is the order's table "What each file takes from the others" row for row; the order's one extra row, `codec` from
`audio` at a render, is the line of Decision 5, not a `const { ... }`. 136 names declared; the parts give 86 (85
and `audio`'s `loadOpusModule`). The split was made by a script of mine from the order's runs, checked against the
planner's prototype: the code is the prototype's; the heads' comments, the wrapping of the name lists and the blank
lines between runs differ (the prototype also dropped `audio.js`'s last newline).

## The moves taken together (end of Step 4)

A script reads the old file and the eleven files at `0f93256`: every non-blank line of the old file is in exactly
one run of the order's table or in the dropped banner, and each file's lines between its head and its tail are its
runs' lines, in order, blank lines left out. Its output:

```
old file: 3436 lines, 3280 not blank; in two runs: none; non-blank in no run: none; dropped: lines 1044-1046
engine/dsp.js: 444 old lines all there, in order; head 9 lines, tail 7; 0 other lines between
engine/gain.js: 153 ...; 0 other     engine/mix.js: 422 ...; 0 other     engine/network.js: 141 ...; 0 other
engine/codec.js: 41 old lines all there, in order; 4 other lines between: the three comment lines and
    const loadOpusModule = () => E.audio.loadOpusModule();
engine/room.js: 133; engine/steam.js: 324; engine/render.js: 634; engine/render-stream.js: 429;
engine/live-chain.js: 446: each all there, in order, 0 other lines
audio.js: 110 old lines all there, in order; 34 other lines: 21 lines of the header's list, the E line, the
    const { ... } lines (11 lines for 9 parts), and E.audio = Object.freeze({ loadOpusModule });
every non-blank line of the old file is in exactly one of the eleven files, unedited, but the three of the dropped banner
```

`git diff -M --stat 64ea7d9..0f93256 -- audio.js engine/`: 11 files, 3,521 insertions, 3,320 deletions.
`git diff --color-moved=dimmed-zebra --color-moved-ws=no` over the same range, read and counted: 6,641 lines shown
as moved (the two sides together); 196 added and 4 removed lines that are not moves. The 196 are the heads, the tails, the header's list
and the four things; the 4 are the dropped banner's three lines and one blank line. `git diff 64d9001..0f93256 --
tests/render-stream.verify.mjs tests/stages.verify.mjs tests/predictions/ vendor/ steam-sender.js voice-channel.js
room-dsp.js opus-codec.mjs` prints nothing. At the head, `predictions.json`, `.github/`, `package.json`, the rule
files, `docs/PROGRESS.json`, `tests/browser.verify.js` and the `CACHE` line are unchanged too; under
`tests/predictions/` only `PREDICTIONS.md` changed (Step 7's paragraph).

## Whole output, before and after

"Before" is every suite on `64d9001`, run one at a time from a scratch copy under the lock (`node tests/run.mjs all`
in pieces, by the runner's table: each suite's command with standard error into the same stream, times blanked by
the order's `out()`), 1,119.3 s summed, all 25 passed. After each move, `units` and `engine` (22 suites) ran the
same way on a copy of that commit; at the three gates the long suites and the browser suite too; at the end all 25
on `2cde00b`. Every suite passed at every step.

| Suite | Every step and the end |
| --- | --- |
| `vendor`, `gain`, `gain-exact`, `opus`, `speex102`, `vr12`, `miles`, `reference`, `formats`, `filerate`, `video`, `demo`, `output-stage`, `voice-channel`, `steam-sender`, `swresample`, `verify`, `steam` | same, byte for byte, at all ten steps and at the end |
| `render-stream`, `stages` | same at the three gates and at the end (every `GOLDEN`, `GAIN_GOLDEN` and `stages` hash among them) |
| `browser` | the same 411 check names, each `ok`, at the three gates and at the end. Details differ where they hold live or random figures (the live chain's frame counts, a correlation's third digit, the mock console feed's lines and the take's timestamp) and the file counts (50 to 53, then 61 cached files; 165 requests and 51 files to 183 and 54) |
| `harness` | differs by design: the new checks, and the lists' details growing a file a step |
| `site` | differs in counts only (49 files to 60; 50 entries to 61) and, after Step 5, in the licence line (the online-only list empty) |
| `meter` | two check details differ, each a memory figure: "12.0 MB peak (VmHWM)" before, 10.6 MB after 4.1, and the same check's "7.3 MB more; 10 minutes: 4.6 MB" against 6.4 and 4.2 |
| `room-dsp` | one line differs, its speed in ns a sample per preset ("131 143" before, "131 242" after 4.1) |

`meter` and `room-dsp` load no engine file (`meter.js`, `room-dsp.js`). The order counts a difference in anything
but a time as a stop, so I checked: on `64d9001` itself, run again, the same lines differ (4 and 2 lines), so these
are the machine's figures, not the split. No check's condition depends on the exact figure.

## The long suites at the gates

Seconds, under the lock, one run each; load average at the start in brackets.

| Suite | Before (`64d9001`) | After 4.3 | After 4.7 | After 4.10 | The end (`2cde00b`) |
| --- | --- | --- | --- | --- | --- |
| `render-stream` | 303.7 (1.25) | 304.7 (1.06) | 288.0 (1.06) | 296.7 (1.16) | 293.1 (1.16) |
| `stages` | 227.1 (1.16) | 249.2 (1.03) | 231.2 (1.13) | 240.2 (1.02) | 233.5 (1.21) |
| `browser` | 246.3 (1.41) | 247.8 (1.04) | 245.2 (1.24) | 255.8 (1.12) | 247.2 (1.11) |
| `steam` | 147.1 (1.20) | 145.9 (1.07) | 143.9 (1.17) | 139.8 (1.29) | 137.4 (1.20) |

`stages` after 4.3 was 9.7 % slower than before, under the order's line of a tenth; the next two gates were 1.8 %
and 5.8 % slower and the end 2.8 %. `render-stream` was within 5 % either way. `pnpm test`'s suites summed:
1,119.3 s before, 1,094.1 s at the end.

## The checks of Step 2, broken

Each break in a fresh copy of the branch's head, then `node tests/run.mjs harness site` in the copy. Each fails, with
a message that names the file:

| Break | What fails, as printed |
| --- | --- |
| `engine/gain.js` and `engine/mix.js` swapped in `ENGINE_FILES` | [1]: `index.html's first script tags are the list, in order`, and both workers' checks, each listing the page's order |
| the two tags swapped in `index.html` | [1]: `index.html's first script tags are the list, in order   [... engine/dsp.js, engine/mix.js, engine/gain.js, ...]` |
| `engine/steam.js` dropped from `live-worker.js` | [1]: `live-worker.js imports the list and nothing else, in order` |
| `./engine/mix.js` taken out of `ASSETS` | `site`: `needed and not listed: engine/mix.js` |
| `finiteOr` misspelled in `engine/gain.js`'s `const { ... } = E.dsp;` | [12]: `engine/gain.js:8: finitOr is not in E.dsp of a loaded engine`; then [5]'s render stops (`ReferenceError: finiteOr is not defined`) |
| `steamLoser` taken out of `engine/network.js`'s part | [12]: `engine/render.js:12: steamLoser is not in E.network ...`, and the same for `render-stream.js` and `live-chain.js` |
| `'use strict';` taken out of `engine/room.js` | [9]: `engine/room.js: does not open with "(function (root) {" and "'use strict';" after its head comment` |
| every engine file's attach line in `steam-sender.js`'s form (`self`, else `this`), and `audio.js`'s lookup too | [9]: `engine/dsp.js: its last line is not the call that attaches it to window, else self, else globalThis`, for each file; [11]: `the engine loads   [Cannot read properties of undefined (reading 'TF2Engine')]` |
| `import('../opus-codec.mjs')` in `engine/codec.js` | [10]: `engine/codec.js:60: import(`; [13]: the parts no longer include `audio` |
| `engine/extra.js`, listed nowhere | [10]: `the folder engine/ holds exactly the engine files   [engine/: ... engine/extra.js ...]` |
| `createRender` taken out of `TF2Audio` | [11]: `TF2Audio's members are the 38 recorded, in order   [missing: createRender ...]` |
| `mixOut` and `mixClip` swapped in `TF2Audio` | [11]: the same check, `missing: none; not recorded: none; order: ...` |
| `const unused = 'engine/dsp.js';` in `tests/demo.verify.mjs` | [3]: `no file under tests/ but the helper names a file of engine/ in a quoted string   [demo.verify.mjs:2 'engine/dsp.js']` |
| nothing (the copy itself) | both pass |

The first version of the harness (`7db4e3e`) put these checks after S3-01a's check 8. Four of the breaks then
stopped the suite at the first render or load of check 4 or 5 with an error that named no file (the misspelling,
the name taken out of a part, the attach form, the `import()`). `5f88b18` moves the checks to run after check 3, the
ones that read only text first, and catches their one load; what each check holds did not change. They keep the
numbers 9 to 14, in the order they run, so the order's references to S3-01a's checks 3, 7 and 8 still hold.

**Sample-changing breaks** (a copy of the head; the suite run there under the lock):

| Break | Suite | Result |
| --- | --- | --- |
| `engine/gain.js`: `const y = Math.imul(g, v) >> 7;` to `(Math.imul(g, v) + 64) >> 7` | `gain` | 78 FAIL lines; the first `noise bursts with runs of zeros: receiverAutoGain   [398373 of 1313604 samples differ over 27 settings ...]` |
| `engine/network.js`: `buildLossMask`'s state change with `pBG` and `pGB` swapped | `verify` | 20 FAIL lines; the first `loss rate near target 22%   [78.1%]` |
| `engine/steam.js`: the capture's `let r = Math.round(v);` plus one | `steam` | 26 FAIL lines; the first `16 bits: the samples handed to the resampler are the module's decodeInt16 frame for frame ...   [117 frames; 2401 samples differ ...]` |

**Step 5's checks.** `site` passes on the branch. With the licence line taken out of `ASSETS` again it fails,
`needed and not listed: vendor/swresample/COPYING.LGPLv2.1`. With the allowance put back it fails twice, `listed and
not needed: vendor/swresample/COPYING.LGPLv2.1` and `the files linked to be opened online only are not in ASSETS`.
The browser suite passed on the head (above) and in CI on `1a7afdc`.

**Step 6's check.** For `constants.js`, `app/render.js`, `video.js`, `engine/mix.js` and `engine/room.js`, the code
tokens (`espree.tokenize`) before and after the commit are equal. `harness` and `site` pass.

## Step 8: a visitor who already has the site

Scratch copies: `main`'s tree, the branch's (`2cde00b`) with `CACHE` at v37 in the copy only, and the branch's files
with `main`'s `index.html`. The browser suite's Chromium, `tests/static-server.js`, one port for the first two.

1. **Holds.** `main`'s page (v36) is controlled by its service worker; its cache holds all 50 entries; no page error.
2. **Holds**, with a note. Served the branch on the same port and reloaded online: no page error; `TF2Audio`'s keys
   are the 38 of Step 2, in order; a file rendered ("Rendered in 0.2 s · 1.0 s of sound at 48,000 Hz · Steam voice
   (Opus, 32 kbps) ..."). After the newer worker took over: the only cache is v37, it holds all 61 entries (the ten
   `engine/` files and the licence among them), and v36 is gone. The note: on the first try the script waited 60 s
   after the reload for the browser's own update check, and none came: the only cache was still v36. The second
   try asks for the check (`registration.update()`) after the reload, and the update installed at once. Why the
   browser made no check of its own in that minute was not looked into; `sw.js` is unchanged but for its list, so
   any merge that raises the number meets the same.
3. **Holds.** Offline, a reload: no page error; a file rendered through the worker, and the log names libopus
   1.1.5. The licence link fetched offline gives 200, 26,517 characters, starting "GNU LESSER GENERAL PUBLIC
   LICENSE". Clicked, the link opened a page with no text: the test server sends the file as
   `application/octet-stream` (it knows no type for `.1`), and a navigation to such a file is a download.
4. **Recorded.** `main`'s `index.html` with the branch's files, online, no service worker: the page error is
   `Cannot read properties of undefined (reading 'dsp')` (the new `audio.js` finds no `TF2Engine`), `TF2Audio` is
   undefined, no console error besides, and a chosen file never renders (the script gave up after 90 s). A visitor
   handed the old page for some minutes sees the page but cannot render until a reload.

## A fresh worker's start

The time from `new Worker('audio-worker.js')` to the reply of an `analyze` job of 4,800 samples, 40 starts, the
first five left out (the planner's `worker-start.cjs`), under the lock:

| Tree | Without a service worker | With the page's |
| --- | --- | --- |
| before (`64d9001`) | median 51.1 ms (quartiles 49.3 to 54.6) | 67.9 ms (63.4 to 72.4) |
| after (`2cde00b`) | 76.9 ms (70.7 to 81.3) | 102.1 ms (96.8 to 105.1) |

Later by 25.8 ms and 34.2 ms, inside the plan's 19 to 39 ms and under the order's stop line of 60 ms.

## The cache number

`node tests/cache-number.mjs origin/main --report` on the head:

```
cached files changed since origin/main (64d9001): app/render.js, audio-worker.js, audio.js, constants.js, engine/codec.js, engine/dsp.js, engine/gain.js, engine/live-chain.js, engine/mix.js, engine/network.js, engine/render-stream.js, engine/render.js, engine/room.js, engine/steam.js, index.html, live-worker.js, video.js, sw.js
cache number against origin/main (64d9001): the number is v36, not above v36: it must rise (node tests/cache-number.mjs origin/main --set)
```

The `CACHE` line is not touched on the branch.

## Comments and documents changed

- **Comments (Step 6):** `constants.js` (`mixUpsample2`, `gainRule`, `MIX_RATE`, `createDeviceStage`,
  `steamMessageLoss`, the room's three knobs), `app/render.js` (the kept stages, `gateThresholdDb`), `video.js`
  (`toInt16`); in the engine, `engine/mix.js` "(a resolved room, `engine/room.js`)" and `engine/room.js`'s banner
  "createRoomMix, in `engine/mix.js`." (two lines of the banner now). No third place-pointing comment was found
  (every "above", "below" and "here" in the ten files read: each points inside its own file or is about rates).
- **`tests/lib/site-files.cjs`:** `ONLINE_ONLY` is empty, with its comment saying why (Step 5).
- **`tests/lib/engine.cjs`'s head comment** and the comment over `loadEngine()`: `parts`, and how to break one
  internal function in a copy.
- **Documents (Step 7):** `README.md` (the files table: `audio.js`'s row, ten rows); `docs/VOICE-PATH.md` (stages
  1, 4, 6 and 8, and the mixer's section); `tests/README.md` (the harness's row, the gain and stages suites' rows,
  the loader's paragraph with `parts` and breaking a copy, the licence in the offline list);
  `tests/REFERENCE_2026.md` (the app's gain, marked where it stands); `docs/README.md` (S3-02a's row); dated notes
  in `docs/work-orders/W3-02-receiver-queue.md`, `W2-03-long-render-page.md`, `W2-05-long-views.md`,
  `W2-06-video-from-file.md` and `docs/reports/bad-connections-plan.md`; `tests/predictions/PREDICTIONS.md` (the
  order's paragraph, dated 2026-11-12, after S3-03's).

## Found stale and left

- `opus-codec.mjs:583` and `:728`: "audio.js gives the same for TF2Audio.createRender"; that code
  (`codecResultInfo`) is in `engine/render-stream.js` now.
- `room-dsp.js:116` "The generator of audio.js" and `steam-sender.js:106` "as in audio.js": `mulberry32` is in
  `engine/dsp.js` now.
- `app/core.js:6` "All heavy audio lives in audio.js": left as the order says; true now of `audio.js` and
  `engine/` together.

These four files are outside the order's list. `docs/PROGRESS.json` names `audio.js` five times; it is the
orchestrator's.

## Found in the order on today's main

- The licence's allowance is `ONLINE_ONLY` in `tests/lib/site-files.cjs` (S3-01b put it there), not in
  `tests/site.verify.mjs`. That is the file changed.
- Check (d) asks for "one part for each engine file and audio". `audio.js` gives its part only from step 4.5, the
  step that adds `E.audio`, so the harness expects `audio` exactly when an engine file calls `E.audio`.
- "The whole output of each of its suites is before's" cannot hold for `harness` and `site`, which this order
  changes or whose counts it moves, nor for `meter` and `room-dsp`, which print memory and speed figures that move
  run to run on the same code (shown above). Every other suite matched.
- `docs/README.md` lines 60 and 98 no longer say "the split of `audio.js`"; the S3-02a and S3-02b rows were there.
  Only S3-02a's state changed.
- `tests/README.md`'s sentence on the licence "named as opened online only" became untrue with Step 5; it is in
  the documents commit, though not in the order's table.
- The order's `git diff <first commit>..HEAD -- ... tests/predictions/ ...` prints nothing at the end of Step 4; at
  the head it shows Step 7's `PREDICTIONS.md` paragraph, as the order asks.
- A push of `docs/` alone starts no CI run, so this report went up with Step 7.

## Scanned before the push

`git diff origin/main...HEAD` and the branch's commit messages hold no recording, personal detail, real SteamID or
model name; the only model name is in the commit trailers the brief gives.

## What I would do differently

Write the harness's new checks to run before S3-01a's loads from the start: a check that names the broken file is
worth less if a render elsewhere in the suite throws first. And make the local "before" and "after" of a step from
`git archive` copies from the start, as done here, so the next step can be made while one is being checked.
