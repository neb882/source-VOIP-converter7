# W3-24, the build: a render's end on the game's voice queue

A builder's report, 2026-11-15, for `docs/work-orders/W3-24-render-end.md` and the orchestrator's rulings at its end.
Branch `claude/w3-24-render-end`, from `main` `3d8c04d`. Every figure carries its standing. No recording, log or file
of the owner's was read.

## What was built

A render of Steam voice on the game's voice queue, made by the model's sender, now plays out what the receiver's
voice channel still holds at the source's end. The render is longer by that run-on, and its voice up to the source's
length is what it was. Where nothing of the source is in the queue at its end, the render does not change by a sample
or in length, and `codecInfo.channel` has no new member. A demo's packets and the live monitor's chain do not play
out (rulings 5 and the order's text).

### File by file

| File | What changed |
| --- | --- |
| `voice-channel.js` | `createTimeline` takes `playOut` (true or false, default false; anything else, or true with length Infinity, a `RangeError`). With it the part of a block at or past `length` is kept apart; `hear()` moves the voice's end at each place of the source (a sample of a sound message at `0 <= pos < length`) and, while the clock runs on, lets nothing else change the record. `finish()` does what it did, then runs the clock on (whole frames under the frame clock) while the channel holds a sample or the mixer's kept sample is one of a sound message on a playing channel, and returns `length + over` samples. `info.over` and a longer `info.source` only where `over > 0`. An overflow not heard by the base keeps the base's time unless the run-on hears it before `(length + over) / 44100`. The header's contract is written for `playOut`, rule 2 in it |
| `engine/steam.js` | `steamChannel` passes `playOut: true` for a whole length without `zeroSamples`; `steamRunOn(info)` gives `info.over` or 0 |
| `engine/room.js` | `mixAtDevice`, the arithmetic of `tailAtDevice` (which stays as its other name), the one helper for the tail and the run-on |
| `engine/render.js` | The channel's count is checked against `voiceLength + over`; `outLength` adds `mixAtDevice(over)` before the room's tail |
| `engine/render-stream.js` | The same check in the steam stage; the last stage holds back what is past `outputLength` on the queue as with a room, and its flush adds the run-on; the header says no bound of the run-on is given before `finish()` |
| `app/render.js` | After the queue's console line, `S_Voice: the queue was still playing at the file's end: the render runs N ms longer` where `over > 0`; for a run-on over 10 s a second line names the wait at that `voice_buffer_ms` and `fps_max` (ruling 3) |
| `app/visualizer.js` | `laneSkips` shows a skip up to the source's end plus `over / 44100` |
| `index.html`, `app/console.js` | One sentence each in Phrase timing's help: "A sound still in the queue when the file ends plays out, so the render can be a little longer than the file." |
| `tests/voicequeue/reference-frames.mjs` | The second model with the record gets `playOut`, written again from "The rule", and an even clock (`even`) for 1000/15 frames a second and above, so that the play-out's record has a second model at every rate. It reports `over`, `voiceEnd` and `endsOnKept` |
| `tests/voice-channel.verify.mjs` | The suite's own reading (`evenTimeline`, `referenceTimeline`) gets `playOut` for samples and `over`, with places tracked from the channel's tags. `playOutChecks()` holds the order's checks 1 to 8; `--play-out` runs them alone, reporting every one |
| `tests/render-channel.verify.mjs` | `referenceRender` plays out on the second model at every rate (with `onOpen` on the even clock it keeps the module's timeline, whose opens are all it reads). Section 28: checks 9, 10, 11, 13 and 17. Section 29: check 12, committed alone first |
| `tests/browser.verify.js` | Check 16, in "[Browser 8c]". Two checks moved. The audit of the help texts (`6be5e2c`) moved because this order's sentence in `index.html` forces it: it holds the help word for word. And "a source dropped during a render" (a 1 s tone of 880 Hz that ends in sound, at the page's default) now expects the source's second plus the run-on, which is 10 ms there |
| `README.md`, `docs/VOICE-PATH.md`, `docs/PAGE.md`, `tests/README.md`, `tests/voicequeue/README.md` | Where they give a render's length or the end it lost |
| `tests/REFERENCE_2026.md` | Finding 9's lines on the end marked where they stand, and a dated paragraph with the tables below |
| `tests/predictions/PREDICTIONS.md` | The note for the changed hashed model files |

No new engine file; `sw.js` is not touched.

## What did not move, and how it was shown

- `node tests/render-stream.verify.mjs --hashes` was run on `main` (`3d8c04d`, before any change) and on the build
  after the engine's change: the two outputs are equal, byte for byte (`cmp`; both kept beside this report's scratch,
  and equal to the planner's `main` output). It was run again on `b5312f6`, the last commit with code or tests: equal again, byte for byte.
- Section 29 of `tests/render-channel.verify.mjs` holds the WAV hashes of a source that ends in 1 s of silence at
  300, 66.67, 60 and 30 frames a second, jitter 0 and 50. They were recorded by running the section against an
  unchanged copy of `main` (`TF2_DIR`), and committed alone (`8726c85`) before the order's change. The build gives
  the same eight hashes, with no `over`.
- Every existing check of `tests/voice-channel.verify.mjs` passed unedited with the second model rewritten (the
  play-out off). In `tests/render-channel.verify.mjs` the settings of section 1 the order names failed on the first
  build, each at sample 529,200, the reference's end, and no other check; with the reference's play-out they pass.
- `flock /tmp/tf2ve-heavy.lock pnpm test` whole, at `14f1a1a` with the documents not yet committed: "27 of 27 suites passed. 1626.4 s summed, 1626.5 s of wall time, 1 at a time." `stages`, `steam`, `reproduce`, `demo`, `recordings` and `verify` among them, with no file of theirs changed.
- The browser suite (`flock /tmp/tf2ve-heavy.lock pnpm test:browser`, with `CHROMIUM_EXECUTABLE`), at `b5312f6`: "1 of 1 suites passed. 529.4 s summed". Its first run failed at "a source dropped during a render" (above), and CI's first browser job at the audit of the help texts; both are the checks the order lets move.
- `pnpm test voice-channel render-channel` passed on their own before the whole run (`render-channel` whole passed, 5 min 7 s).

## The breaks

Each made on the build, run, and put back.

| Break | What failed |
| --- | --- |
| The kept sample left out of the run-on's condition (`ch.count > 0` alone) | "the kept sample" at 66.67, 300 and 1000 fps (over 0 for 1). Under the frame clock the break changes nothing: a frame runs its ticks first, so a starved channel is freed before the next frame's blocks, and a kept sample can be heard only inside the frame that kept it, which the base or the run-on runs whole |
| `pos <= length` for `pos < length` | the two second models (one sample longer), case (d) of "what is not a place" (one sample longer), the overflow in the run-on |
| Every played sample counted for the voice's end | the second models, the kept sample, all four cases of "what is not a place" (over 13,411, 13,411 and 73 for the three that must be 0; the straddle one 12,480 too long), the waiting channel, the overflow |
| `over: 0` on every timeline that plays out | "nothing cut, nothing changed" (the info has other members), "what is not a place", the overflow |
| The run-on lets every sample change the record | "what is not a place" (case (b), the message past the end with a second offset) and the overflow. Case (b) was made of two messages after the first version of the check let the break through: one message at one steady offset rewrote `offsetEndMs` with the value it already had |
| An overflow's time never put back to the base's | the overflow's second half (with nothing of the source left, the time it has without `playOut`) |
| The slots past `length + over` filled | the second models |
| `overAtDevice` left out of `outLength` (`engine/render.js`) | check 10's length and check 11's stream |
| The last stage holding back only with a room (`engine/render-stream.js`) | check 11's stream |

The order's break for check 2 (the kept sample) fails at the even clock only, for the reason in the table.

## The figures, measured again on the build (check 18)

Milliseconds of run-on, `codecInfo.channel.over / 44.1`, the mean and the range over the seeds, `voice_buffer_ms` 100,
the suites' `speechLike` at -20 dB, 48 kHz, measured on the build (the model; no recording is behind any of it). The
rows marked 1000/15 were run at exactly 1000/15 frames a second (the page's 66.67 at its threshold), as the planner's
were; at a literal 66.67 the network signal at jitter 50 reads 92.2 ms (56.1 to 114.1) against 88.3 (the review,
measured). The
order's tables were measured on the planner's prototype.

| Source | Frames a second | Run-on at jitter 0 | Run-on at jitter 50 |
| --- | ---: | ---: | ---: |
| one phrase of 6.13 s that ends with the file | 300 | 0.0 (0.0 to 0.0) | 16.5 (0.0 to 41.2) |
|  | 1000/15 | 6.6 (0.0 to 26.1) | 81.3 (0.0 to 142.2) |
|  | 60 | 0.3 (0.0 to 2.9) | 83.6 (0.0 to 150.9) |
|  | 30 | 4.2 (0.0 to 24.4) | 95.7 (40.7 to 130.6) |
| four phrases in 8.4 s, the last ending with the file | 300 | 0.0 (0.0 to 0.0) | 0.0 (0.0 to 0.0) |
|  | 1000/15 | 9.9 (0.0 to 41.5) | 79.1 (0.0 to 165.4) |
|  | 60 | 3.2 (0.0 to 14.5) | 89.5 (0.0 to 130.6) |
|  | 30 | 9.2 (0.0 to 41.5) | 102.8 (33.7 to 153.8) |
| the first with 1 s of silence after it | 300 | 0.0 (0.0 to 0.0) | 0.0 (0.0 to 0.0) |
|  | 1000/15 | 0.0 (0.0 to 0.0) | 0.0 (0.0 to 0.0) |
|  | 60 | 0.0 (0.0 to 0.0) | 0.0 (0.0 to 0.0) |
|  | 30 | 0.0 (0.0 to 0.0) | 0.0 (0.0 to 0.0) |

The two test signals, seeds 1 to 3:

| Source | Frames a second | Run-on at jitter 0 | Run-on at jitter 50 |
| --- | ---: | ---: | ---: |
| tf2_voice_nettest_v1.wav | 300 | 0.0 (0.0 to 0.0) | 18.9 (11.9 to 23.5) |
|  | 1000/15 | 0.0 (0.0 to 0.0) | 88.3 (56.1 to 117.9) |
|  | 60 | 0.0 (0.0 to 0.0) | 96.0 (67.7 to 117.9) |
|  | 30 | 0.0 (0.0 to 0.0) | 84.4 (56.1 to 106.3) |
| tf2_voice_testsignal_v1.wav | 300 | 0.0 (0.0 to 0.0) | 13.2 (0.0 to 39.5) |
|  | 1000/15 | 0.0 (0.0 to 0.0) | 93.0 (44.1 to 136.6) |
|  | 60 | 0.0 (0.0 to 0.0) | 77.6 (67.3 to 86.8) |
|  | 30 | 0.0 (0.0 to 0.0) | 55.1 (0.0 to 86.8) |

The wider look at jitter 0: 360 renders at each rate (a phrase or a 440 Hz tone that ends with the file, six lengths
from 1.0 to 3.3 s, seeds 1 to 30):

| Frames a second | Renders that run on (of 360) | Mean run-on | Largest |
| ---: | ---: | ---: | ---: |
| 1000 | 73 | 3.5 ms | 86.8 ms |
| 400 | 44 | 0.6 ms | 13.7 ms |
| 300 | 33 | 0.4 ms | 13.7 ms |
| 235 | 15 | 0.1 ms | 5.4 ms |
| 144 | 96 | 3.1 ms | 27.6 ms |
| 100 | 170 | 5.3 ms | 39.2 ms |
| 1000/15 | 170 | 6.5 ms | 39.2 ms |
| 60 | 56 | 1.3 ms | 27.6 ms |
| 30 | 204 | 6.9 ms | 27.0 ms |
| 10 | 94 | 2.0 ms | 15.4 ms |

Every figure of the three tables equals the order's, measured on the planner's prototype.

A long wait (seed 1, a 2 s phrase; measured on the build):

- fps 300 voice_buffer_ms 100: wait 30 ticks, over 0.0 ms, output 2.000 s, dropped 117 ms
- fps 300 voice_buffer_ms 1000: wait 300 ticks, over 2020.5 ms, output 4.020 s, dropped 2110 ms
- fps 1000 voice_buffer_ms 5000: wait 5000 ticks, over 72516.2 ms, output 74.516 s, dropped 2110 ms

The planner's 72,516 ms at 5000 and 1000 fps is the same.

## Time and memory

A 10-minute render of `speechLike` (48 kHz, -20 dB, seed 1) on the queue at 300 frames a second, `process()` in one
Node process each, twice in turn on an unchanged copy of `main` and on the build, at jitter 0 and 50 (measured, on
this machine, shared with no other heavy job; the peak resident memory from `process.resourceUsage()`):

| Engine | Jitter | Time (ms), two runs | Peak memory (MB), two runs |
| --- | ---: | ---: | ---: |
| `main` | 0 | 36,921 and 37,096 | 1,578 and 1,578 |
| the build | 0 | 36,622 and 36,472 | 1,578 and 1,576 |
| `main` | 50 | 37,743 and 36,758 | 1,574 and 1,574 |
| the build | 50 | 37,148 and 36,782 | 1,574 and 1,573 |

The build takes no more time or memory than `main`, within the runs' spread, well inside 1.05 times. This source runs
on by nothing at either jitter, so it measures the cost of the play-out's machinery, not of a long run-on.

## Points for the orchestrator and the reviewer

- **Which samples before the source's length change** (settled by the orchestrator's ruling A, 2026-11-15, after
  the review; "After the review" below has the fix). On a render that ran on, an output sample before the source's
  length changes only where the device stage's read for it touches mix sample `voiceLength` or later; on one that did
  not, nothing changes. The first build's report said "one sample at 48 kHz", which holds only where the voice is as
  long as the source at 44.1 kHz.
- **The kept sample matters only on the even clock**, as the breaks show.
- **`createRender` and `process()` can run different bases.** `createRender` calls `advance()` at the stream's bound
  after each piece, and with jitter that tick's blocks can lie past the length, so its base can run blocks that
  `process()` runs in the run-on, where only places change the record. They give the same record wherever every
  sample those blocks play is a place of the source or carries no spurt. If the sender's `finish()` gives a message,
  `process()`'s base runs as far as `createRender`'s (the message's arrival tick is at or after the bound's); if it
  gives none, no message has a sample at or past the length (inferred from the sender's reads). The one case left is an
  overflow heard in those blocks with nothing of the source after it, which no check builds. Check 11 found no
  difference in its cases.
- **A run-on of less than one device sample** (`over > 0`, `overAtDevice` 0) needs a device rate under 22,050 Hz;
  at 44.1 and 48 kHz `round(over x rate / 44100)` is at least 1 for `over` 1. Not built as a check.
- **Two engines in one Node process share `TF2VoiceChannel`**, which `voice-channel.js` sets on the global object: a
  second `loadEngine` replaces the first's timeline. Check 10's copy differs from the build only in `engine/steam.js`,
  so the shared module is the build's own either way. A first experiment of mine against a copy of `main` measured
  `main`'s timeline in both engines for that reason; it is not in any test.

## CI

CI's `tests` workflow on the branch: `0c42cf2` (the timeline alone) success; `aba98a4` cancelled by the next push; `14f1a1a` failure, the browser job alone (the audit of Phrase timing's help, fixed in `6be5e2c`), every other job a success. The run on the pushed head is read after the push and given in the hand-back, since this report is in that push.

`node tests/cache-number.mjs origin/main --report`:

    cached files changed since origin/main (0364e01): app/console.js, app/render.js, app/visualizer.js, engine/render-stream.js, engine/render.js, engine/room.js, engine/steam.js, index.html, voice-channel.js
    cache number against origin/main (0364e01): the number is v53, not above v53: it must rise (node tests/cache-number.mjs origin/main --set)

The number is the orchestrator's to raise at the merge. `origin/main` moved to `0364e01` (two commits of the record) during the build and was merged in (`fc32212`), with no conflict.

## Scanned

`git diff origin/main...HEAD` and the branch's commit messages were scanned for recordings, personal details, real SteamIDs, paths of this machine and model names: none, apart from the attribution trailer the session requires.

## Not done

- No check against the game: no recording of a file's end through the queue exists. Every figure is the model's.
- The private runs (`tests/accuracy.mjs`, `tests/retiming.mjs`) are the orchestrator's after the merge.
- A codec lane over the run-on is not built (the order leaves it out).
- No bound of the run-on for `createRender`'s callers is given; the header says so.

## After the review

The review asked for fixes before the merge, and the second read found the model right. The orchestrator's rulings
of 2026-11-15 (the order's last section) settle the two matters above: ruling A says which samples before the source's
length may change, and ruling B keeps `createRender` against `process()` at the bound as built. The eight fixes, each
made on the branch after `origin/main` (`455a25a`) was merged in:

1. **Ruling A, said and checked.** Check 10 (`tests/render-channel.verify.mjs`, section 28) adds the reviewer's source:
   44.1 kHz, 176,408 samples, whose voice through the 24 kHz codec is 176,407 samples, at 66.67, 30 and 300 frames a
   second with jitter 50, and a 24 kHz case that does not run on. For each render without a room, at 44.1 and 48 kHz,
   the head's changed samples must be exactly those whose device read touches mix sample `voiceLength` or later
   (none where nothing ran on). Measured on the build: on the 44.1 kHz source, sample 176,407 at a 44.1 kHz device and
   192,007 and 192,008 at 48 kHz, the reviewer's one and two; on the 24 kHz source, none at 44.1 kHz and 287,999 at
   48 kHz. `docs/VOICE-PATH.md`, `tests/REFERENCE_2026.md`'s new paragraph and this report say ruling A. Break: the
   run-on given out as silence fails the check (the changed samples none, against ruling A's).
2. **The run-on's last sample at the device.** `engine/room.js` has `runOnAtDevice`, which rounds the run-on's length
   at the device's rate up, in whole numbers; `tailAtDevice` keeps `Math.round` for a room's tail, and
   `engine/render.js` and `engine/render-stream.js` use the one for the run-on and the other for the tail. Check 10's
   length formula and check 16's follow. Break: the run-on rounded as the tail is fails check 10's length (at 48 kHz,
   4,325 samples of run-on are 4,707.48 device samples: 4,708, not 4,707).
3. **Whole sample numbers.** `voice-channel.js` keeps the output sample at which the run-on hears an overflow, and
   compares it with `length + over` as whole numbers, as the second model does. A built case (`tests/voice-channel.verify.mjs`):
   at 300 fps an overflow heard at exactly `length + over` (over 1, length 129,536), where `(h / 44100) x 44100` is
   below `h` in double precision. It keeps the base's time. Break: the comparison in seconds, as before, fails it (the
   time 129,537 samples where the rule gives 129,536).
4. **`onOpen` with `playOut`.** The headers of `createTimeline` and `steamChannel` say that `steamChannel` passes both
   when handed `onOpen` with a whole length, and that the index is the open's place in the played-out stream, which can
   be at or past `length + over`. Words only.
5. **Check 6 under the frame clock**: rows at 30 fps (`voice_buffer_ms` 1000 and 5000) and 10 fps (1000), against the
   second model's samples and info. The reviewer's break A (the run-on run as even ticks under the frame clock) now
   fails it. Under the frame clock the sound comes earlier in the run-on than the even clock's arithmetic gives
   (193,536 against 194,560 at 30 fps; measured on the build), and the model agrees.
6. **The console lines.** Check 16's case at 66.67 fps asserts no line for a run-on over 10 s, and a new case pins that
   line: 3 s of the speech fixture at `voice_buffer_ms` 1000 and `fps_max` 1000 runs on 11.8 s (measured on the
   build, in the page), and the line reads, to the character, `S_Voice: the render runs on 11.8 s past the file's end
   because at voice_buffer_ms 1000 and fps_max 1000 a new phrase waits 1000 ticks (15.0 s) before it plays`. The
   reviewer's break C (the line printed for every run-on) now fails check 16.
7. **The lane.** The two lane checks of `tests/browser.verify.js` take `over` into their end, and the case of fix 6
   has its skips heard inside the run-on, which `laneSkips` must count. Break: `laneSkips` ending at the source's end
   fails that case. 1 s sources at the same setting run on by nothing: the ring keeps only the sender's hold after the
   source's end (measured on the build), so the case is 3 s long.
8. **The words.** No count of checks in this report. `6be5e2c` moved because this order's sentence in `index.html`
   forces it. The rows run at 1000/15 frames a second are labelled so, here and in the record's new paragraph, with the
   review's 92.2 ms (56.1 to 114.1) for the network signal at a literal 66.67 and jitter 50.

What was run after the fixes, on the head before the push: `node tests/render-stream.verify.mjs --hashes`
(equal to `main`'s output, byte for byte; sha256 `f73fee8b…` both); section 29's hashes, inside `pnpm test` (`render-channel` passed, so they equal `main`'s); `flock /tmp/tf2ve-heavy.lock pnpm test` whole
("27 of 27 suites passed. 1679.8 s summed"); the browser suite under the lock ("1 of 1 suites passed. 524.2 s summed"). Each break above was made on the
build, run (the browser suite's up to its first failure, which stops it), and put back.
