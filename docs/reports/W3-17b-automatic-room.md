# W3-17b: the automatic room

Builder's report. The order: `docs/work-orders/W3-17-room-effects.md`, part b. Branch `claude/w3-17b-automatic-room`,
from `6f0467e` (main with part a merged). `main` was merged in twice: first the order's amendment for parts c and d,
then the corrected model (`409d942`) with `docs/reports/W3-17b-second-read.md`. Changed: `room-dsp.js` and
`tests/room-dsp.verify.mjs`. Added, the builder's own: `tests/roomdsp/auto.py` and its output
`tests/roomdsp/auto.json`. One line was added to `tests/roomdsp/README.md`. Nothing else.

The first build was reviewed and given a second read against the engine (`docs/reports/W3-17b-second-read.md`, "2R"
below). The fix round followed. This report is the whole as it now stands; "Fix round" says what changed.

## Summary

- `buildAutomatic(measures)` builds the engine's automatic room (`dsp_room 1`) as R2 e1 and e2 give it, corrected by
  2R. It works out:
  - the shape, and for a vertical shaft the classes from the record with length and height exchanged (2R, finding 1);
  - the classes, with the exact thresholds and the size class's three rules;
  - the pair, from the shape's variable; the "diffuse" pair is never chosen;
  - a whole copy of B above size class 1, else of A.

  Then it blends the first and second processor of each type in single precision. Some values are squared, the
  cutoffs come from the dull end, and every processor type is blended at the indices 2R gives. A value written
  negative is replaced by the true measure.
- `ROOM_CASES` holds the order's 14 examples and its two measured cases. The measured cases' notes now say what each
  take fixes (2R, section 3). `ROOM_PLACES` is empty, and its rows are documented in units. `placeFromDebug` turns a
  line of the game's `adsp_debug` log, which prints whole feet with the length first, into measures. It also returns
  the candidates the log leaves open (2R, section 4).
- **2R confirmed the build against the engine's code, point by point, with two exceptions, both fixed.** The first was
  a shaft's classes, which the old model had wrong too. The second was five processor types left unblended. 2R also
  judged the first build's reading 1 (`AMP` and `MDY` blended as R2 e1 says) to be the engine's; the model was wrong
  there and has been corrected on `main`.
- **The review**: 56,117 builds of the reviewer's own, with 0 differences from the model, and 32 mutations of its own,
  five of them not caught: tap 1, and taps 2 and 3, on the width class; `FLT`'s class; the rounding of B - A; and a
  measured case's note. Each of the five now has an edited pair or a check that catches it (rows F4 to F7 of the
  breaks).
- **The build meets the corrected model value for value** on:
  - the 16 named cases;
  - 164 measures on and either side of every threshold, the shafts among them;
  - 17 edited template pairs;
  - 240 seeded random measures over all eleven shapes.

  Shape, classes, pair, copy, shares, header and every parameter as a single are equal. The built integers are
  equal for the 16 cases and the 13 pairs the app can build.
- **The outputs** do not move:
  - The 14 examples give `reference.out`'s 14 hashes and 57 of `tails.out`'s tail lengths.
  - The two measured cases give the order's hashes (`set_c_room` 41/214 `b8160db1...`, `set_d_street` 23/232
    `337b9b86...`) and four tail lengths (32481 and 80874; 22050 and 39889). `auto.py` stops unless the model
    gives the same.
  - No hash of `reference.out` and no length of `tails.out` moved. None of the 16 cases is a shaft.
- `tests/room-dsp.verify.mjs` has 210 checks: part a's 127, unchanged, and 83 of part b (63 in the first build and 20
  in the fix round). It takes 13.0 s inside `pnpm test` on this machine (12.2 s alone; part b's sections 2.0 to
  2.7 s; the limit is 30 s). `pnpm test` passed in full under the heavy lock on `17a4ac3`, the fix round's last code;
  later commits change only documents. CI passed on `704cc70`.
- **Breaks**: 101 mutations, each in a scratch copy of `room-dsp.js`: 15 for the order's seven rows, 59 of the
  builder's own from the first build, and 27 for the fix round. **All are caught but T18**, which no input can show.
  19 of them were also run against the whole suite (15 in the first build, 4 in the fix round): the same checks failed,
  and no check of part a failed.

## Files

| File | What |
| --- | --- |
| `room-dsp.js` | part a's module plus the automatic room: `buildAutomatic`, `placeFromDebug`, `ROOM_CASES`, `ROOM_PLACES`, `roomCase`, `SHAPES` (API below). Part a's code is unchanged |
| `tests/room-dsp.verify.mjs` | five sections, "The automatic room: ..." (`ROOM_ONLY=automatic` runs them alone). Part a's sections are unchanged |
| `tests/roomdsp/auto.py` | the builder's script. It reads the model's `build_auto` (shape, classes and base from its own return value) and its instances, and `reference.py`'s own functions, into `auto.json` (`python3 -I tests/roomdsp/auto.py`, about 6 s; the same bytes on a rerun; it writes no `__pycache__`). It asserts that its 14 examples match `lines.json`'s, that its first template pair matches `reference.py`'s template case, and that the model gives the order's numbers for the two measured cases |
| `tests/roomdsp/auto.json` | its output (134,698 bytes). `cases`: the 16 cases (measures, shape, classes, pair, copy, shares, header, parameters, built integers). `measured`: the model's hash and tails for the two measured cases. `probes` (164), `templates` (17 edited pairs; no built integers for the three that hold a type the app does not build), `sweep` (240). Parameters are the shortest decimal that reads back to the same single, which the test rounds and compares exactly |
| `tests/roomdsp/README.md` | one line: `auto.py` and `auto.json` are part b's builder's, and `auto.py` may be rerun after the model changes |

`dspmodel.py`, `reference.py`, `lines.py`, `lines.json`, `coefs.mjs`, `convert.py`, `room-presets.json`,
`reference.out` and `tails.out` are not changed by this branch.

## Fix round

Each item has a check that fails without it (the breaks table, rows F1 to F9).

1. **The vertical shaft** (2R, finding 1). Indoors, when the height is more than three times the length, the engine
   exchanges length and height in its record. It names the shape and works out the classes from that record, and
   only then exchanges them back. So the length class comes from the height, the height class from the length, and
   the size class follows. The measures that replace negative template values stay the true ones.
   - `isShaft` and `classRecord` do this, and the result carries `shaft`.
   - The first build's reading 5 ("the swap is for the shape test only") is withdrawn.
   - Checks typed from 2R and the brief:
     - 100 x 100 x 400 is a room of classes 1, 1, 2, 1 from 102; 200 x 250 x 800 a room of 2, 2, 3, 3 from 103;
     - the three shafts value for value (200 x 250 x 800, 60 x 100 x 400, 120 x 150 x 600);
     - the hall pair with w, d and h at -1 in both, at 60 x 100 x 400, gives 6, 8.33333302 and 33.3333321.
   - Six shaft probes in `auto.py`, judged against the corrected model.
2. **`auto.json` regenerated** from the corrected model. `auto.py` already took the classes from `build_auto`'s own
   return value; only the rerun was needed. What changed:
   - **unchanged**: the 16 `cases` and `measured`;
   - **probes**: the three old shaft probes changed ("the shaft: height 301 against 3 x length 100", widths 60 and
     100, and "a duct as a shaft"); six were added ("the shaft (second read)": 100 x 100 x 400, 200 x 250 x 800,
     60 x 100 x 400, 120 x 150 x 600, 300 x 100 x 1000, 40 x 500 x 1501);
   - **sweep**: 17 of the 240 changed, all shafts. The other 12 shafts of the sweep have the same classes either way;
   - **templates**: two changed (items 4 and 6) and four were added (items 3 and 5, the `AMP` and `MDY` pair, and
     the hall shaft of item 1).
3. **Five more types blended** (2R, finding 2): `PTC` 0 to 2, `CRS` 0 to 3, `ENV` 0 to 8, `EFO` 0 to 3 and `LFO` 0 to
   3, on the size class, linear, A to B, divisor 5. An edited pair holds all five, each with a value just past its
   last blended one, against the corrected model. The module still builds none of these types; the built values are
   simply the engine's. An `AMP` and `MDY` pair against the corrected model was added beside the check typed from R2
   e1.
4. **The taps' class** (review 1): the courtyard pair with positive taps now has measures 250 x 600, whose width
   class (2) and length class (3) differ.
5. **B - A rounded to a single** (review 2): an edited room pair, the reverb's size 0.1 in A and 1000.3 in B. At
   size class 2 it builds 160.13202; without the rounding it builds 160.13200.
6. **`FLT`'s class** (review 3): the filter pair's measures are 590 x 400 x 220. That gives size class 3 and length
   class 2.
7. **The measured cases' notes** (review 4; 2R, section 3) are now honest. Set C: "a room whose shorter side is 145
   to 576 units (12 to 48 feet)". The take fixes the size class (2), not the size; reflectivity class 3 fits best and
   class 2 nearly as well. Set D: "a street 289 to 460 units wide and 723 to 1152 long (24 to 38 by 60 to 96 feet)".
   An open street with the same classes builds the same preset; class 1 is taken. A check holds both notes word for
   word.
8. **Nothing passes silently** (review 6). `sky` must be `true` or `false`. A missing `sky` or `openSides` is refused,
   not defaulted, and so is a null one. A row with measures and no key builds with `key: null`.
9. **`ROOM_PLACES` and the log** (2R, section 4 and finding 4). The comment saying a row holds "the measures the
   engine printed" was wrong. Rows are in units, and their form is documented: `{ key, label, map, spot, measures,
   shape, log, note }`. `placeFromDebug` is new (API below), with 11 checks typed from 2R's section 4.
10. **This report**: readings 1, 2, 5 and 15 are corrected, the review's counts and what changed in `auto.json` are
    added, and so is the README line.

**Earlier checks**: none was edited. Item 1 changes the expected data (from the corrected model) of two existing
checks, "the shape rules: ..." (now 48 measures) and "240 seeded random measures ...". Item 8 changes no earlier
check: every earlier input already gave a boolean `sky` and its `openSides`.

## What was built, item by item

1. **`buildAutomatic(measures)`** (R2 e1, e2; 2R). The measures are `{ sky, width, length, height, reflectivity,
   openSides }`, all of them given and checked (reading 3).
   - **The shape** (e2; 2R rows 2 to 6). Indoors, a height over three lengths (strictly, in doubles) makes a shaft:
     the record's length and height are exchanged. Then the space is a duct if `L > 4W` and `W <= 48`; a hall if
     `L > 2.5W` and `48 < W <= 96`; a tunnel if `L > 4W` and `W > 96`; else a room. Under the sky, n open sides give
     shape `11 - n`. With none open, it is a courtyard if `L <= 2.5W`, else an alley if `W <= 144`, else a street.
   - **The classes** (e1; 2R rows 7 to 12), from the same record, so a shaft's are exchanged. Thresholds:
     - width over 72, 144, 288, 576; length over 144, 288, 576, 1152; height over 48, 128, 216, 384;
     - reflectivity over 0.04, 0.5, 0.8, as item 2 says.

     The size class comes from the length over 120, 240, 480 and 1200 for the courtyard and the open courtyard. It
     is the width class for the street and the alley, and `(width + length) >> 1` for every other shape. Diffusion is
     always class 0.
   - **The pair**: `A` is the shape variable's default (room 102, duct 106, hall 110, tunnel 114, street and open
     street 118, alley 122, courtyard and open courtyard 126, open space and open wall 130), and `B` is `A + 1`. The
     "+ 2 if the diffusion class is above 1" is in the code and cannot happen.
   - **The copy**: B whole if the size class is above 1, else A: header, processors and every value not blended.
   - **The blend**: for the n-th processor of each type, n = 0 and 1, where the copy, A and B all have one. It
     computes `from + (to - from) x class / divisor` in single precision, one rounding per step, applying the factor
     twice where squared (2R, section 1):
     - `DFR` 0 to 3 on the size class.
     - `RVA`: feedback, gain, count, `fmod` and `rate` on the size class; size and min squared on the size class; w,
       d and h squared on the width, length and height classes; fw, fd and fh linear on the same classes. **The
       reverb's cutoff goes `B + (A - B) x reflectivity class / 4`.**
     - `DLY`: delay and the three taps squared on the length class; feedback and gain linear on the length class.
       **Cutoff and width go `B + (A - B) x length class / 5`.**
     - `MDY` 0 to 12 on the length class.
     - `AMP` 0 to 7, `FLT` 0 to 4, `PTC` 0 to 2, `CRS` 0 to 3, `ENV` 0 to 8, `EFO` 0 to 3 and `LFO` 0 to 3 on the size
       class.
     - fpar and ftap are copied, never blended.
   - **A value written negative in A or in B** is replaced by the true measure. A reverb's w, d and h become the
     measure in feet, clamped to 6 to 500. A delay's time and its taps 2 and 3 become the length / 6 in ms, clamped to
     14 to 500; tap 1 uses the width / 6.
   - It returns the preset (header included), the shape's name and number, its variable, `shaft`, the classes, the
     pair, the template copied, the measures as checked, and the row's key or null.
2. **Where the text and the model differ** (the order's item 2): a reflectivity of exactly 0.8 is class 3, as the
   model has it and as the binary confirms (the W3-17a second read, row 20; 2R row 10). A comment in `classesOf`
   says so.
3. **The named cases**, `ROOM_CASES`: the order's 14 rows, in its order, with its keys, labels and measures. `open`
   has a `note`: the guess between two readings of R2 e4, as the order words it.
4. **`ROOM_PLACES`**: empty and frozen, its row form documented in units, with `placeFromDebug` to make one from the
   log.
5. **The two measured cases**, in `ROOM_CASES` with `measured: true`, `set: 'Set C'` or `'Set D'`, and the notes of
   fix item 7.

## The 16 cases

Built by `buildAutomatic`. Every number here is checked against the model, and those the order's tables name are also
checked as the order types them. "Classes" are size, width, length, height and reflectivity (diffusion is 0
throughout). Lines are given as samples (feedback; gain); "pre" is a predelay (`FLINEAR`, its factor; gain 4096). None
is a shaft, so the fix round changed none of them.

| Key | Measures | Shape | Classes | Pair; copy | Room/direct | Key built numbers |
| --- | --- | --- | --- | --- | --- | --- |
| `closet` | no sky, 120 x 140 x 100, 0.3 | room | 0, 1, 0, 1, 1 | 102/103; 102 | 38/217 | 1323 (3194; 1983), 2425 (2597; 2252); cutoff 2850 |
| `small_room` | no sky, 200 x 260 x 120, 0.4 | room | 1, 2, 1, 1, 1 | 102/103; 102 | 38/217 | 1358 (3350; 1350), 2152 (2979; 1856), 2989 (2632; 1856); cutoff 2850 |
| `room` | no sky, 300 x 400 x 160, 0.4 | room | 2, 3, 2, 2, 1 | 102/103; 103 | 41/214 | 3 all-passes (573, 837, 1146; 614); 1464 (3506; 764), 2081 (3283; 1053), 2698 (3075; 1323), 3360 (2866; 1327), 3977 (2684; 1327); cutoff 2850 |
| `large_room` | no sky, 500 x 700 x 220, 0.4 | room | 3, 3, 3, 3, 1 | 102/103; 103 | 41/214 | 3 all-passes; 1640 (3661; 545), 2346, 3095, 3845, 4551, 5300 (2851; 1283); cutoff 2850 |
| `great_hall` | no sky, 700 x 1300 x 400, 0.4 | room | 4, 4, 4, 4, 1 | 102/103; 103 | 41/214 | 3 all-passes; 8 lines 1887 (3817; 298) to 7267 (3123; 1039); cutoff 2850 |
| `vent` | no sky, 48 x 400 x 64, 0.4 | duct | 1, 0, 2, 1, 1 | 106/107; 106 | 51/204 | 444 (3727; 1472), 3619 (1898; 4096); cutoff 3000 |
| `corridor` | no sky, 80 x 400 x 120, 0.4 | hall | 1, 1, 2, 1, 1 | 110/111; 110 | 38/217 | pre 2072 (2703), 617 (1228; 2676), 308 (3481; 1607); cutoff 4500 |
| `long_corridor` | no sky, 90 x 1200 x 120, 0.4 | hall | 2, 1, 4, 1, 1 | 110/111; 111 | 38/217 | pre 5733 (1720), 926 (1228; 1310), 308 (3481; 786), 1719 (1720; 1310), 1234 (1228; 1310), 617 (3481; 786); cutoff 4500 |
| `tunnel` | no sky, 200 x 1000 x 150, 0.3 | tunnel | 2, 2, 3, 2, 1 | 114/115; 115 | 72/183 | 2 all-passes (573, 837; 610); pre 3924 (2457); 1543 (1802; 910), 617 (3899; 227), 1278, 1852, 926, 1587, 2160, 1234; cutoff 4500 |
| `big_tunnel` | no sky, 280 x 1400 x 250, 0.4 | tunnel | 3, 2, 4, 3, 1 | 114/115; 115 | 72/183 | 2 all-passes (573, 837; 611); pre 5909 (2048); 1543 (1884; 910), 617, 1764, 1852, 926, 2072, 2160, 1234; cutoff 4500 |
| `alley` | sky, 120 x 600 x 4800, 0.4 | alley | 1, 1, 3, 4, 1 | 122/123; 122 | 24/231 | pre 5997 (1130), pre 3087 (901), 2205 (2048; 3686); cutoff 3500 |
| `street` | sky, 300 x 1300 x 4800, 0.4 | street | 3, 3, 4, 4, 1 | 118/119; 119 | 23/232 | pre 17287 (524), pre 5292 (901), 2998 (1769; 3686); cutoff 1750 |
| `courtyard` | sky, 500 x 700 x 4800, 0.4 | courtyard | 3, 3, 3, 4, 1 | 126/127; 127 | 5/250 | one `LOWPASS` echo 5144 (1802; 4915), its time 700 / 6 ms; cutoff 2760 |
| `open` | sky, 2 x 2 x 4800, 0.08, 4 open sides | open space | 0, 0, 0, 4, 1 | 130/131; 130 | 5/250 | all-pass 13230 (819); 3 all-passes (573, 837, 1146; 614); delay 7937 (614); 6 modulated lines 9702 (3276; 545) to 14112 (2960; 682), two sections on the sum at 1050 |
| `set_c_room` | no sky, 300 x 400 x 160, 0.9 | room | 2, 3, 2, 2, **3** | 102/103; 103 | 41/214 | `room`'s diffusor and lines; cutoff **4950** |
| `set_d_street` | sky, 300 x 1000 x 4800, 0.4 | street | 3, 3, 3, 4, 1 | 118/119; 119 | 23/232 | pre 13582 (557), pre 5292 (901), 2998 (1769; 3686); w, d, h 68, 308, 120 ms; cutoff 1750 |

No case sits on a threshold of a class or of the reflectivity. `vent`'s width of 48 sits on the duct rule's integer
boundary, as the order intends; a check names it as the one exception. The other reading of `open` (spans of 9600)
is an open space of size class 4, a copy of 131, also 5/250. That is checked against the model and against the
order's words.

## The API as built (part b's additions)

All on `TF2Room`, beside part a's (its report, "The API as built").

| Call | What it does |
| --- | --- |
| `buildAutomatic(arg, { table })` | `arg` is the measures `{ sky, width, length, height, reflectivity, openSides }` (every one given; `sky` a boolean), a row of `ROOM_CASES` or `ROOM_PLACES`, or a row's key. Returns `{ preset, shape, shapeNumber, variable, shaft, classes, pair, copy, measures, key }`. `preset` is `{ name, h, p }` in the table's form: values singles, each processor's values padded to 16, frozen. `shape` is the name (`'room'` ... `'open courtyard'`); `shaft` says whether the space is a vertical shaft; `classes` is `{ size, width, length, height, reflectivity, diffusion }` (a shaft's from the exchanged record); `pair` is `[A, B]`; `copy` is the template copied whole; `key` is the row's key or null. `table` replaces the module's table (the tests use it for edited templates) |
| `placeFromDebug(line, { table })` | `line` is the numbers of a new node's log line: `{ size: [a, b], height: c, refl: r, sky: s }` (whole feet, the length first; `sky` 1 or 0, or a boolean). Optional: `mix`, the four values `dsp_mix_min`, `dsp_mix_max`, `dsp_db_min`, `dsp_db_mixdrop` read after the build, and `shape`, the console's shape line (`'ROOM Detected'`, `'OPEN SIDED OUTDOOR AREA'` ...) or the module's name. It tries every space the numbers allow: 12N - 6 to 12N + 6 units a printed N (heights capped at the ray's 4800), and the reflectivity either side of a threshold within the printed half step. Spaces whose shape and classes agree are one candidate, kept with the measures nearest the printed ones (fewer open sides first); the shape line and the mix values filter them. Returns `{ measures, shape, shaft, classes, copy, candidates, open }`: the first candidate's values, all the candidates, and the names of what differs among them (`shape`, `openSides`, `size`, `width`, `length`, `height`, `reflectivity`, `copy`). Throws when no space fits |
| `ROOM_CASES` | frozen array of the 16 rows `{ key, label, measures, measured?, set?, note? }`, in the order's order: the 14 examples, then `set_c_room` and `set_d_street` (`measured: true`) |
| `ROOM_PLACES` | frozen, empty. The owner's places, one row each: `{ key, label, map, spot, measures (units), shape (the module's name for the printed shape line), log (the printed numbers), note (which class was taken where the log left two open) }` |
| `roomCase(key)` | the row of `ROOM_CASES` or `ROOM_PLACES` with that key, or null |
| `SHAPES` | the eleven shapes by number: `{ number, name, variable, base }` (the variable `adsp_*_min` and its default) |

`buildAutomatic` refuses, by name:
- a width, length or height that is not a whole number from 0 to 2^31 - 1;
- a reflectivity that is not a number from 0 to 1;
- a `sky` that is not `true` or `false`;
- open sides that are not a whole number from 0 to 4, or that are missing;
- a key no row has;
- a table without the pair's two templates.

`placeFromDebug` refuses, by name: printed numbers that are not whole feet, a sky that is not 1 or 0, a shape line
the console does not print, and a log no space can fit.

## Readings of the order

Where the order or the reports could be read more than one way. Where the reports leave a detail open, the model's
`build_auto` was followed, as part a's item 2 says. 2R has since read most of these against the engine; where it did,
the reading says so.

1. **`AMP` and `MDY` are blended.** R2 e1 says so: `MDY` 0 to 12 on the length class, `AMP` 0 to 7 on the size class,
   linear. The first build did this, against the model of the time. 2R confirmed it at the build's own addresses
   (`0x180032e30`, `0x180032e70`; finding 3). The model is now corrected and blends both, and an edited pair
   checks the module against it. A check typed from R2 e1 stays.
2. **Every processor type is blended at 2R's indices** (section 1; finding 2): `FLT`, `PTC`, `CRS`, `ENV`, `EFO` and
   `LFO` on the size class, linear. The module builds no instance of these six types; a preset holding one is still
   refused by name when it is instanced. The built values are the engine's all the same, and two edited pairs check
   them against the model's parameters. (The first build's reading 2 left five of them copied; that is withdrawn.)
3. **The measures are checked, and nothing defaults.** Width, length and height must be whole numbers, 0 or more (R2
   e1: ints). The reflectivity must be a number from 0 to 1 (R2 e4: a mean of values clamped to 0..1). Open sides
   must be 0 to 4 (four level rays), and must be given even indoors, where they are ignored. `sky` must be a boolean.
4. **Width and length are taken as given.** The engine's measuring makes the width the smaller span (R2 e4), but
   `buildAutomatic` does not swap the two, and neither does the model. A width larger than the length is judged by
   the same rules (one probe).
5. **The vertical shaft** (corrected; 2R finding 1, row 2): the record's length and height are exchanged for the shape
   **and the classes**, then exchanged back. The measures that replace a negative value are the true ones (2R row 21).
   The first build read R2 e2's "swapped for the test" as the shape only; that was wrong.
6. **Open sides count only under the sky** (R2 e2; 2R row 4). Indoors they are ignored (one probe). 2R's note 7: a
   wall whose material's reflectivity is exactly 0 counts as open too. That is a remark for the page's words, not a
   rule here.
7. **"All others" in the size class** includes the open space, the open wall and the open street, which take the mean
   of the width and length classes, while the street takes its width class. The open courtyard uses the courtyards'
   own length scale. 2R row 12 confirms this.
8. **The measure in place of a negative value**, as the model and 2R rows 19 and 20 have it. For feet, the single
   measure times the double 1/12; for ms, the measure times the double 1/6. Then the clamp in double, then a single.
9. **"The first and the second processor of each type"**: n = 0 and 1, matched in the copy, A and B, and skipped if
   any of the three lacks it. A third keeps the copy's values (2R row 18; an edited pair checks it).
10. **The pair's numbers are the shape variables' defaults** (W3-15 section 4; 2R row 13). The app has no `adsp_*_min`
    variables. Whether anything in the game changes them was not read (2R note 6).
11. **Diffusion has no input.** The engine never measures it (R2 e4; 2R rows 11 and 14), so the "+ 2" can never apply.
    It is written in the code for the record.
12. **The 0.8 threshold** follows the model and the binary (W3-17a second read, row 20; 2R row 10).
13. **No case sits on a threshold** is checked against the order's threshold lists (R2 e1's class thresholds; the
    courtyards' length scale only for the courtyard; reflectivities within 0.01; the shape rules' ratios `L = 4W`,
    `L = 2.5W`, `H = 3L`; widths 96 and 144), with `vent`'s width of 48 named as the order's own exception.
14. **`buildAutomatic` also takes a key or a row**, for part c's `{ auto: key or measures }`.
15. **Two builds from equal measures are equal presets to the module's slot**: it compares presets by `h` and `p`,
    so setting one while the other plays starts no fade. **This is not the engine's rule** (2R note 5, row 26). The
    engine's slot compares preset numbers (`0x1800388fe`), and every new node gets a new number (60 + its index in a
    ring of 40). So the engine sets a new node's preset with fresh instances and the 200 ms cross-fade, even when its
    values equal the last one's. The app has no walking, so nothing heard changes, and no code was changed for it.
16. **The measured cases' recorded outputs** come from the order's text (item 5) and are typed into the test.
    `reference.out` and `tails.out` are part a's and stay unchanged. `auto.py` reruns the model on the two cases and
    stops unless it gets the same five numbers each.
17. **The measured cases' notes** are 2R section 3's words (fix item 7) with the order's reflectivity classes. The
    W3-17a second read, Part 2, leaves the same two classes open.
18. **`placeFromDebug`'s half foot**: 2R section 4 says a printed N is 12N - 6 to 12N + 6 units, and that which way an
    exact half foot rounds was not read. The helper takes both ends. Two checks pin the width of that range to 6
    units either side (by hand from R2 e2's hall rule): size:(11,5) may be a hall or a room, and size:(13,6) only a
    room. A wider range of 4 to 8 units gives the same threshold lists, and the two checks tell 6 from 5 and from 7.
19. **`placeFromDebug`'s candidates** are grouped by shape, classes and copy; a group whose classes differ but whose
    preset is the same stays two candidates, as 2R frames the log ("the row should say which was taken"). Open sides
    are tried 0 to 4 under the sky. Without a shape line or mix values they stay open, and 3 and 4 (open wall, open
    space) stay two candidates that build alike.

## What in the order or the reports was wrong, or could not be done

- **The shaft** (fix item 1): R2 e2's "swapped for the test", the model and the first build all had a shaft's classes
  wrong. 2R found it in the binary. No named case is a shaft, so no recorded output moved.
- **The model's build** left `AMP`, `MDY`, `PTC`, `CRS`, `ENV`, `EFO` and `LFO` unblended. It is corrected on `main`
  (`409d942`), and the module now does the same as the corrected model.
- **Some rules cannot be seen with the table's own templates**, because each pair holds equal values there, or no
  pair holds the type at all. That covers the modulation, the diffusors' size and gain, a delay's gain, the copied
  fpar and ftap, the positive taps' class, B - A as a single, and every type but `RVA`, `DFR` and `DLY`. Edited pairs
  judged against the model catch each break.
- **T18 cannot be caught by any input**: "a tunnel from width 96" changes nothing, because a width-96 space long
  enough to be a tunnel is a hall first.
- Not done, by the order: the measuring (R2 e3, e4), parts c and d. The browser suite was not run: no page loads the
  module, and nothing in part b's files touches the page.

## For part c's builder

- `{ auto: key or measures }` resolves with `TF2Room.buildAutomatic(x)`. Pass its `.preset` as `room` to
  `createRoomPath`. A build is cheap (microseconds); there is no need to cache it.
- `codecInfo.room` can take `shape`, `shaft`, `classes`, `pair`, `copy` and `key` from the result, with the shares
  from `TF2Room.shares(result.preset)`.
- Measures must be complete: `sky` a boolean and `openSides` given. Bad measures throw with a message that names them.
- The accuracy rows take `{ auto: 'set_c_room' }` and `{ auto: 'set_d_street' }`. The golden cases `tunnel`,
  `great_hall` and `set_c_room` build from their keys.
- The order's amendment after part a changes nothing in part b. Its item 5 replaces the comb-peak figures of part c's
  private check.

## For part d's builder

- The groups: `ROOM_CASES.filter((r) => r.measured)` for "Automatic room, as recorded" (label, `set`, `note`; the
  notes are 2R's honest ranges, checked word for word), and the rest for "examples by shape" (help text from
  `measures`; `open` has a `note`). Then `ROOM_PLACES`.
- The manual line ("tunnel; size class 2; from presets 114 and 115; 72/256 to the room") is `b.shape`,
  `b.classes.size`, `b.pair` and `TF2Room.shares(b.preset).room`, for `b = buildAutomatic(measures)`. Say "vertical
  shaft" when `b.shaft`.
- The six fields: `sky` a boolean, whole units, reflectivity 0 to 1, open sides 0 to 4 and always given. A
  reflectivity of exactly 0.8 is class 3.
- **A row of `ROOM_PLACES` from the owner's log**: pass the `NEW DSP NODE:` line's numbers, the shape line and the four
  mix values read afterwards to `placeFromDebug`. Take its `measures`, keep the printed numbers as `log`, and where
  `open` is not empty, say in `note` which candidate was taken. The console prints feet, the length first, no
  open-side count, and one line for all four open-sided shapes. A `DSP PRESET:` line, for a node met again, carries
  the same seven fields.

## The checks

`node tests/room-dsp.verify.mjs`, in `pnpm test`. Part a's 127 checks are unchanged and pass. Part b has 83, by
section (`ROOM_ONLY=automatic` runs only these):

- **Shapes and classes** (21):
  - `ROOM_CASES` is the order's 16 rows; the two measured ones are marked, and their notes match word for word.
    `ROOM_PLACES` is empty.
  - The 14 examples match the order's table, and the two measured cases match item 5. The 16 cases match the model.
    No case sits on a threshold.
  - Seven groups of probes test every threshold of R2 e1 and e2, the shafts included, each judged against the model
    in shape, classes, pair, copy, shares, header and parameters. Every probe is used.
  - Further checks: the reflectivity classes; the size class's three rules; the other reading of `open`; and three
    shaft checks typed from 2R and the brief (fix item 1).
- **The build** (40):
  - the 16 cases' header and parameters are the model's, value for value as singles (the 14 examples are also
    `lines.json`'s), and their built integers are the model's;
  - 16 checks of the order's built numbers, and R2's two echo tables;
  - 17 edited template pairs;
  - the order's synthetic pair (width 6.6666665, depth 33.333332, `reference.out`'s printed reverb and its hash);
  - 240 swept measures;
  - `AMP` and `MDY` by R2 e1's formula.
- **Outputs** (6): `reference.out`'s shares and hashes for the 14 examples; the two measured cases' hashes (the
  order's, and the model's in `auto.json`); 56 tail lengths, and the great hall after the long square (173162); the
  measured cases' four tail lengths.
- **The API** (5): a key, a row or the measures give the same build; bad measures are refused by name; nothing passes
  silently (fix item 8); the built preset is frozen, in the table's form, made of singles, and runs in a room path and
  in a slot; `SHAPES`.
- **The console's log** (11), typed from 2R section 4:
  - size:(33,25) height:(13) is 396 x 300 x 156 and builds `set_c_room`'s room;
  - size:(83,25) height:(400) under the sky with the street line is 996 x 300 x 4800, `set_d_street`'s street;
  - the width, length, height and courtyard classes are open exactly at the listed feet (6, 12, 24, 48; 12, 24,
    48, 96; 4, 11, 18, 32; 10, 20, 40, 100), and the reflectivity class at 0.0400, 0.5000 and 0.8000;
  - the open-sided line's pair by the mix (one, two, three or four sides), and a room's copy by the mix (0.3 is
    102, 0.32 is 103);
  - the half foot of 6 units;
  - a shaft in the log (a hall of classes 1, 0, 3, 1 from 110), and the refusals.

## Breaks

Each mutation was made in a scratch copy of `room-dsp.js`, and the suite was run on it
(`TF2_DIR=<copy> ROOM_ONLY=automatic node tests/room-dsp.verify.mjs`; only part b's sections call `buildAutomatic` or
`placeFromDebug`). Nineteen were also run against the whole suite: in the first build all of the order's rows, B6,
T11 and T18, and in the fix round F1a, F2a, F5 and F9a. Each time the same checks failed and no check of part a
failed. "Checks failed" counts part b's checks
that failed, in the fix round's suite. "From" is one of:
- "order": the order's list of mutations for part b;
- "own": the builder's own, from the first build;
- "fix: ...": the fix round, naming the 2R finding or review finding it covers.

The shaft rows T22 to T24 were made again on the new `isShaft`. The runner and its logs are in the builder's scratch
folder, not in the repository.

| # | From | Mutation | Checks failed | Caught by (the most pointed first) |
| --- | --- | --- | --- | --- |
| O1a | order | the reverb's cutoff blended from the bright end (A + (B - A) x class / 4) | 36 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, closet: lines 1323 (3194; 1983), 2425 (2597; 2252) ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; and 33 more |
| O1b | order | a delay's cutoff and width blended from the bright end | 12 | "the order's numbers, courtyard: one echo, 5144 samples (116.67 ms, the length ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, a courtyard: the delay -1 in A only (B 50 ms); the measure ..."; and 9 more |
| O2 | order | the copy taken from A at size class 2 (B only above 2) | 25 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "a vertical shaft has the classes of its exchanged length and height: 100 x ..."; and 22 more |
| O3a | order | a squared parameter made linear: the reverb's size | 25 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, small_room: 3 lines 1358 (3350; 1350), 2152 (2979 ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; and 22 more |
| O3b | order | a squared parameter made linear: the reverb's min | 27 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, small_room: 3 lines 1358 (3350; 1350), 2152 (2979 ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; and 24 more |
| O3c | order | a squared parameter made linear: the reverb's width, depth and height | 23 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, corridor: predelay 2072 (factor 2703), 617 (1228; 2676) ..."; "the order's numbers, long_corridor: predelay 5733 (1720) and 5 lines 926 ..."; and 20 more |
| O3d | order | a squared parameter made linear: a delay's time and taps | 6 | "edited templates, a courtyard: delays and taps positive in both, blended ..."; "edited templates, open space: three delays in each template (only the first ..."; "edited templates, open space: the reverbs' modulation differing (fmod 10 and ..."; and 3 more |
| O3e | order | the reverse: the reverb's feedback and gain squared | 33 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, small_room: 3 lines 1358 (3350; 1350), 2152 (2979 ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; and 30 more |
| O3f | order | the reverse: the reverb's factors fw, fd, fh squared | 26 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, corridor: predelay 2072 (factor 2703), 617 (1228; 2676) ..."; "the order's numbers, long_corridor: predelay 5733 (1720) and 5 lines 926 ..."; and 23 more |
| O3g | order | the reverse: the diffusor squared | 14 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, tunnel: R2's example 3: 2 all-passes (573, 837; 610) ..."; "the order's numbers, big_tunnel: 2 all-passes (feedback 611), predelay 5909 ..."; and 11 more |
| O3h | order | the reverse: a delay's feedback and gain squared | 14 | "the order's numbers, courtyard: one echo, 5144 samples (116.67 ms, the length ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, a courtyard: the delay -1 in B only (A 50 ms), large: the ..."; and 11 more |
| O4 | order | the size class of a street (and alley) taken from the mean | 5 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the size class: an alley 120 x 600 is 1 (its width class), an open street of ..."; "240 seeded random measures over every shape: the model's shape, classes ..."; and 2 more |
| O5 | order | the diffuse pair chosen (base + 2) | 65 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "a vertical shaft has the classes of its exchanged length and height: 100 x ..."; and 62 more |
| O6 | order | the measured delay as length / 12 | 10 | "the order's numbers, courtyard: one echo, 5144 samples (116.67 ms, the length ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, a courtyard: the delay -1 in B only (A 50 ms), large: the ..."; and 7 more |
| O7a | order | a negative template dimension interpolated (the reverb's measures not used) | 6 | "a shaft's measures in place of negative values stay the true ones: the hall ..."; "edited templates, negative width and depth in templates (reference.py: 110 ..."; "edited templates, a hall: width -1 in A only, depth -1 in B only, height -1 ..."; and 3 more |
| T1 | own | the width class at 72 tested as >= (72 is class 1) | 1 | "the width class at 72, 144, 288 and 576 (indoors, and under the sky where the ..." |
| T2 | own | the width class at 288 tested as >= | 1 | "the width class at 72, 144, 288 and 576 (indoors, and under the sky where the ..." |
| T3 | own | the length class at 1152 tested as >= | 2 | "the width class at 72, 144, 288 and 576 (indoors, and under the sky where the ..."; "the length class at 144, 288, 576 and 1152: the model's shape, classes, pair ..." |
| T4 | own | the length class at 144 one unit high (> 145) | 1 | "the length class at 144, 288, 576 and 1152: the model's shape, classes, pair ..." |
| T5 | own | the height class at 48 tested as >= | 1 | "the height class at 48, 128, 216 and 384: the model's shape, classes, pair ..." |
| T6 | own | the height class at 216 one unit low (> 215) | 1 | "the height class at 48, 128, 216 and 384: the model's shape, classes, pair ..." |
| T7 | own | the courtyards' size class at 240 tested as >= | 1 | "the courtyards' size class at lengths 120, 240, 480 and 1200 (courtyard and ..." |
| T8 | own | the courtyards' size class from the ordinary length scale | 5 | "a courtyard's size class is open exactly at printed lengths 10, 20, 40, 100 ..."; "the size class: an alley 120 x 600 is 1 (its width class), an open street of ..."; "240 seeded random measures over every shape: the model's shape, classes ..."; and 2 more |
| T9 | own | the reflectivity at 0.5 tested as < (0.5 is class 2) | 3 | "the reflectivity class is open at 0.0400 (0 or 1), 0.5000 (1 or 2) and 0.8000 ..."; "reflectivity classes: 0.04 is 0 and the next single 1; 0.5 is 1 and the next ..."; "the reflectivity class at 0.04, 0.5 and 0.8 (the single on it, one single ..." |
| T10 | own | the reflectivity at 0.04 tested as >= (the single 0.04 is class 1) | 2 | "reflectivity classes: 0.04 is 0 and the next single 1; 0.5 is 1 and the next ..."; "the reflectivity class at 0.04, 0.5 and 0.8 (the single on it, one single ..." |
| T11 | own | reflectivity 0.8 as class 2 (the single compared with the single 0.8) | 2 | "reflectivity classes: 0.04 is 0 and the next single 1; 0.5 is 1 and the next ..."; "the reflectivity class at 0.04, 0.5 and 0.8 (the single on it, one single ..." |
| T12 | own | the reflectivity compared as a double, not rounded to a single first | 2 | "reflectivity classes: 0.04 is 0 and the next single 1; 0.5 is 1 and the next ..."; "the reflectivity class at 0.04, 0.5 and 0.8 (the single on it, one single ..." |
| T13 | own | a duct up to width 47 (W < 48) | 8 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the order's numbers, vent: lines 444 (3727; 1472), 3619 (1898; 4096); cutoff ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; and 5 more |
| T14 | own | a duct at exactly 4 widths (L >= 4W) | 2 | "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..."; "the other reading of `open`, a width larger than the length, all measures 0 ..." |
| T15 | own | a hall at exactly 2.5 widths (L >= 2.5W) | 1 | "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..." |
| T16 | own | a hall only to width 95 (W < 96) | 1 | "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..." |
| T17 | own | a hall's lower width bound dropped | 1 | "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..." |
| T18 | own | a tunnel from width 96 (W >= 96) | 0 | **none** |
| T19 | own | a courtyard below 2.5 widths only (L < 2.5W) | 1 | "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..." |
| T20 | own | the courtyard's test the wrong way round (W <= 2.5L) | 18 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "size:(83,25) height:(400) sky 1 with "OUTSIDE STREET Detected": height 4800 ..."; and 15 more |
| T21 | own | an alley to width 143 (W < 144) | 2 | "the width class at 72, 144, 288 and 576 (indoors, and under the sky where the ..."; "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..." |
| T22 | own | the shaft at exactly 3 lengths (H >= 3L) | 3 | "a vertical shaft has the classes of its exchanged length and height: 100 x ..."; "240 seeded random measures over every shape: the model's shape, classes ..."; "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..." |
| T23 | own | the shaft swap missing (shape and classes) | 7 | "a vertical shaft has the classes of its exchanged length and height: 100 x ..."; "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "a shaft's measures in place of negative values stay the true ones: the hall ..."; and 4 more |
| T24 | own | the shaft test the wrong way round (L > 3H) | 35 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "a vertical shaft has the classes of its exchanged length and height: 100 x ..."; "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; and 32 more |
| T25 | own | open sides counted indoors too | 2 | "240 seeded random measures over every shape: the model's shape, classes ..."; "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..." |
| T26 | own | open sides n giving shape 7 + n (the order reversed) | 16 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the open-sided line's pair by the mix: 0.21, 0.8, 95, 0.1 one side open; 0.3 ..."; "the order's numbers, open: all-pass 13230, 3 all-passes, delay 7937, 6 ..."; and 13 more |
| T27 | own | the size class from the mean rounded up | 33 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "a vertical shaft has the classes of its exchanged length and height: 100 x ..."; and 30 more |
| B1 | own | every blend from the wrong template (B toward A, the cutoffs A toward B) | 53 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, closet: lines 1323 (3194; 1983), 2425 (2597; 2252) ..."; "the order's numbers, small_room: 3 lines 1358 (3350; 1350), 2152 (2979 ..."; and 50 more |
| B2 | own | the copy from the wrong template (A above size class 1, B below) | 30 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; and 27 more |
| B3 | own | the class divisor 4 where it is 5 | 49 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, small_room: 3 lines 1358 (3350; 1350), 2152 (2979 ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; and 46 more |
| B4 | own | the reverb cutoff's divisor 5 where it is 4 | 37 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, closet: lines 1323 (3194; 1983), 2425 (2597; 2252) ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; and 34 more |
| B5 | own | the delay cutoff's divisor 4 where it is 5 | 11 | "the order's numbers, courtyard: one echo, 5144 samples (116.67 ms, the length ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, a courtyard: the delay -1 in B only (A 50 ms), large: the ..."; and 8 more |
| B6 | own | the measure not replacing a negative value (any template) | 17 | "a shaft's measures in place of negative values stay the true ones: the hall ..."; "the order's numbers, courtyard: one echo, 5144 samples (116.67 ms, the length ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; and 14 more |
| B7 | own | the measure only when both templates are negative | 5 | "edited templates, negative width and depth in templates (reference.py: 110 ..."; "edited templates, a hall: width -1 in A only, depth -1 in B only, height -1 ..."; "edited templates, a courtyard: the delay -1 in A only (B 50 ms); the measure ..."; and 2 more |
| B8 | own | the blend in double precision (no single rounding) | 16 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, a hall: width -1 in A only, depth -1 in B only, height -1 ..."; and 13 more |
| B9 | own | squared as (to - from) x (t x t) (the factor squared first) | 12 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, open space: three delays in each template (only the first ..."; and 9 more |
| B10 | own | the third processor of a type blended too | 3 | "edited templates, open space: three delays in each template (only the first ..."; "edited templates, a room: amplifiers and a modulating delay in each template ..."; "an amplifier blended on the size class and a modulating delay on the length ..." |
| B11 | own | only the first processor of a type blended | 8 | "edited templates, open space: three delays in each template (only the first ..."; "edited templates, a room: two reverbs in each template (both blended): the ..."; "edited templates, open space: the reverbs' modulation differing (fmod 10 and ..."; and 5 more |
| B12 | own | the blend skipped only when the copy lacks the processor (a missing A or B read as zeros) | 22 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; "the order's numbers, large_room: 3 all-passes; 6 lines 1640 to 5300 (3661 to ..."; and 19 more |
| B13 | own | a delay's first tap measured from the length (not the width) | 5 | "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, a courtyard: the delay -1 in B only (A 50 ms), large: the ..."; "240 seeded random measures over every shape: the model's shape, classes ..."; and 2 more |
| B14 | own | the reverb's width measured from the length | 6 | "a shaft's measures in place of negative values stay the true ones: the hall ..."; "edited templates, negative width and depth in templates (reference.py: 110 ..."; "edited templates, a hall: width -1 in A only, depth -1 in B only, height -1 ..."; and 3 more |
| B15 | own | the feet without the clamp at 6 | 3 | "a shaft's measures in place of negative values stay the true ones: the hall ..."; "edited templates, a hall: width -1 in A only, depth -1 in B only, height -1 ..."; "edited templates, a hall shaft: width, depth and height -1 in both (the ..." |
| B16 | own | the feet without the clamp at 500 | 1 | "edited templates, a hall: width -1 in A only, depth -1 in B only, height -1 ..." |
| B17 | own | a delay's measure without the 14 ms floor | 3 | "edited templates, a courtyard: the delay -1 in A only (B 50 ms); the measure ..."; "240 seeded random measures over every shape: the model's shape, classes ..."; "the courtyards' size class at lengths 120, 240, 480 and 1200 (courtyard and ..." |
| B18 | own | a delay's measure without the 500 ms cap | 2 | "edited templates, a courtyard: the measures past 500 ms (the clamp): the ..."; "240 seeded random measures over every shape: the model's shape, classes ..." |
| B19 | own | the reverb's width blended on the length class | 15 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, long_corridor: predelay 5733 (1720) and 5 lines 926 ..."; "the order's numbers, tunnel: R2's example 3: 2 all-passes (573, 837; 610) ..."; and 12 more |
| B20 | own | the reverb's fd blended on the width class | 23 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, corridor: predelay 2072 (factor 2703), 617 (1228; 2676) ..."; "the order's numbers, long_corridor: predelay 5733 (1720) and 5 lines 926 ..."; and 20 more |
| B21 | own | the diffusor blended on the length class | 12 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, tunnel: R2's example 3: 2 all-passes (573, 837; 610) ..."; "the order's numbers, big_tunnel: 2 all-passes (feedback 611), predelay 5909 ..."; and 9 more |
| B22 | own | the reverb's modulation (fmod, rate) not blended | 1 | "edited templates, open space: the reverbs' modulation differing (fmod 10 and ..." |
| B23 | own | the reverb's count not blended | 30 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, small_room: 3 lines 1358 (3350; 1350), 2152 (2979 ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; and 27 more |
| B24 | own | the amplifier blended on the length class | 2 | "edited templates, a room: amplifiers and a modulating delay in each template ..."; "an amplifier blended on the size class and a modulating delay on the length ..." |
| B25 | own | the modulating delay not blended (the model's build) | 2 | "edited templates, a room: amplifiers and a modulating delay in each template ..."; "an amplifier blended on the size class and a modulating delay on the length ..." |
| B26 | own | the header from A always | 21 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; and 18 more |
| B27 | own | the pair of an open wall taken as the open street's (118) | 4 | "the open-sided line's pair by the mix: 0.21, 0.8, 95, 0.1 one side open; 0.3 ..."; "240 seeded random measures over every shape: the model's shape, classes ..."; "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..."; and 1 more |
| B28 | own | the diffusor's size and gain not blended | 1 | "edited templates, a tunnel: the diffusors' size and gain differing: the ..." |
| B29 | own | a delay's gain not blended | 1 | "edited templates, a courtyard: delays and taps positive in both, blended ..." |
| B30 | own | the reverb's filter flag and tap factor blended (on the size class) | 1 | "edited templates, a small room: the filter flag and the tap factor differing ..." |
| B31 | own | a filter (FLT) not blended | 1 | "edited templates, a room: a filter in each template (FLT on the size class ..." |
| B32 | own | the reverb's cutoff blended on the size class (not the reflectivity class) | 30 | "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "the order's numbers, closet: lines 1323 (3194; 1983), 2425 (2597; 2252) ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; and 27 more |
| F1a | fix: second read 1 | a shaft's classes from the true measures (the swap for the shape only: the old build) | 5 | "a vertical shaft has the classes of its exchanged length and height: 100 x ..."; "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "edited templates, a hall shaft: width, depth and height -1 in both (the ..."; and 2 more |
| F1b | fix: second read 1 | a shaft's measures in place of negative values from the exchanged record | 2 | "a shaft's measures in place of negative values stay the true ones: the hall ..."; "edited templates, a hall shaft: width, depth and height -1 in both (the ..." |
| F1c | fix: second read 1 | a shaft under the sky too | 22 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "size:(83,25) height:(400) sky 1 with "OUTSIDE STREET Detected": height 4800 ..."; and 19 more |
| F1d | fix: second read 1 | only the length class taken from the height in a shaft (the height class from the height) | 6 | "a vertical shaft has the classes of its exchanged length and height: 100 x ..."; "the second read's three shafts, value for value: 200 x 250 x 800 (room, 103 ..."; "a shaft in the log (size:(8,5) height:(66) indoors): a hall of classes 1, 0 ..."; and 3 more |
| F2a | fix: second read 2 | PTC, CRS, ENV, EFO and LFO not blended (copied) | 1 | "edited templates, a room: PTC, CRS, ENV, EFO and LFO in each template (all on ..." |
| F2b | fix: second read 2 | ENV blended on values 0 to 7 only | 1 | "edited templates, a room: PTC, CRS, ENV, EFO and LFO in each template (all on ..." |
| F2c | fix: second read 2 | LFO on the length class | 1 | "edited templates, a room: PTC, CRS, ENV, EFO and LFO in each template (all on ..." |
| F2d | fix: second read 2 | PTC blended on values 0 to 3 (one too many) | 1 | "edited templates, a room: PTC, CRS, ENV, EFO and LFO in each template (all on ..." |
| F2e | fix: second read 2 | MDY blended squared | 2 | "edited templates, a room: amplifiers and a modulating delay in each template ..."; "an amplifier blended on the size class and a modulating delay on the length ..." |
| F4a | fix: review 1 | a delay's tap 1, positive, blended on the width class | 1 | "edited templates, a courtyard: delays and taps positive in both, blended ..." |
| F4b | fix: review 1 | a delay's taps 2 and 3, positive, blended on the width class | 1 | "edited templates, a courtyard: delays and taps positive in both, blended ..." |
| F5 | fix: review 2 | B - A not rounded to a single before the product | 1 | "edited templates, a room: B - A not a single (the reverb's size 0.1 in A ..." |
| F6 | fix: review 3 | FLT on the length class | 1 | "edited templates, a room: a filter in each template (FLT on the size class ..." |
| F7 | fix: review 4 | set_c_room's note says class 2 fits best | 1 | "the two measured cases' notes say what the takes fix, word for word as typed ..." |
| F8a | fix: review 6 | sky read as truthy again | 1 | "nothing passes silently: sky must be true or false (not "false", 1 or ..." |
| F8b | fix: review 6 | missing open sides default to 0 | 1 | "nothing passes silently: sky must be true or false (not "false", 1 or ..." |
| F8c | fix: review 6 | a row without a key builds with key undefined | 1 | "nothing passes silently: sky must be true or false (not "false", 1 or ..." |
| F9a | fix: second read 4 | the printed size read width first | 7 | "a shaft in the log (size:(8,5) height:(66) indoors): a hall of classes 1, 0 ..."; "size:(33,25) height:(13) refl 0.9000 sky 0 is length 396, width 300, height ..."; "size:(83,25) height:(400) sky 1 with "OUTSIDE STREET Detected": height 4800 ..."; and 4 more |
| F9b | fix: second read 4 | a printed foot taken as 12N - 3 to 12N + 3 units | 2 | "a printed foot is 12N - 6 to 12N + 6 units: size:(11,5) may be a hall or a ..."; "the height class is open exactly at printed heights 4, 11, 18, 32 (1 to 60)" |
| F9c | fix: second read 4 | a printed foot taken as 12N - 8 to 12N + 8 units | 1 | "a printed foot is 12N - 6 to 12N + 6 units: size:(11,5) may be a hall or a ..." |
| F9d | fix: second read 4 | a printed foot taken as exactly 12N units | 6 | "a printed foot is 12N - 6 to 12N + 6 units: size:(11,5) may be a hall or a ..."; "the width class is open exactly at printed widths 6, 12, 24, 48 (1 to 60)"; "the length class is open exactly at printed lengths 12, 24, 48, 96 (1 to 110)"; and 3 more |
| F9e | fix: second read 4 | the printed reflectivity taken as exact (no neighbour across a threshold) | 1 | "the reflectivity class is open at 0.0400 (0 or 1), 0.5000 (1 or 2) and 0.8000 ..." |
| F9f | fix: second read 4 | the mix values not used | 2 | "the open-sided line's pair by the mix: 0.21, 0.8, 95, 0.1 one side open; 0.3 ..."; "a room's copy by the mix: on the width and length thresholds (12 and 24 feet) ..." |
| F9g | fix: second read 4 | a printed foot taken as 12N - 5 to 12N + 5 units | 1 | "a printed foot is 12N - 6 to 12N + 6 units: size:(11,5) may be a hall or a ..." |
| F9j | fix: second read 4 | a printed foot taken as 12N - 7 to 12N + 7 units | 1 | "a printed foot is 12N - 6 to 12N + 6 units: size:(11,5) may be a hall or a ..." |
| F9h | fix: second read 4 | the console's shape line not used | 4 | "a shaft in the log (size:(8,5) height:(66) indoors): a hall of classes 1, 0 ..."; "size:(83,25) height:(400) sky 1 with "OUTSIDE STREET Detected": height 4800 ..."; "a courtyard's size class is open exactly at printed lengths 10, 20, 40, 100 ..."; and 1 more |
| F9i | fix: second read 4 | the classes of a printed line from the true measures in a shaft | 1 | "a shaft in the log (size:(8,5) height:(66) indoors): a hall of classes 1, 0 ..." |

The order's seven rows are:
- O1: the cutoff from the bright end, as the reverb's and as the delay's;
- O2: the copy from A at size class 2;
- O3: a squared parameter made linear (a to d), and the reverse (e to h);
- O4: the street's size class from the mean;
- O5: the diffuse pair chosen;
- O6: the measured delay as length / 12;
- O7: a negative template dimension interpolated.

The brief's own list maps onto the rows like this:
- a threshold off by one unit or the wrong way round: T1 to T27;
- linear where the engine squares: O3a to O3d;
- the blend from the wrong template: B1, B2;
- a class divisor of 4 where it is 5: B3, and the reverse, B4 and B5;
- the measure not replacing a negative value: B6, B7;
- the diffuse pair: O5;
- reflectivity 0.8 as class 2: T11.

The review's five uncaught mutations are F4a (its R13), F4b (R28), F5 (R16), F6 (R15) and F7 (R18).

**The one that nothing catches, and why none can:** T18 ("a tunnel from width 96") is the same build for every input.
At width 96 the tunnel rule needs `L > 384`, and every such space has already been named a hall by the rule before it
(`L > 240` and `48 < W <= 96`).

B25 ("the modulating delay not blended") was the old model's build. 2R found it a real break (finding 3), and it is
caught by the check typed from R2 e1 and by the `AMP` and `MDY` pair against the corrected model.
