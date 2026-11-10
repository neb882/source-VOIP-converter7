# W3-02a: the voice channel as a module, and the log replay

The builder's report, 2026-11-10. The order is W3-02a in `docs/work-orders/W3-02-receiver-queue.md`. All of it is
built and every public check passes. Nothing in the app uses the module yet.

The private runs ("The orchestrator runs privately") are the orchestrator's. On head `b3fdaaa` the orchestrator
reported:
- the replay of the six real log sections has 0 mismatching ticks of 9,808, and every fault mismatches somewhere;
- the log tool gives the reference fixture event for event on all six sections.

A review then found gaps in the suite and small tool issues, and nothing wrong in the module. The fix round is in
"The review and the fix round" below. The rest of this report is the first round's, corrected where the fix round
changed it.

## What was built

| File | What |
| --- | --- |
| `voice-channel.js` (new) | The channel, as the pseudo-code of "The model": an IIFE in `demo.js`'s form (`module.exports` under Node, `TF2VoiceChannel` elsewhere, no imports). It exports `VOICE_CHANNEL`, `waitTicks`, `latency` and `createChannel`. |
| `tests/voicequeue/log-to-fixture.mjs` (new) | A console log to a numbers-only fixture, by spec 5's rules. It exports `logToFixture(text, opts)` for the test; the command line is the order's. |
| `tests/voice-channel.verify.mjs` (new) | 101 public checks (68 in the first round). `--fixture <file>` adds the replay with the six faults. |
| `tests/voicequeue/reference-channel.mjs` (new, fix round) | A second model of the channel with plain arrays, for the suite to compare the module with. |
| `tests/voicequeue/README.md` (new) | How to make a log and a fixture, how to replay and compare one, and that real logs stay private. |
| `package.json` | `node tests/voice-channel.verify.mjs` appended to `test`. |

No other file was touched. `git diff --stat origin/main...HEAD` lists exactly these six and this report: seven. The
first round's report said five, leaving out the report itself.

### The module

- **`VOICE_CHANNEL`** (frozen) holds `rate` 44100, `ring` 22050, `tick` 0.015, `bufferMs` 100 with `bufferMsRange` [1, 5000],
  `fps` 300 with `fpsRange` [10, 1000], `fadeTime` 0.1, `mixBlock` 512 and `firstBlock` 513. Each has its source in a
  comment. `sender` is not there: it is W3-02b's (`createSender` uses it). The 0.16 s burst in `latency` is a named
  local constant with its source.
- **`waitTicks(bufferMs, fps)`** is `ceil(clamp(bufferMs, 1, 5000) / 1000 x clamp(fps, 10, 1000) - 1e-6)`, as
  written. **`latency(bufferMs, fps)`** is `min(0.5, (waitTicks - 1) x 0.015 + 0.16)`, with the 0.5 taken as
  `ring / rate`. A value that is not a finite number falls back to the default.
- **`createChannel({ fps, bufferMs, fadeTime, gain, test })`** returns a frozen object.
  - `add(pcm, tag)`, `tick()` and `pull(n) -> { samples, tags }`.
  - Read-only getters: `inUse`, `playing`, `starved`, `count`, `opens`, `waitTicks`, `dropped` and `drops`.
  - The ring is a preallocated `Float32Array` with a parallel `Float64Array` of tags. Nothing grows with the audio
    except the `drops` list. It grows by one entry per run of one tag among an overflow's samples, not one per
    overflow as the first round's report said (reading 2). A packet longer than the ring gives an entry for the
    old queue's samples and one for its own, even under one tag.
  - `test` takes exactly the order's four settings: `ring`, `waitTicks`, `keepSample` and `noGrace`.

### Readings of the order

Where the order left a choice, this is what I chose. None of these changes the rule.

1. **`pulled` in `drops`** counts every sample `pull()` has returned, including the zeros of a waiting or free
   channel. It is the channel's output position, which W3-02b's `drops[].time` needs. A check pins it: 64 zeros
   pulled during the wait count.
2. **`drops` has one entry per run of one tag** within an overflow. So an overflow that crosses two packets gives two
   entries, and summing the counts per tag gives what each packet lost.
3. **Tags.** A packet given without a tag has its samples tagged -1, the same as padding and silence.
4. **A packet longer than the ring.** Everything queued goes, and the packet's own oldest samples go too, all
   counted in `dropped`. The engine cannot produce one (Steam's decoder writes at most 11264 samples).
5. **A demand of 0 in a fixture is no pull at all**: the mixer did not ask. `pull(0)` itself follows the
   pseudo-code literally, so on an empty, playing ring it marks the channel starved. The replay skips `2, 0`, as the
   planner's prototype did. The two differ only when a `B` of 0 is printed while the channel plays (an empty packet
   in a grace); the order's tables come from the prototype's reading. Check C pins both halves.
6. **"By hand, 67 fps ... nothing dropped".** With no pulls at all, the same packets would drop 3520 samples at any
   frame rate, so the check is read as: playing on tick 6 with 9700 queued and nothing dropped, and then nothing
   dropped through tick 28 under a mixer that takes a block of 512 every 512 samples (513 for the first). Both halves
   are checked.
7. **The tool prints a whole fixture holding one section** (`{ about, sections: [section] }`), not a bare section
   object. Its output then replays with `--fixture` as it is, and the README shows how to join several.
8. **The replay's tick count includes the tool's `3, -1` free ticks**, as the order's table does (the first run's
   6,249 bufsize lines against its 6,267 ticks).
9. **The tool stops in a few cases its rules do not list.** Each would otherwise have to be a guess, and none can
   fire on a well-formed log of one speaker:
   - a packet line whose tick line lies across a session break (the prototype dropped the packet silently);
   - a packet line with no tick line at the end of the input;
   - a second channel or entity within one channel's life (one speaker only; tick lines are compared with tick
     lines, packet lines with packet lines);
   - a `Voice - mixed` line, which `voice_showchannels 2` prints;
   - a wait of 3 ticks or less, where the three-step test cannot tell a grace from a new channel (as in the
     prototype);
   - no voice lines, a marker that is not found, a missing `--fps`.

   If the orchestrator's private run stops on one of these, the message gives a line number and nothing else.
10. **`--fixture` is lenient where the format may differ.** A section without `bufferMs` replays at 100, and one
    without a name is named by its place. `fps` and `events` are required. A packet or pull over a million samples
    is refused rather than allocated.
11. **The test's own child runs of `--fixture`** set `TF2VE_VOICE_REPLAY_ONLY=1`, so the child replays without
    running the public checks again (which would recurse).

**Order of events inside a tick.** The synthetic log is made in the pseudo-code's order:
- the mixer's pulls since the last tick;
- the tick's packet;
- the tick's pass;
- the bufsize line.

The tool's events put each step's demand before its packet, and the replay matches every tick. The two orders do not
disagree anywhere. **Every hand-worked value in the order came out as written:** 7, 10, 30, 15 and 1 ticks; 0.25,
0.295 and 0.5 s; tick 29, full from tick 24 and 3520 dropped; tick 6 with 9700; the fade values; the underrun's 200,
200 and 112.

## The checks

`node tests/voice-channel.verify.mjs` (also the last suite of `pnpm test`) now prints 101 `ok` lines. The first
round's 68, by group, are below; the fix round's 33 are in "The review and the fix round". The groups:

- **The module:** it loads as a page script and in a worker as `TF2VoiceChannel`, exports exactly the four names
  and imports nothing; its constants are frozen and have the order's values.
- **The wait and the latency:**
  - `waitTicks` gives 7, 10 and 30 at 66.67, 100 and 300; 15 at 300 with 50 ms; 1 at 5 fps; and 7 at 100 fps with
    70 ms (0.07 x 100 rounds to 7.000000000000001, so this is the case the formula's `- 1e-6` is there for).
  - The limits: 1, 1500, 100 and 10 for bufferMs 0, bufferMs 10000, 5000 fps, and 1000 ms at 5 fps. "1 at 5 fps"
    alone cannot show the lower rate limit, since any rate under 10 gives 1 at 100 ms.
  - `latency` gives 0.25, 0.295 and 0.5.
- **By hand at 300 and 67 fps:** as the order gives them. The 300 fps drops are the oldest samples, the first
  packet's: `[{pulled 0, count 875, tag 0}, {pulled 0, count 2645, tag 0}]`.
- **Packets, overflow and tags:**
  - an empty packet opens a channel and writes nothing; a packet of n writes n - 1, and the first sample is the one
    left out;
  - a waiting channel gives zeros and keeps its queue;
  - the state is read-only;
  - an exact fill drops nothing;
  - an overflow drops the oldest, recorded per tag, and what is left is the newest.
- **The fade:** with `test.keepSample` and pulls of 512, every one of 4410 and of 8820 samples is
  `fround(min(1, (N - 1 - k) / 4409))`, and the named samples are as the order gives them.
- **The underrun:**
  - 200 queued: the order's case, starved, freed by the next tick; an add before that tick keeps the channel with no
    wait, and the next pull reads the new packet.
  - 400 queued, pull(512): the 400, then their last 112 again. This is added because with 200 queued the first and
    last 200 are the same samples, so the order's case cannot show which end is repeated.
- **The gain stub:** the calls are exactly `reset, process 100 11, process 50 22, process 30 33, reset, process 20 44`
  (an open, an append, a grace, a free, an open); what `process` returns is what is queued; without a gain the
  samples pass unchanged.
- **The log tool on three logs worked by hand**, whose events must equal hand-derived lists exactly:
  - at 66.67 fps: the wait's made-up demand of 512 and 1024 in turn from one counter, a demand read from the log, a
    grace whose queue falls only on the third step after it, an unseen free and a new channel, a session;
  - at 10 fps: an overflow that hides the demand, read as 512, 1024 and 0;
  - at 40 fps: a new channel that falls only on the fourth step, so it must not be read as a grace.

  All three replay cleanly, as does a section with no name or `bufferMs`.
- **The synthetic log at 300 fps** (seeded; the mixer takes 0, 1 or 2 blocks between ticks with probabilities
  0.07, 0.568 and 0.362, and 513 for the first block after a start). It has:
  - 90 packets, 471 bufsize lines and 4 opens, 2 of them after an unseen free (one of those is the empty packet's);
  - an append, a grace, overflow, the empty packet followed by a 2756-sample record and speech inside its wait;
  - one unrelated line between a packet line and its tick line;
  - three unrelated lines, then a second session while the old channel still held sound.

  `log-to-fixture.mjs`, run as a command, reads it. Its counts equal what the generator recorded (packets, ticks,
  opens, unseen frees, graces, the empty packet, the session). Its output holds only numbers and its own words, and
  the marker word in the unrelated lines appears in neither stdout nor stderr. **The replay matches all 473 ticks,
  and each fault mismatches:** ring + 1 on 282 ticks, ring - 1 on 282, wait + 1 on 148, wait - 1 on 81, sample kept
  on 366, no grace on 117.
- **The synthetic log at 66.67 fps**, written with Windows line ends into a file of `MARK` sections and read with
  `--section MARK67`, replays cleanly: 377 ticks, 5 opens, a grace, nothing dropped. `--section MARK300` on the same
  file gives the 300 fps run's events exactly.
- **One bufsize changed by 2.** At an opening the tool stops ("a new channel holds 14112 bytes, its packet 14110").
  During a wait it stops ("the queue moved during the wait"). At the ring's limit with a packet, while playing, the
  replay fails on 4 ticks. Where the playing channel's mixer took nothing, the tool stops ("cannot go from 41366 + 0
  to 41368"). See below for where neither happens.
- **The tool refuses**, each with its own message: two packet lines before a tick line; a packet with no tick line; a
  tick line before any packet; a session break between a packet and its tick line; a second speaker; pull lines; a
  missing marker; no `--fps`; a new channel whose queue is not its packet; the queue moving during the wait; a queue
  that cannot come from its packets.
- **`--fixture` as a command:** the synthetic fixture passes; two sections pass when a fault is seen in only one of
  them; one tick off fails and names the first mismatch; the 67 fps fixture alone fails because ring ± 1 mismatch
  nowhere in it. That last one is the exit rule doing its job: with no overflow, a log cannot tell the ring's size.

Last lines of `node tests/voice-channel.verify.mjs`:

```
  ok    --fixture: a file that is not JSON gives "not JSON" and nothing of the file   [cannot replay the fixture: not JSON]
  ok    --fixture: a file in which a fault mismatches nowhere fails   [fault "ring + 1" mismatches nowhere; fault "ring - 1" mismatches nowhere]

101 voice channel checks passed
```

It runs in about 4 s.

The replay of both synthetic sections as one fixture (`--fixture`, replay only):

```
| Section (packets, ticks, opens) | wait | engine | ring + 1 | ring - 1 | wait + 1 | wait - 1 | sample kept | no grace |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `synthetic-300` (90, 473, 4) | 30 | 0 | 282 | 282 | 148 | 81 | 366 | 117 |
| `synthetic-67` (90, 377, 5) | 7 | 0 | 0 | 0 | 274 | 350 | 372 | 92 |
replay passed: the engine matches every tick and each fault mismatches somewhere
```

`pnpm test`: exit 0 in 89 s on the fix round's code (135acde). Every suite passed, the new one last (101 checks); in
the first round it was 1 min 32 s with 68. I did not run the browser suite: no page file changed and the order does
not ask for it.

## The review and the fix round

The review wrote its own model from the order before reading the module. Its model and the module agreed on 6,000
seeds (2.09M operations). Every finding was a gap in the suite or a small issue in the tool or the replay. Each was
handled as the orchestrator directed:

| Finding | What was done |
| --- | --- |
| 1. Two ring-wrap breaks passed all checks | The suite now runs a differential against `tests/voicequeue/reference-channel.mjs`. That model is written from the order with plain arrays, starting from the review's model, and has no ring arithmetic. It runs 320 seeded cases in rings of 1 to 13, 64, 513 and 4411 samples (81k operations in under a second). After every operation it compares the state, the count, `dropped` and the gain's calls, and every sample and tag of every pull; the full `drops` lists and gain logs are compared after each case. In those cases 2,267 reads and 5,934 drops cross the ring's end. The review's cases A and B (ring 10) are named checks. `waitTicks` and `latency` agree with the model on a 300-point grid. |
| 2. `starved` on a pull that reads nothing | Case C: an empty packet at 66.67 fps, 7 ticks, `pull(512)`: starved, then freed by the next tick. Also `pull(0)` on the same channel: starved, the pseudo-code as written. |
| 3, 4. `fadeTime`, the fade window's edge | Cases D (0.05 s, 2205 samples), E (0.0999 s: floor gives 4405), F (0 s: `max(2, 0)`), G (4410 queued, `pull(2)`: 4408 stay, sample 1 is 4408/4409). |
| 5. A packet longer than the ring | The branch is kept. Case H (ring 5): 3 queued, then a packet of 9 (8 kept). The 3 are dropped, then the packet's oldest 3, as two `drops` entries; the newest 5 stay. The review's case started on an empty channel, where "the old queue not dropped" cannot show, so 3 are queued first. |
| 6, 7. Tag precision; the gain on an empty packet | Case I: tag 16777217 comes back exact in a pull and in a drop, and a tag that is not a number is -1. The gain is called on an empty packet (`reset, process 0, process 3`). |
| 8. `--fixture` on a file that is not JSON | The parse error is caught by itself and only "not JSON" is printed; a read error prints its code, not the path. A check feeds a made-up private-looking line and finds nothing of it in the output. |
| 9. The log tool's silent misreads | `--section` takes the line that is the marker, trimmed, not the first that starts with it: a departure from the order's "starts with" that the orchestrator authorised. The end of a section is still the next line that starts with `MARK`. A UTF-8 byte-order mark is stripped. A line that begins like a voice line but does not read as one stops the tool with its line number: a sign, more than 9 digits, something before or after it, or cut short. A last line with no line end is read, and stderr says so. |
| 10. The tool's edges | Hand logs whose events must be the order's: a queue of 4096 bytes before an empty ring may be a grace and 4098 may not; overflows at exactly 1024 and 2048 bytes over the ring and 2 bytes under each; the next three steps ending at a session break; a queue held at the 44100 cap not counted as a fall; a grace on the first tick line after the wait (`age >= wait`). Refusals: a second entity on the same channel number, a grace at a wait of 3 ticks, an odd number of bytes. |
| 11. 2050 to 4096 bytes before an unseen free | The rule is the order's. The README says this case fails loudly in the replay, and the 4096 check shows the replay mismatching. |
| 12. The report | Corrected above: `drops` entries per run of one tag; the files. |
| Pull sizes | Counted on stderr: the pulls read from the log that are not whole 512-sample blocks. One check covers it: 0 in both synthetic logs; 2 (a 511 and a 513) with one bufsize changed by 2 in mid-play; `--strict` refuses the 511 with its line number. One more sample is allowed on **the first pull the log shows after a channel's wait**. That differs from the first step after the wait: the logs show a channel's first fall one or two lines late in 9 of 28 channels at 300 fps, and the synthetic mixer takes nothing on 7% of ticks. The fixture's format is unchanged. |

**What the tool's changes do to the private comparison.** Each change only stops the tool on input the old tool
read, or only adds to stderr: the exact marker, the stop on unreadable voice lines, the byte-order mark, the last-line
note, the pull count. The fixture's events are otherwise the same. The orchestrator re-runs the six sections. Two
outcomes I cannot see from here:
- a real log may end in a voice line cut short, which now stops the tool where the old one ignored it;
- the pull count should be 0 on the private fixture's sections, with every 513 and 1025 on a channel's first pull.

**The sweep again.** Of the single ±2 bufsize changes that the order's rules cannot see (below), the pull count
flags all 635 at 300 fps and 661 of 662 at 66.67 fps. The one left is a change on a channel's first pull, where 513 is
allowed.

**How the new checks were broken.** As before, a scratch script changed one line at a time in copies of the four
files and ran the suite on each copy. This time every failing check was recorded, not only the first. An unchanged
control copy passed in each run.

| Break | Checks that fail |
| --- | --- |
| 1: the head one too far after a read that reaches the ring's end | A (`... \| 206,207,208,107` for `205,206,207,208`); the differential |
| 1: a drop across the ring's end moves the head one short | B (`203,204,301,...` for `204,205,301,...`); the differential |
| 2: starved only when the pull read something | C (not starved, still in use after the tick); the differential |
| 2: starved only when the pull asked for something | C's `pull(0)` half; the differential (seed 6, a pull of 0) |
| 3: `fadeTime` ignored | A, B, D (sample 1 0.49966 for 0.99955), E, F, H, the differential |
| 3: `round` for `floor` | E (0.99955 for 4403/4404) |
| 3: no `max(2, ...)` | B, F (`1,1,1,1,1`), H, the differential |
| 4: the fade window at `after < fade - 2` | B, F, G (sample 1 is 1), H, the differential |
| 5: the packet's oldest kept; the old queue not dropped; the lost not counted | H in each (`11,12,13,14,0`; one `drops` entry; `dropped` 3), the differential |
| 6: tags stored, or pulled, as Float32; a non-number tag kept as NaN | I (16777216 for 16777217; NaN) and, for the Float32 two, the differential |
| 7: the gain skipped on an empty packet | the empty-packet gain check (`reset, process 3`), the differential |
| 8: the parse error printed | the not-JSON check (the message quoted `"Player qPr"...`) |
| 9: the marker as a prefix; untrimmed | the marker check (MARK6 read MARK67's part); untrimmed also fails the marked-section checks |
| 9: no byte-order mark stripped | the byte-order mark check ("tick line with no channel") |
| 9: an unreadable voice line passes; leading space or a sign not seen | the seven voice-line refusals; two; one |
| 9: the unended last line not said; dropped | the last-line check; dropped also fails four hand logs |
| 10: grace limit `< 4096`, `<= 2048`, `<= 4098` | the 4096/4098 edge check |
| 10: overflow `> 1024`, `> 2048` | the overflow-edge check |
| 10: `ent` not checked | the same-channel second-speaker refusal |
| 10: the next three steps go on past a session break | the session-break edge check |
| 10: the next three steps ignore the cap | the cap edge check |
| 10: no stop at a wait of 3 or less; `age > wait`; an odd difference accepted | the wait-3 refusal; the first-playing-step edge; the odd-difference refusal |
| Pulls: not counted; no one-more on the first; one-more on every pull; the first not reset at an open; `--strict` ignored | the pull-size check in each |

Two breaks survive, both equivalent:
- **Deleting the session-break line from the look-ahead.** A session marker has no queue, so every comparison after
  it is against NaN, false, and the search finds no fall, exactly as when it stops. Continuing past the marker
  instead is caught.
- **The first round's two: not clearing the ring or `playing` at an open.** The first round's 65 breaks were run
  again on the current files, with a control. 63 fail and these two survive.

## How each check was broken

A scratch script copied the three files, changed one line, ran the suite on the copy and recorded the first failing
check. That was 65 changes; **63 fail a check and 2 survive.**

**The module** (37 changes):

| Broken | First check that fails |
| --- | --- |
| no `- 1e-6` in `waitTicks` | 7 at 100 fps with 70 ms |
| either rate limit, either `voice_buffer_ms` limit | the limits check (200, 5, 0 and 3000 instead of 100, 10, 1 and 1500) |
| the burst 0.16 s to 0.15 s; no 0.5 s cap | `latency` (0.24 s; 0.595 s) |
| countdown one short; `left < 0` for `<= 0` | 300 fps playing from tick 29 (tick 28; never) |
| no gain reset; a reset on every packet | the gain stub's calls |
| the gain's return value ignored | what the gain returns is what is queued |
| the gain run after the sample is dropped | the gain stub (`process 99 1` ...) |
| opens not counted | an empty packet opens a channel |
| the whole packet written | by hand 300 fps (882 and 2646 dropped) |
| the last sample dropped instead of the first | the first sample is left out |
| the newest dropped instead of the oldest | by hand 300 fps (tags 6 and 7 dropped) |
| `starved` not cleared by a packet | a packet before that tick keeps it |
| a starved channel not freed | the next tick frees it |
| a waiting channel read | a waiting channel gives zeros |
| the fade: divisor `fade`; one sample short; outer test too tight; none; length 4411 | the 4410-sample fade |
| underrun: zeros only | the 200-sample underrun |
| underrun: the first samples repeated | the 400-sample underrun |
| an emptied ring not marked starved | the pull that empties the ring marks it starved |
| `test.noGrace`, `test.ring` or `test.waitTicks` ignored | each of the six faults mismatches (that fault 0) |
| `test.keepSample` ignored | the fade |
| `pulled` counts only what was read | the overflow-per-tag check (pulled 0, not 164) |
| one `drops` entry per overflow | the overflow-per-tag check |
| tags not stored | by hand 300 fps (tag -1) |
| **the ring not cleared at an open** | **survives** |
| **`playing` not cleared at an open** | **survives** |

The two survivors are equivalent changes. A channel is freed only when its ring is empty, and `playing` is already
false whenever a channel is free. So neither line can change anything a caller can see. The engine does both, and the
module keeps them.

**The tool** (24 changes): all fail a check.
- One other line enough for a session: the synthetic log stops at its single unrelated line.
- Three lines needed: the hand log.
- One packet a tick not enforced, a dangling packet allowed, a new channel's queue not checked, the wait's queue not
  checked, a second speaker not checked: each fails its refusal check.
- The free test at `prev <= 1000`: the tool's counts differ from the generator's.
- No free test; a look-ahead that always or never falls, or looks 2 or 4 steps; no `3, -1`; a grace demanding 512;
  the wait always 512; the wait's counter per channel; the tool's wait one tick short: each fails the hand logs'
  events.
- The overflow rule always 0, always 1024, or with its thresholds swapped: the 10 fps hand log.
- Negative or odd demands allowed: the fixture check refuses the result.
- A section running to the end of the file: the marked-section check.
- A session break that leaves the channel alive: the hand log.

**The replay** (4 changes): all fail a check.
- A new session that keeps the channel, and comparing samples instead of bytes: the hand logs' replay.
- A fault seen nowhere passing: the 67 fps `--fixture` check.
- An engine mismatch passing: the one-tick-off check.

## Where a corrupted log goes unnoticed

The log has the queue but not the mixer's pulls, so the tool reads each pull off the queue. Take a bufsize line on
which the playing channel's mixer took something, and change it by one sample. The pull before it changes by one
sample and the pull after it by one sample the other way, both still non-negative and even in bytes, so the tool
cannot see it, and the replay of what the tool wrote matches. I changed every bufsize line of the synthetic logs by
+2 and by -2, one at a time:

| Log | Changes | The tool stops | The replay fails | Absorbed |
| --- | ---: | ---: | ---: | ---: |
| 300 fps | 942 | 299 | 8 | 635 |
| 66.67 fps | 748 | 85 | 1 | 662 |

So "a log with one bufsize changed by 2 makes the tool stop or the replay fail" holds at openings, during waits, at
the ring's limit and where the mixer took nothing. It does not hold at a pull in the middle of play. The orchestrator
decided on a count, not a refusal: the fix round counts the pulls that are not whole 512-sample blocks on stderr and
refuses them with `--strict`. That flags all but one of the absorbed changes ("The review and the fix round").

## The private runs

These are for the orchestrator to run.
- `node tests/voice-channel.verify.mjs --fixture <takes folder>/set-G-debug-probe/voice-queue-fixture.json`
  prints the order's table layout with a `wait` column added, and the first mismatch of any engine row.
- `node tests/voicequeue/log-to-fixture.mjs <log> --fps <f> [--section <marker>]` on each of the six log sections
  writes a fixture to compare with the private one. The README's one-liner prints the first differing event pair.

Where my tool could differ from the prototype's fixture: the stops in reading 9, where the prototype went on (it
dropped a packet whose tick line lay across a session break, and ignored a final packet with no tick line). Its
leading `0, 0`, when a section begins with two or more other lines, follows the order's rule literally; I cannot see
whether the private fixture has one.

## For W3-02b

- `createChannel` and `VOICE_CHANNEL` are as above. `VOICE_CHANNEL.firstBlock` (513) is for the clock, and
  `pull(n)` takes exactly `n`.
- `drops[].pulled` is the channel's output position counted in samples returned, so the 513 of each start counts one
  extra.
- `VOICE_CHANNEL.sender` is to be added by W3-02b.
- W3-09's report (now on main) has a section addressed to the plan's sender model.

## CI

These are the `tests` workflow runs on the branch's pushed heads:
- 73a3d15: success (run 42741494915);
- 8c1336b: success (run 42742211746);
- ad1a27d: success (run 42742507298);
- b3fdaaa (the merge 96c6d83 and the first report): success (run 42742803370);
- 135acde (the fix round's code): success (run 42747413291);
- the head this report is committed on: in the summary returned to the orchestrator (this file is committed before
  its run ends).

## The scan

Before the final push I searched `git diff origin/main...HEAD` and every commit message on the branch for the things
CLAUDE.md's hard rules forbid:
- recordings, logs or fixtures from the private data;
- 17-digit numbers (SteamIDs), e-mail addresses, user, machine or folder names, and absolute paths;
- model names, other than each commit's attribution trailer.

None found. The only hits were the file name `CLAUDE.md`, the branch name `claude/w3-02a-voice-channel` in the merge
commit's message (main's own merge commits name their branches the same way), and the fixture path
`set-G-debug-probe/voice-queue-fixture.json`, which the order itself gives. The synthetic logs and fixtures are written to a temporary
folder by the test and deleted. The scratch files of this order (the mutation script, the sweep, the synthetic logs)
are in the session's scratch folder, not in the repository. The private folder was not read.

## Not done, or uncertain

- The private replay and the private event-for-event comparison: the orchestrator's.
- The browser suite was not run (no page file changed).
- The fix round's tool changes may stop the tool on a private log where the old one read it (a cut last voice line),
  and the pull count on the private sections is not known to me; the orchestrator re-runs them.
- The `pull(0)` reading (5) and the extra stops (9) are mine. They agree with the prototype except where reading 9
  says otherwise.
- The one-sample corruption of a pull in mid-play goes unnoticed, as described above.
