#!/usr/bin/env python3
"""Reference outputs of the room model (dspmodel.py, with AMP and MDY) on the app's public table.

  python3 -I reference.py room-presets.json            hashes: one line per case
  python3 -I reference.py room-presets.json --tails    where each tail ends (slow; uses every core)

Needs numpy. Nothing here reads the game's file.

Inputs (16-bit voice samples), all from mulberry32 as in audio.js:
  noise    22050 samples, s = floor(u*65536) - 32768, u from mulberry32(1); then zeros
  speech   88200 samples: ph = k mod 17640; 0 if ph >= 8820 (no draw), else trunc(n * min(ph, 8820-ph) / 4410),
           n drawn as the noise but from mulberry32(3); then zeros
  quiet    the noise, each sample trunc(s / 64); then zeros            (tails)
  square   44100 samples: 32767 if (k mod 441) < 220 else -32767; then zeros   (tails)
  long     the square for 220500 samples; then zeros                    (tails of the four longest rooms)
The path: direct = entry(s, direct share), room input = entry(s, room share);
  out = direct + preset(room input); under water: out = water(out), water = preset 14, started 44100 samples
  of silence before the first sample (its outputs dropped).  entry(s, share) = trunc(single(s * 255*share/256) / 256).
A preset starts from silence.  Random taps: RandomInt(lo, hi) = lo + floor(u * (hi - lo + 1)); the room preset's
draws from mulberry32(2), the water preset's from mulberry32(5), each in the order its processors ask.
Hash cases: "room" = SHA-256 of the preset's own outputs for the room input alone (88200 for noise, 132300 for
speech), 32-bit little-endian; "path" = the same over out.
Tail: the number of zero-voice samples after the input at which the last 22050 values of out, all made with no voice,
first lie within BAND of each other (max - min <= BAND); CAP if that has not happened by then.
"""
import sys, json, hashlib, struct, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import dspmodel as M
f32 = np.float32
BAND, WINDOW, CAP = 32, 22050, 882000
def mulberry32(seed):
    a = [seed & 0xFFFFFFFF]
    def imul(x, y): return (x * y) & 0xFFFFFFFF
    def draw():
        a[0] = (a[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = imul(a[0] ^ (a[0] >> 15), 1 | a[0])
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF) ^ t
        return (t ^ (t >> 14)) / 4294967296
    return draw
def randint_from(seed):
    u = mulberry32(seed)
    return lambda lo, hi: lo + int(u() * (hi - lo + 1))
def entry(s, share):
    return int(f32(s) * (f32(255.0) * f32(share) * f32(1.0 / 256.0)) * f32(1.0 / 256.0))
def load(path):
    T = json.load(open(path)); P = {}
    for n, e in T.items():
        P[int(n)] = M.Preset(int(n), 1 if len(e['p']) > 1 else 0, [float(f32(v)) for v in e['h']],
                             [[t, [float(f32(v)) for v in p]] for t, p in e['p']])
    return P
def noise():
    n = mulberry32(1); return [int(n() * 65536) - 32768 for _ in range(22050)]
def speech():
    n = mulberry32(3); out = []
    for k in range(88200):
        ph = k % 17640
        out.append(0 if ph >= 8820 else int((int(n() * 65536) - 32768) * min(ph, 8820 - ph) / 4410))
    return out
def quiet(): return [int(s / 64) for s in noise()]
def square(n=44100): return [32767 if (k % 441) < 220 else -32767 for k in range(n)]
def long_square(): return square(220500)
LONG = ['preset 22', 'preset 103', 'preset 115', 'auto great_hall']
CASES = [  # key, sky, width, length, height, reflectivity, open sides
 ('closet', 0, 120, 140, 100, 0.3, 0), ('small_room', 0, 200, 260, 120, 0.4, 0), ('room', 0, 300, 400, 160, 0.4, 0),
 ('large_room', 0, 500, 700, 220, 0.4, 0), ('great_hall', 0, 700, 1300, 400, 0.4, 0), ('vent', 0, 48, 400, 64, 0.4, 0),
 ('corridor', 0, 80, 400, 120, 0.4, 0), ('long_corridor', 0, 90, 1200, 120, 0.4, 0), ('tunnel', 0, 200, 1000, 150, 0.3, 0),
 ('big_tunnel', 0, 280, 1400, 250, 0.4, 0), ('alley', 1, 120, 600, 4800, 0.4, 0), ('street', 1, 300, 1300, 4800, 0.4, 0),
 ('courtyard', 1, 500, 700, 4800, 0.4, 0), ('open', 1, 2, 2, 4800, 0.08, 4)]
HDR = [0.2, 0.7, 0.0, 0.0, 80.0, 0.5]
def z(*v): return list(v) + [0.0] * (16 - len(v))
SYNTH = collections.OrderedDict([   # rules no preset of the table runs; each a one-preset chain under header HDR
 ('quality 2 in a delay',        [[1, z(2, 50, 0.5, 1, 0, 2000, 0, 2)]]),
 ('quality 0 in a delay',        [[1, z(2, 50, 0.5, 1, 0, 2000, 0, 0)]]),                 # the same hash as the line above
 ('cutoff 0, filter flag set',   [[2, z(60, 20, 3, 0.8, 1, 0, 1)]]),
 ('delay with gain 0',           [[1, z(0, 40, 0.5, 0)]]),
 ('3-D, factors 0 0 0',          [[2, z(0, 0, 6, 0.8, 2, 4000, 1, 0, 0, 10.7, 33.4, 20.9, 0, 0, 0)]]),
 ('3-D, negative factor, no filter', [[2, z(0, 0, 6, 0, 2, 0, 1, 0, 0, 8, 32, 10, 0.9, -0.9, 0.4)]]),
 ('3-D, negative factor, filter on the sum', [[2, z(0, 0, 6, 0, 2, 4000, 0, 0, 0, 8, 32, 10, 0.9, -0.9, 0.4)]]),
 ('diffusor of size 0.9',        [[10, z(0.9, 4, 0.15, 0)]]),
 ('amplifier that clips',        [[11, z(2, 0.05, 0.5, 0, 0, 0, 0, 0)]]),
 ('amplifier, threshold 0, mix 1', [[11, z(1, 0, 1, 0, 0, 0, 0, 0)]]),
 ('amplifier, random gain',      [[11, z(1, 0, 0, 0, 20, 0.5, 5, 1)]]),
 ('amplifier, glide 0',          [[11, z(1, 0, 0, 0, 10, 0.6, 0, 0)]]),
 ('modulating delay, mix 0.5',   [[9, z(0, 100, 0.4, 1, 0, 0, 0, 0, 8, 0.2, 10, 0.5)]]),
 ('modulating delay, mix 0.3, low-pass', [[9, z(2, 100, 0.4, 1, 0, 3000, 0, 0, 8, 0.2, 10, 0.3)]]),
 ('never settles (the cap)',     [[2, z(100, 100, 1, 1, 1, 0, 0)]]),
])
def synth(name): return M.Preset(900, 1, HDR, [[t, list(p)] for t, p in SYNTH[name]])
def template_case(P):
    """negative width and depth in a pair of templates: the measures take their place (the corridor's measures)"""
    Q = dict(P); a = P[110].copy(); b = P[111].copy()
    a.procs[0][1][9] = -1.0; b.procs[0][1][10] = -1.0; Q[110] = a; Q[111] = b
    return M.build_auto(Q, False, 80, 400, 120, 0.4, 0)[0]
def sha(y): return hashlib.sha256(b''.join(struct.pack('<i', M.w32(v)) for v in y)).hexdigest()
def shares(ps): return M.voice_shares(ps.header(), 12)[:2] if ps is not None else (0, 256)
class Path:
    def __init__(s, ps, water=None):
        s.room, s.dry = shares(ps)
        s.inst = M.Instance(ps, randint_from(2)) if ps is not None else None
        s.water = None
        if water is not None:
            s.water = M.Instance(water, randint_from(5))
            for _ in range(44100): s.water.next(0)
    def next(s, v):
        out = entry(v, s.dry)
        if s.inst is not None: out = M.w32(out + s.inst.next(entry(v, s.room)))
        if s.water is not None: out = s.water.next(out)
        return out
def room_hash(ps, voice, zeros):
    room, dry = shares(ps); inst = M.Instance(ps, randint_from(2))
    y = inst.run([entry(v, room) for v in voice] + [0] * zeros)
    return room, dry, sha(y)
def path_hash(ps, water, voice, zeros):
    p = Path(ps, water); return p.room, p.dry, sha([p.next(v) for v in voice + [0] * zeros])
def tail(ps, water, voice):
    p = Path(ps, water)
    for v in voice: p.next(v)
    hi = collections.deque(); lo = collections.deque(); n = 0
    while n < CAP:
        y = p.next(0); n += 1
        while hi and hi[-1][1] <= y: hi.pop()
        hi.append((n, y))
        while lo and lo[-1][1] >= y: lo.pop()
        lo.append((n, y))
        if hi[0][0] <= n - WINDOW: hi.popleft()
        if lo[0][0] <= n - WINDOW: lo.popleft()
        if n >= WINDOW and hi[0][1] - lo[0][1] <= BAND: return n, y
    return CAP, y
def all_cases(P):
    out = [('preset %d' % n, P[n]) for n in sorted(P) if n > 1]
    out += [('auto %s' % c[0], M.build_auto(P, bool(c[1]), *c[2:])[0]) for c in CASES]
    return out
def tail_job(args):
    name, water, kind = args
    P = load(PATH); cases = dict(all_cases(P)); cases['none'] = None
    cases.update({'synthetic: ' + k: synth(k) for k in SYNTH})
    n, y = tail(cases[name], P[14] if water else None, {'quiet': quiet, 'square': square, 'long': long_square}[kind]())
    return name, water, kind, n, y
PATH = None
if __name__ == '__main__':
    PATH = sys.argv[1]; P = load(PATH)
    if '--tails' in sys.argv:
        import multiprocessing as mp
        names = [n for n, _ in all_cases(P)]
        jobs = [(n, w, k) for n in names for w in (False, True) for k in ('quiet', 'square')]
        jobs += [(n, False, 'long') for n in LONG]
        jobs += [('none', True, 'quiet'), ('none', True, 'square'), ('synthetic: never settles (the cap)', False, 'square')]
        res = {}
        with mp.Pool() as pool:
            for name, water, kind, n, y in pool.imap_unordered(tail_job, jobs, chunksize=1):
                res[(name, water, kind)] = (n, y)
                print('# %s %s %s %d' % (name, water, kind, n), file=sys.stderr); sys.stderr.flush()
        print('tail: band %d over %d samples, cap %d' % (BAND, WINDOW, CAP))
        print('%-22s %8s %8s %8s %8s' % ('case', 'quiet', 'square', 'q water', 's water'))
        for name in names:
            print('%-22s %8d %8d %8d %8d' % (name, res[(name, False, 'quiet')][0], res[(name, False, 'square')][0],
                                           res[(name, True, 'quiet')][0], res[(name, True, 'square')][0]))
        print('%-22s %8s %8s %8d %8d' % ('no room', '-', '-', res[('none', True, 'quiet')][0], res[('none', True, 'square')][0]))
        for n in LONG: print('%-22s %8s %8d   (after the long square)' % (n, '-', res[(n, False, 'long')][0]))
        print('%-22s %8s %8d' % ('synthetic: the cap', '-', res[('synthetic: never settles (the cap)', False, 'square')][0]))
        sys.exit(0)
    nz = noise()
    for name, ps in all_cases(P):
        r = room_hash(ps, nz, 66150); print('%-20s %-7s %s' % (name, '%d/%d' % r[:2], r[2])); sys.stdout.flush()
    sp = speech()
    for n in (6, 14, 17, 21, 25, 103):
        r = room_hash(P[n], sp, 44100); print('%-20s %-7s %s' % ('speech preset %d' % n, '%d/%d' % r[:2], r[2])); sys.stdout.flush()
    for name in SYNTH:
        r = room_hash(synth(name), nz, 66150); print('synthetic: %-40s %-7s %s' % (name, '%d/%d' % r[:2], r[2])); sys.stdout.flush()
    t = template_case(P); r = room_hash(t, nz, 66150)
    print('synthetic: %-40s %-7s %s' % ('negative width and depth in templates', '%d/%d' % r[:2], r[2]))
    print('   built: ' + ' '.join(np.format_float_positional(f32(v), unique=True, trim='-') for v in t.procs[0][1]))
    tun = dict(all_cases(P))['auto tunnel']
    for name, ps in (('under water, no room', None), ('under water, preset 6', P[6]), ('under water, tunnel', tun), ('path, preset 6', P[6]), ('path, tunnel', tun)):
        r = path_hash(ps, P[14] if name.startswith('under') else None, nz, 66150)
        print('%-22s %-7s %s' % (name, '%d/%d' % r[:2], r[2])); sys.stdout.flush()
