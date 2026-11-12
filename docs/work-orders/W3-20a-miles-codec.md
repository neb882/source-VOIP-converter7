# W3-20a: the Miles voice codec (Voxware VR12) as a module, with the game's wrapper

> **Status 2026-11-12: built and merged** at `69a92bf` (pull request #25). Report: `docs/reports/W3-20a-miles-codec.md`.

Order of 2026-11-11. The codec and its wrapper only: no profile, nothing on the page, no change to
`audio.js`, `constants.js` or `opus-codec.mjs`. The profile is W3-20b, which waits on what rate an
engine that accepted the codec gave it (the owner's older engine files).

## Background

`vaudio_miles` was the voice codec of the early Source engine and, as `voice_miles`, of the engine
before it. It is a wrapper around a Miles Sound System plug-in holding Voxware's MetaVoice VR12, a
harmonic vocoder at 8000 Hz. Current TF2 still ships the wrapper, Miles and the plug-in in its 32-bit
folder and refuses the name: its engine passes four codec names only (read; the owner's console says
"Voice_Init Failed: invalid voice codec vaudio_miles."). So it is a codec of the engine family, not one
a TF2 player can hear today, and every doc line about it says so.

A public implementation exists: `coffeegrind123/voxware-vr12` (MIT, commit
`eedf465fd0de65ae28fcc11e2457e7ee01decc22`), a C encoder and decoder its author reverse-engineered from
an older copy of the plug-in. An investigation ran the owner's real plug-in and the game's real wrapper
in a CPU emulator on signals of our own and scored that implementation against them (the input file has
the detail):

- through the game's wrapper its packets are the plug-in's on 2,505 of 2,505 frames, before and after
  a reset; its decoder gives 901,561 of 901,800 samples, never more than one step off;
- the plug-in is x87 code that inherits the caller's precision, and gives the same output at 53-bit and
  at 64-bit precision on every vector, so nothing needs 80-bit arithmetic.

## The owner's rulings (delegated to the orchestrator, 2026-11-11)

1. **The implementation is vendored as third-party code** under its licence, in a folder of its own
   with a README of ours stating where it comes from, at which commit, what was changed, and that its
   tables are the codec's codebooks and windows as its author published them. Nothing from the owner's
   files is added to it by us. Only `vr12.c`, `vr12.h`, `vr12_tables.h` and `LICENSE` are taken: not its
   README, tools or test vectors (the vectors hold a game's voice lines; the README states things this
   project does not take from it).
2. **Within one step now, exact later.** This order ships the decoder as published. Making it exact
   (the plug-in's two transforms, and one smaller difference before them) is a later order of its own.
3. **The encoder's start.** The game's wrapper encodes one block of uninitialised memory at start-up,
   so the game's own first frames are not defined by its code. The module encodes one block of zeros
   there, as the vectors do, and the docs say so.

## Inputs (private scratch; read them, commit only what is listed below)

`<scratch>/agents/w3-20a/in/`:

- `voxware-vr12/`: the four files to vendor.
- `WRAPPER-AND-VECTORS.md`: the wrapper as read from the game's module and run, the x87 facts, how the
  vectors were made, the scores. The wrapper is built from this, not from anything else.
- `vectors/`: for eight signals of our own, `<signal>.s16` (input, 8000 Hz 16-bit mono), `.asi.v12`
  and `.asi.pcm` (the plug-in alone: new streams, 16-bit input, 6-byte codec frames), `.game.v12` and
  `.game.pcm` (the game's wrapper: start-up block of zeros, 12-byte frames, one reset after frame
  floor(frames / 2)), with `SHA256SUMS`, `summary.json` and `score.txt`. These are measurements and may
  be published.
- `gensig.py`: how the synthetic signals were made (for the vendor README's description; not committed).

## What to build

1. **`vendor/voxware-vr12/`**: the four files unchanged, a README, and the built module
   `voxware-vr12.wasm.mjs` with an `index.mjs`, in the manner of `vendor/speex-1.0.2/` (read its build,
   `tests/speex102/build.mjs`, and follow it: clang to `wasm32`, `-O2 -ffp-contract=off`, no fast-math,
   musl's math built in so that a native twin and the WebAssembly build call the same routines; pinned
   sources; two builds byte-identical).
2. **The wrapper**, in C beside a small `api.c` or in `index.mjs`, whichever keeps it testable, written
   from `WRAPPER-AND-VECTORS.md`:
   - a frame is 360 samples in, 12 bytes out: two codec frames of 180 samples and 6 bytes;
   - before the codec each sample is cut to its top 8 bits (the high byte, sign-extended, times 256);
   - nothing is done to decoded samples;
   - create: the encoder first encodes one block of 360 zero samples, whose 12 bytes are thrown away;
     the decoder is untouched;
   - reset: twice over, encode 360 zero samples and decode the 12 bytes that come out; nothing is
     cleared;
   - compress keeps left-over samples until 360 are there, whole frames end to end with no header; with
     a final flag a part frame is padded with zeros; decompress decodes as many whole 12-byte frames as
     fit;
   - a lost frame has no path in the game's wrapper: expose none (the profile's order decides what the
     app plays).
   The interface also exposes the plug-in level (one 180-sample frame to 6 bytes and back, full 16-bit
   input, no wrapper) for the tests.
3. **`tests/vr12/`** with `build.mjs`, `native.mjs` (a native twin of the same sources and math, for a
   bit-for-bit comparison with the WebAssembly build) and `vectors/`: a subset of the input vectors under
   1.5 MB in all, chosen so that every check below has at least two signals, with their `SHA256SUMS`
   checked by the test as `tests/speex102.verify.mjs` checks its own.
4. **`tests/vr12.verify.mjs`**, added to `test:all` and to CI as the other suites are:
   - game level: packets equal to `.game.v12` on every frame, before and after the reset; decoded
     samples from `.game.v12` within 1 of `.game.pcm` on every sample, with the count of samples that
     differ recorded as a literal per signal (so a change in either direction is noticed);
   - plug-in level: packets against `.asi.v12`, with the known unequal frames recorded as literals
     (the input file lists them: three in `tones`, two in `project-voice-input`); decoded samples
     within 1 of `.asi.pcm`;
   - the wrapper's facts each shown by a test that fails when the fact is broken: the 8-bit cut, the
     start-up block, the reset as two blocks through both halves, left-overs and the final flag, 11 and
     13 bytes to decompress;
   - native and WebAssembly builds give the same packets and the same decoded samples, bit for bit, on
     every committed vector (if they do not, stop and report where they part: that is a finding about
     the math library, not something to tune);
   - the module's hash in `tests/vendor-opus.mjs` or wherever the vendored modules' hashes are kept.
5. **`sw.js`**: the two new vendor files are NOT added to its list and `CACHE` does not change: nothing
   loads the module yet. Say so in the report.

## Docs

- `vendor/voxware-vr12/README.md`: provenance (above), the build, what the tests show, the label
  ("a codec of the engine family; current TF2 ships it and refuses it"), the three rulings.
- `tests/LEGACY_CODECS.md`: a section `vaudio_miles` with the numbers (8000 Hz codec, 360 samples and
  12 bytes a frame, 2133 bit/s on the wire, the 8-bit cut, the start-up block, the reset, no loss path),
  each marked read or measured as the input marks it, the scores, and what is not known (the rate an
  engine gave it; nothing of how a lost frame sounded).
- `tests/REFERENCE_2026.md`: one bullet in finding 31.
- Report: `docs/reports/W3-20a-miles-codec.md`.
- No addresses of the owner's modules are needed in public docs; if one is given it is given as an
  address only. Nothing of the modules themselves goes anywhere. No model names, no owner names.

## Stop and report instead of guessing if

- the WebAssembly build's packets differ from the vectors on any game-level frame, or its decoder is
  more than one step off anywhere;
- the native and WebAssembly builds differ;
- the wrapper as described cannot reproduce `.game.v12` from `.s16`.
