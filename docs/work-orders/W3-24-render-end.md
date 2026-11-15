# W3-24: a render's end on the game's voice queue

**Status 2026-11-14: planned, not built.** Written by a planner from the repository alone, at `main` `20bc58d`
(cache v53). It is read by a plan reviewer before any build. Five rulings are wanted first ("Rulings wanted before
the build").

**Kind:** a change to how renders are computed. A render of Steam voice on the game's voice queue whose source is
still in the queue when the file ends gets longer, by the sound that is cut today. Its samples up to the source's
length do not change. No other render changes by a sample or in length.
**Parts:** one order, one merge.
**Roles:** `tf-builder` (effort xhigh), then `tf-reviewer`, then a second reader on the stronger model
(`docs/PIPELINE.md`: it changes how renders are computed).
**Branch:** `claude/w3-24-render-end`, from `main` as it stands when the build starts. **Worktree:** in the brief.
**Reports:** `docs/reports/W3-24-render-end.md` (the builder's). The planning report is
`docs/reports/W3-24-plan.md`.
**Budget:** 8 hours.
**Cache number:** rises once at the merge (`voice-channel.js`, files of `engine/` and of `app/` change). The
builder does not set it.

## Why

A render on the game's voice queue is as long as its source (plus a room's tail). The voice channel plays each
sound later than the source has it, and the render takes that delay out in the mean (`D`, the timeline's zero).
A sound that plays later than the mean is still in the queue when the output reaches the source's length, and what
is left of it is dropped (`voice-channel.js`, `runBlock`: "Output before sample 0 or past length is dropped"). In
the game the channel plays out what it holds.

BC-4a's second reader measured it on the network test signal (finding 9's lines in `tests/REFERENCE_2026.md`): the
source's last 27 ms (9 to 53) are not heard at jitter 50 and 300 frames a second, 121 ms (72 to 172) at 66.67,
against 0 and 15 at jitter 0 (measured on the model, before W3-23a).

**The orchestrator's ruling (2026-11-14):** a render on the game's voice queue runs on past its source's end
until the channel has given out its last sample of voice, so the last words are heard. Where nothing is cut today
the render does not change by a sample or in length.

### Measured again on `main` `20bc58d`

The planner built the change of this order in a scratch copy of the tree and read from it how many output samples
past the source's length still hold a place of the source. That count is what `main` cuts. Every figure below is
measured on the prototype, a figure of the model with no recording behind it. Milliseconds, the mean and the range
over seeds 1 to 10, `voice_buffer_ms` 100, the suite's `speechLike` signal at -20 dB, 48 kHz.

| Source | Frames a second | Cut at jitter 0 | Cut at jitter 50 |
| --- | ---: | ---: | ---: |
| One phrase of 6.13 s that ends with the file | 300 | 0 (0 to 0) | 16.5 (0 to 41.2) |
| | 66.67 | 6.6 (0 to 26.1) | 81.3 (0 to 142.2) |
| | 60 | 0.3 (0 to 2.9) | 83.6 (0 to 150.9) |
| | 30 | 4.2 (0 to 24.4) | 95.7 (40.7 to 130.6) |
| Four phrases in 8.4 s, the last 1.5 s long and ending with the file | 300 | 0 (0 to 0) | 0 (0 to 0) |
| | 66.67 | 9.9 (0 to 41.5) | 79.1 (0 to 165.4) |
| | 60 | 3.2 (0 to 14.5) | 89.5 (0 to 130.6) |
| | 30 | 9.2 (0 to 41.5) | 102.8 (33.7 to 153.8) |
| The first source with 1 s of silence after it | 300, 66.67, 60, 30 | 0 in every run | 0 in every run |

The two test signals of `tests/testsignal/`, seeds 1 to 3 (measured on the prototype):

| Source | Frames a second | Cut at jitter 0 | Cut at jitter 50 |
| --- | ---: | ---: | ---: |
| `tf2_voice_nettest_v1` (58.2 s) | 300 | 0 (0 to 0) | 18.9 (11.9 to 23.5) |
| | 66.67 | 0 (0 to 0) | 88.3 (56.1 to 117.9) |
| | 60 | 0 (0 to 0) | 96.0 (67.7 to 117.9) |
| | 30 | 0 (0 to 0) | 84.4 (56.1 to 106.3) |
| `tf2_voice_testsignal_v1` (142.9 s) | 300 | 0 (0 to 0) | 13.2 (0 to 39.5) |
| | 66.67 | 0 (0 to 0) | 93.0 (44.1 to 136.6) |
| | 60 | 0 (0 to 0) | 77.6 (67.3 to 86.8) |
| | 30 | 0 (0 to 0) | 55.1 (0 to 86.8) |

The second reader's figures were of the network test signal: 27 ms at 300 and 121 at 66.67 with jitter 50, and 15
at 66.67 with jitter 0. The planner's are 18.9, 88.3 and 0, over three seeds and by this order's rule for what
counts as the source ("The rule", 2). Which seeds and which count the second reader used is not in the record, so
the two sets are not compared further. Both say the same thing: tens of milliseconds at 300 with jitter, about a
tenth of a second at 66.67.

**The page's default (300 frames a second, jitter 0) is not always a case with nothing cut.** A wider look at
jitter 0 (360 renders at each rate: a phrase or a 440 Hz tone that ends with the file, six lengths from 1.0 to
3.3 s, seeds 1 to 30; measured on the prototype):

| Frames a second | Renders that cut something | Mean cut | Largest cut |
| ---: | ---: | ---: | ---: |
| 1000 | 73 of 360 | 3.5 ms | 86.8 ms |
| 400 | 44 | 0.6 | 13.7 |
| 300 | 33 | 0.4 | 13.7 |
| 235 | 15 | 0.1 | 5.4 |
| 144 | 96 | 3.1 | 27.6 |
| 100 | 170 | 5.3 | 39.2 |
| 66.67 | 170 | 6.5 | 39.2 |
| 60 | 56 | 1.3 | 27.6 |
| 30 | 204 | 6.9 | 27.0 |
| 10 | 94 | 2.0 | 15.4 |

So at the default about one render in eleven of a file that ends in sound loses its last milliseconds, 14 at most
in this look, and such a render will grow by that much. A file that ends in a second of silence loses nothing at
any setting tried and will not change. With a short last phrase (0.1 to 1.2 s after a pause of 1 s, seeds 1 to 10)
the default cut something in 1 or 2 runs of 10, 20.5 ms at most; at jitter 50 it cut in 8 to 10 runs of 10, 28 to
48 ms in the mean and 83 ms at most (measured on the prototype).

**The sender's hold counts.** Steam's sender goes on sending for 0.4 s after the sound falls quiet (read,
W3-16). A file that ends less than 0.4 s after its last sound is still being sent at its end, so its last
packets, which hold the file's quiet end, can be in the queue too. With 0.4 s of zeros after a last phrase the
render at 300 frames a second and jitter 50 still ran on in 8 to 10 runs of 10, by 28 to 44 ms in the mean, and
at 66.67 in 10 of 10, by 85 to 89 ms (measured on the prototype). That run-on is the coded quiet of the file's own
end. Ruling 2 asks whether it stays.

**A long wait makes a long run-on.** With `voice_buffer_ms` 5000 at 1000 frames a second a new phrase waits 5000
ticks, 75 s (arithmetic, from `waitTicks`). A 2 s phrase rendered so is 2 s of silence today; with this order it is
74.5 s long, the phrase's last 0.5 s at its end (measured on the prototype: 72,516 ms past the source's length, 2.1 s
dropped to overflow). At `voice_buffer_ms` 1000 and 300 frames a second the same phrase runs on 2.0 s. The page
offers both settings. Ruling 3 asks whether that is wanted as it is.

## What is read

Where a render's length is set, and what reads it. Line numbers are `20bc58d`'s.

| Place | What it does with the length |
| --- | --- |
| `voice-channel.js`, `createTimeline` (`length`, required) | `runBlock` keeps only output samples 0 to `length - 1`. `finish()` runs the clock until the blocks cover `length` (under the frame clock, also until every message given is added) and returns exactly `length` samples in all. `info.source` has `ceil(length / 882)` slots. `hear()` writes a slot only where `out < length` |
| `engine/steam.js`, `steamChannel({ length, ... })` | Hands `length` to `createTimeline`. `take()` joins what the timeline gave |
| `engine/render.js`, `process()` (`:672` to `:707`) | `voiceLength = sincLength(codecLength, 24000, 44100)` is the channel's length. After `channel.finish()` it throws unless the channel gave `voiceLength` samples. Stage 6 (`:806` to `:811`): `outLength = playbackLength + tailAtDevice(tail, deviceRate)`, `playbackLength` the source's duration at the device's rate; the device stage's output is cut or padded with zeros to it |
| `engine/render-stream.js`, `createRender` | `outputLength` (the source's duration at the device's rate) and `maxTail` are given before any sample. The steam stage's `flush()` throws unless the channel gave `voiceLength` in all. The last stage gives out at most `outLength` samples before `finish()`; with a room, what the device stage gives past them waits for `finish()`, which cuts or pads to the tail |
| `engine/steam.js`, `steamPlayedInfo` | `frameLog` and `frameBytes` as played have the sent logs' length, one entry for each 20 ms of the source |
| `engine/steam.js`, `steamDemoVoice` (a demo's own packets, W3-02g-a) | A message that arrives at or after the first mixer block past the render's end is not run (`pastEnd`) |
| `engine/live-chain.js` (the live monitor) | `length: Infinity`: no end, nothing is cut at one. A recorded live take ends where the person stops it |
| `audio-worker.js` | The first seconds: a render of the source's first 15 s, of which the first 14 s are posted (`samples.slice`) |
| `app/render.js` | `presentRender` shows `samples.length / sampleRate` in the status line and the console line, keeps the WAV blob for the player and the downloads, and clamps the player's place to the new duration. `renderedStatus` the same |
| `app/visualizer.js`, `laneSkips` (`:895`) | A queue's skip is shown when its time is before `state.renderedSource.duration`, the source's end ("the render with a room runs longer by the room's tail") |
| `app/visualizer.js`, `frameAt`, `drawCodecLane` | The codec lane runs to `info.frames`, the sender's count: the source's length |
| `app/realtake.js` | A real take is laid on the source's length, whatever the render's |
| `batch.js` | Renders through the worker with `renderOptions()`: the same engine, the same length |
| `video.js`, `app/render.js` `sourceRenderOptions` | A source from a video file keeps the file's own timing whatever Phrase timing says, so the video export never has a render on the queue |
| The page's keys (`settingsKey`, `stageKeys`, the batch's key) | Made from the options. This order adds no option, so no key changes |

A render with a room is already longer than its source, by the room's tail. The page's player, the A/B twin of
the original, the meter, the views and the downloads already take a render that is longer than the source.

## The change

### The rule

On a render of Steam voice on the game's voice queue, made by the model's sender (not from a demo's packets):

1. The timeline keeps its output past `length` instead of dropping it, and `finish()` runs the clock on until the
   channel holds no sample (`ch.count === 0`) and the mixer's kept sample is not a sample of a sound message. Under
   the frame clock it runs whole frames, as `finish()` does today.
2. **The voice's end** is one past the last output sample at which a place of the source was heard: a sample of
   a sound message whose source position `pos` has `0 <= pos < length` (`hear()`'s `pos`, for a spurt `s >= 0`).
   A silence record's zeros, the mixer's padding of an underrun, and the zeros the sender reads after the source's
   end (`pos >= length`) are not places of the source.
3. **The run-on** is `over = max(0, voice's end - length)` samples at 44.1 kHz. The timeline returns `length +
   over` samples in all. `push()` and `advance()` return no more than `length` in all; `finish()` returns the rest
   of `length` and then the `over` samples.
4. Where `over` is 0 the timeline's samples and `info` are today's, member for member: `info` has no new member.
   Where `over > 0`, `info.over` is that count and `info.source` has `ceil((length + over) / 882)` slots, the
   slots past `length` filled as the others are.
5. **What the run-on may write into `info`.** `finish()` first does all it does today, and what `info` would
   hold then is the base. While the clock runs on after that, a sample changes the record (a spurt's offsets, a
   slot, the voice's end) only if it is a place of the source by rule 2. An overflow not yet heard when the run-on
   starts keeps today's time (the end of the last block today's `finish()` runs) unless it is heard at a sample
   before `length + over`, whose time it then takes. The planner's first prototype missed this: a render with
   nothing cut kept its samples and still changed `spurts[].offsetEndMs`, because the sender's zeros after the
   source's end were heard in the run-on.

The fade is the channel's own (the last 0.1 s of the queue) and falls inside the voice, so the run-on ends with
the fade done whenever the queue ran empty. The padding after the pull that empties the ring (one repeat of at
most 256 faded samples, at most 5.8% of the level, then zeros; arithmetic from `pull()`) comes after the voice's
end and is left out. Ruling 4 asks whether to keep it.

### `voice-channel.js`

`createTimeline` takes `playOut` (`true` or `false`, default `false`; anything else a `RangeError`; `true` with
`length: Infinity` a `RangeError`). With `playOut: false` every line of today's behaviour stays. With it:

- `runBlock` keeps the part of a block at or past `length` in a list of its own, and `hear()` records the voice's
  end and the slots past `length`.
- `finish()` first does what it does today, then runs on by rule 1 under rule 5, then builds `over`, the samples
  and `info`.
- `onOpen`'s index and `held()` are as today up to `length`. No caller passes `playOut` and `onOpen` together;
  the header comment says what the index is past `length` (the block's first sample, counted on past `length`).

The header comment's contract is written for `playOut`, with rule 2 in it.

### `engine/steam.js`

`steamChannel` passes `playOut: true` when `length` is a whole number and `zeroSamples` is not given. A demo's
packets (`zeroSamples`) and the live chain (`length: Infinity`) pass none. `steamPlayedInfo` is unchanged: the
logs as played keep the sent logs' length, and `codecInfo.channel` is the channel's `info`, so `codecInfo.channel.over`
is there exactly when the render ran on.

### `engine/render.js` and `engine/render-stream.js`

- The check on the channel's count becomes `voiceLength + over`.
- The voice with its run-on goes through stage 5 as it is. A room's tail then follows the run-on.
- `outLength = playbackLength + overAtDevice + tailAtDevice(tail, deviceRate)`, with
  `overAtDevice = Math.round(over * deviceRate / 44100)` (`tailAtDevice`'s arithmetic; one helper for both).
- `createRender`: `outputLength` stays the source's duration at the device's rate. Before `finish()` it gives out
  no more than `outputLength` in all, on the queue as with a room; `finish()` gives the rest, the run-on and a
  room's tail. Its header comment says a caller cannot size one buffer before `finish()` on the queue: no bound is
  given (the page does not call `createRender`; a bound is not built).
- `codecInfo` is otherwise unchanged. `process()` and `createRender` give the same samples and `codecInfo`.

### The page

- `app/render.js`, `presentRender`: after the queue's line, when `codecInfo.channel.over > 0`, one console line:
  `S_Voice: the queue was still playing at the file's end: the render runs N ms longer`, N rounded.
- The status line, the player, the downloads and the batch need no change: they read the samples.
- `app/visualizer.js`, `laneSkips`: the end is the source's duration plus `over / 44100`.
- The codec lane still ends at the source's end. The lane over the run-on is not built.
- `index.html` (`timeline-help`) and `app/console.js` (`voice_timeline`): one sentence each, "A sound still in
  the queue when the file ends plays out, so the render can be a little longer than the file."
- A recorded live take is unchanged, and so are a source from a video file and a demo's voice.

### The records and the words

- `tests/REFERENCE_2026.md`, dated lines only: at finding 9's two lines on the last 27 and 121 ms, that the
  render now plays them out, with the table of "Measured again" made again on the build.
- `docs/VOICE-PATH.md` (`:92`, "The file is as long as the source, plus the room's tail"), `docs/PAGE.md` and
  `README.md` where they give a render's length.
- `tests/README.md`: the two suites' rows.
- `docs/PROGRESS.json`'s deferred entry is closed by the orchestrator at the merge.

## What must not move

**Every recorded hash.** The planner ran `node tests/render-stream.verify.mjs --hashes` on `main` and on the
prototype. The two outputs are equal, byte for byte: every WAV hash, every `codecInfo` hash and every hash of the
gain's output, the nine cases on the game's voice queue among them (seven of the model's sender at 300 and 66.67
frames a second, one of them at loss 15% and jitter 50, and two of a demo's packets). Each of those nine sources
ends with nothing of it in the queue.

The planner also ran the prototype through `pnpm test voice-channel verify steam reproduce demo recordings
stages`: all seven passed with no file of theirs changed. `tests/render-channel.verify.mjs` failed in the 17 checks the list below names
and in no other. `tests/render-stream.verify.mjs` whole was started and stopped by the session's time limit after
its first sections, with no failed check in what ran; `--hashes` is the run that counts. The browser suite was not
run.

So no recorded hash is of a render that cuts something today, and none may move. How the builder checks it:

1. `node tests/render-stream.verify.mjs --hashes` before the first change and after the last: the two outputs are
   equal, byte for byte. Both are kept beside the report.
2. `pnpm test stages`, `pnpm test steam`, `pnpm test reproduce`, `pnpm test demo`, `pnpm test recordings` and
   `pnpm test verify` pass with no recorded value changed in their files.
3. Every existing check of `tests/voice-channel.verify.mjs` and `tests/render-channel.verify.mjs` passes
   unedited, apart from those the list below names.

**What may move**, each for the reason given:

- In `tests/render-channel.verify.mjs` and `tests/voice-channel.verify.mjs`, a check whose render ends with its
  source in the queue and which compares a length or the whole output with a reference built at the source's
  length. The reference gets the play-out, written again from this order's text. On the prototype these
  were 17 of the settings of `tests/render-channel.verify.mjs`'s section 1 ("the 'game' voice at the mix point is
  the reference's"), whose 12 s source ends in the queue: `100 fps`, `66.67 fps`, `loss 15%`, `jitter 50 ms`,
  `loss 15%, jitter 100 ms`, `jitter 200 ms at 66.67 fps`, the late-frame mask at 66.67 and at 30, `the gate off,
  loss 40%`, `30 fps`, `jitter 50 ms` at 60, 30 and 10, `loss 15% at 60 fps`, `loss 15%, jitter 50 ms at 10 fps`,
  `agc off` at 60 and at 30. In each the first `529200` samples were the reference's and the render went on past
  them. Every other check of the suite passed unedited, the stream's checks among them.
- `tests/browser.verify.js`: a check that reads a render's length on the queue from a source that ends in sound.

A recorded hash that moves, in any suite, is a reason to stop.

## The tests

Every check with its break. Runnable without the owner's recordings.

1. **The option off is `main`.** The existing checks of `tests/voice-channel.verify.mjs` pass unedited. Added:
   for the suite's made-up traffic at 10, 30, 60, 66.67, 300 and 1000 frames a second, `playOut: false` and no
   `playOut` give the same samples and the same `info`.
2. **The play-out against the second models.** `tests/voicequeue/reference-frames.mjs` and the suite's
   `referenceTimeline` get `playOut`, written again from "The rule" with plain loops (no shared code with
   `createTimeline`). Made-up traffic whose last sound message lies across the end, at the six rates of check 1,
   pushed whole and with `advance` between pushes at odd ticks: samples, `over` and `info` equal the model's.
   Breaks: dropping the kept sample from rule 1 fails it at a case built so that the last place of the source is
   the mixer's kept sample; `pos <= length` for `pos < length` fails it.
3. **Nothing cut, nothing changed.** Traffic whose last sound message is heard whole before `length`: with
   `playOut: true` the samples and `info` are those of `playOut: false`, and `info` has no `over`
   (`Object.keys` equal). Break: adding `over: 0` to `info` fails it.
4. **The head is unchanged.** With `playOut: true` and a run-on, the first `length` samples are those of
   `playOut: false`, and before `finish()` the timeline has returned no more than `length`. The whole output is the
   first `length + over` samples of a timeline of the same traffic made 5 s longer without `playOut`.
5. **What is not a place of the source.** Three cases, each with `over` 0: the queue holds only a silence
   record's zeros at the end; only a message whose `source` is at or past `length`; only the padding of an
   underrun. One case with a sound message that straddles `length`: the run-on ends at the sample whose `pos` is
   `length - 1`. Break: counting every pulled sample fails all four.
6. **A channel still waiting at the end.** A message that opens a channel two ticks before the end at
   `voice_buffer_ms` 1000 and 300 frames a second: the run-on holds its wait and then its sound. `finish()` ends
   at `voice_buffer_ms` 5000 and 1000 frames a second, and `over` is the model's.
7. **Refusals.** `playOut: 1`, `playOut: 'yes'`, and `playOut: true` with `length: Infinity` each throw a
   `RangeError`.
8. **An overflow in the run-on** has its time in `info.drops` before `(length + over) / 44100`.
9. **Renders** (`tests/render-channel.verify.mjs`). `process()` on Steam voice on the queue, of a source that ends
   in sound, at 300, 66.67, 60 and 30 frames a second, at jitter 0 and 50, with loss 15%, and with the auto-gain
   off: the voice (the `onGain` hook) and `codecInfo.channel` equal `referenceRender` with the second model's
   play-out. At least one case at each rate has `over > 0` and one at 300 has none.
10. **The output's length.** `samples.length` is `round(source length x device rate / source rate) +
    round(over x device rate / 44100)` plus the room's tail, at device rates 44100 and 48000, with and without a
    room. The first `round(source length x device rate / source rate)` samples of a render without a room are
    those of the same render by a copy of the engine in which `steamChannel` passes no `playOut`
    (`loadEngine({ root })` on a copy with that line changed). Break: `overAtDevice` left out of
    `outLength` fails it.
11. **The stream.** `createRender` in pieces of odd sizes gives `process()`'s samples and `codecInfo` for the
    cases of check 9, with a room too; before `finish()` it has given no more than `outputLength`. Break: the last
    stage holding back only with a room fails it.
12. **Nothing cut, nothing changed, in a render.** A source that ends in 1 s of silence, at the eight settings of
    check 9's rates and jitters: the WAV's hash is the one recorded from `main` before the first change, in a
    commit of its own, and `codecInfo.channel` has no `over`.
13. **The stage keys.** With `stages`: a render at jitter 50 after one at jitter 0 starts from B and gives a
    fresh render's samples and length.
14. **The live chain** gives the render's first samples as today (`sameAsRender` passes unedited).
15. **The first seconds.** `pnpm test stages` passes unedited: the first 14 s of a render of the first 15 s are
    the whole render's.
16. **The page** (`tests/browser.verify.js`): a source that ends in sound, rendered at 66.67 frames a second and
    jitter 50 with a seed the builder picks for `over > 0`: the status line's seconds, the player's duration and
    the downloaded WAV's length are the render's; the console has the new line; a render at 300 and jitter 0 of a
    source that ends in silence has no such line and the source's length.
17. **Determinism.** The same render twice gives the same samples and length.
18. **What a listener gets**, recorded as figures in the report: the three tables of "Measured again" made again
    on the build with `codecInfo.channel.over`, beside this order's.

## Files

May touch: `voice-channel.js`, `engine/steam.js`, `engine/render.js`, `engine/render-stream.js`,
`engine/room.js` (only for the shared helper), `app/render.js`, `app/visualizer.js` (`laneSkips`), `index.html`
and `app/console.js` (the one sentence each), `tests/voice-channel.verify.mjs`,
`tests/render-channel.verify.mjs`, `tests/voicequeue/reference-frames.mjs`, `tests/voicequeue/README.md`,
`tests/browser.verify.js`, `tests/REFERENCE_2026.md`, `tests/README.md`, `docs/VOICE-PATH.md`, `docs/PAGE.md`,
`README.md`, and the report.

May not touch: `sw.js` (the number is set at the merge), `steam-sender.js`, `engine/live-chain.js`, `live.js`,
`audio-worker.js`, `batch.js`, `video.js`, the codecs and `vendor/`, `tests/predictions/`, `tests/recordings/`,
any recorded hash of any suite, and `docs/PROGRESS.json`.

No new engine file: the five lists stay as they are.

## Done means

- `pnpm test voice-channel render-channel` passes; then `flock /tmp/tf2ve-heavy.lock pnpm test`; then the browser
  suite the same way.
- The two `--hashes` outputs are equal.
- Each break above was made and seen to fail its check, and is listed in the report.
- A render of 10 minutes on the queue at 300 frames a second takes no more than 1.05 times the time and memory of
  the same render on `main` (measured, in the report).
- CI's `verify` is green on the branch's head.

## Stop and ask

- A recorded hash moves.
- A check of `tests/stages.verify.mjs`, `tests/steam.verify.js`, `tests/reproduce.verify.mjs`,
  `tests/demo.verify.mjs` or `tests/recordings.verify.mjs` fails.
- `createRender`'s samples cannot equal `process()`'s without giving out samples past `outputLength` before
  `finish()`.
- The budget is spent.

## What the reviewer attacks

- Rule 2's edges: the kept sample, a message that straddles `length`, a pre-roll before sample 0, a spurt with
  no silence record after it.
- `over` in the stream when the last pieces are one sample long, and with a room whose tail is at its cap.
- A render that runs on by less than one device sample (`overAtDevice` 0 with `over > 0`).
- The second models: that neither shares a line with `createTimeline`'s play-out.

## After the merge: the private run

`tests/accuracy.mjs` and `tests/retiming.mjs` render on the queue against the owner's takes. The orchestrator
runs both after the merge. Expected: every row equal unless its source ends in the queue, and then only its last
piece (inferred; not run by the planner, who has no recordings).

## Rulings wanted before the build

1. **`over` only where a render ran on.** `codecInfo.channel.over` is absent when nothing was cut, so that no
   recorded `codecInfo` hash moves. The other way is `over: 0` on every render on the queue, and the `codecInfo`
   hashes of the nine cases on the queue in `tests/render-stream.verify.mjs` recorded again in a commit of their
   own (their WAV hashes still equal). The order is written for the first.
2. **The file's quiet end.** By rule 2 a file that ends within the sender's 0.4 s hold of its last sound runs on
   by the coded quiet of its own end (28 to 44 ms in the mean at 300 frames a second and jitter 50, 85 to 89 at
   66.67). The planner
   keeps it: it is what the game would play, and no test of "quiet" is exact. The other way is to end the run-on
   at the last output sample that is not zero.
3. **No cap.** At `voice_buffer_ms` 5000 and 1000 frames a second a 2 s render becomes 74.5 s. The planner sets
   no cap: the wait is the model's, and today's render at that setting is silence.
4. **The padding after the last pull** (at most 256 samples, at most 5.8% of the level) is left out. The other
   way ends the run-on at the end of the mixer block that emptied the ring, up to 511 samples later.
5. **A demo's packets on the queue keep their length.** The page does not run them (W3-02g-b is withdrawn), and
   their end has a rule of its own (`pastEnd`: a message that arrives past the end is not run, so a play-out
   there would be half of one). The order leaves them as they are. The prototype had the play-out on for them
   too, and no check or hash of a demo moved, so including them later costs little.

## The orchestrator's rulings (2026-11-15)

1. **`over` only where a render ran on**, as the order is written. No recorded `codecInfo` hash moves.
2. **The file's quiet end runs on.** It is what the game would play.
3. **No cap, and a console line.** At an extreme setting today's render is silence where the game would play the
   voice later. A run-on of more than 10 s gets one console line saying how long and why (the wait at that
   `voice_buffer_ms` and frame rate).
4. **The padding after the last pull is left out**, as the order is written.
5. **A demo's packets keep their length**, as the order is written.
6. **No exemption at the page's default.** The run-on there is rare and small (33 of 360 short renders ending in
   sound at 300 frames a second and jitter 0 cut something, 13.7 ms at most; measured on the planner's prototype),
   and it is what the game plays.

## After the review and the second read (2026-11-15)

The review's verdict is merge after fixes; the second read's is that the model is right (its own play-out, built
from the rule alone, gave the branch's `over`, samples and `info` in every run it made; measured on the model, none
against a recording). The orchestrator's rulings on the builder's two matters, then the fixes, all on the branch
before the merge.

**Ruling A: which samples before the source's length may change.** The order said none. That is wrong in two
places, and the build is right in both:

- The run-on follows the voice with no gap. The voice is `voiceLength` samples at 44.1 kHz, and through the 24 kHz
  codec that can be one less than the source's own length there. On `main` the place between them was zero padding;
  it now holds the run-on's first sample (the review, measured: one sample at a 44.1 kHz device, two at 48 kHz, on a
  44.1 kHz source of 176,408 samples).
- At a device rate other than 44.1 kHz the device stage's interpolation reads the next mix sample (the second read,
  measured: the 48 kHz render equals a plain linear interpolation of the 44.1 kHz render with its run-on).

So the rule is: on a render that ran on, an output sample before the source's length changes only if the device
stage's read for it touches mix index `voiceLength` or later. On a render that did not run on, nothing changes.

**Ruling B: `createRender` against `process()` at the bound** stands as built (the review: 150 random cases, no
difference; the second read: the play-out removes a difference `main` has).

**The fixes.**

1. **Blocking: ruling A, said and checked.** Check 10 gains a 44.1 kHz source whose `voiceLength` is under its
   length, at 44.1 and 48 kHz devices, and asserts that the changed samples are exactly those ruling A allows.
   `docs/VOICE-PATH.md`, the report and check 10's name say ruling A, not "one sample at 48 kHz".
2. **The run-on's last sample at the device.** `mixAtDevice` rounds, which cuts a last output sample that still
   reads the run-on's last place (the second read: 2 of 5 run-on renders at 48 kHz without a room, values 9325 and
   9805 of 32768). The run-on's length at the device is rounded up. The room's tail keeps `Math.round`: it must not
   move. Check 10's length formula follows, and the order's own (`The tests`, 10) is read with this ruling.
3. **Whole sample numbers** at `voice-channel.js:728`: the overflow's heard sample is kept as a whole number and
   compared with `length + over` as whole numbers, as the second model does (both readers; a drop's time could take
   the run-on's where the rule gives the base's, at exactly `length + over`). A check on a built case.
4. **`onOpen` with `playOut`.** The header's "no caller passes both" is false (`engine/steam.js` passes both when
   handed `onOpen` with a whole length). Both headers say what the index is under `playOut`: the place in the
   played-out stream, which can be at or past `length + over` when nothing of the source is heard after it. No
   change of behaviour.
5. **Check 6 under the frame clock**: rows at 30 and 10 frames a second against the second model (the review's
   break A, the run-on as even ticks under the frame clock, passed every suite).
6. **The console lines.** Check 16 asserts the 66.67 case prints no "the render runs on" line, and a small check
   pins the over-10 s line (the review's break C passed the browser suite).
7. **The lane check** (`tests/browser.verify.js`, the skips' division) takes `over` into its end, or a case with a
   skip inside the run-on is built.
8. **The words.** The report's count of checks goes. The report says `6be5e2c` (the help-text audit) moved because
   this order's `index.html` sentence forces it, not that it is of the kind the order lets move. The rows labelled
   66.67 were run at 1000/15 and are labelled so in the report and in the record's new paragraph (at a literal
   66.67 the network signal at jitter 50 reads 92.2, 56.1 to 114.1, against 88.3; the review, measured).

**Accepted as it is:** the dated note in `tests/predictions/PREDICTIONS.md`, a file the order forbade. The
predictions' renders keep the file's own timing and do not run on; the note says so and changes no prediction.
