# W3-15: the room DSP, as the engine does it

An investigation, 2026-11-10. No app code changed. Nothing of the game's files is in this repository: the report
describes behaviour in its own words and gives constants and numbers with the place they were read. The game's
script files arrived while the read was under way; what they say is in sections 3 to 5.

## Summary

| Question | Answer | Confidence |
| --- | --- | --- |
| 1. Where the room DSP sits | On the mixer's "room" buffer, at 44100 Hz, in 32-bit integers, **in mono** (left and right are averaged, the result is written to both), before the sum with the direct sound, before the clip and before `volume`. The delay lines live on between blocks, so the tail runs on after the voice stops. `dsp_volume` (1.0) scales the share sent to the room. `dsp_enhance_stereo` is 0 by default and its stage is skipped. | Read: high |
| 1b. The voice's share | Set by the active preset's own header: putting a preset on the room slot overwrites `dsp_mix_min`, `dsp_mix_max`, `dsp_db_min` and `dsp_db_mixdrop` with four of its header numbers. W3-07's 229/256 direct and 26/256 room is right for the numbered presets 0 to 29. The automatic room's presets differ: **a voice indoors sends 38 to 80 of 256 to the reverb and keeps 175 to 217 direct; in a street or alley 23 or 24 and 231 or 232; in a courtyard or open space 5 and 250.** | Read: high (code and file) |
| 2. The processors | Integer arithmetic, one sample at a time, 4096 = 1.0, shifts that round down. A preset is up to five processors; `LINEAR` is a plain series chain. The delay, allpass, comb, low-pass, diffusor, reverb, amplifier and modulating delay are read to the formula (section 2). No gain stage at a preset's end. | Read: high for those; five other processor types not read |
| 3. The presets | All of them come from the text file `scripts/dsp_presets.txt`, parsed at start. **No preset is compiled into `engine.dll`.** The owner's file holds 136 presets, 0 to 135, all `LINEAR`. **The app's table of presets 0 to 29 matches the file value for value.** What it lacks: each preset's header, the delay's kind, and every preset from 30 up, the automatic room's among them. | Read: high |
| 4. The automatic room | A TF2 map's soundscape sets `dsp_room` to its "dsp" number (public SDK). **Two soundscapes in three ask for 1, and every soundscape of 2Fort, Dustbowl, Badlands, Well, Granary, Gravel Pit, Upward, Hightower and Gold Rush does.** With `dsp_room 1` the engine measures the space around the player four times a second at most, names its shape (room, duct, hall, tunnel, street, alley, courtyard, four kinds of open space), and **builds a preset by interpolating between two presets of the file** (numbers 102 to 133), in fifths. It keeps up to 40 such presets (numbers 60 to 99) and cross-fades over 200 ms. Presets 0 to 29, the app's whole table, are used only on the few maps whose soundscapes name one. | Read: high for the structure; the measuring itself in outline |
| 5. The app | It has no automatic room, which is what a TF2 listener nearly always has. Its mix (0.45 wet, cross-faded) is not the engine's law; against presets 0 to 29 it is about 13 dB too wet. Then: the reverb's delay times, per-comb feedback and gain; a sine modulation where the engine jumps at random and cross-fades; an extra 900 Hz low-pass under water that the engine does not have. Section 5 ranks them. | as above |
| (asked later) The sound mixer | A voice falls in the groups `Quiet`, `PlayerVoice` and `All`. Under the default mixer only `All` has a value, 0.72, and that multiplies the voice's volume before the pan law. With headphones (the default) the two sides still sum past the cap of 255, so nothing changes. With `snd_surround_speakers 2` the voice is at 182.6/256, not W3-07's 253.5/256. | Read: code and file; the name match inferred |
| 6. A check in the game | Without cheats: type `dsp_room`, `dsp_automatic` and the four mix variables to see the active preset's number and header. With `developer 1` and `adsp_debug 1` the engine prints each automatic room it builds. `dsp_mix_min 1`, `dsp_mix_max 1`, `dsp_db_mixdrop 1` (none cheat-protected) make a voice fully wet, which gives the reverb's response in one take. | Read |

## How it was read

- `bin/x64/engine.dll`, SHA-256 `4802a74c...a08ec80`, the file W3-03 and W3-07 read (PE32+ x86-64, image base
  `0x180000000`). Addresses below are virtual addresses in that image. The file was read as data with a
  disassembler library and never executed.
- Functions were found from the strings the binary carries: the file name `scripts/dsp_presets.txt`, the loader's
  error messages (which name `DSP_LoadPresetFile`), the allocation warnings of each processor ("failed to allocate
  diffusor", "reverb", "delay line", "amp", "mod delay" and so on), the shape names of the automatic room, and each
  console variable's object. Other names below are **labels of mine**.
- The public SDK (`ValveSoftware/source-sdk-2013`, commit `e1f1fd4`) for the client's side: who calls
  `SetRoomType` and `SetPlayerDSP`. Cited by file and line.
- The owner's `client.dll` (SHA-256 begins `b6f45c74`) only to confirm that the shipped client carries the
  soundscape code the SDK shows: it holds the soundscape keys `dsp`, `dsp_player`, `dsp_volume`, the "unknown
  command" message and the file names `scripts/soundscapes_manifest.txt` and `scripts/soundscapes_%s.txt`. It does
  not name `dsp_room` or `room_type`: it goes through the engine's interface. Read as data, never executed.
- The owner's script files, from the game's own archive, each checked against the archive index's CRC-32:
  `scripts/dsp_presets.txt` (46,419 bytes), `scripts/soundmixers.txt` and the 40 `scripts/soundscapes*.txt`. Read
  as data. Numbers and facts are taken from them; the files are not copied here.
- No leaked source was consulted or looked for. The Valve Developer Wiki could not be read from here (it answers
  an automated client with a browser check), so field names below are mine, with meanings taken from the code.
- A small model of the arithmetic, written from this reading, was run on a few example presets (section 2, end).
  It is in the scratch folder, not in the repository.
- Every statement is marked **read**, **inferred** or **not read**.

## 1. Where the room DSP sits, and what a voice sends it

### The slots (read; `0x18003ee80`, `0x180035640`)

The engine keeps a table of 32 DSP slots. At start it makes seven:

| Slot | Preset number from | Cross-fade | Channels |
| --- | --- | --- | --- |
| room | `dsp_room` | 200 ms | **1** |
| automatic room | `dsp_automatic` | 200 ms | **1** |
| water | `dsp_water` (14) | 100 ms | 1 |
| player | `dsp_player` (0) | 100 ms | 1 |
| facing away | `dsp_facingaway` (0) | 100 ms | 2 (4 or 5 on surround devices) |
| speaker | `dsp_speaker` (50) | 300 ms | 1 |
| stereo enhance | `dsp_spatial` (40) | 300 ms | as facing away |

A slot holds one instance of its preset per channel, and during a cross-fade one instance of the previous preset
too. A one-channel slot run on the two-channel buffer averages left and right (sum, then an arithmetic shift by
one), runs the preset on that, and writes the result to both sides (`0x1800382a0`). So **the room reverb is mono**.
A voice is centred (W3-07), so nothing is lost.

### The order (read; `0x1800470a5` to `0x1800474ba`, confirming W3-07's table)

1. Every channel is mixed into the facing and room buffers (W3-07).
2. The room buffer goes through one slot: the automatic room's if `dsp_room` is exactly 1, else the room's
   (`0x18003ac20`).
3. Stereo enhance, on the room buffer, only if `dsp_enhance_stereo` is non-zero, DSP is not off and the slot of step
   2 holds a preset (`0x1800470dd` to `0x1800471df`). **`dsp_enhance_stereo` is 0 at start, so this stage is
   skipped** unless the player's saved settings turn it on (the variable is saved with the configuration).
4. Output = room + facing, as integers, gain 1.0.
5. Under water: the whole output through the water slot. Then the player slot. Then the dry buffer is added.
6. Clip to +-32767, then `volume`, then 16 bits (W3-07).

So the reverb is added to the direct voice **before** the clip, and both are in the mixer's integer units at
44100 Hz. The reverb's constants are written for 44100 Hz (44.1 samples per millisecond, `0x180361fe8`).

The DSP call does nothing when `dsp_off` is set or when the slot's current and previous preset numbers are both 0
(`0x18003fca0` to `0x18003fd0a`). Preset number 0 always means "none": the buffer passes untouched.

### The tail (read)

The mixer calls the room slot for every 512-sample block, whatever is playing. A delay line is a ring of integers
owned by the preset instance; nothing clears it between blocks. So **the tail goes on after the voice channel
ends**, fed by silence, until integer rounding ends it. Inferred from the arithmetic and seen in my model: a comb
whose last values are negative can stay at -1 for ever (a shift rounds down), so a finished tail may leave the room
buffer at minus a few units. That is 90 dB under full scale and cannot be heard.

### What a voice sends to the room (read; `0x180029c4a` to `0x180029dbe`, `0x180041ff0` to `0x1800420d0`)

At a channel's **first** spatialisation the engine fixes that channel's two mix limits and keeps them for the
channel's life:

```
lo = dsp_mix_min        hi = dsp_mix_max
if the sound's level in dB (60 for voice) <= dsp_db_min:   lo *= dsp_db_mixdrop;  hi *= dsp_db_mixdrop
```

Then at every spatialisation:

```
mix = lo + (hi - lo) * (clamp(distance, dsp_dist_min, dsp_dist_max) - dsp_dist_min) / (dsp_dist_max - dsp_dist_min)
mix = 0   if dsp_off, or if the sound's name carries the '>' flag
```

and in the mixer, per channel:

```
mix = 0   if dsp_off, or if the slot of step 2 holds no preset (current and previous both 0)
room   volume = vol * min(256, int(mix * 256 * dsp_volume * dsp_vol_2ch)) / 256
facing volume = vol * int(256 - mix * 256) / 256
```

`dsp_volume` and `dsp_vol_2ch` are both 1.0 at start. A soundscape can set `dsp_volume` (section 4).

**The correction to W3-07.** When a preset is put on the room slot or on the automatic slot, the engine writes four
numbers from that preset's header into the four variables: `dsp_mix_min`, `dsp_mix_max`, `dsp_db_min`,
`dsp_db_mixdrop` (read; `0x1800389a1` to `0x180038a31`). The start-up values (0.2, 0.8, 80, 0.5) last only until
the first preset is set. So for a voice, 12 units away with `dsp_dist_max` 1440:

```
mix = d * (min + (max - min) * 12/1440)       d = mixdrop if 60 <= dB min, else 1
                                              (min, max, dB min, mixdrop: the preset's)
```

| Preset header (min, max, dB min, mixdrop) | Presets with it | mix | Room share | Direct share |
| --- | --- | --- | --- | --- |
| 0.2, 0.7, 80, 0.5 | 0 to 29 and most others | 0.102 | 26/256 | 229/256 (-0.97 dB) |
| 0.3, 0.8, 80, 0.5 | 102; 110 to 113 (hall) | 0.152 | 38 | 217 (-1.4 dB) |
| 0.32, 0.8, 80, 0.5 | 103, 105 (room) | 0.162 | 41 | 214 (-1.6 dB) |
| 0.63, 0.8, 80, 0.5 | 104 (room) | 0.316 | 80 | 175 (-3.3 dB) |
| 0.4, 0.9, 80, 0.5 | 106 to 109 (duct) | 0.202 | 51 | 204 (-2.0 dB) |
| 0.4, 0.9, 80, 0.7 | 114 to 117 (tunnel) | 0.283 | 72 | 183 (-2.9 dB) |
| 0.3, 0.8, 75, 0.3 | 118 to 121 (street) | 0.091 | 23 | 232 (-0.9 dB) |
| 0.32, 0.8, 60, 0.3 | 122 to 125 (alley) | 0.097 | 24 | 231 (-0.9 dB) |
| 0.21, 0.8, 95, 0.1 | 126 to 129 (courtyard) | 0.021 | 5 | 250 (-0.2 dB) |
| 0.22, 0.6, 95, 0.1 and 0.2, 0.7, 95, 0.1 | 130 to 133 (open space) | 0.022, 0.020 | 5 | 250 (-0.2 dB) |

The headers are the file's (read). The engine's own start-up values of the four variables (0.2, 0.8, 80, 0.5) give
26 and 229 too. The reverb's output comes on top of the direct share, so the voice's total level in a room is not
simply lower; section 3 gives the reverb's level for each.

Inferred: what a voice gets in a real room is decided mostly by the first and last numbers of that room's preset
header. A voice channel lasts one run of speech (W3-07), so the
limits are fixed anew at each spurt's start. The level in dB is worked back from the channel's distance factor
(`snd_refdb` 60, `snd_refdist` 36) and truncated, so a voice may count as 59 rather than 60: it matters only for
a preset whose "dB min" is exactly 59.

## 2. The processors' arithmetic

### A preset (read; `0x18003c380`, `0x18003c0c0`, `0x18003c630`, `0x18003ca80`)

A preset is a type, six header numbers, and up to **five** processors, each a type with up to **16** numbers.
An instance copies that and builds each processor. Per sample:

- `SIMPLE` (one processor): the processor.
- `LINEAR`: the processors in series, in the file's order. Out of one into the next. Nothing else.
- Nine other types (`PARALLEL2`, `PARALLEL4`, `PARALLEL5`, `FEEDBACK`, `FEEDBACK3`, `FEEDBACK4`, `MOD1`, `MOD2`,
  `MOD3`) wire the five processors in parallel or with one-sample feedback paths, or let one processor's output
  steer another's. Read in outline only (`0x18003c6c2` to `0x18003ca40`).

There is **no gain or scaling at the end of a preset**. Each processor carries its own gain. A preset has no
"wet/dry mix" of its own either: the share is the channel's (section 1).

For `SIMPLE` and `LINEAR` presets the engine runs each processor over the whole block in turn (`0x18003ca80`).
Each block function calls the per-sample function for every sample (checked for the delay and the reverb), so the
result is the same as sample by sample.

Everything is 32-bit integers. A factor is an integer with 4096 as 1.0; a product is shifted right by 12, which
rounds **down** (toward minus infinity), not toward zero. Samples are in the mixer's 16-bit units.

### The low-pass and high-pass filter, type `FLT` (read; `0x18003a830`, `0x18003a1b0`, `0x180039c50`)

File numbers: 0 kind (`LP` 0, `HP` 1, `BP` 2), 1 cutoff in Hz, 2 width in Hz (band-pass only), 3 "quality" 0 to 3
(how many extra copies run in series), 4 gain.

```
t  = tan(pi * cutoff / 44100)          k = (1 - t) / (1 + t)
a1 = int(-4096 * k)
low-pass:  b0 = b1 = int(2048 * (1 - k))          high-pass:  b0 = int(2048 * (1 + k)),  b1 = -b0
b0, b1 of the first stage are multiplied by the gain and truncated

per sample:   w = x - ((a1 * w_prev) >> 12)       y = (b0 * w + b1 * w_prev) >> 12       w_prev = w
```

That is a first-order filter with its zero at 22050 Hz and its -3 dB point at the cutoff, with unity gain at 0 Hz.
With quality q the sample passes q more identical stages (gain 1). A stage whose state and input are all zero
returns zero without computing. The band-pass path (width above 0) was not read.

### The delay, type `DLY` (read; `0x180035410`, `0x180034550`, `0x180034990`)

File numbers: 0 kind, 1 delay in ms, 2 feedback, 3 gain, 4 to 7 a filter (kind, cutoff, width, quality) for the
kinds that have one, 8 to 10 three more tap times in ms for the four-tap kinds.

```
D = int(|delay ms| * 44.1)       a = int(feedback * 4096)       b = int(gain * 4096)
```

The seven kinds, with `d` the sample written D samples ago:

| Kind | Per sample |
| --- | --- |
| `PLAIN` 0 | `w = x + ((a*d) >> 12)`; store w; out = `(w*b) >> 12` |
| `ALLPASS` 1 | `w = x + ((a*d) >> 12)`; store w; out = `((d + ((-(w*a)) >> 12)) * b) >> 12` |
| `LOWPASS` 2 | `w = x + F(d)`; store w; out = `(w*b) >> 12`. F is the filter above with **its b0 and b1 multiplied by the feedback**: the feedback gain is inside the filter |
| `DLINEAR` 3 | store x; out = d. A pure delay: feedback forced to 0, gain forced to 1 |
| `FLINEAR` 4 | store x; out = `(F(d)*b) >> 12`. A delayed, filtered copy; no feedback loop, gain 1 |
| `LOWPASS_4TAP` 5 | four taps; `w = x + F(d at the longest tap)`; out = `((sum of the four taps + x) * b) >> 12` |
| `PLAIN_4TAP` 6 | four taps; `w = x + ((a * d at the longest tap) >> 12)`; out as kind 5 |

Two rules of the builder matter to the level (read; `0x180034730` to `0x1800347fa`):

- The feedback integer is capped at 4095.
- **The gain is cut when the feedback is high.** With `fb = min(a/4096, 0.999)`:
  `b = int(clamp(4 * int(4096 * (1 - fb)), 1024, 4096) * b / 4096)`. So the gain is whole up to a feedback of 0.75,
  then falls in a straight line to a quarter at 0.9375 and stays there. For the four-tap kinds the gain is
  quartered first.

A delay that is being changed (by the modulation below) reads two taps and mixes them:
`d = d_old + (((d_new - d_old) * r) >> 12)`, r running 0 to 4096 (`0x180034ee0`).

### The diffusor, type `DFR` (read; `0x180034120`, `0x180033d60`)

File numbers: 0 size (0 to 1), 1 count (kept to 4 by the range table), 2 feedback, 3 gain (0 means 1).

A series of `ALLPASS` delays. Stage i has

```
D = int(size * T[i]) * 44100 / 1000 (integer division)        T = 13, 19, 26, 21 ms for stages 0 to 3
a = int(min(feedback * 4096, 4091.9))        b = int(gain * 4096)
```

The table at `0x180462520` goes on (32, 36, 38, 16, ...) but the count cannot pass 4. Note the order of the
truncations: the time is cut to whole milliseconds first. At size 1.0 the four delays are 573, 837, 1146 and 926
samples.

### The reverb, type `RVA` (read; `0x18003ea30`, `0x18003d540`, `0x18003e380`)

File numbers: 0 the far delay in ms, 1 the first delay in ms, 2 count m (1 to 12), 3 feedback, 4 gain, 5 low-pass
cutoff in Hz (0 for none), 6 "filter in the loop" flag, 7 modulation depth in ms, 8 modulation rate factor, 9 to
11 width, depth and height in ms, 12 to 14 a feedback for each of those, 15 a tap factor (0 to 0.333).

m delays **in parallel**, all fed the same input; the output is their sum. With numbers 9 to 11 all zero:

```
D[i]  = int( (int(i * (far - first) / m) + first) * 44.1 )        i = 0 .. m-1
fb[i] = feedback                              for i = 0
      = feedback ^ (D[i] / D[0])              for the others       (longer delays get less feedback)
a[i]  = int(min(fb[i] * 4096, 4091.9))        b[i] = int(gain * 4096 / m)
```

So the delays step up from the first value by (far - first)/m and **never reach the far value**. Each delay is then
built by the delay's rules above, including the gain cut for high feedback.

- Flag 6 set and a cutoff given: each delay is a `LOWPASS` comb (filter in the loop). With a negative feedback it
  is an `FLINEAR` instead.
- Flag 6 clear: each delay is a `PLAIN` comb, and the **sum** passes two of the low-pass filters in series.
- Number 15 above 0: the four-tap kinds. The three extra taps sit at D times (1 - 0.96325 f), (1 - 1.69704 f) and
  (1 - 3.14159 f), f being number 15, not under 441, 308 and 220 samples.
- Numbers 9 to 11 not all zero (`0x18003dc60`): the count is rounded to 3, 6, 9 or 12 and the delays come from the
  three dimensions in turn, longest first, with the dimensions pushed at least `7 * (m/3)` ms apart. The first three
  delays are the dimensions themselves; later rounds add `max(0.18 * dimension * round, 7 * round)` ms. The feedback
  of a dimension is its own number (12 to 14), or, if those are zero, the feedback raised to
  (dimension / shortest dimension). The automatic room's presets use this path (section 4).

**Modulation** (number 7 above 0; read, `0x18003d9ab` to `0x18003db0f`, `0x18003e3e0` to `0x18003e4c1`,
`0x18003b980`). It is not a sine. Per delay, with `L` its length in seconds:

```
depth    = clamp(0.001 * number7 / L, 0.01, 0.99)
interval = int(L * number8 * 44100) samples
glide    = min(0.5 * L * number8, 0.02) seconds
every `interval` samples:  pick a new tap, a whole number drawn uniformly from (1 - depth) * D to D,
                           and cross-fade from the old tap to it over `glide` (the two-tap read above)
```

The draw is the engine's shared random-number stream (`RandomInt`). So two runs of the game do not give the same
samples, and no model can match a take sample for sample once a preset modulates.

### The amplifier, type `AMP` (read; `0x1800336d0`, `0x180033250`)

File numbers: 0 gain, 1 clip threshold (0 to 1), 2 distortion mix, 3 a "feed" value (stored; not seen used in the
per-sample function), 4 modulation rate in Hz, 5 depth, 6 glide in ms, 7 random flag.

```
if int(threshold * 32767) < 4096 and distmix != 0:      # so only for thresholds under 0.125
    c = clamp(x, -T, +T);   x = c if distmix is 1, else x + (((c - x) * distmix) >> 12)
out = (g * x) >> 12
every int(44100 / max(rate, 0.01)) samples:  the target gain flips between gain and gain * (1 - depth)
    (or, with the random flag, is drawn between the two), and g ramps to it in a straight line over the glide time
```

### The modulating delay, type `MDY` (read; `0x18003bf70`, `0x18003b8d0`, `0x18003ba80`)

File numbers 0 to 7 as the delay's; 8 rate in Hz, 9 depth (0 to 1), 10 glide in ms, 11 mix.

One delay with the reverb's modulation: every `int(44100 / rate)` samples a new tap is drawn between
(1 - depth) D and D and cross-faded in over the glide time. Out = the delay's output if mix is 1,
`(delay + x) >> 1` if mix is 0.5, else `x + (((delay - x) * mix) >> 12)`.

### Other types

`CRS` (chorus), `PTC` (pitch shifter), `ENV` (envelope), `LFO`, `EFO` (envelope follower): they exist (their
builders are at `0x180033870`, `0x18003cb10`, `0x180039620`, `0x18003b380`, `0x180038dd0`). **Not read.**

### Changing presets (read; `0x1800388c0`, `0x1800382a0`, `0x18003f0d0`)

Once per block the engine compares each slot's variable with the number it last used. On a change it builds the new
preset, keeps the old one, and cross-fades: both run on the same input and
`out = old + (((new - old) * r) >> 12)`, r rising from 0 to 4096 in a straight line over the slot's time (200 ms for
a room). If the outgoing preset's fourth header number is not zero, its size is the time instead, and a negative
sign makes the fade squared. A change is not taken while a fade is running. Changing to 0 fades to the untouched
buffer. A preset whose third header number is above zero is a one-shot: after that many seconds the variable is set
back to the preset before it.

### What the arithmetic gives, on examples

My model, fed presets of the file, an impulse of 16384, no modulation:

| Preset | Engine delays | Feedback integers | Gain integers after the cut |
| --- | --- | --- | --- |
| 5 (reverb 50 / 8 ms, 2 combs, feedback 0.92) | 8.0, 29.0 ms | 3768, 3026 | 721, 2252 |
| 6 (diffusor; reverb 100 / 15 ms, 2 combs, 0.92) | 15.0, 57.0 ms | 3768, 2983 | 721, 2252 |
| 17 (diffusor; reverb 50 / 20 ms, 6 combs, 0.9) | 20, 25, 30, 35, 40, 45 ms | 3686 falling to 3231 | 382 rising to 806 |

The response's energy is 0.6 to 0.8 of the input's for these three, and it has fallen 60 dB within 0.4 to 0.7 s.
A reverb's output starts with the input itself (a comb's first output is its input times its gain), so the "room"
path carries a copy of the direct sound too.

## 3. The presets: the file, and the app's table against it

### How they get in (read; `0x1800365b0`, `0x180036ba0`, `0x18003c380`)

At sound start-up, and again on the console command `dsp_reload` (not cheat-protected), the engine opens
`scripts/dsp_presets.txt` through the game's file system. If it cannot, it stops with the error
`DSP_LoadPresetFile: unable to open`. It counts the top-level blocks, makes a table of that many presets, and
fills it. A preset instance is always a copy of a table entry. **There is no compiled-in preset**: no table of
processor numbers was found in the binary, only the range limits of each parameter and the diffusor's delay table.

The file's shape, as the loader reads it:

```
{
    <preset number>  <type word>  <n1> <n2> <n3> <n4> <n5> <n6>
    { <processor word>  <up to 16 values> }
    ... up to five processors ...
}
```

| Field | Meaning (read from its use in the code) |
| --- | --- |
| preset number | the table index: the number `dsp_room` and the other variables take |
| type word | `SIMPLE`, `LINEAR`, `PARALLEL2`, `PARALLEL4`, `PARALLEL5`, `FEEDBACK`, `FEEDBACK3`, `FEEDBACK4`, `MOD1`, `MOD2`, `MOD3`. A preset with one processor is made `SIMPLE` whatever the word says |
| n1, n2 | written to `dsp_mix_min`, `dsp_mix_max` when the preset goes on the room or automatic slot |
| n3 | one-shot duration in seconds (0: none) |
| n4 | cross-fade time in seconds when leaving this preset (0: the slot's own; negative: squared) |
| n5, n6 | written to `dsp_db_min`, `dsp_db_mixdrop` |
| processor word | `DLY`, `RVA`, `FLT`, `CRS`, `PTC`, `ENV`, `LFO`, `EFO`, `MDY`, `DFR`, `AMP`, `NULL` (or its number) |
| values | numbers, or words that stand for numbers: `LP` `HP` `BP`; `PLAIN` `ALLPASS` `LOWPASS` `DLINEAR` `FLINEAR` `LOWPASS_4TAP` `PLAIN_4TAP`; `SIN` `TRI` `SQR` `SAW` `RND` `LOG_IN` `LOG_OUT` `LIN_IN` `LIN_OUT`; `LIN` `EXP`; `LO` `MED` `HI` `VHI` |

A value is taken as a number only if it starts with a digit, `+` or `-`. A value of 0 is never range-checked; any
other value outside its range is clamped with the message "clamping out of range parameter". **The file's own
comment lines give the same order for the header and for each processor's values as the code reads them**
(checked for the header, `RVA`, `DFR`, `AMP` and `MDY`). One comment line in the file describes an older header
("number of processors, gain"); the loader does not read those.

### What the owner's file holds (read from the file)

- 136 presets, numbered 0 to 135 with no gaps. Every one is `LINEAR`.
- 0 is the empty preset and 1 the "automatic" placeholder: one `NULL` processor each, which passes its input
  through (`0x18003c010`).
- **2 to 29: the legacy rooms**, the app's table.
- 30 to 59: effects for the player, speaker and stereo slots (filters, distortion, pitch).
- **60 to 99: empty.** The automatic room writes its built presets here (section 4).
- 100, 101: two test reverbs. **102 to 133: the automatic room's presets**, four per shape. 134, 135: effects.
- **136 to 139 do not exist.** Some soundscapes ask for them (section 4). The engine ignores a number that is not
  under the table's count: the slot keeps the preset it had (read; `0x1800388e6`).
- Header: presets 0 to 29 all carry 0.2, 0.7, 0, 0, 80, 0.5. The automatic room's carry the values of section 1's
  table. Six player presets are one-shots of 1.6 s with a squared fade.
- Processor kinds in use: `RVA`, `DFR`, `DLY`, `AMP`, `FLT` in rooms; `LFO`, `PTC`, `EFO`, `CRS`, `MDY` in the
  effects (and `MDY` in preset 16).

### The app's `DSP_PRESETS` against the file

Compared by a script, preset by preset, every value the app carries against the file's value in the position the
engine reads it from:

- **Presets 0 to 29: every value the app carries is the file's.** Ids, processor kinds, their order and all
  numbers agree.
- Preset 23's reverb count is 1.3 in the file. The engine truncates it to 1, which is what the app has.
- What the file has and the app's entries do not carry:
  - the six header numbers of every preset (the app has `mix: 0.45` instead);
  - the delay's kind: all the legacy presets' delays are `LOWPASS` (kind 2), which is what the app's code assumes;
  - preset 16's modulating delay is kind `PLAIN` with mix 1.0, which is also what the app's code assumes;
  - the amplifier's fourth value (0 in the file).
- The app's processor names map to the file's positions like this, and the engine reads exactly these:
  `rva`: sizeMax 0, sizeMin 1, ndly 2, fb 3, gain 4, cutoff 5, fpar 6, fmod 7, rate 8.
  `dfr`: size 0, ndly 1, fb 2. `dly`: delay 1, fb 2, gain 3, cutoff 5. `amp`: gain 0, vthresh 1, distmix 2,
  modrate 4, moddepth 5, modglide 6. `mdy`: delay 1, fb 2, gain 3, modrate 8, moddepth 9, modglide 10.
- **Presets the app lacks: 30 to 135.** Of those, 102 to 133 matter to a voice. The app's preset 99 is its own.

So the table is a faithful copy. The app's errors are in what it does with the numbers (section 5), and in which
presets it offers.

### The automatic room's presets (read from the file; levels from my model)

Each shape has two pairs: N and N+1, and N+2 and N+3 for a more diffuse space. Within a pair the first is the
small end and the second the large end.

| Shape | Presets | Contents, small end to large end | Reverb path against the direct voice | Decay to -60 dB |
| --- | --- | --- | --- | --- |
| room | 102, 103 | 2 combs at 30 and 55 ms, to a diffusor and 10 combs from 50 to 221 ms | -14 to -16 dB | 0.5 to 2 s |
| room, diffuse | 104, 105 | diffusor and 3 combs (30 to 63 ms), to 12 combs to 224 ms; modulated | -4 to -16 dB | 0.5 to 3 s |
| duct | 106 to 109 | 2 combs at 10 and 80 ms, to 3 combs to 204 ms | -8 to -9 dB | 0.4 to 0.7 s |
| hall | 110 to 113 | reverb from three dimensions: 7 x 20 x 10 ms to 9 x 192 x 64 ms | about -13 dB | 0.1 to 0.2 s |
| tunnel | 114 to 117 | diffusor and the same kind: 8 x 32 x 10 to 48 x 192 x 64 ms, 6 to 12 delays | -6 to -7 dB | 0.4 to 1.4 s |
| street | 118 to 121 | single echoes at 200 and 120 ms (to 500 and 120) and one comb | about -21 dB | 0.3 to 0.5 s |
| alley | 122 to 125 | the same, 100 and 70 ms to 200 and 70 ms | about -20 dB | 0.3 s |
| courtyard | 126 to 129 | one low-passed echo; its delay is written as -1, which means "the measured length" | about -32 dB | one echo |
| open space | 130 to 133 | an allpass at 300 to 500 ms, a diffusor, an echo, 6 modulated combs at 200 to 320 ms | about -46 dB | long, faint |

The third and fourth columns of section 1's table give each shape's shares. The levels here are the room share
times the energy my model gives the preset's impulse response, without modulation. That response includes the
copy of the input a reverb passes straight through, so the tail alone is lower. The model's three-dimension path
was written from one reading of `0x18003dc60` and is the least checked part. Take the numbers as a guide to which
shapes matter: **indoors the reverb is plainly audible on a voice; in a street or alley it is faint; in a
courtyard or the open it cannot be heard.**

## 4. Who sets the room, and the automatic room

### The soundscape sets it (public SDK; engine read)

- A map is divided into soundscape areas. When the player's soundscape changes, the client runs its keys. The key
  `dsp` calls `SetRoomType` with its number (`src/game/client/c_soundscape.cpp` 634 to 639 and 686 to 691),
  `dsp_player` calls `SetPlayerDSP` (641 to 646, 697 to 702), `dsp_volume` sets that variable (667 to 672, 715 to
  718), and a soundscape that does not set `dsp_volume` puts it back to its default (617 to 620). A soundscape
  played from inside another cannot set any of them (1029). The scripts are `scripts/soundscapes_manifest.txt` and
  `scripts/soundscapes_<map>.txt` (268, 310).
- **`SetRoomType` in the engine** (read; client side `0x180017e10`): it sets `dsp_room` to the number, nothing
  more. It does not treat 1 specially. The server-side version (`0x180018a90`) sends each listed player the
  command `room_type N`, and the mixer copies `room_type` into `dsp_room` when `room_type` changes
  (`0x18003f231`). Inferred that `0x180017e10` is the client's `SetRoomType`: it is reached only through a table
  and its arguments fit the SDK's declaration (`src/public/engine/IEngineSound.h` 122).
- `dsp_room` is 0 when the engine starts (read). "The automatic one when `dsp_room` is 1" (W3-07) is a setting a
  soundscape makes, not the engine's default.
- Player DSP: TF2 does not use the base game's ear-ringing presets. `CTFPlayer::OnDamagedByExplosion` returns at
  once (`src/game/server/tf/tf_player.h` 384). The client sets the player DSP to 0 at level start and end
  (`src/game/client/clientmode_shared.cpp` 899, 922). No soundscape script sets `dsp_player` or `dsp_volume`
  (read from the 40 scripts). So in TF2 `dsp_player` stays 0 and `dsp_volume` stays 1.
- Under water: the client reports it each frame from the eye position (`src/game/client/view.cpp` 786).

### What TF2's soundscapes ask for (read from the 40 scripts)

The scripts define 153 soundscapes. 101 set `dsp` to 1; 2 set nothing. The rest, by map script:

| Map script | Soundscapes and their `dsp` |
| --- | --- |
| shared (`tf2.respawn_room`, `tf2.general_ambient`) | 1 |
| 2Fort: `Underground`, `Underground2`, `OutdoorPond`, `OutdoorFort`, `Indoor` | all 1 |
| Badlands: `Inside`, `Outside`, `OutsideInterior` | all 1 |
| Dustbowl: `Outdoors`, `Indoors` | all 1 |
| Well: `DeepInside`, `Inside`, `Outside` | all 1 |
| Gold Rush: `DeepInside`, `Inside`, `Outside` | all 1 |
| Sawmill: `DeepInside`, `Inside`, `InsideNoLights`, `InsideWaterfall`, `Outside` | all 1 |
| Granary, Gravel Pit, Upward, Hightower, Hydro: `Inside`, `Outside` each | all 1 |
| the other 19 map scripts not named below | all 1 (one soundscape of `mountainlab` sets nothing) |
| `harbor` | spawns and exits 2 (metal, small); headquarters 4 (metal, large); fuel rooms 3; outdoors 1 |
| `warehouse` | spawn and boilers 17 (concrete, small); foyer 18; main hall 25 (cavern, large); outside 1 |
| `soho` | streets 21 (outside, medium); underground 5 (tunnel, small); indoors 11 |
| `rottenburg` | town and clearing 21; spawn 17; alcove 1 |
| `medieval` | outside 21; inside 1 |
| `moonbase` | underground 18; outer space sets nothing |
| `halloween` | underworld and hell 26; the rest 1 |
| `lair` (19 soundscapes) | 137, 138, 139: **numbers the file does not have** |

So on every map a reader would name first, **each area asks for the automatic room, indoors and out**. A fixed
preset from the app's table is what the listener has only in parts of seven map scripts.

On the `lair` map the request is ignored (section 3). The mixer then uses the room slot, because `dsp_room` is not
1, and that slot still holds whatever valid number it last got: nothing if the game has asked for none yet, or the
"automatic" placeholder, preset 1, after any map that asked for 1. Preset 1 passes sound through unchanged. Either
way the voice has **no reverb** there (inferred from the code; whether anything resets `dsp_room` between maps was
not read).

A map can carry its own soundscape script inside its file. Those were not read.

### `dsp_room 1`: the automatic room (read; `0x180022650`, `0x180035b50`, `0x180032040`, `0x180032320`, `0x180032720`, `0x180033060`)

It runs only while `dsp_room` is exactly 1 and the client is fully in the game, and at most once every 0.25 s.

1. **Measure.** Three measuring steps per run (`0x180024000`; 20 directions a round, ray lengths of 2400 and 4800
   units appear). The result is a width, a length and a height in units, a "diffusion" and a "reflectivity"
   between 0 and 1, whether the sky is overhead, and which of the four sides are open. Read in outline only.
2. **Name the shape** (read; `0x180032040`):

   | Shape | Rule | Variable (its default) |
   | --- | --- | --- |
   | room | indoors, none of the next three | `adsp_room_min` (102) |
   | duct | indoors, length over 4 widths, width up to 48 | `adsp_duct_min` (106) |
   | hall | indoors, length over 2.5 widths, width 48 to 96 | `adsp_hall_min` (110) |
   | tunnel | indoors, length over 4 widths, width over 96 | `adsp_tunnel_min` (114) |
   | street | sky, all sides closed, long, width over 144 | `adsp_street_min` (118) |
   | alley | sky, all sides closed, long, width up to 144 | `adsp_alley_min` (122) |
   | courtyard | sky, all sides closed, length up to 2.5 widths | `adsp_courtyard_min` (126) |
   | open space | sky, four sides open | `adsp_openspace_min` (130) |
   | open wall | sky, three sides open | `adsp_openwall_min` (130) |
   | open street | sky, two sides open | `adsp_openstreet_min` (118) |
   | open courtyard | sky, one side open | `adsp_opencourtyard_min` (126) |

   Indoors, a space more than three times as high as it is long is turned on its side first (a shaft). "Indoors"
   here is the measure's "no sky overhead", not the soundscape's name.
3. **Class the sizes** (`0x180032320`): length, width, height, reflectivity and diffusion are each put in a small
   class number by fixed thresholds (144, 240, 288, 480, 576 and 1200 units; 48, 128, 216 and 384 for height;
   0.5 and 0.8; 0.1 and 0.3). Read in outline.
4. **Build the preset** (read; `0x180035b50`, `0x180032720`, `0x1800325d0`, `0x180033060`): take file presets N and
   N+1, N being the shape's variable, plus 2 if the diffusion class is above 1. Copy one of the two whole (the
   large one if the size class is above 1), header included. Then set chosen parameters to
   `A + (B - A) * t`, `t = class / 5` (for some parameters `t` squared; for the reverb's cutoff `class / 4`):
   - reverb: feedback, the two delay times, gain, count and both modulation numbers by the size class; width,
     depth and height and their feedbacks by the width, length and height classes; the cutoff by the reflectivity
     class;
   - diffusor, amplifier, filter: by the size class; delay and modulating delay: by the length class;
   - **a value written as negative in the file is replaced by the measure itself**: a delay's time and taps become
     the length (or width) in units divided by 6, kept between 14 and 500 ms; a reverb's width, depth and height
     become the measures divided by 12, kept between 6 and 500. In the owner's file only the courtyard presets use
     this (their echo's delay).

   The result is stored as preset 60 + n, n from 0 to 39, and `dsp_automatic` is set to that number.
5. **Re-use.** Before building, the engine looks for a preset it already built that fits (`0x180023410`). A new one
   is built only after the player has moved more than 48 units from the place the current one was made and the
   measures have changed by more than set ratios (0.6 and 0.8 appear; read in outline).
6. **Cross-fade**: 200 ms, as any preset change.

So the automatic room neither picks one of the fixed presets 0 to 29 nor computes a reverb from the geometry
directly. It **blends two authored presets per shape, in five steps**, by measured size.

### What a listener in the open gets

- No soundscape, or one that never set a number: `dsp_room` is 0, no preset, the voice is direct at 255/256.
  (Read.)
- A soundscape with `dsp 1`, which is the usual case: an automatic preset is active almost at once. In the open it
  is built from presets 130 to 133, or 126 to 129 with walls around. The voice's direct part is 250/256 and its
  reverb share 5/256, about 46 dB (or 32 dB) under it. To the ear it is dry, but it is 0.2 dB lower.
- The owner's takes show the full level to within 1% (W3-07), and 250/256 would be 2.3% low. Inferred: where the
  takes were made no preset was active at all. Check 1 of section 6 settles it.
- "Active" means exactly: the slot the mixer uses (automatic if `dsp_room` is 1, else room) has a current or a
  previous preset number other than 0 (`0x180038860`). Before the first automatic preset is built `dsp_automatic` is
  0 and the voice is dry.

### The sound mixer and the voice (read; `0x180025e40`, `0x180027350`, `0x18002a10e` to `0x18002a266`; the file)

`scripts/soundmixers.txt` holds rules that put a sound in up to eight "mix groups", and mixers that give groups a
value. The engine matches a rule by the sound's name (a substring, kept on the sound source), its entity's class
name, its channel and its level in dB, in the file's order (`0x180025e40`).

- The file has a rule for the name `?VoiceSfx`, group `PlayerVoice`. A voice's source has that name (W3-07).
  Inferred that the match succeeds: the engine compares against the source's own name string. A voice is also 60
  dB, which fits the group `Quiet` (0 to 70 dB), and everything fits `All`. So its groups are `Quiet`,
  `PlayerVoice`, `All`, in that order.
- The value used is that of the first of the channel's groups to which the current mixer gives one
  (`0x18002a160` to `0x18002a1ab`). The default mixer, `Default_Mix`, gives none to `Quiet` or `PlayerVoice` and
  **0.72 to `All`**. No soundscape script selects another mixer, and `snd_soundmixer` starts as `Default_Mix`
  (the mixer function selects the named one each block, `0x1800469d3` to `0x180046a01`).
- The value multiplies the channel's volume before the pan law (`0x18002a262`, `0x18002a1dd`). For a voice:
  255 x 0.9943 x 0.72 = 182.6. With headphones each side gets 0.9 of that and, for a sound from the listener, both
  sides get the sum, capped: min(255, 328.6) = **255. Unchanged.** With `snd_surround_speakers 2` each side gets
  0.5: the sum is **182.6**, so the voice is at 182.6/256 (-2.9 dB), not the 253.5/256 W3-07 gave before this file
  was read.
- It does not touch the room and direct shares: those come from the DSP mix alone.
- The rule marks `PlayerVoice` as a group that causes ducking, at priority 65. The groups marked as ducked are
  music (to 75%) and the ambient and vehicle groups (to 60 to 68%). So a voice can turn those down. The mixer's
  ducker itself was not read; W3-07 read that it never turns the voice down.
- The mixer named `FreezeCam_Only` gives `PlayerVoice` 0.72 and `All` 0.01: voice stays up during the freeze
  camera while other sound is cut.

## 5. The app against all that

Ranked by how much it is heard.

| # | The app (`audio.js`, `constants.js`) | The engine | What the app should do |
| --- | --- | --- | --- |
| 1 | A place maps to one of presets 0 to 29 by guess (`LISTENER_POSITIONS`); preset 1 ("automatic") is an empty chain, so dry | Nearly every area of the stock maps asks for 1. The room is then a blend of two of presets 102 to 133 by shape and size | Add presets 102 to 133 with their headers. Offer the engine's shapes (room, duct, hall, tunnel, street, alley, courtyard, open) each with a small-to-large setting in fifths, built as section 4 says. Keep the numbered presets for the seven map scripts that name one. "Open" is then not "no effect" but 250/256 direct |
| 2 | `runDspChain` cross-fades dry and wet by `mix` 0.45 on every preset, then scales by `1/sqrt((1-m)^2 + m^2)` | No cross-fade. Direct = voice x `int(256 - m*256)/256`. Room input = voice x `int(m*256)/256`. Output = direct + reverb(room input). m comes from the preset's header: 0.10 for presets 0 to 29, 0.02 to 0.32 for the automatic room's | Use the engine's split with the header of the preset in use (section 1's table). Against presets 0 to 29 the app's wet part is about 13 dB too loud and its dry part 4 dB too low |
| 3 | The room is applied to the voice alone, after its clamp; then the output filter, then `volume`; a soft limiter at the end | Reverb and direct voice are summed with all other sound, then clipped at +-32767, then `volume` | Sum direct and reverb as integers, clamp to +-32767, then `volume`. A loud voice at the clamp plus its reverb clips again here |
| 4 | Reverb delays spread from `sizeMin` to `sizeMax` inclusive, each detuned by up to 0.85% | `first + i * (far - first) / m`, truncated; never reaches the far value | The engine's formula. Preset 6: 15 and 57 ms, not 15 and 100 |
| 5 | One feedback for all combs; comb gain `sqrt(1 - fb^2) / sqrt(n)` | Feedback `fb ^ (D[i] / D[0])` per comb; gain `gain / m`, cut by `clamp(4 (1 - fb), 0.25, 1)` | The engine's two rules. The app's long combs ring too long and its level differs by several dB |
| 6 | No reverb built from width, depth and height | The hall, tunnel, street and alley presets are all of that kind | Build it as section 2 says (`0x18003dc60`); it needs a second careful read first |
| 7 | Modulation: a sine on each comb's delay, `rate` in Hz, depth in ms (a pitch wobble) | Random jumps of the tap, every (rate x delay length) seconds, cross-faded over at most 20 ms. No pitch change | Seeded random jumps with a cross-fade. It can match in character only: the game's random stream is not reproducible |
| 8 | Under water: an extra 900 Hz low-pass, then preset 14 as a room at mix 0.45 | The whole output (direct + reverb) through preset 14, fully, in mono. Preset 14 is a diffusor, an amplifier whose gain swings between 1.0 and 0.4 and turns ten times a second, and a modulated reverb with two 1800 Hz low-passes on its sum. No other filter anywhere in the path | Drop the 900 Hz filter. Run preset 14 on the summed signal with no dry part |
| 9 | Low-pass: `exp(-2 pi f / rate)` one-pole | First-order with a zero at 22050 Hz, `k = (1 - tan)/(1 + tan)`. Out of the loop: two in series. In the loop: its numerator carries the feedback | The engine's filter and coefficients (12-bit) |
| 10 | Diffusor delays 13.7, 21.3, 29.1, 40.9 ms; feedback capped at 0.9 | 13, 19, 26, 21 ms times the size, cut to whole milliseconds; feedback up to 4091.9/4096; a gain | The engine's table |
| 11 | Delay: always a low-passed echo | Seven kinds, named in the file; the gain cut above feedback 0.75. Presets 130 to 133 use the allpass and plain kinds | Read the kind from the file |
| 12 | Amplifier: the gain glides exponentially; clipping whenever a threshold is set | Straight-line ramps between gain and gain x (1 - depth); clipping only for thresholds under 0.125 | The engine's rules |
| 13 | Modulating delay: a sine | As 7, plus a mix number | As 7 |
| 14 | Float arithmetic | Integers, 4096 = 1.0, products rounded down | Needed only for a sample-exact match of an unmodulated preset. Cannot be heard |
| 15 | Tail: 4 s rendered, cut at -66 dBFS | Runs until the integers reach 0 (or stick at -1) | Fine as it is |
| 16 | No cross-fade between presets | 200 ms linear | Only matters if the listener's place changes during a render |
| - | The preset table, 0 to 29 | The same numbers | Nothing: it is a faithful copy |
| - | Mono | Mono (the room slot has one channel; a voice is centred) | Nothing |
| - | 44100 Hz | 44100 Hz | Nothing |

The app's comment "the engine ranges it 0.2-0.7 with listener distance, we use the midpoint" (`constants.js`) has
the range right for presets 0 to 29 and the rest wrong for a voice: the range is halved for a 60 dB sound (the
header's last two numbers), and a voice sits at the near end of it (12 units of 1440), not the middle.

The app's place names do not fit either. "2fort sewers" is the soundscape `2fort.Underground`, which asks for the
automatic room, not preset 6. Names that are true to the files: for a fixed preset, the areas of section 4's
table (a `harbor` spawn room is preset 2, the `warehouse` main hall preset 25, a `soho` street preset 21); for
everything else, a shape and a size.

## 6. How the owner can check it in the game

None of the `dsp_` variables below is cheat-protected except `dsp_off` (read from each variable's flags at its
registration): `dsp_room`, `room_type`, `dsp_automatic`, `dsp_water`, `dsp_player`, `dsp_spatial`, `dsp_volume`,
`dsp_mix_min`, `dsp_mix_max`, `dsp_db_min`, `dsp_db_mixdrop`, `dsp_enhance_stereo`, `adsp_debug` and the eleven
`adsp_..._min` are free. `dsp_off`, `snd_showstart`, `dsp_dist_min` and `dsp_dist_max` need `sv_cheats 1`.

1. **Read the room where the takes were made (two minutes, no cheats, any server).** Stand there and type, one at
   a time: `dsp_room`, `dsp_automatic`, `dsp_mix_min`, `dsp_mix_max`, `dsp_db_min`, `dsp_db_mixdrop`, `dsp_volume`,
   `dsp_enhance_stereo`. Predicted on a stock map: `dsp_room` 1, `dsp_automatic` 60 to 99, and the four mix
   variables equal to one row of section 1's table (in the open: 0.22, 0.6, 95, 0.1 or 0.2, 0.7, 95, 0.1; between
   walls under the sky: 0.21, 0.8, 95, 0.1). If
   `dsp_room` reads 0, that explains the full-level voice of the takes. Then do the same in a 2Fort sewer and a
   spawn room. Predicted: a tunnel, hall or duct row in the sewer; a room row in the spawn.
2. **See the automatic room work (no cheats).** `developer 1`, `adsp_debug 1`. Predicted: on walking into a new
   space the console prints a line beginning `NEW DSP NODE` with the measured size, height, diffusion and
   reflectivity, or `DSP PRESET` with the number of a preset it re-uses. With `adsp_debug 2` it also prints the
   shape's name (`TUNNEL Detected` and so on). A list of these lines for ten well-known spots would let the app's
   places be named truthfully without reading the measuring code.
3. **Read a voice's share directly (local server, `sv_cheats 1`).** `developer 1`, `snd_showstart 2`. Each sound
   that starts prints its name and a second line beginning `dspmix`. A voice spurt is started through the same
   function (read: `0x18005b960` calls it), so it should print too. Predicted: the mix of section 1's table for
   the place (0.02 in the open, 0.15 to 0.32 in a room, 0.28 in a tunnel).
4. **A level check with no extra tools.** Repeat an earlier take (the 1 kHz steps) standing in a 2Fort spawn room
   and again in the sewer. Predicted: the unclipped tone's direct level is 175/256 to 217/256 of full (-3.3 to
   -1.4 dB) in the room and 183/256 (-2.9 dB) if the sewer measures as a tunnel, with the reverb on top of it and
   a tail after each step. `dsp_off 1` on a local server restores the level.
5. **The reverb's response in one take.** Local server, `sv_cheats 1`, voice loopback as in the earlier takes, the
   test signal fed as W3-14 describes, the playback device set to 44100 Hz so that XAudio2 does not resample.
   - Stand still (the soundscape sets `dsp_room` again only when it changes). Type `dsp_room 6`, then check that
     `dsp_room` reads 6. Or leave it at 1 for the automatic room and note `dsp_automatic`.
   - Then type `dsp_mix_min 1`, `dsp_mix_max 1`, `dsp_db_mixdrop 1`. They must come **after** the preset is set,
     which overwrites them, and before the voice starts, because a spurt fixes its limits at its start.
   - Play a signal of short bursts with 3 s of silence between (a 5 ms burst of 1 kHz, a single loud syllable), and
     record the output device's loopback.
   - Predicted: no direct voice at all (its share is `int(256 - 256) = 0`); the take is the preset's response to
     the decoded voice, with the tail running through the silences. For preset 6 the echoes repeat every 15.0 and
     57.0 ms (661 and 2513 samples), after a diffusor of 573 and 837 samples.
   - Repeat with `dsp_off 1` for the dry reference, and with the three variables left alone for the real share.
6. **Under water**, as W3-07's check 3. Predicted now in more detail: the voice has no direct part there; all of
   it passes preset 14, and its level swings between full and 0.4, turning ten times a second.

What to record: the game's output, through the loopback of the sound device. `voice_recordtofile` taps before the
mixer and holds no reverb.

## 7. What was not read, and what other files would add

- **The room measuring** (`0x180024000`, `0x180021d80`, `0x180023700`, `0x180023cf0`): how width, length, height,
  diffusion, reflectivity, sky and open sides are got from ray traces, and the exact class thresholds and
  re-build rules (`0x180032320`). Read in outline. This is now the main gap: it decides which of the four presets
  of a shape, and what blend, a given spot gets. Check 2 prints the result for any spot, which is cheaper than the
  read.
- **The three-dimension reverb** (`0x18003dc60`): read once; the hall, tunnel, street and alley presets all use
  it. Worth a second read before it is built.
- **The preset types other than `SIMPLE` and `LINEAR`**: the file uses none. **The processor types `CRS`, `PTC`,
  `ENV`, `LFO`, `EFO` and the band-pass filter**: used only by the player, speaker and effect presets, which a
  voice does not meet in TF2. Not read.
- **Soundscape scripts packed inside maps**, and whether anything sets `dsp_room` back to 0 between maps.
- **The surround paths** of the DSP (four and five channels: `0x1800375d0`, `0x180037d80`, `0x180037a40`,
  `0x180036c80`, `0x1800371a0`) and the facing-away, speaker and stereo-enhance presets.
- **`0x1800357e0`**, called at the start of each block's preset check, and the fast reset of the player slot
  (`0x180036360`). **The mixer's ducker.** Not read.
- **Whether the engine's random stream is seeded the same way each run.** It does not matter to the ear.
- Nothing more is needed from `client.dll`: the public SDK answers what the engine asks of the client. The one
  number the SDK does not hold is the player model's radius (`src/game/client/c_baseentity.cpp` 1883 takes it from
  the engine's model data), which W3-07 needed for the voice's "mono" step and settled from the recordings.
- No further file is needed from the owner. A console log from check 2 would be the most useful thing to have.

## Corrections to earlier reports

1. **W3-07, "DSPMIX = 0.1025 if a room DSP preset is active"**: the share is the active preset's. It is 26/256
   and 229/256 for presets 0 to 29 (mix 0.102; the header says 0.7 where the engine's start-up value is 0.8), and
   section 1's table for the automatic room. Each channel fixes its limits when it starts.
2. **W3-07, stage 3 (stereo enhance)**: off unless `dsp_enhance_stereo` is set; it is 0 at start.
3. **W3-07, the two-speaker level 253.5/256**: with the default mixer's 0.72 it is 182.6/256. The headphone level,
   255/256, stands.
4. **This order's brief, "`dsp_room 1`, the game's default"**: the engine starts at 0. The soundscapes of nearly
   every stock map set 1.
5. **REFERENCE's DSP line** ("26/256 of it passes the room's reverb"): should say "a share set by the room's
   preset: 26/256 for a numbered preset, 5 to 80 of 256 for the automatic room by shape".
6. **W3-07, "the takes were made where no preset was active"**: still the best reading, but it now means the place
   had `dsp_room` 0, which no stock map's soundscape gives. Worth asking the owner which map it was.
