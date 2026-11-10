# W3-02: the receiver's voice channel, as the engine runs it

*Revision 3, 2026-11-10.* **What changed and why:** W3-09 read Steam's sender out of the Steam client
(`docs/reports/W3-09-steam-voice.md`). So "The sender's packets" and W3-02b no longer fit a model to the logs (a
56 ms hand-out clock with drawn jitter, a drawn 8-frame opening, a 6-frame pre-roll, a 22-frame hold): they run
Steam's own rule (chunks of whole capture steps, the gate on each chunk's mean and peak, 2400 samples of
pre-roll, a 0.4 s hold on the clock, frames of 480 cut from what was kept plus the chunk, one chunk one
message). Only the clock is still drawn. The sender is a module of its own, `steam-sender.js`, shared with the
offline render (W3-11). W3-02c now starts after W3-11 and W3-13 and takes its packets from them; W3-02g's
decoded packets go through W3-13's resampler. **W3-02a is not changed in any way.** The reasons and the order
of work are in `docs/reports/W3-11-plan.md`.

*Revision 3a, 2026-11-10, after the plan's review (`docs/reports/W3-11-plan.md`, "The review", findings 17 and
22 to 25):* the game's timeline is for the `steam` profile only (`steam_48` is not the game's path and keeps
the source's); the sender takes `gate: false` (every chunk counts as active) so that the gate switch does not
change the receiver's path; the three counting rules behind the statistics table are stated; W3-02c's spec 2
and W3-02g's resampling sentence are rewritten in place; what may run beside what is corrected. W3-02a is
still unchanged.

*Revision 2, 2026-11-10, after the plan's review by a builder (the findings and what was done about each are in
`docs/reports/W3-02-plan.md`, "The review").* Seven orders, each leaving main working:

| Order | What | Starts after | Budget |
| --- | --- | --- | --- |
| **W3-02a** | the channel as a pure module, and the log replay | now (new files only) | 1 day |
| **W3-02b** | the sender (`steam-sender.js`) and the timeline stage; `retiming.mjs --engine` | W3-02a | 1 day |
| **W3-02c** | the render and the stream run it behind an option | W2-02, W3-05, W3-06, W3-02b, W3-13, W3-11a, W3-11b | 1 day |
| **W3-02d** | the page: controls, the default, the words | W3-02c | 1 day |
| **W3-02e** | the page: the codec lane's marks and the real-take check | W3-02d | half a day |
| **W3-02f** | the flat rule retired | W3-02d | 2 hours |
| **W3-02g** | a demo's own packets | W3-02c, W3-06, W3-02f | half a day |

W3-02a and W3-02b touch no file another order touches (the `test` line of `package.json` aside, which W3-13
and W3-12a also touch: a trivial merge), so they run beside anything. W3-02c, W3-02f, W3-02g, W3-05, W3-06,
W3-11a, W3-11b, W3-12b and W3-10 all change `audio.js` and run one at a time (the order is in
`docs/reports/W3-11-plan.md`). **W3-02d runs alone**: it shares page files with W3-11b before it and
`app/source.js` with W3-02g after it. W3-02e may run beside W3-02f or W3-02g (no file in common). W3-02f waits
for W3-02d to merge. W3-10 runs beside nothing (it touches `app/`, `batch.js`, `sw.js` and the tests).

**Agents:** `tf-builder`, then `tf-reviewer`; W3-02c's diff also gets a second reader on the stronger model (it
changes how a render is computed). Each may push its branch to run CI. Worktrees are given in the briefs.

**Private data.** The owner's logs, takes and the fixture built from the logs are private and are not in this
repository (decided 2026-11-10). A builder has the repository only. So every order lists two kinds of check:
**the builder runs** (public, in the suites) and **the orchestrator runs privately** (a command and its expected
output; the builder writes the command's code and proves it on synthetic data). `<takes folder>` is the private
repository's checkout; the brief gives its path.

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

Everything below is for the Steam profiles (`steam`, `steam_48`: voice rate 44100 Hz, the mixer's rate).
*(Revision 3a: the channel is as written for any 44100 Hz voice; the sender, and so a render on the game's
timeline, is for `steam` only. `steam_48` is an experimental 48 kHz profile, not the game's path.)* The engine
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
| the sender | `STEAM_SENDER` in `steam-sender.js`: see "The sender's packets" | W3-09, read; the logs and the Set D demo |

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

*Rewritten in revision 3 from W3-09 (`docs/reports/W3-09-steam-voice.md`, sections 1, 2 and (a)).* A source file
has no packets, so the render makes them as Steam does: it reads the sound in chunks, gates each chunk, and sends
one message per chunk. The rule is read from Steam's client; only the clock that says when Steam's frames fall is
a model. It lives in a new module, `steam-sender.js` (global `TF2SteamSender`), which W3-02b builds and which the
offline render shares (W3-11): there is one gate.

**Constants** (`STEAM_SENDER`, each with its source in a comment):

| Name | Value | Source |
| --- | --- | --- |
| `rate`, `frame` | 24000 Hz, 480 samples | read |
| `grid` | 750 samples (31.25 ms): the capture's step | shown: every packet of the demo and all but 39 of Set G's fit it |
| `preroll` | 2400 samples; 2400 zeros when nothing was kept | read |
| `hold` | 0.4 s of the clock, from the read of the last active chunk | read |
| `meanMin`, `peakMin` | 327.67 (on the mean of \|x\|), 4915 (on the peak) | read |
| `timer` | 0.015625 s | the planner's model (see "The clock") |
| `period` | 0.05585 s | measured: the mean time between chunks |
| `late` | 0.06, up to 0.030 s | fitted to the share of 2250-sample chunks |
| `relay` | 0.002 s | arbitrary: it only sets the phase against the game's ticks |

**Deterministic** (no draw): the gate's verdict for a chunk; the four states; the pre-roll; the hold; the frames;
which frames a message holds; the end marker and the sequence number's restart; the silence record's length.
**Drawn** (seeded): the clock only, which decides how long each chunk is and on which game tick its message
arrives. Every render is reproducible from its seed.

**The clock.** Steam's frames come 55.85 ms apart on average and the capture moves 750 samples at a time (W3-09,
section 2). The model: Windows's timer ticks every 15.625 ms; the capture gains 750 samples on every second tick;
Steam's frame `i` runs on the first tick at or after `phase + i x period`, a few of them late. This is the
planner's model, not a reading: it was chosen because it gives the logs' spacing of packets (3, 4 or 5 game
ticks apart in 36, 50 and 11% against the logged 41, 49 and 10%) and the logged packet sizes with no further
constant (the table below). The random source is `mulberry32((seed ^ 0x51ED270B) >>> 0)` (`mulberry32` as in
`audio.js`), drawn in exactly this order, all arithmetic in doubles as written:

```
phase = 0.03125 * draw()
for i = 0, 1, 2, ...:
    u1 = draw() ; u2 = draw()                              # always both
    late = u1 < 0.06 ? 0.030 * u2 : 0
    n[i] = max(n[i-1] + 1, ceil((phase + i * 0.05585 + late) / 0.015625))       # n[-1] = 0
```

Frame `i` runs at clock time `now = n[i] x 0.015625` s. By then the capture holds `750 x floor(n[i] / 2)`
samples. The frame's **chunk** is the samples from the last frame's count to this one's (0, 750, 1500 or 2250
of them); samples past the end of the source are zeros. A message made by frame `i` reaches the receiver on
game tick `max(lastTick + 1, ceil((now + 0.002) / 0.015))` (`lastTick` starts at -1 and carries across spurts:
the engine adds at most one packet a tick).

**The gate, the states and the frames** (W3-09 (a); the samples are 16-bit integers at 24 kHz, after the capture
roll-off):

```
each frame with a chunk that is not empty:
    active = sum(|x|) / n >= 327.67  or  max(|x|) >= 4915
    if state is SILENT or ENDED:
        if active:
            if state is SILENT:
                if past is empty: past = 2400 zeros
                chunk = past + chunk ; past = empty
            kept = empty ; state = ACTIVE ; last = now ; send(encode(chunk, final = false))
        else:
            past = the last 2400 samples of (past + chunk)
            if state is ENDED: send(silence record, the chunk's length)
            state = SILENT
    else:                                              # ACTIVE or HANGING
        if active: state = ACTIVE ; last = now
        else:      state = HANGING
        final = state is HANGING and now > last + 0.4
        send(encode(chunk, final))
        if final: state = ENDED

encode(pcm, final):
    buf = kept + pcm
    if final: pad buf with zeros to a whole number of frames
    the message holds every whole 480-sample frame of buf, numbered from 0 within the spurt
    kept = what is left of buf (empty after a final)
    a message with no frame and no end marker is not sent
    if final: the message carries the end marker; the codec is reset; the next spurt numbers from 0
```

A frame whose chunk is empty does nothing at all, whatever the state (in Steam an empty read in the hanging
state after the hold would send the end marker alone; it happens in under three frames in a thousand and is
left out). **With the gate off** (`gate: false`) every chunk that is not empty counts as active: the sound is
one spurt from the first chunk (with its 2400 zeros in front), and at the end of the source `finish()` pads
what is kept to a frame and sends it with the end marker, with no hold and no silence record. So the gate
switch changes which chunks are sent and nothing after them: the messages, the decoder and the receiver are
the same path either way.

The state starts SILENT with `past` empty. A spurt's frames therefore sit on a grid of their own: frame `f` of a
spurt is samples `start + 480 f` to `start + 480 f + 479`, where `start` is the onset chunk's first sample less
the pre-roll it was given (2400, or fewer straight after a spurt, or 0 from ENDED; a `start` before sample 0
means zeros). At the end of the source the frames go on, reading zeros, until the state is SILENT again, so a
spurt cut off by the end of the file is ended as Steam would end it.

Not in a file render: the key (so no 0.5 s tail and no empty packet, decision 8), `voice_preprocess`, and the
32-bit float clock's coarse steps on a Steam that has run for days.

**A reference schedule**, from the plan's prototype: seed `0xC0FFEE`; 96,000 samples, all 0 but samples 24000 to
59999 and 72000 to 77999, which are 1000. The clock starts `2, 6, 9, 13, 16, 20, 24, 27, 31, 34, 38, 41, 45, 49,
52, 57, 59, 63, 66, 70, 75, 77, 81, 84`. Messages as `[tick, first frame, last frame]` (frames counted through
the whole render), `e` for the end marker, a record as `[tick, -1, samples at 24 kHz]`:

```
[69,0,7] [74,8,10] [79,11,13] [81,14,14] [85,15,18] [88,19,21] [92,22,24] [95,25,25] [100,26,29] [104,30,32]
[107,33,35] [111,36,38] [114,39,39] [118,40,43] [123,44,46] [126,47,49] [130,50,52] [133,53,54] [137,55,57]
[140,58,60] [144,61,63] [149,64,66] [154,67,69] [156,70,71] [159,72,74] [163,75,77] [167,78,80] [170,81,82]
[175,83,85] [178,86,88] [183,89,91] [185,92,93] [189,94,96] [192,97,99] [196,100,103,e] [201,-1,1500]
[204,104,107] [209,108,112] [211,113,113] [215,114,117] [218,118,118] [223,119,121] [227,122,124] [230,125,128]
[234,129,131] [237,132,132] [241,133,135] [244,136,138] [249,139,143,e] [253,-1,1500]
```

Two spurts: `start` 20850 with 104 frames, and `start` 70500 with 40 (the second opens one chunk after the first
one's silence record, so its pre-roll is that chunk, 1500 samples, and it opens with 4 frames). With a clock
given by hand, `n[i] = 4 (i + 1)` (a frame every 62.5 ms, every chunk 1500 samples), the same signal gives
`[71,0,7] [76,8,10] [80,11,13] [84,14,16] [88,17,19] [92,20,22] [96,23,25] [101,26,29] [105,30,32] ...
[246,136,139,e] [251,-1,1500]`, spurts of 102 and 38 frames starting at 21600 and 70500: the 8-frame opening is
2400 + 1500 samples with 60 kept, and the kept samples grow by 60 a chunk until a fourth frame fits.

**Its statistics**, from the prototype over seeds 1 to 400, each with a signal of 240,000 samples that is 1000
from sample 24000 to 215999 and 0 elsewhere, beside the logs:

| What | The model | Set G and the demo |
| --- | --- | --- |
| Chunks of 750, 1500, 2250 samples (rule 1) | 0.228, 0.755, 0.017 (and 0.001 empty) | 0.235, 0.745, 0.02 |
| Frames in a message after the opening: 1, 2, 3, 4, 5 (rule 2) | 0.080, 0.148, 0.684, 0.076, 0.011 | 0.10, 0.14, 0.65, 0.11 |
| Game ticks between messages: 2, 3, 4, 5, 6 | 0.021, 0.359, 0.500, 0.111, 0.008 | 3, 4, 5 in 0.41, 0.49, 0.10; none under 3 |
| Opening of 8, 6, 9 frames (this signal's onset sits on the grid) | 0.943, 0.037, 0.020 | 8 in 17 of 20 and 17 of 23 |
| The final chunk is the 7th, 8th after the last active one (rule 3) | 0.058, 0.943 | 9 and 9 of 18 |
| Silence record of 750, 1500, 2250 samples | 0.233, 0.750, 0.018 | 750 in 8 of 47, 1500 in 39 |
| Messages a second | 17.88 | 17.8, 18.0 |

**How the table counts** (the review found the first, second and fifth rows reproduce only under these rules):

1. Chunks: take 260 values of each clock; count the chunks of frames 1 to 259, leaving out frame 0's (which
   runs from sample 0). Counting frame 0's as well gives 0.229, 0.752, 0.017 and 0.003 empty.
2. Frames in a message: sound messages after a spurt's first, **not counting the one that carries the end
   marker** (its last frame is padded). Counting it gives 4 frames at 0.081.
3. The final chunk: counted in the clock's frames from the frame that read the last active chunk to the frame
   that read the final one, **a frame that gained no samples included**. Counting only chunks that are not
   empty gives 0.0625 and 0.935, and 0.0025 on the 6th.

The other rows: ticks between one message and the next, the silence record included; the opening is each
run's first message; messages a second is all messages but the last two over the ticks from the first to the
last sound message.

**Where the model is known to be off.** A steady 55.85 ms clock puts the 7th chunk at 391 ms, under the hold, so
the model ends a spurt on the 8th chunk nearly always; the demo has the 7th as often as the 8th. The model's
spurts therefore end about 28 ms later than Steam's on average. Two in a hundred messages come 2 ticks after the
one before, which the logs never show. Both say the real clock is less regular than this one; W3-09 lists the
run that would measure it (`@voice_spew_activity_check 1`). The constants above are named so that a measured
clock replaces them without a change to the rule.

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

- `node tests/voice-channel.verify.mjs --fixture <takes folder>/set-G-debug-probe/voice-queue-fixture.json`.
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

## W3-02b: the sender and the timeline stage

*Rewritten in revision 3.* **Branch:** `claude/w3-02b-voice-timeline`, from `main` **after W3-02a**. **Time
budget:** 1 day.

### Files

May add: `steam-sender.js`, `tests/steam-sender.verify.mjs`, `tests/voicequeue/synthetic-results.mjs`. May touch:
`voice-channel.js` (`createTimeline` only), `tests/voice-channel.verify.mjs`, `tests/retiming.mjs` (a new
`--engine` flag only), `package.json` (the `test` script). May not touch anything else: no page, worker or
service-worker file loads `steam-sender.js` yet (W3-11 does that).

### Spec

1. **`steam-sender.js`**, in the form of `demo.js` (an IIFE that sets `module.exports` under Node and
   `root.TF2SteamSender` elsewhere; no imports). It exports `STEAM_SENDER`, `createClock` and `createSender`. It
   is "The sender's packets" above and nothing else.
2. **`createClock({ seed })`** returns `{ next() }`, each call giving the next `n[i]`. **`createSender({ seed,
   clock, gate, meanMin })`**: `clock` is optional and replaces the seeded one (an object with `next()`; the
   tests pass fixed lists); `gate: false` is the gate off, as above (the default is on); `meanMin` replaces
   327.67 (the page's threshold control, W3-11b; the peak rule does not move). `push(samples)` takes an `Int16Array` of 24 kHz sound (any length, any number of calls) and returns the
   messages that became known, in order; `finish()` returns the rest (frames go on over zeros until the state is
   SILENT). A message is `{ tick, spurt, first, last, start, end: true or false }` (`first`, `last`: frame
   numbers through the whole render; `start`: the source sample index of frame `first`'s first sample, which may
   be negative; a message with only an end marker has `last = first - 1`) or `{ tick, silence: samples }`.
   `info()` returns `{ spurts: [{ start, frames, preroll }], chunks, messages }`. It keeps at most 2400 + 2250 +
   479 samples of sound; no array grows with the audio.
3. **`createTimeline({ fps, bufferMs, fadeTime, gain, length })`** in `voice-channel.js` joins the channel and
   the clock of "The model": `push({ tick, pcm, source })` takes one message as the receiver gets it: its game
   tick, its decoded samples at 44.1 kHz as a `Float32Array` (whatever length the decoder's resampler gave;
   empty for an end marker alone; zeros for a silence record) and `source`, the 44.1 kHz source position of
   `pcm[0]` (-1 for a silence record). It returns the output samples that became final (final up to the last
   block that starts before the tick of the latest message; `advance(tick)` says that no message will come
   before `tick` and returns likewise); `finish()` returns `{ samples, info }` with the rest, cut or padded with
   zeros to `length`. The first block after each start asks the channel for 513 and plays the last 512. `info`
   is rev 2's: `{ timeline: 'game', fps, bufferMs, waitTicks, latency, packets, opens, appended, gainResets,
   droppedSamples, drops: [{ time, ms }], spurts: [{ start, end, opened, offsetStartMs, offsetEndMs,
   droppedMs }], source: Int32Array }`. A spurt here is a run of messages up to a silence record; `start` and
   `end` are source seconds; an offset is how much later than the source a sample came out, with `latency`
   taken out (negative: early), `offsetStartMs` at the first played sample at least 0.2 s into the spurt (its
   first played sample if it is shorter) and `offsetEndMs` at its last; `source[i]` is the source position
   heard at the centre of output slot `i` (20 ms slots), or -1 for silence and padding. The timeline does not
   call the sender, a codec or a resampler: its caller does, so this order needs neither W3-11 nor W3-13.
4. **`tests/voicequeue/synthetic-results.mjs`** prints a file in the shape `tests/retiming.mjs` reads, as in
   rev 2: one result, `synthetic_speech`, set `S`, of 12 spurts of 2 s separated by silences of 300, 900, 160,
   140, 1200, 360, 440, 200, 600, 120 and 300 ms, whose one segment per spurt has `delayMs = 2000 +
   offsetStartMs` from the sender and `createTimeline` at 300 fps and seed 7 (the sound is 1000 in a spurt and 0
   outside; a message's `pcm` is zeros, 882 a frame, `round(samples x 44100 / 24000)` for a record).
5. **`tests/retiming.mjs --generative --engine [--fps 300]`** adds a third model beside the queue and the rule:
   each take's gate-model spurts become a 24 kHz signal that is 1000 inside a spurt less its pre-roll and hold
   (the loud part: `start + 0.12 s` to `end - 0.44 s`) and 0 elsewhere, put through the sender and the timeline,
   seeds 1 to `--seeds` (200 by default for this model), scored like the others. Without `--engine` the output
   is byte for byte what it is now.

### The builder runs

- `node tests/steam-sender.verify.mjs` (in `pnpm test`), each check failing when its line is broken (say how):
  - **The clock:** seed `0xC0FFEE` starts with the 24 numbers of the reference; two seeds differ; one repeats.
  - **The reference schedule**, message for message, with its two spurts' `start` and frame counts; and the
    hand-clock schedule (`n[i] = 4 (i + 1)`), its first nine messages and last two as given. Pushing the signal
    in pieces of 1, 479, 750 and 10,000 samples gives the same messages, and no message is returned before its
    last sample was pushed.
  - **The statistics** of the table (seeds 1 to 400): each share within 0.005 of the model's column. The
    prototype is this algorithm in doubles, so they should be equal to the digits given.
  - **The gate**, with the hand clock: a chunk of 1500 samples of 327 is not active and one of 328 is; a chunk
    of zeros with one sample of 4915 is active and with 4914 is not; a 440 Hz sine with a peak of -36 dBFS opens
    and one of -40 dBFS does not (finding 5's cases).
  - **The pre-roll:** an onset in the first chunk of the signal gives a `start` of -2400; an onset one chunk
    after a silence record gives a pre-roll of that chunk only; an onset in the ENDED state (the chunk after the
    final one) gives no pre-roll and no silence record.
  - **The hold**, with the hand clock: sound that stops at the end of chunk `c` ends on chunk `c + 7` (7 x 62.5
    ms is over 0.4 s), with the last frame padded; with `n[i] = 3 (i + 1)` (every 46.875 ms) on chunk `c + 9`. A
    burst of sound in chunk `c + 5` keeps the spurt going with no end marker.
  - **The gate off:** on the reference signal with the hand clock every chunk is sent, there is one spurt with
    `start` -2400, no silence record, and `finish()` returns a last message with the end marker whose last
    frame is padded; the spurt's frames times 480 cover the source and at most 479 zeros more.
  - **Every sample once:** over seeds 1 to 50 on seeded noise bursts, the frames of a spurt are contiguous from
    `start`, no source sample inside a spurt is in two frames, and `kept` never reaches 480.
- `node tests/voice-channel.verify.mjs` gains the timeline's checks (messages from the sender on a signal of
  1000 and 0, `pcm` of zeros as in spec 4; seeds 1 to 50):
  - Spurts of 2 s of sound separated by 300, 500 and 1200 ms of silence. At 300 fps the first spurt's
    `offsetStartMs` is between -20 and +90; the second is not `opened` and starts 150 to 300 ms early; the
    third and fourth are `opened` and each lost 30 to 170 ms to overflow. At 67 fps every spurt but the second
    is `opened`, each opened one starts within 80 ms of the source and nothing is dropped. **These ranges are
    rev 2's, widened: the planner did not re-run the timeline's prototype with the new sender.** If the
    sender's reference schedule passes and a range here fails, give the measured range in the report and go on;
    the orchestrator sets the range.
  - **Collecting does not matter**, **the 400 ppm** (one 60 s spurt at 150 fps: `offsetEndMs - offsetStartMs`
    between -26 and -22 ms: one sample for each of 17.88 messages a second) and **the first pull**, as in rev 2.
- `node tests/voicequeue/synthetic-results.mjs > <scratch>/synthetic.json`, then
  `node tests/retiming.mjs --accuracy <scratch>/synthetic.json --generative --engine --seeds 50` prints section 2
  with an engine column in which `synthetic_speech`'s start error is lower than "none"'s; without `--engine`
  the output is identical on this branch and on main (`diff`).
- `pnpm test` passes; CI passes on the pushed branch.

### The orchestrator runs privately

- `node tests/retiming.mjs --accuracy <results.json> --generative --takes <takes folder> --engine`. Rev 2's
  prototype gave the speech take 50% of transitions right and a start error near 96 ms ("none": 11% and 150
  ms), the Set C baseline 72% and 95 ms. The new sender's figures are not known: **the orchestrator records them
  on this first run.** Acceptable: the speech take at 45% or more and 110 ms or less (the receiver is unchanged
  and the sender is now the read rule, so it should not be worse than the fitted one; the hold's 28 ms and the
  input being the gate model's spurts, not the sound, are what could cost). Between 110 and 130 ms: go on, and
  say so in PROGRESS. **Above 130 ms the orchestrator holds W3-02c** and asks the planner.
- The sender against the demo, with a scratch script of the orchestrator's (the builder writes nothing for it):
  Set D's 20 spurts decoded to 24 kHz, cut at the demo's own chunk lengths (a hand clock), through `createSender`:
  expected, from W3-09, the end marker on the model's final chunk in 18 of 20 spurts and the openings' frame
  counts in all 20.

### Stop and ask

- If the reference schedule cannot be met with the rule as written (give the first message that differs).

## W3-02c: the render and the stream run the channel, behind an option

**Branch:** `claude/w3-02c-timeline-option`, from `main` **after W2-02, W3-05, W3-06, W3-02b, W3-13, W3-11a and
W3-11b have merged** (W3-05 leaves the gain as an object with `reset()`; W3-11a leaves the `steam` render making
Steam's messages and resampling each as a packet). **Time budget:** 1 day.

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
2. **Where it runs** *(rewritten in revision 3)*. With `'game'`, the `steam` profile, the codec on and no
   `opts.received`. Since W3-11a the render has, for every message of the sender in order, its game tick, its
   decoded 16-bit samples and their 44.1 kHz samples from W3-13's resampler (one call per message, a silence
   record's zeros included). Under `'game'` each of those packets goes, as it is, to
   `TF2VoiceChannel.createTimeline`'s `push({ tick, pcm, source })` (`source`: where the source's timeline
   would have laid `pcm[0]`, -1 for a silence record), and `advance(tick)` is called as the source runs on. The
   source-timeline laying of W3-11a's point 4 is skipped. The timeline's output replaces the auto-gain's (stage
   4); the mixer stage and everything after are unchanged. The timeline's `gain` is W3-05's gain object for the
   render's settings (every sample it sees is decoded); with `agc: false` it is an object that multiplies by
   `voice_scale` and clips to int16, as stage 4 does now. **With the gate off** the sender still makes messages
   (every chunk active, one spurt), so `'game'` runs the same way: one channel opened at the start, never
   appended to, with the queue drifting as in "The 400 ppm".
3. **What `'game'` leaves alone or refuses.** With an engine codec (`celt_22`, `celt_44`, `speex`), with
   `steam_48` (it has no sender: it is not the game's path), the codec bypassed, or `opts.received` (until W3-02g), `'game'` is ignored and `codecInfo.channel` is
   `{ timeline: 'source', reason }`. `retime` with `'game'` is a `RangeError` naming both.
4. **`codecInfo`.** With `'game'`: `codecInfo.channel` is the timeline's `info`; `codecInfo.frameLog` and
   `frameBytes` become what was played (slot `i` takes the code and size of the sender's frame that holds
   source position `info.source[i]`, or 0), so the codec
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
  in point 6: the default `steam` render of its speech-like source at 300, 100 and 67 fps; the same with the gate off at
  300 fps; `bufferMs` 50 and 200;
  loss 15% with jitter; `agc` off; `voice_scale` 0.5; chunk sizes 7, 960, 12,345 and the whole source; and their
  `process()` hashes are added to the golden list.
- `tests/verify.js` section 10d, each check failing when its line is broken (say how):
  - **A shift, where nothing else acts.** A 44.1 kHz source (so the mixer and the output resample nothing) of one
    40 s spurt of noise, `agc: false`, `volume: 1`, no room, `fps: 150` (the queue stays between 150 and 450 ms:
    no fade, no overflow). Call the `'source'` render S and the `'game'` render G. For `t` = 10 s and 30 s: there
    is an integer `d(t)` with `G[n + i] === S[n + i + d(t)]` for `i = 0..199`, where `n = 44100 t` or, if no `d`
    fits there (a packet's edge fell in the window: the three-tap output stage smears one sample each side of
    it), `n = 44100 t + 300`. And `d(30) - d(10)` is the number of packets added between them: between 340 and
    375 (one dropped sample each, 17.88 packets a second).
  - **An early start.** Spurts of 2 s with silences of 300 and 900 ms, 300 fps: `codecInfo.channel.spurts[1]` is
    not `opened` and is 195 to 275 ms early, `spurts[2]` is `opened`; in `codecInfo.frameLog` the second spurt's
    codes begin that many frames earlier than in `codecInfo.sent.frameLog` (within one frame).
  - **Overflow at a restart:** at 300 fps `spurts[0].droppedMs` is between 30 and 150 and `channel.drops` is not
    empty; at 67 fps it is 0 and the list is empty.
  - **The gain is reset where the engine resets it:** `channel.gainResets === channel.opens`.
  - The same seed gives the same samples; another seed moves at least one drop; `lossPct` 20 gives the same loss
    pattern (`codecInfo.sent.frameLog`) with and without `'game'`.
  - The ignored cases of point 3 (`steam_48` among them: its `'game'` render equals its `'source'` render
    sample for sample), and the `RangeError`.
- The browser suite passes (the new script loads on the page and in both workers; a render still works offline:
  the service worker's list).
- CI passes on the pushed branch.
- The report gives, for the app's demo speech at seeds 1, 2 and 3 and 300 fps: how many spurts opened a channel,
  how many were appended, the largest early start, and the milliseconds dropped per restart; and the render's time
  against `'source'`.

### The orchestrator runs privately

Before and after, under the heavy lock: `flock /tmp/tf2ve-heavy.lock env CHROMIUM_EXECUTABLE=... node
tests/accuracy.mjs --takes <takes folder> --only take4_my_own_speech,sender_A,net_baseline --json
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
gets more than one packet on a tick, which the engine allows), each message's decoded samples (16-bit, by W3-11a's decoder rules) through W3-13's resampler as one packet,
one resampler per speaker, and the record as that many zeros through the same resampler *(rewritten in
revision 3; it was a whole-signal resampling cut at packet edges)*.
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
