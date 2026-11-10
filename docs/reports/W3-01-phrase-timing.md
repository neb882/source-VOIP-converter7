# W3-01: when phrases start

An investigation, 2026-11-10. No app code changed. `tests/retiming.mjs` gained a `--generative` mode; its output
without that flag is byte for byte what it was (checked against the baseline log of the same morning).

## The answer

**Yes: `voice_retime` should run the receiver's queue model in place of the flat 41% rule, and stay an option.**
The build order is `docs/work-orders/W3-02-queue-retime.md`. It should start after W3-03's report (the receiver read
from the owner's own engine binary) has been put beside this one, because three of the constants below are fitted,
not understood.

What the evidence supports, and where it stops:

- **The mechanism is right, to the millisecond where it can be checked.** In Set D, two appended spurts start
  63.4 ms after the end of the spurt before them, measured in the recording itself (the silence record is 62.5 ms;
  the rest is the 400 ppm of every take).
- **Given where the queue stands, the queue model predicts the held-out takes far better than the flat rule**:
  -9.7 against -20.0 (log-likelihood over the 21 transitions of the speech take and the Set C baseline, every
  parameter fixed from other takes). Made-up takes in which the flat rule is the truth never favour the queue model
  by that much (0 of 2000).
- **From the source alone it is a modest gain on speech and none on test signals.** With the fixed parameters a
  render gets 41% of the speech take's transitions right (flat rule 31%, no re-timing 11%) and puts a spurt's start
  100 ms from where the game put it on average (flat rule 134, no re-timing 150). It reproduces the take's whole
  pattern in none of 4000 seeds. On the Set C baseline and the test-signal takes, both models place spurts worse
  than leaving them alone.
- **The limit is not the queue rule but the silence that goes into it.** On speech, the game's silences between
  spurts are about 50 ms longer than the gate model plus Set D's hold and pre-roll say (about 90 ms on the Set C
  noise bursts). With that one number added after the fact, the same model gets 61 to 71% of the speech transitions
  right and a start error of 56 to 81 ms. That number is fitted to the takes it is scored on, so it is not in the
  build order; the first take proposed below measures it.
- **Two things at phrase starts that neither model has** were found on the way: a spurt that restarts plays 25 to
  50 ms late at first and the receiver skips that much audio within its first half second (all 7 restarts tracked
  finely, none of 12 appended spurts); and a pause of 0.43 to 0.56 s inside what the gate model calls one spurt can
  push the following speech later by up to 69 ms.

## How to re-run

`R` is the accuracy suite's JSON for the 16 takes of Sets B to F, `T` the folder of takes, `D` the Set D demo.

```sh
node tests/accuracy.mjs --takes T --json R                       # about 5 minutes, launches a browser
node tests/retiming.mjs --accuracy R --demo D                    # as before: transitions, Set D, prequential scores
node tests/retiming.mjs --accuracy R --generative --takes T      # sections 1 to 3 below (3 s)
node tests/retiming.mjs --accuracy R --generative --takes T --shift 30   # the exploration, not the fixed model
```

I did not re-run the accuracy suite: every number here comes from the baseline `results.json` made on main at
`c3bfd0a` the same day. The measurements made on the audio itself (the silence played between spurts, the skips, the
steps at pauses) were made with scratch scripts on the takes decoded to 16 kHz; they are not in the repository, and
"What was measured outside the repository" says how each was done, closely enough to redo.

## The rule as fitted, stated plainly

So that it can be laid beside the engine's code (W3-03). Times are in ms. `l` is the voice the receiver holds ahead
of playback when a spurt's first packet arrives, measured from the smallest delay the take reaches.

1. **Restart.** A spurt whose first packet arrives after the queue has run out plays at delay base + L0.
   **L0 = 350** (fitted; 330 to 375 across the owner's sessions on PC A; lower on PC B).
2. **Silence record.** After each end of transmission the queue gets a silence record of **62.5** (1500 samples at
   24 kHz; 31.25 in 2 of the demo's 19).
3. **Append.** A spurt whose first packet arrives `g` after the end of the previous spurt's packets (in the
   stream's own time: first-packet arrival to first-packet arrival, less the previous spurt's length) is appended if
   `l + 62.5 - g > 0`. It then plays 62.5 after the previous spurt's last sample, so its delay changes by
   `62.5 - g` and `l` becomes `l + 62.5 - g`. Otherwise rule 1.
4. **Ceiling.** `l` does not stay above L0: what an append adds beyond it is skipped again within a few seconds.
5. **`g` from the source.** `g` = the gate model's silence + (440 - hold) + (120 - pre-roll), with Steam's hold
   uniform in 425 to 485 and its pre-roll uniform in 115 to 152 (finding 12, from the Set D demo). Mean offset
   -28.5.
6. **Spurts the gate model merges.** A pause between loud frames longer than Steam's hold but shorter than 560
   ends one spurt and starts the next with no audio left out between them (`g` = 0, or the few ms the pause exceeds
   hold + pre-roll), so rule 3 adds up to 62.5 to the delay, subject to rule 4.

Not in the fitted rule, but measured: the restart overshoot and its skips, and the 0.4 ms per second by which
playback runs ahead of the source ("What the speech take shows", below).

## 1. A generative model from what the render knows

### (a) When a spurt's first packet arrives

The order suggested network batching as the source of the spread between identical silences. The measurements say
it is mostly the sender's gate:

- **Set D's packets.** `node tests/retiming.mjs --accuracy R --demo D` prints the gate model's silences (the
  `sender_A` row of "Transitions") and the arrival gaps (the "Set D" block). For the eight 440 ms silences the
  arrival gaps are 380, 460, 380, 400, 440, 380, 380, 460: arrival minus gate silence is -60 to +20, mean -30, at
  the demo's 60 ms resolution.
- **Finding 12's ranges give the same.** Steam's hold is 425 to 485 ms and its pre-roll 115 to 152 ms, against the
  gate model's 440 and 120. Their sum decides the silence: the offset is -77 to +20, mean -28.5.
- **The early starts' own sizes.** By rule 3 an early start of `c` ms means `g = c + 62.5`. The eleven early starts
  at the test signal's 440 and 420 ms silences (four Set B takes and sender A; the "Transitions" block) give `g`
  of 369 to 413: 27 to 71 below the gate silence, all inside the range above.
- **The share that start early.** With L0 = 350, rule 5 makes 52% of 440 ms silences append from a full queue
  (1e6 draws of rule 5). The five takes show about 12 of 32 (38%); finding 19 counted 21 of 51 (41%) over more
  takes. The difference is within what 32 coin flips allow, but it leans the same way as the next point.
- **It does not carry over to speech or to quieter noise.** The same reading of the held-out takes gives `g` minus
  gate silence of +46, -40, +4, +50, +40, +27 (speech; mean +21) and +32 to +101 (the Set C baseline's four early
  starts). So there Steam's silences are 50 to 90 ms longer than rule 5 says. Both signals sit nearer the gate's
  threshold than the test signal's bursts (-30 dBFS noise; speech that trails off). I could not tell whether Steam's
  gate ends those spurts sooner than a 20 ms RMS threshold does, or whether the receiver takes a spurt that arrives
  just after its queue ran out without the restart delay; the first take below decides between them.

What it rests on: one demo of one session for the ranges; 11 early starts for the check; nothing yet for speech.

### (b) L0

- **Lower bounds** from the largest early start in a session (rule 3 needs `L0 > g - 62.5`): 331, 350, 343 and
  330 ms in the four Set B test-signal takes, 335 for sender A, 327 in the speech take (whose deepest point is
  331 ms below its restart level).
- **Upper bounds:** sender A's packets allow at most 375 (`retiming.mjs`: "every observable transition reproduced
  for L0 320-375 ms"); in the speech take a spurt restarted after a 120 ms silence from a queue 309 ms below the
  restart level, which needs L0 under about 366 give or take the gate's error.
- **Default 350, spread about ±25** on the owner's PC A. Listener B's PC shows no appended spurt at the same
  packets, which needs L0 under about 280 there. So it differs by machine.
- **A control?** Not yet. It is not `voice_buffer_ms` (100) as it stands, and what sets it is unknown; a slider
  with a number nobody can look up in the game is a guess presented as a setting. If the second take below shows
  L0 following `voice_buffer_ms`, it becomes that setting.
- The prequential "L0 learnt" figures in `retiming.log` (294 to 400) are posterior means over a 250 to 550 ms grid
  and stay near the grid's middle when a take has few early starts; the bounds above are the firmer reading.

### (c) The silence record

Measured directly for the first time. In recording A of Set D, with each of Steam's spurts placed by its own
decoded packets: spurt 9 starts 63.4 ms after spurt 8's last sample, and spurt 13 starts 63.4 ms after spurt 12's.
Both are appended spurts on noise, where the waveform pins the delay. 62.5 ms plus 400 ppm over 1.6 s is 63.1.
Where two of Steam's spurts follow each other with no audio left out (spurts 11 and 12), 14 ms of silence was
played between them, not 62.5: the queue was at its restart level, which is rule 4.

### (d) Inside a spurt

- **Playback runs 0.4 ms per second ahead of the source** in every take (the "clock" column of the accuracy
  suite, 404 to 505 ppm). It is the same on two PCs and three sessions, so it is probably the game's sample-rate
  path and not a recorder's clock. It drains the queue by 14 ms over the speech take's longest spurt (35 s). It
  decides no transition in these takes.
- **The 5.8 ms trims are not a steady drain.** In the speech take the six appended spurts that have no long pause
  show no step at all over 5 to 8 s each. The skips come where the queue is above its restart level: after a
  restart, and after an append that overfilled it.
- **So neither changes which spurts append**, and the model leaves both out. Finding 10's "2 to 8 ms per second"
  is the average over spurts that had just restarted.

## 2. Is it better on speech, honestly scored?

**Fixed beforehand, from Set D and the four Set B test-signal takes** (`GEN` in `tests/retiming.mjs`): L0 350;
silence record 62.5; ceiling L0; hold 425 to 485 and pre-roll 115 to 152, uniform. **Held out:** the speech take and
the Set C baseline.

What "beforehand" is worth here: the brief listed the speech take's transitions, and before fixing L0 I had walked
them by hand with L0 = 345 and no offset and seen all nine come out. I then set L0 from the bounds in 1(b) and the
offset from finding 12, and did not move either after scoring. The ceiling (rule 4) and the merged spurts (rule 6)
were found in Set D (spurts 11 to 13) and in the speech take at the same time; rule 6 only acts in the free-running
scores, rule 4 in both.

### Scores (`--generative`, sections 1 to 3)

**One step ahead**: each transition is predicted from the take's own delay before it. Log-likelihood of
early / late / kept (a change of 80 ms or more counts), probabilities floored at 0.02; "none" is no re-timing.
The size is the mean error of the predicted change over the transitions that moved.

| Take | Transitions | Queue | Flat rule | None | Size error, queue / rule |
| --- | ---: | ---: | ---: | ---: | ---: |
| speech (held out) | 9 | -8.6 | -15.6 | -31.6 | 30 / 54 ms |
| Set C baseline (held out) | 12 | -1.1 | -4.5 | -31.8 | 72 / 61 ms |
| **held out** | 21 | **-9.7** | **-20.0** | -63.4 | |
| the takes the parameters came from | 125 | -40.3 | -46.6 | -122.3 | 6 to 53 / 3 to 76 ms |

Where each loses, in the speech take: the queue model gives 0.06 to both early starts after 140 ms silences (it
expects them to be under 80 ms; they were -124 and -105) and 0.20 to the restart after 120 ms. The flat rule is at
its floor three times: a chain of two early starts twice, and the spurt that stayed put after an early one.

**Free running**: the whole take from the gate model alone, 4000 seeds per model.

| Take | Whole pattern right, queue / rule | Transitions right, queue / rule / none | Start error, queue / rule / none |
| --- | ---: | ---: | ---: |
| speech (held out) | 0.0 / 0.0% | 41 / 31 / 11% | 100 / 134 / 150 ms |
| Set C baseline (held out) | 0.0 / 1.5% | 61 / 47 / 33% | 103 / 94 / 88 ms |
| sender A | 2.5 / 0.9% | 64 / 58 / 50% | 80 / 89 / 83 ms |
| four Set B test-signal takes | 0 to 0.3 / 0 to 1.0% | 46 to 58 / 50 to 64 / 50 to 88% | 77 to 101 / 70 to 93 / 29 to 61 ms |

**Luck.** 2000 made-up pairs of takes with the held-out takes' silences, scored one step ahead in the same way:

- if the flat rule were how the game behaves, the median difference is -20.5 and none favours the queue model by
  the 10.4 seen;
- if the fixed queue model were, the median is +26.0 and none is as low as 10.4.

So the result is not luck in the flat rule's favour or against it: the takes are far from what the flat rule
produces. They are also not what the fixed queue model produces, and the reason is 1(a)'s last point.

**The exploration** (`--shift`, chosen after seeing the scores; in-sample): lengthening every gap by 30 ms gives
the speech take 71% of transitions right, 8% of seeds the whole pattern and a start error of 56 ms, and the held-out
one-step score -2.8; by 50 ms, the Set C baseline's whole pattern in 86% of seeds. Both make the takes the
parameters came from worse (-50.4 and -64.6 against -40.3). One number does not serve both kinds of signal.

**How thin it is.** One speech take, nine transitions, six early starts, one session. The one-step result is strong
because the flat rule cannot produce chains at all, which is a matter of kind, not of nine coin flips. The
free-running gain on speech (100 against 150 ms) is one take's worth and could halve or double on another.

## 3. What the speech take shows that neither model has

- **The sum that goes 400 ms under.** The nine changes between spurts sum to -431 ms, but the take's delay only
  spans 343 ms (1.943 to 2.286 s). The range is right. The sum leaves out what happens inside spurts: spurt 1
  starts 124 ms early and is back at the restart level 17 s later (+114 ms in steps that each follow a pause), and
  spurt 9 gains 40 ms the same way.
- **The first spurt's own latency** is the restart level: 2278 ms, against 2265 to 2284 for the three later
  restarts. It started on an empty queue like any restart.
- **How far the queue drains.** The three chains end 307, 331 and 320 ms below the restart level (spurts 4, 6
  and 9). Nothing goes lower, so the queue's whole depth is seen and L0 is at least 331 ms in that session. After
  the first two the next spurt restarted; spurt 9 ran 35 s at that level.
- **Chains.** -124; then -197 and -102 with no restart between; then -217 and -105. The flat rule forbids the
  second of each pair.
- **Steps at pauses, not anywhere else.** Every upward step inside a spurt comes right after a pause of 380 to
  560 ms between loud frames: +50, +69, +39 and +31 ms after pauses of 500 to 560 ms, which is rule 6 (the last
  could be a 31 ms silence record); and +9, +7, +11, +12 and +19 ms after pauses of 380 to 560 ms, which I cannot
  explain (Steam's hold should outlast a 380 ms pause).
- **A restart overshoots, and skips.** In the first 0.1 s after its loud onset a restarted spurt plays 25 to 50 ms
  later than it does half a second on; the receiver gets there by skipping audio in steps of 11 to 25 ms (2 to 4
  times 256 samples at 44.1 kHz). All four restarts in the speech take do it (39 to 50, 13, 28 and 26 ms seen
  after the onset; more may be skipped in the pre-roll before it, where there is nothing to hear). So do the Set C
  baseline's restarted bursts (31, 37 and 13 ms skipped 0.08 to 0.3 s into the burst, and each restarted burst is
  1.12 to 1.15 s long in the recording against 1.19 s for the appended ones). In Set D, judged by the onset alone,
  6 of 7 restarted noise spurts come in 6 to 42 ms late against their own later delay. None of the 12 appended
  spurts measured (6 speech, 4 Set C, 2 Set D) shows any. This is audible material: a few hundredths of a second
  missing from the first syllable after every pause long enough to restart.
- **The two shifts after long silences** (-128 and -156 ms after 1.4 and 10.4 s). The -128 (Set B
  `voice_scale 0.5`) is a spurt placed by its envelope only, and in that take the gate had opened about 0.4 s
  earlier than in the others (the -40 dBFS tone before it is audible in the recording): probably a measurement of a
  differently gated spurt, not a shift. The -156 (`voice_avggain 0.25`) is real: 16 waveform windows agree, the
  silence before it was 10 s, and the next spurt is back. A restart can come in 156 ms under L0; once in about 100
  restarts here. Not explained.
- **Two changes of -100.0 and -99.9 ms** (spurts 4 and 9, with the clock removed), from different queue levels,
  after gate silences of 160 and 140 ms. `voice_buffer_ms` is 100. It may be chance; I could not make a rule of it.
- **Are the steps inside a spurt audible as timing?** No: 7 to 69 ms inside running speech moves nothing a
  listener would place. The skips are audible as damage, not as timing.

## 4. Recommendation

**Replace the rule; keep it an option; keep the default.**

- **Why replace.** On speech the flat rule is wrong in kind: it never chains, it draws sizes from the wrong
  quantity (the silence less 0 to 130 ms; the game leaves hold + 62.5 ms + pre-roll), and it sends every moved
  spurt's successor back whether or not the queue has run out. The queue model is the game's own behaviour as far
  as it has been measured, and it is the better of the two by every score on the speech take.
- **Parameters:** the six rules above with L0 350, no extra offset.
- **What a listener hears differently.** Today: 41% of phrases after a pause of up to 1 s start early by a random
  amount, never two in a row. With the queue model: after a pause between 0.6 and about 0.95 s (loud to loud), the
  next phrase comes in with the pause closed to about 0.6 s; several short pauses in a row are each closed until
  about 0.35 s has been used up, then one phrase waits its full time again; a pause over about 1 s is never
  touched. It sounds like someone whose pauses are evened out, then one longer breath.
- **Its limits.** It will not match a given take spurt for spurt (41% of transitions on the speech take). On
  signals built on the threshold it is a coin flip, as before. L0 is one PC's. The 50 ms question of 1(a) means
  each pause is closed by about 50 ms less than the game closed it in the speech take, and the shortest pauses that
  still separate two spurts barely move.
- **The default (the owner's decision).** For changing it to the queue model: on speech a render would be nearer
  the game on average (100 against 150 ms), and the early starts are the one difference the owner hears. Against:
  the dry/wet A/B would no longer line up after the first early start (the wet side runs up to 0.35 s ahead, then
  jumps back), so level and tone could no longer be compared at the same instant; the real-take check lines up
  spurt by spurt and is unaffected either way; on 6 of the 8 takes scored, moving spurts from the source alone put
  them further from the game than leaving them (the wrong spurts move); and every registered prediction and golden
  hash is a default render. My reading: keep the source timeline as the default until a render can be shown to
  place spurts better than leaving them on more than one speech take.
- **Not in the order:** the restart skips. They are certain as a fact and unknown as a rule (how much, when); W3-03
  may give the rule, and it deserves its own order with its own listening check.

## 5. The two takes that would settle most

Both on the dedicated server with SourceTV, as Set D (`+sv_cheats 1 +sv_alltalk 1 +tv_enable 1 +tv_delay 0`), PC A
with `voice_loopback 1`, the game's output recorded losslessly. The console's own help (`find voice`, supplied by
the owner) lists `voice_buffer_ms` (default 100, "How many milliseconds of voice to buffer to avoid dropouts due to
jitter and frame time differences"), `voice_showincoming`, `voice_showchannels`, `voice_profile`,
`voice_recordtofile` ("Record mic data and decompressed voice data into 'voice_micdata.wav' and
'voice_decompressed.wav'"), `voice_inputfromfile` ("Get voice input from 'voice_input.wav' rather than from the
microphone"; `sv_allow_voice_from_file` defaults to 1) and `voice_writevoices`.

**Take 1: speech, with its packets and the receiver's own log.**

- Client console, before joining: `con_logfile voice_take1.log; developer 1; voice_showincoming 1;
  voice_showchannels 1; voice_profile 1; voice_recordtofile 1`. Server: `tv_record take1`.
- Play the raw speech file of Set B (`my own speech raw from audacity.wav`) twice in a row with 5 s between, the
  way Set B was played. If `voice_inputfromfile 1` works with it saved as `voice_input.wav` in the game folder, use
  that for a second run: it removes the cable and the player from the chain. Then `tv_stoprecord`, and send the
  demo, the recording, the log and the two WAVs the game wrote.
- **What it decides.** (i) The packets give Steam's real spurts on speech, so the 50 ms of 1(a) is either seen in
  them (the gate model's hold or threshold is off on speech, and rule 5 gets a measured correction) or not (the
  receiver takes a spurt just after its queue runs out, and rule 3 changes). (ii) If the log prints the queue
  ("bufsize" per channel, samples added and mixed), L0, the ceiling and the skips are read off directly instead of
  fitted. (iii) Two passes of the same speech in one session say how much of the pattern repeats: the model says
  nearly all of it for silences clear of the threshold.

**Take 2: the same with `voice_buffer_ms 200`** (everything else as take 1, one pass of the speech and one of
`tf2_voice_nettest_v1.wav`, whose eight bursts alternate early and restart at the default).

- **What it decides.** Whether L0 follows `voice_buffer_ms`. If the restart level rises by 100 ms and chains run
  100 ms deeper (the nettest bursts would then go early twice before restarting), L0 is that setting plus a
  constant, and the app's control is `voice_buffer_ms` with the game's own default. If nothing moves, L0 is
  elsewhere and stays a fitted constant per machine.

## What was measured outside the repository

Scratch scripts on the takes decoded with ffmpeg to 16 kHz mono (the speech source: its left channel), band-passed
above 300 Hz. None of them or their outputs is committed.

- **Silence played between Steam's spurts (1c).** The demo's packets were decoded with
  `tests/demovoice/extract.mjs` (each spurt at its arrival tick). For each spurt, 0.4 s windows of the decoded audio
  were cross-correlated against recording A to get the spurt's delay at its start and end; the silence played is
  the next spurt's start less this one's end. Noise spurts only (a 1 kHz tone matches every millisecond).
- **Restart skips and steps at pauses (3).** 40 or 60 ms windows of the take every 10 or 50 ms, each matched
  against the source within ±110 ms of the running delay; a step is a change that at least three consecutive
  windows agree on to 1.5 ms. The clock ratio is the accuracy suite's.
- **Burst lengths in the Set C baseline.** 2 ms envelope, runs within 15 dB of the loud level.
- **The gate's pauses.** 20 ms frames above -39.5 dBFS RMS, as `gateSpurts` in `reference.js`; the `--generative`
  mode does the same from the source WAV.

## What I did not do

- Re-run the accuracy suite, or score Set A (one spurt per song) and the takes with simulated loss.
- Measure listener B spurt by spurt against the packets: my matcher lost the quieter recording, and I left it.
- Find a rule for the restart skips, for the small steps at 380 ms pauses, or for the -156 ms restart.
- Test the model on a second speech take: there is none. `speech_loss10` (Set C) is speech, but under 45% frame
  loss the suite measures it by statistics only.
- Read any engine code. The questions below are for W3-03.

## Questions the engine's code may answer

1. What sets the restart latency (350 ms here) when `voice_buffer_ms` is 100? Is it a buffer length, a count of
   frames, or the sound system's own latency?
2. Is there a ceiling on the queue, what is it, and how is the excess removed (256-sample skips: when, how many)?
3. What happens when a spurt's first packet arrives just after the queue ran out: always the full restart, or is
   the channel kept for a time (and is `voice_fadeouttime` 0.1 part of that)?
4. Why does a restart begin 25 to 50 ms above the level it settles at?
5. Does the receiver insert the silence record's samples as they come (62.5 or 31.25 ms), and is anything else
   inserted at an end of transmission?
6. Is the 0.04% by which playback outruns the source in the receiver's resampling?
