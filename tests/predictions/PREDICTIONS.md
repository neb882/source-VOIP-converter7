# Pre-registered predictions

The model in this app was fitted to recordings (Sets A–F in [REFERENCE_2026.md](../REFERENCE_2026.md)). A model fitted to data is expected to reproduce that data; the test is whether it predicts recordings it has never seen. This folder holds such predictions, for six takes that had not been recorded when the predictions were made:

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

## Results

Not recorded yet.
