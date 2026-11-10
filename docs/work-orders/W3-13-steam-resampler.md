# W3-13: the receiver's 24000 to 44100 Hz step, as Steam's decoder does it

*Rewritten 2026-11-10 after the plan's review (findings 1 to 6; `docs/reports/W3-11-plan.md`, "The review"). The
first version described 16-bit integer arithmetic, which the library does not use for a rate change: it was
wrong, and its own reference hashes could not be met by it. Revised again the same day after the second read
(its findings 1 to 4): the tool that was to tell the kernel from a recording is gone from this order; that
question is W3-14's.*

**Depends on:** W3-09's report (`docs/reports/W3-09-steam-voice.md`, section 4). Nothing else: it adds new files
only, so it can start now and run beside any order (the `test` line of `package.json` is shared with W3-02a,
W3-02b and W3-12a: a trivial merge). **Before W3-11a**, which wires it in. **Before it merges** the orchestrator
writes finding 29 into `tests/REFERENCE_2026.md` (CLAUDE.md: a measured constant changes with its evidence).
**Kind:** code. `tf-builder` (effort high), then `tf-reviewer`. **Branch:** `claude/w3-13-steam-resampler`, from
`main`. **Worktree:** given in the brief. **Time budget:** 1 day.

## Why

Steam's decoder hands each packet's 24 kHz samples to FFmpeg's libswresample at its default settings and gives
the game what comes back (W3-09, read, and reproduced with the public library). The app stands in for it with
its own windowed sinc over the whole signal. That differs in three ways a recording can show: the response
above 10.5 kHz (-4 dB at 11.75 kHz) and the images it leaves from 12 to 13.5 kHz; the sample counts per packet,
which the receiver's queue is built from (7056 for 3840, 2646 for 1440, 882 for 480, and 2757 or 2756 for a
silence record of 1500); and what happens at a speaker's first packet.

## What the library does (public source, `n6.1.1` and `n8.1.2` alike in everything below)

- **Float inside.** For 16-bit in and out at different rates the library converts to 32-bit float, resamples in
  float, and converts back: in, `x = s x (1 / 32768)`; out, `clip16(round-half-even(float(y x 32768)))`.
- **The bank** is 147 phases of 32 taps of 32-bit float (filter size 32; 147 because 44100/24000 reduces to
  147/80 and the exact-ratio option is on; the cut-off factor is 1.0 since the output rate is higher). Phase
  `ph`, tap `i`: `x = pi x ((i - 15) - ph / 147)`; `y = 1` if `x` is 0, else `s / x` with `s = sin(pi x ph / 147)`
  for tap 0 and its sign turned at each tap; times the Kaiser window `I0(9 x sqrt(max(1 - w^2, 0)))` with
  `w = 2 x / (32 pi)`, `I0` being `av_bessel_i0` of `libavutil/mathematics.c` (a ratio of two polynomials in
  `x^2` for arguments up to 15). All in doubles. Each coefficient is divided by the sum of phase 0's 32 values
  and stored as a float. **Every one of the 147 phases is computed this way; none is a mirror of another** (147
  is odd). Phase 0 is exactly one 1.0 at tap 15, so every 147th output is an input sample unchanged.
- **An output sample** `k` is the dot product of phase `80 k mod 147` with the 32 input samples from
  `floor(80 k / 147) - 15`.
- **The order of that sum depends on the processor.** On x86-64 the library picks an assembly kernel when it
  starts, by the CPU's features; a build without assembly runs C. The four give different last bits in a few
  samples per ten thousand:

  | Kernel | The sum |
  | --- | --- |
  | `fma3` | 8 running sums, tap `j` into sum `j mod 8`, each step a **fused** multiply-add (one rounding); then sums 0+4, 1+5, 2+6, 3+7; then (0+4)+(2+6) and (1+5)+(3+7); then those two |
  | `avx` | the same 8 sums and the same order, but multiply, round to float, then add |
  | `sse` | 4 running sums, tap `j` into sum `j mod 4`, multiply then add; then 0+2 and 1+3; then those two |
  | `c` | 2 running sums, even taps and odd taps, multiply then add; then the two |

  Every step is rounded to 32-bit float. A fused multiply-add can be had exactly in JavaScript: the product of
  two floats is exact in a double; add the third in double and get the error of that sum (two-sum); round the
  sum to float; and when the double sum lies exactly halfway between two neighbouring floats and the error is
  not zero, take the neighbour on the error's side.
- **The stream.** The samples before a stream's first are its first 32 mirrored about sample 0 (`x[-n] =
  x[n]`), so the first output is on the first input, with no delay. A call gives every output whose 32 samples
  have arrived: output `k` is made when sample `floor(80 k / 147) + 16` is in.
- **Steam's three calls per packet** (ask the upper bound, convert, convert again with no input because the
  bound is always higher than what came). The first time in a stream's life, that last call **flushes**: 16
  samples are added after the packet's last as its mirror (`x[N + j] = x[N - 1 - j]`), so the first packet comes
  out whole. Those 16 samples stay in the stream: everything after is 16 input samples (0.67 ms) late.

## The decision: a port, kept as a library of its own

Building libswresample to WebAssembly was weighed and is not ordered: it needs a large part of libavutil, and a
WebAssembly build runs the `c` kernel, which is not what an x86 Steam client runs (it would fail the `fma3`
hashes below in 40, 10, 9 and 20 samples of the four streams). A port of this one path is about 200 lines, can
run any of the four kernels, and **was shown to work before this order was written**: a float port in each
kernel's order equals the native library, forced to that kernel, on every sample of the four streams below.

**Which kernel Steam runs on the owner's PC is not known.** The default here is `fma3` (what a current x86-64
processor picks, if Valve's build has the assembly in). It is one constant, `DEFAULT_KERNEL`; changing it needs
no other change in this module (the hashes for all four are in the test), and then a re-record of the `steam`
golden hashes downstream. The owner's file-input recording, if it comes, decides it: that is
`docs/work-orders/W3-14-steam-file-input.md`, an investigation, and nothing in this order waits for it.

**The licence.** libswresample is under the GNU LGPL, version 2.1 or later. A port is a translation of that
source, so the port is under the same licence. The project already ships an LGPL library (LAME, unmodified,
`vendor/lame/`); this one is **modified** (translated), which is the owner's to confirm.

| The licence asks | Here |
| --- | --- |
| The library stays a library of its own, replaceable | one file, `vendor/swresample/swresample.js`, with a small documented interface; the app only calls it |
| The upstream notices stay | the file's header keeps FFmpeg's copyright and LGPL header lines as they stand in `libswresample/resample.c` and `swresample.c`, the author line of the Bessel function in `libavutil/mathematics.c` with the notice that code carries, and the header of `libswresample/x86/resample.asm` |
| A changed version says so, by whom and when | the header and `vendor/swresample/README.md`: translated to JavaScript on the date, from FFmpeg `n8.1.2` (`libswresample/swresample.c`, `resample.c`, `resample_template.c`, `x86/resample.asm`, `libavutil/mathematics.c`), the mono 16-bit 24000 to 44100 Hz path only |
| The licence's text ships with it; the source is available | `vendor/swresample/COPYING.LGPLv2.1`; the file is its own source; README's "Files and licensing" names it and says it is a modified part of FFmpeg |

## What to build

1. **`vendor/swresample/swresample.js`**, a classic script in the form of `demo.js` (an IIFE that sets
   `module.exports` under Node and `root.TF2Swresample` elsewhere; no imports), so `importScripts` and the test
   sandbox can load it. It exports `KERNELS = ['fma3', 'avx', 'sse', 'c']`, `DEFAULT_KERNEL = 'fma3'`, and
   `createResampler({ kernel })` returning `{ packet(Int16Array) -> Int16Array, reset(), kernel }`: 24000 to
   44100 Hz, one stream. `packet` is "Steam's three calls" above; `reset()` is a new stream (a new speaker, or
   voice reset). An unknown kernel is a `RangeError`. The public source is the authority (FFmpeg `n8.1.2` from
   `https://ffmpeg.org/releases/` or `https://code.ffmpeg.org/FFmpeg/FFmpeg`; record the tarball's SHA-256 in the
   README); "What the library does" is the behaviour to arrive at.
2. **The bank is stored, not computed in the page.** `Math.sin` is not the same function in every browser, and
   one different last bit in a coefficient would break "the same input gives the same samples". The script
   holds the 4704 floats as base64 (little-endian, phase by phase, 32 taps each). `tests/swresample/bank.mjs`
   computes them by the formula above under Node and prints the base64 and the SHA-256 **of the 4,704 floats as
   18,816 little-endian bytes** (not of the base64 text), which must be
   **`318831365a80e9e689d9f730e975fc5713aeafacb5ead762a9b52a95802f867e`** (computed with the plan review's port
   under Node 22, and again by the second read from this text alone; with that bank the port equals the native
   library). The sign of `s` turning at each tap matters: `sin(x) / x` in its place changes 31 coefficients.
3. **`vendor/swresample/README.md`** and `COPYING.LGPLv2.1` as the table says. `README.md`'s "Files and
   licensing" paragraph and file table gain the folder. `sw.js` is not changed here (W3-11a loads the file).
4. **`tests/swresample/native.c` and `native.mjs`**: a one-off script, not in CI. It compiles a small program
   against the machine's libswresample (`libswresample-dev`; this machine has libswresample 4.12.100, which is
   FFmpeg 6.1.1), drives it with the three calls per packet, and compares with the port sample for sample, for
   each kernel: the library is forced to a kernel with its own `av_force_cpu_flags` before the context is made
   (`0` for `c`; the MMX and SSE flags up to SSE4.2 for `sse`; those and AVX for `avx`; those and AVX2 and
   FMA3 for `fma3`), on the four streams below and on 50 seeded streams of random packet sizes (multiples of
   480 up to 3840, records of 750 and 1500 zeros). It prints the library's version and the CPU's flags. A
   kernel the machine's processor lacks is reported as not confirmed here, not as a failure.
5. **`tests/swresample.verify.mjs`**, in `pnpm test`.

## The reference (the native library, 4.12.100 on x86-64, forced to each kernel, driven as Steam drives it)

Samples are drawn with `mulberry32(seed)` as in `audio.js`: a sample is `floor(draw() x 65536) - 32768`. A
negative size is a record of that many zeros (no draw). The hash is SHA-256 of all the output as 16-bit
little-endian. The counts are the same for every kernel.

| Stream | Seed | Packets in | Samples out per packet |
| --- | --- | --- | --- |
| A | 1 | 3840 1440 1440 480 960 1920 1440 -1500 -1500 -1500 -1500 -1500 3840 1440 480 | 7056 2646 2646 882 1764 3528 2646 2757 2756 2756 2756 2757 7056 2646 882 |
| B | 2 | -1500 3840 1440 480 -750 -750 1440 | 2757 7056 2646 882 1378 1378 2646 |
| C | 3 | 480 480 960 1440 -1500 1440 | 882 882 1764 2646 2757 2646 |
| D | 4, but a sample is -32768 if `draw() < 0.5`, else 32767 | 3840 1440 1440 480 -1500 1440 | 7056 2646 2646 882 2757 2646 |

| Kernel | A | B | C | D |
| --- | --- | --- | --- | --- |
| `fma3` | `69e8e07f7477e544b8270e0cb46a3a5d2174f2e69cf672dd7f7966ded3770fd2` | `e04a83224d7fc0b116a77b828b840b05e07c55268a5e624dfc4a11f9a2d79790` | `1e5a3be7b8952575439ef9517d6744cd6d512414c81790f89636522ef024468a` | `508b5f66e70a15a37072dd373d6f86278298d05bfb59b839c93bb7fcfffb292e` |
| `avx` | `5b982fe0b8cf475772a180502203f733fc6f0e4a0c5b3b2cc380f35f0b9f1a34` | `6b19ea47a5c84b0faa615981ca4375cb2f4bf72f66357861ef3a381367a0b77c` | `c4426f77d734e9560530837248cde61948f8c2e9f7e1a8205e11f93268a8b940` | `d367265cf1431adee40f49e87d28446cc376cf8336e02b2da38977f0c23b69da` |
| `sse` | `b60ad3d97bb0724cf0be54fb664dd8f16a61d7035ad5db44ad771176a2858fb8` | `9c495e6c7598168254ddf75f3a8d1248d7eed0349133af3948dfaa80a1ac243b` | `b9aff6a4500cc46601f9d3afc0b2cdf06baa83f918682d25e079b8c5f46f6b17` | `ad2bcf294b4055f636c62a6b62e85e2f231bdab0f17ed9ea93da12cc183fede9` |
| `c` | `e1289e6e0f9e7c64a4156b5a35a94bd7b6bebad4696c8edb19a419f0ad99b0b7` | `4ccb02e9e2110662c0e0285c5ba40f5ba4d05f5ae885f226704fbf541b5d4b70` | `f2bf8bc05718ee3e86351b7bbb8f214ce190a915ba8c68fffb4b6d255d5ed3fa` | `8fde33cb6e7a7e07f16ab9b3728a1115f22e6bc2718b824254aa8cc7c0366d31` |

All sixteen were produced natively on this machine (its processor has SSE4.2, AVX, AVX2 and FMA) and each was
met by a float port in that kernel's order with no sample different (the plan review's port for `fma3`, `avx`
and `c`; the planner added `sse` to it). Under `fma3`, stream A's first 12 output samples are 8327, -10860,
-32768, -20761, 11737, 28819, 32767, 32767, 18040, -10327, -17743, 6650, and 6833 of stream D's 18633 samples
are at a 16-bit limit.

Where the sound lands: with a first packet of 3840 zeros but one sample of 16384 at input 100, the output's
largest sample is at 184 (the peak is at 183.75): no delay. With the sample at input 3835, at 7047: no delay to
the packet's end. With the sample at input 4000, in the second packet, at 7379, which is input 4016: 16 input
samples late.

## Checks

### The builder runs

- `node tests/swresample.verify.mjs`, each check failing when its line is broken (say how; at least: the
  fused step replaced by multiply then add under `fma3`; 8 sums made 4; the horizontal sums in another order;
  the output rounded half up; the start not mirrored; the flush done on every packet; the flush never done;
  one bank coefficient changed by one unit in its last place):
  - the sixteen hashes, the counts, and stream A's first 12 samples under `fma3`;
  - the bank's hash, and that `bank.mjs` gives the stored base64 (under Node, which is what CI runs);
  - the three largest-sample positions above;
  - phase 0 passes its input: for stream A, output `147 m` equals input `80 m` for every `m` before the first
    packet's end;
  - a constant input of 12345 comes out within 1 of 12345 everywhere;
  - the response on sines of 1, 10.5, 11, 11.5 and 11.75 kHz at -6 dBFS, measured over the middle of 1 s,
    within 0.1 dB of 0, -0.11, -0.71, -2.43 and -3.95 dB (the review's figures from the bank; no sine at 12 kHz:
    it is the input's Nyquist frequency and its level depends on its phase); an 11.5 kHz sine leaves an image
    at 12.5 kHz 12.2 dB under the input's level, within 0.5 dB;
  - the four kernels differ from one another on stream A in at least 1 and fewer than 200 samples, each by 1
    (the plan's runs: 15 to 40). That holds for full-scale input only: at -24 dBFS the kernels can agree on
    every sample, so no check may ask for a difference on a quiet signal;
  - `reset()` gives a stream that repeats stream A exactly; the internal buffer stays under 4,096 samples over
    10 minutes of packets;
- `node tests/swresample/native.mjs` on the build machine: the port equals the library under each kernel on the
  four streams and the 50 random ones. **If the native program does not give the sixteen hashes above, stop
  and say so before touching the port.**
- `pnpm test` and CI pass on the pushed branch.

### The orchestrator runs privately

- **Counts, from Set G's logs** (a scratch script of the orchestrator's): each session's packet sizes, turned
  back to 24 kHz sample counts, through `packet()` in order, a new stream at each session mark: the counts
  equal the log's for every packet, the 2756 and 2757 of the silence records in their order included.
  Expected: all 2,375. A mismatch at a session's first packets only is reported, not a failure (the log does
  not say where a decoder was made).
- Which kernel Steam runs is not checked here: see W3-14. Until it is, the README and finding 29 say "`fma3`,
  not confirmed on Steam".

## How it meets the channel and W3-02c

W3-02a's channel takes a packet of samples and never asks where they came from; its fixture replay feeds it
the logged counts. W3-11a calls `packet()` once per message of the sender, a silence record as zeros, and
W3-02c gives each result to the timeline as it is. So the channel's counts are the game's by construction. A
demo's packets (W3-02g) go the same way.

## Files

May add: `vendor/swresample/` (`swresample.js`, `README.md`, `COPYING.LGPLv2.1`), `tests/swresample/`
(`native.c`, `native.mjs`, `bank.mjs`), `tests/swresample.verify.mjs`. May touch:
`package.json` (the `test` script), `README.md` (the licensing paragraph and file table only: **W3-12b edits
the same paragraph and table, so whichever of the two merges second merges main in first and keeps both
changes; the orchestrator does not start W3-12b's README edit while this order is in review**). Nothing else.

## Stop and ask

- If the port cannot be made equal to the library under some kernel: give the kernel, the first differing
  sample and the packet it is in. Do not adjust the reference.
- If `bank.mjs` under the build machine's Node does not give the bank's hash: say which coefficients differ
  from a bank read out of the native library (an impulse through each phase shows it).
- If the owner's answer on the licence is not in the brief when the build is done: push the branch and report;
  the orchestrator holds the merge.
