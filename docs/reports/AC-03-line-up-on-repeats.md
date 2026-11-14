# AC-03: the line-up on repeated tone bursts, the builder's report

The builder's report of 2026-11-14 for [the order](../work-orders/AC-03-line-up-on-repeats.md). Branch
`claude/ac-03-line-up-on-repeats`, from `main` at `cdefc3f` (cache v51). The plan pass is
[AC-03-plan.md](AC-03-plan.md).

**Status:** built as the order's "The change" says, points 1 to 4. The order's check 2 fails on `main`'s
`reference.js` and passes on the branch. Every other stand-in piece, the committed recordings' line-up and the
browser suite's real-take sections are as on `main`. No take of the owner's was opened: the order's private check
is the orchestrator's and was not run.

## Commits

| Commit | What |
| --- | --- |
| `3315c6e` | the rule in `TF2Reference.track()` (`reference.js`); check 2 in `tests/reference.verify.mjs`; one clause in the `reference` row of `tests/README.md` |
| `5b8386d` | a second check in `tests/reference.verify.mjs`: a waveform place on bursts of noise still stands |
| the next to last | this report |
| the last | `origin/main` merged (`c464d53`, W3-23b's ruling: `docs/` only, no file of this order) |

## What changed, file by file

**`reference.js`, inside `track()` only.**

- `periodicAt8(a8, n8)`, beside `waveMatch`: how periodic the source is over `n8` samples at 8 kHz from `a8`, with
  `waveMatch`'s own sum (lags 16 to 400 in steps of 4, every second sample, twice the sum over the energy). It
  returns the energy with it. `waveMatch` now calls it; its arithmetic is the same, in the same order, so it gives
  the same numbers (the committed recordings and every stand-in below show that).
- `coarseWave` keeps each window's start with its delay, and returns `{ delay, tonal }` in place of the delay:
  `delay` is the median as before, and `tonal` says whether every window that agreed is periodic at 8 kHz above 0.9.
  The windows, `wideMatch` and the agreement rule are unchanged.
- In the spurt loop, after `env` is settled and before `if (wave === null && env.value < .5) return;`: when there is
  a waveform place, it is tonal, `env.value` is 0.5 or more, and the place lies more than 0.1 s from
  `delay + env.lag`, the waveform place is dropped. The envelope then places the spurt, with its prior and the
  weak-evidence rule. `env` is computed as before from the waveform result, so no spurt gets a different envelope.
- Comments in the file's style say what the lines do and why (beeps 0.5 s apart; at 2 kHz only a 1 kHz burst's
  clicks are left).

**`tests/reference.verify.mjs`,** beside the "spurt by spurt" checks, in a block of its own.

- Check 2, the beeps. The source is the first 12 s of the test signal, made in the suite with
  `tests/testsignal/make_testsignal.py`'s arithmetic (three 60 ms beeps of 1 kHz at −12 dBFS with 3 ms fades,
  0.5 s apart; 1 s of silence; 2 s each of 1 kHz at −60 to −36 dBFS peak), rounded to 16 bits. The guide and the
  take are the order's: the default render, and the render at seed 3 and 200 frames a second, put 2.07 s late on a
  clock 400 ppm off, 3 s longer, with low-passed noise and a little white noise at −47 dBFS rms. The check: two
  pieces within 80 ms of each other. The noise has its own seed, so the suite's shared generator, and every check
  after the block, is as before.
- A second check, the builder's (see "The breaks"): eight bursts of noise of 100 ms, 0.5 s apart, after a spurt of
  shaped noise; in the take the bursts come 0.5 s early. Their envelope repeats as the beeps' does, but each burst's
  waveform is its own: the pieces must read 1000 and 500 ms, within 0.5 ms. No render: the take is the source,
  scaled, with noise.
- Every line the suite printed before is printed the same, on `main`'s `reference.js` and on the branch's (the
  `main` copy of the suite was run against both and its output compared).

**`tests/README.md`:** the `reference` row says the real-take check now includes repeated tone bursts.

## Why the suite makes its own source

`tests/testsignal/tf2_voice_testsignal_v1.wav` is not in the repository (`.gitignore`; it is made by a Python
script that needs numpy and scipy), so a check that reads it cannot run on CI. The first 12 s of the signal use no
random numbers but the file's dither (two uniform draws a sample, from the generator after all the pink noise), so
the suite makes them without the dither. They differ from the file by one 16-bit step at most (in 186,050 of
576,000 samples, measured). What check 2 reads on each source (measured on the stand-in):

| Source | `main`'s `reference.js` | The branch |
| --- | --- | --- |
| the WAV, its first 12 s | 1576.0 / 2041.1 ms | 2082.5 / 2037.6 ms |
| the suite's, no dither (the check) | 1576.0 / 2032.1 ms | 2083.7 / 2036.5 ms |
| the suite's with a dither of my own seed | 2080.7 / 2039.1 ms | 2080.7 / 2039.1 ms |

So the fault on the WAV is reproduced by the undithered signal and not by a dither of another seed: whether it
happens turns on small things, as the plan pass found. The undithered signal fails at each of six noise seeds tried
(1576.0 to 1576.5 ms against 2031.4 to 2039.8 ms on `main`; 2080.5 to 2084.7 ms on the branch). 12 s was used, not
45 s. The suite ran in 24 to 26 s on this machine with other work on it (measured); before the change it ran in
22 s under the same load.

## The order's checks

1. `node --check reference.js`: no output. `pnpm test reference site`: both passed.
2. Check 2, as above. On `main`'s `reference.js` the suite stops at it: "AssertionError ... (1576.0 / 2032.1 ms)".
   On the branch: "ok ... (2083.7 / 2036.5 ms)". CI's `units` job printed the same figures.
3. The whole test signal (the WAV), the take at seed 6 and 300 frames a second, with the plan pass's stand-in
   script. Too slow for the suite (35 s), and the WAV is not on CI, so it is here. The pieces at 47.16, 57.16, 59.16,
   69.03 and 91.82 s read +305, −352, +330, −318 and −291 ms against the take's median of 2096 ms, on `main` and on
   the branch; the first two pieces read 2080 and 2073 ms on both. Every piece's `start`, `end`, `a`, `b`, `points`
   and delay printed at full precision is equal on both.
4. The committed recordings. The two clips from `node tests/recordings/make-inputs.mjs <scratch>` (their SHA-256
   equal the manifest's), each file rendered with its row's codec and `maxGain`, and `track()` with the render as
   reference and without. Every piece's `start`, `end`, `a`, `b` and `points`, as JSON: the output on `main` and on
   the branch is byte for byte the same (SHA-256 `ad830acb…4d88` both, and equal to the plan pass's output). The
   double-speed file gives "The take does not line up with the source closely enough to compare." on both, guided
   and plain.
5. The browser suite, on the branch and again with `main`'s `reference.js` in its place, each through the lock. Both
   passed. The lines of [Browser 3e] and [Browser 8f] are the same character for character (1 segment, 432.12 ms,
   106.4 ppm; 12 phrases, 3 joined the queue, phrases 5 and 11 early, 50 skips). The only lines that differ in the
   whole output are times in milliseconds of other sections.
6. The breaks: below.

`pnpm test` whole on the branch: see "The whole run".

## Every stand-in, `main` against the branch

The plan pass's stand-in script, the whole test signal (the WAV), each piece compared at full precision (measured
on stand-ins, not on a take):

| Stand-in | Pieces | What moved |
| --- | --- | --- |
| queue, seeds 1, 2, 5 and 6 | 24, 26, 22, 26 | nothing |
| seed 6, both on the file's own timing; seed 6's take on its own timing against the queue's guide | 18, 23 | nothing |
| the guide with three phrases moved by +316, +335 and −330 ms | 17 | nothing |
| seed 3 at 300, 400 and 67 frames a second | 21, 21, 23 | nothing |
| seed 3 at 200 frames a second, cut to 30 s | 2 | nothing |
| seed 1 with `avgGain` 0.5; seed 6 with noise at −35 dBFS and a slow wobble | 24, 24 | nothing |
| **seed 3 at 200 frames a second** | 22 | the first piece 1577.11 to 2085.19 ms; the second (the staircase) 2110.04 to 2113.12 ms |
| **seed 3 at 100 frames a second** | 23 | the first 1577.11 to 2085.32 ms; the second 2110.02 to 2113.24 ms |
| **seed 3 at 200 frames a second, cut to 45 s** | 4 | the first 1578.47 to 2086.41 ms; the second 2122.70 to 2125.64 ms |

In the three that moved, the second piece moves by about 3 ms, since its envelope search starts from the running
delay that the first piece sets; it has no waveform points either way. No piece after the second moves. The level
of the seed 3 stand-in at 200 frames a second went from 1.66 / 16.2 dB (rms / worst) to 1.14 / 9.4 dB, as the plan
pass found.

## The breaks

Each break was a one-line change to a copy of the branch's `reference.js`, put in place of the file and run.

| Break | What caught it |
| --- | --- |
| the 0.1 s limit set to 1 s | check 2: "(1576.0 / 2032.1 ms)" |
| `tonal` always false | check 2: "(1576.0 / 2032.1 ms)" |
| the rule without its tonal test (any waveform place more than 0.1 s from the envelope's is dropped) | the second check: "(1000.0 / 1004.8 ms)" |
| the tonal test's 0.9 set to 0.2 (windows that are not tones count as tonal) | the second check: "(1000.0 / 1004.8 ms)" |

The last two drop waveform places the rule should keep. Before the second check was added, neither failed anything:
`pnpm test reference` passed, check 3 printed the same pieces, and check 4's output was byte for byte the same. That
is why the second check is there. On `main`'s `reference.js` it passes (1000.0 / 500.0 ms), so it guards the rule's
limits rather than the fix.

## The whole run

`flock /tmp/tf2ve-heavy.lock pnpm test` on `5b8386d`: every suite passed, 1515.6 s summed, one at a time, on a
machine shared with another builder (measured). `reference` took 23.2 s in it.

## CI

The run on `5b8386d` (the branch's last commit outside `docs/`): `verify` success, every job a success. The run on
`3315c6e` was cancelled by the push of `5b8386d`. This report's commit changes only `docs/`, so it starts no run;
the result to read is `5b8386d`'s.

## The cache number

`node tests/cache-number.mjs origin/main --report` printed:

    cached files changed since origin/main (c464d53): reference.js
    cache number against origin/main (c464d53): the number is v51, not above v51: it must rise (node tests/cache-number.mjs origin/main --set)

The number is the orchestrator's to raise at the merge; `sw.js` is untouched.

## The scan

`git diff origin/main...HEAD` and the commit messages were read for recordings, personal details, SteamIDs and model
names: none, apart from the attribution trailer on each commit. No file of the owner's takes, no `bin-in` folder and
no game or Steam file was opened.

## What is not done

- The order's private check (the takes, both timings, `--seeds 9`, the eight pieces of 2 s). It is the
  orchestrator's. Until it runs, the fix is shown on stand-ins only.
- No figure in `docs/ACCURACY.md`, `tests/REFERENCE_2026.md` or `tests/predictions/` was touched, as the order says.
- The `reference` row's time in `tests/README.md` (19 s) was left as it was: the runs here were on a shared machine.
