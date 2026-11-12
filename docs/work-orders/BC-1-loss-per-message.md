# BC-1: loss takes whole messages (the `steam` render and live chain)

> **Status 2026-11-12: built and merged** at `a0f1cd0` (cache v33, pull request #28). Report: `docs/reports/BC-1-loss-per-message.md`.

Order of 2026-11-11, from `docs/reports/bad-connections-plan.md`. Medium: it changes how a `steam` render
with loss is computed. Branch `claude/bc-1-loss-per-message` from `main` as it stands when the build
starts; the worktree is given in the brief. Budget: 12 hours of building, then stop and report where you
are.

Only the `steam` profile (the one whose `senderGate.rule` is `'steam'`) changes, in `TF2Audio.process`,
`createRender` and the live chain. Not in this order: the engine codecs and `steam_48` (BC-5), the
receiver's queue (BC-3), jitter (BC-4), the sender (BC-6), a demo's received voice (W3-02g), the words
beyond the few listed below (BC-2).

## What is known

Each line is marked as its source marks it. "Computed" is this order's own arithmetic or a dry run of
`steam-sender.js`; it is not a measurement of the game.

| Fact | Standing |
| --- | --- |
| A network packet is lost whole. One that arrives out of order is discarded, so it is a lost packet; a duplicate is ignored | read (the plan, reads 1 and 2) |
| A voice message is never split across packets: unreliable data that does not fit a packet is dropped whole | read (the plan, read 7) |
| The engine asks Steam for voice once a tick and sends what comes as one message with its next packet; the server writes one message per listener, merged with nothing | read (W3-03) |
| So one packet carries one voice message. This holds while packets leave at least as often as Steam hands out messages, about 18 a second: a listen server's own player sends every tick (the plan, read 8). At a real server's rates a packet may carry two: not read, BC-6 | inferred |
| One chunk of Steam's capture is one message: the whole 480-sample frames of the chunk plus what the last one left | read (W3-09 section 2); measured on every message of Set J |
| `net_fakeloss N` drops a packet when a draw from 0 to 100 is at most N: (N + 1)/101, each packet by its own draw. The game has no burst process | read (the plan, reads 2 and 4) |
| On a listen server with `net_usesocketsforloopback 1`, Set C's setup, a packet meets two draws per crossing and voice crosses twice. So `net_fakeloss` 5, 10 and 15 remove 1 - (1 - (N + 1)/101)^4 = 21.7%, 37.0% and 49.8% **of voice messages** on the way from the talker to the listener | read rule, arithmetic. Not measured |
| What Set C measured at those settings: `net_graph` showed 13, 20 and 34 (the rule gives 11.5, 20.6 and 29.2 for one crossing). The app's per-frame model, fitted to the takes' damage events, needed 22%, 45% and 64% **of frames**. The two agree at 5 only | measured (finding 8) |
| Steam's decoder, frame by frame: the end marker resets it and sets the expected number to 0. A number below the expected one resets it and conceals nothing. A number above it conceals `min(gap, 10)` frames (the decoder called with no data, FEC off) and then decodes. The expected number becomes that frame's plus one. The app renders either reset as a new decoder (W3-11a) | read (W3-09 section 4; the W3-16 read, section 3); the cap seen once (Set J) |
| So after a gap of N frames: N concealed if N is at most 10; otherwise 10, and the other N - 10 are never made. Frames lost at a spurt's end are never concealed: the next spurt's number 0 is below the expected one | read (follows from the rule) |
| One record decodes to at most 17 frames, concealed ones included | read (the W3-16 read) |
| The refusal, Steam's side: if the resampled sound of a message is more than the caller's room, Steam copies nothing and returns "buffer too small". The decoder and the resampler have moved on | read (the W3-16 read) |
| The refusal, the engine's side: its room is 22,528 bytes, 11,264 samples. 12 frames are 10,584 samples and fit; 13 are 11,466 and do not | read (W3-03) |
| The engine then queues nothing for that message | inferred (W3-03); seen once (Set J: a 17-frame record logged as 0 samples, and the next message's count fits a decoder that had moved on). No second try seen; whether the engine retries was not read |
| A lost stretch is replaced in place near the true level: 54 of 55 isolated events keep the delay; at `net_fakeloss 5` the noise is at its level 99.5% of the time | measured (finding 8; the plan's table) |
| The receiver's ring holds 0.5 s, so the delay from talker to listener can shorten by no more than what is queued | read (W3-03); the consequence inferred |
| The loss-15 take runs 927 ppm fast against its source, the loss-5 take 441, the baseline 416 | measured (the W3-17c private run's clock column, fitted on one delay per spurt) |

**What a message holds on this path** (the sender as built, W3-16): 1 or 2 frames from a 750-sample chunk,
3 or 4 from 1500, 4 or 5 from 2250; a spurt's last message is padded up, 6 at most; an opening carries the
pre-roll too: 6, 8 or 9 frames with the full 2400 samples, fewer straight after a spurt, 10 at most with the
gate off. Besides sound messages there are two kinds with no frames: an end marker alone, and a silence
record. Counted on 20 minutes of gated noise through `createSender`, seeds 1 to 20 (computed): 10.3, 13.1,
64.9, 10.1 and 1.5% of sound messages hold 1, 2, 3, 4 and 5 frames; the mean is 2.80; 18.0 messages a
second. Set G's logs have 10, 14, 65 and 11% at 20, 40, 60 and 80 ms (measured, finding 28).

**Not explained, and not to be written as explained.** Finding 8 measured 4.3 and 14.1 damage events a
second at `net_fakeloss` 5 and 15, half of them one frame long. Whole messages lost at 18 a second make
about 3.1 and 4.5 runs of lost messages a second at 21.7% and 49.8%, 3.6 and 5.6 frames long on average
(computed). The plan's reading is that the fit counted windows of low correlation, not packets
(inferred). This order builds the rule as read; the private check below measures the build against that
statistic.

## Amendment after the premise check (2026-11-11): Set C shows whole messages

Before any builder started, the rule of this order was tried privately against Set C: a prototype of rules
A to E (the vendored codec driven directly, the app's receive path with `set_c_room`; equal to the app
sample for sample with nothing lost), `main`'s per-frame bursts at 22 / 64 / 45, five seeds each, and the
takes, all measured the same way. **This section overrules the text below wherever they differ.**

1. **Finding 8's take figures could not be made again and are withdrawn as a yardstick.** Its method,
   remade from its text, gives the finding's figures for the app's own renders (lost frames known) but
   not for the takes: 1.7, 3.3 to 3.6 and 3.1 to 3.2 events a second, not 4.3, 14.1 and 12.0. A lost
   message in the chirp or the voice reads as several short events, and a take's delay moves, so "half the
   events are one frame long" never showed single frames lost. The original script is not in the
   repository. What can be measured soundly is the noise parts (12 s of pink noise and eight bursts,
   20.5 s), where the reading was checked against renders whose lost frames are known.
2. **On the noise parts the takes are the read rule's** (measured; the renders as mean and range over five
   seeds):

   | | Lost runs a second | Runs of one frame | Mean run, frames | Level against the take | 12 s of noise: present / silent |
   | --- | --- | --- | --- | --- | --- |
   | loss5, the take | 3.12 | 12% | 3.5 | | 99.5 / 0.0% |
   | loss5, this order's rule at 21.7% | 3.20 (2.88 to 3.41) | 14% | 3.5 | +0.10 dB | 98.0 / 1.0% |
   | loss5, `main` at 22% | 5.04 (4.58 to 5.41) | 43% | 2.4 | -0.07 dB | 99.7 / 0.0% |
   | loss15, the take | 3.90 | 4% | 6.1 | | 76.9 / 10.1% |
   | loss15, this order's rule at 49.8% | 4.31 (3.85 to 4.63) | 8% | 5.7 | +0.19 dB | 81.0 / 10.2% |
   | loss15, `main` at 64% | 13.95 (13.55 to 14.47) | 45% | 2.2 | -2.72 dB | 98.8 / 0.0% |
   | combined, the take | 4.34 | 10% | 4.8 | | 79.7 / 10.3% |
   | combined, this order's rule at 37.0% | 4.66 (4.43 to 4.87) | 18% | 4.1 | +0.06 dB | 91.9 / 4.0% |
   | combined, `main` at 45% | 9.89 (9.21 to 10.28) | 44% | 2.3 | -1.14 dB | 98.6 / 0.0% |

   The takes' lost runs peak at three frames, as the sender's messages do; their starts and ends sit on a
   20 ms grid and on no 60 ms grid. Two draws per message (11.5 / 29.2%) and six (30.7 / 64.2%) do not fit
   at either setting; four do. So the paragraph "Not explained, and not to be written as explained" and
   corrected item 8 are replaced by this: the computed 3.1 and 4.5 runs a second, 3.6 and 5.6 frames long,
   stand beside a measured 3.1 and 3.9, 3.5 and 6.1.
3. **The refusal is seen by its effect.** Of the takes' 16 lost runs longer than ten frames, nine end with
   the sound earlier by a whole number of frames: 20 ms twice (11 lost, 10 concealed) and 260 to 340 ms
   seven times (13 to 17 frames), nothing between 40 and 240 ms. So in the table of facts "seen once (Set
   J)" becomes: once in a log, and seven times by its effect in Set C.
4. **Decision 2 stays, with other grounds.** The game does close up, by exactly a refused packet's frames,
   and stays early until the channel restarts (up to 3.4 s in the loss-15 take); only the whole take's
   average does not drift. Own time is therefore a stand-in in both directions, and it measures the same
   as a crude copy of the queue on every column above. BC-3 owns the queue. Corrected item 4's "did not"
   reads "did not on average".
5. **Where the rule is short: combined.** With lag 100 and jitter 50 the take has more silence and longer
   runs than 37.0% of messages lost one by one plus the app's single late frames give (silent 10.3%
   against 4.0%; runs 4.8 frames against 4.1). The cause is not known (overtaken packets being dropped is a
   guess). It is recorded as open in finding 8 and is BC-4's.
6. **The console's help** ends "(recordings agree at 5 and 15; 10 was recorded only with lag and jitter,
   where the rule gives too little silence)" in place of "(a recording agrees at 5; 10 and 15 are not
   confirmed)".
7. **"Afterwards"**, comparison 3: the yardstick is the noise parts' table above, not finding 8's published
   figures. Comparison 4 reports the median too; the published 38% could not be made again. The check is
   still run on the branch before the merge, now as a confirmation that the build equals the prototype's
   figures.
8. **Docs.** Finding 8 gains, as a dated correction: its take column withdrawn and why; the table above;
   "bursts averaging 2.2 frames" refuted for the noise parts (its title is BC-2's to change); open: the
   combined take's shortfall, one stretch of 340 ms of full-level noise in the loss-15 take that matches
   no part of the source (sound made past ten frames), and whether Steam's concealment is the bundled
   library's sample for sample (the takes' concealed sound falls about 0, 1 and 4 dB over 60 ms and 11 to
   18 dB by 180 ms; the library's is similar, a little slower).

## Where the plan is corrected

1. **The files.** The live chain's loss is drawn in `audio.js` (`steamLiveChain`, with `streamLossMask`),
   not in `live.js` or `live-worker.js`. Those two and `batch.js` only pass settings and show counts: this
   order does not touch them.
2. **Message sizes.** The plan has "1 to 4 frames, 8 at an opening". The sender as built gives the sizes
   above, and two kinds of message with no frames.
3. **"Keep the decoder path as it is" does not hold in three places.** Today the end marker always arrives,
   so the app makes a new decoder for every spurt. With whole messages lost the marker can be lost, and the
   rule as read then keeps the decoder (C below). A refused packet has been through the decoder and the
   resampler but must not reach the gain (D). A silence record can be lost (B).
4. **"The sound closes up" cannot be the timeline's rule.** Today a spurt's packets are laid end to end, so
   every frame nobody fills pulls the rest of the spurt earlier, without limit. Under this order's draw
   that would be 1.1, 12 and 44 ms a second at 21.7%, 37.0% and 49.8%, and 10, 63 and 169 ms a second if
   refused packets closed up too (computed). The game cannot do that (the ring, read) and did not (the
   clock column, measured: about 0.5 ms a second more than the baseline at 15). Decision 2.
5. **Per-frame loss does not vanish.** The jitter control draws late frames, and nine in ten of them are
   single lost frames, concealed. That stays until BC-4, and it must not move at loss 0, so the message
   draw takes a random stream of its own (A).
6. **`net_split`** ("Packet ms") groups frames into the packets that the old draw lost. On `steam` it no
   longer says what a lost packet holds.
7. **`tests/accuracy.takes.json`** gives Set C's loss takes 22, 64, 45 and 45. After this order those would
   be shares of messages, and the suite would render the 15 take at 64% where the game's rule gives 49.8%.
8. **"Messages or frames: settled by the read."** The read settles how a packet is lost. It does not settle
   that Set C's damage pattern follows from it (above).
9. **`codecInfo` is hashed whole** by the render tests, so any new field must be absent at loss 0.

## Decisions (the orchestrator can reverse each before the build)

1. **One draw per message, each alone, and it is the share of messages.** The setting is the share of
   voice messages that do not reach the listener, end to end. Every message the sender makes takes one
   draw, the marker-only message and the silence record included, since each is a message in a packet.
2. **A frame that is played is played at its own time.** Time that nothing fills (the part of a gap past
   ten concealed frames, and a refused packet) stays silent in the render, and later sound does not move.
   This replaces W3-11a's end-to-end laying for those two cases. It is a stand-in until BC-3: in the game
   the ring would drain, and a long gap would end the channel and restart it. Its error against the game is
   bounded by what the ring holds; the other rule's grows without limit. *If reversed:* rule E is dropped
   but for a refused packet's silence (its own length, the cursor moved past it), a long gap closes up as
   today, tests 7 and 8 go, and the live chain keeps its one exception.
3. **The label becomes "Packets lost %" now**, BC-2's own wording brought forward, because "Frames lost %"
   would be false on `steam`. It is true of the other profiles too: there a packet is `net_split` frames.
4. **Set C's settings in `tests/accuracy.takes.json` become the game's arithmetic**: 21.7 (loss5), 49.8
   (loss15), 37.0 (combined and speech_loss10).
5. **The "Laggy" preset keeps 18**, now 18% of messages. Restating it is BC-2's.
6. **The private check runs on the branch before the merge** (last section).

## What to build

**A. The draw.** `TF2Audio.steamMessageLoss(lossPct, seed)` returns a function that says, once per call,
whether the next message is lost: true when `u < p`, with `p = clamp(lossPct, 0, 100) / 100` and `u` the
next number of `mulberry32((seed ^ 0x4C4F5353) >>> 0)` (the constant is arbitrary; `seed` is the render's,
`finiteOr(opts.seed, 0xC0FFEE) >>> 0`). `process`, `createRender` and the live chain each call it once per
message in the order the sender gives them, so the same sound, seed and settings lose the same messages
in all three. Raising the setting only adds lost messages. `jitterMs` and `frameMs` do not change which
messages are lost. `opts.loseMessage`, a function `(index, message) => boolean`, replaces the draw when it
is given, in all three (for the tests, and for replaying a log's dropped packets later; the page never
sends it).

The late-frame verdicts (the jitter stand-in, finding 9) stay as they are: on `steam` the per-frame mask is
built as today with a loss of 0 (`buildLossMask` and `streamLossMask` with the render's `rand`, `frameMs`
and `jitterMs`), by frame number, whether or not the frame's message is lost. The codec module keeps its
per-frame verdicts (`miss`, `makeLossMask`): jitter and the hand-made masks of the tests use them.

**B. A lost message.**
- Its frames are still encoded: the sender sent them, and the encoder's state moves on.
- The decoder is given none of them. They count toward the gap in front of the next frame of that spurt
  to arrive, exactly as lost frames do today.
- Its end marker is not delivered (C). The encoder is still reset at the spurt's end: that is the sender.
- A lost silence record makes no samples: no call to the resampler, nothing for the gain.
- The timeline follows the sender whether a message arrives or not: a spurt is anchored at its opening
  message's start and closed at its last message, as today.

**C. The decoder outlives a lost end marker.** A new decoder (expected number 0) at each end marker that
arrives; otherwise the decoder and its expected number carry into the next spurt, whose numbers start at 0
again. The first frame to arrive there is judged by the rule as read: below the expected number, a reset
and nothing concealed (the usual case, and then the samples are those of a render whose marker arrived);
equal, decoded as it is on the old decoder's state; above, `min(gap, 10)` concealed from the old state
and then decoded. The late-frame stand-in keeps its present meaning (a late frame is not a gap).

**D. The refusal.** After a message's samples have been decoded and resampled (one call, as today): if
the packet is longer than 11,264 samples (`22528 / 2`; a named constant citing W3-03), the game takes
nothing of it. The packet is not given to the gain, is not laid and marks no slot. The decoder and the
resampler keep the state it left them in. It applies to any packet, whatever made it long. The 17-frame
cut is not built: with these message sizes a record is at most 10 concealed in front of 6 (inferred), and
a test shows none passes 16.

**E. The timeline.** Each block of a laid packet stands for one frame of its spurt; the concealed blocks
stand for the lost frames directly before the frame that arrived (the last 10 of a longer gap, not the
first 10 as now). A packet is laid whole with its first block at
`anchor + 882 x (that block's frame - the spurt's first frame)`, the anchor as today. A packet of F
frames is 882 F samples, so with nothing lost this is today's laying, sample for sample.

*Corrected 2026-11-11, after the build and its review:* the formula above is replaced by **the cursor (where the
spurt's last packet, laid or refused, ended; the anchor at first) plus 882 samples for each lost frame in front of
the packet's first arriving frame that no block stands for** (past the ten concealed, or lost before a reset). The
two agree whenever no late frame is in play. With jitter a late frame's block can stand before concealed blocks, so
the first block's frame is not the earliest: the formula above then lays a packet a slot off, moves renders at loss 0
with jitter, and under jitter of 200 ms and more put arriving frames at the wrong slot in the prototype. The
replacement is today's laying whenever no gap passes ten, and puts every arriving frame at its own slot (the review
checked each one).

After a gap of more than ten frames the time of the frames that were not concealed stays empty: zeros in
the output, 0 in the frame log. So does a refused packet's time. The cursor (createRender's bound, the
live chain's give-out) moves past a refused packet's place. `steamGiveOut` and its ten-frame wait do not
change. Expected, and to be shown: the live chain no longer moves any packet, at full and at low latency
(a packet that is played starts at most 6,239 codec samples before the last sample pushed, and the
low-latency chain has by then given out at most up to 7,529 before it, the lookahead aside: computed,
check it). In low latency the first packet laid in a spurt is cut as the opening's packet is, whichever
message brings it. A spurt's span for `retime` runs from its anchor to its last laid sample, holes
included, so re-timing still moves a sender's spurt whole or not at all.

**F. Counts.** `codecInfo.network = { messages, lostMessages, refusedMessages }` on a `steam` render when
loss is set (`lossPct` above 0, or `loseMessage` given) or a message was refused; absent otherwise. The
live chain's `stats` gain `lostMessages` and `refusedMessages`. The frame log keeps its meaning: it marks
what was laid, so `lostFrames` is still the concealed frames that were played.

**G. Not changed.** `buildLossMask` and `streamLossMask` themselves; every profile but `steam`;
`VOICE_ENGINE.network` (the engine codecs and the late frames read it); `steam-sender.js`;
`createSteamDecoder`'s cap of 10; the resampler; the gain's rule; everything after the mix point.

## The words this order changes (the rest is BC-2)

- `index.html`: the loss control's label "Frames lost %" becomes "Packets lost %" (the `net_fakeloss` tag
  beside it stays); the Laggy button's description becomes "18% of voice packets lost + 50 ms jitter" (its
  `aria-label` stays, the browser suite finds the button by it).
- `app/console.js`, the help of `net_fakeloss`, saying no more than this: "Voice packets lost %. Steam's
  codec: each voice message (one packet: 1 to 5 frames of 20 ms, more at a phrase's start) is lost whole,
  by its own draw; the decoder fills up to 10 frames when the next message comes, and the game drops a
  message that comes to more than 12. The other codecs: still single frames in bursts of ~2.2. Not TF2's own
  number: by the game's rule its net_fakeloss 5/10/15 on a listen server lose about 22/37/50% of packets
  (a recording agrees at 5; 10 and 15 are not confirmed)". The help of `net_split` gains: "on Steam's
  codec a packet is the sender's message, and this does not set what a lost packet holds".
- Comments that would be false: `constants.js` (the `PRESETS` block's two lines on loss, the `network`
  paragraph above `VOICE_ENGINE`), `audio.js` (the header, the network block, `lossPct` in the options).
  No value in `constants.js` changes.

Left for BC-2, to be listed in the report as still loose: the `net_fakeloss` name on the control and the
command; the preset's number; `net_graph`'s loss and packet rate and the status line's "ms packets" on
`steam`; the `S_Voice` line and the live panel's titles (true, but silent about refused messages);
finding 8's title and finding 9; `tests/testsignal/README.md`.

## Tests

Each rule by a test that fails when the rule is broken. Test 10, and test 7's gap of 15 by a hand-made
frame mask, can run on `main`'s code: show them failing there. Show the others by breaking the new code:
the draw per frame; the draw from `rand`; a lost message's marker delivered; a lost silence record fed; a
refused packet given to the gain; a refused packet kept from the resampler; the limit one frame higher;
the cursor left standing at a refusal. Reference samples come from the vendored codec and the resampler
module driven directly, as the present "under loss" test does, never from the code under test.

1. **Whole messages.** With `lossPct` set and no jitter, a dry run of the sender with the same seed and
   `steamMessageLoss` says exactly which messages reach the resampler (`onDecoded`), and how many blocks
   are concealed in front of each: the frames of the messages lost since the last arrival in that spurt,
   10 at most.
2. **The draw.** Over 20,000 draws at 5, 21.7, 37 and 49.8 the lost share is within a point; runs of lost
   messages average 1/(1 - p) within 5% (no bursts); the messages lost at 10 are among those lost at 30;
   the same messages are lost at `jitterMs` 0 and 50 and at `frameMs` 20 and 80; another seed loses others.
3. **k frames lost give k concealed**, by `loseMessage`: one lost message of each size the signal
   offers; two and three in a row coming to 7 to 10 frames; more than 10 gives exactly 10; a spurt's last
   messages lost give nothing after the last arrival; a lost opening is concealed from a decoder that has
   decoded nothing (say in the report what those samples are). Decoded samples equal the reference.
4. **The refusal.** 10 concealed in front of 3 frames, and 9 in front of 4: the gain's output and the
   render hold nothing of the packet, `refusedMessages` is 1, and the next packet's decoded and resampled
   samples are those of a reference that decoded and resampled the refused packet too (and are not those
   of one that skipped it). 10 in front of 2 (12 frames) is played. The limit itself by a unit check on the
   function that holds it: 11,264 samples are taken, 11,265 are not.
5. **A lost end marker.** The usual case (the next opening arrives: a reset, the samples of a render whose
   marker arrived). And the case where the next spurt's first frame to arrive is at or above the old
   expected number: no reset, the gap counted from the old number, decoded on the old state. Assert from a
   dry run that the chosen signal and seed make that case.
6. **A lost silence record**: one resampler call fewer, and the gain's output is the reference's.
7. **Own time.** Under loss every played frame's slot holds what the same slot holds in the loss-free
   render of the same seed (`frameBytes`, slot by slot). After a gap of 15 in front of a message of 1 or
   2 frames: 5 empty slots, 10 lost, and nothing after the gap moves.
8. **The live chain is the render** at 22, 37 and 50, three seeds, two block plans, full and low latency:
   the laid signal sample for sample, `movedLate` 0, the same lost, late and refused counts.
9. **`createRender` is `process`** for the loss cases, in odd pieces (the render-stream suite's own check).
10. **`net_split`.** On `steam` with no jitter, `frameMs` 20 and 80 give the same samples at `lossPct`
    25. On `celt_22` they still differ.
11. **No record passes 16 frames** over the loss renders of tests 1 and 8.
12. **`codecInfo.network`** is absent at loss 0 and equals the dry run's counts otherwise.

Present tests that meet the new rules, to be reworked so that each still shows its own rule (say which
in the report): the hand-made frame masks that put 10 concealed frames in front of 3 or more now meet the
refusal ("under loss the decoded samples are the module's", "the cap: 15 frames lost in a row"); "the
sound after a gap of 15 is 100 ms earlier" and "30 frames lost in a row: one packet moved" state the rule
decision 2 replaces; the seed search of "15% loss and 50 ms jitter" reads `streamLossMask`; "net_split
changes the loss pattern" is test 10.

## Recorded hashes

**Move, and are re-recorded in a commit of their own, old and new listed in the report** (both tables of
`tests/render-stream.verify.mjs`, `GOLDEN` and `GAIN_GOLDEN`):

- `steam, loss 15%, jitter 50 ms, net_split 40 ms`
- `steam, gate off, loss 80%, seed 1 (long runs lost inside a spurt)`
- `steam, gate off, loss 40%, seed 3 (long runs lost inside a spurt)`
- `steam, listenerPos tunnel (preset 6), loss 15%, jitter 50 ms`
- `odd options` (its unknown codec name renders as `steam`, with `lossPct` 12)

**Must not move:** every other case of those tables, which is every render at loss 0 and every profile
that is not `steam` (`steam_48`, `celt_22`, `celt_44`, `speex` and `demo voice as received`, loss cases
included); the `steam_48` live hashes in `tests/verify.js`; the sender's reference hash; the vendored
modules' hashes; `tests/predictions/predictions.json`. One case needs a look:
`steam, jitter 500 ms (late frames play as silence)` has no loss, and can move only if its late frames
bring a packet to more than 12 frames or make a gap of more than ten. If it moves, show that packet in the
report; if it moves for any other reason, stop.

`sw.js` `CACHE` up by one. `pnpm test:all` green (the browser suite as
`flock /tmp/tf2ve-heavy.lock <command>`), and the branch's CI run read.

## Files

May touch: `audio.js`, `opus-codec.mjs`; `constants.js` (comments only); `index.html` (the two strings);
`app/console.js` (the two help strings); `sw.js` (`CACHE`); `tests/verify.js`,
`tests/render-stream.verify.mjs`, `tests/opus.verify.mjs`, `tests/gain.verify.mjs`;
`tests/accuracy.takes.json` (the four loss settings); `tests/browser.verify.js` only if one of its checks
fails, and then the smallest change, named in the report; `README.md`, `tests/REFERENCE_2026.md`,
`tests/predictions/PREDICTIONS.md`, `docs/reports/BC-1-loss-per-message.md`.

May not touch: `steam-sender.js`, `voice-channel.js`, `live.js`, `live-worker.js`, `live-worklet.js`,
`audio-worker.js`, `batch.js`, `demo.js`, the rest of `app/`, `style.css`, `vendor/`,
`tests/testsignal/`, `tests/predictions/predictions.json`, `docs/PROGRESS.json`.

**Where W3-17d meets this** (it is being built; it changes the page's settings panel and the live chain's
mix stage). Whichever branch merges second brings `main` in with a merge and settles these by hand:

| File | This order | W3-17d |
| --- | --- | --- |
| `sw.js` line 16 | `CACHE` up by one | the same line: the second takes `main`'s number plus one |
| `index.html` lines 73 to 74 | the Laggy button's description | the Sewers button on the two lines above |
| `index.html` line 175 | two words of the loss label | may move the control; it keeps `net_fakeloss` shown |
| `app/console.js` lines 317 and 319 | two help strings | new commands and `dsp_room`'s help nearby |
| `constants.js` lines 206 and 218, 380 to 385 | comments | the `PRESETS` entries on lines 215 to 217, the listener list |
| `README.md` lines 59 to 61, 97, 126, 135, 153, 272 | loss | rooms, the mixer's line, the live note |
| `tests/REFERENCE_2026.md` | findings 8 and 29, the model table's Network and Codec rows, "What remains unverified" | the room's sections |
| `tests/verify.js` | the `steam` loss checks, the live chain's, section 9 | the names it reads |

In `audio.js` stay out of everything after the mix point (`mixStages`, the live chain's `after`, the
device stage). Line numbers are `main`'s at c8a7d61.

## Docs

- `tests/REFERENCE_2026.md`, each change as a dated correction in the file's own manner:
  - finding 8: a paragraph with the rule as read (the table above, with its standings and the plan as its
    source), the arithmetic for 5, 10 and 15 and what it is a share of, the statistic that is not
    explained, and what the app does since this order. Its title and body stay (BC-2);
  - the Set C table under "What the model does" (22%, 64%, 45%): a note that it was made with the per-frame
    model and has not been made again;
  - finding 29, "The app today": the refusal is built; a decoder per delivered end marker; the 17-frame cut
    still is not, and why it cannot be reached;
  - the model table's Network row, and the Codec row's sentence on the live chain's exception;
  - "What remains unverified": "Network settings" and "Loss on messages or on frames" rewritten: what is
    read, what is built, what is open (Set C's short events; whether Steam's concealment is the bundled
    library's sample for sample; the engine's side of the refusal, seen once; a real server's packets).
- `README.md`: the pipeline's network lines (59 to 61); the live chain's exception (97, gone under
  decision 2); line 126, which says the app reproduces the takes' loss statistics: on `steam` that was the
  earlier model, and it has not been measured again; lines 135 and 153 (what the setting is, and the
  game's mapping with its standing); the test list's line on loss.
- `tests/predictions/PREDICTIONS.md`: the note for changed model files (no predicted take has loss).
- The report, `docs/reports/BC-1-loss-per-message.md`: the commits; each test with the break that fails
  it; the hashes old and new; on the suite's own speech-like signal, 60 s, five seeds, at 5, 18, 21.7,
  37.0 and 49.8: messages lost, frames concealed and played, messages refused, the share of each spurt
  left silent, packets moved live (expected 0); the words left for BC-2; what was not done.
- No names of people or of assistant models, no addresses of the game's files, nothing of the private
  recordings.

## Stop and report instead of guessing if

- a hash listed under "must not move" moves, the jitter case's stated exception aside;
- with nothing lost the new laying differs from today's in any sample;
- a record passes 16 frames, or the live chain moves a packet;
- the decoded samples under loss are not the reference's;
- a rule here contradicts the code, or needs a file from the "may not" list.

## Afterwards (the orchestrator, privately, on the branch before the merge)

Set C's network signal rendered by the branch with `set_c_room` at the settings of decision 4 (jitter 50
with the combined take), five seeds each, and the same renders by `main` at 22, 64 and 45 for the old
model's figure. Four comparisons with the takes:

1. **Level** (the accuracy suite's last column, render less take). `main` at W3-17c: +0.1 dB (loss5),
   -1.4 dB (loss15), -1.7 dB (combined), +0.2 dB (speech). Confirms: loss15 and combined within 0.5 dB of
   0 and the other two no further from 0 than they were. Refutes: either of the two moves away from 0.
2. **Surviving sound** (the plan's measure, applied to renders and takes alike: 10 ms levels against the
   baseline's, "present" within 6 dB, "silent" more than 20 dB under). The takes, for the 12 s of noise:
   99.5 / 0.0 (loss5), 76.9 / 10.1 (loss15), 79.7 / 10.3 (combined); energy -0.1, -1.5, -1.2 dB.
   Confirms: each within 5 points and 0.5 dB. Refutes: a row more than 10 points or 1 dB off where
   `main`'s render was nearer. The dry run leaves about 1%, 6% and 17% of a long spurt's time with no packet
   played at 21.7, 37.0 and 49.8 (computed: refused packets and the unfilled part of long gaps); the
   measure's "silent" differs from that by the concealment's own fade and the room's tail.
3. **Finding 8's statistic**, with its method made again from the finding's text and first shown to give
   the takes' published figures: events a second, share of frames damaged, events of 1, 2, 3 and 4 or more
   frames. The takes: 4.3, 17%, 51/23/17/9 (loss5); 14.1, 58%, 54/21/10/15 (loss15); 12.0, 43%, 57/25/9/9
   (combined). Confirms: the branch within what the old fit reached (events within 1 a second, the share
   within 3 points, each class within 8). If the branch shows clearly fewer and longer events (under half
   the takes' rate at 15, or most events three frames or more), the build is right by the read and Set C
   does not confirm it: that goes into finding 8 as measured, and the orchestrator decides between merging
   on the read and holding the merge for the logged take of the run sheet's block 1.
4. **The speech take**: the share of active speech frames correlating under 0.5 with the clean render.
   The take 38%, the old model 37% at 45; the branch at 37.0 is reported.

Not checked by any of this: whether Steam's concealment is the bundled library's sample for sample. That
is block 1's log replayed with its own dropped packets through `loseMessage`, once the recording exists.
