# W3-05: the receiver's gain, as the engine computes it

> **Status 2026-11-12: built and merged** at `c00dff8` (cache v21, pull request #12). Report: `docs/reports/W3-05-receiver-gain.md`.

*Revised 2026-11-10 after the plan's review and after Set H (the findings and what was done about each are in
`docs/reports/W3-02-plan.md`, "The review").*

**Branch:** `claude/w3-05-receiver-gain`, from `main` **after W2-02 has merged** and when no other `audio.js` order
is open (W3-06, W3-02c, W3-02f and W3-02g change it too). It comes **before W3-02c**, which takes the gain object
this order makes. **Worktree:** given in the brief. **Agent:** `tf-builder` (effort high), then `tf-reviewer`,
then a second reader on the stronger model (it changes a measured constant's arithmetic). **Time budget:** half a
day.

## Why

W3-03 read the automatic gain out of the owner's engine file (`docs/reports/W3-03-engine-binary.md`, section 2),
and Set H then verified that reading sample for sample (`docs/PROGRESS.json`, `stands.gain_exact`): the owner ran
`vaudio_celt` with a file as the microphone and let the game record its decoded voice once with `voice_maxgain 1`
(the gain does nothing) and once with 10. The engine's rule applied to the first recording gives the second
exactly over its first 291,840 samples (570 packets of 512; the last packet differs between the two key presses).
The app's present rule differs on 3,032 of them. Which details matter, on that signal:

| The rule | Samples that differ from the game's, of 291,840 |
| --- | ---: |
| as the engine has it | 0 |
| the ramp divided by 128 in place of 127 | 0 (this signal cannot tell; the 127 stands on W3-03's reading) |
| the block mean kept as a fraction | 2,798 |
| a decoded block of zeros leaving the gain alone | 234 |

So this order makes the app's gain the engine's, and its acceptance is that exact check.

## The engine's rule

```
state: current = next = 1.0 (32-bit floats), fixed = 128, step = 0, pos = 0, sum = 0, peak = 0     # a reset
for each decoded sample x (an integer, -32768..32767), in order:
    a = |x| ; sum += a ; peak = max(peak, a)
    y = (fixed + pos * step) * x >> 7                  # arithmetic shift: floor((fixed + pos * step) * x / 128)
    output clamp(y, -32768, 32767)
    pos += 1
    if pos == 128:
        current = f32(next * scale)
        fixed   = trunc(current * 128)
        mean    = floor(sum / 128)                     # integer division
        den     = f32(mean + (peak - mean) * avggain)
        t       = den > 0 ? f32(32767 / den) : infinity
        if t > maxgain: t = maxgain
        next    = f32(t * scale)
        step    = trunc(f32(f32(next - current) / 127 * 128))       # toward zero
        pos = 0 ; sum = 0 ; peak = 0
```

`f32` is `Math.fround`. This is, line for line, the script that matched Set H. `next` holds one factor of
`voice_scale` and `current` a second, which is finding 4's "enters twice". The state is reset when a channel is
assigned to a speaker, and at no other time. A decoded block of zeros has `den = 0`, so its target is the cap.

## Files

May touch: `audio.js` (the gain: `receiverAutoGain`, `streamAutoGain`, a new `createGain`, and the places in
`process()`, `createRender` and `createLiveChain` that call them), `tests/verify.js` (only expectations of the
gain's existing checks that the corrections move; say each), `tests/render-stream.verify.mjs` (golden hashes,
re-recorded: see below), `package.json` (the `test` script), `tests/predictions/PREDICTIONS.md` (the hashed-file
note). May add: `tests/gain.verify.mjs` (public), `tests/gain-exact.mjs` (reads private recordings; commits
none). May not touch: `voice-channel.js`, `constants.js`, `reference.js`, `tests/accuracy.mjs`,
`tests/REFERENCE_2026.md`, `tests/predictions/predictions.json`, `docs/PROGRESS.json`.

## Spec

1. **One helper** holds the rule above, in the engine's own variables (`current`, `next`, `fixed`, `step`, `pos`,
   `sum`, `peak`), and `receiverAutoGain`, `streamAutoGain` and `createGain` all run it. Samples come in as floats
   and are converted as now (`clamp(round(x * 32768), -32768, 32767)`), and go out as `y / 32768`.
2. **`TF2Audio.createGain({ avgGain, maxGain, scale })`** returns `{ process(pcm), reset(), state() }`:
   `process` returns a `Float32Array` of the same length at once (a sample's gain is known when it arrives; the
   block's update happens when `pos` reaches 128, across calls); `reset()` sets the state of the first line;
   `state()` returns a copy of the seven variables, for tests. This is the object W3-02c gives the voice channel:
   every sample it sees is decoded, the silence record's zeros included.
3. **Every render starts with a reset state** (a render begins with a channel being assigned): `fixed = 128` for
   the first block whatever `voice_scale` is. Today the first block starts at `trunc(scale x 128)`.
4. **Which blocks are decoded.** In the engine the gain only ever sees decoded samples. On the app's source
   timeline the signal also holds the silences the gate did not send, which the engine's gain never sees. So
   `receiverAutoGain` and `streamAutoGain` take `options.decoded`, a function of a voice-rate sample index that
   says whether that sample was decoded; without it, every sample was.
   - **No gate** (the engine codecs as shipped, any profile with the gate off, the codec bypassed): no function.
     Every block is run by the rule, a block of zeros included. This is Set H's case, and it is exact.
   - **The gate on** (Steam on the source's timeline, and a demo's received voice): `process()` and
     `createRender` build the function from the frame log: sample `m` at the voice rate is codec sample
     `c = floor(m x codecRate / voiceRate)`, in frame `floor((c + lookahead) / frameSamples)`; it was decoded
     when that frame's code is not 0. The live chain does the same from its own frames (no lookahead is trimmed
     there; it keeps the sent flags of its last 64 frames).
   - **An all-zero block whose first sample was not decoded** is skipped as today: its samples stay zero, the
     gain is held where the ramp reached it (`fixed += 128 * step; step = 0`), and `current`, `next` are
     untouched. This stands in for "nothing arrived": the engine would not have run at all. It is an
     approximation of the source's timeline only (the engine's blocks run over the decoded samples end to end;
     the app's run over the timeline), and the comment says so. The game's timeline (W3-02c) has no such case.
   - **Every other block**, zeros inside a sent frame included, is run by the rule.
5. **The last, partial block** follows the current ramp and makes no update, as now (the engine would do the
   same with a signal that ends there).
6. With `agc: false` nothing changes.

## The builder runs

- **`node tests/gain.verify.mjs`** (new, in `pnpm test`):
  - **Against a literal transcription.** The test holds its own copy of the rule above, written with integers
    and `Math.fround` exactly as in the box (not shared with `audio.js`), and compares it sample for sample with
    `receiverAutoGain` (no `decoded`), with `streamAutoGain` fed in pieces of 1, 7, 128 and 1,000 samples and
    flushed, and with `createGain().process` fed in packets of 882 and 512, on seeded synthetic signals of at
    least 40,000 samples each: noise bursts at levels from 20 to 32767 with runs of exact zeros between them (some
    runs a whole number of blocks, some not), a full-scale square wave, a slow ramp, and a signal whose length is
    not a multiple of 128; each at `voice_scale` 0.5, 1 and 2, `voice_maxgain` 1, 10 and 255/128, `voice_avggain`
    0.25, 0.5 and 1. Not one sample may differ.
  - **127** (all blocks decoded, `scale` 1, `maxGain` 255/128): block 0 is 128 samples of 32767, blocks 1 and 2
    are 128 samples of 100. Block 1 comes out as 100. The last sample of block 2 is 199 (the step is 1:
    `floor(100 x 255 / 128)`); with the divisor 128 it would be 100.
  - **The integer mean** (`scale` 1, `maxGain` 10, `avgGain` 0.5): block 0 is 127 samples of 3303 and one of
    3302 (mean 3302 as an integer, 3302.99 as a fraction; target 9.92188); blocks 1 and 2 are 128 samples of 100.
    The first sample of block 2 is 992 (`fixed` 1270); with the fractional mean it would be 991.
  - **Zeros to the cap** (`scale` 1, `maxGain` 10): block 0 is 128 samples of 16384, block 1 is zeros, blocks 2
    and 3 are 128 samples of 10. Block 2 starts where the loud block's target left it and ramps toward the cap:
    its first sample is 19 (`fixed` 255) and its last 99 (`step` 8); the first sample of block 3 is 100 (`fixed`
    1280). In general the block after the zeros starts at `scale^2 x T(loud)` and ramps toward
    `scale x maxgain`, and only the next starts at `scale^2 x maxgain`. With `decoded` saying that block 1 was not
    decoded, block 2 is flat at 20 (`fixed` 256: where block 1's ramp ended, held).
  - **Reset** (through `createGain`, read with `state()`): after `reset()`, 128 samples of 1000 come out as
    1000 at `voice_scale` 0.5, 1 and 2, and `state().fixed` is then `trunc(scale x 128)`; `reset()` in the middle
    of a block puts `pos` back to 0.
  - **The gate's silences** (through `process()`, the Steam profile, a source of two noise bursts 2 s apart): the
    samples between the bursts are zero, and the second burst's first block starts from the gain the first
    burst's tail left (not from the cap, not from 1): compare with `receiverAutoGain` run on the same decoded
    signal with a `decoded` function made from `codecInfo.frameLog` by the mapping of spec 4.
  - Each check fails when its line is broken; say how you broke it and what failed.
- **`node tests/gain-exact.mjs --synthetic`**: the private script below, run on two files the test makes itself
  (a seeded signal, and the transcription's output for it), prints 0 differing samples; with one sample of the
  second file changed it prints 1 and exits non-zero.
- `pnpm test` passes with the gain's existing checks in `tests/verify.js`; where an expected number moves, the
  report gives the old and new value and which rule moved it.
- **Golden hashes:** every render with the auto-gain on changes, so the golden hashes of
  `tests/render-stream.verify.mjs` are re-recorded in a commit of their own that says why, after showing that the
  cases with `agc: false` did not move. `createRender` stays equal to `process()` on every case.
- `tests/predictions/PREDICTIONS.md` gets one dated paragraph in the style of its last two: `audio.js` changed
  after registration; the predictions were rendered with the divisor 128, the fractional mean and zero blocks
  that held the gain; they are scored as registered; the rule is now verified against the game sample for sample
  (Set H); the expected effect on a prediction's levels (the orchestrator adds the measured figure).
- CI passes on the pushed branch.

## The orchestrator runs privately

- **The exact check.** `node tests/gain-exact.mjs --takes <takes folder>`. The script (the builder
  writes it; it loads `audio.js` as `tests/verify.js` does) finds `celt_gain1.wav` and `celt_gain10.wav` under
  the folder (16-bit mono, 22050 Hz, 292,352 samples each), runs
  `TF2Audio.receiverAutoGain(gain1 / 32768, { maxGain: 10, avgGain: 0.5, scale: 1 })`, converts back with
  `round(y x 32768)` and compares with `celt_gain10.wav`. It prints the number of differing samples before the
  last 512 and in the last 512, and exits non-zero unless the first is 0. **Expected: 0 of 291,840, and 511 in the
  last packet.** It prints nothing of the recordings but those counts.
- **The accuracy suite as a guard**, under the heavy lock, before and after on the same main:
  `node tests/accuracy.mjs --takes <takes folder> --json <scratch>/after.json`, all 16 takes.
  Expected, fixed before the run: every row's level figure within **0.03 dB** rms of the baseline and its
  correlation within 0.002; the largest band difference within **0.1 dB** and in the same band; samples at the
  clamp within **0.2 percentage points**; the spurt count and the clock column unchanged. The Set B
  `voice_scale 0.5` take exercises the ramp hardest (its sawtooth is the step): it stays within 0.3 dB on every
  segment of the "Results" table in `tests/REFERENCE_2026.md`. If a row moves by more, the orchestrator has the
  builder run the suite with each of the rules of the table in "Why" switched back in turn (a scratch patch, not
  committed) to say which one moved it, and decides with that; the exact check above outranks these bounds.

## Stop and ask

- If the transcription and Set H's script could differ anywhere (the box above is the script; a doubt about a
  rounding goes to the orchestrator, who has it).
- If equality between `createRender` and `process()` cannot be kept with the `decoded` function.
