# W3-02: the receiver's voice channel, as the engine runs it

*Revised 2026-11-10 after the plan's review by a builder (the findings and what was done about each are in
`docs/reports/W3-02-plan.md`, "The review").* Seven orders, each leaving main working:

| Order | What | Starts after | Budget |
| --- | --- | --- | --- |
| **W3-02a** | the channel as a pure module, and the log replay | now (new files only) | 1 day |
| **W3-02b** | the sender model and the timeline stage; `retiming.mjs --engine` | W3-02a | 1 day |
| **W3-02c** | the render and the stream run it behind an option | W2-02, W3-05, W3-06, W3-02b | 1 day |
| **W3-02d** | the page: controls, the default, the words | W3-02c | 1 day |
| **W3-02e** | the page: the codec lane's marks and the real-take check | W3-02d | half a day |
| **W3-02f** | the flat rule retired | W3-02d | 2 hours |
| **W3-02g** | a demo's own packets | W3-02c, W3-06, W3-02f | half a day |

W3-02a and W3-02b touch no file another order touches (one line of `package.json` aside), so they run beside
anything. W3-02c, W3-02f, W3-02g, W3-05 and W3-06 all change `audio.js` and run one at a time. W3-02d and W3-02e
change the page and run one after the other; either may run beside W3-02g or another `audio.js` order, except
that W3-02f waits for W3-02d to merge.

**Agents:** `tf-builder`, then `tf-reviewer`; W3-02c's diff also gets a second reader on the stronger model (it
changes how a render is computed). Each may push its branch to run CI. Worktrees are given in the briefs.

**Private data.** The owner's logs, takes and the fixture built from the logs are private and are not in this
repository (decided 2026-11-10). A builder has the repository only. So every order lists two kinds of check:
**the builder runs** (public, in the suites) and **the orchestrator runs privately** (a command and its expected
output; the builder writes the command's code and proves it on synthetic data).

## Why

Since W3-03 the receiver is no longer a fitted rule. A speaker's voice goes into a 0.5 s ring; a new channel waits
`voice_buffer_ms` counted down by one frame's duration per 15 ms tick, so the wait follows the listener's frame
rate; a spurt that arrives before the ring is found empty is appended; overflow drops the oldest sound; one sample
is dropped from every packet; the last `voice_fadeouttime` of the queue is faded. The owner's console logs (Set G:
six sections at 67, 100 and 300 frames a second, 2,375 packets, 9,808 ticks) agree with that rule on every tick
(the plan's report, "The replay"). The app has none of it: a render keeps the source's timeline, and `voice_retime`
moves spurts by a flat 41% rule that the takes refute.

**The two log lines** (W3-03's report, "For the recording session", has what prints them): `voice_showincoming 1`
prints `Voice - N incoming samples added to channel C` for each packet, N being the samples the decoder returned;
`voice_showchannels 1` prints `Voice - chan C, ent E, bufsize: B` for each channel in use on each client tick, B
being the queue in bytes (two per sample). A free channel prints nothing. Lines carry no time.

## The model (all orders)

Everything below is for the Steam profiles (`steam`, `steam_48`: voice rate 44100 Hz, the mixer's rate). The engine
codecs keep the source's timeline until a queue log under `vaudio_celt` exists (their sender is the engine's own
recorder, and their ring is 1 s or 2 s).

**Time** is counted in half samples at 44.1 kHz (1/88200 s), so nothing rounds: a client tick (15 ms) is 1323, a
mixer block (512 samples) is 1024.

**Constants** (`VOICE_CHANNEL` in the new module; each with its source in a comment):

| Name | Value | Source |
| --- | --- | --- |
| `ring` | 22050 samples (44100 bytes) | W3-03 §1, read; every log |
| `tick` | 0.015 s | W3-03 §1, read; the logs' 15.04 ms a line |
| `bufferMs` | 100, limited to 1..5000 | `voice_buffer_ms`, read |
| `fps` | 300, limited to 10..1000 | `fps_max`'s default; the frame's duration is limited to 0.001..0.1 s (read) |
| `fadeTime` | 0.1 s: `fade = max(2, floor(rate x fadeTime))` = 4410 | `voice_fadeouttime`, read |
| `mixBlock` | 512 samples; the first block after a channel starts asks for 513 | the logs (see "The first pull") |
| `sender` | see "The sender's packets" | the logs and the Set D demo |

**`waitTicks(bufferMs, fps) = ceil(clamp(bufferMs, 1, 5000) / 1000 x clamp(fps, 10, 1000) - 1e-6)`**: 7 at 66.67,
10 at 100, 30 at 300. The packet's own tick is the first. (The logs: 7, 10 and 30 lines before the queue can fall,
in every one of 34 channels; 9 of the 28 channels at 300 show the first fall one or two lines later, which is a
tick with no mixer block or a slower countdown, and cannot be told apart.)

**The channel** (one speaker):

```
add(pcm):                                   # a packet, processed in a tick before the tick's pass
    if not inUse:  inUse = true; ring.clear(); left = waitTicks; playing = false; gain.reset(); opens += 1
    pcm = gain.process(pcm)                 # in place, in arrival order; blocks of 128 run on across packets
    ring.write(pcm[1:])                     # one sample fewer; an empty packet writes nothing
    if ring.count > ring.size: drop the oldest (count - size) samples    # heard as a skip
    starved = false
tick():                                     # after the tick's packets
    if not inUse: return
    if starved: inUse = false; playing = false; return
    if not playing: left -= 1; if left <= 0: playing = true
pull(n):                                    # the mixer wants n samples; returns exactly n
    if not (inUse and playing): return n zeros
    got = ring.read(min(n, ring.count)); after = ring.count
    if after < fade: for i in 0..got-1: r = (got - 1 - i) + after; if r < fade - 1: got[i] *= r / (fade - 1)
    if got < n: append the last min(got, n - got) samples of got once more, then zeros up to n
    if ring.count == 0: starved = true
```

`pull(n)` takes exactly `n` from the ring, whatever `n` is and whether or not it is the channel's first: the
channel has no notion of a first pull. (The fade scales only the tail of a read, the samples with fewer than
`fade - 1` behind them: W3-03's "the tail of got".)

**The first pull.** In the logs the first fall of a channel's queue is 513 samples (or 1025, two blocks) in every
start that can be read, 16 in the first run; every later one is 512 or 1024. So the game's mixer takes one sample
more at a start. What it does with it was not read. That belongs to the mixer, not to the channel: **in a render
the clock asks for 513 on the first block after a start and plays the last 512** (the extra sample, the first of
the queue, is not heard). In a replay of a log the demand is whatever the log shows, 513 included, and `pull` is
given it as it is.

**The clock** that drives the channel in a render: tick `k` is at time `1323 k`, mixer block `b` at `1024 b`.
Events run in time order; a block that starts before a tick runs before it, one that starts on it runs after it.
A packet with arrival tick `k` is added on tick `k`, before the tick's pass. Block `b` is output samples
`512 b - D` to `512 b - D + 511` of the 44.1 kHz voice signal, where `D = round(44100 x latency)` and
`latency(bufferMs, fps) = min(0.5, (waitTicks - 1) x 0.015 + 0.16)`: the delay at which a restarted spurt plays
(0.25 s at 67 fps, 0.295 s at 100, 0.5 s at 235 and above), taken out so that a restarted spurt sits where the
source has it. Output before sample 0 or past the render's length is dropped.

**Exact, and approximated.**

| Part | In the model | Why |
| --- | --- | --- |
| Ring size, overflow dropping the oldest | exact | read; every logged add |
| One sample dropped per packet | exact in count; the kept samples are the packet's samples 1..n-1 | the engine blends each with 0.001 of its neighbour (an interpolator at fraction 0.999): under the 16-bit step |
| The countdown | exact for a steady frame rate | the game's frame times vary and a hitch shortens the wait; the input is one number |
| Append, with the one-tick grace; freed when found empty | exact | read; one grace case and 34 opens in the logs |
| The fade | the law as read; the product is not rounded to 16 bits | the render carries floats; no log can show it |
| Underrun padding | the law as read | not seen in a log (it changes samples, not counts) |
| The gain, and its reset when a channel is assigned | exact | W3-05; verified sample for sample on Set H |
| The extra sample at a start | counted; dropped unheard | its use was not read |
| When the mixer pulls | approximated: a block every 512 samples | in the game the pulls follow the frames (a tick sees 0, 1 or 2 blocks, 7% see none); it matters by at most a block (11.6 ms) at a full or a nearly empty ring |
| Ticks | approximated below 67 fps: evenly spaced | there several ticks run in one frame |
| Five channels, other speakers | not modelled | one speaker |

## The sender's packets

A source file has no packets, so the render makes them up from the codec's frame log (which frames the gate sent).
What is known, from the first Set G log (1,520 packets) and the Set D demo (1,816 messages):

- **Deterministic:** a packet holds whole 20 ms frames in order (882 samples each at 44.1 kHz); a spurt's sound
  arrives in real time after its first packet; the end of a spurt is followed by one more packet, the silence
  record; at most one packet is added per tick.
- **Drawn (seeded):** how many frames open a spurt (8 in 17 of 23 openings after a pause, 6 in 4, 7 and 9 once
  each); which frames each later packet holds (3 frames in 65%, 2 in 14%, 4 in 11%, 1 in 10%) and its tick (3, 4
  or 5 ticks after the one before: 41%, 49%, 10%); the silence record's length (62.5 ms in 39 of 47, 31.25 ms in
  8).
- **Unknown:** what in Steam decides the pieces (W3-09 is reading Steam's side); Steam's own hold (425 to 485 ms)
  and pre-roll (115 to 152 ms), which the gate model fixes at 440 and 120; why the takes' silences on speech run
  about 50 ms longer than the gate model's (W3-01). These decide which pauses near 0.4 s close, so a render will
  not match a given take pause for pause.

**The sender model** (`VOICE_CHANNEL.sender = { open: [[8, 0.77], [6, 0.92], [7, 0.96], [9, 1]], period: 0.056,
captureJitter: 0.010, slip: 0.1, networkJitter: 0.020, record: [[0.0625, 0.85], [0.03125, 1]] }`). `F` is the
frame's duration (0.02 s); frame `j` ends at `(j + 1) F`. All times are doubles in seconds, computed as written
(a hand-out's time is `h0 + 0.056 * i`, not a running sum). `lastTick` starts at -1 and carries across spurts.
For each talk spurt, frames `s..e`:

1. Draw `u1`: the opening holds `k0 = 8` frames if `u1 < 0.77`, 6 if `< 0.92`, 7 if `< 0.96`, else 9; never more
   than the spurt has. Draw `u2`. `h0 = (s + k0) * F`. The opening's tick is
   `max(lastTick + 1, ceil((h0 + 0.020 * u2) / 0.015))`.
2. For `i = 1, 2, ...` while a frame of the spurt is unsent: `h = h0 + 0.056 * i`; draw `u3, u4, u5` (always all
   three); `limit = h - 0.010 * u3 - (u4 < 0.1 ? F : 0)`; the packet holds the unsent frames `j <= e` with
   `j + 1 <= floor(limit / F + 1e-9)`; if there are none, no packet; else its tick is
   `max(lastTick + 1, ceil((h + 0.020 * u5) / 0.015))`.
3. Then, with the next `i`: `h = h0 + 0.056 * i`; draw `u6, u7`; the silence record's tick is
   `max(lastTick + 1, ceil((h + 0.020 * u6) / 0.015))` and it is `round(0.0625 x 44100) = 2756` zeros if
   `u7 < 0.85`, else `round(0.03125 x 44100) = 1378`.
4. A frame the loss model lost or made late (frame codes 5 and 6) is sent like any frame in steps 1 to 3, and its
   samples (the concealment, or zeros) are what the packet holds, as Steam's decoder hands concealment out with
   the packet that reveals the gap. (Not measured under loss; said in the report.)

The random source is `mulberry32((seed ^ 0x51ED270B) >>> 0)` (`mulberry32` as in `audio.js`), drawn in exactly
that order, so a seed gives one schedule and the loss pattern (drawn from `seed` itself) does not move.

**A reference schedule**, from the plan's prototype: seed `0xC0FFEE`, two spurts, frames 50..109 and 125..139.
Packets as `[tick, first frame, last frame]`, a record as `[tick, -1, samples]`:

```
[76,50,55] [80,56,57] [84,58,59] [86,60,63] [91,64,64] [95,65,68] [98,69,70] [102,71,74] [106,75,76]
[110,77,79] [113,80,82] [117,83,85] [121,86,88] [124,89,91] [128,92,94] [132,95,96] [136,97,99] [139,100,102]
[143,103,105] [146,106,107] [150,108,109] [154,-1,1378] [179,125,132] [182,133,134] [186,135,137]
[189,138,139] [193,-1,1378]
```

**Its statistics**, from the prototype over seeds 1 to 2,000, one spurt of frames 50..199 each: later packets hold
1, 2, 3, 4 frames in 0.024, 0.261, 0.632, 0.082 of cases; they come 2, 3, 4, 5 ticks after the one before in
0.020, 0.341, 0.524, 0.115; the opening is 8, 6, 7, 9 frames in 0.755, 0.153, 0.043, 0.049; the record is 2756 in
0.847. Over a long spurt it makes 17.85 packets a second. The model was fitted to the log's table of ticks and
frames and is 28 percentage points from it, summed over the table (too few one-frame packets). It is the part of
the render that is a model and not a reading. No empty packet is made: that is a key press, and a file has none.

## W3-02a: the channel as a module, and the log replay

**Branch:** `claude/w3-02a-voice-channel`, from `main`. **Time budget:** 1 day.

### Files

May add: `voice-channel.js`, `tests/voice-channel.verify.mjs`, `tests/voicequeue/log-to-fixture.mjs`,
`tests/voicequeue/README.md`. May touch: `package.json` (the `test` script; merge main in before the last push).
May not touch anything else. Nothing from a private log or fixture is committed.

### Spec

1. **`voice-channel.js`**, in the form of `demo.js` (an IIFE that sets `module.exports` under Node and
   `root.TF2VoiceChannel` elsewhere; no imports). This order exports `VOICE_CHANNEL`, `waitTicks`, `latency` and
   `createChannel`.
2. **`createChannel({ fps, bufferMs, fadeTime, gain, test })`** is the pseudo-code above, with samples:
   `add(pcm, tag)` takes a `Float32Array` (and an optional number kept with its samples); `tick()`; `pull(n)`
   returns `{ samples, tags }` (`tags`: for each sample the tag of the packet it came from, -1 for padding and
   silence); read-only `inUse`, `playing`, `starved`, `count`, `opens`, `waitTicks`, `dropped` (samples lost to
   overflow) and `drops` (a list of `{ pulled: samples pulled so far, count, tag }`). `gain` is
   `{ process(pcm) -> pcm, reset() }`; without one, samples pass unchanged. The ring is a preallocated
   `Float32Array` with a parallel tag store; no array grows with the audio.
3. **`test`**, for proving the replay can fail and for nothing else (the page never passes it):
   `{ ring: samples, waitTicks: number, keepSample: true, noGrace: true }`. `ring` and `waitTicks` replace the
   constants; `keepSample` writes the whole packet; `noGrace` frees the channel inside the `pull` that empties
   the ring.
4. **The fixture format.** A JSON file `{ about, sections: [{ name, fps, bufferMs, events }] }`, `events` a flat
   list of pairs `kind, value`: `0, 0` a new session (a fresh channel); `1, N` a packet of N decoded samples;
   `2, n` the mixer wanting n samples before the next tick; `3, B` a client tick after which the channel holds B
   bytes, or `3, -1` a tick after which the channel is free.
5. **`tests/voicequeue/log-to-fixture.mjs <console log> --fps <frames a second> [--name <name>] [--section
   <marker>] [--buffer-ms 100]`** prints one section. With `--section`, only the lines after the first line that
   starts with the marker, up to the next line that starts with `MARK`, are read. It keeps only the two kinds of
   `Voice -` line and counts, so no name, path or identifier can pass through it. Its rules:
   - Lines that are neither kind are "other". Two or more other lines in a row, followed by a voice line, are a
     new session (`0, 0`); a single one is ignored.
   - A packet line is followed by a tick line before the next packet line (the engine adds at most one packet a
     tick); if not, stop with a message.
   - Each tick line is a step: the packet before it, if any, and its bytes `B`. `w = 2 x max(0, N - 1)` for the
     step's packet, 0 without one. `wait = waitTicks(bufferMs, fps)`.
   - **A step opens a channel** when it has a packet and no channel is alive; or when the channel is playing, the
     previous `B` was at most 4096, this `B` equals `min(44100, w)`, and in none of the next three steps does `B`
     fall below `min(44100, previous B + that step's w)` (the queue ran out, the channel was freed on a tick that
     printed nothing, and this packet starts a wait). For the second case emit `2, 1024` and `3, -1` first. Then
     emit `1, N` and `3, B`; `B` must equal `min(44100, w)`, else stop.
   - **The same test with a fall in the next three steps is a grace**: the channel was kept. Emit `2, 1024`,
     `1, N`, `3, B`.
   - **While a channel waits** (its first `wait` tick lines, the opening one included) the mixer's demand is not
     in the log: emit `2, 512` and `2, 1024` in turn (one counter for the whole section, starting with 512) before
     each step after the opening one, so that a model that plays early fails; the step's `B` must equal
     `min(44100, previous B + w)`, else stop ("the queue moved during the wait").
   - **After that**, the demand before a step is `(previous B + w - B) / 2` samples; if `B` is 44100 and the step
     has a packet (an overflow hides the demand), it is 1024 if `previous B + w - 44100 >= 2048`, 512 if
     `>= 1024`, else 0. A negative or odd difference stops the tool.
   - A channel is no longer alive after the last step before a new session or the end of the input.

   It stops with a message, not a guess, when a line breaks these rules. `tests/voicequeue/README.md` says how to
   make a log (the console commands of W3-03's report) and a fixture, and that fixtures made from real logs stay
   private.
6. **`tests/voice-channel.verify.mjs [--fixture <file>]`.** Without the argument it runs the public checks below.
   With it, it also replays every section of the file through `createChannel` (events 1: `add` of that many
   zeros; 2: `pull`; 3: `tick`, then `2 x count`, or -1 when not `inUse`, must equal the value) and prints, per
   section, the packets, ticks, opens and mismatches, first as the engine and then once for each of `ring + 1`,
   `ring - 1`, `waitTicks + 1`, `waitTicks - 1`, `keepSample` and `noGrace`. It exits non-zero if the engine row
   has a mismatch in any section, or if one of the six faults gives no mismatch in the whole file.

### The builder runs

`node tests/voice-channel.verify.mjs` passes and is in `pnpm test`. Each check fails when its line of the model is
broken; say how you broke it and what failed.

- **A synthetic log**: the test writes a console log in the game's format from a seeded run of the module's own
  channel at 300 fps under a mixer of its own that takes 0, 512 or 1024 samples between ticks at random and 513
  on the first block after a start (two opens, an append, a grace, an overflow, an empty packet, one unrelated
  console line, a second session after three), puts it through `log-to-fixture.mjs`, and the replay matches every
  tick; each of the six faults of spec 6 gives at least one mismatch on it. A log with one `bufsize` changed by 2
  makes the tool stop or the replay fail. A second synthetic log at 67 fps replays cleanly too.
- `waitTicks`: 7, 10, 30 at 66.67, 100, 300; 15 at 300 with `bufferMs` 50; 1 at 5 fps (frames are capped at
  0.1 s). `latency`: 0.25, 0.295, 0.5.
- **By hand, 300 fps** (`add` zeros, `tick`, no pulls until it plays): a packet of 7056 on tick 0, then 2646 on
  ticks 4, 8, ..., 28: `playing` becomes true on tick 29; `count` is 22050 from the packet of tick 24 on; `dropped`
  is `7055 + 7 x 2645 - 22050 = 3520`.
- **By hand, 67 fps:** the same packets: `playing` on tick 6 with `count` 9700, nothing dropped.
- **Fade** (packets written whole with `test.keepSample`, pulls of 512): N = 4410 samples of 1.0: sample `k` of
  the output (from 0) is `min(1, (N - 1 - k) / 4409)`: 1 at `k = 0`, `4408/4409` at `k = 1`, 0 at the last. With
  N = 8820 the first 4411 samples are 1 and sample 4411 is `4408/4409`.
- **Underrun:** 200 samples of 1.0 queued and playing, `pull(512)` returns those 200 (faded: sample `k` is
  `(199 - k) / 4409`), the same 200 values again, then 112 zeros; `starved` is true; a `tick` then frees the
  channel; an `add` before that tick keeps it, with no wait, and the next `pull` reads the new packet.
- **The gain is called as the engine calls it:** with a stub, `reset()` once per open and never on an append;
  `process` once per packet, in order, with the whole packet (before the sample is dropped).
- `pnpm test` passes; CI passes on the pushed branch.

### The orchestrator runs privately

- `node tests/voice-channel.verify.mjs --fixture /home/user/tf2-voice-takes/set-G-debug-probe/voice-queue-fixture.json`.
  Expected, mismatching ticks per section (the plan's prototype):

  | Section (packets, ticks, opens) | engine | ring + 1 | ring - 1 | wait + 1 | wait - 1 | sample kept | no grace |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | `run1` (1520, 6267, 20) | 0 | 4933 | 4933 | 1549 | 708 | 5781 | 181 |
  | `run3-67` (126, 511, 2) | 0 | 0 | 0 | 496 | 498 | 510 | 0 |
  | `run3-100` (141, 598, 4) | 0 | 0 | 0 | 555 | 559 | 595 | 0 |
  | `run3-300` (130, 581, 3) | 0 | 504 | 504 | 13 | 4 | 494 | 0 |
  | `run3-maxgain1` (223, 917, 3) | 0 | 839 | 839 | 63 | 18 | 877 | 0 |
  | `run2` (235, 934, 2) | 0 | 882 | 882 | 0 | 19 | 865 | 0 |

  The engine column must be all zeros. The fault columns should be these numbers; a different non-zero number
  where this table has one is reported, not a failure.
- `node tests/voicequeue/log-to-fixture.mjs <log> --fps <f> [--section <marker>]` on each of the six log
  sections (`voicelog.txt` at 300; `run2/voicelog.txt` at 300; `run3-fps/voicelog2.txt` with `--section MARK67`
  at 66.67, `MARK100` at 100, `MARK300` at 300, `MARKDEC` at 300): each output's `events` equal the private
  fixture's section event for event. If one differs, report the index of the first difference; it is a failure
  only if the tool's own output does not replay cleanly.

### Stop and ask

- If the pseudo-code and the synthetic log disagree about an order of events inside a tick.
- If the orchestrator's private replay has a mismatch in the engine column: do not adjust the model to fit; the
  orchestrator sends the ten events before the first mismatching tick (numbers only).

## W3-02b: the sender model and the timeline stage

**Branch:** `claude/w3-02b-voice-timeline`, from `main` **after W3-02a**. **Time budget:** 1 day.

### Files

May touch: `voice-channel.js`, `tests/voice-channel.verify.mjs`, `tests/retiming.mjs` (a new `--engine` flag
only). May add: `tests/voicequeue/synthetic-results.mjs`. May not touch anything else.

### Spec

1. **`createSender({ frameSeconds, seed })`**: `frame(sent)` is called once per codec frame in order (`sent`: the
   gate sent it) and returns the packets that became known, each `{ tick, first, last }` (frame numbers) or
   `{ tick, silence: samples }`; `finish()` returns the rest (a spurt cut off by the end of the source gets its
   remaining frames by step 2 and its record by step 3, as if it had ended there). It is the sender model above
   and nothing else. A packet is known as soon as its last frame is; a record once the frame after the spurt is
   known to be unsent.
2. **`createTimeline({ fps, bufferMs, fadeTime, seed, gain, length })`** (`frameSamples` 882, `frameSeconds` 0.02)
   joins the sender and the channel on the clock above: `pushFrame(pcm or null, code)` takes a codec frame's 882
   voice-rate samples before the gain (`null` when the gate did not send it) with its frame code, and returns
   the output samples that became final (a `Float32Array`, possibly empty: the output is final up to the last
   block that starts before tick `ceil((j + 1) F / 0.015)`, `j` being the last frame pushed, since no packet not
   yet known can arrive earlier); `finish()` returns `{ samples, info }` with the rest, cut or padded with zeros
   to `length`. The first block after each start asks the channel for 513 and plays the last 512.
   `info` is `{ timeline: 'game', fps, bufferMs, waitTicks, latency, packets, opens, appended, gainResets,
   droppedSamples, drops: [{ time, ms }], spurts: [{ start, end, opened, offsetStartMs, offsetEndMs,
   droppedMs }], played: Uint32Array }`: `start` and `end` are source seconds; an offset is how much later than
   the source a sample came out (negative: early), `offsetStartMs` taken at the first played sample that lies at
   least 0.2 s into the spurt (its first played sample if the spurt is shorter) and `offsetEndMs` at its last
   played sample; `drops[].time` is the output time of the skip; `played[i]` is the number of the codec frame
   heard at the centre of output frame `i` (20 ms slots), or `0xFFFFFFFF` for silence and padding.
3. **`tests/voicequeue/synthetic-results.mjs`** prints a file in the shape `tests/retiming.mjs` reads
   (`{ generated, results: [{ name, set, random: false, gateSpurts: [{ start, end }], timeline: { segments:
   [{ spurt, start, end, delayMs }] } }] }`): one result, `synthetic_speech`, set `S`, of 12 spurts of 2 s
   separated by silences of 300, 900, 160, 140, 1200, 360, 440, 200, 600, 120 and 300 ms, whose one segment per
   spurt has `delayMs = 2000 + offsetStartMs` from `createTimeline` at 300 fps and seed 7 (`pcm` of zeros). It is
   the builder's stand-in for the private accuracy results.
4. **`tests/retiming.mjs --generative --engine [--fps 300]`** adds a third model beside the queue and the rule in
   section 2 (free running): each take's gate-model spurts through `createTimeline` (zeros for sound), seeds 1 to
   `--seeds` (200 by default for this model), scored like the others (a spurt's start is `offsetStartMs`, its end
   `offsetEndMs`). Without `--engine` the output is byte for byte what it is now.

### The builder runs

- `node tests/voice-channel.verify.mjs`, each check failing when its line is broken (say how):
  - **The reference schedule** above, packet for packet, from `createSender` at seed `0xC0FFEE` on frames
    50..109 and 125..139 sent and all others not. Called frame by frame, a packet is never returned before its
    last frame was given.
  - **The statistics** above over seeds 1 to 2,000 (frames 50..199): each share within 0.02 of the figure given.
    Every frame is sent once and in order; no packet's tick is before its last frame ends; no two packets share
    a tick; two seeds differ and one seed repeats.
  - **Timeline** (zeros with tags are enough): spurts of 2 s separated by 300, 500 and 1200 ms (frames 25..124,
    140..239, 265..364, 425..524), seeds 1 to 50. At 300 fps: the first spurt's `offsetStartMs` is between 0 and
    +70; the second is not `opened` and starts 195 to 275 ms early; the third and fourth are `opened` and each
    lost 30 to 150 ms to overflow (`droppedMs`). At 67 fps every spurt is `opened`, each starts within 60 ms of
    the source and nothing is dropped. (The prototype: +13 to +55, -259 to -210, 40 to 136; at 67 fps -32 to +52.)
  - **Collecting does not matter:** two timelines given the same frames, one whose `pushFrame` results are kept
    and joined with `finish()`'s, one whose `pushFrame` results are thrown away after checking their total
    length: the first's samples equal (`===`) the second's `finish()` samples placed after the discarded length,
    and the `info` objects are deep-equal.
  - **The 400 ppm:** one 60 s spurt at 150 fps (the queue stays between 150 and 450 ms there: no fade, no
    overflow): `offsetEndMs - offsetStartMs` is between -25 and -23 ms (one sample for each of 17.85 packets a
    second: 405 ppm, the accuracy suite's "clock"). At 300 fps it is that or lower (the prototype: -44 to -24).
  - **The first pull:** after a start, the first 512 output samples of a restarted spurt at 67 fps are the
    queue's samples 1 to 512, not 0 to 511 (a ramp as sound, no gain).
- `node tests/voicequeue/synthetic-results.mjs > <scratch>/synthetic.json`, then
  `node tests/retiming.mjs --accuracy <scratch>/synthetic.json --generative --engine --seeds 50` prints section 2
  with an engine column in which `synthetic_speech`'s start error is lower than "none"'s; and without `--engine`
  the same command's output is identical on this branch and on main (`diff`).
- `pnpm test` passes; CI passes on the pushed branch.

### The orchestrator runs privately

`node tests/retiming.mjs --accuracy <results.json> --generative --takes /home/user/tf2-voice-takes --engine`.
Expected from the plan's prototype (100 seeds; a spurt's start taken the same way): the speech take 50% of
transitions right and a start error near 96 ms ("none": 11% and 150 ms), the Set C baseline 72% and 95 ms (33%
and 88 ms), the four Set B test-signal takes and sender A worse than leaving them (80 to 114 ms against 29 to 83).
**If the speech take's start error is above 130 ms the orchestrator holds W3-02c** and asks the planner.

## W3-02c: the render and the stream run the channel, behind an option

**Branch:** `claude/w3-02c-timeline-option`, from `main` **after W2-02, W3-05, W3-06 and W3-02b have merged**
(W3-05 leaves the gain as an object with `reset()`; W3-06 and this order both change `audio.js`). **Time
budget:** 1 day.

### Files

May touch: `audio.js` (`process()` and `createRender`: one new stage and the option), `index.html`, `sw.js` (the
new script in `ASSETS`; raise `CACHE`), `audio-worker.js` and `live-worker.js` (`importScripts`),
`tests/verify.js` (how it loads the scripts; a new section 10d), `tests/render-stream.verify.mjs`,
`tests/predictions/PREDICTIONS.md` (the hashed-file note). May not touch: `voice-channel.js`, `constants.js`,
`opus-codec.mjs`, `reference.js`, `app/`, `tests/accuracy.mjs`, `tests/predictions/predictions.json`,
`docs/PROGRESS.json`.

### Spec

1. **The option.** `opts.timeline`: `'source'` (the default, and anything else) or `'game'`; `opts.fps` (300) and
   `opts.bufferMs` (100). With `'source'` nothing in this order runs: every render is bit for bit what main gives.
2. **Where it runs.** With `'game'`, a Steam profile, the codec on and no `opts.received`: after the resampling to
   the voice rate, the voice signal is cut into the codec's frames (frame `f` is samples `882 f - o` to
   `882 f - o + 881` with `o = round(lookahead x 44100 / codecRate)`; samples before 0 are zeros) and each is given
   to `TF2VoiceChannel.createTimeline` with its frame code (`null` samples for a gated frame). Its output replaces
   the auto-gain's (stage 4); the mixer stage and everything after are unchanged. The timeline's `gain` is
   W3-05's gain object for the render's settings (every block it sees is decoded); with `agc: false` it is an
   object that multiplies by `voice_scale` and clips to int16, as stage 4 does now.
3. **What `'game'` leaves alone or refuses.** With an engine codec (`celt_22`, `celt_44`, `speex`), the codec
   bypassed, or `opts.received` (until W3-02g), `'game'` is ignored and `codecInfo.channel` is
   `{ timeline: 'source', reason }`. `retime` with `'game'` is a `RangeError` naming both.
4. **`codecInfo`.** With `'game'`: `codecInfo.channel` is the timeline's `info`; `codecInfo.frameLog` and
   `frameBytes` become what was played (slot `i` takes the code and size of frame `played[i]`, or 0), so the codec
   lane and the real-take check keep lining up with the sound, and the sender's own logs move to
   `codecInfo.sent = { frameLog, frameBytes }`. The counters (`frames`, `gatedFrames`, `dtxFrames`, `lostFrames`,
   `spurts`, `encodedBytes`, `modes`) stay the sender's.
5. **Length.** The render keeps the source's length. What would play after it is cut: at most the restart's
   overshoot (about 60 ms), and only when the source ends inside a talk spurt.
6. **`createRender`** runs the same stage and is equal to `process()` with `'game'` as W2-02's point 2 demands:
   samples `===`, WAV bytes, `codecInfo` deep-equal (`channel`, `sent`, the re-timed logs). It holds back at most
   `latency` plus one packet of output; say the figure in the report.
7. **The live chain** is not changed: it would add the channel's real latency (0.5 s at 300 fps) to a monitor.
   `createLiveChain` ignores `timeline`.

### The builder runs

- `pnpm test` passes. **The golden hashes of `tests/render-stream.verify.mjs` pass unchanged** (they are renders
  without the option): the proof that the default did not move. The suite gains `'game'` cases with equality as
  in point 6: the default Steam render of its speech-like source at 300, 100 and 67 fps; `bufferMs` 50 and 200;
  loss 15% with jitter; `agc` off; `voice_scale` 0.5; chunk sizes 7, 960, 12,345 and the whole source; and their
  `process()` hashes are added to the golden list.
- `tests/verify.js` section 10d, each check failing when its line is broken (say how):
  - **A shift, where nothing else acts.** A 44.1 kHz source (so the mixer and the output resample nothing) of one
    40 s spurt of noise, `agc: false`, `volume: 1`, no room, `fps: 150` (the queue stays between 150 and 450 ms:
    no fade, no overflow). Call the `'source'` render S and the `'game'` render G. For `t` = 10 s and 30 s: there
    is an integer `d(t)` with `G[n + i] === S[n + i + d(t)]` for `i = 0..199`, where `n = 44100 t` or, if no `d`
    fits there (a packet's edge fell in the window: the three-tap output stage smears one sample each side of
    it), `n = 44100 t + 300`. And `d(30) - d(10)` is the number of packets added between them: between 340 and
    375 (one dropped sample each, 17.85 packets a second).
  - **An early start.** Spurts of 2 s with silences of 300 and 900 ms, 300 fps: `codecInfo.channel.spurts[1]` is
    not `opened` and is 195 to 275 ms early, `spurts[2]` is `opened`; in `codecInfo.frameLog` the second spurt's
    codes begin that many frames earlier than in `codecInfo.sent.frameLog` (within one frame).
  - **Overflow at a restart:** at 300 fps `spurts[0].droppedMs` is between 30 and 150 and `channel.drops` is not
    empty; at 67 fps it is 0 and the list is empty.
  - **The gain is reset where the engine resets it:** `channel.gainResets === channel.opens`.
  - The same seed gives the same samples; another seed moves at least one drop; `lossPct` 20 gives the same loss
    pattern (`codecInfo.sent.frameLog`) with and without `'game'`.
  - The ignored cases of point 3, and the `RangeError`.
- The browser suite passes (the new script loads on the page and in both workers; a render still works offline:
  the service worker's list).
- CI passes on the pushed branch.
- The report gives, for the app's demo speech at seeds 1, 2 and 3 and 300 fps: how many spurts opened a channel,
  how many were appended, the largest early start, and the milliseconds dropped per restart; and the render's time
  against `'source'`.

### The orchestrator runs privately

Before and after, under the heavy lock: `flock /tmp/tf2ve-heavy.lock env CHROMIUM_EXECUTABLE=... node
tests/accuracy.mjs --takes /home/user/tf2-voice-takes --only take4_my_own_speech,sender_A,net_baseline --json
<scratch>/after.json`. The accuracy suite does not pass the option, so the three rows must be identical to the
same main's before this branch, to the last digit printed.

### Stop and ask

- If equality between `createRender` and `process()` needs the stage to behave differently in the two.
- If a golden hash moves.

## W3-02d: the page: controls, the default, the words

**Branch:** `claude/w3-02d-timeline-page`, from `main` **after W3-02c**. **Time budget:** 1 day. Decided
(PROGRESS, 2026-11-10): on the page the modern preset renders the game's timeline; a video keeps the source's;
the flat rule is retired (W3-02f removes its code).

### Files

May touch: `index.html`, `app/core.js`, `app/console.js`, `app/render.js`, `app/source.js` (the video case
only), `app/meter.js` (the A/B note only), `batch.js`, `sw.js` (the cache version), `README.md`,
`tests/browser.verify.js`. May not touch: `audio.js`, `voice-channel.js`, `constants.js`, `reference.js`,
`app/visualizer.js`, `app/realtake.js`, `tests/REFERENCE_2026.md`, `docs/PROGRESS.json`.

### Spec

1. **Console variables**, each linked to a control in the advanced panel as the others are (`app/console.js`,
   "Linked cvars"): `fps_max` (a number, 10 to 1000, default 300; help: "The listener's frames a second: TF2
   counts voice_buffer_ms down by one frame per 15 ms tick, so a phrase after a pause waits about fps x 1.5 ms");
   `voice_buffer_ms` (1 to 5000, default 100; the game's own help text, quoted in W3-01's report);
   `voice_timeline` (`game` or `source`; not a TF2 setting, said so in its help and in README as `voice_retime`
   is now). The existing `retime` select becomes the `voice_timeline` control (options "TF2 timing" and "Source
   timing"). They map to `opts.fps`, `opts.bufferMs`, `opts.timeline` in `app/render.js`, which no longer sends
   `retime`, and are saved and restored with the other settings (`CONFIG_FIELDS`; a saved `retime` of `1` reads
   as `game`). `fps_max` in the game is a cap; the control's title says to enter the rate the game runs at.
2. **The default.** `exec preset_modern` and a fresh page set `voice_timeline game`, `fps_max 300`,
   `voice_buffer_ms 100`. The other presets set `source` (their codecs or rooms are unverified, and the engine
   codecs ignore the option). **When a video is loaded as the source the page sets `source`** and says once in
   the console that the picture cannot follow the game's timing (the sound would lead the lips by up to 0.35 s
   after a pause); the user may switch it back, and then the console says how far the sound may lead. The
   engine's own default is untouched.
3. **`voice_retime`** stays as an alias (`1` sets `voice_timeline game`, `0` `source`) with a console line saying
   so.
4. **What the page says after a render with `game`:** one console line from `codecInfo.channel`: channels opened,
   spurts appended and the largest early start, milliseconds dropped at restarts, the frame rate and the wait in
   ticks; or, when the engine ignored the option, the `reason`. The chain strip's Receiver cell says "queue at
   300 fps" in place of "spurts re-timed".
5. **A/B and loudness match.** The A/B switch plays source and render at the same playhead; with `game` the
   render runs up to about 0.35 s ahead after a closed pause. Check in `app/meter.js` how the loudness match
   computes its gains and say it in the report: if from each file's whole-file loudness, it is unaffected and
   nothing changes; if from windows at equal times, stop and ask. Next to the A/B switch, when the render used
   `game`, a short note: "TF2 timing: phrases after short pauses start early; for a sample-aligned A/B set Timing
   to Source". No other change to A/B.
6. **Batch renders** (`batch.js`) take the page's setting like any other.
7. **README:** the receiver paragraph, the settings table (`fps_max`, `voice_buffer_ms`, `voice_timeline`), what
   is and is not a TF2 setting, and the limits: the packets' timing is a model; which pauses near 0.4 s close is
   not predictable; the frame rate is the listener's.

### The builder runs

- The browser suite passes with new checks, each failing when broken (say how): a fresh page and
  `exec preset_modern` give `voice_timeline game`; another preset gives `source` (this replaces the check that a
  preset turns re-timing off); loading a video sets `source` and says why; `voice_retime 1` sets `game`;
  `fps_max 67` changes the render (its `codecInfo.channel.waitTicks` is 7); the three settings survive a save and
  restore; the A/B note shows only with `game`; a render with a CELT preset under `game` prints the reason.
- `pnpm test` passes (nothing in it changes). CI passes on the pushed branch.
- Screenshots (desktop and phone) of the advanced panel, in the report.

There is nothing private to run.

## W3-02e: the page: the codec lane's marks and the real-take check

**Branch:** `claude/w3-02e-timeline-views`, from `main` **after W3-02d**. **Time budget:** half a day.
**Files:** `app/visualizer.js`, `app/realtake.js`, `app/netgraph.js` (only if it reads the frame log), `sw.js`
(the cache version), `tests/browser.verify.js`. Nothing else.

1. **The visualizer** draws the codec lane and the frame hover from `codecInfo.frameLog`, which W3-02c re-times
   to the sound. Mark each entry of `codecInfo.channel.drops` on the lane (a tick mark at its `time`; hover:
   "ring overflow, N ms skipped"). `net_graph` shows the sender's counters; if it reads the frame log, it reads
   `codecInfo.sent.frameLog` when that exists.
2. **The real-take check** (`app/realtake.js`) lines a take up against the source spurt by spurt and is not
   changed by the option. Its wording about "256-sample (5.8 ms) skips" (about lines 140 to 148) is corrected to
   what W3-03 found: one sample per packet and ring overflow, no 256-sample step; the count of steps near 5.8 ms
   is dropped. With `game` it also prints, from `codecInfo.channel.spurts`, the render's own early starts beside
   the take's.

**The builder runs:** the browser suite with new checks, each failing when broken (a render with a 300 ms pause
at 300 fps has at least one drop mark and the lane's frames under the early spurt's sound; with `source` no mark;
the real-take text no longer names 256 samples); `pnpm test`; CI. A screenshot of the lane with a drop marked, in
the report. Nothing private.

## W3-02f: the flat rule retired

**Branch:** `claude/w3-02f-retire-flat-rule`, from `main` **after W3-02d** (the page no longer sends `retime`)
and when no other `audio.js` order is open. **Time budget:** 2 hours. **Files:** `audio.js` (`RETIME`,
`retimeSpurts`, `opts.retime`, `codecInfo.retimed`, the `RangeError` of W3-02c's point 3, `createRender`'s
rejection of `retime`), `tests/verify.js` (section 10c goes; 10d stays, less its `RangeError` check),
`tests/render-stream.verify.mjs` (the `retime` rejection case), `README.md` (any remaining mention),
`tests/predictions/PREDICTIONS.md` (the hashed-file note). `tests/retiming.mjs` keeps its own copy of the rule
for scoring and is not touched.

**The builder runs:** `pnpm test`; the golden hashes unchanged; `grep -n "retime" audio.js` finds nothing; the
browser suite (the alias `voice_retime` still works: it is the page's); CI. W2-04's point 2 (streaming the flat
rule) is then void: say so in the report so the orchestrator notes it in PROGRESS. Nothing private.

## W3-02g: a demo's own packets

**Branch:** `claude/w3-02g-demo-packets`, from `main` **after W3-02c, W3-06 (both change `demo.js`) and
W3-02f**. **Time budget:** half a day.

A demo has the real packets and their ticks, so nothing is made up. **Files:** `demo.js` (`decode` also returns
`packets`), `app/source.js` (passes them in `received`), `voice-channel.js` (`createTimeline` takes packets in
place of a sender), `audio.js` (the `received` path under `'game'`), `tests/demo.verify.mjs`, `tests/verify.js`,
`tests/voice-channel.verify.mjs`, `tests/render-stream.verify.mjs`.

**Spec:** `speakers()` keeps each voice message's index on its packets; for a Steam speaker `decode` returns
`packets: [{ tick, from, to, silence }]`, one per message: the demo tick it was written on, the range of decoded
samples it holds (`from`, `to` in the decoded signal, at the codec's rate; equal when it holds none) and the
silence record's samples at the stream's rate (0 if none; the record is not in the decoded signal). Under
`'game'`, `process()` and `createRender` feed the channel these packets in place of the sender model: arrival tick
`round((tick - first tick) x demo tick length / 0.015)`, messages of one tick in their order (the channel then
gets more than one packet on a tick, which the engine allows), the samples resampled to the voice rate as the
whole signal is and cut at `round(from x 44100 / rate)`, the record as `round(silence x 44100 / rate)` zeros.
`codecInfo.channel.packets` is then `'demo'`. SourceTV writes voice every fourth tick, so arrival is known to
60 ms; that is the path's limit and is said in the console line (W3-02d's line).

**The builder runs:** the synthetic demo of `tests/demo.verify.mjs` (extended with a pause of 300 ms and one of
900 ms between spurts, each spurt ended by an end marker and a 1500-sample silence section) renders under `'game'`
at 300 fps with the first appended and the second restarted; `createRender` equals `process()`; with `'source'`
a demo renders bit for bit as on main (golden hash). `pnpm test`, the browser suite, CI.

**The orchestrator runs privately:** the Set D demo rendered with `timeline: 'game'` at 300 fps (a command the
builder adds to `tests/demovoice/extract.mjs` and names in the report); the report gives each of sender A's 17
observable transitions beside the take's (the plan's prototype, with messages merged per tick, gave the early
starts after spurts 6 and 9 at -298 and -295 ms against -324 and -306 in the take, and missed the two that sit
at the 60 ms resolution).
