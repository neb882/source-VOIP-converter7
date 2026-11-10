# W3-03: what the game's own files say about the voice receiver and the legacy codecs

An investigation, 2026-11-10. No app code changed. Nothing of the game's files is in this repository: the report
describes behaviour in its own words and cites constants with the place they were read.

**Status of this file:** written in stages and committed as each question was answered. After the first version the
owner ran the debug variables in the game; "Checked against the owner's console log" below lays that log beside the
code. The section "What was not read" at the end is the list of what is still open.

## For the recording session (question 4, answered first)

All of this is read from the code of `bin/x64/engine.dll` unless marked otherwise.

**`voice_inputfromfile` does nothing with the Steam codec.** With `sv_voicecodec steam` the engine takes the
microphone sound from Steam itself (`ISteamUser::GetVoice`) and never looks at the file's samples. The file is only
used on the legacy path (`vaudio_celt`, `vaudio_celt_high`, `vaudio_speex`), where the engine's own recorder feeds the
engine's own encoder. So for the modern preset this variable cannot replace the virtual cable. (High confidence: the
function that fetches compressed voice branches on the Steam flag before the file is touched, at `0x180058d95`.)

For the legacy path, when it is used:

- **Where:** the bare name `voice_input.wav` is opened with the C runtime's `fopen` in mode `rb`, not through the
  game's file system. So it is looked for in the process's working directory. Inferred: that is the game's root
  folder, the one that holds the game's executable (`Team Fortress 2/`), not `tf/`. If nothing happens there, `tf/`
  is the second place to try.
- **Format:** the reader assumes the plain 44-byte WAV header. It reads the channel count (offset 0x16), the sample
  rate (0x18), the bits per sample (0x22) and the data length (0x28), then takes everything from offset 0x2C as the
  samples. The channel count, rate and bit depth are read into local variables and **never used**: nothing is
  checked, resampled or rejected. The bytes are fed to the encoder as 16-bit mono at the voice rate of the codec
  (22050 Hz for both CELT codecs, 11025 Hz for Speex). A file at another rate plays at the wrong speed; a stereo
  file comes out as noise at half speed; a header with extra chunks before `data` (which many editors write) puts
  the data in the wrong place. Export as 16-bit mono PCM at the codec's rate with no metadata.
- **Conditions:** read when push-to-talk goes down (`+voicerecord`), only if `voice_inputfromfile` and
  `sv_allow_voice_from_file` are both non-zero and the client is fully connected. It is paced by the wall clock
  (samples = seconds since the last call times the rate, at most 8192 a call), is not looped, and still needs a
  working capture device, because the recorder object must exist.

**`voice_recordtofile` works with the Steam codec, within limits.**

- **Where:** `voice_micdata.wav` and `voice_decompressed.wav`, bare names, `fopen` in mode `wb`: the same working
  directory as above (inferred: the game's root folder).
- **When they are written:** not on key release. The buffers are created when push-to-talk goes down with
  `voice_recordtofile 1` already set. On release the engine asks Steam to stop and keeps polling it; the files are
  written when Steam answers "not recording" (after its hold, about half a second), or at the next key press,
  whichever comes first. Each key press starts both files again and overwrites the last ones.
- **Limit:** each buffer is 1 MiB (`0x100000` bytes) and what does not fit is dropped silently. That is 11.9 s of
  decompressed voice at 44.1 kHz. Keep each key press under about 11 s of received voice.
- **`voice_decompressed.wav`:** 16-bit mono, 44100 Hz (header and data agree). It is taken in the function that
  receives a voice packet, **after Steam's decoder and after the receiver's automatic gain** (the gain works in
  place on the decoded block, and the copy to the file buffer comes after it), before the block goes into the
  channel's queue. It holds every packet received from every speaker while the buffer exists, end to end, with no
  silence between packets and no timing. It needs received voice, so `voice_loopback 1` for one's own. **To get the
  decoder's output without the gain, record with `voice_maxgain 1`** (and `voice_scale 1`): the gain is then 1.0 on
  every block (see question 2 for the one exception, a block at exact full scale).
- **`voice_micdata.wav`:** with the Steam codec this is what `GetVoice` returns as "uncompressed" sound: Steam's
  capture before its encoder. The engine asks for it at the lower of 44100 Hz and Steam's "optimal" rate, but
  writes the header with 44100 Hz. So if the console line `Voice_Init: Using Steam voice optimal sample rate N`
  (printed when the map loads) says 24000, the file's samples are at 24000 Hz under a header that says 44100, and
  it must be re-read at N. Its 1 MiB is then 21.8 s. Whether Steam still fills this buffer is Steam's business (its
  documentation calls the uncompressed output deprecated). **Measured since (the owner's run): it does not.** The
  file's length is the sum of the byte counts Steam reported, but only its first 42,748 samples hold sound and the
  rest is zeros. `voice_micdata.wav` is not usable with the Steam codec.

**The console variables print with `Msg`, so they need no `developer` setting.**

- `voice_showincoming 1`: one line per voice packet received, after decoding:
  `Voice - N incoming samples added to channel C`. N is the number of samples Steam's decoder returned for that
  packet at 44.1 kHz. (The queue receives N - 1 of them: see question 1.)
- `voice_showchannels 1`: one line per active channel **per client tick** (every 15 ms of game time):
  `Voice - chan C, ent E, bufsize: B`. B is the queue's content in **bytes** (two per sample; 88200 bytes are one
  second; the queue holds at most 44100 bytes). This is the direct measurement of the queue. The lines carry no time
  stamp, but each is one tick, so counting lines gives time.
- `voice_showchannels 2`: also `Voice - mixed N samples from channel C` each time the mixer pulls from the queue
  (several times a tick at high frame rates). Use 1 unless the pulls themselves are wanted.
- `voice_profile 1`: one line per tick with the time spent compressing, decompressing, in the gain and in
  "upsample", in microseconds. Not useful for the queue.
- `voice_writevoices 1`: keeps each channel's decoded, gain-processed voice with no length limit and writes one
  file per channel, `<game folder>/voice/plCC_slotN-timeT.wav` (16-bit mono, 44100 Hz), printing `Writing file ...`.
  It is cleared at each key press and written when recording stops, as above. It is the way round the 11.9 s limit.
- `voice_debugfeedbackfrom 1` (a server variable): the **server** prints `Sending voice from: NAME - playerslot: N`
  for every voice packet it relays.
- `voice_debugfeedback`: defined, but no code in `engine.dll` reads it.

**The run that measures the queue directly:** `con_logfile voice_q.log; voice_loopback 1; voice_showincoming 1;
voice_showchannels 1; voice_writevoices 1`, and note the frame rate the game runs at (`net_graph 1` or
`cl_showfps 1`), because the code says the restart latency follows it (question 1). Then speak or play the speech
file as in Set B. Each tick's `bufsize` line, with the `incoming` lines between them, is the queue's whole history.

## Checked against the owner's console log

The owner ran a local game with the Steam codec, `voice_loopback 1`, `voice_showincoming 1`, `voice_showchannels 1`
and `voice_recordtofile 1`, speaking for about 40 s. The log has 1,520 `incoming` lines and 6,249 `bufsize` lines.
Numbers only are quoted here; the log itself stays private.

| What the code says | What the log shows |
| --- | --- |
| One `bufsize` line per channel per 15 ms tick | **Confirmed.** While a channel plays, the queue falls by 1,326 bytes a line on average: 15.04 ms of sound. (Not one line per frame: at this frame rate that would be 3.3 ms.) |
| The queue gets one sample fewer than each packet decodes to | **Confirmed exactly.** A packet of 7056 samples raises the queue by 14,110 bytes (7055 samples), one of 2646 by 5,290, one of 1764 by 3,526. Every add in the log that neither overflows nor meets a pull is `2 x (N - 1)`. |
| The ring holds 44100 bytes whatever the settings; overflow drops the oldest | **Confirmed** as far as a log can: the queue never exceeds 44100, and 103 adds land exactly on it. Which end is dropped the log cannot show; the write function says the old data's head, the samples about to be played. |
| The start wait is `voice_buffer_ms` counted down by one frame's duration per tick: `ceil(0.1 / frame duration)` ticks | **The log gives 30 ticks.** Of 21 channels opened in the log, 14 start to drain after 30 ticks, 5 after 31, 1 after 32 (and one is the grace case below). 30 ticks is what the formula gives for a frame of 3.33 ms: **300 fps, the game's default `fps_max`**. The wait does not depend on what arrived meanwhile: the queue held 31 ms, 182 ms, 340 ms, 371 ms or the full 500 ms when it began to drain. So the wait is 450 ms of real time here, not 100. The owner's frame rate was not noted; if it was not about 300, this reading is wrong. |
| A spurt opens with a burst, so at this frame rate the ring overflows during the wait | **Confirmed.** Of the 17 spurts that opened a channel, 16 begin with a packet of 7056 samples (160 ms, eight frames; the other with 5292), and 16 have filled the ring to 44100 bytes before they start to play. Between 20 and 120 ms was dropped while each of those waited, and roughly up to 90 ms more in the 0.6 s after it started. These are the skips W3-01 found after restarts, and with the one sample per packet they are all the "latency trimming" there is. |
| The channel ends on the first tick after the mixer empties the ring; a packet that comes first is appended | **Both seen.** Channels vanish from the log once their queue is empty (no line is printed for a free channel), and the next packet then finds a fresh, empty queue and waits 30 ticks. Once, a spurt's first packet came on the very tick after the queue had run down to 84 samples: it was appended to the empty queue and drained from the next line on, with no wait. That is the one-tick grace. |
| The engine queues whatever Steam's decoder returns for the records at an end of transmission | **Seen directly, and this settles rule 2:** the decoder returns 2756 or 2757 samples (62.5 ms at 44.1 kHz) 22 times and 1378 samples (31.25 ms) 5 times, 3 to 5 ticks after a spurt's last sound. They go into the queue like speech. |
| The mixer pulls a frame's worth at a time, in blocks of at most 1020 | **Refined by the log:** each line shows a pull of 1024 or 2048 bytes: the mixer takes 512 samples at a time, once or twice a tick. (A few are 513 or 1025 samples, and partial ones end a queue.) Where the 512 comes from was not read. |

**Three things the log shows that the first reading did not have:**

1. **An empty packet opens a channel by itself.** Three times a packet decodes to **0 samples**, each 0.5 to 0.6 s
   after the previous sound, two of them followed within 1 to 5 ticks by a silence record. The third is exactly
   where `voice_decompressed.wav` begins, and that file begins at a key press. So these look like what Steam sends
   when recording is started again (the engine stops and restarts Steam's recording at every `+voicerecord`):
   inferred, the code does not show what Steam sends. By then the old channel had ended, so the empty packet
   **assigns a new channel and starts its 30-tick wait** with nothing, or only the silence record, queued. Speech that arrives during that wait is appended behind the record and starts
   to play when the wait that began at the key press runs out. In the log, speech that arrived 27 ticks after such
   a key press began to play two ticks later, not 30. This is a restart well under L0 (W3-01's 5(c)), and it will
   happen to anyone who presses the key shortly before speaking.
2. **The packets Steam hands out are 60 ms**, three frames (2646 samples, 944 of the 1,520), with 20, 40 and 80 ms
   as the other common sizes: the 17.8 messages a second of the Set D demo.
3. **`voice_decompressed.wav` is whole packets, after the gain.** Its 338,413 samples are exactly the sum of 138
   consecutive packets' decoded sizes in the log (the full N of each, so it is taken before the one sample is
   dropped), from the fourth key press to the moment that recording stopped; the 83 packets that came after are
   not in it. 11% of its samples are at full scale: it is the gain's output. Nothing but the key and the 1 MiB
   limit bounds its length; the owner's 40 s were several key presses, and each press starts the file again.

**The orchestrator's six readings of the log, against the code:** (1) agreed, with the correction that the queue
grows by `2 x (N - 1)` bytes, and that the lines are ticks, not frames. (2) agreed; the old head is what is dropped.
(3) agreed that it is a time and not a fill level; it is 30 ticks of 15 ms, 450 ms, and the code says it is 100 ms
times the frame rate over 66.7. (4) agreed as an observation. (5) the lengths are one key press each, see 3 above;
the microphone file is not filled by Steam. (6) agreed: under the Steam codec the file's samples are never read.
Under `vaudio_celt` (set `sv_voicecodec vaudio_celt` and reload the map) the code does use the file, and a
22050 Hz 16-bit mono file with a plain 44-byte header beside the executable is the right one for both CELT codecs.

**Its four questions.** What sets the start delay: `voice_buffer_ms`, counted down by a frame's duration once per
tick, so 100 ms only at 67 fps. What ends a channel: the mixer's first pull that leaves the ring empty marks it,
and the next tick frees it, so at most 15 ms; `voice_fadeouttime` is not a time-out but the length of the fade over
the last samples in the queue. Is the 0.5 s fixed: yes, 44100 bytes set once at start-up for every codec (so 1 s
for the CELT codecs and 2 s for Speex). What is dropped: the old data's head.

## Summary

| Question | Answer | Confidence |
| --- | --- | --- |
| 1. The queue | A 22050-sample ring per speaker (0.5 s at 44.1 kHz). A new channel waits `voice_buffer_ms` before playing, but the wait is counted down by one **frame's** duration once per **tick**, so it lasts about `voice_buffer_ms` x frame rate x 0.015: 100 ms at 67 fps, about 350 ms at 233 fps. A spurt's first packets bring about 150 ms of sound at once, so above about 235 fps the ring overflows at every restart and the level the takes call L0 is the ring's limit, 0.5 s less that burst: about 350 ms. A channel ends on the tick after its ring runs dry; a packet that comes before that is appended. One sample is dropped from every packet. | Code: high. The owner's log agrees in every count (ring, one sample, a wait of 30 ticks); that the wait follows the frame rate is still a prediction until a take at another `fps_max`. |
| 2. Gain and output | The measured law is confirmed constant by constant, including `voice_scale` entering twice. Corrections: a block of zeros drives the gain to the cap (it is not left untouched), and the gain is reset to 1.0 whenever a channel restarts. Steam's decoder, not the engine, makes the 44.1 kHz. | High |
| 3. The sender | Once per client tick the engine asks Steam for compressed voice (up to 2048 bytes) and sends whatever comes as one message. It adds nothing to the payload and has no end-of-transmission logic of its own for Steam. | High |
| 4. Debug variables | Above. | High |
| 5. CELT | `vaudio_celt`: 22050 Hz, 512-sample frames, 64 bytes, as the app has it, but the game's encoder runs at **complexity 5**, not 10. `vaudio_celt_high`: the codec is set up for 44100 Hz, **1024-sample frames, 128 bytes** (44.1 kbps, as the help says), but the engine runs it on 22050 Hz sound. The app's 256 samples and 120 bytes are another row of the same table, which the engine never selects. | High |
| 6. Speex | The engine would load a module named `vaudio_speex`, ask it for quality **3**, and run it at 11025 Hz. Frame and packet sizes are in the module, which is not shipped. | High for what is stated |

## How it was read

- `bin/x64/engine.dll`, SHA-256 `4802a74ce0abb1175851d00e37fc88609085a96238aa52ac0eb224ae4a08ec80`, PE32+ x86-64,
  image base `0x180000000`, link date 2026-10-05. Addresses below are virtual addresses in that image.
- `bin/x64/vaudio_celt.dll`, SHA-256 `255cf0836a11118195c9129869b7a0e5a15123c99054409b93e379a66e07a66e`, link date
  2026-09-30. It exports the CELT library's functions by name.
- The files were read as data with a disassembler library (capstone) and never executed. Functions were found from
  the debug strings, from each console variable's constructor (which gives the variable's object, whose value every
  reader loads through the pointer at offset 0x38: integer at +0x58, float at +0x54), and from the unwind table.
- Function names below are **labels of mine** unless the binary itself prints them (`Voice_Init`,
  `Voice_AssignChannel`, `CL_ProcessVoiceData`, `_Host_RunFrame_Client`, `CAudioMixerWave::MixDataToDevice_`,
  `S_StartDynamicSound`, `Voice_Spatialize`).
- CELT was compared with the open-source CELT 0.11 tree the project already builds from
  (`mumble-voip/celt-0.11.0`). No other source was consulted, and no leaked source was looked for or used.
- Every statement is marked **read** (the instructions say so) or **inferred** (a conclusion from what was read).

## 1. The receiver's queue

### The data (read)

- **Five channels.** An array at `0x1804eae50`, 5 entries of `0xACC0` bytes (`imul rdi, rax, 0xacc0` at
  `0x1800581f0`; loops end at the array's end). A sixth speaker gets no channel
  (`ProcessVoiceData: Voice_AssignChannel failed for client %d!`, printed only when a check passes that looks like
  the developer setting).
- **A channel holds:** the speaker's entity (-1 when free, offset 0); a ring buffer (offset 4: count, read position,
  write position, size, then the data); the interpolator's fraction (a double, `+0xAC60`); a "starved" flag
  (`+0xAC6A`); the start countdown (a float, `+0xAC6C`); the legacy codec's decoder (`+0xAC70`); the automatic gain's
  state (`+0xAC78`); a proximity flag; the sound's handle.
- **The ring is 44100 bytes**, set once at start-up for every channel (`mov edx, 0xac44`, bytes `BA 44 AC 00 00`,
  five times from `0x180002bb6`). That is 22050 samples: **0.5 s at 44.1 kHz** (1 s for the CELT codecs' 22050 Hz,
  2 s for Speex). It does not depend on `voice_buffer_ms`.
- **Writing past the end overwrites the oldest sound:** the write function (`0x180016fd0`) copies everything, and if
  that was more than the free space it moves the read position to the write position and sets the count to the
  size. So the ring keeps the newest 0.5 s and what was oldest is skipped, without any message.
- **The voice rate with Steam is 44100 Hz, fixed.** `Voice_Init` asks Steam for its optimal rate, prints it, and
  then sets the rate to 44100 whatever the answer was (`mov [rate], 0xac44` at `0x180059bbd`). Every packet is
  decoded by `ISteamUser::DecompressVoice` with a 22528-byte output buffer (`0x5800`) and that rate. So Steam's
  decoder produces the 44.1 kHz samples; the engine does not resample Steam voice.

### A packet arrives (read; the function at `0x1800581a0`, called from the client's handler at `0x1801fba10`)

1. The client's handler reads the payload (at most 4096 bytes). If the packet is from the local player it starts
   the "I am heard" indicator (cleared 0.2 s after the last such packet). A packet with a length of zero stops
   here: the server sends those to a speaker who does not hear himself.
2. It looks for a channel that already belongs to the speaker. If there is none it assigns a free one
   (`Voice_AssignChannel`, `0x180058640`): the ring is emptied; the starved flag is cleared; **the countdown is set
   to `voice_buffer_ms` / 1000, with `voice_buffer_ms` limited to 1 to 5000** (constants 5000.0 and 0.001 at
   `0x180058711` and `0x180058719`); the interpolator's fraction is set to 0.999
   (`0x3FEFF7CED916872B` at `0x18005872F`); **the automatic gain is reset** with block size 128 and the current
   `voice_maxgain`, `voice_avggain` and `voice_scale`; and the ducking of other sounds is switched on.
   **A channel that already belongs to the speaker is used as it is: nothing is reset.**
3. The payload is decoded (Steam, or the legacy codec's decoder), the automatic gain is run over the decoded block
   in place (question 2), and the block is copied into the ring by a linear interpolator.
4. **The interpolator drops one sample per packet.** Its step is 1.0 in normal play (the rate divided by itself; a
   flag at `0x18047E9ED` forces 11025 Hz and is the only thing that changes it). It starts at the stored fraction
   (0.999) and writes one sample for each position below `n - 1` (`lea eax, [rsi-1]` at `0x18005836E`), where n is
   the number of decoded samples. That is n - 1 samples, each 0.001 of one sample and 0.999 of the next: the
   packet's first sample is in effect left out. The fraction comes out at 0.999 again. The channel also stores a
   "last sample" for the next packet, which nothing reads (and it is stored from the wrong place: one byte, read
   past the end of the block, at `0x180058477`).
5. The starved flag is cleared (`0x18005824B`).

**There is no handling of an end of transmission here.** The engine does not look inside Steam's payload, and the
sequence number the handler passes in is not used. Whatever Steam's decoder returns for an end marker and a silence
record is queued like any other samples.

### Every client tick (read; `0x180059380`, called from `_Host_RunFrame_Client` at `0x1801a730e`)

For each channel in use:

- if its starved flag is set, **the channel is ended**: its sound is stopped, the speaker's "talking" state is
  cleared and the channel is free;
- otherwise the countdown is lowered by the function's argument, and **on the call where it passes from above zero
  to zero or below, the channel's sound is started** (`S_StartSound` with the voice source at volume 1.0, pitch 100,
  on the listener's own entity for ordinary voice).

Two facts about this call decide the restart latency:

- **It runs once per tick, not once per frame.** `_Host_RunFrame_Client` is called inside the tick loop of
  `_Host_RunFrame` (the loop from `0x1801a6310` to `0x1801a642d`, counting to the number of ticks due this frame; the
  call is at `0x1801a63f0`). The tick is 15 ms (`0x3C75C28F` = 0.015, the start-up value at `0x1801a32ae`; a server
  sets its own). At more than 66.7 frames a second most frames have no tick; at fewer, a frame has several.
- **Its argument is the duration of the current frame, not of a tick** (`movss xmm0, [0x1807571AC]` at
  `0x1801a7306`). That variable is written in one function only (`0x1801a1920`), once per frame before the tick
  loop: the real time since the last frame (or `host_framerate` and `host_timescale` when those are allowed),
  limited to between 0.001 and 0.1 s, then passed through the client's clock correction (which stretches or
  shrinks it by up to a fifth while the client's clock is more than 10 ms from the server's, and otherwise leaves
  it alone).

So the countdown loses one frame's duration every 15 ms. At exactly 66.7 fps that is real time. At a higher frame
rate it runs slow in proportion:

```
ticks needed  N = ceil( (voice_buffer_ms / 1000) / frame duration )
start delay     = about (N - 1) x 15 ms after the packet        (the packet's own tick counts as the first)
                = about voice_buffer_ms x fps x 0.015 / 1000 seconds
```

| Frame rate | Start delay with `voice_buffer_ms 100` |
| ---: | ---: |
| 30 fps | 1 to 2 frames (each tick takes off 33 ms) |
| 60 to 67 fps | about 90 ms |
| 100 fps | about 135 ms |
| 144 fps | about 210 ms |
| 200 fps | about 285 ms |
| 233 fps | about 345 ms |
| 250 fps | about 360 ms |
| 300 fps | about 435 ms |

A dip in frame rate during the countdown shortens it, and one frame of 0.1 s or more ends it at once.

**The start delay meets the ring's limit.** The ring holds 0.5 s, and a spurt does not arrive in real time: its
first packets carry Steam's pre-roll all at once. Measured from the Set D demo with the repository's own extractor
(`tests/demovoice/extract.mjs`): in 17 of the 20 spurts the first group of packets holds 8 or more 20 ms frames
(160 ms; SourceTV groups 60 ms of arrivals), and a spurt's sound is longer than the time its packets took to
arrive by 140 to 200 ms in 17 of the 20 (80 to 100 ms in the other three; the demo resolves 60 ms). Call that the
burst, about 150 ms. While the channel waits, the ring fills with the burst
plus real time. If the start delay plus the burst is more than 0.5 s, the oldest samples (the pre-roll first, then
the onset) are overwritten, and the ring starts playing full.

**Inferred, medium confidence: this is the measured restart level L0.** In W3-01's terms (how long after a spurt's
first packet its queue would run dry, less the spurt's own length and its silence record):

```
L0 = min( start delay, 0.5 s - burst )
```

W3-01 fits L0 at 350 ms (330 to 375) on the owner's first PC and under 280 ms on the second, and found that it is
not `voice_buffer_ms` as it stands. 0.5 s less a burst of 125 to 170 ms is 330 to 375 ms: so the first PC is at the
ring's limit, which needs a start delay above about 350 ms, a game running above about 235 fps (TF2's default cap
is 300). The second PC's level under 280 ms needs a start delay under 280 ms, below about 190 fps, with no
overflow. The owner's frame rates in those sessions are not recorded, so this is a prediction, with a cheap test:
the same take with `fps_max 67` and with the usual cap (checks, below). The owner's console log, made after this
was written, shows a wait of 30 ticks and a ring that is full at nearly every restart: the first PC at 300 fps.

### The mixer pulls (read; `0x1800590b0`, called through the voice sound source at `0x18005b790`)

The voice channel is an ordinary sound: a 16-bit mono source at the voice rate, mixed by the engine's wave mixer in
blocks of at most 1020 output samples (`0x3FC` at `0x18004f23c`). Each time the mixer wants `n` samples:

- it reads up to `n` samples from the ring (never more than 1024 in one call, which is enough for the mixer's
  blocks at pitch 1.0);
- **fade:** if fewer than F samples remain in the ring after the read, the samples just read are scaled so that a
  sample with `r` samples queued behind it gets the gain `r / (F - 1)`. F is `voice_fadeouttime` times the rate,
  recomputed every tick: **4410 samples, 100 ms**. So the last 100 ms of whatever is queued fades linearly to zero,
  and voice played while less than 100 ms is queued is quieter in proportion to the queue;
- **underrun:** if the ring had fewer than `n` samples, the rest of the request is filled with a copy of the last
  samples read (as many as were read, once), then with zeros;
- if the ring is now empty, the starved flag is set (`0x180059332`);
- the samples go on to the mouth animation and the mixer.

Starting the sound has no delay of its own for voice: `S_StartDynamicSound` only delays a sound whose start
parameters ask for it, and the voice's are zero. From the tick the sound starts, the mixer takes samples at the
pace of the output device, a frame's worth at a time. What lies between the ring and the ear after that (the mix
runs `snd_mixahead`, 0.1 s, ahead of the device, plus the device's own buffer) delays every spurt alike and does
not enter the queue's rule.

### The rule

```
constants
  RATE        = 44100                      # Steam voice; fixed in Voice_Init
  RING        = 22050 samples              # 0.5 s; overflow drops the oldest
  PAD         = clamp(voice_buffer_ms, 1, 5000) / 1000     # 0.1
  TICK        = 0.015 s
  FADE        = max(2, int(RATE * voice_fadeouttime))      # 4410
  frame_dt    = the frame's duration, limited to 0.001 .. 0.1 s

on a voice packet from speaker E (processed in a client tick, before the tick's channel pass):
    ch = channel of E
    if none:                               # restart
        ch = a free channel; ring.clear(); ch.countdown = PAD; ch.playing = false
        gain.reset()                       # gain 1.0, see question 2
    pcm = decode(payload)                  # Steam: n samples at 44.1 kHz, silence records included
    gain.process(pcm)
    ring.write(pcm[1:])                    # one sample fewer than decoded; overflow drops the oldest
    ch.starved = false

every client tick, after the tick's packets:
    for ch in channels in use:
        if ch.starved: free(ch)            # the next packet from E restarts
        elif not ch.playing:
            ch.countdown -= frame_dt       # a frame's duration, once per tick
            if ch.countdown <= 0: ch.playing = true

when the mixer wants n samples from a playing channel:
    got = ring.read(min(n, 1024))
    if ring.count < FADE: scale the tail of got, gain = (samples behind it) / (FADE - 1)
    if got < n: repeat the last min(got, n - got) samples once, then zeros
    if ring.count == 0: ch.starved = true
```

In the terms of W3-01's fitted rule (`l` the voice queued when a spurt's first packet arrives, `g` the arrival gap
in the stream's own time):

- **Restart level:** `l` = the start delay above, about `voice_buffer_ms x fps x 0.015`, but no more than the
  ring's 0.5 s less the burst a spurt opens with (about 150 ms). Call it L0.
- **Append:** a spurt is appended if its first packet is processed before the tick on which the channel is found
  starved. With the silence record queued behind the previous spurt that is `g < l + 62.5 ms`, plus a grace of at
  most one tick (15 ms) after the ring has run dry. An appended spurt keeps the channel: no countdown, no gain
  reset, and it plays straight after what is queued.
- **Ceiling:** the ring's 0.5 s of queued sound: in `l`, 0.5 s less the burst, about 350 ms on any PC. The newest
  0.5 s is kept; the excess is dropped from the play position at the moment a packet overflows, so it is heard as
  a skip at once.

**What it predicts for a spurt arriving 140, 300 and 440 ms after the previous one ended**, the previous one having
restarted, on a PC where L0 is 350 ms (235 fps or more):

| `g` | Outcome | Start | `l` afterwards |
| ---: | --- | --- | ---: |
| 140 ms | appended (140 < 412.5) | 62.5 ms after the previous spurt's last sample: 77.5 ms early | about 272 ms |
| 300 ms | appended (300 < 412.5) | 237.5 ms early | about 112 ms |
| 440 ms | restart: the ring ran dry about 27 ms before, and the channel ended on the next tick | at the restart level again, with the gain reset to 1.0 | L0 |

On a PC at 67 fps (L0 about 90 to 100 ms) the 140 ms spurt is appended only just (140 < about 155 to 165) and the
other two restart. These are the same outcomes as W3-01's rules 1 to 3; what the code adds is where L0 comes from,
the one-tick grace, the 0.5 s ceiling, the gain reset, and the fade.

### W3-01's findings and questions, one by one

1. **Restart after L0 (about 350 ms on PC A, lower on PC B).** *Corrected in what L0 is:* it is `voice_buffer_ms`
   counted down by frame durations once per tick, so it is 100 ms only at 67 fps and grows with the frame rate,
   until the ring's limit stops it at about 350 ms (0.5 s less the burst). The rest of the delay to the ear
   (mix-ahead, device) is the same for every spurt. Confirmed in kind: a wait after the first packet of a spurt
   that finds no channel.
2. **A silence record of 62.5 ms after each end of transmission.** *Not shown by the engine, and not contradicted:*
   the engine has no end-of-transmission code for Steam voice and inserts nothing itself. The 62.5 ms can only be
   samples that Steam's decoder returns for the record (1500 samples at 24 kHz are 2756 at 44.1 kHz), which the
   engine queues like speech. Steam's decoder is not among the supplied files.
3. **Append if `l + 62.5 - g > 0`, else restart.** *Confirmed,* with one addition: the channel survives until the
   first tick after its ring is empty, so a packet up to 15 ms late is still appended, after a few milliseconds of
   repeated and zeroed samples.
4. **A ceiling at about L0, the excess skipped within seconds.** *Confirmed, and explained:* the ceiling is the
   ring's 22050 samples (0.5 s of queued sound). On the first PC it equals L0 because L0 there is that same limit.
   The excess is dropped from the play position when a packet overflows the ring, not over seconds. (The 14 ms of
   silence W3-01 saw between two spurts that followed each other at the restart level fits this: the second
   spurt's burst overflowed the ring and about 48 ms of the first spurt's tail was skipped; the 62.5 ms record
   itself was played.) At a lower frame rate the ceiling stays where it is while L0 falls, so chains of gaps
   shorter than 62.5 ms could raise `l` above L0, up to about 350 ms.
5. (a) **A restarted spurt plays 25 to 50 ms late at first and skips that much in steps of 11 to 25 ms within half a
   second; appended spurts do not.** *Explained, medium confidence, by the same overflow:* a restart at a high
   frame rate fills the ring to its limit. What overflows while the channel still waits comes off the spurt's
   pre-roll, where there is nothing to hear. Once it plays, Steam's packets do not come evenly (the demo's 60 ms
   groups hold 1 to 7 frames), and each time arrivals run further ahead of playback than before, the packet that
   does not fit drops the oldest samples, which are the next to be played. Each skip is that packet's overflow, a
   frame or so, any number of samples: the code has **no 256-sample step** anywhere in the voice path. After a few
   hundred milliseconds the ring has room for the largest bunch and the skips stop. An appended spurt joins a ring
   that has drained by `g - 62.5` and does not overflow. This predicts no skips after a restart on a PC whose start
   delay is under about 350 ms, and more skipped the higher the frame rate.
   (b) **Small upward steps of 7 to 19 ms after pauses inside a spurt.** *Consistent with the underrun rule:* when
   the ring runs dry for a moment and the next packet comes before the next tick, the mixer has already been given
   repeated and zeroed samples for what was missing (up to a tick's worth, 15 ms, and a frame's), and playback goes
   on later by that much. Not proved: it needs the queue to run dry inside a spurt, which a `bufsize` log shows.
   (c) **One restart 156 ms under L0.** *Explained, two ways.* The owner's log shows one: pressing the talk key
   makes Steam send an empty end marker, which opens a channel and starts the wait before any speech has come, so
   speech that follows within the wait starts early by the time already waited. The other: the countdown is in frame durations, so a few long frames
   during it (a hitch, or the game losing focus) end it early.
   (d) **Two changes of almost exactly 100.0 ms.** *Not shown.* The only exact 100 ms in the receiver are the fade
   length (4410 samples), which changes level and not timing, and the countdown, which is 100 ms of real time only
   at 67 fps.
   (e) **What L0 is made of.** Finding 1 above.
   (f) **Silences on speech about 50 ms longer than the gate model predicts; is a spurt accepted as an append after
   its queue empties?** *Only for one tick (15 ms),* as in 3. The receiver does not give 50 ms. Two things in the
   code do make a quiet ending behave differently from a loud one, both worth a look in the takes: the last 100 ms
   of the queue is faded, and sound played from a queue under 100 ms is attenuated. Neither moves a spurt.
6. **Is the 0.04% by which playback outruns the source in the receiver's resampling?** *Yes, confirmed:* it is the
   one sample dropped from every packet (step 4 above). The Set D demo has 1816 voice messages for 5109 frames of
   20 ms, 17.8 packets a second, and 17.8 / 44100 is 403 ppm. The accuracy suite's "clock" column reads 404 ppm for
   most takes. It is not a recorder's clock, and it should follow the packet rate: a take at 505 ppm had 22.3
   packets a second.

### `voice_fadeouttime`, `voice_overdrive`, `voice_overdrivefadetime` (read)

- `voice_fadeouttime` (0.1): the length of the fade at the end of the queue, above. At least 2 samples.
- `voice_overdrive` (2) and `voice_overdrivefadetime` (0.4): the ducking of **other** sounds while anybody's voice
  channel is assigned. A timer runs up to `voice_overdrivefadetime` while a channel is in use and back down when
  none is; the mixer multiplies every sound that is not a voice source by
  `1 / (1 + (voice_overdrive - 1) x (1 - cos(pi x t / fadetime)) / 2)`, as an integer out of 256 (`0x180463450`,
  applied at `0x180042032`). At the default the game's other sounds fall to half (-6 dB) over 0.4 s and come back
  over 0.4 s. The voice itself is exempt. For the recordings: the game's ambience under a voice is 6 dB lower than
  between spurts.

## 2. The receiver's gain and output

The automatic gain is one function (`0x18005a2d0`) with a small state per channel (`+0xAC78`): block size, cap,
blend, position in the block, running sum, running peak, scale, current gain, next gain, and two integers for the
ramp. Read:

```
for each sample x, at position i of its 128-sample block:
    sum  += |x| ;  peak = max(peak, |x|)
    g     = fixed + i * step                       # integers, 128 = unity
    x     = clamp( (g * x) >> 7, -32768, 32767 )   # arithmetic shift
at the end of each block:
    current = next * scale
    fixed   = int(current * 128)                   # truncated
    mean    = sum / 128                            # integer division
    next    = min( 32767 / (mean + (peak - mean) * avggain), maxgain ) * scale      # 32-bit floats
    step    = int( (next - current) / 127 * 128 )  # truncated toward zero
    sum = peak = 0
```

| Measured (REFERENCE_2026) | The code |
| --- | --- |
| 128-sample blocks at 44.1 kHz (finding 3) | **Confirmed.** Block size `0x80` passed at `0x180058773`; the rate is 44100 for Steam. Blocks run on across packets. For the legacy codecs the same gain runs at the codec's rate (22050 or 11025 Hz), as the profiles assume. |
| `T = min(maxgain, 32767 / (mean + avggain x (peak - mean)))` (finding 3) | **Confirmed**, constant 32767.0 (`0x46FFFE00`). The mean is an integer division of the sum by 128. |
| `voice_scale` enters twice: a block starts at s² x T and climbs toward s x T (finding 4) | **Confirmed exactly.** `next` already holds one factor of scale, and `current = next x scale` applies it again. |
| The ramp moves in whole 1/128 steps per sample, truncated toward zero (finding 4) | **Confirmed, with one constant to correct in the app:** the step is the gain difference divided by **127** (block size - 1; `lea eax, [rbp-1]` at `0x18005a424`), so the last sample of a block would reach the target but for truncation. The app's `receiverAutoGain` divides by 128, which gives a step one unit smaller whenever the difference in 1/128 units is between a multiple of 127 and the same multiple of 128. The start value is truncated too. |
| The block mean | **A detail:** the code divides the sum by 128 as integers (truncating) before the blend; the app keeps the fraction. At most one part in the mean. |
| The remainder below one step lands at the block edge (finding 4) | **Confirmed:** each block starts again from `int(current x 128)`. |
| The clamp is int16 (finding 1) | **Confirmed:** -32768 to 32767 after the shift. The shift is arithmetic, so negative products round down. |
| "All-zero blocks, when no voice data arrives, leave the gain untouched" (finding 4) | **Corrected in part.** When no data arrives nothing runs, so the state is untouched: true. But a block of zero samples that **is** decoded (a silence record, the digital silence inside a spurt) has mean and peak 0, the division gives infinity, and the cap applies: `next = maxgain x scale`. So every spurt ends, after its 62.5 ms silence record, with the gain at its cap. |
| (not in the model) | **New: the gain is reset when a channel is assigned** (current = next = 1.0, step 0, block position 0). The first 128 samples of a restarted spurt are at gain 1.0 exactly (128/128, whatever `voice_scale` is; the app starts at `scale`), the second block ramps from `scale` to `scale x T(block 0)`, and so on. An **appended** spurt is not reset: it starts from the gain the previous spurt's silence record left, which is the cap. In practice both begin inside Steam's 120 ms of pre-roll, so by the loud onset the gain has followed the pre-roll in either case; the difference is in the first 6 ms of the pre-roll. |
| The voice rate is 44.1 kHz; the receiver adds no EQ (finding 14) | **Confirmed** for the voice path: decoder output at 44100 Hz, gain, ring, then the ordinary 16-bit mono mixer. The resampling from 24 kHz is inside Steam's `DecompressVoice`, which is not in these files. |
| Output stage `[0.1, 0.8, 0.1]` | **Not found in the voice path.** Nothing between the decoder and the mixer filters the voice. The mixer's own output stages were not read. |
| `volume` | Not read (it is in the mixer, not the voice code). |

**A check on the zero-block rule from Set D.** If quiet blocks drive the gain to its cap, a loud onset after any
quiet stretch must begin at the cap. In recording A the three kinds of onset were compared with the same instants
in Steam's decoded packets, in 1.3 ms steps: a burst after a 500 ms pause inside a spurt, an appended spurt and a
restarted one. In each the recording is about 10 times the decoded level from the first step in which the decoded
sound rises (ratios of 8 to 12 before the clip), and reaches the clip within 3 to 5 ms because the decoded attack
itself takes that long. So the gain is at its cap at every loud onset, as the code says, and the slow-looking
onsets of finding 4 are the codec's attack times 10, not a gain that starts low.

With `voice_maxgain 1` and `voice_scale 1` the gain is exactly 1.0 unless a block's blended level is above 32767
(mean and peak both 32768, which needs a block of -32768 throughout), so `voice_decompressed.wav` is then the
decoder's output.

## 3. The sender's side in the engine

Read, from `_Host_RunFrame_Client` (`0x1801a71a0`) and the function it calls (`0x180058d80`):

- **How often:** once per client tick (15 ms), after the tick's incoming packets and the channel pass, while the
  engine is in its recording state.
- **What:** with the Steam codec it calls `GetAvailableVoice`, and if that reports data, `GetVoice` with a
  2048-byte buffer for the compressed sound. Whatever comes back, if not empty, is sent as **one** `clc_VoiceData`
  message whose length is the byte count times 8. The engine writes nothing of its own around the payload. It is
  sent only when the client is fully connected, as an ordinary (unreliable) message with the next outgoing packet.
- **Batches:** the engine does not form them. It polls 66.7 times a second, yet the Set D demo has 17.8 messages a
  second: Steam hands the voice out in pieces of about 56 ms, and most polls get nothing. A spurt opens with a
  burst: the pre-roll comes at once (8 or more frames in the first 60 ms of 17 of the demo's 20 spurts).
- **A limit on the receiving side (inferred):** the decoder's output buffer is 22528 bytes, 255 ms at 44.1 kHz. If
  one message ever held more sound than that, `DecompressVoice` would report an error and the engine would queue
  nothing for it. The demo's bursts stay under it.
- **Start:** `+voicerecord` (only when fully connected) stops any recording in progress, prepares the files of
  `voice_recordtofile`, and calls `StartVoiceRecording`.
- **End:** `-voicerecord` sends one more packet, calls `StopVoiceRecording`, and sets a "stopping" flag, but the
  engine **keeps polling** every tick and sending what Steam returns. Only when `GetAvailableVoice` answers "not
  recording" does it close its recording state (and write the files). So the tail after the key is released, the
  end-of-transmission marker and the silence record all come from Steam; the engine relays them.
- **The legacy codecs:** the engine's recorder gives up to 8192 samples a tick to the codec's `Compress`, which
  keeps the remainder of a frame for the next call; on release the last call is flagged final and the codec pads
  the last frame with zeros.
- **The server** (`0x18013d770`): for each voice message it builds one `svc_VoiceData` per listener. A listener who
  cannot hear the speaker is skipped, except the speaker himself, who gets the message with a length of zero when
  `voice_loopback` is off (the "I am heard" acknowledgement). Nothing is merged or re-timed here.

- **Neither side sends voice on its own (read):** the client's message and the server's are written into the
  channel's ordinary unreliable stream (the channel's separate voice stream is not used: the flag for it is zero
  at both call sites, `0x1801a73c6` and `0x18006587d`). They leave with the channel's next regular packet: the
  client's next command packet and the listener's next update. So a voice message can wait up to one packet
  interval on each leg. What those intervals are (the `cl_cmdrate` and `cl_updaterate` logic) was not read.

## 4. The debug variables

See "For the recording session" at the top. In addition:

- `voice_inputfromfile`, `voice_recordtofile` and `sv_allow_voice_from_file` are read in one place only, the
  `+voicerecord` handler (`0x1801a9280`): changing them while the key is held does nothing until the next press.
- `voice_loopback` is not read by the client's voice code at all: the server reads it from the client's settings
  (`0x180132f70`) to decide whether the speaker hears himself.
- `voice_enable 0` shuts the whole voice system down on the next tick.
- `voice_forcemicrecord` only acts on the legacy path.

## 5. The CELT profiles

Read from `vaudio_celt.dll` and `Voice_Init` (`0x1800599f0`):

- `vaudio_celt` and `vaudio_celt_high` are **one module and one codec class**. For `vaudio_celt_high` the engine
  loads `vaudio_celt` and passes **quality 4**; for `vaudio_celt`, **quality 3** (`0x180059c4a` to `0x180059c58`;
  with 4 it prints `Using CELT High Quality™ mode` in developer mode).
- The module holds a table of five settings (`0x18003E008`, three integers each), indexed by the quality:

  | Quality | Rate | Frame | Packet | Bit rate at that rate | Selected by |
  | ---: | ---: | ---: | ---: | ---: | --- |
  | 0 | 44100 | 256 | 120 bytes | 165.4 kbps | nothing in the engine |
  | 1 | 22050 | 120 | 60 bytes | 88.2 kbps | nothing |
  | 2 | 22050 | 256 | 60 bytes | 41.3 kbps | nothing |
  | 3 | 22050 | 512 | 64 bytes | 22.05 kbps | `vaudio_celt` |
  | 4 | 44100 | 1024 | 128 bytes | 44.1 kbps | `vaudio_celt_high` |

- **`vaudio_celt`: confirmed** as the app's `celt_22` has it: `celt_mode_create(22050, 512)`, mono, 64-byte packets.
- **`vaudio_celt_high`: the app's `celt_44` is wrong.** Its 256-sample frames and 120-byte packets are row 0, which
  the engine never asks for. The game uses row 4: `celt_mode_create(44100, 1024)`, 128-byte packets, which is the
  "44kHz, 44kbps" of the help text.
- **But the engine runs `vaudio_celt_high` on 22050 Hz sound.** The voice rate comes from the codec's name in two
  places that agree (`0x180059060` on the client, `0x18013d9c9` on the server): 11025 for `vaudio_speex`, 0 for
  `steam` (which then becomes 44100), and **22050 for anything else, `vaudio_celt_high` included**. The capture
  device, the playback source and the automatic gain all use that rate. (The voice-init message could not carry
  44100 in any case: its rate field is read as a signed 16-bit number, at `0x1801e18d2`.) So in the game as shipped,
  `vaudio_celt_high` is 22.05 kHz sound coded by a CELT mode that believes it is 44.1 kHz: frames of 1024 samples
  last **46.4 ms**, 128 bytes per frame is **22.05 kbps** in real time, and the bandwidth is at most 11 kHz. It is
  not higher quality than `vaudio_celt` in bit rate; it has twice the frame length and the 44.1 kHz mode's band
  layout squeezed into half the spectrum. (Inferred from the three readings above, high confidence; a take would
  show it at once as an 11 kHz band edge and 46 ms frame losses.)
- **Encoder settings:** the codec class creates the mode, a mono encoder and a mono decoder, and its only control
  calls are request 8, which is `CELT_RESET_STATE`, on each (`0x180001f75` and after; again on the codec's reset).
  It never sets complexity, prediction, bit rate or VBR. The library's defaults therefore apply, and the module's
  `celt_encoder_init_custom` writes the same defaults as CELT 0.11: **complexity 5** (`mov dword [rbx+0x20], 5`,
  bytes `C7 43 20 05 00 00 00`, at `0x180008585`), constant bit rate (VBR 0), inter-frame prediction on, bit rate
  field 255000 (irrelevant: the packet size is fixed by the byte count passed to `celt_encode`). The app's profile
  and `tests/LEGACY_CODECS.md` say complexity 10, which is what two third-party server plug-ins set, not what the
  game's own module does.
- **Is it CELT 0.11?** The exported function set (`celt_encoder_create_custom` and the other `_custom` names), the
  encoder's structure offsets, its defaults, its control-request numbers and the 5 ms band table (`0x18002D450`)
  all match the open-source 0.11 tree. Not checked: bit-exactness of the coding itself.
- **Framing (read):** `Compress` takes whole frames, keeps the remainder for the next call, and pads a final
  partial frame with zeros. `Decompress` decodes as many whole packets as the message holds. A missing packet can
  be concealed (the decoder is called with no data), but nothing in the engine's Steam-era receive path asks for
  that.

## 6. Speex

Read from `Voice_Init` and the two rate functions:

- The codec name `vaudio_speex` is accepted. The engine would load a module of that name, ask its factory for an
  interface of the same name, and call its `Init` with **quality 3** (the same number it passes for `vaudio_celt`;
  what a Speex module does with 3 is in the module).
- The voice rate is **11025 Hz** (`0x2B11` at `0x18013d9dc` and `0x180059079`): capture, gain and playback all run
  there, as the app's `speex` profile assumes.
- No `vaudio_speex` module is in `bin/x64`, so loading fails with
  `Unable to load voice codec 'vaudio_speex'. Voice disabled. (module 0, iface 0, codec 0)`, which is the public
  bug report's message. Frame size, packet size and the Speex mode behind "quality 3" cannot be read from these
  files.
- A legacy voice-init message without a rate (from an old server or demo) is given 22050 Hz if its codec is
  `vaudio_celt` and 11025 Hz otherwise.

## Disagreements with the measured findings and the app

1. **Finding 21 and W3-01, L0:** not a constant of the machine but `voice_buffer_ms` scaled by the frame rate,
   limited by the 0.5 s ring (question 1). The measurements are not contradicted; the explanation is new and
   untested.
2. **Finding 10, "trims latency in 256-sample skips":** the voice path has no 256-sample operation. It has two
   things that shorten the delay: one sample per packet (a steady 0.4 ms per second), and the ring's overflow (any
   size, after a restart or an over-full append). W3-01 already found that the steps are not a steady drain.
3. **Finding 15 and the accuracy suite's "clock" (about 400 ppm, "the recorder's clock against the game's"):** it is
   the receiver dropping one sample per packet, and it scales with the packet rate.
4. **Finding 4 and the app's `receiverAutoGain`:** decoded zeros drive the gain to its cap (the app holds the gain
   through any zero block); the gain is reset to 1.0 at each restart and not at an append (the app carries it
   across every gap); the ramp's divisor is 127, not 128; the mean is an integer. None of these is likely to be
   audible: exact zeros come from the decoder almost only as the silence record, and a spurt opens with 120 ms of
   pre-roll in which the gain settles whichever way it started. They matter for a sample-exact comparison with
   `voice_decompressed.wav`.
5. **`celt_44`:** frame 1024 and 128 bytes, at an effective 22.05 kHz, not 256 and 120 at 44.1 kHz.
6. **`celt_22` and `celt_44`, complexity:** 5, not 10.
7. **The fade:** not in the model at all. The last 100 ms of every queue fades out, and sound played from a queue
   shallower than 100 ms is attenuated. On the takes this should show as the end of each spurt's tail fading
   linearly over its last 100 ms (mostly inside the silence record and the comfort noise, so hard to see).

## Checks the owner could run

0. **The frame rate of the run already made.** If the owner can say what the game ran at for the console log
   (`fps_max`, or the counter), 300 confirms the reading at once.
1. **L0 against the frame rate (the main one).** Set D's setup or plain loopback, the network test signal
   (`tf2_voice_nettest_v1.wav`, whose bursts alternate early and restart), `voice_showchannels 1` and
   `voice_showincoming 1` logged with `con_logfile`, once with `fps_max 67` and once with `fps_max 300` (noting the
   frame rate actually reached). Predicted: at 67 fps the `bufsize` lines start falling about 6 ticks after the
   first `incoming` line of a restarted spurt (against 30 in the log already made), `bufsize` never reaches 44100,
   no burst starts early and no restarted burst loses sound; with `fps_max 100` it is 9 or 10 lines; at the higher rate the wait is about `1.5 ms x fps` and, above about 235 fps,
   `bufsize` sits at 44100 at each restart. If L0 does not move with the frame rate, this reading is wrong.
2. **`voice_buffer_ms 200` at a fixed frame rate** (W3-01's take 2): predicted to double the wait, up to the ring's
   0.5 s, beyond which the start of every restarted spurt is cut off.
3. **The drift:** in any logged take, the queue receives one sample fewer than each `incoming` line says. Over a
   long spurt `bufsize` at a fixed point of the packet cycle falls by 2 bytes per packet.
4. **The decoder alone:** `voice_recordtofile 1` with `voice_maxgain 1`, one key press under 11 s, gives Steam's
   decoded output at 44.1 kHz with no recorder in the chain. With default gain it gives the gain's output, to
   compare with the model sample by sample: the first 128 samples after a restart at gain 1.0, an appended spurt
   starting at the cap, the ramp's divisor of 127.
5. **`vaudio_celt_high`:** `sv_voicecodec vaudio_celt_high`, reload the map, and record the test signal. Predicted:
   nothing above 11 kHz, and with `net_fakeloss` gaps in units of 46 ms.

## What was not read

- **Steam's side** (`steamclient`, not among the files): the gate, the pre-roll, the batches `GetVoice` returns, the
  end marker, the silence record, the decoder and its resampler to 44.1 kHz. `steam_api64.dll` is only the door to
  it.
- **The network channel's packet timing:** how often each side sends its regular packets, with which the voice
  rides.
- **What sets the flag that forces the voice rate to 11025 Hz** (`0x18047E9ED`; it belongs to a larger structure
  and is not written by address anywhere).
- **The mixer beyond the voice source:** `volume`, any output filtering, the device layer and its latency, and
  whether the mix rate can be other than 44100 Hz. (If the mixer ever asked the voice source for more than 1024
  samples at once, the source would hand back repeated samples: a units slip in the read limit, harmless at pitch
  1.0.)
- **Only skimmed:** the second way `_Host_RunFrame` runs client frames (when a flag at `0x1807531A8` is set). It
  also calls `_Host_RunFrame_Client` once per tick, in a loop from `0x1801a6790`; one further call, for a frame
  with no tick, is behind two checks on what looks like the demo player.
- **The microphone test** ("tweak mode"), which uses the same queue for channel 0 with its own rules.
- **Speex's frame and packet sizes**, as said.
