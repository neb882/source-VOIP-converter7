# W3-02b: the sender and the timeline stage

The builder's report, 2026-11-10. The order is W3-02b in `docs/work-orders/W3-02-receiver-queue.md` (revision 3).
All of it is built. Nothing in the app loads `steam-sender.js` or calls `createTimeline` yet. The private runs are
the orchestrator's; the commands are at the end.

## What was built

| File | What |
| --- | --- |
| `steam-sender.js` (new) | Steam's sender as "The sender's packets": `STEAM_SENDER`, `createClock`, `createSender`. An IIFE in `demo.js`'s form (`TF2SteamSender`), no imports, no `Math.random`, no clock. |
| `voice-channel.js` | `createTimeline` added, and its name in the exports. `createChannel` is not changed: the diff removes one line, the old export line. |
| `tests/steam-sender.verify.mjs` (new) | 55 checks. A second, plain-array model of the order's text (`plainSender`, `plainClock`) runs beside the module. |
| `tests/voice-channel.verify.mjs` | 23 timeline checks added (124 in all). One of W3-02a's checks is changed: the exports check now names five functions. |
| `tests/voicequeue/synthetic-results.mjs` (new) | Spec 4's stand-in results. It also exports `engineRun` and `offsetsOf`, which `retiming.mjs --engine` uses. |
| `tests/retiming.mjs` | The `--engine` flag only. Without it the output is byte for byte main's. |
| `package.json` | `node tests/steam-sender.verify.mjs` appended to `test`. Main's new `speex102` suite is kept. |

## The reference schedule and the statistics

The build gives the order's numbers exactly:
- **The clock** for seed `0xC0FFEE`: the 24 numbers.
- **The reference schedule**: all 50 messages, message for message.
- **Its two spurts**: 20850 with 104 frames (pre-roll 2400) and 70500 with 40 (pre-roll 1500).
- **The hand clock**: its first nine and last two messages, and spurts of 102 and 38 frames from 21600 and 70500.

The statistics, over seeds 1 to 400 under the order's three counting rules:

| What | The order | The build |
| --- | --- | --- |
| Chunks of 750, 1500, 2250, empty (rule 1) | 0.228, 0.755, 0.017, 0.001 | 0.2277, 0.7549, 0.0165, 0.0009 |
| Frames in a message, 1 to 5 (rule 2) | 0.080, 0.148, 0.684, 0.076, 0.011 | 0.0805, 0.1480, 0.6842, 0.0763, 0.0112 |
| Ticks between messages, 2 to 6 | 0.021, 0.359, 0.500, 0.111, 0.008 | 0.0207, 0.3589, 0.4998, 0.1106, 0.0084 |
| Opening of 8, 6, 9 frames | 0.943, 0.037, 0.020 | 0.9425, 0.0375, 0.0200 |
| Final chunk 7th, 8th (rule 3) | 0.058, 0.943 | 0.0575, 0.9425 |
| Silence record of 750, 1500, 2250 | 0.233, 0.750, 0.018 | 0.2325, 0.7500, 0.0175 |
| Messages a second | 17.88 | 17.883 |

The other readings of the counting rules also give the order's figures:
- frame 0's chunk counted: 0.229, 0.752, 0.017 and 0.003 empty;
- the end marker's message counted: 4 frames at 0.081;
- only chunks that are not empty: 0.0625, 0.935 and 0.0025.

The ticks row also has 1 tick at 0.0009 and 7 at 0.0007. The table does not list them.

## Readings of the order

Where the text allowed more than one reading, this is what I built.

1. **A message carries its samples.** The spec lists `{ tick, spurt, first, last, start, end }`. I added `pcm`: an
   `Int16Array` of 480 samples a frame, the padding of a last frame included. The order says a message "holds"
   its frames, and the memory bound (2400 + 2250 + 479) is what the sender needs to hand them over.
   - Without it a caller cannot tell a final frame's padding from the source. The padding replaces the source
     samples after the final chunk, and these need not be zero (quiet sound under the gate).
   - Remove the field if the orchestrator wants the spec's shape exactly. Then W3-11a has to rebuild the padding
     itself.
2. **`finish()` with the gate on.** The frames run until all of the source has been read, then on over zeros
   until the state is SILENT. So a source that ends while SILENT, with samples not yet read, still has them judged.
3. **`finish()` with the gate off.** The next clock frame reads the rest of the source, cut at its end, and is the
   last. If nothing is kept and nothing is left, the end marker goes alone (`last = first - 1`, empty `pcm`).
   - The order's gate-off check uses the reference signal and the hand clock. There 2400 + 96000 samples are
     exactly 205 frames, so the last message is the end marker alone, with no padded frame. That case is checked
     as it is ("0 zeros after the source").
   - The padded last frame is checked on a 95,003-sample cut, seeds 1 to 50 (37 zeros each).
   - Any reading that pads a whole zero chunk would break the order's "at most 479 zeros more".
4. **`meanMin` at or below 0 is refused** (`RangeError`). A chunk of zeros would count as active, and `finish()`
   would never end.
5. **A hand clock** must give whole numbers, each 1 to 6 above the last. So a chunk is at most 2250 samples, and the
   memory bound holds. The seeded clock moves by 1 to 6.
6. **`info()`**: `chunks` counts the chunks read that were not empty; `messages` counts every message, records
   included.
7. **The gate's mean** is `sum / n >= 327.67` in doubles, as the order writes it. W3-09 has the client form the
   percentage as a 32-bit float and compare it with 1.0. The two can differ only within a rounding step of 327.67.
   The order wins.
8. **The timeline's record test** (a bug the breaks found, now fixed). `push` first took any negative `source` as
   a silence record. A spurt whose pre-roll starts before sample 0 (an onset in the first chunk: `start` -2400,
   source -4410) was then read as a record. Now only `source === -1` is a record, as the order says; any other
   number is a position. The sender's positions never round to -1.
9. **A timeline spurt** is a run of messages up to a silence record:
   - The record belongs to the spurt it closes, and samples it loses to overflow count in that spurt's `droppedMs`.
   - An onset in the ENDED state has no record before it, so it continues the timeline's spurt.
   - `start` is the first sound message's source, pre-roll included; `end` is where the last one ends.
   - `offsetStartMs` is read 0.2 s after that `start`. Offsets count samples played before output 0 too.
   - Both offsets are `null` if nothing of the spurt played.
10. **`drops`**: one entry per message that overflowed the ring. Its `time` is where the skip is heard:
    - while playing, the start of the next block;
    - during a wait, the first block after the wait;
    - if never heard, after the end.
11. **`source[i]`**: `ceil(length / 882)` slots. A slot whose centre is past `length`, or that plays a pre-roll
    before sample 0, is -1.
12. **`gainResets`** counts the channel's calls to reset, with or without a gain given. **`appended`** counts the
    spurts that did not open a channel.
13. A block of a channel that is free or waiting is not pulled; zeros are written. This is equivalent: such a pull
    returns zeros and changes nothing.
14. **Spurt offsets in `retiming.mjs --engine` and in `synthetic-results.mjs`** are read per source span (the gate
    model's spurt) from `info.source`. They are not taken from the timeline's own spurts, because the sender merges
    spurts across pauses shorter than its hold. At each slot centre the offset is exact.
    - `delayMs` is `2000 +` the offset at the first slot at least 0.2 s into the gate spurt.
    - The stand-in has 1 s of silence before its first spurt and 1.5 s after its last.
    - Its `gateSpurts` are the loud parts widened by 120 ms before and 440 ms after.
15. **`--seeds`** sets the seed count for every model when given. The engine uses 200 when it is not, and the queue
    and the rule keep their 4000. The signal length is the last gate spurt's end + 1 s.
16. **W3-02a's exports check** now names `createTimeline` too. It could not stay as it was and pass. The other 100
    W3-02a checks are untouched and pass.

## The timeline's checks against the order's ranges

The order gives rev 2's ranges, widened, and says to measure if one fails. With the new sender, one layout no
longer has the shape those ranges assume, and I go on as the order says. The layout is 2 s spurts with 300, 500
and 1200 ms of silence.
- **The 300 ms pause.** The sender's 0.4 s hold always closes it (50 of 50 seeds), so the first two spurts are one.
  There is no "second spurt, not opened, 150 to 300 ms early".
- **The 500 ms pause.** It gives a spurt of its own in 38 of 50 seeds. In the other 12, the chunk after the final
  one is already active: the sender is in its ENDED state, so it sends no silence record, and the timeline keeps
  one spurt.
- **The early start** the order wanted to see comes after pauses of about 0.6 to 1 s. I added a second layout to
  show it.

Seeds 1 to 50:

| Case | The order | Measured | The check now |
| --- | --- | --- | --- |
| 300 fps, first spurt: opened, `offsetStartMs` | -20 to +90 | +6.6 to +36.7 (dropped 82.1 to 186.1 ms) | -20 to +90 |
| 300 fps, the 300 ms pause | second spurt not opened, 150 to 300 early | never a spurt of its own | the first two are one spurt |
| 300 fps, after 500 ms, when it is a spurt of its own | (none) | 38 of 50, appended, +8.0 to +24.1 | at least 30, appended, -20 to +60 |
| 300 fps, after 1200 ms: opened, `droppedMs` | 30 to 170 | 79.6 to 167.8 (starts +17.5 to +35.2) | 30 to 170 |
| 67 fps: opened ones within 80 ms, nothing dropped | as written | -11.5 to +69.0; appended +41.9 to +105.4; 0 dropped | as written, "but the one after 500 ms" |
| 300 fps, 900/600/1200 layout: after 900 ms (added) | | appended in 49 of 50, -318.1 to -198.4 | at least 45, -330 to -190 |
| 67 fps, the same spurt (added) | | opened, -15.3 to +54.4 | opened, within 80 |
| 400 ppm, 150 fps, 60 s (seeds 1 to 10) | -26 to -22 | -24.5 to -24.4 | as written |
| 400 ppm, 300 fps | that or lower (rev 2) | -42.8 to -24.4 | at most -22 |

The orchestrator sets the ranges. Two of W3-02c's 10d checks use the same kind of layout and will meet the same
thing:
- **"silences of 300 and 900 ms, `spurts[1]` not opened, 195 to 275 ms early".** The 300 ms pause merges, so
  `spurts[1]` is the spurt after 900 ms. Here that spurt starts 198 to 318 ms early on 2 s spurts.
- **"`spurts[0].droppedMs` between 30 and 150".** Measured: 82 to 186 ms on this layout, 65 to 128 on the other.

## The checks, and how each was broken

`node tests/steam-sender.verify.mjs`: 55 checks, about 10 s. They cover:
- the module: how it loads, that it draws only from its seed, its constants;
- the clock: the reference numbers; two seeds differ, one repeats; a second reading over 400 seeds;
- the reference schedule: message for message, its spurts, the hand clock, the opening, pieces of 1, 479, 750
  and 10,000;
- that each message comes back from the push of its chunk's last sample, never earlier and never later;
- the statistics: 7 rows, and the module against the second reading on all 400 seeds;
- the gate: 9 checks, among them a mean of exactly 327.67, the sign of the peak and of the mean, and `meanMin`;
- the pre-roll (4), the hold (5, among them an empty read where the hold runs out), the gate off (6);
- every sample once: 50 noise-burst seeds pushed in pieces of 37, 250 spurts, 230 records and 20 onsets from
  ENDED;
- refusals.

`node tests/voice-channel.verify.mjs` adds 23 timeline checks:
- a second reading of the clock, driven by blocks, against the module on 48 made-up streams at six settings, with
  and without `advance()`;
- ties between a tick and a block, the first at tick 1024, among them one inside `finish()`;
- what each call returns;
- refusals; collecting does not matter;
- the first pull;
- the source map, and the exact offset across overflow (both read off a ramp);
- drops placed where their skip is heard;
- `opened` on a later reopen;
- a pre-roll before sample 0;
- the stand-in's messages;
- the gain and `info`;
- the layouts above, and the 400 ppm.

**Method.** A scratch script copied the files, made one change, ran the suite and recorded the first failing check.
Each round began with an unchanged control copy, which passed every time.

**The sender**, first round, 54 changes; 42 fail a check, 12 survive:

| Broken | First check that fails |
| --- | --- |
| phase over 62.5 ms; u2 drawn only for a late frame; u1 and u2 swapped; round for ceil | the clock's 24 numbers (each prints its own list) |
| late share, late size, period, seed constant, relay, meanMin, peakMin, pre-roll, hold constants | the constants check |
| ceil(n / 2) steps; floor for ceil on arrival | the reference schedule ([69,0,5]; [68,0,7] for [69,0,7]) |
| peak `>`; the peak rule dropped | 4915 is active, 4914 not |
| peak of x; mean of x | the sign checks |
| meanMin ignored; meanMin 0 accepted; gate off ignored; Int16Array not required | their own checks |
| always 2400 zeros; past kept across a spurt; the older past dropped | the reference schedule (at 36, 36, 0) |
| pre-roll also from ENDED; ENDED opening as SILENT | the ENDED onset check (pre-roll 2400) |
| zeros in place of the past sound | the onset after a record |
| hold counted from hanging frames | the second reading (381 of 400) |
| final not padded; kept not carried; no record; frames numbered per spurt | the reference schedule |
| start without the pre-roll; a frame one sample early | the two spurts' starts |
| an empty read runs a frame | the second reading (399 of 400) |
| finish stops after the source; drops the partial chunk | every sample once (second reading differs) |
| gate-off finish: no lone end marker; reads a whole zero chunk | gate-off checks |
| messages returned one call late | the reference schedule (0 messages) |

The 12 survivors:
- **Equivalent, five:**
  - `max(n[i-1] + 1)` removed: frames are at least 25.85 ms (1.65 timer ticks) apart, so the raw values always
    rise.
  - Two messages allowed on one tick: frames are at least 15.625 ms apart, more than a 15 ms tick.
  - The hold's `>=` for `>`: `now - last` is a whole number of 15.625 ms steps, never 0.4.
  - Kept carried past a final, and kept not emptied at an onset: each of these lines alone keeps kept empty at an
    onset.
- **Dead code, two.** The branch for a past chunk of 2400 or more cannot run, since a chunk is at most 2250; I
  removed it. A chunk with no whole frame cannot happen, since 750 + kept always holds one; it stays because the
  order states it.
- **Gaps, closed:**
  - the mean's `>=`: a chunk whose mean is exactly 327.67 (1005 x 328 + 495 x 327) is now checked;
  - a clock that repeats a value and then goes on: now refused, and checked.
- **Mutations that changed nothing**, three. They were redone in a second round of 9: a record for every silent
  chunk (`finish()` never ends, so the suite times out), a record of 750, chunks counted at every clock draw,
  messages without records, spurt frames not kept up to date, the newest past first. All fail.
  - One more survivor came up in that round: a clock jump of 7 accepted. A check was added.

**The timeline**, first round, 38 changes; 30 fail, 8 survive:

| Broken | First check that fails |
| --- | --- |
| a message added after its tick's pass; no 513; the 513's first 512 played; 513 every block; D off by a block or a sample; tick 1324; finish a block short; output a sample short; fadeTime or bufferMs not passed | the 48 streams against the second reading |
| advance() does nothing | what each call returns |
| a record does not close a spurt; a record given a source | the 500 ms spurt (0 of 50) |
| opened never; offsets without the latency | the first spurt's range |
| offsetEndMs at the first sample; 880 samples a frame | the 400 ppm |
| droppedMs not counted | info: drops summed |
| the 513's unheard sample not counted; position from 0; slots at the start | the source map |
| gainResets, gain reset, gain process | the gain check |
| drop time at the next block; ms from the first entry | drops placed where heard |
| ticks out of order; a spurt's end from its first message; source at 24 kHz | refusals; the 300 ms merge; the first spurt |

The 8 survivors were all gaps:
- a tick that ties a block running after it, in all calls and in `finish()` only;
- `push` running a block that starts on the tick;
- `opened` on any later open;
- 0.2 s read as 0.1 s;
- a dropped sample not counted as out of the ring;
- a pre-roll before 0 in the source map;
- a record of 1500 samples in the stand-in.

New checks close them: ties at tick 1024, also under `advance()` every tick and inside `finish()`; the exact offset
and source map on a ramp across overflow; a spurt that reopens a channel mid-way; a pre-roll before sample 0 heard
after output 0; the stand-in's message sizes. Writing the pre-roll case found the bug in reading 8.
- The second round had 11 changes: the 8 again, the tie split into `push()` and `finish()`, "any negative source
  is a record" and "a spurt's start from its last message". 10 fail. The tie inside `finish()` alone survived; a
  case for it was added, and in a third round it fails.

**`retiming.mjs --engine`**, broken by hand on the synthetic file. The order's criterion is the engine's start error
below "none"'s, which is 82 ms:
- the engine's offset negated: 156 ms, and the criterion fails;
- the gate model's pre-roll and hold left in the loud part: 94 ms, it fails;
- every seed run as seed 1: 15 ms, it passes. The criterion cannot see the seed. That is the order's criterion,
  not a check in a suite.
- The engine's line printed without `--engine`, or the plain header changed: the `diff` against main fails.

## Runs

- `pnpm test` (under the lock): exit 0 in 3 min 1 s. Every suite passed, `voice-channel` at 124 and `steam-sender`
  at 55. The browser suite was not run: no page file changed.
- The order's builder command: `node tests/voicequeue/synthetic-results.mjs > synthetic.json`, then
  `node tests/retiming.mjs --accuracy synthetic.json --generative --engine --seeds 50`. Section 2's row is below;
  the engine's start error is 22 ms against 82 for "none". Without `--engine` the output is identical to main's
  (`diff`).

```
   take                        n   exact pattern, %: queue  rule engine | transitions right, %: queue  rule engine  none | start error, ms: queue  rule engine  none | pauses read
   synthetic_speech           11                       0.0    0.0     96 |                           82     40     99    82 |                     62   165     22    82 | no source WAV
```

- CI (`tests`): success on every pushed head of the code. The last before this report is the merge `3f4743c` (run
  42754361979). The head this report is committed on is given in the hand-back.

## For the orchestrator's private runs

- `node tests/retiming.mjs --accuracy <results.json> --generative --takes <takes folder> --engine` (`--fps 300` and
  `--seeds 200` are the defaults). It prints one more line under the generative header, and section 2 gets an
  `engine` column in each of its three groups. Sections 1 and 3 do not change. The synthetic take costs 12 s at
  200 seeds (35 s of sound). The time grows with take length times seeds; the queue and the rule's 4000 seeds still
  run.
- The demo check is your scratch script. Give `createSender` a `clock` whose `next()` returns `n = 2 x` the running
  count of 750-sample steps (a chunk of k steps moves n by 2k, at most 6). The silent stretches between spurts are
  frames too. Each message's `end` marks the end marker, its frame count is `last - first + 1`, and `pcm` holds the
  frames.

## For W3-11a's builder

- `createSender({ seed })`, then `push(Int16Array)` on the 24 kHz sound after the capture roll-off (rounded),
  then `finish()`. Each sound message's `pcm` is what to encode, frame by frame. It is already padded on an end
  message, and an end message may have no frame at all (gate off). Reset the encoder after an `end` message.
- A silence record is `{ tick, silence }` in 24 kHz samples, and has no `spurt`.
- `start` can be negative (-2400 at most). The frames there are zeros. For W3-02c's `source`, use
  `round(start x 44100 / 24000)`; a record is -1.
- Frame numbers run through the whole render. The sequence number in a spurt is `first` less the spurt's first
  frame.
- The sender does not use the frame log's loss or DTX. Those belong to the encoder and the loss model.
- `meanMin` replaces 327.67, and only that. At or below 0 is refused. The page's "no number at the default" means
  passing nothing.
- With `gate: false` there is one spurt, and `finish()` sends the end marker. Nothing else changes.
- The sender needs no history from its caller: it keeps the pre-roll and what is left of a frame.

## Not done, or uncertain

- The private runs (the takes, the demo) are the orchestrator's.
- The browser suite was not run.
- The timeline ranges are measured, not the order's (above). The orchestrator sets them, and two of W3-02c's 10d
  checks will meet the same thing.
- Reading 1 (`pcm` on messages) goes beyond the spec's list of fields.
- The scan: no 17-digit numbers, paths, e-mail addresses or names in the diff. Model names appear only in each
  commit's trailer, and the branch name appears in the merge message, as on main. The private folder was not read.
  The scratch scripts (the breaks, the measurements) are in the session's scratch folder.
