# W3-02c-3b: the live monitor can run the game's voice queue (the worker, the page, the recorded take)

The builder's report, 2026-11-14, for [W3-02c3-live-channel.md](../work-orders/W3-02c3-live-channel.md), part
W3-02c-3b, with the order's last sections (the rulings, "After the plan review", the ruling on [Browser 3f2] and
"Part a after its review and second read" with its list "For part b") holding over the text above them. Branch
`claude/w3-02c3b-live-page`, from `main` at `61c8834` (cache v48). Nothing of the owner's record was read. Every
figure carries its standing.

## What changes, in one paragraph

A checkbox among the extras, **Live monitor: the game's voice queue**, off on every load, makes the live monitor
ask its chain for the game's timeline on Steam voice with the codec on, at the page's own `fps_max` and
`voice_buffer_ms`, whatever Phrase timing says. Part a's chain then plays the packets through the receiver's voice
channel with BC-4's arrivals and gives a render's samples on the queue. While the queue runs the low-latency box is
disabled and sent as off. The switch's help gives what the queue adds to the monitor's delay at the page's own
frame rate and buffer, and what a listener hears with it on. The jitter note under the panel says jitter does
nothing only while the monitor keeps the file's own timing. A session recorded on the queue is keyed on the game's
timing at the chain's frame rate and buffer, carries the channel's counts over the recording, and says which way it
was made when it is held back from a render by itself. With the switch off the monitor is today's, sample for
sample: the page sends the chain the same options as before.

## What changed, file by file

- `live-worker.js`: `ready` posts the chain's `timeline`, `queueCostMs`, and the `fps` and `bufferMs` it was built
  with. A recording keeps the chains that ran in it, with the channel's counts of the chain in hand at the start;
  its `info` gains the last chain's `timeline` and, on the queue, its `fps`, `bufferMs` and `channel`: the counters
  (`packets`, `opens`, `appended`, `gainResets`, `droppedSamples`) as the difference between the recording's start
  and its stop, summed over every chain on the queue that ran in it; `fps`, `bufferMs`, `waitTicks`, `latency` and
  `codecDelay` as the last chain has them. The probe a test asks for (`roomprobe`) reports the channel's `opens`.
- `live.js`: the switch is unchecked at load. `liveOptions()` sends `timeline: 'game'` with the page's `fps_max` and
  `voice_buffer_ms` (read as `renderOptions()` reads them, the module's defaults where a control is blank) while the
  switch is on, the codec is `steam` and the codec is on, and `lowLatency: false` then; otherwise the file's own
  timing, as before. The low-latency box is disabled while the queue runs, and its title says why. The switch's help
  is written from `TF2VoiceChannel.zero` at the page's frame rate and buffer, with the sender's read reach (4,650
  samples at 24 kHz, from `TF2SteamSender.STEAM_SENDER`) and the codec's lookahead (156 samples at 24 kHz, a constant
  in `live.js`: the chain takes it from the encoder; the browser suite holds the help to the chain's own figure). The
  panel's latency title names the queue's wait while the chain runs the queue. The jitter note reads "Jitter does
  nothing in the live monitor on the file's own timing." with the queue off and adds nothing with it on.
  `TF2Live.queue` gives the chain's `timeline` and `queueCostMs`, for the suite. The stale comments are restated.
- `index.html`: the checkbox `live-queue` with its help in the Extras box beside `live-lowlat`, and Phrase timing's
  help ends "The live monitor keeps the file's own timing unless its own switch for the queue is on."
- `app/render.js`: `mountLiveTake` keys a take on the queue as `{ ...renderOptions(), timeline: 'game', fps, bufferMs }`
  with the chain's numbers, and gives it `codecInfo.channel`, so the line beside Hear shows and the console prints
  the queue's line. A take on the file's own timing is keyed as before. The held line (`LIVE_HELD_TEXT`) has two
  texts, chosen by the way the take was made, shown where Phrase timing says the other. `presentRender`'s comment is
  restated.
- `tests/browser.verify.js`: the checks below; `live-queue` joins `CONTROLS_EXTRAS`, the labelled controls and the
  phone-width check of the live checkboxes; the jitter note's check restated; two comments restated.
- Documents: `docs/LIVE.md` (the `steam` row, what differs from the game, the recorded session, the hold on the
  queue at the three frame rates, low latency on the queue, a section on the switch and what a listener hears,
  settings while it runs, the panel's title, the recording's end), `docs/PAGE.md` (the recorded session, the
  switch among the controls with no console name, Phrase timing, the jitter note), `README.md` (step 3, "Not built
  yet", "Live monitor"), `docs/ACCURACY.md` (the receiver's queue, jitter, what the app runs, "Not built yet" with a
  correction mark, the live monitor) and `docs/VOICE-PATH.md`.

No engine file moved: `git diff origin/main...HEAD --stat -- engine audio.js constants.js voice-channel.js` prints
nothing. `sw.js` is not touched: no file the site loads was added, removed or renamed.

## The figures

| Figure | 66.67 fps | 100 fps | 300 fps | Standing |
| --- | ---: | ---: | ---: | --- |
| What the queue adds to the chain's hold (the help's figure, and the chain's `queueCostMs`) | 101.6 ms | 148.0 ms | 357.0 ms | read: from `zero()` and the read reach and lookahead |
| The chain's `stats.latencyMs` at a 48 kHz device, switch on | 308.5 ms | 354.9 ms | 563.9 ms | read (part a's report); 308.5 and 563.9 also seen on this build at 48 kHz |
| The chain's `stats.latencyMs` at a 48 kHz device, switch off | 206.9 ms | 206.9 ms | 206.9 ms | read |

The panel at 48 kHz, in the headless browser with the browser suite's noise probe as the microphone, the
AudioContext forced to 48 kHz by a scratch script outside the repository; 40 readings over 20 s after 3 s of
settling (measured on this build):

| Setting | The panel's latency, median (least to most) | Dropouts in the 20 s |
| --- | --- | ---: |
| switch off, `fps_max` 300 | 293 ms (284 to 307) | 0 |
| switch on, `fps_max` 300 | 660 ms (647 to 668) | 0 |
| switch on, `fps_max` 67 (7 ticks, as 66.67) | 405 ms (391 to 413) | 0 |
| switch off, `fps_max` 67 | 304 ms (291 to 312) | 0 |

The panel's dropouts did not rise with the switch on in a steady run (the order's stop-and-ask): a rebuilt chain
plays nothing until its hold has passed, so the playback queue runs dry once at each rebuild, on the queue as on the
file's own timing. In the browser suite at 44.1 kHz the panel read 659 ms with the switch on at 300 frames a second
and 3 dropouts, all from the rebuilds the check had just made.

## The checks

`tests/browser.verify.js` (each fails under its break, below):

| Section | What it shows |
| --- | --- |
| [Browser 8] | the switch is off on a fresh load and after a reload made with it on; checking it changes neither `collectConfig()` (the remembered settings and the share link are made from it) nor the stored settings; the hash names no queue; `idToCvarMap` has no entry for it |
| [Browser 2], [Browser 3c4], the phone widths | `live-queue` has a label, sits in "Extras: not in the game" and shows no variable's name; its checkbox and label row are big enough at phone widths |
| [Browser 3f] | off before it is touched, the chain on the file's own timing. Checked on Steam voice with low latency ticked: the options sent hold `timeline: 'game'`, `fps` 300, `bufferMs` 100 and `lowLatency: false`; the low-latency box is disabled; the chain's `latencyMs` rises by its `queueCostMs` within 1e-6 ms, and the panel shows between that and 400 ms more; the help holds the chain's cost and what a listener hears; the panel's title names the wait (30 ticks, 435 ms); `TF2Live.stats.channel.opens` above 0 |
| | Phrase timing on the file's own timing: nothing is sent to the chain and it still runs the queue |
| | `fps_max` 67 with the switch on: a new chain, at 67 frames a second, and the help holds its cost (101.61 ms), which differs from the cost at 300; with the switch off at `fps_max` 67 the help gives the cost at 67 while the chain (made with no `fps`) reports 357.03 ms, and low latency is live again |
| | the switch checked on `celt_22`, `steam_48` and `miles` (neither in TF2): the chain is made on the file's own timing, the monitor runs, no error shows, low latency is sent as ticked and not disabled; the same with the codec skipped on Steam voice |
| | a session recorded with the switch on and Phrase timing on the queue: not silent; its key holds `timeline: 'game'`, `fps` 300 and `bufferMs` 100; its channel's `packets` are above 0 and no more than the chain's count rose over the recording; not marked, no render started in 1.5 s, the line beside Hear shown, the console's queue line printed. With Phrase timing on the file's own timing a second take is held: marked, no render started, its line "on the game's voice queue; Render gives it on the file's own timing". Phrase timing back on the queue: the take is the controls' render, nothing marked or started |
| | the jitter note (restated): with the switch off on Steam voice at jitter 50 the note adds "Jitter does nothing in the live monitor on the file's own timing."; not on `celt_22`, at jitter 0 or once stopped; with the switch on the note says nothing of jitter and `TF2Live.stats.arrivals` is there with `jitterMs` 50 |
| [Browser 3f2] | the queue's case (`timeline: 'game'`, 300 frames a second, `voice_buffer_ms` 100, the same room changes): the worker's output is the mix made again from its voice alone, one chain throughout; `spurtStart` is called once for each open of the channel (2 opens for the sender's 4 spurts on the run), not at each spurt |

The checks of [Browser 3f] that were there before pass unchanged with the switch off, the restated note's check
aside: the latency, low latency, push-to-talk, the take on the file's own timing against an offline render, its
held line on the queue's Phrase timing, the monitor sending nothing for `fps_max`, `voice_buffer_ms` or Phrase
timing, and the takes on `steam_48`, `speex` and `miles`.

## The breaks

Each break was made in the worktree, the browser suite's live sections run alone from a scratch copy of the suite
(the sections `verifyLiveMonitor`, `verifyLiveRoom` or `verifyJourney` called after [Browser 2]), and the file put
back with `git checkout`. The order's table, then the builder's own.

| Break | The check that failed |
| --- | --- |
| the box remembered across a reload (kept in `localStorage` and restored) | [Browser 8]: off after a reload (`second.was` true) |
| `liveOptions()` reads Phrase timing | Phrase timing on the file's own timing: one config sent and the chain on the file's own timing |
| `liveOptions()` sends `'game'` on another codec | the other codecs: on `celt_22` the chain refused `'game'` and the monitor stopped with its error |
| the low-latency box stays live (not disabled) | the options and the low-latency box: `disabled` false |
| low latency sent as ticked on the queue | the same check: the chain refused `lowLatency` on `'game'`, the monitor stopped with its error |
| the help's figure a constant (the cost at 300 and 100) | the help at `fps_max` 67 does not hold the new chain's 101.61 ms |
| the jitter note unchanged (the queue not read) | with the switch on the note still says jitter does nothing |
| the jitter note's text unchanged ("... yet.") | the note's check with the switch off |
| the take's key keeps the file's own timing | the session recorded on the queue (its key, and it is marked) |
| the held take's text unchanged | the held take's line ("on the file's own timing; Render gives it on the game's voice queue") |
| a take's counts not differenced (builder's) | the session recorded on the queue: 104 packets where the chain's count rose 66 |
| the worker's probe reports the sender's spurts as opens (builder's) | [Browser 3f2]'s queue case |

A probe, not a break: with the line that unchecks the switch at load left out, the switch is still off after a
reload in this Chromium (the checkbox also has `autocomplete="off"`). The line stays, so a browser that restores a
form's state on reload does not turn the queue on.

## Done means

Heavy runs inside `flock /tmp/tf2ve-heavy.lock`.

1. The browser suite, `CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1)
   flock /tmp/tf2ve-heavy.lock pnpm test:browser` on `f2d4ca2`: `544 browser checks passed`, `== browser: passed, 429.6 s`.
   The first whole run, on `fc83adc`, stopped at [Browser 3c5] (below, "Breaks the suite caught").
2. `flock /tmp/tf2ve-heavy.lock pnpm test` on `fc83adc` (only `live.js`'s help text changed after it, which no suite but
   the browser's reads): `27 of 27 suites passed. 1029.5 s summed`.
   `node tests/cache-number.mjs origin/main --report`: "cached files changed since origin/main (fe19237):
   app/render.js, index.html, live-worker.js, live.js" and "cache number against origin/main (fe19237): the number
   is v48, not above v48: it must rise (node tests/cache-number.mjs origin/main --set)". The builder did not set it.
3. `git diff origin/main...HEAD --stat` (after merging `main` at `fe19237`): `README.md`, `app/render.js`, `docs/ACCURACY.md`, `docs/LIVE.md`,
   `docs/PAGE.md`, `docs/VOICE-PATH.md`, `index.html`, `live-worker.js`, `live.js`, `tests/browser.verify.js` and
   this report: every one in "May touch". `app/core.js` was not needed: the switch is in no list of the page's.
4. This report.

CI (`tests`) on `f2d4ca2`, the last commit that changes code or tests: run 43552369388, `verify` success, with
`units`, `engine`, `render`, `stages` and `browser` each success. The run on `b3f3748` failed in `browser` at
[Browser 3c5]'s audit of Phrase timing's words, fixed in `f2d4ca2`. After it come the merge of `main` (W3-02g's
progress line, `docs/` only) and this report, which change only `docs/` and start no run.

## Breaks the suite caught in this build

- [Browser 3c5] holds every help sentence to at most about 110 characters (115): the switch's first help ran its
  measured figures together in sentences of up to about 200. It is now ten short sentences.
- [Browser 3c5]'s audit of the settings' words holds Phrase timing's help word for word. The order changes its last
  sentence ("The live monitor keeps the file's own timing unless its own switch for the queue is on."), so the
  audit's copy of that sentence is restated with it; nothing else of the audit changed.
- The first take check asked for half a second of samples above 0.01; one take of the probe, with two openings of
  the channel, had 0.48 s. The check now asks for 0.1 s, still far from silence.

## Choices this build made where the order did not say

- **A chain rebuilt during a recording** (the plan review's point 8): the take's counters are summed over every
  chain on the queue that ran in the recording, each from its count at the recording's start (0 for a chain built
  later) to its last block; the frame rate, the buffer, the wait, the latency and the codec's delay are the last
  chain's. The take's sound has a gap at each rebuild, as on the file's own timing, since a new chain holds back its
  whole hold before it plays.
- **A take carries no `arrivals`** (point 8): the chain counts its arrival model over its whole run, and its mean
  and largest delay cannot be taken as a difference over the recording. So a take on the queue prints the queue's
  console line and no jitter line.
- **The held line** is the take's own text only where Phrase timing says the other way; where a take on the queue
  is marked for another reason (the page's frame rate differs from the chain's, which a change within the page's
  0.3 s poll can give), the line is the ordinary "These settings are not rendered yet." text.
- **The help's text** names both measured ends of what a listener hears (300 frames a second and above, and 66.67)
  whatever the page's frame rate, rather than choosing one by a threshold the measurements do not give.
- **The codec's lookahead** in the help is a constant in `live.js` (156 samples, read), since the page has no
  encoder before the monitor runs; the check that the help holds the chain's own figure at 300 and at 67 frames a
  second guards it.

## Not done, or not checked

- A live session in a browser starts in mid-stream and is not compared with a render sample for sample. The
  monitor's sound on the queue is held to `createRender` by part a's section 10 of
  `tests/render-channel.verify.mjs`, not by the browser suite.
- The panel's figures at 48 kHz were measured with the AudioContext forced to 48 kHz in the headless browser, not
  on a sound device; the browser suite runs at 44.1 kHz.
- The figures of what a listener hears (the openings, the pauses, long unbroken sound, the frame counts' offset and
  stall) are the second read's, measured on the model; this build did not measure them again.
- The frame rate of 100 was not run in the browser; its figures are read.
- The diff and the commit messages were scanned for recordings, personal details, SteamIDs and model names: none,
  but the commits' attribution lines.

## The fix round (2026-11-14)

From the order's section "Part b after its review (2026-11-14, the orchestrator)". `main` was merged first
(`5ff4d39`, the order's fix list; documents only).

1. **The console's `voice_timeline` help** (`app/console.js`, the sentence and its comment only) now ends "The live
   monitor keeps the file's own timing unless its own switch for the queue is on.", as Phrase timing's help does.
   [Browser 3c5] holds the console help to the page's sentence.
2. **A take's channel counts.** The take on the queue holds each of `packets`, `opens` and `droppedSamples` between
   0 and what the chain's count rose by over the recording (on the run: the take's 39, 1 and 5,672 against the
   chain's rises of 65, 1 and 5,672; measured). A new recording changes `voice_buffer_ms` from 100 to 150 midway, so a
   second chain takes over: the take's packets are the sum of the two chains' rises, read from the stats the page was
   sent, within 15% or 8 packets (on the run 69 against 38 and 31), and its `voice_buffer_ms` and key are 150.
3. **The switch's help with low latency ticked.** "With this off" is then the low-latency chain, which holds back
   80.0 ms less (read: the pre-roll less a frame and a sample at 24 kHz, the chain's `lowLatencySavingMs`). The help
   adds that saving to its step (437 ms at 300 frames a second, 182 at 67) and says so in a sentence of its own; with
   low latency unticked it gives the queue's cost alone. The checks: with low latency ticked the help holds the
   chain's `queueCostMs` plus the saving the suite measured, at 300 and at 67; with the switch off at 67 it holds 182
   ticked and 102 unticked. `docs/LIVE.md`'s column names the step from both live switches off and gives the steps
   with low latency ticked (181.7, 228.1 and 437.1 ms, read).
4. **`docs/LIVE.md`'s panel figures** say they were measured with the browser's audio forced to 48 kHz in a
   headless browser, not on a sound device.

| Break | The check that failed |
| --- | --- |
| `CHANNEL_COUNTERS` cut to `['packets']` (the reviewer's) | the session recorded on the queue: the take's `opens` 2 and `droppedSamples` 9,620, the chain's whole run, against rises of 1 and 5,135 |
| only the last chain counted (the reviewer's) | the recording across a change of `voice_buffer_ms`: 33 packets against 38 and 33 |
| the help's step leaves out low latency's saving (builder's) | the switch's help with low latency ticked |
| the console help keeps "always keeps" (builder's) | [Browser 3c5]'s console sentence |

Checks after the fix round: the browser suite, `CHROMIUM_EXECUTABLE=… flock /tmp/tf2ve-heavy.lock pnpm test:browser`
on `2e57ca5`: `546 browser checks passed`, `== browser: passed, 436.0 s`. `pnpm test` was not run again: the round
changed only page files (`app/console.js`, `live.js`), the browser suite and `docs/LIVE.md`, which no other suite
reads. `git diff origin/main...HEAD --stat` gains `app/console.js`, allowed for that sentence by the fix list.
