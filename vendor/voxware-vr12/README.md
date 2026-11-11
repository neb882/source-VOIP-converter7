# Voxware VR12 (WebAssembly)

This folder holds the codec of the engine's `vaudio_miles` module: Voxware's MetaVoice VR12, a harmonic vocoder at
8000 Hz, which the module reaches through a Miles Sound System plug-in. **It is a codec of the engine family, not one
a TF2 player can hear: current TF2 ships the module, Miles and the plug-in in its 32-bit folder and refuses the
name** ("Voice_Init Failed: invalid voice codec vaudio_miles.", `tests/REFERENCE_2026.md` finding 31). Nothing in the
app loads it yet; a profile is a later order (W3-20b), once the rate an engine gave this codec is known.

## Where it comes from

`vr12.c`, `vr12.h`, `vr12_tables.h` and `LICENSE` are taken unchanged from
[coffeegrind123/voxware-vr12](https://github.com/coffeegrind123/voxware-vr12) at commit
`eedf465fd0de65ae28fcc11e2457e7ee01decc22`, under its MIT licence (`LICENSE`, copyright 2026 coffeegrind123). Its
author reverse-engineered the encoder and decoder from an older copy of the plug-in. **Its tables
(`vr12_tables.h`) are the codec's codebooks and windows as its author published them.** We changed nothing in these
four files (`tests/vr12.verify.mjs` checks their SHA-256), added nothing to them from the owner's files, and took
nothing else from that project: not its README, its tools or its test vectors. What the project says about the game is
not used here: the wrapper below was read from the owner's own copy of the game's module, and every claim here about
the game rests on the owner's own files, read or run in a CPU emulator.

The three rulings this rests on (2026-11-11; the owner left them to the orchestrator, and each is the owner's to
reverse):

1. **Vendored as third-party code**, in this folder of its own, under its licence, with this README. Removing the
   folder (and `tests/vr12`) undoes it.
2. **Within one step now, exact later.** The decoder is shipped as published: it gives the plug-in's samples to
   within one step (below). Making it exact is a later order of its own.
3. **The encoder's start.** The game's wrapper encodes one block of uninitialised memory when it starts, so the
   game's own first frames are not defined by its code. This build encodes one block of zeros there, as the vectors
   do.

## What is here

- `voxware-vr12.wasm.mjs`: the module, base64 encoded. It contains `vr12.c` (with `vr12_tables.h`), the wrapper in
  [`tests/vr12/api.c`](../../tests/vr12/api.c), the small C library from `tests/libopus11/libc.c`, and the musl 1.2.5
  math functions the codec calls (cos, sin, acos, pow, log10 and their helpers), at commit
  `0784374d561435f7c787a555aeab8ede699ed298`. It has no imports, so it gives the same output in every browser.
- `index.mjs`:
  - `createCodec()` is the wrapper's frame codec: `{ frameSize: 360, packetBytes: 12, sampleRate: 8000, encode,
    decode, reset, free }`. `encode` takes an `Int16Array` of 360 and gives 12 bytes; `decode` takes 12 bytes and gives
    an `Int16Array` of 360.
  - `createFramer(codec)` is the wrapper's Compress and Decompress: `compress(samples, final)` keeps what does not
    fill a frame, writes whole 12-byte frames end to end with no header, and on the final call pads a part frame with
    zeros and codes it; `decompress(bytes)` decodes as many whole 12-byte frames as fit (11 bytes give nothing, 13
    give 360 samples).
  - `createPluginEncoder()` and `createPluginDecoder()` are the plug-in level, for the tests: one 180-sample frame of
    full 16-bit input to 6 bytes and back, no wrapper.
- `COPYRIGHT.musl`: musl's licence (MIT).

## The wrapper

Read from the owner's copy of the game's `vaudio_miles.dll` and checked by running it in a CPU emulator
(`tests/LEGACY_CODECS.md`, `vaudio_miles`):

- **A frame is 360 samples in and 12 bytes out:** two VR12 frames of 180 samples and 6 bytes. At the codec's 8000 Hz
  that is 45 ms and 2133 bit/s on the wire (the plug-in states 1244).
- **Before the codec each sample is cut to its top 8 bits:** the wrapper keeps the high byte, and the plug-in reads it
  back sign-extended and shifted left by 8. **Nothing is done to decoded samples.**
- **Start:** the encoder first encodes one block of 360 samples whose 12 bytes are thrown away (zeros here); the
  decoder is untouched.
- **Reset:** twice over, 360 zero samples are encoded and the 12 bytes that come out are decoded. Nothing is cleared,
  so what follows still depends on what came before.
- **No lost frame:** the wrapper has no path for one (given no data, it copies its 12 bytes from address 0; whether
  the engine ever does that was not read), so the module offers none.

## Build and tests

To rebuild the module, run `node tests/vr12/build.mjs`. It needs git, clang with the wasm32 target and wasm-ld; no
Emscripten. It compiles the files in this folder as they are, `-O2 -ffp-contract=off -fno-builtin`, no fast-math (the
`-fno-builtin` keeps the compiler from folding or merging math calls, so every call reaches musl's function), and
clones musl at the pinned commit. Two builds, one from a fresh clone, gave the same bytes.

Built with Ubuntu clang 18.1.3, `voxware-vr12.wasm.mjs` has SHA-256
`06208740325ec9719763a3a6e790a57b1e5b2054d65e9d70fb2a46a4dad2e027` (the WebAssembly inside it:
`21fb135230d683f54ab24f577a0b8fbfe2144694cbfd7be7ed2505698f4b3840`, 77 361 bytes). `pnpm test:vendor` checks it.

`node tests/vr12/native.mjs` builds the same sources natively, with musl's math compiled natively from the same
checkout and no system libm, runs both builds over a folder of vectors and compares them bit for bit.
`node tests/vr12/mutations.mjs` breaks each fact of the wrapper in turn and lists the checks that fail.

What the tests show (`tests/vr12.verify.mjs`, on the committed vectors `tests/vr12/vectors`: the tones, noise and
clipped signals; the figures for all eight signals the plug-in and the wrapper were run on are in
`docs/reports/W3-20a-miles-codec.md`):

- **The game's wrapper:** packets equal to the game's on every frame, before and after a reset (2,505 of 2,505 frames
  over the eight signals). Decoding the game's packets gives its samples to within one step everywhere (581,899 of
  582,120 samples equal on the seven signals whose sound was kept).
- **The plug-in alone:** packets equal to the plug-in's but for five known frames (5,005 of 5,010; three in `tones`,
  two in a voice signal, each 12 to 17 bits apart, the frames after equal again); decoding gives its samples to within
  one step (581,800 of 582,120).
- **A native build** of the same sources and math (gcc 13.3, x86-64, SSE2) gives the same packets and samples bit for
  bit on all eight signals.
- Each fact of the wrapper has a check that fails when it is broken.

The plug-in is x87 code that inherits the caller's precision. It gives the same output at 53-bit and at 64-bit
precision on every vector, so this build's double arithmetic needs nothing more (measured).

Not known: the rate an engine that accepted the codec gave it, and what a listener heard for a lost frame.
