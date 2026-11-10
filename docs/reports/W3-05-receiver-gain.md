# W3-05 report: the receiver's gain, as the engine computes it

Branch `claude/w3-05-receiver-gain`, from `main` at `c8a11ec` (W2-02 merged), with `origin/main` merged in once
(`d01e830`: W3-02a, the plans, the reference; one conflict, the `test` line, both suites kept).

**Status: one question open (below).** One check outside this order's files moves with the change:
`tests/opus.verify.mjs`, "Receiver mute is exact silence". `pnpm test` stops there, so CI fails on this branch until
the question is answered. Every other suite passes.

## The question

`tests/opus.verify.mjs` line 106 renders a signal at `voice_scale 0` and expects every output sample to be 0. Under
spec point 3 (every render starts from a reset, so the first block has `fixed = 128` whatever `voice_scale` is), the
first 128 voice-rate samples pass at unity. They are no longer silent. The order allows `tests/verify.js` for the gain's
moved expectations but does not list `tests/opus.verify.mjs`, so I have not touched it. The change I would make,
tried in a scratch copy, where the suite then passes (119 checks):

```js
// A render starts with a reset gain, at unity for its first 128 voice-rate samples whatever voice_scale is (W3-05).
const unmutedAt = muted.samples.findLastIndex(v => v !== 0);
check('Receiver mute is exact silence after the first block', unmutedAt >= 0 && unmutedAt < Math.round(0.01 * muted.sampleRate));
```

No other suite has a check that moves. To find that out, I ran each suite after it in a scratch copy, with that one
check made non-stopping.

## Commits

- `0fb0963` The rule in `audio.js`, and the two moved expectations in `tests/verify.js`.
- `2c6072e` The golden hashes of `tests/render-stream.verify.mjs`, re-recorded, in a commit of their own (below).
- `06ce70a` `tests/gain.verify.mjs`, `tests/gain-exact.mjs`, and the `test` line.
- `74b55f0` Three test gaps that breaking the code found (the 32-bit floats, a frame edge inside a block, the live
  chain).
- `d01e830` A merge of `origin/main`.
- `921e7b7` The `PREDICTIONS.md` paragraph.
- This report.

## What was built

**One helper**, `gainRule(options)` in `audio.js`, holds the rule in the engine's variables (`current`, `next`,
`fixed`, `step`, `pos`, `sum`, `peak`). It does each step as the order's box writes it: the integer block mean, the
32-bit floats, the step `trunc(f32(f32(next - current) / 127 * 128))`, a block with `den = 0` going to the cap, and
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
| B6a `den` in doubles | the `current` and `den` float cases |
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

## `tests/gain.verify.mjs` (in `pnpm test`, 55 checks, about 5 s)

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
4. **`>> 7` is `Math.floor(product / 128)` in `audio.js`.** That is exact for any product, so it gives the same result
   as an arithmetic shift wherever the product fits in 32 bits. The app allows `voice_maxgain` up to 100 and
   `voice_scale` up to 4, where the engine's 32-bit product could overflow; what the engine does there was not read.
   The test's transcription uses `>> 7` literally. Its settings stay far inside 32 bits (gain up to 5,120 times 32,768),
   so the two agree there.
5. **A doubt about rounding, for the orchestrator, who has Set H's script.** The box rounds
   `mean + (peak - mean) * avggain` to 32 bits once, at the end. Compiled 32-bit code may round the product first, then
   the sum. The two agree whenever the product is exact in 32 bits, which holds for `voice_avggain` 0, 0.25, 0.5, 1
   and the default 0.5. They can differ for a value like 0.3. I followed the box. Set H, at 0.5, cannot tell the two
   apart. The same holds, less likely, for `t * scale` against `f32(t) * scale`.
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

- `tests/opus.verify.mjs`, the question above.
- **B6b** (the two roundings inside the step) is not caught. Removing them changed no output in 3 x 10^7 targeted cases
  (two block levels, `voice_scale` 1). I think they cannot matter. `next - current` is a difference of two floats. If
  it is exactly `127k/128` the step is exactly `k`. If it is the float just below that, multiplying by `128/127` gives
  just under `k`, which rounds to the float below `k`, never up to `k`. I have not proved this for every binade. The
  roundings are kept, as the box writes them.
- `sw.js`: not in this order's files, so `CACHE` is not bumped. `audio.js` changed, so it needs `v20` to `v21`.
- `tests/REFERENCE_2026.md` is not in the order's files. Proposed text for it, if the orchestrator wants one: "W3-05
  (2026-11-10): the app's receiver gain is the engine's rule (W3-03 section 2), checked against a literal
  transcription in `tests/gain.verify.mjs` and, privately, against Set H with `tests/gain-exact.mjs`. On the source's
  timeline an all-zero block the gate did not send holds the gain, which stands in for the engine not running."
- The accuracy guard (the orchestrator's private run) was not run: it needs the takes.

## Commands run

- `node tests/gain.verify.mjs`: 55 passed. `node tests/gain-exact.mjs --synthetic`: ok.
- `pnpm test` (under the heavy lock): `tests/verify.js` 211 passed, `gain.verify` 55, `gain-exact --synthetic` ok,
  then `tests/opus.verify.mjs` stops at "Receiver mute is exact silence". Each later suite, run on its own in a scratch
  copy: speex, reference, formats, filerate, meter, video, demo and voice-channel pass; render-stream passes (145).
- Browser suite (`CHROMIUM_EXECUTABLE=... node tests/browser.verify.js`, under the lock): 215 passed.
- CI: see the hand-back. It fails at `opus.verify` until the question is answered.

Every signal in the tests is synthetic. No file reads the private takes but `gain-exact.mjs --takes`, and it prints
only counts.
