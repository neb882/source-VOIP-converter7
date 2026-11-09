# Speex 1.2.1 (WebAssembly)

This folder holds the codec for the `speex` profile. Source's `vaudio_speex` is Speex narrowband at 8 kHz (see `tests/LEGACY_CODECS.md`); the quality Source used is not public, so the profile's settings are assumptions.

- `speex-1.2.1.wasm.mjs`: the module, base64 encoded. It contains:
  - Speex from [xiph/speex](https://github.com/xiph/speex), tag `Speex-1.2.1` at commit `5dceaaf3e23ee7fd17c80cb5f02a838fd6c18e01`: the library's sources unchanged, floating-point build, with the small entry points in `tests/speex/api.c`
  - the musl 1.2.5 math functions it needs, at commit `0784374d561435f7c787a555aeab8ede699ed298`, and the small C library from `tests/libopus11/libc.c`

  The module has no imports, so it gives the same output in every browser.
- `index.mjs`: `createCodec(quality)` returns a narrowband encoder and decoder pair: one 160-sample (20 ms) frame per packet at constant bitrate (no VAD, no DTX, the library's default complexity 2), the decoder's perceptual enhancement on, Speex's own loss concealment, and `restart()` for a new talk spurt. The pair's delay is 80 samples (`lookahead`). `qualityForBitrate(bitrate)` picks the quality whose bitrate is nearest.
- `COPYING.speex`: Speex licence (BSD). `COPYRIGHT.musl`: musl licence (MIT).

To rebuild the module, run `node tests/speex/build.mjs`. It needs git, clang with the wasm32 target, and wasm-ld; no Emscripten. `node tests/speex/native.mjs` builds the same sources natively and compares the two.

Built with Ubuntu clang 18.1.3, `speex-1.2.1.wasm.mjs` has SHA-256 `8d30577707d2098fd35a91061eb0e755d0708184b2f8dd0bc2ae7302a2523b26` (the WebAssembly inside it: `dfbf3cd117891ce7341dbabce564cdf70b5d2ff9e795c4a6154decce5901ba42`, 86 144 bytes). `pnpm test:vendor` checks it. On the test signal in `tests/speex/native.mjs`, its packets and decoded output, concealment included, are bit-identical to a native gcc 13.3 build of the same sources on x86-64 at qualities 0, 2, 4, 8 and 10.
