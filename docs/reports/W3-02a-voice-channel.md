# W3-02a: the voice channel as a module, and the log replay

The builder's report, 2026-11-10. The order is W3-02a in `docs/work-orders/W3-02-receiver-queue.md`. All of it is
built and every public check passes. The private runs ("The orchestrator runs privately") are the orchestrator's to
do, and I have not done them. Nothing in the app uses the module yet.

## What was built

| File | What |
| --- | --- |
| `voice-channel.js` (new) | The channel, as the pseudo-code of "The model": an IIFE in `demo.js`'s form (`module.exports` under Node, `TF2VoiceChannel` elsewhere, no imports). It exports `VOICE_CHANNEL`, `waitTicks`, `latency` and `createChannel`. |
| `tests/voicequeue/log-to-fixture.mjs` (new) | A console log to a numbers-only fixture, by spec 5's rules. It exports `logToFixture(text, opts)` for the test; the command line is the order's. |
| `tests/voice-channel.verify.mjs` (new) | 68 public checks. `--fixture <file>` adds the replay with the six faults. |
| `tests/voicequeue/README.md` (new) | How to make a log and a fixture, how to replay and compare one, and that real logs stay private. |
| `package.json` | `node tests/voice-channel.verify.mjs` appended to `test`. |

No other file was touched. `git diff --stat origin/main...HEAD` lists exactly these five.

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
    except the `drops` list, which grows by one entry per overflow.
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
   in a grace); the order's tables come from the prototype's reading.
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

`node tests/voice-channel.verify.mjs` (also the last suite of `pnpm test`) prints 68 `ok` lines. The groups:

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
  ok    --fixture: one tick off fails, naming the first mismatch
  ok    --fixture: a file in which a fault mismatches nowhere fails   [fault "ring + 1" mismatches nowhere; fault "ring - 1" mismatches nowhere]

68 voice channel checks passed
```

The replay of both synthetic sections as one fixture (`--fixture`, replay only):

```
| Section (packets, ticks, opens) | wait | engine | ring + 1 | ring - 1 | wait + 1 | wait - 1 | sample kept | no grace |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `synthetic-300` (90, 473, 4) | 30 | 0 | 282 | 282 | 148 | 81 | 366 | 117 |
| `synthetic-67` (90, 377, 5) | 7 | 0 | 0 | 0 | 274 | 350 | 372 | 92 |
replay passed: the engine matches every tick and each fault mismatches somewhere
```

`pnpm test`: exit 0 in 1 min 32 s. Every suite passed, the new one last (68 checks). I did not run the browser suite:
no page file changed and the order does not ask for it.

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
the ring's limit and where the mixer took nothing. It does not hold at a pull in the middle of play. A plausibility
rule would catch most of those: a pull must be 0, 512, 513, 1024 or 1025 samples, or the rest of the queue. It is not
in the order's rules and I did not add it, because the real logs may hold pulls it would refuse (hitches, partial
pulls). It is a decision for the orchestrator.

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
- ad1a27d and the merge 96c6d83, and the head this report is committed on: in the summary returned to the
  orchestrator (this file is committed before its run ends).

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
- The `pull(0)` reading (5) and the extra stops (9) are mine. They agree with the prototype except where reading 9
  says otherwise.
- The one-sample corruption of a pull in mid-play goes unnoticed, as described above.
