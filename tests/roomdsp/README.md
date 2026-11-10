# The room DSP's reference

A second implementation of the engine's room DSP, in Python, written from the reads of the engine
(`docs/reports/W3-15-room-dsp.md`, `docs/reports/W3-17-room-dsp-second-read.md`,
`docs/reports/W3-17-amp-mdy-second-read.md`; the automatic room's build as corrected by
`docs/reports/W3-17b-second-read.md`: a shaft's classes and the blends of the other processor types). The
app's `room-dsp.js` (order W3-17) must give the same integers. These files are the orchestrator's: a builder
does not edit them.

- `room-presets.json`: the 46 presets the app can reach, as numbers (0 to 29 and the automatic room's 16
  templates), 5,515 bytes. Made by `convert.py` from the game's `scripts/dsp_presets.txt` (46,419 bytes,
  CRC-32 2441946680), which is not in this repository.
- `dspmodel.py`: the model. Integer arithmetic as read.
- `reference.py`: runs the model on fixed inputs and prints hashes (`reference.out`); with `--tails`, where
  each case's tail ends (`tails.out`). Needs Python 3 with numpy; reads only `room-presets.json`.

Not run by CI. The Node tests compare the app against the recorded hashes.
