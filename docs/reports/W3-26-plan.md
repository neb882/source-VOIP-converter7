# W3-26, the plan: what was read and tried

The order is `docs/work-orders/W3-26-capture-conversion.md`. This report says what the planner read, built and
measured to write it, at `main` `8969238` (cache v54), on 2026-11-20 and 2026-11-21. No recording of the owner's
was opened, and no file of the game, of Steam or of Windows. Every figure here is of the model or of the two
readers' converters, unless it is quoted from the record.

## What was read

- `CLAUDE.md`, `docs/PIPELINE.md`, the open question of `docs/PROGRESS.json` that begins "The capture's
  conversion to 24 kHz", and in `tests/REFERENCE_2026.md` findings 14, 16 and 28 (the three paragraphs added late
  on 2026-11-20) and the Model table.
- The code: `constants.js` (`captureEq`), `engine/dsp.js` whole, `engine/codec.js`, `engine/steam.js`
  (`steamCapture`, `steamModules`), `engine/render.js` stages 1 to 3, `engine/render-stream.js`'s stages, and
  `engine/live-chain.js` whole; `steam-sender.js`'s head; `filerate.js`'s head; `tests/lib/engine.cjs`.
- The two readers' converters, `winsrc.py` and `src2.py`, with their self-test and their comparison.
- The tests that name `captureEq` or record a hash of a `steam` render, and the documents that describe the
  fitted filter.

## What was built, in a scratch folder

- A JavaScript port of the converter at quality 30 (about 150 lines), written from the two references.
- `tests/capture-converter/make_vectors.py` and `vectors.json`, which are in the worktree with copies of the two
  references, for the orchestrator to commit or not.
- A copy of the tree with the port wired into the render, the stream and both live chains, and `captureEq`
  taken out. Four lines of three suites were changed so that they could run: `tests/verify.js` (the filter's
  points as a literal), `tests/steam.verify.js` (a one-tap filter and a delay of 0 in the test's own capture) and
  `tests/gain.verify.mjs` (the test's profile without `capture`).

## What was measured

### The port against the references

- The two references agree with each other to 1.6 parts in a million of full scale in the output and 7 in 10
  million in the tables, over eight rates (measured; the record has 1.1 and 5 from two rates).
- The port equals the first reader's converter **bit for bit** on all nine vectors, once it takes that reader's
  grid for the stored sinc table (`x = 35 k / 16384`). With the second reader's grid it was within 2.4 parts in
  10 million of the first and bit-equal to neither. So the order holds the port to the first reference to the
  last bit.
- The ten breaks of the order's list were tried against the vectors. Each moved at least one output. Three move
  it by less than the two references differ (the cutoff left unrounded, one output's sum in single precision, the
  table in double precision), which is why a tolerance alone would not do.
- A single-precision sum over a table far larger than Windows stores drifts: the gain at 1 kHz is 0.001 dB high
  at `L` = 3,000 and 0.015 dB low at `L` = 24,000. The order sums such tables in double precision.

### The size of the change

On `tests/testsignal/tf2_voice_testsignal_v1` (142.9 s, 48 kHz):

| Where | Band | The difference, below the signal | The level's change |
| --- | --- | ---: | ---: |
| the capture at 24 kHz, before the 16 bits | 0 to 10 kHz | 99.0 dB | 0.000 dB |
| | 10 to 12 kHz | 21.0 dB | +0.13 dB |
| | 11 to 12 kHz | 17.7 dB | +0.21 dB |
| the render, either timeline | 0 to 10 kHz | 14 dB (the codec's choices differ) | +0.004 dB |
| | 10 to 12 kHz | 8 dB | +0.26 dB |

The order has the gains by frequency. Below 11.25 kHz the two captures are within 0.15 dB of each other; from
11.45 to 11.95 kHz they differ by 0.45 to 1.1 dB, the converter higher up to 11.75 kHz and lower at 11.95; a
12.5 kHz tone comes through 29 dB lower and a 13 kHz tone 80 dB lower.

The record says the two are within 0.1 dB below 12 kHz in its own measure (noise through the codec, by band).
The planner's figures are of single tones before the codec and are larger. Both can hold; neither was checked
against the other.

**One thing that looks like a fault and is not.** At the default seed the 11.5 kHz tone segment came out 10.8 dB
higher and the 12 kHz tone 26.7 dB higher. The cause is the codec, not the capture's gain: these tones are sent
as a mix of coded and DTX frames, and which frames are coded changes with the sender's clock. Over six seeds on
`main` the same segments already run over 11 dB and 41 dB. The accuracy suite's median over seeds is the measure
for these segments.

### The live chain

`stats.latencyMs` falls by 4.646 ms at 48 kHz (206.898 to 202.252) and by 4.643 ms at 44.1 kHz (206.875 to
202.232). The saving of low latency and the cost of the queue do not move. The chain's output still lines up
with the render with no delay of its own.

### The suites

The prototype through `pnpm test` (the browser suite not run):

- Passed with no line changed: every suite of the group `units` but `gain`, among them `reproduce`,
  `recordings`, `opus`, `demo`, `steam-sender`, `swresample` and `voice-channel`.
- `verify` and `gain` passed after the changes named above.
- `steam`: one check failed, the pinned `latencyMs`.
- `render-channel`: three checks failed, each a comparison with hashes recorded from `main` (the live chain's
  three `steam` settings, one render on the queue at 66.67 frames a second, eight renders that end in silence).
- `render-stream`: the recorded hashes of 50 cases move, the cases that run Steam's sender with the codec on
  and the test's copy of `steam` on the frame path. 35 cases do not: every other profile, `steam` with the codec
  switched off, the empty and the gated sources, and a demo's voice. Every check of the stream against
  `process()` passed, at eight source rates.
- `stages`: only the checks that read those 50 hashes from the stream suite.

The moved cases were read off the failed checks. The planner started `--hashes` on both trees and stopped it for
time; the order asks the builder for both outputs.

## Choices made in the order

- **The length of a finite source** stays the app's, `max(1, round(N L / M))`, so that no length after the
  capture changes. The two references each end elsewhere.
- **A source at 24 kHz passes untouched.** Today it runs the fitted filter.
- **The codec switched off keeps the app's resampler**, as it skipped the filter.
- **The key is a member of the profile** (`capture`), not the rule `'steam'`, so that the frame path of a test's
  copy of `steam` can run behind the converter and "which profiles" is one line of `constants.js`.
- **A module at the root**, like `steam-sender.js`, not a part of `engine/`: its suite needs no engine, and
  W3-26a touches no list.
- **Two orders.** The module is decided by its vectors and can be built on the builders' model with a reviewer.
  The wiring changes renders and needs the second reader.
- **Quality 30 only.**

## Open questions for the orchestrator

1. The six rulings at the order's end.
2. The accuracy suite was not run: the planner has no recordings. The order gives the expectation and the
   thresholds for a finding.
3. The record's "within 0.1 dB below 12 kHz" against this report's tone gains (above): a line in the record
   could say which measure each is.
4. Whether `docs/owner-runs.md` should ask for a take through a device at 44.1 kHz and one below 24 kHz, once
   `mic_outputfile` is in hand: the rule for those rates is read and never measured.

## What was not done

- The browser suite was not run on the prototype. It holds no hash of a `steam` render and no figure of the
  filter (searched); its latency checks are bounds that 202 ms meets.
- `tests/accuracy.mjs`, `tests/retiming.mjs` and the page's real-take check: no recordings.
- The prototype is not the order's code. It has no error handling and its interface differs from the order's.
- The second evaluator (qualities under 20) was not ported.
