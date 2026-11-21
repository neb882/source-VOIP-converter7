"""The Windows resampler core (resampledmo.dll / the copy inside AudioEng.dll), rebuilt from a private reading.

Nothing here is copied from the files: the rule and the constants are as read (addresses in README.md), the two
lookup tables the code stores are recomputed from their closed forms (check_tables.py shows they agree to float
rounding).  design() makes the polyphase table for a pair of rates and a quality; convert() runs it.
"""
import math
import numpy as np

F32 = np.float32


def default_lowpass(q):
    """Cutoff as a fraction of the lower Nyquist when the caller passes 0 (design routine, 0x1800053e8)."""
    if q >= 100:
        return 0.99
    if q <= 2:
        return float(np.frombuffer(np.uint32(0x3F592A30).tobytes(), dtype='<f4')[0])   # 0.8483
    y = float(F32(math.log(F32(q))))
    return float(F32(0.067308 * y - 0.00579496 * y * y + 0.804446))


def kaiser_beta(q):
    """Attenuation and beta chosen for the quality (only the q < 20 evaluator uses beta; q >= 20 uses beta 10)."""
    if q >= 30:
        a = 100.0
    else:
        a = float(F32(F32(2 * q + 1) * F32(2.285)) * F32(F32(30 - q) * F32(0.022) + F32(0.66)) + F32(8.0))
    if a > 50:
        return a, float(F32((a - 8.7) * 0.1102))
    if a >= 21:
        return a, float(F32(0.5842 * (a - 21) ** 0.4 + 0.07886 * (a - 21)))
    return a, 0.0


def _i0(x):
    # the code's series: sum (x^2/4)^k / (k!)^2, stopped when a term falls under 1e-8 (at most 21 more terms)
    s, t, k, q = 1.0, x * x / 4, 1, x * x / 4
    while True:
        s += t
        if k >= 21:
            break
        k += 1
        t *= q / (k * k)
        if t < 1e-8:
            break
    return s


_SINC_N, _WIN_N = 16384, 1024
_k = np.arange(_SINC_N + 1) * 35.0 / _SINC_N
_SINC = np.where(_k == 0, 1.0, np.sin(np.pi * _k) / (np.pi * np.where(_k == 0, 1, _k))).astype(F32)
_t = np.arange(_WIN_N + 1) / _WIN_N
_WIN = (np.i0(10.0 * np.sqrt(np.maximum(0, 1 - _t * _t))) / np.i0(10.0)).astype(F32)


def _lookup(table, pos, frac_bits):
    """Linear interpolation in a stored table as the q >= 20 evaluator does it, in float32."""
    idx = int(pos)
    hi, lo = idx >> frac_bits, idx & ((1 << frac_bits) - 1)
    slope = F32((float(table[hi + 1]) - float(table[hi])) / (1 << frac_bits))
    return F32(F32(lo) * slope + table[hi])


def kernel(x, q, beta, exact=False):
    """Windowed sinc at x zero-crossings from the centre; window spans +-q."""
    w = x / q
    if q >= 20 and not exact:
        if -35.0 < x < 35.0:
            xf = abs(float(F32(x)))
            if xf >= 35.0:
                s = F32(0)
            else:
                s = _lookup(_SINC, F32(F32(xf) * F32(2 ** 30 / 35.0)), 16)
            wf = abs(float(F32(w)))
            win = _lookup(_WIN, F32(F32(wf) * F32(2.0 ** 30)), 20) if wf < 1.0 else F32(0)
            return F32(win * s)
        s = 1.0 if abs(x) < 1e-7 else math.sin(math.pi * x) / (math.pi * x)
        wf = abs(float(F32(w)))
        win = _lookup(_WIN, F32(F32(wf) * F32(2.0 ** 30)), 20) if wf < 1.0 else F32(0)
        return F32(float(win) * s)
    s = 1.0 if abs(x) < 1e-7 else math.sin(math.pi * x) / (math.pi * x)
    if exact and q >= 20:
        beta = 10.0
    win = _i0(beta * math.sqrt(1 - w * w)) / _i0(beta) if -1.0 <= w <= 1.0 else 0.0
    return F32(win * s)


def design(in_rate, out_rate, q=30, lowpass=0.0, exact=False):
    """Polyphase table as the design routine builds it.  Returns a dict: taps[L][T] (row p, tap order j = -H..),
    L phases, M input step, H half length in input samples, T taps per phase, c cutoff fraction."""
    g = math.gcd(int(in_rate), int(out_rate))
    M, L = int(in_rate) // g, int(out_rate) // g
    if lowpass == 0.0:
        lowpass = float(F32(min(F32(in_rate) / F32(out_rate), F32(1.0)) * F32(default_lowpass(q))))
    a, beta = kaiser_beta(q)
    half = q * (float(F32(in_rate)) / float(F32(out_rate))) if in_rate > out_rate else float(q)
    c = float(F32(max(out_rate, in_rate)) / max(F32(F32(in_rate) / F32(lowpass)), F32(out_rate)))
    half = half / c
    H = math.ceil(half)
    T = 4 * ((2 * H + 4) // 4)
    if (H + 1) * L >= 100000 or max(L, M) > 0x500:
        raise ValueError('this pair of rates takes the unrated path (computed per sample), not built here')
    step = c / max(L, M)
    taps = np.zeros((L, T), dtype=F32)
    for p in range(L):
        for i, j in enumerate(range(-H, T - H)):
            n = L * j + p
            taps[p, i] = kernel(abs(n) * step if n < 0 else n * step, q, beta, exact)
    # the code mirrors the n < 0 side from the n > 0 side; the kernel is even, so abs() above is the same thing
    # one float32 running sum over the table in storage order (reversed within a row)
    total = F32(0)
    for p in range(L):
        for v in taps[p, ::-1]:
            total = F32(total + v)
    scale = F32(F32(L) / total) if total != 0 else F32(L)
    taps = (taps * scale).astype(F32)
    return dict(taps=taps, L=L, M=M, H=H, T=T, c=c, q=q, beta=10.0 if q >= 20 else beta, atten=a, lowpass=lowpass)


def response(d, freqs, in_rate):
    """Magnitude (dB) of the conversion at input frequencies `freqs` (Hz): the prototype filter L*h[n] at rate
    in_rate*L, which is what a tone below the output Nyquist sees (images aside)."""
    L, T, H = d['L'], d['T'], d['H']
    taps = d['taps'].astype(np.float64)
    out = []
    for f in np.atleast_1d(freqs):
        acc = 0j
        for p in range(L):
            j = np.arange(-H, T - H)
            # tap (p, j) multiplies x[i - j] for the output at input time i + p/L: its kernel time is j + p/L
            t = (j + p / L) / in_rate
            acc += np.sum(taps[p] * np.exp(-2j * np.pi * f * t))
        out.append(20 * np.log10(abs(acc) / L + 1e-300))
    return np.array(out)


def convert(x, in_rate, out_rate, q=30, lowpass=0.0, d=None):
    """Mono float conversion: y[k] = sum_j taps[p_k][j] * x[i_k + j], zeros before the stream's start.
    Output k sits at input time k*M/L.  (Timing at the stream's start: see README, 'delay'.)"""
    d = d or design(in_rate, out_rate, q, lowpass)
    L, M, H, T = d['L'], d['M'], d['H'], d['T']
    x = np.asarray(x, dtype=F32)
    n_out = (len(x) * L) // M
    xp = np.concatenate([np.zeros(T, F32), x, np.zeros(2 * T, F32)])
    y = np.zeros(n_out, dtype=F32)
    taps = d['taps']
    for k in range(n_out):
        pos = k * M
        i, p = pos // L, pos % L
        # the fine-grid index of tap j is L*j + p measured from the output instant: sample i - j ... the table's
        # row p holds the kernel at (L*j + p), which weighs the input sample j places *before* instant i + p/L
        seg = xp[T + i - (T - H - 1): T + i + H + 1][::-1]
        y[k] = np.dot(taps[p].astype(np.float64), seg.astype(np.float64))
    return y
