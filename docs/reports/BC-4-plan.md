# BC-4, the plan: what was read and run, the open decisions, the private looks

A planning report, 2026-11-13, for the order `docs/work-orders/BC-4-jitter-arrivals.md`. No app code and no
test changed. The planner read the repository at `main` `28e9c79` and nothing of the owner's record or
install. Every figure carries its standing.

## What was read

- `CLAUDE.md`, `docs/PIPELINE.md`, `docs/PROGRESS.json` (`in_flight`, `next`, `finish_line`,
  `decisions_in_force`, `open_questions`).
- `docs/reports/bad-connections-plan.md` whole. Read 6 is the rule the model follows.
- `tests/REFERENCE_2026.md`: Set C, findings 8, 9, 10, 22 to 25, the Model table, the results' rows.
- `voice-channel.js` whole, `engine/network.js` whole, the `steam` paths of `engine/render.js`,
  `engine/render-stream.js`, `engine/live-chain.js` and `engine/steam.js`, the sender's tick rule in
  `steam-sender.js`, the page's jitter control, its console variables and its share-link keys.
- The orders BC-1 and W3-02d-2 for their form, and the reports and orders of W3-02c-2 and W3-02d-1 for where
  the queue runs.
- `tests/accuracy.takes.json`, `tests/accuracy.mjs` (its four renders and its clock), `docs/ACCURACY.md`'s
  rows for Set C, and every test that names jitter or a late frame.

## What the code showed

| What | Where | What it means for the order |
| --- | --- | --- |
| A message reaches the voice channel on a whole tick, and a tick equal to the last one is accepted | `voice-channel.js`, `push()` | A delay is a later tick. Two messages can share a tick. `voice-channel.js` needs no change |
| The tick is handed over in two places | `engine/steam.js:136-176`, `steamChannel`'s `push` and `advance` | The delay enters there and nowhere else |
| The stream's bound is a lower bound on later sender ticks | `engine/render-stream.js:274` | It stays a bound when the arrival tick is a function of the sender's tick that never falls |
| Late frames are drawn in the codec stage, on every profile | `engine/render.js:528`, `engine/render-stream.js:242`, `engine/live-chain.js:99` | On `steam` those three calls pass jitter 0. The other profiles keep theirs |
| `jitterMs` is in the codec stage's key | `engine/render.js:55`, `:123` | On `steam` the key takes 0, so a changed jitter starts from the kept codec result |
| The accuracy suite renders on the file's own timing | `tests/accuracy.mjs:100`, `:135`, `:167`, `:411` | With jitter doing nothing there, its two jitter rows compare the take with a render without jitter |
| No registered prediction has jitter | `tests/predictions/plan.json` | `predictions.json` is not touched; `PREDICTIONS.md` gets the usual note |
| `tests/steam.verify.js` reaches late frames on `steam` through `jitterMs` in several checks | `:651`, `:913`, `:941`, `:1022`, `:1335` | They are kept with the suite's own mask, or restated. This is a real share of BC-4a's work |

## What was run: a prototype of the model

A script in the planner's scratch folder, not committed. It uses the repository's `steam-sender.js` (its
messages and ticks for a gate-open signal) and `voice-channel.js` (`createTimeline`), with packets of zeros of
the right lengths, and the delay rule of the order's section "The model". Loss, where used, is BC-1's rule
written again: a message lost by its own draw, up to ten concealed frames in front of the next, a message over
twelve frames refused. It is a stand-in for a render, not a render, and nothing of it was compared with a take.
Every figure below is **measured on that prototype**.

**The signal:** laid out like Set C's as the record describes it: sounds of 12, 10 and 12 s, then eight of
1.2 s, with pauses the planner chose (1.5 s and 0.8 s). The record does not give Set C's pauses.

**The delay above the least possible, jitter 50** (20 seeds, 30 s of sound each):

| Looks at the server's socket / the listener's | 300 frames a second | 66.67 frames a second |
| --- | --- | --- |
| once a tick / once a frame (the order's choice) | mean 69.5 ms; a tenth under 45, a tenth over 90; most 135 | mean 95.6 ms; 60 and 135; most 180 |
| once a frame / once a frame | mean 44.2 ms; 30 and 60; most 105 | mean 96.5 ms |
| once a tick / once a tick | mean 94.8 ms; 60 and 120; most 180 | mean 94.8 ms |

The least possible delay at jitter 50 is 120 ms for the two crossings (8 ticks). So the round trip gains 190,
164 and 215 ms in the three rows at 300 frames a second. With one draw a packet in place of a new draw at
every look, the median delay above the floor is 120 ms, so about 240 to 245 ms.

**The ticks between one message and the next, jitter 50, the order's choice, 300 frames a second:** 0 ticks
5.2%, 1 tick 8.8%, 2 ticks 14.5%, 3 ticks 18.2%, 4 ticks 19.0%, 5 ticks 15.6%, 6 ticks 10.0%, 7 ticks 5.3%,
8 ticks 2.4%, 9 or more 0.9%. Without jitter: 3 ticks 31%, 4 ticks 66%, 5 ticks 3% (the sender's model;
finding 25 measured 41, 49 and 10% in the game).

**Skips inside the three long sounds, past each one's first second** (20 seeds):

| Frames a second | Loss | Jitter, looks | Channels opened | Skips a second | Of 10 ms or more | Sound skipped, ms a second | Sizes: a tenth under, median, a tenth over, largest, ms |
| ---: | ---: | --- | ---: | ---: | ---: | ---: | --- |
| 300 | 0 | 0 | 6.8 | 0.19 | 0.02 | 0.70 | 0.7, 2.3, 8.9, 15.3 |
| 300 | 0 | 50, frame / frame | 6.9 | 0.23 | 0.07 | 1.58 | 1.0, 4.6, 15.2, 28.0 |
| 300 | 0 | 50, tick / frame | 6.8 | 0.22 | 0.07 | 1.92 | 1.1, 6.3, 19.3, 48.4 |
| 300 | 0 | 50, tick / tick | 6.8 | 0.27 | 0.11 | 2.61 | 1.2, 6.8, 20.9, 60.0 |
| 300 | 0 | 100, frame / frame | 7.0 | 0.21 | 0.08 | 1.98 | 1.9, 7.6, 18.8, 37.9 |
| 300 | 37% | 0 | 14.2 | 0.48 | 0.28 | 14.68 | 1.4, 13.5, 80.0, 159.9 |
| 300 | 37% | 50, tick / frame | 14.6 | 0.63 | 0.44 | 19.34 | 1.9, 19.3, 73.5, 181.8 |
| 150 | 0 | 0 or 50 | 7.5 to 7.8 | 0 | 0 | 0 to 0.05 | |
| 150 | 37% | 50, tick / frame | 19.5 | 0.05 | 0.02 | 0.56 | |

**The silent share of the loud spans, past 0.6 s of each** (10 seeds, an earlier run of the same script, the
slots of 20 ms that play nothing of the source): at 300 frames a second and loss 37%, 8.1% without jitter and
8.0 to 8.7% with jitter 50 over the three look rates (8.5% for the order's choice); at 66.67 frames a second,
7.5% and 7.6 to 7.8%. Without loss it is 0.0% at every setting.

**With one draw a packet** (8 seeds, 300 frames a second, both sockets once a frame): 0.21 skips a second,
0.10 of them 10 ms or more, 2.37 ms a second. So even that wider spread does not make skips frequent.

## What the prototype says about the evidence

1. **The model's jitter is a small effect on the modern preset.** At 300 frames a second the ring is full
   after a restart (finding 23), and a full ring skips only when arrivals run further ahead of the mixer than
   they have before. A spread of some tens of milliseconds does that a few times and then seldom. At 150
   frames a second and under, the ring has room and nothing is skipped.
2. **The model does not give finding 9's 1.36 events a second.** It gives about 0.05 more skips a second of
   10 ms or more. So either those events are not skips, or the game's packets bunch far more than read 6
   implies, or the take's detector counts something else (the prototype's baseline gives 0.19 skips a second;
   the takes' baseline had 0.9 false events a second, measured, finding 9's method). Private check (i) is
   written to tell these apart.
3. **The ping agrees with a new draw at every look.** Set C's `net_graph` read 185 to 196 ms more with
   `net_fakelag 100` than without (measured, 204 to 210 against 14 to 19). A lag of 100 each way alone would
   add 200. The order's choice of look rates adds 190 with jitter 50; one draw a packet would add about 245.
   This rests on one reading, on the inference that jitter was on when it was read, and on `net_graph`'s own
   averaging, which was not read.
4. **The combined take's extra silence looks like the queue's, not the jitter's** (inferred from the
   prototype: 8.1% silent without jitter, 8.5% with, where the take has 10.3% and a render on the file's own
   timing 4.0%). `docs/PROGRESS.json` already records a `'game'` render at loss 15 with more silence than its
   take. Private check (ii) measures it on the build.

## The open decisions, with the planner's recommendation

1. **The controls.** One jitter control, the lag implied as twice the jitter. A lag control would change
   nothing a render shows. A lag spike is not built and has no order. Rests on: `j = min(jitter, lag / 2)`
   (read), and a constant lag being inaudible in a render.
2. **Steam voice on the file's own timing.** Jitter does nothing, and the page says so under the control.
   Rests on: that timeline has no queue; forcing the queue overrules the user; the fit is not the game's.
3. **The other codecs** (`celt_22`, `celt_44`, `speex`, and `steam_48` and `miles`, neither in TF2). Keep the
   late-frame fit, marked as a fit. Rests on: they have no sender model and no queue in a render.
4. **The live monitor.** Jitter does nothing on Steam voice until W3-02c-3 (not built yet). Rests on: the
   monitor keeps the file's own timing, and it stays equal to a render with the same options.
5. **Loss and jitter together.** Loss first, by message; the delay of a tick does not depend on what was lost.
   A lost packet is kept in the model's lists (a simplification).
6. **The look rates.** The server's socket once a tick, the listener's once a frame. Rests on the ping (point
   3 above) and on a guess about where each side reads its socket. A read of the engine would settle it.
7. **What is taken out.** The least possible delay. The rest is heard, so a render with jitter 50 plays about
   70 ms later than its source at 300 frames a second.
8. **The stage key.** `jitterMs` stays off `STAGE_OPTIONS.afterB`. A changed jitter on a long source waits
   for the button. W3-02d-2's sentence "BC-4 moves `jitterMs`" is then wrong and is corrected in BC-4a's
   report.
9. **The accuracy rows.** `net_jitter` and `net_combined` keep their settings and gain a note. On the file's
   own timing their renders lose the late frames. The orchestrator re-measures the two rows after the merge.
10. **Two parts.** BC-4a (the engine, the render, the stream, the records; 10 hours) and BC-4b (the page; 4
    hours). The planner's estimate for BC-4a is 1,000 to 1,300 lines of change, most of it tests; for BC-4b
    300.
11. **A second reader** for BC-4a, and the cache number rises once with each part.

## For the orchestrator's private look

Each is written in full in the order's section "The private checks".

1. **Before the build, on Set C's jitter take and baseline take:** each event's delay step (after less before,
   at one-sample resolution) and, where there is no step, the level against the guide. Sent back: the counts
   by step, the downward steps' median and tenth and ninetieth percentiles, their sum a second, how many a
   second are 10 ms or more.
   - Two thirds or more of the jitter take's events on a downward step: the events are skips; build.
   - Half or more with no step and sound at level: stop; a lost packet is the only thing that replaces sound
     in place, and the read says jitter loses none.
   - Neither: build, and finding 9 says the events are not explained.
2. **A question of the record:** was `net_graph`'s 204 to 210 ms read with `net_fakejitter 50` on?
3. **After BC-4a is built:** the four renders of the network test signal through the queue (plain, jitter 50,
   loss 37.0, both), ten seeds, with the table of tolerances in the order.
4. **Optional, a read of the engine:** which code reads each socket, and whether it runs once a frame or once
   a tick on a listen server; whether the read loop goes on to the next packet in the same look after one is
   released. It changes two constants at most.

## Block 2 of the run sheet

Not recorded yet, and nothing waits on it. The order says what its log would check: nothing lost or
reordered; the ticks between messages against the prototype's table above; the same at `fps_max 67`, which
tells whether the listener's socket is looked at once a frame; the queue's size replayed tick for tick with
the log's own arrivals.

## What could not be settled

- **What finding 9's events are.** The model does not make them. Check (i) decides.
- **How often each socket is looked at.** Chosen, not read.
- **Whether a listen server's own player sends a packet every tick when the connection runs through sockets**
  (read 8 leaves it open). At `cl_cmdrate`'s or `cl_updaterate`'s rate fewer packets would stand in each list,
  and those behind a slow head would wait less often.
- **The pauses of Set C's signal**, which decide how many channels open. The prototype's are the planner's.
- **The accuracy suite's clock on a render with skips.** The order's tolerance for it is a guess.
- **Whether the baseline skips of the game are the model's.** Finding 10 measured the delay falling 2 to 8 ms
  a second in steps of about 5.8 ms in every take; the prototype's baseline skips 0.7 ms a second in steps of
  2.3 ms in the median. `docs/PROGRESS.json` lists this under the cuts at 300 frames a second. It bounds how
  well any jitter model can be checked against a take.
- **The mean delay.** Whether a render should also take out the mean delay above the floor (it would need a
  figure fitted over seeds, as `ARRIVAL_SECONDS` is) is left as ruling 6.
