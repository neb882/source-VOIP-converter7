#!/usr/bin/env python3
"""The game's scripts/dsp_presets.txt -> the app's table of room presets, as numbers.

Run privately (the game's file is not public):  python3 -I convert.py <dsp_presets.txt> [out.json]
Needs numpy. Stops if the file is not the one the table was made from (size, CRC-32), if a preset of the table
holds a word the name table does not have, more than 16 values in a processor, more than five processors, or a
configuration other than a plain chain. Prints the canonical table's SHA-256 and writes the canonical JSON.

Canonical form: one JSON object, keys = preset numbers in ascending order, each
{"h":[mix min, mix max, duration, fade, db min, db mixdrop],"p":[[type,[16 values]],...]}, no spaces.
A value is the file's token read as a number and rounded to single precision, written as the shortest
decimal that reads back to the same single; a word is its number in the engine's name table.
Processor types: NULL 0, DLY 1, RVA 2, FLT 3, CRS 4, PTC 5, ENV 6, LFO 7, EFO 8, MDY 9, DFR 10, AMP 11.
"""
import sys, re, json, zlib, hashlib
import numpy as np
SIZE, CRC = 46419, 2441946680
WANT = list(range(0, 30)) + [102, 103, 106, 107, 110, 111, 114, 115, 118, 119, 122, 123, 126, 127, 130, 131]
NAMES = dict(NULL=0, DLY=1, RVA=2, FLT=3, CRS=4, PTC=5, ENV=6, LFO=7, EFO=8, MDY=9, DFR=10, AMP=11,
             LP=0, HP=1, BP=2, LO=0, MED=1, HI=2, VHI=3,
             PLAIN=0, ALLPASS=1, LOWPASS=2, DLINEAR=3, FLINEAR=4, LOWPASS_4TAP=5, PLAIN_4TAP=6,
             SIN=0, TRI=1, SQR=2, SAW=3, RND=4, LOG_IN=5, LOG_OUT=6, LIN_IN=7, LIN_OUT=8, LIN=0, EXP=1,
             SIMPLE=0, LINEAR=1)
def val(t, strict=False):
    if t[0] in "0123456789+-":
        m = re.match(r"[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+)?", t).group(0)
        if strict and m != t: sys.exit('not a plain number: %r' % t)
        return np.float32(float(m or 0))
    if strict and t not in NAMES: sys.exit('a word the name table does not have: %r' % t)
    return np.float32(NAMES.get(t, 0))
def num(v):
    s = np.format_float_positional(np.float32(v), unique=True, trim='-')
    if s in ('-0', ''): s = '0'
    assert np.float32(float(s)) == np.float32(v)
    return s
def main(path, out=None):
    raw = open(path, 'rb').read()
    print('file: %d bytes, CRC-32 %d' % (len(raw), zlib.crc32(raw)))
    if (len(raw), zlib.crc32(raw)) != (SIZE, CRC): sys.exit('not the file the table was made from (%d bytes, CRC-32 %d)' % (SIZE, CRC))
    txt = re.sub(r"//[^\n]*", "", raw.decode('latin1'))
    toks = re.findall(r"[{}]|[^\s{}]+", txt)
    table = {}; i = 0; count = 0
    while i < len(toks):
        if toks[i] != "{": i += 1; continue
        n = int(val(toks[i + 1])); want = n in WANT
        hdr = [val(t, want) for t in toks[i + 3:i + 9]]; cfg = toks[i + 2]
        i += 9; procs = []
        while toks[i] != "}":
            if toks[i] == "{":
                j = i + 1; vals = []
                while toks[j] != "}": vals.append(val(toks[j], want)); j += 1
                if want and len(vals) > 17: sys.exit('preset %d: more than 16 values in a processor' % n)
                procs.append((int(vals[0]), (vals[1:] + [np.float32(0)] * 16)[:16])); i = j + 1
            else: i += 1
        i += 1; count += 1
        if n in WANT:
            if cfg not in ('LINEAR', 'SIMPLE'): sys.exit('preset %d: configuration %s' % (n, cfg))
            if len(procs) > 5: sys.exit('preset %d: more than five processors' % n)
            table[n] = (hdr, procs)
    assert sorted(table) == WANT, sorted(set(WANT) - set(table))
    parts = []
    for n in WANT:
        hdr, procs = table[n]
        parts.append('"%d":{"h":[%s],"p":[%s]}' % (n, ','.join(num(v) for v in hdr),
                     ','.join('[%d,[%s]]' % (t, ','.join(num(v) for v in p)) for t, p in procs)))
    text = '{' + ','.join(parts) + '}'
    json.loads(text)
    print('presets in the file: %d; in the table: %d; table: %d bytes, SHA-256 %s'
          % (count, len(WANT), len(text), hashlib.sha256(text.encode()).hexdigest()))
    if out: open(out, 'w').write(text)
    return text
if __name__ == '__main__':
    main(*sys.argv[1:3])
