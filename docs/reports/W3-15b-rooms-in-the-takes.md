# Dry takes: why some recordings show no room, and what the engine does for a voice

An investigation, 2026-11-10. No app code changed. Numbers only from the private recordings. Nothing of the
game's files is reproduced: words, formulas and addresses only. `engine.dll` and `GameUI.dll` are the owner's
(image base `0x180000000`), read as data, never executed. No leaked source was looked for or used.
Marks: **[measured: set]**, **[read: address]**, **[inferred]**.

## The short answer

The contradiction rests on a wrong premise. **The takes are not all dry.**

| Takes | What they show | Mark |
| --- | --- | --- |
| Set B (five takes) | Dry. Direct level 255/256 exactly. No echo. | measured |
| Set C (six takes) | **A room reverb on every take.** It is the automatic "room" preset, size class 2: room share 41/256, direct 214/256. | measured |
| Set D, PC A (own voice, loopback) | **A street preset.** Echoes at 68.0, 120.0 and 308.0 ms. Room share 23/256, direct 232/256. | measured |
| Set D, PC B (hearing PC A) | Two weak echoes, 88.2 and 140.2 ms. A room is active; which one is not settled. | measured |
| Sets A, E, F | No echo found. The test is weaker on music and low tones. | measured |

So both reads of the engine are right, and the takes confirm them. One's own voice under `voice_loopback` gets
the room split like any other voice (Sets C and D-A are loopback takes). What needs explaining is only why
Set B is dry. The most likely reason is a setting: `dsp_slow_cpu 1`, which the game's own "Sound quality: Low"
menu option sets. Section 4 ranks the reasons and gives the console lines that decide it.

## 1. The recordings

### 1.1 What was looked at

- 17 output-device takes: Set A (one MP3), Set B (5), Set C (6), Set D (2), Set E (1), Set F (2). All are
  48000 Hz stereo. All but the MP3 hold 16-bit samples. [measured]
- Sets G, H, I, J are `voice_recordtofile` files. They tap before the mixer and can show no room. Not used.
- **No take is silent between spurts.** Every take carries the game's ambience, in stereo. So "exactly silent
  when nothing plays" does not hold, and a tail has to be found under that ambience. [measured: all sets]
- The noise floor, as the quietest tenth of 20 ms blocks, against the take's ceiling [measured]:

  | Takes | Whole band | Above 300 Hz |
  | --- | --- | --- |
  | Set B | -33 to -36 dB | -39 to -44 dB |
  | Set C | -35 to -37 dB | -41 to -44 dB |
  | Set D, PC A | -24.7 dB | -44.6 dB |
  | Set D, PC B | -25.8 dB | -43.4 dB |

- The voice is the same in both channels and the room slot is mono (W3-15), so the left-right difference holds
  ambience only. Its rms is 51 to 66 units of 4915 in Sets B and C, 55 on PC A and 147 on PC B in Set D.
  [measured]

### 1.2 The methods

1. **Echo after a stop.** After each sharp end of a noise-like sound, the 200 ms that follow are compared with
   the sound before, lag by lag (a regression of the gap on the earlier sound, above 300 Hz). An echo at lag L
   shows as a peak at L. Lags under 31 ms are not usable: the test signal's own short-time likeness fills them.
2. **The same on a model.** The engine model of W3-17 (`dspmodel.py`) built twelve automatic rooms. Each was
   applied to the take itself, with the output conversion to 48000 Hz, and the same statistic taken. That gives
   what each room would show on that very take, in units of the statistic's own scatter.
3. **Autocorrelation** over the noise-like stretches, and **cepstrum** over the whole take, for takes with no
   sharp stops.
4. **Level** from the clipped 1 kHz tone: the samples at the middle of each top and bottom plateau, phase-locked.

### 1.3 Tails and echoes, take by take [measured]

"Scatters" are multiples of the statistic's own noise. Lags are given in ms; at 44100 Hz in samples.

| Take | Result |
| --- | --- |
| Set B default | No peak beyond 31 ms up to 540 ms above 8 scatters. Gap level after a stop, against the sound before: -30.2 dB (10 to 40 ms), -37.1, -36.5, -36.9 dB (40 to 400 ms). The floor is -36.1 dB. **No tail.** |
| Set B `voice_avggain 0.25` | The same: -32.0, -37.5, -37.8, -37.6 dB; floor -37.2 dB. No peak. |
| Set B `voice_scale 0.5` | No echo. Lines at multiples of 2.9 ms are the gain's 128-sample blocks, not a room. |
| Set B `voice_maxgain 1`, speech | No echo found (cepstrum; few usable stops). |
| **Set C, all six** | **A peak at 57.96 ms**, 158 to 245 scatters in the cepstrum, 0.234 in the autocorrelation. Smaller ones at 32.0, 39.0, 45.0 ms (negative) and 71.0, 76.9, 83.9, 105.2, 119.2, 134.2, 148.2 ms. The played signal has none of them. |
| **Set D, PC A** | Peaks at **68.02 ms** (0.023, 35 scatters), **120.04 ms** (0.012), 136.08 ms (0.008), 204.2 ms, **308.02 ms** (0.008). Present after every one of six stops. Gap level -28.0, -30.8, -34.2, -37.0 dB against a floor of -37.0 dB: a tail 6 dB over the floor at 40 to 100 ms, gone by 200 ms. |
| **Set D, PC B** | Peaks at **88.21 ms** (0.010, 14 scatters) and **140.23 ms** (0.005 to 0.006, 8 scatters). Present after each of five stops. No tail above its floor. |
| Set A (MP3), Set E | No echo of the Set C or Set D kinds. Music hides weak echoes. |
| Set F (both) | None of the rooms tried. A line at 94.7 ms and its multiples, equal in both takes, is not explained; the low tones' own harmonics are the likely cause. [inferred] |

What each room would have shown on the Set B default take (method 2) [measured on the take, with the model]:

| Room (room share / direct) | Gap level 40 to 100 ms | Strongest change of the statistic |
| --- | --- | --- |
| none, as measured | -37.1 dB | - |
| small room 38/217 | -25.8 dB | 100 scatters at 30.0 ms |
| room, size class 2 or 3, 41/214 | -15 dB | 520 scatters at 57.96 ms |
| tunnel 72/183 | -13.7 dB | 810 scatters |
| hall 38/217, duct 51/204 | -30.0, -22.3 dB | 177, 143 scatters |
| street 23/232, alley 24/231 | -30.7, -28.8 dB | 50, 76 scatters |
| courtyard 5/250 | -35.7 dB | 17 scatters at its one echo |
| open space 5/250 | -35.5 dB | 3 scatters: **cannot be seen** |

So Set B excludes every room but two: an open-space preset (by the echo test alone) and a courtyard whose echo
is shorter than 31 ms. The level, next, excludes open space.

### 1.4 Which presets the takes show

- **Set C: the automatic "room" preset, size class 2** (built from the file's preset 103: a diffusor of three
  stages, then ten combs). The diffusor's three delays are 573, 837 and 1146 samples: 2556 samples, 57.96 ms.
  The negative peaks at 32, 39 and 45 ms are the pairs of those delays. Applied to the played signal, the model
  gives 0.232 at 57.96 ms; the take has 0.2335. The whole pattern from 31 to 540 ms correlates 0.89 to 0.90
  with the model's (0.72 for size class 3 or 4). Header 0.32, 0.8, 80, 0.5: **room 41/256, direct 214/256**.
  [measured against the model; the header read by W3-15]
- **Set D, PC A: the street preset, width class 3, length class 3.** The engine's rule gives a comb at
  50 + 50 x (3/5)^2 = 68 ms, a single echo at 120 ms and one at 200 + 300 x (3/5)^2 = 308 ms. The take has
  68.02, 120.04 and 308.02 ms, and the comb's repeats at 136 and 204 ms. Correlation with the model 0.62; no
  other shape reaches 0.2. Header 0.3, 0.8, 75, 0.3: **room 23/256, direct 232/256**. [measured; inferred that
  the shape is "street" or "open street", which share the preset]
- **Set D, PC B: not settled.** A courtyard preset has one echo at (measured length)/6 ms: 88.2 ms is a length
  of 529 units, and its strength (0.010) is what the model's courtyard gives (0.008). But 140.2 ms does not
  belong to that. It is 841/6: a courtyard 529 by 841 units would give both numbers if the width set an echo
  too, which the read says it does not for this kind of delay. [inferred, open] Either way a preset was active
  on PC B, with a room share that the echo strengths put near 5/256.

### 1.5 Level [measured]

`volume` is known from each take itself: the ceiling is round(32767 x `volume`). 4915 means `volume` between
0.14998 and 0.15001; 3604 on PC B means 0.10997 to 0.11001. So the level is known independently of `volume`
wherever a take reaches its ceiling. All takes with a ceiling of 4915 do; Set F's `voice_maxgain 1` take and
Set E do not show it (largest samples 3010 and 5095).

**The plateaus are not flat.** The ambience rides on them (about 75 to 80 units rms in Set B, 233 in Set D).
A top plateau reads 4896 plus ambience, cut at 4915. So the level comes from the median of plateau samples,
and from the share of them at the ceiling.

| Take | Plateau, top and bottom (median) | Share at the ceiling | Level against the ceiling | Share of 256 |
| --- | --- | --- | --- | --- |
| Set B default | 4895 to 4896, -4895 | 0.40 | 0.9960 | **255** (255/256 is 0.99609 and predicts 4895.85) |
| Set B `voice_avggain 0.25` | 4895, -4895 to -4897 | 0.39 to 0.40 | 0.9960 | **255** |
| Set D, PC A | at the ceiling both ways | 0.66 | above 1 | not separable, see below |
| the others | no clipped steady tone | - | - | - |

- For Set B the measure is good to about 1.5 units of 4915, 0.03%. The ambience measured in the quiet parts
  predicts a share at the ceiling of 0.40 for a plateau at 4896; the take has 0.39 to 0.40. A direct share of
  250/256 would put the plateau at 4781. **Set B is at 255/256, as W3-07 said, and now to four digits.**
- **A level test alone cannot show a room.** Most automatic presets pass their input straight through, so the
  room path adds a copy to the direct sound. Sum of direct share and passed-through room share, of 256
  [computed from the model]: small room 256.3, hall 256.7, duct 273, courtyard 256.0, street 252.7,
  alley 252.6. Only presets that open with a diffusor show the drop: room of size class 2 and up 213.8,
  tunnel 185, open space 250.
- A steady 1 kHz tone is worse still: every delay of these presets is a whole number of ms, so the echoes
  add in phase. The street preset raises a 1 kHz tone by 2 to 6% (model). **Measured: PC A's unclipped
  1 kHz steps in Set D are 3.1 to 3.3% above Set B's** (0.3251 against 0.3155 at -30 dBFS; 0.6675 against 0.6469
  at -24 dBFS). W3-07 read that as "within 1% of the full level, the codec's 3%". It was the room.
- Set C: the model's room at 41/214 lowers the voice's energy by 1.20 dB. The accuracy table
  (`results-w305.json`) has an anchor level of 1.09 to 1.33 dB for the four Set C takes with a clean anchor
  (-0.8 and -1.7 dB for the two with heavy loss), against 0.08 to 0.12 dB for Set B, 0.15 dB for Set D PC A,
  0.22 dB for PC B. [measured in the table; inferred that the anchor's sign is "model minus take"]
- The accuracy table keeps no sample-level residue, only half-second levels. So "a residue in the silences"
  was measured here directly (1.3): none in Set B, a tail in Set D PC A, a continuous reverb in Set C.

### 1.6 PC B's `voice_scale 0.77` and a room share

Worked from W3-07's three observables (loud plateau 0.724, quiet steps, block-rate sidebands) with the gain
ramp taken as a fixed share of the way from scale^2 to scale. [inferred, rough]

| Direct share | Scale that keeps the loud plateau | Sidebands, against -32.1 dB predicted at 0.77 | Verdict |
| --- | --- | --- | --- |
| 255/256 | 0.77 | 0 dB | fits (measured -32.3 to -33.1 dB) |
| 250/256 | 0.78 | -0.4 dB | fits as well |
| 229 to 232/256 | 0.81 | -1.9 dB | 1 to 2 dB off: unlikely |
| 217/256 or less | 0.84 or more | -3.4 dB or more | excluded |

So a room share can hide at most 0.01 of the 0.77. And for the courtyard kind the passed-through copy restores
the level (256.0 of 256), so nothing is hidden at all. **0.77 stands.**

### 1.7 Console text in the sets [measured]

- Set H's log names the map: `ctf_2fort`, a local server with 1 player of 24.
- Set D's demo is `ctf_2fort` (REFERENCE's table).
- Set G's second run prints a navigation mesh of 1137 areas; no map name.
- No log prints `dsp_room`, `dsp_automatic`, a soundscape's name or an `adsp` line. No log prints a sound
  device or a sound quality setting. The three screenshots show voice options and the voice variables only.

## 2. The engine

### 2a. How a voice channel is started, and what could make it dry

- Start (W3-17, read `0x18005b960`): volume 1.0, pitch 100, sound level 60 dB, entity channel 8 + the voice
  channel's index, no flags, and as its source **the listener's own view entity**. This is so for every voice,
  another player's and one's own alike. Only "proximity" voice uses the talker's entity, at 80 dB.
- The name is `?VoiceSfx`. It carries no `#` (the dry-buffer mark, `0x18002dc10`, W3-07) and no `>`.
- **The spatialiser sets the room mix to zero in two cases only** [read: `0x180029d54` to `0x180029dbe`]:
  `dsp_off` is set, or the sound's name mark is `>`. There is no test for a voice, none for the source being
  the listener, none for an unspatialised sound, none for distance zero. Otherwise the mix is the formula of
  W3-15 on the channel's stored limits.
- **"The listener's own sound"** [read: `0x1800294ce` to `0x18002950a`]: the channel's source number is
  compared with -2, or with the view entity's number, which the engine asks of its own sound-services object
  (the same object gives the driver its clock). A second call asks a tools-mode flag. It is not a test inside
  `client.dll`. The result places the source 12 units from the listener and feeds the pan rule (W3-07). It does
  not touch the room mix.
- The mixer sets the mix to zero when `dsp_off` is set or the room slot in use holds no preset now and before
  [read: `0x180038860`, `0x180041fb0` by W3-17].
- **Measured confirmation:** Sets C and D-A are the speaker's own voice under `voice_loopback`, and both carry
  the room at the strength the headers give. **No exemption exists for a voice or for one's own voice.**

### 2b. The split with an automatic preset, and what "active" means

- The four mix variables are overwritten from the preset's header whenever a preset is put on the room slot
  **or the automatic slot** (W3-17, read `0x1800388c0`). Set C confirms it for the automatic slot: the echo
  strength fits 41/214 (0.232 predicted, 0.2335 measured), not the start-up 26/229.
- One voice sample, traced with the read formulas (channel volume 255; room volume 255 x room/256; direct
  volume 255 x direct/256; each product truncated) [computed]:

  | Case | Sample 16384: room buffer, direct buffer | Sample 32767 |
  | --- | --- | --- |
  | no preset | 0, 16320 | 0, 32639 |
  | room, size class 2 (Set C), 41/214 | **2613, 13642** | 5227, 27284 |
  | street (Set D, PC A), 23/232 | **1466, 14790** | 2932, 29579 |
  | small room 38/217 | 2422, 13833 | 4844, 27666 |
  | tunnel 72/183 | 4590, 11666 | 9179, 23331 |
  | courtyard or open space 5/250 | 318, 15937 | 637, 31874 |

- "Active" [read: `0x180038860`, `0x18003ac20`]: the slot in use is the automatic one if `dsp_room` is exactly
  1, else the room one. It is active if its current or its previous preset number is not 0.
- **`dsp_slow_cpu`** [read: `0x18003f0ec` to `0x18003f146`; its only reader]. When it is not 0, the per-block
  preset check takes `dsp_room`, `room_type`, `dsp_automatic`, `dsp_facingaway` and `dsp_spatial` as 0, whatever
  the variables hold. The room and automatic slots are then set to preset 0 and stay there. After the 200 ms
  fade the mixer finds no preset: **every sound, voice included, is dry at 255/256.** The variables themselves
  are not changed, so the console still prints `dsp_room 1`.
- **The game's menu sets it** [read: owner's `GameUI.dll`, `0x18002c42c` to `0x18002c497`]. The audio page's
  "quality" choice writes: lowest, `dsp_slow_cpu 1` and `snd_pitchquality 0`; middle, 0 and 0; highest,
  0 and 1.
- **Stop-all-sounds empties the slots** [read: `0x18003f460`, called from the stop-all-sounds function
  `0x18002ffb0`; rebuilt by `0x1800357e0` on the next block]. It sets `dsp_automatic` to 0, saves and zeroes
  the seven preset variables, frees the slots, then restores each variable that is still 0 and makes the slots
  anew. So after every level load the automatic slot is empty until the measuring builds a preset again.
- The automatic room's driver runs only when the client is fully connected and `dsp_room` is exactly 1, and
  not more often than every 0.25 s [read: `0x1800226dc` to `0x180022761`, `0x1800357d0`]. It does not read
  `dsp_slow_cpu`: it goes on writing `dsp_automatic` while that is set. [inferred from the single reader]

Every variable and condition that keeps the room off:

| Variable or condition | Default | Saved in the config | Cheat | Effect | Mark |
| --- | --- | --- | --- | --- | --- |
| `dsp_slow_cpu` | 0 | **yes** | no | not 0: room and automatic slots empty; all sound dry | read `0x18003f0ec` |
| menu "Sound quality", lowest | - | yes (it writes the line above) | - | sets `dsp_slow_cpu 1` | read, `GameUI.dll` `0x18002c42c` |
| `dsp_volume` | 1.0 | **yes** | no | scales the room share; at 0 the room share is 0 and the direct share 256/256 | read by W3-17 `0x1800420f8`; flags read here |
| `dsp_off` | 0 | no | **yes** | mix 0 everywhere | read `0x180029d54`, `0x18003fcea`, `0x180046a10` |
| `dsp_room` | 0 | no | no | 0: no room. Set by the soundscape. Not 1: the fixed preset of that number | read |
| `dsp_automatic` | 0 | no | no | the engine's; 0 after every stop-all-sounds until a preset is built | read `0x18003f476` |
| `room_type` | 0 | no | no | copied into `dsp_room` when it changes; a listen server sets it 0 at level start (SDK `game/server/world.cpp` 586), which changes nothing if it was 0 | read `0x18003f231`; SDK |
| `dsp_mix_min`, `dsp_mix_max` typed as 0 | 0.2, 0.8 | no | no | no room share until the next preset change overwrites them | read by W3-15 |
| `dsp_vol_2ch` | 1.0 | no | no | as `dsp_volume` | read by W3-17 |
| not fully connected | - | - | - | the automatic room does not run | read `0x1800226dc` |
| listener more than 72 units above the floor | - | - | - | the measuring pass is abandoned: a free camera, a spectator, a player not yet spawned | W3-17, read `0x180023cf0` |
| slanted rays see sky, the straight-up ray does not | - | - | - | the pass is discarded | W3-17, read `0x180021d80` |
| low-ceiling test | - | - | - | nothing is built | W3-17, read `0x18002293d` |
| `dsp_enhance_stereo` (0, saved), `snd_surround_speakers` (-1, saved), `snd_pitchquality` | | | | **do not turn the room off** in the two-channel path | read `0x1800469b1`; surround paths not read |

The last three conditions matter only until the first preset is built: the slot keeps the last one.

### 2c. Who sets the room type

- The client's soundscape code calls `SetRoomType` (SDK `game/client/c_soundscape.cpp` 690) and `SetPlayerDSP`
  (701). No other client code in the SDK calls `SetRoomType`.
- The player DSP, not the room, is set to 0 at level start and end (`clientmode_shared.cpp` 899, 922) and by
  the server at each spawn (`game/server/player.cpp` 5130).
- The owner's `client.dll` holds the soundscape keys `dsp_player` and `dsp_volume` and the command
  `playsoundscape`. It holds no `dsp_room`, `room_type`, `dsp_automatic`, `dsp_off`, `dsp_slow_cpu` or
  `snd_pitchquality` string. So TF2's client never sets those by name; it reaches the room only through
  `SetRoomType`. [read: strings of `client.dll`] Nothing was found that forces `dsp_room` to 0 on spawn, death
  or a class's effect.
- The server picks each player's soundscape from the ear position (SDK `soundscape_system.cpp` 342), for
  spectators too.

## 3. What the takes say about the reads

- W3-15's share table and W3-17's builds are **confirmed by measurement** in two cases: the room preset of
  size class 2 (Set C) and the street preset with width and length classes 3 (Set D, PC A). Delay times agree
  to the sample; strengths to a few percent (Set C) and to 20% (Set D).
- W3-07's "the takes were made where no preset was active" holds for Set B only.
- W3-15's "a voice's direct level drops" needs a rider: with most presets the room path passes the voice
  through, so the level at the output does not drop; with a diffusor first (rooms of size class 2 and up,
  tunnels) it does.

## 4. Why Set B is dry: ranked

Set B's ambience is like Set C's in level and kind (floors within 1 dB), and Set C has a room. So a different
place is not needed to explain Set B; a different state is. [measured, then inferred]

1. **`dsp_slow_cpu 1` when Set B was made** (the menu's Sound quality at its lowest, or a config line), changed
   before Sets C and D. Fits: exactly 255/256, no echo, on every take of the session, wherever the player
   stood. Against: it needs the setting to have changed between sessions. `dsp_volume 0` does the same.
2. **`dsp_room` was 0**: no soundscape had set a room, for instance a map with no soundscape, or a different
   map from Sets C and D.
3. **The automatic slot was empty**: `dsp_room 1` but no preset built since the level loaded. A player who has
   not spawned, or watches from a camera, is "in the air" and no pass completes.
4. **A courtyard preset with an echo shorter than 31 ms.** Its level is 256.0 of 256, which the plateau cannot
   tell from 255. Unlikely: it needs a very small yard.
5. `dsp_off 1` with cheats on. Set C had cheats on and shows the room.

### The console check

Stand where Set B was made, with the settings of that day if known. Type each name alone:
`dsp_slow_cpu`, `dsp_volume`, `dsp_room`, `dsp_automatic`, `dsp_mix_min`, `dsp_mix_max`, `dsp_db_min`,
`dsp_db_mixdrop`, `dsp_off`, `snd_pitchquality`. Look at Options, Audio, Sound quality.

| Case | What the console prints |
| --- | --- |
| 1. slow CPU | `dsp_slow_cpu 1` (and `snd_pitchquality 0` if the menu set it). `dsp_room 1`. `dsp_automatic` 0 or 60 to 99. The four mix variables at 0.2, 0.8, 80, 0.5 if it has been on since the game started [inferred] |
| 1b. volume | `dsp_volume 0` |
| 2. no room asked | `dsp_room 0`, `dsp_automatic 0` |
| 3. nothing built | `dsp_slow_cpu 0`, `dsp_room 1`, `dsp_automatic 0` |
| room on, as in Set C | `dsp_slow_cpu 0`, `dsp_room 1`, `dsp_automatic` 60 to 99, mix variables **0.32, 0.8, 80, 0.5** |
| room on, as PC A in Set D | the same, mix variables **0.3, 0.8, 75, 0.3** |
| a courtyard | the same, mix variables 0.21, 0.8, 95, 0.1 |

A second check, one minute: in a spawn room with loopback on, say a word, type `dsp_slow_cpu 1`, say it again,
then `dsp_slow_cpu 0`. Predicted: the reverb goes and comes back.

Two questions for the owner decide the rest: was the Sound quality option, or a config, changed between
Set B and Sets C and D; and were all three made at the same spot on the same map.

## 5. What it means for the app

- **A listener hearing another player:** not dry by default. A TF2 listener at the game's default
  (`dsp_slow_cpu 0`) on a stock map has the automatic room. The share and the echoes depend on the place:
  41/214 with a 58 ms diffuse reverb in a spawn-sized room (measured), 23/232 with echoes at 68, 120 and
  308 ms in a street (measured), near 5/250 in a yard or the open.
- **One's own voice in loopback:** the same split, measured twice. No separate rule.
- **A "Sound quality: Low" switch** (`dsp_slow_cpu 1`) is the true name for the dry case: 255/256, no room.
  Set B is the reference for it.
- The accuracy table compares Set C with a dry model. Its 1.1 to 1.3 dB anchor error there is the room.
  Set C is now a reference for the room preset of size class 2, and Set D PC A for the street preset.
- A level check on a 1 kHz tone must not be used to tell rooms: it rises with a room (3% in Set D).

## 6. Not done, and limits

- PC B's second echo (140.2 ms) is unexplained. The courtyard reading is a guess.
- Echoes under 31 ms and the open-space preset (first sound after 300 ms, 48 dB down) cannot be seen in these
  takes.
- Sets A, E, F: only "no echo of the kinds found elsewhere".
- The exact reflectivity class in Sets C and D was not fixed (correlation changes by 0.03 across classes).
- Whether the first measuring pass after a level load always builds a preset for a player who never moves was
  not read through. Set C suggests it does.
- The four mix variables' values under `dsp_slow_cpu 1` are inferred, not read end to end.
- Which Sound quality the game picks on a fresh install was not read. The variable's own default is 0.
- The surround paths, as before.
- Scripts and numeric outputs: `scripts/` and `out/` beside this file. The decoded copies of the takes were
  deleted; `scripts/tk.py` expects them in `takes/` as raw 32-bit files if a script is run again.
