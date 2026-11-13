# W3-02c-3 and W3-02d: the plan pass

A plan, 2026-11-13, made from the repository at `9d5113a` (cache v41). No app code and no test changed. It
turns two parts of [the old order](../work-orders/W3-02-receiver-queue.md) into two orders that stand alone:

- [W3-02d](../work-orders/W3-02d-page-timeline.md): the page renders on the game's timeline. 12 hours.
- [W3-02c-3](../work-orders/W3-02c3-live-channel.md): the live monitor can run the game's voice queue. 12 hours,
  recommended off the finish line.

Every figure carries its standing: **read**, **measured**, **inferred**, **guessed** or **not built yet**.
"Measured on the model" means a run of the app's own modules on a synthetic signal. The model's rules are read
from the game; no recording of the owner's shows minutes of unbroken sound through the queue.

## What was run

### Unbroken sound through the voice channel

**The run.** Steam's sender (`steam-sender.js`) was fed a steady loud signal at 24 kHz, a 1 kHz square wave of
height 6000, so its gate never closes and the whole source is one phrase. Each message went to
`voice-channel.js`'s `createTimeline` as a render on the game's timeline hands it: its tick, 882 samples a frame,
its place in the source, `voice_buffer_ms` 100, the codec's look-ahead as `codecDelay`. Every sample given in was
the same constant and no gain ran, so the output over that constant is the channel's own factor on each sample:
1 where the queue is deeper than its fade, less inside the fade, 0 where nothing plays. The level was read in
20 ms windows. Ten minutes, seeds 1 to 20, at five frame rates; then 25 minutes, seeds 1 to 6, at 300.

**When the sound first thins**, in minutes from the start (all measured on the model):

| Frames a second | Wait, ticks | First window under -0.1 dB | First under -3 dB | First under -6 dB | First run of exact zeros |
| ---: | ---: | --- | --- | --- | --- |
| 66.67 | 7 | 0.4 to 3.2, median 2.2 | 2.4 to 4.8, median 3.7 | 3.2 to 5.7, median 4.5 | 4.3 to 7.2, median 5.8 |
| 100 | 10 | 2.5 to 4.9, median 3.9 | 4.0 to 6.8, median 5.3 | 4.9 to 7.6, median 6.3 | 6.2 to 9.0, median 7.7 |
| 144 | 15 | 5.1 to 8.0, median 7.1 | 6.8 to 9.6, median 8.6 | 7.7 to 9.8 in 15 of 20 seeds | 9.3 to 9.9 in 5 of 20 |
| 200 | 20 | 8.7 to 9.9 in 9 of 20 seeds | 9.9 in 1 of 20 | none in ten minutes | none |
| 300 | 30 | none in ten minutes; 11.6 to 12.0 in the longer run | 13.1 to 13.6 | 14.1 to 14.5 | 15.4 to 16.1 |

**What it sounds like once the queue has run down** (66.67 frames a second, minutes 7 to 10, mean of 20 seeds;
measured on the model):

- 66 to 68% of the 20 ms windows are more than 3 dB down and 22 to 23% more than 6 dB. The median level is 3.9 to
  4.1 dB down. The lowest window in any seed is 31 dB down.
- There are 11 to 14 runs of exact zeros a minute. Each is at most 11.6 ms, one mixer block.
- The level falls and comes back with each packet, 17.9 packets a second. That rate is inferred from the rule;
  the run measured levels, not the rate of the dips.
- In one seed of 20 the channel ran dry, closed and opened again: a gap of 104 ms at 7.3 minutes, after which the
  level was whole for about two minutes.
- The same state is reached at 100 frames a second by minute 9 and at 300 from minute 17.

The old order inferred a fade after 1.3 to 2.8 minutes at 67 frames a second, 3.1 to 4.4 at 100 and 11.3 to 11.7
at 300, and a first underrun after 5.3 to 6.5, 7.1 to 8.4 and 15.5 to 15.9. The run agrees. Its ranges are wider
because it has more seeds and the sender's capture phase (W3-21).

**The drift**, the output's position less the source's, in ms (negative: the sound comes early; measured on the
model, 20 seeds, lowest to highest with the median):

| Frames a second | At 1 s | At 60 s | At 300 s | At 599 s |
| ---: | --- | --- | --- | --- |
| 66.67 | -40 to +28, 0 | -64 to +4, -24 | -161 to -93, -121 | -161 to -119, -141 |
| 300 | -27 to +9, -8 | -62 to -25, -46 | -159 to -123, -143 | -281 to -244, -265 |

The render gains about 24 ms a minute, the one sample dropped from every packet (finding 24). At 66.67 frames a
second the gain stops once the queue is empty. At 300 it runs for the whole ten minutes, so the end of a
ten-minute render plays about a quarter of a second ahead of the source.

**What a channel drops when it opens** (measured on the model): at 300 frames a second 74 to 136 ms of the
source, median 105, in 5 to 13 overflows, 61 to 130 ms of it in the first second and the last overflow between
1.1 and 17.7 s. At the four lower rates nothing is dropped. The game's logs gave 55 to 136 ms a restart at 300
(measured, finding 23).

### The same through a whole render

One run of `TF2Audio.process` on ten minutes of a steady synthetic chord at 44.1 kHz, seed 1, the gain off, the
sound device at 44.1 kHz, with the stages kept between renders. The channel's factor was taken as the level of
the `'game'` render's voice over the level of the `'source'` render's voice at the place the channel played.

- At both rates the overflow drop and the four drift figures are the module run's for seed 1, to 0.1 ms
  (116.9 ms dropped at 300; -13.7, -37.6, -135.1 and -161.2 ms at 66.67; -24.3, -61.6, -159.1 and -280.6 at 300).
- At 66.67 frames a second the share of windows more than 3 dB down in minutes 5 to 10 is 8.7, 42.6, 70.5, 70.4,
  67.0 and 70.9%; the module run gave 8.5, 41.8, 69.5, 71.3, 66.9 and 70.0%.
- At 300 frames a second no window is more than 1 dB down after the first second.

So the module run stands for a render (measured; one seed).

### How long a render from the kept stage takes

Measured in Node on the build machine, four cores shared with another job, one run each, the same ten-minute
source: every stage 24.2 s; from the kept codec result on the file's own timing 7.9 s; on the game's timeline
12.4 s at 66.67 frames a second and 12.9 s at 300. The W3-02c-2 report has 11.2 to 11.3 s and 13.2 to 13.7 s with
the page's defaults.

No phone is at hand. What can be timed here is a re-render in the browser suite's own Chromium, with the
processor at full speed and slowed 4 and 6 times by the browser's own throttle. W3-02d asks its builder for that
table. It shows how the time grows with the length and what a processor that much slower would take. It does not
show a phone's memory limit, its heat, another browser's engine or a tab in the background.

## The default

**The case for the game's timeline** on a clip that is mostly music and longer than a minute:

- At 300 frames a second, the game's default cap and the owner's rate, the queue does not thin unbroken sound
  inside the page's ten-minute limit (measured on the model, 26 seeds; the first dip is at 11.6 minutes).
- It is what the game does to the start of a phrase and to the clock. The takes have the clock (measured) and the
  early starts (measured), and a render on the game's timeline at 300 frames a second has the take's kind of
  change in 327 of 360 seed-changes at 240 ms pauses, 114 of 300 at 420 to 440 ms and 155 of 270 on speech
  (measured, private runs).
- It costs 2 to 5 s on a ten-minute render (measured in Node).

**The case for the file's own timing:**

- The render stays in step with the original, so Hear's two versions line up and a render put back into a video
  stays with its picture.
- Nothing is skipped in the first second. On the game's timeline at 300 frames a second about a tenth of a
  second of the opening is, as in the game.
- At a low frame rate the game's timeline thins long unbroken sound, and no take shows whether the game does.
  That is a risk only when the frame rate is set low.

**Recommended:** the decision in force stands. The page's default is the game's timeline at 300 frames a second
with `voice_buffer_ms` 100. A video, a demo, the codec skipped and every codec but `steam` keep the file's own
timing. The page says beside the frame-rate control what a low rate does to minutes of unbroken sound.

## Open decisions

Each has a recommendation, and W3-02d is written to it.

1. **The default.** Recommended: the game's timeline at 300 frames a second. Rests on the run above.
2. **What happens to "Talk-spurt timing".** Recommended: replaced. The select becomes "Phrase timing" with "The
   game's voice queue" and "The file's own timing"; the page no longer sends `retime`; `voice_retime` stays as
   an old name for `voice_timeline`. Hiding it would leave a control that changes sound with no words; keeping
   it would offer the flat rule beside the model that retires it, and the engine refuses the two together
   (`engine/steam.js:108`). W3-02f can then remove the flat rule from the engine.
3. **A remembered `retime` of 0.** Recommended: dropped, so a returning visitor gets the new default. Every past
   visit saved a `retime` of 0, and reading it as "the file's own timing" would keep the page's default from
   reaching anyone who has used the page.
4. **The frame rate across presets.** Recommended: a preset leaves it alone, as it leaves the sound device's
   rate. It is a property of the listener's PC. The old order had the modern preset set it to 300.
5. **`voice_buffer_ms` as a control.** Recommended: yes, in the Receiver box, set to 100 by a preset. It is the
   game's variable and half of the wait's rule. The other way is to send 100 always and show nothing.
6. **Loss and jitter on the game's timeline** (the "Laggy" preset). Recommended: the game's timeline there too.
   Under 15% loss it has the take's jumps across lost runs, which the file's own timing has not, and it is
   silent 16.4% of the time against the take's 10.1% (measured, private, the W3-02c-2 report). The documents
   say so until BC-3's check is done.
7. **A video with the game's timeline.** Recommended: not offered on the page. The sound would lead the picture.
8. **The automatic re-render of a longer source.** Recommended: by the device's own time. A change that needs
   no new encode re-renders by itself when the render on screen took at most 30 s on this device. The ruling
   asks for a length limit set from a phone's timing; a length that suits a phone marks most long clips on a
   desktop, and no phone is at hand. A fixed length is one constant if the orchestrator prefers it.
9. **The live monitor's queue (W3-02c-3).** Recommended: not on the finish line; built on the owner's word,
   after BC-4 if BC-4 is built. The switch is off by default, the monitor would play 0.13 to 0.38 s later than
   today (inferred), and BC-4 changes how packets reach the channel, so the monitor's hold-back would be worked
   out twice. Until then W3-02d makes the monitor keep the file's own timing and says so.
10. **The monitor's switch, if built.** Recommended: a checkbox kept like the low-latency box, off on every
    load, with no console name. The chain takes the render's own three option names, so a chain and a render
    with the same options are the things compared.

## What could not be settled

- **Whether the game thins minutes of unbroken sound at a low frame rate.** The rules are read and the model
  follows them. A take would settle it: about six minutes of a steady tone through `voice_loopback` at
  `fps_max 67`, and the level over time read from the recording.
- **What a moving frame rate does.** The page takes one rate for a render. One long frame ends a channel's wait
  at once (read). The effect on a render is guessed.
- **A phone's time for a re-render.** Not measurable here.
- **Whether the real-take panel reads right for a render on the game's timeline.** It compares levels over the
  whole overlap, which a shift of a third of a second should not disturb (inferred from
  `app/realtake.js:183-205`). W3-02e owns that panel and is not built yet. It should follow W3-02d directly.
- **Whether a render should say when its own queue ran low.** `codecInfo.channel` does not count the samples
  played inside the fade. A count there would let the page say "the queue ran low from 3:40 on" for the render
  on screen. It needs a field in `voice-channel.js` and is in neither order.

## What BC-3 and BC-4 need from these two

**BC-3** (the private check of loss through the queue against block 1, and the log tool's change):

- Nothing built by either order. Its build is in W3-02c-2 already.
- From W3-02d: the page's words must not say loss on the game's timeline is checked. Decision 6 above puts the
  lossy preset on the game's timeline by default, so the page's "Laggy" sound moves with W3-02d and BC-3's check
  then speaks for what the page plays.

**BC-4** (jitter as arrival delays, in order, through the queue):

- From W3-02d: the rule for the automatic re-render reads the engine's list of the options after stage B at run
  time. BC-4 moves `jitterMs` to that list, and the rule then follows with no change to the page. W3-02d leaves
  the Network box and the jitter control's words as they are; BC-4 gives the control its new meaning.
- From W3-02c-3: BC-4 takes the arrival tick at the one place where a packet is handed to the channel. If the
  live chain ran the channel first, BC-4 would have a second caller to change and the monitor's hold-back to
  work out again, since a delayed packet makes the chain wait longer. This is the main reason W3-02c-3 is
  recommended after BC-4.
- From both: no recorded value moves in either order, so BC-4's "must move" list starts from today's values.

## The scripts

The two scripts of the run were written in the planner's scratch folder and are not in the repository: a planner
changes no test. The first section above says what they do in enough detail to write them again. If a guard on
the default is wanted, the 300-frames-a-second row of the first table is the check to hold: ten minutes of
unbroken sound, no window under -0.1 dB after the first second. It takes about 9 s a seed in Node.
