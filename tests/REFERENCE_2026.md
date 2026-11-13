# 2026 TF2 voice recordings: what they show

The evidence log: every recording, what was read from the game's and Steam's files, the findings, and the
corrections. A figure's evidence lives here and nowhere else; the other documents state the figure and point to
its finding by number. Nothing is deleted: a statement that a later order or set corrected stays where it stands,
marked *Corrected by ... (date)*, with what is true now. [docs/FINDINGS.md](../docs/FINDINGS.md) states each
finding once as it stands, and [docs/ACCURACY.md](../docs/ACCURACY.md) says, stage by stage, how close the app is.

No recording, source music or derived audio is distributed with this project. The exceptions are the synthetic test
signals, whose generators are in [`tests/testsignal/`](testsignal/). The recordings, logs and demos are the owner's
and stay private; only numbers measured from them are written here.

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

### Set J: Steam with a file as the microphone

The owner set `mic_inputfile` and `@voice_spew_activity_check 1` in Steam's console (finding 27), under the Steam codec. Steam then read a 16-bit mono clip at 24 kHz in place of the microphone, looping it, and printed one line for every capture chunk. The game ran with `voice_loopback 1`, `voice_showincoming 1` and `voice_recordtofile 1` at `voice_maxgain 1`, so its recording is the decoder's output at 44100 Hz (finding 27). No recorder, no cable and no microphone is in the chain. Report: W3-14.

| Clip | Length at 24 kHz | Key presses | Recording of the first press |
| --- | --- | --- | --- |
| continuous: speech with no pause | 120,000 samples (5.000 s) | two, about 22 s each | 524,288 samples (11.889 s), the file's 1 MiB limit |
| gate: tones at −38 and −35 dBFS, a 1.5 ms burst, pauses of 0.3 and 0.7 s, speech | 134,401 samples (5.600 s) | two; the second a tap | 524,288 samples |

The two logs hold 789 chunk lines from Steam and 645 packet lines from the game. The continuous clip's recording peaks at −2.0 dBFS, and no sample of either recording is at full scale. The second presses' sound was not kept.

### Set M: Speex in HL2DM's 32-bit game (2026-11-11)

HL2DM's launcher starts the 64-bit game, which cannot load the 32-bit `vaudio_speex` module; started with `-force32bit` the game runs it (packets of 160 samples at 11025 Hz). The method is Set H's: a file as the microphone, the game writing its decoded voice to a file, at `voice_maxgain 1` (912 frames, 145,920 samples) and at `voice_maxgain 10` (913 frames). The recordings are private; only numbers are here.

- **Before W3-18** the app's Speex 1.0.2 (the library's sources unchanged, compiled strictly) gave the gain-1 recording, on the game's own captured input, in 92,967 of 145,920 samples: within one unit for the first 2.35 s and in 575 of 912 frames, and elsewhere the same sound at the same level (0.014 dB apart, the difference 13 dB under), coded differently from one frame on (measured).
- **Why** (an investigation, 2026-11-11; read, then run): the module's codec arithmetic is SSE2 compiled with the compiler's fast floating-point model, which differs from strict C of the same source in 25 places of 7 files of libspeex, and its float cosine and arc cosine are its C runtime's, not correctly rounded. The module run in a CPU emulator gives the gain-1 recording in 145,920 of 145,920 samples and executes no x87 instruction (reproduced).
- **Exact since W3-18** (measured 2026-11-11 by the orchestrator, privately, on W3-18's build itself: its vendored WebAssembly module on the game's own captured input; and before that on the investigation's prototype of the build, with the same counts): the gain-1 recording in **145,920 of 145,920** samples (912 of 912 frames) and the gain-10 recording in **146,080 of 146,080**, after the app's `receiverAutoGain` at `voice_maxgain 10` run on the whole decoded stream from its first sample. What is exact is the decoder's stream and the gain on that stream. Until W3-19 the app's whole render at `voice_maxgain 10` did not equal the recording: it dropped the codec's 80 samples of delay before the gain, so the gain's 128-sample blocks fell 80 samples off the game's (86,171 of 145,966 samples; 145,840 of 145,840 at `voice_maxgain 1`). W3-19 moved the gain onto the decoder's stream from its first sample (finding 31), and the whole render now gives the gain-10 recording in 145,966 of 145,966 samples (the orchestrator's private run of `TF2Audio.process`, the gain's output at `onGain`, on the game's own captured input, on the branch at b3fad6f). The merged build equals the module run in the emulator on seven synthetic clips (147 of 147 frames), on its cosine and arc cosine (21,389 and 22,155 arguments) and on the 16-bit output of the tests' five runs (reproduced, `tests/speex102.verify.mjs`).

### Set O: Speex in TF2's own 32-bit game (2026-11-11)

TF2 (build 11191711) started with `-force32bit` runs `vaudio_speex` when asked (voice packets of 320 and 480 samples; the 64-bit game falls back to `vaudio_celt`). Set M's method and Set M's input file, one take at `voice_maxgain 1` and one at `voice_maxgain 10`; each recording is 146,080 samples. The recordings are private; only numbers are here.

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
the recordings are published (order RP-01, part e).

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

**Open.** The combined take (lag 100 and jitter 50 on) has more silence and longer runs than 37.0% of messages lost one by one plus the app's late frames give (silent 10.3% against 4.0%; runs 4.8 frames against 4.1); the cause is not known (overtaken packets being dropped is a guess), and it is BC-4's. One stretch of 340 ms of full-level noise in the loss-15 take matches no part of the source (sound made past ten frames). Whether Steam's concealment is the bundled library's sample for sample: the takes' concealed sound falls about 0, 1 and 4 dB over 60 ms and 11 to 18 dB by 180 ms; the library's is similar, a little slower. Block 1 of the run sheet, its log replayed with its own dropped packets (`opts.loseMessage`), would settle it.

**Checked on BC-1's build** (the orchestrator's private run, 2026-11-11). The build equals the prototype above sample for sample at Set C's settings (20 renders), and with nothing lost its renders equal those before it (14 cases of the accuracy manifest). The accuracy suite's level column, before BC-1 and after: loss15 −1.4 dB and +0.0; combined −1.7 and +0.3; loss5 +0.1 and +0.4 (seeds within +0.26); `speech_loss10` +0.2 and +0.4 to +0.5, 0.3 dB further from 0 than before, for a reason not known. Under jitter of 200 ms and more the prototype, which placed a packet at its first block's frame, put arriving frames at the wrong slot; the build's rule (the cursor plus the frames nobody fills) puts every arriving frame at its own slot (the build's review).

**What the app does since BC-1.** On the `steam` profile (the render, its stream and the live chain) the loss setting is the share of the sender's messages that never reach the listener, each message one packet with a draw of its own (`steamMessageLoss`). A lost message's frames are encoded and never decoded; they count toward the gap in front of the next frame to arrive, and up to ten of them are concealed there; its end marker does not reach the decoder. A message that comes to more than 12 frames is resampled and then dropped (finding 29). Every frame that is played lies at its own time: the time of frames nobody fills stays silent and later sound does not move, a stand-in for the queue until BC-3. The late frames of finding 9 are drawn as before. The other profiles keep the per-frame model above. `tests/accuracy.takes.json` gives Set C's loss takes 21.7, 49.8 and 37.0.

### 9. Jitter adds isolated late frames

*Corrected by BC-2 (2026-11-11): the game has no path that makes a frame late. The title and the first paragraph say what the recordings looked like, not the game's rule; the app's late frames are the earlier fit, and the rule that replaces it is not built yet (BC-4). See the correction below.*

With `net_fakelag 100` and `net_fakejitter 50`, about 1.4 extra events per second appear (3% of frames). They are single frames: 81% last one frame, against 51% for packet loss. Nine in ten are concealed and about one in ten plays as a short silence, consistent with a frame that arrived too late for playback.

**Corrected 2026-11-11 (BC-2, from the reads of `docs/reports/bad-connections-plan.md`).** The game has no path that makes a frame late, and none that conceals a late one. `net_fakelag` and `net_fakejitter` hold each packet in a first-in-first-out list per socket and release only the list's head, so jitter delays and bunches packets but cannot reorder or lose them (read). The receiver has no playout deadline: a late message is appended to the speaker's queue, or opens a new channel if the queue ran dry first (read, W3-03). Measured on the same take, no sound is missing: 96.0% present against the baseline's 96.5%, 0.2% silent in both. So the events above are not late frames. What they most likely are (inferred, not checked): skips, where a bunch of messages overflows a queue that a restart had already filled; the take's clock runs 726 ppm fast against the baseline's 416, about 0.3 ms more sound skipped a second. The app's jitter setting is still this finding's fit (3.2% of frames marked late at 50 ms, nine in ten concealed, one silent) until BC-4 replaces it with arrival times through the queue. The title is kept for the links to it.

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

This flat rule is what the app runs today when the option is on. It cannot chain early starts, and the speech take has two chains (W3-01). The engine's queue (findings 22 to 25) is to take its place. It is built as a module, `voice-channel.js` (W3-02a), which no render uses yet. W3-02b added Steam's sender and the queue's timeline as modules. Since W3-11a the `steam` render makes its packets with that sender, but it still lays them on the source's timeline. Orders W3-02c and W3-02d put the queue into the render and the page, and W3-02f retires the flat rule. *Corrected by the plan review of W3-02c (2026-11-11): W3-02c is three orders, W3-02c-1 (the module as read; built and merged 2026-11-12, `a2b7dc9`, no render runs it yet), W3-02c-2 (the render) and W3-02c-3 (the live chain). The wording here waits for W3-02c-1's merge.*

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

The engine copies a decoded packet into the ring through an interpolator that writes one sample fewer than it was given: the packet's first sample is in effect left out (read, W3-03). The engines of Source SDK Base 2006 and 2007 have the same rule, at a step of exactly 1.0: read, and run, where ten packets of 360 samples put 3,590 samples in the buffer (added 2026-11-11, W3-20b). In the logs every packet of N samples that neither overflows nor meets a pull raises the queue by exactly 2 × (N − 1) bytes (measured, Set G; a replay that keeps the sample fails).

Steam hands voice out in about 17.8 packets a second (finding 25), so playback gains about 0.04% on the sender: 17.8 / 44100 is 403 ppm. This is the "clock" of the accuracy suite, 404 to 406 ppm on most takes. It is not a recorder's clock, and it follows the packet rate: the one take at 505 ppm had 22.3 packets a second. The playback does not get shorter: the mixer plays in real time and the queue gets shallower.

*Corrected by RP-01a (2026-11-13): that take's clock is +510 parts in a million in the accuracy suite's reading (measured; `take3_voice_maxgain_1` in the table of `docs/ACCURACY.md`). 22.3 packets a second over 44,100 samples a second is 506 (computed). The 505 above is that figure or an earlier reading of the take (inferred; the record does not say which).*

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

What the app does not do, or does not show:
- **The 17-frame cut is not in the app,** and a render of a file cannot reach it: an opening is at most 9 or 10 frames with nothing concealed in front (its first number is below any old expected number), and a later message at most 6 frames behind at most 10 concealed (inferred, W3-16's order), so a record is at most 16 frames; the tests find none longer. The cut goes to W3-02g, with a demo's own packets. (Corrected 2026-11-11, BC-1: this bullet said "The 17-frame cut and the 12-frame refusal are not in the app", and of the refusal, "The app then plays what the game would drop. [...] the refusal waits on the loss question below.")
- **Not shown by any recording:** the soft clip, libopus 1.1.4 against 1.1.5, and anything of the microphone path (finding 28).
- **A demo's received voice** still decodes to float and uses the app's own resampler (W3-02g). Since W3-11b the live chain for `steam` runs the render's decoder and resampler. (Corrected 2026-11-10, W3-11b: this line said "The live chain still decodes to float and uses the app's own resampler until W3-11b. So does a demo's received voice.")

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

<details><summary>This section's head as it stood before 2026-11-12</summary>

"The game" is what was read or measured. "The app today" is what the code runs at the merge of W3-11a, W3-16, W3-11b, W3-10, W3-17c, W3-17d and BC-1 and of nothing later (`constants.js`, `audio.js`, `opus-codec.mjs`, `steam-sender.js`), with the order that will change each row known to be wrong. The orders are in `docs/work-orders/`, and their sequence is in `docs/reports/W3-11-plan.md`, "The order of work", as `docs/PROGRESS.json` keeps it up to date.

- **Merged:** W3-02a (the queue as a module), W3-02b (Steam's sender and the queue's timeline as modules), W3-05 (the gain), W3-06 (CELT), W3-12a and W3-12b (Speex), W3-13 (the resampler's port), W3-11a (the `steam` render), W3-16 (the hold and the read clock), W3-11b (the `steam` live chain on the render's stages), W3-10 (the mixer and the output stage), W3-17a and W3-17b (the room module and the automatic room), W3-17c (the room in the render), W3-17d (the rooms on the page and in the live chain), BC-1 (loss by whole messages on `steam`).
- **Not built:** W3-11c (Steam's key rules; the live chain's push-to-talk is the app's stand-in until then), W3-02c to W3-02g (the receiver's channel in the render, on the page and for a demo).

</details>

A row's "render" is the offline render and its stream, which give the same samples. The live chain is named where it differs.

| Stage | The game | The app today | Basis |
| --- | --- | --- | --- |
| Capture | Steam opens the capture at 24 kHz, mono, 16-bit; Windows or the virtual cable converts from the device's rate. A stereo cable reached the game as its left channel | left channel of stereo input, resampled to 24 kHz and clipped at 16-bit full scale. Since W3-11a the `steam` render rounds it to 16 bits, ties to even, before the sender. Since W3-11b the live chain does the same, with the capture filter's delay dropped as in the render | findings 6 and 28 |
| Capture roll-off | the capture's resampler on the sender's machine. On the owner's PC: −0.5 dB at 11.25 kHz, −2.6 dB at 11.45 kHz, −6.5 dB at 11.75 kHz | 0 dB to 11 kHz, −2.2 dB at 11.45 kHz, −6.6 dB at 11.75 kHz, −8.5 dB at 12 kHz (255-tap FIR at 24 kHz, before the gate and encoder) | findings 14, 16 and 28 |
| Voice gate | Steam's chunk rule. A chunk is the whole capture steps since Steam's last frame (750 samples each: a 32nd of the one-second capture buffer Steam asks for; the number is not in Steam's code). Open when mean \|x\| ≥ 1.0% of full scale or a sample ≥ 15%; 2400 samples kept before the onset's chunk; held 0.4 s on Steam's 32-bit float clock of seconds since Steam started, which is 398 to 406 ms of real time on a Steam under a day and a half old and 375 to 500 ms up to 24 days; one chunk a message, cut into 480-sample frames with the remainder kept; the end marker; the encoder and decoder reset per spurt. Steam reads every 48 to 64 ms | **The `steam` render, since W3-11a:** Steam's rule, through the sender of W3-02b with the render's seed: chunks, the mean-or-peak gate, the pre-roll, the hold, one message per chunk, the end marker; the hold in floats and the read clock as measured since W3-16, with the sender's Steam at 9 days by default (the page's "Sender's Steam has been running"). **The live chain, since W3-11b:** the same sender with the render's seed and uptime, timed on the samples given to it, the key held throughout; push-to-talk is the app's stand-in (zeros while the key is up), not Steam's key rules (W3-11c). `steam_48` keeps the frame fit. The CELT and Speex profiles have no gate | findings 5, 12 and 28; Sets D, G and J |
| Codec | libopus 1.1.x (1.1.4 by the Linux client's string; Windows inferred): Opus 24 kHz mono, VOIP, signal=voice, 32 kbps constrained VBR, complexity 9 (the default), DTX, 20 ms; 16-bit samples in and out; at most 10 frames concealed per gap; at most 17 frames decoded from one record | libopus 1.1.5 at both ends with the same settings, complexity 9. **The `steam` render, since W3-11a:** 16-bit samples in, the library's own 16-bit decoder out, a new encoder per spurt, at most 10 frames concealed. Driven by Steam's chunks it gives Steam's recording in 524,286 of 524,288 samples (Set J). Since BC-1 a new decoder only at an end marker that arrives (one lost carries the decoder into the next spurt), and the refusal of a message over 12 frames. Not in the app: the 17-frame cut, which a file render cannot reach (W3-02g). **The live chain, since W3-11b:** the render's, under loss too since BC-1 | findings 11, 13, 16, 28 and 29; Set J |
| Decoder's resampler | FFmpeg's libswresample at its defaults (32 taps, 147 phases, Kaiser window), 24000 to 44100 Hz, in float, once per packet, one resampler per speaker for the whole session. Its first packet is flushed, which leaves everything after 16 input samples late. The `fma3` kernel on the owner's PC | **The `steam` render, since W3-11a:** the port of that library's float path (W3-13) with the `fma3` kernel, one resampler per render, fed whole messages, with the first-packet flush. Equal to Steam's recording given the decoded samples (Set J). **The live chain, since W3-11b:** the render's, one resampler a chain (a settings change makes a new one: the app's own). A demo's received voice (W3-02g): the app's own windowed-sinc resampler | finding 29; Sets G and J |
| Voice rate | 44.1 kHz for Steam voice; the mixer runs at a fixed 44100 Hz | 44.1 kHz | block-rate lines, post-decode clipping; read: findings 22 and 30 |
| Voice channel | a 0.5 s ring per speaker; a new channel waits ceil(0.1 × frames a second) ticks of 15 ms at `voice_buffer_ms 100`; a spurt that arrives before the ring is found empty is appended; one sample dropped per packet; the last 0.1 s of the queue faded | not in a render. The source's timeline is kept, with the flat rule of finding 19 as an option (`voice_retime`). Since W3-11a the `steam` render lays each spurt's decoded packets on that timeline, one after the other from the spurt's start; no sample is dropped per packet and nothing waits or is appended. The ring and its timeline exist as modules (`voice-channel.js`, W3-02a and W3-02b). W3-02c and W3-02d run them in the render and on the page, at `fps_max 300` and `voice_buffer_ms 100`; W3-02f retires the flat rule; W3-02g feeds the ring a demo's own packets | findings 19 and 21 to 25 |
| Auto-gain | finding 26's rule: finding 3's law in 128-sample blocks; `voice_scale` entering twice; the step is the difference over 127; an integer block mean; a decoded block of zeros sends the gain to the cap; reset to 1.0 when a channel is assigned. Defaults `voice_avggain 0.5`, `voice_maxgain 10`, `voice_scale 1` | the engine's rule since W3-05, sample-exact on Set H. **The `steam` render, since W3-11a:** fed the decoded packets in order, a silence record's zeros included, so the gain goes to the cap after each spurt as in the game; reset once only, at the render's start (the channel's resets: W3-02c). **The `steam` live chain, since W3-11b:** as the render, reset when the chain is made. **`celt_22`, `celt_44`, `speex` and `miles` (not in TF2), since W3-19:** on the decoder's own stream from its first sample, the codec's delay dropped after the gain. **`steam_48` (not in TF2):** on the source's timeline, held through blocks the gate did not send. *Corrected by W3-19 (2026-11-11): this row said "The other profiles: on the source's timeline". See finding 31.* | findings 3, 4, 26 and 31; Sets B, H and M |
| Mixer: the voice's entry | the voice enters the mix at 255/256, truncated toward zero, with headphones (182.6/256 with two speakers). With a room it enters twice: the direct share and the room's share. While a voice channel is assigned, all other sound falls to half | since W3-10 the entry as read: each voice-rate sample as a 16-bit value (a value that is not whole, with the auto-gain off, rounded to the nearest, ties to even), entered at 255/256 in single precision, truncated toward zero, at the voice's own rate; the CELT voices then upsampled by two once and the Speex voice twice by the engine's rule, each stage with its own state (finding 30). The render, its stream and the live chain run the same code. Since W3-17c, with a room the render enters the voice twice, at the room's two shares, by the same entry, each part upsampled on its own. Since W3-17d the live chain does the same with a room or under water. Not in the app: the two-speaker level, any other sound and its duck | findings 30 and 32; Set B for the 255/256 |
| Room | set by the map's soundscape; most ask for the automatic room, which the engine builds from two templates by the shape and size it measures. The voice's share is the preset's: 26/256 for a numbered preset, 5 to 72 of 256 for the automatic room. Mono, 44100 Hz, integers, before the clip and `volume`; the tail runs on. Off at Sound quality: Low (`dsp_slow_cpu 1`). Under water the whole sum passes preset 14, whose amplifier settles at 1640/4096 (0.40) with no tremolo; the reverb after it builds the low end back up, and a voice comes out at about 0.77 of its level (Set K) | **The render, since W3-17c:** the engine's arithmetic as read (`room-dsp.js`, W3-17a and W3-17b), bit for bit against a second implementation: the voice's two shares, the room's preset on the room part, the sum before the clip, under water the sum through preset 14, the tail by a rule on the output; a numbered preset, the automatic room by example or measured measures (the app has no map), or the app's own custom room; random taps from the render's seed. The default is no room, which runs nothing of it. **The page and the live chain, since W3-17d:** the listener position offers no room (the default), the two rooms as recorded, 14 examples by shape, five places measured on 2Fort, the ten numbered rooms of the soundscape scripts, and a manual number with the automatic room's measures; under water is a checkbox; the live chain runs the same room path, kept by its worker, with the engine's 200 ms cross-fade on a change | finding 32; Sets B, C, D and K; W3-15, W3-17 |
| Output stage | the sum of all sound (the direct voice, the room's reverb, the game's other sound) clipped at ±32767; `volume`; rounding to 16 bits; then XAudio2's linear interpolation to the device's rate (48000 Hz in the takes; none on a 44100 Hz device) | since W3-10: the mix (the voice alone) clipped at ±32767, `volume` as a single, rounded to 16 bits, ties to even; then the listener's device, the page's "Listener's sound device" (`snd_device_rate`, the app's own setting): 48000 Hz by default, by linear interpolation from phase 0, each output rounded to the nearest 16-bit value, ties to even (a model: the kernel is fixed by the recordings, its precision and rounding were not read); 44100 Hz has none. The output is at the device's rate, with the source's duration. No filter and no limiter. With a room (since W3-17c) the room path's sum, in integers, is what is clipped; the old room code and the listener's low-pass, which sat there in floats until then, are gone. `volume` defaults to 1, the game's own. Before W3-10: the fitted 3-tap `[0.1, 0.8, 0.1]` at 44.1 kHz, `volume` in floats, a sinc resampler to the source's rate and a soft limiter at 0.98 | findings 1 and 30 |
| Network | read: a packet is lost whole, an out-of-order one is a lost one, and one carries one voice message on a listen server; `net_fakeloss N` draws (N + 1)/101 per packet, four times on Set C's path, so 21.7, 37.0 and 49.8% of messages at 5, 10 and 15. Steam's decoder conceals at most 10 frames of a gap, when the next frame arrives; the game refuses whole a message that comes to more than 12 frames. Measured on a listen server: Set C's noise parts fit the rule at 5 and 15 (finding 8); jitter, finding 9 | **The `steam` render, its stream and the live chain, since BC-1:** each of the sender's messages is a packet, lost whole by a draw of its own; a gap is concealed when the next frame arrives, its last 10 frames at most; frames lost at a spurt's end are not played; a lost end marker carries the decoder into the next spurt; a message over 12 frames is refused; every played frame at its own time, the rest silent (a stand-in for the queue, BC-3). The live chain is the render, sample for sample. Jitter on every profile: 3.2% of frames late at 50 ms (scaled linearly), one in ten silent, a silent late frame 20 ms of zeros (a fit). **The other profiles:** lost frames in Gilbert-Elliott bursts, mean 2.2 frames, drawn per frame (the earlier fit). Until BC-1 the `steam` render drew the bursts too, had no refusal, closed up after a gap of more than ten, and its live chain laid the rest of such a spurt later | findings 8, 9 and 29 |
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

**Set C.** The app rendered the network test signal and was measured the same way as the takes. (Note 2026-11-11, BC-1: this table was made with the per-frame loss model, which the `steam` profile no longer runs, and has not been made again; finding 8 withdraws its take column.)

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
- **The queue, not recorded.** The fade and the underrun padding in sound; a listener under 67 frames a second; the queue under the engine codecs. By the rule a long transmission drains the queue, since nothing refills it inside a spurt: after 20 minutes from a full ring, with a gap in continuous sound when it runs out. No take is long enough to show it.
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
- **Network settings.** Read: how `net_fakeloss` draws (per packet, (N + 1)/101, twice per crossing with sockets for loopback), and so the share of voice messages Set C's settings removed (finding 8). Built (BC-1): on `steam` the control is the share of voice packets that never reach the listener, one message each. Open: how a real-world or one-way loss rate maps to it; how many messages a packet carries at a real server's update rates (BC-6); real internet loss, which was not recorded (Set D ran on a LAN with no loss). The jitter rate is calibrated at one setting (`net_fakejitter 50` with `net_fakelag 100`) and scaled linearly, a fit with no mechanism read (BC-4).
- **Loss on messages or on frames.** Read: a lost packet takes its whole message. Built (BC-1): the `steam` render and live chain lose whole messages, with the decoder's concealment, the 12-frame refusal and each played frame at its own time. Measured: Set C's noise parts follow the rule at `net_fakeloss` 5 and 15 (finding 8). Open: the combined take's extra silence (lag and jitter on); the `speech_loss10` take's level, 0.3 dB further from the render's since BC-1 for a reason not known (finding 8); finding 8's old per-frame event statistic, withdrawn as a yardstick; whether Steam's concealment is the bundled library's sample for sample; the engine's side of the refusal, seen in one log and by its effect in Set C, and whether the engine asks again for a refused message; a real server's packets. (Corrected 2026-11-11, BC-1: this item said the question was not settled and that the app drew loss per frame and did not model the refusal.)
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

For the receiver's queue (findings 22 and 23), log the console with `voice_loopback 1`, `voice_showincoming 1` and `voice_showchannels 1` set, and note the frame rate. [`tests/voicequeue/`](voicequeue/README.md) turns the log into numbers and replays it through the queue's rule. The log itself stays private.

For Steam's own path against a known input (Set J; findings 16, 28 and 29), the owner's steps are in `docs/work-orders/W3-14-steam-file-input.md` and the method in `docs/reports/W3-14-steam-file-input.md`. Note how long Steam has been running: the hold's length depends on it.

For the room (finding 32), the console readings and the takes still wanted, the fully wet one among them, are in `docs/work-orders/W3-17-room-effects.md`, "The owner's recording". *Corrected by Set K (2026-11-10): the fully wet take has been made. What is still open, and the owner's other runs, are in `docs/owner-runs.md`.* A take for the room is the game's output: `voice_recordtofile` taps the voice before the mixer and holds no room.

Use single quotes around filenames containing `$` in PowerShell. The compare tool reads files locally, prints JSON and uploads nothing. A full run takes a few minutes.
