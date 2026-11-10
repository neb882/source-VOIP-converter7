# W3-11b: the live chain on the render's own stages

The builder's report. The order is part b of `docs/work-orders/W3-11-steam-gate.md` (part c, the key, is not to be
built and was not touched). Branch `claude/w3-11b-live-chain`, from `fdf6d31` (main plus W3-16, the sender as merged).

**Status:** built; every check of part b passes; `pnpm test`, `pnpm test:vendor` and the browser suite pass under the
heavy-job lock; CI passes on the pushed branch (see "Runs"). Not yet reviewed.

## Summary

- For the `steam` profile with the codec on, `createLiveChain` now runs the render's own stages (`steamLiveChain` in
  `audio.js`): the capture with its FIR's delay dropped (`firStage`, as `createRender` runs it), `steamCapture`,
  Steam's sender with the render's seed and `steamUptime` (`steamSenderOptions`), `streamLossMask` by the sender's
  frame number, `createSteamStream`, and `steamTimeline` with one resampler and one gain for the chain. What it hands
  its mix point equals `createRender`'s, sample for sample, at every block plan the order names (`tests/verify.js`
  [10b]); the only exception is the order's own, a packet moved after a gap of more than ten lost frames, and that
  is checked to be the render's spurt shifted by exactly `to - from`.
- What is given out is decided per pushed sample by one function shared with `createRender`
  (`steamGiveOut`): the render's own bound `R`, waiting for the open spurt's cursor at most ten frames in the live
  chain and without limit in the render. No golden hash moved (51 of 51, below).
- One reading of the threshold (`gateThresholdDb()`): `null`, `undefined` and `''` are the profile's own in the
  sender's settings and in all three frame-gate readers. The page's control defaults to the profile's own (-40 on
  `steam`, -39.5 on the others) and sends no number at it.
- Push-to-talk on `steam` is the app's stand-in, named as such on the page: zeros in place of the microphone while the
  key is up. With the key held it is the render; with a scripted key it is the render of the source with those
  blocks zeroed, sample for sample.
- Latency on `steam` (the chain's own figure, `stats.latencyMs`): 206.9 ms at 44.1 kHz and 207.3 ms at 48 kHz, full
  mode; 126.9 and 127.2 ms in low-latency mode, 80.04 ms less (the difference of the two reaches over 24). Before:
  131.8 and 11.8 ms on the frame path. `contentDelay` is now 1 sample (the output FIR's), where it was 521 at 44.1 kHz.

## Commits

| Commit | What |
| --- | --- |
| `e12ecbb` | `audio.js`: `steamLiveChain`, `steamGiveOut`, `gateThresholdDb()`, `steamTimeline`'s open-ended log, no end, cut and move |
| `17284e0` | `tests/verify.js` [10b] for `steam`; `tests/gain.verify.mjs`'s loss case; `tests/speex102.verify.mjs` on `steam_48` |
| `3a03765` | the page (threshold, live panel, push-to-talk), `live.js`, `live-worker.js`, `constants.js` (comments, `steam_48`'s name), README, `sw.js` v26, PREDICTIONS |
| `f6641ac` | `app/netgraph.js`: the loss figure's title on `steam` |
| `cd1b80b` | `tests/REFERENCE_2026.md`: the app today after W3-11b, with dated corrections, in a commit of its own |
| `b893eb8`, `8fb8331` | [10b]'s pointed checks found by breaking the code; the browser suite's checks; 3f restated |

## The two properties checked first

The give-out rule rests on two properties of the sender as W3-16 merged it. Both were checked on this branch's
`steam-sender.js` before any code was written, by a script that pushes one sample at a time (the scratch folder,
`agents/w3-11b/props.js`): 300 seeds, each with the gate on and off, uptimes 0, 777,600 and 3,110,400 s in turn, on 12 s
of seeded bursts at random levels with pauses (111,677 messages, 1,489 spurt openings).

1. **A message is returned from the push of its chunk's last sample.** Every message came back from a push whose
   running count is a chunk end of the sender's clock (`createClock` with the same seed, the reads with samples);
   none at any other sample. A message made by a read with no samples comes back with the chunk before it, so the
   same holds. In the code: `push()` calls `frame()` only when `read === target`, then `nextRead()`, which runs any
   empty reads at once. **Holds.**
2. **`steamReach` bounds where a message can start.** For every message, `start >= P - steamReach(S)` (`P` the samples
   pushed when it came back, `steamReach` = 3 × 750 + 2400 = 4650); the smallest slack was 0, so the bound is tight.
   For every message that does not open a spurt, `start >= P - (3 × 750 + 480 - 1)` (the low-latency reach, 2729);
   the smallest slack was 29. And no message's frames (but an end's padding) ran past `P`. **Holds.**

Neither failed, so the build went on.

## What was built

**`audio.js`.**
- `steamGiveOut(pushed, cursor, reach, lookahead, bounded)`: `R = floor((P - reach - lookahead) × 44100 / 24000) - 1`,
  the render's own expression, moved here unchanged; returns `min(R, cursor)` for `createRender` (`bounded` false)
  and `min(R, max(cursor, R - 8820))` for the live chain (ten frames at the voice rate, `STEAM_CONCEAL_MAX`, the
  decoder's cap). `createRender` calls it where it had the expression inline.
- `gateThresholdDb(raw, own)`: the threshold's one reading, used by `steamSenderOptions` (own: Steam's) and the frame
  gate's three readers in `process()`, `createRender` and `createLiveChain` (own: the profile's `thresholdDb`).
- `steamTimeline`: with no `codecLength` the frame log grows (`room()`), with no `voiceLength` nothing is cut at an
  end, and `add(msg, made, given)` with a third argument cuts the opening message's packet before `given` (counting
  what is at or after 0 in `dropped()`) or moves any other packet to `given` (`moved()`, `cfg.onMove(from, to)`).
  `final(from, end)` gives the slots whose centre is before `end`. A render passes none of these and its path through
  the function is the one it had (the golden hashes).
- `steamLiveChain`, called by `createLiveChain` for a profile whose `senderGate.rule` is `'steam'` with the codec on.
  Capture: mic gain and clip, `streamResampleSinc` to 24 kHz, the optional biquads, `firStage(captureEq, Infinity)`
  (its delay dropped from the front, as `createRender` runs it), `steamCapture`. Then each sample is pushed to the
  sender alone; its messages go through `createSteamStream().message(msg, miss)` and `timeline.add(msg, made, given)`;
  then `given = max(given, steamGiveOut(...))`. The block's output is `timeline.take(given)`; with `agc` off it is
  scaled and clipped as the render's stage 4; then the mix point (`opts.onGain`) and the live chain's own stages
  after it (unchanged, shared with the frame path through `mixStages()`).
- `stats` on the new path: `frames`, `sent`, `lost`, `late` over the slots that became final (centre before
  `given`), as the render's frame log has them; `modes`, `dtx`, `bytes`, `lastMode` from the stream's blocks; `spurts`
  the sender's `info().spurts.length` (a getter); `gateOpen` (a spurt open in the timeline); `talking`;
  `droppedLate`, `movedLate`; `latencyMs`. The chain also gives `slotOffsetSeconds` (-lookahead / 24000, for the
  recorder's slot rule) and `lowLatencySavingMs` (the difference of the two reaches' figures, for the page).
- The frame path (`steam_48`, CELT, Speex, `steam` bypassed) is the code it was, with `mixStages()` split out and an
  `onGain` hook at its mix point; its live output for `steam_48` is main's bit for bit (a hash made on main).

**The page.** `#vad_threshold` starts at -40; `gateDefaultDb(codec)` in `app/core.js` is the profile's own; a codec
change moves a control that holds the old profile's default to the new one's (`updateSignalChain`); a saved -39.5
under `steam` reads as -40 (`applyConfig`); a preset sets the profile's default; `renderOptions()` leaves
`gateThresholdDb` out at the default for every profile. The help (console and title), the chain strip's gate
("gate > -40 dBFS · chunks · 100 ms kept · 0.4 s hold", its figures from `STEAM_SENDER`), the live panel's latency,
low-latency and push-to-talk titles and its loss line, and the render's console line on concealment differ by
profile. `live-worker.js` places `steam`'s slots by the render's slot rule and passes the saving to the page.

## Latency, derived

`contentDelay` (the index shift, in samples at the context's rate) is the causal delay of the stages after the mix
point: today only the output FIR, run causally (one sample at 44.1 kHz), `round(rate / 44100)` = 1 at 44.1 and
48 kHz. The capture FIR's delay is dropped, the lookahead is trimmed where packets are laid, and the reach only holds
samples back, so none of them shifts the index. `stats.latencyMs` is that plus every hold-back:

| Part | Samples | 44.1 kHz context, ms | 48 kHz context, ms |
| --- | --- | --- | --- |
| the context's rate to 24 kHz (`streamResampleSinc`'s wait, `half / up` inputs) | 16 at 24 kHz | 0.667 | 0.667 |
| the capture roll-off's dropped delay | 127 at 24 kHz | 5.292 | 5.292 |
| the reach: the longest chunk and the pre-roll (`steamReach`) | 2250 + 2400 = 4650 at 24 kHz | 193.750 | 193.750 |
| the codec's lookahead | 156 at 24 kHz | 6.500 | 6.500 |
| Steam's resampler (an output waits for 16 inputs past its centre) | 16 at 24 kHz | 0.667 | 0.667 |
| the mixer's rate (44.1 kHz to 44.1 kHz) | 0 | 0 | 0 |
| 44.1 kHz to the context's rate | 0 / 16 at 44.1 kHz | 0 | 0.363 |
| `contentDelay` (the output FIR) | 1 at the context's rate | 0.023 | 0.021 |
| **`latencyMs`, full** | | **206.898** | **207.259** |
| low latency: the reach is the longest chunk and a frame less a sample (2250 + 479 = 2729) | −1921 at 24 kHz | −80.042 | −80.042 |
| **`latencyMs`, low latency** | | **126.856** | **127.217** |

Before (main, the frame path): 131.814 ms full and 11.814 ms low at both rates (the 120 ms pre-roll, the capture FIR's
127 samples and the lookahead as a content delay, the output FIR), with `contentDelay` 521 samples at 44.1 kHz and
567 at 48 kHz. Left out of the figure: the bound's own rounding (`floor` and `- 1`: one to two voice-rate samples,
under 0.05 ms). [10b] checks the figure two ways: low latency lowers it by exactly `(4650 - 2729) / 24` ms, and the
output of a 20 s source is shorter than its input by the hold-back less Steam's resampler's 0.667 ms (which lies inside
the laid packets, as in a render) to within 0.15 ms (measured: 207.238 − 0.667 against 206.583 ms).

**What the page now says.** The latency shown is `10 ms` (half a capture block) + `latencyMs` + what the worklet has
queued + the context's base and output latency; the browser suite checks it lies between `latencyMs` and that plus
400 ms. The low-latency label reads "Low latency (no pre-roll, saves 80 ms)" once the monitor runs, the figure taken
from the chain's `lowLatencySavingMs`; its title says what is held back instead and that each phrase's pre-roll is not
played. README: "About 0.3 s from microphone to speaker on the Steam profile", the chain holding back about 0.2 s, and
"saves about 80 ms (the panel gives the figure)".

**The chain has no flush.** What is held back when the monitor stops (the reach, the lookahead, the filters' and
resamplers' waits: about 206 ms of the microphone in full mode, 126 ms in low latency, more while it waits for the
cursor in a loss run) is never given out, so the last 200 ms or so of a session is never heard and a recording's voice
ends that much short of its microphone. README's Record bullet says so.

## The checks

All in `tests/verify.js` [10b], "Live chain, steam: the render's own stages (W3-11b)", 46 checks, unless named.
Expected values come from `createRender` on the same input at its mix point (`onGain`), from the order (the give-out
rule, the reaches, ten frames), or from a dry run of `steam-sender.js` in the test's own realm; never from the live
chain's output. The block plans: 128, 480, 4,096, a seeded uneven plan (1 to 5,000), single samples, the whole
source, blocks that end exactly on each chunk's last sample, and blocks that end one sample before (the last two
from the sender's clock with the same seed, at 24 kHz, where a block's end trails what was pushed by the capture
roll-off's 127 samples).

| Check | Result |
| --- | --- |
| The live chain is the render: 20 s of talk with pauses, at 24 and 48 kHz, plans 128, 480, 4,096 and uneven: the laid signal at the mix point sample for sample over what it gave out (872,934 of 882,000 samples at 24 kHz), the resampler's packets, the slots' codes, `frames`/`sent`/`lost`/`late` over the final slots, `droppedLate` and `movedLate` 0, the spurts opened (24 kHz: the sender's own count on what was pushed) | pass, 8 of 8 |
| The per-frame counts (`bytes`, `dtx`, `modes`, `lastMode`) are the render's stream's blocks over the messages the live chain handled; `slotOffsetSeconds`; a render's log keeps `ceil((n + lookahead) / 480)` slots | pass |
| The same with the gate off (two plans; the first spurt anchored at -2400, nothing counted), `steamUptime` 14400 and 3,110,400 (seed 7; the two renders' spurts differ, asserted first; every seed from 1 to 40 differs on this source), a typed -46, `agc` off, `voice_scale` 0.5 | pass, 7 of 7 |
| 15% loss and 50 ms jitter on a seed whose mask, inside the spurts, has no run over ten lost frames and one of 8 to 10 (seed 1, its longest run 10: found by the test from the mask and the dry sender), plans 128 and uneven: equal, and `lost`/`late` are the render's over the span, both above 0 (141 and 2) | pass, 2 of 2 |
| The give-out function: no spurt open gives `R`; a cursor ahead gives `R`; 9 and 10 frames behind give the cursor; 11 frames behind gives `R` less ten frames; unbounded, the cursor | pass |
| 30 frames lost in a row in a 126-frame spurt (a hand-made mask through `createSteamStream`, the same in the render), at all eight plans: no exception; `onMove` once, from 125,123 to 136,696; `droppedLate` 0; before `from` the render's laid signal, and from the moved packet to the spurt's end the render's shifted by exactly `to - from` (67,032 samples compared); outputs and the move the same at every plan | pass, 9 of 9 |
| Full reach: what is given out is the order's rule exactly (modelled in the test, sample by sample, from the dry sender's messages and the render's packet lengths), nothing cut or moved | pass |
| Low latency at all eight plans: equal to the render everywhere but each opening packet's cut, which is the model's to the sample; `droppedLate` the model's (9,363), above 0 and at most the pre-roll at the voice rate a spurt; `movedLate` 0; outputs and `droppedLate` the same at every plan | pass, 9 of 9 |
| Low latency lowers `latencyMs` by exactly `(fullReach - lowReach) / 24` from `STEAM_SENDER` (80.042 ms), and the chain reports it | pass |
| `contentDelay`: the 48 kHz live output against a render of the same audio peaks at 1 sample, r 0.99997, 0.0000 dB | pass |
| `latencyMs - contentDelay` is the hold-back: the output is that much shorter, less Steam's resampler's 16 inputs | pass (207.238 − 0.667 against 206.583 ms) |
| Push-to-talk: a continuous speech-like source, the key up 100 ms at 3 s (the zeroed render bridges it with one spurt) and 1.2 s at 7 s (it ends the spurt), both asserted on the zeroed render: the live chain with that key equals `createRender` of the source with those blocks zeroed | pass |
| `gateThresholdDb` `null`, `undefined` and `''` the same in `process()`, `createRender` and the live chain, for `steam` and for `celt_22` with the gate on; `'-46'` as -46; -46 another gate | pass, 2 of 2 |
| `steam_48`'s live output is main's bit for bit, with the key held and with a scripted key (hashes made on `fdf6d31`) | pass |
| `tests/gain.verify.mjs`: 3 s blocks give the samples of 20 ms blocks on `steam`, and with 15% loss (same length too) | pass |
| `tests/speex102.verify.mjs`: its sandbox loads the sender and the resampler; the every-profile live checks on `steam_48`, `celt_22`, `speex` | pass |
| Browser: a fresh page shows -40 and sends none; `renderOptions()` has no `gateThresholdDb` at the default on `steam` and on `celt_22`; the CELT profile shows -39.5 and back -40; -46 renders with `meanMin` 32767 × 10^(−46/20); put back, the render's key is the one before; a saved -39.5 under `steam` restores as -40; a preset restores the profile's default (-40, -39.5 for Legacy); the help and the chain strip's gate by profile (`steam` against `steam_48`'s frame gate; `celt_22` has none); `steam_48`'s name; the live panel's three texts on `steam` and `celt_22` | see "Runs" |
| Browser 3f: frames sent and `modes.hybrid` above 0; the latency shown between `latencyMs` and that plus 400 ms; low latency lowers `latencyMs` by the figure the page shows; push-to-talk waits 1.5 s after the key is up, then `sent` does not grow, then grows with V held; the `steam` take lines up within `2k` samples with r > 0.79; `steam_48` within a sample | see "Runs" |
| No golden hash moved | 51 of 51 the same, below |

## Breaks

Each mutation made in a scratch copy of `audio.js` (and, for the float decode, of `opus-codec.mjs`), and the part of
[10b] that should catch it run against it (`agents/w3-11b/mutations.js` and `runmut.js` in the scratch folder, with a
runner of [10b] alone whose parts can be chosen). Every listed mutation was caught.

| # | Mutation (the order's) | Caught by |
| --- | --- | --- |
| 1 | the capture FIR's delay not dropped (`streamFir`) | "the live chain is the render" (24 kHz) and the per-frame counts |
| 2 | the capture not rounded (truncated); rounded half up | the same, each |
| 3 | the live chain's own seed; `steamUptime` not passed | the same; the two-uptime cases |
| 4 | the float decode (the 16-bit decoder swapped for clamp-and-round of `decodeFloat`, live only); the app's sinc resampler | "the live chain is the render", each |
| 5 | the resampler made anew at each spurt | the same (samples and packets) |
| 6 | the gain fed the laid signal; the gain reset at each spurt | the same, each (`agc` on) |
| 7 | given out by the reach alone (the cursor ignored) | the 15% loss case, both plans |
| 8 | the wait for the cursor without its ten-frame limit | the give-out function; the 30-lost mask at every plan (`onMove` never fires) |
| 9 | the wait at 12 frames; at 5 | the give-out function (11 frames behind), each |
| 10 | a late packet dropped (cut at `given`), not moved | the 30-lost mask, every plan |
| 11 | a late packet laid from `given + 1`; from `R`; moved by whole frames | the 30-lost mask's shifted equality, each |
| 12 | samples before index 0 counted in `droppedLate` | the gate off, both plans |
| 13 | `given` updated before the sample's messages are handled | low latency at every plan: `droppedLate` and the cut differ from the order's rule |
| 14 | the low-latency reach the longest chunk alone | low latency: a difference in mid-spurt, `movedLate` above 0 |
| 15 | what is given out decided per block | low latency: the plans give different outputs and `droppedLate` |
| 16 | `contentDelay` holding the reach | `contentDelay`: the peak is elsewhere |
| 17 | `null` read as 0 dBFS in `process()`; in `createRender`; in the live chain; in the sender's settings | the `null`/`undefined`/`''` check, each (`celt_22` for the three frame readers, `steam` for the sender's) |
| 18 | `lost` counting the mask's lost frames | the loss case: `stats.lost` is not the render's `lostFrames` over the span |
| 19 | the key up skipping blocks | push-to-talk |
| 20 | the key up zeroing after the capture's filters | push-to-talk |
| 21 | the page sends -40 as a number at the default | browser: "a fresh page shows the steam gate's own threshold, -40, and sends none" (run on a mutated copy of the tree); the later threshold checks assert the same at each profile and the batch key |
| 22 | the open-ended frame log in a render too | the golden hashes (`codecInfo`), and the pointed check added for it: a render's log keeps `ceil((n + lookahead) / 480)` slots |

| # | Mutation (the builder's own, for rules no listed one covers) | Caught by |
| --- | --- | --- |
| B1 | a spurt's opening packet moved, not cut | low latency, every plan (`movedLate` above 0) |
| B2 | the low-latency saving the page shows not the chain's | the low-latency figure check |
| B3 | slots counted before they are final (a frame early) | "the live chain is the render": the count of final slots is the order's rule exactly (added after a first version of this mutation went unseen) |
| B4 | the per-frame counts not taken from the stream's blocks | the per-frame counts check (added for it) |
| B5 | `steam_48`'s live path changed after its gain | `steam_48`'s hash |

Mutation 22 alone would have been caught only by the golden hashes; the pointed check was added. Mutation 21 is in
`app/render.js`; it was run against the browser suite on a copy of the tree, which stopped at its first check of the
threshold. B3's first form (counting a frame early) passed until the
check that the count of final slots is the order's rule was added. The frame log's own "floor" (marking only slots at
or after `given`) had no effect anyone could see, since a slot before `given` is already final and taken; it was
removed rather than left untested.

## Readings of the order

1. **The branch** is `claude/w3-11b-live-chain`, as the brief names it (the order says `claude/w3-11b-steam-live-page`).
2. **Per-frame counts.** `modes`, `dtx`, `bytes` and `lastMode` are counted from the blocks `createSteamStream` returns.
   A frame lost at a spurt's end makes no block (W3-11a), and `opus-codec.mjs` may not change, so such a frame is
   not counted though it was encoded. DTX is a packet of 2 bytes or fewer, the stream's own rule.
3. **A final slot** is one whose centre, `(480 i + 240 − lookahead) × 147/80`, is before `given`: no later packet can
   mark it. `frames` counts those; `sent`, `lost`, `late` count their codes.
4. **`spurts`** is a getter on `stats` that asks the sender (`info().spurts.length`) when read; the worker's spread
   copies its value.
5. **Latency.** `latencyMs` counts Steam's resampler's wait (16 inputs, 0.667 ms) as a hold-back, since an output is
   made only once its 16th input past the centre is in; it lies inside the laid packets, as in a render, so the
   output's count does not show it. The bound's rounding (under 0.05 ms) is left out.
6. **The hand-made masks** (the 30-lost case) go in through a wrapper of `createSteamStream`'s `message()`, which
   `createRender` and the live chain both call; neither has a `makeLossMask` hook of its own, and none was added.
7. **The chunk-end plans** are made at 24 kHz only, from `createClock` with the same seed (the sender's own clock; the
   reads with samples are the chunk ends); a block ends on one when the input is the chunk end plus 127 (the capture
   roll-off's dropped delay). At 48 kHz the resampler's wait would make that offset vary.
8. **"The spurts opened"** are compared at 24 kHz, against a dry sender given what the live chain pushed; at 48 kHz the
   resampler's packets and the slots' codes carry the comparison.
9. **The loss seed** is found by the test from the mask (`streamLossMask`, one frame a packet at the default
   `net_split`, 50 ms jitter) and a dry sender: no run of lost frames over ten inside a spurt (a run that ends a
   spurt is never played), and one of 8 to 10 starting at least 2 s before the end. Seed 1 qualifies (longest 10).
10. **Push-to-talk's check** uses blocks of 480 at 24 kHz on a continuous speech-like source, the key up for 5 blocks
    at 3 s and 60 at 7 s; the key changes between blocks, as `setTalking` takes effect from the next block.
11. **The low-latency equality** "from each spurt's first given-out sample on": the test models the order's give-out
    rule sample by sample from a dry run of the sender (each message and the sample it came back on) and the
    render's packet lengths, and takes each opening packet's cut from the model; outside the cuts the live output
    must be the render's, and `droppedLate` must be the model's. This is what catches `given` updated before the
    messages, which is plan-independent when done per sample.
12. **"The Gate cell"** is the gate part of the chain strip's Capture cell (there is no cell of its own): "gate >
    -40 dBFS · chunks · 100 ms kept · 0.4 s hold" on `steam`, "gate > -39.5 dBFS" on the others, as before.
13. **The net graph** keeps TF2's own label "loss:"; on `steam` its title says the figure is frames concealed or late.
14. **The threshold's reading:** a string of spaces, a boolean or an object is the profile's own (`finiteOr` read
    `true` as 1 and `' '` as 0 dBFS). No golden case passes any of them.
15. **A saved -39.5** reads as -40 when a saved setting is applied (`applyConfig`: a share link or a saved preset);
    -39.5 typed by hand on `steam` stays -39.5. A codec change moves the control only when it holds the old
    profile's default exactly.
16. **The low-latency label** shows the saving once the monitor runs (from the chain's `lowLatencySavingMs`, sent with
    the worker's `ready`); before that its title says the figure appears then. No number is written into the page.
17. **`onGain` at the mix point** is a hook on every profile's live chain, not only `steam`'s; it is a stage that
    passes its input on, and `steam_48`'s hash shows it changes nothing.
18. **`steam_48`'s hash** was made on `fdf6d31` with `speechLike(3 s, 48 kHz, −20 dB)` in 20 ms blocks, and the
    scripted key up for blocks 40 to 69.
19. **The 3f bound.** Sixty takes simulated at each rate peaked within a sample of 0 every time; their r fell to
    0.811 at 44.1 kHz but to 0.759 at 48 kHz, below the order's 0.8, so the bound is the order's fall-back: the
    tenth percentile less 0.05, taken at the lower of the two rates (0.841 − 0.05), r > 0.79, with `|lag| ≤ 2k`
    (table below). The context runs at 44.1 kHz locally and on CI.
20. **Screenshots** are in `docs/reports/W3-11b/`, as W4-01's are in a folder beside its report.
21. **A race in check 3f, found by this build.** `recordTake` waited for "a take is loaded", which the previous take
    already satisfied, so the `steam_48` take was read before it was mounted: the `steam` take's microphone and voice
    against a `steam_48` render of that microphone. On main both live chains ran the frame path, so that lined up
    within a sample by accident; with the `steam` live chain on Steam's resampler it peaked at 28 samples (Steam's
    16 inputs). The helper now waits for a take other than the one before.

## Not done, and why

- README's codec line still says "complexity 10"; it has been 9 since W3-11a. It is not among the lines this order
  lists, so it was left; the orchestrator may fix it with any doc edit.
- The worklet is unchanged, as the order says: in a loss run that makes the chain wait for the cursor, its queue
  runs dry and then skips what is over its limit (figures below).

## What the browser suite can and cannot prove about the live mode

The headless browser has no real microphone: Chromium's fake device plays the suite's probe file (seeded noise
syllables) looped, resampled to the context's rate, and the context runs at 44.1 kHz locally and on CI. So it can
show the wiring: the page and both workers load the scripts; the live chain runs on `steam` and sends frames; the
latency it shows, its low-latency saving and its texts; push-to-talk stops sending once the hold has run out; a
recorded take lines up with an offline render of its microphone. It cannot prove the arithmetic: the take begins in
mid-session, so the render's sender clock, resampler stream and gain start elsewhere, and the line-up is a
correlation with a window, which a float decode, a missing 16-bit rounding, a kept FIR delay or a missing uptime would
all pass. It cannot show the sound of a real voice, a real device's rate or buffer sizes, the worker being starved by
a busy page, or what the worklet does when the chain waits for the cursor under loss with real timing. The proof that
the live chain is the render is [10b], in Node.

## The live take (check 3f), simulated

Sixty takes of the suite's own probe at each device rate, simulated in Node as the page makes them: the probe looped
from a seeded point, a seeded run of 2 to 10 s, then 3 s recorded and lined up as `live-worker.js` lines them up
(`agents/w3-11b/take3f.js`); each against `process()` of the recorded microphone, the peak sought within ±300 ms over
0.4 s to the end less 0.2 s, as the suite does.

| Device rate | Peak lag (count) | r: min / 10th percentile / median |
| --- | --- | --- |
| 44.1 kHz | 0 (39), +1 (14), −1 (7) | 0.811 / 0.844 / 0.869 |
| 48 kHz | 0 (39), +1 (12), −1 (9) | 0.759 / 0.841 / 0.876 |

## What the worklet does with held sound, and the worker's cost

Replayed in Node (`agents/w3-11b/worklet.js`): one minute of seeded talk at 48 kHz in 20 ms blocks, each block's output
put through `live-worklet.js`'s queue rule (40 ms prebuffer, a skip down to it above 2.5 times that), with the blocks
arriving every 20 ms and no other stall.

| Run | Chain's cost | Worst block | Lost / late slots | Underruns | Skips |
| --- | --- | --- | --- | --- | --- |
| no loss | 10.1 s for 60 s (0.17 of real time) | 31.5 ms | 0 / 0 | 0 | 0 |
| 15% loss, 50 ms jitter, seed 1 | 10.4 s (0.17) | 23.7 ms | 348 / 4 | 1 | 0 |

In this run the waits for the cursor were short enough that the held sound, when it came, fitted under the skip
limit: one underrun (the queue ran dry once and refilled), nothing skipped. A run of 8 to 10 lost frames holds the
output for up to 200 ms; the queue then runs dry, and when the held sound arrives at once anything over 100 ms queued
is skipped down to 40 ms, as after any stall. The worklet was not changed. The worst block took longer than 20 ms in
both runs (the first block, and blocks that open a spurt, where a new encoder and decoder are made): the worker's
real-time margin is the worklet's queue, as before. Measured on the build machine under Node, with nothing else
running; a browser's worker is slower than Node's.

## Screenshots

`docs/reports/W3-11b/`: the Sender controls with the threshold at -40 (`desktop-threshold.png`,
`phone-threshold.png`), the chain strip with "gate > -40 dBFS · chunks · 100 ms kept · 0.4 s hold"
(`desktop-chain-strip.png`, `phone-chain-strip.png`) and the live monitor running on the fake microphone: "● TX",
"0 concealed · 0 late", "latency 309 ms", "Low latency (no pre-roll, saves 80 ms)" (`desktop-live.png`,
`phone-live.png`). Chromium headless with the suite's probe as the microphone, 1366 × 900 and 390 × 844.

## The texts of item 6, as they now read

- The chain strip's gate, `steam`: "gate > -40 dBFS · chunks · 100 ms kept · 0.4 s hold"; the others: "gate > -39.5
  dBFS" (or "no gate").
- The threshold's help (console and title), `steam`: "Gate opening level: the mean of |x| over a capture chunk, in
  dBFS; Steam's own is -40 (1% of full scale); a sine opens at -39.1 dBFS RMS. Chunks · 100 ms kept · 0.4 s hold. A
  typed level reaches the real-take check as a 20 ms RMS level, about 1 dB from this gate"; the others: "Gate opening
  level: 20 ms frame RMS in dBFS (measured -39.5); 120 ms pre-roll, 440 ms hold".
- The render's console line, `steam`: "S_Voice: N frames concealed, M late frames played as silence; frames lost at a
  spurt's end are not played"; the others as before. The net graph's loss figure, `steam`, title: "% of frames sent
  that were concealed or late; frames lost at a spurt's end are not played". The live panel's net, `steam`: "N
  concealed · M late"; its title: "Frames concealed (lost frames the decoder filled in when the next one arrived) and
  late (silence), by the network settings".
- Latency title, `steam`: "Microphone to speaker: what the voice chain holds back (Steam's longest capture chunk and
  its 100 ms pre-roll, the codec's lookahead, the filters' waits), the playback queue and the audio device's
  buffers"; the others as before.
- Low latency, `steam`: label "Low latency (no pre-roll, saves 80 ms)" once running; title "Hold back Steam's longest
  capture chunk and a frame instead of the chunk and the 100 ms pre-roll. The sender runs as before, but each
  phrase's pre-roll is not played. Saves 80 ms. Not how TF2 sounds."; the others as before.
- Push-to-talk title, `steam`: "Send only while V (TF2's +voicerecord key) or the Talk button is held. This is the
  app's stand-in for the key: the microphone is silenced while the key is up, and the voice gate ends the phrase by
  its own hold. Steam's own key rules (it goes on sending for half a second after a release) are not built yet."; the
  others as before.
- `steam_48`: "Fullband Opus (48 kHz / 64 kbps, experimental, not the game's path)".
- README: the gate paragraph (Steam's chunks for `steam`, the frame gate for the others), the settings table's Sender
  row, the live monitor (the render's own chain, the key counted as held and `voice_vox` not read, about 0.3 s, the
  push-to-talk and low-latency bullets, the Record bullet's missing tail), `steam_48`'s row, and the limits (the read
  clock is a seeded model).
- `live.js`'s header and `constants.js`'s `steam` comment (the three numbers are read by neither the render nor the
  live chain).

## Golden hashes

`node tests/render-stream.verify.mjs --hashes` on `fdf6d31` (a checkout in the scratch folder) and on this branch, once
after the engine's first commit and again on the final tree (`5aadf1b`'s code): **all 51 cases identical**, WAV and
`codecInfo` hashes alike (`steam` with the codec on, gate on and off, `steam_48`, CELT, Speex, the codec bypassed, a
demo's received voice). No expectation was re-recorded. The suite's own run (in `pnpm test`, 270 checks) passes against
the recorded hashes.
`tests/steam-sender.verify.mjs` and `tests/opus.verify.mjs` pass untouched.

## Runs

| Run | Result |
| --- | --- |
| `pnpm test`, under the lock | pass (`tests/verify.js` 295 checks, 0 failed; 626 s in all, of which [10b]'s steam section is about 4 minutes) |
| `pnpm test:vendor`, under the lock | pass |
| the browser suite, under the lock (`CHROMIUM_EXECUTABLE` set) | pass, 238 checks |
| CI (`tests` workflow) | pass on `5aadf1b` (the last code change, run 42890081492) and on `434ebcf` (run 42890497723); the commits after it change only this report. The two failing runs before `5aadf1b` were the browser checks fixed there (the gate text against a profile with no gate; the 3f take race) |

## For W3-10's builder

- The mix point is one stage boundary in both live paths: `mixStages()` in `createLiveChain` starts with the
  `opts.onGain` hook, then the mixer's rate, the listener's low-pass, the output FIR, the volume, the context's rate
  and the limiter. On `steam` what reaches it is the render's laid signal from index 0 (the source's own index), so
  W3-10 can count the mixer's blocks from the chain's first sample there.
- What the output stage will move: `contentDelay` (on `steam` it is only the output FIR's causal sample: 0 once the
  FIR goes on a 44.1 kHz context), both `latencyMs` figures (the FIR's sample and the 44.1-to-context resampler's
  wait are in them; `holdBack()` in `steamLiveChain` names each part), 3f's latency window, and [10b]'s recorded
  `steam_48` live hashes (`73f46557…` key held, `a18979bf…` scripted key). [10b]'s `contentDelay` check expects
  `round(rate / 44100)`: it must be re-derived, not only re-recorded. Nothing before the mix point needs to change.
- The live chain's output is shorter than its input by what it holds back, and it has no flush.

## For W3-11c's planner

- Push-to-talk on `steam` is `setTalking(false)` zeroing each block before the mic gain from the next block on;
  nothing else knows about the key. The sender, the stream and the timeline run on through it, so a press's resets,
  the release tail and the empty packet would go into the sender (or around it) and the live chain would pass them
  through `timeline.add` as it is; the give-out rule needs nothing new for them as long as a message still comes back
  from the push of its chunk's last sample and starts within `steamReach` of it.
- A spurt that goes on across a press (M4 of the plan review) would arrive as messages of one spurt number with a
  new encoder: `createSteamStream` decides a fresh encoder and decoder by the spurt number, and `steamTimeline`
  re-anchors by the spurt number too. Both would need the press to start a new spurt number, or a new rule.
- The live chain is rebuilt on any settings change (a new sender, decoder, resampler and gain); toggling
  push-to-talk itself does not rebuild it.
- The ten-frame wait means a run of lost frames longer than ten moves the rest of the spurt later; under W3-11c's
  key rules a release during such a run would end the spurt on the moved timeline.
