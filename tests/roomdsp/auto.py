#!/usr/bin/env python3
"""The model's automatic rooms, for the app's checks of the build from two templates (order W3-17, part b).

  python3 -I auto.py [room-presets.json] [auto.json]

Needs numpy. Reads only room-presets.json (and dspmodel.py and reference.py beside it, unchanged); writes auto.json,
which tests/room-dsp.verify.mjs compares the app's buildAutomatic with. Nothing here comes from the app: every value
is what the model's own build_auto, classes, shape_of and instances give, or what reference.py's functions give.

What it writes:
  cases      the 16 named cases: reference.py's 14 (CASES) and the order's two measured ones (part b, item 5):
             measures, shape, classes, the pair's first number, the template copied, the shares, the built header
             and parameters, and the built integers (the instance's, in the form of lines.py)
  measured   for the two measured cases, the model's room hash on the noise and its quiet and square tails, as
             reference.py computes them; this script stops if they are not the order's recorded numbers
  probes     measures on, one under and one over every threshold of the shapes and classes (R2 e1, e2) and a few
             more (the shaft, open sides, the second reading of `open`): shape, classes, pair, copy, header, parameters
  templates  templates edited in a copy of the table, for rules no template of the table runs (a value written
             negative in one template only, or in both; both positive; the measures' clamps; a third processor of
             a type): the edits, the measures and the same fields
  sweep      240 seeded random measures over every shape: the same fields

Parameters are written as the shortest decimal that reads back to the same single (as reference.py prints a
built reverb); the app rounds each to single precision and compares exactly.
"""
import sys, os, json, hashlib, collections, random
sys.dont_write_bytecode = True          # no __pycache__ beside the model
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import dspmodel as M
import reference as R
import lines as LN

f32 = np.float32
HERE = os.path.dirname(os.path.abspath(__file__))

# The order's two measured cases (part b, item 5): key, sky, width, length, height, reflectivity, open sides.
MEASURED = [('set_c_room', 0, 300, 400, 160, 0.9, 0), ('set_d_street', 1, 300, 1000, 4800, 0.4, 0)]
# Their recorded outputs in the order (part b, item 5): room/direct, the noise's hash, the quiet and square tails.
ORDER = {'set_c_room': (41, 214, 'b8160db1baa79bbf672458a508da2590c72479c17d403f14bd7bbf1274d8167f', 32481, 80874),
         'set_d_street': (23, 232, '337b9b8673dd8fd76e028ca611165e1b3cc85cd871c9a88e5d1612efb14a285c', 22050, 39889)}

def s32(v):
    """a single as the shortest decimal that reads back to it, as a JSON number"""
    t = np.format_float_positional(f32(v), unique=True, trim='-')
    return float(t) if ('.' in t or 'e' in t) else int(t)

def built(P, m):
    sky, W, L, H, refl, op = m
    b, shape, c, base = M.build_auto(P, bool(sky), W, L, H, refl, op)
    room, direct = M.voice_shares(b.header(), 12)[:2]
    return b, collections.OrderedDict([
        ('m', list(m)), ('shape', shape),
        ('classes', [c['size'], c['width'], c['length'], c['height'], c['refl'], c['diffusion']]),
        ('base', base), ('copy', b.num), ('shares', [room, direct]),
        ('h', [s32(v) for v in (b.mix_min, b.mix_max, b.duration, b.fade, b.db_min, b.db_mixdrop)]),
        ('p', [[t, [s32(v) for v in p]] for t, p in b.procs])])

def edited(P, edits):
    """a copy of the table with templates edited: [n, proc, index, value] sets one value, [n, procs] the list"""
    Q = dict(P)
    for e in edits:
        n = e[0]
        if n not in Q or Q[n] is P[n]: Q[n] = P[n].copy()
        if len(e) == 2: Q[n].procs = [[t, [float(f32(v)) for v in (list(p) + [0.0] * 16)[:16]]] for t, p in e[1]]
        else: Q[n].procs[e[1]][1][e[2]] = float(f32(e[3]))
    return Q

def z(*v): return list(v) + [0.0] * (16 - len(v))

def probes():
    out = []
    add = lambda label, *m: out.append((label, m))
    for t in (72, 144, 288, 576):                 # the width class: indoors, and under the sky (street or alley)
        for w in (t - 1, t, t + 1):
            add('width %d, indoors' % w, 0, w, 600, 200, 0.4, 0)
            add('width %d, under the sky' % w, 1, w, 4 * w, 4800, 0.4, 0)
    for t in (144, 288, 576, 1152):               # the length class
        for l in (t - 1, t, t + 1):
            add('length %d' % l, 0, 100, l, 100, 0.4, 0)
            add('length %d, width 300' % l, 0, 300, l, 300, 0.4, 0)
    for t in (48, 128, 216, 384):                 # the height class
        for h in (t - 1, t, t + 1):
            add('height %d' % h, 0, 200, 300, h, 0.4, 0)
            add('height %d, a corridor' % h, 0, 80, 400, h, 0.4, 0)
    for t in (120, 240, 480, 1200):               # the courtyards' size class, from the length
        for l in (t - 1, t, t + 1):
            add('courtyard, length %d' % l, 1, l, l, 4800, 0.4, 0)
            add('open courtyard, length %d' % l, 1, l // 2 + 1, l, 4800, 0.4, 1)
    for t in (0.04, 0.5, 0.8):                    # the reflectivity class: on (the single nearest), one single under, one over
        s = f32(t)
        for r, what in ((t, 'on'), (float(np.nextafter(s, f32(0))), 'one single under'), (float(np.nextafter(s, f32(1))), 'one single over'),
                        (t - 1e-9, 'a double 1e-9 under'), (t + 1e-9, 'a double 1e-9 over')):
            add('reflectivity %s (%r, %s)' % (t, r, what), 0, 300, 400, 160, r, 0)
    for r in (0.0, 1.0):
        add('reflectivity %s' % r, 0, 300, 400, 160, r, 0)
    # The shape rules (R2 e2), each on, one under and one over.
    for l in (159, 160, 161): add('duct: length %d against 4 x width 40' % l, 0, 40, l, 100, 0.4, 0)
    for w in (47, 48, 49): add('duct or hall: width %d, length 400' % w, 0, w, 400, 100, 0.4, 0)
    for l in (199, 200, 201): add('hall: length %d against 2.5 x width 80' % l, 0, 80, l, 100, 0.4, 0)
    for w in (95, 96, 97):
        add('hall or room: width %d, length 300' % w, 0, w, 300, 100, 0.4, 0)
        add('hall or tunnel: width %d, length 500' % w, 0, w, 500, 100, 0.4, 0)
    for l in (399, 400, 401): add('tunnel: length %d against 4 x width 100' % l, 0, 100, l, 100, 0.4, 0)
    for l in (499, 500, 501): add('courtyard: length %d against 2.5 x width 200' % l, 1, 200, l, 4800, 0.4, 0)
    for w in (143, 144, 145): add('alley or street: width %d, length 1000' % w, 1, w, 1000, 4800, 0.4, 0)
    for h in (299, 300, 301):
        add('the shaft: height %d against 3 x length 100, width 60' % h, 0, 60, 100, h, 0.4, 0)
        add('the shaft: height %d against 3 x length 100, width 100' % h, 0, 100, 100, h, 0.4, 0)
    add('a duct as a shaft: width 40, length 50, height 200', 0, 40, 50, 200, 0.4, 0)
    for n in range(5):
        add('%d open sides, width 300, length 1300' % n, 1, 300, 1300, 4800, 0.4, n)
        add('%d open sides, width 120, length 600' % n, 1, 120, 600, 4800, 0.4, n)
    add('open sides ignored indoors', 0, 300, 1300, 200, 0.4, 3)
    add('open: the other reading of R2 e4 (level rays keep 4800: spans of 9600)', 1, 9600, 9600, 4800, 0.08, 4)
    add('width larger than length', 0, 600, 300, 200, 0.4, 0)
    add('all zero', 0, 0, 0, 0, 0.0, 0)
    return out

def templates():
    corridor = (0, 80, 400, 120, 0.4, 0)
    return [
        ('negative width and depth in templates (reference.py: 110 width -1, 111 depth -1)', [[110, 0, 9, -1], [111, 0, 10, -1]], corridor),
        ('a hall: width -1 in A only, depth -1 in B only, height -1 in both; the feet clamped at 6 and 500',
         [[110, 0, 9, -1], [111, 0, 10, -1], [110, 0, 11, -1], [111, 0, 11, -1]], (0, 60, 7200, 1300, 0.4, 0)),
        ('a hall: every dimension -1 in both, mid-sized', [[110, 0, 9, -1], [110, 0, 10, -1], [110, 0, 11, -1],
                                                           [111, 0, 9, -1], [111, 0, 10, -1], [111, 0, 11, -1]], (0, 90, 900, 250, 0.4, 0)),
        ('a courtyard: the delay -1 in A only (B 50 ms); the measure clamped at 14 ms', [[127, 0, 1, 50]], (1, 60, 60, 4800, 0.4, 0)),
        ('a courtyard: the delay -1 in B only (A 50 ms), large', [[126, 0, 1, 50]], (1, 500, 1100, 4800, 0.4, 0)),
        ('a courtyard: delays and taps positive in both, blended squared by the length class',
         [[126, 0, 1, 50], [127, 0, 1, 300], [126, 0, 8, 20], [127, 0, 8, 40], [126, 0, 9, 30], [127, 0, 9, 60],
          [126, 0, 10, 40], [127, 0, 10, 80], [126, 0, 6, 200], [127, 0, 6, 900]], (1, 500, 700, 4800, 0.4, 0)),
        ('a courtyard: the measures past 500 ms (the clamp)', [], (1, 3000, 3600, 4800, 0.4, 0)),
        ('open space: three delays in each template (only the first two are blended)',
         [[130, [[1, z(1, 300, 0.2, 1, 0, 3000)], [1, z(0, 180, 0.15, 1, 0, 3000)], [1, z(0, 100, 0.1, 1, 0, 2000)], [2, z(340, 220, 6, 0.8, 1, 1500, 0, 10, 2)]]],
          [131, [[1, z(1, 500, 0.2, 1, 0, 3000)], [1, z(0, 500, 0.2, 1, 0, 3000)], [1, z(0, 400, 0.5, 1, 0, 900)], [2, z(340, 200, 6, 0.9, 1.5, 900, 0, 10, 2)]]]],
         (1, 300, 1300, 4800, 0.4, 4)),
        ('a room: two reverbs in each template (both blended)',
         [[102, [[2, z(80, 30, 2, 0.78, 1.1, 6000, 1)], [2, z(20, 10, 2, 0.5, 1, 5000, 1)]]],
          [103, [[10, z(1, 3, 0.15)], [2, z(240, 50, 10, 0.97, 2.4, 1800, 1)], [2, z(60, 30, 4, 0.9, 2, 1000, 1)]]]],
         (0, 500, 700, 220, 0.6, 0)),
    ]

def sweep(n=240):
    rng = random.Random(20261110)
    out = []
    for i in range(n):
        sky = rng.random() < 0.5
        W = rng.choice([rng.randint(1, 160), rng.randint(1, 1200), rng.randint(1, 9600)])
        L = rng.choice([W + rng.randint(0, 300), W + rng.randint(0, 5 * W + 10), rng.randint(1, 9600)])
        H = rng.choice([rng.randint(1, 500), rng.randint(1, 4800), 4800, 3 * L + rng.randint(-2, 2)])
        refl = rng.choice([rng.random(), rng.random() * 0.1, rng.random() * 0.2 + 0.4, rng.random() * 0.2 + 0.7])
        op = rng.choice([0, 0, 0, 1, 2, 3, 4]) if sky else rng.choice([0, 0, 2])
        out.append(('sweep %d' % i, (int(sky), W, L, max(H, 0), refl, op)))
    return out

def main(table_path, out_path):
    P = R.load(table_path)
    lines_json = json.load(open(os.path.join(HERE, 'lines.json')))
    out = collections.OrderedDict()
    cases = collections.OrderedDict()
    for c in list(R.CASES) + MEASURED:
        b, rec = built(P, c[1:])
        rec['d'] = LN.describe(M.Instance(b, R.randint_from(2)))
        cases[c[0]] = rec
        if c[0] in lines_json['auto']:            # the same build lines.py recorded for part a
            la = lines_json['auto'][c[0]]
            assert [[t, [float(f32(v)) for v in p]] for t, p in la['p']] == [[t, [float(f32(v)) for v in p]] for t, p in rec['p']], c[0]
            assert la['d'] == rec['d'], c[0]
    out['cases'] = cases
    meas = collections.OrderedDict()
    nz = R.noise()
    for c in MEASURED:
        b = M.build_auto(P, bool(c[1]), *c[2:])[0]
        room, direct, h = R.room_hash(b, nz, 66150)
        q = R.tail(b, None, R.quiet())[0]; s = R.tail(b, None, R.square())[0]
        meas[c[0]] = dict(shares=[room, direct], hash=h, quiet=q, square=s)
        if (room, direct, h, q, s) != ORDER[c[0]]:
            sys.exit('the model does not give the order\'s numbers for %s: %r against %r' % (c[0], (room, direct, h, q, s), ORDER[c[0]]))
    out['measured'] = meas
    out['probes'] = [dict(label=label, **built(P, m)[1]) for label, m in probes()]
    tpl = []
    for label, edits, m in templates():
        b, rec = built(edited(P, edits), m)
        rec['d'] = LN.describe(M.Instance(b, R.randint_from(2)))
        tpl.append(collections.OrderedDict([('label', label), ('edits', edits)] + list(rec.items())))
    t = R.template_case(P)                        # the first edit set is reference.py's own template case
    assert [[k, [s32(v) for v in p]] for k, p in t.procs] == tpl[0]['p']
    out['templates'] = tpl
    out['sweep'] = [dict(label=label, **built(P, m)[1]) for label, m in sweep()]
    text = '{\n' + ',\n'.join('%s:%s' % (json.dumps(k), json.dumps(v, separators=(',', ':'))) for k, v in out.items()) + '\n}\n'
    json.loads(text)
    open(out_path, 'w').write(text)
    shapes = collections.Counter(r['shape'] for r in out['sweep'])
    print('auto.json: %d bytes, SHA-256 %s; %d probes, %d template cases, %d swept (shapes %s)' % (
        len(text), hashlib.sha256(text.encode()).hexdigest(), len(out['probes']), len(tpl), len(out['sweep']),
        ' '.join('%d:%d' % kv for kv in sorted(shapes.items()))))

if __name__ == '__main__':
    a = sys.argv[1:]
    main(a[0] if a else os.path.join(HERE, 'room-presets.json'), a[1] if len(a) > 1 else os.path.join(HERE, 'auto.json'))
