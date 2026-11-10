# W3-17: the room effects as the engine does them

*Written 2026-11-10 from the two reads of the room DSP: `docs/reports/W3-15-room-dsp.md` (the first) and
`docs/reports/W3-17-room-dsp-second-read.md` (the second, independent; **it wins where they differ**). Revised
the same day after the plan's review (4 must-fix, 14 should-fix; all answered below) and after the second read
of the amplifier and the modulating delay, `docs/reports/W3-17-amp-mdy-second-read.md`, which corrects the
first: the water preset's amplifier does not swing. Below, "R2 a" to "R2 f" are the second read's sections,
"R1 1" to "R1 6" the first's, and "AM 0" to "AM 5" those of the amplifier's read.*

| Part | What | Files it touches | Starts after | Budget |
| --- | --- | --- | --- | --- |
| **W3-17a** | the room module: the table, the processors, a preset, the slot and its cross-fade, the voice's shares and entry, the room path, the tail's end | new files only | now; beside any order | 2 days |
| **W3-17b** | the automatic room in the module: the build from two templates, the named cases | the module's files only | W3-17a | 1 day |
| **W3-17c** | the render: `process()` and `createRender` use the module; the old processors go | `audio.js`, tests | **W3-10 merged**, and W3-17b; no other `audio.js` order open | 1.5 days |
| **W3-17d** | the page and the live chain: places, the extras group, the labels, saved settings | `app/`, `index.html`, `constants.js`, `live*.js`, `batch.js`, docs | W3-17c | 1.5 days |

**Kind:** code. `tf-builder` (effort xhigh for a and c, high for b and d), then `tf-reviewer`; the diffs of a,
b and c also get a second reader on the stronger model (they decide how a render is computed). **Branches:**
`claude/w3-17a-room-module`, `claude/w3-17b-auto-room`, `claude/w3-17c-room-render`,
`claude/w3-17d-room-page`, each from `main`. **Worktrees:** given in the brief. Parts a and b share only the
`test` line of `package.json` with other orders: a one-line merge.

## Why

A TF2 listener hears a voice through the map's room effect. The app's rooms are not the engine's: it mixes
45% wet where the engine sends 26/256 (R1 5, row 2: about 13 dB too wet), spreads the reverb's delays wrongly,
has no automatic room, which is what two soundscapes in three ask for (R1 4), and adds a 900 Hz filter under
water that the engine does not have. The reads give the engine's arithmetic to the formula. This order builds
it.

**No recording with a room exists.** Until one does, the room effects are "read from the engine, not yet
checked against a recording", and the page says so. "The owner's recording" below is the procedure that would
check them.

## Decisions of this plan

1. **The default stays "no room".** The owner's takes have flat tops at the full ceiling and a level within 1%
   of the full one (W3-07 section 1). A numbered preset would put the direct voice's flat tops at 229/256 and
   an automatic room in the open at 250/256 (R1 4). It is the flat tops that rule a room out: in a room with
   no diffusor first, the room path's own undelayed copy would restore most of the level. No evidence argues
   for another default. Why `dsp_room` was 0 there is not known; the owner's console readings would say.
2. **Four parts, one file.** Parts a and b add new files only, so they do not wait for the `audio.js` queue
   (W3-11a, W3-16, W3-11b, W3-02c, W3-02d, W3-02f with W3-02e, W3-02g, W3-10). Parts c and d come after
   W3-10. This also follows the owner's priority (the modern preset before the rooms).
3. **W3-10 owns the mix stage; this order changes only its entry.** W3-10 builds, in `audio.js`: the voice's
   entry at channel volume 255, where that entry sits against the mixer's upsampling of a 22050 or 11025 Hz
   voice (at the voice's own rate, before it: W3-07 section 1), the sum, the clip at +-32767, `volume`, the
   rounding and the device stage. Its entry is one function of the sample and the channel's volume, in the
   single-precision form of "The voice's entry" below. W3-17c changes one thing: with a room the voice is
   entered twice by **that same function** (the direct share and the room share of the volume), each buffer
   is upsampled by W3-10's rule, the room buffer passes the room slot, and the sum goes to W3-10's clip;
   under water the sum passes the water slot first. The module's own `entry` is the tested statement of the
   law: part c checks W3-10's function against it on every 16-bit sample. **W3-10 stays the last order that
   re-records every golden hash, and nothing is recorded twice.**
4. **"No room" means no slot, no tail and no new key.** A render with no room and not under water builds
   nothing of this order: no slot, no extra output, no new key in `codecInfo`. Every existing golden hash and
   info hash of such a render is unchanged (part c, first check).
5. **The table is generated, in a file of its own, as numbers.** The orchestrator's decision: the presets'
   parameters go in as numbers, as presets 0 to 29 already are in `constants.js` and as W3-15 gives them; the
   file's text and comments do not. `room-presets.js` is made by a converter the orchestrator runs privately
   on the game's file; the test holds the table's hash.
6. **The second reader's model is the oracle.** `tests/roomdsp/dspmodel.py` is the reference model as
   extended by the amplifier's read (`AMP` and `MDY` added; its self-test output equals the first model's).
   It is our own code, written from the reads before any build and by another hand than the builder's. CI
   stays Node-only: the model's outputs on the public table are recorded as hashes and tail lengths ("The
   reference"), as W3-13 recorded the native library's. The builder builds from the reports and may run the
   model; **the builder may not change it.** The reviewer writes a small model of its own from the reports'
   text (the plan's reviewer did: its model met all 43 non-modulating hashes).
7. **Random taps are seeded.** The engine draws from its shared random stream (R2 a4, AM 2, AM 3), which
   cannot be reproduced. The app draws `lo + floor(u x (hi - lo + 1))` with `u` from `mulberry32` (the
   generator of `audio.js`), one stream per slot: the room slot's seeded `(seed ^ 0x524F4F4D) >>> 0`, the
   water slot's `(seed ^ 0x57415452) >>> 0`, `seed` the render's. Two runs of the game differ from each other
   in the same way, so the page says nothing about it; `tests/REFERENCE_2026.md` does.
8. **The tail ends by a rule on the path's own output, with a cap.** The engine's integer filters do not end
   at zero: the model's rooms rest at a constant or a small cycle between 0 and about -37 units. The rule:
   the output ends at the first sample where its last 22,050 values, all made with no voice, lie within 32
   units of each other; at most 882,000 samples (20 s). 32 units is 16 either side of the resting value,
   today's own threshold. Every preset of the table and every named case ends by it, alone and under water,
   after a quiet and a loud input; the longest is preset 103 after a second of full-scale square wave, 9.7 s
   ("Where each tail ends").
9. **`AMP` and `MDY` are built as the second read of them gives** (AM 1 to AM 3), whole. The first read's
   account of them, and this plan's earlier three assumptions, are replaced.
10. **The custom room (99) stays, as an extra,** rebuilt on the engine's processors, so one implementation
    serves everything. Its sound changes. It is not the game's and the page says so.
11. **A preset number the table does not hold** (30 to 59, 60 to 101, the diffuse pairs, 134 and up, such as
    the 137 to 139 that the `lair` soundscapes ask for) is treated as the engine treats a number it does not
    have (R1 3): the slot keeps what it had, which at a render's start is no room. The page does not offer
    them.

## The reference

The oracle's files are the orchestrator's: `tests/roomdsp/convert.py`, `dspmodel.py`, `reference.py` and
`room-presets.json`, committed directly before part a starts. `reference.py` needs Python 3 with numpy and
reads only `room-presets.json`, so it runs without the game's file.

### The table

`convert.py` reads the game's `scripts/dsp_presets.txt` (46,419 bytes, CRC-32 2441946680) and writes the
canonical table. It stops if the size or the CRC-32 differ, if a preset of the table holds a word the name
table does not have, more than 16 values in a processor, more than five processors, or a configuration other
than a plain chain (so "every preset of the table is a plain chain" is the converter's assertion, not the
test's).

- presets **0 to 29** and the automatic room's templates **102, 103, 106, 107, 110, 111, 114, 115, 118, 119,
  122, 123, 126, 127, 130, 131**: 46 presets. Left out: 30 to 59 (player, speaker and stereo effects; no
  soundscape and no default reaches them for a voice: R1 4), 60 to 99 (empty), 100, 101, 134, 135 (tests and
  effects), and the "diffuse" pairs 104/105, 108/109, 112/113, 116/117, 120/121, 124/125, 128/129, 132/133,
  which this build of the engine never chooses (R2 e4, difference 10);
- one JSON object, keys the preset numbers in ascending order, each
  `{"h":[mix min, mix max, duration, fade, dB min, mixdrop],"p":[[type,[16 values]],...]}`, no spaces;
- a value is the file's token read as a number and rounded to single precision, written as the shortest
  decimal that reads back to the same single (`0.2`, `1.3`, `-1`); a word is its number in the engine's name
  table (R1 3): types `NULL` 0, `DLY` 1, `RVA` 2, `FLT` 3, `MDY` 9, `DFR` 10, `AMP` 11; delay kinds `PLAIN` 0,
  `ALLPASS` 1, `LOWPASS` 2, `DLINEAR` 3, `FLINEAR` 4, `LOWPASS_4TAP` 5, `PLAIN_4TAP` 6; `LP` 0, `HP` 1;
  missing values are 0. The converter is the definition of the form.

**The table is 5,515 bytes and its SHA-256 is
`0586a404ca16112dfc7c2b40d5685c237294a32047fd10d1a0267339ad669350`** (this plan's run; the review's rerun gave
the same). Facts the test asserts: every header's duration and fade are 0; the processor counts are `RVA` 35,
`DFR` 26, `DLY` 16, `NULL` 2, `AMP` 1 (preset 14), `MDY` 1 (preset 16); no `FLT` processor; no non-zero value
is outside the engine's range tables (R2 0; AM 0 for `AMP` and `MDY`); in the fields today's `DSP_PRESETS`
carries, presets 0 to 29 hold the same values, **with one exception asserted by name: preset 23's reverb count
is 1.3 in the table (the file's value; the engine truncates it) and 1 in the app's old table.**

What the 46 presets use, so what must be built:

| Processor | Used as | Where |
| --- | --- | --- |
| `RVA`, plain (R2 a1) | filter in the loop (`LOWPASS` lines) | 2 to 12, 17 to 19, 23 to 25, 102, 103, 106, 107 |
| | no filter in the loop: `PLAIN` lines, two low-pass sections on the sum | 13, 14, 15, 16, 130, 131 |
| | with random taps (R2 a4) | 8, 9, 10, 14 to 19, 23, 24, 25, 130, 131 |
| `RVA` from three dimensions (R2 a2) | with a predelay line (`FLINEAR`) and negative factors | 110, 111, 114, 115, 118, 119, 122, 123 |
| `DFR` (R2 c) | 2 to 4 all-pass stages | 4, 6 to 10, 14 to 22, 25 to 29, 103, 107, 114, 115, 130, 131 |
| `DLY` (R2 b) | `LOWPASS` (2) | 20 to 29, 126, 127 (delay written -1: the measured length) |
| | `ALLPASS` (1) and `PLAIN` (0) | 130, 131 |
| `AMP` (AM 2) | full gain for 100 ms, one glide to 1640/4096 over 80 ms, then constant | 14 |
| `MDY` (AM 3) | a 500 ms `PLAIN` feedback echo with random taps, mix 1 | 16 |

**Not built** (a preset that asks for one is refused by name when it is built): the `FLT` processor (so the
band-pass, R2 c), `DLINEAR` (3), the four-tap kinds (5, 6) and so the tap factor (R2 a3, a4's quirk), `MDY`'s
invert flag and outside hook (AM 3: no plain chain reaches them), a one-shot duration, a header's own fade
time, and every configuration but the plain chain.

### The shares (R2 f, model)

For a voice (60 dB, 12 units away, `dsp_dist_min` 0, `dsp_dist_max` 1440, `dsp_volume` 1), by header
`(mix min, mix max, dB min, mixdrop)`, room / direct of 256:

`(0.2, 0.7, 80, 0.5)` 26/229 · `(0.3, 0.8, 80, 0.5)` 38/217 · `(0.32, 0.8, 80, 0.5)` 41/214 ·
`(0.4, 0.9, 80, 0.5)` 51/204 · `(0.4, 0.9, 80, 0.7)` 72/183 · `(0.3, 0.8, 75, 0.3)` 23/232 ·
`(0.32, 0.8, 60, 0.3)` 24/231 · `(0.21, 0.8, 95, 0.1)` and `(0.22, 0.6, 95, 0.1)` 5/250.
A distance of 11 gives the same integers (R2 f). `(1, 1, any, 1)` gives 256/0: the fully wet voice of the
owner's recording. The engine's start-up values `(0.2, 0.8, 80, 0.5)` give 26/229 too (R1 1).

### The voice's entry into the mix (W3-07 section 1; R2 f)

`entry(s, share) = trunc( single( s x (255 x share / 256) ) / 256 )`: the 16-bit sample times the channel's
float volume, **rounded to single precision once**, times 1/256 (exact), truncated toward zero. `255 x share /
256` is exact in single precision for every whole share. The rounding matters: `entry(-32690, 229)` is
**-29128**, where exact division would give -29127, and `entry(31388, 23)` is **2809**, not 2808 (28 of the
65,536 samples differ at share 229, 2 at share 23, **none at share 256**; the review confirmed all 65,536).
Fixed points: `entry(32767, 256)` = 32639, `entry(-32768, 256)` = -32640, `entry(32767, 229)` = 29196,
`entry(32767, 26)` = 3314, `entry(16384, 229)` = 14598, `entry(16384, 26)` = 1657, `entry(16384, 256)` =
16320.

### Echo tables (R2 "Model")

R2 gives the first ten echoes (sample, value) of preset 6, of the small automatic room and of the tunnel, and
the built lines of each. **Its convention feeds the preset `64 x room share` directly** (1664, 2432, 4608 for
an impulse of 16384), not through `entry`: the tests do the same. Part a checks the small room and the tunnel
from the built parameters R2 lists (part b's build is not there yet). Through `entry` (input 1657) preset 6
gives (0, 26) (573, -177) (837, -178) (1146, -28) (1235, -16) (1410, 1147) (1499, -16) (1674, -28); fully wet
(input 16320) it gives (0, 265) (573, -1738) (837, -1738) (1146, -262) (1235, -153) (1410, 11317)
(1499, -153) (1674, -262) (1983, 1696) (2072, 997). The review's own model gave all of these.

### The amplifier and the modulating delay, pinned (AM 2, AM 3, AM 5)

- Preset 14's amplifier: gain integer 4096, threshold 0, distortion mix 0, `PERIOD` 4410, `DEPTH` 2457, glide
  3528 samples, lower gain `LO` 1639. The gain that multiplies each sample of a fresh instance: 4096 for
  samples 0 to 4412; 4095 at 4413; 2867 at 6176; **1640 from 7938 on, for good**. The ramp 4096 to 1639 has
  step 730258 in 12.20 fixed point, takes 3,529 calls and ends on 1640. Firings on samples 4410, 8821, 13232.
- Preset 16's modulating delay: kind 0, 22,050 samples, feedback 1638, output gain 4096, `PERIOD` 22050
  (draws on samples 22050, 44101, 66152), each draw between 21829 and 22050, a fade of 662 calls with step
  6497681 (weights 6, 12, 18, ... 4089, 4095, 4095), mix 4096.
- AM 5's tables give SHA-256 values for presets 14 and 16 and for each processor alone, on an impulse and on
  a tone whose own hash is given, under two stand-ins for the draw that need no generator: "upper" (always
  the upper bound) and "lower" (always the lower). The module takes a draw function, so its tests meet them.

### The model's outputs (`reference.py`, this plan's run on the extended model)

Inputs are 16-bit voice samples drawn with `mulberry32` as in `audio.js`:
- **noise:** 22,050 samples, `s = floor(u x 65536) - 32768`, `u` from `mulberry32(1)`; then 66,150 zeros;
- **speech:** for sample `k` of 88,200, `ph = k mod 17640`; 0 if `ph >= 8820` (no draw), else `trunc(n x
  min(ph, 8820 - ph) / 4410)`, `n` drawn as the noise but from `mulberry32(3)`; then 44,100 zeros.

A **room** case feeds one preset `entry(s, room share)` from silence and hashes its outputs (88,200 or
132,300) as 32-bit little-endian integers, SHA-256. The room preset's draws come from `mulberry32(2)`, in the
order its processors ask. A **path** case hashes `entry(s, direct share) + preset(entry(s, room share))`, and
under water that sum through preset 14, whose instance was started 44,100 samples of silence before the first
sample (so its amplifier already rests on 1640) and draws from `mulberry32(5)`. `auto <key>` is a named case of
part b. A **synthetic** case is a one-preset chain under the header `(0.2, 0.7, 0, 0, 80, 0.5)`, written in
`reference.py`, for a rule that no preset of the table runs. Each line: the case, room/direct of 256, the
hash.

```
preset 2             26/229  b200b27f616b4e1fc6341d2f1167d1f37984dd37c90e4553b2d7901c3a6d0238
preset 3             26/229  fcd02b4636b8548a167bc532cedf718fae1a44e69204c29f2bd2c13354580638
preset 4             26/229  4f0165f6d7038b41e5ee56a905bd63ae3e71d54fa0fb1f2791d2d87836eeffa3
preset 5             26/229  2610e6c6a27f27da276aece1bed87961aef988bd92de85e26eefbfcd7b8607b1
preset 6             26/229  0ef438a490544760b318a71127d30196d7824be54c6de4a5d8e63831599529bf
preset 7             26/229  e02c5d172647db6456a2d1b7ce02876a0c91f6fb07b950726d7d27956a57d860
preset 8             26/229  f83e763518dc1702eb8a44e6d344747a34834e3e8febcca47cc8273d345dab5b
preset 9             26/229  0ad0e0d3e0699da316972f282b2db6e131c2e845cb2d442c8b4b18de9e68adfe
preset 10            26/229  54d099f7f2962f59b3d5a16805ed37b4dad50dce15ca1dbea69d977e2cb43d4b
preset 11            26/229  9e72bd57a3e2cba875293967e40a1a8e70919c24378d57702d79d6377f1b8bf0
preset 12            26/229  66f46cfe2575782314f824eee3db522fdae486ea2e6cef2b9ebc083aa8c93f3c
preset 13            26/229  617c30354979a066b50244550453fed31411bdf362935b95376f547270231e3d
preset 14            26/229  468b4735b93a6cbc2c5bd08b52a95f9657bd5bfd7723df38344c5080e01fe64a
preset 15            26/229  a51bdd08a1159de92b0342bb6a4df15864ad4e8b31a792a2bc48bba2da81e15b
preset 16            26/229  537246ea32a0fc270d5db5b30ffe79d75c2a5fa3c26261a53b5567592683b5fe
preset 17            26/229  d02ebb0a8a0211e02ae12104aaa21f67b5fceb07d23778f425537a1a07c58a32
preset 18            26/229  e8c9969df870134a31fd0708fe437fbe09d664fb4b8eff4a6546c27659f30d34
preset 19            26/229  4f94b47110ae593a0823c49707a82e0391504ce85287d1ac33f16e9e429a7a56
preset 20            26/229  75d6e542a39cc9f9abc8719d113026db3ddc069e3dda166748bde12f97927e41
preset 21            26/229  b0841f86332a22f6766dfae7b11233953e047023a168f847301ce614b44f036f
preset 22            26/229  b271ebd86ad5f2bfb611945bc48dc76081c57d52f72eba8fa3109765aa77aa0c
preset 23            26/229  6c590f8e8857c58e7144c0baf9d49e2a5194f7d81b582ff1c1e6e499bbdfdc27
preset 24            26/229  1a8cc326b8f8e46b630450b392ad062ec266c8acdba326e71e3692285c4e0326
preset 25            26/229  5e7d1f4253a6e76eb916c646392deee724f2cbb52e2ce74cff479b98d62593cf
preset 26            26/229  a97039f0e47e1c382ccac032c34023eb0237e962a1a698cea5ed6fdee6c7ed83
preset 27            26/229  a97039f0e47e1c382ccac032c34023eb0237e962a1a698cea5ed6fdee6c7ed83
preset 28            26/229  a97039f0e47e1c382ccac032c34023eb0237e962a1a698cea5ed6fdee6c7ed83
preset 29            26/229  a97039f0e47e1c382ccac032c34023eb0237e962a1a698cea5ed6fdee6c7ed83
preset 102           38/217  5d89eac9e81f8182906c759f6c27ea48f3ce9839eb447f8e5b6aa057a4ce1c13
preset 103           41/214  81ad703c41aea5b242bcdc05eb91b0ed96a03b9112935c328d3e2c2632c68ceb
preset 106           51/204  cde9fe803a4e5daa54ef0da81969c5d781d8c79d1630aa309cbac4953bf88751
preset 107           51/204  8d534b024696cd79162ef5087824b716b69ba2cced6d425a264fa13430ac77c9
preset 110           38/217  b8fb7e7b88bf9249ca02eb7e58a6feed938499e83695c7ca91f42368d0428764
preset 111           38/217  da7a0a136a4f8461a09a983f54b78adecd1b21853e7a1a54f7930002eb4d2511
preset 114           72/183  c57a0321b31ade8f6de21a978d11011f4dcb3e3d3bbefffcb12c45672959713e
preset 115           72/183  7439829d9103282aba5c91eebfc030dd5c3ab109720a38e4cab4734f98fde511
preset 118           23/232  6e0c4455c958328473b939c89de54a3a6393d18a7ada9555a217a30f83565d5a
preset 119           23/232  0b543e940103868b440fbc1913dfeeb86abf063a83f52e41688faa1369da3f4d
preset 122           24/231  c97b9e13203afb63a1ad1ec085ca14add8fe5c5f50a0a1eea8e6988727827674
preset 123           24/231  f3642bdf4df185e5e80c8a986878fa5017982a5e7350e4cc7fe66176d06c11d1
preset 126           5/250   de043283fcc321ce96a7d80870c6fc79bbde48f965f412475926a8a91ceecc1e
preset 127           5/250   d87653289b031a8874fb13728a6f94ea113c0314db85522feed50f41718934ab
preset 130           5/250   8d1b1ea0aa720dd89e1430a9b776dc1fc88d3d3b710e5b3835d0f7b5b77c7832
preset 131           5/250   ade7934990d654703f17962ec1775550b92cae52315ab5a82858fce17a2b3c8a
auto closet          38/217  a28624a827ac4f2d5681b226351c27236d15e788c891363e327ec745a634cedf
auto small_room      38/217  ec20da27d480d94d58e5447dac03d11934aea57e15bd03c6deebf19793d824bf
auto room            41/214  45ef4fc5e0ca036c9f3846eaaf24e8f2ea2267fedc4956b0f69c561e7b04e04a
auto large_room      41/214  5883c1d98d62854cc150fe4b15d25e62c3359d69b69364cdb00e10e6884053f7
auto great_hall      41/214  03dae0e55f8ff67258cfdcb4df8c62c6309c68b9a273944822c2238fb2207ab8
auto vent            51/204  f8298b1832185a9c587f14cf486d54a699412a077e5be9f50cf9f5ac56819a42
auto corridor        38/217  968688f0ee2a5ac7ce6bc1d2bcbb05552830811bc0506b9e20ba2c57d7317aa0
auto long_corridor   38/217  1bef090c4b6bc4b5a9410043efeb2a9bd0a1144aa176c9516e9bda531d372961
auto tunnel          72/183  cc413ce5c4436f38d6838a46b5cdde74576ccecb049e5ec5602610cef5509559
auto big_tunnel      72/183  ce2a7e6603b9829a445b0ef87f1d2ecd2492f43cd59ce6e2a69d80220e812631
auto alley           24/231  5bab94ce2848ca75d056b1df31981f8696c1d32ec48183f872f3b8925dc01a6a
auto street          23/232  7454199f0ee87ad7148d45ab83a6c621859cce68bc300579148ffcefb3487866
auto courtyard       5/250   215161d1fe07d0c24cb84cb4df181f8960646cc1fae88a4c4ffb254dc373a4c6
auto open            5/250   b9ef52b72533aef6d11af53f345dee120a50369bf48c41a5b4f0a5df7fc7b851
speech preset 6      26/229  30696707ada24ecb5ec447ddda0c232185faf702b0a77e1d45ab7126bf08e58f
speech preset 14     26/229  32083f44ed9d0f63f9710defba279afc9035c2ae61f6149a9685b6cd90dc2771
speech preset 17     26/229  73547b34edb1d20a88d2c907fecff487445c5ab0a0d467011797418a3f1c19b8
speech preset 21     26/229  0b30f6021fb2f07cc5a373e63e43687ded807f9bbba0b5cfa233f122edfea146
speech preset 25     26/229  3c0842a67ec795b767c2773e22fa4664f16261940aeb85506b5be3cbaccc70fe
speech preset 103    41/214  6ebfc59d0c5e6cfc65636340adbafcfe96ea765eaaaecbcf09dc33d17749ae4b
synthetic: quality 2 in a delay                     26/229  1825c80bfc9a024342f7a037270ea643cebac319c27d7b9091904e18e3935f60
synthetic: quality 0 in a delay                     26/229  1825c80bfc9a024342f7a037270ea643cebac319c27d7b9091904e18e3935f60
synthetic: cutoff 0, filter flag set                26/229  f63beaafac49d88d5bdd356655ccc3d68f5e50856bebe60a7ef4ae456d93aa2e
synthetic: delay with gain 0                        26/229  36cc375ad586953783ebbcbcd9b7fc131f9582db68a8cfa51605e9d75057ae9b
synthetic: 3-D, factors 0 0 0                       26/229  6cf170885773a8ddbe58182803b4f7bce7cef18abf5781a2207a978f388336be
synthetic: 3-D, negative factor, no filter          26/229  31da9c75c8ab22965d9a546217c08d05fecaa550651988f8cd0e8f8a89b82fcb
synthetic: 3-D, negative factor, filter on the sum  26/229  b8e38b6fcbe4cc42ee100f7a702693018f3c48b1a038323535603ce34c9a5b6e
synthetic: diffusor of size 0.9                     26/229  57261b46f5b418208b78d81993be11164fde431cddfc86e62e5191073683a9c5
synthetic: amplifier that clips                     26/229  a3a73491f44a675f232b9cc7ecc5f568f38b824da8d61a54243dcd362a39eeff
synthetic: amplifier, threshold 0, mix 1            26/229  19f0212a2c85ff556ebeb0e7ec8d5ac64299145a606f207ac650c4aab24bf73c
synthetic: amplifier, random gain                   26/229  9b1cde3dc1d95df6647c05d8ea6876fa59a82503d3da410051379b12c37a5fd7
synthetic: amplifier, glide 0                       26/229  628b3f97d355b840b59d7bcba6f635d234e9981bd74892a9f0f64a92eb1a7edc
synthetic: modulating delay, mix 0.5                26/229  2a2131d33720d866eb5758faef1e8d565f2752a943c3aeb1293d79768da9efc9
synthetic: modulating delay, mix 0.3, low-pass      26/229  19866bbdcae72f24f2b66035ef33f423577f2080373f63f17951c4de357f6d4e
synthetic: never settles (the cap)                  26/229  e77e1c3982b4a7f3c7ad32fb5338dec8b2f544b830ec580bce611d5613a490ff
synthetic: negative width and depth in templates    38/217  9b1675fca771a375a68dcd1921e5f9138138187b67878503e4a1e95f1d5f62c0
   built: 0 0 3.6 0 1.96 4500 1 0 0 6.6666665 33.333332 12.16 0.85 -0.65999997 0.3 0
under water, no room   0/256   286083c1a50e0ee7e34ef25474ca381f21b794854285d4a9746dc9b9cc92a5cb
under water, preset 6  26/229  aa11c7704a865c689edaf563081d8e7a44a21c8a52f2daab63ed0ea53a344e08
under water, tunnel    72/183  ebddc42278e03fc0590f68fddf69f8b76e6565d8aafbc7c3465e2562ee8d440d
path, preset 6         26/229  0324227ead12da97f1be0db02c013aac63fb4ff60ee37f20ed0dae9dd19d1d5d
path, tunnel           72/183  3bef7450e4559a367e3d7c9823410dfded58d9beb47e4fc3702db82e8f03e9ca
```

Presets 26 to 29 are the same preset. "quality 2" and "quality 0" give the same hash: quality does nothing
inside a delay. Every hash of the first plan's run that is still listed is unchanged (`vent`'s too: its new
measures build the same preset); presets 14 and 16 and the synthetic and path cases are new.

### Where each tail ends (`reference.py --tails`)

The rule of Decision 8, on the path's output. The figure is the number of zero-voice samples after the input
at which the rule first holds; the least possible is 22,050. Inputs: **quiet** = the noise with each sample
`trunc(s / 64)`; **square** = 44,100 samples, 32767 if `(k mod 441) < 220` else -32767; **long** = the square
for 220,500 samples. "water" = the same under water. Draws as above.

```
tail: band 32 over 22050 samples, cap 882000
case                      quiet   square  q water  s water
preset 2                  24647    68379    28068    70875
preset 3                  25745    95536    28069    97872
preset 4                  28747   176468    28490   178132
preset 5                  23840    45995    27965    46305
preset 6                  25847    63108    27930    64436
preset 7                  26582   129428    27967   125647
preset 8                  24394    62128    27931    64456
preset 9                  24752    62130    27931    64453
preset 10                 24561    62868    27966    62915
preset 11                 23804    76328    28373    79525
preset 12                 22099    69830    28298    68955
preset 13                 24567    72091    28373    76819
preset 14                 24474    36450    27930    42870
preset 15                 22050    60122    27967    62997
preset 16                 22050   154965    27717   156367
preset 17                 24297    62134    27931    64462
preset 18                 24200    65347    27715    67935
preset 19                 24097    59093    27720    61444
preset 20                 24262   129301    27965   129615
preset 21                 23894   164577    28047   167125
preset 22                 23460   287869    27930   257572
preset 23                 22050    79215    27965    81443
preset 24                 22050   172861    27967   175870
preset 25                 23455   235768    27930   237677
preset 26                 23460   163900    27966   165789
preset 27                 23460   163900    27966   165789
preset 28                 23460   163900    27966   165789
preset 29                 23460   163900    27966   165789
preset 102                26766    56249    29182    62055
preset 103                30003   429431    27965   424873
preset 106                28971    53368    28431    56377
preset 107                32810    86458    30993    83320
preset 110                23109    30877    27966    42223
preset 111                30382    41650    29183    45361
preset 114                27254    66818    30007    69064
preset 115                34154   394668    35703   379940
preset 118                24246    37495    28373    44172
preset 119                22050    48308    28372    54830
preset 122                26385    39478    28372    44244
preset 123                24119    39484    27966    44917
preset 126                22050    22278    27967    42644
preset 127                22050    22226    28372    42644
preset 130                22050   194958    27966   193178
preset 131                22050   363130    28371   351962
auto closet               24687    56277    29132    61673
auto small_room           24964    63520    29132    66313
auto room                 29936    80721    29871    82833
auto large_room           34745   115606    30385   116161
auto great_hall           37059   167651    30301   169982
auto vent                 26372    56410    28728    60283
auto corridor             24113    30884    28299    42241
auto long_corridor        27773    39760    28371    44038
auto tunnel               29010   135492    30358   134571
auto big_tunnel           29930   135488    31921   134347
auto alley                24246    39482    27965    44164
auto street               22050    39889    28371    47166
auto courtyard            22050    47409    28371    45404
auto open                 22050   194743    27966   193184
no room                       -        -    28372    42219
preset 22                     -   288094   (after the long square)
preset 103                    -   396740   (after the long square)
preset 115                    -   388104   (after the long square)
auto great_hall               -   173162   (after the long square)
synthetic: the cap            -   882000
```

### The slot's ramp (R2 d, a4; the model's `Ramp`)

Room slot, 0.2 s: step 486957 in 12.20 fixed point; the ramp's values, call by call, are 0, 0, 1, 1, 2 ...,
2048 at the 4,411th call, 4095 at the last, and it reports done at the 8,821st call. Water slot, 0.1 s (R1 1's
slot table): step 973915, values 0, 1, 2 ..., done at the 4,411th call. **How the slot lines the ramp up with
the samples was not read.** Assumed, as a reverb line does it (R2 a4): the first faded sample (index 0) uses
weight 0, sample `k` uses the ramp's `k`-th value, and the sample after the call that reports done is the new
preset alone. So a room fade covers samples 0 to 8820. The other reading (the ramp stepped before its first
use) moves every weight one sample earlier. It is one named constant in the module, with this note.

## W3-17a: the room module

### What to build

1. **`room-presets.js`**: the converter's canonical JSON inside a classic script (an IIFE that sets
   `module.exports` under Node and `root.TF2_ROOM_PRESETS` elsewhere; no imports). A header comment says it is
   generated and from what (the file's size and CRC-32), and that it is not edited by hand. The orchestrator
   supplies the JSON; the builder wraps it and the test checks the wrapped text against the hash.
2. **`room-dsp.js`**, the same form, `root.TF2Room`. All sample arithmetic is 32-bit signed integers: a
   product is `Math.imul`, a sum is `| 0`, a shift is `>> 12` (**it rounds down, toward minus infinity**; never
   `Math.trunc(x / 4096)`). Every single-precision step of a builder is `Math.fround` per operation, in the
   order the read gives; a double step is a plain double. Where the reports' words leave a detail open (the
   ramp's last sample, a clamp's order, which of two equal sizes sorts first), `dspmodel.py` is the same
   readers' record of it: follow it and say where you did.
3. **The filter section** (R2 c): `w = tan(cutoff x 7.123792865e-5)` in double, `p = (1 - w) / (1 + w)`,
   `a1 = trunc(-4096 p)`, `b0 = b1 = trunc(2048 (1 - p))`. Per sample `w0 = d - (w1 x a1 >> 12)`,
   `y = (w0 x b0 + w1 x b1) >> 12`, `w1 = w0`; a section whose state and input are both 0 returns 0 without
   computing. **The coefficients are a table in the module**, so no browser's `tan` decides a sample.
   `(a1, b0)` by cutoff, from the model (the review computed the same, and found each at least 0.0057 from an
   integer boundary, so any `tan` gives these): 900 `(-3601, 247)`, 1000 `(-3550, 272)`, 1050 `(-3524, 285)`,
   1200 `(-3449, 323)`, 1350 `(-3375, 360)`, 1500 `(-3302, 396)`, 1520 `(-3292, 401)`, 1750 `(-3183, 456)`,
   1800 `(-3160, 467)`, 2000 `(-3068, 513)`, 2140 `(-3004, 545)`, 2500 `(-2846, 624)`, 2760 `(-2735, 680)`,
   2850 `(-2697, 699)`, 3000 `(-2635, 730)`, 3250 `(-2533, 781)`, 3380 `(-2481, 807)`, 3500 `(-2433, 831)`,
   3900 `(-2278, 908)`, 4000 `(-2240, 927)`, 4500 `(-2054, 1020)`, 4950 `(-1892, 1101)`, 5000
   `(-1874, 1110)`, 5500 `(-1700, 1197)`, 6000 `(-1532, 1281)`: every cutoff of the table and every cutoff
   part b's build can give. `tests/roomdsp/coefs.mjs` recomputes them under Node and must agree. A cutoff not
   in the table (the custom room's) is computed with `Math.tan` and the instance's description marks it "not
   pinned".
4. **The delay** (R2 b), kinds 0, 1, 2 and 4, each as R2 gives it per sample, with: the buffer of `D + 1`
   integers; the feedback capped at 4095; **the gain cut in its exact form** (`g = min(a / 4096, 0.999)` in
   single; `k = clamp(trunc(4096.0 / double(1 / (1 - g))) x 4, 1024, 4096)`; gain = `trunc(k x (b, **or 4096
   if b is 0**) / 4096)`; R2 difference 7: preset 17's first line is **381**); for kinds 2 and 4 the filter's
   `b0`, `b1` multiplied by `a / 4096` and truncated (the feedback lives in the filter); kind 4 with feedback
   0 and **gain 4096 whatever the reverb's gain** (R2 difference 4). As a processor (`DLY`): `D = trunc(|ms| x
   44.1)` in single, `a = trunc(fb x 4096)`, `b = trunc(gain x 4096)`; **only the filter's first section, so
   "quality" does nothing** (R2 difference 8); kinds 3, 5, 6 are refused.
5. **The diffusor** (R2 c): stage `i` of `n = clamp(trunc(count), 1, 8)` has `D = trunc(size x T[i]) x 44100
   / 1000` in integers (**the time is cut to whole milliseconds first**: 573, 837, 1146, 926 samples at size
   1), `T` = 13, 19, 26, 21; `a = trunc(min(fb x 4096, 4091.9))`; gain 0 means 1; each stage a delay of kind
   1 (so the gain cut applies).
6. **The reverb** (R2 a): the plain variant (a1) and the variant from width, depth and height (a2), the
   lines built as a3 says, modulation as a4. Every one of these is a place a builder would simplify:
   - plain: `step = (size - min) x (1 / m)` (a reciprocal multiplied), `D[i] = trunc((trunc(i x step) +
     min) x 44.1)`: **two truncations, and the far delay is never reached** (preset 6: 661 and 2513 samples,
     not 100 ms); feedback of line `i` is `powf(fb, D[i] / D[0])`; gain `trunc(gain x 4096 x (1 / m))`.
     (Reciprocal against division: a search of whole-millisecond sizes to 400 with 2 to 12 lines, and gains
     0.01 to 10 by hundredths, found no case where the two give another integer. Build the read's form; no
     check can tell them apart there.)
   - three dimensions: the count forced to 3, 6, 9 or 12; sizes and factors sorted together (ties as the
     model's sort leaves them); the feedbacks from the **truncated** sizes when the three factors are 0; the
     push-apart term **computed once and reused** (R2 difference 2); gain by a division here; **with a
     filter in the loop** a negative factor in the first round is a **predelay** (kind 4, the whole size,
     gain 1.0), and in later rounds the size is **quartered, floor 7 ms**, and the sign dropped (R2
     difference 1); **with no filter in the loop a negative factor's line is a plain comb with the factor's
     size** (R2 a3: no predelay); the extra `max(S x 0.18 x round, 7 x round)`; `D = total x 44100 / 1000` in
     integers;
   - **the predelay is not scaled by gain / m**;
   - no filter in the loop (the flag clear, or cutoff 0): plain lines; with a cutoff and the flag clear,
     **two** low-pass sections in series on the sum;
   - modulation: a draw **every period + 1 samples** per line (R2 difference 5), in line order; depth,
     period and glide from the line's own length; the cross-fade `old + (((new - old) x r) >> 12)` with the
     12.20 ramp; a ramp of zero length is done at once, at weight 0 (AM 1; it cannot occur in the table).
   - **`powf`**: `Math.fround(Math.pow(Math.fround(fb), Math.fround(ratio)))`. The review found all 132 `powf`
     results of the table and the named cases at least 11 single-precision steps from moving a feedback
     integer, so no library's last bit changes them. The pinned integers (below) would show one that did.
7. **A preset instance**: the processors in the file's order, out of one into the next, nothing after (R2 d);
   each value clamped by its type's range table first (R2 0 for `RVA`, `DLY`, `DFR`; AM 0 for `AMP` and
   `MDY`, whose delay is clamped by `MDY`'s table, not `DLY`'s), **a value of exactly 0 never clamped**;
   `describe()` returns each processor's built integers (delays, feedbacks, gains, filter coefficients,
   periods), for the tests and for the page's help.
8. **`AMP`** as AM 2 gives it, whole: the build's integers; per sample the clip (only when `VTH < 4096` and
   `DMIX != 0`; so a threshold of 0 with a mix clips to 0), `out = (G x x) >> 12` with the gain as it stood
   at the sample's start, the glide, then the counter (read, decrement, act if the value read was 0: a firing
   on sample `PERIOD`, then every `PERIOD + 1`); the target with the random flag clear is `G0` only if the
   gain equals `LO` exactly, else `LO`; with it set, a draw between the two. **The ramp is AM 1's**: it steps
   the gain itself, its offset stays strictly under the distance, so **the target is never produced**; a
   glide of zero length never moves. The "feed" value does nothing. **`MDY`** as AM 3: the delay built by
   the delay's own rules under `MDY`'s clamp; a draw every `PERIOD + 1` samples of a whole-sample tap between
   `trunc((1 - depth) x max)` and `max`; the tap cross-faded by a 0 to 4096 ramp over the glide; the three
   mixes (4096: the delay's output; 2048: `(y + x) >> 1`; else `x + (((y - x) x MIX) >> 12)`). Kinds 0, 1,
   2 and 4. The invert flag and the hook are not built.
9. **The slot** (R2 d): one channel; a fade time (0.2 s for the room, 0.1 s for the water: R1 1); `set(preset
   or null)`; `process(in, out)` on 32-bit integers. A change is taken at the next 512-sample block of the
   slot's own count, and only when no fade is running; both instances then run on the same input and
   `out = old + (((new - old) x r) >> 12)`, lined up as "The slot's ramp" says; "none" is the input itself.
   A slot made with a preset starts with the fade over and the lines silent. One random stream per slot,
   given as a seed or as a function; during a fade the old instance draws first. `set` with a number the
   table does not hold changes nothing (Decision 11).
10. **The voice's shares and entry**: `shares(header)` as R2 f in single precision (the drop when `60 <=
    trunc(dB min)`; `M = mix x 256`; room `min(trunc(M), 256)`; direct `trunc(256 - M)`), and `entry(s,
    share)` as above. Separate functions, usable without a slot.
11. **`createRoomPath({ seed })`**: the engine's order after the entries, for part c and the live chain.
    - `setRoom(preset or null)`, `setWater(on)`. Setting a room preset overwrites the path's four mix values
      from its header (R2 d); they start at 0.2, 0.8, 80, 0.5.
    - `spurtStart()`: a voice channel starts; its two limits are fixed from the four values now (R2 f).
    - `shares()` -> `{ room, direct }` for the next block: **0 and 256 while the room slot holds no preset
      now and held none before** (the engine tests this at mix time, per block, not per spurt: R2 f), else
      from the spurt's limits. **When "before" is cleared was not read.** Assumed: when the fade to "none"
      has ended. One named constant with this note; the other reading (never cleared) keeps the last
      preset's shares after `dsp_room 0`, the slot passing its input. The owner's take R1 decides.
    - `process(direct, room)`: two buffers of 32-bit integers at 44100 Hz, already entered (and, for a 22050
      or 11025 Hz voice, already upsampled, by the caller); returns `direct + room slot(room)`, then through
      the water slot if on: the sum **before the clip**. The entries and the upsampling are not in here.
    - The water slot holds preset 14 and has its own random stream. When a path is made already under water,
      the slot is started 44,100 samples of silence before the first sample (its amplifier then rests on
      1640; AM 5).
    - `tailLeft()`: Decision 8's rule, kept sample by sample over the path's output: after each `process` it
      says whether the output has ended and at which sample of that block.

### Checks

`node tests/room-dsp.verify.mjs`, in `pnpm test`. It loads the module with `require`, **not in a vm
context** (this plan's timing: 97 ns a sample for twelve lines and three all-passes loaded with `require`,
230 times real time; 8,200 ns in a vm context whose `Math` is the outer one). Each check fails when its line is
broken; the builder says how, and at least these mutations are tried and caught:

| Mutation | Caught by |
| --- | --- |
| `>> 12` made `Math.trunc(x / 4096)` (round toward zero) | the reference hashes; a hand case: a comb fed -1 |
| the room path delayed by one sample (a `PLAIN` or `LOWPASS` line's input not passed straight through) | echo (0, 26) of preset 6 |
| the far delay reached (`i x (far - first) / (m - 1)`) | preset 6's lines 661 and 2513 |
| one rounding where the engine has two (`trunc((i x step + min) x 44.1)`) | the pinned lines of presets 4, 6 and 7 (2513 would be 2535) |
| quality applied inside a delay, or two sections in the loop | synthetic "quality 2 in a delay" |
| a value of 0 clamped (cutoff 0 made 10 Hz) | synthetic "cutoff 0, filter flag set" |
| a delay's gain of 0 kept as 0 | synthetic "delay with gain 0" |
| the three-dimension feedbacks from the sizes untruncated | synthetic "3-D, factors 0 0 0" |
| a negative factor made a predelay where there is no loop filter | the two synthetic "3-D, negative factor" cases |
| the predelay scaled by gain / m | the tunnel's pinned predelay (gain 4096) and its reference hash |
| later rounds not quartered; the push-apart term recomputed | the tunnel's nine lines; presets 111 and 115 |
| the gain cut as `trunc(4096 x (1 - fb))` | preset 17's 381 |
| a draw every `period` samples | the hashes of the modulating presets; a count of draws in 10 s |
| `entry` without the single rounding, or rounded to nearest | the two fixed samples above; all 65,536 at shares 229 and 256 |
| the diffusor's time not cut to whole milliseconds | 573, 837, 1146, 926; synthetic "diffusor of size 0.9" |
| the amplifier's ramp reaching its target, or its target turning back to full | preset 14's gain 1640 from sample 7938; AM 5's hashes |
| the amplifier firing every `PERIOD` samples | firings on 4410, 8821, 13232 |
| the clip skipped at threshold 0 | synthetic "amplifier, threshold 0, mix 1" (every output is 0) |
| the modulating delay's fade ending on 4096, or its mix as a float | preset 16's hashes; the two synthetic mixes |
| the water slot started fresh in a render | the "under water" path hashes |
| the tail ended on a level, or the cap missing | the tail lengths; "synthetic: the cap" at 882,000 |

- the table: the wrapped JSON's SHA-256, and the facts listed under "The table";
- every preset of the table, every synthetic case and (after part b) every named case: `describe()` equals
  the model's integers, kept in `tests/roomdsp/lines.json` and **made by a script that reads them out of the
  model's instances** (`tests/roomdsp/lines.py`, the builder's; the reviewer reruns it), never from the
  module;
- R2's three echo tables, sample and value, and its built lines for preset 5, 6, 17 (381, 470, 558, 642, 725,
  806), 102 and 114; the pinned numbers of the amplifier and the modulating delay above; AM 5's hashes for
  presets 14 and 16 and for the two processors alone, under "upper" and "lower";
- **the reference hashes above, every one**, room, synthetic and path;
- **the tail lengths above, every one**, by running the path on the named input and then zeros;
- chunking: `process` in pieces of 1, 127, 512, 4096 and seeded random sizes gives the whole-run samples, for
  five presets, a fade included, and the same tail length;
- the slot: a change during a fade waits; the ramp's numbers above for 0.2 and 0.1 s; a fade to "none" ends
  on the input bit for bit; a number not in the table (40, 104, 137) changes nothing;
- the shares for every header of the table, `(1, 1, 80, 1)` gives 256/0, and `shares()` is 0/256 with no
  room, the preset's after `setRoom` and `spurtStart`, and 0/256 again once a fade to none has ended;
- `entry(s, 256)` equals `trunc(s x 255 / 256)` for every 16-bit sample.

**Stop and ask** if a reference hash or tail length cannot be met: give the case, the first differing sample
and which of the two (module or model) the reports' text supports. Do not adjust the reference or the model.

### Files

May add: `room-presets.js`, `room-dsp.js`, `tests/room-dsp.verify.mjs`, `tests/roomdsp/` (`lines.py`,
`lines.json`, `coefs.mjs`; `convert.py`, `dspmodel.py`, `reference.py`, `room-presets.json` are the
orchestrator's). May touch: `package.json` (the `test` line). Nothing else: no page loads the module yet.

## W3-17b: the automatic room in the module

### What to build

1. **`buildAutomatic(measures)`** (R2 e1, e2): `measures = { sky, width, length, height, reflectivity,
   openSides }` (units, whole numbers; reflectivity 0 to 1; open sides 0 to 4, used only under the sky). It
   names the shape (e2, the shaft swap included), classes the measures (e1: the exact thresholds, the size
   class's three rules), takes the pair `A`, `B` (room 102, duct 106, hall 110, tunnel 114, street and open
   street 118, alley 122, courtyard and open courtyard 126, open space and open wall 130: R1 4's table of
   variables), **copies B whole if the size class is above 1, else A**, and overwrites the parameters e1
   lists by `A + (B - A) x class / 5` in single precision, squared where marked; **the reverb's cutoff, and
   a delay's cutoff and width, from the dull end: `B + (A - B) x class / 4` (and `/ 5`)** (R2 difference 11);
   a delay written negative becomes `clamp(length / 6, 14, 500)` ms, and a reverb's width, depth or height
   written negative in either template becomes the measure in feet, `clamp(units / 12, 6, 500)` (e1; no
   template of the table has one: the synthetic pair below runs it). Diffusion is always class 0 (R2 e4). It
   returns the preset (header included), the shape's name, the classes and the pair. The measuring itself
   (rays, nodes, the rebuild rule: e3, e4) is not built.
2. **Where the report's text and the model differ, the model's code is followed, and it is flagged for the
   recording.** One such place is known: a reflectivity of exactly 0.8. R2 e1 says class 2 up to 0.8; the
   model compares the single-precision value (0.800000012) with a double 0.8 and gives **class 3**. The 0.04
   and 0.5 thresholds agree. The module does as the model does, with a comment that says so.
3. **The named cases**, `ROOM_CASES` in `room-dsp.js`. The app has no map, so a case is a set of measures
   that the shape rules name the way the label says. **Each is an example: no real spot has been measured.**
   A unit is an inch to this code (e1 divides by 12 for feet). All sit in reflectivity class 1. No case sits
   on a threshold of a class or of the reflectivity; `vent`'s width of 48 is the widest a duct can be
   (`width <= 48`, an integer test, e2) and the narrowest a player fits. This plan's run of the model (the
   review's own code agreed on shape, classes, copy and shares for all 14):

   | Key | Label | Sky, width x length x height, reflectivity | Shape; classes size, width, length, height | Copy; shares | Built (samples; feedback; gain) |
   | --- | --- | --- | --- | --- | --- |
   | `closet` | Very small room | no, 120 x 140 x 100, 0.3 | room; 0, 1, 0, 1 | 102; 38/217 | R2's example 2: lines 1323 (3194; 1983), 2425 (2597; 2252); cutoff 2850 |
   | `small_room` | Small room | no, 200 x 260 x 120, 0.4 | room; 1, 2, 1, 1 | 102; 38/217 | 3 lines 1358 (3350; 1350), 2152 (2979; 1856), 2989 (2632; 1856) |
   | `room` | Room | no, 300 x 400 x 160, 0.4 | room; 2, 3, 2, 2 | 103; 41/214 | 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684; 764 to 1327) |
   | `large_room` | Large room | no, 500 x 700 x 220, 0.4 | room; 3, 3, 3, 3 | 103; 41/214 | 3 all-passes; 6 lines 1640 to 5300 (3661 to 2851; 545 to 1283) |
   | `great_hall` | Great hall | no, 700 x 1300 x 400, 0.4 | room; 4, 4, 4, 4 | 103; 41/214 | 3 all-passes; 8 lines 1887 to 7267 (3817 to 3123; 298 to 1039) |
   | `vent` | Vent or duct | no, 48 x 400 x 64, 0.4 | duct; 1, 0, 2, 1 | 106; 51/204 | lines 444 (3727; 1472), 3619 (1898; 4096); cutoff 3000 |
   | `corridor` | Corridor | no, 80 x 400 x 120, 0.4 | hall; 1, 1, 2, 1 | 110; 38/217 | predelay 2072 (factor 2703), 617 (1228; 2676), 308 (3481; 1607); cutoff 4500 |
   | `long_corridor` | Long corridor | no, 90 x 1200 x 120, 0.4 | hall; 2, 1, 4, 1 | 111; 38/217 | predelay 5733 (1720) and 5 lines 926, 308, 1719, 1234, 617 |
   | `tunnel` | Tunnel | no, 200 x 1000 x 150, 0.3 | tunnel; 2, 2, 3, 2 | 115; 72/183 | R2's example 3: 2 all-passes, predelay 3924 (2457) and 8 lines |
   | `big_tunnel` | Big tunnel | no, 280 x 1400 x 250, 0.4 | tunnel; 3, 2, 4, 3 | 115; 72/183 | 2 all-passes (feedback 611), predelay 5909 (2048) and 8 lines |
   | `alley` | Alley, walls all round | yes, 120 x 600 x 4800, 0.4 | alley; 1, 1, 3, 4 | 122; 24/231 | predelays 5997 (1130) and 3087 (901), line 2205 (2048; 3686); cutoff 3500 |
   | `street` | Street, walls all round | yes, 300 x 1300 x 4800, 0.4 | street; 3, 3, 4, 4 | 119; 23/232 | predelays 17287 (524) and 5292 (901), line 2998 (1769; 3686); cutoff 1750 |
   | `courtyard` | Courtyard | yes, 500 x 700 x 4800, 0.4 | courtyard; 3, 3, 3, 4 | 127; 5/250 | one echo: 5144 samples (116.67 ms), feedback 1802, gain 4915; cutoff 2760 |
   | `open` | Open ground (a guess) | yes, 2 x 2 x 4800, 0.08, 4 open sides | open space; 0, 0, 0, 4 | 130; 5/250 | all-pass 13230, 3 all-passes, delay 7937, 6 modulated lines 9702 to 14112 |

   The room's tail against the direct voice (R2's measure, the copy at time 0 and the resting offset left
   out): about -27 dB for the two small rooms, -11 to -13 dB for the three larger rooms, -22 to -25 dB for
   the vent and corridors, -5 to -6 dB for the tunnels, -31 and -36 dB for the alley and street, -47 dB for
   the courtyard; in the open it cannot be heard. **`open` is a guess between two readings of R2 e4**: a
   level ray that meets the sky gives a distance of 1 (spans of 2: this case, a copy of 130), one that meets
   nothing keeps 4800 (spans of 9600: size class 4, a copy of 131). Both give 5/250 and the same level. Its
   help text says so.
4. **A place** (for the owner's log, when it comes) is one more row of the same shape: a key, a label, the map
   and spot in words, and the measures the engine printed. `ROOM_PLACES` starts empty. Nothing else is
   needed to add one.

### Checks

- the shape and the classes for each named case, and at every threshold of e1 and e2 (a value on it, one
  under, one over; each judged against the model): 72, 144, 288, 576 for width; 144, 288, 576, 1152 for
  length; 48, 128, 216, 384 for height; 120, 240, 480, 1200 for the courtyards' size; 0.04, 0.5, 0.8
  (item 2); `L > 4 W`, `L > 2.5 W`, widths 48, 96 and 144; the shaft swap; one to four open sides;
- each case's built preset equals the model's, value for value in single precision, and its `describe()` the
  pinned integers; R2's two examples by their echo tables; the reference hashes and tail lengths of the 14
  cases; the synthetic pair "negative width and depth in templates" (110 with its width written -1, 111 with
  its depth written -1, the corridor's measures: built width 6.6666665, depth 33.333332, and its hash);
- mutations caught: the cutoff blended from the bright end; the copy taken from A at size class 2; a squared
  parameter made linear (and the reverse); the size class of a street taken from the mean; the diffuse pair
  chosen; the measured delay as length / 12; a negative template dimension interpolated.

### Files

`room-dsp.js`, `tests/room-dsp.verify.mjs`, `tests/roomdsp/` (`lines.py`, `lines.json`, `coefs.mjs`). Nothing
else.

## W3-17c: the render

**Depends on:** W3-10 merged (its mix stage and device stage are what this part builds on; read its report
first), W3-17b merged. No other `audio.js` order open.

### What to build

1. **Loading.** `audio.js` reads the module as the global `TF2Room` (and the table as `TF2_ROOM_PRESETS`),
   never by `require`, and **runs without it when no room is asked for**: only a render with a room or under
   water needs it, and says so by name if it is missing. The two files are loaded before `audio.js` by:
   `index.html`; the `importScripts` lines of `audio-worker.js` and `live-worker.js`; `sw.js`'s `ASSETS` (the
   browser suite compares that list with what the page links). A test that builds the engine in a vm context
   and renders a room `require`s the two files itself and puts them in the sandbox (`TF2Room`,
   `TF2_ROOM_PRESETS`): the module then runs at full speed, outside the vm. That is `tests/verify.js` and
   `tests/render-stream.verify.mjs`; the other loaders (`gain`, `gain-exact`, `formats`, `opus`, `speex102`,
   `reference.compare`) render no room and need no change.
2. **Options.** `opts.room`, resolved by one function that replaces `resolveRoom`:
   - `null`, `{ preset: 0 }`, `{ preset: 1 }` alone (the automatic room with nothing built yet, which is dry:
     R1 4), a number the table does not hold (Decision 11), and a custom room whose `trunc(mix x 256)` is 0:
     **no room**;
   - `{ preset: n }`: a preset of the table, 2 to 29;
   - `{ auto: key or measures }`: the automatic room built by part b;
   - `{ custom: { duration, decay, mix } }`: the extra, as today's `customChain` maps its knobs, on the
     engine's processors, with shares `trunc(mix x 256)` and `trunc(256 - mix x 256)`;
   - `opts.underwater`: the water slot.

   Today's `listenerPos`, `dspRoom` and `customEnv` are still read and mapped to these (part d changes what
   the page sends), so no caller breaks: an old position key gives the preset number it gave; `water` gives
   `underwater` with no room.
3. **No room, not under water: nothing of this order runs** (Decision 4). No slot is made, the output has no
   tail, and `codecInfo` gains no key. With a room or under water `codecInfo` gains one key, `room`: the
   shares, the preset's number or the case's key, the shape and classes of an automatic room, and the tail's
   length in mixer samples.
4. **The mix.** In W3-10's stage, a render with a room or under water does this, in the engine's order
   (W3-07 section 1; Decision 3): at the voice's own rate, each sample is entered twice by W3-10's entry
   function, with the volumes `255 x direct / 256` and `255 x room / 256` (`shares()` of the path, asked per
   512-sample mixer block); each of the two buffers is brought to 44100 Hz by W3-10's upsampling (nothing for
   a 44100 Hz voice); `createRoomPath().process(direct, room)` gives the sum; W3-10's clip, `volume`,
   rounding and device stage follow, unchanged. `spurtStart()` is called at each voice channel start the
   render knows (W3-02c's timeline; at the render's start otherwise). The room is set before the first
   sample: no fade at the start of a render. **If W3-10 as merged did not write its entry and upsampling as
   Decision 3 and its pointer say, stop and report**; do not work around it.
5. **The tail.** After the voice's last sample the render feeds zeros until `tailLeft()` says the output has
   ended (Decision 8), and that is the mixer output's end (then the device stage's own length rule).
   `process()` and `createRender` give the same samples: `createRender` no longer refuses a room;
   `outputLength` stays the length without a tail, a new `maxTail` gives the cap at the output's rate, and
   `finish()` returns the tail. List every reader of `outputLength` (`app/`, `batch.js`, the workers) and
   what each does with a tail. This replaces the room half of W2-04 (its re-timing half is W3-02's).
6. **What goes:** `dspDFR`, `dspRVA`, `dspDLY`, `dspAMP`, `dspMDY`, `runDspChain`, `customChain`, the 0.45
   mix, the listener position's extra low-pass (`extraLpf`) in `process()`, `createRender` and the live
   chain, and `TF2Audio.runDspChain` from the exports. Find every caller (`tests/verify.js` sections 7 and 8)
   and move it to the new option.

### Checks

- **A render with no room is bit for bit W3-10's.** Every case of `GOLDEN` in
  `tests/render-stream.verify.mjs` keeps **both** its hashes (the WAV's and `codecInfo`'s), **but one**: "test
  position with a low-pass", which tested the stage that goes, is removed with it. "steam, dsp_room 1 (no
  effect)" and "steam, custom room at mix 0 (no effect)" are no-room renders by item 2 and keep theirs. The
  builder shows this by running the suite before writing any new hash, and a check asserts that such a render
  made no slot (the module absent from the sandbox, the render still succeeds).
- W3-10's entry function equals `TF2Room.entry` on all 65,536 samples at shares 256, 229, 26 and 23.
- New golden cases, recorded once: `steam` with preset 6, with preset 17 (random taps), with the `tunnel`
  and `great_hall` cases, under water, under water with preset 6, the custom room at mix 0.3; `celt_22` with
  preset 6 (the entries before the upsampling); a room with loss and jitter; `dspRoom` 137 (no room: the
  hashes of the same render with none). Sources of 3 s. Each streams equal to `process()` at the chunk plans
  of that file. **Together they add under 30 seconds to `pnpm test`** on the build machine (say the time); if
  they cannot, they go in `tests/room-render.verify.mjs` under a `test:room` script that `test:all` and CI
  run as a step of their own.
- The render's room path equals the module run by hand on the render's own 16-bit voice (taken at the gain's
  output), sample for sample before the clip, tail length included, for preset 6, the tunnel and `celt_22`
  with preset 6: so nothing in `audio.js` rescales, delays or reorders it.
- A full-scale square wave through preset 6: the sum passes 32767 and is clipped there; the direct part alone
  tops out at `entry(32767, 229)` = 29196.
- `tests/verify.js` section 7: every preset 2 to 29 and every named case renders, ends under the cap, and has
  no sample past the clip. (No level check: the module's hashes pin more than a level would.)
- `pnpm test`, the browser suite and CI pass. `sw.js` cache version up.

### Files

`audio.js`, `audio-worker.js`, `live-worker.js` (loading only), `sw.js`, `index.html` (script tags only),
`tests/render-stream.verify.mjs`, `tests/verify.js`, `package.json` (only if `test:room` is needed),
`tests/predictions/PREDICTIONS.md` (the note), `tests/REFERENCE_2026.md` (below). Not `app/` beyond what
loading needs.

## W3-17d: the page and the live chain

### What to build

1. **Listener position** (`#listener_position`, saved as `pos`), in this order:
   - "No room effect (as the recordings show)", value `open`, the default;
   - a group "Automatic room: most maps. Examples by shape": the 14 named cases, values `auto_<key>`
     (`auto_closet` ... `auto_open`), each with its measures in its help text; then any `ROOM_PLACES`, values
     `place_<key>`;
   - a group "A room the map sets by number" (R1 4, from the soundscape scripts; a label names the script
     and the area, **not a map file**, since which map loads which script was not read), one option per
     number, values `room_<n>`: `room_2` harbor: spawn rooms and exits; `room_3` harbor: fuel rooms; `room_4`
     harbor: headquarters; `room_5` soho: underground; `room_11` soho: indoors; `room_17` warehouse: spawn and
     boilers, rottenburg: spawn; `room_18` warehouse: foyer, moonbase: underground; `room_21` soho: streets,
     rottenburg: town, medieval: outside; `room_25` warehouse: main hall; `room_26` halloween: underworld;
   - "Manual: number or measures below", value `manual`.

   One line under the control, shown whenever a room or under water is chosen: **"Room effects are read from
   the game's code. They have not been checked against a recording yet."**
2. **Manual** (advanced): `dsp_room` (`#env`, saved as `dsp`) 0 to 29 as now, 1 reading "1: automatic (the
   map measures the room; give the measures)"; with 1, six fields, saved as `asky`, `aw`, `al`, `ah`,
   `aopen`, `arefl`: under the sky, width, length, height (units), open sides, reflectivity; and a line that
   says what the engine would build ("tunnel; size class 2; from presets 114 and 115; 72/256 to the room").
   The console's `dsp_room` takes any whole number; one the table does not hold gives no room and the line
   "dsp_room N: the app has no such preset; the room is unchanged, as in the game" (Decision 11).
   **"Listener under water"** is its own checkbox (saved as `uw`): a state of the player, shown with no
   variable (`dsp_water` only names the preset, 14).
3. **Saved settings and share links.** `pos` values that go: `hallway`, `small_room`, `tunnel`, `tunnel_big`,
   `cavern`, `hangar`, `chamber`, `metal` become `manual` with `dsp` set to the number each stood for (22,
   17, 6, 7, 24, 10, 19, 4); `water` becomes `open` with `uw` on. So an old link gives the same preset, now
   as the engine renders it, without a name that is not true ("2fort sewers" is an automatic room, R1 5).
   `PRESETS.spam` takes `auto_tunnel`. **`PRESETS.sewers` is renamed `underwater`** (`open` with `uw` on):
   it never was a sewer, whose soundscape asks for the automatic room; `exec preset_sewers` answers with the
   new name. `ENV_ALIAS` (`room`, `locker`, `hall`) keeps its numbers. `LISTENER_POSITIONS` is rebuilt to
   the new list; `DSP_PRESETS` keeps names only (its numbers now live in `room-presets.js`).
4. **Every control, classified.** The rule: a control shows a variable's name (`class="cvar"`) only if the
   game has that variable; a control that is neither the game's nor a setting of one of the two PCs is an
   extra, and sits in one fieldset, "Extras: not in the game". The made-up names stay as console commands of
   the app. **Read the page as it stands when this part starts** (W3-11b, W3-02d, W3-02f and W3-10 change it
   first): a control this list does not name is reported, not guessed.

   | Side | Controls |
   | --- | --- |
   | The game's (name shown) | codec `sv_voicecodec` (its four game values); listener position and manual number `dsp_room`; the automatic room's six measures (what the map would measure; no name); under water (a state; no name); `voice_avggain`; `voice_maxgain`; `voice_scale`; `volume`; frames lost `net_fakeloss`; jitter `net_fakejitter`; live push-to-talk (`+voicerecord`) |
   | The two PCs (no variable name) | the sender's stereo capture choice (finding 6); the listener's sound device rate (W3-10); the live monitor's microphone and output device |
   | Extras: not in the game | mic gain (`voice_micgain`); high-pass and low-pass (`dsp_hpf`, `dsp_lpf`); the gate switch and its threshold as W3-11b leaves them (`voice_vad`, `voice_vad_threshold`); codec bypass (`snd_codec`); bitrate scale (`snd_bits`); packet length (`net_split`); auto-gain switch (`voice_agc`); talk-spurt timing (`voice_retime`, if W3-02f has not retired it); the custom room (`dsp_custom_*`, `dsp_room 99`); the "Fullband Opus" codec (marked in its option); live low latency |

   The game's own names are from its `find voice` output (it has `sv_voicecodec`, `voice_avggain`,
   `voice_maxgain`, `voice_scale` and none of the made-up ones) and the reports.
5. **Labels.** "Auto-gain: On (measured)" becomes "On (the game's rule)" (finding 26). "Mean → peak
   normalize" becomes "Gain target: mean (0) to peak (1)" with `voice_avggain`. "Open / Outdoor — dry (0)"
   goes (item 1). README's rooms paragraph, its pipeline line 4 and "Rooms are not applied live" are
   rewritten; the Facepunch link stays as where the numbers of presets 0 to 29 were first taken from.
6. **The live chain.** The room path (`createRoomPath`) lives in `live-worker.js`, outside the chain, so a
   settings change that rebuilds the chain keeps the room's lines. A change of room calls `setRoom`: the
   engine's 200 ms cross-fade (100 ms for the water slot); the shares follow `shares()` block by block
   (the limits from the next talk spurt on; 0 and 256 once a fade to none has ended: part a, item 11). At the
   context's rate the live chain converts as W3-10 left it. Measure the room's cost in the live worker on the
   build machine for `great_hall` during a fade and give it in the report (this plan's prototype: 167 ns a
   sample for two twelve-line presets, under 1% of real time).
7. **`batch.js`** and the downloads carry the tail (item 5 of part c).

### Checks

The browser suite: each old `pos` value in a share link lands on the new controls as item 3 says; a render
with each group's first entry plays and downloads with its tail; **the extras fieldset holds exactly the
controls of item 4's third row, and no control of the first two rows is in it** (the test carries that list,
copied from this order, not made from the page); a live room change gives no click (the worker's output across
the change equals the module's cross-fade on the same input). `pnpm test:all` and CI pass. `sw.js` cache
version up.

### Files

`index.html`, `style.css`, `app/`, `constants.js`, `live.js`, `live-worker.js`, `batch.js`, `README.md`,
`sw.js`, `tests/browser.verify.js`, `tests/verify.js` (the names it reads), `tests/REFERENCE_2026.md`.

## The owner's recording (handed over as it is)

**What it is for.** To check that the app's room effect is the game's, sample for sample: one numbered room,
one automatic room, and under water. About 25 minutes. Nothing here needs `sv_cheats`.

> **One more reading (the orchestrator fills this in before handing over, or deletes the box):**
> ______________________________________________

**Before the takes**

1. Windows: set the playback device to **44100 Hz** (Sound settings, the device, Advanced: 16 or 24 bit,
   44100 Hz). Record that device's output losslessly at 44100 Hz, as in the earlier takes (FLAC).
2. Start the game and load the map afresh on your own server: `map <the map of the earlier takes>`. A fresh
   load matters: it clears the room's memory of earlier sound.
3. Go to a **quiet spot with no steady sound near it** (no water, wind, machines or music) and stand still.
   Stay on that spot for takes R1 to R3. Moving can change the soundscape, which sets the room again.
4. `volume 1` — **turn the speakers down first.** `voice_loopback 1`.
5. The microphone is the test signal, as in the earlier takes (`tests/testsignal/`), followed by one spoken
   sentence. Leave **5 seconds of silence before pressing the voice key** in every take, and let go of the
   key between the signal and the sentence.
6. For each take: `voice_recordtofile 1` before you press the voice key and `voice_recordtofile 0` after
   (as for Set H). After each take copy `voice_decompressed.wav` out of the game's folder and name it after
   the take; the next take overwrites it.

**Nine readings.** Type each alone and note the answer: `dsp_room`, `dsp_automatic`, `dsp_mix_min`,
`dsp_mix_max`, `dsp_db_min`, `dsp_db_mixdrop`, `dsp_volume`, `dsp_enhance_stereo`, `snd_surround_speakers`.
Also note the map's name and where you stand.

**The takes**

| Take | Type, in this order | Then |
| --- | --- | --- |
| **R1** no room | `dsp_room 0` | type `dsp_room`: it must answer 0. Wait 5 s. Play the signal and the sentence |
| **R2** room 6, as the game shares it | `dsp_room 6` | type `dsp_room`: it must answer 6. Note `dsp_mix_min`, `dsp_mix_max`, `dsp_db_min`, `dsp_db_mixdrop` (expected 0.2, 0.7, 80, 0.5). Wait 5 s. Play |
| **R3** room 6, all of the voice through the room | do **not** type `dsp_room` again. `dsp_mix_min 1`, `dsp_mix_max 1`, `dsp_db_mixdrop 1` | these three must come after the room was set and before the voice key is pressed. Play. Leave **10 s of silence** at the end. Then put the values back: `dsp_mix_min 0.2`, `dsp_mix_max 0.7`, `dsp_db_mixdrop 0.5` |
| **R4** automatic room | `developer 1`, `adsp_debug 2`, `dsp_room 1`. Walk into a tunnel or a small room and stop | copy the console's new lines (`NEW DSP NODE ...` and the shape's name). Note `dsp_automatic` and the four values of R2's list. Then `dsp_mix_min 1`, `dsp_mix_max 1`, `dsp_db_mixdrop 1`, and play **without moving**, 10 s of silence at the end. Then put back the three values you just noted |
| **R5** under water (optional) | go under water **first** and stop; then `dsp_room 0` | play only the sentence: you have about ten seconds of air |

**Afterwards:** `dsp_room 1`, `volume` back to your own, `developer 0`, `adsp_debug 0`,
`voice_recordtofile 0`, then load the map again so that every room variable is the map's own.

**Send:** the five recordings, the five `voice_decompressed.wav` files, the nine readings, the values noted in
R2 and R4, and the console lines of R4.

**What the model says each take will show**

- **R1.** No room, no echo. The loudest flat parts of the signal sit at **32639** (255/256 of full scale). If
  they sit at **32510** instead, the game kept the last room's share after `dsp_room 0` while passing the
  sound straight through; the app assumes it does not, and this take decides.
- **R2.** The four values read 0.2, 0.7, 80, 0.5. The direct voice is at 229/256 of R1's and the room's part
  about 20 dB under it: after each sound, two faint negative echoes 573 and 837 samples later (13 and 19 ms),
  the strongest at 1410 samples (32.0 ms), the tail 60 dB down after 0.7 s. (The take shows the direct voice
  and the room together; the direct part alone would top out at 29196.)
- **R3.** No direct voice at all. After a click the output shows, in samples after it: a faint copy at once,
  -0.106 of the click at 573 and at 837, **0.69 of it at 1410**, then 0.104 at 1983; the pattern repeats
  every 661 and 2513 samples (15.0 and 57.0 ms). The silence at the end does not return to zero: it rests a
  few units below it (the model, from silence: between -8 and -6).
- **R4.** The printed measures, put into the app's build, name the same shape as the console did and give the
  four values you noted (a tunnel: 0.4, 0.9, 80, 0.7; a small room: 0.3, 0.8, 80, 0.5).
- **R5.** The voice at **0.40 of its level (8 dB down), steady**, and dull, with two short fluttering echoes
  (59 and 70 ms). The first read of the game predicted a tremolo, ten swings a second; the second read says
  there is none. This take decides.

**How it is scored** (the orchestrator, privately). Each take's own `voice_decompressed.wav` is run through
the app's gain, entry and room, starting from silence, and lined up with the recording by its largest sample.
For R1 and R3 (room 6 draws nothing at random) the two should be **equal sample for sample**. Two things can
spoil that with a correct model: the map's own sound, which passes the same room, and what the room held
before the take. So the comparison is reported twice, per second: from the start, and **from the second
stretch of speech on**, when the room's memory is the voice's own; each as the share of equal samples and the
largest difference, set against the tail's level at that moment. R2 the same, direct and room together. R4:
the shape and the four values, then sample equality if the built room draws nothing at random. R5: the level
ratio to R1 and the absence of a 10 Hz swing; samples cannot match (the water preset draws at random). A
difference of one unit in scattered samples points at a rounding; echoes at other delays point at a misread
line. Either is a finding for the skeptic before any code changes.

## Where the owner's answers plug in (nothing above waits for them)

| Answer | Goes into |
| --- | --- |
| `dsp_room` and the mix values at the takes' spot | Decision 1 and the page's first option. If `dsp_room` reads 1 there with an open-space header, the takes' flat tops contradict the 250/256 share: a finding for the skeptic, not a quiet change of the default |
| `adsp_debug 2` lines at known spots | rows of `ROOM_PLACES` (part b, item 4): map, spot, sky, width, length, height, reflectivity, open sides or the printed shape. The build of each is checked against the printed shape and, where noted, the header |
| which map | the words of the page's first option and of the new finding |
| take R1 | part a, item 11: when the "before" preset is cleared |
| take R4 at a reflectivity near 0.8, if one turns up | part b, item 2 |
| takes R2 to R5 | the finding moves from "read" to "checked"; the page's line under the control goes; the slot's ramp alignment and the water slot's start are confirmed or corrected |

## What moves

- **Golden hashes:** parts a and b, none (no page or render loads the module). Part c: none of the existing
  ones, WAV or `codecInfo`; one case removed; about eleven room cases added, once. Part d: none.
- **`sw.js`:** the cache version goes up in c (two new files in its list) and in d.
- **`tests/predictions/PREDICTIONS.md`:** part c notes that `audio.js` (a hashed model file) changed, that
  the predicted takes have no room, and that the golden renders with no room are unchanged.
- **`tests/REFERENCE_2026.md`:** (c) a new finding under **the next free number at merge**, "The room effect
  on a voice: read, not yet recorded": the map's soundscape sets `dsp_room`; 101 of 153 stock soundscapes ask
  for 1, the automatic room, built by shape and size from two authored presets; the voice's share is the
  preset's (26/256 for a numbered preset, 5 to 72 of 256 for the automatic room), the direct part `256 -
  share`; the room is mono, 44100 Hz, 32-bit integers, before the clip; under water the whole sum passes
  preset 14, whose amplifier settles at 0.40 and does not swing; random taps are seeded in the app; no
  recording with a room exists; the takes were made with no preset active. Finding 30's DSP line is
  corrected to point at it (R1 correction 5). A new row in the Model table: **Room** | the game: as that
  finding | the app: the engine's arithmetic from the reads, bit for bit against a second implementation;
  the automatic room by example measures, since the app has no map | basis: that finding; W3-15, W3-17.
  "What remains unverified": the rooms line is rewritten to say what is read and what a recording would add.
  (d) the same texts once the page's words are final.
- **W3-07's report and W3-15's:** the orchestrator adds a correction note at the end of each (direct edit):
  to W3-07 the three corrections of R1 "Corrections" 1 to 3 and R2 difference 16; to W3-15 that its account
  of `AMP` and of under water (section 2; section 5, row 8; section 6, check 6) is replaced by AM.
- **`README.md`:** part d (the rooms paragraph, the pipeline's mixer line, the live note, the file table).
- **`docs/work-orders/W2-04-stream-rooms-retime.md`:** its room half is replaced by part c; say so in PROGRESS.

## Not in these orders

The room measuring from a map's files (R2 e3, e4: rays, nodes, the rebuild rule). The surround paths. The
processors and options no preset of the table uses (listed under "The table"). `dsp_player`, `dsp_speaker`,
`dsp_spatial` and the facing-away slot (all off for a TF2 voice: R1 1, R1 4). `dsp_volume` other than 1 (no
TF2 soundscape sets it). A change of room inside an offline render. Game sound under the voice. The output
device stage and everything after the clip (W3-10). The receiver's timeline (W3-02).

## Open

1. **When the shares fall back to 0 and 256 after a room is taken away** (part a, item 11) and **how the
   slot's ramp lines up with the samples** ("The slot's ramp") are assumed, each one constant with its other
   reading written beside it. Neither touches an offline render with a fixed room. Take R1 settles the first.
2. **Whether going under water fades the water preset in, and over how long.** R1 1's slot table gives the
   water slot 100 ms; AM 5 speaks of 200. The order follows R1 1's table (the slot's own time) for a change
   during a live session, and starts a render that is under water from its first sample with the preset
   already settled.
3. **What real spots measure.** Every named case is an example, and `open` is a guess between two readings.
   The first `adsp_debug 2` log replaces guesses with places.
4. **Why the takes had no room.** Decision 1 rests on the flat tops and the level, not on a reading of
   `dsp_room`. An investigation is running.
5. **A reflectivity of exactly 0.8** (part b, item 2): the model's reading is built; the report's text says
   otherwise.
6. **Which map loads which soundscape script** was not read, so the fixed rooms are labelled by script and
   area.
7. **`powf` and `tan`** are closed for the table and the named cases (part a, items 3 and 6). They stay open
   only for values nobody pinned: the custom room's.
