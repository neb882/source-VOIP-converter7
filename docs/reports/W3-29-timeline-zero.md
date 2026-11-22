# W3-29: the game timeline's zero at every frame rate, as built

**Status 2026-11-22: built on `claude/w3-29-timeline-zero` from `main` at `a7d7120` (W3-27b's merge, cache v58);
not reviewed yet.** The order is `docs/work-orders/W3-29-timeline-zero.md`, read with its section "After the plan
review (2026-11-22)"; the planning report is `docs/reports/W3-29-plan.md`. Every figure here is of the model on this
branch, measured or computed on it, unless it says otherwise. No recording of the owner's was opened, and no file of
the game, of Steam or of Windows.

## What changed

The zero a render on the game's voice queue takes out, `D`, is no longer `latency()` plus one constant of 42.0 ms.
It is the sender's part, 35.3 ms (measured on the model), plus the queue's part by its rule at the listener's frame
rate (computed), plus the codec's look-ahead, on whole blocks of 512 samples.

| File | What changed |
| --- | --- |
| `voice-channel.js` | `ARRIVAL_SECONDS` goes. New: `SENDER_SECONDS` (0.0353), `relayTick(tick, fps)` (the engine's arrival at jitter 0, written again), `first()` and its mean over ticks 0 to 5,119 (kept by wait and rate, the table emptied past 64 entries), `zeroSeconds(bufferMs, fps, codecDelay)`. `zero()` is `zeroSeconds` on whole blocks. A timeline's `info` and `counts()` gain `zero` and `zeroSeconds` (`null` with `zeroSamples`). Comments at `zero()`, `createTimeline` and `arrivalZero()`. All three new names are exported. |
| `tests/voicequeue/reference-zero.mjs` (new) | The suite's writing of the rule: it steps the clock frame by frame (under 1000/15) or event by event (above), with one fresh channel for each opening on one walk of the clock; the mean over ticks 0 to 5,119; the zero before and after the blocks; `SENDER_MEASURED`, the sender's part as measured. |
| `tests/voicequeue/reference-frames.mjs` | The second model's `D` and `zeroSeconds` from the suite's rule; its info gains the two fields. |
| `tests/voicequeue/synthetic-results.mjs` | `engineRun` gains `relay` (each message pushed on `relayTick`); without it, as before. |
| `tests/voicequeue/README.md` | The new second model listed. |
| `tests/voice-channel.verify.mjs` | Checks 1, 2, 4, 5, 9 (the timeline's part) and 10 in a section of their own (`--zero` runs it alone); check 6 in the timeline's zero section, rewritten; `--arrival` measures the sender's part over 12,000 seeds (the old arrival measure goes); `--zero-table` prints the stop rule's table; `zeroOf` is the suite's rule; the exports, `INFO_FIELDS`, the threshold's info hash (the two fields taken out before hashing, so its recorded hash stands), the `zeroSamples` comparison (all but `zeroSeconds`), the side-of-the-constant pin (gone with the constant). |
| `tests/render-channel.verify.mjs` | Check 3 in section 22; `LIVE_D` under 1000/15 from the suite's rule, and check 8 in section 10; the demo's part of check 9 in section 21; section 24 rewritten for the rule (and its codecInfo hash recorded again); section 29's hashes at 60 and 30; a new section 30 (checks 7 and 9). |
| `tests/render-stream.verify.mjs` | The codecInfo hashes of nine cases recorded again. |
| `live.js` | The queue's latency text: "the packet's way" is now "the time Steam takes to send it and the queue to first mix it". |
| `README.md`, `docs/VOICE-PATH.md`, `docs/LIVE.md`, `tests/REFERENCE_2026.md` (added lines only), `tests/README.md`, `tests/predictions/PREDICTIONS.md` | The words. |

`engine/`, `steam-sender.js`, `sw.js` and `tests/predictions/predictions.json` are not touched. `docs/PAGE.md` and the
page's help state no figure of the queue's wait under 67 frames a second, so they are not changed.

## The commits

1. `47fe88b`: the new functions beside the old `zero()`, with checks 1 to 4. The render stream's `--hashes` is the same
   byte for byte as on the untouched tree.
2. `9059aee`: the stop rule's table, printed (`docs/reports/W3-29/zero-table.md`), with the `--hashes` taken before
   any change (`docs/reports/W3-29/hashes-before.txt`).
3. `d78f099`: the switch, the reported fields, `engineRun`'s option, the rewritten pins and checks 5 to 10.
4. `bbe9142`: the recorded hashes that moved, from the run in which every other check passed.
5. `90c3e9b`: checks 5, 6 and 10 add back the `D` the timeline ran with (a fix found by a break: below).
6. The words and this report.

## The sender's part

Measured as the order defines it (layout R, the sender alone, the opening message of every spurt, `15 ms x tick -
start / 24 - 160 ms`), on this head:

| Seeds | Mean, ms | Openings | Full pre-roll | Six, eight, nine frames | Standard error by seed, ms |
| --- | ---: | ---: | --- | --- | ---: |
| 1 to 12,000 | 35.3305 | 96,000 | every one | 17,516, 76,382, 2,102 | 0.0465 |
| 1 to 4,000 | 35.3419 | 32,000 | every one | 5,857, 25,424, 719 | 0.0796 |

It is the reviewer's 35.3305 ms exactly, and the reviewer's 35.342 over seeds 1 to 4,000. `SENDER_SECONDS` is
0.0353 (the tenth, the ruling 1). **The mean lies 0.02 ms from the tenth's edge at 35.35 ms**, under half a standard
error: with 35.4 the zero would be another at six settings and no pinned one (the reviewer's list). The figure is
inside the order's 34.8 to 35.8 ms, so no stop.

Measured again on this head (the review's change 11), seeds 1 to 2,000, layouts P, Q and R, full pre-rolls only:

| Bursts' level | Sender's part, ms | Openings | Six, eight, nine frames, ms |
| ---: | ---: | ---: | --- |
| 400 | 33.38 | 28,916 | 21.24, 37.20, 56.50 |
| 1000 | 35.20 | 27,781 | 21.35, 37.86, 56.32 |
| 10000 | 36.39 | 26,929 | 21.40, 38.23, 56.25 |

The plan had 33.3, 35.2 and 36.4 ms on its head (the warm-up of 1.5 s); these agree to the tenth.

## The stop rule's table

Printed before the switch by `node tests/voice-channel.verify.mjs --zero-table` and kept whole in
`docs/reports/W3-29/zero-table.md`: nine buffers, the codec's look-ahead and none, every whole frame rate from 10 to
1,000 and 59.94, 66.6, 66.67, 1000/15 and the first double below 1000/15. **1,260 of 17,928 settings move**, every one
down: 216 rows of the table by one block, 86 by two, 24 by three, 18 by four, 13 by five, 10 by six, one by seven, two
by eight and two by nine (a row is one setting or a run of whole rates with the same pair of values). The largest are
at `voice_buffer_ms` 500 at 10 and 11 frames a second (11776 and 12288 to 7680): there a frame holds more ticks than
the wait, so the frame that adds the opening also ends its wait, and the queue does not wait at all (the rule; check 1
holds it at `voice_buffer_ms` 40, 100 and 250). At `voice_buffer_ms` 100 the most is four blocks. The switch's commit
message (`d78f099`) says "one to six blocks"; that is wrong at `voice_buffer_ms` 300 and 500, and this table holds.

**Which table this head gives: the order's first table**, not the plan review's further ranges. At 67 frames a second
and above the settings that move are exactly the order's (the old constant 0.9 ms over `S + 5.80`), each by one
block: at `voice_buffer_ms` 20, 101 to 150 and 951 to 1,000 with the look-ahead, 201 to 250 with none; at 40, 66.67,
1000/15, 67 to 75 and 476 to 500, and 101 to 125 and 526 to 550; at 50, 381 to 400, and 81 to 100 and 421 to 440; at
100, 191 to 200, and 211 to 220; at 150, 127 to 133, and 141 to 146; at 200, 96 to 100, and 106 to 110; at 250, 77 to
80, and 85 to 88; at 300, 1000/15 only, and 71 to 73; at 500, none. **At 144 and 150 frames a second with no codec
delay `D` stays 17920**, as the brief expected with 42.0 ms.

Under 67 frames a second at `voice_buffer_ms` 100 (`D` before, then by the rule; with the look-ahead, then none): 10:
9216 to 7680, 8704 to 7680. 20: 9728 to 8704 both. 24: 10752 to 9216, 10240 to 9216. 30: 10752 to 10240, 10240 to
9728. 40: 11264 to 10240, 10752 to 9728. 50: 11776 to 11264, 11776 to 10752. 59.94: 12288 stays, 12288 to 11776. 60:
12288 to 11776 both. 66: 13312 to 12800, 12800 to 12288. These are the plan review's item 4 to the sample. At the
whole rates from 10 to 66 with the look-ahead `D` falls at 51 of the 57 and stays at 53 to 55 and 57 to 59, as the
order says. At 66.6 it is 12800 and 12288, at the double below 1000/15 12288 and 12288 (the review's change 5).

**Must not move, at `voice_buffer_ms` 100, and did not:** `D` at 66.67, 1000/15, 100, 300 and 1,000 frames a second
with the look-ahead and with none (13312, 12800; 13312, 12800; 15360, 14848; 24064, 24064; 24064, 24064), and at 144
and 150 with the look-ahead (18432). They stay for any `S` from 35.195 to 39.175 ms (computed on this head); with 144
and 150 at no codec delay added (17920), from 35.195 to 36.355 ms. The low end is the edge at 100 frames a second with
the look-ahead, 0.105 ms under the constant.

## Pins that moved

| Pin | Before | After | Where |
| --- | --- | --- | --- |
| `LIVE_D` at 10, 20, 30, 50, 60 fps (with the look-ahead) | 9216, 9728, 10752, 11776, 12288 | 7680, 8704, 10240, 11264, 11776, from the suite's rule, not written as numbers | render-channel, section 10 |
| the live chain's hold there (`LIVE_HOLD`, derived) | 13824, 12288, 12288, 12800, 13312 | 12288, 11264, 11776, 12288, 12800 | the same |
| section 24's conjuncts `zeroAt(66.6) === zeroAt(66.67)` and the double below's | true | rewritten: 12800 and 12288 by the suite's rule, a block and two below 66.67's 13312; the render at 66.6 is 66.67's sample for sample, the one at the double below is not | render-channel, section 24 |
| the side of the constant, `zero(100, 125)` with the look-ahead 16896 | a pin | gone with the constant (its value is still 16896) | voice-channel suite |
| the arrival constant's checks (`ARRIVAL_MS`, `ARRIVAL_MEASURED`, `zeroOf`) | 42.0 ms | rewritten: `zeroOf` is the suite's rule; check 4 and `SENDER_MEASURED` in their place | voice-channel suite |

Stand, as the order has them: `D = { 300: 24064, 66.67: 13312 }` (section 7), section 21's 24064 at 300, the pins
`12800, 14848, 24064` and `13312, 15360, 24064` at 66.67, 100 and 300, `LIVE_D` at 66.67, 100 and 300, `OPEN_MAIN` (it
holds rows at 66.67 and 300 only, where `D` does not move), the exported `zero` at 66.67, 100 and 300.

## The hashes

The render stream's `--hashes` before any change and after the switch are beside this report
(`docs/reports/W3-29/hashes-before.txt`, `hashes-after.txt`). On the first commit the output was the same byte for byte.

- **WAV hashes: none moved**, in any of the render stream's cases, and no gain hash (`GAIN_GOLDEN`). The page's
  default render (300 frames a second, `voice_buffer_ms` 100: "steam, timeline game") and the render at 66.67 did not
  move by a byte.
- **codecInfo hashes: nine moved, by the two fields only**: "steam, timeline game", "... at 66.67 fps", "... gate
  off", "... loss 15%, jitter 50 ms", "... auto-gain off, voice_scale 0.5", "... device at 44100 Hz", "... room: preset
  6, seed 7", "demo voice on the game's timeline" and "... at 66.67 fps, auto-gain off". The proof: a copy of the
  suite whose `infoHash` takes `zero` and `zeroSeconds` out of `codecInfo.channel` gives, on the switched tree, a
  `--hashes` output identical byte for byte to the one taken before any change
  (`docs/reports/W3-29/hashes-after-fields-out.txt`). `tests/stages.verify.mjs` reads the same table and passes.
- `tests/render-channel.verify.mjs`, section 29: the four WAV hashes at 60 and 30 frames a second moved (a setting of
  the table: `D` a block less there); the four at 300 and 66.67 did not. Each of the eight has the source's length and
  no `over`.
- Section 24: the render at 66.67 keeps its WAV hash and its codecInfo hash with the two fields taken out; the whole
  codecInfo's hash is recorded again (`MAIN_INFO`).
- `tests/voice-channel.verify.mjs`, the threshold: the samples' hash did not move; the info's hash stands with the two
  fields taken out before hashing, as the order has it.
- The live chain's recorded rows (`LIVE_MAIN`, no timeline or `'source'`) did not move.

## The "Why" tables measured again

**The order's first table** (seeds 1 to 400, layouts P and Q, `voice_buffer_ms` 100, no codec delay; the order's
measure, `offsetStartMs + (D - 44100 latency) / 44.1`, over opened spurts, the standard error by seed in brackets;
measured on the model on this head; the measure adds `D` back, so it does not depend on the zero). The sixth column
is new: where an opened phrase sits against its source with the rule's zero, as a render runs (`offsetStartMs`).

| Frames a second | The suite's measure, ms | As a render runs, ms | The sender's part, ms | The receiver's part by the rule, ms | `offsetStartMs` with the rule's zero, ms | Opened spurts |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | -23.62 (0.76) | +15.30 (0.93) | 35.69 | -26.67 | +1.15 | 2,016 and 2,017 |
| 20 | -1.65 (0.49) | +19.79 (0.44) | 35.71 | -16.68 | -2.58 | 2,033 and 2,036 |
| 30 | +6.06 (0.61) | +35.40 (0.63) | 35.75 | -0.01 | +4.81 | 2,030 and 2,022 |
| 50 | +29.66 (0.36) | the same | 35.67 | -6.67 | +5.85 | 2,008 |
| 60 | +29.20 (0.38) | the same | 35.66 | -5.01 | -2.83 | 2,001 |
| 66.67 | +41.71 (0.34) | the same | 35.66 | +5.80 | +1.46 | 2,000 |
| 100 | +41.87 (0.33) | the same | 35.66 | +5.80 | +0.18 | 2,000 |
| 150 | +41.74 (0.34) | the same | 35.71 | +5.80 | +5.39 | 1,986 |
| 300 | +42.56 (0.33) | the same | 35.39 | +5.80 by the form kept there | -3.11 | 1,649 |

The plan's figures on its head (warm-up 1.5 s) were within 1 ms of these at every rate (-24.95 at 10 on the sender's
ticks, +14.63 as a render runs; +41.20 at 66.67; +42.66 at 300). The sender's part over these opened spurts is 35.66
to 35.75 ms (35.39 at 300, where fewer spurts open), 0.3 to 0.4 ms over layout R's: the set of spurts that open is
another. With the rule's zero an opened phrase sits within 5.9 ms of its source in the mean at every rate; at 50 and
150 it sits about 5.4 to 5.9 ms late, which is what the block grid leaves there (-4.82 and -4.75 ms) plus that 0.4 ms.
At 10 the mean holds the queue's padding between a frame's bursts (check 5's +1.67 ms).

**The order's second table** (`process()` on the queue with the codec on, `voice_buffer_ms` 100; the render suite's
`talk(60, 24000, s)` at signal seeds 1 and 2 with render seeds 1 to 6, and the public test signal at render seeds 1 to
8; the mean `offsetStartMs` of opened spurts, the standard error by render in brackets; measured on the model, each
column rendered on its own tree: "today's" on the commit before the switch, "the rule's" on the switched tree):

| Frames a second | Talk, today's zero, ms | Talk, the rule's zero, ms | Opened | Test signal, today's, ms | Test signal, the rule's, ms | Opened |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | -33.73 (2.75) | +1.10 | 214 | | | |
| 20 | -19.15 (1.98) | +4.07 | 224 | | | |
| 30 | -14.29 (1.59) | -2.68 | 221 | -14.40 (2.55) | -2.79 | 144 |
| 50 | -11.60 (1.31) | +0.01 | 220 | | | |
| 60 | -7.79 (1.69) | +3.82 | 218 | -6.82 (1.41) | +4.79 | 144 |
| 66.67 | -4.65 (1.50) | the same | 218 | -3.91 (1.12) | the same | 144 |
| 100 | -5.66 (1.39) | the same | 212 | | | |
| 150 | -1.30 (1.62) | the same | 210 | | | |
| 300 | +2.73 (1.50) | the same | 188 | +4.98 (1.76) | the same | 123 |

Each render of the rule's column is the render of today's column with the voice whole blocks later (the standard
errors are the same to the last digit): -33.73 + 3 x 11.61 = +1.10 at 10, for one. The plan had these figures within
1.8 ms on its head, its rule's column computed from its measured one where this one is rendered. What is left at each
rate is the block grid's part (-0.98 ms at 10 with the look-ahead, -2.75 at 20, +0.41 at 30, +0.29 at 50, -4.76 at 60,
+4.26 at 66.67, +5.70 at 100, +0.36 at 150; `D / 44100 - zeroSeconds`, computed), the talk's lower level (the
sender's part is about 2 ms under at a level of 400), and the spread of a minute of talk (1.3 to 2.8 ms by render).

## The checks and their breaks

Each break was made in a scratch copy of the tree and the check was seen to fail on it.

| Check | Where | Result on this head | Break, and what caught it |
| --- | --- | --- | --- |
| 1. The rule against the queue, opening by opening | voice-channel `--zero` | 29,480 openings at 67 settings (three buffers, 13 rates, ticks 0 to 439, with the relay and under 1000/15 without), every one where the suite's rule says | The suite's rule counting the wait from the message's own tick: check 1 fails (first at 20 fps without the relay, tick 3: sample 512 against 2560). On the rule's own walk that break moves 768 of 5,120 openings at 30 fps with the relay, 1,024 at 40, 1,023 at 60 and 3,688 at 24, by 5.0, 5.0, 3.3 and 30.0 ms in the mean of all 5,120, the order's figures. The same break in the module's `first()` is caught by check 2. |
| 2. `zeroSeconds` and `zero` against the suite's rule | `--zero` | 17,928 settings, the most apart 0 s (bitwise equal); the closed form on the even clock exact at 499 waits | Mean over 1,000 ticks: fails (10 fps, 20 ms). Cap's term on the wait: fails (576 fps, 40 ms). `SENDER_SECONDS` 0.042: fails. |
| 3. `relayTick` is the engine's rule | render-channel 22 | Equal over ticks 0 to 5,119 at ten rates and the double below 1000/15; the tick itself at 1000/15, 66.67, 75, 300 and 1,000 | `- 1` in the module's `relayTick`: check 3 fails (and checks 1 and 2). `- 1` in `engine/network.js`: check 3 fails, and the section's other three checks. |
| 4. The sender's part | `--zero`; `--arrival` | The recorded figures to 1e-9 ms over 4,000 seeds; 12,000 with `--arrival` | `SENDER_SECONDS` 0.5 ms off (0.0358): fails (and check 2). |
| 5. The identity through the sender | `--zero` | With the relay, layouts P and Q, seeds 1 to 50: at the first slot -0.034 to -0.012 ms at all eight rates (249 to 254 spurts a rate); `offsetStartMs` -0.079 to -0.034 ms at 20 to 150 fps; at 10 fps its mean +1.67 ms | Without the relay option: fails at 20 and 30 fps (first slot up to 58.1 and 69.7 ms early). At 50 and 60 it moves nothing heard, as the order says. |
| 6. The mean at 66.67 frames a second and above | voice-channel, the timeline's zero | 66.67 fps +1.53 ms over 250, 100 fps +0.37 over 250; with the grid out +0.82 ms against 3 standard errors of 1.63; at 300 fps with the grid out +1.92 ms (band 4; the reviewer +1.9) | `SENDER_SECONDS` 5 ms low: fails (with most of the suite). |
| 7. Real renders under 67 | render-channel 30 | 30 fps -3.61 ms over 117 opened spurts (band 6), 10 fps +0.97 over 112 (band 10); neither over two thirds of its band | On the tree before the switch (the old zero): fails, -15.22 and -33.86 ms. |
| 8. The live chain | render-channel 10 | `delta` 512; from the old hold plus `delta` the output is the recorded one; 512 samples longer; `latencyMs` 11.61 ms less | The hold kept a block over `D` at 30 fps (not following it): check 8 fails, with the section's chain checks at 30 fps and the delay check. |
| 9. What a render reports | voice-channel `--zero`; render-channel 30 and 21 | `zero` is `zero()` and the suite's; `zeroSeconds` the module's and within 1e-12 s of the suite's; a demo's `zero` is the zero given, `zeroSeconds` null | `zeroSeconds` reported as `D / 44100`: fails in both suites. |
| 10. The ring's cap | `--zero` | 300 fps, seeds 1 to 50: +1.38 ms 100 ms after the first slot heard (band 3; the planner +1.2), +27.79 at the first slot (band 15 to 35; the planner +26.4) | The suite's cap term on the wait: fails (-93.6 ms). |

**A fix found by a break.** As first written, checks 5, 6 and 10 added back the suite's own `D` to the offsets, which
the timeline had made with the module's. A break of the suite's rule that moves its `D` and its `zeroSeconds`
together then cancelled: with the cap's term on the wait, check 10 passed (-0.74 ms). The three checks now add back
`zero()`, the `D` the timeline ran with, and subtract the suite's `zeroSeconds` (commit 5); check 10 then fails on
that break.

**A deviation in check 5, for a ruling.** The order holds `offsetStartMs + D / 44.1` to `15 p - start + first(p) /
88.2` within 0.05 ms. That does not hold, and cannot: `offsetStartMs` is read at least 0.2 s into the spurt, and each
message played by then writes n - 1 of its n samples (finding 24), so it is one sample (0.023 ms) less for each such
message. Measured: -0.079 to -0.034 ms at every rate from 20 to 150. At the spurt's first slot heard the difference is
-0.034 to -0.012 ms at every rate, 10 included, which is the planner's figure ("the first slot's delay"). The check
holds the first slot to 0.05 ms and `offsetStartMs` to 0.1 ms, and at 10 frames a second the mean of `offsetStartMs`
between 0 and 4 ms (+1.67 ms; the order's 1.7 to 1.9). The question for a ruling is below.

## The live chain

Check 8 at 30 frames a second (`talk(12, 44100, 3)`, seed 1, jitter 0, blocks of 480), on the commit before the
switch and after:

| | Before (`9059aee`) | After |
| --- | ---: | ---: |
| `D` | 10752 | 10240 |
| hold | 12288 | 11776 |
| output, samples | 516,855 | 517,367 |
| SHA-256 of the output from the old hold on (after: from the old hold plus 512), 504,567 samples | `1eb385bf...` | `1eb385bf...` |
| `stats.latencyMs` | 280.62 ms | 269.01 ms |

The monitor's sound did not move: from the old hold on, the new output is the old one, sample for sample, given out
after the same input. Its figure fell by a block. At `voice_buffer_ms` 100, the step over the switch off
(`queueCostMs`) and the chain's latency at a 48 kHz device, before and after (computed, the chain's own figures):

| Frames a second | Step before, ms | Step after, ms | At 48 kHz before, ms | After, ms |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 113.2 | 78.4 | 315.5 | 280.6 |
| 20 | 78.4 | 55.2 | 280.6 | 257.4 |
| 30 | 78.4 | 66.8 | 280.6 | 269.0 |
| 50 | 90.0 | 78.4 | 292.3 | 280.6 |
| 60 | 101.6 | 90.0 | 303.9 | 292.3 |
| 66.67 | 101.6 | 101.6 | 303.9 | 303.9 |
| 100 | 148.0 | 148.0 | 350.3 | 350.3 |
| 300 | 345.4 | 345.4 | 547.7 | 547.7 |

These are the order's figures. With the switch off the chain holds back 202.25 ms at 48 kHz, as before.

## Other figures measured or computed again

- The queue's part by the rule, less the wait, at `voice_buffer_ms` 100 (computed by the suite's rule): -26.67 ms at
  10, -16.68 at 20, -20.84 at 24, -0.01 at 30, -14.19 at 40, -6.67 at 50, -2.55 at 59.94, -5.01 at 60, -2.01 at 66,
  -1.87 at 66.6, -9.19 at the double below 1000/15, +5.80 from 1000/15 up. Over ticks 0 to 25,600 (the whole period at
  24 and 66) it is -20.86 at 24 and -2.00 at 66, 0.02 and 0.01 ms from the mean over 5,120 (the review's change 9).
- The fixed phase (computed): at the same wait the queue's part is 12.62 ms less at 40 frames a second than at 39.99,
  7.40 less at 50 than at 49.99, 7.60 more at 25 than at 24.99, and 2.62, 2.55 and 2.46 ms apart at 20, 30 and 60. At
  33.33 it is -12.85 ms over ticks 0 to 5,119, -9.33 over 0 to 102,399 and -16.17 over a render's first 10 s; at 16.67,
  -23.99 and -17.00 over the first 10 s. These are the order's figures; nothing of the sender is in them.

## Not done, and questions

- **Question for a ruling (check 5's band).** Is the band of check 5 to be read at the spurt's first slot (0.05 ms,
  as built and as the planner measured it), with `offsetStartMs` held to 0.1 ms, or is `offsetStartMs` to be held to
  the exact count of samples its messages dropped? The build takes the first.
- The level figures of the order's ruling 10 (measured again: 33.38, 35.20 and 36.39 ms; the documents give these).
- The capture's phase figures (the slope of 0.997, the mean phase of 5.0 ms, the page's seed's 39.5 ms) were not
  measured again; the documents give them as the planner's on the plan's head.
- The delay path where the ring caps the wait was measured at 300 frames a second over seeds 1 to 50 only (check 10);
  the order's table over seeds 1 to 400 at 200 to 1,000 frames a second was not measured again.
- Speech was not rendered (the recordings are the owner's).
- `pnpm test` (28 of 28 suites, 26 min 9 s) and the browser suite (549 checks, 8 min 13 s) passed on the switched tree with the recorded hashes, before the text of `live.js` changed and before the fix of commit 5; the voice channel suite, the render stream's `--hashes` and the browser suite were run again after both (below).

## Process

- Main did not move under the branch (`a7d7120` at the start and at the end).
- CI (`tests`, the six jobs): the first commit's run passed; the run on `bbe9142` (the hashes) passed, `verify` success. The run on the last push is in the hand-back.
- `node tests/cache-number.mjs origin/main --report`: "cached files changed since origin/main (a7d7120): live.js, voice-channel.js" and "the number is v58, not above v58: it must rise". The number is the orchestrator's; `sw.js` is not touched, and no file the site loads was added or renamed.
- The branch's diff and its commit messages were scanned for recordings, personal details, real SteamIDs and model names: none, but the attribution trailers. The branch's name appears where a report names its branch.
