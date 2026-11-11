# W3-10: the mix and output stage as the game's listener gets it

*Rewritten 2026-11-10 for the new order of work (`docs/reports/W3-plan-maintenance-2.md`), then **revised the
same day after the engine's read of the upsampler** (`docs/reports/W3-10-upsampler-read.md`: "the read" below)
**and after its plan review** (9 must-fix, 12 should-fix, 9 notes; what was done about each is in the second
addendum of that maintenance report). What the revision changed: the upsampler's rule is the engine's (the
other phase, with a kept sample: the order had it wrong); the device stage's arithmetic is pinned; the file
holds exactly the render's 16-bit integers (the WAV writer was one unit low on positive samples); the output's
length keeps today's contract; the mixer's blocks are positions and nothing is held back for them; the live
chain's figures that this order moves are listed; the old item on "samples at the clamp" is struck; the
golden hashes get a control; `volume` defaults to 1.0 here.*

**Depends on:** W3-07's report (`docs/reports/W3-07-mixer-output.md`, sections 1 and 2 and "The rule") and the
read. **Starts after W3-11b has merged**, with no other `audio.js` order open. It runs beside nothing but
W3-17b (the room module's files). Nothing of the receiver's orders or of the rooms is assumed: no voice
channel, no game timeline, no room path exist in `audio.js` when it is built.
**Before:** W3-17c, W3-17d and W3-02c to W3-02g.
**Kind:** code. `tf-builder` (effort xhigh), then `tf-reviewer`, then a second reader on the stronger model
(it changes how every render is computed and what every download holds). **Branch:**
`claude/w3-10-output-stage`, from `main` after W3-11b's merge. **Worktree:** given in the brief. **Time
budget:** 2.5 days.

**Read first:** W3-07's report as above; the read (its pseudo-code and tables are this order's test vectors);
W3-11b's report, `docs/reports/W3-11b-live-chain.md`, "For W3-10's builder". Line numbers below are main's
before W3-11b merged: find each again.

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

**What stands in `audio.js` today** (stages 5 and 6 of `process()`, the same in `createRender`; in the live
chain, `mixStages()`, one function for both live paths since W3-11b): the gain's output at the voice's rate;
`resampleLinear` or `resampleSinc` to 44100 Hz (the profile's `mixer`); the listener's low-pass and the old
room code; `engine.outputFir`; `volume` as a float product; a sinc resampler to `max(44100, the source's
rate)`; `softLimit` at 0.98; then a WAV writer that truncates. None of these but the room code survives this
order as it is.

## What to build

Every function named here is exported on `TF2Audio`: the checks need them, and W3-17c calls the first three.

1. **The voice's entry, one function.** `mixEntry(s, volume) = trunc(fround(s x fround(volume)) / 256)`: `s` a
   whole 16-bit sample, `volume` the channel's volume as the engine holds it (a single from 0 to 255; the
   function narrows it itself, so no caller can hand it a double that is not one), the product rounded to
   single precision once, the division by 256 exact, the result truncated toward zero (W3-07 section 1; the
   read, section 4). Here the volume is 255: `mixEntry(s, 255)` is `trunc(s x 255 / 256)` for every 16-bit
   `s` (32767 gives 32639, -32768 gives -32640). **W3-17c calls this same function twice a sample**, with the
   volumes `255 x direct / 256` and `255 x room / 256`, and checks it against the room module's own `entry`
   on all 65,536 samples: so the single rounding must be there even though at 255 it changes nothing
   (`mixEntry(-32690, 255 x 229 / 256)` is -29128, where exact division gives -29127;
   `mixEntry(31388, 255 x 23 / 256)` is 2809, not 2808; the plan's reviewer ran all 65,536 at shares 256,
   229, 26 and 23 against the module).
   - **What `s` is.** Since W3-05 the gain's output is whole 16-bit values over 32768, and for `steam` what
     the gain was given was 16-bit too (W3-11a). Where a path hands the mix a value that is not whole (the
     auto-gain switched off: the voice times `voice_scale`, clipped; any other the builder finds), it is
     rounded to the nearest whole value, ties to even, and clamped to -32768..32767 before the entry. (That
     path's own clip is at ±32767, so -32768 never arrives on it.) List those paths in the report.
   - **No rate from a name.** `celt_44`'s voice is at 22050 Hz since W3-06 (`modeRate` 44100 is only the
     codec's mode): the stage takes the voice's rate from `voiceRate`.
   - **The hook.** `opts.onGain` fires on every profile in `process()` and in `createRender`, as it does on
     `steam` today and in the live chain since W3-11b: it is handed what reaches the entry. The control of
     "Golden hashes" and the checks by hand rest on it.
2. **The upsampling by two: the engine's rule, with its kept sample** (the read, sections 1, 2 and 4;
   **it corrects this order's first text, which had the other phase**). Each block the mixer mixes the
   11025 Hz sources into its buffers, upsamples every buffer by two, mixes the 22050 Hz sources, upsamples
   every buffer by two again, then mixes the 44100 Hz sources. The mix of a channel into a buffer is the
   entry. So the entry comes first, at the voice's own rate, and then:

   ```
   function mixUpsample2(x, state) {            // x: Int32Array; state: { prev }, one per buffer and per stage, 0 at first
     const y = new Int32Array(2 * x.length);
     let prev = state.prev;
     for (let k = 0; k < x.length; k++) {
       y[2 * k]     = (prev + x[k]) >> 1;       // the mean of the input before and this one, rounded down
       y[2 * k + 1] = x[k];                     // the input itself
       prev = x[k];
     }
     state.prev = prev;
     return y;
   }
   ```

   - The shift is arithmetic: the mean is rounded toward minus infinity (`(-1 + 0) >> 1` is -1).
   - **It is stateful, so it needs no look-ahead and gives the same samples at any chunking**: the kept
     sample crosses calls. Nothing is special at a mixer block's edge; the "one sample in 512" the first text
     feared does not exist.
   - a `steam` voice (44100 Hz) is entered and nothing else; a `celt_22` or `celt_44` voice (22050 Hz) is
     entered and passes **one** stage (the engine's stage 1); a `speex` voice (11025 Hz) passes **two**, each
     with **its own state** (`mixUpsample2(mixUpsample2(e, st0), st1)`);
   - **the state belongs to the buffer and the stage, not to the voice**: it starts at 0 when a render or a
     live chain starts, and nothing resets it after that, not a new spurt and not a mixer block (in the
     engine only stop-all-sounds clears it). With a room there are two buffers (W3-17c), each with its own
     states, each upsampled by itself: the floor of a mean is not additive;
   - **the output is one mix sample later per stage than the first text had it**: voice sample `k` of a
     22050 Hz voice sits at mix sample `2k + 1`, of an 11025 Hz voice at `4k + 3`. So a CELT render is one
     44100 Hz sample (23 µs) late against its source and a Speex render three (68 µs). That is the game's,
     as the Steam resampler's lateness is, and it is not trimmed;
   - **a voice of `N` samples gives `2N + 1` samples that can be non-zero (`4N + 3` for `speex`)**: the last
     mean falls into the zeros after the voice. The render runs the stage on over zeros until it has them (one
     more voice sample of zeros per stage). What becomes of them is item 5's length rule;
   - today's `resampleLinear` on the gain's output goes for these profiles, and with it the profile key
     `mixer`, `linearStage`, `streamResampleLinear` and `linearLength`. `TF2Audio.resampleLinear` itself stays
     exported with its check (`tests/verify.js`, about line 1081): it is a plain utility. The check of
     `tests/speex102.verify.mjs` (about line 402) that reads `mixer` changes with the key.
3. **The stage after the sum, one function.** `mixOut(sum, volume)`, on a 32-bit integer of the 44100 Hz mix:
   - **the clip** (`mixClip`, exported by itself too): clamped to -32767..32767 (not -32768);
   - **`volume`**: the clipped integer as a single, times `fround(volume)`, the product rounded to single
     (`fround(fround(v) x fround(volume))`): the engine converts the block to floats and multiplies. Its
     factor is `volume x (1 - soundfade)`; `soundfade` is 0 in play and is not modelled;
   - **the rounding**: to the nearest integer, **ties to even** (the device call rounds to nearest with
     saturation). So the ceiling is `round(32767 x volume)`: 4915 at 0.15, 3604 at 0.11.

   With no room the entered (and upsampled) buffer is the sum: there is nothing to add to it. **This is the
   seam W3-17c needs**: it puts its room path between the upsampling and `mixOut` (two entries, each buffer
   upsampled with its own states, `createRoomPath().process(direct, room)`), and hands the sum on unchanged.
   - **Until W3-17c the old room code and the listener's low-pass sit at that seam**, in floats as they are
     (the mix divided by 32768, then multiplied back): their result is rounded to the nearest integer, ties
     to even, before `mixOut`, and the old room's tail lengthens the mix as it does now. A render with
     neither meets no float there. A comment says W3-17c removes both.
   - **`softLimit` goes** from the render, the stream and the live chain: the engine has nothing after the
     clip but `volume` and the rounding. (At `volume 1` a clipped voice sits at 32639 of 32768, 0.996, which
     the limiter at 0.98 bends.)
4. **The mixer's blocks are positions, and nothing waits for them.** Block `b` is samples `512 b` to
   `512 b + 511` of the 44100 Hz mix, **counted from the render's first sample**; in the live chain, from the
   chain's first sample at its mix point (`mixStages()`, which W3-11b left as one stage boundary). For a
   22050 Hz voice a block is 256 voice samples, for 11025 Hz 128 (the read, section 3). With no room nothing
   in this order's arithmetic depends on a block: the entry and `mixOut` have no memory and the upsampler
   carries its state. So **the stage holds nothing back for a block**: `createRender` and the live chain pass
   samples on as they come. The blocks are exposed: a test hook, `opts.onMixBlock(start, length, mix)`, is
   called once per block, when the block's last sample has passed (and once for a short last block at the
   end of a render), with `start` a multiple of 512 and `mix` a copy of the block's samples before the clip.
   Keeping that copy is the hook's cost: with no hook nothing is buffered. It is here because the room's slot
   is run, and asked for its shares, once per mixer block, and W3-17c must find the positions in place;
   **holding a partial block until it is whole is W3-17c's, only when a room is on** (its part c says so).
   The origin (0) is one named value: under the game's timeline W3-02c will set it to its channel clock's
   blocks. An origin that is not a multiple of 4 mix samples would cut an 11025 Hz voice sample in two, so
   the comment says a later order may only set it for a 44100 Hz voice or to a multiple of 4.
5. **The device stage, as integers, and the output's length.** `engine.outputFir` goes. In its place
   `engine.deviceRate`, default 48000, and the option `opts.deviceRate`: **an integer from 44100 to 192000;
   anything else (a string, a fraction, a rate below 44100) is the default.** The page offers two. The mixer's
   16-bit result `x` at 44100 Hz is converted by linear interpolation, the phase starting at 0. With
   `g = gcd(44100, R)`, `N = 44100 / g`, `D = R / g` (147 and 160 at 48000):

   ```
   n x N = D k + r            in whole numbers (mixDevicePosition(n, R) -> { k, r }, exported)
   y[n]  = roundEven( (x[k] (D - r) + x[k + 1] r) / D )      # an integer; x past the mix's end is 0
   ```

   - The numerator is a whole number, so the rounding is exact: a tie is `2 x remainder = D`, and it goes to
     the even neighbour. `y` is a 16-bit integer (it lies between two 16-bit inputs), and the render's
     `samples` are `y / 32768`, exact in single precision.
   - **It is a model of the system's mixer, and marked so** in the code, the report and the reference: the
     kernel is fixed by the recordings (the images, and flat tops that stay exactly on the ceiling, which
     this form keeps); its precision and its rounding were not read, and the takes are 16-bit at 48000 Hz.
     Only 48000 is measured; another rate runs the same rule and the option's comment says it is not
     measured.
   - With `deviceRate` 44100 the stage is absent and the output is the mixer's integers.
   - One implementation serves the offline render, the stream and the live chain; it is stateful (it keeps
     the last input sample and its position), waits for `x[k + 1]`, and gives the same samples at any
     chunking.
   - **The output's length keeps today's contract: the source's duration at the output rate.** The rate is
     now the device's, whatever the source's rate (the sinc resampler to the source's rate goes, and
     `sampleRate` in the result is `deviceRate`): `round(sourceLength x deviceRate / sourceRate)`, plus the
     old room's tail converted as now, in `process()` and as `createRender().outputLength`. **The device
     stage's output is cut, or padded with zeros, to that length.** `tests/verify.js` (about line 856), the
     browser suite's "its whole length" (about lines 327 to 329), the video's audio, A/B and W3-17c
     ("`outputLength` stays the length without a tail") rest on it.
   - **What the upsampler's `2N + 1` means under that contract:** the mix handed to the device stage is the
     upsampler's whole output, its last mean included; past that the device stage reads zeros; the cut to
     the contract's length then decides whether the last mean is in the file. Nothing is shifted back to
     hide the one or three samples of lateness.
6. **The file holds exactly the render's integers.** Today `toInt16` writes `s x 32768` for negative samples
   and `s x 32767` for positive ones into an `Int16Array`, which truncates: a render's 4896 is written 4895,
   its ceiling 4915 as 4914, 32639 as 32638. `video.js` writes its PCM as `round(s x 32767)`. Both become
   `round(s x 32768)`, ties to even, clamped to -32768..32767: for a render's samples, which are whole
   numbers over 32768, that writes each integer as itself. `toInt16` changes for every caller (the WAV, the
   MP3 encoder's input, the video's audio). `tests/formats.verify.mjs` (about line 185) pins the old
   asymmetry and is re-derived, with the old and new expectation in the report. **This corrects what the
   user downloads** (every positive sample of every file was one unit low): the report and the reference
   say so in those words.
7. **What the page gives.** The downloaded file and the page's playback are at the device rate (48000 Hz by
   default).
   - **The device choice**: "Listener's sound device: 48000 Hz (usual) / 44100 Hz", with one sentence of
     help. It gets a console-style name, `snd_device_rate`, whose help says it is the app's own and not a
     TF2 variable (a property of the listener's PC); a share-link and settings key, `dev`
     (`CONFIG_FIELDS`); built-in presets leave it alone, links and saved presets carry it, and a link
     without it gets 48000. The chain strip (`app/console.js`, about lines 490 and 491: "Mixer 44.1 kHz",
     "Output volume") shows the device's rate.
   - **`volume` defaults to 1.0**, the game's own default, in place of the app's 0.5 (the owner: "1.0 with
     the label"). **It is made in this order because this order owns the stage and its words, not because
     of the hashes: the default moves no golden hash**, since every golden case passes `volume` itself.
     `VOICE_ENGINE.volume` becomes 1; the control's words are W4-01's part d, and until then the label reads
     "the game's default". Every place that silently depends on 0.5 is found and fixed, and listed in the
     report: `tests/verify.js` (about lines 821 to 825, "output volume scales the rendered file linearly",
     renders at the default and compares with `ENGINE.volume`: at 1.0 it would compare a render with itself
     and pass: it becomes 0.3 against 1, both passed); `tests/browser.verify.js` (about line 1238 expects
     '0.5' after a preset); `index.html` (about line 254, `value="0.5"`); `README.md` (about line 133, "the
     rendered file uses `volume 0.5`"); `app/console.js` (about line 538 takes `VOICE_ENGINE.volume` and
     follows). Share links always carry `vol`, so old links keep their 0.5; a hand-made link without it gets
     1.0; saved presets keep their value. The accuracy tools pass each take's own `volume`.
   - **At `volume 1` a loud render sits at full scale, as the game's does.** Converted to 48000 Hz and
     played, a clipped voice has peaks between the samples over 0 dBTP, so the meter's warning
     (`app/meter.js`, about line 85) shows on most loud default renders, and MP3, AAC and Opus exports
     overshoot; the limiter that hid this is gone on purpose. The page says so in one plain sentence beside
     the `volume` control ("At 1, the game's default, a loud voice fills the whole range, as it does in the
     game"), the meter's note says that this is what the game's default gives, and the note at the lossy
     exports suggests lowering `volume`. No hidden limiter.
8. **The live chain** (`mixStages()`): the entry (and the upsampling for the engine codecs, with states made
   with the chain), `mixOut`, in place of its mixer resampler, output FIR, float `volume` and limiter; the
   listener's low-pass and the old room code where item 3 puts them. Then the conversion to the context's
   rate: **the device stage's linear rule at any context rate above 44100 Hz, nothing at 44100 Hz, and the
   sinc resampler only below 44100 Hz** (a context below 44.1 kHz is the browser's, not the game's: say so
   in the comment and the report). `onMixBlock` works there too. **What this moves, each re-derived from the
   new stage and given old and new in the report, not only re-recorded:**
   - `contentDelay`, the output's index shift: on `steam` it was the output FIR's one sample and becomes
     **0** at any context rate from 44100 up (the linear stage starts at phase 0 and shifts nothing); on the
     frame path it loses the FIR's term (the check at `tests/verify.js`, about line 1145, has `+ 1/44100`)
     and gains the upsampler's one mix sample on the CELT profiles and three on `speex`, at the context's
     rate;
   - both `latencyMs` figures of `steam` (`holdBack()` in `steamLiveChain` names each part): the FIR's
     sample goes; the sinc resampler's wait is replaced by the linear stage's wait for one 44100 Hz sample
     (none at 44100 Hz); the low-latency figure the page shows follows;
   - browser check 3f's latency window; [10b]'s recorded `steam_48` live hashes (key held and scripted key);
     [10b]'s `contentDelay` check, which expects `round(rate / 44100)` today.
9. **The meter, the views and the accuracy tools** read the rate from the render's result, not a constant.
   Find every place that assumes the render is 44100 Hz or at the source's rate (`meter.js`, `app/`,
   `batch.js`, `audio-worker.js`, `video.js`, `tests/accuracy.mjs`, `tests/retiming.mjs`,
   `tests/reference.compare.mjs`) and list them in the report with what each now does.
   **`reference.js` is not changed, and its 48000 is settled here:** its `clampLevel` falls back to
   `clipSignature(samples, 48000)` and `clipSignature`'s block is `rate x 256 / 48000`. That is harmless:
   the renders it scores are made at the default device rate, 48000, which is the takes' rate, and the
   ceiling figure does not use the block. The stop is the other case only: if a scored render would be at
   another rate, stop and ask.
10. **`tests/accuracy.mjs`** may print, beside its existing figures and changing none, the share of samples
    at the exact ceiling. (The first text had an item that redefined "samples at the clamp". It rested on a
    misreading: that figure is `reference.js`'s share of samples within 5% of the clamp, which a plateau
    0.4% under the ceiling does not move. The item is struck, with its edit to the reference.)

## Amendment after the reviewer's short read (2026-11-10): seven corrections that overrule the text above

The reviewer ran every test vector of this order and they hold. These points of wording do not, and a builder
follows this section where it differs from the text above.

1. **`onGain` hands over the gain's output before the round to even** (item 1's hook; the control's step 1
   and 2). That is where it fires on `steam` today, and the control's hashes are recorded that way. Handing
   over rounded values would move the hashes of "steam, auto-gain off" and "steam, auto-gain off,
   voice_scale 3" and stop a correct build.
2. **The frame path's `contentDelay` only loses the output FIR's term** (item 8). It gains nothing for the
   upsampler: `contentDelay` is the live output's shift against a render, and the upsampler's one or three mix
   samples are in the render too. On `steam` it is 0, as item 8 says.
3. **The frame path's own `latencyMs`** (`preroll + delaySeconds`) and its check also lose the FIR's term. They
   are among the figures to re-derive, with old and new in the report.
4. **The low-latency saving is unchanged**, not "follows": it is the difference of the two figures.
5. **The mix's length is exactly 2N + 1 samples for a 22050 Hz voice and 4N + 3 for 11025 Hz.** The zeros the
   upsampler runs on over, to give its last mean, are not part of the mix. A stream must flush the upsampler
   before it ends the device stage, or the last mean reads as 0.
6. **The spec model in the control's step 3 calls the engine's own `applyBiquad`** for the one golden case
   with a low-pass at the seam ("test position with a low-pass"): its Float32 output times 32768, then rounded
   to even. A biquad written afresh in doubles can differ in the last bit. No other golden case has an old
   stage at the seam.
7. **"The video's audio" means the MOV's PCM.** AAC and Opus take floats and do not change. `toInt16`'s other
   callers: the render's WAV, the dry WAV, the aligned take, the live take, and the MP3 path on its resampling
   branch only. `tests/video.verify.mjs` (about line 69) decodes over 32767 and becomes 32768. The three MP3
   hashes do not move. One side effect for the report: the dry WAV of a 16-bit source now round-trips exactly,
   so the A/B dry file changes by one unit on positive samples.

## Amendment after the private run (2026-11-11): the expected change from 11 kHz up, restated

The figures under "The orchestrator runs privately" for 12 to 16 kHz (−0.12 dB) and 16 to 19 kHz (−0.90 dB) are
wrong, and the one for 11 to 12 kHz (+0.10) is right only for a flat input. They compare the stage's response
(sinc²) with the old filter's and leave out the **images** that linear interpolation from 44100 to 48000 Hz makes:
each component `f` of the mix also comes out at `3900 + f`, at sinc²((44100 − f) / 44100) of its level (−22.8 dB for
10 kHz), and further down at `7800 ± f`. The voice's 8 to 12 kHz therefore lands in 12 to 16 kHz, where the voice
itself has little. W3-07 measured these images in the takes; the plan's review did not carry them into the table. The
builder found it on synthetic signals and predicted the render's bands from the images within 0.35 dB (the report,
"The change by band"); the reviewer's own stage has the images within 0.04 dB of theory.

**What the private run gave** (twelve takes without random loss and with sound in these bands; model minus
recording, before and after on the same main):

| Band, Hz | Change | Mean size of the error, before to after, dB |
| --- | --- | --- |
| anchor level | −0.026 to −0.033 dB (expected −0.025) | |
| 5000–8000 | +0.07 to +0.10 (expected +0.10) | 0.18 to 0.15 |
| 8000–10000 | +0.13 to +0.15 (expected +0.13) | 0.32 to 0.30 |
| 10000–11000 | +0.12 to +0.17 (expected +0.13) | 0.53 to 0.56 |
| 11000–12000 | +0.13 to +0.30 | 0.83 to 0.90 |
| 12000–16000 | +0.09 to +4.27, by how much of a take's sound sits at 8 to 12 kHz against 12 to 16 | 1.71 to 0.86 |
| 16000–19000 | −0.37 to +39.7 (a take with nothing there before) | 6.34 to 1.89 |

**The ruling.** The hold rule (a band more than 0.05 dB from its figure) stands from the anchor to 11 kHz, where
every take is within it. From 11 kHz up it is withdrawn: no single figure exists there, because the change depends on
the take's own spectrum, and the stage is pinned by other means (every stage exact in integers against the engine's
read; the images of a tone within 0.02 dB of W3-07's measured ones; the reviewer's own model equal on every case).
The merge is not held. Above 12 kHz the model is now closer to the recordings than the fitted filter was, on every
kind of take but the Set B test signal's, where 12 to 16 kHz goes from 0.8 to 3.3 dB low to 0.5 to 1.1 dB high.

## Checks

A render here has no room and no voice channel: every check below is written for that.

- **`node tests/output-stage.verify.mjs`** (new, in `pnpm test`), each check failing when its line is broken
  (say how; at least the mutations of the table):
  - **the entry:** `mixEntry(s, 255) === Math.trunc(s x 255 / 256)` for all 65,536 samples; -29128 and 2809
    at the room's volumes (item 1); 32767 gives 32639 and -32768 gives -32640; a volume handed as a double
    that is not a single gives what its single gives;
  - **a value that is not whole:** auto-gain off, `voice_scale 0.5`, a source that makes the scaled voice
    land on `k + 0.5`: the entry is given the even neighbour (through `onGain` and `onMixBlock`);
  - **the upsampler, by the read's tables:** from state 0, `[255, 254]` then a zero give
    `127, 255, 254, 254, 127, 0`; `[-1, 0]` gives `-1, -1, -1, 0`; `[5]` then a zero gives `2, 5, 2, 0`,
    and through two stages `1, 2, 3, 5, 3, 2, 1, 0`; `[-5]` then a zero gives `-3, -5, -3, 0`. **The ramp
    across a block's edge:** `x[k] = 3k - 766` in calls of 256: outputs 510 to 513 are `-3, -1, 0, 2`, and
    the first four of the run are `-383, -766, -765, -763`. **Two stages:** `x[k] = 7k - 892` in calls of
    128: outputs 508 to 515 are `-9, -7, -5, -3, -2, 0, 2, 4`. One call over a whole run equals calls of
    1, 127, 128 and 256 samples, on seeded inputs;
  - **entered first:** `mixUpsample2` of `[mixEntry(257, 255), mixEntry(255, 255)]` and a zero is
    `127, 255, 254, 254, 127, 0`; upsampling `[257, 255]` and entering after gives `127, 255, 255, 254, 126,
    0`. Through `onGain` and `onMixBlock`, a `celt_22` render's mix before the clip equals the entries
    through one stage by hand, sample for sample from the render's first block, and a `speex` render's the
    same through two stages with two states;
  - **`mixOut`:** `mixOut(40000, 0.15)` is 4915 (`volume` before the clip gives 6000); `mixOut(-27270,
    0.15)` is -4091 (the product in doubles is -4090.5 and gives -4090); the ties `mixOut(30, 0.15)` = 4,
    `mixOut(-30, 0.15)` = -4, `mixOut(10, 0.15)` = 2, `mixOut(-10, 0.15)` = -2 (half up gives 5 and -1,
    half away from zero 5 and -5), and at 0.5 `mixOut(3)` = 2, `mixOut(5)` = 2, `mixOut(-3)` = -2;
    `mixOut(32767, 0.15)` is 4915 and `mixOut(32767, 0.11)` 3604; `mixClip(-32768)` is -32767;
  - **the order at the mix, in a render:** a 44100 Hz voice clamped by the gain at full scale, `volume 0.15`:
    the render's plateaus are exactly **4896 and -4896**, at `deviceRate` 44100 and at 48000, and no sample
    reaches 4915; at `volume 1` they are 32639 and -32640; at `volume 0.11`, 3590 and -3590;
  - **the device stage, by vector:** at 48000, a ramp `x[k] = 160 k` gives `y[n] = 147 n` exactly (the first
    twelve: 0, 147, 294, 441, 588, 735, 882, 1029, 1176, 1323, 1470, 1617); an impulse `x[1] = 16000` gives
    `0, 14700, 2600, 0`; output 80 reads `k` 73 with `r` 80, a tie whenever the two inputs' sum is odd:
    inputs 1 and 2 give 2, 2 and 3 give 2, -1 and -2 give -2, -2 and -3 give -2; a flat run of 4915 stays
    4915; a 44100 Hz device returns its input unchanged;
  - **the positions:** `mixDevicePosition(n, R)` against the same arithmetic in `BigInt`, on seeded `n` up to
    2^40 and at 160,000,000, for `R` 48000, 88200, 96000 and 192000;
  - **the stage's sound:** a 1 kHz tone **at -6 dBFS or louder** at 44100 Hz (a quiet 16-bit tone moves the
    figures by 0.2 dB) through it has images at 4900 and 2900 Hz within 0.3 dB of −65.4 and −66.2 dB
    relative to the tone (the plan's review computed −65.38 and −66.17); the response at 13 kHz and 18 kHz
    is within 0.1 dB of sinc²(f/44100) (−2.56 and −5.05 dB);
  - **the stream:** the device stage, the upsampler and the whole stage give the same samples at chunk
    sizes 1, 127, 512, 4096 and seeded random sizes as in one piece; `createRender` equals `process()` on
    'steam, volume 1, voice_maxgain 3' (a limiter left in one of them shows there);
  - **the blocks:** `onMixBlock` reports starts 0, 512, 1024, ... and one short last block, with the same
    samples, in `process()` and in `createRender` at those chunk sizes, for `steam`, `celt_22` and `speex`;
  - **the length:** for sources at 8000, 22050, 44100, 48000 and 96000 Hz and at both device rates, the
    output's length is `round(sourceLength x deviceRate / sourceRate)` and equals
    `createRender().outputLength`; for a `celt_22` render of a voice of `N` samples the mix handed to the
    device stage is `2N + 1` long, its last sample the last mean (through `onMixBlock`), `4N + 3` for
    `speex`, and the file is the contract's length whatever that cuts;
  - **the file's bytes:** the WAV of the clamped voice at `volume 0.15` holds 4896 and -4896; of a flat run
    at the ceiling, 4915; at `volume 1`, 32639 and -32640; every sample of a render's WAV equals `samples x
    32768` exactly; the video's PCM the same (`tests/video.verify.mjs` or where its audio is checked);
  - **the live chain is the render after the mix point:** with a context at 48000 Hz the live chain's output
    equals `createRender({ deviceRate: 48000 })`'s, sample for sample, over what it gave out, on `steam` at
    `volume 1` and at 0.5; at 44100 Hz it equals `deviceRate: 44100`'s. (W3-11b made the mix point equal;
    this makes the rest equal. It catches a limiter left in the live chain and the device stage applied
    twice.) `contentDelay` is 0 there, checked at the correlation's peak as [10b] does, and `onMixBlock`
    reports the same starts and samples as the render's.

  | Mutation | Caught by |
  | --- | --- |
  | the entry at 255 written as a shift | all 65,536 samples |
  | the entry in doubles, or rounded to nearest | -29128 and 2809 |
  | the entry left out (the voice at full level) | the plateaus: 4915 for 4896 |
  | a value that is not whole truncated | the `k + 0.5` check |
  | **the upsampler in the first text's phase** (`y[2k] = x[k]`) | `[255, 254]`: 255 comes first; the ramp's first four |
  | **the upsampler's state reset per block** | the ramp: output 512 is 1, not 0 |
  | the mean rounded toward zero | `[-1, 0]`; `[-5]` |
  | one stage for `speex`, or one state for its two stages | the two-stage ramp; `[5]` through two stages |
  | upsampled before the entry | the "entered first" pair |
  | the upsampler's state lost at a chunk's edge in the stream | the `celt_22` and `speex` stream cases; the mix by hand |
  | `volume` before the clip | `mixOut(40000, 0.15)` |
  | the `volume` product in doubles | `mixOut(-27270, 0.15)` |
  | ties half up, or half away from zero | the four ties at 0.15 |
  | rounding by truncation | the render's plateau: 4895 |
  | the clip at -32768 | `mixClip(-32768)` |
  | `softLimit` left in `createRender` only, or in the live chain | the stream on 'steam, volume 1, voice_maxgain 3'; the live equality at `volume 1` |
  | the interpolation's phase off by one, or the fraction from the wrong neighbour | the ramp and the impulse; the images (the wrong neighbour gives -26.5 dB) |
  | the device stage's value in floats, rounded half up | output 80's four ties |
  | the position by an accumulated float | `mixDevicePosition` against `BigInt` |
  | the device stage's state lost at a chunk's edge, or applied twice in the live chain | the stream at the chunk sizes; the live equality |
  | blocks counted per chunk in the stream | the blocks check at chunk size 127 |
  | the output's length by the mix's (`ceil`) | the length check at 22050 and 8000 Hz |
  | the WAV writer left as it was | the file's 4896 and 4915 |
  | the gain's output moved by the change | the control of "Golden hashes" |

  Two mistakes cannot be made here and are W3-17c's to catch (its square wave through preset 6): a clip on
  each entry before the sum, and upsampling the sum of two buffers.
- **Golden hashes, with a control a reader can follow** (`tests/render-stream.verify.mjs`):
  1. **Before any change**, with `onGain` on every profile (item 1's hook, added first and shown to move
     nothing): the SHA-256 of each golden case's gain output, recorded in the report.
  2. **After the change**: the same hashes, case for case. What reaches the mix did not move.
  3. **A model of the spec, written in the test** from this order's text (the entry, the upsampler, the old
     stages where a case has them, `mixOut`, the device stage, the length): applied to each case's gain
     output it gives the render's samples, for every golden case.
  4. Then the WAV hashes are re-recorded in one commit of their own, with the reason in its message.

  **What moves and what does not:** every WAV hash moves but 'steam, empty source' (a header and no data,
  48000 Hz before and after). **No `codecInfo` hash moves**: the stage is after the codec, and this order
  adds no key to `codecInfo`. The golden `PAGE` options keep `volume: 0.5` **explicitly** (at 0.5 every odd
  sample is a tie, so the cases exercise the rounding), and its comment no longer says "the page's default
  settings"; 'steam, volume 0.3' keeps the case where the single product differs from the double.
  `createRender` equals `process()` on every case first.
- `pnpm test` and the browser suite pass (the device choice is on the page, has its console name, is saved,
  restored and carried by a link, is kept across a built-in preset, and a render's download is at the chosen
  rate; `volume` shows 1 on a fresh page; the sentence beside it; 3f's restated window). CI passes on the
  pushed branch. `sw.js` cache version up. `tests/predictions/PREDICTIONS.md`: a dated note (`audio.js` and
  `constants.js` changed after registration; what moved; predictions are scored as registered).
- **The builder runs** `node tests/accuracy.mjs --takes tests/realtake` if takes are present, else says it did
  not.
- **The orchestrator runs privately,** before and after on the same main, under the heavy lock:
  - **the accuracy table on all takes, by band.** Expected from sinc² against the old filter (the plan's
    review computed these; each within 0.05 dB): the anchor level about 0.025 dB lower (0.034 for the
    255/256, less 0.009 that the 300 Hz to 3 kHz band gains); 5 to 8 kHz +0.10 dB; 8 to 10 kHz +0.13;
    10 to 11 kHz +0.13; 11 to 12 kHz +0.10; 12 to 16 kHz −0.12; 16 to 19 kHz −0.90. So the 10 to 12 kHz
    bands, where the model is already 1 to 3 dB bright, get 0.1 dB worse, and Set A's 12 to 16 kHz, already
    0.8 to 1.0 dB low, 0.12 dB lower: that is the stage as measured against a filter that was fitted to
    those very bands, and it is reported, not tuned. A band that moves by more than 0.05 dB from these holds
    the merge;
  - **Set B's plateaus.** The render's are 4896 and -4896 by construction (the public check pins it). The
    comparison is with the takes: on the default take and the `voice_avggain 0.25` take, the middle sample
    of each top and each bottom plateau of the clipped 1 kHz steps, left channel, taken phase-locked to the
    tone, and the median of those (W3-18, 1.2 and 1.5: 4895 to 4896 and -4895 to -4897; a second count over
    18,306 top and 18,203 bottom plateaus gave 4894 and -4895, `docs/reports/W3-17a-second-read.md`). The
    game's ambience rides on the plateaus, so the takes are good to about 1.5 units; a render plateau
    outside 4894.5 to 4897.5 holds the merge;
  - Set C and Set D's PC A are **not** expected to improve here: their takes carry a room (W3-18), which is
    W3-17c's.

## Not in this order

The room and water DSP a voice passes through in the game: W3-17 (`docs/work-orders/W3-17-room-effects.md`).
Its part c comes **after** this order and changes one thing in this stage: with a room or under water the
voice is entered twice by `mixEntry`; each of the two buffers is upsampled by `mixUpsample2` **with its own
states** (two buffers, so two states for a CELT voice and four for `speex`); the room path's sum goes to
`mixOut`; and with a room on, a partial mixer block is held until it is whole. The voice channel and the
game's timeline (W3-02c), whose output will reach this stage where the gain's does now. The two-speaker level
(182.6/256 with `snd_surround_speakers 2`) and the surround configurations. The duck of the game's other
sound under a voice, and game sound itself. `soundfade`. The words of the `volume` control (W4-01, part d).

## Open

- **The interpolator's arithmetic** is the system's and was measured, not read: its kernel is fixed by the
  recordings, its precision and rounding are this order's model (item 5).
- **The one-sample phase of the upsampler rests on the read alone**: no take can show it (48000 Hz, with
  ambience). The read is of a short routine with no branch but its loop.

## Files

May touch: `constants.js` (`VOICE_ENGINE`: `outputFir` out, `deviceRate` in, `volume` 1; the profiles'
`mixer` key), `audio.js` (stages 5 and 6 of `process()`, the same stages of `createRender`, `mixStages()` and
the figures of `createLiveChain` that item 8 lists, `toInt16`, `onGain` on every profile, the exports),
`video.js` (its PCM's scaling, and a rate if it assumes one), `app/` (the device control and its name in
`app/console.js`, the chain strip, the `volume` sentence, the meter's note in `app/meter.js`, the lossy
exports' note, the download, the players and views that read a rate), `index.html`, `meter.js` if it assumes
a rate, `batch.js`, `audio-worker.js`, `live.js` and `live-worker.js` only where a rate or a latency figure
is assumed, `tests/output-stage.verify.mjs` (new), `tests/verify.js`, `tests/gain.verify.mjs` (it rebuilds
the old stage, about lines 307 to 312 and 417 to 419), `tests/speex102.verify.mjs`,
`tests/formats.verify.mjs`, `tests/video.verify.mjs`, `tests/opus.verify.mjs` and any other suite only where
it pins the old stage, a rate or the old writer (say each), `tests/render-stream.verify.mjs` (the hashes and
the control), `tests/browser.verify.js`, `tests/accuracy.mjs` (items 9 and 10), `tests/retiming.mjs`,
`tests/reference.compare.mjs`, `tests/predictions/PREDICTIONS.md`, `tests/REFERENCE_2026.md` (only "the app
today": the Model table's rows "Mixer: the voice's entry" and "Output stage", its opening sentence and its
lists of merged and unbuilt orders, finding 30's last paragraph, a dated line that every download's positive
samples were one unit low until this order, and the read's rule where finding 30 speaks of the engine
codecs' upsampling), `README.md` (the pipeline's output line, the settings table, the sentence on `volume`
at about line 133, the device choice), `package.json` (the `test` line), `sw.js`. May not touch:
`steam-sender.js`, `opus-codec.mjs`, `voice-channel.js`, `room-dsp.js`, `room-presets.js`, `vendor/`,
`reference.js`, `tests/predictions/predictions.json`, `docs/PROGRESS.json`.

## Stop and ask

- If `createRender` cannot equal `process()`, or the live chain the render, after the mix point.
- If a gain-output hash moves between steps 1 and 2 of the control, or a `codecInfo` hash moves.
- If the spec's model in the test and the render disagree on a golden case: give the case and the first
  sample; do not adjust either to the other.
- If a suite's check can only pass by keeping the old stage for some profile.
- If a render that `reference.js` scores would not be at 48000 Hz.
