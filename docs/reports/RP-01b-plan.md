# RP-01b, the plan pass: `gate` and `queue` are ordered, `hold` is not

A planner's pass of 2026-11-13 on `main` at `695a584`. It wrote
[the order](../work-orders/RP-01b-gate-hold-queue.md), one line in
[the old order](../work-orders/RP-01-reproduce-it.md) and this report. It changed no app code and no test. It read the repository only: no recording, no log, no file
of the owner's install and nothing of the private record.

## The recommendation

Build two of the three: `gate` and `queue`. Each reads one text file that a console writes, each reuses code
that is in the repository, and each has a pass line that an honest run meets. Do not build `hold` now. It stays
on the page as a steps-only entry with the record's figures.

## What was read

`CLAUDE.md`, `docs/PIPELINE.md`, `docs/PROGRESS.json` (the six keys the brief names), the old order whole, the
reports of parts a and c, the script and its frame, three of its checks, the head of the suite, the page,
`docs/FINDINGS.md` entries 1, 2 and 7, the record's Sets G, J, L and N, its findings 22 to 25, 27 and 28, its
entries on the chunk line and on the script's two private runs, `steam-sender.js` whole,
`tests/voicequeue/` whole, the replay and the log writer of `tests/voice-channel.verify.mjs`, W3-14's report
whole, the parts of W3-16's second read on Set J's ends and on the sender's differences from the code, W3-14's
order on `mic_inputfile`, W3-09's report on Steam's console, and `docs/owner-runs.md`.

## What was run, and what it gave

Scratch scripts of the planning run; none is in the repository. Every figure below is computed on the
repository's own code, not measured on the game.

| Run | Result |
| --- | --- |
| `node tests/run.mjs voice-channel` | passes in 82 s. On its own log at 66.67 frames a second the faults "ring + 1" and "ring − 1" mismatch nowhere; on its 300 log all six mismatch (282, 282, 148, 81, 366 and 117 ticks). This run was not put through the lock, which was a slip: it was not known to pass a minute |
| the suite's own log writer (`synthesize`, copied as text), given the second model (`createReferenceChannel`) in place of `createChannel`, at the suite's two seeds | the same logs as from the module (565 lines at 300 frames a second, 468 at 66.67); read by `logToFixture` and replayed through `createChannel`, no mismatching tick of 473 and 377; the six faults' counts equal the module's |
| a console log written from the second model by a writer of the planning run's own, read by `logToFixture`, replayed through `createChannel`; nine logs at 66.67, 100 and 300 frames a second | no mismatching tick in any (871 to 1,128 ticks each). "No grace" mismatches nowhere in eight of the nine. The two ring faults mismatch nowhere in two of the three logs at 66.67. "Wait + 1", "wait − 1" and "sample kept" mismatch in all nine |
| one built sender a chunk, through its clock option, `lead` 0 | a constant chunk of 327 does not open a phrase and one of 328 does; both print a mean of 1.00. A single sample of 4914 does not open and one of 4915 or −4915 does; they print 14.996 and 14.999. With `meanMin` far above any mean only the peak opens |
| the clock option given a chunk of 6000 samples | refused: "the clock's samples must be a whole number from 0 to 2250" |
| every peak from 0 to 32768 printed as a percentage of 32768 to three decimals | each has a print of its own, and the print gives the whole sample back |
| the order's 24 kHz clip, built from its code on Node 22.23.4 | 679,200 samples, 1,358,444 bytes, SHA-256 `3e02aaa585001e562e133aea7985bce4208563e39c00655d153f34b88e873fde` |
| that clip walked as a file input, reads 48.0 to 63.7 ms apart, two passes, three seeds | 1,009 to 1,012 chunk lines; all four kinds of bracket (about 645 quiet, 188 by both rules, 169 by the mean alone, 10 or 11 by the peak alone); 14 or 15 lines print a mean of 1.00; the highest failing mean 0.9994 to 1.0000% and the lowest passing 1.0004 to 1.0005%; the highest peak without the peak mark 4914 and the lowest with it 4915 |
| the sender's verdict against the whole-number form `100 × sum >= 32767 × length`, on 7,118 chunks of the clip's level ramp | no chunk differs |
| a million phrase ends with reads 48.0 to 63.7 ms apart and an exact 0.4 s | the end falls on the 7th read in 23.0%, on the 8th in 77.0%, never on the 9th. A read lies within 0.5 ms of 0.4 s in 2.5% of ends, within 1 ms in 5.0%, within 2 ms in 10.0%, within 4 ms in 19.8%. A run of 18 ends has none within 1 ms in 40% of runs |

## Which figures were seen on a real log, and by what

| Check | Figure | Seen on a real log by this project | By the check's own route |
| --- | --- | --- | --- |
| `gate` | all 789 verdicts follow the rule; print equal to the clip on 788 of 789 lines; 0.9998% and 1.0315% (Set J) | measured, by W3-14's scratch scripts, on the owner's clips | the route with file 2 is that route in repository code; not run on a log yet. On the generated clip nothing was measured: it has not been played into Steam |
| `gate` | 590 of 590 with a microphone (Set L) | measured; the record does not say how a line was judged with no clip | the route with file 1 alone is presumably that; not in the record in that form |
| `gate` | the marks against the printed numbers alone (G1, G2, G3) | not in the record | not run on a log by any code |
| `gate` | one pattern fits 3,358 of 3,358 chunk lines | measured (the orchestrator) | the check's pattern is written from that entry's words, not from a log |
| `queue` | 9,808 of 9,808 ticks; six faults each fail (Set G) | measured, by `logToFixture` and the suite's `--fixture` replay on a private fixture | the same functions |
| `queue` | lines before the queue can fall: 7, 10, and 30, 31 or 32 | measured, by the W3-02 plan's scratch scripts | the check's count is information only; not run on a log |
| `hold` | 18 of 18 and 12 of 12 through the built sender; 5 and 32 of 37; 4, 5 and 3 of 12; the edge at 399.4 to 403.1 ms | measured, by scratch scripts with stand-in chunks and 22 empty reads placed by a rule of their own | no repository code computes any of them |

So the same is to be expected of part b as of part c: the private run is the proof, and it may move a floor or
a tolerance.

## Section 15's sentences on part b, and how the order answers each

| Section 15 says | The order |
| --- | --- |
| `hold` cannot be made from Steam's console alone: the first mark is the chunk's verdict, and the phrase ends were read from the game's log | agreed, and it is the first reason `hold` is not built. The steps-only entry tells the stranger to read the end in the game's packet lines, as the count that is not a multiple of 882. The sentence of `docs/FINDINGS.md`, entry 2, that says the counts show in Steam's console is corrected by the builder |
| the clock option refuses chunks over 2,250 samples where file input gives up to 6,000 | confirmed by a run. `steam-sender.js` is not touched: it is a file the site loads. `gate` does not need the sender to take a long chunk; the stand-in writes its one long chunk, which is silence, by hand |
| the read times have to be rebuilt as W3-14 and the second read did, which no code does | stated in the order under "What happens to `hold`": the rebuilding is a few lines, but with it come the placing of empty reads, a copy of the sender's states that takes long chunks, and the lining up of two logs: about 250 lines (guessed). It is a reason to leave `hold` out, not a piece of a check |
| `gate`'s two figures came from recomputing each chunk from the known clip, and a mean printed to two decimals cannot show them | two routes. With the console text alone the check judges the marks against the printed numbers and counts lines that print 1.00 apart. With the clip as file 2 it recomputes every chunk and prints the exact bracket. The order gives a 24 kHz clip with a level ramp across 1.0% and single samples across 4915 |
| `queue` as written fails on most strangers' logs | the pass line is no mismatching tick; the six faults are printed with their counts and the sentence that 0 means the log cannot tell that fault from the rule. The suite holds a stand-in at 66.67 on which two faults print 0 and the check passes |
| a planner's pass states for each its inputs, the code it reuses and its pass line | done for `gate` and `queue`, with `file:line`. For `hold` the order states the inputs a later check would need (both logs of one press, the clip, the uptime in seconds from 0 to 4,000,000) and does not order it |
| the first thing handed to a stranger is `celt`, `gain` and `speex` | kept. `gate` is the next to hand: one text file, no clock, and the rule was read, so it should hold on any PC that runs the same Steam |
| every check has a floor | each check has a table of refusals: no chunk line, too few, no chunk on each side of 1.0%, no voice line, no channel that played |
| the break tests go outside the tolerances | the breaks are flips of marks, a mean moved by 0.02, a queue line off by one sample where the log can show it; none sits inside a tolerance |
| the stranger's steps gain what a newcomer lacks | how Steam's console is opened, the full path, the working capture device, that the text holds account names, the frame counter, the steady frame rate |

## Open decisions, each with a recommendation

1. **Two checks or three.** Recommended: two. It rests on the four reasons in the order. In short: every form
   of `hold` lines up two logs, which no repository code has done; the part that is the finding's point, the
   dependence on Steam's uptime, needs the rebuilding and the empty reads; and on a Steam started that day 5% of
   ends lie within 1 ms of the threshold, so an honest run would often differ unless a band is fitted, which
   wants real pairs of logs.
2. **When `hold` is ordered.** Recommended: after the owner's key run comes back (`docs/owner-runs.md`), which
   asks for both consoles at two uptimes. If the owner wants the hold handed to someone before that, the reduced
   form in the order (a file as the microphone, a Steam under 18 hours, the 0.4 s edge with a band) is about
   6 hours (guessed) and needs questions H1 to H3 answered first.
3. **`gate` takes any 24 kHz clip as file 2,** not only the generated one. Recommended: yes. It lets the
   orchestrator run the second route on Set J's text with Set J's clips, where the record gives the figures
   to expect. Without it that route cannot be proved on a real log until someone plays the generated clip.
4. **The 24 kHz clip.** Recommended as the order has it. Its content is a choice. One thing for the
   orchestrator: `docs/PROGRESS.json` asks the owner for one take of the modern path from a clip made by a
   script of ours. If that run uses this clip with `@voice_spew_activity_check 1` on, the same press gives
   `gate` a log of the generated clip. Whether tones and single samples are what that take should hold is the
   orchestrator's to weigh.
5. **The packet counts through the resampler's port.** Recommended: left out. The old order named them as the
   piece to drop. A log does not give a silence record's length at 24000 Hz.
6. **The floors and the tolerance** (50 chunk lines, 100 tick lines, one unit of the last printed digit).
   Recommended as written, each marked a choice on the page; the private run may move them.
7. **`docs/FINDINGS.md`, entry 2.** Recommended: the builder corrects the one sentence, since the steps as
   written there cannot be followed.
8. **The order of building.** Recommended: `queue` before `gate`. It is the smaller, and its move of the replay
   touches the suite `voice-channel`, whose output must not move.
9. **The budget.** 8 hours (guessed: `gate` 4, `queue` 2.5, the page, the record's entry and the report 1.5).

## For the orchestrator's private look

Each can be answered by a layout or a count. None asks for a log.

**For `gate`.**

- G1. In the three files with the 3,358 chunk lines: how many lines print a mean of exactly `1.00`, and how
  many of those carry the second mark.
- G2. On all 3,358 lines, four counts: lines whose first mark is set exactly when the second or third is;
  lines whose third mark is set exactly when the count of high samples is above 0; lines whose third mark is
  set exactly when the printed peak is 14.999 or more; lines with a printed mean of 1.01 or more that lack the
  second mark, or of 0.99 or less that carry it.
- G3. Whether the pattern that fits 3,358 lines was held to the line's end. Whether any chunk line carries text
  after its count, or between the stamp and the first bracket.
- G4. The `loaded` and `looped` lines as printed: do they read `loaded voice input file <path>, <N> samples
  (<S> seconds)` and `voice input file <path> looped`, the stamp aside, and how S is printed.
- G5. How the 590 microphone lines were judged to follow the rule. How many of them have a length other than
  31.25, 62.50 or 93.75 ms.
- G6. How many chunk lines are 0.04 ms long, and whether each prints a mean of 0.00 and no mark.
- G7. The encoding and the line ends of `console_log.txt`, and of the copied text as the owner saved it.
  How the path of `mic_inputfile` was typed (quotes, a space in it), how it was set back to nothing, and
  whether Steam's console took two commands on one line.

**For `queue`.**

- Q1. The folder `con_logfile` wrote its log in, relative to the game's folder, and the log's encoding.
- Q2. For each part of Set G as replayed: the frame rate given, and the ticks each of the six faults
  mismatched. The page can then say from a measurement which faults a log at 67 or 100 can show.
- Q3. Whether `logToFixture` reads each of Set G's parts as saved without a stop, and the count of pulls off
  the 512-sample blocks.

**For `hold`, when it is ordered.**

- H1. For Set L's file-input run: is there a game log of the same press. How the 37 ends were counted, and
  which lines an end was read from. How many of the ends had a read within 1 ms of 0.4 s.
- H2. Which of Steam's logs gives the time Steam started, by the file's name and the line's layout with
  invented values.
- H3. On the young Steam with a file as the microphone: the count of chunk lines inside phrases against the
  count of sound packets in the game's log, and what the first packets of the press were.

## What could not be settled

- **Whether Steam prints what the first route assumes.** G1 to G3 answer it. If a real line breaks G1, G2 or
  G3, that figure is cut or changed before the build.
- **Whether the generated clip does in Steam what it does in the walk.** The ramp, the two tones and the single
  samples were only walked on the model. The check's pass does not depend on it: whatever chunks arise, each is
  judged by the rule. What depends on it is whether a stranger's log has chunks on both sides of 1.0%.
- **The clip's bytes on another Node.** It uses `Math.sin`, as the two older clips do. CI is the second Node.
- **The stranger's steps that the record does not hold:** the folder of the game's log, how a path with a
  space is typed in Steam's console, how `mic_inputfile` is cleared. The order plans around each (a folder with
  no space, "or restart Steam", "inferred" on the folder) and the questions above would replace the
  workarounds.
- **How long the suite `reproduce` will take** with the two stand-ins. It takes about 50 s today (RP-01c's
  report); the order says to run it through the lock if it passes a minute.
- **Everything of `hold` beyond the reasons not to build it.** No form of it was specified to the point where
  a builder could start.
