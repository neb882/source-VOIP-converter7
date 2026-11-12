# W3-02c-1: the voice channel module as read

The builder's report, 2026-11-11. The order is section 4 of the amendment of 2026-11-11 in
`docs/work-orders/W3-02-receiver-queue.md` (with decisions 2, 3, 4 and 6 and the rulings under them), and the
orchestrator's message of the same day that ruled item 4 in with the rules and vectors of its private run. All five
items are built, and the review round's six findings are fixed ("The review round" below). Only `voice-channel.js`,
`tests/voice-channel.verify.mjs` and this report changed, and in the review round the comments of
`tests/voicequeue/reference-channel.mjs` and `tests/voicequeue/synthetic-results.mjs` (no behaviour). Nothing in the
app loads the module yet, so no page, worker, cache or recorded hash is touched.

## What was built

| Item | What changed in `voice-channel.js` |
| --- | --- |
| 1. The first pull | `createTimeline` asked 513 on the first block after a start and played the last 512, so the queue's first sample was never heard. It now plays the mixer's look-ahead as read (`docs/reports/W3-10-upsampler-read.md`, section 3): the first block plays the first 512 of its 513 and keeps the last; every later block plays the kept sample and the first 511 of its 512, and keeps the last. Every pulled sample is heard, in order. The pulls are the same (513, then 512s), so the channel's state, opens and drops are unchanged; `createChannel` is not involved. A skip in mid-play is heard one sample into the block (after the kept sample), and `info.drops[].time` says so. When a channel stops playing (it was freed after a pull that emptied the ring, whose last sample the fade and the padding leave at 0) the kept sample is dropped; what the engine does with it was not read and no sample depends on it. |
| 2. The blocks on the grid | `D = 512 x round(44100 x zero / 512)` in place of `round(44100 x latency)`. |
| 3. The zero | `zero = latency + ARRIVAL_SECONDS + codecDelay`: `ARRIVAL_SECONDS` one named constant, 0.0505 s (measured below), in the sender's frame; `codecDelay` a new option of `createTimeline` (seconds, default 0): what the caller took off each source for its codec. `info.latency` stays `latency(bufferMs, fps)`; `info.codecDelay` reports the option. |
| 4. The interpolator and the fade | `createChannel.add` writes what TF2's interpolator writes, and `pull` fades as TF2's routine fades, both in 16-bit units (below). |
| 5. The suite | Every pinned count and offset that moved was derived again (listed below). |

### The figures of D

| fps | D before | D after | every offset moves by | D with `codecDelay: 156 / 24000` (c-2) |
| ---: | ---: | ---: | ---: | ---: |
| 66.67 | 11025 | 13312 | -51.86 ms | 13312 |
| 100 | 13010 | 15360 | -53.29 ms | 15360 |
| 300 | 22050 | 24064 | -45.67 ms | 24576 |

At 66.67 fps with the codec's delay, `latency + arrival + codecDelay` is 307.0 ms (307.03 with the arrival as
measured in c-2's frame), 0.6 ms under the edge at which D becomes 13568 (307.66 ms): a re-measured constant could
move that D by a block. The suite pins 13312.

(Item 2 alone, with the old zero, would give 11264, 12800 and 22016, as the order says.) The first pull moves every
output sample after a start one sample later (+0.023 ms) on top of this.

### The zero, measured

With item 1 built and `D = round(44100 x latency)` (so that `offsetStartMs` is the arrival time with only `latency`
taken out): `offsetStartMs` of every `opened` spurt of the suite's layouts P (2 s spurts after 300, 500 and 1200 ms)
and Q (after 900, 600 and 1200 ms), seeds 1 to 50, through `engineRun` (the merged sender and `createTimeline`).

| | spurts | mean | sd | min | median | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 300 fps, P | 100 | 51.27 | 13.23 | 19.2 | 54.0 | 78.8 |
| 300 fps, Q | 105 | 50.63 | 13.10 | 21.8 | 53.1 | 74.4 |
| 66.67 fps, P | 100 | 51.15 | 14.58 | 11.0 | 51.0 | 88.7 |
| 66.67 fps, Q | 150 | 49.52 | 14.65 | 8.5 | 50.8 | 81.4 |
| **300 and 66.67, both layouts** | **455** | **50.52** | 14 | 8.5 | | 88.7 |
| (100 fps, for information) | 250 | 49.56 | 14.37 | 9.9 | 48.0 | 90.1 |

The constant is **50.5 ms**, inside the brief's 45 to 62. Its spread: by rate 50.94 (300) and 50.17 (66.67); by
layout 49.5 to 51.3; means of ten seeds at a time 45.7, 48.9, 58.0, 52.0 and 48.1 ms (seeds 1-10 to 41-50); the
standard error of the pooled mean about 0.7 ms.

**The frame.** `engineRun` (`tests/voicequeue/synthetic-results.mjs`) gives each message the source
`round(start x 44100 / 24000)`: the position of its first captured sample, before any codec. That is the frame the
constant is measured in (the sender's). c-2 will push `source = round((start - lookahead) x 44100 / 24000)`, earlier by
the Opus codec's 156 samples at 24 kHz (6.5 ms; `audio.js`, the packet's place; the amendment's section 5). In that
frame the same 455 spurts arrive 57.03 ms after their place (the reviewer's run). So the two parts are kept apart, as
ruled: `ARRIVAL_SECONDS` stays the sender's 50.5 ms, and `createTimeline`'s `codecDelay` carries the codec's part.
The gap to the plan review's figure (about 53 ms: 54.4 and 52.8 on seeds 1 to 10, through `process()`) is that
codec delay, not the capture path: this suite's seeds 1 to 10 give 45.7 in the sender's frame, 52.2 with the 6.5 ms.

With the zero on whole blocks, an opened spurt's mean `offsetStartMs` is +5.27 ms at 300 fps and -1.68 at 66.67:
the grid's own move (D is 213 samples under `44100 x zero` at 300 fps, 60 over at 66.67). With the grid's move taken
out the 455 spurts average +0.02 ms. A check pins both. In c-2's frame (sources less 156 samples, `codecDelay: 156 /
24000`, D 24576 at 300 fps) the same spurts average +0.17 ms at 300 fps and +4.82 at 66.67 (the grid's moves +0.28
and -5.14 ms), +0.03 ms with the grid taken out; a second check pins that.

### The interpolator and the fade (item 4)

From the orchestrator's private run of TF2's own routines on signals of our own (both of the game's builds, 64-bit
and 32-bit, identical output, equal to the 2006/2007 engines' routine):

- **add**: the fraction is 0.999 when a channel is assigned (`VOICE_CHANNEL.fraction`) and is never reset otherwise.
  From `pos = fraction`, while `pos < n - 1` the routine writes `trunc(s[i] + (s[i+1] - s[i]) x f)` (i, f the whole
  and fractional parts of pos, plain doubles) and moves `pos` on by 1; the fraction left is carried to the next
  packet. So `n - 1` samples, the k-th being `s[k+1]` pulled 0.1% toward `s[k]`, truncated toward zero; packets do
  not touch each other. The value written is made in one place (`written(pos)` in `add`). With `test.keepSample`
  (the replay's fault) `s[0]` is written first, truncated, so the count stays `n`.
- **pull**: `fade = max(2, trunc(f(44100 x f(fadeTime))))` and `step = f(1 / (fade - 1))` (f: single precision);
  each sample with `r < fade` samples queued behind it is `trunc(f(f(1 - f(j x step)) x s))`, `j = fade - 1 - r`;
  then the padding repeats the last samples read, already faded, then zeros (the order of today's code).
- No `-0` is written: a truncation to -0 is stored as 0 (a 16-bit ring has none; the suite compares with
  `Object.is`).
- The routine caps a read at 1024 samples and a padded pull at 2048. **Not modelled**: `pull(n)` still takes `n`, as
  "The model" says, because the log replay hands it a tick's whole demand (up to 1024 or more in one call) and the
  suite's second model pulls up to 2 x 4411 + 4. The mixer's blocks ask for 512 or 513; larger requests were not seen
  from the mixer.

**Where the scale changes.** `createChannel` now works in 16-bit units (whole values, as the game's ring holds them):
`add` takes them and `pull` gives them. `createTimeline` keeps the scale c-2 is written for (`pcm` the resampler's
`Int16Array` over 32768, the gain run on it): its gain wrapper multiplies the gain's output by 32768
(`VOICE_CHANNEL.unit`) as it enters the channel, and `runBlock` divides what the channel gives by 32768. A value that
is not whole (a gain that scales without rounding, which c-2's `agc: false` object does as the order writes it) is
truncated by the interpolator's arithmetic, as the routine would truncate its doubles; whether the engine's own gain
hands the interpolator whole values was not part of this run. c-2 should know this.

**Standing.** Run (both builds): the interpolator, 1,944,423 of 1,944,423 written samples per build (nine signals;
packet sizes of multiples of 882, 2756, 2757, 1378, 0, 1, 2, 512, multiples of 160, 11264), plus 9,369,073 of
9,369,073 over 6,000 packets on one channel; the pull, 885,240 of 885,240. The code before this item equalled the
engine on 800,439 of 1,944,423 written samples (largest difference 66), and its pull differed by less than 1 on
about a quarter of faded samples. Read, not run: the 0.999 at assignment (W3-03). Not run: an interpolator step other
than 1.0; the mixer after the pull.

**The order's table ("The model", "Exact, and approximated")**, corrected rows for the orchestrator to put in:

| Part | In the model | Why |
| --- | --- | --- |
| One sample dropped per packet, and the interpolator | exact: n - 1 samples written, the k-th `trunc(s[k] + (s[k+1] - s[k]) x f)`, the fraction 0.999 at assignment and carried from packet to packet; in 16-bit units | run: TF2's own routine, both builds, 1,944,423 of 1,944,423 written samples per build and 9,369,073 of 9,369,073 over 6,000 packets; the 0.999 at assignment read (W3-03); a step other than 1.0 not run |
| The fade | exact: `trunc(f(f(1 - f(j x f(1 / (fade - 1)))) x s))`, `j = fade - 1 - r`, `fade = max(2, trunc(f(44100 x f(voice_fadeouttime))))` | run: TF2's own routine, both builds, 885,240 of 885,240 pulled samples |
| Underrun padding | exact: the last samples read, after the fade, once more, then zeros | run: as the fade |
| The extra sample at a start | exact: the mixer's look-ahead; the first block plays the first 512 of 513, every later block the kept sample and 511 new ones; nothing dropped | read: W3-10's upsampler read, section 3 (the voice source's side of the pull not re-read; the kept sample of a freed channel is 0 and is not modelled) |
| A read of more than 1024, a padded pull of more than 2048 | not modelled: `pull(n)` takes `n` | the routine's caps; the mixer's blocks ask 512 or 513, larger requests not seen from the mixer |
| The zero `D` (the model's own, to line a render up with its source) | `D = 512 x round(44100 x (latency + 0.0505 + codecDelay) / 512)`: 13312, 15360, 24064 samples at 66.67, 100, 300 fps with no codec delay; 13312, 15360, 24576 with the Opus codec's 156 samples at 24 kHz | the game has no such figure. `latency`: the wait and the opening burst (read); 0.0505 s: the mean arrival after the place, in the sender's frame (source = the first captured sample), measured on the model over 455 spurts; `codecDelay`: what the caller took off each source for its codec (c-2 passes `lookahead / codecRate`, 156 / 24000); on whole blocks so that the channel's blocks are the mixer's (read: W3-07, W3-10) |

## The suite

`tests/voice-channel.verify.mjs`: 129 checks before, 138 after the first round, **141** after the review round. New
checks (the review round's are in "The review round"):

- the first block after a start plays the queue's first 512 samples and the next block begins with the 513th (the
  old first-pull check, rewritten);
- every block's first output sample is a multiple of 512 at 67, 100 and 300 fps, with D 13312, 15360 and 24064;
- an opened spurt's `offsetStartMs` averages to 0 with the zero (each rate within 5.8 ms; within 0.1 ms with the
  grid taken out);
- the orchestrator's vectors: packet 1 and packet 2 (values and fraction), the fade table, the three points where a
  double `r / 4409` is wrong, the padding vector;
- the fraction: 0.999 at assignment and after a packet of 1, 0.9990000000000236 after 600, 0.9989999999997963 after
  3000 and still after 16 more, 0.999 again at the next open;
- 400 packets of seeded 16-bit noise (sizes 0 to 11264) against a second reading of the interpolator, sample for
  sample and the fraction after each (792,135 samples).

The second reading of the routines (`interpolate`, `fadeLength`, `faded`) is written in the suite from the rule, not
from the module. `tests/voicequeue/reference-channel.mjs` (W3-02a's second model) predates item 4 and is not a file
this order may touch, so the 320-case differential now runs it through `arithmeticReference`: the model keeps the
state, tags and drops; the written values travel in a plain array beside its queue (cut to its length from the front),
fade and pad by the second reading, and its own pulled values are not used. The differential's packets are now
16-bit noise (they were noise in [-1, 1], which truncates to 0), and its state comparison includes the fraction.
`reference-channel.mjs`'s header now says so (review round, N4).

### Each break, and what failed

| Break | Checks that failed |
| --- | --- |
| Item 1: today's rule (play the last 512 of 513) | the first-pull check; the 48 streams against the second reading; the tick-and-block tie; the drop placement |
| Item 1: the kept sample dropped | those, and the source map, the offset at 0.2 s, the drops-per-spurt count |
| Item 2: D unrounded | the grid check (D 13252, 15237, 24277; 164 to 184 of 200 returns off the grid); the 48 streams; the tie; push/advance; the zero check; (also the `--uptime 0` check) |
| Item 3: no arrival time (D on blocks from latency alone) | the grid check (D 11264, 12800, 22016); the zero check (mean +46.5 ms); all five moved offset ranges; the 48 streams; the tie; push/advance |
| D as before (`round(44100 x latency)`) | the same, and the grid check |
| The arrival at 52.5 ms | the grid check (D 24576 at 300 fps); the zero check (-5.2 ms); the 900 ms range |
| The interpolator: unblended copy | packets 1 and 2, the noise check, the ramp checks, A, B, H, the underrun, the padding vector, the differential, the timeline's ramp checks |
| The interpolator: rounding in place of truncation | packets 1 and 2 (-28 for -27), the noise check, the ramp checks, A, B, H, the differential, the timeline's ramp checks |
| The interpolator: the fraction reset per packet | the fraction check, the noise check (sample 1046), the differential (state) |
| The interpolator: -0 kept | packet 1 (`-0` where 0 is pinned), the differential |
| The fade: the double `r / (fade - 1)` | the fade over 4410 and 8820 samples, the single-precision points, the differential |
| The fade: rounding in place of truncation | the fade checks, the fade table, the underrun, D, E, G, the padding vector, the differential |
| The padding before the fade (unfaded repeat) | the underrun (200 and 400), the padding vector, the differential |
| The timeline's scale: 32767 in place of 32768 | the 48 streams, the tie, the first pull, the source map, the offset at 0.2 s |

### Pinned counts and offsets that moved

Item 1 (one sample, +0.023 ms): the drops in play are placed one sample later (12766 -> 12767 and so on, the jumps
with them); the offset at 0.2 s into the overflow case 147.7098 -> 147.7324 ms; the 500 ms spurt's lowest start
14.7 -> 14.8 ms; the pre-roll case's slot 10 maps to 7449 (7450).

Items 2 and 3. Two ranges are W3-02b's, as re-derived for W3-16's clock, moved by D's shift and rounded outward; the
three marked "review round" are the measured range with about 20 ms to spare, in steps of 5 ms, so that a spurt
opening 100 ms early fails:

| Check | Range before | Range after | Measured before | Measured after |
| --- | --- | --- | --- | --- |
| 300 fps: the first spurt's `offsetStartMs` | -20 to +90 | -45 to +50 (review round; first round -66 to +45) | 21.8 to 74.4 | -23.8 to 28.7 |
| 300 fps: the spurt after 500 ms, appended | 0 to +80 | -46 to +35 | 14.7 to 68.3 | -30.9 to 22.6 |
| 300 fps: the spurt after 1200 ms (starts; detail only) | | | 19.2 to 78.8 | -26.5 to 33.2 |
| 67 fps: every opened spurt | within 100 | -60 to +60 (review round; first round -152 to +49) | 11.0 to 88.7 | -40.9 to 36.8 |
| 67 fps: the appended one (detail only) | | | 71.7 to 145.4 | 19.9 to 93.6 |
| 300 fps: after 900 ms, appended | -310 to -160 | -356 to -205 | -303.7 to -167.5 | -349.3 to -213.1 |
| 67 fps: the same spurt, opened | within 80 | -60 to +50 (review round; first round -132 to +29) | 16.0 to 77.6 | -35.9 to 25.8 |

Not moved: every count (42 of 50 after 500 ms, 46 of 50 after 900 ms, all the opened/appended and dropped lines),
`droppedMs` (86.5 to 153.7 and 104.6 to 190.0), the 400 ppm lines (-24.6 to -24.4; -48.1 to -25.9), the by-hand
lines, the log tool's, the synthetic log replay.

Also moved: the overflow case's start 10718 -> 8704 and its offset at 0.2 s 147.73 -> 102.06 ms; the collecting
check's split 709598 + 260602 -> 707584 + 262616; the `push`/`advance` check takes D from the zero. The by-hand
pre-roll case had 0.1 s of pre-roll; with D 2014 samples larger at 300 fps none of it played after output 0 any
more, so it now has 0.2 s (its spurt starts at -0.2 s; `engineRun`'s case still -0.1 s). `retiming.mjs --engine` on
the stand-in: the engine's columns at 50 seeds 74, 95, 64 -> 74, 95, 35 (none 82, 88); with `--uptime` the default
80, 96, 54 -> 80, 96, 31, 3110400 40, 91, 153 -> 40, 91, 137, 0 80, 96, 53 -> 80, 96, 30 (the `--uptime 0` check no
longer compares these: review round, S2).

Item 4: the ring now holds the interpolator's values, so every check that read sample values was re-derived: a
rising ramp of whole steps is written as `s[k]`, not `s[k+1]` (the ring holds 0..99, was 1..100; 11100 and 26149,
were 11101 and 26150; A `106,107,200,201,202,203 | 204,205,206,207`, B `203,204,300,...,306,0`, H `13,14,15,16,0`, each
one lower); the fade checks use 32767 (sample 1 is 32759, was 4408/4409 of 1.0; D with fade 0.05 gives 32752; E
32759); the gain check's played sample is 444; the timeline's ramps are in 16-bit units and a written sample's value is
its source position (was position + 1); the source map's slots in an underrun's padding 0 -> 1 (the bound is 2).

## The review round

The review's one blocking finding and five small ones, fixed as ruled:

| Finding | Done | Check, and the break that fails it |
| --- | --- | --- |
| B1: the arrival was measured in the sender's frame; c-2's sources are earlier by the codec's 156 samples | `createTimeline` takes `codecDelay` (seconds, default 0; a finite number >= 0, else a `RangeError`), adds it to the zero, and reports it in `info`. `ARRIVAL_SECONDS` stays 50.5 ms, its comment naming the frame. Nothing in the suite moves with the default | "with codecDelay 156 / 24000 D is 13312, 15360 and 24576 ... refused" and "with sources earlier by the codec's 156 samples ... average within 5.8 ms of 0 ... within 0.1 ms with the grid taken out" (300 fps +0.17 ms, 67 fps +4.82, grid out +0.029). The option ignored: both fail (D 24064 at 300 fps; +11.78 ms). Subtracted: both fail (D 12800 at 67 fps; +16.43 ms at 67). Added twice: both fail (D 13824 at 67 fps; -11.44 ms at 300) |
| S2: the `--uptime 0` check compared rounded columns | It keeps the `/up 0 s/` match on the Engine line, and proves the value on exact data: `createSender({ seed: 3, uptime: 0 }).info().uptime === 0` (and 777600 by default), and `engineRun` with uptime 0 gives other messages than the default (seeds 1 to 5: 241 of 682 differ, 94 in their tick). The rounded-column inequality is gone | D unrounded no longer fails it (it did before) |
| N1: the routine's caps | A comment at `pull`: not modelled; right for a caller asking 512 or 513 a call and for a replay's whole-tick demand on zeros; wrong for a single engine call over 1024 or a replay with real samples whose tick ends in an underrun | (comment) |
| N2: three ranges shifted, not re-centred | 300 fps first spurt -45 to +50 (measured -23.8 to 28.7); 67 fps every opened spurt -60 to +60 (-40.9 to 36.8); 67 fps the spurt after 900 ms -60 to +50 (-35.9 to 25.8): about 20 ms to spare | D 100 ms larger at 67 fps only (a sender opening 100 ms early): both 67 fps ranges fail (-133.8 to -56.1 and -128.8 to -67.1, which the first round's -152 to +49 and -132 to +29 let through), with the zero checks and the grid checks |
| N3: no check told the single-precision fade length from `floor` | "F2. fadeTime 0.00111111111 fades 49 samples, not floor(44100 x fadeTime) = 48": of 49 samples of 32767, sample 1 is 32084 | the fade length as `floor(44100 x fadeTime)`: F2 fails (sample 1 is 32767) |
| N4: comments | `reference-channel.mjs`: a header note (it supplies state, tags and drops through the suite's adapter; its sample values and fade predate the blend and are not used). `synthetic-results.mjs`: the offsets have the timeline's zero D taken out, not latency. The folder's README says nothing of the model's arithmetic: unchanged | (comments) |

S1 (the `agc: false` gain object rounds before `push`) is the orchestrator's text for c-2; the module is not changed.

## Checks run

- `node tests/voice-channel.verify.mjs`: 141 voice channel checks passed.
- `pnpm test`: passes ("The last run" below).
- Each break above, one at a time, on a copy of the suite whose checks do not stop at the first failure.
- The browser suite was not run: no page loads the module (the brief).
- The orchestrator's private runs on the first round's head: the Set G replay has the engine column all zeros on six
  sections; `retiming.mjs --engine` on the speech take reads 47% of transitions and 122 ms.

## Left open, or for the orchestrator

- `tests/voicequeue/reference-channel.mjs` still models the unblended copy and the double fade (its header now says
  that the suite adapts it and does not use them). Its folder's README says nothing about the model's arithmetic, so it
  was not changed. W3-02a's report describes the old arithmetic.
- The routine's caps (1024 read, 2048 padded) are not modelled (above; `pull`'s comment says when that would be wrong).
- c-2: passes `codecDelay: lookahead / codecRate` (156 / 24000) to `createTimeline`, since its sources are the packet's
  place less the codec's look-ahead.
- c-2: the channel truncates what the gain hands it to whole 16-bit values (the orchestrator's S1 rules that the
  `agc: false` gain object rounds to nearest, ties to even, and clips before `push`; no change to the module).
- The kept sample of a freed channel (0 by the fade) is not carried; the voice source's side was not re-read.

## The last run

`pnpm test` on `141fa4e` (the review round), exit 0, its last lines (the first round's run on `1c317e0` and on the
merge `ebde6a0` passed too, with 138 voice channel checks; CI passed on `ebde6a0`):

```
553 render-stream checks passed, 0 failed
103 output-stage checks passed, 0 failed
141 voice channel checks passed
109 steam sender checks passed
43 swresample checks passed
215 room checks passed (10.8 s)
```

CI: the `tests` workflow on the pushed head, as the hand-back says.
