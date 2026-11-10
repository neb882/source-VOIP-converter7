# W3-13: the receiver's 24000 to 44100 Hz step, as Steam's decoder does it

**Depends on:** W3-09's report (`docs/reports/W3-09-steam-voice.md`, section 4). Nothing else: it adds new files
only, so it can start now and run beside any order. **Before W3-11**, which wires it in. **Kind:** code.
`tf-builder` (effort high), then `tf-reviewer`. **Branch:** `claude/w3-13-steam-resampler`, from `main`.
**Worktree:** given in the brief. **Time budget:** 1 day.

## Why

Steam's decoder hands each packet's 24 kHz samples to FFmpeg's libswresample at its default settings and gives
the game what comes back (W3-09, read, and reproduced with the public library). The app stands in for it with
its own windowed sinc over the whole signal. That differs in three ways a recording can show: the response
above 10.5 kHz (-4 dB at 11.75 kHz, -6 dB at 12 kHz) and the images it leaves from 12 to 13.5 kHz; the sample
counts per packet, which the receiver's queue is built from (7056 for 3840, 2646 for 1440, 882 for 480, and
2757 or 2756 for a silence record of 1500); and what happens at a speaker's first packet.

## The decision: a port of the 16-bit path, kept as a library of its own

Two ways were weighed.

- **The library itself, built to WebAssembly.** Exact by construction. But libswresample cannot be built
  without a large part of libavutil (options, logging, channel layouts, expression parsing), a generated
  `config.h`, and a C library far larger than the small one the other bundled builds share. And one line of its
  buffering depends on the processor it is built for (it holds back 7 samples on x86 only), so a WebAssembly
  build is not the build Steam runs either. It would be the largest and least certain build in the repository.
- **A port of the 16-bit path to JavaScript**, about 300 lines: the filter bank, the inner loop, the buffering,
  the mirrored start and the flush. Everything in that path is integer arithmetic once the bank is built, so a
  port can be exact, and a test can say whether it is.

**Recommended and ordered here: the port**, proved against a native build of the public library on x86-64 (the
processor Steam's client runs on). The public source of that path is the same in the release Valve ships (8.1.2)
and the one this machine's distribution has (6.1.1): the planner compared `libswresample/resample.c`,
`resample_template.c` and the buffering in `swresample.c` at the tags `n6.1.1` and `n8.1.2`; they differ only
in the linear-interpolation path, which is not used.

**The licence.** libswresample is under the GNU LGPL, version 2.1 or later (when FFmpeg is configured without
its GPL parts, which the resampler does not need). A port is a translation of that source, so the port is under
the same licence, whatever the rest of the repository is. The project already ships an LGPL library this way:
LAME (`vendor/lame/`, README's "Files and licensing"). What it requires of a static site, and what this order
does about each:

| The licence asks | Here |
| --- | --- |
| The library stays a library of its own, and its users can change or replace it | one file, `vendor/swresample/resample16.mjs`, with a small documented interface; the app only calls it |
| Its licence text ships with it, and the page says it is used | `vendor/swresample/COPYING.LGPLv2.1`; README's "Files and licensing" |
| A changed version says that it was changed, by whom and when | the file's header and the folder's README: which FFmpeg files and release it was translated from, the date, that it is a translation of the 16-bit mono path only |
| The source is available | it is the file itself; the README names the upstream files and tag |

The app's own code stays MIT: it uses the library, it does not contain it. **This is the owner's to confirm**
(the repository is public under the owner's name; this time the LGPL file is in the default render's path, not
an optional download as LAME is). If the owner would rather ship only an unmodified library, the alternative is
the WebAssembly build, as its own order; the checks below serve either.

## What to build

1. **`vendor/swresample/resample16.mjs`**, translated from FFmpeg `n8.1.2` (`https://ffmpeg.org/releases/` or
   `https://code.ffmpeg.org/FFmpeg/FFmpeg`, both reachable from the build machine; record the tarball's SHA-256
   in the README): `createResampler({ inRate: 24000, outRate: 44100 })` returns `{ packet(int16) -> Int16Array,
   reset() }`. The public source is the authority; this is the behaviour to arrive at:
   - **The bank:** 147 phases of 32 taps (filter size 32; phase count 147 because 44100/24000 reduces to 147/80
     and the exact-ratio option is on; cut-off factor 1.0 since the output rate is higher; Kaiser window, beta
     9). Coefficients are computed in doubles, normalised so phase 0 sums to 1, scaled by 32768, converted to
     32-bit float and rounded to the nearest integer, ties to even, clipped to 16 bits; phases above the middle
     are mirrors of those below, as the source builds them.
   - **An output sample** is `clip16((16384 + sum of 32 products of sample and coefficient) >> 15)` with an
     arithmetic shift. Output `k` reads the 32 input samples from `floor(80 k / 147) - 15` and uses phase
     `80 k mod 147`.
   - **The start:** the samples before a stream's first are its first 32 mirrored about sample 0
     (`x[-n] = x[n]`), so the first output is on the first input, with no delay.
   - **`packet(pcm)`** does what Steam does with three calls: it asks for the upper bound, converts, and, as
     the bound is always higher than what came, converts again with no input. The first time in a stream's life
     that second call **flushes**: half the filter, 16 samples, is added after the last sample as its mirror
     (`x[N + j] = x[N - 1 - j]`), so the first packet comes out whole. The 16 added samples stay in the stream.
     From then on a packet of n samples gives all the output its samples support, and the counts are those of
     the reference below.
   - `reset()` is a new stream (a new speaker, or voice reset).
2. **`vendor/swresample/README.md`** and `COPYING.LGPLv2.1` (the licence's text as FFmpeg ships it), as the
   table above says. `README.md`'s "Files and licensing" paragraph and file table gain the folder. `sw.js` is
   **not** changed here (nothing loads the file until W3-11).
3. **`tests/swresample/native.c` and `native.mjs`**, as `tests/speex/native.mjs` is for Speex: a one-off script
   that compiles a small program against the machine's libswresample (`libswresample-dev`; this machine has
   6.1.1), drives it with the three calls per packet, and compares its output with the port's sample for sample
   on the streams below and on 50 seeded streams of random packet sizes (multiples of 480 up to 3840, and
   records of 750 and 1500 zeros). It prints the library's version. It is not in CI (the runner may not have
   the library); its recorded hashes are.
4. **`tests/swresample.verify.mjs`**, in `pnpm test`.

## The reference (from the public library, 6.1.1 on x86-64, driven as Steam drives it)

Samples are drawn with `mulberry32(seed)` as in `audio.js`: a sample is `floor(draw() x 65536) - 32768`. A
negative size is a record of that many zeros (no draw). The hash is SHA-256 of all the output as 16-bit
little-endian.

| Stream | Seed | Packets in | Samples out per packet | SHA-256 |
| --- | --- | --- | --- | --- |
| A | 1 | 3840 1440 1440 480 960 1920 1440 -1500 -1500 -1500 -1500 -1500 3840 1440 480 | 7056 2646 2646 882 1764 3528 2646 2757 2756 2756 2756 2757 7056 2646 882 | `69e8e07f7477e544b8270e0cb46a3a5d2174f2e69cf672dd7f7966ded3770fd2` |
| B | 2 | -1500 3840 1440 480 -750 -750 1440 | 2757 7056 2646 882 1378 1378 2646 | `e04a83224d7fc0b116a77b828b840b05e07c55268a5e624dfc4a11f9a2d79790` |
| C | 3 | 480 480 960 1440 -1500 1440 | 882 882 1764 2646 2757 2646 | `1e5a3be7b8952575439ef9517d6744cd6d512414c81790f89636522ef024468a` |
| D | 4, but a sample is -32768 if `draw() < 0.5`, else 32767 | 3840 1440 1440 480 -1500 1440 | 7056 2646 2646 882 2757 2646 | `508b5f66e70a15a37072dd373d6f86278298d05bfb59b839c93bb7fcfffb292e` |

Stream A's first 12 output samples are 8327, -10860, -32768, -20761, 11737, 28819, 32767, 32767, 18040, -10327,
-17743, 6650. In stream D, 6833 of the 18633 output samples are at a 16-bit limit.

Where the sound lands (the same library): with a first packet of 3840 zeros but one sample of 16384 at input
100, the output's peak is at 183.75 (samples 183 and 184): no delay. With the sample at input 3835, at 7046.8:
no delay to the packet's end. With the sample at input 4000, in the second packet, the peak is at 7379.4, which
is input 4016: **after a stream's first packet everything is 16 input samples (0.67 ms) late, and those 16
samples are the first packet's last 16, played backwards.** (W3-09's text says "8 input samples ahead"; the
library says this. See `docs/reports/W3-11-plan.md`, "Open".)

## Checks

### The builder runs

- `node tests/swresample.verify.mjs`, each check failing when its line is broken (say how; at least: a
  coefficient rounded half up, the 16384 left out, the start not mirrored, the flush done on every packet, the
  flush never done):
  - the four streams' counts and hashes, and stream A's first 12 samples;
  - the three peaks above, to the sample;
  - a constant input of 12345 comes out within 1 of 12345 everywhere (the start and the flush are mirrors);
  - the response on sines of 1, 10.5, 11, 11.5, 11.75 and 12 kHz, measured over the middle of 1 s, within
    0.15 dB of 0, -0.1, -0.7, -2.4, -4.0 and -6.0 dB; an 11.5 kHz sine leaves an image at 12.5 kHz 8 to 14 dB
    under the input's level (W3-09 gives 12 dB; record the figure in the report);
  - `reset()` gives a stream that repeats stream A exactly;
  - no allocation grows with the stream (10 minutes of packets keep the internal buffer under 4,096 samples).
- `node tests/swresample/native.mjs` on the build machine: the port equals the library on the four streams and
  the 50 random ones, and the report says the library's version. **If the machine's library is not 6.1.1 or
  the hashes above do not come out of the native program, stop and say so before touching the port.**
- `pnpm test` and CI pass on the pushed branch.

### The orchestrator runs privately

Set G's logs give the decoded samples of every packet. With a scratch script of the orchestrator's: each
session's packet sizes, turned back to 24 kHz frame counts, through `packet()` in order (a new stream at each
session mark): the counts equal the log's for every packet, the 2756 and 2757 of the silence records in their
order included. Expected: all 2,375. A mismatch at a session's first packet only is reported, not a failure
(the log does not say where a decoder was made).

## How it meets the channel and W3-02c

W3-02a's channel takes a packet of samples and never asks where they came from; its fixture replay feeds it the
logged counts. W3-11 calls `packet()` once per message of the sender, a silence record as zeros, and W3-02c
gives each result to the timeline as it is. So the channel's counts are the game's by construction, and the
"one sample fewer" of the channel applies to the right number. A demo's packets (W3-02g) go the same way.

## Files

May add: `vendor/swresample/` (`resample16.mjs`, `README.md`, `COPYING.LGPLv2.1`), `tests/swresample/`
(`native.c`, `native.mjs`), `tests/swresample.verify.mjs`. May touch: `package.json` (the `test` script),
`README.md` (the licensing paragraph and file table only). Nothing else.

## Stop and ask

- If the port cannot be made equal to the library on some stream: give the first differing sample and the
  packet it is in. Do not adjust the reference.
- If a coefficient of the bank computed in JavaScript differs from the library's (the sine and the Bessel
  function in doubles): then, and only then, the bank may be stored as a table made by `native.c` from a build
  of the public source; say which coefficients differed.
- If the owner's answer on the licence is not in the brief when the build is done: push the branch and report;
  the orchestrator holds the merge.
