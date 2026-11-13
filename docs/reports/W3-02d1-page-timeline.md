# W3-02d-1: the page renders on the game's timeline

The builder's report. The order is `docs/work-orders/W3-02d-page-timeline.md`. Branch
`claude/w3-02d1-page-timeline`, from `main` at `584466e`, with `main` at `f855dd2` (documents only) merged in.

**Status:** built. Every check of "Done means" ran and passed (below); each of the order's fourteen breaks was made,
its named check was seen to fail, and the break was taken back.

## What changed

| File | Change |
| --- | --- |
| `index.html` | **Listener's frame rate** (`fps`, `fps_max` on its label, 10 to 1000, 300) and **Voice buffer ms** (`buffer_ms`, `voice_buffer_ms` on its label, 1 to 5000, 100) in the Receiver box after Voice scale; **Phrase timing** (`timeline`: "The game's voice queue", "The file's own timing") in the Extras box in the place of Talk-spurt timing, with a hidden line under it (`timeline-note`); the line beside Hear (`hear-timeline`), hidden |
| `style.css` | one rule, for the line beside Hear (its size and colour). The note under the control uses the existing `control-help` |
| `app/core.js` | `els.timeline`, `els.timelineNote`, `els.fps`, `els.bufferMs`, `els.hearTimeline` in the place of `els.retime`; `state.sourceFromVideo`; `PRESET_SET_FIELDS` loses `retime` and gains `tl` and `buf`; `KEPT_ACROSS_PRESETS` gains `fps` |
| `app/console.js` | the linked variables `voice_timeline`, `fps_max`, `voice_buffer_ms` (a whole number, `wholeBufferMs`); `voice_retime` kept as an old name (1 sets `voice_timeline game`, 0 sets `source`, and it prints that the flat rule is no longer offered and `voice_timeline` took its place); `CONFIG_FIELDS` loses `retime` and gains `tl`, `fps`, `buf`; `migrateTimelineConfig`, called after `migrateRoomConfig` in `applyConfig` (a saved `retime` of 1 becomes `tl=game` where no `tl` is given; a saved `retime` of 0 is dropped); a preset runs `voice_timeline game` and `voice_buffer_ms 100` where it ran `voice_retime 0`, and does not touch `fps_max`; the three controls are hidden for another codec than `steam`, as the sender's Steam age is; `sourceTimingReason` and `updateTimelineNote` (the line under Phrase timing); the chain strip's Receiver cell says "queue at N fps" or "the file's own timing" on `steam` and no longer "spurts re-timed" |
| `app/render.js` | `renderOptions()` sends `timeline` (`'game'` for `steam` with the codec on and Phrase timing on the queue, `'source'` otherwise) and `fps` and `bufferMs` only with `'game'`, and no `retime`; `sourceRenderOptions(demo)` puts the file's own timing on a demo's voice and a source from a video file, used by `settingsKey()` and `runRender`; the console line after a render on the game's timeline; a recorded live take's key is the page's on the file's own timing, and `presentRender` holds the take back from a render by itself as a cancelled render is held (`cancelledKey`); while it is held, its status line adds "on the file's own timing; Render gives it on the game's voice queue"; `updateHearTimeline` shows the line beside Hear from `state.lastCodecInfo.channel` |
| `app/source.js` | the video flag's path only: `loadSourceFile` passes `{ video }` (`isVideoFile`) to `loadSourceFromArrayBuffer`, which passes it to `mountSource`, which sets `state.sourceFromVideo` before `renderNewSource()`; `mountSource` also hides the line beside Hear with the old render |
| `live.js` | `liveOptions()` only: `timeline: 'source'`, no `fps` or `bufferMs` |
| `tests/browser.verify.js` | the new section [Browser 8c]; new checks in [Browser 3f] (the live take, the monitor); the lists of controls, the words, the kept list and the preset check changed with the controls; the live comparison and three pitch checks of a half-second tone render on the file's own timing, each saying why; `freshHash` uses `sourceRenderOptions` |
| `tests/stages.verify.mjs` | `RENDER_OPTION_NAMES` and `PAGE_DEFAULTS` gain `timeline`, `fps`, `bufferMs` (`'game'`, 300, 100) and lose `retime`, which joins the engine's own names with a case of its own; `SOURCE_BASE`; the bases of sections 2, 3 and 4 as the order lists them |
| `tests/accuracy.mjs` | the four lines (`:100`, `:135`, `:167`, `:411`): `timeline: 'source'`, `fps` and `bufferMs` undefined, before `...settings` |
| `README.md`, `docs/PAGE.md`, `docs/ACCURACY.md`, `docs/VOICE-PATH.md`, `docs/LIVE.md` | part 6 of the order (below) |

`batch.js` needed no line: the batch takes `renderOptions()` as it is, and a video in it renders with the page's
Phrase timing. `constants.js`, `sw.js` and everything under `engine/` are unchanged.

## Judgment calls the order left to the builder

- **The help sentences** are the order's quoted candidates, word for word, for all three controls. The console's
  helps hold each control's first sentence, then the rest of its facts and the variable's range.
- **The line under the control** reads "This render keeps the file's own timing: " and one of the order's three
  reasons ("the codec is skipped", "a demo's voice", "a video keeps its picture's timing"). It is named in the
  control's `aria-describedby` only while shown, as the codec's note is.
- **The line beside Hear** reads: "On the game's voice queue, Rendered and Original do not stay in step: a phrase
  can start early, by up to about the wait. At 300 frames a second the render also gains about 0.4 ms every second."
- **The held live take's line**: "Recorded live · N s of sound at R Hz · codec · on the file's own timing; Render
  gives it on the game's voice queue". `liveStatus` itself is unchanged, so a take on another codec still ends with
  its codec's name, as the speex and miles checks want.
- **The console line** after a render on the game's timeline: "S_Voice: the game's voice queue at fps_max 300,
  voice_buffer_ms 100: a new phrase waits 30 ticks (435 ms); N phrases opened the channel, M joined a running one;
  K ms dropped to overflow". The milliseconds of the wait are (ticks − 1) × 15 ms, the tick being the packet's own
  first (voice-channel.js).
- **The line under the control is updated at each render's start too** (`runRender`): a demo's packets are put in
  place after its source is mounted, and the codec change that follows dispatches a `change` that does not bubble,
  so no settings event reaches the line before the render.
- **Three pitch checks of a half-second tone** (`checkRenderedTone` in [Browser 3] and [Browser 5], the rate loop of
  [Browser 7]) failed on the new default. The pitch did not move: on the game's queue a tone that opens the channel
  has short pieces cut out of its first seconds, inside the checks' window, and a count of zero crossings takes a
  broken cycle for a change of pitch (the second read measured 440.17 to 440.18 Hz between the cuts, the clock's
  0.04%). Each of the three now renders with `voice_timeline source` first and says why; a check on the default,
  [Browser 8c], measures the pitch by the median length of a cycle, which a cut does not move, and holds it to
  440 Hz within 1 Hz. *Corrected in the fix round (2026-11-13): this sentence first said the pitch moved.*
- **Section 4 of `tests/stages.verify.mjs`** had a case `{ timeline: 'game' }`, now the page's default; it became
  `{ timeline: 'source', fps: undefined, bufferMs: undefined }`, so `steam` on the file's own timing stays covered.
  On the `celt_22` base, section 2 changes no timeline (the engine refuses `'game'` there).

## The page's sentences that carry a figure

| Sentence | Figure, standing, and where it comes from |
| --- | --- |
| `fps` help: "A new phrase waits before it plays, longer at a higher rate: about 0.09 s at 67 and 0.44 s at 300." | about 90 ms at 67, 435 ms at 300; read, the game's logs agree (finding 23); the table's row "The wait before a new phrase plays" |
| `fps` help: "The game's fps_max caps the rate; 300 is its default." | the order's quoted sentence; 300 read (voice-channel.js, W3-03) |
| `fps` help: "At 200 or less, sound that never pauses for minutes thins out; at 67 the level first dips after about 2 minutes." "That is the game's rule as read, run on the model; no recording shows it." | measured on the model, rules read, no take; the rows "Unbroken sound at 66.67" (median 2.2 minutes) and "The same at 100, 144 and 200" |
| `buffer_ms` help: "The game's default is 100." | read (voice-channel.js) |
| `timeline` help: "It can come early by up to about the wait, and the sound runs 0.04% fast." | the bound is read (the order's paragraph after the candidates); 0.04% measured on the model, the takes' +400 parts in a million measured; the row "The render's clock" |
| the line beside Hear: "At 300 frames a second the render also gains about 0.4 ms every second." | measured on the model; the row "The render's clock" |
| the console helps of `fps_max` and `voice_buffer_ms`: the same figures, and the ranges 10 to 1000 and 1 to 5000 | the ranges read (voice-channel.js:52-57) |
| the console line: "waits 30 ticks (435 ms)" | made from the render's own `codecInfo.channel` |

## The documents

| File | Change |
| --- | --- |
| `README.md` | step 2: a preset leaves four settings of the PCs, the frame rate among them; step 3: the render on the game's voice queue, Phrase timing, what keeps the file's own timing, the new names in the receiver's list, "talk-spurt timing" gone from what stops the first seconds; "What is not exact": the order's seven items, phrase timing first, then `miles` (never in TF2) as before; "Where the modern preset stands": the fade is in the page's render, the flat rule is gone from the fitted list, the live monitor's channel is W3-02c-3 (not built yet); the files table's `voice-channel.js` |
| `docs/ACCURACY.md` | every "the page does not offer it" (`:15`, `:24`, `:46`, `:98`, `:192`) now says the page's render runs the queue by default; the flat rule's row says the page no longer offers it; "What is not exact" gains the frame rate, the start and the end, long unbroken sound, the render's clock, loss on the game's timeline, and the codec lane and real-take panel (W3-02e, not built yet); the accuracy table's rows say they are on the file's own timing |
| `docs/VOICE-PATH.md` | the stage table's row 7; the gain's reset; section 7 rewritten: what the queue does in the page's render, its figures with their standing, and the flat rule no longer offered |
| `docs/LIVE.md` | the monitor keeps the file's own timing while the page's render runs the queue (W3-02c-3, not built yet); a recorded session is held back; the steam row now names `tests/steam.verify.js` for section 10b; the smoke test renders on the file's own timing |
| `docs/PAGE.md` | the three controls under "Settings"; the new names in "What a render runs again" (the rule itself unchanged) and "talk-spurt timing off" gone from the first seconds' list; the queue's console line, the line beside Hear and the held live take under "Rendering"; a demo and a video keep the file's own timing; the batch; the console's variables; the not-exact list is pointed to |

`docs/FINDINGS.md` has no sentence that says the page does not run the queue; it is unchanged. The sentences
`tests/miles.verify.mjs` reads word for word in `README.md`, `docs/VOICE-PATH.md` and `docs/PAGE.md` stand as they
were (the suite passes).

## Done means

1. `CHROMIUM_EXECUTABLE=… flock /tmp/tf2ve-heavy.lock node tests/run.mjs browser`, on the final tree (after the
   merge of `main`): the suite passed. The new checks are in [Browser 8c] and [Browser 3f].
2. `node tests/run.mjs stages` (in `pnpm test`, final tree): the suite passed; the browser check that holds `RENDER_OPTION_NAMES` to the page's passes ("tests/stages.verify.mjs
   changes every option the page sends, and no other").
3. `flock /tmp/tf2ve-heavy.lock pnpm test`, final tree: every suite passed.
   `git diff origin/main --stat -- tests/` shows `tests/README.md`, `tests/REFERENCE_2026.md`, `tests/accuracy.mjs`,
   `tests/browser.verify.js` and `tests/stages.verify.mjs` only (the first two allowed by the fix round). `git diff origin/main --stat -- engine audio.js audio-worker.js live-worker.js
   voice-channel.js steam-sender.js constants.js` prints nothing.
4. `node tests/cache-number.mjs origin/main --report`: "cached files changed since origin/main (f855dd2):
   app/console.js, app/core.js, app/render.js, app/source.js, index.html, live.js, style.css" and "cache number
   against origin/main (f855dd2): the number is v41, not above v41: it must rise". The builder did not set it.
5. `git diff origin/main --stat` shows only files the order allows (the table above and this report).
6. This report.

## The breaks

Each was made in the code, the named checks were run ([Browser 8c] and [Browser 3f] of the browser suite, through a
temporary harness that ran only those and was deleted before commit), seen to fail, and the break taken back. The
harness passed with no break first.

| Break | The check that failed |
| --- | --- |
| `renderOptions()` sends `'game'` whatever the codec | each built-in preset renders without an error (legacy: the render fails, its settings unrendered) |
| `renderOptions()` sends 300 and 100 whatever the controls say | the render at `fps_max 67` and `voice_buffer_ms 200` (its channel said 300 and 100) |
| with Phrase timing on `source` the page still sends `'game'` | the render with `voice_timeline source` is `main`'s |
| `fps` is sent under `'source'` | under the file's own timing a changed frame rate changes no key (1 render started) |
| the demo's override is left out | a demo renders with `'source'` and does not throw (the engine's RangeError) |
| the video flag is set after the load returns | `vp9_opus.mp4`: exactly one render follows the load (2 started) |
| the flag is set only for a video the page can write back | `tone_16000.webm`: the same (no reason under the control, a channel) |
| a saved `retime` of 0 is read as `tl=source` | a remembered `retime` of 0 leaves `game` |
| the migration of `retime=1` is left out | with `voice_timeline source` set first, a link with `retime=1` gives `game` |
| a preset sets `fps_max` to 300 | the preset check (fps_max not left at 67) |
| the line beside Hear follows the controls | on a 61 s source a changed Phrase timing leaves the line as it was |
| the live take keeps the page's key | the monitor's take: its key holds `timeline: 'source'`; and the 90 s take's check |
| the live take is not held back | the monitor's take: no render starts by itself (1 started) |
| `liveOptions()` passes the page's timeline on | a changed `fps_max` does not restart the monitor (a config was posted) |

A first round showed that three breaks (the first three) stopped on a wait rather than on their check, that the
`fps` break was caught first by another check, and that the line-beside-Hear break was caught first by the video
check. The checks were changed so that each break fails its own check (the second commit), and those five breaks
were made again: each then failed the check named above. The break of the line beside Hear was made as the line
following the controls on every change of the settings.

## Uncertain or not done

- The real-take panel compares levels over the whole overlap (`app/realtake.js:183-205`); a shift under half a
  second should not make it false. That is inferred from the code and was not measured. The codec lane draws a
  frame where the source has it, so on the game's queue it can sit up to about the wait from where the phrase plays:
  shifted, not false. Both are named in the not-exact list (W3-02e, not built yet).
- A live take of 90 s is checked with a take made by `mountLiveTake` from synthetic arrays, not recorded through the
  monitor; the monitor's own take (a few seconds) is checked in [Browser 3f]. Holding a take back follows the rule a
  cancelled render follows and needed nothing more.
- The browser suite on `main` was not run as a baseline here: its first run read files this branch was editing at
  the time and is not a baseline.
- **A note for `tests/predictions/PREDICTIONS.md`**, for the orchestrator to add if it wants one: "Changed after
  registration, 2026-11-13: no hashed model file changed for W3-02d-1. The page's `renderOptions()`
  (`app/render.js`, not a hashed model file), from which `tests/accuracy.mjs` builds every prediction's options,
  now sends `timeline` `'game'` with `fps` and `bufferMs` on Steam voice and no longer sends `retime`.
  `tests/accuracy.mjs` sets `timeline` `'source'` and leaves `fps` and `bufferMs` out in its four renders, so every
  prediction renders as registered, and the note above that no prediction asks for `'game'` stays true. The
  predictions are scored as registered."

## The order's line numbers

Checked against this branch's `main` (`584466e`): every number the order gives for `app/`, `index.html`, `live.js`,
`batch.js`, `engine/`, `voice-channel.js`, `live-worker.js` and the suites it names held. `presentRender` runs
436-531 (the order says 436-528, which holds the lines it cites).

## The fix round (2026-11-13)

The order's section "After the review and the second read", its twelve points. Each new check was seen to fail on
its break (run through a temporary harness of [Browser 8c] and [Browser 3f], deleted after; point 11 against the
whole browser suite), and each break was taken back.

| Point | What was done | The check, and its break |
| --- | --- | --- |
| 1. The batch's key | `batch.js` keys its rows and its run by `batchKey()`, the controls' settings alone (`JSON.stringify(renderOptions())`), not `settingsKey()` | with a video as the page's source, two audio files in the batch end "Done"; with `main`'s code (rows by `settingsKey()`, the run by `renderOptions()`) both rows read "Rendered with older settings" |
| 2. An audio-only MP4 or MOV | the flag is false where `TF2Video.inspect` read the file whole (no note) and found no video track; a WebM or an unreadable file keeps it | `tone_22050.m4a` under an `.mp4` name renders on the game's queue with no reason line; with the flag set for every video file it rendered on `source` |
| 3. The first seconds on the page | the help under Phrase timing gains "At 300 frames a second a sound that opens the queue loses short pieces in its first seconds." (92 characters; also in `voice_timeline`'s console help); the README's and ACCURACY's entry "The start and the end" give the second read's figures (measured on the model) and the record's side (measured, Set G's logs, finding 23); PAGE.md points there | the words check holds the new help |
| 4. Two wrong sentences | "11 ms at 300 in about one seed in a hundred" is now the W3-02c-2 report's 0 to 16.5 ms in seeds 1 to 10 and 11.4 ms in the worst case it rendered, with the page's own draw losing the first 12 ms; "no dip and no gap" is now "no fade and no underrun in 26 seeds", with the cuts of the first seconds | words only |
| 5. The accuracy table's row | the row says 57% is the mean over 30 seeds and that the page shows one fixed draw | words only |
| 6. The line beside Hear | two sentences, of 113 and 71 characters | (the words) |
| 7. The codec skipped | the check also reads that the line beside Hear is hidden | with the line following Phrase timing's control at each render, that check failed |
| 8. The pitch | the three comments and this report's sentence say that the queue cuts pieces out of the tone and a count of zero crossings reads them as pitch; a check on the default measures a 3 s tone of 440 Hz by the median length of a cycle (440.13 Hz) | with the page's rate of the render set 1% high, it read 444.53 Hz and failed |
| 9. The held live take's download | the label reads "Download WAV (the live take)" while the take is held, "(earlier settings)" otherwise | the monitor's take and the 90 s take; with the old label both failed |
| 10. Words outside the first list | `tests/README.md:71` corrected; `tests/REFERENCE_2026.md` gains a dated correction after each of the two sentences (added lines only) | — |
| 11. The reviewer's break | `updateTimelineNote()` taken out of `updateSignalChain`: a new check fails on it in the whole suite (with no source on the page, `snd_codec 0` shows the line under Phrase timing and `snd_codec 1` hides it, with no render) | that check |
| 12. No counts | this report gives no count of checks or suites | — |

The engine's diff stays empty. The status line of an audio-only MP4 still says "the video's audio only (only MP4
and MOV can take the render back)", as before this order; that sentence is not this order's.
