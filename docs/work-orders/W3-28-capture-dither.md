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
