# W3-06: the engine codecs' settings, as the game's own module has them

*Revised 2026-11-10 after the plan's review and after Set H (the findings and what was done about each are in
`docs/reports/W3-02-plan.md`, "The review").*

**Branch:** `claude/w3-06-celt-settings`, from `main` **after W2-02 has merged** (its golden hashes cover the two
CELT profiles, which this order changes) and when no other `audio.js` order is open. **Before W3-02g** (both
change `demo.js`). **Worktree:** given in the brief. **Agent:** `tf-builder` (effort high), then `tf-reviewer`.
**Time budget:** half a day.

## Why, and what this order does not do

W3-03 read the owner's `vaudio_celt.dll` and the engine's `Voice_Init`
(`docs/reports/W3-03-engine-binary.md`, sections 5 and 6):

- **Complexity.** The game's codec class never sets the encoder's complexity, so the library's default applies:
  **5**. The app's two CELT profiles run 10, which is what two third-party server plug-ins set.
- **`vaudio_celt_high`.** The module has a table of five settings; the engine asks for the row
  **44100 Hz, 1024-sample frames, 128-byte packets**, and then **feeds that codec 22050 Hz sound** (the voice rate
  is 22050 for every codec but Steam and Speex). So a frame lasts 46.4 ms, 128 bytes a frame is 22.05 kbps in
  real time, and the mode's 20 kHz band edge falls at 10 kHz of real sound. The app's `celt_44` (44100 Hz sound,
  256-sample frames, 120-byte packets, 165 kbps) is another row of that table, which the engine never selects.
- **Speex.** The engine passes **3** to a `vaudio_speex` module's `Init` and runs it at **11025 Hz**. That the 3
  is a Speex quality is an inference (it is the same argument that selects the CELT row). The module is not
  shipped, so its frame and packet sizes cannot be read.

**Set H has since recorded both CELT codecs** (the owner's file as the microphone, the game's own recording of
its decoded voice): `vaudio_celt` comes in 512-sample packets and `vaudio_celt_high` in 1024-sample packets, both
at 22050 Hz, as read. So the frame sizes and the rate are confirmed by a take.

**The sound is not matched yet, and this order does not make it match.** The app's bundled CELT 0.11, given Set
H's input, is only 17 to 23 dB from the game's output at every frame alignment and at complexities 0, 3, 5 and
10: so complexity is not the cause, and nothing in this order is. W3-08 is finding the cause; its preliminary
report says the game's module has CELT's pitch post-filter compiled in and the app's build has it compiled out.
Changing a bundled codec is an order of its own (CLAUDE.md, the pinned codecs), which W3-08's result will define.
This order builds the settings as read and leaves `vendor/` alone, so that the later order changes the build and
nothing else. Every text this order writes says so: the settings are the game's; the bundled build does not yet
reproduce the game's samples (Set H); W3-08 has why.

If W3-08's final report (`docs/reports/W3-08-celt-encoder.md`, when it is on main) names a complexity other than
5, or a setting this order does not have, stop and ask before building.

The bundled CELT 0.11 accepts the game's mode: `createCodec(44100, 1024, { packetBytes: 128, complexity: 5 })`
codes and decodes under Node (the planner's check; its overlap is 128 samples). The reviewer measured that mode
on 22050 Hz tones: 9 kHz comes back at +0.35 dB, 10.5 kHz at -66 dB.

## Files

May touch: `constants.js` (`CODEC_PROFILES.celt_22`, `.celt_44`, `.speex`, their comments, the header comment),
`opus-codec.mjs` (`celtRoundTrip`, `createCeltStream`: a mode rate), `audio.js` (the places that call them, in
`process()`, `createLiveChain` and `createRender`, and **`codecResultInfo`**, which rebuilds `celtRoundTrip`'s
info for `createRender` and must gain whatever field the info gains), `demo.js` (`LEGACY`, and the one line of
`decode` that creates the CELT codec), `index.html` (the codec menu's labels), `app/console.js` (the chain
strip's Codec cell, about line 489, and `sv_voicecodec`'s help if it names sizes), `README.md` (the profile
table), `tests/LEGACY_CODECS.md`, `tests/predictions/PREDICTIONS.md` (a note), `tests/verify.js`,
`tests/opus.verify.mjs`, `tests/speex.verify.mjs`, `tests/demo.verify.mjs`, `tests/render-stream.verify.mjs`
(golden hashes of the CELT cases), `tests/browser.verify.js` (labels), `sw.js` (the cache version). May not
touch: `vendor/` (the pinned builds), `tests/predictions/predictions.json` and `plan.json`, `reference.js`,
`tests/REFERENCE_2026.md`, `docs/PROGRESS.json`.

## Spec

1. **`celt_22`:** `complexity: 5`. Nothing else. Comment and README: 22050 Hz, 512-sample frames, 64-byte
   packets, complexity 5, "read from the game's module (W3-03); the packet size and rate confirmed by Set H; the
   bundled build does not yet reproduce the game's samples (W3-08)". Its status stays `modeled`.
2. **`celt_44`** (the key stays, so saved settings and `plan.json` keep working): `codecRate: 22050`,
   `modeRate: 44100`, `frameSize: 1024`, `packetBytes: 128`, `complexity: 5`, `bitrate: 22050`,
   `voiceRate: 22050`, `mixer: 'linear'`, display name "vaudio_celt_high (CELT 0.11, 44.1 kHz mode on 22 kHz
   sound, 128-byte frames)", the same comment as `celt_22` with its own numbers. `modeRate` is the rate the CELT
   mode is created with; `audio.js` passes it to `celtRoundTrip` and `createCeltStream` as `options.modeRate`,
   which give it to `createCodec` in place of the sample rate. Everything else (frame times, the bitrate they
   report, the gate's frame counts, the loss model, the lookahead) keeps using the real rate, 22050. The info
   `celtRoundTrip` returns gains `modeRate` only when the option was passed, and `codecResultInfo` in `audio.js`
   gains it the same way, so `createRender`'s `codecInfo` stays deep-equal to `process()`'s. A profile without
   `modeRate` behaves, and reports, exactly as now.
3. **The chain strip** (`app/console.js`): for a profile with `modeRate` the Codec cell reads "CELT 0.11
   44.1 kHz mode on 22.05 kHz sound · 128-byte packets of 46.4 ms"; for `celt_22` it is unchanged.
4. **`demo.js`:** `LEGACY.vaudio_celt_high` becomes `{ rate: 22050, modeRate: 44100, frame: 1024, bytes: 128 }`.
   `LEGACY.rate` stays what it is today: the speaker's sound rate, which `decode` uses for the timeline and
   returns (the engine takes the voice rate from the codec's name, W3-03 section 5; the rate in the demo's
   voice-init message is kept in `parsed.codecs` and is not used, as now). The codec is created with
   `spec.modeRate ?? spec.rate` as the first argument of `codecs.celt`, so its callers do not change. A demo
   recorded under `vaudio_celt_high` was unreadable as sound before this (wrong packet size); say so in the
   report.
5. **Speex:** the profile gets `quality: 3`, used where `speexRoundTrip` and `createSpeexStream` are called in
   place of the bitrate lookup when `snd_bits` is 16. Speex's narrowband qualities 3 and 4 are the same 8 kbps
   mode, so the packets should not change: `tests/speex.verify.mjs` asserts that a 2 s signal encodes to
   identical packets at qualities 3 and 4. **If they differ, stop and report** before changing the profile. The
   11025 Hz question (does the missing module run narrowband Speex on 11025 Hz samples as if they were 8000 Hz,
   or resample?) is not settled by anything in the owner's files: the profile keeps 8000 Hz. Its comment in
   `constants.js`, README's row and `tests/LEGACY_CODECS.md` say: the engine passes 3 to the module and runs it
   at 11025 Hz; that 3 is a Speex quality is inferred; the module is not shipped; the profile is unverified. The
   menu label gets "(unverified)".
6. **Labels.** The codec menu: "vaudio_celt (CELT 0.11, 22 kHz, 22 kbps)" stays; `celt_44` becomes
   "vaudio_celt_high (CELT 0.11, 44 kHz mode, 22 kbps)". README's table and `tests/LEGACY_CODECS.md` are
   rewritten for the two CELT rows from W3-03's section 5 (the table of five settings, which row each codec
   selects, complexity 5, and that the public sources' 256/120 is row 0), with Set H (packet sizes and rate
   confirmed; samples 17 to 23 dB from the bundled build's; W3-08). The game's help text ("44kHz, 44kbps") is
   quoted with the explanation: 44.1 kbps is what 128 bytes per 1024 samples would be at 44.1 kHz.
7. **`tests/predictions/PREDICTIONS.md`:** one dated paragraph in the style of the last two. It says:
   `constants.js`, `opus-codec.mjs`, `audio.js` and `demo.js` changed after registration. **P1** was rendered at
   complexity 10 and the game's module runs 5; give the measured change in the P1 segments' levels between 10
   and 5 from a render of the test signal (`tests/testsignal/`, generated locally) and quote the largest.
   **P2**'s two hypotheses are both settings the engine never selects (256-sample frames at 44.1 kHz with 120 or
   32 bytes): the game should show nothing above about 10 kHz and, under loss, gaps in units of 46 ms, so the
   registered prediction is expected to fail at the top of the band. Since registration the owner recorded both
   codecs with a file as the microphone (Set H; not the registered takes, which play the test signal through the
   cable): the packets are 512 and 1024 samples at 22050 Hz, and the app's CELT is 17 to 23 dB from the game's
   decoded samples for a reason W3-08 is establishing, which bears on how closely any P1 or P2 take can match.
   The predictions are never re-rendered and are scored as registered; the scorer's alignment render uses
   today's profile, which changes how a P2 take is lined up and no registered value. This order registers
   nothing new.

## The builder runs

- `pnpm test` passes, with:
  - `tests/opus.verify.mjs`: `celtRoundTrip` with `modeRate` 44100, frame 1024, 128 bytes on a 22050 Hz signal
    returns 128-byte packets, `frameMs` 46.4, a reported bitrate of 22050 and `modeRate` 44100. On 2 s sines at
    22050 Hz, level out against level in, measured over the middle second: 9 kHz within 1 dB (the reviewer
    measured +0.35); 10.5 kHz at least 40 dB down (measured -66). Without `modeRate` the call is bit for bit
    what it was (the existing checks) and its info has no `modeRate`.
  - `tests/verify.js`: the profile table's expectations (`celt_44`: `['celt', 22050]`), and complexity 5 reaching
    the codec (`codecInfo.complexity` for both CELT profiles).
  - `tests/render-stream.verify.mjs`: `createRender` equals `process()` for `celt_44`, `codecInfo.modeRate`
    included.
  - `tests/demo.verify.mjs`: a synthetic `vaudio_celt_high` demo (128-byte packets made with the 44.1 kHz mode
    from a 22050 Hz tone) decodes to the tone it was made from at 22050 Hz; the `vaudio_celt` case is unchanged.
  - `tests/speex.verify.mjs`: the identical-packets check of point 5.
  - Each new check fails when its line is broken; say how (at least: `modeRate` not passed on in one of the
    three call sites; `codecResultInfo` left without it; complexity left at 10; the demo table's packet size left
    at 120).
- **Golden hashes:** the `celt_22` and `celt_44` cases of `tests/render-stream.verify.mjs` are re-recorded in a
  commit of their own that says why; every other hash is unchanged.
- The browser suite passes (the menu's labels; the chain strip's text for `celt_44`; a render with each CELT
  profile; the live chain with `celt_44`).
- CI passes on the pushed branch.
- The report gives the P1 figure of point 7 and, for `celt_44` before and after, pink noise's level at 5 kHz
  and 9 kHz and the frequency above which nothing is left.

## The orchestrator runs privately

Nothing is required: this order's settings are confirmed by Set H's packet sizes, and its sound cannot match Set
H until the codec's build changes. For the record of where things stand, the orchestrator may repeat Set H's
comparison (the app's `celt_22` and `celt_44` coding `to-run/voice_input.wav` against `celt_gain1.wav` and
`celthigh_gain1.wav`) after the merge and note the figure in PROGRESS; expected still 17 to 23 dB.

## Stop and ask

- If the bundled CELT rejects the game's mode in the browser build (it did not under Node).
- If Speex's qualities 3 and 4 give different packets.
- If W3-08's final report contradicts a setting here.

## Amended 2026-11-10: built together with the codec's rebuild (W3-08)

W3-08 found why the app's CELT did not give the game's samples (`docs/reports/W3-08-celt-encoder.md`): the game's
module is the pinned source built with the pitch pre-filter and post-filter compiled in. This order now includes
that report's section "Changes" in full, as one change with one re-recording of the CELT hashes:

- `tests/celt011/build.mjs` builds with `-DOPUS_BUILD`; the recorded hash in `tests/vendor-opus.mjs` is replaced by
  the new build's (the report gives the expected size and hash for this toolchain; if yours differs, stop and say
  what differs before recording anything). The pinned source and commit do not change.
- `vendor/celt-0.11/index.mjs`: the reset after creation (request 8 on the encoder and the decoder), and 16-bit in
  and out with ties to even, by the route the report found to match (exported `celt_encode` and `celt_decode`).
- The profiles as this order already says (complexity 5; `celt_44` as the 1024-sample, 128-byte mode on 22050 Hz
  sound).
- `demo.js`: with the filter in, a real `vaudio_celt` packet whose filter flag is set decodes; today the bundled
  decoder refuses it. Add a check with a packet made by the new encoder from a pitched signal: it must decode, and
  must fail on the old build.
- Files this adds to the order's list: `tests/celt011/build.mjs`, `tests/celt011/api.c`, `tests/vendor-opus.mjs`,
  `vendor/celt-0.11/` (the module, `index.mjs`, its README), `sw.js` (the cache version, since a cached file
  changes).

**The orchestrator runs privately:** `node <takes folder>/checks/celt/check.mjs vendor/celt-0.11 <takes folder>`
on the pushed branch. Expected: `vaudio_celt` identical at 292,351 of 292,352 samples (largest difference 1), and
`vaudio_celt_high` at 292,789 of 292,864 (largest difference 1). Today's build gives 134,456 and 128,053.

**The builder runs:** everything else in this order, and a public check that needs no private data: the new build's
encoder and decoder reproduce hashes recorded from a native build of the same source with the same flag (as
`tests/speex.verify.mjs` does for Speex), on synthetic signals that include a pitched one, so the filter is in use.

## Amended 2026-11-10 (second): Speex leaves this order

Point 5 ("Speex"), the Speex line of the acceptance list, the stop condition on Speex's qualities 3 and 4, and
`.speex` and `tests/speex.verify.mjs` in the lists of files are **struck**. Do not touch the Speex profile, its
calls or its tests in this order. Since this order was written the module itself was read
(`docs/reports/W3-09-steam-voice.md`, section 5): it is Speex 1.0.2, the engine's 3 maps to Speex quality 4, and
the 11025 Hz sound goes into the codec with no resampling. That is built by W3-12, which replaces the profile
whole.
