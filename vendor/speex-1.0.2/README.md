# Speex 1.0.2 (WebAssembly)

This folder holds the codec of the game's `vaudio_speex` module: Speex 1.0.2, set up and framed as the module does. It
was read from the module itself (`docs/reports/W3-09-steam-voice.md`, section 5). No recording of it can be made: a
current game asked for `vaudio_speex` runs `vaudio_celt` instead (same report, section 6). So it is checked against a
native build of the same source and against that reading, point by point (`tests/speex102.verify.mjs`).

- `speex-1.0.2.wasm.mjs`: the module, base64 encoded. It contains:
  - Speex from Xiph's repository (`https://gitlab.xiph.org/xiph/speex.git`), tag `Speex-1.0.2` at commit
    `4a6fa8d6fd1283df196ebd9a67fb1514618406ba`: the library's sources unchanged, floating point (1.0.2 has no other
    build), with the entry points in `tests/speex102/api.c`
  - the musl 1.2.5 math functions it needs, at commit `0784374d561435f7c787a555aeab8ede699ed298`, the small C library
    from `tests/libopus11/libc.c`, and `tests/speex102/libc.c`: printing that does nothing, `exit` that traps, and
    glibc's `rand` (which Speex calls only for lost frames and sub-modes 0 and 1, never here)

  The module has no imports, so it gives the same output in every browser.
- `index.mjs`:
  - `createCodec()` gives the module's codec: `{ frameSize: 160, packetBytes: 20, encode, decode, reset, free,
    version: 'Speex 1.0.2' }`. `encode` takes an `Int16Array` of 160 and gives 20 bytes; the samples go in as floats
    with their integer values, as the module passes them. `decode` takes 20 bytes and gives an `Int16Array` of 160: each
    decoded float is truncated toward zero and keeps its low 16 bits, with no clamp, so a value past full scale wraps to
    the other end (`toInt16`). `decodeFloats` gives the floats before that, and `encoderCtl`/`decoderCtl` read an
    integer request, for the tests.
  - `createFramer(codec)` is the module's wrapper: `compress(samples, final)` keeps what does not fill a frame, writes
    whole frames back to back and pads with zeros on the final call; `decompress(bytes)` decodes every whole 20 bytes.
- `COPYING.speex`: Speex licence (BSD), from the 1.0.2 tree. It names no copyright holder, so `NOTICE` quotes the
  notices of the compiled source files: Jean-Marc Valin's, David Rowe's, Voicetronix's origin of the LSP code, and the
  Jutta Degener and Carsten Bormann notice in `lpc.c`, which must be kept. `COPYRIGHT.musl`: musl licence (MIT).

**The set-up**, in the module's order: an encoder and a decoder from the narrowband mode; request 4 (quality) with 4
on the encoder; request 4 with 4 on the decoder, which 1.0.2's decoder does not know (it returns -1 and prints a
warning, which this build drops; the call is kept because the module makes it); request 0 (enhancement) with 1 on the
decoder; request 24 (sampling rate) with 8000 on the decoder and on the encoder. Nothing else is set, so the library's
defaults hold: constant bit rate, no VAD, no DTX, complexity 2. Quality 4 is sub-mode 3: 160 bits a frame, 20 bytes.
`reset()` is request 26 on both. There is no concealment: the module never decodes without bytes.

**What it means in the game.** The module does not resample. The game hands it 11025 Hz sound, so a 160-sample frame
lasts 14.51 ms, 20 bytes a frame is 11025 bit/s, and the codec's 4 kHz band reaches 5.5 kHz. The encoder and decoder
together delay the sound by 80 samples (7.26 ms at 11025 Hz). 1.0.2 has no look-ahead request, so this is measured
(`tests/speex102.verify.mjs`); it is what the encoder's 240-sample analysis window, 80 longer than a frame, predicts.

**Files compiled.** From `libspeex/` (the `libspeex_la_SOURCES` of its `Makefile.am`, all of them): `nb_celp.c`,
`sb_celp.c`, `lpc.c`, `ltp.c`, `lsp.c`, `quant_lsp.c`, `lsp_tables_nb.c`, `gain_table.c`, `gain_table_lbr.c`,
`cb_search.c`, `filters.c`, `bits.c`, `modes.c`, `vq.c`, `high_lsp_tables.c`, `vbr.c`, `hexc_table.c`,
`exc_5_256_table.c`, `exc_5_64_table.c`, `exc_8_128_table.c`, `exc_10_32_table.c`, `exc_10_16_table.c`,
`exc_20_32_table.c`, `hexc_10_32_table.c`, `misc.c`, `speex_header.c`, `speex_callbacks.c`, `math_approx.c`,
`stereo.c`. The one define is configure's `VERSION="1.0.2"`; SSE is off, as configure leaves it. The headers are
1.0.2's own, in `libspeex/` (1.0.2 has no `include/speex/` folder and no fixed-point switches). From musl's
`src/math/`: `exp`, `log`, `log10`, `pow`, `cos`, `acos`, `sqrt`, `floor`, `fabs`, `scalbn` and their helpers.

To rebuild the module, run `node tests/speex102/build.mjs`. It needs git, clang with the wasm32 target, and wasm-ld; no
Emscripten. `node tests/speex102/native.mjs` builds the same sources natively and compares the two.

Built with Ubuntu clang 18.1.3, `speex-1.0.2.wasm.mjs` has SHA-256
`e585e8d9e7d429468f5874f7526ecba19fc946fdf1b2289343f5365477047aca` (the WebAssembly inside it:
`00c191f2dab9d02722587b4a52b3f6570458b351ca28437271961ffbda7d396e`, 133 735 bytes). `pnpm test:vendor` checks it. On
the four test signals of `tests/speex102/native.mjs` (speech-like, a full-scale square wave, silence and white noise at
-6 dBFS, 516 frames), and on the speech-like signal again with `reset()` before frame 138, its packets, decoded floats and 16-bit output are bit-identical to a native gcc 13.3 build of
the same sources on x86-64 (SSE2, no contraction, no fast-math).
