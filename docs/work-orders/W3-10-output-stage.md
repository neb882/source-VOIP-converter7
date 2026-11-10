# W3-10: the mix and output stage as the game's listener gets it

*Rewritten 2026-11-10 for the new order of work (`docs/PROGRESS.json`, decisions;
`docs/reports/W3-plan-maintenance-2.md`). It was the last `audio.js` order, after the receiver's and before the
rooms'. It is now the third: after W3-16 and W3-11b, **before W3-17c, W3-17d and W3-02c to W3-02g**. What
changed in the text: "Depends on"; the mix stage is spelled out as the functions W3-17c will call; where a
22050 or 11025 Hz voice is upsampled is settled; the checks are written for a render with no room and no voice
channel; a private check on Set B's plateaus is added.*

**Depends on:** W3-07's report (`docs/reports/W3-07-mixer-output.md`, sections 1 and 2 and "The rule").
**Starts after W3-11b has merged**, with no other `audio.js` order open. It runs beside nothing but W3-17b
(the room module's files): it touches `audio.js`, `app/`, `batch.js`, `sw.js` and the tests. Nothing of the
receiver's orders or of the rooms is assumed: no voice channel, no game timeline, no room path exist in
`audio.js` when it is built.
**Golden hashes:** it re-records every one, once. That was its reason for going last; it does not hold, since
each later order re-records only what it moves (W3-17c adds room cases and moves no existing one; W3-02c adds
`'game'` cases).
**Kind:** code. `tf-builder` (effort xhigh), then `tf-reviewer`, then a second reader on the stronger model
(it changes how every render is computed). **Branch:** `claude/w3-10-output-stage`, from `main`.
**Worktree:** given in the brief. **Time budget:** 1.5 days.

## Why

The model's last stage is a 3-tap filter `[0.1, 0.8, 0.1]` at 44.1 kHz, fitted to the roll-off above 12 kHz in
Set A. W3-07 read the engine and found no filter there. The game mixes at a fixed 44100 Hz and hands 16-bit sound
to the system's mixer, and the roll-off is that mixer's **linear interpolation from 44100 Hz to a 48000 Hz
device**. The evidence is in the recordings: flat tops stay exactly on the ceiling, and a 1 kHz tone has images at
2900 and 4900 Hz at −64 to −67 dB in five recordings from two PCs (linear interpolation predicts −65.4 and −66.2).
The fitted filter agrees with it within 0.1 dB up to 13 kHz, is 1.1 dB too bright at 18 kHz, and has no images.

The voice's level into the mix is measured too: Set B's clipped 1 kHz plateaus sit at 4895 to 4896 of a ceiling
of 4915, where the engine's 255/256 predicts 4895.85 (`docs/reports/W3-18-rooms-in-the-takes.md`, 1.5). The app
enters the voice at full level, so its plateaus sit on the ceiling itself.

**What stands in `audio.js` today** (stage 5 and 6 of `process()`, the same in `createRender` and
`createLiveChain`): the gain's output at the voice's rate; `resampleLinear` or `resampleSinc` to 44100 Hz (the
profile's `mixer`); the listener's low-pass and the old room code; `engine.outputFir`; `volume` as a float
product; a sinc resampler to `max(44100, the source's rate)`; `softLimit` at 0.98. None of these but the room
code survives this order as it is.

## What to build

1. **The voice's entry, one function.** `mixEntry(s, volume) = trunc(fround(s x volume) / 256)`: `s` a whole
   16-bit sample, `volume` the channel's volume as the engine holds it (a float from 0 to 255), the product
   rounded to single precision once, the division by 256 exact, the result truncated toward zero (W3-07
   section 1: `trunc(float(s) x vol x (1/256))`). Here the volume is 255: `mixEntry(s, 255)` is
   `trunc(s x 255 / 256)` for every 16-bit `s` (32767 gives 32639, -32768 gives -32640). It is exported
   (`TF2Audio.mixEntry`). **W3-17c calls this same function twice a sample**, with the volumes
   `255 x direct / 256` and `255 x room / 256`, and checks it against the room module's own `entry` on all
   65,536 samples: so the single rounding must be there even though at 255 it changes nothing
   (`mixEntry(-32690, 255 x 229 / 256)` is -29128, where exact division gives -29127;
   `mixEntry(31388, 255 x 23 / 256)` is 2809, not 2808).
   - **What `s` is.** Since W3-05 the gain's output is whole 16-bit values over 32768, and for `steam` what
     the gain was given was 16-bit too (W3-11a). Where a path hands the mix a value that is not whole (the
     auto-gain switched off: the voice times `voice_scale`, clipped; any other the builder finds), it is
     rounded to the nearest whole value, ties to even, and clamped to -32768..32767 before the entry. List
     those paths in the report.
   - **No rate from a name.** `celt_44`'s voice is at 22050 Hz since W3-06 (`modeRate` 44100 is only the
     codec's mode): the stage takes the voice's rate from `voiceRate`.
2. **Where a 22050 or 11025 Hz voice is upsampled: after the entry.** Settled from the engine's order (W3-07
   section 1, "The mixer's passes"; `docs/reports/W3-15-room-dsp.md`, section 1, "The order"): each block the
   mixer mixes the 11025 Hz sources into its paint buffers, upsamples every buffer by two, mixes the 22050 Hz
   sources, upsamples every buffer by two again, then mixes the 44100 Hz sources. The mix of a channel into a
   buffer is the entry. So:
   - a `steam` voice (44100 Hz) is entered and nothing else;
   - a `celt_22` or `celt_44` voice (22050 Hz) is entered at 22050 Hz and the entered buffer is upsampled
     once; a `speex` voice (11025 Hz) is entered at 11025 Hz and upsampled twice;
   - **the upsampling is one function on a buffer of 32-bit integers**, `mixUpsample2(x)`:
     `y[2i] = x[i]`, `y[2i + 1] = (x[i] + x[i + 1]) >> 1`: each input kept, and between two the mean, by an
     arithmetic shift, so rounded down, toward minus infinity (W3-07: "an arithmetic shift, so rounded
     down"). The output is twice the input's length. It is exported;
   - **it is applied to each buffer by itself.** With a room there are two buffers (W3-17c), and the floor
     of a mean is not additive: upsampling the sum would differ from the sum of the two upsampled;
   - today's `resampleLinear` (floats, on the gain's output, before any entry) goes for these profiles, and
     the profile key `mixer` with it, if nothing else reads it.
   - **One thing was not read: what the mean after a block's last input leans on.** The mixer upsamples
     block by block (256 samples of a 22050 Hz source make one 512-sample block), and the sample after the
     block's last is not mixed yet. W3-07 gives the rule inside a block only. Built here: the voice is taken
     as one run, so `x[i + 1]` is the voice's next sample across a block's edge, and 0 after the voice's
     last sample. It is one function with this note. If a read of the upsampler shows another rule at the
     edge (see "Open"), the function changes and the CELT and Speex hashes move once more.
3. **The mix stage, in the engine's order** (W3-07 section 2, stages 5 to 11), on 32-bit integers at 44100 Hz:
   - the entered (and upsampled) buffer is the mix: with no room there is nothing to add to it. **This is
     the seam W3-17c needs**: it puts its room path between the upsampling and the clip (two entries, each
     upsampled, `createRoomPath().process(direct, room)`), and hands the sum to the clip unchanged;
   - **until W3-17c the old room code and the listener's low-pass sit at that seam**, in floats as they are
     (the mix divided by 32768, then multiplied back): their result is rounded to the nearest integer, ties
     to even, before the clip, and the old room's tail lengthens the mix as it does now. A render with
     neither meets no float there. A comment says W3-17c removes both;
   - **the clip**, a function of its own (`mixClip`): each sample clamped to -32767..32767 (not -32768);
   - **`volume`**: the clipped integer as a single, times `fround(volume)`, the product rounded to single
     (`fround(fround(v) x fround(volume))`), then rounded to the nearest integer, ties to even (the engine
     converts the block to floats, multiplies, and the device call rounds to nearest with saturation). So
     the ceiling is `round(32767 x volume)`: 4915 at 0.15, 3604 at 0.11;
   - **`softLimit` goes** from the render, the stream and the live chain: the engine has nothing after the
     clip but `volume` and the rounding. (At `volume 1` a clipped voice sits at 32639 of 32768, 0.996, which
     the limiter at 0.98 bends.)
   - **The mixer's blocks.** The stage runs over blocks of exactly 512 samples of the 44100 Hz mix, block
     `b` being samples `512 b` to `512 b + 511` **counted from the render's first sample**, the last one
     short; in `process()`, in `createRender` at any chunking, and in the live chain from the chain's first
     sample. For a 22050 Hz voice a block is 256 voice samples, for 11025 Hz 128. Nothing in this order's own
     arithmetic depends on the block, so no hash can show it: a test hook (`opts.onMixBlock(start, length)`)
     does. It is here because the room's slot is run, and asked for its shares, once per mixer block (W3-17's
     amendment, point 3), and that order must find the blocks in place. The origin (0) is one named value:
     under the game's timeline W3-02c will set it to its channel clock's blocks.
4. **The device stage.** `engine.outputFir` goes. In its place `engine.deviceRate`, default 48000, and the
   option `opts.deviceRate`: the mixer's 16-bit result at 44100 Hz is converted by linear interpolation:
   output sample `n` reads position `n x 44100 / deviceRate` in the input, `y = x[k] + frac x (x[k + 1] -
   x[k])`, the phase starting at 0. `k` and `frac` are computed in whole numbers (`n x 147` over 160 at
   48000), so nothing drifts over a long render; `x` past the input's end is 0; the output's length is
   `ceil(length x deviceRate / 44100)`. With `deviceRate` 44100 the stage is absent and the output is the
   mixer's. One implementation serves the offline render and the stream; the stream gives the same samples
   at any chunking. **The render's output is at the device's rate whatever the source's rate**: the sinc
   resampler to the source's rate goes, and `sampleRate` in the result is `deviceRate`. Only 48000 is
   measured (five recordings); any other rate above 44100 runs the same rule and the option's comment says
   it is not measured. The interpolator's own arithmetic was not read (it is the system's): doubles here,
   and the WAV writer's rounding to 16 bits after it, as now.
5. **What the page gives.** The downloaded file and the page's playback are at the device rate (48000 Hz by
   default). The advanced controls get one choice, "Listener's sound device: 48000 Hz (usual) / 44100 Hz",
   with one sentence of help saying what it does, saved with the other settings and part of what a render is
   cached and compared by. Presets do not change it. **The live chain**, after its mix point as W3-11b left
   it: the entry (and the upsampling for the engine codecs), the clip, `volume` and the rounding as above, in
   place of its mixer resampler, output FIR, float `volume` and limiter; then, when the context runs at
   48000 Hz, the conversion from 44100 Hz by the same linear rule; at 44100 Hz nothing; at any other rate
   what it does today (its sinc resampler), said in the report. The listener's extra low-pass and the old
   room code are W3-17's and stay where they are, between the upsampling and the clip.
6. **The meter, the views and the accuracy tools** read the rate from the render's result, not a constant. Find
   every place that assumes the render is 44100 Hz or at the source's rate (`meter.js`, `app/`, `batch.js`,
   `audio-worker.js`, `tests/accuracy.mjs`, `tests/retiming.mjs`, `tests/reference.compare.mjs`) and list them
   in the report with what each now does. `reference.js` scores the registered predictions and is not
   changed: if it assumes a rate, stop and ask.
7. **"Samples at the clamp" in `tests/accuracy.mjs`.** After this order the model's plateaus sit 19 units
   under a ceiling of 4915, as the game's voice does, and a take's samples reach the ceiling itself only where
   the game's ambience rides on a plateau (W3-07, disagreement 4). So the share of samples **exactly** at the
   ceiling falls to zero in the model while the take keeps its 0.39 to 0.40, and that figure would read as an
   error it is not. The tool's figure becomes the share within 0.5% of the ceiling (25 units of 4915), in the
   take and the model alike; the exact-ceiling share is printed beside it. If a registered prediction is scored
   on the exact share, do not change the scoring: stop and report.

## Checks

A render here has no room and no voice channel: every check below is written for that.

- **`node tests/output-stage.verify.mjs`** (new, in `pnpm test`), each check failing when its line is broken
  (say how; at least the mutations of the table):
  - **the entry:** `mixEntry(s, 255) === Math.trunc(s x 255 / 256)` for all 65,536 samples; the two fixed
    samples of item 1 at the room's volumes; 32767 gives 32639 and -32768 gives -32640;
  - **the order at the mix:** a 44100 Hz voice clamped by the gain at full scale, `volume 0.15`: the render's
    plateaus are exactly **4896 and -4896**, at `deviceRate` 44100 and at 48000 (a flat top passes the
    interpolation unchanged), and no sample reaches 4915; at `volume 1` they are 32639 and -32640; at
    `volume 0.11` 3590;
  - **the clip, on the function** (a render with one voice and no room cannot reach it: the voice alone
    tops out at 32639 and -32640): `mixClip` of sums at and past 32767 and -32767, and of -32768;
  - **`volume` and the rounding:** `32767 x 0.15` gives 4915, `32767 x 0.11` gives 3604; a product that
    lands on a half in single precision rounds to even (the test finds one by search and names it);
  - **the upsampling:** `mixUpsample2([257, 255])` after the entry gives a middle sample of 254 (entered
    first: 255 and 254, mean 254 rounded down), where upsampling before the entry gives 255; entries of -1
    and 0 give -1 between them (rounded down, not toward zero); through a hook on the gain's output
    (`opts.onGain`), a `celt_22` render's mix before the clip equals `mixUpsample2` of the entries by hand,
    and a `speex` render's the same applied twice;
  - **the blocks:** `opts.onMixBlock` reports starts 0, 512, 1024, ... and one short last block, the same in
    `process()` and in `createRender` at chunk sizes 1, 127, 512, 4096 and seeded random sizes, for `steam`,
    `celt_22` and `speex`;
  - **the device stage:** a 1 kHz tone at 44100 Hz through it has images at 2900 and 4900 Hz within 0.3 dB of
    −65.4 and −66.2 dB relative to the tone; a flat run of 4915 stays exactly 4915; a 44100 Hz device returns
    its input unchanged; the response at 13 kHz and 18 kHz is within 0.1 dB of sinc²(f/44100); the stream
    equals the offline result bit for bit at chunk sizes 1, 127, 512, 4096 and seeded random sizes; the
    position of output sample 160,000,000 is exact (whole-number arithmetic);
  - **no limiter:** a full-scale clipped voice at `volume 1` gives 32639 over 32768 exactly.

  | Mutation | Caught by |
  | --- | --- |
  | the entry rounded to nearest, or in doubles | the two fixed samples at the room's volumes |
  | the entry left out (the voice at full level) | the plateaus: 4915 for 4896 |
  | `volume` before the clip | `mixClip` and the order check at `volume 0.15` with a sum past 32767 given to the stage |
  | the clip at -32768 | `mixClip(-32768)` |
  | the rounding half up, or truncation | the half found by search; 4896 (truncation gives 4895) |
  | upsampled before the entry | `[257, 255]` |
  | the mean rounded toward zero | the entries -1 and 0 |
  | one upsampling for `speex` | the `speex` mix by hand |
  | the output FIR left in, or the limiter | the device stage's response at 18 kHz; "no limiter" |
  | the interpolation's phase not starting at 0, or a float position | the images' levels; sample 160,000,000 |
  | blocks counted per chunk in the stream | the blocks check at chunk size 127 |

- `pnpm test` and the browser suite pass (the device choice is on the page, is saved and restored, and a
  render's download is at the chosen rate); CI passes on the pushed branch.
- **Golden hashes:** `createRender` equals `process()` on every case first; then **all** are re-recorded in
  one commit of their own, with the reason in its message. No case is expected to keep its hash. `sw.js`
  cache version up. `tests/predictions/PREDICTIONS.md`: a dated note (`audio.js` and `constants.js` changed
  after registration; what moved; predictions are scored as registered).
- **The builder runs** `node tests/accuracy.mjs --takes tests/realtake` if takes are present, else says it did
  not.
- **The orchestrator runs privately,** before and after on the same main, under the heavy lock:
  - the accuracy table on all takes, with the change per band above 10 kHz. Expected: no band worse by more
    than 0.2 dB, the 13 to 18 kHz bands closer; the anchor levels lower by 0.034 dB (the 255/256);
  - **Set B's plateaus.** The default take and the `voice_avggain 0.25` take, rendered at `volume 0.15`
    (ceiling 4915): on the clipped 1 kHz steps the render's plateau samples are **4896 and -4896** (32639 x
    0.15 = 4895.85). The takes' medians are 4895 to 4896 on top and -4895 to -4897 below, with the game's
    ambience riding on them (W3-18, 1.5: good to about 1.5 units; a second count gave 4894 and -4895,
    `docs/reports/W3-17a-second-read.md`). A render plateau at 4915, or anywhere outside 4894.5 to 4897.5,
    holds the merge. The render has no sample at the ceiling itself; the take's 0.39 to 0.40 there is the
    ambience (item 7);
  - Set C and Set D's PC A are **not** expected to improve here: their takes carry a room (W3-18), which is
    W3-17c's. Their anchor errors stay where they are, less the 0.034 dB.

## Not in this order

The room and water DSP a voice passes through in the game: W3-17 (`docs/work-orders/W3-17-room-effects.md`).
Its part c comes **after** this order and changes one thing in this stage: with a room or under water the
voice is entered twice by `mixEntry`, each buffer upsampled by `mixUpsample2`, the room path's sum handed to
`mixClip`. The old room code and the listener's low-pass stay until then, where item 5 puts them. The voice
channel and the game's timeline (W3-02c), whose output will reach this stage where the gain's does now. The
two-speaker level (182.6/256 with `snd_surround_speakers 2`) and the surround configurations. The duck of the
game's other sound under a voice, and game sound itself. The `volume` of the listener beyond what the page
already offers.

## Open

- **The upsampler at a block's edge** (item 2). W3-07 read the function at `0x1800460e0` for its rule inside a
  block. What the last mean of a block uses decides one sample in 512 for the CELT and Speex profiles. A short
  read on the stronger model would settle it; the orchestrator decides whether it comes before this build or
  after (then one more re-record of those profiles' hashes).
- **The interpolator's arithmetic** is the system's and was measured, not read: its kernel is fixed by the
  recordings, its precision and rounding are not.

## Files

May touch: `constants.js` (`VOICE_ENGINE`: `outputFir` out, `deviceRate` in; the profiles' `mixer` key),
`audio.js` (stage 5 and 6 of `process()`, the same stages of `createRender` and `createLiveChain`, the
exports), `app/` (the control, the download, the players and views that read a rate), `index.html` (the
control), `meter.js` if it assumes a rate, `batch.js`, `audio-worker.js` and `live.js`/`live-worker.js` only
if a rate is assumed there, `tests/output-stage.verify.mjs` (new), `tests/verify.js` and the other suites
where they pin the old stage or a rate (say each), `tests/render-stream.verify.mjs` (the hashes),
`tests/browser.verify.js`, `tests/accuracy.mjs` (items 6 and 7), `tests/retiming.mjs`,
`tests/reference.compare.mjs`, `tests/predictions/PREDICTIONS.md`, `tests/REFERENCE_2026.md` (only "the app
today": the Model table's rows "Mixer: the voice's entry" and "Output stage", its lists of merged and unbuilt
orders, finding 30's last paragraph, the "Samples at the clamp" note under Results), `README.md` (the
pipeline's output line and the settings table), `package.json` (the `test` line), `sw.js`. May not touch:
`steam-sender.js`, `opus-codec.mjs`, `voice-channel.js`, `room-dsp.js`, `room-presets.js`, `vendor/`,
`reference.js`, `tests/predictions/predictions.json`, `docs/PROGRESS.json`.

## Stop and ask

- If `createRender` cannot equal `process()` with the stage in blocks.
- If a suite's check can only pass by keeping the old stage for some profile.
- If `reference.js` or a registered prediction assumes the render's rate or the exact-ceiling share.
