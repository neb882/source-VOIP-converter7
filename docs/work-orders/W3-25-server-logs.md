# W3-25: the log tool reads a real server's log

Status: written 2026-11-15 by the orchestrator; built, then widened after the private run on the branch (a start in mid-play, below), reviewed (merge after fixes; the fixes made, below) and merged 2026-11-15 with no cache change.

## Why

`tests/voicequeue/log-to-fixture.mjs` turns a console log of the game's voice queue into a fixture of numbers, and
`tests/voicequeue/replay.mjs` runs the fixture through `voice-channel.js`. Its rules come from logs made on a local
server with one speaker (Set G). A log from a public server (Set Q, 2026-11-15; `tests/REFERENCE_2026.md`, "Set Q: a
real server") breaks three of them:

- **Several packets on one tick.** The tool stops at "a second packet line before a tick line (the engine adds at
  most one packet a tick)". Set Q has 25 ticks with two packets and 1 with three in 202 s (measured), and one call
  drains every waiting packet (read, W3-23r).
- **Several speakers.** The tool stops at "a second channel while one is in use". Each of Set Q's logs has a second
  channel in use, and one part has three.
- **Pull lines.** With `voice_showchannels 2` the game also prints "Voice - mixed N samples from channel C" for each
  pull, and the tool refuses such a log. Under 67 frames a second those lines are the only direct record of the
  frame's order (packets, ticks, mixer; W3-23), and with them the mixer's demand is read, not worked out.

A private reader replayed Set Q with scratch copies that allow all three, and the module gave the logged queue on
every tick line but one (measured; the one is an `incoming` line printed after the tick line that already counts
it). The committed tool should do what those scratch copies did, so that the next server log is read by a tool with
tests.

## What to build

1. **Several packets on a tick.** Every packet line before a tick line of its channel is added on that tick, in the
   log's order. The fixture gets one `1, N` pair for each, before the tick's `3, B`. The rules that read a step's
   one packet (an opening, a grace, an empty packet, the bytes a tick adds) are restated for a step's packets, and
   the report says how each was restated. `replay.mjs` and the fixture's `about` text follow if they need to.
2. **`--channel <n>`.** The tool reads one channel's lines and counts the others' as it counts unrelated lines.
   - With no `--channel` and one channel in the log (or the section), it runs as today.
   - With no `--channel` and more than one, it stops and lists the channel numbers and each one's count of tick
     lines (numbers only).
   - A channel's entity may change where the channel was free between two speakers: that starts a new session
     (`0, 0`). A change of entity with no free tick between is a stop, as a second channel is today.
   - A packet line names its own channel; a tick line names channel and entity. The tool matches them by channel.
3. **Pull lines.** A log with "Voice - mixed N samples from channel C" lines is read:
   - The picked channel's pulls between two of its tick lines are that tick's demand (`2, n`), read from the log;
     the count against the mixer's 512-sample blocks and `--strict` apply to what is read.
   - Other channels' pull lines are counted and ignored.
   - The fixture keeps the log's order where it matters to the replay: under 67 frames a second a frame's tick
     lines come in a run before its pulls. State in the report exactly what order the fixture records and how the
     replay honours it, and show on a synthetic 30 frames a second log that the replay gives the queue on every
     tick line with the read pulls and fails with the pulls of an even clock.
   - A log without pull lines is read as today.
4. **The line printed late.** Not guessed at. The README says a real server's log can print an `incoming` line
   after the tick line that already counts it (Set Q: once in 13,487 tick lines, measured), that the replay then
   reports that tick as off, and how to tell it from a fault (the next tick line is right again with no packet
   line between).
5. **The synthetic logs** (`tests/voicequeue/synthetic-log.mjs`, `synthetic-results.mjs`) gain what the committed
   checks need, made from the module's own channel, never from a recording:
   - two and three packets on a tick, one of them empty;
   - two channels in use at once, and a channel reused by a second entity after it was free;
   - a log with pull lines at 30 frames a second from the frame clock, and one at 300.
6. **The documents.** `tests/voicequeue/README.md` (how to make a server log: `voice_showincoming 1`,
   `voice_showchannels 1` or `2`; `--channel`; what the tool prints when it stops), the tool's header comment,
   `tests/README.md`'s rows, and `docs/REPRODUCE.md` only if a sentence there is made untrue. The record
   (`tests/REFERENCE_2026.md`) gets one added, dated line under Set Q saying the committed tool now reads such a
   log, after the orchestrator's private run; the builder leaves it.
7. **The report**, `docs/reports/W3-25-server-logs.md`: what changed, what was run, each figure with its standing,
   what is not done.

## What must not move

- Every fixture the tool makes today from a log it reads today is the same byte for byte: the committed synthetic
  logs and every case of `tests/voice-channel.verify.mjs` and `tests/reproduce.verify.mjs` that runs the tool. Show
  the comparison against `main`.
- `tests/reproduce.mjs`'s `queue` check reads a stranger's own log with this tool. Its printed lines for a log it
  reads today do not change.
- No file the site loads changes, so the cache number does not change. `voice-channel.js` is not touched: if the
  replay cannot be made to give a real order of packets, ticks and pulls without changing `createChannel`, stop and
  ask.

## The tests

- The existing suites pass unedited except where a check asserts one of the three refusals this order removes; each
  such check is replaced by the new behaviour's check and named in the report.
- New checks in `tests/voice-channel.verify.mjs` for items 1 to 3 and 5, each with a break that fails it (shown in
  the report): packets on a tick added in the wrong order or all but the first dropped; the wrong channel's packet
  taken; a pull of another channel counted; an entity change with no free tick let through.
- The six faults of `replay.mjs` still fail on the new synthetic logs where they fail on the old ones.
- `flock /tmp/tf2ve-heavy.lock pnpm test` whole, and CI's `verify` on the branch.

## Files

May touch: `tests/voicequeue/*`, `tests/voice-channel.verify.mjs`, `tests/reproduce.verify.mjs` and
`tests/reproduce.mjs` only where the tool's interface forces it, `tests/README.md`, `docs/REPRODUCE.md` (item 6),
the report.

May not touch: anything the site loads (`voice-channel.js`, `engine/`, `app/`, `index.html`, the codec modules,
`sw.js`), `tests/REFERENCE_2026.md`, `tests/predictions/`, `docs/PROGRESS.json`, `docs/PROGRESS-LOG.md`,
`docs/README.md`, `CLAUDE.md`, this order.

## After the merge: the private run

The orchestrator runs the committed tool on Set Q's two logs: the first log's music channel and its second speaker,
and the 67 and 30 parts of the second. Expected (the private reader's figures with scratch copies, measured): the
logged queue on 13,486 of 13,487 tick lines, 151 of 151, 5,099 of 5,099 and 1,034 of 1,034, and 4,790 of 4,790
with the read pulls.

## Added after the private run on the branch (2026-11-15): a log that begins while the channel plays

The order missed this. The orchestrator ran the first build on Set Q before the review, and the tool stopped on three
of the four parts: a log made on a real server begins while someone is already talking, so the channel's first tick
line has no opening before it (measured). The first log also has three places where two other lines in a row fall
between voice lines while the music plays, and the one line printed late (measured). So the expectation above was
wrong in two ways: the first build could not give it, and a line the tool starts from is not compared.

Added to "What to build":

- **`--mid-play`.** Without it the tool is as first built: every stop, message and fixture the same. With it the
  channel may be read from a tick line on with no opening in the log, in three places:
  - a session's first tick line of the channel that is not an opening (no packet, or a queue that is not what its
    packets bring), at the log's start or after a session break;
  - a line the queue cannot explain, on a log without pull lines: a new session is written and the line is the
    start. The line is not guessed at; the stats count such lines.
- **A start in mid-play** takes the channel as playing, its wait over, with the line's bytes. Its packets are counted
  and not written. The first pull after it may be a sample over whole blocks (chosen: the log may have begun inside
  the channel's wait, which a start cannot tell).
- **The fixture** has a new pair for it, `4, B`: a channel already playing that holds B bytes after this tick line,
  B even and 0 to 44100. A fixture without one keeps its `about` text byte for byte.
- **The replay** (`tests/voicequeue/replay.mjs`, which joins "Files") brings a fresh channel to playing with B bytes
  by the module's own calls. The line is not compared and counts in neither ticks, packets nor opens.
- Each start costs one compared tick line. A section with no opening cannot show the wait's two faults.

## After the review (2026-11-15)

The review (merge after fixes, nothing blocking) found four things; all four are done on the branch before the merge.

1. **A second entity on the channel after an unseen free** was written as a new session, where main wrote an unseen
   free, so a log main reads gave a different fixture and different `queue` lines (the reviewer's case: the reproduce
   stand-in at 300 with a second entity from its third opening on). It is written as main wrote it: the pull, the
   free, then the opening. The free tick is compared again. The case is a check, and its call is in main's record.
2. **Two rules had no check**: the replay's probe for the fault that keeps a packet's first sample, and the first
   pull after a start. Each has one.
3. **With `--mid-play` a start of odd bytes, or of more than 44100, was written** where the replay refuses it; the
   tool stops on it. A line the queue cannot explain now counts as a new session and a start in the stats.
4. **`tests/voicequeue/README.md`** says what a start in mid-play leaves untested: with no opening and no pull lines
   the playing tick lines match by construction, as the demand is worked out from the queue, so only the overflow,
   grace and unseen-free lines test the module there; and a line the queue cannot explain may be a disagreement with
   the module, so more than the odd one deserves a run without the option.

The stops that changed on logs main also refused are in the report.

Left, and recorded in `docs/PROGRESS.json`: `tests/reproduce/queue.mjs`'s Q2 looks only at a tick's last packet, so
it can be off on a fixture with several packets on a tick. No committed fixture has one.

## The private run (2026-11-15)

The orchestrator, with the merged tool (the branch's head, `17594e8`) and `--mid-play`, on Set Q's two logs. All
measured; the logs stay private.

| Part | Tick lines | Starts in mid-play | Compared by the replay | Off |
| --- | ---: | ---: | ---: | ---: |
| First log, the music's channel (294 frames a second) | 13,488 | 5: the first line, 3 after two other lines, 1 the queue could not explain | 13,483, and one unseen free | 0 |
| First log, a second speaker's channel | 152 | 0 | 152 | 0 |
| 67 frames a second, the music's channel | 5,100 | 2: the first line, 1 after two other lines | 5,098 | 0 |
| 67 frames a second, two other channels (9 and 1 openings, 3 changes of speaker) | 969 and 75 | 0 | 969 and 8 unseen frees; 75 | 0 |
| 30 frames a second, the music's channel, the demand read from 6,191 pull lines | 4,791 | 2 | 4,789 | 0 |

- The first log's music channel has one pull off the 512-sample blocks: the line after the one the queue could not
  explain (the `incoming` line printed late).
- Only the 30 frames a second part has its demand read. On the others it is worked out from the queue, so their
  playing lines match by construction; what tests the module there is the openings, the waits, the overflows and the
  frees.
- Faults on the first log's music channel (tick lines off): ring one sample longer or shorter 1,674 each, the wait
  one tick longer 1 and shorter 2, a packet's first sample kept 13,419, no grace 0 (no grace happened). The two
  music parts of the second log have no opening: only the kept sample shows there.
