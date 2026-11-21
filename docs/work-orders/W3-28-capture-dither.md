# W3-28: the capture's step to 16 bits, dithered as Windows's is

Written by the orchestrator, 2026-11-21, after two private reads of the owner's Windows files
([tests/REFERENCE_2026.md](../../tests/REFERENCE_2026.md), finding 28, "From the device to Steam's 16-bit
samples"). **Not built. It waits for W3-26b's merge**, since it changes the step right behind the converter that
W3-26b wires in. It moves every `steam` render that W3-26b moved, by a noise of about 0.4 of one 16-bit step, and
raises the cache number once. A builder, a reviewer and a second reader (it changes renders).

## Why

Steam asks Windows for 16-bit samples, and Windows works in float: the last stage of the capture stream's pipe
turns float into 16 bits, and it adds a dither before it rounds (read twice). The app's `steamCapture`
(`engine/steam.js`) rounds with no dither. The difference is very small in level (the added noise is about
98 dB under full scale) and it is one of the stages between the microphone and the encoder, so it is built as
read: where the source is silent Steam's gate and encoder see -1, 0 and +1 and never a run of zeros, and a quiet
sound is not rounded the same way twice.

## What is read, measured and chosen

| What | Value | Standing |
| --- | --- | --- |
| The step | to each sample a table value is added in 32-bit float; the sum is clipped to -1 and 32767/32768, multiplied by 32768 and rounded to nearest, ties to even | read twice |
| The table's use | one value a sample; the index starts at 0 when the stream is set up and runs on, modulo 4,096 | read once |
| The table | 4,096 values of normal shape, mean 0, rms 1/sqrt(6) of a step, extremes about -1.47 and +1.49 steps, a spectrum exactly flat (every bin of magnitude 4096/sqrt(6 x 4095) = 26.131081, the constant part 0), phases random | measured on the private copy |
| The table's own values | the file's; not in this repository, and no rule that makes them again was found | not found |
| The app's table | the same spectrum with phases drawn by the app from a fixed seed | chosen |
| Where the index stands when the sound begins | drawn from the render's seed, 0 to 4,095 | chosen: the stream is set up some time before the sound, and nothing read says how long |
| A 24,000 Hz source | no dither, as no conversion (W3-26's first ruling) | chosen: such a source is taken as what Steam itself read, the file-as-microphone road of Set J, where Windows's road is not taken and the chunks do show peaks of 0 (measured once) |

## The rule

**The table `T`**, made once, the same in every render:

1. Draw 2,047 phases, each `2 * Math.PI * u` with `u` the next draw of `mulberry32(0x28D17E5)`, in order, for
   bins 1 to 2,047.
2. The spectrum has 4,096 bins. Bin 0 is 0. Bins 1 to 2,047 have the magnitude `M = 4096 / Math.sqrt(6 * 4095)`
   and those phases. Bin 2,048 is `+M`, real. Bins 2,049 to 4,095 are the complex conjugates of bins 2,047 to 1.
3. `t[n]` is the inverse transform with the factor 1/4096, in double precision:
   `t[n] = (1 / 4096) * (M * (-1)^n + 2 * M * sum over k = 1..2047 of cos(2 * Math.PI * k * n / 4096 + phase[k]))`.
   The builder may compute it by any exact method (the plain sum is 8 million cosines, once), and says in the
   report how long it takes; if it is over 50 ms the table is made on first use and not at load.
4. `T[n] = Math.fround(Math.round(t[n] * 1e8) / 1e8 / 32768)`.

So `T` has mean 0 and an rms of 1/sqrt(6) of a step by construction (the suite checks both, and the extremes
it gets are recorded, not required to equal the file's).

**The step**, for a float sample `x` at 24,000 Hz and an index `i`:

```
s = Math.fround(Math.fround(x) + T[i]);   i = (i + 1) % 4096;
if (s > 32767 / 32768) s = 32767 / 32768;   if (s < -1) s = -1;
q = round to nearest, ties to even, of (s * 32768)        // -32768 .. 32767
```

**The index** belongs to the capture, not to a call: a render, a stream fed in pieces and the live chain each keep
one index for the whole capture, so that sound taken in pieces gives the samples of the whole. Its start is drawn
from the render's seed with a mix value of its own (`0x5D17E412`, chosen), so that it moves no other draw.

**Where it runs.** On the `steam` profile with the codec on, for a source that the capture converter converts
(any rate but 24,000 Hz). The profile's `capture` member gains `dither: true`. Where it does not run, the step
is as today, bit for bit: the other profiles (none of them uses `steamCapture`), `steam` with the codec off,
received voice, a caller's packets, and a 24,000 Hz source.

## What to build

1. **`engine/steam.js`**: `steamCapture` keeps its plain form for the cases above. Beside it, a capture step with
   an index: `createSteamCapture({ dither, seed })` giving `{ push(x) -> Int16Array }`, plain when `dither` is
   false. The table is module-private and frozen in effect (a `Float32Array` nothing writes to).
2. **The three paths**: `engine/render.js`, `engine/render-stream.js` and `engine/live-chain.js` make one capture
   step for a capture and push every piece through it. The live chain's second path and its fallback, as W3-26b
   left them, take the same step.
3. **The seed.** The index's start is `Math.floor(4096 * u)` with `u` the first draw of
   `mulberry32((seed ^ 0x5D17E412) >>> 0)`. An unseeded render uses the seed the render already falls back to.
4. **Kept place A** (the kept capture signal of W4-01b): the dithered 16-bit step is behind A today (A keeps the
   float capture signal). Say in the report where the step now sits against A and why a kept A still gives the
   render of a fresh run for every seed; if the seed must join A's key, stop and ask.
5. **The suite** (`tests/steam.verify.js` or a suite of its own, the builder's choice, said in the report):
   - the table: its length, mean (under 1e-9 of a step), rms (1/sqrt(6) within 1e-6), that every bin of its
     transform has the magnitude M within 1e-6 after the rounding to 8 decimals, and a hash of its 4,096 values;
   - the step against a second computation written in the suite from "The rule" (not a call of the module), on
     noise, on a full-scale sine that clips at both ends, on exact halves (ties), and on silence;
   - silence in: the output's values are within -2 to +2 and are not all 0, and their rms is that of the table
     rounded;
   - pieces equal the whole: one capture pushed in pieces of 1, 7, 240, 750 and 4,097 samples equals one push;
   - the index does not restart: 8,192 samples of silence in two pushes equal twice the first 4,096 only if the
     start is the same, and differ from a restarted step;
   - a 24,000 Hz source, the codec off, received voice and a caller's packets give today's bytes;
   - two seeds differ in the index's start and in nothing else of the sender's draws (the clock's reads, the
     capture's lead and the loss are those of main for each seed).
   Breaks, each made and seen to fail: the table added after the clip; the index restarted at every push; the
   rounding of ties away from zero; the clip at +1 and not at 32767/32768; the table scaled by 1/32767; the dither
   left on for a 24,000 Hz source.
6. **Hashes.** `render-stream`'s recorded hashes and every other pinned figure of a `steam` render with the codec
   on move; the builder lists each moved case, and each case that W3-26b moved must be among them or be named
   with the reason it is not. A hash of any other case, if it moves, is a reason to stop.
7. **How far a render moves** (for the report, measured on the branch against its base): on the suite's signal,
   the level of the difference between the two renders' capture signals (it should be the table's, about
   -98 dBFS), and whether any gate decision, message count or packet's size in bytes changes on the suite's
   seeded cases; the accuracy suite's public rows before and after.
8. **The words**: `constants.js`'s comment on the profile's `capture` member; `docs/ARCHITECTURE.md` or the
   document that lists the stages, where the capture's steps are named; `tests/README.md`;
   `tests/REFERENCE_2026.md` gains one dated line under finding 28 ("in the app since W3-28: …"), nothing
   rewritten; `PREDICTIONS.md` gains its dated line as for any render change; the report
   `docs/reports/W3-28-capture-dither.md`.

May touch: `engine/steam.js`, `engine/render.js`, `engine/render-stream.js`, `engine/live-chain.js`,
`constants.js` (the profile's member and its comment), the suites and their recorded hashes, the documents named.
May not touch: `capture-converter.js`, `steam-sender.js`, `voice-channel.js`, `tests/predictions/predictions.json`,
`sw.js`'s number (the orchestrator sets it at the merge).

Done means: `pnpm test` passes; the browser suite passes; `--hashes` before and after are beside the report with
the moved cases named; each break was made and seen to fail;
`node tests/cache-number.mjs origin/main --report` names the changed site files; CI's `verify` is green on the
branch's head.

## The private runs (the orchestrator's, before the merge)

The accuracy suite on the private rows at nine seeds, before and after; Steam's activity lines of Set L against a
render's capture of a quiet stretch (the share of chunks with a peak of one step); and, when the owner's take of
what Steam captured arrives (`docs/owner-runs.md`, part C), the file's quiet stretches against the step: their
values' histogram and their spectrum against the table's description.

## Not in this order

- The table's own values, and the index's true place at a spurt's start: not known.
- The fold to one channel: the app takes the left channel by default already (finding 6; read on 2026-11-21).
- The lateness of a capture step and the 20 ms packets: the sender's clock (W3-27).

## After the plan review (2026-11-21)

A reviewer who had not seen the order being written read it against W3-26b's branch, made the table six ways
and tried the step in a scratch copy. Verdict: build with the changes below. Where a line here and a line above
differ, this section is the one the builder works from.

- **The profile's member.** W3-26b's `captureConverter` (`engine/steam.js`) refuses a `capture` member with any key
  but `converter` and `quality`, and `tests/verify.js` holds the profile to those two. So: `captureConverter`
  accepts `dither`, a boolean, and refuses any other value of it by name; a key other than the three is refused as
  now; the checks of `tests/verify.js` take the new member and keep "a member more is refused" with another key.
  On a frame-gate copy of `steam` there is no 16-bit step, and the member is ignored there: the comment says so.
- **The table is pinned by its hash, and any method that gives it may be used.** Made six ways (the sum as
  written, the argument reduced modulo 4,096, the sum taken downward, cosine and sine apart, the magnitude inside
  the sum, a radix-2 inverse transform) it comes out the same 4,096 values, but with little room: one value lies
  5.6e-13 from a rounding boundary of the 8-decimal step and the methods differ by up to 7.9e-13 (measured once,
  the reviewer's). The rounding to 8 decimals stays. The SHA-256 of the table's 4,096 values as 32-bit floats,
  least byte first, is `7c3ef8d281fd1ce1bc9834c34c4c5a08add9b3ef0208ec23e02f82244d93ee91` (measured once, the
  reviewer's; the builder's own count must give it, and the suite pins it). If the builder's does not, the
  builder stops and says which method gave what.
- **Where the table is made.** The plain sum took 191 ms and a radix-2 transform 7 ms (measured once). The table
  is made by a method that takes under 20 ms, at the first `createSteamCapture` with `dither` on, never inside a
  live block.
- **The table's figures with the order's seed** (measured once, the reviewer's): mean 3.2e-11 of a step, rms
  within 4.2e-10 of 1/sqrt(6), extremes -1.4599 and +1.5149 steps. The spectrum check is taken on the values
  rounded to 8 decimals, before the float32 step, where the worst bin is 4.7e-7 off the magnitude; on the float32
  table it is 1.61e-6 off, which the order's bound would have failed.
- **The step has no clamp after the rounding.** The clip to -1 and 32767/32768 before the multiply is the whole of
  it (the largest result is 32,767). With a table of zeros the step equals today's `steamCapture` on every
  float32 input, the two ends included (the reviewer's count). The break "the clip at +1" is then seen by the
  value 32,768 that it would give; the builder says how the check sees it.
- **The ties** are built on the sum, not on the input: `x = Math.fround((k + 0.5) / 32768 - T[i])` for chosen `k`
  and `i`, with the check first proving that `Math.fround(x + T[i]) * 32768` is exactly `k + 0.5`. The rounding is
  `roundEven` of `engine/dsp.js`.
- **"The index does not restart"** is tested with pushes of 1,000 and then 7,192 samples of silence against one
  push of 8,192 and against a step restarted at the second push (two pushes of 4,096 cannot tell them apart,
  since the table repeats every 4,096).
- **The live chain's rebuild** on a change of settings is a new capture: its index starts again at its seeded
  place. A stream fed in pieces is one capture.
- **The sender's own zeros never pass the step.** `steam-sender.js`, which this order does not touch, makes the
  lead's zeros (0 to 749 samples) and the zeros it reads after the source ends; they stay zeros. The index starts
  at the source's first sample. "Never a run of zeros" above holds for the source's own silence only.
- **The hashes that must not move.** W3-26b moved the 24,000 Hz cases (they ran the fitted filter); under this
  order they must equal W3-26b's merged values, and a change in any of them is a stop: `render-stream`'s
  "steam, source at 24 kHz" and "steam, 192004 samples at 24000 Hz", and the 24,000 Hz rows of
  `render-channel`'s ends-in-silence table. **The suites whose records move:** `render-stream` (its two tables of
  hashes), `stages`, `render-channel` (its live, main and ends-in-silence tables), and the check of
  `tests/steam.verify.js` "the render's capture is capture-converter.js's" at 48,000 and 44,100 Hz, whose own
  chain takes the dithered step written a second time in the test.
- **What item 7 measures.** Every packet's size can change, so the question "does any packet's size change" is
  always yes. Asked instead, for each seeded case of the suite's signal, before and after: the list of spurts,
  the count of messages, the total bytes, and the count of frames of 2 bytes or less. The reviewer's scratch run
  (two rates, two seeds, the gate on and off, speech and silence; measured once): the spurts and frame counts
  the same in all 16 renders, total bytes within 0.4% on speech and about 22% (some 100 bytes) on silence with
  the gate off, output samples different in 60 to 95% of places with speech and nowhere on gated silence.
- **Standings corrected in the table above:** the step's formula is read twice, and the rounding of ties and the
  index's running on are read once; "about 98 dB under full scale", "about 0.4 of a step" and 26.131081 are
  computed from the table's description; the table's seed `0x28D17E5`, the sign of bin 2,048 and the index's mix
  value are chosen. The mix value collides with none in use (the reviewer's count over seeds 0 to 100,000).
- **Kept place A** needs no change: the step sits behind A, and the seed is already in the key of the place
  behind it (the reviewer's reading; the builder confirms it in the report).

## A ruling after the build (2026-11-21): the table's seed

This holds over "The rule" and "After the plan review" above where they name the seed and the hash.

- **What was found.** The table built from `mulberry32(0x28D17E5)` has one value beyond 1.5 steps (+1.51486488;
  measured once by the orchestrator on the built branch). A silent input then gives a sample of 2 once in every
  4,096 samples. Windows's table stays inside 1.5 steps (extremes -1.47 and +1.49, measured on the private
  copy), so a silent input through it gives only -1, 0 and +1 (computed from those extremes). The description
  the order copied named the extremes and did not make them a condition.
- **The ruling (chosen).** The seed is `0x28D17E6`: the first seed after `0x28D17E5` whose table has every value
  inside 1.5 steps. Nothing else of the rule changes. Its table by the plain sum of "The rule": extremes
  -1.38477267 and +1.34817641 steps, rms 1/sqrt(6) to nine places, 887 of 4,096 values beyond half a step, and
  the SHA-256 of its 4,096 float32 values, least byte first,
  `a2befc20946bdd05889adb16f5dc87cf6a5d8a1bda05079fa2bfdc2537a45195` (measured once by the orchestrator; the
  same script gives the first seed's pinned hash).
- **The checks gain two.** No value of the table reaches 1.5 steps in size; and a silent input through the
  dithered step, 8,192 samples from any start, gives only -1, 0 and +1, with each of the three present.
- **What moves.** Every hash the first build moved moves again, and no other.

## W3-28 as built (2026-11-21)

Merged 2026-11-21 with the cache number at v57. Report:
[docs/reports/W3-28-capture-dither.md](../reports/W3-28-capture-dither.md). A reviewer and a second reader read the
build apart; both found the mechanism right. Two rounds of fixes followed: the ruling's seed, then a check that
could not fail, a refusal's wording and words in the documents.

- The `steam` profile's member is `capture: { converter: 'windows', quality: 30, dither: true }`. `engine/steam.js`
  has `createSteamCapture({ dither, seed })` and `steamCaptureStep(codec, rate, seed)`; the render, a render fed in
  pieces and the live chain each make one step for one capture. The table is made at the first dithered capture
  (about 7 ms, measured once by the builder), never at load.
- **The table** is the ruling's: seed `0x28D17E6`, SHA-256 `a2befc20...37a45195` by the builder's transform, the
  builder's plain sum, the orchestrator's and the second reader's own. Extremes -1.38477267 and +1.34817641
  steps; a silent input gives only -1, 0 and +1, 0 on 78% of samples, the longest run of zeros 58 samples
  (computed).
- **What moved:** 50 of `render-stream`'s 88 cases and LIVE_MAIN's three steam rows of `render-channel`, the same
  set in the first build and after the seed's change (the builder's lists, the reviewer's count). The two named
  24,000 Hz cases did not. The order expected `render-channel`'s main and ends-in-silence tables to move: they do
  not, since one is received voice and the other is all at 24,000 Hz (the builder, confirmed by the reviewer).
- **A second port:** the second reader built the table and the step from "The rule" alone; it equals the built
  capture sample for sample at three rates, whole, in pieces and in the live chain, and its sender gives the same
  messages. Across 39 cases nothing moved that should not.
- **What the dither does on the model** (measured once by the second reader and the builder): a -90 dBFS tone
  keeps its level in the capture with its third harmonic under -137 dBFS, where plain rounding gave -91.8 and
  -106.7; a -100 dBFS tone survives the capture where it was all zeros; with the gate on, silence still sends
  nothing, and the spurts and the count of messages do not change; with the gate off, silence costs a fifth more
  bytes and the decoded floor rises from about -109 to about -97 dBFS.
- **The private runs** (the orchestrator, measured once; `tests/REFERENCE_2026.md`, finding 28, "The dithered
  step on the private takes"): the accuracy suite's level figures a little better in the mean; the band from 11
  to 12 kHz on the test signal's rows 1.1 to 1.6 dB lower and nearer the takes, all of it the encoder's DTX on
  the test signal's 11 kHz tone, which the dither brings from 23 to 41 frames of 50 to 8 to 31, where the takes
  have 8 to 18.
- **Left as chosen:** the sender's own zeros (the lead, the first spurt's pre-roll, the end) stay zeros where
  Windows would give dither; a source at 24,000 Hz is not dithered; the hand-set filters act between the
  conversion and the step. The bytes on talk followed by silence: the builder measured -0.3 to +0.2%, the second
  reader +1.1 to +2.8% on a case of its own; the report gives both and does not settle it.

