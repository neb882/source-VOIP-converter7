# W3-12b report: the speex profile runs the game's module

Branch `claude/w3-12b-speex-profile`, from `main` at `7c6b8f3`, with `origin/main` merged in once (docs only). Built
to `docs/work-orders/W3-12-speex-module.md`, part b, with its amendments.

**Status: done.** `pnpm test`, `pnpm test:vendor`, the browser suite and CI pass. Every new check fails when its line
is broken (table below). There was nothing private to run.

## What changed

The `speex` profile is now the game's `vaudio_speex` module as W3-09 read it: Speex 1.0.2 (`vendor/speex-1.0.2`,
built in W3-12a) fed the engine's 11025 Hz sound with no resampling to 8000 Hz.

| | Before | Now |
| --- | --- | --- |
| Library | Speex 1.2.1 (`vendor/speex`) | Speex 1.0.2 (`vendor/speex-1.0.2`), with its framer |
| Codec rate | 8000 Hz, a resampler each side | 11025 Hz, the voice rate too: nothing resamples around the codec |
| Frame | 160 samples, 20 ms | 160 samples, 14.51 ms, 20 bytes, 11025 bit/s |
| `snd_bits` | picked the quality whose bitrate was nearest | picks nothing |
| In and out | floats; the decoder's floats / 32768 | 16-bit: rounded at `encode`; decoded samples wrap past full scale |
| New talk spurt | `restart()`, a new codec | `reset()`, request 26 on both sides, and a new framer on the same codec |
| Lost frame | Speex's concealment | zeros; the decoder is not called |
| Delay trimmed | 80 samples at 8000 Hz (the library's look-ahead) | 80 samples at 11025 Hz (7.26 ms, measured in W3-12a) |

### Files

- `constants.js`: `CODEC_PROFILES.speex` is `engine: 'speex', codecRate: 11025, frameSize: 160, packetBytes: 20,
  bitrate: 11025, voiceRate: 11025, mixer: 'linear', status: 'modeled'`, display name "vaudio_speex (Speex 1.0.2 on
  11 kHz sound, 11 kbps)". `qualityBitrates` is gone. The comment says it is read from the module, cannot be
  recorded, and plays zeros for a lost frame; the header comments follow.
- `opus-codec.mjs`: `speexRoundTrip` and `createSpeexStream` on `vendor/speex-1.0.2`. New: `SPEEX_RATE` (11025),
  `speexInput` (the 16-bit rounding), and an internal `openSpeex` holding the codec, its framer and a count of wrapped
  samples. Both functions refuse any rate but 11025.
- `audio.js`: the three call sites drop the `bitrate` option; `codecResultInfo` reports `runtime: 'speex-1.0.2'`,
  `packetBytes` from the stream, `plc: 'zeros'` and `wrappedSamples`. Two comments name the Speex frame.
- `index.html`, `app/console.js`, `app/render.js`: the page's words (below).
- `sw.js`: the two `vendor/speex-1.0.2` files in place of the 1.2.1 ones; cache `v23`.
- Removed: `vendor/speex/`, `tests/speex/`, `tests/speex.verify.mjs`. `tests/vendor-opus.mjs` drops the 1.2.1 hash;
  `package.json` drops the suite.
- Tests: `tests/speex102.verify.mjs` (the profile's checks added; the 1.2.1 comparison through a recorded hash),
  `tests/verify.js`, `tests/reference.verify.mjs`, `tests/render-stream.verify.mjs`, `tests/browser.verify.js`.
- Documents: `README.md`, `tests/LEGACY_CODECS.md`, `tests/predictions/PREDICTIONS.md` (a dated note).
- Not touched: `live.js` and `live-worker.js` read the frame from the chain and the mode name `speex`, which did not
  change, so nothing in them needed to. `tests/gain.verify.mjs` (below).

## Where the 16 bits are made

In `opus-codec.mjs`, `speexInput`, called by the stream's `encode` for every caller (`speexRoundTrip`,
`createRender`, the live chain), and nowhere earlier: `max(-32768, min(32767, round-half-even(x * 32768)))`. The
game's capture is 16-bit. On the way out the module's own conversion stands (`toInt16` in `vendor/speex-1.0.2`:
truncation toward zero, the low 16 bits, no clamp), and the samples go on as `q / 32768`. A sample counts as wrapped
when the decoder's float is past full scale and its 16-bit value is on the other side of zero.

## The delay

80 samples at 11025 Hz, trimmed as `roundTrip` trims libopus's. It is the encoder's 240-sample window less the frame;
1.0.2 has no look-ahead request. W3-12a measured it (a voice-band signal through the pair peaks at lag 80, r 0.977)
and its suite pins it. Here, on a voice-band source with harmonics from the second to 4.5 kHz: the codec's output
lines up with its input at -0.14 samples at 11025 Hz (r 0.980), and a 48 kHz render with its source at -0.69 samples
at 48 kHz (r 0.985). Trimming 79 or 0 fails the check (table).

## The checks, and how each was broken

The new checks are in `tests/speex102.verify.mjs` (70 in all; 41 new), with changes in four other suites. A harness
(`breaks.py` in the scratch folder, not committed) copied the tree, made one break, ran the named suites with
`check()` logging instead of asserting, and listed what failed. The browser breaks were run one at a time, as that
suite stops at its first failure.

| Break | What failed |
| --- | --- |
| **R1 a new codec in place of the reset at a talk spurt** (`reset()` frees and creates a codec) | speex102: "the second spurt's decoded frames are those of a decoder reset (request 26) between the spurts"; "and not those of a new codec: at least one of its first three frames differs" `[equal, equal, equal]`; "the stream's restart() is the codec's reset, not a new codec". render-stream: the `speex, gate on, loss 15%, jitter 300 ms` golden |
| R2 no reset at all | the decoder-reset check, "the encoder is reset too", the stream's restart check |
| **S1 resampling to 8000 Hz put back** (profile at 8000 Hz, codec accepts 8000) | speex102: the profile table `[8000 Hz …]`; the render's codecInfo `[8000 Hz, 20.00 ms, … 8000 bit/s]`; the frame count; snd_bits; "Missing expected rejection" (the rate guard). verify.js: `Speex 1.0.2 at 11.025 kbps`; "keeps the band from 4.5 to 5 kHz" `[-54.1 dB rel]` |
| S2 resampling to 8000 Hz inside the round trip and back | **the band** `[-9.3 dB at the voice rate]`, the frame count, the wrap count, the reset checks, loss, the live chain against the render, the last partial frame |
| **W1 a clamp in place of the wrap** (in `opus-codec.mjs`) | "a loud source gives wrapped samples in the render" `[0 samples wrapped]`; part a's signal `[0 through the stream; 0 in a render]` |
| W2 a clamp in the module's `toInt16` | part a's native 16-bit hashes, its wrap checks, and the two above |
| I1 input `Math.round` (ties up) | "the float sound is rounded to 16 bits with ties to even and clamped" `[1 2 3 0 -1 …]` |
| I2 input not clamped (`Int16Array` wraps it) | the same `[… -32768 -25536 -32768 25536]` |
| I3 input truncated | the same `[0 1 2 …]` |
| D1 79 samples trimmed | the delay check `[0.86 samples at 11025 Hz; 3.67 at 48 kHz]`, the codecInfo, the reset and loss placements, the live chain's delay `[peak at -3]` |
| D2 nothing trimmed | the same, and the frame count and the last partial frame |
| L1 a lost frame repeats the last decoded one | "the lost frame and the late one play as zeros" |
| L2 the decoder sees a lost frame (zeros played) | "the decoder is not called for a lost frame"; the live chain under loss `[r 0.5084]` |
| B1 main's `snd_bits` line put back (bitrate scaled) | "snd_bits changes nothing" `[differs at snd_bits 2 4 10 15 24 32]` |
| G1 the profile without `frameSize` (gate on 20 ms frames) | the profile table; "the profile's gate switch … (pre-roll 8, hold 30)" `[pre-roll 6, hold 22]`; the live chain throws `Expected one 20-byte Speex frame, not 40 bytes` |
| P1 the profile at 8000 bit/s | the profile table |
| **C1 `codecResultInfo` says `plc: 'speex'`** (createRender differs from process) | render-stream: the four Speex chunked cases `[codecInfo differs: plc]` and the interleaved-renders check |
| C2 `codecResultInfo` reports 0 wrapped | **passed every suite at first** (the render-stream cases never wrap). Fixed: "createRender gives that render too, its samples and its count" on a loud source; it now fails `[0 wrapped]` |
| C3 the stream's `restart()` does nothing (createRender, live) | render-stream: `speex, gate on …, chunks: uneven` `[123006 samples differ]`; speex102: the stream's restart check |
| V1 the module is Speex 1.2.1 behind the 1.0.2 interface (restored from git in the scratch copy) | "the packets are not those of the Speex 1.2.1 module (its recorded hash)" `[4de57d83…]`, every native hash, the reset and delay checks |
| T1 `reference.verify.mjs` reads the Speex log on 20 ms frames | **passed at first** (every frame was coded, so any grid agreed, as W3-06 found for CELT). Fixed as the CELT case is: the first 30% of the frames are marked unsent and the windows must start near 6 s. Now fails `[from 7.5 to 20 s]` |
| H1 the menu option keeps main's words | speex102: the page's option `[vaudio_speex (Speex, 8 kHz, 8 kbps, unconfirmed)]` |
| chain strip without "snd_bits not used" | browser: "at every snd_bits from 4 to 16 the chain strip shows the module's one setting, and that snd_bits is not used" |
| `render.js` names Speex 1.2.1 | browser: "the status line names Speex 1.0.2" `[Ready · Speex 1.2.1 · …]` |
| S_Voice says "native PLC" for Speex | browser: "the console line names Speex 1.0.2, its frames, and zeros for a lost frame" |
| `sw.js` without the two 1.0.2 files | browser: "after the first visit … every file the page needs offline is cached" |

Not caught, and why: a framer kept across spurts instead of a new one. Each call is one whole frame, so the framer
never keeps a sample; a new framer and an old one behave the same. It is made new because the order says so.

The order's named checks map as: the profile table; `codecInfo` (11025, 14.51 ms, 20 bytes, Speex 1.0.2); the band;
nothing shifted; wrapped samples (at least one, and part a's case); the reset; the delay; `createRender` equals
`process()` (render-stream's four Speex cases, and the loud case above). What `tests/speex.verify.mjs` checked of the
profile moved into `tests/speex102.verify.mjs`: the gate switch reaching the round trip, the frame log, loss and late
frames, determinism, the last partial frame, the live chain, and the shared "every profile" live-chain block (steam,
celt_22, speex).

## The band, and the figures against main's profile

Seeded white noise at -20 dBFS RMS at 11025 Hz, gain off, volume 1. The level is the mean power per FFT bin in each
band, so bands of different widths compare.

| | This branch | Main (Speex 1.2.1 at 8000 Hz) |
| --- | ---: | ---: |
| 4.3–4.9 kHz against 0.7–2.7 kHz, the 11025 Hz voice signal | **+0.5 dB** (bound: within 8) | **-31.7 dB** (the order: at least 15 down) |
| the same in the render at 44.1 kHz (mixer droop in) | -4.0 dB | -35.6 dB |
| 5.6–6.5 kHz against 0.7–2.7 kHz, the render | -9.6 dB | -67.6 dB |

The check passes on the voice signal, read through a hook: the test's copy of `opus-codec.mjs` records what
`speexRoundTrip` returns inside the render. No figure was tuned.

On the brief's third bound (5.6–6.5 kHz at least 30 dB down): it is not in the order as it stands. The order had it
and dropped it in its revision of 2026-11-10 (commit `786c385`), replacing it with "measure on the 11025 Hz voice
signal … so that the mixer's images are not in the band". At 11025 Hz that band is above Nyquist. In the render it
holds the linear mixer's images of the codec's top band, at -9.6 dB, so the bound would fail there. I did not add it.

Further figures, in a 48 kHz render (gain off) unless said, against main's profile:

- **Band edge**, white noise relative to 0.5–2 kHz. The voice signal: -3 dB at 5.2 kHz, -1.0 dB at 5.0 kHz, -4.7 dB at
  5.4 kHz; never -20 dB below Nyquist. The render (with the linear mixer's droop): -3 dB at 3.8 kHz, -3.8 dB at 4.5
  kHz, -6.9 dB at 5.0 kHz, -11.8 dB at 5.4 kHz. Main's render: -3 dB at 3.6 kHz, -20 dB at 4.15 kHz, -43 dB at 4.5 kHz.
- **Low end**, the same noise: -1.5 dB at 100 Hz and -1.2 dB at 200 Hz (main: -3.8 and -1.0). 1.0.2 has no high-pass.
- **Level**, a voice-band signal at -20 dBFS RMS: -21.6 dBFS with the gain off (main -20.3), -5.4 dBFS with it on (main
  -5.2). Its correlation with the source: r 0.982 (main 0.853).
- **Spectrum**, that signal with the gain off, this branch minus main, in 50 Hz bands: -1.2 dB from 0.25 to 2 kHz,
  +0.8 dB at 2–3 kHz, +1.7 dB at 3–3.4 kHz, +4.5 dB at 3.4–3.8 kHz, +20.6 dB at 3.8–4.5 kHz and +60 dB at 4.5–5.5 kHz.
  RMS difference 0.1–3.8 kHz: 2.2 dB.
- **Nothing shifted**: pulses 200 a second come out with their strongest autocorrelation lag at 4.989 ms (r 0.872).

## Wrapped samples

- A loud voice (voiced, peaks clipped at full scale, 2 s at 48 kHz, gain off): **97 samples wrapped** in the render,
  and the same 97 through `createRender`.
- Part a's speech-like signal, made as the order says (its 16-bit samples at 11025 Hz / 32768, gain 1, no filter):
  **2,106** through the profile's stream over its 276 frames, part a's count. A render gives **2,122**: it codes a
  277th frame to flush the 80-sample delay (`ceil((44160 + 80) / 160)`), and that frame wraps 16 more. The check
  holds both. The capture's clip at 32767/32768 turns the signal's -32768 samples into -32767; that changes no wrap.

## Golden hashes

Only the four Speex cases moved, in their own commit (`fb65ea8`), with the reason in the file:

- `speex` and `speex, gate on, loss 15%, jitter 300 ms`: WAV and codecInfo.
- `speex, 100 samples at 96 kHz`: codecInfo only (the output is unchanged).
- `speex, source at 8 kHz` became `speex, source at 11.025 kHz`, so that it still needs no resampling into the codec.

With the old hashes, `--hashes` printed 47 cases: 43 equal to the recorded ones, the three above moved, and the
renamed one new. CI on the code commit (`33e2766`) failed on exactly those golden checks; on `fb65ea8` it passed.

## Readings where another was possible

1. **The band is measured on the voice signal, through a hook.** A render's output is at least 44.1 kHz, so "a render
   at 11025 Hz" cannot be had; the source is at 11025 Hz and the codec's output is read inside the render. The
   render's own figure is in the check's detail.
2. **Level in a band** is the mean power per bin (a spectral level), not the band's total power.
3. **Part a's 2,106** holds through the stream; the render's 2,122 is 2,106 plus the flush frame (above). Both are
   checked. "Wrapped" means the 16-bit sample is on the other side of zero from a float past full scale; part a's
   2,106 is that count (its "past full scale" count is 2,107). For the square wave I wrote 6,953 in LEGACY_CODECS
   (wrapped; 6,956 pass full scale, three of them by less than a step), where the order says 6,956.
4. **"The page says so where it says it for CELT."** The page says nothing about `snd_bits` for CELT (CELT scales its
   packet by it). For Speex the chain strip adds " · snd_bits not used" when `snd_bits` is not 16, and the console's
   `snd_bits` help says vaudio_speex ignores it. At 16 the strip shows the order's words exactly.
5. **The codec menu** carries the order's words: "vaudio_speex (Speex 1.0.2 on 11.025 kHz sound · 20-byte frames of
   14.51 ms · 11.025 kbit/s)". The profile's display name is the shorter one item 1 gives.
6. **Zeros "on the page"**: the S_Voice console line says "a lost frame plays as zeros" in place of "native PLC", and
   its loss line "played as zeros". That is in `app/render.js` beyond the codec name the file list mentions; a live
   take of the speex profile carries `plc: 'zeros'` too. `plc` in codecInfo is `'zeros'`.
7. **The count of wrapped samples** is a codecInfo field, `wrappedSamples`, filled by the stream as it decodes. The
   order asked for a count "through a hook"; a field lets `createRender` be held to `process()` on it.
8. **The 1.2.1 comparisons** in `tests/speex102.verify.mjs`: the first keeps its point through the SHA-256 of the 1.2.1
   module's packets on the speech-like signal, `4de57d83ef2dc9e6c30e84233ec44b3b68a2588509efbb21c2efa43618525f80`,
   recorded from that module before it was removed. The second ("1.2.1's decoder reads the 1.0.2 packets") is
   dropped: it needs a 1.2.1 decoder.
9. **The renamed golden case** (above), within "only the speex cases may move".
10. **The live chain's correlation under loss**: the old suite asked r > 0.999 against the render; here the chain and
    the render agree at r 0.998 with no loss at all (the resamplers' edges), so the loss case asks r > 0.99 and that
    every frame code matches the render's.
11. **Status** stays `'modeled'` in the table (the field's values are measured, experimental, modeled); "codec and
    settings read from the module; not recorded" is the profile comment and README's status column.

## The order's other lines

- **The stale `celt_44` comments** in `tests/gain.verify.mjs` and `tests/reference.verify.mjs` were fixed by W3-06's
  fix round: the gain comment describes 22.05 kHz and 1024-sample frames, and the reference test reads the CELT
  grid from the render and says 46.4 ms. Left alone.
- **The closing grep** (`1\.2\.1\|vendor/speex/` outside `docs/`, `node_modules/`, `REFERENCE_2026.md`) finds:
  `README.md` and `tests/speex102.verify.mjs` (the recorded-hash check against 1.2.1), `tests/LEGACY_CODECS.md` (1.2.1
  had an input high-pass), `tests/predictions/PREDICTIONS.md` (the W1-01 history and this order's note), and
  `tests/speex102/build.mjs` line 7, a part a comment that says it builds 1.0.2 "as tests/speex/build.mjs builds
  1.2.1". That file is not on part b's list, so it is left; the folder it names is gone.
- **README** "Files and licensing" table and notice line now name `vendor/speex-1.0.2/` (`COPYING.speex` and
  `NOTICE`); W3-13 merges main in after this.

## Found in passing, outside the order's files

- `app/visualizer.js` line 872: the codec lane's legend says "Speex: CELP speech coding, narrowband up to 4 kHz". It
  is now up to 5.5 kHz. Not on the file list, so left; a one-line text fix.
- `tests/gain.verify.mjs` has a `decodedFromFrames` check "at Speex's rates (8 to 11.025 kHz)". It is a check of the
  mapping between rates, still valid; the profile no longer uses those rates.

## For W3-11a's builder (next in `audio.js`)

- The Speex branch in `process()`, `createRender` and `createLiveChain` now passes no options to
  `speexRoundTrip(samples, codecRate, common)` and `createSpeexStream(codecRate)`; both refuse any rate but 11025.
- The Speex stream has `restart()` as a reset of the same codec, not a new one; `conceal()` returns zeros without
  touching the decoder; it has a `wrapped` getter and `packetBytes`. Anything that wraps a stream by spreading it
  (`{ ...stream }`) freezes the getter: forward it, as `tests/speex102.verify.mjs`'s watcher does.
- `codecResultInfo`'s Speex branch has two new fields, `plc: 'zeros'` and `wrappedSamples`; `process()`'s info has
  them from `speexRoundTrip`.
- `CODEC_PROFILES.speex` now has `frameSize` and `packetBytes`, so every place that reads `codec.frameSize` (the gate's
  frame length, the live chain's frame) gets 160 samples at 11025 Hz: 14.51 ms frames, pre-roll 8, hold 30.

## Runs

- `pnpm test` under the heavy lock: exit 0 (verify 216, gain 67, opus 139, Speex 1.0.2 and profile 70, reference 41,
  formats 66, file rate 53, meter 50, video 45, demo 36, render-stream 146, voice channel 127, Steam sender 58). The
  final run, after the merge of main, is in the hand-back.
- `pnpm test:vendor`: every build matches its recorded hash, ending `Speex 1.0.2 build matches its recorded hash.`
- Browser suite, `CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) flock
  /tmp/tf2ve-heavy.lock node tests/browser.verify.js`: `221 browser checks passed`, exit 0.
- CI (`tests`): run 42782942244 on `33e2766` failed as expected (the Speex goldens before re-recording); runs
  42783280707 on `fb65ea8` and 42783537936 on `e7c7219` passed. The head's run is in the hand-back.
- The diff and commit messages were scanned for recordings, personal details, machine paths and model names: none,
  the trailers aside.
