# W3-02: the receiver's voice channel, as the engine runs it

> **Status 2026-11-12, by part:**
> - W3-02a: **built and merged** at `1ee4968` (pull request #9); report `docs/reports/W3-02a-voice-channel.md`. Nothing loads the module yet.
> - W3-02b: **built and merged** at `f58d9a7` (pull request #11); report `docs/reports/W3-02b-voice-timeline.md`. Its sender's clock and hold were replaced by W3-16 (`d250928`).
> - W3-02c: the plan review made it three orders (`abf872f`, `b63cc73`; the amendment below). W3-02c-1: **built and merged** at `a2b7dc9` (pull request #30; no cache change); report `docs/reports/W3-02c1-channel-as-read.md`. W3-02c-2: **not started**; after W3-02c-1 and W4-01b. W3-02c-3: **not started**; after W3-02c-2.
> - W3-02d: **not started**; after W3-02c-2. W3-02e: **not started**; after W3-02d. W3-02f: **not started**; after W3-02d. W3-02g: **not started**; after W3-02c-2 and W3-02f, and a planner's pass.
> - The plan: `docs/reports/W3-02-plan.md` (revisions 1 and 2, `96f0983`, `615fb06`).

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

*Maintenance, 2026-11-10 (`docs/reports/W3-plan-maintenance.md`): W3-02a and W3-02b are built and merged, and
their sections are left as built from. W3-02c to W3-02g were brought up to date with what the builds of W3-02b,
W3-05 and W3-13 learnt: the sender's messages as built, the measured ranges for section 10d, the gain's
settings read at a reset, and a resampler that lives as long as the speaker's decoder.*

*Moved to the end, 2026-11-10 (`docs/PROGRESS.json`, decisions; `docs/reports/W3-plan-maintenance-2.md`).
For orders that touch `audio.js` the sequence is now W3-16, W3-11b, W3-10, W3-17c, W3-17d, and only then
**W3-02c, W3-02d, W3-02f with W3-02e, W3-02g**: the receiver's model is the least certain (58% of transitions
right on the speech take) and gains from recordings still to come. The parts below are **not rewritten**. Each
of W3-02c to W3-02g carries a dated note, "Now comes after", with what will have changed under it and the
rules today's reads gave it. The "Starts after" column of the table below and the sentences that put W3-10
last are superseded by this paragraph. **W3-02c and W3-02g need a planner's pass before they are built** (their
notes say on what); W3-02d, W3-02e and W3-02f hold as written, with their notes.*

*2026-11-12: everything the sequence above puts before W3-02c is built. W3-02c is now three orders: W3-02c-1 (built
and merged 2026-11-12, `a2b7dc9`), W3-02c-2 (after W3-02c-1 and W4-01b, which now comes before it) and W3-02c-3 (after W3-02c-2); see
section 1 of the amendment of 2026-11-11 in W3-02c below. The table below still lists W3-02c as one order.*

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

*Overruled by the amendment of 2026-11-11, section 4 (built in W3-02c-1, merged 2026-11-12, `a2b7dc9`): the first block plays the
first 512 and keeps the last; D is `512 x round(44100 x zero / 512)`, where zero is `latency` plus the mean arrival
time.*

**The clock** that drives the channel in a render: tick `k` is at time `1323 k`, mixer block `b` at `1024 b`.
Events run in time order; a block that starts before a tick runs before it, one that starts on it runs after it.
A packet with arrival tick `k` is added on tick `k`, before the tick's pass. Block `b` is output samples
`512 b - D` to `512 b - D + 511` of the 44.1 kHz voice signal, where `D = round(44100 x latency)` and
`latency(bufferMs, fps) = min(0.5, (waitTicks - 1) x 0.015 + 0.16)`: the delay at which a restarted spurt plays
(0.25 s at 67 fps, 0.295 s at 100, 0.5 s at 235 and above), taken out so that a restarted spurt sits where the
source has it. Output before sample 0 or past the render's length is dropped.

*Overruled by the amendment of 2026-11-11, section 4 (built in W3-02c-1, merged 2026-11-12, `a2b7dc9`): the first block plays the
first 512 and keeps the last; D is `512 x round(44100 x zero / 512)`, where zero is `latency` plus the mean arrival
time.*

**Exact, and approximated.**

| Part | In the model | Why |
| --- | --- | --- |
| Ring size, overflow dropping the oldest | exact | read; every logged add |
| One sample dropped per packet, and the interpolator | exact: n - 1 samples written, the k-th `trunc(s[k] + (s[k+1] - s[k]) x f)`, the fraction 0.999 at assignment and carried from packet to packet; in 16-bit units *(corrected 2026-11-12, W3-02c-1: this row said the blend was under the 16-bit step, which was wrong)* | run: TF2's own routine, both builds, 1,944,423 of 1,944,423 written samples per build and 9,369,073 of 9,369,073 over 6,000 packets; the 0.999 at assignment read (W3-03); a step other than 1.0 not run |
| The countdown | exact for a steady frame rate | the game's frame times vary and a hitch shortens the wait; the input is one number |
| Append, with the one-tick grace; freed when found empty | exact | read; one grace case and 34 opens in the logs |
| The fade | exact: `trunc(f(f(1 - f(j x f(1 / (fade - 1)))) x s))`, `j = fade - 1 - r`, `fade = max(2, trunc(f(44100 x f(voice_fadeouttime))))`, `f` a single-precision round *(W3-02c-1)* | run: TF2's own routine, both builds, 885,240 of 885,240 pulled samples |
| Underrun padding | exact: the last samples read, after the fade, once more, then zeros *(W3-02c-1)* | run: as the fade |
| The gain, and its reset when a channel is assigned | exact | W3-05; verified sample for sample on Set H |
| The extra sample at a start | exact: the mixer's look-ahead; the first block plays the first 512 of 513, every later block the kept sample and 511 new ones; nothing dropped *(W3-02c-1)* | read: W3-10's upsampler read, section 3 (the voice source's side of the pull not re-read; the kept sample of a freed channel is 0 and is not modelled) |
| A read of more than 1024, a padded pull of more than 2048 | not modelled: `pull(n)` takes `n` | the routine's caps; the mixer's blocks ask 512 or 513, larger requests not seen from the mixer. Wrong for a single engine call over 1024 or a replay with real samples whose tick ends in an underrun |
| The zero `D` (the model's own, to line a render up with its source) | `D = 512 x round(44100 x (latency + 0.0505 + codecDelay) / 512)`: 13312, 15360, 24064 samples at 66.67, 100, 300 fps with no codec delay; 13312, 15360, 24576 with the Opus codec's 156 samples at 24 kHz | the game has no such figure. `latency`: the wait and the opening burst (read); 0.0505 s: the mean arrival after the message's first captured sample, measured on the model over 455 spurts; `codecDelay`: what the caller took off each source for its codec; on whole blocks so that the channel's blocks are the mixer's (read: W3-07, W3-10). At 66.67 fps the sum sits 0.6 ms under the edge where `D` becomes 13568 |
| When the mixer pulls | approximated: a block every 512 samples | in the game the pulls follow the frames (a tick sees 0, 1 or 2 blocks, 7% see none); it matters by at most a block (11.6 ms) at a full or a nearly empty ring |
| Ticks | approximated below 67 fps: evenly spaced | there several ticks run in one frame |
| Five channels, other speakers | not modelled | one speaker |

## The sender's packets

> **Superseded for the clock and the hold by W3-16 (`d250928`, cache v25).** The rule (gate, states, pre-roll,
> frames) stands. The clock, the hold's arithmetic and the reference schedule are
> `docs/work-orders/W3-16-sender-hold-clock.md` and `STEAM_SENDER` in `steam-sender.js`. The figures below were
> measured on the old clock.

*Rewritten in revision 3 from W3-09 (`docs/reports/W3-09-steam-voice.md`, sections 1, 2 and (a)).* A source file
has no packets, so the render makes them as Steam does: it reads the sound in chunks, gates each chunk, and sends
one message per chunk. The rule is read from Steam's client; only the clock that says when Steam's frames fall is
a model. It lives in a new module, `steam-sender.js` (global `TF2SteamSender`), which W3-02b builds and which the
offline render shares (W3-11a): there is one gate.

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
service-worker file loads `steam-sender.js` yet (W3-11a does that).

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
   call the sender, a codec or a resampler: its caller does, so this order needs neither W3-11a nor W3-13.
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

> **Since 2026-11-11 this is three orders: W3-02c-1 (built and merged 2026-11-12, `a2b7dc9`), W3-02c-2 and W3-02c-3 (not started).
> Build W3-02c-2 from the amendment below, section 5; the text from here to the amendment holds only where
> section 5 says it stands.** Among what it overrules: the branch is `claude/w3-02c2-timeline-option`; "it sets
> W3-10's origin to its own" is withdrawn; `spurtStart()` at each channel is withdrawn for renders (decision 10);
> a refused message is an empty `pcm`, counted in `network.refusedMessages`; the Files list (section 5 forbids
> `live-worker.js` and adds files); the `agc: false` object rounds to whole 16-bit values before `push` (section 5, as of 2026-11-12); the ignored codecs include `miles` (not in TF2);
> section 10d's ranges and "at most 132 ... at least 100" are replaced by section 5's table and "at most 128 ...
> at least 40".

**Branch:** `claude/w3-02c-timeline-option`, from `main` **after W2-02, W3-05, W3-06, W3-02b, W3-13, W3-11a and
W3-11b have merged** (W3-05 leaves the gain as an object with `reset()`; W3-11a leaves the `steam` render making
Steam's messages and resampling each as a packet). W3-13's merge waits for the owner's word on its licence, and
so do W3-11a's and this order's. **Time budget:** 1 day.

> **Now comes after (2026-11-10, `docs/reports/W3-plan-maintenance-2.md`).** Built after W3-16, W3-11b, W3-10,
> W3-17c and W3-17d. The spec below is as it was; read it with this.
>
> *What will have changed under it:*
> - **The `steam` render and decoder are W3-11a's as built** (`docs/reports/W3-11a-steam-render.md`, "What was
>   built" and "For W3-02c's builder"): `steamTimeline` lays the packets and feeds the gain; the codec is
>   `createSteamStream` over `createSteamDecoder`; the hooks are `onDecoded`, `onResampled` and `onGain`; the
>   stream holds back `STEAM_REACH`. Spec 2's first paragraph describes exactly that. The sentence under
>   "Branch" that W3-13's, W3-11a's and this order's merges wait for the owner's word is void: both merged.
> - **The sender is W3-16's**: reads are `{ time, since, samples }`, the hold is the float test with `uptime`
>   (`opts.steamUptime`, 9 days by default), a message's tick comes from `since`, an empty read runs the
>   states. **Its schedule moved, so every bracketed figure and range of section 10d was measured on a clock
>   that no longer exists.** W3-16's builder re-derived the module's own checks: after 500 ms a spurt of its
>   own in 42 of 50 seeds (was 38), starting 0 to +80 ms; after 900 ms appended in 46 of 50, **160 to 310 ms
>   early** (seen 167.5 to 303.7; 10d asks -330 to -190, which no longer holds at its upper end); dropped
>   after 1200 ms 86.5 to 153.7 ms; the first spurt's start +21.8 to +74.4 ms; 17.90 messages a second.
>   **A planner re-measures layouts P and Q of 10d on the merged sender, through the capture filter, before
>   this order is built**, and re-states which line catches which broken sender (a hold "0.39 s or less" is
>   no longer a meaningful break: the hold is 375 to 437 ms of real time at the default).
> - **The live chain is W3-11b's**: the render's stages on Steam's sender, with the key. `createSteamStream`
>   has `press()` and messages that were made and not collected; the sender has `key()`. A render calls
>   neither. Spec 7 stands: `createLiveChain` ignores `timeline`.
> - **The mix stage and the device's rate are W3-10's.** The timeline's output reaches `mixEntry` where the
>   gain's output does now; the 3-tap output stage is gone and a render is at the device's rate (48000 Hz by
>   default). So in 10d: "A shift, where nothing else acts" and the `voice_scale 0` check both name "the
>   three-tap output stage" and assume the output at 44.1 kHz: they are run with `deviceRate: 44100` and
>   re-stated (no smear; and the entry truncates, so a sample of one unit becomes 0: the "at least 100 of
>   them non-zero" is measured again). Spec 5's "keeps the source's length" is at the device's rate.
> - **The mixer's blocks.** W3-10's stage runs in 512-sample blocks from the render's first sample, with the
>   origin one named value. This order's clock has block `b` at output samples `512 b - D`. Under `'game'`
>   it sets W3-10's origin to its own, so the channel's pulls and the mix stage's blocks are the same blocks,
>   as in the game.
> - **The first pull, read** (`docs/reports/W3-10-upsampler-read.md`, section 3, seen in passing): the
>   wave mixer keeps one sample of look-ahead. On a channel's first block it asks for `count + 1` samples
>   (the 513 of the logs) and **mixes the first `count` of them**; the extra, last sample is kept with the
>   channel and is the first sample mixed in the next block, in front of that block's new samples. No
>   sample is skipped and the stream stays in order. "The first pull" above, and `createTimeline` as W3-02b
>   built it, have the render "ask for 513 and play the last 512", dropping the queue's first sample
>   unheard: by the read it is the **first** 512, and nothing is dropped. One sample at each channel's
>   start; the planner's pass on this order corrects the model's text and says what changes in
>   `voice-channel.js` (which this order may not touch as written). The voice source's side of the pull was
>   not re-read.
> - **The room path is W3-17c's, and its slot and tail live at the mix**, after this order's stage. The slot
>   is asked for its shares once per mixer block; this order calls the path's `spurtStart()` at each channel
>   it opens (W3-17c calls it once, at the render's start). With a room the render is longer than the source
>   by the room's tail: spec 5 still cuts the channel's own overshoot at the source's length, and the tail
>   follows from there. The golden list holds room cases by then; "pass unchanged" covers them.
>
> *Rules today's reads gave this order:*
> - **The gain is reset when a channel is assigned, and reads its three settings then** (W3-05's second read;
>   finding 26). Spec 2 already says so; nothing changes.
> - **The resampler and the decoder outlive channels and key presses** (measured: Set G for the resampler,
>   Set J for both). One resampler per render (spec 2 says so). The decoder too: a channel that opens resets
>   neither; only a delivered end marker or a number behind the expected one resets the decoder.
> - **Sequence numbers are 16 bits and already masked** inside `createSteamDecoder` (W3-11a's fix round):
>   nothing here masks or widens them.
> - **The game's refusal of a message over 12 frames** (W3-16's read, section 3; W3-03 for the engine's
>   room): the engine takes at most 22,528 bytes a call, 11,264 samples at 44.1 kHz. A message whose
>   resampled sound is longer is refused whole: the decoder and the resampler have run, and nothing reaches
>   the channel. Without loss a render cannot make one. With loss it can: 8 or more concealed frames in
>   front of a 5-frame message, and W3-11a's render makes messages of 13 to 16 blocks. **Built here, where
>   the channel takes a message**: under `'game'` such a message is not pushed, and `codecInfo.channel`
>   counts it. On the source's timeline the render goes on playing it; whether it should refuse there too
>   (the loss cases' hashes would move once) is asked of the orchestrator in the maintenance report.
> - **The decoder's 17-frame cut** cannot be reached by a file render, with or without loss (W3-16's order):
>   it is W3-02g's.
> - **A late frame** is still the measured stand-in; what it is once the channel is real is still open
>   (`docs/reports/W3-plan-maintenance.md`, "Open" 1).

### Files

May touch: `audio.js` (`process()` and `createRender`: one new stage and the option; `createGain`'s `reset`
taking the settings), `tests/gain.verify.mjs` (a check for that argument only), `index.html`, `sw.js` (the
new script in `ASSETS`; raise `CACHE`), `audio-worker.js` and `live-worker.js` (`importScripts`),
`tests/verify.js` (how it loads the scripts; a new section 10d), `tests/render-stream.verify.mjs`,
`tests/predictions/PREDICTIONS.md` (the hashed-file note). May not touch: `voice-channel.js`, `constants.js`,
`opus-codec.mjs`, `reference.js`, `app/`, `tests/accuracy.mjs`, `tests/predictions/predictions.json`,
`docs/PROGRESS.json`.

### Spec

1. **The option.** `opts.timeline`: `'source'` (the default, and anything else) or `'game'`; `opts.fps` (300) and
   `opts.bufferMs` (100). With `'source'` nothing in this order runs: every render is bit for bit what main gives.
2. **Where it runs** *(rewritten in revision 3; brought up to date 2026-11-10)*. With `'game'`, the `steam`
   profile, the codec on and no `opts.received`. Since W3-11a the render has, for every message of the sender
   in order, its game tick, its decoded 16-bit samples and their 44.1 kHz samples from W3-13's resampler (one
   call per message, a silence record's zeros included). Under `'game'` each of those packets goes, as it is,
   to `TF2VoiceChannel.createTimeline`'s `push({ tick, pcm, source })`, and `advance(tick)` is called as the
   source runs on. The source-timeline laying of W3-11a's point 8 is skipped.
   - **`pcm`** is the resampler's `Int16Array` divided by 32768, so every value the gain sees is a 16-bit
     value, as in the game. The whole of it, uncut.
   - **`source`** is where the source's timeline would have laid `pcm[0]`: for a spurt's first sound message
     `round((start - lookahead) x 44100 / 24000)` (W3-11a's point 8; `start` is the sender's and can be as low
     as -2400, so this can be well below 0); for each later message of the spurt, the one before plus that
     message's `pcm.length`; for a silence record (a message `{ tick, silence }`, with no `spurt`) exactly
     **-1**. The timeline takes -1 alone as a record and any other number as a position; no position rounds to
     -1 (W3-02b's report, reading 8).
   - **An end message with no frames** (the gate off, when the source ends on a frame's edge) has no samples:
     it is pushed with an empty `pcm` and is not given to the resampler.
   - **The resampler is not the channel's.** One resampler serves the whole render: Steam keeps it as long as
     the speaker's decoder, and neither a channel being assigned again nor an Opus decoder reset resets it
     (finding 29; measured on Set G). So a spurt that opens a new channel still comes through the same
     resampler stream, 16 input samples late since the render's first packet.
   - **The gain.** The engine reads `voice_scale`, `voice_avggain` and `voice_maxgain` when it resets the gain,
     which is when a channel is assigned, and at no other time (W3-05's second read; finding 26). The object
     handed to the timeline is `{ process, reset }` over `TF2Audio.createGain`, whose `reset()` takes the three
     settings as they stand at that moment: either `createGain`'s `reset(settings)` gains that argument (this
     order may add it; with none it keeps what it has, so W3-05's checks do not move), or the wrapper makes a
     new gain at each `reset()`. In a file render the settings do not change, so the two give the same samples;
     the form is the engine's, and is what a channel that runs live will need (the live chain keeps W3-05's
     gain until then: W3-11b). Two things follow from the reset and are checked: **the
     first 128 samples a new channel is given pass at unity whatever `voice_scale` is**, and an appended spurt
     gets no reset. A queue underrun never reaches the gain (the padding is made after it). With `agc: false`
     the object multiplies by `voice_scale`, rounds and clips to 16 bits, as stage 4 does now.
   - **A late frame** (loss mask 2) stands in a message as 480 zeros that no decoder made (W3-11a's point 6).
     They must not reach the gain as decoded zeros (a decoded block of zeros sends the gain to its cap). The
     wrapper is told, before each `push`, which of the packet's samples are a late frame's (frame `j` of `F`
     in a packet of `n` samples is samples `round(j n / F)` up to `round((j + 1) n / F)`), passes those through
     unchanged and does not count them into the gain's blocks. A silence record's zeros are decoded zeros and
     do go through the gain. What a late frame is in the game once the channel is real was not read: see
     `docs/reports/W3-plan-maintenance.md`, "Open".
   - The timeline's output replaces the auto-gain's (stage 4); the mixer stage and everything after are
     unchanged. **With the gate off** the sender still makes messages (every chunk active, one spurt), so
     `'game'` runs the same way: one channel opened at the start, never appended to, with the queue drifting
     as in "The 400 ppm".
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
  - **The wiring is the module's** (the timeline's own behaviour is pinned in `tests/voice-channel.verify.mjs`
    by W3-02b, with exact counts over 50 fixed seeds; this section proves the render hands it the right
    things). A test hook, `opts.onMessage`, receives each `{ tick, pcm, source }` as it is pushed. For layouts
    P and Q below at 300 and 67 fps, seeds 1 to 5: a fresh `createTimeline` with the same settings, fed the
    hook's messages and the same `advance` calls, gives an `info` deep-equal to `codecInfo.channel`. And the
    messages are what the order says: every `source` of a record is -1; a spurt's first `source` is
    `round((start - lookahead) x 44100 / 24000)`; within a spurt each `source` is the one before plus that
    `pcm.length`; every `pcm` value times 32768 is an integer; the ticks never fall.
  - **The layouts.** Sources at 24 kHz: bursts of 2 s of a 1 kHz square wave of height 1000 of 32768 (so, as
    in W3-02b's own tests, a chunk is active when about a third of it is burst: the mean rule alone decides),
    noise at -50 dBFS between (under the gate; it makes the pre-roll sound, not zeros). **P:** silences of 300, 500 and 1200 ms. **Q:**
    silences of 900, 600 and 1200 ms. Seeds 1 to 10. The figures in brackets are what the plan's third read
    measured on these layouts and this signal with the merged modules alone (the sender, the timeline, the
    resampler's counts, the codec's delay of 156 samples in `source`), seeds 1 to 50 unless said. **What
    stands between that run and this section:** not the codec (the sender runs before it, so it changes no
    gate decision and no count, and the resampler's counts are exact) but the 24 kHz capture filter in front
    of the sender. It can move a chunk at a burst's edge, so it may flip single seeds in the 500 ms case and
    shift an offset by up to one chunk. The ranges leave 5 to 30 ms for that; the tightest is the 900 ms
    case's upper end (-191.9 against -190), which the "8 of 10" absorbs. No exact count is asked.
    - **A 300 ms pause never makes a spurt** (it is inside the 0.4 s hold): in P, every seed,
      `codecInfo.channel.spurts[0].end` is past the second burst's end and `codecInfo.sender.spurts[0]` holds
      both bursts.
    - **A 500 ms pause makes its own spurt in some seeds and not in others** [on this signal in 29 of 50, and
      in 3 of seeds 1 to 10; W3-02b's 38 of 50 is for a level signal over silence: the noise between bursts
      here lowers what a partly filled chunk needs]. In the rest the chunk after the final one is already
      active, the sender re-opens with no silence record and the timeline keeps one spurt. In P, per seed,
      exactly one of two holds: the timeline has 3 spurts, the second not `opened`, with `offsetStartMs`
      between -20 and +60 [+14.5 to +21.0 in seeds 1 to 10]; or it has 2 spurts and the sender sent no silence
      record between the second and third bursts. **Both must occur among seeds 1 to 10; if one does not,
      extend to seeds 1 to 30; if one still does not occur there, the check fails.** This is the only line
      of the section that catches a sender whose hold is timed from the chunk's start in place of its read:
      that sender splits every seed (50 of 50) and passes every range below.
    - **An early start, after 900 ms.** In Q at 300 fps, in at least 8 of the 10 seeds, `spurts[1]` is not
      `opened` and its `offsetStartMs` is between -330 and -190 [appended in 49 of 50, -311.6 to -191.9; in
      seeds 1 to 10, all ten, -257 to -225]; at 67 fps it is `opened` in every seed and within 80 ms of the
      source [+22 to +46 in seeds 1 to 10]. Where it is
      appended, in `codecInfo.frameLog` that spurt's codes begin `round(-offsetStartMs / 20)` slots earlier
      than in `codecInfo.sent.frameLog`, within one slot.
    - **Overflow at a restart.** At 300 fps: in P `spurts[0].droppedMs` is between 60 and 210 [82.1 to 177.7]
      and the spurt after the 1200 ms pause is `opened` with `droppedMs` between 60 and 190 [79.6 to 167.8];
      in Q `spurts[0].droppedMs` is between 45 and 150 [64.9 to 128.5]; `channel.drops` is not empty. At 67 fps
      every `droppedMs` is 0 and the list is empty.
    - What a wrong build does here, from the third read's three broken senders and W3-02b's breaks: a hold
      timed from the chunk's start splits the 500 ms pause in every seed (the line above); a frame count not
      restarted at a spurt fails the 900 ms and the 1200 ms lines; a `start` without the pre-roll fails the
      500 ms and the 900 ms offsets; a hold of 0.39 s or less changes which seeds split at 500 ms (the
      module's suite pins its own count; here a hold under 0.3 s splits the 300 ms pause); a channel
      that is never appended to makes `spurts[1]` of Q `opened` at 300 fps; a wait a tick off moves
      `droppedMs` at 300 fps out of range or makes it non-zero at 67; the ring's oldest sound not dropped
      empties `drops`.
  - **The gain is reset where the engine resets it:** `channel.gainResets === channel.opens`. With
    `voice_scale` 0 at 67 fps on layout Q (nothing is dropped there), the render is zero everywhere but in a
    run of at most 132 samples at the start of each `opened` spurt (the first 128 samples a new channel is
    given, at unity, less the two the channel and the first pull take, plus the output stage's smear), at
    least 100 of them non-zero; an appended spurt adds none. **For this check the noise between bursts is at
    -40 dBFS** (still under the gate: its mean is about 260 against 327.67), because those samples are the
    spurt's pre-roll after Opus with DTX on, which may turn noise at -50 dBFS into a few steps of comfort
    noise or nearly nothing. If fewer than 100 are non-zero on a build that passes the rest, report the count
    and stop. With the settings read at construction instead
    and changed before a second open (through the wrapper, in a unit check of it), the second open still uses
    the old ones: that check fails.
  - **A late frame is not decoded silence:** a hand-made mask with one late frame in a long burst, `agc` on:
    the gain's state after that packet (`state()` through the wrapper) equals its state with the frame's
    samples left out, and differs from its state with them fed as zeros.
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

### Amendment of 2026-11-11 (plan review before the build)

A planner's pass on main at `23568c6` (cache v33; `audio.js` and `voice-channel.js` as BC-1 left them). **Where
this section and the text above differ, this section holds; what it does not name stands.** Line numbers are that
commit's. W4-01a, c and b merge before the build and will move them, so each is given with its function's name.

How statements about the game are marked: *(read: report)* a rule read from the game's code, with the report that
read it; *(measured: count)* seen in a log or a take; *(inferred)* follows from the rules and was not seen.
**Re-measured** means a scratch run of this pass on the merged modules: `process()` on the layouts of section 10d
with the real capture path, sender and resampler, and a stand-in for the codec that returns zeros with the codec's
delay of 156 samples (the codec changes no gate decision, no tick and no count); the packets as `onResampled`
gives them were fed to `createTimeline` as built. Seeds 1 to 50 unless said. One count was taken with the real
codec and is marked so. The scripts are not in the repository: the builder's section derives the figures again.

#### 1. One order becomes three

| Part | What | Files that change | Starts after | Budget |
| --- | --- | --- | --- | --- |
| **W3-02c-1** | the module as read: the first pull, the blocks on the mixer's grid, the zero | `voice-channel.js`, `tests/voice-channel.verify.mjs` | now (it touches no file the page orders touch) | half a day; one day if the interpolator is ruled in (decision 3) |
| **W3-02c-2** | `process()` and `createRender()` run the channel behind `opts.timeline`; a lost message through the queue (BC-3's build) | `audio.js` and the files of "Files" below | W3-02c-1 and W4-01b | 2 days |
| **W3-02c-3** | the live chain runs the channel | `audio.js` (`steamLiveChain`), `voice-channel.js` (a timeline with no fixed length), `live-worker.js`, tests | W3-02c-2 and the owner's ruling (decision 1) | 1.5 days |

Branches: `claude/w3-02c1-channel-as-read`, `claude/w3-02c2-timeline-option`, `claude/w3-02c3-live-channel`.

Why three and not one day: the module needs corrections the order forbade ("may not touch `voice-channel.js`"),
and they move that module's pinned counts and nothing else, so they are a part of their own that can be built
beside the page orders. The render's part grew: the packets are now laid in one shared place that also carries
BC-1's loss, the refusal and the source's frame log, all of which must keep running under `'game'`; the streamed
render needs a bound on ticks that the order did not give; W4-01b's two kept places ask for the option to be
listed; and section 10d's figures are all re-stated. The live chain was "not changed" in the order's point 7 and
stays so in c-2; the brief for this pass names it as part of c, so it is cut out as c-3 and waits for a ruling.

#### 2. The option, and where the channel enters today's code

**The option (point 1 stands, with this added).** `opts.timeline`: `'source'` (the default, and any other value)
or `'game'`. `opts.fps` (300) and `opts.bufferMs` (100), limited as `waitTicks` limits them (`voice-channel.js:75`:
10 to 1000 and 1 to 5000). They are read by `process()` and `createRender()` only. None of the three exists in
`audio.js` today, and `voice-channel.js` is loaded by no page, worker or render. **Without `'game'` no line of this
order runs and `codecInfo` has no `channel` member** (the recorded `codecInfo` hashes are taken over every member).
Point 3's `codecInfo.channel = { timeline: 'source', reason }` is written only when `'game'` was asked for and
ignored.

**`steam`: inside `steamTimeline.add`** (`audio.js:1408`, `add` at 1455 to 1512). Since BC-1 this one function
takes each message's decoded packet, runs the resampler, refuses a packet of more than 12 frames, runs the gain
and lays the sound on the source's timeline; `process()` (`audio.js:1755`), `createRender()` (`audio.js:2782`)
and the live chain (`audio.js:2098`, `add` at 2171) all make one and call it. Under `'game'`:

- **Stays, on both timelines** (these lines run as they are): the counts (1456 and 1457), the spurt's anchor
  (1458 to 1462), `onDecoded`, the resampler's one call per message and `onResampled` (1464 to 1468), the
  packet's place `cursor + 882 x skipped` (1470), the refusal test (1471 to 1476), the source's frame log
  (`mark`, 1505), the cursor and the spans. They give the channel its `source` and give `codecInfo.sent`.
- **Replaced under `'game'`**: the gain's block (1478 to 1492) and `lay` (1504). In their place the packet goes
  to the timeline of `TF2VoiceChannel.createTimeline`: `push({ tick: msg.tick, pcm, source })`, where `pcm` is
  the resampler's `Int16Array` over 32768 (line 1477, whole and uncut), and the gain is the object the timeline
  was made with.
- `steamTimeline` gets one more member of its `cfg`, the channel's timeline; with none (every `'source'` render
  and the live chain) `add` is the code of today, statement for statement.

**`process()`** (`audio.js:1660`). The timeline is made beside `steamTimeline` (1755) with `length: voiceLength`
(1754: the source's length at 44.1 kHz), `fps`, `bufferMs` and the gain object. After the loop of 1758 to 1761,
`finish()` gives the samples and `info`; the samples stand where `timeline.take(voiceLength)` stands (1762).
Stage 4's scale and clip for `agc: false` (1814 to 1817) is not run again: it is the gain object's (below).
`opts.onGain` (1838) receives the channel's output. The mix stage (1846), the output stage and the length (1858
to 1861) are untouched.

**`createRender()`** (`audio.js:2692`). The same timeline, made at 2782. `push` (2793 to 2797) returns what the
channel's `push` and `advance` gave, in place of `timeline.take(steamGiveOut(...))`; `flush` (2798 to 2801)
returns `finish().samples`. **The bound for `advance`** (the order did not give one): after `P` samples have been
given to the sender, no later message has a tick below `max(last + 1, ceil((P / 24000 + relay) / tick))`, with
`last` the tick of the last message made and `relay` and `tick` the sender's own constants (0.002 and 0.015 s).
It should hold because a read never comes before the last sample of its chunk was captured (`steam-sender.js`:
a capture step is ready no earlier than its end) and a message is known once its chunk's last sample is pushed.
A bound that is too high makes `push` throw (`voice-channel.js:341`), so the chunked cases below test it. The
render then holds back the channel's delay `D` plus at most a tick and a block; the report says the figure.

**The engine codecs' frame path** (`process()` 1773 to 1806 and stage 4 at 1818 to 1835; `createRender()` 2803
to 2871) gets no channel: they have no sender model and their ring is another size ("The model"). `'game'` is
ignored there, as in point 3, whose list gains **`miles`** (W3-20b).

**The room mix and the output stage** come after the channel and are not changed: `createMixStage` (736, called
at 1846), `createRoomMix` (529), `createMixBlocks` (682), `createOutStage` (738, called at 1858). The room mix
works in whole 512-sample blocks from the render's first mix sample, and the channel's blocks start at output
samples `512 b - D`. W3-02c-1 puts `D` on a whole number of blocks, so the channel's pulls and the mixer's blocks
are the same blocks, as in the game *(read: W3-07, the mixer's 512-sample blocks; W3-10's upsampler read, section
3)*, and **`MIX_BLOCK_ORIGIN` stays 0** (`audio.js:346`). The 2026-11-10 note's "it sets W3-10's origin to its
own" is withdrawn; the comment at `audio.js:337` to 346 that expects it is corrected by c-2.

**`spurtStart()` in a render.** The note has this order call the room path's `spurtStart()` at each channel it
opens. In a render the room never changes, and the call only fixes two limits from the room's values
(`room-dsp.js:962`), so no sample depends on how often it is called and no test could show the call. c-2 does not
add it and corrects the comment at `audio.js:1142`; c-3 does, where the listener can change rooms.

**The live chain** (`steamLiveChain`, `audio.js:2063`): untouched in c-2. `createLiveChain` ignores the three
options; a check shows a chain made with `timeline: 'game'` gives the samples of one made without.

#### 3. BC-1 and the channel: what stays, what the channel replaces

BC-1 put loss on whole messages and gave the source's timeline stand-ins for what the queue does. With the option
off none of this order's code runs, so every recorded hash stays. With it on:

| BC-1's part | Where | Under `'game'` |
| --- | --- | --- |
| Which messages are lost: one draw per message, or `opts.loseMessage` | `steamMessageLoss` (1258), `steamLoser` (1267), before the decoder | **stays**: the same messages are lost on both timelines |
| The decoder's rules: a gap is concealed, at most 10 frames, when the next message arrives; a lost end marker carries the decoder over | `opus-codec.mjs:258` to 320 | **stays**: the decoder is before the channel |
| The refusal of a packet over 11,264 samples | `STEAM_ROOM` (1248), `steamFits` (1250), the test at 1471 | **stays**: decided after the resampler, before the channel. The channel is given an empty packet for it (decision 5) |
| `codecInfo.network` | `network()` (1544) | **stays**, equal on both timelines |
| A late frame (the jitter control): 480 zeros no decoder made, passed around the gain | the mask in the round trip; 1481 to 1491 | **stays until BC-4** (decision 8); the rule moves into the gain object |
| The silent time: 882 samples for each frame nobody fills, past the ten concealed | `place` (1470) | **replaced**: the ring has no places. The packet joins the end of the queue on its tick. `place` is kept as `source`, for `info` only |
| A refused packet's time, and frames lost at a spurt's end | the cursor (1474) | **replaced** the same way |
| One gain for the render, reset once | `createGain` at 1756 | **replaced**: reset at each channel the timeline opens |
| The live chain's rules for a packet behind what was given out | 1494 to 1503 | not reached in a render |

What the queue does instead of the silent time *(read: W3-03, the queue's rule; the effect measured privately on
the loss takes of Set C, numbers below)*: while nothing arrives the ring drains; the sound that follows a gap
closes up to what was queued, so it plays earlier against the source by the time nobody filled; a gap that
outlasts the queue runs it dry (the fade over the last 100 ms, then padding), the channel is freed, and the next
message opens a new one with a new wait and a gain reset. *(Measured, private, loss 15%: of 16 lost runs longer
than 10 frames, 9 end with the sound earlier by whole frames, 20 ms twice and 260 to 340 ms seven times, and 6
end 48 to 459 ms later after 450 to 720 ms of low sound, which is a restart.)*

So a `'game'` render differs from the `'source'` render of the same options in these and nothing else: the wait
and the place of each spurt; one sample fewer per packet; the overflow at a restart; the fade, the padding and
the freeing; a gain reset at each open; and under loss the closing-up above. Three checks hold it to that (in "The
builder runs" below): the packets handed to the channel are the `'source'` render's `onResampled` packets, value
for value; `codecInfo.sent.frameLog` is the `'source'` render's `frameLog`; `codecInfo.network` is equal.

**What is pushed.** A sound message: its packet, `source` = `place`. A silence record: its resampled zeros,
`source` -1. An end message with no frames that arrived: an empty `pcm` (point 2 stands; an empty packet opens a
channel if none is in use, *read: W3-03*). **A lost message: nothing** (this is all BC-3 builds). **A refused
message: an empty `pcm`** on its tick, counted in `codecInfo.network.refusedMessages` as on the source's timeline
(the 2026-11-10 note had "not pushed, and `codecInfo.channel` counts it"; *measured once, privately: in Set J's
log exactly 1 of 645 packet lines adds no samples, and it stands where the refused message was*). The note's
question whether the source's timeline should refuse too is closed: BC-1 built it.

So point 2's rule for `source` changes in one place: within a spurt a message's `source` is the cursor plus 882
for each frame nobody fills, which without loss is "the one before plus that `pcm.length`" as written.

A lost silence record joins two spurts in `info.spurts` (the timeline closes a spurt at a record). It changes no
sample; it is left as built and said in the report.

#### 4. W3-02c-1: the module as read

**Files.** May touch `voice-channel.js` and `tests/voice-channel.verify.mjs`. Nothing else.

1. **The first pull, as read** *(read: `docs/reports/W3-10-upsampler-read.md`, section 3)*. The mixer keeps one
   sample of look-ahead: on a channel's first block it asks for 513 samples, mixes the first 512 and keeps the
   last; every later block mixes the kept sample and then the first 511 of its 512 new ones, and keeps the last.
   Nothing is dropped and the stream stays in order. `createTimeline` plays the last 512 of the first pull and
   never hears the queue's first sample (`voice-channel.js:288` to 293); it is changed to the read rule. What
   becomes of the kept sample when a channel is freed was not read (the voice source's side of the pull was not
   re-read), and it changes no sample: a channel is freed only after a pull that emptied the ring, and the fade
   and the padding leave that pull's last sample exactly 0. "The first pull" in "The model" and the table's row
   "The extra sample at a start: counted; dropped unheard" are replaced by this.
2. **The blocks on the mixer's grid.** `D = 512 x round(44100 x zero / 512)` in place of `round(44100 x latency)`
   (`voice-channel.js:259`): with today's zero 11,264 samples at 67 fps (was 11,025), 12,800 at 100 (13,010) and
   22,016 at 300 (22,050), a move of the whole output by 5.4, 4.8 and 0.8 ms. `D` is the model's figure for
   lining a render up with its source; the game has none *(inferred)*.
3. **The zero** (decision 2). `latency` takes a restarted spurt's delay as the wait plus the 160 ms its opening
   packet carries, as if the packet arrived the moment its last sample was captured. With the merged sender it
   arrives later: re-measured on layouts P and Q, seeds 1 to 10, an opened spurt starts +27.5 to +95.3 ms after
   its place at 300 fps (mean +54.4, 42 spurts) and +24.7 to +83.5 ms at 67 fps (mean +52.8, 50 spurts). If
   ruled as recommended, the zero is `latency` plus that mean as one named constant, measured again by the
   builder over the suite's 50 seeds; `info.latency` stays the channel's own figure.
4. **The interpolator** (decision 3), only if ruled in.
5. The suite's pinned counts and offsets are derived again; the report lists each that moved and by how much.
   `createChannel`'s `add`, `tick` and `pull` are not changed by 1 to 3.

**The builder runs.** `pnpm test`. New lines, each failing when broken: the first block after a start plays the
queue's first 512 samples and the next block begins with the 513th (break: today's rule); every block's first
output sample is a multiple of 512 from the output's start at 67, 100 and 300 fps (break: `D` unrounded).

**The orchestrator runs privately**, before and after: the Set G replay of W3-02a (`--fixture`): **the engine
column stays all zeros and the fault columns stay as tabled** (the replay drives `createChannel`, which did not
change); and `tests/retiming.mjs --engine` as in W3-02b. That check reads 47% of transitions and a start error
of 129 ms on the speech take since W3-16 (117 ms with the zero taken out by hand), against W3-02b's bars of 45%
and 110 ms, with 130 ms as the line that holds W3-02c. With the zero of item 3 the expected figure is near 117
ms: inside the band "go on, and say so in PROGRESS". Above 130 ms c-2 is held.

#### 5. W3-02c-2: the order above, statement by statement

**Branch.** `claude/w3-02c2-timeline-option`, from main after W3-02c-1 and W4-01b. Budget 2 days.

**Files.** May touch: `audio.js` (`steamTimeline`, `process()`, `createRender()`; `gainRule` and `createGain`,
only for `reset` taking the settings; the two comments named in section 2; W4-01b's list of options read after
its second kept place), `tests/gain.verify.mjs` (that argument only), `index.html` (the script, after
the `steam-sender.js` script tag), `sw.js` (`ASSETS` at 17; `CACHE` at 16 raised by one from main's), `audio-worker.js`
(`importScripts`, line 6), `tests/verify.js` (the loader at 35; the new section 10d), `tests/render-stream.verify.mjs`
(the script list at 33; new cases added to `GOLDEN`, none changed), `tests/stages.verify.mjs` (W4-01b's suite: one
case), `tests/browser.verify.js` (the check "the page and the live monitor's worker load steam-sender.js"), `tests/predictions/PREDICTIONS.md`.
`audio.js` finds the module as `steamModules()` finds the sender (`audio.js:1291`).
May not touch: `voice-channel.js` and its suite (c-1 built them), `steam-sender.js`, `opus-codec.mjs`,
`room-dsp.js`, `constants.js`, `reference.js`, `app/`, `live-worker.js` (c-3 loads the script there),
`tests/accuracy.mjs`, `tests/predictions/predictions.json`, `docs/PROGRESS.json`, any existing entry of `GOLDEN`
or `GAIN_GOLDEN`.

**Spec.**

- *Point 1*: stands, with section 2's addition.
- *Point 2*: its first paragraph is replaced by sections 2 and 3. Its bullets:
  - `pcm`: stands (`audio.js:1477`).
  - `source`: as section 3.
  - An end message with no frames: stands. A lost message and a refused one: section 3.
  - The resampler: stands (one per render, `audio.js:1753` and 2781).
  - The gain: stands. Today `gainRule`'s `reset()` takes nothing and the three settings are fixed when the rule
    is made (`audio.js:789` to 797; `createGain` at 861). Either form the order allows is acceptable. With
    `agc: false` the object multiplies by `voice_scale`, **rounds to the nearest whole 16-bit value (ties to
    even, as `mixSample` does, `audio.js:356`) and clips, before `push`** *(the orchestrator, 2026-11-12, from
    W3-02c-1's review: the channel works in whole 16-bit units and truncates in its blend, so an unrounded value
    would come out one unit lower under `'game'` than under `'source'`, where the mix entry rounds it: 1.5 units
    gave 1 against 2)*.
  - A late frame: stands; it is the rule of `audio.js:1481` to 1491, moved into the object.
  - "The timeline's output replaces the auto-gain's (stage 4)": it replaces `steamVoice` (`audio.js:1762`).
    With the gate off: stands; section 6 has the figures.
- *Point 3*: stands, with `miles` added. `retime` with `'game'` is the `RangeError` only where `'game'` would
  run; it is tested before `createRender()`'s own refusal of `retime` (`audio.js:2730`). Where `'game'` is
  ignored, `retime` runs as today.
- *Point 4*: stands. The played logs are **new arrays** of the sent logs' length: slot `i` takes the sent slot
  `floor((info.source[i] x 80 / 147 + lookahead) / 480)` (the inverse of `centre` in `steamTimeline`), or 0
  where `info.source[i]` is -1 or `i` is past its end. `codecInfo.network` is unchanged. `codecInfo.retimed` is
  absent.
- *Point 5*: stands, at the device's rate (`audio.js:1858` to 1861). The timeline cuts its own overshoot at
  `voiceLength`; with a room the tail follows as today.
- *Point 6*: stands, with section 2's bound. If the budget must shrink, `createRender()` refuses `'game'` as it
  refuses `retime`, and half a day is saved (decision 7; not recommended).
- *Point 7*: stands for c-2 and is replaced by c-3.
- New: **`opts.onMessage`**, the test hook of section 10d, is on W4-01b's list of hooks that only observe.

**The builder runs.**

- `pnpm test`. **Every entry of `GOLDEN` (76 cases, WAV and `codecInfo`) and of `GAIN_GOLDEN` passes unchanged.**
  The `'game'` cases of the order stand, with these added: loss 15% alone and loss 5% alone (BC-3); one room
  preset; `deviceRate` 44100; `miles` and `steam_48` (ignored: equal to their `'source'` hashes).
- Section 10d, restated for today's output stage. Renders of this section use `deviceRate: 44100`.
  - **A shift, where nothing else acts**: compared at the mix point (`opts.onGain`: the voice at 44.1 kHz), not
    in the output. As written, with these changes: there is no three-tap stage and no smear; a window that holds
    a packet's edge still has no single `d` (the dropped sample is inside it), so the second position stands.
    Re-measured at `fps: 150`: the queue stays between 224 and 394 ms after the first 2 s (seeds 1 to 10), with
    no fade, no overflow and one open, and 356 to 360 packets have ticks between 10 and 30 s (17.90 a second):
    the order's 340 to 375 stands. If the interpolator is in (decision 3), `===` becomes "equal to c-1's blend
    of the two neighbours". *2026-11-12: the interpolator is in: `===` becomes equal to c-1's blend.*
  - **The wiring is the module's**: stands, with `source` as section 3 and three lines added: the packets the
    hook receives are the `'source'` render's `onResampled` packets over 32768, in order, a refused one
    replaced by an empty one and a lost message absent; `codecInfo.sent.frameLog` and `frameBytes` equal the
    `'source'` render's `frameLog` and `frameBytes`; `codecInfo.network` is equal.
  - **The layouts**: as written, with a lead of 1 s and a tail of 1.5 s of the noise fixed. The capture filter
    is inside this pass's run, so the ranges below leave room only for the noise's own values. They are for the
    module as built today: **c-1 moves every offset by `(D before - D after) / 44.1` ms, and the builder shifts
    each range by that and says so.**

    | Line | Asked | Re-measured, seeds 1 to 50 (1 to 10) |
    | --- | --- | --- |
    | P: the 300 ms pause makes no spurt | every seed | 50 of 50 at both rates |
    | P: the 500 ms pause makes its own spurt in some seeds only; both cases among seeds 1 to 10, else 1 to 30 | as written | 24 of 50 (3 of 10: seeds 5, 7, 9; 16 of 30) |
    | P: when it does, that spurt is not `opened`; `offsetStartMs` at 300 fps | 0 to +105 | +23.4 to +83.4 (+42.3 to +51.5) |
    | the same at 67 fps | +60 to +190 | +85.1 to +168.1 (+114.0 to +125.7) |
    | Q at 300 fps: `spurts[1]` not `opened` | in at least 7 of 10 | 45 of 50 (8 of 10; 26 of 30) |
    | its `offsetStartMs` where appended | -320 to -160 | -303.4 to -177.3 (-297.2 to -177.3) |
    | Q at 67 fps: `spurts[1]` `opened` | every seed | 50 of 50 |
    | An `opened` spurt's `offsetStartMs`, both layouts, both rates | +10 to +110 | +24.7 to +95.3 |
    | P at 300 fps: `spurts[0].droppedMs` | 70 to 230 | 92.9 to 207.6 |
    | P at 300 fps: the spurt after 1200 ms is `opened`; its `droppedMs` | 65 to 155 | 86.5 to 133.8 |
    | Q at 300 fps: `spurts[0].droppedMs` | 60 to 145 | 83.6 to 124.9 |
    | Q at 300 fps: the spurt after 1200 ms is `opened`; its `droppedMs` | 65 to 150 | 86.5 to 128.5 |
    | 300 fps: `channel.drops` | not empty | 7 to 24 entries (seeds 1 to 10) |
    | 67 fps: every `droppedMs` 0, `drops` empty | every seed | 50 of 50 |

    The order's ranges that no longer hold: the 500 ms pause's -20 to +60, the 900 ms pause's -330 to -190 and
    its "8 of 10", "within 80 ms of the source" at 67 fps, and P's 60 to 210. The line "where it is appended,
    the codes begin `round(-offsetStartMs / 20)` slots earlier" stands.
  - **What a wrong build does.** The order's list is about broken senders, measured on a sender that is gone;
    the sender has been pinned by its own suite since W3-16, and this pass did not run broken senders again.
    Section 10d is about the wiring, so the builder shows one wiring break for each line: `source` without the
    pre-roll (the wiring line); a new timeline for each spurt (Q's `spurts[1]` is `opened` at 300 fps); `fps`
    not handed on (a `droppedMs` above 0 at 67); `bufferMs` not handed on (`codecInfo.channel.waitTicks` is 15
    and 60 at `bufferMs` 50 and 200); the gain not handed on, or made once (the next line); a tick taken from
    anything but the message (the wiring line's fresh timeline differs); the bound for `advance` one tick high
    (a chunked render throws) or left out (the streamed render holds everything back to the end: its `push`
    returns nothing while the source runs).
  - **The gain is reset where the engine resets it**: stands, with the run "at most 128 samples" (the first 128
    a new channel is given, less the packet's dropped first; the first pull no longer takes one and nothing
    smears) and **"at least 40 of them non-zero"** in place of 100. *Measured with the real codec, layout Q,
    noise at -40 dBFS, seeds 1 to 10: of samples 1 to 127 of the 40 opening packets, 53 to 91 are 2 units or more,
    which is what the mix entry keeps (median 61); with noise at -50 dBFS, 32 to 74.* At 67 fps `spurts[0]`,
    `[1]` and `[3]` of Q are `opened` and `spurts[2]` is appended, in every one of seeds 1 to 10.
  - **A late frame is not decoded silence**; the same seed, another seed, `lossPct` 20; the ignored cases
    (`miles` added) and the `RangeError`: stand.
  - **A lost message through the queue** (new; BC-3's build), with `opts.loseMessage`, each compared with the
    `'source'` render of the same loss by the shift check's rule: one message lost inside a long spurt at
    `fps: 150`: the channel is given one packet fewer, nothing opens, and on both sides of the gap a `d` fits,
    growing by one for each packet handed on (the concealed frames come with the next packet, so nothing closes
    up); a run of lost messages longer than 10 frames at 300 fps, short enough that the queue outlasts it (the
    fade may touch the samples just before the gap): after it `d` has grown by a further 882 for each frame
    nobody filled; a run that outlasts the queue at 67 fps: `opens` rises
    by one, with a gain reset; a message of more than 12 frames after 8 or more concealed ones: the hook sees
    an empty packet, `info.packets` counts it and `network.refusedMessages` is 1.
  - **W4-01b's suite**: `timeline: 'game'`, `fps` and `bufferMs` each changed with warm stages reuse the second
    kept place (its counter) and equal a fresh render by hash.
- The browser suite: the script is loaded on the page and in the render worker and is in the service worker's
  list. CI passes. The report's figures for the demo speech stand.

**Must not move in c-2**: the recorded hashes; `tests/voice-channel.verify.mjs`; W4-01b's existing cases; the
live chain's samples with and without the option; the three private runs below.

**The orchestrator runs privately.**

- Before and after, as written, with `net_loss15` added to `--only`: the four rows identical to the last digit.
- The Set G replay: unchanged from c-1's run.
- New, after: the speech take's source rendered with `timeline: 'game'` at 300 and 67 fps and tracked as the
  suite tracks a take. Expected: the render's own clock reads about 406 ppm fast inside spurts (section 6); the
  transitions and the start error are recorded on this first run and set no bar.
- New, after: the loss takes of Set C against `'game'` renders at their loss: lost runs a second and the share
  of silent time. *Measured privately: the take at 15% has 3.90 lost runs a second and 10.1% silent; a crude
  copy of the queue under the read rule gave 4.22 (3.80 to 4.58 over seeds) and 11.7% (4.2 to 17.4), and showed
  drops of 60 to 220 ms that the takes lack.* If the real channel still shows those drops, say so in PROGRESS:
  it is BC-3's first question for block 1.

**Stop and ask** (the two of the order, and): if a `'game'` render needs any statement of `steamTimeline`'s
`'source'` path changed; if the channel's blocks cannot be the mixer's with the origin at 0; if a kept place of
W4-01b would have to hold anything this order makes; if the bound for `advance` cannot be had without touching
`steam-sender.js`.

#### 6. The one sample dropped from every packet

The channel writes a packet's samples 1 to n-1 *(read: W3-03, the interpolator at fraction 0.999 writes n-1
samples; measured: finding 24, the takes run 404 to 416 ppm fast with no loss)*. It is in `createChannel.add`
since W3-02a (`voice-channel.js:137`), so **c-2 takes it by wiring the module**; until then the app models it for
no profile, as PROGRESS says. What it does:

- **Rate.** Re-measured: 17.90 messages a second, so 17.90 / 44100 = 406 ppm. Inside a spurt the sound runs
  that much fast against the source and the queue shrinks by 0.4 ms a second; each restart begins again.
- **Length.** None: the render keeps the source's length (point 5). The queue gets shallower; the output is not
  shortened.
- **The accuracy table's clock column** is the take's own drift against the source, found by tracking. The suite
  does not pass the option, so no row moves in c-2. A `'game'` render carries the 406 ppm itself, which the
  private run above reads.
- **A long unbroken spurt** (the gate off, or sound that never pauses) *(inferred from the model; no recording
  is long enough)*. Re-measured over 40 minutes, 8 seeds: the queue first falls under the fade's 100 ms after
  1.3 to 2.8 minutes at 67 fps, 3.1 to 4.4 at 100 and 11.3 to 11.7 at 300; the first underrun comes after 5.3
  to 6.5, 7.1 to 8.4 and 15.5 to 15.9 minutes; from then on there is an underrun every several seconds (58 to
  237 in the 40 minutes) and the channel restarts only when a packet comes a tick late. Over one 40 s spurt
  with the gate on, the queue's lowest and highest after the first 2 s (seeds 1 to 10): 96.5 to 277.3 ms at 67
  fps, 142.9 to 312.1 at 100, 224.2 to 393.4 at 150, 293.9 to 463.1 at 200, 361.0 to 488.4 at 300. So at 67
  fps the fade already touches some blocks of a long spurt.
- **The live chain** (c-3) gets the same drift in its queue; with a key held for minutes it reaches the fade as
  above.

#### 7. The frame rate the wait depends on

The wait is `waitTicks(bufferMs, fps)` ticks, the opening packet's own tick the first *(read: W3-03, section 1;
measured: 7, 10 and 30 lines in every one of 34 channels of Set G's logs)*: 90 ms after the opening packet at
66.67 fps, 135 ms at 100, 435 ms at 300. **c-2 needs the setting as an engine option only**: `opts.fps`, default
300 (`fps_max`'s default), limited to 10 to 1000. The page's control, its default and its words are W3-02d's, as
planned. One thing for d's words: the countdown loses one frame's duration per tick *(read)*, so the figure is the
frame rate the listener's game reaches, not the cap: a listener whose game runs under `fps_max` waits less
*(inferred)*.

#### 8. What W4-01b asks of these orders

Its claim holds. Its first kept place is the capture signal; its second is the codec stage's result: for `steam`
the sender's messages (their ticks among them), the decoded packets and what `codecInfo` is made from. Loss is
drawn before the second place; the resampler, the refusal, the gain and the channel all come after it. c-2 must:

- put `timeline`, `fps` and `bufferMs` on the list of options read only after the second place, and `onMessage`
  with the hooks that only observe (an unlisted option is in both keys: a missed reuse, never a stale render);
- write into nothing taken from a kept place: the decoded packets and their blocks are read only, and the played
  frame log is a new array;
- keep W4-01b's progress line in the loop, once per 64 messages;
- add the case to `tests/stages.verify.mjs` named above.

`createRender()` keeps nothing (W4-01b, item 8), so nothing applies there. For BC-4: `jitterMs` is on the list
"read after the first place" because the late frames are drawn in the codec stage; if BC-4 makes jitter a delay
of the arrival tick, it is then read after the second place and BC-4 moves it.

#### 9. W3-02c-3: the live chain

Not built until decision 1 is ruled. In `steamLiveChain` the packets go through `steamTimeline.add` with what was
given out (`audio.js:2171`) and come back by `take` (2193); the room mix is `createLiveRoomMix` (610), in
512-sample blocks from the chain's first mix sample; `spurtStarts()` is called at a spurt's opening message
(2163). With the channel: `D` is 0 (a monitor cannot play sound before it arrives), so the monitor gains the
wait itself, 90 ms at 67 fps to 435 ms at 300, on top of today's delay; the channel's blocks are the room mix's;
`spurtStarts()` moves to the channel's opens; the rules for a packet behind what was given out (1494 to 1503)
are not used; `createTimeline` gets a form with no fixed `length`; `live-worker.js` loads the script (line 26)
and already hands the chain the page's render options (line 121). Its check is BC-1's, re-stated: the chain's
output equals the `'game'` render's, moved by the render's `D`, with and without loss.

#### 10. BC-3 and BC-4

**BC-3 (loss through the queue): its build is folded into c-2.** Under `'game'` a lost message is not handed to
the channel, and that is all there is to build: the draining, the fade, the padding and the restart are the
channel's already, and the checks are in section 5. What stays as BC-3 is a private check and one small tool
change: `tests/voicequeue/log-to-fixture.mjs` must pass over the dropped-packet lines the new log carries (its
rule "two other lines in a row begin a new session" would cut the log apart). It is checked against **block 1**
of the run sheet of 2026-11-11 (lost packets counted; takes at loss 5 and 15 and at `fps_max 67`; placed drops
of 1 to 32 packets): the block's `bufsize` lines replayed tick for tick with its own dropped packets.

**BC-4 (jitter as arrival times): stays an order of its own, after c-2.** It needs things c does not have: a
delay for each packet, in order, from lag and jitter (`j = min(net_fakejitter, lag / 2)`, *read: the
bad-connections plan*); a new meaning for the jitter control, since jitter without lag does nothing in the game;
several packets on one tick in the log tool; and the retiring of the late-frame fit, which moves every recorded
hash with jitter and so needs its own "must move" and "must not move" lists. It is checked against **block 2**
(lag 100 with jitter 50; a 400 ms lag spike; the same at 67 fps). c-2 leaves it one seam: the arrival tick is
taken in one place, where the packet is handed to the channel.

#### 11. Open decisions

Each with the recommendation and what it rests on.

1. **Does the live monitor run the channel, with the game's delay?** (the owner's). Recommended: yes, as c-3,
   after the ruling; until then the chain ignores the option. Rests on: the wait is read and measured (section
   7); that a monitor 90 to 435 ms later is wanted is not known.
2. **The zero.** Recommended: c-1 adds the mean time from a packet's last sample to its arrival (about 53 ms,
   re-measured, section 4) to the delay taken out, so a restarted spurt sits on the source in the mean, as "The
   model" says it should. Cost: an opened spurt then starts between about 28 ms early and 42 ms late where today
   it is 25 to 95 ms late, so a source that begins with sound can lose up to about 28 ms of its head in some
   seeds. The other way: leave the zero, and take the mean out in the private check only. Rests on: measured
   on the model (the figures above; PROGRESS has the merged sender's messages about 32 ms later than the old
   one's); the zero is no rule of the game.
3. *Settled 2026-11-11: TF2's own routine agrees; W3-02c-1 built item 4 (see "As built").* **The interpolator's arithmetic.** As built the ring keeps samples 1 to n-1 unblended, on the ground that the
   blend is "under the 16-bit step" ("The model", the table). A private run of 2026-11-11 of the 2006 and 2007
   engines' own routine in an emulator gives each written sample as `s[k] + (s[k+1] - s[k]) x fraction`,
   truncated toward zero, the fraction starting at 0.999 and carried on *(measured: 3,590 of 3,590 and 7,190 of
   7,190 samples equal; on a slow sine 1,753 samples equal the next sample and 1,837 are one unit away; on
   full-scale noise up to 66 units away; a fraction held fixed is wrong on 1 of 7,190)*. For TF2's own file the
   fraction and the n-1 writes are read (W3-03); its rounding to 16 bits was neither read nor run. Recommended:
   the orchestrator runs TF2's routine the same way first; if it agrees, c-1 builds it from the private
   findings (the carrying of the fraction between packets is written there) and the table's row is corrected;
   if it is not run before c-1, c-1 leaves the samples unblended and the row says "up to one unit on about half
   the samples, more on steep sound; not built". Rests on: read (count and fraction), measured on older engines
   (arithmetic), inferred for TF2.
4. **The fade's product** is carried as a float and rounded to the nearest where it enters the mix (`mixSample`,
   `audio.js:356`); how the engine brings it to 16 bits was not read. Recommended: leave it, listed as
   unverified; the run of decision 3 can settle it. Rests on: inferred; at most one unit, and only over the
   last 100 ms before a queue runs dry.
5. **A refused message at the channel.** Recommended: an empty packet on its tick (it keeps a channel in use
   and can open one). Rests on: measured once (section 3); what the engine does with Steam's refusal was not
   read (W3-16's read, section 3). Block 1 can settle it.
6. **`D` on whole blocks** (recommended) or the mixer's origin moved under `'game'`. Rests on: read (the pulls
   are the mixer's blocks); `D` is the model's own, so rounding it changes nothing of the game, and the origin
   stays one constant for the render and the live chain.
7. **`createRender()` streams `'game'` in c-2** (recommended) or refuses it until an app file calls it (none
   does today). Rests on: W2-02's rule that the two are equal; the bound of section 2 is the only new part.
8. **A late frame under `'game'`**: keep the stand-in until BC-4 (recommended), so the decoder's input and
   W4-01b's second kept place are the same on both timelines. Rests on: finding 9 as corrected (jitter loses and
   conceals nothing, *measured*); so the stand-in is known to be wrong on both timelines and is BC-4's to
   retire.
9. **Section 10d's ranges** as tabled in section 5. Rests on: re-measured, 50 seeds.
10. **No `spurtStart()` at a channel's open in a render** (recommended; c-3 adds it live). Rests on: read from
    `room-dsp.js`; no sample depends on it.

**Rulings of 2026-11-11 (the orchestrator; each is the owner's to reverse).**

1. The live monitor: c-3 is built after c-2, with the channel as a setting of the monitor. Whether it is on by
   default there is asked of the owner; it holds nothing before c-3.
2. The zero: as recommended. c-1 adds the mean arrival time to the delay taken out, as one named constant. c-2's
   report says how much of a source's head and tail a `'game'` render loses over its seeds; whether such a render
   may be longer than its source, as a render with a room is, is decided with W3-02d.
3. The interpolator: as recommended. TF2's own routine is run privately first (both of the owner's builds of the
   engine); c-1 starts on items 1 to 3 and takes item 4 when that run has handed back. The measurements quoted in
   decision 3 come from running a module on signals of our own and may stand here.
4. The fade's rounding: the same private run looks at it; if it stays unread it is listed as unverified.
5. A refused message is an empty packet on its tick. 6. `D` on whole blocks. 7. `createRender()` streams `'game'`
   in c-2. 8. The late-frame stand-in stays until BC-4. 9. Section 10d's ranges as tabled. 10. No `spurtStart()`
   per channel in a render.

BC-3's build is folded into c-2 and BC-4 stays an order of its own after it, as section 10 says.

**As built: W3-02c-1, merged 2026-11-12** (`docs/reports/W3-02c1-channel-as-read.md`). What c-2 builds on:

- All five items of section 4 are in. Decision 3 is settled: TF2's own routine, run on both builds, blends and
  truncates as the 2006 and 2007 engines do, so the interpolator is built (item 4), and the fade's arithmetic is
  known (decision 4): single precision, truncated toward zero. "The model"'s table has the rows as built.
- `createChannel` works in whole 16-bit units. `createTimeline` multiplies its gain's output by 32768 going in
  and divides by 32768 coming out, so c-2's contract (the resampler's Int16 over 32768) is unchanged; whatever
  is handed to the channel that is not whole is truncated in the blend.
- **The zero has two parts, kept apart.** `ARRIVAL_SECONDS` is 50.5 ms: the mean arrival after the message's
  first captured sample (the sender's `start`), measured over 455 spurts. `createTimeline` takes `codecDelay` in
  seconds (default 0): what the caller has already taken off each `source` for its codec. **c-2 passes
  `codecDelay: lookahead / codecRate` (156 / 24000)**, since it pushes `source = round((start - lookahead) x
  44100 / 24000)`; then `D` is 13312, 15360 and 24576 samples at 66.67, 100 and 300 fps. Without the option a
  render at 300 fps would sit 11.8 ms late (the review's blocking finding).
- The offsets of section 5's table move with `D`: by -51.86, -53.29 and -45.67 ms at 66.67, 100 and 300 fps
  against the old `D`, and by one more block at 300 fps with the codec's delay. c-2's planner re-derives its
  ranges from the suite's measured values, not from the table as written.
- The orchestrator's private runs on the merged module: the Set G replay matches the game on every tick of six
  sections; `tests/retiming.mjs --engine` on the speech take reads 47% of transitions and a start error of
  122 ms (129 before; between 110 and 130 the work goes on).
- Left stale by this order and owed to a later one: `tests/voicequeue/reference-channel.mjs` still carries the
  unblended copy and the old fade (the suite adapts around it; its header says so), and W3-02a's report
  describes the old arithmetic.

#### 12. Not settled here

- The monitor's delay (decision 1): the owner's.
- What a refused message does to a channel, and Steam's own concealment against the bundled library's: block 1.
- Whether the game really fades and pads a long unbroken spurt as section 6 infers: it would take a recording of
  several minutes of steady sound at `fps_max 67` with the channel's log on. It is not on the run sheet.
- How a `'game'` render of the speech take scores (the private run after c-2), and whether the 60 to 220 ms
  drops of the crude copy of the queue survive in the real channel.
- ~~The rounding to 16 bits of the blend and of the fade in TF2's own file (decisions 3 and 4).~~ Settled: truncated toward zero, single precision (see "The model").
- The broken senders of the order's list were not run again on the merged sender (section 5).

#### 13. For the orders after this one

- **W3-02d.** `tests/accuracy.mjs` renders with the page's own `renderOptions()` (lines 99 and 100). When d makes
  `'game'` the page's default every row of the accuracy table would move: d pins `timeline: 'source'` in that
  suite, or the suite first learns to track a render on the game's timeline. The live monitor is handed the
  page's options too (`live-worker.js:121`): until c-3 the chain ignores `timeline`. The page's `retime` control
  (`id="retime"` in `index.html`, `voice_retime` in `app/console.js`) and `'game'` together are a `RangeError`: the page
  must not send both. `opts.fps` is the frame rate reached (section 7).
- **W3-02e** reads `codecInfo.frameLog` (played) and `codecInfo.sent` (sent) as point 4 leaves them.
- **W3-02f** removes `retimeSpurts` (`audio.js:941`) and its three call sites (1767, 1805, 2730).
- **W3-02g** lifts point 3's `received` case; the decoder's 17-frame cut is still its.

## W3-02d: the page: controls, the default, the words

**Branch:** `claude/w3-02d-timeline-page`, from `main` **after W3-02c**. **Time budget:** 1 day. Decided
(PROGRESS, 2026-11-10): on the page the modern preset renders the game's timeline; a video keeps the source's;
the flat rule is retired (W3-02f removes its code).

> **Now comes after (2026-11-10, `docs/reports/W3-plan-maintenance-2.md`).** Built after W3-17d, which this
> order used to precede. Its plan holds; the page it edits is another page:
> - W3-16 added "Sender's Steam has been running"; W3-11b made the threshold's default the profile's own and
>   re-worded the gate's texts; W3-10 added the listener's device rate and the render is at that rate;
>   W3-17d rebuilt the listener's places, added `DEFAULT_LISTENER`, renamed `PRESETS.sewers` to `underwater`
>   and put every control that is not the game's into one fieldset, "Extras: not in the game", with a list
>   the browser suite carries.
> - **So this order classifies its three controls as W3-17d's rule asks**: `fps_max` and `voice_buffer_ms`
>   are the game's (name shown); `voice_timeline` is an extra and takes `voice_retime`'s place in the
>   fieldset; the suite's list is updated in the same commit.
> - Spec 2's reason for the other presets taking `source` ("their codecs or rooms are unverified") is half
>   gone: the rooms are the engine's by then. What is left is the codec: the engine codecs ignore the
>   option. The brief says which presets on `steam` with a room take `game`.
> - A render may now carry a room's tail and `codecInfo.room`; the console line of spec 4 and the A/B note of
>   spec 5 are unaffected.

> **Also since W4-01a and W4-01d (2026-11-12, `docs/README.md`):**
> - (a) Each new control goes into one of W4-01a's lists, `PRESET_SET_FIELDS` or `KEPT_ACROSS_PRESETS`
>   (`app/core.js`), and into the browser suite's `CONTROLS_GAME`, `CONTROLS_PCS` or `CONTROLS_EXTRAS`
>   (`tests/browser.verify.js`). `retime` is in `PRESET_SET_FIELDS` and in `CONTROLS_EXTRAS` today.
> - (b) A saved `retime` also lives in the remembered settings and the user presets (`tf2ve_settings`,
>   `tf2ve_presets`: `app/console.js`, `app/boot.js`). The alias of spec 1 must read both.
> - (c) Every new control gets a help sentence (`class="control-help"`) and passes W4-01d's walk over the help.
> - (d) Section 13 of the amendment says d pins `timeline: 'source'` in `tests/accuracy.mjs`, but the Files below
>   do not allow that file. Add `tests/accuracy.mjs` (its `renderOptions()` merges).
> - (e) The A/B switch is now "Hear (B): Rendered | Original" (`index.html`, decision 23). Spec 5's note goes
>   beside that group.

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

> **Now comes after (2026-11-10, `docs/reports/W3-plan-maintenance-2.md`).** Built after W3-17d. Its plan
> holds. What it will find: a render at the device's rate that may end in a room's tail (W3-10, W3-17c), so
> a drop's `time` is in source seconds and the lane's width is the render's; `codecInfo.room` beside
> `codecInfo.channel`; a live recording's codec lane in 20 ms slots by what was laid (W3-11b). The real-take
> check keeps the frame model (W3-11's decision 9).

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

> **Now comes after (2026-11-10, `docs/reports/W3-plan-maintenance-2.md`).** Built after W3-17c and W3-17d.
> Its plan holds. What it will find: `retimeSpurts` has two forms since W3-11a's fix round (the frame
> path's, and the `steam` path's that moves each spurt's laid samples whole): both go; `tests/verify.js`
> section [5c] has a check of the second ("re-timing on the steam path moves a spurt's laid samples
> whole"), which goes with 10c; W3-17c left `createRender` refusing `retime`, alone or with a room, and that
> refusal goes here; W3-17d lists `voice_retime` among the extras until W3-02d replaces it.

**The builder runs:** `pnpm test`; the golden hashes unchanged; `grep -n "retime" audio.js` finds nothing; the
browser suite (the alias `voice_retime` still works: it is the page's); CI. W2-04's point 2 (streaming the flat
rule) is then void: say so in the report so the orchestrator notes it in PROGRESS. Nothing private.

## W3-02g: a demo's own packets

**Branch:** `claude/w3-02g-demo-packets`, from `main` **after W3-02c, W3-06 (both change `demo.js`) and
W3-02f**. **Time budget:** half a day.

> **Now comes after (2026-11-10, `docs/reports/W3-plan-maintenance-2.md`).** The last order of the
> sequence. **It needs a planner's pass before it is built**, on the first point below.
>
> - **Which decoder a demo's voice goes through.** W3-11a left a demo's received voice on the old path
>   (`demo.js`'s own decode and the app's sinc resampler), and the spec below takes each message's samples
>   as a range of one decoded signal. Under `'game'` it then asks for "16-bit, by W3-11a's decoder rules":
>   that is `createSteamDecoder` fed the demo's own frames, message by message. The planner says which path
>   a demo takes on each timeline, and what `from` and `to` mean when the decoder conceals inside a message.
> - **The decoder's 17-frame cut is this order's** (W3-16's read, section 3; W3-16's order, "not here"): one
>   record's 24 kHz buffer holds 17 frames, concealed ones included; a frame that would be the 18th is not
>   decoded, its number is spent all the same, and the rest of the record is skipped. Only a demo's own
>   packets can reach it (an opening of 6000 samples behind a pre-roll; numbers that ran on over frames
>   never collected, across key presses). It is a rule of the record, so it sits where a record's frames are
>   given to `createSteamDecoder`. **`opus-codec.mjs` is missing from this order's files.**
> - **The game's 12-frame refusal** (W3-02c's note) applies to a demo's messages as to the model's: a 17-frame
>   opening is decoded and never heard.
> - **Sequence numbers** are the demo's own 16 bits, given to `receive(seq, packet)` as they are; the decoder
>   masks.
> - **The decoder outlives channels and key presses, as the resampler does** (measured, Set J): one decoder
>   and one resampler per speaker for the whole demo; only an end marker in the demo or a number behind the
>   expected one resets the decoder. An empty packet (the end marker alone, at a key press) resets it, holds
>   no sound, and in the game still opens a channel: it is pushed with an empty `pcm`.
> - **The gain is reset at each channel the timeline opens**, as in W3-02c, with the settings read then.
> - Under it by then: W3-10's mix stage and device rate, and W3-17c's room path at the mix, as in W3-02c's
>   note. A demo's render can carry a room like any other.

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
and the record as that many zeros through the same resampler. **One resampler per speaker for the whole demo:**
it is made at the speaker's first message and never reset after, not at an end marker, not when the speaker's
channel is assigned again and not across a gap in the demo (finding 29: on Set G Steam kept it across
reconnects; the 16-sample flush happens once). The timeline's `source` is as in W3-02c's spec 2 (the decoded
position at 44.1 kHz; -1 for a record), and the gain object is W3-02c's *(rewritten in
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
