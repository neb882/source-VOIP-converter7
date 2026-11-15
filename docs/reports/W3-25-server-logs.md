# W3-25: the log tool reads a real server's log

The build report for `docs/work-orders/W3-25-server-logs.md`, branch `claude/w3-25-server-logs`. No file the site loads
changed. `node tests/cache-number.mjs origin/main --report`: "cache number against origin/main (363f8cb): no cached
file changed; the number stays v54".

## What changed

| File | Change |
| --- | --- |
| `tests/voicequeue/log-to-fixture.mjs` | reads several packets on a tick, one channel of several (`--channel`), a channel passing to a second speaker, and pull lines; its header and stops follow |
| `tests/voicequeue/synthetic-log.mjs` | `synthesizeServer` and `SERVER_SCRIPT`: a server's log of several speakers under the frame clock's own mixer, with or without pull lines. `synthesize` is unchanged |
| `tests/voicequeue/replay.mjs` | its header only (the order in which events run); no code changed |
| `tests/voicequeue/README.md` | making a server log, `voice_showchannels 2`, `--channel`, the restated rules, the stops, the line printed late |
| `tests/voicequeue/record-hook.mjs`, `compare-records.mjs`, `calls-main.jsonl` | the record of every call of the tool, the comparison, and main's record (below) |
| `tests/voice-channel.verify.mjs` | the server logs' checks (`serverLogChecks`, also `--server-logs` alone); three refusal checks replaced |
| `tests/reproduce.verify.mjs` | two checks of `queue` that asserted removed refusals replaced |
| `tests/README.md` | the rows of `voice-channel` and `reproduce`, and the `--server-logs` line |
| `docs/REPRODUCE.md` | three sentences that said the script refuses pull lines, or names `voice_showchannels 2` as a cause of "differs" |

`tests/reproduce/queue.mjs` is not in the order's list and was not touched.

## The rules restated for several packets on a tick

Every packet line of the channel before one of its tick lines is added on that tick, in the log's order: one `1, N`
for each, before the tick's `3, B`.

| Rule (W3-02a spec 5) | Restated |
| --- | --- |
| the bytes a tick adds, `w = 2 x max(0, N - 1)` | the sum of that over the step's packets (an add that overflows clips at 44100, and clipping after each add gives the same bytes as clipping the sum, since each add is 0 or more) |
| a step opens a channel when it has a packet and none is alive | when it has at least one packet; the opening's queue must be `min(44100, w)` of all of them (an empty first packet opens, the rest append) |
| the unseen free and the grace: previous `B` at most 4096, this `B` equal to `min(44100, w)` | the same with the sum; the emitted `2, 1024` (or the read pull) comes before all the packets, the free's `3, -1` before them too |
| an overflow hides the demand | "has a packet" is "has at least one"; `previous B + w - 44100` is judged on the sum |
| an empty packet | each packet of 0 samples is counted |
| the stop "a second packet line before a tick line" | removed; "a packet line with no tick line after it" names the first of the step's packet lines |

## Several speakers

- The tool reads the lines of the channel `--channel` names, or the part's only channel. With more than one and no
  `--channel` it stops: `more than one channel: channel 0 (N tick lines), channel 1 (M tick lines); the tool reads one
  channel at a time` (the command line adds `; give --channel <n>`). Numbers only.
- Packet, tick and pull lines are matched by the channel they name. Other channels' lines are counted
  (`otherChannelLines`) and not kept. They are voice lines, so they end a run of other lines and do not count
  towards the two other lines that begin a session. *Chosen*: counting them as "unrelated" for the session rule
  would cut a two-speaker log into a session a tick.
- A change of entity on the channel is a new session (`0, 0`) when the step has a packet, the channel was playing,
  its ring ran dry before the step (with the demand worked out: the last queue at most 4096 bytes, the bound of the
  unseen free; with it read: the pulls read at least what the ring held) and the step's queue is its packets'.
  Anything else stops with the old words, "a second channel while one is in use", now followed by "the entity changed
  with no free tick between". *Inferred*: a channel is given to a new speaker only after it was freed, and it is freed
  on a tick that prints nothing for it, so the log's evidence of a free tick is its ring running dry.

## Pull lines: the order the fixture records

A log with `Voice - mixed N samples from channel C` lines has the demand read. The fixture records, for each tick
line of the channel: the sum of the channel's pull lines since its previous tick line as one `2, n`, then that step's
packets `1, N` in the log's order, then `3, B`. The replay runs the events in that order: pull, add, tick.

That is the frame's order as W3-23r read it (packets, ticks, mixer): the packets are taken at the head of a frame's
first tick and the mixer paints after the frame's ticks. So the pulls printed after a tick line belong to before the
next tick's packets. Under 67 frames a second a frame's tick lines come in a run with no pull line between them, and
the steps inside a run get `2, 0`; the pulls after the run go before the next frame's packets and its first tick.
`replay.mjs` needed no change. *Chosen*: the pulls of a stretch go before its packets even where a packet line stands
before a pull line; the game's frame does not print them so, and where a line is printed late (below) this places the
pull where it happened.

The other rules with the demand read:
- The demand is read from the first tick line after the first pull line of any channel. The stretch that line falls
  in is worked out from the queue, since it may have begun before `voice_showchannels 2` was set (*chosen*).
- During a new channel's wait the tool still writes 512 and 1024 in turn, so that a model that plays early fails. The
  game does not pull a channel that waits (W3-07: the sound starts when the channel plays; *inferred*), so a pull of
  the channel there stops the tool.
- While the channel plays the queue is not checked against the demand by the tool; the replay judges it. The
  "cannot go" stop applies only to a worked-out demand.
- Free or grace: a packet on a step after pulls that emptied the ring is a grace if the channel is pulled before its
  `wait - 1`th tick line after it (a new channel is not pulled during its wait), and a new channel if it is next pulled
  on a tick line later than both its wait and a frame's ticks (`ceil(88200 / fps / 1323)`, the frame clock's
  arithmetic: a kept channel is pulled after its frame's last tick). Between the two, the size of that pull tells: a
  whole number of blocks plus one is a start (513 on the first block: one sample more in 16 of 16 starts, logged,
  finding 22; that a pull line prints the 513 is *inferred*), a whole number of blocks a kept channel. Any other size
  stops ("cannot be told"). At 30 frames a second (a wait of 3, up to 3 ticks a frame) the case between is the grace
  in a frame of three ticks; in the synthetic 30 log the pull size settles 4 of its 16 graces and frees (measured on the build), the others fall on either side.
- The count against the 512-sample blocks and `--strict` apply to each step's read demand.

A fixture with read demand has its own `about` text (naming `voice_showchannels 2`); a fixture of a log without pull
lines keeps the old text byte for byte.

## The synthetic logs

`synthesizeServer({ fps, seed, pulls }, createChannel)` runs one module channel a slot on the frame clock at every
frame rate (frame k at `88200 k / fps` half samples): a frame's packets first, each printing its incoming line, then
its ticks (each channel in use prints its tick line, in channel order), then its blocks (each playing channel pulled
512, 513 on its first block, printing a pull line with `pulls`). A speaker with no channel takes the lowest free one.
`SERVER_SCRIPT` has three speakers: entity 1 with a three-packet tick (one empty), a burst of three that overflows the
ring, a grace, and a reopening after an unseen free; entity 2 on channel 1 at the same time with a two-packet tick
(one empty); entity 3 taking channel 0 after entity 1's last free. Seed `0x5EED`, logs at 300 (with and without pull
lines) and at 30 (with them). Everything is from the module's own channel; nothing is from a recording.

## What did not move, and how it was shown

`tests/voicequeue/record-hook.mjs` wraps `logToFixture` as the module loads (`NODE_OPTIONS=--import`), in the suite's
process and in every child (the tool on its own, the check `queue`), and writes one line a call: the SHA-256 of the
log's text, the options, and the fixture's SHA-256 with the summary's counts, or the stop's message. It was run on a
copy of main at 363f8cb before the tool changed, and that record is committed first, as `calls-main.jsonl` (commit
3ee9c55): 75 calls, 67 distinct, 39 fixtures and 36 stops.

```sh
TF2VE_TOOL_RECORD=<file> NODE_OPTIONS=--import=file://<repo>/tests/voicequeue/record-hook.mjs node tests/voice-channel.verify.mjs
TF2VE_TOOL_RECORD=<file> NODE_OPTIONS=--import=file://<repo>/tests/voicequeue/record-hook.mjs node tests/reproduce.verify.mjs
node tests/voicequeue/compare-records.mjs tests/voicequeue/calls-main.jsonl <file> --removed 'second packet line' \
  --removed 'second channel while one is in use: the tool reads one speaker' --removed 'a pull line: the log was made'
```

The comparison of the record made during the final whole `pnpm test` on the branch (at the tool of commit c8f3d13):

```
67 distinct calls on main (75 in all): 60 the same on the branch, 7 on a removed refusal, 0 different, 0 not called
```

The 7 are the replaced checks' logs (two packet lines before a tick line, a second channel, a pull line), which now
read, stop with the new words, or stop elsewhere: "more than one channel ...", "the entity changed with no free tick
between" (the same-channel case, whose check is unedited), and for the one pull line added to `queue`'s stand-in "the
queue moved during the wait". Every fixture main's tool made, and every other stop, is the same: the same fixture's
hash and the same counts.

`tests/reproduce.mjs`'s `queue` prints from the tool's counts, the fixture and the replay; with both the same for every
log it read on main, and `replay.mjs` and `queue.mjs` unchanged in code, its printed lines for those logs are the
same.

## The checks replaced

| Suite | Check on main | Now |
| --- | --- | --- |
| `voice-channel` | the tool stops: two packet lines before a tick line | the hand-worked logs of several packets on a tick |
| `voice-channel` | the tool stops: a second speaker (`chan 1`) | the tool stops with no `--channel`, listing the channels and their tick lines |
| `voice-channel` | the tool stops: pull lines (voice_showchannels 2) | the tool stops on a pull line that does not read as one; the pull lines' checks |
| `reproduce` | a pull line added: differs, naming the setting | one pull line added: differs (the demand is read from it on, and the log has no others) |
| `reproduce` | a second speaker's line added: differs, "a second channel" | differs, "more than one channel", the channels listed |

"a second speaker on the same channel number" is unedited and passes: that stop keeps its words.

## The new checks and the breaks that fail them

The new checks are in `serverLogChecks` of `tests/voice-channel.verify.mjs`: hand-worked logs of several packets on a
tick (in a wait, at an opening, in play, in an overflow, in a grace, after an unseen free), of two channels, of a
channel passing to a second speaker and three changes of entity that stop, of pull lines at 30, 66.67 and 20 frames a
second; then the three synthetic server logs, each channel replayed, the tool's counts against the writer's record,
the six faults, the CLI with `--channel`, the frame's order at 30, and the line printed late. Each break below was
made in a copy of the branch and run with `node tests/voice-channel.verify.mjs --server-logs`:

| Break (in `log-to-fixture.mjs`) | What failed |
| --- | --- |
| a tick's packets added in reverse order | six hand-worked checks of several packets (the events out of the log's order) |
| all but a tick's first packet dropped | the tool stops on the hand-worked logs and on both 300 logs ("the queue moved during the wait"); on the 30 log channel 0 is off on 259 of 334 tick lines |
| another channel's packet taken | the tool stops on the two-channel hand log ("a new channel holds 1000 bytes, its packets 3000"), on both 300 logs and on the 30 log's channel 1; the 30 log's channel 0 off on 248 tick lines |
| another channel's pull counted | the hand log with a second channel's pulls (a demand of 2049 for 1025); channel 0 of the 300 log with pull lines off on 248 of 379 tick lines |
| an entity change with no free tick let through | the three hand-worked changes of entity that must stop |
| the read pulls placed after the tick's packets | the hand log at 30; every channel of the two pull logs (off on 312, 204 and 148 tick lines); the 30 log's read pulls; the line printed late |
| the read demand of 0 kept in a wait instead of 512 and 1024 | "each of the six faults mismatches" on the 300 log with pull lines (`wait - 1` on none) |
| the size of the next pull not used (the 513 rule) | the tool stops on the 30 log's channel 1 ("cannot be told") |
| the stretch of the first pull line read, not worked out | five checks, among them the stretch begun mid-way, the pull in a wait, and the read-tick counts of every synthetic channel |
| the ring's running dry judged by the 4096 bound with the demand read | the 20 frames a second pair (513 and 512) and its stop |
| a frame's ticks ignored in telling a grace from a new channel | the 20 frames a second pair, its stop, and channel 1 of the 30 log (5 frees found for 1) |

## The line printed late

Shown on the synthetic 300 log with pull lines: one packet line moved after the tick line that counts it gives one
tick line off, by that packet, and the next right again. On the same log without pull lines the tool stops on that tick
line ("the queue cannot go from"), as the queue rose by more than its packets. The README says both and how to tell the
late line from a fault.

## What was run

| Command | Result |
| --- | --- |
| `node tests/voice-channel.verify.mjs --server-logs` | 41 checks passed, 0 failed (and every break above failed it) |
| `flock /tmp/tf2ve-heavy.lock pnpm test` (with the recorder on) | 27 of 27 suites passed, 1600.4 s; `voice-channel` 207.4 s, `reproduce` 100.4 s |
| CI, `tests` workflow on acf92ca | `verify` success (units, engine, render, stages, browser all success) |

The browser suite was not run locally; it ran on CI. No file the site loads changed.

## Not done, and open

- **Set Q's first log may stop the tool.** Set Q's late line is in the first log (294 frames a second, no pull lines).
  The committed tool works the demand out there, and a late line whose packet raised the queue by more than the
  stretch's pulls stops it ("the queue cannot go from"); it reads on only where the pulls hid the rise. The private
  reader's figure (13,486 of 13,487) came from scratch copies whose handling of that line is not in the repository.
  The orchestrator's private run will show which. The order says the line is not guessed at, so the tool does not.
- **Two other lines in a row still begin a session** (W3-02a; BC-3 in `W3-02-receiver-queue.md` names it). On a real
  server two chat or kill lines between a channel's tick lines would cut the channel and stop the tool ("a tick line
  with no channel open"). The order does not change that rule; the private run will show whether Set Q's parts have
  such pairs.
- `tests/reproduce/queue.mjs`'s Q2 counts a step's packets by its last `1, N` only; on a log with several packets on a
  tick that can move a channel's first fall. Not in the order's files.
- A log that switches back to `voice_showchannels 1` inside a part reads its pulls as none from there; the README
  says to start a new part.
- The record's dated line under Set Q is left to the orchestrator, as the order says.
