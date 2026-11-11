# W3-19: the receiver gain on the decoder's own samples

Order of 2026-11-11. Small. To be built after W3-18 is merged (it starts from that `main`).

## What was measured

The game's receiver gain works in blocks of 128 samples, counted from the first sample the decoder
gives. The app's render drops the codec's delay first (64 samples for the two CELT profiles, 80 for
Speex: `lookahead`, so the output lines up with the input) and runs the gain on what is left. Its
blocks therefore fall 64 or 80 samples off the game's, and the first block's mean and peak miss the
dropped samples.

With `voice_maxgain 1` nothing shows (the gain is 1 everywhere). With the default 10 it does. The
game's recordings of its own gain's output, the app's whole render (`TF2Audio.process`, the gain's
output taken at `onGain`) against them, on the game's own captured input:

| Profile | Recording | `voice_maxgain 1` | `voice_maxgain 10` |
| --- | --- | --- | --- |
| `celt_22` | Set H | 158,384 of 158,385 samples that are not silence, at 64 samples' lag | 45,123 of 158,548 |
| `speex` (W3-18's build) | Set M | 145,840 of 145,840, at 80 samples' lag | 86,171 of 145,966, first difference at 5,681 |

The codec and the gain are each exact on their own: the decoder's whole stream from its first sample
through `receiverAutoGain` equals the game's `voice_maxgain 10` recording in every sample (Speex:
146,080 of 146,080; CELT: the gain rule on the gain-1 recording gives the gain-10 recording, W3-08).
Only where the render puts the two together is off.

## What to build

For the profiles on the frame path with an engine codec (`celt_22`, `celt_44`, `speex`), in the render
(`process`, `createRender`) and wherever else the same stage runs (the live chain, a demo's received
voice): the gain runs on the decoder's stream from its first sample, the delay's samples included, and
the delay is dropped after the gain. The output keeps its present length and alignment; only the gain's
block grid and its first block's contents move.

- The other profiles on that path (the Opus ones that are not Steam's) follow the same rule if it costs
  nothing; if they need a separate decision say so in the report and leave them. Steam's path
  (`steamTimeline`) is not touched: its gain already runs on the decoded packets.
- `decodedFromFrames` and the gate: a block is now a block of decoded samples, so its first sample's
  frame is found without the `lookahead` shift that the dropped delay needed. Work it through; the
  comment on the held gain ("an approximation of that timeline only") stays true and stays.
- Where the voice rate differs from the codec rate the resampler stands between decoder and gain. Keep
  the order of stages; say in the report what the grid is counted on there.
- With the gain off (`voice_maxgain` not applied: the `autoGain` false branch) nothing changes.

## Tests

- A test per engine profile: the gain's output from `process` (at `onGain`) equals, sample for sample,
  the decoder's whole stream (the vendored codec driven as the profile drives it, no gate, no loss)
  through `receiverAutoGain` with the delay dropped afterwards, at `maxGain` 10 on a test signal loud
  and quiet enough that the gain moves. Shown to fail on the present code.
- The same for `createRender` in pieces of odd sizes, equal to `process`.
- With `maxGain` 1: every recorded hash of the three profiles unchanged (if one moves, stop and say).
- The recorded hashes that do move (default gain, the three profiles) are re-recorded and listed, old
  and new, in the report. No hash of the `steam` profile or of any Opus profile moves unless the
  report says why.
- `sw.js` `CACHE` up by one. `npm run test:all` green.

## Docs

`tests/LEGACY_CODECS.md` and `tests/REFERENCE_2026.md`: one paragraph each (the table above may be
used). `docs/PROGRESS.json` is the orchestrator's. Report: `docs/reports/W3-19-gain-grid.md`.

## Afterwards (the orchestrator, privately)

The two rows above re-run: expected equal in every sample at both gains, bar the recordings' last
packet.
