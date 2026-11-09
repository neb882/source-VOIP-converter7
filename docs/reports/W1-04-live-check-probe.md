# W1-04 report: the live-recording check stops failing by chance

**Branch:** `claude/w1-04-live-check-probe`. **Files changed:** `tests/browser.verify.js`, `README.md` (the Tests
list's line on the live monitor), this report.

## Summary

The diagnosis holds. Chromium's fake microphone plays a 400 Hz square-wave beep, 20 ms long, every 500 ms. In about
one recording in four the live chain and the offline render code the beeps differently enough that the
cross-correlation drops to about 0.55, and the peak three tone periods away (-330 samples) comes within 0.005 of the
true one. In one of those recordings it came out higher, and the check failed exactly as it did on main in CI. The
browser suite now writes its own microphone signal to a temporary folder at run time. The signal is seeded noise
bursts with pauses, and Chromium plays it through `--use-file-for-fake-audio-capture`. Over 32 recordings the peak sat
at 0 samples every time, with r 0.874-0.909. No other lag within ±300 ms came above 0.075. The check now asks for a
lag within one sample (it allowed ±4) and r > 0.8 (it was 0.3). A new check fails if the microphone is playing
Chromium's beep and not the probe.

## 1. Reproduction with the fake device as it was

Method: a scratch script that does only the live section on a fresh page, 32 times. It turns the monitor on, runs the
suite's low-latency and push-to-talk steps, records for 3 s, and evaluates the recording with a copy of the suite's
own code (FFT cross-correlation, peak within ±300 ms, r). It also reports a fractional lag (parabolic, around the
integer peak) and the best correlation at any lag more than 20 samples from zero. The device rate was 44.1 kHz.
Chromium 153 (this machine's), headless, run under the heavy lock.

**The microphone's own signal**, from a recorded dry track:

| | measured |
|---|---|
| waveform | unipolar square wave: samples exactly 0 or 1.0 (full scale), 55 samples high, 55 low |
| tone | period 110.14 samples at 44.1 kHz = 400.4 Hz |
| beep length | 8 pulses: 18.7 ms from the first rise to the last fall (a 20 ms beep) |
| spacing | 500 ms, with single gaps of 490 and 510 ms (10 ms buffer jitter) |

So the beeps come about as often as the gate's 440 ms hold plus its 120 ms pre-roll. And 330 samples is three
periods (3 × 110.14 = 330.4).

**Lag and correlation, 32 recordings, before:**

| group | runs | r at the peak | best r at other lags (where) | integer peak | fractional peak |
|---|---|---|---|---|---|
| beeps coded alike | 9 | 0.922-0.949 | 0.703-0.782 (±110, one period) | 0 | 0.07-0.47 |
| | 14 | 0.852-0.880 | 0.723-0.775 (±110) | 0 (8), 1 (6) | 0.14-0.51 |
| beeps coded differently | 9 | 0.550-0.556 | 0.550-0.553 (-330, three periods) | 0 (8), **-330 (1)** | 0.27, and -330.49 |

- Misses: **1 in 32**, by **-330 samples** (r 0.550 there, 0.547 at 0). In the other eight runs of that group,
  r at 0 beat r at -330 by only 0.003 to 0.005.
- Under the old tolerance (±4.4 samples at 44.1 kHz) the other 31 passed. The 6 runs that peaked at +1 have
  fractional lags of 0.50-0.51, so the true lag sits on the boundary between 0 and 1, as the old comment said.
- The live monitor's other readings in these runs: latency 220-240 ms, every sent frame hybrid.

The diagnosis in the order is confirmed: a tone with a peak every period, a correlation brought down to about 0.55 by
the two chains grouping and coding the beeps differently, and a neighbouring period winning by chance.

## 2. The probe

`wavProbe()` in `tests/browser.verify.js` writes 12 s of 16-bit mono PCM at 48 kHz:

- seeded noise "syllables" of 80-380 ms with a sine-root envelope, each with its own spectral tilt (a one-pole
  low-pass, coefficient 0.05-0.30, plus a little white noise), at about -20 to -30 dBFS per 20 ms frame. The gate
  opens at -39.5 dBFS.
- pauses of 50-300 ms, and about one time in three 600-1000 ms, which is longer than the hold plus the pre-roll. In
  the 12 s file the gate closes 7 times in 17 pauses. The longest pause is 0.98 s.
- a floor of seeded white noise at about -70 dBFS, below the gate, so no stretch of a recording is digital silence.
- 224 of the 600 frames are above the gate threshold. The peak is 0.31.

`main()` writes the probe to `fs.mkdtempSync(os.tmpdir() + '/tf2ve-mic-')` before the launch, passes
`--use-file-for-fake-audio-capture=<file>` alongside the two existing fake-media flags, and removes the folder in the
`finally`. Nothing is committed.

**What the flag does, measured, not assumed** (Chromium 153 here; CI's pinned Chromium 149 gave the same probe
samples, see CI below):

| question | test | result |
|---|---|---|
| does it replace the beep? | the probe file, dry recording | yes: samples from -0.32 to 0.27; no 0/1 square wave |
| sample rate | a 1 kHz sine at 48 kHz, device at 44.1 kHz | resampled: it plays at 998-1000 Hz, not at 918.75 Hz (unresampled) |
| | the probe at 48 kHz vs at 44.1 kHz | the 44.1 kHz file arrives sample-exact (correlation 1.000 with the file); the 48 kHz file correlates 0.983 with a linear resampling of itself |
| looping | a 1 s file with a 50 ms marker | the marker recurs every 1001.4 ms: it loops by default |
| where it starts | the probe, dry recording | each `getUserMedia` starts the file from the beginning (the recording 0.5 s in matched the file at 1.54 s, about 1 s after the monitor started) |
| format | 16-bit PCM mono WAV (format 1) | accepted |

The probe stays at 48 kHz like the suite's other fixtures, so Chromium resamples it to whatever rate the device runs
at. Looping is harmless: the file is 12 s long and the search window is ±300 ms.

## 3. After: the same 32-recording measurement with the probe

To cover different stretches of the probe, each run waited a further (run mod 8) × 0.7 s before recording.

| group | runs | r at the peak | best r at other lags | integer peak | fractional peak |
|---|---|---|---|---|---|
| all | 32 | 0.874-0.909 (median 0.886) | 0.036-0.075 (at lags such as ±21, 611, -543, 1986) | **0 in all 32** | 0.00-0.04 |

The correlation now has a single peak. The next best is less than a tenth of it, and the integer peak sits where the
fractional estimate says the true lag is (0.00-0.04 samples).

**The stricter check:** `Math.abs(take.lag) <= 1 && take.r > 0.8`. The lowest r in 32 recordings and in the 7
whole-suite runs (local and CI) was 0.873. A threshold of 0.8 leaves a margin of 0.07, twice the spread of the 32
runs (0.035). It is still far above anything a neighbouring lag gives (0.075). The comment above the check now says
what is true: the correlation range, the single peak, the fractional lag, and why the beep was dropped.

**The probe guard:** `the fake microphone plays the noise probe, not Chromium's beep` checks that the recorded dry
stays below 0.5 and goes below -0.1. The beep swings from 0 to full scale, so if a Chromium build ever ignores the
flag, this check says so instead of the lag check failing one time in thirty.

## 4. Everything else that hears the microphone

None of these depended on the beeps. All pass with the probe, unchanged:

| check | with the probe (local suite / CI) |
|---|---|
| frames sent, hybrid mode | 71 of 74 frames sent / 68 of 71, all hybrid |
| reported latency (130-600 ms) | 231 ms / 234 ms |
| low latency (< 20 ms chain delay) | 11.8 ms / 11.8 ms |
| push-to-talk | 0 frames sent while released, then sends |
| PCM recording (0.5-3 s, power > 1e-8) | passes. The probe's floor alone gives a power of about 8e-8, and no pause is longer than the 1.1 s recording |

## Done means

**Before/after over at least 30 recordings:** sections 1 and 3 (32 each). Before: 1 miss in 32, by -330 samples.
After: 32 of 32 at 0 samples.

**The whole browser suite three times in a row** on the final code (after merging main):
`flock /tmp/tf2ve-heavy.lock env CHROMIUM_EXECUTABLE=... node tests/browser.verify.js`

```
run 1 exit 0
  ok    the fake microphone plays the noise probe, not Chromium's beep   [samples from -0.32 to 0.27]
  ok    the recorded voice lines up with an offline render of the recorded microphone, within a sample   [peak at 0 samples, r 0.875]
170 browser checks passed
run 2 exit 0
  ... [peak at 0 samples, r 0.874]
170 browser checks passed
run 3 exit 0
  ... [peak at 0 samples, r 0.874]
170 browser checks passed
```

Three earlier runs, before the merge, also passed (r 0.874, 0.875, 0.873). Each run took about 35 s on this machine.

**The stricter check fails when the alignment is off.** I took a scratch copy of the whole suite (outside the
worktree) and shifted the wet recording by 5 samples in the evaluation (`wet[i] = processedBuffer[i - 5]`):

```
  ok    Record loads the live session into the app as a dry/wet pair with its codec lane   [3.0 s]
Error: the recorded voice lines up with an offline render of the recorded microphone, within a sample (peak at 5 samples, r 0.874)
```

The scratch evaluation script, two recordings for each shift: +5 → peak at 5, fails; -5 → peak at -5, fails; +2 →
peak at 2, fails. The old tolerance would have passed +2.

**The probe guard fails without the probe.** A scratch copy of the suite with the flag removed:

```
Error: the fake microphone plays the noise probe, not Chromium's beep (samples from 0.00 to 1.00)
```

**`pnpm test`** (after merging main): exit 0. The last lines of each suite: `209 passed, 0 failed`,
`119 Opus checks passed`, `40 paired-reference checks passed.`, `66 passed, 0 failed`, `23 passed, 0 failed`,
`45 video checks passed`, `17 demo checks passed`.

**CI:** run 21 (`tests`, head 27b9648, the probe commit) passed, using CI's pinned Chromium. Its live section:
`the fake microphone plays the noise probe, not Chromium's beep [samples from -0.32 to 0.27]` and
`peak at 0 samples, r 0.875`, `170 browser checks passed`. So the flag behaves the same on Playwright's pinned build.
The runs for the merge and report commits are given in the hand-off summary.

## Not done, and uncertain

- The measurements ran on fresh pages. The suite's page has done a lot of work before the live section. The 6
  whole-suite runs and CI gave r 0.873-0.875, inside the measured range, but each suite run records about the same
  stretch of the probe.
- The 1 kHz sine at 48 kHz played at 998.1 Hz, and the marker at 999.7 Hz. Chromium's file source runs about 0.03-0.2%
  slow here. This does not touch the check, which compares the recorded microphone with its own render.
- No app file, `tests/verify.js` or `docs/PROGRESS.json` was touched. The offline cache list and the codec profile
  checks (W1-01's parts) were left alone.
- Before the final push I scanned the diff and the commit messages for recordings, personal details, real SteamIDs and
  model names. Only the required trailer lines are there.
