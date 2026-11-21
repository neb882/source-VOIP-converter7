# W3-26a: the capture converter as a module, its vectors and its suite

The build report for W3-26a of `docs/work-orders/W3-26-capture-conversion.md`, branch
`claude/w3-26a-capture-converter` (from `main` `0cff71e`, the orchestrator's commit `fc8e99b` first). Nothing loads
the module and no render changes. `node tests/cache-number.mjs origin/main --report`: "cache number against
origin/main (ef43a36): no cached file changed; the number stays v54".

## What changed

| File | Change |
| --- | --- |
| `capture-converter.js` (new) | Windows's converter at quality 30 to 24,000 Hz, steps 1 to 12 of the order's rule, in the form of `steam-sender.js`: no imports, `module.exports` under Node, the global `TF2CaptureConverter` elsewhere |
| `tests/capture-converter.verify.mjs` (new) | the suite: the order's checks 1 to 8 and the edges "What the reviewer attacks" names; `TF2_DIR` loads the module from a copy, to break one |
| `tests/capture-converter/README.md` (new) | what each file of the folder is, whose it is, how the vectors are made, that CI does not run Python |
| `tests/run.mjs` | one row: `capture-converter`, group `units` |
| `tests/README.md` | one row for the suite |

The four files of `tests/capture-converter/` that the orchestrator committed (`winsrc.py`, `src2.py`,
`make_vectors.py`, `vectors.json`) were read and not edited. No page, worker, engine file, list or constant changed.

## The port against the references

Bit for bit to the first reference on every vector, at the first try, in Node 22.23.4 (measured): every sample of
the nine cases equal with `Object.is`, and row 0 of the 48,000 and 44,100 Hz tables too. The largest distances to
the second reference (measured): 4.2e-7 at 48,000 Hz, 1.3e-6 at 44,100 Hz, 1.6e-6 at 11,025 Hz; its row 0 within
3.0e-7. These are the distances the vectors record between the two references.

`python3 -I tests/capture-converter/make_vectors.py --check`, with Python 3.11.18 and numpy 2.4.6 (the versions
the file was made with): "vectors.json is what this script writes" (1.9 s).

## The module's shape where it differs from the order's sketch

| Member | The sketch | Built | Why |
| --- | --- | --- | --- |
| `design(24000)` | `null` (the plan review's change 4) | `null` | the converter is not run at 24,000 Hz (step 12); no table is made |
| `design(rate)` given again | not said | the same object while the design is kept | the kept designs' bound is shown from outside by it (check 8), with no member made only for the test |
| `design(...).row(p)` on a stored design | a `Float32Array` of `T` | a fresh copy each call | a view would let a caller write into the kept table; a row made on demand is the one shared array, good until the next call, as the sketch says |
| refusals | a rate not finite or under 1 is a `RangeError` | that, and a `RangeError` for a `limit` that is not a number of at least 0, for `end()`'s count that is not a whole number of at least 0, for a length that is not one, for a phase outside 0 to `L - 1`, and for a frequency that is not finite; `push()` or `end()` after `end()` throws an `Error` | the sketch says `end` is called once, last; a later call is a caller's fault, so it is refused rather than given samples |

Inside, and not part of the interface:

- A stream keeps its own row buffer when the table is not stored, so a caller's `row()` between two pushes does
  not change the stream's samples.
- `I0` is summed until a term no longer changes the sum (step 4 says "summed to double precision").
- The sinc table's step array holds one entry more than the rule's, 0, so that an index that rounds up to the
  table's end reads the last entry rather than nothing. No input of the converter reaches it: the kernel is only
  asked for points under about 33 zero crossings (computed from step 6).
- The designs are kept by rate and by whether the table is stored; a design used again counts as the newest.
- A stream tracks its next output's input and phase by whole-number steps (`p += M`, carried into `i`), so its
  arithmetic stays exact however long it runs.

## The standings the module's comments carry

As the plan review's change 6 gives them: the Kaiser window of beta 10 and the cutoff's rule are read, twice; the
stored sinc table with its grid `35 k / 16384` and its interpolation, the table limits `(H + 1) L < 100000` and
`max(L, M) <= 1280`, and the 32-bit running sum are read, as the first reader's converter has them (the record
does not hold them yet; the second reader's converter has another grid for the sinc, `k x 65536 / 30678338`,
which is where the two differ). The double-precision sum outside the limits, rows made as needed, the length of a
finite source and the pass-through at 24,000 Hz are the app's own (chosen).

The order of adding one output's products is chosen (change 5): the module adds the oldest input first, the
first reference the newest first. Built with the newest first, the suite passes unchanged, every vector bit for
bit (measured): the sum is rounded to 32 bits once, at its end.

`gain()` is the plan review's formula (change 4): `|sum over p and q of table[p][q] e^(-2 pi i f (L j - p) / (R L))| / L`,
with `j = q - (T - H - 1)` the input offset of tap `q` from the output's instant and `p` with the sign the table's
own index has (step 6's index is `|L j - p|`). It gives the vectors' `gain_db` (rounded there to 0.001 dB)
within 0.0006 dB at 48,000 Hz and 0.0007 dB at 44,100 Hz at all nine of their frequencies (measured).

## The checks and the breaks that each caught

Each break was made in a copy of the module (`TF2_DIR`), seen to fail, and dropped; the worktree's file was never
changed. The distances are the largest to the first reference over the nine cases (measured).

| Check | Break | What caught it |
| --- | --- | --- |
| 1. The vectors | the kernel computed exactly in place of the two stored tables (2.4e-6) | bit equality on every case; the second reference's 3e-6 does not |
| 1 | beta 10.0613 in place of 10, the code's formula at quality 30 (2.8e-4) | bit equality and 3e-6 on every case; row 0; check 2 |
| 1 | the phase read reversed, `L - 1 - p` for `p` (0.94); and `L - p` (0.94); nothing at 48,000 Hz | bit equality and 3e-6 at 44,100 Hz and every case with phases; checks 2, 3, 4 and 7 |
| 1 | the table read transposed, `table[q L + p]` for `table[p T + q]` (5.6); nothing at 48,000 Hz | bit equality and 3e-6 at 44,100 Hz and every case with phases; checks 2, 3, 4, 6 and 7 |
| 1 | each phase's row normalised to 1 (8.1e-6; nothing at 48,000 and 96,000 Hz, one phase) | bit equality and 3e-6 on the cases with phases; check 7's rows |
| 1 | the cutoff left unrounded (4.8e-7) | the cutoff itself, and bit equality only |
| 1 | the sum of one output in single precision (6.0e-7) | bit equality only |
| 1 | the table kept in double precision (1.2e-7) | bit equality only; check 7 (a stored row against one made as needed) |
| 1 | quality 15's share of the cutoff (0.069) | `H` and `T`, every sample, and checks 2, 3, 5, 6 and 7 |
| 1 | the phase one fine step off (0.78; nothing at 48,000 and 96,000 Hz) | every case with phases; checks 2, 4 and 7 |
| 1 | the kernel centred one input late (1.3) | every case; checks 4, 5 and 6 |
| 1 | the history before the start not zero, here the first sample repeated (0.13) | every case |
| 2. The gain | `gain()` read from another table (the kernel at a step 0.2% shorter, with the design's scale) | `gain()` against the vectors' figures (off by up to 0.79 dB) and against the tones through `convert()` |
| 2 | the window's length changed (31 zero crossings in place of 30) | `gain()` against the vectors' figures (−0.473 dB at 11,000 Hz, against −0.531); checks 1, 3 and 6 too |
| 3. Nothing folds back | the app's `resampleSinc` (copied from `engine/dsp.js`) as `convert()` | the tones (−12.42, −22.71 and −39.31 dB at 12,500, 13,000 and 13,500 Hz) and the sweep (22.2 dB under) at both rates, the order's figures; every other section too |
| 4. Whole against blocks | the kept history cut one sample short | every rate in blocks; check 6's impulses, whose source is long enough for the stream to drop what it holds |
| 4 | `push()` giving an output one input early | every rate with phases in blocks; check 5 |
| 5. What a stream holds back | outputs held one block longer | the count after each input at all four rates; the 8,000 Hz up-conversion's three outputs; `end()` after 1,000 inputs |
| 6. The start, the end, the level | `floor` in place of `round` in the length | `length(12345, 48000)` and the 44,056 Hz case's length |
| 6 | the first output not on the first input (its centre one input on) | the impulses, check 1 and checks 4 and 5 |
| 7. The two ways to hold a table | the unrated sum in single precision | the 44,056 Hz case and the 47,999 Hz tone (−0.01499 dB, against 0.00002 dB built; measured) |
| 8. At 24,000 Hz, and the interface | `convert()` at 24,000 Hz returning the array it was given | the copy check |
| 8 | `push()` at 24,000 Hz returning the caller's array | the copy check of `push()` |
| 8 | `push()` writing into the array it is given (its first sample set to 0) | the unchanged-input check; checks 4, 5 and 7 |
| 8 | a rate rounded up in place of to the nearest | 44100.4 Hz against 44,100 Hz |
| 8 | the kept designs never dropped | the oldest of three tables of 3,072,000 entries still given as the same object |

What each check holds, and against what:

1. **The vectors.** For each of the nine cases: `L`, `M`, `H`, `T`, the first cutoff and whether the pair is rated;
   the output's length; every sample against the first reference with `Object.is`; within 3e-6 of the second
   reference; for 48,000 and 44,100 Hz, row 0 bit for bit to the first table's and within 1e-6 of the second's.
2. **The gain.** `gain(48000, f)` and `gain(44100, f)` within 0.01 dB of the vectors' `gain_db` at the seven
   frequencies (built: 0.000, 0.000, −0.531, −1.805, −3.813, −9.173, −14.793 dB at both rates); a 1 s tone of 0.5
   through `convert()` at each, its amplitude fitted by least squares over 0.25 to 0.75 s, within 0.02 dB of
   `gain()` (built: under 0.0001 dB).
3. **Nothing folds back.** What lands at 24,000 Hz less the tone, by the same fit: −44.13 dB at 12,500 Hz at both
   rates (the vectors: −44.13 and −44.132), −102.44 and −104.32 dB at 13,000 and 13,500 Hz from 48,000 Hz, −103.58
   and −105.12 dB from 44,100 Hz (measured). The sweep from 12,000 to 13,500 Hz in 2 s: from where it passes
   12,700 Hz to 10 ms before its end, the output's rms is 80.9 dB under the sweep's at both rates (measured). The
   10 ms are left out because the sweep's abrupt end is a click, not a tone above 12.7 kHz (chosen).
4. **Whole against blocks.** The nine rates of the vectors, 24,000 Hz, and 44,100 Hz with `limit` 0, on 5,000
   samples: the plan 1, 7, 128, 3, 0, 511, 64, 2, 1,000 in turn and one sample a block each give `convert()`'s
   samples with `Object.is`. This holds the module to itself.
5. **What a stream holds back.** At 48,000, 44,100, 16,000 and 8,000 Hz (8,000 added: the up-conversion where one
   input gives three outputs), one input a push to 1,000: after every input the outputs given are exactly those
   with `floor(k M / L) + H <= n - 1`, counted by the test with `L`, `M` and `H` from the order's table, and they
   are `convert()`'s. `wait(48000)` is `63 / 48000` and `wait(44100)` is `58 / 44100`. At 8,000 Hz the 33rd input
   gives three outputs and none come before it.
6. **The start, the end and the level.** The impulse at sample 2,000 of 4,000: peak at output 1,000, not zero from
   969 to 1,031 from 48,000 Hz; 1,088 and 1,058 to 1,119 from 44,100 Hz (the order's figures). An impulse at sample 0
   peaks at output 0. A constant 0.25 where no tap reads past either end: within 3.0e-8 from 48,000 Hz and 1.04e-6
   from 44,100 Hz (measured). The order's four lengths; and every source of 1, 2, 3 and 1,201 samples from three
   rates gives `length(n)` outputs, an empty one none.
7. **The two ways to hold a table.** `design(44100, 0)` stores nothing and its 80 rows and its scale equal the
   stored design's bit for bit; `createStream(44100, 0)` gives `convert()`'s samples; a row made as needed is the
   one array, good until the next call. `design(47999)`: `L` 24,000, `M` 47,999, `H` 63, `T` 128, not rated, stored;
   a 1 kHz tone through it keeps its level within 0.001 dB (built: 0.00002 dB).
8. **At 24,000 Hz, and what the interface promises** (with the plan review's change 3). `convert()` returns a copy,
   equal and not the same array; `push()` at 24,000 Hz returns a copy, not the caller's array, and `end()` nothing;
   `wait` 0, `length(n)` n, `design` null, `gain` 1. `push()`, `end()` and `convert()` leave the array they are
   given unchanged at 24,000, 48,000, 44,100, 8,000 and 44,056 Hz, with the table stored and not. A rate of 44100.4
   gives 44,100 Hz's samples, wait, length and kept design. NaN, ±Infinity, 0, 0.5, −48,000, `'48000'`, null and
   undefined as a rate are a `RangeError` in every member. The kept designs' bound, shown by what `design()` gives
   again (no member made for the test): after three tables of 3,072,000 entries (computed: `L` 24,000, `T` 128),
   whose sum is over `2 x TABLE_LIMIT`, the newest two are given again as the same objects and the oldest is made
   anew.

The other edges the order gives the reviewer, checked too: `end()` with a count the stream has already given gives
nothing; `end()` gives the outputs not yet given up to its count in all; the refusals after `end()` and of a bad
count or phase.

No expected sample comes from the module: they are the vectors', the order's figures, or the test's own arithmetic
(the least-squares fit, the count of outputs a stream may give, the constant's level). Checks 4 and 7 hold the
module to itself and say so.

## Time

Measured on a shared four-core machine, Node 22.23.4, best of three:

| What | Time |
| --- | ---: |
| one minute of sound through `convert()` from 48,000 Hz | 0.33 s |
| one minute from 44,100 Hz | 0.31 s |
| the table for 47,999 Hz (3,072,000 entries) | 0.10 s |
| one second from 191,999 Hz, rows made as needed (12,000,000 entries; the scale's pass included) | 0.56 s |

The suite runs in about 1.5 s.

## The suites run

- `pnpm test capture-converter harness site`: the three passed (the last lines: "3 of 3 suites passed. 2.5 s
  summed").
- `python3 -I tests/capture-converter/make_vectors.py --check`: "vectors.json is what this script writes".
- `node tests/cache-number.mjs origin/main --report`: no cached file changed; the number stays v54.
- The whole `pnpm test` and the browser suite were not run on this machine: no file they load changed, and CI runs
  them all on the branch (below).

## CI

The `tests` workflow on the branch's head: see "CI's result" at the end, written after the push.

## The plan review's changes

The orchestrator sent the plan review's six changes for W3-26a while the build was under way (the order on
`main` `ef43a36`, "After the plan review", W3-26a). Each is in the build: the beta break made with 10.0613 (1);
the phase read reversed and the table read transposed, made at 44,100 Hz (2); check 8's additions, with the
bound shown without a member made for the test, so the `kept()` of the first build went (3); `gain()`'s formula
and `design(24000)` null (4); the order of adding called chosen, in the module's comment and here (5); the
standings above, in the module's comment and here (6).

A merge of `main` into the branch was made locally before that message came, then undone at its word ("do not
merge main into your branch"); it was never pushed. The order's file on the branch is the one at `0cff71e`.

## The scan

`git diff origin/main...HEAD` and the branch's commit messages were read for recordings, personal details, real
SteamIDs and model names: none, but the attribution trailer the session's instructions require on each commit.

## Not done

- W3-26b (the wiring, the profile, the words): another builder's, later.
- The kernel's argument never reaches 35 zero crossings, so the sinc table's last step is not exercised by any
  vector; the extra 0 entry is there so that it cannot read past the table.
