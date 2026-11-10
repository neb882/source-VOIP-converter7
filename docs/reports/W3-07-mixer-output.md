# W3-07: from the voice channel to the speakers, as the engine does it

An investigation, 2026-11-10. No app code changed. Nothing of the game's files is in this repository: the report
describes behaviour in its own words and cites constants with the place they were read.

**Status of this file:** written in stages and committed as each question was answered. "What was not read" at the
end is the list of what is still open.

## How it was read

- `bin/x64/engine.dll`, SHA-256 `4802a74ce0abb1175851d00e37fc88609085a96238aa52ac0eb224ae4a08ec80`, the same file
  W3-03 read (PE32+ x86-64, image base `0x180000000`). Addresses below are virtual addresses in that image.
- The file was read as data with a disassembler library and never executed. Functions were found from the debug
  strings the binary itself carries (`S_Update_Guts`, `MIX_PaintChannels`, `MIX_MixChannelsToPaintbuffer`,
  `MixDataToDevice`, `CAudioMixerWave::MixDataToDevice_`, the source file names `snd_dma.cpp`, `snd_mix.cpp`,
  `snd_wave_mixer.cpp`), from the run-time type names (`CAudioXAudio2`, `CAudioDirectSound2`, `CAudioDeviceNull2`,
  `CAudioMixerWave16Mono`, `CAudioSourceVoice`, `CEngineSoundServices`), and from each console variable's object,
  whose value every reader loads through the pointer at offset 0x38 (integer at +0x58, float at +0x54), as in W3-03.
- Names of functions and structures below are the binary's own where it prints them, otherwise **labels of mine**.
  Console variable names and the sound-name characters (`#`, `?`, `>` and the rest) are as the Valve Developer Wiki
  documents them; `CHAN_VOICE_BASE` and `SNDLVL_60dB` are from the public SDK's `public/soundflags.h`.
- No leaked source was consulted or looked for.
- Every statement is marked **read** (the instructions say so) or **inferred** (a conclusion from what was read).

## 1. The voice source in the mixer

### The mix runs at 44100 Hz in blocks of exactly 512 samples (read)

`S_Update_Guts` (`0x180031510`) is given the mix-ahead time in seconds. With a device present and no movie being
recorded it does this:

```
queued  = device.buffers_queued() * 512 / 44100          # shl 9, then times 1/44100 (0x37BE37C6)
ahead   = mixahead - queued
if ahead > 0:
    n = int(ahead * 86.1328 + 1.0)                        # 86.1328 = 44100 / 512  (0x42AC4400)
    n = min(n, device.buffers_free())
    repeat n times:
        MIX_PaintChannels(paintedtime + 512)              # lea ebx, [rax+0x200]
```

So the unit of mixing is one device buffer of **512 samples at 44100 Hz** (11.6 ms), whatever the output device's own
rate. `MIX_PaintChannels` (`0x180046910`) can take up to 1020 samples a pass (`0x3FC`, the limit W3-03 saw), but it
is only ever asked for 512, and the stage after it copies exactly 512 (`cmp rax, 0x200` in the transfer function,
`0x18001f1a0`). **This is where the 512-sample pulls in the owner's log come from**: each line
`Voice - mixed N samples` is one device buffer being painted. The rate 44100 is a constant of the code
(`0xAC44` in the device's constructor at `0x1802804a4`, in the per-rate passes below, and in the two constants
above); nothing reads the device's rate into the mixer. Confidence: high.

**Mix-ahead (read).** `S_Update` calls this once a frame with `snd_mixahead` (0.1), and an "extra update"
(`0x18002b350`, called from many places in a frame unless `snd_noextraupdate` is set) calls it again when at least
0.9 x `snd_mixahead` has passed since the last one. With 0.1 s the mixer keeps `int(0.1 * 86.13 + 1)` = 9 buffers
queued at most: 104 ms. The device is created with a ring of **13** such buffers (`0xD` at `0x18002c517`). At
300 frames a second a buffer is painted as soon as the device has finished one, so the pulls come one every
11.6 ms: once or twice per 15 ms tick, which is what the log shows. What lies behind the queue (the system's own
mixer and the device) adds a fixed delay the engine cannot see.

### How a voice channel is started (read; `0x18005b960`, called from the voice tick W3-03 read)

The sound is started with: the voice source for that channel (its name is `?VoiceSfx`), **volume 1.0, pitch 100,
sound level 60 dB** (`0x3C`; 80 dB for "proximity" voice, which this game does not use), entity channel
`8 + channel number` (`CHAN_VOICE_BASE`), no flags, no delay, "follow the entity" on, and as its entity **the
listener's own view entity** at that moment.

### The mixer's passes, and which the voice is in (read)

Each 512-sample block, `MIX_PaintChannels` clears its buffers and mixes every active channel into them
(`0x180042870`), in three passes by the source's sample rate: sources at 11025 Hz, then every buffer is upsampled by
two; sources at 22050 Hz, then upsampled by two again; then sources at 44100 Hz (`0x2B11`, `0x5622`, `0xAC44`; a
channel is mixed only in the pass whose rate equals its source's rate, `0x180040cbc` to `0x180040ce4`).

- **Steam voice is a 44100 Hz source, so it is mixed in the last pass and no upsampling touches it.**
- The upsampling by two (`0x1800460e0`) is linear: each input sample is kept and the sample between two is their
  mean (an arithmetic shift, so rounded down). That is what `vaudio_celt` and `vaudio_celt_high` (22050 Hz) go
  through once and `vaudio_speex` (11025 Hz) twice, as the app's legacy profiles already assume (`mixer: 'linear'`).

### Pitch and rate conversion: none for voice (read)

`CAudioMixerWave::MixDataToDevice_` (`0x18004f0c0`) computes
`rate = source rate x channel pitch / 44100`. For Steam voice that is 44100 x 1.0 / 44100 = 1.0. It then asks
(`0x180040160`) whether to interpolate: only if `snd_pitchquality` is non-zero **and** the sound is not marked for
fast pitch **and the pitch is not a whole number**. A pitch of exactly 1.0 is a whole number, so voice takes the
non-interpolating loop, with the rate as a 28-bit fixed-point number that is exactly `0x10000000`. That loop
(`0x180043390`, entered through `0x18001dac0` and `0x180047650`) has a special case for exactly that rate: **a
straight copy, sample for sample.** For each 16-bit sample `s` and each of the two front speakers:

```
paint[i].left  += trunc( float(s) * vol_left  * (1/256) )      # 0x3B800000; cvttss2si truncates toward zero
paint[i].right += trunc( float(s) * vol_right * (1/256) )
```

where the paint buffer holds a pair of 32-bit integers per sample and `vol` is a float between 0 and **255**.
`snd_pitchquality` therefore has no effect on voice, there is no interpolation filter, and the voice is mixed at
44.1 kHz whatever the device runs at. (The pitch is multiplied, for the duration of the mix, by a time-scale factor
that is 1.0 outside demo playback at another speed, `0x180040c07` to `0x180040da6`. In a demo played at another
speed the voice would be resampled; with `snd_pitchquality 1` by a linear interpolator, 14 fractional bits.)

### Is the voice spatialised or attenuated? Not in normal play (read, with one condition)

The spatialisation function (`0x180029440`) treats a sound as coming "from the listener" when its entity is the
current view entity (`0x1800294ce` to `0x180029506`; the second condition is a tool-framework flag that is off in
the game). Voice is started on the view entity, so it is. For such a sound:

- no direction is computed: the source is placed 12 units straight ahead, and the "mono" factor is 1.0;
- no distance attenuation: the gain is `snd_gain` (1) and nothing else (the 60 dB sound level is ignored on this
  path; the occlusion test, `snd_obscured_gain_dB`, returns 1.0 at once for a sound from the listener,
  `0x180027f0e`);
- the +2 dB that the listener's own *weapon* channel gets (`0x3FA12478` = 1.2589, at `0x18002a09e`) does not apply
  (the voice's entity channel is 8 and up, not 1);
- the sound-mixer groups of `scripts/soundmixers.txt` are applied as a factor (`0x18002a122` to `0x18002a1be`). Which
  group `?VoiceSfx` falls in is in that script, not in `engine.dll`. It does not matter in stereo, see next.
- then, **for a sound from the listener on a two-channel device, both speakers get `min(255, left + right)`**
  (`0x180027560`): the two speaker volumes are added and clamped. With volume 1.0 each side is 255 before this, so
  the result stays 255 unless something has already cut the sound to under half.

So the voice is mixed centred, the same in both speakers, at a channel volume of **255 out of 256**
(-0.034 dB): `out = trunc(s x 255 / 256)`. A full-scale voice sample of 32767 becomes 32639; -32768 becomes
-32640. Confidence: high for the path, medium for "255 exactly" (it rests on the stereo spatialiser returning at
least 128 per side for a centred mono sound, which was not read line by line; the recordings' ceiling at 0.98 of
`volume` x full scale on PC A fits 255 and rules out any pan law such as 0.707).

The volume is set at once when the channel starts (a "first pass" flag is set before the second spatialisation at
`0x18002a3e0`), so a restarted spurt does not fade in. Inferred from the flag's use, medium confidence; W3-03's
check of onsets in Set D (the recording is at ten times the decoded level from the first 1.3 ms) agrees.

**The condition:** if the view entity changes while a voice channel is playing (a map camera taking over the view
is the case the code allows for), the channel's entity is no longer the view entity and the voice becomes an
ordinary positional sound at 60 dB, attenuated by distance from the old entity. A channel lasts one run of speech,
so this is rare. Not a concern for the model.

### `voice_overdrive` never changes the voice itself (read; question 4)

In the function that turns a channel's volumes into the numbers the mix loop uses (`0x180041fb0`), the duck factor
is the lower of the voice-overdrive value (`0x180463450`, an integer out of 256, the one W3-03 found) and the
general ducker's (`0x1804620CC`). It is applied only if the channel's source says it is **not** a voice source
(`0x18004205c` to `0x180042076`: the mixer's source is asked through its "is voice" method, and a voice source
skips the multiplication). So voice is exempt from its own ducking and from the game's ducker as well. Confirmed,
high confidence.

## 2. Everything between the mix and the device

### The buffers (read)

The mixer has a set of paint buffers (stride `0x158` in the table at `0x1804E9DF8`), of which these matter:
index 0 the output, 1 "room", 2 "facing", 3 "facing away", 4 "dry", 5 "speaker", 6 and up special DSP. A channel
whose name carries `#` goes to the dry buffer (the flag is set from the name at `0x18002dc10`); one flagged as
coming through an in-game speaker goes to buffer 5; one with a special DSP to its own buffer. **Everything else,
voice included (`?VoiceSfx` has no `#`), goes to the room and facing buffers**, split by the channel's "DSP mix"
(`0x180041fb0`):

```
dspmix = 0                         if dsp_off, or if the room DSP slot holds no preset     (0x180042004..0x18004202f)
       = the channel's value       otherwise; for voice 0.1025  (see below)
room   volume = vol * min(256, int(dspmix * 256 * dsp_volume)) / 256
facing volume = vol * int(256 - dspmix * 256) / 256           (times a "facing" factor that is 1 for voice)
```

For voice, when a room preset is active: the mix limits are `dsp_mix_min` 0.2 and `dsp_mix_max` 0.8, both halved by
`dsp_db_mixdrop` 0.5 because the sound level counts as under `dsp_db_min` 80 on this path, and the distance is the
12 units above out of `dsp_dist_max` 1440: `0.1 + 12/1440 x 0.3 = 0.1025` (`0x180029c4a` to `0x180029dbe`).

### The stages, in order, and whether voice goes through each (read)

| # | Stage (address) | What it does | Voice? |
| --- | --- | --- | --- |
| 1 | Channel mix (`0x180043390`) | `trunc(s x vol / 256)` added into the facing buffer (and the room buffer, if a room preset is active) | yes: vol 255 with no room preset; 229 facing + 26 room with one |
| 2 | Room DSP (`0x1800470a5`.., slot from `dsp_room`, or the automatic one when `dsp_room` is 1) | the reverb preset, on the room buffer only | only the 26/256 share, and only when a preset is active |
| 3 | Stereo enhance (`0x1800470dd`.., `dsp_enhance_stereo`, slot `dsp_spatial`) | on the room buffer only, and only if a room preset is active | as 2 |
| 4 | Facing-away DSP (`dsp_facingaway`, default 0) | on buffer 3 | no |
| 5 | Sum (`0x180040ff0` called at `0x180047251`) | output = room + facing, as integers; the gain argument is the constant 1.0 (`0x1804620D0`, never written), so no scaling | yes, unchanged |
| 6 | Water DSP (`0x180047256`.., slot `dsp_water`, default preset 14) | on the output buffer, **only while the engine's "underwater" flag for the block is set** | **yes, when the listener is under water** |
| 7 | Player DSP (`0x1800472c5`.., slot `dsp_player`, default 0) | on the output buffer, always called; passes the samples through untouched when the slot holds no preset | yes when the game has set one (it is 0 otherwise) |
| 8 | Add the dry buffer (`0x180047399`) | output += dry (music and other `#` sounds), gain 1.0 | (voice is already in the output) |
| 9 | **Clip** (`0x1800473b9` to `0x1800474ba`) | every output sample, each side, clamped to **-32767 .. +32767** (`0x7FFF` and `0xFFFF8001`) | yes: the sum of voice and all game sound |
| 10 | **`volume`** (`0x18001f1a0`, factor from `0x18002bf20`) | the 512 samples are converted to floats and multiplied by `volume x (1 - fade)`, where fade is the `soundfade` command's percentage (0 in play) | yes |
| 11 | Device output (`0x180280b10` for XAudio2) | each float is rounded to the nearest 16-bit integer with saturation (`cvtps2dq` then `packssdw`, `0x18001a8d0`) and the buffer is submitted | yes |

A DSP call returns without touching the samples when `dsp_off` is set, when the slot number is not valid, or when
the slot holds no preset (`0x18003fca0` to `0x18003fd0a`), so with no preset active stages 2, 3, 6 and 7 are exact
pass-throughs.

**There is no filter in this chain.** No low-pass on the paint buffer, no "soft clip", no `[0.1, 0.8, 0.1]` and no
other fixed FIR between the voice channel and the 16-bit samples handed to the device. The only filters are the DSP
presets (reverbs and the like), which the voice does not meet with no preset active, and the linear upsampler,
which is only for 11 and 22 kHz sources. High confidence.

**The order is: mix, clip to 16 bits, then `volume`.** So the ceiling of the output is
`round(32767 x volume)`, which is finding 1. And the voice's own clamp (the automatic gain's, W3-03) sits a hair
under it: `round(32639 x volume)`, 0.034 dB lower, because of the 255/256.

**`volume` is the only thing in stage 10.** `snd_musicvolume` acts on dry-buffer sounds at spatialisation, not here;
`dsp_volume` scales the room share only. `snd_mute_losefocus` (default 1) zeroes every channel's volumes while the
game window is not the active one (`0x18004230a` to `0x180042343`).

### The device (read)

- **Three back ends** (`0x18027fc50`): XAudio2 by default; DirectSound with `-directsound` on the command line, or
  if XAudio2 fails to start; a null device with `-nosound`. The engine loads `XAudio2_7.dll` by name.
- **The XAudio2 device** (`0x180280140`, `0x1802807a0`) creates a mastering voice with the default channel count and
  sample rate (both arguments zero, so the system device's own format), and one source voice whose format is
  **16-bit integer PCM, 44100 Hz** (format tag 1, bits `0x10`, rate `0xAC44`), with a maximum frequency ratio of
  2.0. Each painted block is submitted as one buffer of 512 frames.
- **So the conversion from 44.1 kHz to the device's rate is done by XAudio2, outside `engine.dll`**, and after
  `volume` and after the conversion to 16 bits. The engine never resamples its output.
- **Channels.** The device's channel count comes from `snd_surround_speakers`: a negative value (the default, -1)
  or 0 gives two channels and sets a "headphones" flag; 2 gives two channels; 4 and 5 give six (5.1); 6 gives
  eight; anything else two (`0x18002c4d9` to `0x18002c4fa`, `0x18027fe80`, `0x1802808cb` to `0x1802808f6`).
  Nothing in this path reads the system's speaker setting into the count.
