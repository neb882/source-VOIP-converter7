# W3-13: the receiver's 24000 to 44100 Hz step, as Steam's decoder does it

Builder's report. The order: `docs/work-orders/W3-13-steam-resampler.md`. Branch `claude/w3-13-steam-resampler`, from
`main` at `bf932bf`. The licence question (a **modified** LGPL file) is the owner's: the notices are all in place,
and the merge waits on the owner's yes.

## Summary

- `vendor/swresample/swresample.js` is a classic script that ports libswresample's float path for mono 16-bit
  24000 to 44100 Hz at the library's defaults, with the four kernels' sums and an exact fused multiply-add. The
  bank is stored as base64.
- **The native library gave all sixteen reference hashes before the port was written**, along with every count and
  stream A's first 12 samples. That was libswresample 4.12.100 (FFmpeg 6.1.1) on this machine, which has SSE4.2,
  AVX, AVX2 and FMA3 and does not report AVX as slow. So all four kernels could be forced here, and all sixteen
  hashes are confirmed natively.
- The port equals the library sample for sample under each kernel on 83 streams: the four reference streams, the
  50 random ones, 3 recorded short-start streams and 26 streams of packet sizes Steam does not send (4,990,615
  samples per kernel). Its fused multiply-add equals the C library's `fmaf` on a million cases built to be hard.
  On 31,068 of them, rounding the double sum would be wrong.
- `bank.mjs` under Node 22.23.4 gives the stored bank, SHA-256
  `318831365a80e9e689d9f730e975fc5713aeafacb5ead762a9b52a95802f867e`, which is the order's.
- `tests/swresample.verify.mjs` has 41 checks and is in `pnpm test`. Each check failed under at least one of 26
  breaks made in a scratch copy (table below). `pnpm test` passes. CI passed on every pushed head; the last one is
  in the hand-back.
- Speed in Node: `fma3` runs at about 5 M output samples per second, 110 to 120 times real time. A 30-minute render
  takes 15 to 16 s. `avx`, `sse` and `c` run at 10 to 13 M per second, so `fma3` is about 2.3 times slower than `avx`.

## Files

| File | What |
| --- | --- |
| `vendor/swresample/swresample.js` | the port (about 600 lines, 224 of them the bank's base64); the header keeps the notices of `resample.c`, `resample_template.c`, `audioconvert.c`, `swresample.c`, `x86/resample.asm` and `mathematics.c`, and the Boost notice above `av_bessel_i0` |
| `vendor/swresample/README.md` | what it is, from what, by whom and when, the tarballs' SHA-256, the interface, the checks |
| `vendor/swresample/COPYING.LGPLv2.1` | FFmpeg 8.1.2's copy, unchanged |
| `tests/swresample/bank.mjs` | the bank computed as `build_filter` does it, with `av_bessel_i0` (also a translation, and it says so) |
| `tests/swresample/native.c`, `native.mjs` | the native comparison (not in CI) |
| `tests/swresample.verify.mjs` | the suite; it also exports the streams that `native.mjs` uses |
| `package.json` | the `test` line gains the suite |
| `README.md` | one row in the file table, and one sentence in the licensing paragraph |

The source is FFmpeg `n8.1.2`, `ffmpeg-8.1.2.tar.xz` from `https://ffmpeg.org/releases/`, SHA-256
`464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`. `ffmpeg-6.1.1.tar.xz` (SHA-256
`8684f4b00f94b85461884c3719382f1261f0d9eb3d59640a1f4ac0873616f968`) was diffed against it. On this path the only
differences are in code the port does not take: the int16 assembly's store, `resample_one` for a filter of length
1, the linear interpolator's types, and the dither call's pointer types.

## The hashes

| Kernel | A | B | C | D | Native |
| --- | --- | --- | --- | --- | --- |
| `fma3` | `69e8e07f…0fd2` | `e04a8322…9790` | `1e5a3be7…468a` | `508b5f66…292e` | confirmed |
| `avx` | `5b982fe0…1a34` | `6b19ea47…b77c` | `c4426f77…b940` | `d367265c…69da` | confirmed |
| `sse` | `b60ad3d9…8fb8` | `9c495e6c…243b` | `b9aff6a4…6b17` | `ad2bcf29…ede9` | confirmed |
| `c` | `e1289e6e…b0b7` | `4ccb02e9…4b70` | `f2bf8bc0…d3fa` | `8fde33cb…6d31` | confirmed |

The port gives all sixteen exactly as the order lists them (the suite compares the full strings). The library
does too. The counts per packet, the first 12 samples, and 6,833 of D's 18,633 samples at a 16-bit limit are all as
the order says. The click positions are 184, 7047 and 7379. On stream A the kernels differ pairwise in 15 to 40
samples, each by one. The response is 0.00, -0.11, -0.71, -2.43 and -3.95 dB, and the image is 12.24 dB under the
input.

Three more streams are recorded from the native library (`fma3`). Their first packets are 0, 20 and 32 samples:

| Stream | Packets | Counts | Hash |
| --- | --- | --- | --- |
| E (seed 5) | 0 480 1440 | 0 853 2646 | `33e9bc8a3d7ea6a9b886db8c1582b19c1b117258cd550c9effc785d6ae345c61` |
| F (seed 6) | 20 480 1440 | 0 908 2646 | `2017e939bb945143c1825422b84931f550883a14e35746d3a38f7a3398250c11` |
| G (seed 7) | 32 480 1440 | 59 882 2646 | `deb4ead3a5867e8ccc82807b8ddbdb997c8dcbbc4682339ec55b865a6406c652` |

## How it was built

1. `native.c` came first. It drives the library with Steam's three calls (`swr_get_out_samples`, `swr_convert`,
   then `swr_convert` with no input when fewer came out than the bound). It forces each kernel with
   `av_force_cpu_flags` before `swr_alloc_set_opts2` and `swr_init`, using the flag sets the order gives. It gave
   the sixteen hashes on the first run.
2. `bank.mjs` follows `build_filter` in C's order of operations. It gave the order's hash on the first run.
3. The port models the stream instead of copying the library's buffer juggling. It holds one buffer of the
   stream's floats, with the inputs -15 to -1 in front. Output k is made when input floor(80k/147)+16 is in. The
   start is mirrored once 33 inputs are in (`invert_initial_buffer` waits for `filter_length + 1`). The first call
   with no input in a stream's life adds `(min(held, 32) + 1) >> 1` mirrored samples, where `held` is what the
   library still holds: 31 after any packet that gave output, so 16 (`resample_flush`). The sums follow
   `resample_template.c` for `c` and the `RESAMPLE_FNS` macro of `x86/resample.asm` for the others, with the
   horizontal sum read from its `vextractf128`, `movhlps` and `shufps` lines. It equalled the library on every
   stream on the first run.
4. The exact fused multiply-add: `p = a*b` is exact. `s = p + c` and `r = fround(s)`. If `r !== s`, Veltkamp's split
   (by 2^28 + 1) tests whether `s` has 25 significant bits, which means it lies halfway between two floats. Only
   then is the two-sum error computed, and when it is not zero the neighbour on its side is taken. The usual path
   costs one multiply, one add, one `fround` and one compare. On the reference streams the halfway case comes up
   15,130 times, but always with zero error. That is why the suite has a separate `fma32` check on six cases taken
   from `fmaf`, and `native.mjs` runs a million.

## Checks and how each was broken

All breaks were made in a scratch copy of the three files and the suite was run on the copy. The suite reports
every check before it exits, so each row shows everything that break fails. "X ABCD" means kernel X's hash and
count check on streams A to D, and "edge" means the E, F and G streams.

| Break | Checks that failed |
| --- | --- |
| fused step made multiply then add (`fma3`) | fma3 ABCD (they become exactly the `avx` hashes), edge E F, the fma3/avx difference (0 samples), fma32 ties, reset, classic script |
| the fused step's tie rule dropped | fma32 ties (only that one: the streams never need the rule) |
| 8 sums made 4 (`fma3`) | fma3 ABCD, edge E F G, reset, classic script |
| horizontal sums in another order (`fma3`: 0+1, 2+3, …) | fma3 ABCD, edge E G, reset, classic script |
| `sse` horizontal sum as (0+1)+(2+3) | sse ABCD |
| `c` with one running sum | c ABCD |
| every kernel runs the `c` sum | fma3, avx and sse ABCD, edge E F G, all six kernel differences (0 samples), reset, classic script |
| output rounded half up | all sixteen hashes, edge E F G, reset, classic script |
| output clipped at 32766 | all sixteen, first 12, D limits, edge, reset, classic script |
| the start not mirrored | 12 hashes (B starts with zeros), first 12, edge, constant, reset, classic script |
| the start mirrored at 16 inputs, not 33 | edge F |
| the flush done on every packet | all sixteen, D limits, edge, response, image, reset, buffer (the rate), classic script |
| the flush never done | all sixteen, D limits, edge F G, click, reset, buffer, classic script |
| the flush of 8 samples | all sixteen, D limits, edge, click, reset, buffer, classic script |
| one bank coefficient up one unit in the last place (phase 1, tap 15) | bank hash, bank.mjs, fma3 D, avx D, edge G |
| phase 0 tap 15 down one unit in the last place | bank hash, bank.mjs, phase-0 tap (it changes no output sample) |
| the window one input late | all sixteen, first 12, D limits, edge, click, phase 0 passes, reset, classic script |
| input scaled by 1.0001 | all sixteen, first 12, D limits, edge, phase 0 passes, constant, reset, classic script |
| default kernel `avx` | interface, reset, classic script |
| an unknown kernel an `Error`, not a `RangeError` | RangeError |
| `reset()` keeps the flush done | reset |
| the buffer never trimmed | buffer (it grows to millions of samples) |
| the classic script exports under another name | classic script |
| `bank.mjs` with `sin(x)/x` | bank.mjs |
| `bank.mjs` with Kaiser beta 8 | bank.mjs |
| the bank stored from Kaiser beta 8 | everything that depends on samples, bank hash, bank.mjs, response, image |

The same breaks were run through `native.mjs`. It fails (exit 1) on every break that changes a sample, and on the
dropped tie rule through its `fmaf` comparison. It passes on the breaks that change no sample: phase 0's ulp, and
the interface, error type, buffer, export name and `bank.mjs` breaks, which are the suite's to catch.

To run the breaks again: copy `vendor/swresample`, `tests/swresample` and `tests/swresample.verify.mjs` into a
scratch tree, edit, and run `node <tree>/tests/swresample.verify.mjs`. The suite finds its files relative to
itself, or from `TF2_DIR` as `tests/verify.js` does.

## Speed (Node 22.23.4, a shared 4-core Xeon VM under load 3)

1440-sample packets of full-scale noise, best of three passes over 60 s of input, on two runs:

| Kernel | M output samples/s | Real time | 30 minutes |
| --- | --- | --- | --- |
| `fma3` (default) | 4.8 to 5.4 | 110 to 123 x | 15 to 16 s |
| `avx` | 11.6 to 12.5 | 263 to 283 x | 6 to 7 s |
| `sse` | 11.1 to 12.9 | 251 to 292 x | 6 to 7 s |
| `c` | 10.0 to 12.1 | 227 to 274 x | 7 to 8 s |

The exact fused step makes `fma3` about 2.3 times slower than `avx`. That is about 15 s for a 30-minute render,
next to the rest of the chain; nothing was optimised beyond this. The suite takes about 5 s, most of it the
10-minute buffer check.

## Where the order could be read another way

1. **The flush count.** The order says the flush adds 16 samples. The library adds `(min(held, 32) + 1) >> 1`,
   which is 16 whenever the first packet gave output. That covers every Steam packet: 480 and up, and records of
   750 and 1500. The port follows the library, so a first packet of 0 adds none and one of 20 adds 10. Both are
   checked natively (streams E, F and G, and 26 more in `native.mjs`).
2. **The start.** The order says the samples before the first are its mirror. The library builds the mirror only
   once 33 inputs have arrived, and gives nothing before then. The port does the same. This matters only for a
   first packet under 33 samples.
3. **"The internal buffer stays under 4,096 samples."** I read this as the allocated input buffer. It is exposed as
   a read-only `bufferSize`, and over 10 minutes of packets up to 3840 it peaks at 3903. It starts at 2048 and
   grows by half, or to the size needed, so a caller who never lets it trim cannot make it copy quadratically.
4. **The interface** is the order's (`KERNELS`, `DEFAULT_KERNEL`, `createResampler({ kernel })` returning
   `{ packet, reset, kernel }`). Additions, all for tests: `bufferSize`, `bank()` (a copy), `fma32`, `BANK_BASE64`,
   `TAPS`, `PHASES`, `IN_RATE` and `OUT_RATE`. `packet()` takes only an `Int16Array` and throws a `TypeError`
   otherwise. It checks by tag, not `instanceof`, so an array from another realm, such as the test sandbox, still
   works. Calling `createResampler()` with no options gives `fma3`.
5. **The 50 random streams** are seeded `0x5EED0000 + k`. Each has 5 to 40 packets. A packet is either a silence
   record (one in five, 750 or 1500 zeros) or 480 times 1 to 8 samples. The level rotates through full scale, a
   square wave at the limits, and quiet (±1024). The order does not define them further.
6. **Notices.** The order lists the headers of `resample.c`, `swresample.c`, `x86/resample.asm` and the Bessel
   function's. I also kept `audioconvert.c` (its two conversion formulas are ported) and noted that
   `resample_template.c` carries `resample.c`'s lines. I kept the Boost notice in full, because the stored bank was
   made with that code. `bank.mjs` translates `build_filter` and `av_bessel_i0`, so it is LGPL too: its header says
   so and points to the full notices in `swresample.js`.
7. **"Phase 0 passes its input … before the first packet's end"** is read as m = 0 to 47, so output 147m is inside
   the first packet's 7056 outputs.

## For W3-11a's builder

- **Load:** `importScripts('vendor/swresample/swresample.js')` in the worker (or a `<script>`); then
  `self.TF2Swresample`. Under Node, `require` it.
- **One resampler per speaker's decoder.** W3-09: Steam keeps a decoder object per speaker until voice is reset.
  Make it with `createResampler()` (the default kernel; do not pass one, so that `DEFAULT_KERNEL` stays the one
  switch).
- **Per message** (the order's "How it meets the channel"): call `packet(int16At24k)` once with everything that
  message decoded to, all its frames together (the counts in the logs, such as 7056 for 3840, are per message). A silence record is `new Int16Array(n)`. The
  `Int16Array` it returns is what the game gets, at 44100 Hz. Its length is the count the receiver's queue is built
  from (7056 for 3840, 2646 for 1440, 882 for 480, 2757 or 2756 for 1500 in the pattern the library gives). Do not
  split or join messages. The counts depend on the cut, and only the first packet flushes.
- **State kept between packets** (all inside the object): the last 31 inputs, the 16 flush samples once, the output
  phase, and two flags (start mirrored, flush done). Nothing for the caller to keep.
- **An Opus decoder reset** (an end marker, a sequence number below the expected one) resets the Opus decoder only.
  It is **not** a `reset()` of the resampler: W3-09 read no resampler reset there. The stream keeps going, and the
  16-sample lateness stays.
- **A new speaker, or voice reset** (a new decoder object): `reset()`, or a new resampler. The next packet then
  starts with no delay, its start mirrored, and flushes once more. That is the "once per speaker per session"
  first-packet behaviour: the first packet comes out whole, and everything after it is 16 inputs (0.67 ms) late.
- `steam` golden hashes will depend on `DEFAULT_KERNEL`. If W3-14 changes it, the `steam` cases are re-recorded once
  and nothing else here changes. The suite already holds all four kernels' hashes.

## Not done

- Finding 29 in `tests/REFERENCE_2026.md`: it is the orchestrator's, before the merge (not in this order's files).
- The browser suite was not run (no page file changes). Nothing loads the module yet.
- The orchestrator's private count check against Set G's logs is not run here.
