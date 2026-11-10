# W3-11: the Steam profiles send and decode as Steam does

**Depends on:** W3-09's report (`docs/reports/W3-09-steam-voice.md`, sections 1 to 4, (a) and (b)); W3-02b merged
(it builds `steam-sender.js`, the gate this order wires in); W3-13 merged (the resampler module); W2-02, W3-05
and W3-06 merged, and no other `audio.js` order open. **Before W3-02c**, which takes this order's packets.
**Kind:** code. `tf-builder` (effort xhigh), then `tf-reviewer`, then a second reader on the stronger model (it
changes how a render is computed). **Branch:** `claude/w3-11-steam-gate`, from `main`. **Worktree:** given in
the brief. **Time budget:** 2 days.

## Why

The app's Steam gate works on 20 ms frames: a frame over -39.5 dBFS RMS is sent with the 6 frames before it and
the 22 after it. W3-09 read Steam's own: it gates **chunks** of the capture (31.25 to 93.75 ms) on the mean of
|x| (1.0% of full scale) or the peak (15%), keeps 2400 samples of pre-roll, holds for 0.4 s of its clock, cuts
480-sample frames from each chunk plus what was left of the last, and decodes to 16 bits before a resampler
that is called once per packet. The app's frames sit on one 20 ms grid from the start of the file; Steam's sit
on a grid of their own in each spurt.

**One gate, not two.** The offline render with the source's timeline, the stream (`createRender`), and the
game's timeline (W3-02c) must all send the same frames, or the same file would be gated two ways. So this order
does not write a gate: it calls `TF2SteamSender.createSender` (W3-02b) everywhere, and W3-02c reuses what this
order makes. That is why it is a separate order from W3-02b (which touches no app file and can start now) and
comes before W3-02c.

## What to build

1. **Loading.** `steam-sender.js` and W3-13's module are loaded wherever `audio.js` runs: `index.html`,
   `audio-worker.js`, `live-worker.js`, `sw.js` (`ASSETS`; raise `CACHE`), and the tests' loaders.
2. **The profile.** `CODEC_PROFILES.steam.senderGate` and `steam_48`'s become `{ rule: 'steam' }` with a comment
   that names W3-09; `DEFAULT_SENDER_GATE`, `prerollMs`, `holdMs` and `gatePlan`'s use for these profiles go.
   `opts.gate` (on or off) stays. `opts.gateThresholdDb` stays as the level of a sine, in dBFS RMS, that just
   opens the gate: `meanMin = 32767 x sqrt(2) x 10^(dB / 20) x 2 / pi`, default -39.09 (which is 327.67); the
   peak rule does not move. The control's help text says "mean level of a chunk; Steam's own is 1% of full
   scale". With the gate off, or for another profile, nothing in this order runs and those renders are bit for
   bit what main gives.
3. **The sender in the render** (`process()` and `createRender`, Steam profiles, codec on, gate on, no
   `opts.received`). After the capture roll-off at 24 kHz the sound is rounded to 16 bits as now and pushed to
   `createSender({ seed })` (the render's seed). For each message, in order:
   - its frames are encoded by the profile's encoder, a fresh encoder state at each spurt's first frame, the
     last frame of a spurt padded with zeros by the sender's rule;
   - the loss model decides each frame's fate as now (drawn per frame, in frame order, from the render's seed,
     so a seed's loss pattern is what it would be on main for the same number of frames);
   - the message is decoded as Steam's decoder does it: a fresh decoder state at each spurt; a lost frame is
     concealed when the next frame that arrives shows the gap, **at most 10 frames per gap** (the rest of a
     longer gap is not played at all: the sound closes up, as in the game); a frame that is the last of its
     spurt and lost is simply missing; a DTX frame is decoded as now;
   - **16 bits before the resampler:** each decoded sample becomes `round-half-even(clamp(x x 32768, -32768,
     32767))`. If the pinned module already exports libopus's own 16-bit decoder, call that instead and say so;
     do not rebuild the module (see "Stop and ask");
   - the message's samples go through W3-13's resampler as **one packet** (one resampler per render: a render is
     one speaker's session), and a silence record as that many zeros through the same resampler.
4. **The source's timeline** (the default). The packets are laid on the source's time: a spurt's first packet
   starts at `round(start x 44100 / 24000)` less the codec's delay as trimmed now, each later packet follows the
   one before with no gap, and the silence between spurts is zeros. The silence record's samples are not laid
   down (they are silence already). Where a concealment gap was cut at 10 frames the later sound moves up, as
   in the game. The gain's `decoded` function (W3-05) is true where a packet was laid.
5. **`codecInfo`.** `frameLog` and `frameBytes` stay 20 ms slots on the source's time: slot `i` takes the code
   and size of the sender's frame that covers the slot's centre, or 0. New: `codecInfo.sender = { rule:
   'steam', chunks, messages, spurts: [{ start, frames, preroll }] }`. `prerollFrames` and `holdFrames` go from
   the info; the page's texts that print them (`app/console.js`, the chain strip's Gate cell) say "chunks,
   100 ms pre-roll, 0.4 s hold". The counters keep their meaning.
6. **Complexity.** Steam leaves libopus at its default, 9; the app passes 10. W3-09 showed the pinned build
   gives the same packets at 8, 9, 10 and the default on 19,428 frames, so nothing audible depends on it. Change
   the Steam profiles to 9 all the same, so that the code says what Steam does, and keep a check that 9 and 10
   give identical packets on the suite's signals; if that check ever fails the report says so.
7. **The live chain** (`createLiveChain`) uses the same sender, fed as the microphone's blocks arrive, in place
   of its frame queue; its latency figure becomes the pre-roll (100 ms) plus one chunk. Low-latency mode keeps
   no pre-roll as now (say in the report how). It keeps its own 24 to 44.1 kHz step: the per-packet resampler is
   for renders.
8. **Texts.** README's gate paragraph and settings table, `constants.js`'s header comment, and
   `tests/predictions/PREDICTIONS.md` (one dated paragraph in the style of its last ones: the hashed files
   changed after registration; what moved; the predictions are scored as registered).

## Checks

### The builder runs

- `pnpm test` passes. `tests/verify.js` gains a section, each check failing when its line is broken (say how):
  - **The gate is the sender's:** for a seeded speech-like source, `codecInfo.sender.spurts` equals what
    `createSender` gives on the same 24 kHz samples and seed, and every coded slot of `frameLog` lies inside a
    spurt.
  - **Finding 5's cases through `process()`:** a -36 dBFS sine is sent, a -40 dBFS sine is not, -42 dB pink
    noise is not; a single click of 0.2 full scale in silence is sent (the peak rule).
  - **The pre-roll is sound:** a burst after 2 s of low noise (-50 dBFS) starts in the render 100 to 162.5 ms
    before the burst.
  - **The hold:** after a burst ends, coded slots go on for 380 to 480 ms.
  - **16 bits:** with the gain off, `volume` 1 and a 44.1 kHz source, every output sample times 32768 is an
    integer before the output stage (test at the stage's input through a hook the suite already has, or add
    one), and a source that drives the decoder past full scale gives samples at exactly the 16-bit limits.
  - **The cap:** a hand-made loss mask that loses 15 frames in a row inside a spurt gives 10 concealed frames
    and a render in which the later sound is 100 ms earlier than with 10 lost; `frameLog` marks 10 lost.
  - **One packet at a time:** the resampler is called once per message (count the calls through a test hook)
    and the render's Steam output length equals the sum of what the calls returned plus the silences.
  - **`createRender` equals `process()`** on every Steam case of `tests/render-stream.verify.mjs`, at chunk
    sizes 7, 960, 12,345 and the whole source: samples, WAV bytes, `codecInfo` deep-equal.
  - The same seed gives the same samples; another seed moves at least one spurt's `start` or one message.
  - With the gate off, and for the CELT and Speex profiles, the golden hashes do not move.
- **Golden hashes:** the Steam cases with the gate on are re-recorded in one commit of their own that says why,
  after showing the others did not move.
- The browser suite passes (the scripts load on the page and in both workers; offline; the live chain talks).
- CI passes on the pushed branch.
- The report gives, for the app's demo speech at seeds 1, 2 and 3: spurts, messages, the shares of 1, 2, 3 and
  4-frame messages, and each spurt's start and end against the old gate's (from main).

### The orchestrator runs privately

- `node tests/accuracy.mjs --takes <takes folder> --json <scratch>/after.json` under the heavy lock, before and
  after on the same main. The expected numbers are not known: **the orchestrator records them on this first
  run.** Acceptable, with the reasons: level and band figures within 0.2 dB of before below 10 kHz (the gate
  moves edges, not levels); the bands from 10.5 to 13.5 kHz may move by up to 1.5 dB (the new resampler's
  roll-off and images, W3-09 section 4) and should move **toward** the takes; the spurt count of each take
  within 1 of the take's own; the silences on the speech take longer than before by 20 to 80 ms (W3-01 found
  the old gate 50 ms short). A band below 10 kHz worse by more than 0.2 dB, or a spurt count further from the
  take's than before, holds the merge.
- Set D's demo: the render of the demo's own decoded sound (as a file, 24 kHz) against the demo's packets, with
  the orchestrator's scratch script: the model's spurts start within one chunk (62.5 ms) of the demo's in at
  least 17 of 20 and end within two chunks in at least 16 (the clock is drawn, so the final chunk can differ by
  one; W3-09 got 18 of 20 with the demo's own chunk lengths).

## Files

May touch: `audio.js`, `opus-codec.mjs` (the Steam round trip and stream take the sender's frames; `gatePlan`
stays for callers that still pass a frame gate, or goes if none do), `constants.js` (the two profiles and the
header), `index.html`, `audio-worker.js`, `live-worker.js`, `sw.js`, `app/console.js` and `app/core.js` (the
gate's texts and the threshold control's help only), `README.md`, `tests/verify.js`,
`tests/render-stream.verify.mjs`, `tests/opus.verify.mjs`, `tests/browser.verify.js`,
`tests/predictions/PREDICTIONS.md`. May not touch: `steam-sender.js`, `voice-channel.js`, W3-13's module,
`vendor/`, `demo.js`, `reference.js`, `tests/accuracy.mjs`, `tests/REFERENCE_2026.md`,
`tests/predictions/predictions.json`, `docs/PROGRESS.json`.

## Stop and ask

- If `steam-sender.js` needs a change (it is W3-02b's; say what and why).
- If the 16-bit step would need a rebuild of the pinned Opus module.
- If the decoded sound passes full scale in a way that makes "clip" doubtful: libopus's public source has its
  16-bit decoder soften peaks over full scale in a floating-point build (`docs/reports/W3-11-plan.md`, "Open").
  Build the plain clip, and report how many samples of the suite's signals it touches.
- If `createRender` cannot equal `process()` with the per-packet resampler.
- If a golden hash moves for a case with the gate off.

## Not in this order

The game's timeline (W3-02c). The key: the 0.5 s tail and the empty packet belong to push-to-talk in the live
chain and are left for a later order. Steam's `voice_preprocess`. The capture roll-off, which W3-09 found to be
Windows's resampler and stays as measured.
