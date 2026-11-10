# W3-07: from the voice channel to the speakers, as the engine does it

An investigation, 2026-11-10. No app code changed. Nothing of the game's files is in this repository: the report
describes behaviour in its own words and cites constants with the place they were read. Numbers from the owner's
private recordings are quoted; the recordings themselves stay private.

## Summary

| Question | Answer | Confidence |
| --- | --- | --- |
| 1. The voice source in the mixer | The mixer runs at a fixed 44100 Hz in device buffers of exactly 512 samples: that is the 512-sample pull. Steam voice is a 44100 Hz source at pitch 1.0, so it is **copied sample for sample**, with no interpolation and no filter, at a channel volume of 255/256 (253.5/256 with the two-speaker setting), centred, not attenuated, not positional. | Code: high. The volume: code in part, settled by the recordings |
| 2. Between the mix and the device | Sum of all sound, then a clip to +-32767, then `volume`, then rounding to 16 bits: in that order. No filter, no soft clip, no `[0.1, 0.8, 0.1]` anywhere. The engine hands 16-bit 44.1 kHz buffers to XAudio2, and **XAudio2 converts to the device's rate by linear interpolation**: that, not the engine, is the roll-off above 12 kHz in the 48 kHz recordings. Voice does pass the room DSP (a 26/256 share, only where a room preset is active) and the under-water DSP. | Code: high. The interpolation: not in the engine's file; measured in five recordings to 0.3 dB |
| 3. Listener B | **Not the output path.** PC B ran `volume 0.11` (its ceiling is exactly round(32767 x 0.11)) and `voice_scale 0.77`. The engine's gain law with that scale reproduces B's 1 kHz staircase to 1 to 3% and its 344.5 Hz sidebands to 1 dB. | High |
| 4. `voice_overdrive` | Confirmed: a voice source is exempt from it, and from the game's own ducker. | High |
| 5. The Model table | "Voice rate 44.1 kHz": confirmed. "Output stage `[0.1, 0.8, 0.1]` then `volume`": corrected to the chain above, with a linear interpolator to the device rate in place of the filter. | as above |

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
- The recordings used for checks are Set D's two FLAC files and three of Set B's (default, `voice_scale 0.5`,
  `voice_maxgain 1`), all 48 kHz. All five hold 16-bit samples in a 24-bit file (every sample is a multiple of 256).

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

### Is the voice spatialised or attenuated? No (read in part, inferred in part, settled by the recordings)

The spatialisation function (`0x180029440`) treats a sound as coming "from the listener" when its entity is the
current view entity (`0x1800294ce` to `0x180029506`; the second condition is a tool-framework flag that is off in
the game). Voice is started on the view entity, so it is. For such a sound (read):

- the source is placed 12 units straight ahead of the listener, level with him (`0x180029b5b`, the constant 12.0);
- the gain is `snd_gain` (1) passed through the distance curve for a 60 dB sound at 12 units, which comes out at
  **0.9943** (`0x1801fd1b0`: the uncompressed gain would be 3, and the curve above 0.5 is
  `1 - 1 / (2 x 2^2.5 x gain^2.5)`, times `snd_gain_max` 1);
- the occlusion test (`snd_obscured_gain_dB`) returns 1.0 at once for a sound from the listener (`0x180027f0e`), and
  the +2 dB that the listener's own *weapon* channel gets (`0x3FA12478`, at `0x18002a09e`) does not apply (the
  voice's entity channel is 8 and up, not 1);
- the sound-mixer groups of `scripts/soundmixers.txt` are applied as a factor (`0x18002a122` to `0x18002a1be`). Which
  group `?VoiceSfx` falls in is in that script, not in `engine.dll`;
- the "mono" factor is 1.0 when the source is nearer than half its entity's radius (`0x180029f17` to
  `0x180029f4a`). The radius comes from the game's client module, which was not read. Inferred: for the player it is
  more than 24 units, so the voice, at 12, is fully mono;
- with mono at 1.0 the pan law gives each side **0.9** in the headphone configuration and **0.5** in the two-speaker
  one (`0x18001f980`, `0x18001e369` to `0x18001e640`), whatever the direction;
- last, **for a sound from the listener with mono at 1.0 on a two-channel device, both speakers get
  `min(255, left + right)`** (`0x180027560`).

Putting the numbers in: headphones, `min(255, 2 x 255 x 0.9943 x 0.9)` = **255**; two speakers,
`min(255, 2 x 255 x 0.9943 x 0.5)` = **253.5**. So the voice is mixed centred, identical in both speakers, at
`out = trunc(s x 255 / 256)` (-0.034 dB; 32767 becomes 32639) or `trunc(s x 253.5 / 256)` (-0.084 dB; 32452).
The headphone configuration is what the default `snd_surround_speakers -1` selects (section 2).

**The recordings settle the one inferred step.** Had the mono factor been 0, the same code gives 0.646 per side
(-3.8 dB). In recording A the 1 kHz tone at -30 dBFS, where the gain sits at its cap of 10, comes out at 0.316 to
0.318 of the ceiling: a channel volume of 1.00 to 1.006 (the codec's own gain at 1 kHz is inside that). Recording B
gives the same once its `voice_scale` is known (section 3). So the volume is 255/256 or 253.5/256 and not 0.646;
the recordings cannot tell those two apart.

The volume is set at once when the channel starts (a "first pass" flag is set before the second spatialisation at
`0x18002a3e0`), so a restarted spurt does not fade in. Inferred from the flag's use, medium confidence; W3-03's
check of onsets in Set D agrees.

**One condition:** if the view entity changes while a voice channel is playing (a map camera taking over the view
is the case the code allows for), the channel's entity is no longer the view entity and the voice becomes an
ordinary positional sound at 60 dB. A channel lasts one run of speech, so this is rare. Not a concern for the model.

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
`dsp_db_mixdrop` 0.5 because a 60 dB sound is under `dsp_db_min` 80, and the distance is the 12 units above out of
`dsp_dist_max` 1440: `0.1 + 12/1440 x 0.3 = 0.1025` (`0x180029c4a` to `0x180029dbe`). So with a room preset the dry
voice is 229/256 of what it is without (-0.97 dB) and 26/256 of it goes through the room's reverb.

### The stages, in order, and whether voice goes through each (read)

| # | Stage (address) | What it does | Voice? |
| --- | --- | --- | --- |
| 1 | Channel mix (`0x180043390`) | `trunc(s x vol / 256)` added into the facing buffer (and the room buffer, if a room preset is active) | yes: vol 255 with no room preset; x 229/256 facing and x 26/256 room with one |
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

**The order is: mix, clip to 16 bits, then `volume`.** So the ceiling of the output is `round(32767 x volume)`,
which is finding 1. The clip acts on the **sum** of the voice and every other game sound. The voice's own clamp
(the automatic gain's, W3-03) sits a hair under the ceiling, at `round(32639 x volume)`, because of the 255/256;
a sample reaches the ceiling itself only when game sound on top of the voice pushes the sum past 32767.

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
- **So the conversion from 44.1 kHz to the device's rate is done by XAudio2, outside `engine.dll`**, after
  `volume` and after the rounding to 16 bits. The engine never resamples its output.
- **Channels.** The device's channel count comes from `snd_surround_speakers`: a negative value (the default, -1)
  or 0 gives two channels and sets the "headphones" flag; 2 gives two channels without it; 4 and 5 give six (5.1);
  6 gives eight; anything else two (`0x18002c4d9` to `0x18002c4fa`, `0x18027fe80`, `0x1802808cb` to `0x1802808f6`).
  Nothing in this path reads the system's speaker setting into the count (medium confidence: the variable has a
  change callback and two other readers that were not followed).

### Checked against the recordings

1. **The ceiling is the clip times `volume`, exactly.** Recording A's largest sample is 4915 in 16-bit units, which
   is round(32767 x 0.15), and 281,068 samples (4%) sit at exactly +-4915; none is above. Recording B's largest is
   3604, which is round(32767 x 0.11); none is above. The alternative reading (a ceiling at the voice's own 32639)
   would give 4896 and 3590.
2. **Flat tops survive the 44.1 to 48 kHz conversion bit for bit.** Runs of samples at the ceiling stay at exactly
   4915 in the 48 kHz file. A band-limited resampler would overshoot a clipped wave; an interpolator whose weights
   are never negative cannot. So the converter is of the second kind.
3. **It is linear interpolation.** A linear interpolator from 44100 to 48000 Hz leaves an image of a tone `f` at
   `f + 3900` and at `3900 - f` Hz (48000 - 44100 = 3900), at amplitudes `sinc^2((44100 -+ f)/44100)` relative to the
   tone, and second images at `7800 -+ f`. For 1 kHz that is -65.4 dB at 4900 Hz, -66.2 dB at 2900 Hz and -77.6 and
   -78.0 dB at 6800 and 8800 Hz. Measured on the unclipped 1 kHz tone in five recordings (Set D A and B, Set B
   default, `voice_scale 0.5` and `voice_maxgain 1`): **-64.5 to -65.5 dB at 4900 Hz, -64.3 to -66.6 dB at 2900 Hz,
   -71.5 to -78.4 dB at 6800 and 8800 Hz** (the noise floor is at -77 to -88 dB). Both PCs show it.
4. **The roll-off the model's FIR was fitted to is that interpolator's.** Its response to the tone itself is
   `sinc^2(f/44100)`: -0.95 dB at 8 kHz, -1.8 dB at 11 kHz, -2.6 dB at 13 kHz, -5.1 dB at 18 kHz. The model's
   `[0.1, 0.8, 0.1]` gives -1.08, -1.93, -2.56 and -3.98 dB: the same curve to 0.1 dB up to 13 kHz, which is as far
   as it was fitted.

That XAudio2 2.7 resamples by linear interpolation is not read from any file here (`XAudio2_7.dll` is a system
file). It is what the recordings show, to within 0.3 dB on the first images.

## 3. Listener B

**It is not the output path.** Recording B differs from the model in two settings of PC B, and the engine code
explains every number once they are known:

- **`volume` was 0.11, not 0.077.** B's ceiling is 3604 = round(32767 x 0.11) exactly (check 1 above). The 0.077 in
  REFERENCE was fitted to levels, and the levels are lower for the next reason.
- **`voice_scale` was 0.77** (the receive-volume slider of the voice options is this variable). W3-03 read the gain
  law: a block starts at `scale^2 x T` and ramps toward `scale x T` in whole steps of 1/128 per sample, truncated.
  With scale 0.77 the ramp's step is 1 while the gain is near the cap of 10, and **0 for a loud signal**, where
  `T x 0.77 x 0.23` is under 1: then the gain is a constant `0.593 x T`, which for a sine is 0.724 of full scale.
  The sine is not clipped at all.

The engine's gain law, run on a 1 kHz sine at 44.1 kHz with scale 0.77, against recording B (amplitude of the 1 kHz
component as a share of the ceiling; the sidebands are at +-344.5 Hz, the 128-sample block rate):

| Step of the test signal | Predicted, scale 0.77 | Recording B | Recording A (scale 1: predicted, measured) |
| --- | --- | --- | --- |
| -30 dBFS | 0.203, sidebands -32.1 dB | 0.196 to 0.202, -32.3 to -32.8 dB | 0.316, 0.316 to 0.318, no sidebands |
| -24 dBFS | 0.405, sidebands -32.1 dB | 0.415 to 0.418, -32.8 to -33.1 dB | 0.631, 0.649 to 0.654 |
| -18 dBFS | 0.787, sidebands -31.8 dB | 0.785 to 0.787, -32.3 to -32.6 dB | clipped: third harmonic -22.8 dB, measured -22.2 dB |
| -12, -6, -1 dBFS | 0.721 to 0.724, no sidebands, third harmonic under -77 dB | 0.716 to 0.728, sidebands and third harmonic at the noise floor | clipped, as above |

(The 3% by which both recordings exceed the prediction at -24 dBFS is the codec's.) A lower `voice_maxgain` or a
`voice_avggain` of 1 on PC B does not fit: neither gives sidebands that come and go with level.

So the two things REFERENCE reports about B follow. The peaks stand above "the clamp for 0.077" because the
ceiling is at 0.11: the largest sample is 3.1 dB above it (REFERENCE gives 2.5 dB; how it took its peak was not checked). And
almost no samples sit there (4,246 of 7.4 million, 0.06%, at the ceiling itself, against 4% in A) because with this
scale a loud tone's plateau is at 0.72 of the ceiling, unclipped, and only peaks of noise-like sound and the game's
own sounds on top of the voice reach the clip.

**None of the output-path candidates is needed, and each is ruled out by the same recording:** a second back end, a
device that is not 16-bit, a float mix or a surround mode would not produce block-rate sidebands that depend on
level, and B shows the same interpolation images as A at the same levels (check 3), so its device path is the same
kind as A's.

**To test it:** on PC B, type `voice_scale` and `volume` in the console. Predicted: about 0.77 and 0.11. Then set
`voice_scale 1` and repeat the take: predicted, B's clipped share rises to A's and its levels match the model at
`volume 0.11`.

## 5. What the Model table should say for this stage

| Row of the Model table | Verdict | What the code says |
| --- | --- | --- |
| Voice rate 44.1 kHz | **Confirmed**, and stronger: the whole mixer runs at a fixed 44100 Hz in 512-sample device buffers; the voice is copied into the mix sample for sample. | section 1 |
| Output stage: 3-tap `[0.1, 0.8, 0.1]` at 44.1 kHz | **Corrected.** There is no such filter in the engine. On a device that runs at 48 kHz, XAudio2 resamples the engine's 44.1 kHz output by linear interpolation, whose response is `sinc^2(f/44100)` with images at `3900 -+ f` and `7800 -+ f` Hz. The FIR matches that response to 0.1 dB up to 13 kHz and is 1.1 dB too bright at 18 kHz; it has no images. On a device that runs at 44.1 kHz there is nothing to model (inferred; no take was made that way). | section 2, checks 2 to 4 |
| then `volume` | **Confirmed, with the order:** sum of all sound, clip to +-32767, times `volume` (times `1 - soundfade`), round to nearest 16-bit. The "clamp" of finding 1 is that clip, and it is on the sum of the voice and the game's other sound. | stages 9 to 11, check 1 |
| (not in the table) the voice's level into the mix | `trunc(s x 255/256)`: -0.034 dB, truncated toward zero (so 1 to 128 lose one unit more than rounding would). 253.5/256 with `snd_surround_speakers 2`. | section 1 |
| (not in the table) DSP | The voice is not dry. Where a room DSP preset is active (a soundscape's, or `dsp_room`), 26/256 of it passes the reverb and the direct part is 229/256 (-0.97 dB). Under water the whole output, voice included, passes the `dsp_water` preset. The takes were made where no preset was active: a direct part at 229/256 would show as a level 0.97 dB low, and A's level is within 1% of the full one. | section 2 |
| Auto-gain row, `voice_scale 1` | Unchanged; but note for the takes file that PC B ran `voice_scale 0.77` and `volume 0.11`. | section 3 |

## The rule

```
constants
  MIX_RATE   = 44100                      # fixed; the mixer never runs at another rate
  BLOCK      = 512 samples                # one device buffer, 11.6 ms
  AHEAD      = snd_mixahead (0.1 s)       # at most int(AHEAD * 44100/512 + 1) = 9 blocks queued, of a ring of 13
  VOL        = 255                        # headphones (snd_surround_speakers -1 or 0); 253.5 with 2
  DSPMIX     = 0.1025 if a room DSP preset is active (and not dsp_off), else 0

every frame, and again whenever 0.9 * AHEAD has passed:
    while queued blocks * BLOCK / MIX_RATE < AHEAD and the device has a free buffer:
        paint one block

paint one block:
    for each voice channel that is playing:
        v = the next 512 samples from its ring          # W3-03's rule: fade, underrun, starve
        facing += trunc(v * (VOL * int(256 - DSPMIX*256) / 256) / 256)      # = trunc(v * 255/256) with no room preset
        room   += trunc(v * (VOL * int(DSPMIX*256)       / 256) / 256)      # = 0 with no room preset
    (every other sound is mixed into its buffers, non-voice sounds times the voice_overdrive duck)
    room = room_dsp(room)                               # pass-through with no preset
    out  = room + facing
    if the listener is under water: out = water_dsp(out)
    out  = player_dsp(out)                              # pass-through unless the game set dsp_player
    out += dry                                          # music and other '#' sounds
    out  = clamp(out, -32767, 32767)                    # per sample, per side
    pcm  = round_to_nearest(out * volume * (1 - soundfade))   # 16-bit, saturating; cannot saturate after the clamp
    submit pcm to XAudio2 as 16-bit stereo at 44100 Hz

outside the engine (XAudio2 2.7, measured, not read):
    the device plays y[m] = x[k] + frac * (x[k+1] - x[k]),  position = m * 44100 / device_rate,
    k = floor(position), frac = position - k            # linear interpolation; nothing when device_rate is 44100
```

## Disagreements with the measured model and with REFERENCE

1. **The output stage.** Not a 3-tap filter in the game but a linear interpolator in XAudio2, and only when the
   device does not run at 44.1 kHz. Same roll-off to 13 kHz, steeper above, plus images 65 dB down at 1 kHz (they
   grow with frequency: a 10 kHz tone has an image at 13.9 kHz about 21 dB down).
2. **"The output stage adds a small post-clip roll-off that may come from the recording chain"** (What remains
   unverified): it comes from XAudio2, between the game and the device, so every listener with a 48 kHz device
   hears it; it is not the recorder's.
3. **Listener B** (Results; Set D's "about 0.077 on PC B"; finding 15's "6 dB lower overall, which is its
   `volume`"): `volume 0.11` and `voice_scale 0.77`. The output path is the same as A's.
4. **"Samples at the clamp"** in the accuracy table compares two different things: in a take, samples reach the
   ceiling only when game sound adds to the voice's plateau, which is 0.4% under it (19 units of 4915 at
   `volume 0.15`). The share at the exact ceiling depends on the game's ambience; the share within a few percent of
   it does not.
5. **Level of the voice in the mix:** 255/256, truncated toward zero. Too small to hear or to see in a take, but a
   sample-exact comparison with the game's output needs it.
6. **The voice is not exempt from DSP.** The model has no room or water stage. Right for the takes; wrong for a
   listener standing in a room with a reverb preset, or under water.

## Checks the owner could run

1. **PC B's settings.** `voice_scale` and `volume` in PC B's console. Predicted: about 0.77 and 0.11.
2. **The device rate.** Set the Windows playback device to 44100 Hz (16 or 24 bit), record the test signal as
   before, and look at a clean 1 kHz tone (the -30 dBFS step). Predicted: the lines at 2900 and 4900 Hz are gone
   (they are at -65 dB with the device at 48000 Hz), and the level of the tones at 10 to 13 kHz rises by 1.5 to
   2.6 dB. If the recorder then converts to 48 kHz itself, its own converter's traces replace them.
3. **Under water.** Stand under water (the moat on 2fort) while a voice plays. Predicted: the voice is muffled with
   everything else, and comes back with `dsp_off 1` if the server allows the variable.
4. **`snd_pitchquality 0`.** Predicted: no change at all in a voice take.
5. **`volume 1` on a silent map** (no ambience near the player). Predicted: the largest voice sample in a 16-bit
   capture at the device's rate is 32639, not 32767; with `snd_surround_speakers 2` it is 32452.
6. **`snd_mixahead 0.05`.** Predicted: the voice is heard about 50 ms sooner; the log's pulls stay at 512 samples.
7. **A room with reverb.** Where footsteps echo, a loud voice's plateau should drop to 229/256 of the ceiling
   (-0.97 dB) with a reverb tail on it. `dsp_off 1` restores it.

## What was not read

- **XAudio2 itself** (`XAudio2_7.dll`, a system file): its resampler is described from the recordings. Its exact
  arithmetic (fixed-point precision, the phase it starts at) is not known; the recordings fix the kernel.
- **The surround paths**: what a 5.1 or 7.1 configuration does to a sound from the listener (a table of front 0.30,
  centre 0.59 and rear 0.09 times the summed volume was seen at `0x180027647`, and a general channel conversion at
  `0x18001b010`), and what XAudio2 does when the engine's channel count exceeds the device's.
- **The DirectSound device** (`-directsound`), beyond the fact that it exists and is the fall-back.
- **The stereo pan law line by line** for a mono factor between 0 and 1, and the function that stores the speaker
  volumes on the channel (`0x1800214a0`): the volume of 255 rests on the pieces cited and on the recordings.
- **The client module's side of spatialisation** (the entity radius that makes the voice mono).
- **`scripts/soundmixers.txt`**: which mix group the voice falls in and that group's level. A level under 1 would
  lower 253.5 in the two-speaker configuration but not 255 in the headphone one, unless it were under 0.56.
- **The call made just before each buffer is submitted** (`0x1800163d0`, in `audio_stream.cpp`): it is handed the
  final float buffers; whether it only copies them elsewhere or can add to them was not read.
- **The DSP presets' contents**, the automatic room choice, and what sets the "underwater" flag.
- **Why a few pulls in W3-03's log are 513 or 1025 samples.**
- **`snd_surround_speakers`' other readers** (`0x180031107`, in the per-frame update; `0x1800432a0`, movie
  recording, which forces 2).
