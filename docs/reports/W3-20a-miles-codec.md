# W3-20a: the Miles voice codec (Voxware VR12) as a module, with the game's wrapper

Report of the order `docs/work-orders/W3-20a-miles-codec.md`, branch `claude/w3-20a-miles-codec`.

## What was built

- **`vendor/voxware-vr12/`**: `vr12.c`, `vr12.h`, `vr12_tables.h` and `LICENSE` from coffeegrind123/voxware-vr12 at
  `eedf465fd0de65ae28fcc11e2457e7ee01decc22`, byte for byte as given (SHA-256 checked by the suite); a README of ours
  (provenance, the three rulings, the wrapper, the build, what the tests show, the label); the built module
  `voxware-vr12.wasm.mjs`; `index.mjs`; and `COPYRIGHT.musl`, since musl's math is compiled into the module (as the
  Speex, CELT and libopus folders carry it).
- **The wrapper** in C, `tests/vr12/api.c`, compiled into both the module and the native twin so that the comparison
  covers it: `vm_create` (encoder, decoder, one block of 360 zeros through the encoder, its 12 bytes thrown away),
  `vm_encode` (the 8-bit cut, then two VR12 frames), `vm_decode` (two VR12 frames, samples as they come), `vm_reset`
  (twice: 360 zeros encoded, their 12 bytes decoded; nothing cleared). The plug-in level is the vendored header's own
  `vr12_encoder_create`/`vr12_encode_frame6`/`vr12_create`/`vr12_decode_frame`, exported as they are. Compress and
  Decompress (left-overs, the final flag, whole frames) are `createFramer` in `index.mjs`, as for Speex. No lost-frame
  path is exposed: `decompress` throws without bytes.
- **`tests/vr12/build.mjs`**: clang to wasm32, `-O2 -ffp-contract=off`, no fast-math, plus **`-fno-builtin`**; the
  small C library of `tests/libopus11` and musl 1.2.5's math (cos, sin, acos, pow, log10 and helpers) compiled in; no
  imports. `--mutate`/`--out` build a mutant to a file outside the vendor folder.
- **`tests/vr12/native.mjs`** and **`native.c`**: the native twin. Same sources and flags with gcc 13.3 on x86-64
  (SSE2), with musl's math compiled natively from the same checkout (the x86_64 type headers) and **no system libm
  linked**: `nm -u` on the binary lists no math symbol, so every math call is musl's in both builds. It runs both builds
  over a folder of vectors, compares them bit for bit and scores both.
- **`tests/vr12/vectors/`**: tones, noise and clipped, all five files each, with `SHA256SUMS` (15 files, 1,486,324
  bytes in all). **`tests/vr12.verify.mjs`** in `pnpm test` (so in `test:all` and CI). **`tests/vr12/mutations.mjs`**:
  the mutation run below. The module's hash is in `tests/vendor-opus.mjs` (`pnpm test:vendor`).
- **`sw.js` is unchanged**: the two new vendor files are not in its list and `CACHE` is not bumped, since nothing loads
  the module. The browser suite's check that sw.js lists exactly what the page needs still passes.
- Docs: `tests/LEGACY_CODECS.md` (a `vaudio_miles` section and one sentence in the introduction),
  `tests/REFERENCE_2026.md` (one bullet in finding 31), the vendor README, this report.

Why `-fno-builtin`: without it gcc joins `cos(a)` and `sin(a)` in `vr12.c` (line 146) into a call to the C library's
`sincos` (seen: the object then calls `sincos` and no `sin`), and both compilers may fold a math call with a constant
argument using the build machine's library. Either
would take a call away from musl in one build and not the other. With it, every call is a call.

The build is reproducible: built twice, once against the scratch musl checkout and once from a fresh clone at the
pinned commit, the module came out with the same SHA-256, `06208740325ec9719763a3a6e790a57b1e5b2054d65e9d70fb2a46a4dad2e027`
(the WebAssembly inside: `21fb135230d683f54ab24f577a0b8fbfe2144694cbfd7be7ed2505698f4b3840`, 77,361 bytes; Ubuntu
clang 18.1.3).

## Scores on all eight signals

`node tests/vr12/native.mjs --vectors=<the input folder>`: the WebAssembly build and the native twin, against every
vector in the input folder. Game level: one wrapper codec, started with zeros, reset before frame floor(frames / 2),
each input frame encoded; the game's packets decoded by the same codec. Plug-in level: a new encoder on the full
16-bit input, a new decoder on the plug-in's packets. **The two builds gave identical packets and samples, bit for
bit, at both levels on all eight signals**, so the table is both builds' scores.

| Signal | Game packets (before / after the reset) | Game samples equal (differing before / after) | Plug-in packets | Plug-in samples equal |
|---|---|---|---|---|
| clipped | 100 of 100 / 100 of 100 | 71,966 of 72,000 (20 / 14) | 400 of 400 | 71,963 of 72,000 |
| noise | 77 of 77 / 78 of 78 | 55,796 of 55,800 (1 / 3) | 310 of 310 | 55,799 of 55,800 |
| project test signal, 40 s | 444 of 444 / 444 of 444 | no sound file | 1,776 of 1,776 | no sound file |
| project voice input | 147 of 147 / 147 of 147 | 105,744 of 105,840 (40 / 56) | 586 of 588 (104, 133) | 105,660 of 105,840 |
| silence | 55 of 55 / 56 of 56 | 39,960 of 39,960 | 222 of 222 | 39,960 of 39,960 |
| speechlike-a | 133 of 133 / 133 of 133 | 95,739 of 95,760 (14 / 7) | 532 of 532 | 95,746 of 95,760 |
| speechlike-b | 133 of 133 / 133 of 133 | 95,757 of 95,760 (3 / 0) | 532 of 532 | 95,756 of 95,760 |
| tones | 162 of 162 / 163 of 163 | 116,937 of 117,000 (41 / 22) | 647 of 650 (66, 71, 395) | 116,916 of 117,000 |
| **All** | **2,505 of 2,505** | **581,899 of 582,120** | **5,005 of 5,010** | **581,800 of 582,120** |

- The largest difference anywhere is one step. No game-level packet differs, before or after the reset.
- The five unequal plug-in frames are the input's five, 12, 12 and 17 bits apart in `tones` and 13 and 12 in the voice
  input; the frames after each are equal again.
- Every per-signal figure equals the input's scores for the candidate built natively with gcc and glibc
  (`score.txt`), and so does the first differing sample of each signal at each level. So this build computes what
  that build computed.
- **The 40-second signal.** The input folder has only its packet files. Its input was remade here, in scratch, from
  the project's `tests/testsignal/make_testsignal.py` (numpy 2.4.6, scipy 1.17.1; the WAV's SHA-256 is the one in
  `tests/testsignal/README.md`) and the first 40 s resampled with the resampler of the input's `gensig.py`. The remade
  input has the SHA-256 the input's `summary.json` gives for it (`4ecee4aa…`), and through it the packets at both
  levels equal the game's on every frame. Its decoded samples could not be scored: the plug-in's and the game's sound
  files for it were left out of the input. Both builds decode it identically.

None of the order's three "stop and report" conditions was met: no game-level packet differs, no sample is more than
one step off, the builds do not differ, and the wrapper as described reproduces `.game.v12` from `.s16` on all eight.

## What the suite checks

`node tests/vr12.verify.mjs` (31 checks since the fix round; every check runs and the failures are listed at the end):

1. The four vendored files have their upstream SHA-256; `tests/vr12/vectors/SHA256SUMS` has its recorded hash, lists
   all 15 files, and each file has its listed hash.
2. Per committed signal (tones, noise, clipped): game-level packets equal on every frame, with the frame counts before
   and after the reset as literals; game-level samples within one step, the counts that differ before and after the
   reset as literals (tones 41 + 22, noise 1 + 3, clipped 20 + 14); plug-in packets with the unequal frames as a
   literal (tones 66, 71, 395; the others none); plug-in samples within one step, the count that differs as a literal
   (84, 1, 37); and the SHA-256 of both levels' packets and samples equal to the native build's (recorded from
   `native.mjs`).
3. The wrapper, fact by fact:
   - the frame: 360 samples, 12 bytes, two VR12 frames of 180 and 6, 2133 bit/s at the codec's nominal 8000 Hz;
   - the 8-bit cut: a new codec's packets equal a new plug-in encoder's after one block of zeros on `floor(x / 256) * 256`
     (on the noise signal, which opens at amplitude 30, so the cut takes most samples to 0 or -256: truncation toward
     zero or rounding would differ); other low bytes give the same packets; the uncut samples other packets;
   - the start-up block: one block, not none (codec frames 29 and 30 differ without it on that signal) and not two;
   - decoding: a new codec's decoded samples equal a new plug-in decoder's on the game's tones packets, frame for frame
     (nothing done to them; the start-up block leaves the decoder alone);
   - the reset equals two blocks of zeros through encode and decode done by hand; it is seen (its packets differ from
     no reset, from a new codec, and from one block); and its decoding half is seen (without it the decoded samples
     differ, the packets do not);
   - compress keeps left-overs (pieces of 1, 359, 361, 100, 7, 1000 and 2492 samples give the frame-by-frame bytes,
     nothing until 360 are there, and the kept counts 1, 0, 1, 101, 108, 28, 0); the final flag pads a part frame with
     zeros and codes it (400 samples give 24 bytes, the second frame equal to 40 samples and 320 zeros); 11 bytes
     decompress to nothing and 13 to the 360 samples of the first 12; since the fix round, 0, 24, 25 and 36 bytes in
     turn on a new framer give 0, 720, 720 and 1080 samples, equal to `decode()` frame by frame on a new codec (as many
     whole frames as fit, each from its own 12 bytes, in order); no lost-frame path.

`tests/vendor-opus.mjs --check` checks the module's hash.

## Mutations

`node tests/vr12/mutations.mjs <musl checkout>` builds each mutation of `api.c` (or copies `index.mjs` with the
change) and runs the suite on it through `VR12_INDEX`. Every mutation fails at least one check, and in each case the
check of the fact it breaks:

| Mutation | Fact broken | Checks failing (of 31) | The fact's own check fails |
|---|---|---|---|
| `cut-none` | the codec gets full 16-bit samples | 8: game packets of all three signals, native hashes of all three, both cut checks | the 8-bit cut (both) |
| `cut-round` | rounded to the nearest multiple of 256 | 9: as above, and clipped's game samples | the 8-bit cut (both) |
| `cut-toward-zero` | truncated toward zero, not the high byte | 8: as `cut-none` | the 8-bit cut (both) |
| `startup-none` | no start-up block | 8: game packets ×3, native ×3, cut, start-up | the start-up block |
| `startup-twice` | two blocks | 6: noise and tones game packets and native, cut, start-up | the start-up block |
| `startup-decodes` | the block is also decoded | 7: game samples ×3, native ×3, decoding | decoding (decoder untouched) |
| `reset-none` | reset does nothing | 12: game packets ×3, game samples ×3, native ×3, all three reset checks | the reset (all three) |
| `reset-once` | one block, not two | 11: noise and tones game packets, game samples ×3, native ×3, all three reset checks | the reset (all three) |
| `reset-encoder-only` | no decoding half | 8: game samples ×3, native ×3, reset by hand, reset's decoding half | the reset (two) |
| `reset-clears` | encoder and decoder cleared first | 11: game packets ×3, game samples ×3, native ×3, reset by hand, decoding half | the reset (two) |
| `decoded-changed` | lowest bit of decoded samples cleared | 7: game samples ×3, native ×3, decoding | decoding |
| `halves-swapped` | the two VR12 frames in the other order | 9: game packets ×3, clipped and noise game samples, native ×3, cut | the 8-bit cut, game packets |
| `leftover-dropped` | compress drops left-overs | 1: compress | compress |
| `final-ignored` | final flag ignored | 1: final flag | final flag |
| `final-not-zeros` | part frame padded with stale samples | 1: final flag | final flag |
| `compress-header` | a count byte after the frames | 2: compress, final flag | compress |
| `decompress-part-frame` | a part frame padded and decoded | 2: decompress 11/13, decompress 0/24/25/36 | decompress (both) |
| `decompress-offset-zero` | every frame written at the start of the output (fix round) | 1: decompress 0/24/25/36 | decompress |
| `decompress-first-only` | only the first whole frame decoded (fix round) | 1: decompress 0/24/25/36 | decompress |
| `decompress-first-bytes` | every frame decoded from the first 12 bytes (fix round) | 1: decompress 0/24/25/36 | decompress |
| `lost-frame-path` | decompress without bytes gives silence | 1: no lost-frame path | no lost-frame path |

The plug-in-level checks fail for none of these, as they should: the wrapper is not on that path. The vendored files'
and vectors' hash checks are file checks and fail for none.

## Checks run

- `node tests/vr12.verify.mjs`: 30 passed, 0 failed; 31 passed, 0 failed after the fix round.
- `node tests/vendor-opus.mjs --check`: "VR12 build matches its recorded hash." with the other four.
- `node tests/vr12/native.mjs --vectors=<input folder> <musl checkout>`: "The WebAssembly module matches the native
  build bit for bit on every signal."; the table above. On the committed folder, the same for its three signals.
- `node tests/vr12/mutations.mjs <musl checkout>`: "Every mutation fails at least one check." (18 mutations; 21 after the
  fix round).
- `node tests/vr12/build.mjs` twice (scratch musl, fresh clone): the same hash.
- `pnpm test:all` under the heavy lock (with `CHROMIUM_EXECUTABLE` set): exit 0; the vendor check, the Node suites
  (VR12: "30 passed, 0 failed") and "246 browser checks passed". CI on the pushed head: see the summary handed back
  with this report.

## Fix round (after review)

- **Decompress, whole frames.** The review found three mutations of `index.mjs` that passed all 30 checks (every frame
  written at offset 0; only the first frame decoded; every frame decoded from the first 12 bytes). A check now
  decompresses 0, 24, 25 and 36 bytes in turn on a new framer and compares with `decode()` frame by frame on a new
  codec; the three are in `tests/vr12/mutations.mjs` and each fails it (table above).
- **Wording.** The inverse-transform sentence in `tests/LEGACY_CODECS.md` now says it was seen on the four signals
  traced (1,892 codec frames).
- **The engine's rate, given by the orchestrator** from its private investigation of the owner's older engine files
  (not measured or read in this order; written in the docs as given):
  - read from the engines of Source SDK Base 2006 and 2007: `sv_voicecodec` defaults to `vaudio_speex` and loads any
    name as a library, with no list and no fall-back, so `vaudio_miles` was accepted; voice is captured, coded, decoded
    and played at 11025 Hz for every codec, with no resampling to the codec's 8000 Hz. So a frame was 32.65 ms and
    2940 bit/s on the wire (45 ms and 2133 bit/s at the codec's nominal 8000 Hz), and the nominal 4000 Hz band covered
    about 5512 Hz;
  - read: a packet is the codec's frames end to end behind a 16-bit count of bits; the receiver runs the auto-gain on
    the decoded samples in 128-sample blocks; Decompress is never called without data;
  - measured: those engines' wrappers with their plug-in (Miles 6.6a) give the vectors exactly (2,505 of 2,505 frames,
    901,800 of 901,800 samples), and that plug-in equals TF2's on every codec frame and sample at 53 and 64 bits;
  - read: SDK Base 2013's 32-bit engine refuses the name as TF2 does.

  The label is now "a codec of the engine family (selectable in the Source engines of 2006 and 2007, where the default
  was already `vaudio_speex`); current TF2 ships it and refuses it", in `tests/LEGACY_CODECS.md`, the vendor README,
  `index.mjs` and finding 31. `sampleRate = 8000` stays in `index.mjs`, commented as the codec's own nominal rate.
  Still not known: nothing of a running engine with this codec has been recorded; the real start-up block; how many
  frames a packet held; what the listener heard at a lost packet beyond "no decoder call".

## Read differently, or not done

- **The 1.5 MB subset.** Read as 1,500,000 bytes: tones, noise and clipped with all five files each come to
  1,486,324. Each check has three signals; `tones` is the only committed one with unequal plug-in frames (the voice
  input, the other, would not fit beside two more signals). The other five signals are scored above but not committed.
- **The decoder at game level is fed the game's packets**, as the measurement fed the real decoder, and resets in the
  same codec, whose encoder supplies the bytes the reset decodes. So the game-level decoding of a signal needs its
  input; for the 40-second signal it was remade (above).
- **The native twin** links musl's ceil, lrintf and rintf as well, which the module has as WebAssembly instructions
  (exact operations either way), so that it links no system libm at all.
- **`-fno-builtin`** is a flag the Speex build does not have (reason above). It is in both builds.
- **A part frame on the final call when nothing is kept** gives no bytes in this build; the reading says only that a
  part frame is padded, so this is not checked.
- **`vr12_decode_frame` can return -1** for a frame its count of codec frames finds empty; with 6 bytes that count is
  never 0, so the path cannot be taken. The wrapper reports it as an error rather than inventing samples.
- Not done, as the order says: no profile, nothing on the page, no change to `audio.js`, `constants.js`,
  `opus-codec.mjs` or `sw.js`; no exact decoder.

Nothing of the upstream project beyond the four files was fetched or read; the wrapper was written from the input's
`WRAPPER-AND-VECTORS.md`. The branch's diff and commit messages were scanned for recordings, personal details,
SteamIDs, machine paths and model names before the push.
