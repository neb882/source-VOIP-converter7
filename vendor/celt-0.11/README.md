# CELT 0.11 (WebAssembly)

This folder holds the codec for the `vaudio_celt` and `vaudio_celt_high` profiles. Source's engine CELT codecs are CELT 0.11 in a custom mode (see `tests/LEGACY_CODECS.md`), not the CELT layer of Opus.

- `celt-0.11.wasm.mjs`: the module, base64 encoded. It contains:
  - CELT from [mumble-voip/celt-0.11.0](https://github.com/mumble-voip/celt-0.11.0) at commit `e18de7747fb1655e66bf8d291560587036bfe53c`, float build with custom modes and with `OPUS_BUILD` defined, which compiles in the pitch pre-filter and post-filter. The game's `vaudio_celt` module is this source built this way (`docs/reports/W3-08-celt-encoder.md`). Without the filter the encoder is another encoder, and the decoder refuses every packet whose filter flag is set.
  - the musl 1.2.5 math functions it needs, at commit `0784374d561435f7c787a555aeab8ede699ed298`, and the small C library from `tests/libopus11/libc.c`

  The module has no imports, so it gives the same output in every browser. It exports the library's 16-bit entry points, `celt_encode` and `celt_decode`, which the game's module calls.
- `index.mjs`: `createCodec(rate, frameSize, { packetBytes, complexity })` returns a mono encoder and decoder pair: fixed-size packets, the decoder's own loss concealment, and `restart()` for a new talk spurt. As the game's module does, it sends request 8 (`CELT_RESET_STATE`) to the new encoder and decoder after creating them, gives the encoder 16-bit samples (the floats it is passed, rounded to nearest with ties to even and clamped) and returns the decoder's 16-bit samples (as floats, / 32768).
- `COPYING.celt`: CELT license (BSD). `COPYRIGHT.musl`: musl license (MIT).

To rebuild the module, run `node tests/celt011/build.mjs`. It needs git, clang with the wasm32 target, and wasm-ld; no Emscripten. `node tests/celt011/build.mjs --native` compiles the same sources natively and compares the two builds on test signals; the hashes it gives are recorded in `tests/opus.verify.mjs`.

Built with Ubuntu clang 18.1.3, `celt-0.11.wasm.mjs` has SHA-256 `37b5677f5dd77a2a91bd007b2a7cb6981115ca27c5f704327f9667797977b2c4` (the WebAssembly inside it: `ea0b7d3da08561b9b8609f51553b9f59bf8a75491a3d885f06728684a22ad25b`, 119 141 bytes). `pnpm test:vendor` checks it.
