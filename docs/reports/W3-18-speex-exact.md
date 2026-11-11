# W3-18: Speex 1.0.2 with the arithmetic of the game's module

The builder's report. The order is `docs/work-orders/W3-18-speex-exact.md`. Branch `claude/w3-18-speex-exact`, from
`82e2239` (main with W3-17c, cache v28).

**Status:** built. The seven clips give the game module's packets and 16-bit output in 147 of 147 frames; `vsx_cosf`
and `vsx_acosf` give the module's result on every argument of the vectors (21,389 and 22,155); the five runs' 16-bit
output has the order's five SHA-256 values with the packets unchanged; native and WebAssembly agree bit for bit; each
of the 11 changes that can alter output, left out, fails at least one clip. Two builds of the module gave the same
bytes. `pnpm test:all` and CI: see "Runs". The routines passed every vector on the first build from the
specification, so no stop-and-report point was reached.

## What was built

| File | What |
|---|---|
| `tests/speex102/patch.mjs` | the 25 changes of the input's `mkpatch.py` as a JS list of named replacements `[name, file, old, new, count]` (29 entries, 25 names), carried over mechanically from the Python (a script read its `sub()` calls and wrote the list, so the texts are the same). `patchLibspeex(checkout, out, without)` copies `libspeex/`, puts `#include "vsx.h"` at the top of the seven files and `vsx.h` beside them, and applies each change, stopping if its old text does not occur exactly `count` times (the Python's `str.replace` replaces every occurrence; so does this). An unknown name in `without` stops it. `OUTPUT_CHANGES` lists the 11 that can alter output, `UNSEEN_CHANGES` the other 14 |
| `tests/speex102/vsx.h` | the input's, unchanged: the eight-at-a-time sum and the seven prototypes |
| `tests/speex102/vsx_math.c` | `vsx_cosf` and `vsx_acosf` written from `SPEC-cosf-acosf.md`, step by step in the specification's order; `vsx_expf`, `vsx_logf`, `vsx_exp`, `vsx_log`, `vsx_cos` from the C library's double functions (musl's in the WebAssembly build, glibc's natively), each with a comment saying why that is enough (the order's measured margins) |
| `tests/speex102/gen-tables.mjs`, `vsx_tables.h` | the generator of the two routines' constants and tables, and its output (committed; the test regenerates it and compares) |
| `tests/speex102/SPEC-cosf-acosf.md` | the input's specification, unchanged, so that the routines' source is in the repository |
| `tests/speex102/vectors/` | the input's vectors, unchanged (seven clips; the `cosf` and `acosf` argument and result files; `SHA256SUMS`, which `sha256sum -c` passes) |
| `tests/speex102/build.mjs` | applies the patch (`patchedSources`), compiles `vsx_math.c` too, exports `vsx_cosf` and `vsx_acosf`; `--without=a,b` builds a mutated module into the system temp folder instead of `vendor/` |
| `tests/speex102/native.mjs`, `native.c` | the native twin builds the same patched sources; besides the five-run comparison it scores the native build against the seven clips and the two vector files; `--without` and `--mutations` (the mutation table below). `native.c` takes `cosf` or `acosf` as an argument to run the routine on floats from stdin. It exports `loadClips`, `scoreClip` and `loadVectors` for the test |
| `vendor/speex-1.0.2/speex-1.0.2.wasm.mjs` | rebuilt; `index.mjs` gains `mathFunctions()` ({ cosf, acosf }, for the tests); its other exports are as they were |
| `tests/speex102.verify.mjs` | 13 new checks (below), the native hashes replaced, one reset check added; 85 checks |
| `tests/vendor-opus.mjs` | the module's new hash |
| `tests/render-stream.verify.mjs` | four Speex cases re-recorded (below), in a commit of their own |
| `sw.js` | `CACHE` v28 to v29 |
| docs | `vendor/speex-1.0.2/README.md`, `tests/LEGACY_CODECS.md`, `tests/REFERENCE_2026.md`, `docs/reports/W3-09-steam-voice.md` section 5 (one paragraph) |

`api.c`, the flags (`-O2 -ffp-contract=off`, no fast-math; natively also `-msse2 -mfpmath=sse`), the musl list and
the define are unchanged. The math file needed nothing new from musl: `exp`, `log` and `cos` were in the list already,
`acos` stays because `sb_celp.c` (the wideband code, linked because the narrowband decoder refers to it) still calls it,
and the float square root and absolute value are WebAssembly instructions.

## The two routines

`vsx_cosf` and `vsx_acosf` follow sections 1 and 2 of the specification, one IEEE operation per written operation,
float where it says float and double where it says double. Details of how it is said in C:

- `cosf` step 2 (round `x K` to an integer, ties to even) is `(k + 0x1.8p23f) - 0x1.8p23f` in float, exact for
  |k| < 2^22 (here |k| <= 83,443), so no library rounding function is needed in either build.
- "With its k lowest bits cleared", the group of a float and the group's midpoint are bit operations on the float's
  pattern (section 2.3's own form: the pattern of 1/16 is `0x3d800000`).
- The square roots are `__builtin_sqrtf` (`sqrtss` natively, `f32.sqrt` in WebAssembly), correctly rounded.
- Outside the ranges the specification covers (`cosf` at |x| >= 8192, `acosf` beyond [-1, 1], NaN, infinities):
  `cosf` gives the double cosine rounded and a NaN for a NaN or infinity; `acosf` a NaN. Speex never gets there, and
  no test claims them.

Both passed every vector on their first native build: `cosf` 21,389 of 21,389 and `acosf` 22,155 of 22,155, natively
(gcc 13.3, SSE2) and in the WebAssembly module (through `mathFunctions()`). One name clashed in the first compile:
the specification's constant `H` as `VSX_H` is `vsx.h`'s include guard, so the two constants are `VSX_HPI` and
`VSX_LPI` in the header.

The test checks them in the WebAssembly module (exported from it), so CI needs no compiler; `native.mjs` checks them
natively as well.

## How the tables are generated

`node tests/speex102/gen-tables.mjs` writes `vsx_tables.h`; `--check` says whether the committed header is what it
makes, and the test does the same comparison. It needs nothing but Node: every value is a real number worked out in
fixed point with 320 fractional bits in JavaScript's BigInt, then rounded.

- pi: Machin's formula, 16 atan(1/5) - 4 atan(1/239), each arctangent as its series.
- sin(j pi/32), cos(j pi/32): Taylor series.
- asin(c_J): Newton's method on sin(y) = c_J (six steps from the double `Math.asin`, far more than the 320 bits need).
- sqrt(1 - c_J^2) and sqrt(3)/2: integer square roots of exact fixed-point values (c_J is a float, so 1 - c_J^2 is
  exact).
- Rounding to a float, a double, or 39 or 22 significant bits: to nearest, ties to even, and the generator stops if a
  value lies within 2^-280 of a halfway point (none does), so a wrong last bit cannot pass unseen.
- The four exact zeros of the sine and cosine tables and the four entries of value 1 or -1 are set as the
  specification says.

Then it checks its results against every check value the specification prints: the 14 constants' hexadecimal forms,
the five tables' SHA-256 values, `SIN[1]`, `COS[1]` and group 100's three values. All matched on the first run. It takes
about 0.1 s. Since no multi-precision library is used, the order's fallback (commit the header and check its hash) is
not needed in that form: the header is committed for the C builds, and the test regenerates it and compares the text.

## The checks (`tests/speex102.verify.mjs`)

New, in the first block:

- each of the seven clips: every packet and every 16-bit sample equal the game module's (7 checks), and the total, 147 of
  147 frames. A new codec per clip; each frame encoded and its packet decoded by the same codec, as the module does
  (the input's `verify-vectors.mjs` does the same and also reports 147 of 147);
- `vsx_cosf` on all 21,389 and `vsx_acosf` on all 22,155 vector arguments, bit patterns equal (2 checks);
- `vsx_tables.h` is what `gen-tables.mjs` computes;
- `patch.mjs` names 25 changes, 11 that can alter output and the 14 that cannot be shown by it, by name. The comment
  above it lists both groups and says the 14 cannot be shown by output, so no test can fail without them;
- a zero frame on a new codec gives the packet `1e9d66000039ce70001ce738000e739c000739ce` and silence (a fact of the
  investigation; it also held before).

Changed: the native hashes are re-recorded (below). Added in "Reset and delay": after `reset()` the decoder's frames
equal a new decoder's in 136 of 138 (the investigation's count for the module; this build gives the same).

### The five runs

`node tests/speex102/native.mjs`, native and WebAssembly identical on all five:

| Run | Frames | Packets (unchanged) | 16-bit output (the order's value) |
|---|---|---|---|
| speech | 276 | `6892b043…` | `40230d9926f322c0f3346380c1d14f0d374be62bf10c17423863565c018b610f` |
| square | 100 | `5133a813…` | `dbf8c3b788f6371b4d2a6729027d161ff3f87abaf88a32925c32b906444cbf7a` |
| silence | 40 | `d584f088…` | `59ec91dcb7dc65b5f928091cb0e25c26729a0a4453ebe7d8244fc1ceae7d9712` (as before) |
| noise | 100 | `c06f01fb…` | `10c44c6dec1c439b60b4e4bf49db8c67dd60ea6e1eb16d23838398bf3c7c0e10` |
| speechReset | 276 | `c105432d…` | `394dcb7bac8013fb835a5e7b85c5c73b8da639e577400744e0e1407c90ca1b31` |

The decoded floats' hashes are new for four runs (speech `ad1a373b…`, square `f6d20081…`, noise `30226419…`,
speechReset `6e9b2588…`; silence's `c6520676…` is unchanged); the full values are in the test.

## Mutation table

`node tests/speex102/native.mjs --mutations` (native), and the same with WebAssembly builds made with `build.mjs
--without=<name>` scored by the input's `verify-vectors.mjs`, which agreed clip for clip. Frames differing (native):

| Change left out | Clips that fail |
|---|---|
| 1 wld-odd | clip-cb-energy (6 of 11 frames, from frame 5) |
| 2 wld-error | clip-cb-energy (6 of 11, from 5) |
| 3 autocorr | clip-autocorr (6 of 9, from 3), clip-cb-err (22 of 46, from 24), clip-interp-whole (6 of 11, from 5), clip-olp-energy0 (5 of 16, from 11) |
| 4 interp-whole | clip-interp-whole (6 of 11, from 5) |
| 5 acosf | clip-acosf (6 of 8, from 2) |
| 6 cosf | clip-cosf (2 of 46, from 39; packets equal, 2 samples differ: the decoder's call) |
| 12 k3 | clip-cb-energy (1 of 11), clip-cb-err (2 of 46), clip-cosf (1 of 46), clip-interp-whole (1 of 11); samples only |
| 15 olp-energy0 | clip-olp-energy0 (6 of 16, from 10) |
| 19 cb-energy | clip-cb-energy (6 of 11, from 5) |
| 20 cb-err | clip-cb-err (6 of 46, from 40) |
| 23 comb-energy | clip-cb-err (4 of 46), clip-cosf (1 of 46), clip-interp-whole (1 of 11); samples only |

11 of 11 fail at least one clip, and the test file's clip check is the one that fails (shown once by putting the
`--without=cosf` module in `vendor/` and running the suite: `clip-cosf … (44 of 46 frames, first differs at 39)`).
The other 14 (rows 7 to 11, 13, 14, 16 to 18, 21, 22, 24, 25) cannot be shown by output, as the order says; they are
listed in the test file with that statement.

## What moved elsewhere

Every recorded hash that moved, by case:

| Where | Case | Hash |
|---|---|---|
| `tests/vendor-opus.mjs` | `speex-1.0.2.wasm.mjs` | `e585e8d9…` to `65dd8bcb81988f21e12d814b45c8860764fa20838168f46644b192b3f6c491b1` |
| `tests/speex102.verify.mjs` | speech, square, noise, speechReset | floats and 16-bit output (table above); packets unchanged |
| `tests/speex102.verify.mjs` | silence | none moved |
| `tests/render-stream.verify.mjs`, GOLDEN (WAV) | `speex` | `171b8916…` to `7e751d8d…` |
| | `speex, gate on, loss 15%, jitter 300 ms` | `db12e9c7…` to `d2af002b…` |
| | `speex, source at 11.025 kHz` | `00eaeb6b…` to `c181c034…` |
| | `speex, source at 8 kHz` | `88f92e8b…` to `7d95f8a9…` |
| `tests/render-stream.verify.mjs`, GAIN_GOLDEN | `speex` | `e53997b9…` to `a6d43597…` |
| | `speex, gate on, loss 15%, jitter 300 ms` | `52b05aa5…` to `23843070…` |
| | `speex, source at 11.025 kHz` | `c6c57017…` to `67054b85…` |
| | `speex, source at 8 kHz` | `50d2def8…` to `84308684…` |

Not moved: the four cases' codecInfo hashes (same frames, same counts, wrapped samples included), both hashes of
`speex, 100 samples at 96 kHz`, and every hash of every case that does not run Speex. How this was established: the
whole `pnpm test` was run on the new module before any hash was changed; `render-stream.verify.mjs` failed exactly
those eight checks (492 passed, 8 failed) and every other suite passed. The new values are those `--hashes` printed,
written in a commit of their own that says why (GAIN_GOLDEN's rule; the codec is before the mix point). No other
suite pins Speex output by hash: `verify.js`, `reference.verify.mjs`, `output-stage.verify.mjs` and the browser suite
check Speex by behaviour and passed unchanged. Counts that held: 2,106 and 2,122 wrapped samples on part a's
speech-like signal, 6,953 wrapped (6,956 past full scale) on the square wave, the 80-sample delay.

The page's words did not change.

## Sizes and reproducibility

- WebAssembly: **140,741 bytes** (was 133,735); `speex-1.0.2.wasm.mjs` 188,014 bytes (was 178,594), SHA-256
  `65dd8bcb81988f21e12d814b45c8860764fa20838168f46644b192b3f6c491b1`, the WebAssembly inside it
  `b3acd8769318bb23d62f06b9ee6eec248fdf7e9bef8cf507a1d53b4fd89728f8`. 56 sources (was 55: the math file). No imports;
  no paths in the module.
- Native twin (gcc 13.3, x86-64, `-O2`): 120,032 bytes linked, 108,712 stripped (text 89,829, data 13,120).
- Reproducible: built from local clones, then from fresh clones made by the script; the same bytes (`cmp`). Both clones
  came from the network at the pinned commits; no earlier checkout was used.

## What is not claimed

- Other engine qualities than 3 (Speex quality 4): not checked; only quality 3 is claimed exact.
- The `rand()` paths: a sub-mode 0 frame and a lost frame draw noise from the C runtime's `rand()` of the game's thread;
  the app never decodes a lost frame (it plays zeros) and quality 4 never codes sub-mode 0.
- A packet the decoder refuses: the module gives 160 samples for 20 bytes of `0xff` and leaves the decoder as it was;
  this build's `decode` throws (`Speex decode failed (error -2)`). The app only decodes its own packets.
- A processor without SSE2: not looked at. No dependence on the listener's processor was found in the investigation.
- `cosf` at |x| >= 8192 and `acosf` outside [-1, 1]: not specified, not used.
- Set M on this build: the order leaves it to the orchestrator's private run (`REFERENCE_2026.md` marks it so). Set M's
  recordings are not in this repository and I did not have them.

## What I read differently from the order

- **Set M's paragraph did not exist in `tests/REFERENCE_2026.md`** at `82e2239` (Set M is only in PROGRESS). I wrote one
  as a provenance subsection after Set J, from PROGRESS's `speex_module` text and the order: the method, the 92,967 of
  145,920 before, the investigation in two lines, and the exact counts marked as the orchestrator's private run on the
  investigation's prototype, to be repeated on the merged build. I also corrected the bullet "Speex cannot be recorded"
  (dated correction, original kept), the Results table row and the "Engine codecs" line in "What remains unverified".
  The orchestrator should check that paragraph's wording against the private notes.
- **The tables need no multi-precision library**, so instead of a hash of the header the test regenerates the header
  and compares it (stronger, and CI needs nothing).
- **The vectors are tested in the WebAssembly module**, through two extra linker exports and `mathFunctions()` in
  `index.mjs`; that adds one named export to `index.mjs` and none to `api.c`.
- **A clip "passes"** when, for every frame, the 20-byte packet and the 160 16-bit samples (the decoded floats through
  the module's truncation) equal the module's. The decoded floats are not in the vectors and are not compared.
- **`SPEC-cosf-acosf.md` is committed** (in `tests/speex102/`), since the routines are written from it; `mkpatch.py`
  is not (its content is `patch.mjs`), nor `verify-vectors.mjs` or `vsx_math_cr.c` (the stand-in; nothing builds it).
- The two cosine changes in `mkpatch.py` count 2 and 2 occurrences (four calls); the order's table says "3 places in
  `nb_encode`, 1 in `nb_decode`". The counts are the source's, and the patch asserts them.

## Runs

- `pnpm test` before the re-recording (each suite in turn, under the heavy lock): every suite exit 0 but
  `render-stream.verify.mjs`, which failed the eight Speex checks above and no other.
- After: `render-stream.verify.mjs` 500 passed, 0 failed; `speex102.verify.mjs` 85 passed.
- `pnpm test:all` under the heavy lock (with `CHROMIUM_EXECUTABLE`), on `e1f0066` (the code as pushed; only
  documents changed after): exit 0 in 704 s. The vendor check's three lines; `214 passed, 0 failed`, `69 gain checks`,
  `147 Opus checks`, `85 Speex 1.0.2 and speex profile checks`, `42 paired-reference`, `68 passed, 0 failed`, `53
  file-rate`, `50 passed, 0 failed`, `46 video`, `36 demo`, `500 render-stream checks passed, 0 failed`, `102
  output-stage`, `129 voice channel`, `109 steam sender`, `43 swresample`, `216 room`, `246 browser checks passed`.
- `node tests/speex102/native.mjs`: "The WebAssembly module matches the native build bit for bit."; clips 147 of 147;
  vectors all equal. `--mutations`: "11 of 11 changes left out fail at least one clip."
- `node tests/speex102/gen-tables.mjs --check`: "vsx_tables.h is what the generator makes."
- `pnpm test:vendor`: "Speex 1.0.2 build matches its recorded hash."
- CI: run 42975039742 on `282bee5` (the code and the documents but for this section): success. The run on this
  report's commit is in the hand-back.
