# The plan, brought up to date with the first builds

Docs only, 2026-11-10. Since the plan (`docs/reports/W3-11-plan.md`) W3-02a, W3-02b, W3-12a and W3-05 were built
and merged, W3-13 was built and reviewed (its merge waits for the owner's word on its licence), and W3-06 was
built and is in review. Each learnt things the orders still to build must carry. This report lists what was
rewritten, order by order under each item, and what could not be settled. Sources: the merged reports, W3-13's
and W3-06's reports on their branches, and `tests/REFERENCE_2026.md` (findings 26 and 29). No order already
built was edited (W3-02a and W3-02b's sections were compared with main's after each edit), and neither was
`tests/REFERENCE_2026.md` or `docs/PROGRESS.json`.

## What changed, by item

**1. W3-02c's section 10d, and the sender's messages as built** (from `docs/reports/W3-02b-voice-timeline.md`)

- W3-02c, spec 2, rewritten: `pcm` is the resampler's 16-bit output over 32768, whole; `source` is the laid
  position of a spurt's first message and runs on by each `pcm.length`; a record is `{ tick, silence }` and its
  `source` is exactly -1; an end message with no frames is pushed empty and not resampled.
- W3-02c, checks: "An early start" and "Overflow at a restart" are replaced.
  - A new first check, "the wiring is the module's": a hook hands each pushed message to a fresh
    `createTimeline`, whose `info` must equal `codecInfo.channel`. The exact counts over 50 seeds (38 of 50 at
    500 ms) stay where they are pinned, in W3-02b's suite; a codec and a filter stand between in 10d, so 10d
    asks for structure and ranges, not counts.
  - Layouts P (300, 500, 1200 ms) and Q (900, 600, 1200 ms), on the module's own test signal (a square wave of
    height 1000, noise at -50 dBFS between). A 300 ms pause never makes a spurt. A 500 ms pause gives its own
    spurt or is re-opened with no record, and both must occur. After 900 ms at 300 fps the spurt is appended
    and -330 to -190 ms early in at least 8 of 10 seeds (measured -318 to -198, 49 of 50). After 1200 ms it
    opens and drops 60 to 190 ms (measured 79.6 to 167.8); `spurts[0]` drops 60 to 210 on P (measured 82 to
    186) and 45 to 150 on Q (65 to 128). Each range is the measured one, a little wider; the order says which
    break each catches.
- W3-11a, point 5: a paragraph "The sender as built" (`pcm` is what to encode; `start` down to -2400; an end
  message with no frame; the record's shape; no `meanMin` at the default; a hand clock steps by 1 to 6).
- W3-11a, checks: "Once per message" and "The gate off" count the messages that hold samples.
- W3-11a, the Set D private check: a hand clock from the demo's chunks splits a step over 6.
- **A difference from the item as given.** The item says the timeline's `source` is
  `round(start x 44100 / 24000)`. That is W3-02b's note, written with no codec in view. With a codec the
  decoded sound lags by the codec's delay, which W3-11a's point 8 trims when it lays a packet. W3-02c's
  `source` is "where the source's timeline would have laid `pcm[0]`", so I wrote
  `round((start - lookahead) x 44100 / 24000)`. With the other, every offset the timeline reports would be
  late by the codec's delay (a few ms). If the orchestrator wants the note's form, it is one expression in
  W3-02c's spec 2 and one in its first check.

**2. The gain** (from `docs/reports/W3-05-receiver-gain.md`, the second read, and finding 26)

- W3-02c, spec 2: the object handed to the timeline reads the three settings at each `reset()` (an argument
  to `createGain`'s `reset`, which this order may add, or a new gain per open); the first 128 samples a new
  channel is given pass at unity; an appended spurt gets no reset; an underrun never reaches the gain.
  Files: `createGain`'s `reset` and one check in `tests/gain.verify.mjs` are added to what it may touch.
- W3-02c, checks: with `voice_scale` 0 the render is silent but for the first block of each opened spurt; the
  settings read at construction fail a unit check of the wrapper.
- W3-11a, point 8, rewritten: on the source's timeline the gain is fed the decoded packets in order and
  nothing else. A silence record's samples are decoded zeros and go through it, though they are not laid. A
  late frame's samples are not decoded and are left out. Nothing is held per block any more, for `steam`; the
  other profiles keep W3-05's path bit for bit. A check compares the render with a fresh `createGain` fed the
  packets, and requires a difference from main's rule after a gap.
- W3-11a, files: `VOICE_ENGINE.autoGain.blockSize` and its stale comment go, with the mention beside
  `GAIN_BLOCK` in `audio.js`.
- W3-11b, point 1: the live chain's gain is fed decoded samples only. (The first version also reset it when a
  setting changed; that was struck after the third read, below.)
- W3-10, point 1: what reaches the mix stage is whole 16-bit values since W3-05.

**3. The resampler** (from W3-13's report on its branch, and finding 29)

- W3-11a, point 7, rewritten: one resampler for the whole render, made with no kernel; an Opus decoder reset
  is not a resampler reset; whole messages, never split or joined; a message with no samples makes no call;
  the speed (about 5 million output samples a second for the default kernel, about 15 s on a 30-minute
  render) and what to report. A check: the outputs equal one resampler fed the decoded arrays in order, and a
  reset at each end marker fails it.
- W3-11a, point 1 and files: the footer credits FFmpeg's libswresample beside LAME (this is the order that
  first loads the module on the page).
- W3-11a, header: it may be built on a branch that has merged W3-13's branch in, and merges after it.
- W3-02c, spec 2: the resampler is not the channel's; a new channel does not start a new stream.
- W3-02g: one resampler per speaker for the whole demo, never reset.
- **The speed figure.** The item says 6 to 8 million output samples a second; W3-13's report on its branch
  has 4.8 to 5.4 for `fma3` and 10 to 13 for the others. I wrote the report's.

**4. Speex** (from `docs/reports/W3-12a-speex-102.md`, "For part b")

- W3-12b, point 2, rewritten: the float sound is rounded to 16 bits at the call to `encode`; the delay
  trimmed is 80 samples; a new spurt is `reset()` (request 26 on both sides), never a new codec; a new framer
  per spurt on the same codec; zeros for a lost frame, the decoder not called.
- W3-12b, point 5: the two checks of `tests/speex102.verify.mjs` that import `vendor/speex/index.mjs`. The
  first keeps its point through a recorded hash of the 1.2.1 packets; the second goes.
- W3-12b, point 6: the release wording says the release does not matter for the sound (1.0 and 1.0.2 gave
  identical output on 13 signals); no input high-pass in 1.0.2; how often loud speech wraps.
- W3-12b, checks: the wrap count, the reset against a new codec, the delay.
- W3-12b, header and files: it merges before W3-13 (README).

**5. CELT** (from W3-06's report on its branch; subject to its review)

- W3-12b, files: the two stale texts W3-06 left (`tests/gain.verify.mjs`'s comment on `celt_44` with the
  codec bypassed; `tests/reference.verify.mjs`'s 5.8 ms frames for `vaudio_celt_high`), comments only, and
  only if W3-06's review has not fixed them.
- W3-12b, point 2: the rounding to 16 bits sits at `encode`, as W3-06 put it inside the CELT module's.
- W3-10, point 1: `celt_44`'s voice is at 22050 Hz; `modeRate` is the codec's mode only.
- Nothing else in the orders still to build names `celt_44`'s rate or frame.
- Not changed, and not mine to change: `reference.js` has a comment with 5.8 ms frames for
  `vaudio_celt_high`. It reads the frame grid from the render, so it behaves rightly; the file scores
  registered predictions, so a comment fix there should ride with the next order that is allowed to touch it.

**6. W3-14** (the owner's file-input recording)

- "What is known": the gain is at unity from the first sample, by the reset. Where the file starts: Steam
  reads it and skips 44 bytes; the engine's two-sample skip is not in this path; a clip with a longer header
  would shift everything, so check the header first. The resampler's state is carried in if Steam has decoded
  this speaker before in that Steam run.
- **The recommendation asked for:** search the phase always (it is step 1 already and depends on nothing),
  and ask the owner for a fresh start as well, because that is the only way the first-packet flush gets into
  a recording. The sentence for the owner's steps: *"Quit Steam completely and start it again before the run;
  start the game, load the map, and make the first recording with the very first key press after that; note
  which recording was the first."*

**7. The order of work** (`docs/reports/W3-11-plan.md`)

- The table shows what is merged, W3-13 waiting, W3-06 in review, and the rest renumbered.
- A paragraph on what can be built while W3-13's merge waits: W3-06 and W3-12b go ahead; W3-11a can be built
  on a branch that has merged W3-13's in and is merged after it; I would not stack W3-11b or W3-02c on that.
- "Side by side" rewritten: no module order is left, so a second builder has work only at W3-02e, or at
  W3-11a on W3-13's branch beside W3-12b at the price of one merge with real conflicts.

## Open

1. **What a late frame is, once the channel is real.** The app's "late" frame (one in ten of the frames jitter
   delays plays as silence, finding 9) was fitted on the old receiver. In the game a decoder that misses a
   frame conceals it when the next one shows the gap, and silence comes from an empty queue, after the gain.
   No report says which of these the measured silent frame was. The orders keep the measured stand-in (480
   zeros in the message) and keep those zeros away from the gain, on both timelines. If the silent frame is
   really an underrun, under the game's timeline it should be a missing frame and a shallower queue instead.
   A Set C take with the two debug variables on would show it.
2. **The live chain's gain reset. Decided 2026-11-10:** the live chain's gain stays as W3-05 left it, with no
   reset when a setting changes, until the channel runs live. A unity block and a ramp each time a slider
   moves would pump. W3-11b says so.
3. **`source` with or without the codec's delay. Settled:** with. The third read ran the merged modules both
   ways: with the delay the offsets are W3-02b's shifted by exactly 6.5 ms, which is the codec's 156 samples;
   without it every offset would read that much late.
4. **W3-06 is still in review.** If its review changes where the 16 bits are made or `modeRate`'s name, the
   sentences in W3-12b's point 2 and W3-10's point 1 that cite it follow.
5. **The resampler's speed. Decided:** the report's figure, 4.8 to 5.4 million output samples a second for
   `fma3`; W3-11a now gives it so.
6. **The gain's hold on the source's timeline.** The item cites the second reader's finding 3 (the hold lands
   one step past the ramp's end). I did not find that finding's text in `docs/reports/W3-05-receiver-gain.md`
   on main; I built W3-11a's point 8 from the item's wording and from the hold rule as the report gives it
   (`fixed += 128 * step`, where the ramp's last sample used `127 * step`). If the finding said more, it is
   not carried.

## The third read

A builder's model read the maintenance round on main (`527bda6`) as the one who would build it, and ran the
merged sender, timeline and resampler on layouts P and Q, with three broken senders beside them. Its findings,
and what was done (branch `claude/w3-plan-maintenance-2`):

| # | Finding | What was done |
| --- | --- | --- |
| A | W3-11a's checks use `onResampled`, which no point defined | Defined in point 7: each `packet()` result in order, silence records included |
| B | The gate-off check's "end message has no frame" holds only for some seeds | The seed is named (`0xC0FFEE`), and the test first asserts with `createSender` that its seed's end message is empty |
| C | A late frame's output span is approximate (the resampler's lateness and its taps) | Said in point 8, with "do not refine it" |
| D | The gain check's reason was not the mechanism | Now "the first 128 samples after the burst's onset", with the reason: where the blocks fall, the silence record's samples among them |
| E | The 500 ms "both outcomes" line never said it fails | It fails if one outcome still does not occur in seeds 1 to 30; the order says it is the only line that catches a hold timed from the chunk's start |
| F | "38 of 50" is for a level signal over silence | 29 of 50 for this layout's signal (3 of seeds 1 to 10), with why |
| G | What the codec and the capture filter change | Said: the codec changes no gate decision or count; the capture filter can move a chunk at a burst's edge; the margins left for it. The brackets now hold the third read's figures for this signal |
| H | The unity-block check's samples may be comfort noise | Noise at -40 dBFS between bursts for that check, and a stop if fewer than 100 are non-zero |
| I | Part a's 2,106 comes out only from part a's own samples | "At least one wrapped sample, the count in the report"; the exact case added as an option, with its conditions |
| J | W3-14 must also try no pre-roll | Three cases, with why every recording after a run's first is expected to open from the ENDED state |
| K | Take the packet structure from the console log; a record can be any length | Step 1 rewritten: frames from each count over 882, the fit kept for the phase and the residual test only |
| L | The owner's steps were incomplete | The full list of seven steps is in W3-14, with why the processor model matters |
| M | A 13 s press against the 11.9 s cap | Said in step 2: the second loop's first 1.1 s is the overlap the search uses |

Also from that read: the open list's items 2, 3 and 5 are closed above, and W3-02c's spec 2 no longer says the
live chain needs the gain's settings at a reset. Item 6 is moot for `steam`, since W3-11a's point 8 removes the
hold. Items 1 and 4 stand.

## Not done

- No order was sent for a read by a builder. The rewritten parts that most need one are W3-02c's section 10d
  and W3-11a's point 8.
- The ranges in 10d are W3-02b's measurements, widened by me; they were not re-run through a codec.
- The scan: the diff against `origin/main` has no 17-digit numbers, paths, e-mail addresses or names.
