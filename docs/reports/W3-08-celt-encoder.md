# W3-08: why the app's CELT does not give the game's samples

Investigation only: no app code changed. Each claim is marked **read** (from the owner's `vaudio_celt.dll` or
`engine.dll`, or from the public CELT source), **shown** (by the Set H recordings) or **inferred**.

## The answer

The game's module is the same CELT source the app bundles (the public tree at its last commit), **built with the
pitch pre-filter and post-filter compiled in**. The app's build has them compiled out, which makes a different
encoder and a decoder that cannot read the game's packets. With that one build switch, the encoder reset the module
performs after creating the codec, and the input taken as the engine takes it, the app's own WebAssembly build
method reproduces the game's decoded output:

| Recording | Mode and packet | Samples | Identical | Largest difference |
| --- | --- | ---: | ---: | ---: |
| `celt_gain1.wav` (`vaudio_celt`) | `celt_mode_create(22050, 512)`, 64 bytes | 292,352 (all 571 packets) | 292,351 | 1 (one sample, in packet 201) |
| `celthigh_gain1.wav` (`vaudio_celt_high`) | `celt_mode_create(44100, 1024)`, 128 bytes, fed the 22050 Hz sound | 292,864 (all 286 packets) | 292,789 | 1 (75 samples, in packets 20, 88, 99, 100, 102) |

That is 125.6 dB and 106.9 dB against the game, where the bundled build reaches 17.7 and 17.8 dB. A native gcc
build gives the same figures, sample for sample. The differences left are rounding in the last bit (see "What is
left").

Four things were wrong or missing in the first comparison, in order of size:

1. **The build switch** (17.7 dB to 82 dB). Read and shown.
2. **Where the file starts.** The engine's reader for `voice_inputfromfile` skips the first 4 bytes of the sound,
   so the encoder's first frame starts at the file's third sample. Read and shown. This is the "2 samples early"
   seen before. Without it nothing matches, whatever the build.
3. **The reset after creation** (82 dB to 125.6 dB on `vaudio_celt`). The module sends `CELT_RESET_STATE` to the
   new encoder. In a float build that leaves one encoder variable at 1 where creation left it at 256, which changes
   the first packets of sound after a start. Read and shown.
4. **Rounding to 16 bits.** The module calls the library's 16-bit entry points; the decoder's output is rounded to
   the nearest integer with ties to even. Read and shown (the game agrees with ties-to-even at 109 of the 112
   exact ties in the two recordings; the other three are among the last-bit differences).

The complexity (5, the library's default, as W3-03 read) is right, but the recordings cannot tell 5 from 10: the
only thing complexity 5 and above adds is the pitch filter, so 5 to 10 give identical output, and 0 to 4 give the
17.7 dB of a build without it.

## What the module shows (read)

`vaudio_celt.dll`, 64-bit, SHA-256 `255cf083…e07a66e`, read statically; addresses are in that file.

- **Set-up** (`0x180001ee0`): a quality number below 5 indexes the table at `0x18003E008`
  (`{44100, 256, 120}`, `{22050, 120, 60}`, `{22050, 256, 60}`, `{22050, 512, 64}`, `{44100, 1024, 128}`). Then
  `celt_mode_create(rate, frame, &error)`, `celt_encoder_create_custom(mode, 1, NULL)`,
  `celt_decoder_create_custom(mode, 1, NULL)`, and **request 8 (`CELT_RESET_STATE`) to the encoder and to the
  decoder** (`0x180001f79`, `0x180001f89`). No other control request anywhere in the module: complexity, bit rate,
  VBR, prediction and loss percentage are never set. The codec's reset function (`0x180001fc0`) sends request 8 to
  both again, and the engine calls the codec's reset each time recording starts (`engine.dll`, `0x180059e7a`, in the
  function at `0x180059df0`).
- **Encode** (`0x180001e50`): `celt_encode(encoder, pcm, frame, buffer, packet)`, the 16-bit entry point, with the
  frame and packet sizes of the table row; then the packet bytes are copied out. Nothing is added, stripped or
  reordered.
- **Decode** (`0x180001db0`): the packet is copied to a local buffer and given to
  `celt_decode(decoder, buffer, packet, pcm, frame)`, 16-bit output. With no data the decoder is called with a null
  pointer (the library's concealment).
- **Framing** (`0x1800018b0`, the frame wrapper around the codec): whole frames only, the remainder kept for the
  next call, the last frame padded with zeros when the call is flagged final. Frames are coded in sequence by one
  encoder: they are not independent.
- **A float build.** `celt_encode` is a thunk into a function that converts 16-bit samples to float (multiplying by
  1/32768) and calls the float encoder; the fixed-point build is laid out the other way round.
- **Which source.** The encoder's control function handles requests 2 to 20 and 10000, 10001, 10003 and 10004.
  Request 20 (`CELT_SET_LOSS_PERC`, limit 100, stored at offset `0x40`) exists only from the commit of 2011-04-21
  that added it. The structure offsets and the reset's four assignments match the last commit's source.
- **The build switch.** Requests 10003 (`CELT_SET_SIGNALLING`) and 10004 (`CELT_GET_MODE`) are compiled only under
  `OPUS_BUILD` in the public source (`celt.c`, the two `#ifdef OPUS_BUILD` blocks in the control functions), and
  `OPUS_BUILD` defines `ENABLE_POSTFILTER` (`celt.c` and `pitch.c`, "Always enable postfilter for Opus"). The comb
  filter's table of nine tap gains (0.3066…, 0.2170…, 0.1296…; 0.4639…, 0.2681…, 0; 0.7998…, 0.1001…, 0), which the
  source has only inside `#ifdef ENABLE_POSTFILTER`, is in the module at `0x18002D5F0`, referenced from the code at
  `0x180008622`.
- **The second module.** The owner's 32-bit module from another Source game (SHA-256 `4d142d06…0fd8a294`) agrees
  on every point above: the same five-row table, the same three creation calls, request 8 to both and nothing
  else, `celt_encode` and `celt_decode`, the same control requests (2 to 20, 10000, 10001, 10003, 10004),
  complexity 5 written at creation, and the comb filter's table present. It is not the build the recordings were
  made with.

`engine.dll`, the sender's side:

- **The file reader** (`0x18005bb10`): after reading the data length at offset `0x28` it reads **four more bytes
  and discards them** (`0x18005bc00`), then reads the data. So the sound is taken from offset `0x30`, two samples
  into a plain 44-byte-header file. (W3-03's report says offset `0x2C`: that is the one correction to it here.) It
  still asks for the full data length, so the buffer's last four bytes are not from the file. Inferred: they are
  whatever the allocator returned, which would explain why the last packet differed between two key presses; in
  `celt_gain1.wav` and `celthigh_gain1.wav` the last packet matches a build fed zeros there.
- **The feed** (`0x180058d80`): each tick it takes `min(elapsed time x rate, what is left, 8192)` samples from the
  file, in order, and gives them to the codec's `Compress`. Nothing is done to the samples on the way. The file is
  consumed contiguously whatever the frame rate.

## What the recordings show

Method: each candidate was built natively (gcc 13.3, `-O2 -ffp-contract=off -DCUSTOM_MODES -DVAR_ARRAYS
-DHAVE_LRINTF`) from the public tree's history, run over `voice_input.wav` from its third sample through
`celt_encode` and `celt_decode` with request 8 sent first, and compared with the game's recording at zero lag. The
table leaves the last packet out of the count (291,840 samples); the figures in "The answer" include it.

Before any codec was right, the recording itself gave two facts: the game's output is the input delayed by exactly
62 samples at every frequency where there is signal (the codec's own delay is 64), and it follows the input 2.7 dB
better than the bundled build does (21.5 against 18.8 dB over the sounding packets; 28 to 36 against 25 to 29 dB
on steady voiced packets). An encoder that is better on pitched sound at the same packet size is what the pitch
filter is for.

| Candidate | `vaudio_celt` | `vaudio_celt_high` |
| --- | --- | --- |
| **Last commit (`e18de77`), post-filter in, reset sent, defaults** | **291,839 identical, largest 1, 125.6 dB** | **291,765 identical, largest 1, 106.9 dB** |
| The three commits before it (`cb73e5c`, `9c3dc6b`, `eda2dee`, all 2011-04-21), same | the same output | the same output |
| `6965388` (2011-04-21) back to `e6acfe0` (2011-03-11), 12 commits (0.11.2 to 0.11.4), post-filter in | 36.0 dB | 34.1 dB |
| `86da2c8` (2011-03-11) back to `d922fe1` (2011-02-03), 11 commits (0.11.0 to 0.11.2), post-filter in | 26.5 dB | 26.2 to 26.3 dB |
| Last commit, post-filter in, **no reset** after creation | 82.2 dB, largest 13, packets 22 to 30 only | the same output as with the reset |
| Last commit, post-filter in, complexity 6, 8, 10 | the same output as 5 | the same output as 5 |
| Last commit, post-filter in, complexity 0, 3, 4 | 17.5 to 17.7 dB | 17.6 to 17.8 dB |
| Last commit, post-filter in, input from sample 0, 1, 3 or 4 (lag adjusted) | 18.6 to 19.1 dB | not run |
| Last commit, post-filter in, mode rate 48000 for the 1024 frame | | 19.9 dB (22050 and 32000: the library refuses the mode) |
| Last commit, post-filter in, relaxed float arithmetic (`-ffast-math`, reassociation, fused multiply-add; gcc and clang) | 34.8 to 37.2 dB | 29.9 to 43.1 dB |
| **Last commit, post-filter out (the bundled build)**, any complexity 0 to 10 | 17.5 to 17.7 dB | 17.8 dB (complexity 5 only) |
| Post-filter out: 16 commits back to 0.11.0 | 17.6 to 17.7 dB | not run |
| Post-filter out: prediction off, VBR, constrained VBR, loss 5 and 10, bit rate 22050 and 44100 | 17.7 to 17.8 dB | not run |
| Post-filter out: mode rate 24000, 32000 (44100 and 48000 decode to noise at this frame size) | 17.6 dB | |

What the table settles:

- **The version** is the tree from `eda2dee` on. That commit changed the choice between intra and inter energy
  coding, and everything before it is 36 dB or worse. The three commits after it change only a value that is unused
  at complexity 4 and above with no loss percentage set (read in `quant_bands.c`), and the last commit adds a text
  file. So the pinned `e18de7747fb1655e66bf8d291560587036bfe53c` is right, and it is what the control requests in
  the module say too. (The repository carries no release tags; `configure.ac` at this commit says 0.11.4, and the
  history stops there because the work moved to Opus.) CELT 0.10 and 0.9 were not tried: there was no need.
- **Nothing was fetched.** The earlier investigator's checkout of the pinned repository has the full history.
- **The game's arithmetic is strict single precision.** Letting the compiler reorder sums or fuse a multiply with
  an add changes packets and drops the match to 30 to 43 dB, so the remaining differences are not that. (`-O3`,
  reciprocal and finite-only maths change nothing.)

## The WebAssembly build

`tests/celt011/build.mjs` was run from a scratch copy that differs only in taking extra flags and an output path
from the environment. With no extra flag it reproduces the recorded build exactly (`celt-0.11.wasm.mjs`
`6f2522f5…c756e5`), with Ubuntu clang 18.1.3 and the same pinned musl. With **`-DOPUS_BUILD`** added to the CELT
flags:

- the WebAssembly is 117,699 bytes, SHA-256 `71dad0a9eb5c658d8ca7585addfd1018965e09b720cd2778073a19e73ef5ffcc`
  (the `.wasm.mjs` hash depends on its header comment, which the order will reword);
- its packets are byte for byte those of the native build for both recordings' input (checked with the reset for
  both modes, and without it for `vaudio_celt`);
- with the reset it gives the figures in "The answer".

`-DENABLE_POSTFILTER` alone gives the same codec (WebAssembly `74de1ac9…`); `-DOPUS_BUILD` is what the module was
built with and adds only the two extra control requests. With `celt_encode` and `celt_decode` also exported
(118,654 bytes, `81c0fe36…73dcc`), the 16-bit entry points give the same result as the float ones plus
ties-to-even rounding.

**The bundled decoder cannot read the game's packets.** Built without the switch, the decoder returns
`CELT_CORRUPTED_DATA` (-4) for any packet whose post-filter flag is set (read in `celt.c`; shown: the bundled
build's decoder fails on the packets that reproduce the game's output, and the rebuilt decoder turns them into the
game's samples). So `demo.js` cannot at present decode real `vaudio_celt` voice wherever the speaker's voice is
pitched.

## What is left

- **One sample in `vaudio_celt`, 75 in `vaudio_celt_high`, each off by one.** In `vaudio_celt` the build's
  unrounded value is 0.0002 from a rounding boundary. In `vaudio_celt_high`, three are exact ties where the game's
  value must have been a hair off, and 72 are in one packet and the overlap after it (packet 99, then the first 95
  samples of 100), up to 0.15 of a step from a boundary: one frame's decoded spectrum differing very slightly, with
  no trace afterwards. Inferred: last-bit differences between the game's compiler and C runtime (its `exp`, `log`,
  `cos`) and ours, once flipping a low-order choice in the encoder. Not reproducible without that compiler. To
  test: the same input through the game on another machine or the 32-bit build should give the same recording if
  it is the build, and a longer or louder input should show such packets at about the same rate (1 in 286 here).
- **The receiver's decoder across spurts.** The engine resets the sender's codec at each recording start (read).
  Whether the receiving side's decoder is reset or recreated between spurts was not read: Set H is one spurt. The
  app recreates both per spurt.
- **The microphone path** was not exercised: Set H used the file input. The read shows the same `Compress` call
  for both, and the two-sample skip belongs to the file reader only.
- **The three last functional commits** cannot be told apart by any recording made at the game's settings.
- **`tests/LEGACY_CODECS.md` says three public decoders read CS:GO voice with "a plain CELT 0.11 decoder".** They
  must be building with the post-filter in; their build files were not checked.

## Changes for order W3-06, and the codec order after it

W3-06 as revised on main builds the settings and leaves `vendor/` alone, and says the build is an order of its
own that this report defines. Both follow.

**For W3-06 (nothing in it has to change before it is built):**

- **Complexity 5 stands, and so does the `vaudio_celt_high` mode** (44100 Hz mode, 1024 samples, 128 bytes, on
  22050 Hz sound), now confirmed sample for sample and not only by packet size. This report names no other
  complexity. The settings it adds (the reset, the 16-bit rounding) live in `vendor/` and belong to the codec
  order, so they are not a reason for W3-06 to stop.
- **Its complexity change cannot be seen in the sound of the bundled build.** Without the pitch filter,
  complexities 4 to 10 are one encoder (read: the library tests complexity only for 0, above 1, at least 3, at
  least 4 and, for the filter, at least 5; shown: identical packets at 4, 5 and 10 for both modes on the Set H
  input). So the `celt_22` golden hash should not move in W3-06, the PREDICTIONS figure for "complexity 10 against
  5" is exactly 0 dB, and "complexity left at 10" can only be caught through `codecInfo`, not through samples.
  The difference appears with the codec order: there 5 to 10 are again one encoder, and 4 and below another.
- **Its texts** can now say what the cause is in place of "W3-08 is finding the cause": the game's build has the
  pitch pre-filter and post-filter, the bundled one does not; the game's packets with the filter on cannot be
  decoded by the bundled decoder.

**The codec order (new; it changes a pinned build, so it is an order of its own):**

1. **Pinned source: unchanged** (`mumble-voip/celt-0.11.0` at `e18de7747fb1655e66bf8d291560587036bfe53c`).
   **Build: add `'-DOPUS_BUILD'`** to `cflags` in `tests/celt011/build.mjs`, rebuild, and record the new hashes in
   `tests/vendor-opus.mjs` and `vendor/celt-0.11/README.md` by the existing procedure. Expected WebAssembly with
   the present export list and Ubuntu clang 18.1.3: 117,699 bytes, `71dad0a9…ef5ffcc`. The header comment and
   `version` string should say the post-filter is in.
2. **Reset after creation:** in `vendor/celt-0.11/index.mjs`, `open()` sends request 8 to the new encoder
   (`x.cc_encoder_set(encoder, 8, 0)`; the request takes no argument and ignores the extra one). `restart()`
   recreates and so resets, which is the state the engine's reset leaves (inferred from the source: the reset
   clears everything creation clears and sets four values). The decoder's reset changes nothing after creation.
3. **16-bit in and out.** The game's encoder is given 16-bit samples and its decoder returns 16-bit samples rounded
   to nearest, ties to even, clamped. Either export `celt_encode` and `celt_decode` and use them (checked: they
   work in the WebAssembly build and give the same match), or keep the float calls, feed them `int16 / 32768`, and
   round the output as `celt_decode` does (`Math.round` is wrong at ties: it differs from the game at about 25
   samples in each 13 s recording). The gain stage after it (W3-05) is defined on those integers. Where the app
   rounds its float input to 16 bits before the encoder is the order's to decide; the game's capture is 16-bit.
4. **`demo.js`:** with the rebuilt decoder a `vaudio_celt` demo decodes; before it, packets with the pitch filter
   on are rejected. The demo test should include packets made by the rebuilt encoder from a pitched tone, which
   the old build fails to decode.
5. **Public tests that fail without the fix:** a harmonic tone (say 200 Hz with overtones) at 22050 Hz through
   `celt_22` is reproduced several dB better than the old build managed (take the threshold from the two builds);
   an encoder with and without request 8 gives different packets for the first sounding frames after a silent
   start; decoded samples at exact ties round to even. The golden hashes of both CELT cases are re-recorded.
6. **`tests/LEGACY_CODECS.md` and the README:** the post-filter build; the reset; the two-sample skip of
   `voice_inputfromfile` (for anyone repeating Set H); both profiles' codec stage "reproduces the game's decoded
   samples but for 76 of 585,216, each off by one" in place of modelled.
7. **`tests/predictions/PREDICTIONS.md`:** P1 and P2 were rendered with an encoder without the pitch filter, 2.7 dB
   further from the input than the game's on the Set H signal; the codec file changed after registration.
8. **For `tests/REFERENCE_2026.md`** (the orchestrator's to write): Set H's codec result, with the table in "The
   answer", and the correction to W3-03 (the file's sound is read from offset `0x30`).

## The private check

The script below is `scripts/check.mjs` in this order's scratch folder; the rebuilt module and a copy of
`index.mjs` with point 2 applied are in `wasm/opus/` there. It needs the private takes folder (the one holding
`to-run/` and `set-H-celt-file-input/`) and nothing else.

```sh
node scripts/check.mjs wasm/opus <takes folder>     # in the scratch folder
node check.mjs <repo>/vendor/celt-0.11 <takes folder>   # after W3-06
```

Expected, exactly:

```
vaudio_celt: game 292352 samples (571 packets), this build 292352; identical 292351 of 292352, largest difference 1, SNR 125.6 dB, packets that differ: 201
vaudio_celt_high: game 292864 samples (286 packets), this build 292864; identical 292789 of 292864, largest difference 1, SNR 106.9 dB, packets that differ: 20 88 99 100 102
```

On the build bundled today it prints 134,456 of 292,352 identical at 17.7 dB (320 packets differ) and 128,053 of
292,864 at 17.8 dB (175 packets). With `--more` it adds complexity 10 (the same as the first line) and complexity
4 (17.7 dB). If the scratch folder is gone: rebuild with point 1, apply point 2, and save this as `check.mjs`.

```js
// node check.mjs <folder holding index.mjs and celt-0.11.wasm.mjs> <takes folder> [--more]
// The encoder gets the file from its third sample on (the engine's reader skips 4 bytes of sound), in whole
// frames padded with zeros, at the library's default complexity (5); the decoded floats are rounded to int16 as
// the library's celt_decode does (to nearest, ties to even, clamped).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const dir = path.resolve(args[0]), takes = args[1];
const { createCodec } = await import(pathToFileURL(path.join(dir, 'index.mjs')).href);
const wav = f => { const b = fs.readFileSync(f); return new Int16Array(b.buffer, b.byteOffset + 44, (b.length - 44) >> 1); };
const toInt16 = x => { const v = x * 32768, r = Math.round(v); const t = (r - v === 0.5 && (r & 1)) ? r - 1 : r; return Math.max(-32768, Math.min(32767, t)); };
const input = wav(path.join(takes, 'to-run/voice_input.wav'));
async function run(name, file, rate, frame, bytes, options = {}) {
  const game = wav(path.join(takes, 'set-H-celt-file-input', file));
  const codec = await createCodec(rate, frame, { packetBytes: bytes, complexity: options.complexity ?? 5 });
  const start = 2, packets = Math.ceil((input.length - start) / frame);
  const mine = new Int16Array(packets * frame), buf = new Float32Array(frame);
  for (let p = 0; p < packets; p++) {
    for (let i = 0; i < frame; i++) { const j = start + p * frame + i; buf[i] = j < input.length ? input[j] / 32768 : 0; }
    const out = codec.decode(codec.encode(buf));
    for (let i = 0; i < frame; i++) mine[p * frame + i] = toInt16(out[i]);
  }
  codec.free();
  let same = 0, largest = 0, err = 0, sig = 0; const bad = new Set();
  const n = Math.min(game.length, mine.length);
  for (let i = 0; i < n; i++) { const d = game[i] - mine[i]; if (!d) same++; else bad.add(Math.floor(i / frame)); largest = Math.max(largest, Math.abs(d)); err += d * d; sig += game[i] * game[i]; }
  console.log(`${name}: game ${game.length} samples (${game.length / frame} packets), this build ${mine.length}; identical ${same} of ${n}, ` +
    `largest difference ${largest}, SNR ${err ? (10 * Math.log10(sig / err)).toFixed(1) + ' dB' : 'infinite'}, packets that differ: ${bad.size > 12 ? bad.size + ' of them' : [...bad].join(' ') || 'none'}`);
}
await run('vaudio_celt', 'celt_gain1.wav', 22050, 512, 64);
await run('vaudio_celt_high', 'celthigh_gain1.wav', 44100, 1024, 128);
if (process.argv.includes('--more')) {
  await run('vaudio_celt at complexity 10', 'celt_gain1.wav', 22050, 512, 64, { complexity: 10 });
  await run('vaudio_celt at complexity 4', 'celt_gain1.wav', 22050, 512, 64, { complexity: 4 });
}
```

The native route, for a second opinion: the pinned tree's `libcelt/*.c` (the 17 files `build.mjs` lists) compiled
with `gcc -O2 -ffp-contract=off -DCUSTOM_MODES -DVAR_ARRAYS -DHAVE_LRINTF -DOPUS_BUILD` and a 30-line harness
(`scripts/harness.c` and `scripts/build.sh` in the scratch folder) that makes the module's calls: mode, mono
encoder and decoder, request 8 to each, then `celt_encode` and `celt_decode` frame by frame from sample 2.
