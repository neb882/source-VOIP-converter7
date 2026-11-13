# The voice path in the app

This document follows a sound through the app, stage by stage, and says what each stage does to it and where each figure comes from. It is about the app. For the game's own rule at each stage see [FINDINGS.md](FINDINGS.md); for how close the app comes to the game see [ACCURACY.md](ACCURACY.md); for the evidence see [tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md), which the entries here name by finding number.

Every figure carries its standing: **read** from the game's or Steam's files, **measured** in the owner's recordings, **inferred**, **guessed**, or **not built yet**. A "fit" is a number chosen so that the app agrees with a measurement; it is the app's and not the game's.

## The path at a glance

This is the path of the `steam` profile, which the Modern preset uses. The other profiles differ at stages 2 to 6 and at stage 8 ([Codecs](#codecs)).

| Stage | What it does to the sound | Where it runs | Standing |
| --- | --- | --- | --- |
| 1. The capture | one channel, clipped to 16 bits, brought to 24000 Hz, the top of the band rolled off | `engine/steam.js` | the app's own; the roll-off is a fit to one PC |
| 2. Steam's sender | cuts the sound into chunks and sends only the loud ones, with 100 ms before and about 0.4 s after | `steam-sender.js` | the rule read; the times of Steam's reads drawn |
| 3. The codec | Opus at 24 kHz and 32 kbit/s; comfort noise in pauses and under steady tones | `opus-codec.mjs`, `vendor/libopus-1.1/` | read and measured |
| 4. The network | takes out whole messages; marks some frames late | `engine/network.js` | loss read; late frames a fit |
| 5. Steam's decoder | 16-bit decoding, at most ten filled frames, 24000 to 44100 Hz | `opus-codec.mjs`, `vendor/swresample/` | read and measured |
| 6. The receiver's gain | turns the voice up to ten times and clips it | `engine/gain.js` | read and measured |
| 7. The voice channel | queues the voice and can start a phrase early | `voice-channel.js` | read; a render runs it when `opts.timeline` is `'game'`; the page does not offer it |
| 8. The mixer and the output | 255/256, the room, the clip, `volume`, the device's rate | `engine/mix.js`, `room-dsp.js` | read; the device's conversion measured |

## The path, stage by stage

### 1. The capture

The app takes one channel of the source, the left one unless you choose otherwise. The game got the left channel of a stereo source over one cable (measured, finding 6).

- **Microphone level.** The sound is multiplied by the microphone gain, 1 by default, and clipped at 16-bit full scale. This is where a loud source distorts before the codec.
- **To 24000 Hz.** The app's own resampler, a windowed sinc, brings the sound to the codec's rate. In the game this is done by Windows or by the audio cable, and that resampler was not read.
- **The roll-off.** A filter lowers the top of the band: nothing up to 11 kHz, −2.2 dB at 11.45 kHz, −6.6 dB at 11.75 kHz and −8.5 dB at 12 kHz. It is a fit to the owner's PC, where the capture measured −0.5 dB at 11.25 kHz, −2.6 dB at 11.45 kHz and −6.5 dB at 11.75 kHz (finding 16). Another PC's capture can differ.
- **16 bits.** The result is rounded to whole 16-bit samples, since Steam's capture is 16 bits (read).
- **Optional filters.** A high-pass and a low-pass can be set by hand. They are the app's own and are off by default.

### 2. Steam's sender

A source file has no packets, so the app makes them as Steam does (`steam-sender.js`; [FINDINGS.md, entry 1](FINDINGS.md#1-steams-sender) and [entry 2](FINDINGS.md#2-the-hold-and-steams-clock)).

- **Chunks.** The capture moves in steps of 750 samples (measured on the owner's PC). A read takes the steps that became ready since the read before: 750, 1500 or 2250 samples.
- **The level rule.** A chunk is sent when the mean of its absolute samples is at least 1.0% of full scale or one sample reaches 15% (read). Quiet chunks are not sent. The page's status line says how many seconds were not sent.
- **Before and after.** The 100 ms before the opening chunk go with it (read). After the last loud chunk the sender holds on for 0.4 s of Steam's float clock (read), so the real length depends on the setting "Sender's Steam has been running".
- **The uptime setting.** The page offers since today, a few days, about a week, about two weeks and about a month. About a week (9 days) is the default: the Steam of one two-PC recording is inferred to have run 6.1 to 12.1 days (finding 28). At that uptime the hold runs out 375 to 437 ms after the read of the last loud chunk (computed from the rule as read).
- **What is drawn.** Only the times of Steam's reads are a model. A read comes 48.0 to 63.7 ms after the one before, drawn evenly (measured range, Set J), and each capture step is ready up to 13 ms late (a fit to one demo). The draw comes from the render's seed, so the same settings give the same file.
- **The gate's controls.** "Gate opens above dBFS" moves the mean rule's threshold; its default, −40 dBFS, is Steam's own 1.0% of full scale (read). With the voice gate switched off every chunk is sent, which is there for comparison.

### 3. The codec

Each message is coded by libopus 1.1.5, compiled to WebAssembly (`vendor/libopus-1.1/`), at the settings read from Steam's client: 24000 Hz, mono, VOIP mode, 32000 bit/s, the voice hint, DTX on, complexity 9 ([FINDINGS.md, entry 3](FINDINGS.md#3-the-codec)). A phrase gets a fresh encoder, as in Steam (read).

What you hear of it: a band to 12 kHz, comfort noise where the encoder went into DTX, and no sound at all where the sender sent nothing.

### 4. The network

- **Packet loss.** On this profile the loss setting is the share of voice messages lost. Each message is lost whole by a draw of its own, which is the game's rule (read). A voice message holds 1 to 4 frames of 20 ms as a rule and usually 8 where a phrase opens (measured; other openings held 3 to 9, the rule gives an opening 9 or 10 at most, and the first packet of each clip of Set J held 12), and the game refuses a message of more than 12 frames (read). The game's `net_fakeloss 5` loses about 22% of messages on a listen server with sockets for loopback (computed, finding 8), so the page's number is not `net_fakeloss`'s number.
- **Jitter.** The jitter setting marks single frames as late. At 50 ms, 3.2% of frames are late; nine in ten of those are filled by the decoder and one in ten plays as silence. This is a fit to one recording (finding 9), and the game has no rule that makes a frame late (read). The game's jitter delays and bunches whole messages; that is the order BC-4, not built yet.

### 5. Steam's decoder and its resampler

The decoder is Steam's as read (`opus-codec.mjs`; [FINDINGS.md, entry 5](FINDINGS.md#5-steams-decoder)).

- **Decoding.** Each frame is decoded to 16 bits. A gap in front of a frame is filled by the codec's concealment, at most 10 frames; a longer gap leaves silence for the rest. An end marker starts a fresh decoder.
- **The refusal.** A message whose sound is longer than 12 frames is dropped whole, as the game drops it (read).
- **The resampler.** Each message goes through a port of FFmpeg's libswresample (`vendor/swresample/swresample.js`) from 24000 to 44100 Hz, one resampler for the whole render. The port runs the `fma3` order of sums, the one the owner's PC runs (measured).
- **Placing.** Each message's sound is laid on the source's timeline, where its chunk was.

### 6. The receiver's gain

The game's automatic gain runs on the decoded messages in blocks of 128 samples ([FINDINGS.md, entry 6](FINDINGS.md#6-the-receivers-gain)). The page's `voice_maxgain`, `voice_avggain` and `voice_scale` are the game's variables with the game's defaults: 10, 0.5 and 1 (read). The gain can be switched off for comparison, which the game cannot do. The game sets the gain back to 1.0 whenever a channel is assigned (read). The page's render does so once, at its start; a render with `opts.timeline` `'game'` does so at each channel it opens, as the game does.

### 7. The voice channel: what the game does, and what the page's render does not run yet

In the game each speaker's voice waits in a queue before it plays ([FINDINGS.md, entry 7](FINDINGS.md#7-the-voice-channel)). The app has that queue as a module, `voice-channel.js`, with its own suite. A render runs it when `opts.timeline` is `'game'` (the `steam` profile only; anywhere else that option is refused). The page does not offer the option (W3-02d, not built yet), and the live monitor does not run the channel (W3-02c-3, not built yet).

So the page's render differs from the game here in four ways:

- **Timing.** The page's render keeps the source's timeline. The game starts some phrases 80 to 350 ms early after a short pause (measured).
- **The wait.** The game's wait before a channel plays, 7 to 30 ticks by the listener's frame rate (read), is not in the page's render. It delays the voice. At 300 frames a second it also makes the ring overflow at nearly every restart, which drops 55 to 136 ms of the phrase's opening, Steam's pre-roll first (read; replayed on Set G's log). The page's render has neither.
- **One sample a packet.** The game drops one sample from every packet, so its playback gains about 0.04% on the talker (read; measured). The page's render does not.
- **The fade.** The game fades the last 0.1 s of its queue (read). The page's render does not.

The page has a stand-in, "Talk-spurt timing", off by default. Set to "Some phrases start early", a phrase that follows a silence of at most 0.45 s starts early with a probability of 0.41, by the silence less a random 0 to 130 ms and at most 350 ms. These numbers are a fit to the takes (finding 19); the rule is not the game's.

### 8. The mixer and the output

These stages are the game's as read (`engine/mix.js`; [FINDINGS.md, entry 8](FINDINGS.md#8-the-mixer-and-the-output)).

1. The voice enters the 44100 Hz mix at 255/256 of its level, cut toward zero.
2. With a room, part of the voice goes through the room's reverb and is added back ([Rooms](#rooms)).
3. The sum is clipped at ±32767, multiplied by `volume` and rounded to 16 bits. The page's `volume` is 1 by default, the game's default; the recordings were made at 0.15.
4. The listener's PC converts 44100 Hz to the device's rate by linear interpolation (measured at 48000 Hz, not read). The page offers 48000 Hz, the default, and 44100 Hz, where nothing is converted (inferred).

The file is as long as the source, plus the room's tail where a room is on. The app plays the voice alone: the game's other sound, and its ducking under a voice, are not part of a render.

## Codecs

The codec menu has six profiles in two groups. Four are in Team Fortress 2, and Steam voice is the default of the game's `sv_voicecodec` (read). Two are not and are marked so in the menu.

| Menu entry | Key | In TF2 | Codec | Rate and frame | Standing against the game |
| --- | --- | --- | --- | --- | --- |
| Steam voice (Opus, 32 kbps) | `steam` | yes | libopus 1.1.5 | 24000 Hz, 20 ms, 32 kbit/s | measured: the decoder's output, all but 2 of 524,288 samples (finding 16) |
| vaudio_celt (CELT, 22 kHz) | `celt_22` | yes | CELT 0.11 | 22050 Hz, 23.2 ms, 64 bytes | measured: the decoder's output, all but 1 of 292,352 samples (finding 31) |
| vaudio_celt_high (44 kHz mode) | `celt_44` | yes | CELT 0.11 in its 44100 Hz mode on 22050 Hz sound | 46.4 ms, 128 bytes, band to about 10 kHz | measured: the decoder's output, all but 75 of 292,864 samples (finding 31) |
| vaudio_speex (Speex, 11 kHz) | `speex` | yes, in the 32-bit game only | Speex 1.0.2 on 11025 Hz sound | 14.51 ms, 20 bytes, band to 5.5 kHz | measured: the decoder's output after the gain, 145,966 of 145,966 samples in TF2's 32-bit game (Set O, finding 31) |
| Fullband Opus: not in the game | `steam_48` | no, never | libopus 1.1.5 | 48000 Hz, 20 ms, 64 kbit/s | none: the app's own extra |
| vaudio_miles: not in TF2 (VR12) | `miles` | no, never | Voxware VR12 on 11025 Hz sound | 32.65 ms, 12 bytes, 2940 bit/s | the codec stage against one sitting of Source SDK Base 2006 (not TF2) with a file as the microphone: 143,796 of 145,800 decoded samples equal (measured 2026-11-13); the profile as the page runs it not checked |

The figures of the game's codecs are in [FINDINGS.md, entry 10](FINDINGS.md#10-the-older-engine-codecs).

**What "the decoder's output" means.** The game can write its decoded voice to a file, and that file was compared with the app's sound at the same point. For the three older codecs no recording of what a listener hears exists, so under them the mixer and the output rest on the reading alone.

**What the profiles other than `steam` do differently.** They run in whole codec frames, not in Steam's chunks.

- **The sender.** The three older codecs, and `miles` (not in TF2), have no voice gate by default: everything is sent. The page's gate, when switched on, is the app's frame gate: a frame over −39.5 dBFS RMS is sent with the 120 ms before it and the 440 ms after it. Those three numbers are a fit to the first recordings of Steam voice (finding 12), not a rule of these codecs. `steam_48` (not in TF2) has that gate on by default.
- **The loss.** Loss takes frames in bursts that average 2.2 frames. That number is a fit to an earlier reading of the loss recordings, which the record has withdrawn for the game (finding 8). The "Frames per packet" setting makes a lost packet take that many frames.
- **A lost frame.** The two CELT profiles fill it with CELT's own concealment. `speex` plays zeros, and so does `miles` (not in TF2): the Speex module has no concealment (read), and what the engine plays in that place was not read.
- **The gain.** On the three older codecs and on `miles` (not in TF2) the gain runs on the decoder's samples from the first one (measured for CELT and Speex, finding 31). On `steam_48` (not in TF2) it runs on the source's timeline.
- **Into the mix.** 22050 Hz voice is doubled once and 11025 Hz voice twice, by the mixer's own rule (read).

**`steam_48`, not in Team Fortress 2.** Opus at 48000 Hz and 64 kbit/s with the frame gate, a float decoder and the app's own resampler. It is the app's own guess at Steam voice with a full band (guessed), and nothing in it was measured against a game.

**`miles`, not in Team Fortress 2.** `vaudio_miles` could be selected in the Source engines of 2006 and 2007; current TF2 ships its files and refuses the name ([FINDINGS.md, entry 11](FINDINGS.md#11-vaudio_miles-and-voxware-vr12-never-in-tf2)). The codec stage is those engines' as read: each sample cut to its top 8 bits, then VR12, 360 samples in 12 bytes. The codec itself is a public implementation, vendored in `vendor/voxware-vr12/`. Its codec stage was checked against one sitting of a 2006 engine on 2026-11-13; the profile as the app runs it was not. Four things in the profile are stand-ins (guessed): the encoder's start-up block is coded as zeros, a new phrase resets both the encoder and the decoder, the gain is held through time in which nothing was sent, and a lost frame plays as zeros. Everything after the gain is TF2's of today, which is not what those engines had. [tests/LEGACY_CODECS.md](../tests/LEGACY_CODECS.md#vaudio_miles) has the detail.

## Rooms

A room is off by default. With one on, the app runs the game's room arithmetic on the voice (`room-dsp.js`, `room-presets.js`; [FINDINGS.md, entry 9](FINDINGS.md#9-rooms)).

**What a room does to the voice.** A share of the voice goes into the room's reverb, the rest stays direct, and the two are added before the clip. The shares are the game's (read): of 256 parts, 26 for a numbered room, and 5 to 72 for the automatic room by its shape. The reverb runs in mono at 44100 Hz in whole numbers, as the game's does, and goes on after the voice ends, so the file is longer than the source by the room's tail.

**What the "Listener position" menu offers.**

| Group | What it is | Standing |
| --- | --- | --- |
| No room effect | the voice with no room, as with the game's Sound quality at Low | read |
| Automatic room, as recorded | the two automatic rooms that the owner's recordings carry | the arithmetic read; echo times and level measured against those recordings |
| Automatic room: examples by shape | fourteen shapes, from a closet to open space | the arithmetic read; the measures are examples |
| Automatic room: places measured on 2Fort | five places, built from the measures the game printed there | the arithmetic read; the measures measured |
| A room the map sets by number | the ten numbered rooms that the game's soundscape scripts ask for | read |

A manual panel sets a room by its number or the automatic room by its measures. Room 6, reached by the manual number, was measured echo by echo to 102 ms (Set K). The panel also has a custom room, which is the app's own and not the game's.

**Under water.** The "Listener under water" switch passes the whole sound through the game's water preset (read). It comes out dull and at about 0.77 of its level, with no tremolo (measured in one recording).

**What is random.** Some rooms move their echoes at random in the game (read). The app draws them from the render's seed, so two renders with the same settings are equal and two runs of the game are not.

**What is not checked.** No room equals a recording sample for sample: every recording has the map's own sound under it. The room's tail was not measured. One echo of the recorded street room is 36% stronger in the app than in the recording, and why is not explained (finding 32).
