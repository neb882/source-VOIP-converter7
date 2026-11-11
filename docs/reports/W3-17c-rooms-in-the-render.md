# W3-17c: the room in the render

The builder's report. The order is `docs/work-orders/W3-17-room-effects.md`, part c ("W3-17c: the render"), with its
amendments after part a (2026-11-10) and after Sets K and L (2026-11-11), which rule where they differ from the older
text. Branch `claude/w3-17c-rooms-render`, from `d68a818` (main with W3-10, W3-17a and W3-17b merged).

**Status:** built. Every check of part c passes; `pnpm test`, `pnpm test:vendor` and the browser suite pass under the
heavy-job lock; CI: see "Runs". **No hash of a render with no room moved**: the suite was run on the new code before any
new hash was written, and all 50 cases with no room kept both hashes with the room module absent from the engine; the
one case that moved, "test position with a low-pass", is removed with the stage it tested. No stop-and-report point was
reached: W3-10 as merged is shaped as Decision 3 says, and nothing needed a change to the module or the oracle.

## Summary

- **The render runs the module.** With a room or under water the voice is entered twice at its own rate by W3-10's
  `mixEntry`, at `255 x direct / 256` and `255 x room / 256`, the shares the room path gives at the start of each
  512-sample mixer block; each buffer is upsampled by `mixUpsample2` with states of its own; `createRoomPath().process`
  gives the sum before the clip; W3-10's blocks, `mixOut` and device stage follow unchanged. The path gets whole blocks
  from the render's first mix sample, in `process()` and at any chunking of `createRender`; the stream keeps the voice's
  partial block (up to 511 mix samples). After the voice, zeros run until the path's tail rule holds.
- **No room, not under water: nothing of this order runs.** No path is made, the module is not needed, the output has no
  tail and `codecInfo` has no new key.
- **`createRender` streams a room**: `outputLength` is the length without a tail, the new `maxTail` is the cap at the
  output's rate (960,000 at 48 kHz; 0 with no room), `finish()` gives the tail. It still refuses `retime`, with a room
  or without.
- **Options**: `opts.room` (`{ preset }`, `{ auto }`, `{ custom }`) and `opts.underwater`; the page's `listenerPos`,
  `dspRoom` and `customEnv` are mapped onto them, so no caller breaks.
- **Gone**: `dspDFR`, `dspRVA`, `dspDLY`, `dspAMP`, `dspMDY`, `runDspChain` (and its export), `customChain`, the 0.45
  mix, the comb detuning hash, the old `resolveRoom`, the listener's low-pass (`extraLpf`) in `process()`,
  `createRender` and the live chain, and the float seam it sat in (`toMixInts`, `mixSeam`).
- **Eleven golden room cases** recorded once, in a commit of their own, after every check of them passed: among them a
  model written in the test that rebuilds each render from its own gain output with the module by hand, bit for bit,
  before the clip and at the output, tail included.
- **`ROOM_PLACES`** holds the amendment's five rows on `ctf_2fort`; each builds, through `placeFromDebug` and
  `buildAutomatic`, to the table's shape and to the four mix values the game printed (the tunnel: shape only).
- **The accuracy rows** of Set C name `{ "auto": "set_c_room" }` and Set D's PC A `{ "auto": "set_d_street" }`. Not
  run: no takes here.

## Commits

| Commit | What |
| --- | --- |
| `184276b` | the render: `audio.js`, the loaders (`index.html`, both workers, `sw.js` v28), `tests/render-stream.verify.mjs` (the room cases with no hashes yet, the checks), `tests/verify.js` |
| `4daa498` | the eleven room cases' hashes, alone, with the reason |
| `ca40b00` | `room-dsp.js`: the five `ROOM_PLACES` rows; `tests/room-dsp.verify.mjs`: their checks in place of "starts empty" |
| `fdd693a` | `tests/accuracy.takes.json`: the seven rows' `room` |
| `b926961` | `tests/REFERENCE_2026.md` (the app-today texts) and `tests/predictions/PREDICTIONS.md` (the dated note) |
| `e6e606e` | two more checks, the tail rule holding inside the voice, written for mutations A7 and A8 when planning them (no other check sees either) |
| (this report's commit) | the report; the custom room at its knobs' ends against the room by hand (after mutation A21 passed); the memory check's buffer sized for a tail |

## What was built

**`audio.js`.**
- `createRoomMix(voiceRate, room)`, the mix stage with a room (beside W3-10's `createMixEntry`): per block of 512 mix
  samples (512, 256 or 128 voice samples at 44100, 22050 or 11025 Hz: a voice sample's mix samples never straddle two
  blocks), `path.shares()` at the block's start, the two entries, the two upsamplings, `path.process`, then
  `path.tailLeft()`. `flush()` fills the voice's last block with zeros and runs blocks of zeros until the rule holds,
  then cuts the mix at the sample where it held, or at the voice's own end (N, 2N + 1 or 4N + 3 samples, as W3-10 makes
  it) if the rule held before that. `tail()` is what the mix runs on past the voice's own end.
- `createMixStage(voiceRate, room)` picks it; `createOutputStage({ ..., room })` takes it (the `seam` option is gone)
  and exposes its mix stage as `.mix` for the tail.
- The room section: `roomModule()` (the globals `TF2Room` and `TF2_ROOM_PRESETS`, or an error that names
  `room-dsp.js` and `room-presets.js`), `CUSTOM_ROOM` (the custom room's defaults, 1.5 s, 3, 0.25, as
  `DSP_PRESETS[99]` had them), `customPreset(env)`, `roomRequest(opts)` (the options and the old ones mapped),
  `resolveRoom(opts, seed)` (null for no room, else the path, the custom shares and `codecInfo.room`), `tailAtDevice`.
- `process()`: the room resolved first (so a missing module stops the render before any work), the mix stage with or
  without it, the output `round(n x R / rate) + round(tail x R / 44100)` long, `codecInfo.room`.
- `createRender`: the same stages; a final stage that gives out at most `outputLength` samples before `finish()` and
  holds what the device stage gives past them, then cuts or pads to the length with the tail; `maxTail`.
- The live chain: the listener's low-pass is gone; rooms are still not applied live (W3-17d).

**What `codecInfo.room` holds.** `preset` (a numbered room), or `auto` (the case's key, or null with `measures`) with
`shape`, `shaft`, `classes`, `pair` and `copy`, or `custom` (the knobs as resolved); always `shares` (`{ room, direct }`
of 256), `underwater`, and `tail` in mixer samples. Under water with no room it has no preset, and the shares 0/256.

**The custom room** (dsp_room 99, the app's own) on the engine's processors: a diffusor of two stages (size 1, feedback
0.15), then a plain reverb of five lines from 12 ms to `clamp(duration x 60, 25, 220)` ms, feedback
`clamp(0.001^(0.045 / duration), 0.3, 0.97)`, gain 1.2, the low-pass in the loop at `clamp(9000 / decay, 800, 12000)` Hz
(computed by the module, not pinned): the old `customChain`'s mapping. Its header is `[mix, mix, 0, 0, 0, 0]` and its
shares are the order's `trunc(mix x 256)` and `trunc(256 - mix x 256)` in doubles, not the header's.

**Loading.** `room-presets.js` then `room-dsp.js`, before `audio.js`: `index.html`, `audio-worker.js` and
`live-worker.js`'s `importScripts`, and `sw.js`'s `ASSETS` (cache v28). `tests/verify.js` and
`tests/render-stream.verify.mjs` `require` the two files and hand them to the engine (the vm sandbox's globals, or two
more parameters of the function that loads it in this realm); `render-stream` hands a copy of the module whose
`createRoomPath` records every path made and every `process()` call on it.

**`room-dsp.js`.** Only the five rows (and their two-line comment and a small row helper beside `caseRow`). In units,
with the printed line where the row format has its place (`log`: the printed size, height, reflectivity and sky, and
the four mix values where read), `map: 'ctf_2fort'`, the spot in words, the shape, a note where needed:

| Key | Sky, width x length x height, reflectivity | Printed line | Shape | Four values |
| --- | --- | --- | --- | --- |
| `2fort_spawn_room` | no, 372 x 516 x 240, 0.66 | size (43,31) height 20 refl 0.66 sky 0 | room (size class 2, reflectivity class 2; copy 103; 41/214) | 0.32, 0.8, 80, 0.5 |
| `2fort_spawn_long` | no, 252 x 1140 x 192, 0.66 | size (95,21) height 16 refl 0.66 sky 0 | tunnel (2; copy 115; 72/183) | 0.4, 0.9, 80, 0.7 |
| `2fort_indoor` | no, 708 x 1440 x 180, 0.55 | size (120,59) height 15 refl 0.55 sky 0 | room (4; copy 103; 41/214) | 0.32, 0.8, 80, 0.5 |
| `2fort_tunnel` | no, 168 x 2160 x 192, 0.555 | size (180,14) height 16 refl 0.555 sky 0 | tunnel (3; copy 115) | not read |
| `2fort_pond` | yes, 912 x 1344 x 4800, 0.34 | size (112,76) height 400 refl 0.34 sky 1 | courtyard (4; copy 127; 5/250) | 0.21, 0.8, 95, 0.1 |

Every row built to what the table says on the first try. The pond's printed numbers alone leave the open sides open
(five candidates); its shape line ("OUTSIDE COURTYARD") or its mix values settle them at none, which its note says.

## The control: no hash of a render with no room moved

Run on the new code (the old room code gone, the room in the render) with the suite as it stood on main, before any new
case or hash was written (`node tests/render-stream.verify.mjs`, under the lock; 267 s): **366 checks passed and 6
failed**, and the six were exactly these:

- "test position with a low-pass": its recorded WAV (and so the spec model's comparison), the one case the order removes;
  its gain output and its five streams passed, as they should (the stream and `process()` agree on the new code);
- the four refusals of a room by `createRender` (`listenerPos` tunnel and water, `dspRoom` 6, the custom room at 0.3):
  rooms now stream, and the engine in that run had no room module, so each stopped with the message that names it.

Every other case kept **both** hashes, the WAV's and `codecInfo`'s, among them "steam, dsp_room 1 (no effect)" and
"steam, custom room at mix 0 (no effect)". That run loaded the engine without `TF2Room` or `TF2_ROOM_PRESETS`, so it is
also the order's "the module absent from the sandbox, the render still succeeds" for all 50 no-room cases. The suite now
keeps that as checks: no path made and no `codecInfo.room` in all 51 cases with no room (the 50 and `dsp_room 137`), and
six cases rendered by an engine loaded without the module give their recorded hashes.

## The checks

`node tests/render-stream.verify.mjs` (in `pnpm test`): 479 checks, all pass. The order's checks of part c:

| Check | Where | Result |
| --- | --- | --- |
| A render with no room is bit for bit W3-10's: every `GOLDEN` case keeps both hashes but the low-pass case, removed; the two "no effect" cases are no-room renders and keep theirs; shown before any new hash (above); no slot made, the module absent and the render still succeeding | [1], [3] | pass |
| `mixEntry(s, 255 x share / 256)` equals `TF2Room.entry(s, share)` on all 65,536 samples at shares 256, 229, 26 and 23 | [2b] | pass, 0 differ at each |
| Every `process()` call of the path starts on a block's first sample: `steam` and `celt_22` with preset 6 and a 1 s `speex` with preset 6 (all three voice rates), in `process()` and in the stream at chunk sizes 1, 127 and 4096; every call a whole block at 512 i, `onMixBlock`'s blocks on the same samples (its last short), the stream's samples `process()`'s | [2b] | pass (335, 335 and 200 calls) |
| New golden cases, recorded once: `steam` with preset 6, preset 17, the `tunnel`, `great_hall` and `set_c_room` cases, under water, under water with preset 6, the custom room at mix 0.3; `celt_22` with preset 6; a room with loss and jitter (`listenerPos` tunnel, which is preset 6, 15%, 50 ms); `dspRoom 137` (no room) | [1] | pass; 137's hashes equal those of the same render with `dsp_room 0` |
| Each streams equal to `process()` at the file's chunk plans | [2] | pass, two plans each (below) |
| The room path equals the module run by hand on the render's own 16-bit voice, before the clip, tail length included: for every room case (the order names three: preset 6, the tunnel, `celt_22` with preset 6) | [1b] | pass |
| A full-scale square through preset 6: the sum passes 32767 and is clipped there; the direct part alone tops out at `entry(32767, 229)` = 29196 | [2b] | pass: direct 29196, the sum up to 33256, 407 samples past the clip, every output the clipped sum |
| `tests/verify.js` [7]: every preset 2 to 29 and every named case renders, ends under the cap, no sample past the clip | `verify.js` [7] | pass: 49 rooms (28 presets, the 16 named cases, the 5 places), the longest tail 221,880 mix samples |
| `pnpm test`, the browser suite, CI; `sw.js` cache up | | see "Runs"; v28 |

More of this order's, beyond the list:

- **[1b], the room by hand for every room case** at the output too: the spec model of W3-10 (written in the test from
  that order's text) now also builds a room render from the case's gain output with the module alone: the two entries
  in single precision, its own upsampler per buffer, `createRoomPath` with the case's room, water and the render's seed,
  zeros until the rule holds, the cut, then W3-10's clip, volume and device stage, and the length with the tail. 61
  renders, bit for bit. Nothing of `audio.js` is used in it.
- **[1], what the cases say they are**: `codecInfo.room` of each (preset 6 and 17 at 26/229, the custom room at 76/179
  with its knobs, the tunnel at 72/183 and size class 2, the great hall at 41/214 and size class 4, `set_c_room` a room
  of size class 2 and reflectivity class 3 from 102 and 103, under water at 0/256 with no preset, under water with
  preset 6 at 26/229); one path per room render, with the render's seed and the water as asked; each tail under the cap
  and the output that much longer at 48 kHz; the gain output of every `steam` room case without loss equal to that of
  the same source with no room (the room is after the mix point).
- **[2b], where the tail rule holds inside the voice**: a voice ending in 3 s of silence has no tail and the source's
  length; a voice with 3 s of silence in its middle and a tone after it has the tail of its end. Both against the room
  by hand. Written for mutations A7 and A8, which no other check sees (no golden case pauses long enough). And the custom room at its knobs' ends (duration 0.05 and
  6, decay 0.5 and 8, where the old mapping's clamps act) against the room by hand, added after mutation A21.
- **[3]**: `createRender` refuses `retime` alone and with a room; `outputLength` and `maxTail` with a room and without;
  the old options render as the new ones (`listenerPos` water as `underwater`, tunnel and `dspRoom` 6 as preset 6, a
  string `dspRoom` "17", the custom room with and without knobs, `dsp_room 1`, presets 0 and 1, a custom mix of 0.003,
  40 and 104 as no room, a case's key as its measures); with the module absent a room, under water and `dspRoom 137`
  stop with a message naming both files, in `process()` and `createRender`.
- `tests/verify.js` [8]: the custom room adds a tail and changes the output, its shares at mix 0.6 are 153/102, mix 0 is
  no room, its knobs at both ends fully wet stay finite and within the clip; under water has a tail, 0/256 and a lower
  level (−2.2 dB on a 440 Hz tone; a loose bound, 0.1 to 0.9, not a measured figure). [10]'s "an empty source through a
  room renders the same silent tail with every profile" passes unchanged: 24,000 samples at 48 kHz (below).
- `tests/room-dsp.verify.mjs`: the rows (key, measures, shape, printed line, map, spot, label, frozen, found by
  `roomCase`) and, per row, the printed line through `placeFromDebug` (with the shape line) giving the row's measures and
  shape, and `buildAutomatic` building that shape with the game's four values (the tunnel: shape only). 216 checks.

**The room cases' chunk plans.** Two each from the file's plans: preset 6 uneven and 960; preset 17 12345 and 7; tunnel
uneven and one second; great hall 960 and whole; `set_c_room` uneven and 12345; under water uneven and 7; under water
with preset 6 960 and one second; custom uneven and 12345; `celt_22` uneven and 960; loss and jitter uneven and 12345;
137 uneven and 960. Not all of `STEAM_PLANS` (four more each): what is new here sits after the gain, which the existing
cases stream at every plan; the blocks check adds 1, 127 and 4096 for three of them.

## Mutations

Each made in a scratch copy of the tree (one at a time, `git ls-files` of the branch), the named suite run on it with
`TF2_DIR` pointing at the copy, under the heavy-job lock. To keep a run near a minute, `render-stream` ran with its case
list cut to the eleven room cases and the twelve no-room cases its checks name, and with the block "the cases exercise
what their names say" (which names cases left out) skipped; every other check ran as committed. The unmutated copy, run
the same way, failed only "every recorded render is a case of the matrix" (the cut list), which is left out below.
"Checks failed" counts the rest. The runner and the logs are in the builder's scratch folder.

| # | Mutation | Checks failed | Caught by (the most pointed first) |
| --- | --- | --- | --- |
| A1 | nothing held for a block: the path given each push's samples as they come (W3-10's way, no room) | 12 | the blocks check at chunks of 1, 127, 4096 and in `process()` for all three voice rates (each call a whole block from a block's first sample) |
| A2 | one upsampler state for both buffers (the sum's upsampling; W3-10's "upsampling the sum of two buffers") | 3 | `celt_22` with preset 6: the room by hand before the clip and at the output; its hash |
| A3 | a clip on the room path's sum inside the mix stage, before the blocks (W3-10's "a clip before the sum", in the form this design can have) | 11 | the room by hand before the clip, every room case; the square wave (the sum must pass 32767) |
| A4 | the two shares swapped at the entry | 30 | every room case's hash, the room by hand, the square wave's 29196 |
| A4b | the entry at `share`, the 255 left out (`255 x share / 256`) | 33 | the same |
| A5 | the tail not cut where the rule held (the last block whole) | 19 | the room by hand before the clip (tail and length), the hashes, the lengths |
| A6 | the tail one sample long | 31 | the hashes, the room by hand, the stream lengths |
| A7 | the rule's hold not started over by a later voice sample | 1 | "preset 6 on a tone, 3 s of silence, a tone" only: **every other check passes on it**. That check and A8's were written for these two before the batch ran (`e6e606e`), since no golden case has a pause long enough for the rule to hold |
| A8 | the mix ended where the rule held even before the voice's end | 1 | "preset 6 on a tone, then 3 s of silence" only (added with A7's) |
| A9 | the custom room's shares rounded, not truncated | 4 | the custom case's hash and by-hand model; `codecInfo.room`'s 76/179 |
| A10 | `{ preset: 1 }` a room (the table's preset 1, a NULL processor, at 26/229) | 5 | "dsp_room 1 (no effect)"'s recorded hashes and spec model; "no room path made" in the no-room cases; `{room:{preset:1}}` renders as no room |
| A11 | `listenerPos` water as preset 14 on the room, not under water | 1 | `{listenerPos:"water"}` renders as `{underwater:true}` |
| A12 | a room render's samples past `outputLength` given out before `finish()` | 12 | the stream checks (`streamed` asserts at most `outputLength` before `finish()`) |
| A13 | `maxTail` 0 with a room | 20 | every room stream of [2] (its buffer too short); the suite then stops at [2b]'s first stream, before [3]'s `maxTail` check |
| A14 | the room path seeded 0, not with the render's seed | 10 | the hashes of the cases that draw (preset 17, under water), the room by hand, "one room path, the render's seed" |
| A15 | the tail's length at the device's rate by `floor` | 12 | the hashes and the length checks of the cases whose tail's fraction is .5 or more |
| A16 | no `spurtStart()` at the render's start | 0 | **none, and none can be**: `shares()` fixes the limits from the same four values when no spurt has started (reading 11) |
| A17 | the room set after the path is made (a 0.2 s fade from none at the start) | 26 | the hashes, the room by hand |
| A18 | under water not passed to the path | 7 | the two under-water hashes and by-hand models; "under water as asked" |
| A19 | a path made for a render with no room and not under water | 31 | every no-room case's `codecInfo` hash (a `room` key), "no room path made" |
| A20 | a number the table does not hold falls back to preset 6 | 6 | `dsp_room 137`'s hashes, "renders as no room", "no room path made"; 40 and 104 as no room |
| A21 | the custom room's longest line not clamped to 25 to 220 ms | 0, then 2 | **missed at first** (the knobs tested sat inside the clamp). Caught after the check of the custom room at its knobs' ends against the room by hand was added (this report's commit) |
| R1 | `room-dsp.js`: `2fort_spawn_room`'s width 372 made 373 | 2 | the rows' check; the row's `placeFromDebug` check (its measures) |
| R2 | the pond's printed mix 0.21 made 0.22 | 1 | the rows' check |
| R3 | the tunnel row's shape written `room` | 1 | the rows' check |
| R4 | `2fort_indoor`'s printed length 120 made 119 | 1 | the rows' check |
| V1 | `verify.js`: preset 22 refused as not held | 1 | [7] "49 rooms ... render" |
| V2 | `verify.js`: under water never runs the water preset | 1 | [8] "under water: a tail, ... the voice lower than dry" |

Not made: the loaders. Dropping `room-dsp.js` from `audio-worker.js` or `index.html` would fail no committed check (see
"What was not done"); dropping it from `sw.js`'s list is the browser suite's 4b (the page's linked scripts must all be
cached on a first visit), which was not run as a mutation.


## Runs

On the final code (the commits up to `e6e606e`; this report's commit adds only a check to
`tests/render-stream.verify.mjs` and the memory check's buffer, and render-stream was run again on it), each under the
heavy-job lock, one after another:

| Run | Result |
| --- | --- |
| `pnpm test` | exit 0, 638 s: `verify.js` 214, gain 69, `gain-exact --synthetic` ok, Opus 147, Speex 71, paired reference 42, formats 68, file rate 53, meter 50, video 46, demo 36, render-stream 477, output-stage 102, voice channel 129, Steam sender 109, swresample 43, room 216 |
| `pnpm test:vendor` | exit 0: the Opus runtime, libopus 1.1.5, CELT 0.11 and Speex 1.0.2 builds match their recorded hashes |
| The browser suite (`node tests/browser.verify.js`, the installed Chromium) | exit 0, 246 checks |
| `node tests/render-stream.verify.mjs` on this report's commit | exit 0, 479 checks, 268 s |
| Mutations | 30 runs (29 mutations and the unmutated copy), then A21 again with the new check: all caught but A16, which cannot be |

CI (`tests`, which runs `pnpm test:all`) on this branch:

| Run | Commit | Result |
| --- | --- | --- |
| 42945719601 | `e6e606e` | success |
| (in the hand-back) | this report's commit | a run cannot be written into the commit it runs on |

## Scan

Over the branch's diff from `d68a818` and this report: no model name outside the commits' trailers; no absolute path of
this machine (the scratch folder is named only as "the builder's scratch folder"); every commit by
`Claude <noreply@anthropic.com>`, its message ending with the two trailer lines; no recording, take or `.wav` added; no
engine source read or added; nothing downloaded. Every file changed is in part c's "Files" or the two the amendment
adds (`room-dsp.js`, `tests/room-dsp.verify.mjs`), with the loaders' one line each.

## Every reader of `outputLength`, and what it does with a tail

| Reader | What it does |
| --- | --- |
| `app/` (`render.js`, `source.js`, `meter.js`, `realtake.js`, `visualizer.js`) | none reads it: the page renders with `TF2Audio.process()` in `audio-worker.js`, whose samples carry the tail; the player, the meter, the downloads and the video take the render's samples and rate as they are, so a tail is played, metered and downloaded (W3-17d's item 7 says the downloads carry it) |
| `batch.js` | none: `TF2Audio.process()` per file, the WAV from the result, tail included |
| `audio-worker.js`, `live-worker.js` | none (the live chain has no tail and no room yet) |
| `tests/render-stream.verify.mjs` | `streamed()` makes one buffer of `outputLength + maxTail` and checks that no more than `outputLength` come before `finish()`; `--memory` the same (its render has no room, so `maxTail` is 0); [3] checks `outputLength` against `process()` (no room) and with a room |
| `tests/output-stage.verify.mjs` | the length checks, with no room: unchanged |
| `docs/work-orders/W2-03-long-render-page.md` | not built; its note already says the worker's buffer needs the tail's cap: that is `maxTail` |

## Time

`pnpm test` on this machine, with another agent's jobs sharing it (so wall-clock figures move by several seconds
between runs):

| Suite | main (`d68a818`) | this branch | change |
| --- | --- | --- | --- |
| `tests/render-stream.verify.mjs` | 261.5 s (CPU 283.4) | 271.2 s (CPU 296.1) | +9.7 s |
| `tests/verify.js` | 221.6 s (CPU 228.0) | 216.6 s (CPU 221.9) | −5.0 s (the old float processors were slower than the module) |
| `tests/room-dsp.verify.mjs` | 11.2 s | 10.9 s | none |

Each pair back to back under the lock, one run each. So the new room cases and their checks add about 10 s to
`render-stream` (about 13 s, less the 3 s of the removed low-pass case and its five streams), under the order's 30 s; with
`verify.js`'s gain, `pnpm test` is about 5 s longer. No `test:room` script was needed. The whole `pnpm test` on the
branch: 638 s wall (CPU 640 s). The final commit added one more check of two short renders (under a second) after these
figures.

## Readings of the order

1. **The output's length with a tail** is `outputLength + round(tail x R / 44100)`, `tail` the mix samples past the
   voice's own mix (N, 2N + 1 or 4N + 3); the device stage's output for the whole mix is cut or padded to it. This is
   W3-10's length rule (the source's duration at the device's rate) with the tail added at that rate, as W3-10's
   `process()` added the old room's. "Then the device stage's own length rule" is read that way.
2. **When the tail rule held inside the voice** (a voice ending in a silence longer than the room's ringing), there is no
   tail: the mix ends at the voice's own end, never before. A voice sample starts the rule over (the module's), so only
   the hold after the last one counts.
3. **An empty source with a room** gives the path zeros from the start, and the rule holds after 22,050 of them: 24,000
   samples of silence at 48 kHz, the same with every profile. `tests/verify.js` [10] already asked for that "silent
   tail" and passes unchanged. The other reading (an empty output) would have changed that check.
4. **`maxTail` with no room is 0**: there is no tail. With a room or under water it is `round(882,000 x R / 44100)`.
5. **The path is given whole blocks only**: the voice's last block is filled with zeros, which are the tail's first
   samples anyway, and the output is cut afterwards. So `onMixBlock`'s last block is short and the path may have run
   one block past the end (when the voice ends on a block's edge and the rule had already held). "The last block of a
   render may be short" is read as the mix's last block, not the path's last call.
6. **A room render holds back** the device's samples past `outputLength` until `finish()`: the final length is known
   only then, and a sample given out cannot be taken back.
7. **`{ preset: n }`** is any whole number the table holds other than 0 and 1: presets 2 to 29 and the automatic room's
   templates (102, 103, ...), which the engine's `dsp_room` would also reach. The order's "2 to 29" is read as what the
   page offers. A number the table does not hold is no room (Decision 11 and the amendment's point 6).
8. **Deciding that a number is not held needs the table**, so `dspRoom 137` with the module absent stops and names the
   two files rather than rendering dry. "Runs without it when no room is asked for" is read as no room setting at all,
   0, 1, a custom mix that truncates to 0, and a position with preset 0.
9. **The custom room's shares** are computed in doubles as the order writes them, and override the path's. The path's,
   from the header `[mix, mix, 0, 0, 0, 0]` in single precision, agree with them at every mix from 0.00001 to 1 in
   steps of 0.00001 (a sweep of mine), so the override is the order's text more than a difference. `path.shares()` is
   still asked at every block, so the block's update runs in the engine's order.
10. **`opts.room` wins** whenever it is given (null included); otherwise `listenerPos` (a key of
    `LISTENER_POSITIONS`, by `Object.hasOwn`), otherwise `dspRoom` (a number or a numeric string). Under water is
    `opts.underwater`, or the position `water`. The custom room's defaults (1.5, 3, 0.25) live in `audio.js` as
    `CUSTOM_ROOM`, since W3-17d strips `DSP_PRESETS` to names.
11. **`spurtStart()` is called once, as the path is made**, and the shares for `codecInfo.room` are read then: the same
    call the first block makes (the module's update is once per block). Leaving it out changes nothing, since
    `shares()` fixes the limits itself when no spurt has started (mutation A16).
12. **The live chain** loses the listener's low-pass (item 7 names it) and gains nothing: rooms and under water live are
    W3-17d's.
13. **`codecInfo.room` carries copies** of the build's classes, pair and measures, not the module's frozen objects.

## What was not done, or is left open

- **The accuracy table** on the takes: not run, no takes here. Read from `tests/accuracy.mjs` (not changed: it is not
  in this order's files): `measureInPage` compares a take with its render only up to `min(render, aligned take,
  overlap)`, the aligned take being the source's length, so the tail is outside the comparison already. The render
  used as the alignment guide (`guide`, the same render when the take has no loss) is longer by its tail, and is handed
  to `TF2Reference.track`; whether that changes the alignment was not tried. If it does, the cut belongs in
  `accuracy.mjs`.
- **No committed check loads the module through the page or its worker.** The browser suite renders no room (its
  render uses the default position), so dropping `room-dsp.js` from `audio-worker.js`'s `importScripts` would pass every
  suite; `tests/browser.verify.js` is not in this order's files. One scratch run of my own (Playwright, the page served
  from the worktree): on the page and in `audio-worker.js`, `listenerPos: 'tunnel'` rendered preset 6 with the same
  samples and `codecInfo.room` (96,542 samples, a tail of 44,598). W3-17d's browser checks render a room per group and
  would close this.
- **Finding 32's under-water bullet** still ends "No take was made under water"; the same finding's dated paragraph of
  2026-11-11 gives Set K's take. Not changed: it is the game's side of the finding, the orchestrator's.
- The page, the live chain, README: W3-17d.
