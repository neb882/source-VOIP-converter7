# 2026 TF2 voice recordings: what they show

The evidence log: every recording, what was read from the game's and Steam's files, the findings, and the
corrections. A figure's evidence lives here and nowhere else; the other documents state the figure and point to
its finding by number. Nothing is deleted: a statement that a later order or set corrected stays where it stands,
marked *Corrected by ... (date)*, with what is true now. [docs/FINDINGS.md](../docs/FINDINGS.md) states each
finding once as it stands, and [docs/ACCURACY.md](../docs/ACCURACY.md) says, stage by stage, how close the app is.

No recording, source music or derived audio is distributed with this project. The exceptions are the synthetic test
signals, whose generators are in [`tests/testsignal/`](testsignal/). The recordings, logs and demos are the owner's
and stay private; only numbers measured from them are written here.

*Corrected by RP-01 (2026-11-13): seven of the game's recordings of Sets H, I, M and O, the ones that
[`recordings/manifest.json`](recordings/manifest.json) lists, are published too, under `recordings/files/`, each
the game's file byte for byte. They were made from the two clips that
[`recordings/make-inputs.mjs`](recordings/make-inputs.mjs) makes, and hold no voice and no music. The other
recordings, the logs and the demos stay private.*

The sets, by date:

| Set | Made | What it is |
| --- | --- | --- |
| A | 2026-09-24 to 27 | music, recorded with `voice_loopback 1` |
| B | 2026-09-24 to 27 | a calibrated test signal under four settings, and the owner's speech; lossless |
| C | 2026-09-24 to 27 | a one-minute network test signal under simulated loss and jitter, and speech under loss; lossless |
| D | 2026-09-24 to 27 | the test signal through a dedicated server with SourceTV: the demo with Steam's packets, the sender's loopback and a second listener |
| E | 2026-09-24 to 27 | an 8 s music clip, with the app's render of it |
| F | 2026-09-24 to 27 | a low-tone test signal, at default settings and at `voice_maxgain 1` |
| G | 2026-11-10 | console logs of the receiver's queue, at 300, 67 and 100 frames a second |
| H | 2026-11-10 | `vaudio_celt` and `vaudio_celt_high` with a file as the microphone, the game writing its decoded voice |
| I | 2026-11-10 | the same with `sv_voicecodec vaudio_speex` (the game ran `vaudio_celt`) |
| J | 2026-11-10 | Steam with a file as the microphone, Steam's console printing every chunk |
| K | 2026-11-10, retaken that night; scored 2026-11-11 | the owner's room recordings on 2Fort |
| L | 2026-11-11 | Steam's own log of when it started, for two file-input runs, and a real-microphone run |
| M | 2026-11-11 | Speex in HL2DM's 32-bit game, with a file as the microphone |
| N | 2026-11-11 | the first opening on a newly started Steam with a real microphone |
| O | 2026-11-11 | Speex in TF2's own 32-bit game, with a file as the microphone |

Sets A to F were played into TF2's microphone input through a virtual audio cable on private servers. Sets G to O
use the game's and Steam's own debug output, and most of them no recorder. Set B identified the receiver law, and
Set A and the speech take validate it. Set C measured what loss and jitter do to the voice. Set D separates the
sender from the receiver: its packets show what Steam's encoder sent, and the recordings what the game made of
them. Set G confirms the receiver's queue as read from the engine. Set H checks the receiver's gain and the two
CELT codecs sample for sample. Set J checks Steam's gate, codec and decoder against a known input, sample for
sample. Sets M and O check the Speex profile against the game. Findings 22 to 32 and the corrections that cite them
date from 2026-11-10 on.

On 2026-11-10 the room effect was read from the engine and then found in the first sets (finding 32). Set B carries
no room. Set C carries the game's automatic room, and both recordings of Set D carry a room too. Until then every
set was taken to be dry.

Sets K, L and N have no entry of their own under "Provenance": what the record has of them is given there, and
what it does not have is marked "not recorded".

"W3-18" in "What was read" and in findings 14, 15, 27, 30 and 32 is the investigation of the rooms in the takes, renamed W3-15b
on 2026-11-12 (`docs/reports/W3-15b-rooms-in-the-takes.md`); elsewhere W3-18 is the order that made the Speex
profile's arithmetic the game's.

How a statement is known is said where it is made:
- **read**: from a binary, with the report that read it;
- **measured**: from takes or logs, with the numbers;
- **reproduced**: a check that was run, with its count;
- **inferred**: a conclusion, with what it rests on.

A statement in findings 1 to 21 with no label is measured from the sets it names.

<details><summary>The head as it stood before 2026-11-12</summary>

Measured locally from 2026-09-24 to 2026-09-27. No recording, source music or derived audio is distributed with this project. The exceptions are the synthetic test signals, whose generators are in [`tests/testsignal/`](testsignal/).

Six sets of recordings were made on private servers, playing files into TF2's microphone input through a virtual audio cable:

- **Set A** (music): one MP3 of two songs, recorded with `voice_loopback 1`.
- **Set B**: a calibrated test signal recorded under four settings, plus the owner's own speech, all with `voice_loopback 1`. All are lossless FLAC.
- **Set C**: a one-minute network test signal recorded under simulated packet loss and jitter, plus the owner's speech under loss. All are lossless FLAC.
- **Set D**: the test signal sent from one PC to a dedicated server with SourceTV. The set has three parts: the demo, holding Steam's own voice packets; the sender's loopback output; and the output of a second account on a second PC.
- **Set E**: an 8 s music clip recorded with `voice_loopback 1`, with the app's render of the same clip.
- **Set F**: a low-tone test signal recorded with `voice_loopback 1`, at default settings and with `voice_maxgain 1`.

Set B identified the receiver law, and Set A and the speech take validate it. Set C measured what loss and jitter do to the voice. Set D separates the sender from the receiver: its packets show exactly what Steam's encoder sent, and the recordings show what the game made of them.

On 2026-11-10 four more sets were made with the game's and Steam's own debug output and no recorder, and the game's and Steam's own files were read (see "What was read"):

- **Set G**: console logs of the receiver's queue on a local game with `voice_loopback 1`, at the default cap of 300 frames a second and at `fps_max` 67 and 100.
- **Set H**: `vaudio_celt` and `vaudio_celt_high` with a file as the microphone, the game writing its own decoded voice to a file.
- **Set I**: the same with `sv_voicecodec vaudio_speex`.

- **Set J**: Steam's own voice path with a file as the microphone (Steam's `mic_inputfile`), Steam's console printing every capture chunk and the game writing its decoded voice to a file.

Set G confirms the receiver's queue as read from the engine. Set H checks the receiver's gain and the two CELT codecs sample for sample. Set J checks Steam's gate, its codec and its decoder against a known input, sample for sample. Findings 22 to 32 and the corrections that cite them date from then.

Later the same day the room effect was read from the engine and then found in the first sets (finding 32). Set B carries no room. Set C carries the game's automatic room, and both recordings of Set D carry a room too. Until then every set was taken to be dry.

How a statement is known is said where it is made:
- **read**: from a binary, with the report that read it;
- **measured**: from takes or logs, with the numbers;
- **reproduced**: a check that was run, with its count;
- **inferred**: a conclusion, with what it rests on.

A statement in findings 1 to 21 with no label is measured from the sets it names.

</details>

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

`real tf2 VOIP recording 2024.mp3` is not the owner's take. The owner attributes it to
[a third party's TF2 video](https://www.youtube.com/watch?v=nqXpT5uNdT8). It is a reference of the first era: it is
mixed with game audio, so it can only be screened (`pnpm analyze:reference`), and no accuracy claim rests on it
today.

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

Set B has no room effect on the voice (measured, finding 32).

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

*Added 2026-11-13 (the private look of the order BC-4, read off the owner's `net_graph` photographs): the jitter take's photograph shows a ping of 210 ms with lag 100 and jitter 50 on, at about 336 frames a second, and the baseline's 14 ms at 295. So the 204–210 ms was read with jitter on. With lag on the same photographs show 59.0 packets a second in and 58.9 out, against 67.8 and 66.9 without (not explained).*

| Take | Console | `net_graph` loss | Duration | SHA-256 (FLAC) |
| --- | --- | ---: | --- | --- |
| baseline | all 0 | 0 | 64.1 s | `87f513579b2543633e2c91b59a2f70c0fdd987f524a08598d3f8b46a0a28fa4e` |
| loss5 | `net_fakeloss 5` | 13 | 60.8 s | `e032ab14c4ca3642625308ff77c20aff69bb00921a75e862645393a060fa6708` |
| loss15 | `net_fakeloss 15` | 34 | 61.9 s | `b10e2b4ebc8b2551100508c4278dfccb61d68dbddaca20ebb291dffbf962b7a6` |
| jitter | `net_fakelag 100; net_fakejitter 50` | 0 | 61.6 s | `031e2d62813ca105349b0c247e4d97697e903550818cf46dde577672e3a10094` |
| combined | `net_fakeloss 10; net_fakelag 100; net_fakejitter 50` | 20 | 61.7 s | `e5215d465ada55cbe63735b7650331f101a6b87b8cfa6b76207550d0bf2c1938` |
| speech_loss10 | `net_fakeloss 10`, owner's raw speech | — | 87.9 s | `7aba8b3921c32e918d0753872721cde2811a11c798dc772aa3d754ffac445ef3` |

Each take was compared with the app's lossless render in 10 ms windows every 2.5 ms (300–4000 Hz correlation), following the delay at 20 ms resolution. A window below 0.4 correlation counts as damaged; a damaged stretch of at least 15 ms counts as one loss event. In the clean baseline, received frames correlate at a median of 0.86–0.99, and false events occur about 0.9 times per second. The rates below have that subtracted.

All six takes carry the game's automatic room on the voice (measured, finding 32). The app's render they were compared with has no room.

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

Output levels imply `volume` 0.147 on PC A (the owner's `volume 0.15`). On PC B the levels alone fitted about 0.077; its ceiling shows `volume 0.11`, with `voice_scale 0.77` making up the rest (inferred from the recording, finding 15). Game ambience sits near −35 dBFS in A and −40 dBFS in B, so quieter voice output cannot be checked against the recordings. Recording A carries a street room on the voice, and recording B two weak echoes (measured, finding 32).

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

*Corrected 2026-11-15: 300 frames a second is the owner's cap, not the game's default. The console prints `fps_max` "300" with its default "400" (Set Q), and W3-23r read the start value 400 in `engine.dll`.*

### Set H: the CELT codecs with a file as the microphone

The owner set `sv_voicecodec vaudio_celt`, then `vaudio_celt_high`. The game took a file as its microphone (`voice_inputfromfile 1`: 16-bit mono at 22050 Hz) and recorded its own decoded voice (`voice_recordtofile 1`), with `voice_maxgain 1` and again with 10 (finding 27). No recorder and no cable is in the chain.

| Recording | Decoded voice, 16-bit at 22050 Hz |
| --- | --- |
| `vaudio_celt`, `voice_maxgain 1` | 292,352 samples: 571 packets of 512 |
| `vaudio_celt`, `voice_maxgain 10` | the same input; compared over its first 291,840 samples (570 packets) |
| `vaudio_celt_high`, `voice_maxgain 1` | 292,864 samples: 286 packets of 1024 |

The last packet differs between two key presses on the same input.

Published (RP-01, 2026-11-13): `set-h_vaudio-celt_maxgain-1.wav` and `set-h_vaudio-celt-high_maxgain-1.wav`; their SHA-256s are in `tests/recordings/manifest.json`. The `voice_maxgain 10` recording is not published ("The recordings that are published", below).

### Set I: a current game asked for Speex

The same method with `sv_voicecodec vaudio_speex` gave a recording of 145,920 samples in 512-sample packets at 22050 Hz. The game had run `vaudio_celt` (finding 31).

Published (RP-01, 2026-11-13): `set-i_vaudio-celt-double-speed_maxgain-1.wav`; its SHA-256 is in `tests/recordings/manifest.json`. The set's second recording, at `voice_maxgain 10`, is not published.

### Set J: Steam with a file as the microphone

The owner set `mic_inputfile` and `@voice_spew_activity_check 1` in Steam's console (finding 27), under the Steam codec. Steam then read a 16-bit mono clip at 24 kHz in place of the microphone, looping it, and printed one line for every capture chunk. The game ran with `voice_loopback 1`, `voice_showincoming 1` and `voice_recordtofile 1` at `voice_maxgain 1`, so its recording is the decoder's output at 44100 Hz (finding 27). No recorder, no cable and no microphone is in the chain. Report: W3-14.

| Clip | Length at 24 kHz | Key presses | Recording of the first press |
| --- | --- | --- | --- |
| continuous: speech with no pause | 120,000 samples (5.000 s) | two, about 22 s each | 524,288 samples (11.889 s), the file's 1 MiB limit |
| gate: tones at −38 and −35 dBFS, a 1.5 ms burst, pauses of 0.3 and 0.7 s, speech | 134,401 samples (5.600 s) | two; the second a tap | 524,288 samples |

The two logs hold 789 chunk lines from Steam and 645 packet lines from the game. The continuous clip's recording peaks at −2.0 dBFS, and no sample of either recording is at full scale. The second presses' sound was not kept.

### Set M: Speex in HL2DM's 32-bit game (2026-11-11)

HL2DM's launcher starts the 64-bit game, which cannot load the 32-bit `vaudio_speex` module; started with `-force32bit` the game runs it (packets of 160 samples at 11025 Hz). The method is Set H's: a file as the microphone, the game writing its decoded voice to a file, at `voice_maxgain 1` (912 frames, 145,920 samples) and at `voice_maxgain 10` (913 frames). The recordings are private; only numbers are here. *Corrected by RP-01 (2026-11-13): `set-m_vaudio-speex_maxgain-1.wav`, `set-m-o_vaudio-speex_maxgain-10.wav` and the captured input `set-m-o_capture_vaudio-speex.wav` are published (`tests/recordings/files/`).*

- **Before W3-18** the app's Speex 1.0.2 (the library's sources unchanged, compiled strictly) gave the gain-1 recording, on the game's own captured input, in 92,967 of 145,920 samples: within one unit for the first 2.35 s and in 575 of 912 frames, and elsewhere the same sound at the same level (0.014 dB apart, the difference 13 dB under), coded differently from one frame on (measured).
- **Why** (an investigation, 2026-11-11; read, then run): the module's codec arithmetic is SSE2 compiled with the compiler's fast floating-point model, which differs from strict C of the same source in 25 places of 7 files of libspeex, and its float cosine and arc cosine are its C runtime's, not correctly rounded. The module run in a CPU emulator gives the gain-1 recording in 145,920 of 145,920 samples and executes no x87 instruction (reproduced).
- **Exact since W3-18** (measured 2026-11-11 by the orchestrator, privately, on W3-18's build itself: its vendored WebAssembly module on the game's own captured input; and before that on the investigation's prototype of the build, with the same counts): the gain-1 recording in **145,920 of 145,920** samples (912 of 912 frames) and the gain-10 recording in **146,080 of 146,080**, after the app's `receiverAutoGain` at `voice_maxgain 10` run on the whole decoded stream from its first sample. What is exact is the decoder's stream and the gain on that stream. Until W3-19 the app's whole render at `voice_maxgain 10` did not equal the recording: it dropped the codec's 80 samples of delay before the gain, so the gain's 128-sample blocks fell 80 samples off the game's (86,171 of 145,966 samples; 145,840 of 145,840 at `voice_maxgain 1`). W3-19 moved the gain onto the decoder's stream from its first sample (finding 31), and the whole render now gives the gain-10 recording in 145,966 of 145,966 samples (the orchestrator's private run of `TF2Audio.process`, the gain's output at `onGain`, on the game's own captured input, on the branch at b3fad6f). The merged build equals the module run in the emulator on seven synthetic clips (147 of 147 frames), on its cosine and arc cosine (21,389 and 22,155 arguments) and on the 16-bit output of the tests' five runs (reproduced, `tests/speex102.verify.mjs`).

### Set O: Speex in TF2's own 32-bit game (2026-11-11)

TF2 (build 11191711) started with `-force32bit` runs `vaudio_speex` when asked (voice packets of 320 and 480 samples; the 64-bit game falls back to `vaudio_celt`). Set M's method and Set M's input file, one take at `voice_maxgain 1` and one at `voice_maxgain 10`; each recording is 146,080 samples. The recordings are private; only numbers are here. *Corrected by RP-01 (2026-11-13): `set-o_vaudio-speex_maxgain-1.wav` is published, and the `voice_maxgain 10` recording and the captured input are Set M's files byte for byte, published as `set-m-o_vaudio-speex_maxgain-10.wav` and `set-m-o_capture_vaudio-speex.wav` (`tests/recordings/files/`).*

- **The app at v30 against them** (measured by the orchestrator, privately, on the game's own captured input): the bundled codec gives the gain-1 recording in 912 of 912 whole frames of the input, every sample; the whole render (`TF2Audio.process`, the gain's output) gives the gain-1 recording in **145,966 of 145,966** samples and the gain-10 recording in **145,966 of 145,966**, at the codec's 80 samples of delay.
- **TF2 against HL2DM:** the two games' gain-10 recordings are the same file, and the gain-1 recordings are equal over Set M's 145,920 samples (measured). TF2's `vaudio_speex` module run in a CPU emulator equals HL2DM's on all 147 frames of the public clips, and the 50 bytes of code that differ between the two files are address operands (an investigation, 2026-11-11; run and read).
- **`vaudio_miles` in the same game** is refused: "Voice_Init Failed: invalid voice codec vaudio_miles." The 32-bit folder ships the module and the Miles files; the engine passes four names only (`steam`, `vaudio_speex`, `vaudio_celt`, `vaudio_celt_high`; read in the 32-bit engine).

### Set K: the rooms on 2Fort (2026-11-10)

The owner ran the procedure of `docs/work-orders/W3-17-room-effects.md`, "The owner's recording": the console
readings, an `adsp_debug 2` walk on 2Fort with five places printed, six screen captures with lossy sound, and R1 and R3
again as lossless captures (the takes are named in the order), and that night R1 and R3 again at `volume 0.5` with
`voice_overdrive 1000`. Scored privately against the room module on 2026-11-11 (the order's amendment after Sets K
and L; finding 32). Not recorded here: the files' formats, lengths and checksums, and the game's and Steam's
versions.

### Set L: when Steam's clock starts (2026-11-11)

Steam's own log gave the start of each of two file-input runs: Set J's morning run 23.9 days after Steam started,
and a second run that evening 4.8 minutes after a new start (finding 16). With it, a real-microphone run of 590
chunks with Steam's chunk lines. Not recorded here: the second run's clip and settings, and the files' formats,
lengths and checksums.

### Set N: a real microphone on a newly started Steam (2026-11-11)

The same night as Set L: Steam newly started, a real microphone, the first chunk 1500 samples and loud, and the
game's first packets logged (finding 16). Not recorded here: the settings beyond these, and the files' formats,
lengths and checksums.

### Set Q: a real server (2026-11-15)

The owner on a public TF2 server while another player played music over voice, with `voice_showincoming 1` and
`voice_showchannels 1` logged by `con_logfile` (the console printed `fps_max` 300, its default 400, and
`voice_buffer_ms` 100; `net_graph` showed 294 frames a second and the owner's ping at 52 ms). A first log of 202.3 s
at 294 frames a second, then a second of 76.5 s at `fps_max 67` and 71.9 s at `fps_max 30` with `voice_showchannels 2`
(the mixer's pulls). The logs hold other players' names and stay private; only the figures below are here. Read twice,
by the orchestrator and independently by a second reader; where the two differed, the second reader's count is given
and the orchestrator's first count is corrected in its place.

- **The module gives the game's queue on a real server** (measured, the second reader): the log's packets replayed
  through `voice-channel.js` with the mixer's demand from the log give the logged bufsize on 13,486 of 13,487 tick
  lines of the music's channel (the one other: an `incoming` line printed after the tick line that already counts it),
  151 of 151 for a second speaker, 5,099 of 5,099 and 1,034 of 1,034 at 67, and 4,790 of 4,790 at 30 with the logged
  pulls. Several packets on one tick were allowed in a scratch copy of `tests/voicequeue/log-to-fixture.mjs`, which
  refuses them (its rule of one packet a tick comes from local logs; W3-23r read that one call drains every waiting
  packet).
- **Packets** (measured): 3,655 in 202.3 s, 18.07 a second, of whole 882-sample frames (2646 most often), with a few
  of 6 to 10 frames and silence records of 2756, 1378 and 1379 samples.
- **Arrivals** (measured): gaps of 0 to 7 ticks between messages (0.7, 1.6, 11.4, 29.8, 34.2, 18.3, 2.7 and 1.0%);
  on the same tick as the previous message 0.74% at 294 frames a second, 0.86% at 67, 1.23% at 30. Two stalls of 22
  tick lines each, in which 212 and 259 ms of sound never came, each ending in a burst with a packet of 0 samples
  (finding 29's refused message, inferred); which leg lost them cannot be told.
- **The wait at an opening** (measured): one restart in the first log, after the first stall emptied the queue: no
  drain on 30 tick lines, `ceil(0.1 × fps)` for a rate of 290 to 300 (the log alone gives 29 or 30); ten openings at
  `fps_max 67`, each with no drain on exactly 7, `ceil(0.1 × 67)`.
- **The ring** (measured): the music's queue held 398 ms in the median (5th and 95th percentiles 189 and 457) and
  reached the ring's 44,100 bytes. 15 adds overflowed, all after the restart: 872 samples (19.8 ms) at the end of
  its wait, and about 141 ms in play after it (inferred from the log's own pulls). *The orchestrator's first count,
  63, took every packet that would pass 44,100 bytes over the last tick line and missed the mixer's pulls between
  tick lines.*
- **The drain inside one phrase** (measured by the orchestrator; added later on 2026-11-15; one stretch): over the
  76.5 s at `fps_max 67` the music's channel had no opening, overflow or underrun. 3,373,650 samples came in 1,391
  packets, 3,372,259 were queued (one fewer a packet), and the mixer pulled 3,373,568. The queue fell from 39,374 to
  36,756 bytes: 1,309 samples, 29.7 ms, 0.39 ms a second, against 0.41 for one sample a packet at 18.18 packets a
  second (the rule under "The queue, not recorded"). The fade and the underrun were not reached: the queue never
  held under 25,428 bytes (288 ms). Lost sound lowers the queue faster than the drain: in the first log its median
  stood at 451 ms after the restart and at 182 ms after the second stall (measured, the second reader).
- **These arrivals against the render's** (measured on the module by a private reader, added later on 2026-11-15;
  one server, one evening):
  - *Gaps.* Of the page's jitter settings, 15 comes closest to the first log's gaps at 294 frames a second: 3.4% of
    messages placed differently (2.5 to 4.4 over 20 seeds), against 33.1% at jitter 0, 6.5% at 10, 10.2% at 20 and
    29.2% at 50. Two seeds at jitter 15 lie 2.0% apart, and the log's two halves 7.3%. The ends are thin: none on
    the same tick (the log 0.71%) and 0.14% at 7 ticks or more (1.31%). At 67 and 30 the closest is jitter 10 (4.2
    and 6.1%), so one setting does not carry across frame rates.
  - *The queue in steady play.* The log's 176 s without a stall: no overflow and no underrun, the queue's median
    400 ms. A channel opened in mid-stream and run 60 s drops 36.8 ms with the log's arrivals (8.8 to 75.4 by where
    it opens), 23.8 at jitter 0 and 38.8 at jitter 15, with the queue's median at 425, 438 and 429 ms.
  - *In sound.* 202 s of pink noise rendered with the log's own arrival ticks (each packet line as one read of the
    sender cutting the log's frame count; the two empty packets, the sound that never came and the log's own
    opening not mapped) has 10 skips and 115.8 ms dropped, against 6 to 7 skips and 105 to 117 ms at jitter 0 over
    three seeds, all of those at the opening. Its level in half-second blocks leaves the default render's by over
    1 dB in two blocks, both at the restart, where it also has one silence of 441 ms. On the committed test signals
    the openings decide: each drops 105 to 131 ms in every render, and the default's own seeds differ more than the
    log's arrivals move it.
  - *What it says.* A real server's steady arrivals change little that can be counted and nothing that was found
    in the level: about 13 ms more dropped at an opening and a queue 13 ms shallower. What differs is the stall:
    two in 202 s, 0.47 s of sound that never came, one restart with its silence, and a queue left near 180 ms. No
    jitter setting gives a stall, and the page's loss draws each message alone (read).
  - *Left open.* After the restart the log has about twice the overflows the module's even clock gives on the
    same packets (14 lines and about 141 ms, inferred, against 7 and 67.0 ms), a matter of the mixer's clock.
    *Corrected 2026-11-20 (two private reads, below under "The mixer's demand, read to the operation"): the 14
    lines hold 67.0 ms of dropped sound, the module's own figure on the same packets, not about 141 ms. Twice the
    lines, the same sound. Why the log spreads it over 14 lines is not found.*
- **At 30 frames a second** (measured, `voice_showchannels 2`): tick lines come in runs of two and three (1,659 and
  488 in 2,150 frames, 29.92 a second; the arithmetic of a 33.3 ms frame gives 1,659 and 491), the mixer's pulls in
  runs of two to four (2, 3 and 4 in 27, 58 and 15%), and 1,276 of 1,297 packet lines come after a frame's pulls and
  before its ticks, 5 between two tick lines of one frame (read by the frame's second tick), 16 after another packet
  line. A frame's order is packets, ticks, mixer, as W3-23r read and W3-23a built.
- **Through the repository's own tool** (measured by the orchestrator; added later on 2026-11-15, W3-25):
  `tests/voicequeue/log-to-fixture.mjs` with `--channel` and `--mid-play` reads every part of both logs, and
  `voice-channel.js` gives the logged queue on every tick line the replay compares: 13,483 of the music channel's
  13,488 in the first log (5 are lines the tool starts from: the log's first, 3 after two other lines, and the one
  printed late), 152 of 152 on the second speaker's channel, 5,098 of 5,100 at 67 frames a second, 969 and 75 on two
  other channels there, and 4,789 of 4,791 at 30 frames a second with the demand read from the pull lines. Where the
  demand is not read it is worked out from the queue, so a playing line matches by construction; the openings, the
  waits, the overflows and the frees are what test the module there
  (`docs/work-orders/W3-25-server-logs.md`, "The private run").

### The file-input runs, measured again (2026-11-13)

Added 2026-11-13 by RP-01a, from the orchestrator's reading of the private notes, run sheets, files and logs of the
file-input sets for order RP-01 (`docs/work-orders/RP-01-reproduce-it.md`, section 14). Each statement carries its
standing. Nothing of the files is here, only these figures.

**The two clips.** Sets H, I, M and O used two clips, both made by one short script on 2026-11-10: half a second
of silence, three 1 kHz tone bursts, a sweep from 300 Hz to 3 kHz over 3 s, six bursts of an 11-harmonic 150 Hz
tone with pauses of 0.2, 0.3, 0.44, 0.6, 1.0 and 0.5 s, and two 500 Hz bursts; 13.2 s; 16-bit mono with a plain
44-byte header. The script was run again in Python 3.11 and, ported line for line, in Node 22: each gives both
files with the SHA-256 of the file the game was fed (measured). The Node port is
[`tests/recordings/make-inputs.mjs`](recordings/make-inputs.mjs), and `node tests/reproduce.mjs inputs` writes
both and checks their SHA-256.

| Clip | Rate | Samples | Bytes | SHA-256 |
| --- | --- | --- | --- | --- |
| the clip of Set H | 22050 Hz | 291,942 | 583,928 | `fc1c6cbd9aabd8ed1b64d4381eae3c2f56dce23eff36e14ba7d9f67dc5505a58` |
| the clip of Sets I, M and O | 11025 Hz | 145,966 | 291,976 | `bd31df844cee4b38fe705be1fbdfb1b17acb9f161f9314b06b1eb2ba0d560dbd` |

**The captured input.** Sets M and O's `voice_micdata.wav` (one file for both sets, 145,966 samples) is the
11025 Hz clip from its third sample on in 145,964 of 145,964 samples, then two zeros: the game stopped capturing
where the clip ended (measured). Set H's `voice_micdata.wav` was not kept.

**The game's folder.** The clip was put, as `voice_input.wav`, in the game's folder, the one that holds the game's
executable, and `voice_decompressed.wav` and `voice_micdata.wav` appeared in the same folder: measured for TF2's
folder (Set H's private notes). For the two 32-bit games the notes do not name the folder; the run sheets of Sets
M and O asked for the same place and the files came back.

**The steps as run.** In every set `sv_voicecodec` was set before the map, then `voice_loopback 1`,
`voice_inputfromfile 1`, `voice_recordtofile 1` and `voice_maxgain 1` or 10, and the voice key was down for about
15 s. The key was typed, `+voicerecord` and after 15 s `-voicerecord`, which needs no key bound (measured: the run
sheets). Set H ran in TF2's ordinary game on a local server. No server variable was set:
`sv_allow_voice_from_file` defaults to 1 (read in the game's own `find voice` output). The game writes
`voice_decompressed.wav` again at every release of the key, so a file is copied away before the next press
(measured again on 2026-11-13, when a sitting was lost to it).

**The 32-bit games.** Sets M and O needed the 32-bit game, started as `hl2mp.exe -force32bit -game hl2mp -console`
and `tf.exe -force32bit -game tf -console` (measured: the run sheets), because the 64-bit game cannot load the
Speex module and falls back to CELT without saying so in the recording (Set I is that fall-back; finding 31).

**Steam's chunk line.** With numbers of our invention, a line is
`[+++] [ 20.00 msec] avgsample   1.23 | max  12.345 | high samples   45`. The first bracket holds three
characters, each `+` or a space (`[+++]`, `[++ ]`, `[+ +]` and `[   ]` occur); then the length with two decimals,
the mean with two, the peak with three, and a whole number; the spaces before each number vary with its width. In
Steam's own log file each line begins with a stamp, `[2026-01-02 03:04:05] `, and the text copied from the console
window has none. One pattern, the stamp optional, fits 3,358 of 3,358 chunk lines in three files (measured). The
text was saved by copying it from Steam's console window, or from the file `console_log.txt` in the `logs` folder
of Steam's install, which holds the same lines with the stamps; that file also holds account names and addresses
(measured).

*Corrected by RP-01b (2026-11-13): the three files of "3,358 of 3,358" overlap. Every chunk line of the two texts
copied from the console is in the log file, in order, so those three files hold 1,979 different chunk lines, and one
pattern fits all of them and the 2,706 of the same log file saved later (measured, private, the orchestrator,
2026-11-13; the entry "The checks gate and queue (2026-11-13)" below).*

### The script run on the game's files (2026-11-13)

Added 2026-11-13 at RP-01a's merge. The orchestrator ran `tests/reproduce.mjs`, as merged, on the recordings the
game wrote in Sets H, I, M and O, which are private (measured; nothing of the files is here, only the script's
counts). Each run ended "as expected". The earlier counts of findings 26 and 31 were made with other code and
count the last packet in; the script counts it apart.

| Set | Check | Result |
| --- | --- | --- |
| H | `celt` | 291,839 of 291,840 samples before the last packet equal, 1 one step off; in the last packet 0 of 512 differ |
| H | `celt --high` | 291,765 of 291,840 equal, 75 one step off, none further |
| H | `gain` | 0 of 291,840 differ before the last packet; 511 of 512 in the last packet, which differs between two presses |
| I | `celt --any-rate`, with the 11025 Hz clip | 145,407 of 145,408 equal, 1 one step off |
| I | `gain` | 0 of 145,408 differ before the last packet |
| M | `speex` at `voice_maxgain` 1 | 145,840 of 145,840 compared samples equal; the recording ends before the render |
| M | `speex` at `voice_maxgain` 10 | 145,966 of 145,966 equal |
| O | `speex` at `voice_maxgain` 1 | 145,966 of 145,966 equal |
| M, O | `gain` on the `vaudio_speex` pairs | 0 differ before the last 160 samples |
| M and O | `inputs --against` the captured input | 145,964 of 145,964 equal to the clip from its third sample, then two zeros |

A recording of another codec given to `speex` is refused (measured on one such file). These runs show that the
script lines a file up as the game wrote it, which the suite's stand-ins cannot. Nobody else can repeat them until
the recordings are published (order RP-01, part e). *(2026-11-13: seven of them are published since, on the owner's word; the entry "The recordings that
are published" below says which and how to repeat the runs.)*

### The script's later checks run on the game's files (2026-11-13)

Added 2026-11-13 at RP-01c's merge. The orchestrator ran the checks `ceiling`, `clock` and `demo` of
`tests/reproduce.mjs`, as merged, on seventeen of the owner's recordings of the PC's output (the takes of the
accuracy table but one, decoded to WAV) and on Set D's demo, all private (measured; only the script's counts are
here). A first run, before the merge, changed two of the checks: the order's section 18.

| Check | On | Result |
| --- | --- | --- |
| `demo` | Set D's demo | as expected: 1,816 voice messages, 5,109 frames, every frame a 20 ms hybrid frame of one channel, every message with one 24000 Hz record, 693 one-byte frames, 20 end markers, 19 of 19 phrases after an end marker at frame number 0 and the first phrase at 0 |
| `ceiling` | seventeen recordings, each with its `volume` | as expected on ten: the largest sample exactly round(32767 x `volume`) (4,915 at 0.15 in nine, 3,604 at 0.11 in one), the smallest the same with a minus, 100 to 179,781 samples on the largest. Differs on seven: three reach the ceiling exactly with 10, 38 and 74 samples on it (under the check's floor of 100), one made at `voice_maxgain 1` never reaches it (largest 3,010), and three recordings of Sets A and E hold samples above the ceiling for the `volume` noted for them (largest 5,095 and 6,800; two are kept as MP3) |
| `clock` | the same seventeen, each with its source | as expected on ten, reading +402 to +418 parts in a million. Outside the range on four, as the accuracy table has them: +499 (`voice_maxgain 1`; as expected with `--packets 22.3`), +449, +284 and +726 (loss and jitter). Too little lined up on three |

- **The flat tops of a recording are the mixer's, not the voice's.** In every recording that reaches it, the
  largest sample is exactly round(32767 x `volume`), and in the takes of the loud test signal there is no pile at
  the voice's own 4,895 to 4,896: the counts by step from 4,880 to 4,909 are level (about 1,800 a step in one take)
  and the ceiling holds 121,716. The clip acts on the sum of the voice and the game's other sound (finding 30), so
  the map's sound spreads a held voice over many steps and what passes the clip is flattened on the ceiling. The
  voice's 255/256 of finding 30 was measured another way, as the median of the middle samples of the clipped 1 kHz
  plateaus of one take; this run does not repeat that measurement.
- **`clock` against the accuracy suite.** On the fourteen takes where both gave a figure the check's reading
  differs from the table's by -11 to +10 parts in a million, so the check's window is the table's range of +397 to
  +416 widened by 11.

### The checks gate and queue (2026-11-13)

Added 2026-11-13 by RP-01b (`docs/work-orders/RP-01b-gate-hold-queue.md`). The checks `gate` and `queue` of
`tests/reproduce.mjs` are built. They were run on the owner's private logs on 2026-11-13, as first built and as
merged (the two bullets on those runs below). This entry holds the 24 kHz clip, the orchestrator's private look at the logs for the order (counts and
layouts only, nothing of the files), and what the suite `reproduce` computes on the model.

**The 24 kHz clip.** `node tests/reproduce.mjs inputs <folder>` writes `steam_mic_24000.wav` beside the two clips
above: 679,200 samples (28.3 s) at 24000 Hz, 16-bit mono with a plain 44-byte header, 1,358,444 bytes, SHA-256
`3e02aaa585001e562e133aea7985bce4208563e39c00655d153f34b88e873fde` (computed by the order's planning run and again by
its build, on Node 22). What it holds is the order's choice (`tests/reproduce/steam-clip.mjs`): silence, five loud
1 kHz bursts with pauses of 1.2 s, the record's tones at −38 and −35 dBFS, a tone whose mean of |x| rises from 0.90%
to 1.10% of 32767 and falls back, single samples of 4905 to 4925, the record's 1.5 ms burst at 0.2 of full scale,
and silence. It has not been played into Steam (not built yet).

**Steam's console text** (measured, private, the orchestrator, 2026-11-13). Four files were read: the text copied
from Steam's console in Set J (789 chunk lines), the text copied in Set L's run with a real microphone (590), Steam's
`console_log.txt` as saved after Set L (1,979) and the same file as saved later (2,706).

- **The files overlap.** Every chunk line of the two copied texts is in the first log, in order, and the first log is
  the beginning of the second. So "3,358 of 3,358 chunk lines in three files" above counts 1,379 lines twice: those
  three files hold 1,979 different chunk lines.
- **The pattern.** One pattern, held from the optional stamp to the line's end, fits every chunk line of the four
  files. No chunk line carries text after its count, and nothing stands between the stamp and the first bracket.
- **The marks against the printed numbers,** on all 2,706 lines of the later log: the first mark is set exactly when
  the second or the third is; the third exactly when the count of high samples is above 0, and exactly when the
  printed peak is 14.999 or more; no line with a printed mean of 1.01 or more lacks the second mark, and none of 0.99
  or less carries it.
- **The brackets:** `[   ]` 1,158, `[+++]` 1,261, `[++ ]` 277, `[+ +]` 10. The lowest printed mean with the second
  mark is 1.01 and the highest without it 1.00; the lowest printed peak with the third mark is 15.005 and the highest
  without it 14.984.
- **A printed mean of exactly 1.00:** one line in 2,706, without the second mark. **Lines of 0.04 ms:** one in 2,706
  (Set J's), with a printed mean of 0.00, no mark and no high sample.
- **The run with a real microphone** (Set L), judged by its printed numbers: the counts above hold on all 590 of its
  lines. Its lengths are 62.50 ms on 441 lines, 31.25 on 142 and 93.75 on 7, and no other.
- **The lines of a file input** read `loaded voice input file <path>, <N> samples (<S> seconds)` and `voice input
  file <path> looped`. N is a whole number and S has one decimal. In the log file each begins with the stamp; in the
  copied text neither does. The copied text also holds the typed command, after `] `, and the console's answer,
  `"mic_inputfile" = "<path>"`; the log file holds the answer with its stamp. All four kinds carry the path.
- **Typing.** The path was typed bare, with no quotes, and had no space. It was set back with `mic_inputfile ""`, and
  the console answered `"mic_inputfile" = ""`. Each command was typed on a line of its own; two on one line was not
  tried.
- **Encoding.** All four files are plain ASCII with no byte-order mark. The copied texts end every line with a
  carriage return and a line feed. The log file does too, but for some lines that end with a line feed alone (433 of
  10,711 in the first log).

**The counts of the hold in finding 16's paragraph on Set L, read again** (measured, private, the orchestrator,
2026-11-13). The 12 ends are Set J's file-input run, on the Steam of 23.9 days. The 18 ends are the file-input run on
the Steam started 4.8 minutes before; the built sender gives 18 of 18 and 12 of 12. The 37 ends are that evening's
two runs together, the file-input run's 18 and the real-microphone run's 19: "the 7th read 5 times, the 8th 32
times, never the 9th" counts all 37.

**The game's console log** (measured, private, the orchestrator, 2026-11-13).

- Plain ASCII, no byte-order mark, every line ending in a carriage return and a line feed (two logs).
- The folder `con_logfile` writes in is not in any file the owner sent.
- Set G's six parts, replayed with the repository's code as it stood (the fixture made from the logs earlier, through
  `tests/voice-channel.verify.mjs --fixture`): the ticks on which the rule and each of six faults mismatch the log.

  | Part (packets, ticks, opens) | Frames a second | Wait (ticks) | The rule | Ring + 1 | Ring − 1 | Wait + 1 | Wait − 1 | Sample kept | No grace |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | 1 (1520, 6267, 20) | 300 | 30 | 0 | 4933 | 4933 | 1549 | 708 | 5781 | 181 |
  | 2 (126, 511, 2) | 66.67 | 7 | 0 | 0 | 0 | 496 | 498 | 510 | 0 |
  | 3 (141, 598, 4) | 100 | 10 | 0 | 0 | 0 | 555 | 559 | 595 | 0 |
  | 4 (130, 581, 3) | 300 | 30 | 0 | 504 | 504 | 13 | 4 | 494 | 0 |
  | 5 (223, 917, 3) | 300 | 30 | 0 | 839 | 839 | 63 | 18 | 877 | 0 |
  | 6 (235, 934, 2) | 300 | 30 | 0 | 882 | 882 | 0 | 19 | 865 | 0 |

  The ticks sum to 9,808, finding 22's count. At 67 and 100 frames a second the ring's two faults and "no grace" show
  nowhere; at 300 "no grace" shows in one part of four and "wait + 1" is missing from one.
- `tests/voicequeue/log-to-fixture.mjs` reads the two logs that hold one run each at `--fps 300` without a stop, with
  no pull off the 512-sample blocks. The third log holds marked parts; it was read by `--section` when the fixture was
  made, and not read again that day.
- **The check `queue` as first built, run on the six parts** (the branch at `81a6d46`; added at RP-01b's fix round):
  Q1 on every tick, 9,808 in all. The first falls of the queue, in tick lines from the channel's packet: at 300 frames
  a second 30 lines in 19 channels, 31 in 8 and 32 in 1; at 66.67, 7 in 2; at 100, 10 in 4; so in each of the six
  parts at least one channel's queue first fell on line W or W + 1, W the wait. A frame rate given too low passes Q1:
  the first part, logged at 300, judged at `--fps 100`, and the 66.67 part judged at 60, both say "as expected"; the
  100 part judged at 300 differs. That is why the check has a second figure, Q2 (the order's section "After the
  build, the private run and the review").
- **Both checks as merged, run on the private logs** (the branch at `e3a7168`; the orchestrator, 2026-11-13, added
  at the merge; measured, private, counts only). `gate` on the console text alone says "as expected" on the four
  texts (789, 590, 1,979 and 2,706 chunk lines). With the two clips the owner had played into Steam, G4 and G5 hold
  on every walked line: 392 and 396 lines of Set J's copied text, 392 and 996 of the log file, which holds the second
  clip's evening run too; the first clip gives 0.9998% as the highest exact mean that failed and 1.0315% as the
  lowest that passed. `queue` says "as expected" on each of the six parts with its frame rate, Q1 on 9,808 ticks and
  Q2 in every part. Given a wrong frame rate on purpose: the first part, logged at 300, differs on Q2 when judged at
  100 and at 280; the 66.67 part judged at 60 still says "as expected" (a wait one tick short); the 100 part judged
  at 300 differs. The generated 24 kHz clip was not played into Steam, so `gate` with that clip has no run on a log.

**On the model** (computed by the suite `reproduce`, `tests/reproduce.verify.mjs`, on stand-ins it writes; not the
game):

- `gate`'s stand-in is Steam's console text for two passes of the 24 kHz clip, with a file input's chunk lengths, the
  suite's own sums and the verdicts of the app's sender (`steam-sender.js`): 1,013 chunk lines, all four brackets, 13
  that print a mean of 1.00, peaks of 4,914 without the third mark and 4,915 with it, 10 chunks passed by their peak
  alone; with the clip, the highest exact mean without the second mark 0.9996% and the lowest with it 1.0002%.
- `queue`'s stand-ins are console logs written from the second model of the channel
  (`tests/voicequeue/reference-channel.mjs`) and replayed through `voice-channel.js`: at 300 frames a second 90 packets
  and 473 ticks with no mismatching tick, every fault mismatching somewhere, and the queues of 4 of 4 channels first
  falling on line 30; at 66.67, 90 packets and 377 ticks with no mismatching tick, the ring's two faults mismatching
  nowhere, and 5 of 5 channels first falling on line 7 or 8. Judged at `--fps 66.67`, the 300 log passes Q1 and
  fails Q2; judged at 280 (a wait two ticks short) it fails Q2.

### The recordings that are published (2026-11-13)

Added 2026-11-13 by order RP-01, part e. Seven files the game wrote in Sets H, I, M and O are in the repository,
under `tests/recordings/files/`, each the game's file byte for byte, with a plain 44-byte header and no other
chunk (measured with `tests/recordings/inspect.mjs`). [`recordings/manifest.json`](recordings/manifest.json) is
the list, with each file's SHA-256, what made it, and its check. Each was made from a clip that
`tests/recordings/make-inputs.mjs` makes. For each, `tests/reproduce.mjs` at this merge gives the counts below,
and every sample the check does not compare is zero (measured).

| File | Check | Compared | Equal | Not compared, all zero |
| --- | --- | --- | --- | --- |
| `set-h_vaudio-celt_maxgain-1.wav` | `celt` | 291,840 | 291,839, the other one step off | the last packet, 512 |
| `set-h_vaudio-celt-high_maxgain-1.wav` | `celt --high` | 291,840 | 291,765, the others one step off | the last packet, 1,024 |
| `set-i_vaudio-celt-double-speed_maxgain-1.wav` | `celt --any-rate`, with the 11025 Hz clip | 145,408 | 145,407, the other one step off | the last packet, 512 |
| `set-m_vaudio-speex_maxgain-1.wav` | `speex` | 145,840 | 145,840 | the 80 samples before the codec's delay |
| `set-m-o_vaudio-speex_maxgain-10.wav` | `speex --maxgain 10` | 145,966 | 145,966 | 80 before the delay and 34 after the render |
| `set-o_vaudio-speex_maxgain-1.wav` | `speex` | 145,966 | 145,966 | 80 before the delay and 34 after the render |
| `set-m-o_capture_vaudio-speex.wav` | `inputs --against` | 145,964 | 145,964 | the last two, which the check counts as zeros |

`gain` on each `voice_maxgain 1` Speex file with the `voice_maxgain 10` file: no sample differs before the last
160, and none in them (measured).

**Two recordings stay private:** the `voice_maxgain 10` recordings of Sets H and I. A check counts a recording's
last packet apart, and in these two that packet holds sound the clip does not: in Set H's, 511 of its 512 samples
are not zero, some at full scale, with their energy at 7.6 to 9.5 kHz, where the clip has none; Set I's second
recording is one packet longer than its first, and 235 samples of that packet are not zero, none above 39 steps
(measured). The same packet of each `voice_maxgain 1` recording is silent. It is probably what the
decoder made of a packet cut short when the key was released (guessed); it is not explained, and no code of this
repository makes it. So a press's last packet can hold a burst that was never in the input, at up to full scale
after the gain: a reader checking a recording of their own should expect it there and nowhere else.

### What was read

The reports in `docs/reports/` say what was read from which file and where. Nothing of the files is in this repository. They were read as data with a disassembler and never run, and no leaked source was used. *Corrected by the owner's rule of 2026-11-11 (CLAUDE.md): since then a module may also be run, in a CPU emulator first, on signals of our own; TF2's `vaudio_speex` module (Set O) and the `vaudio_miles` plug-in's VR12 (W3-20a) were run that way. Its output is a measurement; nothing of the modules is copied.* Public sources were set beside them: libopus, CELT, Speex and FFmpeg's libswresample.

| What | Read from | Report | Files |
| --- | --- | --- | --- |
| the receiver's queue and gain, the engine's side of sending, the debug variables, the codec table | the game's engine module and its `vaudio_celt` module, from the owner's install | W3-03 | F1, F2 |
| the mixer and the output | the same engine module | W3-07 | F1 |
| the CELT build | the `vaudio_celt` module, a second one from another Source game, and the public CELT source | W3-08 | F2, F3 |
| Steam's sender and decoder | the owner's Steam client library and Valve's public copy of it; Valve's public resampler library; the public Linux client | W3-09 | F4, F5, F7, F8, F9 |
| Speex | a `vaudio_speex` module from another Source game, supplied by the owner | W3-09 | F10 |
| the hold's arithmetic, the file input's chunk, the decoder's buffers | the owner's Steam client library | W3-16 read (`docs/reports/W3-16-steam-hold-read.md`) | F4 |
| where Steam's clock counts from | the timer library of Valve's public client package. The owner's own copy was not at hand | W3-16 read | F6 |
| the room effect: the slots, the processors, the voice's share, the automatic room | the engine module; the game's preset file, its sound mixer file and its 40 soundscape scripts, from the owner's install; Valve's public SDK for the client's side | W3-15, then two second reads, each written before W3-15's text was opened (`docs/reports/W3-17-room-dsp-second-read.md`, `docs/reports/W3-17-amp-mdy-second-read.md`). The second reads win where they differ | F1, F19, F21, F22, F23 |
| what turns the room off, and the menu option that does it | the engine module and the game's menu module | W3-18 | F1, F20 |

W3-14 opened no file: it rests on Set J's logs and recordings and on the project's own modules.

*Added late on 2026-11-20 (Windows's side of the capture: `dsound.dll` of the owner's Windows 11, file F28; a private reader, then a second reader who wrote its own reading and scripts first. "Both" means both saw it at the address or counted it.)*
- **DirectSound's capture is a layer over Windows's older wave input interface** (read, both). The file has one capture path: its device factory (`0x180003d58`) knows two kinds, playback and a capture device over `waveIn*`, and the audio client's capture interface is not in the file (second reader). The capture converts nothing and runs no timer. The file's timers, its timer-resolution calls and its one call into `resampledmo.dll` (`0x1800319dd`) belong to playback and housekeeping (read, both).
- **The step is one 32nd of a second for any buffer** (read, both, `0x180053461` to `0x180053487`): the format's bytes a second shifted right by 5 and rounded up to a whole frame, 750 samples at 24 kHz. This is the 31.25 ms step. The paragraph above calls it a 32nd of the buffer; that holds only because Steam's buffer is one second long.
- **Eight steps are always out** (read, both, `0x1800535bc` and `0x180005ddc`): `min(8, ceil(buffer bytes / step))` wave headers point into the application's buffer and are queued again as they come back, so 250 ms is with the layer below at any time.
- **The read position moves a whole step at a time, when a header comes back** (read, both, `0x180006046`): it is the bytes of the headers returned plus the start offset, modulo the buffer. A worker thread at priority 15 waits on the callback's event with no timeout, counts the header, sets the notices and queues it again (`0x180005a60`). A position call takes the file's own mutex and then the worker's lock (second reader, `0x18001d8a0` and `0x180006074`; the first reader had the read made without a lock).
- **The wrap comes before the notice, in one pass of the worker** (read, both: the position at `0x180005c1f`, the event at `0x180005d14`). So the read that brings nothing (above) needs Steam's look at the event to fall inside that pass: microseconds once a second, or longer if another thread of Steam's is inside a DirectSound call (inferred). `Lock` refuses a cursor at or past the length and a length of 0 or over the buffer, and never looks at the read position (read, both, `0x1800214c0`).
- **The format and the device** (read). `waveInOpen` gets Steam's own format (24 kHz, mono, 16 bits) and a callback, and never the flag that forbids a conversion (both, `0x18005383c`). So the conversion from the device's rate is made below this file, in files not read yet. Steam names no device on Windows 6.1 and later (second reader, in the owner's client, `0x138a855e0`), and DirectSound then asks the wave mapper for its preferred capture device and opens that device by its own number, with no mapper in between (second reader, `0x1800063fc` and `0x1800049d8`; the first reader had the mapper itself opened). It is the default capture device, not the communications device.
- **The 8-step pattern is the headers' arithmetic** (measured, both; that the layer below hands sound up in such packets is inferred). Headers of 750 samples filled from packets of 240 samples, 10 ms at 24 kHz, come back at packet `ceil(750 (k + 1) / 240)`: seven steps 30 ms apart and one 40 ms in every eight. This is the "multiple of 10 ms" of the paragraph above with its cause. With nothing fitted it gives 16.0% of chunk ends at one place in 8 and 12.0% at the others, 25.4% of one-step chunks at that place and 25.4% at the next, 8.4% of two-step chunks at the next, and no three-step chunk ending at the two after. Measured by the second reader over Set L's real microphone and Set Q's two parts: 15.6%; 22.5 and 21.0%; 9.1%; 6 of 166. By place within the one-step and the two-step chunks the chi-squares are 3.8 and 0.9 (Set L), 10.3 and 2.5 (Set Q at 67 frames a second) and 8.7 and 1.5 (at 30), each on 7 degrees of freedom.
- **Pooled, the pile of one-step chunks is lower than the plain arithmetic's**: 43.5% at the two places against 50.8 (chi-square 28.3 on 7). Reads 44 to 72 ms apart with headers 0 to 9 ms late bring it to 5.9 (fitted, second reader). The places are the arithmetic's; the pile's height is not pinned.
- **What does not fit** (measured, second reader; chi-square on the one-step chunks): packets of 5 ms (133), no grid at all (224), packets of 239 and 241 samples in turn (74), 240 one sample either way at random (209), a 10 ms stall made up by the next header (1038). A device at 48, 44.1, 32, 16 or 96 kHz gives exactly 240 samples to a 10 ms packet, so the device's rate does not show here (arithmetic).
- **Set Q's alternation by place in 16 is the same arithmetic with packets of 20 ms** (measured, second reader only). Headers back at `20 ms × ceil(750 k / 480)` rest 40 ms at nine places of sixteen and 20 ms at seven, in a fixed order. Set Q's part at 30 frames a second shows that order place for place: the nine long places hold 91 to 103 chunk ends and the seven short ones 56 to 70 (chi-square 22.3 on 15, against 49.4 for the 10 ms form). The last chain of the first log fits it too (13.5 against 32.9). The part at 67, the first chain and Set L fit the 10 ms form (4.9, 6.6 and 7.7) and not the 20 ms one. So on that sender's PC the packets were 20 ms long in two stretches and 10 ms in the others. Why is not read. This replaces "only a timer grid on that sender's PC gives it" above.
- **Still not read:** when a header comes back, which is where the packets of 10 or 20 ms are. That is in `winmm.dll`, `winmmbase.dll` and `wdmaud.drv`, asked of the owner 2026-11-20.
- **Windows's rate converter, as far as both reads go** (`AudioEng.dll`, file F29; not proven to be the converter a capture stream gets). The converter its strings call `CAudioRateConvertCMPT` is a windowed sinc with an inner quality of 1, 5, 15 or 30. With no cutoff given, the cutoff as a share of the lower rate's half is `0.804446 + 0.067308 ln q − 0.00579496 (ln q)²` and the half length `ceil(q × max(1, in/out) / cutoff)` input samples (read, both; the design routine `0x18000f1f0` takes a cutoff and uses the polynomial only when it is 0, second reader, `0x18000f25a`). At quality 30 to 24 kHz that is −6 dB at 11,596 Hz and −1.8, −3.8 and −9.2 dB at 11.25, 11.45 and 11.75 kHz (computed, both), against the −0.5, −2.6 and −6.5 measured on the owner's PC (the Model table, "Capture roll-off"): the same slope, about 130 Hz lower. With the cutoff free the three points fit at 11,726 Hz within 0.32 dB. Whether the difference is the old measurement's own reference or a cutoff given by the caller is not settled; a third reading is under way against the takes.

*Added late on 2026-11-20 (Windows's conversion to 24 kHz: `resampledmo.dll` and `AudioEng.dll`, files F31 and F29; a private reader, then a second reader who wrote its own reading and its own converter first. "Both" means both saw it at the address or computed it. The test on Set D is the second reader's alone: measured once.)*
- **The design** (read, both, `resampledmo.dll` `0x1800053e8`; the same constants in `AudioEng.dll`). A polyphase windowed sinc with `L = out / gcd` phases; the cutoff and the half length `H` as in the paragraph above, and `T = 4 × floor((2H + 4) / 4)` taps. For a quality of 20 or more the window is a stored table that is a Kaiser window of beta 10.0000 within 3 parts in 100 million (measured, second reader; the first reader's bullet above has 10.06 from the code's formula, which misses the table by 2.4 in a thousand). Below 20 it is a Kaiser window with the formula's beta. The table is 32-bit float, normalised as a whole to a sum of `L` (second reader, `0x1800060d4`). At quality 30 the cutoff is 0.96634 of the output's half rate.
- **Two converters written apart agree**: the two readers' own, on both source rates and seven qualities, to 1.1 parts in a million in the output and 5 in 10 million in the tables (measured, second reader).
- **The selector** (read, both, `AudioEng.dll` `0x18000e830`): 0, 1, 2 and 3 give quality 1, 5, 15 and 30, anything else is refused, and the cutoff given is always 0 there (`0x18000ea2e`), so the polynomial holds. The file's own users ask for 30 twice and for 5 once (second reader). Its other converter is two-point linear and nothing in the file builds one (read, both). **Which component picks the converter and the quality for a wave input stream is not read:** it is outside the four files, in `wdmaud.drv`, `MMDevAPI.dll` and the audio service.
- **The start of a stream** (read in part, second reader): the history is zeros and the first output sits on the input's first instant; an output is made once `H` later inputs are in, so the first block comes short by about 1.3 ms, not late. The engine's fixed-block mode was not read through.
- **To 16 bits** (read, second reader; corrects the first reader's "optional dither"): a separate format converter has three routines, one plain (clip, times 32768, round to nearest), one dithered and a third, and its caller picks. Which a capture stream gets is not read.
- **Against Set D** (measured once, second reader; the 48 kHz test signal played on PC A through the virtual cable into Steam, 5,109 frames; the player's and the cable's own conversion is inside the path and the device's rate is not recorded). The sweep above about 10.2 kHz and the 11 and 11.5 kHz tones reach the packets as DTX frames, so only noise carries the band edge through the codec. On the 10 s of steady pink noise, Steam's decoded packets fall by 0.6, 2.0, 4.2, 8.9 and 10.0 dB at 11.0, 11.25, 11.45, 11.75 and 11.95 kHz against the signal itself (each less its own 8.5 to 9.5 kHz level). The read converter at quality 30, put through the app's own gate, libopus 1.1.5 and decoder, gives 0.5, 1.8, 4.3, 9.0 and 9.8: 0.14 dB rms from Steam's over 11 to 12 kHz from 48 kHz and 0.17 from 44.1 kHz. The app's two stages give 0.25, quality 15 gives 3.0, quality 5 gives 5.1, the app's resampler without its fitted filter 4.1. The floor of the measure is about 0.15 (the same filters on the other sample alignment and another sender clock: 0.17 and 0.32).
- **So the three points of the Model table's "Capture roll-off" row (−0.5, −2.6, −6.5 dB) were not the whole conversion.** Measured afresh against the signal itself the fall is the larger one above, and it is quality 30's. The old points' reference was not found again; the sweep and tones cannot have given them.
- **Above 12 kHz Steam's capture does not fold the sweep back** (measured once, second reader, as a decision of the gate before the codec). Steam's spurt over the sweep is 721 frames and ends 0.41 s after the sweep passes 12 kHz. Over eight sender clocks quality 30 gives 721 four times, 723 twice and 724 twice; the app's stages give 726 to 730, because the app's resampler passes −6.5 dB at 12.05 kHz and −12 at 12.5 where the read filter has −18 and −44. Dropping every second sample would hold the gate to the sweep's end and is excluded. The 12 kHz tone kept Steam's gate open, which bounds the capture's gain at 12.0 kHz to −21 dB or more (inferred; quality 30 has −16.5).
- **Standing of the whole:** the converter is read twice; that a capture stream gets it at quality 30 fits one take made through a cable, and is not read. Steam's own file of what it captured (`mic_outputfile`, asked of the owner 2026-11-20) would give the samples. Not built yet: the app still runs its own resampler and a filter fitted to the old points; below 12 kHz the two are within 0.1 dB of each other in the measure above.

*Added 2026-11-21. Built by W3-26b (2026-11-21): the `steam` capture runs this converter at quality 30 in the render, its stream and the live chain (`capture-converter.js`), held bit for bit to the first reader's converter and within 3 parts in a million to the second's on the vectors of `tests/capture-converter/`. The app's resampler and the fitted filter no longer run on `steam`. That a capture stream gets this converter at quality 30 is read twice since (this finding, "From the device to Steam's 16-bit samples", 2026-11-21) and fits one take (measured once); it is not checked sample for sample, which Steam's `mic_outputfile` take would do (asked of the owner).*
- **Read as the first reader's converter has them, and not in the bullets above:** the stored sinc table on the grid `35 k / 16384`, `k` from 0 to 16384, with a linear step between neighbouring entries; Windows's limits for a stored table, `(H + 1) L < 100000` and `max(L, M) ≤ 1280`; and the sum that normalises the table, a running 32-bit float. The second reader's converter has another grid for the sinc table (`k × 65536 / 30678338`), and that is where the two converters differ (W3-26's order, "After the plan review"). Outside those limits the app sums the table in double precision: what Windows does with such a pair of rates is not read, and the app's way is its own (chosen).
- **"Bit for bit" is of the vectors, not of every signal** (W3-26's order, "W3-26a as built"). On three stretches of the test signal, 47 s in all, read as 48,000 and as 44,100 Hz, the module equals the first reader's converter in every sample but one of about 2.8 million, a sample of 1.3e-6 that differs in its last bit, and is within 4.5e-7 of the second reader's (measured, the orchestrator). The first reader's converter adds an output's products with a library routine whose order is not the module's.
- **Which measure each figure is.** The converter's gains, −0.53 dB at 11.0 kHz, −1.81 at 11.25, −3.81 at 11.45, −9.17 at 11.75 and −14.79 at 11.95 kHz, and −44.1 dB for a 12.5 kHz tone folded to 11.5 kHz, are of the capture alone, before the codec (computed, both readers' converters). The 0.14 dB rms against Steam's band edge above, and "within 0.1 dB of each other" below 12 kHz in the bullet above, are of Set D's pink noise through the gate, the codec and the decoder (measured once).
- **What the app chose around it.** A source already at 24,000 Hz passes as it is (whether Windows converts at equal rates is not read). A file is converted from its own rate, which stands for the device's; from a source below 24 kHz the cutoff is 0.96634 of the source's own half rate, so a 16,000 Hz source is −4.1 dB at 7.65 kHz and −8.0 dB at 7.8 kHz and a 22,050 Hz one −5.9 dB at 10.65 kHz (computed from the rule), where the app's resampler gave −2.3, −3.6 and −2.9 dB (measured on the model with tones); no take has a device below 24 kHz. The microphone gain and the clip at 16-bit full scale come before the conversion and are the app's own: Windows's pipe has a volume of 1.0 and no limiter (read once), and at gain 1 they act on nothing in a 16-bit source. The step to 16 bits is a plain rounding, where Windows dithers it (read twice; not built yet). With the codec off, and for a demo's received voice, the capture is the app's own resampler, as it was. A finite source of `n` samples gives `max(1, round(n L / M))` outputs, the length the app's resampler gave. A stream gives each output once the `H` inputs after its centre are in, so the live monitor holds back `H / rate` for the capture, 1.3125 ms at 48,000 Hz and 1.3152 ms at 44,100 Hz, where it held back the app's resampler's 0.667 ms and the fitted filter's 5.292 ms: 202.252 ms in all at 48 kHz and 202.232 ms at 44.1 kHz, 4.6 ms less than before (computed from its terms; the chain's own figures equal them).
- **The built chain on the private takes** (added 2026-11-21, the orchestrator, before W3-26b's merge; measured once). Set D's test signal through the built capture, the sender, the codec and the decoder, against Steam's own packets of the take: the band edge on the pink noise is 0.20 dB rms off Steam's from 11 to 12 kHz, where the stages it replaces give 0.32 on the same alignment and sender seed, and the measure's floor is about 0.15 (the bullet above). The sweep's spurt, 721 frames in Steam's packets, is 721, 723 or 724 frames over eight sender seeds, where the stages it replaces gave 726 to 730: the sweep above 12 kHz no longer holds the gate open. A second reader's own count on a sweep of its own gave the same two ranges. The accuracy suite on every private row at nine seeds, before and after: the level's rms, in the mean over the rows of each row's median, goes from 2.14 to 2.09 dB and the worst block from 11.1 to 10.5 dB, no row leaving its own range over the seeds. In the band from 11 to 12 kHz the render rises against the take by 0.1 to 0.34 dB on the rows of the test signal (Set B's rows to +0.74 to +1.20 dB, Set D's two to +2.42 and +2.62 dB) and moves under 0.1 dB on speech and music. So against the game's recorded output that band is a little further off than before, while against Steam's own packets the capture is as close or closer: the filter that W3-26b removes was fitted to a recorded output, and so took out some of a loss that is not the capture's (inferred). What is left in that band belongs after the packets and is not explained.

*Added late on 2026-11-20 (Steam's wait and its clocks in the owner's own files: `tier0_s64.dll`, `vstdlib_s64.dll` and `steam.exe`, files F25 to F27, and the current client, F24, against the older F4; a private reader, then a second reader who wrote its own reading and counts first. "Both" means both saw it at the address or counted it. Addresses of the client are F24's.)*
- **The pass's wait is one plain Windows wait** (read, both, `tier0_s64.dll` `0x13f013050`): the events go to a single wait for any of them with the timeout as given, nothing added and nothing rounded. In the loop the deadline is formed at `0x1388c62cd` and the wait made at `0x1388c65a2` to `0x1388c65eb`. Steam's sleep is Windows's own too (`0x13f012f10`).
- **None of the three files asks Windows for a finer timer** (read, both: no such name, import or system call in them). The client has its two requests for 1 ms (above). One runs only while a game controller is connected and was used within 15 minutes; the other runs in whichever process first asks for Steam's networking sockets (read, second reader, `0x13862b460` and `0x138b0c5b6`). Neither was in force in Steam's process during Set J or Set L (measured, next bullet).
- **When a timeout ends** (measured, second reader, Sets J and L; this settles the bullet "When a timeout ends is not settled" above as far as the data go). Neighbouring timeouts lie a whole number of steps of about 15.6 ms apart within 4 ms in 238 of 290 cases and 199 of 221, where chance gives 51%; most are seven steps, 107 to 111 ms. The step slips by about 1.5 ms each time and the phase is lost within one or two seconds, so no grid holds over a whole run, which is what the earlier second reader found. A pass that a timeout began ends by a timeout in only 14% and 8% of cases (39 of 280, 17 of 221), where a lateness drawn afresh and evenly each time would give 124 and 105; a pass the game's call began ends by a timeout 54% of the time in both sets (241 of 443, 205 of 377; the even draw gives 253 and 221). So a timeout ends on Windows's timer step counted on from the last timeout, not at a fresh random lateness. Why the step slips is Windows's and not read. Whole-run scans for one lattice give 0.41 at 15.000 ms, 0.09 to 0.16 at 15.625 and 0.02 at 16.000 (concentration; 1 would be a perfect lattice).
- **The bounds hold on both sets** (measured, both): Set J's 723 intervals run 47.75 to 64.13 ms, Set L's 598 run 47.85 to 64.44.
- **The clock is Steam's own process's** (read, both: the base is set when the library is first loaded, `0x13f0ef8b0` and `0x13f0011a0`, and the think takes that clock at `0x1380d73f7`; measured, second reader: with the 1/8 s float step that 23.9 days give, all 764 of Set J's rebuilt intervals are one or two passes long, against 565 with 1/16 s and 408 with 1/4 s). This is the reading in the owner's own copy that the hold's paragraph above had from Valve's public build.
- **The current client changes nothing on the voice path** (read, both: build 11.23.65.88, linked 2026-11-13, against 11.12.30.7 of 2026-10-13). Compared by value by the second reader: the 50,000 microsecond pass, the 2400-sample pre-roll, the 0.4 s hold, the 6000-sample room, the level rule's two defaults (the second giving 4915), the encoder's settings (24,000 Hz, one channel, 32,000 bits a second, DTX on) and the capture's format, buffer and notice. The one change found is a test for a missing file in the file-input read. Of the encoder library's 174 functions 163 are the same instruction for instruction; the other 11 differ in tables the comparison could not follow and were not checked by hand.
- **Not found:** whether Steam's own process ever makes the networking request for a 1 ms timer, and who starts the controller thread.

*Added 2026-11-21 (the rule as read, put together as one generator of reads and scored against the sets; a private study by a third reader, who first counted again, with its own extraction and scripts, the two measurements above that one reader had made. The scores are that study's alone: measured once.)*
- **The timeout's step, counted again: the same** (measured, now twice). A pass the game's call began ends by a timeout in 241 of 443 cases and 205 of 377; a pass a timeout began in 39 of 280 and 17 of 221. Neighbouring timeouts lie within 4 ms of a whole number of 15.6 ms steps in 240 of 290 cases and 198 of 221 (the first count: 238 and 199), with a spread of 1.5 ms. New: the spread does not grow with the number of steps between two timeouts (1.2 to 1.8 ms from 4 to 18 steps), so the slip is one draw for each timeout and not one for each step.
- **Set Q's 20 ms packets, counted again: the same** (measured, now twice): the part at 30 frames a second gives 22.3 for the 20 ms form against 49.4 for the 10 ms one, the last chain of the first log 13.5 against 32.9. New: the first log's first 2,366 packets fit the 10 ms form (9.8 against 221).
- **The generator** has the pass as read (the read, then a wait in whole milliseconds for what is left of 50 ms, ended by a wake that leaves under 1 ms); the game's fetch once a tick, in the first frame at or after the tick, as a wake; a timeout at the last timeout's end plus a whole number of 15.625 ms steps plus one slip; and the capture's 750-sample steps filled by 10 ms packets. Six numbers are taken from data, each named in the study: where in the pass the read falls (0.05 to 1.55 ms after its start), the fetch within 1 ms of its frame's start, 3 other wakes a second, the slip's spread of 1.3 ms, a tolerance of 1 ms by which a timer step may come early, and a lateness of the capture's steps, even from 0 to 9 ms. The first five were fitted on Set J's reads, the last on Set L's real microphone.
- **Reads, against Set J and against Set L's run with a file, which nothing was fitted on** (measured once; the model over 40 seeds; then the app's clock as built). Mean interval 55.43 and 55.37 ms: 55.54, and 55.84. Reads on the game's tick 61.9 and 62.9%: 62.7%, and 32.6% (chance). A timeout after a pass the game began 54.4 and 54.4%: 54.7%; after a pass a timeout began 13.9 and 7.7%: 8.0%; the app's clock has neither. The intervals' autocorrelation at lags 2, 4 and 6 is −0.08, −0.19, +0.12 (J) and −0.18, −0.23, +0.22 (L): −0.19, −0.23, +0.20, and 0 for the app's. The distance between 1 ms histograms is 0.119 between the two sets themselves, 0.100 and 0.114 from the model to each, 0.150 and 0.208 from the app's clock.
- **Chunks, against Set L's real microphone and Set D's demo, which nothing was fitted on** (measured once). One-, two- and three-step chunks 24.1, 74.7 and 1.2% (L) and 23.4, 74.8 and 1.8% (D): the model 23.8, 74.8 and 1.5, the app's clock 23.5, 74.4 and 2.1. The favoured place in 8 holds 15.3 and 15.5%: the model 16.1, the app's clock 13.7 and 13.1. One-step chunks at that place and the next 22.5 and 23.2% (L), 21.8 and 24.3% (D): the model 24.7 and 25.0, the app's clock 14.5 and 14.6. Three-step chunks ending at the two places after: 0 of 7 and 1 of 31; the model none, the app's clock about a fifth of them.
- **Another PC needs another lateness** (measured once, Set Q at 67 frames a second: 28.1, 67.7 and 4.2% of one-, two- and three-step chunks). A lateness of 0 to 9 ms gives 23.8, 74.6 and 1.5; 0 to 20 ms gives 26.8, 68.6 and 4.6, with the pairs and the autocorrelation right as well. The places fit at any lateness (16.1% for 16.1). So the lateness is a property of the sender's PC with no cause read: 9 ms on the owner's, 20 on Set Q's sender's. With 20 ms packets the model gives the part at 30 frames a second its form by place in 16, and puts too many three-step chunks at the two places after (15% where the set has 2 of 51).
- **What the rule says of other senders** (the model only; no set to score it): the read's mean interval follows the sender's frame rate and tick, 58.7 ms at 30 frames a second, exactly 50.0 at 60, 54.9 at 144, 62.0 with no fetch at all; from 100 to 400 frames a second the chunks do not change.
- **Not built yet:** the app's sender still draws its reads evenly from 48.0 to 63.7 ms. An order follows W3-26.

**From the device to Steam's 16-bit samples: the road under DirectSound's capture (added 2026-11-21; private reads of rows F33 to F35 and F38 to F41 with F28 to F30, each point read by two readers unless marked).**

- **The road** (read twice): `waveInOpen` in `winmm.dll` is a jump into `winmmbase.dll`, which takes the sound mapper only for the mapper's own device number or its flag (`0x180003481`) and otherwise sends the open, with the caller's own format, to `wdmaud.drv`; a refusal is returned as it is, with no second try. So the mapper and the ACM (F36, F37) are not on Steam's road. `wdmaud.drv` (`0x180016210`) opens an ordinary shared-mode audio client with Steam's format (24,000 Hz, one channel, 16 bits) and converts nothing itself. Its stream flags are `0x88140000`: automatic conversion, the converter's default quality, rate adjustment, and the event callback (`0x1800162a6`, `0x1800162fb`). The buffer asked for is 30 ms and the period is left to the engine. The stream has the default category and no raw option (read once).
- **Which converter, at which quality: explained by the code** (read twice). The audio service copies the flags whole into the stream's description (`audiosrv.dll` `0x1800aac99`); in `audiodg.exe` the top bit allows a format converter, a rate converter and a channel matrix in the stream's pipe (`0x140017ce3`), and the default-quality bit sets the pipe's quality field to 3 (`0x140017d1c`; without it the field stays 1), which is the selector the rate converter is set up with (`0x140003e34`). The field has no other writer. Selector 3 is quality 30 in the converter of the paragraph above (`AudioEng.dll` `0x18000e830`): the quality that Set D's band edge fits (measured once, above) is the one the code gives. The rate-adjustment flag stores a range and does not change the design, and the wave input never asks for the adjustment. There is one conversion, from the device's rate to 24,000 Hz (read once).
- **To one channel: the left channel alone** (the default read twice; the trace of the masks read once). The matrix is given only the two channel counts. Its default, when a side has no channel mask, is the identity: for two channels to one, 1.0 of the left and nothing of the right (`AudioEng.dll` `0x1800425f0`). Steam's format has no mask, `audiodg.exe` reports none for such a format (`0x14005a614`), and the format proposed across the rate converter carries none (`0x18003891c`). The mean of the two channels would need a client format with a mask. This is what finding 6 measured on Set A. A registry override exists in the code; its key was not read.
- **The pipe's order** (inferred from the builder and the resolver, each read once): the stream's volume and meter, the fold to one channel at the device's rate, the rate converter on one channel, the step to 16 bits last. The volume starts at 1.0 and is given no gain at set-up (read once; what could change it later is not found). No limiter and no mixer is in a capture stream's pipe (read once). The device's 24-bit samples become float by 2^-23 in the device's own pipe (read once).
- **The step to 16 bits is dithered** (the mode and the formula read twice; the index and the rounding of ties read once). `audiodg.exe` sets dither mode 1, with no condition, on every object of the pipe that takes one (`0x140003aa4`, `0x140003b46`), after the converters are in it; nothing sets another mode later. For float to 16 bits that mode picks one routine (`AudioEng.dll` `0x180024c70`): to each sample a value of a stored table is added in 32-bit float, the sum is clipped to -1 and 32767/32768, multiplied by 32768 and rounded to nearest, ties to even. One table value serves one sample; the index starts at 0 when the stream is set up and runs on across packets, modulo 4,096. The table, measured on the private copy: 4,096 values of normal shape, mean 0, rms 1/sqrt(6) of a step (0.408248), extremes -1.47 and +1.49 steps, a spectrum that is exactly flat (every bin of the same magnitude, 4096/sqrt(6 x 4095)) with random phases. No generator that makes it again was found (two common ones tried over many seeds), so it can be made again in kind and not value for value; the values themselves are the file's and are not in this repository. At 24,000 Hz it repeats every 170.67 ms.
- **The takes agree with a dither and do not prove one** (measured once, Steam's own activity lines): on Set L's real microphone none of 590 chunks has a peak of 0 and 239 have a peak of exactly one step; on Set J, where a file stood in for the microphone and Windows's road was not taken, 152 of 789 have a peak of 0.
- **When a full header comes back** (`wdmaud.drv`, read twice): one worker thread, registered with the multimedia class service as "Audio" at priority 15, waits on the stream's event, takes every packet that waits in one pass (`0x18000a040`), and hands a full header back in that same pass, on that thread, if the audio clock's position has reached the header's last frame (`0x1800026c2`); otherwise the header waits for the next wake. That is the layer under the rule above, "a header is back when the packet holding its last sample is in". `waveInGetPosition`, which DirectSound's position calls use, is the audio clock's position less dropped frames, and each call wakes the worker (read once).
- **The lateness is still fitted** (measured once, on Sets L and D, 80 seeds a law): an even 0 to 9 ms and "one packet late for about one header in ten, the rest at once" fit the chunk statistics alike, so the sets fix its spread (a standard deviation near 3 ms) and not its shape; no lateness at all, and the clock test with a fixed lag as the only cause, do not fit. What the audio clock reports for a shared capture stream is not found.
- **Not found:** where the 10 ms packets come from (the engine's period is 10 ms by default or an endpoint's own value of 5 to 10 ms, `audiosrv.dll` `0x180070448`, read once; the pump in `audiodg.exe` and the capture side of `AudioKSE.dll` are not read), and what gave another PC 20 ms packets. `MMDevAPI.dll` (F38) chooses the endpoint and makes the client object; the flags and the format do not pass through it (read once, thinly).
- **In the app:** the converter at quality 30 is order W3-26's. The app takes the left channel by default. The app rounds to 16 bits with no dither: not built yet.

**Steam's interface file, and what a running Steam may set (added 2026-11-21; private reads of `SteamUI.dll`, row F42, with the client, F24, each point read by two readers unless marked).**

- **No timer resolution is asked for by `SteamUI.dll`** (read twice): no import, no name as text and no look-up by name of any call that changes the timer's step, and the file sets SDL's timer-resolution hint to "0" before it starts SDL (`0x13a5b4621`). With `tier0`, `vstdlib` and `steam.exe` that is four of the process's own files that ask for nothing. Not read: `SDL3.dll`, `vgui2_s.dll` and the other modules the process loads.
- **When the client's own two requests for 1 ms are made** (read once): the one at `0x13862b460` while the controller thread is in its second poll state (a controller in use, or `controller_poll_state` forced to 2), and the one at `0x138b0c5b6` from the first to the last reference to the networking library's low level. Neither is caused by `SteamUI.dll` or `steam.exe` in anything read. Inferred: on a PC or in a state where either holds, a timed-out wait would end within about 1 ms of its due time and not on a 15.6 ms step, so the pass would be 49 to 51 ms. No set shows such a sender.
- **Who turns the loop** (read once): the pass that reads the microphone runs on a thread of the client's own, in `steam.exe`'s process, started when `SteamUI.dll` calls into the client (`0x13a5387e2`, through the engine's set-up of its pipes, `0x1389b8130`). Neither `SteamUI.dll`'s main loop nor `steam.exe` calls the pass. The timer library is loaded with `SteamUI.dll` (read), so the hold's clock starts when `steam.exe` loads that file. What sets the interface loop's own rate is in `vgui2_s.dll`, not read; the interface reaches the client's thread only through the pipe, and an idle turn sends nothing (read once), which agrees in kind with the "other wakes" of the paragraph above and gives no number for them.
- **Nothing before the gate at the defaults** (read twice): `voice_preprocess`, default "0", no flags, is the one switch for a clean-up before the gate (`0x1380d5fac`: when it is not zero, pieces of 480 samples go through a Speex preprocessor, and `mic_autogain`, default "16000", is used only in setting that up). The capture's path to the encoder reads no other variable but `voice_quality`. The noise, echo and automatic-gain names in `SteamUI.dll` are fields of a report about the web chat (their scope is inferred).
- **A default in the file is not by itself what a running Steam uses** (read once): the client loads `steam_dev.cfg` at its start (`0x1389b7719`) and sets any of its variables from it by name with no test of flags; a variable set that way is then locked against the console. And `voice_quality` has the default "4", which the client's code turns into SILK at 16 kHz (`0x1380d5afb`), while every set of the owner's and Set Q's sender are Opus at 24 kHz: something outside the five files read sets it to 6 or more (not found). On the owner's PC Set J's sample-for-sample matches (finding 28 above, finding 29) show both switches off; for another PC the console's own print of the variables is the check (asked of the owner for this PC, [docs/owner-runs.md](../docs/owner-runs.md), part C).
- **Steam's microphone slider is the Windows recording level** (the mixer call read twice; the rest read once): the setting `voice_mic_input_gain` ends in `mixerSetControlDetails` on the volume control of the microphone line of the default voice capture device, 0 to 65535 (`0x1380de8a0`); a separate on/off boost exists, and no mute. The client writes it in one place, only when the setting is given a value other than the last (`0x1380d7d4d`): not at its start and not when recording starts. It keeps no stored level and scales no sample by it. Not found: whether the web interface's script sets it at start.
- **Steam's console sets the client's variables** (read twice): a typed line goes to an executor that splits on spaces only, a double quote grouping (`0x13a617110`); the client's variables are in the console's list (the client registers them with the interface's own registrar, `0x13a62a773`); the only refusals are two flags that neither `mic_outputfile` nor `@voice_spew_activity_check` carries. Read once, for `mic_outputfile`: the folder is made if it is missing, an existing file is emptied, a failed open is silent and tried again at every read, and the lengths in the header are written when the audio stops.

#### The files that were read

Added 2026-11-13 by order RP-01, part d (`docs/work-orders/RP-01-reproduce-it.md`, section 6). One row a file,
with an id that never changes once given; the column "Files" of the table above and the lines at the end of this
section point to the rows. Only names, builds, dates and hashes are here: nothing of a file's bytes. "Built" is the
file's own build date as the record or a report gives it (its link date). "Build, as its owner can read it",
"Taken", a SHA-256 no report gives and a name the reports do not state are the orchestrator's, from the private
record. Where the reading was the orchestrator's own investigation, the report named is the one that gives what it
found. W3-15b is the report the table above calls W3-18, and "BC plan" is `docs/reports/bad-connections-plan.md`.

**Status:** the orchestrator's cells are filled.

They were filled on 2026-11-13 by order RP-01, part e; the paragraph under the table says how.

| Id | File | From | Build, as its owner can read it | Built | Taken | SHA-256 | Read for | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | `bin/x64/engine.dll` | the owner's TF2, 64-bit | TF2 build 11191711 (the game's console, 2026-11-10) | 2026-10-05 | 2026-11-10 | `4802a74ce0abb1175851d00e37fc88609085a96238aa52ac0eb224ae4a08ec80` | 2, 4, 8, 9, 10, 14, 21 to 27, 29 (what the game takes of a message), 30, 31, 32 | W3-03, W3-05, W3-07, W3-09, W3-10, W3-15, W3-15b, W3-17, W3-17a, W3-17b, BC plan |
| F2 | `bin/x64/vaudio_celt.dll` | the owner's TF2, 64-bit | TF2 build 11191711 (the game's console, 2026-11-10) | 2026-09-30 | 2026-11-10 | `255cf0836a11118195c9129869b7a0e5a15123c99054409b93e379a66e07a66e` | 31 | W3-03, W3-08 |
| F3 | `bin/vaudio_celt.dll` | the owner's Half-Life 2: Deathmatch, 32-bit | HL2DM build 10889068 (the game's console, 2026-11-10) | 2026-05-20 | 2026-11-10 | `4d142d069c8db187333409c9b9478ad44ea1e6d245d3b83a43116aaa0fd8a294` | 31 | W3-08 |
| F4 | `steamclient64.dll` | the owner's Steam, 64-bit | not recorded | 2026-10-13 | 2026-11-10 | `e9045710ec7ee47d7b7488d1c5dda2d933dec7e251e965967a5c48f4df68eb4e` | 5, 11, 12, 16, 27, 28, 29 | W3-09, W3-16, BC plan |
| F5 | `steamclient64.dll` | `bins_win64.zip`, Valve's public client package | client package version 1792618285 (Valve's manifest) | 2026-10-21 | 2026-11-10 | `253e0a11a4415b38c78a42f7bdd6ecc426455f06c1ba6453a48090df3142dbbc` | 28 (the same constants) | W3-09 |
| F6 | `tier0_s64.dll` | Valve's public client package; the owner's own copy was not read | client package version 1792618285 (Valve's manifest) | 2026-10-21 | 2026-11-10 | `8559e6bd32eb3fddd95079633272866deb292211ec4f7e69aeb0ec48fdafef72` | 28 (where the clock counts from) | W3-16 |
| F7 | `video64.dll` | `bins_win64.zip`, Valve's public client package | client package version 1792618285 (Valve's manifest) | 2026-10-21 | 2026-11-10 | `e84cb3391b4206feb03e1162b0d6815316905034a7ae190c66d0fa7fb00d48ba` | 29 (the resampler object) | W3-09 |
| F8 | `libswresample-6.dll` | `bins_codecs_win64.zip`, Valve's public codec package | client package version 1792618285 (Valve's manifest) | 2026-10-12 | 2026-11-10 | `2ed49e82c7cab6b197b5229759c4d4e1a9eaa74fa5a8303680b34436de74d399` | 29 (the resampler's defaults and version) | W3-09 |
| F9 | `linux64/steamclient.so` | `bins_sdk_ubuntu12.zip`, Valve's public Linux package | client package version 1792618285 (Valve's manifest) | none: the file holds no link date | 2026-11-10 | `3e32119f473cb9c2615e1b282da8498b9986378e8b71537a4aed9f77e7b797e0` | 16, 28 (the libopus version string) | W3-09 |
| F10 | `vaudio_speex.dll` | another Source game of the owner's, 32-bit | HL2DM build 10889068 (the game's console, 2026-11-10) | 2026-05-20 | 2026-11-10 | `70d6643250a2010e79b79d727f9256a60f29317e5e2ad257d0721081afa9227f` | 31 | W3-09 |
| F11 | `bin/vaudio_speex.dll` | the owner's TF2, 32-bit | TF2 build 11191711 (the game's console, 2026-11-11) | 2026-09-30 | 2026-11-11 | `ba40de0677977a5c203c38ae57f1d1161865875b4c58d0df4e86f1f8a407fa38` | 31 (run, Set O) | none: the record, Set O |
| F12 | `bin/engine.dll` | the owner's TF2, 32-bit | TF2 build 11191711 (the game's console, 2026-11-11) | 2026-10-05 | 2026-11-11 | `aca809df6828eef3c5bd42da32c2868c0a53c1503dafa5fc287c4c6d72070a27` | 31 (the four codec names) | none: the record, Set O |
| F13 | `bin/vaudio_miles.dll` (never a TF2 codec) | the owner's TF2, 32-bit | TF2 build 11191711 (the game's console, 2026-11-11) | 2024-01-17 | 2026-11-11 | `1420952213fdcd5c5b2c064aa9e9085c517eaaae7e7d9526f2c691585d7c54ac` | 31 | W3-20a |
| F14 | `bin/mssvoice.asi`, the Miles plug-in beside F13 | the owner's TF2, 32-bit | TF2 build 11191711 (the game's console, 2026-11-11) | 2012-11-26 | 2026-11-11 | `3c22a68c4bff65661dc5dcb315d4be246ff1913203472b776290bbda17586463` | 31 | W3-20a |
| F15 | `bin/engine.dll` | the owner's Source SDK Base 2006 | not recorded | 2009-12-04 | 2026-11-11 | `4fc435499f0f18db9f1e3d4af84b463ffd2099cbfa3a1037516dd4aedf7a02b7` | 24, 31 | W3-20a, W3-20b |
| F16 | `bin/engine.dll` | the owner's Source SDK Base 2007 | not recorded | 2010-02-01 | 2026-11-11 | `e80187a7166d134355204b63d0c485164aad603b2d5e1c2b9349a726b7991081` | 24, 31 | W3-20a, W3-20b |
| F17 | `bin/vaudio_miles.dll` (never a TF2 codec) | the owner's Source SDK Base 2006, with the plug-in Miles 6.6a | not recorded | 2006-05-22 | 2026-11-11 | `4c456b30bc1f7db811353f46a60859ecc3a626a7a4eee7a56d73de9ba3563f32` | 31 | W3-20a, W3-20b |
| F18 | `bin/vaudio_miles.dll` (never a TF2 codec) | the owner's Source SDK Base 2007, with the plug-in Miles 6.6a | not recorded | 2008-07-11 | 2026-11-11 | `208de297931294913c4b7ec3dc7f7cfd393237decd222eae82b6483896c136b2` | 31 | W3-20a, W3-20b |
| F19 | `tf/bin/x64/client.dll` | the owner's TF2, 64-bit | TF2 build 11191711 (the game's console, 2026-11-10) | 2026-10-16 | 2026-11-10 | `b6f45c74805edacf0cf61d965f658158fc22960f66d583ef3a6549eb56696b95` | 32 (its strings only) | W3-15, W3-15b |
| F20 | `bin/x64/GameUI.dll` | the owner's TF2, 64-bit | TF2 build 11191711 (the game's console, 2026-11-10) | 2026-10-05 | 2026-11-10 | `1862d70adc9505f54c5a31756c05d42867ed7364ca5944d8b30d526447c7ec9f` | 32 (the menu option that turns the room off) | W3-15b |
| F21 | `scripts/dsp_presets.txt` | the owner's TF2, the game's own archive | TF2 build 11191711 (the game's console, 2026-11-10) | none: a text file | 2026-11-10 | `5a59d25d656fdabc27ec2da2f0598aa970b962a8b4edd9ff9fe8f3cf407a3c23` | 30, 32 | W3-15, W3-17 |
| F22 | `scripts/soundmixers.txt` | the owner's TF2, the game's own archive | TF2 build 11191711 (the game's console, 2026-11-10) | none: a text file | 2026-11-10 | `3e95dd0bc9182f99cb3fad543cd7df77371e4ce3ad7bfaa833eaadec8ea99e47` | 30 (the two-speaker level), 32 | W3-15 |
| F23 | the 40 `scripts/soundscapes*.txt`, as one row | the owner's TF2, the game's own archive | TF2 build 11191711 (the game's console, 2026-11-10) | none: text files | 2026-11-10 | `a22030d778f6bd4f10adec2c0d26c7187fe117436120b76aedb70dcfa78d1295` | 32 | W3-15 |

How the orchestrator's cells were filled (2026-11-13, measured on the private copies unless said otherwise). A
SHA-256 is the copy's own; the four the reports already gave for the owner's files (F1, F2, F4, F10) and F5's were
computed again and are equal. "Built" is the link date in the file's header. "Taken" is the day the copy reached
the project from the owner's install, or the day a public package was downloaded. "Build" for a game's file is the
build number that game printed in its console on the day named, from the same install as the copy (the file was
not matched to the number by any other means: inferred); for a public package it is the version in Valve's client
manifest it was listed in; "not recorded" means nobody noted Steam's build date or the old engine's version on
the day. F3's hash begins and ends as W3-08 gave it, F19's begins as W3-15 gave it, and F21 is 46,419 bytes as
W3-15 gave it. F23's SHA-256 is that of 40 lines, one a file in the order of the names, each the file's SHA-256,
two spaces and its name, with a newline after each. Beside F14 in the same folder is `bin/Mss32.dll`, built
2012-11-26, SHA-256 `9ff707f8feb76f240816b425f175cea19debd87b305a8d178976672625e86d49`; beside F17 and F18 is
the plug-in `bin/mssvoice.asi` of Miles 6.6a, one file in both installs, built 2004-04-02, SHA-256
`7e5495a45c9e7199b7616d9c34d7fe7cfcab237036014e653c4dcddd772a2828`. F10 is Half-Life 2: Deathmatch's (measured:
its link date and Set M's game). F11 differs from F10 in 50 bytes of code, all address operands (Set O).

Not rows: Valve's public SDK, which is source and is cited by its commit; the public sources of libopus, CELT,
Speex and FFmpeg; `XAudio2_7.dll`, whose conversion is measured and not read; and W3-14, which opened no file.
The reads of finding 8 that the record cites as "the plan, reads 1, 2, 4 and 7" are the BC plan's; each of the
four gives its place in the engine's image, so all four are F1's. Findings 1, 3, 6, 7, 13,
15, 17, 18, 19 and 20 rest on no reading of their own.

Added 2026-11-20: nine more rows. The owner sent the first eight that day; the ninth has been with the project
since 2026-11-11 and was not a row while nothing was read in it. "Built" is the link date in the file's header.
Windows's own files carry no date there (the field holds a number made from the build), so their build is the
file version. Hashes are measured on the private copies.

| Id | File | From | Build, as its owner can read it | Built | Taken | SHA-256 | Read for | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F24 | `steamclient64.dll` | the owner's Steam, 64-bit, after an update | file version 11.23.65.88 | 2026-11-13 | 2026-11-20 | `669fa08e259277fbf5a1dfe15ce88afe734e89151194304b44d92f418dcc985b` | 28 (the voice path against F4's; where the microphone's output file is written) | none: the record, finding 28 |
| F25 | `tier0_s64.dll` | the owner's Steam, 64-bit | file version 11.23.65.88 | 2026-11-13 | 2026-11-20 | `d52dab31d164fccae9f8b4e7e68cfbe1ccd3b9ec2db69b8225de412e46236c07` | 28 (the wait and the clocks) | none: the record, finding 28 |
| F26 | `vstdlib_s64.dll` | the owner's Steam, 64-bit | file version 11.23.65.88 | 2026-11-13 | 2026-11-20 | `d1b604121cc8aea3ad49e60a9ed861e8afdee873d4ac3ba509bbec7e5b9f18ab` | 28 (searched for a timer-resolution call) | none: the record, finding 28 |
| F27 | `steam.exe` | the owner's Steam | file version 11.23.65.88 | 2026-11-13 | 2026-11-20 | `c97eb13c5a2a0c74aaac61e461a588da3bf8a703be93735a3efa83e71cf8aabf` | 28 (searched for a timer-resolution call) | none: the record, finding 28 |
| F28 | `dsound.dll` | the owner's Windows 11, `System32` | file version 10.0.26100.9818 | none | 2026-11-20 | `5aa7fa9e6017b88d19a4d9e99b9e9ecd12cb2bb83e02e137e88bc672909588c0` | 28 (the capture's steps and positions) | none: the record, finding 28 |
| F29 | `AudioEng.dll` | the owner's Windows 11, `System32` | file version 10.0.26100.9974 | none | 2026-11-20 | `0d0d3f8a235f777cc8c4cd544c03db9cbeb3086ea93b6874971275f511597500` | 28 (the rate converter) | none: the record, finding 28 |
| F30 | `AudioSes.dll` | the owner's Windows 11, `System32` | file version 10.0.26100.9818 | none | 2026-11-20 | `3359925c8a9fb96901aa3643c3cc859cbad1cf64528d8a2fdaa24fede1c5a444` | 28 (searched for a rate converter: none found, read once) | none: the record, finding 28 |
| F31 | `resampledmo.dll` | the owner's Windows 11, `System32` | file version 10.0.26100.9818 | none | 2026-11-20 | `9882eebfb57b6d20a047e2c6e2a120236652a44880542bda62f38a53e069778e` | 28 (the rate converter's design; DirectSound uses it for playback only) | none: the record, finding 28 |
| F32 | `XAudio2_7.dll` | the owner's PC, Microsoft's DirectX of June 2010, 64-bit | file version 9.29.1962.0 | 2010-06-02 | 2026-11-11 | `f8636ccc37bbfc84107992b60e4226eb7237417112267ed64b08f72983ac4314` | 30 (the device's pass, in the lines of 2026-11-20 on the mixer's demand); its conversion is still measured and not read | none: the record |

The readings of F25 to F27, of F31 and of F24 against F4 had been made once when these rows were written; what they
found is added to finding 28 as each is read a second time.

Added 2026-11-21: ten more rows, the files the owner sent that day. None had been read when the rows were
written: a first read of each began the same day, and what is found joins finding 28 in dated lines once it has
been read a second time. Hashes are measured on the private copies.

| Id | File | From | Build, as its owner can read it | Built | Taken | SHA-256 | Read for | Report |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F33 | `winmm.dll` | the owner's Windows 11, `System32` | file version 10.0.26100.9818 | none | 2026-11-21 | `7aa646b2bd1f2d8714225d303bb1a38bb2b2faef62285a52eea567485ca6960b` | 28 (the wave input road under DirectSound's capture and the conversion on it; a first read began 2026-11-21 and nothing is recorded from it yet) | none yet |
| F34 | `winmmbase.dll` | the owner's Windows 11, `System32` | file version 10.0.26100.9818 | none | 2026-11-21 | `77855ae3389859aca41e4a45941178eb5436b59d590cebd4fe9266f15e86523b` | 28 (the wave input road under DirectSound's capture and the conversion on it; a first read began 2026-11-21 and nothing is recorded from it yet) | none yet |
| F35 | `wdmaud.drv` | the owner's Windows 11, `System32` | file version 10.0.26100.9818 | none | 2026-11-21 | `6d1b27248ee6f5cdacf38c8452c083773d324aaa036a95792a45cfd1662715f4` | 28 (the wave input road under DirectSound's capture and the conversion on it; a first read began 2026-11-21 and nothing is recorded from it yet) | none yet |
| F36 | `msacm32.drv` | the owner's Windows 11, `System32` | file version 10.0.26100.1882 | none | 2026-11-21 | `86d81cfedb065e3fceabe6d31b2a52b28c6c981f1b73ff5681d73ff8d4d756f7` | 28 (the wave input road under DirectSound's capture and the conversion on it; a first read began 2026-11-21 and nothing is recorded from it yet) | none yet |
| F37 | `msacm32.dll` | the owner's Windows 11, `System32` | file version 10.0.26100.7019 | none | 2026-11-21 | `f77312070a57b67e6e9ee0f4b66bbf38d08f01a40e5721f04064485298ad1263` | 28 (the wave input road under DirectSound's capture and the conversion on it; a first read began 2026-11-21 and nothing is recorded from it yet) | none yet |
| F38 | `MMDevAPI.dll` | the owner's Windows 11, `System32` | file version 10.0.26100.9974 | none | 2026-11-21 | `78e64aeccc4ff5322d1e8f696cd3644883c909bba9b291bddb40256d86c569aa` | 28 (the wave input road under DirectSound's capture and the conversion on it; a first read began 2026-11-21 and nothing is recorded from it yet) | none yet |
| F39 | `audiosrv.dll` | the owner's Windows 11, `System32` | file version 10.0.26100.9974 | none | 2026-11-21 | `1bf8df4102e63b4f0b0e0a387131eadd65a9741df12a0c462957c8ba421176af` | 28 (the wave input road under DirectSound's capture and the conversion on it; a first read began 2026-11-21 and nothing is recorded from it yet) | none yet |
| F40 | `audiodg.exe` | the owner's Windows 11, `System32` | file version 10.0.26100.9974 | none | 2026-11-21 | `017628fc0ace806163950bb3019709ca3820531d7f19c1103429e09b4c54f6ca` | 28 (the wave input road under DirectSound's capture and the conversion on it; a first read began 2026-11-21 and nothing is recorded from it yet) | none yet |
| F41 | `AudioKSE.dll` | the owner's Windows 11, `System32` | file version 10.0.26100.9974 | none | 2026-11-21 | `a288556681eeac9b162ccd1d0ff45034846b13b3345a66a74aa43997f6806648` | 28 (the wave input road under DirectSound's capture and the conversion on it; a first read began 2026-11-21 and nothing is recorded from it yet) | none yet |
| F42 | `SteamUI.dll` | the owner's Steam, 64-bit | file version 11.23.65.88 | 2026-11-13 | 2026-11-21 | `2dfb0a5d50dd90667549cc7d413c7bfb0794c9af4ebaf08bf1cf7d938a11ea93` | 28 (which process turns the loop that reads the microphone, and any timer-resolution call; a first read began 2026-11-21 and nothing is recorded from it yet) | none yet |

With them, on 2026-11-21, the format of the capture device of the owner's takes as Windows's settings show it
(read from the owner's screen; the screen itself stays private): the virtual cable's output, VB-Audio Virtual
Cable, driver 3.3.1.7 of 2024-10-07, at 2 channels, 24 bits, 48,000 Hz, input volume 100, the settings page's
processing test mode at "Default". So between that device and the 24,000 Hz, one-channel, 16-bit stream Steam
opens (finding 28) there is a conversion of rate by two, a fold of two channels to one and a step from 24 bits to
16. That the takes of earlier days were made at the same format is inferred: the format was read on 2026-11-21
only, and the Set D test of finding 28 fits a 48,000 Hz source a little better than a 44,100 Hz one (0.14 against
0.17 dB rms, measured once).

A reader whose file has the same SHA-256 holds the bytes the finding was read from, and can look for the same rule
with a disassembler and the report's account of it. A later build has another hash: the game and Steam update, and
a hash that differs refutes nothing. The checks of [docs/REPRODUCE.md](../docs/REPRODUCE.md) say whether the
behaviour is still the same.

Each finding marked read, with the files it was read from:

- Finding 2: F1.
- Finding 4: F1.
- Finding 5: F4.
- Finding 8: F1.
- Finding 9: F1.
- Finding 10: F1.
- Finding 11: F4.
- Finding 12: F4.
- Finding 14: F1.
- Finding 16: F4, F9.
- Finding 21: F1.
- Finding 22: F1.
- Finding 23: F1.
- Finding 24: F1, F15, F16.
- Finding 25: F1.
- Finding 26: F1.
- Finding 27: F1, F4.
- Finding 28: F4, F5, F6, F9.
- Finding 29: F1, F4, F7, F8.
- Finding 30: F1, F21, F22.
- Finding 31: F1, F2, F3, F10, F11, F12, F13, F14, F15, F16, F17, F18.
- Finding 32: F1, F19, F20, F21, F22, F23.

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

When no voice data arrives nothing runs, so the gain is untouched. A decoded block of zeros is different: it sends the gain to the cap (read, finding 26). The silence record after each spurt is such a block. The model as fitted here held the gain through every all-zero block. With that rule its onsets after gaps matched the recording in 1.3 ms steps: 0.08 / 0.10 / 0.13 / 0.64 / 1.0 of full scale against 0.07 / 0.08 / 0.17 / 0.53 / 0.98. Recording A against Steam's own decoded packets shows the gain already at its cap at each loud onset: the slow-looking rise is the codec's own attack, times 10 (measured, finding 26). The app still runs the fitted rule; order W3-05 replaces it. *Corrected by W3-05 (2026-11-10): the app runs the rule as read. See finding 26.*

### 5. Steam's sender gates quiet input

The sender transmits only while its level gate is open:
- **Opening:** a capture chunk whose mean of |x| is at least 1.0% of full scale, or which has a sample at 15% of full scale (read from Steam's client, finding 28). A chunk is 31.25 to 93.75 ms on the owner's PC. For a sine the mean rule is −39.09 dBFS RMS, and for Gaussian noise about −38. The figure first measured here, about −39.5 dBFS RMS of a 20 ms frame, was the sine's.
- **Evidence for the threshold:** a −36 dBFS sine (−39.0 dBFS RMS) opens it. A −42 dB RMS pink noise, whose loudest frame is −39.97 dBFS, never does. Neither does a −40 or −42 dBFS sine. Each agrees with the rule as read: the −36 dBFS sine has a mean of 1.009% of full scale and the −40 dBFS sine 0.64% (W3-09).
- **Steam's own verdicts** (measured, Set J): all 789 printed verdicts follow the rule as read. The highest mean that failed is 0.9998% and the lowest that passed 1.0315% (finding 28).
- **Closed frames are not sent;** the receiver hears silence.

Set D refines the timing (finding 12). The gate sends a pre-roll before each onset and holds for about 440 ms as first measured, not 300; as read, the hold is 0.4 s on Steam's float clock, and its real length depends on how long the sender's Steam has run (finding 28). For about the last 240 ms of that hold the encoder sends DTX comfort noise, so the audible tail is about 200 ms of coded sound plus a quieter fade. It is a level rule on chunks, read from the client: not a voice detector, and not a 20 ms rule.

**Corrected 2026-11-10 (W3-11a).** This finding ended "The app's gate is still the 20 ms frame fit of finding 12." Since W3-11a a render of the `steam` profile runs Steam's chunk rule, and since W3-11b so does the live chain for `steam`. The fullband extra, `steam_48`, keeps the frame fit (finding 12). The CELT and Speex profiles have no gate: they send everything.

**Corrected 2026-11-10 (W3-11b).** The correction above said "The live chain keeps the frame fit until W3-11b, and so does the fullband extra, `steam_48` (finding 12)." W3-11b put the live chain on Steam's sender.

### 6. A stereo source reached the game as its left channel

Set A's River passage tracks the model within 0.16 dB when the model is fed River's left channel. It tracks within 0.79 dB from the right channel and 1.14 dB from the L+R average. Take It Off is mostly centre-panned and fits any channel (0.07–0.11 dB). Rendering without the voice gate gives identical numbers, so the channel is the cause. The owner's virtual-cable capture passed the left channel to the game's mono microphone, so stereo input now defaults to it.

### 7. MP3 encoding biases Set A's clip statistics

Set A was delivered as VBR MP3. Encoding the model's lossless output with LAME:
- dropped the share of pink-noise samples within 5% of the ceiling from 10.4% to 3.3–9.4%
- widened the 256-sample block-peak spread from 0.14 to 0.23–0.72 dB

Set B is lossless and matches the model's clip statistics directly. The previous model had been tuned to Set A's biased values.

### 8. Lost voice frames are concealed in bursts averaging 2.2 frames

*Corrected by BC-1 (2026-11-11): the title and the paragraphs before BC-1's correction below describe the earlier fit. The game loses a packet whole, one voice message to a packet on a listen server, and Set C's noise parts fit that rule at 5 and 15. See the correction below and finding 29.*

Lost audio is replaced in place, not skipped or left silent. Across 54 of 55 isolated events the delay is the same before and after, and the damaged stretch carries noise within about 3 dB of the true level: Opus's own concealment. It fades toward silence only in long bursts at high loss.

The damage comes in bursts:

| Take | Events per second | Frames lost | Events of 1 / 2 / 3 / 4+ frames |
| --- | ---: | ---: | --- |
| loss5 | 4.3 | 17% | 51 / 23 / 17 / 9% |
| loss15 | 14.1 | 58% | 54 / 21 / 10 / 15% |
| combined | 12.0 | 43% | 57 / 25 / 9 / 9% |

A two-state (Gilbert-Elliott) loss process whose mean burst is 2.2 frames reproduces all three when set to 22%, 64% and 45% of frames lost. `net_fakeloss` on this listen server therefore removed far more voice than its number: about 22%, 45% and 64% of frames at 5, 10 and 15. It applies to the packets in both directions, and `net_graph` itself reported 13%, 20% and 34%.

The speech take agrees. Under `net_fakeloss 10`, 38% of active speech frames correlate below 0.5 with the clean render (median 0.71). The app at 45% loss gives 37% (median 0.67), against 23% at 30% and 51% at 60%.

Steam's decoder conceals at most 10 frames of a gap. What a longer gap lacks beyond that is not filled, so the sound closes up there (read, finding 29). No take with loss shows it. Set J shows the cap once, after frames the game never collected (inferred from its log's counts, finding 29). Since W3-11a the `steam` render applies the cap.

**Corrected 2026-11-11 (BC-1; the plan is `docs/reports/bad-connections-plan.md`, the order `docs/work-orders/BC-1-loss-per-message.md` with its amendment).** The game's rule for a lost packet has since been read, and Set C measured against it. The title and the paragraphs above stay until BC-2 restates them. *Corrected by BC-2 (2026-11-11): BC-2 corrected finding 9 and left this finding's title as it was; the mark under the title says what holds.*

What is known, each marked as its source marks it ("computed" is arithmetic or a dry run of the app's sender, not a measurement of the game):

| Fact | Standing |
| --- | --- |
| A network packet is lost whole. One that arrives out of order is discarded, so it is a lost packet; a duplicate is ignored | read (the plan, reads 1 and 2) |
| A voice message is never split across packets: unreliable data that does not fit a packet is dropped whole | read (the plan, read 7) |
| The engine asks Steam for voice once a tick and sends what comes as one message with its next packet; the server writes one message per listener, merged with nothing | read (W3-03) |
| So one packet carries one voice message, while packets leave at least as often as Steam hands out messages (about 18 a second): a listen server's own player sends every tick. At a real server's rates a packet may carry two: not read (BC-6) | inferred |
| One chunk of Steam's capture is one message (finding 28) | read; measured on every message of Set J |
| `net_fakeloss N` drops a packet when a draw from 0 to 100 is at most N: (N + 1)/101, each packet by its own draw. The game has no burst process | read (the plan, reads 2 and 4) |
| On a listen server with `net_usesocketsforloopback 1`, Set C's setup, a packet meets two draws per crossing and voice crosses twice | read |
| Steam's decoder conceals `min(gap, 10)` frames when the next frame arrives; frames lost at a spurt's end are never concealed; one record decodes to at most 17 frames; the game takes nothing of a message whose resampled sound passes 22,528 bytes (12 frames) | read (finding 29) |

**The arithmetic.** With q = (N + 1)/101 and four draws on the way from the talker to the listener, `net_fakeloss` 5, 10 and 15 remove 1 − (1 − q)⁴ = 21.7%, 37.0% and 49.8% **of voice messages** (read rule, arithmetic; not measured). One crossing alone gives 11.5%, 20.6% and 29.2%, where `net_graph` showed 13, 20 and 34. The per-frame fit above needed 22%, 45% and 64% **of frames**; the two agree at 5 only.

**The take column of the table above is withdrawn** (2026-11-11, a private check before BC-1's build). The method, made again from its text, gives the table's figures for the app's own renders, whose lost frames are known, but not for the takes: 1.7, 3.3 to 3.6 and 3.1 to 3.2 events a second, not 4.3, 14.1 and 12.0. A lost message in the chirp or the voice reads as several short events, and a take's delay moves, so "half the events are one frame long" never showed single frames lost. The original script is not in the repository. The speech paragraph's figure goes with it: the 38% of active speech frames under 0.5 in the `net_fakeloss 10` take, against the per-frame model's 37% at 45%, could not be made again. What can be measured soundly is the noise parts (12 s of pink noise and the eight bursts, 20.5 s), where the reading was checked against renders whose lost frames are known. There the takes are the read rule's, and "bursts averaging 2.2 frames" is refuted (measured: a prototype of the rule built in BC-1 driving the bundled codec and the app's receive path with `set_c_room`, equal to the app sample for sample with nothing lost, against the per-frame model at its fitted settings; renders as the mean and range over five seeds):

| | Lost runs a second | Runs of one frame | Mean run, frames | Level against the take | 12 s of noise: present / silent |
| --- | --- | --- | --- | --- | --- |
| loss5, the take | 3.12 | 12% | 3.5 | | 99.5 / 0.0% |
| loss5, the rule at 21.7% | 3.20 (2.88 to 3.41) | 14% | 3.5 | +0.10 dB | 98.0 / 1.0% |
| loss5, the per-frame model at 22% | 5.04 (4.58 to 5.41) | 43% | 2.4 | −0.07 dB | 99.7 / 0.0% |
| loss15, the take | 3.90 | 4% | 6.1 | | 76.9 / 10.1% |
| loss15, the rule at 49.8% | 4.31 (3.85 to 4.63) | 8% | 5.7 | +0.19 dB | 81.0 / 10.2% |
| loss15, the per-frame model at 64% | 13.95 (13.55 to 14.47) | 45% | 2.2 | −2.72 dB | 98.8 / 0.0% |
| combined, the take | 4.34 | 10% | 4.8 | | 79.7 / 10.3% |
| combined, the rule at 37.0% | 4.66 (4.43 to 4.87) | 18% | 4.1 | +0.06 dB | 91.9 / 4.0% |
| combined, the per-frame model at 45% | 9.89 (9.21 to 10.28) | 44% | 2.3 | −1.14 dB | 98.6 / 0.0% |

The takes' lost runs peak at three frames, as the sender's messages do; their starts and ends sit on a 20 ms grid and on no 60 ms grid. Two draws per message (11.5 and 29.2%) and six (30.7 and 64.2%) fit at neither setting; four do. In place of the statistic this finding could not explain, the computed and the measured now stand beside each other: whole messages lost at about 18 a second make about 3.1 and 4.5 runs of lost messages a second at 21.7% and 49.8%, 3.6 and 5.6 frames long on average (computed from 20 minutes of the app's sender), and the takes show 3.1 and 3.9 runs a second, 3.5 and 6.1 frames long (measured). They agree at 5; at 15 the rule gives more runs than the take (4.5 against 3.9 a second); the combined take is still open (below).

**The refusal, seen by its effect.** Of the takes' 16 lost runs longer than ten frames, nine end with the sound earlier by a whole number of frames: 20 ms twice (11 lost, 10 concealed) and 260 to 340 ms seven times (13 to 17 frames), nothing between 40 and 240 ms (measured). The game closes up by exactly a refused packet's frames and stays early until the channel restarts (up to 3.4 s in the loss-15 take); only the whole take's average does not drift (the loss-15 take runs 927 ppm fast against its source, the loss-5 take 441, the baseline 416: measured, W3-17c's private run).

**Open.** The combined take (lag 100 and jitter 50 on) has more silence and longer runs than 37.0% of messages lost one by one plus the app's late frames give (silent 10.3% against 4.0%; runs 4.8 frames against 4.1); the cause is not known (overtaken packets being dropped is a guess), and it is BC-4's. One stretch of 340 ms of full-level noise in the loss-15 take matches no part of the source (sound made past ten frames). Whether Steam's concealment is the bundled library's sample for sample: the takes' concealed sound falls about 0, 1 and 4 dB over 60 ms and 11 to 18 dB by 180 ms; the library's is similar, a little slower. Block 1 of the run sheet, its log replayed with its own dropped packets (`opts.loseMessage`), would settle it. *Added 2026-11-13 (BC-4a): BC-4 built the delays, on Steam voice on the game's voice queue (finding 9); whether they give this take's silence is for the private run on that build (the order's check ii).* *Closed 2026-11-13 (the order BC-4's check ii, the orchestrator's private run on BC-4a's branch over ten seeds; measured on the model): loss 37.0% on the file's own timing leaves 3.8% of the noise silent (0.8 to 8.0; BC-1's prototype gave 4.0%); on the game's voice queue without jitter 6.6% (3.3 to 11.9), and with jitter 50 8.0% at 300 frames a second and 8.8% at 336 (3.7 to 14.2). The take's 10.3% is inside the seeds' range. The silence is the queue's (BC-3), with about 1.4 points more from jitter (−0.2 to +3.6 by seed); with jitter the channels opened rise by 0.5 (−1 to +2), and the level, each render against its own baseline less the take against its baseline over the noise parts, is +0.11 dB at 300 and +0.06 at 336.*

**Checked on BC-1's build** (the orchestrator's private run, 2026-11-11). The build equals the prototype above sample for sample at Set C's settings (20 renders), and with nothing lost its renders equal those before it (14 cases of the accuracy manifest). The accuracy suite's level column, before BC-1 and after: loss15 −1.4 dB and +0.0; combined −1.7 and +0.3; loss5 +0.1 and +0.4 (seeds within +0.26); `speech_loss10` +0.2 and +0.4 to +0.5, 0.3 dB further from 0 than before, for a reason not known. Under jitter of 200 ms and more the prototype, which placed a packet at its first block's frame, put arriving frames at the wrong slot; the build's rule (the cursor plus the frames nobody fills) puts every arriving frame at its own slot (the build's review).

**What the app does since BC-1.** On the `steam` profile (the render, its stream and the live chain) the loss setting is the share of the sender's messages that never reach the listener, each message one packet with a draw of its own (`steamMessageLoss`). A lost message's frames are encoded and never decoded; they count toward the gap in front of the next frame to arrive, and up to ten of them are concealed there; its end marker does not reach the decoder. A message that comes to more than 12 frames is resampled and then dropped (finding 29). Every frame that is played lies at its own time: the time of frames nobody fills stays silent and later sound does not move, a stand-in for the queue until BC-3. The late frames of finding 9 are drawn as before. The other profiles keep the per-frame model above. `tests/accuracy.takes.json` gives Set C's loss takes 21.7, 49.8 and 37.0. *Corrected by BC-4a (2026-11-13): on `steam` jitter draws no late frame since BC-4a; on the game's voice queue it is when messages arrive, and on the file's own timing it does nothing (finding 9). The other profiles keep the late frames.*

### 9. Jitter adds isolated late frames

*Corrected by BC-2 (2026-11-11): the game has no path that makes a frame late. The title and the first paragraph say what the recordings looked like, not the game's rule; the app's late frames are the earlier fit, and the rule that replaces it is not built yet (BC-4). See the correction below.* *Corrected by BC-4a (2026-11-13): the rule is built on Steam voice on the game's voice queue, and the take's events are measured again: every one beyond the method's own false events is a skip. See "What the app does since BC-4" below. The late frames stay, as the fit, on the other codecs.*

With `net_fakelag 100` and `net_fakejitter 50`, about 1.4 extra events per second appear (3% of frames). They are single frames: 81% last one frame, against 51% for packet loss. Nine in ten are concealed and about one in ten plays as a short silence, consistent with a frame that arrived too late for playback.

**Corrected 2026-11-11 (BC-2, from the reads of `docs/reports/bad-connections-plan.md`).** The game has no path that makes a frame late, and none that conceals a late one. `net_fakelag` and `net_fakejitter` hold each packet in a first-in-first-out list per socket and release only the list's head, so jitter delays and bunches packets but cannot reorder or lose them (read). The receiver has no playout deadline: a late message is appended to the speaker's queue, or opens a new channel if the queue ran dry first (read, W3-03). Measured on the same take, no sound is missing: 96.0% present against the baseline's 96.5%, 0.2% silent in both. So the events above are not late frames. What they most likely are (inferred, not checked): skips, where a bunch of messages overflows a queue that a restart had already filled; the take's clock runs 726 ppm fast against the baseline's 416, about 0.3 ms more sound skipped a second. The app's jitter setting is still this finding's fit (3.2% of frames marked late at 50 ms, nine in ten concealed, one silent) until BC-4 replaces it with arrival times through the queue. The title is kept for the links to it. *Corrected 2026-11-13: that the events are skips is checked (the order BC-4's check i, below), and BC-4a replaced the fit on Steam voice on the game's voice queue; the other codecs keep it.*

**What the take's events are (2026-11-13, the order BC-4's check i, the orchestrator's private run on Set C's jitter and baseline takes; measured).** The guide is the app's render of the network test signal at `volume 0.15` on the file's own timing, with no room, loss or jitter. The events are found by the method of finding 8 above, and each event's delay before and after it is measured at one-sample resolution: a step down means the take plays earlier after the event, so sound was skipped.

- **The 12 s of pink noise.** The baseline has 8 events and the jitter take 10. Seven of each sit at the same places (within 30 ms), with the same lengths, no step (within 0.15 ms of 0) and sound at the guide's level (−2.1 to +0.9 dB): they are the method's own false events. The jitter take's three others are steps down: 46.0 ms in the segment's first window, 32.2 and 38.7 ms inside it. No event of either take steps up.
- **The chirp.** No event in either take.
- **The eight 1.2 s bursts.** The baseline has 4 events, all steps down of 11.0 to 36.8 ms. The jitter take has 8 steps down of 15.5 to 70.4 ms in five of the eight bursts, each 0.03 to 0.46 s after the burst's start (three of them in one burst within 0.16 s, about 70 ms in all), and one event at a burst's first window that could not be read.
- **From 1 s after the noise's start:** 2 skips in 10.7 s, 70.8 ms of sound, 6.6 ms a second, 0.19 skips a second of 10 ms or more; the baseline has none.

So every event of the jitter take beyond the method's false events is a skip, as the read predicts (a bunch overflowing the half-second ring, finding 22). The 1.36 events a second and the 81% of one frame in the paragraph above came from a script that did not survive (finding 8 withdraws its method's figures); they are not targets for the model, and the counts here replace them.

**What the app does since BC-4 (2026-11-13, BC-4a; `docs/work-orders/BC-4-jitter-arrivals.md`).** On Steam voice on the game's voice queue (`voice_timeline game`), the jitter setting is when each of the sender's messages reaches the receiver's voice channel (`engine/network.js`, `steamArrivals`):

- Each message crosses `net_fakelag`'s lists twice, client to server and server to client (read, reads 3 and 4 of `docs/reports/bad-connections-plan.md`). A list releases only its head, when its age is at least lag + (2u − 1) j with j = min(jitter, lag / 2) and u drawn again at every look (read; the draw taken as uniform: inferred). The next packet is looked at in the same look (inferred). A head younger than lag − j draws nothing (chosen: the draw could not release it).
- The lag is taken as twice the jitter (chosen): a steady lag delays every packet alike and a render does not show it, and twice the jitter is the least lag at which the game applies the whole jitter (read) and Set C's setting.
- Each crossing carries one packet a tick (read for the in-process path; inferred for sockets, and Set C's photographs show 59 packets a second with lag on, not explained: Set C, above). A message that leaves the first list rides the server's packet of the next tick. The server's socket is looked at once a tick and the listener's once a frame (chosen: of the three pairs the planner's prototype tried, this one adds 190 ms to the round trip at jitter 50 and 300 frames a second, where Set C's `net_graph` showed 185 to 196 ms more with lag and jitter on than without; one reading, measured).
- The least delay, 2 × ceil(jitter / 15) ticks, is taken out and the rest is heard, so a render with jitter plays later than its source (chosen). Nothing is lost and the order is kept (read). The queue does the rest: a bunch that does not fit the half-second ring skips the oldest sound, and a gap that outlasts what is queued fades it and ends the channel, so the next message waits again and resets the gain (findings 22, 23 and 26). *Corrected in BC-4a's fix round (2026-11-13): the least delay taken out is 2 × (floor(jitter / 15) + 1) ticks. At a jitter of whole ticks (15, 30, 45, 60, 90 ms) a packet leaves a list only after the age of the jitter, so 2 × ceil(jitter / 15) left 30 ms above the least delay in every packet and never 0 (the second reader of BC-4a, measured over 100,000 ticks at 300 and 66.67 frames a second); at every other jitter the two counts are the same.*
- **Where it runs.** On Steam voice on the game's voice queue. On the file's own timing it does nothing: such a render equals the render at jitter 0, sample for sample. The live monitor keeps the file's own timing, so jitter does nothing there on Steam voice until W3-02c-3 (not built yet). The other codecs (`vaudio_celt`, `vaudio_celt_high`, `vaudio_speex`, and Fullband Opus and `vaudio_miles`, not in TF2) keep the late-frame fit above, as a fit.

The figures, each with its standing:

| What, at jitter 50 | 300 frames a second | 66.67 frames a second | Standing |
| --- | ---: | ---: | --- |
| Mean delay above the least, over every tick | 69.5 ms | 96.4 ms | measured on the build, seeds 1 to 20, 4,000 ticks each (`tests/render-channel.verify.mjs`, section 14) |
| The same, on the two prototypes the order was checked with | 69.5 ms | 95.6 ms | measured on them; the build's lists start 200 ticks before the render, theirs at its start |
| The sender's messages that arrive on the tick of the one before | 4.9% | 8.4% | measured on the build, as above (the prototypes: 5.2% at 300) |
| Skips inside a long sound past its first second | 0.22 a second, 1.9 ms of sound a second (0.19 and 0.7 without jitter) | none at 150 frames a second and under | measured on the planner's prototype, packets of zeros (`docs/reports/BC-4-plan.md`) |
| Skips of 10 ms or more, the same | 0.07 a second (0.02 without) | none | the same |

**The model against the take.** In the noise, the take's two skips are too few to compare in size or number: at the model's rate two or more in 10.7 s has a probability of 0.08 to 0.17 (the plan reviewer's arithmetic). In the bursts, at the photographs' frame rates (the jitter take at about 336 frames a second, the baseline at 295), the model gives +0.45 skips a second of 10 ms or more (measured on the plan reviewer's prototype) and the takes +0.44 (8 against 4 in 8.6 s, measured). The run of the build on the network test signal with ten seeds against both takes (the order's check ii) is the orchestrator's and is not in yet. Open: how often each socket is looked at, and whether the next packet leaves in the same look; block 2 of the run sheet, with the queue's log and `net_showdrop` at two frame rates, would show both, and its log's arrival ticks can be replayed through the render (`opts.arriveAt`).

**Check (ii), run on BC-4a's branch (added 2026-11-13; the orchestrator's private run on `5f22ff2`; measured, the takes private, the renders of the public network test signal).** The signal was rendered at Set C's settings (`volume` 0.15, the room `set_c_room`), Steam voice on the game's voice queue, `voice_buffer_ms` 100, seeds 1 to 10: without jitter at 300 and at 295 frames a second (the two render alike, sample for sample: the wait is 30 ticks at both), jitter 50 at 300 and at 336, loss 37.0% at 300, both at 300 and at 336, and loss 37.0% on the file's own timing. Each render and the takes without jitter, with jitter and combined were measured by one script: finding 8's method as the BC-1 premise made it again, with check (i)'s steps, against the app's render with nothing lost on the file's own timing, the bursts from 60 ms after each start to 60 ms before each end. A figure is the mean of the ten seeds, the lowest and highest seed in brackets:

| Measure | The take | The build |
| --- | --- | --- |
| Jitter: sound present and silent in the 12 s of noise | 99.7% and 0.2% | 100.0% and 0.0% in every seed, at 300 and at 336 |
| Jitter: events a second in the noise and the chirp at places the baseline has none | 3 in 19.4 s, 2 of them skips | 0.005 at 300, 0.010 at 336 |
| Jitter: the steps down's sum there, less the baseline's | 3.7 ms a second (skips of 32 and 39 ms) | 0.14 at 300 (−0.44 to 0.94), 0.22 at 336 (−0.22 to 1.32) |
| The same by counts: skips of 10 ms or more | 2 in 19.4 s | 0.29 expected in 19.4 s at 300 and 0.19 at 336, so two or more has a chance of 0.035 and 0.016 |
| The bursts: sound skipped, less the baseline | +39 ms a second (50.7 against 11.5) | +9.0 at 300 (0.9 to 27.8); at the photographs' rates, 336 against 295, +18.3 (7.8 to 34.4) |
| The bursts: skips of 10 ms or more, less the baseline | +0.58 a second (9 against 4 in 8.6 s) | +0.31 at 300; +0.46 at the photographs' rates |
| Events one frame long | not known | 61% at 300, 49% at 336 |
| The clock, as the slope of the followed delay less the baseline's | +660 parts in a million (+310 by the accuracy suite's measure) | +280 at 300, +390 at 336 |

The bursts one by one: the odd bursts (1, 3, 5, 7) open a channel and lose sound at its opening, and the even ones lose none, in both takes and in the renders (without jitter at 300 frames a second a skip of more than 3 ms happens in 8, 0, 7, 1, 8, 0, 6 and 1 of the ten seeds, burst by burst). Without jitter the size agrees too: the take's four odd bursts skip 40 ms in all, the renders' 8 to 57 (mean 40). With jitter the take's four odd bursts skip 72, 71, 57 and 78 ms, 278 ms in all; the renders at 336 frames a second skip 49 to 211 ms in all (mean 120), and only 17% of their odd bursts skip 50 ms or more. **Two differences, measured and not explained:** in the noise the take's skips outnumber the model's (two or more have a chance of 0.016 to 0.035 under it); in the bursts the counts agree and the size is about twice the model's, so with jitter the take loses more sound at each opening than the model. Every bound the order set before the run held, and the jitter take's present and silent shares are the model's.

**No reading tried closes the two differences** (added 2026-11-13; the second reader of BC-4a, measured on a stand-in made of the repository's sender and voice channel and the signal's layout, jitter 50 at 336 frames a second, 100 seeds; the stand-in gives 33 ms for the four odd bursts without jitter and 113 with the rule as built, against the renders' 41 and 120). The take's odd bursts skip 70 ms each in the mean. The stand-in gives 28 as built, 34 with the listener's socket looked at once a tick, 42 with one draw a packet, 46 with a wait of 42 ticks, and 61 with one draw and a wait of 42 ticks. None gives the take's two skips of 30 ms or more in the noise after its first second (0 of 100 seeds as built). Inferred: once the ring is full the sound's delay is the lowest packet delay since it filled, and a skip is a new lowest, which every rule tried reaches within about ten messages. Block 2's log is read first without a model: the wait in ticks at each opening against ceil(0.1 × fps); the bytes drained per `bufsize` line (a tick's real length); the size of each add that overflows; and the gaps between messages in ticks, whose share on the same tick (4.9%, 8.2% or 16.3%) tells the three rules apart.

**The render at jitter 0 has no look once a frame** (added 2026-11-13; the second reader of BC-4a). With lag off nothing runs between frames, so the client takes packets at most once a frame (inferred; where it reads its socket is not read). The model with jitter has that look (the listener's list, looked at once a frame) and the render without jitter does not. It moves no tick at 75 frames a second and above, 295, 300 and 336 included; at 66.67, 6.5% of ticks come a tick later (1 ms in the mean); at 60, 1.5 ms; at 30, 10 ms; at 10, 43 ms (measured on the model, at jitter 0.5 and 1). Frame rates under 67 are for an order of their own, for ticks, pulls and looks together.

**At exactly 66.67 frames a second the looks drift against the ticks** (added 2026-11-13; the second reader of BC-4a, measured on the model). A frame at 66.67 frames a second lasts 14.9993 ms, a little under a tick (arithmetic), so the listener's looks drift against the ticks, and the mean delay above the least climbs: 96.3 ms in the first minute, 108.1 in the fifth. At 1000/15 frames a second it stays at 95. The pin's 96.4 ms above is the first minute's.

**What a render with jitter does** (added 2026-11-13; the second reader of BC-4a, measured on the model: renders at jitter 50 against jitter 0). The packets' mean delay above the least (69.5 ms at 300 frames a second, above) is not what a listener hears:

- At 300 frames a second a phrase starts 60 ms later (20 to 103) and sits 39 ms later after 5.5 s, because each skip takes lateness out. The source's last 27 ms (9 to 53) are not heard, where at jitter 0 none is lost. (Marked 2026-11-15: since W3-24 the render plays them out; "The render plays out what the queue holds at the source's end" below.)
- At 66.67 frames a second the voice is 101 to 106 ms later at its start and at its end. Each phrase is late by its first packet's own delay (35 to 194 ms), so the pauses between phrases move. The last 121 ms (72 to 172) are not heard, against 15 at jitter 0. (Marked 2026-11-15: since W3-24 the render plays them out; below.)
- At jitter 100 the end loses 82 ms at 300 frames a second and 234 at 66.67. (Marked 2026-11-15: since W3-24 the render plays them out; below.)
- On 60 s of the stand-in signal at 300 frames a second, unbroken sound skips 138 ms a minute against 98 at jitter 0 and talk 1,897 against 1,557, with no more channel restarts. At 66.67 nothing is skipped at any jitter, and the share of the mixer's blocks played with under 100 ms queued, where the level dips, rises from 4.0% to 10.5%.

**The render plays out what the queue holds at the source's end** (added 2026-11-15, W3-24, `docs/work-orders/W3-24-render-end.md`). Since W3-24 a render of Steam voice on the game's voice queue runs on past the source's end until the channel has given out the last place of the source it holds (the orchestrator's ruling of 2026-11-14: in the game the channel plays out what it holds), so the ends the three lines above mark are heard. A render whose source has nothing in the queue at its end is unchanged to the last sample. On a render that runs on, an output sample before the source's length changes only where the device stage's read for it touches the voice's length or later (the orchestrator's ruling A of 2026-11-15): through the 24 kHz codec the voice can be a sample shorter than the source at 44.1 kHz, and the run-on now fills that place where zero padding was, and at a device rate other than 44.1 kHz the device's linear interpolation reads the next mix sample (measured on the build: on a 44.1 kHz source of 176,408 samples, one sample at a 44.1 kHz device and two at 48 kHz; on a 24 kHz source, none at 44.1 kHz and one at 48 kHz). The run-on, `codecInfo.channel.over`, in milliseconds, the mean and the range over seeds 1 to 10, `voice_buffer_ms` 100, the suites' `speechLike` at -20 dB, 48 kHz (measured on the build, the model; no recording of a file's end through the queue exists). The rows marked 1000/15 were run at exactly 1000/15 frames a second, the page's 66.67 rounded to its threshold:

| Source | Frames a second | Run-on at jitter 0 | Run-on at jitter 50 |
| --- | ---: | ---: | ---: |
| One phrase of 6.13 s that ends with the file | 300 | 0.0 (0.0 to 0.0) | 16.5 (0.0 to 41.2) |
|  | 1000/15 | 6.6 (0.0 to 26.1) | 81.3 (0.0 to 142.2) |
|  | 60 | 0.3 (0.0 to 2.9) | 83.6 (0.0 to 150.9) |
|  | 30 | 4.2 (0.0 to 24.4) | 95.7 (40.7 to 130.6) |
| Four phrases in 8.4 s, the last ending with the file | 300 | 0.0 (0.0 to 0.0) | 0.0 (0.0 to 0.0) |
|  | 1000/15 | 9.9 (0.0 to 41.5) | 79.1 (0.0 to 165.4) |
|  | 60 | 3.2 (0.0 to 14.5) | 89.5 (0.0 to 130.6) |
|  | 30 | 9.2 (0.0 to 41.5) | 102.8 (33.7 to 153.8) |
| The first with 1 s of silence after it | 300 | 0.0 (0.0 to 0.0) | 0.0 (0.0 to 0.0) |
|  | 1000/15 | 0.0 (0.0 to 0.0) | 0.0 (0.0 to 0.0) |
|  | 60 | 0.0 (0.0 to 0.0) | 0.0 (0.0 to 0.0) |
|  | 30 | 0.0 (0.0 to 0.0) | 0.0 (0.0 to 0.0) |

The two test signals, seeds 1 to 3 (measured on the build):

| Source | Frames a second | Run-on at jitter 0 | Run-on at jitter 50 |
| --- | ---: | ---: | ---: |
| `tf2_voice_nettest_v1` (58.2 s) | 300 | 0.0 (0.0 to 0.0) | 18.9 (11.9 to 23.5) |
|  | 1000/15 | 0.0 (0.0 to 0.0) | 88.3 (56.1 to 117.9) |
|  | 60 | 0.0 (0.0 to 0.0) | 96.0 (67.7 to 117.9) |
|  | 30 | 0.0 (0.0 to 0.0) | 84.4 (56.1 to 106.3) |
| `tf2_voice_testsignal_v1` (142.9 s) | 300 | 0.0 (0.0 to 0.0) | 13.2 (0.0 to 39.5) |
|  | 1000/15 | 0.0 (0.0 to 0.0) | 93.0 (44.1 to 136.6) |
|  | 60 | 0.0 (0.0 to 0.0) | 77.6 (67.3 to 86.8) |
|  | 30 | 0.0 (0.0 to 0.0) | 55.1 (0.0 to 86.8) |

These equal, figure for figure, what the order's planner measured on a prototype. The second reader's 27 and 121 ms above were of the network test signal over seeds and a count not in the record; the build gives 18.9 at 300 and 88.3 ms at 1000/15 at jitter 50 over seeds 1 to 3, and none at jitter 0; at a literal 66.67 frames a second the network signal at jitter 50 reads 92.2 ms (56.1 to 114.1; measured on the build by the order's reviewer). At jitter 0 the page's default is not always free of a run-on. 360 short renders at each rate, a phrase or a 440 Hz tone that ends with the file, six lengths from 1.0 to 3.3 s, seeds 1 to 30 (measured on the build):

| Frames a second | Renders that run on (of 360) | Mean run-on | Largest |
| ---: | ---: | ---: | ---: |
| 1000 | 73 | 3.5 ms | 86.8 ms |
| 400 | 44 | 0.6 ms | 13.7 ms |
| 300 | 33 | 0.4 ms | 13.7 ms |
| 235 | 15 | 0.1 ms | 5.4 ms |
| 144 | 96 | 3.1 ms | 27.6 ms |
| 100 | 170 | 5.3 ms | 39.2 ms |
| 1000/15 | 170 | 6.5 ms | 39.2 ms |
| 60 | 56 | 1.3 ms | 27.6 ms |
| 30 | 204 | 6.9 ms | 27.0 ms |
| 10 | 94 | 2.0 ms | 15.4 ms |

So at the page's default (300 frames a second, jitter 0) about one render in eleven of a file that ends in sound runs on, by 13.7 ms at most here; a file that ends in a second of silence runs on at no setting tried. A long wait makes a long run-on: a 2 s phrase (seed 1) runs on 2.02 s at `voice_buffer_ms` 1000 and 300 frames a second, and 72.5 s at 5000 and 1000 frames a second, where the wait is 5000 ticks (measured on the build; arithmetic from `waitTicks`).

**The look at jitter 0 is built** (added 2026-11-14, W3-23a, `docs/work-orders/W3-23-low-frame-rates.md`). On Steam voice on the game's voice queue at jitter 0, under 1000/15 frames a second, each message reaches the voice channel at the listener's first look after the server's relay tick: the message of tick p is in the listener's list from 15 (p + 1) ms, leaves at the first look r = k × 1000 / fps with r − 15 (p + 1) > 0, and reaches the channel on ceil(r / 15) − 2 (`engine/network.js`, `steamArrivals` at jitter 0). That is the model with jitter as its jitter goes to 0 (chosen: the orchestrator's ruling 2 keeps one rule for both), and it gives the ticks of jitter 0.000001, tick for tick over 40,000 ticks, at 10, 20, 24, 30, 40, 50, 59.94, 60 and 66 frames a second and at 1000/15, 66.67, 75 and 300 (measured on the build, `tests/render-channel.verify.mjs` section 22). What it moves by itself, over 40,000 ticks (measured on the build):

| Frames a second | Ticks moved | Mean | Most |
| ---: | ---: | ---: | ---: |
| 1000/15 and above | none | 0 | 0 |
| 66 | 1.0% | 0.15 ms | 1 tick |
| 60 | 10.0% | 1.5 ms | 1 |
| 50 | 25.0% | 3.75 ms | 1 |
| 40 | 40.0% | 6.0 ms | 1 |
| 30 | 55.0% | 9.75 ms | 2 |
| 20 | 70.0% | 18.0 ms | 3 |
| 10 | 85.0% | 42.75 ms | 6 |

- Against jitter 0.5 and 1 ms (seeds 1 to 3) the model with jitter is later in the mean by 0 to 1.02 ms at 10 to 60 frames a second and by 0.90 to 1.91 ms at 59.94 and 66 (measured on the build): the lists' least age, which jitter 0 does not have. So finding 9's "at 66.67, 6.5% of ticks come a tick later" is that age, not the look: at jitter 0 the rule moves nothing at 66.67.
- With the frame clock (finding 22's added lines) a message is added in the first frame at or after its arrival tick, so at 66, 60 and 50 frames a second the rule puts no message in a later frame than its own tick would: the 1.5 ms at 60 moves no sample, and is not heard. It puts 10.1% of messages a frame later at 59.94, 20% at 40, 50% at 30, 40% at 24 and at 20, and 20% at 10 (measured on the build over 40,000 ticks; the plan reviewer's computation gave the same), so its breaks show at 30 and 10, not at 60.
- Its cost: the level at 30 frames a second and under rests on that rule's phase between the server's ticks and the listener's frames, which the model fixes and the game does not. On a minute of unbroken sound at 30 frames a second, seeds 1 to 10, the level is down 0.12 dB with the relay tick and 0.63 without it (measured on the build's timeline, the script of `docs/reports/W3-23a-frame-clock.md`; the planner's prototype gave 0.13 and 0.74).
- A render does not report it as `codecInfo.arrivals`: no jitter is on. The live monitor's chain keeps every message on its own tick at jitter 0 until W3-23b (not built yet). *Corrected 2026-11-14 (W3-23b): built. The arrival model with no end, the live monitor's chain's, takes the same rule at jitter 0 under 1000/15, holds nothing for it, and the chain does not report it either (`tests/render-channel.verify.mjs` sections 10 and 22).*
- *Added 2026-11-14 (W3-23a's fix round, after the second read).* "The listener's first look after the relay tick" is true in ticks. In what is heard, from 34 to 66 frames a second the two ticks taken off put the message in the first frame at or after its own tick (100% of messages a frame earlier than the whole look at 50, 60 and 64 to 66); the whole look is in the delay only at 30 and under (0% earlier there; measured, the second reader of W3-23a). That is why the offsets of finding 22's table do not fall in step with the frame rate. The looks are the frame clock's frames, (88200 k) / fps half samples: at a look exactly on a tick the clock's double decides, at 61 of the 567 one-decimal rates from 10.0 to 66.6, and jitter 0.000001 decides it by its own milliseconds at 60; elsewhere both are the rule worked in whole numbers (measured on the build, `tests/render-channel.verify.mjs` section 22).

*Added 2026-11-15 (Set Q, measured): on a real server the gaps between a speaker's messages run 0 to 7 ticks, against 3 to 5 for the module's sender without jitter, and the share on one tick is 0.74% at 294 frames a second. Two stalls of about 0.2 s ended in a burst with a packet of 0 samples. A server's relay once a tick is not contradicted; from a listener's log it cannot be told.*

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
- **Hold:** 0.4 s on Steam's clock from the read of the last active chunk, in 32-bit floats (read, finding 28). On a Steam started within the last day and a half that is 398 to 406 ms from that read. On one that has run longer, up to 24 days, it is anywhere from 375 to 500 ms, by how long. Measured in Set D from the last loud frame: 425 to 485 ms.
- **The 31.25 ms grid** is the capture's step on the owner's PC.
- **A pause shorter than the hold keeps the spurt going.** There is no 560 ms rule. In Set J a 0.3 s pause is bridged in four loops of four and the 0.7 s pauses end the spurt (measured).
- **Each spurt resets the encoder and the decoder.**

**Corrected 2026-11-10 (W3-16 read, W3-14).** The hold's bullet said "0.4 s of Steam's clock from the read of the last active chunk. Sound goes on for 380 to 460 ms after that chunk". That took the clock to be exact. It is a 32-bit float of seconds since Steam started, so the real length moves with Steam's uptime. The title keeps its 0.4 s: that is the constant in the code.

**The frame model** is a 20 ms fit to the measurements above. A frame above −39.5 dBFS RMS is sent with the 6 frames before it and the 22 after it, and a pause shorter than the hold plus the pre-roll (560 ms) keeps the spurt going. That puts both boundaries of 16 of the 18 spurts within 4 frames of Steam's, and most within 1–2. The exceptions are pure tones at 11.8–12 kHz, which Steam's gate and the model's (on the 24 kHz signal) treat differently.

**The app today.** Until W3-11a the frame model was the app's gate everywhere, and this finding said so. Since W3-11a a render of the `steam` profile runs Steam's rule (the sender of W3-02b; finding 28 says where it still differs). Since W3-11b the live chain for `steam` runs the same sender. The frame model stays in the fullband extra `steam_48` and in the tools that line a take up with a render.

**Corrected 2026-11-10 (W3-11b).** This paragraph said "The frame model stays in the live chain until W3-11b, in the fullband extra `steam_48`, and in the tools that line a take up with a render."

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

The model's column is the app before W3-11a. With W3-11a's `steam` render the −36 dBFS sine gives 76 DTX frames from 0.42 s and the −30 dBFS sine 40 from 1.18 s, and −24 dBFS none (reproduced, W3-11a). The 16-bit capture and the pre-roll's zeros both move the point where the encoder enters DTX.

### 14. The high-band difference is on the sender; the receiver adds no EQ

Decoding Steam's packets and passing them through the receiver model matches recording A within 0.1 dB per band from 100 Hz to 11.5 kHz. The receiver model here is the 44.1 kHz auto-gain, the `[0.1, 0.8, 0.1]` output stage and `volume`; the filter stands in for the output device's interpolation (finding 30). Median 50 ms levels match within ±0.3 dB on segments more than 15 dB above the game ambience. The receiver adds no EQ. Read since: nothing between the decoder and the mixer filters the voice (W3-03, W3-07).

The receiver's own 24 to 44.1 kHz step is finding 29's resampler, which the app's stood in for when this was measured. Its roll-off above 10.5 kHz belongs to the receiver. The two resamplers were not compared (W3-09). Since W3-11a the `steam` render runs a port of Steam's resampler, so the question no longer arises there.

Recording A carries a street room on the voice (finding 32), which this comparison did not know. Its part is small: the echoes show as autocorrelation peaks of 0.008 to 0.023, and that preset passes the voice straight through at 252.7 of 256 (W3-18).

Against libopus 1.6.1 on the same input, Steam's decoded packets have:
- 0.5–1.1 dB more energy from 1.5 kHz up to the 8 kHz SILK/CELT crossover
- 1.0 dB less in the CELT band above it
- a roll-off from 11.2 kHz to −7 dB at 11.8 kHz (the capture resampler)

*Added 2026-11-21: the capture's conversion was read from Windows's files on 2026-11-20 (finding 28, the paragraph of late 2026-11-20 on Windows's conversion to 24 kHz). The three points given as the capture resampler's in finding 16 were not the whole conversion; measured against the signal itself the fall is quality 30's. Since W3-26b the `steam` render runs that converter in place of the filter fitted to them.*

The earlier profile EQ trimmed 2.5 dB above 8.2 kHz and nothing below. That left the old model 1–2 dB dull from 2 to 12 kHz against recording A. Finding 16 shows that the ±1 dB comes from the libopus release. The capture roll-off is not Steam code either: Steam opens the capture at 24 kHz, so the conversion from the device's rate is done by Windows or the virtual cable (read, finding 28). It belongs to the sender's machine and may differ on another (inferred). The model applies it before the gate and the encoder.

### 15. A remote listener hears the same chain

Recording B divided by recording A is flat within ±0.2 dB from 100 Hz to 11 kHz on pink noise. B is 6 dB lower overall. That is two settings of PC B, inferred from the recording (W3-07):
- **`volume 0.11`:** its largest sample is exactly round(32767 × 0.11) = 3604.
- **`voice_scale 0.77`:** with the engine's gain law (finding 26) it gives B's 1 kHz staircase within 1 to 3% and its 344.5 Hz sidebands within 1 dB.

The owner has not yet read the two values off PC B's console. B's output path is the same as A's: it shows the same interpolation images (finding 30).

Both PCs had a room on the voice, and not the same one (measured, finding 32): a street preset on A, and on B two weak echoes of a room that is not identified. A room's share could hide at most 0.01 of B's 0.77, so the 0.77 stands (inferred, W3-18).

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

*Added 2026-11-21: these three points were not the whole conversion (finding 28, the paragraph of late 2026-11-20 on Windows's conversion to 24 kHz: measured afresh against the signal itself, the fall is that of Windows's converter at quality 30). Since W3-26b the `steam` render runs that converter in place of the filter fitted to them.*

**Decoder.** Steam's receiver decodes with the same release. Decoding Steam's packets with 1.1.5 reproduces recording A where 1.6.1 does not. Levels in dBFS:

| Measurement | Recording A | libopus 1.1.5 | libopus 1.6.1 |
| --- | ---: | ---: | ---: |
| 8 kHz tone, DTX frames (comfort noise) | −32.5 | −32.5 | −44.5 |
| 8.5 kHz tone, coded frames | −22.8 | −22.6 | −26.4 |
| 11.5 kHz tone, coded frames | −30.9 | −30.6 | −33.8 |
| 1 kHz DTX tails, three talk spurts | −50.5 / −48.0 / −52.3 | −50.2 / −48.5 / −52.1 | −51.3 / −49.6 / −55.2 |

The Steam profile therefore encodes and decodes with libopus 1.1.5, compiled to WebAssembly with musl's libm (`vendor/libopus-1.1`, built by `tests/libopus11/build.mjs`). Its packets are bit-identical to a native build of the same release.

**The clock counts from Steam's start (measured 2026-11-11, Set L).** Steam's own log gives each run's start: Set J's morning run was 23.9 days after it, a second run that evening 4.8 minutes after a new start with the PC left running. The built sender, given each run's real uptime, reproduces every spurt end of both (18 of 18 and 12 of 12) and fails on both when given the other's (7.5 of 18 on average; 8 of 12). On the young Steam the hold has a sharp edge between 399.4 and 403.1 ms and spurts end on the 7th read 5 times in 37, the 8th 32 times, never the 9th; the printed chunk lengths show no float step down to 1/512 s. A real-microphone run of 590 chunks follows the gate rule on every line. Two details the model lacks: chunk ends favour one place in every 8 capture steps (15.3% against 12.5%; seen in Set D's demo too), and the first opening after Steam starts was logged with no 100 ms of zeros in front, once, with a file as the microphone and a first chunk of 6000 samples. With a real microphone it has them (Set N, the same night: Steam started, the first chunk 1500 samples and loud, the game's first packet 8 frames, which is 2400 samples and the chunk; the next seven packets line for line), as the app's sender does.

**Checked against Steam itself (Set J; W3-14, reproduced).** Steam's `mic_inputfile` fed a known 24 kHz clip, and the game recorded the decoder's output. The clip was encoded on Steam's own chunk boundaries with the pinned 1.1.5 at Steam's settings, decoded to 16 bits and resampled as finding 29 says. That gives the recording in 524,286 of 524,288 samples: 11.9 s of speech peaking at −2 dBFS.
- **The two others** are one step off, four samples apart. Both come from one decoded 24 kHz sample that Steam has one step higher. The app's float value there lies one float step under a rounding boundary. Of the 626 decoded samples within 0.001 of such a boundary, it is the only one that fell the other way.
- **What the match pins down.** Complexity 7 leaves 2,113 of the 524,288 samples equal, 31000 bit/s 1,880, VBR off 900 and the "audio" application 666. So the application, the bit rate and VBR are Steam's, and the complexity is 8, 9 or 10.
- **What it does not.** Complexity 8, 9 and 10 give the same samples. So do unconstrained VBR and the automatic signal hint on these clips; DTX off changes only the clip with pauses. The clip never decodes past full scale. Releases 1.1.4 and 1.1.5 were not told apart: whether the one sample is the release or Steam's compiler is not known. No demo was recorded, so that the bytes are Steam's is inferred from the decoded sound.
- **The app's own render code** gives the same count (W3-11a's second read, a private run): the build's `process()`, driven by Steam's chunk lengths from Set J, gives 524,286 of 524,288.

**Corrected 2026-11-10 (W3-11a).** This finding said "The app passes complexity 10" and "Steam also decodes to 16-bit samples, where the app decodes to float". Both were closed by W3-11a. Steam sets no complexity, so it runs the library's default, which is 9 in 1.1.x (read, finding 28). The pinned build gives byte-identical packets at 8, 9 and 10 (reproduced on 19,428 frames, W3-09). Since W3-11a the `steam` profile passes 9, and its render decodes through the library's own 16-bit entry point, which matches a native build of the same release sample for sample (reproduced, W3-11a). Since W3-11b the live chain for `steam` decodes the same way; a demo's received voice still decodes to float.

**Corrected 2026-11-10 (W3-11b).** The correction above ended "The profile's other paths (the live chain, a demo's received voice) still decode to float." W3-11b put the live chain on the render's decoder.

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

*Corrected by W3-02d-1 (2026-11-13): the page's render on Steam voice now runs the game's voice queue by default (Phrase timing, `voice_timeline game`, at `fps_max` 300 and `voice_buffer_ms` 100); the file's own timing is one setting away (`voice_timeline source`), and a demo's voice, a video and the live monitor keep it. The page no longer offers the flat rule; `voice_retime` is an old name for `voice_timeline`.*

*Corrected by W3-02f (2026-11-13): the flat rule is no longer in the engine; `tests/retiming.mjs` keeps a copy for scoring.*

*Added 2026-11-14 (AC-01): the counts above were taken when the accuracy suite rendered every take on the file's own timing. Since AC-01 it renders Steam voice on the game's voice queue, and it lines the take up against that render, so a spurt that the render's queue starts early as the take's does keeps its delay in the suite's reading (inferred). A row with `"timeline": "source"` renders on the file's own timing, as these counts were taken.*

This flat rule is what the app runs today when the option is on. It cannot chain early starts, and the speech take has two chains (W3-01). The engine's queue (findings 22 to 25) is to take its place. It is built as a module, `voice-channel.js` (W3-02a), which no render uses yet. W3-02b added Steam's sender and the queue's timeline as modules. Since W3-11a the `steam` render makes its packets with that sender, but it still lays them on the source's timeline. Orders W3-02c and W3-02d put the queue into the render and the page, and W3-02f retires the flat rule. *Corrected by the plan review of W3-02c (2026-11-11): W3-02c is three orders, W3-02c-1 (the module as read; built and merged 2026-11-12, `a2b7dc9`, no render runs it yet), W3-02c-2 (the render) and W3-02c-3 (the live chain). The wording here waits for W3-02c-1's merge.* *Corrected by W3-02f (2026-11-13): the flat rule is no longer in the engine; `tests/retiming.mjs` keeps a copy for scoring.*

### 20. The Steam render's low frequencies lead the source by Opus's own phase

*Corrected by W3-11a (2026-11-10): the `steam` render is 16 input samples (0.667 ms) late, as the game is; measured lag 0.60 ms. The title and the first paragraph hold for `steam_48` (not in TF2). See the correction below and finding 29.*

A render of white noise lines up with its source to 0.3 µs in the 8–11 kHz band, which the CELT layer of hybrid mode codes: the encoder's lookahead is trimmed exactly. Below 8 kHz the SILK layer leads by a frequency-dependent amount: 35–70 µs at 1–6 kHz, 86 µs at 0.3–1 kHz and about 370 µs at 100–300 Hz. libopus alone, without the app's chain, does the same in both 1.1.5 and 1.6.1. It is the phase response of SILK's own processing, which TF2's libopus shares, so the render keeps it rather than shifting it. An Opus test pins both bands.

**Corrected 2026-11-10 (W3-11a).** This finding said the render "lines up with its source to 0.3 µs" in the CELT band. That was the render before W3-11a, and it still holds for `steam_48`. Since W3-11a the `steam` render runs Steam's resampler, which leaves everything after a speaker's first packet 16 input samples (0.667 ms) late (finding 29). The game has that lateness, so the render keeps it. Measured on the new render: a steady lag of 0.60 ms, which is the 0.667 ms less the SILK lead. The test now pins the lateness and the lead against it.

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
  - It loses on the four Set B takes, whose 440 ms silences sit at the threshold. There, ±30 ms in when the packets arrive decides, which a recording does not show. It was first put down to packet batching; most of it is the sender's gate, whose hold and pre-roll vary with its chunks (measured, W3-01; finding 28).
  - The arrival jitter was fixed at ±30 ms from Set D beforehand. At ±60 ms, chosen after seeing the results, the model scores −0.349.

So the mechanism explains the early starts, and a demo's packet timing predicts them spurt by spurt. From a recording or a source file, a spurt near the threshold stays a coin flip. The mechanism has since been read from the engine and confirmed against the game's own logs (findings 22 and 23). The app still keeps the statistical rule (`voice_retime`) today; finding 19 says which orders replace it.

*Added 2026-11-14 (W3-02g; the orchestrator's private look (ii) and the order's rulings, docs/work-orders/W3-02g-demo-packets.md, last section).* Set D's demo for the sender, rendered on the game's timeline with its own packets and ticks (W3-02g-a: Steam's decoder as read and the voice channel), at eight frame rates (measured, private; the demo and takes stay private). At every rate 1,816 messages reached the channel, 276 on the tick of the one before, none refused, cut or past the end. Against the 17 transitions readable in listener A's take (above):

| Frame rate | Opens | Joins | Dropped | Of the four early starts, joined | Within 60 ms of the take |
| --- | ---: | ---: | ---: | --- | --- |
| 300 | 17 | 2 | 2,357 ms | spurt 6 only (−298.2 ms, 27 ms off) | 8 of 17 |
| 250, 240, 230 | 18 | 1 | 1,114, 870, 628 ms | none | 9 of 17 (the nine unchanged) |
| 200, 150, 100, 66.67 | 18 | 1 | 107, 0, 0, 0 ms | none | 9 of 17 (the nine unchanged) |

- Rates from 251 to 600 give spurt 6 alone, and 1000 gives spurts 4, 6 and 9 but not 13 (measured, private). No frame rate gives the four early starts. Listener B's take, in which no spurt moved, agrees with no join up to 250 frames a second (measured, private).
- **Open:** on Set D's demo with its own ticks the queue starts at most one of the take's four early spurts at any frame rate up to 600, and three at 1000. That agrees with W3-02c-2's finding that at Set D's pauses the render's queue runs out sooner than the take's. So the page keeps a demo's voice on the file's own timing (ruling 2 of that section). A log of the receiver's queue in a two-PC session (block 5 of the owner's run sheet) is the next evidence.
- **Above about 231 frames a second** the ring caps the latency, so joins stop moving with the frame rate, and the threshold between joining and opening is a band about 90 ms wide (both measured on synthetic packets by the order's second reader). So a demo's render bounds the listener's frame rate but cannot find it.
- **Set D's ticks are more bunched than SourceTV's 60 ms grid alone explains:** 146 empty and 276 doubled 60 ms slots (measured, Set D's demo, private looks (i) and (ii)) against about 2.7% and 11.1% of slots from the grid alone, which is about 6% of messages one slot later (both measured on synthetic packets by the order's second reader).

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

*Added 2026-11-14 (W3-23r, `docs/reports/W3-23r-frame-read.md`; read from the same `engine.dll`).* Where a frame takes its packets, counts its ticks and pulls from the ring:

- **Packets are taken inside the tick loop, once for each tick**, as the first step of the client's part of the tick and before that tick's pass over the channels (read: `CL_ReadPackets`, `0x18008e4f0`, has one caller, at `0x1801a724d`, ahead of the pass at `0x1801a730e`). One call takes every packet that is waiting (read). A frame with no tick due takes none (read). So under 66.67 frames a second the packets are in effect taken once a frame, before the frame's ticks, and at 66.67 and above at most once a tick.
- **The ticks a frame runs** are the whole ticks in the frame time gathered so far, each frame's duration limited to 0.001 to 0.1 s (read, `0x1801a6063` to `0x1801a6136`). A tick whose time has just come runs in that frame.
- **The mixer pulls after the tick loop and after the frame is drawn**, once a frame (read: `S_Update` is called at `0x1801a6b75`, behind `_Host_RunFrame_Render`). A frame's order is packets, ticks, mixer.
- **The "extra update"** is called only by the client module while it draws the view, between the tick loop and `S_Update` (the engine's callers read; six calls in the owner's `client.dll` read by a search). None falls between the packets and the ticks (inferred). It acts only when 90 ms have passed since the last pull of either kind (read), so at a steady rate only at 11.1 frames a second and under.
- **With `sv_cheats` 0 the game sets `fps_max` back to 30** when it is set under 30 (read, `0x18020e44d` to `0x18020e490`). No log exists under 66 frames a second.

*Added 2026-11-14 (W3-23a, `docs/work-orders/W3-23-low-frame-rates.md`).* A render on the game's voice queue now runs a frame's steps as read above, under 1000/15 frames a second (`voice-channel.js`, `createTimeline`, its frame clock). Each standing:

- **Frames.** Frame k is at (88200 k) / fps half samples at 44.1 kHz, with one frame rate for the whole render (chosen, as the wait already is). The clock runs when a frame is longer than a tick, 88200 / fps > 1323: under 1000/15 (computed). At 66.67 and above nothing changed, to the last sample (measured: every recorded hash of every suite is as it was).
- **A frame's steps.** The messages whose arrival tick a has 1323 a ≤ F(k) are added, in the order given (read: packets at the head of the frame's first tick); every tick i with 1323 i ≤ F(k) runs its pass (read: the whole ticks in the frame time gathered so far); every block b with 1024 b ≤ F(k) is pulled (read: the mixer after the tick loop). The three run at one instant in the model; in the game the paint comes later in the frame by the time drawing takes (inferred, W3-23r; not modelled).
- **What follows from the order** (inferred from read; the model's): a message added in a frame of several ticks gets every one of them, those numbered below its own included, so its wait counts from the frame's first tick. At 30 frames a second, where nine frames run 20 ticks (seven with two, two with three: arithmetic), a channel with a wait of 3 plays in its packet's frame exactly when that frame has three ticks; at 10 a channel with its wait of 1 plays from the first block of its packet's frame (measured on the build, `tests/voice-channel.verify.mjs`, checks 3 and 4).
- **The pulls' count.** The blocks the mixer keeps queued (10 to 13 under 66.67 frames a second, finding 30's added lines) are a fixed lead at a steady rate and delay every sound alike (inferred from read). *Corrected in W3-23a's fix round (2026-11-14): that holds for a lead of whole blocks. The read paints block b at the first frame with 512 b ≤ A + played, where A = (0.1 + frame) × 44100 samples is not whole blocks; the model's step takes A mod 512 = 0, the plainest case. The block's phase against the frames is chosen, beside the phase of the ticks against the frames (the relay tick, finding 9's added lines); in the game it is free.* The model does not hold that lead: its blocks are painted when their time comes, and the zero D is as before (the orchestrator's ruling 3). The "extra update" changes no sample of the model (inferred from read, W3-23r) and is not modelled.
- **At 66.67 and above** the pulls stay one block every 512 samples (chosen, to keep every recorded figure). The game paints once a frame at every rate (read), so below about 86 frames a second, where a frame outlasts a block (arithmetic), its pulls come in bursts there too.
- **Not for the live monitor** until W3-23b (not built yet): a timeline with no end keeps even ticks and blocks at every rate. *Corrected 2026-11-14 (W3-23b): built. A timeline with no end has the frame clock under 1000/15 as a whole length has it; the line below has the live chain's hold.*

*Added 2026-11-14 (W3-23b, `docs/work-orders/W3-23-low-frame-rates.md`, "W3-23b" and the plan review's edit 11).* The live monitor's chain on the queue under 1000/15 frames a second, each standing:

- **What is final.** Advanced to a tick t, a timeline on the frame clock has run the blocks of every frame before 1323 t half samples, so it lacks at most the blocks that start in the open stretch between the last such frame and 1323 t, which is no longer than a frame: at most ceil(88200 / (1024 × fps)) blocks (arithmetic). At a tick where that stretch holds that many starts it lacks exactly that many (measured on the build at 60, 30, 20 and 10 frames a second).
- **The hold.** So the chain holds back D and that many blocks of 512 samples more at its mix point: 2 at 60 and 50 frames a second, 3 at 40 and 30, 5 at 20, 9 at 10 (arithmetic), 23, 35, 58 and 104 ms at 44.1 kHz. At 1000/15 and above it is D, as before. Its delay rises by the same.
- **One block less.** On silence at jitter 0 a hold one block shorter runs short at 60 and 50 frames a second (the margin falls to 510 and 511 samples, under a block, at 1.20 and 0.42 s; measured on the build). Under 33.3 frames a second the chain never needs the last of the blocks, whatever the input (arithmetic, the review of W3-23b): it advances the timeline to `at(bound)`, and the rule's look puts that past the bound, so at most 2, 4 and 8 blocks are unrun at 30, 20 and 10 against the hold's 3, 5 and 9. On silence at jitter 0 the least margin in 20 s there is 892, 1,327 and 1,183 samples (measured on the build). The hold is kept at the bound, which does not depend on jitter (W3-02c-3's rule); that one block, 11.6 ms, is its cost under 33.3.
- **What the chain gives.** At its mix point it gives `createRender`'s samples on the queue held back by that hold, at 60, 30 and 10 frames a second, at jitter 0 and 50, with loss and at any plan of blocks (measured on the build, `tests/render-channel.verify.mjs` section 10).

What a listener gets, on the model (measured on the build's timeline and on `main` 91d37c6's with one script, `docs/reports/W3-23a-frame-clock.md`: Steam's sender on a signal of 1000 and 0, each message on its tick by the side's arrival at jitter 0, D taken out; no recording). On the voice-channel suite's layouts P and Q, seeds 1 to 50, an opened spurt's offset at 0.2 s into it, the channel's opens a run and the share of playing blocks pulled with under 100 ms queued, `main` then the build:

| Frames a second | Offset, `main`: mean (least to most), ms | The build | Opens a run | Blocks under 100 ms |
| ---: | --- | --- | --- | --- |
| 60 | −6.3 (−41.6 to +26.2) | −18.2 (−60.6 to +19.0) | 2.52 and 2.52 | 2.6% and 2.7% |
| 50 | +1.1 (−37.4 to +37.8) | −11.3 (−49.0 to +23.6) | 2.52 and 2.52 | 2.7% and 2.9% |
| 40 | −2.4 (−41.6 to +30.6) | −23.0 (−76.4 to +18.0) | 2.52 and 2.56 | 3.0% and 5.2% |
| 30 | −5.6 (−41.6 to +26.2) | −7.7 (−83.8 to +31.4) | 2.54 and 2.52 | 3.9% and 6.8% |
| 20 | +2.8 (−30.0 to +37.8) | −18.5 (−72.2 to +26.2) | 2.56 and 2.54 | 7.2% and 19.6% |
| 10 | +0.3 (−37.4 to +37.4) | −19.2 (−99.0 to +31.4) | 2.62 and 2.53 | 15.1% and 19.9% |

Nothing was dropped to overflow at these rates on either side. At 66.67 and 300 the two sides are equal in every figure. So a render under 66.67 frames a second sits early against its source by the build's mean above, 8 to 23 ms, where `main`'s sat within 7 ms of it (ruling 3: D is left as it is; a term for it waits for a take at a low frame rate).

On a minute of talk (phrases of 0.3 to 3 s with pauses of 0.2 to 1.5 s) and of unbroken sound, seeds 1 to 10, the level lost over the playing samples, −10 log10 of the mean of (output / input)², and the share of playing samples more than 3 dB down, `main` then the build:

| Frames a second | Talk: level lost | Talk: more than 3 dB down | Talk: opens a run | Unbroken: level lost | Unbroken: more than 3 dB down |
| ---: | --- | --- | --- | --- | --- |
| 60 | 0.12 and 0.12 dB | 2.6% and 2.7% | 14.8 and 14.8 | 0.01 and 0.01 dB | 0.1% and 0.1% |
| 50 | 0.12 and 0.13 dB | 2.7% and 2.8% | 14.9 and 14.9 | 0.01 and 0.01 dB | 0.1% and 0.1% |
| 40 | 0.13 and 0.17 dB | 2.7% and 3.1% | 15.2 and 15.2 | 0.01 and 0.05 dB | 0.1% and 0.4% |
| 30 | 0.14 and 0.22 dB | 2.8% and 3.9% | 15.4 and 15.4 | 0.06 and 0.12 dB | 0.3% and 1.3% |
| 20 | 0.18 and 0.48 dB | 3.0% and 8.4% | 15.9 and 15.4 | 0.19 and 0.50 dB | 1.6% and 7.6% |
| 10 | 0.32 and 0.78 dB | 4.4% and 15.9% | 16.3 and 14.8 | 0.49 and 0.43 dB | 6.2% and 8.2% |

At 60 and 50 frames a second the level moves by at most 0.01 dB. At 40 and under it dips more (unbroken sound at 10 aside: 0.43 against 0.49 dB), because the last block of a frame's burst is pulled with less behind it and the queue's last 100 ms are faded (the fade above). The planner's prototype, a reading of its own with another measure of the level, gave the same order of sizes (`docs/reports/W3-23-plan.md`: talk 0.15 against 0.22 dB at 30, 0.21 against 0.55 at 20, 0.36 against 0.69 at 10); its figures are the prototype's. No log under 66 frames a second exists to set against any of it (finding 23).

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

*Added 2026-11-14 (W3-23a).* By the same rule the wait is 3 ticks at 30 frames a second, 2 at 20 and 1 at 10 (arithmetic on the read rule; nothing under 66 frames a second is logged). Under 1000/15 a render counts it from the first tick of the frame that takes the packet (finding 22's added lines), so at 10 frames a second a new phrase plays from the first block of its packet's frame. With `sv_cheats` 0 the game sets `fps_max` back to 30 when it is set under 30 (read, W3-23r): a log at 20 needs `sv_cheats 1`, and a player's game runs under 30 only on a machine that cannot draw faster.

*Added 2026-11-15 (Set Q, measured): on a real server the wait at an opening is 30 tick lines at 294 frames a second (29 or 30 from the log alone) and exactly 7 at `fps_max 67`, ten times.*

### 24. One sample is dropped from every packet

The engine copies a decoded packet into the ring through an interpolator that writes one sample fewer than it was given: the packet's first sample is in effect left out (read, W3-03). The engines of Source SDK Base 2006 and 2007 have the same rule, at a step of exactly 1.0: read, and run, where ten packets of 360 samples put 3,590 samples in the buffer (added 2026-11-11, W3-20b). In the logs every packet of N samples that neither overflows nor meets a pull raises the queue by exactly 2 × (N − 1) bytes (measured, Set G; a replay that keeps the sample fails).

Steam hands voice out in about 17.8 packets a second (finding 25), so playback gains about 0.04% on the sender: 17.8 / 44100 is 403 ppm. This is the "clock" of the accuracy suite, 404 to 406 ppm on most takes. It is not a recorder's clock, and it follows the packet rate: the one take at 505 ppm had 22.3 packets a second. The playback does not get shorter: the mixer plays in real time and the queue gets shallower.

*Corrected by RP-01a (2026-11-13): that take's clock is +510 parts in a million in the accuracy suite's reading (measured; `take3_voice_maxgain_1` in the table of `docs/ACCURACY.md`). 22.3 packets a second over 44,100 samples a second is 506 (computed). The 505 above is that figure or an earlier reading of the take (inferred; the record does not say which).*

*Added 2026-11-14 (AC-01): the 403 ppm above is the suite's reading when it rendered every take on the file's own timing. Since AC-01 it renders Steam voice on the game's voice queue, as the page does by default, where the dropped sample of every packet and the queue's skips are in the render too, so its clock reads near 0 (the orchestrator's private run of 2026-11-14, measured: `docs/ACCURACY.md`, "Every take on the game's voice queue").*

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
- **The integer mean and the zero-block rule are both needed.** Without the first 2,798 of the 291,840 samples differ, and without the second 234 (re-run 2026-11-10; counted over the whole file with its last packet, which differs between the two key presses in 511 samples, the same runs give 3,309 and 745).
- **The divisor** 127 or 128 makes no difference on that signal, so the 127 rests on the reading alone.
- **The app's earlier rule** differed on 3,032 of those samples. Since W3-05 (2026-11-10) the app runs this rule and gives 0 of 291,840.
- **What that recording cannot see was read again** (a second read of the gain function, 2026-11-10; `docs/reports/W3-05-receiver-gain.md`). Read: every float operation is single precision, one at a time, with no fused multiply-add and no double (the block's `current`, then `fixed` by truncation, the mean by integer division, `peak - mean` in integers, the multiply by `voice_avggain` and a separate add of the mean, 32767 divided by that with no test for zero, the cap, the multiply by `voice_scale`, and the step as subtract, divide by 127, multiply by 128, truncate). The per-sample product of gain and sample is a 32-bit multiply that keeps its low 32 bits: it wraps, where a wider product would clamp, once `voice_maxgain` times `voice_scale` squared passes about 512 on a loud sample (not at the defaults). The reset writes unity for the first 128 samples whatever `voice_scale` is, and the three settings are read only at a reset, so a change takes effect when a channel is next assigned. Inferred: round-to-nearest as the thread's rounding mode (no voice code changes it; the exact match supports it).
- *Corrected by S3-02a (2026-11-12): since `audio.js` was split, the function is in `engine/gain.js`; nothing else in this entry changed.* **The app's gain.** One function in `audio.js` serves the file render, the stream, the live chain and `TF2Audio.createGain`, the object the voice channel takes. It is the rule above, the wrap included. What differs from the game is what the gain is fed and when it is reset:
  - **The `steam` render, since W3-11a, and the `steam` live chain, since W3-11b:** the gain is fed the decoded packets in order, as the game's is. Its 128-sample blocks run on across packets, and a silence record's zeros are fed too, so the gain goes to the cap after each spurt. A late frame played as silence is left out. The gain is still reset once only, at the render's start (the live chain's, when the chain is made); the reset at each channel comes with W3-02c.
  - *Corrected by W3-19 (2026-11-11): on `celt_22`, `celt_44`, `speex` and `miles` (not in TF2) the gain runs on the decoder's stream from its first sample, and the codec's delay is dropped after it; the bullet below holds for `steam_48` (not in TF2) only. See finding 31.* **The other paths** (`steam_48` and the engine codecs, rendered or live): the gain runs on the source's timeline, and an all-zero block that the gate did not send holds the gain. This was the rule for every path until W3-11a, and this finding said so. The live chain's gain is reset when the chain is made, and a settings change makes a new chain (the app's own).
  - At the default cap both leave the gain at the cap when a spurt's sound rises.
- **Corrected 2026-11-10 (W3-11b).** The list above named the live chain among "the other paths". Since W3-11b the `steam` live chain feeds the gain as the render does.
- **Set H ran `vaudio_celt`.** The same function serves Steam voice at 44.1 kHz (read), where no sample-exact check exists yet. Set J does not give one: it was made at `voice_maxgain 1`, where the gain is exactly unity.

**Set D** agrees on the zero-block rule (measured, W3-03). At a burst after a pause inside a spurt, at an appended spurt and at a restarted one, recording A is 8 to 12 times the decoded level from the first 1.3 ms step in which the decoded sound rises. So the gain is at its cap at every loud onset.

### 27. The game's and Steam's debug variables

Read from the engine (W3-03) and used for Sets G and H:
- **`voice_showincoming 1` and `voice_showchannels 1`** print the receiver's queue: one line per packet with its decoded sample count, and one line per channel per 15 ms tick with the queued bytes. They need no `developer` setting. While a channel plays, the queue falls by 15.04 ms a line on average (measured, Set G).
- **`voice_recordtofile 1`** writes `voice_decompressed.wav` for each key press: whole packets after the gain, 16-bit mono at the voice rate, at most 1 MiB (11.9 s at 44.1 kHz). With `voice_maxgain 1` and `voice_scale 1` it is the decoder's output.
- **`voice_micdata.wav`** is not filled under the Steam codec (measured: only its start holds sound).
- **`voice_inputfromfile 1`** is not read under the Steam codec. Under the engine codecs it is: a 16-bit mono file at the codec's rate with a plain 44-byte header. The reader skips the first two samples of sound (read and shown on Set H, W3-08, which corrects W3-03's offset).
- **`voice_writevoices 1`** keeps each channel's voice with no length limit (read; not tried).

Read from Steam's client (W3-09), and two of the three used for Set J (W3-14):
- **`mic_inputfile`** plays a 24 kHz mono file to Steam's encoder in place of the microphone. It works from the release client's console (Set J). The file loops, and its position carries on from one key press to the next. A file with a plain 44-byte header starts at its first sample (read, W3-09; the chunk lines fit that on 788 of 789 lines).
- **`@voice_spew_activity_check 1`** prints one line per chunk in Steam's console (Set J): three marks (active, mean passed, peak passed), the chunk's length in milliseconds, the mean of |x| as a percentage of 32767, the peak as a percentage of 32768, and the count of samples at or above 4915.
- **`mic_outputfile`** writes what Steam captured. Not tried.

**Corrected 2026-11-10 (W3-14).** This finding said the three were "not yet tried by the owner" and that whether the release client lets them be set "was not tested". Set J settled both for the first two. W3-09's report gave the printed peak as a fraction of full scale. It is a percentage of 32768: 28.143 is printed where 32767 would give 28.144.

*Corrected by Set K (2026-11-10): the owner has since used these; Set K was recorded with the readings, `adsp_debug 2` and `dsp_slow_cpu`. See finding 32.* For the room (finding 32), read from the engine and not yet tried by the owner (W3-15, W3-18): typing `dsp_room`, `dsp_automatic`, `dsp_slow_cpu`, `dsp_volume` or one of the four mix variables prints its value, with no cheats. `adsp_debug 2` with `developer 1` prints each automatic room the engine builds and the shape's name.

### 28. Steam's sender, read from the client: chunks, a level rule, 100 ms kept, a 0.4 s hold

Read from the owner's Steam client and Valve's public copy of it (W3-09: the same constants in both), then checked against Set G's logs and Set D's demo. The hold and the clock were read again, to the operation (W3-16 read), and the whole rule was checked on Set J, where every chunk is known (W3-14).

- **Chunks.** Each time its voice code runs, Steam takes whatever the capture gained since the last time (read). On the owner's PC that is whole steps of 750 samples at 24 kHz (31.25 ms), about every 55.85 ms (measured). All 1,797 voice packets of the demo and all but 39 of Set G's 2,326 fit chunks of one, two or three steps (demo: 23.4%, 74.8%, 1.8%; Set G: 23.6%, 74.0%, 2.3%). Where the 31.25 ms step comes from was not read. If more than 6000 samples wait, a microphone's read takes the newest 6000 and skips the rest (read, W3-16).
- **Steam reads every 48 to 64 ms** (measured, Set J: 723 intervals rebuilt from the chunk lengths, mean 55.4 ms, nearly flat, none over 64.2 ms, almost no memory from one to the next). 63% of the reads fall in a 4.5 ms window of the game's 15 ms tick, where chance gives 30%; why was not read. A microphone's chunk shares and pairs follow from such reads if each capture step is ready up to 13 ms after its time (fitted to the demo's 1,797 chunks in W3-16's order: 23.3 / 74.6 / 2.1% modelled against 23.3 / 75.0 / 1.7% as that order counts them).
- **With a file as the microphone** a chunk is the time since the last read times 24000, truncated, at most 6000 samples (read, W3-16). The time of the last read is kept as a 32-bit float. In Set J that float moved in steps of 1/8 s, so the printed lengths ran from 0.04 to 125 ms though the reads came 48 to 64 ms apart, and 41 reads brought nothing (measured, W3-14).
- **The gate** is on a chunk, not a 20 ms frame: open when the mean of |x| is at least 1.0% of full scale, or any sample reaches 15% (read). Nothing in the client sets those two numbers, so the threshold in Steam's settings is not this gate (inferred). No filter, gain or noise suppression runs before it (read). Against the demo's decoded chunks, the rule marks the last active chunk 7 or 8 chunks before the end marker in 18 of 20 spurts.
- **The gate, checked chunk by chunk** (measured, Set J). Steam printed each chunk's length, mean, peak and verdict. All 789 verdicts follow "mean of |x| at least 1.0% of 32767, or a sample at least 4915". The highest mean that failed is 0.9998% and the lowest that passed 1.0315%. A 1 kHz sine at −38 dBFS stays shut in every loop, one at −35 dBFS opens, and a 1.5 ms burst at 0.2 of full scale opens by its peak alone, four times of four. One line does not fit: a chunk of one sample, printed with a mean of 0.00. The rule's messages equal the game's log line for line (645 lines).
- **The pre-roll** is the last 2400 samples (100 ms) of the silent chunks before the onset, zeros if there were none, sent in front of the chunk that opened the gate (read). That makes the 8-frame opening of finding 25. Straight after a spurt the pre-roll is shorter: 1500 and 750 samples in two of the demo's spurts. In Set J the pre-roll's sound matches the recording sample for sample (measured).
- **The hold** is 0.4 s on Steam's clock, in 32-bit floats (read, W3-16 read). The time is narrowed to a float once per frame, before the microphone is read. The read of each active chunk notes that float. The first chunk at whose read `now > noted + 0.4` is the last: the sum is rounded to a float, the 0.4 is the float nearest 0.4, and equal is not enough. The test also runs in the read that first finds a chunk inactive, and on a read that brings no samples. The last chunk's final frame is padded with zeros, the end marker follows, the encoder is reset and the sequence number returns to 0. The next chunk goes out as its length only: the silence record. After a read that brought nothing there is no record (read; seen in 2 of Set J's 12 spurt ends).
- **So the hold's real length depends on how long the sender's Steam has run.** The clock is seconds since Steam's process loaded Valve's timer library (read in the public build of that library; that the process is Steam's own, and that the owner's copy is the same, are inferred). A float of that size moves in steps, and the hold comes out as whole steps (plain float arithmetic on the rule as read):

  | Steam has run | Float's step | Where the hold runs out, from the read of the last active chunk |
  | --- | --- | --- |
  | under 18 hours | 4 ms or less | 398 to 402 ms |
  | 18 to 36 hours | 1/128 s | 398 to 406 ms |
  | 1.5 to 3.0 days | 1/64 s | 406 to 422 ms |
  | 3.0 to 6.1 days | 1/32 s | 406 to 437 ms |
  | 6.1 to 12.1 days | 1/16 s | 375 to 437 ms |
  | 12.1 to 24.3 days | 1/8 s | 375 to 500 ms |
  | 24.3 to 48.5 days | 1/4 s | 500 to 750 ms |

  Where in a row's range it falls depends on where the last active read lay on the float's grid. The spurt's last chunk is the first one read past that point, so up to 64 ms later.
- **Measured at a step of 1/8 s** (Set J, W3-14): every one of 12 spurts ended at the first read four steps (0.5 s) after the read of the last active chunk, and no earlier read reached four. In real time that was 389 to 514 ms. So that Steam had run for 12 to 24 days (inferred). Counting reads that brought samples, the last chunk was the 7th four times, the 8th five times and the 9th three times.
- **Set D's Steam** is not known. With the test signal as the microphone, the demo's 19 clear ends fall on the 7th chunk after the last active one 7 times, on the 8th 12 times and never on the 9th. Simulated with the hold as read, that fits a Steam under 1.5 days old or one of 6.1 to 12.1 days, the second a little better, and no other age (W3-16's order). **Corrected 2026-11-10** (W3-16's second read): tested on the demo's own chunk sequence, a Steam of 6.1 to 12.1 days is about 200 times likelier than one under 1.5 days, and the ends' dependence on whether the last active chunk fell on an even or odd capture step shows a float step of two capture steps, which is that range. The owner recalls Steam having run "at least a day or more". The remaining difference of about 10 ms in the mean tail is within one recording's scatter (9.4 ms over seeds).
- **Why pauses come out longer.** Steam counts the hold from the last active chunk, which can end up to 62.5 ms after the last loud 20 ms frame. That is one reason the takes' pauses on speech are about 50 ms longer than the app's frame gate gives (measured, W3-01; the reason is inferred, W3-09).
- **One chunk is one message.** Frames of 480 samples are cut from the chunk plus what the last one left over (read). So a 1500-sample chunk gives 3 frames and now and then 4, and a 750-sample one 1 or 2. With the chunk shares above that predicts 65, 13, 10 and 10% of 60, 40, 80 and 20 ms packets, against the logged 65, 14, 11 and 10%, with nothing fitted.
- **One chunk, one message, on every message of Set J** (measured). A chunk that leaves fewer than 480 samples in hand sends nothing. The first packet of each clip is 12 frames: the 6000-sample first chunk with no pre-roll, since the sender was not in its silent state at the key press.
- **The key.** Steam goes on capturing for 0.5 s after the key is released (read). There are two tails (read, W3-16 read): the game is fed for an exact 0.5 s, and the capture and the gate run for 0.5 s on the float clock, so up to one float step longer. A spurt that ends in that last step makes a packet the game never collects (inferred). A spurt still open after the tail gets no end marker. At the next key press, a first read with no samples sends the marker alone: the empty packet of finding 25 (read: the hold is tested on an empty read).
- **A key press** resets the encoder and drops the kept samples, but not the gate's state or the sequence number (measured twice, Set J). There the first read of a press brought 6000 active samples, so the open spurt went on with no marker and no empty packet. A tap of the key was followed by nine more reads over 525 ms.
- **The queue.** Steam keeps at most 8192 bytes of voice for the game to collect (about 2 s) and drops the oldest beyond that (read).
- **The encoder** is libopus 1.1.x. The public Linux build of the client carries the string `libopus 1.1.4`; the Windows build is inferred to be the same. Its settings, read: 24000 Hz, mono, VOIP, then bit rate 32000, signal voice and DTX, and nothing else. So complexity is the library's default, 9, and VBR is constrained. It is fed 16-bit samples. The pinned 1.1.5 gives identical packets at complexity 8, 9 and 10 (reproduced: 19,428 frames).
- **The capture** is opened through DirectSound at 24 kHz, mono, 16-bit (read). So the conversion from the device's rate is done by Windows or the virtual cable, not by Steam.

**Corrected 2026-11-10 (W3-16 read, W3-14).**
- The hold's bullet said "0.4 s of Steam's clock after the last active chunk was read (read). The first chunk read later is the last". The constant and the place it is counted from stand. The arithmetic is new: it is done in floats, so the hold is not an exact 0.4 s.
- A bullet "The clock" said: "the hold is measured on a 32-bit float of seconds. On a Steam that has run for days it moves in steps of 16 to 31 ms (read; that it counts from Steam's start is assumed, and its effect was not measured)". The start is now read, the effect is measured (Set J), and the steps matter from a day and a half on. The two bullets on the hold's real length replace it.
- The hold's bullet said "In the demo the last chunk is the 7th after the last active one in 9 spurts and the 8th in 9". That was counted on the demo's decoded sound, whose quiet chunks do not always pass the gate as the microphone's did. With the test signal itself as the microphone it is 7 and 12 of 19 (W3-16's order).
- W3-14 first read Set D's ends as a float step of 1/32 s. That rested on the other form of the test, "now less noted, over 0.4". The code has `now > noted + 0.4`, and at 1/32 s the two differ by a step (W3-16 read). W3-14's reading is not used.
- The key's bullet said of a spurt left open: "the next key press sends the marker alone". That holds when the press's first read is empty. In Set J it was not, and the spurt went on.

**Corrected 2026-11-10 (W3-16).** The paragraph below said three things in the app's sender were known to be wrong, and that W3-16 was planned and not built: "The hold is an exact 0.4 s, in doubles"; "The clock is the old one: reads tied to a 15.625 ms timer, 46.9 or 62.5 ms apart, with 6% of them late by up to 30 ms"; "A read that brings nothing does nothing, where Steam still tests the hold". W3-16 built all three as this finding reads them.

**The app today.** Since W3-11a a render of the `steam` profile sends with this rule: the sender built by W3-02b, with the render's seed, the 16-bit capture, chunks, the mean-or-peak gate, the pre-roll, the hold, one message per chunk and the end marker (finding 12). Since W3-16:
- **The hold is the one read.** Each read's time is seconds since the sender's Steam started, narrowed to a 32-bit float; an active chunk notes it; the spurt's last chunk is the first one read with `now > noted + 0.4`, the sum rounded to a float, the 0.4 the float nearest it, strictly greater. It is tested on the read that first finds a chunk inactive, and on a read that brings nothing. Such a read in the ended state makes the state silent, so no silence record follows.
- **How long the sender's Steam has run** is a setting: 9 days unless a render says otherwise (a float step of 1/16 s: the middle of 6.1 to 12.1 days, the one range that Set D's ends, tested on the demo's own chunks, leave; W3-16 second read), and the page's "Sender's Steam has been running" offers since today (4 hours), a few days, about a week, about two weeks and about a month.
- **The reads are Set J's**: 48.0 to 63.7 ms apart, uniform, never late, with each 750-sample capture step ready up to 13 ms after its time and a seeded phase on the float's grid. Over 300,000 reads that gives chunks of 750, 1500 and 2250 samples 23.3, 74.65 and 2.06% of the time, 17.90 reads a second, and spurt ends on the 7th, 8th and 9th chunk after the last active one 26.5, 70.8 and 2.8% of the time at 9 days (W3-16's report). A read before the first capture step is ready brings nothing; after the first chunk none does.

Driven by the demo's own chunk lengths, W3-11a's sender put 18 of 20 spurt starts within one chunk of Steam's and 18 of 20 ends within two; with the test signal as the microphone, 16 spurts were Steam's message for message (reproduced privately; `docs/PROGRESS.json`, `sender_demo`). W3-16's sender against the demo is a private run of that order. Two things stay unsettled: which age Set D's Steam had, and about 10 ms of the demo's tails (below, "What remains unverified").

Since W3-11b the live chain for `steam` runs this sender too, timed on the samples given to it, with the key held from the monitor's start to its stop. With push-to-talk on it runs the app's own stand-in, not Steam's key rules: while the key is up the microphone is replaced by zeros, so the gate ends a spurt by its own hold and nothing captured with the key up is sent. Steam's key rules (sending on for half a second after a release, the reset at a press, the empty packet) are W3-11c.

**Corrected 2026-11-10 (W3-11b).** This paragraph said "The live chain still runs the frame gate of finding 12 until W3-11b, which also takes the key-press rules." W3-11b put the live chain on the sender; the key-press rules went to W3-11c.

**The capture's phase against the sound (W3-21, 2026-11-13).** Steam's capture runs free of whatever is played into it (inferred). What was read is that Steam's code rounds nothing to steps and takes whatever the read position gained since the last read; how that position moves is inferred (`docs/reports/W3-16-second-read.md`); one phase through a whole session is measured on Set D alone. Until W3-21 the sender cut its steps from the render's first sample, so in a render every edge of a test signal on a multiple of 31.25 ms fell on a step's edge, which in a real session happens only by chance.
- **Measured against the packets of Set D's session** (private; numbers only): at the eight 1 s bursts before the signal's 440 ms pauses Steam sent 79.63 frames a phrase in the mean, and the gap from a phrase's last sound packet to the next phrase's first was 37.5 ticks. The sender as built before W3-21 gave 78.45 frames and 39.67 ticks; with the source moved 318 samples against its steps it gave 79.82 and 37.86 (measured on the model).
- **What those two means show, and what they do not.** They show a phase other than zero. They cannot tell 318 samples from its mirror or from a uniform draw: in the order's second read, a lead of 318 gave 79.903 frames and 37.810 ticks, a lead of 432 gave 79.903 and 37.788, and the seeded draw 79.871 and 37.833, against the demo's 79.63 and 37.5 (measured on the model by the second reader; not run again here). The value 318 and its side rest on the spurts' start offset alone: ten of the demo's spurts start at one offset of 126 samples from the signal's marks (inferred from that offset).
- **The rule since W3-21.** The clock's capture draw `c0`, 0 to 31.25 ms, is the clock's own uniform draw (chosen; W3-16 fitted only the 13 ms of lateness). It sets `lead = (750 - round(c0 x 24000)) mod 750`. That tie is chosen too: nothing read or measured ties the capture's phase to the clock's first read; `c0` is a source of one uniform number that draws nothing new. The sender reads `lead` zeros before the source's first sample, so the steps' edges lie `c0` after the multiples of 31.25 ms of the source. The reads' times counted from the render's start, which set the ticks, are less `lead / 24000` s, so a step is still ready `c0` plus its lateness after its last sample. Steam's own clock, which sets the hold's float grid, is not shifted. Positions are in samples of the source. The clock draws what it drew before; a caller's clock has a lead of 0 unless it is given one.
- **One phase a render.** A real phase is set when the capture device starts at a key press (read, W3-09: at a key press after the capture has fully stopped, the capture device is started), so one uniform phase a render is the model of a held key or an open microphone. A phase drawn again at each press is not built yet.
- **The gate off.** A render with the gate off now sends up to 31 ms more zeros before the source (the lead's). That is a convention of the app's own setting, not something read of Steam.
- **On the model** (measured, `tests/steam-sender.verify.mjs`): a tone burst of exactly 1 s on the 31.25 ms grid after 2 s of silence covers 33 steps in 199 of 200 seeds, 32 in every seed with a lead of 0, and its spurt sends 80.04 frames in the mean against 78.50.
- **The arrival time of a spurt's opening packet** (50.5 ms, `ARRIVAL_SECONDS` in `voice-channel.js`) was not changed. Its measurement moved: in `tests/voice-channel.verify.mjs` (seeds 1 to 50) it gives +0.02 ms with a lead of 0 and -0.30 ms with the lead, against a standard error of about 0.65 ms by spurt (measured). Paired by seed, the lead lowers it by about 0.3 to 0.75 ms in each of four blocks of seeds from 1 to 400 (measured; not explained); on seeds 1 to 50 by -0.325 ms with a standard error of 0.580 by seed (measured).
- **A likely cause, from the order's second reader** (inferred, not run by that reader): at the suite's level of 1000 a chunk off the 31.25 ms grid that ends in a part step can fail the gate; the gate then opens a chunk later, and the opening's length changes. It predicts opening shares of 0.170, 0.791 and 0.039 for 6, 8 and 9 frames where 0.165, 0.790 and 0.045 were measured. A run in this order's fix round does not show it: the paired shift over seeds 1 to 200 is -0.35 ms (standard error 0.37 by seed) at 300 fps and -0.91 ms (0.39) at 66.67 fps at the suite's level, and -0.62 ms (0.33) and -0.32 ms (0.35) with the signal at 6000, above the peak rule's 4915, where a part step of sound always opens the gate (measured on the model). The shift does not vanish there.
- **The constant itself was fitted on seeds 1 to 50.** On seeds 1 to 200, 51 to 200 and 201 to 400 the same mean lies between +0.4 and +3.6 ms, with a lead of 0 and with the lead alike (measured 2026-11-13; standard errors of 0.33 to 0.38 ms by spurt, and the spurts of one seed are not independent). Measuring it again over many seeds is an order of its own (not built yet).
- **The side of the 318 samples** (measured 2026-11-13 on Set D's session, private; numbers only). In the investigation's comparison the source starts 318 samples later against the capture's steps, which is the side W3-21 builds (the lead's zeros come before the source). With it, the sender alone starts the eight phrases before the 440 ms pauses 24.5 ms before or 6.7 ms after the gate model's start, in 800 runs (median 6.7, lower quartile -24.5); the demo's eight phrases start at those same two values, five at -24.5 and three at 6.7. The demo's last chunks end 15.5 ms after, 15.7 ms before or 46.8 ms after the gate model's end; the model's quartiles are 15.5, 15.5 and 46.8. So the side is the demo's, not its mirror's.
- **Against the takes, before and after W3-21** (measured 2026-11-13, private; numbers only). One script rendered each take's source with `timeline: 'game'` at 300 frames a second and Steam's own threshold, at the sender's seeds 1 to 30, on main before the merge and after it, and counted at each change between phrases the seeds in which the render has the take's kind of change (early, late or kept, by the 80 ms rule of `tests/retiming.mjs`). This count is not the score of `tests/retiming.mjs --engine` that `docs/ACCURACY.md` gives.

  | Take | Changes between phrases | Seeds with the take's kind, before | After | Every change right, before | After |
  | --- | ---: | ---: | ---: | ---: | ---: |
  | `net_baseline` (pauses of 240 ms) | 12 | 291 of 360 | 327 of 360 | 15 of 30 seeds | 21 of 30 |
  | `sender_A` (Set D; pauses of 420 and 440 ms among others) | 16 | 282 of 480 | 290 of 480 | 0 | 1 |
  | the speech take | 9 | 155 of 270 | 155 of 270 | 0 | 0 |

  At the ten changes of `sender_A` around its 420 and 440 ms pauses the counts by change are 2, 2, 8, 8, 23, 6, 6, 22, 15 and 15 of 30 before and 14, 14, 8, 8, 15, 13, 13, 11, 9 and 9 after: 107 of 300 against 114. With the source held at the demo's own 318 samples on the earlier sender the same ten gave 121 of 300 (measured in the investigation). So the capture's phase moves which of those changes a render gets right and closes little of the gap there: after a pause of 420 to 440 ms the render still has the take's kind in about four seeds of ten. That is open (not explained). At pauses of 240 ms the render was already close and is closer.

*Added 2026-11-15 (Set Q, measured by the second reader): another PC's Steam client follows the same chunk rule. One starting remainder fits 2,366 packets in a row, and all 1,391 and 1,297 of the two later sections; the chance of that for one packet is 64%. Chunks of 1, 2 and 3 steps came at 27 to 28, 68 to 69 and 4%, against `createClock`'s 23.3, 74.7 and 2.0. Packets of 1 to 5 frames came at 12.3, 15.5, 59.5, 9.6 and 2.8%, against the module's 10.2, 13.1, 65.3, 10.0 and 1.4. **The 8-step (250 ms) pattern of chunk ends is there too:** one place in 8 holds 15.8, 16.1 and 15.7% of the chunk ends in the three parts, against 12.5% (3.4 to 4.9 standard deviations). `createClock` has none.*

*Added 2026-11-20 (the capture buffer, read once by the orchestrator in the owner's `steamclient64.dll`, file F4; not read a second time).*
- **The buffer is one second long** (read, `0x1380ded10`): the capture buffer is asked for with twice the sample rate in bytes, 48,000 at 24 kHz, 16-bit mono, and the length the device reports back is the one kept. One position notice is set, on the buffer's last byte, with an event that resets itself.
- **A read** (read, `0x1380dea90` and `0x1380dec80`) first looks at that event without waiting, and adds the buffer's length to a running base if it was set. It then asks for the buffer's read position (not its capture position), adds the base, and takes what lies between the last read's position and that, from the later of the two starts as finding 28 says. Both pieces of a stretch that crosses the buffer's end are copied, so a chunk is not cut there.
- **A read that falls after the position has wrapped and before the event is set brings nothing** (inferred from the arithmetic as read: the position is then behind the last read's, the length asked for is out of range and the lock fails; not seen in a log).
- **The 31.25 ms step is one 32nd of that buffer** (750 of 24,000 samples). Whether Windows moves the read position in 32nds of a buffer is not read: that code is not Steam's.
- **The 8-step pattern is not the buffer's wrap** (measured on Set Q, privately): a wrap comes every 32 steps, and the chunk ends at the pattern's place in 8 are spread over its four places in 32: 61, 51, 60 and 52 at 67 frames a second and 48, 50, 55 and 50 at 30, against 43.5 and 40.5 by chance. So the pattern is one of 250 ms, and its cause is still not read. What sets when the voice code runs was not followed: it is the frame function of the class the read names `CP2PVoiceSingleton`.

*Added later on 2026-11-20 (what times the read; a private reader, then a second reader who wrote its own reading and counts first. "Both" below means both saw it at the address or counted it. The second reader also agreed with every bullet of the paragraph above on the capture buffer.)*
- **The read runs once in each pass of the loop of Steam's pipe server thread, the thread that answers the game** (read, both: the think `0x1380d7250` is called at `0x138988e84` in the function at `0x1389886d0`, which the loop at `0x1388a1f8b` to `0x1388a2648` calls at `0x1388a23de`). The think has no interval of its own. A pass is skipped when Steam has no user signed in (read, second reader).
- **A pass lasts 50 ms unless something wakes the thread near its end** (read, both). The length is the constant 50,000 microseconds (`0x13898f4f0`). A pass does its work first, the read in it, then waits for the whole milliseconds left of start plus 50 ms, truncated (`0x1388a251b`). A wait that times out ends the pass. So does a wake that leaves the time at or past the deadline, or under 1 ms before it. The next deadline counts from the new pass's start.
- **What wakes it** is any pipe's event or a finished work item of Steam's own (read, second reader; the first reader had "a call from the game"). The game's call is one of them: the 64-bit engine fetches voice once for each tick it runs, in the client's part of the frame, only while it is recording (read, second reader, `0x1801a71a0` and `0x180058f3a`; that this call reaches the pipe the loop waits on is inferred).
- **So the next read comes at the first wake from 49 ms after the last one, or else when the wait times out.** That is where finding 28's "every 48 to 64 ms" and its reads on the game's tick come from. Measured again by both: Set J's 723 intervals run 47.75 to 64.13 ms, mean 55.44, and 64 to 67% of reads lie on the game's tick line; Set L's run with a file as the microphone gives 55.35 ms and 66.3% over 567 reads. The floor at 49 ms is sharp (measured), which rules out a timeout that fires early.
- **When a timeout ends is not settled.** The first reader's model puts it on Windows's 15.625 ms timer ticks (inferred). The second reader found no stretch of Set J or Set L that holds one such grid: the best grid holds 9 to 14% of the reads off the game's tick where the rule gives 99% (measured). Two additions fit Set J equally: 12 to 20 wakes a second that are not the game's, or a timeout that ends up to 15.6 ms late and on the grid half the time (fitted; the data cannot tell them apart). Steam asks Windows for a 1 ms timer in two places (read, second reader: a controller thread and the start of its networking). With that in force reads would come every 49 to 51 ms; no set shows it. Steam's own wait is in `tier0_s64.dll`, not read.
- **The 8-step pattern is not in Steam's code and runs on the capture's clock.** Nothing on the path has a quarter-second period (the first reader's search of the loop, the think, the gate and the read for constants; it sees immediates and floats only). Counted by both, the busiest place in 8 holds 16.1 and 15.7% of chunk ends in Set Q; new from the second reader, 15.3% in Set L's run with a real microphone (590 chunks, the owner's PC) and 15.4% in Set D's demo (1,757 chunks). The one-step chunks carry it: 40 to 46% of them end at that place or the next, where chance gives 25%. Two-step chunks dip at the place after, and three-step chunks almost never end at the two places after. The place does not drift (under about 8 parts in a million on Set Q's sender, 19 on the owner's), so the pattern keeps the capture's own time.
- **What fits it** (inferred): a capture step that can be read only from the next multiple of 10 ms on the capture's clock. Seven steps of eight then come 30 ms apart and one 40 ms, which gives 16.0% at one place and 12.0% at the others with nothing fitted. A 5 ms grid fits worse. A 10 ms stall every 250 ms cannot be told from it. The 10 ms and the 31.25 ms step are Windows's, not read.
- **The shares of one-, two- and three-step chunks do not pin the model's numbers** (second reader): the timer's phase against the capture is a hidden third number, and other pairs fit within a point, one of them with no grid at all.
- **The app's sender as built** gets the shares (21.8, 77.0 and 1.2% in the second reader's count) and misses the places: its busiest place holds 12.8% against 14.8 to 16.9, and 26 to 27% of its one-step chunks end at the two busiest places against 40 to 46. Not built: a sender on the rule as read. It waits for the Windows files (`dsound.dll`, the audio engine) and Steam's `tier0_s64.dll`, so that the grid and the timeout are read and not fitted.
- **A read that brings nothing after the buffer's wrap** (the paragraph above): what the caller does then is read (first reader, `0x1380d6118`): the gate goes from active to its hold, nothing is sent, and the next active chunk goes on with no pre-roll. Not found in any set: chunks of three or more steps favour no place in 32.
- **Set Q's chunk ends by place in 16** alternate in its 30 frames a second part and in the last chain of the first log (counted, both; chi-square 49.1 and 29.7). The cause is not proven; in the second reader's model only a timer grid on that sender's PC gives it.

### 29. Steam's decoder: 16 bits, at most 10 concealed frames, and FFmpeg's resampler once per packet

Read from Steam's client (W3-09), with the resampler run from its public source. Checked sample for sample on Set J (W3-14). The decoder's buffers were read afterwards (W3-16 read).

- **Per frame.** An end marker resets the decoder. A sequence number ahead of the expected one conceals the gap, at most 10 frames of it; one behind resets without concealing. A silence record becomes that many zeros.
- **16 bits.** Decoded sound is 16-bit. In libopus's public source the 16-bit decoder of a float build softens peaks past full scale before it rounds; whether Steam's build is a float build was not read. Set J fits a float build: Steam's samples equal the float decode rounded, but for one sample at a rounding boundary (inferred, finding 16). The softening itself is not shown: nothing in Set J decodes past full scale.
- **The resampler.** Each packet then goes, by itself, through FFmpeg's libswresample at its default settings (32 taps, 147 phases, a Kaiser window) from 24000 to 44100 Hz. The public library, called the same way, returns the logs' counts exactly: 7056 samples for 3840, 2646 for 1440, 882 for 480, and 2757 or 2756 for a silence record of 1500 (reproduced, W3-09).
- **Float inside.** For a rate change that library works in 32-bit float, not in 16-bit fixed point as W3-09 has it. On x86 the order of its sum is chosen by the processor's features. So two PCs can differ in the last bit of up to a few samples in ten thousand at full scale, and fewer at speech level: none or one in 55,000 at −24 dBFS (reproduced on the public library, W3-11 plan). On the owner's PC Steam's build runs the `fma3` kernel (measured, Set J, below); another PC's processor may choose another. Valve ships FFmpeg 8.1.2 and the library run here was 6.1.1; the public source of this path is the same in both.
- **Its response** (computed from the filter as the public source builds it): flat to 10 kHz, −0.7 dB at 11 kHz, −2.4 at 11.5, −4.0 at 11.75, −6.0 at 12 kHz. Just above 12 kHz it leaves a mirror of what lies just below: 6 dB down at 12 kHz, 12 dB at 12.5 kHz, 22 dB at 13 kHz, over 65 dB above 14 kHz.
- **A speaker's first packet** is finished by mirroring its last 16 input samples. They stay in the stream, so everything after is 16 input samples (0.67 ms) late. Once per speaker per session. Reproduced on the public library by the W3-11 plan and its review, which corrects W3-09's account of it. Seen in Set J, whose decoder was created at the run's first packet: phase 0, the start mirrored, the mirrored flush at the packet's end, and all 10,584 samples of that packet equal to the port's. Started as a carried stream instead, about 10,570 of them differ (measured, W3-14).
- **Checked sample for sample** (Set J; W3-14, reproduced). Given the decoded samples, the port under `fma3` equals the recording in every one of 524,288 samples once the one decoded sample of finding 16 is set one step up. Under `avx` 59 then differ, under `sse` 82 and under `c` 108, each by one step. With nothing changed the counts are 2, 61, 84 and 110.
- **The resampler outlives the game's channel.** A port of that path (order W3-13) equals the public library sample for sample under each processor kernel, and Set G's logged packet sizes through it give the logged count for every one of the 2,372 packets that are not empty, the 2756 and 2757 of the silence records in their order, when the four sections of one log are run as one stream. With each section run as a new stream one count differs. The player reconnected between those sections, so Steam's decoder kept its resampler's state across reconnects: it is not reset when the game assigns a channel anew (measured, Set G; 2026-11-10).
- **The decoder outlives key presses too** (measured, Set J). The gate clip's recording only fits when the decoder and the resampler carry on from the key presses before it, with no reset: run alone with a new decoder it differs in 44,012 of 524,288 samples, and as one session in 576. The end marker is the only thing that resets the decoder.
- **A message that does not fit** (read, W3-16 read; seen once in a log, Set J, and seven times by its effect in Set C, finding 8). The decoder's 24 kHz buffer holds 17 frames for one record. A frame that would be the 18th is not decoded, its number is spent all the same, and the rest of the record is skipped. Concealed frames count toward the 17. The game then takes a message only if its resampled sound fits 22,528 bytes, which is 12 frames (the engine's side is W3-03's reading). Otherwise it gets nothing, and that sound is lost: the decoder and the resampler have moved on. So an opening of 6000 samples behind a pre-roll of 2400, 17 frames, would not be heard at all (inferred).
- **The cut, seen** (Set J). The game never collected the last 34 frames of one key press; why is not known. The next message was 12 coded frames. The decoder concealed 10 frames, the cap, and decoded 7; the game logged 0 samples for it. The next message concealed the 4 frames left and decoded its 5, which is the log's count of 7938. W3-14 had inferred 10 concealed and 8 decoded, from the counts alone. With the cut as read, the gate clip's recording as one session differs from the app's render code in 32 of 524,288 samples, all by one step, in five frames; before that correction it was 576, up to 5 steps (W3-11a's second read, a private run).
- **A silence record is dropped,** not played, when more than 0.2 s is already waiting in that decoder's output. In the game's use the output is taken at once, so it is played (read; Set G shows the records queued).
- **Nothing else touches decoded sound:** Steam's `voice_autogain` is 0 (read).

**Corrected 2026-11-10 (W3-14, W3-16 read, W3-11a).** This finding said "Which kernel Steam's build runs is not known" and, of the first packet, "not seen in a recording". Set J settled both for the owner's PC. It also ended: "The app's Steam profile does not do this yet: it decodes to float and resamples the whole decoded signal with its own filter. Orders W3-13 and W3-11a build the decoder as read." Both are now built.

**The app today.** Since W3-11a a render of the `steam` profile decodes as this finding says: the library's own 16-bit decoder, a new decoder at each end marker, at most 10 frames concealed, a reset on a number that goes back, zeros for a silence record, and the port of Steam's resampler (W3-13) with the `fma3` kernel. One resampler serves the whole render and is never reset. It is fed whole messages, one call each, and its first packet gets the flush, so the render is 16 input samples (0.67 ms) late as the game is. The evidence, from the build and its two reviews:
- the build's own `process()`, driven by Steam's chunk lengths from Set J, gives Steam's recording of the continuous clip in 524,286 of 524,288 samples, and the gate clip as one session in 524,256 of 524,288 (private runs, above);
- an independent model equals `process()` in 54 of 54 cases, and the offline render equals the stream on 279 renders (W3-11a's reviews);
- the port equals the public library sample for sample under each kernel (W3-13), and the 16-bit decoder equals a native build's (W3-11a).

**Since BC-1 (2026-11-11)** the `steam` render and live chain also: refuse a packet whose resampled sound passes 11,264 samples (12 frames), after the decoder and the resampler have made it, so that both keep the state it left them in and nothing of it reaches the gain or the output; make a new decoder only at an end marker that arrives, so that a decoder whose marker was lost carries its state and expected number into the next spurt, judged by the rule above; and conceal the last ten frames of a longer gap, each in its own time.

*Added 2026-11-14 (W3-02g-a's fix round).* On the game's timeline a refused message is given to the voice channel as an empty packet on its tick, on the model's path and for a demo's packets alike, so a refused message opens a channel when none is open. That is chosen, not read: ruling 5 of 2026-11-11 (`docs/work-orders/W3-02-receiver-queue.md`), which rests on one line of Set J's log; what the engine does with Steam's refusal was not read.

What the app does not do, or does not show:
- **The 17-frame cut is in the app for a demo's own packets on the game's timeline** (W3-02g-a): `createSteamDecoder`'s `record()` walks each type 6 record as read, the frame that would be the 18th block undecoded with its number spent, and a render refuses a message over 12 frames, message by message. A render of a file still cannot reach the cut: an opening is at most 9 or 10 frames with nothing concealed in front (its first number is below any old expected number), and a later message at most 6 frames behind at most 10 concealed (inferred, W3-16's order), so a record is at most 16 frames; the tests find none longer. The record rule's counts, as measured on the suite (`tests/opus.verify.mjs`, the pinned library, one decoder and one resampler row after row): 8 frames from a fresh decoder, 8 blocks, 7,056 samples at 44.1 kHz; 12 frames 34 numbers ahead, 10 concealed and 7 decoded, cut, 14,994 (refused); the 5 frames after them, 4 concealed and 5 decoded, 7,938 (Set J's logged count); an end marker and 12 frames from 0, 10,584; an end marker and 13, 11,466 (refused); 18 frames in one record, 17 blocks, cut, 14,994 (refused); the frame after those 18, 1 block, nothing concealed, 882. Three rules of the read are reached by nothing in the recordings (Set D's demo has none of them, the orchestrator's private look (i) in W3-02g's order), and are built from the read alone, so marked in the code: a silence record dropped when more than 0.2 s of the message's sound is already waiting (read; that the wait is counted in output samples, 8,820, is inferred); a frame of length 0 as 480 zeros (read); a frame whose data runs past its record ending the record, undecoded (read). That a decoder which has decoded nothing expects number 0 is inferred (W3-02g's ruling 7). (Corrected 2026-11-14, W3-02g-a: this bullet said "The 17-frame cut is not in the app, and a render of a file cannot reach it: [...] The cut goes to W3-02g, with a demo's own packets." Corrected before, 2026-11-11, BC-1: it said "The 17-frame cut and the 12-frame refusal are not in the app", and of the refusal, "The app then plays what the game would drop. [...] the refusal waits on the loss question below.")
- **Not shown by any recording:** the soft clip, libopus 1.1.4 against 1.1.5, and anything of the microphone path (finding 28).
- **A demo's received voice** on the file's own timing still decodes to float and uses the app's own resampler; that decode is also the Original on the page. On the game's timeline (W3-02g-a) the demo's own packets go through Steam's decoder as read, Steam's resampler once per record and the voice channel on the demo's own ticks; the page does not ask for that yet (W3-02g-b, not built yet). Since W3-11b the live chain for `steam` runs the render's decoder and resampler. (Corrected 2026-11-14, W3-02g-a: this line said "A demo's received voice still decodes to float and uses the app's own resampler (W3-02g)." Corrected before, 2026-11-10, W3-11b: it said "The live chain still decodes to float and uses the app's own resampler until W3-11b. So does a demo's received voice.")

*Added 2026-11-21 (private reads of the current client, F24, the first point by two readers).* After the decoder, in the routine that both the game's decode and Steam's own chat go through (`0x1380dd200`), stands one variable: `voice_autogain`, default "0", no flags (read twice: `0x1380dcfe4`). Off, a decoded block is only metered, so nothing else touches decoded sound on the game's path, as above. On (read once, `0x1380d2010`), it is a gain law of the engine's kind in blocks of 128 samples at the decoded rate, before the resampler: a target of 35.5% of full scale, a gain of at most 10, a weight of 0.5, a ramp over the block. Nothing read sets it by name; it can be set from Steam's console and from `steam_dev.cfg` (finding 28, the paragraph of the same day). The app does not have this stage and does not need it at the default. Not shown by any take: all sets fit without it.

### 30. From the voice channel to the speakers

Read from the engine (W3-07) and measured in five recordings from two PCs (Set D's two and three of Set B's).

- **The mixer** runs at a fixed 44100 Hz in device buffers of exactly 512 samples (read). These are the 512-sample pulls of finding 22.
- **The voice into the mix.** Steam voice is a 44100 Hz source at pitch 1.0, so it is copied in sample for sample, with no interpolation and no filter, at 255/256, truncated toward zero (read). That is the level with headphones, the default, and with no room. Set B has it to four digits: its clipped 1 kHz plateaus sit at 4895 to 4896 of a ceiling of 4915, a ratio of 0.9960, where 255/256 predicts 4895.85 (measured, W3-18). With a room the voice is split in two (finding 32).
- **With two speakers** (`snd_surround_speakers 2`) the voice is at 182.6/256, 2.9 dB down (read, W3-15). The game's default sound mixer gives the voice's group 0.72. With headphones the two sides still sum past the cap of 255, so nothing changes there. That the voice falls in that group rests on a name match (inferred). No take was made with two speakers.
- **Then:** the sum of all sound, a clip at ±32767, `volume`, rounding to 16 bits, in that order (read). So the ceiling is round(32767 × `volume`). Recording A's largest sample is 4915 at `volume 0.15`, with 4% of its samples exactly there and none above (measured). The clip acts on the sum of the voice and the game's other sound; the voice alone tops out at 32639, 0.4% under the ceiling.
- **DSP.** A voice is not dry where a room is active (read). A share of it, set by the room's preset, passes the room's reverb, and the direct part falls to match: 26/256 and 229/256 for a numbered preset, 5 to 72 of 256 for the game's automatic room by its shape. Under water the whole output passes the water preset. Finding 32 has the rule and what the takes show: Set B is dry, Set C and both recordings of Set D are not.
- **Ducking.** While any voice channel is assigned, every other sound falls to half over 0.4 s (`voice_overdrive 2`; read, W3-03). The voice itself is exempt from that and from the game's own ducker (read, W3-07). So the game's ambience under a voice is 6 dB lower than between spurts.
- **No `[0.1, 0.8, 0.1]`.** The engine has no filter between the voice channel and the 16-bit samples it hands on (read).
- **The roll-off above 12 kHz** in the 48 kHz recordings is linear interpolation from 44100 to 48000 Hz. It is done after the engine by XAudio2, the system component the engine hands its 44.1 kHz buffers to. That XAudio2 interpolates linearly is measured, not read:
  - flat tops stay exactly on the ceiling, which a band-limited resampler would overshoot;
  - a 1 kHz tone has images at 4900 and 2900 Hz, at −64.5 to −65.5 dB and −64.3 to −66.6 dB in the five recordings. Linear interpolation predicts −65.4 and −66.2 dB.
- **Its response** is sinc²(f/44100): −0.95 dB at 8 kHz, −1.8 dB at 11 kHz, −2.6 dB at 13 kHz and −5.1 dB at 18 kHz. The fitted filter agreed with it within 0.1 dB to 13 kHz and was 1.1 dB bright at 18 kHz. The images grow with frequency: a 10 kHz tone has one at 13.9 kHz about 21 dB down. On a 44100 Hz device there would be no interpolation (inferred; no take).
- **The engine codecs** run at 22050 or 11025 Hz. The mixer brings them to 44100 Hz by linear upsampling by two, once or twice (read). The rule (read, `docs/reports/W3-10-upsampler-read.md`): each input is entered first, at its own rate; then output `2k + 1` is input `k`, and output `2k` is the mean of input `k − 1` and input `k`, rounded down (an arithmetic shift). The input before a block's first is the previous block's last, kept per mixer buffer and per stage, 0 when the buffers are made and cleared only when all sound stops; so nothing happens at a block's edge. A 22050 Hz voice sample `k` lands at mix sample `2k + 1`, an 11025 Hz one at `4k + 3`, through two stages with a state each: one and three 44.1 kHz samples late.

**Corrected 2026-11-10 (W3-15 and its second read, W3-18).**
- **The DSP line** said: "Where a room preset is active, 26/256 of it passes the room's reverb and the direct part falls to 229/256. ... The takes were made with no preset active: A's level is within 1% of the full one." The 26/256 is right for the numbered presets 0 to 29 only. Putting a preset on the room overwrites the four mix variables from that preset's own header, so the share is the preset's (read). And only Set B was made with no room. Recording A carries a street preset. Its 1 kHz steps are 3.1 to 3.3% above Set B's, because that preset's echoes add in phase on a steady 1 kHz tone (measured, W3-18). W3-07 had read that as the codec's.
- **The two-speaker level** was given as 253.5/256 (W3-07). W3-07 had not read the sound mixer's file and said so. With the default mixer's 0.72 it is 182.6/256 (W3-15). The headphone level, 255/256, stands.
- **The voice's level** was said to rest "on the code in part and on the recordings: recording A's 1 kHz tone gives a channel volume of 1.00 to 1.006, which cannot tell 255 from 253.5". Recording A was the wrong take to ask: it has a room. Set B gives 255/256 by itself.

Since W3-10 (2026-11-10) the app runs these stages as read: the voice entered at 255/256, truncated, at its own rate; the engine codecs upsampled by the rule above; the clip at ±32767, `volume` in single precision and the rounding to 16 bits, ties to even; and the device's linear interpolation as a model (its kernel fixed by the recordings, its precision and rounding the app's), at 48000 Hz by default and none on a 44100 Hz device (the page's "Listener's sound device", `snd_device_rate`). The fitted filter and the app's soft limiter are gone. A render's plateaus at `volume 0.15` sit at 4896 and −4896, as Set B's do.

**Corrected 2026-11-10 (W3-10).** Until W3-10 every download's positive samples were one unit low: the WAV writer scaled a positive sample by 32767 and truncated it, so a render's 4896 was written 4895 and a ceiling of 4915 as 4914. Since W3-10 the file holds the render's 16-bit values exactly (round(s × 32768), ties to even), and so does a MOV's PCM.

*Added 2026-11-14 (W3-23r, `docs/reports/W3-23r-frame-read.md`; read from the same `engine.dll`).* How far ahead the mixer paints, and when in a frame:

- **The mixer's target is `snd_mixahead` plus a smoothed frame duration** (read, `0x180031346` to `0x18003137c`). `S_Update` keeps `e = 0.9 e + 0.1 d`, with `d` the frame's real duration and `e` starting at 0.1, and paints up to `e + snd_mixahead`. W3-07 had it as `snd_mixahead` alone. The device buffers of 512 samples kept queued are `floor((0.1 + frame duration) × 86.1328) + 1`, never more than the device's 13: 9 at 223 frames a second and above, 10 from 63 to 222, 11 from 37 to 62, 12 from 26 to 36, 13 at 25 and under (arithmetic on the read rule). At a steady frame rate this is a fixed lead: it delays every sound alike, by 104.5 ms at 300 frames a second and 150.9 ms at 20. No take measures it.
- **The paint is the last step of `S_Update`**, which runs once a frame after the tick loop and after the frame is drawn (read). It runs on the main thread with `snd_mix_async` 0, the start value (read).
- **The "extra update"** paints with `snd_mixahead` alone (read, `0x18002b350`). Its 90 ms are counted from the last paint of either kind (read: its timer at `0x1804a75e0` is also written by `S_Update` at `0x18003133b`). In play it is reached only from the client module's drawing of the view (read; see finding 22's added lines).

*Added 2026-11-14 (W3-23a).* Under 1000/15 frames a second a render on the game's voice queue pulls a frame's blocks at once, after the frame's packets and ticks (finding 22's added lines). It does not hold the lead of 10 to 13 blocks above: at a steady rate that lead delays every sound alike, and the render's zero is left as it was. *Corrected in W3-23a's fix round (2026-11-14): "delays every sound alike" and so moves no sample only for a lead of whole blocks; the read lead is not whole blocks, and the model's block phase is chosen (finding 22's added lines).* At 66.67 and above the render pulls one block every 512 samples (chosen).

*Added 2026-11-15 (Set Q, measured): the game's log at 30 frames a second shows a frame's order as packets, ticks, mixer (Set Q's section). The mixer takes 4 blocks then 2 in 294 of its 316 frames of four where an exact 33.3 ms frame takes 3 and 3: its lead follows the smoothed frame duration (W3-23r), and the frame clock as built does not vary it. The ticks a frame runs agree with the arithmetic.*

*Added 2026-11-20. **The mixer's demand, read to the operation** (the 64-bit `engine.dll`, file F1, and Microsoft's `XAudio2_7.dll`; a private reader, then a second reader who wrote its own reading and counts first. "Both" means both saw it at the address or counted it).*
- **The demand is whole device buffers, counted by a callback** (read, both). `S_Update_Guts` (`0x180031510`) takes a counter in the XAudio2 device object: up one for each 512-sample block submitted (`0x180280bc7`), down one in the device's end-of-buffer callback (`0x180280ac0`), returned by `0x1801fc9b0`. No play position in samples is read.
- **The count** (read, both, `0x1800316e4` to `0x180031773`): `ahead = e + snd_mixahead − queued × 512/44100`; if that is above 0, `n = min(trunc(ahead × 86.1328125 + 1), 13 − queued)` blocks are painted, each by one call of `MIX_PaintChannels` (`0x1800317e0`), and a voice channel is pulled once a block. All 6,191 pull lines of Set Q's 30 frames a second part are 512 samples (measured). `e = 0.9 e + 0.1 d` as W3-23r read it, starting at 0.1, with no clamp.
- **The frame limiter** (read, both, `0x18020e7a5` to `0x18020e8ad`; new): the client sleeps whole milliseconds while more than about 2.25 ms remain, then spins. A frame is `1/fps_max` plus one spin: 33.40 ms at `fps_max 30` in Set Q, by its ticks and by its pulls (measured).
- **The device ends buffers in passes** (read by the second reader in `XAudio2_7.dll`): a pass is one period of Windows's shared audio device, which the file asks Windows for, and the end-of-buffer callback runs on the device's own thread inside the pass. The engine asks for XAudio 2.7 by its class and pins that file's name (read); that the game loaded the copy that was read is inferred. That a period is 10 ms and takes 441 samples is inferred from the fit below; the 10 is Windows's, not a constant of the file.
- **"Four then two" at 30 frames a second is the device's pass, not the smoothed frame duration** (measured, both; this corrects the line of 2026-11-15 above). Of Set Q's 2,150 frames a four is followed by a two 294 times of 316. With a 10 ms pass and each frame's time free within 0.2 ms, one reader's fit leaves 15 of 2,149 frames unexplained and the other's 10; a device followed to the sample leaves 470, and other pass lengths 130 to 888. Those are fits. As a forecast, a rigid clock in windows of 200 frames gets 1,949 of 2,149 (90.7%). The lead cannot flip by itself: that would take a change of 116 ms in the frame duration.
- **Blocks per tick line at 294 frames a second** (measured): 7.3, 56.7 and 35.8% of tick lines have no pull, one and two in Set Q's first log; a model with the 10 ms pass gives 6.9, 56.9 and 36.1, an even clock 0, 70.8 and 29.2. So W3-07's "one pull every 11.6 ms" holds in the mean and not line by line: blocks are painted on the first frame after a pass that ended a buffer.
- **`snd_mixahead`'s default in the file is 0.1**, kept in the player's config, with no limits (read, second reader). **The owner's fits 0.05** (inferred, both: after `fps_max` went from 67 to 30 the target steps at frames 3 and 21, where 0.1 puts them at 1 and 12; it rests on two frames, and only the mix-ahead's place within one block is measured, so values a block apart fit as well). The owner's console settles it (asked 2026-11-20). W3-23r's table of blocks kept is right for 0.1; with 0.05 it is 5, 6 and 8 at 294, 67 and 30.
- **W3-23r's correction of 2026-11-14 on the target's remainder is itself corrected:** only whole blocks of the target matter, so its part under a block moves nothing; the phase is the device's.
- **A long frame** (read): one paint is capped at the device's free buffers, and time the device stood dry is not made up. Sound is restarted on an XAudio2 error or a change of device, not by dry runs (read, second reader: the dry count's flag is touched by its own increment alone; the first reader had "more than 10 dry runs restart sound", which is wrong).
- **The overflows after the restart in Set Q's first log** (measured and inferred, second reader; this corrects "about 141 ms" in Set Q's section): the hidden pulls are whole blocks and come before a line's packet, so the 14 lines dropped 13,194 samples less 512 for each hidden block. The log alone allows 32.2 to 299.2 ms. The mixer keeps real time over 20 clean stretches (a spread of 0.64 block), which gives 20.2 to 20.7 hidden blocks and a drop of 67.0 ms; the last six lines dropped 9.0 ms exactly. The first reader's 58.4 ms is not a value the log allows. Neither clock gives 14 lines (0 to 9 over the phases tried); why the log has 14 is not found.
- **For a listener nothing was found** (measured on the readers' models, private): with the read rule on the same frames behind a device that ends buffers to the sample and one that ends them in 10 ms passes, at 294, 200, 144, 100, 67 and 30 frames a second, no mean moves by more than the spread between phases: overflows, dropped sound, underruns, the queue's median and the drop at an opening. The pass makes one run differ from the next two to three times more. **No change to the app's clock is called for.**
- **Not reached:** how many samples a pass takes (the device's rate converter); what a frame longer than the lead does to the voice (the device runs dry: 58 ms with 0.05); why four frames of Set Q's 30 frames a second part paint 5 or 6 blocks and the next 0 or 1 (a paint about 5 ms late fits one of them exactly; the log has no clock).

### 31. The engine codecs, read and matched

- **`vaudio_celt` and `vaudio_celt_high` are one module:** the public CELT 0.11 source at the commit the app pins, built with its pitch pre-filter and post-filter compiled in, with 16-bit entry points (read, W3-03 and W3-08). It sets nothing but the library's defaults, so complexity is 5. The module resets the encoder after creating it, and the engine resets the codec again at each start of recording.
- **`vaudio_celt`** is the 22050 Hz mode with 512-sample frames and 64-byte packets, as the app's `celt_22` has it.
- **`vaudio_celt_high`** is the 44100 Hz mode with 1024-sample frames and 128-byte packets, fed 22050 Hz sound (read; Set H's packets are 1024 samples at 22050 Hz). A frame therefore lasts 46.4 ms and the real rate is 22.05 kbit/s, the same as `vaudio_celt`. Its band ends at about 10 kHz. That is measured on the mode itself, not in a take: a 9 kHz tone comes back at +0.35 dB and a 10.5 kHz tone at −66 dB (`docs/work-orders/W3-06-celt-settings.md`). W3-03's "at most 11 kHz" was an upper bound.
- **Reproduced on Set H** (W3-08, and re-run by the orchestrator). The project's own build method, with the filter compiled in, the reset, 16-bit rounding with ties to even, and the input taken from the file's third sample, gives the game's decoded voice at 292,351 of 292,352 samples for `vaudio_celt` and 292,789 of 292,864 for `vaudio_celt_high`. The rest are one step apart. Complexities 5 to 10 give the same output, so the recordings cannot tell 5 from 10; the 5 is read.
- **The app's CELT is that build since W3-06 (2026-11-10).** Before, it was built without the filter, and its encoder was then a different one: 17.7 and 17.8 dB against the game on Set H. Its decoder also refused any real packet whose filter flag is set (read in the public source and shown, W3-08). The rebuilt module, the one the app now loads, gives the game's `vaudio_celt` recording on 292,351 of 292,352 samples and its `vaudio_celt_high` recording on 292,789 of 292,864, each remaining sample one step off (125.6 and 106.9 dB), and a third recording from another game's copy of the module (Set I) on 145,919 of 145,920 (measured by the orchestrator with the app's own module). It equals a native build of the same source bit for bit (reproduced). A demo's real `vaudio_celt` and `vaudio_celt_high` packets now decode; one that cannot be decoded plays as a frame of silence and is counted.
- **The app's Speex is the module's since W3-12b (2026-11-10).** `vendor/speex-1.0.2` is the public Speex 1.0.2 source, equal to a native build bit for bit (reproduced), and Speex 1.0 gives the same packets and sound at these settings on 13 signals, so which 1.0.x release the game holds does not matter for the sound (reproduced on the public sources). The profile feeds it 11025 Hz sound as it is, resets it in place at a new talk spurt (the reset is partial in 1.0.2: the first frame after it still leans on the frame before, read in the public source), and plays a lost frame as zeros because the module never decodes without bytes (read). After a loss the decoder is a frame stale, and the sound is rougher for about half a second (measured on the app's build: 4.1 dB against the source over the next 8 frames where a clean run has 18.1). What the game's listener heard after a loss under this codec was never measured, and cannot be now. *Corrected by Sets M and O (2026-11-11): "was never measured" stands; "cannot be now" does not, since HL2DM's and TF2's 32-bit games run and record Speex.*
- **`vaudio_speex`** is read from a module of another Source game that the owner supplied (W3-09); TF2's 64-bit folder ships none; its 32-bit folder ships one of the same compiler and size, 50 bytes of code apart (seen 2026-11-11). It is Speex 1.0.2 or 1.0.1: the two cannot be told apart in the module, and 1.0.2 is the one with a public tag. It runs narrowband at quality 4 (for the engine's 3), 20 bytes a frame, constant bit rate, enhancement on. It is fed the engine's 11025 Hz sound with no resampling: a frame is 14.51 ms, the rate 11.025 kbit/s and the band 5.5 kHz. Decoded samples wrap past full scale. The module has no concealment path (read); what the game plays for a lost Speex frame was not read.
- **The receiver gain runs on the decoder's own samples (W3-19, 2026-11-11).** The game's gain counts its 128-sample blocks from the first sample the decoder gives (Sets H and M: the decoder's whole stream through the app's gain gives the `voice_maxgain 10` recordings). The app dropped the codec's delay (`lookahead`: 64 samples for `vaudio_celt`, 128 for `vaudio_celt_high`, 80 for `vaudio_speex`) before the gain, so its blocks fell 64 or 80 samples off the game's: on the game's captured input its whole render gave Set H's `vaudio_celt` recording in 45,123 of 158,548 samples that are not silence at `voice_maxgain 10` (158,384 of 158,385 at 1, at 64 samples' lag) and Set M's in 86,171 of 145,966 (145,840 of 145,840 at 1, at 80 samples' lag; the orchestrator's private runs). Since W3-19 the `celt_22`, `celt_44` and `speex` profiles run the gain on the decoder's stream, the delay included, and drop the delay after it; the output keeps its length and alignment. With the gate on, a block whose first sample is decoded sample m belongs to frame floor(m / frame size). `vaudio_celt_high`'s delay is a whole block, so only its first blocks moved. Shown in `tests/gain.verify.mjs` ([4b]) against the bundled codec's whole stream through `receiverAutoGain`, sample for sample. Since W3-19 (the orchestrator's private runs of the whole render, `TF2Audio.process` with the gain's output taken at `onGain`, on the game's own captured input, on the branch at b3fad6f): Set M, `speex`, `voice_maxgain 1` 145,840 of 145,840 samples at 80 samples' lag (as before) and `voice_maxgain 10` 145,966 of 145,966 (before W3-19: 86,171); Set H, `celt_22`, `voice_maxgain 1` 158,384 of 158,385 samples that are not silence at 64 samples' lag (as before; the one left is the known sample a step off) and `voice_maxgain 10` 158,384 of 158,548 (before: 45,123): the same one sample, and 163 samples in the recording's last packet, which the gain rule applied to the game's own gain-1 recording also misses (Set H's note). No recording of `vaudio_celt_high` at `voice_maxgain 10` exists, so `celt_44`'s first blocks rest on the same rule, not on a take.
- **Corrected again 2026-11-11: TF2's own 32-bit game runs `vaudio_speex`.** The owner started TF2 (build 11191711) with `-force32bit`, set `sv_voicecodec vaudio_speex` (the console confirmed the value) and spoke with `voice_loopback 1` and `voice_showincoming 1`: 226 voice packets, 191 of 320 samples and 35 of 480, all multiples of Speex's 160 and none of CELT's 512, and no "Unable to load" line (measured; the log is private). So the fall-back to `vaudio_celt` below is the 64-bit game's, and Speex is a codec a current TF2 still runs in its 32-bit build. The same game asked for `vaudio_miles` prints "Voice_Init Failed: invalid voice codec vaudio_miles.": its 32-bit folder ships that module and the Miles files, and the engine refuses the name (measured).
- **`vaudio_miles` is VR12 behind an 8-bit cut (W3-20a, 2026-11-11).** A codec of the engine family (selectable in
  the Source engines of 2006 and 2007, where the default was already `vaudio_speex`); current TF2 ships it and refuses
  it. The module wraps a Miles plug-in holding Voxware's VR12, nominally 8000 Hz: 360-sample frames of 12 bytes (two
  VR12 frames); each sample cut to its top 8 bits before the codec, nothing done after it; one block coded at start-up
  from unwritten stack memory; a reset of two zero blocks through encoder and decoder; no lost-frame path (read from
  the owner's module, and measured by running it and the plug-in in a CPU emulator on signals of our own). The engines
  of Source SDK Base 2006 and 2007 load any `sv_voicecodec` name as a library, with no list, and run voice at 11025 Hz
  for every codec with no resampling to the codec's 8000 Hz (read, the orchestrator's private investigation of the
  owner's older engine files): so the codec coded 11025 Hz sound as if it were 8000 Hz, a frame was 32.65 ms and
  2940 bit/s on the wire (45 ms and 2133 bit/s at the nominal rate), and its 4000 Hz band covered about 5512 Hz. Those
  engines put a 16-bit count of bits before the frames, run the receiver auto-gain on the decoded samples, and never
  decode without data (read). Their wrappers and plug-in (Miles 6.6a) give the same packets and samples as TF2's on
  the eight signals (measured). A public C implementation of the codec, vendored unchanged in `vendor/voxware-vr12`
  with the wrapper as read, gives those packets on 2,505 of 2,505 frames and the decoded samples within one step
  (581,899 of 582,120 equal), started with a block of zeros (`tests/LEGACY_CODECS.md`, `vaudio_miles`). Nothing of a
  running engine with this codec has been recorded. *Corrected by W3-22 (2026-11-13): one sitting of Source SDK Base 2006 has since been
  recorded; see the bullet added by W3-22 below.*
- **Added 2026-11-11 (W3-20b): the `miles` profile, and what the engines of 2006 and 2007 did around the codec.**
  `vaudio_miles` is not a Team Fortress 2 codec: it is a codec of the Source engine family that could be selected in
  the Source engines of 2006 and 2007, and current TF2 ships its files and refuses the name. It has not been checked
  against any recording of a running engine. *Corrected by W3-22 (2026-11-13): Its codec stage was checked against one sitting of a 2006 engine on 2026-11-13; the profile as the app runs it was not.* Read in both engines (the orchestrator's private investigation of the
  owner's older engine files): a voice packet is the codec's output for one call, whole 12-byte frames with no header
  or count of frames, samples that do not fill a frame kept in the codec object, at most 1024 samples a call; how many
  frames a packet held in a running engine is not known. *Corrected by W3-22 (2026-11-13): in the 2006 sitting a packet held one frame of 360
  samples in 2,741 of 2,746 messages and two frames in the other five (measured; the bullet below).* The sender's encoder and each receive channel are separate
  codec objects with both halves. Every `+voicerecord` press resets the encoder's object (the wrapper's reset); a
  release sends one more packet with the final flag. A packet from a speaker with no channel gets one: its object
  reset, its buffer emptied, the gain at unity, playback after 0.2 s; a speaker with a channel is decoded at once,
  with no reset; a channel is freed when its buffer runs dry, with no timer. The receiver decodes, runs the auto-gain
  on the decoder's samples, and passes them through the interpolator of finding 24 into the mixer at 11025 Hz. These
  engines' mixer after the voice source, and their output stage, were not read. The `miles` profile is that codec
  stage set into the app's chain, everything after the receiver's gain TF2's of today: two codec objects, each reset
  at the start; the gain on the decoder's samples from the first, the codec's delay (305 samples, from the envelope:
  the codec is a vocoder) dropped after it. Its stand-ins: the start-up block is zeros; a new spurt (the app's gate
  or the live key) resets both sides, where the engines reset the receiver only after a pause longer than its buffer;
  the gain is held through time nothing was sent; a lost frame plays as zeros in its own place. No row of the
  results tables is about it ([LEGACY_CODECS.md](LEGACY_CODECS.md#vaudio_miles) has its measured levels).
- **Added 2026-11-11 (W3-20b): the old engines' gain is the app's.** The gain routine of the engines of Source SDK Base
  2006 and 2007, run in a CPU emulator on signals of our own, gives the app's `receiverAutoGain` on every sample:
  73,418,240 of 73,418,240 (20,485 blocks of 128 samples, seven settings, both engines, at two settings of the
  processor's precision).
- **Added 2026-11-13 (W3-22): `vaudio_miles` (not in TF2) against a running engine.** The owner's sitting in Source
  SDK Base 2006 on 2026-11-13 (private; numbers only; `docs/FINDINGS.md` entry 11). All of it is measured.
  - **The input.** With a 13 s clip of ours as `voice_input.wav` and `voice_recordtofile 1`, the game's captured input
    is the clip from its third sample on in every sample.
  - **Packets.** A packet held one frame of 360 samples in 2,741 of 2,746 messages and two frames in the other five.
  - **The codec.** The public implementation (`vendor/voxware-vr12`), reset once before the press, gives 143,796 of the
    game's 145,800 decoded samples exactly and 144,952 within one step. The frames further off (at most 32 steps) are
    the first two of the take and the first frames of the five sounds that follow a silence of 0.5 s or more. No sound
    after a pause of 0.44 s or less is off by more than one step.
  - **A second press,** at `voice_maxgain 10`, comes out in 143,913 of 145,800 samples after the gain rule of finding
    26 when the receiver's codec is reset twice before it and the sender's once. Why twice was not read.
  - **The owner's voice.** A third sitting was the owner's voice into the microphone, at both gains. There no sample
    can be compared: the decoder's waveform depends on everything it decoded before in the session (with one to ten
    silent frames decoded first, the implementation's own output changes at every count), and that session held
    presses whose sound was not kept. In what a listener hears the two agree: level within 0.01 dB, the level of each
    frame correlating 0.996 and 0.999 with an rms difference of 0.75 and 0.49 dB, the long-term spectrum within 0.2 dB
    in every band, and at `voice_maxgain 10` the same count of samples at full scale, 8,516.
  - **Not settled.** Why the first frames after a silence of 0.5 s or more differ: the public implementation, or the
    opening block the module does not set. Why the receiver's codec is reset twice before a second press (measured,
    not read). The `miles` profile as the app runs it was not run against the sitting: its reset of both sides at a
    new talk spurt, its gain held through time nothing was sent and its lost frame as zeros are stand-ins, and
    everything after its gain is TF2's of today. What a listener heard at a lost packet, and those engines' mixer and
    output, are still not read. The profile's rule for a new talk spurt was left as it was (W3-22).
- **Corrected 2026-11-11 (Set M): Speex can be recorded, in HL2DM's 32-bit game, and the app's build gives that recording's decoded stream sample for sample since W3-18 (the orchestrator's private run; Set M's paragraph).** The bullet read: **Speex cannot be recorded.** A current game asked for it runs `vaudio_celt`: read for a listen server's host, which is the owner's set-up (W3-09), and shown by Set I, which is in 512-sample packets at 22050 Hz and which the rebuilt CELT reproduces at 145,919 of 145,920 samples. A client of somebody else's server would fall back to the Steam codec instead (inferred, not tested). This bullet still ended "The app's `speex` profile runs Speex 1.2.1 at 8000 Hz with a resampler on each side; orders W3-12a and W3-12b rebuild it as read." Both are merged, and the profile is the module's (the bullet above; corrected 2026-11-10).

### 32. The room effect on a voice: read, and seen in two sets

*Corrected by Set K (2026-11-10): a third set, Set K, shows the room tap by tap (below).*

Read from the engine and the game's script files (W3-15). Read again in two further reads, each written before the first read's text was opened (the two W3-17 second reads); they win where the reads differ. Then looked for in the takes (W3-18), against a model of the arithmetic written from the second read. Until 2026-11-10 this file took every take to be dry.

- **The map's soundscape sets the room** (read: public SDK for the client, the engine for the rest). Its `dsp` key sets `dsp_room`, which is 0, no room, when the engine starts. The game's 40 soundscape scripts define 153 soundscapes (read from the scripts):
  - **101 set 1, the automatic room.** Every soundscape of 2Fort, Dustbowl, Badlands, Well, Granary, Gravel Pit, Upward, Hightower and Gold Rush does, indoors and out.
  - 2 set nothing.
  - The rest name a fixed preset, 2 to 26, in parts of seven map scripts, or, in one script, numbers the preset file does not have, which the engine ignores.
  - Scripts packed inside a map were not read, nor which map loads which script.
- **The presets are a text file of the game**, 136 of them, none compiled in (read). A preset is a header of six numbers and up to five processors in series. The app's table of presets 0 to 29 matches the file value for value (compared by a script, W3-15).
- **The split by the preset's header.** Putting a preset on the room overwrites four mix variables (`dsp_mix_min`, `dsp_mix_max`, `dsp_db_min`, `dsp_db_mixdrop`) from that preset's header (read twice). A voice is a 60 dB sound placed 12 units from the listener. So it sits at the near end of each preset's range, and the preset's drop for quiet sounds applies. Its limits are fixed once per voice channel, when the channel starts. Of 256, the room gets `trunc(mix × 256)` and the direct part `trunc(256 − mix × 256)`:

  | Room | To the room / direct, of 256 |
  | --- | --- |
  | none | 0 / 255 (finding 30) |
  | a numbered preset, 0 to 29 | 26 / 229 |
  | automatic: a small room; a hall | 38 / 217 |
  | automatic: a room of size class 2 or more | 41 / 214 |
  | automatic: a duct | 51 / 204 |
  | automatic: a tunnel | 72 / 183 |
  | automatic: a street; an alley | 23 / 232; 24 / 231 |
  | automatic: a courtyard; open space | 5 / 250 |

- **No voice is exempt.** The room mix is set to zero in two cases only: `dsp_off`, and a sound whose name carries a mark a voice does not have (read, W3-18). One's own voice under `voice_loopback` gets the split like any other. Sets C and D-A are loopback takes and both carry the room (measured).
- **What the engine does with the room's share** (read twice, to the formula). The room buffer is mono: left and right are averaged and the result goes to both. It runs at 44100 Hz in 32-bit integers, with 4096 as 1.0 and products shifted down, which rounds toward minus infinity. The processors are delays of seven kinds, an all-pass diffusor, a reverb of up to 12 delay lines side by side, a first-order low-pass, an amplifier and a modulating delay. The reverb is added to the direct voice, with all other sound, before the clip at ±32767 and before `volume` (finding 30). A preset has no gain or wet and dry mix of its own.
- **The level does not simply drop.** Most automatic presets pass their input straight through, so the room's path adds a copy to the direct part. Direct plus that copy, of 256 (computed from the model, W3-18): a small room 256.3, a hall 256.7, a duct 273, a courtyard 256.0, a street 252.7, an alley 252.6. Only presets that open with a diffusor show a drop: a room of size class 2 or more 213.8, a tunnel 185, open space 250.
- **The tail.** The delay lines are not cleared between blocks, so the reverb goes on after the voice channel ends, fed by silence. It ends when the integers settle, at zero or a few units below it (inferred from the arithmetic; in the model preset 6 rests at −1 to −2 and a tunnel at −5 to −8). A change of preset cross-fades over 200 ms.
- **Random taps.** Where a preset modulates, each delay's tap jumps to a new place drawn from the engine's shared random stream and is cross-faded in. It is not a sine. Two runs of the game differ there, so no model can match a take of such a preset sample for sample. A preset that does not modulate can be matched: preset 6 is one.
- **The automatic room** (`dsp_room 1`; read in outline by W3-15, to the formula by the second read):
  - It runs only while the player is fully in the game, at most every 0.25 s. A pass casts 20 rays and takes seven such runs.
  - It measures a width, a length and a height in units, a reflectivity, whether the sky is overhead and which sides are open.
  - It names one of 11 shapes: room, duct, hall, tunnel, street, alley, courtyard, and four kinds of open space.
  - It builds a preset from two templates of the file, the small and the large end of that shape: one is copied whole (the large one if the size class is above 1), then chosen numbers are set between the two in fifths, by the classes of the measures. Sixteen templates are in use, presets 102 to 131 less the "diffuse" pairs.
  - It keeps up to 40 built presets and re-uses one when the listener is back in a remembered place. A new one is built only after the listener has moved more than 48 units and the measures have changed enough.
  - **Diffusion is never measured in this build**, so the "diffuse" pairs are never chosen (second read). One of them carries the 80/256 that W3-15 gave as the automatic room's largest share; the largest that can occur is the tunnel's 72.
  - Until the first preset is built the voice is dry. A listener more than 72 units above the floor, such as a free camera, gets no pass.
- **What turns the room off** (read, W3-18):
  - **`dsp_slow_cpu 1`.** The room is emptied and every sound is dry at 255/256, while `dsp_room` still prints 1. The game's Sound quality option at its lowest sets it (read from the game's menu module), and it is saved with the configuration.
  - **`dsp_volume 0`**, also saved: no share goes to the room.
  - **`dsp_room 0`**: no soundscape has set a room.
  - `dsp_off 1`, which needs cheats.
- **Under water** the whole output, direct part and reverb together, passes the water preset, number 14, in mono, with no dry part (read, W3-15). The second read of that preset's amplifier wins: **there is no tremolo.** The gain is full for the first 100 ms after the preset starts, glides once to 1640/4096, which is 0.40 or −7.95 dB, over 80 ms, and stays there. The rest of the preset is three short all-passes, two echoes of 59 and 70 ms whose taps jump at random, and two 1800 Hz low-passes. No other filter is in the path. One lossy take was made under water (Set K, 2026-11-11, the dated paragraph below): the voice at about 0.77 of its dry level and no tremolo.

**What the takes show** (measured, W3-18, on the 17 recordings of the game's output). After each sharp stop of a noise-like sound, the next 200 ms were compared with the sound before, lag by lag, above 300 Hz; steady stretches by autocorrelation and cepstrum. The model's rooms were applied to the takes themselves for comparison.

| Takes | What they show |
| --- | --- |
| Set B | Dry. The level is 255/256 (ratio 0.9960). No echo from 31 to 540 ms |
| Set C, all six | The automatic room of shape "room", size class 2: 41/256 to the room, 214/256 direct |
| Set D, PC A | A street preset, width and length class 3: 23/256 and 232/256 |
| Set D, PC B | Two weak echoes, at 88.2 and 140.2 ms. A room was active; which one is not settled |
| Sets A, E, F | No echo found. The test is weak on music and low tones |

- **Set C.** A peak at 57.96 ms, 0.2335 in the autocorrelation. It is the sum of the diffusor's three delays, 573, 837 and 1146 samples. The model predicts 0.232 there. The diffusor's pairs show as negative peaks at 32, 39 and 45 ms. The whole pattern from 31 to 540 ms correlates 0.89 to 0.90 with the model's, against 0.72 for size class 3 or 4. Four more peaks, at 105.2 to 148.2 ms, are comb lines that only size class 2 has (W3-17's order). The source signal has none of these.
- **Set C's level.** The model's room lowers the voice's energy by 1.20 dB. The accuracy suite had shown that all along and it went unread. Its anchor, the overall level offset between a take and its render, is 1.09 to 1.33 dB on the four Set C takes where loss does not disturb it, against 0.08 to 0.12 dB on Set B and 0.15 dB on recording A (measured; that the sign is "render above take" is inferred, W3-18). The "Every take" table below does not print the anchor: its level column is taken after the offset is removed.
- **Set D, PC A.** The engine's rule for a street of those classes gives a comb at 68 ms and single echoes at 120 and 308 ms. The take has peaks at 68.02, 120.04 and 308.02 ms, with the comb's repeats at 136 and 204 ms, after every one of six stops. No other shape correlates above 0.2 with the take. The strengths agree to 20%.
- **Set D, PC B.** A courtyard preset has one echo, at the measured length over 6 ms. 88.2 ms would be a length of 529 units, and the echo's strength fits (0.010 against the model's 0.008). The echo at 140.2 ms belongs to nothing read. Unexplained.
- **Set B.** Any room but two would have shown: an open-space preset, which the level excludes (250/256 would put the plateaus at 4781, not 4896), and a courtyard with an echo under 31 ms. Why Set B is dry is not known. Its ambience is like Set C's, so a different state is likelier than a different place: `dsp_slow_cpu 1` or `dsp_volume 0` (inferred). The owner does not recall changing the Sound quality option between the sets.
- **A 1 kHz tone's level cannot show a room.** Every delay of these presets is a whole number of milliseconds, so the echoes add in phase on it. PC A's unclipped 1 kHz steps are 3.1 to 3.3% above Set B's (measured; finding 30 had read that as the codec's).
- **How far this goes.** Echo times to the sample, one autocorrelation value to 1%, a level to 0.1 dB and a pattern at 0.9. Every take has the game's ambience under it and none of these is fully wet, so **nothing of the room is checked sample for sample yet.** In Set C the reflectivity class is 2 or 3 (3 fits a little better), and the take's four comb peaks are still 15 to 25% above the model's: 0.029 to 0.034 against 0.024 to 0.027.
- **Corrected 2026-11-11 (W3-17d).** This bullet said "Every take has the game's ambience under it and none is fully wet". It was written of Sets B, C and D, and of those none is. Set K, below, has a fully wet take: all of the voice through room 6, every tap of the module in it at its delay. It is not equal sample for sample either: the map's ambience is in it and the system's mixer limits its tops, and its retake is not placed to the sample.

**The app today** (since W3-17c, 2026-11-11) renders the room with the engine's arithmetic as read, in `room-dsp.js` and its table `room-presets.js` (W3-17 parts a and b), after W3-10's entry:
- the voice entered twice at its own rate, at the direct share and the room share of 256 that the room's preset gives, each part upsampled on its own for the engine codecs; the room part through the room's preset; the sum before the clip at ±32767 and `volume`; under water the whole sum through preset 14. The render and its stream give the same samples, and the room path is given the mixer's 512-sample blocks;
- a numbered preset (2 to 29), the automatic room built from a set of measures (the named examples, the two measured cases of Sets C and D, and the five places measured on 2Fort in Set K), or the app's own custom room (not the game's);
- the reverb's tail after the voice, ending by a rule on the output (it settles within 32 units for half a second, at most 20 s), so a render with a room is longer than its source;
- random taps drawn from the render's seed, where the engine draws from its shared random stream;
- on the page since W3-17d: the listener position offers no room (the game's Sound quality: Low, `dsp_slow_cpu 1`; the default), the two automatic rooms as recorded, the 14 examples by shape, the five places measured on 2Fort, the ten numbered rooms the soundscape scripts ask for, and a manual `dsp_room` with the automatic room's six measures; under water is a checkbox of its own. The line under it says: "Room effects follow the game's own code. The two rooms marked 'as recorded' match recordings of the game in echo times and level, and room 6 matches a recording echo by echo. The 2Fort places use the measures the game printed there; the other shapes are examples. No room has been checked sample for sample yet." Under water alone: "Read from the game's code. One recording under water matches its level (0.77 of the direct voice) and its lack of tremolo." A share link from before keeps its preset number;
- in the live monitor since W3-17d: the same room path, kept by its worker for the session and run on the mixer's 512-sample blocks while a room or the water is on (11.6 ms more held back then, none once a room has faded to none and the water is off); a change of room is the engine's 200 ms cross-fade and under water switches at the next block, neither rebuilding the chain, from no room either, so Steam's sender and the gain run on; a spurt's first delivered packet stands in for a voice channel's start until the live chain has one (W3-02c), and a new room's share comes with the next spurt. The browser suite makes the live worker's output again from its voice at the mix point alone, sample for sample, across such changes.

Until W3-17c the app had its own room code, which was not the engine's (W3-15): presets 0 to 29 only, chosen by guess; a mix of 0.45 wet on every preset (about 13 dB too wet against presets 0 to 29); its own delays, feedback and gains, and a sine where the engine jumps at random; the room on the voice alone, after its clamp; and under water an extra 900 Hz low-pass that the game does not have.

**Measured 2026-11-11 (Set K, the owner's room recordings on 2Fort; private, numbers only).** With all of the voice through room 6, every tap of the room module out to 102 ms is in a lossless recording at the module's delay, the strong ones to the sample, with strengths within a few percent (the main one +0.658 at 1410 samples against +0.693; -0.102 and -0.082 at 573 and 837 against -0.1065 each); no tap is missing or extra; level by band within 0.16 dB. At the game's own shares the room's part is 21.6 dB under the voice (module 21.0). `dsp_slow_cpu 1` gives no room and 0 gives it back at once. Under water the voice is dull, without tremolo, at 0.77 of its level (module 0.76; the amplifier's 0.40 alone is not the level). Every `adsp_debug 2` line the game printed at five places builds, in the module, to the shape and the four mix values the game printed beside it. Not shown by those takes: equality sample for sample (the system's mixer limits the tops and the map's ambience is in them) and the tail's decay. **Two retakes the same night** (lossless, `volume 0.5`, `voice_overdrive 1000`, which brings every other sound to exactly zero under a voice about 0.65 s after it starts): with `dsp_room 0` the flat tops are at exactly 16320 and -16320 (37,644 samples, none above), so the voice enters at 255/256 (32639, not 32510) and no room's share is left behind. The device stage against that take, on the 7.6 s whose played timeline could be placed to the sample: equal in 49% of samples and within one unit in 73% as built; within one unit in 98.2% once the read position is let drift by 2^-25 of a mix sample per output sample, as a single-precision position would, and in 99.5% with the voice also 0.0011 of a sample late. The linear rule and the ties to even after `volume` are confirmed where they can be isolated (3,281 of 3,281 and 3,411 of 3,411). What is left is a one-unit loss toward zero in about a quarter of samples, of unknown origin (the system's conversion to 16 bits is the candidate; not read). The fully wet retake fits the room module with a residual 37 to 43 dB under it in its best seconds (the earlier take could show 18 dB); it is not placed to the sample, because the dropped samples' places are not all found. Why Set B has no room is not explained: the same settings and config files give a room on the same map.

**The app's room against the takes (2026-11-11, at W3-17c's merge; private, numbers only).** With `set_c_room` the render of Set C's baseline stands +0.0 dB against the take (it stood +1.2 dB dry), its share of samples at the clamp is the take's (1.1%), and its echoes are the take's: 0.2363 against 0.2335 at 57.96 ms, and 0.0268, 0.0361, 0.0328, 0.0337 against 0.0259, 0.0345, 0.0315, 0.0328 at 105.17, 119.17, 134.17 and 148.17 ms; the pattern from 31 to 540 ms correlates 0.886. With `set_d_street` Set D's PC A keeps its level (+0.1 dB); of its three echoes two are within 10% (120.04 and 308.02 ms) and the one at 68.02 ms is 36% high in the render (0.0304 against 0.0224, at 3.6 times the take's scatter), which is not explained. Every take without a room is unchanged in every figure.

*Added 2026-11-14 (the orchestrator's private run, numbers only): measured on the stretches of sound both pick, with the take lined up on the render's timeline, over nine seeds of the room, Set D's PC A reads at 68.02 ms 0.0279 to 0.0300 in the render against 0.0257 in the take (scatter 0.0024): 9 to 17% high, 0.9 to 1.8 scatters. At 120.04 ms 0.0115 to 0.0138 against 0.0141; at 308.02 ms 0.0071 to 0.0098 against 0.0056. The render without the room reads 0.0081 at 68.02 ms, the test signal's own. The run above took each file's own stretches and the take as recorded.*

Its default is no room, which is Set B's state and what the game gives at Sound quality: Low; a render with no room runs nothing of the room. Order W3-17 replaced the room code in four parts: part a the module, part b the automatic room's build, part c the render, part d the page and the live chain.

## Model

"The game" is what was read or measured. "The app today" is what the code on main runs on 2026-11-12, at cache
v34 (`constants.js`, `steam-sender.js`, `audio.js`, `opus-codec.mjs`, `room-dsp.js`, the vendored codecs): every
order merged by then and nothing in flight. Each order and its state is in `docs/README.md`; the order of work is in
`docs/PROGRESS.json`.

- **Merged, and changing the sound:** W2-02 (the render a piece at a time), W3-04 (a file decoded at its own rate),
  W3-02b (Steam's sender, which the `steam` render runs since W3-11a, and the queue's timeline as a module), W3-05
  (the gain), W3-06 (CELT), W3-12b (Speex), W3-13 (the resampler's port), W3-11a (the `steam` render), W3-16 (the
  hold and the read clock), W3-11b (the `steam` live chain on the render's stages), W3-10 (the mixer and the output
  stage), W3-17b to W3-17d (the automatic room, the rooms in the render, on the page and in the live chain), W3-18
  (Speex with the module's arithmetic), W3-19 (the engine codecs' gain on the decoder's own samples), W3-20b (the
  `miles` profile, not in TF2), BC-1 (loss by whole messages on `steam`).
- **Merged as modules, not yet or not by themselves in a render:** W3-02a and W3-02c-1 (the receiver's channel; no
  render runs it yet), W3-12a (the Speex module, which W3-12b put in the profile), W3-17a (the room module, which
  W3-17c put in the render), W3-20a (the VR12 module, not in TF2, which W3-20b put in the profile).
- **Merged, words and the page only:** BC-2 (the words on loss and jitter), W4-01a, W4-01c and W4-01d (the page).
- **In flight:** W4-01b (speed with the same samples).
- **Not built:** W3-11c (Steam's key rules; the live chain's push-to-talk is the app's stand-in until then),
  W3-02c-2 to W3-02g (the receiver's channel in the render, the live chain, on the page and for a demo), BC-3 to
  BC-5 (loss through the queue, jitter as arrival times, the engine codecs under loss).
  *Corrected by BC-4a (2026-11-13): jitter as arrival times is built on Steam voice on the game's voice queue
  (finding 9).*

<details><summary>This section's head as it stood before 2026-11-12</summary>

"The game" is what was read or measured. "The app today" is what the code runs at the merge of W3-11a, W3-16, W3-11b, W3-10, W3-17c, W3-17d and BC-1 and of nothing later (`constants.js`, `audio.js`, `opus-codec.mjs`, `steam-sender.js`), with the order that will change each row known to be wrong. The orders are in `docs/work-orders/`, and their sequence is in `docs/reports/W3-11-plan.md`, "The order of work", as `docs/PROGRESS.json` keeps it up to date.

- **Merged:** W3-02a (the queue as a module), W3-02b (Steam's sender and the queue's timeline as modules), W3-05 (the gain), W3-06 (CELT), W3-12a and W3-12b (Speex), W3-13 (the resampler's port), W3-11a (the `steam` render), W3-16 (the hold and the read clock), W3-11b (the `steam` live chain on the render's stages), W3-10 (the mixer and the output stage), W3-17a and W3-17b (the room module and the automatic room), W3-17c (the room in the render), W3-17d (the rooms on the page and in the live chain), BC-1 (loss by whole messages on `steam`).
- **Not built:** W3-11c (Steam's key rules; the live chain's push-to-talk is the app's stand-in until then), W3-02c to W3-02g (the receiver's channel in the render, on the page and for a demo).

</details>

A row's "render" is the offline render and its stream, which give the same samples. The live chain is named where it differs.

| Stage | The game | The app today | Basis |
| --- | --- | --- | --- |
| Capture | Steam opens the capture at 24 kHz, mono, 16-bit; Windows or the virtual cable converts from the device's rate. A stereo cable reached the game as its left channel | left channel of stereo input, resampled to 24 kHz and clipped at 16-bit full scale. Since W3-11a the `steam` render rounds it to 16 bits, ties to even, before the sender. Since W3-11b the live chain does the same, with the capture filter's delay dropped as in the render. *Added 2026-11-21: since W3-26b the conversion is finding 28's, Windows's converter at quality 30 as read (`capture-converter.js`), from the source's own rate, in the render, its stream and the live chain, with no capture filter and so no delay to drop; a source at 24 kHz passes as it is (chosen); with the codec off and for a demo's voice the app's resampler as before. The order, as built: the microphone gain, the clip at 16-bit full scale, then the conversion, then the rounding to 16 bits (the cell's "resampled to 24 kHz and clipped" names the clip after the resampling, which the app does not do); the gain and the clip are the app's own (chosen), since Windows's pipe has a volume of 1.0 and no limiter (finding 28, read once)* | findings 6 and 28 |
| Capture roll-off | the capture's resampler on the sender's machine. On the owner's PC: −0.5 dB at 11.25 kHz, −2.6 dB at 11.45 kHz, −6.5 dB at 11.75 kHz | 0 dB to 11 kHz, −2.2 dB at 11.45 kHz, −6.6 dB at 11.75 kHz, −8.5 dB at 12 kHz (255-tap FIR at 24 kHz, before the gate and encoder). *Added 2026-11-21: since W3-26b no FIR runs; the band edge is the conversion's of finding 28 (the row above): −0.53 dB at 11.0 kHz, −1.81 dB at 11.25 kHz, −3.81 dB at 11.45 kHz, −9.17 dB at 11.75 kHz and −14.79 dB at 11.95 kHz, and a 12.5 kHz tone folded to 11.5 kHz at −44.1 dB (computed; the capture alone, before the codec)* | findings 14, 16 and 28 |
| Voice gate | Steam's chunk rule. A chunk is the whole capture steps since Steam's last frame (750 samples each: a 32nd of the one-second capture buffer Steam asks for; the number is not in Steam's code). Open when mean \|x\| ≥ 1.0% of full scale or a sample ≥ 15%; 2400 samples kept before the onset's chunk; held 0.4 s on Steam's 32-bit float clock of seconds since Steam started, which is 398 to 406 ms of real time on a Steam under a day and a half old and 375 to 500 ms up to 24 days; one chunk a message, cut into 480-sample frames with the remainder kept; the end marker; the encoder and decoder reset per spurt. Steam reads every 48 to 64 ms | **The `steam` render, since W3-11a:** Steam's rule, through the sender of W3-02b with the render's seed: chunks, the mean-or-peak gate, the pre-roll, the hold, one message per chunk, the end marker; the hold in floats and the read clock as measured since W3-16, with the sender's Steam at 9 days by default (the page's "Sender's Steam has been running"). **The live chain, since W3-11b:** the same sender with the render's seed and uptime, timed on the samples given to it, the key held throughout; push-to-talk is the app's stand-in (zeros while the key is up), not Steam's key rules (W3-11c). `steam_48` keeps the frame fit. The CELT and Speex profiles have no gate | findings 5, 12 and 28; Sets D, G and J |
| Codec | libopus 1.1.x (1.1.4 by the Linux client's string; Windows inferred): Opus 24 kHz mono, VOIP, signal=voice, 32 kbps constrained VBR, complexity 9 (the default), DTX, 20 ms; 16-bit samples in and out; at most 10 frames concealed per gap; at most 17 frames decoded from one record | libopus 1.1.5 at both ends with the same settings, complexity 9. **The `steam` render, since W3-11a:** 16-bit samples in, the library's own 16-bit decoder out, a new encoder per spurt, at most 10 frames concealed. Driven by Steam's chunks it gives Steam's recording in 524,286 of 524,288 samples (Set J). Since BC-1 a new decoder only at an end marker that arrives (one lost carries the decoder into the next spurt), and the refusal of a message over 12 frames. Not in the app: the 17-frame cut, which a file render cannot reach (W3-02g). **The live chain, since W3-11b:** the render's, under loss too since BC-1 | findings 11, 13, 16, 28 and 29; Set J |
| Decoder's resampler | FFmpeg's libswresample at its defaults (32 taps, 147 phases, Kaiser window), 24000 to 44100 Hz, in float, once per packet, one resampler per speaker for the whole session. Its first packet is flushed, which leaves everything after 16 input samples late. The `fma3` kernel on the owner's PC | **The `steam` render, since W3-11a:** the port of that library's float path (W3-13) with the `fma3` kernel, one resampler per render, fed whole messages, with the first-packet flush. Equal to Steam's recording given the decoded samples (Set J). **The live chain, since W3-11b:** the render's, one resampler a chain (a settings change makes a new one: the app's own). A demo's received voice (W3-02g): the app's own windowed-sinc resampler | finding 29; Sets G and J |
| Voice rate | 44.1 kHz for Steam voice; the mixer runs at a fixed 44100 Hz | 44.1 kHz | block-rate lines, post-decode clipping; read: findings 22 and 30 |
| Voice channel | a 0.5 s ring per speaker; a new channel waits ceil(0.1 × frames a second) ticks of 15 ms at `voice_buffer_ms 100`; a spurt that arrives before the ring is found empty is appended; one sample dropped per packet; the last 0.1 s of the queue faded | not in a render. The source's timeline is kept, with the flat rule of finding 19 as an option (`voice_retime`). Since W3-11a the `steam` render lays each spurt's decoded packets on that timeline, one after the other from the spurt's start; no sample is dropped per packet and nothing waits or is appended. The ring and its timeline exist as modules (`voice-channel.js`, W3-02a and W3-02b). W3-02c and W3-02d run them in the render and on the page, at `fps_max 300` and `voice_buffer_ms 100`; W3-02f retires the flat rule; W3-02g feeds the ring a demo's own packets. *Corrected by W3-02f (2026-11-13): the flat rule is no longer in the engine; `tests/retiming.mjs` keeps a copy for scoring.* *Added 2026-11-14 (W3-23a): on the game's voice queue the ticks and the mixer's pulls are evenly spaced at 66.67 frames a second and above (chosen); under 1000/15 a render takes the messages whose tick has come, runs the ticks due and pulls the blocks due once a frame, in that order (read, W3-23r), and at jitter 0 each message comes at the listener's first look after the server's relay tick (chosen, finding 9); the live monitor keeps even ticks and pulls until W3-23b (not built yet). Finding 22's added lines have the figures.* *Corrected 2026-11-14 (W3-23b): the live monitor has them too, and holds back a frame's blocks more than D there (finding 22's added lines).* | findings 19 and 21 to 25 |
| Auto-gain | finding 26's rule: finding 3's law in 128-sample blocks; `voice_scale` entering twice; the step is the difference over 127; an integer block mean; a decoded block of zeros sends the gain to the cap; reset to 1.0 when a channel is assigned. Defaults `voice_avggain 0.5`, `voice_maxgain 10`, `voice_scale 1` | the engine's rule since W3-05, sample-exact on Set H. **The `steam` render, since W3-11a:** fed the decoded packets in order, a silence record's zeros included, so the gain goes to the cap after each spurt as in the game; reset once only, at the render's start (the channel's resets: W3-02c). **The `steam` live chain, since W3-11b:** as the render, reset when the chain is made. **`celt_22`, `celt_44`, `speex` and `miles` (not in TF2), since W3-19:** on the decoder's own stream from its first sample, the codec's delay dropped after the gain. **`steam_48` (not in TF2):** on the source's timeline, held through blocks the gate did not send. *Corrected by W3-19 (2026-11-11): this row said "The other profiles: on the source's timeline". See finding 31.* | findings 3, 4, 26 and 31; Sets B, H and M |
| Mixer: the voice's entry | the voice enters the mix at 255/256, truncated toward zero, with headphones (182.6/256 with two speakers). With a room it enters twice: the direct share and the room's share. While a voice channel is assigned, all other sound falls to half | since W3-10 the entry as read: each voice-rate sample as a 16-bit value (a value that is not whole, with the auto-gain off, rounded to the nearest, ties to even), entered at 255/256 in single precision, truncated toward zero, at the voice's own rate; the CELT voices then upsampled by two once and the Speex voice twice by the engine's rule, each stage with its own state (finding 30). The render, its stream and the live chain run the same code. Since W3-17c, with a room the render enters the voice twice, at the room's two shares, by the same entry, each part upsampled on its own. Since W3-17d the live chain does the same with a room or under water. Not in the app: the two-speaker level, any other sound and its duck | findings 30 and 32; Set B for the 255/256 |
| Room | set by the map's soundscape; most ask for the automatic room, which the engine builds from two templates by the shape and size it measures. The voice's share is the preset's: 26/256 for a numbered preset, 5 to 72 of 256 for the automatic room. Mono, 44100 Hz, integers, before the clip and `volume`; the tail runs on. Off at Sound quality: Low (`dsp_slow_cpu 1`). Under water the whole sum passes preset 14, whose amplifier settles at 1640/4096 (0.40) with no tremolo; the reverb after it builds the low end back up, and a voice comes out at about 0.77 of its level (Set K) | **The render, since W3-17c:** the engine's arithmetic as read (`room-dsp.js`, W3-17a and W3-17b), bit for bit against a second implementation: the voice's two shares, the room's preset on the room part, the sum before the clip, under water the sum through preset 14, the tail by a rule on the output; a numbered preset, the automatic room by example or measured measures (the app has no map), or the app's own custom room; random taps from the render's seed. The default is no room, which runs nothing of it. **The page and the live chain, since W3-17d:** the listener position offers no room (the default), the two rooms as recorded, 14 examples by shape, five places measured on 2Fort, the ten numbered rooms of the soundscape scripts, and a manual number with the automatic room's measures; under water is a checkbox; the live chain runs the same room path, kept by its worker, with the engine's 200 ms cross-fade on a change | finding 32; Sets B, C, D and K; W3-15, W3-17 |
| Output stage | the sum of all sound (the direct voice, the room's reverb, the game's other sound) clipped at ±32767; `volume`; rounding to 16 bits; then XAudio2's linear interpolation to the device's rate (48000 Hz in the takes; none on a 44100 Hz device) | since W3-10: the mix (the voice alone) clipped at ±32767, `volume` as a single, rounded to 16 bits, ties to even; then the listener's device, the page's "Listener's sound device" (`snd_device_rate`, the app's own setting): 48000 Hz by default, by linear interpolation from phase 0, each output rounded to the nearest 16-bit value, ties to even (a model: the kernel is fixed by the recordings, its precision and rounding were not read); 44100 Hz has none. The output is at the device's rate, with the source's duration. No filter and no limiter. With a room (since W3-17c) the room path's sum, in integers, is what is clipped; the old room code and the listener's low-pass, which sat there in floats until then, are gone. `volume` defaults to 1, the game's own. Before W3-10: the fitted 3-tap `[0.1, 0.8, 0.1]` at 44.1 kHz, `volume` in floats, a sinc resampler to the source's rate and a soft limiter at 0.98 | findings 1 and 30 |
| Network | read: a packet is lost whole, an out-of-order one is a lost one, and one carries one voice message on a listen server; `net_fakeloss N` draws (N + 1)/101 per packet, four times on Set C's path, so 21.7, 37.0 and 49.8% of messages at 5, 10 and 15. Steam's decoder conceals at most 10 frames of a gap, when the next frame arrives; the game refuses whole a message that comes to more than 12 frames. Measured on a listen server: Set C's noise parts fit the rule at 5 and 15 (finding 8); jitter, finding 9 | **The `steam` render, its stream and the live chain, since BC-1:** each of the sender's messages is a packet, lost whole by a draw of its own; a gap is concealed when the next frame arrives, its last 10 frames at most; frames lost at a spurt's end are not played; a lost end marker carries the decoder into the next spurt; a message over 12 frames is refused; every played frame at its own time, the rest silent (a stand-in for the queue, BC-3). The live chain is the render, sample for sample. Jitter on every profile: 3.2% of frames late at 50 ms (scaled linearly), one in ten silent, a silent late frame 20 ms of zeros (a fit). *Corrected by BC-4a (2026-11-13): on `steam` on the game's voice queue jitter is when messages arrive, through `net_fakelag`'s lists on the two crossings, the lag twice the jitter, the least delay taken out; nothing on the file's own timing; the late-frame fit stays on the other profiles (finding 9).* **The other profiles:** lost frames in Gilbert-Elliott bursts, mean 2.2 frames, drawn per frame (the earlier fit). Until BC-1 the `steam` render drew the bursts too, had no refusal, closed up after a gap of more than ten, and its live chain laid the rest of such a spurt later | findings 8, 9 and 29 |
| Engine codecs | `vaudio_celt`: CELT 0.11 with its pitch filter, 22050 Hz, 512-sample frames, 64 bytes, complexity 5. `vaudio_celt_high`: the 44100 Hz mode with 1024-sample frames and 128 bytes, fed 22050 Hz sound. `vaudio_speex`: Speex 1.0.2 or 1.0.1 on 11025 Hz sound with no resampling, wrapping past full scale; TF2's 64-bit game runs `vaudio_celt` in its place, and its 32-bit game (`-force32bit`) runs Speex, as HL2DM's does (Sets M and O). *Corrected by Set O (2026-11-11): this cell said "a current game runs `vaudio_celt` in its place".* | `celt_22` and `celt_44`: the game's build and settings since W3-06, sample for sample on Sets H and I but for 1, 75 and 1 samples one step off. `speex`: the module's Speex 1.0.2 on 11025 Hz sound with no resampling since W3-12b, wrapping past full scale, a lost frame as zeros, reset in place at a new talk spurt; equal to a native build of the public source bit for bit; with the module's arithmetic since W3-18, equal to Set M's recordings sample for sample (the orchestrator's private run), and the whole render to Set O's at `voice_maxgain` 1 and 10 | finding 31; Sets M and O |
| Not in TF2 | `steam_48` is not the game's path. `vaudio_miles` (Voxware VR12 behind the module's wrapper) was selectable in the Source engines of 2006 and 2007; TF2 ships its files and refuses the name (read) | `steam_48`: libopus 1.1.5 at 48 kHz, 64 kbit/s, the 20 ms frame gate, the app's own resampler. `miles` (since W3-20b): VR12 at 11025 Hz, 360 samples as 12 bytes, each sample cut to its top 8 bits first; against the game's plug-in and wrapper run in a CPU emulator on the tests' vectors, every packet the game's and the decoded samples within one step (reproduced, `tests/vr12.verify.mjs`); not checked against any recording of a running engine. *Corrected by W3-22 (2026-11-13): the codec, reset once, gives the first press of one sitting of Source SDK Base 2006 in 143,796 of 145,800 decoded samples and 144,952 within one step (measured); the profile as the app runs it was not run against it (finding 31).* | finding 31; `tests/LEGACY_CODECS.md` |

## Results

**Read this first (2026-11-10).** Every table below was made with the app as it was before W3-11a: the frame gate, float decode and the app's own resampler in the `steam` render. They have not been made again. With W3-11a's render the orchestrator's private run of the accuracy suite moved the clean takes by at most 0.12 dB below 10 kHz, brought the 11 to 12 kHz band 0.3 dB closer and left the spurt counts unchanged (`docs/PROGRESS.json`). Two more things the tables did not know (finding 32):
- **Set C was made in a room**, and the renders behind these tables had none. Every Set C row here, and the Set C row of "Every take", compares a take with the game's automatic room against a dry model. Since W3-17c (2026-11-11) the accuracy manifest gives Set C's rows the automatic room `set_c_room` and Set D's PC A row the street `set_d_street`; the tables here have not been made again with them.
- **Recording A of Set D carries a street preset**, and recording B two weak echoes. Their rows are compared with a dry model too. The effect on a level is small there (finding 32).

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

**Set C.** The app rendered the network test signal and was measured the same way as the takes. (Note 2026-11-11, BC-1: this table was made with the per-frame loss model, which the `steam` profile no longer runs, and has not been made again; finding 8 withdraws its take column.) (Note 2026-11-13, BC-4a: the jitter row's app column is the late-frame fit, which Steam voice no longer runs, and its take column came from the same withdrawn script; finding 9 has the jitter take's events measured again.)

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
  - Since W3-10 (the accuracy suite on the same two recordings, 2026-11-11): 12 to 16 kHz −0.03 and +0.04 dB, where the fitted filter gave −0.76 and −1.00. The filter had no images; linear interpolation to 48000 Hz puts the voice's 8 to 12 kHz also at 12 to 16 kHz, and the recordings have them.
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
| Set C baseline | the take has a room, the render none | 0.39 (1.00) | −0.2 dB at 80–120 Hz | 1.1 / 2.3% |
| Set D sender A | the take has a street room, the render none | 0.15 (1.00) | +2.3 dB at 11–12 kHz | 7.6 / 9.6% |
| Set D listener B | `volume 0.077` | 0.87 (0.84) | +3.3 dB at 11–12 kHz | 1.2 / 9.6% |
| Set E River clip | `volume 0.15` | 0.21 (0.98) | +0.2 dB at 80–120 Hz | 12.9 / 15.0% |
| Set F low tones, default | | 3.54 (0.82) | −1.3 dB at 0.5–1 kHz | 14.1 / 14.3% |
| Set F low tones, `voice_maxgain 1` | | 3.89 (0.56) | −15 dB at 11–12 kHz | 0.7 / 0.6% |
| Set A River | | 0.10 (0.99) | −0.3 dB at 10–11 kHz | 13.7 / 16.2% (MP3) |
| Set A Take It Off | | 0.07 (1.00) | −0.2 dB at 10–11 kHz | 12.6 / 18.1% (MP3) |

- **Residuals.** The largest block differences in the default and `voice_avggain 0.25` takes are the ones findings 13 and 14 describe: the −36 dBFS sine near the game's ambience, hold tails, and the 10–12 kHz tones Steam puts into DTX more often.
- **Low tones.** The Set F takes differ block by block because their comfort-noise plateaus are random in both (finding 18); the 11–12 kHz band of the `voice_maxgain 1` take is ambience against near silence.
- **Listener B.** The row above was rendered at `volume 0.077` and `voice_scale 1`, the settings fitted to its levels at the time. Its peaks reach −19.7 dBFS, 2.5 dB above that render's clamp, and only 1.2% of its samples sit at them. W3-07 explains both, and the output path is not the cause (finding 15). The PC ran `volume 0.11`: its largest sample is 3604, which is −19.2 dBFS. It also ran `voice_scale 0.77`, at which a loud tone's plateau sits at 0.72 of the ceiling, unclipped. Both are inferred from the recording. The row has not been rendered again at those settings. **Rendered again 2026-11-12** at `volume 0.11` and `voice_scale 0.77` (the orchestrator's private run on main at `9e0abd0`; `tests/accuracy.takes.json` carries those settings since): level 0.41 dB rms (0.96) where the row above reads 0.87 (0.84), largest band difference +2.4 dB at 11–12 kHz, 1.2 / 1.9% of samples at the clamp where it read 1.2 / 9.6%, and the render 0.5 dB above the take overall. The settings stay inferred until they are read off that PC.
- **Samples at the clamp.** In a take a sample reaches the ceiling itself only when game sound adds to the voice, whose own plateau is 0.4% under it (finding 30). So the share at the exact ceiling depends on the game's ambience; the share within a few percent of it does not (W3-07).
- **Set C with loss and jitter** is compared by its statistics above (Set C), not block by block: TF2's and the app's lost frames are different random frames. Since BC-1 (the orchestrator's private run on its build, 2026-11-11) the loss rows' level column reads +0.4 dB (loss5), +0.0 (loss15) and +0.3 (combined), where the per-frame model gave +0.1, −1.4 and −1.7; the `speech_loss10` row reads +0.4 to +0.5 dB where it read +0.2, 0.3 dB further from 0, and why is not known.
- **Set C's level.** The level column is taken after each take's overall offset, the suite's anchor, is removed. On the four Set C takes where loss does not disturb it the anchor is 1.09 to 1.33 dB, against 0.08 to 0.12 dB on Set B. That is the room: the model's room of size class 2 lowers the voice by 1.20 dB (finding 32). The baseline row's 2.3% of render samples at the clamp against the take's 1.1% is expected to close with it (W3-17's order; not run).
- **Clock.** Every take's playback runs about 400 ppm ahead of the source. It is not a recorder's clock: the receiver drops one sample from every packet (finding 24). The one take at 505 ppm had more packets a second.

## What remains unverified

Six settings no recording of the game's output covers yet are predicted in advance in [predictions/PREDICTIONS.md](predictions/PREDICTIONS.md): the legacy codecs `vaudio_celt` and `vaudio_celt_high`, `voice_scale 2`, `voice_avggain 1`, `voice_maxgain 3` and `volume 1`. Set H has since recorded the two CELT codecs' decoded voice (finding 31). Their predictions were registered with the bundled build, and for `vaudio_celt_high` with settings the engine never selects, so a new registered prediction for it is wanted before its take.

- **Talk-spurt timing.** The receiver's queue is the engine's, read and confirmed tick by tick at 67, 100 and 300 frames a second (findings 22 and 23). The app does not run it yet: renders keep the source timeline by default, and early starts after short silences are an option modeled by the flat rule of finding 19. The one sample dropped per packet (finding 24) is not modeled either. What a file render makes up is Steam's packets, and since W3-11a the `steam` render does make them, by Steam's rule on a drawn clock. When Steam's frames fall is a model of one PC's logs (findings 25 and 28), so which pause near 0.4 s closes will differ from any one take. The early starts and the 0.04% occur with a remote listener on a dedicated server too (Set D).
  *Corrected by W3-02d-1 (2026-11-13): the page's render on Steam voice now runs the game's voice queue by default (Phrase timing, `voice_timeline game`, at `fps_max` 300 and `voice_buffer_ms` 100); the file's own timing is one setting away (`voice_timeline source`), and a demo's voice, a video and the live monitor keep it. The page no longer offers the flat rule; `voice_retime` is an old name for `voice_timeline`.*
  *Corrected by W3-02f (2026-11-13): the flat rule is no longer in the engine; `tests/retiming.mjs` keeps a copy for scoring.*
- **The queue, not recorded.** The fade and the underrun padding in sound; a listener under 67 frames a second; the queue under the engine codecs. By the rule a long transmission drains the queue, since nothing refills it inside a spurt: after 20 minutes from a full ring, with a gap in continuous sound when it runs out. No take is long enough to show it.
  *Added 2026-11-15 (Set Q, measured): the drain itself is seen on a real server, 29.7 ms in 76.5 s of unbroken music at `fps_max 67`, one sample a packet. The fade and the underrun in sound are still not recorded.*
- **The sender's hold and clock.** Settled on 2026-11-10: the gate's rule on every chunk of Set J; the hold's arithmetic (read); what the float clock does to it (measured at a step of 1/8 s); that Steam reads 48 to 64 ms apart and never late (Set J). The earlier puzzle, why the demo has the 7th chunk so often where a steady clock gives the 8th, is answered in part: by the reads as measured, and by the float if that Steam had run for a week (finding 28). Still open:
  - **The sender's Steam uptime.** The hold's real length follows it. Set D's ends single out a Steam of 6.1 to 12.1 days (W3-16's second read); the app's default is the middle of that range, and another sender's Steam may differ. That the clock counts from Steam's start is read in the public build of Valve's timer library; the owner's own copy was not read.
  - **The last 10 ms of the spurt's tail.** Before W3-16 the app's tails ran 20 ms longer than Steam's in the demo (482 against 462 ms). The hold as read, with the reads as measured, closes about half of that in W3-16's simulation (473 ms). With either uptime the model's ends are still about 13 ms late, and it gives ends the demo never has. The hold is read, so what is left is in how a read's time sits against the capture's steps (W3-16's order).
  - **The microphone path under the same check.** Set J had a file as the microphone. The capture's 750-sample step is one PC's, and where it comes from was not read. That each step is ready up to 13 ms late is fitted to one PC's chunk pairs. A microphone run with `@voice_spew_activity_check`, Steam's age noted, would show the step, the lateness and the hold at once.
  - Why Steam's reads follow the game's 15 ms tick (measured in Set J, not explained).
  - The empty packet and a pre-roll of zeros were not seen in Set J.
  - **In the app** since W3-16 the hold is the one read and the reads are the ones measured, with the sender's Steam at 9 days unless a render says otherwise (finding 28). It said until then: "the hold is still an exact 0.4 s and the clock the old model, until W3-16" (corrected 2026-11-10).
- **Steam's libopus build.** Settled: the pinned 1.1.5 at Steam's settings gives Steam's decoded sound for a known input in all but 2 of 524,288 samples (Set J, finding 16). Still open:
  - **The soft clip.** Whether Steam's 16-bit decoder softens peaks past full scale, as the library's does in a float build. Nothing in Set J's clips decodes past full scale, so a plain clip would give the same samples. A clip that does decode past it is wanted.
  - **1.1.4 against 1.1.5.** The release is 1.1.4 by the Linux build's own string; Windows is inferred (finding 28). The two were not told apart: 1.1.4 was not built. Whether the one sample that differs is the release or Steam's compiler is not known.
  - **The packets themselves.** No demo was recorded with Set J, so that the bytes are Steam's is inferred from the decoded sound. Constrained VBR and the voice hint make no difference on its clips.
  - Pure tones at 11.5–12 kHz fall into DTX in Steam's encoder more often than in the model.
  - The capture resampler (Windows's or the cable's) is modeled by its measured roll-off, not reproduced. Steam's `mic_outputfile` would give its output; it was not tried.
    - *Added 2026-11-21: reproduced as read since W3-26b: the `steam` capture runs Windows's converter at quality 30 (finding 28) in place of the fitted roll-off. That a capture stream gets this converter at quality 30 is read twice since (finding 28, "From the device to Steam's 16-bit samples", 2026-11-21) and fits one take (measured once); Steam's `mic_outputfile`, asked of the owner on 2026-11-20, is still the test that would settle it sample for sample. Windows dithers the step to 16 bits (read twice); the app does not (not built yet).*
- **Steam's decoder.** Settled on the owner's PC: the `fma3` kernel, the first packet's flush, and that the decoder and its resampler outlive key presses (Set J, finding 29). Still open:
  - Another PC's kernel. Valve ships FFmpeg 8.1.2, and the public 6.1.1 was the one run.
  - The cap of 10 concealed frames and the 17-frame cut are read, and seen once in Set J, through counts and the decoder's state after. Set C shows the refusal over 12 frames seven times by its effect (finding 8; corrected 2026-11-11, BC-1: this said "No take with loss shows them"). Whether the engine asks again for a message it refused was not read; Set J shows no second try.
  - Why the game did not collect the last 34 frames of one key press in Set J.
  - 32 of 524,288 samples of the gate clip still differ by one step, in five frames.
  - The second key presses' sound was not recorded, and the 1 MiB limit leaves the later loops checked by counts only.
- **The gain under Steam.** The rule is sample-exact against Set H, which ran `vaudio_celt`. The same function serves Steam voice (read), where no sample-exact check exists yet: Set J was made at unity gain. The divisor 127 rests on the reading alone (finding 26). So do the wrap of the 32-bit product and the first block at unity when `voice_scale` is not 1: both read twice, neither shown by a take. A take with `voice_scale 0.5` and a file that is loud from its first sample would show the second.
- **PC B's settings.** `volume 0.11` and `voice_scale 0.77` are inferred from recording B and not yet read off that PC (finding 15). Its room is not identified either (finding 32).
- **Stereo capture.** Finding 6 is one capture chain (a stereo virtual cable). A physical microphone is mono either way.
- **Comfort-noise details.** The model reproduces when comfort noise starts and how often it refreshes, but not the random excitation's exact values. For a steady tone below 60 Hz, the sign and height of each near-DC plateau differ from TF2's (finding 18).
- **Output stage.** The interpolation to the device's rate is XAudio2's: measured in five recordings from two PCs, not read. A 44100 Hz device would have none (inferred; no take). Since W3-10 the app runs that interpolation as a model, exact in integers with ties to even, in place of the fitted 3-tap filter; the rounding rule is a choice, not read (the XAudio2 module was not read). The voice's 255/256 with headphones is settled: read, and measured on Set B to four digits (finding 30). The two-speaker level, 182.6/256, is read, with the voice's mixer group inferred from a name match; no take was made with two speakers.
- **Engine codecs.** The CELT codecs' build and settings are read and reproduced on Set H, and the app runs them since W3-06; its Speex is the module's since W3-12b (finding 31). Set H is the game's decoded voice, not its output: no take of the game's output under either CELT codec exists. Whether the receiving side's CELT decoder is reset between spurts was not read (W3-08). Speex is read from a module of another Source game; TF2's 64-bit game falls back to CELT when asked for it, its 32-bit game runs it and records it (Set O: the app's whole render equals both recordings sample for sample); HL2DM's 32-bit game records it too (Set M), and since W3-18 the app's build gives its decoded voice sample for sample (the orchestrator's private run on that build; the whole render at `voice_maxgain 10` runs the gain on the game's blocks since W3-19, finding 31) ([LEGACY_CODECS.md](LEGACY_CODECS.md)).
- **The `miles` profile** (W3-20b). `vaudio_miles` is not a Team Fortress 2 codec: it is a codec of the Source engine family that could be selected in the Source engines of 2006 and 2007, and current TF2 ships its files and refuses the name. It has not been checked against any recording of a running engine. *Corrected by W3-22 (2026-11-13): Its codec stage was checked against one sitting of a 2006 engine on 2026-11-13; the profile as the app runs it was not.* Its codec stage is read from those engines and its codec within one step of their plug-in (finding 31); not known: how many frames a packet held, the encoder's real start-up block (zeros here), what a listener heard at a lost packet (zeros here), and the old engines' mixer and output (TF2's of today here). Its new spurt resets both sides, where the engines reset the receiver only after a pause longer than what it had buffered, and the gain is held, where they reset it with the channel. A recording that could settle these is described at the end of `docs/work-orders/W3-20b-miles-profile.md`; none is planned, and no prediction is registered. *Corrected by W3-22 (2026-11-13): one sitting of Source SDK Base 2006 was recorded on 2026-11-13 (finding 31): a packet held one frame in 2,741 of 2,746 messages, and the codec, reset once before the press, gives 143,796 of the game's 145,800 decoded samples exactly (measured). The start-up block, the lost packet, the mixer and output and the profile as run are still open, and why the receiver's codec was reset twice before a second press was not read. No prediction is registered.*
- **Rooms.** The room effect is read twice and seen in Sets C and D by its echo times, one autocorrelation value, a level and a pattern, and in Set K's room recordings tap by tap (finding 32). Since W3-17c the app's render runs the engine's arithmetic as read, and since W3-17d the page and the live monitor offer it. Still open:
  - **The fully wet room take.** Set K has one (finding 32): all of the voice through room 6, every tap of the module out to 102 ms in it at the module's delay, the strong ones to the sample, with strengths within a few percent. Nothing of the room is checked sample for sample all the same: the map's ambience is in that take and the system's mixer limits its tops, and the retake, which fits the module with a residual 37 to 43 dB under it in its best seconds, is not placed to the sample.
  - **Corrected 2026-11-11 (W3-17d).** The bullet above said "No take has all of the voice through a room, and every take has the game's ambience under it. ... A take with `dsp_room 6` and the three mix variables set to 1 would be the preset's own response to a known voice". Set K's room-6 take is that take.
  - **Why Set B is dry.** `dsp_slow_cpu 1` or `dsp_volume 0` is the likeliest reason (inferred). Reading those two, `dsp_room` and the Sound quality option off the owner's console would settle it.
  - **PC B's 140 ms echo** in Set D. A courtyard preset explains its echo at 88.2 ms and nothing read explains the one at 140.2 ms.
  - **The comb-peak gap in Set C's fit.** The take's four comb peaks are 15 to 25% above the model's. The size class is certain; the reflectivity class is 2 or 3.
  - **What real places measure.** The app has no map. The classes of two rooms come from recordings; their sizes in units are not known. A console log with `adsp_debug 2` would give the engine's own measures for any spot.
  - **Under water:** read twice, and one lossy take (Set K): the level, about 0.77 of the dry voice's, and no tremolo. The water preset has no fade of its own: the W3-17a second read found one instance switched on and off at block starts. Samples cannot match a take: the water preset draws at random.
  - **Random taps.** The engine's random stream cannot be reproduced, so a modulating preset can be matched in kind only.
  - **Not read:** the surround paths; soundscape scripts packed inside maps; which map loads which script; whether anything sets `dsp_room` back to 0 between maps; five processor types that no preset on a voice's path uses; which Sound quality a fresh install picks.
  - **One place where the second read's text and its model differ:** a reflectivity of exactly 0.8, which the text puts in class 2 and the model in class 3 (W3-17's order).
- **Network settings.** Read: how `net_fakeloss` draws (per packet, (N + 1)/101, twice per crossing with sockets for loopback), and so the share of voice messages Set C's settings removed (finding 8). Built (BC-1): on `steam` the control is the share of voice packets that never reach the listener, one message each. Open: how a real-world or one-way loss rate maps to it; how many messages a packet carries at a real server's update rates (BC-6); real internet loss, which was not recorded (Set D ran on a LAN with no loss). The jitter rate is calibrated at one setting (`net_fakejitter 50` with `net_fakelag 100`) and scaled linearly, a fit with no mechanism read (BC-4). *Corrected by BC-4a (2026-11-13): on Steam voice on the game's voice queue the jitter setting is now when messages arrive, by `net_fakelag`'s lists as read, with the lag taken as twice the jitter (finding 9); the fit stays on the other codecs. Open: how often each socket is looked at (chosen), whether the next packet leaves in the same look (inferred), one packet a tick on each crossing through sockets (inferred; Set C's photographs show 59 packets a second with lag on), a lag that changes (a spike, not built yet), and the private run of the build against the takes (the order's check ii). Block 2 of the run sheet would settle the first three.* *Added 2026-11-13: check (ii) is run (finding 9). The jitter take's sound is all present, as the rule gives; in the bursts the counts of skips agree and their size is about twice the model's, and in the noise the take has more skips than the model gives; no reading tried closes the two differences (finding 9, measured). Frame rates under 67 and a rate of exactly 66.67 are open too (finding 9).*
- **Loss on messages or on frames.** Read: a lost packet takes its whole message. Built (BC-1): the `steam` render and live chain lose whole messages, with the decoder's concealment, the 12-frame refusal and each played frame at its own time. Measured: Set C's noise parts follow the rule at `net_fakeloss` 5 and 15 (finding 8). Open: the combined take's extra silence (lag and jitter on); the `speech_loss10` take's level, 0.3 dB further from the render's since BC-1 for a reason not known (finding 8); finding 8's old per-frame event statistic, withdrawn as a yardstick; whether Steam's concealment is the bundled library's sample for sample; the engine's side of the refusal, seen in one log and by its effect in Set C, and whether the engine asks again for a refused message; a real server's packets. (Corrected 2026-11-11, BC-1: this item said the question was not settled and that the app drew loss per frame and did not model the refusal.) *Added 2026-11-13: the combined take's extra silence is the queue's, with about 1.4 points more from jitter (finding 8, closed by the order BC-4's check ii; measured on the model).*
- **The Results tables** were made before W3-11a and before the rooms were known, and have not been made again (see "Results").

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

*Added 2026-11-14 (AC-01): `tests/retiming.mjs` reads each piece's delay as the take against the source, and the suite now renders Steam voice on the game's voice queue, where it is the take against that render. So it refuses JSON with any row rendered at `options.timeline` `'game'`: run the suite through `--manifest` on a scratch copy of `tests/accuracy.takes.json` with `"timeline": "source"` in every row's settings.*

For the receiver's queue (findings 22 and 23), log the console with `voice_loopback 1`, `voice_showincoming 1` and `voice_showchannels 1` set, and note the frame rate. [`tests/voicequeue/`](voicequeue/README.md) turns the log into numbers and replays it through the queue's rule. The log itself stays private.

For Steam's own path against a known input (Set J; findings 16, 28 and 29), the owner's steps are in `docs/work-orders/W3-14-steam-file-input.md` and the method in `docs/reports/W3-14-steam-file-input.md`. Note how long Steam has been running: the hold's length depends on it.

For the room (finding 32), the console readings and the takes still wanted, the fully wet one among them, are in `docs/work-orders/W3-17-room-effects.md`, "The owner's recording". *Corrected by Set K (2026-11-10): the fully wet take has been made. What is still open, and the owner's other runs, are in `docs/owner-runs.md`.* A take for the room is the game's output: `voice_recordtofile` taps the voice before the mixer and holds no room.

Use single quotes around filenames containing `$` in PowerShell. The compare tool reads files locally, prints JSON and uploads nothing. A full run takes a few minutes.
