# Progress log

What `docs/PROGRESS.json` no longer carries, dated: each stand's history, the decisions no longer in force, the
list of merges and the queue as it stood. Appended to, never edited: an entry that a later one corrects stays as it
was written. The progress file says where things stand now; this log says how they got there.

The first entries were moved on 2026-11-12 from `docs/PROGRESS.json` as it stood at main `9e0abd0`, each verbatim
under the first date its text carries (an entry with no date of its own is under 2026-11-12); with them, the two
`in_flight` entries of main at `34c36b8` that main has since changed, as they stood then. Four paths into the
owner's private repository were taken out on the way, in the waiting list, the Miles stand and the rooms stand (the
hard rules), and in the rooms stand a report's path follows its rename to W3-15b (2026-11-12); nothing else was
changed. Each entry is named by its old place in the file (`stands.<key>`,
`decisions[n]`, `done[n]`, `next[n]`). A document or a comment that cites `docs/PROGRESS.json` for a stand, a decision
or a merge that the file no longer holds means the entry of that name here.

## 2026-11-09

### stands.ci (as it stood on 2026-11-12; now `ci`, its first sentence updated)

The tests workflow runs on every push and can be started by hand. Until 2026-11-09 one browser check (the live recording's lag) failed by chance about once in thirty runs; W1-04 removed the cause, so a red run is a real failure. A branch made before W1-04 still has the old check until it merges main. On 2026-11-11 from 13:56 UTC every run stopped before any test: Ubuntu's package mirrors could not be reached from the runners while Playwright fetched extra fonts. Since 5a8ca56 the workflow installs the browser from Playwright's servers first and gives the system packages three minutes; if the mirrors do not answer the suite runs on the runner image's own libraries and says so in a warning. A missing library would fail the browser suite at launch, not pass it.

### stands.baseline

2026-11-09, main at 61fcb92: tests/accuracy.mjs on the 16 takes of Sets B to F gives every figure of the 'Every take' table in tests/REFERENCE_2026.md to the last digit shown, so the review fixes, the demo reader and Speex moved nothing in the measured model. The Set D demo answered W1-02's open question: Steam's sequence numbers restart at 0 after each end marker (REFERENCE finding 11). Set A and tests/retiming.mjs reproduce the document too. Read block by block (2026-11-09, a scratch copy that kept each half-second block): on the owner's speech 231 of 246 blocks are within 0.5 dB and 239 agree to 0.18 dB rms; the 7 others are the quiet half-seconds where a talk spurt ends (take -48 to -52 dBFS, the game's ambience in the recording against the model's silence) or where the receiver moved a spurt. On the test signal 170 of 177 agree to 0.20 dB rms and the 7 others are the known cases of findings 13 and 14. So the accuracy table's 0.96 and 1.45 dB are those few blocks, not a general error. What is left on the modern preset for speech is when phrases start: the game started 9 of this take's spurts 100 to 340 ms early or late, which the render models only as an option (voice_retime, findings 19 and 21).

### stands.console

The game's 'find voice' output (2026-11-09, kept in the private repository) gives the receiver's defaults: voice_buffer_ms 100, voice_fadeouttime 0.1, voice_overdrive 2, voice_overdrivefadetime 0.4, voice_steal 2, voice_avggain 0.5, voice_maxgain 10, voice_scale 1. Its help for sv_voicecodec calls vaudio_celt '22kHz, 22kbps' and vaudio_celt_high '44kHz, 44kbps', which the celt_44 profile (256-sample frames, 120-byte packets) does not match: W3-03 checks it. The debug variables exist in this build: voice_recordtofile (writes voice_micdata.wav and voice_decompressed.wav), voice_inputfromfile (reads voice_input.wav; sv_allow_voice_from_file defaults to 1), voice_writevoices, voice_showincoming, voice_showchannels, voice_profile.

### decisions[2]

- date: 2026-11-09
- what: Work is split by model (docs/PIPELINE.md, 'Which model does what'): builders and reviewers on the builders' model, where a written check says whether the work is right; plans, the skeptic, the reading of evidence and the last read of each diff on the stronger model the orchestrating session runs on. The orchestrator works at high effort.
- why: The owner asked that the stronger model be used to the full. Its vendor's published comparison puts the two models a few points apart on agentic coding and far apart on long unattended work, scientific computing and research, at twice the price per token. W1-03's plan was written on the builders' model and reviewed on the stronger one; from now on it is the other way round.

### decisions[3]

- date: 2026-11-09
- what: The owner expects to switch the orchestrating session back to the builders' model for cost. The pipeline is written so the split survives the switch: the stronger model's roles become agents started on it.
- why: The owner said so. Before the switch, the session uses the stronger model on what only it should settle: reading the baseline against the takes and writing the model questions as orders.

## 2026-11-10

### stands.phrase_timing

W3-01 (2026-11-10, from the takes alone): the receiver's queue model beats the flat 41% rule on held-out takes (speech and the Set C baseline: -9.7 against -20.0 log-likelihood over 21 transitions; the flat rule cannot chain early starts and the speech take has two chains), with L0 350 ms, a 62.5 ms silence record and a ceiling at L0. Its limits: from the source alone it reproduces 41% of speech transitions (flat rule 31%), never the whole pattern, and on 6 of 8 takes moving spurts places them worse than leaving them, because the game's pauses on speech come out about 50 ms longer than the gate model predicts. New, and in neither model: a restarted spurt plays 25 to 50 ms late and the receiver skips that much audio within half a second, on 13 of 14 restarts seen. Three constants are fitted, not understood; W3-03 reads the engine for the rule.

### stands.debug_run

2026-11-10, the owner's first run of the game's debug variables (kept in the private repository as Set G; a first reading by the orchestrator, to be checked against the engine by W3-03). With voice_showincoming and voice_showchannels the console prints every packet added to the voice channel and the channel's queued bytes on every frame. Read from it: packets are 60 ms (three frames) and a spurt's first is 160 ms; the queue never exceeds 0.5 s (22050 samples at 44.1 kHz) and 103 of 1,520 packets landed on that limit, so what did not fit was dropped (about 25 ms each); after a spurt's first packet on an empty channel the queue does not drain for 25 to 30 frames whatever arrived meanwhile (about 340 to 410 ms: the restart latency is a time, not a fill level); the mixer takes 512-sample blocks. voice_inputfromfile does nothing under the Steam codec (the owner heard only the microphone), and voice_recordtofile wrote only 5 to 8 s: no sample-exact tap of the Steam path that way. Third run (frame-rate test, 2026-11-10): the owner's fps_max is 300, and with fps_max 67, 100 and 300 the wait before a channel plays was 7, 11 and 31 ticks, against the 6 to 7, 9 to 10 and 30 the engine's rule predicts; the queue at the start was 220, 288 and 500 ms, and packets overflowed the ring only at 300 (14 of them). So the frame-rate dependence is confirmed by experiment. SourceTV did not run on the local server (no demo), so the decoder cannot be checked sample for sample from this run; its voice_decompressed.wav with the gain at 1 is the decoder's own output for one key press.

### stands.receiver

W3-03 (2026-11-10, docs/reports/W3-03-engine-binary.md): the receiver's queue was read from the owner's engine file and agrees with the owner's console log (Set G) on every count checked. A voice channel is a 0.5 s ring at 44.1 kHz; overflow drops the oldest sound, heard as a skip. A packet for a speaker with no channel opens one, resets the gain to 1.0 and starts a countdown of voice_buffer_ms (100) that falls by one FRAME's duration per 15 ms TICK, so the wait before playing is about 100 ms at 67 fps, 345 ms at 233 fps and 450 ms at 300 fps, and what is queued at the start is at most 0.5 s less the 160 ms a spurt opens with: about 350 ms on a fast PC, which is the L0 the takes gave. A spurt whose first packet arrives before the ring is found empty is appended (W3-01's rule, plus a grace of one tick); otherwise the channel is freed and the next packet restarts. One sample is dropped from every packet, which is the 400 ppm every take runs fast by (not a recorder's clock). The last voice_fadeouttime (0.1 s) of a queue is faded. The gain law of findings 3 and 4 is confirmed, with small corrections: the ramp divides by 127, the block mean is an integer, a decoded block of zeros sends the gain to its cap, and the gain resets when a channel is assigned. Not found in the voice path: the [0.1, 0.8, 0.1] output stage. Legacy codecs: vaudio_celt is 22050 Hz, 512 samples, 64 bytes at complexity 5 (the app runs 10); vaudio_celt_high is 1024-sample frames in 128-byte packets fed 22050 Hz sound (the app's celt_44 runs a table row the engine never selects); the engine asks vaudio_speex for quality 3 at 11025 Hz. voice_inputfromfile is not read under the Steam codec but is under vaudio_celt (22050 Hz, 16-bit mono, beside the executable); voice_recordtofile writes up to 11.9 s per key press, after the gain.

### stands.gain_exact

2026-11-10, Set H (the owner ran vaudio_celt with a known file as the microphone, voice_maxgain 1 and then 10, voice_recordtofile on): the engine's gain rule as W3-03 read it, applied to the gain-1 recording, gives the gain-10 recording sample for sample over 291,840 samples (570 packets; only the last packet differs, and that differs between the two key presses). The integer block mean and the rule that a decoded block of zeros sends the gain to its cap are both needed for that (2,798 and 234 of the 291,840 samples differ without them; 3,309 and 745 counted over the whole file with its last packet); the divisor 127 or 128 makes no difference on this signal. The app's present rule differs on 3,032 samples. This is the first sample-exact check of any receiver stage against the game, and the gain code is shared with the Steam path. The same set shows vaudio_celt in 512-sample packets and vaudio_celt_high in 1024-sample packets, both at 22050 Hz. The app's CELT did not match it (17.7 dB); W3-08 found why. Since W3-05 (2026-11-10) the app's own gain code gives the same 0 of 291,840, and a second read of the gain function found every float operation single precision and separate, the per-sample product a 32-bit multiply that wraps, and the reset writing unity for the first block with the settings read only then.

### stands.celt_exact

W3-08 (2026-11-10, docs/reports/W3-08-celt-encoder.md): the game's CELT is the source the app already pins, built with its pitch pre-filter and post-filter compiled in (the app's build has them out). With that build switch, a reset after creation, 16-bit entry points with ties to even, and the two-sample start of the engine's file reader, the project's own WebAssembly build gives Set H's vaudio_celt recording at 292,351 of 292,352 samples and its vaudio_celt_high recording at 292,789 of 292,864, the rest one step off (the orchestrator re-ran the check). vaudio_celt_high is the 44100 Hz mode with 1024-sample frames and 128-byte packets, run on 22050 Hz sound. The bundled decoder refuses any real vaudio_celt packet whose filter flag is set, so a demo's CELT voice does not decode today where the voice is pitched. Built and merged as W3-06 (2026-11-10): the app's own module now gives those figures, and Set I's recording at 145,919 of 145,920.

### stands.mixer_output

W3-07 (2026-11-10, docs/reports/W3-07-mixer-output.md), read from the owner's engine.dll and checked against Sets B and D: the mixer runs at a fixed 44100 Hz in 512-sample blocks; a voice channel is copied in sample for sample (no rate conversion, no interpolation, no spatialisation, no filter) at 255/256 truncated toward zero; the sum of voice and game sound is clipped at +-32767, then multiplied by volume and rounded. voice_overdrive never touches the voice itself. The roll-off above 12 kHz that the model fits with the 3-tap [0.1, 0.8, 0.1] is not in the game: it is the system mixer's linear interpolation from 44100 to the device's 48000 Hz (flat tops stay exactly on the ceiling; a 1 kHz tone has images at 2900 and 4900 Hz at -64 to -67 dB in five recordings, predicted -65.4 and -66.2; response sinc squared, equal to the 3-tap within 0.1 dB up to 13 kHz and 1.1 dB lower at 18 kHz). On a 44100 Hz device there would be no roll-off (inferred, no take). Listener B is explained: volume 0.11 (ceiling 3604 = round(32767 x 0.11)) and voice_scale 0.77 on that PC, which with the engine's gain rule gives its staircase; REFERENCE's 'about 0.077' and finding 15's reading of B are wrong. Not modelled and not needed for the takes: the room and water DSP a voice also passes through. Since W3-10 (2026-11-11) the app runs all of it as read, in exact integers: the entry at 255/256 truncated, the engine codecs' upsampling by two, the clip, volume and rounding with ties to even, then the device stage (linear interpolation to the listener's device rate, 48000 Hz by default, none at 44100). The 3-tap filter, the float volume, the output's sinc resampler and the soft limiter are gone; a render is at the device's rate; volume's default is 1. On the owner's takes the model minus the recording at 12 to 16 kHz went from -0.76 and -1.00 dB to -0.03 and +0.04 (music) and from -1.84 to -0.06 (speech): the fitted filter had no images, the interpolation and the recordings have them. The device stage against a lossless retake (2026-11-11): the linear rule and ties to even after volume confirmed; as built equal in 49% and within one unit in 73% of samples, within one unit in 98.2% with the read position drifting as a single-precision one would (2^-25 mix sample per output sample) and 99.5% with the voice 0.0011 sample late; a one-unit loss toward zero in about a quarter of samples is unexplained. Inaudible; a read of the XAudio2 module would be for equality to the unit only.

### stands.steam_sender

W3-09 (2026-11-10, docs/reports/W3-09-steam-voice.md), read from the owner's steamclient64.dll and checked against Set G's logs and Set D's demo. Capture at 24000 Hz in steps of 750 samples; each Steam frame (about 55.85 ms) takes the whole steps captured since the last as one chunk; the gate is open when the chunk's mean of |x| is at least 1.0% of full scale or its peak at least 15%; an opening sends the last 100 ms (2400 samples) before the chunk with it; the hold is 0.4 s of wall-clock time; key up is followed by 0.5 s more capture; one chunk is one message; frames of 480 are cut from kept plus chunk; the end marker resets the encoder and the sequence number. Encoder: libopus 1.1.4, VOIP, 32 kbit/s, DTX on, complexity default 9 (the project's build gives the same packets at 8 to 10), 16-bit entry points. Decoder: concealment capped at 10 frames; the 24 to 44.1 kHz step is libswresample at its defaults, called once per packet with a flush, which gives the logs' sample counts exactly (7056, 2646, 882). Not yet tested by the owner: Steam's console variables mic_inputfile (a file in place of the microphone under the Steam codec) and @voice_spew_activity_check; clips for that run are in the private repository.

### stands.sender_demo

2026-11-10, a private run of steam-sender.js (W3-02b) against what Steam sent in Set D's demo (20 spurts, 1,816 messages, 5,109 frames; the scripts are in the private repository). With the demo's own chunk lengths as the clock and the demo's decoded sound as the microphone: spurt starts within one chunk (62.5 ms) in 18 of 20 and ends within two chunks in 18 of 20 (W3-11a's bars: 17 and 16); the four misses are the decoded sound differing from the microphone's (a -36 dB pink step and a 20 Hz sweep that decode under the gate, tones above 11.5 kHz that decode to almost nothing). With the test signal itself as the microphone: 16 spurts message for message the demo's, the 727-, 429- and 924-frame ones among them, starts 20 of 20, ends 19 of 20. Not falsified: the frame cutting and one chunk per message; the pre-roll (2400 samples in 18 openings, 1500 after a record, 0 from the ended state); the silence record one chunk long and absent when the next chunk is active; pauses of 20 to 200 ms bridged and 500 ms not; a hold of 0.4 s from the read of the last active chunk (bounded to 375 to 406 ms). Known bias, in the DRAWN clock and not in the rule: with seeds 1 to 200 the 440 ms pause between spurts 19 and 20 is bridged in 194 seeds where Steam split it, because the drawn clock ends a spurt on the 8th chunk about 94% of the time where the demo has the 7th in half; the model's tails after the loud part average 482 ms against Steam's 462 in this demo (the old 22-frame gate: 444). The owner's planned Steam console run with @voice_spew_activity_check prints each chunk's length and verdict and is the data to refit the clock on. Also: the decoded sound is 156 samples (6.5 ms) late against what the gate saw; and the demo's voice ticks are multiples of 4 (60 ms).

### stands.steam_exact

W3-14 (2026-11-10, docs/reports/W3-14-steam-file-input.md), the owner's Steam console run with a file in place of the microphone (Set J, private). The app's parts, driven by Steam's own chunk lengths, give Steam's recording of the continuous clip in 524,286 of 524,288 samples (11.889 s) under the fma3 kernel; the two others are one step off and come from one decoded sample that lies one float step from a rounding boundary. The other kernels differ in 59 to 108 more. Settings of the match: libopus 1.1.5, 24000 Hz, VOIP, 32000 bit/s, DTX on, VBR, complexity 9, the 16-bit decode, one message per chunk, one resampler per decoder with the first-packet flush. All 789 gate verdicts follow the rule (mean at least 1.0% of 32767, or a sample at least 4915); all 645 lines of the game's log are reproduced; the pre-roll matches sample for sample. New: the hold is 0.4 s on a 32-bit float clock whose step depends on how long that clock has run (1/8 s in this run, where all 12 spurt ends fall four steps after the last active read; 1/32 s fits Set D), which explains the sender's bias toward the 8th chunk; Steam reads every 48 to 64 ms, nearly uniform, never late; a key press resets the encoder and the kept samples, not the sequence number or the gate's state; the decoder and resampler outlive key presses. Not shown: the soft clip (nothing passed full scale), 1.1.4 against 1.1.5, the microphone path.

### stands.room_dsp

W3-15 (2026-11-10, docs/reports/W3-15-room-dsp.md), read from the owner's engine.dll, the game's dsp_presets.txt and 40 soundscape scripts (private), and Valve's public SDK source. The room is set by the map's soundscape (its dsp key sets dsp_room); 101 of 153 soundscapes set 1, the automatic room, and every soundscape of the best-known stock maps does. With dsp_room 1 the engine measures the space at most every 0.25 s, names one of 11 shapes, and builds a preset from two of the file's presets 102 to 133. Setting a preset overwrites dsp_mix_min, dsp_mix_max, dsp_db_min and dsp_db_mixdrop from the preset's header, so the voice's room share depends on the preset: 26/256 for presets 0 to 29, 38 to 80/256 in automatic rooms and halls, 5/256 in the open. The room DSP is mono, 44100 Hz, integer arithmetic at 4096 = 1.0, before the clip and volume; its tail runs on. The app's presets 0 to 29 match the file value for value, but the app lacks the headers, the automatic room, presets 30 to 135, the three-dimension reverb, and mixes 45% wet. dsp_room starts at 0: with no soundscape the voice is dry at 255/256, which is what the owner's takes show. Not read: the room measuring in detail; the three-dimension reverb needs a second read. Second read (docs/reports/W3-17-room-dsp-second-read.md, independent, blind first): W3-15's conclusions and its whole share table stand; five points change numbers (the three-dimension reverb's negative factor is a gain-1.0 predelay in the first round and a quartered dimension later; the gain cut's exact single-precision form; diffusion is never measured in this build, so the diffuse template pairs are never chosen; the cutoff blends from the dull template and never reaches the bright one). The room measuring is now read to the formula (20 rays, the shape rules, the rebuild rules). A reference model in Python gives echo tables for preset 6, a small automatic room and a tunnel (kept privately). The amplifier and the modulating delay were read a second time (docs/reports/W3-17-amp-mdy-second-read.md): the water preset's amplifier does not swing; its gain is full for 100 ms, glides once to 1640/4096 over 80 ms and stays (the ramp stops one unit short of its target, and with the random flag clear the target is always the lower one). Both processors act every period plus one samples. The recordings show it (docs/reports/W3-15b-rooms-in-the-takes.md, 2026-11-10): only Set B is dry (255/256 to four digits, ratio 0.9960). Set C carries the automatic room of size class 2 (room 41/256, direct 214/256): the model gives 0.232 at 57.96 ms against a measured 0.2335, pattern correlation 0.89 to 0.90, and the predicted level drop of 1.20 dB is the 1.09 to 1.33 dB the accuracy table has always shown on Set C. Set D's PC A carries the street preset (23/232; echoes at 68, 120 and 308 ms, as the engine's rule gives). So the two reads of the engine are confirmed by recordings, and one's own voice under voice_loopback gets the room like any other voice. dsp_slow_cpu 1 (the game's Sound quality at its lowest, saved in the config) turns the room off while dsp_room still prints 1; that, or dsp_volume 0, is the likeliest reason Set B is dry. A 1 kHz tone's level cannot detect a room. PC B's 140 ms echo in Set D is unexplained. The room module (W3-17a, built; in review) was read against the engine and run on the recordings (docs/reports/W3-17a-second-read.md): its steady state matches the engine everywhere read. On Set C, with the voice taken at the mixer's input (after the codec), the module with size class 2 and reflectivity class 3 gives the take's autocorrelation at 57.96 ms (0.2311 against 0.2303) and its four comb peaks to 1 to 7% (the earlier 15 to 25% gap came from fitting on the full-band played signal); the loud stretches' level error falls from +1.1 to +1.3 dB to within 0.1 dB, and the tails' level fits to 0.4 dB. On Set D's PC A the street's three echoes fit within about one scatter. Different from the engine, all in changes while running: the cross-fade's alignment and its last block, the block order of the shares, setting none overwrites the mix values with preset 0's header, and the water slot is one long-lived instance of preset 14 with no fade, called or not block by block. Set K (2026-11-11, the owner's room takes on 2Fort, scored privately): on a lossless fully wet take every tap of room 6 out to 102 ms is at the module's delay with its strength within a few percent; the game's shares, dsp_slow_cpu 1 as a dry case, the water preset (a voice at 0.77 of its level, not 0.40) and every adsp_debug line at five places agree with the module. Not shown: equality sample for sample (the system's limiter and the map's ambience are in the takes), the tail's decay, and 32639 or 32510 after dsp_room 0; the owner is retaking R1 and R3 at volume 0.5 with voice_overdrive 1000. Five ROOM_PLACES rows for 2Fort are in the order's amendment. Set B's dryness is not explained. Retakes (2026-11-11, lossless, volume 0.5, voice_overdrive 1000): dsp_room 0 leaves the flat tops at exactly 16320 (32639, not 32510); the fully wet take fits the module with a residual 37 to 43 dB under it in its best seconds, not yet placed to the sample. In the render since W3-17c (2026-11-11, v28).

### stands.steam_hold

W3-16 read (2026-11-10, docs/reports/W3-16-steam-hold-read.md), from the owner's steamclient64.dll and the public tier0_s64.dll. The hold is nowF > fround(notedF + 0.4f), all 32-bit floats, strictly greater; now is seconds since Steam's process started (performance counter), narrowed to a float once per frame. So the hold's real length depends on how long the sender's Steam has run: 400 to 402 ms under 9 hours, 406 to 437 ms at 3 to 6 days, 375 to 500 ms at 12 to 24 days (Set J's run). File input: chunk = trunc(fround(fround(T() - lastF) * 24000)), capped at 6000. The decoder's 24 kHz buffer holds 17 frames; a record needing more is cut there, the frame that did not fit has its number spent, and the game gets nothing when the resampled sound exceeds its room. The built sender (W3-16, in review) was read against Steam's code and run on the recordings (docs/reports/W3-16-second-read.md): its state machine and hold match the code piece by piece; driven with Set J's real read times it ends all 12 spurts on Steam's read, at uptimes in the 1/8 s row only; Set D's ends, tested on the demo's own chunks, single out a Steam running 6.1 to 12.1 days (about 200 times likelier than under a day and a half), so the default of 777,600 s stays and the fallback to 14,400 s is dropped. The 750-sample step is not in Steam's code: it is a 32nd of the one-second capture buffer Steam asks for. The 10 ms of tail bias is within one recording's scatter. The private re-timing check reads worse with the new sender (speech take 58% to 47%, start error 87 to 129 ms) because messages now arrive about 32 ms later after their last sample, which the receiver's fixed zero does not take out; the spread of arrivals now matches Set G's log (2% to 98% width 41.3 ms against the log's 42.5; main's sender 31.3). Re-zeroed, the test-signal takes are as before; the speech take stays worse (117 ms) and no switch in the new sender restores it. Verdict: merge as it is; the zero and the bars are the receiver order's. For a later clock order: capture steps readable on a 10 ms tick, and the constant capture phase taken out of the tick. Set L (2026-11-11): the clock counts from Steam's start, confirmed on two runs whose start Steam's own log gives (23.9 days and 4.8 minutes): at each run's real uptime the built sender reproduces every spurt end (12 of 12 and 18 of 18), at the other's it fails on both. A real-microphone run follows the gate rule on 590 of 590 lines. Open: the first opening after Steam starts had no zeros in front (once, file input), and the 8-step pattern of chunk ends is seen a second time. Set N (2026-11-11): the first opening on a newly started Steam with a real microphone has the 2400-sample lead-in, as the app's sender does; Set L's opening without it is the file-input case of a 6000-sample first chunk.

### decisions[5]

- date: 2026-11-10
- what: The owner left the choice of further improvements to the orchestrator. In order: (1) a sample-exact check of the codec stage with the game's own debug commands, once W3-03 says what they read and write; (2) phrase timing (W3-01, W3-03), and re-timing on by default for the modern preset if the engine's rule is found; (3) sources decoded at the file's own rate (W3-04, started); (4) the unverified parts (rooms, vaudio_celt_high, the Speex settings) verified from the game files or moved under a label; (5) the second PC's peaks 2.5 dB above the model's clamp (Listener B) explained; (6) a look at the page for a simpler first screen.
- why: Exactness on the modern preset is the owner's standard; each item either proves it more strictly or removes a place where the page claims more than is shown.

### decisions[9] (overruled by decision 12)

2026-11-10, the order of work. The owner, asked whether the rooms should move ahead of the receiver's orders: "Do whatever you think is best for the project". Decided by the orchestrator: for orders that touch audio.js the sequence is W3-16 (being built), W3-11b (the live chain on Steam's path), W3-10 (the output stage, moved up from last), W3-17c and W3-17d (the rooms in the render and on the page), then W3-02c, W3-02d, W3-02f with W3-02e, W3-02g (the receiver's channel, re-timing and loss, moved to the end). Reasons: the output stage and the rooms rest on recordings and correct what every render or a visible feature gets wrong today; the receiver's model is the least certain and gains from recordings still to come. The orders are being brought up to date for this (docs/reports/W3-plan-maintenance-2.md, in progress).

### done[0]

W2-02 render-stream: merged 2026-11-10 (pull request 8, main 43fd35f, cache v20). TF2Audio.createRender gives process()'s render a chunk at a time; 47 cases, 145 checks; review 20,656 differential runs with no mismatch.

### done[1]

W3-02a voice-channel: merged 2026-11-10 (pull request 9, main 1ee4968). voice-channel.js is the game's receiver queue as a module, with the log tool and replay; 101 checks; private runs: 0 mismatching ticks of 9,808 on the owner's six log sections and the reference fixture event for event; nothing loads it yet.

### done[2]

The plan after W3-09: merged 2026-11-10 (docs). Orders W3-02 revision 3, W3-11 a and b, W3-12 a and b, W3-13, W3-14; docs/reports/W3-11-plan.md has the order of work.

### done[3]

Row R: tests/REFERENCE_2026.md brought up to date 2026-11-10 (findings 22 to 31, corrections to 2, 4, 5, 8, 10, 11, 12, 14, 15, 16, 18, 19, 21, the Model table in four columns). Left for code orders: comments in constants.js that still say complexity 10 and Steam's capture resampler (W3-11a); tests/accuracy.takes.json still renders Listener B at volume 0.077 (to be re-measured at 0.11 with voice_scale 0.77 when W3-05 has merged).

### done[4]

W3-12a speex-102: merged 2026-11-10 (pull request 10, main 25dc00e). vendor/speex-1.0.2 matches a native build of the pinned public source bit for bit (packets, floats, 16-bit, with and without a reset); 30 checks; Speex 1.0 and 1.0.2 give identical output at the game's settings; the decoder's reset is partial and part b must reset with request 26, not make a new codec. Nothing loads it yet.

### done[5]

W3-02b voice-timeline: merged 2026-11-10 (pull request 11, main f58d9a7). steam-sender.js (Steam's chunk rule, seeded clock) and createTimeline in voice-channel.js; reproduces the plan's reference schedule exactly; a third model agreed on 23,000 seeded cases. Private run (retiming.mjs --engine, 200 seeds, 300 fps): on the speech take 58% of transitions right and a start error of 87 ms (bar 45% and 110 ms; the fitted queue 100 ms, the flat rule 134 ms, none 150 ms); on net_baseline 87 ms against 88 for none; on the tone takes none scores lower (46 against 77 ms on take1_default), which is what a mean error does to an honest random model of a rare shift. W3-02c is not held. Before W3-02c starts its 10d ranges need the planner: the builder measured the spurt after a 900 ms pause 198 to 318 ms early, and 82 to 186 ms dropped, and a 300 ms pause never opens a spurt (it is inside the 0.4 s hold).

### done[6]

W3-05 receiver-gain: merged 2026-11-10 (pull request 12, main 1e6db07, cache v21). The gain in the file render, the stream and the live chain is the engine's rule, operation for operation; private acceptance 0 of 291,840 samples on Set H; the accuracy table on all takes within 0.003 dB rms of before; a second read of the gain function settled the rounding, the wrapping 32-bit product and the reset as READ; 67 checks. Left: with retime on, the frame log and the audio are up to half a frame apart at a moved spurt's edge (retime is retired by W3-02f); a late frame played as silence counts as decoded (in the engine that silence is a queue underrun the gain never sees: for W3-11a and W3-02c); VOICE_ENGINE.autoGain.blockSize in constants.js is no longer read (W3-11a).

### done[7]

W3-06 celt-settings: merged 2026-11-10 (cache v22). vendor/celt-0.11 is the pinned source rebuilt as the game's module is (pitch filter in, reset after creation, 16-bit in and out); it equals a native build bit for bit; celt_22 and celt_44 are the game's modes (celt_44: the 44100 Hz mode on 22050 Hz sound, modeRate); a demo's real vaudio_celt packets decode and an undecodable one plays as a silent frame. The orchestrator's private run with the app's own module: 292,351 of 292,352 (vaudio_celt), 292,789 of 292,864 (vaudio_celt_high), 145,919 of 145,920 (Set I). Six CELT golden hashes re-recorded.

### done[8]

W3-12b speex-profile: merged 2026-11-10 (pull request 14, main 32a6bc0, cache v23). The speex profile is the game's module: Speex 1.0.2 on 11025 Hz sound with no resampling, 14.51 ms frames in 20 bytes, the wrap, a lost frame as zeros, reset in place at a new talk spurt; vendor/speex (1.2.1) and tests/speex removed. The band reaches 5.5 kHz (+0.5 dB at 4.3 to 4.9 kHz against the mid band; the old profile -31.7 dB). Nothing private to run: no recording of the game's Speex can exist. The page now gives each codec's own packet length.

### done[9]

W3-13 steam-resampler: merged 2026-11-10. vendor/swresample (a JavaScript port of libswresample's float path for 24000 to 44100 Hz, modified LGPL 2.1+, its notices and licence text in place) equals the native library sample for sample under each of four kernels; 43 checks; private run: all 2,372 non-empty packet counts of Set G as one stream. Nothing loads it until W3-11a.

### done[10]

W3-11a (2026-11-10): the steam profile's render sends and decodes as Steam does: Steam's sender, the capture rounded to 16 bits, libopus 1.1.5 through its 16-bit entry points (the pinned module rebuilt with opus_decode exported), concealment capped at 10, one resampler per render fed whole messages (the port of Steam's, fma3), the gain fed decoded packets, 16-bit sequence numbers; in process() and createRender alike. Checked: the branch's own process(), driven by Steam's chunk lengths from Set J, gives Steam's recording in 524,286 of 524,288 samples, and the gate clip as one session in 524,256 of 524,288 with the decoder's 17-frame cut applied as read; an independent model equal in 54 of 54 cases; the stream equal to the offline render on 279 renders; the private accuracy table acceptable (clean takes within 0.12 dB below 10 kHz, the 11 to 12 kHz band 0.3 dB closer). The 32 steam golden hashes re-recorded once; cache v24. The live chain still runs the old frame gate (W3-11b). Report docs/reports/W3-11a-steam-render.md. With it: tests/REFERENCE_2026.md brought up to date (findings 5 to 31 as changed, finding 32 on the room, the Model table).

### done[11]

W3-17a (2026-11-10): the room module, new files only (room-presets.js, room-dsp.js, tests/room-dsp.verify.mjs, tests/roomdsp/): the engine's room processors in integer arithmetic, the preset chain, the slot with the engine's cross-fade, the shares, the voice's entry, the room path with the water slot (one long-lived instance, no fade), the tail rule. All 85 hashes and 239 tail lengths of the reference met; a reviewer's own run of 136.5 million samples against the model with 0 differences; read against the engine (docs/reports/W3-17a-second-read.md) and fitted on Sets C and D. Not loaded by the page yet (part c). Report docs/reports/W3-17a-room-module.md.

### done[12]

W3-17b (2026-11-10): the automatic room in the room module: buildAutomatic (a space's measures to a shape, classes, a pair of templates and a built preset, as the engine does it, a vertical shaft's classes included), 14 example cases and the two measured from Sets C and D, and placeFromDebug, which turns the game's adsp_debug line (whole feet, length first) into measures. Equal to the reference model on 56,117 builds in the review; read against the engine (docs/reports/W3-17b-second-read.md), which found one error shared by module and model (the shaft), corrected in both. 210 room checks. Not loaded by the page yet (part c). Report docs/reports/W3-17b-automatic-room.md.

### done[13]

W3-16 (2026-11-10): Steam's sender times its hold as Steam's code does (32-bit floats on a clock that counts from Steam's start; the sender's Steam uptime is a setting, default 777,600 s, 9 days) and reads on the clock as measured (reads 48.0 to 63.7 ms apart; capture steps readable up to 13 ms late). Checked: the state machine and hold against Steam's code piece by piece; Set J's twelve spurt ends reproduced through the built sender; Set D's ends single out 6.1 to 12.1 days; a reviewer's own hold model equal on 30,842 cases and its second sender on 2,100 runs. Spurts end on the 7th, 8th and 9th chunk 26, 71 and 3% of the time (before: 6, 94, 0; the demo: 37, 63, 0). The 33 steam golden hashes re-recorded once; cache v25; the page has the choice for steam. Reports docs/reports/W3-16-sender-hold-clock.md, docs/reports/W3-16-second-read.md.

### done[14]

W3-11b (2026-11-10): the live monitor on the steam profile runs the render's own stages (Steam's capture chunks, gate, hold and clock, Opus, the receiver): with the key held its output equals createRender's sample for sample, at 44.1 and 48 kHz and under loss; push-to-talk feeds zeros while the key is up (the app's stand-in; Steam's own key rules are part c); low latency holds back a chunk and a frame and loses 17 to 80 ms of each phrase's first 100 ms. The review found one defect (a packet before sample 0 at the chain's start was moved as late) and twelve smaller items; the fix round closed all thirteen, and fixed how the page reads a blank or shared gate threshold. Worst backlog 9 ms against the worklet's 40 ms. No golden hash moved; cache v26. Report docs/reports/W3-11b-live-chain.md.

## 2026-11-11

### stands.speex_module

W3-09 section 5, read from a vaudio_speex module the owner supplied (32-bit, from HL2DM): Speex 1.0.2 (float), narrowband, the engine's quality 3 mapped to Speex quality 4, 160-sample frames in 20 bytes, constant bit rate, no VAD or DTX, enhancement on, complexity default. The module does not resample: 11025 Hz sound goes into the 8 kHz codec as it is, so a frame is 14.51 ms, the real rate 11.025 kbit/s and the band reaches 5.5 kHz; decoded floats are truncated to 16 bits with no clamp. The app's speex profile (1.2.1 with resampling to 8000 Hz) is to be rebuilt accordingly (W3-12). No recording of Speex can be made from a current game: asked for vaudio_speex, the engine starts vaudio_celt (Set I, a third recording the corrected CELT build reproduces, 145,919 of 145,920 samples; the fall-back was then found in TF2's engine.dll, W3-09 section 6). Corrected 2026-11-11 (Set M): a recording of Speex can be made. HL2DM's launcher starts the 64-bit game, which cannot load the 32-bit module; started with -force32bit the game runs vaudio_speex (packets of 160 samples at 11025 Hz). The app's Speex on the game's own captured input equals the game's decoded recording within one unit for the first 2.35 s and in 575 of 912 frames; in the rest it is the same sound at the same level (0.014 dB apart, the difference 13 dB under), coded differently from one frame on and equal again after quiet stretches: most likely the two builds' float arithmetic in the encoder's search (not established). Only the gain-1 recording was scored. Settled 2026-11-11 by an investigation (the module read, then run in a CPU emulator, where it equals the game's recording in 145,920 of 145,920 samples and executes no x87 instruction): its arithmetic is SSE2 compiled with the fast floating-point model, 25 places in 7 files of libspeex 1.0.2 differing from strict C (sums eight at a time, three double expressions in float, two reciprocal multiplies, re-ordered additions, four float library calls). A patched plain-C prototype equals Set M's gain-1 recording in 145,920 of 145,920 and the gain-10 one after the app's gain in 146,080 of 146,080, natively and as WebAssembly, and equals the emulated module on 255,746 synthetic frames provided the float cosine and arc cosine are the C runtime's own (not correctly rounded); with stand-ins it parts from the module about once in 250,000 frames. No dependence on the processor found. To be built: W3-18. Since W3-18 (2026-11-11, v29) the app's build has that arithmetic and equals Set M's decoded stream in every sample at both gains (the orchestrator's private run on the build). The whole render at voice_maxgain 10 equals it too since W3-19 (v30). Measured by the owner 2026-11-11 in TF2 itself (build 11191711 started with -force32bit, sv_voicecodec vaudio_speex confirmed by the console, voice_loopback 1, voice_showincoming 1): 226 voice packets, 191 of 320 samples and 35 of 480, all multiples of Speex's 160 and none of CELT's 512, and no "Unable to load" line. So TF2's 32-bit game runs vaudio_speex; the fall-back to vaudio_celt is the 64-bit game's. The docs were corrected at W3-19's merge. Set O (2026-11-11, private): the owner's recordings of Speex in TF2's own 32-bit game, Set M's method and input, at voice_maxgain 1 and 10. The app at v30: the bundled codec in 912 of 912 frames; the whole render in 145,966 of 145,966 samples at both gains. TF2's gain-10 recording is the same file as HL2DM's, the gain-1 ones equal over Set M's length. So the speex profile is checked against current TF2 itself, end to end up to the gain.

### stands.bad_connections

Planned 2026-11-11 (docs/reports/bad-connections-plan.md), from reads of the engine's network functions and Set C measured again. A lost network packet takes its whole voice message (1 to 4 frames, 8 at an opening); nothing plays in its place until the next message, when Steam's decoder puts up to 10 concealed frames in front of it (no FEC) and beyond that the sound closes up; a message past 12 frames with its concealed ones is refused whole. Reordered and duplicate packets are discarded by the channel, so reordered means lost. net_fakeloss N drops (N+1)/101 of packets per draw, each on its own (no bursts), twice per crossing with sockets for loopback, and loopback voice crosses twice: 21.7%, 37.0%, 49.8% of messages at 5, 10, 15 (the app's fitted settings are 22, 45, 64, and its renders of the two heavy takes are 1.4 and 1.7 dB low). net_fakelag and net_fakejitter delay and bunch in order and lose nothing (the jitter take lost no sound), so the app's 'late frames, nine in ten concealed' is not the game's path. The engine codecs queue nothing for a lost message. Not yet measured in a log under loss; the owner's run sheet (blocks 1 and 2) does that. Proposed orders BC-1 to BC-6 in the plan. BC-1 is live since v33 (loss per whole message on steam).

### stands.miles

Nothing of Miles is read or measured from the owner's files yet (2026-11-11). A candidate codec exists: coffeegrind123/voxware-vr12, built here with gcc and run on its own vectors: its encoder gives the vectors' packets in 446 of 446 Half-Life frames, its decoder the vectors' sound within one step (107.6 and 94.1 dB). The vectors are said by its author to be the plug-in's output; that is not checked. Open: whether Source's vaudio_miles is the same VR12 (the owner's older engine files would show which Miles type it asks for), the wrapper's framing from the owner's own module, the decoder's last step, a WebAssembly build giving the same bits, and the owner's ruling on shipping it. 2026-11-11, the owner's screenshot of TF2's 32-bit bin folder: it holds vaudio_miles.dll (117 KB, older file date than its neighbours), vaudio_speex.dll (310 KB), vaudio_celt.dll and vaudio_minimp3.dll. Only the bin\x64 folder had been supplied before, which has neither Miles nor Speex. So the docs' "TF2 ships none" (LEGACY_CODECS, REFERENCE finding 31) holds for the 64-bit folder only and is to be corrected once the files are read: whether that vaudio_miles holds a voice codec or only MP3 playback, whether mss32.dll and the .asi plug-ins are there, and whether the 32-bit game will run either codec. Later the same day the owner supplied that folder's vaudio_miles.dll, vaudio_speex.dll, engine.dll, Mss32.dll, mssvoice.asi, mssmp3.asi and five .flt filters. From headers and strings only: vaudio_miles.dll (built 2024-01-17) holds a voice codec beside its MP3 stream and asks Miles for the .v12 type, which is VR12, the codec of the candidate; Mss32.dll is Miles 9.3a (2012); mssvoice.asi names VR12 (1200 bps), RT24 and RT29; the 32-bit engine's sv_voicecodec help lists steam, vaudio_speex, vaudio_celt and vaudio_celt_high, not Miles; TF2's vaudio_speex.dll differs from HL2DM's in 50 bytes of code. An investigation is running (the wrapper and the engine's check read, the plug-in run in an emulator, the candidate scored against it, TF2's Speex module against the vectors). Measured by the owner the same day (TF2 build 11191711, started with -force32bit, sv_voicecodec vaudio_miles before the map): the console prints "Voice_Init Failed: invalid voice codec vaudio_miles." So current TF2 ships the Miles voice codec and refuses to use it; whether the log's game was the 32-bit process is not shown by the log, and the check itself is being read in the 32-bit engine. The investigation (2026-11-11; private repository, with scripts and vectors). Read from the owner's vaudio_miles.dll and run in a CPU emulator with the plug-in: the wrapper asks Miles only for VR12 (.RAW to .v12 and back), never a sample rate; the plug-in works at 8000 Hz mono; the wrapper keeps the top 8 bits of each sample, codes 360 samples (45 ms, two VR12 frames) into 12 bytes with no header (2133 bit/s on the wire), does nothing to the decoded samples, resets by pushing two blocks of silence through encoder and decoder, has no path for a lost frame, and at start-up encodes one block of uninitialised memory, so the game's encoder start is not defined by the code. The codec is x87 throughout and inherits the caller's precision; at the 53-bit precision the engine sets and at 64-bit its output is identical on every vector, at 24-bit very different. The candidate against the real plug-in on signals of our own: through the game's wrapper (start-up block zeros) its packets are equal on 2,505 of 2,505 frames, before and after a reset, and its decoder gives 901,561 of 901,800 samples, never more than one step off; at plug-in level with 16-bit input 5,005 of 5,010 codec frames. Every decoder difference enters through its 256-point inverse transform (with that transform's results replaced by the plug-in's, every sample is equal); a smaller difference upstream of it is not located. Read from the 32-bit engine: Voice_Init passes four names only (vaudio_speex, vaudio_celt, vaudio_celt_high, steam) and refuses any other before looking for a module; a name other than vaudio_speex or steam would be given 22050 Hz, so this engine has no working set-up for Miles (inferred); the fall-back to vaudio_celt is the same code as in the 64-bit engine and is taken only when Voice_Init fails, which with vaudio_speex.dll on disk it does not. TF2's vaudio_speex.dll equals HL2DM's on all 147 frames of the public clips; its 50 differing code bytes are address operands. Not known: the rate and resampling an engine that accepted Miles used (the older engine files). The three questions for the owner (tables, exact or within one step, the start-up block) were left to the orchestrator the same day and are ruled in decisions. Older engine files arrived 2026-11-11 (Source SDK Base 2006, 2007 and 2013, the owner's own installs; private scratch only). First look, read from headers and strings: 2006's engine.dll is built 2009-12-04 and 2007's 2010-02-01; both name vaudio_miles and vaudio_speex and describe sv_voicecodec as the name of a codec DLL; their wrappers are older builds (2006-05-22, 2008-07-11) over Miles 6.6a of 2004 with a plug-in of 2004, the same file in both; their vaudio_speex.dll is one file built 2006-12-02. SDK 2013's wrapper, Miles and plug-in are byte for byte TF2's, and its engine carries the same refusal text. The 2006 and 2007 files investigated the same day (private findings). Read from both old engines: sv_voicecodec defaults to vaudio_speex and its value is loaded as a DLL by name, any name, with no list and no fall-back, so vaudio_miles was accepted; voice is captured, coded, decoded and played at 11025 Hz, 16-bit mono, for every codec, with no resampling to the codec's 8000 Hz on either side, so VR12 coded 11025 Hz sound as if it were 8000 Hz (a 360-sample, 12-byte frame is 32.65 ms: 2940 bit/s on the wire); a packet is the codec's whole frames end to end behind a 16-bit bit count; the receiver decodes, runs the auto-gain on the decoder's samples in 128-sample blocks (voice_maxgain 10, voice_avggain 0.5, voice_scale 1), then a linear interpolator at step 1.0 that writes n-1 samples for n decoded; Decompress is never called without data, so a lost packet has no decoder call; the codec's Init gets quality 4, hard-coded. Run in the emulator: both old wrappers (2006-05-22, 2008-07-11) with the old plug-in give the existing vectors on every packet and sample (2,505 of 2,505; 901,800 of 901,800), and the old plug-in (Miles 6.6a, 2004) equals TF2's (9.3a, 2012) on every frame and sample at 53-bit and 64-bit precision; the candidate scores against the old plug-in exactly as against TF2's (5,005 of 5,010 frames; 901,463 of 901,800 samples, one step at most). The old vaudio_speex.dll (Speex 1.0.4 by its version string, quality 4: 28 bytes a frame) has TF2's bitstream, a decoder within one step of TF2's and an encoder that gives other packets. SDK 2013's 32-bit engine has TF2's four names and TF2's rate rule; vaudio_minimp3 is its MP3 player, not a voice codec. Not established: what Miles 6.6a itself does at start-up (stood in for), Miles frames per packet in a running old engine, the encoder's real start-up block (uninitialised in all three wrappers). Follow-up the same day. Run: the 2006 and 2007 engines' own gain routine equals the app's receiverAutoGain on every sample (73,418,240 of 73,418,240 over 20,485 blocks, seven settings, both engines); the interpolator after the decoder writes n-1 samples for n decoded, each 0.001 of one sample and 0.999 of the next, the first sample of every packet left out: the rule TF2 has today (finding 24), which the app models for no profile. Read: the encoder is reset at every +voicerecord press and a release sends a last packet with the final flag; the decoder is reset only when a channel is assigned, and a channel is freed when its buffer runs dry, so a pause longer than what is buffered (about the 0.2 s start-up wait; a guess in practice) starts the next spurt from reset on both sides. The profile is live since v32 (W3-20b). Open: the exact decoder; the encoder's real start-up block; what a lost frame sounded like; a recording of a running engine (the optional procedure is the last section of docs/work-orders/W3-20b-miles-profile.md).

### stands.bad_connections_premise

2026-11-11, measured privately before BC-1's build: loss on the steam path takes whole messages, as read. On Set C's noise parts the takes at net_fakeloss 5 and 15 sit inside the seed spread of the read rule at 21.7% and 49.8% of messages on every sound measure (lost runs a second, their lengths, level, share of silence); today's per-frame bursts fitted in finding 8 give three and a half times the runs at a third the length, no silence, and 2.7 dB too little level at 15. Finding 8's published take figures are not reproducible by its described method and are withdrawn; the correction goes into REFERENCE with BC-1. Open: the combined take (more silence than the rule), a 340 ms stretch of generated sound past ten frames, Steam's concealment against the bundled library's.

### stands.receiver_plan

2026-11-11, the plan review of W3-02c (the amendment in docs/work-orders/W3-02-receiver-queue.md): one order becomes three. c-1, the module as read (voice-channel.js only; now). c-2, process() and createRender() run the channel behind opts.timeline 'game' (default 'source', so every recorded hash stays), with opts.fps (300) and opts.bufferMs (100); the channel enters inside the steam timeline's add, replacing the gain block and the laying of sound, while BC-1's loss draw, decoder rules, refusal and counts stay on both timelines; a lost message is simply not pushed, which is all of BC-3's build; the one sample dropped per packet comes with the module (406 ppm at 17.9 messages a second); after W4-01b. c-3, the live chain, after c-2 (it adds the game's wait, 90 ms at 67 fps to 435 ms at 300, to the monitor). BC-4 (jitter as arrival delays) stays its own order after c-2 and retires the late-frame fit. Inferred and unrecorded: at 67 fps a long unbroken spurt reaches the fade after 1.3 to 2.8 minutes. The orchestrator's rulings are under the amendment's decisions.

### stands.receiver_interp

2026-11-11, TF2's own receive routines run privately in the emulator on signals of our own, both of the owner's builds, identical to each other and to the 2006/2007 engines: the interpolator blends each written sample with the next (the fraction starts at 0.999 when the channel is assigned, is carried from packet to packet and never reset otherwise, the result truncated toward zero) and so drops one sample per packet; the pull fades the last 4410 queued samples with single-precision arithmetic, truncated toward zero, and pads a short pull with a repeat of its faded tail and then zeros. Our transcription equals the engine on 1,944,423 of 1,944,423 interpolated samples per build (and 9,369,073 more on a long run) and on 885,240 of 885,240 pulled samples. The app's channel before W3-02c-1 copies unblended: equal on 800,439 of 1,944,423, at most 66 apart. The rule and vectors went to W3-02c-1 as its item 4.

### decisions[13] (overruled by decisions 14 and 16)

2026-11-11, the standard. The owner: "Audible is what I'm mainly concerned with. It should hold up to an extremely critical listener with good equipment." So exactness is pursued where a difference could be heard, and beyond that only where it is nearly free. Not started on this ground: exact Speex (the float arithmetic of the game's build), a read of the XAudio2 module for the device stage's last unit, the 250 ms pattern of Steam's capture, placing the fully wet retake to the sample. Each stays in open_questions with what it would take.

### decisions[14]

2026-11-11, Speex after all. The owner, having read that the other three codecs equal the game to the sample: "it looks like we did all the other codecs exact. So we may as well aim for completeness and do the same for speex, no?" So exact Speex is taken out of the list of things not started on the ground of audibility; the other three items of that list stay there (the XAudio2 read, the 250 ms capture pattern, the wet retake to the sample).

### decisions[15]

2026-11-11, wider history. The owner, asked how much of the engine's voice path over its lifetime is understood: "I think I do want to look more into miles and also the bad connection stuff". So two lines of work are added after the rooms and Speex: the Miles voice codec (a recording from HL2DM's 32-bit game as for Speex, if its module is still installed, and a read of the module), and bad connections (loss, jitter, late packets: what the sender, the codec and the receiver's queue each do), which takes the receiver's orders back out of the shrunk scope.

### decisions[18]

2026-11-11, Miles. The owner pointed to a public repository, coffeegrind123/voxware-vr12 (MIT, one commit of 2026-09-19): a C encoder and decoder of Voxware MetaVoice VR12, the codec behind Half-Life 1's voice_miles, reverse-engineered by its author from the Miles plug-in. Asked whether it may be built and run here, the owner said yes. Not decided: whether it may be shipped (its tables are copied from the plug-in's data, and its README takes the wrapper's facts from leaked source, which this project does not use: those facts are to be re-established from the owner's own files).

### decisions[20]

2026-11-11, the owner on usage (67% of the week at 11:30 UTC): 'Spend faster if you'd like.' The owner has one more weekly reset. So more than one agent at a time again; usage is still read before each new agent.

### decisions[22]

2026-11-11, the owner on usage (91% of the week at 22:25 UTC, after the orchestrator proposed to hold the costly speed order until the weekly reset): 'Keep going. I'll use the reset at 98%'. So nothing is held for usage; the main session runs on the stronger model at high effort (the owner's choice the same evening), builders and reviewers as before.

### done[15]

W3-10 (2026-11-11): the mixer and the output stage as the game's listener gets them, exact in integers (the voice's entry at 255/256, the engine codecs' upsampling by two as read, the clip at 32767, volume as a single with ties to even, then the device stage: linear interpolation to 48000 Hz by default, none at 44100). A render is at the device's rate; volume's default is 1; the page has "Listener's sound device"; the WAV writer no longer writes positive samples one unit low. Removed: the fitted 3-tap filter, the output's sinc resampler, the soft limiter. Checked: 102 checks of the stage, a reviewer's own model equal on 870 renders and 3,600 output-stage runs, the live monitor equal to the render; privately the owner's takes, where 12 to 16 kHz came to within 0.1 dB on music and speech (the order's figures above 11 kHz were restated: they left out the interpolation's images). 48 golden WAV hashes re-recorded, no gain-output or codec hash moved; cache v27. Reports docs/reports/W3-10-output-stage.md, docs/reports/W3-10-upsampler-read.md.

### done[16]

W3-17c (2026-11-11): the rooms in the render, v28. docs/reports/W3-17c-rooms-in-the-render.md.

### done[17]

W3-18 (2026-11-11): exact Speex, v29. docs/reports/W3-18-speex-exact.md.

### done[18]

W3-19 (2026-11-11): the gain's grid, v30. docs/reports/W3-19-gain-grid.md.

### done[19]

W3-20a (2026-11-11): the Miles voice codec as a module. vendor/voxware-vr12 (coffeegrind123/voxware-vr12 at eedf465, four files unchanged, MIT) built to WebAssembly with the game's wrapper as read (8-bit cut, start-up block of zeros, the two-round reset, no lost-frame path); tests/vr12.verify.mjs (31 checks, 21 mutations each failing one) against vectors measured from the owner's plug-in and wrapper in a CPU emulator: game-level packets equal on every frame before and after a reset, decoded samples within one step (581,899 of 582,120 equal), native and WebAssembly builds bit for bit. Nothing loads it: no profile, no cache change (live stays v30). The orchestrator's private run on all vectors with stored input agrees. Reviewed: nothing blocking; one test gap closed.

### done[20]

W3-17d with W4-01d (2026-11-11): rooms on the page and in the live chain, the settings' words, v31. docs/reports/W3-17d-rooms-page.md, docs/reports/W4-01d-settings-words.md.

### done[21]

W3-20b (2026-11-11): the Miles profile, v32. docs/reports/W3-20b-miles-profile.md.

### done[22]

BC-1 (2026-11-11): loss per whole message on Steam voice, v33. docs/reports/BC-1-loss-per-message.md.

### done[23]

BC-2 (2026-11-11): the words. Most came with BC-1 (the label 'Packets lost %', the Laggy preset in packets, finding 8, README's network section, the console's help); the orchestrator added finding 9's correction (jitter delays and bunches in order and neither loses nor conceals; its late-frame events were most likely skips; the app's jitter stays a fit until BC-4) and the test signal README's loopback paragraph (a listen server's own voice crosses the network layer twice and meets net_fakeloss). Docs only.

### done[24]

W4-01a with W4-01c (2026-11-11): the page's journey and access, v34. docs/reports/W4-01ac-page.md.

## 2026-11-12

### stands.live (as it stood on 2026-11-12; now `live`)

https://neb882.github.io/source-VOIP-converter7/ serves main (GitHub Pages from the branch root).

### stands.model (as it stood on 2026-11-12; replaced in the progress file)

The Steam profile from microphone to sound device, the voice gate and the receiver are read and measured (tests/REFERENCE_2026.md). vaudio_celt and vaudio_celt_high run the game's own CELT 0.11 build and reproduce its recordings to all but 1 and 75 samples in 292,000, each one step off. The speex profile runs the game's Speex 1.0.2 as its module does; against a real recording it is equal within one unit in 63% of frames and the same sound, coded differently, in the rest. The rooms are a module confirmed against recordings and not yet in the render (W3-17c, being built).

### stands.last_merged (as it stood on 2026-11-12; replaced in the progress file)

W3-02c-1, the voice channel module as read, merged 2026-11-12 (no cache change: no page loads the module; live stays v34). Before it: W4-01a with W4-01c (2026-11-11, cache v34): the page's journey and its access. A chosen or dropped file, a recording or a demo's speaker renders by itself and the player comes into view with the focus (nothing plays by itself); a changed setting renders again 0.4 s after the last change on a source of at most a minute and keeps the place in the clip, and on a longer one marks the result as made with earlier settings; a render that was cancelled or that failed is not started again by itself; presets light when the controls match them, a line under them says what differs from the defaults, with Reset; settings are remembered in the browser (settings and saved presets only; a share link wins); 'Render' for 'Process Audio', 'Hear: Rendered | Original' for the wet/dry button; a status line under the player with the codec in the menu's own words; the version in the footer and a notice when a newer one is ready. Access: Tab leaves the console, a refused microphone gets a plain sentence, larger controls on a phone, the console's feed no longer read out, meters and the picture described. No audio file touched and no hash moved; the browser suite goes from 299 to 374 checks. Review: one blocking fault (a failed render restarted itself twice a second) and four test gaps, all fixed, each with a check shown to fail. docs/reports/W4-01ac-page.md. Before it: BC-1 (2026-11-11, cache v33): on Steam voice a lost packet is a whole sender message. Loss is drawn once per message (Packets lost %, labelled net_fakeloss); a lost message's frames are encoded and not decoded; when the next message of the phrase arrives Steam's decoder conceals up to 10 of the missed frames and any more time stays silent, later sound keeping its place; a packet coming to more than 12 frames with its concealment is refused whole; a lost end marker leaves the decoder as it was for the next phrase; the live chain equals the render under loss. Five steam hashes moved, no other. The other profiles keep the per-frame bursts of about 2.2 frames. Private check against Set C: the build equals the planner's prototype sample for sample; accuracy level column loss15 -1.4 dB before, +0.0 after; combined -1.7, +0.3; loss5 +0.1, +0.4; speech_loss10 +0.2 before, +0.4/+0.5 after (0.3 dB further from 0, cause unknown). The builder's placement of a played packet replaced the order's formula (the prototype was wrong under heavy jitter). Review: no defect; five test gaps closed, each test shown to fail with its piece disabled; two flaws of the frame log (no sample changes) recorded in the report. At the merge the orchestrator made the page's 'Frames per packet' sentence say that Steam voice ignores it. docs/reports/BC-1-loss-per-message.md. Before it: W3-20b (2026-11-11, cache v32): the Miles voice codec as a profile, `miles`, labelled as not in TF2 everywhere it shows. As the Source engines of 2006 and 2007 ran it: 11025 Hz in and out with no resampling, 360-sample frames of 32.65 ms and 12 bytes, 2940 bit/s, the wrapper and VR12 codec of W3-20a, the receiver's gain on the decoder's samples, a delay of 305 samples (the median of a measured grid; it moves by up to 15 samples with the grid). The codec control has two groups, 'Team Fortress 2' and 'Not in Team Fortress 2' (Fullband Opus and vaudio_miles); a note shown, and read to screen readers, only while Miles is chosen says it is not a TF2 codec and has not been checked against any recording of a running engine; a render's status line says 'Voxware VR12 (not in TF2)'. Stand-ins, said as such in the docs: both codec objects reset at a new spurt, the gain held across spurts, a lost frame as 360 zeros with no decoder call. No accuracy row, no registered prediction. No hash of another profile moved. Review: nothing blocking; three sentences and one accessibility fault fixed. docs/reports/W3-20b-miles-profile.md. Before it: W3-17d with W4-01d (2026-11-11, cache v31): rooms on the page and in the live chain, and a help sentence under every setting. A room control (none by default, the named rooms, a dsp_room number, under water) for renders and for the live chain; the live chain keeps one room path per session and attaches or lets it go at 512-sample block starts, so that letting go and attaching again changes no sample against a path left attached (shown at 11025, 22050 and 44100 Hz); the 11.6 ms hold is counted in the latency only while held. Two reviews: the first found one blocking item (the live room's test compared the module with itself) and five lesser ones, the second a one-sample tick at release and re-attach and a stale flag in the worker; all fixed, each with a check that fails on the code before it. No recorded hash moved; no private run was owed. docs/reports/W3-17d-rooms-page.md, docs/reports/W4-01d-settings-words.md. Before it: W3-19 (2026-11-11, cache v30): the engine codecs' receiver gain on the decoder's own samples. For celt_22, celt_44 and speex the gain runs on the decoder's stream from its first sample (the codec's delay of 64, 128 and 80 samples kept in front) and the delay is dropped after it, in process() and createRender(); the live chain and a demo's voice already did. Privately (the orchestrator, the whole render at voice_maxgain 10 on the game's own captured input): Set M 145,966 of 145,966 samples (before: 86,171); Set H 158,384 of 158,548 samples that are not silence (before: 45,123), the rest one known sample a step off and 163 in the recording's last packet. Reviewed: an independent reference equal in 648 of 648 cases and 54 of 54 with re-timing, the live chain's gain equal to the render's; no major finding, two minor ones fixed. Nine recorded renders moved (the three profiles with the gain on); nothing at voice_maxgain 1, with the gain off, or of another profile. Before it: W3-18 (2026-11-11, cache v29): Speex 1.0.2 with the arithmetic of the game's module. The build patches 25 places in 7 files of libspeex (tests/speex102/patch.mjs) and has the module's float cosine and arc cosine written afresh from a specification in words (tests/speex102/vsx_math.c, SPEC-cosf-acosf.md, tables generated by gen-tables.mjs). Equal to the module run in a CPU emulator on seven clips (147 of 147 frames), on 21,389 and 22,155 arguments of the two routines, and on the tests' five runs. Privately (the orchestrator, on the build): Set M's gain-1 recording in 145,920 of 145,920 samples, the gain-10 recording in 146,080 of 146,080 after the app's gain on the whole decoded stream. Reviewed: a byte-identical rebuild from fresh clones, the two routines equal natively and in WebAssembly on all 2^32 arguments, 11 of 11 output-changing mutations caught, no major finding, three minor ones fixed. Only Speex hashes moved. Before it: W3-17c (2026-11-11, cache v28): the engine's rooms in the render. A room or under water renders through room-dsp.js after W3-10's entry (the voice entered twice at its direct and room shares, each upsampled on its own, the tail ended by the module's rule, cap 20 s); createRender streams a room (outputLength, maxTail); the old room code and the listener's low-pass are gone; five ROOM_PLACES rows for ctf_2fort. No hash of a render without a room moved. Reviewed (an independent model equal on 11,582,872 of 11,582,872 samples; six small findings fixed). Privately: every no-room take unchanged in every figure; Set C with set_c_room +1.2 to 0.0 dB against the take and its echoes equal (0.2363 against 0.2335 at 57.96 ms); Set D PC A one echo of three 36% high, unexplained. The page still offers the old choices, mapped onto the new rooms; the room panel and the live chain are W3-17d. Then W3-20a (2026-11-11): the Miles codec module, with no change to the page or the cache.

### next[0] (as it stood; the new `next` and `held` replace the list)

The exact Miles decoder (the plug-in's two transforms), if wanted; and a recording of SDK Base 2006 or 2007 with sv_voicecodec vaudio_miles, should the owner make one, to check the profile against.

### next[1] (as it stood; the new `next` and `held` replace the list)

Bad connections (plan of 2026-11-11): BC-1 is merged (v33). BC-2 is done (docs). Next BC-3 (loss through the queue, after W3-02c), BC-4 (jitter as in-order delays through the queue; the combined take's extra silence), BC-5 (engine codecs: loss per packet of net_split frames), BC-6 (sender's side, after the two-PC block). Each is to be written as an order before it is built. Open from BC-1: the speech_loss10 row's +0.5 dB; two frame-log flaws under jitter and loss together.

### next[2] (as it stood; the new `next` and `held` replace the list)

Added 2026-11-11 by the owner's decisions: exact Speex (investigation running, then a build order), the Miles voice codec (waits for the owner's run), bad connections (a plan first: what is already read and measured in W3-01, W3-02, W3-03 and Set C, what is missing, which recordings the owner would make). These follow W3-17c; the page orders keep their place after audio work.

### next[3] (as it stood; the new `next` and `held` replace the list)

Back in the queue since the owner withdrew the audible-only standard (2026-11-11), as investigations one at a time after the Speex one: the device stage's last unit, the 250 ms capture pattern, R3-3 placed to the sample. The emulator route (CLAUDE.md) is open for each module the owner has supplied.

### next[4] (as it stood; the new `next` and `held` replace the list)

Order of work (2026-11-11): W4-01b (the render's speed with the same samples; a plan review first; it takes the audio.js slot), then W3-02c-2 (the render runs the receiver's channel behind an option, with loss through the queue), W3-02c-3 (the live chain), W3-02d (the page's control and default), BC-4 (jitter through the queue); W3-11c (the key) waits for a microphone run.

### next[5] (as it stood; the new `next` and `held` replace the list)

From W3-14 and the W3-16 read: W3-16, a small order on steam-sender.js (the hold in 32-bit floats on Steam's clock, with the sender's Steam uptime as a setting; reads uniform 48.0 to 63.7 ms apart; capture steps late by a fitted amount; no late frames; the decoder's 17-frame cut), being planned; checked privately against Set D's demo and Set J; it re-records the steam hashes, so it follows W3-11a's merge. W3-11b takes the key-press rules. A doc edit to W3-09's report: the printed peak is a percentage of 32768, and the float's steps matter at once.

### next[6] (as it stood; the new `next` and `held` replace the list)

W3-17 (docs/work-orders/W3-17-room-effects.md): part a is being built; part b after it; parts c and d after W3-10. W2-04's room half is replaced by part c. The owner's recording procedure for rooms is in the order.

### next[7] (as it stood; the new `next` and `held` replace the list)

Still open: a registered prediction for vaudio_celt_high; the long-render queue W2-03 to W2-06 is HELD by the owner's priority.

### open_questions[0] (answered by W3-09 section 5, W3-12b and W3-18: Speex 1.0.2, the engine's quality 3 as Speex quality 4, checked against TF2 itself, Set O)

Which Speex quality and release did Source's vaudio_speex use? The profile assumes quality 4 of Speex 1.2.1; a packet from a demo of that era would settle the quality by its size (20 bytes a frame at quality 3 or 4).

### in_flight W3-02c-1 (as it stood at 34c36b8; merged 2026-11-12 at a2b7dc9, pull request #30)

- order: W3-02c-1
- state: built; in review
- note: Built on claude/w3-02c1-channel-as-read (head ebde6a0, CI green): all five items, the interpolator's blend and the fade as TF2's routines compute them; the named arrival constant measured at 50.5 ms. The orchestrator's private runs, 2026-11-12: the Set G replay matches the game's log on every tick of all six sections with each fault mismatching somewhere, as tabled; tests/retiming.mjs --engine on the speech take reads 47% of transitions and a start error of 122 ms (129 before; the plan expected about 117; between 110 and 130 the work goes on and says so here). An independent reader is on it. No cache change.

### in_flight, the documentation pass (as it stood at 34c36b8; main has since given it the note and state of stage 2)

- order: The documentation and structure pass
- state: auditing
- note: Asked by the owner on 2026-11-12: a full pass over all documentation, rewriting freely. Stage 1, read-only, two auditors: A reads README.md, CLAUDE.md, docs/PIPELINE.md, the tests' and vendor READMEs and tests/REFERENCE_2026.md against the code, the suites and the page, and outlines a new README; B establishes each order's state from the log and the code, hands back an index, lists what merged orders made untrue in the orders still to build, and proposes a layout for docs/ and a shape for this file. Stage 2, after W4-01b merges: a builder rewrites from the two lists; a reader checks the result against the site. Widened by the owner the same day to the structure and operation of the whole project: a third auditor, C, maps the code, lists what of the first era (fits and guesses from before the game's files were read) is still on the sound's path, dead and duplicated code, whether the large files should be split with no build step and no recorded hash moved, the tests and CI's time, the build and the cache list, and how work has actually been run this month; it hands back a ranked proposal. The orchestrator decides from the three hand-backs what is built and in which order.

### waiting_on_the_owner[0] (taken out 2026-11-12: the 32-bit engine's refusal of vaudio_miles was read, and the run that would settle Miles is the one in an engine of Source SDK Base 2006 or 2007, in docs/owner-runs.md; confirmed by the orchestrator)

A Miles run in HL2DM's 32-bit game (steps given 2026-11-11): whether bin holds vaudio_miles.dll and the mss files; if so two recordings as for Set M with sv_voicecodec vaudio_miles, the console log, and the module files.

### done[25]

W3-02c-1 (2026-11-12): voice-channel.js as read: the first pull, D on whole blocks, the zero (arrival 50.5 ms and the caller's codec delay as an option), the interpolator's blend and the fade as TF2's routines compute them, in 16-bit units. Report docs/reports/W3-02c1-channel-as-read.md. No cache change.

## 2026-11-12 (appended at the merge of the documentation pass, stage 2)

### open_questions (the weak takes), as it stood before the documents' review

2026-11-12, from the accuracy run on all 18 takes with main's model: the two low-tone takes (Set F) are the weakest plain takes (lowtone_default -0.7 dB and 0.797; lowtone_maxgain_1 -2.2 dB, 0.584 and -15.5 dB at 11 to 12 kHz), and take1_default and listener_B are 2.7 and 3.2 dB high at 10 to 12 kHz. Whether the record already explains each (the low-tone and comfort-noise findings; the capture's roll-off) is to be checked when docs/ACCURACY.md is reviewed.

### in_flight (the documentation and structure pass), as it stood while stage 2 was written

Asked by the owner on 2026-11-12, who allowed the documents and the project's structure to be rewritten freely. Stage 1 is done: three read-only audits (the documents a reader meets; the orders, reports and this file; the code, tests, CI and how work is run). Applied at once: CI tests a commit once and skips pushes that touch only docs/ (34c36b8). Stage 2, writing now on two branches: claude/docs-w1-readme-findings (a new README, docs/FINDINGS.md, docs/ACCURACY.md, docs/VOICE-PATH.md) and claude/docs-w2-guides (docs/LIVE.md, docs/PAGE.md, tests/README.md, docs/README.md as the index of orders with a status line on each, docs/owner-runs.md, every existing document corrected, this file reshaped into a short file and docs/PROGRESS-LOG.md); a reader then checks every stated fact against the code. Stage 3, after W4-01b merges and before W3-02c-2: a test-harness order (verify.js loads the engine in its own realm, a runner in place of the && chain, parallel CI jobs, a check that derives the cache list, the cache number set only at the merge, one shared test loader), then audio.js split by stage into eight files with no recorded hash moved, with built orders moved to a done folder in the same order. Later: one staged renderer (decided after BC-4); exact live-against-render checks for the older codecs (alongside W3-02c-3).

### live.main

Until this merge the file named main's commit (`9e0abd0`). A file cannot name the commit it is part of, so it now points to `git log`.

## 2026-11-12 (appended at W4-01b's merge)

### in_flight (W4-01b), as it stood while the order was built and reviewed

docs/work-orders/W4-01-page.md, section W4-01b, with the orchestrator's plan review of 2026-11-11 against today's code: the worker is kept between renders, no timer yields in the worker, the result before the meter, the capture signal and the codec stage's result reused when the changed setting comes after them (keys safe by default: a function-valued option that is not a pure observer of later stages reuses nothing), Cancel stops the render and keeps the worker and its stages, the first seconds of a long clip playable while the rest renders. No recorded hash may move. Branch claude/w4-01b-speed. Two independent readers follow the build. Built 2026-11-12 (head a1984d5, CI green): on a 5-minute clip the first playable sound comes after 0.9 s where it took 16.9, and a re-render after a change of voice_scale takes 6.1 s where it took 16.3 (the builder's medians of three). The builder stopped on memory: for a 9.8-minute source the browser's peak over the idle page is 2050 MB against 1592 MB on main (+29%, the order allowed a tenth); most of it is the kept worker's uncollected garbage, and 231 MB more is held at rest (the source, the capture signal, the codec stage's result). The orchestrator accepts the figure for this order; a way back, should long clips strain a browser, is to hand the stages to a new worker after a long render.

## 2026-11-12 (appended at S3-03's merge)

### next (S3-03), as it stood until the order was built

the names in the page's mock console feed replaced by invented ones, and one chat line reworded, so that no real person's name stands next to invented lines. After: nothing; taken 2026-11-12.

### in_flight (the documentation and structure pass), its state and note until this merge

State: stages 1 and 2 on main; stage 3 planned (S3-01), waits on W4-01b

Asked by the owner on 2026-11-12, who allowed the documents and the project's structure to be rewritten freely. Stage 1 (three read-only audits) and stage 2 are done: a new README, docs/FINDINGS.md, docs/ACCURACY.md, docs/VOICE-PATH.md, docs/LIVE.md, docs/PAGE.md, tests/README.md, docs/README.md (the index of orders), docs/owner-runs.md, a status line on every order, the audit's corrections, CLAUDE.md's writing rules, and this file short with its history in docs/PROGRESS-LOG.md. Each branch was checked statement by statement against the code and the record by a separate reader and fixed. Stage 3, after W4-01b merges and before W3-02c-2: S3-01, the test harness (being planned on claude/s3-01-plan: verify.js loads the engine in its own realm, a runner in place of the && chain, parallel CI jobs, a check that derives the cache list, the cache number set only at the merge, one shared test loader), then audio.js split by stage into eight files with no recorded hash moved, with built orders moved to a done folder. Later: one staged renderer (decided after BC-4); exact live-against-render checks for the older codecs (alongside W3-02c-3). Owed from the audits and not yet in an order: real people's names out of the page's mock console feed (constants.js); the real-take check's spurts still come from the old 20 ms frame gate.

### live.last_merge, as it stood until this merge

W4-01b (2a98439, cache v35, pull request #32, 2026-11-12): a render after a changed setting runs only the stages after it (the capture signal and the codec stage's result are kept in the page's one worker), Cancel stops a render and keeps the worker, a clip over 30 s is playable from its first 14 s while the rest renders; no recorded hash moved; docs/reports/W4-01b-speed.md. On a 5-minute clip the first sound comes after 0.9 s where it took 16.9, and a re-render after a change of voice_scale takes 6.1 s where it took 16.3 (the builder's medians of three). Memory: for a 9.8-minute source the browser's peak over the idle page is 2032 MB against 1592 MB before (+28%; the order allowed a tenth; accepted by the orchestrator, most of it the kept worker's uncollected garbage, 120 MB held at rest). Two independent readers; a randomised comparison against a fresh engine (7,200 steps, and 2,400 more on the fixed head) found no difference. Before it: The documentation pass, stage 2 (merges 23eb36f and 33a011c, main at 1f86342, pull request #31, 2026-11-12): documents only, with the accuracy manifest's second-PC row and CI's time limit (45 minutes); no cache change. Before it: W3-02c-1 (a2b7dc9, pull request #30, 2026-11-12): voice-channel.js as read; no cache change, since no page loads the module. The last merge that changed the site: W4-01a and W4-01c (b9579a4, cache v34, pull request #29).

## 2026-11-12 (appended at S3-01a's merge)

### live.last_merge, as it stood until this merge

S3-03 (11f430f, cache v36, pull request #33, 2026-11-12): the handles in the page's mock console feed are invented ones and one chat line names nobody; a browser check pins both lists by hash; no render reads either list; docs/reports/S3-03-mock-names.md. Before it: W4-01b (2a98439, cache v35, pull request #32, 2026-11-12): a render after a changed setting runs only the stages after it, Cancel keeps the worker, a clip over 30 s is playable from its first 14 s while the rest renders; docs/reports/W4-01b-speed.md; its times and its memory cost (a 9.8-minute source peaks at 2032 MB against 1592 MB before, accepted) are in docs/PROGRESS-LOG.md. Earlier merges: the index, docs/README.md.

### next (S3-01a, S3-01b), as it stood until part a was merged

a: one engine loader in each suite's own realm (tests/verify.js 142 s where it takes 465, the same output byte for byte, measured by the planner) and the steam sections in their own file. b: a runner in place of the && chain, a check that derives the cache list, the cache number set only at the merge, CI in five jobs (about 5 minutes expected where a run takes 16 to 20). The orchestrator's rulings of 2026-11-12 are in the order. After: a is built and under review (2026-11-12); b follows a's merge.

### in_flight (the documentation and structure pass), its state until this merge

stages 1 and 2 on main; stage 3: S3-03 merged, S3-01a built and under review, then S3-01b, S3-02a, S3-02b

## 2026-11-12 (appended at S3-01b's merge)

### live.last_merge, as it stood until this merge

S3-01a (7a94dc8, pull request #34, 2026-11-12; tests and documents only, no cache change): the Node suites load the engine through one helper, tests/lib/engine.cjs, in the suite's own realm, and tests/verify.js's three steam sections are tests/steam.verify.js; every converted suite prints what it printed before (the builder's runs and a reviewer's own), and the split's check lines are the unsplit suite's. tests/verify.js takes about 10 s where it took 460 to 490 on the build machine; pnpm test on CI 11 min 36 s where it took 17 min 34 s on runners of equal speed; docs/reports/S3-01a-engine-loader.md. Before it: S3-03 (11f430f, cache v36, pull request #33, 2026-11-12): invented handles in the page's mock console feed; the last merge that changed the site. Earlier merges: the index, docs/README.md.

### next (S3-01b), as it stood until the order was built

a runner in place of the && chain, a check that derives the cache list, the cache number set only at the merge, CI in five jobs with 20 minutes each. Its first commit repairs two browser checks that fail by timing ([Browser 3e] the meter's row read too early; [Browser 10] the cancel bound, seen once on CI). The orchestrator's rulings of 2026-11-12 are in the order. After: S3-01a (merged 2026-11-12): can start.

### ci, as it stood until this merge

Since 2026-11-12 (34c36b8) a commit is tested once, on its push: a push that changes nothing outside docs/ runs nothing, and a newer push to a branch cancels the older run; the workflow can be started by hand. Until 2026-11-09 one browser check (the live recording's lag) failed by chance about once in thirty runs; W1-04 removed the cause, so a red run is a real failure. A branch made before W1-04 still has the old check until it merges main. On 2026-11-11 from 13:56 UTC every run stopped before any test: Ubuntu's package mirrors could not be reached from the runners while Playwright fetched extra fonts. Since 5a8ca56 the workflow installs the browser from Playwright's servers first and gives the system packages three minutes; if the mirrors do not answer the suite runs on the runner image's own libraries and says so in a warning. A missing library would fail the browser suite at launch, not pass it. The workflow's limit is 45 minutes since 2026-11-12: a run on a documentation branch was cut at 30 inside tests/verify.js with every check so far passed. Two browser checks are known to fail by timing and are repaired in S3-01b's first commit: [Browser 3e] (the meter's row read before it arrives; seen once in two runs on a planner's prototype) and [Browser 10] (a worker that does not answer a cancel; seen once on CI on 2026-11-12 and passed on the re-run). Since S3-01a (2026-11-12) a run takes 16 to 18 minutes.

### in_flight (the documentation and structure pass), its state until this merge

stages 1 and 2 on main; stage 3: S3-03 and S3-01a merged, S3-01b next, then S3-02a and S3-02b

## 2026-11-12 (appended at S3-02a's merge)

### live.last_merge, as it stood until this merge

S3-01b (087f653, pull request #35, 2026-11-12; tests, the workflow and the rule files, no cache change): tests/run.mjs runs the suites by name or group and goes on after a failure; tests/site.verify.mjs derives the files the site loads and holds sw.js's list to them; tests/cache-number.mjs says whether a merge must raise the cache number, which the orchestrator sets and a builder never does; CI runs five jobs side by side with one result, verify, about five minutes after a push (measured on five runs) where one job took 16 to 19; two browser checks that failed by timing wait for what they read; docs/reports/S3-01b-runner-cache-ci.md. Before it: S3-01a (7a94dc8, pull request #34, 2026-11-12): one engine loader for the Node suites. The last merge that changed the site: S3-03 (11f430f, cache v36, pull request #33). Earlier merges: the index, docs/README.md.

### next (S3-02a, S3-02b), as it stood until part a was merged

a: audio.js (3,436 lines) into ten files under engine/ by stage (dsp, gain, mix, network, codec, room, steam, render, render-stream, live-chain), plain script tags, lines moved unedited, one file a commit with CI on each; no sample or recorded hash changes (the planner built the whole split in scratch: the golden hashes and every compared suite output the same). b: one unused name off TF2Audio. The orchestrator's rulings of 2026-11-12 are in the order. A fresh worker starts 19 to 39 ms later (accepted). After: S3-01b (merged 2026-11-12): S3-02a can start.

### in_flight (the documentation and structure pass), its state until this merge

stages 1 and 2 on main; stage 3: S3-03, S3-01a and S3-01b merged; S3-02a next, then S3-02b

### next (W3-02c-2), as it stood until its order was written (2026-11-12)

file: docs/work-orders/W3-02-receiver-queue.md (the amendment, section 5); after: S3-02a (merged 2026-11-12): a planner writes the order against engine/steam.js, engine/render.js, engine/render-stream.js and engine/gain.js

### next (W3-02d), its line until the owner's note of 2026-11-12 on long clips

the page's control, the default and the words; its note of 2026-11-12 lists what W4-01a and W4-01d added.

## 2026-11-12, at S3-02b's merge

### live.last_merge, as it stood until this merge

S3-02a (f134d2c, cache v37, pull request #36, 2026-11-12): the engine's code moved, unedited, out of audio.js into ten files under engine/ (dsp, gain, mix, network, codec, room, steam, render, render-stream, live-chain); audio.js keeps the codec module's loader and builds TF2Audio from them, with the same members. Every line of the old file is in exactly one of the eleven (the builder's check and a reviewer's own byte-for-byte alignment); every suite that renders prints what it printed before; the page, both workers, sw.js's list and the tests load the ten files in one order; the resampler's licence file joined the offline list. A fresh worker starts 20 to 34 ms later (accepted beforehand). docs/reports/S3-02a-engine-split.md. Known at the merge, from the review: a visitor who loaded the site in the ten minutes before a merge that adds files and then navigates (not reloads) within those ten minutes can get the old index.html with the new audio.js, a page that cannot render until a reload; sw.js's code is unchanged, so this was true of every earlier merge that added a file; S3-02b closes it. Before it: S3-01b (087f653, pull request #35), S3-01a (7a94dc8, #34), S3-03 (11f430f, cache v36, #33). Earlier merges: the index, docs/README.md.

### next (S3-02b), as it stood until it was merged

TF2Audio.realOpusRoundTrip removed (nothing reads it), with two lines of the page that nothing reads. Added by the orchestrator at S3-02a's merge, from its review: the harness refuses an engine file named twice among the page's tags or a worker's list, and a renamed name in a file's head; sw.js fetches code and markup past the browser's HTTP cache (the install's addAll with cache 'reload', the network-first fetch with 'no-cache'), so an old index.html cannot be paired with new scripts after a merge; four comments that still say a moved function is in audio.js (opus-codec.mjs, room-dsp.js, steam-sender.js) corrected, with the note PREDICTIONS.md needs for changed model files.

### in_flight (the documentation and structure pass), closed at this merge

stages 1 and 2 on main; stage 3: S3-03, S3-01a, S3-01b and S3-02a merged; S3-02b next, then the pass is done

Asked by the owner on 2026-11-12, who allowed the documents and the project's structure to be rewritten freely. Stages 1 and 2 (three audits; the new README, docs/FINDINGS.md, docs/ACCURACY.md, docs/VOICE-PATH.md, docs/LIVE.md, docs/PAGE.md, tests/README.md, the index docs/README.md, docs/owner-runs.md, CLAUDE.md's writing rules, this file short with its history in docs/PROGRESS-LOG.md) are on main. Stage 3 is the structure: S3-03 (invented names in the mock console feed) is merged; S3-01a (one engine loader for the Node suites, the steam sections in their own test file) is merged after a clean review; S3-01b (a runner, the derived cache list, the cache number set at the merge, CI in five jobs) is merged after a review and a fix round; S3-02a (audio.js into ten files under engine/) is merged after a clean review; next is S3-02b. Later: one staged renderer (decided after BC-4); exact live-against-render checks for the older codecs (alongside W3-02c-3). Owed from the audits and not yet in an order: the real-take check's spurts still come from the old 20 ms frame gate.

The pass is done with S3-02b: stages 1 and 2 (the documents) and stage 3 (S3-03, S3-01a, S3-01b, S3-02a, S3-02b). Left from it for later orders: one staged renderer (decided after BC-4); exact live-against-render checks for the older codecs (with W3-02c-3); the real-take check's spurts still come from the old 20 ms frame gate.

## 2026-11-12, at W3-02c-2's merge

### live.last_merge, as it stood until this merge

S3-02b (65a2463, cache v38, pull request #37, 2026-11-12): TF2Audio.realOpusRoundTrip and two lines of the page that nothing read are removed (TF2Audio has 37 members). The service worker now asks the network for the page, scripts, styles and workers with cache: 'no-cache', fills a new generation's cache with cache: 'reload', and hands the page scripts marked Cache-Control: no-cache, so after an update a returning visitor gets the new page with the new scripts on a navigation or a reload, online or after a load made offline (measured in the suite's Chromium only; [Browser 4c] holds it in six lines, each shown to fail on a weakened worker). The cost: a returning load asks the server about each of its 38 files again (answered 'not changed' with no body where the server supports it; GitHub Pages' answer was not measured), where the browser's own cache answered for ten minutes before. The update that brings this in is still served by the worker before it: for this change's files every pairing of old and new starts without error (six pairings loaded by the reviewer). A script reached through a redirect is not covered; no file of the site is. The harness refuses an engine file named twice on the page or in a worker's list, and any head that is not plain names. Before it: S3-02a (f134d2c, v37, #36), the engine in ten files under engine/. Earlier merges: the index, docs/README.md.

### next (W3-02c-2), as it stood until it was merged

process() and createRender() run the receiver's channel for the steam codec behind opts.timeline: 'game' (default 'source', so no recorded hash moves); asked for where it cannot run, the option is refused with an error, never ignored; a lost message is not pushed, which is BC-3's build. The page does not offer it (W3-02d) and the live chain does not run it (W3-02c-3). After the merge: the orchestrator's private runs against the takes.

### in_flight (W3-02c-2), as it stood while it was built

planned and ruled 2026-11-12; builder at work on claude/w3-02c2-timeline-option

The planner's prototype (a patched copy in scratch, measured 2026-11-12): a 'game' render equals a reference built from voice-channel.js sample for sample at every setting tried; the stream equals process(); the channel adds 2.2 to 3.4 s to a ten-minute render and peak memory is about 100 MB lower than 'source'. The builder measures each again. Then the reviewer and the second reader (it changes how a render is computed, behind an option).

## 2026-11-13, after the private runs on W3-02c-2

### live.last_merge, the sentence replaced once the private runs were made

Not yet done: the orchestrator's private runs against the takes.

### in_flight (W3-02c-2, the orchestrator's private runs), as it stood until they were made

{"order": "W3-02c-2, the orchestrator's private runs", "state": "next, after the merge is live", "note": "From the order's section \"The orchestrator runs privately\": tests/accuracy.mjs on four takes before and after (identical, since no default render changes); the Set G replay unchanged; the speech take's source rendered with timeline 'game' at 300 and 66.67 fps and tracked as a take is (on record for comparison: the module alone reads 47% of transitions and a start error of 122 ms); the loss takes of Set C against 'game' renders at their loss (on record: 3.90 lost runs a second and 10.1% silent in the take at 15%; whether the real channel shows drops of 60 to 220 ms that the takes lack is BC-3's first question). Figures only go into the public record."}

### open_questions, the entry on when phrases start, as it stood until the private runs on W3-02c-2

When phrases start: the speech take reads 47% of transitions right and a start error of 122 ms (the orchestrator's private run on W3-02c-1); part of it cannot be closed, since the sender's clock phase at the moment of speaking is not in a recording.

## 2026-11-13, after the rulings on RP-01

Replaced in `in_flight` (the entry "RP-01, the plan"):

a planner is writing the order (branch claude/rp-01-plan), since 2026-11-13. One order for points (1), (3) and (5) of the outside read (ideas_not_started): a page a stranger can reproduce findings from on their own PC, with a script that prints the figures from their own file; the builds and file hashes behind the findings marked read (names, builds, dates and hashes only); and which of the game's recordings of the project's synthetic signals are published, how, and the amendment to the hard rule (decisions_in_force, 2026-11-12). The planner has no access to the recordings: it works from an inventory of sizes and formats. Every step that touches a private file is the orchestrator's. The orchestrator rules on the plan's open choices before any builder starts.

## 2026-11-13, after the queue investigation, the plan review and the Miles sitting

Replaced or removed (in_flight, "The queue after a restart (a private investigation)"):

an investigator with access to the private record is at work, since 2026-11-13. From the private runs on W3-02c-2: at 300 frames a second a 'game' render's channel drops 82 to 173 ms when it opens (mean 116) where the game's log gave 55 to 136 (mean 104, finding 23), and at pauses of 420 and 440 ms the render restarts where the take more often appended. To find: which of the sender's packets at an opening, the mixer's pulls in the timeline, or the tick and frame clock differs from the logs and the Set D demo, and by how much; whether one read rule or one figure accounts for it. Numbers only come back. Its answer decides whether W3-02d may make 'game' the page's default as built, or a correction is ordered first.

Replaced or removed (in_flight, RP-01, its state):

planned and ruled on 2026-11-13 (docs/work-orders/RP-01-reproduce-it.md, section 14 holds the rulings); a plan review by a different model is next, then the builders' parts a and d

Replaced or removed (next, W3-02d, the sentence added 2026-11-13):

Added 2026-11-13: before 'game' becomes the page's default, the question of the queue after a restart (in_flight) is answered

Replaced or removed (next, research track):

the exact Miles decoder (the plug-in's two transforms), and a recording of an engine of 2006 or 2007 with sv_voicecodec vaudio_miles should the owner make one (docs/owner-runs.md).

Replaced or removed (open_questions, "When phrases start"):

When phrases start, after the private runs of 2026-11-13 on a render that runs the queue (the report docs/reports/W3-02c2-render-channel.md): the speech take reads 57% of transitions right and a start error of 99 ms (47% and 122 ms with the module on a block signal; 11% and 150 ms with no timing model); the network take 93% and 35 ms; Set D's sender take 58% and 82 ms. Open: why the render's queue runs out at a pause of 420 to 440 ms more often than the take's (in_flight). Part cannot be closed, since the sender's clock phase at the moment of speaking is not in a recording.

Replaced or removed (open_questions, Miles):

Miles (not in TF2): the exact decoder; the encoder's real start-up block; what a lost frame sounded like; no recording of a running engine.

Replaced or removed (waiting_on_the_owner, the Miles take):

2026-11-12, the owner: may record a vaudio_miles take in Source SDK Base 2006 or 2007 this weekend (docs/owner-runs.md has the procedure). One clean take of the test signal would settle the output chain and the opening block; a second with pauses, the resets. The owner was told which of the profile's stand-ins could be heard: on a plain render only the borrowed mixer and output could be.

## 2026-11-13, at RP-01a's merge

Replaced or removed (in_flight, RP-01, its state):

planned and ruled on 2026-11-13; the plan review by the builders' model came back the same day: build after edits. The orchestrator edits the order in place before any builder starts

Replaced or removed (in_flight, RP-01a (merged; the entry is removed)):

a builder is at work since 2026-11-13 (branch claude/rp-01a-reproduce-script). The script's frame, the two clips' generator, the checks gain, celt and speex on stand-ins, the suite reproduce, docs/REPRODUCE.md, and section 14's measurements entered in the record. No recording goes into the repository in this part.

Replaced or removed (next, W3-22 (moved to in_flight)):

{"order": "W3-22", "file": "docs/work-orders/W3-22-miles-words.md", "after": "nothing; a small order", "line": "words only: the sentence that the codec was never checked against a running engine is replaced in the page, the README, the record, the vendored codec's README, three comments and the suite that pins it; the sitting entered in the record; the profile's behaviour is left (the receiver's two resets before a second press are measured, not read)."}

Replaced or removed (live, last_merge, now kept as the tail of the new text):

(the W3-02c-2 text stays in place after the RP-01a sentence)

## 2026-11-13, when the three builders handed back

Replaced or removed (in_flight, W3-21, its state):

a builder is at work since 2026-11-13 (branch claude/w3-21-capture-phase); it stopped once and was ruled on (the order's last section)

Replaced or removed (in_flight, W3-22, its state):

a builder is at work since 2026-11-13 (branch claude/w3-22-miles-words)

Replaced or removed (in_flight, RP-01d, its state):

a builder is at work since 2026-11-13 (branch claude/rp-01d-files-and-manifest)

## 2026-11-13, at RP-01d's merge

Replaced or removed (in_flight, RP-01d (merged; the entry is removed)):

built 2026-11-13 (branch claude/rp-01d-files-and-manifest, CI green); a reviewer is at work. Then part e, the orchestrator's. The table of the files the read findings were read from (the cells the public reports give; the orchestrator's cells pending), the manifest's frame with no rows, tests/recordings/inspect.mjs, the suite recordings, and the new wording of the hard rule written out for part e. The orchestrator hashed and dated the private files for its cells on 2026-11-13 (kept privately until part e).

Replaced or removed (in_flight, RP-01, its state):

part a merged 2026-11-13 (the script's frame, the two clips' generator, the checks inputs, gain, celt and speex, the suite reproduce, docs/REPRODUCE.md); part d is next (the files behind the read findings, the manifest's frame, the suite recordings), then e (the orchestrator's alone: the nine recordings, the hard rule's amendment) and f; part c after; part b after a planner's pass

## 2026-11-13, when part e's publishing step was held

Replaced or removed (in_flight, RP-01, its state):

parts a and d merged 2026-11-13; part e is next and is the orchestrator's alone (the pending cells of the files table from the private inventory; the nine recordings, each after its check and a read of its header; the manifest's rows; the hard rule's amendment), through a pull request and CI; then f (the suite on the published files), c, and b after a planner's pass

## 2026-11-13: states of W3-21 and W3-22 replaced

- W3-21, state replaced: "built 2026-11-13 (branch claude/w3-21-capture-phase, CI green); a reviewer and a second reader are at work. The builder's point for judgment: the render's sound lies within one sample of main's place, not at the same whole sample in every seed"
- W3-22, state replaced: "the builder stopped on seven places the order did not list; ruled on 2026-11-13 (the order's last section) and resumed (branch claude/w3-22-miles-words)"
