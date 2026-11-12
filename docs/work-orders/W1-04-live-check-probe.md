# W1-04: the live-recording check stops failing by chance

> **Status 2026-11-12: built and merged** at `4efb870` (pull request #4). Report: `docs/reports/W1-04-live-check-probe.md`.

**Branch:** `claude/w1-04-live-check-probe`, from `main`. **Worktree:** given in the brief. **Agent:** `tf-builder`
(a small order: effort high), then `tf-reviewer`. May push its branch to run CI. **Time budget:** 2 hours.

## Why

CI is the inspection for every order (`docs/PIPELINE.md`), and one of its checks fails by chance. On 2026-11-09 the
`tests` run on main for a docs-only commit failed (run 42707387145) at

    the recorded voice lines up with an offline render of the recorded microphone (peak at -330 samples, r 0.552)

while the same commit passed twice on its branch. One failure in eleven runs that day; the same check failed once
before, on another change that could not have caused it.

**The diagnosis, to confirm before changing anything.** The check (`verifyLiveMonitor` in
`tests/browser.verify.js`) records the live monitor for three seconds, renders the recorded microphone offline, and
takes the lag at the highest cross-correlation peak. The microphone is Chromium's fake device, which is believed to
emit a short tone beep about twice a second. A tone's correlation has a peak every period, nearly as high as the
true one. The live chain and the offline render legitimately differ in how they group those beeps into talk spurts
(the test's own comment says so: the beeps come about as often as the gate's hold), which changes the coded beeps
enough to bring the correlation down to about 0.55 and let a neighbouring period win. 330 samples is three periods
of a 400 Hz tone at 44.1 kHz. The alignment itself is not in doubt: `tests/verify.js` pins the live chain's delay to
the sample in Node, and on a fresh page the browser's peak sits at 0 (fractional 0.0 to 0.5 over several runs).

## Files

May touch: `tests/browser.verify.js` (the browser launch arguments, a helper that writes the microphone signal to a
temporary file at run time, `verifyLiveMonitor`, and any check whose expectation depends on what the fake microphone
plays), `README.md` (only the Tests list's sentence about the live monitor's fake microphone, if it changes).

May not touch: any file of the app (`audio.js`, `live*.js`, `app/`, ...), `tests/verify.js`, `docs/PROGRESS.json`.
W1-01 is editing other parts of `tests/browser.verify.js` (the offline cache list and the codec profile checks):
keep out of those so the two branches merge cleanly.

## Spec

1. **Reproduce first.** With the fake device as it is, measure the lag and the correlation of the check over at
   least 30 recordings (a scratch script that does only the live section is quicker than the whole suite; one is at
   the path the brief gives) and record the microphone's own signal: its tone, the beep length and spacing. Say in
   the report whether the diagnosis above holds, with the numbers. If it does not, stop and report what you found
   instead of building point 2.
2. **A probe without periods.** Launch Chromium with a microphone signal of our own
   (`--use-file-for-fake-audio-capture=<wav>`), written by the test to a temporary folder at run time (nothing is
   committed): broadband and speech-like (noise bursts with pauses, seeded, loud enough to open the gate, with
   pauses long enough that the gate closes between some of them), so that a cross-correlation has one peak. Check
   what the flag needs (sample rate, format, looping) against what Chromium does, not from memory.
3. **The check gets stricter, not looser.** With that probe the lag must be within one sample, and the correlation
   threshold goes as high as the 30 runs support with a clear margin (say what they gave). Update the comment above
   the check to what is now true.
4. **Everything else that hears the microphone still holds**: the live monitor's frames sent and Opus modes, the
   latency reading, low latency, push-to-talk, and the PCM recording check near the end of the suite. If an
   expectation depended on the beeps, change it to what the new signal gives and say so in the report.

Not in this order: any change to the app or to how the live chain lines its recording up.

## Done means

- The report has the lag and correlation over at least 30 recordings before the change (how many missed, by how
  many samples) and after it (all within one sample).
- The whole browser suite passes three times in a row:
  `flock /tmp/tf2ve-heavy.lock env CHROMIUM_EXECUTABLE=... node tests/browser.verify.js` (about 3 minutes each).
- The stricter check fails when the alignment is really off: shift the wet recording by 5 samples in a scratch copy
  of the test's evaluation and show it fails.
- `pnpm test` passes; CI passes on the pushed branch.
