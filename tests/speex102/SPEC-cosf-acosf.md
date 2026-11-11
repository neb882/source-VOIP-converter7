# The float cosine and arc cosine of the game's Speex build: a specification

This describes two single-precision routines, `cosf` and `acosf`, of the C runtime that is linked into the
game's 32-bit Speex voice module, as they were measured (the module's own routines called on millions of
arguments) and read. The game's build of Speex 1.0.2 calls them where the C source says `cos` and `acos`
(the LSP conversions in `nb_celp.c`). Neither returns the nearest float to the true value on every argument,
so a build that is to give the game's packets and samples bit for bit has to compute them the same way.

Everything here is stated as arithmetic: which values are formed, in which type, in which order. The tables
and constants are mathematical values (a sine, a square root, an arc sine, pi, rounded as stated); each one
is defined below so that it can be computed afresh. Nothing of the module is reproduced.

Reference vectors measured from the module are in `vectors/` (section 4). An implementation written from
this text alone was compared with the module on the arguments listed in section 5 and was equal on all.

## 0. Conventions

- **float** is IEEE 754 binary32, **double** is binary64. Every operation is one correctly rounded IEEE
  operation in round-to-nearest, ties-to-even. No fused multiply-add, no wider intermediate precision, no
  re-ordering: the brackets in a formula are the order of evaluation.
- In section 2 every operation is a float operation and is written with a circle: a (+) b, a (-) b, a (x) b,
  a (/) b, and sqrt(a) for the float square root. In section 1 the type of each step is stated in the step.
- RN32(v) is the float nearest to the real number v; RN64(v) the double nearest to v. (No constant here falls
  on a tie.) The hexadecimal forms given, such as `0x1.921fb8p+0`, are C99 hexadecimal floating constants and
  denote the value exactly; they were computed from the definitions and are given as a check.
- "The bit pattern" of a float is its 32 bits as an unsigned integer: sign, 8 exponent bits, 23 fraction
  bits. "x with its k lowest bits cleared" is the float whose pattern is that of x with the k least
  significant bits set to zero (the sign is kept; the magnitude moves toward zero).
- Negating a value and multiplying by a power of two are exact, so they are written without a circle.

## 1. cosf(x), x a float

### 1.1 Ranges

| argument | result |
|----------|--------|
| \|x\| < 2^-126 (zero of either sign, and the subnormal numbers) | 1.0 |
| 2^-126 <= \|x\| < 8192 | steps 1 to 10 below, for either sign of x |
| \|x\| >= 8192, infinities, NaN | not specified here (see section 6) |

Speex only passes arguments in (0, pi).

### 1.2 Constants

- K = RN32(32/pi) = `0x1.45f306p+3` (10.18591594696045). A float.
- P1 = pi/32 rounded to the nearest number with 39 significant bits = `0x1.921fb54444p-4`
  (0.0981747704247482). It is exactly representable as a double. P1 is slightly larger than pi/32.
- P2 = RN64(P1 - pi/32) = `0x1.2e7b9676733afp-44` (6.716466596857464e-14). A double, positive.
- c4 = RN64(1/24) = `0x1.5555555555555p-5`; s2 = RN64(1/6) = `0x1.5555555555555p-3`;
  s4 = RN64(1/120) = `0x1.1111111111111p-7`. Doubles.
- Two tables of 64 doubles: SIN[j] = RN64(sin(j pi/32)) and COS[j] = RN64(cos(j pi/32)) for j = 0..63, with
  these four entries exactly +0: SIN[0], SIN[32], COS[16], COS[48] (the true values are zero; computing
  them from a rounded pi would give a tiny non-zero number, which is wrong here). The entries whose true
  value is 1 or -1 are exactly that.
  Check: the SHA-256 of the 64 doubles of SIN in order, each as 8 little-endian bytes, is
  `f902f0033b701e4565a86c54f351fcd7671272c5fa521b161c769b60b1af3b29`; of COS,
  `d213f2d6db7ba5abd75b3a7ff997d32b3b8d1095fcb4377a6b5e6c392b3795f1`. SIN[1] = `0x1.917a6bc29b42cp-4`,
  COS[1] = `0x1.fd88da3d12526p-1`.

### 1.3 Steps (2^-126 <= |x| < 8192)

1. k = x times K, **in float** (one float multiplication).
2. n = k rounded to the nearest integer, ties to even. n has the sign of x (or is 0) and |n| <= 83,443.
3. From here on everything is **double**. x and n are converted to double exactly.
   p = n x P1 (one double multiplication, rounded), then r = x - p (one double subtraction, rounded).
4. q = n x P2, then rho = q + r.
   (r is the reduced argument computed with the short constant; rho adds the part of pi/32 that P1 left
   out. Mathematically rho is x - n pi/32, and |rho| is at most about pi/64.)
5. r2 = r x r, then r4 = r2 x r2. (Both from r, not from rho.)
6. CP = (1 - r2/2) + (c4 x r4): first r2/2 (exact), then 1 minus it, then c4 x r4, then the sum of the two.
7. SP = (1 - (s2 x r2)) + (s4 x r4): first s2 x r2, then 1 minus it, then s4 x r4, then the sum of the two.
8. j = (n + 16) mod 64, taken as a number from 0 to 63 also when n is negative.
9. y = (SIN[j] x CP) + ((rho x COS[j]) x SP): the product SIN[j] x CP; the product rho x COS[j], and that
   times SP; then the sum of the two.
10. The result is y rounded to float.

Why this is a cosine: with phi = n pi/32, cos(x) = cos(phi) cos(rho) - sin(phi) sin(rho). The table is
entered a quarter turn ahead, so SIN[j] = cos(phi) and COS[j] = -sin(phi). CP approximates cos(rho) and
rho x SP approximates sin(rho). Note that the two polynomials are evaluated at r while the factor in front
of SP is rho; an implementation that uses rho (or r) in both places gives different last bits.

## 2. acosf(x), x a float

### 2.1 Ranges

Let B = RN32(sqrt(3)/2) = `0x1.bb67aep-1` (0.8660253882408142).

| argument | result |
|----------|--------|
| \|x\| < 2^-16 (zero of either sign and subnormals included) | range 1 |
| 2^-16 <= \|x\| < 1/16 | range 2 |
| 1/16 <= \|x\| < B | range 3 |
| B <= \|x\| < 127/128 | range 4 |
| 127/128 <= \|x\| < 1 | range 5 |
| x = 1 | +0 |
| x = -1 | PH (below), which is RN32(pi) |
| \|x\| > 1, infinities, NaN | a NaN; not specified further (section 6) |

Each lower boundary belongs to the range that starts there: 2^-16 itself is range 2, 1/16 is range 3, B is
range 4, 127/128 is range 5. Speex passes arguments strictly between -1 and 1.

### 2.2 Constants (all floats)

- H = pi/2 rounded to the nearest number with 22 significant bits = `0x1.921fb8p+0` (1.5707964897155762).
  This is not RN32(pi/2); it is one float step above it.
- L = RN32(pi/2 - H) = `-0x1.5dde98p-23` (-1.6292068494294654e-07).
- PH = RN32(pi) = `0x1.921fb6p+1` (3.1415927410125732); PL = RN32(pi - PH) = `-0x1.777a5cp-24`
  (-8.742277657347586e-08).
- a1 = RN32(1/6) = `0x1.555556p-3`; a2 = RN32(3/40) = `0x1.333334p-4`; a3 = RN32(5/112) = `0x1.6db6dcp-5`.

### 2.3 The table

The floats in [1/16, 1) are divided into 256 groups: each of the four binades [1/16, 1/8), [1/8, 1/4),
[1/4, 1/2), [1/2, 1) into 64 groups of equal width. For a float y in [1/16, 1), write y = f x 2^e with
1 <= f < 2 (so e is -4, -3, -2 or -1). Then

- the group number is G(y) = 64 (e + 4) + floor(64 (f - 1)), from 0 to 255;
- the group's midpoint is c_J = 2^e (1 + (m + 1/2)/64) for J = 64 (e + 4) + m, m = 0..63. Every c_J is a
  float. (In bit patterns: G(y) is the pattern of y minus the pattern of 1/16, divided by 2^17 and rounded
  down; c_J has the pattern of 1/16 plus J x 2^17 plus 2^16. c_0 = 0.06298828125, c_255 = 0.99609375.)

Three floats per group, J = 0..255:

- A_J = RN32(sqrt(1 - c_J^2)), the square root of the exact real number 1 - c_J^2;
- HI_J = RN32(asin(c_J)) with its 5 lowest bits cleared;
- LO_J = RN32(asin(c_J) - HI_J), the real difference between the true arc sine and the float HI_J, rounded.

Check, SHA-256 of the 256 floats in order, each as 4 little-endian bytes: A
`58f7f662f103983f3bd11744e59e134dfacc7f7680efabd46ae06ee5db3be874`, HI
`b2944aa92880c42670939a06d768494665f1abbaa6bdc54d241830e274e40167`, LO
`b00cd7465933165564672754236e9e7f702e5fe17ad85591bb36a2a93a211426`. For J = 100: c = 0.1962890625,
A = 0.9805460572242737, HI = 0.1975717544555664, LO = 1.6050380224896799e-07.

### 2.4 Range 1: |x| < 2^-16

1. u = x (-) H.
2. w = H (+) u.
3. e = w (-) x.
4. result = (L (+) e) (-) u.

(This is pi/2 - x with the rounding error of step 1 put back. On every argument tried the result is
RN32(pi/2 - x), but the steps above are what was established.)

### 2.5 Range 2: 2^-16 <= |x| < 1/16

1. x2 = x (x) x.
2. p3 = -((a1 (x) x) (x) x2).
3. p5 = -((x2 (x) x2) (x) (a2 (x) x)).
4. u = x (-) H; w = H (+) u; e = x (-) w. (Note the order in e: here it is x minus w, in range 1 w minus x.)
5. result = ((p5 (+) (p3 (+) L)) (-) e) (-) u.

(acos x = pi/2 - x - x^3/6 - 3x^5/40.)

### 2.6 Range 3: 1/16 <= |x| < B

Let sg be +1 if x is positive and -1 if x is negative. J = G(|x|). Let c = sg c_J, hi = sg HI_J,
lo = sg LO_J (c has the sign of x; so do hi and lo).

1. s = sqrt(1 (-) (x (x) x)).
2. xa = x (x) A_J.
3. cs = c (x) s.
4. q = ((x (-) c) (x) (x (+) c)) (/) (xa (+) cs).
5. d = cs (-) xa.
6. p = (a1 (x) d) (x) (d (x) d).
7. Lj = L (-) lo; Hj = H (-) hi.
8. t = Hj (-) q.
9. e = q (-) (Hj (-) t).
10. result = ((p (+) Lj) (-) e) (+) t.

(asin x = asin c + asin(q') with q' = x sqrt(1 - c^2) - c sqrt(1 - x^2) = (x^2 - c^2)/(x A + c s). The
routine takes q' as the quotient q and its cube from d, which is -q' formed by subtraction; the result is
(pi/2 - asin c) - q - q^3/6, with e the rounding error of step 8.)

### 2.7 Range 4: B <= |x| < 127/128

Let sg be as above and neg mean "x is negative".

1. xh = x with its 12 lowest bits cleared; xl = x (-) xh (exact).
2. w = 1 (-) (xh (x) xh).
3. v = (x (+) xh) (x) xl.
4. s = sqrt(w (-) v). (s is sqrt(1 - x^2), formed so that the subtraction loses little; s is positive and
   lies between 0.12 and 0.51.)
5. J = G(s); c = sg c_J. (The table is entered with s, not with x; c gets the sign of x.)
6. sA = s (x) A_J.
7. d = ((xh (x) c) (-) sA) (+) (xl (x) c).
8. num = (w (-) (c (x) c)) (-) v.
9. q = num (/) ((sA (+) sA) (+) d).
10. p = -((a1 (x) d) (x) (d (x) d)).
11. If x is positive: r0 = LO_J and r1 = HI_J. If x is negative: r0 = (-PL) (+) LO_J and r1 = (-PH) (+) HI_J.
12. y = ((p (+) r0) (+) q) (+) r1.
13. result = y if x is positive, -y if x is negative.

(For positive x, acos x = asin s = asin c + q + q^3/6 with q = (s^2 - c^2)/(s A + c x); d is -q formed by
subtraction. For negative x the steps give -(pi - that) and step 13 flips the sign.)

### 2.8 Range 5: 127/128 <= |x| < 1

1. t = 1/2 - |x|/2 (both operations are exact here).
2. r = sqrt(t).
3. P = -((a1 (+) (a2 (x) t)) (+) (a3 (x) (t (x) t))).
4. Pt = P (x) t.
5. rh = r with its 12 lowest bits cleared; rl = r (-) rh (exact).
6. cr = ((t (-) (rh (x) rh)) (-) (rl (x) ((r (+) r) (-) rl))) (/) r.
7. r2 = r (+) r (exact).
8. If x is positive: y = ((Pt (x) r2) (-) cr) (-) r2, and the result is -y.
   If x is negative: y = PH (+) ((((Pt (x) r2) (+) PL) (-) cr) (-) r2), and the result is y.

(acos |x| = 2 asin(z) with z = sqrt((1 - |x|)/2); asin z = z + z t (1/6 + 3t/40 + 5t^2/112) with t = z^2.
r is the rounded z and cr is twice its rounding error, (t - r^2)/r. For negative x the result is pi minus
that.)

### 2.9 The ends

x = 1 gives +0. x = -1 gives PH. For |x| > 1 and for infinities the routine returns a NaN; for a NaN
argument a NaN.

## 3. Things an implementation gets wrong easily

- Contracting a product and a sum into a fused multiply-add, or evaluating float expressions in double (or
  in x87 extended precision), changes results. Compile strictly.
- In `cosf` the reduction is one float multiplication followed by double arithmetic; the float product in
  step 1 decides n, so it must not be done in double.
- The table index in ranges 3 and 4 of `acosf` is the group of the float actually computed (|x| in range 3,
  the float s in range 4), found from its value as in 2.3; do not index by a rounded or recomputed quantity.
- Signs: in range 3, c, hi and lo carry the sign of x; in range 4 only c does, and the sign is applied to
  the result at the end; in range 5 the absolute value is used throughout.
- sqrt must be the correctly rounded float square root.

## 4. Reference vectors

`vectors/cosf.args.f32`, `vectors/cosf.out.f32`, `vectors/acosf.args.f32`, `vectors/acosf.out.f32`: arrays
of little-endian binary32. The i-th value of `.out` is the module's result for the i-th value of `.args`;
compare bit patterns. They hold random arguments from every range, every range boundary with its
neighbouring floats on both sides and with both signs, the neighbours of every table-group boundary, zero
and subnormal arguments, and the arguments found on which the module's result is not the nearest float
(counts in section 5). All arguments lie in the ranges this text specifies: |x| < 8192 for `cosf`,
|x| <= 1 for `acosf`. `vectors/SHA256SUMS` lists all files.

The seven `clip-*` triples in the same folder are something else: synthetic 16-bit input (`.s16`), with the
packets (`.pk`, 20 bytes a frame) and decoded 16-bit output (`.pcm`) of the game's module for it; they test
the whole codec, `clip-acosf` and `clip-cosf` being the two that fail when these routines are replaced by
correctly rounded ones.

## 5. How this text was checked

A second implementation was written from this text (float and double arithmetic with numpy, tables with
mpmath at 400 bits) and compared, bit pattern for bit pattern, with the module's own routines.

`cosf`: 2,413,121 arguments (distinct within each row), the implementation differs from the module on 0.

| arguments | how many | differ |
|-----------|----------|--------|
| random in (0, pi), where Speex calls it | 1,169,511 | 0 |
| random in (-8192, 8192) | 596,483 | 0 |
| random over all magnitudes from 2^-126 to 8192, both signs | 299,989 | 0 |
| random in (-pi, 0) | 298,010 | 0 |
| arguments where x times 32/pi falls nearest to a half (n from 0 to 600 and from 83,000 to 83,442), with 3 neighbouring floats each side, both signs | 14,602 | 0 |
| the first 2,048 multiples of pi/32, with 3 neighbours each side, both signs | 28,672 | 0 |
| 2^-126 with 6 neighbours each side, the two floats below 8192, zero of both signs, 2,000 subnormals | 2,034 | 0 |
| arguments in (0, pi) on which the result is not the nearest float (found by 40,000,000 random draws) | 771 | 0 |
| the arguments of an earlier set of vectors | 3,049 | 0 |

`acosf`: 2,453,557 arguments (distinct within each row), the implementation differs from the module on 0.

| arguments | how many | differ |
|-----------|----------|--------|
| random in (-1, 1) | 1,185,908 | 0 |
| random in range 1, magnitudes from 2^-40 to 2^-16, both signs | 149,971 | 0 |
| random in range 2, both signs | 299,759 | 0 |
| random in range 3, both signs | 298,889 | 0 |
| random in range 4, both signs | 289,678 | 0 |
| random in range 5, both signs | 178,420 | 0 |
| the range boundaries 2^-16, 1/16, B, 127/128 with 8 neighbours each side, and 1 with the 8 floats below it, both signs | 154 | 0 |
| zero of both signs, the smallest and largest subnormals, and 20,000 random bit patterns below 2^-16 | 20,008 | 0 |
| every table-group boundary in [1/16, 1) with 2 neighbours each side, both signs | 2,560 | 0 |
| range 4 arguments whose s falls at a table-group boundary, with 40 neighbours each side, both signs | 20,898 | 0 |
| range 1 arguments next to every point where pi/2 - x lies halfway between two floats, with 6 neighbours each side | 3,328 | 0 |
| the arguments of an earlier set of vectors | 3,984 | 0 |

A third implementation, typed in one step at a time from sections 1 and 2 in plain Python, first checks the
constants and table hashes printed in this text and then the reference vectors: `cosf` equal on 21,389 of
21,389, `acosf` on 22,155 of 22,155. That pass caught one wrong number in an earlier draft of this text (a table
midpoint given as a check value); no step had to be changed.

The vectors: `cosf` 21,389 arguments, of which 1,362 are ones on which the module's result is not the
nearest float to the true cosine; `acosf` 22,155, of which 3,579. They contain every row above that has
fewer than 4,500 arguments in full (the range ends and boundaries, the table-group boundaries, the halfway
points of range 1, the earlier vectors), every argument of any row on which the module is not the nearest
float, and 1,200 (`acosf`) or 2,500 (`cosf`) arguments drawn at random from each larger row.

## 6. Not pinned down

- `cosf` for |x| >= 8192: the runtime hands these to another routine, which was not established. (On 3,000
  arguments between 8192 and 2^60 the result seen was RN32 of the true cosine, but that path could only be
  run in a way that does not guarantee the last bit.) Infinities gave a NaN, a NaN argument a NaN.
- `acosf` outside [-1, 1]: a NaN was seen (bit pattern `0xffc00000` for |x| > 1 and infinities; a NaN argument
  came back quieted with its payload). Speex never passes these and nothing depends on the pattern.
- Floating-point exception flags, and behaviour in rounding modes other than round-to-nearest, were not
  looked at.
- Range 1 of `acosf` and the two ends were established on the arguments listed in section 5, not on every
  float; the same holds for every range (there are too many floats to try them all in the time taken).
