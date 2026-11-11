# BC-1: loss takes whole messages (the `steam` render and live chain)

Order: `docs/work-orders/BC-1-loss-per-message.md`, with its amendment of 2026-11-11. Branch
`claude/bc-1-loss-per-message`, from `main` at e364061 (live cache v30).

## Commits

- `e4ad0cf` the change and its tests: `audio.js`, `opus-codec.mjs`, the two strings of `index.html`, the two help
  strings of `app/console.js`, comments in `constants.js`, `sw.js` `CACHE` v31 (v32 after the merge of main), `tests/verify.js`,
  `tests/opus.verify.mjs`, `tests/accuracy.takes.json`.
- `7586e75` the five recorded renders that move, re-recorded in a commit of their own.
- `7baddcc` test 10 fails cleanly (it threw) on code with no network counts.
- `d5cb7b1` the docs: `tests/REFERENCE_2026.md`, `README.md`, `tests/predictions/PREDICTIONS.md`.
- This report.

## What was built

**A. The draw.** `TF2Audio.steamMessageLoss(lossPct, seed)` returns a function that says, once per call, whether the
next message is lost: `u < p`, `p = clamp(lossPct, 0, 100) / 100`, `u` the next number of
`mulberry32((seed ^ 0x4C4F5353) >>> 0)`, `seed = finiteOr(opts.seed, 0xC0FFEE) >>> 0`. `process`, `createRender` and the
live chain call it (through `steamLoser`) once per sender message in the sender's order, so the same sound, seed and
settings lose the same messages in all three. `opts.loseMessage(index, message)` replaces the draw in all three. On
`steam` the per-frame mask is built as before with a loss of 0 (`buildLossMask` and `streamLossMask` with the
render's `rand`, `frameMs` and `jitterMs`), by frame number, whether or not the frame's message is lost: only jitter's
late frames come from it.

**B, C. The codec module** (`opus-codec.mjs`). `createSteamStream().message(msg, miss, lost)`: a lost message's frames
are encoded (and `miss(f)` is still called for each), never given to the decoder, and wait as lost frames; a lost
silence record returns no samples; the encoder is freed at every spurt end, the decoder reset only by an end marker
that arrives; a new spurt on a decoder that was not reset calls `decoder.carry()`. The result gains `lost` and
`skipped` (the lost frames in front of the message's first arrival that no block stands for). Concealed blocks now
stand for the **last** `conceal` lost frames. `createSteamDecoder` counts a gap from the numbers: `next` (one past
the last frame decoded) and the late frames at or above it since then; `conceal = min(seq - next - late, 10)`. Its
`lost()` is gone (a lost frame is one the decoder never sees); `carry()` forgets the late count. With no carry this
is the old count exactly (the old decoder tests pass unchanged but for the removed `lost()` calls).
`steamRoundTrip` takes `options.lose(index, msg)`.

**D, E, F. The timeline** (`audio.js`, `steamTimeline`). Every message is given to `add()`, lost or not, so a spurt
is anchored at its opening message's start whether that arrived. A packet goes to the resampler, and then: if it is
longer than `STEAM_ROOM = 22528 / 2` samples (`steamFits(n)`, citing W3-03) it is refused: no gain, not laid, no
slot, and the cursor moves past its place. Otherwise it is laid whole at
`cursor + 882 x skipped`. The live chain's cut applies to the first packet laid in a spurt, whichever message
brings it. `codecInfo.network = { messages, lostMessages, refusedMessages }` on a `steam` render when `lossPct > 0`,
`loseMessage` is given or a message was refused; absent otherwise. The live chain's `stats` gain `lostMessages` and
`refusedMessages`. `retimeSpurts` treats slots whose laid spans meet as one spurt, so a hole inside a sender's spurt
does not split it (nothing changes at loss 0: there a gap between slot runs always lies between spans).

**Words.** "Packets lost %"; the Laggy description "18% of voice packets lost + 50 ms jitter" (its `aria-label`
kept); the `net_fakeloss` help as the order words it with the amendment's ending; the `net_split` help's addition;
the comments of `constants.js` (no value changed) and of `audio.js`.

## Departures from the order, and precisions

1. **Rule E's place.** The order writes a packet's place as `anchor + 882 x (its first block's frame - the spurt's
   first frame)`. Built as `cursor + 882 x skipped`, where the cursor is where the spurt's last packet laid or
   refused ended. The two are equal whenever no late frame is in play (no jitter), which is every case the order's
   tests describe; the tests' reference uses the order's formula. They differ with jitter: a late frame's block can
   come before the concealed blocks of the frames lost ahead of it (late f5 before concealed f4), so "the first
   block's frame" is not the earliest, and the order's formula would lay such packets a slot away from today's laying
   at loss 0 (the 'jitter 500 ms' render) and would break "with nothing lost, today's laying". The built rule is
   today's laying whenever no gap passes ten, and puts the arriving frame at its own time after a longer gap.
2. **`createSteamDecoder` lost `lost()` and gained `carry()`** (above). `tests/opus.verify.mjs` drops the `lost()`
   calls and gains a check of `carry()`.
3. **`retimeSpurts`** merges slot runs whose spans meet (above): needed for the frame log under re-timing once holes
   exist; the order's sentence on spans covers the samples.
4. **Present tests reworked** (each keeps its own rule):
   - "under loss the decoded samples are the module's...": unchanged; its gap of 12 can now be refused, which happens
     after `onDecoded`, so its comparison stands (a comment says so).
   - "the cap: 15 frames lost in a row" and "the sound after a gap of 15 is 100 ms earlier", "a gap of 5": replaced by
     test 7's gap of 15 in front of a 1- or 2-frame message, and gaps of 10 and 5 in front of the same message. The
     late-frame check of that block stays.
   - "15% loss and 50 ms jitter" (live): its seed search now reads the message draw and asks for runs of 8 to 10 lost
     frames and of more than ten inside spurts; it checks that nothing is moved.
   - "30 frames lost in a row: one packet moved": now the 30 lost in front of a 1- or 2-frame message, 20 slots empty,
     10 concealed, nothing moved, the live chain the render, at the same four plans.
   - "net_split changes the loss pattern": test 10.
   - The live suite's stream wrappers (`withStreamMask`, `withBlockTally`) pass the new `lost` argument through.
5. **`tests/browser.verify.js`** was not touched; its checks pass (below).

## The tests and the break that fails each

The reference (`steamLossTests` in `tests/verify.js`, section [5d]) is built from a dry run of `steam-sender.js`, the
vendored libopus 1.1.5 driven directly, `vendor/swresample` and a fresh `createGain`, with the order's formula for
the place; never from the render's steam path. Breaks were applied to a copy of the branch and the new tests run
against it; "fails" lists the new checks that failed.

| Test (checks in [5d] unless named) | The break (each in a copy of the branch) and the tests it fails |
| --- | --- |
| 1. Whole messages: at 21.7, 37 and 49.8%, seeds 1 to 3, the messages that reach `onDecoded`, their samples, the resampler's packets and the laid signal equal the reference fed the order's draw; in front of each arrival, `min(10, frames lost since the last arrival in the spurt)` concealed (1,321 arrivals; 51 after a lost marker go by rule C) | the draw per frame (the old mask at `lossPct`, no message draw): 1, 2, 3, 4, 5, 6, 9, 10. The draw from the render's `rand`: 1, 2, 9. A bursty draw: 1, 2. Also failed by every break below marked "1" |
| 2. The draw: 20,000 draws at 5, 21.7, 37, 49.8%, share within a point, runs `1/(1 - p)` within 5%, the order's formula; 10% nested in 30%; in a render the same messages lost at jitter 0/50 and `net_split` 20/80, others at another seed | a bursty draw (a lost message makes the next lost at 50%): 1, 2. The draw from `rand`: 1, 2 (jitter changes which are lost), 9. The draw per frame: 2 (no message lost) |
| 3. `loseMessage`: one lost message of each size the signal offers (1 to 5), runs of 2 and 3 coming to 7 and 8, a run of 13 gives exactly 10; a spurt's last messages lost leave their slots empty and conceal nothing; a lost opening concealed from a fresh decoder (zeros) | the cap at 9: 1, 3, 4, 7. The cap at 20: 1, 3, 7, 11. Laying closed up (skipped ignored): 1, 3, 5, 7. The draw per frame: 3 |
| 4. The refusal: `steamFits(11264)` true, `steamFits(11265)` false; 10 in front of 3 and 9 in front of 4: nothing of the packet in the gain or the render, `refusedMessages` 1, the next packet the reference's that resampled the refused one and not one that skipped it; 10 in front of 2 played | a refused packet given to the gain: 1, 4. A refused packet kept from the resampler: 1, 4. The limit one frame higher: 1, 4 (the unit check too). The cursor left standing at a refusal: 1, 4, 7. Refusals not counted: 1, 4 |
| 5. A lost end marker: the usual case (the next spurt's samples are a marker-arrived render's); carried, at the old expected number (0 concealed) and above it (1 concealed), decoded on the old state and not on a fresh decoder; the dry run makes both | a lost message's marker delivered: 1, 5. A fresh decoder at every spurt (no carry): 1, 5 |
| 6. A lost silence record: one resampler call fewer, the gain's output the reference's | a lost silence record fed: 1, 6 |
| 7. Own time: at 37% (seeds 1 to 3) every played slot holds the loss-free render's frame size and code (2,010 slots, 295 empty); a gap of 15 (a hand-made frame mask) in front of a 2-frame message: 5 empty slots, 10 concealed at their own slots, nothing after moves; gaps of 10 and 5 in front of it | concealed blocks standing for the gap's first ten: 7. Laying closed up: 1, 3, 5, 7. The cursor left standing: 7. Also fails on `main` |
| 8. `tests/verify.js` [10b]: the live chain is the render at 22, 37, 50%, seeds 1 to 3, blocks of 480 and uneven, full and low latency (36 checks): the laid signal (low latency: but the cuts a per-sample model of the give-out rule makes), nothing moved, the same lost-message, refused, lost-slot and late counts; a played packet not first in its spurt starts at most 6,239 codec samples before the last sample pushed | the live chain ignoring loss: 36 of them and the reworked 15% check. The cut only for the opening message's packet (not the first laid): the 19 low-latency checks that meet one. Laying closed up: 29 of them and the reworked 30-lost checks |
| 9. `createRender` is `process()` in odd pieces at 37%, 49.8% with jitter, 49.8% gate off, and a lost marker plus lost silence records | `createRender` ignoring loss: 9. The draw changed in `process()` only: 9 |
| 10. ([9] of `tests/verify.js`) `net_split` 20 and 80 give the same samples on `steam` at 25% with no jitter; on `celt_22` they differ | the draw per frame: 10. Also fails on `main` |
| 11. No record passes 16 frames: 1,721 records in tests 1 and 3 (longest 14), 771 in test 8's renders (longest 15) | the cap at 20: 11 |
| 12. `codecInfo.network` absent at loss 0, present (all 0 lost) with a `loseMessage` that loses nothing, equal to the dry run's counts in test 1 | `network` always present: 12 (and 7's "no network" clause). Refusals not counted: 1, 4 |

Also `tests/opus.verify.mjs`: `carry()` on the decoder alone (above the old number conceals the gap from the old state, a late frame at or above it taken off and one below not; below it a reset). Counting every late frame, below the expected number too, fails it.

Test 10 and test 7's gap of 15 (a hand-made frame mask) were also run on `main`'s code (e364061): both fail there
(the gap of 15 conceals the gap's first ten and the rest closes up; `net_split` 20 and 80 differ at 25%).

What a lost opening's concealment gives: from a decoder that has decoded nothing, libopus's concealment is zeros
(test 3 checks every sample of the 8 concealed blocks).

## Recorded hashes

Moved (`tests/render-stream.verify.mjs`, WAV and codecInfo in `GOLDEN`, then `GAIN_GOLDEN`), old then new:

| Case | WAV | codecInfo | Gain output |
| --- | --- | --- | --- |
| steam, loss 15%, jitter 50 ms, net_split 40 ms | `a98e7093…` → `8c2989c0…` | `6dcf80da…` → `631209b3…` | `d4c36c58…` → `1ffca932…` |
| odd options | `163b94e6…` → `711b9f02…` | `e63fe11e…` → `a61dc90c…` | `52c76c01…` → `d82ae8d8…` |
| steam, gate off, loss 80%, seed 1 | `d5ed5c65…` → `a9d6a68e…` | `1a9df010…` → `e08891a4…` | `d172def5…` → `79627dd2…` |
| steam, gate off, loss 40%, seed 3 | `7285017e…` → `beb16e00…` | `6b8a3789…` → `46a8eb84…` | `2d23678c…` → `5f786410…` |
| steam, listenerPos tunnel (preset 6), loss 15%, jitter 50 ms | `89e7f2aa…` → `96c72a56…` | `e8548e53…` → `3a464c80…` | `6047d551…` → `dd4e9f10…` |

The full hashes are in the commit `7586e75`. No other hash moved: the other 63 cases of both tables (every render at
loss 0, `steam, jitter 500 ms` among them, and every case of `steam_48`, `celt_22`, `celt_44`, `speex` and the
received demo voice, loss cases included), the `steam_48` live hashes in `tests/verify.js`, the sender's reference
hash, the vendored modules' hashes (`pnpm test:vendor`), and `tests/predictions/predictions.json` (not touched).

## Checks run

`CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) flock /tmp/tf2ve-heavy.lock pnpm test:all`
on the branch at `d5cb7b1`, exit 0, 26 min 28 s:

- `pnpm test:vendor`: the Opus runtime and the libopus 1.1.5, CELT 0.11, Speex 1.0.2 and VR12 builds match their
  recorded hashes.
- `pnpm test`: `tests/verify.js` 275 passed, 0 failed; gain 93; `gain-exact --synthetic` ok; Opus 148; Speex 86;
  VR12 31; reference 42; formats 68; file rate 53; meter 50; video 46; demo 36; render-stream 520, 0 failed;
  output stage 102; voice channel 129; steam sender 109 (its reference hash among them); swresample 43; room 216.
- The browser suite: 246 browser checks passed (no change to `tests/browser.verify.js` was needed).

`tests/render-stream.verify.mjs --hashes` before the re-recording moved exactly the five cases above. CI: the first
push's run (43042035343) died installing the browser (the runner's package mirror timed out; `main`'s run of the
same minute died the same way) before any test ran.

## The suite's speech-like signal: 60 s, five seeds

`talk()` of `tests/verify.js`'s steam section (voiced syllables at 0.2 on a noise floor, with pauses), 60 s at 24 kHz,
seeds 1 to 5 for the signal and the render, no jitter, the gate on. "Played" is a slot holding a decoded or concealed
frame inside a sender's spurt; "left silent" is the share of the spurts' slots that hold none, then the part of it
before each spurt's last played frame (refused packets and the unfilled part of gaps longer than ten; the rest is
frames lost at a spurt's end, which are never concealed). Packets moved: the live chain on the same signal, blocks of
4,800 samples, `stats.movedLate` summed over the five seeds.

| Loss % | Messages lost | Frames concealed (played) | Frames played, of those sent | Messages refused | Spurt time left silent | of it inside the spurt | Packets moved live |
| --- | --- | ---: | --- | ---: | --- | ---: | ---: |
| 5 | 194 of 3838 (5.1%) | 537 | 10976 of 11114 | 0 | 0.6% (per spurt: mean 0.7%, median 0.0%, most 9.3%) | 0.0% | 0 |
| 18 | 736 of 3838 (19.2%) | 1931 | 10788 of 11114 | 5 | 2.3% (mean 2.3%, median 0.0%, most 28.6%) | 0.8% | 0 |
| 21.7 | 879 of 3838 (22.9%) | 2218 | 10654 of 11114 | 11 | 3.5% (mean 3.5%, median 0.0%, most 28.6%) | 1.7% | 0 |
| 37.0 | 1490 of 3838 (38.8%) | 3245 | 9817 of 11114 | 41 | 11.1% (mean 11.3%, median 6.8%, most 55.1%) | 7.6% | 0 |
| 49.8 | 1950 of 3838 (50.8%) | 3374 | 8493 of 11114 | 91 | 23.1% (mean 23.4%, median 22.1%, most 83.3%) | 16.8% | 0 |

The share inside the spurts is the order's computed 1%, 6% and 17% at 21.7, 37.0 and 49.8 (1.7, 7.6, 16.8% here).
The live checks also measure the order's bound: a played packet that is not a spurt's first starts at most 6,180
codec samples before the last sample pushed (the order computes at most 6,239), a spurt's first laid packet at most
6,150.

## Rendering privately with a seed (for the check before the merge)

Load the app as `tests/verify.js` does: `constants.js` and `audio.js` run in one `vm` context that already holds
`steam-sender.js`, `vendor/swresample/swresample.js`, and `TF2Room` / `TF2_ROOM_PRESETS` (`room-dsp.js`,
`room-presets.js`) as globals, with `TF2Opus = await import('./opus-codec.mjs')` set on the context. Then:

```js
const r = await TF2Audio.process(buffer, { codec: 'steam', volume: 0.15, room: { auto: 'set_c_room' },
  lossPct: 49.8, seed: 3 });              // loss15; 21.7 for loss5; 37.0 and jitterMs: 50 for combined
r.codecInfo.network;                      // { messages, lostMessages, refusedMessages }
```

- `seed` (any number; `>>> 0` is taken) sets the sender's read clock, the message draw
  (`mulberry32((seed ^ 0x4C4F5353) >>> 0)`) and the late-frame draw; the default is `0xC0FFEE`, which is what
  `tests/accuracy.mjs` uses (it passes no seed). `TF2Audio.steamMessageLoss(lossPct, seed)` gives the draw alone.
- `loseMessage: (index, message) => boolean` replaces the draw: called once per sender message in order, `index`
  from 0, `message` the sender's own object (`{ tick, spurt, first, last, start, end, pcm }`, or `{ tick, silence }`
  for a silence record; `first`/`last` are frame numbers through the render, `last = first - 1` for an end marker
  alone). A log's dropped packets can be replayed through it.
- `main`'s renders at 22, 64 and 45 take the same options on `main`'s code (no `loseMessage` there).
- `createRender(source, sameOpts)` and `createLiveChain(sameOpts, rate)` give the same samples (tests 8 and 9).

## Left for BC-2 (still loose)

The `net_fakeloss` name on the control and the command; the Laggy preset's number (18, now 18% of messages);
`net_graph`'s loss and packet rate and the status line's "ms packets" on `steam`; the `S_Voice` line and the live
panel's titles (`live.js`: "Frames lost (concealed)…", true but silent about refused messages); finding 8's title and
finding 9; `tests/testsignal/README.md`; the page's sentence under "Frames per packet" (W4-01d's "How much voice one
network packet carries. A lost packet loses all of it."), which on Steam voice no longer holds: its console help says so.

## Not done, or for the orchestrator

- The private check on Set C (the order's "Afterwards") is the orchestrator's; nothing of the recordings was read.
- `docs/PROGRESS.json` was not edited.
- The interaction of jitter's late frames with a gap of more than ten lost frames is laid by the built rule
  (departure 1); it is a stand-in until BC-4 and no test pins it beyond createRender = process = the live chain.
- The diff and the commit messages were scanned for recordings, personal details, real SteamIDs and model names:
  none (the trailers aside).

## Review round (2026-11-11)

The review found no defect in the code; it disabled pieces of it that no test noticed. Added, each shown to fail
when the piece is disabled (in a copy of the branch):

| Item | The test | Disabled, it fails |
| --- | --- | --- |
| S1 | [5d] re-timing at 49.8% with 100 ms jitter, seeds 1 to 6, on the steam section's talk: every slot that holds one of a sender spurt's frames without re-timing holds it (code and size) the same number of slots earlier with it, 0 or a move's frames (66 spurts, 7 moved, 2 of them with a hole) | `retimeSpurts`' merge removed |
| S2 | [10b] the live chain with `loseMessage` (every fourth message and every 5-frame one) is `process()` with the same function at the mix point, blocks of 480 and uneven, nothing moved, its `lostMessages` the dry run's count | the live chain ignoring `loseMessage` |
| S3 | [5d] an end marker alone (the gate off, 96,000 samples, seed 0xC0FFEE: the last message) is asked of `loseMessage`, counted in `messages` and `lostMessages`, and at a loss just above its own draw (45.11%) the draw counts it lost (36, the order's draw over all 73 messages); then on the codec module's stream, a second spurt put after it whose first frame to arrive (209) is above the old expected number (205): 4 concealed from the old state with the marker lost, 10 zeros from a fresh decoder with it delivered | a loser that skips the draw for a message with `last < first`; a lost marker delivered |
| N2 | `tests/opus.verify.mjs`: `carry()` forgets late frames counted before it (late 9 after 0 to 7, carry, 11 arrives: 3 concealed, equal to one decoder's). In the app the case needs jitter and loss together, so it is shown on the decoder alone | `carry() {}` |
| N1 | [5d] a hand-made mask: 12 frames lost and one late among them in front of a one-frame message: the arriving frame at its own slot and every slot after it as with nothing lost | the order's formula (`anchor + 882 x` the first block's frame), which puts it a slot early |

**N1, the frame log's two known flaws** (no sample is affected; not fixed, since the fix would move the codecInfo
hashes of the jitter-and-loss renders and would make the log disagree with where the samples lie): (i) a late
frame's zeros placed before the concealed blocks of the same packet log the concealed frames one slot late; (ii) a
one-frame message whose only frame is late after a gap of more than ten is laid, and logged, at the cursor, since a
packet with no arriving frame has no frames-nobody-fills count. Both are within jitter's stand-in (BC-4).

**Words (N3).** Finding 8 now says what the amendment says: the computed and the measured stand beside each other
(4.5 against 3.9 runs a second at 15; the combined take still open), and the speech paragraph's 38% is named as not
made again. The orchestrator's private check of 27a0a54 is in finding 8's correction and in the Results' note on Set
C's accuracy rows: the build equals the prototype sample for sample at Set C's settings (20 renders) and main's
renders with nothing lost (14 manifest cases); the level column moved from −1.4 to +0.0 dB (loss15), −1.7 to +0.3
(combined), +0.1 to +0.4 (loss5; seeds within +0.26); `speech_loss10` from +0.2 to +0.4 to +0.5 dB, 0.3 dB further
from 0, cause unknown (also in "What remains unverified"). The order gains a dated correction under rule E's formula:
the build's rule replaces it.

**The merge of main** (W3-17d and W4-01d, 2ab88cf): settled by hand in `index.html` (the label "Packets lost %" and a
sentence under it in W4-01d's form: "The share of voice packets that never arrive. Not the game's own number: its
net_fakeloss 5 loses about 22% of them."), `app/console.js` (the `net_fakeloss` help begins with that sentence, then
the order's words with the amendment's ending; `net_split`'s gains the order's sentence), `tests/browser.verify.js`
(the settled-words table check: the label and that sentence), `constants.js` (main's presets, BC-1's comment),
`audio.js` (the live room's spurt start, from the opening message whether it arrived, as the timeline opens it, beside
the message draw and counts), REFERENCE's model intro and PREDICTIONS' notes (both kept). `sw.js` `CACHE` v32.

**The second merge of main** (W3-20b, the `miles` profile, 6924a23): settled by hand in `app/console.js` (W3-20b's
`snd_bits` help, BC-1's `net_fakeloss` help), PREDICTIONS' notes and `tests/render-stream.verify.mjs`'s hash history
(both kept, W3-20b's first). `sw.js` `CACHE` v33. A lost `miles` frame stays per frame (zeros), outside BC-1's rule.

**Checks after both merges** (`flock /tmp/tf2ve-heavy.lock npm run test:all`, exit 0, 16 min 27 s): the five vendored
builds match their hashes; `tests/verify.js` 285 passed, 0 failed; gain 103; Opus 149; Speex 86; VR12 31; miles 73;
reference 43; formats 68; file rate 53; meter 50; video 46; demo 36; render-stream 553, 0 failed (W3-20b's eight
`miles` cases among them; no hash moved beyond BC-1's five); output stage 103; voice channel 129; steam sender 109;
swresample 43; room 215; browser 299. (After the first merge alone: 281, 520 and 285 browser, all passing.)
