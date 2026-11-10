# W3-02: the receiver's voice channel, as the engine runs it

Replaces the draft `W3-02-queue-retime.md` (written before the engine was read). Four orders, each leaving main
working: **W3-02a** the channel as a pure, tested module; **W3-02b** the render and the stream run it behind an
option; **W3-02c** the page, the default and the words; **W3-02d** a demo's own packets. The plan behind them, the
measurements and the open decisions are in `docs/reports/W3-02-plan.md`.

**Agents:** `tf-builder`, then `tf-reviewer`; W3-02b's diff also gets a second reader on the stronger model (it
changes how a render is computed). Each may push its branch to run CI. Worktrees are given in the briefs.

## Why

Since W3-03 the receiver is no longer a fitted rule. A speaker's voice goes into a 0.5 s ring; a new channel waits
`voice_buffer_ms` counted down by one frame's duration per 15 ms tick, so the wait follows the listener's frame
rate; a spurt that arrives before the ring is found empty is appended; overflow drops the oldest sound; one sample
is dropped from every packet; the last `voice_fadeouttime` of the queue is faded. The owner's console logs (Set G:
five sections at 67, 100 and 300 frames a second, 9,808 ticks) agree with that rule on every tick (the plan's
report, "The replay"). The app has none of it: a render keeps the source's timeline, and `voice_retime` moves spurts
by a flat 41% rule that the takes refute.

## The model (all four orders)

Everything below is for the Steam profiles (`steam`, `steam_48`: voice rate 44100 Hz, the mixer's rate). The engine
codecs keep the source's timeline until a log under `vaudio_celt` exists (their sender is the engine's own recorder,
and their ring is 1 s or 2 s).

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
| `mixBlock` | 512 samples; the first block after a start takes 513 | the logs (every pull is 512 or a multiple; 16 of 16 first pulls seen are 513 or 1025) |
| `sender` | see "The sender's packets" | the logs and the Set D demo |

**`waitTicks(bufferMs, fps) = ceil(clamp(bufferMs, 1, 5000) / 1000 x clamp(fps, 10, 1000) - 1e-6)`**: 7 at 66.67,
10 at 100, 30 at 300. The packet's own tick is the first. (The logs: 7, 10 and 30 lines before the queue can fall,
in every one of 34 channels; a third of the 300 fps channels show the first fall one or two lines later, which is a
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
    if not playing: left -= 1; if left <= 0: playing = true; firstPull = true
pull(n):                                    # the mixer wants n samples; returns exactly n
    if not (inUse and playing): return n zeros
    if firstPull: discard one sample from the ring; firstPull = false
    got = ring.read(min(n, ring.count)); after = ring.count
    if after < fade: for i in 0..got-1: r = (got - 1 - i) + after; if r < fade - 1: got[i] *= r / (fade - 1)
    if got < n: append the last min(got, n - got) samples of got once more, then zeros up to n
    if ring.count == 0: starved = true
```

**The clock** that drives it in a render: tick `k` is at time `1323 k`, mixer block `b` at `1024 b`. Events run in
time order; a block that starts before a tick runs before it, one that starts on it runs after it. A packet with
arrival time `t` seconds is added on tick `ceil(t / 0.015)`. Block `b` is output samples `512 b - D` to
`512 b - D + 511` of the 44.1 kHz voice signal, where `D = round(44100 x latency)` and
`latency = min(0.5, (waitTicks - 1) x 0.015 + 0.16)`: the delay at which a restarted spurt plays (0.25 s at 67 fps,
0.295 s at 100, 0.5 s at 235 and above), taken out so that a restarted spurt sits where the source has it. Output
before sample 0 or past the render's length is dropped.

**Exact, and approximated.**

| Part | In the model | Why |
| --- | --- | --- |
| Ring size, overflow dropping the oldest | exact | read; every logged add |
| One sample dropped per packet | exact in count; the kept samples are the packet's samples 1..n-1 | the engine blends each with 0.001 of its neighbour (an interpolator at fraction 0.999): under the 16-bit step |
| The countdown | exact for a steady frame rate | the game's frame times vary and a hitch shortens the wait; the input is one number |
| Append, with the one-tick grace; freed when found empty | exact | read; one grace case and 34 opens in the logs |
| The fade | exact law; the product is not rounded to 16 bits | the render carries floats |
| Underrun padding | exact law | read; not seen in a log (it changes samples, not counts) |
| The gain reset when a channel is assigned | W3-02b resets to today's start state; W3-05 makes it the engine's | W3-05 |
| When the mixer pulls | approximated: a block every 512 samples | in the game the pulls follow the frames (a tick sees 0, 1 or 2 blocks, 7% see none); it matters by at most a block (11.6 ms) at a full or a nearly empty ring |
| Ticks | approximated below 67 fps: evenly spaced | there several ticks run in one frame |
| Five channels, other speakers | not modelled | one speaker |

## The sender's packets

A source file has no packets, so the render makes them up from the codec's frame log (which frames the gate sent).
What is known, from the Set G logs (2,375 packets) and the Set D demo (1,816 messages):

- **Deterministic:** a packet holds whole 20 ms frames in order (882 samples each at 44.1 kHz); a spurt's sound
  arrives in real time after its first packet; the end of a spurt is followed by one more packet, the silence
  record; at most one packet is added per tick.
- **Drawn (seeded):** how many frames open a spurt (8 in 17 of 23 openings after a pause, 6 in 4, 7 and 9 once each); which
  frames each later packet holds (3 frames in 65%, 2 in 14%, 4 in 11%, 1 in 10%) and its tick (3, 4 or 5 ticks
  after the one before: 41%, 49%, 10%); the silence record's length (62.5 ms in 39 of 47, 31.25 ms in 8).
- **Unknown:** what in Steam decides the pieces (its client is not among the owner's files); Steam's own hold
  (425 to 485 ms) and pre-roll (115 to 152 ms), which the gate model fixes at 440 and 120; why the takes' silences
  on speech run about 50 ms longer than the gate model's (W3-01). These decide which pauses near 0.4 s close, so a
  render will not match a given take pause for pause.

**The sender model** (`VOICE_CHANNEL.sender`). `F` is the frame's duration (0.02 s), frame `j` ends at `(j + 1) F`
in the source's time. For each talk spurt, frames `s..e`:

1. Draw `u1`: the opening holds `k0 = 8` frames if `u1 < 0.77`, 6 if `< 0.92`, 7 if `< 0.96`, else 9; never more
   than the spurt has. Draw `u2`: it arrives at `(s + k0) F + 0.020 u2`.
2. Hand-outs follow at `h_i = (s + k0) F + 0.056 i`, `i = 1, 2, ...`. For each, draw `u3, u4, u5` (always all
   three): the packet holds the unsent frames that end at or before `h_i - 0.010 u3 - (u4 < 0.1 ? F : 0)`; if there
   are none, no packet; else it arrives at `h_i + 0.020 u5`, and not on an earlier tick than one after the previous
   packet's.
3. After frame `e` is sent, at the next hand-out draw `u6, u7`: the silence record arrives at `h + 0.020 u6`
   (the same tick rule) and is `round(0.0625 x 44100)` zeros if `u7 < 0.85`, else `round(0.03125 x 44100)`.
4. A frame the loss model lost or made late (frame codes 5 and 6) is not a packet: its samples (the concealment, or
   zeros) ride at the front of the next packet that holds a received frame, or of the silence record, as Steam's
   decoder hands concealment out with the packet that reveals the gap.

The random source is `mulberry32((seed ^ 0x51ED270B) >>> 0)`, drawn in exactly that order, so a seed gives one
schedule and the loss pattern (drawn from `seed` itself) does not move. This model was fitted to the logs' table of
ticks and frames (it is within 28 percentage points, summed over the table, of the 300 fps log; it makes too few
one-frame packets); it is the part of the render that is a model and not a reading. No empty packet is made: that
is a key press, and a file has none.

## W3-02a: the channel as a module, proved against the logs

**Branch:** `claude/w3-02a-voice-channel`, from `main`. **Time budget:** 1 day. **May run beside** W2-02, W3-04 and
W3-06 (it adds files; the one shared line is `package.json`'s `test` script: merge main in before the last push).

### Files

May add: `voice-channel.js`, `tests/voice-channel.verify.mjs`, `tests/voicequeue/log-to-fixture.mjs`,
`tests/voicequeue/README.md`. May touch: `package.json` (the `test` script), `tests/retiming.mjs` (a new `--engine`
flag only). If the orchestrator's brief says the owner has agreed: `tests/voicequeue/setg.json`, which the
orchestrator hands over (see "The log fixture").

May not touch: `audio.js`, `constants.js`, `opus-codec.mjs`, `index.html`, `sw.js`, `app/`, the workers,
`docs/PROGRESS.json`, `tests/REFERENCE_2026.md`.

### Spec

1. **`voice-channel.js`**, in the form of `demo.js` (an IIFE that sets `module.exports` under Node and
   `root.TF2VoiceChannel` elsewhere; no imports). It exports `VOICE_CHANNEL`, `waitTicks`, `latency(bufferMs, fps)`,
   `createChannel`, `createSender` and `createTimeline`.
2. **`createChannel({ fps, bufferMs, fadeTime, gain })`** is the pseudo-code above, with samples: `add(pcm, tag)`
   takes a `Float32Array` (and an optional number kept with its samples); `tick()`; `pull(n)` returns
   `{ samples, tags }` (`tags`: for each sample the tag of the packet it came from, -1 for padding and silence);
   read-only `inUse`, `playing`, `starved`, `count`, `opens`, `dropped` (samples lost to overflow) and `drops` (a
   list of `{ at: samples pulled so far, count, tag }`). `gain` is `{ process(pcm) -> pcm, reset() }`; without one,
   samples pass unchanged. The ring is a preallocated `Float32Array(22050)` with a parallel tag store; no array
   grows with the audio.
3. **`createSender({ frameSeconds, rand })`**: `frame(sent, missing)` is called once per codec frame in order
   (`sent`: the gate sent it; `missing`: lost or late) and returns the packets that became known, each
   `{ tick, frames: [first, last] or null, silence: samples or 0 }`; `finish()` returns the rest. It is the sender
   model above and nothing else. A packet is known as soon as its last frame is, so the sender never waits for
   more than the frames it has.
4. **`createTimeline({ fps, bufferMs, fadeTime, seed, gain, frameSamples: 882, frameSeconds: 0.02, length })`**
   joins them on the clock above: `pushFrame(pcm or null, code)` takes a codec frame's 882 voice-rate samples
   before the gain (null when the gate did not send it) with its frame code, and returns the output samples that
   became final (a `Float32Array`, possibly empty; the output is final up to the last block before the earliest
   tick a packet not yet known could land on); `finish()` returns `{ samples, info }` with the rest, cut or padded
   with zeros to `length`. `info` is `{ timeline: 'game', fps, bufferMs, waitTicks, latency, packets, opens,
   appended, droppedSamples, drops: [{ time, ms }], spurts: [{ start, end, opened, offsetStartMs, offsetEndMs,
   droppedMs }], played: Uint32Array }`: `offset` is how much later than the source a spurt's first and last played
   samples came out (negative: early); `played[i]` is the index of the codec frame heard at the centre of output
   frame `i` (20 ms slots), or `0xFFFFFFFF` for silence.
5. **The log fixture.** `tests/voicequeue/log-to-fixture.mjs <console log> <frames a second> [<name>]` reads a
   console log made with `voice_showincoming 1; voice_showchannels 1` and prints a section of the fixture: a flat
   list of pairs `[kind, value]` with kind 0 a new session, 1 a packet of `value` decoded samples, 2 the mixer
   wanting `value` samples before the next tick, 3 a tick after which the channel holds `value` bytes (-1: free).
   It keeps only the two kinds of `Voice -` line and counts, so no name, path or identifier can pass through it.
   The rules it needs (the plan's report, "The replay", has the reasons and a prototype's results to compare with):
   a mixer demand is the fall between two tick lines, in samples; while a new channel waits (`waitTicks` lines
   from the packet that opened it) the demand is made up, 512 and 1024 in turn, so that a model that plays early
   fails; where an add lands on 44100 the demand is the largest of 1024, 512, 0 that the bytes allow; a channel
   whose queue ran out between two lines and whose next packet starts a wait was freed on a tick that printed
   nothing (kind 3, value -1); one whose next packet is drained at once was kept (the grace); a run of two or more
   other console lines is a new session. It stops with a message, not a guess, when a line breaks these rules.
   `tests/voicequeue/README.md` says how to make a log and a fixture.
6. **`tests/retiming.mjs --generative --engine [--fps 300]`** adds a third model beside the queue and the rule in
   section 2 (free running): each take's gate-model spurts through `createSender` and `createChannel` (no audio:
   tags only), 200 seeds unless `--seeds` says otherwise, scored like the others (a spurt's offset is its
   `offsetStartMs` taken 0.2 s into the spurt, its end `offsetEndMs`). Without `--engine` the output is byte for
   byte what it is now.

### Done means

- `node tests/voice-channel.verify.mjs` passes and is in `pnpm test`. Each check below fails when its line of the
  model is broken; say how you broke it and what failed.
  - **The logs, if the fixture is committed.** For every section of `tests/voicequeue/setg.json`, with the
    section's `fps`: driving `createChannel` with the events (1: `add` of that many zeros; 2: `pull`; 3: `tick`),
    `2 x count` equals the logged bytes on every tick and the channel is free where the log printed nothing: 9,808
    ticks, no mismatch. The same replay must fail with the ring one sample larger or smaller, with `waitTicks`
    one more or one less in the 67, 100 and first 300 fps sections, with the dropped sample kept, and with the
    grace removed.
  - **A synthetic log** (always run): the test writes a console log in the game's format from a seeded run of the
    module's own channel under a mixer of its own that pulls 0, 512 or 1024 samples a tick at random (two opens,
    an append, a grace, an overflow, an empty packet, a second session), puts it through `log-to-fixture.mjs`,
    and the replay matches every tick. A log with a line changed by 2 bytes makes the tool or the replay fail.
  - `waitTicks`: 7, 10, 30 at 66.67, 100, 300; 15 at 300 with `bufferMs` 50; the limits (1 at 5 fps: frames are
    capped at 0.1 s).
  - **By hand, 300 fps:** a packet of 7056 on tick 0, then 2646 every 4 ticks: the channel plays from tick 29,
    `count` is 22050 from the seventh packet (tick 24) on, and `dropped` at the first pull is
    `7055 + 7 x 2645 - 22050 = 3520`.
  - **By hand, 67 fps:** the same packets: plays from tick 6 with 9700 queued, nothing dropped.
  - Fade: a queue of exactly 4410 constant samples pulled to the end ramps linearly to 0 over its last 4410
    samples (sample with `r` behind it is `r / 4409`), and a queue of 8820 leaves its first 4410 untouched.
  - Underrun: 300 samples queued, a pull of 512 returns them, their last 212 again, then zeros; `starved` is set;
    a `tick` then frees the channel; an `add` before that tick keeps it, with no wait.
  - Sender: over 2,000 spurts of 3 s, the shares of 1, 2, 3 and 4-frame packets are within 0.03 of what the
    committed model gives today (record them in the test from the first run and say them in the report; the plan's
    prototype gave 0.02, 0.26, 0.64, 0.08, and 0.34, 0.53, 0.12 for 3, 4 and 5 ticks between packets); every frame is sent once and in order; no packet arrives before its
    last frame ends; two seeds differ and one seed repeats.
  - Timeline: a source with silences of 300, 500 and 1200 ms between 2 s spurts, at 300 fps: over 50 seeds the first
    spurt's `offsetStartMs` is within 60 ms of 0, the spurt after 300 ms is early by 200 to 270 ms and not
    `opened`, the ones after 500 and 1200 ms are `opened` and lose 40 to 140 ms to overflow; at 67 fps every spurt
    is `opened`, none starts more than 60 ms from the source and nothing is dropped (the plan's prototype: +13 to
    +55 ms, -259 to -210 ms, 40 to 136 ms; at 67 fps -32 to +52 ms); `pushFrame`
    in any grouping of calls gives the same samples as one pass (push the frames one at a time, then compare with
    a run that calls `finish()` only after all: `===`).
  - The 400 ppm: over a 60 s spurt at 67 fps (no overflow), the offset at the spurt's end less the offset one
    second in is between -25 and -23 ms (one sample for each of about 17.9 packets a second: 405 ppm, the accuracy
    suite's "clock"); at 300 fps it is that or lower (later overflows add to it; the prototype gave -44 to -24).
- `pnpm test` passes; CI passes on the pushed branch.
- The orchestrator runs `node tests/retiming.mjs --accuracy <results.json> --generative --takes <folder> --engine`
  and the build report quotes its section 2. Expected from the plan's prototype (100 seeds): the speech take 50% of
  transitions right and a start error near 96 ms (source timeline: 11% and 150 ms), the Set C baseline 72% and
  95 ms (33% and 88 ms), the four Set B test-signal takes and sender A worse than leaving them (80 to 114 ms
  against 29 to 83). **Stop and report** if the speech take's start error is above 130 ms.
- The report says which of the model's parts it could not test and why.

### Stop and ask

- If the committed fixture cannot be reproduced on every tick: do not adjust the model to fit; report the first
  mismatching tick with the ten events before it.
- If the pseudo-code and the fixture disagree about an order of events inside a tick.

## W3-02b: the render and the stream run the channel, behind an option

**Branch:** `claude/w3-02b-timeline-option`, from `main` **after W2-02 and W3-02a have merged**. **Time budget:**
1 day.

### Files

May touch: `audio.js` (`process()` and `createRender`: one new stage; a gain object; the option), `index.html`,
`sw.js` (the new script in `ASSETS`; raise `CACHE`), `audio-worker.js` and `live-worker.js` (`importScripts`),
`tests/verify.js` (how it loads the scripts; a new section 10d), `tests/render-stream.verify.mjs`,
`tests/predictions/PREDICTIONS.md` (the hashed-file note). May not touch: `constants.js`, `opus-codec.mjs`,
`reference.js`, `app/`, `tests/accuracy.mjs`, `tests/predictions/predictions.json`, `docs/PROGRESS.json`.

### Spec

1. **The option.** `opts.timeline`: `'source'` (the default, and anything else) or `'game'`; `opts.fps` (300) and
   `opts.bufferMs` (100). With `'source'` nothing in this order runs: every render is bit for bit what main gives.
2. **Where it runs.** With `'game'`, a Steam profile, the codec on and no `opts.received`: after the resampling to
   the voice rate, the voice signal is cut into the codec's frames (frame `f` is samples `882 f - o` to
   `882 f - o + 881` with `o = round(lookahead x 44100 / codecRate)`; samples before 0 are zeros) and each is given
   to `TF2VoiceChannel.createTimeline` with its frame code (`null` samples for a gated frame). Its output replaces
   the auto-gain's (stage 4); the mixer stage and everything after are unchanged. The timeline's `gain` is the
   auto-gain as it is today, made an object: `process(pcm)` applies it sample by sample with the block position
   carried across calls (the same arithmetic as `receiverAutoGain`: factor the per-sample and per-block lines into
   one helper that `receiverAutoGain`, `streamAutoGain` and this object share, and show the first two unchanged by
   their existing tests), and `reset()` returns to the state `receiverAutoGain` starts in. With `agc: false` the
   gain object multiplies by `voice_scale` and clips to int16, as stage 4 does now. W3-05 changes the arithmetic;
   this order does not.
3. **What `'game'` leaves alone or refuses.** With an engine codec (`celt_22`, `celt_44`, `speex`), the codec
   bypassed, or `opts.received` (until W3-02d), `'game'` is ignored and `codecInfo.channel` is
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
   `createLiveChain` ignores `timeline`. (The plan's report says why and what a later order could do.)

### Done means

- `pnpm test` passes. **W2-02's golden hashes pass unchanged** (they are renders without the option): the proof
  that the default did not move. `tests/render-stream.verify.mjs` gains `'game'` cases with equality as in point
  6: the default Steam render of its speech-like source at 300, 100 and 67 fps; `bufferMs` 50 and 200; loss 15%
  with jitter; `agc` off; `voice_scale` 0.5; chunk sizes 7, 960, 12,345 and the whole source; and their
  `process()` hashes are added to the golden list.
- `tests/verify.js` section 10d, each check failing when its line is broken (say how):
  - `'game'` at 300 fps on the source of section 10c (or one built like it: spurts with silences of 300 and
    900 ms): the spurt after 300 ms starts early by what `codecInfo.channel.spurts` says, and the samples of its
    steady part equal the `'source'` render's at the shifted position after both pass the same gain state (use
    `agc: false` for this check, where the gain has no state);
  - with `agc: false` and one spurt of 60 s, sample `n` of the `'game'` render 30 s in equals sample
    `n + shift` of the `'source'` render with `shift` equal to the packets added so far (the one sample each);
  - the first 100 ms of a restarted spurt's pre-roll is missing at 300 fps and present at 67;
  - the same seed gives the same samples; another seed moves at least one drop; `lossPct` 20 gives the same loss
    pattern (`codecInfo.sent.frameLog`) with and without `'game'`;
  - the ignored cases of point 3, and the `RangeError`.
- The accuracy suite does not see the option. Before and after, under the heavy lock:
  `flock /tmp/tf2ve-heavy.lock env CHROMIUM_EXECUTABLE=... node tests/accuracy.mjs --takes <folder> --only
  take4_my_own_speech,sender_A,net_baseline --json <scratch>/after.json`: the three rows are identical to the
  baseline's to the last digit printed.
- The browser suite passes (the new script loads on the page and in both workers; a render still works offline:
  the service worker's list).
- CI passes on the pushed branch.
- The report gives, for the app's demo speech at seeds 1, 2 and 3 and 300 fps: how many spurts opened a channel,
  how many were appended, the largest early start, and the milliseconds dropped per restart; and the render's time
  against `'source'`.

### Stop and ask

- If equality between `createRender` and `process()` needs the stage to behave differently in the two.
- If a golden hash moves.

## W3-02c: the page, the default and the words

**Branch:** `claude/w3-02c-timeline-page`, from `main` **after W3-02b**. **Time budget:** 1 day. **May run beside**
W3-05 (no shared files). **Before it starts** the orchestrator writes the owner's answers to the plan report's
"Decisions left" into the brief: the default for audio, the default for a video, and whether the flat rule goes.
The spec below is the plan's recommendation.

### Files

May touch: `index.html`, `app/core.js`, `app/console.js`, `app/render.js`, `app/visualizer.js`, `app/realtake.js`,
`app/netgraph.js`, `batch.js`, `sw.js` (the cache version), `README.md`, `tests/browser.verify.js`. With the flat
rule's removal: `audio.js` (`RETIME`, `retimeSpurts`, the `retime` option), `tests/verify.js` (section 10c),
`tests/render-stream.verify.mjs` (the `retime` rejection). May not touch: `voice-channel.js`, `constants.js`,
`reference.js`, `tests/REFERENCE_2026.md` (the orchestrator pastes the plan's text), `docs/PROGRESS.json`.

### Spec

1. **Console variables**, each linked to a control in the advanced panel as the others are (`app/console.js`,
   "Linked cvars"): `fps_max` (a number, 10 to 1000, default 300; help: "The listener's frames a second: TF2
   counts voice_buffer_ms down by one frame per 15 ms tick, so a phrase after a pause waits about fps x 1.5 ms");
   `voice_buffer_ms` (1 to 5000, default 100; the game's own help text); `voice_timeline` (`game` or `source`; not
   a TF2 setting, said so in its help and in README as `voice_retime` is now). They map to `opts.fps`,
   `opts.bufferMs`, `opts.timeline` in `app/render.js`, and are saved and restored with the other settings
   (`CONFIG_FIELDS`). `fps_max` in the game is a cap; the control's title says to enter the rate the game runs at.
2. **The default.** `exec preset_modern` and a fresh page set `voice_timeline game`, `fps_max 300`,
   `voice_buffer_ms 100`. The other presets keep `source` (their codecs or rooms are unverified, and the engine
   codecs ignore the option). **With a video as the source the page sets `source`** and says once in the console
   that the picture cannot follow the game's timing (the sound would lead the lips by up to 0.35 s after a pause);
   the user may switch it back. The engine's own default (`process()` with no option) stays `source`, so the
   tests, the golden hashes, the accuracy suite and the registered predictions are untouched.
3. **`voice_retime`** stays as an alias (`1` sets `voice_timeline game`, `0` `source`) with a console line saying
   so. If the owner agrees, the flat rule goes: `RETIME`, `retimeSpurts` and `opts.retime` are removed, section
   10c is replaced by 10d, and `createRender`'s rejection of `retime` goes with it. (W2-04's point 2, streaming
   the flat rule, is then void; the orchestrator notes it in PROGRESS.)
4. **What the page says after a render with `game`:** one console line from `codecInfo.channel`: channels opened,
   spurts appended and the largest early start, milliseconds dropped at restarts, the frame rate and the wait in
   ticks. The chain strip's Receiver cell says "queue at 300 fps" in place of "spurts re-timed".
5. **A/B and loudness match.** The A/B switch plays source and render at the same playhead; with `game` the
   render runs up to about 0.35 s ahead after a closed pause. The loudness match compares whole-file loudness
   (`app/meter.js`; check that it does, and say so) and is unaffected. Next to the A/B switch, when the render
   used `game`, a short note: "TF2 timing: phrases after short pauses start early; for a sample-aligned A/B set
   Timing to Source". No other change to A/B.
6. **The visualizer** draws the codec lane and the frame hover from `codecInfo.frameLog`, which W3-02b re-times
   to the sound; check the lane against a render with a 300 ms pause (the frames of the early spurt sit under its
   sound) and mark each drop in `codecInfo.channel.drops` on the lane (a tick mark; hover: "ring overflow, N ms
   skipped"). `net_graph` keeps the sender's counters.
7. **The real-take check** (`app/realtake.js`) lines a take up against the source spurt by spurt and is not
   changed by the option; its wording about "256-sample (5.8 ms) skips" (lines 140 to 148) is corrected to what
   W3-03 found: one sample per packet and ring overflow, no 256-sample step. With `game` it also prints, from
   `codecInfo.channel`, the render's own early starts beside the take's.
8. **Video output** with `game` chosen by hand: the sound keeps the source's length, so the file's duration and
   the picture are untouched; say in the console how far the sound leads at most. Batch renders (`batch.js`)
   take the page's setting like any other.
9. **README:** the receiver paragraph, the settings table (`fps_max`, `voice_buffer_ms`, `voice_timeline`), what
   is and is not a TF2 setting, and the limits: the packets' timing is a model; which pauses near 0.4 s close is
   not predictable; the frame rate is the listener's.

### Done means

- The browser suite passes with new checks, each failing when broken: a fresh page and `exec preset_modern` give
  `voice_timeline game`; another preset gives `source`; loading a video sets `source` and says why;
  `voice_retime 1` sets `game`; `fps_max 67` changes the render (its `codecInfo.channel.waitTicks` is 7); the
  settings survive a save and restore; the A/B note shows only with `game`.
- `pnpm test` passes, with section 10c gone or kept according to the owner's answer.
- CI passes on the pushed branch.
- Screenshots (desktop and phone) of the advanced panel and of the lane with a drop marked, in the report.

## W3-02d: a demo's own packets

**Branch:** `claude/w3-02d-demo-packets`, from `main` **after W3-02b and W3-05**. **Time budget:** half a day.

A demo has the real packets and their ticks, so nothing is made up. **Files:** `demo.js` (`decode` also returns
`packets`), `app/source.js` (passes them in `received`), `audio.js` (the `received` path under `'game'`),
`tests/demo.verify.mjs`, `tests/verify.js`. **Spec:** `speakers()` keeps each voice message's index on its
packets; `decode` returns `packets: [{ tick, from, to, silence }]`, one per message: the demo tick it was written
on, the range of decoded samples it holds (`from`, `to` in the decoded signal, at the codec's rate) and the
silence record's samples at the stream's rate (0 if none; the record is not in the decoded signal). Under
`'game'`, `process()` and `createRender` feed the channel these packets in place of the sender model: arrival tick
`tick - first tick` scaled by the demo's tick length to 15 ms ticks, the samples resampled to the voice rate, the
record as zeros. `codecInfo.channel.packets` is then `'demo'`. SourceTV writes voice every fourth tick, so arrival
is known to 60 ms and two messages can share a tick; that is the path's limit and is said in the console line.
**Done means:** the synthetic demo of `tests/demo.verify.mjs` (extended with a pause of 300 ms and one of 900 ms
between spurts) renders under `'game'` with the first appended and the second restarted; `createRender` equals
`process()`; with `'source'` a demo renders bit for bit as on main. The orchestrator runs the Set D demo through
it at 300 fps and the report gives each of sender A's 17 observable transitions beside the take's (the plan's
prototype, with messages merged per tick, gave the early starts after spurts 6 and 9 at -298 and -295 ms against
-324 and -306 in the take, and missed the two that sit at the 60 ms resolution).
