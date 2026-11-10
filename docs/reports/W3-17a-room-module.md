# W3-17a: the room module

Builder's report. The order: `docs/work-orders/W3-17-room-effects.md`, part a. Branch `claude/w3-17a-room-module`,
from `main` at `59d2f64`. New files only, and one addition to the `test` line of `package.json`.

## Summary

- `room-dsp.js` (a classic script, `TF2Room`) builds the engine's room effects as the second reads give them:
  the processors `DLY`, `DFR`, `RVA` (plain and from three dimensions, random taps), `AMP` and `MDY`; a preset as
  a plain chain; the slot and its cross-fade; the voice's shares and entry; the room path (room slot, then the
  water instance) and the tail's end. `room-presets.js` wraps the converter's table byte for byte.
- **The fix round** (after the review and the second read, `docs/reports/W3-17a-second-read.md`, which supersedes
  the order where they differ): the slot's cross-fade, the order inside a block, the four mix values on a take of
  "none", the water and the draw order in a fade are now the engine's (F1 to F5), each with a check typed from that
  report; plus the review's findings 1, 2, 3 and 9. **No hash of `reference.out` and no length of `tails.out`
  moved**: a fixed room and a path made under water are untouched, as the second read said.
- **The module met every recorded output of the reference on its first full run**: all 85 hashes of
  `reference.out` (the 44 presets, the 14 named cases fed the model's built parameters, the 6 speech cases, the
  16 synthetic cases and the 5 path and water cases) and all 239 tail lengths of `tails.out`. It also meets
  R2's five echo tables (preset 6, the small room, the tunnel, 102 and 114 as written) and the order's two through
  `entry`, R2's and W3-15's pinned lines, AM 2's and AM 3's pinned numbers and AM 5's fourteen hashes. No
  difference from the reference had to be settled, and nothing in the reports was found wrong.
- `tests/room-dsp.verify.mjs` has __N__ checks and is in `pnpm test`. It adds __T__ on this machine (the
  order's limit is 30 s). __RUNS__ Every expected value comes from the reference's recorded outputs, the order or the
  reports (the second read included), or `tests/roomdsp/lines.json`, which `lines.py` reads out of the model's own
  instances.
- **Breaks**: in the first build 60 mutations, each made in a scratch copy and run against the whole suite: the
  order's 21 rows as 30 mutations (several rows name two) and 30 of the builder's own; in the fix round 23 more
  (section "Breaks of the fix round"). Of the first 60, all are caught but four, and none of those four can change
  an output (section "Breaks"); four that at first only a recorded hash caught (quality inside a delay, the water
  started fresh, the tail ended on a level, the room added after the water) were given a pointed check each. Of
  the fix round's 23, all are caught by a pointed check.
- Speed, loaded with `require` under Node 22.23.4: the heaviest presets (10 and 25) run at 104 to 136 ns a sample
  depending on the machine's load, 7.3 to 9.6 M samples a second, 166 to 219 times real time; the order's
  comparison case (three all-passes, twelve lines) at 113 ns (the plan's prototype: 97 ns).

## Files

| File | What |
| --- | --- |
| `room-presets.js` | the canonical JSON of `tests/roomdsp/room-presets.json`, verbatim on one line, in an IIFE: `module.exports` under Node, `TF2_ROOM_PRESETS` elsewhere; deep-frozen. Header: generated, from what (46,419 bytes, CRC-32 2441946680), not edited by hand |
| `room-dsp.js` | the module, `TF2Room` (API below) |
| `tests/room-dsp.verify.mjs` | the checks; `TF2_DIR=<folder>` runs them on a copy of the two files (for breaks); `ROOM_ONLY=<word>` runs the sections whose name holds the word |
| `tests/roomdsp/lines.py` | the builder's script: reads the model's instances and the reference's own functions into `lines.json` (`python3 -I tests/roomdsp/lines.py`, about 12 s; the same bytes on a rerun) |
| `tests/roomdsp/lines.json` | its output: built integers of every preset, synthetic, named, clamped and extra case; the model's draws; its ramps call by call; the reference's `entry` where it differs from exact division; the model's shares |
| `tests/roomdsp/coefs.mjs` | recomputes the 25 pinned filter coefficients with Node's `Math.tan` and compares them with the module's table and the order's list (`node tests/roomdsp/coefs.mjs`) |
| `package.json` | `&& node tests/room-dsp.verify.mjs` at the end of `test` |

`dspmodel.py`, `reference.py`, `convert.py`, `room-presets.json`, `reference.out` and `tails.out` are unchanged.

## What was built, item by item

1. **The table** (`room-presets.js`): wrapped as the order says. The test reads the one line that starts with
   `{"0":`, checks its SHA-256 (`0586a404...`) and that it equals `room-presets.json` byte for byte, and checks
   that the exported object is exactly that JSON.
2. **The form** (`room-dsp.js`): an IIFE that sets `module.exports` under Node and `TF2Room` elsewhere; no
   imports, no `require`. Sample arithmetic: `Math.imul`, `| 0`, `>> 12`. Builders: `Math.fround` per single
   operation, in the reads' order; doubles where the reads say double.
3. **The filter section**: the coefficients of the 25 cutoffs are a table (`PINNED_LP`); any other cutoff, and
   the high-pass first section a delay gets from a width over 0, are computed with `Math.tan` and the processor's
   description gets `notPinned: [...]`. `coefs.mjs` agrees with the table and the order; the smallest distance of
   any value from an integer boundary is 0.0057, as the review found.
4. **The delay**: kinds 0, 1, 2, 4 per sample as R2 b; buffer of `D + 1`; feedback capped at 4095; the exact gain
   cut (preset 17's first line is 381); the loop filter's `b0`, `b1` times `a / 4096`; FLINEAR with feedback 0 and
   gain 4096 whatever was asked; only the filter's first section, so quality does nothing; kinds 3, 5, 6 refused.
5. **The diffusor**: `trunc(size x T[i]) x 44100 / 1000` in integers; `a = trunc(min(fb x 4096, 4091.9))`; gain 0
   means 1; stages of kind 1.
6. **The reverb**: the plain variant (reciprocal multiplied, two truncations, `powf` feedbacks, gain by the
   reciprocal) and the variant from three dimensions (count forced to a multiple of 3, sizes and factors sorted
   together with strict comparisons, feedbacks from the truncated sizes, the push-apart term computed once,
   gain by a division, the predelay as FLINEAR at gain 4096, later rounds quartered with floor 7 ms, the extra
   term, `total x 44100 / 1000`); two output sections when the filter is not in the loop; random taps: a draw
   every `period + 1` samples per line in line order, depth, period and glide from the line's own length, the
   12.20 cross-fade. A tap factor (the four-tap kinds) is refused.
7. **A preset instance**: the processors in the file's order, nothing after; each value clamped by its type's
   range table first (R2 0, AM 0; MDY by its own), 0 never clamped; `describe()` gives the built integers.
8. **`AMP` and `MDY`**: as AM 2 and AM 3, whole. The ramp is AM 1's, with the x86 conversion rule (`cvtt`), and
   serves every ramp of the module: a reverb line's, `MDY`'s fade, `AMP`'s glide and the slots' cross-fades.
9. **The slot**: as item 9 of the order, with what the second read found in the engine's code (F1, F2, F5): at
   each 512-sample block of its own count, the update (a waiting request is taken only once the ramp has reported
   done), then the shares, then the slot stage (a finished fade's old instance dropped, "before" cleared). In a
   fade the new instance runs first, the ramp is stepped and then used, the call that reports done repeats 4095,
   and the weight stays 4095, both instances running, to the end of that block. The order's two assumed constants
   are gone: the second read settled both.
10. **Shares and entry**: `shares(header)` and `entry(s, share)` stand alone.
11. **The room path**: `createRoomPath`, below. The water is one instance of preset 14 for the path's life, run on
    the whole sum block by block or not run at all, with no fade (F4).

## The API as built (for parts b, c and d)

All on `TF2Room`. A *preset* is a number of the table, or an object of the table's form
`{ h: [mix min, mix max, duration, fade, dB min, mixdrop], p: [[type, [values]], ...] }` (values padded with 0 to
16). A *draw* is a function `(lo, hi) -> integer in [lo, hi]`.

| Call | What it does |
| --- | --- |
| `setTable(table)` | the table numbers are looked up in. Without it the module reads the global `TF2_ROOM_PRESETS` at call time (a page or worker that loaded `room-presets.js` first). Under Node, or with the module `require`d outside a vm sandbox, call `setTable(require('./room-presets.js'))` or pass `table` to the calls below: the module's global is Node's, not the sandbox's |
| `presetOf(n)` | the table's preset `n`, or `null` if the table does not hold it |
| `entry(s, share)` | the voice's 16-bit sample entered at a share of 256: `trunc(fround(s x 255 x share / 256) / 256)` |
| `shares(header)` | `{ room, direct }` of 256 for a voice: `header` is a preset, its 6-value `h`, or `[mix min, mix max, dB min, mixdrop]` |
| `createInstance(preset, draw)` | a fresh instance, lines silent: `next(x)`, `process(input, output?)` (Int32Arrays), `describe()` |
| `createSlot({ fade, preset, seed or draw, table, preroll })` | a slot (fade in seconds, default 0.2): `set(preset or null)` returns false for a number the table does not hold; `process(input, output?)`; `active()`; `state()`; `describe()`. Made with a preset: settled (its ramp done), lines silent; `preroll` runs that instance on so many zeros first. A request equal to the preset now (the same number, or a preset object of equal value) is no change |
| `createRoomPath({ seed, room, water, roomDraw, waterDraw, waterPreset, table })` | the path. `room` (a preset or null) is what the room slot is made with (no fade at the start); `water` (boolean): under water from the first sample, its water instance having run 44,100 samples of silence. A number the table does not hold gives no room. `seed` is the render's: the room slot draws from `mulberry32((seed ^ 0x524F4F4D) >>> 0)`, the water instance from `mulberry32((seed ^ 0x57415452) >>> 0)`; `roomDraw` and `waterDraw` replace them (the tests use them to meet the reference's streams). `waterPreset` is `dsp_water`'s place (14 by default; a test uses the amplifier of 14 alone to read its gain). The path always holds the room slot and the water instance: make none for "no room, not under water" |
| `path.setRoom(preset or null)` | a request, taken at the room slot's update of a block once its ramp has reported done, with the 0.2 s fade. The four mix values become the taken preset's header's ("none": preset 0's, 0.2, 0.7, 80, 0.5) |
| `path.setWater(on)` | from the next block's start, at once: the water instance runs on the whole sum, or is not run (it keeps its state). No fade, no fresh instance. A path made dry has a fresh water instance, so its first dive has the amplifier's 100 ms at full gain; a path made under water does not |
| `path.spurtStart()` | a voice channel starts: its two limits are fixed from the four mix values as the block of the next sample has them (after that block's update) |
| `path.shares()` | `{ room, direct }` for the block of the next sample, as the mixer tests it after the block's update and before its slot stage: 0 and 256 while the room slot holds no preset now and held none before; else from the limits (fixed now if no spurt has started). Asked at a block's start it runs that block's update, so a request asked earlier is taken first |
| `path.process(direct, room, out?)` | two Int32Arrays at 44100 Hz, already entered (and upsampled); returns `direct + room slot(room)`, then the water instance on the wet blocks: the sum before the clip. `out` may be either input |
| `path.tailLeft()` | `{ ended, at, length }` after the last `process`: Decision 8's rule over the output. A sample is made with no voice when both its inputs are 0; a voice sample starts the count over. `ended`: the rule held (or 882,000 such samples passed) since the last voice sample; `at`: the index in the last block of the output's last sample if it ended in that block, else -1; `length`: the tail's length in samples (or the count so far) |
| `path.state()` | the room slot's preset now, before and asked for, whether fading, whether its ramp is done; the water's `on` and `asked`; the mix values; the limits; the count |
| constants | `BLOCK` 512 (the mixer's paint block, W3-07), `ROOM_FADE` 0.2, `WATER_PRESET` 14, `WATER_PREROLL` 44100, `TAIL_BAND` 32, `TAIL_WINDOW` 22050, `TAIL_CAP` 882000, `ROOM_SEED_XOR`, `WATER_SEED_XOR`, `MIX_START`, `RANGES`, `PINNED_LP` |
| also | `Ramp` (AM 1's ramp, as a class), `clampParams`, `filterCoefs`, `computeCoefs`, `mulberry32`, `seededDraw`, `checkPreset` |

What is refused, by an error naming it, when a preset is built: `FLT` and the processor types `CRS`, `PTC`, `ENV`,
`LFO`, `EFO`; the delay kinds `DLINEAR`, `LOWPASS_4TAP`, `PLAIN_4TAP` (in `DLY` and in `MDY`); a reverb's tap
factor; a one-shot duration; a header's own fade time; more than five processors.

## Readings of the order

Where the order or the reports could be read more than one way. Where the reports left a detail open, the model
(`dspmodel.py`) was followed, as item 2 of the order says.

1. **The order of draws between processors.** The module runs a preset sample by sample through its chain, so in
   each sample the processors draw in chain order and a reverb's lines in line order. This is the model's order,
   and the reference hashes depend on it (preset 16 has two drawing processors). The engine runs each processor
   over a whole 512-sample block (W3-15 section 2), so it would group a block's draws by processor; AM 6 says
   this changes only the order of draws, and the engine's stream cannot be reproduced anyway. Sample by sample is
   also what makes the output independent of the caller's block sizes.
2. **During a fade the new instance runs and draws first** in each sample, then the old (corrected in the fix
   round: the order's item 9 said the old; the second read, row 7 and F5, read the new one called first). Read per
   sample for the same reason as reading 1. A check builds the expected fade from two instances stepped by hand.
3. **When the four mix values change.** Item 11 says "setting a room preset overwrites the path's four mix values
   from its header (R2 d)". R2 d puts the overwrite in the routine that sets a preset on a slot, which runs when
   the slot takes the change (at its next block, after any fade). So the values change when the room slot takes
   the preset, not when `setRoom` is called; a spurt that starts in between keeps the old values (a check pins
   this; the second read, row 8, confirmed it). **Corrected in the fix round:** taking "none" overwrites them too,
   with preset 0's header (0.2, 0.7, 80, 0.5): preset 0 has an instance and a header like any other (row 9, F3).
   And the update comes first in a block, so a spurt or a `shares()` at a block's start sees that block's take.
4. **When the limits are fixed.** At `spurtStart()`, as item 11 says. If `shares()` is asked before any spurt has
   started, the limits are fixed then, as the engine fixes them at the channel's first spatialisation (R2 f).
5. **"The latest request wins".** `set` keeps one request; a later `set` replaces it. A number the table does not
   hold leaves the slot as it is and also drops an earlier request not yet taken, as the engine's variable then
   holds the unknown number and the slot keeps what it had (Decision 11). A request equal to the preset now (the
   same number, or the same preset object) changes nothing. A slot or path *made* with an unknown number has no
   room.
6. **0 and 1.** `set(0)` and `set(null)` are "none" (preset 0 is the untouched buffer). `set(1)` is the table's
   preset 1, a `NULL` processor that passes its input, with its header's shares (26/229): the module does not
   know that `dsp_room 1` means the automatic slot. Part c's resolver maps `{ preset: 1 }` to no room (part c,
   item 2).
7. **"Made with" means no fade.** `createRoomPath({ room })` starts settled, as "a slot made with a preset starts
   with the fade over" and part c's "no fade at the start of a render" ask (the second read, row 18, confirmed
   it); `setRoom` after that goes through the slot's rule. **Corrected in the fix round:** the water has no fade
   at all. `water: true` and `setWater` switch the water instance on or off at a block start (F4).
8. **The water instance's 44,100 samples of silence** (a path made under water) run before the path's first
   sample, drawing from the water stream; the path's block count starts at its first sample. **Corrected in the fix
   round:** the instance is made once per path, made dry or wet, and is never restarted: in the engine it is made
   with the slots, at start and after each level load, and a dive only lets the mixer run it (row 11). So a path
   made dry stands for "not under water since the level loaded": its first dive has the amplifier's 100 ms at full
   gain and its 80 ms glide, and later dives do not. A path made under water stands for "has been under water
   before".
9. **"Made with no voice"** (Decision 8) is read as: both of the path's inputs are 0 on that sample. The reference
   counts from the end of the input; on every reference input the last sample's two entries are non-zero, so the
   two agree (and they do, on all 239 lengths). A run of zero inputs inside a voice can end the output by the rule
   only if it lasts 22,050 samples and the output rests; a later voice sample starts it over.
10. **A negative factor without a loop filter** (item 6). The order: "with no filter in the loop a negative
    factor's line is a plain comb with the factor's size (R2 a3: no predelay)". Read with R2 a2 and the model: in
    the first round the line keeps the whole size and `|factor|`; in later rounds the size is still quartered
    (floor 7 ms), with or without a loop filter, because the quartering is in the delays' build (a2), not in the
    lines' (a3). The synthetic "3-D, negative factor, no filter" (six lines, so a later round) confirms it, and a
    break that quarters only with a loop filter is caught by that hash.
11. **The ramp.** AM 1's ramp, with the x86 conversion rule, everywhere. The model's reverb lines use its older
    `Ramp` class, which differs from AM 1 only for a ramp of 0, 1 or 2 samples (a line whose length times `rate`
    is under 6 samples); no preset or case reaches it. The order (item 6: "a ramp of zero length is done at once,
    at weight 0") asks for AM 1's. The model's `LinRamp` (AM 1's) is checked call by call for 0 to 3 samples.
    The ramp's "over 4095" rule itself can never change an output: any step over 4095 makes a 12.20 value over
    2^31 with or without it, so the conversion gives -2^31 and the ramp is done at once either way (the review's
    mutation M31).
12. **Clamping RVA, DLY and DFR.** The model clamps only `AMP` and `MDY`; the order asks for every type's table.
    No value of the table or of a reference case is outside the tables, so no reference hash depends on it.
    `lines.py` builds seven out-of-range cases with the model after its own `clamp_params` and R2 0's tables; the
    module gives the same integers and outputs. Values past a table's length pass as they are (the model's rule).
13. **A delay's filter kind** (its value 4). A width over 0 makes the first section the high-pass at the cutoff
    (R2 b); else a filter kind of 1 (`HP`) is a high-pass and any other a low-pass, as the model has it (so `BP`
    with no width is a low-pass). No preset reaches either; the high-pass is computed with `Math.tan` and marked
    "not pinned".
14. **`fpar` is truncated** (the model's `tr(p[6])`): a value of 0.5 means no filter in the loop.
15. **Lines that are not whole numbers** (a delay of negative length, or a feedback that is not a number, which a
    reverb whose first line has length 0 could give) are refused by name; Python would stop there too.
16. **The table is not loaded by the module** (no `require`, item 2's "no imports"): it reads the global or what
    `setTable` or a `table` option gives it.
17. **The heaviest preset** for the speed figure is whichever measures slowest; the order's own comparison case
    (three all-passes and twelve lines) is measured too.
18. **The precisions of a modulated line's depth, period and glide** (R2 a4 gives `T` as a single and says
    nothing of the rest) are the model's: `fmod x 0.001f / T`, `T x rate` and `x 44100` in single. An all-double
    reading would move the period of preset 14's first line from 7803 to 7802 samples, and of five lines of 130,
    four of 131 and of `open`, by one sample (the review's finding 5): the draws' timing, not the character.
19. **Products wrap at 32 bits**, as R2 reads them and the model computes them. At the presets' own shares nothing
    wraps (the review checked every table preset and named case on a full-scale square, steps and noise, alone and
    under water). Fully wet (entry at 256), a full-scale square or steps makes 32-bit products wrap in presets 15,
    16, 19, 23, 24, 25, 103 and 107 and in the vent, tunnel, big tunnel and great hall cases (up to 4,061 wrapped
    products in 3 s). That is the engine's own arithmetic; it matters for a custom room at a high mix and for the
    owner's fully wet take. No double reaches 2^53.
20. **A path is never empty.** `createRoomPath` with no room and no water still makes the room slot (with no
    instance), the water instance of preset 14 and a tail tracker of 512 KB; its output is the direct buffer
    untouched. Decision 4 ("no slot") is part c's to keep, by not making a path for a render with no room that is
    not under water.
21. **A number the engine has but the app's table does not** (N3 of the second read): the engine keeps what it
    had only for a number at or past its template count; 30 to 59, 100, 101, 134 and 135 are presets it has, and 60
    to 99 its automatic store. The module treats every number its table lacks as "not held" (Decision 11): the
    plan's choice, not the engine's behaviour for those numbers.

## What in the order or the reports was wrong, or could not be done

- Nothing in the reports or the reference was found wrong in the steady state: the module and the model agree
  everywhere the reference records, and on every extra case `lines.py` reads from the model; the review's own
  differential run and the second read agree.
- **What the order assumed about changes while running was not the engine's** (the second read, F1 to F5; the
  order had marked those points assumed). The slot's ramp is stepped before use and, once done, the fade holds 4095
  to the end of its block, the old instance still running (F1). The update, the shares and the slot stage come in
  that order in a block, so "before" is cleared one block later and a take from none counts in its own block (F2).
  Taking "none" overwrites the four mix values with preset 0's header (F3). The water has no fade and no fresh
  instance: one instance, run or not block by block (F4). The new instance runs first in a fade (F5). All five are
  built now, each with a check typed from that report.
- **Two mutations of the order's list are weaker than the table says.** (a) "The diffusor's time not cut to whole
  milliseconds" is not caught by "573, 837, 1146, 926": at size 1 the cut changes nothing (13 x 44.1 = 573.3 gives
  573 either way); the synthetic "diffusor of size 0.9" and its built integers catch it. (b) "`entry` without the
  single rounding" is not caught by share 256, where no sample differs (the order says so itself); share 229 and
  the fixed sample -32690 catch it.
- **Three rules no check can see, by construction**, each confirmed by a break that no check caught: the
  section's shortcut when its state and input are 0 (the computation gives 0 too); `MDY`'s special case for a mix
  of 2048 (`(y + x) >> 1` equals `x + (((y - x) x 2048) >> 12)` for every pair that does not overflow); and the
  order's own "reciprocal against division" (item 6). They are built as read.
- **The order's mutation "the modulating delay's fade ending on 4096", made the obvious way, changes nothing**: one
  more faded sample at weight 4096 reads exactly the new tap, which is what the switch does. Two forms that do put
  4096 where the engine has 4095 were made instead and are caught (19c, 19d), by a new check that reads the tap
  fade off sample by sample among others; the reference hashes catch both as well.
- **The order expected "the water slot started fresh" and "the tail ended on a level" to be caught by hashes and
  tail lengths, and they were, but only by those**: each now also has a pointed check (the path built by hand
  from two instances, the water one 44,100 samples ahead; a tail resting at -100 that ends 22,050 samples after
  the voice).
- Not done: the automatic room's build and the named cases (part b), anything in `audio.js` or the page (parts c
  and d). The browser suite was not run: no page loads the module yet.

## For part b's builder

- `buildAutomatic` and `ROOM_CASES` go into `room-dsp.js`. A built preset is a plain object of the table's form; it
  goes straight into `createInstance`, `createSlot`, `createRoomPath({ room })` and `setRoom`. Keep its values
  singles (`Math.fround`).
- `lines.json`'s `auto` section holds, for each of the 14 named cases, what the model built: `measures`, `shape`,
  `classes`, `base`, `h` and `p` (singles as doubles, so `===` against `Math.fround` values), and the built
  integers `d`. The suite already runs the 14 cases' reference hashes and tail lengths, and their `describe()`,
  **on the model's parameters**; part b can point those three checks at its own build and add `p` equality.
- The synthetic "negative width and depth in templates" is in `lines.json`'s `synthetic` section with the model's
  built `p`; `reference.out`'s `built:` line is checked against it.
- `lines.py` is yours to extend: it imports `dspmodel` and `reference` without changing them, and writes no
  `__pycache__`. The order's amendment after W3-18 (on `main` since this branch started; it leaves part a
  unchanged) adds the two measured cases `set_c_room` and `set_d_street`: their measures can go into `lines.py`
  beside `reference.CASES` to get the model's built parameters and integers the same way, and their hashes and
  tail lengths are the order's (item 5 of part b).

## For part c's builder

- Load `room-presets.js` then `room-dsp.js` (classic scripts). In a page or worker `TF2Room` finds
  `TF2_ROOM_PRESETS` itself. In a vm-sandbox test, `require` both outside the sandbox, call
  `TF2Room.setTable(table)` (or pass `table`), and put both into the sandbox: the module then runs at full speed.
- Per render: `const path = TF2Room.createRoomPath({ seed, room, water })`, with `room` a table number, a built
  preset, or null. `spurtStart()` at each voice channel start. Per 512-sample mixer block, `path.shares()` gives the
  two shares; enter the voice twice with W3-10's entry function (its law is `TF2Room.entry`), upsample each buffer
  by W3-10's rule, then `path.process(direct, room)` gives the sum before the clip.
- After the voice's last sample, feed zero buffers until `path.tailLeft().ended`; the output's last sample is index
  `at` of the block in which it ended; `length` is the tail in mixer samples. If the voice ended with a long
  silence the rule may already have held (`ended` true with `at` -1): there is then no tail to add. `TF2Room.TAIL_CAP`
  (882,000) gives `maxTail`.
- **Make no path for a render with no room that is not under water** (Decision 4): a path always holds the room slot
  and the water instance (reading 20), and its output would then be the direct buffer untouched.
- A render with a fixed room or made under water meets no change of the fix round: the fade, the block order and
  the water switch matter only when the room or the water changes while running.
- The custom room (99): build an RVA preset from its knobs and pass it as `room`; a cutoff outside the pinned 25 is
  computed with `Math.tan` and shows in `describe()` as `notPinned`.

## For part d's builder

- The live chain: one `createRoomPath` outside the chain. `setRoom` for a change: taken at the room slot's update
  of a block once its ramp is done, with the engine's 0.2 s fade (held at 4095 to the end of that block). `setWater`
  switches the water at the next block's start with no fade (the engine has none, F4; the order's 100 ms fade for
  the water does not exist). Ask `shares()` per block, at the block's start, before `process()`: it then runs the
  block's update first, as the engine's mixer does.
- **`tests/room-dsp.verify.mjs` reads `DSP_PRESETS[n].chain` from `constants.js`** to compare presets 0 to 29 with
  the table. When part d strips `DSP_PRESETS` to names (part d, item 3), that check prints a skip with its reason and
  the suite goes on; nothing in part d's file list needs to change for it.
- `path.state()` says what each slot holds now, before, and has been asked for.

## The checks

`node tests/room-dsp.verify.mjs`; in `pnpm test`. Results on the head commit: __N__ checks, all pass, in
__T__. By section (the table's comparison with `DSP_PRESETS` is skipped, with its reason printed, once part d strips
the chains):

- **The table** (11): the wrapped line's SHA-256 and length, byte equality with `room-presets.json`, the exported
  object, the 46 numbers, loading as a classic script (frozen); every duration and fade 0; the processor counts
  (`RVA` 35, `DFR` 26, `DLY` 16, `NULL` 2, `AMP` 1, `MDY` 1, no `FLT`); the amplifier in 14 and the modulating
  delay in 16; the module's range tables equal R2 0's and AM 0's as typed into the test; no non-zero value
  outside them; presets 0 to 29 against today's `DSP_PRESETS` (loaded from `constants.js`, read only) in the
  fields it carries: the one difference is preset 23's reverb count, 1.3 against 1, asserted by name.
- **The coefficients** (3): `coefs.mjs` agrees with the module and the order, margin at least 0.005; pinned and
  not-pinned marks.
- **Built integers against the model** (9): `describe()` equals `lines.json` for the 46 presets, 16 synthetic
  cases, the 14 named cases (from the model's parameters), 7 out-of-range cases and 14 extra cases; the clamped
  and extra cases' outputs equal the model's short hashes; quality 0 and 2 in a delay give the same samples; 0 is
  never clamped.
- **The reads' pinned lines and echoes** (19): W3-15's and R2's preset 5; R2's preset 6 (all-passes and lines),
  17 (381 ... 806), 102 and 114 as written; presets 4, 6 and 7's delays; the diffusor's 573, 837, 1146, 926; R2's
  small room and tunnel from the parameters R2 lists (the tunnel's predelay 3924 at gain 4096 and its eight lines);
  R2's five echo tables by the model's peak picking; the order's two echo lists through `entry`; the comb fed -1.
- **The amplifier and the modulating delay** (24): the build (4096, 0, 0, 4410, 2457, 3528, no random); the gain
  on every sample of 60,000 (4096 to 4412, 4095 at 4413, 2867 at 6176, 1640 from 7938); the glide (step 730258,
  3529 calls, ends on 1640, never 1639) against the model's ramp sample for sample; firings on 4410, 8821,
  13232; a constant 8000; `MDY`'s build, draws on 22050, 44101, 66152 between 21829 and 22050, its fade (662
  calls, 6, 12, 18 ... 4089, 4095, 4095) and that fade read off sample by sample; AM 5's tone and its 14 hashes;
  preset 14's first 20 and peak; the amplifier of 14 on the tone; threshold 0 with mix 1; the clip switched off
  from a threshold of 0.125 x 32767 >= 4096 (AM 2, step 1: at 0.5, 20000 gives 20000; at exactly 0.125 the
  threshold is 4095 and 20000 gives 4095).
- **Random taps** (2): for 21 modulating cases, every draw of the first 60,000 samples on the model's sample and
  between its bounds; in 10 s, as many draws as one every `period + 1` samples gives.
- **The seeded streams** (2): `seededDraw` is `reference.py`'s `randint_from`; the path's two streams are the
  render's seed XOR `0x524F4F4D` and `0x57415452` (Decision 7).
- **The reference hashes** (12): every line of `reference.out` (85), with its shares; the template case's built
  reverb as `reference.out` prints it; a path under water built by hand from two instances (direct plus the room,
  then the water instance that has run 44,100 zeros first).
- **The tails** (6): all 239 lengths of `tails.out`, through `createRoomPath` and `tailLeft()`; a hand case resting
  at -100 that ends 22,050 samples after the voice (the rule is a band, not a level); the band's width (a tail on
  -100 and -68 ends after 22,050 samples, one on -100 and -67 has not ended 60,000 later).
- **Chunking** (1): five paths, each with a fade (a room change, the water fading in, a room under water), in
  pieces of 1, 127, 512, 4096 and seeded random sizes against the whole run: the same samples, the same tail, the
  output as long as the voice and its tail.
- **The slot** (15): the model's 0.2 s and 0.1 s ramps (486957, 973915; 2048 at the 4,411th call; done at
  the 8,821st and 4,411th); every ramp of the module against the model's call by call, those of 0 to 3 samples
  included; a 0.2 s and a 0.1 s fade's weight on every sample as the second read gives it (F1: the ramp stepped
  before use, 0, 0, 1, 1, 2 from sample 0, 4095 on 8819 and on the done call 8820, 4095 to 9215, the new preset
  alone from 9216); a change asked mid-block taken at the next block; a change asked during a fade taken at the
  first block after the done call; a fade to none ending on the input bit for bit at the block after it; 40, 104
  and 137 changing nothing (a request dropped by an unknown number); a path made with 137 having no room; a slot
  made with a preset settled; the new instance running and drawing first in a fade (F5); an equal copy of the
  preset held starting no fade, and 26 to 27 starting one.
- **Shares, entry and the water** (15): the model's shares for every header of the table and seven more; the
  order's share list, 256/0 and the start-up values; `shares()` of a path in the engine's block order (F2): 0/256
  for the block in which a room is asked, the room share from the next block (taken in its update), the running
  spurt's limits kept after a take and the next spurt's from the preset; a fade to none taken at 512 sharing still
  for block 9728 and 0/256 from 10240; taking none setting the four values from preset 0's header (F3: 26/229 for
  a spurt in the fade to none); at once for a path made with a room; the four values changed at the take, not at
  the request; the water (F4) switched at block starts with no fade, one instance frozen while dry (the amplifier
  of 14 as the water: full gain only for the first 4,413 samples it ever runs, 1640 at once on a later dive, a
  switch asked mid-block waiting for the next block), and preset 14 as the water stepped only on the wet blocks; `entry`'s nine fixed points; `lines.json`'s 28 and 2 differing samples; every 16-bit sample at 20
  shares against the reference's `entry`; `entry(s, 256) = trunc(s x 255 / 256)` for all 65,536.
- **Refused by name** (6): `FLT`, `CRS`, the three delay kinds (in `DLY` and `MDY`), a tap factor, a duration and a
  fade time, six processors.
- **Loading and speed** (2): as classic scripts in a vm context the two files work together with no
  `setTable`; every preset runs under 2,000 ns a sample (printed: the five heaviest).

## Speed

Node 22.23.4, the module loaded with `require` (not in a vm context), on this machine (4 cores); the best of three
runs over 20 s of input (10 s of noise, 10 s of zeros). Two runs: the first build's, with the break runs beside it
(load about 1.2), and the fix round's (load about 0.5):

| Case | ns a sample (first build; fix round) | M samples a second | times real time |
| --- | --- | --- | --- |
| preset 10 (two all-passes, nine modulated lines) | 136; 104 | 7.3; 9.6 | 166; 219 |
| preset 25 | 128; 105 | 7.8; 9.5 | 178; 215 |
| three all-passes and twelve lines (the plan's case: 97 ns there) | 114; 113 | 8.8; 8.8 | 199; 200 |
| preset 103 | 105; 93 | 9.6; 10.8 | 217; 245 |
| a room path, 103 and 131 cross-fading without a break | 236; 241 | 4.2; 4.1 | 96; 94 |
| a room path, 103 under water | 179; 199 | 5.6; 5.0 | 126; 114 |

The chain is run sample by sample (reading 1), so each processor is a method call per sample; that keeps the
output independent of block sizes. The heaviest case of part d (a fade between two presets) costs about 1% of
real time.

## Review

- **The reviewer** (read-only, its own worktree): no must-fix. A differential run of its own against the model,
  1,032 runs and 136,533,600 samples (95,376 draws; the 46 presets, the 14 named cases built by the model's own
  `build_auto`, the 16 synthetic cases and 9 cases of its own, on eight inputs from one unit to a sum over full
  scale): **0 differences**, the draw counts equal on every run. Its 21 checks of the slot, the path and the tail
  built by hand from the order's rules all passed. 33 mutations of its own (31 meaningful): 26 caught by a pointed
  check, 2 only by recorded tails (the band's width, the cap's length), 1 caught by nothing (the amplifier's clip
  tested against 32767), 3 equivalent. Readings 10, 11 and 12 judged right. Its findings: 1 and 2 (test gaps) and 3
  (a future crash of the suite) are fixed with checks or a guard; 4 is F3 below; 5, 7 and 8 are readings 18, 20
  and 19; 9 (an equal copy of a preset started a fade) is fixed: numbers compare by number, a preset object by
  value.
- **The second read** (`docs/reports/W3-17a-second-read.md`: the module against the engine's code, and against
  the recordings). Of its 21 rows, 13 confirmed outright (the take at a block's start only once the ramp is done, the
  fade's formula, the four values from the taken preset's header, the slots' times, the path's order, the mono
  fold, the chain, reading 10, the range tables, the shares, a settled start, equal and unknown numbers, the
  reflectivity of 0.8), 2 confirmed but for when (rows 5 and 6: "before" is cleared, and the shares' test is per
  block, but a block off), 5 different (rows 3, 4, 7, 9, 11) and 1 not checked (when a channel's limits are
  fixed). The differences are all in changes while running: F1 (rows 3, 4), F2 (rows 5, 6), F3 (row 9), F4 (row
  11), F5 (row 7). All five are fixed in the fix round. Against the
  recordings: with the take's own voice rendered through the app, Set C's four comb peaks fit to 1 to 7% and the
  allpass peak to 0.3% (the gap the plan's fit left came from its input, not the room); the loud level to 0.1 dB;
  Set D's street echoes to about one scatter.

## Breaks

Each mutation was made in a scratch copy of `room-dsp.js` and the whole suite run on it
(`TF2_DIR=<copy> node tests/room-dsp.verify.mjs`); "checks failed" counts the suite's checks that failed. "From":
the order's table of mutations for part a, or the builder's own, for a rule the order's list does not cover. The
"reference sweeps" are the checks that run `reference.out`'s hashes and `tails.out`'s lengths; a mutation caught
only by them would be weakly caught, and none is now. The runner and the full logs are in the builder's scratch
folder, not in the repository.

| # | From | Mutation | Checks failed | Caught by |
| --- | --- | --- | --- | --- |
| 1a | order | >> 12 made trunc(x / 4096) in the PLAIN comb's feedback | 16 | "those cases' outputs are the model's"; "a comb fed -1 stays at -1 every 44 samples for 50 turns"; "AM 5: preset 14, impulse, "upper" and "lower""; "AM 5: preset 14, tone, "upper" and "lower""; and 3 more; 9 reference sweeps (hashes, tails) |
| 1b | order | >> 12 made trunc(x / 4096) everywhere in a delay line and its filter | 27 | "those cases' outputs are the model's"; "preset 6 fed 1664:"; "the small room fed 2432:"; "the tunnel fed 4608:"; and 11 more; 12 reference sweeps (hashes, tails) |
| 2 | order | the room path delayed by one sample (PLAIN and LOWPASS lines output the last sample's value) | 29 | "those cases' outputs are the model's"; "preset 6 fed 1664:"; "the small room fed 2432:"; "the tunnel fed 4608:"; and 13 more; 12 reference sweeps (hashes, tails) |
| 3 | order | the far delay reached: step = (size - min) / (m - 1) | 32 | "every preset of the table: describe() is the model's"; "every synthetic case (16): describe() is the model's"; "the 14 named cases, from the model's built parameters: describe() is the model's"; "values outside the range tables: clamped as the engine does, describe() is the model's"; and 17 more; 11 reference sweeps (hashes, tails) |
| 4 | order | one rounding where the engine has two: trunc((i x step + min) x 44.1) | 25 | "every preset of the table: describe() is the model's"; "every synthetic case (16): describe() is the model's"; "the 14 named cases, from the model's built parameters: describe() is the model's"; "values outside the range tables: clamped as the engine does, describe() is the model's"; and 10 more; 11 reference sweeps (hashes, tails) |
| 5a | order | quality applied inside a delay (a second section in the loop when quality > 0) | 2 | "quality 2 and quality 0 in a delay give the same samples, one filter section in the loop"; 1 reference sweep (hashes, tails) |
| 5b | order | two sections in every LOWPASS line's loop | 18 | "those cases' outputs are the model's"; "preset 6 fed 1664:"; "the small room fed 2432:"; "the tunnel fed 4608:"; and 4 more; 10 reference sweeps (hashes, tails) |
| 6 | order | a value of 0 clamped (cutoff 0 made 10 Hz) | 16 | "every preset of the table: describe() is the model's"; "every synthetic case (16): describe() is the model's"; "the 14 named cases, from the model's built parameters: describe() is the model's"; "values outside the range tables: clamped as the engine does, describe() is the model's"; and 6 more; 6 reference sweeps (hashes, tails) |
| 7 | order | a delay's gain of 0 kept as 0 | 2 | "every synthetic case (16): describe() is the model's"; 1 reference sweep (hashes, tails) |
| 8 | order | the three-dimension feedbacks from the sizes untruncated | 2 | "every synthetic case (16): describe() is the model's"; 1 reference sweep (hashes, tails) |
| 9 | order | a negative factor made a predelay where there is no loop filter | 2 | "every synthetic case (16): describe() is the model's"; 1 reference sweep (hashes, tails) |
| 10 | order | the predelay scaled by gain / m (FLINEAR takes the gain it is given) | 15 | "every preset of the table: describe() is the model's"; "every synthetic case (16): describe() is the model's"; "the 14 named cases, from the model's built parameters: describe() is the model's"; "values outside the range tables: clamped as the engine does, describe() is the model's"; and 5 more; 6 reference sweeps (hashes, tails) |
| 11a | order | later rounds not quartered | 16 | "every preset of the table: describe() is the model's"; "every synthetic case (16): describe() is the model's"; "the 14 named cases, from the model's built parameters: describe() is the model's"; "rules no reference case runs (14): describe() is the model's"; and 6 more; 6 reference sweeps (hashes, tails) |
| 11b | order | the push-apart term recomputed for the largest size | 11 | "every preset of the table: describe() is the model's"; "every synthetic case (16): describe() is the model's"; "rules no reference case runs (14): describe() is the model's"; "those cases' outputs are the model's"; and 4 more; 3 reference sweeps (hashes, tails) |
| 12 | order | the gain cut as trunc(4096 x (1 - fb)) | 16 | "every preset of the table: describe() is the model's"; "every synthetic case (16): describe() is the model's"; "the 14 named cases, from the model's built parameters: describe() is the model's"; "rules no reference case runs (14): describe() is the model's"; and 7 more; 5 reference sweeps (hashes, tails) |
| 13 | order | a reverb line's draw every period samples | 12 | "those cases' outputs are the model's"; "it draws on samples 22050, 44101, 66152, each between 21829 and 22050"; "the first 60,000 samples of 22 modulating cases: each draw on the model's sample, between "; "in 10 s, as many draws as a draw every period + 1 samples gives"; 8 reference sweeps (hashes, tails) |
| 14a | order | entry without the single rounding | 9 | "entry: -29128 at (-32690, 229), 2809 at (31388, 23), and the order's other fixed points"; "entry: every 16-bit sample at 20 shares is the reference's"; 7 reference sweeps (hashes, tails) |
| 14b | order | entry rounded to nearest | 15 | "those cases' outputs are the model's"; "through entry"; "entry: -29128 at (-32690, 229), 2809 at (31388, 23), and the order's other fixed points"; "entry: every 16-bit sample at 20 shares is the reference's"; and 1 more; 10 reference sweeps (hashes, tails) |
| 15 | order | the diffusor's time not cut to whole milliseconds | 2 | "every synthetic case (16): describe() is the model's"; 1 reference sweep (hashes, tails) |
| 16a | order | the ramp reaching its target (every ramp) | 16 | "those cases' outputs are the model's"; "the gain: 4096 for samples 0 to 4412, 4095 at 4413, 2867 at 6176, 1640 from 7938 on, for g"; "the glide 4096 to 1639 (model): step 730258, 3,529 calls, ends on 1640, never on its targe"; "a constant 8000 comes out as 8000, 7998 at 4413, 5599 at 6176, 3203 from 7938 on"; and 4 more; 8 reference sweeps (hashes, tails) |
| 16b | order | the amplifier's target turning back to full (flips between full and low) | 12 | "those cases' outputs are the model's"; "the gain: 4096 for samples 0 to 4412, 4095 at 4413, 2867 at 6176, 1640 from 7938 on, for g"; "a constant 8000 comes out as 8000, 7998 at 4413, 5599 at 6176, 3203 from 7938 on"; "AM 5: preset 14, tone, "upper" and "lower""; and 1 more; 7 reference sweeps (hashes, tails) |
| 17 | order | the amplifier firing every PERIOD samples | 3 | "the amplifier fires on samples 4410, 8821, 13232"; "the first 60,000 samples of 22 modulating cases: each draw on the model's sample, between "; 1 reference sweep (hashes, tails) |
| 18 | order | the clip skipped at threshold 0 | 2 | "threshold 0 with mix 1: every output is 0"; 1 reference sweep (hashes, tails) |
| 19a | order | the modulating delay's fade ending on 4096: one more faded sample at weight 4096, then the switch (no output can change: weight 4096 reads the new tap exactly) | 0 | **none** |
| 19b | order | the modulating delay's mix as a float | 2 | "those cases' outputs are the model's"; 1 reference sweep (hashes, tails) |
| 19c | order | the fade ending on 4096: the tap switched once the weight reaches 4095 (the last faded sample read at 4096) | 9 | "those cases' outputs are the model's"; "the modulating delay's tap fade, sample by sample: weight 0 on the first faded sample, the"; "AM 5: modulating delay of 16, tone, "upper" and "lower""; 6 reference sweeps (hashes, tails) |
| 19d | order | the fade ending on 4096: the modulating delay's step one larger (its 661st weight 4096) | 9 | "every preset of the table: describe() is the model's"; "every synthetic case (16): describe() is the model's"; "values outside the range tables: clamped as the engine does, describe() is the model's"; "rules no reference case runs (14): describe() is the model's"; and 4 more; 1 reference sweep (hashes, tails) |
| 20 | order | the water slot started fresh in a render | 6 | "a path under water is water(direct + room(room)), its water instance 44,100 samples of sil"; 5 reference sweeps (hashes, tails) |
| 21a | order | the tail ended on a level (abs(y) <= 16 for 22,050 samples) | 4 | "a tail resting at -100 ends 22,050 samples after the voice"; 3 reference sweeps (hashes, tails) |
| 21b | order | the tail's cap missing | 1 | "synthetic: never settles: the cap, 882,000" |
| 22 | own | the slot's ramp stepped before its first use (the other reading) | 5 | "a room fade covers samples 0 to 8820: weight 0 on sample 0, the ramp's k-th value on sampl"; "a water fade (0.1 s) the same way: samples 0 to 4410"; "a change asked mid-block is taken at the next block (sample 1024), not before"; "a change asked during a fade waits for it to end and for the next block"; and 1 more |
| 23 | own | "before" never cleared (the other reading of the shares) | 2 | "a fade to none: from sample 13941 on, the output is the input bit for bit"; "during a fade to none the shares stay; once it has ended they are 0/256 again" |
| 24 | own | a change taken mid-block | 2 | "a change asked mid-block is taken at the next block (sample 1024), not before"; "a change asked during a fade waits for it to end and for the next block" |
| 25 | own | a change taken during a fade | 2 | "a change asked mid-block is taken at the next block (sample 1024), not before"; "a change asked during a fade waits for it to end and for the next block" |
| 26 | own | during a fade the new instance runs (and draws) first | 1 | "during a fade from 17 to 16 (both draw), the old instance draws first in each sample" |
| 27 | own | the slot's cross-fade as a float mix | 2 | "a change asked mid-block is taken at the next block (sample 1024), not before"; "during a fade from 17 to 16 (both draw), the old instance draws first in each sample" |
| 28 | own | the mix values overwritten when a room is asked for, not when it is taken | 1 | "the four mix values change when the slot takes the preset, not when it is asked" |
| 29 | own | under water, the room's output added after the water slot | 4 | "a path under water is water(direct + room(room)), its water instance 44,100 samples of sil"; 3 reference sweeps (hashes, tails) |
| 30 | own | one low-pass section on the sum where the engine has two | 14 | "AM 5: preset 14, impulse, "upper" and "lower""; "AM 5: preset 14, tone, "upper" and "lower""; "AM 5: preset 16, impulse, "upper" and "lower""; "AM 5: preset 16, tone, "upper" and "lower""; and 1 more; 9 reference sweeps (hashes, tails) |
| 31 | own | the shares' drop when 60 < dB min (not <=) | 6 | "every header of the table and 7 more: the model's shares"; "the order's share table, (1, 1, any, 1) 256/0, and the start-up values 26/229"; "the table's every header gives a share of the order's list"; 3 reference sweeps (hashes, tails) |
| 32 | own | the section's zero shortcut removed (no output can change) | 0 | **none** |
| 33 | own | the tail's run not started over by a voice sample | 3 | "five cases, a fade in each, in pieces of 1, 127, 512, 4096 and random sizes: the same samp"; 2 reference sweeps (hashes, tails) |
| 34 | own | the tail's end index one sample late | 1 | "five cases, a fade in each, in pieces of 1, 127, 512, 4096 and random sizes: the same samp" |
| 35 | own | a reverb's lines stepped (and drawing) in reverse order | 4 | "the first 60,000 samples of 22 modulating cases: each draw on the model's sample, between "; 3 reference sweeps (hashes, tails) |
| 36 | own | the tap depth not clamped to 0.01..0.99 | 4 | "rules no reference case runs (14): describe() is the model's"; "those cases' outputs are the model's"; "the first 60,000 samples of 22 modulating cases: each draw on the model's sample, between "; "in 10 s, as many draws as a draw every period + 1 samples gives" |
| 37 | own | the amplifier's output after its glide step (the new gain on the same sample) | 10 | "those cases' outputs are the model's"; "the gain: 4096 for samples 0 to 4412, 4095 at 4413, 2867 at 6176, 1640 from 7938 on, for g"; "the glide 4096 to 1639 (model): step 730258, 3,529 calls, ends on 1640, never on its targe"; "a constant 8000 comes out as 8000, 7998 at 4413, 5599 at 6176, 3203 from 7938 on"; and 3 more; 3 reference sweeps (hashes, tails) |
| 38 | own | the pinned coefficient table dropped (every cutoff by Math.tan) | 9 | "a pinned cutoff is pinned; another or a high-pass is computed and marked "not pinned""; "an instance with a cutoff the table does not hold says so in its description"; "every preset of the table: describe() is the model's"; "every synthetic case (16): describe() is the model's"; and 5 more |
| 39 | own | the modulating delay clamped by the delay's table | 2 | "values outside the range tables: clamped as the engine does, describe() is the model's"; "those cases' outputs are the model's" |
| 40 | own | the 3-D sort swapping equal sizes | 2 | "rules no reference case runs (14): describe() is the model's"; "those cases' outputs are the model's" |
| 41 | own | the seeded draw rounded to nearest | 2 | "seededDraw"; "a path's room slot draws from mulberry32" |
| 42 | own | the water slot seeded with the room slot's stream | 1 | "a path's room slot draws from mulberry32" |
| 43 | own | a number the table does not hold kept as a request that waits (not dropped) | 1 | "set(17) then set(137) before the block: the slot keeps 6, as the engine keeps what it had" |
| 44 | own | the water slot's fade at 0.2 s (the room slot's) | 1 | "a path's water slot fades over 0.1 s" |
| 45 | own | the predelay line's feedback kept (FLINEAR with a loop) | 13 | "every preset of the table: describe() is the model's"; "every synthetic case (16): describe() is the model's"; "the 14 named cases, from the model's built parameters: describe() is the model's"; "values outside the range tables: clamped as the engine does, describe() is the model's"; and 3 more; 6 reference sweeps (hashes, tails) |
| 46 | own | later rounds quartered only with a loop filter (the order's sentence read literally) | 2 | "every synthetic case (16): describe() is the model's"; 1 reference sweep (hashes, tails) |
| 47 | own | MDY's mix of 2048 by the general formula (no output can change) | 0 | **none** |
| 48 | own | the plain reverb's step and gain by a division, not the reciprocal (no output can change on the table and the cases) | 0 | **none** |
| 49 | own | the ramp without the x86 conversion rule (plain trunc) | 4 | "rules no reference case runs (14): describe() is the model's"; "those cases' outputs are the model's"; "in 10 s, as many draws as a draw every period + 1 samples gives"; "ramps of 0, 1, 2 and 3 samples: the model's values" |
| 50 | own | the slot's cross-fade shift rounding toward zero | 2 | "a change asked mid-block is taken at the next block (sample 1024), not before"; "during a fade from 17 to 16 (both draw), the old instance draws first in each sample" |
| 51 | own | the voice at the listener (distance 0, not 12) | 16 | "every header of the table and 7 more: the model's shares"; "the order's share table, (1, 1, any, 1) 256/0, and the start-up values 26/229"; "the table's every header gives a share of the order's list"; "after setRoom"; and 2 more; 10 reference sweeps (hashes, tails) |

**After the fix round** some rows no longer exist as written. Rows 22 and 23 flipped the two assumed constants,
which are gone; F1a and F2b take their place. Row 25 is B1 below, row 26 is reversed (F5), and row 44 has nothing
left to break: there is no water fade. Rows 20, 24, 27, 29 and 50 were made again on the new code (20r, 24r, 27r,
29r and 50r below). The other rows' texts still apply; they touch the processors, which the fix round did not
change.

The four that nothing catches, and why none can be caught:

- **19a**, the order's "the modulating delay's fade ending on 4096", made the obvious way (one more faded sample at
  weight 4096, then the switch), is the same output: `d + (((dn - d) x 4096) >> 12)` is `dn`, the new tap. The
  rule it stands for is "the last faded sample is at 4095, never 4096" (AM 3), and the two forms that break it,
  19c (the tap switched when the weight reaches 4095) and 19d (the step one larger, so the 661st weight is 4096),
  are caught, among others by the new check that reads the tap fade off sample by sample.
- **32**: a filter section whose state and input are 0 returns 0; computing it gives 0 too.
- **47**: `MDY`'s mix of 2048 as `(y + x) >> 1` equals `x + (((y - x) x 2048) >> 12)` (both are
  `floor((x + y) / 2)` when nothing overflows).
- **48**: the plain reverb's step and gain by the reciprocal or by a division: the order's own search found no case
  in the table's range where they differ, and none of the 46 presets, the cases or the extra cases does.

## Breaks of the fix round

The fix round's rules, each broken in a scratch copy of the fixed `room-dsp.js` and run against the whole suite as
before: "second read F1" to "F5" revert or bend a fix of `docs/reports/W3-17a-second-read.md`; "review" one of the
review's findings; the rows marked with a first-round number are those rows made again on the new code. **All 23
are caught, each by a pointed check**; the reference sweeps catch only those that change a fixed room or a path
made under water.

| # | From | Mutation | Checks failed | Caught by |
| --- | --- | --- | --- | --- |
| F1a | second read F1 | the ramp used, then stepped (the old alignment: weight 0 on the first faded sample) | 5 | "a room fade taken at 0 (second read, F1): 0, 0, 1, 1, 2 on samples 0 to 4; 4095 on 8819 an"; "a 0.1 s slot (the water's and the player's time, row 10) the same way: done on 4410, 4095 "; "a change asked mid-block is taken at the next block (1024), not before; its fade as the en"; "a change asked during a fade waits for the ramp's done and the next block (10240): 0 on 98"; and 1 more |
| F1b | second read F1 | the fade ended at the done call (the new preset alone from the next sample, no 4095 to the block's end) | 6 | "a room fade taken at 0 (second read, F1): 0, 0, 1, 1, 2 on samples 0 to 4; 4095 on 8819 an"; "a 0.1 s slot (the water's and the player's time, row 10) the same way: done on 4410, 4095 "; "a change asked during a fade waits for the ramp's done and the next block (10240): 0 on 98"; "a fade to none taken at 5120: still mixed on 13941 to 14335, the input bit for bit from 14"; and 2 more |
| F1c | second read F1 | after the done call the weight goes on stepping to 4096 (the old instance still mixed in) | 5 | "a room fade taken at 0 (second read, F1): 0, 0, 1, 1, 2 on samples 0 to 4; 4095 on 8819 an"; "a 0.1 s slot (the water's and the player's time, row 10) the same way: done on 4410, 4095 "; "a change asked during a fade waits for the ramp's done and the next block (10240): 0 on 98"; "a fade to none taken at 5120: still mixed on 13941 to 14335, the input bit for bit from 14"; and 1 more |
| F2a | second read F2 | the shares asked at a block's start before its update (a take from none shares a block late) | 1 | "a room asked mid-block: 0/256 for that block; at the next block's start the update takes i" |
| F2b | second read F2 | "before" cleared at the done call, not at the next block's slot stage | 1 | "a fade to none taken at 512: the room share still for block 9728" |
| F2c | second read F2 | the slot stage before the shares (the block after the fade already 0/256) | 1 | "a fade to none taken at 512: the room share still for block 9728" |
| F3 | second read F3 | taking none leaves the four mix values | 1 | "taking none overwrites the four values with preset 0's header" |
| F4a | second read F4 | a fresh water instance at each dive | 2 | "the water switched at block starts with no fade, its instance frozen while dry: full gain "; "preset 14 as the water: one instance, run only on the wet blocks, the dry blocks the sum i" |
| F4b | second read F4 | the water instance run while dry (not frozen), its output dropped | 2 | "the water switched at block starts with no fade, its instance frozen while dry: full gain "; "preset 14 as the water: one instance, run only on the wet blocks, the dry blocks the sum i" |
| F4c | second read F4 | the water switched at once, mid-block | 1 | "the water switched at block starts with no fade, its instance frozen while dry: full gain " |
| F4d | second read F4 | the water faded in and out over 0.1 s (the old build's rule, by a 0.1 s ramp on the wet part) | 10 | "a path under water is water(direct + room(room)), its water instance 44,100 samples of sil"; "a tail resting at -100 ends 22,050 samples after the voice"; "the band is 32 wide: a tail on -100 and -68 ends 22,050 samples after the voice; one on -1"; "the water switched at block starts with no fade, its instance frozen while dry: full gain "; and 1 more; 5 reference sweeps (hashes, tails) |
| F5 | second read F5 | in a fade the old instance runs (and draws) first | 1 | "during a fade from 17 to 16 (both draw), the new instance runs and draws first in each sam" |
| R9a | review 9 | a preset object compared by identity (an equal copy starts a fade) | 1 | "setting an equal copy of the preset held (as an object, or for its number) starts no fade;" |
| R9b | review 9 | two numbers compared by value (26 to 27, equal presets, is no change) | 1 | "setting an equal copy of the preset held (as an object, or for its number) starts no fade;" |
| R1 | review 1 | the amplifier's clip threshold tested against 32767 | 1 | "the clip is off from a threshold of 0.125 x 32767 >= 4096: at 0.5, 20000 gives 20000; at e" |
| R2a | review 2 | the tail band 33 | 4 | "the band is 32 wide: a tail on -100 and -68 ends 22,050 samples after the voice; one on -1"; 3 reference sweeps (hashes, tails) |
| R2b | review 2 | the tail band 31 | 4 | "the band is 32 wide: a tail on -100 and -68 ends 22,050 samples after the voice; one on -1"; 3 reference sweeps (hashes, tails) |
| B1 | own | a change taken while a fade runs (the update ignores the ramp's done flag) | 2 | "a change asked mid-block is taken at the next block (1024), not before; its fade as the en"; "a change asked during a fade waits for the ramp's done and the next block (10240): 0 on 98" |
| 20r | order (20) | the water instance started fresh in a render made under water (no 44,100 samples first) | 6 | "a path under water is water(direct + room(room)), its water instance 44,100 samples of sil"; 5 reference sweeps (hashes, tails) |
| 24r | own (24) | a change taken mid-block (the update and the slot stage on every sample) | 7 | "a room fade taken at 0 (second read, F1): 0, 0, 1, 1, 2 on samples 0 to 4; 4095 on 8819 an"; "a 0.1 s slot (the water's and the player's time, row 10) the same way: done on 4410, 4095 "; "a change asked mid-block is taken at the next block (1024), not before; its fade as the en"; "a change asked during a fade waits for the ramp's done and the next block (10240): 0 on 98"; and 3 more |
| 27r | own (27) | the slot's cross-fade as a float mix | 3 | "a change asked mid-block is taken at the next block (1024), not before; its fade as the en"; "a change asked during a fade waits for the ramp's done and the next block (10240): 0 on 98"; "during a fade from 17 to 16 (both draw), the new instance runs and draws first in each sam" |
| 29r | own (29) | under water, the room's output added after the water | 4 | "a path under water is water(direct + room(room)), its water instance 44,100 samples of sil"; 3 reference sweeps (hashes, tails) |
| 50r | own (50) | the slot's cross-fade shift rounding toward zero | 3 | "a change asked mid-block is taken at the next block (1024), not before; its fade as the en"; "a change asked during a fade waits for the ramp's done and the next block (10240): 0 on 98"; "during a fade from 17 to 16 (both draw), the new instance runs and draws first in each sam" |
