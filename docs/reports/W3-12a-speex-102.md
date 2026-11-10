# W3-12a report: Speex 1.0.2 as the game's module runs it

Speex 1.0.2 is built from Xiph's public source to a WebAssembly module in `vendor/speex-1.0.2/`, set up and framed as
`docs/reports/W3-09-steam-voice.md`, section 5, reads the game's `vaudio_speex` module. It matches a native build of
the same source bit for bit: packets, decoded floats and 16-bit output, on 516 frames. `tests/speex102.verify.mjs`
(30 checks, in `pnpm test`) holds the native hashes and checks section 5 point by point. Every check fails when its
line is broken (table below). Part b (the profile) is not touched.

## Files

| File | What |
|---|---|
| `tests/speex102/build.mjs` | clones tag `Speex-1.0.2` from `https://gitlab.xiph.org/xiph/speex.git`, stops unless it is commit `4a6fa8d6fd1283df196ebd9a67fb1514618406ba`; musl `v1.2.5` at `0784374d…`; builds with clang `--target=wasm32 -O2 -ffp-contract=off` and wasm-ld; checks the module has no imports |
| `tests/speex102/api.c` | the entry points: create (the module's five requests, in its order), encode, decode, reset, and two read-only ctl getters for the tests |
| `tests/speex102/libc.c`, `tests/speex102/include/` | what 1.0.2's `misc.c` and `speex_header.c` need beyond `tests/libopus11/libc.c`: `stderr`, `fprintf`, `printf`, `fputc` (print nothing), `exit` (traps), `strncpy`, glibc's `rand`; `acos` in `math.h` |
| `tests/speex102/native.c`, `native.mjs` | the native build and the comparison; `native.mjs` also exports the test signals |
| `tests/speex102.verify.mjs` | the checks |
| `vendor/speex-1.0.2/` | `speex-1.0.2.wasm.mjs`, `index.mjs`, `README.md` (lists the files compiled), `COPYING.speex` (from the 1.0.2 tree), `NOTICE` (the sources' copyright notices), `COPYRIGHT.musl` |
| `tests/vendor-opus.mjs` | the module's recorded hash |
| `package.json` | `node tests/speex102.verify.mjs` in `test`, after the 1.2.1 suite |

The library's sources are unchanged. 1.0.2 built with no change to any of its files. All 29 files of
`libspeex_la_SOURCES` are compiled; the only define is configure's `VERSION="1.0.2"` (1.0.2 has no config header, no
fixed-point build, and SSE is off by default).

## The source and the pins

- The tag `Speex-1.0.2` is a lightweight tag on commit `4a6fa8d6fd1283df196ebd9a67fb1514618406ba` (dated
  2003-09-24, "manual update … for 1.0.2"), the one pinned. `configure.in` says 1.0.2.
- A trap found on the way: `git clone --branch Speex-1.0` takes the **branch** `Speex-1.0` (a 1.0.x maintenance line
  at 1.0.5, 2007), not the tag. There is no branch named `Speex-1.0.2`, and the script's commit check would stop it
  anyway.
- Section 5's lists of requests hold in the source as numbered: the decoder's `nb_decoder_ctl` handles 0, 1, 3, 7, 9,
  19, 20, 22, 24 to 26 and 100 to 103; the encoder's handles 3, 4, 6 to 9, 12 to 19, 24 to 26, 29 to 35 and 100 to
  102. The mode structure is 160, 40, 10, 640, 17, 144, 0.9, 0.6, .01, 1.0001, 0.0, quality map 1, 8, 2, 3, 3, 4, 4,
  5, 5, 6, 7. The forced pitch gain is capped at 15, and the gain index is `floor(3.5*log(ol_gain))` with no half.

## The module

`createCodec()` gives `{ frameSize: 160, packetBytes: 20, encode, decode, reset, free, version: 'Speex 1.0.2' }`, plus
`decodeFloats` (the floats before the 16-bit conversion) and `encoderCtl`/`decoderCtl` (read one integer request),
for the tests. `encode` passes the integers as floats, with no division. `decode` is `toInt16(decodeFloats(bytes))`,
and `toInt16` is `(Math.trunc(x) << 16) >> 16`. `createFramer(codec)` gives `compress(samples, final)` and
`decompress(bytes)`, and a `kept` count.

**The module is 133 735 bytes of WebAssembly** (the `.wasm.mjs` file, base64, is about 178 kB). 1.2.1's is 86 144.
One reason 1.0.2's is larger: its narrowband decoder refers to the wideband mode, so the wideband encoder and decoder
stay in (`sb_encode` and `sb_decode` are in the module). I did not measure what else adds to it.

**The decoder's request 4 is kept.** The build has a `stderr` that prints nothing (`tests/speex102/libc.c`), so the
call costs nothing and the module makes it. The native build shows what it does: each codec prints `warning: Unknown
nb_ctl request:  4` on stderr, and nothing else changes (break C7: leaving it out changes no output).

## Native comparison

`node tests/speex102/native.mjs` (fresh clones, and again with local checkouts):

    Native: cc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, x64, -O2 -ffp-contract=off -fno-fast-math -msse2 -mfpmath=sse. 516 frames of test signal.
    speech: 276 frames; packets 6892b043…, floats e1a5ce6e…, 16-bit dd344359… (WebAssembly identical)
    square: 100 frames; packets 5133a813…, floats 819e3457…, 16-bit 923fca5e… (WebAssembly identical)
    silence: 40 frames; packets d584f088…, floats c6520676…, 16-bit 59ec91dc… (WebAssembly identical)
    noise: 100 frames; packets c06f01fb…, floats 08d93584…, 16-bit b3e57a53… (WebAssembly identical)
    The WebAssembly module matches the native build bit for bit.

The signals are 16-bit at 11025 Hz, a new codec each: speech-like (4.0 s; syllables on a gliding 140 Hz pitch, a
noisy stretch, a pause, and a loud vowel that clips), a full-scale square wave (50 samples a period), silence, and
uniform white noise with its RMS at -6 dBFS (half of full scale; peak 28378). The native side converts to 16 bits
with a C cast, as the module does; the WebAssembly side with `toInt16`. The native build uses glibc's libm, so the
musl functions are not what makes them agree.

They agreed on the first run, so there was no difference to chase. To see that the comparison would catch one, I
built the native side with `-ffp-contract=fast -mfma` in a scratch copy. The packets still matched, but the decoded
floats differed from frame 0 (speech: float 81, native 149.85649, WebAssembly 149.85648). So contraction would show,
and only in the decoder's output on these signals.

The full hashes are the constants in `tests/speex102.verify.mjs` (`NATIVE`). The reviewer can re-run `native.mjs` to
confirm them.

## Vendor hash

Three builds gave the same bytes: one from local checkouts, then two from fresh clones (`node
tests/speex102/build.mjs`, run twice). Each printed `vendor/speex-1.0.2/speex-1.0.2.wasm.mjs: 133735 bytes of wasm,
55 sources, no imports`.

- `speex-1.0.2.wasm.mjs`: SHA-256 `e585e8d9e7d429468f5874f7526ecba19fc946fdf1b2289343f5365477047aca`, recorded in
  `tests/vendor-opus.mjs`
- the WebAssembly inside it: `00c191f2dab9d02722587b4a52b3f6570458b351ca28437271961ffbda7d396e`

`pnpm test:vendor` ends `Speex 1.0.2 build matches its recorded hash.` The module holds no paths. Its only strings are
Speex's own warning texts.

## The checks and how each was broken

A harness (in the scratch folder, not committed) copied the worktree, made one break, rebuilt the module when a C file
changed, and ran a keep-going copy of the test. In that copy `check` logs instead of asserting, and each top-level
block catches what it throws. Each break failed at least the checks named. "Native" means the four checks "packets,
decoded floats and 16-bit output match the native build", and "decode() 16-bit" means the four checks "decode()
gives the native build's 16-bit output".

| Check | Break (one at a time) | Failing output |
|---|---|---|
| native (4) | B1 `encode` divides by 32768 | speech, square, noise fail (silence is zeros either way); B11, B12, C2 fail all four |
| decode() 16-bit (4) | B3 `Math.round` for `Math.trunc` | speech, square, noise; B2 (clamp) speech and square; B11 all four |
| frame 160, packet 20, request 3 | B9 the codec says `frameSize: 159` | fails `[160 / 160]` |
| sub-mode 3, 8000 bit/s, complexity 2 | C2 quality 8; C3 encoder told 11025 Hz; C4 complexity 3 | `[mode 5, 15000 bit/s …]`, `[… 11025 bit/s …]`, `[… complexity 3]` |
| enhancement on | C1 enhancement 0 | `[0]` |
| both told 8000 Hz | C3 | `[11025 / 8000]` |
| every packet 20 bytes | B16 `encode` returns 19 bytes | fails (the other blocks throw `Expected a 20-byte packet`) |
| first five bits: narrowband, sub-mode 3 | B12 a sub-mode bit flipped; C2 | `[516 packets otherwise, first 00001101]`, `first 00101101` |
| version | B10 says 1.2.1 | fails |
| packets differ from 1.2.1's | B13 the module is 1.2.1 behind the same interface, claiming the right ctl values | `[0 of 276 packets differ]` |
| 1.2.1 reads them, r > 0.9 | B11 output one sample late; B12; B13 | `r 0.965 at a lag of 39`; `r 0.469`; `r 0.804 at a lag of 0` |
| square wave wraps (jump > 60000) | B2 clamp; B1; C2 | `6956 samples past full scale, 0 jumps`; `peak 2.1`; `peak 27348.1` |
| output is `(trunc(x) << 16) >> 16` | B2 clamp; B3 round | `6953 samples differ`; `7927 samples differ` |
| 32768.7 gives -32768, -32769.2 gives 32767 | B2; B3 | `32767 -32768 …`; `-32767 32767 …` |
| 165 a call: 20 bytes, 40 every 32nd | B4 kept samples forgotten; B6 a byte between frames | `the 32nd call starts with 5 kept`; `call 1: 21 …` |
| back to back | B4; B6 | `1280 bytes`; `1386 bytes` |
| 68.9 frames a second | B4; B6 | `668 frames in 10 s`; `723.45` |
| final call pads | B5 no padding; B4 | `20 + 20 bytes` |
| decompress = frame by frame, remainder ignored | B7 skips the first frame | fails; B7b (`Math.ceil`, decodes the remainder) throws `Expected a 20-byte packet` |
| reset gives a new codec's packets | B8 `reset()` does nothing; C5 encoder not reset | `16 of 138 packets differ` (both) |
| pair delay 80 samples | B11 | `peak at 81` |
| speech with reset() before frame 138: native, and decode() 16-bit (2) | A1 no decoder reset; A3 reset makes a new decoder | both checks fail under each; decode() hash `462d4502ac1cf585` and `8cccf898d10652bc` |
| a codec gives what it gives alone while others are made beside it | J10 the memory views made once, at create | `4 codecs made during the run; wrong at frame 0: Cannot perform %TypedArray%.prototype.set on a detached ArrayBuffer` |

These breaks change nothing, and no check fails on them:

- **C7: the decoder's request 4 left out.** The call has no effect.
- **C8: quality 3 for 4.** Both map to sub-mode 3, and `SPEEX_SET_QUALITY` sets only the sub-mode, so the codec is the
  same. No test can tell 3 from 4.
- **C6: VBR on.** No check fails as such. The encoder writes 15-byte frames and `encode` stops with `Speex wrote 15
  bytes, not 20`.
- **B14: the last ten packet bytes reversed.** This one does fail checks: the native and decode() hashes and the
  delay. But the 1.2.1 correlation check does not fail, because both decoders read the same corrupted bits. That
  check guards how the bits are read, not what they hold.

## What turned out wrong or ambiguous, and how I read it

1. **The 1.2.1 correlation check cannot pass as literally written.** On a correct build, 1.2.1's decode of the 1.0.2
   packets correlates with 1.0.2's own decode at r -0.15 at lag 0, and 0.55 at its best lag. Two known differences
   of the 1.2.1 decoder cause this. Its output is 40 samples later: its decoder look-ahead, half the 80 the
   `vendor/speex` module reports. And it high-passes its output (`highpass()`, filter 2, in 1.2.1's
   `libspeex/filters.c`), which turns the phase of the 140 Hz fundamental. The test allows for both. It runs the same
   biquad on 1.0.2's decode, then requires the correlation peak at exactly lag 40 with r > 0.9. Measured: r 0.965.
   The bits are read the same; the decoders differ as their sources say. I read the order's intent ("1.2.1's decoder
   still reads them") this way and did not stop. The reviewer should judge it.
2. **Speex 1.0 cannot be told from 1.0.2 at the module's settings.** Section 5 says the neighbours "would not give the
   same packets". I built the real `Speex-1.0` tag (`19f34ea…`) in a scratch copy, and every check passed: 0 of 516
   packets and 0 decoded frames differ. The 1.0 to 1.0.2 differences touch only sub-mode 1 (the forced pitch gain),
   lost frames (`ltp.c`), the bit-buffer terminator, and wideband, none of which this module uses. So the cap at 15
   that rules out 1.0 matters only to the reading, not to the sound.
3. **Speex 1.0.3 differs on everything but full-scale and silent sound.** Built the same way (`Speex-1.0.3`,
   `5a3c9c0…`), it changes 248 of 276 speech packets, but none of the full-scale square wave, the -6 dBFS noise or
   silence: very loud sound pushes the gain index to its cap of 31, and silence to 0, whatever the half. The review
   measured more levels: the speech-like signal at gains 0.01 to 1 (247 to 251 of 276 packets differ), noise at -40
   and -20 dBFS (100 of 100) and a sweep (300 of 300). (My first version of this report said "only moderate
   signals", which was wrong.) The native speech hash catches it.
4. **"68.9 frames a second"** is 11025 / 160. At 165 samples per 15 ms tick exactly, the rate would be 68.75 (33 frames
   in 32 ticks). The check feeds 10 s of 11025 Hz sound in 165-sample calls and counts 689 frames.
5. **The decoder's reset is partial in 1.0.2** (see "For part b"). After `reset()` the packets equal a new codec's
   (the order's check), but the decoded output does not. Counting differing frames cannot check the reset: with no
   decoder reset at all, the count is the same 2. So the review's fix records the native hashes of a run with a reset
   (below).
6. **The conversion beyond 2^31.** `(Math.trunc(x) << 16) >> 16` reduces modulo 2^32 first. An x86 conversion gives
   0x80000000 for |x| ≥ 2^31 (low 16 bits 0). NaN gives 0 both ways. Decoded values never come near 2^31 (the peak
   here is 56 473), so I followed the order.
7. **The wrapper's room and reset.** `compress` has no `room` argument (the module's 20 bytes of room per frame are
   always there here). Section 5 does not say what the wrapper's `ResetState` does with kept samples, so the framer
   has no reset. Part b decides.
8. **The order's jump check, as written, also passes with a clamp.** A square wave's decoded edges move by more than
   60000 between neighbours. So the test counts a jump only where the floats themselves moved by less than 60000: a
   clamp can never move the output more than the wave. With that rule the clamp break fails the check (`0 jumps`),
   and the correct build has 963.

## For part b

- **Delay:** the encode/decode pair delays the sound by **80 samples** (7.26 ms at 11025 Hz). Measured as W1-01 did:
  a voice-band signal (harmonics from the 2nd to 3.4 kHz, so no phase turn from a high-pass), encoded and decoded.
  The cross-correlation with its source peaks at lag 80, r 0.977. It equals the encoder's 240-sample window minus
  the 160-sample frame. 1.0.2 has no look-ahead request. The test "the encoder and decoder together delay the sound
  by 80 samples" pins it.
- **The decoder's request 4 is kept** (see "The module").
- **Module size:** 133 735 bytes of WebAssembly; the `.wasm.mjs` file is about 178 kB. Add both files of
  `vendor/speex-1.0.2/` to `sw.js` when the page loads them.
- 1.0.2 has **no input high-pass** (1.2.1 has one in the encoder and the decoder), so low frequencies keep their phase.
- **Reset with request 26, never with a new codec.** The game resets with request 26 on both (section 5). In 1.0.2
  that reset is partial on the decoder, so a new decoder gives other sound. The check "speech with reset() before
  frame 138" pins the request-26 result to the native build's hashes.
- **What survives request 26 in 1.0.2's decoder.** This is the review's reading, which I checked against the public
  source (`libspeex/nb_celp.c` at tag Speex-1.0.2):
  - `nb_decoder_ctl`, case `SPEEX_RESET_STATE`, zeroes only `mem_sp[0 .. 2*lpcSize)` (the synthesis and enhancement
    filter memories; `mem_sp` has `5*lpcSize`), `excBuf` and `inBuf`.
  - `first` is left at 0. So the first frame after a reset interpolates its LSPs from `old_qlsp`, the last frame
    before the reset (`nb_decode`: `if (st->first || st->count_lost)` copies `qlsp` into `old_qlsp` only for a new
    decoder).
  - `comb_mem` (the enhancement comb filter's memory, used by `comb_filter` in `nb_decode` when enhancement is on;
    sub-mode 3's comb gain is .45 in `modes.c`) is left as it was.
  - Also left, with no effect here: `last_pitch`, `last_pitch_gain`, `pitch_gain_buf`, `last_ol_gain`, `count_lost`
    (used only for lost frames), `voc_m1`, `voc_m2`, `voc_mean`, `voc_offset` (sub-mode 1), `pre_mem` (pre-emphasis
    is 0.0), `submodeID` (read from each packet), and the settings.
  - The review's probe: after request 26, also setting `first = 1` and re-initialising `comb_mem` makes the decoder
    bit-identical to a new one (0 of 138 frames differ); either one alone leaves 3 or 2 frames differing. So these two
    are the state that changes the sound after a reset.
  - The encoder's reset (`nb_encoder_ctl`) sets `first` and `bounded_pitch` and clears the LSPs, filter memories and
    buffers; after it the packets equal a new encoder's.
- **Speex 1.0 and 1.0.2 are one codec at these settings.** The review ran 13 signals (the four test signals, speech
  at six levels, noise at -40 and -20 dBFS, a sweep) through native builds of both: identical packets and decoded
  frames. I found the same on the four test signals. Their source differences are all unreachable here (sub-mode 1's
  forced pitch gain, a lost-frame path in `ltp.c`, the bit terminator, wideband). So whether the game has 1.0, 1.0.1
  or 1.0.2 does not matter for the sound; only the module's reading (the cap at 15) tells them apart.
- Loud input wraps a lot: the speech-like signal's loud vowel wraps 2106
  samples, the square wave 6956.
- `tests/speex102.verify.mjs` imports `vendor/speex/index.mjs` for the 1.2.1 comparison. If part b removes
  `vendor/speex/`, that check must build 1.2.1 natively in `native.mjs`, or go (the order allows either).

## Runs

- `pnpm test` (after merging `origin/main` at `c8a11ec`): exit 0 in 2 min 38 s. `211 passed, 0 failed`, `119 Opus
  checks passed`, `63 Speex checks passed`, `27 Speex 1.0.2 checks passed`, `41 paired-reference checks passed.`,
  `66 passed, 0 failed`, `53 file-rate checks passed`, `50 passed, 0 failed`, `45 video checks passed`, `31 demo
  checks passed`, `145 render-stream checks passed, 0 failed`.
- `pnpm test:vendor`: all five lines, ending `Speex 1.0.2 build matches its recorded hash.`
- The browser suite was not run: no file the page loads changed.
- CI: runs 42747753839 (`d76d649`) and 42748241965 (`0fc1d8b`) succeeded. The runs on the merge and on this report's
  commit are in the hand-back summary.
- The merge of main had one conflict, the `test` line in `package.json`, shared with W2-02's render-stream suite. Both
  suites are kept. The merge commit's message has git's `# Conflicts` lines after the trailer. It was already pushed,
  so I left it rather than rewrite a pushed branch.
- The review round's merge of main (`4c0d22e`) had the same conflict, with W3-02a's voice-channel suite: all three
  are kept, and its message ends with the trailer lines. The first merge (`d6c8ef2`) still has git's `# Conflicts`
  lines after its trailers: changing it would rewrite a pushed commit, which the pipeline forbids. The review found
  `git interpret-trailers --parse` still reads both trailers there.
- I scanned the diff and the commit messages: no recordings, personal details, machine paths or model names, apart
  from the required trailers.

## Review round

The review (rebuilt byte for byte from fresh clones, all 12 native hashes reproduced, ten minutes through one codec
identical to native) found two test gaps and a licence omission. Fixed:

1. **The decoder's reset had no check.** Deleting the decoder's request 26, or making a new decoder in its place,
   passed all 27 checks. `native.c` now takes a frame number and calls `sx_reset` before it; `native.mjs` runs the
   speech-like signal again with a reset before frame 138 (`speechReset`), and both sides agree:

       speechReset: 276 frames; packets c105432d886f024fdd2d7ecbab934f5f5eabc89ff44f91fe9ba8a656b810de66,
         floats 74f0b71c19f806d24846999ac794bb3a33f540b2774b9552d114e4f6124f4266,
         16-bit 57172332a339ebdb3f2bf5d70342aa6f1472ce109866f14c0f13aa180f3c1594 (WebAssembly identical)

   These are my native build's values; they equal the review's. The verify holds them and checks them through
   `wasmStream` and through `codec.decode`. Breaks A1 (no decoder reset) and A3 (a new decoder) each fail both
   checks (table above).
2. **A stale view after memory growth had no check.** The module's memory grows about a page per codec made, which
   detaches older views. New check: a codec made first, used while 112 others are made, and two codecs interleaved
   frame by frame, each give what a codec gives alone. Break J10 (the views made once, at create) fails it.
3. **Licence notices.** 1.0.2's `COPYING` has the terms but names no holder. `vendor/speex-1.0.2/NOTICE` quotes, from
   the compiled files as they stand: Jean-Marc Valin's line (and "& David Rowe" in `cb_search.h`), the numbered
   terms of the four table files, the Voicetronix origin of `lsp.c` and `lsp.h`, and the Jutta Degener and Carsten
   Bormann notice of `lpc.c`. The README points to it.
4. **Report:** the 1.0.3 wording is corrected (item 3), and "For part b" has what survives request 26 and the 1.0
   result.

Also: `encoderCtl` and `decoderCtl` now throw on a freed codec, as `encode` does (they trapped before). The module's
bytes did not change, so its hash is the same. 30 checks now.

Runs at the end of the round: `pnpm test` under the heavy lock, exit 0 in 2 min 46 s (`30 Speex 1.0.2 checks
passed`, `101 voice channel checks passed`, every other suite as before); `pnpm test:vendor` ends `Speex 1.0.2 build
matches its recorded hash.`; `native.mjs` "The WebAssembly module matches the native build bit for bit." on all five
runs. CI on the pushed head is in the hand-back.
