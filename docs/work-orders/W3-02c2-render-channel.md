# W3-02c-2: a render runs the receiver's voice channel, behind an option

**Status 2026-11-12: built, reviewed and read a second time (no blocker from either); a fix round is running; not merged**; after W3-02c-1, W4-01b and S3-02a, all merged.

*Written 2026-11-12 by a planner's pass on `main` at `622673c` (cache v37). This is the order a builder builds
from. It takes the place of section 5 of the "Amendment of 2026-11-11" in
[W3-02-receiver-queue.md](W3-02-receiver-queue.md) ("the amendment" below), which was written against `audio.js`
before S3-02a moved the engine into `engine/`. The amendment's sections 2, 3 and 6 keep the reasons, and this
order points to them. Where the two differ, this order rules.*

*A figure marked "prototype" was measured on 2026-11-12 on a patched copy of the engine in the planner's scratch
folder, in Node on one four-core machine. The copy is not in the repository, so the builder measures each such
figure again and the report gives the builder's.*

**Kind:** engine. It changes what a render plays when the option is on, and nothing when it is off.
`tf-builder` (effort high), then `tf-reviewer`, then the second reader on the stronger model that
`docs/PIPELINE.md` asks for where an order changes how renders sound.
**Branch:** `claude/w3-02c2-timeline-option`, from `main`. **Worktree:** given in the brief.
**Report:** `docs/reports/W3-02c2-render-channel.md`.
**Budget:** 14 hours of building. At 14 hours the builder stops, pushes what passes and reports what is left.

**Commands** (CLAUDE.md has them). A suite or a group runs by name, `node tests/run.mjs <name>`. On a shared
machine every suite run goes through the lock, `flock /tmp/tf2ve-heavy.lock <command>`.

## Rulings of 2026-11-12 (the orchestrator)

These settle what the planner left open. They win over the text below where the two differ.

1. **The value is `'game'`.** The module's `info.timeline`, the amendment and W3-02d's text say it; the plan's
   brief wrote `'channel'` loosely.
2. **Refused, never ignored**, on every row of section 2's table. `TF2Audio` gains no member in this order: how
   the page learns where the option is offered is W3-02d's.
3. **An unknown value of `timeline` throws.**
4. **The three names join `AFTER_B_OPTIONS`.**
5. **No `opts.onMessage`.**
6. **`live-worker.js` gains the name now.** The live monitor's worker loads the module and never calls it;
   check 10 holds that.
7. **The new suite `render-channel`, in the group `engine`**, and the recorded `'game'` cases in `render-stream`.
8. **`previewAllowed` is not changed here.** W3-02d decides again when the page offers the option.
9. **`voice-channel.js` does not join `MODEL_FILES` of `tests/accuracy.mjs` here.** The order that first scores a
   `'game'` render adds it.
10. **The stop lines stand**: more than 6 s added to a ten-minute render, or a peak more than 100 MB above the
    `'source'` render's.
11. **S3-02b is being built at the same time.** It changes `tests/harness.verify.mjs` (two refusals in the
    checks of the split), the code of `sw.js` (not `ASSETS`), `tests/static-server.js`, `tests/browser.verify.js`
    (a new check beside the service worker's), `tests/README.md` and `tests/predictions/PREDICTIONS.md` (a dated
    paragraph). The builder of this order starts from `main` as it is, merges `origin/main` before the hand-back
    and keeps both sides' lines; a conflict that is more than two added lines side by side is a stop.

## Intent

In the game a speaker's voice waits in a queue before it plays (findings 22 to 25 of `tests/REFERENCE_2026.md`,
read and measured). The app has that queue as `voice-channel.js`, with its own suite, and no render runs it.
This order puts it into `TF2Audio.process` and `TF2Audio.createRender` for the `steam` codec, behind
`opts.timeline: 'game'`. It also builds BC-3: a lost message is not handed to the channel.

With the option absent every render is today's, bit for bit. The page does not offer the option (W3-02d, not
built yet). The live monitor does not run it (W3-02c-3, not built yet).

## The amendment's section 5, statement by statement

| Section 5 says | Today | This order |
| --- | --- | --- |
| Branch `claude/w3-02c2-timeline-option`; budget 2 days | the branch stands | 14 hours: the module, the kept stages and the lists' checks exist |
| May touch `audio.js` (`steamTimeline`, `process()`, `createRender()`, `gainRule`, `createGain`) | the code is in `engine/steam.js`, `engine/render.js` and `engine/render-stream.js`; every line number is void | those three files; `engine/gain.js` is not touched |
| `createGain`'s `reset` takes the settings; `tests/gain.verify.mjs` gains a check | not needed | the gain object makes a new `createGain` at each `reset()`, the second form the order allowed |
| `sw.js`: `CACHE` raised by one | the orchestrator sets the cache number at the merge | the builder adds the file to `ASSETS` and leaves `CACHE` |
| `tests/verify.js` (the loader; a new section 10d) | the loader is `tests/lib/engine.cjs`, the one list | the list gains the module; the checks go to a new suite |
| `tests/render-stream.verify.mjs` (the script list) | that suite holds no list | it gains recorded `'game'` cases only |
| May not touch `live-worker.js` (c-3 loads the script there) | `tests/harness.verify.mjs` holds that worker's `importScripts` to the one list | `live-worker.js` gains the one name; the live chain still does not run the channel |
| Point 1: any other value of `timeline` is `'source'` | does not hold | any other value is a `RangeError` |
| Point 2, with sections 2 and 3: where the channel enters, what is pushed, `source`, the resampler, the gain object, the rounding with `agc: false`, a late frame | holds; the place is `steamTimeline.add` in `engine/steam.js` | as "What is pushed" below |
| Section 2: "`finish()` gives the samples" | does not hold: `push` and `advance` each return the output that became final, and `finish()` returns only the rest | `process()` keeps every return |
| Point 3: `'game'` is ignored on the other codecs, with `codecInfo.channel = { timeline: 'source', reason }`; `retime` then runs as today | replaced | refused with a `RangeError` (below) |
| Point 4: the played logs, `codecInfo.sent`, `codecInfo.network`, no `codecInfo.retimed` | holds | as written |
| Point 5: the length, at the device's rate | holds | as written |
| Point 6: the stream, with section 2's bound for `advance` | holds; the bound is shown from the sender's code (below) | as written |
| Point 7: the live chain ignores the option | holds | `engine/live-chain.js` is not touched |
| New: `opts.onMessage`, a test hook on the observers' list | dropped | the test builds what is pushed itself, so no hook hands the engine's objects out |
| Section 2: `MIX_BLOCK_ORIGIN` stays 0; no `spurtStart()` at each channel; two comments corrected | holds | the comments are in `engine/mix.js` and `engine/room.js` |
| Not said: where the options are read, the fast preview, `opts.signal` | since W4-01b every option is read once, in `readOptions`, and the kept stages have keys | section 1 below: the three names join `AFTER_B_OPTIONS` |
| "Every entry of `GOLDEN` (76 cases)" passes unchanged | holds, without the count | as written |
| `'game'` cases for `miles` and `steam_48` (both not in TF2) equal their `'source'` hashes | void | those renders are refused; a check asks for the error |
| The shift check: 340 to 375 packets, the blend | holds (prototype: 356, 358 and 360 at seeds 1, 2 and 3) | as written |
| The layouts' table | every offset moved when W3-02c-1 set the channel's zero | the ranges of "The layouts" below |
| The gain's reset: a run of at most 128 samples, at least 40 non-zero | 127 at most (prototype: 60 to 89 non-zero, in runs of 67 to 96) | at most 127, at least 40 |
| "The bound one tick high: a chunked render throws" | only where a message's tick meets the bound; on the default seed in pieces of 960 it does not (prototype) | the check uses seed 1, the gate off and small pieces |
| A lost run over 10 frames: the shift grows by 882 for each frame nobody filled | also by the refused packet's frames, and by what the full ring drops (prototype) | the check asks for the counts and a lower bound |
| The orchestrator's private runs | hold | restated under "The orchestrator runs privately" |
| Stop and ask (four cases) | hold, with file names for line numbers | restated, with more |

## Spec

### 1. The option

Three names: `timeline`, `fps`, `bufferMs`. `readOptions` in `engine/render.js` reads each once, as it reads the
others. `createRender` in `engine/render-stream.js` reads its options from `opts` itself, and reads these the
same way.

| Name | Values | Default |
| --- | --- | --- |
| `timeline` | `'source'`, `'game'`; `undefined` and `null` are `'source'`; anything else is a `RangeError` that names the value | `'source'` |
| `fps` | the listener's frames a second; handed to the module as read, which takes its own default and range | 300, the module's (read) |
| `bufferMs` | `voice_buffer_ms`; handed on the same way | 100, the module's (read) |

**The value is `'game'`,** as the amendment, the module's `info.timeline` and W3-02d's text have it (ruling 1).

**The keys.** The channel runs after the kept stage B: it takes B's messages and decoded packets and changes
nothing in them. So the three names join `AFTER_B_OPTIONS`, which puts them in neither key and in
`READ_OPTIONS`. A render from warm stages with any of the three changed takes B and equals a fresh render
(prototype: equal, and `stageKeys` is the same for both timelines). Nothing this order makes is kept in A or B.

**`previewAllowed`** is not changed. The page's fast preview is the first seconds of the clip, rendered alone.
Under `'game'` the output at a moment depends on packets that arrive up to `D` later, and `D` is at most 0.557 s
(inferred from the module's limit on its wait). The preview drops its last second, so the claim holds
(prototype: the first 14 s of a render of the first 15 s equal the whole render's at 300 and 66.67 fps, at
`bufferMs` 5000, with the gate off, with `agc` off and at `deviceRate` 44100; the two stay equal to at least
14.74 s).

**`opts.signal`** needs no new code in `process()`: the loop over B's messages already pauses once in 64
messages and sees a stop there. `createRender` has no signal today and gains none.

### 2. Where `'game'` runs, and where it is refused

`'game'` runs for the `steam` codec with the codec on and no `opts.received`. Everywhere else it is refused:

| Asked with `timeline: 'game'` | Result |
| --- | --- |
| `celt_22`, `celt_44`, `speex` | `RangeError` |
| `steam_48` (not in TF2), `miles` (not in TF2) | `RangeError` |
| the codec bypassed (`enableWarble: false`) | `RangeError` |
| a demo's received voice (`opts.received`) | `RangeError` |
| `retime` on, where `'game'` would run | `RangeError` (the two timelines exclude each other) |

One function in `engine/steam.js` decides this, and both renderers call it at entry, before any work and before
`createRender`'s own refusal of `retime`. Each message names the option and the reason. The older codecs have no
sender model and their ring is another size (the amendment, section 2). An option that was asked for and did
nothing would let a caller compare two renders that are one render; an error cannot. A refusal also moves no
recorded hash.

### 3. Where the channel goes

In terms of the kept stages: stage A is the capture, stage B the sender's messages with their ticks and the
decoded packets, lost messages already drawn. The resampler, the refusal of a long packet, the gain and the
laying come after B, in `steamTimeline.add`. The channel goes there.

**`engine/steam.js`.** `steamTimeline(cfg)` takes one more member, the channel. With none, `add` is today's
code, statement for statement. With one:

- These run as they are: the counts, the spurt's anchor, `onDecoded`, the resampler's one call a message,
  `onResampled`, the packet's place `cursor + 882 x skipped`, the refusal test, `mark` (the sent frame log), the
  cursor and the spans.
- These do not run: the gain's block and `lay`. The packet goes to the channel instead.

The module is found as `steamModules()` finds the sender, and a render that asks for `'game'` without it loaded
throws an `Error` that names the file.

**What is pushed**, to `TF2VoiceChannel.createTimeline`'s `push({ tick, pcm, source })`, with `tick` the
message's own:

| The message | `pcm` | `source` |
| --- | --- | --- |
| sound, arrived | the resampler's `Int16Array` over 32768, whole | its place, `cursor + 882 x skipped` |
| a silence record, arrived | its resampled zeros | -1 |
| arrived, with no samples (an end message with no frames) | empty | the cursor |
| refused (over 11,264 samples) | empty | its place |
| lost | nothing is pushed | |

**The timeline** is made with `length: voiceLength`, `fps`, `bufferMs`, `codecDelay: lookahead / 24000` and the
gain object.

**The gain object** is `{ process, reset }`:

- `reset()` makes a new `createGain({ avgGain, maxGain, scale: voiceScale })`. The channel calls it at each
  open, which is where the engine resets its gain (finding 26, read).
- `process(y)` runs the gain over the packet. A late frame's samples pass around it, as in `add` today: frame
  `j` of `F` is samples `round(j n / F)` to `round((j + 1) n / F)`.
- With `agc: false` there is no gain: the object gives each sample the whole 16-bit value the source's timeline
  brings to the mix entry. That is the product with `voiceScale` in single precision, clipped to ±32767/32768 as
  stage 4's `hardClip` clips it, times 32768 rounded to the nearest whole value with ties to even as `mixSample`
  rounds it, over 32768. Stage 4's own scale and clip is then not run. The amendment's section 5 has the reason.
  *(Corrected 2026-11-12 after the build and the second read: this said "rounds ..., clips to 16 bits", which
  read literally (the product in double, a clip to -32768..32767) differs from the source's timeline by one
  unit on up to 24,577 of the 65,536 inputs at the scales tried; the rule above differs on none, measured.)*

**`engine/render.js`, `process()`.** Under `'game'` it makes the channel beside `steamTimeline` and gives
`steamTimeline` no `capacity`, since nothing is laid. It keeps what every `push` returns and what `finish()`
returns, in order, in one array of `voiceLength` samples. That array stands where
`timeline.take(voiceLength)` stands. `opts.onGain` receives it. The mix stage, the room, the output stage and
the length are untouched.

**`engine/render-stream.js`, `createRender()`.** The same channel. After each chunk's messages are added it
calls `advance(bound)`, with

`bound = max(lastTick + 1, ceil((given / 24000 + relay) / tick))`

where `given` is the count of 24 kHz samples handed to the sender, `lastTick` the tick of the last message made,
and `relay` and `tick` the sender's constants (0.002 and 0.015 s, read from `steam-sender.js`). No later message
has a lower tick: a read's `since` is never before the end of its capture step, and a message's tick is
`max(lastTick + 1, ceil((since + relay) / tick))`. `push` returns what the channel's pushes and the advance
gave, joined. `flush` returns the rest from `finish()`. The stream holds back the channel's delay `D` and
little more (prototype: at most 24,435 voice samples at 300 fps, where `D` is 24,576, and 13,171 at 66.67 fps,
where `D` is 13,312).

**`codecInfo` under `'game'`.**

| Member | Holds |
| --- | --- |
| `frameLog`, `frameBytes` | the played logs: new arrays of the sent logs' length; slot `i` takes sent slot `floor((channel.source[i] x 80 / 147 + lookahead) / 480)`, or 0 where `channel.source[i]` is -1 or `i` is past its end |
| `sent` | `{ frameLog, frameBytes }`, the logs a `'source'` render gives |
| `channel` | the module's `info`, whole |
| `network` | as on the source's timeline, equal |
| `retimed` | absent |

A `'source'` render's `codecInfo` gains no member.

**The two comments.** `engine/mix.js`, above `MIX_BLOCK_ORIGIN`, says W3-02c will set the origin to its channel
clock's blocks: it will not, because `D` is a whole number of blocks. `engine/room.js` says W3-02c will call
`spurtStart()` at each channel it opens: c-3 does, where the listener can change rooms. The builder corrects
both. No code line of either file changes.

### 4. Loss

`lossPct` and `opts.loseMessage` choose the lost messages before stage B, so the same messages are lost on both
timelines, the decoder conceals the same frames, and `codecInfo.network` is equal. The timelines differ in what
the lost time becomes:

| | `'source'` (BC-1) | `'game'` (BC-3) |
| --- | --- | --- |
| a lost message | its place stays; the decoder conceals up to 10 frames in front of the next message | not pushed; the concealed frames arrive in the next packet |
| frames nobody filled | 882 silent samples each | no time: the next packet joins the queue's end, so the sound plays earlier |
| a refused packet | its time passes | an empty packet on its tick |
| a gap longer than the queue | silence | the queue fades over its last 100 ms and runs dry; the next message opens a new channel, with a new wait and a gain reset |

`codecInfo.sent.frameLog` shows a lost or concealed frame where the source had it. `codecInfo.frameLog` shows it
where it played. The amendment's section 3 has the whole table of what stays of BC-1.

### 5. The module joins the engine's lists

`voice-channel.js` is added, right after `steam-sender.js`, to each of these: the script tags of `index.html`,
`importScripts` in `audio-worker.js` and in `live-worker.js`, `ASSETS` in `sw.js`, and `ENGINE_FILES` in
`tests/lib/engine.cjs`. `tests/harness.verify.mjs` holds the page and both workers to that list, and
`tests/site.verify.mjs` holds `sw.js` to the page's files (prototype: both pass unchanged on a copy with the
five edits, and fail with any one left out).

The harness's check that the sender and the resampler attach themselves gains `TF2VoiceChannel`, and so does
the loader's comment that names them.

### 6. Documents that say no render runs the module

The builder corrects each to "a render runs it when `opts.timeline` is `'game'`; the page does not offer it":
`README.md` (the table of files), `docs/VOICE-PATH.md` (the table's row 7 and the paragraph under "The voice
channel"), `docs/ACCURACY.md` (the row that says "not in a render yet"), `tests/README.md` (the suite's row,
the list under "How the suites load the engine", and a row for the new suite). `tests/predictions/PREDICTIONS.md`
gains a "Changed after registration" note: three engine files changed and `voice-channel.js` is loaded; no
prediction asks for `'game'`, so none can move. `tests/miles.verify.mjs` reads `README.md`: run it after that
edit.

## Files

**May touch:** `engine/steam.js`, `engine/render.js`, `engine/render-stream.js`; `engine/mix.js` and
`engine/room.js` (the two comments only); `index.html`, `audio-worker.js`, `live-worker.js`, `sw.js` (the one
name each); `tests/lib/engine.cjs` (the list and its comment); `tests/harness.verify.mjs` (the one check named
above); `tests/render-channel.verify.mjs` (new); `tests/run.mjs` (its row: name `render-channel`, group
`engine`); `tests/render-stream.verify.mjs` (new cases and their entries in `GOLDEN` and `GAIN_GOLDEN`);
`tests/stages.verify.mjs` (`ENGINE_OPTION_NAMES`, `EXTRA_OPTION_CASES`, section 4);
`tests/browser.verify.js` (the check that the page and the live monitor's worker load the sender and the
resampler gains the module); the documents of section 6; the report.

**May not touch:** `voice-channel.js` and `tests/voice-channel.verify.mjs`; `steam-sender.js`; `opus-codec.mjs`;
`engine/gain.js` and `tests/gain.verify.mjs`; `engine/live-chain.js`; `engine/network.js`, `engine/codec.js`,
`engine/dsp.js`; `audio.js`; `room-dsp.js`; `constants.js`; `reference.js`; `app/`; `tests/accuracy.mjs`;
`tests/predictions/predictions.json`; `CACHE` in `sw.js`; `docs/PROGRESS.json`, `docs/PROGRESS-LOG.md`,
`docs/README.md`; any existing entry of `GOLDEN` or `GAIN_GOLDEN`; any existing check of any suite.

## What it must not do

- The page does not offer the option: nothing under `app/` changes, and no control of `index.html` does.
- The live chain does not run the channel. A chain made with `timeline: 'game'` gives the samples of one made
  without.
- No recorded hash moves.
- `voice-channel.js` is not edited. If a render shows a defect in it, the builder stops and reports the input
  that shows it.
- No option is silently ignored: `'game'` runs or throws.

## Done means

Each check fails when the thing it names is broken. For each line the report says what was broken and what the
check printed, as the amendment's "What a wrong build does" asks. Renders of the new suite use `deviceRate:
44100` and compare the voice at the mix point (`opts.onGain`).

**Nothing moved.** `flock /tmp/tf2ve-heavy.lock node tests/run.mjs all` passes. Every existing entry of `GOLDEN`
and `GAIN_GOLDEN`, every existing case of `stages` and the whole of `voice-channel` pass unchanged; the diff of
the test files shows lines added and none changed, except the two checks named under "Files".

**The new suite**, `node tests/run.mjs render-channel` (`tests/render-channel.verify.mjs`; it follows `TF2_DIR`
as `render-stream` does, so a reviewer can point it at a broken copy):

1. **The render is the module's.** The test makes its own reference. It takes the sender's messages and the
   codec's results from a `'source'` render by wrapping `engine.codec.steamRoundTrip` (the pattern of
   `tests/steam.verify.js`) and that render's `onResampled` packets. With its own code for the place, the
   refusal, `source`, the late spans and the gain object, it drives `createTimeline` from `voice-channel.js`,
   loaded by the test. The `'game'` render's voice equals the reference sample for sample, and
   `codecInfo.channel` equals the reference's `info`, member for member. Settings, at least: 300, 100 and 66.67
   fps; `bufferMs` 50 and 200; the gate off; `agc` off; `agc` off with `voiceScale` 0.5; `voiceScale` 0.5; loss
   5%, 15% and 40%; loss 15% with jitter 100 ms; jitter 200 ms at 66.67 fps; loss 60% at 66.67 fps (prototype:
   equal at each). Breaks to show: `source` without the look-ahead; a tick not the message's; a lost message
   pushed as an empty one; a refused packet not pushed; the gain made once; the rounding left out with `agc`
   off; `fps` or `bufferMs` not handed on (`channel.waitTicks` is 15 and 60 at `bufferMs` 50 and 200).
2. **The logs.** `codecInfo.sent.frameLog` and `frameBytes` equal the `'source'` render's `frameLog` and
   `frameBytes`; `codecInfo.network` is equal; the played logs equal the slot rule of the table above, worked in
   the test.
3. **One sample dropped from every packet** (finding 24, read and measured). A 40 s spurt of noise at 44.1 kHz,
   `agc` off, `fps: 150`. Away from a packet's edge a single shift `d` makes the `'game'` voice equal to the
   module's blend of two neighbours of the `'source'` voice, `trunc(a + (b - a) x 0.999)`, over 200 samples. *(Corrected 2026-11-12: the module carries its fraction
   from packet to packet and it drifts from 0.999 by parts in 10^13 (measured: 0.9990000000000236 after a packet
   of 882 samples, 0.9989999999997963 after 2,646), so where `b - a` is a non-zero multiple of 1000 the
   truncation can fall on either side; the check accepts both there and one value everywhere else.)*
   `d` at 30 s less `d` at 10 s is within 2 of the count of packets with ticks between, and lies between 340
   and 375 (prototype: 356, 358 and 360 at seeds 1, 2 and 3, against 356, 357 and 359 packets).
4. **The layouts: the early start and the overflow** (findings 19, 21 and 22). Layouts P and Q as the amendment
   fixes them, seeds 1 to 10, at 300 and 66.67 fps, read from `codecInfo.channel.spurts` and `drops`. The
   ranges are under "The layouts" below.
5. **The gain is reset at each open.** Layout Q with its noise at -40 dBFS, `voiceScale: 0`, 66.67 fps, seeds 1
   to 10: `opens` 3 and `gainResets` 3; the voice is zero except one run after each open, at most 127 samples
   long with at least 40 non-zero (prototype: 60 to 89 non-zero, in runs of 67 to 96); the appended spurt adds
   none. Break: the gain made once.
6. **Loss through the queue** (BC-3), with `opts.loseMessage`, against the `'source'` render of the same loss:
   - One message lost in a long spurt at `fps: 150`: `network.lostMessages` 1, `opens` 1, and on both sides of
     the gap `d` grows by one for each packet handed on, to within 2 (prototype: steps of 72, 35 and 71 against
     71, 35 and 71 packets).
   - Messages lost for 0.26 s of ticks at 300 fps: `opens` stays 1, `network.refusedMessages` is 1, and `d`
     grows across the gap by at least 882 for each frame nobody filled and each frame of the refused packet
     (prototype: 14,362 against 882 x 16; the rest is packets handed on and what the full ring dropped, which is
     inferred, not printed).
   - Messages lost for 1.5 s of ticks at `fps: 150`: `opens` 2 and `gainResets` 2. **The fade at the queue's
     end:** before the silence the voice is the plain blend at one shift, then 4,410 samples that are the faded
     blend, `trunc(f(f(1 - f(j x step)) x v))` with `j` from 0 and `step` the module's, then less than a block
     of padding, then zeros until the new channel plays (prototype: a crude follower fitted 4,407 of the 4,410,
     with about 150 samples of padding). The check asks for at least 4,400 of the 4,410. It is run at 150 fps
     because at 66.67 fps the queue is short enough that the fade touches ordinary play.
7. **The stream's bound.** Seed 1, the gate off, a 24 kHz source, in pieces of 10, 48 and 480 samples:
   `createRender` under `'game'` gives `process()`'s samples and `codecInfo`. With the bound one tick high the
   same render throws (prototype). With `advance` left out, `push` returns nothing while the source runs *(corrected
   2026-11-12: false with the gate off, where a message comes with every chunk and each `push` returns the blocks
   before its tick; the line is run with the gate on, where only `advance` gives anything out during a pause,
   and also on a 48 kHz source, so that a bound counted at the source's rate fails)*; the
   check asks that, in pieces of 960 at `deviceRate: 44100`, the samples returned so far never fall more than
   `D + 2,048` behind the source given, counted at 44.1 kHz. The prototype counted inside the engine, after the
   capture stage, and read 141 samples under `D` at both rates; the builder counts from outside and reports
   the figure.
8. **The refusals.** Each row of the table in section 2 throws a `RangeError` whose message names `timeline`,
   from `process()` and from `createRender()`; so does `timeline: 'gmae'`. `timeline: 'source'`, `null` and
   `undefined` give the default render's hashes.
9. **The same seed twice gives the same render; another seed gives another.**
10. **The live chain.** A chain made with `timeline: 'game'` gives the samples of one made without.

**`node tests/run.mjs render-stream`.** New cases in `CASES`, each under `'game'`, with their hashes in `GOLDEN`
and `GAIN_GOLDEN` (printed by `--hashes`): the default at 300 fps; 66.67 fps; the gate off; loss 15% with jitter
50 ms; `agc` off with `voiceScale` 0.5; one room preset; `deviceRate` 44100. The steam cases' chunk plans apply
(7, 960, 12345, whole), so the suite's own sections hold each case's stream to `process()` and its model of the
output stage to the render (prototype: equal on each).

**`node tests/run.mjs stages`.** `ENGINE_OPTION_NAMES` gains the three names. `EXTRA_OPTION_CASES` gains
`timeline: 'game'` changed alone on the page's defaults, and `fps` and `bufferMs` each changed alone on a base
with `timeline: 'game'`: each takes B and equals a fresh render. Section 1 then covers the new recorded cases.
Section 4 gains `'game'` among the settings the preview is allowed for, at 300 and 66.67 fps.

**`node tests/run.mjs harness`, `site`, `browser`.** The five lists agree; the page and both workers load the
module; the service worker lists it.

### The layouts

P has silences of 0.3, 0.5 and 1.2 s between 2 s bursts, Q 0.9, 0.6 and 1.2 s; the amendment has the signal.
"Prototype" is seeds 1 to 50. The offsets differ from the amendment's table by W3-02c-1's change of `D`, 57.3 ms
at 300 fps and 51.9 ms at 66.67 fps.

| Line | Asked | Prototype |
| --- | --- | --- |
| P: the 300 ms pause makes no spurt | every seed | 50 of 50, both rates |
| P: the 500 ms pause makes its own spurt in some seeds only, both cases among seeds 1 to 10 | as written | 24 of 50; seeds 5, 7 and 9 of the first ten |
| P: that spurt is not `opened`; its `offsetStartMs` at 300 fps | -60 to +50 | -33.9 to +26.2 |
| the same at 66.67 fps | +10 to +140 | +33.2 to +116.3 |
| Q at 300 fps: `spurts[1]` not `opened` | at least 7 of seeds 1 to 10 | 45 of 50; 8 of the first ten |
| its `offsetStartMs` where appended | -380 to -215 | -360.6 to -234.6 |
| Q at 66.67 fps: `spurts[1]` `opened` | every seed | 50 of 50 |
| an `opened` spurt's `offsetStartMs`, both layouts, both rates | -50 to +60 | -29.7 to +39.0 |
| P at 300 fps: `spurts[0].droppedMs` | 70 to 230 | 92.9 to 207.6 |
| P at 300 fps: the spurt after 1.2 s is `opened`; its `droppedMs` | 65 to 155 | 86.5 to 133.8 |
| Q at 300 fps: `spurts[0].droppedMs` | 60 to 145 | 83.6 to 124.9 |
| Q at 300 fps: the spurt after 1.2 s is `opened`; its `droppedMs` | 65 to 150 | 86.5 to 128.5 |
| 300 fps: `channel.drops` | not empty | 7 to 24 entries |
| 66.67 fps: every `droppedMs` 0, `drops` empty | every seed | 50 of 50 |

Breaks to show: a new channel for each spurt (Q's `spurts[1]` is `opened` at 300 fps); `fps` not handed on (a
`droppedMs` above 0 at 66.67).

## A ten-minute render: time and memory

Measured on the prototype with a 600 s speech-like source at 48 kHz, `process()`, one render a Node process:

| | `'source'` | `'game'` |
| --- | --- | --- |
| fresh render, the gate on | 26.5 s | 28.4 s |
| fresh render, the gate off | 32.6 s | 34.8 s |
| from warm B, the gate on | 10.9 to 11.2 s | 13.1 to 13.3 s |
| from warm B, the gate off | 14.3 to 14.9 s | 17.8 to 18.2 s |
| peak memory (resident), the gate on | 1,545 MB | 1,443 MB |
| peak memory, the gate off | 1,562 MB | 1,464 MB |

The channel adds 2.2 to 3.4 s, about a fifth of a render from warm B. Memory is lower because nothing is laid:
`steamTimeline` gets no buffer of the voice's length, and the output is collected into one array.
`codecInfo.channel.source` is one 32-bit value a voice sample, 106 MB for ten minutes (inferred from its
length); it is inside the figures above.

The builder measures the same table with a scratch script, under the lock, and the report gives it.
**Stop lines:** the channel adds more than 6 s to a ten-minute render; or a `'game'` render's peak is more than
100 MB above the `'source'` render's. Either is reported before anything is tuned. The module's own speed is
not this order's: it may not be edited here.

One call can run long: a `push` across 599 s with no message took 151 to 163 ms and returned 26.4 million
samples at once (prototype). In `process()` that is one step of a loop that already pauses. In `createRender`
the `advance` at every chunk keeps each step short.

## Stop and ask

- A `'game'` render needs a statement of `steamTimeline`'s source path changed, or a kept stage would have to
  hold something this order makes.
- The bound for `advance` cannot be had without touching `steam-sender.js`, or a message arrives below it.
- The channel's blocks cannot be the mixer's with `MIX_BLOCK_ORIGIN` at 0.
- `voice-channel.js` shows a defect, or the reference of check 1 cannot be made equal without changing the
  module.
- Any recorded hash moves, or an existing check has to change beyond the two named under "Files".
- A layout's line falls outside its asked range. The builder reports the figure and does not widen the range.
- A stop line of the ten-minute table is crossed.
- The page or the live chain would have to change for a check to pass.
- 14 hours have gone.

## The reviewer and the second reader

**The reviewer** runs every suite and tries to break each new check with `TF2_DIR` pointed at a broken copy.
What to attack first:

- Check 1's independence. If the test's reference calls the engine's new function, or copies its lines, the
  check proves nothing. The reference must be the test's own code over `voice-channel.js`.
- The default path. `add` with no channel must be today's statements; read the diff of `engine/steam.js` line by
  line, then confirm no entry of `GOLDEN` or `GAIN_GOLDEN` changed in the diff of the test file.
- The bound. Raise it by one tick and see check 7 fail; drop the `advance` and see its second line fail.
- The lists. Remove the module from each of the five in turn; `harness` or `site` must fail each time.
- The refusals. Ask for `'game'` with each codec and see that none renders.

**The second reader** reads the diff of the three engine files against the module's contract and the amendment's
sections 2 and 3. What to attack:

- Every `push` return kept, in order, and nothing returned twice or lost at `finish()`.
- The gain object: a late frame passed around the gain with the spans `add` uses; the `agc: false` rounding,
  which must give the `'source'` render's value where the queue does nothing.
- `source` for each row of "What is pushed", and the cursor after a refused packet and after a lost end.
- The stream's `given`: counted where the sender is fed, at 24 kHz, not at the source's rate.
- Whether anything under `'game'` writes into stage B's objects. B is reused by the next render.
- The played logs' slot rule at the first and last slots.

## The orchestrator runs privately

Figures from the recordings stay private; the public record has these:

- Before and after: `tests/accuracy.mjs` with `--only take4_my_own_speech,sender_A,net_baseline,net_loss15`.
  The four rows are identical to the last digit, since no default render changes.
- The Set G replay of `tests/voice-channel.verify.mjs --fixture`: unchanged, since the module is not edited.
- Added by the amendment: the speech take's source rendered with `timeline: 'game'` at 300 and 66.67 fps and
  tracked as a take is. A scratch copy of `tests/accuracy.takes.json` whose take's `settings` add `timeline` and
  `fps` does it with no change to the tool. On record for comparison: the module alone reads 47% of transitions
  and a start error of 122 ms (`tests/retiming.mjs --engine`, measured after W3-02c-1), and the takes' playback
  runs 404 to 406 ppm fast on most takes (finding 24, measured). This run sets no bar.
- Added by the amendment: the loss takes of Set C against `'game'` renders at their loss. On record: the take
  at 15% has 3.90 lost runs a second and 10.1% silent (measured); a crude copy of the queue gave 4.22 and 11.7%,
  with drops of 60 to 220 ms that the takes lack (measured, the amendment's section 5). If the real channel
  shows those drops, that is BC-3's first question for block 1.

## Left open

The value's name, refusing on the other codecs and `MODEL_FILES` are ruled above (rulings 1, 2 and 9). Still open:

- **`codecInfo.channel.source`** crosses to the page with `codecInfo` once the page offers the option. Whether
  the page should receive 106 MB for ten minutes is W3-02d's to settle.
- **What a refused message does to a channel**, and the 60 to 220 ms drops under loss, are measured by the
  private runs above and decided in block 1, not here.
