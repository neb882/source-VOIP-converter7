# W3-17: the room effects as the engine does them

*Written 2026-11-10 from the two reads of the room DSP: `docs/reports/W3-15-room-dsp.md` (the first) and
`docs/reports/W3-17-room-dsp-second-read.md` (the second, independent; **it wins where they differ**). Below,
"R2 a" to "R2 f" are the second read's sections and "R1 1" to "R1 6" the first's. Not yet reviewed: a plan is
read by a different model before its build (`docs/PIPELINE.md`).*

| Part | What | Files it touches | Starts after | Budget |
| --- | --- | --- | --- | --- |
| **W3-17a** | the room module: the table, the processors, a preset, the slot and its cross-fade, the voice's shares and its entry into the mix, the tail's end | new files only | now; beside any order | 2 days |
| **W3-17b** | the automatic room in the module: the build from two templates, the named cases | the module's files only | W3-17a | 1 day |
| **W3-17c** | the render: `process()` and `createRender` use the module; the old processors go | `audio.js`, tests | **W3-10 merged**, and W3-17b; no other `audio.js` order open | 1.5 days |
| **W3-17d** | the page and the live chain: places, the extras group, the labels, saved settings | `app/`, `index.html`, `constants.js`, `live*.js`, `batch.js`, docs | W3-17c | 1.5 days |

**Kind:** code. `tf-builder` (effort xhigh for a and c, high for b and d), then `tf-reviewer`; the diffs of a,
b and c also get a second reader on the stronger model (they decide how a render is computed). **Branches:**
`claude/w3-17a-room-module`, `claude/w3-17b-auto-room`, `claude/w3-17c-room-render`,
`claude/w3-17d-room-page`, each from `main`. **Worktrees:** given in the brief.

## Why

A TF2 listener hears a voice through the map's room effect. The app's rooms are not the engine's: it mixes
45% wet where the engine sends 26/256 (R1 5, row 2: about 13 dB too wet), spreads the reverb's delays wrongly,
has no automatic room, which is what two soundscapes in three ask for (R1 4), and adds a 900 Hz filter under
water that the engine does not have. The two reads give the engine's arithmetic to the formula. This order
builds it.

**No recording with a room exists.** Until one does, the room effects are "read from the engine, not yet
checked against a recording", and the page says so. "The owner's recording" below is the procedure that would
check them.

## Decisions of this plan

1. **The default stays "no room".** The owner's takes show the voice at the full level to within 1% (W3-07
   section 1). A numbered preset would put the direct voice at 229/256 (10.5% low) and an automatic room in
   the open at 250/256 (2.3% low) (R1 4, "What a listener in the open gets"). So where the takes were made no
   preset was active. No evidence argues for another default. Why `dsp_room` was 0 there is not known (no
   stock soundscape gives it); the owner's console readings would say.
2. **Four parts, one file.** Parts a and b add new files only, so they do not wait for the `audio.js` queue
   (W3-11a, W3-16, W3-11b, W3-02c, W3-02d, W3-02f with W3-02e, W3-02g, W3-10). Parts c and d come after
   W3-10. This also follows the owner's priority (the modern preset before the rooms).
3. **W3-10 owns the mix stage; this order changes only its entry.** W3-10 builds, in `audio.js`: the voice
   into the mix at channel volume 255 (`trunc(s x 255 / 256)`), the sum, the clip at +-32767, `volume`, the
   rounding to 16 bits and the device stage. W3-17c changes one thing there: with a room active the voice's
   one entry becomes two (the direct share and the room share, the second through the room slot), summed
   before W3-10's clip; under water the sum passes the water slot before the clip. With no room the entry is
   W3-10's own code, untouched: a dry share of 256 gives volume 255 exactly, and the entry function of part a
   is tested to equal `trunc(s x 255 / 256)` on every 16-bit sample. **So W3-10 stays the last order that
   re-records every golden hash, and nothing is recorded twice:** part c adds hashes for room cases and
   moves none of W3-10's (see "What moves").
4. **The table is generated, in a file of its own.** `room-presets.js` holds the presets as numbers, made by
   a converter the orchestrator runs privately on the game's file. The test holds the table's hash. A
   reviewer who does not have the game's file checks the hash; the orchestrator, who has it, re-runs the
   converter. `constants.js`'s `DSP_PRESETS` keeps only names for the page (part d).
5. **The second reader's model goes into the repository as the oracle.** `tests/roomdsp/dspmodel.py` is our
   own code, written from the read before any build and by another hand than the builder's. CI stays
   Node-only: the model's outputs on the public table are recorded as hashes ("The reference" below), as
   W3-13 recorded the native library's. The builder builds from the reports and may run the model; **the
   builder may not change it.** The reviewer still writes a small model of its own, from R2's text alone, for
   one plain reverb, one reverb from three dimensions and the voice's entry, and runs it against both.
6. **Random taps are seeded.** The engine draws from its shared random stream (R2 a4), which cannot be
   reproduced. The app draws `lo + floor(u x (hi - lo + 1))` with `u` from `mulberry32` (the generator of
   `audio.js`), one stream per slot, seeded from the render's seed. Two runs of the game differ from each
   other in the same way, so the page says nothing about it; `tests/REFERENCE_2026.md` does.
7. **The tail ends by a rule on the room's own output, with a cap.** The engine's integer filters do not end
   at zero: the model's rooms rest at a constant or a small cycle between 0 and about -30 units (R2,
   difference 18; this plan's runs: -29 to -24 for the largest automatic room, -23 for preset 4, -22 in the
   open). So "until silent" cannot be "until zero". See part a, item 9.
8. **`AMP` and `MDY` rest on the first read only** (R2 "Still not read"). They are needed for under water
   (preset 14) and preset 16. Part a builds them from R1 2 with the gaps filled as item 8 of part a says,
   marked in the code and on the page as "read once". A short read of the two (addresses in R1 2) would
   settle them; it is not ordered here (see "Open").
9. **The custom room (99) stays, as an extra,** rebuilt on the engine's processors, so one implementation
   serves everything. Its sound changes. It is not the game's and the page says so.

## The reference

### The table

`tests/roomdsp/convert.py` (ours; the orchestrator commits it, the model and `reference.py` to
`tests/roomdsp/` in a direct commit before part a starts) reads the game's `scripts/dsp_presets.txt` (46,419
bytes, CRC-32 2441946680; the script prints both and stops if they differ) and writes the canonical table:

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
  missing values are 0.

**The table is 5,515 bytes and its SHA-256 is
`0586a404ca16112dfc7c2b40d5685c237294a32047fd10d1a0267339ad669350`** (this plan's run). Facts about it that
the tests assert: every header's duration and fade are 0; every preset is a plain chain; the processor counts
are `RVA` 35, `DFR` 26, `DLY` 16, `NULL` 2, `AMP` 1 (preset 14), `MDY` 1 (preset 16); no `FLT` processor;
no value is outside the engine's range table (R2 0), so the clamp changes nothing in it; the values of
presets 0 to 29 equal today's `DSP_PRESETS` (R1 3). Nothing of the file's text or comments is copied.

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
| `AMP` (R1 2) | gain swinging 1.0 to 0.4, ten turns a second, no clip | 14 |
| `MDY` (R1 2) | a 500 ms `PLAIN` delay with random taps, mix 1 | 16 |

Not used by any of them, and **not built** (a preset that asks for one is refused by name when it is built):
the `FLT` processor (so "quality" and the band-pass, R2 c), `DLINEAR` (3), the four-tap kinds (5, 6) and so
the tap factor (R2 a3, a4's quirk), a negative width, depth or height, a one-shot duration, a header's own
fade time, and every configuration but the plain chain.

### The shares (R2 f, model)

For a voice (60 dB, 12 units away, `dsp_dist_min` 0, `dsp_dist_max` 1440, `dsp_volume` 1), by header
`(mix min, mix max, dB min, mixdrop)`, room / direct of 256:

`(0.2, 0.7, 80, 0.5)` 26/229 · `(0.3, 0.8, 80, 0.5)` 38/217 · `(0.32, 0.8, 80, 0.5)` 41/214 ·
`(0.4, 0.9, 80, 0.5)` 51/204 · `(0.4, 0.9, 80, 0.7)` 72/183 · `(0.3, 0.8, 75, 0.3)` 23/232 ·
`(0.32, 0.8, 60, 0.3)` 24/231 · `(0.21, 0.8, 95, 0.1)` and `(0.22, 0.6, 95, 0.1)` 5/250.
A distance of 11 gives the same integers (R2 f). `(1, 1, any, 1)` gives 256/0: the fully wet voice of the
owner's recording.

### The voice's entry into the mix (W3-07 section 1; R2 f)

`entry(s, share) = trunc( single( s x (255 x share / 256) ) / 256 )`: the 16-bit sample times the channel's
float volume, **rounded to single precision once**, times 1/256 (exact), truncated toward zero. `255 x share /
256` is exact in single precision for every whole share. The rounding matters: `entry(-32690, 229)` is
**-29128**, where exact division would give -29127, and `entry(31388, 23)` is **2809**, not 2808 (28 of the
65,536 samples differ at share 229, 2 at share 23, **none at share 256**). Fixed points: `entry(32767, 256)`
= 32639, `entry(-32768, 256)` = -32640, `entry(16384, 229)` = 14598, `entry(16384, 26)` = 1657,
`entry(16384, 256)` = 16320.

### Echo tables (R2 "Model")

R2 gives the first ten echoes (sample, value) of preset 6, of the small automatic room and of the tunnel, and
the built lines of each. **Its convention feeds the preset `64 x room share` directly** (1664, 2432, 4608 for
an impulse of 16384), not through `entry`: the tests do the same. Through `entry` (input 1657) preset 6 gives
(0, 26) (573, -177) (837, -178) (1146, -28) (1235, -16) (1410, 1147) (1499, -16) (1674, -28); fully wet
(input 16320) it gives (0, 265) (573, -1738) (837, -1738) (1146, -262) (1235, -153) (1410, 11317)
(1499, -153) (1674, -262) (1983, 1696) (2072, 997).

### The model's outputs (`tests/roomdsp/reference.py`, this plan's run)

One case per preset of the table but 0, 1, 14 and 16, and one per named case of part b. A case: 22,050 samples
drawn with `mulberry32(1)` as in `audio.js` (`s = floor(u x 65536) - 32768`), each through `entry(s, room
share)`, then 66,150 zeros; the preset starts from silence; random taps from `mulberry32(2)`. The hash is
SHA-256 of the 88,200 outputs as 32-bit little-endian integers. A "speech" case is speech-like and in whole
numbers: for sample `k` of 88,200, `ph = k mod 17640`; 0 if `ph >= 8820` (no draw), else `trunc(noise x
min(ph, 8820 - ph) / 4410)` with the noise drawn from `mulberry32(3)`; then 44,100 zeros; 132,300 outputs.
Each line: the case, room/direct of 256, the hash.

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
preset 15            26/229  a51bdd08a1159de92b0342bb6a4df15864ad4e8b31a792a2bc48bba2da81e15b
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
speech preset 6      26/229  30696707ada24ecb5ec447ddda0c232185faf702b0a77e1d45ab7126bf08e58f
speech preset 17     26/229  73547b34edb1d20a88d2c907fecff487445c5ab0a0d467011797418a3f1c19b8
speech preset 21     26/229  0b30f6021fb2f07cc5a373e63e43687ded807f9bbba0b5cfa233f122edfea146
speech preset 25     26/229  3c0842a67ec795b767c2773e22fa4664f16261940aeb85506b5be3cbaccc70fe
speech preset 103    41/214  6ebfc59d0c5e6cfc65636340adbafcfe96ea765eaaaecbcf09dc33d17749ae4b
auto closet          38/217  a28624a827ac4f2d5681b226351c27236d15e788c891363e327ec745a634cedf
auto small room      38/217  ec20da27d480d94d58e5447dac03d11934aea57e15bd03c6deebf19793d824bf
auto room            41/214  45ef4fc5e0ca036c9f3846eaaf24e8f2ea2267fedc4956b0f69c561e7b04e04a
auto large room      41/214  5883c1d98d62854cc150fe4b15d25e62c3359d69b69364cdb00e10e6884053f7
auto great hall      41/214  03dae0e55f8ff67258cfdcb4df8c62c6309c68b9a273944822c2238fb2207ab8
auto vent            51/204  f8298b1832185a9c587f14cf486d54a699412a077e5be9f50cf9f5ac56819a42
auto corridor        38/217  968688f0ee2a5ac7ce6bc1d2bcbb05552830811bc0506b9e20ba2c57d7317aa0
auto long corridor   38/217  1bef090c4b6bc4b5a9410043efeb2a9bd0a1144aa176c9516e9bda531d372961
auto tunnel          72/183  cc413ce5c4436f38d6838a46b5cdde74576ccecb049e5ec5602610cef5509559
auto big tunnel      72/183  ce2a7e6603b9829a445b0ef87f1d2ecd2492f43cd59ce6e2a69d80220e812631
auto alley           24/231  5bab94ce2848ca75d056b1df31981f8696c1d32ec48183f872f3b8925dc01a6a
auto street          23/232  7454199f0ee87ad7148d45ab83a6c621859cce68bc300579148ffcefb3487866
auto courtyard       5/250   215161d1fe07d0c24cb84cb4df181f8960646cc1fae88a4c4ffb254dc373a4c6
auto open ground     5/250   b9ef52b72533aef6d11af53f345dee120a50369bf48c41a5b4f0a5df7fc7b851
```

Presets 26 to 29 are the same preset. The slot's 200 ms ramp (R2 d, a4; the model's `Ramp(0.2)`): step 486957
in 12.20 fixed point; `x` is 0, 0, 1, 1 for the first four samples, 2048 at sample 4410, 4095 at the last
faded samples, and the fade is over at the 8,821st sample.

## W3-17a: the room module

### What to build

1. **`room-presets.js`**: the converter's canonical JSON inside a classic script in the form of
   `steam-sender.js` (it sets `module.exports` under Node and `root.TF2_ROOM_PRESETS` elsewhere; no imports).
   A header comment says it is generated and from what (the file's size and CRC-32), and that it is not edited
   by hand. The orchestrator supplies the JSON; the builder wraps it.
2. **`room-dsp.js`**, the same form, `root.TF2Room`. All sample arithmetic is 32-bit signed integers: a
   product is `Math.imul`, a sum is `| 0`, a shift is `>> 12` (**it rounds down, toward minus infinity**; never
   `Math.trunc(x / 4096)`). Every single-precision step of a builder is `Math.fround` per operation, in the
   order the read gives; a double step is a plain double. Where R2's words leave a detail open (the ramp's
   last sample, a clamp's order), `dspmodel.py` is the same reader's record of it: follow it and say where
   you did.
3. **The filter section** (R2 c): `w = tan(cutoff x 7.123792865e-5)` in double, `p = (1 - w) / (1 + w)`,
   `a1 = trunc(-4096 p)`, `b0 = b1 = trunc(2048 (1 - p))`. Per sample `w0 = d - (w1 x a1 >> 12)`,
   `y = (w0 x b0 + w1 x b1) >> 12`, `w1 = w0`; a section whose state and input are both 0 returns 0 without
   computing. **`Math.tan` is not the same in every engine, so the coefficients are a table**: for the cutoffs
   the 46 presets hold (900, 1000, 1500, 1800, 2000, 3000, 3500, 4000, 5000, 6000 Hz) and every cutoff part
   b's build can give (item 3 of part b lists them), `(a1, b0)` are stored in the module, computed once under
   Node by `tests/roomdsp/coefs.mjs` and checked against the model's (this plan's run): 900 Hz
   `(-3601, 247)`, 1000 `(-3550, 272)`, 1500 `(-3302, 396)`, 1800 `(-3160, 467)`, 2000 `(-3068, 513)`, 3000
   `(-2635, 730)`, 3500 `(-2433, 831)`, 4000 `(-2240, 927)`, 5000 `(-1874, 1110)`, 6000 `(-1532, 1281)`; and
   of part b's cases 1050 `(-3524, 285)`, 1750 `(-3183, 456)`, 2760 `(-2735, 680)`, 2850 `(-2697, 699)`, 4500
   `(-2054, 1020)`. If Node's `Math.tan` gives another integer for one of them, the model's stands and the
   report says which. A cutoff not in the table is computed with `Math.tan` and the instance's description
   marks it "not pinned".
4. **The delay** (R2 b), kinds 0, 1, 2 and 4, each as R2 gives it per sample, with: the buffer of `D + 1`
   integers; the feedback capped at 4095; **the gain cut in its exact form** (`g = min(a / 4096, 0.999)` in
   single; `k = clamp(trunc(4096.0 / double(1 / (1 - g))) x 4, 1024, 4096)`; gain = `trunc(k x (b or 4096 if
   b is 0) / 4096)`; R2 difference 7: preset 17's first line is **381**); for kinds 2 and 4 the filter's `b0`,
   `b1` multiplied by `a / 4096` and truncated (the feedback lives in the filter); kind 4 with feedback 0 and
   **gain 4096 whatever the reverb's gain** (R2 difference 4). As a processor (`DLY`): `D = trunc(|ms| x
   44.1)` in single, `a = trunc(fb x 4096)`, `b = trunc(gain x 4096)`; **only the filter's first section**
   (R2 difference 8); kinds 3, 5, 6 are refused.
5. **The diffusor** (R2 c): stage `i` of `n = clamp(trunc(count), 1, 8)` has `D = trunc(size x T[i]) x 44100
   / 1000` in integers (**the time is cut to whole milliseconds first**: 573, 837, 1146, 926 samples at size
   1), `T` = 13, 19, 26, 21; `a = trunc(min(fb x 4096, 4091.9))`; gain 0 means 1; each stage a delay of kind
   1 (so the gain cut applies).
6. **The reverb** (R2 a): the plain variant (a1) and the variant from width, depth and height (a2), the
   lines built as a3 says, modulation as a4. Every one of these is a place a builder would simplify, and
   each is a requirement with its own check:
   - plain: `step = (size - min) x (1 / m)` (**a reciprocal multiplied**), `D[i] = trunc((trunc(i x step) +
     min) x 44.1)`: **two truncations, and the far delay is never reached** (preset 6: 661 and 2513 samples,
     not 100 ms); feedback of line `i` is `powf(fb, D[i] / D[0])`; gain `trunc(gain x 4096 x (1 / m))`;
   - three dimensions: the count forced to 3, 6, 9 or 12; sizes and factors sorted together; the feedbacks
     from the **truncated** sizes when the three factors are 0; the push-apart term **computed once and
     reused** (R2 difference 2); gain by a **division** here; a negative factor in the first round is a
     **predelay** (kind 4, the whole size, gain 1.0); in later rounds the size is **quartered, floor 7 ms**,
     and the sign dropped (R2 difference 1); the extra `max(S x 0.18 x round, 7 x round)`; `D = total x 44100
     / 1000` in integers;
   - **the predelay is not scaled by gain / m**, and a line's filter ignores "quality";
   - no filter in the loop: plain lines and **two** low-pass sections in series on the sum;
   - modulation: a draw **every period + 1 samples** per line (R2 difference 5), in line order; depth,
     period and glide from the line's own length; the cross-fade `old + (((new - old) x r) >> 12)` with the
     12.20 ramp.
   - **`powf`**: `Math.fround(Math.pow(Math.fround(fb), Math.fround(ratio)))`. The result feeds
     `trunc(min(x 4096, 4091.9))`, so a last-bit difference between a C library's `powf` and this can move a
     feedback integer by one at an exact boundary (R2 "Model"). The module's description of an instance
     lists every line's integers, and the test pins them for every preset of the table and every named case
     (from the model), so a platform that differs fails loudly. Nothing else is to be done about it here.
7. **A preset instance**: the processors in the file's order, out of one into the next, nothing after (R2 d);
   each value clamped by the engine's range table first, **a value of exactly 0 never clamped** (R2 0);
   `describe()` returns each processor's built integers (delays, feedbacks, gains, filter coefficients), for
   the tests and for the page's help.
8. **`AMP` and `MDY`, from R1 2, "read once".** `AMP` for preset 14's values only (threshold 0, so no clip
   path: a preset with a threshold is refused): `out = (g x x) >> 12`, `g` an integer with 4096 as 1.0; every
   `trunc(44100 / max(rate, 0.01))` samples the target turns between `gain` and `gain x (1 - depth)`; `g`
   moves to it in a straight line over the glide time. `MDY`: a delay of the given kind with a4's modulation,
   its period `trunc(44100 / rate)`, its depth the file's value, its glide the file's milliseconds; mix 1
   gives the delay's output. **Filled in, not read:** the ramp is a4's 12.20 ramp over `trunc(glide x 44.1)`
   samples; the counter is tested as a4's (a turn every period + 1 samples); the first target after a start is
   the lower one. Each of the three is one named constant or function with the comment "assumed (W3-17a);
   not read".
9. **The slot** (R2 d): one channel; `set(preset or null)`; `process(in, out)`. A change is taken at the next
   512-sample block of the slot's own count, and only when no fade is running; both instances then run on
   the same input for 8,821 samples and `out = old + (((new - old) x r) >> 12)`; "none" is the input
   itself. A slot made with a preset starts with the fade over and the lines silent. One random stream per
   slot; during a fade the old instance draws first. **`settled()`**: true when the slot's last 22,050 outputs
   lie within 8 units of each other (max - min <= 8) and its input over them was 0: the rule that ends a
   tail. In this plan's runs the model's rooms reached their resting band 0.5 to 6.3 s after half a second
   of full-scale noise (the longest: presets 2 and 22, the large automatic rooms and the open), and no
   resting band was wider than 6 units; the cap is 441,000 samples.
10. **The voice's shares and entry**: `shares(header)` as R2 f in single precision (the drop when `60 <=
    trunc(dB min)`; `M = mix x 256`; room `min(trunc(M), 256)`; direct `trunc(256 - M)`), and `entry(s,
    share)` as above.
11. **`createVoiceMix({ seed })`**: what part c calls. `setRoom(preset or null)`, `setWater(on)`,
    `spurtStart()` (the shares in force are read **here**, at a voice channel's start, and held until the
    next: R2 f), `process(Int16Array voice) -> Int32Array` = `direct + room slot(room input)`, then through
    the water slot (preset 14) if on: the sum **before the clip**, which is W3-10's. `settled()` and the cap
    as item 9. With no room and no water it returns `entry(s, 256)`.

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
| quality applied inside a line, or two sections in the loop | preset 6's echo table |
| the predelay scaled by gain / m | the tunnel's pinned predelay (gain 4096) and its reference hash |
| later rounds not quartered; the push-apart term recomputed | the tunnel's nine lines; a synthetic preset where the two differ |
| the gain cut as `trunc(4096 x (1 - fb))` | preset 17's 381 |
| a draw every `period` samples | the hashes of the modulating presets; a count of draws in 10 s |
| `entry` without the single rounding, or rounded | the two fixed samples above; all 65,536 at shares 229 and 256 |
| the diffusor's time not cut to whole milliseconds | 573, 837, 1146, 926; a size of 0.9 |
| a value of 0 clamped (a count of 0 made 1) | a synthetic preset |

- the table: its SHA-256, and the facts listed under "The table";
- every preset of the table and (after part b) every named case: `describe()` equals the pinned integers
  (taken from the model once, kept in `tests/roomdsp/lines.json`);
- R2's three echo tables, sample and value, and its built lines for preset 5, 6, 17 (381, 470, 558, 642, 725,
  806), 102 and 114;
- **the reference hashes above, every one** (from the model; `reference.py` regenerates them and is not in
  CI);
- chunking: `process` in pieces of 1, 127, 512, 4096 and seeded random sizes gives the whole-run samples, for
  five presets, a fade included;
- the slot: a change during a fade waits; the ramp's numbers above; a fade to "none" ends on the input bit for
  bit; `settled()` on presets 6, 25 and 103 within the cap;
- the shares for every header of the table, and `(1, 1, 80, 1)` gives 256/0;
- `createVoiceMix` with no room equals `trunc(s x 255 / 256)` for every 16-bit sample.

**Stop and ask** if a reference hash cannot be met: give the preset, the first differing sample and which of
the two (module or model) the report's text supports. Do not adjust the reference or the model.

### Files

May add: `room-presets.js`, `room-dsp.js`, `tests/room-dsp.verify.mjs`, `tests/roomdsp/` (`lines.json`,
`coefs.mjs`; `convert.py`, `dspmodel.py`, `reference.py` are the orchestrator's). May touch: `package.json`
(the `test` line). Nothing else: no page loads the module yet.

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
   a delay written negative becomes `clamp(length / 6, 14, 500)` ms. Diffusion is always class 0 (R2 e4). It
   returns the preset (header included), the shape's name, the classes and the pair. The measuring itself
   (rays, nodes, the rebuild rule: e3, e4) is not built.
2. **The named cases**, `ROOM_CASES` in `room-dsp.js`. The app has no map, so a case is a set of measures
   that the shape rules name the way the label says. **Each is an example: no real spot has been measured.**
   A unit is an inch to this code (e1 divides by 12 for feet). All sit in reflectivity class 1 (four walls
   and a floor at the default 0.5; no surface's value has been read). This plan's run of the model:

   | Key | Label | Sky, width x length x height, reflectivity | Shape; classes size, width, length, height | Copy; shares | Built (samples; feedback; gain) |
   | --- | --- | --- | --- | --- | --- |
   | `closet` | Very small room | no, 120 x 140 x 100, 0.3 | room; 0, 1, 0, 1 | 102; 38/217 | R2's example 2: lines 1323 (3194; 1983), 2425 (2597; 2252); cutoff 2850 |
   | `small_room` | Small room | no, 200 x 260 x 120, 0.5 | room; 1, 2, 1, 1 | 102; 38/217 | 3 lines 1358 (3350; 1350), 2152 (2979; 1856), 2989 (2632; 1856) |
   | `room` | Room | no, 300 x 400 x 160, 0.5 | room; 2, 3, 2, 2 | 103; 41/214 | 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684; 764 to 1327) |
   | `large_room` | Large room | no, 500 x 700 x 220, 0.5 | room; 3, 3, 3, 3 | 103; 41/214 | 3 all-passes; 6 lines 1640 to 5300 (3661 to 2851; 545 to 1283) |
   | `great_hall` | Great hall | no, 700 x 1300 x 400, 0.5 | room; 4, 4, 4, 4 | 103; 41/214 | 3 all-passes; 8 lines 1887 to 7267 (3817 to 3123; 298 to 1039) |
   | `vent` | Vent or duct | no, 40 x 400 x 40, 0.5 | duct; 1, 0, 2, 0 | 106; 51/204 | lines 444 (3727; 1472), 3619 (1898; 4096); cutoff 3000 |
   | `corridor` | Corridor | no, 80 x 400 x 120, 0.5 | hall; 1, 1, 2, 1 | 110; 38/217 | predelay 2072 (factor 2703), 617 (1228; 2676), 308 (3481; 1607); cutoff 4500 |
   | `long_corridor` | Long corridor | no, 90 x 1200 x 120, 0.5 | hall; 2, 1, 4, 1 | 111; 38/217 | predelay 5733 (1720) and 5 lines 926, 308, 1719, 1234, 617 |
   | `tunnel` | Tunnel | no, 200 x 1000 x 150, 0.3 | tunnel; 2, 2, 3, 2 | 115; 72/183 | R2's example 3: 2 all-passes, predelay 3924 (2457) and 8 lines |
   | `big_tunnel` | Big tunnel | no, 280 x 1400 x 250, 0.5 | tunnel; 3, 2, 4, 3 | 115; 72/183 | 2 all-passes (feedback 611), predelay 5909 (2048) and 8 lines |
   | `alley` | Alley, walls all round | yes, 120 x 600 x 4800, 0.4 | alley; 1, 1, 3, 4 | 122; 24/231 | predelays 5997 (1130) and 3087 (901), line 2205 (2048; 3686); cutoff 3500 |
   | `street` | Street, walls all round | yes, 300 x 1300 x 4800, 0.4 | street; 3, 3, 4, 4 | 119; 23/232 | predelays 17287 (524) and 5292 (901), line 2998 (1769; 3686); cutoff 1750 |
   | `courtyard` | Courtyard | yes, 500 x 700 x 4800, 0.4 | courtyard; 3, 3, 3, 4 | 127; 5/250 | one echo: 5144 samples (116.67 ms), feedback 1802, gain 4915; cutoff 2760 |
   | `open` | Open ground | yes, 2 x 2 x 4800, 0.08, 4 open sides | open space; 0, 0, 0, 4 | 130; 5/250 | all-pass 13230, 3 all-passes, delay 7937, 6 modulated lines 9702 to 14112 |

   The room's tail against the direct voice (R2's measure, the copy at time 0 and the resting offset left
   out): about -27 dB for the two small rooms, -11 to -13 dB for the three larger rooms, -22 to -25 dB for
   the vent and corridors, -5 to -6 dB for the tunnels, -31 and -36 dB for the alley and street, -47 dB for
   the courtyard; in the open it cannot be heard. **`open` is the
   weakest case**: under an open sky R2 e4 gives a distance of 1 for a level ray that meets the sky, so the
   measured width and length would be 2; what a real open spot measures is not known.
3. Every cutoff these cases and the pairs can give is `B + (A - B) x k / 4` for `k` 0 to 3 (and a delay's by
   fifths): add each to part a's coefficient table (`coefs.mjs` lists them from the table itself).
4. **A place** (for the owner's log, when it comes) is one more row of the same shape: a key, a label, the map
   and spot in words, and the measures the engine printed. `ROOM_PLACES` starts empty. Nothing else is
   needed to add one.

### Checks

- the shape and the classes for each named case, and at every threshold of e1 and e2 (a value on it, one
  under, one over): 72, 144, 288, 576 for width; 144, 288, 576, 1152 for length; 48, 128, 216, 384 for
  height; 120, 240, 480, 1200 for the courtyards' size; 0.04, 0.5, 0.8; `L > 4 W`, `L > 2.5 W`, widths 48, 96
  and 144; the shaft swap; one to four open sides;
- each case's built preset equals the model's, value for value in single precision, and its `describe()` the
  pinned integers; R2's two examples by their echo tables; the reference hashes of the 14 cases;
- mutations caught: the cutoff blended from the bright end; the copy taken from A at size class 2; a squared
  parameter made linear (and the reverse); the size class of a street taken from the mean; the diffuse pair
  chosen; the measured delay as length / 12.

### Files

`room-dsp.js`, `tests/room-dsp.verify.mjs`, `tests/roomdsp/` (`lines.json`, `coefs.mjs`). Nothing else.

## W3-17c: the render

**Depends on:** W3-10 merged (its mix stage and device stage are what this part builds on; read its report
first), W3-17b merged. No other `audio.js` order open.

### What to build

1. **Loading.** `room-presets.js` and `room-dsp.js` are loaded wherever `steam-sender.js` is (the page, the
   two workers, `sw.js`'s list, the tests' loaders), before `audio.js`.
2. **Options.** `opts.room`, resolved by one function that replaces `resolveRoom`:
   `null` or `{ preset: 0 }`: none. `{ preset: n }`: a preset of the table, 2 to 29. `{ preset: 1 }` alone:
   the automatic room with nothing built yet, which is dry (R1 4). `{ auto: key or measures }`: the automatic
   room built by part b. `{ custom: { duration, decay, mix } }`: the extra, as today's `customChain` maps
   its knobs, on the engine's processors, with shares `trunc(mix x 256)` and `trunc(256 - mix x 256)`.
   `opts.underwater`: the water slot. Today's `listenerPos`, `dspRoom` and `customEnv` are still read and
   mapped to these (part d changes what the page sends), so no caller breaks: an old position key gives the
   preset number it gave; `water` gives `underwater` with no room.
3. **The mix.** Where W3-10 enters the voice at 255/256, a render with a room or under water calls
   `createVoiceMix` instead, on the same 16-bit samples, and hands its sum to W3-10's clip, `volume`, rounding
   and device stage, unchanged. For the engine codecs (22050 and 11025 Hz voice) the two entries are made
   where W3-10 makes its one, and the room slot runs at 44100 Hz on the room buffer after the mixer's
   upsampling (W3-07 section 1: a channel is mixed at its own rate, then every buffer is upsampled). If
   W3-10 as merged enters after its upsampling, do as it does and say so in the report. `spurtStart()` is
   called at each voice channel start the render knows (W3-02c's timeline; at the render's start otherwise).
   The room is set before the first sample: no fade at the start of a render.
4. **The tail.** After the voice's last sample the render feeds zeros in 512-sample blocks until
   `settled()`, at most 441,000 samples, and that is the output's end (then the device stage's own length
   rule). `process()` and `createRender` give the same samples: `createRender` no longer refuses a room;
   `outputLength` stays the length without a tail, a new `maxTail` gives the cap at the output's rate, and
   `finish()` returns the tail. List every reader of `outputLength` (`app/`, `batch.js`, the workers) and
   what each does with a tail. This replaces the room half of W2-04 (its re-timing half is W3-02's).
5. **What goes:** `dspDFR`, `dspRVA`, `dspDLY`, `dspAMP`, `dspMDY`, `runDspChain`, `customChain`, the 0.45
   mix, the listener position's extra low-pass (`extraLpf`) in `process()`, `createRender` and the live
   chain, and `TF2Audio.runDspChain` from the exports. Find every caller (`tests/verify.js` sections 7 and 8)
   and move it to the new option.

### Checks

- **With no room the render is bit for bit W3-10's.** Every case of `GOLDEN` in
  `tests/render-stream.verify.mjs` keeps its two hashes, **but one**: "test position with a low-pass", which
  tested the stage that goes, is removed with it. "steam, dsp_room 1 (no effect)" and "steam, custom room at
  mix 0 (no effect)" keep theirs: the first is the engine's own case, the second has a room share of 0. The
  builder shows this by running the suite before writing any new hash.
- New golden cases, recorded once: `steam` with preset 6, with preset 17 (random taps), with the `tunnel`
  and `great_hall` cases, under water, under water with preset 6, the custom room at mix 0.3; `celt_22` with
  preset 6; a room with loss and jitter. Sources of 3 s (a vm context runs the room slowly). Each streams
  equal to `process()` at the chunk plans of that file.
- The render's room path equals the module run by hand on the render's own 16-bit voice (taken at the gain's
  output), sample for sample before the clip, for preset 6 and the tunnel: so nothing in `audio.js` rescales
  or delays it.
- A full-scale square wave through preset 6: the sum passes 32767 and is clipped there; the direct part alone
  tops out at `entry(32767, 229)` = 29196.
- `tests/verify.js` section 7: every preset 2 to 29 and every named case renders, ends within the cap, has
  no sample past the clip; the levels of R1 3's table within 1 dB for the non-modulating ones.
- `pnpm test`, the browser suite and CI pass. `sw.js` cache version up.

### Files

`audio.js`, `audio-worker.js`, `live-worker.js` (loading only), `sw.js`, `index.html` (script tags only),
`tests/render-stream.verify.mjs`, `tests/verify.js`, other test loaders, `tests/predictions/PREDICTIONS.md`
(the note), `tests/REFERENCE_2026.md` (below). Not `app/` beyond what loading needs.

## W3-17d: the page and the live chain

### What to build

1. **Listener position** (`#listener_position`, saved as `pos`), in this order:
   - "No room effect (as the recordings show)", value `open`, the default;
   - a group "Automatic room: most maps. Examples by shape": the 14 named cases, values `auto_<key>`, each
     with its measures in its help text; then any `ROOM_PLACES`;
   - a group "A room the map sets by number" (R1 4, from the soundscape scripts; the labels name the script
     and the area, **not a map file**, since which map loads which script was not read): `harbor`: spawn
     rooms and exits (2), fuel rooms (3), headquarters (4); `soho`: underground (5), indoors (11), streets
     (21); `warehouse`: spawn and boilers (17), foyer (18), main hall (25); `rottenburg`: spawn (17), town
     (21); `medieval`: outside (21); `moonbase`: underground (18); `halloween`: underworld (26);
   - "Manual: number or measures below".
   One line under the control, always visible when a room is chosen: **"Room effects are read from the game's
   code. They have not been checked against a recording yet."**
2. **Manual** (advanced): `dsp_room` 0 to 29 as now, 1 reading "1: automatic (the map measures the room;
   give the measures)"; with 1, six fields: under the sky, width, length, height (units), open sides,
   reflectivity, and a line that says what the engine would build ("tunnel; size class 2; from presets 114
   and 115; 72/256 to the room"). **Under water** is its own checkbox (`dsp_water` 14), marked "read once".
3. **Saved settings and share links.** `pos` values that go: `hallway`, `small_room`, `tunnel`, `tunnel_big`,
   `cavern`, `hangar`, `chamber`, `metal` become `manual` with `dsp` set to the number each stood for (22,
   17, 6, 7, 24, 10, 19, 4); `water` becomes `open` with under water on. So an old link gives the same
   preset, now as the engine renders it, without a name that is not true ("2fort sewers" is an automatic
   room, R1 5). `PRESETS.spam` takes `auto_tunnel`; `PRESETS.sewers` takes `open` with under water on.
   `ENV_ALIAS` (`room`, `locker`, `hall`) keeps its numbers. `LISTENER_POSITIONS` is rebuilt to the new
   list; `DSP_PRESETS` keeps names only (its numbers now live in `room-presets.js`).
4. **Extras.** One fieldset "Extras: not in the game", holding every control that is not a variable of the
   game: mic gain, the high-pass and low-pass, the stereo capture choice, the gate switch (as W3-11b leaves
   it), the codec bypass, the bitrate scale, the packet length, the auto-gain switch, the talk-spurt timing
   (if W3-02f has not retired it), the custom room, and the "Fullband Opus" codec (marked in its option).
   Their made-up variable names (`voice_micgain`, `dsp_hpf`, `dsp_lpf`, `voice_capture_channel`, `voice_vad`,
   `voice_vad_threshold`, `snd_codec`, `snd_bits`, `net_split`, `voice_agc`, `voice_retime`, `dsp_custom_*`)
   stay as console commands of the app but are no longer shown as the game's (`class="cvar"` is for the
   game's own). The game's own, by its `find voice` output and the reports: `sv_voicecodec`, `voice_avggain`,
   `voice_maxgain`, `voice_scale`, `volume`, `dsp_room`, `net_fakeloss`, `net_fakejitter`. **Read the page as
   it stands when this part starts** (W3-11b, W3-02d, W3-02f and W3-10 change it first) and list in the
   report each control and the side it went to.
5. **Labels.** "Auto-gain: On (measured)" becomes "On (the game's rule)" (finding 26). "Mean → peak
   normalize" becomes "Gain target: mean (0) to peak (1)" with `voice_avggain`. "Open / Outdoor — dry (0)"
   goes (item 1). README's rooms paragraph, its pipeline line 4 and "Rooms are not applied live" are
   rewritten; the Facepunch link stays as where the numbers of presets 0 to 29 were first taken from.
6. **The live chain.** The room's `createVoiceMix` lives in `live-worker.js`, outside the chain, so a
   settings change that rebuilds the chain keeps the room's lines. A change of room calls `setRoom`: the
   engine's 200 ms cross-fade (part a, item 9), the new shares from the next talk spurt on. At the context's
   rate the live chain converts as W3-10 left it. Measure the room's cost in the live worker on the build
   machine for `great_hall` during a fade and give it in the report (this plan's prototype: 167 ns a sample
   for two twelve-line presets, under 1% of real time).
7. **`batch.js`** and the downloads carry the tail (item 4 of part c).

### Checks

The browser suite: each old `pos` value in a share link lands on the new controls as item 3 says; a render
with each group's first entry plays and downloads with its tail; the extras group holds exactly the listed
controls; a live room change gives no click (the worker's output across the change equals the module's
cross-fade on the same input). `pnpm test:all` and CI pass. `sw.js` cache version up.

### Files

`index.html`, `style.css`, `app/`, `constants.js`, `live.js`, `live-worker.js`, `batch.js`, `README.md`,
`sw.js`, `tests/browser.verify.js`, `tests/verify.js` (the names it reads), `tests/REFERENCE_2026.md`.

## The owner's recording (the orchestrator hands this over as it is)

**What it checks:** that the app's room is the game's, sample for sample, for one numbered preset, and the
automatic room for one spot. About 20 minutes. The scripts below need no cheats.

**Set-up.** Your own server (`map <the map of the earlier takes>`). Windows playback device set to **44100
Hz**, so the system does not resample; record that device's loopback losslessly (FLAC) at 44100 Hz. The test
signal as the microphone, as in the earlier takes (`tests/testsignal/`, or the file input of W3-14), plus one
spoken sentence. `voice_loopback 1`. **`volume 1`: turn the speakers down first.** A quiet spot, standing
still for the whole of each take (moving can change the soundscape, which sets the room again). Turn on the
game's own voice dump as for Set H (`voice_recordtofile 1` while talking, then 0): the file
`voice_decompressed.wav` of each take is needed with the recording.

**First, four readings** (type each alone and note the answer): `dsp_room`, `dsp_automatic`, `dsp_mix_min`,
`dsp_mix_max`, `dsp_db_min`, `dsp_db_mixdrop`, `dsp_volume`, `dsp_enhance_stereo`, `snd_surround_speakers`.
And the map's name.

| Take | Type, in this order | Then |
| --- | --- | --- |
| R1 dry | `dsp_room 0` | check `dsp_room` reads 0; play the signal and the sentence |
| R2 preset 6, real share | `dsp_room 6` | check `dsp_room` reads 6; note the four `dsp_mix_...` and `dsp_db_...` values; play |
| R3 preset 6, all of it through the room | `dsp_room 6`, then `dsp_mix_min 1`, `dsp_mix_max 1`, `dsp_db_mixdrop 1` | the three come **after** `dsp_room` (setting a room overwrites them) and **before** the voice key; play; leave 5 s of silence at the end |
| R4 automatic room | `developer 1`, `adsp_debug 2`, `dsp_room 1`; walk into a tunnel or a small room and stop | copy the console's lines (`NEW DSP NODE ...`, the shape's name); note `dsp_automatic` and the four values; then the three lines of R3, and play without moving |
| R5 (optional) under water | `dsp_room 0`, stand under water | play |

Afterwards: `dsp_room 1`, `volume` back, `developer 0`, `adsp_debug 0`.

**What the model says each will show** (R2 "Model", this plan's runs):
- R1: the voice at 255/256 of the decoded voice after the gain, nothing else: the largest sample 32639.
- R2: the four values read 0.2, 0.7, 80, 0.5; the direct voice at 229/256 of R1's (the flat tops at 29196)
  and the room's part 20 dB under it, first echoes 573 and 837 samples after each sound (negative), the
  strongest at 1410 samples (32.0 ms), the tail 60 dB down after 0.7 s.
- R3: no direct voice. After a click the output shows, in samples after it: a faint copy at 0, -0.106 of the
  click at 573 and at 837, **0.69 of it at 1410**, then 0.104 at 1983; the lines repeat every 661 and 2513
  samples (15.0 and 57.0 ms). The silence at the end does not return to zero: it rests at a constant between
  about -1 and -8.
- R4: the printed measures, put into the app's build, name the same shape as the console did, and give the
  header that the four values read (a tunnel: 0.4, 0.9, 80, 0.7; a small room: 0.3, 0.8, 80, 0.5).

**How it is scored** (the orchestrator, privately): the take's own `voice_decompressed.wav` is run through
the app's gain, entry and room; the result is lined up with the recording by its largest sample. R1 and R3
(no random taps in preset 6): **every sample equal** wherever the game's own sound is absent; reported as the
share of equal samples and the largest difference, per second. R2 the same, direct and room together. R4:
the shape and header as above, then sample equality if the built preset does not modulate. A difference of
one unit in scattered samples points at `powf` or a rounding (part a, item 6); echoes at other delays point at
a misread line. Any of them is a finding for the skeptic before code changes.

## Where the owner's answers plug in (nothing above waits for them)

| Answer | Goes into |
| --- | --- |
| `dsp_room` and the mix values at the takes' spot | Decision 1 and the page's first option. If `dsp_room` reads 1 there with an open-space header, the takes' full level contradicts the 250/256 share: a finding for the skeptic, not a quiet change of the default |
| `adsp_debug 2` lines at known spots | rows of `ROOM_PLACES` (part b, item 4): map, spot, sky, width, length, height, reflectivity, open sides or the printed shape. The build of each is checked against the printed shape and, where noted, the header |
| which map | the words of the page's first option and of finding 32 |
| the recording | finding 32 moves from "read" to "checked"; the page's line under the control goes; `powf` and the three assumptions of `AMP` are settled or corrected |

## What moves

- **Golden hashes:** parts a and b, none (no page or render loads the module). Part c: none of the existing
  ones; one case removed; about ten room cases added, once. Part d: none.
- **`sw.js`:** the cache version goes up in c (two new files in its list) and in d.
- **`tests/predictions/PREDICTIONS.md`:** part c notes that `audio.js` (a hashed model file) changed, that
  the predicted takes have no room, and that the golden renders with no room are unchanged.
- **`tests/REFERENCE_2026.md`:** (c) a new finding, **"32. The room effect on a voice: read, not yet
  recorded"**: the map's soundscape sets `dsp_room`; 101 of 153 stock soundscapes ask for 1, the automatic
  room, built by shape and size from two authored presets; the voice's share is the preset's (26/256 for a
  numbered preset, 5 to 72 of 256 for the automatic room), the direct part `256 - share`; the room is mono,
  44100 Hz, 32-bit integers, before the clip; random taps are seeded in the app; no recording with a room
  exists; the takes were made with no preset active. Finding 30's DSP line is corrected to point at it (R1
  correction 5). A new row in the Model table: **Room** | the game: as finding 32 | the app: the engine's
  arithmetic from the two reads, bit for bit against a second implementation; the automatic room by example
  measures, since the app has no map; `AMP` and `MDY` read once | basis: finding 32; W3-15, W3-17. "What
  remains unverified": the rooms line is rewritten to say what is read and what a recording would add. (d)
  the same texts once the page's words are final.
- **W3-07's report:** the orchestrator adds a correction note at its end (direct edit): the three
  corrections of R1 "Corrections" 1 to 3 and R2 difference 16.
- **`README.md`:** part d (the rooms paragraph, the pipeline's mixer line, the live note, the file table).
- **`docs/work-orders/W2-04-stream-rooms-retime.md`:** its room half is replaced by part c; say so in PROGRESS.

## Not in these orders

The room measuring from a map's files (R2 e3, e4: rays, nodes, the rebuild rule). The surround paths. The
processors and options no preset of the table uses (listed under "The table"). `dsp_player`, `dsp_speaker`,
`dsp_spatial` and the facing-away slot (all off for a TF2 voice: R1 1, R1 4). `dsp_volume` other than 1 (no
TF2 soundscape sets it). A change of room inside an offline render. Game sound under the voice. The output
device stage and everything after the clip (W3-10). The receiver's timeline (W3-02).

## Open

1. **`AMP` and `MDY` are read once and three details are assumed** (part a, item 8). A read of
   `0x1800336d0`, `0x180033250`, `0x18003bf70`, `0x18003b8d0` and `0x18003ba80` to the formula, by the second
   reader's method, would close it. If it is done before part a starts, its formulas replace item 8.
2. **`powf`, `tan`:** the C library's last bit is not known. The pinned integers make a difference visible;
   only the recording can show whether the game's differ.
3. **What real spots measure.** Every named case is an example. The first `adsp_debug 2` log replaces guesses
   with places.
4. **Why the takes had no room.** Decision 1 rests on the level, not on a reading of `dsp_room`.
5. **Where the two shares enter for a 22050 Hz voice** relative to the mixer's upsampling is W3-10's to
   build; part c follows it (item 3).
6. **Which map loads which soundscape script** was not read, so the fixed rooms are labelled by script and
   area.
