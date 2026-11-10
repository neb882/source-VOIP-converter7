# W3-17: second read of the room DSP (final account)

Source: the owner's `engine.dll` (x64, image base 0x180000000), read as data with capstone, never executed. No leaked
source was consulted. No bytes, instruction text or listings are reproduced: words, formulas and addresses only.
Marks: **[read ADDR]** = taken from the code at that address; **[inferred]** = my conclusion, not directly visible.
"trunc" = float/double -> int32 conversion, truncating toward zero. `>>` = arithmetic right shift of a 32-bit signed
value (products are 32-bit and wrap; the shift rounds toward minus infinity). f32 = single, f64 = double precision.

Order of work: sections a to f were read and written **before** W3-15's text was opened (that first version is kept
beside this file as `FINDINGS-blind.md`); then W3-15 was read in full and every difference taken back to the binary
(section "Differences"); the measuring (e4) was read after the blind file was written but before W3-15's text was
opened. This file is the corrected whole. The model is `dspmodel.py` in the same folder.

## 0. Common ground

- Parameter block of a processor: int type, then up to 16 f32 params p0..p15 [read 0x1800365b0, 0x18003c0c0].
- Before a processor is built, each param is range-clamped by a per-type table, **except that a value of exactly 0 is
  never clamped** (0 passes even where the minimum is 10) [read 0x18003c030]. Tables: RVA at 0x180462450, DLY 0x180462320,
  FLT 0x1804622d0, DFR 0x1804625a0. RVA limits: size,min 0..1000; #dly 1..12; feedbk 0..1; gain 0..10; cutoff 10..22050;
  fpar 0..1; fmod 0..50; rate 0..10; w,d,h -1000..1000; fw,fd,fh -1..1; ftap 0..0.333. DLY: type 0..6; delay -1..1000;
  feedbk 0..0.99; gain 0..10; ftype 0..2; cutoff 10..22050; qwidth 100..11025; quality 0..3; taps -1..1000.
  FLT: type 0..2; cutoff 10..22050; qwidth 0..11025; quality 0..3; gain 0..10. DFR: size 0..1; #dly 0..4; feedbk 0..1; gain 0..10.
- Everything is computed for 44100 Hz: 1 ms = 44.1 samples (f32 constant 44.1) or `ms*44100/1000` in integers.
- Pools (fixed): 64 filters, 128 delay lines, 64 mod-delays, 64 reverbs, 64 diffusors, 64 live presets, 32 DSP slots.

## a. Reverb, type RVA

Params: p0 size(ms) p1 min(ms) p2 #dly p3 feedbk p4 gain p5 cutoff p6 fpar p7 fmod(depth, ms) p8 rate p9 w p10 d p11 h
p12 fw p13 fd p14 fh p15 ftap. [read 0x18003ea30]

m = trunc(clamp(p2, 1, 12)).

### a1. Plain variant (trunc|w| = trunc|d| = trunc|h| = 0) [read 0x18003ea63..0x18003ec43]
- step = (size - min) * (1/m) in f32 (reciprocal multiplied, not divided).
- For i = 0..m-1: `D[i] = trunc( (f32)( trunc(i*step) + min ) * 44.1f )` samples.
- feedback int: `a[0] = trunc(min((f64)feedbk*4096, 4091.9))`; for i>0
  `a[i] = trunc(min((f64)powf(feedbk, (f32)D[i]/(f32)D[0]) * 4096, 4091.9))` (the callee at 0x1803263e0 is taken to be powf [inferred]).
- gain int, same for all: `b = trunc(gain*4096f * (1/m))`.

### a2. Variant from width, depth, height (any of trunc|w|,|d|,|h| nonzero) [read 0x18003ec43, 0x18003dc60]
- m is forced to a multiple of 3: m<3 -> 3; 4,5 -> 6; 7,8 -> 9; >9 -> 12 (3,6,9 unchanged).
- Sizes s = (|w|,|d|,|h|) and factors f = (fw,fd,fh) are sorted together so s0 >= s1 >= s2 (f follows its s).
- If fw=fd=fh=0: f0 = powf(feedbk, trunc(s0)/trunc(s2)), f1 = powf(feedbk, trunc(s1)/trunc(s2)), f2 = feedbk.
- Minimum spread: L = 7*(m/3) (int division). e = L - (s1 - s2). If not (s1 - s2 > L): s1 = e + s1.
  Then if not (s0 - s1 > L): s0 = e + s0 -- **the same e** (computed from s1,s2 before the fix) is reused, so when the first
  pair was already apart (e negative) and the second is not, s0 is moved *down*. [read 0x18003dd8b..0x18003dddf]
- `b = trunc(gain*4096f / (f32)m)` (a division here).
- For i = 0..m-1, j = i mod 3 (via an fmod call [inferred]), f = f[j], S = trunc(s[j]):
  - f < 0 and i < 3: **predelay**: total = S; a[i] = -trunc(min(|f|*4096, 4091.9)).
  - else: if f < 0 (i >= 3): S = max(trunc(s[j]*0.25f), 7). extra = 0 for i<3, else
    `extra = (f32) max( (f64)(f32)S * 0.18 * (i/3), 7*(i/3) )`; total = S + trunc(extra); a[i] = +trunc(min(|f|*4096, 4091.9)).
  - `D[i] = total*44100/1000` (int): one unit of w/d/h is 1 ms = 44.1 samples.

### a3. Building the lines [read 0x18003d540]
- If cutoff != 0 a one-pole low-pass template is made (FLT type LP, quality 0, gain 1): see c.
- fpar == 0 and filter: delays are plain (type 0, or 6 when ftap>0) and **two** identical low-pass sections in series are
  put after the sum. fpar != 0 and filter: no output filter; each delay gets the filter in its loop:
  type 2 (LOWPASS), or 5 (LOWPASS_4TAP) when ftap>0, or **4 (FLINEAR: no feedback) when a[i] < 0 (predelay)**.
  No filter: type 0 or 6; a negative a[i] is then just used as |a[i]| (plain feedback, no predelay).
- Each delay = DLY(D[i], |a[i]|, b, type): see b for the output-gain normalisation that DLY applies itself.
- 4-tap (ftap > 0): with t = (f64)ftap, D = D[i]: taps = trunc((f32)max((1-t*3.141592)*D, 220)),
  trunc((f32)max((1-t*1.697043)*D, 308)), trunc((f32)max((1-t*0.96325)*D, 441)), D; sorted ascending, each capped at D.
- Output of the reverb per sample: sum over the m delays of their outputs (each already scaled by its b); then the two-section
  low-pass if fpar == 0. No further scaling. [read 0x18003e380; block form 0x18003e530 does the same per sample]

### a4. Modulation (only if fmod > 0) [read 0x18003d9ab..0x18003db17, 0x18003e3b8, 0x18003b980, 0x18003d3f0]
- Per delay: T = D/44100 s (f32, D * 2.2675737e-5). depth = clamp(fmod*0.001/T, 0.01, 0.99) (fraction of D).
  period = trunc(T*rate*44100) samples (so `rate` is in units of the delay's own length). xfade time = min(T*rate*0.5, 0.02) s.
- A counter starts at `period`, is decremented every sample, and when it is found 0 it is reset to `period` and a new tap is
  drawn: `newD = RandomInt(trunc((1-depth)*D), D)` -- vstdlib's global RandomInt (imported; engine-wide stream, not seeded
  here). So a draw every period+1 samples, per delay, in delay order.
- Cross-fade: tap value = old + (((new - old) * x) >> 12), x ramps 0 -> 4096 linearly with a 12.20 fixed-point step
  `trunc(4096/trunc(xfade*44100) * 2^20)`; when the ramp passes 4096 the read tap becomes the new one (x stays below 4096 on
  the last faded sample; no click protection beyond that). While fading the old/new are both read from the same line.
- For 4-tap delays the fade is between the **longest** tap and the new one but at the end the **shortest** tap field is
  overwritten (engine quirk; not exercised by TF2's presets, where ftap>0 comes with fmod=0).
- The mod-delay output is used at full mix (4096) and not inverted.

## b. Delay, type DLY

Params: p0 type, p1 delay ms, p2 feedbk, p3 gain, p4 ftype, p5 cutoff, p6 qwidth, p7 quality, p8..p10 tap1..3 (ms). [read 0x180035410]
- D = trunc(|p1| * 44.1f); a = trunc(feedbk*4096f); b = trunc(gain*4096f); taps = trunc(|tap|*44.1f).
- Types 2,4,5 get a filter built from p4..p7 (gain 1); **only its first section is copied into the delay** (quality has no
  effect; for qwidth>0 that first section is the high-pass half). Types 5,6: the four taps (D, tap1..3) are sorted ascending
  and capped at D [read 0x180034840].
- Allocation [read 0x180034550]: buffer of D+1 ints, zeroed. Types 5,6: b = trunc(b*0.25f) first.
  Feedback stored = min(a, 4095). Types 3,4: feedback 0 and **output gain 4096 (p3 ignored)**. Other types:
  `g = min(a/4096f, 0.999f)`; `k = clamp( (f32)trunc(4096.0 / (f64)(1f/(1f-g))) * 4, 1024, 4096 )`;
  **output gain = trunc(k * (f32)(b != 0 ? b : 4096) / 4096)**, i.e. gain is multiplied by clamp(4*(1-fb), 0.25, 1).
  For types 2,4,5 the loop filter's b-coefficients are multiplied by a/4096 (the feedback lives in the filter).
- Per sample [read 0x180034990], d(t) = sample written t samples ago, x = input, G = output gain:
  - 0 PLAIN: v = (d(D)*a >> 12) + x; store v; out = v*G >> 12. (The input passes straight through, undelayed.)
  - 1 ALLPASS [0x180038bc0]: v = (d*a >> 12) + x; store v; out = ((d + ((-(v*a)) >> 12)) * G) >> 12.
  - 2 LOWPASS: v = LP(d) + x; store v; out = v*G >> 12 (LP already contains the feedback factor).
  - 3 DLINEAR: store x; out = d (no gain).  4 FLINEAR: store x; out = LP(d)*G >> 12 with G = 4096, LP scaled by a/4096.
  - 6 PLAIN_4TAP: v = (d(longest)*a >> 12) + x; store v; out = ((d1+d2+d3+d4 + x) * G) >> 12 (x, not v).
  - 5 LOWPASS_4TAP: v = LP(d(longest)) + x; store v; out = ((d1+d2+d3+d4 + x) * G) >> 12.
  - LP section: w0 = d - (w1*a1 >> 12); y = (w0*b0 + w1*b1) >> 12; w1 = w0.
- State that persists: the line, the write position, one filter word; for modulation the old/new tap and fade value.

## c. Diffusor DFR and filter FLT

DFR: p0 size, p1 #dly, p2 feedbk, p3 gain (0 means 1). n = clamp(trunc(p1),1,8) (table clamp makes it <= 4). [read 0x180034120]
- Table of 16 lengths (ms) at 0x180462520: 13,19,26,21,32,36,38,16,24,28,41,35,10,46,50,27; a second table of 16 factors at
  0x180462560 is all 1.0.
- Stage i: D = trunc(size*len[i]) * 44100 / 1000 (int); a = trunc(min((f64)(fac[i]*4096f*feedbk), 4091.9)); b = trunc(gain*4096f);
  built as DLY type 1 (so DLY's gain normalisation applies: factor 1 for feedbk <= 0.75).
- Per sample: the n all-passes in series, each as type 1 above [read 0x180033d60].

FLT: p0 type (0 LP, 1 HP, 2 BP by qwidth), p1 cutoff, p2 qwidth, p3 quality, p4 gain. [read 0x18003a830, 0x180039c50, 0x18003a1b0]
- w = tan((f64)cutoff * pi/44100) (constant 7.123792865e-5; callee taken to be tan [inferred]); p = (1-w)/(1+w).
- a1 = trunc(-4096*p). LP: b0 = b1 = trunc(2048*(1-p)). HP: b0 = trunc(2048*(1+p)), b1 = -b0. All in f64.
- quality q = clamp(trunc(p3), 0, 3) (at least 1 when qwidth>0): **q+1 identical first-order sections in series**; only the
  first has its b multiplied by gain (trunc((f32)b*gain)). qwidth>0: first section is HP at cutoff, the rest LP at cutoff+qwidth.
- Section arithmetic as the LP section in b (12-bit coefficients, 32-bit ints, truncating shifts).

## d. Presets: header and chaining

- File grammar as read by 0x1800365b0: `{ number configtype f1 f2 f3 f4 f5 f6 {proc}... }`. Tokens starting with a digit,
  '+' or '-' are numbers; anything else is looked up in a name table [0x180036ba0].
  f1 -> mix min, f2 -> mix max, f3 -> duration (s), f4 -> fade time (s), f5 -> db_min, f6 -> db_mixdrop.
  There is **no gain field** in the header. At most 5 processors, 16 params each (missing ones are 0).
  **A preset with exactly one processor is forced to config type 0 (SIMPLE)**; otherwise the file's type is kept.
- Chaining: SIMPLE = the one processor; LINEAR = processors in file order, output of one into the next
  [read 0x18003c630, 0x18003ca80]. (Other config types exist; not needed for room presets.)
- Setting a preset on a slot [read 0x1800388c0]: new instances are built, the current becomes "previous".
  **If the slot is the room slot or the automatic-room slot, the four ConVars are overwritten from the new preset's header:
  dsp_mix_min <- f1, dsp_mix_max <- f2, dsp_db_min <- f5, dsp_db_mixdrop <- f6** (float SetValue), every time a preset is set there.
- duration > 0: counted down in samples (trunc(duration*44100)), then the slot returns to the preset it had before
  [read 0x18003c5fb, 0x18003fd73, 0x18003f1a4]. fade time: |f4| of the *outgoing* preset replaces the slot's default
  cross-fade time if nonzero; f4 < 0 selects the squared ("exponential") fade.
- Cross-fade between presets [read 0x1800382a0]: both run on the same input; out = old + (((new - old) * x) >> 12)
  (squared form: the difference is multiplied by x and shifted twice); x ramps 0..4096 over the fade time with the same
  12.20 ramp as in a4. Room slot and automatic slot: 1 channel, default fade 200 ms [read 0x18003ee80]
  (so 8820 samples). A new preset is only *started* when the slot's previous fade has finished [read 0x18003f254..].
- Mono room slot on a stereo buffer: x = (L + R) >> 1, both outputs get the processed value [read 0x1800382a0].
  Preset number 0 in a slot = buffer untouched.

## e. Automatic room

### e1. Build from two templates [read 0x180035b50, 0x180032720, 0x1800325d0, 0x180033060]
Inputs: sky flag, width, length, height (ints, inches), diffusion (f32), reflectivity (f32), six per-direction
reflectivities, slot number 0..39.
- Shape number -> ConVar: 0 adsp_room_min, 1 duct, 2 hall, 3 tunnel, 4 street, 5 alley, 6 courtyard, 7 openspace,
  8 openwall, 9 openstreet, 10 opencourtyard. base = that ConVar's int value, **+2 if the diffusion class > 1** (the
  "DIFFUSE" pair). A = template[base] ("small bright"), B = template[base+1] ("huge dull").
- Classes (0..4 unless noted) [read 0x180032320]:
  - width class: 1 for 72<W<=144, 2 for 144<W<=288, 3 for 288<W<=576, 4 for W>576, else 0.
  - length class: 1 for 144<L<=288, 2 for 288<L<=576, 3 for 576<L<=1152, 4 for L>1152, else 0.
  - height class: 1 for 48<H<=128, 2 for 128<H<=216, 3 for 216<H<=384, 4 for H>384, else 0.
  - reflectivity class (0..3): 1 for 0.04<R<=0.5, 2 for 0.5<R<=0.8, 3 for R>0.8.
  - diffusion class (0..3): 1 for 0.01<d<=0.1, 2 for 0.1<d<=0.3, 3 for d>0.3.
  - size class: shapes 6 and 10: from length with other limits: 1 for 120<L<=240, 2 for 240<L<=480, 3 for 480<L<=1200,
    4 for L>1200; shapes 4 and 5: the width class; all others: (width class + length class)/2 (int).
- The new preset starts as a **whole copy of B if size class > 1, else of A** (header fields, processor list and all params
  not named below come from that copy).
- Then, for the first and for the second processor of each type (matched by "n-th processor of this type" in A, B and the
  copy; skipped if any of the three lacks it), params are overwritten by `A + (B - A) * (class/5)` in f32, or with the
  factor applied twice (squared) where marked sq:
  - DFR p0..p3: size class.
  - RVA: feedbk, gain, #dly, fmod, rate: size class; size, min: size class sq; w: width class sq; d: length class sq;
    h: height class sq; fw: width class; fd: length class; fh: height class;
    **cutoff: B + (A - B) * (reflectivity class / 4)**. fpar and ftap are not interpolated.
  - w, d, h: if the value in A or in B is negative, the result is instead the measure in feet clamped to 6..500
    (inches/12): width for w, length for d, height for h.
  - DLY: delay: length class sq, or if negative in A or B: clamp(length/6, 14, 500) ms; feedbk, gain: length class;
    tap1: clamp(width/6, 14, 500) if negative, tap2 and tap3: clamp(length/6,14,500) if negative (else length class sq);
    cutoff and qwidth: B + (A - B)*(length class/5).
  - MDY p0..12 on length class; AMP p0..7, FLT p0..4, PTC, CRS, ENV, EFO, LFO on size class.
- The result is written over template number 60+slot and that number is put into ConVar dsp_automatic
  [read 0x180035dc5, 0x1800388b0]; the DSP update then sets it on the automatic slot (when its last fade is over), which
  also overwrites the four mix ConVars (d) and cross-fades over 200 ms.

### e2. Naming the shape [read 0x180032040]
- Not under sky: if H > 3*L, height and length are swapped for the test ("vertical shaft").
  DUCT if L > 4W and W <= 48; else HALL if L > 2.5W and 48 < W <= 96; else TUNNEL if L > 4W and W > 96; else ROOM.
- Under sky: n = number of the four horizontal direction reflectivities that are exactly 0. n>0: shape = 11-n
  (1 open side: opencourtyard, 2: openstreet, 3: openwall, 4: openspace). n=0: COURTYARD if L <= 2.5W; else ALLEY if W <= 144;
  else STREET.

### e3. When a new one is built [read 0x180022650]
- Runs only when fully connected and the automatic room is on; skipped while |now - time of last change| < 0.25 s.
- Each call advances the measuring three steps; nothing happens until a measuring pass is complete.
- 40 remembered places ("nodes": position, radius, preset number). If the listener is inside a remembered one
  (e4) its preset number is re-used.
- Otherwise, relative to the node last used: no change unless the listener moved more than 48 units horizontally
  (dist^2 > 2304); then a new room is built if the width or length ratio (smaller/larger) to that node's is <= 0.6, or the sky
  flag changed. (As read, when the length ratio is above 1 its inverse replaces the *width* ratio in the first test and
  the raw length ratio, above 1, passes the second: the test then rests on the length ratio alone.)
- New node radius: indoors min(min(5*W, L), 480) with 48 as second figure; under sky 1200 and 72.
- Low-ceiling test [read 0x18002293d]: if the pass recorded a low ceiling h (<= 108, see e4) and h < height and
  h/height < 0.8, nothing is built.

### e4. The measuring [read 0x180024000, 0x180023cf0, 0x180023ac0, 0x180023700, 0x180021d80, 0x180022d50, 0x180023410]
One pass = 20 rays, one ray per step, three steps per call of the driver (so a pass takes 7 calls); the pass's origin is
taken at its first step.
- **Start of a pass** [0x180023cf0]: origin = listener position. A ray 4800 straight down (mask 0x4003): if it hits and the
  hit is more than 72 units below, **the pass is abandoned** (listener in the air). A ray 4800 straight up: if it hits a
  non-sky surface, h = trunc(up distance) + trunc(down distance), and the height from which the eight level rays are cast
  is set [0x180023ac0] with adsp_low_ceiling (108), adsp_wall_height (128), adsp_door_height (112): floor + 129 if h > 128;
  floor + 113 if 112 < h <= 128; floor + h - 1 if h <= 112 (and if h <= 108, h is kept as the "low ceiling" figure used in
  e3). If the up ray hits sky or nothing, the level rays leave from the listener's own height.
- **Directions** (table filled at 0x180023970; lengths are the vectors' own): rays 0-3: +-x and +-y, 4800 long; rays 4-7:
  the diagonals (+-2496, +-2304, 0) in the order (-,+), (+,-), (+,+), (-,-); rays 8-17: ten rising rays
  (2496,2304,1248), (2496,2304,2496), (1248,1152,2496), (-2496,-2304,1248), (-2496,-2304,2496), (-1248,-1152,2496),
  (-2496,0,2496), (0,1248,2496), (0,-2496,2496), (1248,0,2496); ray 18 straight up 4800; ray 19 straight down 4800.
  Rays 0-7 leave from the raised origin, 8-19 from the listener's position.
- **Each ray** [0x180024000]: first with content mask 1 (solid); if it hit nothing or hit sky and the ray is one of 0-7, again
  with mask 0x4003 and a second filter object (the filters' rules were not read). Defaults: distance 4800, reflectivity 0.
  Sky (a hit on a surface flagged sky, or no hit with a rise of more than 2400 units): sky mark 0.1 for the ray, and for
  rays 0-7 **the distance becomes 1**. A real hit [0x180023700]: distance = length from start to hit (f32, then trunc);
  reflectivity = the hit material's audio reflectivity from the surface-property table (0.5 if none) [the interface's
  identity is inferred], clamped to 0..1; for rays 8-18 a further ray is dropped 4800 straight down from the hit point and,
  if it hits, **the ray's distance is that drop** (the floor-to-ceiling height under the point it reached).
- **After ray 19** [0x180021d80]:
  - If any of rays 8-17 saw sky but ray 18 (straight up) did not: the pass is discarded (no result).
  - Four spans: x = d0+d1, y = d2+d3, the two diagonals d4+d5 and d6+d7. Areas: x*y and diag*diag. If the smaller area is
    under 0.75 of the larger, the pair with the larger area is used; otherwise the pair that contains the longest of the
    four spans. **width = the smaller span of the pair, length = the larger** (ints).
  - **height = the largest distance of rays 8-18** (so 4800 under open sky).
  - The four wall reflectivities are those of the chosen pair's four rays (0 for a ray that hit nothing or sky: that is
    what "open side" means in e2); ceiling = ray 18's, but 0 if any of rays 8-18 has 0; floor = ray 19's.
    **reflectivity = (four walls + ceiling + floor) / 6** (f32, times 0.16666667).
  - **sky flag = any of rays 8-17 saw sky.** A sum of sky marks is also stored; the build does not use it.
- **Diffusion is not measured in this build**: the field is set to 0 just before the build and nothing else writes it
  (the object count beside it likewise) [read 0x180022989; the only other use is the debug print at 0x180023120].
  So the diffusion class is always 0 and **the "+2" (DIFFUSE) templates are never chosen**: 104/105, 108/109, 112/113,
  116/117, 120/121, 124/125, 128/129, 132/133 are dead for the automatic room.
- **Remembered places** [0x180022d50, 0x180023410]: a node is "in reach" if the listener is within its radius, a ray
  (mask 0x4003) from listener to node position is clear, and the distance is <= 480. Among nodes in reach with the same
  sky flag the one with the largest width*length is taken and its preset number re-used.

## f. Room share of a voice

- Voice channel start [read 0x18005b960]: volume 1.0, pitch 100, origin (0,0,0), **sound level 60 dB and sound source = the
  listener's own view entity in the normal case; 80 dB and source = the talker's entity when the proximity flag is 1**.
  Channel = 8 + voice channel index. Each start sets the channel's own mix limits to -1 ("unset") [read 0x18002eb28].
- In the spatialiser [read 0x180029440, the part 0x180029c4a..0x180029dbe]:
  - dist = (f32)trunc(distance in units). For a sound whose source is the listener's own entity (first person) the
    source is placed 12 units to the side: distance = 12 computed through two approximate reciprocal-square-root
    normalisations, so the truncated value is 11 or 12 [inferred: cannot be settled without the CPU's rsqrt table].
    **For every header in the owner's file 11 and 12 give the same two integer shares** (model, section "Model").
  - **Limits are fixed once per channel**, at the first spatialisation where both stored limits are negative:
    mn = dsp_mix_min, mx = dsp_mix_max; level = 20*log10(10^(snd_refdb/20) / (dist_mult * snd_refdist)) (= the sound level; 0 if
    dist_mult is 0); if trunc(level) <= dsp_db_min (int): mn *= dsp_db_mixdrop, mx *= dsp_db_mixdrop. Stored in the channel
    and not re-read until the channel is started again (a later preset change does not move a playing channel's limits).
  - mix = mn + (clamp(dist, dsp_dist_min, dsp_dist_max) - dsp_dist_min)/(dsp_dist_max - dsp_dist_min) * (mx - mn);
    0 if dsp_off or if the wave name is of the doppler kind. Recomputed every spatialisation from the stored limits.
- Shares when the channel is mixed [read 0x180041fb0]: M = mix*256 (f32). M = 0 if dsp_off or if the room slot in use
  (automatic slot when dsp_room == 1, else room slot) has preset 0 now and before.
  g = dsp_volume * dsp_vol_2ch (stereo) [read 0x180046a50].
  **room share = min(trunc(M*g), 256) / 256**; then if g < 1: M *= g; **dry share = trunc(256 - M) / 256**
  (times a facing factor that is 1 unless dsp_facingaway is on and the wave is directional). Shares multiply the channel's
  float volumes by share*(1/256).
- For a 60 dB voice every header in the file has db_min >= 60, so the drop always applies [inferred from the file's values].

## Differences from W3-15 (each settled in the binary)

Where nothing is listed, the two reads agree. In one line each, the agreements: the FLT design and section arithmetic; the
seven DLY kinds per sample; the high-feedback gain cut; the DFR table and its truncation order (573, 837, 1146, 926
samples at size 1); the plain RVA's delays, powered feedbacks and gain/m; filter-in-loop versus two output sections; the
4-tap factors and floors; modulation as random taps cross-faded; the header's six fields and the overwrite of the four mix
variables on the room and automatic slots; LINEAR as a plain chain, max 5 processors, one processor forces SIMPLE;
preset cross-fade and the "not while a fade runs" rule; the mono room slot at 200 ms; the build by copying A or B whole and
interpolating in fifths (cutoff in quarters); the shape rules; storage in 60..99 and dsp_automatic; the voice at 60 dB,
limits fixed once per channel, the two share formulas, and W3-15's whole share table (re-computed here in f32: identical).

| # | Point | W3-15 | This read | Settled at | Who was right |
| --- | --- | --- | --- | --- | --- |
| 1 | RVA from width/depth/height, a negative factor | only "FLINEAR instead" | first round (i<3): predelay = FLINEAR of the full dimension; **later rounds: the dimension is quartered, floor 7 ms, and the extra is computed from the quartered value**; the sign is dropped there (an ordinary comb) | 0x18003dec6..0x18003def1 | W3-15 incomplete; this read |
| 2 | Same, the "push apart" step | dimensions pushed at least 7*(m/3) apart | the correction term is computed once from the two smaller dimensions and **reused unchanged for the largest**, which can move it by the wrong amount (even down) | 0x18003dd8b..0x18003dddf | this read (more exact) |
| 3 | Same, feedback when fw=fd=fh=0 | feedback^(dimension/shortest) | same, on the **truncated** dimensions; gain is `gain*4096 / m` by division here, by a reciprocal in the plain variant | 0x18003dd38, 0x18003de70, 0x18003ebae | agree; more exact |
| 4 | Predelay line's level | not stated | FLINEAR ignores the reverb's gain/m: its output is the low-passed delayed input times \|factor\| at **gain 1.0** | 0x1800347f3 | this read |
| 5 | Modulation interval | "every `interval` samples" | every **interval + 1** samples (counter is tested for 0 before the reset) | 0x18003e449..0x18003e462 | this read |
| 6 | Modulation with 4-tap delays | not stated | fade runs on the longest tap, but the shortest tap is what gets replaced at the end | 0x180035209, 0x18003e423 | this read (quirk; unused by TF2's file) |
| 7 | High-feedback gain cut, exact form | `int(4096*(1-fb))` | `trunc(4096.0 / (f64)(1f/(1f-g)))` with the f32 reciprocal: differs by one at exact boundaries. **Preset 17's first comb gain is 381, not 382.** A gain integer of 0 is replaced by 4096 | 0x180034777..0x1800347ed | this read |
| 8 | DLY's filter | "the filter above" | only the template's **first section** is copied into the delay: `quality` has no effect inside a DLY or an RVA line | 0x180035544..0x180035575, 0x180034607 | this read (more exact) |
| 9 | FLT band-pass | not read | first section high-pass at cutoff, further sections low-pass at cutoff+width, at least 2 sections; with quality 3 a second high-pass | 0x18003a8b1..0x18003a913, 0x18003aac2..0x18003ab46 | added |
| 10 | Automatic room: diffusion | a measure; class > 1 selects the diffuse pair | **never measured in this build: always 0**, so the diffuse pair is never selected | 0x180022989 (sole writer), 0x1800229b0 | this read |
| 11 | Automatic room: direction of the cutoff blend | "by the reflectivity class" | `B + (A - B) * class/4`: starts at the dull end; class is at most 3, so **the bright template's cutoff is never reached** (at most three quarters of the way). DLY cutoff and width likewise from B toward A, by length class/5 | 0x180032bd9..0x180032c09, 0x180032db6..0x180032e1b | this read (more exact) |
| 12 | Automatic room: which parameters are squared | "for some parameters" | RVA size, min, w, d, h; DLY delay and taps. All others linear | flags at 0x1800328d9, 0x18003290e, 0x180032a96.., 0x180032c6c.. | more exact |
| 13 | Class thresholds and the size class | outline | exact (e1): includes 72, 120, 1152, 0.04, 0.01; size class = mean of width and length classes, except width class for street/alley and a second length scale for the courtyards | 0x180032320..0x1800325a9 | more exact |
| 14 | Re-build rule | outline ("0.6 and 0.8 appear") | exact (e3) | 0x180022827..0x180022978 | more exact |
| 15 | The measuring | outline | read (e4) | see e4 | added |
| 16 | Dry share when dsp_volume*dsp_vol_2ch < 1 | `int(256 - mix*256)` | `trunc(256 - mix*256*g)`: the dry share grows when a soundscape lowers dsp_volume | 0x1800420f8..0x18004210d | this read |
| 17 | Voice's distance | 12 | 12 nominal, 11 or 12 after truncation; same integer shares for every header in the file | 0x180029b5b..0x180029c5b | agree in effect |
| 18 | End of a tail | "can stay at -1" | a comb with the filter in its loop can rest on any negative value down to about -1/(1-feedback); the summed output of the tunnel example rests at -5 to -8, preset 6 at -1 to -2 | model (from 0x180034a47..) | both inferred; larger than W3-15 said |

Nothing in W3-15 was found wrong in a way that changes its conclusions; items 1, 4, 7, 10, 11 change numbers a builder
would produce.

## Model (`dspmodel.py`) and its numbers

`python3 -I dspmodel.py <dsp_presets.txt>` parses the game's file (136 presets, 0..135) and prints the lines below.
Conventions: an impulse of 16384 on a centred voice channel; it enters the room buffer as `16384*room/256 = 64*room`
and the direct path as `64*dry`; the preset starts from silence; time 0 is the impulse's own sample. "Echo" = a local
maximum of |output| (largest within +-22 samples, at least 1% of the response's largest sample). Level = 10*log10(sum of
squared room-path output / direct^2). Decay, measured with an impulse of 100000 so that the integer floor does not
end the tail early: (i) "-60 dB" = start of the first 10 ms window from which the peak stays under 1/1000 of the largest
sample; (ii) "fit" = 60 dB time from a line fitted to the backward-integrated energy between -5 and -35 dB.
**None of the three presets modulates (fmod = 0), so none of these numbers depends on the random stream.** In the model
the random draw is a replaceable function (default: Python's generator, seed 1); it cannot reproduce the engine's
stream. Float steps follow the widths read; the C runtime's powf may differ from numpy's in the last bit (a feedback
integer could differ by 1 at an exact boundary).

**1. Preset 6** (DFR 2 stages, then RVA 100/15 ms, 2 lines, feedback 0.92, gain 1.1, cutoff 5000, filter in loop).
Built: all-passes 573 and 837 samples, feedback 614, gain 4096. Lines: 661 samples (LOWPASS, feedback 3768, output gain
721, loop filter a1 -1874, b 1021) and 2513 samples (feedback 2983, gain 2252, b 808).
Shares 26 room / 229 direct. Impulse into the room 1664; direct 14656.
Echoes (sample, value): (0, 26) (573, -178) (837, -179) (1146, -28) (1235, -16) (1410, 1152) (1499, -16) (1674, -28)
(1983, 171) (2072, 101). Level -20.0 dB against the direct part. Decay: -60 dB at 720 ms; fit 1.02 s. Rests at -1/-2.

**2. Small room, automatic**: measures chosen: not under sky, width 120, length 140, height 100 units, reflectivity 0.3.
Shape room; classes size 0, width 1, length 0, height 1, reflectivity 1. Result = preset 102 whole (header 0.3, 0.8, 80,
0.5; one RVA 80/30 ms, 2 lines, feedback 0.78, gain 1.1) with the cutoff moved to 1800 + (6000-1800)/4 = 2850 Hz.
Lines: 1323 samples (feedback 3194, gain 1983, a1 -2697, b 545) and 2425 samples (feedback 2597, gain 2252, b 443).
Shares 38 / 217. Impulse into the room 2432; direct 13888.
Echoes: (0, 2514) (1324, 259) (2426, 239) (2649, 105) (3974, 61) (4853, 79) (5299, 39) (6625, 27) (7280, 37); the tenth
burst peaks at (7949, 18), under the 1% line. Level -14.6 dB in all, of which the pass-through sample at time 0 is most:
tail alone -26.8 dB. Decay: -60 dB at 390 ms; fit 0.68 s. Ends at exactly 0 (last non-zero sample 19425 at this level).
(Preset 102 exactly as written, cutoff 6000: echoes (0, 2514) (1324, 394) (2426, 363) (2648, 203) (3972, 125)
(4852, 152) (5296, 83) (6620, 57) (7278, 76) (7944, 40); level -14.3 dB, tail -23.9 dB; -60 dB at 500 ms.)

**3. Tunnel, automatic**: measures chosen: not under sky, width 200, length 1000, height 150, reflectivity 0.3.
Shape tunnel (length > 4 widths, width > 96); classes size 2, width 2, length 3, height 2, reflectivity 1. Size class > 1,
so the copy is preset 115 (header 0.4, 0.9, 80, 0.7; DFR then RVA), then: DFR count 2.4 (2 stages), feedback 0.14898;
RVA count 7.2 (7, made 9), gain 2.0, cutoff 4500, w 14.4, d 89.6, h 18.64, fw 0.952, fd -0.6, fh 0.44.
Built: all-passes 573 and 837 samples, feedback 610. Nine lines (samples; kind; feedback; output gain):
3924 FLINEAR predelay, factor 2457/4096, gain 4096 | 1543 LOWPASS 1802, 910 | 617 LOWPASS 3899, 227 | 1278, 2457, 910 |
1852, 1802, 910 | 926, 3899, 227 | 1587, 2457, 910 | 2160, 1802, 910 | 1234, 3899, 227. Loop filter a1 -2054.
Shares 72 / 183. Impulse into the room 4608; direct 11712.
Echoes: (0, 125) (573, -864) (837, -864) (1146, -133) (1410, 5622) (1674, -133) (1983, 833) (2028, 86) (2247, 833)
(2337, 85). Level -4.8 dB against the direct part. Decay: -60 dB at 540 ms; fit 0.72 s. Rests at -5 to -8.
(Preset 114 exactly as written: lines 1940 FLINEAR 3686/4096 | 970, 1638, 1365 | 352, 3850, 341 | 793, 3686, 545 |
1278, 1638, 1365 | 661, 3850, 341; echoes (0, 95) (573, -647) (837, -647) (1146, -98) (1410, 4255) (1544, -48)
(1631, -46) (1674, -100) (1763, 148) (1808, -43); level -6.5 dB; -60 dB at 490 ms.)

Cross-checks: the model gives W3-15's integers for preset 5 (352 and 1278 samples, feedbacks 3768 and 3026, gains 721
and 2252) and for preset 6; for preset 17 it gives gains 381, 470, 558, 642, 725, 806 (W3-15: "382 rising to 806").
Share table for every header of the file, distance 12 and 11 alike: (0.2,0.7,80,0.5) 26/229; (0.3,0.8,80,0.5) 38/217;
(0.32,0.8,80,0.5) 41/214; (0.63,0.8,80,0.5) 80/175; (0.4,0.9,80,0.5) 51/204; (0.4,0.9,80,0.7) 72/183;
(0.3,0.8,75,0.3) 23/232; (0.32,0.8,60,0.3) 24/231; (0.21,0.8,95,0.1), (0.22,0.6,95,0.1), (0.2,0.7,95,0.1) 5/250;
(0.2,0.7,0,0) [presets 44-49, 60-99 before they are overwritten] 52/203.

## Still not read

- Processor types CRS, PTC, ENV, LFO, EFO, and by me also AMP and MDY (W3-15 read those two); preset configurations other
  than SIMPLE and LINEAR; the cross-fading read of a LOWPASS_4TAP delay (0x180038c60); the surround paths.
- The two trace filter objects (what the rays ignore), the surface-property interface's identity, the copy routine
  that stores a node (0x1800206d0), the debug drawing (0x180023020).
- How a channel's distance factor is computed from its sound level (so whether a 60 dB voice counts as 59 or 60: without
  effect for the file's headers), the client-side test that decides "the listener's own sound" (a virtual call), and that
  a voice channel is restarted for each run of speech (taken from W3-07, not re-read).
- The identity of the C runtime routines (powf, fmod, tan, pow, log10) is inferred from how they are called.
- How the engine's RandomInt stream is seeded.
