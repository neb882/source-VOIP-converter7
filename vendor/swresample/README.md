# libswresample's 24000 to 44100 Hz step (JavaScript)

This folder holds the resampler of Steam's voice decoder. Steam hands each decoded packet of 24 kHz samples to
FFmpeg's libswresample at its default settings and gives the game what comes back at 44.1 kHz
(`docs/reports/W3-09-steam-voice.md`, section 4). This is that one path of the library, translated to JavaScript.

**It is a modified part of FFmpeg.** `swresample.js` was translated to JavaScript on 2026-11-10 for the TF2 Voice
Emulator from FFmpeg `n8.1.2`: `libswresample/swresample.c`, `resample.c`, `resample_template.c`, `audioconvert.c`,
`x86/resample.asm` and `libavutil/mathematics.c`. Only the path for mono 16-bit samples from 24000 to 44100 Hz at the
library's defaults is kept. The source was read from the release tarball `ffmpeg-8.1.2.tar.xz` (SHA-256
`464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`, from https://ffmpeg.org/releases/). The same
parts are unchanged in `n6.1.1` (`ffmpeg-6.1.1.tar.xz`, SHA-256
`8684f4b00f94b85461884c3719382f1261f0d9eb3d59640a1f4ac0873616f968`), the version the port was compared with.

## Files and licensing

- `swresample.js`: the port, a classic script (it sets `module.exports` under Node and `TF2Swresample` elsewhere).
  It is its own source: there is no build step. Its header keeps the copyright and licence lines of the FFmpeg files
  it comes from, as they stand there, and the notice of the Bessel function's Boost-licensed code.
- `COPYING.LGPLv2.1`: the GNU Lesser General Public License, version 2.1, as FFmpeg ships it.

Like the code it comes from, `swresample.js` is under the GNU LGPL, version 2.1 or later. It is a library of its own:
the app only calls the small interface below, and the file can be replaced by another build of the same interface.

## The interface

```js
const rs = TF2Swresample.createResampler({ kernel: 'fma3' }); // kernel is optional
const out = rs.packet(int16Samples24k); // an Int16Array at 44100 Hz
rs.reset();                              // a new stream: a new speaker, or a voice reset
```

- `packet()` is Steam's three calls per packet: ask the upper bound, convert, convert again with no input. The first
  packet of a stream comes out whole: that last call flushes, adding 16 samples after the packet as its mirror. Those
  16 samples stay in the stream, so everything after the first packet is 16 input samples (0.67 ms) late.
- `KERNELS` is `['fma3', 'avx', 'sse', 'c']`, `DEFAULT_KERNEL` is `'fma3'`. On x86 the library picks an assembly loop
  by the processor's features, and the four sum the 32 products in different orders, so they differ in the last bit
  of a few samples in ten thousand at full scale. Which one Steam runs on a given PC is not known: the default is what
  a current x86-64 processor picks (not confirmed on Steam; see `docs/work-orders/W3-14-steam-file-input.md`).
- The filter bank (147 phases of 32 float taps) is stored in the script as base64, not computed in the page, so the
  output does not depend on the browser's `Math.sin`. `tests/swresample/bank.mjs` computes it the library's way.

## Checks

- `node tests/swresample.verify.mjs` (in `pnpm test`): the sixteen reference hashes (four streams, four kernels) the
  native library gives, the counts per packet, the bank, the response and more.
- `node tests/swresample/native.mjs`: compiles a small C driver against the machine's libswresample
  (`libswresample-dev`), forces each kernel with `av_force_cpu_flags`, and compares with the port sample for sample.
  On libswresample 4.12.100 (FFmpeg 6.1.1, x86-64, a processor with FMA3) the port equals the library under all four
  kernels.
