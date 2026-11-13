# TF2 Voice Emulator

This project is two things.

One is a browser tool. It plays any sound the way a Team Fortress 2 player's voice reaches another player: Steam's sender decides which stretches are sent, a real codec codes them, and the receiving game turns the voice up and clips it. Use it at **https://neb882.github.io/source-VOIP-converter7/**. Nothing is uploaded: the sound stays on your computer, and once it has loaded the page works offline.

The other, beside the tool, is a record of how the Source engine's voice path works, with each part marked as **read** (from the game's or Steam's own files), **measured** (in recordings of the game), **inferred** or **guessed**: [docs/FINDINGS.md](docs/FINDINGS.md). Where something is planned and not there, the documents say **not built yet**.

## Use it

The page has four steps.

**1. Source.** Choose or drop an audio or video file or a TF2 demo, record from the microphone, or switch on **Live** to hear your microphone through the voice path as you speak.

| Limit | Value |
| --- | --- |
| an audio file | 100 MB |
| a video file (its picture is copied, not decoded) | 1 GB |
| a demo | 512 MB |
| the length of a sound | 10 minutes; of a demo, the first 10 minutes of voice are kept |
| a recording from the microphone | 5 minutes |

**2. Sound.** Five presets set the whole path:

| Preset | What it sets |
| --- | --- |
| Modern | Steam voice, the codec of the 2026 recordings, with no room |
| Legacy CELT | the older engine codec `vaudio_celt` |
| Mic Spam | Steam voice with the microphone three times too loud, in a tunnel |
| Under water | Steam voice with the microphone twice too loud and the listener under water |
| Laggy | Steam voice with 18% of voice messages lost and 50 ms of jitter |

The codec menu has two groups, "Team Fortress 2" and "Not in Team Fortress 2". A preset leaves four settings of the two PCs alone: how long the sender's Steam has run, the channel taken from a stereo file, the rate of the listener's sound device, and the listener's frame rate. Settings are remembered in this browser, and the console's `writeconfig` copies a link that carries them.

**3. Render & listen.** A source renders by itself. After a changed setting, a source of a minute or less renders again by itself. A longer one renders again by itself after a change on the receiver's side alone (listed below), when its render on screen took at most 30 s on this device; after any other change it is marked as made with the earlier settings until you press **Render**. On Steam voice a render plays the voice through the game's voice queue, at the listener's frame rate (300 frames a second, the game's default cap) with `voice_buffer_ms` 100, so a phrase after a short pause can start early, as in the game. **Phrase timing** set to "The file's own timing" keeps every sound where the source has it; a demo's voice, a video and the live monitor always keep it. A render after a changed setting runs again only the stages from that setting on: a change on the receiver's side (its gain, Phrase timing, the frame rate, the voice buffer, volume, the room, the sound device) skips the sender and the codec, and a change to the sender's gate or bit rate or to the network skips the capture. A clip longer than 30 s can be played from its first 14 s while the rest renders, except with loss, jitter, a room or under water, a sound device at a rate other than 44.1 or 48 kHz, or a demo; a change on the receiver's side alone plays none with the codec on, and plays them with the codec skipped. **Cancel** stops a render and keeps what was already done for the next one. **Hear** switches between the render, the original and, when one is loaded, a real take of the game. The status line says how long the render took and how many seconds were too quiet to be sent. Downloads are WAV, FLAC or MP3, and an MP4 or MOV video comes back with the render as its sound.

**4. Batch.** Render many files with the same settings, then save them one by one or as one ZIP.

[docs/PAGE.md](docs/PAGE.md) describes every control.

## What you hear, in five steps

1. **Steam's sender.** Only stretches loud enough are sent, with the 100 ms before each (read) and about 0.4 s after it (read). Quiet stretches come out as silence.
2. **The codec.** Opus at 24 kHz and 32 kbit/s (read). The band ends at 12 kHz, and held pauses and steady tones turn into comfort noise (measured).
3. **The network.** A lost packet takes a whole voice message (read). A voice message holds 1 to 4 frames of 20 ms as a rule and usually 8 where a phrase opens (measured; other openings held 3 to 9, the rule gives an opening 9 or 10 at most, and the first packet of each clip of Set J held 12), and the game refuses a message of more than 12 frames (read). The decoder fills at most 10 lost frames (read). The page's "Packets lost %" is the share of voice messages lost: the game's `net_fakeloss 5`, on a listen server with sockets for loopback, already loses about 22% of them (computed, finding 8).
4. **The receiver's gain.** The game turns the voice up as far as ten times and clips what passes 16 bits (read; measured). This gives TF2 voice most of its character.
5. **The mixer and the output.** The voice enters the mix at 255/256 (read), passes a room where one is set, is clipped and multiplied by `volume`, and is converted to the rate of the listener's sound device (measured).

[docs/VOICE-PATH.md](docs/VOICE-PATH.md) follows each stage and says where each figure comes from.

## Codecs

| Menu entry | What runs | In TF2 | Checked against the game |
| --- | --- | --- | --- |
| Steam voice (Opus, 32 kbps) | libopus 1.1.5 with Steam's sender and decoder | yes | the decoded voice, sample for sample |
| vaudio_celt (CELT, 22 kHz) | CELT 0.11 | yes | the decoded voice, sample for sample |
| vaudio_celt_high (44 kHz mode) | CELT 0.11 in its 44100 Hz mode | yes | the decoded voice, sample for sample |
| vaudio_speex (Speex, 11 kHz) | Speex 1.0.2 | yes, in the 32-bit game | the decoded voice after the gain, sample for sample |
| Fullband Opus: not in the game | Opus at 48 kHz, the app's own extra | **no** | no: there is no game to check it against |
| vaudio_miles: not in TF2 (VR12) | Voxware VR12, as the Source engines of 2006 and 2007 ran it | **no** | no |

"Sample for sample" means all samples but a few that are one step off; the counts are in [docs/VOICE-PATH.md](docs/VOICE-PATH.md#codecs). For the three older codecs only the decoded voice was recorded, not what a listener hears.

`vaudio_miles` is not a Team Fortress 2 codec: current TF2 ships its files and refuses the name. Its codec stage was checked against one sitting of a 2006 engine on 2026-11-13; the profile as the app runs it was not. Its entry is in [docs/FINDINGS.md](docs/FINDINGS.md#11-vaudio_miles-and-voxware-vr12-never-in-tf2), and [tests/LEGACY_CODECS.md](tests/LEGACY_CODECS.md) has what is known of the older codecs.

## What we found

Each line is one entry of [docs/FINDINGS.md](docs/FINDINGS.md), which gives the rule, its standing, the date of the reading and, where it can be done, how to check it on your own PC. [docs/REPRODUCE.md](docs/REPRODUCE.md) gives the steps and one script for the checks that are built: the older engine codecs, the receiver's gain, the mixer's ceiling and the game's clock in a recording of the output, and Steam's packets in a SourceTV demo.

1. [Steam's sender](docs/FINDINGS.md#1-steams-sender) sends a chunk of the microphone only when its mean level is at least 1.0% of full scale or one sample reaches 15% (read; measured).
2. [The hold](docs/FINDINGS.md#2-the-hold-and-steams-clock) after speech is 0.4 s on a clock that gets coarser the longer Steam has run: 398 to 402 ms on a Steam started today, 500 to 750 ms from 24.3 to 48.5 days (read and computed; measured on a Steam of 4.8 minutes and on one of 23.9 days).
3. [The codec](docs/FINDINGS.md#3-the-codec) is libopus 1.1.x at 24 kHz, and its comfort noise replaces held pauses and steady tones (read; measured).
4. [The network](docs/FINDINGS.md#4-the-network) loses whole messages and never makes a single frame late (read).
5. [Steam's decoder](docs/FINDINGS.md#5-steams-decoder) fills at most 10 frames and resamples each message by itself with FFmpeg's resampler, and the game refuses a message longer than 12 frames (read; measured).
6. [The receiver's gain](docs/FINDINGS.md#6-the-receivers-gain) works in blocks of 128 samples with a cap of ten times, and `voice_scale` enters it twice (read; measured).
7. [The voice channel](docs/FINDINGS.md#7-the-voice-channel) queues each speaker's voice, so a phrase after a short pause can start 80 to 350 ms early (read; measured).
8. [The mixer and the output](docs/FINDINGS.md#8-the-mixer-and-the-output) clip at ±32767 before `volume`, and Windows converts the result to the device's rate by linear interpolation (read; the conversion measured).
9. [Rooms](docs/FINDINGS.md#9-rooms) take a share of every voice where the map sets one: 26 parts of 256 for a numbered room, 5 to 72 for the automatic room (read; measured in three sets).
10. [The older engine codecs](docs/FINDINGS.md#10-the-older-engine-codecs) run at 22050 and 11025 Hz, and Speex is fed 11025 Hz sound though it is made for 8000 Hz (read; measured).
11. [`vaudio_miles`](docs/FINDINGS.md#11-vaudio_miles-and-voxware-vr12-never-in-tf2), never in TF2, is Voxware VR12 behind a cut to 8 bits (read; its codec measured against one sitting of a 2006 engine).

The same document says what rests on one PC and what others had published before.

## Accuracy

**What is not exact.** The stages that equal the game sample for sample do not speak for these. Phrase timing comes first: the page's render runs the game's voice queue on Steam voice.

- **Which phrases start early.** A render shows one draw of the sender's clock. At 300 frames a second a render has the take's kind of change between phrases in 327 of 360 (seeds times changes) at pauses of 240 ms, in 114 of 300 around 420 to 440 ms, and in 155 of 270 on the speech take (measured, private runs; finding 28). At 66.67 frames a second it does no better than no timing model (measured, private). Part of this cannot be closed, because where the sender's clock stood while the talker spoke is not in a recording.
- **The frame rate is one number.** A real game's rate moves, and one long frame ends the wait at once (read). What that does to a render is guessed.
- **The start and the end.** On the game's queue a sound that opens the channel loses pieces of its first seconds. At 300 frames a second a half-second tone is as long as the source and sounds from 35 ms: the first 12 ms of the source never play, and 32.7 ms more are cut out in four places. A 3 s tone has three cuts in its first 1.4 s, and 60 s of unbroken sound nine, the last at 17.3 s. At 66.67 frames a second there is no cut, and the sound starts 31 ms late (39 ms on speech). These are the page's own draw, which is the same in every page render, measured on the model. Over seeds 1 to 10 a render at 300 frames a second loses 0 to 16.5 ms of the source's head, 11.4 ms in the worst case rendered, and at 66.67 and 100 frames a second up to 56 ms; at those two rates it can lose up to 47 ms of its end (measured on the model; [the W3-02c-2 report](docs/reports/W3-02c2-render-channel.md)). The game's side: at 300 frames a second the ring was full when it started to play in 24 of 28 channels, and each of 16 restarts dropped 55 to 136 ms of what was queued, Steam's pre-roll first and then the onset (measured, Set G's logs, finding 23); the takes show skips of any size after a restart (findings 22 and 23). So the cuts are the game's behaviour as read and as logged; where each piece falls inside the sound is the model's.
- **Long unbroken sound at a low frame rate.** At 66.67 frames a second the level first dips after 0.4 to 3.2 minutes (median 2.2) and is first more than 3 dB down after 2.4 to 4.8 minutes; at 100, 144 and 200 the first dip comes at 2.5 to 4.9, 5.1 to 8.0 and 8.7 to 9.9 minutes (9 of 20 seeds). At 300 ten minutes play with no fade and no underrun in 26 seeds, with the cuts to overflow of the first seconds above (measured on the model; the rules are read; no take shows it).
- **Loss on the game's timeline.** At 15% loss the render at 300 frames a second is silent 16.4% of the time against 10.1% in the one take (measured, private). The check against the game's log (BC-3) is not built yet.
- **Jitter.** The jitter setting is a fit to one recording. The game's own behaviour, whole messages delayed and bunched (BC-4), is not built yet.
- **The codec lane and the real-take panel** were made for the file's own timing; their order for the game's (W3-02e) is not built yet.
- **The one codec in the menu that comes from older Source engines** and was never in TF2. Its codec stage was checked against one recording of a 2006 engine; the profile as the app runs it was not.

**The finish line.** The tool is finished when every stage of the modern preset is either equal to a take sample for sample or has its remaining difference measured and explained. The research beside it (the older codecs beyond TF2's, bad connections in depth) has no finish line and is a second track.

**Where the modern preset stands.**

- **Equal to the game's own recordings:** Steam's sender rule (every verdict and message of the checked runs), the codec with the decoder and its resampler (all but 2 of 524,288 samples), and the receiver's gain (every sample, checked under `vaudio_celt`).
- **Read from the game's files, not yet seen in a recording:** the fade at the end of the queue (in the page's render on the game's voice queue) and the voice's level with two speakers in place of headphones.
- **Fitted to recordings, with no rule read:** the capture's roll-off above 11 kHz, the times of Steam's reads, and the jitter.
- **Not built yet:** the voice channel in the live monitor (W3-02c-3, not built yet), jitter as the game does it, and Steam's own push-to-talk rules.

**The figures.** Against the owner's 18 takes, on 2026-11-12, the overall level of the plain takes is within about 0.1 to 0.2 dB of the render's, and their levels rise and fall alike (a correlation of 0.98 to 1.00). Three plain takes are weaker: the default take (0.951) and the two takes of low tones (0.797 and 0.584, with the overall level 0.7 and 2.2 dB low). The second PC's take, rendered at settings inferred from its recording, reads 0.959 and is 0.5 dB off in overall level, the one other plain take outside 0.2 dB. Takes with packet loss can be compared only as statistics.

**What a render is not.** It is the voice alone, without the game's other sound. Real internet loss was not recorded. [docs/ACCURACY.md](docs/ACCURACY.md) has every stage and the whole table; [tests/REFERENCE_2026.md](tests/REFERENCE_2026.md) has the evidence.

## Live monitor

**Live** plays your microphone through the voice path as you speak. Use headphones: speakers feed the output back into the microphone. On Steam voice the path holds back about 0.2 s, which is Steam's own: its longest chunk and the 100 ms it sends before a phrase (computed from the sender's rule).

Whether the live monitor equals a render depends on the codec. On Steam voice it gives a render's samples exactly, with loss and jitter included. On `vaudio_speex` and Fullband Opus (not in TF2) it follows a render in waveform and level. On the two CELT profiles the whole chain is not compared with a render, and `vaudio_miles` (not in TF2) is checked at its packets and its gain only. Push-to-talk is the app's stand-in: Steam's own key rules are not built yet. [docs/LIVE.md](docs/LIVE.md) has the detail.

## Rooms

In the game a map can set a room, and part of every voice then passes that room's reverb (read). The page's default is no room. The "Listener position" menu offers the two automatic rooms that the owner's recordings carry, example rooms by shape, places measured on 2Fort, and the rooms that maps set by number; a switch puts the listener under water. The room arithmetic is the game's as read. Against recordings it agrees in echo times and level (measured), and no room is checked sample for sample. See [docs/VOICE-PATH.md](docs/VOICE-PATH.md#rooms).

## The page's tools

- **Visualizer:** the render as a waveform, a spectrum or a spectrogram, with a lane that shows what the voice path did with each frame.
- **Meter:** loudness and levels of the render and the source.
- **Real-take check:** load your own recording of the game and compare it with the render.
- **Console:** the game's variable names for the page's settings, with `help` for each.

[docs/PAGE.md](docs/PAGE.md) describes them.

## Run it yourself or publish it

Development needs Node 22 or later and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The site has no build step. For GitHub Pages, publish the root of the branch and keep `.nojekyll`, all of `vendor/`, and every script beside `index.html`; `node_modules/` is not needed on the site. Use HTTPS or localhost: opened as a local file, the page does not reliably load its codecs or the microphone. The page's footer shows the version, which is the number of the site's cache. A newer version never reloads the page by itself: a line at the top says it is ready.

## Tests

```sh
pnpm test                               # every suite but the browser's; a failure does not stop the rest
pnpm test verify steam                  # suites or groups by name
pnpm exec playwright install chromium   # once, for the browser suite
pnpm test:all                           # every suite, the page in a browser last
```

The suites hold each stage to the rule as read and to numbers taken from the recordings, and hold the live chain to a render. The owner's recordings are private, so the checks that need them are run privately and reported as numbers. CI runs the same suites as five jobs side by side on every push that changes more than `docs/`; a push has its result about five minutes later (measured on CI on 2026-11-12). [tests/README.md](tests/README.md) lists the suites.

## Files and licences

| File | What it is |
| --- | --- |
| `index.html`, `style.css`, `manifest.webmanifest`, `sw.js` | the page, its styles, and the service worker that makes it work offline |
| `audio.js` | builds `TF2Audio` from the engine's files; loads the codec module |
| `engine/dsp.js` | signal arithmetic with nothing of the game in it: the seeded draw, the yield, the FFT, the downmix, the resampler, the filters, the clip, 16-bit rounding and the WAV, each whole and a piece at a time |
| `engine/gain.js` | the receiver's gain |
| `engine/mix.js` | the mixer and the output stage |
| `engine/network.js` | loss and late frames: the retiming, the loss masks, the steam profile's loss by message |
| `engine/codec.js` | what the renderers share about a profile and its codec: the gate's defaults and threshold, the profile's filters, the frame codes, a demo's frame statistics, the call to the loader |
| `engine/room.js` | the room's settings and what the mix is told |
| `engine/steam.js` | the steam profile: its constants, its capture, its sender's options, its timeline, the voice channel on the game's timeline, its codec information |
| `engine/render.js` | `process`, and the stages it keeps (W4-01b) |
| `engine/render-stream.js` | `createRender`: the same render a piece at a time |
| `engine/live-chain.js` | `createLiveChain`: the live monitor's chain |
| `steam-sender.js` | Steam's sender: chunks, the level rule, the hold |
| `voice-channel.js` | the game's voice channel as read; a render runs it when `opts.timeline` is `'game'`, as the page's render does on Steam voice by default |
| `opus-codec.mjs` | packets and decoders for every codec profile |
| `room-dsp.js`, `room-presets.js` | the game's room arithmetic and its presets as numbers |
| `constants.js` | presets, codec profiles and the listener's places |
| `audio-worker.js`, `mic-capture.js` | rendering in the background; recording |
| `live.js`, `live-worker.js`, `live-worklet.js` | the live monitor |
| `app/` | the page's interface |
| `batch.js`, `formats.js`, `flac.js`, `zip.js`, `video.js`, `filerate.js` | the batch, download formats, video and reading a file at its own rate |
| `demo.js` | reading the voice in a TF2 demo |
| `meter.js`, `reference.js` | level measurement; lining a real take up with a render |
| `vendor/libopus-1.1/` | libopus 1.1.5, for Steam voice |
| `vendor/swresample/` | the resampler of Steam's decoder, ported from FFmpeg |
| `vendor/celt-0.11/`, `vendor/speex-1.0.2/` | the older engine codecs |
| `vendor/voxware-vr12/` | Voxware VR12, for `vaudio_miles` (not a TF2 codec) |
| `vendor/libopus/`, `vendor/lame/` | libopus 1.6.1 for a video's sound track; the MP3 encoder |
| `tests/`, `docs/` | the suites and tools; the documents, orders and reports ([docs/README.md](docs/README.md)) |

The application code is under the MIT licence ([LICENSE](LICENSE)). The vendored codecs keep their own: libopus, CELT and Speex are BSD (`vendor/libopus/COPYING.opus`, `vendor/libopus-1.1/COPYING.opus`, `vendor/celt-0.11/COPYING.celt`, `vendor/speex-1.0.2/COPYING.speex` and `NOTICE`), the libopus-wasm wrapper in `vendor/libopus/` is MIT (`vendor/libopus/LICENSE`, `THIRD_PARTY_NOTICES.md`), the VR12 implementation is MIT (`vendor/voxware-vr12/LICENSE`), and the musl maths code built into the modules is MIT (the `COPYRIGHT.musl` of each folder that has one). The MP3 encoder is LAME 3.100 under the GNU LGPL version 2 (`vendor/lame/COPYING.lame`); it loads only when an MP3 is saved. The resampler in `vendor/swresample/` is a modified part of FFmpeg's libswresample under the GNU LGPL version 2.1 or later (`vendor/swresample/COPYING.LGPLv2.1`), and `tests/swresample/bank.mjs` is under the same licence. Each folder's README says where its files come from and how to rebuild them.

TF2, Source and Steam are trademarks of Valve. This independent tool is not affiliated with Valve.
