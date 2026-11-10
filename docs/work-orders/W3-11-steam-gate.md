# W3-11: the `steam` profile sends and decodes as Steam does

*Rewritten 2026-11-10 after the plan's review (findings 7 to 18 and its note on size;
`docs/reports/W3-11-plan.md`, "The review"): split in two; for the `steam` profile only; the 16-bit decode is
the library's own; the gate off is a sender setting; the checks that a correct build would have failed are
replaced. Revised again the same day after the second read (its findings 5 to 10): the Opus rebuild's steps
are spelled out; the tool for the owner's file-input recording and its private check are gone from this order
(that question is `docs/work-orders/W3-14-steam-file-input.md`, an investigation; nothing here waits for it).*

| Part | What | Starts after | Budget |
| --- | --- | --- | --- |
| **W3-11a** | the render and `createRender`: the sender, the decoder's rules, 16 bits, the resampler, `codecInfo`, the golden hashes | **built and merged 2026-11-10** (`docs/reports/W3-11a-steam-render.md`); its section below is left as it was built from | 2 days |
| **W3-11b** | the live chain on Steam's path (the render's own stages), the key, the threshold control and its default, the page's texts, README | **W3-16 merged**; no other `audio.js` order open | 2 days |

**The order of work since 2026-11-10** (`docs/PROGRESS.json`, decisions; `docs/reports/W3-plan-maintenance-2.md`):
W3-16, then W3-11b, then W3-10, W3-17c and W3-17d, then W3-02c to W3-02g. **Part b was rewritten that day and
is ready to build when W3-16 has merged.** **Kind:** code. `tf-builder` (effort xhigh), then `tf-reviewer`,
then a second reader on the stronger model (part a: it changes how a render is computed; part b: it edits the
sender and the codec's stream, which the render shares). **Branches:**
`claude/w3-11a-steam-render`, `claude/w3-11b-steam-live-page`, from `main`. **Worktrees:** given in the brief.
*Maintenance, 2026-11-10 (`docs/reports/W3-plan-maintenance.md`): brought up to date with what the builds of
W3-02b, W3-05 and W3-13 learnt (the sender's messages as built, the gain fed only decoded samples and its
settings read at a reset, a resampler that lives as long as the speaker's decoder, the footer's credit).
**W3-13 is built and reviewed but its merge waits for the owner's word on its licence. W3-11a may be built
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

## W3-11b: the live chain on Steam's path, the key, the threshold control, the words

*Rewritten 2026-11-10 (`docs/reports/W3-plan-maintenance-2.md`). The part as first written is replaced, not
amended: it kept the live chain's float decode and its own resampler, left the key to a later order, used a
sender interface that W3-16 has since changed, and one of its checks did not fit the code (a settings change
rebuilds the live chain, so no gain "runs on" across one). What it said of the threshold control and the page's
words stands and is carried over below.*

**Starts after:** W3-16 merged (its sender is what this part drives; W3-11a is merged). No other `audio.js`
order open. **Before:** W3-10. **Budget:** 2 days (it was 1: the key and the decode side are new to it).
**Agents:** `tf-builder` at effort xhigh, then `tf-reviewer`, then a second reader on the stronger model (it
edits the sender and the codec's stream, which the render shares, and decides what the live monitor computes).
**Branch:** `claude/w3-11b-steam-live-page`, from `main` after W3-16's merge.

**Read first:** `docs/reports/W3-11a-steam-render.md` ("What was built", "Readings of the order", "For W3-11b's
builder"); W3-16's report, `docs/reports/W3-16-sender-hold-clock.md` ("The sender", "For W3-11b's builder");
`docs/reports/W3-16-steam-hold-read.md` (section 1d's last paragraph, section 1e and the pseudo-code: "the
read" below); `docs/reports/W3-14-steam-file-input.md` ("The end of a key press, and the next press", "The run
as one session"); `docs/reports/W3-09-steam-voice.md` ("Key down and key up"); `tests/REFERENCE_2026.md`,
findings 28 and 29.

### Decisions of this part

1. **One path.** For the `steam` profile with the codec on, the live chain runs the render's own stages, fed
   as the microphone's blocks arrive: the 16-bit capture, Steam's sender with the seeded clock and the
   `uptime` setting, `createSteamStream` (the library's 16-bit decoder under Steam's rules), one
   `TF2Swresample` resampler fed whole messages, the gain fed the decoded packets, the packets laid on the
   source's timeline. **With the key held from the first sample, what the live chain hands its mix stage is,
   sample for sample, what `createRender` hands its own** for the same sound, seed and settings. Why: Set J
   showed the render's decode path to be Steam's in 524,286 of 524,288 samples (W3-14), so a second, float
   path in the live chain is now the one place the app's `steam` differs from Steam for no reason; and
   W3-11a's browser check 3f had to measure the lag between the two paths instead of proving them equal.
2. **The clock is the model's, on the samples.** In Steam a microphone's chunk needs no clock: it is what the
   capture cursor gained since the last read, at most 6000 samples, the newest kept (the read, section 1d);
   the clock only times the hold. The browser gives neither Steam's reads nor Steam's capture: the page's
   worklet gathers the context's 128-frame quanta into blocks of a fiftieth of a second at the context's rate
   and posts them to the worker, which gets them when the browser schedules it, several at once after a
   stall. Those arrival times are the browser's and this PC's; taken as reads they would make every chunk
   480 samples (a 20 ms gate, which Steam's is not), and the same recording would gate differently on each
   run, which the project's rule on determinism forbids. So: **the live chain counts time in the 24 kHz
   samples it has pushed to the sender** (sample `n` is at `n / 24000` s from the chain's start), and the
   sender's seeded clock (W3-16) draws the reads and the capture's steps on that time, exactly as in a
   render. The wall clock is not read anywhere. What stands for the sender's PC is the model: 750-sample
   capture steps up to 13 ms late, reads 48.0 to 63.7 ms apart.
3. **The key is Steam's, in the sender and the stream.** Push-to-talk follows the read and Set J (item 4).
   It adds calls to `steam-sender.js` and to `createSteamStream`; a render never makes them, and no golden
   hash moves.
4. **`null` and `undefined` mean the same threshold everywhere:** the profile's own.
5. **The uptime setting is the render's.** W3-16 put "Sender's Steam has been running" on the page, sent as
   `steamUptime` in `renderOptions()`. The live monitor's options are `renderOptions()` plus `lowLatency`
   (`live.js`), so the value already reaches the worker; the live chain passes it to the sender through
   `steamSenderOptions`. No second control.
6. **`steam_48`, the CELT and Speex profiles, and `steam` with the codec bypassed keep the frame queue**,
   bit for bit but for item 6's reading of a `null` threshold.

### What to build

1. **The live chain** (`createLiveChain`, `steam`, codec on). The stages, each the render's own function
   where one exists (`steamCapture`, `steamSenderOptions`, `steamTimeline`, `createSteamStream`; W3-11a's
   report names them):
   - **Capture.** As now up to the capture roll-off (mic gain, the clip, `streamResampleSinc` to 24 kHz, the
     optional filters, the roll-off as a causal FIR), **with each causal FIR's delay dropped from the front
     of its output**, as `firStage` drops it in `createRender`: the sender must be given the samples a render
     gives it, at the same positions, or its clock cuts other chunks. The dropped delay stays in
     `contentDelay` and `latencyMs`. Then `q = steamCapture(x)` and `sender.push(q)`; the encoder is given
     `q / 32768` (inside `createSteamStream`).
   - **The sender**: `createSender(steamSenderOptions(opts, gateOn, seed).sender)` with the chain's seed
     (`opts.seed`, default `0xC0FFEE`, as the render's) and `opts.steamUptime`. The gate off is the sender's
     `gate: false`.
   - **The network**: `streamLossMask`, one draw per frame by the sender's frame number, as `createRender`
     draws it.
   - **The codec and the receiver**: each message through `createSteamStream().message(msg, miss)`; its
     `pcm` (when not empty) through the chain's one resampler as one `packet()`; the result, as 16-bit
     values over 32768, through the chain's one gain (`createGain`, reset once, when the chain is made), a
     silence record's zeros included and a late frame's span left out, and laid: all of it `steamTimeline`,
     as `createRender` calls it. With `agc` off the laid signal is scaled and clipped as the render's stage 4
     does.
   - **What is given out.** After each block the chain gives out the voice-rate samples up to
     `round((P - REACH - lookahead) x 147 / 80)`, `P` the samples pushed to the sender so far and `REACH` the
     render's `STEAM_REACH` (4650: the longest chunk, 2250, and the pre-roll, 2400), and no further. Between
     spurts they are zeros. **A laid sample that falls before what was already given out is dropped and
     counted** (`stats.droppedLate`): the render lays it, the live chain cannot take sound back. With the
     full reach that happens only where a gap of more than 10 lost frames closed up by more than the reach
     allows (W3-11a point 6: the sound after such a gap comes earlier), about 16 lost frames in a row.
   - **Low-latency mode** (`opts.lowLatency`): the reach is the longest chunk alone (2250). The sender, the
     encoder and the decoder run exactly as before, pre-roll included, so every later sample of the spurt is
     the render's; the pre-roll's samples that fall before what was given out are dropped by the rule above.
     (The first version suggested keeping the sender's `past` empty: the sender then sends 2400 zeros in
     their place, which changes the codec's state and gains nothing.)
   - **After the mix point** the stages are the live chain's as they stand (the mixer's rate, the listener's
     low-pass, the output FIR, `volume`, the conversion to the context's rate, the limiter): W3-10 and W3-17d
     change them, not this part.
   - **What the chain reports.** `contentDelay` and `stats.latencyMs`: the dropped FIR delays, the codec's
     lookahead, the reach and the later stages' delays; about 205 ms, and about 105 ms in low-latency mode
     (today 132 and 12; say the figures in the report). `frameSize` 480, `frameSeconds` 0.02.
     `takeFrameCodes()` gives the 20 ms slots that became final since the last call, by what was laid, as the
     render's frame log has them (`steamTimeline` marks them); `live-worker.js`'s line that places slot `k`
     follows the render's slot rule (slot `i` covers codec samples from `480 i - lookahead`). `stats`:
     `frames` and `sent` count slots and slots not gated; **`lost` counts concealed blocks that were played**
     (as the render's `lostFrames` counts concealed slots since W3-11a: a gap's frames past the tenth and
     frames lost at a spurt's end are not played and not counted); `late` the late blocks; new:
     `notCollected`, `emptyPackets`, `overTwelve`, `droppedLate` (items 4 and 5). `gateDb` is -40 for Steam's
     own, the typed number otherwise, `null` with the gate off.
   - **A settings change rebuilds the chain**, as now (`live-worker.js`, `configure`): the new chain starts
     with a silent sender, a new decoder, a resampler that has not flushed and a reset gain. That is the
     app's own (in the game the receiver's settings are read when a channel is assigned), it is not changed
     here, and the comment says so.
2. **Checks 3f and [10b] are rewritten** (W3-11a moved both off `steam`): see "The builder runs".
3. **`tests/speex102.verify.mjs`** renders `steam` through the live chain: its sandbox loads
   `steam-sender.js` and `vendor/swresample/swresample.js` as the other suites' loaders do. Any other suite
   that makes a `steam` live chain: the same.
4. **The key** (`setTalking`, the live monitor's push-to-talk). Today a frame captured with the key up is
   never sent. Steam does this (W3-09 "Key down and key up"; the read, section 1e and its pseudo-code;
   measured where said):

   | Event | What Steam does | Basis |
   | --- | --- | --- |
   | Key up | `stopF = nowF`: the float time of the last frame, not a new reading. `stopD = T()`: a double. Nothing else: reads go on | read |
   | Each read while `stopF` is not 0 | first: if `nowF > fround(stopF + 0.5)` (floats, strictly greater), `stopF = 0` and, the key still up, the device stops: this read and the ones after it do nothing | read |
   | The game's queue | a chunk's message is taken for the game until a read's time, in doubles, is past `stopD + 0.5`; the order of the take and the test within a frame is the read's pseudo-code | read |
   | So there are two tails | the game is fed for an exact 0.5 s; the device and the gate run for 0.5 s on the float clock, up to one float step longer (62.5 ms at the default uptime, 125 ms at two weeks, 250 ms at a month). A message made in between is made (the encoder moves on, its numbers are spent, the gate's state moves, a spurt can end there) and never collected | read; the consequence inferred |
   | Key down inside the float tail | `stopF = 0`; nothing is reset; taking goes on from the next read | read |
   | Key down after the device stopped | the encoder is reset and the kept samples (the part of a frame in hand) are dropped. **Not reset: the sequence number, the gate's state and its noted time.** The device starts | read; measured twice (Set J) |
   | The first read after that | with a microphone it usually finds no capture step yet. An empty read runs the states (W3-16): hanging or active with the hold long past, it sends **the end marker alone: the empty packet** of finding 25, and the next inactive chunk goes out as a silence record; ended, it clears the record; silent, nothing | read; the packet seen in Set G |
   | A spurt left open | if the first read after a press does not end it (the hold has not run out, or the read brings an active chunk), **the spurt goes on**: no marker, numbers running on, the new encoder's packets into the old decoder | measured (Set J, both clips) |
   | The decoder | outlives key presses and channels; only a delivered end marker, or a number behind the expected one, resets it. Numbers that ran on over frames it never got are a gap: at most 10 concealed | measured (Set J as one session); read |

   **In the sender** (`steam-sender.js`; W3-16's builder: "`nowF` is per read in `nextRead()`; a tail test
   belongs beside it"): a new call `key(down)` returning `{ messages, reset }`, and one new field on a
   message, `collected` (false when the game would not have taken it; left out otherwise). The rules above,
   with these readings for a sender that takes each read as soon as its chunk's samples are in:
   - a key change takes effect **between two reads**: after every read already taken from what was pushed,
     before the next. (A read is taken up to 108 ms before its own time on the model's clock, so a change can
     land up to two reads late on that clock. It is deterministic, the page passes a key within about a
     block, and the comment says so.) `stopF` is the `nowF` of the last read taken; `stopD` is that read's
     time before the narrowing (`uptime + time`, a double);
   - while the device is stopped, pushed samples are counted and not captured, so every `start` stays a
     position in the chain's input; the clock's reads run on, and the sender takes and discards each one
     whose `since` is at or before the time pushed (a read then draws as usual and does nothing). So the
     first read after a press falls 0 to 63.7 ms after it, as Steam's next frame does;
   - at a press after a stop, `reset` is true, `kept` is emptied, and the capture's steps count from the
     press: step `k` holds the samples from the press's position on, 750 at a time, and is ready
     `(k + 1) x 0.03125 + 0.013 x B()` s after the press (**a model: where a restarted device's steps fall
     was not measured; one named constant, flagged in the report**). The seeded clock gains what that needs
     (a `restart(since)` of its capture, or the like); a supplied clock gives its reads as it likes, so a
     test scripts "the first read after the press brings nothing";
   - the gate's buffer of past sound is part of the gate's state and is kept across a stop, so an onset in
     the first chunk after a press takes its pre-roll from the last sound captured before the stop
     (**inferred from what the reads list as reset; not seen in a recording: say so in the comment and the
     report**);
   - `push`, `finish`, `info` and every message of a sender whose `key` is never called are unchanged
     (`tests/steam-sender.verify.mjs` passes as it stands, and the golden hashes hold).

   **In the stream** (`createSteamStream`, `opus-codec.mjs`): today a spurt's first message makes a new
   encoder and a new decoder together, and an end marker frees both, so it cannot say "a new encoder, the
   old decoder", nor "made, not delivered" (W3-11a's second reader, note 8). The sender's side and the
   receiver's are separated:
   - the encoder and the frame numbers are the sender's: a new encoder and number 0 after each end marker
     made, **and a new encoder with the numbers running on at `press()`** (a new call);
   - the decoder is the receiver's: one `createSteamDecoder` for the stream's life, reset by a **delivered**
     end marker (`end()`) or by a number behind the expected one, never by `press()`;
   - a message with `collected: false` is encoded frame by frame (the mask still draws for its frames, so a
     frame's fate depends on its number alone) and nothing of it reaches the decoder, the resampler or the
     gain: its frames count toward the next gap as `lost()` counts them, its end marker resets no decoder,
     its silence record gives no zeros;
   - for a render (no `press()`, every message collected) each message's `pcm` and `blocks` are what they
     are on main: a decoder reset is a new decoder (`createSteamDecoder`'s `reset` makes one).

   **In the live chain:** `setTalking(on)` calls `sender.key(on)` at the next block's first sample, handles
   the messages it returns in order, and calls `stream.press()` when `reset` is true. A chain made with the
   key down is a render's start (the device running, the gate silent). `setTalking(false)` before the first
   block is a chain whose device never started. `stats.notCollected` counts frames made and not collected;
   `stats.emptyPackets` the end markers sent alone.
5. **The two limits a key can reach, named** (W3-16's order, "The decoder's 17-frame cut: not here"; the
   read, section 3). One record's 24 kHz buffer holds 17 frames; the game refuses whole a message that comes
   to more than 12 frames at 44.1 kHz. With the key, numbers can run on over frames never collected. Under
   the model's clock a chunk is at most 2250 samples, so a message after such a gap is at most 10 concealed
   and 6 decoded: **the 17-frame cut cannot be reached here either** (a comment says why; the cut itself is
   W3-02g's, in `createSteamDecoder`'s caller). **The 12-frame refusal can be**: at "about a month" the
   float tail runs up to 250 ms past the exact one, 8 or more frames. The refusal is the receiver's and is
   W3-02c's; here the live chain plays such a message and counts it (`stats.overTwelve`), and the report
   gives the count for a scripted case.
6. **The threshold, in the engine.** One helper in `audio.js` reads `opts.gateThresholdDb` for the frame
   gate's three readers (`process()`, `createRender`, `createLiveChain`): `null`, `undefined`, `''` and
   anything that is not a finite number give the profile's own; a finite number is clamped to -90..0 as now.
   (Today `finiteOr(null, ...)` is 0 dBFS in all three, and W3-11a's `steamSenderOptions` already reads
   `null` as Steam's own: they now agree.) Show first that no golden hash moves.
7. **The threshold control** (`#vad_threshold`, `voice_vad_threshold`). **An untouched control must give
   Steam's gate exactly.**
   - Its meaning depends on the profile, and its help and title say so: for `steam`, "the mean of |x| over a
     capture chunk, in dBFS; Steam's own is -40 (1% of full scale); a sine opens at -39.1 dBFS RMS"; for the
     others, "20 ms frame RMS in dBFS (-39.5)".
   - Its default is the profile's own: -40 for `steam`, -39.5 for the others. When the codec changes and the
     control holds the old profile's default, it takes the new one's.
   - `app/render.js` leaves `gateThresholdDb` out (`undefined`) when the control holds the profile's default
     and sends the number otherwise, for every profile (this replaces W3-11a's line). So Steam's 327.67 is
     never recomputed from a typed -40, and a batch's key does not change at a default.
   - A saved setting of -39.5 with the `steam` profile reads as the default (-40).
   - **One step of difference at a typed threshold is accepted.** The sender compares the mean in doubles;
     Steam forms a 32-bit float percentage and compares that. At Steam's own number no chunk the sender can
     see differs (W3-02b's review tried every sum within 50 of the threshold); at a typed one a chunk
     exactly on the line can open here and not in Steam. The help text need not say it.
   - Every place that carries the old default, to change or to check (line numbers as on main before W3-16;
     find them again): `index.html` (the input's `value`, about line 143), `app/render.js` (about line 143),
     `app/console.js` (the help at about line 303, the read at 466, the reset command at 535), `app/core.js`
     (the saved-settings fields and the presets, if they name it), `README.md`, `tests/browser.verify.js`
     (about line 1240 expects `-39.5`). Not changed: `audio.js`'s `DEFAULT_SENDER_GATE`, `app/realtake.js`,
     `reference.js`, `tests/retiming.mjs`, `tests/LEGACY_CODECS.md`, `tests/predictions/` (they are the frame
     model, which the other profiles and the take tools keep). One thing follows and is said in the
     control's help for `steam`: `app/realtake.js` hands a typed threshold to the real-take check as a 20 ms
     RMS level, so with `steam` and a typed number the check's own gate sits about 1 dB from the render's (a
     sine's mean of |x| is 0.9 dB under its RMS). At the default nothing is typed and nothing is off.
8. **The words.**
   - The chain strip's Gate cell and the console's lines for `steam`: "chunks · 100 ms kept · 0.4 s hold" in
     place of the frame counts.
   - Wherever the page shows a render's `lostFrames` or the live `lost` count for `steam` (`app/render.js`
     about line 249, `app/netgraph.js`, `live.js` about line 210): "concealed", not "lost"; the render's
     console line adds that frames lost at a spurt's end are not played.
   - The live monitor's push-to-talk note: speech goes on being sent for 0.5 s after the key is released.
   - `steam_48`'s label and README row gain "not the game's path: the 20 ms frame gate and the app's own
     resampler".
   - `README.md`: the gate paragraph (it still describes the 20 ms frame gate), the settings table, the
     live monitor's paragraph (one path with the render; the key), "Files and licensing" if a hash is
     quoted; the limits say that the packets' clock is a model.
   - `constants.js`: the `steam` profile's comment no longer says the live chain uses the three frame-gate
     numbers; they stay for the take tools.
   - `tests/REFERENCE_2026.md`: only "the app today" where this build makes it untrue, in a commit of its
     own: the live-chain clauses of the Model table's rows Capture, Voice gate, Codec, Decoder's resampler,
     Auto-gain and Network, its "Not built" line, and the last lines of finding 28's and finding 29's "The
     app today". No finding's evidence is touched.
9. `sw.js`: raise `CACHE` by one. `tests/predictions/PREDICTIONS.md`: a dated note (`audio.js`,
   `opus-codec.mjs` and `steam-sender.js` changed again; no render moved: the golden hashes).

### The builder runs

`pnpm test`, `pnpm test:vendor`, the browser suite under the heavy lock, CI on the pushed branch. Each new
check fails when its line is broken; the builder says how, and at least the mutations of the table are tried
in a scratch copy.

- **No golden hash moves**, shown before any new expectation is recorded: `node
  tests/render-stream.verify.mjs --hashes` against main's, all cases.
- **`tests/steam-sender.verify.mjs` passes unchanged**, then gains the key's checks, on a supplied clock at
  `uptime: 0` unless said (times as W3-16's float table gives them):
  - key up at a read, then reads 100 ms apart: messages are collected through the one the read's pseudo-code
    takes last and not after; the device stops at the first read with `nowF > fround(stopF + 0.5)` and later
    reads make nothing; at `uptime` 3110400 (a step of 1/4 s) at least one message lies between the two
    tails, with `collected: false`;
  - a spurt that ends between the two tails: its end message is `collected: false`;
  - key down inside the float tail: `reset` false, `kept` kept, taking resumes;
  - key down after the stop, the first read empty, the hold long past, the state hanging: one message, the
    end marker alone, then a silence record on the next inactive chunk; the same from the active state;
    from the ended state no record; from the silent state nothing;
  - key down after the stop within the hold, the first read empty, then an active chunk: no end marker, the
    spurt's frame numbers run on from where the last made frame left them, `reset` true, the first frame
    cut from the chunk alone;
  - samples pushed while stopped appear in no message, and a later spurt's `start` is its position in all
    the samples pushed;
  - the seeded clock: after a press the first chunk's first sample is the press's position; over seeds 1 to
    200 the first read after a press is empty in more than half (the report gives the share);
  - determinism: the same pushes and key changes give the same messages twice.
- **`tests/opus.verify.mjs`**: the stream with a `press()` in mid-spurt equals, by hand, a new encoder's
  packets given to the decoder that decoded the frames before it, and differs from a new decoder's output in
  the first frame after the press; five frames `collected: false` then a collected one give five concealed
  blocks and the frame; fifteen give ten; an uncollected end marker then a new spurt's frame 0 gives a reset
  and nothing concealed; without any of these the stream's output equals main's on the suite's existing
  cases (recorded hashes, made on main first).
- **`tests/verify.js` [10b]**, back on `steam`:
  - **the live chain is the render:** a 24 kHz speech-like source of 20 s, in blocks of 128, 480 and 4,096
    samples and one plan of seeded uneven sizes; through a test hook (`opts.onGain`, as the render's) the
    laid signal the live chain gives out equals `createRender`'s for the same options and seed, sample for
    sample, over everything given out, and `codecInfo`-style counts agree (`sender.spurts`, the resampler's
    calls); with a 48 kHz source the same (the capture's stages in front);
  - the same with `lossPct` 15 and jitter; with the gate off; with `steamUptime` 14400 and 3110400; with a
    typed threshold of -46; with `agc` off;
  - `gateThresholdDb: null` and `undefined` give the same output, for `steam` and for `celt_22` with the
    gate on;
  - low-latency mode: `latencyMs` is lower by the pre-roll's 100 ms; the output equals the full-reach
    output from each spurt's first given-out sample on, and `droppedLate` is at most 2400 a spurt in
    24 kHz terms;
  - the key: with a scripted key (up at 2 s inside speech, down at 2.3 s; up at 6 s, down at 7.5 s inside
    speech), sound goes on for 0.5 s after each release and no longer than 0.5 s and one float step; the
    second press gives `emptyPackets` 1; at `steamUptime` 3110400 a scripted case gives `notCollected` above
    0 and the next delivered frame is preceded by `min(gap, 10)` concealed blocks;
  - the whole chain against a render of the same audio, as [10b] has it for `steam_48` today (level and
    waveform once the chain's delay is allowed for), on `steam`; `steam_48`'s live output is bit for bit
    main's (a recorded hash, made on main first).
- **The browser suite.** A fresh page shows -40 and a render's `codecInfo.sender.meanMin` is exactly 327.67;
  switching to a CELT profile shows -39.5 and back shows -40; typing -46 gives `meanMin` of
  `32767 x 10^(-46/20)`; a saved -39.5 under `steam` restores as -40; the reset command restores the
  profile's default; the Gate cell's text; `steam_48`'s label. **Check 3f, rewritten:** the live take against
  an offline render of the recorded microphone, on `steam`: both paths now carry Steam's resampler (27.9 to
  29.9 samples late, by where its stream stood), so `|lag| <= 2 k` samples, `k = rate / 44100`, and
  `r > 0.8`; if sixty seeded takes simulated as W3-11a's builder did show a lower floor, the bound is their
  tenth percentile less 0.05, with the table in the report. `steam_48` keeps `|lag| <= 1` and `r > 0.8`.
  The live checks that rest on the frame gate are restated: "frames sent" (slots not gated); the latency
  window (about 205 ms; in low-latency mode about 105, no longer under 20); push-to-talk (nothing is sent
  from 0.5 s and one float step after the key is up: the check waits 800 ms before its first count, where it
  waited 400). The W3-16 choice changes the live chain too: the same clip at "since today" and "about a
  month" gives another `stats.sent`.
- **Mutations**, each caught by the named check:

  | Mutation | Caught by |
  | --- | --- |
  | the capture FIR's delay not dropped before the sender | [10b] "the live chain is the render" (the spurts' starts differ) |
  | the capture not rounded, or rounded half up | the same check, a sample differs; 3f does not see it |
  | the live chain's own seed, or `steamUptime` not passed | the same check; the 14400 and 3110400 cases |
  | the float decode, or the app's sinc resampler, left in the live chain | the same check |
  | the resampler made anew at each spurt, or at a press | the same check; `opus.verify`'s press case |
  | the gain fed the laid signal, or reset at a spurt | the same check, with `agc` on |
  | given out past the reach | [10b] throws or differs at chunk plan 128 (a packet lands on samples given out) |
  | `null` read as 0 dBFS | [10b] `null` against `undefined` |
  | the float tail in doubles, or `>=` | the sender's key checks at `uptime` 3110400 |
  | the exact tail on the float clock | the same: no message between the two tails |
  | a press resets the sequence number, or the gate's state | the sender's "the spurt goes on" check |
  | a press does not drop `kept` | the same: the first frame after the press |
  | a press resets the decoder | `opus.verify`'s press case |
  | an uncollected frame given to the decoder, or not counted toward the gap | `opus.verify`'s five and fifteen |
  | an empty read after a press skipped | the sender's empty-packet check; [10b] `emptyPackets` |
  | samples captured while the device is stopped | the sender's "appear in no message" |
  | `lost` counting the mask's lost frames | [10b] loss case: `stats.lost` equals the render's `lostFrames` |
  | the page sends -40 as a number at the default | browser: `meanMin` exactly 327.67 |

- Screenshots (desktop and phone) of the control and the chain strip, and the live monitor running, in the
  report. The report also gives: the chain's latency figures before and after; the live worker's cost for a
  minute of speech (the resampler's port makes about 5 million samples a second; the chain needs 44,100);
  the share of first reads after a press that are empty; every reading made of the key's rules.

**The orchestrator runs privately:** nothing new is needed for the merge. If time allows, Set J's two clips as
one session through the branch's stream with `press()` at each key press and the uncollected frames marked:
W3-11a's second reader got 524,256 of 524,288 on the gate clip with the 17-frame cut applied by hand; the
stream as built here should give the same figure the same way, and a lower one would point at `press()`.

### Files

May touch: `audio.js` (`createLiveChain`; the threshold helper and its three callers; what `steamTimeline`
or the stream stages need to be shared, with no change to a render's samples), `opus-codec.mjs`
(`createSteamStream`, `createSteamDecoder` only), `steam-sender.js` (`key`, the `collected` field, the
clock's restart; nothing a render reaches), `live.js`, `live-worker.js`, `index.html`, `app/console.js`,
`app/core.js`, `app/render.js`, `app/netgraph.js`, `constants.js` (the `steam` profile's comment and
`steam_48`'s `displayName`), `README.md`, `sw.js`, `tests/verify.js`, `tests/steam-sender.verify.mjs`,
`tests/opus.verify.mjs`, `tests/speex102.verify.mjs` (its loader), `tests/browser.verify.js`,
`tests/predictions/PREDICTIONS.md`, `tests/REFERENCE_2026.md` (item 8's lines only). May not touch:
`process()` and `createRender` beyond the threshold helper, `voice-channel.js`, `vendor/`, `demo.js`,
`reference.js`, `app/realtake.js`, `tests/render-stream.verify.mjs` (its hashes are the proof),
`tests/accuracy.mjs`, `tests/predictions/predictions.json`, `docs/PROGRESS.json`.

### Stop and ask

- If a golden hash moves, or `tests/steam-sender.verify.mjs` needs a changed expectation for a sender whose
  `key` is never called.
- If the live chain cannot equal `createRender` at the mix point with the key held (give the first sample
  that differs and the stage it comes from).
- If the read's pseudo-code and this part's table disagree about an order of tests within a frame: the read
  wins; say where.
- If the two days run out with items 1 to 3 and 6 to 9 done and the key (items 4 and 5) not: stop there and
  report. The key then keeps today's rule on the new path (samples with the key up are not pushed, and a
  release cuts the spurt), and the orchestrator orders the key as a part of its own.

## Not in this order

The game's timeline (W3-02c), and with it the channel a message opens, the gain's reset at a channel's
assignment and the game's refusal of a message over 12 frames. The decoder's 17-frame cut (W3-02g). Steam's
`voice_preprocess`. The capture roll-off, which W3-09 found to be Windows's resampler and stays as measured.
A 48 kHz sender for `steam_48`. Loss that falls on whole messages (`docs/reports/W3-11-plan.md`, "Open"). The
tie between Steam's reads and the game's tick (measured in Set J, not explained). The live chain's stages
after the mix point (W3-10, W3-17d).
