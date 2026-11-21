# W3-26b: the capture converter wired into the render, the stream and the live chain

The build report for W3-26b of `docs/work-orders/W3-26-capture-conversion.md`, branch
`claude/w3-26b-capture-wiring`, from `main` `596e18b` (W3-26a merged: `capture-converter.js` at the root). The `steam`
profile's capture runs Windows's converter at quality 30 as read (finding 28) in `process()`, `createRender` and the
live chain, and the fitted filter is gone. Main moved twice while the branch was built (`596e18b` to `18b0f9c`:
documents only, W3-27's order and plan, rows added to the record's files table); it was not merged in.

`node tests/cache-number.mjs origin/main --report`: "cache number against origin/main (18b0f9c): the number is v54,
not above v54: it must rise (node tests/cache-number.mjs origin/main --set)". The files it names are the engine's,
the page, both workers and `sw.js`. The number is the orchestrator's; the branch does not touch it.

## What changed

| File | Change |
| --- | --- |
| `constants.js` | `steam` loses the fitted filter and gains `capture: { converter: 'windows', quality: 30 }`, with a comment on what it is and its standing; the profile table's comment names `capture` in place of the filter |
| `engine/steam.js` | `captureConverter(codec)` beside `steamModules()`, and `steamCapture`'s comment (below) |
| `engine/render.js` | stage 2: `conv = enableCodec && !received ? captureConverter(codec) : null`, then `conv.convert(samples, srcRate)` or the app's `resampleSinc`; the filter's lines go |
| `engine/render-stream.js` | the first stage is `conv.createStream(srcRate)`, pushed as the sound comes and ended at `codecLength` (`sincLength(...)`, which is the module's `length()`), or `sincStage`; the filter's stage goes |
| `engine/live-chain.js` | both paths honour `capture` (below); the hold-backs take the capture's wait; the header and the comment at `contentDelay` |
| `engine/codec.js` | `profileEq` loses its second parameter |
| `audio.js` | the header's words only |
| `index.html`, `audio-worker.js`, `live-worker.js`, `sw.js` | `capture-converter.js` after `steam-sender.js`; in `sw.js` the list only |
| `tests/lib/engine.cjs` | the file in `ENGINE_FILES`, and in `HANDED` under `TF2CaptureConverter` (test 6); the header |
| `tests/harness.verify.mjs` | check 6b (test 6); check 7 counts the files handed in by name as not left on Node's global object |
| `tests/verify.js` | section 2 (test 5); the read of `steam_48`'s filter goes |
| `tests/steam.verify.js` | tests 1, 2 and 4; the live chain's two paths; sources of 0 to 2 samples |
| `tests/gain.verify.mjs` | `test_frame_gate` carries `capture: undefined`, and its own chain loses the filter (test 7) |
| `tests/render-stream.verify.mjs` | three cases (test 3); the vm context is handed the converter; `GOLDEN` and `GAIN_GOLDEN` recorded again (test 8) |
| `tests/render-channel.verify.mjs` | the three recorded values the order names, recorded again (test 8) |
| `tests/browser.verify.js` | the note with 206.9 ms |
| `tests/accuracy.mjs` | `MODEL_FILES` gains `capture-converter.js` |
| `README.md`, `docs/VOICE-PATH.md`, `docs/ACCURACY.md`, `docs/FINDINGS.md`, `docs/LIVE.md`, `tests/README.md` | the words, as the order's table lists them; `README.md`'s files table gains a row; `docs/LIVE.md`'s queue table takes the chain's new holds |
| `tests/predictions/PREDICTIONS.md` | one dated line |
| `tests/REFERENCE_2026.md` | dated lines added (finding 28 after "Standing of the whole", findings 14 and 16, the Model table's two capture rows, "What remains unverified"); nothing deleted or reworded |
| `docs/reports/W3-26b/` | the two `--hashes` outputs |

Not touched: `capture-converter.js`, `tests/capture-converter/`, `steam-sender.js`, `voice-channel.js`, the codecs,
`vendor/`, `engine/dsp.js`, `predictions.json`, `tests/recordings/`, `tests/accuracy.takes.json`, the number in
`sw.js`, `docs/PROGRESS.json`, `docs/PROGRESS-LOG.md`, `docs/README.md`, `CLAUDE.md` and the order.

## How it is wired

**The one reading of the member.** `captureConverter(codec)` returns `TF2CaptureConverter` when `codec.capture` is
`{ converter: 'windows', quality: 30 }` with those two members alone, and `null` when the profile has no `capture`
(absent or `undefined`, as a test's copy carries it). Any other value (another converter or quality, `null`, a
member more) is an `Error` that names the member and shows the value; a `capture` on a profile whose `codecRate` is
not 24,000 is an `Error` that names both; and the member with the module not loaded is an `Error` that names
`capture-converter.js`. The module is found by its global name, as `steamModules()` finds the sender.

**The render and the stream** call it only where the fitted filter ran: the codec on and the sender's own sound. With
the codec off, and for a demo's received voice, the capture is the app's resampler as before. The clip comes before
the conversion and the 16 bits after it, so the converter's overshoot past full scale is clamped by the 16 bits.

**The live chain's first path** (`steamLiveChain`): `conv ? conv.createStream(ioRate).push : streamResampleSinc(ioRate,
STEAM_RATE)`, and `captureWait` is `conv.wait(ioRate)` or `sincWait(ioRate, STEAM_RATE)`, the one term in place of
the resampler's wait and the filter's half length in `holdBack` and `queueHoldBack`. `contentDelay` stays 0: the
converter's output `k` sits on its input instant; it holds back and shifts nothing.

**The live chain's second path** (`createLiveChain`'s own, for every case but `steam` with the codec on): with the
codec on it takes the profile's converter where the profile has one, as the render does, and the app's resampler
otherwise. No shipped profile has `capture` there; a test's copy of `steam` on the 20 ms frame gate does, and
`test_decoder_eq` and `test_frame_gate` were such copies. Its `latencyMs` counts neither capture's wait, as it
counted no resampler's before (chosen: the figure on that path was the pre-roll, the decoder filter and the
lookahead, and stays so). The filter's term goes from `delaySeconds`; on the shipped profiles that term was 0, so no
`contentDelay` moves.

**Test 6, the module missing.** Built as the room module's absent case is built, by the plan review's first point.
`capture-converter.js` is in `HANDED`: the loader `require`s it and hands it to the engine's function under its global
name, and `loadEngine({ TF2CaptureConverter: null })` hands the engine nothing under that name. The parameter shadows
any global of the name, so no other load can leak it in. The other way the plan review named, a copy of the files
with a stub, was not needed: joined into the loader's text the module would attach itself to Node's global object
(it has `steam-sender.js`'s form), where a later load would still find it; handed in, it attaches nowhere. Check 7
now says the handed files are not on Node's global object. The vm context of the stream suite is handed the module
as it is handed the room module.

## The hashes that moved and those that did not

`node tests/render-stream.verify.mjs --hashes` on the untouched tree (`596e18b`, before any change) and on the head
(`86aaee4`), kept as `docs/reports/W3-26b/hashes-main.txt` and `hashes-branch.txt`, compared case by case:

- **Moved, all three hashes (WAV, `codecInfo`, the gain's output): 50 cases**, the 50 the order names: the 48 named
  `steam` that run Steam's sender with the codec on (the game's timeline, the rooms, every source rate, loss,
  jitter, the gate off), `odd options` (its unknown codec renders as `steam`) and `test profile with a decoder EQ`
  (a copy of `steam` on the frame path that keeps the member).
- **Not moved: 35 cases**, the 35 the order names: every case of `steam_48`, `celt_22`, `celt_44`, `speex` and
  `miles`; `steam, codec bypassed`; `steam, empty source`; `steam, silent but for a quarter frame of sine at the
  end`; the four renders of a demo's voice, as received and on the game's timeline.
- **Added: 3 cases** (test 3).

No hash of a case that does not run Steam's sender with the codec on moved. `tests/render-channel.verify.mjs`:
`LIVE_MAIN`'s three `steam` rows, section 24's `MAIN` and section 29's eight `ENDS_IN_SILENCE_MAIN` moved and were
recorded again; `LIVE_MAIN`'s `celt_22` row did not move. Before the recording `tests/stages.verify.mjs` was run on a
copy whose stream suite lacked the three new cases (it reads the stream suite's cases, and a case with no hash stops
it): every check passed but the recorded hashes of exactly those 50 cases. The head's `--hashes` output is byte for
byte the one the hashes were recorded from.

**What must not move, shown.** `tests/steam-sender.verify.mjs`, `opus`, `reproduce`, `demo`, `swresample`,
`voice-channel` and `recordings` pass with no line of theirs changed (`git diff 596e18b..HEAD` on them is empty).
Every length is as before: `codecLength` and `voiceLength` are still `sincLength`'s, which the module's `length()`
equals (the rule's step 10, held by its own suite), and the output's is the source's at the device's rate. On the
test signal the render is 6,857,760 samples on both trees (measured), and the streamed checks hold every stream's
length to `process()`'s.

## What moves at the capture and in the render

Measured on the build against `main` on the test signal (`tests/testsignal/tf2_voice_testsignal_v1.wav`, 142.9 s,
48 kHz, left channel), of the model only; none of this is of a recording. They equal the planner's prototype
figures to the rounding.

| Band | The two captures' difference, below main's capture | The level's change at the capture | The level's change in the render |
| ---: | ---: | ---: | ---: |
| 0 to 10 kHz | 98.9 dB | 0.000 dB | +0.005 dB |
| 10 to 11 kHz | 27.4 dB | +0.075 dB | +0.052 dB |
| 11 to 12 kHz | 17.8 dB | +0.215 dB | +1.236 dB |
| 10 to 12 kHz | 20.9 dB | +0.135 dB | +0.256 dB |
| 0 to 12 kHz | 42.3 dB | +0.001 dB | +0.008 dB |

After the 16 bits 34.2% of the capture's samples differ, by 551 steps at most. In the render 38.9% of the samples are
equal; the sender makes 1,803 messages against 1,805, with 646 DTX frames against 665 and 23 spurts both times.

## The latency figures

The live chain's `stats.latencyMs` on `steam`, read from both trees' chains (computed from their terms; the check of
test 4 holds the branch's to the terms with `H / rate` written out from the order's table):

| Context's rate | Before | After | Low latency, before | After | On the game's voice queue at 300, before | After |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 44,100 | 206.875 | 202.232 | 126.833 | 122.190 | 563.904 | 559.261 |
| 48,000 | 206.898 | 202.252 | 126.856 | 122.210 | 563.927 | 559.281 |
| 96,000 | 206.898 | 202.241 | 126.856 | 122.200 | 563.927 | 559.270 |
| 16,000 | 208.208 | 203.917 | 128.167 | 123.875 | 565.237 | 560.946 |

Each equals the order's table. `lowLatencySavingMs` (80.042) and `queueCostMs` (357.029) do not move. On the queue at
48 kHz: 303.861 ms at 66.67 frames a second, 350.301 at 100, 315.471 at 60, 280.641 at 30, 292.251 at 20 and 327.081
at 10, each 4.646 ms under main's. `docs/LIVE.md` takes them; the panel's figures there were measured before.

## The checks and the break that each caught

Each break was made in a copy of the tree outside the worktree (`TF2_DIR` at the copy), seen to fail, and the copy
put back. The module's break (test 2) was made in the copy's `capture-converter.js` only.

| Check | Where | Break | What caught it |
| --- | --- | --- | --- |
| 1. the render's capture is the module's (48 and 44.1 kHz, `micGain` 2, the clip acting on thousands of samples and the 16 bits on the converter's overshoot) | `tests/steam.verify.js` [5c] | `resampleSinc` left in `engine/render.js` | test 1 (first difference at message 0); also the 0-to-2-sample check and W3-21's check that the render and the stream lie alike |
| 1 | | the clip moved to after the conversion | test 1 |
| 1 | | the gain applied after the conversion | test 1 |
| 2. a 24 kHz source: `captured()` the clip and the 16 bits, no filter, `eqDelay` gone | [5c], [10b] | the 68-tap design run at 24,000 Hz in place of the pass-through | the [5c] and [10b] checks on 24 kHz sources (the 16-bit decode, loss, the refusal, the live chain's give-out rule among them) |
| 3. the stream is the render, from 44,056 (not rated), 16,000 and 96,000 Hz | `tests/render-stream.verify.mjs` | `flush` asking for `floor(n L / M)` | the streamed renders of the 44,056 and 96,000 Hz cases, the prime-length case and the 37,800 Hz case at every plan |
| 3 | | the stage keeping its own count of outputs (`end(made + ceil(wait x 24000))`) | the streamed renders of many `steam` cases |
| 4. `latencyMs` from its terms, 202.252 and 202.232 ms, `contentDelay` 0 | [10b] | `sincWait` left in `holdBack` | test 4, and the hold-back against the output's shortfall |
| 4 | | the converter's wait counted in `contentDelay` | test 4 (`contentDelay` 63 and 58), the `contentDelay` index check, the hold-back check |
| 5. `steam`'s member, no other profile's, and a capture not built refused | `tests/verify.js` [2] | another quality accepted | test 5 (another quality not refused) |
| 5 | | the old filter's member left on `steam` | test 5 |
| 5 | | the rate check taken out | test 5 (the 48 kHz profile not refused) |
| 6. the module missing | `tests/harness.verify.mjs` [6b] | `captureConverter` taking a missing module as no capture | 6b (not refused in `process()`, `createRender` or the live chain) |
| the second path honours `capture`; the first keeps its fallback | [10b] | the second path's `toCodec` left as `streamResampleSinc` | the second-path check |
| | | the first path's fallback taken out | the suite stops with a `TypeError` at the fallback's check |

Test 7 (`test_frame_gate` with `capture: undefined`) has no break of its own in the order; its checks are of the gain
and passed. Test 8 is the recording, below.

The checks added beside the order's: on the live chain's second path the frames the codec is given are the test's
own copy of the module's output, bit for bit, and with `capture` undefined the app's streaming resampler's; on the
first, a copy of `steam` with `capture` undefined runs the same in the render and the live chain and holds back the
resampler's wait; and sources of 0, 1 and 2 samples from 48 and 44.1 kHz give the same samples in `process()` and
`createRender`. Test 1's chain is a fresh instance of the module (`require` with Node's cache entry put aside and
restored), not the one the engine was handed. Test 5 looks for any member named `capture...` but `capture`, which is
broader than the order's "no `captureEq`" and keeps that word out of `tests/` for the order's search.

## Time

A render of the test signal, three runs each, the median (measured on the shared machine under the heavy lock, the
two trees one after the other):

| | `main` | the branch |
| --- | ---: | ---: |
| `process()`, the file's own timing | 5.93 s | 4.91 s |
| `createRender` in 1 s pieces, the file's own timing | 6.31 s | 5.32 s |
| `process()`, the game's voice queue at the page's defaults | 6.53 s | 5.53 s |
| `createRender` in 1 s pieces, the game's voice queue | 6.90 s | 5.87 s |
| the capture alone: the app's resampler and the filter, against the converter | 1.93 s | 0.82 s |

A first run on `main` before any change gave 5.68, 6.10, 6.60 and 6.85 s. The render is quicker on the branch.

## The suites run

- `pnpm test verify steam gain harness site capture-converter`: every suite passed (`steam` under the lock).
- `flock /tmp/tf2ve-heavy.lock pnpm test`: every suite passed, in 1,261 s.
- `CHROMIUM_EXECUTABLE=... flock ... pnpm test:browser`: passed, in 478 s.
- `grep -rn captureEq` finds the word only in `docs/reports/`, `docs/work-orders/`, `docs/PROGRESS-LOG.md`,
  `docs/PROGRESS.json` and the record.

## CI

The run on the head of the recorded hashes, `86aaee4`: `verify` success, with `units`, `engine`, `render`, `stages`
and `browser` all successful. The runs before it failed on the recorded hashes only (`render-channel`'s three, the
stream suite's, and `stages`, which stopped at the new cases' missing hashes), as the order foresaw. The commit of this
report changes `docs/` alone and starts no run.

## The scan

`git diff origin/main...HEAD` and the commit messages were scanned for recordings, personal details, paths of this
machine, real SteamIDs and model names: none, but the attribution trailers.

## Not done

- `live.js` (the page's live monitor) had a comment that named a capture EQ among what the other profiles' chain
  holds back; there never was one there. Changed in fix round 1, on the coordinator's word.
- `capture-converter.js`'s header still says that a capture stream gets this converter at quality 30 is not read.
  That file is W3-26a's and not this order's to change; finding 28 now reads it twice.
- The orchestrator's private runs (the accuracy suite, Set D's band edge and its sweep through the built module, the
  retiming, the page's real-take check) are not this build's.
- The page was not looked at by eye; the browser suite ran it.

## Fix round 1 (2026-11-21)

The reviewer and the second reader found the code right; the round is words and one test. Same branch, main not
merged in (main is at `5e9d411` now: finding 28 gained "From the device to Steam's 16-bit samples", read from it with
`git show`).

**The standing, after finding 28's new paragraph.** That paragraph reads, each twice, that the wave driver's stream
flags give a capture stream Windows's converter at quality 30, that a two-channel device is folded to its left channel
alone, and that the step to 16 bits is dithered. Every line of this branch that said the quality or the dither was not
read now says: the quality is read twice (finding 28, the wave input road, 2026-11-21) and one take fits it (0.14 dB
rms on Set D, measured once); it is not checked sample for sample (Steam's own `mic_outputfile` take is asked of the
owner); the dither is read twice and not built yet (W3-28). Changed: `constants.js` (the profile's comment),
`README.md` (the bullet on the capture), `docs/VOICE-PATH.md` (the table's standing, the opening line on the left
channel, the bullets "To 24000 Hz" and "16 bits", and the other profiles' capture), `docs/ACCURACY.md` (the list, the
table's row, the stage's bullets), `docs/FINDINGS.md` (what rests on one PC), and this branch's own dated lines in
`tests/REFERENCE_2026.md` (finding 28's built line and its "What the app chose around it", and the line under "What
remains unverified"; they are not merged yet, so they were reworded, not noted). Left as they are, still true: that
Windows converts at equal rates is not read, nor what it does with a pair of rates outside its table limits.

**Sources below 24 kHz.** From a source below 24 kHz the cutoff is 0.96634 of the source's own half rate, so such a
source loses more of its top than through the app's resampler before. The module's `gain()`, and a tone through
`convert()` fitted by least squares, agree to four decimals: from 16,000 Hz −4.14 dB at 7.65 kHz and −8.05 dB at
7.8 kHz, from 22,050 Hz −5.95 dB at 10.65 kHz (computed from the rule as read). Main's two stages, measured the same
way with tones on the model, give −2.25, −3.56 and −2.88 dB; the second reader's −1.9, −2.6 and −2.4 for main did not
come out here, and the documents give the tone measure. One sentence each in `docs/VOICE-PATH.md` ("To 24000 Hz") and
`docs/ACCURACY.md` ("What differs"), with "a file's own rate stands for the device's (chosen)", and the same in the
record's line of what the app chose.

**The gain and the clip.** One clause in `docs/VOICE-PATH.md` ("Microphone level") and `docs/ACCURACY.md` ("What the
app runs"): the capture gain and the clip before the converter are the app's own (chosen), since Windows's pipe has a
volume of 1.0 and no limiter (finding 28, read once), and at gain 1 they act on nothing in a 16-bit source. The Model
table's Capture row, whose cell says "resampled to 24 kHz and clipped", gains in its dated note the order as built
(the gain, the clip, the conversion, the 16 bits); nothing of the cell is rewritten.

**README's fold-back.** "Lets nothing above 12 kHz fold back" now says what the figures say: a 12.5 kHz tone folded
back to 11.5 kHz at −44 dB and a 13 kHz one at about −100 dB, where the app's resampler folded them at −15 and −23 dB
(computed).

**The 16,000 Hz case of test 3.** The reviewer's break, the flush to `floor(n L / M)`, failed the 44,056 Hz,
96,000 Hz, prime-length and 37,800 Hz cases and passed the 16,000 Hz one: its talk is quiet at the end, so the one
output the break leaves out changed nothing after the gate. Its source's last 0.5 s is now a steady voiced sound at
0.3 of full scale. The break was made again in a copy (`TF2_DIR`): the 16,000 Hz case now fails at every plan, 266
samples differing in each, beside the four cases above. Its hashes were recorded again in a commit of their own, after
the stream suite and `stages` passed with them: the WAV, `codecInfo` and gain hashes of that case alone moved, since
its source changed. The head's `--hashes` output (`docs/reports/W3-26b/hashes-branch.txt`, replaced) differs from the
earlier head's in that case's two lines and nowhere else. The 11,025 Hz case (`steam, 88203 samples at 11025 Hz`) also
passes that break, for the same reason; it was not changed.

**`live.js`.** The one comment line now says the other profiles' chain holds back the gate's pre-roll and the codec's
lookahead; nothing else in the file changed.

**Checks run.** `flock ... pnpm test render-stream stages harness site verify`: every suite passed. The words changed
no code; `live.js`'s change is a comment.

**Commits.** `52ff556` the words; `2ee8be1` the 16,000 Hz case's source; `844f86c` its hashes recorded again; then this
section. CI's run on `844f86c` (the head that changes code): `verify` success, with `units`, `engine`, `render`,
`stages` and `browser` all successful. This section's commit changes `docs/` alone and starts no run.
