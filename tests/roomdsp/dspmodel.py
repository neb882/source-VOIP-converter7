#!/usr/bin/env python3
"""Reference model of the room DSP arithmetic as read from the owner's engine.dll (W3-17 second read).

Integer arithmetic as read: 32-bit signed products that wrap, arithmetic right shifts by 12, float32/float64
steps in the builders done in the widths and order read.  Processors modelled: FLT, DLY (all seven kinds),
DFR, RVA (plain and width/depth/height variants, random-tap modulation), NULL, and (added by the W3-17 AMP/MDY
read) AMP and MDY.  Not modelled: CRS PTC ENV LFO EFO, preset configurations other than SIMPLE/LINEAR (so MDY's
external-modulation hook is present but never driven), the cross-fading LOWPASS_4TAP read.

Usage:  python3 -I dspmodel.py <path to dsp_presets.txt>        (prints the three example responses)
"""
import math, re, sys, random
import numpy as np

f32 = np.float32
SR = 44100
PI_OVER_SR = 7.123792865282977e-05      # f64 constant in the binary (pi/44100)
MS = f32(44.1)                          # f32 constant in the binary

def tr(x):                              # float -> int32, truncating toward zero
    return int(x)

def w32(x):                             # wrap to signed 32 bits
    x &= 0xFFFFFFFF
    return x - 0x100000000 if x & 0x80000000 else x

def msh(a, b):                          # (a*b) as a 32-bit product, then arithmetic >> 12
    return w32(a * b) >> 12

# ---------------------------------------------------------------- filter (FLT)
class Section:
    __slots__ = ("a1", "b0", "b1", "w1")
    def __init__(s, a1, b0, b1):
        s.a1, s.b0, s.b1, s.w1 = a1, b0, b1, 0
    def next(s, x):
        w1 = s.w1
        if w1 == 0 and x == 0:
            return 0
        w0 = w32(x - msh(w1, s.a1))
        y = w32(w32(w0 * s.b0) + w32(w1 * s.b1)) >> 12
        s.w1 = w0
        return y

def flt_coefs(ftype, cutoff):
    """one first-order section: returns (a1, b0, b1) as 12-bit fixed point ints"""
    w = math.tan(float(f32(cutoff)) * PI_OVER_SR)
    p = (1.0 - w) / (1.0 + w)
    a1 = tr(-4096.0 * p)
    if int(ftype) == 1:                 # HP
        b0 = tr(2048.0 * (p + 1.0)); b1 = -b0
    else:                               # LP
        b0 = tr(2048.0 * (1.0 - p)); b1 = b0
    return a1, b0, b1

def scale_b(b, gain):
    return tr(f32(b) * f32(gain))

class Flt:
    """FLT processor: quality q -> q+1 first-order sections in series, gain on the first one only."""
    def __init__(s, p):
        ftype, cutoff, qwidth, quality, gain = (list(p) + [0] * 5)[:5]
        q = min(max(tr(f32(quality)), 0), 3)
        secs = []
        if f32(qwidth) > 0:             # band-pass by width: HP at cutoff, LP at cutoff+width
            q = max(q, 1)
            hp = flt_coefs(1, cutoff); lp = flt_coefs(0, f32(cutoff) + f32(qwidth))
            secs.append(Section(hp[0], scale_b(hp[1], gain), scale_b(hp[2], gain)))
            secs += [Section(*lp) for _ in range(min(q, 2))]
            if q == 3: secs.append(Section(*hp))
        else:
            c = flt_coefs(ftype, cutoff)
            secs.append(Section(c[0], scale_b(c[1], gain), scale_b(c[2], gain)))
            secs += [Section(*c) for _ in range(q)]
        s.secs = secs
    def next(s, x):
        for sec in s.secs: x = sec.next(x)
        return x

# ---------------------------------------------------------------- delay (DLY)
class Dly:
    def __init__(s, D, a, b, kind, fsec=None):
        """D samples, a feedback int, b gain int, kind 0..6, fsec = (a1,b0,b1) template for kinds 2,4,5"""
        s.kind, s.D = kind, D
        if kind in (5, 6):
            b = tr(f32(b) * f32(0.25))
        s.flt = None
        if kind in (2, 4, 5):
            g = f32(a) * f32(1.0 / 4096.0)
            s.flt = Section(fsec[0], tr(f32(fsec[1]) * g), tr(f32(fsec[2]) * g))
        s.buf = [0] * (D + 1); s.w = 0
        s.tap = D; s.tapnew = D; s.xf = 0; s.maxd = D
        s.taps = [D, D, D, D]            # shortest, .., .., longest (4-tap kinds)
        s.a = min(a, 0xFFF)
        if kind in (3, 4):
            s.a = 0; s.g = 0x1000
        else:
            g = min(f32(a) * f32(1.0 / 4096.0), f32(0.999))
            inv = f32(1.0) / (f32(1.0) - g)
            e = tr(4096.0 / float(inv))
            k = min(max(f32(e) * f32(4.0), f32(1024.0)), f32(4096.0))
            s.g = tr(k * f32(b if b != 0 else 0x1000) * f32(1.0 / 4096.0))
    def set_taps(s, t0, t1, t2, t3):
        t = sorted([t0, t1, t2, t3])
        s.taps = [min(x, s.maxd) for x in t]
        s.tap = s.taps[0]                # the shortest tap shares the field of the single tap
    def rd(s, t):
        return s.buf[(s.w + t) % (s.D + 1)]
    def wr(s, v):
        s.buf[s.w] = v
        s.w -= 1
        if s.w < 0: s.w += s.D + 1
    def next(s, x, fading=False):
        k = s.kind
        if k in (5, 6):
            d0 = s.rd(s.tap); d1 = s.rd(s.taps[1]); d2 = s.rd(s.taps[2]); d3 = s.rd(s.taps[3])
            if fading:
                if k == 5: raise NotImplementedError("cross-fading LOWPASS_4TAP not read")
                dn = s.rd(s.tapnew); d3 = w32(d3 + (w32((dn - d3) * s.xf) >> 12))
            tot = w32(d0 + d1 + d2 + d3)
            v = w32((s.flt.next(d3) if k == 5 else msh(d3, s.a)) + x)
            s.wr(v)
            return msh(w32(tot + x), s.g)
        d = s.rd(s.tap)
        if fading:
            dn = s.rd(s.tapnew); d = w32(d + (w32((dn - d) * s.xf) >> 12))
        if k == 0:
            v = w32(msh(d, s.a) + x); s.wr(v); return msh(v, s.g)
        if k == 1:
            v = w32(msh(d, s.a) + x); s.wr(v)
            t = w32((w32(-w32(v * s.a)) >> 12) + d)
            return msh(t, s.g)
        if k == 2:
            v = w32(s.flt.next(d) + x); s.wr(v); return msh(v, s.g)
        if k == 3:
            s.wr(x); return d
        if k == 4:
            f = s.flt.next(d); s.wr(x); return msh(f, s.g)
        raise ValueError(k)

class DlyProc:
    """DLY processor built from file params"""
    def __init__(s, p):
        p = (list(p) + [0] * 11)[:11]
        kind = tr(f32(p[0]))
        D = tr(abs(f32(p[1])) * MS); a = tr(f32(p[2]) * f32(4096.0)); b = tr(f32(p[3]) * f32(4096.0))
        fsec = None
        if kind in (2, 4, 5):
            if f32(p[6]) > 0: fsec = flt_coefs(1, p[5])      # width>0: the first section is the high-pass
            else: fsec = flt_coefs(p[4], p[5])
        s.d = Dly(D, a, b, kind, fsec)
        if kind in (5, 6):
            s.d.set_taps(D, tr(abs(f32(p[8])) * MS), tr(abs(f32(p[9])) * MS), tr(abs(f32(p[10])) * MS))
    def next(s, x): return s.d.next(x)

# ---------------------------------------------------------------- diffusor (DFR)
DFR_MS = [13.0, 19.0, 26.0, 21.0, 32.0, 36.0, 38.0, 16.0, 24.0, 28.0, 41.0, 35.0, 10.0, 46.0, 50.0, 27.0]
class Dfr:
    def __init__(s, p):
        p = (list(p) + [0] * 4)[:4]
        size, fb = f32(p[0]), f32(p[2])
        gain = f32(p[3]) if f32(p[3]) != 0 else f32(1.0)
        n = min(max(tr(f32(p[1])), 1), 8)
        s.st = []
        for i in range(n):
            D = (tr(size * f32(DFR_MS[i])) * 44100) // 1000
            a = tr(min(float(f32(1.0) * f32(4096.0) * fb), 4091.9))
            s.st.append(Dly(D, a, tr(gain * f32(4096.0)), 1))
    def next(s, x):
        for d in s.st: x = d.next(x)
        return x

# ---------------------------------------------------------------- reverb (RVA)
class Ramp:
    def __init__(s, seconds):
        n = tr(f32(seconds) * f32(44100.0))
        step = f32(4096.0) / f32(n) if n else f32(np.inf)
        i = tr(step) if np.isfinite(step) else 0x7FFFFFFF
        if i > 0xFFF: step = f32(step - f32(i) + f32(4095.0)) if np.isfinite(step) else f32(4095.0)
        s.step = tr(step * f32(1048576.0)); s.acc = 0; s.pos = 0; s.hit = False; s.done = False; s.cur = 0
    def next(s):
        if s.done: return s.cur
        r = s.pos
        if not s.hit:
            acc = s.acc + s.step
            npos = (acc >> 20) + s.pos
            s.acc = acc & 0xFFFFF; s.pos = npos
            if s.step != 0 and 0 <= npos < 0x1000: r = npos
            else: s.hit = True
        if s.hit: s.done = True
        s.cur = r
        return r

class ModDly:
    def __init__(s, dly, fmod, rate, randint):
        T = f32(dly.D) * f32(2.2675736545352265e-05)
        s.d = dly; s.randint = randint
        s.depth = min(max(f32(fmod) * f32(0.001) / T, f32(0.01)), f32(0.99))
        s.xft = min(T * f32(rate) * f32(0.5), f32(0.02))
        s.period = tr(T * f32(rate) * f32(44100.0)); s.cnt = s.period
        s.fading = False; s.ramp = None
    def next(s, x):
        d = s.d
        if not s.fading:
            y = d.next(x)
        else:
            y = d.next(x, fading=True)
            d.xf = s.ramp.next()
            if s.ramp.done:
                d.tap = d.tapnew; s.fading = False
        if s.period != 0:
            c = s.cnt; s.cnt = c - 1
            if c == 0:
                s.cnt = s.period
                new = s.randint(tr((f32(1.0) - s.depth) * f32(d.maxd)), d.maxd)
                s.fading = True; s.ramp = Ramp(s.xft)
                d.tapnew = min(new, d.maxd); d.xf = 0
        return y

def powf(x, y):
    return f32(np.power(f32(x), f32(y)))   # the engine calls its C runtime's powf; may differ in the last bit

class Rva:
    def __init__(s, p, randint=None):
        p = [f32(v) for v in (list(p) + [0] * 16)[:16]]
        size, mn, feedbk, gain, cutoff = p[0], p[1], p[3], p[4], p[5]
        fpar = tr(p[6]); fmod, rate, ftap = p[7], p[8], p[15]
        w, d, h = abs(p[9]), abs(p[10]), abs(p[11])
        m = tr(min(max(p[2], f32(1.0)), f32(12.0)))
        D, A, B = [], [], []
        if tr(w) == 0 and tr(d) == 0 and tr(h) == 0:
            inv = f32(1.0) / f32(m)
            b = tr(gain * f32(4096.0) * inv)
            step = (size - mn) * inv
            for i in range(m):
                Di = tr((f32(tr(f32(i) * step)) + mn) * MS)
                D.append(Di)
                fb = float(feedbk) if i == 0 else float(powf(feedbk, f32(Di) / f32(D[0])))
                A.append(tr(min(fb * 4096.0, 4091.9))); B.append(b)
        else:
            m = 3 if m < 3 else 6 if m in (4, 5) else 9 if m in (7, 8) else 12 if m > 9 else m
            sz = [w, d, h]; f = [p[12], p[13], p[14]]
            def sw(i, j):
                sz[i], sz[j] = sz[j], sz[i]; f[i], f[j] = f[j], f[i]
            if sz[2] > sz[1]: sw(1, 2)
            if sz[1] > sz[0]: sw(0, 1)
            if sz[2] > sz[1]: sw(1, 2)
            if f[0] == 0 and f[1] == 0 and f[2] == 0:
                f[0] = powf(feedbk, f32(tr(sz[0])) / f32(tr(sz[2])))
                f[1] = powf(feedbk, f32(tr(sz[1])) / f32(tr(sz[2])))
                f[2] = feedbk
            L = f32(7 * (m // 3))
            d12 = sz[1] - sz[2]; e = L - d12
            if not (d12 > L): sz[1] = e + sz[1]
            if not (sz[0] - sz[1] > L): sz[0] = e + sz[0]        # the same e, as read
            b = tr(gain * f32(4096.0) / f32(m))
            for i in range(m):
                j = i % 3
                fj = f[j]; S = tr(sz[j]); pre = False; extra = f32(0.0)
                if fj < 0 and i < 3:
                    pre = True
                else:
                    if fj < 0: S = max(tr(sz[j] * f32(0.25)), 7)
                    if i >= 3:
                        q = i // 3
                        extra = f32(max(float(f32(S)) * 0.18 * q, float(7 * q)))
                total = tr(extra) + S
                D.append((total * 44100) // 1000)
                a = tr(min(float(abs(fj) * f32(4096.0)), 4091.9))
                A.append(-a if pre else a); B.append(b)
        s.D, s.A, s.B, s.m, s.fpar = D, A, B, m, fpar
        fsec = flt_coefs(0, cutoff) if cutoff != 0 else None
        s.out = [Section(*fsec), Section(*fsec)] if (fsec and fpar == 0) else []
        s.lines = []; s.kinds = []
        for i in range(m):
            if fsec and fpar:
                kind = 4 if A[i] < 0 else (5 if ftap > 0 else 2)
                dl = Dly(D[i], abs(A[i]), B[i], kind, fsec)
            else:
                kind = 6 if ftap > 0 else 0
                dl = Dly(D[i], abs(A[i]), B[i], kind)
            if kind in (5, 6):
                t = float(ftap); Dd = float(D[i])
                t3 = tr(f32(max((1.0 - t * 0.96325) * Dd, 441.0)))
                t2 = tr(f32(max((1.0 - t * 1.697043) * Dd, 308.0)))
                t1 = tr(f32(max((1.0 - t * 3.141592) * Dd, 220.0)))
                dl.set_taps(t1, t2, t3, D[i])
            s.lines.append(dl); s.kinds.append(kind)
        s.mod = None
        if fmod > 0:
            s.mod = [ModDly(dl, fmod, rate, randint or random.Random(1).randint) for dl in s.lines]
    def next(s, x):
        tot = 0
        for u in (s.mod or s.lines): tot = w32(tot + u.next(x))
        for sec in s.out: tot = sec.next(tot)
        return tot
    def describe(s):
        return [dict(D=dl.D, ms=round(dl.D / 44.1, 2), kind=k, a=dl.a, a_file=a, gain=dl.g,
                     lp=(dl.flt.a1, dl.flt.b0, dl.flt.b1) if dl.flt else None)
                for dl, k, a in zip(s.lines, s.kinds, s.A)]

# ---------------------------------------------------------------- general ramp (0x18003d490 set, 0x18003d3f0 next)
def cvtt(x):
    """float -> int32 as the x86 truncating conversion does it: NaN, infinities and out-of-range give -2^31"""
    x = float(x)
    if x != x or x in (float("inf"), float("-inf")) or not (-2147483649.0 < x < 2147483648.0):
        return -0x80000000
    return int(x)

class LinRamp:
    """value runs from start toward target in 12.20 fixed-point steps of |target-start|/n per call (n = trunc(seconds*44100)).
    As read: the offset must stay strictly below |target-start|, so the target itself is never returned; the call that
    would reach it returns the previous value again and marks the ramp done."""
    def __init__(s, seconds, start, target, by_one=False):
        diff = w32(target - start)
        s.start, s.target, s.absd, s.dir = start, target, abs(diff), (-1 if diff < 0 else 1)
        n = cvtt(f32(seconds) * f32(44100.0))
        with np.errstate(divide="ignore", invalid="ignore"):
            step = np.abs(f32(diff)) / f32(n)
            i = cvtt(step)
            if i > 0xFFF: step = f32(step - f32(i)) + f32(4095.0)
            s.step = cvtt(f32(step) * f32(1048576.0))
        s.acc = 0; s.pos = 0; s.hit = False; s.done = False; s.cur = start; s.by_one = by_one
    def next(s):
        if s.done: return s.cur
        r = s.pos
        if not s.hit:
            acc = w32(s.acc + s.step)
            npos = w32((acc >> 20) + s.pos)
            s.acc = acc & 0xFFFFF; s.pos = npos
            if s.step != 0 and 0 <= npos < s.absd: r = npos
            else: s.hit = True
        if s.hit: s.done = True
        v = s.start + r if s.dir > 0 else s.start - r
        if not s.by_one:
            s.cur = v; return v
        if abs(w32(v - s.cur)) >= 1: s.cur = w32(s.cur + s.dir)
        return s.cur

def clamp_params(p, table):
    """per-type range clamp (0x18003c030): a value of exactly 0 is never clamped"""
    out = []
    for v, (lo, hi) in zip(p, table):
        v = f32(v)
        if v != 0 and (v > f32(hi) or not (v >= f32(lo))): v = min(max(v, f32(lo)), f32(hi))
        out.append(v)
    return out + [f32(v) for v in p[len(table):]]

# ---------------------------------------------------------------- amplifier (AMP)  build 0x1800336d0, sample 0x180033250
AMP_TABLE = [(0, 1000), (0, 1), (0, 1), (0, 1), (0, 200), (0, 1), (0.01, 100), (0, 1)]
class Amp:
    """p0 gain, p1 vthresh, p2 distmix, p3 vfeed (stored, never used), p4 modrate, p5 moddepth, p6 modglide ms, p7 rand"""
    def __init__(s, p, randint=None):
        p = clamp_params((list(p) + [0] * 8)[:8], AMP_TABLE)
        gain, vth, dmix, vfeed, rate, depth, glide, rnd = p
        s.randint = randint or random.Random(1).randint
        if rate > 0:
            s.glide = glide * f32(0.001)
            s.depth = tr(depth * f32(4096.0))
            per = f32(1.0 / max(float(rate), 0.01))
        else:
            s.glide = f32(0.0); s.depth = 0; per = f32(0.0)
        s.period = s.cnt = tr(per * f32(44100.0))
        s.vth = tr(vth * f32(32767.0))
        s.g0 = s.g = tr(gain * f32(4096.0))
        s.dmix = tr(dmix * f32(4096.0)); s.vfeed = tr(vfeed * f32(4096.0))
        s.rand = bool(rnd > 0); s.ramping = False; s.ramp = None
        s.targets = []                   # (sample index, start, target) of every glide begun: for inspection only
        s.n = 0
    def next(s, x):
        if s.vth < 0x1000 and s.dmix != 0:               # note: threshold (x32767) is tested against 4096
            c = s.vth if x > s.vth else max(x, -s.vth)
            x = c if s.dmix >= 0x1000 else w32(x + (w32(w32(c - x) * s.dmix) >> 12))
        g = s.g
        out = w32(g * x) >> 12
        n = s.n; s.n += 1
        if s.ramping:
            g = s.g = s.ramp.next()
            if s.ramp.done: s.ramping = False
        elif s.period == 0:
            return out
        if s.period != 0:
            c = s.cnt; s.cnt = c - 1
            if c == 0:
                s.cnt = s.period
                lo = w32(s.g0 - (w32(s.g0 * s.depth) >> 12))
                if s.rand: tgt = s.randint(min(lo, s.g0), max(lo, s.g0))
                else: tgt = s.g0 if g == lo else lo
                s.ramp = LinRamp(s.glide, s.g, tgt); s.ramping = True
                s.targets.append((n, s.g, tgt))
        return out

# ---------------------------------------------------------------- modulating delay (MDY)  build 0x18003bf70/0x18003b8d0, sample 0x18003ba80
MDY_TABLE = [(0, 6), (0, 1000), (0, 0.99), (0, 1), (0, 2), (10, 22050), (100, 11025), (0, 3), (0.01, 200), (0, 1), (0.01, 100), (0, 1)]
class Mdy:
    """p0 dtype, p1 delay ms, p2 feedback, p3 gain, p4 ftype, p5 cutoff, p6 qwidth, p7 quality (the delay is built from
    these exactly as a DLY, with no DLY clamp), p8 modrate Hz, p9 moddepth, p10 modglide ms, p11 mix"""
    def __init__(s, p, randint=None):
        p = clamp_params((list(p) + [0] * 12)[:12], MDY_TABLE)
        s.randint = randint or random.Random(1).randint
        s.glide = p[10] * f32(0.001)
        per = f32(1.0) / p[8] if p[8] != 0 else f32(0.0)
        s.d = DlyProc([float(v) for v in p[:11]]).d
        s.period = s.cnt = tr(per * f32(44100.0))
        s.depth = p[9]; s.mix = tr(p[11] * f32(4096.0))
        s.fading = False; s.ramp = None; s.invert = False
        s.draws = []; s.n = 0            # (sample index, new tap): for inspection only
    def set_tap(s, new):                 # 0x18003b980
        d = s.d
        s.fading = True; s.ramp = LinRamp(s.glide, 0, 0x1000)
        d.tapnew = min(new, d.maxd); d.xf = 0
    def modulate(s, v):                  # 0x18003bf10: the hook the MOD configurations drive (not used by LINEAR presets)
        v = f32(v); s.invert = bool(v < f32(-2.0))
        if s.invert: v = v + f32(10.0)
        s.set_tap(tr((v + f32(1.0)) * f32(-0.5) * f32(s.d.maxd)) + s.d.maxd)
    def next(s, x):
        d = s.d; n = s.n; s.n += 1
        if not s.fading:
            y = d.next(x)
        else:
            y = d.next(x, fading=True)
            d.xf = s.ramp.next()
            if s.ramp.done:
                d.tap = d.tapnew; s.fading = False
        if s.period != 0:
            c = s.cnt; s.cnt = c - 1
            if c == 0:
                s.cnt = s.period
                new = s.randint(tr((f32(1.0) - s.depth) * f32(d.maxd)), d.maxd)
                s.set_tap(new); s.draws.append((n, d.tapnew))
        if s.invert: y = w32(-y)
        if s.mix == 0x1000: return y
        if s.mix == 0x800: return w32(y + x) >> 1
        return w32((w32(w32(y - x) * s.mix) >> 12) + x)

class Null:
    def __init__(s, p): pass
    def next(s, x): return x

PROC = {0: Null, 1: DlyProc, 2: Rva, 3: Flt, 9: Mdy, 10: Dfr, 11: Amp}

# ---------------------------------------------------------------- preset file
NAMES = dict(NULL=0, DLY=1, RVA=2, FLT=3, CRS=4, PTC=5, ENV=6, LFO=7, EFO=8, MDY=9, DFR=10, AMP=11,
             LP=0, HP=1, BP=2, LO=0, MED=1, HI=2, VHI=3,
             PLAIN=0, ALLPASS=1, LOWPASS=2, DLINEAR=3, FLINEAR=4, LOWPASS_4TAP=5, PLAIN_4TAP=6,
             SIN=0, TRI=1, SQR=2, SAW=3, RND=4, LOG_IN=5, LOG_OUT=6, LIN_IN=7, LIN_OUT=8, LIN=0, EXP=1,
             SIMPLE=0, LINEAR=1, PARALLEL2=5, PARALLEL4=6, PARALLEL5=7, FEEDBACK=8, FEEDBACK3=9, FEEDBACK4=10,
             MOD=11, MOD2=12, MOD3=13)

def tokval(t):
    if t[0] in "0123456789+-":
        return float(f32(float(re.match(r"[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+)?", t).group(0) or 0)))
    return float(NAMES.get(t, 0))

class Preset:
    def __init__(s, num, cfg, hdr, procs):
        s.num, s.cfg, s.procs = num, cfg, procs      # procs: list of [type, [params...16]]
        s.mix_min, s.mix_max, s.duration, s.fade, s.db_min, s.db_mixdrop = hdr
    def copy(s):
        return Preset(s.num, s.cfg, (s.mix_min, s.mix_max, s.duration, s.fade, s.db_min, s.db_mixdrop),
                      [[t, list(p)] for t, p in s.procs])
    def header(s): return (s.mix_min, s.mix_max, s.db_min, s.db_mixdrop)

def load_presets(path):
    txt = open(path, encoding="latin1").read()
    txt = re.sub(r"//[^\n]*", "", txt)
    toks = re.findall(r"[{}]|[^\s{}]+", txt)
    out = {}; i = 0
    while i < len(toks):
        if toks[i] != "{": i += 1; continue
        num = int(tokval(toks[i + 1])); cfg = int(tokval(toks[i + 2]))
        hdr = [float(f32(tokval(t))) for t in toks[i + 3:i + 9]]
        i += 9; procs = []
        while toks[i] != "}":
            if toks[i] == "{":
                j = i + 1; vals = []
                while toks[j] != "}": vals.append(tokval(toks[j])); j += 1
                params = (vals[1:] + [0.0] * 16)[:16]
                procs.append([int(vals[0]), params]); i = j + 1
            else: i += 1
        i += 1
        if len(procs) == 1: cfg = 0
        out[num] = Preset(num, cfg, hdr, procs[:5])
    return out

class Instance:
    def __init__(s, preset, randint=None):
        if preset.cfg not in (0, 1): raise NotImplementedError("only SIMPLE and LINEAR are modelled")
        s.units = []
        for t, p in preset.procs:
            if t not in PROC: raise NotImplementedError("processor type %d not modelled" % t)
            s.units.append(PROC[t](p, randint) if t in (2, 9, 11) else PROC[t](p))
    def next(s, x):
        for u in s.units: x = u.next(x)
        return x
    def run(s, xs): return [s.next(x) for x in xs]

# ---------------------------------------------------------------- automatic room: classes and build
def classes(shape, W, L, H, refl, diffusion=0.0):
    wc = 1 if 72 < W <= 144 else 2 if 144 < W <= 288 else 3 if 288 < W <= 576 else 4 if W > 576 else 0
    lc = 1 if 144 < L <= 288 else 2 if 288 < L <= 576 else 3 if 576 < L <= 1152 else 4 if L > 1152 else 0
    hc = 1 if (H > 48 and H <= 128) else 2 if (H > 128 and H <= 216) else 3 if 216 < H <= 384 else 4 if H > 384 else 0
    R = f32(refl)
    rc = 1 if (float(R) > 0.04 and R <= f32(0.5)) else 2 if (R > f32(0.5) and float(R) <= 0.8) else 3 if float(R) > 0.8 else 0
    Df = float(f32(diffusion))
    dc = 1 if 0.01 < Df <= 0.1 else 2 if 0.1 < Df <= 0.3 else 3 if Df > 0.3 else 0
    if shape in (6, 10): sc = 1 if 120 < L <= 240 else 2 if 240 < L <= 480 else 3 if 480 < L <= 1200 else 4 if L > 1200 else 0
    elif shape in (4, 5): sc = wc
    else: sc = int((wc + lc) / 2)
    return dict(size=sc, width=wc, length=lc, height=hc, refl=rc, diffusion=dc)

def shape_of(sky, W, L, H, open_sides=0):
    if not sky:
        if H > 3.0 * L: L, H = H, L
        if L > 4.0 * W and W <= 48: return 1
        if L > 2.5 * W and 48 < W <= 96: return 2
        if L > 4.0 * W and W > 96: return 3
        return 0
    if open_sides: return 11 - open_sides
    if L <= 2.5 * W: return 6
    return 5 if W <= 144 else 4

SHAPE_BASE = {0: 102, 1: 106, 2: 110, 3: 114, 4: 118, 5: 122, 6: 126, 7: 130, 8: 130, 9: 118, 10: 126}

def build_auto(presets, sky, W, L, H, refl, open_sides=0, diffusion=0.0):
    shape = shape_of(sky, W, L, H, open_sides)
    c = classes(shape, W, L, H, refl, diffusion)
    base = SHAPE_BASE[shape] + (2 if c["diffusion"] > 1 else 0)
    A, B = presets[base], presets[base + 1]
    out = (B if c["size"] > 1 else A).copy()
    def find(ps, typ, n):
        k = 0
        for idx, (t, _) in enumerate(ps.procs):
            if t == typ:
                if k == n: return idx
                k += 1
        return -1
    def lerp(typ, n, ip, cls, cmax=5, sq=False, a=A, b=B):
        io, ia, ib = find(out, typ, n), find(a, typ, n), find(b, typ, n)
        if io < 0 or ia < 0 or ib < 0: return
        fr = f32(cls) / f32(cmax)
        va, vb = f32(a.procs[ia][1][ip]), f32(b.procs[ib][1][ip])
        dlt = (vb - va) * fr
        if sq: dlt = dlt * fr
        out.procs[io][1][ip] = float(va + dlt)
    def meas(typ, n, ip, cls, value, sq=True):
        io, ia, ib = find(out, typ, n), find(A, typ, n), find(B, typ, n)
        if io < 0 or ia < 0 or ib < 0: return
        if f32(A.procs[ia][1][ip]) < 0 or f32(B.procs[ib][1][ip]) < 0: out.procs[io][1][ip] = float(f32(value))
        else: lerp(typ, n, ip, cls, sq=sq)
    cl = lambda v, lo: float(f32(min(max(v, lo), 500.0)))
    for n in (0, 1):
        for ip in range(4): lerp(10, n, ip, c["size"])
        lerp(2, n, 3, c["size"]); lerp(2, n, 1, c["size"], sq=True); lerp(2, n, 0, c["size"], sq=True)
        lerp(2, n, 4, c["size"]); lerp(2, n, 2, c["size"]); lerp(2, n, 7, c["size"]); lerp(2, n, 8, c["size"])
        meas(2, n, 9, c["width"], cl(float(f32(W)) * (1 / 12), 6.0))
        meas(2, n, 10, c["length"], cl(float(f32(L)) * (1 / 12), 6.0))
        meas(2, n, 11, c["height"], cl(float(f32(H)) * (1 / 12), 6.0))
        lerp(2, n, 12, c["width"]); lerp(2, n, 13, c["length"]); lerp(2, n, 14, c["height"])
        lerp(2, n, 5, c["refl"], cmax=4, a=B, b=A)
        l2 = cl(L * (1 / 6), 14.0); w2 = cl(W * (1 / 6), 14.0)
        meas(1, n, 1, c["length"], l2); lerp(1, n, 2, c["length"]); lerp(1, n, 3, c["length"])
        meas(1, n, 8, c["length"], w2); meas(1, n, 9, c["length"], l2); meas(1, n, 10, c["length"], l2)
        lerp(1, n, 5, c["length"], a=B, b=A); lerp(1, n, 6, c["length"], a=B, b=A)
        for ip in range(5): lerp(3, n, ip, c["size"])
    return out, shape, c, base

# ---------------------------------------------------------------- the voice's shares
def voice_shares(header, dist=12, level_db=60, dist_min=0.0, dist_max=1440.0, g=1.0):
    mn, mx, db_min, drop = [f32(v) for v in header]
    if level_db <= int(db_min): mn = mn * drop; mx = mx * drop
    d = min(max(f32(dist), f32(dist_min)), f32(dist_max))
    mix = (d - f32(dist_min)) / (f32(dist_max) - f32(dist_min)) * (mx - mn) + mn
    M = mix * f32(256.0)
    room = min(tr(M * f32(g)), 256)
    if f32(g) < 1: M = M * f32(g)
    dry = tr(f32(256.0) - M)
    return room, dry, float(mix)

# ---------------------------------------------------------------- measurements on a response
def analyse(y, direct, gap=8):
    """bursts: runs of non-zero output separated by >= gap zero samples; returns the first ten as
    (onset sample, sample of the largest magnitude, its signed value), plus decay and level figures"""
    bursts = []; i = 0; n = len(y)
    while i < n and len(bursts) < 10:
        if y[i] == 0: i += 1; continue
        j = i; last = i
        while j < n and j - last <= gap:
            if y[j] != 0: last = j
            j += 1
        seg = y[i:last + 1]; k = max(range(len(seg)), key=lambda t: abs(seg[t]))
        bursts.append((i, i + k, seg[k])); i = last + 1
    e = np.array(y, dtype=np.float64) ** 2
    tot = e.sum(); back = np.cumsum(e[::-1])[::-1]
    t60s = next((t for t in range(n) if back[t] <= tot * 1e-6), None)       # Schroeder curve at -60 dB
    pk = max(abs(v) for v in y)
    last60 = max((t for t in range(n) if abs(y[t]) * 1000 >= pk), default=None)   # last sample within 60 dB of the peak
    lastnz = max((t for t in range(n) if y[t] != 0), default=None)
    lev = 10 * math.log10(tot / direct ** 2) if tot else -math.inf
    tail = 10 * math.log10(e[1:].sum() / direct ** 2) if e[1:].sum() else -math.inf
    return dict(bursts=bursts, t60_schroeder=t60s, last_within_60dB=last60, last_nonzero=lastnz, peak=pk,
                level_db=lev, tail_db=tail, y0=y[0])

def peaks(y, n=10, win=22, floor=0.01):
    """first n local maxima of |y| (largest within +-win samples, at least floor*max|y|)"""
    pk = max(abs(v) for v in y); out = []
    for t in range(len(y)):
        v = abs(y[t])
        if v < floor * pk or v == 0: continue
        lo = max(0, t - win); seg = y[lo:t + win + 1]
        if v == max(abs(u) for u in seg) and all(abs(u) < v for u in y[lo:t]):
            out.append((t, y[t]))
            if len(out) == n: break
    return out


def decay(preset, impulse=100000, seconds=8.0, win=441):
    """decay figures with a large impulse (keeps the integer floor out of the way; 100000 stays clear of 32-bit wrap):
    env60 = start (ms) of the first 10 ms window from which the peak envelope stays under 1/1000 of the largest sample;
    t60fit = 60 dB decay time (ms) from a straight-line fit of the backward-integrated energy between -5 and -35 dB"""
    y = respond(preset, seconds, impulse)["y"]
    e = [max(abs(v) for v in y[i:i + win]) for i in range(0, len(y), win)]
    pk = max(e)
    i60 = next((i for i in range(len(e)) if all(v * 1000 < pk for v in e[i:])), None)
    stop = len(y) if i60 is None else i60 * win           # integrate only up to the -60 dB point (leaves the resting offset out)
    en = np.array(y[:stop], dtype=np.float64) ** 2
    back = np.cumsum(en[::-1])[::-1]; db = 10 * np.log10(np.maximum(back, 1e-30) / back[0])
    i5 = int(np.argmax(db <= -5)); i35 = int(np.argmax(db <= -35))
    t60fit = None
    if i35 > i5:
        slope = np.polyfit(np.arange(i5, i35), db[i5:i35], 1)[0]
        t60fit = round(float(-60.0 / slope / SR * 1000), 1)
    return dict(env60_ms=None if i60 is None else i60 * win * 1000 / SR, t60fit_ms=t60fit,
                rest=sorted(set(y[-2000:])))

def respond(preset, seconds=6.0, impulse=None, dist=12):
    room, dry, mix = voice_shares(preset.header(), dist)
    x0 = 64 * room if impulse is None else impulse       # 16384 * room / 256
    inst = Instance(preset)
    n = int(seconds * SR)
    y = inst.run([x0] + [0] * (n - 1))
    return dict(room=room, dry=dry, mix=mix, x0=x0, direct=64 * dry, inst=inst, y=y)

if __name__ == "__main__":
    P = load_presets(sys.argv[1])
    cases = [("preset 6", P[6])]
    b, sh, c, base = build_auto(P, False, 120, 140, 100, 0.3)
    cases.append(("auto small room W120 L140 H100 refl0.3 (base %d, classes %s)" % (base, c), b))
    b, sh, c, base = build_auto(P, False, 200, 1000, 150, 0.3)
    cases.append(("auto tunnel W200 L1000 H150 refl0.3 (base %d, classes %s)" % (base, c), b))
    cases.append(("source preset 102 as written", P[102])); cases.append(("source preset 114 as written", P[114]))
    print("shares by header (min,max,dbmin,drop) -> (room,dry) at distance 12 | 11:")
    seen = {}
    for n in sorted(P):
        seen.setdefault(P[n].header(), []).append(n)
    for h, ns in seen.items():
        print("  ", tuple(round(v, 3) for v in h), voice_shares(h, 12)[:2], voice_shares(h, 11)[:2], "presets", ns[:6], "..." if len(ns) > 6 else "")
    for name, ps in cases:
        r = respond(ps)
        print("==", name); print("  header", ps.header(), "procs", [(t, [round(v, 5) for v in p]) for t, p in ps.procs])
        for u in r["inst"].units:
            if isinstance(u, Rva):
                for dsc in u.describe(): print("   line", dsc)
            if isinstance(u, Dfr): print("   dfr", [(d.D, d.a, d.g) for d in u.st])
        a = analyse(r["y"], r["direct"])
        print("  shares room %d dry %d (mix %.5f); impulse into room %d; direct %d" % (r["room"], r["dry"], r["mix"], r["x0"], r["direct"]))
        print("  y[0]", a["y0"], " bursts (onset, peak sample, value):", a["bursts"])
        print("  peaks", peaks(r["y"]))
        print("  t60 schroeder %s smp  last within 60 dB of peak %s smp  last nonzero %s  level %.2f dB  tail-only %.2f dB"
              % (a["t60_schroeder"], a["last_within_60dB"], a["last_nonzero"], a["level_db"], a["tail_db"]))
        print("  decay with impulse 100000:", decay(ps))
