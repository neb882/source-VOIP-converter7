# TF2 Voice Emulator

Make any audio sound like it came through Team Fortress 2 voice chat. The default profile runs **real Opus**: libopus 1.1.5, the release Steam's own voice packets match, bundled as WebAssembly. Around it the app applies:
- Steam's sender voice gate
- TF2's receiver auto-gain with int16 clipping

Both were identified from 2026 TF2 recordings of a calibrated test signal, speech and music, and from Steam's own voice packets in a SourceTV demo. The older engine codec `vaudio_celt` runs the real CELT 0.11. Video files work too: their audio is the source, and the render can go back into the video without re-encoding the picture. Audio stays on your computer; there are no uploads and no runtime CDN dependencies.

## Run or publish

Development requires Node 22+ and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

For GitHub Pages, enable Pages from the root of your publishing branch; no build is required. **Keep `.nojekyll`, `vendor/` (all seven folders: the five codec folders, the MP3 encoder and Steam's resampler), `opus-codec.mjs`, `audio-worker.js`, `mic-capture.js`, `live-worker.js` and `live-worklet.js`** alongside the HTML, CSS, other scripts and icons. `node_modules/` is not needed on the website.

Use HTTPS or localhost. Opening `index.html` as a local file does not reliably support codec modules or microphone capture. After the app and its service worker load, conversion works offline. The footer shows the version (the service worker's cache number). Background cache updates never reload the page or discard loaded audio: when a newer version takes over, a line above step 1 says so, and you refresh when you are ready.

Choose an audio or video file (or drop one on the page) or record, and it renders by itself: the player comes into view with the focus, and Space plays it (nothing plays by itself). Pick a preset or change a setting, and a source of a minute or less renders again by itself 400 ms after the last change; a longer one keeps its render, marked as made with the earlier settings ("Render again", "(earlier settings)" on the download, the views dimmed) until you press **Render**. A render that replaces one of the same source keeps the player's place, whether it plays, and what **Hear** plays. The line under the render (**Rendered in …**) says how long it took, its length and rate, the codec, and how much the voice gate did not send. Then download. Microphone capture uses uncompressed PCM, so the only lossy pass is the emulated codec. Limits: 100 MB (1 GB for video) and 10 minutes per file, 5 minutes for recording. Supported upload formats depend on the browser. A file is decoded at its own sample rate, read from its header, not at the audio device's, so the same file gives the same samples and the same render on any machine (`filerate.js`). Opus decodes at 48 kHz, and AAC at 24 kHz or less without its own SBR signalling at twice that rate, as it may be HE-AAC. A WebM or Matroska file, whose rate the page does not read, is decoded at the device's rate, as is any file whose rate the browser cannot decode at; the console says so.

**What a render keeps.** The page keeps one worker for its renders, downloads, the meter and the real take's jobs, and sends it the source once; Cancel stops a render and keeps the worker. Each render leaves two of its stages there for the next render of the same source: the capture signal at the codec's rate, and the codec stage's result (for Steam voice the sender's messages and their decoded packets; for the other codecs the decoded sound). A render whose changed settings are all read after the codec (`voice_scale`, the two gain settings, the gain switch, talk-spurt timing, volume, the room, the sound device) starts from the codec's result, in about a third of the time; one whose changes come after the capture (the gate and its threshold, Steam's uptime, `snd_bits`, loss, jitter, packet length) starts from the capture signal. The samples are the ones a render made afresh gives: the tests render every recorded render and each setting both ways. A render's result is on the page as soon as it is made; the meter's numbers follow. A source longer than 30 s first gets its first 14 s, which the player can play while the rest renders (the line under the player says so); the whole render then takes their place where playback had got to, and the downloads, the views and the meter wait for it. That is done only at settings where a test shows those 14 s are the whole render's, sample for sample: no loss or jitter, talk-spurt timing off, no room and not under water, not a demo, a 44.1 or 48 kHz device, and not when the render starts from the codec's result.

## Downloads and batches

Renders are mono 16-bit. The format picker next to Download sets the format for single files and batches:

| Format | Size (typical render) | Notes |
| --- | --- | --- |
| **WAV** | 100% | the render itself |
| **FLAC** | about 45% | lossless: decodes to exactly the WAV's samples |
| **MP3** | about 15–20% | LAME 3.100 at `-V 0`, LAME's highest VBR quality. Level and waveform are kept (gain within 0.1%). The LAME tag carries the encoder delay, so players return exactly the render's length. |

FLAC and MP3 are made from the WAV when a file is saved. MP3 is lossy on top of the emulated codec. It is meant for sharing; keep WAV or FLAC for further processing.

**Video.** A video file's audio track becomes the source. For an MP4 or MOV, **Download video** then saves the video with the render as its audio:
- **Picture:** every video sample is copied as is, with its timing; it is never re-encoded. Other non-audio tracks (such as a timecode) are kept.
- **Audio:** AAC where the browser has an AAC encoder (WebCodecs). Otherwise Opus in MP4, or 16-bit PCM in MOV, which editors and DAWs import directly. It starts where the old audio did, and the encoder's delay is skipped by an edit list.
- **Files:** regular and fragmented MP4/MOV are read; the output is a regular file with its index first. WebM and Matroska files give their audio only.

**TF2 demos.** Load a SourceTV demo (`.dem`), and the voice in it becomes the source. A demo holds each speaker's Steam packets exactly as the server received them, so no second encoding happens:
- **Speakers:** each speaker is found by SteamID, and a menu picks one when there are several.
- **Rendering:** the render runs only TF2's receiver on the demo's own packets: concealment of lost frames, comfort noise for DTX, auto-gain, the clamp and the mixer. The result is what a listener heard.
- **Codec lane:** shows the demo's real frames, including DTX and lost packets.
- **Accuracy:** rendered this way at `volume 0.15`, the Set D demo tracks the sender's own loopback recording within 0.14 dB rms in half-second blocks (r 0.996). Its spectrum is within 0.3 dB from 120 Hz to 11 kHz.
- **Limits:** a demo made with `record` keeps the voice messages but not their audio, so record with SourceTV ([tests/demovoice/README.md](tests/demovoice/README.md)). The legacy codecs `vaudio_celt` and `vaudio_celt_high` are read too.

**Batch** (step 4) renders many files with the current settings and saves them one by one or as one ZIP.
- **Adding files:** use the batch file picker, choose several files in step 1, or drop files or whole folders anywhere on the page. A single file dropped outside the batch loads as the source.
- **Rendering:** runs two files at a time on machines with four or more cores. Each row reports length, integrated loudness and true peak, and has preview, save and remove buttons.
- **Changed settings:** changing a setting marks earlier renders as older; "Render" redoes them. The tab title shows progress.

## The voice path

1. **Sender:** capture and filtering.
   - Stereo input is captured from its **left channel** (measured through a stereo virtual cable); a mix is optional.
   - Optional mic gain is applied, then int16 capture clipping. The audio is resampled to the codec rate, with optional high-/low-pass filters (off by default).
   - **Steam's voice gate.** On the Steam profile the app runs Steam's own sender, as read from its client. Steam reads its microphone in **chunks** of 31.25 to 93.75 ms and sends a chunk whose mean level reaches 1% of full scale (−40 dBFS; a sine opens at −39.1 dBFS RMS) or that holds a sample at 15%. The 100 ms before the first such chunk go with it (pre-roll), and sending goes on until 0.4 s after the last. That hold is timed on a clock that gets coarser the longer Steam has run, so **Sender's Steam has been running** sets it: 0.40 s since today, 0.38 to 0.44 s at about a week (the default), up to 0.75 s at about a month. Longer pauses become silence instead of boosted noise, and each talk spurt starts a fresh encoder, and a fresh decoder once the last one's end marker has arrived. The other profiles use the app's 20 ms frame gate: a frame above −39.5 dBFS RMS is sent together with the 120 ms before it and the 440 ms after it.
2. **Codec and network:** Steam's capture resampler rolls off the band above 11.1 kHz. libopus 1.1.5 then encodes the sent frames as Steam does: 32 kbps VBR, complexity 9, with DTX. When Opus's voice detector calls a frame inactive, as it does in held pauses and on steady tones, the encoder sends a 1-byte DTX packet and the decoder plays comfort noise. Then the network:
   - **Loss** (**Packets lost %**, labelled `net_fakeloss`). On the Steam profile each of the sender's messages is one packet, and a lost packet takes its whole message, each by a draw of its own, as the game loses packets (read). When the next message of the phrase arrives, Steam's decoder conceals up to 10 of the frames it missed; the time of any more stays silent and later sound keeps its place. A message that comes to more than 12 frames with its concealment is dropped by the game. A lost end marker leaves the decoder as it was for the next phrase. `net_split` no longer changes anything there. On the other profiles a packet is `net_split` frames, and loss still comes in bursts averaging 2.2 frames, the earlier fit to the takes; the codec conceals them (Speex plays zeros).
   - **Jitter** (`net_fakejitter`) makes isolated frames arrive too late, a fit to one take with no mechanism read in the game. At 50 ms that's 3% of frames; nine in ten are concealed and one plays as silence.

   Encoding continues through loss, and the encoder's reported delay is removed.
3. **Receiver:** libopus 1.1.5 decodes, as Steam's receiver does, and the audio moves to the engine voice rate (44.1 kHz for Steam). Next comes the **auto-gain** on the int16 voice.
   - Each 128-sample block sets a target `min(voice_maxgain, 32767 / (mean + voice_avggain × (peak − mean)))`. The defaults are 0.5 and 10. The blocks are counted from the first sample the decoder gives: on the engine codecs (CELT, Speex, and VR12 on `miles`) the codec's delay is removed after the gain, not before.
   - The next block steps toward it in truncated 1/128 fixed-point increments, scaled by `voice_scale`, and every sample is clamped to int16.
   - A steady tone ends up 1.22× over full scale (42% of samples flattened), and speech and music about 5–6 dB under it: the dominant "TF2 voice" character.
4. **Mixer and output:** as the game's engine does it, in whole numbers. The voice enters the 44.1 kHz mix at 255/256 of its level, truncated; a 22.05 kHz voice (the CELT profiles) is upsampled by two once and an 11.025 kHz voice (`speex`, `miles`) twice, by the engine's own rule (each new sample the mean of its neighbours, rounded down). With a room, or under water, the voice is entered twice, at the direct share and the room's share of 256 that the room's preset gives, each part upsampled on its own; the room's part passes the room's preset, the two are added, and under water the sum passes the game's water preset (14), all in the engine's 32-bit integers, before the clip. The reverb's tail runs on after the voice, so a render with a room is longer than its source, and the download carries the tail. Then the mix is clipped to ±32767, multiplied by `volume` and rounded to 16 bits. There is no filter and no limiter. "Rooms" below says what the page offers.
5. **The listener's sound device:** the listener's PC converts the game's 44.1 kHz sound to its device's rate by linear interpolation, which softens the top octave a little (about −1 dB at 8 kHz and −5 dB at 18 kHz) and leaves faint images, about 65 dB under a 1 kHz tone. That is modelled from the recordings, which were made at 48 kHz. **Listener's sound device** (`snd_device_rate`) picks 48000 Hz (usual) or 44100 Hz, where nothing is converted. The download is at that rate, with every sample written exactly as rendered.

The quick presets set every control but three, which are properties of a PC: the capture channel, how long the sender's Steam has run and the listener's sound device. A preset is lit whenever the controls match it, however they got there, and a line under the presets names what differs from the defaults ("Modern, changed: Voice scale 0.5 · Reset"), with the PC's settings after "also"; **Reset** returns every control to its default. The settings, and whether the advanced controls are open, are remembered between visits in this browser's own storage (nowhere else); a share link's settings win over them, and once applied they are what is remembered, in place of what was. The live chain strip under the controls shows what the next render will do, naming `voice_scale` and the gain target when they are not the game's defaults.

## Profiles

| Profile | Codec | Receiver | Status |
| --- | --- | --- | --- |
| Modern / `steam` | libopus 1.1.5: Opus 24 kHz, 32 kbps VBR with DTX, VOIP, voice hint (SILK/CELT hybrid) | auto-gain at 44.1 kHz | **Measured** against 2026 TF2 recordings and Steam's own packets |
| `steam_48` | libopus 1.1.5: Opus 48 kHz, 64 kbps VBR with DTX | auto-gain at 44.1 kHz | Experimental; not the game's path: the 20 ms frame gate and the app's own resampler |
| `celt_22` (vaudio_celt) | **CELT 0.11** with its pitch filter, 22050 Hz, 512-sample frames (23.2 ms), 64-byte packets (22.05 kbps), complexity 5: read from the game's module, packet size and rate confirmed by a take | auto-gain at 22.05 kHz, the mixer's upsampling by two | Codec gives the game's decoded samples but for 1 of 292,352, one step off; receiver modeled |
| `celt_44` (vaudio_celt_high) | **CELT 0.11** with its pitch filter, the 44100 Hz mode with 1024-sample frames and 128-byte packets, run on 22050 Hz sound: 46.4 ms frames, 22.05 kbps, nothing above about 10 kHz. Complexity 5. Read from the game's module, packet size and rate confirmed by a take | auto-gain at 22.05 kHz, the mixer's upsampling by two | Codec gives the game's decoded samples but for 75 of 292,864, each one step off; receiver modeled |
| `speex` (vaudio_speex) | **Speex 1.0.2** narrowband, as the game's module runs it: quality 4 (the engine's 3), 20 bytes a frame at constant bit rate, enhancement on, complexity 2. The module does not resample, so the 8 kHz codec is fed 11025 Hz sound: 160-sample frames of 14.51 ms, 11.025 kbit/s, a band to 5.5 kHz. Decoded samples wrap past full scale. A lost frame plays as zeros. `snd_bits` does not change it | auto-gain at 11.025 kHz, the mixer's upsampling by two, twice | Codec and settings read from the module; not recorded |

Every profile runs a real codec; nothing is a hand-made approximation. The Steam profiles use **libopus 1.1.5**, built to WebAssembly by `tests/libopus11/build.mjs`. The CELT profiles use **CELT 0.11** in Source's custom mode, built by `tests/celt011/build.mjs` from the source the game's own module was built from, and built the same way: with the pitch pre-filter and post-filter compiled in, reset after creation, 16-bit samples in and out. `speex` uses **Speex 1.0.2**, the library inside the game's `vaudio_speex` module, built the same way by `tests/speex102/build.mjs` and set up and framed as the module does.

The Speex profile is read from a `vaudio_speex` module the owner supplied (from another Source game; TF2 ships one in its 32-bit folder only). Current TF2's 64-bit game, asked for `vaudio_speex`, runs `vaudio_celt` instead; its 32-bit game (`-force32bit`) still runs Speex, and so does HL2DM's. The app's render reproduces both games' recordings of it sample for sample, at `voice_maxgain 1` and at 10. The module's reading cannot tell Speex 1.0.1 from 1.0.2, and it does not matter for the sound: native builds of 1.0 and 1.0.2 give identical packets and decoded frames at these settings. Loud speech wraps often, which is heard as crackle on peaks. What the game plays for a lost Speex frame was not read; the profile plays zeros. [tests/LEGACY_CODECS.md](tests/LEGACY_CODECS.md#vaudio_speex) has the details.

The status line and console report the modes the encoder actually chose (SILK / hybrid / CELT, from each packet's TOC byte). Speex frames have their own code in the frame log, so the codec lane and the mode counts show them as Speex. [tests/LEGACY_CODECS.md](tests/LEGACY_CODECS.md) collects what public sources say about the legacy codecs and which takes would settle the rest.

### `miles`: a codec that is not TF2's

`vaudio_miles` is not a Team Fortress 2 codec: it is a codec of the Source engine family that could be selected in the Source engines of 2006 and 2007, and current TF2 ships its files and refuses the name. It has not been checked against any recording of a running engine.

**What runs.** Voxware's VR12, the codec inside the Miles Sound System plug-in that the `vaudio_miles` module wraps ([`vendor/voxware-vr12`](vendor/voxware-vr12/README.md)), behind the module's wrapper: 360 samples coded as 12 bytes, each sample cut to its top 8 bits before the codec. The engines of Source SDK Base 2006 and 2007 capture, code, decode and play voice at 11025 Hz for every codec and resample nothing (read from their files), so VR12, an 8000 Hz codec, codes 11025 Hz sound as if it were 8000 Hz: a frame lasts 32.65 ms, not 45; the wire carries 2940 bit/s, not 2133; the codec's band and pitch range reach 1.378 times higher in real sound (its 4 kHz is 5.5 kHz). Pitch and speed come out right, since playback is at the same rate. VR12 is a vocoder: it keeps the envelope and the pitch, not the waveform, so its delay was measured on the envelope: 305 samples (27.7 ms), the median of 72 runs (quartiles 275 and 348, range 200 to 411).

**The chain.** The sender resamples to 11025 Hz as `speex` does. The sender's encoder and the receiver's channel are two codec objects, each reset at the start of a render (the key press, and the channel's assignment: the wrapper's reset, twice over 360 zeros coded and decoded). The receiver's auto-gain runs on the decoder's samples from the first one, as on the other engine codecs, and the delay is dropped after it; the gain routine of those engines gives the app's on every sample tried (run). Everything after the receiver's gain (the mixer, rooms, output) is TF2's of today: the old engines' mixer and output were not read. With no voice gate a render is one key press, as in the engines: silence in the file is coded and sent.

**The stand-ins.**
- The wrapper's start-up block is uninitialised memory in the engines; here it is a block of zeros. It changes a few packets near the start of some signals.
- A new talk spurt (only with the app's voice gate on, which the game does not have, or when the live key goes down again) resets both sides. The engines reset the sender at every press, and the receiver only after a pause longer than what it had buffered (about 0.2 s, a guess); after a shorter pause its decoder goes on as it was.
- The gain is held, not reset, through time nothing was sent, as on every profile of the frame path; the engines reset it to unity when a channel is assigned.
- A lost or late frame plays as 360 zeros in its own place, and the receiver's codec is not called. The engines never call the codec without data, but queue nothing for a lost packet, so later sound would close up while the buffer lasts.
- The engines' interpolator writes n − 1 samples for n decoded; as for every profile, the dropped sample is not modelled.
- The decoder gives the plug-in's samples to within one step, not exactly.

**What the 8-bit cut does to a quiet voice** (measured by `tests/miles.verify.mjs`). In the pauses of the tests' speech-like signal, at -78.7 dBFS when resampled to 11025 Hz, only the signs are left: every sample becomes 0 or -256, -45.6 dBFS. They decode at -57.1 dBFS and reach -37.1 dBFS after the gain; under `speex` the same pauses decode at -82.7 and reach -62.7. Its spurts, at -20.0 dBFS, decode at -22.6. A steady voiced sound decodes within about 3 dB of its level at -12 and -24 dBFS RMS, at -41.2 for -36 in, -56.5 for -42 and -61.4 for -48; at -60, where only the signs are left (for that sound, below about -50 dBFS RMS), it decodes at -63.9. Digital silence stays digital silence. [tests/LEGACY_CODECS.md](tests/LEGACY_CODECS.md#vaudio_miles) has the reading behind it and what remains unknown.

## Live monitor

**🎧 Live** (step 1) plays your microphone through the TF2 voice chain in real time, with the current settings. It uses the same stages and parameters as a render:
- capture gain and int16 clip
- Steam's gate
- libopus 1.1.5, frame by frame, with the loss and jitter model
- the receiver auto-gain and the output

On the Steam profile the live chain is a render's own, fed as the microphone's blocks arrive: Steam's sender, timed on the samples it is given rather than on the wall clock, the 16-bit decoder, Steam's resampler and the receiver. The Node tests show that it hands the mixer exactly what a render of the same sound does, sample for sample, with packet loss too. With push-to-talk off the key counts as held, as if `+voicerecord` were held throughout; what TF2's open-microphone mode (`voice_vox`) does was not read. On the other profiles the Node tests check each streaming stage against its offline counterpart sample for sample, and the whole chain against a render.

**Latency.** About 0.3 s from microphone to speaker on the Steam profile. The largest part is authentic: Steam's sender sends the 100 ms before a phrase, and a chunk is sent only once it has been read, so the chain holds back about 0.2 s (the panel shows the figure). The rest is the capture filter, Opus lookahead, a 40 ms jitter buffer and the audio device. The other profiles hold back the frame gate's 120 ms pre-roll, about 230 ms in all.

**While it runs:**
- **Settings:** changes apply as you make them, presets included.
- **Status:** the panel shows whether the gate is sending, the Opus mode, the bitrate, lost frames (on the Steam profile, the frames concealed) and late frames, input and output levels, and the latency.
- **Output device:** choose a virtual audio cable here to use the TF2 voice in other apps, such as Discord or OBS. Chrome and Edge can pick output devices; other browsers play on the default output.
- **Push-to-talk:** sends only while **V** (TF2's `+voicerecord` key) or the Talk button is held, and the gate still applies while you hold it. On the Steam profile this is the app's stand-in for the key: the microphone is silenced while the key is up, and the voice gate ends the phrase by its own hold, so sound captured while the key is up is never sent. On the page the key and the sound reach the voice chain separately, so a press or a release can land up to about one 20 ms block early or late. Steam's own key rules (it goes on sending for half a second after a release) are not built yet.
- **Low latency:** on the Steam profile, holds back Steam's longest chunk and a frame instead of the chunk and the pre-roll. That saves about 80 ms (the panel gives the figure), but part of each phrase's first 100 ms is not played: 17 to 80 ms of it, about half as a rule. TF2 plays all of it. On the other profiles it skips the gate's 120 ms pre-roll, so the gate opens on the loud frame itself: that saves 120 ms but cuts the start of each word.
- **Record this session:** captures the session and loads it into the app: your microphone as the source and the voice as the render, lined up to the sample. **Hear**, the views, the meter and every download work on it, and a changed setting (or **Render**) re-renders the microphone with other settings. The voice ends short of the microphone by what the chain holds back when it stops (about 0.2 s on the Steam profile), which is never played.

**Rooms live.** The live monitor runs the same room as a render, on a room path its worker keeps for the session. A change of room cross-fades over the game's 200 ms and going under water switches at once, as in the game; neither restarts the voice chain, from no room either, so Steam's sender and the gain run on. With a room or under water the chain holds back up to 11.6 ms more (the mixer's 512-sample block), which the latency figure includes; once a room has faded to none and the water is off, it holds nothing back again. There is no voice channel in the live chain yet, so each talk spurt's first delivered packet stands in for a channel's start, where the room's share is fixed.

Use headphones: speakers feed the output back into the microphone.

**When there is no microphone.** If the browser refuses the page the microphone, Live and Record say so and how to allow it (the icon in the address bar); if there is none, they say to plug one in or choose it in the system's sound settings. Other errors give the browser's own message. The panel's note is read out by a screen reader, and so are the two level bars, as meters in dBFS.

## Accuracy

The Steam profile, voice gate and receiver path come from 2026 recordings made with `voice_loopback 1`. The main set is a calibrated 143 s test signal recorded losslessly at default settings and with `voice_scale 0.5`, `voice_maxgain 1` and `voice_avggain 0.25`. The owner's speech and an earlier music recording validate it.

A SourceTV demo of the same test signal holds Steam's own voice packets. Decoding them gave the sender side exactly: its gate timing, DTX and encoder settings. Re-encoding the test signal with every libopus release from 1.1 to 1.6.1 identified Steam's codec as libopus 1.1.x, at both the sender and the receiver. With those packets as input, the receiver model matches the game's output within 0.1 dB per band up to 11.5 kHz, for both the sender's loopback and a second account on another PC.

Rendered through the app with each take's settings:
- **Test signal:** levels and clipped-sample shares match to within about 0.3 dB and 1–2%. That holds for sines, noise and a synthetic vowel across all three receiver settings.
- **Sender:**
  - Talk spurts: 16 of 18 start and end within 4 frames of Steam's, and 98.7% of 20 ms frames agree on sent or not sent.
  - Bytes: the total is within 0.2% of Steam's packets.
  - Decoded spectrum: within ±0.06 dB of Steam's packets up to 11.4 kHz.
  - Steady tones: they fall into DTX at the same moment as in Steam's packets (0.38 s against 0.42 s for a −36 dBFS sine).
- **Speech:** tracks within ±0.37 dB in 50 ms windows (correlation 0.998), with the spectrum within 0.3 dB.
- **Music:** tracks within 0.07–0.11 dB in half-second windows, and the spectrum agrees within ±0.3 dB from 80 Hz to 12 kHz.
- **Packet loss and jitter:** a one-minute network test signal was recorded under simulated loss and jitter. The earlier per-frame loss model was fitted to those takes' damage events; the Steam profile no longer runs it, and the whole-message rule it runs now has not been measured against the takes by the published method. A private check of a prototype of that rule on the takes' noise parts gave their lost runs per second, run lengths and silence (3.2 against 3.1 runs a second at `net_fakeloss 5`, 4.3 against 3.9 at 15), and showed the old fit's share of single lost frames to be a measuring artefact (tests/REFERENCE_2026.md, finding 8).

Evidence, method, residuals and open questions are in [tests/REFERENCE_2026.md](tests/REFERENCE_2026.md).

What that does **not** establish:
- Valve's source code for the gain stage or Steam's gate. Neither is in the public Source SDK 2013; both are identified from recordings.
- Which talk spurts TF2's receiver re-times. The receiver starts about 40% of spurts early after a short silence (finding 19). It does so when the next spurt's first packet arrives while the previous one is still queued: the spurt is appended, starting early by the silence less a 62.5 ms silence record (finding 21). A SourceTV demo's packet timing predicts this spurt by spurt. A recording or source file does not, because near the threshold ±30 ms of packet batching decides. Renders keep the source timeline unless **Talk-spurt timing** is set to TF2 re-timing, which applies the measured statistics; latency trims inside a spurt are not modeled.
- Steam's exact libopus build and capture resampler. The release is 1.1.x (1.1.2–1.1.5 give identical packets). The resampler is modeled by its measured roll-off, and pure tones at 11.5–12 kHz still differ.
- The absolute playback level. That depends on game and OS volume; the rendered file uses `volume 1`, the game's own default, where the recordings used 0.15. At 1 a loud voice fills the whole range, as it does in the game: its peaks between samples pass 0 dBTP once converted to 48 kHz (the meter flags them), and an MP3, AAC or Opus export can clip when it is decoded. Lower `volume` for those.
- Real internet loss. The network rules come from simulated loss and jitter in TF2 (`net_fakeloss`, `net_fakejitter` on a listen server) and from the game's network code as read; one packet carries one voice message on a listen server, and how many it carries at a real server's rates was not read.
- When Steam reads its microphone. The sender's gate, pre-roll and hold are Steam's own, but the read times that cut the capture into chunks, and so the packets' clock, are a seeded model fitted to Steam's packets.

## Rooms

A TF2 listener hears a voice through the room the map sets where they stand. The room is the engine's own arithmetic as read from the game (`room-dsp.js`, with the game's preset file as numbers in `room-presets.js`); the numbers of presets 0 to 29 were first taken from [Valve's preset data mirrored by Facepunch](https://github.com/Facepunch/garrysmod/blob/master/garrysmod/scripts/dsp_presets.txt). **Listener position** offers, in order:
- **No room effect (the game's Sound quality: Low)**, the default: `dsp_slow_cpu 1` turns rooms off. It is what Set B shows, and a render with no room runs nothing of the room code.
- **Automatic room, as recorded:** the two automatic rooms fitted to the owner's Sets C and D. Most TF2 maps ask for the automatic room (`dsp_room 1`), which the engine builds by the shape and size it measures around the listener.
- **Automatic room: examples by shape:** fourteen example spaces, from a very small room to open ground, each with its measures; the app has no map to measure.
- **Automatic room: places measured on 2Fort:** five spots whose measures the game printed (`adsp_debug 2`).
- **A room the map sets by number:** the ten numbered presets the game's soundscape scripts ask for, labelled by script and area.
- **Manual:** any `dsp_room` number (0 to 29 in the menu; the console takes any whole number), with 1 taking the automatic room's six measures (under the sky, width, length, height, open sides, reflectivity) and saying what the engine would build, and 99 the app's own custom room (not the game's).

**Listener under water** is a checkbox of its own: a state of the player, not a variable. The whole sound then passes the game's water preset.

What is checked: the two rooms marked "as recorded" match their recordings in echo times and level, room 6 matches a recording echo by echo, and the 2Fort places build to the shape and mix values the game printed. No room has been checked sample for sample yet, because every take has the map's sound under it. The game draws some delay taps at random; the app draws them from a seeded stream, so a render repeats exactly, as two runs of the game do not. `tests/REFERENCE_2026.md`, finding 32, has the evidence.

The same decoded PCM, settings and pinned runtime always produce the same output.

## Controls and console

Advanced controls are grouped in signal order. Every control has one sentence under it saying what it does to the sound and, where it is not plain, whose default it is; the console's `help <command>` says the same. Most controls also have a console name (how long the sender's Steam has run and the live monitor's low latency do not).

| Group | Controls |
| --- | --- |
| **Sender** | the stereo capture channel (`voice_capture_channel` in the console) and, on `steam`, how long the sender's Steam has been running: settings of the sender's PC |
| **Network** | `net_fakeloss`, `net_fakejitter` |
| **Receiver** | `voice_avggain`, `voice_maxgain`, `voice_scale` |
| **Listener room & output** | the manual `dsp_room` and the automatic room's six measures, `volume` (1, the game's default), and the listener's sound device (`snd_device_rate` in the console: 48000 or 44100 Hz), a setting of the listener's PC |
| **Extras: not in the game** | mic gain (`voice_micgain`), the high- and low-pass (`dsp_hpf`, `dsp_lpf`), the voice gate's switch and threshold (`voice_vad`, `voice_vad_threshold`: on `steam` the mean level of a capture chunk, −40 dBFS by default; on the other profiles a 20 ms frame's RMS, −39.5), skipping the codec (`snd_codec`), the bitrate scale (`snd_bits`), the packet length (`net_split`), the auto-gain's switch (`voice_agc`), talk-spurt timing (`voice_retime`), the custom room (`dsp_custom_*`, `dsp_room 99`) and the live monitor's low latency |

The codec (**Voice codec**, `sv_voicecodec`), the listener position (`dsp_room`) and **Listener under water** (`underwater` in the console) sit above the groups. A label shows a variable's name only where the game has that variable; the app's own names are console commands. The codec menu has two groups: "Team Fortress 2" (Steam voice, `vaudio_celt`, `vaudio_celt_high`, `vaudio_speex`) and "Not in Team Fortress 2" (Fullband Opus, and `vaudio_miles` of the Source engines of 2006 and 2007); each entry of the second says so itself, and with `vaudio_miles` chosen a note under the control says it is not a TF2 codec and not checked against any recording.

Some controls behave differently from their names:
- `voice_scale` acts inside the fixed-point auto-gain, as in the game. Values below 1 do not simply scale the result: 0.5 lowers voice by 8–11 dB and adds a 344 Hz sawtooth.
- `net_fakeloss` (**Packets lost %**) is the share of voice packets that never reach the listener, not TF2's own setting: on the Steam profile a packet is one of the sender's messages, on the other profiles `net_split` frames. By the game's rule (read, not measured), TF2's `net_fakeloss 5`, `10` and `15` on a listen server with sockets for loopback lose about 22%, 37% and 50% of voice packets, since each packet meets four draws of (N+1)/101 on the way there and back. Recordings agree at 5 and 15; 10 was recorded only with lag and jitter, where the rule gives too little silence.
- `voice_retime` is not a TF2 setting. It switches on the receiver's measured talk-spurt re-timing (random, seeded), which moves some spurts earlier than in the source.
- `snd_device_rate` is not a TF2 setting either: it is a property of the listener's PC, the rate its sound device runs at. A share link made before it existed gets 48000; the quick presets leave it alone, as they leave the capture channel and the sender's Steam.
- A share link or saved setting made before the room controls changed keeps its room: an old listener position becomes the manual `dsp_room` number it stood for (Tunnel 6, Hallway 22 and so on), and the old "Underwater" becomes no room with **Listener under water** on. The quick preset that was "2fort Sewers" is now **Under water** (`exec preset_sewers` still runs it).

The developer console supports Source-style `;` chaining, `alias`, `toggle`, `find`, history, and Tab completion. Tab completes to the longest common prefix, then lists matching commands with their current values; with nothing to complete (an empty line, or a space typed), Tab moves on, and Shift+Tab always moves back. A screen reader hears what a typed command answers, not the simulated game feed. `writeconfig` copies a share URL; `preset_save/load/list/delete` manage local presets. `net_graph 1–4` overlays a Source-style HUD whose packet rate, payload rate and loss come from the last render. The background game-event feed (kills, chat, joins and drops) can be stopped with `sv_simulate_events 0`.

## Visualizer and meter

The visualizer has three views. All three follow **Hear** (the render, the original or a real take).
- **WAVE:** peak and RMS envelope, down to individual samples. **dB** switches to a dBFS amplitude scale for quiet detail: fades, the gate's tails, DTX comfort noise and noise floors. Full-scale samples are marked red.
- **BARS:** a log-frequency spectrum from 20 Hz, 8192-point, in dBFS; live while playing, computed at the playhead when paused. The version you are not hearing is drawn over it as a line. With a real take loaded, that is the take when you hear the render, and the render otherwise.
  - **AVG** switches to the long-term average spectrum of the render against the source, or against a real take once one is loaded. It covers the selection or the whole file, with 1/6-octave smoothing and silent windows skipped. The reference is shifted to the render's loudness, and a lane below shows the difference in dB: the chain's tonal footprint at a glance.
- **SPEC:** a spectrogram with a dB colour scale, on a linear axis or, with **LOG**, from 20 Hz. The ruler marks the 12 kHz Opus band edge in amber.

**Spectrogram resolution.** The visible band is analysed in tiers. Each tier reads the signal decimated as far as its top frequency allows (by up to 64), so a low band gets long windows cheaply. **RES AUTO** sizes the FFT to the zoom, as iZotope RX's auto-adjust does. A Blackman window of T seconds blurs about 0.4 T in time and 2.35 / T in frequency. AUTO picks T = 3.4 · √(seconds per column / Hz per row), which blurs about twice as many pixels in time as in frequency, so tones, harmonics and hum stay sharp.
- Zooming in on time shortens the window.
- Zooming in on frequency, or going lower on the log axis, lengthens it (up to 1.4 s).
- On the log axis every octave-ish band has its own window, and levels are per Hz so noise reads the same across them.

A fixed RES (256–16384 samples at the file's rate) uses one window length everywhere. The corner label and the hover readout give the window and bin width in use.

**Navigating** WAVE and SPEC:
- Zoom in time with Ctrl/⌘ + wheel, a trackpad or touch pinch, the − and + buttons or the + and − keys.
- Pan by dragging, with Shift + wheel or with the arrow keys.
- SPEC's frequency axis: the wheel over the frequency ruler, Alt + wheel or Ctrl/⌘ + Shift + wheel over the view, or ↑ and ↓. Drag the ruler to move the band (Shift + ↑/↓ with the keys). Double-click the ruler to show the whole band.
- FIT or 0 shows the whole file and the whole band.
- Click to seek. While playing zoomed in, the view pages along with the playhead.

Only the visible range is analysed, at the display's full pixel resolution. The range button sets how many dB the colours (or the dB waveform) span. TALL, or dragging the bottom-right corner, makes the view taller. Hovering reads out time, level, and in SPEC the frequency with its nearest note, the level and the analysis window.

**Lanes** under WAVE and SPEC:
- **Codec lane:** what the voice path did with each codec frame (20 ms for Opus, 23.2 or 46.4 ms for CELT, 14.5 ms for Speex, 32.65 ms for VR12), in playback time. It shows SILK, Hybrid or CELT coding, Speex and VR12 coding each in a colour of its own, DTX (comfort noise), not sent (gate closed), lost (concealed, or zeros under Speex and VR12) and late (played as silence).
  - Zoomed out, a pixel shows the most common frame type, with a red or orange strip on top for the share lost or late.
  - Hovering gives the frame's packet size and bitrate.
  - The legend under the view counts each type.
- **LUFS** adds a loudness lane: momentary (400 ms, thin) and short-term (3 s, bold) loudness of the render (blue) and the source (white), each drawn at the centre of its window. Dashed lines mark each version's integrated loudness.

**Selection and loop.** Shift + drag, or a drag along the time ruler, selects a range. Shift + click moves the nearer end. The meter then measures just the selection, the render and the original, with a header offering **Zoom to selection** (Z) and **Clear** (Esc). **LOOP** (L) loops the selection or, with none, the whole file.

**Meter.** Under the visualizer, the meter lists for the render (RENDER) and the source (ORIGINAL):
- integrated loudness and maximum short-term and momentary loudness (ITU-R BS.1770-4, gated)
- loudness range (EBU Tech 3342)
- true peak (4× oversampled), sample peak and RMS
- peak-to-loudness ratio and DC offset

A Δ row gives the render minus the original. Values are measured as one channel; played as dual mono they read 3 dB higher.

**Match loudness**, beside **Hear**, makes the comparison fair: the louder version plays quieter by the difference in integrated loudness over the whole file, so neither wins just by being louder.

**Shortcuts:** Space plays and pauses, B switches **Hear** (Rendered, Original, Real take), L loops. With the view focused: + − 0 and the arrows navigate, Z zooms to the selection and Esc clears it.

With a real take loaded, the meter adds a REAL row and a "Δ real" row (the render minus the real take), and loudness matching plays every version at the level of the quietest.

The meter shows a real codec property. When DTX replaces a steady tone below about 60 Hz, libopus 1.1.x's comfort noise is nearly DC, and TF2 plays it as is. See finding 18 in [REFERENCE_2026.md](tests/REFERENCE_2026.md).

## Checking against your own take

**Compare with a real TF2 take** (under the player) checks the simulation against a recording of the same source through TF2. Record it with `voice_loopback 1` as in [tests/testsignal/README.md](tests/testsignal/README.md), load the source, render it with the settings you recorded with, and load the take.

**Alignment** (`reference.js`, in a worker) goes talk spurt by talk spurt, because TF2's receiver re-times spurts by up to about 350 ms (finding 19):
- **Spurts:** the gate model of the current settings splits the source into talk spurts.
- **Reference:** once there is a render without random loss, the take is lined up against the render rather than the raw source. The render shares the take's gating, comfort noise and low-tone plateaus, and loaded takes are re-aligned after each such render.
- **Placing each spurt:** by its waveform at 2 kHz, or by its level envelope where the waveform repeats (tones, beeps). The search is within ±0.6 s, with a prior toward the delay the other spurts have.
- **Refining:** 1 s windows at 8 kHz follow the delay through the spurt, and split it where it steps. One clock ratio serves the whole take.

The status line reports the spurts, the latency trims and other re-timings, the clock and the correlation.

The aligned take then:
- plays as a third version under **Hear** (B cycles the render, the original and the real take)
- shows in WAVE, SPEC, the loudness lane and AVG
- joins the meter

**The report** compares the render with the take where they overlap:
- sim minus take per band from 40 Hz to 19 kHz, level-matched at 300 Hz–3 kHz
- short-term level tracking in 0.5 s blocks
- the receiver's clipping signature for both

For the clip from the "whoosh" investigation (a river recording and its TF2 take), rendered at `volume 0.15`:
- the bands agree within ±0.4 dB from 80 Hz to 16 kHz
- levels track within 0.2 dB rms (r 0.98)
- the clip ceilings are −16.5 and −16.4 dBFS

**Timing of the render.** The Steam render keeps the source's timeline: its 8–11 kHz band lines up with the source to within a microsecond. Lower frequencies lead by 35–370 µs, which is the phase of Opus's SILK layer. TF2's libopus does the same, so it is kept (finding 20).

**Every take at once.** `pnpm accuracy --takes <folder>` runs this check over the owner's 18 recordings in headless Chromium. Each is rendered with the settings it was recorded with, lined up and compared, and the talk-spurt timing goes to JSON with `--json`. The takes and their settings are listed in [`tests/accuracy.takes.json`](tests/accuracy.takes.json); the recordings themselves are not distributed. The results are in [REFERENCE_2026.md](tests/REFERENCE_2026.md#results). `node tests/retiming.mjs --accuracy <json> [--demo <dem>]` then tests what decides which talk spurts start early (finding 21).

**Predictions made before the recordings.** A model fitted to recordings should reproduce them; the harder test is recordings it has not seen. [`tests/predictions/`](tests/predictions/PREDICTIONS.md) holds the app's predictions for six takes nobody has recorded yet:
- `vaudio_celt` and `vaudio_celt_high`, each with two competing hypotheses
- `voice_scale 2`, `voice_avggain 1` and `voice_maxgain 3`
- `volume 1`

They were rendered, measured and frozen by hash before the takes exist, with the scoring rules fixed in advance. The rules were checked on the Set B takes and on stand-in takes made from the renders plus real game sound. When the takes come in, `pnpm accuracy --score-predictions --takes <folder>` scores them against the registered file, and the results go in that file whatever they are.

## Reference recordings

The owner attributes `real tf2 VOIP recording 2024.mp3` to [this TF2 video](https://www.youtube.com/watch?v=nqXpT5uNdT8). It is mixed with game audio, so it can only be screened:

```sh
pnpm analyze:reference "path/to/recording.mp3" "https://www.youtube.com/watch?v=nqXpT5uNdT8"
```

The paired tool locates each source in a recording, corrects clock drift and fractional delay with band-limited filters, and renders the aligned excerpt through the app. It then reports level-matched spectra up to 19 kHz, the clip signature, and half-second level tracking. Each source channel (mix, left, right) is rendered with the full model, with the voice gate off, and with the receiver auto-gain off:

```sh
pnpm compare:reference "path/to/loopback.mp3" "path/to/source-one.mp3" "path/to/source-two.mp3"
```

None of the recordings or music files is distributed here. The synthetic test signals are: [tests/testsignal/](tests/testsignal/) rebuilds them bit for bit (numpy and scipy), with segment maps and recording steps. `make_testsignal.py` covers the receiver, and `make_nettest.py` is a one-minute signal for packet-loss and jitter takes.

[tests/demovoice/](tests/demovoice/) extracts Steam's voice packets from a SourceTV demo with the app's own reader (`demo.js`) and decodes them with the bundled libopus (`node tests/demovoice/extract.mjs voicetest.dem` writes a WAV and tables per speaker into `tests/demovoice/out/`, which git ignores). The output is the exact sender side of a take, with frame sizes, DTX and sequence gaps.

## Tests

```sh
pnpm test
pnpm exec playwright install chromium
pnpm test:all
```

- **`tests/verify.js`:** resampler passband/stopband/alignment, the profile FIR, and the auto-gain law. Also the live chain: each streaming stage (resamplers, FIR, auto-gain, loss model) equals its offline counterpart sample for sample, and the whole chain reproduces a render. The law checks cover the measured sine overdrive at `voice_avggain` 0.5 and 0.25, the cap, the int16 clamp, silence hold, step timing and the `voice_scale` sawtooth and truncation. Also the voice gate (threshold, pre-roll, hold, talk spurts, DTX comfort noise on steady tones, send/skip accounting), stereo capture, real codec modes per profile, all room presets 0–29, the loss bursts and late-frame jitter with PLC, option robustness and WAV structure. On the Steam profile, loss by whole messages (BC-1) against a reference built from the sender, the bundled codec and the resampler: the draw, the concealment in front of each arrival, the 12-frame refusal, a lost end marker or silence record, each frame at its own time, and the live chain equal to the render under loss.
- **`tests/output-stage.verify.mjs`:** the mixer and the output stage against the engine's read: the voice's entry at 255/256 on all 65,536 samples and at the room's volumes; the upsampler by two on the read's tables (its phase, its kept sample across blocks, its two stages for `speex`); the clip, `volume` as a single and the rounding to even; the device stage by vector, its positions against BigInt, its images and roll-off on a 1 kHz tone; the same samples at any chunking; the mixer's blocks; the output's length; the WAV's bytes; and the live chain equal to a render after its mix point.
- **`tests/opus.verify.mjs`:** frame timing and boundary pulses, exact lengths, bitrates and packet sizes, TOC mode reporting, native concealment, silence, mute, determinism, the sender gate inside the round trip (pre-roll, hold, talk spurts), opt-in DTX, the per-frame log behind the codec lane, leveling and cap behavior, output-volume linearity, pre-encoder filtering, and codec-failure reporting. Also the libopus 1.1.5 build: its packets are bit-identical to a native build of the release, and its DTX differs from 1.6.1's as Steam's does.
- **`tests/speex102.verify.mjs`:** the game's Speex module and the `speex` profile that runs it.
  - the module's packets, decoded floats and 16-bit output are bit-identical to a native build of the same source (`tests/speex102/native.mjs`), with and without a reset mid-way
  - its settings, point by point as read from the game's module: 20-byte packets of sub-mode 3, complexity 2, enhancement on, 160-sample frames; not the packets of Speex 1.2.1
  - decoded samples wrap past full scale; the frame wrapper; the reset; the 80-sample delay
  - the profile: 11025 Hz sound, 14.51 ms frames, 20 bytes, 11025 bit/s, whatever `snd_bits` says; the float sound rounded to 16 bits at the codec
  - white noise keeps its band to 5.5 kHz; pulses 200 a second keep their period; the delay is trimmed to within a sample
  - a loud source wraps; a new talk spurt resets the codec, not a new one; a lost frame plays as zeros and the decoder never sees it
  - the live chain runs the same codec and reproduces the render
- **`tests/miles.verify.mjs`:** the `miles` profile (`vaudio_miles`, not a TF2 codec), against the vendored VR12 module driven by the test itself as the engines of 2006 and 2007 drive it: two codec objects, their resets, a framer on each.
  - the profile and a render's `codecInfo`; the delay, measured again from the envelopes (305 samples)
  - every packet and decoded sample of a render is the module's, on speech-like sound, a quiet voice, noise and two of `tests/vr12/vectors`; one reset of each object at the start, both at a new spurt (not the sender's alone, not one shared object, not new codecs)
  - the 8-bit cut reaches the render; where the 16 bits are made; a lost or late frame plays as zeros in its place and the receiver never sees it; `snd_bits` changes nothing; `net_split`; the last part frame; determinism
  - the live chain: the module's packets, the gain on the decoder's stream, a reset of both objects at a key press
  - the 8-bit cut's levels on quiet sound, and the page's and the documents' words
- **`tests/reference.verify.mjs`:** alignment, clock drift, polarity, fractional delay, clip-signature and level-tracking metrics. Also the in-page real-take check. A take made from a render (delayed, clock-skewed, quieter) is lined up with its source to within 10 µs and 0.2 ppm, and compares as identical. Short excerpts are found, and unrelated audio is rejected.
- **`tests/stages.verify.mjs`:** the stages a render keeps (W4-01b): every recorded render of `tests/render-stream.verify.mjs` made with stages first used for other settings of the same source gives its recorded hashes; each setting the page sends, changed alone with warm stages, gives a fresh render's hashes, from the stage its lists say, and the first settings again give theirs; an unknown option, a changed source, function-valued options (only the observers keep the reuse), values JSON would make equal, a caller writing into what it was given, re-timing in place and a render stopped part way. Also the first seconds: for every profile on three seeded clips, and for each setting they are allowed with, the first 14 s of a render of a source's first 15 s are the whole render's, sample for sample.
- **`tests/demo.verify.mjs`:** TF2 demos (`demo.js`) on a synthetic SourceTV demo written bit by bit. It has two Steam speakers, a lost frame, a DTX frame, end-of-transmission markers, messages that leave the stream off byte alignment, a payload that fails its CRC, and a `vaudio_celt` demo. The checks:
  - every packet comes out byte for byte, with its sequence number
  - talk spurts sit at their tick
  - the voice decodes back to the tone
  - received voice skips the sender and codec, and its codec lane is the demo's
  - a demo cut off at any byte keeps the voice before the cut, and voice more than 256 MiB into a demo is read
  - the browser test loads the same demo (`tests/demo/synthetic.dem`), switches speakers, finds the demo's frames in the codec lane, and keeps the loaded source ready after a demo that cannot be read
- **`tests/video.verify.mjs`:** the video remux on ffmpeg-made fixtures in `tests/video/`: H.264 with AAC (regular, fragmented, fragmented with the audio first and no base offsets, and with delayed audio), H.264 with PCM in MOV, and VP9 with Opus. Every video sample comes out byte for byte with its timing, the index comes first, and the new audio decodes back on time and starts where the old audio did; a MOV's PCM holds the render's 16-bit values exactly. A 96 kHz render goes into a MOV at 48 kHz, and a MOV with 10 minutes of PCM is inspected without listing its audio samples. A stand-in WebCodecs encoder checks the AAC path: frames land unchanged, the AudioSpecificConfig goes into the `esds` box, and the edit list skips the priming; an encoder that fails after saying it can encode leaves the voice to Opus.
- **`tests/formats.verify.mjs`:** download formats and ZIPs.
  - FLAC decodes bit-exact with valid frame CRCs, through an independent decoder in the test.
  - The MP3 module matches its documented build. Its files are byte-identical to a native gcc build of LAME 3.100. Decoded with mpg123, they keep level and waveform, and their LAME tag accounts for every sample.
  - Rates MP3 cannot carry are resampled.
  - The WAV reader works, the writer writes each of a render's 16-bit values as itself, and ZIP archives have correct headers and CRC-32.
- **`tests/filerate.verify.mjs`:** reading a file's own sample rate (`filerate.js`) from headers written byte by byte and from half-second tones made with ffmpeg in `tests/filerate/`:
  - WAV at every rate from 8 to 96 kHz, WAVE_FORMAT_EXTENSIBLE, RF64 and BW64, and AIFF
  - FLAC (also after an ID3v2 tag), and MPEG-1, 2 and 2.5 frames at all nine rates after ID3v2 tags, with a stray frame sync ignored
  - AAC: ADTS, and AudioSpecificConfigs with explicit and backward-compatible SBR signalling; Ogg Vorbis, Opus (48 kHz) and FLAC; MP4 and MOV through video.js
  - the decode's fallbacks to the device rate: a rate that cannot be read, a rate the context refuses, a failed decode, no OfflineAudioContext
- **`tests/meter.verify.mjs`:** the meter against BS.1770-4 and EBU Tech 3342:
  - K-weighting coefficients
  - −3.01 LUFS for a full-scale 997 Hz sine, and −23 LUFS at −20 dBFS
  - both gates
  - LRA 10 LU on the two-level case
  - true peak 0 dBTP on the fs/4, 45° sine
  - the loudness history that the LUFS lane draws
- **Chromium checks:**
  - worker parity, cancellation, PCM recording and offline conversion
  - the kept worker (W4-01b): one worker for two renders and their meters, the result before the meter and the table equal to the meter's numbers, a late meter of an older render left out, Cancel keeping the worker, a worker that does not answer a cancel replaced, progress through the steam render's last stage; a 60 s re-render with `voice_scale` changed in under half the time and with a fresh page's WAV, the source sent once, a demo's other speaker sent anew; a 60 s source's first 14 s playable within 2.5 s, said so under the player, the whole render taking their place where playback had got to, none with loss or for 30 s, and Cancel during them
  - every visualizer mode, zoom, pan, seek, keys and scales
  - the codec and loudness lanes, frequency zoom, AUTO and fixed resolution, selection statistics, zoom to selection and loop
  - BARS AVG, and the real-take comparison: alignment of a synthetic take, the band report, A/B/C, the meter's REAL rows and removal
  - the live monitor with a fake microphone playing seeded noise bursts the test writes at run time: frames sent, modes, reported latency, low latency, push-to-talk, recording into the app lined up with an offline render within a sample, stop
  - video in and out: an MP4 and a MOV load as sources, and **Download video** keeps every picture sample
  - the meter, loudness-matched A/B (**Hear**) and shortcuts
  - batch queueing: picker, step 1 multi-select, drop on the batch panel, single-file drop as source
  - batch rendering with loudness per file, and ZIPs in all three formats, with FLAC decoded in the browser to exactly the WAV's samples
  - stale-render marking and remembered format
  - a source dropped during a render stops that render, and the new source renders as itself
  - the journey: a chosen file renders by itself and the player comes into view with the focus (at 1280 × 720 and 390 × 664); a changed setting renders by itself, three quick changes as one render; a re-render keeps the place and what is heard; a 61 s source marks a changed setting instead; presets lit by matching, the line of what differs and Reset; remembered settings, a share link over them, and storage that throws; the page's words; the version line and the newer-version notice
  - the chain strip, presets, console completion, `net_graph`, accessibility and mobile layout
  - keyboard and screen reader (W4-01c): the console's Tab, its hidden status, the live note and meters, the picture's description, the advanced switch; the microphone refused and missing, for Live and Record; at 390 px the selects, the loudness table's box, 44 px controls and 20 px checkboxes, no sideways scroll (320 px too); text sizes and contrast
  - the service worker: a worker update keeps the loaded audio, and workers and audio worklets get fresh scripts, as the page does
  - the 44.1/48 kHz file × device-rate matrix: a file keeps its own rate on either device; Ogg Opus decodes at 48 kHz, and a WebM falls back to the device rate
  - on a 48 kHz device: 16-bit WAV and FLAC at 44.1 and 22.05 kHz decode to the file's own samples; MP3 (MPEG-1, 2 and 2.5), AAC (M4A and ADTS) and Ogg Vorbis to their own rate and length; a refused rate and a failed decode fall back to the device rate; a source at each of 8, 11.025, 16, 22.05, 32, 44.1, 48, 88.2 and 96 kHz renders through the default preset; a take and a batch file are decoded at their own rate too

  Set `CHROMIUM_EXECUTABLE` to use a preinstalled browser whose build differs from Playwright's pin.

These tests establish implementation behavior; the accuracy claims rest on the paired comparison above. CI runs Node 22 and Chromium.

`pnpm vendor:opus` copies the pinned 1.6.1 runtime and notices verbatim. `pnpm build:opus11` rebuilds the libopus 1.1.5 module from the tagged sources, `pnpm build:celt` the CELT 0.11 module from its pinned commit, and `node tests/speex102/build.mjs` the Speex 1.0.2 module from its release tag (`node tests/speex102/native.mjs` compares it with a native build of the same sources). `pnpm build:lame` rebuilds the LAME 3.100 module from the release tarball, checked against its SHA-256. They need clang with the wasm32 target and wasm-ld. `pnpm test:vendor` checks the 1.6.1 files against the installed dependency and the libopus 1.1.5, CELT 0.11, Speex 1.0.2 and VR12 modules against their recorded hashes (`node tests/vr12/build.mjs` rebuilds the VR12 module; `vendor/voxware-vr12/README.md`). The runtimes and licenses are required distribution files.

## Files and licensing

| File | Role |
| --- | --- |
| `audio.js` | DSP and orchestration |
| `opus-codec.mjs` | packets, modes and delay; picks the libopus runtime; the CELT 0.11, Speex 1.0.2 and VR12 round trips |
| `vendor/libopus-1.1/` | libopus 1.1.5 WebAssembly for the Steam profile |
| `vendor/celt-0.11/` | CELT 0.11 WebAssembly for the vaudio_celt profiles |
| `vendor/speex-1.0.2/` | Speex 1.0.2 WebAssembly for the vaudio_speex profile |
| `vendor/voxware-vr12/` | Voxware VR12 WebAssembly, with the module's wrapper, for the `miles` profile (vaudio_miles, not a TF2 codec) |
| `vendor/libopus/` | libopus 1.6.1 (libopus-wasm) for a video's audio track |
| `vendor/lame/` | LAME 3.100 WebAssembly, the MP3 encoder |
| `vendor/swresample/` | libswresample's 24000 to 44100 Hz step, ported to JavaScript: the resampler of Steam's voice decoder (not loaded yet) |
| `audio-worker.js` | cancellable background rendering, format conversion and metering |
| `mic-capture.js` | PCM recording |
| `constants.js` | presets, codec profiles, receiver model, the listener's places |
| `room-dsp.js`, `room-presets.js` | the room effect as the engine does it, and the game's room presets as numbers |
| `app/` | the interface, in load order: `core.js` (elements, state, event feed), `rooms.js` (the listener's room), `console.js`, `source.js` (file, video and microphone), `render.js` (rendering, downloads, Hear), `meter.js`, `realtake.js`, `visualizer.js`, `netgraph.js`, `boot.js` |
| `batch.js` | batch queue, drag and drop, ZIP downloads |
| `formats.js`, `flac.js`, `zip.js` | download formats: WAV reader, FLAC encoder, stored ZIP |
| `meter.js` | loudness and level measurement |
| `reference.js` | finding a source in a real take, aligning it talk spurt by talk spurt, and the comparison measures (page, worker and Node tools) |
| `video.js` | reading MP4/MOV and writing the video back with the render as its audio |
| `filerate.js` | reading a sound file's own sample rate from its header, and decoding it at that rate |
| `demo.js` | reading the voice in a TF2 demo and decoding it as the receiving game does |
| `live.js`, `live-worker.js`, `live-worklet.js` | live monitor: interface, the streaming chain in a worker, capture and playback on the audio thread |

Tests and local tooling are under `tests/`.

Application code: MIT. Codec notices: `vendor/libopus/LICENSE`, `COPYING.opus` and `THIRD_PARTY_NOTICES.md`, `vendor/libopus-1.1/COPYING.opus` (libopus, BSD), `vendor/celt-0.11/COPYING.celt` (CELT, BSD), `vendor/speex-1.0.2/COPYING.speex` and `NOTICE` (Speex, BSD) and `COPYRIGHT.musl` (musl libm, MIT), `vendor/voxware-vr12/LICENSE` (the VR12 implementation, MIT) and its `COPYRIGHT.musl` (musl libm, MIT). The MP3 encoder is LAME 3.100, unmodified, under the GNU LGPL version 2 (`vendor/lame/COPYING.lame`). It is a separate module that loads only when an MP3 is saved and can be rebuilt or replaced with `tests/lame/build.mjs`; see `vendor/lame/README.md`. The resampler of Steam's voice decoder, `vendor/swresample/swresample.js`, is a modified part of FFmpeg: libswresample's 24000 to 44100 Hz path, translated to JavaScript from FFmpeg 8.1.2, under the GNU LGPL version 2.1 or later (`vendor/swresample/COPYING.LGPLv2.1`). It is one replaceable file with FFmpeg's notices kept, and it is its own source; see `vendor/swresample/README.md`. `tests/swresample/bank.mjs`, which computes its filter bank, is a translation of the same code and under the same licence. TF2, Source and Steam are Valve trademarks. This independent tool is not affiliated with Valve.
