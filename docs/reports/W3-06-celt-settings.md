# W3-06 report: the CELT profiles as the game's module has them, on the module's build

Branch `claude/w3-06-celt-settings`, from `main` at `1e6db07`, with `origin/main` merged in once (docs only).
Built to the order and its two amendments: the codec's rebuild from `docs/reports/W3-08-celt-encoder.md` ("Changes")
is in; Speex is untouched.

**Status: built; the orchestrator's private Set H check is still to run.** `pnpm test`, the browser suite and CI
pass. The figures this branch's texts quote for Set H (1 of 292,352 and 75 of 292,864 samples one step off) are
W3-08's, measured with the investigator's build; this branch's build gives the same samples as that build on every
synthetic signal tried (below), but only the private check can confirm them on the takes.

## Commits

- `8cd406a` The codec rebuilt: `OPUS_BUILD`, the 16-bit entry points, the reset, ties to even; the vendor hash; cache
  `v22`; `build.mjs --native`.
- `4a7a836` The profiles, `modeRate` through the three call sites and `codecResultInfo`, `demo.js`, the page, the
  docs, the new checks.
- `9829dc8` The six CELT golden hashes of `tests/render-stream.verify.mjs`, re-recorded in a commit of their own.
- The report, and the merge of `origin/main`.

## The build

The pinned checkouts were copied into a scratch folder (CELT `e18de77`, musl `0784374`). In order:

| Build | WebAssembly | SHA-256 | Against |
| --- | ---: | --- | --- |
| `build.mjs` as on main | 113,290 bytes | `2947bcd9…` (`.wasm.mjs` `6f2522f5…c756e5`) | the recorded module: identical |
| + `-DOPUS_BUILD` | 117,699 bytes | `71dad0a9eb5c658d8ca7585addfd1018965e09b720cd2778073a19e73ef5ffcc` | W3-08's figure: identical |
| + `celt_encode`, `celt_decode` exported (W3-08's 16-bit build) | 118,654 bytes | `81c0fe36…773dcc` | W3-08's figure: identical |
| **this branch:** the float entry points dropped, `cc_decoder_set` added | **119,141 bytes** | **`ea0b7d3da08561b9b8609f51553b9f59bf8a75491a3d885f06728684a22ad25b`** | `.wasm.mjs`: `37b5677f5dd77a2a91bd007b2a7cb6981115ca27c5f704327f9667797977b2c4`, recorded in `tests/vendor-opus.mjs` and the vendor README |

The last build differs from the report's 117,699 only by its export list: the 16-bit route (the route W3-08 found
to match) and a decoder control call, needed to send request 8 to the decoder. Ubuntu clang 18.1.3, as in the
report. With the investigator's own `index.mjs` and module (float route, ties to even in the caller) and this
branch's, driven as the private check drives them, all six synthetic runs (two modes, three signals) give the same
16-bit samples, 228,224 of 228,224.

`vendor/celt-0.11/index.mjs`: after creating the encoder and decoder it sends request 8 to each; `encode` rounds
its float input to 16 bits (`toInt16`: to nearest, ties to even, clamped) and calls `celt_encode`; `decode` and
`conceal` call `celt_decode` and return its 16-bit samples / 32768. `restart()` recreates both and resets them
again. `version` is now `CELT 0.11 (celt-0.11.0, pitch filter in)`.

## The native comparison (the amendment's public check)

`node tests/celt011/build.mjs --native <celt> <musl>` compiles the 17 sources and `api.c` natively (gcc 13.3,
glibc, x86-64, `-O2 -ffp-contract=off -fno-fast-math -msse2 -mfpmath=sse`, the same four defines,
`OPUS_BUILD` among them). `api.c`'s `CC_NATIVE` harness makes `index.mjs`'s calls in the same order. Eight runs,
each with a new codec at complexity 5: a speech-like signal with a gliding pitch (3.0 s), a 200 Hz harmonic tone
after silence, and noise, in both modes, and the speech-like signal again with a restart mid-way and every fifth
frame concealed. **All eight are bit for bit identical** (packets and 16-bit output); their hashes are recorded in
`tests/opus.verify.mjs`. The pitch filter is on in 94 of 130 packets of the speech-like signal (`vaudio_celt`), 36
of 65 (`vaudio_celt_high`), 40 of 48 and 20 of 24 of the tone, and in none of the noise.

`filterFlag(packet)` (in `tests/celt011/build.mjs`) reads the filter flag as `celt_decode` does: after the first
byte, which the encoder's default signalling fills, the range coder's silence flag and then the filter flag. Over
the 333 packets of the six single runs it agrees with main's decoder on every packet: the old decoder refuses
exactly the flagged ones (error -4).

## The checks

`pnpm test` passes (verify 215, gain 67, opus 137, speex 63, speex 1.0.2 30, reference 41, formats 66, file rate 53,
meter 50, video 45, demo 34, render-stream 146, voice channel 127, Steam sender 58). New or changed:

- `tests/opus.verify.mjs`: `celtRoundTrip` with `modeRate` 44100, 1024 samples, 128 bytes on 22050 Hz sound:
  128-byte packets, `frameMs` 46.44, bitrate 22050, `modeRate` 44100. 9 kHz −0.64 dB, 10.5 kHz −69.5 dB.
  Without `modeRate` the info has none, and `modeRate` equal to the rate changes no sample. `createCeltStream`
  takes it. The eight native hashes. The filter is on for the speech-like signal (72% and 55%) and off for noise.
  A harmonic tone: 25.67 dB (`vaudio_celt`) and 29.08 dB (`vaudio_celt_high`); thresholds 22.5 and 26, the old
  build giving 19.45 and 23.35, complexity 4 19.62; complexity 10 identical to 5. Request 8 changes the
  speech-like signal's packets 1 to 3 (on the module's own exports). `toInt16` ties to even and clamps; a frame of
  half-step ties codes as the frame rounded to even.
- `tests/verify.js`: `celt_44` is `['celt', 22050]`; complexity 5 reaches the codec in both profiles; `celt_44`
  reports the 44100 Hz mode on 22050 Hz sound, 128 bytes of 1024 samples; `celt_22` has no `modeRate`.
- `tests/render-stream.verify.mjs`: `createRender` equals `process()` for both `celt_44` cases, `codecInfo`
  (with `modeRate`) deep-equal; a new check that the `celt_44` cases report the mode and the `celt_22` ones none.
- `tests/demo.verify.mjs`: a synthetic `vaudio_celt_high` demo (128-byte packets from a 440 Hz tone at 22050 Hz)
  reads as 12 packets at 22050 Hz and decodes with `(44100, 1024, 128)` to the tone, delay 128, r 0.9997. A
  `vaudio_celt` demo of a pitched voice: 24 of 24 packets with the filter flag; it decodes to that voice, delay 64,
  r 0.9986. The old `vaudio_celt` case is unchanged.
- `tests/browser.verify.js` (221 checks): the menu's labels, the chain strip for both profiles, a render with each
  (codec info and the console line), the live chain with `celt_44` (22 of 22 frames CELT).

### Each check broken

Every break was made in a scratch copy of the tree, one at a time.

| Break | What failed |
| --- | --- |
| `process()` does not pass `modeRate` | verify, render-stream: `CELT 0.11 has no mode for 22050 Hz / 1024 samples` |
| `createLiveChain` does not pass it | gain.verify (its `celt_44` live chain): the same error. verify.js passed |
| `createRender` does not pass it | render-stream: `celt_44, chunks: 12345` and the loss case, threw the same |
| `codecResultInfo` without it | render-stream: `celt_44, chunks: 12345 [codecInfo differs: modeRate]`, and the loss case |
| `celt_22` complexity left at 10 | verify: `celt_22: complexity 5 reaches the codec [10]`; render-stream: three `celt_22` golden cases |
| `celt_44` complexity left at 10 | verify: `celt_44: complexity 5 reaches the codec [10]` |
| demo table's packet size left at 120 | demo: `A vaudio_celt_high demo gives its 128-byte packets, at 22050 Hz` |
| demo table's rate left at 44100 | demo: the same check |
| `demo.js` creates the codec at `spec.rate` | demo: `no mode for 22050 Hz / 1024 samples` |
| **the pitched demo decoded by main's build** (new encoder, old decoder) | demo: `CELT 0.11 decode failed (error -4)` |
| main's module and `index.mjs` both | opus: `Frame 0: the decoder gave -0.0000012…, not a 16-bit sample`; demo: the pitched case, `0 of 24 packets with the filter flag` |
| the new `index.mjs` on a module built without `OPUS_BUILD` (114,652 bytes) | opus: `CELT celt voiced: … match the native build` (0 with the filter on); demo: the pitched case |
| the native build without `OPUS_BUILD` | `--native`: six runs `WebAssembly DIFFERS` (the two noise runs identical: the filter is never on there), exit 1 |
| no request 8 to the encoder | opus: `CELT celt voiced: packets and 16-bit output match the native build` |
| no request 8 to the decoder | **nothing failed** (see below) |
| input rounded with `Math.round` | opus: `CELT input rounding: ties go to the even sample, and full scale clamps` |
| input not clamped | opus: the same check |
| the info always has a `modeRate` | opus: `Without modeRate the info has none…`; verify: `celt_22: no mode rate of its own` |
| `celtRoundTrip` ignores `modeRate` | opus: `no mode for 22050 Hz / 1024 samples` |
| `createCeltStream` ignores it | opus: the same |
| `celt_44` on 44100 Hz sound (`codecRate` 44100) | verify: `celt_44: CELT 0.11 at 22.05 kbps` and the mode check |
| the chain strip without the mode text | browser: `the chain strip describes vaudio_celt, and vaudio_celt_high as the 44.1 kHz mode on 22.05 kHz sound` |
| the old menu label | browser: `the codec menu names vaudio_celt and vaudio_celt_high at their real rates` |
| the filter compiled out, for the harmonic-tone check | not run alone (the native check fails first in that break); the old build measures 19.45 and 23.35 dB against thresholds of 22.5 and 26 |

The decoder's reset cannot be caught: after creation it changes nothing (W3-08, and `CELT_RESET_STATE` in the
decoder only zeroes what creation zeroed). It is sent because the module sends it.

## Golden hashes

With the old hashes, the six CELT cases moved and nothing else: `celt_22`, `celt_44`, `celt_22, gate on, loss 15%,
jitter 300 ms`, the `celt_44` loss case, `celt_22, source at 22.05 kHz` (WAV and codecInfo), and `celt_22, one
sample at 22.05 kHz` (codecInfo only: same output, new version string and complexity). The other 41 did not move.
The `celt_44` loss case was `celt_44, gate on, loss 5%`; with 46.4 ms frames its 172 frames lost none at that seed,
which failed the suite's "frames are lost" check, so it is now `celt_44, gate on, loss 15%` (15 lost).

## Measurements the order asks for

- **P1, complexity 10 against 5.** The test signal, generated locally (`make_testsignal.py`, its SHA-256 as in
  the README), through `celt_22` under both P1 hypotheses: none of the 57 segments' band levels moves; the
  largest change is 0.000 dB, on main's build and on this one. Complexities 5 to 10 are one encoder.
- **`celt_44` before and after, pink noise.** The codec stage alone (`celtRoundTrip` at the profile's settings,
  out against in): before (44100 Hz, 256, 120) 0.0 dB at 5 kHz and 9 kHz, the last 100 Hz band above −40 dB ending
  at 20.5 kHz; after, +0.1 dB at 5 kHz and −0.5 dB at 9 kHz, −17 dB at 10.0 kHz, −45 dB at 10.2 kHz and −63 dB at
  10.5 kHz: nothing is left above about 10.2 kHz. Through the whole chain (48 kHz in and out, gate and auto-gain off,
  relative to 0.5–2 kHz): before −0.4 and −1.3 dB, after −1.5 and −5.7 dB (the linear mixer's droop added), with
  the mixer's images of the band above 11 kHz (−11 dB at 12 kHz).
- **The 9 kHz figure.** The order's check is a 9 kHz sine within 1 dB. With the filter compiled in, a steady sine
  near the top of the band comes back a few dB off: +3.4 dB at 9 kHz, −4.4 dB at 8 kHz (+0.2 and −0.3 at
  complexity 4, where the filter is off; main's build +0.30 and −0.22). So the check measures 9 kHz on noise (the
  8.8–9.2 kHz band: −0.64 dB). The 10.5 kHz sine stays a sine (−69.5 dB).

## Readings where another was possible

1. **The module's hash.** The brief gives 117,699 bytes for this toolchain. That build was reproduced exactly, and
   so was W3-08's 16-bit build (118,654). The recorded module is a third: the 16-bit route the amendment names,
   without the float entry points, plus a decoder control call for the decoder's reset. I read the 117,699 figure
   as the toolchain check, and recorded the module the amendment's changes give.
2. **Where the native harness lives.** The amendment asks for hashes from a native build, as the Speex 1.0.2
   files do (`tests/speex102/native.mjs`, `native.c`), but adds no such file to the list. The harness is in
   `tests/celt011/api.c` (under `CC_NATIVE`) and the runner is `build.mjs --native`, both on the list; the test
   signals and `filterFlag` are exported from `build.mjs`.
3. **Where the float input becomes 16 bits.** In `index.mjs`'s `encode`, for every caller. The game's capture is
   16-bit; the app's float sound is rounded there and nowhere earlier.
4. **The 9 kHz check** is measured on noise, not on a sine (above).
5. **The `celt_44` loss case** is renamed and runs 15% loss (above). It is a CELT case, so in the order's reach.
6. **Status stays `modeled`** for both profiles (spec point 1), as the receiver side is. The texts say the codec
   stage gives the game's samples but for 1 and 75 one-step differences (W3-08's change 6).
7. **The decoder's reset.** Sent, though it changes nothing (the brief and the module both send it).
8. **`index.mjs`'s default complexity** stays 10 when none is given (the profiles give 5; only the demo decoders
   omit it, and decoding does not use it).
9. **The two-sample skip** of the game's file reader is written into `tests/LEGACY_CODECS.md` for anyone repeating
   Set H (W3-08's change 6) and is not built into the app, as the brief says.
10. **A demo recorded under `vaudio_celt_high`** was unreadable as sound before this order: the reader cut it into
    120-byte packets of 256 samples at 44100 Hz. It now reads 128-byte packets of 1024 samples at 22050 Hz.

## Left alone, and found in passing

- Two files outside this order's list describe `celt_44` as it was. `tests/gain.verify.mjs` ([5], the key-up
  gap check) says `celt_44` with the codec bypassed runs at 44.1 kHz with 256-sample frames; it now runs at
  22.05 kHz with the linear mixer. The check still passes (gap 10,237 samples, the first block flat within 2%), but
  its premise ("no resampler ringing") no longer holds as written. `tests/reference.verify.mjs` says 5.8 ms frames
  for `vaudio_celt_high` (its check passes its own frame grid, so it is unaffected). Neither was changed.
- `reference.js` (not on the list) has a comment with 5.8 ms frames for `vaudio_celt_high`; it reads the frame grid
  from the render's `codecInfo`, so its behaviour follows the profile.
- `tests/REFERENCE_2026.md` (the orchestrator's) already describes the result; its table row for the app
  ("`celt_22`: the same mode, built without the pitch filter, complexity 10…") will be out of date on merge.

## For the private check

The folder that holds `index.mjs` and the module is `vendor/celt-0.11` on the branch. `createCodec(rate, frameSize,
{ packetBytes, complexity })` keeps its signature: floats in at full scale 1, floats out. The floats out are now
whole 16-bit steps (the decoder's own rounding, ties to even), so the check's own rounding gives them back
unchanged, and a float input that is already a 16-bit value / 32768 is coded as that value. The reset is sent at
creation, so nothing has to be added. Expected, as the amendment says: 292,351 of 292,352 (`vaudio_celt`) and
292,789 of 292,864 (`vaudio_celt_high`).

## Runs

- `pnpm test`: passes (the counts above), on the head before the merge and again after it.
- Browser suite, `CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) flock
  /tmp/tf2ve-heavy.lock node tests/browser.verify.js`: `221 browser checks passed`, exit 0.
- `pnpm test:vendor`: every build matches its recorded hash.
- CI (`tests`): run 42766318560 on `8cd406a` failed, as expected (the rebuilt codec before its hashes were
  re-recorded); run 42768649277 on `9829dc8` passed. The final head's run is in the hand-back.
- The diff and commit messages were scanned for recordings, personal details, SteamIDs and model names: none (the
  trailer aside).
