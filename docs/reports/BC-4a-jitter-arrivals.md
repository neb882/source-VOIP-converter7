# BC-4a: jitter as arrival times through the game's voice queue (the engine, the render, its stream, the records)

The builder's report, 2026-11-13, for `docs/work-orders/BC-4-jitter-arrivals.md`, part BC-4a, with the order's
sections "The orchestrator's private look and rulings" and "After the plan review" holding over the text above
them. Branch `claude/bc-4a-jitter-arrivals`, from `main` at `39bdd8e`. Nothing of the owner's record was read.
Every figure carries its standing.

## What changes, in one paragraph

On Steam voice on the game's voice queue (`opts.timeline` `'game'`) the jitter setting is now the tick on which
each of the sender's messages reaches the receiver's voice channel. Each message goes through two of
`net_fakelag`'s lists, client to server and server to client, with the lag taken as twice the jitter; the least
delay is taken out and the rest is heard. Nothing is lost and the order is kept; the queue (`voice-channel.js`,
unchanged) does the rest. On Steam voice on the file's own timing jitter does nothing, and so it does nothing in
the live monitor. The other codecs keep the late-frame fit. Every render at jitter 0, and every render on another
codec, is unchanged.

## The model as built (`engine/network.js`)

| Part | Where | Standing |
| --- | --- | --- |
| One list: only the head is looked at; it leaves when its age is at least lag + (2u − 1) j, j = min(jitter, lag / 2), u drawn again at every look | `fakeLagList` | read; the draw taken as uniform: inferred |
| A head younger than lag − j draws nothing | `fakeLagList` | chosen (the order) |
| The packet behind a head that leaves is looked at in the same look | `fakeLagList` | inferred |
| Look times as a function, `k => 15 * k` and `k => k * 1000 / fps` | `STEAM_CROSSINGS[].looks` | the plan review's point 6 |
| Two crossings | `STEAM_CROSSINGS` (two entries) | read |
| The server's socket once a tick, the listener's once a frame | `STEAM_CROSSINGS[].looks` | chosen |
| One packet a tick on each crossing; a packet that leaves a list rides the next side's packet of tick ceil(r / 15), one entry per tick, riders sharing it | `steamArrivals` | read for the in-process path, inferred for sockets; step 3 as the plan review states it |
| The lag taken as twice the jitter | `FAKE_LAG_PER_JITTER` | chosen |
| The lists start at tick −200, a packet a tick | `FAKE_LAG_START_TICK` | chosen (the plan review's point 5) |
| The least delay 2 × (floor(jitter / 15) + 1) ticks taken out (2 × ceil(jitter / 15) before the fix round) | `steamArrivals`, `floorTicks` | chosen (ruling 6); the count corrected in the fix round, point 1 |
| Each list's own stream, `mulberry32((seed ^ 0x4A495431) >>> 0)` and `…0x4A495432` | `STEAM_CROSSINGS[].salt` | arbitrary constants (the order) |

`steamArrivals({ jitterMs, fps, seed })` returns `{ jitterMs, fps, floorTicks, at(tick) }`. `at` takes any whole
tick from −200 on, works each tick out once in tick order, and is the same whatever order it is asked in. Its
frame rate is limited as the voice channel limits it (10 to 1000, 300 when not given). With jitter 0, below 0 or
not a number, `at(p)` is p and nothing is drawn. Both functions are `TF2Audio`'s members (`audio.js`).

## What changed, file by file

- `engine/network.js`: `fakeLagList`, `steamArrivals`, `steamArrivalPlan` (what a render hands its channel: the
  model, `opts.arriveAt`, or nothing), the constants with their standing, the header comment.
- `engine/steam.js`: `steamChannel` takes `arrive` and uses it where a tick reaches the module (`push` and
  `advance`); it checks that what `arrive` gives is a whole number that never falls (else a RangeError) and counts
  `arrivals()` over the messages pushed. `steamArriveAt` refuses `opts.arriveAt` off the game's timeline or when
  it is not a function. A `STEAM_TICK_MS` constant (15).
- `engine/render.js`: the steam path's frame mask is made with jitter 0 (it draws nothing); `used.jitterMs` is 0
  on the steam path; `arriveAt` is read (on `READ_OPTIONS` and in `used`, so a render given it keeps nothing);
  `previewAllowed` is false with `arriveAt`; the channel gets its arrival ticks; `codecInfo.arrivals`. The option
  comments: `jitterMs` (was "late frames, measured"), `arriveAt`, `timeline` (the sentence "The page does not offer
  it (W3-02d, not built yet)" is corrected; `grep -n "does not offer it" engine/render.js` prints nothing), and
  `codecInfo.arrivals`.
- `engine/render-stream.js`: the same in the stream, with process()'s seed and frame rate; the stream's bound goes
  through `advance`, which maps it.
- `engine/live-chain.js`: the steam chain's frame mask with jitter 0. Nothing else.
- `audio.js`: the two members, and its header line for `engine/network.js` (it said "loss and late frames").
- `constants.js`: the comment on `VOICE_ENGINE.network` only; its three numbers stay.
- `index.html`: the control's help: "How far packets' arrival times spread. On Steam voice the packets reach the
  game's voice queue later and in bunches; none is lost."
- `app/console.js`: `net_fakejitter`'s help. It starts with the control's first sentence (the browser suite holds
  that), says the lists' rule is read, how often each end looks for packets chosen and the same-look release
  inferred (point 10), that it does nothing on the file's own timing on Steam's codec, and that the other codecs
  keep the fit.
- `app/render.js`: Steam voice's console line no longer speaks of late frames ("N frames concealed; frames lost at
  a spurt's end are not played", only when frames were concealed); with `codecInfo.arrivals` one line more,
  after the queue's line: `S_Voice: jitter: packets up to <maxMs> ms late, <sameTick> on a tick with another`.
  The opens and the dropped milliseconds stay on the queue's line (point 10).
- Tests: `tests/render-channel.verify.mjs`, `tests/voicequeue/reference-arrivals.mjs` (new),
  `tests/steam.verify.js`, `tests/verify.js` (point 1), `tests/stages.verify.mjs`, `tests/render-stream.verify.mjs`,
  `tests/harness.verify.mjs` (the member list), `tests/browser.verify.js` (the one help string).
- Records: `tests/REFERENCE_2026.md`, `docs/VOICE-PATH.md` (point 10), `docs/ACCURACY.md`, `docs/FINDINGS.md`,
  `docs/LIVE.md`, `README.md`, `tests/README.md`, `tests/accuracy.takes.json`, `tests/predictions/PREDICTIONS.md`.

`sw.js` is not touched: no file the site loads was added, removed or renamed.

## `codecInfo.arrivals`

On `'game'` with `jitterMs` above 0 or with `arriveAt`: `{ jitterMs, fps, floorTicks, messages, meanMs, maxMs,
sameTick }`. `messages` counts the messages pushed into the channel (a lost message never is); `meanMs` and
`maxMs` are the delay above the least, at 15 ms a tick; `sameTick` counts messages that arrived on the tick of
the message pushed before. Under `arriveAt`, `jitterMs` is the render's, `floorTicks` 0 and the delays
`arriveAt(t) − t`. `fps` is the rate the model runs at (the channel's limits), which can differ from
`codecInfo.channel.fps`, the value as given (for example 2000 against 1000). With no message, `meanMs` and `maxMs`
are 0. Absent otherwise, so no recorded `codecInfo` at jitter 0 moved.

## The checks (`tests/render-channel.verify.mjs`)

The order's check 4 is section 1, extended; the others are new sections 11 to 20.

| Section | What it shows |
| --- | --- |
| 1 | The render is the module's: the reference pushes each message on its tick from the second model (`tests/voicequeue/reference-arrivals.mjs`) at jitter 50 (300 fps), jitter 100 with loss 15%, jitter 200 at 66.67 fps; the voice, `codecInfo.channel` and `codecInfo.arrivals` equal. One more setting gives late frames through the suite's own mask (the fit's draw at 200 ms), so the channel's late-frame gain path is still compared with the reference |
| 11 | `fakeLagList` against the closed form, lag 100 / jitter 50 and lag 60 / jitter 50 (j 30), 20,000 packets each: every look's share within 4 standard errors (worst 1.25 and 2.05) |
| 12 | Jitter 25, 50, 100, 500 at 300 and 66.67 fps, five seeds, 20,000 ticks: `at` never falls, at(p) ≥ p, the floor reached at 25 and 50; jitter 0 and odd values give at(p) = p; `at` refuses a tick that is not whole or below −200 |
| 13 | The engine's arrival ticks are the second model's, tick for tick over 4,000 ticks: the order's settings, and jitter 50 at 10, 59.94, 120, 240, 1000 fps and with no rate given, and jitter 0.5 |
| 14 | The pin (below) |
| 15 | The bunch by formula through `arriveAt`, 66.67 fps, five seeds: a hold of 40 ticks gives opens 2, sound dropped, and a drop heard where the second channel first plays; a hold of 4 gives one open and nothing dropped |
| 16 | The stream in odd pieces gives process()'s samples and `codecInfo` key for key at jitter 50, at jitter 500 with loss 15%, and at jitter 50 at 66.67 fps with the gate off; and after every push it has asked the arrival tick of its bound and given out at the mix point exactly the blocks that start before that tick |
| 17 | `steam` on `'source'`: jitter 50 and 500 equal jitter 0, samples and `codecInfo` key for key, no late frame, three settings, through `process()` and `createRender`; the live chain at jitter 50 equals the chain at 0 |
| 18 | With stages: a changed jitter on `steam` (on either timeline) takes B and keeps nothing new; on `celt_22` it takes A and makes B again; the B key holds jitter as 0 on `steam`; `arriveAt` keeps nothing and makes `previewAllowed` false |
| 19 | `arriveAt`'s refusals: on `'source'`, on `celt_22`, not a function, a result not whole (and NaN), a result below the last, each a RangeError from `process()` and `createRender`; the same tick for every message renders; `(t) => t` gives the render without it |
| 20 | The same seed twice gives the same render; at seed 5 and loss 30% the same messages are lost at jitter 0, 50 and 500, and seed 6 loses others; seeds 5 and 6 give other arrival ticks |

The whole suite passed in 89 s (one run, measured).

**The pin's figures** (measured on the build; section 14). Seeds 1 to 20, 4,000 ticks each, jitter 50; the
messages are `steam-sender.js`'s for 60 s of unbroken sound with the gate off.

| | 300 fps | 66.67 fps | The pin |
| --- | ---: | ---: | --- |
| Mean delay above the least, over every tick | 69.51 ms | 96.35 ms | 69.5 ± 3 and 95.6 ± 3 (measured on two prototypes) |
| Messages on the tick of the one before | 4.88% of 21,436 | 8.40% | 5.2 ± 1.5% at 300 |
| The other reading of step 3 (break) | 73.56 ms, 1.44% | 99.17 ms | fails |
| The next head looked at only at the next look (break) | 114.63 ms, 0.02% | 193.31 ms | fails |

The two breaks give the plan review's figures for those readings (73.6 and 99.7; 115 and 194 ms). The 66.67
figure sits 0.75 ms above the prototypes': the build's lists start 200 ticks before the render.

**The bunch** (section 15, measured on the build): the hold of 40 ticks drops 282.8, 242.8, 251.1, 267.9 and
261.5 ms over seeds 1 to 5 (the plan review's prototype: 213 to 289 ms).

## `tests/steam.verify.js`: what became of each check

| Where (at `39bdd8e`) | The check | What became of it |
| --- | --- | --- |
| `:651` | the same messages are lost at jitter 0 and 50 | the jitter render is on the game's timeline, where jitter now draws (arrival ticks from streams of their own); the same messages are lost |
| `:913` | createRender is process() for "49.8% and 50 ms jitter, seed 3" | the frames that jitter marked come from the suite's own masks: `makeLossMask` for `process()`, and a stream mask (`createSteamStream`'s per-frame verdict) for `createRender`. At seed 3 every frame the 50 ms mask marks is concealed (measured: 0 silent), so a second case takes the 200 ms mask, where 5 frames play as silence: the stream's code for silent late frames is still reached |
| `:941` | re-timing under loss and jitter 100 | the late frames jitter 100 drew come from `withMask` with the same draw (`buildLossMask(count, 1, 0, mulberry32(seed), 100)`), so the renders are those of before |
| `:1022` | a hand-made late frame in a gap | left as it is (point 10) |
| `:1335` | the live chain is the render with 15% loss and 50 ms jitter, its late slots the render's | the late frames come from the suite's stream mask (`withStreamMask`, a fresh draw for each run), so the check holds as before with late slots on both sides; a new check states that `jitterMs` 50 alone draws no late frame in the render or the live chain (`underrunFrames` 0, `stats.late` 0) |

The plan review's point 9 expected the stream's and the live chain's late-frame code on Steam voice to go
untested. It stays tested: `withStreamMask` (the live section's, and a copy in section [5d]) wraps
`createSteamStream`, which `createRender` and the live chain call.

## Other checks restated

- `tests/verify.js:550-552`: the late-frame check moved to `celt_22`; a second check: Steam voice on the file's own
  timing at jitter 10, 100 and 500 is the render at 0, sample for sample, with no late frame (point 1).
- `tests/render-channel.verify.mjs:265-268`: `rest(g)` against `rest(s)` leaves out `arrivals` with the logs and
  the channel's info, and checks that only the `'game'` render with jitter has it (point 9).
- `tests/render-stream.verify.mjs:835-836`: "some frames arrive too late" keeps the `celt_22` and `speex` cases;
  the renamed case is checked to have no late frame and the WAV and `codecInfo` of `steam, dsp_room 1 (no
  effect)`, the same source and settings without jitter.
- `tests/stages.verify.mjs`: `startsFrom` learns that a changed `jitterMs` alone on a coded Steam render starts
  from B (point 2); `arriveAt` joins `HOOKS`; section 4's refused list has `arriveAt`.

## The recorded values that moved

Only these, each a `steam` case with jitter above 0, re-recorded in a commit of their own (`e60b209`). No other
hash of `tests/render-stream.verify.mjs` moved (every recorded case printed and compared).

| Case | WAV (old, new) | codecInfo (old, new) | gain (old, new) |
| --- | --- | --- | --- |
| steam, timeline game, loss 15%, jitter 50 ms | `6fef3ffd…`, `2b845fd4…` | `d409363d…`, `5d06b0ce…` | `a4fff0ac…`, `98b4b27a…` |
| steam, loss 15%, jitter 50 ms, net_split 40 ms | `851350d3…`, `2d0b861c…` | `6c210e89…`, `12919597…` | `26faab1b…`, `343ab293…` |
| steam, jitter 500 ms (late frames play as silence), renamed steam, jitter 500 ms on the file's own timing (does nothing) | `7a84d9b5…`, `2e488123…` | `7fd1c7b9…`, `a26aab67…` | `d26dcad0…`, `d7ca57fe…` |
| steam, listenerPos tunnel (preset 6), loss 15%, jitter 50 ms | `81dcafd4…`, `b706b771…` | `a7e430f6…`, `11482fab…` | `7e4a24e1…`, `8231f91a…` |

The renamed case's new hashes are those of `steam, dsp_room 1 (no effect)`. `tests/stages.verify.mjs` reads
these from the file, so it moved with them; its only change of its own is `startsFrom`.

## On the suite's own speech-like signal (done-means 8)

`talk()` of `tests/render-channel.verify.mjs`, 60 s, seed 3 of the signal, render seeds 1 to 5, the game's
timeline, `voice_buffer_ms` 100. Mean of the five seeds, with the least and the most (measured on the build).

| fps | Jitter | Messages | Mean delay above the least, ms | Most, ms | On the tick of the one before | Channels opened | Overflow drops | Sound dropped, ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 300 | 0 | 790 (783 to 795) | 0 | 0 | 0 | 17.0 (16 to 18) | 101.2 (94 to 108) | 1963.1 (1896.7 to 2005.8) |
| 300 | 25 | 790 | 44.8 (44.2 to 45.0) | 81 (75 to 90) | 6.6 (4 to 10) | 17.2 (16 to 18) | 92.2 (83 to 99) | 2215.7 (2095.9 to 2348.9) |
| 300 | 50 | 790 | 69.1 (68.4 to 70.2) | 138 (135 to 150) | 40.0 (31 to 48) | 17.2 (17 to 18) | 90.6 (78 to 105) | 2335.8 (2181.0 to 2448.9) |
| 300 | 100 | 790 | 147.7 (145.7 to 148.6) | 231 (225 to 240) | 68.2 (53 to 81) | 17.6 (17 to 18) | 89.6 (83 to 102) | 2638.4 (2576.3 to 2696.0) |
| 66.67 | 0 | 790 | 0 | 0 | 0 | 19.4 (19 to 20) | 0 | 0 |
| 66.67 | 25 | 790 | 56.0 (55.0 to 56.7) | 102 (90 to 105) | 18.2 (10 to 25) | 19.2 (19 to 20) | 0 | 0 |
| 66.67 | 50 | 790 | 95.5 (94.7 to 95.9) | 168 (165 to 180) | 65.0 (59 to 72) | 19.6 (19 to 20) | 0 | 0 |
| 66.67 | 100 | 790 | 206.3 (204.9 to 207.6) | 318 (315 to 330) | 97.0 (84 to 114) | 19.4 (19 to 20) | 0 | 0 |

At jitter 0 there is no `codecInfo.arrivals`; its messages column is the channel's packets. At 300 fps most of
the sound dropped is the overflow at each restart (finding 23), with or without jitter; jitter adds 250 to 680 ms
of it in a minute of this talk (about 4 to 11 ms a second). At 66.67 fps nothing is dropped at any jitter here.

## The breaks

Each break was made in a scratch copy of the sources and the named sections run against it (`TF2_DIR`).

| Break | The check that must fail | Result |
| --- | --- | --- |
| one draw a packet | 11 | both cases fail |
| j not capped at half the lag | 11, the second case | the second case fails (look 1: 4,514 against 1,667) |
| a head can leave from age lag | 11 | both fail (no packet at looks 1 and 2) |
| the draw from 0 to j | 11 | both fail |
| a packet behind the head can leave before it has been looked at as the head | 12 and 13 | 22 of 26 fail |
| the second list looked at once a tick | 13 at 300 fps | 14 of 16 fail, 300 fps from tick 0 to 2 |
| one crossing, not two | 13 | all 16 fail |
| the floor not taken out | 12 | the floor's checks fail |
| the floor taken out one tick too much | 12 | the same four fail |
| the arrivals drawn from the loss stream | 13 (point 4) | 14 of 16 fail |
| the next head looked at only at the next look | 14 (the pin) | both fail (114.63 and 193.31 ms, 0.02%) |
| the other reading of step 3 | 14 (the pin) | both fail (73.56 and 99.17 ms, 1.44%) |
| `steamChannel` pushes at the sender's tick | 1 (check 4) and 15 | the three jitter settings of section 1 fail (the first difference at 19,456, 21,504 and 15,394 samples), and the hold of 40 ticks fails (opens 1, nothing dropped) |
| the stream's `advance` not mapped | 16 | the give-out check fails (33 of 46 pushes asked nothing, 21 gave another count); the samples still equal, as they must |
| the stream makes its arrivals from another seed | 16 | all three stream cases fail |
| the steam path still draws late frames from `jitterMs` | 17 | the `process()` checks fail (the stream was left unbroken) |
| `used.jitterMs` keeps the value on `steam` | 18 | both `steam` rows fail (A taken, B made again) and the B-key check fails |

## Done means

1. `node tests/run.mjs render-channel` passes: 89 s (one run, before the full run); in the full run 98.1 s.
2. `flock /tmp/tf2ve-heavy.lock node tests/run.mjs render-stream`, `stages` and `steam`: each passed inside the full
   run below (render-stream 354.5 s, stages 261.6 s, steam 159.9 s). The values that moved are the
   four above, each a `steam` case with jitter.
3. `flock /tmp/tf2ve-heavy.lock pnpm test`: every suite passed, 1173.2 s summed. The browser suite,
   `CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) flock
   /tmp/tf2ve-heavy.lock pnpm test:browser`: the suite passed, 321.1 s (its one changed check holds the control's new help, and the console's `net_fakejitter` help is held to the control's first sentence).
4. `git diff origin/main --stat -- voice-channel.js steam-sender.js opus-codec.mjs tests/accuracy.mjs
   tests/predictions/predictions.json` prints nothing.
5. `git diff origin/main --stat` shows only files the order allows, with `tests/verify.js` (the plan review's
   point 1) and `docs/VOICE-PATH.md` (its point 10).
6. `node tests/cache-number.mjs origin/main --report`: "cache number against origin/main (39bdd8e): the number is v42, not above v42: it must rise (node tests/cache-number.mjs origin/main --set)". The cached files changed are `app/console.js`, `app/render.js`, `audio.js`, `constants.js`, `engine/live-chain.js`, `engine/network.js`, `engine/render-stream.js`, `engine/render.js`, `engine/steam.js` and `index.html`; the builder did not set the number.
7. `grep -n "does not offer it" engine/render.js` prints nothing.
8. This report.

CI (`tests`, the `verify` job) on the branch: run 43443511309 on `22ea9c3` (the last commit that changes anything outside `docs/`): `verify` success, with `units`, `engine`, `render`, `stages` and `browser` each success. The report's commit changes only `docs/` and starts no run.

## The fix round (2026-11-13)

From the order's sections "Check (ii), run on BC-4a's branch" and "After the review and the second read", points
1 to 12, after a merge of `main` (W3-02d-2, and the two commits to the order).

**Code and checks.**

1. **The floor at a jitter of whole ticks.** `steamArrivals` and the second model take out 2 × (floor(J / 15) + 1)
   ticks. At 15, 30, 45, 60 and 90 ms this is one tick a crossing more than 2 × ceil(J / 15); elsewhere it is the
   same, so no recorded value moved (the full run below). Check 12 adds jitter 30 and 60, where the least of
   `at(p) − p` is now 0; check 13 compares the engine with the second model at 30 and 60 too. The engine's comment
   says why, and that a packet could leave at the exact age only on a draw of 0 (a chance of 2^-32 a draw).
2. **`arriveAt` answers for every whole tick.** `steamChannel` asks `arrive` for every tick from 0 up to the
   highest asked so far, once and in order: a fall, an answer that is not whole and an answer below 0 are each a
   RangeError with a message of its own. `process()` and `createRender` then ask through the render's last tick
   before `finish()`: the stream's last bound (`steamBoundTick`, every sample given to the sender and every message
   made), which `process()` now computes the same way. They ask it (`steamChannel`'s `ask`) without moving the
   channel: a break that advanced the channel there instead showed that running blocks past the end can move where
   an overflow is heard, which would move `codecInfo`. The option's comment says it answers for every whole tick
   and that an answer far past the end costs time in proportion (3.3 s for 1e8, the second reader's measure). New
   checks (section 19): a table that answers the message ticks only and falls between them, and one that falls
   only after the last message, throw in both with the same message; a table for every tick gives the same
   samples and `codecInfo` in both, and both ask the same ticks, 0 to the render's last, in order; an answer below 0
   is refused with its own message; every refusal now has to give the same message in both. Sections 15 and 16 now
   hold `arriveAt` to every tick in order, and section 16's give-out check reads the answer for the highest tick
   asked.
3. **The two checks the breaks passed.** Section 13: `fps` 0 and 5 give the arrivals of 10, and 2000 those of 1000,
   tick for tick, and say so. Section 19: under `arriveAt` with `jitterMs` 70, `codecInfo.arrivals.jitterMs` is 70.
4. **The renamed case** ('steam, jitter 500 ms on the file's own timing (does nothing)') is compared in its check
   with a render at jitter 0 made there.

**Words.**

5. What a render with jitter does, with the second reader's figures (measured on the model), in place of "plays
   about 70 ms later": `README.md` (the jitter bullet and the bullet on a render's start and end),
   `docs/VOICE-PATH.md`, finding 9, and `docs/ACCURACY.md`, which had the same sentence.
6. The two help strings: on Steam voice jitter acts only through the game's voice queue; on the file's own timing,
   and so for a video or a demo's voice, it does nothing. Each sentence of the control's help is under 115
   characters, and the console's help still starts with its first sentence.
7. `docs/FINDINGS.md`: three skips in the noise in all, two from 1 s after its start; check (ii)'s result; and the
   combined take's silence as the queue's. `docs/LIVE.md`: the sentence the first round's insert split is whole
   again, and the jitter sentence follows it. This report: no counts of checks or suites. `docs/ACCURACY.md`: check
   (ii)'s result where it said the run was not in yet, and the combined take's silence.

**The record** (`tests/REFERENCE_2026.md`, added and dated lines only; each changed line keeps its old text whole).

8. Finding 9: check (ii)'s figures, the bursts one by one and the two differences, with their standing.
9. Finding 9: no reading tried closes the two differences (the second reader's stand-in figures), the inference,
   and what block 2's log is read for first.
10. Finding 9: the render at jitter 0 has no look once a frame, and what that moves at each frame rate.
11. Finding 9: at exactly 66.67 frames a second the looks drift and the mean delay climbs (96.3 to 108.1 ms); the
    pin's figure is the first minute's.
12. Finding 8: the dated sentence closing the entry on the combined take. Also dated lines on the floor (beside
    finding 9's bullet) and in "What remains unverified" (network settings; loss on messages or on frames).

**The fix round's breaks.** Each in a scratch copy, the named sections run against it (`TF2_DIR`).

| Break | The check that caught it |
| --- | --- |
| the floor back to 2 × ceil(J / 15) | 12 (jitter 30 and 60, both rates) and 13 |
| `arrive` asked only on the ticks the channel is given | 19: the message-ticks table, the every-tick table, the answer below 0 |
| no refusal of an answer below 0 | 19: the row for an answer below 0 |
| `process()` does not ask through the render's last tick | 19: the table that falls after the last message, and the every-tick table |
| `createRender` does not ask through it | 19: the same two |
| the model's lowest frame rate 5, not 10 | 13: the frame-rate limits |
| the model's highest frame rate 2000, not 1000 | 13: the frame-rate limits |
| `arrivals.jitterMs` 0 under `arriveAt` | 19: the render's `jitterMs` under `arriveAt` |
| the steam path draws late frames from `jitterMs` (for point 4) | the renamed case's check in `tests/render-stream.verify.mjs` (8 late frames; the four moved cases' hashes fail too) |

**Done-means after the fix round.** Heavy runs inside `flock /tmp/tf2ve-heavy.lock`. `pnpm test`: every suite passed (render-channel 88.6 s, steam
152.4 s, render-stream 318.9 s, stages 244.2 s; 1086.1 s summed), so no recorded value moved. The browser suite
passed, 396.0 s. The `git diff --stat` of `voice-channel.js`, `steam-sender.js`, `opus-codec.mjs`,
`tests/accuracy.mjs` and `tests/predictions/predictions.json` prints nothing; `grep -n "does not offer it"
engine/render.js` prints nothing. `node tests/cache-number.mjs origin/main --report`: "cache number against
origin/main (179ea83): the number is v43, not above v43: it must rise (node tests/cache-number.mjs origin/main
--set)". CI on the fix round's code (run 43472228902 on `157d8ef`): `verify` success, and the five jobs each success. This line's commit changes only `docs/` and starts no run.

## What was not done, or is uncertain

- **The merge with W3-02d-2** is done (`8d801dc`, no conflict: the console lines sit in `presentRender` after the
  queue's line), and `main` was merged again for the fix round (`9386886`).
- **Not taken in the fix round** (the order's ruling): an `arriveAt` answer far past the render's end is not
  refused; whether a render with jitter should run past its source's end, so the last words are heard, is for
  another order.
- **The private checks** (i) and (ii) are the orchestrator's; both are run, and their figures are in finding 9.
- **W3-02d-2's sentence** "BC-4 moves `jitterMs`": `jitterMs` stays off `STAGE_OPTIONS.afterB` (ruling 7). By the
  orchestrator's ruling that sentence is corrected when W3-02d-2 is merged, not here. A changed jitter on a long
  source is marked and waits for the button on every codec; the engine starts from the kept codec result on Steam
  voice.
- **A lag that changes** (a spike): not built, and no order. It would need the lag in force as a function of time
  in `steamArrivals`: the lag moves toward `net_fakelag` at 200 ms a second (read), so a jump holds packets back
  while it rises and lets them out faster while it falls, a pause that can restart the queue and then a bunch that
  can skip. Listed here as an idea, as the order asks.
- **`codecInfo.arrivals.fps`** is the rate the model runs at, limited to 10 to 1000; `codecInfo.channel.fps` is
  the value as given. A choice of this build; the order did not say which.
- **A lost packet** is kept in the lists as if it had come (the order's simplification); in the game the packets
  behind it would wait a little less.
- **The live monitor and BC-4b**: the page's line under the control, `net_fakelag`, the signal chain's row and
  `docs/PAGE.md` are BC-4b's.
- **`audio.js`'s header** line for `engine/network.js` was edited (a comment); the order named only the two
  members in that file.
- **The tests' time**: `tests/README.md`'s row for `render-channel` gives 89 s, one run on a machine shared with
  another builder.
