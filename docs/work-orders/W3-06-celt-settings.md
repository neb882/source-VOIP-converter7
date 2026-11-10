# W3-06: the engine codecs' settings, as the game's own module has them

**Branch:** `claude/w3-06-celt-settings`, from `main` **after W2-02 has merged** (its golden hashes cover the two
CELT profiles, which this order changes). **Worktree:** given in the brief. **Agent:** `tf-builder` (effort
high), then `tf-reviewer`. **Time budget:** 4 hours. **May run beside** W3-02a (no shared files beyond
`package.json`, which this order does not need to touch). Not beside W3-02b or W3-05 (`audio.js`,
`tests/render-stream.verify.mjs`).

## Why

W3-03 read the owner's `vaudio_celt.dll` and the engine's `Voice_Init`
(`docs/reports/W3-03-engine-binary.md`, sections 5 and 6):

- **Complexity.** The game's codec class never sets the encoder's complexity, so the library's default applies:
  **5**. The app's two CELT profiles run 10, which is what two third-party server plug-ins set.
- **`vaudio_celt_high`.** The module has a table of five settings; the engine asks for the row
  **44100 Hz, 1024-sample frames, 128-byte packets**, and then **feeds that codec 22050 Hz sound** (the voice rate
  is 22050 for every codec but Steam and Speex). So a frame lasts 46.4 ms, 128 bytes a frame is 22.05 kbps in
  real time, and nothing above 11 kHz exists. The app's `celt_44` (44100 Hz sound, 256-sample frames, 120-byte
  packets, 165 kbps) is another row of that table, which the engine never selects.
- **Speex.** The engine asks a `vaudio_speex` module for **quality 3** and runs it at **11025 Hz**. The module is
  not shipped, so its frame and packet sizes cannot be read. The app's profile assumes quality 4 at 8000 Hz.

The bundled CELT 0.11 accepts the game's mode: `createCodec(44100, 1024, { packetBytes: 128, complexity: 5 })`
codes and decodes (checked by the planner; its overlap is 128 samples).

## Files

May touch: `constants.js` (`CODEC_PROFILES.celt_22`, `.celt_44`, `.speex`, their comments, the header comment),
`opus-codec.mjs` (`celtRoundTrip`, `createCeltStream`: a mode rate), `audio.js` (only the two places that call
them, in `process()` and `createLiveChain`, and the one in `createRender`), `demo.js` (`LEGACY`), `index.html`
(the codec menu's labels), `app/console.js` (`sv_voicecodec`'s help, if it names sizes), `README.md` (the profile
table), `tests/LEGACY_CODECS.md`, `tests/predictions/PREDICTIONS.md` (a note), `tests/verify.js`,
`tests/opus.verify.mjs`, `tests/speex.verify.mjs`, `tests/demo.verify.mjs`, `tests/render-stream.verify.mjs`
(golden hashes of the CELT cases), `tests/browser.verify.js` (labels), `sw.js` (the cache version). May not touch:
`vendor/` (the pinned builds), `tests/predictions/predictions.json` and `plan.json`, `reference.js`,
`tests/REFERENCE_2026.md`, `docs/PROGRESS.json`.

## Spec

1. **`celt_22`:** `complexity: 5`. Nothing else. Comment and README: 22050 Hz, 512-sample frames, 64-byte
   packets, complexity 5, "read from the game's module (W3-03)"; its status stays `modeled` (no take yet).
2. **`celt_44`** (the key stays, so saved settings and `plan.json` keep working): `codecRate: 22050`,
   `modeRate: 44100`, `frameSize: 1024`, `packetBytes: 128`, `complexity: 5`, `bitrate: 22050`,
   `voiceRate: 22050`, `mixer: 'linear'`, display name "vaudio_celt_high (CELT 0.11, 44.1 kHz mode on 22 kHz
   sound, 128-byte frames)". `modeRate` is the rate the CELT mode is created with; it is passed through
   `audio.js` to `celtRoundTrip` and `createCeltStream` as `options.modeRate`, which give it to `createCodec` in
   place of the sample rate; everything else (frame times, the bitrate they report, the gate's frame counts, the
   loss model) keeps using the real rate, 22050. A profile without `modeRate` behaves as now.
3. **`demo.js`:** `LEGACY.vaudio_celt_high` becomes `{ rate: 22050, modeRate: 44100, frame: 1024, bytes: 128 }`,
   and `decode` creates the codec with the mode rate. A demo recorded under `vaudio_celt_high` was unreadable
   as sound before this (wrong packet size); say so in the report.
4. **Speex:** the profile asks for quality 3 explicitly (`quality: 3` in the profile, passed where
   `speexRoundTrip` and `createSpeexStream` are called, taking precedence over the bitrate lookup only when
   `snd_bits` is 16). Speex's narrowband qualities 3 and 4 are the same 8 kbps mode, so the packets should not
   change: `tests/speex.verify.mjs` asserts that a 2 s signal encodes to identical packets at qualities 3 and 4.
   **If they differ, stop and report** before changing the profile. The 11025 Hz question (does the missing module
   run narrowband Speex on 11025 Hz samples as if they were 8000 Hz, or resample?) is not settled by anything in
   the owner's files: the profile keeps 8000 Hz, and its comment, README's row and `tests/LEGACY_CODECS.md` say
   what the engine asks for, that the module is not shipped, and that the profile is therefore unverified. The
   menu label gets "(unverified)".
5. **Labels.** The codec menu: "vaudio_celt (CELT 0.11, 22 kHz, 22 kbps)" stays; `celt_44` becomes
   "vaudio_celt_high (CELT 0.11, 44 kHz mode, 22 kbps, unconfirmed by a take)". README's table and
   `tests/LEGACY_CODECS.md` are rewritten for the two CELT rows from W3-03's section 5 (the table of five
   settings, which row each codec selects, complexity 5, and that the public sources' 256/120 is row 0), keeping
   what is still true (CELT 0.11, the receiver modelled not measured). The game's help text ("44kHz, 44kbps") is
   quoted with the explanation: 44.1 kbps is what 128 bytes per 1024 samples would be at 44.1 kHz.
6. **`tests/predictions/PREDICTIONS.md`:** one dated paragraph in the style of the last two. It says: `constants.js`,
   `opus-codec.mjs`, `audio.js` and `demo.js` changed after registration; **P1** was rendered at complexity 10 and
   the game runs 5, which moves no gate decision and no clamp, so both P1 hypotheses stand as registered (give the
   measured change in the P1 segments' levels between complexity 10 and 5 from a render of the test signal:
   expected under 0.5 dB on every scored segment; quote the largest); **P2**'s two hypotheses are both settings the
   engine never selects (256-sample frames at 44.1 kHz with 120 or 32 bytes), so the registered prediction is
   expected to fail at the top of the band when its take is recorded: the game should show nothing above 11 kHz
   and, under loss, gaps in units of 46 ms. The predictions are never re-rendered and are scored as registered;
   the scorer's alignment render uses today's profile, which changes how a P2 take is lined up and no registered
   value. Whether a new prediction for `vaudio_celt_high` is registered before the take is the orchestrator's
   call; this order registers nothing.

## Done means

- `pnpm test` passes, with:
  - `tests/opus.verify.mjs`: `celtRoundTrip` with `modeRate` 44100, frame 1024, 128 bytes on a 22050 Hz signal
    returns 128-byte packets, `frameMs` 46.4 and a reported bitrate of 22050; a 9 kHz tone at 22050 Hz survives
    it and the render of `celt_44` has no energy above 11 kHz at the 44.1 kHz mixer beyond the linear mixer's
    images (state the figure); without `modeRate` the call is bit for bit what it was (the existing checks).
  - `tests/verify.js`: the profile table's expectations (`celt_44`: `['celt', 22050]`), and complexity 5 reaching
    the codec (`codecInfo.complexity`).
  - `tests/demo.verify.mjs`: a synthetic `vaudio_celt_high` demo (128-byte packets) decodes to the tone it was
    made from; the `vaudio_celt` case is unchanged.
  - `tests/speex.verify.mjs`: the identical-packets check of point 4.
  - Each new check fails when its line is broken; say how (at least: `modeRate` not passed on; complexity left
    at 10; the demo table's packet size left at 120).
- **Golden hashes:** the `celt_22` and `celt_44` cases of `tests/render-stream.verify.mjs` are re-recorded in a
  commit of their own that says why; every other hash is unchanged, and `createRender` equals `process()` on all.
- The browser suite passes (the menu's labels; a render with each CELT profile; the live chain with `celt_44`).
- CI passes on the pushed branch.
- The report gives the P1 figure of point 6 and a spectrum line for `celt_44` before and after (band edge, level
  at 5 and 10 kHz for pink noise), so the page's claim can be read against a future take.

## Stop and ask

- If the bundled CELT rejects the game's mode in the browser build (it did not under Node).
- If Speex's qualities 3 and 4 give different packets.
