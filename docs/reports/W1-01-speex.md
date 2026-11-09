# W1-01 report: the `speex` profile runs real Speex

The `speex` profile now runs Speex 1.2.1, built to WebAssembly from the Xiph release tag, in place of the Opus SILK
stand-in. Its settings are assumptions: quality 4 (8 kbps, 20-byte packets), constant bitrate, no VAD or DTX, default
complexity, decoder enhancement on. Every check in the order's "Done means" was run. CI passed on the code commits.
One run, on the merge of main, failed on the known chance failure that W1-04 is about (details under "CI").

## Commits

| Commit | What |
|---|---|
| `c81e98f` | Speex 1.2.1 to WebAssembly: `tests/speex/build.mjs` and its C glue, `vendor/speex/`, the native comparison script, the recorded hash in `tests/vendor-opus.mjs` |
| `041e8e6` | The profile runs it: `opus-codec.mjs`, the two engine picks in `audio.js`, `constants.js`, `index.html`, the chain strip in `app/console.js`, `sw.js`, `tests/speex.verify.mjs` in `pnpm test`, `tests/verify.js`, `tests/browser.verify.js` |
| `6e778b6` | Docs: README (Profiles, Tests, files and licences), `tests/LEGACY_CODECS.md` |
| `77988ec` | Merge of `origin/main` (docs only) |
| `0da69af` | Fix to my own test: the restart check passed with `restart()` broken; now it fails. LEGACY_CODECS wording |
| (this one) | This report |

## What changed

- **Build.** `tests/speex/build.mjs` builds tag `Speex-1.2.1`, pinned at commit `5dceaaf3e23ee7fd17c80cb5f02a838fd6c18e01`. It uses the
  library sources from `libspeex/Makefile.am`, without the optional Vorbis psychoacoustics or FFT, which configure
  leaves out by default. The toolchain is CELT's: clang `--target=wasm32 -O2 -ffp-contract=off`, wasm-ld with
  `--gc-sections`, `tests/libopus11/libc.c`, and musl 1.2.5's libm (`exp`, `log`, `log10`, `pow`, `cos`, `sin`, `acos`,
  `atan`, `sqrt`, `floor`, `fabs`, `scalbn` and their helpers). The module has no imports. The defines are the ones configure
  writes for a float build with C99 arrays (`FLOATING_POINT`, `VAR_ARRAYS`, `EXPORT=`). Three more silence stderr:
  `DISABLE_WARNINGS`, `DISABLE_NOTIFICATIONS`, and `OS_SUPPORT_CUSTOM`, Speex's own hook, used through
  `tests/speex/os_support_custom.h` so that a failed assertion traps instead of calling `fprintf`/`exit`. The script
  generates `speex_config_types.h` from the source's `.in` file. `tests/speex/include/math.h` adds `acos` to the
  libopus11 math header. `tests/speex/api.c` holds the entry points: create with quality, VBR, VAD and DTX off,
  integer ctl getters, encode and decode through one scratch `SpeexBits`, and a null packet meaning conceal.
- **Module.** `vendor/speex/index.mjs` mirrors the CELT one. `createCodec(quality = 4)` gives `encode`, `decode`,
  `conceal()` (a decode with no bits), `restart()`, `free()`, `version` ('Speex 1.2.1') and `lookahead` (80 = encoder
  40 + decoder 40, from `SPEEX_GET_LOOKAHEAD`). It also reports `bitrate`, `complexity` and `enhancement`.
  `qualityBitrates()` reads the library's bitrate for each quality, and `qualityForBitrate()` picks the nearest one.
  Floats are scaled by 32768 to Speex's 16-bit float API and back; both directions are exact.
- **Chain.** `opus-codec.mjs` gains `speexRoundTrip` and `createSpeexStream` next to the CELT ones. They use the same
  gate, loss mask (1 lost and concealed, 2 late and silent), talk-spurt restart and delay trim, with 20 ms frames.
  `audio.js` picks them for `engine: 'speex'` in `process()` and `createLiveChain()`, passing
  `bitrate: codec.bitrate * bits / 16`. The receiver is unchanged: 11.025 kHz, linear mixer, no gate.
- **Wording.** The display name is 'vaudio_speex (Speex 1.2.1, 8 kHz, 8 kbps)'. The page's option is 'vaudio_speex
  (Speex, 8 kHz, 8 kbps, unconfirmed)', following `celt_44`'s option. The README status is "Codec real; settings
  unconfirmed". "Stand-in" is gone wherever it described this profile in the files I may touch.
- **Offline.** `sw.js` caches `vendor/speex/index.mjs` and `vendor/speex/speex-1.2.1.wasm.mjs`; the cache is now `tf2ve-v18`.

## Decisions I made on my own

1. **Frame code.** Speex frames are logged as `FRAME.celt` (3). The codec lane shows them as "CELT" (purple, hover
   text "CELT: transform coding, full band"), the render's console line ends "native PLC (CELT 100%)", and the live
   panel's mode reads "CELT". I considered SILK (1), whose hover text "speech coding, up to 8 kHz" describes Speex
   better. I rejected it because the order removes "SILK" from this profile's wording, and its fallback names code 3.
   The visualizer and `live.js` are outside the order, so their labels are unchanged.
2. **`app/console.js`.** I left the `sv_voicecodec` help text as it was. I changed the chain strip's Codec line
   instead, which would otherwise have said "Opus 8 kHz · 8 kbps · SILK" for this profile. It now says
   "Speex 8 kHz narrowband · CBR 8 kbps · 20 ms frames". At other `snd_bits` values the number carries "≈", because the
   strip cannot ask the library which quality is nearest.
3. **Ties between qualities.** Qualities 3/4, 5/6 and 7/8 share a mode, so `qualityForBitrate` picks the higher
   number. The default therefore reports quality 4, as the order names it. The profile has no `quality` field; its
   `bitrate: 8000` is what `snd_bits` scales.
4. **README beyond the named sections.** Besides the Profiles table, the paragraph under it (now three short
   paragraphs) and the Tests list, I updated the Files table: `vendor/speex/` is new, and `vendor/libopus/` (1.6.1) is
   now described as being for a video's audio track, since no profile uses it any more. I also added
   `vendor/speex/COPYING.speex` to the licence line. Both would otherwise be wrong.
5. **Browser suite.** Besides adding the two files to the offline-cache list, the offline step now also renders with
   the `speex` profile and checks the console line `S_Voice: Speex 1.2.1, 8 kbps CBR, 20-byte packets of 20 ms`. This
   proves the module loads from the cache in Chromium.
6. **Decoder output** is Speex's float output (`speex_decode`), not clamped to int16, as for CELT's float path. The
   receiver's auto-gain clamps to int16 afterwards.
7. **No `build:speex` script** in `package.json`: the order allowed only the test script there. The README says
   `node tests/speex/build.mjs`.
8. **Native comparison as a recorded hash**, as for libopus 1.1.5 and LAME. `tests/speex/native.mjs` is the one-off.
   It compiles the same sources, defines and `api.c` natively with `cc`, using the system's libc and libm, plus
   `tests/speex/native.c`. It runs both builds on a 4 s test signal and prints the hashes. `tests/speex.verify.mjs`
   checks the WebAssembly output against them, so CI needs no compiler or network.

## Checks ("Done means")

**Two builds give the same module.** I ran `flock /tmp/tf2ve-heavy.lock node tests/speex/build.mjs <speex> <musl>`
from local checkouts first. Then `flock /tmp/tf2ve-heavy.lock node tests/speex/build.mjs` cloned both sources fresh.
Both printed `vendor/speex/speex-1.2.1.wasm.mjs: 86144 bytes of wasm, 57 sources, no imports`, and both gave SHA-256
`8d30577707d2098fd35a91061eb0e755d0708184b2f8dd0bc2ae7302a2523b26`. The checkouts had different paths, so the module
does not depend on where the sources are.

**`pnpm test:vendor`:**

    Opus runtime matches libopus-wasm 0.4.0.
    libopus 1.1.5 build matches its recorded hash.
    CELT 0.11 build matches its recorded hash.
    Speex 1.2.1 build matches its recorded hash.

**`node tests/speex.verify.mjs`:** 39 checks, ending `39 Speex checks passed`. It covers what the order lists:

- **Packets.** 20 bytes a frame at the default. For `snd_bits` 4, 6, 8, 10, 12, 20, 24 and 32 the render codes at
  qualities 0, 0, 1, 2, 2, 6, 6 and 8, in packets of 6, 6, 10, 15, 15, 28, 28 and 38 bytes, and the test checks that
  each is the nearest quality.
- **Sound.** Decoded voice correlates with its source: r 0.882 at the codec rate, 0.897 through a 48 kHz render.
  White noise comes out band-limited: −62.7 dB of the total from 4.5 to 6.5 kHz.
- **Timeline.** At the codec rate the correlation peak sits at lag 0. In a 48 kHz render, 2 kHz pulses peak at −0.48
  samples (see the note below).
- **Loss.** A lost frame is Speex's own concealment, sample for sample. It is not silence, not the previous packet
  decoded again and not the previous frame repeated, and the frame log marks it. A late frame plays as silence.
  `net_fakeloss` in a render is logged too.
- **Determinism.** Two renders with loss, jitter and a seed are identical, and so are two round trips.
- **Gate.** With the gate turned on, each talk spurt restarts the encoder and decoder.
- **Native build.** WebAssembly against native, below.
- **Live chain.** It runs Speex and matches the render: r 0.999, 0.02 dB, `contentDelay` 481 samples at 48 kHz, peak at
  0. Its frames are 20-byte packets logged with code 3, and it conceals lost frames.
- **Wording.**

**WebAssembly against a native build.** I ran `flock /tmp/tf2ve-heavy.lock node tests/speex/native.mjs <speex> <musl>`:

    Native: cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, x64. Test signal: 32000 samples, every 7th frame concealed.
    quality 0: 200 frames, 1200 bytes; packets 6d89936d…, decoded 9f9c552f… (WebAssembly identical)
    quality 2: 200 frames, 3000 bytes; packets 444b306d…, decoded 2686b2e2… (WebAssembly identical)
    quality 4: 200 frames, 4000 bytes; packets 8c89b29d…, decoded 593d40ca… (WebAssembly identical)
    quality 8: 200 frames, 7600 bytes; packets 41a7f6cf…, decoded 9e061422… (WebAssembly identical)
    quality 10: 200 frames, 12400 bytes; packets 1de3bd63…, decoded 68eb6bdf… (WebAssembly identical)
    The WebAssembly module matches the native build bit for bit.

The packets match bit for bit, and so does the decoded output with the concealed frames. The native build uses
glibc's libm, not musl's, so the result does not depend on the musl functions either.

**`pnpm test`** passed, exit 0, in 1 min 20 s. The suite totals were: `209 passed, 0 failed` (verify.js), `119 Opus
checks passed`, `39 Speex checks passed`, `40 paired-reference checks passed.`, `66 passed, 0 failed`, `23 passed, 0
failed`, `45 video checks passed`, `17 demo checks passed`. In `tests/verify.js` the checks that named the stand-in now
read `speex: Speex 1.2.1 at 8 kbps`, `speex: encodes and decodes with Speex 1.2.1` and `speex: Speex narrowband leaves
nothing between its 4 kHz edge and the mixer's images`.

**Browser suite.** I ran `flock /tmp/tf2ve-heavy.lock env CHROMIUM_EXECUTABLE=… node tests/browser.verify.js` and it
ended `170 browser checks passed`, exit 0, including:

    ok    batch, format, meter, reference, video, demo, live-monitor, CELT, Speex and MP3 encoder files are cached for offline use
    ok    the speex profile converts audio offline with Speex 1.2.1 in 20-byte packets

These runs were at commit `6e778b6`, before the merge of main and the test fix. After the test fix I ran
`node tests/speex.verify.mjs` again; the final `pnpm test` and browser-suite results are in "Final runs" below.

**A note on the timeline.** The 80-sample delay is trimmed exactly. Off by one sample at 8 kHz, the codec-rate peak
moves to 1 and the 48 kHz pulse peak to 5.5 samples, and both checks fail. What remains is the phase of Speex's own
high-pass filters, one in the encoder and one in the decoder (`libspeex/filters.c`). They lead low frequencies. The
coefficients predict a lead of 1.4 samples at 48 kHz at 1 kHz, 0.6 at 1.5 kHz and 0.3 at 2 kHz. The measured peaks
were −1.57, −0.60 and −0.48 samples for pulses at those frequencies, and −1.93 for a voice-band glide with its pitch
near 180 Hz. So the render-level check uses pulses centred on 2 kHz, where the filters' phase is under a sample.
A voice with a lower pitch is shifted more: its fundamental leads by about 0.8 ms at 115 Hz. This is the codec's
behaviour, so the model keeps it, as it keeps Opus's SILK phase for Steam.

## Each new check fails when its code is broken

I broke each check's code one change at a time, using a keep-going copy of the test that lists every failing check,
then restored the file. The scripts are in the scratch folder. Each break failed at least these checks:

| Break | Fails |
|---|---|
| round trip trims 79 instead of 80 samples | codec-rate timing (peak at 1), 48 kHz pulse timing (5.52), own-concealment, late-silence, live chain r and delay |
| module reports only the encoder's lookahead (40) | the 80-sample delay check, both timing checks, render correlation (r 0.19) |
| lost frames decoded from the packet anyway | the lost frame is Speex's own concealment |
| concealment replaced by silence | "not silence…", all five native comparisons |
| concealment re-decodes the last packet | own concealment, then a decode error |
| late frames decoded instead of silent | a late frame plays as silence |
| lost frames not marked in the log | frame log marks the lost frame; `net_fakeloss` logged |
| ties go to the lower quality | nearest-quality rule, default quality 4, `snd_bits` 20/24/32 |
| `snd_bits` not passed to the render | `snd_bits` 4-32 checks |
| quality chosen by floor, not nearest | nearest-quality rule, `snd_bits` 10 and 20 |
| input scaled by 32767, not 32768 | all five native comparisons |
| `restart()` does nothing | the gate/restart check (after the fix in `0da69af`; before it, nothing failed) |
| random dither on the encoder input | both determinism checks, restart check, own concealment |
| decoded frames reversed | all correlation and timing checks, native comparisons |
| receiver voice rate 8 kHz (mixer images reach 4 kHz) | band-limited check (−15.8 dB from 4.5 to 6.5 kHz) |
| `process()` loses its Speex pick (Opus runs) | renders-through-Speex, 20-byte packets, every `snd_bits` check; in `tests/verify.js`, both speex checks |
| the live chain loses its Speex pick | live chain codes with Speex, its delay, its frame codes |
| live stream reports lookahead 0 | live chain's stated delay (481 against 1) |
| live stream frames reported as SILK | live frames logged with the CELT code |
| the old display name | wording |
| one changed character in the vendored module | `pnpm test:vendor`: "differs from the recorded build" |
| `sw.js` without the Speex files (browser suite) | "…CELT, Speex and MP3 encoder files are cached for offline use" |
| `process()` loses its Speex pick (browser suite) | the offline Speex render: `page.waitForFunction` times out waiting for `S_Voice: Speex 1.2.1` (line 975), after every earlier check passed |

Not broken: the C glue's settings (VBR, VAD and DTX off, quality). Breaking those means rebuilding the module. They
are guarded by the 20-byte-packet check, the bitrate and quality checks, and the native hashes. The native driver
shares `api.c`, though, so a wrong setting in `api.c` would change both builds alike. Only the packet sizes and the
reported bitrate and complexity would catch it.

## How the real codec differs from the stand-in

These numbers come from a 48 kHz render with the default settings, comparing this branch with `origin/main`'s
`constants.js` and `audio.js`. The stand-in was libopus 1.6.1, SILK at 8 kHz, 8 kbps CBR. The receiver chain is
identical in both. The script is `measure.mjs` in the scratch folder.

- **Band edge.** White noise at −20 dBFS, no auto-gain, measured relative to the 0.5–2 kHz gain:

  | | 3.0 kHz | 3.4 kHz | 3.6 kHz | 3.8 kHz | 4.0 kHz | −3 dB point | −20 dB point |
  |---|---|---|---|---|---|---|---|
  | Speex | −1.2 dB | −1.6 dB | −3.6 dB | −7.8 dB | −14.6 dB | 3.6 kHz | 4.2 kHz |
  | stand-in | −2.6 dB | −3.3 dB | −4.0 dB | −7.5 dB | −12.9 dB | 3.1 kHz | 4.2 kHz |

  Neither passes anything from 4.5 to 6 kHz (−62.8 and −63.8 dB of the total). The receiver's linear-interpolation
  images near 7 kHz are the same (−26.5 against −26.3 dB).
- **Low end.** At 100 Hz Speex is down 4.7 dB and the stand-in up 0.6 dB. At 200 Hz the figures are −1.6 and +1.2 dB.
- **Level.** The tests' speech-like signal at −20 dBFS: a default render is −13.94 dBFS with Speex and −14.00 dBFS with
  the stand-in; without auto-gain, −21.13 against −21.57 dBFS. A voice-band glide at −21.2 dBFS, without auto-gain,
  comes out at −21.4 dBFS through Speex and −23.1 dBFS through the stand-in. With defaults it renders at −11.3 against
  −11.8 dBFS.
- **Spectrum.** On the glide, Speex minus the stand-in:

  | 250–500 Hz | 0.5–1 kHz | 1–2 kHz | 2–3 kHz | 3–3.4 kHz | 3.4–3.8 kHz |
  |---|---|---|---|---|---|
  | +1.7 dB | +1.8 dB | +2.0 dB | +1.1 dB | +0.2 dB | +3.4 dB |

  The RMS difference over 50 Hz bands from 0.1 to 3.8 kHz is 3.0 dB. On the speech-like signal the two are within
  1 dB up to 2.5 kHz. Above that Speex is lower: −1.2 dB at 2.5–3.15 kHz, −2.7 dB at 3.55–4 kHz.
- **Waveform.** On the glide, the correlation with the source is r 0.890 for Speex and 0.917 for the stand-in, and
  the SNR 6.7 against 7.6 dB. On the speech-like signal it is r 0.215 against 0.659, because Speex's high-pass filters
  turn the phase of its 115 Hz fundamental. The two renders correlate with each other at r 0.668.
- **Packets.** Both send 20 bytes every 20 ms at the default: 4,020 bytes for 201 frames.

## CI

- Run 42712449404, head `6e778b6` (all the code and docs): **success**.
- Run 42712499399, head `77988ec` (the merge of main, which brought docs only): **failure**, in the browser suite. The
  failing check was `the recorded voice lines up with an offline render of the recorded microphone (peak at -330
  samples, r 0.552)`. That is the same chance failure, with the same numbers, that W1-04 describes. Every check before
  it passed, and the merge changed no code.
- The final push's run is reported under "Final runs".

## Not done, or uncertain

- **The live chain's `bitrate`** in `audio.js` is still `max(6000, codec.bitrate × snd_bits / 16)`. The live panel
  shows it, so for Speex at `snd_bits` other than 16 it differs from the quality actually used: at `snd_bits` 8 it shows
  6 kbps where Speex runs 3.95. It is outside the two engine picks I may touch. CELT's live figure is likewise
  approximate.
- **Stale stand-in wording outside my files or sections.** `tests/REFERENCE_2026.md` line 519 still says "the Speex
  stand-in"; I may not edit that file. In `constants.js`, the old comment above `celt_22` ("this is a stand-in, not
  the 0.11 bitstream") and the `legacy` preset's "CELT-era codec stand-in" both concern CELT, not this profile, so I
  left them. README's Visualizer section lists the lane's codes without mentioning that Speex shows as CELT; the
  Profiles paragraph says it.
- **Which Speex release Source used** is unknown. Speex's bitstream has been stable since 1.0, but encoders of
  different releases can choose different bits. LEGACY_CODECS.md says so.
- Reading `vaudio_speex` from demos, wideband and the receiver were out of scope and untouched.

## Final runs

At `0da69af`, which has the test fix and the merge of main:

- `pnpm test`: exit 0, 1 min 16 s; `209 passed, 0 failed`, `119 Opus checks passed`, `39 Speex checks passed`, `40
  paired-reference checks passed.`, `66 passed, 0 failed`, `23 passed, 0 failed`, `45 video checks passed`, `17 demo
  checks passed`.
- `pnpm test:vendor`: the four lines above, ending `Speex 1.2.1 build matches its recorded hash.`
- Browser suite: `170 browser checks passed`, exit 0, with both Speex checks.
- CI on the commit that adds this report can only be read after the push, so its result is in the summary returned
  with this report, not here.

Before the final push I scanned the branch's diff against `origin/main` and its commit messages. They contain no
recordings, personal details, machine paths, SteamIDs or model names, apart from the required trailer lines. The
WebAssembly module holds no paths, only function names.
