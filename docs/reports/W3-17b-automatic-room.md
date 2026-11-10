# W3-17b: the automatic room

Builder's report. The order: `docs/work-orders/W3-17-room-effects.md`, part b. Branch `claude/w3-17b-automatic-room`,
from `6f0467e` (main with part a merged). Changed: `room-dsp.js` and `tests/room-dsp.verify.mjs`; added, the
builder's own: `tests/roomdsp/auto.py` and its output `tests/roomdsp/auto.json`. Nothing else.

## Summary

- `buildAutomatic(measures)` builds the engine's automatic room (`dsp_room 1`) as R2 e1 and e2 give it: the shape,
  the shaft swap included; the classes, with the exact thresholds and the size class's three rules; the pair from
  the shape's variable (never the "diffuse" pair); a whole copy of B above size class 1, else of A; then the first and
  second processor of each type blended in single precision, squared where R2 marks it, the cutoffs from the dull
  end, and a value written negative replaced by the measure. `ROOM_CASES` holds the order's 14 examples and its two
  measured cases; `ROOM_PLACES` is empty, ready for the owner's log.
- **The build met the model on its first full run**, value for value: the 16 named cases, 158 measures on and either
  side of every threshold of the shapes and classes, 13 pairs of edited templates for the rules no template of the
  table runs, and 240 seeded random measures over all eleven shapes. Shape, classes, pair, copy, shares, header and
  every parameter as a single are equal in all of them, and the built integers are equal for the 16 cases and the
  12 template pairs the app can build.
- **The outputs**: the 14 examples built here give `reference.out`'s 14 hashes and `tails.out`'s 57 tail lengths
  (quiet and square, alone and under water, and the great hall after the long square). The two measured cases give the
  order's recorded hashes (`set_c_room` 41/214 `b8160db1...`, `set_d_street` 23/232 `337b9b86...`) and four tail
  lengths (32481 and 80874, 22050 and 39889). Those outputs are in the order's text, not in `reference.out`; `auto.py`
  runs the model on the two cases and stops unless it gives the same numbers. It does.
- **No difference from the model on anything the model builds.** There is one difference on templates that no table
  holds: R2 e1 blends an amplifier (`AMP`) and a modulating delay (`MDY`). The model's build does not, because it was
  written before the model had either processor. The module follows R2 e1 (reading 1). No template of the table holds
  either type, so no output can differ.
- `tests/room-dsp.verify.mjs` now has 190 checks: part a's 127, unchanged, and 63 new. `node tests/room-dsp.verify.mjs`
  takes 11.9 s inside `pnpm test` on this machine (part a's report: 10.4 s; part b's sections alone take 1.5 to
  1.7 s; the limit is 30 s). `pnpm test` passed in full under the heavy lock on `ef3f337`. CI passed on `4e56198`;
  the head's run is given in the hand-back.
- **Breaks**: 74 mutations, each made in a scratch copy of `room-dsp.js`. 15 cover the order's seven rows (several
  rows have more than one form) and 59 are the builder's own. **All are caught but one**, T18, which no input can
  show: a width of 96 that is long enough to be a tunnel is a hall first. 15 of them were also run against the whole
  suite: the same checks failed and no check of part a failed.

## Files

| File | What |
| --- | --- |
| `room-dsp.js` | part a's module plus the automatic room: `buildAutomatic`, `ROOM_CASES`, `ROOM_PLACES`, `roomCase`, `SHAPES` (API below). Part a's code is unchanged |
| `tests/room-dsp.verify.mjs` | four new sections, "The automatic room: ..." (`ROOM_ONLY=automatic` runs them alone); part a's sections are unchanged |
| `tests/roomdsp/auto.py` | the builder's script: reads the model's `build_auto`, `shape_of`, `classes` and instances, and `reference.py`'s own functions, into `auto.json` (`python3 -I tests/roomdsp/auto.py`, about 6 s; the same bytes on a rerun; it writes no `__pycache__`). It asserts that its 14 examples match `lines.json`'s, that its first template pair matches `reference.py`'s template case, and that the model gives the order's numbers for the two measured cases |
| `tests/roomdsp/auto.json` | its output (128,736 bytes): `cases` (the 16 cases: measures, shape, classes, pair, copy, shares, header, parameters, built integers), `measured` (the model's hash and tails for the two measured cases), `probes` (158), `templates` (13 edited pairs), `sweep` (240). Parameters are written as the shortest decimal that reads back to the same single, which the test rounds and compares exactly |

`dspmodel.py`, `reference.py`, `lines.py`, `lines.json`, `coefs.mjs`, `convert.py`, `room-presets.json`,
`reference.out` and `tails.out` are unchanged.

## What was built, item by item

1. **`buildAutomatic(measures)`** (R2 e1, e2). The measures are `{ sky, width, length, height, reflectivity,
   openSides }` and are checked (reading 3).
   - **The shape** (e2): indoors, a height over three lengths swaps height and length for the test. Then duct if
     `L > 4W` and `W <= 48`; hall if `L > 2.5W` and `48 < W <= 96`; tunnel if `L > 4W` and `W > 96`; else room.
     Under the sky, n open sides give shape `11 - n`; with none, a courtyard if `L <= 2.5W`, else an alley if
     `W <= 144`, else a street.
   - **The classes** (e1): width over 72, 144, 288, 576; length over 144, 288, 576, 1152; height over 48, 128, 216,
     384; reflectivity over 0.04, 0.5, 0.8, as item 2 says. The size class comes from the length over 120, 240, 480
     and 1200 for the courtyard and the open courtyard, is the width class for the street and the alley, and is
     `(width + length) >> 1` for every other shape. Diffusion is always class 0.
   - **The pair**: `A` is the shape variable's default (room 102, duct 106, hall 110, tunnel 114, street and open
     street 118, alley 122, courtyard and open courtyard 126, open space and open wall 130), and `B` is `A + 1`. The
     "+ 2 if the diffusion class is above 1" is in the code and cannot happen.
   - **The copy**: B whole if the size class is above 1, else A: header, processors and every value not blended.
   - **The blend**, for the n-th processor of each type with n = 0 and 1, where the copy, A and B all have one:
     `from + (to - from) x class / divisor` in single precision, one rounding per step, with the factor applied twice
     where squared. `DFR` p0 to p3 on the size class. `RVA` feedback, gain, count, `fmod` and `rate` on the size
     class; size and min squared on the size class; w, d and h squared on the width, length and height classes; fw,
     fd and fh linear on the same classes. **The reverb's cutoff goes `B + (A - B) x reflectivity class / 4`.** `DLY`
     delay and the three taps are squared on the length class; feedback and gain are linear on the length class;
     **cutoff and width go `B + (A - B) x length class / 5`.** `FLT` p0 to p4 on the size class, and `AMP` and `MDY`
     as reading 1 says. fpar and ftap are copied, never blended.
   - **A value written negative in A or in B** is replaced by the measure. For a reverb's w, d and h it is the
     measure in feet, clamped to 6 to 500. For a delay's time and its taps 2 and 3 it is the length / 6 in ms,
     clamped to 14 to 500; for tap 1 it is the width / 6.
   - It returns the preset (header included), the shape's name and number, its variable, the classes, the pair, the
     template copied, the measures as checked and the case's key.
2. **Where the text and the model differ** (the order's item 2): a reflectivity of exactly 0.8 is class 3, as the
   model has it. The single 0.800000012 is compared as a double with the double 0.8. The W3-17a second read (row 20)
   found the same in the binary, so this point is settled (its note N1). A comment in `classesOf` says so. The 0.04
   and 0.5 thresholds give the same class either way; a check pins all three.
3. **The named cases**, `ROOM_CASES`: the order's 14 rows, in its order, with its keys, labels and measures. `open`
   has a `note`: the guess between two readings of R2 e4, as the order words it.
4. **`ROOM_PLACES`**: empty and frozen. A comment gives the form of a row: `{ key, label, map, spot, measures, shape }`,
   where `shape` is the name the engine printed, to check the build against. `buildAutomatic(key)` finds a place as it
   finds a case.
5. **The two measured cases**, in `ROOM_CASES` with `measured: true` and `set: 'Set C'` or `'Set D'`, and a `note` that
   says what the take fixes and that the measures in units are stand-ins.

## The 16 cases

Built by `buildAutomatic`; every number here is checked against the model, and those the order's tables name are
also checked as the order types them. "Classes": size, width, length, height, reflectivity (diffusion is 0
throughout). Lines: samples (feedback; gain); "pre": a predelay (`FLINEAR`, its factor; gain 4096).

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
boundary, as the order intends (a check names it as the one exception). The other reading of `open` (spans of 9600) is
an open space of size class 4, a copy of 131, also 5/250: checked against the model and against the order's words.

## The API as built (part b's additions)

All on `TF2Room`, beside part a's (its report, "The API as built").

| Call | What it does |
| --- | --- |
| `buildAutomatic(arg, { table })` | `arg` is the measures `{ sky, width, length, height, reflectivity, openSides }`, a row of `ROOM_CASES` or `ROOM_PLACES`, or a row's key. Returns `{ preset, shape, shapeNumber, variable, classes, pair, copy, measures, key }`: `preset` is `{ name, h, p }` in the table's form (values singles, each processor's values padded to 16, frozen); `shape` the name (`'room'` ... `'open courtyard'`); `classes` `{ size, width, length, height, reflectivity, diffusion }`; `pair` `[A, B]`; `copy` the template copied whole; `key` the row's key or null. `table` replaces the module's table (the tests use it for edited templates) |
| `ROOM_CASES` | frozen array of the 16 rows `{ key, label, measures, measured?, set?, note? }`, in the order's order: the 14 examples, then `set_c_room` and `set_d_street` (`measured: true`) |
| `ROOM_PLACES` | frozen, empty: the owner's places, one row each, the same form plus `map`, `spot` and the printed `shape` |
| `roomCase(key)` | the row of `ROOM_CASES` or `ROOM_PLACES` with that key, or null |
| `SHAPES` | the eleven shapes by number: `{ number, name, variable, base }` (the variable `adsp_*_min` and its default) |

Refused by name: a width, length or height that is not a whole number from 0 to 2^31 - 1; a reflectivity that is not
a number from 0 to 1; open sides that are not 0 to 4; a key no row has; a table without the pair's two templates.

## Readings of the order

Where the order or the reports could be read more than one way. Where the reports leave a detail open, the model's
`build_auto` was followed, as part a's item 2 says.

1. **`AMP` and `MDY` are blended as R2 e1 says; the model does not blend them.** R2 e1: "MDY p0..12 on length class;
   AMP p0..7, FLT p0..4, PTC, CRS, ENV, EFO, LFO on size class", and difference 12 says that everything not named as
   squared is linear. The model's `build_auto` blends `FLT` but not `AMP` or `MDY`. Its build was written before the
   model had those two processors (they came with the amplifier's read), so this reads as an omission, not a reading
   of the binary. The brief says to judge a difference by the report's sentences, so the module blends them, linearly,
   on those classes, for the first and second of each type. **No template of the table holds either type, so no output
   of the table, of a named case or of the reference can differ.** A check types R2 e1's formula for one edited pair.
   If the orchestrator prefers the model's reading, one line removes the two entries of `BLEND`, and that check goes
   with them.
2. **`PTC`, `CRS`, `ENV`, `EFO` and `LFO` are not blended.** R2 e1 names them, but it does not say which values, and
   the module builds none of these types: a preset holding one is refused by name when it is instanced. `FLT` is
   blended as R2 and the model have it, even though the module refuses an `FLT` instance (the edited filter pair
   checks the parameters only).
3. **The measures are checked.** Width, length and height must be whole numbers, 0 or more (R2 e1: ints); the
   reflectivity must be a number from 0 to 1 (R2 e4: a mean of values clamped to 0..1); open sides must be 0 to 4 (four
   level rays). `sky` is read as true or false. Bad measures throw with a message that names them.
4. **Width and length are taken as given.** The engine's measuring makes the width the smaller span (R2 e4), but
   `buildAutomatic` does not swap the two, and neither does the model. A width larger than the length is judged by the
   same rules (one probe).
5. **The shaft swap is for the shape test only** (R2 e2: "swapped for the test"; the model): the classes use the
   measures as given.
6. **Open sides count only under the sky** (R2 e2 counts them in the sky branch); indoors they are ignored (one
   probe).
7. **"All others" in the size class** includes the open space, the open wall and the open street, which take the mean
   of the width and length classes, while the street takes its width class. The open courtyard uses the courtyards'
   own length scale (R2 e1: "shapes 6 and 10"). A check pins the open street's mean against the alley's width class.
8. **The measure in place of a negative value**, as the model computes it: for feet, the single measure times the
   double 1/12; for ms, the measure times the double 1/6; then the clamp in double, then a single. R2 e1 gives only
   "inches/12" and "length/6". For every whole number from 0 to 200,000 this gives the same single as a division, and
   above that the 500 clamp holds, so no input can tell the two apart.
9. **"The first and the second processor of each type"**: the n-th processor of a type, n = 0 and 1, matched in the
   copy, A and B, and skipped if any of the three lacks it. A third processor of a type keeps the copy's values (an
   edited pair checks this against the model). This is why `room`'s diffusor is 103's own: 102 has none.
10. **The pair's numbers are the shape variables' defaults** (W3-15 section 4). The app has no `adsp_*_min`
    variables, so a soundscape cannot change them.
11. **Diffusion has no input.** The engine never measures it in this build (R2 e4, difference 10), so its class is 0
    and the "+ 2" can never apply. The rule is written in the code for the record; the order's break "the diffuse pair
    chosen" is made by always adding 2.
12. **The 0.8 threshold** (item 2) follows the model and the binary. "Flagged for the recording" is done by the
    comment and by this report. The second read closed the question, so no take is needed for it.
13. **No case sits on a threshold** is checked against the order's threshold lists (R2 e1's class thresholds; the
    courtyards' length scale only for the courtyard; reflectivities within 0.01; the shape rules' ratios `L = 4W`,
    `L = 2.5W`, `H = 3L`; widths 96 and 144), with `vent`'s width of 48 named as the order's own exception.
14. **`buildAutomatic` also takes a key or a row** (`'tunnel'`, `roomCase('tunnel')`), for part c's
    `{ auto: key or measures }`.
15. **The built preset has a `name`** (`'automatic tunnel'`), used only in error messages. The slot compares presets
    by `h` and `p`, so two builds from the same measures are equal presets, and setting one while the other plays
    starts no fade.
16. **The measured cases' recorded outputs** come from the order's text (item 5) and are typed into the test.
    `reference.out` and `tails.out` are part a's and stay unchanged. `auto.py` reruns the model on the two cases
    (`reference.py`'s `room_hash` and `tail`) and stops unless it gets the same five numbers each.
17. **The notes of the measured cases** are the order's words: for Set C, reflectivity class 3 fits best and 2 nearly
    as well; for Set D, class 1 is taken because the take does not fix it. The W3-17a second read, Part 2, leaves the
    same two classes open.

## What in the order or the reports was wrong, or could not be done

- Nothing was found wrong. The order's two tables, R2's two examples (their built lines and echo tables), the model
  and the build agree everywhere they meet.
- **Some rules cannot be seen with the table's own templates**, because each pair holds equal values there: the
  reverbs' modulation (130 and 131 both have `fmod` 10 and `rate` 2), the diffusors' size and gain, a delay's gain
  (126 and 127 both 1.2; 130 and 131 both 1), and the copied fpar and ftap. A break of any of these changes no case,
  probe or sweep. Edited template pairs whose values differ were added for each, judged against the model, and each
  such break is now caught.
- **T18 cannot be caught by any input**: "a tunnel from width 96" changes nothing, because a width-96 space long enough
  to be a tunnel (`L > 384`) is also longer than 2.5 widths, and the hall rule comes first.
- Not done, by the order: the measuring (R2 e3, e4), parts c and d. The browser suite was not run, since no page loads
  the module and nothing in part b's files touches the page.

## For part c's builder

- `{ auto: key or measures }` resolves with `TF2Room.buildAutomatic(x)`. Pass its `.preset` as `room` to
  `createRoomPath`. A build is cheap (microseconds) and gives the same preset every time; there is no need to cache it.
- `codecInfo.room` can take `shape`, `classes`, `pair`, `copy` and `key` straight from the result, with the shares
  from `TF2Room.shares(result.preset)`.
- Bad measures throw with a message that names them. The resolver can pass it on as it is.
- The accuracy rows take `{ auto: 'set_c_room' }` and `{ auto: 'set_d_street' }`. The golden cases `tunnel`,
  `great_hall` and `set_c_room` build from their keys.
- The order's private check of part c expects comb peaks from the fit on the played signal. The W3-17a second read
  (N2) says that a correct render gives the take's own values instead.

## For part d's builder

- The groups: `ROOM_CASES.filter((r) => r.measured)` for "Automatic room, as recorded" (label, `set`, `note`), and
  the rest for "examples by shape" (the help text from `measures`; `open` has a `note`). Then `ROOM_PLACES`, which is
  empty.
- The manual line ("tunnel; size class 2; from presets 114 and 115; 72/256 to the room") is `b.shape`,
  `b.classes.size`, `b.pair` and `TF2Room.shares(b.preset).room` for `b = buildAutomatic(measures)`.
- The six fields must give whole numbers (the page should round or refuse; the module throws on 200.5).
  Reflectivity runs from 0 to 1 and open sides from 0 to 4, and open sides count only under the sky. A reflectivity of
  exactly 0.8 is class 3 (reading 12).
- A place row needs only `{ key, label, map, spot, measures, shape }`; nothing else changes.

## The checks

`node tests/room-dsp.verify.mjs`; in `pnpm test`. Part a's 127 checks are unchanged and pass. Part b's 63, by section
(`ROOM_ONLY=automatic` runs only these):

- **Shapes and classes** (17): `ROOM_CASES` is the order's 16 rows (keys, labels, measures) with the two measured ones
  marked; `ROOM_PLACES` is empty. The 14 examples' shape, classes, pair, copy and shares match the order's table, and
  the two measured cases match item 5 (size class 2 and reflectivity class 3; size, width and length class 3). The
  16 cases match the model. No case sits on a threshold. Seven groups of probes test every threshold of R2 e1 and e2
  (width 72, 144, 288, 576; length 144, 288, 576, 1152; height 48, 128, 216, 384; the courtyards' 120, 240, 480, 1200;
  reflectivity 0.04, 0.5, 0.8 on, one single under and over, and doubles 1e-9 either side; `L > 4W`, `L > 2.5W`,
  widths 48, 96, 144; the shaft swap; 0 to 4 open sides; open sides indoors). Each probe is judged against the model
  in shape, classes, pair, copy, shares, header and parameters, and every probe is used. Further checks: the
  reflectivity classes as R2 e1 and the second read give them (0.8 is 3, the single under it 2); the size class's
  three rules on four measures; the other reading of `open`.
- **The build** (36): the 16 cases' header and parameters are the model's, value for value as singles (and the 14
  examples are also `lines.json`'s); their `describe()` gives the model's built integers; 16 checks of the order's
  built numbers, typed in row by row; R2's two echo tables, the small room (`closet`) and the tunnel, through the
  build; 13 edited template pairs (the model's parameters and built integers); the order's synthetic pair (width
  6.6666665, depth 33.333332, `reference.out`'s printed reverb and its hash); 240 swept measures covering all eleven
  shapes; `AMP` and `MDY` by R2 e1's formula (reading 1).
- **Outputs** (6): the 14 examples built here give `reference.out`'s shares and hashes; the two measured cases give the
  order's hashes, and the model gives the same (`auto.json`); the 14 examples give 56 tail lengths, and the great hall
  after the long square gives 173162 (`tails.out`); the two measured cases give the order's four tail lengths.
- **The API** (4): a key, a row or the measures give the same build; bad measures are refused by name; the built preset
  is frozen, in the table's form, made of singles, and runs in a room path (direct plus its output, shares 72/183) and
  in a slot; `SHAPES` lists the variables and defaults of W3-15 section 4.

## Breaks

Each mutation was made in a scratch copy of `room-dsp.js`, with the suite run on it
(`TF2_DIR=<copy> ROOM_ONLY=automatic node tests/room-dsp.verify.mjs`: only part b's sections call `buildAutomatic`).
Fifteen of them (all of the order's rows, B6, T11 and T18) were also run against the whole suite: the same checks
failed, and no check of part a failed. "Checks failed" counts part b's checks that failed. "From": the order's list of
mutations for part b, or the builder's own. The runner and the logs are in the builder's scratch folder, not in the
repository.

| # | From | Mutation | Checks failed | Caught by (the most pointed first) |
| --- | --- | --- | --- | --- |
| O1a | order | the reverb's cutoff blended from the bright end (A + (B - A) x class / 4) | 33 | "the order's numbers, closet: lines 1323 (3194; 1983), 2425 (2597; 2252) ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; "the order's numbers, vent: lines 444 (3727; 1472), 3619 (1898; 4096); cutoff ..."; and 30 more |
| O1b | order | a delay's cutoff and width blended from the bright end | 12 | "the order's numbers, courtyard: one echo, 5144 samples (116.67 ms, the length ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, a courtyard: the delay -1 in A only (B 50 ms); the measure ..."; and 9 more |
| O2 | order | the copy taken from A at size class 2 (B only above 2) | 22 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; and 19 more |
| O3a | order | a squared parameter made linear: the reverb's size | 23 | "the order's numbers, small_room: 3 lines 1358 (3350; 1350), 2152 (2979 ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; "the order's numbers, large_room: 3 all-passes; 6 lines 1640 to 5300 (3661 to ..."; and 20 more |
| O3b | order | a squared parameter made linear: the reverb's min | 25 | "the order's numbers, small_room: 3 lines 1358 (3350; 1350), 2152 (2979 ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; "the order's numbers, large_room: 3 all-passes; 6 lines 1640 to 5300 (3661 to ..."; and 22 more |
| O3c | order | a squared parameter made linear: the reverb's width, depth and height | 22 | "the order's numbers, corridor: predelay 2072 (factor 2703), 617 (1228; 2676) ..."; "the order's numbers, long_corridor: predelay 5733 (1720) and 5 lines 926 ..."; "the order's numbers, tunnel: R2's example 3: 2 all-passes (573, 837; 610) ..."; and 19 more |
| O3d | order | a squared parameter made linear: a delay's time and taps | 6 | "edited templates, a courtyard: delays and taps positive in both, blended ..."; "edited templates, open space: three delays in each template (only the first ..."; "edited templates, open space: the reverbs' modulation differing (fmod 10 and ..."; and 3 more |
| O3e | order | the reverse: the reverb's feedback and gain squared | 30 | "the order's numbers, small_room: 3 lines 1358 (3350; 1350), 2152 (2979 ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; "the order's numbers, large_room: 3 all-passes; 6 lines 1640 to 5300 (3661 to ..."; and 27 more |
| O3f | order | the reverse: the reverb's factors fw, fd, fh squared | 24 | "the order's numbers, corridor: predelay 2072 (factor 2703), 617 (1228; 2676) ..."; "the order's numbers, long_corridor: predelay 5733 (1720) and 5 lines 926 ..."; "the order's numbers, tunnel: R2's example 3: 2 all-passes (573, 837; 610) ..."; and 21 more |
| O3g | order | the reverse: the diffusor squared | 13 | "the order's numbers, tunnel: R2's example 3: 2 all-passes (573, 837; 610) ..."; "the order's numbers, big_tunnel: 2 all-passes (feedback 611), predelay 5909 ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; and 10 more |
| O3h | order | the reverse: a delay's feedback and gain squared | 14 | "the order's numbers, courtyard: one echo, 5144 samples (116.67 ms, the length ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, a courtyard: the delay -1 in B only (A 50 ms), large: the ..."; and 11 more |
| O4 | order | the size class of a street (and alley) taken from the mean | 5 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the size class: an alley 120 x 600 is 1 (its width class), an open street of ..."; "240 seeded random measures over every shape: the model's shape, classes ..."; and 2 more |
| O5 | order | the diffuse pair chosen (base + 2) | 56 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "the order's numbers, closet: lines 1323 (3194; 1983), 2425 (2597; 2252) ..."; and 53 more |
| O6 | order | the measured delay as length / 12 | 10 | "the order's numbers, courtyard: one echo, 5144 samples (116.67 ms, the length ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, a courtyard: the delay -1 in B only (A 50 ms), large: the ..."; and 7 more |
| O7a | order | a negative template dimension interpolated (the reverb's measures not used) | 4 | "edited templates, negative width and depth in templates (reference.py: 110 ..."; "edited templates, a hall: width -1 in A only, depth -1 in B only, height -1 ..."; "edited templates, a hall: every dimension -1 in both, mid-sized: the model's ..."; and 1 more |
| T1 | own | the width class at 72 tested as >= (72 is class 1) | 1 | "the width class at 72, 144, 288 and 576 (indoors, and under the sky where the ..." |
| T2 | own | the width class at 288 tested as >= | 1 | "the width class at 72, 144, 288 and 576 (indoors, and under the sky where the ..." |
| T3 | own | the length class at 1152 tested as >= | 2 | "the width class at 72, 144, 288 and 576 (indoors, and under the sky where the ..."; "the length class at 144, 288, 576 and 1152: the model's shape, classes, pair ..." |
| T4 | own | the length class at 144 one unit high (> 145) | 1 | "the length class at 144, 288, 576 and 1152: the model's shape, classes, pair ..." |
| T5 | own | the height class at 48 tested as >= | 1 | "the height class at 48, 128, 216 and 384: the model's shape, classes, pair ..." |
| T6 | own | the height class at 216 one unit low (> 215) | 1 | "the height class at 48, 128, 216 and 384: the model's shape, classes, pair ..." |
| T7 | own | the courtyards' size class at 240 tested as >= | 1 | "the courtyards' size class at lengths 120, 240, 480 and 1200 (courtyard and ..." |
| T8 | own | the courtyards' size class from the ordinary length scale | 4 | "the size class: an alley 120 x 600 is 1 (its width class), an open street of ..."; "240 seeded random measures over every shape: the model's shape, classes ..."; "the courtyards' size class at lengths 120, 240, 480 and 1200 (courtyard and ..."; and 1 more |
| T9 | own | the reflectivity at 0.5 tested as < (0.5 is class 2) | 2 | "reflectivity classes: 0.04 is 0 and the next single 1; 0.5 is 1 and the next ..."; "the reflectivity class at 0.04, 0.5 and 0.8 (the single on it, one single ..." |
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
| T20 | own | the courtyard's test the wrong way round (W <= 2.5L) | 16 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "the order's numbers, alley: predelays 5997 (1130) and 3087 (901), line 2205 ..."; and 13 more |
| T21 | own | an alley to width 143 (W < 144) | 2 | "the width class at 72, 144, 288 and 576 (indoors, and under the sky where the ..."; "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..." |
| T22 | own | the shaft swap at exactly 3 lengths (H >= 3L) | 2 | "240 seeded random measures over every shape: the model's shape, classes ..."; "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..." |
| T23 | own | the shaft swap missing | 2 | "240 seeded random measures over every shape: the model's shape, classes ..."; "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..." |
| T24 | own | the shaft test the wrong way round (L > 3H) | 21 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the order's numbers, vent: lines 444 (3727; 1472), 3619 (1898; 4096); cutoff ..."; "the order's numbers, corridor: predelay 2072 (factor 2703), 617 (1228; 2676) ..."; and 18 more |
| T25 | own | open sides counted indoors too | 2 | "240 seeded random measures over every shape: the model's shape, classes ..."; "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..." |
| T26 | own | open sides n giving shape 7 + n (the order reversed) | 15 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the order's numbers, open: all-pass 13230, 3 all-passes, delay 7937, 6 ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; and 12 more |
| T27 | own | the size class from the mean rounded up | 28 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "the order's numbers, closet: lines 1323 (3194; 1983), 2425 (2597; 2252) ..."; and 25 more |
| B1 | own | every blend from the wrong template (B toward A, the cutoffs A toward B) | 48 | "the order's numbers, closet: lines 1323 (3194; 1983), 2425 (2597; 2252) ..."; "the order's numbers, small_room: 3 lines 1358 (3350; 1350), 2152 (2979 ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; and 45 more |
| B2 | own | the copy from the wrong template (A above size class 1, B below) | 26 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; and 23 more |
| B3 | own | the class divisor 4 where it is 5 | 44 | "the order's numbers, small_room: 3 lines 1358 (3350; 1350), 2152 (2979 ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; "the order's numbers, large_room: 3 all-passes; 6 lines 1640 to 5300 (3661 to ..."; and 41 more |
| B4 | own | the reverb cutoff's divisor 5 where it is 4 | 34 | "the order's numbers, closet: lines 1323 (3194; 1983), 2425 (2597; 2252) ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; "the order's numbers, vent: lines 444 (3727; 1472), 3619 (1898; 4096); cutoff ..."; and 31 more |
| B5 | own | the delay cutoff's divisor 4 where it is 5 | 11 | "the order's numbers, courtyard: one echo, 5144 samples (116.67 ms, the length ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, a courtyard: the delay -1 in B only (A 50 ms), large: the ..."; and 8 more |
| B6 | own | the measure not replacing a negative value (any template) | 15 | "the order's numbers, courtyard: one echo, 5144 samples (116.67 ms, the length ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, negative width and depth in templates (reference.py: 110 ..."; and 12 more |
| B7 | own | the measure only when both templates are negative | 5 | "edited templates, negative width and depth in templates (reference.py: 110 ..."; "edited templates, a hall: width -1 in A only, depth -1 in B only, height -1 ..."; "edited templates, a courtyard: the delay -1 in A only (B 50 ms); the measure ..."; and 2 more |
| B8 | own | the blend in double precision (no single rounding) | 12 | "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, a hall: width -1 in A only, depth -1 in B only, height -1 ..."; "edited templates, a hall: every dimension -1 in both, mid-sized: the model's ..."; and 9 more |
| B9 | own | squared as (to - from) x (t x t) (the factor squared first) | 11 | "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, open space: three delays in each template (only the first ..."; "edited templates, open space: the reverbs' modulation differing (fmod 10 and ..."; and 8 more |
| B10 | own | the third processor of a type blended too | 2 | "edited templates, open space: three delays in each template (only the first ..."; "an amplifier blended on the size class and a modulating delay on the length ..." |
| B11 | own | only the first processor of a type blended | 7 | "edited templates, open space: three delays in each template (only the first ..."; "edited templates, a room: two reverbs in each template (both blended): the ..."; "edited templates, open space: the reverbs' modulation differing (fmod 10 and ..."; and 4 more |
| B12 | own | the blend skipped only when the copy lacks the processor (a missing A or B read as zeros) | 19 | "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; "the order's numbers, large_room: 3 all-passes; 6 lines 1640 to 5300 (3661 to ..."; "the order's numbers, great_hall: 3 all-passes; 8 lines 1887 to 7267 (3817 to ..."; and 16 more |
| B13 | own | a delay's first tap measured from the length (not the width) | 5 | "the 16 cases: the built header and parameters are the model's, value for ..."; "edited templates, a courtyard: the delay -1 in B only (A 50 ms), large: the ..."; "240 seeded random measures over every shape: the model's shape, classes ..."; and 2 more |
| B14 | own | the reverb's width measured from the length | 4 | "edited templates, negative width and depth in templates (reference.py: 110 ..."; "edited templates, a hall: width -1 in A only, depth -1 in B only, height -1 ..."; "edited templates, a hall: every dimension -1 in both, mid-sized: the model's ..."; and 1 more |
| B15 | own | the feet without the clamp at 6 | 1 | "edited templates, a hall: width -1 in A only, depth -1 in B only, height -1 ..." |
| B16 | own | the feet without the clamp at 500 | 1 | "edited templates, a hall: width -1 in A only, depth -1 in B only, height -1 ..." |
| B17 | own | a delay's measure without the 14 ms floor | 3 | "edited templates, a courtyard: the delay -1 in A only (B 50 ms); the measure ..."; "240 seeded random measures over every shape: the model's shape, classes ..."; "the courtyards' size class at lengths 120, 240, 480 and 1200 (courtyard and ..." |
| B18 | own | a delay's measure without the 500 ms cap | 2 | "edited templates, a courtyard: the measures past 500 ms (the clamp): the ..."; "240 seeded random measures over every shape: the model's shape, classes ..." |
| B19 | own | the reverb's width blended on the length class | 14 | "the order's numbers, long_corridor: predelay 5733 (1720) and 5 lines 926 ..."; "the order's numbers, tunnel: R2's example 3: 2 all-passes (573, 837; 610) ..."; "the order's numbers, street: predelays 17287 (524) and 5292 (901), line 2998 ..."; and 11 more |
| B20 | own | the reverb's fd blended on the width class | 21 | "the order's numbers, corridor: predelay 2072 (factor 2703), 617 (1228; 2676) ..."; "the order's numbers, long_corridor: predelay 5733 (1720) and 5 lines 926 ..."; "the order's numbers, tunnel: R2's example 3: 2 all-passes (573, 837; 610) ..."; and 18 more |
| B21 | own | the diffusor blended on the length class | 11 | "the order's numbers, tunnel: R2's example 3: 2 all-passes (573, 837; 610) ..."; "the order's numbers, big_tunnel: 2 all-passes (feedback 611), predelay 5909 ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; and 8 more |
| B22 | own | the reverb's modulation (fmod, rate) not blended | 1 | "edited templates, open space: the reverbs' modulation differing (fmod 10 and ..." |
| B23 | own | the reverb's count not blended | 27 | "the order's numbers, small_room: 3 lines 1358 (3350; 1350), 2152 (2979 ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; "the order's numbers, large_room: 3 all-passes; 6 lines 1640 to 5300 (3661 to ..."; and 24 more |
| B24 | own | the amplifier blended on the length class | 1 | "an amplifier blended on the size class and a modulating delay on the length ..." |
| B25 | own | the modulating delay not blended (the model's build) | 1 | "an amplifier blended on the size class and a modulating delay on the length ..." |
| B26 | own | the header from A always | 16 | "the 14 examples: shape, classes (reflectivity class 1, diffusion 0), pair ..."; "the two measured cases: set_c_room a room of size class 2 and reflectivity ..."; "the 16 cases: the built header and parameters are the model's, value for ..."; and 13 more |
| B27 | own | the pair of an open wall taken as the open street's (118) | 3 | "240 seeded random measures over every shape: the model's shape, classes ..."; "the shape rules: length over 4 and 2.5 widths, widths 48, 96 and 144, the ..."; "SHAPES: the eleven shapes, their variables and the defaults of W3-15 section 4" |
| B28 | own | the diffusor's size and gain not blended | 1 | "edited templates, a tunnel: the diffusors' size and gain differing: the ..." |
| B29 | own | a delay's gain not blended | 1 | "edited templates, a courtyard: delays and taps positive in both, blended ..." |
| B30 | own | the reverb's filter flag and tap factor blended (on the size class) | 1 | "edited templates, a small room: the filter flag and the tap factor differing ..." |
| B31 | own | a filter (FLT) not blended | 1 | "edited templates, a room: a filter in each template (FLT on the size class ..." |
| B32 | own | the reverb's cutoff blended on the size class (not the reflectivity class) | 28 | "the order's numbers, closet: lines 1323 (3194; 1983), 2425 (2597; 2252) ..."; "the order's numbers, room: 3 all-passes; 5 lines 1464 to 3977 (3506 to 2684 ..."; "the order's numbers, street: predelays 17287 (524) and 5292 (901), line 2998 ..."; and 25 more |

The order's seven rows are O1 (the cutoff from the bright end, as the reverb's and as the delay's), O2 (the copy from A
at size class 2), O3 (a squared parameter made linear, a to d, and the reverse, e to h), O4 (the street's size class
from the mean), O5 (the diffuse pair chosen), O6 (the measured delay as length / 12) and O7 (a negative template
dimension interpolated). The brief's own list: a threshold off by one unit or the wrong way round (T1 to T27), linear
where the engine squares (O3a to O3d), the blend from the wrong template (B1, B2), a class divisor of 4 where it is 5
(B3; and the reverse, B4, B5), the measure not replacing a negative value (B6, B7), the diffuse pair (O5),
reflectivity 0.8 as class 2 (T11).

**The one that nothing catches, and why none can:** T18 ("a tunnel from width 96") is the same build for every input.
At width 96 the tunnel rule needs `L > 384`, and every such space has already been named a hall by the rule before it
(`L > 240` and `48 < W <= 96`).

B25 ("the modulating delay not blended") is the model's own build. It is caught only by the check typed from R2 e1
(reading 1).
