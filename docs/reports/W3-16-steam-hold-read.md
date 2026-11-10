# W3-16 read: the hold's arithmetic, the clock, and the decoder when a message does not fit

2026-11-10. Read as data with a disassembler library; nothing was executed; no leaked source was looked for.
Nothing of any binary is in this file: words, formulas and addresses only.

Files read:

- The owner's `steamclient64.dll` (image base `0x138000000`, SHA-256 `e9045710...`, the file W3-09 read). Every
  address below is in it unless marked "tier0".
- **One file outside the brief:** `tier0_s64.dll` from Valve's public client package, the copy W3-09 had already
  downloaded (SHA-256 `8559e6bd32eb3fddd95079633272866deb292211ec4f7e69aeb0ec48fdafef72`, linked 2026-10-21, image
  base `0x13f000000`). The time function is not in `steamclient64.dll`: it is imported from that library. The
  owner's own copy of it is not on this machine. Question 2 could not be answered without it.

Each statement is marked **read** (with the address) or **inferred**.

## Short answers

1. The hold is `now > noted + 0.4`, **all in 32-bit floats**: the float sum is rounded to a float, then a strict
   "greater than". It is not "now less noted, over 0.4". At a float step of 1/32 s the two forms differ: the code
   needs 14 steps (437.5 ms on the float clock) where the other form needs 13.
2. The clock is seconds since the **process** loaded Valve's timer library, so since Steam started, not since the
   PC started (read in the public build of that library; the process being Steam's is inferred).
3. The 24 kHz buffer holds **17 frames**. A record that needs more is cut at 17, the frame that did not fit has
   its sequence number spent without being decoded, and the rest of the record is skipped. The game is told
   "buffer too small" (code 4) when the resampled sound exceeds its room, and gets nothing. So W3-14's case was
   10 concealed and **7** decoded (not 8), then a gap of 4.

## 1. The hold

### a. "Now"

- **Read:** the function that runs the microphone each frame (`MicrophoneThink`, `0x1380d7250`) calls the
  imported time function once, at `0x1380d72c7`. It returns a **double, in seconds**.
- **Read:** the double is narrowed to a **32-bit float** at `0x1380d72d0` and stored in the voice object at
  offset `0x24` (`0x1380d72d4`). This happens once per frame, **before** the microphone is read.
- **Read:** every time test of the gate uses that stored float. The gate function does not call the clock itself.
- Since what: see section 2.

### b. The noted time

- **Read:** a 32-bit float at offset `0x94`. It is a bit-for-bit copy of the float "now" (`0x1380d5fd2` to
  `0x1380d5fd5`).
- **Read:** it is copied whenever the chunk has at least one sample and is active (`0x1380d5fab`,
  `0x1380d5fb3`), in every state, the onset included.
- **Read:** so it is the time of the frame's start (the read's time). The chunk's length is not added.

### c. The comparison

- **Read** (`0x1380d6146` to `0x1380d6168`), only when the state is "hanging" after this chunk's state change:
  1. take the noted float;
  2. add the constant in **single precision** (`0x1380d6154`); the result is rounded to a 32-bit float;
  3. compare the float "now" with that sum (`0x1380d6161`);
  4. the chunk is the last one when now is **strictly greater** (`0x1380d6164`; equal is not enough).
- **Read:** the constant is the 32-bit float nearest 0.4, which is 0.4000000059604645 (at `0x139199e04`). No
  double takes part.
- **Read:** the state changes first (`0x1380d6118` to `0x1380d611d`). So the first inactive chunk after an
  active one is itself tested, and can be the last. A read with no samples in the hanging state is tested too
  (that is the empty packet).
- **Inferred** (plain float arithmetic, checked with a script): with a float step Q, the sum `noted + 0.4`
  rounds to `noted + round(0.4 / Q) x Q`, and "now" must be one step beyond it.

| Steam has run | Step Q | Steps needed | On the float clock | In real time, by where the last active read fell | The other form (now less noted, over 0.4) |
| --- | --- | ---: | ---: | --- | --- |
| under 9 hours | 2 ms or less | | 400 to 402.3 ms | 400 to 402.3 ms | the same, or one step fewer |
| 9 to 18 hours | 1/256 s | 103 | 402.3 ms | 398.4 to 402.3 ms | 103 |
| 18 to 36 hours | 1/128 s | 52 | 406.25 ms | 398.4 to 406.25 ms | 52 |
| 1.5 to 3.0 days | 1/64 s | 27 | 421.9 ms | 406.25 to 421.9 ms | 26 |
| 3.0 to 6.1 days | 1/32 s | **14** | **437.5 ms** | **406.25 to 437.5 ms** | 13 (375 to 406.25 ms) |
| 6.1 to 12.1 days | 1/16 s | 7 | 437.5 ms | 375 to 437.5 ms | 7 |
| 12.1 to 24.3 days | 1/8 s | 4 | 500 ms | 375 to 500 ms | 4 |
| 24.3 to 48.5 days | 1/4 s | 3 | 750 ms | 500 to 750 ms | 2 |

- **Inferred:** W3-14's run (step 1/8, four steps) fits the code. W3-14's proposed model (`Q = 1/32` with the
  other form, real threshold 375 to 406 ms) does not match the code: at 1/32 the code gives 406 to 437 ms. The
  demo's bound of 375 to 406 ms fits the code when Steam had run **under 1.5 days** (398 to 406 ms), and is
  inside the ranges for 6 to 24 days. It does not fit 1.5 to 6.1 days. Which case the demo was is for the owner
  to say (how long Steam had been running).
- **Inferred, not read:** the processor's rounding mode is the default (to nearest, ties to even).

### d. The chunk's length

**With a file as the microphone** (**read**, `0x1380d6562` to `0x1380d65a5`, in the function at `0x1380d6370`):

1. The clock is called **again** here (`0x1380d6562`): a fresh double, not the frame's float.
2. The last-read time is a **32-bit float** at offset `0x18c`. It is widened to a double and subtracted from
   the fresh time **in doubles** (`0x1380d6568` to `0x1380d6573`).
3. The difference is narrowed to a float (`0x1380d6577`), multiplied by the float 24000 in single precision
   (`0x1380d657b`, constant at `0x139199e1c`), and **truncated toward zero** to a 32-bit integer (`0x1380d6583`).
4. The count is the smaller of that and the room (`0x1380d6587` to `0x1380d658a`).
5. The clock is called a **third** time (`0x1380d658e`); that double, narrowed to a float, **replaces** the
   last-read time (`0x1380d6599` to `0x1380d659d`). This is done on every read: also when the count was cut by
   the cap, and also when it was zero or negative.
6. A count of zero or less copies nothing and the read returns 0 (`0x1380d65a5`).

- **Read:** the room is 6000 less the carried samples: the smaller of half of 12002 and half of 12001 (the two
  buffer sizes passed at `0x1380d744c` and `0x1380d7455`), less the count at offset `0x120` (`0x1380d5de7` to
  `0x1380d5e10`). The carry is only filled when `voice_preprocess` is on, so the room is 6000.
- **Read:** samples beyond the cap are not kept for later: the float jumps to now.
- **Read:** when the file is first loaded, the last-read time is set to the time then **less 1.0** (subtracted
  in doubles, then narrowed; `0x1380d6458` to `0x1380d646e`). The file position is not reset by a key press.
- **So, against W3-14's rebuild:** the code does not advance the float by a rounded step. It stores **the real
  time, rounded to a float**. W3-14's rule ("old float plus the step rounded to the grid; the read's real time
  is the old float plus n") gives the same numbers, because the grid is absolute, with three small exceptions
  (**inferred**): the real time is up to one sample later than "old float plus n" (the truncation); a read cut
  by the cap happened later than "old float plus 6000"; and a read that fell before the rounded time brings
  nothing and leaves the float where it was.
- **Inferred:** each read drops the fraction of a sample, and the rounding errors do not cancel between reads,
  so the file is not played at exactly real time (about half a sample lost per read, plus a slow random drift).
- **Inferred:** if more than about 24.8 hours pass between two reads of the file, the integer overflows and
  that read brings nothing.

**With a real microphone** (**read**): the clock takes no part. The read asks the capture device
(`0x1380d6655` to `0x1380d666c`), and the device's read (`0x1380dea90`) returns the bytes between its
last-read position and the capture cursor. If more than the room is waiting, the start is moved up so that the
**newest** 6000 samples are taken and the oldest are skipped (`0x1380deb5c` to `0x1380deb98`). The last-read
position is then set to the cursor (`0x1380dec60` to `0x1380dec67`).

### e. Key up, and the other time tests

All **read**. "Float" means 32-bit.

| Where | Test | Types | Constant |
| --- | --- | --- | --- |
| Gate, `0x1380d6161` | last chunk when now > noted + 0.4 | float sum, float compare, strict | float 0.4, `0x139199e04` |
| `MicrophoneThink`, `0x1380d72de` to `0x1380d7302` | the device is stopped when the stop time is not zero and now > stop + 0.5 | float sum, float compare, strict | float 0.5 (exact), `0x139199e08` |
| `MicrophoneThink`, `0x1380d73a0` to `0x1380d73ba` | the level meter is zeroed when now > (time of the last gate call) + 1.0 | float sum, float compare, strict | float 1.0, `0x1391995e0` |
| `CheckMicrophone`, `0x1380d0fd3` to `0x1380d0ffb` | the client stops taking chunks for the game when a fresh clock reading > stop + 0.5 | **doubles** throughout, strict | double 0.5, `0x139199008` |

- The microphone's stop time (offset `0xc0`) is a copy of the float "now" of the **last frame**, made when the
  last user of the microphone leaves (`0x1380d7016` to `0x1380d7019`). It is not a fresh reading. Zero means "no
  stop pending". A new key press inside the tail sets it back to zero and resets nothing (`0x1380d71f8` to
  `0x1380d7239`).
- The microphone counts as running while it has a user or that stop time is not zero (`0x1380d6e90`). So the
  gate goes on running for the float tail.
- The client's stop time (offset `0x18` of the client's audio object) is a double from a fresh clock reading at
  `StopVoiceRecording` (`0x1380d128e` to `0x1380d1294`). While it is above zero the client still takes chunks
  (`0x1380d0cfe` to `0x1380d0d0d`).
- **Inferred:** the two tails differ. The game's queue is fed for an exact 0.5 s. The device and the gate run
  for 0.5 s plus up to one float step (at 1/8 s: five steps, up to 0.625 s; at 1/32 s: 17 steps, up to 0.531 s).
  A spurt can therefore end inside the float tail after the exact tail is over: its last packet is made and
  never collected.
- The gate function has no other time test. Its only other float work is the level meter (the peak times
  1/32768, kept between 0 and 1).

## 2. Where the clock counts from

- **Read:** `steamclient64.dll` imports the time function from `tier0_s64.dll` (import slot `0x13918e4b8`).
  Every call in the voice code goes through it.
- **Read (tier0, public build):** the function (`0x13f00ee60`) reads the Windows performance counter
  (`0x13f00ee78`), keeps it from going backwards against the last value seen (`0x13f00ee83` to `0x13f00ee94`),
  subtracts a saved base (`0x13f00ee9b`), converts to a double (`0x13f00eea5`) and divides by the counter's
  frequency held as a double (`0x13f00eeaa`). Result: seconds, as a double.
- **Read (tier0):** the base is the counter's value at start-up (`0x13f00edbc` to `0x13f00edce`), set once,
  only while it is still zero (`0x13f00ed54` to `0x13f00ed5e`). The start-up routine (`0x13f00ed50`) is run by
  a static initialiser of the library (`0x13f0011a0`, listed in the table at `0x13f0a5668`), so when the
  library is loaded into the process. Nothing else writes the base.
- **So:** the clock is **zero when the process loads the timer library, and counts from there**. It is not the
  PC's up-time and not the system tick count.
- **Inferred:** the process is the Steam client's own, so the float's step follows **how long Steam has been
  running**. Grounds: `mic_inputfile` was set in Steam's console and Steam's console printed the chunk lines
  (W3-14), and the function that feeds the game's queue is named as part of Steam's user frame.
- **Inferred:** W3-14's step of 1/8 s then means Steam itself had been running 12.1 to 24.3 days at that run.
  If the owner knows Steam was restarted more recently than that, the owner's build of the library differs from
  the public one read here.
- **Not read:** the owner's own `tier0_s64.dll` (the public build is eight days newer than the owner's
  `steamclient64.dll`). Whether the counter runs on while the PC sleeps is Windows's matter, not read.

## 3. The decoder when a message does not fit

### The buffers

| Buffer | Size | Where |
| --- | --- | --- |
| 24 kHz, one per record, on the stack | **16384 bytes**: 8192 samples, room for **17** whole frames of 480 (16320 bytes) | passed at `0x1380dce68` |
| The speaker's output ring (at the output rate) | **48000 bytes**: 24000 samples | made at `0x1380dcb14` |
| The caller's (the engine's) | 22528 bytes (11264 samples, 12 frames at 44.1 kHz) | not in this file: W3-03's reading of the engine |

### One type 6 record (**read**, `0x1380e3110`)

For each frame, in this order:

1. Read the length. The end marker resets the decoder and sets the expected number to 0 (`0x1380e3178` to
   `0x1380e3189`).
2. Read the frame's number (`0x1380e319c`). Behind the expected one: reset the decoder (`0x1380e31a8` to
   `0x1380e31b4`). Ahead: conceal `min(gap, 10)` frames (`0x1380e31bb` to `0x1380e31c7`), but each concealed
   frame is made only if 960 more bytes fit; if not, the concealing stops (`0x1380e31d0` to `0x1380e31da`).
3. **The expected number becomes this frame's number plus one** (16-bit), at `0x1380e3212` to `0x1380e3216`.
   This is before the room test.
4. If the frame's data would run past the record, stop (`0x1380e321b` to `0x1380e3222`).
5. **If 960 more bytes do not fit, stop** (`0x1380e3224` to `0x1380e322e`). The frame is not decoded.
6. Otherwise decode it (a length of 0 gives 480 zeros).

It returns the samples made so far (`0x1380e32a9` to `0x1380e32ae`). There is no error code.

### After the record (**read**)

- The decode step reports success whatever the count (`0x1380dcfb5`).
- What was decoded, and only that, goes to the resampler in one call (`0x1380dcf69`), and the result is written
  to the speaker's ring (`0x1380dcf7c`; `0x1380dcf28` when the rates are equal).
- The message reader then **skips the whole record** by its stated length (`0x1380dd3d4` to `0x1380dd3df`) and
  goes on to the next record. The frames after the cut are never read.
- If a write passes the ring's 48000 bytes, the oldest bytes are overwritten and the ring keeps the newest
  48000 (`0x138d078f1` to `0x138d07917`).

### Back to the caller (**read**, `0x1380d5640`)

- The ring is **emptied at the start of every call** for that speaker (`0x1380d578b` to `0x1380d578f`).
- After the records: if the ring holds more bytes than the caller's room, the function writes **the number of
  bytes needed** into the caller's count and returns **4** (`0x1380d57b6` to `0x1380d57d9`). Nothing is copied.
  Otherwise it copies everything and returns 0 (`0x1380d57db` to `0x1380d57f7`).
- `DecompressVoice` hands that code back unchanged (`0x1380cfc6f` to `0x1380cfc75`). In the public Steamworks
  header, 4 is "buffer too small" (recalled from the public SDK, not fetched here).
- Sound refused this way is lost: the decoder and the resampler have moved on, and the ring is emptied at the
  next call.

### W3-14's case, by this reading

A message of 12 coded frames, 34 frames after the last one the decoder had:

- 10 frames concealed, then coded frames 1 to 7 decoded: 17 frames, 8160 samples at 24 kHz. (**Read.**)
- Coded frame 8: its number is read and spent, there is no room, the record is cut. Frames 8 to 12 are never
  decoded. (**Read.**)
- The resampler is fed the 8160 samples: about 14,994 samples at 44.1 kHz, 29,988 bytes. (**Read** for the
  call; the count is arithmetic.)
- That is more than the engine's 22,528 bytes: code 4, the game gets nothing. (**Read** here for the code;
  the engine's room is W3-03's.)
- The next message's first number is 4 ahead (frames 9 to 12): 4 concealed, then its 5 decoded: 9 frames,
  7938 samples. This is the log's count. (**Read** for the rule; the match is W3-14's.)

**Against W3-14:** the count of 18 is right as sequence numbers (the expected number moved on by 8). But only
**7** coded frames went through the decoder, not 8, and 17 frames of sound went through the resampler, not 18.
A model that decodes the 8th frame has a different decoder state before the 4 concealed frames. That may be
part of the 576 samples still differing in the gate clip (**inferred**; not tested).

### What stays inferred

- **Whether the engine retries.** Not in this file. A retry with the same message would find its numbers
  behind the expected one: the decoder would be reset and all 12 frames decoded with no concealment, and the
  next message would find no gap. W3-14's log shows nothing and then 9 frames, so there was no retry.
- **Any message over 12 frames is refused by the engine's room**, concealed or not: 13 frames at 44.1 kHz are
  22,932 bytes. So an opening of 6000 samples behind a pre-roll of 2400 (17 frames) would not be heard at all.
- Several records in one message each get their own 17 frames; the ring then holds them all, up to 48000 bytes.

## What a builder should code

All times are doubles unless a name ends in `F`; a name ending in `F` holds a value already passed through
`Math.fround`. `T()` is the clock: seconds since Steam started, a double.

```
const HOLD_F = Math.fround(0.4)            // 0.4000000059604645
const TAIL_F = 0.5                         // exact in a float

// each Steam frame, before the read
nowF = Math.fround(T())

// the microphone's tail after key up (the device and the gate keep running until this fires)
if (stopF !== 0 && nowF > Math.fround(stopF + TAIL_F)) { stopF = 0; if (users === 0) stopDevice() }
// at key up, when the last user leaves:   stopF = nowF        (the last frame's float, not a new reading)
// at key down inside the tail:            stopF = 0           (nothing is reset)
// the queue the game reads, in doubles:   at key up stopD = T();
//                                         each frame, after taking the chunk: if (stopD > 0 && T() > stopD + 0.5) stop taking

// the read, file input only (a microphone's chunk is what the capture cursor gained, at most ROOM, newest kept)
ROOM  = 6000                               // less the carry, which is 0 unless voice_preprocess is on
t1    = T()                                // a fresh reading, a little after nowF's
dF    = Math.fround(t1 - lastF)            // subtraction in doubles, then narrowed
n     = Math.trunc(Math.fround(dF * 24000))// float product, truncated toward zero (beyond 32 bits: treat as negative)
count = Math.min(ROOM, n)
lastF = Math.fround(T())                   // always, even when count <= 0 or the cap cut it
if (count <= 0) count = 0                  // nothing read; the frame goes on with an empty chunk
// at the file's first load:               lastF = Math.fround(T() - 1.0)

// the gate, after the read
active = count > 0 && levelTest(chunk)
if (active) {
    notedF = nowF                          // in every state
    // SILENT: pre-roll in front; then state = ACTIVE
} else if (state === ACTIVE) {
    state = HANGING
} else if (state === SILENT || state === ENDED) {
    // pre-roll buffer, silence record after ENDED; return
}
final = false
if (state === HANGING && nowF > Math.fround(notedF + HOLD_F)) { final = true; state = ENDED }
// encode(chunk, final)
```

Notes for the builder:

- `Math.fround(a + b)` of two float values is exactly the single-precision sum here, and
  `Math.fround(dF * 24000)` is exactly the single-precision product (both are exact in a double first).
- The test runs in the same frame that turns ACTIVE into HANGING, and on frames whose read brought nothing.
- In a model that draws read times `r`: `f(r) = Math.fround(r)`, and the spurt's last chunk is the first
  hanging read with `f(r) > Math.fround(f(r_last_active) + Math.fround(0.4))`. Replace W3-14's
  `f(r) - f(r_last_active) > HOLD` with this. `r` must be the absolute time on Steam's clock (its size sets
  the step), so the model needs "how long Steam has run" as an input.

The decoder, per type 6 record:

```
made = 0                                   // frames in the 24 kHz buffer; at most 17
for each frame of the record:
    len = u16
    if (len === 0xFFFF) { resetDecoder(); expected = 0; continue }
    seq = u16
    if (seq < expected) resetDecoder()
    else if (seq > expected)
        for (i = 0; i < Math.min(seq - expected, 10) && made < 17; i++) { conceal(); made++ }
    expected = (seq + 1) & 0xFFFF
    if (the frame's data runs past the record) break
    if (made === 17) break                 // not decoded; its number is spent; the rest of the record is skipped
    len === 0 ? 480 zeros : decode(data); made++
resample(made x 480 samples) -> the speaker's ring (48000 bytes, emptied at the start of each call)
// after all records of the message: if the ring holds more bytes than the caller's room (the engine: 22528),
// the caller gets code 4 and no sound; the sound is lost
```

## Not read

- The owner's own `tier0_s64.dll` (the public build was read in its place).
- The engine's side of code 4 (not in this file).
- Which process runs the capture (inferred from W3-14's run).
- The processor's rounding mode at these additions (assumed the default).
