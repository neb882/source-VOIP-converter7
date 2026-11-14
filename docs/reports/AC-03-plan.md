# AC-03, the plan pass: one wrong line-up on tone bursts, and eight pieces that are early starts

A planner's pass of 2026-11-14 on `main` at `87ef870`. It wrote
[the order](../work-orders/AC-03-line-up-on-repeats.md) and this report. It changed no app code and no test. It read
the repository only: no recording of the owner's, no log, no file of the owner's install. The private figures it
uses are the ten delays the orchestrator handed it, which the order's table repeats.

## The recommendation

Build the order. It is one rule in `TF2Reference.track`: a waveform place that rests only on tone windows, and lies
more than 0.1 s from where the level envelope puts the phrase, is dropped, and the envelope places the phrase.

Read the ten off-pieces as two different things. Two of them (the first 30 s of `take3_voice_avggain_0.25` on the
game's voice queue) are a wrong line-up, and the order fixes the cause that a stand-in showed. The other eight (the
pieces of 2 s) are most likely not a fault of the line-up: they are phrases that the take and the render do not both
start early (inferred). The orchestrator's private run settles both.

## What was run

Stand-in takes, made in Node with the engine as the Node suites load it. Each is the app's render of
`tests/testsignal/tf2_voice_testsignal_v1.wav` (Steam voice, the page's defaults with `volume` 0.15 and `avgGain`
0.25 or 0.5), put 2.07 s late on a clock 400 ppm off, with noise at −47 dBFS (also −45, −40 and −35 with a slow
wobble). The guide was the default seed's render, as in the suite. `TF2Reference.track` was run as the suite runs
it: the raw source, the gate, the guide and its frame log.

Every figure below is measured on these stand-ins, not on a take.

| Stand-in take | Guide | What the line-up read |
|---|---|---|
| queue, seeds 1, 2, 5 and 6, 300 frames a second | queue | The first 30 s right. Pieces off by +270 to +336 ms at 47.16, 51.16 and 59.16 s, and by −291 to −352 ms where the take's own render starts a phrase early. |
| queue, seed 6 | the file's own timing | Four pieces off by −291 to −342 ms, each a phrase the take's render starts early. |
| the guide itself with three phrases moved by +316, +335 and −330 ms | queue | The three pieces at +311, +337 and −329 ms; level 0.06 / 0.4 dB. |
| queue, seed 3, 200 or 100 frames a second | queue | **The first piece at 1577 ms against 2110 for the next: the wrong line-up.** Level 1.66 / 16.2 dB, the worst block at 0 s. |
| queue, seed 3, 300, 336, 400 and 67 frames a second | queue | The first 30 s right. |

In the second and third rows every piece that reads off is a real difference between the two renders: each render's
own log of its phrases (`codecInfo.channel.spurts`) says which phrases it started early and by how much, and the
pieces follow it to within about 40 ms.

## The cause of the wrong line-up

The three sync beeps are 1 kHz, 0.5 s apart. A phrase is placed by its waveform when two windows of 1 s agree on a
delay at 2 kHz, else by its level envelope. At 2 kHz a 1 kHz tone is at the edge of the band; what is left of a beep
is the clicks of its start and end. The two windows of the beeps overlap and both hold the second beep. Its clicks
fit a neighbouring beep of the take as well as their own, so both windows can land on the same wrong beep. They did,
half a second early, at correlations of −0.75 and +0.77; at the right place the clicks gave 0.34 and 0.44. The
envelope had the right place, but a waveform place overrules it, and the waveform search has none of the envelope's
guard against repeats.

Whether it happens turns on small things: it did at 200 and 100 frames a second for the take's render and not at
300; it did on the first 12 s, the first 45 s and the whole signal, and not on the first 30 s, where the starting
delay differs. So one take of the eighteen showing it is what one would expect.

The piece after it (the 1 kHz staircase, +1574 ms in the take) did not go wrong in any stand-in. It is inferred to
follow from the first: its search starts from the running delay, and the right peak half a second away loses 0.3 to
the prior's penalty.

## The eight pieces of 2 s

The default seed's render on the queue starts three phrases early: at 47.36 s by 316 ms, at 51.36 s by 294 ms and
at 59.36 s by 335 ms. A piece's delay is against the render. So on the queue the take reads about 0.3 s more where
only the render is early, and like its neighbours where both are. On the file's own timing the render starts
nothing early, and a piece 0.33 s under its neighbours is the take's own early start.

Read so, the private figures say that `take3_voice_avggain_0.25` starts the phrases at 51.36 and 57.36 s early, and
`take1_default` those at 55.36 and 59.36 s. On the queue that predicts +0.3 s at 47.16 and 59.16 s for take3 and at
47.16 and 51.16 s for take1, which is what was measured, in place and in size (+330 against the render's 316 and
335). It also predicts no step at take3's 51.16 and take1's 59.16, and none was reported.

It predicts two more that were not among the figures handed over: take3's 57.16 and take1's 55.16 should read about
0.33 s less on the queue. See the open questions.

## The trial of the change

In a scratch copy of `reference.js` (not committed; 27 lines added):

- the wrong first piece went from 1577 to 2085 ms, and the stand-in's level from 1.66 / 16.2 to 1.14 / 9.4 dB (the
  rest is the two renders' own difference);
- the stand-ins with real jumps kept every piece to the millisecond;
- `pnpm test reference` passed;
- a Node stand-in of the page's real-take check gave the same pieces for the seven committed recordings, byte for
  byte (one fails to line up before and after).

A wider rule (no tone window ever places a phrase) fixed the stand-in too and moved most of the committed recordings
by up to 0.09 ms. A rule that searched the waveform again near the envelope's place did not fix it. Both are in the
order under "What was tried and not ordered".

## What moves

- `reference.js`, a file the site keeps offline: the cache number rises at the merge.
- The rows of `take3_voice_avggain_0.25` in `docs/ACCURACY.md`, after the private run. Nothing else is expected to.
- If the private check confirms the reading of the eight pieces, one sentence of `docs/ACCURACY.md` and the
  `deferred` entry in `docs/PROGRESS.json` are corrected by the orchestrator.

## Open questions

1. Does the take's wrong first piece come through the tone windows, as the stand-in's does? Only the private run
   can say. The order says what to conclude from each outcome.
2. Do take3's piece at 57.16 s and take1's at 55.16 s read about 0.33 s less on the queue? If not, the rule that
   keeps a weakly matched phrase within 0.1 s of the others may be holding a real early start in place, which would
   be a second, separate fault.
3. The stand-ins' options are the page's defaults as read from `index.html` and `app/render.js`, set by hand in
   Node; the suite takes them from the page itself. The three early phrases of the default seed's render should be
   confirmed from the suite's own render.
4. The suite does not print which phrases the take and the render start early; the page does. Not built yet.

## What was not done

No run in Chromium, no run of the accuracy suite itself, and nothing on a take. The scratch scripts are not in the
repository; the order carries the recipe of each check.
