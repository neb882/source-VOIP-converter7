# W3-28: the capture's step to 16 bits, dithered as Windows's is

The build report for `docs/work-orders/W3-28-capture-dither.md` (with its section "After the plan review"), branch
`claude/w3-28-capture-dither`, from `main` `a822707` (W3-26b merged). Main did not move while the branch was built.

`node tests/cache-number.mjs origin/main --report`: "cached files changed since origin/main (a822707): constants.js,
engine/live-chain.js, engine/render-stream.js, engine/render.js, engine/steam.js" and "cache number against
origin/main (a822707): the number is v56, not above v56: it must rise (node tests/cache-number.mjs origin/main
--set)". The number is the orchestrator's; the branch does not touch `sw.js`. No file the site loads was added,
removed or renamed.

## What changed

| File | Change |
| --- | --- |
| `engine/steam.js` | `createSteamCapture({ dither, seed })`, `steamCaptureStep(codec, rate, seed)` and `steamDitherTable()` beside `steamCapture`, which keeps its plain form; `captureConverter` takes `dither` (a boolean) and refuses any other value of it by name |
| `engine/render.js` | Steam's sender is pushed `steamCaptureStep(codec, srcRate, seed).push(samples)` in place of `steamCapture(samples)` |
| `engine/render-stream.js` | one step made with the sender, from the render's seed; every piece goes through it |
| `engine/live-chain.js` | one step made with the chain (`ioRate`, the chain's seed); every block goes through it, on both timelines and with the fallback of a profile with no `capture` (plain there) |
| `constants.js` | `steam`'s `capture` gains `dither: true`; its comment and the profile table's comment say what it does, where it runs, and that a frame-gate copy of the profile does not read it |
| `tests/steam.verify.js` | the suite's own table, start and step written from "The rule" (`ditherRef`, `ditherRefStart`, `ditherRefStep`); section [5e]; [5c]'s check "the render's capture is capture-converter.js's" at 48 and 44.1 kHz runs its own chain through `ditherRefStep` |
| `tests/verify.js` | [2]: the profile has `{ converter: 'windows', quality: 30, dither: true }` with those three members alone; a member more beside `dither`, and a `dither` of 1, `'yes'` or null, are refused by name |
| `tests/render-stream.verify.mjs` | `GOLDEN` and `GAIN_GOLDEN` of the 50 cases that moved, in a commit of their own, with the comment above them |
| `tests/render-channel.verify.mjs` | `LIVE_MAIN`'s three steam rows, in the same commit |
| `docs/VOICE-PATH.md` | the capture's row in the stages table, and the paragraph "16 bits" |
| `tests/README.md` | `verify.js`'s and `steam.verify.js`'s rows |
| `tests/REFERENCE_2026.md` | one dated line under finding 28, after "In the app" in "From the device to Steam's 16-bit samples"; nothing rewritten |
| `tests/predictions/PREDICTIONS.md` | its dated line |
| `docs/reports/W3-28/` | `hashes-before.txt` (the untouched tree) and `hashes-after.txt` (the branch), from `node tests/render-stream.verify.mjs --hashes` |

The suite is a section of `tests/steam.verify.js` ([5e]), not a suite of its own: it needs the steam render, the
stream render and the live chain that suite already loads, and a new suite would have to join `tests/run.mjs` and the
CI jobs, which the order does not list.

## The table

- **Its hash is the order's.** SHA-256 of the 4,096 values as 32-bit floats, least byte first:
  `7c3ef8d281fd1ce1bc9834c34c4c5a08add9b3ef0208ec23e02f82244d93ee91`. Three methods give it in a scratch run: the
  plain sum as the order writes it, the sum with the argument reduced modulo 4,096, and a radix-2 inverse transform.
  The largest difference between them before the rounding was 7.9e-13, against 5.6e-13 from the nearest value to an
  8-decimal boundary (measured once), the reviewer's figures.
- **The module's method** is the radix-2 inverse transform in double precision (bit reversal, butterflies with
  e^(+2 pi i j / len), then the factor 1/4096), each value rounded to 8 decimals in steps and then to a 32-bit float
  of steps / 32768. The suite makes the table a second way, by the plain sum, and holds the module's to it value for
  value and to the pinned hash.
- **Its time:** 5.3 ms for the first dithered capture in a fresh load inside the suite, and 7.5 ms in a scratch run
  of a bare load (measured once each, on a machine shared with other agents); the next capture takes 0.01 ms. It is
  made at the first `createSteamCapture` with `dither` true, never at load and never inside a live block (the live
  chain makes its step when the chain is made, before its first block).
- **Its figures** (the suite's detail line): mean 3.22e-11 of a step, rms 4.22e-10 under 1/sqrt(6), extremes
  -1.4599 and +1.5149 steps; on its values rounded to 8 decimals every bin of the transform is within 4.73e-7 of
  4096/sqrt(6 x 4095), the constant part 2.4e-7. These match the reviewer's.
- **It is module-private:** a holder object of `engine/steam.js`; `steamDitherTable()` hands out a copy, and the
  suite writes into the copy and sees the next copy unchanged.

## The step and where it runs

`createSteamCapture({ dither: true, seed })` keeps one index, starting at `floor(4096 x u)` with `u` the first draw of
`mulberry32((seed ^ 0x5D17E412) >>> 0)`; each sample is `fround(fround(x) + T[i])`, clipped to -1 and 32767/32768,
times 32768, `roundEven`. There is no clamp after the rounding. `start` is reported (null when plain).

`steamCaptureStep` dithers when the profile's capture has `dither: true` and the converter converts the source, that
is `Math.round(rate) !== 24000` (the converter rounds the rate the same way: 24,000.4 Hz is passed as it is and is not
dithered). It is called only where Steam's sender runs, so with the codec off, for received voice and for a demo's
packets the code does not reach it. The seed is the one the render already falls back to (`0xC0FFEE`).

**Kept place A.** A keeps the float capture signal at the codec's rate (`engine/render.js`, `kept.keep('a', ...)`),
before the step. The step's inputs are A's samples, the source's rate and the seed. The source is A's own key; the
seed is on `AFTER_A_OPTIONS` and so in B's key, and B (the sender's messages and the codec's results) is made after
the step. A kept A with a new seed therefore runs the step again from A with that seed, and B is never taken across
seeds: a kept A gives the render of a fresh run for every seed. The seed did not have to join A's key. `stages`
checks it: each option changed alone with warm stages, `seed` and `lossPct` among them, gives a fresh render's hashes,
from the stage the lists say.

## Hashes: what moved and what did not

`docs/reports/W3-28/hashes-before.txt` is the untouched tree at `a822707`; it equals W3-26b's
`docs/reports/W3-26b/hashes-branch.txt` in all 176 entries. `hashes-after.txt` is the branch.

- **`render-stream`: 50 of 88 cases moved,** in the WAV, codecInfo and gain hashes alike: every case that runs
  Steam's sender with the codec on from a source the converter converts. Of the 50 that W3-26b moved, 47 moved
  here. The three that did not: "steam, source at 24 kHz" and "steam, 192004 samples at 24000 Hz (an output length
  of 352807.35)", which the order names (no dither at 24,000 Hz), and "test profile with a decoder EQ", a copy of
  `steam` on the frame gate, which has no 16-bit step. The other three that moved are the cases W3-26b added (the
  converter from 44,056, 16,000 and 96,000 Hz). The 38 that did not move: the two 24,000 Hz cases, the decoder EQ
  copy, "steam, empty source", "steam, silent but for a quarter frame of sine at the end" (gated whole either way),
  "steam, codec bypassed", the four renders of a demo's voice, and every case of `steam_48`, `celt_22`, `celt_44`,
  `speex` and `miles`.
- **`render-channel`:** `LIVE_MAIN`'s three steam rows moved (48 kHz); its `celt_22` row did not. Its
  ends-in-silence table did not move: all eight of its rows are at 24,000 Hz, the rows the order names as fixed.
  Its main table (a demo's received voice) did not move either. The order expected the main and ends-in-silence
  tables to move; neither runs the step.
- **`stages`** reads `render-stream`'s table and passes with it; it records nothing of its own that moved.
- **`steam.verify.js`'s** "the render's capture is capture-converter.js's" at 48,000 and 44,100 Hz takes the
  dithered step, written a second time in the test, and passes.

## How far a render moves (item 7)

Measured once on the model (`process()` on `a822707` and on the branch, render-stream's speech-like signal and its
page options; the capture difference from the converter's output through each step, 48 kHz unless named). The level
of the difference between the two capture signals is -95.1 dBFS on talk (a third of the samples move, each by one
step) and -97.0 dBFS on silence. That is above the table's own level, -98.1 dBFS (1/sqrt(6) of a step, computed),
because the difference of two roundings is not the table itself; on silence it is exactly the rms of the table
rounded to steps.

| Case | Spurts | Messages | Bytes, before and after | Frames of 2 bytes or less |
| --- | --- | --- | --- | --- |
| steam, 20 s | 9 and 9 | 218 and 218 | 36,956 and 36,968 | 155 and 155 |
| gate off | 1 and 1 | 269 and 269 | 30,679 and 30,604 | 372 and 373 |
| gate on at -30 dBFS | 10 and 10 | 163 and 163 | 26,738 and 26,751 | 140 and 140 |
| high-pass 250 Hz, low-pass 3500 Hz | 10 and 10 | 163 and 163 | 24,822 and 25,142 | 142 and 142 |
| mic gain 4 | 6 and 6 | 178 and 178 | 31,516 and 31,566 | 132 and 132 |
| loss 15%, jitter 50 ms, 40 ms packets | 6 and 6 | 168 and 168 | 25,757 and 25,692 | 130 and 131 |
| from 44,100 Hz | 9 and 9 | 210 and 210 | 35,305 and 35,196 | 157 and 157 |
| from 96,000 Hz | 7 and 7 | 225 and 225 | 36,814 and 36,734 | 156 and 156 |
| from 22,050 Hz | 6 and 6 | 212 and 212 | 36,907 and 36,945 | 149 and 149 |
| seed 1 | 6 and 6 | 169 and 169 | 28,543 and 28,532 | 131 and 131 |
| seed 2 | 7 and 7 | 165 and 165 | 28,364 and 28,372 | 130 and 130 |
| seed 7, gate off | 1 and 1 | 272 and 272 | 30,577 and 30,515 | 373 and 373 |
| silence, gate off, 5 s | 1 and 1 | 91 and 91 | 716 and 869 | 236 and 236 |
| the -72 dBFS floor alone, gate off, 5 s | 1 and 1 | 91 and 91 | 2,265 and 2,258 | 223 and 223 |

The list of spurts (start, frames, pre-roll) is the same before and after in every case. The bytes move by at most
1.3% on talk and rise by 21% (153 bytes) on silence with the gate off. The frames of 2 bytes or less move by one in
two cases. The output samples differ in 56 to 95% of places on talk.

**The accuracy suite's public rows** were not run: every row of `tests/accuracy.takes.json` needs the owner's takes,
and the published recordings (`tests/recordings/files/`) are CELT and Speex files, which the step does not touch.
The private runs are the orchestrator's.

## The checks and the breaks

Each break was made in a scratch copy of the tree and the suite run against it with `TF2_DIR` ([5e] alone for the
first six, through a copy of the suite that skips its other sections).

| Break | What caught it |
| --- | --- |
| the table added after the clip | [5e] "the step is the rule's": the sine at 1.3 differs from sample 47 (sums past 32767/32768 give 32,768, which an `Int16Array` keeps as -32,768) |
| the index restarted at every push | [5e] "pieces equal the whole" (each plan differs at its second piece), "the index does not restart", and "one capture, one index" (the decoded messages are not the suite's chain's) |
| ties rounded away from zero | [5e] "the step is the rule's": 2,047 of the 4,096 exact ties not to even, and the sine differs from sample 1,671 |
| the clip at +1 and not at 32767/32768 | [5e] "the step is the rule's": on the sine at 1.3 no sample is 32,767; the value 32,768 that the break gives is kept as -32,768 by the `Int16Array`, so the positive peaks read -32,768 (10,590 of them) and the output differs from sample 34 |
| the table scaled by 1/32767 | [5e] the table's check (its rms 1.25e-5 off and its hash), and "the step is the rule's" (50 ties not to even) |
| the dither left on for a 24,000 Hz source | [5e] "steamCaptureStep dithers where ..." (a start at 24,000 Hz) and "where the step does not run" (every 24 kHz render apart), and `render-stream`'s two 24,000 Hz cases (below) |

[5e]'s checks: the table (above); the table made once; the step against the suite's own on noise, quiet noise, a sine
at 1.3 that clips at both ends, silence and 4,096 exact ties built on the sum (each proved exact first:
`fround(x + T[i]) x 32768 = k + 0.5`), 2,048 from an even k and 2,048 from an odd; silence in, every value from -2
to +2, not all 0, with the rms of the table rounded (-1: 1,365, 0: 9,648, +1: 1,272, +2: 3 over 12,288 samples);
pieces of 1, 7, 240, 750 and 4,097 and of those in turn equal one push; pushes of 1,000 and 7,192 samples of silence
equal one of 8,192 and differ from a step restarted at the second; `steamCaptureStep`'s start at 48, 44.1 and 16 kHz
and none at 24 kHz, at 24,000.4 Hz, with dither false or absent; renders of the profile and of a copy with dither
false the same (samples and codecInfo but the codec's name) for a 24 kHz source with the gate on and with it off and
loss 20%, the codec off at 48 kHz, received voice at 24 and 48 kHz and a demo's packets on the game's timeline, and
the stream render and the live chain at 24 kHz, while from 48 kHz with the codec on they differ; two seeds whose
starts differ, each with the messages (their ticks, places and which were lost, loss 20%, the gate off) and the
sender's and the network's counts of the plain step at that seed; and from 48 kHz `process()`, `createRender` in
pieces of 1, 777, 4,097 and 30, and the live chain in blocks of 441, decoding the messages of the suite's own chain
(`capture-converter.js`, `ditherRefStep`, the sender, `steamRoundTrip`), the live chain its first 90 of 91.

`tests/verify.js` [2] refuses the bad members by name (a member more beside dither, a dither of 1, `'yes'`, null).

## Runs

- `flock /tmp/tf2ve-heavy.lock pnpm test` on the code before the hashes were recorded: 24 of 28 suites passed;
  harness failed on a `let` at `engine/steam.js`'s top (fixed in its own commit, harness then 39 passed, 0 failed),
  and render-channel, render-stream and stages failed only in their checks against recorded hashes (the moved cases
  above, each named "the recorded ..." or "main's samples").
- `flock /tmp/tf2ve-heavy.lock pnpm test` after the hashes' commit: "28 of 28 suites passed. 1549.0 s summed, 1549.0 s
  of wall time, 1 at a time."
- The browser suite (`CHROMIUM_EXECUTABLE=... pnpm test:browser`), twice on the branch: both runs stop at "Error: a
  source of 30 s gets no first seconds" (`tests/browser.verify.js`, `speedFirstSeconds`), after 551 checks passed
  and none failed. The same suite run from a copy of `main` at `a822707` on this machine stops at the same check in
  the same way, so the stop is this machine's and not the branch's. CI's `browser` job passed on the branch
  (below).
- CI on `98cd722` (the hashes' commit): run 44877738137, `verify` success (units, engine, render, stages and browser
  success). The commit of the documents and this report changes only `docs/` and `tests/` documents and the
  predictions' notes; its run is read in the hand-back.
- `--hashes` at the end, after the full run: the same file as the one taken after the change, byte for byte
  (`docs/reports/W3-28/hashes-after.txt`).
- The 24,000 Hz break against `render-stream`: the two 24,000 Hz cases fail, in their WAV and codecInfo and their
  gain hashes (4 failed, 632 passed), and nothing else.

## Scanned

`git diff origin/main...HEAD` and the branch's commit messages were scanned for recordings, personal details, real
SteamIDs and model names: none, but the attribution trailer each commit message ends with.

## Not done, and what to know

- `README.md` (line 104) and `docs/ACCURACY.md` (lines 47, 60 and 77) still say the app rounds with no dither (not
  built yet). The order does not name them, so the branch leaves them to the orchestrator.
- The accuracy suite's public rows: none exist for `steam` (above).
- The level of the capture's difference is -95.1 dBFS on talk, not the table's -98.1: the order's "about -98" is
  the table's own level; the difference of two roundings is larger (above).
- The live chain's rebuild on a change of settings makes a new chain, and with it a new step from the seeded start;
  no check of the live worker's rebuild was added (the worker is not in the order's list).
