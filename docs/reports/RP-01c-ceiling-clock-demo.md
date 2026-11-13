# RP-01c: the checks `ceiling`, `clock` and `demo`, their sections of the page, the steps-only entries

The builder's report. The order is `docs/work-orders/RP-01-reproduce-it.md`, part c (sections 3, 4, 5, 9, 14 and
15). Branch `claude/rp-01c-ceiling-clock-demo`, from `main` at `aae2a36`; `main` merged in at `35b3672`, with
W3-21 at `d1b72d7`, and with W3-22 at `0b8e91d` for the fix round.

**Status:** built, and fixed after the review and the orchestrator's private run ("The review" and "The
rulings after the private run", at the end). Every done-means of part c passes on this machine; CI is in "Runs". No private file was opened:
no step needed one.

## What was built

| File | What |
| --- | --- |
| `tests/reproduce/ceiling.mjs` | `ceiling <recording> --volume <v>`: the largest and the smallest sample against plus and minus round(32767 × `volume`), each within one step, none beyond, and at least 100 samples exactly on the largest (the ruling after the private run; the first build checked the voice's flat tops at 32639 × `volume`, which a recording on a map does not show) |
| `tests/reproduce/clock.mjs` | `clock <recording> <source> [--packets <a second>]`: the source rendered with the `steam` profile at its defaults at the recording's rate (`TF2Audio.process`, loaded through `tests/lib/engine.cjs`), the recording lined up with `TF2Reference.track` as the accuracy suite does, against the render and its frame log, with Steam's gate figures from `CODEC_PROFILES.steam`; the clock rounded to whole parts in a million |
| `tests/reproduce/demo.mjs` | `demo <demo>`: `TF2Demo.parse` (`demo.js`); per frame the TOC byte (configuration 13, one channel, one frame), per message the sample-rate records (read as `demo.js` reads the payload, with its `crc32`), per phrase the number after each end marker. Counts only |
| `tests/reproduce/common.mjs` | `readOutputWav`: a recording as a recorder saves it (16-, 24- or 32-bit integer, 32- or 64-bit float, extensible format, any channels; the first channel, in 16-bit steps; any other chunk, `LIST` and `bext` among them, skipped unread); `describeOutput`; `readBytes` exported |
| `tests/reproduce.mjs` | the three checks in the list in place of their "not built yet" entries |
| `tests/reproduce.verify.mjs` | sections [8] `ceiling`, [9] `clock`, [10] `demo`; [1] names the seven built checks; [6]'s load list names `reference.js` and `demo.js`; the head comment's table of what each stand-in shows |
| `docs/REPRODUCE.md` | "With a recorder of the PC's output", `ceiling`, `clock`, "With a server", `demo`, "Steps only (no script yet)" with the rooms, the network and the codec as heard; "When a result differs" names the group-2 causes; the three rows leave "Not built yet" |
| `README.md`, `tests/README.md` | the sentence on the built checks; the suite's row and time |

Nothing under `engine/`, no file the site loads (`reference.js`, `demo.js` and `tests/lib/engine.cjs` are loaded,
not changed), no codec module, not `sw.js`, `CLAUDE.md`, PROGRESS or the record. No recorded hash moved.

## The checks, as they run

Each ends as part a's do: `<check>: as expected` (exit 0), `differs: <reason>` (1), `cannot check` (2).

- **`ceiling`.** Floors: no sound; fewer than 100 samples exactly on the largest (a choice of this check). A largest
  sample over the ceiling gets a reason that names something after the game raising the level; one under it, a sum
  that never reached the clip, a wrong `--volume` or a system volume under 100%. `--volume` is required (0.01 to 1)
  and taken in single precision, as the engine takes it. The script prints the count on the largest and on the
  smallest, and the volume the largest gives.
- **`clock`.** Floors: no sound in either file; a recording under 4 s; `track()` failing to place the source (its
  own errors, put in the script's words); `track()` falling back to the coarse placement's clock, which happens when
  its windows span too little time (the segment's `b` equals `1 / coarse.scale`); fewer than 20 one-second windows
  lined up (a choice of this check). Without `--packets` the pass range is +386 to +427; with it, P / 44100 from 17
  under to 24 over (both the record's figures widened by 11, the ruling after the private run).
- **`demo`.** Floors: not a demo; no voice; a codec other than Steam voice named by the server; no Steam voice
  frame; no phrase after an end marker. The codec's name is printed only when it is one of the five the game knows.
  Nothing of the header, of the server info or of a string table, no SteamID, no speaker's place in the file is
  printed; speakers are counted.

## The suite `reproduce`

`node tests/reproduce.verify.mjs`: 46 s here, from 10 s (the clock's renders and line-ups are most of it).

| Check | The stand-in | What its pass shows |
| --- | --- | --- |
| `ceiling` | a render's gain output for a 1 kHz tone at 0.3 with pauses (clamped), entered at 255/256 with a 157 Hz hum at 2,000 steps and seeded noise of 600 added before the clip, on `TF2Audio`'s own `mixEntry`, `mixOut` and `createDeviceStage`, at `volume` 0.15 and 0.5, at 48000 Hz | the reading of 24-bit stereo, 16-bit mono, float, tagged and stereo-with-a-silent-second-channel files; the largest and smallest found and the samples on them counted; both pass lines. The voice alone, at 4,896, stays under the ceiling and differs |
| `clock` | 30 s of a speech-like source in phrases of 8 s, rendered with `timeline: 'game'` at 66.67 frames a second (seed 2) against the default render | the render, the line-up and the verdicts: the stand-in reads +404 (+409 before W3-21 was merged in), its own packets a second 17.7 (401 computed). The clock comes from the channel as built, which drops one sample a packet as read, not from the game's output |
| `demo` | a demo written by the suite: three phrases of libopus 1.1.5 frames at Steam's settings (135 frames, 10 of one byte), eight frames in a phrase's first message and three after, numbered from 0, end markers and silence records, a SteamID in universe 0, marker strings in every text field of the header and in a printed line | the reading of frames, rate records and numbers; nothing of the header, the server info, the string table or a SteamID printed |

Why 66.67 frames a second for the clock's stand-in: at 300 the channel's wait overflows the ring at every restart
and the take skips 11 to 25 ms several times in its first half second (finding 23), and on these short synthetic
phrases `track()`'s one clock then read anywhere from 0 to 710 over seeds (measured here on scratch sources). At
66.67 nothing is dropped (finding 23) and the stand-in's source read +408 to +415 over six seeds. The stranger's recordings are the record's
kind (long phrases, 300 frames a second), on which the accuracy suite reads +397 to +416.

The cases, besides each stand-in's pass: `ceiling` with the ceiling two and three steps up and down (4,917,
4,918, 4,913, 4,912), the bottom alone three steps short, one sample three steps over, the voice alone, checked at
the wrong volume, zeros, 99 samples on the ceiling (and 100, which passes), and no `--volume`. `clock` with the take
100 parts in a million faster (+533; with and without `--packets`), judged at 22.3 packets a second, its window line
pinned ("expected +384 to +425" at 17.7 packets a second), zeros, its first 7 s (9 windows) and first 5 s
(`track()`'s fall-back), unrelated noise, and a source of zeros. `demo` with the second phrase numbered from 7, one
frame's TOC made SILK-only, one marked two channels, one with frame-count code 1, one phrase's rate records at 48000,
one phrase's messages with two rate records, no voice, one phrase, `vaudio_celt`, a file that is not a demo, and
`tests/demo/synthetic.dem` (differs: its second phrase after an end marker is numbered 7; none of `Synthetic test`,
`ctf_2fort`, `hello` or its two SteamIDs printed). The marker check of [7] covers every run; [10] also holds that no
`demo` run prints its demos' map, server name or player name, and [8] and [9] that no run prints the title, artist,
description or originator of a tagged recording.

### The suite's tests, broken

Each break was made in the file, the suite run, the file restored (`break.sh` in the scratch folder). The rows for
`ceiling.mjs` and the window are the first build's; that code changed in the fix round, and its breaks then are in
"The review".

| Break | Where | What failed |
| --- | --- | --- |
| the top's tolerance 2.5 steps | `ceiling.mjs` | [8] the two-step case (three steps passed it: that case was added for this) |
| the largest-sample line always true | `ceiling.mjs` | [8] the sample over the ceiling |
| the flat-top floor removed | `ceiling.mjs` | [8] the tone too quiet to clamp |
| the range +397 to +600 | `clock.mjs` | [9] the stand-in's line, the take 100 parts faster |
| the window floor 0 | `clock.mjs` | [9] the first 7 s |
| the fall-back floor removed | `clock.mjs` | [9] the first 5 s |
| `--packets` ignored | `clock.mjs` | [9] three cases |
| the number after an end marker not looked at | `demo.mjs` | [10] the phrase from 7, the fixture |
| the TOC judged by its configuration alone | `demo.mjs` | [10] the frame marked two channels |
| the rate records not looked at | `demo.mjs` | [10] the 48000 case |
| the header's map and server printed | `demo.mjs` | [10] the fixture and the leak check, [7] the marker check |
| the speakers' SteamIDs printed | `demo.mjs` | [10] the fixture and the leak check |
| the "no phrase after an end marker" floor removed | `demo.mjs` | [10] the one-phrase demo |
| `// fetch('https://example.invalid/')` | `clock.mjs` | [6] the text check |
| `net.connect` reached by a built name | `demo.mjs` | [6] "no run of this suite called the network" |

## Done means

After the fix round, on `0b8e91d` with the fix round's changes:

1. `flock /tmp/tf2ve-heavy.lock node tests/run.mjs reproduce site harness miles recordings` passes (the runner's
   lines are in "Runs"), and `node tests/reproduce.mjs` lists the checks: `ceiling`, `clock` and `demo` with their
   usage, `hold`, `gate` and `queue` as not built yet (exit 0).
2. Each check's last line and exit, on the suite's files:

   | Run | Last line | Exit |
   | --- | --- | --- |
   | `ceiling` on its stand-in at 0.15 | `ceiling: as expected` (largest 4,915 and smallest −4,915, expected ±4,915; 10,681 on the largest) | 0 |
   | `ceiling`, the ceiling three steps up | `ceiling: differs: samples pass the game's ceiling: something after the game raised the level ...` | 1 |
   | `ceiling`, three steps down | `ceiling: differs: the sound stays under the game's ceiling: either nothing reached the clip ...` | 1 |
   | `ceiling`, zeros | `ceiling: differs: file 1 holds no sound (every sample is zero)` | 1 |
   | `ceiling`, 99 on the ceiling | `ceiling: differs: only 99 samples sit exactly on the largest, fewer than 100 (a choice of this check): too few to show a clip; ...` | 1 |
   | `clock` on its stand-in | `clock: as expected` (+404, expected +386 to +427) | 0 |
   | `clock`, 100 parts faster | `clock: differs: the clock +533 is outside the record's range, widened for this check's spread: count the packets a second ... and give them as --packets` | 1 |
   | `clock`, zeros | `clock: differs: file 1 holds no sound (every sample is zero)` | 1 |
   | `clock`, its first 5 s | `clock: differs: the windows that line up span too little time to measure the clock: ...` | 1 |
   | `demo` on its stand-in | `demo: as expected` | 0 |
   | `demo`, the second phrase from 7 | `demo: differs: 1 phrase after an end marker does not start at frame number 0` | 1 |
   | `demo`, no voice | `demo: differs: file 1 holds no voice: record a demo with SourceTV while someone speaks` | 1 |

3. The network and marker checks pass, and each fails on its break (the tables of breaks, here and in "The review").
4. `demo` on `tests/demo/synthetic.dem` prints none of its header's fields (`Synthetic test`, `ctf_2fort`; the
   protocol, the length and the ticks are not read for printing) or its SteamIDs; the suite holds it.
5. Every figure on the page is the record's, with its standing and its finding's number, or is marked as the
   orchestrator's private measurement or a choice of a check: the table below.

All parts: `node tests/run.mjs site harness` passes; `node tests/cache-number.mjs origin/main --report` prints the
line in "Runs".

The script and the suite also run in a `git archive` copy of the branch with no `node_modules`: the suite passes
there.

## The page's figures

Line numbers are of `tests/REFERENCE_2026.md` on this branch after `main` at `9d5113a` was merged in, each found again
by its text, unless another file is named.

| Figure on the page | Standing given | Where it was copied from |
| --- | --- | --- |
| the voice into the mix at 255/256, truncated; 32639 (now in the steps-only entry "The voice's level in the mix") | read | 1084, 1086 (finding 30) |
| the clip at ±32767, then `volume`, then 16 bits; the ceiling round(32767 × `volume`) | read | 1086 |
| flat tops kept exactly on their level by the device's conversion | measured | 1091 |
| 16320 and −16320 at `volume 0.5` with `voice_overdrive 1000`, 37,644 samples, none above (steps-only entry) | measured, Set K | 1256 |
| 4895 to 4896 under 4915 at `volume 0.15`, the median of the clipped 1 kHz plateaus (steps-only entry) | measured, Set B | 1084; the method in `docs/reports/W3-15b-rooms-in-the-takes.md` 110 to 124 |
| recording A's largest sample exactly 4915, 4% of its samples there, none above | measured | 1086 (recording A is Set D's PC A, 180 and 188) |
| 182.6/256 with two speakers; the group rests on a name; no take | read; inferred | 1085 |
| `voice_overdrive 2` by default | read | 1088 |
| `voice_overdrive 1000` zeroes other sound about 0.65 s into a voice (steps-only entry); `volume 0.5` a Set K value | measured, Set K | 1256 |
| `dsp_slow_cpu 1` empties the room; Sound quality at its lowest; saved | read | 1221 |
| `dsp_slow_cpu 1` gives no room at once, 0 gives it back | measured, Set K | 1256 |
| the system's mixer limits the tops of Set K's takes | measured | 1256 |
| OBS, lossless, 48 kHz, 24 bits; `volume 0.15`, `voice_maxgain 10` | (Set B's provenance) | 134 |
| a file into the microphone at unity gain through a virtual cable | (the record's steps) | 1459; 33 |
| Windows or the cable converts to 24000 Hz; Steam opens 24 kHz | read | 1004, 710 |
| a stereo cable reached the game as its left channel | measured | 550 to 552 (finding 6) |
| MP3 moves the clipped samples | measured | 554 to 560 (finding 7) |
| the test signal, 142.9 s, `efd1c0bc…` | (Set B) | 123; the full hash and the numpy and scipy versions from `tests/testsignal/README.md` |
| the owner's `fps_max` is 300; that the takes ran at it | (Set G's entry); inferred | 238 |
| one sample left out of every packet | read | 915 (finding 24) |
| 17.8 packets a second; 17.8 / 44100 is 403 | measured; computed | 917; 926 (finding 25: 17.8 to 18.0) |
| 404 to 406 on most takes; not a recorder's clock | measured | 917; 1399 ("Results") |
| +397 to +416 on the takes without loss or jitter; +510 on `take3_voice_maxgain_1`; +280 to +2792 with loss or jitter | measured | `docs/ACCURACY.md` 164 to 181 and 192 |
| that take had 22.3 packets a second; 506 computed; 505 that figure or an earlier reading | inferred; computed; inferred | 917, 919 (RP-01a's note); `docs/ACCURACY.md` 192 |
| a restarted phrase skips in steps of 11 to 25 ms | measured | 910 (finding 23) |
| one line a packet with its count, from `voice_showincoming 1` | read | 956 (finding 27) |
| 20 ms hybrid frames, TOC configuration 13, one channel; rate field 24000 | measured, Set D | 643 |
| the encoder's settings | read | 1003 (finding 28) |
| 693 of 5,109 one-byte frames | measured | 645 |
| one sample-rate record a message, all 1,816 | read; measured | 647 |
| 20 phrases, each starting at 0; read since that the encoder writes 0 | measured; read | 192, 648 |
| no frame missing in Set D's demo | measured | 193 |
| the 0.7 s pauses of Set J ended a phrase | measured | 669 (finding 12) |
| the server's launch options, `tv_record`, `tv_stoprecord`, the `tf` folder | (the record's steps) | 179, 1463 point to `tests/demovoice/README.md`, lines 11 to 13 |
| the soundscape sets the room; 2Fort's set the automatic room; no voice exempt | read | 1188, 1189, 1207 |
| the room's part 21.6 dB under the voice | measured, Set K | 1256 |
| a packet lost whole; one packet, one message on a listen server | read; inferred | 588, 591 (finding 8) |
| 21.7, 37.0 and 49.8% of messages at 5, 10, 15 | read rule, computed, not measured | 597 |
| 3.1 and 3.9 lost runs a second, 3.5 and 6.1 frames | measured, Set C | 613 |
| no path makes a frame late; 96.0% present against 96.5% | read; measured | 629 (finding 9) |
| comfort noise 7 to 20 dB under a steady tone | measured | 682 (finding 13) |
| first DTX at 0.42 s (−36 dBFS) and 1.16 s (−30 dBFS) in Steam's packets | measured | 686, 687 |
| plateaus 0.6 to 1.2 s into a low tone, every 420 ms; their sign not predictable | measured, Set F | 811, 812, 821 (finding 18) |
| a held chord after a vocal becomes a whoosh | measured, Set E | 204, 768 to 786 (finding 17) |

Figures the page gives as the orchestrator's private measurements of 2026-11-13, from the coordinator's addendum:
eight takes with the largest sample exactly round(32767 × `volume`) (4915 in seven, 3604 in one), 3,603 or more on
it in six and 10 in the `voice_maxgain 1` take; a plateau median of 4,898 to 4,915 by threshold on other takes; the
check's clock against the accuracy suite's on fourteen takes, −11 to +10; 30 to 223 windows lined up on the record's
takes. The clock's figures on the model (the order's reviewer) are not the record's either: the page names them as
the reviewer's, measured on the model, with this report as their place.

Figures that are not the record's, and say so on the page:

- `clock`'s range, +386 to +427: the record's +397 to +416 widened by 11 (the ruling after the private run; a choice
  of this check). With `--packets`, 17 under to 24 over P / 44100: the record's range taken around finding 24's 403
  (6 under to 13 over, computed), widened by the same 11. The +510 take falls inside its own window (506).
- `clock`'s floor of 20 one-second windows: a choice of this check.
- `ceiling`'s floor of 100 samples on the largest: a choice of this check.
- The packets a second as lines × 44100 over the sum of their counts: arithmetic on finding 27's line, marked
  computed.

## What I read differently, and what is uncertain

- **The signal for group 2.** The order lists no generated signal for `ceiling` and `clock`. The page gives the
  record's own, the test signal, which needs Python with numpy and scipy, says any loud file over the map's sound
  serves `ceiling`, and recommends the test signal for `clock`. The Python scripts under `tests/testsignal/` are the
  page's only steps beyond Node. A Node generator for a group-2 signal
  would be a new file and a new pinned hash; I did not add one.
- **The `--packets` window** is my reading of the brief's ruling, which adds the option without a tolerance, widened
  by the orchestrator's ruling after the private run. It is the `WINDOW` and `SPREAD` constants in `clock.mjs` and
  two sentences of the page.
- **The clock's stand-in runs at 66.67 frames a second**, not the game's default 300 (the reason is above). At 300
  the check's line-up of short synthetic phrases is unstable; nothing shows the same on long real takes, but the
  stand-in cannot show that it is not.
- **What `clock` shows.** The order's reviewer ran this suite's 30 s speech-like source through the render that runs
  the game's queue, at two sources and six seeds: at 66.67 frames a second all 12 read inside +397 to +416; at 300
  only 6 of 12 did, from +386 to +790 (measured on the model). The record's takes were made at the owner's
  `fps_max 300` (inferred from Set G's entry) with the test signal's long phrases. So the page now recommends the
  test signal for `clock`, says the line-up is unsteady on short phrases at high frame rates, with those figures, and
  says a pass shows that the recording played about P / 44100 fast and not why: a recording resampled by 1.0004
  passes too. What else supports the cause is the record's finding 24 and its "Results" line that the clock is not
  a recorder's. The orchestrator's private run then showed the check steady on the record's takes, all at 300 frames
  a second (30 to 223 windows; within 11 of the accuracy suite's figure): the page says that beside the model's
  figures.
- **The console lines of "With a recorder"** set `dsp_slow_cpu 1`, and no longer `voice_overdrive 1000`: the
  ceiling now needs the map's sound under the voice. `voice_overdrive 1000` moved to the steps-only entry on the
  voice's level, where Set K used it. The record's Set K retake used `dsp_room 0`, not `dsp_slow_cpu 1`; both are
  read to remove the room, and `dsp_slow_cpu 1` was measured to do so at once in Set K. Whether either needs cheats
  is not in the record.
- **The ceiling's floor of 100** keeps out the `voice_maxgain 1` take's 10 samples and passes the six takes with
  3,603 or more. The other of the eight takes holds a count between 10 and 3,603 that the addendum does not give, so
  whether it passes is not known to me.
- **`demo` counts phrases after an end marker.** On Set D's demo that is 19 (the record's 20 phrases less the
  first), with the first phrase's start printed apart; the page now says so, beside the record's "20 phrases each
  starting at 0". The orchestrator's private run on Set D's demo gave 19 of 19 and the first at 0.
- **`docs/README.md`'s row for RP-01** still says the checks other than `inputs`, `gain`, `celt` and `speex` are not
  built: that row is the index the orchestrator keeps, and I left it.
- **W3-21 moved the clock's stand-in** from +409 to +404 (its sender's capture phase changes the render's packets).
  The stand-in stays inside the record's range, but it is one render's figure: a later change to the sender or the
  channel can move it again, and the suite would then say so.
- **The suite takes about 50 s** where it took 10 s. The clock's 30 s source and its two renders are most of it; a shorter
  source made the clock's stand-in unstable.
- **"Not yet run on a recording of the game"** stands on all three sections; it is the orchestrator's to lift.

## The review

The review's verdict was "merge after fixes"; each point was accepted by the orchestrator. `main` at `9d5113a` (W3-22
and the record's new lines on W3-21's private runs) was merged in first (`0b8e91d`).

| Point | Done | Where |
| --- | --- | --- |
| 1. The opening claimed a run on the game for every check below | it now names `gain`, `celt` and `speex`, and says `ceiling`, `clock` and `demo` have not been run on a recording of the game; the rest of the opening read again, and "With a recorder" now speaks of the record's older figures | `docs/REPRODUCE.md` 22 to 28, 234 to 235 |
| 2a. Private text in a demo's messages | `demoOf`'s first packet carries a server info message (a marker map and server name) and a string table (a marker player name); [10] checks no `demo` run prints a marker, on the stand-in and every break and floor | `tests/reproduce.verify.mjs`, `demoMsg.serverInfo`, `demoMsg.userTable`, `DEMO_TAGS` |
| 2b. Private text in a recording's chunks | `writeOutput(..., tagged)` writes `LIST/INFO` (title, artist) and `bext` (description, originator) with markers; a `ceiling` and the `clock` stand-in are written so; their output is checked for the markers | the same file, `tagChunks`, `TAGS` |
| 3. Two demo claims untested | a frame with frame-count code 1 and messages with two rate records, each "differs" | the same file, [10] |
| 4. Tolerances and the channel read | the window line printed is pinned; `ceiling`'s tolerance is one constant, with the ceiling two and three steps up and down as cases; a stereo stand-in with a silent second channel | the same file, [8] and [9]; `ceiling.mjs` `STEPS` |
| 5. What `clock` shows | the page recommends the test signal, says the takes were made at the owner's 300 frames a second (inferred), gives the reviewer's model figures and the orchestrator's real-take figures, and says what a pass does not show | `docs/REPRODUCE.md`, "clock"; this report, "What I read differently" |
| 6. Documents | the record's lines found again by their text; finding 25's 17.8 marked measured; the 22.3 packets marked inferred; the Python scripts named as the only steps beyond Node; the count of checks gone; the `demo` section says it prints 19 and the first on a demo of 20 phrases | `docs/REPRODUCE.md`; this report |

### The breaks of the fix round

Each made in the file, the suite run, the file restored. The first eight on the code as the review found it (before
the private run's rulings changed `ceiling` and the window), the rest after.

| Break | What the suite printed |
| --- | --- |
| `demo` prints `parsed.server` and `parsed.map` | FAIL the demos' map, server name and player name ... appear in no output of demo; FAIL no marker in the output of any run |
| `readOutputWav` puts a `LIST` or `bext` chunk's text in its message | FAIL on the tagged `ceiling` stand-in, the `clock` stand-in and five more `clock` cases; FAIL no marker in the output of any run |
| the TOC judged with its frame-count code masked | FAIL one frame's TOC with frame-count code 1: differs (exit 0: as expected) |
| one record counted as `>= 1` | FAIL one phrase's messages with two sample-rate records of 24000: differs (exit 0) |
| the `--packets` window turned round (`[-13, 6]`) | FAIL its window ... "expected +395 to +414" |
| `WINDOW` widened to `[-20, 20]` | FAIL the same |
| `ceiling`'s top tolerance two steps (first build) | FAIL the flat tops at 4,897: differs (exit 0) |
| `readOutputWav` reads the last channel | FAIL ... in stereo with a silent second channel (differs: no sound) |
| `ceiling`'s `STEPS` 2 | FAIL ... two steps up (4,917); FAIL ... two steps down (4,913) |
| `MIN_ON_TOP` 99 | FAIL 99 samples on the ceiling ...: differs (exit 0) |
| the smallest sample not judged | FAIL the top at 4,915 and the bottom held at -4,912 (a case added for it; the break passed the suite before) |
| `WINDOW` `[-13, 6]`, after the widening | FAIL its window ... "expected +384 to +425" |
| `WINDOW` `[-20, 20]`, after the widening | FAIL the same |
| `SPREAD` 20 | FAIL the stand-in's line "within +386 to +427"; FAIL the window line |
| the last channel read, after the change | FAIL ... in stereo with a silent second channel |
| the chunk text in the message, after the change | FAIL the tagged `ceiling` stand-in, the `clock` stand-in and five `clock` cases, and the marker check |

## The rulings after the private run

The orchestrator ran the three checks at `3477aee` on the owner's takes, privately, and sent the figures with two
rulings. They change the order's table for part c (section 3, rows `ceiling` and `clock`); they are the
orchestrator's, made in the coordinator's addendum of 2026-11-13, and this part builds them.

- **`demo`: as expected on Set D's demo.** 1,816 messages, 5,109 frames all of the kind, 1,816 of 1,816 messages
  with one 24000 Hz record, 693 one-byte frames, 20 end markers, 19 silence records, the first phrase at 0 and 19 of
  19 after an end marker at 0. Nothing changed but the review's points; the page's mark stays for the orchestrator.
- **`ceiling` checks the mixer's clip and `volume` only.** On every take with flat tops the first build said
  "differs": a recording on a map holds the voice and the map's sound summed, so its flat tops are the mixer's
  ceiling, round(32767 × `volume`), not the voice's 32639 × `volume` (measured by the orchestrator on eight takes).
  The check now wants the largest and smallest sample at plus and minus the ceiling within one step, none beyond,
  and at least 100 samples on the largest (my choice of floor: it keeps out the `voice_maxgain 1` take's 10). The
  voice's 255/256 became the steps-only entry "The voice's level in the mix" with the record's figures and how they
  were measured. The stand-in became a render's clamped voice with a hum and noise added before the clip, on the
  engine's own mixer functions; the voice alone now differs. Every sentence that put a recording's flat tops at
  32639 × `volume` left the page and this report.
- **`clock`'s window widened by 11.** The check's reading against the accuracy suite's on fourteen takes differed by
  −11 to +10 (measured by the orchestrator); one plain take read +418 against the table's +416 and failed. The range
  is now +386 to +427, and with `--packets` 17 under to 24 over. The stand-in (+404) and the pinned window line
  ("expected +384 to +425") follow; the take 100 parts faster (+533) still differs. The page gives the orchestrator's
  finding that on the record's takes the check lined up 30 to 223 windows and read within 11 of the suite.
- **WAV only.** The page says the recorder must save WAV and gives one FFmpeg line for a FLAC.

## Runs

- The fix round: `flock /tmp/tf2ve-heavy.lock node tests/run.mjs reproduce site harness miles recordings`:
  `reproduce units passed 46.0`, `recordings units passed 0.8`, `miles units passed 11.0`, `harness` and `site`
  passed, "5 of 5 suites passed". `node tests/cache-number.mjs origin/main --report`: see the hand-back.
- `pnpm test` under `flock /tmp/tf2ve-heavy.lock`, on `35b3672`: exit 0, `27 of 27 suites passed. 957.2 s summed`;
  `reproduce` 44.0 s.
- The browser suite under the lock (`CHROMIUM_EXECUTABLE` set): `browser  browser  passed  245.6`.
- CI: run 43375842946 on `35b3672` (the code, the page and `main` merged in): `verify` success, all five jobs
  success; `== reproduce: passed, 47.8 s` in `units`. The report follows in a push that changes only `docs/`, which
  starts no run.
- The branch's diff and its commit messages were scanned for recordings, personal details, real SteamIDs, paths and
  model names: none but the trailer lines. The SteamIDs in the suite are universe 0.

## The orchestrator's private run (2026-11-13)

Run on the merged script against the owner's recordings and Set D's demo, which are not public. Figures only, all
measured; the record's entry "The script's later checks run on the game's files" has the table.

- `demo`: as expected on Set D's demo (1,816 voice messages, 5,109 frames).
- `ceiling`: as expected on ten of seventeen recordings; the seven others differ for reasons the check names (too
  few samples on the ceiling in three, never reaching it in one, samples above it in three older recordings).
- `clock`: as expected on ten of seventeen, reading +402 to +418; four outside the range as the accuracy table has
  them, one of which is as expected with `--packets 22.3`; three with too little to line up.
- The first run, on the build before the fix round, is what changed `ceiling` and `clock` (the order's section 18).

The marks "Not yet run on a recording of the game" on the page's three sections were replaced by these figures.

