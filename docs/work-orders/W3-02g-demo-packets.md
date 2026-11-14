# W3-02g: a demo's own packets through Steam's decoder and the game's voice queue

**Status 2026-11-14: planned, not built.** Written by a planner from the repository alone, at `main` `5e0f91f`
(cache v47). Line numbers are that commit's. It replaces the section "W3-02g: a demo's own packets" of
[W3-02-receiver-queue.md](W3-02-receiver-queue.md) (written 2026-11-10, with its "Now comes after" list), which is
kept there as it was written and is no longer the order to build from. The planning report is
[W3-02g-plan.md](../reports/W3-02g-plan.md). The order is read by a plan reviewer before any build, and the
rulings at its end are asked of the orchestrator first.

**Kind:** a change to how a render is computed when its source is a demo's voice and the game's timeline is asked
for, and changes to `voice-channel.js`, `engine/steam.js` and `opus-codec.mjs`, which every render on the game's
timeline runs. No render that exists today may move.
**Parts:** W3-02g-a (the reader, the decoder's record rule, the engine, the stream, their suites, the command-line
tool) and W3-02g-b (the page and the documents). Each is merged on its own, part a first. After part a the page
still asks for the file's own timing for a demo, so nothing on the page changes until part b.
**Roles:** `tf-builder` (effort xhigh for part a, high for part b), then `tf-reviewer`. Part a also needs a second
reader on the stronger model (`docs/PIPELINE.md`: it changes how a render is computed and touches the module every
render on the queue runs). Part b needs none.
**Branches:** `claude/w3-02g-a-demo-queue` and `claude/w3-02g-b-demo-page`, each from `main` as it stands when the
part starts. **Worktrees:** in the brief.
**Reports:** `docs/reports/W3-02g-a-demo-queue.md` and `docs/reports/W3-02g-b-demo-page.md`.
**Budget:** 12 hours for part a, 5 hours for part b.
**Cache number:** rises once with each part. The builder does not set it.
**Starts after:** part a after W3-02c-3a is merged (both change `voice-channel.js` and `steamChannel`; "Where this
meets W3-02c-3" names every place). Part b after part a, after W3-02c-3b is merged, and after the orchestrator's
private look (ii).

## Why

A SourceTV demo holds each speaker's voice messages as the server had them, with the tick each was written on. So
for a demo nothing of the sender has to be modelled: the messages, their frames, their numbers and their ticks are
there. Today the app does not use them that way. `demo.js` decodes the frames with its own rules into one float
signal (`demo.js:300-353`), the page mounts that signal as the source (`app/source.js:358-371`), and a render runs
the receiver's gain and the mixer on it with the app's own resampler (`engine/render.js:548`, `:677-712`). The
engine refuses the game's timeline for it (`engine/steam.js:108`), and the page says so under Phrase timing
(`app/console.js:591`).

So for a demo the app has neither Steam's decoder as read (16 bits, at most ten frames concealed, a record cut at
17 frames, a message over 12 frames refused, FFmpeg's resampler once per record) nor the game's voice queue.
Both are built for a file's render. This order gives them a demo's own packets.

## What is known

| What | Figure | Standing |
| --- | --- | --- |
| Steam's decoder for one type 6 record | a frame at a time: the end marker resets the decoder and sets the expected number to 0; a number behind the expected one resets and conceals nothing; one ahead conceals `min(gap, 10)` frames; the expected number becomes the frame's number plus one; a frame of length 0 gives 480 zeros | read (`docs/reports/W3-09-steam-voice.md`, section 4; `docs/reports/W3-16-steam-hold-read.md`, section 3; finding 29) |
| The record's buffer | 17 frames of 480 samples, concealed ones included. A frame that would be the 18th is not decoded, its number is spent all the same, and the rest of the record is not read | read (the W3-16 read, section 3); seen once (Set J, finding 29) |
| The game's room for one message | 22,528 bytes, 11,264 samples at 44.1 kHz: 12 frames fit, 13 do not. A longer message is not heard at all; the decoder and the resampler keep the state it left them in | read (W3-03, the W3-16 read); seen once in a log and seven times by its effect (findings 8 and 29) |
| A record cut at 17 frames | is always refused, since 17 frames are 14,994 samples. So the cut is heard only in what follows: the decoder's state, the expected number, the resampler's state | inferred from the two rows above; the counts measured on the planner's prototype |
| A silence record | that many zeros at the stream's rate through the same resampler; dropped when more than 0.2 s is already waiting in that decoder's output | read (W3-09, section 4); the drop cannot be reached by a message with one record |
| The resampler | one per speaker for the whole session, called once per record, never reset | read (W3-09); measured (Sets G and J, finding 29) |
| The decoder | one per speaker; only an end marker or a number behind the expected one resets it; it outlives key presses and channels | read; measured (Set J, finding 29) |
| A decoder that has decoded nothing | expects number 0 | inferred (the render's decoder has it so, `opus-codec.mjs:218`); not read |
| Set D's demo | 1,816 messages of one speaker, each with one sample-rate record of 24000 and one more record; 5,109 frames in 20 phrases; no gap in the numbers; every phrase starts at number 0 | measured (finding 11; `tests/REFERENCE_2026.md`, the run of `demo` on 2026-11-13) |
| A phrase's opening message | 8 frames in 17 of 20 openings of Set D's demo; the others 3 to 9 | measured (finding 25) |
| When SourceTV writes voice | every fourth tick, so a demo's tick gives a message's arrival to 60 ms | measured (Set D, finding 21) |
| A player's client | gets messages 3, 4 or 5 ticks apart and never two on one tick | measured (Set G, finding 25) |
| An empty packet (an end marker alone) | opens a channel by itself | measured (3 in Set G, finding 25) |
| The channel, its wait, its ring, its fade, the one sample dropped per packet | as `voice-channel.js` has them | read and replayed (findings 22 to 24) |
| The gain | reset when a channel is assigned, with the settings read then | read (finding 26) |
| A demo on the queue on a prototype | 9.7 minutes of voice in 9,570 messages through the decoder, the resampler and the channel in 8.4 s and, run again, 9.6 s | measured on the planner's prototype in Node, on a machine shared with other agents |

## What changed under the old section since 2026-11-10

The report has each with its `file:line`. In short:

- `createTimeline` already takes packets, not a sender: `push({ tick, pcm, source })` (`voice-channel.js:435`).
  The old section's change to it is not needed. What a demo needs of it is another zero ("The zero").
- A render runs the channel through `steamChannel` (`engine/steam.js:180-251`), which holds the gain's reset at
  each open and the gain-off case. A demo's packets go through the same object.
- The 12-frame refusal is built for the model's packets (`engine/steam.js:446-452`, BC-1). The 17-frame cut is
  not built anywhere.
- `opts.arriveAt` (BC-4) is a function over the sender's ticks. It cannot cross to the page's worker, it makes a
  render keep nothing, and it gives one arrival for each sender's tick. A demo's ticks therefore enter as a
  member of each packet of the received source, and `opts.arriveAt` is refused with a demo's packets.
- `codecInfo.channel.packets` is the count of packets pushed (`voice-channel.js:496`). The old section's
  `codecInfo.channel.packets = 'demo'` is dropped. A demo's render says so in `codecInfo.demo`.
- The page: Phrase timing, its note (`sourceTimingReason`, `app/console.js:588-594`), the jitter lines
  (`:616-629`), the strip's cells (`:634-667`) and the lane on the queue (`app/visualizer.js:883-898`,
  `:1119-1142`) are built. The lane reads `codecInfo.channel.source`, `lookahead`, `sampleRate` and
  `frameSamples`, which a demo's render on the queue will have.
- The old section's `from` and `to` (a message's range in one decoded signal) are dropped. See "What a message's
  place means".

## The path, message by message

### Which decoder, on which timeline

| Timeline | A demo's Steam voice goes through | Changed by this order |
| --- | --- | --- |
| the file's own timing (`timeline` `'source'`, the engine's default) | `demo.js`'s decode as today: float samples, every frame of a gap concealed when the time allows it, a new decoder at each end marker and at a late break, each phrase at its tick; then the app's resampler and the gain over the whole signal | no. Sample for sample as on `main` (ruling 1) |
| the game's timeline (`timeline` `'game'`) | Steam's decoder as read, record by record, with the 17-frame buffer; FFmpeg's resampler port once per record; the 12-frame refusal per message; the voice channel on the demo's own ticks, with the gain reset at each channel opened | built by part a |

The Original on the page stays `demo.js`'s decode on either timeline: it is the voice as sent, and the source
every view is drawn from. A demo of `vaudio_celt` or `vaudio_celt_high` has no queue model and keeps the file's
own timing; the page hides Phrase timing for those codecs already.

### What a message is

One voice message of the speaker: the records after the SteamID, in the message's order. A sample-rate record
(type 11) sets the message's rate. A silence record (type 0) holds a count of samples. A type 6 record holds
entries: a frame with its 16-bit number, or the end marker (`demo.js:222-253`). In Set D's demo every message has
one sample-rate record and one other record (measured). The path below takes any number.

### One message on the game's timeline

For each message, in the demo's order, with one decoder and one resampler made before the first message and kept
to the last:

1. `parts` starts empty. For each record in order:
   - **a silence record of n samples:** if the samples already in `parts` are more than 8,820 (0.2 s at
     44.1 kHz), the record is dropped (read; that the wait is counted in output samples is inferred). Otherwise
     `resampler.packet(new Int16Array(n))` joins `parts`.
   - **a type 6 record:** the decoder walks it by the rule below and returns its blocks. If it made any, their
     samples go to the resampler in one call, `resampler.packet(pcm)`, and the result joins `parts`. A record that
     made no block makes no call.
2. The message's packet is `parts` joined. If it is longer than 11,264 samples (`steamFits`,
   `engine/steam.js:52`), the message is refused: nothing of it reaches the gain or the channel, the decoder and
   the resampler keep their state, and the channel is given an empty packet on the message's tick (the ruling of
   2026-11-11 on a refused message, `W3-02-receiver-queue.md`, "Rulings of 2026-11-11", ruling 5).
3. Otherwise the channel is given the packet, each sample over 32768, on the message's tick. A message that made
   no sample (an end marker alone, at a key press) is given as an empty packet: it holds no sound and still opens
   a channel (measured, finding 25).
4. The channel's gain object is `steamChannel`'s, unchanged: reset at each open with the receiver's three
   settings, run over each packet whole, the silence records' zeros among them.

### One type 6 record under the 17-frame buffer

This is the cut. It sits in `createSteamDecoder` (`opus-codec.mjs:213-241`) as a call of its own, `record()`,
beside `receive()`, which the model's path keeps as it is.

```
record(entries):                       # entries: { seq, data, short } or { end: true }, in the record's order
    made = []                          # blocks of 480 samples, at most 17
    for e in entries:
        if e.end: reset(); continue                    # a new decoder; expected = 0
        seq = e.seq & 0xFFFF
        if seq < expected: reset()                     # behind: reset, nothing concealed
        else:
            for k in 0 .. min(seq - expected, 10) - 1:
                if len(made) == 17: break              # concealing stops when the buffer is full
                made.append(conceal())
        expected = (seq + 1) & 0xFFFF                  # spent before the room is looked at
        if e.short: stop                               # the frame runs past its record: nothing more is read
        if len(made) == 17: cut = true; stop           # the 18th frame is not decoded; the rest is not read
        made.append(480 zeros if len(e.data) == 0 else decode(e.data))
    return made, cut
```

- An end marker behind a cut is never read. The decoder is then not reset by it. The next phrase's number 0 is
  behind the expected one and resets it all the same.
- `conceal()` and `decode()` are the library's 16-bit calls the decoder already uses (`decodePacketLossInt16`,
  `decodeInt16`).
- A decoder that has decoded nothing expects 0 (inferred; ruling 7). So a demo that begins inside a phrase has up
  to ten frames concealed in front of its first frame.
- A decoder is driven by `receive()` or by `record()`, never both. `receive()`, `late()`, `carry()` and `end`
  do not change.

Worked on the planner's prototype, with the library the repository pins (measured on a prototype; the counts of
the second and third lines are Set J's logged 0 and 7,938, finding 29):

| Record, after the one before | Blocks | At 44.1 kHz | The game |
| --- | --- | --- | --- |
| frames 0 to 7, a fresh decoder | 8 | 7,056 | takes it |
| 12 frames, the first 34 numbers ahead | 10 concealed and 7 decoded, cut | 14,994 | refuses it |
| the 5 frames after those 12 | 4 concealed and 5 decoded | 7,938 | takes it |
| an end marker, then 12 frames from 0 | 12 | 10,584 | takes it |
| an end marker, then 13 frames from 0 | 13 | 11,466 | refuses it |
| 18 frames in one record | 17, cut | 14,994 | refuses it |
| the frame after those 18 | 1, nothing concealed | 882 | takes it |

### What a message's place means

The old section gave each message a range `from` to `to` of one decoded signal. That cannot hold: the two decodes
make different numbers of samples for the same message (a gap over ten frames, a cut, a reset). So a message
carries one place, `at`, and the game's decoder makes the samples.

- `at` is where the file's own timing has the message: the sample, at the codec's rate, at which `demo.js`'s
  decode laid the message's first coded frame. For a message with no coded frame it is that decode's write
  position when the message was read.
- The packet's `source`, which the channel records for the lane and the phrases, is
  `round((at - 480 c) × 147 / 80)`, with `c` the blocks the game's decoder concealed in front of the message's
  first coded frame. Blocks concealed between two coded frames of one message take their own 480 samples inside
  the packet and move nothing.
- A message with nothing but a silence record has `source` -1, as a record has today. An empty packet and a
  refused message have `round(at × 147 / 80)`.
- Where the two decodes differ in count, the map is off by whole frames inside that one packet. The next message
  has its own `at`. The map decides no sample: it feeds `codecInfo.channel.source`, the played frame log and the
  phrases' offsets.

So on the queue "the source's second" in the lane's hover is the Original's second, and "sent frame k" is the
frame's index on the file's own timing.

## The ticks

- **A message's arrival tick** is `round((tick - firstTick) × tickSeconds / 0.015)`: `tick` the demo tick the
  message was written on, `firstTick` the tick of the speaker's first packet (`demo.js:303`, the zero of the
  file's own timing too), `tickSeconds` the demo's tick length (`parsed.intervalPerTick`, `demo.js:83` and
  `:159`). The channel's tick is 15 ms (read, finding 22). Each packet of the received source carries its `tick`;
  the engine does the sum.
- **The demo's tick length against 15 ms.** TF2's is 15 ms, and the sum is then the difference of the two ticks.
  The demo's own value is a 32-bit float, 0.014999999664723873 (computed; the reader takes it from the server's
  record, `demo.js:83`, and before that record from the header's seconds over its ticks, `:159`). Over an hour's
  240,000 ticks the product is short by 0.005 of a tick and rounds to the whole tick. With another tick length
  (another game, another server)
  several demo ticks can fall on one channel tick, or leave channel ticks between them. The order is kept, since
  the rounding never falls.
- **Several messages on one tick** are pushed one after the other on that tick, in the demo's order. The channel
  takes them (`voice-channel.js:444`: a tick at or after the last one; BC-4 pushes so already). Each is its own
  packet: one sample is dropped from each, and each is judged against the 12 frames by itself. That the game adds
  two messages that came in one frame as two packets is inferred from the engine adding nothing of its own
  (finding 25).
- **The first tick** is arrival tick 0. The render's sample 0 is the game's clock at tick 0 plus the zero below.
- **What a demo's tick is not.** It is the tick SourceTV wrote the message on, every fourth tick in Set D's demo,
  not the tick a player's client got it on. A player gets messages 3 to 5 ticks apart and never two on one tick
  (measured, Set G). So a demo's render on the queue is the queue of a listener fed as SourceTV was, to 60 ms.
  On the prototype every second message was held to the tick of the next, 60 ms later. At 300 frames a second
  every phrase stayed within 2 ms *(corrected 2026-11-14 by the second read: that held on the prototype's regular alternation of ticks; on ticks bunched as Set D's are, an opened phrase starts 49 ms early to 65 ms late at 300 frames a second, measured on a synthetic sender)*. At 66.67 the two phrases whose opening message was among those held started
  58 and 61 ms late, and the one of them that had joined the queue opened it instead (measured on a prototype).
  The page says the limit in the render's console line (part b).
- **`opts.arriveAt`, jitter and loss.** With a demo's packets `opts.arriveAt` is a `RangeError`: the packets
  carry their ticks. `jitterMs` and `lossPct` do nothing, as for a demo today: the demo is what arrived.
  `codecInfo.arrivals` is absent. Jitter on top of a demo's ticks is not built.
- **Past the end.** The render keeps the source's length (the deferred finding of BC-4a on a render's length
  stands). A message that arrives at or after the start of the first mixer block past the render's end changes no
  sample. It is not pushed, and it is counted (`codecInfo.demo.pastEnd`).

## The zero

A render on the game's timeline takes a fixed delay out, D, so that the render lines up with its source
(`voice-channel.js:336`). It is the model's own figure; the game has none. For the sender's model it is
`latency + 0.0505 s + the codec's delay`, where 0.0505 s is the mean time the model's opening packet takes to
arrive after its first captured sample (`voice-channel.js:93`). A demo's packets have no such time: the place of
an opening packet on the file's own timing is its own arrival tick.

For a demo the zero is `512 × round(44100 × (latency(bufferMs, fps) - 0.16) / 512)`: 4,096 samples at 66.67
frames a second, 6,144 at 100 and 14,848 at 300 (92.9, 139.3 and 336.7 ms). `latency` is the module's
(`voice-channel.js:110-113`), and 0.16 s is its opening burst of eight frames (`:80`; measured, 17 of 20 openings
of Set D's demo). The reason: a phrase that opens the queue plays its first packet after the wait, less what the
ring cannot hold of the wait's sound. With an opening of eight frames that is the wait up to 0.34 s. So an
opened phrase sits where the file's own timing has it, and a phrase that joins the queue is early against it.

Measured on the prototype, on four phrases of 2 s shaped as Set D's (an opening of 8 frames, then 3 frames every
fourth tick, an end marker, a silence record of 1,500 samples four ticks later; the next phrase 16, 56 and 26
ticks after the record):

| Frames a second | Opened | Joined | An opened phrase starts | A joined phrase starts | Lost to overflow |
| --- | --- | --- | --- | --- | --- |
| 300 | 2 | 2 | 9.2 and 11.8 ms late | 92.9 and 244.1 ms early | 99.1 and 103.0 ms at the head of each opened phrase |
| 100 | 3 | 1 | 0.0, 2.6 and 3.0 ms late | 98.3 ms early | none |
| 66.67 | 3 | 1 | 0.0, 2.6 and 3.0 ms late | 81.8 ms early | none |

These are the prototype's figures, not the build's. The builder's suite states what the build measures and holds
ranges around that.

A phrase whose opening is shorter than eight frames starts late against the zero at 300 frames a second, by up
to the difference (inferred). At 300 frames a second the last 244 ms of the prototype's source were silence,
since its last phrase had joined early; a last phrase that opens late loses its end to the render's length
instead (inferred; the private look measures it on Set D).

## What the render gives

On the game's timeline with a demo's packets, `process()` and `createRender()` resolve as for any render, with:

- `codecInfo` as a demo's today (`receivedCodecInfo`, `engine/codec.js:34-45`: `backend` `'demo'`, the counters
  of the file's own timing, `lookahead` 0), and then, as `steamPlayedInfo` makes them
  (`engine/steam.js:261-271`, with a look-ahead of 0): `frameLog` and `frameBytes` as played, `sent` holding the
  file's own timing's two logs, and `channel`, the channel's info whole.
- `codecInfo.demo`: `{ messages, pushed, sameTick, refusedMessages, cutRecords, unreadFrames, concealed, resets,
  droppedSilence, pastEnd, tickMs }`. `messages`: the packets given. `pushed`: those handed to the channel.
  `sameTick`: those pushed on the tick of the one before. `refusedMessages`: over 12 frames. `cutRecords` and
  `unreadFrames`: the records cut at 17 frames and the frames of those records that were not decoded.
  `concealed`: the blocks the decoder concealed. `resets`: the decoder's resets (end markers and numbers behind).
  `droppedSilence`: silence records dropped behind 0.2 s. `pastEnd`: as above. `tickMs`: the demo's tick length
  in ms.
- No `codecInfo.arrivals`, no `codecInfo.sender`, no `codecInfo.network`.

## Where this meets W3-02c-3

W3-02c-3a (`claude/w3-02c3a-live-channel`, in review on 2026-11-14) changes two files this order's part a also
changes. Part a starts after it is merged and is written on what is then on `main`. The places:

| File | What W3-02c-3a does there | What part a does there |
| --- | --- | --- |
| `voice-channel.js`, the line that makes D (`:336` on `main`) | replaces it with `const D = zero(bufferMs, fps, codecDelay)` and adds the function `zero` above `createChannel` | D is `zeroSamples` when that option is given, else as W3-02c-3a leaves it |
| `voice-channel.js`, `createTimeline`'s options and its comment | adds `length` `Infinity` | adds `zeroSamples`; with `length` `Infinity` it works the same way and no caller passes both |
| `voice-channel.js`, the export line (`:511`) and the header's list | adds `zero` | adds `arrivalZero` |
| `engine/steam.js`, `steamChannel`'s signature and its call of `createTimeline` (`:180`, `:221`) | adds `onOpen`, the endless case, `zero`, `counts`, `held`; `returned` and `keep` around the pieces | adds `zeroSamples`, handed to `createTimeline` in place of `codecDelay` |
| `tests/voice-channel.verify.mjs`, the list of exported names; `tests/render-channel.verify.mjs` | new checks, section 10 replaced | new checks only |
| `tests/predictions/PREDICTIONS.md`, `tests/README.md` | a note, two rows | a note, rows |

W3-02c-3a's name `zero` is the function that gives the model's D. This order's option is named `zeroSamples`
and its function `arrivalZero`, so the two cannot be taken for each other. W3-02c-3a does not touch `demo.js`,
`opus-codec.mjs`, `engine/render.js` or `engine/render-stream.js`.

W3-02c-3b (the live page) may touch `index.html`, `app/render.js` (`mountLiveTake`, the held take's text),
`app/core.js` and `tests/browser.verify.js`. Part b of this order touches `index.html:154`, `app/render.js`
(`sourceRenderOptions` and the render's console lines), `app/console.js`, `app/source.js` and
`tests/browser.verify.js`. Part b starts after W3-02c-3b is merged. Part a shares no file with W3-02c-3b and may
run beside it.

## Part W3-02g-a: the reader, the record rule, the engine, the stream

### Build

1. **`demo.js`, `speakers()`** (`:209-267`). Each packet of a Steam speaker gains `m` (the index of its voice
   message in `parsed.voice`), `r` (the record's index in its message, every record counted) and `rate` (the
   value of the message's sample-rate record read before it, `null` when there was none). An Opus packet whose
   data the record's end cut short (`:236`) gains `short: true`. No other member, count or order changes.
2. **`demo.js`, `decode()`** (`:300-353`). For a Steam speaker the result gains three members; every member it
   has today keeps its value.
   - `packets`: one entry for each voice message that holds a type 0 or type 6 record, in order:
     `{ tick, rate, at, records }`. `records` is the message's records in order, `{ silence: n }` or
     `{ frames: [...] }`, the entries of `frames` being `{ seq, data }` (with `short: true` where the packet has
     it) or `{ end: true }`. `data` is the packet's own `Uint8Array`, not a copy. `at` is set when the message's
     first Opus packet is about to be laid (after the statements of `:314-320` have set `pos`, before `put` at
     `:321`), and for a message with no Opus packet it is `pos` when the message ends.
   - `firstTick` (the `t0` of `:303`) and `tickSeconds`.
   A message that holds a sample-rate record and nothing else gives no entry (none is known; what the game does
   with one was not read).
3. **`opus-codec.mjs`, `createSteamDecoder`** gains `record(entries)` as "One type 6 record under the 17-frame
   buffer" has it. It resolves to `{ pcm, blocks, cut, unread, concealed, resets }`: `pcm` an `Int16Array` of
   the blocks in order; `blocks` one entry per 480 samples, `{ code, bytes, seq }`, `code` being `FRAME.lost` for
   a concealed block, `FRAME.dtx` for a frame of 2 bytes or fewer, else the frame's mode (`packetMode`,
   `:33`); `cut` whether the record was cut at 17; `unread` the frames of the record after the cut, the one
   whose number was spent among them; `concealed` and `resets` the counts. The 17 is a named constant with the
   read's reference in its comment. The module's header comment above `createSteamDecoder` says what `record()`
   is for.
4. **`voice-channel.js`.**
   - `arrivalZero(bufferMs, fps)`, exported:
     `mixBlock × round(rate × (latency(bufferMs, fps) - OPENING_SECONDS) / mixBlock)`, with a comment that says
     what it is for and where the 0.16 s comes from.
   - `createTimeline` takes `zeroSamples`: when given it is D. It must be a whole number, 0 or more, and a whole
     number of mixer blocks, else a `RangeError`. Given together with `codecDelay`, a `RangeError`. Without it
     nothing changes.
5. **`engine/steam.js`.**
   - `steamGameTimeline` (`:100-112`): a received source that has `packets` (an array) is allowed on the steam
     codec with the codec on. One without `packets` is refused as today, its message saying that the received
     source has no packets (`received.packets`). The other two refusals stand, and their order.
   - The packets are checked where the option is read, before anything else is refused after it: `packets` an
     array of objects; `firstTick` a whole number; `tickSeconds` a finite number above 0; each `tick` a whole
     number, at or after `firstTick`, never below the one before; each `at` a finite number; each `rate` `null`
     or 24000; each `records` an array of the two kinds. Anything else is a `RangeError` that names the member
     and the packet's index. Nothing is ignored.
   - `steamArriveAt` (`:132-137`): with a demo's packets, a `RangeError` that says the packets carry their own
     ticks.
   - `steamChannel` (`:180`) takes `zeroSamples` and hands it to `createTimeline` in place of `codecDelay`.
   - `steamDemoVoice({ received, length, decoder, resampler, channel, onDecoded, onResampled })`: the path of
     "One message on the game's timeline". It resolves to `{ feed(untilTick), info() }`. `feed(untilTick)`
     (async) runs, in order, every message not yet run whose arrival tick is below `untilTick`, and pushes each
     on its arrival tick with its `source` and its blocks. `info()` is `codecInfo.demo`. `length` is the render's
     length at the voice rate, for "Past the end". `onDecoded(pcm, packet)` is called with each record's samples
     as they go to the resampler and `onResampled(y16, packet)` with each result, as the model's path calls them
     (`:440-443`).
6. **`engine/render.js`, `process()`.** With the game's timeline and a demo's packets:
   - stages 1 and 2 run as for any demo (`:520-540`), so A is the same and the lengths are the source's;
   - then, in place of stage 4's resampler and gain (`:677-712`): the codec module is loaded
     (`loadOpusModule`), one `createSteamDecoder` and one resampler are made (the kernel `opts.swrKernel` when
     given), `steamChannel` is made with the render's voice length, `fps` and `bufferMs` as given, the receiver's
     four settings and `zeroSamples: arrivalZero(bufferMs, fps)`, and `steamDemoVoice` is fed to the end; then
     `channel.finish()` and `channel.take()`, whose length must be the voice length, else the error of `:662`;
   - `codecInfo` as "What the render gives";
   - stages 5 and 6 run as they are. A room, under water, `volume` and the device's rate act as on any render.
   - Progress is reported and the render yields (`pause`) once per 64 messages, as the model's path does
     (`:649-651`).
   - Nothing is kept beyond A (ruling 5). `stagesHold` answers as today for a demo. `previewAllowed` stays
     false for a demo (`:308`).
   - The doc comment of `process()` (`:338-468`) says all of this where it describes `timeline`, `arriveAt`,
     `received`, `jitterMs` and the result.
7. **`engine/render-stream.js`, `createRender()`** does the same a piece at a time, so that its output and
   `codecInfo` are `process()`'s. With `given` the samples at the codec's rate that have come through stage 2,
   and `Z` the zero: after each piece the stage feeds `steamDemoVoice` to
   `T = floor(2 × (floor(given × 147 / 80) + Z) / 1323)`, calls `channel.advance(T)` and returns
   `channel.take()`. At its flush it feeds to the end, finishes the channel and returns the rest, whose total
   must be the voice length (`:296-298`). `T` never falls, and every message below `T` has been pushed before
   the channel advances to it, so the pushes and their order are `process()`'s.
8. **`tests/demovoice/extract.mjs`** takes `--timeline game`, with `--fps <n>` (300), `--buffer-ms <n>` (100)
   and `--speaker <id>`. For each Steam speaker at 24000 Hz, or the one named, it renders the speaker's voice
   with `TF2Audio.process` (the engine loaded as the suites load it, `tests/lib/engine.cjs`) on the game's
   timeline with the game's defaults for the receiver, `volume` 1, the device at 48000 Hz and no room. It writes
   `<demo>.<speaker>.game-<fps>.wav` (16-bit) and `<demo>.<speaker>.game-<fps>.phrases.tsv`, one row for each
   phrase of `codecInfo.channel.spurts`: its start and end in the source's seconds, `opened` or `joined`, its
   `offsetStartMs`, `offsetEndMs` and `droppedMs`, and its change against the phrase before
   (`offsetStartMs` less the earlier phrase's `offsetEndMs`). It prints the counts of `codecInfo.demo` and the
   channel's opens, joins and dropped ms. Without `--timeline` the tool writes and prints what it does today.
   `tests/demovoice/README.md` describes the option, and says that these files hold a player's voice like the
   others.
9. **The records** (part a's share):
   - `tests/REFERENCE_2026.md`, finding 29: the bullet "The 17-frame cut is not in the app" and the bullet "A
     demo's received voice still decodes to float" are corrected where they stand, each marked with the date and
     this order, the old words kept. They then say: the cut is built for a demo's packets on the game's
     timeline; on the file's own timing a demo's voice still decodes to float with the app's resampler; the
     three rules built from the read alone (ruling 6) with that standing; the worked counts of the record rule
     as measured on the suite.
   - `tests/predictions/PREDICTIONS.md`: the note for the hashed model files that changed.
   - `tests/README.md`: the rows of the suites that gained checks, and the tool's row.

### The tests

Each new check fails when the code it covers is broken ("The breaks the builder makes").

- **`tests/opus.verify.mjs`** (beside the checks of `createSteamDecoder`, `:399-490`): the seven rows of the
  worked table, each block count, each `cut`, `unread` and `concealed`; that a record walked by `record()` with
  no gap, no end marker and at most 17 frames gives the samples `receive()` gives frame by frame; an end marker
  inside a record resets (the samples after it are a fresh decoder's); an end marker behind a cut is not read
  (the next frame's samples are not a fresh decoder's until a number behind resets it); a frame of length 0
  gives 480 zeros and moves the expected number; a `short` frame spends its number and ends the record; the
  number 65535 is followed by 0 with no reset; the cut changes what follows (the 5 frames after the cut record
  decode to other samples than after the same record walked with a buffer of 32).
- **`tests/voice-channel.verify.mjs`**: `arrivalZero` gives 4,096, 6,144 and 14,848; a timeline made with
  `zeroSamples: D`, D being what the timeline computes for the same settings, returns the same samples and info
  as one made without it; one made with `zeroSamples` 512 less returns the same samples 512 places later;
  the three `RangeError`s; several pushes on one tick.
- **`tests/demo.verify.mjs`**:
  - the reader: `m`, `r`, `rate` and `short` on the packets of `tests/demo/synthetic.dem`; `decode()`'s
    `packets` hold every frame byte for byte, every end marker and every silence record in their messages'
    order, with `at` at the frame log's place of each message's first frame; everything `decode()` returned
    before is unchanged (the suite's checks as they are).
  - a second fixture the suite writes with `--write-fixture`, `tests/demo/queue.dem`, with test SteamIDs of
    universe 0. Its second speaker has one short phrase from number 0, so that the page's checks on choosing a
    speaker can use the file (part b). Its first speaker is shaped as Set D's demo: phrases that open with 8
    frames from number 0 and go on with
    3 frames every fourth tick, each ended by an end marker and a silence record of 1,500 samples four ticks
    later; a pause that makes the next phrase join the queue at 300 frames a second and one that makes it open
    again; one message of 13 frames; one record that is cut; one empty packet before a phrase; two messages on
    one tick. The check that the file in the repository is the one the suite makes, as for `synthetic.dem`.
  - `synthetic.dem` on the game's timeline (inferred from the rules and measured on the prototype): the first
    speaker's three messages are all refused, one record is cut, and the render is silent; the second speaker's
    two messages are taken with 7 blocks concealed.
  - the tool: `--timeline game` on `queue.dem` writes the two files and prints the counts; without the option
    its output is what it was.
- **`tests/render-channel.verify.mjs`**, a section of its own:
  - **the reference.** For `queue.dem`'s packets the suite builds the voice by itself: the library's decoder
    driven by a walk of each record written in the suite, the resampler module loaded by itself, the gain made
    by the engine's `createGain` and reset at each open, and `voice-channel.js` loaded by itself with the zero.
    `process()`'s signal at the mix point (`onGain`) equals it sample for sample, and `codecInfo.channel` equals
    its info, at 300, 100 and 66.67 frames a second, with the auto-gain on and off;
  - the phrases: at 300 frames a second the phrase after the short pause joined and the one after the long
    pause opened, with offsets in ranges the suite states from its measured values; the gain was reset once per
    open;
  - the refused message is not heard and its tick has an empty packet; the cut record's message is not heard
    and the message after it decodes as after a cut; the empty packet opens a channel; two messages on one tick
    lose one sample each;
  - `codecInfo.demo`'s counts for the fixture; `frameLog` as played against `sent`; no `arrivals`;
  - the ticks: the same packets with every tick halved and `tickSeconds` 0.03 give the same samples; with
    `firstTick` and every tick moved by 1,000 the same samples; `tickSeconds` as the float 0.015 over 240,000
    ticks gives whole arrival ticks equal to the tick differences;
  - the refusals: each malformed member; `opts.arriveAt`; a received source without `packets` (the row of
    `:648-652` stays a throw); the codec bypassed; another codec;
  - jitter and loss change no sample of a demo's render on the queue;
  - with `timeline` `'source'` the packets are not read: the render with `packets` in the received source equals
    the render without them, sample for sample, and equals a hash recorded on `main` before any change.
- **`tests/render-stream.verify.mjs`**: a case for a demo on the queue (the packets built as the suite builds
  its received voice, `:131-145`), streamed at the suite's uneven and whole chunk plans, equal to `process()` in
  samples and `codecInfo`; its hashes are added to the recorded tables and no recorded hash changes.
- **`tests/stages.verify.mjs`**: a demo on the queue keeps A and nothing else, starts from A the second time
  with the same samples, and `stagesHold` gives `'a'` or `null` as for a demo today.

### Files

May touch: `demo.js`; `opus-codec.mjs` (`createSteamDecoder` and its comment only); `voice-channel.js`
(`arrivalZero`, `createTimeline`'s D and options, the export, the header); `engine/steam.js`; `engine/render.js`;
`engine/render-stream.js`; `tests/opus.verify.mjs`, `tests/voice-channel.verify.mjs`, `tests/demo.verify.mjs`,
`tests/render-channel.verify.mjs`, `tests/render-stream.verify.mjs`, `tests/stages.verify.mjs` (new checks and
cases; no recorded value changed); `tests/demo/queue.dem` (new, written by the suite);
`tests/demovoice/extract.mjs`, `tests/demovoice/README.md`; `tests/README.md`; `tests/REFERENCE_2026.md` (finding
29, the two bullets); `tests/predictions/PREDICTIONS.md`; the report. `sw.js`: never the number, and no new file
joins its list (the fixture is not a site file).

May not touch: any file under `app/`, `index.html`, `audio.js`, `audio-worker.js`, `live.js`, `live-worker.js`,
`engine/live-chain.js`, `engine/network.js`, `engine/gain.js`, `engine/mix.js`, `engine/codec.js`,
`steam-sender.js`, `constants.js`, anything under `vendor/`, `tests/demo/synthetic.dem`, `tests/steam.verify.js`,
`tests/verify.js`, `tests/browser.verify.js`, `tests/predictions/predictions.json`, `docs/PROGRESS.json`,
`docs/README.md`, `CLAUDE.md`.

### What must not move

- Every recorded value of every suite: `git diff origin/main -- tests/` shows added checks, added cases with
  their hashes, the new fixture, and no changed hash, reference or tolerance.
- Every render that is not a demo's voice on the game's timeline. The model's path on either timeline, the other
  codecs, the codec skipped, the live chain.
- A demo on the file's own timing: `process()` and `createRender()` with a received source and `timeline`
  `'source'`, undefined or `null` give the samples and `codecInfo` of `main`, with or without `packets` in the
  received source.
- `demo.js`'s `parse()` and `decode()` in everything they return today; `tests/demo/synthetic.dem`, byte for
  byte.
- `createSteamDecoder`'s `receive()`, `late()`, `carry()`, `end` and `free()`; `createSteamStream`;
  `steamRoundTrip`.
- `createTimeline` without `zeroSamples`; `steamChannel` without it; `ARRIVAL_SECONDS` and D.
- The page: the browser suite passes unchanged, since the page still sends the file's own timing for a demo
  (`app/render.js:341`).

### Done means

| What | Command | Holds |
| --- | --- | --- |
| the record rule | `pnpm test opus` | passes with the new checks |
| the reader, the fixtures, the tool | `pnpm test demo` | passes with the new checks |
| the zero | `flock /tmp/tf2ve-heavy.lock pnpm test voice-channel` | passes; no recorded value changed |
| a demo on the queue is the reference | `flock /tmp/tf2ve-heavy.lock pnpm test render-channel` | passes |
| the stream is `process()` | `flock /tmp/tf2ve-heavy.lock pnpm test render-stream` | passes; hashes added, none changed |
| the kept stages | `flock /tmp/tf2ve-heavy.lock pnpm test stages` | passes |
| the lists | `pnpm test harness site` | pass (no engine file was added) |
| everything else | `flock /tmp/tf2ve-heavy.lock pnpm test`, then the browser suite as `CLAUDE.md` gives it, under the same lock | all pass; the browser suite unchanged |
| the cache | `node tests/cache-number.mjs origin/main` | says a cached file changed; the builder does not set the number |
| the inspection | CI on the branch's head | `verify` with the conclusion success |

The report gives: the measured figures of the suite's phrases at the three frame rates; how long a demo of ten
minutes of voice takes on the game's timeline and on the file's own, in Node, with what else ran on the machine;
the tool's command for the orchestrator's private look (ii); what was not done.

### The breaks the builder makes

| Break | The check that must fail |
| --- | --- |
| the buffer holds 18 frames | the worked table's cut rows |
| the cut frame's number is not spent | the frame after 18 frames conceals none |
| concealed blocks are not counted toward the 17 | 10 concealed and 7 decoded |
| the walk reads on after a cut | an end marker behind a cut |
| `record()` conceals on a number behind | the reset on a number behind |
| a new decoder for every message | the reference at 300 frames a second |
| a new resampler at an end marker | the reference |
| the resampler called once per message with two records joined | the message of two records |
| a refused message handed to the gain or the channel | the refused message is not heard |
| a refused message not pushed at all | its tick has an empty packet (the channel's opens) |
| the refusal judged per record | a message of two records that fit apart and not together |
| the empty packet left out | the empty packet opens a channel |
| two messages on one tick joined into one packet | one sample each |
| the arrival tick from `tick` alone, without `firstTick` | ticks moved by 1,000 |
| the arrival tick without `tickSeconds` | ticks halved at 0.03 |
| the model's zero in place of the demo's | the reference; the opened phrase's offset |
| the gain not reset at an open | the reference with the auto-gain on |
| `at` taken as the packet's first block when blocks were concealed in front | the played frame log against `sent` |
| `packets` read on the file's own timing | the render with `packets` equals the render without |
| `createRender` feeds everything at its first piece and never advances | still equal (so this is not a break the suite can see; say so in the report) |
| `createRender` advances past a message it has not pushed | the stream is `process()` |
| `opts.arriveAt` accepted with a demo's packets | the refusals |
| a packet whose tick falls accepted | the refusals |

### Stop and ask

- A recorded value of any suite moves, or a demo on the file's own timing differs from `main` in any sample.
- The record rule cannot give the worked table's counts with the pinned library.
- `createRender` cannot be made equal to `process()` with the bound as written.
- W3-02c-3a is not merged when the part starts, or what it merged differs from "Where this meets W3-02c-3" in
  a way that touches this order's lines.
- `createTimeline` cannot take the zero without changing what it returns for a caller that does not pass it.
- Anything that would need the owner's demo or a take. The builder has the repository only.
- The budget is passed.

Needs no approval: merging `main` in, a retry after a network error, re-running a job that died before any test
ran.

### What the reviewer attacks

The record rule against the read, line by line of the pseudo-code, with records the suite does not have: a gap
of exactly 10, of 11 and of 65,535; a cut reached by concealment alone (17 blocks before the first decode is not
possible, 10 concealed and 7 decoded is; 10 concealed twice in one record is); a record of end markers only; two
end markers in a row. A demo that begins inside a phrase. A message of a silence record, then sound, then a
silence record. Ticks that fall. A `tickSeconds` of 0.0149 and of 0.0151 over an hour. The reference built with
the suite's own walk changed in each of the ways the breaks list, to see the suite's two sides do not share the
fault. `createRender` in pieces of 1 sample and of the whole source. Every `createTimeline` and `steamChannel`
caller without `zeroSamples`, against `main`. A demo on the file's own timing against `main`, by hash.

## Part W3-02g-b: the page and the documents

Built after part a is merged and after the orchestrator has read the private look (ii) and ruled on the page's
default (ruling 3).

### Build

1. **`app/source.js`, `loadDemoFile`** (`:358-371`): for a Steam speaker the received source gains `firstTick`,
   `tickSeconds` and `packets`, the entries of `decoded.packets` whose `at` is below the samples kept (the
   10-minute limit of `:364`). `state.sourceDemo` gains `queue`: true when the speaker's codec is `steam` and
   every kept packet's `rate` is `null` or 24000.
2. **`app/render.js`, `sourceRenderOptions`** (`:339-343`): a demo keeps the file's own timing only when its
   `queue` is false. The comment above it says so. `DEMO_IGNORES` stays as it is: `fps`, `bufferMs` and
   `timeline` are in a demo's key, so a change of the frame rate renders a demo again; jitter and loss are not,
   and start no render.
3. **`app/console.js`.**
   - `sourceTimingReason` (`:588-594`): for a demo whose `queue` is false the reason reads `this demo's voice is
     not at 24,000 Hz`; for any other demo there is no reason. The comment says a demo's Steam voice runs the
     queue since this order.
   - `updateJitterNote` (`:673-680`): on Steam voice, with jitter above 0, a demo on the queue shows the demo's
     line (`JITTER_NOTES.demo`, its words unchanged) where today no line would show. A demo on the file's own
     timing keeps the line it has today.
   - The jitter help (`index.html:154`) and the console's help for `net_fakejitter` (`app/console.js:382`): the
     sentence "On the file's own timing, and so for a video or a demo's voice, it does nothing" becomes "On the
     file's own timing, and so for a video, it does nothing. It does nothing for a demo's voice either: a demo's
     packets reach the queue on the demo's own ticks."
   - The strip's cells need no change of code: the Receiver cell reads `queue at N fps` for a demo on the queue
     through `receiverStep` (`:652-667`), and the Network cell keeps "loss and jitter off (a demo's voice as
     received)".
4. **`app/render.js`, the render's console lines** (after the queue's line, `:530-535`), when `codecInfo.demo`
   is there:
   - always: `S_Voice: the demo's own packets on the demo's own ticks: M messages, S on a tick with another. A
     demo has the tick SourceTV wrote each message on (every fourth tick in the one demo measured), so arrival is
     known to about 60 ms`;
   - when any of the three is above 0: `S_Voice: R messages over 12 frames were refused by the game and are not
     heard; C records were cut at 17 frames; P messages arrive after the render's end`, each part only when its
     count is above 0.
5. **The lane, the hover, the legend, the line beside Hear and the real-take panel** need no change of code:
   they follow `codecInfo.channel` (`app/visualizer.js:883`, `app/render.js:776-778`, `app/realtake.js:53-59`).
   The browser suite shows them on a demo.
6. **The documents.**
   - `docs/PAGE.md`: "TF2 demos" (`:34-43`): a demo's Steam voice renders on the game's voice queue by default,
     through Steam's decoder as read, on the demo's own ticks; on "The file's own timing" it is decoded as
     before; what the ticks are and are not (SourceTV's, to 60 ms); the Original is the decode on the file's own
     timing on either setting. The lines on Phrase timing's note, jitter and the strip (`:174`, `:189`, `:196`,
     `:202`) follow.
   - `docs/ACCURACY.md:106`, `:117-120`: what is built and what is not for a demo.
   - `tests/REFERENCE_2026.md`: the two notes "a demo's voice, a video and the live monitor keep it" (`:1076`,
     `:1646`), the two lists that name W3-02g as not built (`:1520`, `:1530`) and the table rows that name it
     (`:1541`, `:1542`, `:1544`) are corrected where they stand,
     marked with the date. The orchestrator's private figures go in by the orchestrator, not by the builder.
   - `docs/FINDINGS.md:133` if its sentence on the limits then needs the demo's path named.
   - `README.md`, where it describes demos and Phrase timing.

### Files

May touch: `app/source.js`, `app/render.js` (`sourceRenderOptions`, its comment, the console lines),
`app/console.js` (`sourceTimingReason`, `updateJitterNote`, the help's sentence, their comments), `app/core.js`
(the comment of `state.sourceDemo`), `index.html` (the one sentence at `:154`), `tests/browser.verify.js`, the
documents of item 6, the report. `sw.js`: never the number.

May not touch: `voice-channel.js`, any file under `engine/`, `demo.js`, `opus-codec.mjs`, `audio.js`,
`audio-worker.js`, `app/visualizer.js`, `app/realtake.js`, every suite but the browser's,
`tests/predictions/predictions.json`, `docs/PROGRESS.json`, `docs/README.md`, `CLAUDE.md`.

### What must not move

- The engine and every render: `git diff origin/main --stat -- engine audio.js voice-channel.js demo.js
  opus-codec.mjs` prints nothing.
- A source that is not a demo: every check of the browser suite that loads no demo passes unchanged.
- A demo with Phrase timing on "The file's own timing": the render's key and samples as on `main`.
- A demo of `vaudio_celt`: as on `main`.

### Done means

All in `tests/browser.verify.js`, run as `CLAUDE.md` gives it under `flock /tmp/tf2ve-heavy.lock`; then
`flock /tmp/tf2ve-heavy.lock pnpm test`; then CI's `verify` on the head.

- `tests/demo/queue.dem` loaded with the page's defaults: the render's key has `timeline` `'game'` and `fps`
  300; `codecInfo.channel.source` is there; no line under Phrase timing; the Receiver cell ends `queue at 300
  fps`; the line beside Hear shows; the console has the demo's line with its counts and the queue's line.
- The lane on that render: the hover on a slot of the phrase that joined says `joined the queue` and how early;
  on a slot of an opened phrase, `opened the queue`; a skip is marked at 300 frames a second.
- With jitter 50 and loss 10 on that demo: the jitter line is the demo's; the Network cell says "loss and jitter
  off (a demo's voice as received)" and is not marked; no render starts; `codecInfo.arrivals` is absent.
- `fps_max 67` on that demo renders it again, with other phrases opened and joined than at 300 as the engine's
  suite has them.
- Phrase timing set to "The file's own timing" on that demo: the key has `timeline` `'source'` and no `fps`, no
  `channel`, the Receiver cell says "the file's own timing", and the samples equal `process()` called in the
  page with those options.
- `tests/demo/synthetic.dem` on the queue is silent for its first speaker (part a), so a check that loads it
  would assert less than it does today. The builder reads each place that loads a demo: [Browser 3h]
  (`:711-768`), the two timeline checks (`:2352-2363`, `:2660-2672`), the long demo (`:3336-3350`, made by
  `longDemo()`, `:3120`) and the speed suite's demo (`:4376-4396`). Each either loads `queue.dem` or sets
  `voice_timeline source` before the demo, so that it asserts what it asserts today; [Browser 3h]'s lane check
  (`:757-759`) reads the file's own timing's frames and keeps that timing. The report lists each place and
  which of the two it took.
- One check is added on `synthetic.dem` with the defaults: the first speaker's render is silent, the counts of
  frames, lost and DTX frames are the file's own timing's, and the console says 3 messages were refused and 1
  record cut.
- A demo whose packets are not at 24,000 Hz (the page's demo state set by hand, as `:2551` sets one): the line under
  Phrase timing gives the new reason, and the key has `timeline` `'source'`.
- The two checks that held "a demo's voice keeps the file's own timing" (`:2352-2363`, `:2660-2672`) are
  restated to what is true now. Beyond those and the fixture or timeline of the places listed above, no check
  is changed.
- A picture of the lane on `queue.dem`, in the report.

### The breaks the builder makes

| Break | The check that must fail |
| --- | --- |
| `sourceRenderOptions` as on `main` | the key has `timeline` `'game'` |
| `packets` not handed to the worker | the render throws, or the key's render fails |
| the packets not cut at the 10-minute limit's samples | a check on the count handed over |
| the jitter line as on `main` | the demo's jitter line on the queue |
| the reason shown for every demo | no line under Phrase timing |
| the refused messages' line left out | `synthetic.dem`'s console line |
| `fps` left out of a demo's key | `fps_max 67` renders again |

### Stop and ask

- A check of the browser suite that loads no demo changes its result.
- The page's worker cannot be handed the packets (a clone error, or a render that takes more than twice the
  time the same demo takes on the file's own timing).
- The private look (ii) was not read, or ruling 3 was not given.

### What the reviewer attacks

A demo loaded, then a second speaker chosen, then an audio file, then the demo again: the key, the note and the
strip each time. A demo with the codec switch off. A share link or saved settings with `voice_timeline source`
and a demo. The batch with a demo among its files. A render cancelled while the packets are being decoded. The
words of every new line against "Writing the documents".

## The private checks

The orchestrator's, on the owner's record. Nothing of them is copied into the repository but numbers. The
report's section "For the orchestrator's private look" has the same steps with their commands.

- **(i) Before part a ends, on `main`'s reader:** what Set D's demo holds that this order's rules can reach: the
  tick length; how many messages share a tick with another; the spacing of the messages' ticks; the frames per
  message and the most; messages over 12 frames; gaps in the numbers; messages with more than one record; empty
  packets; rates other than 24000; frames of length 0. It says which rules Set D can test (the path, the ticks)
  and which it cannot (the cut and the refusal, if no message passes 12 frames).
- **(ii) After part a is built, on its branch before the merge:** Set D's demo rendered on the game's timeline
  with the tool at a list of frame rates; the phrases that join and open at each, against the 17 transitions of
  the sender's take that can be read (finding 21); the frame rate at which they agree; the same for the second
  listener, where no phrase moved; how much of the last phrase the render's length cuts; and the Set J check of
  W3-11a's second read made again with `record()` in place of the cut done by hand.
- **(iii) After part b, on the page:** Set D's demo with the sender's take in the real-take panel, at the frame
  rate (ii) found: the panel's line on phrase starts.

If (ii) finds no frame rate at which the demo's render and the take agree on which phrases start early, part b
is not built as written: ruling 3 is asked again.

## Rulings wanted before the build

Each with the planner's recommendation and what it rests on.

1. **A demo on the file's own timing keeps today's decode** (recommended), or moves to Steam's decoder too.
   Rests on: the brief's "what must not move"; the Original is that decode; moving it changes every recorded
   hash of a demo's render and what a visitor hears as the Original, which is an order of its own.
2. **The zero of a demo's render on the queue is the module's latency less 0.16 s, on whole blocks**
   (recommended): 4,096, 6,144 and 14,848 samples at 66.67, 100 and 300 frames a second. The other ways: the
   wait alone (the same up to 230 frames a second; 435 ms at 300, where every opened phrase would then sit
   about 95 ms early), or no zero (every phrase 90 to 340 ms later than the Original, and the render's end cut
   by as much). Rests on: an opening of 8 frames in 17 of 20 (measured, finding 25); the zero is the model's
   own and moves no phrase against another.
3. **On the page a demo's Steam voice follows Phrase timing, so it runs the queue by default at `fps_max` 300**
   (recommended, once the private look (ii) is read), or it stays on the file's own timing until asked.
   Rests on: the decision of 2026-11-10 that the page renders the game's timeline by default; against it, a
   demo's ticks are SourceTV's to 60 ms, and the listener's frame rate is not in a demo.
4. **`createRender()` runs a demo on the queue as `process()` does** (recommended), or refuses it. Rests on:
   W2-02's rule that the two are equal, and ruling 7 of 2026-11-11 (the same list) for the model's path. No app file calls
   `createRender` today.
5. **Nothing is kept for a demo beyond A** (recommended), or the decoded and resampled packets are kept as B.
   Rests on: 8.4 s and 9.6 s for 9.7 minutes of voice on the prototype, against about 53 MB held for ten minutes
   (computed: 26.5 million 16-bit samples); a demo today keeps no B either.
6. **Three rules read from Steam's client and reached by nothing in Set D are built from the read alone, each
   with that standing in its comment and in finding 29** (recommended), or left out and counted: a silence
   record dropped behind more than 0.2 s of sound in one message; a frame of length 0 as 480 zeros; a frame
   that runs past its record ending the record.
7. **A decoder that has decoded nothing expects number 0** (recommended, as the render's decoder has it), or
   takes its first frame's number as expected. Rests on: inferred; not read. It decides what a demo that begins
   inside a phrase does: with 0, up to ten frames are concealed in front and a first message of 3 frames or
   more is then refused. `tests/demo/synthetic.dem` is such a demo for both speakers.
8. **The order of work:** part a after W3-02c-3a's merge and beside W3-02c-3b; part b after W3-02c-3b's merge
   and the private look (ii) (recommended).
9. **A second reader on the stronger model for part a** (recommended; `docs/PIPELINE.md`), none for part b.

## Rulings (2026-11-14, the orchestrator)

All nine as the planner recommends: a demo on the file's own timing keeps today's decode; the zero is the module's
latency less 0.16 s on whole blocks; on the page a demo's Steam voice follows Phrase timing once private look (ii) is
read; `createRender()` runs it as `process()` does; nothing is kept beyond A; the three rules read from Steam and
reached by nothing in Set D are built from the read alone and marked so; an unused decoder expects number 0 (inferred,
marked so); the parts in the order of the table; a second reader for part a, none for part b. A plan reviewer reads
the order before part a is built; part a starts after W3-02c-3a is merged. The orchestrator runs private look (i)
meanwhile.

## The orchestrator's private look (i) (2026-11-14)

The plan report's script on Set D's demo at `main` `f5de42a` (measured, private; the demo stays private). It holds
one speaker:

| Figure | Set D |
| --- | --- |
| tick length | 0.014999999664723873 s (the float 0.015) |
| messages | 1,816 |
| ticks holding 1 / 2 messages | 1,264 / 276 |
| ticks between one message's tick and the next | 4 at 1,376, 8 at 146, longer 15 times (the pauses) |
| frames a message | 0 to 8: 0 at 19, 1 at 181, 2 at 235, 3 at 1,155, 4 at 189, 5 at 19, 6 at 1, 8 at 17 |
| records a message | 1 in every message |
| sample-rate records | 24,000 in every message |
| silence records | 750 samples twice, 1,500 samples 17 times |
| messages over 12 frames, empty messages, gaps, numbers behind, frames of length 0, frames past their record | none |
| first number of each phrase | 0, at all 20 phrases |

**What follows.** Set D reaches the path and the ticks, and "several messages on one tick" (276 ticks), on SourceTV's
60 ms spacing; it reaches neither the 12-frame refusal nor the 17-frame cut nor any of ruling 6's three rules, so the
cut rests on Set J (look ii, step 5), and those rules stay built from the read alone, marked so. Every phrase starting
at number 0 agrees with ruling 7's inferred expectation and does not test it.

## After the plan review (2026-11-14, the orchestrator)

A plan reviewer read the order as its builder would (ready with edits). It rebuilt the worked table by an independent
walk on the pinned libopus and the swresample port (all seven rows match) and `synthetic.dem` on the queue (the first
speaker's three messages refused, the second's two taken), and recomputed `arrivalZero` (4,096, 6,144 and 14,848;
never below 0), all measured. Each point binds part a's builder and holds over the text above.

1. **`steamChannel().zero` with `zeroSamples`.** W3-02c-3a's `steamChannel` returns `zero: zero(bufferMs, fps,
   lookahead / STEAM_RATE)` (`engine/steam.js:246` on its branch). With `zeroSamples` given, `steamChannel` passes no
   codec delay and its `zero` is `zeroSamples`; `steamDemoVoice` is given the zero explicitly; a check that
   `steamChannel({ zeroSamples }).zero === zeroSamples`. The table of meeting places gains this row.
2. **The silence-record drop is checked**, with packets built in the render-channel suite: 11 frames then a silence
   record of 750 (9,702 is more than 8,820: dropped, `droppedSilence` 1) and 10 frames then 750 (8,820 is not more:
   kept, about 10,198 samples). A break row for each.
3. **`queue.dem` gains four shapes**, and the payload writer in `tests/demo.verify.mjs` learns type 0 records and
   several records a message (within its file): a message of 7 + 7 frames in two records (each fits, together refused)
   and one of 4 + 5 (taken), so the rows "the resampler called once per message with two records joined" and "the
   refusal judged per record" fail when broken (one call over a joined 7 + 7 differs from two calls in 6,177 of 12,348
   samples, measured); a gap between two frames of one taken message; a message past the end (`pastEnd` 1, `pushed`
   messages − 1, `channel.packets` = `pushed`), with a break row "past-end messages pushed".
4. **What `decode()` returned before** is held by hashes of `samples`, `frameLog` and `frameBytes` for both speakers
   of `synthetic.dem`, recorded on `main` before any change, not by the suite's counts alone.
5. **The opus suite** compares `record()` with `receive()` frame by frame, which has no buffer; `record()` takes no
   buffer size (17 stays a named constant).
6. **Places that read two ways.** The builder settles each in the report with its choice, consistent with the order's
   rules, and a check for each: the `source` of a message whose packet starts with a silence record's zeros; whether
   past-end messages are decoded and counted in `concealed`, `refusedMessages` and the other counts; whether
   `onDecoded` is called for silence records; `at` is the `pos` where the frame was laid and its `frameLog` index
   `round(at / 480)`, so the "frameLog as played against sent" check allows a slot at `pos` ≡ 360 (mod 480) to show its
   neighbour's code (`steamPlayedInfo` maps by floor). For part b: `app/console.js:382`'s sentence keeps its second
   half ("The other codecs: ..."); the two timeline checks (`tests/browser.verify.js` near `:2352` and `:2660`) set
   `voice_timeline source` first and keep their subject, and a check whose subject is the queue loads `queue.dem`.

Size stands: 12 hours for part a (the edits add under one), 5 for part b. Part a starts after W3-02c-3a is merged and
may run beside W3-02c-3b.

## The private look (ii), the review, the second read and the rulings (2026-11-14, the orchestrator)

**Private look (ii)** (measured, private; the demo and takes stay private), on `51520dd`, Set D's demo for the sender
at eight frame rates. At every rate: 1,816 messages given to the channel, 276 on the tick of the one before, none
refused, cut or past the end. Against the 17 transitions readable in the sender's take (finding 21: early starts at
spurts 4, 6, 9 and 13; four returns; nine unchanged):

| Frame rate | Opens | Joins | Dropped | Of the four early starts, joined | Within 60 ms of the take |
| --- | ---: | ---: | ---: | --- | --- |
| 300 | 17 | 2 | 2,357 ms | spurt 6 only (−298.2 ms, 27 off) | 8 of 17 |
| 250, 240, 230 | 18 | 1 | 1,114, 870, 628 ms | none | 9 of 17 (the nine unchanged) |
| 200, 150, 100, 66.67 | 18 | 1 | 107, 0, 0, 0 ms | none | 9 of 17 (the nine unchanged) |

Rates 251 to 600 give spurt 6 alone; 1000 gives spurts 4, 6 and 9 but not 13. **No frame rate gives the four early
starts.** The second listener's take (no phrase moved) agrees with no join up to 250 frames a second. The last phrase
falls at most 0.5 ms past the render's end. Set J's cut, made again with the built `record()`: 524,256 of 524,288
samples, the second read's count.

**The review** (merge after two test gaps) and **the second read** (merge; no fault in the code). The second read adds
(synthetic, measured): above about 231 frames a second the ring caps the latency and joins stop moving with the frame
rate, so look (ii) bounds the listener's rate but cannot find it; the join threshold is a band about 90 ms wide; and
Set D's ticks are more bunched than a 60 ms grid alone explains (146 empty and 276 doubled slots against about 2.7%
and 11.1% from the grid), about 6% of messages one slot later.

**Rulings.**

1. **Part a merges after its fix round.** The engine runs a demo's own packets on the game's timeline when asked, as
   built and tested; the record rule reproduces Set J's count.
2. **Ruling 3 is withdrawn: part b is not built as written.** Even scored leniently, at every frame rate the demo's
   render misses most of the eight transitions that move in the sender's take, so the page keeps a demo's voice on the
   file's own timing, as today. The finding goes on record as open: on Set D's demo with its own ticks the queue
   starts at most one of the take's four early phrases at any frame rate up to 600 (three at 1000), which agrees with
   W3-02c-2's earlier finding that at Set D's pauses the render's queue runs out sooner than the take's. A log of the
   receiver's queue in a two-PC session (the run sheet's block 5) is the next evidence. Part b is planned again only
   after it.
3. **The fix round (part a), binding on the builder:**
   - Section 21 compares `process()` with the reference on `queue.dem` with the source cut (for example at 72,000
     samples, at 300 and 66.67 frames a second) and asserts that at least one message falls in [length, length + Z)
     (the break "`endBlock` without the zero" passed every check).
   - A message of `[{ silence: 750 }, { frames: … }]` among section 21's silence packets, its `codecInfo.channel.source`
     and spurts compared with `demoReference` (the break "`before` dropped" passed every check).
   - The comment in `engine/steam.js` and finding 29 give "a refused message opens a channel" its standing: chosen
     (ruling 5 of 2026-11-11, one line of Set J's log), not read. The two choices that make no resampler call (a record
     that made no block, a silence record of 0 samples) are marked as choices in their comments.
   - The report's sentence that the figures "agree with the prototype's at 100 and 66.67" is corrected (phrase 4 is
     3.1 ms early and 8.5 ms late on the fixture, against the prototype's 2.6 and 3.0 late).
   - The record (`tests/REFERENCE_2026.md`, added and dated lines): an entry with this section's look (ii) table and
     ruling 2's open finding, and Set D's slot counts beside the grid's expectation, each figure with its standing.
