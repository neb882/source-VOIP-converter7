# W3-11: the `steam` profile sends and decodes as Steam does

*Rewritten 2026-11-10 after the plan's review (findings 7 to 18 and its note on size;
`docs/reports/W3-11-plan.md`, "The review"): split in two; for the `steam` profile only; the 16-bit decode is
the library's own; the gate off is a sender setting; the checks that a correct build would have failed are
replaced.*

| Part | What | Starts after | Budget |
| --- | --- | --- | --- |
| **W3-11a** | the render and `createRender`: the sender, the decoder's rules, 16 bits, the resampler, `codecInfo`, the golden hashes | W2-02, W3-05, W3-06, W3-12b, W3-02b and W3-13 merged; no other `audio.js` order open | 2 days |
| **W3-11b** | the live chain, the threshold control and its default, the page's texts, README | W3-11a | 1 day |

Both before W3-02c. **Kind:** code. `tf-builder` (effort xhigh for a, high for b), then `tf-reviewer`; a's diff
also gets a second reader on the stronger model (it changes how a render is computed). **Branches:**
`claude/w3-11a-steam-render`, `claude/w3-11b-steam-live-page`, from `main`. **Worktrees:** given in the brief.
**Before W3-11a merges** the orchestrator writes findings 28 and 29 into `tests/REFERENCE_2026.md` (CLAUDE.md: a
measured constant changes with its evidence).

## Why

The app's Steam gate works on 20 ms frames: a frame over -39.5 dBFS RMS is sent with the 6 frames before it and
the 22 after it. W3-09 read Steam's own (`docs/reports/W3-09-steam-voice.md`, sections 1 to 4): it gates
**chunks** of the capture on the mean of |x| (1.0% of full scale) or the peak (15%), keeps 2400 samples of
pre-roll, holds for 0.4 s of its clock, cuts 480-sample frames from each chunk plus what was left of the last,
decodes to 16 bits with libopus's own 16-bit decoder, and resamples each packet by itself.

**One gate.** The render with the source's timeline, the stream (`createRender`), the live chain and the game's
timeline (W3-02c) must send the same frames. So neither part writes a gate: both call
`TF2SteamSender.createSender` (W3-02b).

**Which profiles.** Only `steam`. **`steam_48`** (48 kHz, 64 kbit/s, marked experimental) is not the game's
path: Steam's sender is 24 kHz with 480-sample frames, and the decoder's resampler is 24000 to 44100 Hz. It
keeps today's frame gate, float decode and resampler **bit for bit**, and the page says it is not the game's
path. The CELT and Speex profiles with `opts.gate` on keep `DEFAULT_SENDER_GATE` and `gatePlan` bit for bit.
Wherever this order says "the render", it means a render with the `steam` profile and the codec on.

## W3-11a: the render

### What to build

1. **Loading.** `steam-sender.js` and `vendor/swresample/swresample.js` are loaded wherever `audio.js` runs:
   `index.html`, `audio-worker.js`, `live-worker.js`, `sw.js` (`ASSETS`; raise `CACHE`), and the tests' loaders
   (`tests/verify.js`, `tests/render-stream.verify.mjs`, and any other suite that builds the sandbox).
2. **The pinned Opus module gains the 16-bit decoder.** In libopus's float build the 16-bit `opus_decode` is
   not the float decoder followed by a clip: it runs the library's soft clipper over the decoded frame (with
   memory kept in the decoder), then clamps and rounds each sample to the nearest integer, ties to even. The
   pinned module exports only the float decoder. So, as W3-06 does for CELT:
   - `tests/libopus11/build.mjs`: add `opus_decode` to its list of exports; nothing else changes (the source,
     its commit, the flags). Rebuild; `vendor/libopus-1.1/index.mjs` gains `decodeInt16(packet, { frameSize })`
     and `decodePacketLossInt16(frameSize)` returning an `Int16Array`; `tests/vendor-opus.mjs` and the folder's
     README take the new hash.
   - **The float path must not move.** Before rebuilding, record on main the SHA-256 of the module's packets
     and of its `decodeFloat` output for a seeded 10 s signal (noise bursts and a vowel-like tone, some over
     full scale) and of `decodePacketLossFloat` after every tenth packet; the same hashes must come out of the
     rebuilt module. `tests/opus.verify.mjs`'s check against the native reference build must still pass, and
     the `steam_48` golden hashes (which run this module's float path) must not move.
   - **The 16-bit path is checked against a native build** of the same release (how the folder's README says
     the reference packets were made): on a signal that overshoots full scale, `opus_decode`'s output natively
     and in the module, sample for sample; its hash is recorded in `tests/opus.verify.mjs`. On that signal the
     16-bit output must differ from `clamp-and-round(decodeFloat)` in at least 100 samples (the soft clipper
     did something); on a quiet signal the two must be equal.
   - **Only if the rebuild cannot be reproduced** (the module's bytes change for the old exports' code, or the
     float hashes move): stop and ask. The fall-back the orchestrator may then order is a port of
     `opus_pcm_soft_clip` (about 60 lines, BSD) with its memory per decoder, run on `decodeFloat`'s output.
3. **The profile.** `CODEC_PROFILES.steam.senderGate` becomes `{ rule: 'steam', thresholdDb: -39.5, prerollMs:
   120, holdMs: 440 }`. `rule` is what the render uses. The three numbers stay, with a comment saying what they
   now are: the 20 ms frame model of finding 12, a fit, kept for the tools that line a take up with it
   (`reference.js`, `app/realtake.js`, which read them and are **not changed**: their job is to find a take's
   spurts within a few frames, which the fit does, and `reference.js` scores registered predictions) and for
   the live chain until W3-11b. `steam.encoder.complexity` becomes 9 (Steam sets none, so the library's
   default; W3-09 showed the same packets at 8, 9 and 10 on 19,428 frames; it changes so the code says what
   Steam does). `steam_48` is untouched.
4. **The capture's 16 bits.** After the capture roll-off at 24 kHz each sample becomes `q = max(-32768,
   min(32767, round-half-even(x x 32768)))`. Today nothing rounds there. The sender takes `q`. The encoder is
   given `q / 32768` through the float entry point, which is what the library's own 16-bit `opus_encode` does in
   a float build (it multiplies each sample by 1/32768 and calls the same encoder), so no rebuild is needed for
   the encoder.
5. **The sender.** `createSender({ seed, gate, meanMin })` with the render's seed. `opts.gate` off (or the
   profile's gate switched off) is `gate: false`: every chunk is sent as one spurt, and everything after the
   sender is the same path (so the gate switch never changes the decoder or the resampler; W3-02c relies on
   it). `opts.gateThresholdDb`: `null` or absent is Steam's own numbers exactly; a finite number is the mean of
   |x| in dBFS, `meanMin = 32767 x 10^(dB / 20)` (Steam's own is -40); the peak rule does not move. Until
   W3-11b the page still sends -39.5 from its control: so in this part `app/render.js` (about line 138) sends
   `null` for the `steam` profile when the control holds -39.5, with a comment that W3-11b replaces the line.
6. **The network.** The loss mask is drawn as now, per frame in the sender's frame order through the render,
   in groups of `framesPerPacket` (`net_split`) by frame number, from the render's seed. What it means under
   Steam's decoder:
   - mask 1 (lost): the frame is not decoded. When the next frame **of the same spurt** arrives, the decoder
     first conceals `min(gap, 10)` frames (the 16-bit decoder called with no data), then decodes it; those
     samples are part of the message that revealed the gap. A gap longer than 10 frames plays 10: the sound
     after it comes earlier by the rest. Frames lost at the end of a spurt, with no later frame in it, are not
     played at all.
   - mask 2 (late, finding 9's "one in ten silent"): as now, the decoder does not see the frame and 480 zeros
     stand in its place; it is not a gap and nothing is concealed for it. This is the measured stand-in, not a
     reading; say so in the comment.
   - a DTX frame is decoded like any other; each spurt starts with a fresh encoder and a fresh decoder.
7. **16 bits, then the resampler, once per message.** Each message's decoded samples (an `Int16Array`, its
   concealment included; a silence record as that many zeros) go through one
   `TF2Swresample.createResampler({ kernel })` per render as one `packet()` call (`opts.swrKernel`, for tests
   only, default the module's `DEFAULT_KERNEL`; the page does not offer it).
8. **The source's timeline** (the default). Each spurt's first packet is laid at
   `round((start - lookahead) x 147 / 80)` (`start` from the sender, `lookahead` the codec's delay trimmed
   now), each later packet of the spurt directly after the one before, and what is between spurts is zeros.
   A silence record's output is not laid. Where a spurt's padded end overlaps the next spurt's start (an onset
   in the chunk after a final one), the later packet wins. Samples before 0 or past the render's length are
   dropped. The gain's `decoded` function (W3-05) is true where a packet was laid.
9. **`codecInfo`.** `frameLog` and `frameBytes` stay 20 ms slots on the source's time, **by what was laid**:
   slot `i` takes the code and size of the frame whose laid samples cover the slot's centre (a concealed frame:
   lost; a late one: late), or 0. New: `codecInfo.sender = { rule: 'steam', gate: true or false, meanMin,
   chunks, messages, spurts: [{ start, frames, preroll }] }` and `codecInfo.resampler = { kernel, calls }`.
   `codecInfo.gate` is the threshold in dBFS of the mean (-40 for Steam's own) or `null` with the gate off;
   `prerollFrames` and `holdFrames` are 0. The counters keep their meaning (`gatedFrames`: slots with code 0).
10. **`createRender`** runs the same stages and equals `process()`; say in the report how much it holds back.
11. **`tests/predictions/PREDICTIONS.md`:** one dated paragraph in the style of its last ones (which hashed
    files changed after registration, what moved, that predictions are scored as registered).

### The builder runs

- `pnpm test` passes. `tests/verify.js` gains a section, each check failing when its line is broken (say how).
  Sources are made **at 24 kHz** unless said, so no resampler stands between the test and the gate:
  - **The gate is the sender's:** for a seeded speech-like source, `codecInfo.sender.spurts` deep-equals what
    `createSender` gives on the same rounded 24 kHz samples and seed.
  - **Mean, not RMS** (the old gate fails both): (a) bursts of 2 ms of a 3 kHz sine with a peak of 0.12 full
    scale, one every 40 ms for 3 s: the 20 ms frames holding a burst are at -31 dBFS RMS, yet every chunk's
    mean is under 0.5% and no sample reaches 15%: nothing is sent. (b) a 200 Hz square wave of height 344
    (1.05% of full scale) for 3 s: -39.6 dBFS RMS, under the old threshold, yet its mean is over 1%: it is
    sent.
  - **Finding 5's cases:** a 1 kHz sine with a peak of -36 dBFS is sent; with a peak of -40 dBFS it is not;
    pink noise at -42 dBFS RMS is not.
  - **The peak rule:** 1 ms of samples at 0.2 full scale in silence is sent (a single sample would not survive
    a resampler; at 24 kHz it is 24 samples).
  - **The pre-roll and the hold** (a burst of noise at 0.5 full scale from sample `B` to sample `E` after 2 s
    of noise at -50 dBFS; seeds 1 to 20): `B - spurts[0].start` is between 2400 and 4649 samples (100 ms plus
    what of the onset's chunk lies before the burst; a chunk is at most 2250), and
    `spurts[0].start + 480 x spurts[0].frames - E` is between 9,000 and 13,500 samples (375 to 562 ms: the
    review measured 393 to 545 over random placements).
  - **The gate off:** one spurt, `start` -2400, `codecInfo.sender.gate` false, `codecInfo.resampler.calls`
    equal to `codecInfo.sender.messages`.
  - **16 bits:** a source that drives the decoder past full scale: the samples handed to the resampler (through
    a test hook, `opts.onDecoded`, that receives each message's `Int16Array`) equal the module's
    `decodeInt16` frame for frame, and differ from clamp-and-round of `decodeFloat` in at least one sample.
  - **The cap:** a hand-made mask that loses 15 frames in a row inside a spurt (through the existing
    `makeLossMask` hook) gives exactly 10 lost slots in `frameLog`, at the gap's first 10 slots, and the sound
    after the gap is 100 ms earlier than with 10 lost; with 5 lost, 5 slots and nothing moves.
  - **A late frame:** a mask with one 2 gives 480 zeros at its place in `onDecoded`'s samples and no
    concealment.
  - **Once per message:** `codecInfo.resampler.calls` equals the sender's messages (sound and silence records).
  - **`createRender` equals `process()`** on every `steam` case of `tests/render-stream.verify.mjs`, at chunk
    sizes 7, 960, 12,345 and the whole source: samples, WAV bytes, `codecInfo` deep-equal.
  - The same seed gives the same samples; another seed moves at least one spurt's `start` or one message's
    tick; `opts.swrKernel: 'c'` changes at least one sample and at most 1 in 500.
  - Complexity 9 and 10 give identical packets on the suite's signals.
- **Golden hashes:** `steam_48`, the CELT cases, the Speex cases and every case with the codec bypassed do not
  move (shown first). Then every `steam` case with the codec on, gate on or off, is re-recorded in one commit of
  its own that says why.
- `node tests/steam-exact.mjs --synthetic` (the private tool below, on a recording it makes itself with the
  app's chain from a seeded clip at an arbitrary start): 0 differing samples, and the start found.
- The browser suite passes (the scripts load on the page and in both workers; offline; a render).
- CI passes on the pushed branch.
- The report gives, for the app's demo speech at seeds 1, 2 and 3: spurts, messages, the shares of 1, 2, 3 and
  4-frame messages, each spurt's start and end against the old gate's (from main), and how many decoded
  samples the soft clipper changed.

### The orchestrator runs privately

- **The accuracy suite**, under the heavy lock, before and after on the same main:
  `node tests/accuracy.mjs --takes <takes folder> --json <scratch>/after.json`. The expected numbers are not
  known: **the orchestrator records them on this first run.** Acceptable, with the reasons: level and band
  figures within 0.2 dB of before below 10 kHz (the gate moves edges, not levels); the bands from 10.5 to
  13.5 kHz may move by up to 1.5 dB (the resampler's roll-off and images) and should move toward the takes;
  each take's spurt count within 1 of the take's own; the speech take's silences longer than before by 20 to
  80 ms (W3-01 found the old gate 50 ms short). A band below 10 kHz worse by more than 0.2 dB, or a spurt count
  further from the take's than before, holds the merge.
- **Set D's demo** (a scratch script of the orchestrator's): the demo's decoded sound as a 24 kHz file through
  the render: the model's spurts start within one chunk (62.5 ms) of the demo's in at least 17 of 20 and end
  within two chunks in at least 16.
- **The file-input recording, if it exists** (Steam's `mic_inputfile` with a known 24 kHz clip; the game's
  `voice_recordtofile 1` at `voice_maxgain 1`). Two commands:
  1. `node tests/swresample/from-recording.mjs <recording.wav> --out <scratch>/decoded24k.raw` (W3-13): the
     kernel, and the 24 kHz 16-bit samples Steam's decoder produced.
  2. `node tests/steam-exact.mjs --clip <the 24 kHz clip.wav> --decoded <scratch>/decoded24k.raw`. The tool
     (the builder writes it) splits the decoded samples into spurts at runs of zeros of 750 samples or more;
     for each spurt finds where the clip, looped, lies under it (correlation, then every start within 480
     samples of the peak); encodes the clip from that start in 480-sample frames with a fresh `steam` encoder
     and decodes with the 16-bit decoder; and prints per spurt the start it chose, the samples that differ and
     the largest difference, twice: with the 16-bit decoder, and with clamp-and-round of the float decoder.
     It prints nothing else of the recording.
     **A match** is 0 differing samples in every spurt after the first frame of each. That proves at once that
     the app's encoder gives Steam's packets and that the decoder's 16-bit step is right; and if the two
     decoders' columns differ anywhere, which of them Steam runs. Fewer than 1 sample in 1,000 differing, by 1:
     the packets are Steam's and the last bit is the compiler's; record it in finding 16. More: the encoder's
     input or the release differs; the tool then prints the level of the difference in dB per spurt, and the
     orchestrator opens an order for the stronger model. A spurt's first 100 ms is pre-roll: with a file it is
     the clip's earlier samples or zeros, and the tool tries both.
  If the recording does not exist, nothing here is run, and the README and finding 28 keep "not checked
  against Steam sample for sample".

### Files

May touch: `audio.js` (`process()` and `createRender`: the `steam` path; not `createLiveChain`),
`opus-codec.mjs` (a `steam` round trip and stream that take the sender's messages; `gatePlan` and the frame
gate stay for the other callers), `constants.js` (the `steam` profile and the header comment),
`tests/libopus11/build.mjs`, `vendor/libopus-1.1/` (the module, `index.mjs`, its README),
`tests/vendor-opus.mjs`, `index.html` (the script tags), `audio-worker.js`, `live-worker.js`, `sw.js`,
`app/render.js` (the one line of point 5), `tests/verify.js`, `tests/render-stream.verify.mjs`,
`tests/opus.verify.mjs`, `tests/browser.verify.js` (only what the new scripts need),
`tests/predictions/PREDICTIONS.md`. May add: `tests/steam-exact.mjs`. May not touch: `steam-sender.js`,
`voice-channel.js`, `vendor/swresample/`, the other `vendor/` folders, `demo.js`, `reference.js`,
`app/realtake.js`, `tests/speex*.verify.mjs`, `tests/accuracy.mjs`, `tests/REFERENCE_2026.md`,
`tests/predictions/predictions.json`, `docs/PROGRESS.json`.

### Stop and ask

- If `steam-sender.js` or `swresample.js` needs a change (say what and why).
- If the rebuilt Opus module's float hashes move, or its 16-bit decoder differs from the native build's.
- If `createRender` cannot equal `process()` with the per-message path.
- If a golden hash moves for `steam_48`, CELT, Speex or a bypassed case.

## W3-11b: the live chain, the threshold control, the words

### What to build

1. **The live chain** (`createLiveChain`, `steam` profile) uses `createSender`, fed as the microphone's blocks
   arrive, in place of its frame queue; its reported latency becomes the pre-roll (100 ms) plus one chunk.
   Low-latency mode keeps no pre-roll as now: say in the report how (the sender's `past` kept empty is the
   plain way; if that needs an option in `steam-sender.js`, stop and ask). The live chain keeps the float
   decode and its own 24 to 44.1 kHz step (the per-packet resampler and the 16-bit step are for renders; say
   so in the comment). `steam_48` and the engine codecs keep the frame queue.
2. **The threshold control** (`#vad_threshold`, `voice_vad_threshold`). **An untouched control must give
   Steam's gate exactly.** So:
   - The control's meaning depends on the profile, and its help and title say so: for `steam`, "the mean of
     |x| over a capture chunk, in dBFS; Steam's own is -40 (1% of full scale); a sine opens at -39.1 dBFS RMS";
     for the others, "20 ms frame RMS in dBFS (-39.5)".
   - Its default is the profile's own: -40 for `steam`, -39.5 for the others. When the codec changes and the
     control holds the old profile's default, it takes the new one's.
   - `app/render.js` sends `gateThresholdDb: null` when the control holds the profile's default, and the number
     otherwise (this replaces W3-11a's line). So Steam's 327.67 is never recomputed from a typed -40.
   - A saved setting of -39.5 with the `steam` profile reads as the default (-40).
   - Every place that carries the old default, to change or to check: `index.html` (the input's `value`,
     about line 143), `app/render.js` (about line 138), `app/console.js` (the help at about line 303, the read
     at 476, the reset command at 541), `app/core.js` (the saved-settings fields and the presets, if they name
     it), `README.md` (the gate paragraph near line 58 and the settings table), `tests/browser.verify.js`
     (about line 1137 expects `-39.5`). Not changed: `audio.js`'s `DEFAULT_SENDER_GATE`, `app/realtake.js`,
     `reference.js`, `tests/retiming.mjs`, `tests/speex.verify.mjs`, `tests/LEGACY_CODECS.md`,
     `tests/predictions/` (they are the frame model, which the other profiles and the take tools keep).
3. **The words.** The chain strip's Gate cell and the console's lines for `steam`: "chunks · 100 ms kept ·
   0.4 s hold" in place of the frame counts. `steam_48`'s label and README row gain "not the game's path: the
   20 ms frame gate and the app's own resampler". README's gate paragraph, settings table and "Files and
   licensing" (the Opus module's new hash if it is quoted) are brought up to date; the limits say that the
   packets' clock is a model.
4. `sw.js`: raise `CACHE`. `tests/predictions/PREDICTIONS.md`: a dated note (`audio.js` changed again).

### The builder runs

- `tests/verify.js`: the live chain's checks, each failing when broken (say how): fed the same 24 kHz sound in
  blocks of 128, 480 and 4,096 samples, the live chain's sent frames are the frames `createSender` gives for
  that sound and seed; a quiet tail is cut after the hold; low-latency mode sends no pre-roll; `steam_48`'s
  live output is bit for bit main's.
- The browser suite, each new check failing when broken: a fresh page shows -40 and a render's
  `codecInfo.sender.meanMin` is exactly 327.67; switching to a CELT profile shows -39.5 and back shows -40;
  typing -46 gives `meanMin` of `32767 x 10^(-46/20)`; a saved -39.5 under `steam` restores as -40; the reset
  command restores the profile's default; the Gate cell's text; `steam_48`'s label.
- `pnpm test` passes; **no golden hash moves** (the render does not change in this part). CI passes.
- Screenshots (desktop and phone) of the control and the chain strip, in the report.

There is nothing private to run.

### Files

May touch: `audio.js` (`createLiveChain` only), `live.js` and `live-worker.js` (only what the live chain's new
latency figure needs), `index.html`, `app/console.js`, `app/core.js`, `app/render.js`, `README.md`, `sw.js`,
`tests/verify.js`, `tests/browser.verify.js`, `tests/predictions/PREDICTIONS.md`. May not touch: everything
W3-11a may not, and `opus-codec.mjs`, `constants.js` (but `steam_48`'s `displayName`), `vendor/`.

### Stop and ask

- If the live chain cannot use `createSender` without a change to `steam-sender.js`.
- If a golden hash moves.

## Not in this order

The game's timeline (W3-02c). The key: the 0.5 s tail and the empty packet belong to push-to-talk in the live
chain and are left for a later order. Steam's `voice_preprocess`. The capture roll-off, which W3-09 found to be
Windows's resampler and stays as measured. A 48 kHz sender for `steam_48`. Loss that falls on whole messages
(`docs/reports/W3-11-plan.md`, "Open").
