# 2026 TF2 voice recordings: what they show

Measured locally from 2026-09-24 to 2026-09-27. No recording, source music or derived audio is distributed with this project. The exceptions are the synthetic test signals, whose generators are in [`tests/testsignal/`](testsignal/).

Six sets of recordings were made on private servers, playing files into TF2's microphone input through a virtual audio cable:

- **Set A** (music): one MP3 of two songs, recorded with `voice_loopback 1`.
- **Set B**: a calibrated test signal recorded under four settings, plus the owner's own speech, all with `voice_loopback 1`. All are lossless FLAC.
- **Set C**: a one-minute network test signal recorded under simulated packet loss and jitter, plus the owner's speech under loss. All are lossless FLAC.
- **Set D**: the test signal sent from one PC to a dedicated server with SourceTV. The set has three parts: the demo, holding Steam's own voice packets; the sender's loopback output; and the output of a second account on a second PC.
- **Set E**: an 8 s music clip recorded with `voice_loopback 1`, with the app's render of the same clip.
- **Set F**: a low-tone test signal recorded with `voice_loopback 1`, at default settings and with `voice_maxgain 1`.

Set B identified the receiver law, and Set A and the speech take validate it. Set C measured what loss and jitter do to the voice. Set D separates the sender from the receiver: its packets show exactly what Steam's encoder sent, and the recordings show what the game made of them.

On 2026-11-10 three more sets were made with the game's own debug output and no recorder, and the game's and Steam's own files were read (see "What was read"):

- **Set G**: console logs of the receiver's queue on a local game with `voice_loopback 1`, at the default cap of 300 frames a second and at `fps_max` 67 and 100.
- **Set H**: `vaudio_celt` and `vaudio_celt_high` with a file as the microphone, the game writing its own decoded voice to a file.
- **Set I**: the same with `sv_voicecodec vaudio_speex`.

Set G confirms the receiver's queue as read from the engine. Set H checks the receiver's gain and the two CELT codecs sample for sample. Findings 22 to 31 and the corrections that cite them date from then.

How a statement is known is said where it is made:
- **read**: from a binary, with the report that read it;
- **measured**: from takes or logs, with the numbers;
- **reproduced**: a check that was run, with its count;
- **inferred**: a conclusion, with what it rests on.

A statement in findings 1 to 21 with no label is measured from the sets it names.

## Provenance

### Set A: music loopback

The owner reports default TF2 voice settings. They did not change volume between songs.

| Supplied file | Decoded format / duration | SHA-256 |
| --- | --- | --- |
| tf2 VOIP test 2026 pure.mp3 | 48 kHz stereo / 170.76 s | `d538ade4cfecb7530bf0748c31519c70c974e82054fb5726c18cb52ed5cd9f6e` |
| Joni Mitchell - River.mp3 | 44.1 kHz stereo / 250.17 s | `c450847c6d1967d5608a731a356c839ad937fd20fbdb974a38bca202b7569ae4` |
| Ke$ha - Take It Off.mp3 | 44.1 kHz stereo / 215.61 s | `3b76981443496cdf6f8b23b1e3a1e2507ddc3aa7f11a5fdf1d22315b512f28da` |
| real tf2 VOIP recording 2024.mp3 | 44.1 kHz stereo / 59.98 s | `3bb37d8dad4800debd0282c2c4b62a8df4bf6922f737a4e68b395b161e45e543` |

The loopback file is:
- Effectively mono (L/R correlation 0.99997).
- VBR MP3 written by FFmpeg/LAME, about 147 kbps.
- Two talk spurts: River at 0.82–58.5 s and Take It Off at 81.2–163.8 s. Between spurts the file is digital zero.

### Set B: test signal and speech

The test signal (`tf2_voice_testsignal_v1.wav`, 142.9 s, SHA-256 `efd1c0bc…75e0`) contains:
- 1 kHz sine and pink-noise level staircases
- level steps
- noise bursts separated by 20 ms–4 s of silence
- a 20 Hz–20 kHz sweep
- band-edge tones
- clicks
- a synthetic vowel
- quiet noise
- sync beeps

Every segment's exact position is in [`tf2_voice_testsignal_v1.json`](testsignal/tf2_voice_testsignal_v1.json). The owner's console showed `volume 0.15`, `voice_maxgain 10` and `voice_scale 1`. After a fresh game start it also reported `voice_avggain 0.5`. They recorded the game output with OBS and exported lossless FLAC (48 kHz, 24-bit).

| Take | Setting changed from default | Duration | SHA-256 (FLAC) |
| --- | --- | --- | --- |
| take1_default | none | 149.5 s | `dd4a0cfb83c697c4389463141b052eb8882527029ef45eac2adde0b2f7c99e2f` |
| take2_voice_scale_0.5 | `voice_scale 0.5` | 147.8 s | `f1cad2c864fcd19678dc3fbe45f7d61bafd121c789edb0ee6d0ce5a96bf5f0d8` |
| take3_voice_maxgain_1 | `voice_maxgain 1` (receiver gain can only fall to unity, i.e. never boosts) | 144.9 s | `576fa567c5e3ebd25e4ee21c3c6b3e7626c95693055683a7ee8aca878674a7fc` |
| take3_voice_avggain_0.25 | `voice_avggain 0.25` | 146.1 s | `013ca3e2af8e8c028c60697e7e8e69024b0bb8b7d1b392e669ff6b2dd2eab420` |
| take4_my_own_speech | none; 124 s of speech | 127.6 s | `2500b7a5b61de4e4e3bdd9c3cbe0f96f7687c1160eee0e6bc3a50e01c8c78f83` |
| my_own_speech_raw_from_audacity.wav | the unprocessed speech source | 124.4 s | `37476e14c20bd8b30ce1ea18c7e63bfda181bc8333d4236b6214982f3bb65749` |

Game ambience is mixed into Set B at about −30 dB re the voice clip level, mostly below 100 Hz (1–3 kHz: −43 dB; above 8 kHz: −68 dB). Quiet-segment measurements therefore use band-limited levels.

Each take was aligned to the test signal from its level envelope, then from 10–13 short noise anchors:

| Take | Clock drift | Anchor residual |
| --- | ---: | ---: |
| take1_default | −51 ppm | 3.5 ms SD |
| take2_voice_scale_0.5 | −138 ppm | 3.0 ms SD |
| take3_voice_maxgain_1 | −90 ppm | 4.7 ms SD |
| take3_voice_avggain_0.25 | −208 ppm | 4.4 ms SD |

The speech take needed a separate alignment for each talk spurt. The delay changes between spurts, between 1.94 s and 2.29 s: the receiver's queue restarts at some spurts and is appended to at others (findings 21 and 22).

### Set C: packet loss and jitter

The network test signal (`tf2_voice_nettest_v1.wav`, 58.2 s, SHA-256 `1b8b6ac0…8633`) was played the same way on a listen server with `net_usesocketsforloopback 1` and `sv_cheats 1`. Its segments are 12 s of pink noise, a 10 s chirp, 12 s of synthetic voice and eight separate 1.2 s noise bursts. Levels keep the voice gate open and the auto-gain at its +20 dB cap. `net_graph` showed 14–19 ms ping without `net_fakelag` and 204–210 ms with `net_fakelag 100`.

| Take | Console | `net_graph` loss | Duration | SHA-256 (FLAC) |
| --- | --- | ---: | --- | --- |
| baseline | all 0 | 0 | 64.1 s | `87f513579b2543633e2c91b59a2f70c0fdd987f524a08598d3f8b46a0a28fa4e` |
| loss5 | `net_fakeloss 5` | 13 | 60.8 s | `e032ab14c4ca3642625308ff77c20aff69bb00921a75e862645393a060fa6708` |
| loss15 | `net_fakeloss 15` | 34 | 61.9 s | `b10e2b4ebc8b2551100508c4278dfccb61d68dbddaca20ebb291dffbf962b7a6` |
| jitter | `net_fakelag 100; net_fakejitter 50` | 0 | 61.6 s | `031e2d62813ca105349b0c247e4d97697e903550818cf46dde577672e3a10094` |
| combined | `net_fakeloss 10; net_fakelag 100; net_fakejitter 50` | 20 | 61.7 s | `e5215d465ada55cbe63735b7650331f101a6b87b8cfa6b76207550d0bf2c1938` |
| speech_loss10 | `net_fakeloss 10`, owner's raw speech | — | 87.9 s | `7aba8b3921c32e918d0753872721cde2811a11c798dc772aa3d754ffac445ef3` |

Each take was compared with the app's lossless render in 10 ms windows every 2.5 ms (300–4000 Hz correlation), following the delay at 20 ms resolution. A window below 0.4 correlation counts as damaged; a damaged stretch of at least 15 ms counts as one loss event. In the clean baseline, received frames correlate at a median of 0.86–0.99, and false events occur about 0.9 times per second. The rates below have that subtracted.

### Set D: SourceTV packets and two listeners

The owner ran a TF2 dedicated server with `sv_cheats 1`, `sv_alltalk 1` and SourceTV. Two setups joined it:
- **PC A** (account A, with `voice_loopback 1`) played `tf2_voice_testsignal_v1.wav` through the virtual cable and recorded its own game output.
- **PC B** (account B) recorded its game output as a remote listener.

Both recordings are lossless FLAC (48 kHz, 24-bit).

| File | Content | Duration | SHA-256 |
| --- | --- | --- | --- |
| voicetest.dem (in voicetest_demo.zip) | SourceTV demo, ctf_2fort, 15 970 ticks | 239.5 s | `7e6f13b2a01ef793120a1135da61e7e18617f34c0307dfba0bdf24bc3e7db526` |
| user_A_recording.flac | sender's loopback output | 147.6 s | `e61d7b97a5363b8ff1f18fe4beb102b38c30da88a4f72b6b38a27f47def924ee` |
| user_B_recording.flac | remote listener's output | 154.5 s | `3adc5fcbb49c57d8bed19229778aa2ef088527dab5ccf056f5b5c2b3984f327c` |

The demo holds 1 816 voice messages from one speaker:
- 5 109 Opus frames in 20 talk spurts
- no sequence gaps
- one end-of-transmission marker after each talk spurt

[`tests/demovoice/extract.mjs`](demovoice/) extracts and decodes them with `demo.js`.

The decoded packets were aligned to the test signal spurt by spurt by cross-correlation. Each recording was aligned to the packets in 100 ms windows every 50 ms, following the delay.

Output levels imply `volume` 0.147 on PC A (the owner's `volume 0.15`). On PC B the levels alone fitted about 0.077; its ceiling shows `volume 0.11`, with `voice_scale 0.77` making up the rest (inferred from the recording, finding 15). Game ambience sits near −35 dBFS in A and −40 dBFS in B, so quieter voice output cannot be checked against the recordings.

### Set E: a DTX artifact in music

The owner heard a deep whooshing noise in TF2 right after a sung phrase ends, and the same noise in the app's render. They supplied the source clip, the TF2 recording and the render:

| File | Content | Format | SHA-256 |
| --- | --- | --- | --- |
| river_clip_unmodified.wav | source clip, Joni Mitchell, "River" | 44.1 kHz stereo, 8.06 s | `bea5b4f8ebf263746218f5f14ed124509762a4a10aee0773982f7d78087ef997` |
| artifact_real.wav | TF2 with `voice_loopback 1` | 48 kHz, 7.27 s | `d2ebd746898f09caa9521e41092d0cee0bf33ac0248346b5e659cdf6b27f108c` |
| artifact_simulated.wav | the app's render (Steam profile) | 48 kHz mono, 13.9 s | `30f7c39690edb82a78f64706d34b4fb819be7b4a1bbeecd89ad43d4359be485c` |

The recording and the render were aligned to the source's left channel by cross-correlation (see finding 17).

### Set F: low tones

The owner played `tf2_voice_lowtone_v1.wav` ([`tests/testsignal/`](testsignal/)) as in Set B, with `volume 0.15`. Both files are FLAC (48 kHz, 24-bit), streamed without a length in the header.

| File | Settings | Duration | SHA-256 |
| --- | --- | --- | --- |
| default.flac | defaults | 152.7 s | `93bbec2053129a4187d21229aff909907d8a026511b51fd326e228f016af4429` |
| maxgain_1.flac | `voice_maxgain 1` | 152.9 s | `2ad5f2d9a7aabdfb618e1b357187077efe62958db39190e50e456dca433ceaae` |

Each take was aligned to the model's render of the signal by 10 ms envelopes, then tone by tone within ±0.5 s. The receiver re-times talk spurts (finding 15). Levels are the mean over each tone without its first and last 0.75 s.

### Set G: the receiver's queue in the console

The owner ran a local game with the Steam codec, `voice_loopback 1`, `voice_showincoming 1` and `voice_showchannels 1`, and logged the console. The game then prints one line for every voice packet, with its decoded sample count, and one line per 15 ms tick with the channel's queued bytes (finding 27). The logs stay private; only counts are quoted.

| Section | Frames a second | Ticks | Channels opened |
| --- | ---: | ---: | --- |
| first run: about 40 s of speech, 1,520 packets | 300 | 6,267 | 20, and one grace |
| second run | 300 | 934 | 2 |
| `fps_max 67` | 66 | 511 | 2 |
| `fps_max 100` | 99 | 598 | 4 |
| `fps_max 300` | 299 | 581 | 3 |
| one more section at the default | 300 | 917 | 3 |

In all: 2,375 packets and 9,808 ticks. The first run's frame rate was not noted when it was made; the owner's `fps_max` is 300.

### Set H: the CELT codecs with a file as the microphone

The owner set `sv_voicecodec vaudio_celt`, then `vaudio_celt_high`. The game took a file as its microphone (`voice_inputfromfile 1`: 16-bit mono at 22050 Hz) and recorded its own decoded voice (`voice_recordtofile 1`), with `voice_maxgain 1` and again with 10 (finding 27). No recorder and no cable is in the chain.

| Recording | Decoded voice, 16-bit at 22050 Hz |
| --- | --- |
| `vaudio_celt`, `voice_maxgain 1` | 292,352 samples: 571 packets of 512 |
| `vaudio_celt`, `voice_maxgain 10` | the same input; compared over its first 291,840 samples (570 packets) |
| `vaudio_celt_high`, `voice_maxgain 1` | 292,864 samples: 286 packets of 1024 |

The last packet differs between two key presses on the same input.

### Set I: a current game asked for Speex

The same method with `sv_voicecodec vaudio_speex` gave a recording of 145,920 samples in 512-sample packets at 22050 Hz. The game had run `vaudio_celt` (finding 31).

### What was read

The reports in `docs/reports/` say what was read from which file and where. Nothing of the files is in this repository. They were read as data with a disassembler and never run, and no leaked source was used. Public sources were set beside them: libopus, CELT, Speex and FFmpeg's libswresample.

| What | Read from | Report |
| --- | --- | --- |
| the receiver's queue and gain, the engine's side of sending, the debug variables, the codec table | the game's engine module and its `vaudio_celt` module, from the owner's install | W3-03 |
| the mixer and the output | the same engine module | W3-07 |
| the CELT build | the `vaudio_celt` module, a second one from another Source game, and the public CELT source | W3-08 |
| Steam's sender and decoder | the owner's Steam client library and Valve's public copy of it; Valve's public resampler library; the public Linux client | W3-09 |
| Speex | a `vaudio_speex` module from another Source game, supplied by the owner | W3-09 |

## Findings

### 1. The output ceiling is int16 full scale times `volume`

With the default settings, loud input comes out hard-clipped at a 99.9th-percentile ceiling of exactly 0.15 × 32767/32768 (−16.48 dBFS). That is int16 full scale times the owner's `volume 0.15`. The music recording's −16.4 dBFS ceiling is the same `volume`, not headroom in the voice path. Finding 30 gives the order of the stages as read: the clip is on the sum of the voice and the game's other sound, and `volume` comes after it.

### 2. Sender and codec are linear; the codec is 24 kHz Opus in SILK/CELT hybrid mode

With `voice_maxgain 1` the receiver never boosts, so that take shows the sender and codec on their own:
- **Levels:** sines come out at +0.5 dB against the file from −24 to −1 dBFS. The sender has no gain control or noise suppression; 10 s of steady pink noise does not decay. Read since in Steam's client: nothing processes the samples between the capture and the gate (finding 28).
- **Spectrum:** libopus 1.6.1 at 24 kHz, VOIP, `signal=voice` reproduces the take's hybrid structure. Finding 14 measures the remaining difference, up to ±1 dB, directly against Steam's packets.
- **Profile EQ:** refitted to this take at the time. Finding 14 replaces it with a fit to Steam's own packets.
- **Pure tones:** 8, 8.5, 11 and 11.5 kHz tones come out 10–18 dB lower than libopus 1.6.1 made them. Steam's packets show why: its encoder sent them as DTX comfort noise (finding 13).

Set A shows the same codec:
- Coherence has a hole at 8 kHz, the hybrid SILK/CELT crossover, which libopus reproduces only with the `voice` hint.
- The band ends at about 11.5–12 kHz.
- Noise-like energy at 12–19.5 kHz is not transmitted content. When this was measured it was found incoherent with the source, and judged not to be a resampling image, MP3 encoding or a 48 kHz stream. It is reproduced by clipping the decoded voice at 44.1 kHz (`SOUND_DMA_SPEED 44100` in `public/soundsystem/snd_device.h`). `DecompressVoice` in `public/steam/isteamuser.h` returns 16-bit PCM at any requested rate from 11025 to 48000; the engine asks for 44100 (read, W3-03).
- **To be looked at again.** Two stages found since put sound above 12 kHz, and neither was in the model when this was measured. The decoder's resampler mirrors 11–12 kHz into 12–13 kHz, coherent with the source (finding 29). The output device's interpolation leaves images of the top of the band at 12–16 kHz (finding 30). The decoder's 16-bit step may also soften peaks before any clip (finding 29). How much of the 12–19.5 kHz energy each explains is not measured yet.

### 3. The receiver auto-gain blends the block mean and peak

The engine's voice-channel auto-gain (`voice.cpp`, not in the public Source SDK 2013) works on the int16 voice at 44.1 kHz in 128-sample blocks. The fixed-point details are in finding 4, and finding 26 gives the rule as it was later read from the engine. Every block sets the target gain for the next one:

```
T = min(voice_maxgain, 32767 / (mean|x| + voice_avggain * (peak|x| - mean|x|)))
```

`voice_avggain` 0 would drive the block mean to full scale, and 1 the block peak. The game's default is 0.5: the console reports it, and the default take fits it. The takes pin the law down in three ways:
- **Sine overdrive.** A steady sine has mean/peak = 2/π, so the default blend overdrives it by 1/(2/π + 0.5 (1 − 2/π)) = 1.22×. Every sine from −18 to −1 dBFS came out identical: −2.1 dB RMS with 42% of samples at the clamp. The law predicts 41.7%. At `voice_avggain 0.25` the overdrive is 1.37×: predicted and measured 50%.
- **Noise level.** Pink noise has a much lower mean/peak ratio, so it comes out lower (−5.3 dB, 10% clipped) with no separate noise parameter.
- **The cap.** A −24 dBFS sine gets exactly 20 dB (`voice_maxgain 10`), where the law would ask for more.

The previous model normalized the block mean to 0.5 with a fitted cap of 16. It matched the music's average statistics but put sines 3 dB low without clipping them, and missed noise by 2–3 dB.

### 4. `voice_scale` enters the fixed-point ramp twice

`voice_scale 0.5` does not simply halve the output: sines came out 8 dB down and loud sines 11 dB down. Folding the output gain of a steady sine over the 128-sample block period (44100/128 Hz) shows a sawtooth.

The gain starts each block at s²·T. It then climbs toward s·T in whole 1/128 fixed-point steps per sample, with the step truncated toward zero, where s is `voice_scale`. That reproduces everything in that take:
- **Sawtooth shape:** 0.17 → 0.29 of full scale recorded, 0.16 → 0.28 modeled.
- **The extra 3 dB drop on −6 and −1 dBFS sines:** their step truncates to zero, so the gain stays at s²·T.
- **Every level:** within 0.3 dB, including pink −13.5 / −13.5 and vowel −9.9 / −9.8 dB.

At the default s = 1 the same update ramps from the previous target, and any remainder below one step lands at the block edge. That is where the 344.5 Hz (44100/128) lines in Set A come from. The step is the difference divided by 127, the block size less one (read, finding 26).

When no voice data arrives nothing runs, so the gain is untouched. A decoded block of zeros is different: it sends the gain to the cap (read, finding 26). The silence record after each spurt is such a block. The model as fitted here held the gain through every all-zero block. With that rule its onsets after gaps matched the recording in 1.3 ms steps: 0.08 / 0.10 / 0.13 / 0.64 / 1.0 of full scale against 0.07 / 0.08 / 0.17 / 0.53 / 0.98. Recording A against Steam's own decoded packets shows the gain already at its cap at each loud onset: the slow-looking rise is the codec's own attack, times 10 (measured, finding 26). The app still runs the fitted rule; order W3-05 replaces it.

### 5. Steam's sender gates quiet input

The sender transmits only while its level gate is open:
- **Opening:** a capture chunk whose mean of |x| is at least 1.0% of full scale, or which has a sample at 15% of full scale (read from Steam's client, finding 28). A chunk is 31.25 to 93.75 ms on the owner's PC. For a sine the mean rule is −39.09 dBFS RMS, and for Gaussian noise about −38. The figure first measured here, about −39.5 dBFS RMS of a 20 ms frame, was the sine's.
- **Evidence for the threshold:** a −36 dBFS sine (−39.0 dBFS RMS) opens it. A −42 dB RMS pink noise, whose loudest frame is −39.97 dBFS, never does. Neither does a −40 or −42 dBFS sine. Each agrees with the rule as read: the −36 dBFS sine has a mean of 1.009% of full scale and the −40 dBFS sine 0.64% (W3-09).
- **Closed frames are not sent;** the receiver hears silence.

Set D refines the timing (finding 12). The gate sends a pre-roll before each onset and holds for about 440 ms as first measured, not 300; as read, the hold is 0.4 s of Steam's clock. For about the last 240 ms of that hold the encoder sends DTX comfort noise, so the audible tail is about 200 ms of coded sound plus a quieter fade. It is a level rule on chunks, read from the client: not a voice detector, and not a 20 ms rule. The app's gate is still the 20 ms frame fit of finding 12.

### 6. A stereo source reached the game as its left channel

Set A's River passage tracks the model within 0.16 dB when the model is fed River's left channel. It tracks within 0.79 dB from the right channel and 1.14 dB from the L+R average. Take It Off is mostly centre-panned and fits any channel (0.07–0.11 dB). Rendering without the voice gate gives identical numbers, so the channel is the cause. The owner's virtual-cable capture passed the left channel to the game's mono microphone, so stereo input now defaults to it.

### 7. MP3 encoding biases Set A's clip statistics

Set A was delivered as VBR MP3. Encoding the model's lossless output with LAME:
- dropped the share of pink-noise samples within 5% of the ceiling from 10.4% to 3.3–9.4%
- widened the 256-sample block-peak spread from 0.14 to 0.23–0.72 dB

Set B is lossless and matches the model's clip statistics directly. The previous model had been tuned to Set A's biased values.

### 8. Lost voice frames are concealed in bursts averaging 2.2 frames

Lost audio is replaced in place, not skipped or left silent. Across 54 of 55 isolated events the delay is the same before and after, and the damaged stretch carries noise within about 3 dB of the true level: Opus's own concealment. It fades toward silence only in long bursts at high loss.

The damage comes in bursts:

| Take | Events per second | Frames lost | Events of 1 / 2 / 3 / 4+ frames |
| --- | ---: | ---: | --- |
| loss5 | 4.3 | 17% | 51 / 23 / 17 / 9% |
| loss15 | 14.1 | 58% | 54 / 21 / 10 / 15% |
| combined | 12.0 | 43% | 57 / 25 / 9 / 9% |

A two-state (Gilbert-Elliott) loss process whose mean burst is 2.2 frames reproduces all three when set to 22%, 64% and 45% of frames lost. `net_fakeloss` on this listen server therefore removed far more voice than its number: about 22%, 45% and 64% of frames at 5, 10 and 15. It applies to the packets in both directions, and `net_graph` itself reported 13%, 20% and 34%.

The speech take agrees. Under `net_fakeloss 10`, 38% of active speech frames correlate below 0.5 with the clean render (median 0.71). The app at 45% loss gives 37% (median 0.67), against 23% at 30% and 51% at 60%.

Steam's decoder conceals at most 10 frames of a gap. What a longer gap lacks beyond that is not filled, so the sound closes up there (read, finding 29). No take shows it.

### 9. Jitter adds isolated late frames

With `net_fakelag 100` and `net_fakejitter 50`, about 1.4 extra events per second appear (3% of frames). They are single frames: 81% last one frame, against 51% for packet loss. Nine in ten are concealed and about one in ten plays as a short silence, consistent with a frame that arrived too late for playback.

### 10. The receiver re-times talk spurts

The delay from source to output changes from one talk spurt to the next. In the baseline, alternate noise bursts came out about 240 ms apart in delay (2.02 s against 1.74–1.81 s), so the receiver shortens some silences between spurts and restores others. Findings 19, 21 and 22 say how.

Within continuous voice, the delay fell by 2–8 ms per second in steps of about 5.8 ms. That happens in every take, including the clean baseline, so it is the receiver and not an effect of jitter. It was first read as latency trimmed in 256-sample skips, since 256 samples at 44.1 kHz are 5.8 ms. The engine has no such operation: the voice path has no 256-sample step (read, W3-03). Two things shorten the delay:
- **One sample is dropped from every packet**, a steady 0.4 ms a second (finding 24).
- **The ring overflows after a restart**, and whatever did not fit is skipped (findings 22 and 23). The skips are any size. The 2–8 ms per second was the average over spurts that had just restarted: appended spurts show no step over 5 to 8 s (measured, W3-01).

`help voice_buffer_ms` describes the 100 ms voice buffer as avoiding "dropouts due to jitter and frame time differences". Finding 23 shows what the setting does.

### 11. Steam's packets: Opus 24 kHz hybrid, VBR, DTX, no in-band FEC

Every frame in the demo is a 20 ms Opus packet with TOC configuration 13: hybrid, super-wideband (12 kHz band), mono. The stream's rate field says 24 000.
- **VBR:** coded frames carry 34–189 bytes (98% between 40 and 105). That is about 32 kbps on noise, 26 kbps on the synthetic vowel and 29.9 kbps averaged over all coded frames. The encoder asks for 32000 bit/s and leaves VBR constrained, the library's default (read, finding 28).
- **DTX:** 693 of the 5 109 frames are 1-byte packets. The decoder answers these with comfort noise.
- **No in-band FEC:** the LBRR flag is never set. The client never asks for it (read, W3-09).
- **Spurt ends:** each talk spurt ends with Steam's end-of-transmission marker, which resets the receiver's decoder, and a silence record of 62.5 ms (sometimes 31 ms). Each message is one capture chunk and carries its own sample-rate record (read, finding 28; all 1,816 messages of the demo hold exactly one of each).
- **Sequence numbers:** each frame carries a 16-bit number that starts again at 0 after every end-of-transmission marker. In the demo all 20 talk spurts start at 0 and the number falls 19 times, once at each spurt after the first (the longest spurt reaches 975). So a number that goes backwards means a new talk spurt, which is how `demo.js` recognises a spurt whose end marker was lost (checked 2026-11-09 with `tests/demovoice/extract.mjs`). Read since: the encoder writes 0 after each end marker (W3-09).

libopus 1.6.1 reproduces Steam's DTX decisions only at complexity 6 or below, where it decides from the SILK voice detector. From complexity 7 its tonality analysis decides:

| libopus 1.6.1 setting | DTX frames in both Steam and libopus | Steam only | libopus only |
| --- | ---: | ---: | ---: |
| Complexity ≤ 6 | 588 | 105 | 14 |
| Complexity 7–10 | 97 | 596 | 4 |

It also spends up to 15% fewer bytes than Steam at 32 kbps. Finding 16 explains both: Steam runs libopus 1.1.x.

A client demo made with `record` keeps the voice messages but not their payloads. That held for both client demos checked.

### 12. The gate keeps 100 ms and holds 0.4 s

Talk spurts start on a 31.25 ms grid, 115–152 ms before a loud onset, so the frames before the onset go out too. Spurts end 425–485 ms after the last loud frame.

**Steam's own rule** was read from its client afterwards (finding 28), and it is not a frame rule:
- **Pre-roll:** the last 2400 samples (100 ms) before the onset's chunk are kept and sent with it. With 62.5 ms chunks that is 100 to 162.5 ms of sound before the onset (measured: 115 to 152).
- **Hold:** 0.4 s of Steam's clock from the read of the last active chunk. Sound goes on for 380 to 460 ms after that chunk (measured from the last loud frame: 425 to 485).
- **The 31.25 ms grid** is the capture's step on the owner's PC.
- **A pause shorter than the hold keeps the spurt going.** There is no 560 ms rule.
- **Each spurt resets the encoder and the decoder.**

**The app's gate today** is a 20 ms frame model fitted to the measurements above. A frame above −39.5 dBFS RMS is sent with the 6 frames before it and the 22 after it, and a pause shorter than the hold plus the pre-roll (560 ms) keeps the spurt going. That puts both boundaries of 16 of the 18 spurts within 4 frames of Steam's, and most within 1–2. The exceptions are pure tones at 11.8–12 kHz, which Steam's gate and the model's (on the 24 kHz signal) treat differently. Orders W3-02b and W3-11a replace the fit with Steam's rule for the `steam` profile.

### 13. DTX is why steady tones fade

Opus's voice detector marks a steady tone inactive after a while. The encoder then sends DTX packets, and the decoder plays comfort noise 7–20 dB below the tone. The same applies to other steady signals. That was the unexplained "gate adaptation" on steady tones in Set B:

| Segment | First DTX frame, Steam / model | DTX frames, Steam / model |
| --- | ---: | ---: |
| sine −36 dBFS | 0.42 / 0.38 s | 75 / 78 |
| sine −30 dBFS | 1.16 / 1.18 s | 40 / 40 |
| sine −24 to −1 dBFS | none / none | 0 / 0 |
| 8, 8.5 and 11 kHz tones | — | 41, 47, 42 / 41, 47, 41 |
| pink noise −36 to −18 dB | — | 19 / 19 |
| synthetic vowel | — | 0 / 0 |

Speech-like material keeps the detector active; steady tones and very even noise do not.

### 14. The high-band difference is on the sender; the receiver adds no EQ

Decoding Steam's packets and passing them through the receiver model matches recording A within 0.1 dB per band from 100 Hz to 11.5 kHz. The receiver model here is the 44.1 kHz auto-gain, the `[0.1, 0.8, 0.1]` output stage and `volume`; the filter stands in for the output device's interpolation (finding 30). Median 50 ms levels match within ±0.3 dB on segments more than 15 dB above the game ambience. The receiver adds no EQ. Read since: nothing between the decoder and the mixer filters the voice (W3-03, W3-07).

The receiver's own 24 to 44.1 kHz step is finding 29's resampler, which the app's stood in for when this was measured. Its roll-off above 10.5 kHz belongs to the receiver. The two resamplers were not compared (W3-09).

Against libopus 1.6.1 on the same input, Steam's decoded packets have:
- 0.5–1.1 dB more energy from 1.5 kHz up to the 8 kHz SILK/CELT crossover
- 1.0 dB less in the CELT band above it
- a roll-off from 11.2 kHz to −7 dB at 11.8 kHz (the capture resampler)

The earlier profile EQ trimmed 2.5 dB above 8.2 kHz and nothing below. That left the old model 1–2 dB dull from 2 to 12 kHz against recording A. Finding 16 shows that the ±1 dB comes from the libopus release. The capture roll-off is not Steam code either: Steam opens the capture at 24 kHz, so the conversion from the device's rate is done by Windows or the virtual cable (read, finding 28). It belongs to the sender's machine and may differ on another (inferred). The model applies it before the gate and the encoder.

### 15. A remote listener hears the same chain

Recording B divided by recording A is flat within ±0.2 dB from 100 Hz to 11 kHz on pink noise. B is 6 dB lower overall. That is two settings of PC B, inferred from the recording (W3-07):
- **`volume 0.11`:** its largest sample is exactly round(32767 × 0.11) = 3604.
- **`voice_scale 0.77`:** with the engine's gain law (finding 26) it gives B's 1 kHz staircase within 1 to 3% and its 344.5 Hz sidebands within 1 dB.

The owner has not yet read the two values off PC B's console. B's output path is the same as A's: it shows the same interpolation images (finding 30).

Both recordings gain 0.4 ms a second on the sender: the receiver drops one sample from every packet (finding 24).

Both also re-time talk spurts:
- In A, some spurts start up to 330 ms early against their neighbours, shortening the silence before them.
- In B the spurt-to-spurt changes stay within about 90 ms.

The difference between the two PCs is what finding 23 predicts for a listener at a lower frame rate (inferred; the second PC's frame rate was not recorded).

### 16. Steam's voice runs libopus 1.1.x at both ends

libopus releases from 1.1 to 1.6.1 were built natively. Each one re-encoded the test signal on Steam's frame grid, one fresh encoder per talk spurt, at 32 kbps VBR with DTX and the voice hint:

| Release, complexity 10 | Frames with Steam's exact size | Mean size difference | DTX frames in both / Steam only | Bytes on noise / vowel / sines vs Steam |
| --- | ---: | ---: | --- | --- |
| 1.1, 1.1.2, 1.1.5 | 28.6–28.8% | 3.4 bytes | 627 / 66 | 1.00 / 1.00 / 1.00 |
| 1.2.1 | 5.6% | 12.3 bytes | 84 / 609 | 1.06 / 0.99 / 1.00 |
| 1.3.1 | 4.4% | 13.6 bytes | 97 / 596 | 1.13 / 1.03 / 1.01 |
| 1.4, 1.5.2, 1.6.1 | 4.6% | 13.2 bytes | 97 / 596 | 1.11 / 1.10 / 1.01 |

Steam's input is a resampled capture, so exact sizes cannot all match. The DTX frames, which carry no audio, are bit-identical.

**Encoder.** Decoded with its own release, the 1.1.x re-encode matches Steam's decoded packets within ±0.1 dB from 0 to 11 kHz. The SILK/CELT tilt of finding 14 disappears. 1.1.2 to 1.1.5 give identical packets here. Release 1.1 is 0.4 dB low at 7.6–8 kHz, so Steam's build is most likely 1.1.2 or later. The public Linux build of Steam's client carries the string `libopus 1.1.4`; the Windows build holds no version string and is inferred to be the same (W3-09). What remains is the capture resampler (Windows's or the cable's, finding 28): −0.5 dB at 11.25 kHz, −2.6 dB at 11.45 kHz and −6.5 dB at 11.75 kHz.

**Decoder.** Steam's receiver decodes with the same release. Decoding Steam's packets with 1.1.5 reproduces recording A where 1.6.1 does not. Levels in dBFS:

| Measurement | Recording A | libopus 1.1.5 | libopus 1.6.1 |
| --- | ---: | ---: | ---: |
| 8 kHz tone, DTX frames (comfort noise) | −32.5 | −32.5 | −44.5 |
| 8.5 kHz tone, coded frames | −22.8 | −22.6 | −26.4 |
| 11.5 kHz tone, coded frames | −30.9 | −30.6 | −33.8 |
| 1 kHz DTX tails, three talk spurts | −50.5 / −48.0 / −52.3 | −50.2 / −48.5 / −52.1 | −51.3 / −49.6 / −55.2 |

The Steam profile therefore encodes and decodes with libopus 1.1.5, compiled to WebAssembly with musl's libm (`vendor/libopus-1.1`, built by `tests/libopus11/build.mjs`). Its packets are bit-identical to a native build of the same release.

The app passes complexity 10. Steam sets none, so it runs the library's default, which is 9 in 1.1.x (read, finding 28). The pinned build gives byte-identical packets at 8, 9 and 10 (reproduced on 19,428 frames, W3-09), so no packet depends on it; order W3-11a sets 9. Steam also decodes to 16-bit samples, where the app decodes to float (finding 29).

### 17. Comfort noise replaces music held after a vocal (Set E)

In Set E the vocal ("cry") ends at 4.7 s and a sustained piano chord continues. Opus's voice detector then marks the frames inactive. After 200 ms the encoder sends 1-byte DTX packets:
- from 4.88 to 5.18 s
- from 5.48 to 5.74 s

A few coded inactive frames sit between the two runs. The decoder fills the DTX frames with comfort noise shaped by the last spectral envelope. Here that envelope is the chord's low-mid spectrum, so the result is a deep whoosh in place of the piano. A native libopus 1.1.5 build with its SILK decoder instrumented gave this frame timeline.

Spectral flatness from 70 to 700 Hz measures it (0 = tonal, 1 = noise):

| Signal | 4.9–5.7 s (artifact) | 3.0–3.8 s (reference) |
| --- | ---: | ---: |
| source | 0.09 | 0.03 |
| TF2 recording | 0.48 | 0.04 |
| app render | 0.41 | 0.04 |
| libopus 1.1.5, Steam settings | 0.40 | 0.03 |
| the same without DTX | 0.12 | 0.03 |

The artifact is the codec's own DTX (finding 13) acting on music, and the model reproduces it. It is part of the sound and stays in the model.

### 18. Comfort noise for a steady tone below ~60 Hz is nearly DC

libopus 1.1.x puts a steady tone into DTX (finding 13), low tones included. Its comfort noise then imitates the tone's spectrum, and for a tone below about 60 Hz that imitation is a slowly wandering, nearly constant offset.

With Steam's settings in hybrid mode, libopus 1.1.5 decodes a steady 50 Hz sine at 0.3 with a mean of 0.213. A native gcc build and the app's WebAssembly build agree (0.2128 and 0.2127). DTX is what does it:

| libopus 1.1.5, native | DTX frames | Mean | RMS |
| --- | ---: | ---: | ---: |
| 50 Hz at 0.3, DTX on | 362 of 400 | +0.235 | 0.249 |
| 50 Hz at 0.3, DTX off | 0 | 0.000 | 0.107 |
| 30 Hz at −12 dBFS, DTX on | 373 of 400 | −0.032 | 0.050 |
| 30 Hz at −12 dBFS, DTX off | 0 | 0.000 | 0.042 |

libopus 1.6.1 at the same settings does not put the tone into DTX and gives a mean of 0.0001.

In a render the receiver auto-gain scales the offset up. The model gives:
- 50–85% of the output ceiling (int16 full scale × `volume`) on steady 50 Hz tones at default settings
- a few percent on tones that change level every 0.5 s, which keep the voice detector active
- nothing on a moving bass line under a melody

Music with held sub-bass is where it would show. The app's meter reports it.

**TF2 plays the offset as is (Set F).** The recording of every steady low tone becomes a series of near-DC plateaus, as in the model:
- **Onset:** the plateaus start where DTX starts, 0.6–1.2 s into the tone. Recording and model agree to within the 100 ms resolution for every tone checked, in both takes.
- **Timing:** they change every 420 ms, at the refresh frame DTX sends after each 20 comfort-noise frames. The changes line up in time.
- **Size:** at default settings the 50 Hz tones become nearly pure DC in both, and the −6 dBFS tone is pinned at the clip.

| Default take, 50 Hz tone | DC / RMS, recording | DC / RMS, model | RMS, recording − model |
| --- | ---: | ---: | ---: |
| −24 dBFS | −0.92 | +0.91 | +0.6 dB |
| −12 dBFS | −0.93 | +0.94 | −0.1 dB |
| −6 dBFS | +0.90 | +0.91 | 0.0 dB |

**Sign:** each plateau's sign and height differ between recording and model, so they are not predictable. Comfort noise is random excitation shaped by the decoder's state. The capture resampler on the sender's PC (finding 28) makes that state differ slightly from the model's. At 30 and 40 Hz the offset wanders more, and its size in the recording ranges from 0.06 to 0.80 of the RMS against 0.16 to 0.80 in the model.

**Checks:**
- The 1 kHz control and the bass line under a melody have no DC in either (under 0.01%).
- Between tones the recording's mean is +0.01% of full scale, so the recording chain adds no offset.
- With `voice_maxgain 1` the same plateaus appear at the codec's own scale, so they do not come from the receiver's clipping.

### 19. The receiver starts some talk spurts early, closing the silence before them

The accuracy suite ([`tests/accuracy.mjs`](accuracy.mjs)) lines every take up with the app's render talk spurt by talk spurt and records each spurt's delay. Over the 13 takes without simulated loss there are 146 transitions from one spurt to the next:

- **Most keep the delay.** 94 (64%) change it by less than 40 ms (median 9 ms).
- **Early starts.** 25 spurts start 80–350 ms early, most by 280–350 ms.
  - 23 of them follow a silence of at most 0.45 s in the gate model.
  - The early start takes up most of that silence: 0–130 ms of it is left in 21 of the 25.
  - The next spurt goes back to the usual delay in 19 of the 25.
- **Rate.** After a silence of at most 0.45 s, not directly after an early start, 21 of 51 spurts (41%) start early. It varies from take to take (1 of 9 for listener B, 4 of 4 in two takes), and the same test signal gets different spurts moved in different takes. Which spurt moves is not predictable from the signal; finding 21 shows what decides it.
- **Inside a spurt**, the delay steps by a few milliseconds (57 steps of 4–20 ms, a few up to 68 ms, over 24 minutes of talk spurts). These include the steps of finding 10.

The render keeps the source's timeline by default, so the dry/wet A/B and the real-take check line up. **Talk-spurt timing → TF2 re-timing** (`voice_retime 1`) applies this finding: after a silence of up to 0.45 s, a spurt starts early with probability 0.41, by the silence less a random 0–130 ms (at most 350 ms), and the spurt after it keeps its time. It is seeded like the loss model.

This flat rule is what the app runs today when the option is on. It cannot chain early starts, and the speech take has two chains (W3-01). The engine's queue (findings 22 to 25) is to take its place. It is built as a module, `voice-channel.js` (W3-02a), which no render uses yet. Orders W3-02b to W3-02d put it into the render and the page, and W3-02f retires the flat rule.

### 20. The Steam render's low frequencies lead the source by Opus's own phase

A render of white noise lines up with its source to 0.3 µs in the 8–11 kHz band, which the CELT layer of hybrid mode codes: the encoder's lookahead is trimmed exactly. Below 8 kHz the SILK layer leads by a frequency-dependent amount: 35–70 µs at 1–6 kHz, 86 µs at 0.3–1 kHz and about 370 µs at 100–300 Hz. libopus alone, without the app's chain, does the same in both 1.1.5 and 1.6.1. It is the phase response of SILK's own processing, which TF2's libopus shares, so the render keeps it rather than shifting it. An Opus test pins both bands.

### 21. An early start is the receiver appending a spurt to voice it still has queued

What makes a spurt start early (finding 19) is the receiver's queue:
- **Restart.** The receiver keeps some voice queued ahead of playback. A spurt that arrives when the speaker has no channel waits `voice_buffer_ms` counted in frames (finding 23). L0, the restart latency the takes show, is that wait less what the ring dropped: 305 to 385 ms at 300 frames a second.
- **Silence record.** After every end of transmission, the sender sends a silence record one capture chunk long: 1500 samples (62.5 ms) 17 times and 750 samples twice in the Set D demo (finding 28).
- **Appending.** If a spurt's first packet arrives while the previous spurt's voice and that silence record are still queued, the spurt is appended. It starts early by the silence less 62.5 ms, and the queue shrinks by as much. The channel lasts until the first tick after its ring is empty (finding 22).
- **The silence record, measured.** In recording A two appended spurts (9 and 13) start 63.4 ms after the last sample of the spurt before them: 62.5 ms plus finding 24's 0.04% over 1.6 s (W3-01).
- **Draining.** If the queue has drained first, the spurt restarts at L0, which is why the next spurt returns to the usual delay.

`tests/retiming.mjs` reproduces all of the following from the accuracy suite's results and the Set D demo.

- **Set D, spurt by spurt.** The demo gives when each of Steam's 20 spurts reached the server, to 60 ms (SourceTV writes voice every 4 ticks).
  - **Listener A:** one parameter, L0 of 320–375 ms, reproduces all 17 observable transitions: the four early starts, the four returns and the nine unchanged. Two further pairs of spurts arrived overlapping and count as one spurt in the gate model.
  - **Early or not:** the early starts follow arrival gaps of 380 ms, and the spurts after gaps of 440–460 ms restart.
  - **The signal cannot tell them apart.** Spurts 4 and 8 follow identical 440 ms silences in the gate model of the test signal, but their packets arrived 380 and 440 ms after the previous spurt's. Spurt 4 started early; spurt 8 did not.
- **Size.** At a 380 ms gap the model predicts −317 ms; spurts 4, 6 and 9 came out at −335, −324 and −306 ms. The fourth early start, spurt 13, follows two spurts whose packets overlapped: it came out at −328 ms against −437 predicted, with 60 ms timing resolution at both ends.
- **Listener B.** No spurt moved by more than 88 ms, the size of its alignment noise. That fits a lower frame rate on that PC (finding 23): under about 190 frames a second for an L0 under about 0.28 s, for which the model predicts no early starts here. Inferred; that PC's frame rate was not recorded.
- **The other takes** show the same structure:
  - early starts of the appending kind only after gate-model silences of 0.44 s or less. The two other shifts past −80 ms (−128 and −156 ms, after silences of 1.4 and 10.4 s) are far too small to be a spurt appended across that silence. W3-01 found that the −128 is probably a spurt gated differently in that take, and that the −156 is real: a restart that came in under L0. W3-03 gives two readings for such a restart (inferred): a key press whose empty packet starts the wait early (finding 25), or long frames during the countdown ending it early (finding 23).
  - at the test signal's 440 ms silences, every early start is followed by a restart (11 of 11)
  - at the shorter silences in speech and the network signal, early starts chain until the queue runs out. The speech take has three with no restart between them: −124, −197 and −102 ms. W3-01 reads the last two as one chain and a later pair, −217 and −105 ms, as a second: after the −124 the delay came back inside the spurt, in steps that each follow a pause.
- **Predicting from a recording or source file.** Each transition was predicted from the take's earlier transitions only, with the model learning the session's L0. Over the 146 transitions, it scores −0.379 per transition (log-likelihood) against −0.356 for the flat 41% rule.
  - It wins where silences sit clearly below or above the threshold: speech (−7.2 against −11.5), the network signal (−1.4 against −4.2) and listener B.
  - It loses on the four Set B takes, whose 440 ms silences sit at the threshold. There, ±30 ms of packet batching decides, which a recording does not show.
  - The arrival jitter was fixed at ±30 ms from Set D beforehand. At ±60 ms, chosen after seeing the results, the model scores −0.349.

So the mechanism explains the early starts, and a demo's packet timing predicts them spurt by spurt. From a recording or a source file, a spurt near the threshold stays a coin flip. The mechanism has since been read from the engine and confirmed against the game's own logs (findings 22 and 23). The app still keeps the statistical rule (`voice_retime`) today; finding 19 says which orders replace it.

### 22. The receiver queues each speaker's voice in a half-second ring

Read from the game's engine (W3-03) and checked against the game's own console output (Set G). The rule below, replayed over Set G's 2,375 packets, gives the logged queue on every one of 9,808 ticks. That replay was run twice: by the W3-02 plan, and again with the module built from the rule (`voice-channel.js`, W3-02a), where six faults put in on purpose each fail. It takes the mixer's demand from the log, so it does not test when the mixer pulls.

- **The ring** holds 22050 samples: 0.5 s at Steam's 44.1 kHz, whatever `voice_buffer_ms` is (read). In the logs the queue never passes that size, and 103 packets of the first run land exactly on it. A packet that does not fit overwrites the oldest sound, the samples about to be played, which is heard as a skip. Which end is dropped is read; a log cannot show it.
- **A packet for a speaker with no channel opens one.** The channel waits before it plays (finding 23); packets that arrive meanwhile are queued. An empty packet opens a channel too (logged 3 times).
- **A channel ends on the first tick after the mixer has emptied its ring.** A packet that arrives before that tick is appended and plays straight after what is queued: this is the early start of finding 21. One that arrives later opens a new channel and waits again. Both are in the logs, the one-tick grace once.
- **The engine has no end-of-transmission rule.** Whatever Steam's decoder returns is queued like speech, the silence record included (read; logged as 2756 or 2757 samples 22 times and 1378 or 1379 six times).
- **The mixer takes 512 samples at a time**, once or twice a tick (logged; finding 30 has why). The first pull after a channel starts is one sample more in 16 of 16 starts seen; why was not read.
- **The last `voice_fadeouttime` (0.1 s) of the queue is faded** linearly to zero, so voice played from a queue under 100 ms is quieter in proportion. Read; no recording shows it yet.
- **An underrun** is filled with a repeat of the last samples read, then zeros. Read; not seen.
- **Under the engine codecs** the ring is the same 44100 bytes, so 1 s at 22050 Hz and 2 s at 11025 Hz (read). No log was made under them.

The app does not run this queue in a render yet (see the Model table).

### 23. The wait before a channel plays follows the listener's frame rate

The wait is `voice_buffer_ms` (100; limited to 1 to 5000), but the engine counts it down by one frame's duration on each 15 ms tick (read, W3-03). It therefore lasts `ceil(0.1 × frames a second)` ticks, the packet's own tick included. The owner then ran the game at three frame rates (measured, Set G):

| `fps_max` (counter) | Predicted | Logged: lines before the queue can fall | Queue when it starts |
| --- | ---: | --- | ---: |
| 67 (66) | 7 ticks | 7 in 2 of 2 channels | 220 ms |
| 100 (99) | 10 ticks | 10 in 4 of 4 | 240 to 280 ms |
| 300 (299, and three runs at the default) | 30 ticks | 30 in 19 of 28, 31 in 8, 32 in 1 | 500 ms in 24 of 28 |

So the sound starts about 90 ms after the packet at 67 frames a second, 135 ms at 100 and 435 ms at 300. By the same rule it is about 210 ms at 144 and 285 ms at 200 (read; not logged). One frame of 0.1 s or more during the countdown ends it at once (read).

At 300 frames a second, TF2's default cap, a spurt opens with 160 ms at once (finding 25), so the ring overflows at nearly every restart: it was full when it started to play in 24 of 28 channels.
- **What is dropped.** Replaying the rule over the first run's log, each of 16 restarts drops 55 to 136 ms of what was queued (mean 104 ms): Steam's pre-roll first, then the onset.
- **The restart latency.** The restarted spurt then plays 305 to 385 ms after its first packet. That is the L0 the takes gave: 350 ms, 330 to 375 across the owner's sessions (W3-01; finding 21).
- **In the takes** a restarted spurt plays 25 to 50 ms late at first and skips that much within half a second, in steps of 11 to 25 ms. All 7 restarts tracked finely do it, and none of 12 appended spurts (measured, W3-01).
- **At 67 and 100 frames a second** no packet met the ring's limit, so nothing was dropped.

### 24. One sample is dropped from every packet

The engine copies a decoded packet into the ring through an interpolator that writes one sample fewer than it was given: the packet's first sample is in effect left out (read, W3-03). In the logs every packet of N samples that neither overflows nor meets a pull raises the queue by exactly 2 × (N − 1) bytes (measured, Set G; a replay that keeps the sample fails).

Steam hands voice out in about 17.8 packets a second (finding 25), so playback gains about 0.04% on the sender: 17.8 / 44100 is 403 ppm. This is the "clock" of the accuracy suite, 404 to 406 ppm on most takes. It is not a recorder's clock, and it follows the packet rate: the one take at 505 ppm had 22.3 packets a second. The playback does not get shorter: the mixer plays in real time and the queue gets shallower.

### 25. Steam's packets as the receiver gets them

Measured in Set G's logs and Set D's demo. Finding 28 gives the sender's rule that makes them.

- **An opening:** one packet of 160 ms, 8 frames, which decodes to 7056 samples. That is 17 of 23 openings after a pause in Set G's first run and 17 of 20 in the demo. The others hold 3 to 9 frames.
- **Later packets:** 60 ms in 65%, 40 ms in 14%, 80 ms in 11% and 20 ms in 10% (Set G's first run, 1,520 packets; the demo has 64, 13, 11 and 10%). They come 3, 4 or 5 ticks apart (41, 49 and 10%), 17.8 to 18.0 a second, and never two on one tick.
- **After the spurt's last sound** comes the silence record, 3 to 5 ticks later: 62.5 ms in 39 of 47 and 31.25 ms in the rest.
- **A key press can send an empty packet**, which opens a channel by itself (3 in Set G). It is the end marker of a spurt that the key's release cut short (read, finding 28). Speech that follows within that channel's wait starts early by the time already waited (logged once).
- **The engine adds nothing** (read, W3-03). Once a tick it asks Steam for voice and sends whatever comes as one message, which leaves with the client's next regular packet. The server relays each message to each listener and merges or re-times nothing.

### 26. The gain law, as the engine has it, verified sample for sample

The engine's code confirms findings 3 and 4 constant by constant (read, W3-03): 128-sample blocks at the voice rate, running on across packets; the target `min(maxgain, 32767 / (mean + avggain × (peak − mean)))`; `voice_scale` entering twice; the ramp in whole 1/128 steps truncated toward zero; the int16 clamp. Four details differ from the model as first fitted:
- the ramp's step is the difference divided by 127, the block size less one;
- the block mean is an integer division;
- a decoded block of zeros has no level, so its target is the cap. Every spurt therefore ends, after its silence record, with the gain at its cap;
- the gain is reset to 1.0 whenever a channel is assigned, and not when a spurt is appended.

**Set H** checks it exactly (reproduced). `voice_recordtofile` taps the voice after the gain, so the recording with `voice_maxgain 1` is the decoder's output and the one with 10 is the gain's. The rule above, applied to the first, gives the second sample for sample over its first 291,840 samples (570 packets; the last packet differs between the two key presses). The orchestrator ran the check too (`docs/PROGRESS.json`, `gain_exact`).
- **The integer mean and the zero-block rule are both needed.** Without the first a few thousand samples differ, and without the second a few hundred: 2,798 and 234 in the plan's run (W3-05's order), 3,309 and 745 in the orchestrator's. The two runs' counts were not reconciled.
- **The divisor** 127 or 128 makes no difference on that signal, so the 127 rests on the reading alone.
- **The app's present rule** differs on 3,032 of those samples. Order W3-05 makes the app's gain the engine's.
- **Set H ran `vaudio_celt`.** The same function serves Steam voice at 44.1 kHz (read), where no sample-exact check exists yet.

**Set D** agrees on the zero-block rule (measured, W3-03). At a burst after a pause inside a spurt, at an appended spurt and at a restarted one, recording A is 8 to 12 times the decoded level from the first 1.3 ms step in which the decoded sound rises. So the gain is at its cap at every loud onset.

### 27. The game's and Steam's debug variables

Read from the engine (W3-03) and used for Sets G and H:
- **`voice_showincoming 1` and `voice_showchannels 1`** print the receiver's queue: one line per packet with its decoded sample count, and one line per channel per 15 ms tick with the queued bytes. They need no `developer` setting. While a channel plays, the queue falls by 15.04 ms a line on average (measured, Set G).
- **`voice_recordtofile 1`** writes `voice_decompressed.wav` for each key press: whole packets after the gain, 16-bit mono at the voice rate, at most 1 MiB (11.9 s at 44.1 kHz). With `voice_maxgain 1` and `voice_scale 1` it is the decoder's output.
- **`voice_micdata.wav`** is not filled under the Steam codec (measured: only its start holds sound).
- **`voice_inputfromfile 1`** is not read under the Steam codec. Under the engine codecs it is: a 16-bit mono file at the codec's rate with a plain 44-byte header. The reader skips the first two samples of sound (read and shown on Set H, W3-08, which corrects W3-03's offset).
- **`voice_writevoices 1`** keeps each channel's voice with no length limit (read; not tried).

Read from Steam's client (W3-09) and not yet tried by the owner:
- **`mic_inputfile`** plays a 24 kHz mono file to Steam's encoder in place of the microphone.
- **`mic_outputfile`** writes what Steam captured.
- **`@voice_spew_activity_check 1`** prints each chunk's length, mean and peak and the gate's verdict.

Whether the release client lets them be set from its console was not tested. With them the whole Steam path could be checked against a known input (order W3-14).

### 28. Steam's sender, read from the client: chunks, a level rule, 100 ms kept, a 0.4 s hold

Read from the owner's Steam client and Valve's public copy of it (W3-09: the same constants in both), then checked against Set G's logs and Set D's demo.

- **Chunks.** Each time its voice code runs, Steam takes whatever the capture gained since the last time (read). On the owner's PC that is whole steps of 750 samples at 24 kHz (31.25 ms), about every 55.85 ms (measured). All 1,797 voice packets of the demo and all but 39 of Set G's 2,326 fit chunks of one, two or three steps (demo: 23.4%, 74.8%, 1.8%; Set G: 23.6%, 74.0%, 2.3%). Where the 31.25 ms step comes from was not read.
- **The gate** is on a chunk, not a 20 ms frame: open when the mean of |x| is at least 1.0% of full scale, or any sample reaches 15% (read). Nothing in the client sets those two numbers, so the threshold in Steam's settings is not this gate (inferred). No filter, gain or noise suppression runs before it (read). Against the demo's decoded chunks, the rule marks the last active chunk 7 or 8 chunks before the end marker in 18 of 20 spurts.
- **The pre-roll** is the last 2400 samples (100 ms) of the silent chunks before the onset, zeros if there were none, sent in front of the chunk that opened the gate (read). That makes the 8-frame opening of finding 25. Straight after a spurt the pre-roll is shorter: 1500 and 750 samples in two of the demo's spurts.
- **The hold** is 0.4 s of Steam's clock after the last active chunk was read (read). The first chunk read later is the last: its final frame is padded with zeros, the end marker follows, the encoder is reset and the sequence number returns to 0. The next chunk goes out as its length only: the silence record. In the demo the last chunk is the 7th after the last active one in 9 spurts and the 8th in 9.
- **Why pauses come out longer.** Steam counts the hold from the last active chunk, which can end up to 62.5 ms after the last loud 20 ms frame. That is one reason the takes' pauses on speech are about 50 ms longer than the app's frame gate gives (measured, W3-01; the reason is inferred, W3-09).
- **One chunk is one message.** Frames of 480 samples are cut from the chunk plus what the last one left over (read). So a 1500-sample chunk gives 3 frames and now and then 4, and a 750-sample one 1 or 2. With the chunk shares above that predicts 65, 13, 10 and 10% of 60, 40, 80 and 20 ms packets, against the logged 65, 14, 11 and 10%, with nothing fitted.
- **The key.** Steam goes on capturing for 0.5 s after the key is released (read). A spurt still open then gets no end marker; the next key press sends the marker alone, the empty packet of finding 25.
- **The queue.** Steam keeps at most 8192 bytes of voice for the game to collect (about 2 s) and drops the oldest beyond that (read).
- **The clock** the hold is measured on is a 32-bit float of seconds. On a Steam that has run for days it moves in steps of 16 to 31 ms (read; that it counts from Steam's start is assumed, and its effect was not measured).
- **The encoder** is libopus 1.1.x. The public Linux build of the client carries the string `libopus 1.1.4`; the Windows build is inferred to be the same. Its settings, read: 24000 Hz, mono, VOIP, then bit rate 32000, signal voice and DTX, and nothing else. So complexity is the library's default, 9, and VBR is constrained. It is fed 16-bit samples. The pinned 1.1.5 gives identical packets at complexity 8, 9 and 10 (reproduced: 19,428 frames).
- **The capture** is opened through DirectSound at 24 kHz, mono, 16-bit (read). So the conversion from the device's rate is done by Windows or the virtual cable, not by Steam.

The app's gate is not this rule yet (finding 12 and the Model table).

### 29. Steam's decoder: 16 bits, at most 10 concealed frames, and FFmpeg's resampler once per packet

Read from Steam's client (W3-09), with the resampler run from its public source.

- **Per frame.** An end marker resets the decoder. A sequence number ahead of the expected one conceals the gap, at most 10 frames of it; one behind resets without concealing. A silence record becomes that many zeros.
- **16 bits.** Decoded sound is 16-bit. In libopus's public source the 16-bit decoder of a float build softens peaks past full scale before it rounds; whether Steam's build is a float build was not read.
- **The resampler.** Each packet then goes, by itself, through FFmpeg's libswresample at its default settings (32 taps, 147 phases, a Kaiser window) from 24000 to 44100 Hz. The public library, called the same way, returns the logs' counts exactly: 7056 samples for 3840, 2646 for 1440, 882 for 480, and 2757 or 2756 for a silence record of 1500 (reproduced, W3-09).
- **Float inside.** For a rate change that library works in 32-bit float, not in 16-bit fixed point as W3-09 has it. On x86 the order of its sum is chosen by the processor's features. So two PCs can differ in the last bit of up to a few samples in ten thousand at full scale, and fewer at speech level: none or one in 55,000 at −24 dBFS (reproduced on the public library, W3-11 plan). Which kernel Steam's build runs is not known. Valve ships FFmpeg 8.1.2 and the library run here was 6.1.1; the public source of this path is the same in both.
- **Its response** (computed from the filter as the public source builds it): flat to 10 kHz, −0.7 dB at 11 kHz, −2.4 at 11.5, −4.0 at 11.75, −6.0 at 12 kHz. Just above 12 kHz it leaves a mirror of what lies just below: 6 dB down at 12 kHz, 12 dB at 12.5 kHz, 22 dB at 13 kHz, over 65 dB above 14 kHz.
- **A speaker's first packet** is finished by mirroring its last 16 input samples. They stay in the stream, so everything after is 16 input samples (0.67 ms) late. Once per speaker per session. Reproduced on the public library by the W3-11 plan and its review, which corrects W3-09's account of it; not seen in a recording.
- **A silence record is dropped,** not played, when more than 0.2 s is already waiting in that decoder's output. In the game's use the output is taken at once, so it is played (read; Set G shows the records queued).
- **Nothing else touches decoded sound:** Steam's `voice_autogain` is 0 (read).

The app's Steam profile does not do this yet: it decodes to float and resamples the whole decoded signal with its own filter. Orders W3-13 and W3-11a build the decoder as read.

### 30. From the voice channel to the speakers

Read from the engine (W3-07) and measured in five recordings from two PCs (Set D's two and three of Set B's).

- **The mixer** runs at a fixed 44100 Hz in device buffers of exactly 512 samples (read). These are the 512-sample pulls of finding 22.
- **The voice into the mix.** Steam voice is a 44100 Hz source at pitch 1.0, so it is copied in sample for sample, with no interpolation and no filter, at 255/256, truncated toward zero. With the two-speaker setting it is 253.5/256. The copy is read. The level rests on the code in part and on the recordings: recording A's 1 kHz tone gives a channel volume of 1.00 to 1.006, which cannot tell 255 from 253.5.
- **Then:** the sum of all sound, a clip at ±32767, `volume`, rounding to 16 bits, in that order (read). So the ceiling is round(32767 × `volume`). Recording A's largest sample is 4915 at `volume 0.15`, with 4% of its samples exactly there and none above (measured). The clip acts on the sum of the voice and the game's other sound; the voice alone tops out at 32639, 0.4% under the ceiling.
- **DSP.** A voice is not dry (read). Where a room preset is active, 26/256 of it passes the room's reverb and the direct part falls to 229/256. Under water the whole output passes the water preset. The takes were made with no preset active: A's level is within 1% of the full one.
- **Ducking.** While any voice channel is assigned, every other sound falls to half over 0.4 s (`voice_overdrive 2`; read, W3-03). The voice itself is exempt from that and from the game's own ducker (read, W3-07). So the game's ambience under a voice is 6 dB lower than between spurts.
- **No `[0.1, 0.8, 0.1]`.** The engine has no filter between the voice channel and the 16-bit samples it hands on (read).
- **The roll-off above 12 kHz** in the 48 kHz recordings is linear interpolation from 44100 to 48000 Hz. It is done after the engine by XAudio2, the system component the engine hands its 44.1 kHz buffers to. That XAudio2 interpolates linearly is measured, not read:
  - flat tops stay exactly on the ceiling, which a band-limited resampler would overshoot;
  - a 1 kHz tone has images at 4900 and 2900 Hz, at −64.5 to −65.5 dB and −64.3 to −66.6 dB in the five recordings. Linear interpolation predicts −65.4 and −66.2 dB.
- **Its response** is sinc²(f/44100): −0.95 dB at 8 kHz, −1.8 dB at 11 kHz, −2.6 dB at 13 kHz and −5.1 dB at 18 kHz. The fitted filter agreed with it within 0.1 dB to 13 kHz and was 1.1 dB bright at 18 kHz. The images grow with frequency: a 10 kHz tone has one at 13.9 kHz about 21 dB down. On a 44100 Hz device there would be no interpolation (inferred; no take).
- **The engine codecs** run at 22050 or 11025 Hz. The mixer brings them to 44100 Hz by linear upsampling by two, once or twice (read).

The app still ends with the fitted 3-tap filter and `volume`. Order W3-10 builds the stages as read.

### 31. The engine codecs, read and matched

- **`vaudio_celt` and `vaudio_celt_high` are one module:** the public CELT 0.11 source at the commit the app pins, built with its pitch pre-filter and post-filter compiled in, with 16-bit entry points (read, W3-03 and W3-08). It sets nothing but the library's defaults, so complexity is 5. The module resets the encoder after creating it, and the engine resets the codec again at each start of recording.
- **`vaudio_celt`** is the 22050 Hz mode with 512-sample frames and 64-byte packets, as the app's `celt_22` has it.
- **`vaudio_celt_high`** is the 44100 Hz mode with 1024-sample frames and 128-byte packets, fed 22050 Hz sound (read; Set H's packets are 1024 samples at 22050 Hz). A frame therefore lasts 46.4 ms and the real rate is 22.05 kbit/s, the same as `vaudio_celt`. Its band ends at about 10 kHz. That is measured on the mode itself, not in a take: a 9 kHz tone comes back at +0.35 dB and a 10.5 kHz tone at −66 dB (`docs/work-orders/W3-06-celt-settings.md`). W3-03's "at most 11 kHz" was an upper bound.
- **Reproduced on Set H** (W3-08, and re-run by the orchestrator). The project's own build method, with the filter compiled in, the reset, 16-bit rounding with ties to even, and the input taken from the file's third sample, gives the game's decoded voice at 292,351 of 292,352 samples for `vaudio_celt` and 292,789 of 292,864 for `vaudio_celt_high`. The rest are one step apart. Complexities 5 to 10 give the same output, so the recordings cannot tell 5 from 10; the 5 is read.
- **The app's bundled CELT is built without the filter.** Its encoder is then a different one: 17.7 and 17.8 dB against the game on Set H, where the rebuilt one gives 125.6 and 106.9 dB. Its decoder refuses any real packet whose filter flag is set (read in the public source and shown, W3-08). So today a real `vaudio_celt` packet decodes in the app only where that flag is not set, and a demo's CELT voice does not decode where the voice is pitched. Order W3-06 rebuilds the codec with the filter and sets the modes as read; it is not built yet.
- **`vaudio_speex`** is read from a module of another Source game that the owner supplied (W3-09); TF2 ships none. It is Speex 1.0.2 or 1.0.1: the two cannot be told apart in the module, and 1.0.2 is the one with a public tag. It runs narrowband at quality 4 (for the engine's 3), 20 bytes a frame, constant bit rate, enhancement on. It is fed the engine's 11025 Hz sound with no resampling: a frame is 14.51 ms, the rate 11.025 kbit/s and the band 5.5 kHz. Decoded samples wrap past full scale. The module has no concealment path (read); what the game plays for a lost Speex frame was not read.
- **Speex cannot be recorded.** A current game asked for it runs `vaudio_celt`: read for a listen server's host, which is the owner's set-up (W3-09), and shown by Set I, which is in 512-sample packets at 22050 Hz and which the rebuilt CELT reproduces at 145,919 of 145,920 samples. A client of somebody else's server would fall back to the Steam codec instead (inferred, not tested). The app's `speex` profile runs Speex 1.2.1 at 8000 Hz with a resampler on each side; orders W3-12a and W3-12b rebuild it as read.

## Model

"The game" is what was read or measured. "The app today" is what the code on main runs (`constants.js`, `audio.js`), with the order that closes each gap. The orders are in `docs/work-orders/`, and their sequence is in `docs/reports/W3-11-plan.md`, "The order of work". Of these orders only W3-02a (the queue as a module) is merged; W3-05 and W3-12a are being built.

| Stage | The game | The app today | Basis |
| --- | --- | --- | --- |
| Capture | Steam opens the capture at 24 kHz, mono, 16-bit; Windows or the virtual cable converts from the device's rate. A stereo cable reached the game as its left channel | left channel of stereo input, resampled to 24 kHz; clipped at 16-bit full scale but not rounded to 16 bits (W3-11a rounds) | findings 6 and 28 |
| Capture roll-off | the capture's resampler on the sender's machine. On the owner's PC: −0.5 dB at 11.25 kHz, −2.6 dB at 11.45 kHz, −6.5 dB at 11.75 kHz | 0 dB to 11 kHz, −2.2 dB at 11.45 kHz, −6.6 dB at 11.75 kHz, −8.5 dB at 12 kHz (255-tap FIR at 24 kHz, before the gate and encoder) | findings 14, 16 and 28 |
| Voice gate | Steam's chunk rule. A chunk is the whole capture steps since Steam's last frame (750 samples each on the owner's PC). Open when mean \|x\| ≥ 1.0% of full scale or a sample ≥ 15%; 2400 samples kept before the onset's chunk; held 0.4 s of Steam's clock; one chunk a message, cut into 480-sample frames with the remainder kept; the encoder and decoder reset per spurt | a 20 ms frame with RMS > −39.5 dBFS is sent with the 6 frames before it and the 22 after it; other frames not sent; a fresh encoder and decoder per talk spurt. Steam's rule for the `steam` profile: W3-02b (the module), W3-11a (the render), W3-11b (the live chain). The other profiles keep the frame fit | findings 5, 12 and 28 |
| Codec | libopus 1.1.x (1.1.4 by the Linux client's string; Windows inferred): Opus 24 kHz mono, VOIP, signal=voice, 32 kbps constrained VBR, complexity 9 (the default), DTX, 20 ms; 16-bit samples in and out; at most 10 frames concealed per gap | libopus 1.1.5 at both ends with the same settings, but complexity 10 (the same packets as 9) and float samples in and out; no cap on concealed frames. Complexity 9, the 16-bit decode and the decoder's rules: W3-11a | findings 11, 13, 16, 28 and 29 |
| Decoder's resampler | FFmpeg's libswresample at its defaults (32 taps, 147 phases, Kaiser window), 24000 to 44100 Hz, in float, once per packet. Which kernel Steam's build runs is not known | the app's own windowed-sinc resampler over the whole decoded signal. A port of the library's float path: W3-13 (the module), W3-11a (in the render) | finding 29 |
| Voice rate | 44.1 kHz for Steam voice; the mixer runs at a fixed 44100 Hz | 44.1 kHz | block-rate lines, post-decode clipping; read: findings 22 and 30 |
| Voice channel | a 0.5 s ring per speaker; a new channel waits ceil(0.1 × frames a second) ticks of 15 ms at `voice_buffer_ms 100`; a spurt that arrives before the ring is found empty is appended; one sample dropped per packet; the last 0.1 s of the queue faded | not in a render. The source's timeline is kept, with the flat rule of finding 19 as an option (`voice_retime`). The ring exists as a module (`voice-channel.js`, W3-02a). W3-02b to W3-02d run it in the render and on the page, at `fps_max 300` and `voice_buffer_ms 100`; W3-02f retires the flat rule; W3-02g feeds it a demo's own packets | findings 19 and 21 to 25 |
| Auto-gain | finding 26's rule: finding 3's law in 128-sample blocks; `voice_scale` entering twice; the step is the difference over 127; an integer block mean; a decoded block of zeros sends the gain to the cap; reset to 1.0 when a channel is assigned. Defaults `voice_avggain 0.5`, `voice_maxgain 10`, `voice_scale 1` | finding 3's law and finding 4's update as fitted: the step over 128, the mean kept as a fraction, the gain held through zero blocks and carried across every gap. The engine's rule: W3-05 (being built) | findings 3, 4 and 26; Sets B and H |
| Output stage | the voice into the mix at 255/256, truncated; the sum of all sound clipped at ±32767; `volume`; rounding to 16 bits; then XAudio2's linear interpolation to the device's rate (48000 Hz in the takes; none on a 44100 Hz device) | 3-tap `[0.1, 0.8, 0.1]` at 44.1 kHz, then `volume`. The filter was fitted to Set A's 13–18 kHz slope: it matches the interpolator within 0.1 dB to 13 kHz, is 1.1 dB bright at 18 kHz and has no images. The stages as read: W3-10 | findings 1 and 30 |
| Network | measured on a listen server: findings 8 and 9. Read: Steam's decoder conceals at most 10 frames of a gap. Whether loss falls on whole messages is open (below) | lost frames in Gilbert-Elliott bursts, mean 2.2 frames, concealed by Opus; jitter makes 3.2% of frames late at 50 ms (scaled linearly), one in ten silent | findings 8, 9 and 29 |
| Engine codecs | `vaudio_celt`: CELT 0.11 with its pitch filter, 22050 Hz, 512-sample frames, 64 bytes, complexity 5. `vaudio_celt_high`: the 44100 Hz mode with 1024-sample frames and 128 bytes, fed 22050 Hz sound. `vaudio_speex`: Speex 1.0.2 or 1.0.1 on 11025 Hz sound with no resampling, wrapping past full scale; a current game runs `vaudio_celt` in its place | `celt_22`: the same mode, built without the pitch filter, complexity 10. `celt_44`: 44100 Hz sound, 256-sample frames, 120 bytes, a row the engine never selects. `speex`: Speex 1.2.1 at 8000 Hz with a resampler on each side, clipping. W3-06 (the CELT settings and rebuild); W3-12a and W3-12b (Speex) | finding 31 |

## Results

**Set B.** Rendered by the app with each take's settings and `volume 0.15`. Each entry is level (dB re full scale), then samples within 5% of the clamp:

| Segment | Default: real / model | `voice_avggain 0.25` | `voice_scale 0.5` |
| --- | ---: | ---: | ---: |
| sine −36 dBFS (DTX after 0.4 s) | −26.2 / −27.3 dB | −25.6 / −27.3 dB | −32.6 / −36.3 dB |
| sine −30 dBFS (DTX after 1.2 s) | −14.9 / −14.6 dB | −14.6 / −14.6 dB | −23.5 / −23.6 dB |
| sine −24 dBFS (gain at the cap) | −6.9 / −6.6 dB, 0 / 0% | −6.9 / −6.6 dB, 0 / 0% | −16.1 / −15.7 dB |
| sine −12 dBFS | −2.1 / −2.1 dB, 42 / 39% | −1.8 / −1.8 dB, 50 / 46% | −10.1 / −10.1 dB |
| sine −1 dBFS | −2.2 / −2.1 dB, 42 / 39% | −1.8 / −1.8 dB, 50 / 46% | −13.4 / −13.5 dB |
| pink −18 dB RMS | −5.3 / −5.3 dB, 10 / 10% | −4.2 / −3.9 dB, 19 / 18% | −13.5 / −13.5 dB |
| pink −20 dB RMS, 10 s | −5.5 / −5.4 dB, 9 / 9% | −4.5 / −4.5 dB, 15 / 13% | −13.6 / −13.6 dB |
| pink steps −45/−18 | −8.1 / −8.1 dB, 5 / 5% | −6.8 / −6.8 dB, 10 / 9% | −16.3 / −16.3 dB |
| synthetic vowel −18 dB | −5.0 / −4.9 dB, 22 / 21% | −4.5 / −4.4 dB, 23 / 23% | −9.9 / −9.8 dB |
| sweep −20 dB | −4.1 / −4.0 dB, 16 / 13% | −4.1 / −4.0 dB, 16 / 13% | −12.9 / −12.9 dB |

A pure sine's codec noise moves by about 2 dB with where the 20 ms frames fall on it. That explains the 3–4 point spread in the sines' clipped share: Steam's own packets through the receiver model give 39%. The quiet −36 dBFS rows include game ambience in the recordings. Before Set D, the model put the −36 dBFS sine at −19.1 dB and the −30 dBFS sine at −13.1 dB, because it had no DTX.

**Speech.** The owner's raw speech was rendered by the app and compared spurt by spurt. The spectrum error is the largest band deviation from 100 Hz to 11.5 kHz:

| Metric | Recording | Current model (libopus 1.1.5) | Set D fit on 1.6.1 | Before Set D | Before Set B |
| --- | ---: | ---: | ---: | ---: | ---: |
| 50 ms level error (mean ± SD) | — | +0.08 ± 0.37 dB | +0.12 ± 0.38 dB | +0.03 ± 0.47 dB | +1.34 ± 1.70 dB |
| 50 ms level correlation | — | 0.998 | 0.997 | 0.996 | 0.968 |
| Spectrum error | — | 0.3 dB | 0.3 dB | 1.7 dB (above 3 kHz) | — |
| Samples at the clamp | 8.4% | 9.0% | 9.1% | 9.1% | — |
| Overall level | −6.62 dB | −6.51 dB | −6.50 dB | −6.51 dB | — |

**Set D.** The app against Steam's packets and recording A:
- **Talk spurts:** 18 against Steam's 20. Steam closes and reopens where the model runs on across a 440–500 ms gap. Both boundaries of 16 of 18 spurts fall within 4 frames. 98.7% of 20 ms frames agree on sent or not sent.
- **Bytes:** 330 031 in total against Steam's 330 735 (−0.2%). Bytes per coded frame are within 1% on sines, noise, bursts, the sweep and the vowel.
- **DTX:** 629 frames against 693. The segment counts match to within 5 frames (sines 130/130, noise 19/19, bursts 54/54, vowel 0/0). Most of the gap is in the 11.5–12 kHz tones (173 against 243).
- **Codec spectrum against the packets:** within ±0.06 dB from 0 to 11.4 kHz on noise, and ±0.2 dB to 12 kHz.
- **Full render against recording A:** spectrum within ±0.5 dB from 100 Hz to 11.8 kHz on noise and the vowel, most bands within ±0.2 dB. Median segment levels are within ±0.2 dB on segments more than 15 dB above the ambience. On the DTX'd 8 kHz tone, the recording has −32.5 dBFS and the model −33.0.
- **Steam's packets through the receiver alone.** The app reads the demo itself (`demo.js`) and renders its packets with only the receiver running (`opts.received`). Each result is lined up talk spurt by talk spurt as in the accuracy suite:
  - **Recording A** (`volume 0.15`): 0.14 dB rms in half-second blocks (worst 0.67 dB, r 0.996, 148 blocks), with the overall level 0.15 dB high. Bands from 120 Hz to 11 kHz are within 0.3 dB; 80–120 Hz is −0.8 dB and 11–12 kHz −2.0 dB.
  - **Recording B** (`volume 0.077`): 0.89 dB rms, with bands within 0.9 dB. That listener's clipping differs (Listener B, below). The run used the settings fitted at the time; finding 15 gives the ones inferred since.

**Set C.** The app rendered the network test signal and was measured the same way as the takes:

| Take | App setting | Events per second, real / app | Frames lost, real / app | Events of 1 / 2 / 3 / 4+ frames, real / app |
| --- | --- | ---: | ---: | --- |
| loss5 | 22% | 4.3 / 4.4 | 17 / 17% | 51/23/17/9 / 49/28/15/7% |
| loss15 | 64% | 14.1 / 14.8 | 58 / 60% | 54/21/10/15 / 50/29/9/12% |
| jitter | 50 ms | 1.36 / 1.49 | 3.1 / 3.6% | 81/11/9/0 / 97/0/0/3% |
| combined | 45%, 50 ms | 12.0 / 10.2 | 43 / 42% | 57/25/9/9 / 52/27/6/14% |

**Set A.** From `pnpm compare:reference`, left channel:
- **Level tracking (half-second RMS deviation):** River 0.11 dB, Take It Off 0.07 dB. The model before Set D gave 0.16 and 0.07 dB; the one before Set B gave 0.55 and 0.42 dB.
- **Spectrum:**
  - From 80 Hz to 12 kHz: within ±0.3 dB, and within ±0.1 dB for Take It Off. River is −1.7 dB at 40–80 Hz.
  - Before Set D, 8–12 kHz sat 0.9–1.4 dB low.
  - From 12 to 16 kHz: 0.8–1.0 dB low. From 16 to 19 kHz: within 2.5 dB.
- **Clip statistics:** higher than the MP3 shows (16–19% against 13%), as finding 7 predicts.
- **Receiver auto-gain off:** misses by 3–4 dB in level tracking and 20–60 dB above 12 kHz.

**Every take (accuracy suite).** `pnpm accuracy --takes <folder>` renders each source with the take's settings (`tests/accuracy.takes.json`), lines the take up talk spurt by talk spurt against the render and compares them where they overlap. Level is the RMS difference of 0.5 s blocks more than 10 dB above the take's ambience, after removing their median offset; the band column is the largest level-matched difference from 80 Hz to 12 kHz.

| Take | Settings | Level, dB rms (r) | Largest band difference | Samples at the clamp, take / render |
| --- | --- | ---: | --- | ---: |
| Set B default | `volume 0.15` | 1.45 (0.95) | +2.6 dB at 10–11 kHz | 9.4 / 9.6% |
| Set B `voice_scale 0.5` | | 0.27 (0.99) | +1.0 dB at 11–12 kHz | 0.6 / 0.6% |
| Set B `voice_maxgain 1` | | 0.15 (1.00) | −1.9 dB at 80–120 Hz | 0.6 / 0.5% |
| Set B `voice_avggain 0.25` | | 1.07 (0.97) | +1.0 dB at 11–12 kHz | 11.1 / 11.5% |
| Set B speech | | 0.96 (0.99) | −0.2 dB at 10–11 kHz | 7.0 / 7.4% |
| Set C baseline | | 0.39 (1.00) | −0.2 dB at 80–120 Hz | 1.1 / 2.3% |
| Set D sender A | | 0.15 (1.00) | +2.3 dB at 11–12 kHz | 7.6 / 9.6% |
| Set D listener B | `volume 0.077` | 0.87 (0.84) | +3.3 dB at 11–12 kHz | 1.2 / 9.6% |
| Set E River clip | `volume 0.15` | 0.21 (0.98) | +0.2 dB at 80–120 Hz | 12.9 / 15.0% |
| Set F low tones, default | | 3.54 (0.82) | −1.3 dB at 0.5–1 kHz | 14.1 / 14.3% |
| Set F low tones, `voice_maxgain 1` | | 3.89 (0.56) | −15 dB at 11–12 kHz | 0.7 / 0.6% |
| Set A River | | 0.10 (0.99) | −0.3 dB at 10–11 kHz | 13.7 / 16.2% (MP3) |
| Set A Take It Off | | 0.07 (1.00) | −0.2 dB at 10–11 kHz | 12.6 / 18.1% (MP3) |

- **Residuals.** The largest block differences in the default and `voice_avggain 0.25` takes are the ones findings 13 and 14 describe: the −36 dBFS sine near the game's ambience, hold tails, and the 10–12 kHz tones Steam puts into DTX more often.
- **Low tones.** The Set F takes differ block by block because their comfort-noise plateaus are random in both (finding 18); the 11–12 kHz band of the `voice_maxgain 1` take is ambience against near silence.
- **Listener B.** The row above was rendered at `volume 0.077` and `voice_scale 1`, the settings fitted to its levels at the time. Its peaks reach −19.7 dBFS, 2.5 dB above that render's clamp, and only 1.2% of its samples sit at them. W3-07 explains both, and the output path is not the cause (finding 15). The PC ran `volume 0.11`: its largest sample is 3604, which is −19.2 dBFS. It also ran `voice_scale 0.77`, at which a loud tone's plateau sits at 0.72 of the ceiling, unclipped. Both are inferred from the recording. The row has not been rendered again at those settings.
- **Samples at the clamp.** In a take a sample reaches the ceiling itself only when game sound adds to the voice, whose own plateau is 0.4% under it (finding 30). So the share at the exact ceiling depends on the game's ambience; the share within a few percent of it does not (W3-07).
- **Set C with loss and jitter** is compared by its statistics above (Set C), not block by block: TF2's and the app's lost frames are different random frames.
- **Clock.** Every take's playback runs about 400 ppm ahead of the source. It is not a recorder's clock: the receiver drops one sample from every packet (finding 24). The one take at 505 ppm had more packets a second.

## What remains unverified

Six settings no recording of the game's output covers yet are predicted in advance in [predictions/PREDICTIONS.md](predictions/PREDICTIONS.md): the legacy codecs `vaudio_celt` and `vaudio_celt_high`, `voice_scale 2`, `voice_avggain 1`, `voice_maxgain 3` and `volume 1`. Set H has since recorded the two CELT codecs' decoded voice (finding 31). Their predictions were registered with the bundled build, and for `vaudio_celt_high` with settings the engine never selects, so a new registered prediction for it is wanted before its take.

- **Talk-spurt timing.** The receiver's queue is the engine's, read and confirmed tick by tick at 67, 100 and 300 frames a second (findings 22 and 23). The app does not run it yet: renders keep the source timeline by default, and early starts after short silences are an option modeled by the flat rule of finding 19. The one sample dropped per packet (finding 24) is not modeled either. When the queue runs in a render, what a file render makes up is Steam's packets. When Steam's frames fall is a model of one PC's logs (findings 25 and 28), so which pause near 0.4 s closes will differ from any one take. The early starts and the 0.04% occur with a remote listener on a dedicated server too (Set D).
- **The queue, not recorded.** The fade and the underrun padding in sound; a listener under 67 frames a second; the queue under the engine codecs. By the rule a long transmission drains the queue, since nothing refills it inside a spurt: after 20 minutes from a full ring, with a gap in continuous sound when it runs out. No take is long enough to show it.
- **The sender's clock.** The chunk rule is read. When Steam's frames fall is one PC's logs: 750-sample steps and a frame about every 55.85 ms. A steady clock at that mean would end every spurt on the 8th chunk after the last active one, and the demo has the 7th in 9 of 18. So the frame times vary more than a steady clock's, or the time is noted a frame earlier than read (W3-11 plan). The coarse steps of the 32-bit float clock on a Steam that has run for days are read, not measured.
- **Steam's libopus build.** The release is 1.1.4 by the Linux build's own string; Windows is inferred (finding 28). The app runs 1.1.5, and 1.1.2 to 1.1.5 gave identical packets on the test signal (finding 16). Steam's compiler and math library could still change packets in their last bits. Whether its 16-bit decoder softens peaks (a float build's does) was not read. Whether the pinned build gives Steam's packets bit for bit needs a known input: Steam's `mic_inputfile` would give one (finding 27; order W3-14). Pure tones at 11.5–12 kHz fall into DTX in Steam's encoder more often than in the model. The capture resampler (Windows's or the cable's) is modeled by its measured roll-off, not reproduced.
- **The decoder's resampler.** Which kernel Steam's build runs is not known. Valve ships FFmpeg 8.1.2, and the public 6.1.1 was the one run. The first packet's 16 mirrored samples are reproduced on the public library, and the cap of 10 concealed frames is read; neither is seen in a take (finding 29).
- **The gain under Steam.** The rule is sample-exact against Set H, which ran `vaudio_celt`. The same function serves Steam voice (read), where no sample-exact check exists yet. The divisor 127 rests on the reading alone (finding 26).
- **PC B's settings.** `volume 0.11` and `voice_scale 0.77` are inferred from recording B and not yet read off that PC (finding 15).
- **Stereo capture.** Finding 6 is one capture chain (a stereo virtual cable). A physical microphone is mono either way.
- **Comfort-noise details.** The model reproduces when comfort noise starts and how often it refreshes, but not the random excitation's exact values. For a steady tone below 60 Hz, the sign and height of each near-DC plateau differ from TF2's (finding 18).
- **Output stage.** The interpolation to the device's rate is XAudio2's: measured in five recordings from two PCs, not read. A 44100 Hz device would have none (inferred; no take). The app still applies the fitted 3-tap filter in its place (order W3-10). The voice's 255/256 rests on the code in part and on the recordings, which cannot tell it from 253.5/256 (finding 30).
- **Engine codecs and rooms.** The CELT codecs' build and settings are read and reproduced on Set H, but the app does not run them yet (finding 31; orders W3-06 and W3-12). Set H is the game's decoded voice, not its output: no take of the game's output under either CELT codec exists. Whether the receiving side's CELT decoder is reset between spurts was not read (W3-08). Speex is read from a module of another Source game and cannot be recorded in a current game. The room presets are not validated against recordings, and a voice's share through an active room preset as read, 26/256 (finding 30), is not what the app's rooms use ([LEGACY_CODECS.md](LEGACY_CODECS.md)).
- **Network settings.** Set C used simulated loss on a listen server, where `net_fakeloss` hits both directions. How a given real-world or one-way loss rate maps to lost frames is not measured, so the app's control is the share of frames lost. The jitter rate is calibrated at one setting (`net_fakejitter 50` with `net_fakelag 100`) and scaled linearly. Set D ran on a LAN with no loss. Real internet loss was not recorded.
- **Loss on messages or on frames.** In the game a lost network packet loses a whole message: 1 to 4 frames, 8 at an opening (inferred from finding 28). The app draws loss per frame, fitted to finding 8's bursts, about half of which are one frame long. Whole-message loss would not give those. This is not settled; a Set C take with the two debug variables on would show which it is (W3-11 plan).

## Reproduce

```sh
python3 tests/testsignal/make_testsignal.py   # writes the v1 WAV and segment map (numpy, scipy)
python3 tests/testsignal/make_nettest.py      # the network test signal
pnpm install --frozen-lockfile
pnpm compare:reference 'path/to/tf2 VOIP test 2026 pure.mp3' 'path/to/Joni Mitchell - River.mp3' 'path/to/Ke$ha - Take It Off.mp3'
```

For a new take of the test signal:
1. Set `voice_loopback 1` and push-to-talk, with the voice settings under test.
2. Play the WAV into the microphone input at unity gain through a virtual cable.
3. Record only the game's output, losslessly.
4. Note the TF2 and Steam versions and the `volume` value.

For SourceTV packets, see [`tests/demovoice/`](demovoice/README.md). For talk-spurt timing (finding 21), run `node tests/retiming.mjs --accuracy results.json --demo voicetest.dem` on the accuracy suite's JSON.

For the receiver's queue (findings 22 and 23), log the console with `voice_loopback 1`, `voice_showincoming 1` and `voice_showchannels 1` set, and note the frame rate. [`tests/voicequeue/`](voicequeue/README.md) turns the log into numbers and replays it through the queue's rule. The log itself stays private.

Use single quotes around filenames containing `$` in PowerShell. The compare tool reads files locally, prints JSON and uploads nothing. A full run takes a few minutes.
