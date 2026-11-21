# W3-27: the sender's clock on the rule as read

**Status 2026-11-21: planned; the rulings given ("The rulings", at the end); W3-27a being built while a plan
reviewer reads the whole order; W3-27b waits for W3-26b's merge and for both.** Written by a planner at `main`
`5505782` (cache v54) from the repository, the reference generator of the private study of 2026-11-21 and a
prototype built in a scratch copy of the tree.

**Kind:** a change to how renders are computed. Every seeded render of Steam voice with the codec on changes: the
sender reads the capture at other times and takes other chunks. A replay of real reads (a caller's clock), every
other profile, received voice and a render with the codec switched off do not change by a sample.
**Parts:** two orders, two merges. **W3-27a** adds the clock to `steam-sender.js` beside the one that runs, with
its reference and its suite; no render changes. **W3-27b** makes it the sender's clock, takes the old one out,
measures the queue's arrival constant again, records what moved and rewrites the words.
**Roles:** W3-27a: `tf-builder` (effort high), then `tf-reviewer`. W3-27b: `tf-builder` (effort xhigh), then
`tf-reviewer`, then a second reader on the stronger model (`docs/PIPELINE.md`: it changes how renders are computed
and what a constant is).
**Branches:** `claude/w3-27a-read-clock`, then `claude/w3-27b-sender-clock` from `main` after W3-26b's and
W3-27a's merges. **Worktrees:** in the briefs.
**Reports:** `docs/reports/W3-27a-read-clock.md` and `docs/reports/W3-27b-sender-clock.md` (the builders'). The
planning report is `docs/reports/W3-27-plan.md`.
**Budget:** W3-27a 3 hours, W3-27b 6 hours.
**Cache number:** it rises at both merges, since `steam-sender.js` is a file the site keeps offline and both
parts change it. A builder never sets it.

## Why

A source file has no packets, so a render makes them as Steam does, and the one thing it draws is when Steam reads
the microphone. Since W3-16 the app draws each read 48.0 to 63.7 ms after the last, evenly, and has each capture
step of 31.25 ms ready up to 13 ms late (fitted on one demo).

On 2026-11-20 what times the read was read in Steam's client and in Windows's files, each twice
(`tests/REFERENCE_2026.md`, finding 28, the paragraphs added on 2026-11-20). On 2026-11-21 a private study put
that rule together as one generator and scored it against the sets beside the app's clock (finding 28, the last
added paragraph; measured once). The rule gives what the sets show and the app's clock does not:

| | Sets J and L (reads), L and D (chunks) | The rule | The app's clock as built |
| --- | --- | --- | --- |
| Reads on the game's tick | 61.9 and 62.9% | 62.7% | 32.6%, which is chance |
| A timeout after a pass the game began | 54.4 and 54.4% | 54.7% | has no such thing |
| Chunk ends at the favoured place in 8 | 15.3 and 15.5% | 16.1% | 13.7 and 13.1% |
| One-step chunks at that place and the next | 22.5 and 23.2%, 21.8 and 24.3% | 24.7 and 25.0% | 14.5 and 14.6% |
| Three-step chunks at the two places after | 0 of 7, 1 of 31 | none | about a fifth |

All of this table is measured once, by the study, and is quoted from the record.

**The orchestrator's rulings (2026-11-21):**

- `createClock` runs the rule as read: the 50 ms pass with its whole-millisecond wait; the game's fetch once a
  tick as a wake; a timeout on Windows's timer step counted on from the last timeout, with its slip; the
  capture's 750-sample steps filled by 10 ms packets, with the lateness.
- A render's sender by default is the owner's PC as measured: a 15 ms tick, 294 frames a second, 10 ms packets,
  a lateness of 0 to 9 ms. Every phase is a seeded draw.
- The sender's frame rate, its tick, the packet length (10 or 20 ms) and the lateness are options of the clock,
  each with its standing in the code's comment. The page gets no control in this order.
- A read still brings whole steps, and the clock's interface (`next()`, `lead`, a caller's own clock) does not
  change. A replay of real reads must not move by a sample.
- W3-26b merges first and moves every `steam` render with the codec on. This order moves them again.

## What is read, measured and fitted

Every number of the clock, with its standing. "Fitted" names the set it was fitted on. The evidence is finding 28;
this table only gathers it.

| Part | Number | Standing |
| --- | --- | --- |
| The pass | 50 ms, a wait in whole milliseconds, truncated; a wake under 1 ms before the deadline ends the pass | read, twice |
| Where in the pass the read falls | 0.05 to 1.55 ms after its start, evenly | fitted, Set J |
| The game's fetch | once for each tick the client runs, in the first frame at or after the tick's time | read; that it wakes Steam's loop is inferred, and fits Sets J and L |
| The game's tick | 15 ms | read |
| The game's frame rate | 294 a second | measured: the owner's `net_graph` at `fps_max 300` |
| Where in its frame the fetch falls | within 1 ms of the frame's start, evenly | fitted, Set J; weak |
| Other wakes | 3 a second, at random | fitted, Set J; weak |
| The timer's step | 15.625 ms, counted on from the last timeout | measured twice (Sets J and L) as about 15.6 ms; 15.625 is Windows's default and is not fitted |
| The step's slip | one draw a timeout, normal, 1.3 ms | measured once (the seven-step gaps of Sets J and L); the record's first count has 1.5 ms |
| How early a step may come | 1 ms before the wait is due | fitted, Set J |
| The capture's step | 750 samples, 31.25 ms | read, twice |
| The capture's packets | 10 ms; a step can be read once the packet that holds its last sample is in | measured on three sets; that the layer below works in such packets is inferred |
| Packets of 20 ms | on another PC, in two stretches | measured twice (Set Q) |
| The lateness | 0 to 9 ms after that packet, evenly | fitted, Set L's real microphone; holds on Set D, which it was not fitted on (measured once) |
| A lateness of 0 to 20 ms | another PC's | fitted, Set Q; no cause read |
| Three steps a read at most | | the app's own; with the defaults no read asks for more (measured on the reference, 2,000,000 reads) |
| The phases | the tick's, the frame's, the capture's against the clock, the timer's | drawn: nothing read or measured ties them |
| The capture's place in its 250 ms pattern | which of 8 steps is the long one | drawn; chosen by this order (see "The capture's place") |
| The capture's phase against the sound | 0 to 749 samples | drawn; inferred by W3-21 that the capture runs free of the sound |

## The rule

In the order's own words. All times are in milliseconds and all arithmetic is double precision. A builder can port
from this section; the study's generator is in `tests/steam-sender/gen.mjs` for a doubt (it is the orchestrator's
file: a builder does not edit it).

**The numbers** (a frozen member `clock` of `STEAM_SENDER`, in ms unless said): `pass` 50, `tick` 15, `fps` 294,
`fetchSpread` 1, `otherRate` 3 (a second), `timerStep` 15.625, `slip` 1.3, `tolerance` 1, `work` 0.05,
`workSpread` 1.5, `packet` 10, `late` 9, `maxSteps` 3. The step is `stepMs = 1000 × 750 / 24000`, 31.25.

**The six sources of random numbers.** `R(mix) = mulberry32((seed ^ mix) >>> 0)`, the engine's generator, one
for each part, so that a change to one part leaves the others' draws alone:

| Source | `mix` | Draws |
| --- | --- | --- |
| `P`, the phases | `0x1F123BB5` | seven numbers when the clock is made, in the order below |
| `G`, the game | `0x2545F491` | one for each frame, where in the frame its fetch falls |
| `T`, the timer | `0x51ED270B` | two for each slip |
| `W`, the work | `0x6C8E9CF5` | one for each read |
| `C`, the capture | `0x3C6EF372` | one for each capture step, its lateness; none when `late` is 0 |
| `O`, the other wakes | `0x7F4A7C15` | one for each other wake |

**When the clock is made**, with `frame = 1000 / fps` and `cycle` 8 for 10 ms packets and 16 for 20 ms ones:

1. `tickPhase = tick × P()`: the first tick's time.
2. `framePhase = frame × P()`: the first frame's start.
3. `capPhase = packet × P()`: the capture's packets against the clock.
4. `anchor = −timerStep × P()`: the end of the last timeout before the clock starts.
5. `place = floor(cycle × P())`: how many steps the capture had made before the clock starts (see "The capture's
   place"). An option `place` given takes its place; the draw is still made.
6. `lead = floor(750 × P())`: the capture's phase against the sound (see "The capture's phase against the
   sound").
7. `phase = 0.25 × P()`, in seconds: where the reads lie on the float's grid, as before (`phaseSpan`).
8. `otherT = −ln(1 − O()) × 1000 / otherRate`: the first other wake. Written `((−ln(1 − O())) × 1000) / otherRate`.
9. `nextReady = ready(1)`: the first capture step's time, which draws `C` once.

Draws 1 to 4 are the reference's, in its order. Draws 5 to 7 are the app's, after them, so the reference's clock
is the app's with `place` 0.

**The capture.** Step `k`, from 1, can be read at

`ready(k) = (capPhase + (packet × ceil(stepMs × (k + place) / packet − 1e-9) − stepMs × place)) + late × C()`

with the last term left out, and no draw made, when `late` is 0. With 10 ms packets seven steps of eight come
30 ms apart and one 40 ms; with 20 ms packets nine of sixteen rest 40 ms and seven 20 ms. A step is never ready
before its last sample is captured, `capPhase + stepMs × k` (arithmetic).

**The game's fetches**, made as they are needed. State: `frameT = framePhase`, `tickN = 0`, an empty queue.

- *More fetches:* repeat: count `due`, the ticks with `tickPhase + tickN × tick ≤ frameT`, adding 1 to `tickN`
  for each; `t0 = frameT + fetchSpread × G()` (drawn for every frame, due or not); `frameT += frame`; if `due`
  is above 0, queue `t0 + 0.02 × i` for `i` from 0 to `due − 1` and stop. The 0.02 ms between two fetches of one
  frame is the reference's own (chosen).
- *The next fetch after `t`:* drop the queued fetches at or before `t`; if one is left, it is the answer;
  otherwise make more and look again.

**The other wakes.** *The next after `t`:* while `otherT ≤ t`, `otherT += −ln(1 − O()) × 1000 / otherRate`; the
answer is `otherT`.

**A timeout's end**, for a wait due at `due`. State: `slipN = −1`, `slipV`.

- `n = max(1, ceil((due − tolerance − anchor) / timerStep))`.
- Repeat: if `n` is not `slipN`, set `slipN = n` and `slipV = slip × z`, with `u = 1 − T()`, `v = T()` and
  `z = sqrt(−2 ln u) × cos(2π v)`. `q = (anchor + n × timerStep) + slipV`. If `q ≥ due − tolerance` the end is
  `max(q, due)`; otherwise `n += 1`.

So a step keeps its slip while one pass waits again after a wake, and a step up to 1 ms before the due time
ends the wait at the due time.

**A read** (`next()`). State: `start = 0`, `by = 'start'`, `capK = 0`, `capReady = −Infinity`.

1. `readT = (start + work) + workSpread × W()`.
2. `slipN = −1`.
3. `n = 0`. While `n < maxSteps` and `max(nextReady, capReady) ≤ readT`: `capReady = max(nextReady, capReady)`,
   `capK += 1`, `n += 1`, `nextReady = ready(capK + 1)`. A step left over by the limit of three stays for the
   next read.
4. The read is `{ time: phase + since, since: readT / 1000, samples: 750 × n, by }`, in seconds as before.
5. The wait. `now = readT`, `deadline = start + pass`. Repeat:
   - `left = floor(deadline − now)`, `due = now + max(0, left)`, and the timeout's end `tOut` is `now` when
     `left ≤ 0` and "a timeout's end" for `due` otherwise.
   - `g` is the next fetch after `now` and `w` the next other wake after `now`; `wake = min(g, w)`.
   - If `wake < tOut`: `now = wake`. If `deadline − now < 1` the pass ends: `start = now`, and `by` is `'game'`
     when `g ≤ w` and `'other'` otherwise. If not, wait again.
   - Otherwise the wait timed out: `start = tOut`, `by = 'timeout'`, `anchor = tOut`, `slipN = −1`.

`by` says what ended the pass before the read. The sender does not read it; the suite does.

**What the reads look like** (measured on the prototype, seeds 1 to 40, 20,000 reads each; "+-" is the spread of
one seed): 47.5 to 67.4 ms apart, 55.52 ms in the mean (+-0.02), 18.01 a second; chunks of one, two and three
steps 23.9, 74.5 and 1.6%; the first read brings nothing, the first chunk comes with the second or third read,
and no read after it is empty.

**Precision.** The prototype gives the reference's reads to the last bit: time, steps and `by`, over 200,000
reads at each of eight settings (seeds 1, 2 and the default; packets of 20 ms; a lateness of 20 ms; 30, 60 and
144 frames a second; a tick of 30 ms), with `place` 0. It needs the grouping written above and nothing else. The
suite runs the port and the reference in one process, so `Math.log` and `Math.cos` are the same on both sides.
On another engine a slip or another wake's time could differ in its last digit. A render then differs only if
that digit decides a comparison of two times, which is a chance of the order of 1 in 10^13 a read (arithmetic).
The recorded hash of the clock is Node's. If a later Node moves it, that is a finding to report, not a tolerance
to widen.

## The capture's place in its pattern

Settled by this order; the study's generator does not have it, because its scores do not depend on it.

With 10 ms packets the capture's steps repeat a pattern of 8: one step of 8 rests 40 ms and the others 30. Where
the long step falls against the sound depends on when the capture began. The reference starts the capture with
the clock, so in a render the long step would fall at the same place of the source for every seed. A test signal
built on a 250 ms grid would then meet the pattern at one place every time. That is the fault W3-21 mended for
the 31.25 ms grid, one level up.

Measured on the prototype with the suite's own signal (1000 from sample 24,000 to 215,999 of 240,000, seeds 1 to
2,000): the silence record after the spurt is one step long in 34.6% of seeds with the place fixed at 0 and in
22.6% with the place drawn. The clock as built gives 23.3%, and Set D's demo has 2 of 19 (measured, finding 28).

So the clock draws `place`, 0 to 7 (0 to 15 with 20 ms packets): the capture had made that many steps before the
clock starts, and they are not read. It turns the pattern and changes nothing else: the reads' times do not move,
and step `k` is still never ready before `capPhase + stepMs × k`.

## The capture's phase against the sound (W3-21's `lead`)

W3-21 took `lead` from the clock's capture draw `c0`, which ran over a whole step. The capture's draw now runs
over one packet, 10 ms, so it cannot give a phase over a whole step. `lead` becomes a draw of its own, the sixth
of the phases: `floor(750 × P())`, each whole value from 0 to 749 alike.

Everything else of W3-21 stands as built: the sender reads `lead` zeros before the source's first sample; the
times it counts from the render's start are the reads' less `lead / 24000` s; Steam's own clock is not shifted;
positions are in samples of the source; `opts.lead` overrides; a caller's clock has a lead of 0 unless one is
given.

What W3-21 established, measured again on the prototype:

| | W3-21 as built | The prototype |
| --- | --- | --- |
| The lead over seeds 1 to 100,000 | every value from 0 to 749 | every value from 0 to 749, each 87 to 166 times |
| A 1 s burst on the 31.25 ms grid covers 33 steps | 199 of 200 seeds | 199 of 200 seeds |
| The same with a lead of 0 | 32 steps in every seed | 32 steps in every seed |
| Frames its spurt sends, with the lead and with a lead of 0 | 80.04 and 78.50 | 79.85 and 78.15 |
| Frames a phrase at the eight 1 s bursts of the public test signal, 40 seeds | 79.93 (+-1.88) | 79.58 (+-1.86) |

Set D's demo has 79.63 frames a phrase at those bursts (measured, finding 28).

## What a render reads from the clock

Four things, and one invariant.

1. **The chunk's length**, `samples`: 0, 750, 1500 or 2250, as before. The sender's `MAX_CHUNK`, the engine's
   `steamReach` and the live chain's hold all rest on three steps at most, which is why the clock keeps the
   limit.
2. **The read's time on Steam's clock**, `time`: `phase + since`. The sender adds the uptime and narrows it to a
   float, as before. Only the hold reads it.
3. **The read's time from the render's start**, `since`: the sender takes `lead / 24000` from it and puts the
   message on the first 15 ms tick at or after 2 ms later, and on a later tick than the message before
   (`arrival()`, not changed).
4. **The lead**, above.

**The invariant.** The render's stream and the live chain give out sound on the strength of one statement: a read
is never earlier than the end of the last capture step it takes, so a message's tick is never below
`steamBoundTick`. It holds on the rule by arithmetic (`ready(k) ≥ capPhase + stepMs × k`) and on the prototype:
over 1,200 clocks of 20,000 reads, `since × 24000` was never less than the samples taken so far, by at least
1.6 samples.

**The hold.** A spurt's last chunk is the first one read more than 0.4 s of the float clock after the last active
one. The reads now come more evenly over half a second than a free walk gives (measured, the study: the eighth
read on lies 9.2 ms from eight even steps, where the clock as built has 12.9 and Sets J and L 10.7 and 9.7). So
fewer spurts end a chunk early:

| The sender's Steam has run | Ends on the 7th, 8th and 9th chunk, as built | The prototype |
| --- | --- | --- |
| 4 hours | about 20, 80 and 0% | 10.0, 90.0 and 0% |
| 9 days (the default) | 26.5, 70.8 and 2.8% | 22.0, 76.3 and 1.7% |
| 18 days | 13.2, 44.3 and 39.1% | 11.0, 44.3 and 41.3% |

Measured on the two models, 300,000 reads. Set D's 19 clear ends are 7, 12 and 0 (measured, finding 28): at 22%
seven or more of 19 come about one time in ten. The default uptime rests on Set D's ends tested on the demo's own
chunks, not on a clock, so this order does not move it. Putting Set D's ends against the clock at each uptime is
a private run for the orchestrator (see "The private runs").

**The ticks.** 64% of the reads of a seed now lie in one window of 4.5 ms of the sender's 15 ms tick (measured on
the prototype), and `arrival()` rounds every read up to a tick of the render's own grid. Where that window lies
on the grid depends on the seed. Messages 3, 4 and 5 ticks apart were 30.5, 66.6 and 2.9% and are 31.6, 66.7 and
1.8% (measured, seeds 1 to 400 of the suite's signal).

### The arrival constant

`voice-channel.js` holds `ARRIVAL_SECONDS`, 50.5 ms: how long, in the mean, the opening packet of a spurt takes
to arrive after its last sample was captured. It is the model's own figure, measured on the sender's clock
(seeds 1 to 50, W3-02c-1), and the queue's zero `D` is built on it. The record already says that it should be
measured again over many seeds (finding 28, W3-21's lines).

The clock moves it. Measured on both models over layouts P and Q of `tests/voice-channel.verify.mjs`, at 300 and
66.67 frames a second, with only `latency()` taken out:

| Seeds | As built | The prototype |
| --- | ---: | ---: |
| 1 to 400 | 51.7 ms | 42.5 ms |
| 401 to 800 | 51.1 ms | 41.8 ms |
| Both | 51.4 ms | 42.1 ms |

A seed's own mean spreads 0.3 ms about each half's (the standard error over its 400 seeds). By frame rate the
prototype has 43.1 ms at 300 and 41.4 at 66.67.

Of the 9.3 ms, 10.6 are a convention and not the sender's timing: the capture begins 0 to 10 ms after the
render's start where it began 0 to 31.25 ms after it, so every sound is captured 10.6 ms sooner on the render's
own clock (arithmetic: the two means, 5 and 15.6 ms). The steps are ready 2.4 ms later (arithmetic: 4.4 ms to the
packet's end and 4.5 of lateness, against 6.5). What is left, about 1 ms sooner, is the reads. Nothing heard rests
on the convention, because the constant is measured with it.

**So W3-27b measures the constant again and sets it:** the mean over seeds 1 to 800 of both layouts at 300 and
66.67 frames a second, rounded to half a millisecond. The planner's prototype gives 42.0 ms. `D` is on whole
blocks of 512 samples (11.6 ms), so it moves by a block or not at all:

| Frames a second (`voice_buffer_ms` 100) | 10 | 20 | 30 | 50 | 60 | 66.67 | 100 | 144 | 200 | 300 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `D` with the codec's look-ahead, as built | 9728 | 10240 | 10752 | 12288 | 12800 | 13312 | 15360 | 18944 | 22016 | 24576 |
| at 42.0 ms | 9216 | 9728 | 10752 | 11776 | 12288 | 13312 | 15360 | 18432 | 22016 | 24064 |
| `D` with no codec delay, as built | 9216 | 9728 | 10752 | 11776 | 12800 | 13312 | 15360 | 18432 | 22016 | 24064 |
| at 42.0 ms | 8704 | 9728 | 10240 | 11776 | 12288 | 12800 | 14848 | 17920 | 21504 | 24064 |

Computed. A render always has the codec's look-ahead; only the suite calls the queue with no codec delay. At
42.5 ms the first pair of rows is the same, so a render does not depend on which half millisecond the builder's
mean rounds to. A render on the game's voice queue at the page's defaults (300 frames a second) therefore plays
512 samples sooner, and the live monitor on the queue is 11.6 ms sooner there (below).

The constant places the sound; it does not change what the queue does. The opens, the overflows, the underruns
and the fades are the same at any value of it.

## The seeds

A seed still gives one clock, and the same seed gives the same reads on every machine that runs Node's
arithmetic. What a given seed means changes: every seeded `steam` render moves. The page gives no seed, so the
page's render is the default seed's, `0xC0FFEE`: one draw of the phases (on the prototype a lead of 377 samples;
49 as built).

The old clock's two sources go with it (`seedMix`, `seedMixCapture`). Their two values are among the six above
by the reference's choice; nothing ties the streams.

## The options

`createClock({ seed, fps, tick, packet, late, place })`. Each is the default when left out. One that is given
and is not a finite number, or is outside its range, is a `RangeError` that names it.

| Option | Default | Range | Standing, for the code's comment |
| --- | --- | --- | --- |
| `fps` | 294 | 10 to 1000 | measured on the owner's PC at `fps_max 300`. At any other rate the reads are the rule's own figures; no set scores them |
| `tick` | 15 ms | 5 to 100 | read: TF2's client tick. Another tick is the rule's own figure |
| `packet` | 10 ms | 10 or 20 | 10 measured on three sets, its cause inferred. 20 measured on another PC in two stretches; why is not read |
| `late` | 9 ms | 0 to 31.25 | fitted on the owner's PC (Set L), holds on Set D. 20 fits another PC (Set Q). No cause read |
| `place` | drawn | a whole number from 0 to 7, or to 15 with 20 ms packets | chosen; for the tests |

A render has no way to pass them in this order: `createSender` makes its clock from the seed alone, and a test
that wants another sender makes the clock itself and gives it with its `lead`.

**What the rule says of other senders** (measured on the prototype, 20 seeds of 20,000 reads; the record has the
same figures from the study):

| Sender | Reads a second | Mean interval | Chunks of one, two and three steps |
| --- | ---: | ---: | --- |
| 30 frames a second | 17.05 | 58.64 ms | 16.7, 78.9 and 4.4% |
| 60 | 20.00 | 50.00 ms | 40.0, 60.0 and 0% |
| 100 | 17.72 | 56.43 ms | 22.4, 74.5 and 3.0% |
| 144 | 18.24 | 54.84 ms | 26.1, 72.2 and 1.6% |
| 294 (the default) | 18.01 | 55.52 ms | 23.9, 74.5 and 1.6% |
| 400 | 17.93 | 55.78 ms | 23.3, 74.9 and 1.8% |
| a tick of 30 ms | 16.74 | 59.75 ms | 14.0, 80.8 and 5.2% |
| a lateness of 20 ms | 18.01 | 55.52 ms | 26.9, 68.4 and 4.7% |
| packets of 20 ms | 18.01 | 55.52 ms | 24.2, 73.9 and 1.9% |

With a lateness of 20 ms a read now and then brings nothing (211 of 400,000), and the sender then runs its
states as it does for any empty read. With a lateness of 20 ms and 20 ms packets together a read would ask for
four steps 9 times in 2,000,000 (measured on the reference); the limit of three leaves the fourth for the next
read.

**What a control on the page would be worth: a question for later, not built.** The sender's frame rate moves
the number of messages a second by 5% down to 11% up and the share of short chunks, and with them which chunk a
spurt opens and ends on, by a capture step at most at each end. It does not move the level or the spectrum
(below). For someone else's voice the sender's frame rate cannot be known, like the uptime. No take has a sender
at a known other rate: Set Q's sender ran 55.0 ms a read (measured, the study), so not at 60 frames a second. A
control would be a guess until such a take exists.

## W3-27a: the clock beside the one that runs

### The module

`steam-sender.js` gains `STEAM_SENDER.clock` (the numbers of "The rule", frozen, with a comment that gives each
its standing in the words of the table above and the six `mix` values) and a fourth export, `createReadClock`:
the rule, with the options, returning a frozen `{ next(), lead, place }`.

Nothing calls it. `createClock`, `createSender` and every existing constant stay as they are, so no render and
no recorded hash moves. The header gains one paragraph that says the clock is there and that W3-27b makes it the
sender's.

### The reference

`tests/steam-sender/` holds, as the planner left them:

- `gen.mjs`, the study's generator (`createReadClock({ seed, ... }).next()` gives `{ time, samples, by }` in ms
  and samples). It is our own code and holds nothing of the owner's files or logs. It is the orchestrator's: a
  builder does not edit it. The `README.md` its header names is the study's private note and is not in the
  repository. Its options `frameJitter`, `fresh`, `recording` and `phaseCap` are the study's and the port does
  not have them.
- `vector-seed1.json`: `node tests/steam-sender/gen.mjs 300 seed=1`, 300 reads with times to a thousandth of a
  millisecond. Its SHA-256 begins `a64fc17735f4dc63`.

The builder adds `tests/steam-sender/README.md` in the form of `tests/roomdsp/README.md`: what each file is,
whose it is, how the vector is made.

### The suite

New sections of `tests/steam-sender.verify.mjs`, after the existing ones. Every check with the break it catches;
the builder makes each break and sees it fail. The figures are the planner's prototype's.

1. **The reference is the study's.** `gen.mjs` run for 300 reads at seed 1 and printed as its own program prints
   gives `vector-seed1.json` byte for byte. Break: any number of `gen.mjs` changed.
2. **The port is the reference, to the last bit.** With `place: 0`, for seeds 1 to 400 and 2,000 reads each, and
   for 200,000 reads at each of the eight settings of "Precision": `since` is `Object.is` to the reference's
   `time / 1000`, `samples` and `by` are equal. Breaks, each of which moves a read: the wait not truncated to
   whole milliseconds; a wake ending the pass at any time; the slip drawn again when a pass waits again; the
   timer's steps counted from the due time and not from the last timeout; `tolerance` 0; a fetch for every frame
   and not for every tick; the capture's packet rounding left out; the grouping of any sum of "The rule".
3. **Three steps at most.** At seed 9 with 144 frames a second, a lateness of 20 ms and 20 ms packets the
   reference's read 9,858 (from 0) brings four steps. The port's brings three and its next read one more than
   the reference's, and from then on the two agree again. Over 300 seeds of 20,000 reads at four settings no
   read is above 2250 samples or off whole steps. Break: the limit taken out.
4. **The place turns the pattern and nothing else.** For seeds 1 to 50 and every `place`: the reads' `since`,
   `time` and `by` equal those at `place` 0 bit for bit; the steps equal a second computation in the suite, of
   ten lines, from the reads' times, the suite's own draws of `capPhase` and of `C`, and `ready(k)` as written.
   The drawn place takes every value from 0 to 7 over seeds 1 to 400. Break: `place` added to the packet count
   and not taken from the time; the place's draw moved before the anchor's.
5. **The draws.** The clock's `lead` and `place` and the phase `time − since` equal the suite's own fifth, sixth
   and seventh draws of `P`; the lead takes every value from 0 to 749 over seeds 1 to 100,000; the phase spreads
   over 0 to 0.25 s; an unseeded clock is seed `0xC0FFEE`'s; two seeds differ and one repeats. Break: the lead
   taken from the capture's draw.
6. **The reads never run ahead of the capture.** For 300 seeds at four settings (the defaults, 20 ms packets, a
   lateness of 0, and 30 frames a second with 20 ms packets and a lateness of 31.25 ms): `since × 24000` is at
   least the samples taken so far at every read, and `time` never falls. Break: the lateness drawn from −5 ms.
7. **The statistics, against the record's figures.** Seeds 1 to 20, 20,000 reads each, pooled. Each band is the
   prototype's figure and about five times its spread over such runs; each catches the breaks named, which were
   tried on the reference (the planning report has the whole table). The record's figures for the sets are
   beside them for the reader. The suite's definitions are the order's own and close to the study's, not the
   same.

   | Statistic | Band | The record | A break outside the band |
   | --- | --- | --- | --- |
   | Mean interval | 55.42 to 55.62 ms | Sets J and L 55.43 and 55.37; the rule 55.54 | `tolerance` 0 (56.05); no steps (55.04); a timer step of 15 or 16 ms (54.21, 55.88); a pass of 49 or 51 ms |
   | Least and most | at least 47.5, at most 69 ms | 47.75 to 64.13 and 47.85 to 64.44 | a wake that ends the pass 2 ms early |
   | Intervals under 49 ms | 1.9 to 2.7% | 3.0 and 2.3% | no spread of the read in its pass (0%); a pass of 49 ms (10.5%) |
   | Reads in the fullest 4.5 ms window of the tick | 63.4 to 64.7% | 61.9 and 62.9%; the rule 62.7 | no fetch (30.5%); no steps (58.5%); `tolerance` 0 (67.0%) |
   | A read off that window after one in it | 50.7 to 53.0% | 54.4 and 54.4%; the rule 54.7 | `tolerance` 0 (45.4%); a step of 15 ms (73.8%) |
   | A read off it after one off it | 5.9 to 9.4% | 13.9 and 7.7%; the rule 8.0 | no steps (23.0%); 12 other wakes a second (12.2%) |
   | Neighbouring reads off it 107 to 111 ms apart, of those under 200 ms | 56.5 to 62.5% | 54 and 59%; the rule 58 | no steps (13.4%); a slip of 2.6 ms (38.7%); a step of 16 ms (20.6%) |
   | Autocorrelation of the intervals at lags 2 and 4 | −0.22 to −0.16, −0.27 to −0.21 | −0.08 and −0.19, −0.18 and −0.23 | the clock as built (0 and 0) |
   | Chunks of one, two and three steps | 23.5 to 24.4, 73.8 to 75.1, 1.3 to 1.9% | Set L 24.1, 74.7, 1.2; Set D 23.4, 74.8, 1.8 | a lateness of 0 (23.0, 76.4, 0.6) or of 13 ms (24.8, 72.8, 2.5) |
   | Chunk ends at the favoured place in 8 | 15.6 to 16.6% | 15.3 and 15.5%; the rule 16.1 | no packets (12.5%) |
   | Chunk ends at each other place | 11.5 to 12.6% | 11.7 to 12.5% | no packets |
   | One-step chunks ending at that place, and at the next | 22.5 to 26.5% each | 22.5 and 23.2, 21.8 and 24.3 | no packets (12.5%) |
   | Two-step chunks ending at the next | 7.4 to 9.0% | 9.1 and 8.8 | no packets (12.5%) |
   | Three-step chunks ending at the two after | under 0.5% | 0 of 7, 1 of 31 | no packets (25%); a lateness of 13 ms (0.67%) |
   | Pairs one-one, one-three and three-one | under 0.12%; 1.0 to 1.45% each | Set D 0.3, 1.4, 1.7 | a lateness of 13 ms (0.20, 1.9) |
   | Reads a second | 17.97 to 18.05 | | a pass of 51 ms (17.64) |

   The place of a chunk's end is its running count of steps plus the clock's `place`, modulo 8; the favoured
   place is 0. The window is the fullest stretch of 4.5 ms of `since` modulo 15 ms, in bins of 0.25 ms.
8. **The clock as built fails the places.** The suite's existing second copy of the old clock, through the same
   counting, gives 12.5% at every place and no lag-2 autocorrelation. This is the break of check 7 kept as a
   check, so that the counting itself is tested. Break: the place counted from the read's index and not from the
   steps.
9. **Packets of 20 ms give the 16-place form.** With `packet: 20`, seeds 1 to 20: every one of the nine long
   places (1, 3, 5, 7, 8, 10, 12, 14 and 0 of 16) holds more chunk ends than any of the seven short ones, the
   mean of the long over the mean of the short is 1.7 to 2.4 (measured 2.02), and with 10 ms packets the same
   ratio is 0.9 to 1.1. Break: the packet length not reaching `ready()`.
10. **The other senders.** 30 frames a second: 58.5 to 58.8 ms a read and chunks within 0.8 of 16.7, 78.9 and
    4.4%. 60 frames a second: 49.99 to 50.01 ms and chunks within 0.1 of 40, 60 and 0%. A tick of 30 ms: 59.6
    to 59.9 ms. A lateness of 20 ms: chunks within 0.8 of 26.9, 68.4 and 4.7%, and at least one empty read after
    the first chunk in 400,000. Break: an option read and not used.
11. **Refusals.** `fps` 9 and 1001, `tick` 4 and 101, `packet` 15, `late` −1 and 32, `place` 8 (16 with 20 ms
    packets) and 1.5, and each given as `NaN`, a string or `null`: a `RangeError` that names the option.
12. **The module.** Its exports are the four; `STEAM_SENDER.clock` is frozen and holds the order's numbers; the
    file still draws only from its seed. The existing sections pass with no line changed but the list of
    exports.

A row for the new sections goes into `tests/README.md`.

### W3-27a: files and done

May touch: `steam-sender.js`, `tests/steam-sender.verify.mjs`, `tests/steam-sender/README.md` (new),
`tests/README.md` (one row), `tests/predictions/PREDICTIONS.md` (one dated line), and the report. May not touch
anything else.

`steam-sender.js` is a hashed model file of the registered predictions, so its change is noted in
`PREDICTIONS.md` in the form of W3-21's line: a clock was added that no render runs, and no render and no
recorded hash moved.

Done means: `pnpm test steam-sender harness site` passes; `node tests/render-stream.verify.mjs --hashes` prints
what it prints on `main` (no render moved); each break was made and seen to fail its check, and is in the
report; CI's `verify` is green on the branch's head.

## W3-27b: the sender's clock

On `main` after W3-26b's and W3-27a's merges.

### The sender (`steam-sender.js`)

- `createClock` is the rule: what W3-27a called `createReadClock`. That name goes; the exports are the three
  again. Every use of the name in the suite follows.
- The clock of W3-16 goes, with `readMin`, `readMax`, `captureLate`, `seedMix` and `seedMixCapture`.
- `createSender` is not changed but for its comments: it makes `createClock({ seed })`, takes its `lead`, and
  accepts a caller's clock as before. A read's `by` and the clock's `place` are not read by it.
- The header and the comments say what runs now: the rule in a paragraph, each number's standing as in "What is
  read, measured and fitted", the options, and that the reference is `tests/steam-sender/gen.mjs`.

### The arrival constant (`voice-channel.js`)

`ARRIVAL_SECONDS` becomes the mean measured as "The arrival constant" says, with its comment rewritten: the
seeds, the count of spurts, the mean at each frame rate, the date, and that 5 ms of it are the capture's start
against the render's start. The comments that give `D` in samples (at `zero()` and at `createTimeline`) take the
new values. Nothing else in the file changes.

If the builder's mean rounds to another half millisecond than 42.0, the builder uses its own, says so in the
report, and recomputes the table of `D` above.

### The live chain

The live sender runs `createSender` with the render's seed, on the samples pushed to it and on no wall clock
(`engine/live-chain.js`). So the monitor's sender changes exactly as a render's does and no code of the chain
changes.

- **Without the queue** the monitor's latency does not move: the chain holds back the longest chunk, which is
  still three steps, and the pre-roll.
- **On the game's voice queue** the chain holds back `D`. At 42.0 ms the monitor is 11.6 ms sooner at 10, 20,
  50, 60, 144 and 300 frames a second and unchanged at 30, 66.67, 100 and 200 (computed; `voice_buffer_ms` 100).
- The chain's own bound on a message's tick is the invariant of "What a render reads from the clock", which
  holds.

`docs/LIVE.md`'s table of the queue's hold takes the new figures, on top of W3-26b's.

### What moves, and what must not

Measured by the planner on prototypes against `main` `5505782`. Every figure is of the model. W3-27b's builder
measures each again on its own base, after W3-26b, and the report gives both.

**The queue on the test signal** (142.9 s; Steam voice on the game's voice queue at the page's other defaults;
seeds 1 to 40; each cell is the mean as built, then the prototype's, with one seed's spread after "+-" where it
matters; the arrival constant was left at 50.5 ms in both, and the queue's counts do not depend on it):

| The listener's frames a second | 300 | 66.67 | 30 |
| --- | --- | --- | --- |
| Times the queue opens | 15.0, 14.7 | 18.0, 18.0 | 18.0, 18.0 |
| Spurts that join an open queue | 3.4, 3.6 | 0.5, 0.3 | 0.5, 0.3 |
| Overflows | 91.1 (+-10.5), 83.9 (+-7.9) | none | none |
| Samples the overflows drop | 74,731 (+-7,677), 71,248 (+-5,672) | none | none |
| Pulls that find the queue empty | 20.1, 19.7 | 21.6, 21.4 | 36.2, 35.3 |
| Pulls with a fade | 318 (+-172), 404 (+-252) | 178.1, 178.1 | 1,518 (+-617), 1,721 (+-611) |
| Pulls with under 50 ms queued | 96.9, 97.7 | 100.0, 99.6 | 179 (+-82), 172 (+-82) |
| Samples queued at a pull, mean | 17,515, 17,179 | 8,744, 8,670 | 5,848, 5,687 |
| An opened spurt's start against its source, mean | +1.4, −8.5 ms | +6.5, −4.5 ms | −3.5, −17.4 ms |
| The same, one seed's mean against another's | +-8.4, +-3.8 ms | +-9.2, +-4.4 ms | +-12.0, +-7.8 ms |

A render has about 8,700 pulls. What this says:

- **The queue behaves as before.** The opens, the underruns, the fades and the low pulls differ by less than
  two standard errors of these 40 seeds at every rate.
- **At 300 frames a second it overflows a little less:** 8% fewer overflows (3.5 standard errors) and 5% fewer
  samples dropped (2.3).
- **A phrase's place depends less on the seed.** The spread of a seed's mean start falls by half. The reads
  follow the tick, so the first packet of a spurt comes at a steadier time.
- **Every opened spurt starts about 10 ms sooner** on an unchanged `D`, which is the arrival's move. With the
  constant at 42.0 ms, `D` takes 11.6 ms off at 300 frames a second (+3.1 ms there) and nothing at 66.67 and 30.
  At 30 frames a second a spurt then lies 17 ms before its source in the mean, where it lay 3.5 ms before it:
  `D` at 30 is 0.5 ms of arrival above the edge where it would be a block less, and the constant is measured at
  300 and 66.67 only. This is an open question for the orchestrator (the planning report).

On the network test signal (seeds 1 to 10) the same holds: at 300 frames a second 60.4 overflows as built and
57.2 on the prototype, 44,858 and 43,750 samples dropped, 8.9 and 8.9 opens, 4.6 and 5.0 spurts joined; at 66.67,
12.8 and 13.0 opens and 15.3 and 17.1 empty pulls; at 30, 25.6 and 25.6 empty pulls and 434 and 606 pulls with a
fade, whose ranges over seeds are 185 to 1,175 and 225 to 1,510.

**The render** (the test signal, seeds 1 to 40; as built, then the prototype; "+-" is one seed's spread):

| | As built | The prototype |
| --- | ---: | ---: |
| Level at 300, 66.67 and 30 frames a second | −6.94, −6.92, −7.10 dB | −6.96, −6.93, −7.12 dB |
| The seven octave bands from 90 Hz to 11.2 kHz | | within 0.05 dB at 300 and 66.67, 0.07 at 30 |
| A band's spread over seeds | 0.01 to 0.10 dB (0.34 at 30) | 0.01 to 0.13 dB (0.29 at 30) |
| Frames sent | 5,066.1 (+-6.4) | 5,061.0 (+-8.8) |
| DTX frames | 641 (+-17) | 642 (+-19) |
| Bytes sent | 329,322 | 328,952 |
| Spurts | 19.9 | 19.6 |
| Messages | 1,799.9 | 1,809.6 |
| Chunks | 2,559.8 | 2,575.5 |
| Frames in each of the eight 1 s bursts | 79.93 (+-1.88) | 79.58 (+-1.86) |
| A spurt's length, the 19 spurts most seeds have | | 0.20 frames longer in the mean |
| A spurt's start | | 1.1 ms later in the mean |
| One spurt's length over seeds | +-4.8 frames | +-4.5 frames |
| One spurt's start over seeds | +-18.3 ms | +-18.8 ms |

So no level and no band moves by as much as one seed differs from another. What changes is which chunk each
message holds: 0.5% more messages, and the places of the short chunks.

**In the suites.** The second prototype (the rule with the place drawn) was put through `steam-sender`,
`voice-channel`, `steam`, `render-channel` and the browser suite. The first prototype (the place fixed at 0) was
put through every suite, `render-stream` and `stages` among them.

- **Passed with no line changed, on both:** `reproduce`, `recordings`, `harness`, `site`, `verify`. In
  `steam-sender` the sections on a caller's clock all passed: the float arithmetic, an empty read, the hand
  clock's schedule, the gate, the pre-roll, the hold, and the refusals.
- **`steam-sender`**, the seeded sections. They pin the clock of W3-16 and are rewritten for the rule: the
  constants; the first ten reads and `CLOCK_HASH`; the second copy `plainClock` (the reference takes its place;
  the old copy stays for check 8); the statistics' bands (the bands of W3-27a's check 7 take their place, with
  the frames a message and the hold's ends below); the default seed's 50 messages and the schedules of seeds 1
  and 2; the statistics through the sender; the gate off over seeds 1 to 50; every sample once; the lead's
  formula and the forced leads.
- **`voice-channel`**: the two checks of the zero (an opened spurt's mean offset at 300 and 67 frames a second,
  and the same with the codec's delay); a spurt that starts before sample 0, whose start is pinned; the count
  of seeds whose next spurt after 500 ms is one of its own at 300 frames a second (39 of 50 where 35 is
  pinned). With the constant set, the pinned values of `D` and the offsets' ranges and counts in the sections
  on layouts P and Q move as well.
- **`steam`**: the laying of two spurts that meet, whose seed no longer has two that meet; the lost messages in
  a row, whose seed no longer offers every case the check names. With the place fixed two other premises
  went and one of these held: finding 5's pink noise at −42 dBFS RMS sent one spurt, and the low-latency onset
  at 0.1 s moved. Each is a premise that one seed no longer gives, not a property that broke.
- **`render-channel`**: the hashes recorded from `main` (the chain's four settings, the render at 66.67, the
  eight of a source that ends in silence); seed 8, which now has an appended spurt where the check wants none.
  With the place fixed, what the chain keeps under the frame clock also failed: one run held 9 entries before
  5 s and 11 after.
- **`render-stream`** and **`stages`**: every failed check is a comparison with a recorded hash, the same cases
  that W3-26b moves and no other (the first prototype).
- **`browser`**: passed whole on the second prototype. On the first, one check lost its premise: a 1 s tone
  with a room, at the default seed, no longer had a skip past the voice's end. The page has no seed, so if the
  build loses that premise the check needs another tone, not another seed. Neither prototype had the new
  arrival constant: the browser suite's figures that follow `D` are to be run on the build.

How each kind is handled:

- **A recorded hash or schedule** is recorded again, in a commit of its own, as the suite's header says, after
  the builder has shown with `--hashes` that only cases which run Steam's seeded sender moved.
- **A premise one seed no longer gives** (two spurts that meet, a spurt appended, noise that stays shut) gets a
  seed or a signal that gives it. The property the check holds is not loosened. The builder says for each which
  seed and why.
- **A band on a statistic** takes the prototype's figure with a band from its spread, as W3-27a's check 7 does.
  The frames a message, as one endless spurt, pooled over seeds 1 to 40: 10.6, 13.3, 65.0, 9.9 and 1.1% for 1
  to 5 frames. That share follows the capture's place (9.0% of one frame at places 0 and 1, 10.8 to 10.9% at the
  others), so the check pools seeds. The hold's ends: the table above.
- **What the chain keeps** is a check that nothing grows without end. The builder shows that on a longer run
  (the most held in the second half is no more than in the first) before any bound is changed.

**What must not move:**

- Every render of `celt_22`, `celt_44`, `speex`, `miles` (not in TF2) and `steam_48` (not in TF2), whole,
  streamed and live.
- `steam` with the codec switched off; a demo's received voice on either timeline; a render with `arriveAt` or
  a caller's packets.
- Every check that gives the sender a clock of its own: the hand clocks of `tests/steam-sender.verify.mjs`, the
  `gate` check of `tests/reproduce.verify.mjs` (Set J's kind of replay) and `tests/reproduce/gate.mjs`. These
  pass with no line of theirs changed.
- The sender's rule: the gate, the pre-roll, the hold's arithmetic, one chunk one message, the ticks' formula.
- The live monitor's latency without the queue.
- `tests/predictions/predictions.json`: never edited.

A hash of a case that does not run Steam's seeded sender, if it moves, is a reason to stop.

### The checks of W3-27b

1. **A replay does not move.** The sections named under "What must not move" pass unchanged, and
   `node tests/reproduce.mjs`'s public checks print what they print on `main`. Break: `since` or `time` of a
   caller's clock touched by the sender.
2. **The seeded sender is the reference's reads through the sender.** For seeds 1 to 400 and the default: a
   clock the suite builds from `gen.mjs` (its reads, with the suite's own `place`, `lead` and phase, as W3-27a's
   checks 4 and 5 compute them) given to `createSender` with that lead gives the messages of
   `createSender({ seed })`, samples included. This takes the place of the second copy's check. Break: the
   sender made with the old clock; the lead not passed.
3. **The clock's hash.** Seed 1, 100,000 reads as `time`, `since` and `samples`, in the bytes the existing
   check uses: a SHA-256 recorded by the builder. Break: any draw moved.
4. **The capture's phase** (W3-21's section, kept): the rows of the table in "The capture's phase against the
   sound", with W3-21's bounds. Break: a lead of 0.
5. **The capture's place** (through the sender): on the suite's signal over seeds 1 to 2,000 the silence record
   is one step long in 20 to 26% of seeds; with `place` 0 forced through a clock of the suite's own it is over
   31%. Break: the place's draw not reaching `ready()`.
6. **The arrival constant.** The mean over seeds 1 to 800 of both layouts at 300 and 66.67 frames a second is
   within 0.3 ms of the constant; `zero()` gives the table's values. The suite's existing checks of the zero
   keep their form with the new constant. Break: the constant left at 50.5 ms (the mean is 8 ms off).
7. **The stream and the live chain equal the render.** The existing checks of `render-stream`, `render-channel`
   and `steam` that hold a render made in pieces, a sample at a time and live to the whole render pass with no
   line changed but recorded hashes. These are the checks that would catch a read ahead of its capture. Break:
   `ready()` without its packet rounding up (a step ready before its end).
8. **The statistics through the sender** (seeds 1 to 400 of the suite's signal), recorded from the build with a
   band of 0.03: ticks between messages, the openings of 8, 6 and 9 frames (the prototype: 78.3, 19.5 and 2.3%),
   the silence records, 18.01 messages a second within 0.02.

Done means: `pnpm test` passes; the browser suite passes; `--hashes` before and after are beside the report with
the moved cases named; every figure of "What moves" is in the report as measured on the branch; each break was
made and seen to fail; `node tests/cache-number.mjs origin/main --report` names `steam-sender.js` and
`voice-channel.js`; CI's `verify` is green on the branch's head.

### The private runs (the orchestrator's, before W3-27b merges)

A builder has no recordings. These are run by the orchestrator on the branch and their figures go into the
record's dated lines:

- `tests/accuracy.mjs` over the takes and nine seeds, against `docs/ACCURACY.md`'s figures.
- `tests/retiming.mjs --engine`, and W3-21's count of the takes' changes between phrases at seeds 1 to 30.
- Set D's ends (7, 12 and 0 of 19 on the 7th, 8th and 9th chunk) against the sender at each uptime.
- The study's scores, run on the built `createClock` in place of the reference.

### The words

Each document says what runs now, with each figure's standing, and points to finding 28. The statements to
carry (the builder words them to fit each place):

- Steam reads the microphone once in each 50 ms pass of the thread that answers the game (read). The pass ends
  early when the game fetches voice, once a tick, within its last millisecond (read; that the fetch wakes it is
  inferred). Otherwise it ends on Windows's timer, in steps of 15.6 ms counted from the last such end
  (measured). So reads come 47.5 to 67 ms apart, 55.5 ms in the mean, and most of them on the game's tick
  (measured on the model; Sets J and L have 47.75 to 64.4 ms and 55.4).
- The capture hands sound up in steps of 750 samples as 10 ms packets fill them, so seven steps of eight come
  30 ms apart and one 40 ms (measured; that Windows works in such packets is inferred), each up to 9 ms late
  (fitted on the owner's PC).
- What is drawn from the seed: the phases of the game's tick, of its frames, of the capture and of the timer,
  where each read falls in its pass, the timer's slips, a few other wakes, and each step's lateness.
- Fitted to recordings, with no rule read: where in its pass the read falls, where in its frame the game
  fetches, how often something else wakes the thread, how early a timer step may end a wait, and the capture's
  lateness, which is another number on another PC. Measured in recordings: the sender's frame rate, the timer's
  slip and the packets' 10 ms.
- The sender's frame rate and tick are the owner's PC's. Another sender's are options of the clock, with no
  control on the page.

| File | What changes |
| --- | --- |
| `steam-sender.js` | the header's first bullet and its last lines; `STEAM_SENDER`'s comments; the comment over `createClock` |
| `voice-channel.js` | the comment over `ARRIVAL_SECONDS`; the values of `D` in two comments |
| `README.md` | "Fitted to recordings, with no rule read" loses "the times of Steam's reads"; the rule joins what is read, and its fitted numbers are named in that sentence in its place |
| `docs/VOICE-PATH.md` | section 2's bullet "What is drawn" |
| `docs/ACCURACY.md` | "The sender's clock" in the list of what is not exact; the table's row "Steam's sender, the read clock"; the stage's bullet "What differs" |
| `docs/FINDINGS.md` | entry 1's "Chunks": when Steam reads, and the capture's packets |
| `docs/LIVE.md` | the table of the queue's hold, and the sentence over it if a figure in it moves |
| `tests/README.md` | the rows of `steam-sender` and `voice-channel` |
| `tests/predictions/PREDICTIONS.md` | one dated line in the form of W3-16's and W3-21's: `steam-sender.js` changed for W3-27b, and `voice-channel.js`, which is not a hashed model file; what a `steam` prediction's render can move by (the figures of "What moves"); the count of recorded hashes that moved and that did not. The registered file is not edited |
| `index.html`, `app/` | nothing names the clock (searched); no change |

`tests/REFERENCE_2026.md` gets added, dated lines only. Nothing there is deleted or reworded:

- Finding 28, after the paragraph of 2026-11-21, in place of nothing: *Built by W3-27 (the date): `createClock`
  in `steam-sender.js` runs this rule, held to the study's generator (`tests/steam-sender/gen.mjs`) to the last
  bit. Two things are the app's own: a read brings three steps at most, and the capture's place in its 8-step
  pattern is a seeded draw, with the figures that show why. The reads' statistics as the suite counts them. The
  clock of W3-16 no longer runs.*
- Finding 28, "The app today", the bullet "The reads are Set J's": a dated note that since W3-27 they are the
  rule's, with the chunk shares, the reads a second and the hold's ends at 9 days.
- Finding 28, W3-21's lines: a dated note that `lead` is a draw of its own since W3-27, with the table's rows;
  and at "Measuring it again over many seeds is an order of its own", that W3-27 measured it, with the figure,
  the seeds and what part of it is a convention.
- Finding 22 or 23, where the zero and its 50.5 ms are given: a dated note with the new constant.
- The private runs' figures, as the orchestrator adds them.

`docs/PROGRESS.json` and `docs/README.md` are the orchestrator's.

### W3-27b: files

May touch: `steam-sender.js`, `voice-channel.js`, the suites named in "What moves" (`tests/steam-sender.verify.mjs`,
`tests/voice-channel.verify.mjs`, `tests/steam.verify.js`, `tests/render-channel.verify.mjs`,
`tests/render-stream.verify.mjs`, `tests/browser.verify.js` where a pinned figure moves), the documents of "The
words", `tests/REFERENCE_2026.md` (added lines), and the report. May not touch: the engine's files, the page,
`tests/steam-sender/gen.mjs` and its vector, `tests/predictions/predictions.json`, `sw.js`'s number.

## What must be measured again after W3-26b

W3-26b changes the capture's conversion and so every `steam` render with the codec on; it does not touch the
sender or the queue.

- **Does not depend on W3-26b**, and stands as the planner measured it: everything of the clock alone (W3-27a's
  whole suite), the statistics through the sender on a 24 kHz signal, the capture's phase and place, and the
  arrival constant, whose layouts are fed to the sender at 24 kHz.
- **Measured again on the base after W3-26b:** the queue's figures on the fixtures, the render's level by band,
  the frames sent, the DTX frames and the spurts' lengths, the suites' moved checks, the live chain's hold in
  `docs/LIVE.md`, and every recorded hash (W3-26b records them once and this order once more).

## Not in this order

- A control on the page for the sender's frame rate, tick, packets or lateness, and a render option that passes
  them. The question is above.
- Which message a fetch of the game takes, and the game's own send on its tick. The message still reaches the
  receiver on the first tick at or after 2 ms after the read, on the render's own grid. The study did not reach
  the order of the pipe's answer and the read inside one pass.
- A phase drawn again at each key press, and Steam's key rules (W3-11c).
- What makes the packets 10 or 20 ms long, why the timer's step slips, and what the lateness is: not read.
- Set Q's pairs of one-step chunks and its three-step chunks with 20 ms packets, which the rule misses (finding
  28).

## The rulings (the orchestrator, 2026-11-21)

On the planner's questions:

1. **The `place` draw is accepted**, a fifth phase beyond the four the first rulings named, with the read-only
   `place` and `by` members. Where the capture's long step falls against the sound is a phase like the others.
2. **`ARRIVAL_SECONDS` is measured again and set in W3-27b**, as the order has it. It is the model's own figure of
   the sender's clock and must follow the clock.
3. **The measure stays at 300 and 66.67 frames a second.** What an opened spurt's place becomes at 30 frames a
   second (17 ms before its source where it is 3.5 ms now, measured by the planner on the prototype) goes into
   the report and the progress file as a known difference; a constant by frame rate is not built here.
4. **The clock counts from the render's start, as the order has it.** The 10.6 ms is a convention that the
   constant absorbs and nothing heard rests on it.
5. **Two merges.** W3-27a is built now, beside W3-26b: the two touch no file in common but
   `tests/predictions/PREDICTIONS.md`, where each adds one dated line, which the orchestrator joins at the merge.
6. **The arrival ticks stay on the render's grid.** The sender's own send tick is not modelled here.
7. **The option ranges are accepted** (frames a second 10 to 1000, tick 5 to 100 ms, lateness 0 to 31.25 ms).
8. **Set D's ends against the new clock at each uptime** are the orchestrator's private run before W3-27b
   merges, with the accuracy and retiming suites. If the 9-day default no longer fits Set D's ends, the default
   is ruled on then.

The reference generator and its vector (`tests/steam-sender/gen.mjs`, `vector-seed1.json`) reach the repository
with W3-27a's branch, as the orchestrator's commit made before the builder's first.

## After the plan review (2026-11-21)

A reviewer who had not seen the plan being made read the order against the code and wrote a port of the clock from
"The rule" alone. Its port gave the reference's reads to the last bit (the time, the steps and `by`) over 50,000
reads at each of seeds 1, 2, 9 and the default, at eleven settings between the ends of the ranges, and on the
committed vector; no step of the rule read two ways (measured once, by the reviewer). What it found is below.
Where a line here and a line above differ, this section is the one the builders work from.

### W3-27a

- **Check 5, the phase.** `time − since` is the seventh draw to the last bit only at a clock's early reads: over
  1,000 reads 3 of 200 seeds stay exact, and the worst miss is 3.6e-15 (measured once). The check is
  `time === phase + since` at every read, with `phase` the suite's own seventh draw.
- **Check 2 and "Precision", the settings.** They are nine, not eight: seeds 1, 2 and the default at the default
  options, and six option settings (packets of 20 ms; a lateness of 20 ms; 30, 60 and 144 frames a second; a tick
  of 30 ms), each of the six at seed 1.
- **Check 3, the four settings** are those of check 6: the defaults, 20 ms packets, a lateness of 0, and 30
  frames a second with 20 ms packets and a lateness of 31.25 ms.
- **The limit of three steps, at the ends of the ranges.** The limit binds far more often there than at the
  defaults: in 2,000,000 reads, 5,693 times at 10 frames a second with a tick of 100 ms, 20 ms packets and a
  lateness of 31.25 ms; 4,595 at 30 frames a second with the same packets and lateness; 39 with 10 ms packets
  and a lateness of 31.25 ms (measured once). What is left over is always one step, and it is never carried
  twice. The module's comment and the suite say both; the suite checks the second at the first of those settings.
- **The invariant's margin.** "By at least 1.6 samples" is the margin of an empty first read. On reads that
  bring a chunk the least is 2.7 samples at the defaults and 1.63 at a lateness of 0; at the ends of the ranges
  above it is 24.8 or more (measured once).
- **The slip's standing.** The table's "measured once" for 1.3 ms is wrong: the record's paragraph of
  2026-11-21 has 1.3 ms among the numbers fitted on Set J's reads, and 1.5 ms as the spread measured. The
  comment on `STEAM_SENDER.clock` says fitted, with the measured 1.5 ms beside it.

### W3-27b

- **The pins that move, found by setting the constant** (the reviewer's scratch run with its port and
  `ARRIVAL_SECONDS` 0.042; neither planner prototype had the constant set):
  - `tests/voicequeue/reference-frames.mjs` keeps its own copy of the constant (line 62). It joins "May touch",
    and takes the measured value. Without it `voice-channel` stops at its first check.
  - `voice-channel`: with that file changed, eight checks still move: the pinned values of `D`, the exported
    zero, and "the threshold: 66.67 and 1000/15", a recorded hash of made-up messages on the game's timeline.
    That hash does not run the seeded sender and moves all the same, through the model's zero. The stop rule
    ("a hash of a case that does not run Steam's seeded sender, if it moves, is a reason to stop") therefore has
    one exception: a case on the game's timeline that takes the model's zero. Each such case is named in the
    report with the reason.
  - `render-channel`: 24 checks move, more than the three sets of hashes and seed 8 listed: the live chain's 13
    checks of "D …, the hold …" (`LIVE_D`, `D`, the 24,576), the hold's arithmetic, `queueCostMs` and
    `spurtStart`. The builder runs every suite with the constant set before recording anything, and lists every
    pin that moved with its old and new value.
- **"The mean" is the pooled one.** `ARRIVAL_SECONDS` is the mean of
  `offsetStartMs + (D − 44100 × latency) / 44.1` over every opened spurt of seeds 1 to 800 at 300 and at 66.67
  frames a second, both layouts, pooled, with no `codecDelay`. The reviewer's port gives 42.144 ms that way
  (42.0 to the half millisecond); the mean of the four layout-and-rate cells gives 42.258, which rounds to 42.5
  and fails check 6 by 0.356 ms (measured once). The measurement is 3,200 runs and took the reviewer 3.5 minutes:
  if it runs in `voice-channel`, the suite's time about doubles, so it runs as a slow check behind a flag or in a
  tool of its own, and the suite pins its result. The builder says which in the report.
- **"What must not move" loses "a render with `arriveAt`".** That render runs the seeded sender
  (`engine/render.js`, the sender's two call sites) and its `D` moves. A render with a caller's packets stays on
  the list.
- **Check 7's break** is the packet rounding rounded down, which makes a step up to 8.75 ms early. Leaving the
  rounding out never makes one early.
- **Check 2.** The reference has no `place` and no limit of three: the suite recomputes the steps from the
  reference's times with check 4's ten lines.
- **Checks 6 and 8** take their expected values from the built constant: the report gives each. Check 8's band of
  0.03 is a share of chunk ends (three points of a hundred).
