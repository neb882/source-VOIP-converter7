# Bad connections: what a listener hears, what is known, and what to build

A plan, 2026-11-11. No app code changed. It gathers what the earlier reads and takes established about lost, late,
reordered and bunched voice packets, adds what was read from the engine for this plan, re-reads Set C against it,
and proposes orders and one recording session.

Every statement is marked **read** (from a file of the owner's install, with where), **measured** (from a take or a
run, with the count) or **inferred**. Addresses are virtual addresses in `bin/x64/engine.dll` (SHA-256 `4802a74c…`,
the file W3-03 read) and in Steam's `steamclient64.dll` (SHA-256 `e9045710…`, the file W3-09 read). Function names
are the binary's own where it prints them and labels otherwise. Nothing of those files is quoted.

## The short answers

| Question | Answer | Standing |
| --- | --- | --- |
| 1. A lost packet | A network packet that is lost takes its whole voice message with it (1 to 4 frames, 8 at an opening). Nothing plays in its place when it should have arrived: the queue simply drains. When the **next** message arrives, Steam's decoder sees the jump in the per-frame sequence number and puts up to 10 concealed frames (libopus's own concealment, no FEC) in front of that message's sound. More than 10 lost frames: the rest is never filled and the sound closes up. Concealed plus decoded sound over 12 frames: the game takes nothing of that message. The engine decides nothing; it never looks inside the payload. | Read (W3-09, W3-16 read, W3-03); seen once (Set J). Whole-message loss: read now. Not yet seen in a log under loss |
| 2. A late or bunched packet | The receiver has no playout deadline. A late message is appended when it comes if the speaker's channel still exists; if the ring ran dry first, the channel was freed and the message opens a new one (the wait again, the gain reset). Bunched messages that do not fit the 0.5 s ring push the oldest sound out: a skip. Nothing is concealed for lateness. | Read (W3-03). The rules exist in the app as a module, not in a render |
| 3. Reordering and duplicates | They never reach the voice code. The network channel discards any packet whose sequence number is not above the last one it took. A reordered packet is a lost packet; a duplicate is ignored. | Read now |
| 4. The sender's side | Voice rides in the ordinary unreliable part of the client's regular packets, and the server writes one message per listener into that listener's regular packets. Unreliable data that does not fit a packet is thrown away, not retried. A choked packet is not sent, so its voice waits for the next one and arrives bunched. | Read (W3-03; the overflow rule read now). Choke: inferred. Never measured |
| 5. `net_fakeloss`, `net_fakelag`, `net_fakejitter` | Loopback voice does cross the network layer, twice: client to server, server to client. `net_fakeloss N` drops a packet when a draw from 0 to 100 is at most N, so (N+1)/101 of packets, at the receiving end of each crossing, and with `net_usesocketsforloopback 1` at the sending end as well. So Set C's 5, 10 and 15 removed 21.7%, 37.0% and 49.8% of voice messages. Lag and jitter go through one first-in-first-out queue per socket: they delay and bunch, and never lose or reorder. | Read now; the takes agree at 5 and for jitter, and are not explained at 10 and 15 |
| 6. The controls | Loss: the share of network packets lost on the way to the listener, each taking a whole message, with Steam's concealment and the queue's rules. Jitter: a spread of arrival times, in order, through the queue. | A proposal |

For the engine codecs (CELT, Speex): the engine calls the codec only for messages that arrive, and the sequence
number it is handed is not used (read, W3-03). So a lost message leaves nothing: no concealment and no silence. The
later sound plays sooner and the decoder goes on from a stale state. The ring is 1 s deep for CELT and 2 s for Speex.
Not measured; one optional take in the sheet shows it.

## What was already established

**Steam's decoder** (read: W3-09 section 4, the W3-16 read; `0x1380e3110`).

- Each frame in a type 6 record carries a 16-bit length and a 16-bit sequence number that counts from 0 in each
  talk spurt. An end marker resets the decoder and sets the expected number to 0.
- A number above the expected one: the decoder is called with no data once per missing frame, at most 10 times,
  and then decodes the frame. A number below it: the decoder is reset and nothing is concealed. Either way the
  expected number becomes that frame's plus one.
- So concealment needs the next frame. Frames lost at the end of a spurt are never concealed: the next spurt's
  first number, 0, is below the expected one.
- The encoder never asks for in-band FEC, and the decoder is called with FEC off (read; measured on Set D's demo,
  where no packet of 5,109 carries it).
- One record decodes to at most 17 frames, concealed ones included. The game then takes a message only if its
  resampled sound fits 22,528 bytes, 12 frames. Otherwise it queues nothing, and that sound is gone (read; seen
  once, Set J).

**The receiver's queue** (read: W3-03; measured on Set G's logs in every count checked). A 0.5 s ring per speaker.
A message for a speaker with no channel opens one: the ring is emptied, the gain is reset, and playing starts after
`voice_buffer_ms` counted down by a frame's duration per 15 ms tick (about 100 ms at 67 fps, 450 ms at 300 fps).
A message for a speaker with a channel is appended. Overflow drops the oldest sound. The mixer's pull fades the
last 100 ms of whatever is queued, pads an underrun with one repeat and then zeros, and marks an empty ring; the
next tick frees the channel. One sample is dropped per message.

**The sender in the engine** (read: W3-03). Once per tick the engine asks Steam for voice and sends what comes as
one message in the channel's ordinary unreliable stream. The server writes one message per listener, merged with
nothing and re-timed by nothing.

**Set C** (measured: findings 8 and 9). Under `net_fakeloss` the damage is replaced in place by noise near the true
level, in 54 of 55 isolated events with the same delay before and after. The app's loss model was fitted to those
takes' event statistics: 22%, 45% and 64% of frames, in bursts of 2.2 frames.

## Read for this plan

1. **Out-of-order and duplicate packets are discarded by the channel** (`0x1801d2551`, in the function that reads
   a packet's header). The packet's sequence number is compared with the last one taken. Equal or lower: the packet
   is dropped, with a console line (`duplicate packet` or `out of order packet`) only when `net_showdrop` is on.
   Higher: the difference, less the sender's choked count and one, is stored as the number of dropped packets and
   printed (`Dropped N packets at M`) under `net_showdrop`. A jump above `net_maxpacketdrop` (5000) is refused.
2. **`net_fakeloss` on the way in** (`0x1801d7a77`, the function `NET_GetPacket` calls for each packet). For a
   new packet on any socket: with N above zero the packet is dropped when `RandomInt(0, 100)` is at most N, so
   with probability (N+1)/101. With N below zero every |N|th packet is dropped (at least every 2nd). Each packet
   has its own draw: the game has no burst process.
3. **In-process loopback packets pass the same function** (`0x1801d75c7` to `0x1801d7637`): a packet from the
   loopback queue is handed to it as a new packet. So without `net_usesocketsforloopback` a listen server's own
   player still gets fake loss, lag and jitter, once per crossing. (Medium confidence: the in-process queue is
   recognised by its place in `NET_GetPacket` and its two sockets, not by a printed name. Block 1 of the sheet
   uses sockets, as Set C did, so nothing rests on this.)
4. **`net_fakeloss` on the way out** (`0x1801da00f`, in the packet send function): a packet for a network address
   is dropped by the same draw before it is sent. A loopback address, or a local one while
   `net_usesocketsforloopback` is 0, takes the in-process path before this check (`0x1801d9f7f` to `0x1801d9f9f`).
   So with sockets for loopback each crossing has two draws.
5. **`net_droppackets`** (`0x1801d7a4c` and `0x1801d9fe7`): a positive value drops that many of the next packets
   the client receives; a negative value drops that many of the next packets the client sends. Each drop moves the
   value one toward zero. It is the exact tool Set C lacked.
6. **`net_fakelag` and `net_fakejitter`** (`0x1801d738c`, `0x1801d7b78` to `0x1801d7d4c`). The lag in force moves
   toward `net_fakelag` at 200 ms per second. While it is above zero every new packet is copied to the **tail** of
   a list for its socket, and only the **head** of the list is looked at. The head is released when its arrival
   time plus `lag + RandomFloat(-j, +j)` has passed, with `j = min(net_fakejitter, lag / 2)`, drawn again at every
   look. So packets leave in the order they came: jitter cannot reorder and cannot lose. A packet becomes eligible
   `lag - j` after it came and is released at one of the next looks, so the spread of delay is narrower than
   plus or minus `j` and depends on how often the socket is read (inferred: at 300 fps most packets leave within
   about 20 ms of becoming eligible). A falling lag releases packets in a bunch; a rising one holds them back.
7. **Unreliable data that does not fit is dropped whole** (`0x1801d3833` to `0x1801d3865`, in the function that
   builds a packet): if the unreliable stream's bits fit what is left of the packet they are copied in; if not, a
   developer message is printed. In both cases the stream is then cleared. Nothing is carried over.
8. **A listen server's own player is not held to `cl_cmdrate` and `cl_updaterate`** while `host_limitlocal` is 0
   (`0x18008de57`, `0x180067827`): packets go every tick. Whether a connection made through sockets counts as
   local there was not read.

**Not read:** the size of the unreliable stream's buffer; the choke path (that a choked tick leaves the stream
uncleared is inferred from 7); what the server does with voice when a client's rate is exhausted.

**Not run:** Steam's decoder in the CPU emulator. The budget went to the engine's network functions. What it
would take: the per-frame function above needs only a decoder object (the flag at +8, the expected number at
+0x60, the Opus decoder at +0x58, a reset method in its table), libopus's own create and decode routines inside the
same file, and a stand-in for the C runtime's memory calls; about two hours on the existing harness. Block 1 of
the run sheet gives the same answer from the game itself (the decoder's output for a known clip with known packets
dropped), and checks the queue with it, so the emulator is the fallback, not the first route.

## Set C, read again

**The arithmetic** (read). With q = (N+1)/101 and two draws per crossing, a packet survives one crossing with
(1 - q)², and loopback voice crosses twice:

| `net_fakeloss` | q | Packets lost in one crossing | `net_graph` showed | Voice messages lost | The app's fitted setting |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 5 | 5.94% | 11.5% | 13 | 21.7% | 22% |
| 10 | 10.89% | 20.6% | 20 | 37.0% | 45% |
| 15 | 15.84% | 29.2% | 34 | 49.8% | 64% |

Without sockets for loopback the last column but one would be 11.5%, 20.6% and 29.2%.

**How much sound survives** (measured for this plan: each take's 10 ms level against the baseline take's own level
in the same segment; "present" is within 6 dB of it, "silent" more than 20 dB under).

| | baseline | loss 5 | loss 15 | jitter | combined |
| --- | ---: | ---: | ---: | ---: | ---: |
| All 13 spurts leave sound | 13 | 13 | 13 | 13 | 13 |
| Present, all segments | 96.5% | 84.4% | 59.0% | 96.0% | 66.8% |
| Silent, all segments | 0.2% | 2.4% | 14.4% | 0.2% | 8.2% |
| Present, the 12 s of noise | 100% | 99.5% | 76.9% | 99.7% | 79.7% |
| Silent, the 12 s of noise | 0% | 0% | 10.1% | 0.3% | 10.3% |
| Energy of the noise | 0 dB | -0.1 dB | -1.5 dB | 0.0 dB | -1.2 dB |
| The worst of the 8 bursts, present | 100% | 88% | 29% | 100% | 62% |

What this is evidence of:

- **Loss 5.** With about a fifth of the messages gone, the noise is at its level 99.5% of the time: concealment
  fills a lost message at close to full level (measured). The fitted 22% equals the arithmetic's 21.7%.
- **Loss 10 and 15.** Sound is missing outright for a tenth of the noise: gaps too long for concealment to carry.
  The fitted 45% and 64% are above the arithmetic's 37.0% and 49.8%, and the accuracy table has the app's renders
  of those two takes 1.7 and 1.4 dB quieter than the takes: the app at those settings removes more sound than the
  game did (measured, the W3-17c private run). The refusal of a message over 12 frames and the restarts add loss
  beyond the dropped packets, by a rough count 3 to 5 points at 15 (inferred), which does not close the gap. Not
  settled: the fit counted damaged 20 ms windows by correlation, not packets.
- **Jitter.** No sound is lost: 96.0% present against the baseline's 96.5%, 0.2% silent in both (measured). That
  agrees with the read: lag and jitter on this path delay and bunch, and nothing is dropped or reordered.
  Finding 9's "isolated late frames, nine in ten concealed, one in ten silent" has no mechanism in the game: no
  rule conceals a late packet. What its 1.4 events a second most likely are (inferred): skips, where a bunch of
  messages overflows a ring that a 300 fps restart had already filled. The accuracy table's clock column fits: the
  jitter take runs 726 ppm fast against the baseline's 416, so about 0.3 ms more sound was skipped each second.
- **Reordering.** Set C holds no evidence on it, and cannot: the lag list keeps the order.

## What the app does today

- **Loss** (`audio.js`): a two-state process draws loss per 20 ms frame (bursts of 2.2 frames), not per message.
  On the `steam` profile the decoder is as read: a gap is concealed when the next frame comes, at most 10 frames,
  frames lost at a spurt's end are not played. Not in the app: whole-message loss, the 12-frame refusal, and
  anything of the queue (a lost stretch never drains a ring, restarts a channel or resets the gain).
- **Jitter**: 3.2% of frames at 50 ms, scaled linearly, are marked late; nine in ten are concealed and one plays
  as 20 ms of zeros. This is the fit to finding 9, and by the reads above it is not what the game does.
- **The queue**: `voice-channel.js` has every rule of W3-03 (the wait, the append, the overflow, the fade, the
  underrun, the freed channel) and replays the owner's logs (W3-02a, W3-02b). No render and no page runs it yet
  (W3-02c, W3-02d).
- **The engine codecs**: a lost CELT frame is concealed in place by the codec; a lost Speex frame plays as zeros in
  place. By W3-03's read the game does neither: it queues nothing.
- **The page and README** call the loss control `net_fakeloss` and "the share of voice frames lost", and describe
  jitter as late frames.

## Proposed orders, smallest audible gain first

*2026-11-12: BC-1 is built (cache v33). BC-2 is done (documents only). BC-3's build is part of W3-02c-2 (the
amendment in `docs/work-orders/W3-02-receiver-queue.md`, section 10); only its check against block 1 and the log
tool's change remain. BC-4 to BC-6 have no order yet. BC-5 covers `miles` too (not in TF2), which also plays a lost
frame as zeros.*

**BC-1. Loss takes whole messages (the `steam` render and live chain).** Draw loss per network packet, one
message to a packet, each packet with its own draw, instead of per frame in bursts; keep the decoder path as it
is; add the 12-frame refusal. Rests on: reads 1, 2 and 7, the decoder's rule, finding 28's message sizes. Checked
by: a public test where a dropped message of k frames gives k concealed frames in front of the next message, 10 at
most, nothing after a spurt's last message, and nothing at all for a message that would pass 12 frames; privately,
Set C rendered at 21.7%, 37.0% and 49.8% with the table's last column expected to move from -1.4 and -1.7 dB
toward 0, and block 1's log replayed with its own dropped packets, the decoder's output compared sample for
sample. Must not move: any render with loss at 0 (the recorded hashes), the decoder, `predictions.json`. If block 1
shows concealment that differs from the bundled libopus's, stop: that is a codec question and its own order.

**BC-2. The words (page, README, `tests/REFERENCE_2026.md`, the test signal's README).** The loss control becomes
"Packets lost %", no longer labelled `net_fakeloss`; a note gives the game's own mapping (the table above). The
"Laggy" preset is restated in packets. Finding 8 gains the arithmetic and the per-packet rule; finding 9 is
corrected: jitter loses and conceals nothing. The test signal's README stops saying a listen server's own traffic
bypasses fake loss. Checked by reading. Must not move: any sample.

**BC-3. Loss through the queue.** After W3-02c puts the channel in the render: a lost message is a message that
never arrives, and the next one brings its concealed frames with it. The ring then does the rest: it drains during
the gap, fades as it gets shallow, and when a gap outlasts what is queued the channel ends and the next message
restarts it, with the wait and the gain reset. The frame rate decides how much: about 350 ms is queued at 300 fps
and about 100 ms at 67 fps, so the same loss is mostly seamless on a fast PC and full of restarts on a slow one
(inferred from the rules; block 1 measures it at both). Checked by: block 1's `bufsize` lines replayed tick for
tick, as W3-02a replays Set G. Must not move: a render with the source's timeline chosen.

**BC-4. Jitter as arrival times.** Replace the late-frame draw with a delay per packet, in order, through the
queue: bunches overflow the ring (a skip) and gaps run it dry (a fade, then a restart). One setting, the spread in
milliseconds; a lag spike can be a second one. Before it is built, one private check on Set C's jitter take: its
events should sit on downward steps of the delay, not on concealed sound. Checked by: block 2's log replayed.
Must stop claiming: late frames, concealed or silent. Until then the jitter control is labelled as a fit.

**BC-5. The engine codecs under loss.** A lost message queues nothing: no concealment for CELT, no zeros for
Speex; the sound closes up. Rests on W3-03's read alone, so block 1's optional take comes first. Small.

**BC-6. The sender's side and a real server.** No build yet. Block 6 shows whether a choked sender loses voice or
bunches it, how many messages ride in one packet at a real server's update rate, and one-way loss with the
server's own record of what it relayed. An order follows only if those show something audible.

BC-1 and BC-2 need no new recording. BC-3 and BC-4 wait for W3-02c and are checked against blocks 1 and 2.

## The recordings

The owner's sheet (`RUN-SHEET.md`, sent separately) has six blocks, each with one question.

| Block | Question | Needs | Minutes | Serves |
| --- | --- | --- | ---: | --- |
| 1 | What reaches the queue when a packet is lost: placed drops with `net_droppackets`, random loss at 5 and 15, the same at 67 fps; optionally the old codec | one PC | 25 | BC-1, BC-3, BC-5 |
| 2 | Do lag and jitter lose or reorder anything, or only skip and pause | one PC | 10 | BC-4 |
| 3 | Do Steam's own voice settings change what the game sends | one PC, the real input (a virtual cable for a repeatable signal) | 20 | the sender |
| 4 | The listener's speaker setting and Sound quality against the voice | one PC | 15 | the mixer's entry |
| 5 | Two talkers at once: the plain sum, cut off together | the second PC and account | 25 | the mix |
| 6 | Loss at the listener only, at the talker only, a squeezed talker, a squeezed listener, the update rate | the second PC, the dedicated server and its demo | 30 | BC-6 |

Blocks 1 and 2 log three things into one file: every voice message as the queue received it
(`voice_showincoming`), the queue's size each tick (`voice_showchannels`), and every gap the network channel saw
(`net_showdrop`). With Steam's file input the clip is known, and `voice_writevoices` keeps the decoder's output,
so the app can be run on the same clip with the log's own dropped packets and compared sample for sample.

**What needs the second PC:** anything about one direction alone (a talker's choke, the server's relay, loss
on one leg), how many messages share a packet at a real server's update
rate, and two voices at once. On one PC every packet crosses twice and both ends share one setting.

## What the controls should mean

- **Packets lost %**: of the network packets on their way to the listener, the share that never arrive, each with
  its own draw. A lost packet takes one voice message. What is heard follows from Steam's decoder (concealment
  when the next message comes, 10 frames at most) and the game's queue.
- **Jitter ms**: how far arrival times spread, with the order kept. It changes when sound arrives at the queue,
  never whether it arrives.
- **Stop claiming**: that the loss number is TF2's `net_fakeloss`; that loss comes in bursts of 2.2 frames (the
  game draws each packet alone; a message is 1 to 4 frames); that jitter makes late frames which are concealed
  or silent; that a listen server's own traffic is exempt from `net_fakeloss`.

## Contradictions with the repository as it stands

1. Finding 9, `constants.js` and the README: jitter as late frames, concealed or silent. The game has no such path.
2. Finding 8 and `accuracy.takes.json`: 45% and 64% for `net_fakeloss` 10 and 15. The packet arithmetic gives
   37.0% and 49.8% of messages; the 5 take's 22% stands.
3. "Loss on messages or on frames" (REFERENCE, still open): settled by the read. A packet is lost whole, and a
   voice message is never split across packets.
4. `tests/testsignal/README.md`: "your own traffic normally bypasses the network layer" and "`net_fakeloss` is
   not" documented to include loopback. The receive-side draw applies to in-process loopback packets (read).
5. The CELT and Speex profiles conceal or zero a lost frame in place. The engine queues nothing (read, W3-03).
6. W3-03's report, "What was not read: the network channel's packet timing": partly read now (reads 1, 7 and 8).
