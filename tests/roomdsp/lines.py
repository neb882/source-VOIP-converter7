#!/usr/bin/env python3
"""The model's built integers, read out of its own instances, for the app's checks (order W3-17, part a).

  python3 -I lines.py [room-presets.json] [lines.json]

Needs numpy. Reads only room-presets.json (and dspmodel.py and reference.py beside it, unchanged); writes
lines.json, which tests/room-dsp.verify.mjs compares the app's room-dsp.js with. Nothing here comes from the app.

What it writes, each from the model (dspmodel.py) or the reference's own functions (reference.py):
  presets    every preset of the table: the instance's built integers, processor by processor (the form below)
  synthetic  reference.py's synthetic cases and its template case: parameters and built integers
  auto       reference.py's 14 named cases as the model builds them: header, parameters, built integers, shape,
             classes and the pair (the parameters are what part a feeds its own processors; part b builds them)
  clamped    parameters outside the range tables (R2 0, AM 0), built by the model after its clamp_params with
             those tables (the model clamps AMP and MDY itself; for RVA, DLY and DFR this script applies the
             tables, written here from R2 0): the built integers, and the model's output on a short input
  extra      rules no preset of the table nor reference.py runs, each a one-preset chain: built integers and the
             model's output hash on the same short input
  draws      the first 60,000 samples of each modulating case fed zeros, with a draw that records
             (sample, low, high) and returns the high bound: when and between what the model draws
  ramps      the model's LinRamp, call by call until done: the room slot's (0.2 s) and the water slot's (0.1 s)
             0 to 4096, preset 14's amplifier glide (4096 to 1639 over 80 ms), preset 16's tap fade (15 ms), and
             ramps of 0 to 3 samples (AM 1: a step the 12.20 form cannot hold is done at once, at its start)
  entry      for each share a voice can have, the 16-bit samples where reference.entry differs from the exact
             trunc(s x 255 x share / 65536), with its value
  shares     model.voice_shares at distance 12 and 11 for every header of the table and a few more

The built-integer form, per processor (the app's describe() gives the same):
  NULL {t}; DLY {t, line}; DFR {t, stages: [line]}; RVA {t, lines: [line + fb], out: [[a1, b0, b1]], mod};
  AMP {t, g0, vth, dmix, vfeed, period, depth, glide, rand}; MDY {t, line, period, lo, glide, step, mix}
  line = {kind, D, a, g, lp: [a1, b0, b1] or null}; fb = the reverb's signed feedback integer (negative: a
  predelay); mod = per line {period, lo, glide, step} or null. glide = the ramp's sample count, step its 12.20
  step, lo the draw's lower bound (the upper is the line's D).
"""
import sys, os, json, hashlib, struct, collections
sys.dont_write_bytecode = True          # no __pycache__ beside the model
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import dspmodel as M
import reference as R

f32 = np.float32
HERE = os.path.dirname(os.path.abspath(__file__))

# The range tables of R2 0 (RVA, DLY, DFR); AMP and MDY's are the model's own (AM 0).
RANGE = {
    2: [(0, 1000), (0, 1000), (1, 12), (0, 1), (0, 10), (10, 22050), (0, 1), (0, 50), (0, 10),
        (-1000, 1000), (-1000, 1000), (-1000, 1000), (-1, 1), (-1, 1), (-1, 1), (0, 0.333)],
    1: [(0, 6), (-1, 1000), (0, 0.99), (0, 10), (0, 2), (10, 22050), (100, 11025), (0, 3), (-1, 1000), (-1, 1000), (-1, 1000)],
    10: [(0, 1), (0, 4), (0, 1), (0, 10)],
    11: M.AMP_TABLE, 9: M.MDY_TABLE,
}

def fl(v): return float(f32(v))

def line(dl):
    return dict(kind=dl.kind, D=dl.D, a=dl.a, g=dl.g, lp=[dl.flt.a1, dl.flt.b0, dl.flt.b1] if dl.flt else None)

def glide_n(seconds): return M.cvtt(f32(seconds) * f32(44100.0))

def proc(u):
    if isinstance(u, M.Null): return dict(t='NULL')
    if isinstance(u, M.DlyProc): return dict(t='DLY', line=line(u.d))
    if isinstance(u, M.Dfr): return dict(t='DFR', stages=[line(d) for d in u.st])
    if isinstance(u, M.Rva):
        lines = []
        for i, dl in enumerate(u.lines):
            L = line(dl); L['fb'] = u.A[i]; lines.append(L)
        mod = None
        if u.mod:
            mod = [dict(period=md.period, lo=M.tr((f32(1.0) - md.depth) * f32(md.d.maxd)), glide=glide_n(md.xft),
                        step=M.Ramp(md.xft).step) for md in u.mod]
        return dict(t='RVA', lines=lines, out=[[s.a1, s.b0, s.b1] for s in u.out], mod=mod)
    if isinstance(u, M.Amp):
        return dict(t='AMP', g0=u.g0, vth=u.vth, dmix=u.dmix, vfeed=u.vfeed, period=u.period, depth=u.depth,
                    glide=glide_n(u.glide), rand=int(u.rand))
    if isinstance(u, M.Mdy):
        return dict(t='MDY', line=line(u.d), period=u.period, lo=M.tr((f32(1.0) - u.depth) * f32(u.d.maxd)),
                    glide=glide_n(u.glide), step=M.LinRamp(u.glide, 0, 0x1000).step, mix=u.mix)
    raise TypeError(u)

def describe(inst): return [proc(u) for u in inst.units]

def params(ps): return [[t, [fl(v) for v in p]] for t, p in ps.procs]

def preset(procs, hdr=R.HDR):
    return M.Preset(900, 1 if len(procs) > 1 else 0, [fl(v) for v in hdr], [[t, [fl(v) for v in p]] for t, p in procs])

def clamped(procs):
    """the same chain with every value clamped as the engine does before a build (0 never clamped)"""
    out = []
    for t, p in procs:
        p = [fl(v) for v in (list(p) + [0.0] * 16)[:16]]
        if t in (1, 2, 10): p = [float(v) for v in M.clamp_params(p, RANGE[t])]
        out.append([t, p])
    return out

def short_hash(ps, n=8820, share=26, draw_seed=2):
    """the model's output for entry(noise, share) over n samples, then n zeros, SHA-256 of int32 LE"""
    nz = R.noise()[:n]
    inst = M.Instance(ps, R.randint_from(draw_seed))
    y = inst.run([R.entry(v, share) for v in nz] + [0] * n)
    return R.sha(y)

def z(*v): return list(v) + [0.0] * (16 - len(v))

# Parameters outside the range tables: what the clamp makes of them.
CLAMPED = collections.OrderedDict([
    ('delay: long, feedback 1.2, gain 20', [[1, z(2, 1500, 1.2, 20, 0, 3000, 0, 0)]]),
    ('delay: kind 0, delay -5, feedback -0.5', [[1, z(0, -5, -0.5, 1, 0, 0, 0, 0)]]),
    ('diffusor: size 1.5, count 6, feedback 1.5', [[10, z(1.5, 6, 1.5, 0)]]),
    ('reverb: size 1500, count 20, feedback 1.5, gain 15', [[2, z(1500, 20, 20, 1.5, 15, 4000, 1)]]),
    ('reverb: 3-D, width 1500, factor 2', [[2, z(0, 0, 3, 0, 2, 4000, 1, 0, 0, 1500, 32, 10, 2, -0.9, 0.4)]]),
    ('amplifier: gain 2000, threshold 2, glide 0.001', [[11, z(2000, 2, 0.5, 0, 10, 0.6, 0.001, 0)]]),
    ('modulating delay: 1500 ms, feedback 1.2, gain 2, rate 0.001', [[9, z(0, 1500, 1.2, 2, 0, 0, 0, 0, 0.001, 0.2, 10, 1)]]),
])

# Rules that neither the table nor reference.py runs.
EXTRA = collections.OrderedDict([
    ('delay: high-pass first section (width 500)', [[1, z(2, 50, 0.5, 1, 0, 2000, 500, 0)]]),
    ('delay: ALLPASS alone', [[1, z(1, 30, 0.6, 0.8)]]),
    ('delay: FLINEAR alone, its gain ignored', [[1, z(4, 30, 0.6, 0.3, 0, 3000)]]),
    ('delay: feedback 0.8, the gain cut', [[1, z(0, 20, 0.8, 1)]]),
    ('modulating delay: ALLPASS, mix 0.7', [[9, z(1, 40, 0.5, 1, 0, 0, 0, 0, 12, 0.3, 4, 0.7)]]),
    ('modulating delay: FLINEAR, mix 1', [[9, z(4, 40, 0.5, 1, 0, 2500, 0, 0, 12, 0.3, 4, 1)]]),
    ('modulating delay: glide 0 (a ramp of zero length)', [[9, z(0, 40, 0.5, 1, 0, 0, 0, 0, 12, 0.3, 0, 1)]]),
    ('reverb: 3-D with a loop filter and random taps', [[2, z(0, 0, 6, 0, 2, 4000, 1, 10, 3, 8, 32, 10, 0.9, -0.9, 0.4)]]),
    ('reverb: 3-D, push-apart moves the largest down', [[2, z(0, 0, 3, 0.8, 1, 0, 0, 0, 0, 30, 29, 12, 0, 0, 0)]]),
    ('reverb: 3-D, two equal sizes (the sort leaves them in place)', [[2, z(0, 0, 3, 0, 1, 0, 0, 0, 0, 20, 20, 10, 0.5, 0.8, 0.3)]]),
    ('reverb: random taps, depth clamped to 0.99', [[2, z(12, 10, 2, 0.5, 1, 0, 0, 50, 2)]]),
    ('reverb: random taps, depth clamped to 0.01', [[2, z(100, 100, 1, 0.5, 1, 0, 0, 0.1, 2)]]),
    ('amplifier: partial clip, slow glide', [[11, z(1.5, 0.08, 0.3, 0.5, 4, 0.5, 300, 0)]]),
    ('chain of five', [[10, z(1, 2, 0.15)], [11, z(1, 0, 0, 0, 10, 0.6, 80, 0)], [1, z(0, 10, 0.3, 1)],
                       [2, z(50, 20, 3, 0.9, 1, 5000, 1)], [0, z()]]),
])

def draws_of(ps, n=60000):
    rec = []; k = [0]
    inst = M.Instance(ps, lambda lo, hi: (rec.append([k[0], lo, hi]), hi)[1])
    for i in range(n):
        k[0] = i; inst.next(0)
    return rec

def ramp_values(seconds, start, target):
    r = M.LinRamp(seconds, start, target); vals = []
    while True:
        v = r.next(); vals.append(v)
        if r.done: break
    return dict(n=glide_n(seconds), step=r.step, values=vals)

def main(table_path, out_path):
    P = R.load(table_path)
    out = collections.OrderedDict()
    out['presets'] = collections.OrderedDict((str(n), describe(M.Instance(P[n], R.randint_from(2)))) for n in sorted(P))
    syn = collections.OrderedDict()
    for name in R.SYNTH:
        ps = R.synth(name)
        syn[name] = dict(h=[fl(v) for v in R.HDR], p=params(ps), d=describe(M.Instance(ps, R.randint_from(2))))
    t = R.template_case(P)
    syn['negative width and depth in templates'] = dict(h=[fl(v) for v in (t.mix_min, t.mix_max, t.duration, t.fade, t.db_min, t.db_mixdrop)],
                                                         p=params(t), d=describe(M.Instance(t, R.randint_from(2))))
    out['synthetic'] = syn
    auto = collections.OrderedDict()
    for c in R.CASES:
        b, shape, cls, base = M.build_auto(P, bool(c[1]), *c[2:])
        auto[c[0]] = dict(measures=list(c[1:]), shape=shape, classes=cls, base=base,
                          h=[fl(v) for v in (b.mix_min, b.mix_max, b.duration, b.fade, b.db_min, b.db_mixdrop)],
                          p=params(b), d=describe(M.Instance(b, R.randint_from(2))))
    out['auto'] = auto
    cl = collections.OrderedDict()
    for name, procs in CLAMPED.items():
        ps = preset(clamped(procs))
        cl[name] = dict(p=[[t, [fl(v) for v in p]] for t, p in procs], d=describe(M.Instance(ps, R.randint_from(2))),
                        hash=short_hash(ps))
    out['clamped'] = cl
    ex = collections.OrderedDict()
    for name, procs in EXTRA.items():
        ps = preset(procs)
        ex[name] = dict(p=params(ps), d=describe(M.Instance(ps, R.randint_from(2))), hash=short_hash(ps))
    out['extra'] = ex
    mods = [('preset %d' % n, P[n]) for n in (8, 9, 10, 14, 15, 16, 17, 18, 19, 23, 24, 25, 130, 131)]
    mods += [('synthetic: ' + k, R.synth(k)) for k in ('amplifier, random gain', 'modulating delay, mix 0.5',
                                                     'modulating delay, mix 0.3, low-pass')]
    mods += [('extra: ' + k, preset(EXTRA[k])) for k in ('modulating delay: ALLPASS, mix 0.7', 'reverb: 3-D with a loop filter and random taps',
                                                         'reverb: random taps, depth clamped to 0.99', 'reverb: random taps, depth clamped to 0.01',
                                                         'modulating delay: glide 0 (a ramp of zero length)')]
    out['draws'] = collections.OrderedDict((name, draws_of(ps)) for name, ps in mods)
    out['ramps'] = collections.OrderedDict([
        ('room slot 0.2 s', ramp_values(0.2, 0, 0x1000)), ('water slot 0.1 s', ramp_values(0.1, 0, 0x1000)),
        ('preset 14 amplifier', ramp_values(f32(80) * f32(0.001), 4096, 1639)),
        ('preset 16 tap fade', ramp_values(f32(15) * f32(0.001), 0, 0x1000)),
        ('0 samples', ramp_values(0.0, 0, 0x1000)), ('1 sample', ramp_values(1.5 / 44100, 0, 0x1000)),
        ('2 samples', ramp_values(2.5 / 44100, 0, 0x1000)), ('3 samples', ramp_values(3.5 / 44100, 0, 0x1000)),
        ('1 sample, 4096 to 1639', ramp_values(1.5 / 44100, 4096, 1639))])
    ent = collections.OrderedDict()
    for share in (0, 5, 23, 24, 26, 38, 41, 51, 72, 128, 183, 204, 214, 217, 229, 231, 232, 250, 255, 256):
        diff = []
        for s in range(-32768, 32768):
            e = R.entry(s, share); x = s * 255 * share
            exact = -((-x) // 65536) if x < 0 else x // 65536
            if e != exact: diff.append([s, e])
        ent[str(share)] = diff
    out['entry'] = ent
    heads = []
    for n in sorted(P):
        h = P[n].header()
        if h not in heads: heads.append(h)
    heads += [(0.2, 0.8, 80.0, 0.5), (1.0, 1.0, 80.0, 1.0), (1.0, 1.0, 0.0, 1.0), (0.63, 0.8, 80.0, 0.5),
              (0.2, 0.7, 95.0, 0.1), (0.2, 0.7, 59.0, 0.5), (0.2, 0.7, 60.0, 0.5)]
    out['shares'] = [[[fl(v) for v in h], list(M.voice_shares(h, 12)[:2]), list(M.voice_shares(h, 11)[:2])] for h in heads]
    text = '{\n' + ',\n'.join('%s:%s' % (json.dumps(k), json.dumps(v, separators=(',', ':'))) for k, v in out.items()) + '\n}\n'
    json.loads(text)
    open(out_path, 'w').write(text)
    print('lines.json: %d bytes, SHA-256 %s' % (len(text), hashlib.sha256(text.encode()).hexdigest()))

if __name__ == '__main__':
    a = sys.argv[1:]
    main(a[0] if a else os.path.join(HERE, 'room-presets.json'), a[1] if len(a) > 1 else os.path.join(HERE, 'lines.json'))
