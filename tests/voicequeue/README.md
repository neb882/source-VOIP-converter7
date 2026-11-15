# The game's voice queue, from its console log

TF2 can print its receiver's voice queue as it runs: every packet a speaker's channel receives and, on every 15 ms
client tick, how much sound the channel holds. [`voice-channel.js`](../../voice-channel.js) is that queue as read from
the game's engine (`docs/reports/W3-03-engine-binary.md`). The tools here turn such a log into numbers and replay
them through the module, tick by tick, so the model can be checked against the game.

## Making a log

In the game, with the Steam codec, type in the console:

```
con_logfile voice_q.log
voice_showincoming 1
voice_showchannels 1
```

On a local server where you hear yourself, add `voice_loopback 1`; on a real server the other players' voices are
logged as they are. Then talk, or play a file through the microphone. Two kinds of line come out:

- `Voice - N incoming samples added to channel C`: a packet, N being the samples Steam's decoder returned for it at
  44.1 kHz (the queue gets N - 1 of them);
- `Voice - chan C, ent E, bufsize: B`: once per channel in use per tick, B being the queued sound in bytes (two per
  sample; at most 44100, half a second), E the speaker's entity. A free channel prints nothing. The lines carry no
  time: each tick line is 15 ms.

`voice_showchannels 2` prints a third kind as well, one for each pull of the mixer:

- `Voice - mixed N samples from channel C`.

With it the tool reads the mixer's demand from the log instead of working it out from the queue. Under 67 frames a
second those lines are the only record of a frame's order (packets, ticks, mixer: W3-23r), so a log at a low frame
rate is best made with 2.

Note the frame rate the game ran at (`fps_max`, and the counter of `cl_showfps 1` or `net_graph 1`): the wait before
a new channel plays is counted in frames, so the replay needs it.

To put several runs in one log, type `echo MARK67` (any word that starts with `MARK`) before each; the tool reads one
marked part at a time. Give each part its own word, and start a new part when you change `fps_max` or
`voice_showchannels`.

## Making a fixture

```sh
node tests/voicequeue/log-to-fixture.mjs voice_q.log --fps 300 > fixture.json
node tests/voicequeue/log-to-fixture.mjs voice_q.log --fps 66.67 --section MARK67 > mark67.json
node tests/voicequeue/log-to-fixture.mjs voice_q.log --fps 294 --channel 1 > speaker1.json
```

The options:
- `--fps` is the frame rate the run had.
- `--channel <n>` reads channel n's lines (below).
- `--buffer-ms` is `voice_buffer_ms`, if it was not 100.
- `--name` names the section (by default the marker, else `log`).
- `--section <marker>` reads only the lines after the first line that *is* the marker (leading and trailing spaces
  aside), up to the next line that starts with `MARK`. The order said "starts with the marker". That would let
  `MARK6` read `MARK67`'s part, so the whole line is matched (decided 2026-11-10).
- `--strict` refuses a pull that is not whole mixer blocks (below).

It prints a fixture with one section, `{ about, sections: [{ name, fps, bufferMs, events }] }`, and a one-line summary
on stderr, with a second line on the channel when the log has pull lines, other channels, several packets on a tick
or a new speaker on the channel. `events` is a flat list of pairs:

| Pair | Means |
| --- | --- |
| `0, 0` | a new session: a fresh channel |
| `1, N` | a packet of N decoded samples |
| `2, n` | the mixer wanting n samples before the next tick |
| `3, B` | a client tick after which the channel holds B bytes; `3, -1`: after which it is free |

**One channel.** The tool reads one channel's lines: the one `--channel` names, or the log's only one. Packet, tick and
pull lines name their channel, and the tool matches them by it. The other channels' lines are counted and not kept;
they are voice lines, so they do not count towards the two other lines that begin a new session. With no `--channel`
and more than one channel in the part, the tool stops and lists the channel numbers, each with its count of tick
lines. A channel can pass from one speaker to another (its tick lines name a new entity) where it was free between
them: the first speaker's ring ran dry, the channel was freed on a tick that printed nothing, and the second's packets
opened it again. That is a new session (`0, 0`). A change of entity with no free tick between stops the tool: one
whose first tick line has no packet, whose queue is not that packet's, or whose channel still waited, held more than
4096 bytes (worked out) or was not emptied by the pulls read.

**Several packets on a tick.** Every packet line of the channel before one of its tick lines is added on that tick,
in the log's order: one `1, N` for each, before the tick's `3, B`. On a real server a tick can bring two or three
(Set Q, measured: 25 ticks with two and 1 with three in 202 s; one call drains every waiting packet, read in W3-23r),
and a burst after a stall can hold one of 0 samples. The rules that look at a step's packet look at all of them: the
bytes a tick adds are the sum of `2 x (N - 1)` over its packets; a step opens a channel when it has at least one
packet; an opening's queue must be what all of them bring; an overflow that hides the demand is judged on the sum.

**The mixer's demand.** In a log without pull lines the tool works the pulls out from the queue: what left it
between two ticks, less what the packets brought. Where the log cannot show the pull, the tool writes what makes a
wrong model fail: while a new channel waits, 512 and 1024 in turn (a model that plays early drains them); where a
packet overflowed the ring, 0, 512 or 1024 by how far it went over. It also tells a packet that came on the tick after
the ring ran dry (the channel was kept: the grace) from one that came after the channel was freed on a tick that
printed nothing (a new channel, which waits). The rules in full are W3-02a's spec 5 in
`docs/work-orders/W3-02-receiver-queue.md`.

In a log with pull lines the demand is read: the channel's pulls between two of its tick lines are the next tick's
demand, `2, n`, placed before that tick's packets. That keeps the frame's order, packets, ticks, mixer (W3-23r):
under 67 frames a second a frame's tick lines come in a run, its pulls after them, and the next frame's packets after
those, so the pulls between two tick lines of one frame are none (`2, 0`) and those after the run go before the next
frame's packets. The replay then pulls, adds and ticks in that order. Read from the first tick line after the first
pull line of any channel on (the stretch that line falls in may have begun before `voice_showchannels 2` was set, so
it is worked out). With the demand read:
- during a new channel's wait the channel is not pulled, and the tool still writes 512 and 1024 in turn; a pull of the
  channel there stops it;
- the ring ran dry before a step when the pulls read were at least what it held;
- a packet on such a step is a grace if the channel is pulled within its wait's ticks after it (a new channel is not),
  and a new channel if it is not pulled until later than a frame's ticks (a kept one is pulled after its frame's last
  tick). Between the two, the size of that pull tells: 513 or another whole number of blocks plus one is a channel's
  first pull after it starts, a whole number of blocks a kept one's (one sample more on the first pull in 16 of 16
  starts, logged, finding 22; that a pull line prints the 513 is inferred). A pull of any other size there stops the
  tool;
- the queue is not checked against the demand while the channel plays: the replay judges it.

A log that switches back to `voice_showchannels 1` inside a part has its pulls read as none from there on, and the
replay fails: start a new part.

It stops with a message, never a guess, on a log that breaks the rules:
- a packet line with no tick line after it, or whose tick line is in another session;
- a tick line with no channel;
- a queue that moves while a channel waits, or (with the demand worked out) that cannot come from its packets;
- a new channel whose queue is not its packets';
- more than one channel and no `--channel`, a `--channel` with no tick line, or a change of entity with no free tick
  between;
- a pull of the channel while it waits, or a grace that cannot be told from a new channel;
- a line that begins like a voice line but does not read as one: a sign, more than 9 digits, something before or
  after it, or a line cut short. Such a line would otherwise pass as an unrelated line and lose a tick.

A byte-order mark before the first line is ignored. A last line with no line end is read as it stands, and the
summary says so: a log cut off while it was written can end in a shortened number that still reads.

**A line printed late.** A real server's log can print an `incoming` line after the tick line that already counts it
(Set Q, measured: once in 13,487 tick lines). The tool does not guess at it: the packet is added on the next tick.
With pull lines the replay then reports that one tick line as off, by the packet, and the next tick line is right
again with no packet line between; a fault of the model does not right itself so. Without pull lines the demand is
worked out from the queue: where the queue rose by more than its packets the tool stops on that tick line ("the queue
cannot go from"), and where the pulls hid the rise the late line passes unseen, the pull worked out a little off the
blocks.

**Pull sizes.** A queue line off by a sample while the channel plays only moves a sample of the mixer's demand from
one tick to the next, and the rules cannot tell that from a true one. The mixer takes whole blocks of 512 samples, and
513 or 1025 on its first pull after a channel starts. So the summary counts the pulls read from the log that are not
whole blocks; one more is allowed on the first pull the log shows after a channel's wait. `--strict` refuses the first
such pull, with its line number. Neither changes the fixture. The count is not a refusal by default, because the block
is what the logs show at the owner's settings and might differ under others.

**A known loud failure.** The order's test for an unseen free or a grace accepts a queue of up to 4096 bytes before
the ring is found empty, but the pull it writes for that step is 1024 samples, which empties only 2048 bytes. On a log
where the queue held 2050 to 4096 bytes there, the tool's fixture does not replay: the replay reports mismatching
ticks rather than passing in silence.

**Only numbers leave the log.** The tool keeps the numbers of the voice lines and counts every other line without
keeping it, and its messages quote no line (they give line numbers, channel numbers and counts). So a fixture holds no names, paths or IDs. The replay prints nothing of a
file it is given that is not JSON. To join fixtures into one file:

```sh
node -e 'const fs = require("fs"), f = process.argv.slice(1).map((p) => JSON.parse(fs.readFileSync(p, "utf8")));
  console.log(JSON.stringify({ about: f[0].about, sections: f.flatMap((x) => x.sections) }))' fixture.json mark67.json > all.json
```

## Replaying it

```sh
node tests/voice-channel.verify.mjs --fixture all.json
```

runs the public checks, then replays every section through `createChannel` as the engine and once under each of six
faults (the ring a sample longer or shorter, the wait a tick longer or shorter, the packet's first sample kept, no
grace before a free), and prints the mismatching ticks per section with the first mismatch of the engine row. It exits
non-zero if the engine mismatches anywhere, or if a fault mismatches nowhere in the file (then the log cannot tell
that fault from the engine and proves less than it seems). A section without `bufferMs` is replayed at 100, one
without a name is named by its place. `pnpm test` runs the same checks on logs the test writes itself: one speaker at
300 and 66.67 frames a second, and a server's two channels at 300 (with and without pull lines) and at 30 (with them);
`node tests/voice-channel.verify.mjs --server-logs` runs the server logs' checks alone.

**The check `queue`.** `node tests/reproduce.mjs queue <log> --fps <frames a second> --section <marker>`
([docs/REPRODUCE.md, "queue"](../../docs/REPRODUCE.md#queue)) runs this tool and the same replay on one part of a log,
and prints figures only: the ticks on which the rule gives the logged queue, expected all; the tick lines from
each channel's packet to the first fall of its queue, which must lie just after the wait, so that a frame rate given
too low is caught; and each fault's mismatching ticks as information, since a log shows a fault only where the thing
happened. The replay and the
synthetic log's writer live in `replay.mjs` and `synthetic-log.mjs` here, which the suite `voice-channel` and the check
both load.

To compare a section, event for event, with a section of another fixture:

```sh
node -e 'const fs = require("fs"), [a, b, name] = process.argv.slice(1);
  const x = JSON.parse(fs.readFileSync(a, "utf8")).sections[0].events;
  const y = JSON.parse(fs.readFileSync(b, "utf8")).sections.find((s) => s.name === name).events;
  let i = 0; while (i < x.length && x[i] === y[i]) i++;
  console.log(i === x.length && i === y.length ? "identical" : `first difference at event pair ${i >> 1} (index ${i})`)' mark67.json other.json MARK67
```

## Keep real logs private

A console log holds player names, server addresses and whatever else the console printed. Logs, and fixtures made
from real logs, stay out of this repository (CLAUDE.md, "Hard rules"); keep them in a folder outside it. The public
test writes synthetic logs from the module's own channel and deletes them when it is done: `synthesize` in
`synthetic-log.mjs` writes one speaker's log under a drawn mixer, and `synthesizeServer` a server's, several speakers
on several channels under the frame clock's own mixer (W3-23a; a frame's packets, then its ticks, then its blocks).

**What did not move (W3-25).** `record-hook.mjs` records every call of the tool while the suites run (the hash of the
log's text, the options, and the fixture's hash with the summary's counts, or the message it stopped with), and
`compare-records.mjs` compares two records. `calls-main.jsonl` is the record made on main before W3-25 changed the
tool; `docs/reports/W3-25-server-logs.md` gives the commands and the comparison.

## The second models

The suites compare the modules with models written again from the orders' words, which share no code with them:

- `reference-channel.mjs`: the channel (W3-02a), with plain arrays; `tests/voice-channel.verify.mjs` drives it.
- `reference-arrivals.mjs`: BC-4's arrival times through `net_fakelag`'s lists, and at jitter 0 under 1000/15 frames a
  second the closed form of W3-23a; `tests/render-channel.verify.mjs` holds `steamArrivals` to it tick for tick.
- `reference-frames.mjs`: the frame clock of W3-23a, a timeline under 1000/15 frames a second that takes the messages
  whose tick has come, runs the ticks due and runs the blocks due, once a frame; both suites hold `createTimeline`
  and the renders on the game's voice queue to it. It shares with the module only the definition of a frame's time,
  `(88200 k) / fps` half samples. With `playOut` (W3-24, written again from `docs/work-orders/W3-24-render-end.md`,
  "The rule") the clock runs on past the length until the channel holds nothing and the mixer's kept sample is not one
  of a sound message, and the output runs on to one past the last place of the source heard; with `even` it runs the
  clock of even ticks and blocks (1000/15 frames a second and above) instead, so that the play-out's record has a
  second model at every frame rate. Neither shares a line with `createTimeline`'s play-out.
