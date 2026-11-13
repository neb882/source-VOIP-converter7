# RP-01c: the checks `ceiling`, `clock` and `demo`, their sections of the page, the steps-only entries

The builder's report. The order is `docs/work-orders/RP-01-reproduce-it.md`, part c (sections 3, 4, 5, 9, 14 and
15). Branch `claude/rp-01c-ceiling-clock-demo`, from `main` at `aae2a36`; `main` merged in at `35b3672`.

**Status:** built. Every done-means of part c passes on this machine; CI is in "Runs". No private file was opened:
no step needed one.

## What was built

| File | What |
| --- | --- |
| `tests/reproduce/ceiling.mjs` | `ceiling <recording> --volume <v>`: the flat tops found by `TF2Reference.clampLevel`, their value the commonest whole step inside that plateau, counted only in runs of four or more; expected at 32639 × `volume` and no sample over round(32767 × `volume`), each within one step |
| `tests/reproduce/clock.mjs` | `clock <recording> <source> [--packets <a second>]`: the source rendered with the `steam` profile at its defaults at the recording's rate (`TF2Audio.process`, loaded through `tests/lib/engine.cjs`), the recording lined up with `TF2Reference.track` as the accuracy suite does, against the render and its frame log, with Steam's gate figures from `CODEC_PROFILES.steam`; the clock rounded to whole parts in a million |
| `tests/reproduce/demo.mjs` | `demo <demo>`: `TF2Demo.parse` (`demo.js`); per frame the TOC byte (configuration 13, one channel, one frame), per message the sample-rate records (read as `demo.js` reads the payload, with its `crc32`), per phrase the number after each end marker. Counts only |
| `tests/reproduce/common.mjs` | `readOutputWav`: a recording as a recorder saves it (16-, 24- or 32-bit integer, 32- or 64-bit float, extensible format, any channels; the first channel, in 16-bit steps); `describeOutput`; `readBytes` exported |
| `tests/reproduce.mjs` | the three checks in the list in place of their "not built yet" entries |
| `tests/reproduce.verify.mjs` | sections [8] `ceiling`, [9] `clock`, [10] `demo`; [1] names the seven built checks; [6]'s load list names `reference.js` and `demo.js`; the head comment's table of what each stand-in shows |
| `docs/REPRODUCE.md` | "With a recorder of the PC's output", `ceiling`, `clock`, "With a server", `demo`, "Steps only (no script yet)" with the rooms, the network and the codec as heard; "When a result differs" names the group-2 causes; the three rows leave "Not built yet" |
| `README.md`, `tests/README.md` | the sentence on the built checks; the suite's row and time |

Nothing under `engine/`, no file the site loads (`reference.js`, `demo.js` and `tests/lib/engine.cjs` are loaded,
not changed), no codec module, not `sw.js`, `CLAUDE.md`, PROGRESS or the record. No recorded hash moved.

## The checks, as they run

Each ends as part a's do: `<check>: as expected` (exit 0), `differs: <reason>` (1), `cannot check` (2).

- **`ceiling`.** Floors: no sound; no flat top (fewer than max(100, 0.2% of the samples) flat at the loudest level,
  the share `clampLevel` asks of a plateau); flat parts under 0.9 of the expected top get a reason that names a voice
  too quiet, a wrong `--volume` or a system volume under 100%. `--volume` is required (0.01 to 1) and taken in single
  precision, as the engine takes it. The script prints the volume the tops give and their share of the ceiling.
- **`clock`.** Floors: no sound in either file; a recording under 4 s; `track()` failing to place the source (its
  own errors, put in the script's words); `track()` falling back to the coarse placement's clock, which happens when
  its windows span too little time (the segment's `b` equals `1 / coarse.scale`); fewer than 20 one-second windows
  lined up (a choice of this check). Without `--packets` the pass range is +397 to +416; with it, P / 44100 from 6
  under to 13 over (below).
- **`demo`.** Floors: not a demo; no voice; a codec other than Steam voice named by the server; no Steam voice
  frame; no phrase after an end marker. The codec's name is printed only when it is one of the five the game knows.
  Nothing of the header, no SteamID, no speaker's place in the file is printed; speakers are counted.

## The suite `reproduce`

`node tests/reproduce.verify.mjs`: 46 s here, from 10 s (the clock's renders and line-ups are most of it).

| Check | The stand-in | What its pass shows |
| --- | --- | --- |
| `ceiling` | a 1 kHz tone at 0.3 with pauses, rendered by `TF2Audio.process` at `volume` 0.15 and 0.5 | the reading of 24-bit stereo, 16-bit mono and float files; the plateau found and counted; both pass lines. The record's 4895 to 4896 and 16320 are the render's 4896 and 16320 here (finding 30, as built) |
| `clock` | 30 s of a speech-like source in phrases of 8 s, rendered with `timeline: 'game'` at 66.67 frames a second (seed 2) against the default render | the render, the line-up and the verdicts: the stand-in reads +409, its own packets a second 17.7 (403 computed). The clock comes from the channel as built, which drops one sample a packet as read, not from the game's output |
| `demo` | a demo written by the suite: three phrases of libopus 1.1.5 frames at Steam's settings (135 frames, 10 of one byte), eight frames in a phrase's first message and three after, numbered from 0, end markers and silence records, a SteamID in universe 0, marker strings in every text field of the header and in a printed line | the reading of frames, rate records and numbers; nothing of the header or a SteamID printed |

Why 66.67 frames a second for the clock's stand-in: at 300 the channel's wait overflows the ring at every restart
and the take skips 11 to 25 ms several times in its first half second (finding 23), and on these short synthetic
phrases `track()`'s one clock then read anywhere from 0 to 710 over seeds (measured here on scratch sources). At
66.67 nothing is dropped (finding 23) and the stand-in's source read +408 to +415 over six seeds. The stranger's recordings are the record's
kind (long phrases, 300 frames a second), on which the accuracy suite reads +397 to +416.

The cases, besides each stand-in's pass: `ceiling` with the tops two and three steps up (4,898 and 4,899), one sample
three steps over the ceiling (4,918), checked at the wrong volume, zeros, a tone too quiet to clamp, and no
`--volume`. `clock` with the take 100 parts in a million faster (+509; with and without `--packets`), judged at 22.3
packets a second, zeros, its first 7 s (10 windows) and first 5 s (`track()`'s fall-back), unrelated noise, and a
source of zeros. `demo` with the second phrase numbered from 7, one frame's TOC made SILK-only, one marked two
channels, one phrase's rate records at 48000, no voice, one phrase, `vaudio_celt`, a file that is not a demo, and
`tests/demo/synthetic.dem` (differs: its second phrase after an end marker is numbered 7; none of `Synthetic test`,
`ctf_2fort`, `hello` or its two SteamIDs printed). A further check holds that no run prints the stand-ins' SteamID or
the fixture's fields; the marker check of [7] covers every run.

### The suite's tests, broken

Each break was made in the file, the suite run, the file restored (`break.sh` in the scratch folder).

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

1. `node tests/run.mjs reproduce` passes (`reproduce  units  passed  46.0`), and `node tests/reproduce.mjs` lists the
   checks: `ceiling`, `clock` and `demo` with their usage, `hold`, `gate` and `queue` as not built yet (exit 0).
2. Each check's last line and exit, on the suite's files:

   | Run | Last line | Exit |
   | --- | --- | --- |
   | `ceiling` on its stand-in at 0.15 | `ceiling: as expected` (tops 4,896, expected 4895.85; largest 4,896, at most 4,915) | 0 |
   | `ceiling`, the tops three steps up | `ceiling: differs: the flat tops are not at 32639 x volume: they give a volume of 0.1501 where --volume says 0.15. ...` | 1 |
   | `ceiling`, zeros | `ceiling: differs: file 1 holds no sound (every sample is zero)` | 1 |
   | `ceiling`, a voice too quiet | `ceiling: differs: file 1 has no flat top (0 samples sit flat at its loudest level, fewer than 384): ...` | 1 |
   | `clock` on its stand-in | `clock: as expected` (+409, expected +397 to +416) | 0 |
   | `clock`, 100 parts faster | `clock: differs: the clock +509 is outside the record's range: count the packets a second ... and give them as --packets` | 1 |
   | `clock`, zeros | `clock: differs: file 1 holds no sound (every sample is zero)` | 1 |
   | `clock`, its first 5 s | `clock: differs: the windows that line up span too little time to measure the clock: ...` | 1 |
   | `demo` on its stand-in | `demo: as expected` | 0 |
   | `demo`, the second phrase from 7 | `demo: differs: 1 phrase after an end marker does not start at frame number 0` | 1 |
   | `demo`, no voice | `demo: differs: file 1 holds no voice: record a demo with SourceTV while someone speaks` | 1 |

3. The network and marker checks pass, and each fails on its break (the last four rows of the table above, and the
   two rows that print the header and the SteamIDs).
4. `demo` on `tests/demo/synthetic.dem` prints none of its header's fields (`Synthetic test`, `ctf_2fort`, the
   protocol, the length or the ticks are not read for printing) or its SteamIDs; the suite holds it.
5. Every figure on the page is the record's, with its standing and its finding's number: the table below.

All parts: `node tests/run.mjs site harness` passes; `node tests/cache-number.mjs origin/main --report` prints
`cache number against origin/main (beedc69): no cached file changed; the number stays v39`.

The script and the suite also run in a `git archive` copy of the branch with no `node_modules`: the suite passes
there (101 checks).

## The page's figures

Line numbers are of `tests/REFERENCE_2026.md` on this branch, unless another file is named.

| Figure on the page | Standing given | Where it was copied from |
| --- | --- | --- |
| the voice into the mix at 255/256, truncated; 32639 | read | 1063, 1065 (finding 30) |
| the clip at ±32767, then `volume`, then 16 bits; the ceiling round(32767 × `volume`) | read | 1065 |
| flat tops kept exactly on their level by the device's conversion | measured | 1070 |
| 16320 and −16320 at `volume 0.5`, 37,644 samples, none above | measured, Set K | 1210 |
| 4895 to 4896 under 4915 at `volume 0.15` | measured, Set B | 1063 |
| recording A's largest sample exactly 4915, none above | measured | 1065 (recording A is Set D's PC A, 180 and 188) |
| 182.6/256 with two speakers; the group rests on a name; no take | read; inferred | 1064 |
| `voice_overdrive 2` by default | read | 1067 |
| `voice_overdrive 1000` zeroes other sound about 0.65 s into a voice; `volume 0.5` the retake's | measured, Set K | 1210 |
| `dsp_slow_cpu 1` empties the room; Sound quality at its lowest; saved | read | 1175 |
| `dsp_slow_cpu 1` gives no room at once, 0 gives it back | measured, Set K | 1210 |
| an open-space room would put the tops at 4781 | computed (the record: "the level excludes") | 1195 |
| the system's mixer limits the tops of Set K's takes | measured | 1210 |
| OBS, lossless, 48 kHz, 24 bits; `volume 0.15`, `voice_maxgain 10` | (Set B's provenance) | 134 |
| a file into the microphone at unity gain through a virtual cable | (the record's steps) | 1413; 33 |
| Windows or the cable converts to 24000 Hz; Steam opens 24 kHz | read | 1004, 710 |
| a stereo cable reached the game as its left channel | measured | 552 (finding 6) |
| MP3 moves the clipped samples | measured | 554 to 560 (finding 7) |
| the test signal, 142.9 s, `efd1c0bc…` | (Set B) | 123; the full hash and the numpy and scipy versions from `tests/testsignal/README.md` |
| one sample left out of every packet | read | 915 (finding 24) |
| 17.8 packets a second; 17.8 / 44100 is 403 | measured; computed | 917; 926 (finding 25: 17.8 to 18.0) |
| 404 to 406 on most takes | measured | 917 |
| +397 to +416 on the takes without loss or jitter; +510 on `take3_voice_maxgain_1`; +280 to +2792 with loss or jitter | measured | `docs/ACCURACY.md` 164 to 181 and 192 |
| 22.3 packets a second; 506 computed; 505 that figure or an earlier reading | measured; computed; inferred | 917, 919 (RP-01a's note) |
| one line a packet with its count, from `voice_showincoming 1` | read | 956 (finding 27) |
| 20 ms hybrid frames, TOC configuration 13, one channel; rate field 24000 | measured, Set D | 643 |
| the encoder's settings | read | 1003 (finding 28) |
| 693 of 5,109 one-byte frames | measured | 645 |
| one sample-rate record a message, all 1,816 | read; measured | 647 |
| 20 phrases, each starting at 0; read since that the encoder writes 0 | measured; read | 192, 648 |
| no frame missing in Set D's demo | measured | 193 |
| the 0.7 s pauses of Set J ended a phrase | measured | 669 (finding 12) |
| the server's launch options, `tv_record`, `tv_stoprecord`, the `tf` folder | (the record's steps) | 179, 1418 point to `tests/demovoice/README.md`, lines 11 to 13 |
| the soundscape sets the room; 2Fort's set the automatic room; no voice exempt | read | 1142, 1143, 1161 |
| the room's part 21.6 dB under the voice | measured, Set K | 1210 |
| a packet lost whole; one packet, one message on a listen server | read; inferred | 588, 591 (finding 8) |
| 21.7, 37.0 and 49.8% of messages at 5, 10, 15 | read rule, computed, not measured | 597 |
| 3.1 and 3.9 lost runs a second, 3.5 and 6.1 frames | measured, Set C | 613 |
| no path makes a frame late; 96.0% present against 96.5% | read; measured | 629 (finding 9) |
| comfort noise 7 to 20 dB under a steady tone | measured | 682 (finding 13) |
| first DTX at 0.42 s (−36 dBFS) and 1.16 s (−30 dBFS) in Steam's packets | measured | 686, 687 |
| plateaus 0.6 to 1.2 s into a low tone, every 420 ms; their sign not predictable | measured, Set F | 811, 812, 821 (finding 18) |
| a held chord after a vocal becomes a whoosh | measured, Set E | 204, 770 to 786 (finding 17) |

Figures that are not the record's, and say so on the page:

- `clock`'s window with `--packets`, 6 under to 13 over P / 44100: the record's +397 to +416 taken around finding
  24's 403 (computed; a choice of this check). The +510 take falls inside its own window (506).
- `clock`'s floor of 20 one-second windows: a choice of this check.
- `ceiling`'s flat-top rule (runs of four or more, at least 0.2% of the samples and 100): not on the page as figures;
  the page says "in runs of four or more".
- The packets a second as lines × 44100 over the sum of their counts: arithmetic on finding 27's line, marked
  computed.

## What I read differently, and what is uncertain

- **The signal for group 2.** The order lists no generated signal for `ceiling` and `clock`. The page gives the
  record's own, the test signal, which needs Python with numpy and scipy, and says any loud file serves `ceiling` and
  any played file serves `clock`. That is the one step of the page beyond Node. A Node generator for a group-2 signal
  would be a new file and a new pinned hash; I did not add one.
- **The `--packets` window** is my reading of the brief's ruling, which adds the option without a tolerance. If the
  orchestrator wants another window, it is the `WINDOW` constant in `clock.mjs` and one sentence of the page.
- **The clock's stand-in runs at 66.67 frames a second**, not the game's default 300 (the reason is above). At 300
  the check's line-up of short synthetic phrases is unstable; nothing shows the same on long real takes, but the
  stand-in cannot show that it is not.
- **The console lines of "With a recorder"** set `dsp_slow_cpu 1` and `voice_overdrive 1000` for a clean ceiling.
  The record's Set K retake used `dsp_room 0`, not `dsp_slow_cpu 1`; both are read to remove the room, and
  `dsp_slow_cpu 1` was measured to do so at once in Set K. Whether either needs cheats is not in the record; Set K
  set them in an ordinary game.
- **`demo` counts phrases after an end marker.** On Set D's demo that is 19 (the record's 20 phrases less the
  first), with the first phrase's start printed apart. The page says so in the record's words ("20 phrases each
  starting at 0").
- **`docs/README.md`'s row for RP-01** still says the checks other than `inputs`, `gain`, `celt` and `speex` are not
  built: that row is the index the orchestrator keeps, and I left it.
- **The suite takes 46 s** where it took 10 s. The clock's 30 s source and its two renders are most of it; a shorter
  source made the clock's stand-in unstable.
- **"Not yet run on a recording of the game"** stands on all three sections; it is the orchestrator's to lift.

## Runs

- `pnpm test` under `flock /tmp/tf2ve-heavy.lock`, on `35b3672`: exit 0, `27 of 27 suites passed. 957.2 s summed`;
  `reproduce` 44.0 s.
- The browser suite under the lock (`CHROMIUM_EXECUTABLE` set): `browser  browser  passed  245.6`.
- CI: run 43375842946 on `35b3672` (the code, the page and `main` merged in): `verify` success, all five jobs
  success; `== reproduce: passed, 47.8 s` in `units`. The report follows in a push that changes only `docs/`, which
  starts no run.
- The branch's diff and its commit messages were scanned for recordings, personal details, real SteamIDs, paths and
  model names: none but the trailer lines. The SteamIDs in the suite are universe 0.
