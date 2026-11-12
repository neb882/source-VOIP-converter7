# W3-11: the `steam` profile sends and decodes as Steam does

> **Status 2026-11-12, by part:**
> - W3-11a: **built and merged** at `603d3d9` (cache v24, pull request #16); report `docs/reports/W3-11a-steam-render.md`.
> - W3-11b: **built and merged** at `f03e431` (cache v26, pull request #20); report `docs/reports/W3-11b-live-chain.md`.
> - W3-11c: **held** on the owner's microphone run (`docs/owner-runs.md`), then a planner's spec.
> - The plan: `docs/reports/W3-11-plan.md` (`56b927f`).

*Rewritten 2026-11-10 after the plan's review (findings 7 to 18 and its note on size;
`docs/reports/W3-11-plan.md`, "The review"): split in two; for the `steam` profile only; the 16-bit decode is
the library's own; the gate off is a sender setting; the checks that a correct build would have failed are
replaced. Revised again the same day after the second read (its findings 5 to 10): the Opus rebuild's steps
are spelled out; the tool for the owner's file-input recording and its private check are gone from this order
(that question is `docs/work-orders/W3-14-steam-file-input.md`, an investigation; nothing here waits for it).*

| Part | What | Starts after | Budget |
| --- | --- | --- | --- |
| **W3-11a** | the render and `createRender`: the sender, the decoder's rules, 16 bits, the resampler, `codecInfo`, the golden hashes | **built and merged 2026-11-10** (`docs/reports/W3-11a-steam-render.md`); its section below is left as it was built from | 2 days |
| **W3-11b** | the live chain on the render's own stages, with the key held; the app's stand-in for push-to-talk; the threshold control and its default; the page's texts, README | **built and merged 2026-11-10** (`f03e431`, cache v26; `docs/reports/W3-11b-live-chain.md`) | 1 day |
| **W3-11c** | the key as Steam has it: the two tails, a press's resets, the empty packet, messages made and not collected | **held**: the owner's microphone run (`docs/owner-runs.md`), then a planner's spec of five points against it; W3-17d is merged | to be set then |

**The order of work since 2026-11-10** (`docs/PROGRESS.json`, decisions; `docs/reports/W3-plan-maintenance-2.md`
and its addendum): W3-16, then W3-11b, then W3-10, W3-17c and W3-17d, then W3-11c and W3-02c to W3-02g.
**Part b was rewritten that day, reviewed, revised and cut in two: b is the path, c is the key.** **Kind:**
code. `tf-builder` (effort xhigh), then `tf-reviewer`, then a second reader on the stronger model (part a: it
changes how a render is computed; parts b and c: they decide what the live monitor computes). **Branches:**
`claude/w3-11a-steam-render`, `claude/w3-11b-steam-live-page`, from `main`. **Worktrees:** given in the brief.
*Maintenance, 2026-11-10 (`docs/reports/W3-plan-maintenance.md`): brought up to date with what the builds of
W3-02b, W3-05 and W3-13 learnt (the sender's messages as built, the gain fed only decoded samples and its
settings read at a reset, a resampler that lives as long as the speaker's decoder, the footer's credit).
**Void: W3-13 merged 2026-11-10 (`7327327`).** **W3-13 is built and reviewed but its merge waits for the owner's word on its licence. W3-11a may be built
meanwhile on a branch that has merged `origin/claude/w3-13-steam-resampler` in; it is merged to main only after
W3-13 is.** It uses nothing of the module but `createResampler().packet()`, so if the owner's answer changes how
the resampler is shipped, this order's code stands and only its golden hashes may move.*

**Before W3-11a merges** the orchestrator writes findings 28 and 29 into `tests/REFERENCE_2026.md` (done; CLAUDE.md: a
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

1. **Loading, and the credit.** This is the order that first loads the resampler on the page, so the page's
   footer, where it credits LAME, gains FFmpeg's libswresample in the same way (LGPL; a link to
   `vendor/swresample/COPYING.LGPLv2.1`; "translated to JavaScript, modified"): the licence asks that a work
   which shows notices while it runs shows the library's too. `steam-sender.js` and
   `vendor/swresample/swresample.js` are loaded wherever `audio.js` runs:
   `index.html`, `audio-worker.js`, `live-worker.js`, `sw.js` (`ASSETS`; raise `CACHE`), and the tests' loaders
   (`tests/verify.js`, `tests/render-stream.verify.mjs`, and any other suite that builds the sandbox).
2. **The pinned Opus module gains the 16-bit decoder.** In libopus's float build the 16-bit `opus_decode` is
   not the float decoder followed by a clip: it runs the library's soft clipper over the decoded frame (with
   memory kept in the decoder), then clamps and rounds each sample to the nearest integer, ties to even. The
   pinned module exports only the float decoder. So, as W3-06 does for CELT:
   - **First reproduce what is recorded.** Run `tests/libopus11/build.mjs` **with its export list as it is**
     and get the module whose SHA-256 `tests/vendor-opus.mjs` records (`b7a03edb...`, built with Ubuntu clang
     18.1.3, which the build machine has). The script clones from `github.com`, which the build machine cannot
     reach: give it a checkout of `https://gitlab.xiph.org/xiph/opus.git` at the script's pinned commit (the
     script takes the checkout's path as its first argument and refuses a checkout whose commit is not the
     pinned one). **If the recorded hash does not come out,
     stop**: nothing about the new build could then be trusted. (Comparing bytes after the change proves
     nothing: a new export renumbers the module's functions.)
   - **Then** add `opus_decode` to the list of exports; nothing else changes (the source, its commit, the
     flags). Rebuild; `vendor/libopus-1.1/index.mjs` gains `decodeInt16(packet, { frameSize })`
     and `decodePacketLossInt16(frameSize)` returning an `Int16Array`; `tests/vendor-opus.mjs` and the folder's
     README take the new hash.
   - **The float path must not move.** Before rebuilding, record on main the SHA-256 of the module's packets
     and of its `decodeFloat` output for a seeded 10 s signal (noise bursts and a vowel-like tone, some over
     full scale) and of `decodePacketLossFloat` after every tenth packet; the same hashes must come out of the
     rebuilt module. `tests/opus.verify.mjs`'s check against the native reference build must still pass, and
     the `steam_48` golden hashes (which run this module's float path) must not move.
   - **The 16-bit path is checked against a native build** of the same checkout, by a new one-off script,
     `tests/libopus11/native.mjs` (not in CI; in the manner of `tests/speex/native.mjs`): gcc, the source list
     of `build.mjs`, `-DOPUS_BUILD -DVAR_ARRAYS -DHAVE_LRINTF -ffp-contract=off`. On a signal that overshoots full scale, `opus_decode`'s output natively
     and in the module, sample for sample; its hash is recorded in `tests/opus.verify.mjs`. On that signal the
     16-bit output must differ from `clamp-and-round(decodeFloat)` in at least 100 samples (the soft clipper
     did something); on a quiet signal the two must be equal.
   - **If the first step's hash does not come out, or the float hashes move:** stop and ask. The fall-back the orchestrator may then order is a port of
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
   **The sender as built** (W3-02b's report, "For W3-11a's builder"): `push(Int16Array)` on the rounded
   24 kHz sound, then `finish()`. A sound message is `{ tick, spurt, first, last, start, end, pcm }`: **`pcm`
   is what to encode**, 480 samples a frame, an end message's last frame already padded; frame numbers run
   through the whole render; `start` can be as low as -2400 (the frames there are zeros). **An end message
   may hold no frame at all** (`last = first - 1`, an empty `pcm`: the gate off, when the source ends on a
   frame's edge): nothing is encoded or decoded for it, it is not given to the resampler, and the encoder and
   decoder are reset after it as after any end. A silence record is `{ tick, silence }` in 24 kHz samples,
   with no `spurt`. "No number at the default" means passing no `meanMin`; one at or below 0, or not finite,
   is refused. A clock given by hand must step by 1 to 6.
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
7. **16 bits, then the resampler, once per message.** Each message's decoded samples (an `Int16Array`, all
   its frames together, its concealment included; a silence record as `new Int16Array(n)`) go through the
   render's resampler as one `packet()` call. Messages are not split or joined: the counts depend on the cut.
   A message with no samples makes no call.
   - **One resampler for the whole render**, made with `TF2Swresample.createResampler()` and no kernel, so the
     module's `DEFAULT_KERNEL` stays the one switch (`opts.swrKernel`, for tests only, passes one; the page
     does not offer it). In Steam the resampler lives as long as the speaker's decoder object: **an end marker
     or a sequence number that falls resets the Opus decoder only, never the resampler**, and neither does the
     game assigning the speaker a new channel or a reconnect (finding 29; W3-13's report: Set G's 2,372 packet
     counts come out only as one stream). So the first packet of the render flushes, everything after is 16
     input samples late, and no spurt after the first starts a new stream.
   - **`opts.onResampled(Int16Array)`**, a test hook beside `opts.onDecoded`: it receives each `packet()`
     result, in order, the silence records' included.
   - **Speed.** With the exact fused step the default kernel makes 4.8 to 5.4 million output samples a second
     under Node on the build machine (the others 10 to 13 million): about 15 s more for a 30-minute render
     (W3-13's report). The report gives the `steam` render's time for 60 s of sound before and after this
     order. If the whole render is more than a quarter slower than main's, say where the time goes; do not
     change the module.
8. **The source's timeline** (the default). Each spurt's first packet is laid at
   `round((start - lookahead) x 147 / 80)` (`start` from the sender, `lookahead` the codec's delay trimmed
   now), each later packet of the spurt directly after the one before, and what is between spurts is zeros.
   A silence record's output is not laid. Where a spurt's padded end overlaps the next spurt's start (an onset
   in the chunk after a final one), the later packet wins. Samples before 0 or past the render's length are
   dropped.
   **The gain on the source's timeline is fed the decoded samples and nothing else**, as the engine's is:
   - the packets go through one gain (`TF2Audio.createGain`, reset once, at the render's start: there is no
     channel on this timeline to assign) in the sender's order, each as its `Int16Array` divided by 32768, so
     every value is a 16-bit value; what comes back is laid where the packet is laid;
   - **a silence record's samples are decoded zeros:** they go through the gain (and send it to its cap, as in
     the game), though they are not laid;
   - **a late frame's samples are not decoded:** they are left out of what the gain is given (frame `j` of
     `F` in a packet of `n` output samples is samples `round(j n / F)` up to `round((j + 1) n / F)`) and are
     laid as they are. **That span is approximate, and is meant to be:** after the first packet the
     resampler's output is 16 input samples (about 29 outputs) late, and its 32 taps spread a frame over 16
     inputs each side, so a little of the neighbours' sound lies in the span ungained and a little of the
     zeros outside it. It is a stand-in for a stand-in; do not refine it. Today a late frame counts as decoded
     zeros and sends the gain toward its cap; in the game no decoder made them;
   - the zeros between spurts are never given to the gain, so nothing is "held": the gain's blocks of 128 run
     over the decoded samples end to end, across packets and across spurts.

   This replaces, for `steam`, W3-05's `decoded` function and its hold of a block whose first sample was not
   decoded, which froze the gain one step past where the ramp had reached and cut the blocks on the source's
   grid, not on the decoded samples'. The other profiles keep W3-05's path bit for bit. A sample laid before 0
   or past the end, or overwritten by a later packet, has still been through the gain.
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
  - **Mean, not RMS** (main's gate sends (a); (b) sits 0.08 dB under main's threshold, so it shows the rule and
    need not fail on main): (a) bursts of 2 ms of a 3 kHz sine with a peak of 0.12 full
    scale, one every 40 ms for 3 s: the 20 ms frames holding a burst are at -31 dBFS RMS, yet every chunk's
    mean is about 0.5%, under 1%, and no sample reaches 15%: nothing is sent. (b) a 200 Hz square wave of height 344
    (1.05% of full scale) for 3 s: -39.6 dBFS RMS, under the old threshold, yet its mean is over 1%: it is
    sent.
  - **Finding 5's cases:** a 1 kHz sine with a peak of -35.8 dBFS is sent (at -36 the lowest chunk's mean
    is 327.91 against 327.67 after the capture filter: it passes, by 0.07%, and any change to the filter would
    break the test for no reason); with a peak of -40 dBFS it is not;
    pink noise at -42 dBFS RMS is not.
  - **The peak rule:** 1 ms of samples at 0.2 full scale in silence is sent (a single sample would not survive
    a resampler; at 24 kHz it is 24 samples).
  - **The pre-roll and the hold** (a burst of a 1 kHz square wave at 0.5 full scale, so every sample of it passes
    the peak rule, from sample `B` to sample `E`, after 2 s of noise at -50 dBFS; seeds 1 to 20): `B - spurts[0].start` is between 2400 and 4649 samples (100 ms plus
    what of the onset's chunk lies before the burst; a chunk is at most 2250), and
    `spurts[0].start + 480 x spurts[0].frames - E` is between 9,000 and 13,500 samples (375 to 562 ms: the
    review measured 393 to 545 over random placements).
  - **The gate off:** one spurt, `start` -2400, `codecInfo.sender.gate` false, `codecInfo.resampler.calls`
    equal to the sender's messages that hold samples (see "Once per message").
  - **16 bits:** a source that drives the decoder past full scale: the samples handed to the resampler (through
    a test hook, `opts.onDecoded`, that receives each message's `Int16Array`) equal the module's
    `decodeInt16` frame for frame, and differ from clamp-and-round of `decodeFloat` in at least one sample.
  - **The cap:** a hand-made mask that loses 15 frames in a row inside a spurt (through the existing
    `makeLossMask` hook) gives exactly 10 lost slots in `frameLog`, at the gap's first 10 slots, and the sound
    after the gap is 100 ms earlier than with 10 lost; with 5 lost, 5 slots and nothing moves.
  - **A late frame:** a mask with one 2 gives 480 zeros at its place in `onDecoded`'s samples and no
    concealment.
  - **Once per message:** `codecInfo.resampler.calls` equals the sender's messages that hold samples (sound
    messages with at least one frame, and silence records); with the gate off, a source of exactly 96,000
    samples and **the seed `0xC0FFEE`** (the clock's last frame then lands on sample 96,000, 2400 + 96,000 is
    a whole number of frames, and the end message has no frame) the count is one less than the messages. On
    another seed the end message may hold frames (seeds 1, 7, 8 and 9 give it 2): the test asserts first, with
    `createSender`, that its seed's end message is empty.
  - **One resampler, never reset:** on a source with three spurts, the resampler's outputs (through
    `onResampled`) equal one `createResampler()` fed the same `onDecoded` arrays in order; with a `reset()`
    put at each end marker the check fails.
  - **The gain sees decoded samples only** (`agc` on, `volume` 1, a 24 kHz source of two bursts 2 s apart with
    noise at -50 dBFS between): the render's stage-4 output (through a hook, `opts.onGain`, the laid samples
    after the gain) equals a fresh `TF2Audio.createGain` given every `onResampled` array in order, the silence
    record's included, each divided by 32768, and laid as point 8 lays them. It differs from main's rule
    (`receiverAutoGain` with W3-05's `decoded` function on the same laid signal) in at least one of the first
    128 samples after the second burst's onset. (Why: not the cap, which both rules reach in the first spurt's
    tail and again in the second's pre-roll, but where the blocks of 128 fall: here they run over the decoded
    samples end to end, the silence record's 2,756 or 2,757 among them, and in main's rule on the source's
    grid.) With one late frame in the mask, the gain's state after that message equals
    its state with the frame's samples left out.
  - **`createRender` equals `process()`** on every `steam` case of `tests/render-stream.verify.mjs`, at chunk
    sizes 7, 960, 12,345 and the whole source: samples, WAV bytes, `codecInfo` deep-equal.
  - The same seed gives the same samples; another seed moves at least one spurt's `start` or one message's
    tick; on a loud source (peaks above -6 dBFS)
    `opts.swrKernel: 'c'` changes at least one sample and at most 1 in 500 **of the resampler's output**,
    counted through a hook beside `onDecoded` (`opts.onResampled`, each message's `Int16Array`), not in the
    render, where the gain and the output stage spread one changed sample over several. On a quiet source the
    kernels can agree everywhere, so no difference is asked for there.
  - Complexity 9 and 10 give identical packets on the suite's signals.
- **Golden hashes:** `steam_48`, the CELT cases, the Speex cases and every case with the codec bypassed do not
  move (shown first). Then every `steam` case with the codec on, gate on or off, is re-recorded in one commit of
  its own that says why.
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
  within two chunks in at least 16. (If the script drives `createSender` with a clock made from the demo's own
  chunk lengths: `n` is twice the running count of 750-sample steps, and a step of more than 6 is refused, so a
  longer read after a hitch is split into steps of at most 6.)
- Whether the app's encoder gives Steam's packets and whether the 16-bit step is Steam's are not checked here:
  that is W3-14, when the owner's file-input recording exists. Until then the README and finding 28 keep "not
  checked against Steam sample for sample".

### Files

May touch: `audio.js` (`process()` and `createRender`: the `steam` path; not `createLiveChain`),
`opus-codec.mjs` (a `steam` round trip and stream that take the sender's messages; `gatePlan` and the frame
gate stay for the other callers), `constants.js` (the `steam` profile and the header comment; and
`VOICE_ENGINE.autoGain.blockSize`, which nothing has read since W3-05: remove it with its stale comment, and
the mention of it beside `GAIN_BLOCK` in `audio.js`; `tests/verify.js` builds its own object and is not
affected),
`tests/libopus11/build.mjs`, `vendor/libopus-1.1/` (the module, `index.mjs`, its README),
`tests/vendor-opus.mjs`, `index.html` (the script tags and the footer's credit), `audio-worker.js`, `live-worker.js`, `sw.js`,
`app/render.js` (the one line of point 5), `tests/verify.js`, `tests/render-stream.verify.mjs`,
`tests/opus.verify.mjs`, `tests/browser.verify.js` (only what the new scripts need),
`tests/predictions/PREDICTIONS.md`. May add: `tests/libopus11/native.mjs` (and a small C file beside it). May
not touch: `steam-sender.js`,
`voice-channel.js`, `vendor/swresample/`, the other `vendor/` folders, `demo.js`, `reference.js`,
`app/realtake.js`, `tests/speex*.verify.mjs`, `tests/accuracy.mjs`, `tests/REFERENCE_2026.md`,
`tests/predictions/predictions.json`, `docs/PROGRESS.json`.

### Stop and ask

- If `steam-sender.js` or `swresample.js` needs a change (say what and why).
- If the rebuilt Opus module's float hashes move, or its 16-bit decoder differs from the native build's.
- If `createRender` cannot equal `process()` with the per-message path.
- If a golden hash moves for `steam_48`, CELT, Speex or a bypassed case.

## W3-11b: the live chain on the render's own stages

*Rewritten 2026-11-10 (`docs/reports/W3-plan-maintenance-2.md`), then revised and cut in two the same day
after its plan review, then tightened after the reviewer's short read of the two new mechanisms (what is
given out, and a late packet moved: where `given` starts and that it is exclusive, which packet is cut and
which moved, the 30-lost check as an exact equality, more block plans, a unit check of the wait). The
plan review had 7 must-fix, 12 should-fix and 15 notes; what was done about each is in that report's
addendum. **This part is the path: the live chain runs the render's stages, with the key held from the
chain's start to its stop.** The key's own rules are W3-11c, below, which is not to be built yet. Against the
first version of the day: the float decode and the app's resampler leave the live chain; the sender's
interface is W3-16's; a check that did not fit the code is gone. What the first version said of the threshold
control and the words stands and is carried over.*

**Starts after:** W3-16 merged. **It takes the sender as W3-16 merges it and names no constant of its clock**:
W3-16 is still in review, and a later order may change how the capture's steps fall. Wherever a figure below
comes from the sender (a reach, a latency), it is computed from `STEAM_SENDER` as the render computes it,
never typed. No other `audio.js` order open. **Before:** W3-10. **Budget:** 1 day.
**Agents:** `tf-builder` at effort xhigh, then `tf-reviewer`, then a second reader on the stronger model (it
decides what the live monitor computes). **Branch:** `claude/w3-11b-steam-live-page`, from `main` after
W3-16's merge.

**Read first:** `docs/reports/W3-11a-steam-render.md` ("What was built", "Readings of the order", "For W3-11b's
builder"); W3-16's report, `docs/reports/W3-16-sender-hold-clock.md` ("The sender", "For W3-11b's builder");
`createRender`'s `steam` stage in `audio.js` (the stage that pushes to the sender and takes from
`steamTimeline`): this part is that stage, fed without an end.

### Decisions of this part

1. **One path.** For the `steam` profile with the codec on, the live chain runs the render's own stages, fed
   as the microphone's blocks arrive: the 16-bit capture, Steam's sender with the seeded clock and the
   `uptime` setting, `createSteamStream` (the library's 16-bit decoder under Steam's rules), one
   `TF2Swresample` resampler fed whole messages, the gain fed the decoded packets, the packets laid on the
   source's timeline. **What the live chain hands its mix stage is, sample for sample, what `createRender`
   hands its own** for the same sound, seed and settings. Why: the render's decode path is Steam's in 524,286
   of 524,288 samples on Set J (W3-14's own pipeline, and W3-11a's second reader's run of the render itself),
   so a second, float path in the live chain is now the one place the app's `steam` differs from Steam for no
   reason; and W3-11a's browser check 3f had to measure the lag between the two paths instead of proving
   them equal. **The proof is in Node** (`tests/verify.js` [10b]); the browser checks words and wiring.
2. **The clock is the model's, on the samples.** In Steam a microphone's chunk needs no clock: it is what the
   capture cursor gained since the last read (W3-16's read, section 1d); the clock only times the hold. The
   browser gives neither Steam's reads nor Steam's capture: the page's worklet gathers the context's quanta
   into blocks of a fiftieth of a second at the context's rate and posts them to the worker, which gets them
   when the browser schedules it, several at once after a stall. Taken as reads, those arrivals would make
   every chunk one block long (a 20 ms gate, which Steam's is not), and the same recording would gate
   differently on each run, which the project's rule on determinism forbids. So **the live chain counts time
   in the 24 kHz samples it has pushed to the sender**, and the sender's seeded clock draws the reads on that
   time exactly as in a render. The wall clock is not read anywhere.
3. **The key is held from the chain's start to its stop.** With push-to-talk off (the page's default) that
   is what the chain models: the render's model, and what holding `+voicerecord` gives. What TF2's own
   open-microphone mode (`voice_vox`) does was not read; the README says so in one sentence.
   **With push-to-talk on, until W3-11c, the app uses a stand-in of its own:** while the key is up the
   microphone's block is replaced by zeros at the chain's input. The clock and every position run on; the
   gate closes an open spurt by its own hold; a spurt after the next press takes its pre-roll from what was
   pushed, which is zeros for as long as the key was up. So nothing captured with the key up is ever sent.
   (One corner: after a key-up shorter than the pre-roll, the pre-roll reaches back across the zeros into
   quiet sound from the hold before. README's "audio from before the key goes down is never sent" is
   re-worded to "sound captured while the key is up is never sent", which is true by construction.) It is
   **not** Steam's key: Steam goes on sending for half a second after a release, resets its encoder at a
   press and can send an empty packet. The page says in plain words that this is the app's stand-in.
   Nothing in this part claims a release tail.
4. **`null`, `undefined` and `''` mean the same threshold everywhere:** the profile's own.
5. **The uptime setting is the render's.** W3-16 put "Sender's Steam has been running" on the page, sent as
   `steamUptime` in `renderOptions()`. The live monitor's options are `renderOptions()` plus `lowLatency`
   (`live.js`), so the value already reaches the worker, and `steamSenderOptions` passes it to the sender
   (the review confirmed both on W3-16's branch). No second control.
6. **`steam_48`, the CELT and Speex profiles, and `steam` with the codec bypassed keep the frame queue**,
   bit for bit but for "What to build", item 4's reading of an absent threshold.
7. **`steam-sender.js` and `opus-codec.mjs` are not touched.** With the key held, the sender and the stream
   as they are on main after W3-16 are all this part needs.

### What to build

1. **The live chain** (`createLiveChain`, `steam`, codec on), from the render's own functions
   (`steamCapture`, `steamSenderOptions`, `steamReach`, `steamTimeline`, `createSteamStream`):
   - **Capture.** As now up to the capture roll-off (mic gain, the clip, `streamResampleSinc` to 24 kHz, the
     optional filters, the roll-off as a causal FIR), **with each causal FIR's delay dropped from the front
     of its output**, as `firStage` drops it in `createRender`: the sender must be given the samples a render
     gives it, at the same positions, or its clock cuts other chunks. Then `q = steamCapture(x)`.
   - **The sender**: `createSender(steamSenderOptions(opts, gateOn, seed).sender)` with the chain's seed
     (`opts.seed`, default `0xC0FFEE`, as the render's) and `opts.steamUptime`. The gate off is the sender's
     `gate: false`.
   - **The network**: `streamLossMask`, one draw per frame by the sender's frame number, as `createRender`
     draws it.
   - **The codec and the receiver**: each message through `createSteamStream().message(msg, miss)` and
     `steamTimeline().add(...)`, as `createRender` calls them: one resampler for the chain, one gain reset
     once when the chain is made, a silence record's zeros through both, a late frame's span left out of the
     gain. With `agc` off the laid signal is scaled and clipped as the render's stage 4 does.
   - **What `steamTimeline` needs for a chain with no end, and nothing more:** a frame log that grows (its
     slot count comes from `codecLength` today); a `voiceLength` with no end; and a way to lay that drops
     and counts in place of throwing (below). A render keeps the fixed log and the throwing `lay()`, and no
     render's samples or `codecInfo` change: the golden hashes are the proof.
   - **What is given out, defined per pushed sample**, so that the output is the same for any block plan.
     **`given` is the number of voice-rate samples given out: it starts at 0 and is exclusive** (the samples
     given out are indexes 0 to `given - 1`, as `take(end)` counts them). For each 24 kHz sample pushed, in
     order: **first** the messages the sender returns for it are handled (laid, against `given` as it stood
     before this sample); **then**
     `given` becomes `max(given, bound(P, C))`, where `P` is the samples pushed so far, `C` the timeline's
     cursor (where the open spurt's next packet will be laid; none when no spurt is open) and

     ```
     R = floor((P - reach - lookahead) x 147 / 80) - 1        # the render's own expression: share one function
     W = 10 frames at the voice rate                           # the decoder's cap on a concealed gap
     bound = min(R, max(C, R - W))                             # R when no spurt is open
     ```

     `reach` is `steamReach(STEAM_SENDER)`: the longest chunk and the pre-roll. `R` is negative until `P`
     passes the reach and the lookahead, so nothing is given out at first. A call to `process()` returns the
     samples from index the old `given` up to, not including, the new one. Pushing the sender one sample at
     a time is the plain way and is cheap; any batching must give the same output, and the block-plan checks
     below prove it. **The chain has no flush:** what is held back when the monitor stops (the reach, and
     any wait for the cursor) is never given out.
     - `createRender` gives out up to `min(R, C)`: it can wait for the cursor without limit. The live chain
       waits for it **at most ten frames**: while frames are being lost nothing is decoded and the cursor
       stands still, and without the wait concealment would land on samples already given out after 5 to 9
       lost frames in a row (the review measured the margin). With it, a gap of up to ten lost frames is
       laid exactly as the render lays it.
     - **The price:** during a run of lost frames the output waits, for up to 200 ms. The worklet's queue
       runs dry, and when the held sound arrives at once it skips what is over its limit, as after any
       stall. Loss is off by default. Say so in the report; the worklet is not changed.
     - **Two rules for a packet that would land before `given`, by which message it comes from:**
       - **the packet of a spurt's opening message** (the sender's first message of the spurt, the one that
         carries the pre-roll) is **cut**: its samples before `given` are lost and the rest is laid where it
         belongs. `stats.droppedLate` counts the lost samples, in voice-rate samples, **and only those at or
         after index 0**: a chain's first spurt can be anchored before 0 (with the gate off its pre-roll of
         zeros starts some 4,700 voice-rate samples before 0), and what lies before 0 is dropped as the
         render drops it, uncounted. With the full reach nothing at or after 0 is ever cut;
       - **every other packet is moved**: it is laid whole with its first sample at index `given`, the
         cursor follows it, and the spurt goes on from there, so the rest of the spurt runs `given - C`
         later than the render lays it (`C` the cursor as it stood). That includes the first packet that
         holds samples when every frame of the opening message was lost. `stats.movedLate` counts packets,
         and a test hook, `opts.onMove(from, to)`, reports `C` and `given` at each move. The live chain
         cannot take sound back, and dropping instead would silence the rest of a long spurt. A move
         happens only after a gap of more than ten lost frames has closed up further than the wait covers
         (the reviewer's model of the rule: with the full reach no run of 16 or fewer lost frames moves a
         packet, a run of 20 or 30 moves exactly one, and nothing cascades after it). It is the one place
         the live chain's laid signal differs from the render's.
     - **What stays the render's when a packet is moved:** the gain is fed exactly as in the render
       (`steamTimeline`'s `add` runs it before the packet is laid, so a move changes only where the packet
       lands); the frame log is marked where the packet was laid, the moved place; where the moved spurt's
       tail meets the next spurt's opening, the later packet wins, as in the render.
   - **Low-latency mode** (`opts.lowLatency`): the reach is the longest chunk plus one frame less a sample
     (`steamReach` less the sender's `preroll`, plus `frame - 1`): a message's first frame can start that
     far before the read that makes it, since up to a frame less a sample is kept from the chunk before. (A
     reach of the longest chunk alone, as first written, drops sound in mid-spurt with no loss: the review
     measured 1 to 2% of messages.) The sender, the encoder and the decoder run exactly as before, pre-roll
     included, so every later sample of the spurt is the render's; only the pre-roll's sound is lost, by
     the rule on a spurt's first packet. **The latency is lower by the difference of the two reaches** (about
     80 ms with today's sender), and the page takes that figure from the chain, not from its text.
   - **After the mix point** the stages are the live chain's as they stand (the mixer's rate, the listener's
     low-pass, the output FIR, `volume`, the conversion to the context's rate, the limiter): W3-10 and W3-17d
     change them, not this part. **The mix point is one stage boundary**, with the test hook `opts.onGain`
     on it as in the render: W3-10 starts "after its mix point as W3-11b left it" and counts the mixer's
     blocks from the chain's first sample there.
   - **`contentDelay` is the index shift and nothing else:** how many samples (at the context's rate) the
     output's index sits behind the input's. On this path the capture FIR's delay is dropped from the
     front, the lookahead is trimmed where the timeline lays, and the reach only holds samples back: none
     moves the index. So for `steam` it is the causal delay of the stages after the mix point (today the
     output FIR's one sample at 44.1 kHz). `live-worker.js` lines a recording up with it, and [10b] checks
     it at the correlation's peak. **`stats.latencyMs` is `contentDelay` plus every hold-back**: the reach
     and the lookahead, the dropped FIR waits, the resamplers' waits. Give both modes' figures in the report.
   - **`stats`, each field** (the page reads them): `frames`: the 20 ms slots that have become final;
     `sent`: those not gated; `lost` and `late`: the final slots with those codes, as the render's
     `lostFrames` and `underrunFrames` count them (so a gap's frames past the tenth and frames lost at a
     spurt's end are not counted: they were not played); `modes`, `dtx`, `bytes`, `lastMode`: per frame
     encoded; `spurts`: the sender's `info().spurts.length`; `gateOpen`: a spurt is open in the timeline;
     `talking`; `droppedLate` (voice-rate samples) and `movedLate` (packets); `latencyMs`. `frameSize` 480,
     `frameSeconds` 0.02. `takeFrameCodes()` gives the slots that became final since the last call, by what
     was laid, as the render's frame log has them; `live-worker.js`'s line that places slot `k` follows the
     render's slot rule (slot `i` covers codec samples from `480 i - lookahead`). `gateDb` is -40 for
     Steam's own, the typed number otherwise, `null` with the gate off.
   - **A settings change rebuilds the chain**, as now (`live-worker.js`, `configure`): the new chain starts
     with a silent sender, a new decoder, a resampler that has not flushed and a reset gain. That is the
     app's own, it is not changed here, and the comment says so.
2. **Push-to-talk, the stand-in** (Decision 3). `setTalking(false)`: from the next block given to
   `process()`, the block is replaced by zeros before the mic gain; `setTalking(true)`: from the next block,
   the microphone again. The input meter still shows the microphone. Nothing else knows about the key. So a
   chain driven with a key is, by construction, the chain fed the same sound with those blocks zeroed, and
   the check says exactly that. The other profiles keep today's rule (frames with the key up are not sent).
3. **The suites that held the old path.**
   - `tests/verify.js` [10b] goes back to `steam` and becomes the proof (below). Browser check 3f is
     restated.
   - `tests/speex102.verify.mjs`: its sandbox loads `steam-sender.js` and `vendor/swresample/swresample.js`;
     its "[Live chain] Every profile" checks watch `createVoiceStream`, which the new path does not call:
     their `steam` case moves to `steam_48`, and what they proved for `steam` (a new encoder per spurt, late
     and concealed blocks counted) is carried by [10b].
   - `tests/gain.verify.mjs`: "3 s blocks give the samples of 20 ms blocks" keeps its point on `steam` and
     gains a case with loss.
4. **The threshold, in the engine.** One reading of `opts.gateThresholdDb`, shared by `steamSenderOptions`
   and the frame gate's three readers (`process()`, `createRender`, `createLiveChain`): `null`, `undefined`
   and `''` give the profile's own; a number, or a string that reads as one, is clamped to -90..0 as now;
   anything else gives the profile's own. (Today `finiteOr(null, ...)` is 0 dBFS in the three frame-gate
   readers, and `steamSenderOptions` already reads `null` as Steam's own.) Show first that no golden hash
   moves; no golden case passes `null`, `''` or a string.
5. **The threshold control** (`#vad_threshold`, `voice_vad_threshold`). **An untouched control must give
   Steam's gate.**
   - Its meaning depends on the profile, and its help and title say so: for `steam`, "the mean of |x| over a
     capture chunk, in dBFS; Steam's own is -40 (1% of full scale); a sine opens at -39.1 dBFS RMS"; for the
     others, "20 ms frame RMS in dBFS (-39.5)".
   - Its default is the profile's own: -40 for `steam`, -39.5 for the others. When the codec changes and the
     control holds the old profile's default, it takes the new one's.
   - `app/render.js` leaves `gateThresholdDb` out (`undefined`) when the control holds the profile's default
     and sends the number otherwise, for every profile (this replaces W3-11a's line). The reason is the key
     a render is cached and batched by, which must not change at a default. (A typed -40 gives 327.67
     exactly in JavaScript: the first version's reason, "never recomputed", was moot.)
   - A saved setting of -39.5 with the `steam` profile reads as the default (-40).
   - **One step of difference at a typed threshold is accepted.** The sender compares the mean in doubles;
     Steam forms a 32-bit float percentage and compares that. At Steam's own number no chunk the sender can
     see differs (W3-02b's review tried every sum within 50 of the threshold); at a typed one a chunk
     exactly on the line can open here and not in Steam. The help text need not say it.
   - Every place that carries the old default, to change or to check (find them again after W3-16's merge):
     `index.html` (the input's `value`), `app/render.js` (W3-11a's line), `app/console.js` (the help, the
     read, the reset command), `app/core.js` (the saved-settings fields and the presets, if they name it),
     `README.md`, `tests/browser.verify.js` (it expects `-39.5`). Not changed: `audio.js`'s
     `DEFAULT_SENDER_GATE`, `app/realtake.js`, `reference.js`, `tests/retiming.mjs`,
     `tests/LEGACY_CODECS.md`, `tests/predictions/` (they are the frame model, which the other profiles and
     the take tools keep). One thing follows and is said in the control's help for `steam`:
     `app/realtake.js` hands a typed threshold to the real-take check as a 20 ms RMS level, so with `steam`
     and a typed number the check's own gate sits about 1 dB from the render's (a sine's mean of |x| is
     0.9 dB under its RMS). At the default nothing is typed and nothing is off.
6. **The words.** Each text below differs by profile now: `steam` on the new path, the others on the frame
   path with their 120 ms pre-roll.
   - The chain strip's Gate cell and the console's lines for `steam`: "chunks · 100 ms kept · 0.4 s hold" in
     place of the frame counts.
   - Wherever the page shows a render's `lostFrames` or the live `lost` count for `steam` (`app/render.js`'s
     console line, `app/netgraph.js`, `live.js`'s loss line): "concealed", not "lost"; the render's console
     line adds that frames lost at a spurt's end are not played.
   - `index.html`: the latency tooltip ("including the voice gate's 120 ms pre-roll") and the low-latency
     label and title ("Skip the voice gate's 120 ms pre-roll ... onsets lose their first 120 ms"): for
     `steam`, what is held back is the pre-roll and the longest chunk, and low latency drops the pre-roll's
     sound and saves the figure the chain gives; for the others, as now. The push-to-talk title: for
     `steam`, "the app's stand-in for the key: the microphone is silenced while the key is up, and the
     voice gate ends the phrase by its own hold. Steam's own key rules (it goes on sending for half a
     second after a release) are not built yet"; for the others, as now.
   - `README.md`: the gate paragraph (it still describes the 20 ms frame gate); the settings table; the
     live monitor's section: the latency paragraph ("About 230 ms ... sends the 120 ms before a word"), the
     push-to-talk bullet (the stand-in, in the title's words; "audio from before the key goes down is never
     sent" becomes "sound captured while the key is up is never sent"), the low-latency bullet ("saves 120 ms"), one sentence that with
     push-to-talk off the key counts as held and that TF2's open-microphone mode was not read; `steam_48`'s
     row gains "not the game's path: the 20 ms frame gate and the app's own resampler"; the limits say that
     the packets' clock is a model.
   - `live.js`'s header comment; `constants.js`: the `steam` profile's comment no longer says the live chain
     uses the three frame-gate numbers (they stay for the take tools), and `steam_48`'s label.
   - `tests/REFERENCE_2026.md`: only "the app today" where this build makes it untrue, in the file's own
     style (a dated "Corrected" line where a sentence is replaced), in a commit of its own: finding 5's
     correction ("the live chain keeps the frame fit until W3-11b"); finding 12's "The app today"; finding
     16's correction ("the profile's other paths (the live chain, ...) still decode to float"); finding
     26's "the other paths (the live chain, ...)"; the last lines of finding 28's and finding 29's "The app
     today" (28's gains the push-to-talk stand-in, named as the app's own); the Model section's opening
     sentence and its "Not built" line; the live-chain clauses of the Model table's rows Capture, Voice
     gate, Codec, Decoder's resampler, Auto-gain and Network. No finding's evidence is touched.
7. `sw.js`: raise `CACHE` by one (no new asset). `tests/predictions/PREDICTIONS.md`: a dated note
   (`audio.js` and `constants.js`, both hashed model files, changed again; no render moved: the golden
   hashes).

### The builder runs

`pnpm test`, `pnpm test:vendor`, the browser suite under the heavy lock, CI on the pushed branch. Each new
check fails when its line is broken; the builder says how, and at least the mutations of the table are tried
in a scratch copy.

- **No golden hash moves**, shown before any new expectation is recorded: `node
  tests/render-stream.verify.mjs --hashes` against main's, all cases. `tests/steam-sender.verify.mjs` and
  `tests/opus.verify.mjs` pass untouched.
- **`tests/verify.js` [10b], on `steam`: the live chain is the render.** A speech-like source of 20 s with
  pauses that close the gate, at 24 kHz and at 48 kHz; the live chain fed in blocks of 128, 480 and 4,096
  samples and one plan of seeded uneven sizes. Through `opts.onGain` on both:
  - the laid signal the live chain has given out equals `createRender`'s, sample for sample, over
    everything given out, at each plan; `droppedLate` and `movedLate` are 0, with the gate on and with it
    off (off, the first spurt is anchored before index 0: nothing of that is counted);
  - over the same span the counts agree: the spurts opened, the resampler's calls, the slots' codes (the
    render's own totals include what `finish()` adds, so compare what the live chain has given out);
  - the same with the gate off; with `steamUptime` at two values that end a spurt on different chunks (the
    builder finds a source and seed where the two renders differ, and says which); with a typed threshold
    of -46; with `agc` off; with `voice_scale` 0.5;
  - **with `lossPct` 15 and jitter**, on a seed whose mask, inside a spurt, has no run of more than ten
    lost frames **and has a run of 8 to 10** (both asserted first, from the mask: the long run is what makes
    the chain wait for the cursor, and without it a chain that gives out by the reach alone would pass):
    equal as above, `stats.lost` and `stats.late` equal the render's `lostFrames` and `underrunFrames` over
    the span, and both are above 0;
  - **a hand-made mask** (the `makeLossMask` hook, or the live chain's own) with 30 frames lost in a row in
    a long spurt, **at every block plan of the list below**: no exception; `onMove` fires exactly once, with
    `to` greater than `from`; `droppedLate` is 0; up to the move the laid signal equals the render's; **from
    the moved packet to the end of its spurt it equals the render's laid signal shifted later by exactly
    `to - from`**, sample for sample over what was given out; the outputs and the hook's two values are the
    same at every plan;
  - **the block plans for that case and for low-latency mode:** 128, 480, 4,096, the seeded uneven plan,
    single samples, the whole source as one block, blocks that end exactly on each chunk's last sample
    (the chunk ends taken from a dry run of `createSender` with the same seed and settings; a block ends
    "on" one when the call to `process()` ends having pushed exactly that sample to the sender, which
    trails the block's input by what the capture's stages hold), and blocks that end one sample before each
    of those. The last two put a block's edge on
    either side of every message, which is what shows an update of `given` made before a sample's messages
    are handled;
  - **the give-out function by itself** (the function `createRender` and the live chain share): for a
    handful of `(P, C)` pairs, the bound it returns: no spurt open gives `R`; a cursor ahead of `R` gives
    `R`; a cursor 9 and 10 frames behind `R` gives the cursor; 11 frames behind gives `R` less ten frames
    exactly. (A wait of 12 to 15 frames passes every other check.)
  - a new encoder and decoder per spurt, and concealed and late blocks counted: what
    `tests/speex102.verify.mjs` proved by watching the codec is proved here by the equality and the counts;
  - `gateThresholdDb` `null`, `undefined` and `''` give the same samples in `process()`, in `createRender`
    and in the live chain, for `steam` and for `celt_22` with the gate on; `'-46'` and `-46` give the same;
  - **low-latency mode:** with no loss, at each block plan of the list above, the output equals the
    full-reach output from each spurt's first given-out sample on, and the outputs and `droppedLate` are
    equal across the plans; `droppedLate` is above 0 and at most the pre-roll's length at the voice rate a
    spurt (samples before index 0 are not in it); `movedLate` is 0; `latencyMs` is lower than the full mode's by exactly the difference of the two
    reaches over 24 (computed in the test from `STEAM_SENDER`, not typed);
  - **`contentDelay`:** the chain's whole output against a render of the same audio, as [10b] has it for
    `steam_48` today (the level, and the waveform at the correlation's peak): the peak is at `contentDelay`,
    and `latencyMs - 1000 x contentDelay / rate` is the hold-back the report states;
  - **push-to-talk:** with a scripted key, up twice inside speech (once for a time the render of the
    zeroed source bridges with one spurt, once for a time that ends the spurt: both asserted on that
    render), the laid signal equals `createRender`'s for the same source with those blocks zeroed, sample
    for sample;
  - `steam_48`'s live output is bit for bit main's (a recorded hash, made on main first), with the key held
    and with the scripted key.
- **`tests/gain.verify.mjs`**: "3 s blocks give the samples of 20 ms blocks" on `steam`, as it stands and
  with `lossPct` 15.
- **The browser suite.** A fresh page shows -40; `renderOptions()` has **no** `gateThresholdDb` at the
  default, for `steam` and for a CELT profile, and a batch's key at the default is what it was before the
  control was touched and put back; switching to a CELT profile shows -39.5 and back shows -40; typing -46
  gives a render whose `codecInfo.sender.meanMin` is `32767 x 10^(-46/20)`; a saved -39.5 under `steam`
  restores as -40; the reset command restores the profile's default; the Gate cell's text; `steam_48`'s
  label; the three live texts of item 6 for `steam` and for a CELT profile. **Check 3f, restated:** the
  live take against an offline render of the recorded microphone, on `steam`: both paths are late by the
  same 16 inputs of Steam's resampler, so the lag is near 0; what is left is the rounding of the anchors
  and where the resampler's stream stood (the take starts in mid-session, so its clock's origin differs):
  `|lag| <= 2 k` samples, `k = rate / 44100`, and `r > 0.8`; if sixty seeded takes simulated as W3-11a's
  builder did show a lower floor, the bound is their tenth percentile less 0.05, with the table in the
  report. **3f is a smoke test**: a float decode, a missing rounding, a kept FIR delay or a missing uptime
  would all pass it; [10b] is the proof. `steam_48` keeps `|lag| <= 1` and `r > 0.8`. The live checks that
  rest on the frame gate are restated for `steam`: "frames sent" (slots not gated, `modes.hybrid` above 0);
  the latency shown lies between the chain's `latencyMs` and that plus 400 ms; low-latency mode lowers
  `stats.latencyMs` by the figure the page shows; push-to-talk: the check waits 1.5 s after the key is up
  before its first count (the hold, a chunk, the reach and the page's own delays come to about 0.9 s at
  the default uptime), and then `sent` does not grow.
- **Mutations**, each caught by the named check:

  | Mutation | Caught by |
  | --- | --- |
  | the capture FIR's delay not dropped before the sender | [10b] "the live chain is the render" (the spurts' starts differ) |
  | the capture not rounded, or rounded half up | the same check; 3f does not see it |
  | the live chain's own seed, or `steamUptime` not passed | the same check; the two-uptime case |
  | the float decode, or the app's sinc resampler, left in the live chain | the same check |
  | the resampler made anew at each spurt | the same check (the resampler's calls and the samples) |
  | the gain fed the laid signal, or reset at a spurt | the same check, with `agc` on |
  | given out by the reach alone (no wait for the cursor) | [10b] loss case, at its run of 8 to 10: a move or a difference where the render lays concealment |
  | the wait for the cursor without its ten-frame limit | the 30-lost mask: `onMove` never fires; the give-out function's check |
  | the wait at 12 frames, or at 5 | the give-out function's check (11 frames behind); at 5, the loss case too |
  | a late packet dropped, not moved | the 30-lost mask: the shifted equality |
  | a late packet laid from `R`, or from `given + 1`, or moved by whole frames | the 30-lost mask: the shifted equality, by `to - from` exactly |
  | samples before index 0 counted in `droppedLate` | [10b] with the gate off: `droppedLate` is 0; the low-latency bound |
  | `given` updated before the sample's messages are handled | low-latency at the plans that end on, and one sample before, each chunk's last sample |
  | the low-latency reach the longest chunk alone | the low-latency check: a difference in mid-spurt |
  | what is given out decided per block, not per pushed sample | low-latency across the plans: the outputs and `droppedLate` differ between plans |
  | `contentDelay` holding the reach | [10b] `contentDelay`: the peak is elsewhere |
  | `null` read as 0 dBFS in any one of the three readers | [10b] `null`, `undefined`, `''` in `process()`, `createRender` and the live chain |
  | `lost` counting the mask's lost frames | [10b] loss case: `stats.lost` equals the render's `lostFrames` |
  | the key up skipping blocks, not zeroing them | [10b] push-to-talk: later spurts land early |
  | the key up zeroing after the capture's filters | the same check: the samples at each edge differ |
  | the page sends -40 as a number at the default | browser: `renderOptions()` has no `gateThresholdDb` |
  | the open-ended frame log changing a render's slots | the golden hashes (`codecInfo`) |

- Screenshots (desktop and phone) of the control, the chain strip and the live monitor running, in the
  report. The report also gives: `contentDelay` and `latencyMs` in both modes, before and after; the live
  worker's cost for a minute of speech against real time; what the worklet did with the held sound in a
  loss run; **that the chain has no flush, so the last 200 ms or so of a session (what is held back when
  the monitor stops) is never given out and a recording ends that much short**; every text of item 6 as
  it now reads.

There is nothing private to run.

### What W3-10 will find, and re-record

W3-10 removes the output FIR and the limiter from the live chain. So it moves this part's `contentDelay` (to
0 on a 44.1 kHz context), both latency figures, 3f's latency window and [10b]'s recorded `steam_48` live
hash. Those are W3-10's to re-record; nothing here should be written so that it cannot.

### Files

May touch: `audio.js` (`createLiveChain`; the threshold's one reading and its four callers; `steamTimeline`'s
three changes of item 1 and the shared give-out function, with no change to a render's samples or
`codecInfo`), `live.js`, `live-worker.js`, `index.html`, `app/console.js`, `app/core.js`, `app/render.js`,
`app/netgraph.js`, `constants.js` (the `steam` profile's comment and `steam_48`'s `displayName`),
`README.md`, `sw.js`, `tests/verify.js`, `tests/gain.verify.mjs`, `tests/speex102.verify.mjs`,
`tests/browser.verify.js`, `tests/predictions/PREDICTIONS.md`, `tests/REFERENCE_2026.md` (item 6's lines
only). May not touch: `steam-sender.js`, `opus-codec.mjs`, `live-worklet.js`, `process()` and `createRender`
beyond the threshold's reading and the shared give-out function, `voice-channel.js`, `vendor/`, `demo.js`,
`reference.js`, `app/realtake.js`, `tests/render-stream.verify.mjs` (its hashes are the proof),
`tests/steam-sender.verify.mjs`, `tests/opus.verify.mjs`, `tests/accuracy.mjs`,
`tests/predictions/predictions.json`, `docs/PROGRESS.json`.

### Stop and ask

- If a golden hash moves.
- If the live chain cannot equal `createRender` at the mix point (give the first sample that differs and the
  stage it comes from).
- If the sender as W3-16 merged it does not return a message from the push of its chunk's last sample, or
  `steamReach` no longer bounds where a message can start: the give-out rule rests on both.
- If the sender or the stream needs a change.

## W3-11c: the key, as Steam has it

**Not to be built yet.** Written 2026-11-10 from the first version of part b (its items 4 and 5) and its plan
review, so that what is known is in one place. It is **after W3-17d** in the order of work: the project's
scope (`docs/PROGRESS.json`, decisions, 2026-11-10) puts models that no recording has checked after the 1.0
list, and until then push-to-talk runs W3-11b's stand-in, named as such on the page. **Two things must
happen first:**

1. **The owner's microphone run is in** ("The run", below). It settles two of the three points this part
   would otherwise have to model.
2. **A planner specifies, against that run,** the five points the review found too open to build: M4, S1,
   S2, N4 and N5 ("To be specified", below). Then the part gets its own files, checks and budget, and a
   plan review.

### What is read and measured

W3-09 ("Key down and key up"), the W3-16 read (section 1e and its pseudo-code), W3-14 ("The end of a key
press, and the next press", "The run as one session"):

| Event | What Steam does | Basis |
| --- | --- | --- |
| Key up | `stopF = nowF`: the float time of the last frame, not a new reading. `stopD = T()`: a fresh reading, a double. Nothing else: reads go on | read |
| Each read while `stopF` is not 0 | first: if `nowF > fround(stopF + 0.5)` (floats, strictly greater), `stopF = 0` and, the key still up, the device stops: this read and the ones after it do nothing | read |
| The game's queue | a chunk's message is taken for the game until a fresh reading, in doubles, is past `stopD + 0.5`; the order of the take and the test within a frame is the read's pseudo-code | read. **Its one measurement does not fit: see "Not yet explained"** |
| So there are two tails | the game is fed for an exact 0.5 s; the device and the gate run for 0.5 s on the float clock, up to one float step longer. A message made in between is made (the encoder moves on, its numbers are spent, the gate's state moves, a spurt can end there) and never collected | read; the consequence inferred |
| Key down inside the float tail | `stopF = 0`; nothing is reset; taking goes on | read |
| Key down after the device stopped | the queue of pending voice is cleared (nothing is in it: the exact tail has already stopped the taking), the encoder is reset and the kept samples (the part of a frame in hand) are dropped. **Not reset: the sequence number, the gate's state and its noted time.** The device starts | read; the encoder, the kept samples and the number measured twice (Set J) |
| The first read after that | an empty read runs the states (W3-16): hanging or active with the hold long past, it sends **the end marker alone: the empty packet** of finding 25, and the next inactive chunk goes out as a silence record; ended, it clears the record; silent, nothing | read for the states; the packet seen in Set G. **That the first read is usually empty is W3-09's inference**, not a reading; a model of the restarted capture gives about two in three (the review's simulation) |
| A spurt left open | if the first read after a press does not end it (the hold has not run out, or the read brings an active chunk), **the spurt goes on**: no marker, numbers running on, the new encoder's packets into the old decoder | measured (Set J, both clips) |
| The decoder | outlives key presses and channels; only a delivered end marker, or a number behind the expected one, resets it. Numbers that ran on over frames it never got are a gap: at most 10 concealed | measured (Set J as one session); read |

### Not yet explained

**The one measured release left more uncollected than the two-tail rule allows.** In Set J the game never
collected the last 10 messages of the continuous clip's first press: 34 frames, 0.67 s of reads (W3-14, "The
run as one session"; finding 29, "The cut, seen"). At that run's float step of 1/8 s the two tails differ by
at most about 0.125 s and one read. Why is not known. Until it is, "the game is fed for an exact 0.5 s" is a
reading that its only measurement contradicts, and no text of the app may state a release tail as fact: the
words would be "Steam keeps sending for 0.5 s after the release (read from Steam's client)".

### The run (for the owner; a real microphone path, Steam's console and the game's)

What it must contain, so that the planner can specify the part against it:

- **Steam's uptime, noted**: when Steam was last started, to the hour, and the PC's. If it is easy, the run
  twice: once on a Steam started within the hour, once on the Steam as it has been running.
- **Steam's console:** `@voice_spew_activity_check 1` (one line per chunk: its verdict, length, mean and
  peak). **The game's console:** `voice_showincoming 1` and `voice_showchannels 1`, and the key bound so
  that the console marks it: `alias +vr "+voicerecord; echo KEYDOWN"`, `alias -vr "-voicerecord; echo
  KEYUP"`, `bind v +vr`. `voice_loopback 1`, a lossless recording of the output as in the earlier sets.
- **The sound**, through the same microphone path as Set D: a steady tone A (1 kHz at -20 dBFS) that is
  loud enough to keep the gate open, and a second, different tone B (2 kHz), so that a recording shows which
  sound a packet holds. A mark in the console (`echo MARK1`, ...) before each case; at least 3 s of key up
  between cases; each case three times.
  1. **A release left to run out.** Tone A playing; hold the key 5 s; release; wait 5 s. (How long the chunk
     lines go on, and which of those chunks the game logged: the two tails, and whether Set J's 0.67 s
     comes back.)
  2. **A release and a press inside the tail.** Tone A playing; hold 3 s; release; press again as fast as
     the finger allows (about 0.2 s); hold 3 s; release.
  3. **A press in mid-spurt, after the tail.** Tone A playing throughout; hold 3 s; release; wait about
     0.7 s, then 1 s, then 3 s in the three repeats; press and hold 3 s. (Whether the spurt goes on or an
     end marker comes first; whether the first read after the press is empty; the lengths of the first
     chunks after the press: where a restarted device's capture steps fall.)
  4. **What the pre-roll holds after a stop.** Tone A playing; hold 3 s; release with A still playing; after
     the release stop A and wait 3 s in silence; press, wait 1 s in silence, start tone B. (Whether B's
     opening packet carries 100 ms of tone A from before the stop: the gate's buffer of past sound across a
     stop.)
  5. **A press in silence, then sound.** Silence; press; after 1 s start tone A for 2 s; stop; release 2 s
     later. (The empty packet and the silence record, with their console lines.)
  6. **A tap:** the key down for under a tenth of a second, with tone A playing.
- **Send:** both console logs whole, the recordings, the uptimes, and which microphone path was used.

It settles: where the capture's steps fall after a restart, and what the first read brings (model point 1);
whether the past sound survives a stop (model point 2). It may explain the 0.67 s. It cannot settle the third
point, which is the app's own (below).

### To be specified against the run, before any build

- **M4: a spurt that goes on across a stop.** W3-16's sender gives a non-opening message's `start` as the
  spurt's start plus its frames, and `steamTimeline` lays each later packet straight after the one before:
  as both stand, the sound after a press would be laid where the sound before the release ended, seconds
  before what has been given out. To specify: after a press that reset the encoder, the next message's
  `start` is the position of its first frame in the pushed samples; the timeline re-anchors the open spurt
  there (the decoded frames from `round((start - lookahead) x 147/80)` with the concealed blocks before
  them, or the whole message from that point: one, marked); a check that at such a press, with no loss,
  nothing is dropped and sound is present within 0.1 s, for a seed whose first read after the press is
  empty and for one whose first read is not.
- **S1: the restarted capture**, tightly enough that two builders write the same thing: what the clock
  draws while the device is stopped; where step 0 of the restarted capture starts and when each step is
  ready; in what order the capture's random source draws after the restart; what happens to the read in
  hand, which the sender has already drawn, with its sample count, before the press (`nextRead()` draws the
  next read as soon as the last is taken); one function, marked as a model or as measured, and a reference
  schedule for one seed and one press in the style of W3-16's hash. The run's case 3 gives the facts.
- **S2: `stopF` and `stopD`.** Because the sender draws ahead, `nowF` at a key change belongs to the read
  in hand, not to the last read taken: the two must be named and kept apart, and it must be said whether an
  empty read that was drawn and run ahead counts as taken. `stopD` in Steam is a fresh reading at the
  release, 0 to one read after the last frame: taking the last read's time shortens the exact tail by about
  28 ms on average and leaves messages uncollected more often than Steam does. A rule closer to the read
  (the release's own time on the chain's clock, never before the last read taken), or the choice marked as
  a model with its effect, in the code, the report and the reference.
- **N4: an end marker that was not collected.** If the decoder has received nothing since its last reset
  and a new spurt's frame 0 follows an uncollected end marker, the stream's count of the gap comes to ten
  concealed frames where Steam conceals none (the number equals the expected one). At an uncollected end
  marker the stream sets its expected number back to the decoder's and its count of lost frames to 0. With
  that, and only with that, "the 17-frame cut cannot be reached in the live chain" holds.
- **N5: the calls.** `key(x)` with the key already in state `x` does nothing (`live-worker.js` calls
  `setTalking(true)` on every new chain); whether `press()` on the stream comes before or after the
  messages `key()` returns.
- **Also, from the same review:** the scripted key case of [10b] with bounds derived from the model (S4: a
  press inside the tail must leave the output equal to the render with no key; what is heard after a
  release is bounded by the exact tail, the sender's read-ahead and one read, not by the float step); the
  resampler across a press checked as W3-11a's "one resampler, never reset" (S6); an end marker counts as
  delivered whenever its message is collected, whatever the mask drew for its frames (N3); a key change
  takes effect at the samples pushed to the sender, which trail the block's input by the capture's waits
  (N6); a scripted case with an exact count for the messages over 12 frames (N8); a supplied clock's read
  brings at most the sender's longest chunk (N12); an uncollected silence record gives no zeros to the
  resampler or the gain, with a check in the stream's suite and in [10b]; no message of a sender whose
  `key` is never called carries the new field; the reference's finding 28 lists every point of the key
  that is a model, and the Model table's Voice gate row gains the live chain's key (S10).

### The design as it stands (the first version's, for the planner to start from)

- **In the sender** (`steam-sender.js`): a call `key(down)` returning `{ messages, reset }`, and a field
  `collected` on a message the game would not have taken. A key change takes effect between two reads of a
  sender that takes each read as soon as its chunk's samples are in (so up to two reads late on the model's
  own clock: **the third model point, the app's own, which no run settles**). While the device is stopped,
  pushed samples are counted and not captured, so positions run on. `push`, `finish`, `info` and every
  message of a sender whose `key` is never called are unchanged, and the golden hashes hold.
- **In the stream** (`createSteamStream`): the sender's side and the receiver's are separated. The encoder
  and the frame numbers are the sender's: a new encoder and number 0 after each end marker made, a new
  encoder with the numbers running on at `press()`. The decoder is the receiver's: one for the stream's
  life, reset by a delivered end marker or a number behind the expected one, never by `press()`. Today a
  spurt's first message makes both anew together, so the stream cannot say "a new encoder into the old
  decoder" or "made, not delivered" (W3-11a's second reader, note 8). A message that was not collected is
  encoded frame by frame, the mask still drawing for its frames, and nothing of it reaches the decoder, the
  resampler or the gain.
- **In the live chain:** `setTalking(on)` calls `sender.key(on)` in place of W3-11b's zeroing.
- **The two limits a key can reach** (W3-16's order, "The decoder's 17-frame cut: not here"; the read,
  section 3). With the key, numbers can run on over frames never collected. A chunk is at most the sender's
  longest, so a message after such a gap is at most 10 concealed and 6 decoded: the 17-frame cut is out of
  reach (given N4). The game's refusal of a message over 12 frames is not: at a long uptime the float tail
  runs up to 250 ms past the exact one. The game's refusal of a message over 12 frames is built on both
  timelines and in the live chain since BC-1 (`steamFits` in `audio.js`); at a long uptime the float tail can
  reach it, and the live chain refuses such a message and counts it.

## Not in this order

The game's timeline (W3-02c), and with it the channel a message opens, the gain's reset at a channel's
assignment and the game's refusal of a message over 12 frames (built by BC-1). The decoder's 17-frame cut (W3-02g). TF2's
open-microphone mode (`voice_vox`), which was not read. Steam's `voice_preprocess`. The capture roll-off,
which W3-09 found to be Windows's resampler and stays as measured. A 48 kHz sender for `steam_48`. Loss that
falls on whole messages (`docs/reports/W3-11-plan.md`, "Open"; built by BC-1). The tie between Steam's reads and the game's
tick (measured in Set J, not explained). The live chain's stages after the mix point (W3-10, W3-17d).
