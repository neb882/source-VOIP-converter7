# RP-01: a page a stranger can check findings from, the files behind the read findings, and which recordings are published

**Status 2026-11-13: not started**, every part (RP-01a to RP-01f, section 9); after the orchestrator's rulings on
section 12 and a plan review by a different model (`docs/PIPELINE.md`).

*Written 2026-11-13 by a planner's pass on `main` at `d27727c` (cache v39). The planner read the repository only:
it opened no recording and no file of the owner's install. What it knows of the private files is an inventory of
sizes and formats that the orchestrator gave (section 7) and `tests/REFERENCE_2026.md` ("the record" below).*

**Kind:** documents, tests and tools. It changes no render, no constant and no file the site loads.
**Roles:** `tf-builder` (effort high) for parts a, b, c, d and f, each followed by `tf-reviewer`. Part e is the
orchestrator's alone. **Branches:** `claude/rp-01a-…` to `claude/rp-01f-…`, from `main`; worktrees in the briefs.
**Reports:** `docs/reports/RP-01a-….md` and so on, one a part.

## 1. Intent

Every figure in the record that rests on a recording rests on recordings only the owner and the orchestrator can
open, made on one PC (two for Set D). A reader who doubts a figure can only take it or leave it. This order gives
that reader three things:

1. steps and one script that get the figure from the reader's own game (sections 3 to 5);
2. the name, build, date and SHA-256 of each file a finding marked "read" was read from (section 6);
3. the sound of those takes that hold nothing private and nothing of Valve's (section 7).

It comes from `docs/PROGRESS.json`: `ideas_not_started`, the entry "From an outside read of the repository",
points (1), (3) and (5), and `decisions_in_force`, the entry of 2026-11-12 on publishing.

## 2. What is not this order

- Point (2) of that entry, a tagged release of the modern path, is not this order. It stays where it is.
- Point (4), scoring the owner's next recording against predictions registered beforehand, is not this order. It
  stays where it is.
- The check of Steam's codec and decoder to the sample (Set J's kind, findings 16 and 29) is not scripted here.
  `docs/owner-runs.md` says it is done by hand, and its method (W3-14's report) is an order of its own.
- No check that would be a discovery goes on the page: a figure is on it only where the record already has that
  figure in that form. Section 3 names what this leaves out.

## 3. The page

### Where it lives

`docs/REPRODUCE.md`, titled "Check it on your own PC". `README.md` links it from the paragraph above its list of
findings, `docs/FINDINGS.md` from "How to read it", and `docs/README.md` from its list of documents for a user of
the page. It is a document, not a page of the site.

The other choice is a page of the site with a place to drop a file. It would cost a file in `sw.js`'s list and a
rise of the cache number, checks in the browser suite, a phone layout, and a second front for measures the Node
tools already have. The site's real-take check already compares a recording with a render in the browser, and the
page of this order points to it for that one use.

### Which findings go on it

"Entry" is the entry of `docs/FINDINGS.md`; "finding" is the record's number. Group 1 needs the game, Steam and
nothing else (a file as the microphone, the two consoles). Group 2 needs a recorder of the PC's sound as well.
Group 3 needs a second PC or a server. Group 4 cannot be checked from outside.

| Entry | Findings | Group | On the page as | Why it is sorted so |
| --- | --- | --- | --- | --- |
| 2. The hold and Steam's clock | 12, 16, 28 | 1 | `hold`, the page's opening section | Steam's console prints every chunk; the record calls it the plainest to check on another PC |
| 1. Steam's sender | 5, 27, 28 | 1 | `gate` | the same console lines carry each chunk's mean, peak and verdict |
| 7. The voice channel | 22, 23, 24, 25 | 1 | `queue` | the game's console prints every packet and the queue on every tick |
| 5. Steam's decoder | 29 | 1 | the packet counts in `queue` | the same log; the check to the sample is not scripted (section 2) |
| 6. The receiver's gain | 3, 4, 26 | 1 | `gain` | two files the game writes under `vaudio_celt` with a file as the microphone |
| 10. The older engine codecs | 31 | 1 | `celt`, `speex` | the game writes its decoded voice; `speex` needs the 32-bit game (`-force32bit`) |
| 8. The mixer and the output | 1, 30 | 2 | `ceiling` | the flat tops and the ceiling are in a recording of the output |
| 7, in sound | 10, 19, 21, 24 | 2 | `clock` | a recording against a render shows the one sample a packet |
| 9. Rooms | 32 | 2 | steps only, marked "no script yet" | the room is in the output only; its measure needs the room procedure of W3-17, an order of its own |
| 4. The network | 8, 9 | 2 | steps only, marked "no script yet" | the measure of lost runs is not in the repository (finding 8 says so) |
| 3. The codec, heard | 13, 17, 18 | 2 | steps only, marked "no script yet" | the record has these figures from Steam's packets and from recordings of the output, not from a file a stranger makes with group 1's means |
| 3. The codec, its packets | 2, 11, 16 | 3 | `demo`, under "With a server" | Steam's packets are in a SourceTV demo, which needs a dedicated server |
| "What rests on one PC" | 14, 15 | 3 | not on the page | needs the sender's packets and a second listener |
| 11. `vaudio_miles` (never in TF2) | 31 | 4 | not on the page | TF2 refuses the name, and no recording of a running engine exists to expect figures from |
| what was only read | parts of 22, 26, 29, 30 | 4 | not on the page; section 6 serves it | no output tells the divisor 127 from 128, or shows the fade, the two-speaker level or the 17-frame cut |
| which pause closes | 21 | 4 | not on the page | it depends on where Steam's reads fell, which no recording holds |

Findings 6, 7 and 20 are about one capture cable, about MP3 files and about the app, not about the game, so they
are in no group.

### What each section of the page holds

In this order: what the finding claims in one sentence with its standing; the signal (the generated file, the
command that makes it, its SHA-256); the steps as console lines in order; the figures to expect, each with its
tolerance and where that comes from; and what a different result means.

- **The signals** are made by `node tests/reproduce.mjs inputs <folder>`, in Node with a seeded generator and no
  other library, so the files are the same on every PC. The suite pins each file's SHA-256 and the command
  prints "as expected" or "differs" beside it. They are: one 24000 Hz mono clip for Steam's `mic_inputfile`
  (loud bursts with pauses of more than a second, a 1 kHz tone at −38 dBFS and one at −35 dBFS, a 1.5 ms burst
  at 0.2 of full scale), and one `voice_input.wav` each at 22050 Hz and at 11025 Hz for `voice_inputfromfile`,
  16-bit mono with a plain 44-byte header, each under 20 s. The game's file stops at 1 MiB (read, finding 27),
  which is 23.8 s at 22050 Hz (computed), so it holds all of either.
- **The steps** are taken from the record and the reports it names (W3-03 for the two game variables and the
  files they write, W3-14's order for Steam's console, `tests/voicequeue/README.md` for the queue's log). A step
  the record gives as inferred, such as the folder `voice_input.wav` goes in, is marked inferred on the page.
- **A different result** is sorted by the page in this order: a step was missed (the script names what it can
  see: a wrong rate, a file with no sound, a log with no chunk lines); the frame rate differs (the `queue`
  figures follow it); the build differs (compare the game's `version` line and Steam's build date with the table
  of section 6); or the finding is wrong for that PC. For the last two the page asks for a report: an issue on
  the repository holding the script's output, which is figures only, the game's `version` line, Steam's build
  date, the frame rate and how long Steam had run.
- **A hash that differs refutes nothing.** The page says so where it points to the table of section 6.

### The figures to expect

Each figure below is the record's, with its standing. The builder copies them from the record, not from this
table; the reviewer checks each against the record.

| Check | The claim, in short | Expect | Tolerance, and where it comes from |
| --- | --- | --- | --- |
| `hold` | Steam ends a phrase at the read where its clock, a 32-bit float of seconds since Steam started, has passed the last loud chunk's time plus 0.4 s (read) | the sender's rule, told how long your Steam has run, gives every phrase end of the log (measured: 18 of 18 at 4.8 minutes, 12 of 12 at 23.9 days); told the other age it gives fewer (measured: 7.5 of 18 on average, 8 of 12). On a Steam under 18 hours the phrase ends on the 7th or 8th read after the last loud one, never the 9th (measured: 5 and 32 of 37); from 12.1 to 24.3 days on the 7th, 8th or 9th (measured: 4, 5 and 3 of 12) | none on the ends. The row of finding 28's table for the uptime given (computed) says where the hold may run out; the rows other than those two were not measured, and the page asks for a report from them either way |
| `gate` | a chunk is sent when the mean of its absolute samples is at least 1.0% of 32767 or one sample reaches 4915 (read) | every printed verdict follows the rule (measured: 789 of 789 lines with a file, 590 of 590 with a microphone); the highest mean that failed is under 1.0% and the lowest that passed is at or over it (measured: 0.9998% and 1.0315%) | a chunk of one sample printed a mean of 0.00 and did not fit (measured: one line); lines of such chunks are counted apart |
| `queue` | each speaker's voice waits in a ring of 22050 samples; a channel that opens waits `ceil(0.1 × frames a second)` ticks; each packet of N samples adds N − 1 (read) | the rule gives the logged queue on every tick (measured: 9,808 of 9,808), and each of the replay's faults fails somewhere; lines before the queue can fall: 7 at `fps_max 67`, 10 at 100, 30 at 300 (measured: 7 in 2 of 2 channels, 10 in 4 of 4, 30 in 19 of 28) | at 300 the logs also show 31 (8 of 28) and 32 (1 of 28) (measured); none on the ticks |
| packet counts, in `queue` | Steam resamples each message by itself from 24000 to 44100 Hz (read) | the port of that resampler gives the logged count of every packet that is not empty, from one starting phase (measured: 2,372 of 2,372): 882 for one frame, 2646 for three, 7056 for eight | none |
| `gain` | finding 26's rule in blocks of 128 samples (read) | the rule, applied to the recording made at `voice_maxgain 1`, gives the one made at 10 in every sample before the last packet (measured: 0 of 291,840 differ) | none; the last packet differs between two key presses (measured) and is counted apart |
| `celt` | `vaudio_celt` and `vaudio_celt_high` are CELT 0.11 at the settings read | the app's build gives the game's decoded voice in all but a few samples, each of those one step off (measured: 292,351 of 292,352 and 292,789 of 292,864) | at most 0.05% of samples one step off and none further, which is Set H's larger share doubled (a choice); the last packet apart |
| `speex` | the 32-bit game's `vaudio_speex` is Speex 1.0.2 or 1.0.1 fed 11025 Hz sound, computed as the module's compiler did (read; run) | the app's build gives the game's recording in every sample (measured, Set O: 145,966 of 145,966 at `voice_maxgain` 1 and at 10) | none |
| `ceiling` | the voice enters the mix at 255/256, and the sum is clipped at ±32767 before `volume` (read) | flat tops at 32639 × `volume` and no sample over `round(32767 × volume)` (measured: 4895 to 4896 under a ceiling of 4915 at `volume 0.15`; exactly 16320 at 0.5) | one 16-bit step (measured). A system mixer that limits the tops, or game sound under the voice, moves it; the page says how to tell |
| `clock` | the game drops one sample from every packet (read), so its playback gains on the source | the take runs ahead of the page's render by about the packets a second over 44100 (measured: 404 to 406 parts in a million on most takes and 505 on the one with 22.3 packets a second, finding 24; the table of `docs/ACCURACY.md` has +397 to +416 on the plain takes and +510 on that one) | the table's range; outside it the page asks for the packets a second from the `queue` log |
| `demo` | Steam's packets are 20 ms Opus frames in hybrid mode at 24000 Hz (measured) | every frame of that kind; one-byte frames where the encoder sent none; the frame number back at 0 after every end marker (measured: 5,109 frames, 693 of one byte, 20 of 20 phrases) | none on the kind and the numbering; the counts are the stranger's own |

## 4. The script

One command, `node tests/reproduce.mjs <check> <file>...`, with the stranger's own files, prints the figures of
section 3 and "as expected" or "differs" beside each. `node tests/reproduce.mjs` alone lists the checks.

| Check | The stranger's files | Runs in | Reuses |
| --- | --- | --- | --- |
| `inputs` | none | Node | a seeded generator of its own |
| `hold`, `gate` | Steam's console text, with `--uptime` for `hold` | Node | `TF2SteamSender.createSender` through its `clock` option (`steam-sender.js`), as W3-16's second read did; a reader of Steam's chunk line, which no file of the repository has yet |
| `queue` | the game's console log, with `--fps` | Node | `logToFixture` (`tests/voicequeue/log-to-fixture.mjs`), the replay of `tests/voice-channel.verify.mjs` (`replayFixture`, moved to a file both can load), `vendor/swresample/swresample.js` for the counts |
| `gain` | two `voice_decompressed.wav` | Node | `exactCheck` of `tests/gain-exact.mjs`, given its two files by path |
| `celt`, `speex` | `voice_decompressed.wav`, with the input the stranger gave the game or the `voice_micdata.wav` the game wrote | Node | the bundled codecs through `opus-codec.mjs`, by the method of W3-08's report ("Expected, exactly"); for `speex` the render with the gain's output taken at `onGain`, as the record's runs did |
| `ceiling` | a WAV of the PC's output, with `--volume` | Node | `TF2Reference.clampLevel` (`reference.js`) |
| `clock` | a WAV of the PC's output and the source that was played | Node, or the site's real-take check | `TF2Reference.track` and `tests/lib/engine.cjs`, as `tests/reference.verify.mjs` loads them |
| `demo` | a SourceTV demo | Node | `demo.js`; counts only, none of the header's fields |

- **What a stranger installs:** Node 22 or later and a copy of the repository (a clone or the ZIP). No package:
  `node tests/gain-exact.mjs --synthetic` runs in a tree with no installed packages (measured 2026-11-13). The
  suites' Chromium is not needed for any check. For a recording that is not a WAV, the site's real-take check
  reads it in the browser and its status line gives the clock.
- **Nothing leaves the PC.** The script and every file under `tests/reproduce/` open no network connection. Two
  checks hold it: the suite reads their text for a network module or a `fetch(`, and it runs every check on its
  stand-in in a child process whose `net`, `dns`, `dgram` and `fetch` are replaced by functions that record a call
  and throw, and none may be recorded.
- **The output is safe to post.** It holds figures and the script's own words: no line of a file it was given, no
  path, no file name, no player name, SteamID, address or map. A file is named by its place among the arguments.
  An error message quotes nothing either, as `log-to-fixture.mjs` already does. The suite holds it: each stand-in
  carries marker strings where a private detail would be (a made-up name in a log line, a marked folder and file
  name, the synthetic demo's header and its universe-0 SteamID), and no marker may appear in what a check prints,
  passing or failing.

## 5. What proves the page before a stranger tries it

- **In the suite `reproduce`** (`tests/reproduce.verify.mjs`, group `units`): for each check the suite makes a
  stand-in file, runs the script on it and expects "as expected" with the figures; then it breaks the stand-in
  once (one sample changed, one verdict flipped, one tick's queue off by a sample, the uptime of another row, a
  top one step high) and expects "differs". `tests/gain-exact.mjs --synthetic` is the pattern. The stand-in of
  `clock` is a render with `timeline: 'game'` against the default render.
- **What a stand-in cannot prove.** A stand-in is made by the code it then checks, so it proves the script's
  reading, counting and verdicts, not that its alignment is the game's (the two samples the game's reader skips,
  the codec's delay, Steam's line as printed). That is proved by the orchestrator's private run (part e), which
  is a comparison with the figures below, and after publication by the suite on the published files (part f).
  Until a check has passed one of the two, its section of the page says "not yet run on a recording of the game".
- **The orchestrator's private runs, and the figures the record already has:**

| Check | On | The record's figure (measured) |
| --- | --- | --- |
| `hold` | Set J's log at its uptime of 23.9 days; Set L's log at 4.8 minutes | 12 of 12 and 18 of 18; with the other's uptime 8 of 12 and 7.5 of 18 on average |
| `gate` | Set J's two logs; Set L's microphone run | 789 of 789 lines, one line of one sample apart; 590 of 590 |
| `queue` | Set G's logs | 9,808 of 9,808 ticks; 7, 10 and 30 lines; 2,372 of 2,372 counts as one stream |
| `gain` | Set H, `vaudio_celt` at `voice_maxgain` 1 and 10 | 0 of 291,840 differ |
| `celt` | Set H's three recordings | 292,351 of 292,352; 292,789 of 292,864 |
| `speex` | Sets M and O | Set O 145,966 of 145,966 twice; Set M 145,840 of 145,840 and 145,966 of 145,966 |
| `ceiling` | Set B's takes; Set K's retake at `volume 0.5` | 4895 to 4896 under 4915; 16320 |
| `clock` | Set B's three plain takes of the test signal, its `voice_maxgain 1` take, and Set D's sender take | +403 to +405 parts in a million; +510 on the `voice_maxgain 1` take (the table of `docs/ACCURACY.md`) |
| `demo` | Set D's demo | 5,109 frames, 693 of one byte, 20 phrases, 1,816 messages |

  A count that differs from this table is a finding for the record before the page is linked from anywhere.
- **Whom to hand it first.** The owner will ask someone to check one finding on another PC. Hand that person
  `hold`, on a Steam started that day: it needs Steam's console and one generated file and no recorder, it is the
  finding the owner's plan names, and the run on a young Steam takes minutes. If that person's Steam has run for
  a week or more, they run it once before the restart as well, and the two runs then show the uptime's effect.
  The other candidate is `celt` with `gain`: it depends on no clock and should pass on any PC, and it says
  nothing about the modern path.

## 6. The files behind the findings marked "read"

### The table, and where it lives

A section "The files that were read", in `tests/REFERENCE_2026.md` under "What was read", since a figure's
evidence lives only there. One row a file, with an id (`F1` and up) that never changes once given:

| Column | Holds | From |
| --- | --- | --- |
| Id | `F1`, `F2` and so on | the builder |
| File | its name as shipped | the reports |
| From | which game or which Steam folder, 64 or 32 bit; or which public package of Valve's | the reports |
| Build, as its owner can read it | the game's `version` console line, Steam's "About Steam" build date, or the file's version in its properties | the orchestrator |
| Built | the file's own build date, where a report gives one | the reports |
| Taken | the date the copy that was read was taken from the install or downloaded | the orchestrator |
| SHA-256 | 64 hex digits, or `not kept` with the reason in words | the reports where they give one; else the orchestrator |
| Read for | the findings, by number | the builder, from the record |
| Report | the report that read it | the builder |

**How a finding points to its row.** The table "What was read" gains a column of ids, and the new section ends
with one line a finding: its number and its ids. The text of the findings is not edited. `docs/FINDINGS.md` gains
one sentence under its own table of readings that points to the section.

**Only names, builds, dates and hashes go in.** No bytes, no instruction text, no listing, no address or offset,
no table copied out. The suite `recordings` holds that on the section's text: every cell of the hash column is 64
lowercase hex digits or `not kept` with words; no cell is empty; nothing in the section looks like an address
(`0x` and four or more hex digits); and no cell is longer than a name, a date, a build line or a hash needs. While
the section's status line says "the orchestrator's cells are pending", cells that are the orchestrator's may hold
`pending`, and the check that none is left prints a skip line; once the line says "filled", `pending` fails.

**What a reader can then do.** A reader whose file has the same SHA-256 holds the bytes the finding was read
from, and can look for the same rule with a disassembler and the report's account of it. A reader with a later
build should expect another hash: the game and Steam update, a different hash is not a refutation, and the checks
of `docs/REPRODUCE.md` say whether the behaviour is still the same.

### The findings marked "read", and their files

Several reports already give a file's name, build date and SHA-256 (W3-03, W3-07, W3-09, W3-15, W3-16's read).
The builder takes those cells from the reports; the orchestrator compares each with the private record in part e.

| Id | File, as the record or its reports name it | From | Read for (findings) | In the public record today |
| --- | --- | --- | --- | --- |
| F1 | `bin/x64/engine.dll` | the owner's TF2, 64-bit | 2, 4, 8, 9, 10, 14, 21 to 27, 29 (what the game takes of a message), 30, 31, 32 | built 2026-10-05; SHA-256 (W3-03) |
| F2 | `bin/x64/vaudio_celt.dll` | the same | 31 | built 2026-09-30; SHA-256 (W3-03) |
| F3 | a second `vaudio_celt` module | another Source game; which one is not stated | 31 | nothing |
| F4 | `steamclient64.dll` | the owner's Steam | 5, 11, 12, 16, 27, 28, 29 | built 2026-10-13; SHA-256 (W3-09) |
| F5 | `steamclient64.dll` | Valve's public client package | 28 (the same constants) | built 2026-10-21; SHA-256 (W3-09) |
| F6 | `tier0_s64.dll` | the same package; the owner's own copy was not read | 28 (where the clock counts from) | built 2026-10-21; SHA-256 (W3-16's read) |
| F7 | `video64.dll` | the same package | 29 (the resampler object) | SHA-256 (W3-09); no build date |
| F8 | `libswresample-6.dll` | Valve's public codec package | 29 (the resampler's defaults; FFmpeg 8.1.2) | SHA-256 (W3-09) |
| F9 | `linux64/steamclient.so` | Valve's public Linux package | 16, 28 (the libopus string) | SHA-256 (W3-09) |
| F10 | `vaudio_speex.dll` | another Source game, 32-bit, supplied by the owner | 31 | built 2026-05-20; SHA-256 (W3-09) |
| F11 | TF2's own `vaudio_speex` module | the owner's TF2, 32-bit | 31 (run, Set O) | "50 bytes of code apart" from F10; no hash |
| F12 | TF2's 32-bit engine | the owner's TF2, 32-bit; the game reported build 11191711 | 31 (the four codec names) | file name not stated; no date, no hash |
| F13 | `vaudio_miles.dll` (never a TF2 codec) | the owner's TF2, 32-bit | 31 | built 2024-01-17; no hash |
| F14 | the Miles files beside it (`mssvoice.asi`, `Mss32.dll`) | the same | 31 | no date, no hash |
| F15, F16 | the engines of Source SDK Base 2006 and 2007 | the owner's installs | 24, 31 | built 2009-12-04 and 2010-02-01; file names not stated; no hash |
| F17, F18 | their `vaudio_miles` wrappers, with the plug-in (Miles 6.6a) | the same | 31 | built 2006-05-22 and 2008-07-11; file names not stated; no hash |
| F19 | `client.dll` | the owner's TF2, 64-bit | 32 (its strings only) | the SHA-256's first 8 digits (W3-15) |
| F20 | `GameUI.dll` | the owner's TF2 | 32 (the menu option that turns the room off) | no date, no hash |
| F21 | `scripts/dsp_presets.txt` | the game's own archive | 30, 32 | 46,419 bytes and a CRC-32 (W3-15, W3-17's order); no SHA-256 |
| F22 | `scripts/soundmixers.txt` | the same | 30 (the two-speaker level), 32 | no hash |
| F23 | the 40 `scripts/soundscapes*.txt` | the same | 32 | no hash; one row, with the SHA-256 of the sorted list of their names and hashes |

Not rows, and said so under the table: Valve's public SDK, which is source and is cited by its commit; the public
sources of libopus, CELT, Speex and FFmpeg; `XAudio2_7.dll`, whose conversion is measured and not read; and
W3-14, which opened no file. Findings 1, 3, 6, 7, 13, 15, 17, 18, 19 and 20 rest on no reading of their own.

**File not stated, for the orchestrator to settle:** F3 (which game, which bitness), F12 and F15 to F18 (the
files' names), and the reads of finding 8 that the record cites as "the plan, reads 1, 2, 4 and 7"
(`docs/reports/bad-connections-plan.md` names F1 and F4 for its addresses, not for each read).

## 7. Which recordings are published, and how

The decision in force is the one of 2026-11-12. Publishing cannot be undone, so a doubt leaves a file out.

### The rule that decides a file

A file may be published only if all three hold, and a reviewer can apply them to the manifest's row without
hearing the file:

1. **Its input was made by a script in this repository.** The row names the script and the SHA-256 of the input
   it makes, and that SHA-256 is the private input's.
2. **Its content is only what the voice path made of that input.** It is a file the game wrote with
   `voice_recordtofile` (`voice_decompressed.wav`, or the `voice_micdata.wav` beside it under an engine codec), or
   the input itself. Those hold the decoder's output or the capture, and nothing else: they are taken before the
   mixer (read, finding 27).
3. **It is not on the never-published list.** Sets A, E and G; the owner's speech and the two takes of it; Set D's
   demo and its second PC's recording; every console log, demo, packet dump, screenshot and configuration. The
   suite holds the record's SHA-256 of each such file that the record gives, and fails on a row that names one.

Rule 1 is not met today by any file-input set. The scripts that made the inputs of Sets H, I, J, K, M and O are
not in this repository (`tests/testsignal/` makes three other signals), and the record calls Set J's two clips
"speech". Part e moves each script in, and a set whose input no script of ours makes, or whose input holds a
voice, stays out (section 13).

### The hard case: the recordings of the PC's sound output

Sets B, C, D and F and Set K's device files hold the game's own sound under the voice: the map's ambience, at
about −30 dB against the voice in Set B and near −35 dBFS in Set D's sender take (measured), and it is the only
sound between two phrases. That sound is Valve's, and the hard rule is to carry none of Valve's art.

| Course | What a stranger gets | What it costs |
| --- | --- | --- |
| (a) only the files of rule 2 | the checks to the sample, run in public: the CELT build, the gain and Speex against the game's own decoded voice | nothing of the mixer, the output stage or a room; the table of `docs/ACCURACY.md` stays measured on private takes |
| (b) the device recordings of the synthetic signals as well | the sound a listener hears; the rows of that table for Sets B, C, D's sender and F, run by anyone | Valve's ambience goes out with them, about 85 to 105 MB of it (computed from the inventory), and cannot be taken back |

**Recommended: (a).** The rule on Valve's art does not turn on level, so a quiet ambience is still Valve's.

For (b), a device file passes only if no sample of it holds game sound. The orchestrator can measure that: in
every stretch between two phrases, after the room's tail, the samples are digital zero, and under a voice the
other sound was at zero. No take of Sets B, C, D or F can pass: they were made at the game's default, where other
sound falls to half under a voice and returns after it (read, finding 30). The two retakes of Set K made with
`voice_overdrive 1000` have other sound at exactly zero under a voice from about 0.65 s after it starts
(measured), so a cut of them that keeps only those stretches could pass, if the measurement shows it. The page
would say of such a file: "A recording of a PC's sound output, cut to the stretches where a voice was playing;
the game's other sound was at zero there, and the cut's sample positions are in the manifest." A cut file is not
the file a row of `docs/ACCURACY.md` was measured on. That table goes public only by takes made again with no
other sound in them, which is the owner's to make and not this order.

### Where the files live

**Recommended: assets of one release on GitHub, not files of the repository.** The repository keeps the manifest.

| | Release assets | In the repository (`tests/recordings/`) |
| --- | --- | --- |
| Size | course (a) is about 8 MB plus Set K's seven files, under 30 MB in all (computed from the inventory) | the same, added to a working tree of 12 MB (measured), and kept by the history for good |
| The site | untouched: no file of the site changes, `sw.js` and its number stay | the root is the site, so GitHub Pages would serve every file; `sw.js` stays, since the page loads none |
| Taking a file back | the asset is deleted; copies already fetched remain | the history is rewritten, which this repository has done once and should not do again |
| CI | a download of under 30 MB with each hash checked, a few seconds | none |

**The release's name.** Its tag is `recordings-1`, and a later set would be `recordings-2`. A tag that begins
`recordings-` holds data only: it points at the commit that added the manifest's rows, its text opens "Recordings
only. This tag marks no state of the app.", and it is created as a pre-release so that it never shows as the
latest release. A release of the modern path (point (2), not this order) takes a name of another kind. The
documents call it "the recordings release", never a version.

The three test signals as played are not in it: their scripts and checksums are public and the page of this order
does not use them. Adding them would cost 50 to 65 MB as WAV (computed from the inventory).

### What is done to a file before it goes out, and who does it

The orchestrator, in part e, for each file. A builder has no access to the recordings; part d gives the
orchestrator the tool `tests/recordings/inspect.mjs`, tested on files the suite makes.

1. **The checksum.** `sha256sum` of the private file against the record's, where the record has one (Sets B, C,
   D and F have; Sets H to O have none, and the manifest then holds the private file's SHA-256 as measured).
2. **Every header and tag, read and listed.** `node tests/recordings/inspect.mjs <file>` prints, for a WAV, every
   chunk with its size and names any `LIST`/`INFO`, `bext`, `iXML`, `cart` or `id3 ` chunk; for a FLAC, the
   STREAMINFO fields and every other block by kind (VORBIS_COMMENT with its vendor string and the names of its
   comments, PICTURE, APPLICATION, CUESHEET, SEEKTABLE, PADDING). The orchestrator reads the values privately;
   the report lists kinds and names only.
3. **A rewrite that keeps the samples and drops everything but the format.** Both commands were tried on
   2026-11-13 with FFmpeg 6.1.1 on files made for the purpose: the decoded samples came out equal, and two runs
   gave the same bytes.
   - WAV: `ffmpeg -nostdin -i IN.wav -map 0:a:0 -map_metadata -1 -fflags +bitexact -flags:a +bitexact -c:a pcm_s16le OUT.wav`.
     It leaves a 44-byte header with a `fmt ` and a `data` chunk.
   - FLAC (course (b) only): `ffmpeg -nostdin -i IN.flac -map 0:a:0 -map_metadata -1 -map_chapters -1 -fflags +bitexact -flags:a +bitexact -c:a flac -compression_level 8 OUT.flac`.
     It leaves STREAMINFO, an empty comment block whose vendor string is `ffmpeg`, and padding of zeros; a file
     streamed with no length in its header, as Set F's are, gets its length.
4. **The samples, checked.** The SHA-256 of the decoded PCM of IN and of OUT must be equal:
   `ffmpeg -nostdin -loglevel error -i FILE -map 0:a:0 -f s16le -c:a pcm_s16le - | sha256sum` (`s24le` and
   `pcm_s24le` for a 24-bit file). Then `inspect.mjs` on OUT must list only the blocks named in step 3.
5. **The name.** `set-<letter>_<what>_<settings>.<ext>`, lower case, from the manifest: for example
   `set-h_vaudio-celt_maxgain-1.wav`. No upload prefix, no date, no name the owner gave a file.
6. **The orchestrator reads each OUT's header once more** before the push, as the decision of 2026-11-12 asks.

### The manifest

`tests/recordings/manifest.json`, a file of its own beside `tests/accuracy.takes.json`. That file lists takes by
the names of private files and with the settings of renders, for one tool; the published set is other sets (H to
O) and holds inputs too. One row a published file:

`name`; `set`; `kind` (`input`, `decoded voice`, `capture`); `input` (`script`, `sha256`); `made_with` (the game
and whether 64 or 32 bit, the codec, `voice_maxgain`, and any other setting that was changed); `format` (rate,
channels, bits, samples); `bytes`; `sha256` (the file as published); `pcm_sha256` (its decoded PCM, by the command
of step 4); `private_sha256` (the file it was made from); `findings`; `used_by` (the checks of
`tests/reproduce.mjs`, the suites, or the rows of `docs/ACCURACY.md` that use it). The file's head holds the
release's tag and the address its assets are fetched from.

The suite `recordings` holds the frame: every field present, each hash 64 lowercase hex digits, the name of the
form above, `kind` one of the three, `input.script` a file of the repository, no `private_sha256` on the
never-published list, and for a row of Sets B, C, D or F a `private_sha256` that is one of the record's for a
take of a synthetic signal. With no rows the frame's checks pass and the suite says the release is not made yet.

### What then becomes checkable in public

- **Wired by this order (part f):** `node tests/recordings/fetch.mjs` fetches the manifest's files into
  `tests/recordings/files/` (ignored by git) and checks `sha256` and `pcm_sha256`; the suite `reproduce` then runs
  `celt`, `gain` and `speex` on them and expects the record's counts of section 5. CI's `units` job runs the
  fetch before the runner and sets `TF2VE_RECORDINGS=required`, so a file that is missing fails there. Cost: a
  download of under 30 MB and a few seconds of the bundled codecs (estimated; part f measures it).
- **Left to a later order:** `tests/accuracy.mjs` on published takes in CI. It needs Chromium and device
  recordings, so it has nothing to run on under course (a).
- **No recorded hash moves.** The suites that hold recorded hashes are not touched.

## 8. The words that change

All of these are made in the commit of part e that adds the manifest's rows, by the orchestrator, since each
becomes true only then. Part d writes them out in its report for the orchestrator to apply.

**`CLAUDE.md`, the sentence under "Commands".** Today: "`tests/accuracy.mjs` and `tests/retiming.mjs` need the
owner's recordings, which are not in this repository: they are in a private one a session can attach
(`docs/PROGRESS.json`, `takes`, says how to point the tests at it). Nothing from it is ever copied here." To:

> `tests/accuracy.mjs` and `tests/retiming.mjs` need the owner's recordings, which are not in this repository:
> they are in a private one a session can attach (`docs/PROGRESS.json`, `takes`, says how to point the tests at
> it). Nothing from it is copied here. The one way out of it is the recordings release: the files that
> `tests/recordings/manifest.json` lists, published by the orchestrator as the hard rule below says.

**`CLAUDE.md`, the opening hard rule.** To:

> - Never commit the owner's recordings, demos, packet dumps, console logs, speech or music, and never publish
>   them anywhere else. Public are the synthetic signals and fixtures made by the tests, and the recordings that
>   `tests/recordings/manifest.json` lists: files the game or Steam wrote from a signal that a script in this
>   repository makes, holding only what the voice path made of that signal, each with its metadata removed and its
>   header read by the orchestrator before it went out. They are assets of the recordings release, not files of
>   the repository. A file joins that list only through an order that names it and by the orchestrator's own push;
>   a doubt about a file leaves it out. [The recordings hold the owner's voice, copyrighted music, SteamIDs and the
>   game's own sound. On 2026-11-12 the owner left the game's recordings of the project's synthetic signals to the
>   orchestrator ("Do what you think is best"), who published the files on that list and nothing else. Publishing
>   cannot be undone.]

The old wording forbade a commit and said nothing of a release; the new one closes that. It adds console logs to
the list. Under course (b) or files in the repository, the two middle sentences change and nothing else.

| File | The line today | What it becomes |
| --- | --- | --- |
| `tests/REFERENCE_2026.md`, the head | "No recording, source music or derived audio is distributed with this project. The exceptions are the synthetic test signals" and "stay private; only numbers measured from them are written here" | the exceptions gain the recordings of the manifest, by set; a sentence marked *Corrected by RP-01 (date)* where it stands |
| the same, Sets M and O | "The recordings are private; only numbers are here." | marked corrected, with the manifest's names, for the files that went out |
| the same, Sets H, I and J | no checksum | each published file's row of the manifest named |
| `docs/ACCURACY.md`, its opening | "the recordings are private: only numbers from them are here" | the recordings are private but for those of the manifest, which the checks of `docs/REPRODUCE.md` run on |
| `docs/FINDINGS.md`, "How to read it" | "The recordings are private, and only numbers from them are given." | the same change |
| `README.md`, "Tests" | "The owner's recordings are private, so the checks that need them are run privately and reported as numbers." | the checks on the published files run in CI; the rest as before |
| `tests/README.md`, "Tools that need the owner's recordings" | "These are outside CI. The recordings, demos and logs they read are not in this repository and never go into it" | the tools stay outside CI; the published files are fetched, not committed |
| `docs/owner-runs.md`, its opening | "What comes back is private" | the same, but for what a later order names in the manifest |
| `docs/PROGRESS.json`, `takes` (the orchestrator's) | says the takes are in the private repository only | adds: which files are in the recordings release, and that the manifest is the list |

## 9. The parts

Each part merges alone and is useful alone. Parts a and d share no file and may be built side by side; b and c
follow a; e follows a to d; f follows e.

| Part | Whose | What | Budget |
| --- | --- | --- | --- |
| RP-01a | a builder | the script's frame, `inputs`, `gain`, `celt`, `speex`; the suite `reproduce`; the page with those sections and its three links | 8 hours |
| RP-01b | a builder | `gate`, `hold`, `queue`; their sections; the page then opens with `hold` | 10 hours |
| RP-01c | a builder | `ceiling`, `clock`, `demo`; their sections; the steps-only entries and "With a server" | 6 hours |
| RP-01d | a builder | the frame of section 6's table with every cell the public record gives; the manifest's frame; `inspect.mjs`; the suite `recordings`; section 8's words, written out in the report | 6 hours |
| RP-01e | the orchestrator alone | every step that touches a private file or the private record: the table's cells; the private runs of section 5; the input scripts moved in; section 7's steps for each file; the manifest's rows; the release; section 8's edits; PROGRESS | not a builder's |
| RP-01f | a builder | `fetch.mjs`; the suite on the published files; CI's step; the page's "not yet run" marks removed where a check passed | 3 hours |

At its budget a builder stops, pushes what passes and reports what is left.

**No builder step needs a private file.** Where a check wants a published recording that is not there, the suite
prints a skip line and passes, in the form `tests/room-dsp.verify.mjs` uses (`  skip  <what>: <why>`); the tools
that need the takes stay outside CI as `tests/README.md` lists them. From part f on, CI sets
`TF2VE_RECORDINGS=required` and the skip becomes a failure there.

### Files

| Part | May touch | May not touch |
| --- | --- | --- |
| a | new: `tests/reproduce.mjs`, `tests/reproduce/`, `tests/reproduce.verify.mjs`, `docs/REPRODUCE.md`. Changed: `tests/run.mjs` and `tests/README.md` (the suite's row), `tests/gain-exact.mjs` (its check given two paths; the `--synthetic` output unchanged), `README.md`, `docs/FINDINGS.md` and `docs/README.md` (one link each) | everything else |
| b | the files of part a; `tests/voice-channel.verify.mjs` and a new file under `tests/voicequeue/` (the replay moved so both load it; the suite's output unchanged) | everything else |
| c | the files of part a | everything else |
| d | new: `tests/recordings/manifest.json`, `tests/recordings/inspect.mjs`, `tests/recordings.verify.mjs`. Changed: `tests/REFERENCE_2026.md` (the new section, the ids' column and one sentence; no other line), `docs/FINDINGS.md` (one sentence), `tests/run.mjs`, `tests/README.md`, `.gitignore` (`tests/recordings/files/`) | everything else |
| f | new: `tests/recordings/fetch.mjs`. Changed: `tests/reproduce.verify.mjs`, `.github/workflows/test.yml` (one step and one variable in the `units` job), `docs/REPRODUCE.md`, `tests/README.md` | everything else |

For every builder: no file under `engine/`, no file the site loads, no codec module, `sw.js` not at all (its
number is the orchestrator's, and no part changes a file it lists), `CLAUDE.md`, `docs/PROGRESS.json`,
`docs/PROGRESS-LOG.md`, `tests/predictions/`, and no recorded hash in any suite.

### Done means

Each line is a command a builder runs and a reviewer can break. All parts: `node tests/run.mjs site harness`
passes, and `node tests/cache-number.mjs origin/main --report` says the number stays.

**RP-01a.**
1. `node tests/run.mjs reproduce` passes, and `node tests/reproduce.mjs` lists the checks.
2. `node tests/reproduce.mjs inputs <folder>` writes the three signals with the SHA-256 the suite pins, on the
   builder's machine and on CI.
3. For `gain`, `celt` and `speex`: on its stand-in the script prints "as expected", and on the stand-in with one
   sample changed it prints "differs" and exits other than 0. The report shows both outputs.
4. The suite's two network checks and its marker check (section 4) pass, and each fails when the builder adds a
   `fetch(` to a file under `tests/reproduce/`, opens a socket in a check, or prints a file name.
5. `node tests/gain-exact.mjs --synthetic` prints what it printed before.
6. Every figure on the page is the record's, with its standing and the finding's number; the report lists each
   with the line of the record it was copied from.
7. `node tests/miles.verify.mjs` passes (it reads `README.md`).

**RP-01b.** Points 1, 3, 4 and 6 of part a for `gate`, `hold` and `queue`, and:
1. `hold` on its stand-in at two uptimes of different rows gives every end at the stand-in's own uptime and
   fewer at the other.
2. `queue` on a log the suite writes gives no mismatching tick and the three waits; with one queue line off by a
   sample it prints "differs".
3. `node tests/run.mjs voice-channel` prints what it printed before.

**RP-01c.** Points 1, 3, 4 and 6 of part a for `ceiling`, `clock` and `demo`, and: `demo` on
`tests/demo/synthetic.dem` prints none of that file's header fields or SteamIDs.

**RP-01d.**
1. `node tests/run.mjs recordings` passes.
2. The table check fails on each of: a hash of 63 digits, an empty cell, a cell holding `0x180058d80`, and
   `pending` left under a status line that says "filled".
3. The manifest check fails on each of: a missing field, a name with a date in it, an `input.script` that is not
   a file, and a `private_sha256` that is the record's for the speech take.
4. `inspect.mjs` names a `LIST` and a `bext` chunk in a WAV, and a comment, a PICTURE and an APPLICATION block in
   a FLAC, on files the suite makes; on a clean file it lists the format's own blocks only.
5. `git diff origin/main -- tests/REFERENCE_2026.md` shows added lines and the one changed table, and no other
   change.

**RP-01f.** `node tests/recordings/fetch.mjs` followed by `TF2VE_RECORDINGS=required node tests/run.mjs reproduce`
passes with the record's counts; with one file removed it fails; without the variable it skips and passes. The
run on the branch's head is green, and the report gives the fetch's size and seconds as measured on CI.

### Stop and ask

- A part seems to need a file under `engine/`, a file the site loads, or a recorded hash to move.
- A figure the page should carry is not in the record in that form, or two places of the record give it
  differently.
- Part b: the layout of Steam's chunk line, or the way to save Steam's console text, is not in the brief
  (section 13); or the phrase ends cannot be made again from a log and an uptime by the method of W3-16's second
  read.
- Part a: `celt` or `speex` needs a fact about the game's files that the reports do not give (where the game's
  reader starts, the codec's delay, what `voice_micdata.wav` holds).
- Part b's packet counts through the resampler's port are the piece to leave out if the budget runs short; the
  report says so.
- Any step that would need a private file, a published file before part e, or a look at how a real log reads.

## 10. What the reviewer attacks

- **Every published path and name** (part e's, by the orchestrator's second read; part d's examples): a personal
  detail, a date, an upload prefix, a name the owner gave a file.
- **The script:** any network call, by text and by running it; any output that could carry a stranger's private
  data into a report they then post, on a passing run and on every error path.
- **Every "expect" figure** on the page against the record: the number, its standing, its finding, its tolerance.
- **The table of section 6:** anything that is not a name, a build, a date or a hash.
- **The rule's wording in section 8:** anything it lets through that the old one kept out.
- **The tests of the tests:** each check of the two suites broken a few ways, as `docs/PIPELINE.md` asks.

## 11. A second reader

None is needed: no part changes how a render is computed, what a constant is or what the evidence is said to
show. Section 6's table adds names, dates and hashes to the record and edits no finding. The plan itself is read
by a different model before part a starts, as `docs/PIPELINE.md` asks of every plan.

## 12. The choices the orchestrator rules on

| Choice | Recommended | The other choice costs |
| --- | --- | --- |
| Where the page lives | `docs/REPRODUCE.md` | a site page: `sw.js`'s list and number, browser checks, a phone layout, a second front |
| What the script runs in | Node alone, with the site's real-take check as a second way for a recording | Chromium: an install of the packages and a browser, for nothing a stranger's check needs |
| The device recordings | course (a): none | course (b): Valve's ambience published for good; or cuts of Set K's two retakes, if measured clean |
| Where the files live | assets of the release `recordings-1` | in the repository: no fetch step, and a history that keeps every file |
| CI on the published files | part f wires `celt`, `gain` and `speex`; `tests/accuracy.mjs` is left to a later order | not wiring it: the page's checks are proved on the game only by private runs |
| The three test signals as played | not in the release | 50 to 65 MB as WAV, for files the scripts already make |
| Reports from strangers | an issue on the repository | another address, which the owner would have to give |
| Whom to hand first | `hold`, on a Steam started that day | `celt` with `gain`: surer to pass, and silent on the modern path |
| `demo` in the script though it is group 3 | in, under "With a server" | out: the page then has nothing for someone who can run a server |
| A numbers-only list of Set J's chunk lengths | not published: the decision of 2026-11-12 covers sound only | without it, Set J's clips and recordings can be heard and not checked to the sample by a stranger |
| Addresses | none in section 6's table | see section 13 |

## 13. What the planner could not settle, and what it needs measured

1. **The inputs of the file-input sets.** For each of Sets H, I, J, K, M and O: which script made the input,
   whether its output is the private input bit for bit, and its SHA-256. For Set J: whether the "speech" of its
   two clips is made by a script or is a voice. Rule 1 of section 7 decides each set on the answers.
2. **Set K's seven decoded-voice files.** The record gives nothing of them: the codec, the input, the settings
   and the size of each.
3. **Steam's chunk line as printed:** its fixed words and the order of its fields, with invented numbers. The
   record describes the fields (finding 27) and not the layout. Also how the owner saved Steam's console text,
   and which of Steam's own logs gives the time Steam started, as steps a stranger can follow.
4. **The game's steps as run.** For Sets H, M and O: the folder `voice_input.wav` went in and the folder the two
   files came out in, each relative to the game's folder; whether any server variable had to be set; and the name
   of the file the game wrote beside `voice_decompressed.wav`. The record has the first two as inferred.
5. **For course (b), if it is weighed:** in Set K's two retakes, the level between phrases and under a voice from
   0.65 s on, in 16-bit steps, and whether it is digital zero.
6. **Addresses.** The brief keeps addresses out of the table, and the table has none. Several reports in
   `docs/reports/` already carry virtual addresses beside what was read, under the hard rule's words "with where
   it was read". Whether those stay is a ruling on the rule, not on this order.
7. **The clock of the `voice_maxgain 1` take.** Finding 24 gives 505 parts in a million and the table of
   `docs/ACCURACY.md` gives +510. The page needs one of them, with the reason for the other.
8. **Whether `inputs` gives the same bytes on every Node.** The planner did not build the generator. Part a pins
   the checksums and CI runs them; a Node whose arithmetic differs would show there.
