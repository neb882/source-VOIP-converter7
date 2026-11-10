# W3-10: the output stage as the game's listener gets it

**Depends on:** W3-07's report (`docs/reports/W3-07-mixer-output.md`), and the receiver's orders W3-02c, W3-05 and
W3-06 being merged (each re-records golden hashes; this one re-records all of them once more, so it goes last).
**Kind:** code. Builder, then reviewer.

## Why

The model's last stage is a 3-tap filter `[0.1, 0.8, 0.1]` at 44.1 kHz, fitted to the roll-off above 12 kHz in
Set A. W3-07 read the engine and found no filter there. The game mixes at a fixed 44100 Hz and hands 16-bit sound
to the system's mixer, and the roll-off is that mixer's **linear interpolation from 44100 Hz to a 48000 Hz
device**. The evidence is in the recordings: flat tops stay exactly on the ceiling, and a 1 kHz tone has images at
2900 and 4900 Hz at −64 to −67 dB in five recordings from two PCs (linear interpolation predicts −65.4 and −66.2).
The fitted filter agrees with it within 0.1 dB up to 13 kHz, is 1.1 dB too bright at 18 kHz, and has no images.

## What to build

1. **The mix stage, as read.** After the receiver's gain: the voice enters the mix at 255/256, truncated toward
   zero (integer arithmetic on 16-bit values); clip at ±32767; multiply by `volume`; round to 16 bits. Replace the
   current order of operations only where it differs, and say in the report where it did.
2. **The device stage.** `engine.outputFir` goes. In its place `engine.deviceRate`, default 48000: the 44100 Hz
   result is converted by linear interpolation (output sample `n` reads position `n × 44100 / deviceRate` in the
   input, weights by the fractional part, phase starting at 0). With `deviceRate: 44100` the stage is absent.
   One implementation serves the offline render and the stream (`createRender`); the stream version must give the
   same samples at any chunking.
3. **What the page gives.** The downloaded file and the page's playback are at the device rate (48000 Hz by
   default). The advanced controls get one choice, "Listener's sound device: 48000 Hz (usual) / 44100 Hz", with
   one sentence of help saying what it does. Presets do not change it. The live chain already runs at the
   browser's rate: there, convert from 44100 Hz to the context's rate by the same rule when the context is at
   48000 Hz, and keep what it does today at other rates, saying so in the report.
4. **The meter, the views and the accuracy tools** read the rate from the render's result, not a constant. Find
   every place that assumes the render is 44100 Hz (`meter.js`, `app/`, `batch.js`, `tests/accuracy.mjs`,
   `tests/retiming.mjs`) and list them in the report with what each now does.

## Checks

- **Public, no private data:** a 1 kHz tone at 44100 Hz through the stage has images at 2900 and 4900 Hz within
  0.3 dB of −65.4 and −66.2 dB relative to the tone; a flat run of 4915 stays exactly 4915; a 44100 Hz device
  returns its input unchanged; the stream equals the offline result bit for bit at chunk sizes 1, 127, 512, 4096
  and seeded random sizes; the response at 13 kHz and 18 kHz is within 0.1 dB of sinc²(f/44100).
- **The builder runs** `node tests/accuracy.mjs --takes tests/realtake` if takes are present, else says it did not.
- **The orchestrator runs privately** the accuracy table on all 18 takes before and after, and reports the change
  per band above 10 kHz. Expected: no band worse by more than 0.2 dB, the 13 to 18 kHz bands closer.
- All golden hashes re-recorded in one commit, with the reason in the commit message. `sw.js` cache version up.

## Not in this order

The room and water DSP a voice passes through in the game (not in any take, a later choice). Surround speaker
configurations. The `volume` of the listener beyond what the page already offers.

## Files

`constants.js`, `audio.js`, `app/` (the control and the download), `meter.js` if it assumes a rate, `batch.js`,
`tests/` (a new `tests/output-stage.verify.mjs`, golden hashes), `tests/REFERENCE_2026.md` (the Model table's row
and the "Output stage" caveat), `sw.js`. Nothing else.
