# W3-09: Steam's side of voice, from public files and public writing

An investigation, 2026-11-10. No app code changed. Nothing of any binary is in this repository: the report describes
behaviour in its own words and cites constants with the place they were read. No leaked source was looked for, opened
or used.

**Status of this file:** written in stages and committed as each part was done.

## Summary

Steam's sender is now read, not fitted. The gate, the pre-roll, the hold, the batches, the silence record, the empty
packet and the encoder's settings were read from the owner's own `steamclient64.dll`, and each was then checked
against the owner's logs and the Set D demo's packets. The receiver-side decoder and its resampler were read too, and
the resampler turned out to be an open-source library whose output counts match the logs exactly.

| Question | Answer | Confidence |
| --- | --- | --- |
| 1. The gate | Steam reads the microphone in **chunks** (whatever the capture device delivered since its last frame; on the owner's PC 31.25, 62.5 or 93.75 ms). A chunk is active when **the mean of \|x\| is at least 1.0% of full scale (327.67), or its peak is at least 15% of full scale (4915)**. Two hidden console variables hold those numbers; nothing in the library sets them, so the transmission threshold shown in Steam's settings (Off, Medium, High) is not this gate. | Read: high. Checked against Set D's packets: the rule marks the last active chunk 7 or 8 chunks before the end marker in 18 of 20 spurts. |
| The pre-roll | The chunks read while silent are kept, the last **2400 samples (100 ms)** of them. An onset sends that buffer in front of the chunk that tripped the gate (100 ms of zeros if nothing was kept). So a spurt opens with 100 ms plus one chunk: 162.5 ms, sent as 8 frames. | Read: high. Logs: 8 frames in 17 of 20 (demo) and 17 of 23 (Set G). |
| The hold | **0.4 s of wall-clock time** after the last active chunk was read. The first chunk read later than that is encoded as the last one (its last frame padded with zeros) and carries the end marker. The next chunk is not sent as sound: only its length goes out, as the **silence record** (1500 or 750 samples). | Read: high. The demo: the end comes 380 to 460 ms of sound after the last active chunk. |
| Key up | The engine's `StopVoiceRecording` does not stop anything at once: Steam keeps capturing, gating and handing out voice for **0.5 s** more. If the gate has not closed by then, the spurt is left open with no end marker, and the next key press sends the end marker by itself: the **empty packet**. | Read: high. Matches W3-03's three empty packets (each followed by a silence record). |
| 2. The batches | One chunk is one packet. The encoder cuts 480-sample frames from the chunk plus what was left over from the last one and keeps the remainder (under 20 ms). So 62.5 ms gives 3 frames, now and then 4; 31.25 ms gives 1 or 2. Every packet starts with a sample-rate record. | Read: high. All 20 spurts of the demo and 2,326 packets of Set G fit chunks of whole multiples of 750 samples. |
| 3. The encoder | libopus **1.1.4** (the version string is in the public Linux build). `opus_encoder_init(24000, 1, VOIP)`, then three settings only: bit rate **32000**, signal **voice**, DTX **on**. Everything else is the library's default: complexity 9 (the same packets as the app's 10), VBR on, **constrained** VBR, no FEC, 20 ms frames. No high-pass, gain control or noise suppression of Steam's own runs before it (`voice_preprocess` is 0). The capture is opened through DirectSound at 24 kHz mono 16-bit, so the resampling from the device's rate is Windows's, not Steam's. | Read: high. Version: read in the Linux build, inferred for Windows. |
| 4. The decoder | Per frame: an end marker resets the decoder; a sequence number ahead of the expected one conceals up to **10** lost frames; one behind resets without concealing. A silence record becomes that many zero samples. Then 24 kHz to the game's 44.1 kHz with **FFmpeg's libswresample (8.1.2) at its default settings** (32 taps, 147 phases, Kaiser window), called once per packet. No gain or filter is applied to decoded sound (`voice_autogain` is 0). | Read: high. The open-source library, called the same way, gives the logs' sample counts exactly (7056, 2646, 882, and 2756 or 2757 for a silence record). |
| 5. Speex | The owner's `vaudio_speex` module: narrowband mode, the engine's quality 3 mapped to Speex quality **4** (20 bytes per 160-sample frame), constant bit rate, enhancement on. **No resampling:** the 11025 Hz samples go into the 8 kHz codec as they are, so a frame is 14.5 ms and the band reaches 5.5 kHz. The library inside is the floating-point **Speex 1.0.2**, not 1.2. Decoded samples are truncated to 16 bits with no clamp. A current TF2 cannot run it: asked for `vaudio_speex` it ends up on `vaudio_celt` (section 6). | Read: high. The release: four lines of code set beside Xiph's public sources. |

**The largest finding for the owner:** Steam has console variables that would give a sample-exact test of the whole
Steam path with no virtual cable: `mic_inputfile` (Steam reads a 24 kHz mono WAV instead of the microphone),
`mic_outputfile` (Steam writes what it captured, at 24 kHz, after Windows's resampler) and
`@voice_spew_activity_check 1` (one console line per chunk: its length, mean, peak and the gate's verdict). See
"What the owner could run".

## How it was read

| File | From | SHA-256 | Used for |
| --- | --- | --- | --- |
| `steamclient64.dll` (linked 2026-10-13) | the owner's Steam install | `e9045710ec7ee47d7b7488d1c5dda2d933dec7e251e965967a5c48f4df68eb4e` | every address below unless marked |
| `steamclient64.dll` (linked 2026-10-21) | `bins_win64.zip`, Valve's public client package | `253e0a11a4415b38c78a42f7bdd6ecc426455f06c1ba6453a48090df3142dbbc` | cross-check: the same instruction bytes for every constant below |
| `video64.dll` | the same package | `e84cb3391b4206feb03e1162b0d6815316905034a7ae190c66d0fa7fb00d48ba` | the resampler object (`CreateAudioResampler`) |
| `libswresample-6.dll` | `bins_codecs_win64.zip`, public | `2ed49e82c7cab6b197b5229759c4d4e1a9eaa74fa5a8303680b34436de74d399` | the resampler's defaults and version |
| `linux64/steamclient.so` | `bins_sdk_ubuntu12.zip`, public (the same file as SteamCMD's) | `3e32119f473cb9c2615e1b282da8498b9986378e8b71537a4aed9f77e7b797e0` | the libopus version string |
| `vaudio_speex.dll` (linked 2026-05-20) | the owner's, from a Source game install | `70d6643250a2010e79b79d727f9256a60f29317e5e2ad257d0721081afa9227f` | section 5 |
| `engine.dll` (the file W3-03 read) | the owner's TF2 install | `4802a74ce0abb1175851d00e37fc88609085a96238aa52ac0eb224ae4a08ec80` | section 6 |

- The owner's library has image base `0x138000000`; addresses below are virtual addresses in it. It keeps assertion
  texts with source file names (`p2pvoice.cpp`, `clientaudio.cpp`, `voiceencoder_opus.cpp`, `voice_decoder.cpp`,
  `voice_record_dsound.cpp`) and member names (`m_qVoiceChunks`, `m_vecSamplesMicDataPrevFrame`,
  `m_bufOverflowBytes`), which is how the functions were found. Function names below are the binary's own where it
  prints them (`CP2PVoiceSingleton::MicrophoneThink`, `GetMicrophoneData`, `CUser.RunFrame() -- CheckMicrophone`,
  `StartVoiceRecording`, `DecompressVoice`) and **labels of mine** otherwise.
- Read as data with a disassembler library; nothing downloaded was executed. libopus and FFmpeg are open source:
  their request numbers, structures and defaults were recognised from the public sources, and the distribution's own
  libswresample (6.1.1) was run to test the resampler's call pattern.
- The public Linux libraries are not stripped of their section names but hold only about 500 symbols, none of the
  voice code's: they gave the libopus string and nothing easier to follow than the Windows build's assertions.
- Every statement is marked **read**, **shown** (by the owner's logs or demo) or **inferred**.
- Scratch scripts, not committed: `grid.py` and `grid2.py` (the Set G logs' packet sizes against chunk lengths),
  `demo_sections.cjs` and `demo_gate.mjs` (the Set D demo's records, and the gate rule on its decoded chunks, with
  the repository's own `demo.js` and libopus build), `t.c` (libswresample driven as Steam drives it), `cx.mjs`
  (complexity 8, 9, 10). Only numbers derived from the private logs and demo are quoted.

## Part 1: what is already public

| Source | What it says | Trust | Against the project's findings |
| --- | --- | --- | --- |
| Steamworks, "Steam Voice" (`partner.steamgames.com/doc/features/voice`) | Start on key down, stop on key up, poll `GetAvailableVoice` each frame, `DecompressVoice` on the other side. No codec, rate or size. | Valve's own; thin | Agrees with W3-03's reading of the engine. |
| Steamworks, `ISteamUser` (`partner.steamgames.com/doc/api/ISteamUser`) | `GetVoice` "should be called once per frame, and at worst no more than four times a second"; after `StopVoiceRecording` "the system will keep recording for a little bit"; keep calling until `k_EVoiceResultNotRecording`; an 8 kilobyte buffer is recommended; "There may be no data at all during long periods of silence"; the decoder takes 11025 to 48000 Hz; the uncompressed output is deprecated. | Valve's own | Confirmed and made exact here: "a little bit" is 0.5 s; "four times a second" is because Steam keeps at most 8192 bytes queued; the decoder in fact accepts 1000 to 50000 Hz. |
| Zhenyang Li, "Reversing Steam Voice Codec", 2021 (`zhenyangli.me/posts/reversing-steam-voice-codec/`) | Read from the 32-bit Windows client: 8-byte SteamID, typed records, CRC32 at the end; type 11 is the sample rate (24000), types 5 and 6 are Opus ("OPUS" and "OPUS PLC"), 1 to 4 legacy or SILK, 0 a sample count; the Opus class sets a field to 32000; a built-in test expects 24000 Hz mono. | A careful public write-up of the same kind of reading as this one | Agrees with finding 11 and with `demo.js`. Extended here: the 32000 is the bit rate; type 0 is the silence record; type 6 differs from 5 only in carrying sequence numbers. |
| `steam-audio-codec`, a Rust crate by demos.tf (`docs.rs/steam-audio-codec`) | A decoder for these packets: record types 0, 6 and 11; inside type 6, a 16-bit length, `0xFFFF` resets the decoder and the expected sequence number, a sequence number behind the expected one resets, one ahead conceals the gap. | Open source, written against real TF2 demos | Agrees with `demo.js`. Two differences from Steam's own decoder, read here: Steam conceals at most 10 frames, and a silence record is played as zeros (the crate only counts it). |
| `CS2VoiceData` (a Go example) | Every Counter-Strike 2 demo it met was 24000 Hz mono. | Open source, small | Agrees. |
| Xiph's Speex repository (`gitlab.xiph.org/xiph/speex`, tags `Speex-1.0` to `Speex-1.2.1`) | The narrowband mode's structure and the control requests of each release. | The codec's own source | Dates the library inside `vaudio_speex` (section 5): 1.0.2, where the app's profile runs 1.2.1. |
| FFmpeg's libswresample (the distribution's 6.1.1, run here; Valve ships 8.1.2) | The resampler's defaults and what its flush does. | The library itself | Gives the logs' decoded sample counts exactly (section 4). |
| The game's own `find voice` output (already in the project) | The receiver's variables. | The game itself | Nothing new for Steam's side. |

Not found in public writing: the gate's rule, the pre-roll, the hold, the batches, the encoder's settings beyond
"Opus at 24 kHz", the decoder's resampler. Those are below, from the files.

Skipped: nothing that looked like leaked source came up in the searches made; GitHub outside the session's own
repositories is refused from this machine, so two open-source projects that speak the format (a ReHLDS voice
transcoder and SourceMod voice extensions) were not read.

## Part 2: what was fetched, and what was refused

Fetched from `client-update.steamstatic.com` and `steamcdn-a.akamaihd.net` (Valve's public servers, no login): the
SteamCMD installer; the client manifests for Windows, Linux and SteamCMD; the packages `bins_win64`, `bins_ubuntu12`,
`bins_sdk_ubuntu12`, `steamcmd_bins_linux`, `bins_codecs_win64`, `bins_misc_win64`. Nothing was refused there.

Not done: the dedicated servers through SteamCMD's anonymous login. The owner supplied a `vaudio_speex` module
meanwhile, which was the reason for that download. SteamCMD was not run.

Refused: `github.com` (reported in the brief; not retried). Needed from it: nothing essential.

## 1. The capture and the gate

### The capture (read)

- The recorder is created for **24000 Hz** (the constant `0x5dc0` passed at `0x1380d5b51`) and opens a DirectSound capture
  buffer of one second as PCM, **1 channel, 16 bits**, at that rate (the format block is built at `0x1380dedad`:
  PCM, one channel, two bytes a sample). So the conversion from the device's own rate
  and channel count to 24 kHz mono happens **inside Windows**, before Steam sees a sample. The capture roll-off of
  findings 14 and 16 (-6.5 dB at 11.75 kHz) is therefore Windows's capture resampler (or the virtual cable's), not
  Steam code. Inferred from that: it can differ between Windows versions and devices.
- Each time Steam's voice code runs (`MicrophoneThink`, `0x1380d7250`) it takes **everything the capture buffer has
  gained since the last time**, up to 6000 samples (two buffers of `0x2ee1` and `0x2ee2` bytes). That is the
  **chunk**. Steam does not cut it into frames before the gate.
- `voice_preprocess` (default `0`): when set, the chunk is passed through Speex's preprocessor in 480-sample blocks
  first. It is off, so **nothing** processes the samples between the capture and the gate. That preprocessor is set
  up (`0x1380d7e90`) with automatic gain, noise suppression of -30 dB, de-reverberation and its voice detector, the
  gain's target level taken from `mic_autogain` (default `16000`): all of it idle while `voice_preprocess` is 0.
  `voice_autogain` (default `0`) is read only on the decoding side. The echo cancellation, noise cancellation and automatic gain in the owner's Steam
  settings screenshot belong to the friends' voice chat (the library carries a separate WebRTC module and settings
  messages named `voice_use_echo_cancellation` and the like); nothing in the in-game path reads them. (Read for the
  in-game path; inferred for where those settings do apply.)

### The level test (read; `0x1380cf2d0`)

For a chunk of n 16-bit samples:

```
full      = 32767
peak_min  = trunc(full x voice_minabs)            # 0.15  -> 4915
mean_pct  = (sum of |x| / n) x 100 / full         # as a 32-bit float
active    = mean_pct >= voice_minavg              # 1.0
            or peak >= peak_min
```

- The two numbers are console variables named `@voice_minabs` (default text `0.15`, object at `0x1397f65a0`) and
  `@voice_minavg` (default `1.0`, at `0x1397f64c0`). Each is read in this function only, and nothing in the library
  writes either. A third, `@voice_spew_activity_check` (default `0`), makes the function print one line per chunk:
  `[+++] [62.50 msec] avgsample 1.23 | max 0.456 | high samples 7` (three marks: active, mean passed, peak passed;
  the chunk's length; the mean as a percentage; the peak as a fraction of full scale; the count of samples at or
  above the peak threshold).
- **Against finding 5** (opens at about -39.5 dBFS RMS): the rule is on the mean of the absolute value, 1% of full
  scale, which is -40.0 dBFS as a mean. For a sine that is a peak of -36.08 dBFS (-39.09 dBFS RMS): the -36 dBFS
  sine has a mean of 1.009% and opens; the -40 dBFS sine has 0.64% and does not. For noise with a Gaussian
  distribution it is -38.0 dBFS RMS: the -42 dB pink noise never opens. Every case in finding 5 agrees; the "-39.5"
  was the sine's figure, and noise or speech needs about 1 dB more than a sine of the same RMS.
- **New: the peak clause.** A single sample at or above 15% of full scale (-16.5 dBFS) opens the gate whatever the
  mean. A click in a quiet chunk transmits.
- **The window is the chunk**, not a 20 ms frame: 31.25 to 93.75 ms on the owner's PC. A short loud sound inside a
  long quiet chunk is averaged down.

### The state machine (read; `GetMicrophoneData`, `0x1380d5d30`)

Four states: silent, active, hanging, ended.

- **Silent, and the chunk is not active:** the chunk is appended to a buffer of past sound, which is then cut to
  its **last 2400 samples** (the constant `0x960`, compared at `0x1380d62e2`). Nothing is sent.
- **Silent, and the chunk is active:** if that buffer is empty, 2400 zeros are put in it (4800 zero bytes, the constant
  `0x12c0` at `0x1380d5ff7`). The chunk is appended, and **buffer plus chunk** is what goes to the
  encoder. The buffer is emptied. State: active.
- **Active or hanging, and the chunk is active:** the chunk goes to the encoder; the time of this call is noted.
- **Active, and the chunk is not active:** state becomes hanging; the chunk still goes to the encoder.
- **Hanging:** every chunk goes to the encoder. On the first call that comes **more than 0.4 s after the noted
  time** (`0x3ecccccd` at `0x139199e04`, compared at `0x1380d6161`), the chunk is encoded **as the last one** and
  the state becomes ended.
- **Ended, and the chunk is not active:** the chunk goes into the buffer of past sound, and the function reports
  **minus its length**: the silence record. State: silent. (If the call brought no samples, nothing is reported.)
- **Ended, and the chunk is active:** the spurt simply goes on in a new encoder state, with no pre-roll.

What follows from it:

- **The pre-roll is 100 ms of real sound plus the part of the onset's chunk before the onset**: 100 to 162.5 ms
  with 62.5 ms chunks. Finding 12 measured 115 to 152 ms.
- **The pre-roll is shorter straight after a spurt.** The buffer is emptied at each onset and refilled only by
  silent chunks, the first of which is the one sent as the silence record. An onset one chunk after a spurt's end
  gets 62.5 ms of pre-roll, not 100. In the demo two spurts open that way (pre-roll of 1500 and of 750 samples).
- **The hold is a time, measured between calls**, not a count of frames: the last chunk is the first one read more
  than 0.4 s after the last active chunk was read. With chunks about 56 ms apart that is the 7th or 8th chunk, so
  the sound after the last active chunk lasts 380 to 460 ms, and then comes one silence record of 31.25 or 62.5 ms.
  Finding 12's 425 to 485 ms after the last loud *frame* is the same thing measured from inside the last active
  chunk. **This is where the takes' pauses come out longer than the app's gate model gives** (W3-01's 50 ms): the
  model holds 22 frames (440 ms) from the last loud 20 ms frame and adds one silence record; Steam holds from the
  end of the last active *chunk*, which is up to 62.5 ms later than the last loud frame.
- **A pause is closed if it is shorter than the hold.** Finding 12's "560 ms" (hold plus pre-roll) is not a rule of
  the code: a new active chunk during the hang simply continues the spurt, and one after the end starts a new
  spurt with whatever pre-roll the buffer holds.
- **The clock is a 32-bit float of seconds since Steam started** (the time is narrowed from a double at `0x1380d72d0`). After about 4.6
  hours it resolves 2 ms, after 36 hours 16 ms, after 3 days 31 ms. On a Steam that has been running for days the
  hold is quantised that coarsely. (The narrowing is read; that the clock counts from Steam's start is assumed, as
  Valve's timer usually does; its effect on a take was not measured.)

### Key down and key up (read)

- `StartVoiceRecording` (`0x1380d10b0`): marks the client as recording and registers it as a user of the
  microphone. If the capture had fully stopped, the queue of pending voice is cleared, the encoder is reset and the
  capture device is started; if it is still inside the 0.5 s tail of the last key press, the pending stop is just
  cancelled and nothing is reset.
- `StopVoiceRecording` (`0x1380d1230`): notes the time. For **0.5 s** after it (`0x3fe0000000000000` at
  `0x139199008`, used at `0x1380d0fe3`) Steam goes on taking chunks into the queue the game reads; the microphone
  side has its own 0.5 s (`0x3f000000` at `0x139199e08`, used at `0x1380d72f0`) before the device is stopped. Only
  then does `GetAvailableVoice` answer "not recording" (the queue must be empty too), which is what the engine waits
  for.
- **The gate's state is not reset by either call.** If the 0.5 s runs out while the gate is active or hanging, no
  end marker is sent. At the next key press the first call finds a state of hanging with a noted time long past,
  so it encodes "the last chunk" at once, usually with no samples in hand: the encoder writes only the end marker.
  That is the **empty packet** (a type 6 record two bytes long). The chunk after it goes out as a silence record.
  This is W3-03's observation exactly: three empty packets, each 0.5 to 0.6 s after the previous sound and two of
  them followed by a silence record.
- So with push-to-talk: speech goes on being sent for up to 0.5 s after the key is released; a spurt that was still
  open then is cut without a marker; and a key press shortly before speaking opens a channel on the receiver with
  an empty packet and a silence record (W3-03's 5(c)).

## 2. The batches

### One chunk, one record (read)

`MicrophoneThink` writes at most one payload per call (`0x1380d7474` to `0x1380d75e5`):

```
0x0B, rate as 16 bits            # 24000; 16000 if the codec is SILK
then one of
  type (6), length as 16 bits, the encoder's output for this chunk
  0x00, sample count as 16 bits  # the silence record, in samples at the stream's rate
```

`CheckMicrophone` (`0x1380d0c90`, once per frame of Steam's own loop) copies that payload into a queue. The queue
holds at most **8192 bytes** (the constant `0x2000`, compared at `0x1380d0e54`); the oldest chunk is dropped beyond that (about 2 s of
voice: the reason for "at worst four times a second"). `GetVoice` (`0x1380cfdd0`) writes the SteamID, then **every
queued chunk that fits** in the caller's buffer, then the CRC32. The engine asks every 15 ms with a 2048-byte
buffer, so it nearly always gets one chunk per message. (Shown: all 1,816 messages of the demo hold exactly one
rate record and one chunk.)

### Frames from chunks (read; the encoder's `Compress`, `0x1380e2ce0`)

- The encoder keeps the samples that did not fill a frame (`m_bufOverflowBytes`). A call encodes
  `floor((kept + n) / 480)` frames of 480 samples (`0x1e0`) and keeps the rest. With fewer than 480 in hand it
  writes nothing, and no packet goes out for that chunk.
- Each frame is written as a 16-bit length, a 16-bit sequence number (type 6 only; it counts from 0), and the Opus
  packet.
- **The last call of a spurt** pads the remainder with zeros to a whole frame, encodes it, resets the Opus encoder
  (request 4028), writes `0xFFFF` and sets the sequence number back to 0. With nothing in hand it writes only the
  `0xFFFF`.

### Checked against the logs and the demo (shown)

If the code is read correctly, the frame counts of a spurt's packets must be explained by chunk lengths that add up
through that rule. Chunks on the owner's PC turn out to be **whole multiples of 750 samples (31.25 ms)**:

| Source | Packets | Fit chunks of k x 750 samples | k = 1 / 2 / 3 |
| --- | ---: | --- | --- |
| Set D demo (the real packets, with their end markers) | 1,797 in 20 spurts | all 20 spurts, every packet, the last one included | 23.4% / 74.8% / 1.8% |
| Set G logs (decoded sizes only; three runs) | 2,326 | all but 39, which sit at the start of 9 spurts whose pre-roll was short or after an unseen restart | 23.6% / 74.0% / 2.3% |

- The openings: 2400 + 1500 samples is 8 frames with 60 samples kept (17 of 20 in the demo); 2400 + 750 is 6
  frames; 1500 + 750 is 4; 750 + 750 is 3. Those are the demo's other three openings, and Set G's "6 in 4, 7 and 9
  once, 3 or 4 straight after a silence record".
- The sizes follow from the chunks with nothing to fit: a 750-sample chunk gives 1 frame when under 210 samples
  were kept and 2 otherwise; 1500 gives 3 (4 when 420 or more were kept); 2250 gives 4 or 5. With the shares above
  that is 10% one-frame, 13% two-frame, 65% three-frame and 10% four-frame packets: the logs' 10, 14, 65 and 11%.
  "A one-frame packet is usually followed by a four-frame one" is a short chunk followed by a catch-up.
- The silence record is one chunk's length: 1500 samples 17 times and 750 twice in the demo, 2756 or 2757 (22
  times) and 1378 or 1379 (6 times) at 44.1 kHz in Set G.
- **Where the 31.25 ms comes from was not read**: it is how far Windows's capture position moves at a time on the
  owner's PC (with a file as the microphone there is no grid: see `mic_inputfile`). The chunks come about
  **55.85 ms** apart on average (Steam's own frame); the game sees them 3, 4 or 5 ticks apart.

## 3. The encoder

Read from the class `VoiceEncoder_OPUS` (its virtual table is at `0x13919b510`):

- **Which codec:** the variable `voice_quality` picks it: 5 is Opus without sequence numbers, 6 and above "OPUS PLC"
  (the same class with a flag that adds them), 3 raw samples, anything else SILK at 16 kHz. Its default text is `4`
  (SILK), so something sets it to 6 for the packets we see; where was not read. The demo's packets are type 6.
- **Set-up** (`Init`, `0x1380e32d0`): `opus_encoder_init(state, 24000, 1, 2048)`: 2048 is `OPUS_APPLICATION_VOIP`
  (the constant `0x800` at `0x1380e3302`). Then exactly three requests:

  | Request | Value | Where |
  | --- | --- | --- |
  | 4002, bit rate | **32000**, set in both constructors (the constant `0x7d00`, stored at `0x1380e3063` and `0x1380e30d3`) | `0x1380e335d` |
  | 4024, signal | 3001, `OPUS_SIGNAL_VOICE` | `0x1380e336f` |
  | 4016, DTX | 1 | `0x1380e3383` |

- **Never set:** complexity, VBR, the VBR constraint, in-band FEC, expected loss, bandwidth, frame duration. The
  library's defaults therefore hold, and this build's `opus_encoder_init` (`0x138bb16e0`) writes them as the
  open-source 1.1 does: **complexity 9** (stored at `0x138bb1867`), VBR on and **constrained** (both flags set to 1 at
  `0x138bb18d3` and `0x138bb18dd`), no FEC, bit depth 24, bandwidth automatic up to what 24 kHz allows.
- **Frames:** always 480 samples, 20 ms. The output buffer allows up to 32767 bytes a frame.
- **A fresh encoder state per spurt:** the reset at each end marker, and at a key press after the capture had
  stopped.
- **The version:** the public Linux `steamclient.so` (32-bit and 64-bit) holds the string **`libopus 1.1.4`**. The
  Windows libraries hold libopus's error texts but not its version function (unused, so the linker dropped it).
  Inferred, high confidence: Windows is built from the same libopus. Finding 16 (1.1.x, most likely 1.1.2 or later,
  with 1.1.2 to 1.1.5 giving identical packets on the test signal) is settled at 1.1.4.
- The same library also holds a SILK encoder (`voice_silk_bitrate`, default 30000) for the friends' chat of older
  clients. Not used for the packets we see.

**Against the app** (`opus-codec.mjs`): it passes complexity 10 where Steam leaves 9. **It makes no difference:**
the project's own libopus 1.1.5 build, with Steam's other settings, gives byte-identical packets at complexity 8, 9,
10 and the default on the three test signals and a synthetic one (19,428 frames, every one equal). The app leaves
the VBR constraint at the library's default, which is what Steam does.

One difference in the entry points (read): Steam encodes from and decodes to **16-bit samples** (`opus_encode` and
`opus_decode`; the buffers advance by 960 bytes per 480 samples), where the app uses the float calls. On the way in
that is the same thing. On the way out the library rounds each sample to 16 bits and clips at full scale **before**
the resampler and the engine's gain.

## 4. The decoder

### `DecompressVoice` (read; `0x1380cfae0`)

- Accepts a rate from 1000 to 50000 Hz, checks the CRC32 and that the SteamID is plausible, and hands the records
  to a decoder object kept **per speaker** (`m_mapUserDecoders`), which lives until voice is reset.
- `voice_fakeloss` (default 0): a percentage of payloads dropped before decoding, for testing.
- **A sample-rate record** sets the stream's rate.
- **A silence record** (`0x1380dd1a0`): that many zero samples at the stream's rate, sent through the same path as
  decoded sound, so they are resampled like it. They are dropped instead when more than **0.2 s** is already waiting
  in this decoder's output (`0x3e4ccccd` at `0x13919a9c4`); in the game's use the output is taken at once, so they
  are played. (Shown: Set G's 2756 or 2757 samples per record.)
- **A type 6 record** (`0x1380e3110`), frame by frame:
  - length `0xFFFF`: reset the Opus decoder (request 4028), expected sequence number 0;
  - sequence number below the expected one: reset the decoder, conceal nothing;
  - above it: conceal `min(gap, 10)` frames (the decoder is called with no data), then decode;
  - a length of 0: 480 zeros;
  - otherwise `opus_decode` with room for 480 samples and FEC off.
- `voice_autogain` (default `0`) would run a gain over decoded sound; it is off, and `voice_preprocess` blocks it
  too. **Nothing is applied to decoded sound** but the resampler.

### The resampler (read, and reproduced)

- When the stream's rate differs from the rate asked for, the decoded block is passed to a resampler object made by
  `CreateAudioResampler`, a function Steam's client finds in its own `video64.dll`. (`voice_resample_quality`,
  default `1`; at `0` a fallback picks the nearest earlier input sample, with no filter.)
- In the public `video64.dll` that object sets six options and nothing else (`0x1800a0173` to `0x1800a024e`): the
  input and output channel layouts, sample rates and sample formats (16-bit, mono, both sides). Then `swr_init`. It
  is **FFmpeg's libswresample**; Valve's public `libswresample-6.dll` says `FFmpeg version 8.1.2`, and its option
  table gives the defaults: filter size **32**, phase shift 10, exact rational **on**, Kaiser window with beta
  **9**, no dither. For 24000 to 44100 Hz (147/80) that is a bank of **147 phases of 32 taps**, a windowed sinc cut
  at the input's Nyquist frequency, computed in 16-bit fixed point.
- **Per packet** (`0x1380d2680`): ask the library how many samples it could give for n input samples; convert; and
  if fewer came out than that upper bound, call it again **with no input** for the rest, which is the library's
  "flush".
- **Reproduced:** the distribution's own libswresample (6.1.1), driven with exactly those three calls per packet,
  returns 7056 samples for 3840, 2646 for 1440, 3528, 1764 and 882 for 1920, 960 and 480, and 2757, 2756, 2756,
  2756, 2757 for successive runs of 1500 zeros: the counts in the owner's logs, including one silence record in
  four being a sample longer.
- **What the flush does (measured on that run):** only the first call of a decoder's life flushes. It mirrors the
  last 16 input samples to finish the first packet's output with no delay, and from then on the stream runs **8
  input samples (0.33 ms) ahead**: about 40 output samples around the first packet's end are wrong, and 0.33 ms is
  missing there. After that every packet's output is continuous with the last. Once per speaker per session.
- **Its response** (computed from the filter as the open source builds it): flat to 10 kHz, -0.1 dB at 10.5 kHz,
  -0.7 at 11, -1.4 at 11.25, -2.4 at 11.5, -4.0 at 11.75, -6.0 at 12 kHz. **Images are not well suppressed just
  above 12 kHz:** what the codec carries at 11 to 12 kHz reappears mirrored at 12 to 13 kHz, 22 dB down at 13 kHz,
  12 dB at 12.5 kHz and 6 dB at 12 kHz; above 14 kHz the rejection is over 65 dB.

**Against the findings.** Finding 14 says the receiver is flat within 0.1 dB to 11.5 kHz once Steam's packets are
decoded by the app's chain: the app's own 24 to 44.1 kHz resampler stands in for this one, and the two were not
compared here. Finding 2's "noise-like energy at 12 to 19.5 kHz, reproduced by clipping" should be looked at again
below 13.5 kHz, where this resampler puts a mirror of the top of the band that is coherent with the source.

## (a) The sender model the app should run

```
constants
  RATE      = 24000
  FRAME     = 480                          # 20 ms
  PREROLL   = 2400                         # samples of past sound kept, 100 ms
  HOLD      = 0.4 s                        # wall clock, from the read of the last active chunk
  TAIL      = 0.5 s                        # after key up
  MEAN_MIN  = 0.01 x 32767                 # 327.67, on the mean of |x| over the chunk
  PEAK_MIN  = trunc(0.15 x 32767)          # 4915
  GRID      = 750 samples                  # 31.25 ms: the capture's step on the owner's PC
  THINK     = 55.85 ms on average          # Steam's own frame; jittered (see the table)

each Steam frame, at time now:
    chunk = the whole GRID steps the capture has gained since the last frame      # 750, 1500, sometimes 2250
    active = mean(|chunk|) >= MEAN_MIN or max(|chunk|) >= PEAK_MIN

    if state == SILENT or state == ENDED:
        if active:
            if state == SILENT:
                if past is empty: past = 2400 zeros
                chunk = past + chunk ; past = empty
            state = ACTIVE ; last = now ; send(encode(chunk, final = false))
        else:
            past = last PREROLL samples of (past + chunk)
            if state == ENDED and chunk is not empty: send(silence record, len(chunk))
            state = SILENT
    else:                                   # ACTIVE or HANGING
        if active: state = ACTIVE ; last = now
        else:      state = HANGING
        final = (state == HANGING and now > last + HOLD)
        send(encode(chunk, final))
        if final: state = ENDED

encode(pcm, final):
    buf = kept + pcm
    if final: pad buf with zeros to a whole number of frames
    write each whole frame as: length, sequence number (from 0), libopus 1.1.4 packet
        # opus_encoder_init(24000, 1, VOIP); bit rate 32000; signal voice; DTX on; all else default (complexity 9)
    kept = what is left of buf
    if final: reset the encoder ; write 0xFFFF ; sequence number = 0
    nothing written -> no packet

send(x): one message: SteamID, 0x0B 24000, x, CRC32      # the game relays it on its next 15 ms tick
```

Beside the logs:

| What | The model | The owner's logs and demo |
| --- | --- | --- |
| Opening packet | 2400 + 1500 samples: 8 frames (6 after a 750 chunk) | 8 frames in 17 of 20 (demo), 17 of 23 (Set G); 6 in 1 and in 4 |
| Later packets | 3 frames from a 1500 chunk, 4 when the remainder passes 420; 1 or 2 from a 750 chunk | 60 ms 65%, 40 ms 14%, 80 ms 11%, 20 ms 10% (Set G); 64, 13, 11, 10% (demo) |
| Chunk lengths, k x 750 | to be drawn: k = 2 in 75%, 1 in 23%, 3 in 2% | measured so (about 4,000 chunks) |
| Order of chunk lengths | a clock of 55.85 ms against the 31.25 ms grid, with a few ms of jitter and about 3% of frames late | a 750 chunk every 3 to 5 chunks; pairs: 2-2 53%, 2-1 22%, 1-2 22%, 3-1 1.7%, 1-3 1.4%, 1-1 0.3% |
| Packets a second | 17.9 | 17.8 (demo), 18.0 (Set G: one every 55.5 ms) |
| Hold | the first chunk read more than 0.4 s after the last active one: the 7th or 8th | 7 chunks after in 9 spurts, 8 in 9 (demo; two unclear) |
| Silence record | the chunk after the last: 1500 or 750 samples | 1500 x17, 750 x2 (demo); 62.5 ms x22, 31.25 ms x6 (Set G) |
| Gate | mean of \|x\| at 1.0% of full scale, or a peak at 15% | -36 dBFS sine opens, -40 does not, -42 dB pink never (finding 5) |
| Bit rate | 32000 asked, constrained VBR, DTX | 29.96 kbps over coded frames; 693 of 5,109 frames DTX (demo) |
| Empty packet | a key press after a spurt the 0.5 s tail cut short | 3 in Set G, each then a silence record or a key press |

Two things a file render must choose, because Steam's answer depends on the machine: the chunk grid and the frame
clock. With `mic_inputfile` (below) Steam's own chunks are simply the time since the last frame times 24000, with no
grid.

## (b) Corrections

To the findings (`tests/REFERENCE_2026.md`):

- **5:** the gate is the mean of the absolute value over a capture chunk at 1.0% of full scale, or a peak at 15%;
  "-39.5 dBFS RMS of a 20 ms frame" is its value for a sine. Not a WebRTC detector and not a 20 ms rule.
- **11:** add: each message is one chunk; every chunk carries a sample-rate record; the sequence number restarts
  because the encoder writes 0 after each end marker (read).
- **12:** the pre-roll is the last 100 ms before the onset's chunk (2400 samples; zeros if none), not 6 frames; the
  hold is 0.4 s of wall-clock time from the read of the last active chunk, not 22 frames; the 31.25 ms grid is the
  capture's step. "A pause shorter than 560 ms keeps the spurt going" should read: a pause shorter than the hold.
  "Each new talk spurt starts a fresh encoder and decoder": confirmed, as a reset of each.
- **14 and 16:** the capture roll-off is Windows's resampler (DirectSound capture opened at 24 kHz), so it belongs
  to the sender's machine. The libopus release is 1.1.4. The encoder's complexity is the default, 9, not 10 (the
  packets are the same either way).
- **2 and 14:** the receiver's 24 to 44.1 kHz resampler is libswresample's default filter; its roll-off and its
  images above 12 kHz are in section 4.
- **8:** concealment is capped at 10 frames per gap (read; the takes could not show it).

To the app:

- **The Steam profile's 24 to 44.1 kHz step** (`audio.js`, `resampleSinc` from the codec's rate to the voice rate)
  stands in for libswresample's default filter, called once per packet. For a sample-exact receiver the real
  library, or a port of its 16-bit path, has to run with the three calls of section 4; short of that, its response
  above 10.5 kHz and its images to 13.5 kHz are what to match.
- **`CODEC_PROFILES.speex`** (`constants.js`) has the codec at 8000 Hz with a resampler on each side. The module
  does not resample: the codec should be handed the 11025 Hz sound directly (section 5). The library is Speex
  1.0.2, where the profile runs 1.2.1, and decoded samples wrap instead of clipping; quality 4, 20 bytes, constant
  bit rate and enhancement are right.
- **The gate** in the app works on 20 ms frames with a 6-frame pre-roll and a 22-frame hold; Steam's is the chunk
  rule of section 1.
- Opus: decode to 16-bit as Steam does (rounded and clipped) before the resampler.

To the receiver plan's sender model (`docs/reports/W3-02-plan.md`):

- Replace "a 56 ms hand-out clock, 10 ms and 20 ms of jitter, a frame held back one time in ten" with the chunk
  model above: packet sizes then follow from chunk lengths with no fitted constant, and one-frame packets come out
  at the logged 10%.
- Replace the fixed 6-frame pre-roll and 22-frame hold with the state machine above. The opening packet is 8 frames
  because it is 2400 samples and a chunk, not because of a drawn number (the plan draws 8 with 0.77).
- A spurt that follows a pause just over the hold opens with a short pre-roll (62.5 ms or less): the plan's "three
  more spurts opened with 3 or 4 frames".
- Decision 8 (no empty packet in a file render) stands: the empty packet needs a key.
- Decision 9 (lost frames ride with the next packet): confirmed by the decoder, with the cap of 10.

## (c) What remains unknown, and the cheapest way to learn each

| Unknown | Cheapest way |
| --- | --- |
| Whether the app's libopus 1.1.5 at complexity 9 gives Steam's packets bit for bit | The `mic_inputfile` run below with SourceTV on: the input is then known to the sample |
| The 31.25 ms capture step and the 55.85 ms frame: the owner's PC, or every PC? | `@voice_spew_activity_check 1` on both PCs: each line prints the chunk's length |
| Windows's capture resampler exactly | `mic_outputfile`: Steam writes what it captured at 24 kHz; play the test signal through the cable once |
| The first-packet flush of the resampler (40 samples, once per speaker) in a recording | `voice_recordtofile 1` with `voice_maxgain 1` on the first key press after the game starts, with a known input |
| What sets `voice_quality` to 6 | Not needed for the model |
| Why a 32-bit game with a `vaudio_speex` module still ran CELT | The console line `Unable to load voice codec ...` at map load and its three numbers (section 6); failing that, that game's `engine.dll` |
| Speex 1.0.1 or 1.0.2 | Cannot be told from the module; 1.0.1 has no tag in Xiph's repository. Build `Speex-1.0.2` |
| Whether a remote client under `vaudio_speex` falls back to the Steam codec | Two PCs, one hosting with `sv_voicecodec vaudio_speex`: `voice_showincoming` on each |
| The friends' chat settings in the screenshot | Not in this path (inferred); a take with them all switched off would prove it |

### What the owner could run

All in **Steam's own console** (open `steam://open/console` from a browser or the Run box), not the game's. These
are console variables of the Steam client; whether the release client lets each be set from its console was not
tested (the code registers them without a hidden or cheat flag).

1. `@voice_spew_activity_check 1`, then talk in the game. Steam's console (and its console log) prints one line per
   chunk: the gate's verdict, the chunk's length in milliseconds, the mean and the peak. This checks the gate's
   numbers, the chunk grid and the frame clock directly. Set it back to 0 afterwards.
2. `mic_inputfile <full path to a WAV>`: 24000 Hz, 16-bit, mono, with a plain 44-byte header (the reader skips
   exactly 44 bytes when the file starts with `RIFF`, and does not look at the header's fields). Steam prints
   `loaded voice input file ...` and plays the file to the encoder in place of the microphone, in real time,
   looping. With the game's `voice_loopback 1`, `voice_maxgain 1` and `voice_recordtofile 1`, or with SourceTV
   recording, that is the sample-exact check of the gate, the encoder, the decoder and the resampler that
   `voice_inputfromfile` could not give under the Steam codec. A working capture device is still needed. Set it to
   an empty string to go back to the microphone.
3. `mic_outputfile <path>`: Steam writes the captured sound to a 24 kHz WAV. Its header is written with zero
   lengths first and Steam's own message says "close Steam before using": quit Steam, and if the lengths are still
   zero read the file as raw 16-bit samples after the 44-byte header.
4. `-log_voice` on Steam's command line writes `logs/voice_log.txt`, but for the in-game path it records almost
   nothing (the first "Received voice data" and "Received silence data" of a decoder, and errors). Not worth a run.
5. `@voice_minavg` and `@voice_minabs` can be changed the same way; `@voice_minavg 0` would open the gate for
   everything, which gives takes with no gate in them.

## 5. The Speex module

Read from the `vaudio_speex.dll` the owner supplied (32-bit x86, linked 2026-05-20, SHA-256
`70d6643250a2010e79b79d727f9256a60f29317e5e2ad257d0721081afa9227f`, image base `0x10000000`; its build path ends
`engine\voice_codecs\speex\Retail`). No recording of Speex can be made from a current game (section 6), so this
reading is the reference for the `speex` profile. It is written to be built from. All of it is **read** unless
marked.

### What is in the module

Two classes and the Speex library, statically linked:

- `VoiceEncoder_Speex` (virtual table at `0x100281ec`): the codec proper. Its methods, in the table's order after
  the destructor: `Init` (`0x10012040`), release, `EncodeFrame` (`0x10011f10`), `DecodeFrame` (`0x10011ea0`),
  `ResetState` (`0x10012170`).
- `VoiceCodec_Frame` (virtual table at `0x100281a4`): the generic wrapper that turns a frame codec into the
  engine's `IVoiceCodec` (the same wrapper W3-03 read around CELT): `Init` (`0x10011d10`), `Compress`
  (`0x10011a70`), `Decompress` (`0x10011c80`), `ResetState`.

### The library: Speex 1.0.2

The narrowband mode structure, read at the address the mode object points to (`0x10036f88`), is: 160, 40, 10,
**640**, 17, 144, 0.9, 0.6, 0.01, 1.0001, **0.0**, eight sub-modes, default sub-mode 5, quality map 1, 8, 2, 3, 3,
4, 4, 5, 5, 6, 7. Set beside Xiph's public repository (`gitlab.xiph.org/xiph/speex`):

| Evidence in the module | Releases whose source has it |
| --- | --- |
| The structure above, with a buffer size after the LPC order and a pre-emphasis field | 1.0rc3, 1.0, 1.0.2, 1.0.3, 1.0.4, 1.0.5 and 1.1; gone by 1.1.12; different again in 1.2.1 |
| The encoder's control function handles requests 3, 4, 6 to 9, 12 to 19, 24 to 26, 29 to 35 and 100 to 102; the decoder's 0, 1, 3, 7, 9, 19, 20, 22, 24 to 26 and 100 to 103. Neither handles 39 (look-ahead) nor 36 and 37 | exactly the lists of 1.0rc3, 1.0, 1.0.2 and 1.0.3; 1.0.4 adds 39, 1.1 adds 36 and 37 |
| A forced pitch gain above the top of its 4-bit range is set to **15** (the encoder, `0x10002d0d`) | 1.0.2 and later; 1.0 sets it to 0 |
| The excitation gain's index is `floor(3.5 x log(gain))`, with **no half added** before the floor (`0x10002d5a`) | 1.0 and 1.0.2; 1.0.3 adds 0.5 |

Only **1.0.2** (tag `Speex-1.0.2`, 2003-09-24) passes all four. A release 1.0.1 came between 1.0 and 1.0.2 and has
no tag in the repository, so it cannot be told apart from here: **fetch `Speex-1.0.2`**. Confidence: high that it
is 1.0.1 or 1.0.2 and not 1.0, 1.0.3 or later (each excluded by a line of code read in the module); the last two
rows change the bits the encoder writes, so the neighbours would not give the same packets. It is the
floating-point library (1.0 has no fixed-point build). No version string is in the file.

### Set-up (`VoiceEncoder_Speex::Init`)

In order:

1. A Speex bit buffer is initialised; one encoder and one decoder are created, both from the **narrowband** mode
   (frames of 160 samples).
2. The frame's size in bytes of sound is reported as 320 (160 samples of 16 bits).
3. The engine's quality argument is mapped: **1 gives Speex quality 0, 2 gives 2, 3 gives 4, 4 gives 6, 5 gives 8;
   anything else 0.** The engine passes 3 for `vaudio_speex` (W3-03), so **quality 4**.
4. The bytes per coded frame are taken from a table indexed by the Speex quality (`0x10028204`): 6, 6, 15, 15,
   **20**, 20, 28, 28, 38, 38, 38. Quality 4 selects sub-mode 3 through the quality map, Speex's 8 kbit/s mode:
   160 bits, exactly 20 bytes.
5. The requests, every one the module ever makes besides the reset:

   | On | Request | Value | Effect |
   | --- | --- | --- | --- |
   | encoder | 4, set quality | 4 | sub-mode 3, constant bit rate |
   | decoder | 4 | 4 | none: the 1.0.2 decoder does not know request 4 and only prints a warning |
   | decoder | 0, set enhancement | 1 | the perceptual enhancement is **on** |
   | decoder | 24, set sampling rate | 8000 | stored; no effect on the sound |
   | encoder | 24, set sampling rate | 8000 | stored; only used for bit-rate arithmetic |

   Never set: VBR, VAD, DTX, ABR, complexity. The library's defaults hold: all off, **complexity 2**.
6. `Init` fails only if either object could not be created. The wrapper's `Init` then stores 160 samples and 20
   bytes as its frame sizes (and refuses sizes above 2048).

`ResetState`: request 26 (reset state) on the encoder and on the decoder.

### A frame in, a frame out

- **`EncodeFrame`:** the 160 16-bit samples are converted to floats **with their integer values** (no division by
  32768: Speex 1.0 works on floats in the 16-bit range). The bit buffer is reset, `speex_encode` is called with the
  floats, and the bit buffer is written out as exactly 20 bytes.
- **`DecodeFrame`:** the 20 bytes are loaded into the bit buffer, `speex_decode` fills 160 floats, and each float
  is converted to an integer **by truncation toward zero** and stored as 16 bits with **no clamp** (`0x10011ee0`):
  a decoded value of 32768 or more, or below -32768, keeps only its low 16 bits and so wraps to the other end of
  the range. Speex 1.0.2's decoder does not limit its output (the public source copies the frame out as it is), so
  this happens whenever the decoded wave overshoots full scale, which loud input does. A model has to wrap, not
  clip.
- There is no concealment path: `DecodeFrame` always reads 20 bytes.

**The arithmetic (added 2026-11-11, W3-18).** The reading above is of what the module does, not of how it computes
it. The module's codec arithmetic is SSE2 in single precision (it executes no x87 instruction), compiled with the
compiler's fast floating-point model, so in 25 places of 7 files of libspeex 1.0.2 it does not compute what strict C
of the same source computes: some sums are added eight at a time, three double expressions are computed in float, two
divisions are multiplications by a reciprocal, a few additions are re-ordered, and `cos`, `acos`, `exp` and `log`
are in places the C runtime's float routines, whose cosine and arc cosine are not correctly rounded. A build of the
unchanged source gives the same sound, coded differently from one frame on (it equals the game's recording, Set M, in
92,967 of 145,920 samples). The app's build states those 25 places in plain C and has those two routines
(`tests/speex102/patch.mjs`, `tests/speex102/vsx_math.c`), and equals the module, run in a CPU emulator, on every clip
and argument it was scored on, and the game's decoded recording sample for sample (the orchestrator's private run on that build; `docs/reports/W3-18-speex-exact.md`, `tests/REFERENCE_2026.md` Set M).

### The wrapper (what `createSpeexStream` has to copy)

- **`Compress(samples, count, out, room, final)`:** it keeps the samples that did not fill a frame. While what
  is kept plus what came makes 160 or more, and 20 bytes of room remain, it builds one frame (kept samples first)
  and encodes it; the frames go into the packet **back to back, with nothing before, between or after them**. What
  is left (under 160) is kept for the next call. On the final call a kept remainder is **padded with zeros** to a
  frame and encoded. It returns the bytes written.
- **`Decompress`:** every whole 20 bytes of the packet becomes 160 samples, in order.
- **No resampling anywhere.** The engine runs `vaudio_speex` at **11025 Hz** (W3-03: capture, gain and playback),
  and the module hands those samples to the narrowband codec as they are. So, in real time:

  | | As the codec believes | As it runs in the game |
  | --- | --- | --- |
  | Sample rate | 8000 Hz | 11025 Hz |
  | Frame | 20 ms | **14.51 ms** (160 samples) |
  | Bit rate | 8000 bit/s | **11025 bit/s** (20 bytes a frame) |
  | Band | to 4 kHz | to 5.5 kHz |
  | Pitch search, 17 to 144 samples | 56 to 471 Hz | 77 to 649 Hz |

- **Packets:** the engine's recorder hands the wrapper what it captured each 15 ms tick: 165 samples at 11025 Hz.
  So nearly every packet is one frame (20 bytes) and about one in thirty holds two (40 bytes); 68.9 frames a
  second. (Inferred from the two readings; no log of Speex exists.)

### Against the app's profile (`CODEC_PROFILES.speex`, `tests/LEGACY_CODECS.md`)

| The profile assumes | The module | |
| --- | --- | --- |
| Narrowband | narrowband | Confirmed |
| Quality 4, 20-byte packets, 160-sample frames | the same, for the engine's quality 3 | Confirmed |
| Constant bit rate, no VAD, no DTX | never set, so the defaults | Confirmed |
| Enhancement on | set to 1 | Confirmed |
| The receiver at 11025 Hz | the engine's rate | Confirmed |
| The codec at 8000 Hz, with a resampler each side | **no resampler: the codec is fed the 11025 Hz samples** | **Corrected** |
| Speex 1.2.1 | **Speex 1.0.2** (or 1.0.1) | **Corrected** |
| (not modelled) | float to 16-bit by truncation, wrapping beyond full scale | New |
| (not modelled) | complexity 2, the default | To check against what the profile passes |

The bit-stream is the same in 1.0.2 and 1.2.1 (version 4), so either decodes the other's packets; the encoder's
choices and the decoder's enhancement differ between them (not compared in sound here).

## 6. What a current TF2 does when asked for `vaudio_speex`

Asked by the orchestrator after the owner's run: a current game set to `sv_voicecodec vaudio_speex` did not run
Speex; its recording is 22050 Hz in 512-sample packets and matches `vaudio_celt`. Read from the owner's TF2
`engine.dll` (SHA-256 `4802a74ce0abb1175851d00e37fc88609085a96238aa52ac0eb224ae4a08ec80`, the file W3-03 read):

- **The server does not change the name** (`0x18013d970`): when a map starts it copies `sv_voicecodec`'s text into
  its voice-init message as it stands, with a rate of 11025 for `vaudio_speex`, 0 for `steam` and 22050 for
  anything else. The variable has no change callback, so setting it during a map does nothing until the next map.
- **The client's handler for that message does not change it either** (`0x1801fbbf0`): it calls `Voice_Init` with
  the codec and the rate from the message and ignores the result.
- **`Voice_Init` has no substitute** (`0x1800599f0`): for `vaudio_speex` it tries to load a module of that name,
  and when that fails it prints `Unable to load voice codec 'vaudio_speex'. Voice disabled. (module 0, iface 0,
  codec 0)` (an ordinary console message, not a developer one), shuts voice down and reports failure. That is
  W3-03's reading, and it is right as far as it goes.
- **The substitution is one step further out** (`0x180058c50`, a function W3-03 did not follow). It runs only
  when voice is not initialised and a variable that looks like `voice_enable` is on. It looks up the *local*
  `sv_voicecodec` by name, calls `Voice_Init` with its text, and **if that fails, or the text is empty, it calls
  `Voice_Init("vaudio_celt")` at 22050 Hz**. Its callers are the first and fourth entries of a table of six
  functions at `0x1804631d8` (inferred from what they do: the engine's voice-tweak interface, which is the
  microphone test and the voice controls of the options) and one function of the tools interface. So on the
  machine whose own `sv_voicecodec` says `vaudio_speex` (a listen server's host, which is the owner's set-up),
  voice comes back as **`vaudio_celt`, 22050 Hz, 512-sample frames in 64-byte packets**, with no message saying
  so. Inferred from the same reading: a client of somebody else's server has its own `sv_voicecodec` (default
  `steam`; the variable is not sent to clients), so there the same step would bring voice back on the Steam
  codec, and host and client would not understand each other. Not tested.

**Would TF2 do what HL2DM did?** The 64-bit game has no `vaudio_speex` module, so: yes, **high confidence** that
on a listen server's host, whenever voice works at all under `sv_voicecodec vaudio_speex`, it is `vaudio_celt`, by
the path above. Medium
confidence that it needs nothing from the player: the fall-back is reached through the voice-tweak interface, and
when the client module calls that during ordinary play is in `client.dll`, which was not read (the owner's 64-bit
run, where voice simply worked, says it is called).

**What TF2's binary does not explain** is a 32-bit game that has a loadable `vaudio_speex` module and still runs
CELT. By this code a module that loads would be used, at 11025 Hz. Three things to tell apart, in order of
cheapness: the variable was set after the map had started (the name is taken at map start); the module was not
where that game looks or failed one of its three steps (the console line's three numbers say which: module
loaded, interface found, codec initialised); or that game's engine differs from TF2's, which only its own
`engine.dll` would show.

**The check the owner could run in TF2:** `con_logfile speexcheck.log; sv_voicecodec vaudio_speex`, then load a
map (`map itemtest`), then `voice_loopback 1; voice_showincoming 1` and speak. Predicted: the log has the `Unable
to load voice codec 'vaudio_speex'` line once, at the map load; the `incoming samples` lines say **512** (CELT at
22050 Hz; Speex would say 160); if nothing is printed at all, voice is off, and opening Options, Voice once (the
microphone test) should bring it back as CELT. In the 32-bit game with the module in place, the same run shows
whether that line appears and with which three numbers.

## Corrections (2026-11-10, from W3-14 and the W3-16 read)

- **The printed peak is a percentage of 32768**, not a fraction of full scale (the `max` figure of the
  `@voice_spew_activity_check` line). Checked on 789 lines of the file-input run.
- **The hold is not plain wall-clock time.** It is `now > noted + 0.4` in 32-bit floats on a clock that counts
  from Steam's start, so the float's step matters from about a day and a half of running on, not only "after
  days": `docs/reports/W3-16-steam-hold-read.md`.
- **The clock is not the 15.625 ms timer's multiples.** Steam's reads fall 48 to 64 ms apart, nearly uniform
  (`docs/reports/W3-14-steam-file-input.md`, section 3).
