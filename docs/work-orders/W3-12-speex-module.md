# W3-12: the `speex` profile runs the game's module: Speex 1.0.2 on 11025 Hz sound

**Depends on:** W3-09's report (`docs/reports/W3-09-steam-voice.md`, section 5, which is written to be built
from, and section 6). Two parts. **W3-12a** (the build and its checks) adds new files only: it can start now and
run beside any order. **W3-12b** (the profile) changes `constants.js`, `opus-codec.mjs` and `audio.js`: after
W2-02, W3-05 and W3-06 have merged and when no other `audio.js` order is open. It does not wait for W3-13:
its README edit goes in first, and W3-13 merges main in and keeps both. **Kind:** code. `tf-builder`
(effort high), then `tf-reviewer`. **Branches:** `claude/w3-12a-speex-102`, `claude/w3-12b-speex-profile`, from
`main`. **Worktrees:** given in the brief. **Time budget:** 1 day for a, half a day for b.

*Revised 2026-11-10 after the plan's review (findings 19 to 21; `docs/reports/W3-11-plan.md`, "The review").*
W3-06 no longer touches the Speex profile (decided 2026-11-10): this order is the only one that does.

*Part a is built and merged (`docs/reports/W3-12a-speex-102.md`). Part b was brought up to date with what it
learnt on 2026-11-10 (`docs/reports/W3-plan-maintenance.md`, item 4): the delay, the reset, the release
wording, the 1.2.1 comparison, where the 16 bits are made, and two stale comments about `celt_44`.*

## Why

The owner supplied a `vaudio_speex` module and W3-09 read it. The app's profile is wrong in three ways:

| The profile today | The module |
| --- | --- |
| Speex 1.2.1 | **Speex 1.0.2** (floating point; 1.0.1 cannot be told apart and has no tag). The bit-stream is the same; the encoder's choices and the decoder's enhancement are not |
| the sound resampled to 8000 Hz for the codec and back | **no resampling**: the 11025 Hz samples go into the narrowband codec as they are, so a 160-sample frame lasts 14.51 ms, 20 bytes a frame is 11.025 kbit/s, and the band reaches 5.5 kHz |
| decoded floats clipped | truncated toward zero to 16 bits with **no clamp**: a value past full scale wraps to the other end |

Right already: narrowband, quality 4 (the engine's 3), 20-byte frames, constant bit rate, enhancement on,
complexity the library's default. **No recording can check this:** a current game asked for `vaudio_speex` ends
up on `vaudio_celt` (W3-09, section 6). So the checks are a native build of the same public source, and the
report's reading point by point.

## W3-12a: the build

### What to build

1. **`tests/speex102/build.mjs`** builds Speex 1.0.2 to WebAssembly as `tests/speex/build.mjs` builds 1.2.1
   (read `docs/reports/W1-01-speex.md` first: clang with the wasm32 target and wasm-ld, the small C library of
   `tests/libopus11`, musl's libm at its pinned commit, no imports, reproducible). The source is cloned from
   `https://gitlab.xiph.org/xiph/speex.git` (reachable from the build machine; `github.com` is not) at tag
   `Speex-1.0.2`, **commit `4a6fa8d6fd1283df196ebd9a67fb1514618406ba`**, pinned by that hash in the script; the
   script stops if the checkout's hash differs. Narrowband only; the library's sources unchanged. The 1.0.2 tree
   is laid out differently from 1.2.1 (its sources are in `libspeex/`, with no `include/speex/` folder and no
   fixed-point switches): list the files compiled in the README.
2. **`tests/speex102/api.c`**: the entry points, doing what the module does and nothing else:
   - create: a bit buffer, an encoder and a decoder from the narrowband mode; request 4 (quality) with 4 on the
     encoder; request 0 (enhancement) with 1 on the decoder; request 24 (sampling rate) with 8000 on both. The
     module also sends request 4 to the decoder, which 1.0.2's decoder does not know and answers with a warning:
     leave that call out if it needs a `stderr` the build does not have, and say so.
   - encode a frame: 160 floats **at 16-bit scale**; reset the bit buffer, `speex_encode`, write 20 bytes.
   - decode a frame: 20 bytes in, `speex_decode`, 160 floats out, as they are (the conversion is in JavaScript).
   - reset: request 26 on both.
   - There is no concealment entry point: the module never decodes without bytes.
3. **`vendor/speex-1.0.2/`**: the module (`speex-1.0.2.wasm.mjs`), `index.mjs`, `README.md`, `COPYING.speex`
   (from the 1.0.2 tree), `COPYRIGHT.musl`: laid out and described as `vendor/speex/` is. `vendor/speex/` (1.2.1)
   is not touched in part a. `index.mjs` exports `createCodec()` giving `{ frameSize: 160, packetBytes: 20,
   encode(Int16Array of 160) -> Uint8Array of 20, decode(Uint8Array of 20) -> Int16Array of 160, reset(),
   free(), version: 'Speex 1.0.2' }`. `encode` passes the integers as floats, with no division. `decode`
   converts each float as the module does: `Math.trunc`, then the low 16 bits as a signed number (in
   JavaScript: `(Math.trunc(x) << 16) >> 16`), so 32768.7 gives -32768 and -32769.2 gives 32767.
4. **The wrapper**, `createFramer(codec)`, in `index.mjs`, as the module's wrapper frames a packet:
   `compress(Int16Array, final) -> Uint8Array` keeps the samples that did not fill a frame, encodes every whole
   160 (kept samples first), writes the frames back to back with nothing before, between or after, and on
   `final` pads what is kept with zeros to a frame; `decompress(Uint8Array) -> Int16Array` turns every whole 20
   bytes into 160 samples and ignores a remainder.
5. **`tests/vendor-opus.mjs`** gains the new module's recorded hash (`pnpm test:vendor`), and
   `tests/speex102/native.mjs` builds the same pinned source natively with the machine's compiler and compares,
   as `tests/speex/native.mjs` does.

### The builder runs

- `node tests/speex102/build.mjs` twice gives the same bytes; `pnpm test:vendor` passes.
- `node tests/speex102/native.mjs`: packets and decoded floats are bit-identical to the native build on its
  test signal (speech-like, a full-scale square wave, silence, and noise at -6 dBFS: at least 500 frames in
  all). If they are not, report the first difference and why; do not hide it.
- `node tests/speex102.verify.mjs` (new, in `pnpm test`), each check failing when its line is broken (say how):
  - **Hashes from the native build:** the SHA-256 of the packets and of the decoded 16-bit output for the
    signals above, recorded from `native.mjs` (the test holds them as constants; the builder records them once
    and the reviewer re-runs `native.mjs` to confirm them).
  - **Section 5, point by point:** every packet is 20 bytes; the encoder reports sub-mode 3 (request 7, get
    mode), 8000 bit/s (request 19) and complexity 2 (request 17); the decoder reports enhancement on (request 1); the frame is
    160; the bit-stream's first five bits of every packet say narrowband sub-mode 3.
  - **It is 1.0.2 and not a neighbour:** the packets differ from those of the 1.2.1 module (`vendor/speex`) on
    the speech-like signal, while 1.2.1's decoder still reads them (the bit-stream is the same): the decoded
    sound correlates above 0.9 with 1.0.2's own decode.
  - **The wrap:** a full-scale square wave decodes with at least one sample that wrapped (find a jump of more
    than 60,000 between neighbours where the float output passed 32767), and the 16-bit output equals
    `(trunc(x) << 16) >> 16` of the floats sample for sample. With a clamp in its place the check fails.
  - **The framer:** 165 samples a call (what the engine hands over each 15 ms tick at 11025 Hz) gives one
    20-byte packet on most calls and a 40-byte one about once in 32 (5 more samples are kept each call: the 32nd
    call starts with 155 kept and so has 320); 68.9 frames a second; the final call pads; `decompress` of the joined packets equals
    frame-by-frame decoding.
  - Reset: after `reset()` the same input gives the same packets as a new codec.
- `pnpm test` and CI pass on the pushed branch.

There is nothing private to run.

## W3-12b: the profile

### What to build

1. **`CODEC_PROFILES.speex`** (`constants.js`): `codecRate: 11025`, `bitrate: 11025`, frame 160, no resampling
   between the capture and the codec beyond the one to 11025 Hz that the engine's own capture does; the voice
   rate stays 11025, so nothing resamples after the decoder either. Display name "vaudio_speex (Speex 1.0.2
   on 11 kHz sound, 11 kbps)". Its comment: read from the game's module (W3-09, section 5); no recording can
   exist. Status: "codec and settings read from the module; not recorded".
2. **`opus-codec.mjs`**: `speexRoundTrip` and `createSpeexStream` run `vendor/speex-1.0.2` at the codec's rate
   of 11025, 16-bit in and out with the wrap, `frameMs` 14.51.
   - **Where the float sound becomes 16 bits.** The module's `encode` takes an `Int16Array`. The two functions
     round at that call, for every caller and nowhere earlier: `max(-32768, min(32767, round-half-even(x x
     32768)))` (the game's capture is 16-bit; W3-06 does the same inside the CELT module's `encode`). The
     decoded `Int16Array` goes on as `q / 32768`.
   - **The delay trimmed is 80 samples** (7.26 ms at 11025 Hz: the encoder's 240-sample window less the frame;
     measured in part a, and pinned by its suite; 1.0.2 has no look-ahead request).
   - **A new talk spurt is the codec's `reset()`** (request 26 on the encoder and the decoder, as the game
     does), **never a new codec.** In 1.0.2 that reset is partial on the decoder (the first frame after it still
     interpolates from the last frame before it, and the enhancement's comb filter keeps its memory; part a's
     report lists what survives), so a new decoder gives other sound for 2 or 3 frames. The old module's
     `restart()` made a new codec: do not carry that over. The framer has no reset: at a new spurt make a new
     `createFramer(codec)` on the same codec (what it kept from the last spurt was already sent, padded, by the
     final call).
   - **Loss:** the module has no concealment, and what the engine plays for a lost packet under this codec was
     not read: zeros for a lost frame (decided 2026-11-10), said in the comment, on the page and in the report.
     The decoder is not called for a lost frame. The 1.2.1 module's concealment goes with it.
3. **`snd_bits`** no longer picks a quality (the module has one table row for the engine's argument): the
   profile ignores it, and the page says so where it says it for CELT.
4. **`audio.js`**: only the places that call the two functions, and `codecResultInfo`.
5. **`vendor/speex/`** (1.2.1) is removed with its build folder `tests/speex/` and its hash, once nothing loads
   it; `tests/speex.verify.mjs` goes, and what it checked of the profile (the gate switch reaching the round
   trip, the frame log) moves into `tests/speex102.verify.mjs` or `tests/verify.js`. **`tests/speex102.verify.mjs`
   imports `vendor/speex/index.mjs`** for two checks ("the packets differ from those of the Speex 1.2.1 module"
   and "1.2.1's decoder reads the 1.0.2 packets"). Before removing the folder, record the SHA-256 of the 1.2.1
   module's packets for that speech-like signal as a constant in the test; the first check then says the
   1.0.2 packets' hash is not that one. The second check goes (it needs a 1.2.1 decoder); say so in the
   report. Add both files of `vendor/speex-1.0.2/` (the module is about 178 kB) to `sw.js`'s `ASSETS` and raise
   `CACHE`.
6. **What the page and the documents say.** The codec menu and the chain strip: "Speex 1.0.2 on 11.025 kHz
   sound · 20-byte frames of 14.51 ms · 11.025 kbit/s". README's profile row and `tests/LEGACY_CODECS.md`'s
   `vaudio_speex` row and section, rewritten: narrowband Speex 1.0.2 (2003), the engine's quality 3 is Speex's
   quality 4 (20 bytes a frame, constant bit rate), enhancement on, complexity 2; **the module does not
   resample, so the 8 kHz codec is fed 11025 Hz sound: a frame is 14.51 ms, the real rate is 11.025 kbit/s, the
   band reaches 5.5 kHz and the pitch range is 77 to 649 Hz**; decoded samples wrap past full scale; about one
   packet in thirty holds two frames; read from the owner's module, not recorded, because a current TF2 falls
   back to `vaudio_celt` (W3-09, section 6); that the module's reading cannot tell 1.0.1 from 1.0.2, and that
   **it does not matter for the sound**: native builds of Speex 1.0 and 1.0.2 gave identical packets and
   decoded frames at these settings on 13 signals (part a and its review), their differences being in paths
   this mode never takes; that 1.0.2 has no input high-pass (1.2.1 had one each side), so low frequencies keep
   their phase; and that loud speech wraps often (2,106 samples of the tests' speech-like signal, 6,956 of a
   full-scale square wave), which is heard as crackle on peaks. The "assumed settings" wording
   and "Next to the stand-in" figures go; the report gives the new figures (band edge, level, a spectrum
   difference against the old profile).

### The builder runs

- `pnpm test` passes, with checks that fail when broken (say how): the profile table's expectations; a render's
  `codecInfo` says 11025, 14.51 ms, 20 bytes, Speex 1.0.2; **the band** (a codec at 8 kbit/s does not hold a pure
  tone, so the test is on noise): seeded white noise at -20 dBFS, the gain off, the render's level in the band
  4.3 to 4.9 kHz is within 8 dB of its level from 0.7 to 2.7 kHz (the codec sees that band at 3.1 to 3.6 kHz,
  inside its own), where main's profile is at least 15 dB down there (give both figures in the report; measure on the
  11025 Hz voice signal or on a render at 11025 Hz, so that the mixer's images are not in the band; these two
  figures are the planner's estimate and were not tried: **if the check fails on a build that passes
  everything else, report both figures and stop**, do not tune the band or the bound); **nothing is shifted**: a train of pulses 200 a second (one sample of
  0.5 every 55.125 samples at 11025 Hz, rounded) comes out with its strongest autocorrelation lag between 4.9
  and 5.1 ms; a loud source gives wrapped samples in the render: at least one, counted at the decoder's output
  through a hook, and the count goes in the report. (Part a's 2,106 comes out only when the source is part
  a's own 16-bit samples at 11025 Hz, each divided by 32768, with the microphone gain at 1 and no high-pass
  or low-pass, so that nothing but the new rounding stands before the codec: add that case too, with 2,106
  as its expected count, if the suite can make the signal the same way.) **the reset**: with the gate on and two bursts, the second spurt's decoded frames equal a decode that
  called `reset()` between them and differ, in at least one of its first three frames, from a decode with a
  new codec; the delay: a voice-band source comes out aligned within one sample at 11025 Hz; `createRender` equals
  `process()`.
- **Golden hashes:** the `speex` cases only, re-recorded in a commit of their own; every other hash unchanged.
- The browser suite (labels, a render, the live chain with the profile, offline).
- CI passes on the pushed branch.

There is nothing private to run.

## Files

**a:** may add `tests/speex102/`, `vendor/speex-1.0.2/`, `tests/speex102.verify.mjs`; may touch
`tests/vendor-opus.mjs`, `package.json` (the `test` script: one line, shared with W3-13 and W3-02b; merge main in
before the last push). Nothing else. **b:** may touch `constants.js`, `opus-codec.mjs`, `audio.js` (as said),
`index.html`, `app/console.js`, `app/render.js` (the codec's name in the render's summary, about line 282:
"Speex 1.0.2"), `live.js` and `live-worker.js` (only where they name the codec or its frame), `sw.js`,
`README.md` (the profile row; the "Files and licensing" table and its notice line, **which W3-13 also edits: W3-13's merge waits for the
owner, so part b merges first and W3-13 then merges main in and keeps both changes**; the notice line names
`vendor/speex/COPYING.speex`; the build commands near line 327, which name `tests/speex/build.mjs` and
`native.mjs`; the Tests list), `tests/LEGACY_CODECS.md`, `tests/verify.js`, `tests/reference.verify.mjs` (its
Speex case passes `frameSeconds: .02`: it becomes `160 / 11025`, and the check's title says 14.5 ms frames;
and, left by W3-06 for a later order, its text that gives `vaudio_celt_high` 5.8 ms frames: it is 46.4 ms),
`tests/gain.verify.mjs` (a comment only: its key-up gap check says `celt_44` with the codec bypassed runs at
44.1 kHz with 256-sample frames and "no resampler ringing"; since W3-06 it runs at 22.05 kHz through the
linear mixer; rewrite the comment to what the check now shows and change no expectation; if W3-06's review
has already fixed either, leave it),
`tests/render-stream.verify.mjs`, `tests/browser.verify.js`, `tests/vendor-opus.mjs`, `package.json`,
`tests/predictions/PREDICTIONS.md` (a dated note if a hashed file changes); may remove `vendor/speex/`,
`tests/speex/`, `tests/speex.verify.mjs`. Before the last push, `grep -rn "1\.2\.1\|vendor/speex/" --include=*.js
--include=*.mjs --include=*.html --include=*.md . ` outside `docs/`, `node_modules/` and `tests/REFERENCE_2026.md`
finds only what the report explains. May not touch: `demo.js`, `reference.js`,
`tests/REFERENCE_2026.md`, `tests/predictions/predictions.json`, `docs/PROGRESS.json`, the other `vendor/`
folders.

## Stop and ask

- If the 1.0.2 source does not build without changing a library file (say which and why).
- If the WebAssembly and native builds differ in any packet.
- If the encoder does not report sub-mode 3 at quality 4, or any point of section 5 does not hold in the build.
- If a decoded wave never passes full scale on the square wave (then the wrap cannot be shown; say what the
  peak was).
