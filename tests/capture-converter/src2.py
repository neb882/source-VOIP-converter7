#!/usr/bin/env python3
"""Second reader's own converter, written from the second reading of resampledmo.dll (design routine
0x1800053e8, evaluators 0x18000a3a0 / 0x180079e10, normalisation 0x1800060d4, worker from 0x180002690, reset
0x180004a60). Nothing is copied from the owner's files: the two evaluator tables are recomputed from closed forms
(tables.py shows the stored ones equal them to 3e-8).

  design(fin, fout, q)        -> dict(L, M, H, T, c, table[L][T] float32)
  convert(x, fin, fout, q)    -> float32 output; output n is centred on input instant n*M/L, zeros before the start
  response(d, freqs, fin)     -> gain (linear) of the designed filter at each frequency, device-rate side
"""
import math
import numpy as np

F32 = np.float32
_I0_TERMS = 22           # the series table holds 1/k^2 for k = 1..22; the loop stops below 1e-8


def _i0_series(x):
    # as read: t = x*x/4 ; sum = 1 ; term = t ; loop: sum += term ; term *= t/(k+1)^2 ; until term < 1e-8
    t = 0.25 * x * x
    s = 1.0
    term = t
    k = 1
    while True:
        s += term
        k += 1
        if k > _I0_TERMS:
            break
        term *= t / (k * k)
        if term < 1e-8:
            break
    return s


def cutoff_share(q):
    if q >= 100:
        return F32(0.99)
    if q <= 2:
        return F32(0.8483)
    ln = float(F32(math.log(float(F32(q)))))
    return F32(ln * 0.06730802 - 0.005794964 * ln * ln + 0.804445578)


def beta_of(q):
    if q >= 30:
        a = F32(100.0)
    else:
        a = F32(F32(F32(2 * q + 1) * F32(2.285)) * F32(F32(F32(F32(30.0) - F32(q)) * F32(0.022)) + F32(0.66))) + F32(8.0)
    a = float(a)
    if a > 50.0:
        return float(F32((a - 8.7) * 0.1102))
    if a >= 21.0:
        d = float(F32(a - 21.0))
        return float(F32(0.5842 * float(F32(d ** 0.4)) + 0.07886 * d))
    return 0.0


# --- evaluator for q >= 20: two fixed tables, linearly interpolated in single precision -------------------------
_SINC_STEPS, _SINC_SPAN, _SINC_SCALE = 16384, 35.0, F32(30678338.0)     # index = int(|x| * scale) >> 16
_WIN_STEPS, _WIN_SCALE = 1024, F32(1073741824.0)                         # index = int(|u| * 2^30) >> 20


def _kaiser(u, beta):
    return np.i0(beta * np.sqrt(np.clip(1.0 - u * u, 0.0, None))) / np.i0(beta)


_xs = np.arange(_SINC_STEPS + 1) * 65536.0 / float(_SINC_SCALE)
_sv = np.sinc(_xs).astype(F32)
_sv[_SINC_STEPS] = F32(0.0) if abs(np.sinc(35.0)) < 1e-12 else _sv[_SINC_STEPS]
_ss = ((_sv[1:].astype(np.float64) - _sv[:-1].astype(np.float64)) / 65536.0).astype(F32)
_us = np.arange(_WIN_STEPS + 1) / float(_WIN_STEPS)
_wv = _kaiser(_us, 10.0).astype(F32)
_ws = ((_wv[1:].astype(np.float64) - _wv[:-1].astype(np.float64)) / 2.0 ** 20).astype(F32)


def _eval_hi(x, inv_q):
    """x in zero crossings (double); returns float32 sinc(x) * window(x/q)."""
    u = F32(x * inv_q)
    w = F32(0.0)
    if F32(-1.0) < u < F32(1.0):
        fx = int(F32(abs(u)) * _WIN_SCALE)
        i, fr = (fx & 0x3ff00000) >> 20, fx & 0xfffff
        w = F32(F32(fr) * _ws[i]) + _wv[i]
    if -35.0 < x < 35.0:
        xf = F32(x)
        s = F32(0.0)
        if F32(-35.0) < xf < F32(35.0):
            fx = int(F32(abs(xf)) * _SINC_SCALE)
            i, fr = (fx & 0x3fff0000) >> 16, fx & 0xffff
            s = F32(F32(fr) * _ss[i]) + _sv[i]
        return F32(w * s)
    px = x * math.pi
    s = 1.0 if -1e-7 < x < 1e-7 else math.sin(px) / px
    return F32(float(w) * s)


def _eval_lo(x, inv_q, beta, inv_i0):
    u = x * inv_q
    px = x * math.pi
    s = 1.0 if -1e-7 < x < 1e-7 else math.sin(px) / px
    if u < -1.0 or u > 1.0:
        w = 0.0
    else:
        w = _i0_series(math.sqrt(1.0 - u * u) * beta)
    return F32(w * s * inv_i0)


def design(fin, fout, q, lowpass=0.0):
    g = math.gcd(int(fin), int(fout))
    L, M = int(fout) // g, int(fin) // g
    fi, fo = F32(fin), F32(fout)
    if lowpass == 0.0:
        lp = F32(min(F32(fi / fo), F32(1.0)) * cutoff_share(q))
    else:
        lp = F32(lowpass)
    beta = beta_of(q)
    inv_i0 = 1.0 / _i0_series(beta)
    inv_q = 1.0 / q if q else 1.0
    h0 = float(q) * (float(fi) / float(fo)) if fi > fo else float(q)
    c = float(F32(max(fi, fo) / max(F32(fi / lp), fo)))
    hp = h0 / c
    H = int(math.ceil(hp))
    T = 4 * ((2 * H + 4) // 4)
    use_table = ((H + 1) * L < 100000) and max(L, M) <= 1280
    if not use_table:
        raise NotImplementedError('the variable-rate path was not read')
    step = c / float(max(L, M))
    tab = np.zeros((L, T), dtype=F32)
    for p in range(L):
        for j in range(-H, T - H):
            xi = L * j + p
            if xi < 0 and xi >= -(H + 1) * L + 1:
                continue                                   # second pass mirrors these
            v = _eval_hi(xi * step, inv_q) if q >= 20 else _eval_lo(xi * step, inv_q, beta, inv_i0)
            tab[p, T - 1 - (j + H)] = v
    for p in range(L):
        for j in range(-H, T - H):
            xi = L * j + p
            if xi < 0 and xi >= -(H + 1) * L + 1:
                k, r = divmod(-xi, L)
                tab[p, T - 1 - (j + H)] = tab[r, T - 1 - (k + H)]
    # normalisation: one running single-precision sum over the whole table, then every entry times L/sum
    s = F32(0.0)
    for v in tab.reshape(-1):
        s = F32(s + v)
    if s != 0:
        tab = (tab * F32(F32(L) / s)).astype(F32)
    return dict(L=L, M=M, H=H, T=T, c=c, q=q, table=tab, fin=fin, fout=fout)


def convert(x, fin, fout, q, d=None, tail=True):
    """Output n uses inputs i-j, j = -H..T-H-1, i = floor(n*M/L): centred, zero history, and (tail=True) zeros
    after the end, so every instant of the input gets an output; the worker itself waits for H later samples."""
    d = d or design(fin, fout, q)
    L, M, H, T, tab = d['L'], d['M'], d['H'], d['T'], d['table']
    x = np.asarray(x, dtype=F32)
    n_out = ((len(x) - 1) * L) // M + 1 if tail else max(0, ((len(x) - 1 - H) * L) // M + 1)
    pad = np.concatenate([np.zeros(T, F32), x, np.zeros(T + H + 1, F32)])
    y = np.empty(n_out, dtype=F32)
    n = np.arange(n_out, dtype=np.int64)
    i = (n * M) // L
    p = (n * M) % L
    start = i + H - T + 1 + T                               # index into pad of the oldest sample
    for ph in range(L):
        sel = np.nonzero(p == ph)[0]
        if not len(sel):
            continue
        idx = start[sel][:, None] + np.arange(T)[None, :]
        y[sel] = (pad[idx] * tab[ph][None, :]).sum(axis=1, dtype=F32)
    return y


def response(d, freqs, fin=None):
    """Gain at each frequency (Hz at the device rate), from the polyphase table taken as one filter at fin*L."""
    L, M, H, T, tab = d['L'], d['M'], d['H'], d['T'], d['table'].astype(np.float64)
    fin = fin or d['fin']
    j = -H + (T - 1 - np.arange(T))                         # tap k of a phase is input offset j
    out = []
    for f in freqs:
        acc = 0j
        for ph in range(L):
            t = (L * j + ph) / (fin * L)                    # seconds from the output instant
            acc += np.sum(tab[ph] * np.exp(-2j * np.pi * f * t))
        out.append(abs(acc) / L)
    return np.array(out)


if __name__ == '__main__':
    for fin in (48000, 44100):
        for q in (5, 15, 30):
            d = design(fin, 24000, q)
            fr = [10000, 11000, 11250, 11450, 11750, 11950, 12050, 12500, 13000]
            g = 20 * np.log10(np.maximum(response(d, fr), 1e-12))
            print(fin, 'q', q, 'L', d['L'], 'M', d['M'], 'H', d['H'], 'T', d['T'], 'c %.5f' % d['c'], ' '.join('%d:%.2f' % (a, b) for a, b in zip(fr, g)))
