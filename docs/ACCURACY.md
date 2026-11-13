# The app against the game

This document says how close the app's sound is to the game's, stage by stage, and what each claim rests on. What is not exact comes first. For the game's own rules see [FINDINGS.md](FINDINGS.md), for what each stage of the app does see [VOICE-PATH.md](VOICE-PATH.md), and for the evidence see [tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md), named here by finding number.

Every figure carries its standing: **read**, **measured**, **inferred**, **guessed** or **not built yet**. A "fit" is a number chosen so that the app agrees with a measurement. All measurements are from the owner's PC unless a line says otherwise, and the recordings are private: only numbers from them are here.

## What is not exact

Several stages of the modern path equal the game's sound sample for sample. Those stages do not speak for the ones in this list.

- **Which phrases start early.** The page's render on Steam voice runs the game's voice queue by default (**Phrase timing**, at 300 frames a second, since W3-02d-1), and a render shows one draw of the sender's clock. Its other setting, "The file's own timing", keeps every sound where the source has it. The game starts some phrases 80 to 350 ms early after a short pause (measured). The orchestrator's private check of 2026-11-12, on the owner's speech take with its 9 changes from one phrase to the next, gave the figures below. Each share is a mean over many draws of the sender's clock (`tests/retiming.mjs`, 200 seeds unless set otherwise), not a count of the 9:

  | Timing model | Changes it gets right | Error of a phrase's start |
  | --- | --- | --- |
  | a render that runs the game's queue (`opts.timeline` `'game'` at 300 frames a second, the owner's rate; private run of 2026-11-13; the page's render by default; 57% is the mean over 30 seeds, and the page shows one fixed draw of them) | 57% | 99 ms |
  | the game's queue as read, run on a block signal made from the phrases (`voice-channel.js`) | 47% | 122 ms |
  | the earlier queue model | 41% | 100 ms |
  | the flat rule ("Talk-spurt timing", which the page no longer offers) | 31% | 134 ms |
  | no timing model (the page's render on the file's own timing) | 11% | 150 ms |

  On the network signal's take, whose pauses are 240 ms, the render that runs the queue gets 93% of the changes right with a start error of 35 ms (no timing model: 33% and 85 ms). On the sender's take of Set D, whose pauses are 420 and 440 ms, it gets 58% and 82 ms (no timing model: 50% and 83 ms): at that length the take's queue had more often not run out and the render's more often has (measured). The investigation of 2026-11-13 put the cause in the sender's model and not in the queue: until W3-21 its capture steps were cut from the render's first sample, the test signal's bursts ended on those steps, and Steam, whose capture runs free of the source, sent one step more of each burst (inferred from Set D's demo). Since W3-21 the sender's steps take a drawn phase against the source, and the figures above were made before it. Counted again before and after by one script (30 seeds; the seeds in which the render has the take's kind of change, over every change of the take), the network signal's take goes from 291 of 360 to 327, Set D's sender take from 282 of 480 to 290, and the speech take stays at 155 of 270 (measured 2026-11-13; finding 28 of the record). So the phase helps at pauses of 240 ms and closes little at 420 to 440 ms, where the cause is still open. At 66.67 frames a second the same render is no better than no timing model on any of the three, as finding 23 reads. The figures by transition are in [the report](reports/W3-02c2-render-channel.md), "The orchestrator's private runs".

  Part of this cannot be closed. Which pause closes depends on where Steam's reads fell while the talker spoke, and that is not in a recording.
- **The receiver's queue.** Replayed over the game's logged packets, with the mixer's demand taken from the log, the module gives the logged queue on every tick (measured, Set G). When the mixer pulls is therefore not tested. A render runs the module when `opts.timeline` is `'game'`, and the page's render asks for it on Steam voice by default. On the file's own timing, and for a demo's voice (W3-02g, not built yet), a video and the live monitor (W3-02c-3, not built yet), which keep it, a render has no early starts, does not drop one sample from every packet, and has no fade at the end of the queue.
- **The frame rate is one number.** The page takes one listener's frame rate for the whole render. A real game's rate moves, and one long frame ends the wait at once (read). What that does to a render is guessed.
- **The start and the end.** On the game's queue a sound that opens the channel loses pieces of its first seconds. At 300 frames a second a half-second tone is as long as the source and sounds from 35 ms: the first 12 ms of the source never play, and 32.7 ms more are cut out in four places. A 3 s tone has three cuts in its first 1.4 s, and 60 s of unbroken sound nine, the last at 17.3 s. At 66.67 frames a second there is no cut, and the sound starts 31 ms late (39 ms on speech). These are the page's own draw, which is the same in every page render, measured on the model. Over seeds 1 to 10 a render at 300 frames a second loses 0 to 16.5 ms of the source's head, 11.4 ms in the worst case rendered, and at 66.67 and 100 frames a second up to 56 ms; at those two rates it can lose up to 47 ms of its end (measured on the model; [the W3-02c-2 report](reports/W3-02c2-render-channel.md)). The game's side: at 300 frames a second the ring was full when it started to play in 24 of 28 channels, and each of 16 restarts dropped 55 to 136 ms of what was queued, Steam's pre-roll first and then the onset (measured, Set G's logs, finding 23); the takes show skips of any size after a restart (findings 22 and 23). So the cuts are the game's behaviour as read and as logged; where each piece falls inside the sound is the model's.
- **Long unbroken sound at a low frame rate.** At 66.67 frames a second the level first dips after 0.4 to 3.2 minutes (median 2.2); it is first more than 3 dB down after 2.4 to 4.8 minutes (median 3.7), and from minute 7 two thirds of it is more than 3 dB down. At 100, 144 and 200 frames a second the first dip comes at 2.5 to 4.9 minutes, at 5.1 to 8.0, and at 8.7 to 9.9 in 9 of 20 seeds. At 300 ten minutes of unbroken sound play with no fade and no underrun in 26 seeds, with the cuts to overflow of the first seconds above; the level first dips at 11.6 to 12.0 minutes, past the page's limit. All of this is measured on the model; the rules are read; no take shows it ([the plan's report](reports/W3-02cd-plan.md)).
- **The render's clock on the game's queue.** It runs 0.04% fast. At 300 frames a second it gains about 0.4 ms every second, and the end of ten minutes plays 0.24 to 0.28 s ahead of the source; at 66.67 the gain stops once the queue is empty, at 0.12 to 0.16 s (measured on the model; the takes' +400 parts in a million is measured). So Rendered and Original do not stay in step, and the page says so beside **Hear**.
- **Loss on the game's timeline.** At 15% loss the render at 300 frames a second is silent 16.4% of the time against 10.1% in the one take (measured, private). The check against the game's log (BC-3) is not built yet.
- **Jitter.** The jitter setting is a fit to one recording: single frames marked late. The game's jitter delays and bunches whole messages and makes no frame late (read). The order that builds that, BC-4, is not built yet.
- **The codec lane and the real-take panel** were made for the file's own timing. On the game's queue a phrase they show can sit up to about the wait from where it plays; their order (W3-02e) is not built yet.
- **Loss.** Which messages are lost is random in the game and in the app, so a take with loss can be compared only by its statistics. One take with loss, lag and jitter together has more silence than the rule gives (measured: 10.3% against 4.0%), and why is not known. Real internet loss was not recorded.
- **`miles`, which was never in Team Fortress 2.** The codec was checked on 2026-11-13 against one sitting of Source SDK Base 2006 with a file as the microphone (two presses of a 13 s clip of ours; private, numbers only). With one reset before the press it gives 143,796 of the game's 145,800 decoded samples exactly and 144,952 within one step; the others, at most 32 steps off, are in the first frames of the five sounds that follow a silence of 0.5 s or more (measured; why is open). The second press, through the gain at `voice_maxgain 10`: 143,913 of 145,800 (measured). The profile as the page runs it was not put against the sitting, and four parts of it are stand-ins (guessed).
- **The capture.** The roll-off above 11 kHz is a fit to the owner's PC, and the resampler in front of the sender is the app's own. No order replaces either.
- **The sender's clock.** The rule is exact; when Steam reads the capture is drawn from a seed. How long the talker's Steam has run is a setting, and for someone else's voice it cannot be known.
- **The sound device.** The conversion to the device's rate is measured, not read, and only at 48000 Hz.
- **Rooms.** They match recordings in echo times and level. No room equals a recording sample for sample.
- **The older codecs past the decoder.** No recording of what a listener hears under `vaudio_celt`, `vaudio_celt_high` or `vaudio_speex` exists.
- **Level against your own game.** The app plays the voice alone. The game adds its other sound and lowers it under a voice.

## The finish line

The tool is finished when every stage of the modern preset is either equal to a take sample for sample or has its remaining difference measured and explained. The table says where each stage stands against that today.

| Stage of the modern preset | Where it stands |
| --- | --- |
| the capture | not equal: a fit to one PC and the app's own resampler; the difference at the band's edge is measured |
| Steam's sender, the rule | equal: every verdict and every message of the checked runs (measured, Set J) |
| Steam's sender, the read clock | drawn; the difference cannot be closed from a recording |
| the codec, the decoder and its resampler | equal in all but 2 of 524,288 samples (measured, Set J) |
| the receiver's gain | equal under `vaudio_celt` (measured, Set H); under Steam voice no check to the sample exists |
| the voice channel | the module gives the game's logged queue when it is given the log's packets and the mixer's demand; a render runs it when `opts.timeline` is `'game'`, as the page's render on Steam voice does by default |
| the mixer's entry, the clip and `volume` | equal on flat tops (measured); the rest rests on the reading |
| the device's conversion | as built, within one step in 73% of samples; in 98.2 to 99.5% with a drift of the read position that is not built (measured, Set K); what is left after that is not explained |

The research beside the tool has no finish line: the older codecs beyond TF2's, `miles` (never in TF2), and bad connections in depth. It is a second track.

## The `steam` path, stage by stage

### The capture

- **What the app runs.** The left channel, the microphone gain, a clip at 16 bits, the app's own windowed-sinc resampler to 24000 Hz, a roll-off filter, and rounding to 16 bits.
- **How it was checked.** The roll-off against the owner's capture: the app gives −2.2 dB at 11.45 kHz and −6.6 dB at 11.75 kHz where the PC measured −2.6 and −6.5 dB (finding 16).
- **What differs.** In the game Windows or the audio cable resamples, and that resampler was not read. The roll-off is one PC's. A recording of Steam's own capture, which its console can write, was not made.
- **Not built yet.** Nothing is ordered here.

### Steam's sender

- **What the app runs.** Steam's rule as read: chunks of whole 750-sample steps, the level test, 100 ms kept, the 0.4 s hold on a 32-bit float clock, the end marker and the record of silence (`steam-sender.js`).
- **How it was checked.** Against Steam's own printed verdicts and the game's packet log with a file as the microphone (Set J): every verdict follows the rule, and the rule's messages equal the log line for line. Given each run's real uptime, the sender gives every phrase end of two runs, one on a Steam of 23.9 days and one on a Steam of 4.8 minutes (Set L, finding 16).
- **What differs.** The times of Steam's reads are drawn: evenly from 48.0 to 63.7 ms (the measured range), with each capture step up to 13 ms late (a fit to one demo). Where the capture's steps fall against the sound is drawn too, 0 to 31.25 ms, since W3-21, one phase a render (chosen). That Steam's capture runs free of what is played into it is inferred: Steam's code was read to round nothing to steps and to take whatever the read position gained; how that position moves is inferred, and one phase through a session is measured on Set D alone. The step of 750 samples is the owner's PC's. The uptime defaults to 9 days (inferred from one recording).
- **Not built yet.** Steam's own rules for the push-to-talk key (the order W3-11c). A render has no key.

### The codec

- **What the app runs.** libopus 1.1.5 at Steam's settings as read, a fresh encoder for each phrase.
- **How it was checked.** The whole render, driven by Steam's own chunk lengths, gives the game's recording of its decoded voice in 524,286 of 524,288 samples (a private run on Set J, finding 16). Complexity 8, 9 and 10 give the same samples.
- **What differs.** The two samples that differ come from one decoded sample that is one step off; whether that is the release (1.1.4 and 1.1.5 were not told apart) or Steam's compiler is not known. Comfort noise is random in its detail: on steady low tones its offset has another sign and height in the app than in the game (finding 18).
- **Not built yet.** Nothing.

### The network

- **What the app runs.** Loss takes whole messages, each by a draw of its own (read). Jitter marks 3.2% of frames late at 50 ms, nine in ten of them filled and one in ten silent (a fit, finding 9).
- **How it was checked.** Loss by statistics on the noise parts of two takes: 3.12 runs of lost sound a second in the take against 3.20 by the rule at `net_fakeloss 5`, and 3.90 against 4.31 at 15 (finding 8).
- **What differs.** The game's jitter is not single late frames. A message that arrives late in the game is queued, not dropped (read).
- **Not built yet.** BC-4: jitter as delay and bunching of whole messages.

### Steam's decoder and its resampler

- **What the app runs.** 16-bit decoding, at most 10 concealed frames, the refusal of a message longer than 12 frames, and a port of FFmpeg's libswresample from 24000 to 44100 Hz, one for the whole render.
- **How it was checked.** Given the decoded samples, the port equals the game's recording in 524,288 of 524,288 samples once one decoded sample is set one step up (Set J, finding 29).
- **What differs.** The port runs the `fma3` order of sums, the owner's PC's. The library's three other orders differ from the same recording in 59 to 108 samples, each by one step (measured). After a gap of more than ten lost frames, or a refused message, the game's sound closes up and stays early (read; seen by its effect in Set C); a render leaves that time empty and moves nothing after it.
- **Not built yet.** A demo's received voice still decodes to float with the app's own resampler (the order W3-02g).

### The receiver's gain

- **What the app runs.** The game's law in 128-sample blocks, with the ramp in whole steps and `voice_scale` entering twice.
- **How it was checked.** Applied to the game's recording at `voice_maxgain 1`, the rule gives its recording at 10 with no sample different in 291,840 (Set H, finding 26).
- **What differs.** That check ran under `vaudio_celt`. Under Steam voice the game's recording of its decoded voice was made with the gain at one, so the gain is checked there only by level and by the share of clipped samples (the table below). The game sets the gain back to 1.0 whenever a channel is assigned (read); the app does so once, at the render's start, until the voice channel is in a render.
- **Not built yet.** Nothing.

### The voice channel

- **What the app runs.** A render asked with `opts.timeline` `'game'` runs the module `voice-channel.js` at the frame rate and `voice_buffer_ms` it is given. The page's render on Steam voice asks for it by default (**Phrase timing**, `fps_max` 300, `voice_buffer_ms` 100). On "The file's own timing", and for a demo's voice, a video and the live monitor, each message's sound is laid on the source's timeline. The flat rule "Talk-spurt timing", a fit (finding 19), is no longer offered by the page.
- **How it was checked.** The module, replayed over the game's logged packets with the mixer's demand taken from the log, gives the logged queue on every tick (Set G, finding 22). A render that runs it equals a reference built from the module sample for sample (the suite `render-channel`). Against three takes (private run of 2026-11-13): the takes' clock is gone, the 240 ms pauses of the network signal move as the take's do in 26 to 30 of 30 seeds at 300 frames a second and in none at 66.67, and the 420 and 440 ms pauses of Set D's signal move less often than the take's.
- **What differs.** See "What is not exact". In a render that runs the queue at 300 frames a second, a channel that opens drops 82 to 173 ms to overflow (116 in the mean) where the game's log gave 55 to 136 (104 in the mean, finding 23); whether that is why its queue runs out at the 440 ms pauses is not known.
- **Not built yet.** The queue in the live monitor (W3-02c-3) and for a demo (W3-02g); the page's automatic render again of a source longer than 60 s (W3-02d-2).

### The mixer and the output

- **What the app runs.** The entry at 255/256, the clip at ±32767, `volume`, rounding to 16 bits, then linear interpolation to the device's rate.
- **How it was checked.** Clipped tops sit at 4895 to 4896 of a ceiling of 4915 at `volume 0.15`, and at exactly 16320 at `volume 0.5` (measured, findings 30 and 32). The device stage against one recording placed to the sample: within one step in 73% of samples as built, and in 98.2 to 99.5% once the read position is let drift (measured, Set K).
- **What differs.** The device's conversion is a model of a measurement at 48000 Hz. The drift is not built. What is left after it is a loss of one step toward zero in about a quarter of the samples, and its origin is not known. The game's other sound and its ducking are not rendered.
- **Not built yet.** Nothing is ordered; an investigation of the device stage is queued.

## The other profiles

| Profile | What was checked against the game | What was not |
| --- | --- | --- |
| `celt_22` | the decoder's output: 292,351 of 292,352 samples (Set H) | what a listener hears; the queue under this codec |
| `celt_44` | the decoder's output: 292,789 of 292,864 samples (Set H) | the same; the gain at `voice_maxgain 10` |
| `speex` | the decoder's output after the gain. Set O: 145,966 of 145,966 samples at `voice_maxgain` 1 and at 10. Set M: 145,840 of 145,840 at 1 and 145,966 of 145,966 at 10 | what a listener hears; what plays for a lost frame |
| `steam_48`, not in TF2 | nothing: there is no game to check it against | everything |
| `miles`, not in TF2 | the codec stage against the old engines' own module, run on signals of our own: every packet equal, decoded samples within one step; and against one sitting of the 2006 engine with a file as the microphone: 143,796 of 145,800 decoded samples equal (measured 2026-11-13) | the profile as the page runs it; the first frames after a long silence; those engines' mixer and output |

What these profiles still carry of the app's earlier model:

- **The frame gate.** A frame over −39.5 dBFS RMS, with 120 ms before and 440 ms after: a fit to the first recordings of Steam voice. It is on by default only on `steam_48` (not in TF2) and can be forced on for the others.
- **Loss in bursts.** Frames are lost in bursts that average 2.2 frames: a fit that the record has withdrawn for the game (finding 8). The order BC-5 replaces it; not built yet.
- **A lost frame as zeros** on `speex` and on `miles`, which is not in TF2 (inferred for Speex from a module with no concealment; guessed for the other).
- **The gain through unsent time.** With the gate on, the gain is held through blocks in which nothing was sent (inferred).

## Rooms

The room arithmetic is the game's as read, in whole numbers. What recordings show (finding 32):

- **The automatic room of one set.** Its main echo is at 57.96 ms in the recording and in the app, with a strength of 0.2335 in the recording and 0.2363 in the app. With that room on, the level of the app against the take is +0.0 dB, where it was +1.2 dB with no room.
- **The street of the two-PC set.** Echoes at 68, 120 and 308 ms are where the rule puts them. Two are within 10% in strength; the one at 68 ms is 36% stronger in the app, which is not explained.
- **Room 6**, with all of the voice through it: every echo of the rule out to 102 ms is in the recording at its delay, and the level by band is within 0.16 dB (Set K).
- **Under water.** The voice is at 0.77 of its level in the recording and 0.76 in the app, with no tremolo in either (Set K).

What differs: nothing is checked sample for sample, the tail's decay was not measured, and rooms that move their echoes at random can only agree in kind. The custom room is the app's own.

## The live monitor

The live monitor runs the same stages on a microphone, piece by piece, and it is checked against a render, not against the game. On `steam` the live chain gives the render's samples exactly, at the mix point and at the output, with loss and jitter included. `speex` and `steam_48` (not in TF2) are held to a render by correlation and level, the two CELT profiles have no comparison of the whole chain, and `miles` (not in TF2) is checked at its packets and its gain. The push-to-talk key is the app's stand-in, not Steam's key rules. [LIVE.md](LIVE.md) has the detail by codec.

## The figures: the app against the owner's takes

These figures are from the orchestrator's private run of 2026-11-12: `node tests/accuracy.mjs --takes <folder>` over all 18 takes of [tests/accuracy.takes.json](../tests/accuracy.takes.json), with the model as it stood at commit `8035cfa`. The row of `listener_B` is from a private run of the same day with main at `9e0abd0`, at other settings (see below); `sender_A` read the same in that run. The suite renders each take's source with the take's settings, lines the take up with the render phrase by phrase, and compares the two where they overlap. Tables of earlier dates are in the record and are not repeated here.

How to read each column:

- **Set** is the group of recordings in the record (A to F).
- **Phrases** is the number of stretches of sound the suite found on the take's timeline.
- **Pieces** is the number of pieces the alignment cut the take into; each has one delay.
- **Delay** is the take's delay against its source, least and greatest over the pieces. The value depends on when the recording was started; the changes within a take are counted in the next two columns.
- **5.8 ms steps** counts changes of delay of 5.8 ms, a class the suite has kept from the first recordings; the engine as read has no such operation (finding 10).
- **Other steps** counts every other change of delay, within a phrase or between two.
- **Clock** is how much faster the take plays than its source, in parts in a million. About 400 is the one sample the game drops from every packet (finding 24), which a render does not drop.
- **Alignment r** is the correlation at which the alignment was found.
- **Level, rms / worst** is the difference in level between take and render in blocks of half a second, after the median offset is removed: its RMS and its largest value, in dB.
- **Level r** is the correlation of the two series of block levels. 1 means the level rises and falls alike.
- **Worst band** is the band from 80 Hz to 12 kHz in which the render's spectrum is furthest from the take's, with the two matched in level at 300 Hz to 3 kHz. Plus means the render is louder there.
- **Clipped** is the share of samples within 5% of the ceiling, in the take and in the render.
- **Offset** is the render's level less the take's in the 300 Hz to 3 kHz bands.

| Take | Set | Phrases | Pieces | Delay, s | 5.8 ms steps | Other steps | Clock, ppm | Alignment r | Level, rms / worst, dB | Level r | Worst band | Clipped %, take / render | Offset, dB |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | ---: |
| `take1_default` | B | 17 | 22 | 4.510 to 4.859 | 2 | 20 | +403 | 0.77 | 1.37 / 12.5 | 0.951 | +2.7 dB at 10 to 11 kHz | 9.4 / 9.8 | +0.0 |
| `take2_voice_scale_0.5` | B | 17 | 24 | 1.670 to 2.022 | 1 | 22 | +404 | 0.76 | 0.27 / 1.6 | 0.995 | +1.0 dB at 11 to 12 kHz | 0.6 / 0.6 | +0.0 |
| `take3_voice_maxgain_1` | B | 17 | 22 | 1.428 to 1.779 | 1 | 21 | +510 | 0.76 | 0.14 / 0.4 | 1.000 | −1.9 dB at 80 to 120 Hz | 0.6 / 0.6 | +0.1 |
| `take3_voice_avggain_0.25` | B | 17 | 26 | 1.777 to 2.118 | 3 | 23 | +403 | 0.77 | 0.86 / 8.7 | 0.980 | +0.9 dB at 11 to 12 kHz | 11.1 / 11.9 | +0.0 |
| `take4_my_own_speech` | B | 10 | 21 | 1.942 to 2.285 | 2 | 18 | +409 | 0.88 | 1.01 / 8.7 | 0.986 | −0.1 dB at 10 to 11 kHz | 7.0 / 7.4 | +0.1 |
| `net_baseline` | C | 13 | 19 | 1.739 to 2.071 | 1 | 17 | +416 | 0.79 | 0.39 / 2.1 | 0.996 | −0.2 dB at 80 to 120 Hz | 1.1 / 1.1 | +0.0 |
| `net_loss5` (random) | C | 13 | 18 | 1.475 to 1.812 | 0 | 17 | +441 | 0.69 | 3.16 / 17.0 | 0.782 | +1.7 dB at 2 to 3 kHz | 0.9 / 1.0 | +0.4 |
| `net_loss15` (random) | C | 13 | 11 | 1.599 to 1.952 | 0 | 10 | +927 | 0.62 | 4.59 / 17.0 | 0.508 | +0.9 dB at 300 to 500 Hz | 0.6 / 0.6 | +0.0 |
| `net_jitter` (random) | C | 13 | 16 | 1.830 to 2.188 | 0 | 15 | +726 | 0.81 | 0.78 / 3.8 | 0.982 | −0.6 dB at 3 to 5 kHz | 1.1 / 1.1 | −0.1 |
| `net_combined` (random) | C | 13 | 15 | 1.866 to 2.630 | 0 | 14 | +2792 | 0.65 | 5.28 / 21.7 | 0.441 | −1.0 dB at 8 to 10 kHz | 0.8 / 0.8 | +0.3 |
| `speech_loss10` (random) | C | 10 | 27 | 1.674 to 2.033 | 1 | 25 | +280 | 0.70 | 5.89 / 25.2 | 0.579 | −0.8 dB at 11 to 12 kHz | 0.9 / 0.9 | +0.4 |
| `sender_A` | D | 17 | 23 | 1.560 to 1.894 | 1 | 22 | +405 | 0.76 | 0.12 / 0.5 | 0.997 | +2.1 dB at 11 to 12 kHz | 7.6 / 9.3 | +0.1 |
| `listener_B` | D | 17 | 20 | 4.792 to 4.946 | 0 | 19 | +403 | 0.78 | 0.41 / 2.0 | 0.959 | +2.4 dB at 11 to 12 kHz | 1.2 / 1.9 | +0.5 |
| `river_artifact` | E | 1 | 1 | −0.596 | 0 | 0 | +403 | 0.85 | 0.20 / 0.7 | 0.989 | +0.5 dB at 80 to 120 Hz | 12.9 / 14.9 | −0.0 |
| `lowtone_default` | F | 19 | 22 | 1.940 to 2.362 | 0 | 21 | +397 | 0.82 | 3.58 / 30.0 | 0.797 | −2.2 dB at 120 to 200 Hz | 14.1 / 16.4 | −0.7 |
| `lowtone_maxgain_1` | F | 19 | 17 | 3.586 to 3.682 | 0 | 16 | +405 | 0.80 | 4.48 / 16.3 | 0.584 | −15.5 dB at 11 to 12 kHz | 0.7 / 0.7 | −2.2 |
| `music_river` | A | 1 | 4 | −51.985 to −51.960 | 0 | 3 | +408 | 0.85 | 0.12 / 0.8 | 0.991 | +0.2 dB at 8 to 10 kHz | 13.7 / 16.2 | +0.0 |
| `music_take_it_off` | A | 1 | 2 | −1.436 to −1.417 | 0 | 1 | +408 | 0.78 | 0.08 / 0.3 | 0.997 | +0.2 dB at 11 to 12 kHz | 12.6 / 18.5 | +0.2 |

How the takes were rendered: every take at `volume 0.15` except `listener_B`, at `volume 0.11` and `voice_scale 0.77`; the Set C takes with the automatic room that set carries, and `sender_A` with its street room; the takes marked "random" with the loss the rule gives for their `net_fakeloss` (21.7%, 49.8% and 37.0% of messages) and the jitter fit at 50 ms.

What the figures say, the weak ones included:

- **The plain takes agree closely in overall level.** For the test signal at changed settings, the speech, the music and the sender's own side, the offset is within about 0.1 to 0.2 dB and the level correlation is 0.98 to 1.00. Block by block they differ by more: 0.08 to 1.01 dB RMS.
- **`take1_default` is weaker**: a level correlation of 0.951, a worst block of 12.5 dB, and +2.7 dB at 10 to 11 kHz. The record puts its largest block differences in the −36 dBFS sine near the game's ambience, in the tails of the hold, and in the 10 to 12 kHz tones that Steam puts into DTX more often than the app (findings 13 and 14).
- **`listener_B`, the second PC's take, is off in overall level: +0.5 dB.** Apart from the two low-tone takes it is the one plain take outside 0.2 dB. Its level correlation is 0.959. Its row is rendered at `volume 0.11` and `voice_scale 0.77`. Both are inferred from the recording (finding 15); neither was read off that PC. At the settings first fitted to its levels, `volume 0.077` and `voice_scale 1`, the row read 0.89 / 2.7, 0.838, +3.2 dB at 11 to 12 kHz, 1.2 / 9.8 and +0.2 dB. What remains is the +0.5 dB overall and +2.4 dB at 11 to 12 kHz. That PC had a room on the voice which the record has not identified, and it is not in the render.
- **The two low-tone takes are the worst plain takes.** `lowtone_default`: −0.7 dB and 0.797, with a worst block of 30.0 dB. `lowtone_maxgain_1`: −2.2 dB, 0.584, and −15.5 dB at 11 to 12 kHz. The record says of them that their comfort-noise plateaus are random in the game and in the app, so they differ block by block, and that the 11 to 12 kHz band of the `voice_maxgain 1` take is the game's ambience against near silence (finding 18). It says no more, and neither does this document.
- **The loss and jitter takes are statistics only.** Their lost messages are other messages than the game's, so the block figures (level correlations of 0.44 to 0.78 with loss) are expected to be poor and measure nothing about the model. The offset column is the usable one: −0.1 to +0.4 dB.
- **The clock column** reads about +400 on the plain takes: the game's one sample a packet, which a render on the file's own timing does not drop (the accuracy suite renders on it, whatever the page's default). Lined up against a render that runs the queue (`opts.timeline` `'game'`), three plain takes read between -39 and +9 over 24 rows (measured, private run of 2026-11-13; [the report](reports/W3-02c2-render-channel.md)). `take3_voice_maxgain_1` reads +510; the record says that one take, at 505 then, had 22.3 packets a second (finding 24), and that this is the take is inferred. The takes with loss or jitter read from +280 to +2792. For the jitter take the record infers skips where a bunch of messages overflows the queue (finding 9; not checked). The loss takes close up after a refused message (finding 8). Neither is checked against these figures.
- **The clipped column** is higher in the render on the two music takes (16.2% against 13.7%, 18.5% against 12.6%). Those takes are MP3 files, and the record shows that MP3 coding lowers this figure (finding 7). On three lossless takes, `sender_A`, `river_artifact` and `lowtone_default`, the render also has 1.7 to 2.3 points more, and that is not explained.

What this table cannot show: whether a phrase starts at the right time (the first item of "What is not exact"), and anything about a profile other than `steam`, since every take here is Steam voice. Every row is against a render on the file's own timing, which `tests/accuracy.mjs` asks for; the page's default render on Steam voice runs the game's queue since W3-02d-1.
