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
- The port equals the library sample for sample under each kernel on 84 streams: the four reference streams, the
  50 random ones, 4 recorded short-start streams and 26 streams of packet sizes Steam does not send (4,991,529
  samples per kernel). The review's own driver found no difference on 259.9 million samples per kernel. Its fused multiply-add equals the C library's `fmaf` on a million cases built to be hard.
  On 31,068 of them, rounding the double sum would be wrong.
- `bank.mjs` under Node 22.23.4 gives the stored bank, SHA-256
  `318831365a80e9e689d9f730e975fc5713aeafacb5ead762a9b52a95802f867e`, which is the order's.
- `tests/swresample.verify.mjs` has 43 checks and is in `pnpm test`. Each check failed under at least one of 30
  breaks made in a scratch copy (table below; the fix round added stream H, the `fma32` edge cases and four
  breaks). `pnpm test` passes. CI passed on every pushed head; the last one is
  in the hand-back.
- Speed in Node: `fma3` runs at about 5 to 8 M output samples per second, depending on the machine's load, which is
  110 to 180 times real time. A 30-minute render takes 10 to 16 s. `avx`, `sse` and `c` run at 10 to 13 M per second, so `fma3` is about 2.3 times slower than `avx`.

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

Four more streams are recorded from the native library (`fma3`). Their first packets are 0, 20, 32 and 0 samples; H reaches exactly 32 inputs before the 33rd:

| Stream | Packets | Counts | Hash |
| --- | --- | --- | --- |
| E (seed 5) | 0 480 1440 | 0 853 2646 | `33e9bc8a3d7ea6a9b886db8c1582b19c1b117258cd550c9effc785d6ae345c61` |
| F (seed 6) | 20 480 1440 | 0 908 2646 | `2017e939bb945143c1825422b84931f550883a14e35746d3a38f7a3398250c11` |
| G (seed 7) | 32 480 1440 | 59 882 2646 | `deb4ead3a5867e8ccc82807b8ddbdb997c8dcbbc4682339ec55b865a6406c652` |
| H (seed 8, fix round) | 0 32 1 480 | 0 0 32 882 | `391e9afe9e68147ebd3aba741dff8afb9793317f6b116afc6dd85769ae4cfab4` |

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
| the fused step's tie rule dropped | fma32 ties, fma32 edges (the streams never need the rule) |
| `fma32`: halfway judged by 25 bits alone (the first version; fix round) | fma32 edges (`5.87747245476067e-39`, not a float) |
| `fma32`: no special case past the largest float (fix round) | fma32 edges (`-Infinity -Infinity` for `FLT_MAX Infinity`) |
| `fma32`: the overflow halfway point one double ulp off (fix round) | fma32 edges (`Infinity` for `FLT_MAX`) |
| 8 sums made 4 (`fma3`) | fma3 ABCD, edge E F G, reset, classic script |
| horizontal sums in another order (`fma3`: 0+1, 2+3, …) | fma3 ABCD, edge E G, reset, classic script |
| `sse` horizontal sum as (0+1)+(2+3) | sse ABCD |
| `c` with one running sum | c ABCD |
| every kernel runs the `c` sum | fma3, avx and sse ABCD, edge E F G, all six kernel differences (0 samples), reset, classic script |
| output rounded half up | all sixteen hashes, edge E F G, reset, classic script |
| output clipped at 32766 | all sixteen, first 12, D limits, edge, reset, classic script |
| the start not mirrored | 12 hashes (B starts with zeros), first 12, edge, constant, reset, classic script |
| the start mirrored at 16 inputs, not 33 | edge F, edge H |
| the start mirrored at 32 inputs, not 33 (fix round) | edge H (`0 30 2 882`; the library gives `0 0 32 882`) |
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

The same breaks were run through `native.mjs`. It fails (exit 1) on every break that changes a sample. It also fails
on the dropped tie rule (31,068 of its million `fmaf` cases, and 7 of the 10 recorded ones) and on the three
`fma32` edge breaks (the recorded overflow or subnormal cases: "fma32 differs from fmaf"). In the fix round,
`native.mjs` was changed to run `fma32` itself on the ten recorded cases, not only to check the records against
`fmaf`; before that change it passed the three edge breaks. It passes on the breaks that change no sample: phase 0's ulp, and
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

## The owner's logs: the counts, and state kept across reconnects

The orchestrator ran the packet sizes of the owner's game logs (Set G) through the port at `c1f9255`. This is a
private run; the logs are not in this repository. Run as one stream across the log's four sections, the port gives
the logged output count for all 2,372 non-empty packets, with the 2756 and 2757 of the silence records in their
order. Run with each section as a new stream, one count differs. So Steam's decoder kept its resampler's state
across the reconnects between those sections, and the 16-sample flush happened once for the whole log, not once per
connection.

## The fix round (after the review)

`origin/main` was merged in first. `package.json`'s `test` line keeps every suite: main's `steam-sender.verify.mjs`,
then this order's.

1. **`fma32` at the overflow edge and for subnormals.**
   - The review found four inputs where the first version differed from `fmaf`. All lie outside the resampler's
     range: the stream values are 0 or between about 2^-60 and 32. No stream output could change.
   - Past the largest float, `r` is infinite. The first version then took `2s - r`, which is the other infinity.
   - Below 2^-126, a sum with 25 bits or fewer need not be halfway.
   - The 25-bit split stays as a cheap first filter, since every halfway point passes it. The two-sum follows, and
     a zero error returns at once. Only a halfway candidate with a nonzero error reaches the new `fmaSide`:
     - `s` counts as halfway only if `o = 2s - r` is itself a float;
     - for an infinite `r`, only if `|s|` is exactly 2^128 - 2^103, and then `o` is `±FLT_MAX`.
   - Results:
     - the suite's new check "fma32 at the overflow edge and in the subnormal range" holds the four cases;
     - `native.mjs` checks all ten recorded `fma32` cases against `fmaf` (`native --fmaf`): 10 of 10;
     - the review's `fmatest.mjs`, at 3 million cases per category, gives 0 differences in all 8 categories;
     - its `fmacases.mjs` gives 4 of 4 the same.
   - **Speed before and after,** `fma3`, 60 s of 1440-sample packets, the two versions run alternately 8 times on a
     nearly idle machine:

     | Version | M output samples/s, sorted |
     | --- | --- |
     | before | 5.06 to 6.58 (median about 6.3) |
     | after | 6.69 to 8.18 (median about 7.8) |

     It is no slower. The smaller `fma` body probably inlines better. A first attempt that tested `2s - r` on every
     inexact sum was about 25% slower, and was dropped.
   - No reference hash moved: all 16, E to H, and the other checks are unchanged.
2. **The 33-input start.** The review showed that a mirror at 32 inputs passed all 41 checks. Stream H (packets
   0, 32, 1, 480, recorded from the library) now fails under it: `0 30 2 882` against the library's `0 0 32 882`.
3. **`bank.mjs`.** Its header now says three things:
   - the stored bytes are the library's own bank, read from its memory by the review;
   - `bank.mjs` matches them under Node 22 only because `Math.sin`'s differences from the C library's `sin` (8 of 147
     arguments, 204 coefficients before rounding) round away;
   - if its check fails under another Node, the stored bank is still right and the script is what to look at.

   The check's failure message says the same.
4. **Licence notes.** README's licensing paragraph and `vendor/swresample/README.md` name `tests/swresample/bank.mjs`
   as LGPL too. The footer credit is in "For W3-11a's builder".

## Where the order could be read another way

1. **The flush count.** The order says the flush adds 16 samples. The library adds `(min(held, 32) + 1) >> 1`,
   which is 16 whenever the first packet gave output. That covers every Steam packet: 480 and up, and records of
   750 and 1500. The port follows the library, so a first packet of 0 adds none and one of 20 adds 10. Both are
   checked natively (streams E to H, and 26 more in `native.mjs`).
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
- **Reconnects and channel reassignment are not resets.** The orchestrator's run on the owner's logs (below) shows
  Steam kept the resampler's state across the reconnects between a log's sections. One resampler lives as long as
  the speaker's decoder in Steam. Do not reset it when the game's voice channel is reassigned or the player
  reconnects.
- **A new speaker, or voice reset** (a new decoder object): `reset()`, or a new resampler. The next packet then
  starts with no delay, its start mirrored, and flushes once more. That is the "once per speaker per session"
  first-packet behaviour: the first packet comes out whole, and everything after it is 16 inputs (0.67 ms) late.
- **The footer.** When the page starts loading this module, the footer that credits LAME must credit FFmpeg's
  libswresample (LGPL) in the same way. LGPL 2.1 section 6 asks that a work that shows copyright notices while it
  runs include the library's notice and point to the licence (`vendor/swresample/COPYING.LGPLv2.1`).
- `steam` golden hashes will depend on `DEFAULT_KERNEL`. If W3-14 changes it, the `steam` cases are re-recorded once
  and nothing else here changes. The suite already holds all four kernels' hashes.

## Not done

- Finding 29 in `tests/REFERENCE_2026.md`: it is the orchestrator's, before the merge (not in this order's files).
- The browser suite was not run (no page file changes). Nothing loads the module yet.
- The orchestrator's private count check against Set G's logs is not run here.
