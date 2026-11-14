# W3-02g-a: a demo's own packets through Steam's decoder and the game's voice queue (the engine)

The builder's report, 2026-11-14, for [W3-02g-demo-packets.md](../work-orders/W3-02g-demo-packets.md), part
W3-02g-a, with the order's last sections (the rulings, the orchestrator's private look (i) and "After the plan
review") holding over the text above them. Branch `claude/w3-02ga-demo-packets` (the brief's name; the order names
`claude/w3-02g-a-demo-queue` and this report `W3-02g-a-demo-queue.md`, and the brief, which sets the worktree,
branch and report, was followed), from `main` at `61c8834` (cache v48), with `main`'s later progress commit merged
in. Nothing of the owner's record was read, and no demo but `tests/demo/synthetic.dem` and the fixture this part
writes, `tests/demo/queue.dem`. Part b (the page and the documents) is not built: after this part the page still
asks for the file's own timing for a demo, so nothing on the page changes.

## What changes, in one paragraph

A render of a demo's Steam voice given `opts.timeline` `'game'` and the demo's own packets (`opts.received.packets`,
`firstTick`, `tickSeconds`, which `demo.js`'s decode now gives) runs each message as Steam's client and the game
run it: the records through one Steam decoder as read (16 bits, at most 10 frames concealed, the 17-frame buffer
that cuts a record), one Steam resampler call per record, a message over 11,264 samples refused, and the
receiver's voice channel on the message's own tick, `round((tick − firstTick) × tickSeconds / 0.015)`, with a zero
of its own (`arrivalZero`: the module's latency less the 0.16 s opening burst, on whole blocks). `process()` and
`createRender()` give the same samples and `codecInfo`, which gains `codecInfo.demo`. On the file's own timing a
demo's voice renders as on `main`, packets given or not. No render that exists today moves.

## What changed, file by file

- `demo.js`: `speakers()` gives each Steam packet `m` (its voice message's index in `parsed.voice`), `r` (its
  record's index in the message, every record counted) and `rate` (the message's sample-rate record read before
  it, `null` when none was); an Opus packet whose data runs past its record gains `short: true`. `decode()` gives,
  for a Steam speaker, `packets` (one entry per message holding a silence or an Opus record: `{ tick, rate, at,
  records }`), `firstTick` and `tickSeconds`. `at` is the write position at which the message's first Opus packet
  is laid, after any frames concealed in front of it, or the write position when a message with no Opus packet
  ends. A message's `rate` is its sample-rate record's value, one that is not 24,000 kept wherever it comes (so the
  engine refuses it). Every member `decode()` returned before keeps its value (checked by hashes recorded on
  `main`). The header comment says so.
- `opus-codec.mjs`, `createSteamDecoder` and its comment only: `record(entries)` walks one type 6 record as the
  order's pseudo-code has it, under a buffer of 17 frames (a named constant with the read's reference), and
  resolves to `{ pcm, blocks, cut, unread, concealed, resets }`. `receive()`, `late()`, `carry()`, `end` and
  `free()` are untouched.
- `voice-channel.js`: `arrivalZero(bufferMs, fps)`, exported (4,096, 6,144 and 14,848 samples at 66.67, 100 and
  300 fps); `createTimeline` takes `zeroSamples`, which is then D: a whole number of samples, 0 or more, a whole
  number of mixer blocks, and not given with `codecDelay`, else a RangeError; `info.codecDelay` is then 0. Without
  it nothing changes. The header and the comments say so.
- `engine/steam.js`: `steamGameTimeline` lets `'game'` run with a received source that has `packets` (on the steam
  codec, the codec on), refuses one without packets first (naming `received.packets`), then the codec bypassed,
  then another codec, as before, and then checks the packets (`steamDemoPackets`: every member the order lists,
  each malformed one a RangeError naming it and its packet's index). `steamArriveAt` refuses `arriveAt` with a
  demo's packets. `steamChannel` takes `zeroSamples` and hands it to `createTimeline` in place of the codec's delay;
  its `zero` is then `zeroSamples`. `steamDemoVoice` is the path of "One message on the game's timeline"; its
  comment states every rule and the choices below.
- `engine/render.js`: `readOptions` passes the demo case to `steamArriveAt`. `process()` with `'game'` and a demo's
  packets runs stages 1 and 2 as for any demo, then, in place of stage 4: the codec module, one decoder (freed at
  the end, also on an error), one resampler (`swrKernel` when given), `steamChannel` with the render's voice length,
  `fps` and `bufferMs` as given, the receiver's settings and the demo's zero, `steamDemoVoice` fed to the end, the
  channel's output (its length checked), `codecInfo` as `steamPlayedInfo` makes it with a look-ahead of 0 plus
  `codecInfo.demo`. Progress is reported and the render yields once per 64 messages (from 20% to 72%; the 72% the
  demo's stage reported before B is not reported first, so progress never falls). A is kept, nothing else.
  The doc comment says this at `timeline`, `arriveAt`, `received`, `jitterMs` and the result.
- `engine/render-stream.js`: `createRender` does the same as a stage after stage 2: after each piece every message
  whose arrival tick is below `T = floor(2 × (floor(given × 147 / 80) + Z) / 1323)` is run, then
  `channel.advance(T)` and `channel.take()`; at its flush it runs the rest, finishes the channel and checks the
  total. `voice` is the decoder, so the render's release frees it.
- `tests/demovoice/extract.mjs`: `--timeline game` with `--fps` (300) and `--buffer-ms` (100), and `--speaker`.
  Without `--timeline` it writes and prints what it did. `tests/demovoice/README.md` describes it.
- Suites (new checks and cases only; no recorded value changed): `tests/opus.verify.mjs`, `tests/demo.verify.mjs`
  (with the fixture writer for `tests/demo/queue.dem`), `tests/voice-channel.verify.mjs` (its list of exported
  names gains `arrivalZero`, which the new export needs), `tests/render-channel.verify.mjs` (section 21),
  `tests/render-stream.verify.mjs` (two cases, recorded in a commit of their own), `tests/stages.verify.mjs` (one
  check; it also takes `demoQueueVoice` from render-stream's shared section).
- Records: `tests/REFERENCE_2026.md`, finding 29, the two bullets corrected where they stand, dated, the old words
  kept; `tests/predictions/PREDICTIONS.md`, the note for the hashed model files that changed (`opus-codec.mjs`,
  `engine/steam.js`, `engine/render.js`, `engine/render-stream.js`); `tests/README.md`, the suites' rows and the
  tool's row.

`sw.js` is untouched: no file joins the site (the fixture is not a site file) and the number is the orchestrator's.

## The fixture, tests/demo/queue.dem

Written by `node tests/demo.verify.mjs --write-fixture`, checked byte for byte on every run, test SteamIDs of
universe 0, the tick length the server's float 0.015 (a server-info message). Speaker 1, shaped as Set D's demo:
six phrases that open with 8 frames from number 0 and go on with 3 frames every fourth tick, each ended by an end
marker and a silence record of 1,500 samples four ticks later. Pauses of 70 ticks (phrase 2 opens the queue
again), 16 (phrase 3 joins it at every rate tried) and 26 (phrase 4 joins it at 300 fps and opens it at 100 and
66.67, so that part b's check of `fps_max 67` has other phrases open and join than at 300). Inside the phrases: 3
frames that never reached the server in front of a message, one missing inside a message, two messages on one
tick, an opening of 13 frames, 7 + 7 and 4 + 5 frames in two records, an empty packet 20 ticks before phrase 6, 34
frames never sent then 12 (cut) and 5 (Set J's shape), and an end marker alone 140 ticks after the voice, past the
render's end. Speaker 2 has one short phrase from number 0.

## The choices of "After the plan review", point 6

| Place | Choice | Its check |
| --- | --- | --- |
| The `source` of a message whose packet starts with a silence record's zeros | the place of its first frame, `round((at − 480 c) × 147 / 80)`, less the samples its packet holds before that frame's record, so the sound lines up with the source and the zeros sit in front of it. A message of silence records only has -1 (as on the model's path), refused or not; a message with no frame and no silence record (an end marker alone) has `round(at × 147 / 80)` | render-channel 21's reference uses the same rule and is compared member for member (`codecInfo.channel.source` and the spurts); the case itself is in no fixture (Set D's messages hold one record each, private look (i)) |
| Past-end messages: decoded and counted? | not decoded and not resampled; counted only in `messages` and `pastEnd`. Every later message is past the end too, and none changes a sample | `codecInfo.demo` for `queue.dem` (`pastEnd` 1, `pushed` = `messages` − 1, `channel.packets` = `pushed`); `synthetic.dem`'s speaker 2: its second message, 3 s after the render's 0.2 s, is past the end, so only the first is decoded (7 concealed) |
| `onDecoded` for silence records | yes: called for every resampler call, a silence record's zeros included, as the model's path calls it; a dropped silence record makes no call | render-channel 21's silence check counts the calls (`9702`; `8820,1379`) |
| `at` and the frame log | `at` is the `pos` where the frame was laid; `demo.js` logs that frame at slot `round(at / 480)`, and `steamPlayedInfo` maps by floor, so a played slot near a frame's edge can show its neighbour's code (at `pos` ≡ 120, 240 or 360 mod 480, not only 360) | render-channel 21: the played log equals the slot rule applied to the reference's source map and the demo's own logs; the 3 frames concealed in front of a message (at `pos` ≡ 0) play as lost in every slot that plays them |

Two more places the order does not name: a message's `rate` (above), and a silence record of 0 samples, which makes
no resampler call.

## The record rule's worked table, as measured on the suite

`tests/opus.verify.mjs`, one decoder and one resampler, row after row, against a walk of the library's decoder
written in the suite (all equal sample for sample):

| Record, after the one before | Blocks | At 44.1 kHz | Cut, unread |
| --- | --- | --- | --- |
| frames 0 to 7, a fresh decoder | 8 | 7,056 | no |
| 12 frames, the first 34 numbers ahead | 17 (10 concealed) | 14,994 | yes, 5 |
| the 5 frames after those 12 | 9 (4 concealed) | 7,938 | no |
| an end marker, then 12 frames from 0 | 12 | 10,584 | no |
| an end marker, then 13 frames from 0 | 13 | 11,466 | no |
| 18 frames in one record | 17 | 14,994 | yes, 1 |
| the frame after those 18 | 1 | 882 | no |

## The phrases of queue.dem, as measured on this build

Speaker 1, the auto-gain on, voice_buffer_ms 100. Offsets in ms (negative: early), start then end; `dropped` the
ms lost to the ring's overflow.

| Phrase | 300 fps | 100 fps | 66.67 fps |
| --- | --- | --- | --- |
| 1 | opened, 9.2, −15.0, 119.1 dropped | opened, −0.0, −0.3 | opened, −0.0, −0.3 |
| 2 (after 70 ticks) | opened, 9.7, 3.6, 101.0 dropped | opened, 0.4, 0.1 | opened, 0.4, 0.1 |
| 3 (after 16 ticks) | joined, −74.0, −74.3 | joined, −77.4, −77.7 | joined, −77.4, −77.7 |
| 4 (after 26 ticks) | joined, −301.9, −302.2 | opened, −3.1, −3.4 | opened, 8.5, 8.2 |
| 5 (its 13-frame opening refused) | opened, −158.1, −438.3 | opened, −262.6, −542.8 | opened, −262.6, −418.9 |
| 6 (with the empty packet before it) | opened, −191.7, −351.9 | opened, 5.7, −154.5 | opened, 5.7, −154.5 |
| the channel | 4 opens, 2 joined, 220.2 ms dropped | 6 opens, 1 joined | 7 opens, 1 joined |

The gain is reset once per open at each rate. The suite holds the ranges around these values that the order asks
for. Phrases 5 and 6 begin with an empty packet (the refused opening; the end marker alone), which opens the
channel and starts the spurt, so their offsets are measured against that spurt.

## Ten minutes of a demo, in Node

`queue.dem`'s first speaker's six phrases tiled 66 times: 9.90 minutes of voice in 5,742 messages and 19,932 frames.
`process()` at 48,000 Hz: on the game's timeline 10.6 s and, run again, 9.5 s; on the file's own timing 6.5 s both
times (measured on this machine, 2026-11-14, nothing else running: load 0.6).

## The checks

Run on this branch, 2026-11-14, the heavy ones under `flock /tmp/tf2ve-heavy.lock`, one at a time, on a four-core
machine shared with another builder.

| What | Command | Result |
| --- | --- | --- |
| the record rule | `pnpm test opus` (inside the whole run) | `== opus: passed, 4.0 s` |
| the reader, the fixtures, the tool | `pnpm test demo` (inside the whole run) | `== demo: passed, 1.6 s` |
| the zero | `flock /tmp/tf2ve-heavy.lock pnpm test` (voice-channel) | `== voice-channel: passed, 107.0 s` |
| a demo on the queue is the reference | the same run (render-channel) | `== render-channel: passed, 131.2 s` |
| the stream is `process()` | the same run (render-stream); before it, `flock /tmp/tf2ve-heavy.lock node tests/render-stream.verify.mjs` with the two new cases unrecorded failed only on their missing hashes, every recorded hash held | `== render-stream: passed, 272.8 s` |
| the kept stages | the same run (stages) | `== stages: passed, 215.5 s` |
| the lists | `pnpm test harness site` | `== harness: passed, 0.7 s`, `== site: passed, 0.3 s` |
| everything else | `flock /tmp/tf2ve-heavy.lock pnpm test` | `27 of 27 suites passed. 1016.6 s summed` |
| the browser suite | `CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome \| head -1) flock /tmp/tf2ve-heavy.lock pnpm test:browser` | `== browser: passed, 400.9 s`, unchanged (no check of it was touched) |
| the cache | `node tests/cache-number.mjs origin/main --report` | `cache number against origin/main (fe19237): the number is v48, not above v48: it must rise (node tests/cache-number.mjs origin/main --set)`; the cached files changed are `demo.js`, `engine/render-stream.js`, `engine/render.js`, `engine/steam.js`, `opus-codec.mjs` and `voice-channel.js`. The builder does not set the number |
| the inspection | CI on the branch's head | run 43556702560 on `d29a486`: `verify` success (units, engine, render, stages and browser all success). The commit that adds this line changes `docs/` only, so it starts no run |

What must not move: `git diff origin/main -- tests/` adds checks, cases with their hashes and the fixture; it
changes no hash, reference or tolerance (it changes the voice-channel suite's list of the module's exported names,
which the new export needs, and the stages suite's line that takes names from render-stream's shared section).
A demo on the file's own timing, with packets and without, from `process()` and `createRender()`, gives the WAV,
`codecInfo` and mix-point hashes made by `main`'s code (61c8834, a clean copy) from the same fixture before any
change; `synthetic.dem`'s `decode()` gives `main`'s samples, frame logs and sizes by hashes recorded on `main`.

## The breaks

Each made on a copy of the tree in the scratch folder (the suites' checks set not to stop at the first failure),
the suite run, the copy restored. Every break failed at least the check the order names.

| Break | Failed |
| --- | --- |
| the buffer holds 18 frames | the worked table (18 blocks, 15,876); the end marker behind a cut; the cut changes what follows |
| the cut frame's number is not spent | the worked table; the end marker behind a cut; the short frame; the cut changes what follows |
| concealed blocks not counted toward the 17 (the room test on decoded frames) | the worked table (22 blocks, not cut); ten concealed twice in one record |
| concealment not stopped by the buffer (the room test unchanged) | ten concealed twice in one record |
| the walk reads on after a cut | the end marker behind a cut; ten concealed twice in one record |
| `record()` conceals on a number behind | the reset on a number behind; the end marker behind a cut (whose next step is a number behind) |
| a frame of length 0 given to the decoder | the frame of length 0 |
| a short frame decoded and the record read on | the short frame |
| a new decoder for every message | the reference at every rate |
| a new resampler at an end marker | the reference at every rate |
| the resampler called once per message, two records joined | a message of two records (one call); the silence record's check. The samples do not move: after a stream's first packet one call over two records gives what two calls give (measured on the port) |
| a refused message handed to the gain and the channel | the reference; the counts; the played log; the refused messages are heard; a message of two records |
| a refused message not pushed at all | the reference; the counts (`pushed`, the channel's packets); the played log |
| the refusal judged per record | the reference; the counts; the 7 + 7 heard; a message of two records |
| the empty packet left out | the reference; the counts; the empty packet opens a channel |
| two messages on one tick joined into one packet | the reference; the counts (`sameTick`); one sample each |
| the arrival tick from `tick` alone, without `firstTick` | the reference; ticks moved by 1,000 |
| the arrival tick without `tickSeconds` | ticks halved at 0.03 |
| the model's zero in place of the demo's | the reference; both phrase checks; the played log; the stream |
| the gain not reset at an open | the reference with the auto-gain on, at every rate (with it off, nothing to reset) |
| `at` taken as the packet's first block when blocks were concealed in front | the reference; the played log |
| `decode()` lays `at` before the frames concealed in front | queue.dem's `at` (demo suite); the played log (render-channel) |
| `packets` read on the file's own timing | the file's own timing against `main`'s hashes |
| `createRender` feeds everything at its first piece and never advances | the stream's bound (up to 28,544 samples behind). The order expected no check to see it; section 21's stream checks also hold how far the voice given out falls behind the source given |
| `createRender` advances past a message it has not pushed | the stream (a RangeError from the channel) |
| `opts.arriveAt` accepted with a demo's packets | the refusals |
| a packet whose tick falls accepted | the refusals (the channel then throws its own error, which does not name the member) |
| a silence record dropped at 8,820 or more | the silence record's check |
| a silence record never dropped | the silence record's check |
| past-end messages pushed | the reference; the phrases; the counts |
| `createTimeline` ignores `zeroSamples` | 512 less, 512 samples later |
| `zeroSamples` with `codecDelay` accepted | the refusals |

## For the orchestrator's private look (ii)

On this branch, before the merge, with nothing of the record copied out but numbers:

1. For F in 300, 250, 240, 230, 200, 150, 100 and 66.67:
   `node tests/demovoice/extract.mjs <Set D's demo> --timeline game --fps F --speaker <the sender's SteamID> --out <a private folder>`.
   It prints the line `game's timeline at F fps, voice_buffer_ms 100: ...` with the messages, those on the tick of
   the one before, refused, cut, past the end, and the channel's opens, joins and dropped ms; it writes
   `<demo>.<id>.game-F.phrases.tsv`, whose `change_ms` column is each phrase's start offset less the offset at the
   end of the phrase before (the order's step 2) and whose `queue` column says opened or joined.
2. Steps 2 to 4 of the order's private look from those files: the frame rate at which the four early starts join
   and the rest stay within 60 ms; the second listener's highest F with no join; the last phrase against the
   render's end (`pastEnd`, and its `offset_end_ms`).
3. Set J with `record()`: in a private script, one `createSteamDecoder()` from `opus-codec.mjs` driven by
   `record(entries)` for each logged record in order (entries `{ seq, data }` and `{ end: true }`), each record's
   `pcm` given to one `createResampler()` of `vendor/swresample/swresample.js` (`packet(pcm)`, the `fma3` kernel by
   default), and the result compared with the recording as W3-11a's second read compared it (524,256 of 524,288
   with the cut done by hand, finding 29).

## Not done, and open

- Part b (the page, its checks and the documents) is the next part, after W3-02c-3b and the private look (ii).
- The figures of the order's tables "The zero" and the worked table were the prototype's; the suite holds what this
  build measures (above). The worked table's counts are the prototype's. The phrases differ: at 300 fps the first two
  opened phrases start 9.2 and 9.7 ms late (the prototype: 9.2 and 11.8), and the phrase after 26 ticks opens 3.1 ms
  early at 100 fps and 8.5 ms late at 66.67 on the fixture, where the prototype's opened phrases started 2.6 and 3.0
  ms late. (Corrected in the fix round: this item said the figures "agree with the prototype's at 100 and 66.67
  fps".)
- A message that holds an empty Opus record or a sample-rate record and nothing else gives no entry in `decode()`'s
  packets, so the game's handling of it (an empty packet that would open a channel) is not modelled; none is known.
- The suite's render-stream case makes its frames from seeded bytes behind Opus TOCs (render-stream's shared
  section is also run by the stages suite, where nothing can be awaited, so the library's encoder cannot run
  there); the real-Opus fixture is rendered in render-channel 21.

## The fix round (2026-11-14)

From the order's last section ("The private look (ii), the review, the second read and the rulings"), ruling 3.
`main` (W3-02c-3b, cache v49, and the documents) was merged in first (`77ddd4d`).

- **A cut source.** Section 21 renders `queue.dem` with its source cut at 72,000 samples (3 s) at 300 and 66.67 fps
  and compares `process()` with the reference, samples, `codecInfo.channel` and `codecInfo.demo`. Messages arrive
  between the render's end and the end plus the zero (5 at 300 fps, 1 at 66.67; asserted at least one), are pushed,
  and still sound; the rest are past the end. The reviewer's break, the first block past the end counted without the
  zero, fails both renders (made on the scratch copy).
- **A silence record in front of frames.** Section 21's silence packets gain a message of a silence record alone,
  which closes the spurt, and a message `[{ silence: 750 }, { frames: [end marker, 6 frames] }]`. Its source is its
  first frame's place less the zeros (1,378 samples), and `codecInfo.channel` (the source map and the spurts) and the
  voice equal `demoReference`'s. The reviewer's break, `before` dropped, fails it.
- **Standings.** `engine/steam.js`: a refused message given to the channel as an empty packet, which opens a channel
  when none is open, is marked chosen, not read (ruling 5 of 2026-11-11, one line of Set J's log); a record that
  made no block and a silence record of 0 samples, which make no resampler call, are marked as choices.
  `tests/REFERENCE_2026.md`: finding 29 gains a dated line with the refused message's standing; finding 21 gains a
  dated entry with look (ii)'s table, ruling 2's open finding, the second read's figures and Set D's slot counts
  beside the grid's expectation, each with its standing as the order's section gives it. Nothing was edited there,
  only added.
- **The report.** Its comparison with the prototype is corrected (above, "Not done, and open").

Checks: `node tests/render-channel.verify.mjs 21` passed; `flock /tmp/tf2ve-heavy.lock pnpm test` on `371ddc6`: `27 of 27 suites passed. 1222.6 s summed` (`== render-channel: passed, 158.4 s`). CI run 43559321413 on `371ddc6`: `verify` success (units, engine, render, stages and browser all success). The commit that adds this section changes `docs/` only and starts no run.

## The scan

`git diff origin/main...HEAD` and the branch's commit messages were read for recordings, personal details, real
SteamIDs and model names: none (the fixtures' SteamIDs are universe 0's, the commits carry only the trailer the
brief gives).
