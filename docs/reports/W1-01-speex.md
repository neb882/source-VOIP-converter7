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

1. **Frame code.** *Superseded in the fix round (O1): Speex frames now have their own code, 7.* At first, Speex frames were logged as `FRAME.celt` (3). The codec lane shows them as "CELT" (purple, hover
   text "CELT: transform coding, full band"), the render's console line ends "native PLC (CELT 100%)", and the live
   panel's mode reads "CELT". I considered SILK (1), whose hover text "speech coding, up to 8 kHz" describes Speex
   better. I rejected it because the order removes "SILK" from this profile's wording, and its fallback names code 3.
   The visualizer and `live.js` are outside the order, so their labels are unchanged.
2. **`app/console.js`.** *The "≈" figure was superseded in the fix round (F3).* I left the `sv_voicecodec` help text as it was. I changed the chain strip's Codec line
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

- *Fixed in the fix round (F3).* **The live chain's `bitrate`** in `audio.js` was still `max(6000, codec.bitrate × snd_bits / 16)`. The live panel
  shows it, so for Speex at `snd_bits` other than 16 it differs from the quality actually used: at `snd_bits` 8 it shows
  6 kbps where Speex runs 3.95. It is outside the two engine picks I may touch. CELT's live figure is likewise
  approximate.
- *Fixed in the fix round (F4).* **Stale stand-in wording outside my files or sections.** `tests/REFERENCE_2026.md` line 519 still says "the Speex
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

## Review and fix round

The reviewer found no defect in the Speex code itself. It did find test gaps and wrong page text, and the orchestrator
added O1. Main (`bded46b`, W1-04) was merged first. That merge was clean, including `tests/browser.verify.js` and README.

### What changed

- **O1: Speex frames have their own frame code.** `FRAME.speex = 7`, appended; no code was renumbered. The mode key
  is `'speex'`, shown as "Speex". Each reader of the frame log or the modes learned it:
  - `opus-codec.mjs`: `speexRoundTrip` logs code 7 and counts `modes.speex`; `createSpeexStream` reports mode
    `'speex'`.
  - `audio.js`: the live chain maps a mode to its code through `FRAME_CODES`, and its `stats.modes` has `speex`.
  - `live-worker.js`: a recorded take counts code 7.
  - `live.js`: the panel's mode label says "Speex".
  - `app/render.js`: `describeModes` totals every mode and prints "Speex".
  - `app/visualizer.js`: `FRAME_STYLE[7]` is "Speex", colour `#c8609a`, text "Speex: CELP speech coding,
    narrowband up to 4 kHz".
  - `reference.js`: code 7 counts as coded.

  I searched for other readers that treat codes 1-3 as coded and found no others. `receivedCodecInfo` in `audio.js`
  (demo voice) is unchanged, because a demo carries no Speex.
- **F3: the bitrate shown.** The live chain reports `voice?.bitrate ?? max(6000, scaled)`. Only the Speex stream
  reports a bitrate, so the other profiles are unchanged. The chain strip computes the chosen quality from
  `CODEC_PROFILES.speex.qualityBitrates`, the eleven narrowband bitrates. A test pins that table to the library's own
  numbers.
- **F4: page text.**
  - The status line names the codec that ran: "Speex 1.2.1 · 8 kbps", and for the CELT profiles "CELT 0.11 · …",
    which had the same fault on the same line. The Steam profiles keep "Real Opus".
  - A live take's `backend` now comes from the profile's engine, so it is `celt` or `speex` where it was always
    `libopus`.
  - The `net_fakeloss` help says "concealed by the codec", and the live mode tooltip says "Codec mode".
  - `tests/REFERENCE_2026.md`'s legacy sentence no longer calls Speex a stand-in.
  - The two stale CELT comments in `constants.js` are fixed.
  - README's Visualizer section and LEGACY_CODECS.md say Speex has its own lane colour.
- **Predictions.** `tests/predictions/PREDICTIONS.md` has a dated note under "Changed after registration".
  `predictions.json` is untouched. I could not re-render the predictions: the test signal needs numpy and scipy to
  generate, and neither is installed.

### New checks

`tests/speex.verify.mjs` grew from 39 to 63 checks. `tests/reference.verify.mjs` has one new check. The browser suite
has eight new checks, 179 in all.

- **Frame codes and tables.** Speex frames carry code 7, after the others. The chain strip's table equals the
  library's.
- **Render (F2).**
  - Every `snd_bits` from 4 to 16, plus 20, 24 and 32, codes at the expected quality and packet size.
  - With the gate on, a render of two identical parts sends exactly frames 14-66 and 84-136: 120 ms of pre-roll and
    440 ms of hold.
  - The last 10 ms of a 16037-sample source and of a 16000-sample source are coded.
- **Live chain (F1).**
  - With loss and no gate it loses the render's frames, conceals them with Speex and matches the render (r 0.9993).
  - The stream's `restart()` gives the same packets and samples as a fresh stream.
  - The stream's `conceal()` equals the library's concealment.
  - With the gate on it sends the render's frames, and its second talk spurt sends the same 49 packets as the first.
    It reaches only 49 of 53 because the input ends before the hold does.
  - At every `snd_bits` from 4 to 16 it codes at the render's packet size and reports the render's bitrate.
- **Every profile (F1.6, F1.7).** For `steam`, `celt_22` and `speex`, through a watched copy of the codec streams:
  the live chain restarts the codec once for two talk spurts, and with jitter a late frame is neither decoded nor
  concealed (concealments equal lost frames).
- **`tests/reference.verify.mjs`.** A take against a Speex render, whose frames are code 7, is matched in 39 windows
  at 1000.000 ms.
- **Browser.**
  - After a `speex` render: the lane legend reads "Speex 26", drawn in its own colour; the console line is "S_Voice:
    Speex 1.2.1, 8 kbps CBR, 20-byte packets of 20 ms, native PLC (Speex 100%)"; the status reads "Ready · Speex 1.2.1
    · 8 kbps"; the strip reads "Speex 8 kHz narrowband · CBR 8 kbps · 20 ms frames". None of these, nor the option,
    say CELT, Opus or SILK.
  - The strip shows 2.15/2.15/2.15/3.95/3.95/3.95/5.95/5.95/5.95/5.95/8/8/8 kbps for `snd_bits` 4-16.
  - In the live monitor, the panel's mode reads "Speex", and a recorded Speex take's console line, status and legend
    say Speex.

### Each listed break fails a check

These were run with a keep-going copy of `tests/speex.verify.mjs`, one break at a time, each restored. The page-text
breaks were run in the browser suite.

| Break | Failing check |
|---|---|
| F1.1 `createSpeexStream.restart()` does nothing | the live stream's restart() starts a fresh encoder and decoder…; each live talk spurt restarts Speex… |
| F1.2 live `conceal()` returns silence | with net_fakeloss the live chain loses the render's frames… (r 0.6418); the live stream's conceal() is Speex's own concealment (−240 dBFS) |
| F1.2b live `conceal()` repeats the last packet | the same two (r 0.8006) |
| F1.3 live chain ignores `snd_bits` | at every snd_bits from 4 to 16 the live chain codes at the render's quality… (4:20B/8000 …) |
| F1.4 live chain uses `max(6000, …)` | the same (4:15B/5950 …) |
| F1.5 live gate pre-roll dropped for Speex | with the gate on, the live chain sends the render's frames… (wrong at 14-19, 84-85); each live talk spurt restarts Speex… |
| F1.6 late frame concealed (shared code) | steam, celt_22 and speex: a late frame plays silence… (39 concealed for 36 lost, …) |
| F1.7 `voice.restart()` removed (shared code) | steam, celt_22 and speex: the live chain restarts the codec… (0 restarts); each live talk spurt restarts Speex… |
| F2.1 render pre-roll 0 | with the gate on, a render sends 120 ms before each burst… (47 of 141 gated, wrong at 14-19, 84-85) |
| F2.2 render hold 0 | the same (79 of 141 gated, wrong from 45) |
| F2.3 `Math.floor` frame count | the last 10 ms of a 16037-sample source are coded (−240 dB), also of 16000 samples, and the gate check |
| F2.3b no frames for the codec delay | the last 10 ms of a 16000-sample source…; the gate check |
| F2.4 wrong quality at `snd_bits` 14 | snd_bits 14 (7 kbps) codes at quality 4… (quality 2, 15 bytes) |
| F3.1 live chain reports the scaled bitrate | at every snd_bits… (4:6B/6000 …) |
| F3.2 a wrong value in the strip's table | the profile's table of quality bitrates is the library's |
| O1 render logs Speex as CELT / counts it as CELT | every frame is one 20-byte packet, logged and counted as Speex; `tests/verify.js` "speex: Speex 1.2.1 at 8 kbps" |
| O1 live stream mode `'celt'` / code map without speex / stats without a speex count | its frames are 20-byte Speex packets, logged and counted as Speex |
| O1 Speex code renumbered to 4 | Speex frames have their own frame code, 7, after the others |
| O1 `reference.js` counts only codes 1-3 | Real take against a Speex render: its frames (code 7) count as coded (0 windows) |
| P1 `live-worker.js` does not count code 7 (browser) | the live panel and a recorded speex take name Speex, not CELT or Opus |
| P2 `describeModes` totals only SILK, hybrid and CELT (browser) | the console line names Speex 1.2.1 and its mode ("Speex 2600%") |
| P3 the live panel has no Speex label (browser) | the live panel and a recorded speex take name Speex… (mode —) |
| P4 the chain strip shows the scaled bitrate (browser) | at every snd_bits from 4 to 16 the chain strip shows the bitrate Speex runs at (4:2 … 14:7 15:7.5) |
| P5 the lane has no Speex style (browser) | the speex page check times out waiting for the lane legend: the visualizer throws at the missing style |
| P6 the status line says Real Opus for every codec (browser) | the status line names Speex 1.2.1 ("Ready · Real Opus · 8 kbps") |
| P7 a live take is labelled `libopus` (browser) | the live panel and a recorded speex take name Speex… (the take's status said Real Opus) |

`tests/verify.js` was also run on the two shared-code breaks, F1.6 and F1.7. It passes under both: the new checks are
in `tests/speex.verify.mjs`, which runs in `pnpm test`.

### The other profiles are unchanged

The reviewer's hash script was not in its scratch folder; only its table was. I wrote an equivalent script with the
same cases. It renders a seeded 5 s signal at 48 kHz: voice-like bursts of 0.6 s every 1.6 s over a −70 dBFS floor.
Each of the four profiles runs under five settings: the defaults, the gate off, the gate on, loss with jitter, and the
gate with loss, jitter and `snd_bits` 10. For each case the script hashes the render, its frame log, the live chain's
output (fed 20 ms at a time) and the live frame codes. It ran on a `git archive` of `origin/main` (`bded46b`) and on
the branch, before the fix round's code (`6ef27cc`, renders and live output only) and after it (with the frame logs
and codes added to the hashes, main re-hashed the same way). `diff` against main printed nothing both times. The table (first 16 hex digits of
SHA-256), identical on main and the branch:

```
steam    defaults                   render 150588e598e87e29 n=240000 gated=72 spurts=4  live 1a30a9c0190ba7a4 n=233204 log b2517fae0e8c6965 codes 0b43b5c4e44896eb
steam    nogate                     render 52aa797204652871 n=240000 gated=0 spurts=1  live daca0de491e30e7b n=238916 log 977808d33d280bca codes ec17466465cbd286
steam    gate                       render 150588e598e87e29 n=240000 gated=72 spurts=4  live 1a30a9c0190ba7a4 n=233204 log b2517fae0e8c6965 codes 0b43b5c4e44896eb
steam    loss+jitter                render 10158f24d93c5e87 n=240000 gated=72 spurts=4  live 95be42e1015de37c n=233204 log 07cb61936f1898b5 codes 2e37ccce3d78795e
steam    gate+loss+jitter+bits10    render ffdb20b24f3c549a n=240000 gated=72 spurts=4  live c3612a81d156dee6 n=233204 log 07cb61936f1898b5 codes 2e37ccce3d78795e
steam_48 defaults                   render b22f6be96a0445c1 n=240000 gated=72 spurts=4  live 55dd78bde01fd189 n=234180 log b2517fae0e8c6965 codes 6228163adbff18fa
steam_48 nogate                     render 3675a05207a4ec08 n=240000 gated=0 spurts=1  live 3fe81e1b34e3db0d n=239892 log 977808d33d280bca codes 3034a430f721c147
steam_48 gate                       render b22f6be96a0445c1 n=240000 gated=72 spurts=4  live 55dd78bde01fd189 n=234180 log b2517fae0e8c6965 codes 6228163adbff18fa
steam_48 loss+jitter                render 0a059368e3ca1a95 n=240000 gated=72 spurts=4  live 4f366b2fbd4ea80e n=234180 log 07cb61936f1898b5 codes 1edfb1358dd50792
steam_48 gate+loss+jitter+bits10    render 5ade5f0772867899 n=240000 gated=72 spurts=4  live a7b501d114af35a1 n=234180 log 07cb61936f1898b5 codes 1edfb1358dd50792
celt_22  defaults                   render 6bbe8d84f8250e8a n=240000 gated=0 spurts=1  live e4d315afd6b82de7 n=239611 log 9625289f8f942410 codes 1fe5264818c8d3a1
celt_22  nogate                     render 6bbe8d84f8250e8a n=240000 gated=0 spurts=1  live e4d315afd6b82de7 n=239611 log 9625289f8f942410 codes 1fe5264818c8d3a1
celt_22  gate                       render 4d9b0c7238359908 n=240000 gated=62 spurts=4  live d98fc99a2feea3d6 n=234038 log 0f825fcfb3f8499d codes 9c8127bda628fb54
celt_22  loss+jitter                render 2747fccc194e8f40 n=240000 gated=0 spurts=1  live f8eb829bf8ef7e03 n=239611 log 1a957e0efe7e373d codes 9add36a26ed435bc
celt_22  gate+loss+jitter+bits10    render 6d1f23ecf52fcb46 n=240000 gated=62 spurts=4  live 3ee4ce5aa9190325 n=234038 log 6ff0d8f8025f100f codes fefa76abd952c682
celt_44  defaults                   render a74d55244f937d96 n=240000 gated=0 spurts=1  live fd8407b248d01092 n=239892 log a9191733a35cd3bd codes e414e783b8576479
celt_44  nogate                     render a74d55244f937d96 n=240000 gated=0 spurts=1  live fd8407b248d01092 n=239892 log a9191733a35cd3bd codes e414e783b8576479
celt_44  gate                       render 55faf7803f7c6e59 n=240000 gated=243 spurts=4  live 0b48ef5feb00126c n=234040 log e86e8feb04ebf254 codes a95c4d2ca9678785
celt_44  loss+jitter                render 3c3a2fce1c22283c n=240000 gated=0 spurts=1  live 26896e891524e630 n=239892 log edfffe444d15eeda codes 2d0f4270b481ad00
celt_44  gate+loss+jitter+bits10    render 079d9e23cb557d45 n=240000 gated=243 spurts=4  live ce9ea2019bdd23d8 n=234040 log 3ae8fccc62cc6278 codes d6ea98696b2f35f4
```

### Checks at the end of the round

- `pnpm test`: exit 0. The suite totals were `209 passed, 0 failed`, `119 Opus checks passed`, `63 Speex checks
  passed`, `41 paired-reference checks passed.`, `66 passed, 0 failed`, `23 passed, 0 failed`, `45 video checks
  passed` and `31 demo checks passed`.
- `pnpm test:vendor`: unchanged, `Speex 1.2.1 build matches its recorded hash.` (no codec file changed).
- Browser suite (`flock /tmp/tf2ve-heavy.lock env CHROMIUM_EXECUTABLE=… node tests/browser.verify.js`): `179 browser
  checks passed`, exit 0.
- CI: run 42720604296 on `f39f7dc` (the code and docs of this round) succeeded. The run on the commit that adds this
  section is reported in the returned summary.
- I scanned the diff and the commit messages before the push: no recordings, personal details, machine paths,
  SteamIDs or model names, apart from the required trailers.
