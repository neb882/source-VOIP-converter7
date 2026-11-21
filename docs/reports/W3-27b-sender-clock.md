# W3-27b: the sender's clock switched to the rule as read

The build report for W3-27b of `docs/work-orders/W3-27-sender-clock.md` (read with "The rulings", "After the plan
review" and "W3-27a as built"), branch `claude/w3-27b-sender-clock`, from `main` `7f37d2d` (W3-26b, W3-27a and W3-28
merged). Every figure here is of the model, the app's own code, unless it is quoted from the record. No recording of
the owner's was opened, and no file of the game, of Steam or of Windows.

`node tests/cache-number.mjs origin/main --report`: "cached files changed since origin/main (7f37d2d):
steam-sender.js, voice-channel.js" and "cache number against origin/main (7f37d2d): the number is v57, not above v57:
it must rise (node tests/cache-number.mjs origin/main --set)". The number is the orchestrator's; `sw.js` is not
touched. No file the site loads was added, removed or renamed.

Main did not move while the branch was built (`origin/main` is `7f37d2d` at the end).

## Commits

| Commit | What |
| --- | --- |
| `808cd7a` | the clock switched (`steam-sender.js`), the sender suite rewritten for it, the premises and counts the clock moved in `voice-channel`, `steam` and `render-channel` |
| `4f42c59` | the arrival constant measured and set (`voice-channel.js`, `reference-frames.mjs`), its measurement and pin in `voice-channel`, the pinned values of D in `voice-channel` and `render-channel`, the threshold case's hashes |
| `1dbff2c` | the recorded hashes, in a commit of their own (`render-stream`'s `GOLDEN` and `GAIN_GOLDEN`, `render-channel`'s four tables) |
| `11d910b` | the words (README, VOICE-PATH, ACCURACY, FINDINGS, LIVE, tests/README), the record's dated lines, PREDICTIONS |
| `d6a98df` | the browser suite's rooms' tone |
| this report's commit | the report and the hashes beside it |

They were pushed in three pushes: `808cd7a` with `4f42c59`, `1dbff2c` with `11d910b`, and `d6a98df` with the report.

## What changed

| File | Change |
| --- | --- |
| `steam-sender.js` | `createClock` is the rule as read, the clock W3-27a built as `createReadClock`; that name goes and the exports are the three again (`STEAM_SENDER`, `createClock`, `createSender`). The clock of W3-16 goes with `readMin`, `readMax`, `captureLate`, `seedMix` and `seedMixCapture`. `createSender` is not changed: it makes `createClock({ seed })` and takes its `lead`, and takes a caller's clock as before. The header, `STEAM_SENDER`'s comments and the comment over `createClock` say what runs now, each number's standing, the options and the reference |
| `voice-channel.js` | `ARRIVAL_SECONDS` 0.042 where it was 0.0505, with its comment rewritten (the seeds, the count of spurts, the mean at each frame rate, the date, the 5 ms that is a convention); the values of D in the comments at `zero()` and at `createTimeline` |
| `tests/voicequeue/reference-frames.mjs` | its copy of the constant, 0.042 |
| `tests/steam-sender.verify.mjs` | the rename; the seeded sections recorded again on the rule; `refClock`, the second model's seeded clock, made from the study's generator with the steps, the lead and the phase computed in the suite (W3-27b's check 2); the clock of W3-16 kept only as W3-27a's check 8's break; the frames a message and the hold's ends in bands from the build; W3-27b's check 5 |
| `tests/voice-channel.verify.mjs` | two counts and one premise that the clock moved; the suite's constant, `ARRIVAL_MEASURED` and the pinned values of D; the threshold case's hashes; `--arrival`, the measurement of the constant (W3-27b's check 6) |
| `tests/steam.verify.js` | two premises given another seed |
| `tests/render-channel.verify.mjs` | seed 8's exception dropped; `D`, `LIVE_D` and the model's zero; the recorded hashes of sections 10, 24, 27 and 29 |
| `tests/render-stream.verify.mjs` | `GOLDEN` and `GAIN_GOLDEN` of the 52 cases that moved, with the comment above them |
| `tests/browser.verify.js` | the rooms' tone ([3c4], and [3c5] after it), 0.6 s where it was 0.5 |
| `README.md`, `docs/VOICE-PATH.md`, `docs/ACCURACY.md`, `docs/FINDINGS.md`, `docs/LIVE.md`, `tests/README.md` | the passages of the order's "The words"; README's and ACCURACY's figure of the live monitor on the queue at 300 frames a second |
| `tests/REFERENCE_2026.md` | added, dated lines only: after the study's paragraph of 2026-11-21 ("Built by W3-27"), under "The reads are Set J's", two under W3-21's lines, and one in the Model table's sender cell. Nothing deleted or reworded |
| `tests/predictions/PREDICTIONS.md` | its dated line |
| `docs/reports/W3-27b/` | `hashes-before.txt` (the untouched tree) and `hashes-after.txt` (the branch), from `node tests/render-stream.verify.mjs --hashes` |

Not touched: the engine's files, the page, `sw.js`, `tests/steam-sender/gen.mjs` and its vector,
`tests/predictions/predictions.json`, `docs/PROGRESS.json`, `docs/PROGRESS-LOG.md`, `docs/README.md`, `CLAUDE.md`,
the order. `tests/steam-sender/README.md` still says "The app's `createReadClock`"; the order does not list the file
and it is left as it is (a question below).

## The clock

What runs is the rule of the order's section "The rule", ported by W3-27a and held there to `gen.mjs` to the last bit
at place 0. Nothing of its arithmetic changed in this order: the diff of `steam-sender.js` outside comments is the
removal of the old clock and its five constants and the rename.

- **What the old constants became.** The order says the clock of W3-16 goes with them. They are deleted, and the suite
  checks that they are gone. `phaseSpan` stays: it is the new clock's seventh phase. `MAX_CHUNK` stays
  `3 * grid`; its comment points to `clock.maxSteps`. No second path keeps the old rule; the suite keeps a copy of it
  (`plainClock`) as W3-27a's check 8 had it.
- **The seeded clock at a glance** (the suite's counts, seeds 1 to 20 of 20,000 reads pooled, measured on the model):
  55.52 ms between reads in the mean, 47.55 to 66.67 ms, 18.01 reads a second, chunks of one, two and three steps
  23.94, 74.46 and 1.60%, 16.04% of chunk ends at the favoured place in 8. Seed 1: lead 68, place 1. The default seed
  (the page's render): lead 377, place 4 (it was 49 on W3-16's clock).

## The arrival constant

Measured as "After the plan review" defines it: `offsetStartMs + (D - 44100 x latency) / 44.1` over every opened spurt
of layouts P and Q of `tests/voice-channel.verify.mjs`, seeds 1 to 800, at 300 and at 66.67 frames a second, pooled,
with no `codecDelay` (measured on the model, twice: a scratch tool and the suite's `--arrival`, the same figures to the
fourteenth digit).

| | Spurts | Mean |
| --- | ---: | ---: |
| pooled | 7,319 | 42.144 ms |
| 300 frames a second | 3,319 | 43.10 ms |
| 66.67 | 4,000 | 41.35 ms |
| 300, layout P | 1,600 | 43.45 ms |
| 300, layout Q | 1,719 | 42.77 ms |
| 66.67, layout P | 1,600 | 41.67 ms |
| 66.67, layout Q | 2,400 | 41.14 ms |

The standard error is 0.20 ms taken by seed (0.13 by spurt). The mean of the four cells is 42.26 ms, which would round
to 42.5; the constant is the pooled mean to the half millisecond, **42.0 ms**, as the order has it, so the table of D
in the order stands as computed there. On `main` (W3-16's clock) the same measure gives 51.43 ms over 7,291 spurts
(standard error 0.36 by seed), where the planner had 51.4.

- **Where it lives and its time.** In `tests/voice-channel.verify.mjs` behind a flag:
  `node tests/voice-channel.verify.mjs --arrival` runs it alone, in about four minutes (4 min 29 s of processor time
  in the branch's run, on a machine shared with other agents; the scratch tool took 255 s), and holds it to the
  constant within 0.3 ms and to the figures the suite records (`ARRIVAL_MEASURED`, to 1e-9 ms and spurt for spurt). The default run pins its result: the constant is
  `ARRIVAL_MEASURED`'s mean to the half millisecond and within 0.3 ms of it, and the suite's 50 seeds lie within three
  of their standard errors of it. CI runs the default; the flag is for whoever changes the clock.
- **D at each frame rate of the order's table** (computed by the module; `voice_buffer_ms` 100):

| Frames a second | 10 | 20 | 30 | 50 | 60 | 66.67 | 100 | 144 | 200 | 300 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| D with the codec's look-ahead, before | 9728 | 10240 | 10752 | 12288 | 12800 | 13312 | 15360 | 18944 | 22016 | 24576 |
| at 42.0 ms | 9216 | 9728 | 10752 | 11776 | 12288 | 13312 | 15360 | 18432 | 22016 | 24064 |
| D with no codec delay, before | 9216 | 9728 | 10752 | 11776 | 12800 | 13312 | 15360 | 18432 | 22016 | 24064 |
| at 42.0 ms | 8704 | 9728 | 10240 | 11776 | 12288 | 12800 | 14848 | 17920 | 21504 | 24064 |

## Every pin that moved

Found by running every suite with each check going on after a failure (a scratch copy whose checks print `FAIL` and
go on), first with the clock alone and the constant at 50.5 ms, then with the constant set, before anything was
recorded. "Why" says what moved it.

### With the clock

| Suite: the check | Before | After | Why |
| --- | --- | --- | --- |
| steam-sender: the exports and the constants | four exports; `readMin`, `readMax`, `captureLate`, `seedMix`, `seedMixCapture` | three; those five gone (a check that they are gone, and `createReadClock` with them) | the order |
| steam-sender: seed 1's first ten reads | 0, 1500, 1500, 1500, 750, 1500, 1500, 750, 1500, 1500 samples at 0.018701 to 0.518744 s; phase 0.124762 | 0, 750, 1500, 1500, 1500, 1500, 750, 1500, 1500, 1500 at 0.001072 to 0.518194 s, with what ended each pass; phase 0.055458 | the rule |
| steam-sender: the clock's hash (check 3) | `480ce9b7...843502` | `32ef4221...157130` | the rule |
| steam-sender: the second copy, read for read | W3-16's formula (`plainClock`) | the reference's times with the suite's own steps, lead and phase (`refClock`), with the place drawn | the rule; `plainClock` stays for W3-27a's check 8 |
| steam-sender: chunks 750 / 1500 / 2250 at the default seed | bands 22.8-23.8 / 74.1-75.2 / 1.8-2.3% | 23.84 / 74.65 / 1.51% failed them; W3-27a's check 7 bands take their place | the rule |
| steam-sender: pairs 2-2, 2-1, 1-2, 3-1, 1-3 | W3-16's bands | 51.68, 22.62, 22.64, 1.18, 1.16% failed them; check 7's pairs take their place | the rule |
| steam-sender: frames a message, one endless spurt | 10.3 / 13.0 / 65.2 / 10.0 / 1.4% within 0.6 (one seed) | 10.6 / 13.3 / 65.0 / 9.9 / 1.1% within 0.6 (0.15 for five frames), seeds 1 to 40 pooled (the build gives 10.61 / 13.34 / 65.02 / 9.88 / 1.15) | the rule; pooled, as the share follows the capture's place |
| steam-sender: reads a second | 17.85 to 17.95 | 18.011; check 7's 17.97 to 18.05 | the rule |
| steam-sender: the least and most interval | 48.0 to 63.7 ms | 47.59 and 66.64 ms; check 7's 47.5 and 69 | the rule |
| steam-sender: the hold's ends on the 7th / 8th / 9th chunk | 9 days 24.5-28.5 / 68.8-72.8 / 2.0-3.6%; 4 hours 18-22 / 78-82 / under 0.1; 18 days 11.2-15.2 / 42.3-46.3 / 37.1-41.1, the 10th 2.6-4.2 | 9 days 22.00 / 76.32 / 1.68 in 21.0-23.0 / 75.3-77.3 / 1.2-2.2; 4 hours 10.02 / 89.98 / 0 in 9.0-11.0 / 89.0-91.0 / under 0.1; 18 days 10.97 / 44.37 / 41.27, the 10th 3.39, in 10.0-12.0 / 43.3-45.3 / 40.3-42.3 and 2.8-4.0 | the rule (the order's table under "The hold"); over seeds 1 to 5 each figure moves by 0.15 points at most |
| steam-sender: the default seed's schedule | 50 messages from `[75,0,7]` | 49 messages from `[74,0,7]` | the rule |
| steam-sender: its two spurts | 21551 (104 frames, pre-roll 2400) and 71201 (38, pre-roll 0); 73 chunks; lead 49 | 21973 (101, 2400) and 70123 (40, 1500, from the silent state); 73 chunks; lead 377 | the rule |
| steam-sender: lead 0 | W3-16's schedule came back | the second copy's messages at lead 0: spurts from 20850 (104) and 70500 (40, pre-roll 1500), 72 chunks | the W3-16 schedule is gone with its clock |
| steam-sender: seed 2 at two uptimes | 102 and 40 frames from 21046 and 69946; 105 and 33 from 21046 and 71446 | 105 and 35 from 20828 and 71228; 105 and 36 from 20828 and 71228 | the rule; seed 2 still shows the premise |
| steam-sender: the first message of seeds 2 and 1 | `[71,0,7]` for both | `[71,0,7]` and `[72,0,7]` | the rule |
| steam-sender: spurts the same at both uptimes | the default and seeds 1, 5, 6, 7, 8, 10; not 2, 3, 4, 9 | the default and seeds 4, 5; not 1, 2, 3, 6, 7, 8, 9, 10 | the rule |
| steam-sender: the second copy's messages (seeds 1 to 400), ticks (seeds 1 to 50), one sample at a time (two settings), the gate off (seeds 1 to 50), every sample once, the forced leads | on `plainClock` | on `refClock`; the checks' rules unchanged | the second copy's clock follows the module's |
| steam-sender: through the sender, ticks 3 / 4 / 5 | 0.305 / 0.666 / 0.029 within 0.01 | 0.316 / 0.667 / 0.018 within 0.03 (the order's band), 2 and 6 never | the rule |
| steam-sender: openings of 8 / 6 / 9 frames | 0.790 / 0.165 / 0.045 | 0.783 / 0.195 / 0.023 (the order's prototype: the same) | the rule |
| steam-sender: silence records of 750 / 1500 / 2250 | 0.210 / 0.758 / 0.033 | 0.205 / 0.778 / 0.018 | the rule |
| steam-sender: messages a second | 17.90 within 0.01 | 18.01 within 0.02 | the rule |
| steam-sender: the lead's formula | `(750 - round(c0 x 24000)) mod 750` | `floor(750 x` the sixth draw of P`)` | the order |
| steam-sender: a spurt that opens in the first step | lead 749, seed 1: start -3149 | lead 600, seed 1: start -3000, the source from the spurt's second message | a premise: the rule's first chunk is one step (seeds 1 to 20), so with lead 749 it holds one sample of the source, a zero |
| steam-sender: W3-21's burst (check 4) | 199 of 200 with 33 steps; 80.04 and 78.50 frames | 199 of 200; 79.85 and 78.15 frames (W3-21's bounds unchanged) | the rule |
| voice-channel: a spurt that starts before sample 0 | seed 4, lead 599: -2999, -5511 at 44.1 kHz | seed 1, lead 68: -2468, -4535 | a premise: seed 4's lead is 550, and its first step, one step long, stays under the gate |
| voice-channel: after 500 ms a spurt of its own | 35 of 50 seeds | 39 of 50 (starting -22.6 to +9.3 ms, inside the bound of -46 to +35) | the rule |
| voice-channel: spurts opened at 300 fps, layouts P and Q, seeds 1 to 50 (the zero's check, and the same with the codec's delay) | 206 | 204 | the rule |
| voice-channel: the zero's two checks | the mean within 3 standard errors | -9.03 ms with the grid out; moved back by the constant | the constant follows the clock |
| steam: laying, two spurts that meet | seed 10 | seed 5 | a premise: seed 10's spurts no longer meet |
| steam: k frames lost give k concealed | seed 4 | seed 1 | a premise: seed 4's messages hold no stretch of more than ten frames before one of two or fewer |
| render-channel: seed 8's gain reset | appended 0 for seed 8, 1 for the others | appended 1 for every seed | seed 8 appends a spurt as every seed does |
| render-channel: the live chain's samples on no timeline and 'source' (section 10), the render at 66.67 by hashes (24), a source that ends in silence (29) | recorded hashes | recorded again (below) | they run the seeded sender |
| render-stream and stages: the recorded hashes | 52 cases | recorded again (below) | they run the seeded sender |

The browser suite passed whole on the clock alone, with no line changed, and lost one premise with the constant (below).

### With the constant

| Suite: the check | Before | After | Why |
| --- | --- | --- | --- |
| voice-channel: D on the grid, no codecDelay | 13312, 15360, 24064 at 66.67, 100, 300 | 12800, 14848, 24064 | D |
| voice-channel: D with the codec's look-ahead | 13312, 15360, 24576 | 13312, 15360, 24064 | D |
| voice-channel: the exported zero | 13,312, 15,360, 24,576 | 13,312, 15,360, 24,064 | D |
| voice-channel: the threshold of the frame clock by hashes | `03861aa5...eaa981`, `0a5b49c7...977de24` | `a9815b87...ef0c6b4`, `e7b68f27...923af81f` | made-up messages on the game's timeline: no sender, the model's zero (12800 at 66.67 with no codec delay, 13312 before). The plan review's exception |
| voice-channel: the constant (new) | | 42.0 ms, the recorded mean to the half millisecond | check 6 |
| reference-frames.mjs's copy of the constant | 0.0505 | 0.042 | without it the frame clock's checks of voice-channel fail |
| render-channel: `D` | 24576 at 300 | 24064 | D |
| render-channel: `LIVE_D` | 9728, 10240, 12288, 12800, 24576 at 10, 20, 50, 60, 300 | 9216, 9728, 11776, 12288, 24064 (30, 66.67, 100 unchanged) | D; `LIVE_HOLD` follows by its formula |
| render-channel: steamChannel's zero without `zeroSamples` | 24,576 | 24,064 | D |
| render-channel: onOpen's indices on the even clock (section 27) | the 300 fps rows' hashes | recorded again; the 66.67 rows unchanged | made-up traffic: no sender, the model's zero. The plan review's exception |
| render-channel: section 29 at 300 and 60 | (already moved with the clock) | recorded once, with both | the seeded sender and D |
| render-stream: the six cases on the game's timeline at 300 fps | (already moved with the clock) | recorded once, with both | the seeded sender and D (24576 to 24064) |
| browser: [3c4] a render with each group's first room "plays and downloads with its tail", and [3c5] "with the device at 44100 Hz ... the source's duration at that rate", on the same tone | a 0.5 s tone at 48 kHz | a 0.6 s tone | a premise: on the game's voice queue at the page's seed the 0.5 s tone now runs on past its end (W3-24) by 326 samples at 48 kHz (299 at 44.1 kHz), so the render's tail is no longer the room's alone; the 0.6 s tone runs on by none, on `main` and on the branch (measured on the model). The order's rule: another tone, not another seed. CI's run on `11d910b` stopped at the first of them |

The live chain's checks of section 10 (the chain's samples held back by D at each frame rate, the hold's arithmetic,
one block less running short, the delay `queueCostMs`, `spurtStart`'s places), the stream's ask of each tick (section
16) and steamChannel's zero failed with the constant set and the suite's tables at 50.5 ms, and pass with `D` and
`LIVE_D` set: no line of those checks changed, only the tables of D they read.

## The recorded hashes

`node tests/render-stream.verify.mjs --hashes` on the untouched tree and on the branch
(`docs/reports/W3-27b/hashes-before.txt` and `hashes-after.txt`; a third run on the clock alone, in the scratch
folder, told the clock's moves from the constant's). Of 88 cases, 52 moved, their WAV, `codecInfo` and `GAIN_GOLDEN`
hashes alike, and 36 did not.

- **Moved, 52:** every case that runs Steam's seeded sender and sends sound. They are the 50 that W3-28 moved and the
  two at 24,000 Hz (`steam, source at 24 kHz` and `steam, 192004 samples at 24000 Hz`), which W3-28 did not move
  because their step is not dithered and which run the sender as the others do; `odd options` is among the 50 (its
  unknown codec renders as `steam`). The clock alone moved all 52. The constant moved six of them again: the cases on
  the game's timeline at 300 frames a second (`steam, timeline game` and its gate-off, loss-and-jitter, auto-gain-off,
  44.1 kHz-device and room cases), whose D is 24,064 where it was 24,576. `steam, timeline game at 66.67 fps` moved
  with the clock only, as D does not move there.
- **Not moved, 36:** every case of `steam_48` (not in TF2), `celt_22`, `celt_44`, `speex` and `miles` (not in TF2);
  `steam, codec bypassed`; `test profile with a decoder EQ`; the four renders of a demo's voice (received, past full
  scale, and on the game's timeline at 300 and at 66.67 frames a second, whose zero is `arrivalZero` and does not take
  the constant); `steam, empty source` and `steam, silent but for a quarter frame of sine at the end`, which run the
  sender and send nothing.
- **The stop rule's exception:** two recorded hashes of cases that run no sender moved, each on the game's timeline and
  through the model's zero alone: the threshold case of `tests/voice-channel.verify.mjs` (made-up messages at 66.67
  frames a second with no codec delay, D 12,800 where it was 13,312), and the two rows at 300 frames a second of
  `OPEN_MAIN` in `tests/render-channel.verify.mjs` section 27 (made-up traffic, D 24,064 where it was 24,576); its rows
  at 66.67, where D does not move, did not. Each moved with the constant and not with the clock (the clock-alone run
  passed both).
- **Recorded in the other suites:** `tests/render-channel.verify.mjs` `LIVE_MAIN`'s three steam rows (the celt_22 row
  did not move), section 24's render at 66.67, and section 29's eight renders of a source that ends in silence, all
  of the seeded sender; the threshold and `OPEN_MAIN` rows above. `tests/stages.verify.mjs` reads `GOLDEN` from
  `tests/render-stream.verify.mjs` and changed no line.

## What must not move, shown

- **Every other profile, `steam` with the codec off, a demo's received voice:** their recorded hashes are the same bytes
  before and after (the 36 cases above, render-stream's WAV, `codecInfo` and `GAIN_GOLDEN`); the live chain's celt_22
  row of `LIVE_MAIN` did not move; `tests/render-channel.verify.mjs` section 21 (a demo's own packets on the game's
  timeline, against a reference the suite builds) passes with no line changed.
- **A caller's packets and a caller's clock:** every section of `tests/steam-sender.verify.mjs` that gives the sender a
  clock of its own (the float arithmetic, the empty read, the hand clock n = 4 (i + 1), the gate, the pre-roll, the
  hold, the gate off on the hand clock, the refusals) passes with no line of it changed (the diff's hunks lie outside
  them); `tests/reproduce.verify.mjs` and `tests/reproduce/gate.mjs` are not changed and pass. `node tests/reproduce.mjs`
  on the seven rows of the published recordings' manifest and the inputs check prints the same output before and
  after, byte for byte (the row that needs its input file, `--any-rate`, answers "cannot check" on both).
- **The sender's rule:** outside comments, the diff of `steam-sender.js` is the old clock and its five constants
  removed, the rename, and the export list. `createSender` (the gate, the pre-roll, the hold's arithmetic, one chunk
  one message, the ticks' formula) has no line changed.
- **The live monitor's latency without the queue:** 202.252 ms at 48 kHz and 202.232 ms at 44.1 kHz, before and after
  (the chain's own `stats.latencyMs`, read from a chain made on each tree).
- **`tests/predictions/predictions.json`:** not in the diff.
- **The reads never run ahead of the capture:** the checks of `render-stream`, `render-channel` and `steam` that hold a
  render made in pieces, a sample at a time and live to the whole render pass with no line changed but recorded
  hashes and the tables of D (above); the break of check 7 below is what they catch.
- **The dither's draw** (`engine/steam.js`, `steamCaptureStep`) takes the render's seed through its own generator and
  is not the clock's: `tests/steam.verify.js` [5e], which pins the step's start and table, passes with no line changed.

## What moves, as measured on the branch

Measured on the model with one scratch script on `main` `7f37d2d` and on the branch: the public test signal (142.9 s,
the left channel, 48 kHz) through `process()` with Steam voice on the game's voice queue at the page's other defaults
(`voice_buffer_ms` 100, jitter and loss 0, no room, a 48 kHz device), seeds 1 to 40; the network test signal at seeds
1 to 10; the low-tone signal at seeds 1 to 3. The queue's pulls were counted in a scratch copy of each tree whose
`pull()` adds to counters and changes nothing else. Each cell is `main`, then the branch; "+-" is one seed's spread.
The branch has the constant at 42.0 ms; the queue's counts do not depend on it.

**The queue on the test signal:**

| The listener's frames a second | 300 | 66.67 | 30 |
| --- | --- | --- | --- |
| Times the queue opens | 15.1, 14.9 | 18.0, 18.0 | 18.0, 18.0 |
| Spurts that join an open queue | 3.3, 3.4 | 0.5, 0.3 | 0.5, 0.3 |
| Overflows | 91.8 (+-10.6), 85.3 (+-7.2) | none | none |
| Samples the overflows drop | 75,291 (+-7,597), 72,161 (+-5,156) | none | none |
| Pulls that find the queue empty (run short) | 20.2, 19.9 | 21.8, 21.4 | 36.0, 35.1 |
| Pulls with a fade | 275 (+-86), 294 (+-73) | 178, 178 | 1,518 (+-626), 1,718 (+-618) |
| Pulls with under 50 ms queued, counted before the pull | 78.8, 79.7 | 82.1, 81.8 | 117 (+-32), 112 (+-33) |
| Samples queued at a pull, before it, mean | 18,281, 18,212 | 9,256, 9,178 | 6,357, 6,198 |
| An opened spurt's start against its source, mean | +1.7, +3.4 ms | +5.1, -5.7 ms | -5.2, -18.8 ms |
| The same, one seed's mean against another's | +-8.6, +-3.9 ms | +-8.8, +-4.1 ms | +-11.6, +-6.9 ms |

A render has about 8,700 to 8,800 pulls. The two counts "under 50 ms" and "queued" are counted at the pull's start
and do not equal the planner's, whose way of counting is not in the repository; every other row is counted as the
order's figures are (the network signal below gives the order's figures to the digit). What it says, as the order
expected: the opens, the empty pulls, the fades and the low pulls differ by less than two standard errors of these 40
seeds at every rate; at 300 frames a second there are 7% fewer overflows (3.3 standard errors) and 4% fewer samples
dropped (2.2); a seed's mean start spreads half as much; with the constant at 42.0 ms an opened spurt starts 1.7 ms
later at 300 frames a second (D a block less), 10.8 ms sooner at 66.67 (D unchanged) and 13.6 ms sooner at 30, where
it now lies 18.8 ms before its source in the mean (the order's open question, ruled by the orchestrator to stay).

**The network test signal** (seeds 1 to 10): at 300 frames a second 60.4 and 57.2 overflows, 44,858 and 43,750
samples dropped, 8.9 and 8.9 opens, 4.6 and 5.0 spurts joined; at 66.67, 12.8 and 13.0 opens and 15.3 and 17.1 empty
pulls; at 30, 25.6 and 25.6 empty pulls and 434 (+-274) and 606 (+-389) pulls with a fade. These are the order's
figures exactly. **The low-tone signal** (seeds 1 to 3, 300 frames a second): 19 and 19 opens, 94,594 and 92,928
samples dropped.

**The render** (the test signal, seeds 1 to 40):

| | `main` | The branch |
| --- | ---: | ---: |
| Level, the whole output, at 300, 66.67 and 30 frames a second | -7.09, -7.07, -7.25 dBFS | -7.09, -7.07, -7.26 dBFS |
| The seven octave bands from 87.5 Hz to 11.2 kHz, the branch less `main` | | within 0.010 dB at 300 and 66.67, 0.025 at 30 |
| A band's spread over seeds | 0.01 to 0.09 dB (0.33 at 30) | 0.01 to 0.10 dB (0.29 at 30) |
| Frames sent | 5,069.2 (+-6.8) | 5,063.9 (+-9.4) |
| DTX frames | 664 (+-15) | 661 (+-12) |
| Bytes sent | 328,909 | 328,769 |
| Spurts | 19.9 | 19.6 |
| Messages | 1,798.1 | 1,807.9 |
| Chunks | 2,559.8 | 2,575.5 |
| Frames in each of the eight 1 s bursts (the loud seconds of the two 8 s step sections) | 79.93 (+-1.88) | 79.58 (+-1.87) |
| A spurt's length, the 19 places most seeds have a spurt | | 0.21 frames longer in the mean |
| A spurt's start, the same | | 1.14 ms later in the mean |
| One spurt's length over seeds | +-4.89 frames | +-4.58 frames |
| One spurt's start over seeds | +-18.5 ms | +-19.1 ms |

No level and no band moves by as much as one seed differs from another. What changes is which chunk each message
holds: 0.5% more messages and 0.6% more chunks.

## The live chain

The live sender is `createSender` with the render's seed on the samples pushed, so it changes as a render does and no
code of the chain changed. Its latency, the chain's own `stats.latencyMs` read from a chain made on each tree:

| | `main` | The branch |
| --- | ---: | ---: |
| without the queue, 48 kHz and 44.1 kHz | 202.252, 202.232 ms | 202.252, 202.232 ms |
| on the queue at 300 frames a second, 48 kHz | 559.281 ms | 547.671 ms |
| at 100 | 350.301 ms | 350.301 ms |
| at 66.67 | 303.861 ms | 303.861 ms |
| at 60 | 315.471 ms | 303.861 ms |
| at 30 | 280.641 ms | 280.641 ms |
| at 20 | 292.251 ms | 280.641 ms |
| at 10 | 327.081 ms | 315.471 ms |

So 11.6 ms sooner on the queue at 300, 60, 20 and 10 frames a second and unchanged at 100, 66.67 and 30, as the order
computed; `docs/LIVE.md`'s table has the new figures. The panel's figures there were measured before W3-26b and are
not measured again.

## Each check and the break it caught

Each break was made in a scratch copy of the branch (the code as built, one change), with the suite's checks set to
go on after a failure, and seen to fail its check. The suites named are the ones run on each copy.

| W3-27b's check | The break | What caught it |
| --- | --- | --- |
| 1. A replay does not move | a caller's clock's `since` moved 4 ms by the sender (`since += 0.004` when `opts.clock` is given) | `steam-sender`: the hand clock n = 4 (i + 1)'s schedule ("its first nine messages and last two as given", `[72,0,7]` for `[71,0,7]`), its second copy, the hold's hand clock ("the end marker is returned by the push of chunk c + 7's last sample"), the gate off's second copy, and the checks that wrap a clock (the forced leads, the 1 s burst). `tests/reproduce.verify.mjs` passed under it: its sender replay reads whether a spurt opens, not when a message arrives |
| 2. The seeded sender is the reference's reads through the sender | (a) the sender made with the clock of W3-16 | `steam-sender`: "the second copy, on the reference's reads with its own steps, lead and phase, gives the same messages ... seeds 1 to 400", and with it the reference schedule and every check on the second copy |
| | (b) the seeded clock's lead not passed (lead 0) | the same check, and "info().lead" |
| 3. The clock's hash | two draws of the phases swapped (the frame's before the tick's) | "seed 1, 100,000 reads ...: the SHA-256 recorded from the build", with seed 1's first ten reads and W3-27a's check 2 |
| 4. The capture's phase (W3-21's section) | a lead of 0 (the draw still made) | "a 1 s burst on the 31.25 ms grid ...: 33 steps ... in at least 85% of seeds" (0 of 200), "the frames its spurt sends rise by about one step" (0.000), the lead's formula and the lead's spread |
| 5. The capture's place, through the sender | the place left out of `ready()` (the draw still made) | "the silence record is one step long in 20 to 26% of seeds; with place 0 forced ..., in over 31%" (33.55% and 33.55%), with check 3's hash and W3-27a's checks 4 and 7 |
| 6. The arrival constant | (a) `voice-channel.js` left at 50.5 ms | `voice-channel`: the pinned values of D, the exported zero, both zero checks of seeds 1 to 50 (-6.92 ms with the grid out) and the constant's pin; the frame clock's and the play-out's checks against `reference-frames.mjs` |
| | (b) the module, the suite and `reference-frames.mjs` all left at 50.5 ms | `--arrival`: "the pooled mean, 42.144 ms ..., is within 0.3 ms of the constant, 50.5 ms" (-8.356 ms from it); the default run: the constant's pin ("50.5 ms, is the mean recorded ... to the half millisecond"), the zero checks (-9.03 ms), the threshold hash |
| 7. The stream and the live chain equal the render | the packet rounding in `ready()` rounded down (`Math.floor` for `Math.ceil`), which makes a step ready up to 8.75 ms before its last sample | `render-channel`: createRender fed in pieces of 10 and 48 samples on the game's timeline (it throws "push() takes messages in tick order": a message's tick fell below the stream's bound), the live chain on the game's timeline at every frame rate (it throws "a channel with no end takes ticks that never fall"), the gate off, a room attached, `spurtStart`, the chain's stats and what it keeps; `steam-sender`: W3-27a's check 6 ("at every read since x 24000 is at least the samples taken so far", defaults, seed 1, read 21), with the reference and place checks. `render-stream` showed only its recorded hashes under it: its streamed renders still equal `process()` there, so the catch is `render-channel`'s |
| 8. The statistics through the sender | the order names no break; the bands of 0.03 were seen to fail under breaks 2b, 4 (openings 0.875 / 0.093 / 0.033) and 5 (records 0.313 / 0.680 / 0.008) | `steam-sender` |

## The suites, as run

Each heavy run went through `flock /tmp/tf2ve-heavy.lock`, one at a time, on a four-core machine shared with other
agents.

| Command | Where | Last line |
| --- | --- | --- |
| `node tests/render-stream.verify.mjs --hashes` | the untouched tree, before any change; the branch at the end | the two files beside this report; 52 cases moved, 36 did not |
| `pnpm test` | the branch with every change but `tests/browser.verify.js`'s tone and this report (the code of `11d910b`) | "28 of 28 suites passed. 1510.8 s summed, 1510.8 s of wall time, 1 at a time." |
| `pnpm test:browser` | the branch | "1 of 1 suites passed. 545.4 s summed" (with the 0.6 s tone; a run with every check going on after a failure, before the tone changed, failed [3c4]'s six rooms and [3c5]'s 44.1 kHz render and nothing else) |
| `node tests/voice-channel.verify.mjs --arrival` | the branch | "... 0 failed (the arrival constant's alone)": the pooled mean 42.144 ms, 0.144 ms from the constant, and the recorded figures |
| `node tests/reproduce.mjs` on the published recordings and the inputs check | the untouched tree and the branch | the same output, byte for byte |
| `node tests/cache-number.mjs origin/main --report` | the branch | names `steam-sender.js` and `voice-channel.js` (above) |

Before anything was recorded every suite and the browser suite ran in a scratch copy whose checks go on after a
failure, on the clock alone (constant 50.5 ms) and then with the constant set; the lists of "Every pin that moved"
come from those runs. The suite `steam-sender` takes about 1 min 7 s inside a whole run (43 s before), the most of it
W3-27a's sections; `voice-channel` 3 min 53 s.

## CI

- The run on `4f42c59` failed, as it had to: the recorded hashes were not yet recorded.
- The run on `11d910b` (run 44900332995): `units`, `engine`, `render` and `stages` passed; `browser` failed at [3c4]'s
  first room, "open: the render plays, and it and its download carry no tail (24326 samples, 326 of them tail)", the
  premise fixed in `d6a98df`; so `verify` failed.
- The run on the head (this report's commit, with `d6a98df`) is read in the hand-back.

## Not done, and questions for a ruling

- **The private runs are the orchestrator's** (the order's "The private runs"): `tests/accuracy.mjs` over the takes,
  `tests/retiming.mjs --engine` and W3-21's count of changes between phrases, Set D's ends against the new clock at
  each uptime, and the study's scores on the built `createClock`. None was run here; there are no recordings on this
  machine.
- **`tests/steam-sender/README.md`** still names "The app's `createReadClock`". The order's "May touch" does not list
  the file, so it is left. Question: may the orchestrator (or a fix round) change that one name to `createClock`?
- **"Finding 22 or 23, where the zero and its 50.5 ms are given":** neither finding gives the 50.5 ms; the record gives
  it once, in finding 28's W3-21 lines, and the dated note on the new constant is there (at "Measuring it again over
  many seeds is an order of its own"). Finding 22's added lines on the frame clock name D without its value and are
  not changed.
- **`docs/PROGRESS.json`** (the orchestrator's) says in `waiting_on_the_owner` that the monitor on the queue is "357 ms
  later at 300"; it is 345 ms since this branch (345.4 ms, the live chain's own `queueCostMs`). Its open question on
  the arrival figure ("To do: measure it again over many seeds") is done here.
- **The arrival's measurement is not in CI.** It runs behind `--arrival`; CI runs the default suite, which pins the
  constant to the recorded mean and holds the suite's 50 seeds to it.
- **30 frames a second.** An opened spurt now lies 18.8 ms before its source in the mean there (seeds 1 to 40 of the
  test signal), where it lay 5.2 ms before it on `main`; the orchestrator's ruling 3 leaves the constant measured at
  300 and 66.67 only.
- **A refused tool call.** One scratch run of the browser suite (in a scratch copy, with every check going on after a
  failure) was started without the session's tracking; stopping it was refused by the session's permission check. It
  was not worked around: the run was left to finish under the heavy-jobs lock, and it did (its results are the "run
  with every check going on" above).
- **Two of the queue's counts** ("pulls with under 50 ms queued" and "samples queued at a pull") are this build's own
  way of counting, at the pull's start; the planner's way is not in the repository. Both are given on `main` and on
  the branch alike, so they compare with each other and not with the order's figures.

