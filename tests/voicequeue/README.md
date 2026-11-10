# The game's voice queue, from its console log

TF2 can print its receiver's voice queue as it runs: every packet a speaker's channel receives and, on every 15 ms
client tick, how much sound the channel holds. [`voice-channel.js`](../../voice-channel.js) is that queue as read from
the game's engine (`docs/reports/W3-03-engine-binary.md`). The tools here turn such a log into numbers and replay
them through the module, tick by tick, so the model can be checked against the game.

## Making a log

In the game, with the Steam codec on a local server where you hear yourself, type in the console:

```
con_logfile voice_q.log
voice_loopback 1
voice_showincoming 1
voice_showchannels 1
```

Then talk, or play a file through the microphone. Two kinds of line come out:

- `Voice - N incoming samples added to channel C`: a packet, N being the samples Steam's decoder returned for it at
  44.1 kHz (the queue gets N - 1 of them);
- `Voice - chan C, ent E, bufsize: B`: once per channel in use per tick, B being the queued sound in bytes (two per
  sample; at most 44100, half a second). A free channel prints nothing. The lines carry no time: each tick line is
  15 ms.

Note the frame rate the game ran at (`fps_max`, and the counter of `cl_showfps 1` or `net_graph 1`): the wait before
a new channel plays is counted in frames, so the replay needs it. Use `voice_showchannels 1`, not 2 (2 adds a line
per pull of the mixer, which the tool refuses). Keep to one speaker.

To put several runs in one log, type `echo MARK67` (any word that starts with `MARK`) before each; the tool reads one
marked part at a time.

## Making a fixture

```sh
node tests/voicequeue/log-to-fixture.mjs voice_q.log --fps 300 > fixture.json
node tests/voicequeue/log-to-fixture.mjs voice_q.log --fps 66.67 --section MARK67 > mark67.json
```

`--fps` is the frame rate the run had; `--buffer-ms` is `voice_buffer_ms` if it was not 100; `--name` names the
section (by default the marker, else `log`); `--section <marker>` reads only the lines after the first line that
starts with the marker, up to the next line that starts with `MARK`. It prints a fixture with one section,
`{ about, sections: [{ name, fps, bufferMs, events }] }`, and a one-line summary on stderr. `events` is a flat list of
pairs:

| Pair | Means |
| --- | --- |
| `0, 0` | a new session: a fresh channel |
| `1, N` | a packet of N decoded samples |
| `2, n` | the mixer wanting n samples before the next tick |
| `3, B` | a client tick after which the channel holds B bytes; `3, -1`: after which it is free |

The log has the packets and the queue but not the mixer's pulls, so the tool works them out from the queue: what left
it between two ticks, less what the packet brought. Where the log cannot show the pull, the tool writes what makes a
wrong model fail: while a new channel waits, 512 and 1024 in turn (a model that plays early drains them); where a
packet overflowed the ring, 0, 512 or 1024 by how far it went over. It also tells a packet that came on the tick after
the ring ran dry (the channel was kept: the grace) from one that came after the channel was freed on a tick that
printed nothing (a new channel, which waits). The rules in full are W3-02a's spec 5 in
`docs/work-orders/W3-02-receiver-queue.md`.

It stops with a message, never a guess, on a log that breaks them: two packets before a tick line, a packet line with
no tick line, a tick line with no channel, a queue that moves while a channel waits or cannot come from its packets,
a new channel whose queue is not its packet, a second channel while one is in use, pull lines. A queue line that is
off by a sample while the channel plays only moves a sample of the mixer's demand from one tick to the next, which no
log can tell from a true one.

**Only numbers leave the log.** The tool keeps the numbers of the two voice lines and counts every other line without
keeping it, and its messages quote no line. So a fixture holds no names, paths or IDs. To join fixtures into one file:

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
that fault from the engine and proves less than it seems). `pnpm test` runs the same checks on a log the test writes
itself.

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
test writes a synthetic log from the module's own channel and deletes it when it is done.
