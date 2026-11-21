#!/usr/bin/env python3
"""Writes vectors.json: the two reference converters (winsrc.py, the first reader's; src2.py, the second
reader's) run at quality 30 to 24000 Hz on a seeded input, for the Node suite to hold the app's port to.

  python3 -I tests/capture-converter/make_vectors.py          writes tests/capture-converter/vectors.json
  python3 -I tests/capture-converter/make_vectors.py --check  compares with the file as it stands, writes nothing

Needs Python 3 with numpy. Not run by CI. Each case's output is cut to the app's own length for a finite
source, max(1, round(n * L / M)) samples, with zeros read after the source's end (each reference is given the
source followed by zeros and its output is cut). Floats are stored as base64 of little-endian float32.
"""
import base64, hashlib, json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import numpy as np
import winsrc, src2

OUT, Q, SEED = 24000, 30, 20261120
# (source rate, source samples). The two a device most often runs at carry the longer input.
CASES = [(48000, 1200), (44100, 1200), (96000, 400), (32000, 400), (22050, 400), (16000, 400), (11025, 400), (8000, 400)]
# A pair of rates both references refuse (L over 1280): the app's port builds its table by the same rule.
UNRATED = (44056, 400)


def mulberry32(seed):
    a = seed & 0xFFFFFFFF
    def imul(x, y):
        return (x * y) & 0xFFFFFFFF
    def nxt():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = imul(a ^ (a >> 15), 1 | a)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return nxt


def source(n, seed):
    """Whole 16-bit steps over 32768: noise at half scale, 40 samples at positive full scale from sample 100."""
    r = mulberry32(seed)
    x = np.array([(math.floor(r() * 32768) - 16384) / 32768 for _ in range(n)], dtype=np.float32)
    x[100:140] = 32767 / 32768
    return x


def app_length(n, rate):
    g = math.gcd(rate, OUT)
    return max(1, math.floor(n * (OUT // g) / (rate // g) + 0.5))


def b64(a):
    return base64.b64encode(np.asarray(a, dtype='<f4').tobytes()).decode('ascii')


def to16(y):
    return np.clip(np.rint(np.asarray(y, dtype=np.float32).astype(np.float64) * 32768), -32768, 32767).astype(np.int64)


def unrated_table(rate):
    """The table by the design rule for a pair the references refuse (L or M over 1280, or (H + 1) L of 100000
    or more), through the first reader's kernel(), normalised by a sum in double precision."""
    F32 = np.float32
    g = math.gcd(rate, OUT)
    M, L = rate // g, OUT // g
    lowpass = float(F32(min(F32(rate) / F32(OUT), F32(1.0)) * F32(winsrc.default_lowpass(Q))))
    half = Q * (float(F32(rate)) / float(F32(OUT))) if rate > OUT else float(Q)
    c = float(F32(max(OUT, rate)) / max(F32(F32(rate) / F32(lowpass)), F32(OUT)))
    H = math.ceil(half / c)
    T = 4 * ((2 * H + 4) // 4)
    step = c / max(L, M)
    taps = np.zeros((L, T), dtype=F32)
    for p in range(L):
        for i, j in enumerate(range(-H, T - H)):
            taps[p, i] = winsrc.kernel(abs(L * j + p) * step, Q, 10.0)
    # the sum in double precision: a single-precision running sum over this many entries drifts (0.001 dB at
    # L = 3000, 0.015 dB at L = 24000), and Windows's own table is never this large
    total = 0.0
    for p in range(L):
        for v in taps[p, ::-1]:
            total += float(v)
    taps = (taps * F32(L / total)).astype(F32)
    return dict(taps=taps, L=L, M=M, H=H, T=T, c=c, q=Q)


def build():
    cases = []
    for k, (rate, n) in enumerate(CASES + [UNRATED]):
        x = source(n, SEED + k)
        fed = np.concatenate([x, np.zeros(4096, np.float32)])
        length = app_length(n, rate)
        if (rate, n) == UNRATED:
            d1 = unrated_table(rate)
            first = np.asarray(winsrc.convert(fed, rate, OUT, Q, d=d1), dtype=np.float32)[:length]
            case = dict(rate=rate, samples=n, seed=SEED + k, L=d1['L'], M=d1['M'], H=d1['H'], T=d1['T'], cutoff=[d1['c']],
                        outputs=length, unrated=True, first=b64(first), first_sha256=hashlib.sha256(first.astype('<f4').tobytes()).hexdigest())
        else:
            d1, d2 = winsrc.design(rate, OUT, Q), src2.design(rate, OUT, Q)
            assert (d1['L'], d1['M'], d1['H'], d1['T']) == (d2['L'], d2['M'], d2['H'], d2['T'])
            first = np.asarray(winsrc.convert(fed, rate, OUT, Q, d=d1), dtype=np.float32)[:length]
            second = np.asarray(src2.convert(fed, rate, OUT, Q, d=d2), dtype=np.float32)[:length]
            assert len(first) == length and len(second) == length
            apart = float(np.abs(first.astype(np.float64) - second.astype(np.float64)).max())
            tapart = float(np.abs(d1['taps'].astype(np.float64) - d2['table'][:, ::-1].astype(np.float64)).max())
            case = dict(rate=rate, samples=n, seed=SEED + k, L=d1['L'], M=d1['M'], H=d1['H'], T=d1['T'], cutoff=[d1['c'], d2['c']],
                        outputs=length, references_apart=apart, tables_apart=tapart,
                        steps16_apart=int((to16(first) != to16(second)).sum()), first=b64(first), second=b64(second))
            if rate in (48000, 44100):
                # row 0 of each table in the order of the inputs it weighs, oldest first (the second reader's storage)
                case['row0'] = [b64(d1['taps'][0][::-1]), b64(d2['table'][0])]
                case['gain_db'] = {str(f): round(float(20 * np.log10(src2.response(d2, [f])[0])), 3)
                                   for f in (1000, 10000, 11000, 11250, 11450, 11750, 11950, 12050, 12500)}
        cases.append(case)
    return dict(
        about='Reference outputs of Windows\'s rate converter at quality 30 to 24000 Hz, as read twice (tests/REFERENCE_2026.md, '
              'finding 28): the two readers\' own converters on a seeded input. Made by make_vectors.py; not edited by hand.',
        source='mulberry32(seed): sample i is (floor(r() * 32768) - 16384) / 32768; samples 100 to 139 are 32767 / 32768',
        floats='base64 of little-endian float32', out_rate=OUT, quality=Q, cases=cases)


if __name__ == '__main__':
    path = os.path.join(HERE, 'vectors.json')
    text = json.dumps(build(), indent=1) + '\n'
    if '--check' in sys.argv:
        same = open(path).read() == text
        print('vectors.json is what this script writes' if same else 'vectors.json DIFFERS from what this script writes')
        sys.exit(0 if same else 1)
    open(path, 'w').write(text)
    print('wrote', path, len(text), 'bytes')
