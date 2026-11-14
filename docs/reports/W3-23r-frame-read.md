# W3-23r: where a frame takes its packets, counts its ticks and paints its sound

A read, 2026-11-14, for the order `docs/work-orders/W3-23-low-frame-rates.md` ("W3-23r: the read"). No app code and
no test changed. Nothing of the game's files is in this repository: the report describes behaviour in its own words
and cites addresses and constants with the place they were read.

## Summary

| Question | Answer | Standing |
| --- | --- | --- |
| 1. Where the client takes its packets | Inside the tick loop, once for each tick, as the first step of the client's part of that tick and before that tick's pass over the voice channels. A frame with no tick due takes none. | read, high |
| 2. Where `S_Update` paints | After the tick loop and after the frame is drawn, once a frame, as the last thing `S_Update` does. So a frame's order is packets, ticks, mixer. | read, high |
| 3. Where the "extra update" can paint | Only from the client module's drawing of the view, which runs between the tick loop and `S_Update`. None can fall between the packets and the ticks. | the engine's side read, high. The client module's six calls read by a search, medium to high. "No other way in" inferred |

The order of a frame's steps that W3-23 chose (packets, then the ticks, then the mixer) is the order that was read.
W3-23a's frame clock needs no change of order.

Four things were read on the way that the order's tables do not have. They are in "What else was read":

- The mixer does not keep 9 blocks queued at every frame rate. `S_Update` adds a smoothed frame duration to
  `snd_mixahead`, so the count is 9 at 300 frames a second, 10 at 66.67 and 100, 11 at 40 to 60, 12 at 30, and the
  device's 13 at 25 and under (read; the counts are arithmetic on the read rule).
- How many ticks a frame runs is read: the whole ticks in the frame time gathered so far.
- With `sv_cheats` 0 the game puts `fps_max` back to 30 when it is set under 30 (read).
- The extra update's 90 ms are counted from the last `S_Update` as well as from the last extra update (read), so
  W3-07's "11.1 frames a second" stands.

## How it was read

- The owner's `bin/x64/engine.dll`, SHA-256 `4802a74ce0abb1175851d00e37fc88609085a96238aa52ac0eb224ae4a08ec80`, the
  file W3-03 and W3-07 read (PE32+ x86-64, image base `0x180000000`). Addresses below are virtual addresses in that
  image.
- For question 3 only, the owner's 64-bit `client.dll` (SHA-256 begins `b6f45c74`, the file W3-15 names), image base
  `0x180000000`. Its addresses are marked "in `client.dll`".
- Both files were read as data with a disassembler library (capstone 5.0.7, as W3-03) and never executed. Functions
  were found from the names the binary itself carries for its profiler (`_Host_RunFrame`, `_Host_RunFrame_Input`,
  `_Host_RunFrame_Server`, `_Host_RunFrame_Client`, `_Host_RunFrame_Render`, `_Host_RunFrame_Sound`,
  `CL_ReadPackets`, `NET_ProcessSocket`, `NET_GetPacket`, `CL_ProcessVoiceData`, `CL_RunPrediction`,
  `CEngineClient::Sound_ExtraUpdate()`), from run-time type names (`CNetChan`, `CEngineClient`,
  `CEngineSoundClient`), from each console variable's object as in W3-03, and from the unwind table.
- Every function name below is the binary's own. Where a function has no name in the binary it is given by its
  address.
- Callers were found by searching the whole code section for calls and jumps to an address, and for a virtual call
  by finding the function's place in its class's table.
- No leaked source was consulted or looked for.
- Every statement is marked **read** (the instructions say so) or **inferred** (a conclusion from what was read).
- The working notes and listings were kept in a private scratch folder and deleted when the report was written.

## A frame, step by step

This is `_Host_RunFrame` (`0x1801a5eb0`) as a client in a game on a remote server runs it. All of it is read.

| Step | What happens | Where |
| ---: | --- | --- |
| 1 | The frame's duration is set (W3-03: real time since the last frame, limited to 0.001 to 0.1 s). The same function hands the unlimited duration to the sound system (see "The mixer's target") | `0x1801a1920`, called at `0x1801a5fa0` |
| 2 | The frame's duration is added to a remainder. The ticks due are the whole ticks in the remainder, and they are taken off it | `0x1801a6063` to `0x1801a6136`; the remainder is the double at `0x1807575d0`, the tick's length the float at `0x180755740` |
| 3 | Queued console commands are run | `0x1801a61e4` |
| 4 | **The tick loop**, once for each tick due: the network clock, `_Host_RunFrame_Input`, `_Host_RunFrame_Server`, then `_Host_RunFrame_Client` | the loop `0x1801a6310` to `0x1801a642d`; the calls at `0x1801a63ce`, `0x1801a63da`, `0x1801a63f0` |
| 5 | SourceTV's own frame, where one is running; `CL_RunPrediction` | `0x1801a64ba`, `0x1801a66d8` |
| 6 | **`_Host_RunFrame_Render`**: the frame is drawn. The client module's drawing of the view is in here | `0x1801a7670`, called at `0x1801a6a9c` |
| 7 | **`_Host_RunFrame_Sound`**: `S_Update` | `0x180030870`, called at `0x1801a6b75` |
| 8 | The client module's own update, and the rest | from `0x1801a6d7a` |

Inside step 4, `_Host_RunFrame_Client` (`0x1801a71a0`) does these in this order (read):

1. `CL_ReadPackets` (`0x18008e4f0`, called at `0x1801a724d`);
2. the pass over the voice channels that W3-03 read (`0x180059380`, called at `0x1801a730e`, with the frame's
   duration as its argument);
3. the client's own microphone: Steam is asked for compressed voice and the message is sent (W3-03's question 3;
   from `0x1801a7313`).

Steps 6 and 7 run when a flag byte at `0x1806dd970` is 0 at the frame's start. The same flag lets the tick loop
call `_Host_RunFrame_Client`. Inferred: it marks a dedicated server.

## 1. Where the client takes its packets

**Answer: inside the tick loop, once a tick, before that tick's voice pass.** Read, high confidence.

- `CL_ReadPackets` has one caller in the file: `_Host_RunFrame_Client`, at `0x1801a724d`. It is that function's
  first step, before the voice pass at `0x1801a730e` (read).
- `CL_ReadPackets` calls `NET_ProcessSocket` (`0x1801d8920`) for socket 0 at `0x18008e7e9` (read). That the client's
  socket is number 0 is inferred from this being the client's call. `NET_ProcessSocket`'s two other callers are
  `CBaseServer::RunFrame` (`0x180151d3b`) and `CHLTVServer::RunFrame` (`0x18019e6bb`), which are not the client
  (read).
- `NET_ProcessSocket` asks `NET_GetPacket` (`0x1801d72a0`) for a packet, handles it, and asks again until there is
  none (the loop `0x1801d8b40` to `0x1801d8ce2`; read). `NET_GetPacket` has no other caller (read). So one call
  takes every packet that is waiting.
- A packet that belongs to a connection goes to `CNetChan::ProcessPacket` (`0x1801d1d20`, the virtual call at
  `0x1801d8cca`), which runs the loop over the packet's messages (`0x1801d1520`, called at `0x1801d210c`) and
  hands each message to its handler in place (read as far as that loop). W3-03 read the voice message's handler
  (`0x1801fba10`) and the function it calls (`0x1800581a0`), which decodes the packet and writes the ring. That the
  loop's virtual call reaches that handler with nothing queued between is inferred. No queue for a later step was
  seen.
- **A frame with no tick due takes no packets** (read). After the loop, `_Host_RunFrame_Client` is called once
  more only when no tick ran and the demo player says one of two things (`0x1801a65b9` to `0x1801a65e1`).
  Inferred: those are a demo being played back and paused or stepped. A live game never takes that call.
- `CL_ReadPackets` skips the socket when `cl_ignorepackets` is not 0 (default 0), and reads from the demo player
  instead when a demo is playing (`0x18008e69f` to `0x18008e74d`; read). `singlestep` can hold the whole function
  (`0x1801a49f0`; read).

**What a frame of several ticks does** (read for the order, inferred for the sizes). The first tick's
`CL_ReadPackets` takes everything that came since the last frame's last read. Then the first tick's voice pass
runs. The second tick's `CL_ReadPackets` finds only what came during the first tick's own work, which is
nearly nothing, and so on. So under 66.67 frames a second the packets are in effect taken once a frame, at its
start, before any of its ticks. That is the order's "packets, then the ticks".

**At 66.67 frames a second and above** most frames have no tick and take no packets. Packets are taken on the
frames that have a tick, at most once a tick. This agrees with finding 9's "at most once a frame", and it is
narrower: at most once a tick, on a frame's edge.

**What it means for W3-23a.** The first of the frame's three steps stands as the order has it. The row "Looks:
with lag off the client takes packets at most once a frame" moves from inferred to read. The row "Order in a
frame" moves from chosen to read.

## 2. Where `S_Update` paints

**Answer: after the tick loop and after the frame is drawn, once a frame.** Read, high confidence.

- `S_Update` (`0x180030870`) has two callers: `_Host_RunFrame` at `0x1801a6b75`, under the binary's own name
  `_Host_RunFrame_Sound`, and a one-jump entry in the table of the engine's sound class (`0x180017d43`), which is a
  door for other modules (read). The call in `_Host_RunFrame` comes after `_Host_RunFrame_Render` returns
  (`0x1801a6a9c`), which comes after the tick loop (read).
- The paint is the last thing `S_Update` does. At `0x180031326` it reads the clock, writes it to two places (one
  of them the extra update's timer, `0x1804a75e0`), works out the mix-ahead time, and calls the function at
  `0x180031420`, which calls `S_Update_Guts` (`0x180031510`), the function W3-07 read (read).
- With `snd_mix_async` 0, the variable's start value, `S_Update_Guts` runs there and then, on the main thread
  (`0x180031433` to `0x180031479`; read). With `snd_mix_async` not 0 a thread named `SndMix` paints on its own
  clock instead. That mode was not read further.

So in one frame: the packets and ticks of step 4, then the drawing, then the paint. The blocks a frame paints see
the ring after all that frame's packets and after all that frame's ticks have run.

**What it means for W3-23a.** The third step stands as the order has it. In the game the paint comes later in
the frame than the packets by the time the drawing takes. The order's clock puts all three at one instant. On a
machine that is held by `fps_max` the frame's work is short beside the frame, and the limiter's wait comes before
the frame's work (the check at `0x18020e3f0`, called at `0x18020e798` before a frame is run; skimmed, inferred).
On a machine that is slow because drawing is slow, the paint is late in the frame and the packets early. The
order's figures do not cover that case, and no change is asked for it.

## 3. Where the "extra update" can paint

**Answer: only from the client module's drawing of the view, after the tick loop and before `S_Update`.** The
engine's side is read. That nothing else reaches it during play is inferred.

### The extra update itself (read; `0x18002b350`)

It does nothing when the sound system is not running, when `snd_noextraupdate` is not 0, when either of two flag
bytes is set, or when the listener's four vectors all equal one fixed vector (inferred: no listener set yet).
Otherwise:

```
now = clock()
if 0 < now - last < 0.9 * snd_mixahead:      # 0.9 at 0x18035fd38; "last" is the double at 0x1804a75e0
    return
last = now
paint with snd_mixahead alone                 # the function at 0x180031420, then S_Update_Guts
```

`last` is written in two places only: here (`0x18002b47c`) and in `S_Update` just before its own paint
(`0x18003133b`). So the 90 ms run from the last paint of either kind (read). W3-07 said "since the last one".
That is right for either kind.

### Who calls it (read)

A search of the whole code section finds these callers:

| Caller | What it is |
| --- | --- |
| `CEngineClient::Sound_ExtraUpdate()` (`0x1800722f0`, calls at `0x1800723ad` and `0x1800723c1`) | a function the client module calls through the engine's interface (place 34 in `CEngineClient`'s table, offset `0x110`) |
| a one-jump entry at `0x180017a40` | place 24 in `CEngineSoundClient`'s table (offset `0xC0`): the same door on the sound interface |
| sixteen calls from `0x1801aebe2` to `0x1801aff3d` | the functions that write a saved game (they carry the save file's names). Not reached in a multiplayer game (inferred) |

Nothing in the tick loop, in `CL_ReadPackets`, in the network code or in `_Host_RunFrame` itself calls it. So in
ordinary play the extra update runs only when the client module asks.

### Where the client module asks (read by a search of `client.dll`)

The client module keeps the engine's interface in one place (`0x181081a50` in `client.dll`, filled where it asks
for `VEngineClient014`). A search for a call through that place at offset `0x110` finds six, all in the code that
draws the view:

| Call, in `client.dll` | The function, by the names it carries |
| --- | --- |
| `0x180342239` | `CShadowDepthView::Draw` |
| `0x180343a98` | no name; it lies among the view's screen effects |
| `0x18034adff` | the function that carries `CViewRender::DrawMonitors`, `DrawOverlay` and `GrabPreColorCorrectedFrame` |
| `0x18034bddb` | the function that carries `DrawWorld` |
| `0x18034d38f` | `CViewRender::ViewDrawScene` |
| `0x18034dadb` | the function that carries `CViewRender::SetupVis` |

No call through the sound interface's place 24 was found. The search follows the usual pattern (the interface
loaded, then the call). A call through a kept copy of the pointer would be missed, so "six" is medium to high
confidence.

The view is drawn inside `_Host_RunFrame_Render`. So every extra update of ordinary play falls in step 6: after
the frame's packets and ticks, before the frame's `S_Update`. **None can fall between the packets and the
ticks** (inferred from the two reads above, high confidence). The one way round it would be the view being drawn
from inside the tick loop. A loading screen may do that (not read). Play does not.

### When it acts, and what it paints (inferred from the reads)

- It acts in a frame only when 90 ms have passed since the last frame's `S_Update`. `S_Update` is near the end of
  a frame's work, so that needs a frame of about 90 ms or more: 11.1 frames a second or under, or one long frame
  at any rate. W3-07's and the order's "only under 11.1 frames a second" stands for a steady rate.
- At a steady 10 frames a second held by `fps_max`, it acts in every frame, at the first of the six places the
  drawing reaches. The device then holds about 60 ms of the 151 ms the last `S_Update` left it. The extra update
  paints up to 100 ms: 3 or 4 blocks. The frame's `S_Update` paints the rest a little later.
- Both paints come after that frame's packets and ticks, and nothing writes the ring between them. So the blocks
  read the same ring whichever of the two paints them.

**What it means for W3-23a.** The extra update need not be modelled: it moves a few of a frame's blocks from
one paint to an earlier one in the same frame, behind the same packets and ticks. The order's row "not
modelled (chosen), so 10 frames a second is the model's least sure rate" can say instead that leaving it out
changes no sample of the model (inferred from read). 10 frames a second stays the least sure rate for another
reason: nothing under 66 frames a second is logged.

## What else was read

### How many ticks a frame runs (read)

```
remainder += frame duration                  # the limited duration of step 1; not added while a demo is paused
if remainder >= tick:
    n = floor(remainder / tick)
    remainder -= n * tick
```

(`0x1801a6063` to `0x1801a6136`.) So the ticks run by time `t` are `floor(t / 15 ms)`, with `t` the sum of the
frames' limited durations. A tick whose time has just come runs in that frame: the test is "at least". This is
the order's `1323 i <= F(k)`. The order's row "How many are due in a frame" moves from inferred to read.

Two notes. A frame longer than 0.1 s counts as 0.1 s, so under 10 frames a second the game's ticks fall behind
real time (read; outside the page's range). And one more rule can add a tick to make the count even
(`sv_alternateticks`, `0x1801a60d7` to `0x1801a6116`), but only in a game of one player (read), so it does not
bear on voice.

### The mixer's target is `snd_mixahead` plus a smoothed frame duration (read)

W3-07 has "`S_Update` calls this once a frame with `snd_mixahead` (0.1)". What `S_Update` passes is more
(`0x180031346` to `0x18003137c`):

```
e = 0.9 * e + 0.1 * d                        # 0.9 at 0x18035fd38, 0.1 at 0x18035fd2c; e is the float at 0x1804620e4
S_Update_Guts(e + snd_mixahead)
```

`d` is the frame's real duration, before the 0.001 to 0.1 s limit. The function of step 1 gives it to the sound
system's services object at the end (`0x1801a1b9e`; the object returns it at `0x180018f10`). `e` starts at 0.1
(the value in the file) and settles on the frame's duration within some tens of frames. `S_Update` is its only
writer. The extra update passes `snd_mixahead` alone.

With W3-07's rule for the count, `int((ahead − queued) × 86.1328 + 1)`, never more than the device has free of
its 13, the blocks kept queued after `S_Update` at a steady rate are (arithmetic on the read rule):

| Frames a second | Blocks kept | As time |
| ---: | ---: | ---: |
| 223 and above | 9 | 104.5 ms |
| 63 to 222 | 10 | 116.1 ms |
| 37 to 62 | 11 | 127.7 ms |
| 26 to 36 | 12 | 139.3 ms |
| 25 and under | 13, the device's limit | 150.9 ms |

The count is `floor((0.1 + frame duration) × 86.1328) + 1`, so it steps at 222.7, 62.1, 36.5 and 25.8 frames a
second.

Without this term a frame of 100 ms would outlast the 104.5 ms queued once drawing takes 5 ms, and the device
would run dry every frame at 10 frames a second. With it the device holds 150.9 ms at 20 frames a second and
under. A frame longer than that runs the device dry: under 6.6 frames a second, outside the page's range
(arithmetic).

**What it means for W3-23a.** At a steady frame rate the count is fixed, so it is a fixed lead that delays
every sound alike, as the order's rule for blocks assumes. The order's step 3 keeps its form. Two of the order's
statements want new words:

- "paints `9 − queued` blocks" is right at 223 frames a second and above. Under 66.67 the count is 10, 11, 12
  or 13 by the table.
- The fixed lead differs by frame rate by up to 46 ms (9 blocks against 13). The order leaves `D` as it is
  (ruling 3), and `D` does not hold this lead, so nothing changes in the build. A take that compares the game's
  output delay at two frame rates would see it.

Finding 22's replay and finding 30's "512-sample pulls" are untouched: both were logged at 300, 100 and 67 frames
a second, where the count is 9 or 10 and the pulls come one for each block the device finishes (inferred).

### `fps_max` under 30 (read)

The limiter's check (`0x18020e3f0`) does this when the game is not a dedicated server and `sv_cheats` is 0: if
`fps_max` is under 30 and not 0, it prints a message and sets `fps_max` to 30 (the constant 30.0 at
`0x18037b9d8`; `0x18020e44d` to `0x18020e490`). The variable's own help text says it cannot be set while
connected to a server.

So a player's game runs under 30 frames a second only when the machine cannot draw faster, or with `sv_cheats 1`.
Two things follow:

- The order's log request has a section at `fps_max 20`. On the owner's local game that needs `sv_cheats 1`
  first. Without it the game runs that section at 30.
- The page's frame rates from 10 to 29 stand for a machine that is slow, not for a setting. On such a machine
  the paint comes late in the frame (see question 2).

The variable's start value in the file is 400. The record's 300 is what the owner's game ran at (logged, Set G).
Which file sets 300 was not read.

### The threaded way of running a frame (read)

W3-03 skimmed a second way `_Host_RunFrame` runs its ticks (the flag at `0x1807531a8`). The flag is set only
when a server is running in the same game, the client is fully connected, and `host_thread_mode` is not 0
(`0x1801a4875` to `0x1801a48cb`). `host_thread_mode` starts at 0. In that way too, each tick calls
`_Host_RunFrame_Client` (`0x1801a67de`), and the drawing and `S_Update` come after (they are the same
instructions, joined at `0x1801a6a80`). So the order of packets, ticks and mixer is the same.

## What it means for W3-23a, in one place

| The order's statement | After this read |
| --- | --- |
| Order in a frame: packets, then the ticks, then the mixer (chosen) | read. No change to the build |
| With lag off the client takes packets at most once a frame (inferred) | read: once for each tick, at the head of the tick, so once a frame in effect under 66.67 |
| How many ticks are due: `floor(t / 15 ms)` (inferred) | read, with "at least" as the test |
| The mixer paints `9 − queued` blocks (read, W3-07) | corrected: the target is `snd_mixahead` plus a smoothed frame duration, so 10 to 13 blocks under 66.67. A fixed lead at a steady rate. No change to the clock's rule |
| The extra update is not modelled (chosen) | it need not be: it paints in the same frame, after the same packets and ticks |
| A log at `fps_max 20` | needs `sv_cheats 1`, or the game runs it at 30 |

The planner's figures were run on this order of steps (its clock CL), so they need no second run for the order.
They do not hold the mixer's longer lead, which moves no sample of the model.

## What was not read

- The virtual call that ends each tick of the loop (`0x1801a6402`, on the object at `0x18047eaf8`), and what
  `_Host_RunFrame_Input` does beyond running commands and one call that takes the frame's duration
  (`0x18008dd40`).
- The path from `CNetChan`'s message loop to the voice handler, call by call.
- Whether a loading screen draws the view from inside the tick loop.
- `client.dll` beyond the six calls: where else it could reach the sound interface by a kept pointer.
- The `SndMix` thread of `snd_mix_async`.
- The limiter's wait, beyond the place of its check.
- Which file sets `fps_max` to 300.
- `net_fakelag`'s queue inside `NET_GetPacket`. The read above is with lag off.
