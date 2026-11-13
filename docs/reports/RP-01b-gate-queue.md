# RP-01b: the checks `gate` and `queue`, their sections of the page, the hold's steps

The builder's report. The order is [`docs/work-orders/RP-01b-gate-hold-queue.md`](../work-orders/RP-01b-gate-hold-queue.md),
with its last two sections ("The orchestrator's private look and rulings" and "After the plan review") holding over
its body. Branch `claude/rp-01b-gate-queue`, from `main` at `f855dd2`.

**Status:** built, and fixed after the private run and the review (the order's last section, "After the build,
the private run and the review"; this report's "The fix round", below). Every done-means passes on this machine; CI
is in "Runs". No private file was opened: no step needed one. "Not yet run on a log of the game" stands on both
sections: the orchestrator lifts it at the merge.

## The question, and its ruling

The first build stopped on one break: "the 300 log judged at `--fps 66.67`" gave "as expected". The replay takes the
mixer's demand from the log after a channel's wait (finding 22), so on the ticks between a shorter judged wait and
the true one the log's queue does not fall, the tool reads a demand of 0 (or, at the ring's cap, a hidden one), and
the channel, playing early with nothing pulled, matches every tick. Q1 tests the wait only from below. The private
run confirmed it on Set G's logs. The ruling: a second figure, Q2, built in the fix round.

## What was built

| File | What |
| --- | --- |
| `tests/voicequeue/replay.mjs` | new: `FAULTS`, `validFixture`, `replay`, `replayFixture`, moved unchanged out of `tests/voice-channel.verify.mjs` and exported |
| `tests/voicequeue/synthetic-log.mjs` | new: `mulberry32`, `UNRELATED`, `SCRIPT`, `synthesize`, moved; `synthesize({ fps, seed }, makeChannel)` takes the function that makes its channel, and nothing else of it changed |
| `tests/voice-channel.verify.mjs` | the two imports in place of what moved, and `createChannel` passed at its two calls of `synthesize`; nothing else |
| `tests/reproduce/queue.mjs` | new: `queue <log> --fps <f> [--section <m>] [--buffer-ms <ms>]`: `logToFixture`, then `replayFixture`; Q1, the faults as information, the floors |
| `tests/reproduce/steam-clip.mjs` | new: `steamClipSamples()` and `steamClipWav()`, the order's arithmetic line for line, the 44-byte header written here |
| `tests/reproduce/steam-console.mjs` | new: the reader of Steam's console text; numbers and counts only |
| `tests/reproduce/gate.mjs` | new: `gate <text> [<clip>]`: G1 to G3, and G4 and G5 with the clip; the place found by the chunk lines when there is no `loaded` line |
| `tests/reproduce/inputs.mjs` | writes `steam_mic_24000.wav` beside the two older clips and checks its SHA-256; the older clips' lines do not move |
| `tests/reproduce.mjs` | `gate` and `queue` imported; `hold` has words of its own and no order |
| `tests/reproduce.verify.mjs` | [1] the list (hold exits 3, no order named; the usage lines); [2] the third pin; [11] `queue`; [12] `gate`; the head comment |
| `docs/REPRODUCE.md` | the opening, "What you need", "The clips", "With Steam's console and the game's log", `gate`, `queue`, the steps-only entry "The hold and Steam's clock", "When a result differs", "Not built yet" |
| `docs/FINDINGS.md` | the "Check it yourself" sentences of entries 1, 2 and 7; entry 2 says the count needs the game's packet lines beside Steam's console |
| `tests/REFERENCE_2026.md` | added lines only: the dated correction beside the "3,358" sentence, which stays, and the entry "The checks gate and queue (2026-11-13)" |
| `tests/voicequeue/README.md`, `tests/README.md` | one paragraph pointing to the check; the suite's row |

Not touched: `steam-sender.js`, `voice-channel.js`, `engine/`, `sw.js`, `tests/voicequeue/log-to-fixture.mjs`,
`tests/voicequeue/reference-channel.mjs`, `tests/recordings/`, `tests/predictions/`, PROGRESS, `docs/README.md`,
`CLAUDE.md`, the old order. No recorded hash moved.

## The checks, as they run

- **`queue`.** Exit 2 for no `--fps`, one outside 10 to 1000, `--buffer-ms` outside 1 to 5000, not one file, a file
  that cannot be read. "Differs" for any stop of the tool (its words and the line's number), a log with a line that
  begins with `MARK` and no `--section`, fewer than 100 tick lines (a choice), and no channel whose queue fell. The
  marker word, which the tool puts into the fixture's name, is never printed. On a failing Q1 the reason names the
  first mismatching tick, a frame of 0.1 s or more and an unsteady frame rate, and the wait one tick off when either
  "wait" fault matches everywhere. Q2 (the fix round): every channel whose queue fell first fell on tick line W to
  W + 3 from its packet, W the wait, and one on W or W + 1; channels whose queue never fell are counted apart. A
  failing Q2 gives the wait and the lines, and says the frame rate given may be lower than the game's.
- **`gate`.** Exit 2 for no file, more than two, an option, a file that cannot be read. "Differs" for no chunk line,
  fewer than 50 (a choice), no chunk on each side of 1.0% among the lines that do not print 1.00, a line that begins as
  a chunk line and does not read as one (its number only), a clip that is not 16-bit mono at 24000 Hz with the plain
  header, a text whose `loaded` lines name another length, no place in the clip that fits. The walk ends at a `loaded`
  line, the typed command and the console's answer, each known by its fixed start, counted and never kept.
  "Whether file 2 is the generated clip" is printed as yes or no.

## The suite `reproduce`

| Check | The stand-in | What its pass shows |
| --- | --- | --- |
| `queue` | `synthesize` given `createReferenceChannel`, the second model, at 300 frames a second (90 packets, 471 tick lines, the ring overflowing) and 66.67; unrelated lines replaced by marker lines, two at the head and two at the tail; CRLF and line feeds; both logs in one file of marked parts | the tool's reading and that the two models agree on every tick (the suite `voice-channel` holds that too); not that the game prints the lines so |
| `gate` | Steam's console text for two passes of the 24 kHz clip: a first chunk of 6000 samples, then seeded intervals of 48.0 to 63.7 ms; numbers from the suite's sums and formatting; marks from one built sender a chunk (`lead` 0, the chunk as the first read, later reads of 750), the third with `meanMin` 1e12; the 6000-sample chunk's marks typed as spaces; copies copied, stamped with mixed line ends, with line feeds, in UTF-16; lines worked by hand before the `loaded` line | that the reading and the rule agree with the app's sender on every chunk, and the walk with the suite's sums; not that Steam prints the lines so |

On the model: 1,013 chunk lines, 13 that print 1.00, all four brackets, peaks 4,914 and 4,915 on either side of
the third mark, 10 chunks passed by their peak alone, exact means 0.9996% and 1.0002% nearest 1.0%; `queue` 473
and 377 ticks with no mismatch, the ring's faults 0 at 66.67, Q2 "4 of 4 ... one on line 30 or 31: yes" at 300 and "5 of
5 ... one on line 7 or 8: yes" at 66.67. These are in the record's entry, marked as the model's.

### The breaks

Each made in the file, the suite run, the file restored (`break.mjs` in the scratch folder). Each break of the
stand-ins is a case in the suite and fails as named; these are the breaks of the code.

| Break | Where | What failed |
| --- | --- | --- |
| the check replays with `keepSample` | `queue.mjs` | [11] both stand-ins, the line feeds copy, the marked log, the 100-line case |
| Q1 always "as expected" | `queue.mjs` | [11] the queue line 2 bytes off at the ring's limit |
| the stand-in written from `createChannel` | the suite | [11] "the stand-in is written from the second model" |
| the section's name printed | `queue.mjs` | [11] the marked log; [7] no marker in any output |
| the marked-parts rule removed | `queue.mjs` | [11] "without --section" |
| a socket opened by a built name | `queue.mjs` | [6] no run called the network |
| `327.67` read as `330` | `gate.mjs` | [12] every copy and break that holds a line printing 1.01 (G3, G5) |
| `4915` read as `4916` | `gate.mjs` | [12] every copy that holds a single sample of 4915 (G2, G4, G5) |
| the "or" of G1 an "and" | `gate.mjs` | [12] every copy (G1) |
| the walk's length truncated | `gate.mjs` | [12] the four copies with the clip and the other cases with the clip |
| the reader prints the line it could not read | `steam-console.mjs` | [12] the line with text after its count; [7] no marker in any output |
| `// fetch('https://example.invalid/')` | `gate.mjs` | [6] the text check |

The breaks of the order's lists, as suite cases: `queue`, a queue line 2 bytes off at an opening, during a wait, at
the ring's limit with a packet, and where the playing channel's mixer took nothing; the 66.67 log judged at 300; a
pull line; a second speaker; the packet lines alone; 99 tick lines (100 passes); a queue that never falls; no voice
line; a line cut short; marked parts without `--section`; `--buffer-ms 200`. `gate`, a first mark flipped; a third
mark on a line with no high sample; a count set to 0 on a line that passed by its peak; a mean raised from under
1.00 to 1.01; with the clip only, a mean moved by 0.02, a peak under 14.9 moved by 0.010, a length moved by 0.04 ms,
a 1.00 line's second mark against the clip's; a line removed with the clip; a shorter clip; the clip reversed; a clip
at 22050 Hz; a clip with a LIST chunk; the quiet lines alone; no chunk line; 49 chunk lines (50 passes); a chunk line
with text after its count. Each gives "differs", and since the fix round so does the 300 log judged at
`--fps 66.67` (on Q2), with the same log judged at 280 beside it.

## The page's figures

Line numbers are of `tests/REFERENCE_2026.md` on this branch.

| Figure on the page | Standing given | Where it was copied from |
| --- | --- | --- |
| the gate rule, 1.0% of 32767 or a sample of 4915 | read | 1093, 1094 (finding 28) |
| the chunk line's fields | measured | 1079 (finding 27); 345 |
| 789 verdicts follow; 0.9998% and 1.0315% | measured, Set J | 1094 |
| 590 chunk lines with a real microphone | measured, Set L | 871 (finding 16's paragraph) |
| the marks against the printed numbers on 2,706 lines; one 1.00 line; the lengths 62.50 on 441, 31.25 on 142, 93.75 on 7 | measured, private | 432, 439, 442 |
| −38 dBFS shut, −35 opens, the 1.5 ms burst by its peak | measured, Set J | 1094 |
| one line of one sample | measured; read | 1094; the order (W3-16's second read) |
| steps of 31.25 ms on the owner's PC | measured | 1090 |
| the path typed bare, no space; `mic_inputfile ""` and its answer; one command a line | measured, private | 447 |
| `console_log.txt` in `logs`, account names and addresses | measured | 345 to 353 |
| the clip: 679,200 samples, SHA-256, not played | computed; not built yet | 415 |
| the ring of 22050; a packet opens a channel; a channel ends after the ring empties | read | 999, 1000, 1001 (finding 22) |
| `ceil(0.1 × frames a second)` ticks | read | 1012 (finding 23) |
| N − 1 a packet | read | 1030 (finding 24) |
| 9,808 ticks over 2,375 packets | measured | 997 (finding 22) |
| 7 in 2 of 2, 10 in 4 of 4, 30 in 19 of 28, 31 in 8, 32 in 1 | measured, Set G | 1016 |
| a frame of 0.1 s or more ends the wait | read | 1020 |
| the table of six parts under six faults | measured, private | 467 to 474 |
| the `tf` folder | inferred | 463 (not named in any file) |
| 2,372 packets through the resampler's port | measured | 1173 (finding 29) |
| the hold's table | computed | 1101 to 1107 (finding 28) |
| 12 ends at four steps of 1/8 s, 389 to 514 ms, 4, 5 and 3 | measured, Set J | 1110 |
| 399.4 to 403.1 ms; 5 and 32 of 37; 18 of 18 and 12 of 12 | measured, Set L | 871; the counts' split, 456 |
| 2756 or 2757, 1378 or 1379 | measured, Set G | 1002 |
| no silence record after an empty read, 2 of 12 | read; seen | 1096 |
| `(Get-Process steam).StartTime` | not tried | RP-01's order, section 13 |
| `steam://open/console` | W3-09's suggestion | `docs/reports/W3-09-steam-voice.md` 476 to 478 |
| Q2's basis: W to W + 2 in 34 channels; one on W or W + 1 in each of the six parts; a frame rate too low passes Q1 | measured (finding 23); measured, private | 1016; the bullet "The check `queue` as first built" in the entry "The checks gate and queue" |
| one tick of wait short passes Q2: 10 frames a second at `voice_buffer_ms` 100 | computed | from `ceil(0.1 × frames a second)`, 1012 |

The order's choices, marked so on the page: the clip, the floors of 50 chunk lines and 100 tick lines, the one-digit
tolerance of G4. The page cites the record's entry and does not give 3,358.

## What I read differently, and what is uncertain

- **`echo MARK100` after `con_logfile`.** The plan review's point 1 has the page's step 2 begin with `echo MARK300`.
  An `echo` typed before `con_logfile` in the same line runs before the log is open, so its line would not be in
  the log (inferred). The page's line opens the log first, then echoes the marker. The first run is at
  `fps_max 100`, with 300 as a second run (point 2).
- **The search when there is no `loaded` line** uses the first five chunk lines and, while those fit several places,
  more, up to 200 (the fix round's cap). A clip that starts in silence fits everywhere with five. The info line says
  how many lines placed it.
- **The stamp.** The reader takes a stamp only of the record's form, `[YYYY-MM-DD HH:MM:SS] `.
- **UTF-16** is read little-endian with its byte-order mark only (the fix round dropped big-endian).
- **G4's tolerance** is applied to the exact mean and peak, not to their own rounding, so that rounding and
  truncation by Steam both pass.
- **The suite takes longer**: the gate stand-in makes two senders for each of 1,013 chunks, and the queue part runs
  about 40 more runs of the script.
- **"Not yet run on a log of the game"** stands on both sections; it is the orchestrator's to lift.

## The fix round

The order's last section, "After the build, the private run and the review". `main` at `aa76f91` merged in first.

| Point | Done | The case, and the break it fails on |
| --- | --- | --- |
| Q2 (the ruling) | `queue.mjs`: `SLACK` 3; Q2 printed after Q1; "as expected" needs both; the Q2 reason | [11] the 300 log at `--fps 66.67` and at 280 differ on Q2; Q2's line on both stand-ins. Q2 removed: both slow cases pass (fail); "one on W or W + 1" removed: the 280 case passes (fail) |
| 1. the walk's end tested | two copies: `] mic_inputfile ""` and the answer, then 40 lines of another place; the answer alone | [12] both "as expected", 40 not walked. Ends at `loaded` only: both fail G4 and G5 |
| 2. the search sets a one-sample line apart | `search()` lets a line of 0.04 ms rule no place out | [12] a chunk split into one sample and the rest, with its `loaded` line and, from the one-sample line on, without it (the place found at that chunk's sample). The search's rule removed: the second fails; the walk's rule removed: both fail |
| 3. G4's count; UTF-16 big-endian | a count moved from n to n + 1 on a line whose third mark is set; the big-endian branch dropped; the page says "saved as plain text" | [12] as expected alone, differs on G4 with the clip. The count's test removed from `fits`: the case passes (fail) |
| 4. the words | the page's "What a pass shows" for `queue`; "0 means ..." printed only when Q1 holds | [11] a failing Q1 prints no such sentence. Printed always: the case fails |
| 5. the search capped | `MAX_SEARCH` 200, a choice; the reason gives the lines and the places that still fit | [12] the text without `loaded` against the clip twice over: differs after 200 lines, 2 places. Cap 1000: fails |

The record's entry gained, as added lines, the private run's facts that the page's Q2 rests on, and the stand-ins'
Q2 on the model.

## Runs

- The fix round, on the merge of `aa76f91` with the fix: `flock /tmp/tf2ve-heavy.lock node tests/run.mjs reproduce site
  harness recordings miles steam-sender voice-channel`: each suite passed; `reproduce units passed 76.3`,
  `voice-channel units passed 83.8`. `voice-channel`'s output against `main`'s saved one, the times cut: the same
  lines (the runner puts one blank line before it when it is not the first suite). `node tests/cache-number.mjs
  origin/main --report`: "cache number against origin/main (aa76f91): no cached file changed; the number stays v41".
  `git diff origin/main --stat`: only files the order allows; the record's diff adds lines only; `steam-sender.js`,
  `voice-channel.js`, `engine`, `sw.js`, `log-to-fixture.mjs` and `reference-channel.mjs`: no diff.
- CI on the fix round: run 43412524931 on `b30c633`: `verify` success, all five jobs success; the clip's pin line
  holds on CI; `== reproduce: passed, 64.4 s`.
- The first build: `flock /tmp/tf2ve-heavy.lock node tests/run.mjs reproduce site harness recordings miles
  steam-sender`: each suite passed; `reproduce units passed 63.1`.
- `node tests/run.mjs voice-channel` under the lock on `main` (`f855dd2`) and on the branch after the move, the times
  cut: `diff` shows nothing (108.8 s and 101.7 s). The replay-only mode, `TF2VE_VOICE_REPLAY_ONLY=1 node
  tests/voice-channel.verify.mjs --fixture <file>`, on a fixture of the suite's two logs (300 and 66.67 frames a
  second) written with `log-to-fixture.mjs`: the same table before and after ("replay passed").
- `node tests/reproduce.mjs inputs <folder>`: three files, `steam_mic_24000.wav` 679,200 samples, 1,358,444 bytes,
  SHA-256 `3e02aaa5…8e873fde`, "as expected"; the two older clips' lines are the same as on `main`, line for line.
- `pnpm test` under the lock on `17da848`: every suite passed, 1069.0 s summed; `reproduce` 68.9 s,
  `voice-channel` 95.7 s. The browser suite was not run here; CI ran it.
- CI: run 43398554959 on `17da848`: `verify` success, all five jobs success. Its `units` log: "steam_mic_24000.wav
  has the record's SHA-256 and length [3e02aaa585001e56…, 1358444 bytes]", `== reproduce: passed, 39.2 s`. This
  report's last lines follow in a push that changes only `docs/`, which starts no run.
- `node tests/cache-number.mjs origin/main --report`: "cache number against origin/main (f855dd2): no cached file
  changed; the number stays v41".
- `git diff origin/main --stat`: only files the order allows; `git diff origin/main -- tests/REFERENCE_2026.md`:
  added lines only; `git diff origin/main -- steam-sender.js voice-channel.js engine sw.js
  tests/voicequeue/log-to-fixture.mjs tests/voicequeue/reference-channel.mjs`: nothing.
- The branch's diff and its commit messages were scanned for recordings, personal details, real SteamIDs, paths and
  model names: none but the trailer lines.
