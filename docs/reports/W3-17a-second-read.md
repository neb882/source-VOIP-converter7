# W3-17a, second reader: `room-dsp.js` against the engine and against the recordings

Branch `claude/w3-17a-room-module` at `b128237`, read only. The owner's `engine.dll` (image base `0x180000000`)
was read as data with capstone and never executed; no leaked source was looked for or used. Nothing of the
binary is reproduced here: words, formulas, addresses. From the recordings only numbers.
Marks: **confirmed** = the module does what the code at that address does; **different** = it does not.

## Summary

- The module's steady state (a fixed room, or made under water) was not found wrong anywhere I read, and the
  recordings now support it further than before: the comb-peak gap of Set C is **not** an error of the module or
  of the model. It came from the fit's input (the played signal, full band, in place of the voice as it reaches
  the mixer). With the take's source rendered through the app's dry path and then the module, the four comb
  peaks fit to 1 to 7%.
- What is different from the engine is all in **changes while running** (parts c and d's live use): the slot's
  ramp is one sample late and the fade ends too early (F1), the "before" preset and the shares switch one block
  off (F2), setting "none" does overwrite the four mix values (F3), and **the water has no fade and no fresh
  instance in the engine at all** (F4). No recorded hash or tail length of part a changes with any of these.

## Part 1: the module against the binary

| # | Piece of `room-dsp.js` | What the engine does | Where | Verdict |
| --- | --- | --- | --- | --- |
| 1 | A change is taken at a block's start, only when no fade runs | once per paint call (one 512-sample block: W3-07, not re-read; the loop's own cap is 1020) the update compares each slot's variable with the number last used and sets the preset only if the slot's ramp-done flag is set | `0x1800469ce`, `0x18003f254` to `0x18003f29c` (room), `0x18003f2a2` to `0x18003f2d1` (water) | confirmed |
| 2 | `out = old + (((new - old) x r) >> 12)`, both on the same input | the same, 32-bit, arithmetic shift; a squared form exists for a negative fade time | `0x180038472` to `0x18003848d`, `0x1800385b8` to `0x1800385e8` | confirmed |
| 3 | The ramp against the samples (`RAMP_STEPPED_BEFORE_USE = false`) | **stepped before use**: each faded sample first steps the ramp, then uses the value that call returned | `0x1800383de` to `0x180038472`, `0x18003851b` to `0x1800385b8` | **different**, F1 |
| 4 | The fade's end (new preset alone from the sample after "done") | the call that reports done repeats the last weight (4095) and that sample is still mixed; **the weight then stays 4095 with both instances running to the end of that block**; the old instance is dropped at the next block's slot stage | `0x1800383b3` to `0x1800383c9`, `0x18003fd21` to `0x18003fd3a`, `0x1800364e0` | **different**, F1 |
| 5 | "Before" is cleared when the fade to none has ended (`SHARES_CLEARED_AFTER_FADE_TO_NONE = true`) | it is cleared (the constant's reading is the right one): by the routine that frees the old instance, called at the first slot stage after the ramp is done, or by the next set | `0x180036595`, called from `0x18003fd3a` and `0x18003894a` | confirmed that it is cleared; the moment is **different**, F2 |
| 6 | `shares()`: 0/256 while the room slot holds nothing now and before, tested per block | the test is in the per-channel mix, each block; the block's order is update (take), then mix (shares), then the slot | `0x180042004` to `0x18004202f`, `0x180038860`; order `0x1800469ce`, `0x180046cd9`, `0x1800470d8` | confirmed; the order inside a block is **different**, F2 |
| 7 | During a fade the old instance runs first | the new (current) instance is called first, then the old | `0x1800383a0`, `0x1800383ae`; `0x1800384cc`, `0x1800384e3` | **different**, draws only, F5 |
| 8 | Reading 3: the four mix values change when the slot takes the preset, from its header | in the set routine, for the room slot and the automatic slot, from the **new** instance's header, each time | `0x1800389a1` to `0x180038a31` | confirmed |
| 9 | Setting "none" leaves the four values | "none" is preset 0, which has an instance and a header like any other (0.2, 0.7, 80, 0.5 in the owner's file): the four values **are** overwritten | `0x180038927` (instance of the number, 0 included), `0x1800389c6`; allocator `0x18003c508` to `0x18003c593` | **different**, F3 |
| 10 | Fade times 0.2 s (room) and 0.1 s (water); steps 486957 and 973915 | room and automatic slots 200 ms, water and player 100 ms, speaker and stereo 300 ms, in both routines that make the slots; seconds = ms x 0.001 in single; `n = trunc(s x 44100)`, step `trunc(4096 / n x 2^20)` with the over-4095 rule, limit 4096 | `0x18003eea7`, `0x18003ef1e`, `0x18003ef97`; `0x18003591f`, `0x180035996`; `0x18003573d`; `0x180038b02` to `0x180038b5f` | confirmed. **The water slot's own time is 100 ms** (the amplifier's read assumed 200); but see row 11 |
| 11 | `setWater`: the water preset cross-fades in and out over 0.1 s, a fresh instance each time | **there is no such fade.** The water slot holds `dsp_water`'s preset (14) from the moment the slots are made; the mixer simply calls it, or does not, block by block, on a flag of the listener. Its 100 ms would only serve a change of `dsp_water` itself | `0x180047256` to `0x18004729b`; the flag `0x18048de1c`, written at `0x180030c6c`, passed at `0x1800317d7` | **different**, F4 |
| 12 | Order: room slot on the room buffer, sum with the direct buffer, water on the sum, then the clip | room buffer through the slot in use; (stereo enhance, off); output = room + facing at gain 1; under water the whole output through the water slot; player slot (preset 0); the dry buffer added; clip at +-32767 | `0x1800470a5` to `0x1800470d8`, `0x180047251`, `0x180047256` to `0x18004729b`, `0x18004732d`, `0x180047399`, `0x1800473c2` | confirmed: under water the direct part passes preset 14 too |
| 13 | The app is mono throughout | a one-channel slot on the two-channel buffer takes `(L + R) >> 1`, runs the preset, writes the result to both sides; in a fade the "none" side is the untouched L and R | `0x1800382f0` to `0x180038303`, `0x180038320` to `0x18003834a`, `0x180038391` to `0x18003839c`, `0x1800384b0` to `0x1800384f3` | confirmed: for a centred voice L = R, the fold is exact, and one side is the app's signal |
| 14 | Reading 1: the chain per sample | outside a fade a plain chain runs each processor's block routine over the whole block, in order; in a fade the per-sample chain | `0x1800382cc` to `0x18003834a`, `0x18003ca80`; `0x18003c630` | confirmed: every processor is causal with its own state, so only the order of draws between processors differs (the processors' block routines themselves were not re-read) |
| 15 | Reading 10: a negative factor in later rounds is quartered with or without a loop filter | the quartering (floor 7) and the extra are in the delays' build, which does not look at the filter flag | `0x18003deb0` to `0x18003df45` | confirmed |
| 16 | Reading 12: the range tables and the rule for 0 | tables of (low, high) singles; a value is clamped only if it is not 0 and lies outside; `RVA`, `DLY`, `DFR`, `AMP`, `MDY` tables equal the module's, single for single (compared by program) | routine `0x18003c030`; tables `0x180462450`, `0x180462320`, `0x1804625a0`, `0x180462750`, `0x1804623b0` | confirmed (the binary's `MDY` count is 13: a 13th value other than 0 becomes 0; unused) |
| 17 | Shares: `M = mix x 256`, room `min(trunc(M), 256)`, direct `trunc(256 - M)` | the same in single; the channel's volumes times the share times 1/256 | `0x18004200e` to `0x18004201f`, `0x1800420b5` to `0x1800420c6`, `0x18004216c` to `0x180042179`, constant `0x1803622b0` | confirmed |
| 18 | A slot made with a preset starts settled, lines silent | made with its variable's number, done flag set, one fresh instance per channel | `0x180035706` to `0x180035758` | confirmed |
| 19 | The same number as now changes nothing; a number the table lacks changes nothing | equal to the current number: return; negative or not below the template count: return (the update still records it as used) | `0x1800388e6` to `0x180038903`, `0x18003f288` | confirmed for a number past the file's last; see note N3 |
| 20 | Reflectivity exactly 0.8 (part b; the model gives class 3) | above 0.04 as a double; at most 0.5 as a single; above 0.8 **as a double against the double 0.8** | `0x1800324c1` to `0x18003254c`, constant `0x1803613b8` | the model is right: single 0.8 is class 3. The second read's "up to 0.8" holds for every other value |
| 21 | Reading 4: when a channel's limits are fixed | not re-read (the second read's account stands) | | not checked |

### Findings

**F1. Should fix. The slot's cross-fade is one sample late and ends early.** `room-dsp.js` lines 51 to 55
(`RAMP_STEPPED_BEFORE_USE`), 793 to 823. Engine (rows 3, 4): for a change taken at sample 0 of a block, sample
`k` uses the ramp's `(k + 1)`-th value (0, 0, 1, 1, 2 ...; 4095 on sample 8819); on sample 8820 the ramp reports
done and repeats 4095; **samples 8821 to 9215 are still `old + (((new - old) x 4095) >> 12)`, the old instance
still running and drawing**; from sample 9216 (the next block) the new preset is alone and the old one is freed.
The module uses weight 0 on sample 0, the `k`-th value on sample `k`, and the new preset alone from 8821. The
constant's other branch is not the engine either (it outputs the new preset alone on the "done" sample).
Fix: in a fade, step the ramp, then mix, always (also on and after the "done" call, whose value repeats); at a
block start with the ramp done, drop the old instance, then take a waiting request. One constant can go.
Outputs that change: only inside a fade, by at most `|new - old| / 4096` a sample, and the 395 samples after it;
no recorded hash or tail (none has a fade). Checks to re-pin: "a room fade covers samples 0 to 8820", the water
fade's twin, "a fade to none: from sample 13941 on" (it becomes the next block start), the fade cases of the
chunking check, the fade's draw order.

**F2. Should fix. When "before" is cleared, and which block the shares belong to.** Lines 57 to 60, 795, 919 to
923. Engine: per block the order is update (a take), mix (the shares' test), slot stage. So (a) in the block
where a preset is taken from "none", the channels are already mixed with the room share (the module's `shares()`,
asked before `process()`, still says 0/256 for that block); (b) after a fade to none the "before" number is
cleared in the slot stage of the first block after the ramp ended (sample 9216 for a take at 0), **after** that
block's shares were used: that block is still mixed with the old shares, its room share passing the empty slot
untouched, and 0/256 starts one block later (9728). The module clears at sample 8821 and gives 0/256 from 9216.
The assumed reading of the constant is the right one; only the block is off. Fix: clear `prevKey` where F1 drops
the old instance, and let `shares()` count a request that the slot will take at this block's start. Outputs: one
block of 512 samples at each end of a room's life in a live chain; nothing in a render with a fixed room.

**F3. Should fix. Setting "none" overwrites the four mix values with preset 0's header.** Line 893 (and the
report's reading 3, "setting none leaves them as they are"). Engine (row 9): the values become 0.2, 0.7, 80, 0.5.
What it changes: a spurt that starts after a room was set to none fixes its limits from these (26/229), not from
the last room's header; if a new room is taken while that spurt still runs, the engine sends 26/256 of it to the
room where the module sends the old room's share (72/256 after a tunnel, 5/256 after a courtyard). Fix: on a
take of "none", set the mix values from the table's preset 0.

**F4. Must fix before anything calls `setWater` (part d); no output of part a's reference changes.** Lines 40,
895 to 899, 907 to 908, 939. Engine (row 11): going under water or leaving it is a hard switch at a block
boundary; there is one water instance, made when the slots are made (at start and again after each
stop-all-sounds, so after each level load) and **never restarted by a dive**; while the listener is out of the
water it is simply not run, so it keeps its lines and its amplifier's state. Its amplifier is at full gain for
the first 4,413 samples it ever processes and rests on 1640 from the 7,938th on, for all later dives. The module
fades over 0.1 s to a fresh instance at each `setWater(true)` (so each dive starts with 100 ms at full gain
inside the fade and an 80 ms glide) and fades out over 0.1 s. Fix: keep one water instance for the path's life;
`setWater` only sets a flag read at the next 512-sample block; no ramp. A path made under water keeps its 44,100
samples of silence (it stands for "has been under water before"); a path made dry that dives later should say
which it means (a first dive since the level loaded has the 100 ms at full gain, later ones do not). The check
"a path's water slot fades over 0.1 s" pins the wrong thing. `WATER_FADE` is only the time of a change of
`dsp_water` itself.

**F5. Note. In a fade the engine calls the new instance first** (row 7). Only the order of draws from the one
stream; with a seeded stream nothing a listener or a take can tell. Line 807 to 808 and the order's item 9.

**N1. Note for part b:** reflectivity single 0.8 is class 3 in the binary (row 20). The item "flagged for the
recording" can be closed.

**N2. Note for the order's private check of part c.** Its expected comb peaks for the render ("0.024 to 0.027
against the take's 0.029 to 0.034") are the values of the fit on the played signal. A render gives the take's
values (Part 2). As written the check would call a correct render wrong.

**N3. Note on Decision 11.** The engine keeps what it had only for a number at or past its template count. The
numbers 30 to 59 and 100, 101, 134, 135 are presets it has, and 60 to 99 are the automatic room's own store; the
app treating them as "not held" is the plan's choice, not the engine's behaviour.

## Part 2: the module against the recordings

Method. The take's source was rendered by the app's own dry path (`TF2Audio.process`, page defaults, `volume`
0.15) with a tap at the mixer's input: the 16-bit voice at 44100 Hz after the gain (every sample a whole
number). That voice went through `TF2Room.entry` at the two shares and `createRoomPath` with the model's built
parameters (`build_auto` of `dspmodel.py`: sizes of the two measured cases, reflectivity 0.02, 0.3, 0.6, 0.9 for
classes 0 to 3), then the clip at +-32767, `volume`, and the app's own 44100 to 48000 conversion. "Dry" is the
same with `entry(s, 256)` alone. Scripts and decoded copies were in the scratch folder; the copies are deleted.

### Set C: why the comb peaks stood 15 to 25% high

The investigation's statistic (autocorrelation of the noise-like half-seconds above 300 Hz), take against
renders; "less dry" subtracts the dry render's own value. The scatter of the statistic here is 0.0028.

| | 57.96 ms | 91.16 | 105.2 | 119.2 | 134.2 | 148.2 |
| --- | --- | --- | --- | --- | --- | --- |
| take, less dry | 0.2303 | 0.0250 | 0.0289 | 0.0361 | 0.0327 | 0.0264 |
| module, class 3 | 0.2311 | 0.0208 | 0.0291 | 0.0356 | 0.0331 | 0.0282 |
| module, class 2 | 0.2312 | 0.0198 | 0.0276 | 0.0341 | 0.0312 | 0.0268 |
| module, class 1 | 0.2313 | 0.0181 | 0.0259 | 0.0316 | 0.0288 | 0.0245 |
| module, class 0 | 0.2317 | 0.0152 | 0.0228 | 0.0269 | 0.0244 | 0.0206 |
| the fit's way: model on the played signal, class 3 | 0.2295 | 0.0169 | 0.0250 | 0.0290 | 0.0286 | 0.0237 |
| the same, played signal cut at 12 kHz | 0.2363 | 0.0200 | 0.0288 | 0.0336 | 0.0331 | 0.0276 |

- **The cause is the fit's input, not the room.** The played signal is full band (to 24 kHz); the voice at the
  mixer has passed a 24 kHz codec and holds nothing above 12 kHz. The loop's low-pass removes all of the top
  octave from the echo, while that octave still counts in the normalisation: on the played signal the comb
  peaks come out 10 to 20% under the take's. Cutting the played signal at 12 kHz alone closes the
  gap; the app's voice closes it too. Not the cause: the reflectivity class beyond 3, the cutoff's blend, the
  per-line gain, the feedback, the ambience, the 48 kHz conversion, the gain stage, or shared arithmetic.
- With the app's voice, class 3 meets the four comb peaks to +1%, -1%, +1%, +7% and the allpass peak to 0.3%
  (raw values 0.2342 against 0.2335). Over twelve lags the rms distance is 0.0054, 0.0032, 0.0023, 0.0020 for
  classes 0 to 3 (size class 3: 0.0210); the pattern from 31 to 540 ms correlates 0.857, 0.877, 0.885, 0.887
  (size class 3: 0.704); what is left between take and class 3 over that range is 0.0026 rms, 0.9 scatters.
- **Reflectivity class 2 or 3 is still open**: they differ by half a scatter a peak. The first comb line's peak
  (91.16 ms, not in the fit) is 0.004 above the module's, 1.5 scatters: not significant, worth a look when the
  wet take exists.
- The module lowers the render's energy by 1.21 dB (63.66 to 62.46 dB), the report's 1.20.

### Set C in the time domain

300 to 1500 Hz (above it two passes of the codec do not agree in waveform), 50 ms windows each with its own lag
taken on the dry render (the take's lag moves by 2 ms in 6 s, and from spurt to spurt by up to 250 ms), windows
kept when they correlate above 0.5. Level = render minus take; residual = (take minus render) against the take.

| Stretch (source time) | Windows kept | Dry: level, residual | Module class 3: level, residual |
| --- | --- | --- | --- |
| noise 8.5 to 14.5 s | 117 of 120 | +1.12 dB, -4.80 dB | -0.06 dB, -6.98 dB |
| synthetic voice 32 to 38.5 s | 115 of 130 | +1.23, -4.65 | -0.10, -5.76 |
| spurt 1 | 17 of 24 | +1.16, -6.34 | +0.09, -9.10 |
| spurt 2 | 23 of 24 | +1.25, -6.18 | +0.04, -9.48 |
| spurt 4 | 23 of 24 | +1.29, -6.37 | +0.02, -9.73 |
| spurt 6 | 23 of 24 | +1.25, -6.25 | +0.10, -9.38 |
| spurt 7 | 20 of 24 | +1.24, -6.24 | -0.02, -9.43 |

The loud level error of the dry model, +1.1 to +1.3 dB, becomes -0.10 to +0.10 dB; the residual falls by 1.1 to
3.4 dB and then rests on the codec's own mismatch. The classes are equal here to 0.05 dB; size class 3 is 0.3 to
0.9 dB worse. Not aligned by this tracker: the noise from 2.8 to 8.5 s (the lag jumps by 20 ms inside it), the
chirp, spurts 3, 5, 8.

The first 150 ms after a stop (5 to 150 ms; the dry render is silent there, so its residual is 0 dB within
0.4 dB). Level, residual and correlation of the module's tail against the take's:

| Stop | Take's tail over its floor | Class 3 | Residual, classes 2 / 1 or 0 / size class 3 |
| --- | --- | --- | --- |
| noise, 14.5 s | 10.4 dB | +0.28 dB, -2.20 dB, 0.71 | -2.11 / -1.87 (1), -1.28 (0) / +1.03 |
| synthetic voice, 38.5 s | 10.0 dB | -0.27, -5.18, 0.84 | -4.57 / -3.50 (1), -1.74 (0) / +2.02 |
| spurt 1 | floor window not quiet | -0.25, -6.21, 0.88 | -6.32 / -4.97 (0) / -0.47 |
| spurt 2 | 11.8 dB | -0.17, -6.21, 0.88 | -6.39 / -5.22 (0) / -0.42 |
| spurt 4 | 10.7 dB | -0.34, -6.54, 0.89 | -6.84 / -5.41 (0) / -0.17 |
| spurt 6 | 9.7 dB | +0.41, -5.22, 0.86 | -5.37 / -4.51 (0) / -0.08 |

So the module's tail has the take's level to 0.4 dB and its waveform at 0.71 to 0.89, with the ambience 10 dB
under and the codec's mismatch as the rest. Spurts 3, 5, 7, 8: the take's spurt does not end where the render's
does (the render's timing, not the room), so their tail windows could not be placed.

### Set D, PC A: the street preset

Autocorrelation on the same noise windows for take and renders (scatter 0.0026):

| | 68.02 ms | 120.04 | 308.02 | 136.08 |
| --- | --- | --- | --- | --- |
| take | 0.0240 | 0.0147 | 0.0104 | 0.0040 |
| dry render | 0.0020 | 0.0009 | 0.0020 | -0.0045 |
| module, class 0 | 0.0180 | 0.0089 | 0.0069 | 0.0012 |
| module, class 1 (`set_d_street`) | 0.0232 | 0.0119 | 0.0085 | 0.0042 |
| module, class 2 | 0.0260 | 0.0134 | 0.0091 | 0.0061 |
| module, class 3 | 0.0277 | 0.0143 | 0.0097 | 0.0074 |

**The three echoes' amplitudes fit, as far as this statistic reaches**: class 1 is -3%, -19%, -18% of the take,
that is 0.3, 1.1 and 0.7 scatters; class 2 is +8%, -9%, -13%. The class is not settled (1 or 2). (Taking the
noise-like blocks of take and render separately, as the investigation's script does, puts different blocks in
each and gives a false +30% at 68 ms.)

Tails after two clean stops, 300 to 1500 Hz, class 1 (level, residual, correlation; the dry render's residual):

| Stop | 5 to 60 ms (the 68 ms comb) | 70 to 118 ms (the 120 ms echo) | 140 to 300 ms (the 308 ms echo) |
| --- | --- | --- | --- |
| noise at -18 dB, 43.5 s | +1.24 dB, -1.58 dB, 0.71 (dry +0.51) | -0.59, -4.96, 0.83 (dry -0.08) | at the floor: -1.99, +0.52, 0.32 |
| synthetic vowel, 131.37 s | +0.43, -6.96, 0.91 (dry -0.78) | -0.32, -5.47, 0.85 (dry -1.32) | -0.53, -3.12, 0.74 (dry -1.88) |

Class 1 has the lowest residual in five of the six windows. The comb's window reads 0.4 to 1.2 dB high, the
120 ms window 0.3 to 0.6 dB low, with the ambience 5 to 9 dB under the take's tail: within about 1.5 dB.
The module changes the render's energy by -0.03 dB, as the order expects. The four burst stops could not be
aligned.

### Set B: dry

A path with no room gives shares 0/256 and its output equals `trunc(s x 255 / 256)` for all 65,536 samples;
`entry(32767, 256) x 0.15` = 4895.85 and `entry(-32768, 256) x 0.15` = -4896.0. The baseline take's plateaus
(left channel, the middle sample of each of 18,306 top and 18,203 bottom plateaus): median 4894 and -4895, 0.39
and 0.40 of them at the ceiling of 4915. Confirmed to about 2 units of 4915.

### What the recordings now confirm, and what they cannot show

- Confirmed: the shares 41/214 and 23/232 and the sum of the lines' pass-through gains (loud level to 0.1 dB in
  Set C; the allpass peak to 0.3%); the diffusor's three delays and the five comb lines' times, to the sample;
  the comb lines' strength (gain x feedback x loop filter together) to 1 to 7% in the autocorrelation and the
  tail's level to 0.4 dB in time; the street's comb and two predelays, times to the sample and amplitudes to one
  scatter (about 10 to 25%) and about 1.5 dB in time; "no room" at 255/256 to 0.04%.
- Not shown: anything sample for sample (two codec passes and the ambience leave a residual near -6 to -10 dB);
  the reflectivity class (2 or 3 in Set C, 1 or 2 in Set D); a single line's gain cut or feedback apart from
  their product; integer rounding, the resting offset, the tail's end; any fade, any change of room, the water;
  random taps; the app's mono fold against a voice that is not centred.

## What I did not check

- In the binary: the per-sample routines and builders of `DLY`, `DFR`, `FLT`, `AMP`, `MDY` and the plain `RVA`
  were not re-read instruction by instruction (the three-dimension delays' build was; the rest stands on the two
  reads, the model's hashes and now the recordings); a reverb line's tap fade (use, then step) was not re-read;
  the processors' block routines; the spatialiser and reading 4; the sample multiply of `entry`; that a paint
  call is exactly 512 samples (W3-07's); the squared fade; the surround slot routines; `RandomInt`.
- In the recordings: Set C's five other takes; Set D's PC B; the half of Set C's stretches my tracker could not
  align; the engine's own device stage (the app's 48 kHz conversion stood in for it).
- The tests of the branch were not rerun or reviewed (the reviewer's job); nothing was changed on the branch.
