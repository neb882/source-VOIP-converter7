# W3-14: Steam's voice path against a known input

An investigation, 2026-11-10. No app code changed. The owner's recording (Set J) is private: this report holds
numbers and reasoning only. The order is `docs/work-orders/W3-14-steam-file-input.md`. No leaked source was used,
and the Steam client's binary was not opened: everything here comes from the run's two logs, its two recordings
and the project's own modules.

## Headline

- **The continuous clip: 524,286 of 524,288 samples identical** (11.889 s at 44100 Hz), under the `fma3` kernel.
  The first 165,759 samples (3.76 s) are identical with nothing changed.
- The two that differ are one step off, four samples apart. Both come from **one** decoded 24 kHz sample that
  Steam's decoder puts one step higher (8010 where the app has 8009). The app's float value there is
  8009.49951, one float step under the half. With that one sample changed, all 524,288 are equal under `fma3`,
  and `avx` differs in 59, `sse` in 82, `c` in 108.
- So on this run the app's packets, its 16-bit decode, the resampler port, the first-packet flush and the `fma3`
  kernel are Steam's. This is the order's third row with a count of one: "the compiler's last bit in the codec".
- **The gate clip: 523,712 of 524,288 identical**, largest difference 5. It needs the whole run played as one
  Steam session, because its decoder was not new (see "The run as one session").
- **Steam's chunk lengths under file input are not the times between its reads.** The file reader keeps its
  last read time as a 32-bit float, which in this run moved in steps of 125 ms. The real read times follow
  from the lengths exactly: 48 to 64 ms apart.
- **The hold is measured on that same coarse clock.** A spurt ended at the first read where the clock had moved
  four steps (0.5 s) since the read of the last active chunk: 12 of 12 spurt ends. In real time that was 389 to
  514 ms. This, not the read clock, is where the sender model's known bias comes from.

Settings of the match: libopus 1.1.5 (`vendor/libopus-1.1` of `claude/w3-11a-steam-render`), 24000 Hz, mono,
VOIP, 32000 bit/s, signal voice, DTX on, VBR on, complexity 9, the float encode entry point fed `q / 32768`, the
library's own 16-bit decode, a new encoder at each key press and each end marker, a new decoder at each end
marker, frames cut from Steam's own chunk lengths, one message per chunk, each message through
`createResampler({ kernel: 'fma3' }).packet()` by itself.

## What was run

Scratch scripts only (list at the end). The Steam console file was read for its voice lines only: 789 chunk
lines, 2 `loaded` lines (120000 and 134401 samples), 8 `looped` lines and 1 decoder line. The game's log has 645
packet lines (348 after `MARKEXACT`, 297 after `MARKGATE`). Both input clips have a plain 44-byte header.

## 1. Structure

### The chunk lines

- **Length.** The printed milliseconds times 24 is within 0.12 of a whole number on every line, so the length in
  samples is that product rounded. The first chunk of each key press is 250.00 ms: 6000 samples, the cap.
- **Proof of the alignment.** Starting each clip at sample 0 and moving on by each chunk's length (looping), the
  mean and the peak recomputed from the clip equal Steam's printed ones on **788 of 789 lines** (to the printed
  two and three decimals), and the count of high samples on all 789. The eight `looped` lines fall exactly on
  the chunks that wrap. So the file position is known to the sample for the whole run, across both key presses
  of each clip (the position carries on between presses, as read).
- **The one miss** is a chunk of one sample: Steam prints a mean of 0.00 where the sample is 1.19% of full
  scale, and its verdict is "not active". Not explained; harmless.
- **The printed numbers.** The mean is the mean of |x| as a percentage of 32767. The peak is a percentage of
  32768 (28.143 printed; 32767 would give 28.144). W3-09 has the peak as a fraction: it is a percentage.
- **"High samples"** is the count of samples with |x| at or above 4915 (789 of 789; 4914 fits 726, 4916 fits 750).
- **The marks** are three flags: active, mean passed, peak passed. `[+++]` 464 chunks, `[++ ]` 112 (mean only),
  `[+ +]` 4 (peak only), `[   ]` 209. Recomputed from the clip with "mean at least 327.67 or a sample at least
  4915", all 789 marks agree. The lowest mean that passed is 1.0315%; the highest that did not is **0.9998%**.
- **The test tones.** The 1 kHz sine at -38 dBFS prints 0.77 to 0.80% and stays shut in every loop. At -35 dBFS
  it prints 1.12 to 1.14% and opens. The 1.5 ms burst prints a mean of 0.18 to 0.34% and a peak of 19.998% with
  12 high samples: `[+ +]`, open by the peak rule alone, four times of four.

### Messages against the game's log

The sender's rule was run on Steam's chunks, with the hold as found below, and each message's samples passed
through the resampler port for its count. **All 645 lines of the game's log are reproduced, one for one**: 348
of the continuous clip and 297 of the gate clip, silence records and their odd counts included.

- **One chunk, one message; frames of 480 from kept plus chunk.** Confirmed on every message. A chunk that
  leaves fewer than 480 samples in hand sends nothing (for example a 65-sample chunk with 364 kept).
- **The opening.** The first packet of each clip is 12 frames (10,584 samples): the 6000-sample first chunk and
  **no pre-roll**, with 240 samples kept. The sender was not in its silent state at the key press, so nothing
  was put in front. A pre-roll of 2400 zeros would have made 17 frames.
- **The pre-roll inside the gate clip.** Every opening after a silence record carries the last 2400 samples of
  the silent chunks before it (the first six are 10, 7, 9, 6, 10 and 8 frames). Their sound matches the
  recording sample for sample, the -38 dBFS sine in front of the -35 dBFS opening included.
- **The silence record** is the length of the chunk after the last one: 856, 945, 1351, 499, 263, 802, 100, 876,
  325 and 1059 samples, logged at 44.1 kHz as 1573, 1737, 2482, 917, 483, 1474, 184, 1610, 597 and 1946.
- **Two of twelve records are absent** from the log. Both follow a read that brought no samples (see the hold,
  below): in the ended state such a read sends nothing and makes the state silent, so the next chunk is not a
  record. This is W3-09's "if the call brought no samples, nothing is reported", seen. With a microphone a read
  always finds a capture step, so it should not occur there.
- **The 0.3 s pause is bridged** in all four loops. The 0.7 s pauses end the spurt.

### The hold

Twelve spurts end in the gate clip. Summing chunk lengths from the read of the last active chunk gives no
threshold: one spurt ended at 444.0 ms and another did not at 444.4 ms. The reason is the clock.

- **Steam's last-read time is a 32-bit float.** A chunk's length is the time now less that float. In this run
  the float moved in steps of 125 ms (3000 samples), which is a float's resolution between 12.1 and 24.3 days
  of seconds. So a chunk is the real time since the last read plus the rounding error of the last read's time,
  anywhere within 62.5 ms either way. That is why the lengths run from 0.04 to 125.2 ms and look like a saw.
- **The real read times follow exactly.** The float after a read of n samples is the old float plus
  3000 x round(n / 3000), and the read's real time is the old float plus n. Rebuilt that way, the intervals fall
  between 47.8 and 64.1 ms, apart from 41 of 103 to 122 ms.
- **Those 41 are reads that brought nothing** (the time fell before the rounded last-read time, so the length
  came out at or under zero and no line was printed). Each follows a read whose rounding error was -49 ms or
  lower, as it must. They are two intervals each.
- **Two checks of the rebuilt times.** Their spread drops from 34 ms to 4.2 ms. And they carry a line at exactly
  **15.000 ms** (resultant 0.41 in both clips): the game's tick, which nothing in the arithmetic put there.
- **The hold on that clock.** At each read, count the float's steps since the read of the last active chunk.
  The spurt's last chunk is the first read at **four steps (0.5 s)**: all 12 ends, and no earlier read reaches
  four. A float clock in steps of 0.125 s cannot tell 0.4 s from 0.5 s.
- **In real time** the last chunk was read 389, 409, 422, 424, 436, 440, 446, 450, 493, 500, 504 and 514 ms
  after the last active one. The threshold falls anywhere from 375 to 500 ms, by where the last active read
  lies on the 125 ms grid, and the next read ends the spurt. Counting reads that brought samples, that was the
  7th four times, the 8th five times and the 9th three times.

So the hold is 0.4 s as read, but on a clock whose step depends on how long that clock has run. W3-09 noted the
float and its steps; this run shows the effect is large.

### The end of a key press, and the next press

- **The key was down about 22 s** in both clips by Steam's read times (22.06 and 22.55 s from the first read to
  the last), not 13 s. The clips looped four times each.
- **Reads go on after the release.** The gate clip's second press is a tap: its first read, then nine more over
  525 ms. That fits 0.5 s after a release.
- **A spurt left open goes on at the next press.** In both clips the first press ended with the spurt open.
  The next press sent no end marker and no empty packet: its first read brought 6000 active samples and the
  spurt went on.
- **The key press resets the encoder and drops the kept samples** (the frames only fit with nothing kept, and
  the packets only decode right from a new encoder). **It does not reset the sequence number**: see below.
- **The empty packet was not seen.** It needs a first read with no samples, and under file input the first read
  of a press brings the cap.

### The run as one session

The gate clip's recording does not start a stream. Run alone, with a new decoder, it differs in 44,012 samples
(up to 4163 in its first packet, then up to 24 through the comfort noise and speech of its first spurt). Played
as one session it fits:

1. The continuous clip's first press. The game's log holds its first 337 messages and **not the last 10**
   (34 frames, the last 0.67 s of reads). Why the game did not collect them is not known.
2. Its second press. The log has `0` and then 7938 (9 frames) where the chunks give 12 and 5 frames. This fits
   one reading: the sequence numbers ran on over the 34 frames the decoder never got, so the decoder concealed
   **10 frames, the cap**, then decoded; the message came to 22 frames, more than fit; **18 frames were taken**
   (10 concealed and 8 decoded) and the game got nothing; the next message found a gap of 4, concealed 4 and
   decoded its 5. Any other size than 18 gives a different count (17 gives 8820, 19 gives 7056).
3. The gate clip's first press, decoded by that same decoder and the same resampler, with no reset.

With that, the gate recording's differences fall from 44,012 to 576, and all 645 log counts are met. So three
things are confirmed by sound and not only by counts: the decoder and its resampler outlive key presses and
channels; a gap is concealed, at most 10 frames; the end marker is the only thing that resets the decoder.

## 2. The decoder's output, sample for sample

Compared: the first 524,288 output samples of each first press. No sample of either recording is at -32768 or
32767, so none was left out.

| Clip | Kernel | Identical | Differing | Largest | SNR |
| --- | --- | ---: | ---: | ---: | ---: |
| continuous | `fma3` | 524,286 | 2 | 1 | 126.6 dB |
| continuous | `avx` | 524,227 | 61 | 1 | 111.8 dB |
| continuous | `sse` | 524,204 | 84 | 1 | 110.4 dB |
| continuous | `c` | 524,178 | 110 | 1 | 109.2 dB |
| gate, as one session | `fma3` | 523,712 | 576 | 5 | 94.9 dB |
| gate, as one session | `avx` | 523,691 | 597 | 5 | 94.8 dB |
| gate, as one session | `sse` | 523,681 | 607 | 5 | 94.7 dB |
| gate, as one session | `c` | 523,674 | 614 | 5 | 94.7 dB |

The continuous clip peaks at -2.0 dBFS (25,945) with an RMS of -17.9 dBFS, so the kernels are told apart. This
meets the order's bar (one kernel best over more than 200,000 samples with peaks above -6 dBFS), with `fma3` at
0 once the one decoded sample is set.

**Which stage each difference comes from.**

- **The resampler: none.** Given the decoded samples, `fma3` is exact. The decoder was created at this run's
  first packet, and the first packet fits a new stream: phase 0, the start mirrored, the tail finished by the
  mirrored flush, everything after 16 inputs late. All 10,584 samples of the first packet are equal. Started as
  a carried stream instead, about 10,570 of them differ.
- **The decoder: one sample in about 285,000, by one step.** Frame 187, sample 433. The float decode there is
  one float step under 8009.5; Steam's is at or over it. Of the samples decoded, 626 lie within 0.001 of a half
  step and only this one fell the other way, so Steam's floats equal the app's to the last bit nearly
  everywhere. That is a different compiler's rounding in one place (or 1.1.4 against 1.1.5), not a different
  decision.
- **The encoder: none seen.** A wrong packet would change thousands of samples. The checks below show how
  sharply the output reacts.
- **The gate clip's 576.** 104 are in its first 173 samples and 440 in the comfort noise of its first spurt,
  all 5 or less: the decoder's state carried in from the press before, which was not recorded and is rebuilt
  here only from the chunk lines. A pair by one step sits in the first spurt's speech. After the first end
  marker, where the decoder is new, 30 samples differ in 392,000, each by one, in three small groups.

**Settings tried on the continuous clip** (`fma3`, identical samples of 524,288):

| Change | Identical | SNR |
| --- | ---: | ---: |
| none | 524,286 | 126.6 dB |
| float decode, clamped and rounded | 524,286 | 126.6 dB |
| complexity 8 or 10 | 524,286 | 126.6 dB |
| complexity 7 | 2,113 | 19.8 dB |
| complexity 5 | 1,033 | 19.2 dB |
| bit rate 31000 | 1,880 | 20.5 dB |
| VBR off | 900 | 18.8 dB |
| application "audio" | 666 | 11.8 dB |
| DTX off, VBR unconstrained, signal auto, or bit rate 32001 | 524,286 | 126.6 dB |

On the gate clip, DTX off leaves 368,616 identical (31.4 dB): DTX is on. VBR unconstrained and signal auto
change nothing on either clip, so this run does not test them.

**What remains would sound like nothing.** One step in two samples of half a million is 127 dB under the
signal. Every frame's decision is Steam's.

libopus 1.1.4 was not built, and the two tags' sources were not compared: the pinned 1.1.5 already gives the
recording, so there was no difference to explain beyond the one float step.

## 3. Steam's frame clock

**The printed lengths are not it.** Their mean is about 58 ms and they run from 0.04 to 125 ms, but that is the
float's saw. The real intervals, rebuilt as in section 1:

| | Continuous clip | Gate clip |
| --- | ---: | ---: |
| Reads rebuilt (first press) | 380 | 386 |
| Single intervals: mean, deviation | 55.44, 4.24 ms | 55.41, 4.18 ms |
| Shortest, longest | 48.2, 64.1 ms | 47.8, 63.7 ms |
| Reads that brought nothing | 19 | 22 |
| Reads per second, those counted | 18.06 | 18.11 |

- **The distribution is nearly flat from 48 to 64 ms.** The 723 single intervals in 1 ms bins from 47 ms: 3, 19,
  54, 50, 61, 61, 50, 65, 38, 42, 62, 44, 31, 38, 59, 36, 8, 2. **None is over 64.2 ms**: Steam's frame was
  never late.
- **Almost no memory.** Autocorrelation at lags 1 to 8: 0.09, -0.12, -0.11, -0.13, 0.01, 0.16, 0.17, 0.08. The
  sum of 7 intervals has a deviation of 9.8 ms (independent draws would give 11.1). No pairs, no "short after
  long": that pattern was the float.
- **A tie to the game's tick.** 63% of reads fall in a 4.5 ms window of the 15 ms tick, where chance gives 30%.
  A read on the tick is followed 56 to 64 ms later by another on the tick, or 48 to 56 ms later by one off it.
  The cause was not read; the model below ignores it.
- **The mean** is 55.3 ms here, against 55.85 (demo and Set G: 55.5 to 56.2). Sessions differ by about 1%.

### The proposed clock and hold

Two changes: a clock, and the hold's float. All times in seconds, doubles; `draw()` is a seeded generator.

```
constants
  LO = 0.0480, HI = 0.0637      # a read comes LO..HI after the last, uniform (mean 0.05585)
  STEP = 0.03125                # the capture's step, 750 samples
  LATE = 0.013                  # each capture step is ready 0..LATE after its time, uniform
  Q = 1/32                      # the step of Steam's float clock (see below)
  HOLD = 0.4

two generators, so the order of draws does not depend on the sound:
  A = mulberry32(seed ^ mixA) for the reads,  B = mulberry32(seed ^ mixB) for the capture

start:  r = Q * A.draw()                        # where the reads fall on the float's grid
        c0 = STEP * B.draw()                    # the capture's phase
read i: r = r + LO + (HI - LO) * A.draw()
step j is ready at a[j] = max(a[j-1], c0 + j * STEP + LATE * B.draw())
chunk at read i = 750 x (steps with a[j] <= r not yet taken); none ready: the read does nothing
the float clock: f(r) = Q * floor(r / Q + 0.5)
hold: with the state hanging, the chunk is the spurt's last when f(r) - f(r of the last active read) > HOLD
```

Tested over 300,000 reads against what the microphone runs gave:

| What | Microphone runs | The app's clock today | Proposed |
| --- | --- | --- | --- |
| Chunks of 750 / 1500 / 2250 | 23 / 75 / 2 % | 22.7 / 75.6 / 1.6 | 23.3 / 74.7 / 2.0 |
| Pairs 2-2, 2-1, 1-2 | 53, 22, 22 % | 54.0, 20.9, 21.6 | 52.9, 21.5, 21.5 |
| Pairs 3-1, 1-3, 1-1 | 1.7, 1.4, 0.3 % | 1.5, 0.8, 0.3 | 1.8, 1.8, 0.1 |
| A 2250 chunk after a 1500 one (2-3) | not listed; at most 0.4 to 0.9 % by the shares | 0.8 % | 0.3 % |
| Frames per message, 1 to 5 | 8-10, 13-15, 65-68, 8-11, 1 % | 9.9, 12.8, 66.2, 10.0, 1.1 | 10.2, 13.1, 65.3, 10.0, 1.4 |
| Messages a second | 17.9 | 17.89 | 17.91 |
| Last chunk on the 7th / 8th read | about half and half | 6.7 / 93.3 | 51 / 49 |
| Mean time from the last active read to the last | 20 ms under the model's | 444 ms | 418 ms |

- **The bias goes with the hold's float, not with the clock.** With `Q = 1/32` the 7th read ends the spurt in
  51% of cases under every clock tried, the app's present one included. With an exact 0.4 s it is 6.7% under the
  app's clock and 16 to 20% under the measured intervals. The mean tail drops 26 ms; the demo's is 20 ms
  shorter than the model's.
- **Why 1/32.** It is a float's step from 3.0 to 6.1 days of seconds. It puts the real threshold between 375
  and 406 ms, which is exactly the bound the demo gave ("375 to 406 ms", `stands.sender_demo`). This run sat at
  1/8 (12 to 24 days): 13% on the 7th read, 45% on the 8th, 39% on the 9th, mean 465 ms. A Steam started within
  the last few hours has an exact 0.4 s: the 8th read in about 80%. **The right value belongs to the sender's
  PC, like the capture's step.** 1/32 is the owner's PC in Set D, the only microphone evidence.
- **The capture's lateness** (13 ms) is fitted to the pair counts, not measured: this run has no capture grid.
  It replaces the present model's late frames, which this run rules out (no read over 64.2 ms) and which the
  plan's "Open" point 5 already doubted. It gives the logged order: a 2250 chunk between two 750 ones.
- **Not modelled:** the tie to the game's tick, and the small departures from flat.

### What a microphone run with `@voice_spew_activity_check` would still add

- The capture's step and how late a step can be, read straight from the chunk lengths (the 13 ms is a fit).
- The spurt ends with a known float step. **Ask the owner to note how long Steam and the PC have been up.**
- Whether a read ever finds no capture step.
- A second run just after starting Steam would show the hold at an exact 0.4 s, and with file input its chunk
  lengths would be the real intervals with no rebuilding.

## 4. What this run cannot show

- **The soft clip.** The decoded 24 kHz sound peaks at 24,773. Nothing passes full scale, so the library's
  soft clip never acts, and a plain clip would give the same samples. A clip that decodes past full scale is
  still needed.
- **libopus 1.1.4 against 1.1.5.** Not told apart. Whether the one float step is the release or the compiler
  was not looked into.
- **The packets themselves.** No demo was recorded. That the bytes are Steam's is inferred from the decoded
  sound.
- **VBR's constraint, the signal hint, and complexity 8 to 10** make no difference on these clips.
- **Anything of the microphone:** Windows's capture resampler, the 750-sample step, a pre-roll of zeros, a
  short pre-roll after a record, the empty packet.
- **Which form the hold's comparison takes** in floats: "now less noted, over 0.4" or "now over noted plus
  0.4". They agree at a step of 1/8 and differ at 1/32 and 1/64. The demo's bound fits the first. Settling it
  needs a read of the client at the comparison W3-09 gives (`0x1380d6161`). Not done here.
- **Whether that clock counts from Steam's start or the PC's.**
- **What `DecompressVoice` does when a message does not fit**, beyond the counts: the 18 frames are inferred.
  That too is a question for a read of the client.
- **Why the game did not collect the last 0.67 s** of the continuous clip's first press.
- **The second key presses' sound** (not recorded), and anything past the 1 MiB cap: the third and fourth loops
  are checked by counts only.
- **Another PC's kernel.** `fma3` is the owner's PC.
- **Loss on a network**, apart from the one concealed gap.

## What the app must change

| Item | Order |
| --- | --- |
| Nothing in the decode path: the 16-bit decode, one resampler per decoder fed whole messages, zeros for a silence record, the first-packet flush, a new decoder at an end marker only | W3-11a (being built): confirmed as it is |
| `DEFAULT_KERNEL` stays `fma3` | W3-13: no change |
| The encoder's settings and complexity 9 stay | W3-11a: no change |
| The hold on Steam's float clock: `f(now) - f(noted) > 0.4` with a step constant, default 1/32 s, in place of `now > lastActive + 0.4` | W3-02b's sender (`steam-sender.js`): a new small order, since the `steam` hashes move. W3-11a's builder could take it only if the orchestrator wants one re-record instead of two |
| The clock: reads 48.0 to 63.7 ms apart, uniform, not on the 15.625 ms timer; each capture step up to 13 ms late; no late frames | the same new order |
| The words on the page and in `constants.js`: the hold's length depends on how long the sender's Steam has run | the same new order |
| Live chain only: a key press resets the encoder and what is kept, not the sequence number or the gate's state; an open spurt goes on | W3-11b, when it is written |
| `docs/reports/W3-09-steam-voice.md`: the printed peak is a percentage of 32768; the float's steps matter at once, not "after days" only | a doc edit by the orchestrator |

## Proposed text for `tests/REFERENCE_2026.md`

**Finding 16, add after "Its packets are bit-identical to a native build of the same release.":**

> Checked against Steam itself (Set J, W3-14): Steam's `mic_inputfile` fed a known 24 kHz clip, and the game
> recorded the decoder's output. Encoding the clip on Steam's own chunk boundaries with the pinned 1.1.5 at
> Steam's settings, decoding to 16 bits and resampling as finding 29 says gives 524,286 of 524,288 samples
> (11.9 s of speech peaking at -2 dBFS). The two others are one step off and come from one decoded sample whose
> float value lies one float step from a half. Complexity 8, 9 and 10 give the same; complexity 7, 31000 bit/s,
> CBR or the "audio" application leave under 0.5% of samples equal. The clip never decodes past full scale.

**Finding 28, add as bullets:**

> - **Checked on a run where every chunk is known** (Set J, W3-14): Steam's console printed each chunk's length,
>   mean, peak and verdict. All 789 verdicts follow "mean of |x| at least 1.0% of 32767, or a sample at least
>   4915" (highest mean that failed: 0.9998%; lowest that passed: 1.0315%). A -38 dBFS sine stays shut, -35 dBFS
>   opens, a 1.5 ms burst at 0.2 opens by its peak alone. The rule's messages equal the game's log line for line
>   (645 lines), and the pre-roll is the last 2400 samples before the opening chunk, sample for sample.
> - **The hold is 0.4 s on a 32-bit float clock.** Its step depends on how long the clock has run: about 1 ms
>   or less in the first 4.5 hours, 1/32 s from 3 to 6 days, 1/8 s from 12 to 24 days. In Set J the step was
>   1/8 s and every one of 12 spurts ended at the first read four steps (0.5 s) after the read of the last
>   active chunk: 389 to 514 ms of real time. Set D's ends (375 to 406 ms, the 7th read as often as the 8th) fit
>   a step of 1/32 s. So the hold's real length belongs to the sender's PC.
> - **Steam reads every 48 to 64 ms** (mean 55.4, nearly flat, no late read in 723; Set J's times rebuilt from
>   the chunk lengths). Under file input a chunk's length is that interval plus the float's rounding, so the
>   printed lengths run from 0 to 125 ms.
> - **A key press** resets the encoder and drops the kept samples, but not the gate's state or the sequence
>   number: a spurt left open by the 0.5 s after a release goes on at the next press (measured twice).

**Finding 29, replace "not seen in a recording" and the sentence "Which kernel Steam's build runs is not known",
and add:**

> - **Checked sample for sample** (Set J, W3-14). The decoder was created at the run's first packet, and that
>   packet is a stream's first: phase 0, the start mirrored, the mirrored flush at its end, all 10,584 samples
>   equal to the port's. Over 11.9 s the port under `fma3` equals the recording in every sample once one decoded
>   sample is set one step up; `avx` then differs in 59, `sse` in 82, `c` in 108. The owner's PC runs `fma3`.
> - **The decoder outlives key presses.** A second recording in the same Steam run only fits when the decoder
>   and the resampler carry on from the press before: 523,712 of 524,288 samples, against 480,276 with a new
>   decoder. The end marker is the only reset.
> - **Concealment, seen once.** After 34 frames the game never collected, the decoder concealed 10 frames (the
>   cap). That message came to 22 frames, more than fit, and the game logged 0 samples for it; 18 frames were
>   taken, and the next message concealed the 4 left. Inferred from the log's counts and from the decoder's
>   state in the next recording.
> - **Not shown:** the soft clip (nothing decoded past full scale).

## Reproduce

From the scratch folder `agents/w3-14/work/` of the session, with a detached worktree of
`origin/claude/w3-11a-steam-render` at `../branch` and the takes folder attached:

```sh
python3 -I parse.py        # the voice lines of both logs, as numbers
python3 -I align.py        # each chunk's mean, peak and high count from the clips: 392/392 and 396/397
python3 -I guided2.py      # which chunk ends each spurt, from the log
python3 -I realtime.py     # the real read times
python3 -I intervals.py    # the intervals, and the 15 ms line
node q2.mjs exact          # the continuous clip under the four kernels
node session.mjs           # both clips as one session: log counts 0 differing, 524,286 and 523,712
node lastbit.mjs           # the one decoded sample
node floatval.mjs          # its float value
node q2.mjs exact '{"complexity":7}'    # and the other settings
python3 -I clock.py ; python3 -I clock2.py    # the clock models against the microphone figures
```

## Not done

- libopus 1.1.4 was not built and the tags were not compared.
- The Steam client was not opened. Two questions are left for a read: the form of the hold's comparison, and
  what `DecompressVoice` does with a message that does not fit.
- The tie between Steam's reads and the game's tick was measured, not explained.
- The proposed clock was tested by simulation against the microphone figures only, not run through
  `steam-sender.js` or against Set D's demo.
