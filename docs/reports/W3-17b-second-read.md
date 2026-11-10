# W3-17b: second reader of the automatic room's build, against the engine

Branch `claude/w3-17b-automatic-room`, head `0cf15eb`, read-only. The owner's `engine.dll` (x64, image base
0x180000000) was read as data with capstone and never executed. No leaked source was looked for. Nothing of the binary
is reproduced here: words, formulas and addresses only (the console's own line texts are named in section 4, because
the owner has to recognise them). "single" = 32-bit float, "double" = 64-bit float; every float step is one SSE scalar
operation, round to nearest.

## In brief

- **Question 1: the module is right and the model is not.** The engine blends an amplifier and a modulating delay like
  everything else (same routine, linear, divisor 5, singles): `MDY` values 0 to 12 on the length class, `AMP` values 0
  to 7 on the size class. It also blends `PTC`, `CRS`, `ENV`, `EFO` and `LFO` (size class), which neither module nor
  model does.
- **One real difference, shared by module and model (finding 1, must fix):** in a vertical shaft (indoors, height more
  than three times the length) the engine works out the **classes while height and length are still swapped**: the
  length class comes from the height, the height class from the length, and so the size class too. The module and the
  model swap for the shape only. None of the 16 cases is a shaft, so no named output changes.
- **Everything else in the build is confirmed**, piece by piece (table in section 2). An independent build written from
  this reading gives the module's 16 cases bit for bit (shape, classes, pair, copy, header, every value as a single),
  and 5163 of 6000 swept measures; the 837 that differ are all shafts.
- **The two measured cases build as the page says** (section 3, with the ranges of measures that give the same build).
- **The debug lines print feet, not units, the length first** (section 4): each size is units / 12 rounded to a whole
  foot, so a row of `ROOM_PLACES` made from a log fixes each measure only to within 6 units, and a class is left open
  when the printed number sits on a threshold. The count of open sides is not printed at all.

## 1. What the engine does for each processor type

The build routine `0x180032720` is called twice (`0x180035d9c` with n = 0, `0x180035dc0` with n = 1: the first and the
second processor of each type). Every blend goes through one routine, `0x1800325d0`: it finds the n-th processor of
the type in the output, in the "from" template and in the "to" template (`0x1800325ea` to `0x18003268e`); if any of
the three is missing it does nothing (`0x180032693` to `0x18003269e`); else
`t = single(class) / single(divisor)`, `d = (to - from) x t`, `d = d x t` again if squared, `out = from + d`, each
step in single (`0x1800326a0` to `0x1800326fe`). No value is rounded or truncated to a whole number here (the reverb's
count stays fractional until the processor is built). `0x180033060` wraps it for the values that can be replaced by a
measure: if the value in A **or** in B is below 0 (single compare), the output's value becomes the measure
(`0x180033149` to `0x1800331f4`); else the same blend.

Type numbers are the engine's own, from its name table at `0x180462830` (count at `0x180462fb0`): DLY 1, RVA 2,
FLT 3, CRS 4, PTC 5, ENV 6, LFO 7, EFO 8, MDY 9, DFR 10, AMP 11.

| Type | Values blended (index: class) | Squared | Direction, divisor | Copied (never blended) | Where | Module | Model |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DFR` | 0 to 3: size | no | A to B, 5 | 4 to 15 | `0x180032860` | same | same |
| `RVA` | 3, 4, 2, 7, 8: size; 1, 0: size; 9: width; 10: length; 11: height; 12: width; 13: length; 14: height; 5: reflectivity | 1, 0, 9, 10, 11 | A to B, 5; **value 5 (cutoff): B to A, 4** | 6 (fpar), 15 (ftap) | `0x18003289b` to `0x180032c09` | same | same |
| `RVA` 9, 10, 11 negative in A or B | replaced by the measure in feet: width, length, height | - | - | - | `0x180032a0b` to `0x180032b35` | same | same |
| `DLY` | 1: length; 2, 3: length; 8, 9, 10: length; 5, 6: length | 1, 8, 9, 10 | A to B, 5; **5 and 6 (cutoff, width): B to A, 5** | 0, 4, 7, 11 to 15 | `0x180032c59` to `0x180032e1b` | same | same |
| `DLY` 1, 8, 9, 10 negative in A or B | replaced by the measure in ms: 1, 9, 10 from the length, **8 from the width** | - | - | - | `0x180032c0e` to `0x180032db1` | same | same |
| `MDY` | 0 to 12: **length** | no | A to B, 5 | 13 to 15 | `0x180032e30` (loop to 13) | same | **not blended: wrong** |
| `AMP` | 0 to 7: size | no | A to B, 5 | 8 to 15 | `0x180032e70` (loop to 8) | same | **not blended: wrong** |
| `FLT` | 0 to 4: size | no | A to B, 5 | 5 to 15 | `0x180032eb0` (loop to 5) | same | same |
| `PTC` | 0 to 2: size | no | A to B, 5 | 3 to 15 | `0x180032ef0` (loop to 3) | **not blended** | not blended |
| `CRS` | 0 to 3: size | no | A to B, 5 | 4 to 15 | `0x180032f30` (loop to 4) | **not blended** | not blended |
| `ENV` | 0 to 8: size | no | A to B, 5 | 9 to 15 | `0x180032f70` (loop to 9) | **not blended** | not blended |
| `EFO` | 0 to 3: size | no | A to B, 5 | 4 to 15 | `0x180032fb0` (loop to 4) | **not blended** | not blended |
| `LFO` | 0 to 3: size | no | A to B, 5 | 4 to 15 | `0x180032ff0` (loop to 4) | **not blended** | not blended |

All in single, linear unless marked, first and second processor of the type only. A filter's type and quality (values
0 and 3) are blended like the rest, so they can come out fractional; what the filter's builder makes of that is not
part of this read.

**The game's file** (parsed, numbers only): presets 102 to 133 hold only `RVA`, `DFR` and `DLY`. `AMP` is in 14, 38,
55 to 59, 134, 135; `MDY` in 16 and 40; `FLT` in 30 to 34, 38, 55 to 59; `LFO` in 35 to 37, 39; `PTC` in 44, 45, 134,
135; `EFO` in 46, 48, 101; `CRS` in 47, 134, 135. So none of the eight pairs the automatic room can choose (nor the
eight "diffuse" pairs) holds any type but those three, and this question decides no output. Also from the file: no
reverb in 102 to 133 has a negative width, depth or height (the feet path is never taken with the game's file); the
only negative values that meet a measure are the delay's values 1, 8, 9, 10 in 126 to 129 (the courtyards).

## 2. The build, piece by piece

| # | Piece | The engine | Where | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Inputs | sky (byte), width, length, height (32-bit ints), diffusion and reflectivity (singles), six direction reflectivities (the first four are the walls; the fifth is set to 0 under the sky and is not used by the build), the node's index | `0x180035b50` to `0x180035be3`; the caller's arguments `0x18002299b` to `0x180022a16` | confirmed |
| 2 | Shaft swap | only when not under the sky: if `double(H) > 3.0 x double(L)` (strictly), height and length are swapped **in the record itself**; they are swapped back only after the shape **and the classes** have been worked out | swap `0x180032059` to `0x180032083`; swap back `0x18003219f` to `0x1800321b1`; the classes are called from inside each shape branch (`0x1800320db`, `0x18003212c`, `0x18003215d`, `0x180032180`) | **different: finding 1** |
| 3 | Shape rules, indoors, in order | duct (1) if `L > 4W` and `W <= 48`; else hall (2) if `L > 2.5W` and `W > 48` and `W <= 96`; else tunnel (3) if `L > 4W` and `W > 96`; else room (0). All compares in double on the whole numbers (exact); 4.0, 2.5, 48.0, 96.0 are doubles; equality falls on the side written | `0x1800320a0` to `0x180032180` | confirmed |
| 4 | Open sides | under the sky only: the number of the four wall reflectivities equal to 0 (single compare with 0); if 1 or more, shape = 11 - n. Indoors they are never looked at | `0x1800321bf` to `0x180032224` | confirmed |
| 5 | Shape rules, under the sky, none open | courtyard (6) if `L <= 2.5W`; else alley (5) if `W <= 144`; else street (4). Doubles | `0x180032255` to `0x1800322e7` | confirmed |
| 6 | Sky flag | a byte, non-zero = under the sky; no swap there | `0x180032050` | confirmed |
| 7 | Width class | 1 for `72 < W <= 144`, 2 to 288, 3 to 576, 4 above; double compares | `0x18003242b` to `0x180032482` | confirmed |
| 8 | Length class | 1 for `144 < L <= 288`, 2 to 576, 3 to 1152, 4 above | `0x1800323e4` to `0x180032428` | confirmed |
| 9 | Height class | 1 for `48 < H <= 128`, 2 to 216, 3 to 384, 4 above (the 128 is an integer compare, the rest double: same result) | `0x180032485` to `0x1800324d2` | confirmed |
| 10 | Reflectivity class | 1 if `double(R) > 0.04` and `R <= 0.5` (single); 2 if `R > 0.5` (single) and `double(R) <= 0.8`; 3 if `double(R) > 0.8`; so the single 0.8 is class 3. Top class 3 | `0x1800324c1` to `0x180032552` | confirmed |
| 11 | Diffusion class | 1 for `0.01 < d <= 0.1`, 2 to 0.3, 3 above (doubles); the caller sets diffusion to 0 just before the build, so always 0 | `0x18003252e` to `0x180032581`; zeroed at `0x180022989` | confirmed |
| 12 | Size class | shapes 6 and 10: from the length, 1 for `120 < L <= 240`, 2 to 480, 3 to 1200, 4 above; shapes 4 and 5: the width class; every other shape: (width class + length class) / 2, integer, truncated. Top class 4 | first scale `0x18003237b` to `0x1800323e8`; the rule `0x180032584` to `0x1800325a6` | confirmed |
| 13 | The pair | by shape number through a table of 11 (`0x180035e60`): room, duct, hall, tunnel, street, alley, courtyard, openspace, openwall, openstreet, opencourtyard variables; the registrations give 102, 106, 110, 114, 118, 122, 126, 130, 130, 118, 126 (`0x180002430`, `0x1800022b0`, `0x1800022f0`, `0x1800024b0`, `0x180002470`, `0x180002230`, `0x180002270`, `0x180002370`, `0x1800023f0`, `0x1800023b0`, `0x180002330`); the variable's integer value is used; B = A + 1 | `0x180035bf5` to `0x180035c7b` | confirmed |
| 14 | The diffuse pair | + 2 only if the diffusion class is above 1; it is always 0 (row 11) | `0x180035c73` to `0x180035c7d` | confirmed: cannot be chosen |
| 15 | The whole copy | on the first pass only: all 672 bytes of B if the size class is above 1 (signed compare), else of A. The second pass copies nothing, so it does not undo the first | `0x180032761` to `0x18003284e` | confirmed |
| 16 | The blends | section 1's table; class / divisor and every step in single; squared = the factor applied a second time to the difference | `0x1800325d0`, `0x180032720` | confirmed for `DFR`, `RVA`, `DLY`, `FLT`, `AMP`, `MDY`; `PTC`, `CRS`, `ENV`, `EFO`, `LFO` are finding 2 |
| 17 | Cutoffs | reverb value 5: from = B, to = A, reflectivity class / 4. Delay values 5 and 6: from = B, to = A, length class / 5 | `0x180032bd9`, `0x180032db6`, `0x180032deb` | confirmed |
| 18 | First, second, third | n = 0 and n = 1 only; a third processor of a type keeps the copy's values; a type missing from the copy, A or B at that n is skipped | `0x180035d76`, `0x180035da6`; `0x180032693` | confirmed |
| 19 | Feet | `single(int)` (the int is first made a single), as a double times the double 1/12 (`0x180361380`), 6 if below 6 else the smaller of it and 500 (doubles `0x180361f38`, `0x180361fb0`), then a single. Width for value 9, length for 10, height for 11 | `0x180032a0b` to `0x180032b04` | confirmed |
| 20 | Milliseconds | the int straight to a double, times the double 1/6 (`0x180361ee0`), 14 if below 14 (`0x180361f40`) else the smaller of it and 500, then a single. Length for the delay's values 1, 9 and 10; width for value 8 | `0x180032c0e` to `0x180032d7a` | confirmed |
| 21 | Which measures | the true width, length and height (the swap is undone before the build), whatever the classes were worked out from | `0x1800321a8`; `0x180032a0b`, `0x180032a41`, `0x180032a63`, `0x180032c0e`, `0x180032c3f` | confirmed (and see finding 1) |
| 22 | The header | nothing blends it: it comes with the whole copy. The four mix values sit at offsets 0x260 to 0x26c of the 672-byte entry (`0x1800389e2`), after the five processors; the highest offset a blend can write is 0x224 | `0x180032761`; `0x1800326fe` | confirmed: the copied template's header, duration and fade |
| 23 | Where it is stored | at preset number 60 + the node's index (0 to 39; an index of 40 or more builds nothing and returns 0); the routine returns that number and the caller puts it into `dsp_automatic` | `0x180035b6c`; `0x180035dc5` to `0x180035e50`; `0x180022a1b` to `0x180022a1f`, `0x1800388b0` | confirmed |
| 24 | The node's index | a ring of 40: after each build the index goes up by one and wraps to 0 | `0x180022a31` to `0x180022a78` | confirmed |
| 25 | The same node met again | **nothing is rebuilt.** Of the remembered nodes in reach with the same sky flag, the one with the largest width x length is taken and its stored number (60 + its index) is put into `dsp_automatic`; the stored preset is whatever was built when the node was made | `0x1800227a6` to `0x180022816`; `0x180023410` | confirmed |
| 26 | A new number always sets anew | the slot compares the **number** asked for with the number it holds and does nothing only when they are equal; a new node always has a new number, so its preset is set (new instances, the 200 ms cross-fade) even when its values equal the last one's | `0x1800388fe`, `0x1800389b2` | note 5 |

**The cross-check.** An independent build written from the rows above (`scripts/mine.py` in this folder, templates
parsed from the game's text) against `buildAutomatic` run in node: the 16 cases equal in shape, classes, pair, copy,
header and every value as a single. 6000 swept measures (thresholds and random values, sky and indoors, 0 to 4 open
sides): 5163 equal, 837 differ, all 837 among the sweep's 841 shafts. Edited pairs holding three processors of one
type: `MDY`, `AMP`, `FLT` equal (and the third processor is the copy's); `PTC`, `CRS`, `ENV`, `EFO`, `LFO` differ in
exactly the values of section 1.

## Findings

**1. Must fix. In a vertical shaft the classes are worked out on the swapped measures.**
`room-dsp.js` 1061 to 1076 (`shapeOf`), 1079 to 1095 (`classesOf`), 1211 to 1213; `tests/roomdsp/dspmodel.py` 511 to
526 (`shape_of`, and `build_auto`'s call of `classes`); the builder's reading 5; R2 e2's sentence "swapped for the
test".
- Evidence: `0x180032040` swaps height and length in the record (`0x180032059` to `0x180032083`), calls the class
  routine `0x180032320` from inside whichever shape branch is taken, and swaps back afterwards (`0x18003219f` to
  `0x1800321b1`). The class routine reads the length and the height from that record (`0x180032334`, `0x180032458`).
  So in a shaft: length class = the length scale applied to the **height**; height class = the height scale applied to
  the **length**; size class = (width class + that length class) / 2. The measures that replace negative values are
  taken after the swap back, so they stay the true length and height.
- Examples, indoors, reflectivity 0.4: 100 x 100 x 400 is a room; the engine's classes are size 1, width 1, length 2,
  height 1 (copy 102); the module's are size 0, length 0, height 4. 200 x 250 x 800: the engine gives size 2, length 3,
  height 3 and copies 103; the module gives size 1, length 1, height 4 and copies 102.
- The fix: in `buildAutomatic`, when `!m.sky && m.height > 3 * m.length`, work out the classes from the measures with
  length and height exchanged; keep `feet` and `sixth` on the true measures. The same in the model's `build_auto`
  (pass `H` as the length and `L` as the height to `classes` in a shaft). Then regenerate `auto.json`: the three shaft
  probes of `auto.py` (lines 110 to 112) and the shafts among the 240 swept measures change; add one check typed from
  this finding (the two examples above). Correct reading 5 and R2 e2.
- The 16 cases: none is a shaft (no indoor case is more than three times as high as it is long; under the sky there is
  no swap), so no hash, share or tail changes. It matters as soon as a place from the owner's log is a shaft (the
  console then says so, section 4) or the page takes free measures.

**2. Should fix (small). Five more types are blended by the engine.** `room-dsp.js` 1117 to 1122 (`BLEND`); reading 2.
The engine blends `PTC` 0 to 2, `CRS` 0 to 3, `ENV` 0 to 8, `EFO` 0 to 3 and `LFO` 0 to 3 on the size class, linear,
divisor 5 (`0x180032ef0`, `0x180032f30`, `0x180032f70`, `0x180032fb0`, `0x180032ff0`). The module copies them. The
module cannot instance these types, and no pair in the game's file holds one, so nothing audible or testable from the
table changes; but `buildAutomatic` returns the built preset's values, and for such an edited pair they are not the
engine's. Five rows in `BLEND` make it exact. If left, reading 2 should say the engine does blend them and give the
indices.

**3. Should fix, in the model. `AMP` and `MDY` are blended.** `tests/roomdsp/dspmodel.py` 551 to 564 (`build_auto`).
Add `MDY` (type 9) values 0 to 12 on the length class and `AMP` (type 11) values 0 to 7 on the size class, linear,
divisor 5, for n = 0 and 1 (`0x180032e30`, `0x180032e70`). The module's reading 1 is the engine's; its check typed
from R2 e1 is right; break B25 ("the model's build") is a real break. No output of the table changes.

**4. Must know before a row of `ROOM_PLACES` is written (note; for the order, parts b and d, and tonight's log).**
`room-dsp.js` 1185 to 1188 (the comment "the measures the engine printed"); the order's "units in place of this plan's
stand-ins". The console prints feet rounded to whole feet, the length first, no open-side count and no preset number
for a new node: section 4. A row cannot simply copy the printed numbers.

**5. Note. Reading 15 is not the engine's rule.** The module's slot compares presets by header and values, so a second
build from equal measures starts no fade. The engine's slot compares numbers (`0x1800388fe`), and every new node gets
a new number (row 24), so the engine sets the new preset: fresh instances with empty lines, cross-faded in over
200 ms, even when the values are equal. The app has no walking, so nothing heard changes; the reading's sentence
should not be quoted as the engine's behaviour.

**6. Note. The pair's variables.** The build reads the eleven `adsp_*_min` variables' current integer values each
time (row 13). The defaults are confirmed from the registrations; whether anything in the game changes them was not
read (reading 10 assumes not).

**7. Note. A wall that reflects nothing counts as open.** The open-side count is "reflectivity equal to 0", not "met
the sky" (`0x1800321bf` to `0x1800321f5`); a wall whose material's reflectivity is exactly 0 would count too. Only a
remark for the words on the page.

Nothing else was found different. In particular the order of the shape rules, every threshold and the side its
equality falls on, the reflectivity compares' mixed precision, the three size-class rules, the truncated mean, the
copy at size class 2, the squared set, both cutoff directions and divisors, the feet and millisecond conversions and
clamps, tap 1 from the width, and the header are as the module has them.

## 3. The two measured cases

By the rules above:
- `set_c_room` (no sky, 300 x 400 x 160, 0.9): not a shaft (160 <= 1200); width 300 is over 96 and 400 <= 1200, so a
  **room**. Width class 3, length class 2, height class 2, reflectivity class 3, size class (3 + 2) / 2 = **2**; pair
  102/103, **copy 103**. Yes.
- `set_d_street` (sky, 300 x 1000 x 4800, 0.4): no open side; 1000 > 750, so not a courtyard; 300 > 144, so a
  **street**. Width class 3, length class 3, height class 4, reflectivity class 1, size class = the width class =
  **3**; pair 118/119, **copy 119**. Yes.

**Which measures give the same build** (bit for bit; checked by enumeration over whole units and 400 random builds
each):

*Set C's room.* Templates 102 and 103 have width, depth, height and their three factors at 0, so the width, length
and height classes count only through the size class. The same preset comes from every indoor space that is a room
of size class 2 and reflectivity class 3:
- the shorter side 145 to 288 units and the longer side 289 up to four times the shorter (1152 at most), or
- the shorter side 289 to 576 units and the longer side from that up to 576;
- any height up to three times the longer side (above that it is a shaft and finding 1 applies);
- mean reflectivity above 0.8 (the single 0.8 included). Class 2, which the take fits nearly as well, is above 0.5 up
  to 0.8 and changes one number, the reverb's cutoff (3900 for 4950).
In feet: about 12 to 24 by 24 to 96, or 24 to 48 by up to 48. Honest words: "a room whose shorter side is 145 to
576 units (12 to 48 feet); the take fixes the size class, not the size".

*Set D's street.* Templates 118 and 119 differ only in the cutoff, the width, the depth and the three factors (the
height is 120 ms in both; headers and everything else are equal, so which one is copied makes no difference). The
same preset comes from every space under the sky with width class 3, length class 3, height class 4 and reflectivity
class 1 that is a street:
- width 289 to 460 units, length from more than 2.5 times the width (723 at the least) to 1152;
- height above 384 units (under an open sky the measured height is 4800);
- mean reflectivity above 0.04 up to 0.5 (the take does not fix the class; class 2 gives cutoff 2500 for 1750).
In feet: about 24 to 38 wide and 60 to 96 long. An **open street** (exactly two of the four walls open) with the same
four classes builds the identical preset, so the take cannot tell the two apart. Honest words: "a street 289 to 460
units wide and 723 to 1152 long (24 to 38 by 60 to 96 feet)".

## 4. What `adsp_debug` prints, and how it maps to `buildAutomatic`

All these lines go through the engine's developer-message import (so `developer 1` is needed; the gate itself is in
another module and was not read).

**When a new node is built** (the driver, `0x180022978` to `0x180022a16`), in this order:
1. One line from `0x180023120` (printed when `adsp_debug` is not 0; `0x180023213` to `0x180023256`), beginning
   `NEW DSP NODE:` and carrying seven numbers with these labels: `size:(a,b)`, `height:(c)`, `dif d`, `refl r`,
   `cobj: k`, `sky s`. a, b, c, k and s are printed with no decimals; d and r with four.
2. Only if the space is a shaft, and only when `adsp_debug` is above 1: `VERTICAL SHAFT Detected` (`0x180032093`).
3. When `adsp_debug` is above 1, the shape's line (`0x1800320f1` to `0x180032300`): `DUCT Detected`, `HALL Detected`,
   `TUNNEL Detected`, `ROOM Detected`, `OUTSIDE COURTYARD Detected`, `OUTSIDE ALLEY Detected`,
   `OUTSIDE STREET Detected`, or `OPEN SIDED OUTDOOR AREA Detected`. **That last line is the same for all four
   open-sided shapes** (open space, open wall, open street, open courtyard).
4. Later, whenever any slot takes a preset: `total preset slots used: n` (`0x18003c4ab`; not about the room).

**When a remembered node is taken again** and its number is not the current one: one line beginning `DSP PRESET:`
with the node's preset number first (60 + its index, no decimals) and then the same seven fields, from the measures
stored with that node (`0x1800227d1` to `0x18002280f`, `0x18002326e` to `0x1800232bb`). No shape line: nothing is
built. A new node's number is **not** printed; it can be read from `dsp_automatic`.

| Printed field | What it is in the engine | `buildAutomatic` | Scaled or rounded |
| --- | --- | --- | --- |
| `size:(a, ...)`, the **first** number | the **length** (the larger span), `single(double(int) x 1/12)` | `length` = 12 x a, within 6 units | **feet**, rounded to a whole foot |
| `size:(..., b)`, the **second** number | the **width** (the smaller span), the same way | `width` = 12 x b, within 6 units | feet, whole |
| `height:(c)` | the height (4800 under an open sky, printed 400) | `height` = 12 x c, within 6 units | feet, whole |
| `dif d` | diffusion; set to 0 just before the line is printed | none (always 0.0000) | four decimals |
| `refl r` | the mean reflectivity, a single | `reflectivity` = r | four decimals |
| `cobj: k` | an object count, set to 0 with the diffusion | none (always 0) | - |
| `sky s` | the sky flag | `sky` = (s is 1) | 1 or 0 |
| the shape line | the shape, after the build's own test | the row's `shape`, to check the build against | the four open-sided shapes share one line |
| (not printed) | the open-side count | `openSides` | see below |
| (not printed for a new node) | the preset number | - | `dsp_automatic` shows 60 + index |

(`0x180023151` to `0x1800231ab` for the three divisions by 12; the first size number is the record's length field, the
second its width field: the same fields the build receives as length and width, `0x1800229c7`, `0x1800229ce`.)

**What this means for a row.**
- The numbers are the true measures (before any shaft swap), but in whole feet: a printed N is 12N - 6 to 12N + 6
  units (which way an exact half goes was not read). `buildAutomatic` needs whole units, so take 12 x N and say so.
- A class is certain unless the printed number sits on a threshold in feet. **Width (second number): 6, 12, 24, 48.
  Length (first number): 12, 24, 48, 96. Height: 4, 11, 18, 32. A courtyard's or open courtyard's length: 10, 20,
  40, 100.** At those values the log leaves two classes open, and the row should say which was taken. The printed
  reflectivity leaves the class open only at 0.0400, 0.5000 and 0.8000.
- The shape line settles the shape. If 12 x the printed feet does not rebuild that shape (the ratio rules, and widths
  of 4, 8 and 12 feet), move the measure by up to 6 units until it does.
- **Open sides**: not printed. The four mix variables the owner notes afterwards (they are the built preset's header)
  tell the pair: 0.21, 0.8, 95, 0.1 is the open courtyard (one side open); 0.3, 0.8, 75, 0.3 the open street (two);
  0.22, 0.6, 95, 0.1 the open wall or open space (three or four, which build alike from the same measures).
- The same four values also tell, for a room, which template was copied: 0.3 first is 102 (size class 0 or 1), 0.32 is
  103 (size class 2 to 4). Tunnel 0.4, 0.9, 80, 0.7; duct 0.4, 0.9, 80, 0.5; hall 0.3, 0.8, 80, 0.5; street 0.3, 0.8,
  75, 0.3; alley 0.32, 0.8, 60, 0.3; courtyard 0.21, 0.8, 95, 0.1.
- A shaft announces itself with its own line. Until finding 1 is fixed, a shaft's row would build with the wrong
  classes.
- The names differ from the module's: the row's `shape` needs a small map (`ROOM` to `room`, `OUTSIDE STREET` to
  `street`, and so on; the open-sided line to one of four by the header).

## What I did not check

- The module against the model, the tests and the breaks: the reviewer's ground. I ran no suite; I only called
  `buildAutomatic` from node.
- The measuring (R2 e3, e4) beyond what the build's caller passes, the node ring, the node lookup, and where the
  width, length, height and mean reflectivity are stored at the end of a pass (`0x180021f93` to `0x180021fa3`,
  `0x1800224b1`). I glanced at the per-ray routine (`0x180024450` to `0x180024461`): a level ray that meets a sky
  surface is given distance 1, one that meets nothing keeps 4800, as the order's note on `open` says; I did not read
  further.
- How the engine's formatter rounds an exact half foot, and the developer-message gate: both are outside this file.
- The preset loader and how each processor is built from the blended values (part a's ground), including what a
  filter does with a fractional type or quality.
- The routine that carries `dsp_automatic` into the slot, beyond the slot's compare of numbers.
- Whether a map, a soundscape or a config changes the `adsp_*_min` variables.
- `MDY`, `AMP`, `FLT`, `PTC`, `CRS`, `ENV`, `EFO`, `LFO` in a pair: read in the build routine and checked against the
  module on made-up pairs; no pair of the game's file exercises them.

Scripts and scratch output: this folder's `scripts/` and `out/` (the listings there are scratch, not for any report).
