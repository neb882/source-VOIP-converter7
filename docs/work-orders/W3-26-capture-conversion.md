# W3-26: the capture's conversion to 24 kHz, as read

**Status 2026-11-21: W3-26a built, reviewed and merged ("W3-26a as built", at the end); W3-26b not built.** The
six rulings are in "The rulings" and the plan review's changes in "After the plan review"; both hold over the text
above them where they differ. Written by a planner at `main` `8969238` (cache v54) from the repository, the two
readers' own converters and a prototype built in a scratch copy of the tree.

**Kind:** a change to how renders are computed. Every render of Steam voice with the codec on changes, from a
source at any rate. No render of another profile, of received voice or with the codec switched off changes by a
sample.
**Parts:** two orders, two merges. **W3-26a** is the converter as a module with its vectors and its suite; nothing
loads it and no render changes. **W3-26b** puts it in the render, the stream and the live chain, takes the fitted
filter out, and rewrites the words.
**Roles:** W3-26a: `tf-builder` (effort high), then `tf-reviewer`. W3-26b: `tf-builder` (effort xhigh), then
`tf-reviewer`, then a second reader on the stronger model (`docs/PIPELINE.md`: it changes how renders are
computed and what a constant is).
**Branches:** `claude/w3-26a-capture-converter`, then `claude/w3-26b-capture-wiring` from `main` after W3-26a's
merge. **Worktrees:** in the briefs.
**Reports:** `docs/reports/W3-26a-capture-converter.md` and `docs/reports/W3-26b-capture-wiring.md` (the
builders'). The planning report is `docs/reports/W3-26-plan.md`.
**Budget:** W3-26a 3 hours, W3-26b 6 hours.
**Cache number:** does not rise at W3-26a's merge (no file the site loads changes). It rises once at W3-26b's
merge. A builder never sets it.

## Why

Steam opens its microphone at 24,000 Hz (read, finding 28), and Windows converts the device's sound to that rate.
The app has stood in for that conversion with two stages: its own resampler, then `captureEq`, a 255-tap filter
fitted to three points measured on the owner's PC (findings 14 and 16).

On 2026-11-20 Windows's converter was read twice (`tests/REFERENCE_2026.md`, finding 28, the three paragraphs
added late on 2026-11-20). At quality 30 it gives Steam's band edge on Set D's pink noise to 0.14 dB rms from a
48 kHz source (measured once), and it folds nothing back from above 12 kHz, as Steam's packets show and as the
app's resampler does not (measured once). The three fitted points were not the whole conversion (measured).

**The orchestrator's rulings (2026-11-20):**

- The `steam` profile's capture runs the read converter at quality 30 from the source's own rate to 24 kHz, in
  place of the app's resampler and `captureEq`, in the render, the streamed render and the live chain alike: one
  module, the same samples whether run whole or in blocks.
- The 16-bit step stays as the app has it.
- A stream starts with zeros for history and its first output on the input's first instant.
- Paths that give Steam 24 kHz sound directly must not change by a sample.
- Other profiles are not touched.

## What is read and what is not

| Statement | Standing |
| --- | --- |
| The converter's design: the phases, the cutoff, the half length, the taps, the window, the table and its normalisation | read, twice |
| The cutoff at quality 30: 0.96634 of the lower rate's half, 11,596 Hz going down to 24 kHz | read (the rule), computed (the figure) |
| The stream's start: zeros for history, the first output on the input's first instant, an output made once `H` later inputs are in | read in part, by the second reader |
| To 16 bits: clip, times 32,768, round to nearest | read, as one of three routines; which one a capture stream gets is not read |
| That a capture stream gets this converter at quality 30 | not read. It fits one take, Set D, made through a virtual cable (measured once) |
| What Windows does with a pair of rates too awkward for a stored table | not read |
| Whether Windows runs a converter at all when the device is already at 24,000 Hz | not read |
| The order in which Windows adds the products of one output | not read |

The test that would settle the unread rows sample by sample is Steam's own file of what it captured
(`mic_outputfile`), asked of the owner on 2026-11-20. This order does not wait for it.

## The rule

In the order's own words, for a source at `R` Hz, `R` a whole number, to 24,000 Hz at quality 30. `f32(v)` is `v`
rounded to the nearest 32-bit float (`Math.fround`). Everything else is double precision. A builder can port from
this section alone; the two readers' converters are in `tests/capture-converter/` for a doubt (they are the
orchestrator's files: a builder does not edit them).

1. **The phases.** `g = gcd(R, 24000)`, `L = 24000 / g`, `M = R / g`. `L` is the number of phases; an output
   advances `M` fine steps, an input is `L` fine steps.
2. **The cutoff.** `y = f32(ln 30)`. `share = f32(0.067308 y − 0.00579496 y y + 0.804446)`, which is
   0.9663368 (read; computed). `lp = f32(min(f32(f32(R) / f32(24000)), 1) × share)`.
   `c = f32(f32(max(R, 24000)) / max(f32(f32(R) / lp), f32(24000)))`. `c` is the cutoff as a share of the lower
   rate's half. It is 0.9663368463516235 at every rate tried but 16,000 and 8,000 Hz, where the float steps give
   0.9663369059562683 (computed on the prototype).
3. **The half length and the taps.** `H = ceil(30 × max(1, R / 24000) / c)` input samples.
   `T = 4 × floor((2 H + 4) / 4)` taps a phase.
4. **Two stored tables**, made once:
   - `S[k] = f32(sin(π x) / (π x))` at `x = 35 k / 16384`, `k` from 0 to 16384, `S[0] = 1`; and
     `Sd[k] = f32((S[k + 1] − S[k]) / 65536)`.
   - `W[k] = f32(I0(10 √(1 − t²)) / I0(10))` at `t = k / 1024`, `k` from 0 to 1024: a Kaiser window of beta 10
     (measured against the stored table to 3 parts in 100 million, second reader); and
     `Wd[k] = f32((W[k + 1] − W[k]) / 1048576)`. `I0` is the modified Bessel function of order 0, summed to double
     precision.
5. **The kernel** `K(x)` at `x ≥ 0` zero crossings from its centre:
   - `u = f32(x / 30)`. If `u < 1`: `n = trunc(f32(u × 2^30))`, `w = f32(f32((n mod 2^20) × Wd[n >> 20]) +
     W[n >> 20])`. Otherwise `w = 0`.
   - `xf = f32(x)`. If `xf < 35`: `n = trunc(f32(xf × f32(2^30 / 35)))`, `s = f32(f32((n mod 2^16) × Sd[n >> 16])
     + S[n >> 16])`. Otherwise `s = 0`. (`f32(2^30 / 35)` is 30,678,338.)
   - `K = f32(w × s)`. The window ends at 30 zero crossings, so `K` is 0 from there on.
6. **The table.** `step = c / max(L, M)`. For a phase `p` from 0 to `L − 1` and a column `q` from 0 to `T − 1`:
   `raw[p][q] = K(|L (T − H − 1 − q) + p| × step)`.
7. **The normalisation.** One sum `s` over the whole table, phases in order and columns in order within a phase.
   `scale = f32(L / s)`, and `table[p][q] = f32(raw[p][q] × scale)`. The table is 32-bit float.
   - Where `(H + 1) L < 100000` and `max(L, M) ≤ 1280` (Windows's own limits for a stored table: read), the sum
     is a running 32-bit float: `s = f32(s + raw[p][q])` (read). The design is then called *rated*.
   - Outside those limits the sum is taken in double precision. This is the app's own (chosen): Windows computes
     such a pair another way, which was not read, and a single-precision sum over that many entries drifts
     (0.001 dB at `L` = 3,000 and 0.015 dB at `L` = 24,000, measured on the prototype).
8. **An output.** Output `k`, from 0: `i = floor(k M / L)`, `p = k M − i L`, and
   `y[k] = f32(Σ table[p][q] × x[i − (T − H − 1) + q])` over `q` from 0 to `T − 1` in that order, the products
   and the sum in double precision. Output `k` is centred on the input instant `k M / L`: output 0 sits on the
   source's first sample and nothing is delayed.
9. **The start.** `x[n]` is 0 for `n < 0` (read in part).
10. **The end of a finite source of `N` samples.** `x[n]` is 0 for `n ≥ N`, and the outputs are `k` from 0 to
    `max(1, round(N L / M)) − 1`; none for `N` = 0. This is the length the app's resampler gives today
    (`sincLength`), kept so that no length after it changes. It is the app's own (chosen): a capture stream has no
    end. The two references end elsewhere (`floor(N L / M)` and `floor((N − 1) L / M) + 1`), each its author's
    choice.
11. **A stream.** Output `k` is given as soon as input `i + H` is in, so a stream holds back `H / R` seconds and
    its first block comes short by that much: 1.3125 ms at 48,000 Hz and 1.3152 ms at 44,100 Hz (computed).
12. **At 24,000 Hz** the converter is not run: the samples pass as they are. Chosen: a device already at Steam's
    rate needs no conversion, and whether Windows runs one there is not read. The design rule itself would give a
    68-tap low-pass at 11,596 Hz.

**Precision.** With steps 2 to 8 as written, the planner's prototype gives the first reader's converter's output
bit for bit on every vector, in Node 22 (measured). So the port is held to the first reference **to the last bit**
and to the second within 3 parts in a million of full scale (measured between the references: at most 1.6 parts
in a million, on the 11,025 Hz vector). The reason for both: bit equality catches every slip of the port, since
every break the planner tried moved at least one output (the list is in "The tests"); and the looser hold on the
second reference is all the two readings support, since they differ in the last digits of the polynomial's
constants and in how they add. Neither is known to be Windows's output to the last bit. Rounded to 16 bits the two
references differ by one step in about 1 sample in 100 (measured on the vectors: 4 of 600 at 48,000 Hz, 5 of 653
at 44,100 Hz).

The stored tables depend on the engine's `Math.sin` and `Math.log` in their last digit. Node's are the same on
every machine. If a later Node moves a table entry, the vectors' check says so: that is a finding to report, not a
tolerance to widen.

## The source rates

What reaches this stage today (read from the code): a file decoded at its own rate where the browser allows it
(`filerate.js`: any whole rate the header gives and `OfflineAudioContext` accepts), otherwise at the page's audio
context's rate; and the live microphone at the context's rate. The engine rounds a rate to a whole number.

Every figure in this table is computed from the rule.

| Source rate, Hz | `L` | `M` | `H` | `T` | Table entries | A stream holds back | Rated |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 8,000 | 3 | 1 | 32 | 68 | 204 | 4.000 ms | yes |
| 11,025 | 320 | 147 | 32 | 68 | 21,760 | 2.902 ms | yes |
| 16,000 | 3 | 2 | 32 | 68 | 204 | 2.000 ms | yes |
| 22,050 | 160 | 147 | 32 | 68 | 10,880 | 1.451 ms | yes |
| 24,000 | not run | | | | | 0 | |
| 32,000 | 3 | 4 | 42 | 88 | 264 | 1.312 ms | yes |
| 44,100 | 80 | 147 | 58 | 120 | 9,600 | 1.315 ms | yes |
| 48,000 | 1 | 2 | 63 | 128 | 128 | 1.312 ms | yes |
| 88,200 | 40 | 147 | 115 | 232 | 9,280 | 1.304 ms | yes |
| 96,000 | 1 | 4 | 125 | 252 | 252 | 1.302 ms | yes |
| 192,000 | 1 | 8 | 249 | 500 | 500 | 1.297 ms | yes |
| 44,056 | 3,000 | 5,507 | 57 | 116 | 348,000 | 1.294 ms | no |
| 11,127 | 8,000 | 3,709 | 32 | 68 | 544,000 | 2.876 ms | no |
| 47,999 | 24,000 | 47,999 | 63 | 128 | 3,072,000 | 1.313 ms | no |

- **A source below 24 kHz.** The rule is the same one. The cutoff is then 0.96634 of the source's own half rate,
  and the half length is 32 source samples (read; computed). No take has a device below 24 kHz, so this is not
  measured.
- **An odd rate.** `L` is at most 24,000. The port stores the table when `L × T` is at most 4,194,304 entries
  (16.8 MB; `TABLE_LIMIT`), which covers every pair with a source up to about 65 kHz. Above that it makes a
  phase's row when an output needs it, by the same rule and with the same scale, found by one pass over the
  table. The samples do not depend on which way a row is made. Chosen; the standing of such a pair is "the app's
  own", by step 7.
- **Time.** On the prototype one minute of sound took 0.45 s from 48,000 Hz and 0.35 s from 44,100 Hz, where the
  two stages it replaces took 0.74 and 0.69 s. The table for 47,999 Hz took 0.11 s to make. One second from
  191,999 Hz, rows made as needed, took 0.26 s. (Measured on a shared four-core machine.)

## W3-26a: the module, its vectors and its suite

### The module

A new file at the repository's root, `capture-converter.js`, in the form of `steam-sender.js`: no imports, one
function, `module.exports` under Node and the global `TF2CaptureConverter` elsewhere. It holds nothing of the app.

```
TF2CaptureConverter = {
  OUT_RATE: 24000, QUALITY: 30, TABLE_LIMIT: 4194304,
  design(rate, limit = TABLE_LIMIT)
      -> { rate, L, M, H, T, cutoff, scale, rated, stored, row(p) }
         row(p): a Float32Array of T, the oldest input's tap first; when the table is not
         stored it is good until the next call of row
  length(n, rate)        -> the outputs of a finite source of n samples (the rule's step 10; n at 24000 Hz)
  wait(rate)             -> the seconds a stream holds back: H / rate; 0 at 24000 Hz
  createStream(rate, limit = TABLE_LIMIT)
      -> { push(x) -> Float32Array   every output whose H later inputs are in, maybe none
           end(count) -> Float32Array   the outputs not yet given, up to `count` in all, zeros read after the input }
  convert(x, rate)       -> Float32Array: push(x) then end(length(x.length, rate)), joined
  gain(rate, hz)         -> the conversion's gain at hz (of the source), linear, from the table taken as one filter
}
```

- A rate is rounded to a whole number first, as the engine does. A rate that is not finite or is under 1 is a
  `RangeError`.
- At 24,000 Hz `push` and `convert` return a copy of what they are given and `end` returns nothing.
- `push` never changes the array it is given. A block may be empty.
- `design` keeps what it made. The kept tables never hold more than `2 × TABLE_LIMIT` entries in all: older
  designs are dropped first.
- `end` is called once, last.

### The vectors

`tests/capture-converter/` holds, as the planner left them:

- `winsrc.py` (the first reader's converter) and `src2.py` (the second reader's). Each was written from its
  author's own reading; their tables are computed from closed forms and nothing in them is copied from a file of
  the owner's. They are the orchestrator's: a builder does not edit them. The names `README.md`,
  `check_tables.py` and `tables.py` in their headers are the readers' private notes and are not in the
  repository.
- `make_vectors.py`, which runs both at quality 30 on a seeded source and writes `vectors.json`
  (`python3 -I tests/capture-converter/make_vectors.py`; `--check` compares). It needs Python 3 with numpy and is
  not run by CI. The file as committed was made with Python 3.11.18 and numpy 2.4.6.
- `vectors.json`, 58,595 bytes: nine cases. Eight are rated: 48,000 and 44,100 Hz with 1,200 source samples;
  96,000, 32,000, 22,050, 16,000, 11,025 and 8,000 Hz with 400. Each holds `L`, `M`, `H`, `T`, both references'
  cutoff, the output's length, both references' outputs as base64 of little-endian float32, how far apart they
  are, and how many 16-bit steps differ. The two long cases also hold row 0 of both tables and the second
  reference's gain in dB at nine frequencies. The ninth case is 44,056 Hz, a pair both references refuse: its
  one output is made by the script's own loop through the first reader's kernel with the sum of step 7's second
  bullet.

The source of a case is seeded and made of whole 16-bit steps, so Node makes the same samples: with `r` the
engine's `mulberry32(seed)`, sample `i` is `(floor(r() × 32768) − 16384) / 32768`, and samples 100 to 139 are
`32767 / 32768`. Each reference is given the source followed by zeros and its output is cut to step 10's length.

W3-26a's builder adds `tests/capture-converter/README.md` in the form of `tests/roomdsp/README.md`: what each
file is, whose it is, how the vectors are made, that CI does not run Python.

### The suite

A new suite `tests/capture-converter.verify.mjs`, in `tests/run.mjs`'s table in the group `units`, with a row in
`tests/README.md`. It loads the module with `require`, as a test's own copy, and needs no engine. Every check
with the break it catches; the distances are from the planner's prototype (to the first reference, to the
second), in units of full scale.

1. **The vectors.** For every case: `L`, `M`, `H`, `T` and the cutoff are the case's (the first cutoff of the
   two); the output has the case's length; every sample equals the first reference's with `Object.is`; where the
   case has a second reference no sample is more than 3e-6 from it. For 48,000 and 44,100 Hz, `design().row(0)`
   equals the first row 0 bit for bit and is within 1e-6 of the second. Breaks, each of which the builder makes
   and sees fail:
   - the kernel computed exactly in place of the two stored tables (2.4e-6, 2.8e-6);
   - beta 10.0558, the code's formula, in place of 10 (2.5e-4);
   - each phase's row normalised to 1 in place of the whole table to `L` (2.6e-6 at 44,100 Hz; nothing at
     48,000 Hz, where there is one phase);
   - the cutoff left unrounded (3.6e-7: caught by bit equality only);
   - the sum of one output in single precision (6e-7: caught by bit equality only);
   - the table kept in double precision (1.2e-7: caught by bit equality only);
   - quality 15's share of the cutoff (0.069);
   - the phase one fine step off (0.78 at 44,100 Hz; nothing at 48,000 Hz);
   - the kernel centred one input late (1.3);
   - the history before the start not zero (0.095).
2. **The gain.** `gain(48000, f)` and `gain(44100, f)` are within 0.01 dB of the case's `gain_db` at 1,000,
   10,000, 11,000, 11,250, 11,450, 11,750 and 11,950 Hz: 0.00, 0.00, −0.53, −1.81, −3.81, −9.17 and −14.79 dB
   (computed, both references). A one-second tone of amplitude 0.5 at each of those frequencies through
   `convert`, measured by correlation over its middle, is within 0.02 dB of `gain`. Break: `gain` read from
   another table than `convert` uses; the window's length changed.
3. **Nothing folds back.** Tones of amplitude 0.5 at 12,500, 13,000 and 13,500 Hz from 48,000 and from
   44,100 Hz: what lands at 24,000 Hz less the tone's frequency is −44.1 dB against the tone, within 0.3 dB, and
   under −95 dB for the two others (measured on the prototype: −44.13, then −102 to −105). A linear sweep from
   12,000 to 13,500 Hz in 2 s at amplitude 0.5: the output's rms over the part above 12,700 Hz is at least 70 dB
   under the sweep's (measured: 80.9). Break: the app's `resampleSinc` in the module's place, which gives −12.4
   and −22.7 dB at 12,500 and 13,000 Hz and 22.2 dB for the sweep (measured).
4. **Whole against blocks.** For every rate of the vectors, for 24,000 Hz, and for 44,100 Hz with `limit` 0: the
   stream pushed in blocks of 1, 7, 128, 3, 0, 511, 64, 2 and 1,000 samples in turn, then `end(length)`, gives
   `convert`'s samples, every one equal with `Object.is`; so does a plan of one sample a block. Break: the kept
   history cut one sample short; `push` giving an output one input early.
5. **What a stream holds back.** After `n` inputs in all the outputs given are exactly those `k` with
   `floor(k M / L) + H ≤ n − 1`, for `n` = `H`, `H + 1`, `H + 2` and 1,000, at 48,000, 44,100 and 16,000 Hz.
   `wait(48000)` is `63 / 48000` and `wait(44100)` is `58 / 44100`. Break: outputs held one block longer.
6. **The start, the end and the level.** An impulse at source sample 2,000 of 4,000 peaks at output 1,000 from
   48,000 Hz with the outputs that are not zero from 969 to 1,031, and at output 1,088 from 44,100 Hz with 1,058
   to 1,119 (computed, first reader's self-test; the prototype agrees). An impulse at sample 0 peaks at output 0.
   A constant 0.25 comes out as 0.25 within 2e-6 away from the two ends (measured: 3e-8 and 1.0e-6).
   `length(0, R)` is 0, `length(1, 48000)` is 1, `length(12345, 44100)` is 6,718 and `length(12345, 48000)` is
   6,173. Break: `floor` in place of `round` in the length; the first output not on the first input.
7. **The two ways to hold a table.** `design(44100, 0)` stores nothing, and its rows and `convert`'s output
   through `createStream(44100, 0)` equal the stored design's bit for bit. The 44,056 Hz case equals its vector
   bit for bit and is not rated. `design(47999)` is not rated, and a 1 kHz tone through it keeps its level
   within 0.001 dB. Break: the unrated sum taken in single precision (−0.015 dB at 47,999 Hz, measured).
8. **At 24,000 Hz.** `convert` returns a copy, equal sample for sample and not the same array; `wait` is 0.

### W3-26a: files and done

May touch: `capture-converter.js` (new), `tests/capture-converter.verify.mjs` (new),
`tests/capture-converter/README.md` (new), `tests/run.mjs` (one row), `tests/README.md` (one row), and the report.
May not touch anything else: no page, worker, engine file, list or constant.

Done means: `pnpm test capture-converter harness site` passes; each break of the list was made and seen to fail
its check, and is in the report; `python3 -I tests/capture-converter/make_vectors.py --check` says the vectors
are what the script writes, or the report says which numpy differs; `node tests/cache-number.mjs origin/main
--report` says no cached file changed; CI's `verify` is green on the branch's head.

## W3-26b: the wiring

### The profile

`constants.js`: the `steam` profile loses `captureEq` and gains

```
capture: { converter: 'windows', quality: 30 },
```

with a comment that says what it is and its standing in the words of "What is read and what is not". The
profile table's comment loses its `captureEq` entry and gains `capture`. No other profile gets the member.

A render or a live chain reads it in one place, a helper in `engine/steam.js` beside `steamModules()`:
`captureConverter(codec)` returns `TF2CaptureConverter` when `codec.capture` is
`{ converter: 'windows', quality: 30 }`, `null` when the profile has no `capture`, and throws an `Error` that
names the member for any other value, and one that names `capture-converter.js` when the module is not loaded.

### The render (`engine/render.js`, stage 2)

With `conv = enableCodec && !received ? captureConverter(codec) : null`:

- `samples = conv ? conv.convert(samples, srcRate) : resampleSinc(samples, srcRate, codecRate)`.
- The `captureEq` lines go.
- Everything else of stages 1 and 2 stays where it is: the clip before the conversion, the optional high-pass
  and low-pass after it, the 16 bits (`steamCapture`) where the sender is fed.

The condition is the one `captureEq` had. So with the codec switched off, and for received voice, the capture is
the app's resampler as today.

### The streamed render (`engine/render-stream.js`)

The first stage is `conv ? { push: (x) => s.push(x), flush: () => s.end(codecLength) } : sincStage(srcRate,
codecRate, length)`, with `s = conv.createStream(srcRate)`. The `captureEq` stage goes. `codecLength` stays
`sincLength(length, srcRate, codecRate)`, which is `conv.length(length, srcRate)`.

### The live chain (`engine/live-chain.js`)

`steamLiveChain`: the capture is `conv.createStream(ioRate).push` in place of `streamResampleSinc(ioRate,
STEAM_RATE)`, and the `captureEq` stage goes. In `holdBack` and `queueHoldBack` the two terms
`sincWait(ioRate, STEAM_RATE)` and `firDelay(captureEq) / STEAM_RATE` become the one term `conv.wait(ioRate)`.
`contentDelay` stays 0: the converter delays nothing, it only holds back.

The other chain (`createLiveChain`'s own, for every other case): its `captureEq` lines go and `delaySeconds`
loses the term. They never ran: `steam` is the only profile with the filter, and `steam` with the codec on takes
the other path.

What the chain holds back, in ms (measured on the prototype; before is `main`):

| Context's rate | Before | After | Low latency, before | After | On the game's voice queue, before | After |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 44,100 | 206.875 | 202.232 | 126.833 | 122.190 | 563.904 | 559.261 |
| 48,000 | 206.898 | 202.252 | 126.856 | 122.210 | 563.927 | 559.281 |
| 96,000 | 206.898 | 202.241 | 126.856 | 122.200 | 563.927 | 559.270 |
| 16,000 | 208.208 | 203.917 | 128.167 | 123.875 | 565.237 | 560.946 |

The monitor is 4.6 ms sooner: the fitted filter's 5.292 ms and the app's resampler's 0.667 ms go, and the
converter's 1.3125 ms comes (computed). `lowLatencySavingMs` (80.042) and `queueCostMs` (357.029) do not move.
Nothing of the monitor's timing but `stats.latencyMs` moves: the sender's clock runs on the samples pushed to it,
as before.

A settings change still rebuilds the chain, and the new chain's converter starts from zeros. That is the app's
own, as the comment there says of the sender.

### The lists

`capture-converter.js` is loaded after `steam-sender.js` in `index.html`, `audio-worker.js`'s and
`live-worker.js`'s `importScripts`, and `tests/lib/engine.cjs`'s `ENGINE_FILES`; it is listed in `sw.js`'s
`ASSETS` (the list only; the number is the orchestrator's). `tests/lib/engine.cjs`'s header and
`tests/harness.verify.mjs`'s check 7 name four modules that attach themselves, not three. `audio.js`'s header
says "Windows's conversion to 24 kHz" where it says "resample to the codec rate" and "Steam capture roll-off",
for `steam`.

### What goes

- `captureEq` on the `steam` profile, its three uses in `engine/render.js`, `engine/render-stream.js` and
  `engine/live-chain.js` (four places), and the word in comments (`engine/steam.js` at `steamCapture`,
  `engine/live-chain.js`'s header).
- `profileEq`'s second parameter, which nothing passes any more.
- Nothing else. `firwin2`, `applyFirZeroPhase`, `firStage`, `streamFir` and `profileEq` stay: the decoder's
  filter (`decoderEq`, on a test's profile) runs them. `resampleSinc`, `sincStage`, `streamResampleSinc` and
  `sincWait` stay: every other profile's capture, the path to the voice rate and the device stage below
  44.1 kHz run them.

### The words

Each document says what the stage does now, with each figure's standing, and points to finding 28. The
statements to carry (the builder words them to fit each place):

- The capture of Steam voice is converted to 24,000 Hz as Windows's converter does it at quality 30 (read,
  twice): a Kaiser-windowed sinc whose cutoff is 0.96634 of 12 kHz, 11,596 Hz. It lowers the top of the band by
  0.5 dB at 11.0 kHz, 1.8 dB at 11.25 kHz, 3.8 dB at 11.45 kHz and 9.2 dB at 11.75 kHz (computed), and lets
  a 12.5 kHz tone through at −44 dB where the app's two stages let it through at −15 dB (computed).
- That a capture stream gets this converter at this quality is not read. It fits one take made through a
  virtual cable: Steam's band edge on Set D's pink noise within 0.14 dB rms (measured once).
- Not equal to a recording sample for sample: Steam's own file of what it captured was not made yet.
- The other profiles' capture is the app's own resampler (see "The other profiles' capture").

| File | What changes |
| --- | --- |
| `README.md` | "Fitted to recordings, with no rule read" loses the capture's roll-off; a line under "Read from the game's files, not yet seen in a recording" (or the list that fits) gains the conversion with "read from Windows's files; that Steam's capture gets it fits one take" |
| `docs/VOICE-PATH.md` | the table's row 1 and the two bullets "To 24000 Hz" and "The roll-off" become one bullet on the conversion |
| `docs/ACCURACY.md` | "The capture" in the list of what is fitted, the table's row "the capture", and the stage's three bullets (what the app runs, how it was checked, what differs) |
| `docs/FINDINGS.md` | the line that lists the roll-off among what is fitted |
| `docs/LIVE.md` | "about 207 ms (206.9 ms at 44.1 and 48 kHz ...)" becomes about 202 ms (202.2 ms) |
| `tests/README.md` | `verify.js`'s row loses "the capture filter"; `steam.verify.js`'s and `render-stream`'s rows as they change |
| `docs/REPRODUCE.md` | nothing names the filter (searched); no change |
| `index.html`, `app/` | nothing names the filter (searched); no change |
| `tests/predictions/PREDICTIONS.md` | one dated line under the registration notes, in the form of the others: `constants.js` and the engine's files changed for W3-26b; the `steam` capture is Windows's converter as read; the registered file is not edited |

`tests/REFERENCE_2026.md` gets added, dated lines only. Nothing there is deleted or reworded:

- Finding 28, after "Standing of the whole": *Built by W3-26b (the date): the `steam` capture runs this converter
  at quality 30 in the render, its stream and the live chain (`capture-converter.js`), held bit for bit to the
  first reader's converter and within 3 parts in a million to the second's on the vectors of
  `tests/capture-converter/`. The app's resampler and the fitted filter no longer run on `steam`. That a capture
  stream gets this converter is still not read.*
- The Model table's rows "Capture" and "Capture roll-off", each with a dated note in its "The app today" cell that
  the conversion is finding 28's since W3-26b, and the gains above.
- Findings 14 and 16, where each gives the three points as "the capture resampler": a dated note that points to
  finding 28's last paragraph (the points were not the whole conversion).
- "What remains unverified", the line "The capture resampler ... is modeled by its measured roll-off, not
  reproduced": a dated note that it is reproduced as read since W3-26b and that `mic_outputfile` is still the
  test.

`docs/PROGRESS.json` and `docs/README.md` are the orchestrator's.

## What moves, and by how much

Measured by the planner on the prototype against `main` `8969238`, with `tests/testsignal/tf2_voice_testsignal_v1`
(142.9 s, 48 kHz) unless a line says otherwise. Every figure here is of the model; none is of a recording.

**At the capture** (the 24 kHz signal before the 16 bits; the difference of the two captures against the signal
in the same band):

| Band | The difference, below the signal | The level's change |
| --- | ---: | ---: |
| 0 to 10 kHz | 99.0 dB | 0.000 dB |
| 10 to 11 kHz | 27.5 dB | +0.08 dB |
| 11 to 12 kHz | 17.7 dB | +0.21 dB |
| 10 to 12 kHz | 21.0 dB | +0.13 dB |
| the whole band | 42.4 dB | +0.001 dB |

After the 16 bits 34% of the samples differ, by 551 steps at most.

**By frequency** (a tone's gain through the capture, the same from 48,000 and 44,100 Hz to 0.01 dB; computed and
measured on the prototype):

| Tone | The app's two stages | The converter |
| ---: | ---: | ---: |
| 10.5 kHz | −0.09 dB | 0.00 dB |
| 11.0 kHz | −0.68 | −0.53 |
| 11.25 kHz | −1.76 | −1.81 |
| 11.45 kHz | −4.26 | −3.81 |
| 11.6 kHz | −7.01 | −6.09 |
| 11.75 kHz | −10.27 | −9.17 |
| 11.95 kHz | −13.73 | −14.79 |
| 12.05 kHz, landing at 11.95 | −14.70 | −18.37 |
| 12.5 kHz, landing at 11.5 | −15.17 | −44.13 |
| 13.0 kHz, landing at 11.0 | −22.73 | −102 to −104 |

**At the render's output** the two renders cannot be compared sample by sample: the codec's choices change with
any change of its input (39% of the samples are equal; the difference is 14 dB under the signal in every band).
By level, on the file's own timing and on the game's voice queue alike:

- The whole render: +0.004 dB from 0 to 10 kHz, +0.26 dB from 10 to 12 kHz.
- Of the 56 segments of the test signal, 41 keep their level within 0.05 dB. Of the others, one pink burst,
  the 8 and 11 kHz tones, the clicks and the quiet pink move by 0.1 to 0.45 dB, and the short silences between
  the bursts by up to 3 dB (each holds a few frames of the sender's hold).
- The 11.5 kHz tone moved by +10.8 dB and the 12 kHz tone by +26.7 dB at the default seed. This is not the
  capture's gain. These tones reach the codec as a mix of coded and DTX frames, and which frames are coded
  changes with the sender's clock: over six seeds, on the signal's 95 to 118 s rendered alone, the 11.5 kHz
  tone's level runs from −26.6 to −15.5 dBFS on `main` and the 12 kHz tone's from −68.8 to −27.6; on the
  prototype from −25.6 to −15.9 and from −69.6 to −29.2. The change at one seed is inside that spread.
- The sender on the whole signal: 5,077 frames sent before and 5,071 after, 665 and 646 of them DTX, 23 spurts
  both times.

**In the suites** (the prototype through `pnpm test`, the browser suite not run):

- **Passed with no line changed:** `harness`, `site`, `vendor`, `gain-exact`, `reproduce`, `recordings`, `opus`,
  `speex102`, `vr12`, `miles`, `reference`, `formats`, `filerate`, `meter`, `video`, `demo`, `output-stage`,
  `voice-channel`, `steam-sender`, `swresample`, `room-dsp`.
- **`verify`** passed with the filter's points written into section 2 as a literal. Nothing else in it reads
  the filter.
- **`gain`** stopped at the missing `captureEq` of its own profile, and passed once that profile dropped
  `capture` and the test's own chain dropped the filter (check 7 below).
- **`steam`**, with the filter taken out of the test's own capture and `eqDelay` 0: one check failed, the one
  that pins `latencyMs` (it read 202.251842 and 202.231859 ms).
- **`render-channel`**: three checks failed, each a comparison with hashes recorded from `main`:
  `LIVE_MAIN`'s three `steam` rows (its `celt_22` row did not move), section 24's `MAIN`, and section 29's
  `ENDS_IN_SILENCE_MAIN` (eight hashes). `MAIN` of the demo fixture and `OPEN_MAIN` did not move.
- **`render-stream`**: every failed check is a comparison with a recorded hash. The hashes of 50 cases move
  (`GOLDEN`'s WAV and `codecInfo`, and `GAIN_GOLDEN`): the 48 cases named `steam` that run Steam's sender with
  the codec on, `odd options`, and `test profile with a decoder EQ` (the frame path of a test's copy of `steam`).
  Three more checks fail with them because they hold a render to one of those hashes: the engine loaded in a vm
  context, and the two renders with the room module absent. **35 cases did not move:** every case of
  `steam_48`, `celt_22`, `celt_44`, `speex` and `miles`; `steam, codec bypassed`; `steam, empty source`;
  `steam, silent but for a quarter frame of sine at the end`; the two of a demo's voice as received and the
  two of a demo on the game's timeline. Every check that holds the stream to `process()` passed, with sources
  at 11,025, 22,050, 24,000, 32,000, 37,800, 44,100, 48,000 and 96,000 Hz and a source pushed a sample at a
  time.
- **`stages`** reads `GOLDEN` from the stream suite's file. Its failed checks were those 50 cases', from the
  kept stage A and from B, and no other. It records nothing of its own.

The planner read the moved cases off the suites' failed checks. The builder's `--hashes` runs ("What must not
move") are the list that counts.

## What must not move

- Every render of `celt_22`, `celt_44`, `speex`, `miles` (not in TF2) and `steam_48` (not in TF2), whole,
  streamed and live.
- `steam` with the codec switched off, and a demo's received voice on either timeline.
- Everything that hands Steam's sender or codec 24 kHz samples of its own: `tests/steam-sender.verify.mjs`,
  `tests/opus.verify.mjs` (the Steam stream's recorded packet and sample hashes), `tests/reproduce.verify.mjs`
  (the check `gate` on a 24 kHz clip), `tests/demo.verify.mjs`, `tests/swresample.verify.mjs`,
  `tests/voice-channel.verify.mjs`, `tests/recordings.verify.mjs` (the published recordings are the engine
  codecs': none is of Steam voice).
- The length of every render, and every `codecLength` and `voiceLength`: step 10 keeps the app's length.
- `tests/predictions/predictions.json`: never edited.

How the builder shows it: `node tests/render-stream.verify.mjs --hashes` on `main` and on the branch's head, both
outputs kept beside the report; the cases that differ are the 50 that "What moves" names, and none of the 35.
The suites named in this section pass with no line of theirs changed.

A hash of a case that does not run Steam's sender with the codec on, if it moves, is a reason to stop.

## The tests of W3-26b

Every check with the break it catches. None needs the owner's recordings.

1. **The render's capture is the module's.** In `tests/steam.verify.js`, with a 48,000 Hz and a 44,100 Hz
   source of seeded speech-like sound and with `micGain` 2 so that the clip acts: the 16-bit samples of every
   message the render decodes (`onDecoded`) equal those of the test's own chain, which is the clip, the test's
   own `require`d copy of `capture-converter.js`, the 16 bits, the test's own sender and `steamRoundTrip`. Breaks:
   `resampleSinc` left in `engine/render.js`; the clip moved to after the conversion; the gain applied after
   the conversion.
2. **A 24,000 Hz source.** The suite's helper `captured(x)` becomes the clip and the 16 bits with no filter, in
   both sections, and `eqDelay` goes. Every check that used them passes with nothing else changed (on the
   prototype all did but the one below). Break: the 68-tap design run at 24,000 Hz in place of a pass-through.
3. **The stream is the render.** `tests/render-stream.verify.mjs` gains three cases: `steam` from a 44,056 Hz
   source (not rated), from a 16,000 Hz source (below 24 kHz) and from a 96,000 Hz source, each streamed at the
   suite's plans of pieces and equal to `process()`. Break: `flush` asking for `floor` of the length; the stage
   keeping its own count of outputs.
4. **The live chain is the stream.** The existing checks of `[10b]` hold the chain to `createRender` at the mix
   point from 48,000 and 44,100 Hz. The check that pins `latencyMs` to its terms takes the new terms,
   `1000 × (wait(rate) + (fullReach + lookahead + 16) / 24000 + (rate > 44100 ? 1 / 44100 : 0))` with
   `wait(rate)` written out in the test as `H / rate` from the table of "The source rates" (63 / 48000 and
   58 / 44100), and the new figures, 202.252 and 202.232 ms. Break: `sincWait` left in `holdBack`; the
   converter's wait counted in `contentDelay`.
5. **The profile.** In `tests/verify.js`, section 2 ("Profile calibration FIR") loses its two checks of
   `captureEq` and gains: `steam` has no `captureEq` and has `capture` as written above; no other profile has
   `capture`; a profile whose `capture` names another converter or quality makes `process()` reject with an
   error that names it. The checks of `firwin2` and of the zero-phase filter stay, on a filter the test makes.
6. **The module missing.** A load of the engine without `capture-converter.js` (a copy of the files, as
   `tests/harness.verify.mjs`'s check 8 makes one) renders `celt_22` and rejects a `steam` render with the
   error that names the file.
7. **A test's own profile.** `tests/gain.verify.mjs`'s `test_frame_gate` copies `steam` and gets
   `capture: undefined`, and the line that applied `captureEq` in the test's own chain goes: its capture is the
   app's resampler alone and its checks are of the gain (on the prototype all passed that way).
   `tests/render-stream.verify.mjs`'s and `tests/stages.verify.mjs`'s `test_decoder_eq` keeps the member it
   copies, so the frame path runs behind the converter in those cases; their hashes are recorded again with the
   others.
8. **The recorded hashes.** After every other check passes, the moved hashes of
   `tests/render-stream.verify.mjs` (`GOLDEN` and `GAIN_GOLDEN`) and of any other suite are recorded again in a
   commit of their own, with a line in the file's history comment in the form of the earlier ones (which cases
   moved, which did not), and the list in the report.

## Files of W3-26b

May touch: `constants.js`, `engine/steam.js`, `engine/render.js`, `engine/render-stream.js`,
`engine/live-chain.js`, `engine/codec.js` (`profileEq`'s parameter), `audio.js` (the header's words),
`index.html`, `audio-worker.js`, `live-worker.js` (one name each), `sw.js` (the list, not the number),
`tests/lib/engine.cjs`, `tests/harness.verify.mjs`, `tests/verify.js`, `tests/steam.verify.js`,
`tests/gain.verify.mjs`, `tests/render-stream.verify.mjs`, `tests/stages.verify.mjs`,
`tests/render-channel.verify.mjs` and `tests/browser.verify.js` (only a check or recorded value that this order
moves, each named in the report), `tests/README.md`, `tests/REFERENCE_2026.md` (added dated lines),
`tests/predictions/PREDICTIONS.md` (one added line), `README.md`, `docs/VOICE-PATH.md`, `docs/ACCURACY.md`,
`docs/FINDINGS.md`, `docs/LIVE.md`, and the report.

May not touch: `capture-converter.js` and `tests/capture-converter/` (a fault found there is reported, and fixed
as W3-26a's), `steam-sender.js`, `voice-channel.js`, the codecs and `vendor/`, `engine/dsp.js`,
`tests/predictions/predictions.json`, `tests/recordings/`, `tests/accuracy.takes.json`, the number in `sw.js`,
`docs/PROGRESS.json`.

## Done means, W3-26b

- `pnpm test verify steam gain harness site capture-converter` passes; then `flock /tmp/tf2ve-heavy.lock pnpm
  test`; then the browser suite the same way.
- The two `--hashes` outputs differ in the cases this order names and in no other.
- Each break above was made and seen to fail its check, and is in the report.
- A render of the test signal takes no longer than on `main` (measured, in the report).
- `grep -rn captureEq` finds the word only in `docs/reports/`, `docs/work-orders/`, `docs/PROGRESS-LOG.md` and
  the record.
- CI's `verify` is green on the branch's head.

## Stop and ask

- A recorded hash moves in a case that does not run Steam's sender with the codec on.
- A check of a suite named under "What must not move" fails.
- The port cannot equal the first reference bit for bit on a vector (W3-26a).
- The live chain cannot equal the streamed render at its mix point without a delay of its own.
- A budget is spent.

## What the reviewer attacks

- W3-26a: the edges of `push` (a block shorter than `H`, an empty block, the first output of an up-conversion,
  where one input gives three outputs); `end` with a count that needs no more input; the rows made on demand
  against a second call of `row`; the kept designs' bound; a rate given as 44100.4.
- W3-26b: a render whose source is 1 sample long, or empty; the kept stage A (`opts.stages`) across a change of
  `enableWarble`, which changes which converter ran; `micGain` and the clip against the conversion's overshoot
  (a full-scale square comes out of the converter above 1.0 and is clamped by the 16 bits, not before);
  the live chain rebuilt in mid-phrase; a context at 24,000 Hz.
- Both: that no test takes its expected samples from the code under test.

## After the merge: the private runs

The planner has no recordings. The orchestrator runs, before the merge on `main` and after it on the branch:

- `tests/accuracy.mjs --seeds 9` on the rows of `tests/accuracy.takes.json`. Expected (inferred from the figures
  above, not run): each plain row's overall level within 0.05 dB of its figure on `main`; the bands from 10 to
  12 kHz of the noise segments a little nearer the takes; the 11.5 and 12 kHz tone segments inside their spread
  over seeds. A plain row whose median level moves by more than 0.2 dB, or a band below 10 kHz by more than
  0.3 dB, is a finding before the merge.
- `tests/retiming.mjs`: expected unchanged in kind, since no time moves; the sweep's spurt may end a few frames
  sooner (finding 28: 726 to 730 frames with the app's stages, 721 to 724 with the converter, against Steam's
  721).
- The page's real-take check on one take of Set B, by eye: the lanes and the spectrum's top edge.

The published recordings (`tests/recordings/`) are the engine codecs' and say nothing of this change.

## The other profiles' capture (an open question, not work)

`celt_22`, `celt_44`, `speex`, `miles` (not in TF2) and `steam_48` (not in TF2) keep the app's own resampler to
their codec's rate. What is known: the game's own capture, at the engine's rate, goes through the same Windows
interface as Steam's (inferred from finding 28's reading of DirectSound's capture, which is a layer over the wave
input interface for any caller). Whether those captures get the same converter and quality is not read, and no
recording measures their band edge against a known source: Sets H, I, M and O fed the game a file
(`voice_inputfromfile`), which passes no capture. Nothing is planned.

## Rulings wanted before the build

1. **A source at 24,000 Hz passes untouched** (the rule's step 12). Today such a render runs the fitted filter.
   The other way is the 68-tap design at equal rates, which nothing read supports. The order is written for
   the pass-through; the suites' 24 kHz sources then feed the sender the clipped source itself.
2. **The codec switched off keeps the app's resampler**, as it skipped the fitted filter. The other way puts
   the converter there too and moves the hash of "steam, codec bypassed".
3. **Bit for bit to the first reader's converter**, 3 parts in a million to the second's. The other way is a
   tolerance to both, which would not catch the breaks marked "bit equality only".
4. **Pairs outside Windows's table limits** are built by the same rule with a double-precision sum, and rows
   made on demand above `TABLE_LIMIT`. The other ways: refuse such a file, or bring it to 48,000 Hz with the
   app's resampler first. Both put a second sound path in the capture.
5. **The two references are committed** in `tests/capture-converter/` as the planner left them. They name
   addresses in the owner's files, as the record does, and hold no bytes of them.
6. **Quality 30 only.** The module builds no other quality. Qualities under 20 use a second evaluator, which
   the references have and the order leaves out.

## The rulings (the orchestrator, 2026-11-21)

All six as the order is written:

1. A source at 24,000 Hz passes untouched.
2. The codec switched off keeps the app's resampler.
3. Bit for bit to the first reader's converter, 3 parts in a million to the second's.
4. Pairs outside Windows's table limits: the same rule with a double-precision sum, rows made on demand above
   `TABLE_LIMIT`. Their standing is "the app's own".
5. The two references are committed in `tests/capture-converter/`. They reach the repository with W3-26a's branch
   (the orchestrator's commit, made before the builder's first), not with this order: a file under `tests/` goes
   through CI.
6. Quality 30 only.

On the planner's other questions: the accuracy suite, the retiming and the page's real-take check are the
orchestrator's private runs before W3-26b merges, with Set D's band edge and its sweep counted again through the
built module. The record's "within 0.1 dB below 12 kHz" is of noise through the codec and the order's tone gains
are before it; W3-26b's dated lines say which measure each is. Takes through a 44.1 kHz device and through one
below 24 kHz are not asked of the owner now: Steam's own file of what it captured comes first.

## After the plan review (2026-11-21)

A plan reviewer wrote a port of its own from "The rule" alone: bit-equal to the first reference on all nine
vectors at the first try, and its stream from steps 8 to 11 equal to the whole conversion (measured, reviewer).
`end(count)` can always be met and "every output whose `H` later inputs are in" is check 5's set (reviewer).
Verdict: build with these changes. Where they differ from the text above, these hold.

### W3-26a

1. **Check 1, the break "beta 10.0558"**: the code's formula gives 10.0613 at quality 30 (`(100 − 8.7) × 0.1102`,
   both references). The break is made with 10.0613.
2. **Two more breaks for check 1, made at 44,100 Hz** (neither moves a sample where there is one phase): the phase
   read reversed (`L − p` or `L − 1 − p` for `p`), and the table read transposed.
3. **Check 8 gains** what the interface promises and nothing tested: `push` at 24,000 Hz returns a copy and not the
   caller's array; `push` at any rate leaves the array it is given unchanged; a rate that is not finite or is
   under 1 is a `RangeError`; a rate of 44100.4 behaves as 44,100; the kept designs never hold more than
   `2 × TABLE_LIMIT` entries (shown with a small `limit` or by counting what `design` keeps, whichever the
   module's shape allows without a hook made only for the test).
4. **`gain`'s formula**: `gain(R, f) = |Σp Σq table[p][q] × e^(−2πi f (L j + p) / (R L))| / L`, with `j` the input
   offset of tap `q` from the output's instant (`q − (T − H − 1)`) and the sign of `p` as the table's own index
   has it; it must give the vectors' `gain_db`, which the second reference computed. `design(24000)` returns
   `null`: no table is made. `gain(24000, f)` is 1.
5. **Step 8's "in that order"** is chosen: the first reference adds the newest input first. Either order and a
   pairwise sum give the same bits on every vector, since the sum is rounded to 32 bits once at the end
   (measured, reviewer).
6. **Standings in "The rule".** The stored sinc table with its grid `35 k / 16384` and its interpolation, the
   table limits `(H + 1) L < 100000` and `max(L, M) ≤ 1280`, and the 32-bit running sum are **read, as the first
   reader's converter has them**: the record does not hold them yet, and the second reader's converter has
   another grid for the sinc table (`k × 65536 / 30678338`), which is where the two differ. The report says so;
   W3-26b's dated line in finding 28 carries them into the record.

### W3-26b

1. **Test 6 (the module missing) cannot be built as worded**: the test's loader reads every listed engine file, so
   a copy without the file stops at the load, and the module also sets its global under Node, so a later load
   finds it. Build it as the room module's absent case is built (`tests/lib/engine.cjs`, `HANDED`, the precedent
   of `TF2Room: null`), and `tests/harness.verify.mjs`'s check 7 then counts the modules as that leaves them. If
   that precedent does not fit, the other way is an empty stub in the copy with the global removed and restored
   around the load; the report says which and why.
2. **`captureConverter(codec)`**: a `capture` of `undefined` is no capture (a test's copy has exactly that). A
   profile with `capture` and a `codecRate` other than 24,000 throws an `Error` that names both.
3. **The live chain's two paths.** `steamLiveChain` keeps a fallback, as the render and the stream have:
   `conv ? conv.createStream(ioRate).push : streamResampleSinc(ioRate, STEAM_RATE)`, with the matching term in
   the hold-backs. And `createLiveChain`'s own path honours `capture` too, wherever it brings the input to the
   codec's rate with the codec on: a member that the render honours and the live chain ignores is a trap. "They
   never ran" was true of the shipped profiles only (`test_decoder_eq` and `test_frame_gate` are copies that
   carry the filter today). If that path cannot run a profile with `capture` at all, the report says why, and a
   check shows such a profile is refused there with an error and not run without its converter.
4. **Added to the lists.** May touch, each for the one thing named: `tests/verify.js` at its read of
   `steam_48.captureEq`; `tests/accuracy.mjs`, whose `MODEL_FILES` gains `capture-converter.js` beside
   `steam-sender.js`; `README.md`'s table of files, a row for the new file; `docs/LIVE.md`'s "the capture filter";
   `tests/browser.verify.js`'s note with 206.9 ms; the comment at `contentDelay` in `engine/live-chain.js`. The
   done-grep for `captureEq` also excepts `docs/PROGRESS.json`.

Checked by the reviewer and correct as written: the condition `enableCodec && !received`; the kept stage A's key
(it holds `enableWarble`, `received` and the profile's name); `sincWait` stays for the output's wait; no page,
`app/` file or tool reads `captureEq`; the latency table; `reproduce` and `demo` render `steam` with no recorded
value.

## W3-26a as built (2026-11-21)

Built on `claude/w3-26a-capture-converter`, reviewed, one fix round, merged with no cache change (no file the site
loads changed). The report is [W3-26a-capture-converter.md](../reports/W3-26a-capture-converter.md).

- **The port equals the first reader's converter bit for bit on all nine vectors** and is within 1.6 parts in a
  million of the second's (measured, builder). The reviewer ran it against the first reader's converter at nine
  more rates, whole tables and outputs: bit for bit (measured, reviewer).
- **"Bit for bit" is of the vectors, not of every signal.** On three stretches of the test signal (47 s in all,
  read as 48,000 and as 44,100 Hz) the module's output equals the first reference's in every sample but one of
  about 2.8 million, a sample of 1.3e-6 that differs in its last bit, and is within 4.5e-7 of the second's
  (measured, the orchestrator). The reference adds an output's products with a library routine whose order is
  not the module's.
- **The review's one fault**: from a source below 24 kHz `end(count)` gave more than `count` outputs, so a
  conversion came out one sample longer than `length()` says in about half the lengths at 11,025 Hz (878 for 877
  from 403 samples). The first build's checks could not see it: its lengths were tested where no two outputs
  share a centre, and every vector below 24 kHz ended on a whole number of phases. Fixed with a cap, and checked
  on every length from 1 to 600 samples at nine rates and on counts in mid-phase (builder); the orchestrator
  counted 3,010 lengths at ten rates again, none off.
- **For W3-26b's builder**: `design(24000)` is `null`; a kept design is given again as the same object; `row(p)`
  of a stored design is a copy; `push` or `end` after `end` throws; a stream's counters are exact for about 90
  days at 47,999 Hz and 80 years at 44,100 Hz (computed, reviewer); the first second from an odd rate above about
  65 kHz costs one pass over the table to find the scale (0.32 s of the 0.56 s measured at 191,999 Hz).
