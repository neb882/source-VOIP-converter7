# W3-17a: the room module

Builder's report. The order: `docs/work-orders/W3-17-room-effects.md`, part a. Branch `claude/w3-17a-room-module`,
from `main` at `59d2f64`. New files only, and one addition to the `test` line of `package.json`.

## Summary

- `room-dsp.js` (a classic script, `TF2Room`) builds the engine's room effects as the second reads give them:
  the processors `DLY`, `DFR`, `RVA` (plain and from three dimensions, random taps), `AMP` and `MDY`; a preset as
  a plain chain; the slot and its cross-fade; the voice's shares and entry; the room path (room slot, then the
  water slot) and the tail's end. `room-presets.js` wraps the converter's table byte for byte.
- **The module met every recorded output of the reference on its first full run**: all 85 hashes of
  `reference.out` (the 44 presets, the 14 named cases fed the model's built parameters, the 6 speech cases, the
  16 synthetic cases and the 5 path and water cases) and all 239 tail lengths of `tails.out`. It also meets
  R2's five echo tables (preset 6, the small room, the tunnel, 102 and 114 as written) and the order's two through
  `entry`, R2's and W3-15's pinned lines, AM 2's and AM 3's pinned numbers and AM 5's fourteen hashes. No
  difference from the reference had to be settled, and nothing in the reports was found wrong.
- `tests/room-dsp.verify.mjs` has 122 checks and is in `pnpm test`. It adds 11 s on this machine (10.9 s inside
  `pnpm test`; the order's limit is 30). `pnpm test` passed here on `da54c10` (the suite then had 119 checks); CI
  on GitHub passed on `296fed2`, which has every check (122, in 9.5 s there), the browser suite included. Every expected value comes from the reference's recorded outputs, the
  order or the reports, or `tests/roomdsp/lines.json`, which `lines.py` reads out of the model's own instances.
- **Breaks**: 60 mutations, each made in a scratch copy and run against the whole suite: the order's 21 rows as
  30 mutations (several rows name two) and 30 of the builder's own. All are caught but four, and none of those
  four can change an output (section "Breaks"). Four that at first only a recorded hash caught (quality inside a
  delay, the water slot started fresh, the tail ended on a level, the room added after the water) and one that
  nothing caught (the water slot's fade time) now have a pointed check each.
- Speed, loaded with `require` under Node 22.23.4: the heaviest preset (10) runs at 136 ns a sample, 7.3 M
  samples a second, 166 times real time; the order's comparison case (three all-passes, twelve lines) at 114 ns
  (the plan's prototype: 97 ns).

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
9. **The slot**: as item 9 of the order; the two open points are the named constants
   `RAMP_STEPPED_BEFORE_USE = false` and `SHARES_CLEARED_AFTER_FADE_TO_NONE = true`, each with the order's note.
10. **Shares and entry**: `shares(header)` and `entry(s, share)` stand alone.
11. **The room path**: `createRoomPath`, below.

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
| `createSlot({ fade, preset, seed or draw, table, preroll })` | a slot (fade in seconds, default 0.2): `set(preset or null)` returns false for a number the table does not hold; `process(input, output?)`; `active()`; `state()`; `describe()`. Made with a preset: settled, lines silent; `preroll` runs that instance on so many zeros first |
| `createRoomPath({ seed, room, water, roomDraw, waterDraw, table })` | the path. `room` (a preset or null) and `water` (boolean) are what it is made with: no fade at its start, and made under water its water slot has had 44,100 samples of silence. A number the table does not hold gives no room. `seed` is the render's: the room slot draws from `mulberry32((seed ^ 0x524F4F4D) >>> 0)`, the water slot from `mulberry32((seed ^ 0x57415452) >>> 0)`; `roomDraw` and `waterDraw` replace them (the tests use them to meet the reference's streams) |
| `path.setRoom(preset or null)`, `path.setWater(on)` | a change, taken at that slot's next 512-sample block once no fade runs; 0.2 s and 0.1 s fades. The four mix values become the preset's header's when the room slot takes it |
| `path.spurtStart()` | a voice channel starts: its two limits are fixed from the four mix values now |
| `path.shares()` | `{ room, direct }` for the next block: 0 and 256 while the room slot holds no preset now and held none before; else from the limits (fixed now if no spurt has started) |
| `path.process(direct, room, out?)` | two Int32Arrays at 44100 Hz, already entered (and upsampled); returns `direct + room slot(room)`, then the water slot: the sum before the clip. `out` may be either input |
| `path.tailLeft()` | `{ ended, at, length }` after the last `process`: Decision 8's rule over the output. A sample is made with no voice when both its inputs are 0; a voice sample starts the count over. `ended`: the rule held (or 882,000 such samples passed) since the last voice sample; `at`: the index in the last block of the output's last sample if it ended in that block, else -1; `length`: the tail's length in samples (or the count so far) |
| `path.state()` | the slots' presets now, before and asked for, whether fading, the mix values, the limits |
| constants | `BLOCK` 512, `ROOM_FADE` 0.2, `WATER_FADE` 0.1, `WATER_PRESET` 14, `WATER_PREROLL` 44100, `TAIL_BAND` 32, `TAIL_WINDOW` 22050, `TAIL_CAP` 882000, `ROOM_SEED_XOR`, `WATER_SEED_XOR`, `MIX_START`, `RANGES`, `PINNED_LP`, `RAMP_STEPPED_BEFORE_USE`, `SHARES_CLEARED_AFTER_FADE_TO_NONE` |
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
2. **During a fade the old instance draws first** in each sample (item 9: "during a fade the old instance draws
   first"), read per sample for the same reason. A check builds the expected fade from two instances stepped by
   hand on one stream.
3. **When the four mix values change.** Item 11 says "setting a room preset overwrites the path's four mix values
   from its header (R2 d)". R2 d puts the overwrite in the routine that sets a preset on a slot, which runs when
   the slot takes the change (at its next block, after any fade). So the values change when the room slot takes
   the preset, not when `setRoom` is called; a spurt that starts in between keeps the old values (a check pins
   this). Setting "none" leaves them as they are (not read; it matters only under the other reading of
   "before").
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
7. **"Made with" means no fade.** `createRoomPath({ room, water })` starts settled, as "a slot made with a preset
   starts with the fade over" and part c's "no fade at the start of a render" ask. `setRoom` and `setWater` after
   that always go through the slot's rule (next block, a fade).
8. **The water slot's 44,100 samples of silence** run on its instance before the path's first sample, drawing from
   the water stream; the slot's own block count starts at the path's first sample.
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

## What in the order or the reports was wrong, or could not be done

- Nothing in the reports or the reference was found wrong: the module and the model agree everywhere the
  reference records, and on every extra case `lines.py` reads from the model.
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
- The constants `RAMP_STEPPED_BEFORE_USE` and `SHARES_CLEARED_AFTER_FADE_TO_NONE` never touch an offline render
  with a fixed room.
- The custom room (99): build an RVA preset from its knobs and pass it as `room`; a cutoff outside the pinned 25 is
  computed with `Math.tan` and shows in `describe()` as `notPinned`.

## For part d's builder

- The live chain: one `createRoomPath` outside the chain; `setRoom` and `setWater` for a change (the engine's 0.2 s
  and 0.1 s fades, taken at the slot's next 512-sample block of its own count); `shares()` per block.
- `path.state()` says what each slot holds now, before, and has been asked for.

## The checks

`node tests/room-dsp.verify.mjs`; in `pnpm test`. Results on the head commit: 122 checks, all pass, in
11 s. By section:

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
- **The amplifier and the modulating delay** (23): the build (4096, 0, 0, 4410, 2457, 3528, no random); the gain
  on every sample of 60,000 (4096 to 4412, 4095 at 4413, 2867 at 6176, 1640 from 7938); the glide (step 730258,
  3529 calls, ends on 1640, never 1639) against the model's ramp sample for sample; firings on 4410, 8821,
  13232; a constant 8000; `MDY`'s build, draws on 22050, 44101, 66152 between 21829 and 22050, its fade (662
  calls, 6, 12, 18 ... 4089, 4095, 4095) and that fade read off sample by sample; AM 5's tone and its 14 hashes;
  preset 14's first 20 and peak; the amplifier of 14 on the tone; threshold 0 with mix 1.
- **Random taps** (2): for 21 modulating cases, every draw of the first 60,000 samples on the model's sample and
  between its bounds; in 10 s, as many draws as one every `period + 1` samples gives.
- **The seeded streams** (2): `seededDraw` is `reference.py`'s `randint_from`; the path's two streams are the
  render's seed XOR `0x524F4F4D` and `0x57415452` (Decision 7).
- **The reference hashes** (12): every line of `reference.out` (85), with its shares; the template case's built
  reverb as `reference.out` prints it; a path under water built by hand from two instances (direct plus the room,
  then the water instance that has run 44,100 zeros first).
- **The tails** (5): all 239 lengths of `tails.out`, through `createRoomPath` and `tailLeft()`; a hand case resting
  at -100 that ends 22,050 samples after the voice (the rule is a band, not a level).
- **Chunking** (1): five paths, each with a fade (a room change, the water fading in, a room under water), in
  pieces of 1, 127, 512, 4096 and seeded random sizes against the whole run: the same samples, the same tail, the
  output as long as the voice and its tail.
- **The slot** (14): the model's 0.2 s and 0.1 s ramps (486957, 973915; 2048 at the 4,411th call; done at
  the 8,821st and 4,411th); every ramp of the module against the model's call by call, those of 0 to 3 samples
  included; a room and a water fade's weight on every sample, lined up as "The slot's ramp" assumes; a change asked
  mid-block taken at the next block; a change asked during a fade taken at the first block after it; a fade to
  none ending on the input bit for bit; 40, 104 and 137 changing nothing (a request dropped by an unknown number);
  a path made with 137 having no room; a slot made with a preset settled; the fade's draw order.
- **Shares and entry** (13): the path's two fade times (4,411 and 8,821 samples); the model's shares for every
  header of the table and seven more; the order's share list, 256/0 and the start-up values; `shares()` of a
  path: 0/256 with no room and while a room is asked, the running spurt's limits kept after a take, the next spurt's from the preset, the shares kept through a fade to
  none and 0/256 after it, at once for a path made with a room, and the four values changed at the take, not at
  the request; `entry`'s nine fixed points; `lines.json`'s 28 and 2 differing samples; every 16-bit sample at 20
  shares against the reference's `entry`; `entry(s, 256) = trunc(s x 255 / 256)` for all 65,536.
- **Refused by name** (6): `FLT`, `CRS`, the three delay kinds (in `DLY` and `MDY`), a tap factor, a duration and a
  fade time, six processors.
- **Loading and speed** (2): as classic scripts in a vm context the two files work together with no
  `setTable`; every preset runs under 2,000 ns a sample (printed: the five heaviest).

## Speed

Node 22.23.4, the module loaded with `require` (not in a vm context), on this machine (4 cores, load about 1.2
from the break runs beside it); the best of three runs over 20 s of input (10 s of noise, 10 s of zeros):

| Case | ns a sample | M samples a second | times real time |
| --- | --- | --- | --- |
| preset 10, the heaviest preset (two all-passes, nine modulated lines) | 136 | 7.3 | 166 |
| preset 25 | 128 | 7.8 | 178 |
| three all-passes and twelve lines (the plan's case: 97 ns there) | 114 | 8.8 | 199 |
| preset 103 | 105 | 9.6 | 217 |
| a room path, 103 and 131 cross-fading without a break | 236 | 4.2 | 96 |
| a room path, 103 under water | 179 | 5.6 | 126 |

The chain is run sample by sample (reading 1), so each processor is a method call per sample; that keeps the
output independent of block sizes. The heaviest case of part d (a fade between two presets) costs about 1% of
real time.

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
