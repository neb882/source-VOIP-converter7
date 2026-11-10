# W3-17: second read of AMP and MDY (final account)

Source: the owner's engine.dll (x64, base 0x180000000), read as data with capstone, never executed. No leaked source was
looked for or used. Nothing of the binary is reproduced: words, formulas, addresses.
Marks: [read ADDR] = from the code there; [inferred] = my conclusion; [model] = computed by the extended model.
trunc = float -> int32 toward zero; `>>` = arithmetic shift of a wrapped 32-bit product; f32/f64 = float widths.
Order of work: sections 1 to 3 were read and written first (kept as `FINDINGS-blind.md` beside this file); then W3-15's
two sections and the plan's item 8 were opened and every difference taken back to the binary (section 4).

**Headline.** The water preset's amplifier does not swing. Its gain is full for the first 100 ms of the instance's life,
glides once to 1640/4096 = 0.4004 over 80 ms, and stays there for good. W3-15's "swings between 1.0 and 0.4, turning ten
times a second" is what the file's comment describes, not what this binary computes.

## 0. Where they sit
- Processor table [read 0x18003c0c0..0x18003c2c7]: each type has five routines (free, per-sample, per-block, build, external-modulation hook).
  AMP (type 11): free 0x180033220, sample 0x180033250, block 0x180033350, build 0x1800336d0, hook = the shared empty routine.
  MDY (type 9): free 0x18003ba40, sample 0x18003ba80, block 0x18003bba0, build 0x18003bf70, hook 0x18003bf10.
- The block routines are the per-sample arithmetic inlined in a loop for three channel layouts [read 0x180033350, 0x18003bba0].
  Nothing is per block: all state moves per sample.
- Range clamp before build as for every type, 0 never clamped [read 0x18003c030].
  AMP table 0x180462750: gain 0..1000, vthresh 0..1, distmix 0..1, vfeed 0..1, modrate 0..200, moddepth 0..1, modglide 0.01..100, rand 0..1.
  MDY table 0x1804623b0: dtype 0..6, delay 0..1000, feedback 0..0.99, gain 0..1, ftype 0..2, cutoff 10..22050, qwidth 100..11025,
  quality 0..3, modrate 0.01..200, moddepth 0..1, modglide 0.01..100, mix 0..1. (Its count says 13 for 12 entries; the 13th overlaps
  the next table's header and would force a nonzero 13th parameter to 0. That parameter is not used.) Presets 14 and 16 are inside all ranges.

## 1. The ramp both use [read 0x18003d490 (set), 0x18003d3f0 (next)]
Set(seconds, start, target, flag): diff = target - start; n = trunc(seconds * 44100f);
step = |(f32)diff| / (f32)n; if trunc(step) > 4095: step = step - trunc(step) + 4095; stepfix = trunc(step * 1048576f) (12.20);
limit = |diff|; dir = -1 if diff < 0 else +1; acc = 0; pos = 0; current = start; done = hit = false.
Next(): if done: return current. acc += stepfix; newpos = (acc >> 20) + pos; acc &= 0xFFFFF; pos = newpos.
If stepfix != 0 and 0 <= newpos < limit: offset = newpos. Otherwise "hit": offset = the value pos had before this call, and done is set.
current = start + dir * offset; return it. (flag set: current instead creeps one unit per call toward that value; AMP and MDY pass 0.)
- Linear, integer, one step per call, 20 fractional bits.
- **The target is never returned** [read 0x18003d427..0x18003d447]: the offset stays strictly under |diff|. With a step under 1
  the last value is one unit short of the target; the call that would arrive repeats the previous value and reports done.
- n = 0 (a glide under 1/44.1 ms): the division gives infinity or NaN, both conversions give -2^31, the first Next hits: the value stays at start. [inferred from the x86 conversion rule; `dspmodel.py`'s older `Ramp` takes the other branch here, see section 6]

## 2. AMP
File values: p0 gain, p1 vthresh, p2 distmix, p3 vfeed, p4 modrate, p5 moddepth, p6 modglide, p7 rand.

Build [read 0x1800336d0] (pool of 64 at 0x1804bbc50, 0x58 bytes each, zeroed):
- G0 = G = trunc(gain * 4096f): base gain and current gain. Gain 0 is silence (no "0 means 1").
- VTH = trunc(vthresh * 32767f); DMIX = trunc(distmix * 4096f); VFEED = trunc(vfeed * 4096f).
- modrate > 0: glide_s = modglide * 0.001f (kept as f32); DEPTH = trunc(moddepth * 4096f); period_s = (f32)(1.0 / max((f64)modrate, 0.01)).
  modrate <= 0: all three 0.
- PERIOD = COUNT = trunc(period_s * 44100f). RAND = (rand > 0).

Per sample [read 0x180033250], int32 in and out:
1. Only if VTH < 4096 and DMIX != 0: c = clamp(x, -VTH, +VTH); x = c if DMIX >= 4096, else x + (((c - x) * DMIX) >> 12).
   The threshold is scaled by 32767 but tested against 4096 [read 0x180033260]: a vthresh of 0.125 or more turns the clip off.
2. out = (G * x) >> 12, G as it stood at the start of this sample.
3. If a glide is running: G = ramp.Next(); if the ramp reports done, the glide flag is cleared. If none is running and PERIOD = 0: return out.
4. If PERIOD != 0: c = COUNT; COUNT = c - 1; if c == 0 (the value before the decrement): COUNT = PERIOD;
   LO = G0 - ((G0 * DEPTH) >> 12);
   RAND set: target = RandomInt(min(LO, G0), max(LO, G0)) (vstdlib's shared uniform stream, imported);
   RAND clear: target = G0 if G == LO, else LO [read 0x180033321..0x180033324];
   ramp.Set(glide_s, start = G, target, flag 0); glide flag set.
5. return out.
- VFEED is stored and never read: "distortion feedback" does nothing [read 0x180033250, 0x180033350].
- Nothing else writes the amplifier's fields: the only other references to its pool are the two routines that clear every pool
  [read 0x18003f660, 0x18003f940], and its external-modulation hook is the empty routine [read 0x18003c2c0].
- Integers per sample; floats only in the build and in ramp.Set. State: G, COUNT, the glide flag, the ramp.
- Firings: on sample index PERIOD, then every PERIOD + 1 samples. The gain first moves on the sample after a firing.
- With RAND clear the first target is LO (G = G0 != LO). The glide ends on LO + 1 (section 1). At every later firing G != LO,
  so the target is LO again; that ramp has limit 1 and can only return LO + 1. **The gain never goes back to G0.**
  (Checked in the model and against a second, register-level transcription of the two routines: `scripts/crosscheck.py`, 8 parameter sets, 60,000 samples each, no mismatch.)
  With RAND set it works as a wandering gain: each glide ends one unit short of its drawn target.
- Zero values: modrate 0 = no modulation; moddepth 0 = LO = G0, nothing moves; distmix 0 = no clip; vthresh 0 with distmix > 0 = clip level 0,
  x becomes x * (1 - distmix); modglide 0 = n is 0, the gain never moves.

Preset 14's line (1.0, 0, 0, 0.0, 10.0, 0.6, 80, 0), built [model]:
G0 = 4096, VTH = 0, DMIX = 0 (so no clip: it is the zero distmix that switches it off, not the zero threshold), VFEED = 0, PERIOD = 4410,
DEPTH = 2457, glide n = 3528, RAND clear. LO = 1639. Ramp 4096 -> 1639: stepfix 730258, limit 2457, 3529 calls, last value 1640.
Timeline of a fresh instance (sample index, the gain that multiplies that sample): 0..4412 -> 4096 (out = x); firing on 4410; 4413 -> 4095;
6176 -> 2867; 7938 and after -> 1640. Later firings on 8821, 13232, 17643, ... each start a ramp 1640 -> 1639 that returns 1640.
A constant 8000 comes out as 8000, then 7998 at sample 4413, 5599 at 6176, 3203 from 7938 on.

## 3. MDY
File values: p0 dtype, p1 delay ms, p2 feedback, p3 gain, p4 ftype, p5 cutoff, p6 qwidth, p7 quality, p8 modrate, p9 moddepth, p10 modglide, p11 mix.

Build [read 0x18003bf70, 0x180035410, 0x18003b8d0] (pool of 64 at 0x1804ad4c0, 0x50 bytes each):
- The delay is built from p0..p7 by the routine DLY itself uses (0x180035410), after MDY's clamp, not DLY's: kind = trunc(p0), D = trunc(|p1| * 44.1f),
  a = trunc(p2 * 4096f), b = trunc(p3 * 4096f), a filter from p4..p7 for the filtered kinds. (For kinds 5 and 6 that routine would take
  p8..p10 as three tap times; no MDY line in the file uses them.)
- glide_s = modglide * 0.001f; period_s = 1f / modrate if modrate != 0 else 0; PERIOD = COUNT = trunc(period_s * 44100f);
  depth kept as f32; MIX = trunc(mix * 4096f); the fading flag and an invert flag start clear.

Per sample [read 0x18003ba80]:
1. Not fading: y = the delay's sample routine (0x180034990). Fading: y = the delay's cross-fading routine (0x180034ee0; the read is
   d + (((dnew - d) * xf) >> 12) between the current and the new tap), then xf = ramp.Next(); if the ramp reports done: tap = new tap, fading cleared.
2. If PERIOD != 0: c = COUNT; COUNT = c - 1; if c == 0: COUNT = PERIOD; new = RandomInt(trunc((1f - depth) * (f32)maxdelay), maxdelay); set-new-tap(new).
3. If the invert flag is set: y = -y. MIX == 4096: return y. MIX == 2048: return (y + x) >> 1. Else return x + (((y - x) * MIX) >> 12).
Set-new-tap [read 0x18003b980]: fading set; new tap = min(new, maxdelay); xf = 0; the ramp is set in place as 0 -> 4096 (limit 4096, dir +1,
step 4096f / (f32)trunc(glide_s * 44100f) with the over-4095 rule, times 1048576, truncated). The weight therefore reaches 4095 at most, then the tap is switched.
Hook [read 0x18003bf10] (a modulator's value v; driven only by the MOD configurations): invert = (v < -2), and then v += 10;
new tap = maxdelay + trunc((v + 1) * (-0.5) * (f32)maxdelay); set-new-tap. Never reached in a LINEAR preset.
- The modulation is a uniform random draw of a whole-sample delay between (1 - depth) * max and max, relative to the full length each time
  (not "from the current value"); linear cross-fade between two taps; no fractional delay, no sine.
- No filter of its own. Kind 0 (PLAIN) [read 0x180034d80, 0x18003533d]: v = ((d * a) >> 12) + x; store v; out = (v * g) >> 12.
  The output contains the input, so mix 1.0 still passes the direct sound: it is a feedback echo, not a wet-only tap.
- State: the delay's buffer (D + 1 ints), write position, tap, new tap, xf; COUNT; the ramp; two flags.
- Zero values: modrate 0 = no self-modulation; mix 0 = out is x; gain 0 = taken as 4096 by the delay builder (as in DLY).

Preset 16's line (PLAIN, 500.0, 0.4, 1.0, 0, 0, 0, LO, 2.0, 0.01, 15, 1.0), built [model]:
kind 0, D = 22050, a = 1638, b = 4096 -> output gain 4096, tap = maxdelay = 22050; PERIOD = 22050 (firings on samples 22050, 44101, 66152, ...);
draw between 21829 and 22050 inclusive; glide n = 661, stepfix 6497681 (6.1967 a sample), 662 calls, weights 6, 12, 18, 24, ..., 4089, 4095, 4095; MIX = 4096.
So out[n] = x[n] + ((1638 * out[n - tap]) >> 12): the sound plus echoes about every half second, each 0.4 of the one before, the spacing
redrawn every 22051 samples within 221 samples (5 ms) below 500 ms and cross-faded over 15 ms.

## 4. Differences from W3-15 and from the plan, each settled in the binary

| # | Point | W3-15 / plan | Binary | Address | Right |
|---|---|---|---|---|---|
| 1 | AMP target, rand off | "flips between gain and gain x (1 - depth)"; row 8: "swings between 1.0 and 0.4 and turns ten times a second" | target = G0 only if the current gain equals LO exactly, else LO; the ramp cannot end on LO, so every target is LO and the gain rests on LO + 1 | 0x180033321..0x180033324; 0x18003d427..0x18003d447 | this read |
| 2 | Ramp's end | "ramps to it in a straight line" | straight line, but the offset is kept strictly under the distance: the target is never produced, and nothing in AMP sets it afterwards | 0x18003d42b..0x18003d43b; 0x1800332c7..0x1800332d3 | this read |
| 3 | AMP interval | "every int(44100 / max(rate, 0.01)) samples" | PERIOD = trunc((f32)(1.0 / max((f64)rate, 0.01)) * 44100f); a firing every PERIOD + 1 samples, the first on sample PERIOD | 0x18003371c..0x180033733, 0x1800337fe; 0x1800332de..0x1800332e9 | this read (PERIOD is 4410 either way for preset 14; the float order differs by one for some fractional rates) |
| 4 | MDY interval | "every int(44100 / rate) samples" | PERIOD = trunc((1f / rate) * 44100f); a draw every PERIOD + 1 samples | 0x18003bfb5, 0x18003b93a; 0x18003bb04..0x18003bb0f | this read (22050 either way for preset 16) |
| 5 | AMP clip | threshold int(t x 32767) < 4096, "c if distmix is 1" | the same; exactly: DMIX >= 4096 takes c | 0x180033260..0x180033296 | both |
| 6 | AMP "feed" | stored, not seen used | stored, not read by the sample or the block routine | 0x180033846; 0x180033250, 0x180033350 | both |
| 7 | MDY draw and mix | tap between (1 - depth) D and D; mix 1 / 0.5 / other | the same | 0x18003bb11..0x18003bb42; 0x18003bb47..0x18003bb81 | both |
| 8 | MDY extras | not stated | an invert flag and a tap-setting hook for outside modulators; the delay built under MDY's clamp table; PLAIN's output includes the input | 0x18003bf10; 0x18003bf7b; 0x180034d80 | this read (additions; none changes preset 16) |
| 9 | Plan, "threshold 0, so no clip path" | threshold 0 means no clip | threshold 0 means clip level 0 whenever distmix != 0; preset 14 has no clip because its distmix is 0 | 0x180033268..0x18003326f | this read (the refusal rule should test distmix != 0 with vthresh < 0.125) |

The plan's three assumptions (item 8 of part a):
1. **"The ramp is a4's 12.20 ramp over trunc(glide x 44.1) samples."** MDY: yes, exactly a4's (set by 0x18003b980: weight 0 -> 4096, n = trunc((ms * 0.001f) * 44100f) = 661,
   662 calls, last weight 4095, then the tap is switched). AMP: the same stepping routine (0x18003d3f0) but set by the general setter (0x18003d490): the gain itself is stepped,
   step = |target - start| / n in 12.20, n = trunc((ms * 0.001f) * 44100f) = 3528; it takes n + 1 calls starting the sample after the firing, and it
   **stops one unit short of the target**. Using a4's 0..4096 weight on the difference is not the engine's arithmetic and would arrive at the target, which the engine does not.
2. **"The counter is tested as a4's (a turn every period + 1 samples)."** Confirmed for both: read, decrement, act if the value read was 0, reset to PERIOD
   [0x1800332de..0x1800332f7; 0x18003bb04..0x18003bb22]. "Turn" is right for MDY's draws; for AMP it is a firing, not a turn.
3. **"The first target after a start is the lower one."** Confirmed [0x180033321]. And so is every later one (difference 1).

## 5. The extended model and its numbers
`/tmp/claude-0/-home-user-source-VOIP-converter6/7ecfcde4-bc54-5c90-be68-2a0c26632ec4/scratchpad/agents/w3-17-amp-mdy/dspmodel.py`
(a copy of the reference with `cvtt`, `LinRamp`, `clamp_params`, `Amp`, `Mdy` added, types 9 and 11 registered, the draw handed to them as to the reverb;
its own self-test output is byte-identical to the reference's). Scripts: `scripts/numbers.py`, `numbers2.py`, `numbers3.py`, `crosscheck.py`; outputs in `out/`.

Inputs, 44100 samples each, instance fresh (from silence): impulse = 16384 then zeros; tone = round(8000 sin(2 pi 1000 n / 44100)) for n < 22050, then zeros
(first eight: 0, 1136, 2249, 3316, 4316, 5229, 6036, 6720; SHA-256 of the int32 LE input 22e9dbee2b6f0bbab1507c0cda76f56d99f7fe5fe7b68ce268255fe632975eee).
Output SHA-256 over the 44100 int32 LE samples, under three stand-ins for the draw: "upper" = always the upper bound (no tap ever moves),
"lower" = always the lower bound (every fade exercised, no generator needed), "seed1" = Python `random.Random(1).randint`, one generator per processor (the reference model's default).

Whole presets (LINEAR chain as the file gives it):
| Case | First 20 | Peak (value at sample) | SHA upper | SHA lower | SHA seed1 |
|---|---|---|---|---|---|
| 14 impulse | -2 -6 -9 -11 -11 -11 -10 -9 -8 -7 -6 -5 -4 -3 -3 -2 -2 -1 -1 -1 | 2867 at 2560 | 3f7b9669342f51857b15936a9f38b43e0db5113610440e6aec8a30f7c9ffe8e2 | c9f8a84a59102432495762351ad60337941b458c6302cc675b9e8d13da82141c | e5b51f63e79f42f195f81a0debe67a78e42711fcfd52f3422726e01cd1efaf2c |
| 14 tone | 0 -1 -1 -2 -4 -6 -9 -13 -17 -20 -24 -28 -32 -35 -38 -40 -42 -43 -43 -42 | 11795 at 5749 | 1095b738e2c616ad98fcdd314b3748fea8e99ae3b0dfb5268a67747099159030 | 314f3c78eaead30c45c982967d94a06d3413b64d2846661cedd04b290d94288c | 85da9713affd5523848f0ccd20b7497c7fc6fde5d6af8b0c8103030cf3f6485e |
| 16 impulse | 0 3 6 8 10 11 11 12 11 11 11 10 10 9 9 8 7 7 6 6 | 510 at 1417 | bbdbf9aec77340b628837e1855e7dbe55a21a405553559cd7e4f01e85300a534 | fac1e98abbdcd8f73d411a9a3564411931f95779df2dd4adb6179a76433a088d | a74e298777a0ce0a018bdbad85fd9fb6f8a81b331fc3b913143a977ffbf47867 |
| 16 tone | 0 0 0 0 2 4 6 9 13 17 22 27 33 38 43 48 52 56 59 61 | depends on the draw: -14440 at 23414 (upper), 13575 at 23257 (lower), 4349 at 4253 (seed1) | f0c7c88832add99d441cf9072ce7ce3763fbecd415b602783ca13ff7d9c8d6d6 | cd26dcf7b9d1bc36d19ea9b8df48c02b8f8c23ee2a6430a5afb2d73e2056b9c5 | 01ee000f6a2daa29bb6f283495394659552047e05ac345d75ac11f6a2491bce0 |

What depends on the draw:
- Preset 14: the amplifier draws nothing (rand is 0). The reverb's two lines draw first on samples 7803 and 9261. Every output sample up to 7803 is fixed
  (the stand-ins first differ at 7844 for the impulse, 7807 for the tone); so are the first 20 samples and both peaks. All six hashes depend on the draw.
- Preset 16: the reverb's seven lines draw first on sample 3069 (periods 3069, 3681, 4294, 4910, 5675, 6291, 6904), the MDY on 22050. Fixed: every sample up to 3069,
  the first 20, the impulse's peak; the tone's whole-run peak and all hashes depend on the draw (within the fixed stretch the tone's peak is 3038 at 3063).
- In the game the draws come from the engine-wide stream, so no hash of a modulating preset can be met by a take; "upper" and "lower" are the portable pins for a port.

Processors alone:
| Case | Peak | SHA |
|---|---|---|
| AMP of 14, impulse | 16384 at 0 (output = input) | 5e90608f3607b734f007b5aa34d824c17e37bb885070c0dc791afbb0a13567aa |
| AMP of 14, tone (no draw at all) | 8000 at 11; out[4413] = 3315 (input 3316); out[7936..7939] = -902, -456, 0, 454 | e5827f7a0f34d219618a62c3297541b1986a8374dab61a38f4efd3bdae613f2d |
| MDY of 16, impulse | 16384 at 0; then 6552 at 22050; the third echo 2620 at 22050 + drawn tap (43879 lower, 43913 seed1, past the window for upper) | upper 378dc5c41f0c5643c942902d0dd903847e394fe742a51875bf8ad09c08bd03b3; lower 2a4225152a725a0c42780fcc19d40d6e76822f548a369d2e8b08f3ab194f1d91; seed1 c59405a3ca13dce28321a579657325f2cef3f6d53e9c0e0fed958f45ca865d23 |
| MDY of 16, tone | 8000 at 11; first 20 = the input's | upper 792fa706c374d9f2b5584573e1f1318c798f9c19d821eb0175dd140ace2afa3c; lower 3485ad663138fe3d98ae4304b0a6fe9e8c442eabb555e2dfeb8cfc078adad96f; seed1 f65b981827e73242ff1ab5f886c8ee88cdd21c7445d0052af45e8f751b141ceb |
One draw falls inside the window for the MDY alone (on sample 22050: 22050, 21829, 21863 under the three stand-ins).

Built lines of the two presets, for the record [model]: 14 = three all-passes (573, 837, 1146 samples, feedback 614), the amplifier above, a reverb of two lines
(2601 and 3087 samples, feedback 1638 and 1380, gain 4096 each, modulated every 7804 and 9262 samples) with two low-pass sections (a1 -3160, b 467) on the sum.
16 = two all-passes (573, 837; 614), a reverb of seven lines (882 to 1984 samples) with two low-pass sections (a1 -3550, b 272), then the MDY above.

### What the water preset does to a voice, in plain words
W3-15: "its level swings between full and 0.4, turning ten times a second". **Not so in this binary.**
For the first 100 ms after the preset is started (4,413 samples) the amplifier passes the sound at full level; over the next 80 ms (to sample 7,938) the level slides
in a straight line down to 0.4004 (1640/4096, -7.95 dB); it then stays there for as long as the preset runs. There is no tremolo. Ten times a second the
amplifier does start a new glide, but each one is from 1640 to 1639 and cannot move.
Numbers: a steady 1 kHz tone of amplitude 8000 through the amplifier alone peaks at 8000, then 3204 from 180 ms on. Through the whole preset with the reverb's
taps held still, its level per 100 ms (rms) runs 4215, 7172, 5931, 5545, 5469, ... and settles at 5451; with the amplifier's modulation switched off it would settle
at 13614: the ratio is 0.4004. The rest of the preset is three short all-passes, two echoes of 59 and 70 ms with feedback 0.4 and 0.34 whose taps jump at random
(up to 17 and 14 % shorter, about every 177 and 210 ms, cross-faded over 20 ms), and two 1800 Hz low-passes on their sum: a dull, slightly fluttering, quieter
copy. Since a preset fades in over 200 ms when it is set (the W3-17 second read, section d), the 100 ms at full level falls inside that fade-in: what is heard under water is simply the
quieter level, with a short louder onset each time the preset is started afresh.

## 6. Still not read, and loose ends
- vstdlib's RandomInt itself (the generator and its stream); only that both processors call it with (low, high) is read.
- The configurations that drive MDY's hook (MOD, MOD2, MOD3) and the other processor types (CRS, PTC, ENV, LFO, EFO).
- MDY with delay kinds other than PLAIN beyond what the model already carries (kind 5's cross-fading read is still "not read" in the model).
- The n = 0 branch of the ramp (section 1) is inferred from the x86 conversion rule, not from a take. The reference model's older `Ramp` class treats an
  infinite step as "over 4095" (one sample at weight 4095, then done); by the rule above the engine's ramp is done at once with weight 0. It cannot occur with the
  file's presets (a reverb line would need rate x length under 2 samples); `LinRamp` in the extended model follows the conversion rule. Worth a line in the port.
- Whether the engine runs a chain per sample or per block per processor only changes the order of draws between processors, not any processor's arithmetic. Not read here.
- No take was used: every number above is the model's, from the read.
