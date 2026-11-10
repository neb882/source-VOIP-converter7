# W3-05: the receiver's gain, four small corrections

**Branch:** `claude/w3-05-receiver-gain`, from `main` **after W3-02b has merged** (it needs the channel: the reset
happens when a channel is assigned, and a "decoded block of zeros" is a packet's, which only the channel path
has). **Worktree:** given in the brief. **Agent:** `tf-builder` (effort high), then `tf-reviewer`, then a second
reader on the stronger model (it changes a measured constant's arithmetic). **Time budget:** 4 hours. **May run
beside** W3-02c (no shared files).

## Why

W3-03 read the automatic gain out of the owner's engine file (`docs/reports/W3-03-engine-binary.md`, section 2).
It confirms the measured law of findings 3 and 4 constant by constant, and differs from `receiverAutoGain` in
four details. None is expected to be audible; they matter for the sample-by-sample comparison with the game's own
`voice_decompressed.wav` (the gain's output, whole packets end to end), which is the next proof planned for the
modern preset.

The engine's update, as read:

```
for each sample x at position i of its 128-sample block:
    sum += |x| ; peak = max(peak, |x|)
    x = clamp((fixed + i * step) * x >> 7, -32768, 32767)        # arithmetic shift: floor
at the end of each block:
    current = next * scale
    fixed   = trunc(current * 128)
    mean    = floor(sum / 128)                                    # integer division
    next    = min(32767 / (mean + (peak - mean) * avggain), maxgain) * scale      # 32-bit floats
    step    = trunc((next - current) / 127 * 128)                 # toward zero
    sum = peak = 0
when a channel is assigned: current = next = 1.0, fixed = 128, step = 0, position 0, sum = peak = 0
```

`next` holds one factor of `scale` and `current` a second, which is finding 4's "enters twice". In the app's
variables (`prevTarget` is `next / scale`): `fixed = trunc(prevTarget * scale * scale * 128)` and
`step = trunc((target - prevTarget * scale) / 127 * scale * 128)`.

## Files

May touch: `audio.js` (the gain helper that `receiverAutoGain`, `streamAutoGain` and the channel's gain object
share since W3-02b; nothing else), `tests/verify.js` (the gain's section), `tests/render-stream.verify.mjs` (golden
hashes, re-recorded: see Done means), `tests/predictions/PREDICTIONS.md` (the hashed-file note). May not touch:
`voice-channel.js`, `constants.js`, `reference.js`, `tests/accuracy.mjs`, `tests/REFERENCE_2026.md` (the
orchestrator pastes the plan's text for finding 4), `tests/predictions/predictions.json`, `docs/PROGRESS.json`.

## Spec

1. **The ramp's divisor is 127** (block size less one), in every path. Today it is the block size (128), which
   gives a step one unit (1/128 of gain per sample) smaller whenever the difference in 1/128 units lies between a
   multiple of 127 and the same multiple of 128.
2. **The block mean is an integer**: `Math.floor(total / block)`, in every path.
3. **32-bit floats** for `next`, `current` and the quotient (`Math.fround` at each step the engine stores a
   float): do this only if a test can show a case where it changes a sample; otherwise leave doubles and say so.
4. **A decoded block of zeros sends the gain to its cap**: mean and peak 0 give `next = maxgain x scale`. In the
   channel's gain object (the `'game'` timeline) this is the rule with no exception: the object only ever sees
   decoded packets, the silence record included, so every spurt ends with the gain at its cap. In the
   `'source'` timeline (`receiverAutoGain`, `streamAutoGain`) the signal also holds the silences the gate did not
   send, which are not blocks at all in the engine: there an all-zero block keeps leaving the state untouched, as
   finding 4 measured for "no voice data", and the comment says which case it is.
5. **The reset when a channel is assigned**: the channel's gain object's `reset()` sets the state above (gain
   exactly 1.0 for the first 128 samples whatever `voice_scale` is; today's start state is `trunc(scale x 128)`).
   An appended spurt is not reset. The `'source'` timeline has no channel and keeps its start state.
6. With `agc: false` nothing changes.

## Done means

- `pnpm test` passes. In `tests/verify.js`, each of these fails without its correction (say how you checked):
  - **127:** a steady block pair whose targets differ by 127/128 exactly: the step is 1 with the divisor 127 and
    0 with 128; assert the last sample of the ramped block.
  - **Integer mean:** a block with `sum = 128 x m + 127` gives the target of mean `m`, not `m + 0.99`: pick `m`
    and a peak where the two targets give different `fixed` values, and assert the next block's first sample.
  - **Zeros to the cap:** through the channel's gain object, a loud block, then 128 zeros, then a quiet block:
    the block after the zeros starts at `maxgain x scale x scale` and the quiet block is ramped from there; through
    `receiverAutoGain` the same input leaves the gain where the loud block put it.
  - **Reset:** under `'game'` at 300 fps, a source with a pause of 1.2 s: the first 128 samples of the second
    spurt's first packet leave the gain object at gain 1.0 (compare with the pre-gain samples), with
    `voice_scale` 1 and 0.5; with a pause of 300 ms (appended) they do not.
  - **The model of `voice_decompressed.wav`:** the gain object's outputs, packet after packet, are whole packets
    (882 samples a frame, the silence record's zeros included); a test hook or `codecInfo.channel` exposes their
    count so a later order can lay them beside the game's file.
- **The accuracy suite, before and after** (the orchestrator or the builder, under the heavy lock):
  `node tests/accuracy.mjs --takes <folder> --json <scratch>/after.json`, all 16 takes, against the baseline of
  the same main. "Barely", fixed before the run: every row's level figure within **0.03 dB** rms of the baseline
  and its correlation within 0.002; the largest band difference within **0.1 dB** and in the same band; samples
  at the clamp within **0.2 percentage points**; the spurt count and the clock column unchanged. The Set B
  `voice_scale 0.5` take is the one that exercises the ramp hardest (its sawtooth is the step): it must stay
  within 0.3 dB on every segment of the "Results" table in `tests/REFERENCE_2026.md`, and the report quotes its
  sawtooth's two ends (recorded 0.17 to 0.29 of full scale, modelled 0.16 to 0.28 today). **Stop and report** if
  any row moves by more: the engine's arithmetic is read, so a larger move means the reading or its translation
  is wrong, not that the takes are.
- **Golden hashes:** every render with the auto-gain on changes in its last bits, so W2-02's golden hashes are
  re-recorded in a commit of their own that says why (the divisor and the mean), after showing that the cases
  with `agc: false` did not move. `createRender` stays equal to `process()` on every case.
- `tests/predictions/PREDICTIONS.md` gets one dated paragraph in the style of its last two: `audio.js` changed
  after registration; the predictions were rendered with the divisor 128 and the fractional mean; they are scored
  as registered; the expected effect on a prediction's levels is under 0.03 dB (quote the measured figure from the
  accuracy run).
- CI passes on the pushed branch.

## Stop and ask

- If W3-02b did not leave one shared helper for the gain's arithmetic: say so, and make it the first commit.
- If correction 3 (32-bit floats) changes any accuracy row by more than the bounds above.
