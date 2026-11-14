# The app against the game

This document says how close the app's sound is to the game's, stage by stage, and what each claim rests on. What is not exact comes first. For the game's own rules see [FINDINGS.md](FINDINGS.md), for what each stage of the app does see [VOICE-PATH.md](VOICE-PATH.md), and for the evidence see [tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md), named here by finding number.

Every figure carries its standing: **read**, **measured**, **inferred**, **guessed** or **not built yet**. A "fit" is a number chosen so that the app agrees with a measurement. All measurements are from the owner's PC unless a line says otherwise, and the recordings are private, but for the seven game recordings of Sets H, I, M and O that `tests/recordings/manifest.json` lists, which the checks of [REPRODUCE.md](REPRODUCE.md) run on: only numbers from the others are here.

## What is not exact

Several stages of the modern path equal the game's sound sample for sample. Those stages do not speak for the ones in this list.

- **Which phrases start early.** The page's render on Steam voice runs the game's voice queue by default (**Phrase timing**, at 300 frames a second, since W3-02d-1), and a render shows one draw of the sender's clock. Its other setting, "The file's own timing", keeps every sound where the source has it. The game starts some phrases 80 to 350 ms early after a short pause (measured). The orchestrator's private check of 2026-11-12, on the owner's speech take with its 9 changes from one phrase to the next, gave the figures below. Each share is a mean over many draws of the sender's clock (`tests/retiming.mjs`, 200 seeds unless set otherwise), not a count of the 9:

  | Timing model | Changes it gets right | Error of a phrase's start |
  | --- | --- | --- |
  | a render that runs the game's queue (`opts.timeline` `'game'` at 300 frames a second, the owner's rate; private run of 2026-11-13; the page's render by default; 57% is the mean over 30 seeds, and the page shows one fixed draw of them) | 57% | 99 ms |
  | the game's queue as read, run on a block signal made from the phrases (`voice-channel.js`) | 47% | 122 ms |
  | the earlier queue model | 41% | 100 ms |
  | the flat rule ("Talk-spurt timing"; since W3-02f the engine no longer has it, and `tests/retiming.mjs` scores its own copy) | 31% | 134 ms |
  | no timing model (the page's render on the file's own timing) | 11% | 150 ms |

  On the network signal's take, whose pauses are 240 ms, the render that runs the queue gets 93% of the changes right with a start error of 35 ms (no timing model: 33% and 85 ms). On the sender's take of Set D, whose pauses are 420 and 440 ms, it gets 58% and 82 ms (no timing model: 50% and 83 ms): at that length the take's queue had more often not run out and the render's more often has (measured). The investigation of 2026-11-13 put the cause in the sender's model and not in the queue: until W3-21 its capture steps were cut from the render's first sample, the test signal's bursts ended on those steps, and Steam, whose capture runs free of the source, sent one step more of each burst (inferred from Set D's demo). Since W3-21 the sender's steps take a drawn phase against the source, and the figures above were made before it. Counted again before and after by one script (30 seeds; the seeds in which the render has the take's kind of change, over every change of the take), the network signal's take goes from 291 of 360 to 327, Set D's sender take from 282 of 480 to 290, and the speech take stays at 155 of 270 (measured 2026-11-13; finding 28 of the record). So the phase helps at pauses of 240 ms and closes little at 420 to 440 ms, where the cause is still open. At 66.67 frames a second the same render is no better than no timing model on any of the three, as finding 23 reads. The figures by transition are in [the report](reports/W3-02c2-render-channel.md), "The orchestrator's private runs".

  Part of this cannot be closed. Which pause closes depends on where Steam's reads fell while the talker spoke, and that is not in a recording.
- **The receiver's queue.** Replayed over the game's logged packets, with the mixer's demand taken from the log, the module gives the logged queue on every tick (measured, Set G). When the mixer pulls is therefore not tested. A render runs the module when `opts.timeline` is `'game'`, and the page's render asks for it on Steam voice by default. On the file's own timing, and for a demo's voice (W3-02g, not built yet), a video and the live monitor with its queue's switch off, which keep it, a render has no early starts, does not drop one sample from every packet, and has no fade at the end of the queue.
- **The frame rate is one number.** The page takes one listener's frame rate for the whole render. A real game's rate moves, and one long frame ends the wait at once (read). What that does to a render is guessed.
- **The start and the end.** On the game's queue a sound that opens the channel loses pieces of its first seconds. At 300 frames a second a half-second tone is as long as the source and sounds from 35 ms: the first 12 ms of the source never play, and 32.7 ms more are cut out in four places. A 3 s tone has three cuts in its first 1.4 s, and 60 s of unbroken sound nine, the last at 17.3 s. At 66.67 frames a second there is no cut, and the sound starts 31 ms late (39 ms on speech). These are the page's own draw, which is the same in every page render, measured on the model. Over seeds 1 to 10 a render at 300 frames a second loses 0 to 16.5 ms of the source's head, 11.4 ms in the worst case rendered, and at 66.67 and 100 frames a second up to 56 ms; at those two rates it can lose up to 47 ms of its end (measured on the model; [the W3-02c-2 report](reports/W3-02c2-render-channel.md)). The game's side: at 300 frames a second the ring was full when it started to play in 24 of 28 channels, and each of 16 restarts dropped 55 to 136 ms of what was queued, Steam's pre-roll first and then the onset (measured, Set G's logs, finding 23); the takes show skips of any size after a restart (findings 22 and 23). So the cuts are the game's behaviour as read and as logged; where each piece falls inside the sound is the model's.
- **Long unbroken sound at a low frame rate.** At 66.67 frames a second the level first dips after 0.4 to 3.2 minutes (median 2.2); it is first more than 3 dB down after 2.4 to 4.8 minutes (median 3.7), and from minute 7 two thirds of it is more than 3 dB down. At 100, 144 and 200 frames a second the first dip comes at 2.5 to 4.9 minutes, at 5.1 to 8.0, and at 8.7 to 9.9 in 9 of 20 seeds. At 300 ten minutes of unbroken sound play with no fade and no underrun in 26 seeds, with the cuts to overflow of the first seconds above; the level first dips at 11.6 to 12.0 minutes, past the page's limit. All of this is measured on the model; the rules are read; no take shows it ([the plan's report](reports/W3-02cd-plan.md)).
- **The render's clock on the game's queue.** It runs 0.04% fast. At 300 frames a second it gains about 0.4 ms every second, and the end of ten minutes plays 0.24 to 0.28 s ahead of the source; at 66.67 the gain stops once the queue is empty, at 0.12 to 0.16 s (measured on the model; the takes' +400 parts in a million is measured). So Rendered and Original do not stay in step, and the page says so beside **Hear**.
- **Loss on the game's timeline.** At 15% loss the render at 300 frames a second is silent 16.4% of the time against 10.1% in the one take (measured, private). The check against the game's log (BC-3) is not built yet.
- **Jitter.** On Steam voice on the game's voice queue the jitter setting delays and bunches whole messages as the game's `net_fakelag` and `net_fakejitter` lists do (read), with how often each side looks for packets chosen and the lag taken as twice the jitter (BC-4a; finding 9). The jitter take's events beyond the method's false events are skips, which is what the rule gives (measured). Rendered at Set C's settings over ten seeds (measured, private), the build keeps all of the sound, as the take does; in the bursts it skips as often as the take and about half as much sound; in the noise the take has more skips than the model gives (finding 9). No reading tried closes the two differences (finding 9). On the file's own timing, and so in the live monitor with its queue's switch off, jitter does nothing on Steam voice; with the switch on the monitor runs the same arrivals as a render on the queue. On the other codecs it is still a fit to one recording: single frames marked late, which the game does not make (read).
- **The real-take panel on the game's voice queue.** Since W3-02e the codec lane shows what plays in each 20 ms of a render on the queue and marks each skip, and the panel lines a take up against the render on screen on the queue too. An early start the take and the render share then shows no change of delay; the panel's line "Phrase starts" adds the render's own change back to say which phrases the take starts early. What is not exact in it:
  - The take's phrases come from a 20 ms frame gate, a fit, not from Steam's sender (W3-11's decision; `tests/accuracy.mjs` uses the same gate).
  - A change is early at −80 ms or less and late at +80 ms or more: the limits are chosen (`tests/retiming.mjs`'s).
  - The count of phrase starts was checked on takes made from the model's own renders (measured on the model: the kind of the take's change was right in 176 of 176 changes over eight seeds, the largest error 50 ms, in the planner's run; the page's own check holds it on one more take), and on one recording: on the owner's speech take, with its 9 changes from one phrase to the next, the count of the take's early starts is `tests/retiming.mjs`'s count on both timings, 6 (measured, private, 2026-11-13). Against the render on the queue the two are of one kind at 7 of 9; at the other two the take's change is −100 ms and the render's −69 and −71 ms, either side of the limit.
  - On a take of some length lined up against a render on the queue the take's clock reads near 0 parts in a million in place of about +400, because that render drops the one sample from every packet too (inferred from the rule). On 30 s of short phrases the fit varies by several hundred parts in a million: +579 and −83 for takes made from the model at seeds 1 and 2, at 300 frames a second (measured on the model). The orchestrator's private run of 2026-11-13, on the speech take and the network signal's take without loss, each lined up against a render on the file's own timing and against one on the queue at 300 frames a second, `voice_buffer_ms` 100 (measured, private):

    | Take | Timing | Clock, ppm | Timeline r | Level rms / worst, dB | Level r | Pieces |
    | --- | --- | ---: | ---: | --- | ---: | ---: |
    | Speech | the file's own | +408 | 0.88 | 0.99 / 8.7 | 0.987 | 21 |
    | Speech | the game's queue | +5 | 0.95 | 1.74 / 16.0 | 0.975 | 24 |
    | Network | the file's own | +413 | 0.79 | 0.39 / 2.1 | 0.996 | 19 |
    | Network | the game's queue | +0 | 0.86 | 0.24 / 1.2 | 0.998 | 22 |

    On the speech take the level matches 0.75 dB worse against the render on the queue. The likely cause is that the render's draw of early phrase starts differs from the take's at some phrases (inferred, not measured).
- **Loss.** Which messages are lost is random in the game and in the app, so a take with loss can be compared only by its statistics. One take with loss, lag and jitter together has more silence than the rule gives (measured: 10.3% against 4.0%), and the record now explains it: it is the queue's restarts under loss (6.6% silent on the game's voice queue without jitter, 8.0 to 8.8% with it, against 3.8% on the file's own timing; measured over ten seeds, finding 8). Real internet loss was not recorded.
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

- **What the app runs.** Loss takes whole messages, each by a draw of its own (read). Jitter, on the game's voice queue, is the tick each message reaches the queue: through the game's two lists, client to server and server to client, with the lag twice the jitter and the least delay taken out (BC-4a; the lists' rule read, how often they are looked at chosen, finding 9). At jitter 50 and 300 frames a second a phrase starts about 60 ms later than at jitter 0 (20 to 103 ms) and comes back toward its place as skips take the lateness out (39 ms later after 5.5 s); at 66.67 each phrase is late by its first packet's own delay (35 to 194 ms), so the pauses between phrases move (measured on the model). On the file's own timing jitter does nothing on Steam voice.
- **How it was checked.** Loss by statistics on the noise parts of two takes: 3.12 runs of lost sound a second in the take against 3.20 by the rule at `net_fakeloss 5`, and 3.90 against 4.31 at 15 (finding 8). Jitter: the take's events beyond the method's false events are skips (measured). On the build at Set C's settings (ten seeds, measured, private) all the sound is present, as in the take; in the bursts the extra skips of 10 ms or more, +0.46 a second at the photographs' frame rates, agree with the take's +0.58, and the sound they skip is about half the take's; in the noise the take's two skips are more than the model gives (a chance of 0.016 to 0.035; finding 9). The tests hold the arrival model to a second model written from the order's words, tick for tick, and the render to the queue fed those ticks.
- **What differs.** How often each list is looked at is chosen, and that the next packet leaves in the same look is inferred; the game's own log of a jitter run (block 2 of the run sheet) would show both. One packet a tick on each crossing is inferred, and Set C's photographs show 59 packets a second with lag on, not 67 (read off them; not explained).
- **Not built yet.** A lag that changes (a spike), which would hold packets back and then let them out in a bunch.

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

- **What the app runs.** A render asked with `opts.timeline` `'game'` runs the module `voice-channel.js` at the frame rate and `voice_buffer_ms` it is given. The page's render on Steam voice asks for it by default (**Phrase timing**, `fps_max` 300, `voice_buffer_ms` 100). On "The file's own timing", and for a demo's voice, a video and the live monitor with its queue's switch off, each message's sound is laid on the source's timeline. With the switch on, on Steam voice with the codec on, the live monitor runs the module at the page's frame rate and `voice_buffer_ms`, whatever Phrase timing says (W3-02c-3). The flat rule "Talk-spurt timing", a fit (finding 19), is no longer offered by the page.
- **How it was checked.** The module, replayed over the game's logged packets with the mixer's demand taken from the log, gives the logged queue on every tick (Set G, finding 22). A render that runs it equals a reference built from the module sample for sample (the suite `render-channel`). Against three takes (private run of 2026-11-13): the takes' clock is gone, the 240 ms pauses of the network signal move as the take's do in 26 to 30 of 30 seeds at 300 frames a second and in none at 66.67, and the 420 and 440 ms pauses of Set D's signal move less often than the take's.
- **What differs.** See "What is not exact". In a render that runs the queue at 300 frames a second, a channel that opens drops 82 to 173 ms to overflow (116 in the mean) where the game's log gave 55 to 136 (104 in the mean, finding 23); whether that is why its queue runs out at the 440 ms pauses is not known.
- **Not built yet.** The queue for a demo (W3-02g). *(Corrected 2026-11-14: the queue in the live monitor, W3-02c-3, was built behind a switch that is off on every load.)* *(Corrected 2026-11-13: the page's automatic render again of a source longer than 60 s, W3-02d-2, was built and merged that day.)*

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
- **The street of the two-PC set.** Echoes at 68, 120 and 308 ms are where the rule puts them. Measured on the stretches of sound both pick, with the take lined up on the render's timeline (2026-11-14, private), over nine seeds of the room: at 68 ms the render reads 0.0279 to 0.0300 against the take's 0.0257, 9 to 17% high (0.9 to 1.8 times the take's scatter of 0.0024); at 120 ms 0.0115 to 0.0138 against 0.0141; at 308 ms 0.0071 to 0.0098 against 0.0056. *Corrected 2026-11-14: the "36% stronger at 68 ms, not explained" this line gave came from a run that took each file's own stretches (36.0 and 33.0 s) and the take as recorded.*
- **Room 6**, with all of the voice through it: every echo of the rule out to 102 ms is in the recording at its delay, and the level by band is within 0.16 dB (Set K).
- **Under water.** The voice is at 0.77 of its level in the recording and 0.76 in the app, with no tremolo in either (Set K).

What differs: nothing is checked sample for sample, the tail's decay was not measured, and rooms that move their echoes at random can only agree in kind. The custom room is the app's own.

## The live monitor

The live monitor runs the same stages on a microphone, piece by piece, and it is checked against a render, not against the game. On `steam` the live chain gives the render's samples exactly, at the mix point and at the output, with loss included. With the switch **Live monitor: the game's voice queue** on (off on every load) it gives at the mix point the samples of a render on the game's voice queue with the same settings, jitter included (W3-02c-3); with the switch off jitter does nothing there on Steam voice, since the monitor keeps the file's own timing (BC-4a). The queue adds 101.6 ms to the monitor's delay at 66.67 frames a second and 357.0 ms at 300 (read), and what a listener hears on it (the openings at a high frame rate, long unbroken sound at a low one) is in [LIVE.md](LIVE.md), measured on the model and in no recording. `speex` and `steam_48` (not in TF2) are held to a render by correlation and level, the two CELT profiles have no comparison of the whole chain, and `miles` (not in TF2) is checked at its packets and its gain. The push-to-talk key is the app's stand-in, not Steam's key rules. [LIVE.md](LIVE.md) has the detail by codec.

## The figures: the app against the owner's takes

These figures are from the orchestrator's private run of 2026-11-14 over nine seeds: `node tests/accuracy.mjs --takes <folder> --seeds 9` over all 18 takes of [tests/accuracy.takes.json](../tests/accuracy.takes.json), on order AC-02's branch at `3877087`, whose figures the merged suite gives alike but for the worst band, which the orchestrator took from each seed's result by size as the merged suite does. The suite renders each take as the page does by default (since AC-01), Steam voice on the game's voice queue, at the default seed and at seeds 1 to 8, since a render draws what no recording shows (the sender's clock and phase, and with them where the queue's skips and early starts fall; the room's random taps; which messages a loss takes). Each figure is the median over the nine, with the least and the most in brackets; phrases, pieces, the delay, the steps and the clipped share are medians only. It renders each take's source with the take's settings, lines the take up with the render phrase by phrase, and compares the two where they overlap. Tables of earlier dates are in the record and are not repeated here; the one-draw tables of the file's own timing and of the queue are compared below.

How to read each column:

- **Set** is the group of recordings in the record (A to F).
- **Phrases** is the number of stretches of sound the suite found on the take's timeline.
- **Pieces** is the number of pieces the alignment cut the take into; each has one delay.
- **Delay** is the take's delay against its source, least and greatest over the pieces. The value depends on when the recording was started; the changes within a take are counted in the next two columns.
- **5.8 ms steps** counts changes of delay of 5.8 ms, a class the suite has kept from the first recordings; the engine as read has no such operation (finding 10).
- **Other steps** counts every other change of delay, within a phrase or between two. Since AC-01 (2026-11-14) the pieces and both kinds of step are counted against a render that has the game's voice queue's steps.
- **Clock** is how much faster the take plays than its source, in parts in a million. About 400 is the one sample the game drops from every packet (finding 24), which a render on the file's own timing does not drop. Since AC-01 (2026-11-14) the suite renders Steam voice on the game's voice queue, where the take's dropped sample per packet and the queue's skips are in the render too, so on the takes without random loss the clock reads within 7 ppm of 0 on all but one (measured, 2026-11-14).
- **Alignment r** is the correlation at which the alignment was found.
- **Level, rms / worst** is the difference in level between take and render in blocks of half a second, after the median offset is removed: its RMS and its largest value, in dB.
- **Level r** is the correlation of the two series of block levels. 1 means the level rises and falls alike.
- **Worst band** is the band from 80 Hz to 12 kHz in which the render's spectrum is furthest from the take's, with the two matched in level at 300 Hz to 3 kHz. Plus means the render is louder there.
- **Clipped** is the share of samples within 5% of the ceiling, in the take and in the render.
- **Offset** is the render's level less the take's in the 300 Hz to 3 kHz bands.
- **Over several seeds:** when the table comes from a run with `--seeds` (AC-02, 2026-11-14), each figure is the median over the seeds, with its range after it for the clock, the alignment r, the level and the offset.

| Take | Set | Phrases | Pieces | Delay, s | 5.8 ms steps | Other steps | Clock, ppm | Alignment r | Level, rms / worst, dB | Level r | Worst band | Clipped %, take / render | Offset, dB |
| --- | --- | ---: | ---: | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |
| `take1_default` | B | 17 | 25 | 4.514 to 5.161 | 2 | 24 | +2 [−157 to +10] | 0.87 [0.85 to 0.89] | 1.47 [1.23 to 1.91] / 12.6 [11.8 to 15.7] | 0.938 [0.907 to 0.959] | +3.2 dB at 10 to 11 kHz | 9.4 / 9.7 | +0.0 [−0.0 to +0.0] |
| `take2_voice_scale_0.5` | B | 17 | 27 | 1.663 to 2.335 | 1 | 24 | +2 [−202 to +5] | 0.84 [0.82 to 0.86] | 0.64 [0.28 to 1.78] / 6.2 [2.0 to 16.8] | 0.968 [0.860 to 0.994] | +0.7 dB at 11 to 12 kHz | 0.6 / 0.6 | +0.0 [−0.0 to +0.0] |
| `take3_voice_maxgain_1` | B | 17 | 24 | 1.494 to 2.102 | 2 | 22 | +5 [−6 to +74] | 0.86 [0.84 to 0.87] | 0.15 [0.11 to 0.19] / 0.6 [0.3 to 0.8] | 1.000 [0.999 to 1.000] | −1.9 dB at 80 to 120 Hz | 0.6 / 0.6 | −0.0 [−0.0 to +0.0] |
| `take3_voice_avggain_0.25` | B | 17 | 26 | 1.786 to 2.433 | 1 | 23 | +3 [+1 to +10] | 0.86 [0.84 to 0.87] | 1.09 [0.50 to 2.03] / 11.5 [3.3 to 14.7] | 0.970 [0.916 to 0.994] | +0.8 dB at 11 to 12 kHz | 11.1 / 11.8 | +0.0 [−0.0 to +0.0] |
| `take4_my_own_speech` | B | 10 | 24 | 1.982 to 2.383 | 1 | 23 | +5 [+4 to +7] | 0.94 [0.93 to 0.95] | 2.28 [0.18 to 3.07] / 25.3 [1.5 to 37.8] | 0.962 [0.892 to 0.998] | −0.2 dB at 10 to 11 kHz | 7.0 / 7.3 | +0.0 [−0.0 to +0.1] |
| `net_baseline` | C | 13 | 21 | 1.933 to 2.078 | 1 | 19 | +1 [−9 to +8] | 0.86 [0.84 to 0.88] | 0.38 [0.24 to 2.18] / 2.2 [1.2 to 21.1] | 0.996 [0.884 to 0.998] | −0.2 dB at 80 to 120 Hz | 1.1 / 1.1 | +0.0 [−0.0 to +0.0] |
| `net_loss5` (random) | C | 13 | 20 | 1.615 to 2.291 | 1 | 18 | −48 [−91 to +157] | 0.72 [0.71 to 0.73] | 3.65 [2.27 to 4.20] / 19.3 [11.8 to 22.6] | 0.730 [0.703 to 0.855] | +1.4 dB at 2 to 3 kHz | 0.9 / 1.0 | +0.1 [−0.2 to +0.4] |
| `net_loss15` (random) | C | 13 | 10 | 1.598 to 2.129 | 0 | 9 | −186 [−622 to +525] | 0.62 [0.57 to 0.65] | 6.37 [5.07 to 6.76] / 17.9 [16.2 to 27.5] | 0.403 [0.352 to 0.656] | −1.9 dB at 3 to 5 kHz | 0.7 / 0.7 | +0.2 [−1.3 to +0.8] |
| `net_jitter` (random) | C | 13 | 18 | 2.057 to 2.197 | 1 | 17 | +18 [−222 to +55] | 0.87 [0.86 to 0.88] | 0.62 [0.38 to 0.92] / 3.4 [1.4 to 6.6] | 0.989 [0.977 to 0.996] | +0.2 dB at 300 to 500 Hz | 1.1 / 1.1 | +0.0 [−0.0 to +0.0] |
| `net_combined` (random) | C | 13 | 17 | 1.933 to 2.481 | 0 | 16 | −1053 [−5279 to +1161] | 0.66 [0.65 to 0.69] | 5.51 [4.41 to 6.11] / 21.2 [16.8 to 23.9] | 0.537 [0.503 to 0.619] | −1.6 dB at 500 to 1000 Hz | 0.8 / 0.8 | −0.3 [−0.8 to +0.6] |
| `speech_loss10` (random) | C | 10 | 24 | 1.705 to 2.349 | 0 | 22 | −86 [−103 to −14] | 0.72 [0.70 to 0.72] | 7.14 [5.66 to 7.96] / 27.2 [23.6 to 31.1] | 0.394 [0.217 to 0.563] | −0.9 dB at 3 to 5 kHz | 0.9 / 0.9 | +0.1 [−0.0 to +0.4] |
| `sender_A` | D | 17 | 26 | 1.560 to 2.208 | 1 | 25 | +1 [−3 to +5] | 0.86 [0.84 to 0.89] | 0.80 [0.10 to 1.10] / 9.5 [0.4 to 11.2] | 0.917 [0.861 to 0.998] | +2.1 dB at 11 to 12 kHz | 7.6 / 9.0 | +0.0 [+0.0 to +0.1] |
| `listener_B` | D | 17 | 24 | 4.786 to 5.215 | 0 | 22 | +1 [−10 to +7] | 0.88 [0.86 to 0.89] | 0.42 [0.37 to 0.47] / 2.5 [2.1 to 2.9] | 0.957 [0.944 to 0.968] | +2.3 dB at 11 to 12 kHz | 1.2 / 1.8 | +0.4 [+0.4 to +0.5] |
| `river_artifact` | E | 1 | 2 | −0.579 to −0.576 | 0 | 0 | +0 [−383 to +5] | 0.88 [0.84 to 0.91] | 0.24 [0.14 to 0.40] / 0.8 [0.3 to 1.2] | 0.987 [0.977 to 0.994] | +0.6 dB at 80 to 120 Hz | 12.9 / 14.9 | −0.0 [−0.1 to +0.0] |
| `lowtone_default` | F | 19 | 25 | 1.634 to 2.116 | 2 | 23 | −4 [−314 to +60] | 0.81 [0.77 to 0.86] | 3.82 [3.43 to 4.44] / 29.0 [17.3 to 29.7] | 0.811 [0.736 to 0.840] | −1.5 dB at 120 to 200 Hz | 14.1 / 16.4 | −0.8 [−1.1 to +0.1] |
| `lowtone_maxgain_1` | F | 19 | 19 | 3.629 to 3.737 | 1 | 17 | +25 [−40 to +2331] | 0.81 [0.78 to 0.83] | 4.43 [3.51 to 6.01] / 12.9 [10.5 to 19.1] | 0.501 [0.461 to 0.637] | −10.6 dB at 11 to 12 kHz | 0.7 / 0.7 | −2.3 [−3.0 to −0.1] |
| `music_river` | A | 1 | 3 | −51.930 to −51.920 | 0 | 2 | +2 [−0 to +3] | 0.95 [0.94 to 0.95] | 0.11 [0.08 to 0.25] / 0.6 [0.5 to 2.5] | 0.992 [0.961 to 0.995] | −0.2 dB at 3 to 5 kHz | 13.7 / 16.2 | +0.1 [+0.0 to +0.1] |
| `music_take_it_off` | A | 1 | 3 | −1.398 to −1.394 | 0 | 2 | +2 [−0 to +5] | 0.93 [0.92 to 0.94] | 0.07 [0.06 to 0.09] / 0.3 [0.2 to 0.4] | 0.998 [0.996 to 0.998] | +0.2 dB at 11 to 12 kHz | 12.6 / 18.3 | +0.1 [+0.0 to +0.1] |

**Over nine seeds** (measured, 2026-11-14). How far a row moves from draw to draw is as large as most of what is left between take and render:
- `take4_my_own_speech` reads 2.28 dB in the median and 0.18 to 3.07 over the nine draws, with a worst block of 1.5 to 37.8 dB.
- `sender_A` reads 0.80 in the median and 0.10 to 1.10; the default seed's 0.10 is the least of the nine.
- `net_baseline` reads 0.38, and 0.24 to 2.18.
- On `take3_voice_avggain_0.25` the default seed's 2.03 is the most of the nine; the median is 1.09.

So the default seed is not the best draw on every take, nor the worst. The model against itself gives a floor for these figures. AC-02's builder took a take that is the suite's own render at the default seed and measured it at three other seeds: it read 0.27 to 0.80 dB on the network test signal (measured). A take cannot be expected to read under the spread of the model's own draws.

The clock column's median is within 5 ppm of 0 on every take without random loss but `lowtone_maxgain_1` (+25). Single draws read far off on some takes: −157 to −383 ppm on `take1_default`, `take2_voice_scale_0.5` and `river_artifact`, and +2331 on `lowtone_maxgain_1`. On those draws the line-up fits a clock to that draw's skips (inferred).

### Against the file's own timing (2026-11-14)

Measured privately (the takes stay private): every take through the suite at `main` `2548bbe` as it stood (the file's
own timing) and on AC-01's suite (the game's voice queue; `music_take_it_off` with the cut of both columns at
[70, 163.6] s). The rows with random loss are statistics only and are left out, but for the jitter take.

| Take | Clock, ppm: file's own / queue | Timeline r: file's own / queue | Level rms / worst, dB: file's own / queue |
| --- | --- | --- | --- |
| `take1_default` | +405 / −3 | 0.77 / 0.88 | 1.41 / 12.6 · 1.47 / 12.7 |
| `take2_voice_scale_0.5` | +404 / +5 | 0.75 / 0.86 | 0.28 / 1.7 · 0.49 / 3.0 |
| `take3_voice_maxgain_1` | +499 / −4 | 0.76 / 0.84 | 0.14 / 0.5 · 0.16 / 0.8 |
| `take3_voice_avggain_0.25` | +404 / +1 | 0.77 / 0.86 | 1.36 / 13.3 · 2.03 / 14.7 |
| `take4_my_own_speech` | +408 / +5 | 0.88 / 0.95 | 0.99 / 8.7 · 1.74 / 16.0 |
| `net_baseline` | +413 / +0 | 0.79 / 0.86 | 0.39 / 2.1 · 0.24 / 1.2 |
| `net_jitter` (random) | +726 / +18 | 0.81 / 0.87 | 0.62 / 3.8 · 0.54 / 2.9 |
| `sender_A` | +407 / +4 | 0.76 / 0.86 | 0.12 / 0.5 · 0.10 / 0.4 |
| `listener_B` | +403 / +7 | 0.78 / 0.88 | 0.41 / 2.2 · 0.42 / 2.2 |
| `river_artifact` | +404 / +0 | 0.85 / 0.86 | 0.14 / 0.4 · 0.15 / 0.3 |
| `lowtone_default` | +402 / −4 | 0.82 / 0.83 | 4.08 / 29.4 · 4.08 / 29.0 |
| `lowtone_maxgain_1` | +401 / +35 | 0.80 / 0.78 | 4.94 / 14.7 · 5.20 / 19.1 |
| `music_river` | +408 / +2 | 0.85 / 0.95 | 0.16 / 1.1 · 0.14 / 0.9 |
| `music_take_it_off` | +408 / +2 | 0.78 / 0.92 | 0.07 / 0.2 · 0.07 / 0.2 |

**What it shows** (measured). On the game's queue the clock reads within 7 ppm of 0 on every take without random loss
but `lowtone_maxgain_1` (+35), against +401 to +499 on the file's own timing: the clock the suite read on the takes was
the queue's dropped samples and skips, not a clock. The timeline's correlation rises on 13 of these 14 takes and falls
on `lowtone_maxgain_1` (0.80 against 0.78). The jitter take, rendered with its jitter as arrival times through the
queue (BC-4), reads closer to its take than the render without jitter did.

The short-term level's rms is worse on the queue by more than 0.1 dB on four takes (`take2_voice_scale_0.5`,
`take3_voice_avggain_0.25`, `take4_my_own_speech`, `lowtone_maxgain_1`). The orchestrator looked at two of them, and
at `take1_default`, `sender_A` and `music_take_it_off`, privately on 2026-11-14 (measured):

- **`music_take_it_off`**: its cut ran to 170.76 s, past the recording's voice key released at 163.75 s and a short
  second piece to 166.9 s, while the source plays on. On the queue the line-up ran 2 s into that piece. With the cut
  at 163.6 s (AC-01) it reads as above on both timings, where it read 2.14 / 24.0 dB on the queue.
- **`take3_voice_avggain_0.25`**: on the queue the line-up places the first 30 s half a second off (+1599 and
  +1574 ms against +2069 to +2116 for the rest), on the test signal's repeated bursts; on the file's own timing two
  pieces of 2 s are off the same way. `take1_default` has two such pieces on each timing. The largest blocks of the
  level are there. That is the line-up, not the render.
- **`take4_my_own_speech`**: the queue's worst blocks are three phrase ends where the take sits at −46 to −57 dBFS,
  the game's ambience (the take reads the same before the first phrase and after the last, where the render is
  digital silence), against the render's codec noise and then silence. Which of those blocks pass the level's rule
  (both above −70 dBFS, the render 10 dB over the take's floor) moves with where the half-second grid falls.
- **`sender_A` and the seed**: the level reads 0.12 / 0.5 dB at the default seed and 0.74 to 0.88 / 8.7 to 10.4 at
  seeds 1 to 8. One block at 108.5 s makes it, where the seed's draw in the sender moves a sound between two
  half-second blocks; the room has no part in it (without the room, seeds 1 and 2 read the same). The rows here are
  each one draw, at the default seed. *This was found on the file's own timing; on the queue the draws also place
  the skips and early starts (inferred).*

So the level figures of the plain takes measure the line-up, the ambience and one draw of the sender as well as the
model; the clock and the timeline say the queue is the better account of when sound is played.

How the takes were rendered: every take at `volume 0.15` except `listener_B`, at `volume 0.11` and `voice_scale 0.77`; the Set C takes with the automatic room that set carries, and `sender_A` with its street room; the takes marked "random" with the loss the rule gives for their `net_fakeloss` (21.7%, 49.8% and 37.0% of messages) and the jitter take and the combined take with their 50 ms as arrival times through the queue (BC-4). With loss or jitter on the queue the render is lined up on the source as the take is, and the two are compared where both cover (AC-01's review: the render keeps a timeline of its own there). Since AC-01 (2026-11-14) the suite renders every Steam take on the game's voice queue, as the page does by default: at 300 frames a second and `voice_buffer_ms` 100 (the game's defaults, read), and Set C's `net_baseline` at 295 frames a second and `net_jitter` and `net_combined` at 336, the rates read off that set's `net_graph` photographs.

What the figures say, the weak ones included:

- **The plain takes agree closely in overall level.** For the test signal at changed settings, the speech, the music and the sender's own side, the offset is within 0.1 dB in the median and the level correlation is 0.917 to 1.000. Block by block they differ by more: 0.07 to 2.28 dB RMS in the median. That is about the spread of the model's own draws, and what the larger blocks measure is in the section "Against the file's own timing" above.
- **`take1_default` is weaker**: a level correlation of 0.938 (0.907 to 0.959), a worst block of 12.6 dB, and +3.2 dB at 10 to 11 kHz. The record puts its largest block differences in the −36 dBFS sine near the game's ambience, in the tails of the hold, and in the 10 to 12 kHz tones that Steam puts into DTX more often than the app (findings 13 and 14).
- **`listener_B`, the second PC's take, is off in overall level: +0.4 dB (+0.4 to +0.5 over nine draws).** Apart from the two low-tone takes it is the one plain take outside 0.1 dB. Its level correlation is 0.957. Its row is rendered at `volume 0.11` and `voice_scale 0.77`. Both are inferred from the recording (finding 15); neither was read off that PC. At the settings first fitted to its levels, `volume 0.077` and `voice_scale 1`, the row read 0.89 / 2.7, 0.838, +3.2 dB at 11 to 12 kHz, 1.2 / 9.8 and +0.2 dB. What remains is the +0.4 dB overall and +2.3 dB at 11 to 12 kHz (+0.5 and +2.4 on the file's own timing). That PC had a room on the voice which the record has not identified, and it is not in the render.
- **The two low-tone takes are the worst plain takes.** `lowtone_default`: −0.8 dB and 0.811, with a worst block of 29.0 dB. `lowtone_maxgain_1`: −2.3 dB, 0.501, and −10.6 dB at 11 to 12 kHz. The record says of them that their comfort-noise plateaus are random in the game and in the app, so they differ block by block, and that the 11 to 12 kHz band of the `voice_maxgain 1` take is the game's ambience against near silence (finding 18). It says no more, and neither does this document.
- **The loss and jitter takes are statistics only.** Their lost messages are other messages than the game's, so the block figures (level correlations of 0.39 to 0.73 in the median with loss) are expected to be poor and measure nothing about the model. The offset column is the usable one: −0.3 to +0.2 dB in the median, −1.3 to +0.8 over the draws. `speech_loss10`, whose +0.5 dB after BC-1 stood open, reads +0.1 in the median and −0.0 to +0.4 over the nine draws. The jitter take without loss reads 0.62 dB (0.38 to 0.92) and 0.989.
- **The clock column** reads within 5 ppm of 0 in the median on the takes without random loss but `lowtone_maxgain_1` (+25). On the queue the game's one sample a packet and the queue's skips are in the render too (finding 24). On the file's own timing it read about +400 on the same takes, and +499 on `take3_voice_maxgain_1`, the take of 22.3 packets a second (finding 24); the section "Against the file's own timing" above has both. The takes with loss read from −1053 to −48 in the median. For the jitter take the record measured its events as skips, where a bunch of messages overflows the queue (finding 9), and on the queue it reads +18. The loss takes close up after a refused message (finding 8). Neither is checked against these figures.
- **The clipped column** is higher in the render on the two music takes (16.2% against 13.7%, 18.3% against 12.6%). Those takes are MP3 files, and the record shows that MP3 coding lowers this figure (finding 7). On three lossless takes, `sender_A`, `river_artifact` and `lowtone_default`, the render also has 1.4 to 2.3 points more, and that is not explained.

What this table cannot show: whether a phrase starts at the right time (the first item of "What is not exact"), and anything about a profile other than `steam`, since every take here is Steam voice. Every row is against a render on the game's voice queue, the page's default on Steam voice since W3-02d-1 and the suite's since AC-01; where a render's skips and early starts fall is a draw of the sender's clock, which no recording shows, so each row is given over nine draws.
