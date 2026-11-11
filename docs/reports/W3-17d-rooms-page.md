# W3-17d: the rooms on the page and in the live chain

The builder's report. The order is `docs/work-orders/W3-17-room-effects.md`, part d ("W3-17d: the page and the live
chain"), with its Decisions, the amendments after part a (2026-11-10) and after Sets K and L (2026-11-11), and "What
moves"; the brief's list of what changed since (the owner's default of no room, `volume` at 1.0, Speex exact against a
32-bit game, the engine codecs' gain on the decoder's own samples) rules where it differs. Branch
`claude/w3-17d-rooms-page`, from `c8a7d61` (main, cache v30). W4-01d, built after it on the same branch, has its own
report: `docs/reports/W4-01d-settings-words.md`.

**Status:** built; every check of part d passes; `pnpm test` and the browser suite pass under the heavy-job lock; CI
passed on the first push (see "Runs"). No golden hash moved and none was recorded. Not yet reviewed.

## Summary

- **The listener position** (`#listener_position`, saved as `pos`) is built from `LISTENER_POSITIONS` (`constants.js`)
  and room-dsp.js's rows, in the order's order: "No room effect (the game's Sound quality: Low)" (`open`,
  `dsp_slow_cpu 1`, `DEFAULT_LISTENER`, chosen first); "Automatic room, as recorded" (`auto_set_c_room`,
  `auto_set_d_street`); "Automatic room: examples by shape" (the 14 `auto_<key>`); "Automatic room: places measured on
  2Fort" (the five `place_<key>`, a group of their own: see "Departures", 2); "A room the map sets by number" (`room_2`
  ... `room_26`, labelled by script and area); "Manual: number or measures below". A line under it says what the
  engine builds for the choice (measures, shape, size class, the pair, the share); a second line, shown whenever a room
  or under water is chosen, says what the recordings show.
- **Manual:** `#env` (`dsp`) 0 to 29 and 99, 1 reading "1: automatic (the map measures the room; give the measures)"
  and showing six fields (`asky`, `aw`, `al`, `ah`, `aopen`, `arefl`) with a line that says what the engine would build
  ("tunnel; size class 2; from presets 114 and 115; 72/256 to the room"; "vertical shaft" when it is one). The console's
  `dsp_room` takes any whole number; one the table does not hold gets an option of its own and the line "dsp_room N:
  the app does not have this room. A render has none; the live monitor keeps the room it had."
- **Listener under water** is a checkbox of its own (`uw`), with no variable.
- **Old links and saved settings:** `hallway`, `small_room`, `tunnel`, `tunnel_big`, `cavern`, `hangar`, `chamber`,
  `metal` become manual with 22, 17, 6, 7, 24, 10, 19, 4; `water` becomes `open` with `uw` on; a full config without
  `uw` (one made before it existed) is not under water. `PRESETS.sewers` is `underwater` (`exec preset_sewers` says
  "preset_sewers is now preset_underwater" and runs it); `PRESETS.spam` takes `auto_tunnel`; the others read
  `DEFAULT_LISTENER`. `ENV_ALIAS` keeps its numbers; `DSP_PRESETS` keeps names only.
- **Every control classified** (item 4; the list is under "Controls"): the game's controls show their variable's
  name, the two PCs' and the app's own do not, and the app's own sit in one fieldset, "Extras: not in the game", which
  holds exactly item 4's third row. The live monitor's low latency moved into it from the live panel.
- **Labels** (item 5): "On (the game's rule)"; "Gain target: mean (0) to peak (1)" with `voice_avggain`; the old "Open
  / Outdoor — dry (0)" is gone. README's rooms paragraph, its mixer line, the live note and the file table are
  rewritten; the Facepunch link stays as where presets 0 to 29 were first taken from.
- **The live chain:** the worker (`live-worker.js`) keeps the room path outside the chain. A change of room or of the
  water alone calls `setRoom` (the engine's 200 ms cross-fade) or `setWater` (the next block, no fade) and does **not**
  rebuild the chain; a rebuild for another setting keeps the path, its lines and its count of blocks. With a room or
  under water the chain's mix stage is the render's room mix (`createRoomMix`: whole 512-sample blocks, 11.6 ms more in
  `stats.latencyMs`, none in `contentDelay`); without, it holds nothing back, as W3-10 left it. A spurt's first delivered
  message (frame) calls `spurtStart()`, the stand-in for a channel's start.
- **The room's cost in the live worker** (great hall during a fade from preset 6, measured in the live worker's own
  scope in headless Chromium on this machine, 4 cores, other agents' jobs queued but not running): **141 ns a sample**
  (median of 40 fades; best 130), against 98 to 109 ns for the great hall alone. At 44.1 kHz that is 6.2 ms a second,
  **0.62% of real time**. The probe inside a running worker gave 168 ns a sample over a whole session, fades included;
  its per-block timer is too coarse (100 µs) to give the fade alone.
- `batch.js` needed no change: it renders with `TF2Audio.process()`, whose samples carry the tail (W3-17c); the browser
  suite now shows a render and its download carrying the tail for each group's first entry.

## Commits

| Commit | What |
| --- | --- |
| `88f9d64` | the page (`index.html`, `style.css`, `app/rooms.js` new, `app/console.js`, `app/core.js`, `app/render.js`), `constants.js`, the live chain (`live-worker.js`, `live.js`, `audio.js`'s `createLiveChain`, `roomPreset`, `roomRequest`), `sw.js` v31, the browser suite's checks |
| `2d38306` | README, `tests/REFERENCE_2026.md` (finding 32, the model table, the lists), `tests/predictions/PREDICTIONS.md` (the dated note) |
| `2b03411` | item 5's two labels (missed in the first commit) and the custom room's help line (the amendment after part a, point 7), with a check |
| (W4-01d's commits) | see its report |
| (this report) | |

## What was built, item by item

1. **Listener position.** `app/rooms.js` (new, loaded after `app/core.js` and before `app/console.js`, cached by
   `sw.js`) builds the options from `LISTENER_POSITIONS` and `TF2Room.roomCase()` (labels, measures, notes) and
   selects `DEFAULT_LISTENER`. `LISTENER_POSITIONS` (`constants.js`) holds, per key, its `group` and the `room` it asks
   of `audio.js` (`null`, `{ auto: key }` or `{ preset: n }`); `ROOM_NUMBERS` the ten numbers and their scripts. The
   lines: `#room-detail` (what the choice builds; for no room "dsp_slow_cpu 1: the game's lowest Sound quality turns
   rooms off. No room is what Set B shows.") and `#room-evidence` (see "The evidence line").
2. **Manual.** `#env` built from `DSP_PRESETS`' names; `#auto-env` with the six measures, shown for 1; `#custom-env`
   (moved into the extras), shown for 99, with the help line the amendment asks for: "The app's own room, not the
   game's. At a high mix its 32-bit sums can wrap, as some of the game's rooms do fully wet." (not guarded). Console:
   `dsp_room` (any whole number), `underwater`, `dsp_slow_cpu` (1 sets no room), `dsp_auto_sky`, `dsp_auto_width`,
   `dsp_auto_length`, `dsp_auto_height`, `dsp_auto_opensides`, `dsp_auto_reflectivity` (the app's names: the game has no
   variable for the measures). Checkboxes are now linked controls of the console (1 or 0).
3. **Saved settings and share links.** `migrateRoomConfig()` in `applyConfig()` (share links, saved presets); the
   console's `listener_position` maps an old key the same way. `CONFIG_FIELDS` gains `uw`, `asky`, `aw`, `al`, `ah`,
   `aopen`, `arefl`; `dsp` takes any whole number.
4. **Every control classified.** See "Controls".
5. **Labels.** As above.
6. **The live chain.** `audio.js`: `createLiveChain` takes `opts.roomPath` and gives `createOutputStage` a room
   `{ path, shares: null, cap: Infinity }` (the path's own shares; a chain never flushes, so the tail rule is not
   asked); `roomHoldSeconds` (511 / 44100 s) is added to the frame chain's `latencyMs` and to the steam chain's
   `holdBack` (so `lowLatencySavingMs` is unchanged); `spurtStarts()` is called by the steam chain where the timeline
   opens a spurt (`!made.silence && msg.spurt` new) and by the frame chain at a spurt's first frame that is neither lost
   nor late (codec bypassed: the first sent frame). `TF2Audio.roomPreset(opts)` is `resolveRoom`'s first half, split
   out unchanged, with `unheld` added (the number asked when the table does not hold it); the worker resolves its room
   with it. `live-worker.js`: the path, made the first time a room or the water is asked (settled if the monitor
   starts so, as `createRoomPath` makes a render's; otherwise empty, then `setRoom`, so the room fades in); dropped at
   a rebuild once it is idle (no room now, before or asked but "none", no fade, no water). A tests-only probe
   (`opts.roomProbe`) wraps the path and logs every call with its inputs and outputs (message `roomprobe`).
   `live.js`: the note says "a change of room cross-fades as the game does"; the low-latency label reads "Live
   monitor: low latency (...)", since it now sits among the extras.
7. **Downloads and `batch.js`:** the tail was already carried (W3-17c); now checked in the browser.

Also: `audio.js`'s `roomRequest` maps a `listenerPos` whose entry names its room to that room (the page's new keys),
so an older caller that passes a new key gets the room; an old key still gives the number it stood for, and the
golden cases that pass `listenerPos: 'tunnel'` and `'water'` keep their hashes.

## The evidence line

The order's sentence: "Room effects follow the game's own code. The two rooms marked 'as recorded' match recordings of
the game in echo times and level. No room has been checked sample for sample yet, and the other shapes are examples."

Today's REFERENCE (finding 32) and the amendment after Sets K and L add two things it does not say, and one thing it
would now mislead about: room 6 has been matched tap by tap against a fully wet lossless take (every tap to 102 ms,
the strong ones to the sample, strengths within a few percent), and the five 2Fort places are measures the game
printed, not examples, and they sit in the same list. Still true: the two recorded rooms match their takes in echo
times and level (Set C +0.0 dB and its echoes; Set D +0.1 dB, its three echoes at their times, one 36% strong), and
no room is checked sample for sample. The page says:

> Room effects follow the game's own code. The two rooms marked "as recorded" match recordings of the game in echo
> times and level, and room 6 matches one echo by echo. The 2Fort places use the measures the game printed there; the
> other shapes are examples. No room has been checked sample for sample yet.

Under water alone, the order's "Read from the game's code; no recording yet." is no longer true (Set K's R5 under
water: dull, no tremolo, 0.77 of the dry level against the module's 0.76). The page says:

> Read from the game's code. One recording under water matches its level (0.77 of the dry voice) and its lack of
> tremolo.

Neither says 0.40 (the amendment's correction).

## Controls

The rule (item 4) applied to the page as W3-16, W3-11b, W3-10 and W3-17c left it:

| Side | Controls on the page |
| --- | --- |
| The game's (name shown) | `codec` (`sv_voicecodec`); `listener_position` and `env` (`dsp_room`; the no-room option names `dsp_slow_cpu 1` in its line); the six measures (no name); `underwater` (no name); `avggain`, `maxgain`, `voice_scale`, `volume`, `loss` (`net_fakeloss`), `jitter` (`net_fakejitter`); `live-ptt` (`+voicerecord`, added to its label) |
| The two PCs' (no name) | `capture_channel` (its `voice_capture_channel` came off the label), `steam_uptime`, `device_rate` (its `snd_device_rate` came off the label), `live-input`, `live-output` |
| Extras (fieldset "Extras: not in the game", no names) | `gain`, `hp`, `lp`, `vad`, `vad_threshold`, `warble_on`, `bits`, `frameMs`, `agc`, `retime`, `c_dur`, `c_dec`, `c_mix`, `live-lowlat`; the Fullband Opus option is marked in itself |

The console keeps every name, the made-up ones included.

**Controls the order does not name**, classified by its rule and left where they are, since none is a setting of the
voice path: `demo-speaker` (whose voice a demo gives: the source), the 🎤 Record and 🎧 Live buttons, `live-record`
and `live-talk` (the live monitor's recording and its on-screen key, part of push-to-talk), `format` (the download's
file format), `reference-file` and `reference-channel` (the real-take comparison), the visualizer's buttons and
`viz-res`, the batch's buttons, the console's input. None shows a variable's name; `mic`'s title says
"(+voicerecord)", which is the game's command it stands for.

The fieldsets: A Sender (the two PCs' sender settings), B Network (was "Codec & network": the codec's switch, bitrate
and packet length went to the extras), C Receiver, D Listener room & output, then the extras.

## Checks

The browser suite (`tests/browser.verify.js`), new sections [Browser 3c4] and [Browser 3f2]:

| Check (the order's) | Result |
| --- | --- |
| each old `pos` value in a share link lands on the new controls as item 3 says | pass: the eight rooms as manual with their numbers, `water` as no room under water; the saved config carries `pos=open`, `uw=1`; a new link keeps its keys |
| a render with each group's first entry plays and downloads with its tail | pass: `open` (no tail), `auto_set_c_room` (84,878 samples of tail at 48 kHz), `auto_closet`, `place_2fort_spawn_room`, `room_2`, manual `dsp_room 1`; each plays, its WAV is the render's samples and the downloaded file is the same bytes |
| the extras fieldset holds exactly item 4's third row, and no control of the first two rows (the list carried by the test, copied from the order) | pass |
| a live room change gives no click: the worker's output across the change equals the module's cross-fade on the same input | pass: the worker at 44.1 kHz with its probe; preset 6, then the great hall (a fade), then none, then a rebuild: 240 of 240 blocks equal to `TF2Room` run by hand on the same calls and inputs (36 fading), and the worker's 122,880 output samples are exactly those sums after `mixOut` |

More, beyond the list: the order and groups of the list and its default; each line under it; the manual number, its
measures and their line; a typed `dsp_room 40`; the custom room; `exec preset_sewers` and Mic Spam; a variable's name
shown only where the game has one (the list carried by the test); item 5's labels; the room's changes do not rebuild
the chain, a rebuild after the fade to none drops the path, and `stats.latencyMs` falls by exactly 511 / 44100 s;
`celt_22` live (the frame path, a 22050 Hz voice): under water on and off, then `dsp_room 40`, which leaves preset 17
in place, block for block against the module by hand, with no rebuild.

Existing checks changed: the labelled-controls list gains the new controls; W3-10's check of the device's label now
asks that `snd_device_rate` is **not** on it (item 4: a setting of the listener's PC); W3-10's volume sentence is the
owner's (W4-01d's report). `tests/room-dsp.verify.mjs` now prints its skip of presets 0 to 29 against `DSP_PRESETS`
(their chains are gone), as W3-17a's report said it would.

**Breaking the code** (a scratch copy of the tracked files, one edit at a time, the named sections run on it under the
lock): see "Breaks".

## Runs

| Run | Result |
| --- | --- |
| `pnpm test` on `88f9d64`'s code (before the commit), under the lock | exit 0, 11 min 10 s: `verify.js` 214, gain 93, `gain-exact` ok, Opus 147, Speex 86, paired reference 42, formats 68, file rate 53, meter 50, video 46, demo 36, **render-stream 520, 0 failed** (no golden hash moved, none recorded), output-stage 102, voice channel 129, Steam sender 109, swresample 43, room 215 (the `DSP_PRESETS` comparison skipped) |
| the browser suite on the same code | exit 0, **270 browser checks passed**, 3 min 34 s |
| CI (`tests`) on `2d38306` | run 43018550369: success |
| `pnpm test:all` on the branch's head (`0faef48`, W4-01d included) | exit 0: vendor builds match, the Node suites as above (render-stream 520, 0 failed), **279 browser checks passed** (W4-01d's report) |

## Departures from the order

1. **`audio.js` is touched** (part d's files do not name it). Item 6 cannot be built otherwise: the live chain's mix
   stage is `createLiveChain` in `audio.js`. Changed: `createLiveChain` takes `opts.roomPath` and its hold; the steam
   and frame chains call `spurtStart()`; `roomPreset` split out of `resolveRoom` (same code) and exported; `roomRequest`
   reads a position's `room`. No render's samples changed (render-stream: 520 checks, every golden hash).
2. **The places have a group of their own**, "Automatic room: places measured on 2Fort", not the tail of "examples by
   shape" as item 1 says ("then any ROOM_PLACES"). The order was written when `ROOM_PLACES` was empty; since W3-17c it
   holds five rows measured by the game, and listing them under "examples" would be untrue.
3. **The evidence line and the under-water line** are rewritten (above), since the order's sentences are no longer
   exactly true.
4. **`LISTENER_POSITIONS` keeps the nine older keys** (marked `legacy`, not offered) beside the new list: the page's
   migration reads their numbers, and `audio.js` maps an older caller's `listenerPos` through them (the golden cases
   with `listenerPos: 'tunnel'` and `'water'` depend on it).
5. **The console's line for an unheld number** is the amendment's ("the app does not have this room"), not item 2's
   "... the room is unchanged, as in the game", which is the engine's behaviour only past its last preset.
6. **A room change does not rebuild the live chain** (the order assumes nothing either way). Rebuilding would restart
   Steam's sender and the gain at every change of room, which the game does not do; the path's cross-fade is then the
   only thing that changes.
7. **The live monitor's low latency moved** from the live panel into the extras fieldset, as item 4's third row puts
   it there; it is hidden with the advanced controls, and its label now starts "Live monitor:".
8. **`tests/predictions/PREDICTIONS.md`** gets the dated note CLAUDE.md asks for when a hashed model file changes
   (`audio.js`, `constants.js`); it is not in part d's files.
9. **The live chain's custom room** uses the path's own shares (`shares()` per block), not the render's override
   `trunc(mix x 256)`: W3-17c's reading 9 found the two equal at every mix from 0.00001 to 1, and the path's follow
   the engine's rule for a change (the limits from the next spurt).

## What is left open

- **A live chain under 44.1 kHz** (a context the browser runs below the mixer's rate) passes the room path's output
  through the sinc resampler, as it does the rest; not checked with a room (the suite's live room runs at 44.1 kHz).
- **`spurtStart()` live is a stand-in**, called when the sender's spurt opens (its first delivered message), before its
  samples reach the mix; with a fixed room it changes nothing (W3-17c, A16). W3-02c brings the channel.
- **A rebuild drops the chain's partial block** (up to 511 mix samples): the path then gets the new chain's first
  block. A rebuild drops the sender's state too, as before.
- **The probe's timer** in a running worker is too coarse for one block; the fade's cost is from the worker's own
  scope (above).
- The old room's `extraLpf` field is gone from `LISTENER_POSITIONS` (W3-17c had removed its use).

## Breaks

Each made in a scratch copy of the branch's tracked files, one at a time; the named section of the browser suite run on
it under the heavy-job lock (a runner in the builder's scratch folder that loads `tests/browser.verify.js`'s own
functions). The unmutated tree passes every section.

| # | Break | Caught by |
| --- | --- | --- |
| M1 | `live-worker.js`: rebuild the chain on a change of room | "the room's changes do not rebuild the chain" (four chains where there should be two). The sample checks still pass: the path is outside the chain, so only this check sees it |
| M2 | `live-worker.js`: `setRoom` never called (the call still logged) | the module by hand: 68 of 394 blocks equal, no fade |
| M3 | `audio.js`: the live chain ignores `opts.roomPath` | 0 blocks reach the path |
| M4 | `audio.js`: the room's hold not counted in `stats.latencyMs` | the latency check (218.46 against 206.88 ms expected; 206.88 both) |
| M5 | `audio.js`: `spurtStart()` never called live | "0 spurt starts" |
| M6 | `live-worker.js`: the idle path never dropped | the rebuild still has the room |
| M7 | `live-worker.js`: a number the table does not hold sets no room | `celt_22`: the room is null, not 17; 172 of 344 blocks |
| M8 | `live-worker.js`: going under water rebuilds the chain | `celt_22`: three spurt starts and a rebuild |
| P1 | `constants.js`: the old `tunnel` stands for 7 | the share links' check (tunnel) |
| P2 | `app/rooms.js`: an old `water` link not under water | the share links' check (water, saved) |
| P3 | `index.html`: mic gain moved out of the extras into Network | the extras fieldset check |
| P4 | `index.html`: the stereo capture's label shows `voice_capture_channel` | "a variable's name only if the game has that variable" |
| P5 | `app/rooms.js`: under water not sent to the render | "under water alone" |
| P6 | `app/rooms.js`: the evidence line always hidden | "under water alone" (and the room line after it) |
| P7 | `constants.js`: `DEFAULT_LISTENER` the Set C room | the first check (the position starts on no room; the presets use it) |
| P8 | `app/rooms.js`: the places' group dropped | the groups check |

W4-01d's breaks are in its report.

## Scan

Over `git diff origin/main...HEAD` and the commit messages: no model name outside the commits' trailer lines, no
personal name, no absolute path of this machine, no SteamID, no recording or take added; every commit by `Claude
<noreply@anthropic.com>` with the two trailer lines. Nothing of the owner's private data was read.
