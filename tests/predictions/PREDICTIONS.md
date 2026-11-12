# Pre-registered predictions

The model in this app was fitted to recordings (Sets A–F in [REFERENCE_2026.md](../REFERENCE_2026.md)). Since then most of it has been replaced by rules read from the game's files; the notes under "Registration" say when. A model fitted to data is expected to reproduce that data; the test is whether it predicts recordings it has never seen. This folder holds such predictions, for six takes that had not been recorded when the predictions were made:

- **P1** `sv_voicecodec vaudio_celt`: the legacy engine codec.
- **P2** `sv_voicecodec vaudio_celt_high`.
- **P3** `voice_scale 2`.
- **P4** `voice_avggain 1`.
- **P5** `voice_maxgain 3`.
- **P6** `volume 1`.

None of those settings appear in any recording so far. P1 and P2 each test two hypotheses the model cannot settle on its own.

The app rendered each take before it existed and measured the render the way a recording is measured. Those numbers are in [`predictions.json`](predictions.json), whose SHA-256 is registered at the end of this file and timestamped by the commit that added it. The takes are scored against that file as it stands, even if the model changes afterwards. Whatever the result, it is reported here as it comes out, misses included.

## Files

- [`plan.json`](plan.json): each take and its console commands, the hypotheses and the app settings that render each one, and the tolerances.
- [`predictions.json`](predictions.json): written by `node tests/accuracy.mjs --write-predictions`. For every hypothesis it holds:
  - every segment's level, band level, peak and clipped share
  - the take's ceiling and overall clipped share
  - the spectrum profile
  - codec frame counts
  - the SHA-256 of the test signal and of every model file the render used
- `node tests/accuracy.mjs --score-predictions --takes <folder> [--json out.json]` scores whichever predicted takes are in the folder. It first checks this file's registered hash, and reports whether the model files have changed since.
- `node tests/accuracy.mjs --simulate-takes <folder> --ambience <take>` writes stand-in takes for a dry run (see "Checking the scoring").

## Recording the takes

Record exactly as for Set B ([tests/testsignal/README.md](../testsignal/README.md), "Recording setup"):

1. Play `tf2_voice_testsignal_v1.wav` at 100% into the virtual cable TF2 uses as its microphone.
2. Set `voice_loopback 1`, hold the voice key for the whole signal, and record only the game's output, losslessly (OBS, then FLAC).
3. Use the same map and quiet spot as Set B, and keep still. Game sound is the scoring's noise floor, so the quieter the better.
4. Start each take from default voice settings: `voice_scale 1`, `voice_maxgain 10`, `voice_avggain 0.5`, `volume 0.15`. Then apply only the take's own commands, and restore the defaults afterwards.
5. Save each take under its file name below; the scorer finds files by name.

| Take | File | Console | What it tests |
| --- | --- | --- | --- |
| P1 | `P1_vaudio_celt.flac` | `sv_voicecodec vaudio_celt; changelevel <map>; voice_loopback 1; volume 0.15` | The engine's CELT codec (CELT 0.11, 22050 Hz, 512-sample frames, 64-byte packets), and whether Steam's voice gate still applies |
| P2 | `P2_vaudio_celt_high.flac` | `sv_voicecodec vaudio_celt_high; changelevel <map>; voice_loopback 1; volume 0.15` | 44100 Hz CELT with 120-byte packets (165 kbps) or 32-byte packets (the "44 kbps" of Valve's wiki) |
| P3 | `P3_voice_scale_2.flac` | `voice_scale 2; voice_loopback 1; volume 0.15` | Finding 4: `voice_scale` enters the gain ramp twice |
| P4 | `P4_voice_avggain_1.flac` | `voice_avggain 1; voice_loopback 1; volume 0.15` | Finding 3's gain law at its peak-only end |
| P5 | `P5_voice_maxgain_3.flac` | `voice_maxgain 3; voice_loopback 1; volume 0.15` | Finding 3's gain cap |
| P6 | `P6_volume_1.flac` | `volume 1; voice_loopback 1` | Finding 1: the clamp is int16 full scale times `volume` |

`sv_voicecodec` is a server setting, so record P1 and P2 on your own listen server (`map <map>`), and set `sv_voicecodec steam` (TF2's default, as Set D's demo shows) afterwards. **P6 is about 16 dB louder than the others, so turn the speakers down first.**

## What the model predicts

Levels are in dBFS, measured in each segment's band (see "Scoring rules"). "Silent" means nothing is transmitted, so only game sound is left. Clipped shares count the samples within 10% of the take's clamp. Each segment's full prediction is in `predictions.json`.

**P1, `vaudio_celt`.** Both hypotheses predict the same clamp (−16.44 dBFS, 6.8% of samples clipped) and the same loud segments: for example, the 1 kHz sine at −12 dBFS comes out at −18.8 with 37% clipped. CELT at 22050 Hz passes nothing at 10 kHz and above: the 10–13 kHz tones fall to −110 dBFS or lower. The hypotheses differ only below Steam's gate:

| Segment (input level) | `no_gate` (primary: the engine codec has no gate) | `steam_gate` (Steam's gate runs before CELT) |
| --- | --- | --- |
| 1 kHz sine −60 dBFS | −59.6 | silent |
| 1 kHz sine −54 | −53.5 | silent |
| 1 kHz sine −48 | −47.7 | silent |
| 1 kHz sine −42 | −41.6 | silent |
| pink noise −42 | −41.2 | silent |
| quiet pink noise −50 | −49.2 | silent |

**P2, `vaudio_celt_high`.** Both hypotheses predict the same clamp (−16.45 dBFS, 8.9%) and the same speech-band levels. They differ at the top, and in how 32-byte packets clip steady tones:

| Segment | `bytes_120` (primary) | `bytes_32` |
| --- | --- | --- |
| tone 10 kHz −20 dBFS | −21.1 | −37.7 (2% clipped) |
| tone 11 kHz | −21.4 | −39.1 (2%) |
| tone 12 kHz | −21.7 | −43.3 (2%) |
| tone 13 kHz | −22.1 | −42.4 (1%) |

The 10–13 kHz tones at −21 to −22 dBFS are themselves a prediction: Steam's Opus at default settings passes the 10 kHz tone at −22.3 dBFS, the 11 kHz tone at −39.2 and nothing at 13 kHz, while this codec passes them almost untouched.

**P3, `voice_scale 2`.** The clamp stays at −16.48 dBFS, and 29% of all samples sit within 10% of it (9.6% at default settings). Examples:
- The 1 kHz sine at −24 dBFS comes out at −17.9 with 65% clipped; at −12 dBFS, −17.5 with 80% clipped.
- The sweep is 75% clipped.
- The synthetic vowel comes out at −18.6 with 47% clipped.
- The −36 dBFS sine rises to −49.0, against −58.6 at default settings.

**P4, `voice_avggain 1`.** 4.9% of samples are clipped, half the default share. The −12 dBFS sine comes out at −19.5 with 20% clipped (default: −18.6, 44%). Steady pink noise at −20 dBFS comes out at −25.8 (default: −23.1).

**P5, `voice_maxgain 3`.** 1.9% of samples are clipped. Quiet inputs rise at most 9.5 dB instead of 20 dB, so the −24 dBFS sine comes out at −33.6 (default −23.1) and steady pink noise at −30.9. The −12 dBFS sine, −21.3, is no longer clipped.

**P6, `volume 1`.** The clamp is at 0 dBFS. Everything else matches the default take 16.5 dB louder: 9.7% of samples clipped, the −12 dBFS sine at −2.1 with 45% clipped, and steady pink noise at −6.7.

## Scoring rules

Everything below was fixed before any predicted take was recorded. The numbers are in `plan.json` under `tolerances`.

- **Where a segment is measured.** Over the middle 60% of every segment of 0.5 s or more, after the take is lined up with the test signal talk spurt by talk spurt (the accuracy suite's alignment, against the primary hypothesis's render).
  - Levels are taken in the segment's band: 30 Hz either side of a steady tone or 1 kHz sine, and 150 Hz–10 kHz for noise, sweeps, clicks and the vowel.
  - Game sound is broadband and a tone is not, so a tone stays measurable 20 dB or more below the recording's broadband level.
- **Game sound.** The take's ambience in a band is the median level, in that band, of its quiet segments of 1 s or more.
- **Levels.** Any segment predicted at least 10 dB above the ambience in its band must come within **1 dB**. A segment predicted lower passes if the take is also below that line plus 1 dB, since game sound adds to whatever the hypothesis predicts.
- **Clipping.** The clamp is the level where the take's samples pile up. The clipped share counts the samples within 10% of it, and must come within **5 points** wherever either side is over 0.5%.
- **Spectrum.** The take's band profile (relative to 300 Hz–3 kHz) must come within **1.5 dB** in every band from 120 Hz to 10 kHz.
- **Not scored.** The sync beeps at each end of the signal. Each is the first voice after a long pause, so its level depends on the receiver's gain before the take.
- **Reported apart for Opus hypotheses.** Steady signals that Opus DTX can take over, where Steam's encoder and the model differ from take to take (findings 13 and 14):
  - the tones from 7 kHz up
  - the 1 kHz sines at −36 and −30 dBFS, which the model sends as DTX for 97% and 35% of their frames

  For CELT they are scored in full, because CELT has no DTX.
- **A prediction holds** if at least 90% of its scored segments and 8 of the 9 spectrum bands are within tolerance, and the clamp is within 0.5 dB.
- **Two hypotheses.** They are compared only on the discriminating segments: those where no single measurement could pass both. That covers predicted levels more than 2 dB apart, and cases where one hypothesis predicts a level more than 1 dB above the line the other's "nothing here" allows.
  - The verdict goes to the hypothesis that passes more of them.
  - It is **decisive** if there are at least 3 such segments, the winner passes two thirds of them or more, and the other passes a third or fewer.
  - Otherwise the take does not decide between them, and this file will say so.

## Checking the scoring

**Controls.** The four Set B takes, recorded before any of this, are scored the same way (C1–C4 in `plan.json`). They show what the tolerances mean for a model already fitted to them:

| Control | Setting | Segments within tolerance | DTX-sensitive (apart) | Level error, dB rms | Spectrum bands | Clamp error | Holds |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | defaults | 34/34 | 7/11 | 0.06 | 9/9 | 0.0 dB | yes |
| C2 | `voice_scale 0.5` | 34/34 | 6/11 | 0.19 | 9/9 | −0.1 dB | yes |
| C3 | `voice_maxgain 1` | 34/34 | 8/11 | 0.12 | 9/9 | −0.3 dB | yes |
| C4 | `voice_avggain 0.25` | 34/34 | 7/11 | 0.06 | 9/9 | 0.0 dB | yes |

The DTX-sensitive column shows why those segments are reported apart: between 3 and 5 of the 11 miss in every control.

**Dry run.** `--simulate-takes` makes a stand-in for every hypothesis: the app's own render, 3 s in, with real game sound added (the quietest 30% of a real take's 100 ms stretches, from the C1 take and from a Set F take). In a stand-in the model is exact by construction, so these check the measurement and the scoring rules, not the model. The test is whether the scorer names the hypothesis each stand-in was made from:

| Stand-in made from | Primary / other hypothesis: segments within tolerance | Discriminating segments passed | Verdict |
| --- | --- | --- | --- |
| P1 `no_gate` | `no_gate` 43/43 (holds), `steam_gate` 38/43 | 4 of 4 against 0 of 4 | `no_gate`, decisive |
| P1 `steam_gate` | `no_gate` 38/43, `steam_gate` 43/43 (holds) | 4 of 4 against 0 of 4 | `steam_gate`, decisive |
| P2 `bytes_120` | `bytes_120` 45/45 (holds), `bytes_32` 36/45 | 6 of 6 against 0 of 6 | `bytes_120`, decisive |
| P2 `bytes_32` | `bytes_120` 35/45, `bytes_32` 45/45 (holds) | 6 of 6 against 0 of 6 | `bytes_32`, decisive |
| P3, P4, P5, P6 | 34/34 each (all hold) | | |

The results were the same with either game sound. Every stand-in gets the verdict of the hypothesis it was made from, and each P1 and P2 verdict is decisive.

## Decided while building the scorer

The rules were changed several times before registration, each after seeing a control or a stand-in fail for reasons unrelated to the model. These choices were made with no predicted take in existence, and the history is in git:

- **Band levels instead of broadband.** Game sound is about −52 dBFS broadband in Set B, so the quiet segments that decide P1 could not be scored broadband. The band edges were narrowed to ±30 Hz for tones when a stand-in with louder game sound left P1 with only one discriminating segment.
- **The clamp search.** A game sound riding on a clipped stretch put a stand-in's loudest sample 2.1 dB above the clamp, outside the 2 dB window the search used. The window is now 6 dB, and the chosen step must stand out as a plateau.
- **Clipping measured within 10% of the clamp, at 5 points.** At 5%, game sound pushed plateau samples out of the window: stand-ins lost up to 6 points with the model exact.
- **The sync beeps are not scored.** The controls missed them by up to 1.8 dB, because the receiver's gain before a take is unknown.
- **Two more DTX-sensitive segments.** Control C4's −36 dBFS sine came in 9 dB above the model, which sends that segment as DTX. The rule adopted is: every segment the model sends as DTX for 25% or more of its frames. That adds the 1 kHz sines at −36 and −30 dBFS.
- **The two-hypothesis rule.** Ranking hypotheses by level error favored a hypothesis that predicts silence, because silent segments carry no error. The verdict now rests on the discriminating segments.

## Registration

SHA-256 of predictions.json: `e7de7a477c5b629d1a9f1664fd3f44146c995bd0e5036e18fd40374fb9432b43`

Changed after registration, before any predicted take existed: `reference.js` now reads a render's frame log on its codec's frame grid (23.2 ms for `vaudio_celt`, 5.8 ms for `vaudio_celt_high`). It had assumed 20 ms, so for P1 and P2 it judged the wrong frames when choosing which windows refine a take's alignment. That changes how CELT takes are lined up, not any predicted value. The dry run above was not repeated after the change; it needs a real take for its game sound.

Changed after registration, 2026-11-09, before any predicted take existed: `audio.js`, `constants.js`, `opus-codec.mjs` and `reference.js` changed for W1-01. The `speex` profile now runs Speex 1.2.1 instead of an Opus SILK stand-in. Speex frames have a seventh frame code, 7, that `reference.js` counts as coded, and the live chain reports the bitrate Speex runs at. No predicted take uses `speex`. Renders of the other profiles are unchanged. For `steam`, `steam_48`, `celt_22` and `celt_44`, a seeded 5 s voice signal was rendered under five settings: the defaults, the gate off, the gate on, loss with jitter, and the gate with loss, jitter and `snd_bits` 10. In all 20 cases the render, its frame log, and the live chain's output and frame codes have the same SHA-256 on main (`bded46b`) and on the branch (the table is in `docs/reports/W1-01-speex.md`). The predictions themselves were not re-rendered: that needs the test signal, which needs numpy and scipy to generate.

Changed after registration, 2026-11-10, before any predicted take existed: `audio.js` and `opus-codec.mjs` changed for W2-02. `audio.js` gained `TF2Audio.createRender`, which makes the same render a piece at a time, and `streamAutoGain` (the live chain's auto-gain) gained a `flush()` it uses; `opus-codec.mjs`'s `createSpeexStream` also reports the Speex complexity and enhancement its round trip reports. One thing `process()` calls changed, after W2-02's review: `resampleLinear` (the `celt_22` and `speex` mixer) now gives an empty signal for an empty one, where it gave one NaN sample; that changes only an empty source through a room with those profiles, which threw before and now renders the room's silent tail. No predicted take is empty, so no render a prediction rests on changes: `tests/render-stream.verify.mjs` checks `process()` against the SHA-256 of its WAV and codecInfo in 47 cases, made by the code before the change (commit `7e1862c`), on every run.

Changed after registration, 2026-11-10, before any predicted take existed: `audio.js` changed for W3-05. The receiver's automatic gain is now the engine's rule as W3-03 read it from the binary, and that rule is verified against the game sample for sample: applied to Set H's `voice_maxgain 1` recording it gives the `voice_maxgain 10` recording on all 291,840 samples before the last packet. The predictions were rendered with the earlier rule, which differed in four ways: the ramp's step divided the gain difference by 128 (the engine divides by 127), the block mean kept its fraction (the engine's is an integer), a block of zeros left the gain where it was (in the engine a decoded block of zeros sends it to its cap; the app still holds it where the gate sent nothing), and a render's first block started at `voice_scale` (the engine resets to unity when a channel is assigned). They are scored as registered. The expected effect on a prediction's levels is small: the step differs by one 1/128 unit in some blocks, the mean by under one part in it, the first 128 samples of a render are at unity, and after a decoded silence the gain starts at its cap where it had held; the order expects each take's level within 0.03 dB rms of the earlier rule's (0.3 dB on every segment of the Set B `voice_scale 0.5` take, whose sawtooth is the step). The measured figure (the accuracy table on the takes then in hand, before and after the change): every take's level is within 0.003 dB rms of the earlier rule's and its worst segment within 0.006 dB; no column of the table moved by more than its last printed digit. `tests/render-stream.verify.mjs`'s golden hashes were re-recorded for this change: 40 of its 47 renders moved, all with the auto-gain on; the seven that did not are the two with it off and five the change cannot reach.

Changed after registration, 2026-11-10, before any predicted take existed: `constants.js`, `opus-codec.mjs`, `audio.js` and `demo.js` changed for W3-06, and the CELT module (`vendor/celt-0.11`) was rebuilt. The CELT profiles now have the settings the game's module has (W3-03), and the codec is built as the module is (W3-08): the pitch pre-filter and post-filter compiled in, a reset after creation, 16-bit samples in and out. **P1** was rendered at complexity 10, and the game's module runs 5. Rendering the test signal (generated locally) through `celt_22` at both, under both P1 hypotheses, moves none of the 57 segments' band levels: the largest change is 0.000 dB, on the old build and on the new. Complexities 5 to 10 are one encoder (with the filter compiled out, 4 to 10 are). Both P1 and P2 were rendered with the filter compiled out, an encoder that on Set H's input is 2.7 dB further from the input than the game's; with it out, the app's decoded samples were 17 to 23 dB from the game's, and the rebuilt codec reproduces them to the last bit but for 76 of 585,216 samples (W3-08). That bears on how closely any P1 or P2 take can match. **P2**'s two hypotheses are both settings the engine never selects (256-sample frames at 44.1 kHz, with 120 or 32 bytes). The engine runs `vaudio_celt_high` as the 44100 Hz mode with 1024-sample frames and 128-byte packets, on 22050 Hz sound, so the game should show nothing above about 10 kHz and, under loss, gaps in units of 46 ms: the registered prediction is expected to fail at the top of the band. Since registration the owner recorded both codecs with a file as the microphone (Set H; not the registered takes, which play the test signal through the cable): the packets are 512 and 1024 samples at 22050 Hz. The predictions are not re-rendered and are scored as registered. The scorer's alignment render uses today's profile, which changes how a P2 take is lined up and no registered value. This change registers nothing new. `tests/render-stream.verify.mjs`'s golden hashes were re-recorded for it: the six CELT renders moved, and no other.

Changed after registration, 2026-11-10, before any predicted take existed: `constants.js`, `opus-codec.mjs` and `audio.js` changed for W3-12b. The `speex` profile now runs the game's `vaudio_speex` module as read (W3-09, section 5): Speex 1.0.2 (`vendor/speex-1.0.2`) on 11025 Hz sound with no resampling to 8000 Hz, in place of Speex 1.2.1 at 8000 Hz; `vendor/speex` was removed. No predicted take uses `speex`. Renders of the other profiles are unchanged: of `tests/render-stream.verify.mjs`'s golden hashes only the four Speex cases moved, and the other 43 did not.

Changed after registration, 2026-11-10, before any predicted take existed: `audio.js`, `constants.js` and `opus-codec.mjs` changed for W3-11a, and the libopus 1.1.5 module (`vendor/libopus-1.1/libopus-1.1.5.wasm.mjs`, a hashed model file) was rebuilt with the library's 16-bit decoder exported; its float path gives the same packets and samples as before. A render with the `steam` profile now sends and decodes as Steam does (W3-09; findings 28 and 29): Steam's sender (`steam-sender.js`: chunks of the capture gated on the mean of |x| at 1% of full scale or a peak at 15%, 100 ms kept, a 0.4 s hold) in place of the 20 ms frame gate; the capture rounded to 16 bits before the encoder; the library's 16-bit decoder under Steam's decoder rules (at most 10 frames concealed a gap); FFmpeg's libswresample (`vendor/swresample/swresample.js`) once per message in place of the app's 24 to 44.1 kHz resampler, everything after its first packet 0.67 ms late; the gain fed the decoded packets, with no block held where the gate sent nothing; complexity 9, which gives the same packets as 10. The predictions C1 to C4 and P3 to P6 render `steam` and were rendered with the earlier path. They are scored as registered. What can move in them: talk-spurt edges (on a speech-like source most moved by under 50 ms; a quiet onset whose 20 ms frames passed the old threshold but whose chunks' means do not opened 0.4 s later, and a pause can now split a spurt or close one earlier), levels within a block or two after a silence (where the gain no longer holds), the band from 10.5 to 13.5 kHz (the resampler's roll-off and the mirror it leaves above 12 kHz), and loud segments (the decoder's soft clip before 16 bits); the orchestrator's accuracy run before and after records by how much. P1 and P2 render the CELT profiles and are unchanged. `steam-sender.js` and `vendor/swresample/swresample.js` are model files now but are not in `tests/accuracy.mjs`'s list of hashed model files. Of `tests/render-stream.verify.mjs`'s golden hashes the 32 `steam` renders with the codec on moved, and the 16 others did not.

Changed after registration, 2026-11-10, before any predicted take existed: `steam-sender.js`, `audio.js` and `constants.js` changed for W3-16. Steam's sender, which a `steam` render runs, now holds a spurt as Steam's client does (read, `docs/reports/W3-16-steam-hold-read.md`): the time of each read is seconds since the sender's Steam started, narrowed to a 32-bit float, and the spurt's last chunk is the first one read with `now > noted + 0.4` in floats (the 0.4 the float nearest it, the sum rounded to a float, strictly greater), also on the read that first finds a chunk inactive and on a read that brings no samples. A render takes the sender's Steam to have run 9 days unless `steamUptime` says otherwise (the page's "Sender's Steam has been running"); there the float moves in steps of 1/16 s and the hold is 375 to 437 ms of real time where it was an exact 400. 9 days is the middle of the one range that Set D's spurt ends, tested on the demo's own chunks, leave: 6.1 to 12.1 days (W3-16 second read). The read clock is the one measured in Set J (W3-14): reads 48.0 to 63.7 ms apart, uniform and never late, each 750-sample capture step ready up to 13 ms after its time, in place of reads tied to a 15.625 ms timer with 6% late by up to 30 ms. Its public figures (300,000 reads of the default seed, `tests/steam-sender.verify.mjs`): chunks of 750 / 1500 / 2250 samples 23.30 / 74.65 / 2.06%; 17.90 reads a second; spurt ends on the 7th / 8th / 9th chunk after the last active one 26.5 / 70.8 / 2.8% at 9 days and 20.0 / 80.0 / 0.01% at 4 hours. Through the sender, on a 10 s signal and seeds 1 to 400: openings of 8 / 6 / 9 frames 82.0 / 13.5 / 4.5%, game ticks between messages of 3 / 4 / 5 30.5 / 66.6 / 2.9%, 17.90 messages a second. The predictions C1 to C4 and P3 to P6 render `steam` and were rendered with the earlier sender; they are scored as registered. What can move in them: where a spurt ends (the order expects about 9 ms earlier on average, and more scattered), whether a pause of about 0.4 s splits a spurt, where a spurt starts (by up to a chunk: the capture steps are split between reads differently), and the level of the blocks around those edges. The orchestrator's private runs of 2026-11-10 give: against the two-PC demo, the hand clock puts spurt starts right in 18 of 20 and ends in 18 of 20 (bars 17 and 16) at every uptime; drawn clocks meet both bars in 194 of 200 seeds at the default uptime; the mean tail over twelve spurts is 472.6 ms against Steam's 462.3, a difference within one recording's scatter (9.4 ms over seeds); the accuracy table is unchanged on the clean takes; the engine re-timing check reads about 32 ms later at every spurt start, because a message now arrives later after its last sample, and the spread of arrivals now matches the game's own log (the 2% to 98% width 41.3 ms against the log's 42.5; the old sender's 31.3), so the receiver's fixed zero and its bars belong to the receiver's order; the speech take stays worse after re-zeroing (117 ms against 88). P1 and P2 render the CELT profiles and are unchanged. Of `tests/render-stream.verify.mjs`'s golden hashes the 33 renders through Steam's sender moved, and the 18 others did not.

Changed after registration, 2026-11-10, before any predicted take existed: `audio.js` and `constants.js` changed for W3-11b. The live monitor's chain for `steam` now runs the render's own stages (Steam's sender, the 16-bit decoder, Steam's resampler, the gain on the decoded packets); the threshold's control is read one way everywhere (`null`, `undefined` and `''` are the profile's own threshold, where the frame gate read `null` as 0 dBFS); `constants.js` changed only in comments and `steam_48`'s name. No render moved: `tests/render-stream.verify.mjs`'s golden hashes, all 51, are the same before and after, and no prediction passes a threshold. The predictions are scored as registered.

Changed after registration, 2026-11-10, before any predicted take existed: `audio.js` and `constants.js` changed for W3-10. Everything after the receiver's gain is now the engine's, as read (W3-07; the upsampler's read, `docs/reports/W3-10-upsampler-read.md`), and then the listener's PC's: the voice entered into the mix at 255/256, truncated; the CELT voices upsampled by two once and the Speex voice twice by the engine's rule, in place of the app's linear interpolation (one and three 44.1 kHz samples late, as in the game); the mix clipped at ±32767, `volume` multiplied in single precision and the result rounded to 16 bits; then linear interpolation from 44100 to the device's rate, 48000 Hz by default, a model fixed by the recordings. This replaces the fitted 3-tap filter, the float `volume`, the sinc resampler to the source's rate and the soft limiter at 0.98. Renders are at the device's rate. `volume` now defaults to 1, the game's own (the page's 0.5 before); every prediction passes its own `volume`, so no prediction's settings change. The predictions were rendered with the earlier stage and are scored as registered. What can move in them: every level by the 255/256 (−0.034 dB); a clipped plateau at `volume 0.15` sits at 4896 where it sat at the ceiling, 4915 (−0.034 dB), so a predicted ceiling found from the plateau is that much lower; the bands above 5 kHz by the interpolator's sinc² against the filter (the plan's review expects, each within 0.05 dB: the 300 Hz to 3 kHz anchor about 0.025 dB lower, 5 to 8 kHz +0.10 dB, 8 to 10 kHz +0.13, 10 to 11 kHz +0.13, 11 to 12 kHz +0.10, 12 to 16 kHz −0.12, 16 to 19 kHz −0.90); and faint images of the band's top above 12 kHz, which the filter did not make. The WAV writer also changed: until W3-10 every positive sample of a download was written one unit low; a prediction is computed from the render's floats, not its file, so none moved by that. Of `tests/render-stream.verify.mjs`'s golden hashes, 48 WAV hashes moved and 3 did not (the empty source, and the two sources that are gated whole and render as silence at 48 kHz before and after); no `codecInfo` hash moved; the gain's output, hashed in each of the 51 cases before the change (a control this order added), is the same after it.

Changed after registration, 2026-11-11, before any predicted take existed: `audio.js` changed for W3-17c, and the page and the workers now load `room-dsp.js` and `room-presets.js` before it. A render with a room or under water now runs the engine's room as read (W3-15, the two W3-17 second reads; the module of W3-17a and W3-17b): the voice entered twice, at its direct share and its room share of 256, the room share through the room's preset, the sum before the clip, and under water the whole sum through preset 14; the reverb's tail lengthens the render. The old room code (its own processors, a 0.45 wet mix on every preset, the listener's 900 Hz low-pass under water) is gone. No predicted take has a room: every prediction renders with no room and not under water, and such a render runs nothing of the room. Of `tests/render-stream.verify.mjs`'s golden hashes none moved, WAV or `codecInfo`, in the 50 cases with no room; one case was removed with the stage it tested (a listener's low-pass with no room, which no shipped setting reaches), and eleven room cases were added. The predictions are scored as registered.

Changed after registration, 2026-11-11, before any predicted take existed: `audio.js` and `opus-codec.mjs` changed for W3-19. On the engine codecs' profiles (`celt_22`, `celt_44`, `speex`) the receiver's gain now runs on the decoder's stream from its first sample, the codec's delay (64, 128 and 80 samples) included, and the delay is dropped after the gain, where it was dropped before it; the game's gain counts its 128-sample blocks from the decoder's first sample (Sets H and M). The output keeps its length and alignment; only the gain's blocks move, by 64 samples on `celt_22` (on `celt_44` the delay is one whole block, and only its first blocks change). P1 and P2 render the CELT profiles at `voice_maxgain 10` and were rendered with the earlier blocks; they are scored as registered. What can move in them: the gain's ramps by 64 samples on `celt_22`, and the level of a render's first blocks; the predictions were not re-rendered (that needs the test signal), so by how much was not measured. No other profile changed. Of `tests/render-stream.verify.mjs`'s golden hashes only renders of the three profiles with the gain on moved; five cases added for this change and recorded before it (`voice_maxgain 1` on each profile, the gain off on two) did not.

Changed after registration, 2026-11-11, before any predicted take existed: `audio.js` and `constants.js` changed for W3-17d. The page now asks a render for its room as `opts.room` and `opts.underwater` (no room by default, `DEFAULT_LISTENER`); `constants.js`'s `LISTENER_POSITIONS` holds the page's new places, with the older positions kept for old links and older callers, `DSP_PRESETS` keeps only names, and the built-in presets read `DEFAULT_LISTENER`. In `audio.js` a listener position that names its room is mapped to that room, the room's options are resolved by `roomPreset` (the same code, split out of `resolveRoom`), and the live chain takes a room path from the live monitor's worker. No render changes: every prediction renders with no room and not under water, as before. Of `tests/render-stream.verify.mjs`'s golden hashes none moved and none was recorded.

Changed after registration, 2026-11-11, before any predicted take existed: `constants.js`, `opus-codec.mjs`, `audio.js` and `reference.js` changed for W3-20b. A new profile, `miles`, runs `vaudio_miles` (Voxware VR12, `vendor/voxware-vr12`) as the Source engines of 2006 and 2007 ran it; it is not a TF2 codec, and it has not been checked against any recording of a running engine. Its frames have an eighth frame code, 8, that `reference.js` counts as coded, as it counts Speex's 7. The other profiles' paths changed only by branches they do not take and a `vr12` key in the live chain's mode counts. No predicted take uses `miles`, and no prediction is registered for it. Of `tests/render-stream.verify.mjs`'s golden hashes none moved, WAV, `codecInfo` or the gain's output, in the 68 cases recorded before it; eight `miles` cases were added and recorded. The predictions are scored as registered.

Changed after registration, 2026-11-11, before any predicted take existed: `audio.js`, `opus-codec.mjs` and `constants.js` (comments only) changed for BC-1. On the `steam` profile loss now takes whole messages: each of the sender's messages is one packet, lost by a draw of its own; a lost message's frames are encoded and never decoded, and up to ten of them are concealed in front of the next frame to arrive; its end marker is not delivered, so the decoder carries its state into the next spurt; a message over 12 frames is resampled and then refused; and every played frame lies at its own time, the frames nobody fills left silent, where the sound closed up before. `createSteamDecoder` counts a gap from the numbers (its `lost()` is gone) and gained `carry()`. The per-frame mask on `steam` keeps only the late frames of jitter, drawn as before with a loss of 0. No predicted take has loss: every prediction renders at loss 0 with no jitter, where nothing of this runs, so no render a prediction rests on changes. Of `tests/render-stream.verify.mjs`'s golden hashes only the five `steam` renders with loss moved (WAV, `codecInfo` and the gain's output); every render at loss 0 and every render of another profile, loss cases included, did not. The predictions are scored as registered.

Changed after registration, 2026-11-12, before any predicted take existed: `audio.js` changed for W4-01b (the render's speed with the same samples). In a worker the render's yields are a turn of a MessageChannel instead of a timer; `process()` takes `opts.signal`, which ends a render at its next yield with an AbortError; the `steam` render reports its progress once per 64 messages through Steam's resampler, the gain and the laying. `process()` takes `opts.stages` and `opts.sourceKey`: it keeps the capture signal at the codec's rate (A) and the codec stage's result (B) for the next render of the same source and starts from them when the options read before each are the same; after the review of the same day `process()` reads every option once, when it is called, as before W4-01b, and the keys hold each option as the stages use it; a frozen or foreign `stages` object keeps nothing; `steam`'s kept B leaves out the sender's samples, which nothing after it reads. `TF2Audio.previewAllowed()` says at which settings a render of a source's first 15 s is, over its first 14 s, the whole render (the page's first seconds). No render moved: every golden hash of `tests/render-stream.verify.mjs` is as recorded, and `tests/stages.verify.mjs` gives each of them again from warm stages.

Changed after registration, 2026-11-12, before any predicted take existed: `constants.js` changed for S3-03. Its two lists `TF2_DATA.playerNames` and `TF2_DATA.chat` changed: the player names are now invented ones, and one chat line was reworded so that it names nobody. No render reads either list: outside `constants.js` the only file that names them is `app/core.js`, which prints the page's mock server lines in its console. No other part of `constants.js` changed, so no render a prediction rests on changes. The predictions are scored as registered.

Changed after registration, 2026-11-12, before any predicted take existed: `audio.js` changed for S3-02 and ten files were added to the hashed model files. The engine's code was moved, unedited, out of `audio.js` into `engine/dsp.js`, `engine/gain.js`, `engine/mix.js`, `engine/network.js`, `engine/codec.js`, `engine/room.js`, `engine/steam.js`, `engine/render.js`, `engine/render-stream.js` and `engine/live-chain.js`, which the page and both workers load before it. `audio.js` keeps the codec module's loader and builds `TF2Audio` from them, with the same members. `tests/accuracy.mjs` now hashes those ten files with the others (`MODEL_FILES`); `predictions.json` does not list them, so the scorer names them as changed. `constants.js` changed in comments only. No render changed: every recorded hash of `tests/render-stream.verify.mjs` (`GOLDEN`, `GAIN_GOLDEN`) and of `tests/stages.verify.mjs` is unchanged, and each engine suite's whole output is the same before and after (`docs/reports/S3-02a-engine-split.md`). The predictions were not rendered again.

Changed after registration, 2026-11-12, before any predicted take existed: `engine/steam.js`, `engine/render.js` and `engine/render-stream.js` changed for W3-02c-2, and `engine/mix.js` and `engine/room.js` in comments only (all five are hashed model files); the page and both workers now load `voice-channel.js` (not a hashed model file). A `steam` render given `opts.timeline` `'game'` plays its packets through the receiver's voice channel as the game runs it: the wait, the queue, one sample dropped from every packet, the fade, a gain reset at each channel opened, and a lost message not handed on. `'game'` on another profile, with the codec bypassed, on a demo's voice or with `retime`, and any other value of `timeline`, is a `RangeError`. No prediction asks for `'game'`, so none can move: without the option every render is the one before, bit for bit. Of `tests/render-stream.verify.mjs`'s golden hashes none moved, WAV, `codecInfo` or the gain's output; cases on the game's timeline were added and recorded. The predictions are scored as registered.

## Results

Not recorded yet.
