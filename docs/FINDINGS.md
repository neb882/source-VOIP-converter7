# What we found: how Source's voice path works

This document is about the game and Steam, not about the app. It follows a voice from the talker's microphone to the listener's sound device and says, for each stage, what happens to the sound. [ACCURACY.md](ACCURACY.md) says how close the app comes to each stage. [tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md) is the record: it holds the evidence, the dates and the corrections, and each entry here points to its findings there by number.

## How to read it

Every statement carries one of four words.

- **Read**: taken from the game's or Steam's own files as the owner has them installed. Nothing of those files is in this repository, only what was learnt from them.
- **Measured**: seen in the owner's recordings, console logs or demos. The recordings are private, and only numbers from them are given.
- **Inferred**: a conclusion from what was read or measured, with what it rests on.
- **Guessed**: a stand-in with nothing under it.

A figure marked "computed" is plain arithmetic on a rule that was read.

[REPRODUCE.md](REPRODUCE.md) says how to check some of these findings on your own PC with the game and one script, and which checks are not built yet.

A rule that was read holds for the files it was read from. A Steam or game update can change it, so each entry gives the date of the reading. After an update, one short take through the existing comparison checks the path again; [owner-runs.md](owner-runs.md) says how. The table below gives the build date of each file where the report of the reading gives one.

| What was read | The file, in words | Built | Read on |
| --- | --- | --- | --- |
| the receiver's queue and gain, sending, the mixer, the output, rooms | the game's 64-bit engine, from the owner's TF2 install | 2026-10-05 | 2026-11-10 and 2026-11-11 |
| the CELT codecs | the game's `vaudio_celt` module, and the public CELT 0.11 source | 2026-09-30 | 2026-11-10 |
| Steam's sender and decoder | the owner's Steam client library; Valve's public copy of it gave the same constants | 2026-10-13; the public copy 2026-10-21 | 2026-11-10 |
| where Steam's clock counts from | the timer library of Valve's public client package; the owner's own copy was not read | 2026-10-21 | 2026-11-10 |
| Speex | a `vaudio_speex` module of another Source game, supplied by the owner; TF2's 32-bit game ships one that differs from it in 50 bytes of code | 2026-05-20 | 2026-11-10 |
| which codec names the 32-bit game accepts | TF2's 32-bit engine (the game reported build 11191711) | not given | 2026-11-11 |
| rooms | the game's preset file, its sound mixer file and its 40 soundscape scripts | not given | 2026-11-10 |
| `vaudio_miles` (never in TF2) | the engines of Source SDK Base 2006 and 2007 with their wrappers and plug-in, and the module TF2 ships | engines 2009-12-04 and 2010-02-01; wrappers 2006-05-22 and 2008-07-11; TF2's module 2024-01-17 | 2026-11-11 |

The recordings fall in two periods. Sets A to F were recorded from 2026-09-24 to 2026-09-27. Sets G to O were made on 2026-11-10 and 2026-11-11, most of them with the game's and Steam's own debug output; Set K is recordings of the game's output.

## The voice path

### 1. Steam's sender

Steam, not the game, decides which stretches of the microphone are sent: a stretch goes out only when it is loud enough, and the 100 ms before it go with it.

- **Chunks.** Steam opens the microphone at 24000 Hz, mono, 16 bits (read). Each time its voice code runs it takes what the capture gained since the last time (read). On the owner's PC that is whole steps of 750 samples, so a chunk is 31.25, 62.5 or 93.75 ms long (measured: 23.4%, 74.8% and 1.8% of the chunks in one demo). Steam reads every 48 to 64 ms (measured: 723 intervals, mean 55.4 ms).
- **The level rule.** A chunk is sent when the mean of its absolute samples is at least 1.0% of full scale, or when one sample reaches 15% of full scale (read). A sine passes the mean rule from −39.1 dBFS RMS (computed). Nothing filters the sound or changes its level before this test (read).
- **The 100 ms before.** The last 2400 samples of the quiet chunks in front of the opening chunk are sent with it, or 2400 zeros if there were none (read).
- **Messages.** One chunk is one message, cut into 20 ms frames of 480 samples, with the remainder kept for the next (read). A phrase mostly opens with one message of 8 frames, 160 ms (measured: 17 of 23 openings in one log, 17 of 20 in the demo).
- **The end of a phrase.** After the last chunk Steam sends an end marker and starts a fresh encoder. The next quiet chunk goes out as its length only, a record of silence that is 62.5 ms long in most cases (read; measured: 39 of 47).

**Standing.** Read from Steam's client on 2026-11-10. Measured the same day with a file as the microphone (Set J): all 789 verdicts Steam printed follow the rule, the highest mean that failed is 0.9998% and the lowest that passed 1.0315%, and the rule's messages equal the game's log line for line on 645 lines. A run with a real microphone follows the rule on all 590 chunks (2026-11-11).

**Not settled.** Where the 750-sample step comes from was not read; that it is one 32nd of a one-second capture buffer is inferred. The step and the read times are one PC's. Steam's reads favour one part of the game's 15 ms tick (measured: 63% fall in a window of 4.5 ms), and why was not read. The threshold in Steam's settings is not this gate (inferred: nothing in the client sets the two numbers).

**Check it yourself.** In Steam's own console, `@voice_spew_activity_check 1` prints one line for every chunk: whether it passed, its length, its mean and its peak. `mic_inputfile` plays a 24 kHz mono file in place of the microphone, so the input is known.

**Record.** Findings 5, 12, 25, 27 and 28.

### 2. The hold and Steam's clock

After the last loud chunk Steam goes on sending for about 0.4 s, and how long exactly depends on how long the talker's Steam has been running.

- **The rule.** The hold is 0.4 s (read). It is timed on a clock of seconds since Steam started, kept as a 32-bit float (read). Each loud chunk notes the clock. The phrase's last chunk is the one read when the clock has passed the noted time plus 0.4, added and compared as floats (read).
- **What that does.** A float of seconds moves in steps that grow with its size. The hold comes out as whole steps (computed):

  | Steam has run | The float's step | Where the hold runs out, counted from the read of the last loud chunk |
  | --- | --- | --- |
  | under 18 hours | 4 ms or less | 398 to 402 ms |
  | 18 to 36 hours | 1/128 s | 398 to 406 ms |
  | 1.5 to 3.0 days | 1/64 s | 406 to 422 ms |
  | 3.0 to 6.1 days | 1/32 s | 406 to 437 ms |
  | 6.1 to 12.1 days | 1/16 s | 375 to 437 ms |
  | 12.1 to 24.3 days | 1/8 s | 375 to 500 ms |
  | 24.3 to 48.5 days | 1/4 s | 500 to 750 ms |

  The last chunk is the one read after that point, so the sound goes on for up to 64 ms more.

**Standing.** The arithmetic was read from Steam's client on 2026-11-10. That the clock counts from Steam's start was read in Valve's public copy of the timer library; that the owner's own copy is the same is inferred. Measured on 2026-11-10 and 2026-11-11 (Sets J and L):

- On a Steam that had run 23.9 days, every one of 12 phrase ends fell at the read four steps of 1/8 s after the last loud chunk: 389 to 514 ms in real time.
- On a Steam started 4.8 minutes before, the hold had a sharp edge between 399.4 and 403.1 ms.
- Steam's own log gives the start of each run. A model of the sender given each run's real uptime gives every phrase end of both runs (18 of 18 and 12 of 12), and fails on both when given the other's.

The rows of the table other than those two were not measured.

**Check it yourself.** This is the plainest thing here to check on another PC. Compare a Steam started today with one that has run for more than 24 days.

1. In the game set `voice_loopback 1`, make one short loud sound in a room with a steady quiet background, and record the game's output.
2. Measure the time from the loud sound to the point where the voice goes silent. The last part of that tail is the codec's comfort noise, which is quieter than the background itself.
3. Do this a few times and take the average: one sound can fall anywhere between two of Steam's reads.
4. Restart Steam and do it all again.

By the table the voice goes silent about 0.4 to 0.5 s after the loud sound on the Steam started today, and 0.1 to 0.35 s later than that on the old one (computed; no Steam older than 24.3 days was measured, and the check was not made in this form). The single values of the two runs can overlap; the averages should not. With Steam's console the same shows in counts, and that is the sounder form of the check. With `@voice_spew_activity_check 1` on, the phrase ended on the 7th or 8th chunk after the last loud one on the young Steam (measured: 5 and 32 of 37, never the 9th), and on the 7th, 8th or 9th on the Steam of 23.9 days (measured: 4, 5 and 3 of 12).

**Record.** Findings 12, 16 (its paragraph on Set L), 27 and 28.

### 3. The codec

Steam codes what is sent with Opus at 24 kHz, and in held pauses and under steady tones the encoder stops sending sound, so the listener hears comfort noise in its place.

- **Settings.** libopus at 24000 Hz, mono, its VOIP mode, 32000 bit/s, the voice hint and DTX on, and nothing else set (read). So the complexity is the library's default, 9, and the bit rate varies within a limit (read from the library's defaults).
- **The release.** libopus 1.1.x (measured). The public Linux build of Steam's client names 1.1.4 (read); that the Windows build holds the same is inferred. Releases 1.1.4 and 1.1.5 were not told apart.
- **The packets** (measured in a SourceTV demo of 5,109 frames). Every frame is 20 ms of Opus in hybrid mode with a band to 12 kHz. Coded frames are 34 to 189 bytes, 29.9 kbit/s on average. There is no in-band error correction.
- **DTX.** 693 of the 5,109 frames are one byte long, and the decoder answers them with comfort noise (measured). A steady −36 dBFS sine falls into DTX after 0.42 s and a −30 dBFS sine after 1.16 s; sines from −24 dBFS up never do (measured). During the hold of entry 2 the encoder sends DTX for about the last 240 ms (measured).
- **Two things heard in the game that are the codec's.** A chord held after a sung phrase turns into a deep whoosh, because the comfort noise takes the chord's spectrum (measured, Set E). Comfort noise for a steady tone below about 60 Hz is nearly a constant offset, and the game plays it as it is (measured, Set F).

**Standing.** The settings were read from Steam's client on 2026-11-10. The release was measured in September 2026 by coding the test signal with releases from 1.1 to 1.6.1: the 1.1.x releases agree with Steam on 627 of its 693 DTX frames, the later ones on 84 to 97. Checked against Steam itself on 2026-11-10 (Set J): a known clip, coded on Steam's own chunk boundaries with libopus 1.1.5 at these settings, decoded and resampled as entry 5 says, gives the game's recording in 524,286 of 524,288 samples.

**Not settled.** Complexity 8, 9 and 10 give the same samples, so the 9 rests on the reading. No demo was made with Set J, so that the bytes are Steam's is inferred from the decoded sound.

**Check it yourself.** Record a SourceTV demo while someone talks. `node tests/demovoice/extract.mjs <demo>` lists every frame with its size, the DTX frames and the end markers ([tests/demovoice/](../tests/demovoice/README.md)).

**Record.** Findings 2, 11, 13, 16, 17 and 18.

### 4. The network

A lost packet takes a whole voice message with it, and nothing in the game makes a single frame late. A voice message holds 1 to 4 frames of 20 ms as a rule and usually 8 where a phrase opens (measured; other openings held 3 to 9, the rule gives an opening 9 or 10 at most, and the first packet of each clip of Set J held 12), and the game refuses a message of more than 12 frames (read).

- **One message, one packet.** Once a tick, every 15 ms, the engine asks Steam for voice and sends what comes as one message with its next packet (read). The server passes each message to each listener and merges or re-times nothing (read). A message is never split over two packets (read). That one packet carries one message on a listen server is inferred; how many it carries at a real server's rates was not read.
- **Loss.** A packet is lost whole, and one that arrives out of order is thrown away (read). The game has no rule that loses packets in bursts (read).
- **`net_fakeloss`.** With `net_fakeloss N` a packet is dropped when a draw from 0 to 100 is at most N, each packet by a draw of its own (read). On a listen server with sockets for loopback a voice message meets four such draws, so `net_fakeloss` 5, 10 and 15 remove 21.7%, 37.0% and 49.8% of voice messages (computed).
- **Jitter.** `net_fakelag` and `net_fakejitter` hold each packet in a queue and let them out in order, so they delay and bunch packets and cannot lose or reorder them (read). The receiver has no deadline: a late message is added to the speaker's queue (read).

**Standing.** Read from the game's engine on 2026-11-10 and 2026-11-11. Measured on the noise parts of three takes of September 2026 (Set C): at `net_fakeloss 5` the take has 3.12 runs of lost sound a second and the rule 3.20; at 15 the take has 3.90 and the rule 4.31. With jitter alone no sound is missing: 96.0% of it is present against 96.5% with no jitter.

**Not settled.** A take with loss, lag and jitter together has more silence than the rule gives (10.3% against 4.0%), and the cause is not known. Real internet loss was not recorded. An earlier reading of these takes, that single frames are lost in bursts averaging 2.2 frames and that jitter makes single frames late, is withdrawn in the record.

**Check it yourself.** This gives the set-up only, not a procedure that shows the effect. Set C was made on a listen server with `sv_cheats 1` and `net_usesocketsforloopback 1`, and there a voice message meets four draws of `net_fakeloss`. Without it the reading gives two, one for each crossing; that reading is of medium confidence and nothing here rests on it. The record's own check counts the runs of lost sound in a recording of steady noise.

**Record.** Findings 8, 9 and 25.

### 5. Steam's decoder

On the listener's PC Steam decodes each message to 16-bit sound, fills at most ten missing frames, and converts the message from 24000 to 44100 Hz.

- **Frames.** An end marker starts a fresh decoder. A frame whose number is ahead of the expected one has the gap in front of it filled by the codec's concealment, at most 10 frames of it. A number that goes back starts a fresh decoder with nothing filled. A record of silence becomes that many zeros (all read).
- **Limits.** One record decodes to at most 17 frames. The game takes a message only if its converted sound fits 22,528 bytes, which is 12 frames; a longer one is not heard at all (read).
- **The resampler.** Each message goes by itself through FFmpeg's libswresample at its default settings, in 32-bit float (read; the library is public and was run). One resampler serves a speaker for the whole session and outlives key presses and reconnects (measured). Once for each speaker in a session, on that speaker's opening message, it mirrors the last 16 input samples to finish the message, so everything after is 0.67 ms late (run on the public library; seen in Set J).
- **Its sound.** Flat to 10 kHz, then −0.7 dB at 11 kHz, −2.4 dB at 11.5 kHz and −6.0 dB at 12 kHz, with a mirror of the band just under 12 kHz left just above it (computed from the public source).

**Standing.** Read from Steam's client on 2026-11-10. Measured the same day (Set J): given the decoded samples, a port of the resampler equals the game's recording in every one of 524,288 samples once one decoded sample is set one step up; with nothing changed, 2 samples differ. The limit of 12 frames shows in the loss takes of entry 4: after 7 long runs of lost sound the game is early by 13 to 17 frames.

**What is one PC's.** On x86 the library picks the order of its sums by the processor's features. The owner's PC runs its `fma3` variant (measured); the three others differ from the recording in 59 to 108 samples. Another PC was not measured.

**Not settled.** Whether the 16-bit decoder softens peaks past full scale: nothing in Set J decodes past it. Valve ships FFmpeg 8.1.2 and the public library that was run is 6.1.1; the public source of this path is the same in both.

**Check it yourself.** `voice_recordtofile 1` with `voice_maxgain 1` and `voice_scale 1` writes the decoder's output at 44100 Hz. `voice_showincoming 1` prints each packet's sample count: 882 for one frame, 2646 for three, 7056 for eight.

**Record.** Finding 29.

### 6. The receiver's gain

The receiving game turns quiet voice up as far as ten times and cuts off whatever then passes 16 bits, which gives TF2 voice most of its character.

- **The law.** The game works on the decoded voice in blocks of 128 samples, counted from the decoder's opening sample and running on across packets. Each block sets a target for the next: `min(voice_maxgain, 32767 / (mean + voice_avggain × (peak − mean)))`, with the block's mean and peak of the absolute samples. The defaults are `voice_maxgain 10` and `voice_avggain 0.5` (read; measured).
- **The ramp.** The gain moves to the target in whole steps of 1/128, the step being the difference divided by 127 and cut toward zero. `voice_scale` enters twice: a block starts at the square of `voice_scale` times the last target and climbs toward `voice_scale` times the next (read; measured).
- **Details.** The block mean is a whole-number division. A decoded block of zeros has no level, so it sends the gain to its cap, and every phrase therefore ends with the gain at the cap. The gain goes back to 1.0 when a channel is assigned to a speaker. Every sample is clipped to 16 bits (all read).
- **What it does to the sound.** A steady sine comes out 1.22 times over full scale with 42% of its samples flattened, at any level from −18 to −1 dBFS (measured; the law gives 41.7%). `voice_scale 0.5` lowers a sine by 8 to 11 dB, not 6, and adds a sawtooth at 344.5 Hz (measured).

**Standing.** Measured in September 2026 (Set B), then read from the game's engine on 2026-11-10 and checked the same day against the game's own recordings of its decoded voice (Set H): the rule, applied to the recording made at `voice_maxgain 1`, gives the one made at 10 in every one of 291,840 samples.

**Not settled.** That check ran under `vaudio_celt`. The same routine serves Steam voice (read), where no check to the sample exists. The divisor 127 rests on the reading alone: 128 gives the same samples on that signal.

**Check it yourself.** Play a steady sine between −18 and −1 dBFS into the microphone with `voice_loopback 1`: its tops come out flat, and its level does not change when the input is turned down by 10 dB within that range. At −24 dBFS the gain has reached its cap, and from −30 dBFS down the codec's DTX sets in.

**Record.** Findings 3, 4 and 26.

### 7. The voice channel

The game queues each speaker's voice before it plays it, so a phrase that follows a short pause can start early and close up the pause.

- **The queue.** Each speaker has a ring of 22050 samples, 0.5 s at 44100 Hz (read). A packet that does not fit overwrites the oldest sound, which is heard as a skip (read).
- **The wait.** A packet for a speaker with no channel opens one, and the channel waits before it plays. The wait is `voice_buffer_ms`, 100, but the engine counts it down by one frame's duration on each 15 ms tick, so it lasts `ceil(0.1 × frames a second)` ticks (read). Sound starts about 90 ms after the packet at 67 frames a second, 135 ms at 100 and 435 ms at 300 (measured).
- **The opening cut short at 300 frames a second.** At TF2's default cap of 300 frames a second the wait is long and a phrase opens with 160 ms at once, so the ring overflows at nearly every restart: it was full when it started to play in 24 of 28 channels (measured, Set G). The rule, replayed over one run's log, drops 55 to 136 ms of what was queued at each of 16 restarts, Steam's pre-roll first and then the onset. So the phrase's opening comes out shortened by that much. At 67 and 100 frames a second nothing was dropped (measured).
- **Early starts.** A channel ends on the tick after its ring has run empty. A packet that arrives before that is added to what is queued and plays straight after it. So a phrase after a short pause starts early by the pause less the 62.5 ms record of silence (read; measured).
- **How often.** Over 146 changes from one phrase to the next in 13 takes, 25 phrases start 80 to 350 ms early. After a pause of at most 0.45 s, 21 of 51 do (measured). Which ones cannot be told from the sound alone: where a pause sits at the threshold, 30 ms in when the packets arrive decide, and a recording does not show that (inferred).
- **One sample a packet.** The engine writes one sample fewer into the ring than each packet holds (read). At about 17.8 packets a second, playback gains about 0.04% on the talker (measured: 404 to 406 parts in a million on most takes).
- **The end of the queue.** The last 0.1 s of what is queued is faded to zero (read; not seen in a recording).

**Standing.** Read from the game's engine on 2026-11-10. Measured the same day in the game's own console logs (Set G): the rule, replayed over 2,375 packets with the mixer's demand taken from the log, gives the logged queue on every one of 9,808 ticks. So the replay does not test when the mixer pulls. The early starts were measured in the takes of September 2026.

**Not settled.** A listener under 67 frames a second, and the queue under the older codecs, were not logged. The fade and what an empty queue plays were read and not recorded.

**Check it yourself.** With `voice_loopback 1`, `voice_showincoming 1` and `voice_showchannels 1` the console prints one line for every packet and one line every tick with the bytes queued. Set `fps_max` to 67, 100 and 300 and count the lines before the queue starts to fall: 7, 10 and 30. [tests/voicequeue/](../tests/voicequeue/README.md) turns such a log into numbers.

**Record.** Findings 10, 19 and 21 to 25.

### 8. The mixer and the output

The voice enters the game's 44100 Hz mix a little under its full level, the mix is clipped and multiplied by `volume`, and the listener's PC then converts it to the rate of its sound device.

- **Into the mix.** Steam voice is copied in sample for sample at 255/256 of its level, with no filter (read). Measured to four digits in Set B: clipped tops sit at 4895 to 4896 where the ceiling is 4915.
- **The older codecs** run at 22050 or 11025 Hz. The mixer doubles their rate once or twice, each added sample the mean of its two neighbours rounded down (read).
- **The sum.** All sound is added, clipped at ±32767, multiplied by `volume` and rounded to 16 bits, in that order (read). So the loudest sample is `round(32767 × volume)`: 4915 at `volume 0.15` (measured).
- **Other sound.** While a voice plays, every other sound falls to half over 0.4 s (read).
- **To the sound device.** The game hands its 44100 Hz sound to Windows, which brings it to the device's rate by linear interpolation. This is measured, not read: flat tops stay exactly on the ceiling, and a 1 kHz tone has images at 2900 and 4900 Hz about 65 dB under it, where linear interpolation gives 66.2 and 65.4 dB. It lowers the top of the band: −0.95 dB at 8 kHz and −5.1 dB at 18 kHz (arithmetic on linear interpolation, which itself is measured and not read).

**Standing.** Read from the game's engine on 2026-11-10. Measured in five recordings of September 2026, all on 48000 Hz devices.

**Not settled.** A 44100 Hz device would need no conversion (inferred; no recording). With two speakers in place of headphones the voice enters at 182.6/256 (read; that a voice belongs to that group of the game's sound mixer rests on a name; no recording). A recording of 2026-11-11 that could be placed to the sample against the conversion is within one step of the rule in 73% of its samples, and in 98.2% once the read position is let drift as a single-precision position would (measured); the drift is inferred, not read.

**Check it yourself.** Record a loud voice with `voice_loopback 1`: its flat tops sit at 32639 times your `volume`, which is 255/256 of full scale, and samples reach 32767 times `volume` only where the game's own sound adds to the voice. On a 48000 Hz device a 1 kHz tone shows images at 2.9 and 4.9 kHz.

**Record.** Findings 1 and 30.

### 9. Rooms

Where the map sets a room, part of the voice passes that room's reverb and is added back, so a voice carries the echo of the place the listener stands in.

- **Who sets it.** The map's soundscape sets `dsp_room`. Of the 153 soundscapes in the game's 40 scripts, 101 ask for room 1, the automatic room, which the engine builds from the size and shape it measures around the listener (read).
- **The voice's share.** Of 256 parts, a numbered room takes 26 and leaves 229 direct. The automatic room takes 5 to 72 by its shape: 5 in a courtyard, 41 in a larger room, 72 in a tunnel (read). No voice is exempt, one's own under `voice_loopback` included (read; measured).
- **How it runs.** In mono at 44100 Hz, in 32-bit whole numbers, added to the direct voice before the clip and `volume` (read). The reverb goes on after the voice ends. A change of room cross-fades over 200 ms. Some rooms move their echoes at random, so two runs of the game differ there (read).
- **What turns it off.** The game's Sound quality option at its lowest (`dsp_slow_cpu 1`), `dsp_volume 0`, or a map that sets no room (read).
- **Under water** the whole sound passes the game's water preset: dull, at about 0.77 of its level, with no tremolo (read; measured in one recording).

**Standing.** Read from the game's engine and scripts on 2026-11-10, three times, the second and third written before the text of the earlier one was opened. Measured in the takes of September 2026: one set carries an automatic room whose main echo, at 57.96 ms, has a strength of 0.2335 where the rule gives 0.232; another carries a street whose echoes at 68, 120 and 308 ms are where the rule puts them. Measured on 2026-11-11 (Set K): with all of the voice through room 6, every echo of the rule out to 102 ms is in the recording at its delay.

**Not settled.** No room is checked sample for sample: every recording has the map's own sound under it. One set of September 2026 has no room, on a map that gives one today, and why is not explained. One listener's recording has an echo at 140 ms that nothing read explains.

**Check it yourself.** `dsp_slow_cpu 1` takes the room away at once and 0 gives it back. `adsp_debug 2` with `developer 1` prints each automatic room the engine builds, with its shape.

**Record.** Finding 32.

### 10. The older engine codecs

Before Steam voice the engine coded voice itself, at lower rates, and TF2 still has three of those codecs. Steam voice is the default of `sv_voicecodec` today (read).

- **`vaudio_celt`.** CELT 0.11 with its pitch filter, at 22050 Hz, in frames of 512 samples (23.2 ms) and 64 bytes, at the library's default complexity of 5 (read).
- **`vaudio_celt_high`.** The same library in its 44100 Hz mode, with frames of 1024 samples and 128 bytes, fed 22050 Hz sound (read). So a frame lasts 46.4 ms, the rate is the same 22.05 kbit/s, and the band ends at about 10 kHz (measured on the mode itself: a 9 kHz tone comes back at +0.35 dB and a 10.5 kHz tone at −66 dB).
- **`vaudio_speex`.** Speex 1.0.2 or 1.0.1 (the two cannot be told apart in the module), narrowband, 20 bytes a frame, with its enhancement on (read). The module does not resample: a codec made for 8000 Hz is fed 11025 Hz sound, so a frame lasts 14.51 ms, the rate is 11.025 kbit/s and the band ends at 5.5 kHz (read). Decoded samples wrap past full scale, which crackles on loud peaks (read; measured). The module has no way to fill a lost frame (read).
- **Which game runs Speex.** TF2's 64-bit game, asked for `vaudio_speex`, runs `vaudio_celt`. Its 32-bit game, started with `-force32bit`, runs Speex, and so does HL2DM's (measured on 2026-11-11).
- **The gain** of entry 6 runs on the decoder's samples from its opening sample, as under Steam voice (measured).

**Standing.** Read on 2026-11-10 from the game's `vaudio_celt` module and from a `vaudio_speex` module of another Source game. Measured against the game's own recordings of its decoded voice, with a file as the microphone:

| Codec | Set, date | The app's build of the public source, set up as read, gives the game's recording in |
| --- | --- | --- |
| `vaudio_celt` | H, 2026-11-10 | 292,351 of 292,352 samples; the other is one step off |
| `vaudio_celt_high` | H, 2026-11-10 | 292,789 of 292,864 samples; the others are one step off |
| `vaudio_speex`, after the gain | M (HL2DM) and O (TF2), 2026-11-11 | Set O: 145,966 of 145,966 samples at `voice_maxgain 1` and at 10. Set M: 145,840 of 145,840 at 1 and 145,966 of 145,966 at 10 |

For Speex the build also computes as the module's compiler did: the module's arithmetic differs from strict C of the same source in 25 places, and a strict build codes the same sound differently (measured: 92,967 of 145,920 samples).

**Not settled.** Those recordings are the decoded voice after the gain, not the game's output: no recording of what a listener hears under these codecs exists. What a listener hears after a lost Speex frame was not read and not measured. No recording of `vaudio_celt_high` at `voice_maxgain 10` exists.

**Check it yourself.** Set `sv_voicecodec` before the map loads. `voice_showincoming 1` then prints packets of 512 samples for `vaudio_celt`, 1024 for `vaudio_celt_high` and multiples of 160 for `vaudio_speex`. `voice_inputfromfile 1` takes a file as the microphone: it must be named `voice_input.wav`, 16-bit mono at the codec's rate with a plain 44-byte header, and lie in the game's working directory (read), which is the folder of the game's executable (measured for TF2 in Set H; the record's entry "The file-input runs, measured again"). The game skips the file's first two samples (read; seen in Set H). `voice_recordtofile 1` writes the decoded voice.

**Record.** Finding 31, and [tests/LEGACY_CODECS.md](../tests/LEGACY_CODECS.md) for what public sources say.

### 11. vaudio_miles and Voxware VR12 (never in TF2)

`vaudio_miles` is not a Team Fortress 2 codec. It could be selected in the Source engines of 2006 and 2007; current TF2 ships its files and refuses the name. Its codec was checked against one sitting of the 2006 engine on 2026-11-13 (below). It is here because it belongs to the engine family, as a second track of the project beside TF2's own path.

- **What it is.** The module wraps a plug-in of the Miles Sound System that holds Voxware's VR12, a codec made for 8000 Hz speech (read).
- **The frame.** 360 samples are coded as 12 bytes (read; measured by running the module).
- **The 8-bit cut.** Each sample is cut to its top 8 bits before the codec (read). A sound quieter than about −50 dBFS keeps only its signs, so quiet background comes out far above its own level (measured by running the module on signals of our own).
- **The wrong rate.** The engines of 2006 and 2007 run voice at 11025 Hz for every codec and resample nothing (read). So the codec codes 11025 Hz sound as if it were 8000 Hz: a frame lasts 32.65 ms and not 45, the wire carries 2940 bit/s and not 2133, and the codec's 4 kHz band covers about 5.5 kHz of real sound (computed). Pitch and speed come out right, since playback runs at the same rate.
- **Around the codec.** Those engines run the gain of entry 6 on the decoded samples (read; their routine, run on signals of our own, gives the same samples as today's rule on 73,418,240 of 73,418,240). They never call the decoder without data, so nothing fills a lost packet (read).
- **In TF2.** The 32-bit game ships the module and the Miles files and answers "invalid voice codec" (measured on 2026-11-11). Its engine passes four codec names only (read).

**Standing.** Read on 2026-11-11 from the owner's files of Source SDK Base 2006 and 2007 and from the module TF2 ships, and measured by running the modules on signals of our own. A public implementation of VR12 gives the plug-in's packets on 2,505 of 2,505 frames, and 581,899 of 582,120 decoded samples are equal, the others one step off.

**Against a running engine (measured 2026-11-13; the owner's sitting in Source SDK Base 2006, private).** With a 13 s clip of ours as `voice_input.wav` and `voice_recordtofile 1`, the game's captured input is the clip from its third sample on in every sample. A packet held one frame of 360 samples in 2,741 of 2,746 messages and two frames in the other five. The public implementation, reset once before the press, gives 143,796 of the game's 145,800 decoded samples exactly and 144,952 within one step. The frames further off (at most 32 steps) are the first two of the take and the first frames of the five sounds that follow a silence of 0.5 s or more; no sound after a pause of 0.44 s or less is off by more than one step. The second press of the sitting, at `voice_maxgain 10`, comes out in 143,913 of 145,800 samples after the gain rule of entry 6, when the receiver's codec is reset twice before it and the sender's once (measured; why twice was not read). A third sitting was the owner's voice into the microphone, at both gains. There no sample can be compared: the decoder's waveform depends on everything it decoded before in the session (measured: with one to ten silent frames decoded first, the implementation's own output changes at every count), and that session held presses whose sound was not kept. In what a listener hears the two agree: level within 0.01 dB, the level of each frame correlating 0.996 and 0.999 with an rms difference of 0.75 and 0.49 dB, the long-term spectrum within 0.2 dB in every band, and at `voice_maxgain 10` the same count of samples at full scale, 8,516 (measured).

**Not settled.** Why the first frames after a long silence differ: the public implementation, or the opening block the module does not set. What a listener heard at a lost packet, and those engines' mixer and output. The app's `miles` profile was not run against the sitting.

**Record.** Finding 31, and [tests/LEGACY_CODECS.md](../tests/LEGACY_CODECS.md#vaudio_miles).

## What rests on one PC

Every recording here was made on the owner's PC, with one exception: Set D, where a second account on a second PC recorded the same voice as a remote listener.

What a single PC limits is what belongs to a PC and not to the code:

- **The capture.** The 750-sample step, the times of Steam's reads, and the roll-off of the band above 11 kHz, which is done by Windows or by the audio cable and not by Steam.
- **The resampler's variant**, which the processor's features pick (entry 5).
- **The sound device's rate.** Every recording was made at 48000 Hz.
- **The frame rate.** The queue's wait follows it (entry 7), and the owner's is 300.
- **Steam's uptime**, which sets the hold (entry 2).
- **The room.** It depends on the map, on where the listener stands and on the Sound quality option.

What it does not limit is what was read. A rule read from a file is the same on every PC that runs that file, until an update changes the file. The gate's rule, the hold's arithmetic, the codec's settings, the decoder's limits, the gain, the queue, the mixer and the room's arithmetic are of this kind.

The two-PC set shows that a remote listener hears the same chain. The second PC's recording against the owner's is flat within ±0.2 dB from 100 Hz to 11 kHz (measured). Its phrases start early less often, which fits a lower frame rate on that PC (inferred; its frame rate was not noted). Its `volume` and `voice_scale` are inferred from the recording and were not read off its console.

## What others had published

On 2026-11-12 the public web was searched, with about a dozen queries, for earlier work on Steam's and Source's voice path. A search of that size proves no absence: work that the queries did not reach may exist.

What the search found, and what this project owes to public work:

- **Zhenyang Li, ["Reversing Steam Voice Codec"](https://zhenyangli.me/posts/reversing-steam-voice-codec/) (2021-03-30).** The layout of Steam's voice packet, read from the 32-bit Steam client: the SteamID in front, payloads marked by a type number (0, 1 to 6 with 6 as Opus with concealment, and 11 as the sample rate) and a CRC32 at the end.
- **[`steam-audio-codec`](https://docs.rs/steam-audio-codec)**, a Rust crate from the demos.tf project: a decoder for those packets, built on that layout.
- **CS2VoiceData**, a Go example that reads the voice of Counter-Strike 2 demos.
- **[A gist by ericek111](https://gist.github.com/ericek111/abe5829f6e52e4b25b3b97a0efd0b22b)** that decodes CS:GO's CELT voice by calling the game's own library: 22050 Hz, frames of 512 samples, packets of 64 bytes.
- **In this repository's own code:** the demo reader's message layouts follow tf-demo-parser, and the VR12 codec of entry 11, which was never in TF2, is a public implementation by another author, vendored unchanged ([vendor/voxware-vr12](../vendor/voxware-vr12/README.md)).

The search found nothing on the sender's gate, its hold or its clock, on the receiver's gain, queue or mixer, on rooms on a voice, or on Steam's uptime.

No fact about the game's voice path was taken from these projects into the model without being found again in the owner's own files or recordings. The layouts of a demo file's messages follow tf-demo-parser as published. Nothing here rests on leaked source code, and nothing that does is linked.
