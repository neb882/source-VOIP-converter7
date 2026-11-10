# W2-02 report: a render made a piece at a time, equal to `process()`

Branch `claude/w2-02-render-stream`, from `main` at `61fcb92` (W1-01 merged), with `origin/main` merged in twice
after the first push (`6cd299f`: W2-01 and the W3 orders; `7059578`: the W3-01 and W3-03 reports). Files changed: `audio.js`, `opus-codec.mjs`, `package.json`,
`tests/render-stream.verify.mjs` (new), `tests/predictions/PREDICTIONS.md` and this report. `process()` is unchanged,
as is everything it calls.

## Commits

- `7e1862c` Golden renders: record `process()`'s WAV and codecInfo for W2-02's matrix. The test with the matrix and
  the hashes and nothing else, before any `createRender` code existed. CI passed on it, every hash matching on
  GitHub's runner.
- `d3de850` Merge `origin/main` (W2-01, W3 orders). No conflicts; `main` touched none of this order's files.
- `43c302a` `TF2Audio.createRender`: `process()` a piece at a time, equal bit for bit. The stream, its tests, the
  Speex stream's two fields, the PREDICTIONS note, and one more golden case (below).
- `96d3101` Render-stream test: four renders in turn, and the memory check as `--memory`.
- `ede9d8e` This report, then `cfc6e4a`, a merge of `origin/main` at `7059578` (docs and `tests/retiming.mjs`; no
  conflicts), and this note of its CI run.

## What was built

`TF2Audio.createRender(source, opts)` resolves to `{ outputLength, sampleRate, push(chunk), finish(), free() }`, as
spec point 1 has it. `source` is `{ sampleRate, length, numberOfChannels: 1 }`; another channel count is a `TypeError`
(`process()` would downmix; the page's capture signal is already mono). `push(chunk)` takes float PCM of any length,
zero included, copies it, and resolves to the output samples that became final; `finish()` after exactly `length`
samples resolves to `{ samples, codecInfo, realOpus }`. A push past `length`, a `finish()` before it, a call before
the previous one resolved, and any call after `finish()`, `free()` or a failure are refused. `free()` during a push
lets that push finish and then releases the codec (a cancel can arrive during the codec loop's yield). `onProgress`
gets the share of the source pushed after each push, and 1 at the end. The codec loop yields as `roundTrip` does (at
a sent frame whose index is 31 mod 32).

How each stage carries over a chunk edge (spec point 3):

- **Capture.** Finiteness checked per chunk (the `TypeError` names the sample's index in the whole source), mic gain
  in a `Float32Array` as `process()` multiplies it, then `hardClip`.
- **Sinc resamplers** (source to codec rate, codec to voice rate, mixer when it is sinc, mix to output rate):
  `streamResampleSinc`, given at the end exactly the zeros its last outputs read, and cut to `resampleSinc`'s length
  (`max(1, round(n * up / down))`, `n` for equal rates and for an empty signal). `resampleSinc` skips the inputs past
  the end; the stream adds `0 * h[k]` for them, which changes no sum that starts at +0.
- **The linear mixer** (`celt_22`, `speex`) is a stage of its own, not `streamResampleLinear` flushed with zeros:
  `resampleLinear` clamps both neighbours to the last input, so its last outputs lean on the last sample, and a zero
  flush gives different samples there (break B6 below). The stage computes each output with `resampleLinear`'s
  expression once both its inputs are in hand, which at the end includes the clamped ones; an empty input gives the
  one NaN sample `resampleLinear` gives, which the output cut removes in both paths.
- **Zero-phase FIRs** (capture EQ, decoder EQ, output FIR): causal, the first `(taps - 1) >> 1` outputs dropped and
  as many zeros pushed at the end, but not through `streamFir`. A first build with `streamFir` gave every case equal
  under `===` and in its WAV bytes, yet 463 samples were zeros of the other sign (-0 for +0), all in the five cases
  whose output rate is 44.1 kHz (sources at 44.1, 22.05, 24 and 8 kHz): `streamFir` starts its sum at its first term,
  so a window whose every term is -0 sums to -0, where `applyFirZeroPhase` starts at +0 and gives +0. A probe at
  24 kHz with mic gain 0 (which makes every negative sample -0) and the gate off gave 10,968 such zeros in the
  output, with the same packet sizes and the same samples under `===`. With no resampler before the capture EQ there,
  the encoder's input can carry them too (it was not inspected), and that its packets cannot change rests on libopus
  treating -0 as +0. So the stage sums from +0 over the taps in `applyFirZeroPhase`'s order: from +0 a sum can never become -0, and
  the zeros read past either end leave every partial sum as it was, so each output is the same double. The live
  chain's `streamFir` is untouched. The test now compares samples bit for bit, and break B8 (the `streamFir` stage
  back) fails exactly those five cases and nothing else.
- **Biquads** (high-pass, the two low-passes, the listener low-pass): `streamBiquad`, whose state and arithmetic are
  `applyBiquad`'s.
- **The gate and the codec.** The number of frames is `ceil((codecLength + lookahead) / frameSize)` with the codec
  stream's own lookahead; the loss mask is `buildLossMask` over all frames, drawn once with a fresh
  `mulberry32(seed)`, the only draw `process()` makes from its `rand`. A frame's RMS is measured when the frame is
  complete (the last ones over the zero-padded end, as `gatePlan`), with `gatePlan`'s sum and divisor. Frames are
  decided one per measured frame: frame `f` is final once frame `f + preroll` is measured, and is sent if the latest
  loud frame measured so far is at `f - hold` or later. Measuring and deciding interleave frame by frame, so no
  frame past `f + preroll` is ever counted; at the end every remaining frame is decided. Sent frames run through
  `createVoiceStream`, `createCeltStream` or `createSpeexStream` in order, the codec restarting at the first sent
  frame after a gated one, as the round trips do; lost frames are concealed, late ones leave zeros, each decoded
  frame lands at `f * frameSize - lookahead`, so frame `f` makes the codec-rate output up to
  `(f + 1) * frameSize - lookahead` final. The input held is the frames waiting on the pre-roll.
- **codecInfo** is built from the stage's counts and the settings `process()` passes, field for field as each round
  trip builds it (`codecResultInfo` in `audio.js`), then `framesPerPacket`, `codec`, `autoGain` and `voiceRate` as
  `process()` adds them. `createSpeexStream` did not expose the complexity and enhancement `speexRoundTrip` reports, so
  `opus-codec.mjs` gained those two fields (the one change there; breaks B10 and B19).
- **Auto-gain**: `streamAutoGain`, which gained a `flush()`: the samples of the last partial block follow the current
  ramp, as `receiverAutoGain` ends. Its block loop is untouched. With the auto-gain off: `voiceScale` in a
  `Float32Array`, then `hardClip`, as `process()`.
- **Volume and the output**: volume in a `Float32Array`; the output cut to `round(n * playbackRate / srcRate)` and
  padded with zeros at the end; `softLimit` (the engine's own) and the finiteness check per chunk.
- **A demo's received voice** skips mic gain, filters, capture EQ, gate and codec, and `codecInfo` is
  `receivedCodecInfo`, as in `process()`.

Rooms and re-timing (spec point 4) are refused with a `RangeError` that names the option (`listenerPos "tunnel"`,
`dspRoom 6`, `retime`), but only where `process()` would apply them, which is a reading of the order to check:

- A room is refused when `resolveRoom` gives a chain `runDspChain` runs (a chain and a mix above 0). `dsp_room 1`
  ("Generic", an empty chain at mix 0) and the custom room at mix 0 render without a room in `process()`, so they
  stream; both are cases in the matrix, equal to `process()`. The order says "dsp_room other than 0"; refusing those
  two as well is one line, if wanted.
- `retime` is refused when the codec runs on the sender's voice. `process()` ignores it for a demo's received voice
  and with the codec bypassed, so the stream does too; both are checked against the recorded renders (break B20).

Memory (spec point 5): every stage keeps its state only, a few frames or filter lengths. What grows with the source
is the frame log (1 byte a frame), the packet sizes (2) and the loss mask (1): 4 bytes a codec frame, 0.7 MB an hour
at Steam's 50 frames a second. The output belongs to the caller; `push` never keeps or reuses an array it returned.

## The test, `tests/render-stream.verify.mjs` (wired into `pnpm test`)

Its engine is `constants.js` and `audio.js` run inside one plain function in the test's own realm, not a `vm`
context as the older suites do (the codec module injected, no timers, as there). The same code gives the same
samples, and two cases are also rendered in a `vm` context against the recorded hashes on every run. `TF2_DIR` points
it at a copy of the sources, which is how the breaks below were run.

- **[1] Golden renders.** The SHA-256 of `process()`'s WAV and of its codecInfo (canonical JSON: keys sorted, typed
  arrays as `{ Type: [values] }`) for all 41 cases, checked on every run, and checks that each case exercises what its
  name says (spurts, SILK, hybrid, DTX, CELT and Speex frames, capture clipping, lost and late frames on every codec).
  40 were recorded in `7e1862c`, before `createRender` existed; all 41 matched on GitHub's runner in CI. The 41st, `steam, volume 0.3`, was added afterwards:
  the matrix's volumes were 0.5 and 1, both exact multiplies, so the order of volume and output FIR was invisible
  (break B13). Its hashes were made by `7e1862c`'s own `audio.js` (`TF2_DIR` at that commit's sources), which also
  gave the other 40 hashes again.
- **[2] Equality.** Each case streamed under its chunk plans into one preallocated array: samples bit for bit (which
  is `===` and the sign of zero), the WAV from `encodeWav` byte for byte against `process()`'s blob, `codecInfo`
  deep-equal (`isDeepStrictEqual`: every counter, `frameLog`, `frameBytes`, `modes`, `lookahead`, `spurts`, `version`),
  and `realOpus`. Then the two `retime` cases `process()` ignores, and four renders (two Opus, CELT, Speex) pushed in
  turn 9,600 samples at a time, each equal to its own `process()` render.
- **[3] The API.** Progress shares, the pushed chunks left as they were, `outputLength` and `sampleRate`, the five
  refusals by name, a stereo source, and the misuse cases above.
- **`--memory <minutes>`**: the memory check alone, not run by `pnpm test` (below).

The matrix (every case at 48 kHz unless it says otherwise, with the options the page sends for its defaults):

- each profile, `steam`, `steam_48`, `celt_22`, `celt_44`, `speex`, on 20 s of speech-like talk spurts with pauses
  (seven spurts for Steam);
- Steam on 15 s with: the gate off; the gate on at -30 dBFS; the codec bypassed; high-pass 250 Hz and low-pass
  3,500 Hz; mic gain 4 (5,360 samples clipped); the auto-gain off; `voice_scale` 0.5; `voice_avggain` 0.25; loss 15%
  with jitter 50 ms and `net_split` 40 ms;
- sources at 44.1, 96 and 22.05 kHz, and 1,000,003 samples (a prime) at 48 kHz;
- a demo's received voice at 24 kHz (a frame log with SILK, hybrid, one lost and one DTX frame, nine spurts), with mic
  gain, filters, loss and the gate set, all ignored;
- 1 s pushed one sample at a time; six minutes of Steam (111 spurts) in 1 s chunks;
- and, beyond the order's list: the gate on with loss and late frames on CELT (both rates) and Speex frames; jitter
  500 ms (late frames that play as silence) and `snd_bits` 4 (SILK frames) on Steam; `steam_48` with loss, jitter and
  `snd_bits` 10; sources at 24 kHz (Steam), 22.05 kHz (`celt_22`) and 8 kHz (`speex`), where nothing resamples into
  the codec; volume 1 with `voice_maxgain` 3; volume 0.3; the auto-gain off with `voice_scale` 3; `dsp_room` 1 and
  a custom room at mix 0; options the page would never send (an unknown codec, strings, out-of-range numbers, a
  negative seed); a test-only profile with a decoder EQ and a test-only position with a low-pass but no room (no
  shipped profile has a decoder EQ, and the one position with a low-pass, `water`, has a room); an empty source,
  one sample, and 100 samples at 96 kHz.

Chunk plans: the default Steam case runs 7, 960, 12,345, one second, an uneven mix and the whole source; every other
case runs one or two of them; the 1 s case runs 1. The uneven mix cycles through 0, 1, 7, 2, 959, 961, 13, 48,000, 0,
4,097, 333, 12,345, 1, 30,011, 480, 481 and 65,537, so empty pushes and pushes that split a codec frame, a resampler
period and an auto-gain block are all in it. 48 streamed runs in all.

## Checks run

| Check | Command | Last lines |
|---|---|---|
| The new suite | `node tests/render-stream.verify.mjs` (under the heavy lock, after `96d3101`'s change) | `128 render-stream checks passed, 0 failed`, about 75 s |
| The Node suites | `pnpm test` | `209 passed, 0 failed` (verify.js), 119 Opus, 63 Speex, 41 paired-reference, 66 formats, 50 meter, 45 video, 31 demo, `128 render-stream checks passed, 0 failed`; exit 0 (under the heavy lock, on `96d3101` with this report's draft) |
| The browser suite | `CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome \| head -1) flock /tmp/tf2ve-heavy.lock node tests/browser.verify.js` | `ok    48000 Hz browser: no page errors`, `179 browser checks passed`, exit 0 |
| The memory check | `node tests/render-stream.verify.mjs --memory 60` (under the heavy lock) | `ok    60 minutes streamed in 1 s chunks peak under source + output + 300 MB of RSS   [peak 1429 MB: source 659 MB + output 659 MB + 110 MB; 118 s (30.4x real time), 1075 spurts]` |
| CI | the `tests` workflow on the branch | success on `7e1862c` (run 42725944175: every golden hash matched on GitHub's runner), `43c302a` (42729249114), `96d3101` (42729466229) and `cfc6e4a` (42733766093), each with `128 render-stream checks passed, 0 failed` and `179 browser checks passed` from `96d3101` on |

`tests/verify.js`'s checks are untouched and pass (209), its live-chain section 10b included, which exercises
`streamAutoGain` after its change.

## Each check broken

Each break is a copy of the sources with one change (two for B4 and B6), run with `TF2_DIR` pointing at it
(`breaks.py` in the scratch folder). Every break failed; none failed a golden check, as none touched `process()`.
B1 to B2b ran before the container restart against the test as of `43c302a` (127 checks); the rest after it, one at
a time under the heavy lock, against the test with `96d3101`'s additions (128 checks).

| Break | How | What failed |
|---|---|---|
| B1 (the order's) | FIR delay dropped one sample too few (`delay - 1`) | 49 checks: every case but the empty source (the output FIR runs in all of them), e.g. `steam`: 627,458 samples differ |
| B2a (the order's) | no resampler flushed | 44 checks, and the run threw in [3]: the codec stage refuses to finish short (`the codec got 479984 of 480000 samples`); the bypassed case differs in its last 81 samples; the received case passes, its voice ending in exact silence |
| B2b | only the output-rate resampler unflushed | 33 checks: the last samples, e.g. `steam`: 17 samples at the end |
| B3 (the order's) | the auto-gain's partial last block skipped | 37 checks: the end of each render, e.g. `steam`: 105 samples |
| B4 (the order's) | the codec restarted at each chunk edge instead of at each spurt | 43 checks: every case that runs the codec, the whole-source plan included (one push, so no restart at all); only the bypassed, received and tiny sources pass |
| B5 (the order's) | the loss mask drawn with `streamLossMask` (one draw per sent frame) | 8 checks: the seven cases with loss or jitter and the gate on, and the four-render check |
| B6 | the linear mixer flushed with a zero, its neighbours unclamped | 6 checks: `celt_22`, the CELT and Speex loss cases, `speex` at 8 kHz, one sample at 22.05 kHz, four renders |
| B7 | the gate decides a frame one frame early | 43 checks: every case that runs the codec; without a gate (pre-roll 0) a frame is coded before its samples have all arrived |
| B8 | `streamFir` in place of the +0-summing FIR | 5 checks: the five cases at 44.1 kHz output, each "0 samples differ and N more are zeros of the other sign" (73, 45, 14, 56, 275) |
| B9 | the output not padded to `process()`'s length | 1 check: 100 samples at 96 kHz (96 samples, not 100) |
| B10 | Speex codecInfo without `enhancement` | 5 checks: the four Speex cases (`codecInfo differs: enhancement`) and four renders |
| B11 | mic gain applied to a demo's received voice | 3 checks: the received case's two plans and its `retime` check |
| B12 | the frame count without the lookahead | 37 checks: every case where the lookahead adds a frame (codecInfo and the last samples); the CELT cases and the prime length, where it adds none, pass |
| B13 | volume before the output FIR | 2 checks: volume 0.3 (21,728 samples) and the test position with a low-pass (80 subnormal samples, where halving is not exact) |
| B14 | the listener low-pass skipped | 1 check: the test position with a low-pass |
| B15 | the decoder EQ skipped | 1 check: the test profile with a decoder EQ |
| B16 | each resampler flushed one zero short | 44 checks, and the run threw in [3] |
| B17 | the capture low-pass run once instead of twice | 3 checks: the high- and low-pass case, `steam_48` and `steam_48` with loss (the page's `lp` 20000 is below 0.45 x 48 kHz, so `steam_48` low-passes) |
| B18 | the partial last block without its ramp (step 0) | 14 checks: the cases whose last partial block carries signal |
| B19 | `createSpeexStream` without `complexity` (`opus-codec.mjs`) | 5 checks: the four Speex cases and four renders |
| B20 | `retime` refused always, not only where it applies | 2 checks: the received and bypassed `retime` cases |

B9, B14 and B15 are each caught by one case only; a reviewer looking for thin spots should start there.

## Memory and time

Node 22.23 on the shared 4-core machine, each run alone under the heavy lock, the page's default Steam settings, the
test's speech-like source at 48 kHz (168 spurts in 10 minutes, 1,075 in 60). Peak memory is
`process.resourceUsage().maxRSS`, in MiB; a source or output of 60 minutes is 659 MiB (691 MB), of 10 minutes 110.
"Function" is the engine loaded as `tests/render-stream.verify.mjs` loads it, a plain function in the main realm, as
the page runs it; "vm" is a `vm` context, as `tests/verify.js` and the W1-03 plan's measurements loaded it. Each
run is its own Node process; the stream wrote into one preallocated output, 1 s pushed at a time.

| Render | Engine loaded | Time | Real time | Peak RSS | Above source + output |
|---|---|---|---|---|---|
| stream, 60 min (`--memory 60`) | function | 118 s | 30.4x | 1,429 MiB | 110 MiB (limit 300) |
| stream, 10 min | function | 19.6 s | 30.6x | 328 MiB | 108 MiB |
| `process()`, 10 min | function | 22.7 s | 26.4x | 623 MiB | 403 MiB |
| stream, 10 min | vm | 73.2 s | 8.2x | 324 MiB | 104 MiB |
| `process()`, 10 min | vm | 80.4 s | 7.5x | 609 MiB | 389 MiB |

- **The memory check passes:** 60 minutes peak at source + output + 110 MiB, under the order's 300 MB. About 61 MiB
  of that is Node and the codec modules (the RSS before the source was made); the rest was not broken down. It is the
  same at 10 and at 60 minutes (108 and 110 MiB), so it does not grow with the source.
- **Time.** The plan's "6x real time" for `process()` (99.2 s for 10 minutes) was taken in a `vm` context on a busier
  machine; here the same load gives 7.5x. Loaded as the page loads it, `process()` runs at 26x and the stream at 30x,
  so a 30-minute render takes about a minute of compute in Node, not the five minutes the plan estimated. The
  browser's speed was not measured.
- **The four 10-minute outputs have the same SHA-256** (`5e5cffb9...`): the stream equals `process()` at 10 minutes,
  under both loads, beyond the six minutes the test covers.

## Covered by a test, and argued

Covered by a test on every run: everything in the matrix above, under the chunk plans listed, bit for bit, with the
WAV and codecInfo; renders interleaved across codecs; the refusals; the misuse cases. The memory check is a
command, not part of `pnpm test`.

Argued, not tested:

- **Any split.** The tested plans are the seven above. That any other split gives the same render rests on each
  stage's output depending only on the sequence of its inputs, never on where a chunk ends: the resamplers, FIRs and
  biquads compute each output from the same inputs in the same order; the auto-gain's blocks are counted from the
  start of the voice-rate signal; the gate decides frame `f` from frames up to `f + preroll` only, whatever the chunk
  sizes. The plans include empty pushes and pushes of 1 and 7 samples, which split every frame, period and block.
- **Lengths beyond six minutes.** The six-minute case has 111 spurts and 18,001 frames. The 10-minute timing runs
  above give the same output SHA-256 for `process()` and the stream under both loads, but they are not part of the
  test; the 60-minute run has no `process()` render to compare with.
- **Rates outside the matrix** (8, 22.05, 24, 44.1, 48 and 96 kHz are tested), such as 11.025, 32 or 192 kHz, or a
  non-integer rate: the lengths use `process()`'s own expressions, rounding included.
- **Settings outside the matrix**: other seeds, `snd_bits`, thresholds and gains go through the same expressions as
  the tested values; the high- and low-pass were tested together, not one at a time.
- **Opus codecInfo defaults.** `runtime`, `application`, `signal`, `complexity`, `vbr` and `dtx` are filled from the
  profile with `roundTrip`'s defaults. Every shipped Opus profile sets each of them, so if a default in
  `opus-codec.mjs` changed, no case would show the stream's codecInfo drifting from `roundTrip`'s.
- **The browser.** The suite runs in Node only; the page and the worker do not use `createRender` yet (W2-03). The
  code is the same JavaScript and the same WebAssembly; the browser suite was run to show the page is unchanged.

## Not done, or uncertain

- The room and `retime` refusals follow `process()`'s behaviour rather than the order's literal "dsp_room other than
  0" (above): the orchestrator may want `dsp_room` 1 refused too.
- The FIR stage departs from the order's "runs as `streamFir`", for bit-for-bit equality (above); with `streamFir` the
  order's own definition (`===`) held.
- `opus-codec.mjs` changed (two fields on the Speex stream), which the order allows only where a codec's frame
  interface lacked something: the round trip's info needed them.
- No browser measurement of the stream's memory; W2-03 runs it in the worker.

## Scan for the hard rules

Before the final push I scanned `git diff origin/main...HEAD`, this report and the branch's own commit messages for
recordings, personal details (names, emails, machine names, paths), SteamIDs and model names. The signals are all
made by the test; the only model name is in the attribution trailer each commit carries, as the session's
instructions require (`claude/` in the branch name aside). Nothing was found to remove.
