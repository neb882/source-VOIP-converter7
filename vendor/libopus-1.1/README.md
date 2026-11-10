# libopus 1.1.5 (WebAssembly)

This folder holds the codec for the Steam profile. Steam's own voice packets match libopus 1.1.x: frame sizes, DTX decisions, and decoded spectrum and comfort noise (see `tests/REFERENCE_2026.md`, finding 16). The other profiles keep libopus 1.6.1 from `../libopus`.

- `libopus-1.1.5.wasm.mjs`: the module, base64 encoded. It contains:
  - libopus 1.1.5 at commit `d3977edab4cbfeafd3650b572c78711e0b04a5f8`, float build without SIMD
  - the musl 1.2.5 math functions it needs, at commit `0784374d561435f7c787a555aeab8ede699ed298`

  The module has no imports, so it gives the same output in every browser.
- `index.mjs`: a loader with the subset of the libopus-wasm API that `opus-codec.mjs` uses, and the library's 16-bit decoder (`decodeInt16`, `decodePacketLossInt16`, returning an `Int16Array`), which Steam's decoder calls. In this float build `opus_decode` runs the library's soft clipper over the decoded frame, with memory kept in the decoder, then rounds each sample to 16 bits.
- `COPYING.opus`: libopus license (BSD). `COPYRIGHT.musl`: musl license (MIT).

To rebuild the module, run `node tests/libopus11/build.mjs`. It needs git, clang with the wasm32 target, and wasm-ld; no Emscripten.

Built with Ubuntu clang 18.1.3, the module's SHA-256 is `a753f6b88d215f710568299c4f4aa9cca081735efbf7f983e017346482649f3d` (308,481 bytes of WebAssembly). Its exports are the float encoder and decoder and, since W3-11a, `opus_decode`; nothing else changed then, and the float path gives the same packets and samples as the earlier build (`b7a03edb…`, which the script still gives with the old export list; `tests/opus.verify.mjs` holds the hashes). On the SourceTV test packets its output is bit-exact with a native gcc build of the same release, and `node tests/libopus11/native.mjs <checkout>` compares its 16-bit decoder with a native gcc build sample for sample. Where `github.com` cannot be reached, give the build a checkout of `https://gitlab.xiph.org/xiph/opus.git` at the tag `v1.1.5`.
