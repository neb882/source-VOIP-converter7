# W1-01: the `speex` profile runs real Speex

**Branch:** `claude/w1-01-speex`, from `main`. **Worktree:** given in the brief. **Agent:** `tf-builder`, then
`tf-reviewer`. May push its branch to run CI. **Time budget:** 4 hours.

## Why

README says "Every profile runs a real codec; nothing is a hand-made approximation", yet `speex` runs Opus SILK at
8 kHz as a stand-in. `vaudio_speex` was TF2's voice codec for most of the game's history, so it is the sound most
people remember. Speex is BSD-licensed and can be bundled exactly as CELT 0.11 was. The rule that kept it a stand-in,
"only what current TF2 can confirm", is retired (`docs/PROGRESS.json`, `retired_rules`): the profile ships as
`celt_44` does, the real codec at documented, unconfirmed settings.

## Files

May touch:
- new `tests/speex/build.mjs` (and any small C glue beside it), new `vendor/speex/` (the wasm module, `index.mjs`,
  a README and the licence)
- `opus-codec.mjs` (a Speex round trip and a Speex stream, beside the CELT ones), `audio.js` (only the two places
  that pick the codec engine, lines near `codec.engine === 'celt011'`), `constants.js` (the `speex` profile and the
  comment above the profiles)
- `sw.js` (the new files in `ASSETS`, and the cache name), `index.html` (the codec option's label),
  `app/console.js` (the `sv_voicecodec` help text, if it changes)
- `tests/vendor-opus.mjs` (the recorded hash), `tests/verify.js` (the checks that name the stand-in), a new
  `tests/speex.verify.mjs` wired into `package.json`'s `test` script, `tests/browser.verify.js` (only where the
  offline cache list or the profile is checked)
- `README.md` (the Profiles table and the paragraph under it, the Tests list), `tests/LEGACY_CODECS.md`

May not touch: `demo.js`, `video.js`, `reference.js`, `tests/predictions/`, `tests/REFERENCE_2026.md`, the other
`vendor/` folders, `docs/PROGRESS.json`.

## Spec

1. **The build.** `tests/speex/build.mjs` builds Speex to WebAssembly the way `tests/celt011/build.mjs` builds
   CELT 0.11: clang with the wasm32 target and wasm-ld, the minimal libc in `tests/libopus11`, musl's libm compiled
   in, no imports, the source cloned at a pinned commit. Use the 1.2.1 release (`https://github.com/xiph/speex`, tag
   `Speex-1.2.1`); pin its commit hash in the script. Floating-point build, narrowband only is enough. The build must
   be reproducible: running it twice gives the same bytes, and `tests/vendor-opus.mjs --check` (`pnpm test:vendor`)
   checks the vendored module against a recorded SHA-256, as it does for CELT.
2. **The module.** `vendor/speex/index.mjs` mirrors `vendor/celt-0.11/index.mjs`: an encoder and decoder pair for
   8 kHz narrowband, 160-sample frames (20 ms), with `encode(frame)`, `decode(packet)`, `conceal()` (Speex's own
   packet-loss concealment: a decode with no bits), `restart()`, `free()`, a `version` string and the `lookahead`
   the pair adds.
3. **Settings.** Source's Speex quality is not public (`tests/LEGACY_CODECS.md`). Use quality 4, the 8 kbps
   narrowband mode (20-byte frames), which keeps the profile's present bitrate; constant bitrate, no VAD, no DTX,
   the library's default complexity, the decoder's perceptual enhancement on (its default). Say plainly in the
   profile's comment, the README table and LEGACY_CODECS.md that these are assumptions, and why 8 kbps. `snd_bits`
   (the bitrate scale) picks the Speex narrowband quality whose bitrate is nearest.
4. **The chain.** The profile keeps its receiver as it is (voice at 11.025 kHz, the linear-interpolation mixer, no
   sender gate): this order changes the codec only. Offline renders (`process`) and the live chain
   (`createLiveChain`) both run it. Loss and jitter act on 20 ms frames and are concealed by Speex. The pair's delay
   is trimmed so a render keeps the source timeline, as for the other profiles. The codec lane and `net_graph` get a
   frame log and packet sizes as for CELT (use frame code 3, "CELT", only if nothing better fits; a new code is out
   of scope, so say in the report what the lane shows).
5. **Wording.** The profile's display name and the page's option say Speex, not Opus SILK. Its status is "Codec
   real; settings unconfirmed". Remove "stand-in" wherever it described this profile.

Not in this order: reading `vaudio_speex` voice from demos (its packet framing in a demo is not known), a Speex
wideband mode, any change to the receiver.

## Done means

Each with its command; run the heavy ones under `flock /tmp/tf2ve-heavy.lock`.

- `node tests/speex/build.mjs` twice gives the same module, and `pnpm test:vendor` passes with its hash recorded.
- `node tests/speex.verify.mjs` passes, and checks at least:
  - packets are 20 bytes a frame at the default setting, and the nearest quality is chosen for other `snd_bits`
  - the decoded output of a known signal correlates with it and is band-limited to under 4 kHz
  - a render keeps the source timeline: an impulse or a correlation peak within one sample at the output rate
  - a lost frame is concealed by Speex (not silence, not a repeat of the packet), and the frame log marks it
  - the same input and settings give the same samples twice
  - **the wasm build agrees with a native build**: compile the same pinned source natively with the machine's
    compiler inside the test's setup or a documented one-off script, and compare packets for a test signal. If
    they are not bit-identical, report the difference and why; do not hide it.
- `pnpm test` passes with the new suite in it, and the checks in `tests/verify.js` that named the stand-in now
  describe Speex.
- The browser suite passes (`CHROMIUM_EXECUTABLE=... node tests/browser.verify.js`), including its offline-cache
  check with the new files.
- Each new check fails when the code it covers is broken (say how you broke it).
- CI passes on the pushed branch.
- The report says what the profile sounds like next to the stand-in in numbers (band edge, level, a spectrum
  difference), so the owner knows what changed.
