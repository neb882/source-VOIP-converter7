# W3-05 report: the receiver's gain, as the engine computes it

Branch `claude/w3-05-receiver-gain`, from `main` at `c8a11ec` (W2-02 merged), with `origin/main` merged in three times
(`d01e830`: W3-02a, the plans, the reference; `559f72f`: W3-12a; `4cf0292`: W3-02b. Each time the one conflict was
the `test` line, and every suite was kept, `tests/speex102.verify.mjs` and `tests/steam-sender.verify.mjs` included).

**Status: done.** The orchestrator's private acceptance passed on `9bef10c`: Set H through
`tests/gain-exact.mjs` gives 0 of 291,840 samples different before the last 512, and 511 of 512 in the last. Two
changes followed: one rounding per float operation (answer 2), then a 32-bit product that wraps (the second read,
below). `pnpm test`, the browser suite and CI pass on the final head.

## The orchestrator's answers (after the first hand-back)

1. **`tests/opus.verify.mjs` (the question): authorised, and changed.** That file is now in this order's files. Its
   check "Receiver mute is exact silence" (a render at `voice_scale 0` all zeros) is now "Receiver mute is exact
   silence after the first block". The reason is spec point 3: every render starts from a reset, and the first 128
   voice-rate samples pass at unity. That first block at unity is the engine's reset as W3-03 read it: the gain is
   set to 1.0 when a channel is assigned, and `voice_scale` first enters at the end of the first block. It was read
   from the binary, not measured: no take at a scale other than 1 shows it.
2. **One 32-bit rounding per float operation (reading 5 changed).** The box rounded the denominator once; the
   orchestrator gave that as shorthand. The rule now rounds every operation, as compiled single-precision code does.
   In the denominator that is the product `(peak - mean) x avggain`, then the sum with `mean`. In the step it is the
   difference, the quotient by 127 and the product by 128. The division `32767 / den`, the `min` with the cap and
   each `x scale` were already single operations, each rounded. This was first inferred from how single-precision
   code compiles; the second read of the gain function (below) has since confirmed it. Set H cannot tell: at
   `voice_avggain 0.5` the product is exact in 32 bits, so the two readings agree.
   `audio.js` and the transcription (`tests/gain-exact.mjs`) both changed.
   - **No golden hash moved.** Every case is at an `avggain` whose product is exact (0.5, or 0.25): render-stream
     passes, 145 checks, on the recorded hashes.
   - **A new check** at `voice_avggain 0.3` pins a case where the readings differ. The input is a block with integer
     mean 2993 and peak 14861, then two blocks of 1000. Rounded per operation, `den` is 6553.400390625; rounded once,
     6553.39990234375. That puts the target either side of 5, so `fixed` is 639 or 640. Sample 256 is 4992 per
     operation and 5000 rounded once.
   - **The break, proved:** with the single rounding put back
     (`const den = f32(mean + (peak - mean) * avgGain);`), `tests/gain.verify.mjs` fails:
     ```
       FAIL  den rounds the product, then the sum: at voice_avggain 0.3 sample 256 is 4992 (rounded once, 5000)   [5000]
     55 gain checks passed, 1 failed
     ```
     `gain-exact --synthetic` still passes under that break, as it should: it runs at 0.5.
   - **The case for `den` in doubles** (section 1b) was found under the single rounding, and under per-operation
     rounding it gave the doubles' result. It was found again: mean 10895, peak 14646, `avggain` 0.7, `voice_scale`
     0.7; sample 256 is 1179, and 1187 in doubles. With `den` in doubles, three checks fail: that case, the
     `current` case and the 0.3 case.
   - **Joining the step's roundings into one** changes nothing and is not caught. Multiplying by 128 is exact in 32
     bits, so `f32(f32(q) x 128)` and `f32(q x 128)` are the same number.
3. **The 32-bit product (reading 4): corrected after a second read; it can overflow, and it wraps.** The first
   answer bounded the gain at `voice_maxgain 100 x voice_scale 4 x 128 = 51,200`, but `current = next x scale` and
   `next` already carries one scale. So at a block start `g` reaches maxgain x scale² x 128 = 204,800 at the app's
   limits, and 204,800 x 32,768 passes 2^31. See "The second read" below.
4. **`sw.js`: authorised.** `CACHE` is now `v21` (`5e59419`), after merging `origin/main`.
5. **`VOICE_ENGINE.autoGain.blockSize`** (in `constants.js`, not this order's file) is no longer read. W3-11a's builder
   will remove it.
6. **The REFERENCE note and the PREDICTIONS figure are the orchestrator's;** the placeholder stays.

## The second read of the gain function (2026-11-10)

The orchestrator read the engine's gain function again on the points that were still open. What was read:

- **The product wraps.** `x` is the 16-bit sample sign-extended to 32 bits (`0x18005a392`). `g` is recomputed every
  sample: a 32-bit signed multiply of the position by `step`, then a 32-bit add of `fixed` (`0x18005a38b`,
  `0x18005a397`). The product is a 32-bit signed multiply that keeps the low 32 bits (`0x18005a39a`): nothing widens
  and nothing saturates. Then comes an arithmetic right shift by 7 (`0x18005a3a2`), then a clamp to -32768..32767 by
  compares (`0x18005a3a5` to `0x18005a3ac`).
- **Every float operation is scalar single precision,** one at a time, with no fused multiply-add and no double
  anywhere, in this order: `current`; `fixed` by a truncating convert of `current x 128`; the mean by a 32-bit signed
  integer division; `peak - mean` as an integer subtraction before the conversion; the multiply by `avggain`, then a
  separate add of the mean; 32767 divided by that, with no test for zero, so a zero blend gives +infinity; the cap;
  times `scale`; the step as subtract, divide by 127, multiply by 128, truncating convert. That is the order this
  branch already had, so the per-operation rounding is now read, not inferred.
- **The cap** is a single-precision minimum that keeps the quotient only if it is strictly less than maxgain, and
  gives maxgain otherwise, a NaN included.
- **`|x|` of -32768 is 32768** (a 32-bit negate), and the sum and peak are taken from the input sample, before the
  gain is applied.
- **The reset** writes `current = next = 1.0`, `fixed` 128, and `step`, the position, the sum and the peak 0. It also
  stores the three settings, which are read only at a reset. So the first block is at unity whatever `voice_scale`
  is.
- **Still inferred:** round-to-nearest as the thread's rounding mode. No voice code changes it, and the
  291,840-sample match supports it.

What changed on this branch for it (`gainRule` and the transcription in `tests/gain-exact.mjs`):

- `g = (fixed + Math.imul(pos, step)) | 0` and `y = Math.imul(g, x) >> 7`, then the clamp. The earlier code took the
  floor of the exact product, which clamps a wrapped product to full scale instead.
- The cap is written as read, `t = t < maxGain ? t : maxGain`, and `t = f32(32767 / den)` has no test for zero.
  Neither change can alter an output: the options never give a NaN quotient (`finiteOr` keeps every setting finite,
  and the blend is never negative), and `32767 / 0` was already +infinity. So no check can separate the two forms,
  and the old cap form put back (W5) fails nothing.
- `|x|` and the input-side sum and peak were already as read. They now have a check each.
- The comments in the code that said "inferred" now say "read".

**No golden hash moved.** At the defaults and at the page's own limits (`voice_scale` up to 2) nothing wraps. The
render-stream suite passes (145 checks) on the recorded hashes, and `gain-exact --synthetic` still gives 0 and 1.

**The new checks** (`tests/gain.verify.mjs`, section 2, now 60 checks):

| Check | Pinned |
| --- | --- |
| two blocks of zeros at `voice_maxgain 100`, `voice_scale 4` (`fixed` 204,800 at block 2), then a sample of 12000 | -32768 |
| the same, then a sample of 20972 | 768 |
| a block of -32768, then two of 1000 | block 2 starts at 992 (`fixed` 127); with `|x|` capped at 32767 it would be 1000 |
| blocks of 16384, 8000 and 1000 | block 2 runs from 1992 to 3976. Its end depends on block 1's target, which comes from the 8000s, not from the output ramping toward 16,000 |

**The breaks:**

| Break | What failed |
| --- | --- |
| W1 the floor of the exact product (the code before this change) | both wrap checks |
| W2 a 32-bit product that saturates | both wrap checks |
| W3 `|x|` of -32768 taken as 32767 | the -32768 check (1000); 14 transcription checks |
| W4 the sum and peak of the clamped output, after the gain | the input check (1992..1992); 28 transcription checks, and others |
| W5 the cap as `t > maxGain` (the earlier form) | nothing: unreachable, as said above |

Under both W1 and W2:

```
  FAIL  the product wraps at 32 bits: after two quiet blocks at maxgain 100, scale 4, a sample of 12000 comes out as -32768   [32767]
  FAIL  the product wraps at 32 bits: after two quiet blocks at maxgain 100, scale 4, a sample of 20972 comes out as 768   [32767]
58 gain checks passed, 2 failed
```

`gain-exact --synthetic` passes under W1, as it should: it runs at `voice_maxgain 10`, `voice_scale 1`.

## The review's findings (on `95e7a98`), and what was done

The reviewer wrote an implementation of its own from the order, before reading this one. It agreed with this
branch on 10,000 seeded cases (about 108 million samples) and reproduced all 47 golden hashes. Finding 1 was the
overflow, fixed as read above.

**Finding 2: the live chain's 64 sent flags were too few for long calls.** One call to the live chain's `process`
codes all its frames before any of their samples reach the gain. So a call of more than about 63 frames (over 1.28 s
for Steam, 0.37 s for `celt_44`) read its evicted frames as decoded, and a gated block of zeros sent the gain to the
cap. The page sends 20 ms blocks and cannot reach this, but the function is public. Now the flags grow as needed and
are dropped only once the gain has passed the block their samples begin in. A new check, after the reviewer's, feeds
12 s of a noise floor with four tone bursts in 20 ms blocks and in 3 s blocks, on `steam` and on `celt_44` with the
gate. The two must give the same samples: 0 of 569,232 and 0 of 570,079 differ. Under the old ring of 64, and under
a ring of 8:

```
  FAIL  live chain, steam with the gate: 3 s blocks give the samples of 20 ms blocks   [275 of 569232 differ]
  FAIL  live chain, celt_44 with the gate: 3 s blocks give the samples of 20 ms blocks   [253 of 570079 differ]
65 gain checks passed, 2 failed
```

**Finding 4: mutants that survived every check.** Each now has a check, and each check fails under its mutant:

| Mutant | The new check | Under the mutant |
| --- | --- | --- |
| M01 the hold reads the block's sample 1, not 0 | a block of zeros whose first sample alone was not decoded is held (block 2 flat at 20) | `first sample alone not decoded: 19..99` |
| M21 `maxGain` not rounded to 32 bits | `voice_maxgain` 42.9, `voice_scale` 0.67, two blocks of zeros, then 1000s: sample 256 is 19257 (found by a search) | `[19250]` |
| M22 the mapping rounds the codec sample | `TF2Audio.decodedFromFrames` (now exposed for tests) against the frame log's spans at every voice-rate sample: Steam's rates in the gate check, and 8 to 11.025 kHz on a made-up log with a lookahead of 37 | 4 of 198,450 differ; 145 differ |
| M24 the lookahead off by one | the same two checks | 8 of 198,450; 218 |
| M27 `createRender`'s `decoded()` built with lookahead 0 | `createRender` in 0.1 s pushes against `process()`, bit for bit, on the gate check's source | `FAIL  createRender, in 0.1 s pushes, gives process()'s samples bit for bit on this source` |

On M27: the reviewer found no output that showed it, because on a quiet tail the hold and the cap converge. On
the gate check's source the floor is loud under a raised threshold, so the tail's target is under the cap. There, the
blocks just past a spurt's last frame show the lookahead: with none, they count as sent, run as decoded zeros and
send the gain to the cap where `process()` holds it. 3 samples differ. The mapping checks also show the lookahead to
be exact on the codec-rate signal. Every gated frame's span `[f x size - lookahead, (f + 1) x size - lookahead)` is
exact zeros, and the first sample of each sent frame after a gated one is not zero (lookahead 156 at 24 kHz).

`tests/gain.verify.mjs` now has 67 checks.

**Finding 3, known and left: with `retime` on, `decoded()` can misjudge blocks at a moved spurt's edge.**
`retimeSpurts` moves the audio by a rounded shift in samples but the frame log by whole frames. So the log and the
audio can be misaligned by up to half a frame at a moved spurt's edge. The reviewer counted 2,387 codec samples, over
12 seeds and 16 moves, that lie inside spans the log calls gated and are not zero. In one seed, two moves shifted the
audio by 1,210 and 3,515 codec samples and the log by 1,440 and 3,360: 3 to 4 voice-rate blocks per edge. This affects
`process()` only (`createRender` refuses `retime`), and only with `retime` on (the page's default is off). `retime` is
retired by W3-02f, so it is not fixed here.

## Commits

- `0fb0963` The rule in `audio.js`, and the two moved expectations in `tests/verify.js`.
- `2c6072e` The golden hashes of `tests/render-stream.verify.mjs`, re-recorded, in a commit of their own (below).
- `06ce70a` `tests/gain.verify.mjs`, `tests/gain-exact.mjs`, and the `test` line.
- `74b55f0` Three test gaps that breaking the code found (the 32-bit floats, a frame edge inside a block, the live
  chain).
- `d01e830` A merge of `origin/main`.
- `921e7b7` The `PREDICTIONS.md` paragraph.
- `9bef10c` this report (the first hand-back).
- `559f72f` a merge of `origin/main` (W3-12a).
- `1d63731` one 32-bit rounding per float operation, with its check; the `tests/opus.verify.mjs` change.
- `5e59419` `sw.js`: `CACHE` `v21`.
- `95e7a98` the report, with the answers.
- `41e0c4d` the wrapping product and its checks; `7146c1b` the second read in this report.
- `88942fc` the live chain's flags kept until consumed; the checks for the review's surviving mutants.
- `4cf0292` a merge of `origin/main` (W3-02b; the `test` line kept every suite, `tests/steam-sender.verify.mjs`
  included).
- This section of the report (the head).

## Files changed

- `audio.js`: the gain rule and its call sites.
- `tests/verify.js`: the two moved expectations.
- `tests/render-stream.verify.mjs`: the golden hashes, re-recorded, and their comment.
- `tests/opus.verify.mjs`: not in the order's list; authorised by the orchestrator. Its "Receiver mute is exact
  silence" check moves with the reset (spec point 3), now "... after the first block".
- `tests/predictions/PREDICTIONS.md`: the paragraph.
- `package.json`: the `test` line.
- `sw.js`: `CACHE` `v21`; authorised by the orchestrator, because `audio.js` changed.
- New: `tests/gain.verify.mjs`, `tests/gain-exact.mjs`, this report.

## What was built

**One helper**, `gainRule(options)` in `audio.js`, holds the rule in the engine's variables (`current`, `next`,
`fixed`, `step`, `pos`, `sum`, `peak`). It does each step as the order's box writes it: the integer block mean, the
32-bit floats with one rounding per operation, the step `trunc(f32(f32(f32(next - current) / 127) * 128))`, a block with `den = 0` going to the cap, and
`voice_scale` in both `current` and `next`. Samples come in as `clamp(round(x * 32768))` and go out as `y / 32768`.
`receiverAutoGain`, `streamAutoGain` and the new `TF2Audio.createGain` all run it:

- `receiverAutoGain(samples, { avgGain, maxGain, scale, decoded })`: a whole signal from a reset. A last, partial
  block follows the ramp and makes no update.
- `streamAutoGain(options)`: the same, a piece at a time. Each sample now comes out as it goes in, because a sample's
  gain is known when it arrives. Before, a partial block was held back. `flush()` stays, for `createRender`'s stage
  interface, and returns nothing.
- `createGain({ avgGain, maxGain, scale })` returns `{ process(pcm), reset(), state() }`. `state()` is a copy of the
  seven variables.

**`decoded`**: `decodedFromFrames(frameLog, frameSamples, lookahead, codecRate, voiceRate)` is spec point 4's mapping:
`floor((floor(m * codecRate / voiceRate) + lookahead) / frameSamples)`, decoded when the code is not 0. `process()`
builds it when the voice was received (a demo) or when the codec runs with the gate on. `createRender` builds it in the
same cases. It reads the codec stage's own frame log, which is filled before any voice-rate sample of a frame reaches
the gain (the stages between only wait), so the stream stays equal to `process()`. The live chain keeps the sent flags
of its last 64 frames.

The hold rule (an all-zero block whose first sample was not decoded: `fixed += 128 * step; step = 0`, `current` and
`next` untouched) has the comment the order asks for.

## `tests/verify.js`: the expectations that moved

| Check | Before | After | The rule that moved it |
| --- | --- | --- | --- |
| "silent blocks hold the gain instead of arming maximum gain", now "decoded silent blocks send the gain to its cap" | peak of the first tone block 0.300 (expected under 0.31) | 1.000 (expected over 0.99) | a decoded block of zeros sends the gain to its cap |
| "voice_scale 0 mutes exactly", now "... after the first block, which is at unity" | every sample 0 | samples 128 on are 0; the first 128 equal the input | the reset at a render's start (`fixed = 128`) |

Both new expectations fail on `main`'s `audio.js` (run with `TF2_DIR` pointed at it). No other number in the suite
moved; the `voice_scale 0.5` sawtooth still reads 1.247 to 2.183.

## Golden hashes

With the old hashes in place, the new code moved the WAV hash of 40 of the 47 cases. No codecInfo hash moved, and
`createRender` equalled `process()` bit for bit in all 57 chunked runs. The seven that did not move:

- `steam, auto-gain off` and `steam, auto-gain off, voice_scale 3` (the gain is off).
- `steam, volume 1, voice_maxgain 3`: every block's target is the cap under both rules. A probe counted 0 blocks below
  it at maxgain 3, and 352 at maxgain 10.
- `steam, empty source`, `celt_22, one sample at 22.05 kHz`, `speex, 100 samples at 96 kHz`: shorter than one block,
  which both rules run at unity at `voice_scale 1`.
- `steam, silent but for a quarter frame of sine at the end`: the gate holds the whole source back, so the output is
  silent under any gain.

The comment above `GOLDEN` says this. After re-recording, the suite passes (145 checks).

## The checks, and how each was broken

Each break was made in a scratch copy of the tree (`TF2_DIR`), one at a time. "Transcription" means section 1's 29
comparisons with the literal transcription.

| Break (in `audio.js`) | What failed |
| --- | --- |
| B1 the ramp divided by 128 | 21 transcription checks; "127" (last sample 100, not 199); the held block (10, not 20); the partial block; spec 4's transcription in the gate case; `--synthetic`: 210 samples differ |
| B2 the mean kept as a fraction | 21 transcription checks; "the integer mean" (991); spec 4's transcription; `--synthetic`: 1,706 differ |
| B3 a block of zeros leaves the gain alone (the old rule) | 7 transcription checks; both zeros-to-the-cap checks (20, 20, 19); "not receiverAutoGain with every block decoded"; `--synthetic`: 307 differ; `tests/verify.js`: the cap check |
| B3b no hold (blocks not decoded run the rule) | the held block (19..99); "not every block decoded"; spec 4's transcription; the live chain |
| B3c the hold leaves `fixed` where the block began | the held block (10); spec 4's transcription; the live chain |
| B4 the first block at `trunc(scale x 128)` (no reset to unity) | 28 transcription checks; the reset check; `tests/verify.js`: the `voice_scale 0` check. `--synthetic` passes: it is at scale 1, as Set H is |
| B5 `voice_scale` once (`current = next`) | 28 transcription checks; zeros to the cap at 0.5 and 2; the reset check |
| B6a `den` in doubles (re-run after answer 2) | the `current` and `den` float cases, and the 0.3 case |
| R1 `den` rounded once, as the box wrote it (after answer 2) | the 0.3 case (5000, not 4992); `--synthetic` passes, at 0.5 |
| R3 the step's three roundings joined into one (after answer 2) | nothing: the product by 128 is exact in 32 bits |
| B6c `t` in doubles | the `t` float case (step 6, not 5) |
| B6e `current` in doubles | the `current` and `den` float cases |
| B6f `next` in doubles | the `next` float case |
| B6g the settings not rounded to 32 bits | the `next` float case |
| B6d every `f32` dropped | the `current` and `den` float cases |
| B6b the step without its two roundings | **nothing.** See "What was not done" |
| B7 the shift rounds toward zero | 21 transcription checks; spec 4's transcription; `--synthetic`: 44,884 differ |
| B8 no int16 clamp on the output | 28 transcription checks; spec 4's transcription |
| B9 the input truncated, not rounded | spec 4's transcription (the only check on a float signal) |
| B12 the hold asks about the block's last sample | "held when its first sample was not decoded, and run when it was" |
| B13 `streamAutoGain` forgets its state between calls | 16 transcription checks (every stream piece size); the live chain |
| B14 `reset()` leaves `pos` | both reset checks |
| B16 any block not decoded is held, zeros or not | "a block not decoded but not all zeros is run by the rule"; spec 4's transcription |
| C1 `process()` passes no `decoded` | "process() is receiverAutoGain ... with decoded()"; "not with every block decoded" |
| C2 `createRender` passes no `decoded` | the render-stream suite: every gated case's stream differs from `process()` (225 samples in `steam`, for example) |
| C3 the mapping ignores the lookahead | "process() is receiverAutoGain ... with decoded()" |
| C4 the live chain passes no `decoded` | the live chain check (peaks 0.2552 then 0.2902: a ramp, not flat) |

The first runs of these breaks found three gaps, now closed (`74b55f0`). First, nothing caught B6a to B6g: section 1's
settings are exact in 32 bits. A search found four short cases where one rounding changes an output sample, and they
are now section 1b. Second, nothing caught B12: every block that was not decoded in the tests started and ended on
block edges. Third, nothing checked the live chain's `decoded`.

## `tests/gain.verify.mjs` (in `pnpm test`, 67 checks, about 7 s)

1. The transcription (`engineGain`, kept in `tests/gain-exact.mjs` and imported) against `receiverAutoGain`,
   `streamAutoGain` in pieces of 1, 7, 128 and 1,000 (flushed), and `createGain().process` in packets of 882 and
   512. The signals are four, each run at the order's 27 settings. Noise bursts (48,652 samples) at levels from 20 to
   32767, with runs of zeros of 3, 77, 129, 200 and 1,000 samples and of 1, 2, 3, 5 and 10 blocks. A full-scale square
   wave and a slow ramp (40,960 each). And 41,111 samples, which is not a multiple of 128. Not one sample differs.
2. The order's numbers: 199 and 100 (the divisor 127); 992 (the integer mean); 19, 99 and 100 (zeros to the cap); the
   same at `voice_scale` 0.5 and 2 in general form; 20 flat (held); which sample decides the hold; a block not decoded
   but not all zeros is run; a last partial block follows the ramp.
3. `createGain`: after `reset()`, 1000 comes out as 1000 at 0.5, 1 and 2, and `fixed` is 64, 128 and 256. `reset()` in
   mid-block sets `pos` back to 0. `state()` is a copy.
4. The gate's silences through `process()` (see the reading below).
5. The live chain: push-to-talk on `celt_44`, codec bypassed.

## The private run

```
node tests/gain-exact.mjs --takes <takes folder>
```

It loads `audio.js` as `tests/verify.js` does. It finds exactly one `celt_gain1.wav` and one `celt_gain10.wav` under
the folder (searched recursively; any other number is an error). It checks that both are 16-bit mono at 22050 Hz and
of the same length. It runs `receiverAutoGain(gain1 / 32768, { maxGain: 10, avgGain: 0.5, scale: 1 })` and compares
`round(y x 32768)` with gain10. It prints two lines and exits 1 unless the first count is 0. On the takes the order
expects:

```
samples that differ before the last 512: 0 of 291840
samples that differ in the last 512: 511 of 512
```

`node tests/gain-exact.mjs --synthetic` (also in `pnpm test`) makes the two files in a temporary folder. They are a
seeded signal of 571 packets, and the transcription applied to it, with 511 samples of the last packet changed as the
takes' are. It then runs the `--takes` path on them twice, as a child process:

```
as made (exit 0):
samples that differ before the last 512: 0 of 291840
samples that differ in the last 512: 511 of 512
one sample of celt_gain10.wav changed (exit 1):
samples that differ before the last 512: 1 of 291840
samples that differ in the last 512: 511 of 512
gain-exact --synthetic: ok
```

Unlike Set H, the synthetic signal can see the divisor: with 128, 210 of its samples differ.

## Readings of the order (where another reading existed)

1. **The live chain's `decoded` counts every frame not sent, gate or not.** Spec point 4 places the live chain under
   "the gate on". I pass its sent flags always. With the gate off and the key down, every frame is sent, so this is the
   same as no function. With push-to-talk's key up, nothing is sent, which the receiver never sees, so those frames
   hold the gain as the gate's do. It also subtracts the decoder EQ's delay from the index, because the live FIR is
   causal. No shipped profile has a decoder EQ.
2. **`blockSize` is no longer an option.** The rule is 128 samples with the ramp over 127, as the engine has it.
   `VOICE_ENGINE.autoGain.blockSize` (128, in `constants.js`, which I may not touch) is no longer read. The callers no
   longer pass it, and a `blockSize` given is ignored.
3. **The settings are 32-bit floats.** `voice_scale`, `voice_avggain` and `voice_maxgain` are cvars, so the helper
   rounds them with `Math.fround` before use. That changes nothing at the values the page offers that are exact in 32
   bits. At `voice_scale 0.7` it does (B6g).
4. **`>> 7`** (changed after the second read): the product is formed as a 32-bit integer that wraps, and shifted
   with `>> 7`, in `audio.js` and in the transcription alike.
5. **One rounding per float operation** (changed on the orchestrator's answer 2; it was the box's single rounding of
   the denominator).
6. **The gate's silences check needed a quieter tail than the order's words suggest.** "The second burst's first
   block starts from the gain the first burst's tail left (not from the cap, not from 1)" cannot be seen with the
   default threshold and cap. Anything under the gate's -39.5 dBFS decodes (about 8 dB down through Opus) to a target
   above 100, so the tail leaves the gain at the cap. So the source has a noise floor at -18 dBFS rms under a threshold
   raised to -12 dBFS (`gateThresholdDb`, a Steam profile setting), at the default cap of 10. The check asserts that
   the gap's samples are zero, and that `process()` equals, bit for bit, `receiverAutoGain` run with `decoded` from the
   frame log by the order's mapping on the same decoded signal. That decoded signal is rebuilt from the module's own
   pieces (`roundTrip`, `firwin2`, `resampleSinc`), and its frame log equals `process()`'s. It also asserts that
   `process()` does not equal the same run with every block decoded. The order's sentence holds, with one fact the
   order did not foresee, stated in a check of its own. The block just past the last sent frame is the resampler's
   ringing (peak 23), not all zeros. So the spec runs it by the rule, and its target is the cap. The gain the tail
   leaves is therefore where the ramp toward the cap reached (fixed 1187, held over the gap; the cap is 1280). The
   first block after the gap starts there, but that block is also ringing (peak 1). The pre-roll's first full block
   starts at the cap. On the source's timeline, then, the hold changes little after a gate gap. The engine also has the
   gain at its cap after a spurt, after the silence record (W3-03), so the two end in the same place.
7. **Lost and late frames count as decoded** (codes 5 and 6 are not 0), as the order says. A late frame plays as
   silence, so its block of zeros sends the gain to the cap.
8. **`createGain` takes no `decoded`**: the voice channel sees only decoded samples (spec point 2).
9. **`gain-exact.mjs --synthetic` is in `pnpm test`** next to `gain.verify.mjs`, so that the private script's
   `--takes` path is run on every push. It takes half a second. The order lists it only as a check the builder runs.
10. **The transcription lives in `tests/gain-exact.mjs`** and `tests/gain.verify.mjs` imports it. Both scripts need it,
    and one copy cannot drift from another. It is still a separate text from `audio.js`'s.
11. **A frame beyond the frame log counts as not decoded** (a demo's samples past its log).

## What was not done

- **The roundings inside the step** are not caught when broken (B6b; R3 joins them into one). Removing them changed
  no output in 3 x 10^7 targeted cases (two block levels, `voice_scale` 1). The product by 128 is exact in 32 bits,
  so rounding it changes nothing. For the difference and the quotient by 127 I argue they cannot matter, but I have
  not proved it for every binade: if `next - current` is exactly `127k/128`, the step is exactly `k`; if it is the
  float just below that, the quotient times 128 is just under `k` and rounds to the float below `k`, never up to `k`.
  The roundings are kept, one per operation.
- `tests/REFERENCE_2026.md` is not in the order's files. Proposed text for it, if the orchestrator wants one: "W3-05
  (2026-11-10): the app's receiver gain is the engine's rule (W3-03 section 2), checked against a literal
  transcription in `tests/gain.verify.mjs` and, privately, against Set H with `tests/gain-exact.mjs`. On the source's
  timeline an all-zero block the gate did not send holds the gain, which stands in for the engine not running."
- The accuracy guard (the orchestrator's private run) was not run: it needs the takes.
- `VOICE_ENGINE.autoGain.blockSize` stays in `constants.js` (not this order's file) and is no longer read.

## Commands run

On the final head, after the third merge of `origin/main` and the review's changes:

- `pnpm test` (under the heavy lock): every suite passes. The counts: `tests/verify.js` 211, `gain.verify` 67,
  `gain-exact --synthetic` ok, opus 119, speex 63, speex 1.0.2 30, reference 41, formats 66, filerate 53, meter 50,
  video 45, demo 31, render-stream 145 (on the recorded hashes: no golden hash moved in the last three rounds), voice
  channel 127, steam sender 58.
- Browser suite (`CHROMIUM_EXECUTABLE=... node tests/browser.verify.js`, under the lock): 215 passed.
- CI on the pushed head: see the hand-back.

Every signal in the tests is synthetic. No file reads the private takes but `gain-exact.mjs --takes`, and it prints
only counts.
