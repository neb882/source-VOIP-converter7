# The read clock's reference

A reference generator of Steam's microphone reads on the rule as read (finding 28 of `tests/REFERENCE_2026.md`,
the paragraphs of 2026-11-20 and 2026-11-21), written for a private study of 2026-11-21 that scored the rule
against the sets. The app's `createClock` in `steam-sender.js` (named `createReadClock` by order W3-27a,
`docs/work-orders/W3-27-sender-clock.md`, and renamed by W3-27b) must give its reads to the last bit with the capture's place at 0.
These two files are the orchestrator's: a builder does not edit them. They are our own code and hold nothing of
the owner's files or logs.

- `gen.mjs`: the generator. `createReadClock({ seed, ... }).next()` gives `{ time, samples, by }`: the read's
  time in ms from the clock's start, the samples of the capture steps that became readable since the read
  before, and what ended the pass before the read. Run as a program it prints JSON (below). Its header names a
  `README.md` that is the study's private note; this file is not that note. Its options `frameJitter`, `fresh`,
  `recording` and `phaseCap` are the study's own and the app's clock does not have them. It has no limit on the
  steps a read brings, where the app's clock brings three at most.
- `vector-seed1.json`: 300 reads at seed 1, each as its time rounded to a thousandth of a millisecond, its steps
  and what ended the pass before it, after the options the generator ran with. Made by
  `node tests/steam-sender/gen.mjs 300 seed=1 > tests/steam-sender/vector-seed1.json`; its SHA-256 begins
  `a64fc17735f4dc63`.

`tests/steam-sender.verify.mjs` runs `gen.mjs` as a program and compares its output with the vector byte for
byte, so that the generator it holds the app to is the study's. It then imports `gen.mjs` and runs it beside the
app's clock in the same Node process, so that `Math.log` and `Math.cos` are the same on both sides; the vector's
rounded times alone would hold a port to 0.0005 ms only.
