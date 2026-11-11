# W3-19: the receiver gain on the decoder's own samples

Order: `docs/work-orders/W3-19-gain-grid.md`. Branch `claude/w3-19-gain-grid`, from main at W3-18's merge.

## What changed

For the frame-path profiles with an engine codec (`celt_22`, `celt_44`, `speex`) with the gain on, the receiver gain now runs on the decoder's stream from its first sample, the codec's delay included, and the delay is dropped after the gain. Before, the delay was dropped first. Output length and alignment are unchanged; the gain's block grid and its first block move.

- `opus-codec.mjs`: `celtRoundTrip` and `speexRoundTrip` also return `head`, the decoded stream's first `lookahead` samples, which the trim drops from `samples`. `samples` and `info` are as before (no codec hash moved).
- `audio.js`:
  - `gainLead(codec, lookahead)`: the number of samples the gain runs on ahead of the render's first. It is the lookahead for a profile with `codec.engine`, and 0 for every other profile. An engine profile whose voice rate differs from its codec rate, or that has a decoder EQ, is refused with an error. No shipped profile is like that.
  - `process()`: `head` is put in front of the decoded samples, the voice-rate resampler runs (an identity for these profiles), then `receiverAutoGain`, and the first `lookahead` samples are sliced off. `decoded()` is built with lookahead 0.
  - `createRender()`: `codecStage` takes a `lead` and gives `length + lead` samples, frame f at `f * size - lookahead + lead`. The sinc stage is given the longer length, the gain runs, and a new `dropStage(lead)` removes the lead before `onGain` and the mixer. `decoded()` is built with lookahead 0.
- Unchanged: the gain off (the `autoGain` false branch), the Opus profiles of the frame path, Steam's path (`steamTimeline`), a demo's received voice, and the live chain.

## Where the same stage runs

- **`process`, `createRender`:** changed, as above.
- **The live chain (`createLiveChain`, frame path):** already right, so nothing changed. It never drops the codec's delay: decoded frames go straight to the decoder EQ (none here), the voice-rate resampler (an identity here) and the gain. Its `decoded()` reads frame `floor(m / frameSize)` with no shift, and its output is the input `contentDelay` later, the lookahead included. Its gain has always counted blocks from the decoder's first sample.
- **A demo's received voice (`opts.received`):** already right, so nothing changed. `demo.js` decodes the demo's packets without trimming any delay, and `receivedCodecInfo` reports lookahead 0. The gain runs on the decoder's samples as laid on the demo's timeline.
- **Steam's path:** not touched.

## The Opus profiles left as they were

`steam_48` (and any Opus profile on the frame path) keeps the delay dropped before the gain. Its delay is 312 samples at 48 kHz, which is not a whole number of samples at its 44.1 kHz voice rate. Dropping it after the resampler and the gain would move the output's alignment by a fraction of a sample or change how it is resampled. That needs a decision of its own, so these profiles are left alone. No `steam` or Opus hash moved.

## The grid where the rates differ

All three engine profiles have a voice rate equal to their codec rate (22050, 22050, 11025). The resampler between decoder and gain is kept in the code's order, but it passes the samples unchanged. The gain's grid is therefore counted on the decoder's own samples: gain sample m is decoder sample m. For an engine profile whose rates differed, the delay could only be dropped after the gain if `lookahead × voiceRate / codecRate` were a whole number. No profile is like that, so `gainLead` refuses one with an error rather than pick a grid.

## What `decoded()` means on the gated path now

The gain's sample m (since rates are equal, decoder sample m) is in frame `floor(m / frameSamples)`. A block whose first sample is m belongs to that frame. If the frame's log code is 0 (gated, nothing sent) and the block is all zeros, the gain is held. Before, the gain's sample m was decoder sample `m + lookahead`, so `decodedFromFrames` was given the lookahead. Both readings name the same frame for the same decoder sample; what moved is where the blocks start.

Whether the frame mapping can change the output:

- **`celt_22`:** frames (512) are a multiple of the block (128) and the delay (64) is under a block, so `floor(m / 512)` and `floor((m + 64) / 512)` agree at every block start. Reading it wrongly could not show.
- **`celt_44`:** `floor((m + 128) / 1024)` differs from `floor(m / 1024)` at one block start in eight.
- **`speex`:** frames are 160, so blocks starting 96 or 128 samples into a frame end in the next frame, and the two readings differ there.

A test (below) builds such a Speex case and shows the reading decides the output.

The comment on the held gain in `gainRule` ("an approximation of that timeline only") is unchanged and still true: the app's blocks still run over the timeline with zeros where the gate sent nothing.

## Read differently from the order, or not done

- **`celt_44`'s delay is 128 samples, not 64.** `cc_mode_overlap` of the 44100 Hz mode with 1024-sample frames is 128. `LEGACY_CODECS.md` already says "the delay of 128 samples". That is one whole block, so `celt_44`'s blocks already fell on the game's. Only its first blocks change: the old gain's state lagged the new one by a block, and the two agree from the third block on. In the tests' ungated case, 255 of 66,150 gain samples differ. Set H has no `vaudio_celt_high` recording at `voice_maxgain 10`, so the order's table does not cover it.
- **The order's "every recorded hash of the three profiles at `maxGain` 1".** No recorded render of these profiles was at `voice_maxgain` 1. Before the change, I added five cases to `tests/render-stream.verify.mjs` and recorded their hashes with the code before the change, in a commit of their own: `voice_maxgain 1` on each profile, and the gain off on `celt_22` and `speex`. Run that way, the suite passed 520 checks with none failing. None of the five moved.
- **`tests/predictions/PREDICTIONS.md`.** The order does not name this file, but CLAUDE.md's hard rule asks for a note when a hashed model file (`audio.js`, `opus-codec.mjs`) changes after registration. P1 and P2 render the CELT profiles at `voice_maxgain 10`. I added the note in the docs commit. I did not measure what moves in those predictions, since that needs the test signal. If the note should come from the orchestrator instead, the paragraph can be dropped.
- **README.md:** one sentence added to the receiver's gain bullet.
- **The private re-run** of Sets H and M against this build is the orchestrator's. The docs say it is pending and claim no figure for it.

## Tests (each shown to fail on the code before the change)

`tests/gain.verify.mjs` section [4b], 18 checks.

For each engine profile, on 3 s of loud and quiet tones from the first sample at 48 kHz, `voice_maxgain 10`, no gate and no loss:

- `process()`'s gain output (at `onGain`) equals, bit for bit, the bundled codec driven frame by frame (`createCeltStream` / `createSpeexStream`) over the whole stream, through `receiverAutoGain`, with the delay dropped after.
- A precondition: the gain moves on this signal (over 1,000 samples under the cap and over 1,000 at it), and the old order of stages gives other samples (27,224 / 255 / 14,601 differ).
- `createRender`, pushed in pieces of 1, 7, 333, 4097, 129, 1021 and 12345 samples, gives `process()`'s gain output and samples.

With the gate on (`celt_22`, `speex`, threshold -12 dBFS over a -18 dBFS floor):

- The same equality, with the reference's gated frames as zeros, a restart per spurt, and `decoded()` at `floor(m / frameSamples)`.
- The old order of stages gives other samples.
- `createRender` in pieces gives the same output.

A Speex case at 11025 Hz where the reading of the frame decides the output:

- The gate's hold ends with frame 40, and the block at decoder sample 6528 (128 samples into that frame) is zeros. Read as frame 40 (sent), the rule runs that block. Read 80 samples on (frame 41, gated), the gain would be held.
- The checks: the case is as described; the output matches `floor(m / 160)` and not `floor((m + 80) / 160)` (16 samples differ); `createRender` matches.

With the gain off (`celt_22`): the gain's place holds the decoder's stream with the delay dropped, clipped.

Failing on the code before the change (`TF2_DIR` pointed at an export of main at W3-18's merge): 6 checks. These are the three ungated equalities, the two gated equalities and the frame-reading case. The other checks of the section pass there too, as they should: the precondition checks, and the `createRender` = `process` checks, which held before as well.

Mutations, each run with `TF2_DIR` at a mutated copy:

| Mutation | Checks failed (of 88) |
| --- | --- |
| `process`'s `decoded()` given the lookahead again | 2 |
| `createRender`'s `decoded()` given the lookahead again | 1 |
| `createRender` without the `dropStage` | 6 |
| `codecStage` keeping the old placement (shift = lookahead) with the longer length | 6 |
| `process` slicing the lead off the end instead of the front | 12 |
| `celtRoundTrip` not filling `head` | 4 |
| `gainLead` applied to every profile | the suite stops on the guard's error (`steam_48`) |

The same mutation in `speexRoundTrip` fails nothing, and is equivalent: a reset Speex decoder's first 80 samples are exact zeros (checked), so the head is always zeros.

## Hashes

Before re-recording, I ran every suite once on the change. The only failures were 20 checks in `tests/render-stream.verify.mjs`:

- the WAV and gain-output hashes of the nine cases below;
- two checks that compare `celt_22, gate on, loss 15%, jitter 300 ms` with its recorded WAV: the engine loaded in a vm context, and the render with the room module absent.

All are renders of the three profiles at the default gain. On that first run four suites (reference, formats, video, demo) could not start, because the worktree had no `node_modules`. After `pnpm install --frozen-lockfile`, they and the vendor check passed with nothing failing. Every other suite passed: verify.js 214, gain 88, gain-exact, opus 147, speex102 86, filerate 53, meter 50, output-stage 102, voice-channel 129, steam-sender 109, swresample 43, room-dsp 216, browser 246.

No `codecInfo` hash moved. These did not move:

- `celt_44, gate on, loss 15%`: a whole-block delay, and the gate holds its first frames back.
- `celt_22, one sample` and `speex, 100 samples`: shorter than a block.
- The five `voice_maxgain 1` and gain-off cases.
- Every `steam`, `steam_48` and test-profile case.

Re-recorded (old, then new):

| Case | Hash | Old | New |
| --- | --- | --- | --- |
| `celt_22` | WAV | `c95ee49ed8fdf4e95b19ba10628e33404024690e9741221da39f84352cbfaa06` | `8cc3cb51c948a21b6257e07495b5ce2ccb9871297d43561431d7b2ab4baf9142` |
| | gain | `21aed940ff7c26e1d4e7042c4352b2dc04319d4e55328d011203cafc96841152` | `0f1760425be904c6c334a026621ed737ddbcec4f384e90dc783b5cf16a75ce23` |
| `celt_44` | WAV | `c428ba4428a08e3ed68cae499768bcead1a96fa00fcae340da82470451524817` | `130a4e3a0116fc955eb639ecf931bde8558bf4552ecfa4134bad2d5614d8818f` |
| | gain | `3ddd31b3aaf82ab940d5cdbed58056ea89819b43097a04bc7c776f03eb342837` | `c4fe90a8e00da5bf319fb21c1ed8ddc40f5e93f5dbf5935baf64e1e52c280fe6` |
| `speex` | WAV | `7e751d8d909b3112de67799933a4a473214d1bcf9c6517b9a6b72bda0c28527b` | `f93a46c4fb737c9121dd498cfc27c7723d8041ee4569f73ba941e88d7842c304` |
| | gain | `a6d43597874c63208c3a1c0f6f22dcbc62fa1b7e7f3b8ebf954c59e0c5223f45` | `1bdccfbdf42abf0fa3d4761d82ecb013904232facb91ebb609e355486e1e10f8` |
| `celt_22, gate on, loss 15%, jitter 300 ms` | WAV | `bc09cb2c057fda5c64a19ba17bda6fdf1d3ab4b06bc84434cecbe47030f1bccf` | `302c6f9610826f85d913b4351aa261f4e4f7055003d12b0f8fab38b92c933012` |
| | gain | `eb7d94043f8200262342124bd60b0d620cc82028c9de80df28b836b7b5531146` | `49d594aa6f0caa9490066ed6ae1742c15063326002cd8836fd9d88f07c300f11` |
| `speex, gate on, loss 15%, jitter 300 ms` | WAV | `d2af002b37a3c6cb078d79360f987b9eb963dff8a26d3b7ed2342f6d1b715c8a` | `732897e85b9c12b748c4436f405a8495221a1094b253232696a8f229b4a5706e` |
| | gain | `2384307010f3976b4108bbe96d29c4dbf6201904b726b5b79679cad5108bc3bb` | `e7bfb2524f39f29b794443969bab51d41b797aacc4254d735d3803c768fa6aa1` |
| `celt_22, source at 22.05 kHz` | WAV | `4f167c9146b722d5958b5fc8d882e80901da82bd19aa5aae8e7539e4fb4d8b0c` | `1befc25d8d501cc74b1de048bf577f4a3877624304bf5d071dcbc4fc7d9af80f` |
| | gain | `e3ddb3a41b93f0ba38532d993f31784015e7959968a517881dcf372f27349b43` | `37cc90ff07dd39d9f951bee0fce23d7ab5e9d4bbdffaa4c235eb2645805495c7` |
| `speex, source at 11.025 kHz` | WAV | `c181c03444fdb9b23d0d7a1f3afba9f8fb13d7cf2b4b8d0755d63b178cc43aed` | `f2c38164a1b3655c93d456f4a8f3cdd58eb22dde87807a2a7480a5ade7ba6ffd` |
| | gain | `67054b85aadb25796f6730cbac6a7d7e347ac256baa0332ad9e6c8cdc91229c8` | `6d4ff782056d55f41ace12c18a2a844076353f078c9dd63afcda51bb5669d530` |
| `speex, source at 8 kHz` | WAV | `7d95f8a90ac625934854454014e3878fb757c86a76bc9ffc2dc39e44a92adfad` | `3c4058aebb5db410c461bb20837bb6d31b1a6aa2547c9e6a5821b735cedee1ac` |
| | gain | `84308684ec4582bb8fa3bfc4b78fde1979974d1761b7793f6b49e164084c554f` | `6d92c34e965cc721ae150a58b186fd4ee0148d16c4e7651803f78f4d574d7942` |
| `celt_22, room: preset 6` | WAV | `98c7c5c19aa090bfc3e8ba6a1d46b66c760e0c0d013fb4c18e6e08f7d3c45e81` | `6a6382078f2f52bf57befe64b921ef36caa8f30e07317b18773422e096d98ccb` |
| | gain | `86e017ee4606ac029bcc72961234c3c3049b8014c31c4302ffcffaac8c9da824` | `9e9ff38ca1d70685f73688c24adb0c80b14b16ef97b801f57d93657b4244a878` |

## Commits

1. Five engine-codec renders the change must not move, recorded first (old code).
2. The change and its tests.
3. The nine moved renders re-recorded.
4. Docs: `tests/LEGACY_CODECS.md` (a section "The receiver gain's blocks", and the stale "until W3-19" mentions), `tests/REFERENCE_2026.md` (a finding 31 bullet, and Set M's and the unverified list's mentions), README.md (one sentence), `tests/predictions/PREDICTIONS.md` (the change-after-registration note), `sw.js` CACHE v29 to v30, and this report.

## Checks run

(Filled in below as they are run.)
