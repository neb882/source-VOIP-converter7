# W3-16 second read: the built sender against Steam's code and against the recordings

Branch `claude/w3-16-sender-hold-clock` at `2461a2d`, read-only. The owner's `steamclient64.dll` (SHA-256
`e9045710...`, image base `0x138000000`) was read as data with a disassembler library; nothing was executed; no
leaked source was looked for. Nothing of the binary is here: words, formulas, addresses. From the recordings:
numbers only.

## Verdict

- **The state machine and the hold of `steam-sender.js` match the code.** Every state, transition and order of
  operations asked about was found as built. No must-fix.
- **Set J: 12 of 12** spurt ends fall on the read Steam ended on, through the built sender itself.
- **Set D's direct test singles out one range: 6.1 to 12.1 days (float step 1/16 s).** The default of 777,600 s
  should stay. The words that call a Steam under 1.5 days "the other range that fits" should change.
- **The remaining 10 ms of tail bias is not explained**, and it is not a bias the demo establishes. No change to
  the clock removes it. A separate, well-supported finding about the clock is given as a proposal for a later
  order: capture steps become readable on a 10 ms tick, an 8-step (250 ms) pattern the built clock lacks.

## Part 1: the built sender beside the code

The gate function is at `0x1380d5d30`; the per-frame function at `0x1380d7250`; the encoder's at `0x1380e2ce0`;
the level test at `0x1380cf2d0`; the capture device's read at `0x1380dea90`. State is at offset `0xf0`
(0 silent, 1 active, 2 hanging, 3 ended).

| Piece | Code | Built sender | Result |
| --- | --- | --- | --- |
| "Now" narrowed to a float once per frame, before the read | `0x1380d72c7` to `0x1380d72d4` | `nextRead`, line 216 | confirmed |
| Order in one frame: now, the device's wrap poll, the running test, then the gate function (which reads the microphone itself) | `0x1380d731f` to `0x1380d7329`, `0x1380d73c1` to `0x1380d73d6`, `0x1380d7465` | read, then `frame()` | confirmed |
| Inside the gate: read, level verdict, noted-time copy, state change, hold test, encode | `0x1380d5e21`, `0x1380d5fa2`, `0x1380d5fd2`, `0x1380d60fa` or `0x1380d611d`, `0x1380d6146`, `0x1380d622b` | `frame()`, lines 289 to 314 | confirmed |
| Active needs at least one sample and the verdict | `0x1380d5fab` to `0x1380d5fb6` | `samples > 0` then `active()` | confirmed |
| Noted time: a copy of the float "now", for every active chunk, in every state, before the state is looked at | `0x1380d5fd2` to `0x1380d5fd5` | lines 299 and 309 | confirmed |
| In a read whose chunk is active the hold is not tested (the state is active by then; the test runs only in the hanging state) | `0x1380d60fa`, `0x1380d6146` to `0x1380d614a` | line 310 | confirmed; the copy comes before the place of the test |
| Silent and active: 2400 zeros if nothing is kept, else what is kept (it can be under 2400); chunk behind it; kept sound emptied; state active | `0x1380d5fe8` to `0x1380d60fa` | lines 294 to 302 | confirmed, but for a cap (difference 1) |
| Active, hanging or ended, and active: state active, no pre-roll | `0x1380d5fdb`, `0x1380d60fa` | lines 296, 309 | confirmed |
| Active and inactive: hanging at once, and the hold is tested in that same read | `0x1380d6118` to `0x1380d611d`, then `0x1380d6146` | lines 309 to 310 | confirmed |
| The hold: noted + 0.4 as a float sum, float compare, strictly greater; then state ended | `0x1380d614c` to `0x1380d6168`, constant `0x139199e04` | line 229 | confirmed |
| Silent or ended, and inactive: the chunk joins the kept sound, cut to its newest 2400 samples | `0x1380d62c3` to `0x1380d62fb` | `remember()` | confirmed |
| Ended and inactive: minus the count is returned (the silence record), state silent | `0x1380d6300` to `0x1380d630f`; written at `0x1380d7537` to `0x1380d759b` | line 305 | confirmed |
| A read with no samples, silent: nothing | `0x1380d6313` | `emptyRead` | confirmed |
| A read with no samples, ended: state silent, the return is zero and a zero return writes nothing: no record | `0x1380d6300` to `0x1380d630f`, `0x1380d746c` | line 283 | confirmed |
| A read with no samples, active: hanging, and the hold is tested | `0x1380d5fab`, `0x1380d611d`, `0x1380d6146` | lines 284 to 285 | confirmed |
| A read with no samples, hanging: the hold is tested; if it fires the encoder is called with no samples and "last" | `0x1380d6146`, `0x1380d6213` | line 285 | confirmed |
| After an empty read in the ended state, an onset gets 2400 zeros (the kept sound is empty: it was emptied at the spurt's onset and nothing fills it while a spurt runs), and an inactive chunk first is kept | `0x1380d60f3`, `0x1380d5fe8` | builder's reading 8 | confirmed |
| When the pre-roll is under 2400: fewer than 2400 samples of silent chunks since the last onset | `0x1380d60f3`, `0x1380d62e2` | `pastLen \|\| preroll` | confirmed |
| Encoder: under one frame in hand and not last, the samples are kept and nothing is written; no packet for a zero return | `0x1380e2d17` to `0x1380e2d38`; `0x1380d746c` | line 250 | confirmed |
| Last call: zeros (16-bit, one at a time) pad what is in hand to a whole frame | `0x1380e2dff` to `0x1380e2e24`, helper `0x138cf5c50` | `Math.ceil`, line 243 | confirmed |
| Last call: the encoder is reset, the marker is written, the sequence number goes to 0; nothing in hand gives the marker alone | `0x1380e2fcb` to `0x1380e2fe7` | lines 248 to 254 | confirmed |
| Nothing else resets at a spurt's end (not the kept past sound, which is already empty) | gate function, whole | | confirmed |
| A microphone's chunk: the bytes between the last-read position and DirectSound's **read** position (the capture position is not asked for), plus a count of buffer wraps | `0x1380deb05` to `0x1380deb69` | the clock | see below |
| More than the room waiting: the start moves up, the newest 6000 samples are taken | `0x1380deb7a` to `0x1380deb91` | not modelled (a chunk is at most 2250) | not reachable |
| Nothing new: the read returns 0 and the gate function goes on with an empty chunk (the read is inside the gate function, so the gate always runs) | `0x1380dea90` returns; `0x1380d5fab` | `emptyRead` | confirmed |
| The level test prints a line only for a chunk with samples, so a console log never shows an empty read | `0x1380cf438` | | note for reading logs |

**Where 750 comes from.** Not from Steam's code: there is no rounding to steps anywhere in the read. Steam asks
Windows for a looping capture buffer of **one second** (bytes = 2 x rate, `0x1380dedad` to `0x1380dee0c`) and
takes whatever the read position has gained. 750 samples is exactly one 32nd of that buffer. **Inferred, not
read:** Windows moves the read position in 32nds of the buffer it was asked for, so the step would follow from
Steam's one-second buffer and not from the owner's device. That needs a second PC or Windows's own documentation.

**Anything that makes a step readable late?** In Steam's code: no latency constant, no lock, no wait. Two things
are there:
1. The cursor Steam reads is the *read* position, which by DirectSound's design trails the capture position
   and moves only when Windows has delivered a block. When it moves is Windows's matter (see Part 2, the
   10 ms pattern).
2. **The wrap count.** Steam sets one notification at the buffer's last byte with an auto-reset event
   (`0x1380dee4c` to `0x1380dee8e`), polls it without waiting each frame and before each read (`0x1380dec80`,
   called at `0x1380d7329` and `0x1380deb02`), and adds one buffer length to its position base when it has
   fired (`0x1380deca0`). If the cursor has wrapped and the event has not yet been seen, the position computed
   is behind the last one, the lock is refused (`0x1380debe3` or the lock's own failure) and the read brings
   **nothing**; the last-read position is not moved, and the next read takes everything. So once a second a
   read can come back empty with a step waiting. The model has no empty read after the first chunk. Whether
   this happens on the owner's PC is not shown (see Part 2).

### Differences between the built sender and the code

1. **Note.** At an onset, pre-roll plus chunk is cut to the newest 6000 samples (`0x1380d60b9` to
   `0x1380d60d4`). The sender has no such cut. Not reachable: 2400 + 2250 is under 6000. It matters only to a
   file-input model or a demo's own packets (W3-02g). Nothing moves.
2. **Note.** `gate: false` is the app's own setting. In the code an empty read takes the inactive path
   whatever the level test says (`0x1380d5fab`), so a Steam whose thresholds pass everything would still go
   hanging on an empty read. The order asked for "does nothing" and the seeded clock gives no empty read after
   the first chunk. Nothing moves.
3. **Note.** For a chunk of exactly one sample the code's mean is 0 (`0x1380cf3be`); the sender divides. And
   the code compares the mean as a 32-bit float percentage; for chunks of 750, 1500 and 2250 samples no sum
   falls in the rounding window (checked by arithmetic), so the sender's doubles give the same verdict. Not
   reachable.
4. **Should fix, words only** (`steam-sender.js` lines 48 to 51 and the order's "A second sender PC" line):
   the step is "how far the capture moves at a time on the owner's PC". From the code it is a 32nd of the
   one-second buffer Steam asks for; say so, marked inferred.
5. **Should fix, words only** (`steam-sender.js` lines 75 to 78; `constants.js` and README as they repeat it;
   the reference's finding 28 text and the predictions note, which the orchestrator writes): "a Steam under a
   day and a half old is the other range that fits" is no longer what the evidence says. See Part 2.
6. **Note, a proposal for a later order** (`steam-sender.js` lines 11 to 14, 69 to 71, 136 to 142): the
   "ready 0 to 13 ms late" rule. See Part 2.

## Part 2: against the recordings

### Set J's twelve spurt ends: 12 of 12

Method, plainly: the built sender itself, through its `clock` option. Each read's time is W3-14's rebuilt real
time (the reader's float sits on a grid of 3000 samples; the time is that float plus the chunk's length), so
the phase on the float's grid is the run's own and is not swept. The gate verdict is the log's. The chunk's
samples are a stand-in of 750 (loud or zero), because the option refuses a chunk over 2250. Reads that brought
nothing are not in the log (the level test prints only chunks with samples); 22 were placed where an interval
is over 90 ms and the earlier read's float had been rounded up past it.

| Uptime | Model ends | On the read Steam ended on |
| --- | ---: | ---: |
| 1,166,400, 1,555,200 and 2,073,600 s (step 1/8 s) | 12 | **12 of 12**, the same list |
| 14,400 and 97,200 s | 12 | 8 |
| 190,080 s | 12 | 6 |
| 388,800 s | 12 | 5 |
| 777,600 s | 13 | 5 |
| 3,110,400 s | 10 | 0 |

- Phase sweep inside the 1/8 s row: all twelve are reproduced for 13 ms before to 2 ms after the run's own
  phase (15 of 125 ms), and for no other phase. The run's phase sits 2 ms inside the upper edge, as it should:
  the frame's "now" is taken a little before the read's own clock reading.
- With the empty reads in, the model sends 10 silence records and the two that the game's log lacks are the
  two the model lacks. With them left out it sends 12. That confirms "ended, empty read: no record".
- No empty read ended a spurt (under file input its float "now" equals the read before it).
- Real time from the last active read to the final one: 389 to 514 ms.

### Set D's nineteen clear ends, by uptime

**Crude form (the built sender on the hand clock of `run-new.mjs`, whose read time is the capture position).**
Ends on the demo's exact sample, of 19, over 64 phases of 1/256 s:

| Uptime | Step | Best phase | Worst | Mean |
| --- | --- | ---: | ---: | ---: |
| 0, 14,400, 46,800, 97,200 | to 1/128 s | 13 | 13 | 13 |
| 190,080 | 1/64 s | 10 | 10 | 10 |
| 388,800 | 1/32 s | 14 | 9 | 10.2 |
| 777,600 | 1/16 s | 14 | 7 | 11.2 |
| 1,555,200 | 1/8 s | 8 | 1 | 5.7 |
| 3,110,400 | 1/4 s | 0 | 0 | 0 |

This cannot separate the ranges: a read's real time is up to a step and a half after the capture position.

**Sharp form.** Read times drawn from the built clock (30 to 60 seeds of 500,000 reads), kept only where the
chunk lengths equal the demo's own around each end (six chunks before the last active one, through the final
chunk and the silence record). On those, a faithful extract of the built hold (`nowF = fround(uptime + time)`,
`nowF > fround(notedF + fround(0.4))`; an extract, not the module, because the times are drawn) says which
read ends the spurt. The step index of each last active chunk in the demo's timeline is known (all twenty
onsets sit on one 750-sample grid), so **one** phase of the capture's steps against the float's grid serves all
nineteen ends; it is swept in 256 steps over 0.25 s.

| Uptime | Step | Ends possible, best phase | Ends possible, all phases | Expected reproduced, best phase | Expected, mean over phases | Log-likelihood, best phase | Log of the mean likelihood |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 14,400 | 1 ms | 19 | 19 | 14.0 | 14.0 | -12.3 | -12.3 |
| 46,800 | 1/256 s | 19 | 19 | 14.0 | 14.0 | -11.5 | -11.6 |
| 97,200 | 1/128 s | 19 | 19 | 13.7 | 13.7 | -13.5 | -13.8 |
| 190,080 | 1/64 s | 18 | 15 to 18 | 12.3 | 12.3 | -29.5 | -31.4 |
| 388,800 | 1/32 s | 16 | 14 to 18 | 10.9 | 10.9 | -40.8 | -42.8 |
| **777,600** | **1/16 s** | **19** | 14 to 19 | **16.1** | 12.0 | **-3.7** | **-6.2** |
| 1,555,200 | 1/8 s | 15 | 5 to 16 | 7.8 | 6.4 | -53 | -57 |
| 3,110,400 | 1/4 s | 0 | 0 | 0 | 0 | floor | floor |

- **It singles out 6.1 to 12.1 days.** Against the three rows under 1.5 days: 5.4 log units with the phase
  averaged out (a factor of about 200), 7.8 at the best phase (one fitted number). The planner's fit on a
  drawn clock had the two ranges 1 to 3 units apart.
- **The reason is visible without any clock model.** In the demo the end depends on whether the last active
  chunk's step index is even or odd: even, the final chunk ends 13 steps later 5 times and 14 steps 5 times,
  never 12; odd, 14 steps 6 times and 12 steps 3 times, never 13. A hold of 400 ms of real time (any Steam
  under 3 days) cannot know the parity of a 31.25 ms step; a float step of 62.5 ms, two capture steps, does.
  With the parities scrambled, the best-phase log-likelihood at 777,600 is -16.5 at the median and reaches the
  real -3.7 in 2 of 400 trials.
- The likelihood over the phase has one peak, about 12 ms wide, at 48 to 52 ms (modulo 62.5).
- At the best phase the model leans neither way: of the 19, 0.9 expected to end earlier than the demo and
  2.1 later. At 14,400 s it is 0.3 earlier and 4.7 later: a fresh Steam cannot make the demo's three 12-step
  ends (probabilities 0.01, 0.07 and 0.19).
- Robust to the clock: lateness of 10 or 16 ms, intervals of 46 to 65.7 ms, two chunks of context in place of
  six, and the 10 ms tick rule below all give -3.5 to -4.4 at 777,600 and -11.2 to -13.1 under 1.5 days.
- It rests on: the capture running without a restart through the 141 s (the twenty onsets on one grid say so),
  and Steam's clock and the capture's keeping step to a few ms over that time.

**The default.** Keep 777,600 s. It is the middle of the one range the direct test leaves, and the owner's
"at least a day or more" agrees with it and speaks against 14,400 s. The fallback in the order ("if the owner
says within a day and a half, the default becomes 4 hours") no longer has grounds.

### The remaining 10 ms of tail bias

- **It is not established as a bias.** Over seeds, one 12-spurt recording's mean tail has a standard deviation
  of 9.4 ms at 777,600 s; 13% of seeds give a mean at or under Steam's 462.3 ms (model mean 473.3). At
  14,400 s: 7.3 ms and 3%.
- **Given the demo's own chunks the built hold shows no lean** (0.9 earlier, 2.1 later of 19, above).
- What stays odd is the summary without conditioning: no end at 15 steps in 19 where the model gives 19 to
  23% (about 1.5% by chance), mean 13.42 steps against 13.8.
- **It is not the phase and not the "ready" rule.** Over six capture phases and sixteen float phases the
  model's mean stays 13.78 to 13.87 steps and the share at 15 steps or more 19 to 23%, under the built rule
  and under the 10 ms tick rule alike. The mean real time from the last active read to the final one is set
  by the float arithmetic (406 ms on average) plus half a read interval; to reach the demo's mean the final
  read would have to come 13 ms after the limit on average where independent reads give 28. That would need
  Steam's reads tied to its own float grid, and nothing in the code read here ties them. Not explained.
- **No proposal for it.** Tuning the clock to it would be tuning to one recording's scatter.

### A proposal for a later order: capture steps are readable on a 10 ms tick

Not asked for, found on the way, and the evidence is strong.

- **Measured (the demo's 1,797 chunks).** Counting capture steps along the demo's timeline, chunk ends by the
  step index modulo 8: 223, 214, 222, 216, 224, 208, 211, **279**. One-step chunks by the same: **100**, 40,
  37, 41, 43, 38, 27, **92** (46% at two neighbouring places; chi-square about 100 on 7 degrees of freedom).
  18 of the 31 three-step chunks end at places 6 and 7. The built clock gives 12.5% at every place and 25% of
  one-step chunks at any two.
- **What gives it.** 31.25 ms steps made readable only on a 10 ms tick: seven gaps of 30 ms and one of 40 ms
  every 8 steps (250 ms). A read falls in the long gap a third more often: 16.0% of chunk ends at one place
  (demo 15.5%), and one-step chunks pile up on either side of it.
- **The rule:** step j is readable at the first multiple of 10 ms (a grid with its own phase) at or after its
  end, plus 0 to 8 ms drawn evenly, in place of "its end plus 0 to 13 ms".

| | Chunks of 750 / 1500 / 2250, % | Pairs 3-1, 1-3, 1-1, % | Chi-square on the eight pairs (the planner's measure) | Chunk ends at the busiest place of 8 | One-step chunks at the two busiest | Ends on the 7th / 8th at 777,600 | Mean steps |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: |
| The demo | 23.3 / 75.0 / 1.7 | 1.63, 1.35, 0.28 | | 15.5% | 45.9% | 37 / 63 | 13.42 |
| Built: 0 to 13 ms | 23.3 / 74.7 / 2.0 | 1.73, 1.73, 0.09 | 11.5 | 12.5% | 25.3% | 26.7 / 70.7 | 13.83 |
| 10 ms tick, plus 0 to 6 ms | 22.8 / 75.7 / 1.5 | 1.20, 1.21, 0.10 | 11.8 | 16.0% | 49.8% | 27.0 / 70.5 | 13.82 |
| 10 ms tick, plus 0 to 8 ms | 23.1 / 75.1 / 1.8 | 1.45, 1.46, 0.15 | 5.7 | 16.0% | 49.0% | 27.1 / 70.4 | 13.81 |

- 17.90 messages a second in each. It does not move the ends or the tails. It would move the chunk sequence,
  so the clock's reference hash, the reference schedule and the 33 golden hashes.
- The 10 ms is not in Steam's code. It is presumably the period on which Windows hands sound to DirectSound.
  The jitter was tried at 0, 2, 4, 6 and 8 ms only, on one seed; it is not fitted.
- Not for W3-16: the build is what its order asked for.

## What was not checked

- The tests, the page, the hashes, the accuracy table and the re-timing check (the reviewer's and the
  orchestrator's).
- Key down and key up (W3-11b) beyond noting that a start from a stopped device zeroes the last-read position
  and resets the encoder (`0x1380d720a` to `0x1380d7235`) and not the gate's state.
- `voice_preprocess` on (the carry path, `0x1380d5ead` to `0x1380d5f85`).
- Windows's side: how the read position moves, the 32nds, the 10 ms. Inferred from the demo, not read.
- Whether the wrap count ever costs a read on the owner's PC. Six of the 31 three-step chunks end at one
  place of the 32-step buffer, which fits it weakly (about 4% by chance given the 8-step pattern).
- The direct test with the demo's decoded sound as the microphone (only the test signal, as the 19 ends are
  defined); the spurt left out is the one whose last chunk is active.
- The rounding mode of the processor, and the owner's own timer library (as in the first read).

Scripts (this folder): `cond.mjs` (the direct test), `setj.mjs`, `tailpsi.mjs`, `saw.mjs`, `handsweep.sh`,
`dz.py` and `vt.py` (the reading).

## Part 3: the re-timing check got worse (asked afterwards)

Scratch only: a copy of the check's engine column (`rt/rt.mjs`) that takes a sender file, prints signed
per-spurt errors and can re-zero; main's sender (`dc1e64b`) and scratch variants of the branch's. It reproduces
the orchestrator's figures (speech 58% and 87 ms on main's sender, 47% and 129 on the branch's, 200 seeds).
The tables below are 100 seeds unless said.

### Verdict

**Merge W3-16 as it is. The check's zero and its bar are what need changing, on the receiver's side.**

- On the seven test-signal takes the rise is a **constant**: restarted spurts sit 53 ms after the source where
  they sat 21 ms. The check zeroes the take at the take's own restart level and the engine at a fixed latency;
  zeroed the same way as the take, the branch is level with main (table below).
- On what the game's own log can measure, **the new timeline is the right one**: the spread of a message's
  arrival against its capture position is 42.5 ms in Set G, 41.3 on the branch, 31.3 on main.
- **The speech take is the exception and stays worse after re-zeroing**: 48% and 117 ms against 57% and 88.
  It is not the capture phase, the lateness or the intervals, and the hold is at most a small part. Nothing that
  can be switched in the new sender restores it. It is one take of nine transitions, on a check that treats
  each of its spurts as solid sound although seven pauses inside them are long enough for Steam to split.
- The order's own bar for this check (55% and 92 ms on the speech take) and the receiver's planned bar (45%
  and 110 ms) were set on main's clock. The speech take now gives 47 to 48% and 125 to 129 ms raw, 117 ms
  re-zeroed. The first number passes 45%; the second passes neither bar.

### 1. Constant shift or spread

Both, on different takes.

| Take | Main: right %, start error, re-zeroed | Branch: right %, start error, re-zeroed |
| --- | --- | --- |
| take1_default | 69, 76, 69 | 68, 106, 74 |
| take2_voice_scale_0.5 | 47, 105, 97 | 51, 121, 88 |
| take3_voice_maxgain_1 | 72, 71, 63 | 75, 93, 61 |
| take3_voice_avggain_0.25 | 54, 88, 81 | 57, 110, 78 |
| take4_my_own_speech | 57, 88, 88 | **48, 125, 117** |
| net_baseline | 71, 87, 84 | 68, 114, 93 |
| sender_A | 55, 98, 90 | 56, 127, 93 |
| listener_B | 72, 72, 65 | 77, 94, 64 |

"Re-zeroed": each seed's engine offsets counted from that seed's own restart level (the median of the highest
third of its spurts' last offsets, the rule the check already uses for the take). Transitions do not depend
on the zero.

- The engine's restart level: 10.7 ms on main, 39.3 on the branch (speech: 1.3 and 26.2). Opened spurts'
  mean start offset: 21 and 53 ms. Mean over messages of tick time less the time of the message's last
  sample: 26.3 and 57.2 ms. A shift of 31 to 32 ms.
- After re-zeroing the branch is at or under main on four takes, within 5 ms on two, 9 ms over on
  net_baseline and 29 ms over on the speech take. Transitions right are at or over main's on five of eight.

**take1_default, per spurt** (200 seeds; ms; offsets from the take's restart level):

| Spurt | Gate silence before | Take | Main's engine, error | Branch's engine, error | Take's kind | Main early/late/kept % | Branch early/late/kept % |
| ---: | ---: | ---: | --- | --- | --- | --- | --- |
| 0 | | 0 | 17, +17 | 57, +56 | | | |
| 1 | 8880 | 14 | 20, +5 | 53, +39 | kept | 0/0/100 | 0/0/100 |
| 2 | 10440 | -16 | 23, +39 | 52, +68 | kept | 0/0/100 | 0/0/100 |
| 3 | 1440 | -10 | 17, +26 | 52, +62 | kept | 0/0/100 | 0/0/100 |
| 4 | 440 | 18 | -154, -171 | -12, -30 | kept | 50/0/50 | 20/0/81 |
| 5 | 440 | 0 | 17, +17 | -2, -2 | kept | 1/50/50 | 16/20/65 |
| 6 | 440 | -10 | -43, -33 | -4, +6 | kept | 18/1/82 | 17/16/67 |
| 7 | 440 | -7 | -82, -75 | -4, +3 | kept | 32/18/51 | 17/17/66 |
| 8 | 440 | -327 | -80, +248 | 2, +330 | early | 30/32/39 | 15/17/68 |
| 9 | 440 | -1 | -37, -36 | -7, -6 | late | 17/30/54 | 19/15/67 |
| 10 | 440 | -332 | -37, +295 | 8, +340 | early | 18/17/66 | 14/19/68 |
| 11 | 440 | -17 | -16, +1 | -4, +13 | late | 12/18/71 | 17/14/70 |
| 12 | 420 | -7 | 3, +10 | -13, -6 | kept | 4/12/85 | 19/17/65 |
| 13 | 1420 | -1 | 21, +22 | 53, +53 | kept | 0/4/96 | 0/19/81 |
| 14 | 3420 | 0 | 19, +20 | 53, +54 | kept | 0/0/100 | 0/0/100 |
| 15 | 520 | -19 | 21, +40 | 54, +73 | kept | 0/0/100 | 0/0/100 |
| 16 | 9420 | -3 | 19, +22 | 52, +55 | kept | 0/0/100 | 0/0/100 |

The well-separated spurts move by +32 to +39 ms, all the same way. The 440 ms run is spread out in both.

**take4_my_own_speech, per spurt** (200 seeds):

| Spurt | Gate silence before | Take | Main's engine, error | Branch's engine, error | Take's kind | Main early/late/kept % | Branch early/late/kept % |
| ---: | ---: | ---: | --- | --- | --- | --- | --- |
| 0 | | 9 | 19, +10 | 52, +43 | | | |
| 1 | 140 | -115 | -62, +53 | -62, +53 | early | 32/0/68 | 61/0/39 |
| 2 | 20 | -4 | -29, -25 | -44, -40 | kept | 0/1/100 | 0/0/100 |
| 3 | 300 | -201 | -253, -52 | -124, +77 | early | 95/5/1 | 59/36/6 |
| 4 | 160 | -303 | -74, +229 | -32, +271 | early | 24/68/9 | 28/47/25 |
| 5 | 120 | 0 | -29, -29 | -62, -62 | late | 6/26/69 | 36/12/53 |
| 6 | 340 | -327 | -211, +116 | -40, +287 | early | 77/12/11 | 30/64/7 |
| 7 | 160 | 14 | -75, -90 | -44, -58 | late | 17/54/30 | 44/26/31 |
| 8 | 240 | -211 | -147, +65 | -171, +41 | early | 77/23/0 | 85/16/0 |
| 9 | 140 | -316 | -207, +110 | -101, +215 | early | 24/3/62 | 24/39/38 |

Here it is a spread, not a shift. On the branch the first short silence is bridged early more often (61%
against 32%, and the take did bridge it), which uses up the queue, so the spurts after the 300 and 340 ms
silences find it empty more often (late 36% and 64% against 5% and 12%; the take had them early). The chance
of the take's whole pattern, transition by transition, is about eleven times higher on main's sender.

### 2. Which element

Speech take and take1_default: right %, start error, re-zeroed start error; then the mean of tick time less
the message's last sample.

| Sender | Speech | take1 | Tick less last sample, ms |
| --- | --- | --- | ---: |
| main | 57, 88, 88 | 69, 76, 69 | 26.3 |
| branch | 48, 125, 117 | 68, 106, 74 | 57.2 |
| branch, capture phase `c0` 0 | 47, 124, 122 | 70, 88, 70 | 40.8 |
| branch, `captureLate` 0 | 48, 125, 120 | 67, 102, 74 | 50.6 |
| branch, both 0 | 49, 118, 117 | 67, 86, 73 | 34.3 |
| branch, reads exactly 55.85 ms apart | 48, 129, 121 | 68, 104, 72 | 56.9 |
| branch, tick from `since - c0` | 48, 122, 120 | 68, 91, 73 | 40.8 |
| branch, `uptime` 0 (the hold as on main, near enough) | 52, 117, 110 | 69, 103, 70 | 57.2 |
| branch, `c0` 0 and `uptime` 0 | 48, 122, 121 | 71, 86, 67 | 40.8 |

- **The constant, 31 ms:** the capture phase `c0` 16 ms (a draw of 0 to 31.25 ms per seed, added to every
  step's ready time), the lateness 7 ms, and 8 ms because reads no longer fall on the capture's own timer
  (on main a read found its newest step 0 or 15.6 ms old; now 0 to 31 ms).
- **The phase draw** takes no part (the tick is from `since`). **The tick rule** is unchanged in form.
  **The intervals** take no part.
- **The hold** moves no start on take1. On the speech take `uptime` 0 gives 52% and 110 ms re-zeroed on the
  branch, but 48% and 121 ms with the capture phase also off: its part is at most 4 points and 7 ms, and not
  separable from the scatter of 100 seeds.
- **The speech take's fall** (9 points, about 29 ms re-zeroed) comes with the kind of clock: reads that
  are independent of the capture's steps. No variant short of main's clock gives it back.

### 3. Which timeline is right

**What can be measured is only the spread.** Neither Set G's log nor the demo has a zero shared between the
capture and the game's ticks, so the absolute time from a step's last sample to its message is not in them.
In the model a message's tick is the first 15 ms tick at or after the read's time plus 2 ms.

Set G (the fixture: packets and client ticks; chunks fitted from the frame counts as the demo check does):
a message's tick time less the capture position of its last sample, about its spurt's median.

| | Messages | 2% to 98% width, ms | Standard deviation | Median for chunks of 1 / 2 / 3 steps |
| --- | ---: | ---: | ---: | --- |
| Set G run 1 (300 fps) | 956 | 42.5 | 11.0 | +10.0 / -3.8 / -13.8 |
| Set G, the five other sections | 76 to 219 each | 38.8 to 46.3 | 10.2 to 12.3 | +8.8 to +16.3 / -2.5 to -3.8 / -13.8 to -20.0 |
| The branch's sender | 10,591 | 41.3 | 10.7 | +11.3 / -3.8 / -16.3 |
| Main's sender | 10,284 | 31.3 | 9.3 | +7.5 / -3.8 / -7.5 |

- The branch matches the game's log on all three figures; main is too tight. A fps of 67, 100 or 300 makes
  no difference to the log's spread.
- The demo (ticks written every 60 ms, a network between): the same difference over all 1,797 messages has
  a 1% to 99% width of 94.8 ms (drift 17 parts in a million taken out). Through the same 60 ms rounding main's
  sender gives 74.3 and the branch's 81.2. Wider than both, nearer the branch.
- **So: the measured lateness supports the branch's variable part** (a step readable 0 to 13 ms after its
  end, read whenever the next read comes). It says nothing for or against the builder's "0 to 44 ms": the
  31 ms of that which is `c0` is a constant within a render and has no measurable counterpart. `c0` is also
  not needed for the chunks: the first read's own draw already spreads the reads over the steps.

### 4. What absorbs it

- **The constant sits in the receiver's zero.** `createTimeline` takes out `latency(bufferMs, fps)` (the wait
  plus the 0.16 s opening, at most the ring's 0.5 s) "so that a restarted spurt sits where the source has it".
  That holds only if a message arrives the moment its last sample is captured. With main's sender a restarted
  spurt sat 21 ms late; with the branch's, 53 ms. `tests/retiming.mjs` compares those absolute offsets with
  take offsets counted from the take's own restart level.
- **The fix belongs to the check** (or to the receiver's order): count the engine's offsets from the engine's
  own restart level, as the take's are. Figures then: the "re-zeroed" columns above. On the speech take: 48%
  and 117 ms at the default.
- If a single constant is preferred to re-zeroing: 32 ms more taken out at 300 fps gives the same on the
  test-signal takes (take1 69, against 74 per seed) and 125 on the speech take.
- **Nothing in `steam-sender.js` must change for this.** One optional change for the later clock order, with
  the 10 ms tick proposal: drop `c0` (or take it out of `since`). It halves the constant (take1 88 to 91 raw,
  speech 122 to 124), leaves the chunk shares and the 7th/8th split as they are (it only delays every step
  alike), and takes away a seed-to-seed spread of 9 ms in where a render sits against its source. It moves
  the clock's reference hash and the reference schedule's ticks, so it is not for this merge.

### Not checked in this part

- 100 seeds for the tables of all takes and of the variants (the check uses 200); the two per-spurt tables
  are 200.
- Whether the takes other than the speech take and take1 move spurt by spurt as take1 does: only their
  totals were run.
- The receiver's side itself (`voice-channel.js`), and the queue and rule columns.
- Why exactly a clock tied to the capture's steps does better on the speech take; it may be luck of one take.
