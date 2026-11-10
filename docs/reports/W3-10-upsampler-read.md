# W3-10 read: the mixer's upsampler by two, and what it does at a block's edge

A reading job, 2026-11-10. `bin/x64/engine.dll`, SHA-256 `4802a74c...a08ec80` (the file W3-03, W3-07, W3-15 and
W3-17a read; PE32+ x86-64, image base `0x180000000`). Read as data with a disassembler library, never executed.
No leaked source consulted or looked for. Addresses are virtual addresses in that image. Function names are the
binary's own where it prints them (`MIX_PaintChannels`, `MIX_MixChannelsToPaintbuffer`,
`CAudioMixerWave::MixDataToDevice_`, `CAudioMixerWave::LoadMixBuffer`), otherwise labels of mine. Every statement
is marked **read** or **inferred**. No repository was changed. A small integer model written from the reading
(scratch folder, `scripts/model.py`) produced the tables.

## The short answer

- **The phase is the other way round from the order.** Per stage: output `2k + 1` is input `k`; output `2k` is
  the mean of input `k - 1` and input `k`, rounded down. The order has output `2k` = input `k` and `2k + 1` = the
  mean of `k` and `k + 1`. The two give the same numbers one output sample apart: the engine's output is the
  order's delayed by one sample per stage (1 sample at 44100 Hz for a 22050 Hz voice, 3 samples for 11025 Hz).
- **Nothing happens at a block's edge.** The engine does not look ahead. It keeps the previous block's last
  input sample and uses it for the first mean of the next block. The interpolation is continuous across blocks;
  painting in blocks gives exactly what one uninterrupted run gives. The "one sample in 512" the order feared
  does not exist.
- The state is one left/right pair of 32-bit integers per mixer buffer and per upsampling stage; zero when the
  buffers are made; cleared only when all sound is stopped or the sound buffers are cleared; **not** touched
  when a channel starts or stops.
- The entry (multiply, times 1/256, truncate) is at the voice's own rate, before any upsampling. The room and
  the facing buffer are upsampled separately, each with its own state, before the room's processor.

## 1. The upsampler (read)

**Addresses.** The linear upsampler is at `0x1800460e0` (W3-07's address: confirmed). It is reached through a
dispatcher at `0x1800482f0` that takes a filter-type number: 1 jumps to the linear routine; 0 would repeat each
sample; 2 would call another filter at `0x180045e50`. The only callers pass **1** (the constant is set before
each of the calls at `0x180042a7d`, `0x180042af1`, `0x180042b60`, `0x180042bf3`, `0x180042c64`, `0x180042cd3`,
and in the special-buffer path at `0x180041ea4`, `0x180041edd`). The dispatcher is called for the current
buffer by `0x18001e000` (front pair always; rear pair and centre only on surround devices).

**The rule, per call** (count `N` input pairs at the start of the buffer, expanded in place to `2N`, worked
from the end backwards; left and right separately, identical arithmetic):

```
out[2k + 1] = in[k]                              k = 0 .. N-1
out[2k]     = (in[k - 1] + in[k]) >> 1           k = 1 .. N-1
out[0]      = (state + in[0]) >> 1
state       = in[N - 1]                          written last
```

- **Arithmetic:** a 32-bit integer add (wrapping) and an **arithmetic shift right by one**. So the mean is
  rounded toward minus infinity (`(-1 + 0) >> 1 = -1`). There is no division and no rounding toward zero.
- **Per channel:** the buffer holds pairs of 32-bit integers (left, right), 8 bytes a pair; each side is
  interpolated by itself. A voice is identical on both sides (W3-07), so one channel suffices in the app.
- **22050 Hz to 44100 Hz:** one call with `N = count / 2` (256 for a 512 block; `0x180042be3` to `0x180042bf3`).
- **11025 Hz to 44100 Hz:** two calls, the first with `N = count / 4` (128; `0x180042a69` to `0x180042a7d`),
  the second with `N = count / 2` (256) on the first call's output plus whatever the 22050 Hz pass added. Each
  call has **its own state** (stage 0 and stage 1). A 22050 Hz voice meets only stage 1's state.

Written out for 11025 Hz (with `m = (x[k-1] + x[k]) >> 1`):

```
y[4k]     = (x[k-1] + m) >> 1
y[4k + 1] = m
y[4k + 2] = (m + x[k]) >> 1
y[4k + 3] = x[k]
```

## 2. At a block's edge (read)

- **The engine keeps the previous block's last input sample.** No look-ahead, no repeat of the last sample, no
  lean toward zero. The first mean of a block is `(state + in[0]) >> 1` with `state` the buffer's last input of
  the block before (`0x18004628e` to `0x1800462b1`: the last store of the routine writes the block's last input
  pair to the state; the first output pair reads it).
- **Where the state is kept.** In the paint buffer's own record (one record of `0x158` bytes per mixer buffer,
  table at `0x1804E9DF8`): at `+0x34` for the front pair, `+0x94` for the rear pair, `+0xF4` for the centre,
  each an array indexed by the upsampling stage, 24 bytes a stage, of which the linear filter uses the first 8
  (one left/right pair). The stage index is at `+0x30`: set to 0 for every buffer at the start of each block's
  mix (`0x180042990` to `0x1800429ad`) and raised by one after each upsampling of that buffer (`0x18001e089`).
  So: **per mixer buffer (room, facing, facing away each their own), per stage (0: 11025 to 22050, 1: 22050 to
  44100), per side (left, right).** It is not per sound channel: it is the buffer's last input, the sum of all
  sounds of that pass.
- **At the very first block: zero.** The record is zero-filled when the buffer is made (`0x180040a30`, called
  from the buffers' set-up at `0x180046610`).
- **Cleared when:** only by the routine at `0x1800462c0` called with its flag set, which zeroes all paint
  buffers, all three state arrays and the stage index. Its two callers: the engine's stop-all-sounds
  (`0x180030311`, when asked to clear) and its clear-sound-buffers (`0x18002b095`). **Not when a channel starts
  or stops** (inferred from a search of every code reference to the table and to the two record getters: the
  only writers of the state are the upsampler, the zero-fill at creation and that routine). The per-block clear
  inside `MIX_PaintChannels` (`0x180046c50` to `0x180046cc7`) zeroes the sample buffers only.
- **So the stream is seamless.** With silence before the voice the state is 0 at the voice's first sample; after
  the voice's last sample the buffer's input is 0 (the buffers are zeroed every block and the upsampling runs
  on every block whatever is playing), so the last mean comes out in the following position:

  22050 Hz voice of `N` samples `x[0..N-1]` (entered values), output at 44100 Hz counted from the voice's first:
  `y[0] = x[0] >> 1`, `y[2k+1] = x[k]`, `y[2k] = (x[k-1] + x[k]) >> 1`, `y[2N] = x[N-1] >> 1`, then zeros.
  `2N + 1` samples can be non-zero. For 11025 Hz: `4N + 3`.

### Pseudo-code for the builder (integers; the state crosses blocks)

```
// one state per buffer and per stage; start at 0
function mixUpsample2(x, state) {            // x: Int32Array, the block's input; state: {prev: int32}
  const y = new Int32Array(2 * x.length);
  let prev = state.prev;
  for (let k = 0; k < x.length; k++) {
    y[2 * k]     = (prev + x[k]) >> 1;       // JS >> on int32 is the engine's arithmetic shift
    y[2 * k + 1] = x[k];
    prev = x[k];
  }
  state.prev = prev;
  return y;
}

// per 512-sample mixer block, for one buffer (the facing buffer; the room buffer the same with its own two states):
//   speex  (11025): e = 128 entered samples;  y = mixUpsample2(mixUpsample2(e, st0), st1)
//   celt   (22050): e = 256 entered samples;  y = mixUpsample2(e, st1)       // st0 sees zeros and stays 0
//   steam  (44100): e = 512 entered samples;  y = e
// after the voice's last sample the block is filled with zeros and the stage still runs;
// one more block of zeros flushes the last mean (1 sample for celt, 3 for speex).
```

Because the state is carried, the result does not depend on where the blocks fall: one call over the whole
voice followed by zeros gives the same samples as 256-sample (or 128-sample) calls. (Checked in my model on
300 random inputs of random length; the model is mine, the rule is read.)

### Tables: ten input samples across a block boundary

**22050 Hz.** Entered buffer `x[k] = 3k - 766`, a ramp of step 3; block 0 holds `k` 0 to 255, block 1 starts at
`k = 256`. Output index `n` counted from block 0's first output sample. The boundary is between `n = 511` and
`n = 512`.

| Block | k | x[k] | n | Engine | The order's rule as written |
| --- | --- | --- | --- | --- | --- |
| 0 | 251 | -13 | 502, 503 | -15, -13 | -13, -12 |
| 0 | 252 | -10 | 504, 505 | -12, -10 | -10, -9 |
| 0 | 253 | -7 | 506, 507 | -9, -7 | -7, -6 |
| 0 | 254 | -4 | 508, 509 | -6, -4 | -4, -3 |
| 0 | 255 | -1 | 510, 511 | -3, -1 | -1, 0 |
| 1 | 256 | 2 | 512, 513 | **0**, 2 | 2, 3 |
| 1 | 257 | 5 | 514, 515 | 3, 5 | 5, 6 |
| 1 | 258 | 8 | 516, 517 | 6, 8 | 8, 9 |
| 1 | 259 | 11 | 518, 519 | 9, 11 | 11, 12 |
| 1 | 260 | 14 | 520, 521 | 12, 14 | 14, 15 |

`n = 512`, the first sample of block 1, is `(x[255] + x[256]) >> 1 = (-1 + 2) >> 1 = 0`: the mean across the
edge, made from the kept sample. The very first samples of the run: `y[0] = -766 >> 1 = -383`, `y[1] = -766`,
`y[2] = -765`, `y[3] = -763`.

**11025 Hz.** `x[k] = 7k - 892`; block 0 holds `k` 0 to 127, block 1 starts at `k = 128`; the boundary is
between `n = 511` and `n = 512`.

| Block | k | x[k] | n | Engine | The order's rule twice |
| --- | --- | --- | --- | --- | --- |
| 0 | 123 | -31 | 492 to 495 | -37, -35, -33, -31 | -31, -30, -28, -26 |
| 0 | 124 | -24 | 496 to 499 | -30, -28, -26, -24 | -24, -23, -21, -19 |
| 0 | 125 | -17 | 500 to 503 | -23, -21, -19, -17 | -17, -16, -14, -12 |
| 0 | 126 | -10 | 504 to 507 | -16, -14, -12, -10 | -10, -9, -7, -5 |
| 0 | 127 | -3 | 508 to 511 | -9, -7, -5, -3 | -3, -2, 0, 2 |
| 1 | 128 | 4 | 512 to 515 | **-2, 0, 2**, 4 | 4, 5, 7, 9 |
| 1 | 129 | 11 | 516 to 519 | 5, 7, 9, 11 | 11, 12, 14, 16 |
| 1 | 130 | 18 | 520 to 523 | 12, 14, 16, 18 | 18, 19, 21, 23 |
| 1 | 131 | 25 | 524 to 527 | 19, 21, 23, 25 | 25, 26, 28, 30 |
| 1 | 132 | 32 | 528 to 531 | 26, 28, 30, 32 | 32, 33, 35, 37 |

Small cases (state 0 before, zeros after):

| Entered | 22050 Hz: engine output | 11025 Hz: engine output |
| --- | --- | --- |
| 255, 254 | 127, 255, 254, 254, 127, 0 | 63, 127, 191, 255, 254, 254, 254, 254, 190, 127, 63, 0 |
| -1, 0 | -1, -1, -1, 0, 0 | -1 seven times, then 0 |
| 5 | 2, 5, 2, 0 | 1, 2, 3, 5, 3, 2, 1, 0 |
| -5 | -3, -5, -3, 0 | -2, -3, -4, -5, -4, -3, -2, 0 |

## 3. How many input samples a block takes (read)

- The per-rate pass (`MIX_MixChannelsToPaintbuffer`, `0x180040ae0`) asks each channel of its rate for
  `count / (44100 / rate)` samples, both divisions in integers (`0x180040bb9` to `0x180040bd6`): **256** for
  22050 Hz and **128** for 11025 Hz with a 512 block. It hands the pass's rate to the wave mixer as the output
  rate, so the mixer's step is `source rate x pitch / pass rate` = 1.0 for a voice (`0x18004f1b2` to
  `0x18004f1d3`), and the mix starts at position 0 of the block's buffer (the offset argument is 0).
- The upsampler's counts are fixed by the block (`count / 4`, `count / 2`), not by any channel: it always runs
  over the whole block.
- **Fewer samples than the block needs.** For a voice the voice source itself fills the request (the last
  samples repeated once, then zeros: W3-03, not re-read here). The wave mixer's own rule
  (`LoadMixBuffer`, `0x18004ebf0`): if the source gives nothing at the block's first request, the mixer is
  marked finished and nothing more is mixed (`0x18004ec41` to `0x18004ec4d`, `0x18004f548` to `0x18004f54c`);
  if it gives fewer, it is asked again and what is still missing is filled with zeros (`0x18004eeb7` to
  `0x18004eee2`). Either way the rest of the block's buffer is zero (cleared at the block's start), and **the
  upsampler has no special case**: the zeros are input like any other. After a last real sample `s` at input
  `j` the output is `y[2j+1] = s`, `y[2j+2] = s >> 1`, then 0; the state at the block's end is the buffer's
  last input, 0 if the block ended short.
- **Seen in passing, outside the five questions, for W3-02's orders (read).** The wave mixer keeps one sample
  of look-ahead. Its count of samples loaded starts at -1 (`0x18004e7ac` and the sibling constructors), and
  each block it asks for `(last position needed + 1) - loaded` (`0x18004f3ab` to `0x18004f3d6`): **count + 1
  on a channel's first block (513 at 44100 Hz, 257 at 22050, 129 at 11025), count afterwards**. This is the
  513 of the owner's logs. On the first block it **mixes the first `count` samples of what it loaded**, from
  the start of its buffer; the extra, last sample is saved with the channel and is the **first** sample mixed
  in the next block, in front of that block's new samples (`0x18004ec89` to `0x18004ed0e`, `0x18004ef0b` to
  `0x18004ef30`). No sample is skipped and the stream is in order; the mixer simply runs one sample ahead of
  what it plays. `docs/reports/W3-02-plan.md` (the paragraph "Where W3-03 and the logs differ" and the review
  table's first row) has a render's clock "ask for 513 on the first block and play the last 512": by this
  reading it is the **first** 512, and every later block plays the previous pull's last sample and then the
  first 511 (255, 127) of its own. The voice source's side of the pull was not re-read.

## 4. Where the entry's multiply sits (read)

Confirmed: **at the voice's own rate, before any upsampling.**

- Order inside a block (`0x180042870`, called once per block from `MIX_PaintChannels` at `0x180046cd9`):
  the 11025 Hz pass (`0x180042a01`); upsample each active buffer by two (`0x180042a06` to `0x180042b60`); the
  22050 Hz pass (`0x180042b7b`); upsample each active buffer by two (`0x180042b80` to `0x180042cd3`); the
  44100 Hz pass (`0x180042cee`). A channel is mixed only in the pass whose rate equals its source's rate
  (`0x180040cbc` to `0x180040ce4`, as W3-07 read).
- The pass calls the channel's wave mixer (`0x18004f0c0`), which for every active buffer (`0x18004f460` to
  `0x18004f4c6`) calls the 16-bit mono mix (`0x18001dac0`): it gets that buffer's two volumes
  (`0x180041fb0`) and runs the copy loop at `0x180043390` (through `0x180047650`) on the buffer at the block's
  offset. For a step of exactly 1.0 that loop is, per sample and per side: the 16-bit sample as a single, times
  the volume (single), times 1/256 (single, exact), truncated toward zero, **added** into the 32-bit buffer
  (`0x1800433a2` onward). This is `mixEntry` as the order has it.
- So the truncation of the entry happens on each 22050 Hz (or 11025 Hz) sample, and the means are taken of the
  entered integers. `[257, 255]` at volume 255 enters as 255, 254 and the mean between them is 254.

## 5. The room and the facing buffer (read)

- Each is upsampled by itself, with its own state, in the same two places as above: buffer 1 (room), buffer 2
  (facing), buffer 3 (facing away), one call each after the 11025 Hz pass and one each after the 22050 Hz pass.
- Which buffers are active is set per block (`0x1800429af` to `0x1800429e4`): **facing always; room unless
  `dsp_off` is set** (the flag is taken from `dsp_off` at `0x180046a2d`); facing away only when `dsp_off` is 0
  and `dsp_facingaway` is non-zero (`0x180046a9d` to `0x180046ace`; 0 by default). With no room preset the
  room buffer is still upsampled: it holds zeros.
- The room's processor runs afterwards, at 44100 Hz, on the fully upsampled room buffer: every upsampling call
  is inside `0x180042870`, which returns before the slot stage of the same block (`0x1800470a5` onward, W3-15
  and W3-17a; that stage was not re-read, only its place after the call at `0x180046cd9`).
- A voice entered twice (direct share into facing, room share into room) therefore gives two integer buffers,
  each interpolated alone: as the order assumes. One addition: the unit is the **buffer**, not the voice. Two
  voices of the same rate in one buffer are summed before the interpolation (the mix adds into the buffer).

## Where `docs/work-orders/W3-10-output-stage.md` says something else

| # | The order | The engine | Marked |
| --- | --- | --- | --- |
| 1 | Item 2, third bullet: `y[2i] = x[i]`, `y[2i + 1] = (x[i] + x[i + 1]) >> 1` ("each input kept, and between two the mean") | `y[2i + 1] = x[i]`, `y[2i] = (x[i - 1] + x[i]) >> 1`, with `x[-1]` the kept state (0 before a voice that follows silence). Same values, one output sample later per stage: 1 sample for `celt_22`/`celt_44`, 3 for `speex`. The shift itself (rounded down) is as the order says. | read |
| 2 | Item 2: "`mixUpsample2(x)` ... The output is twice the input's length" (a function of the buffer alone) | The function needs a state that crosses calls: one integer per buffer and per stage (per side in the engine). Per call the output is twice the input; over a voice of `N` samples the last mean falls one sample past `2N` (three past `4N` for `speex`), in the zeros that follow. If the render keeps the engine's samples it is `2N + 1` / `4N + 3` long before the device stage. (Whether the render keeps that tail is the builder's choice; the engine goes on painting.) | read; the length remark inferred |
| 3 | Item 2, last bullet ("One thing was not read ..."): built with `x[i + 1]` the voice's next sample across a block's edge, 0 after the last | Settled. There is no look-ahead at all; the mean leans on the **previous** input, kept across the edge. Continuous across blocks, as the order built it, but in the other phase (row 1). After the voice's last sample the next input is 0, as the order has it; before its first the previous input is 0, which the order's rule never uses. | read |
| 4 | Item 3: "Nothing in this order's own arithmetic depends on the block" | Still true with the right rule: the carried state makes the result independent of the blocks. But the upsampler must be run with its state per block (or once over the run), never afresh per block. | read |
| 5 | Checks, "the upsampling": "`mixUpsample2([257, 255])` after the entry gives a middle sample of 254" and "entries of -1 and 0 give -1 between them" | The values stand; their places move. Entries 255, 254 from state 0 give `127, 255, 254, 254` and then `127` when zeros follow (the order's rule: `255, 254, 254, 127`). Entries -1, 0 give `-1, -1, -1, 0`. A check that pins the phase: the first output of a voice that starts with entry `e` is `e >> 1`, the second is `e`. | read |
| 6 | Checks: "a `celt_22` render's mix before the clip equals `mixUpsample2` of the entries by hand, and a `speex` render's the same applied twice" | Holds with the corrected function and two separate states for `speex`. The mutation "one upsampling for `speex`" stays; add "the order's phase" (`[255, 254]` giving 255 first) and "state reset per block" (the ramp table above: sample 512 would be `2 >> 1 = 1` with a reset state, 0 with the kept one). | inferred from the reading |
| 7 | "Open", first point; and the note that the CELT and Speex hashes "move once more" if the edge differs | The edge is settled: no special rule. What moves the hashes is the phase: every sample of the `celt` and `speex` profiles shifts by 1 or 3 mixer samples against the order's text. Better built right the first time than re-recorded. | read |
| 8 | Item 3, "The mixer's blocks": 256 voice samples a block at 22050 Hz, 128 at 11025 Hz | Confirmed. (The mixer's first request of a channel is one sample more, section 3: that is W3-02c's matter, not this order's.) | read |

`docs/reports/W3-07-mixer-output.md`, section 1 ("each input sample is kept and the sample between two is their
mean (an arithmetic shift, so rounded down)") is right as far as it goes; it does not give the phase or the
kept sample.

## What I could not read, or did not

- The voice source's side of a pull (the fade, the repeat on underrun, the starved flag): W3-03's, not re-read.
- The room slot stage and the sum: only their place after the mix-and-upsample call; W3-15 and W3-17a read them.
- The special-buffer path (`0x180041d70`: the dry buffer, the speaker buffer, per-sound DSP buffers) upsamples
  the same way with the same routine; a voice does not go there (W3-07) and I did not read it further.
- The other two filter types of the dispatcher (0 and 2) are never selected; not read.
- Nothing was run. The tables come from my model of the rule, not from the game. A check in the game would need
  a recording at a 44100 Hz device with a known 22050 Hz voice, which the takes do not offer (48000 Hz, with
  ambience): the one-sample phase is below what they can show. It rests on the reading alone, which is plain:
  a short routine with no branches but its loop.
