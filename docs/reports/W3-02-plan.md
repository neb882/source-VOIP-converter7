# W3-02: the plan for the receiver's voice channel

A plan, 2026-11-10. No app code changed. It produced three orders (`docs/work-orders/W3-02-receiver-queue.md`,
`W3-05-receiver-gain.md`, `W3-06-celt-settings.md`), deleted the draft `W3-02-queue-retime.md`, and proposes text
for `tests/REFERENCE_2026.md` (at the end; not applied). Everything measured here came from the owner's private
console logs and takes with scratch scripts; only numbers are quoted.

## The recommendation

**The modern preset should render the game's timeline by default on the page, at `fps_max 300` and
`voice_buffer_ms 100`, with the source's timeline one setting away; the engine's own default
(`TF2Audio.process` with no option) stays the source's timeline.**

- **Why the game's timeline.** The receiver is no longer a fitted rule: it is the engine's, and the owner's logs
  agree with it on every one of 9,808 ticks at three frame rates. At 300 frames a second it does things a
  source-timeline render leaves out on every phrase after a pause of a second or more: about 100 ms of what a
  restart queued is thrown away (40 to 136 ms; mostly Steam's pre-roll, sometimes the onset), and pauses of 0.6 to
  0.95 s between loud sounds are closed. Leaving that out is a larger departure from the game than misplacing
  which pause near the threshold closes.
- **Why only on the page.** Every test, W2-02's golden hashes, the accuracy suite and the registered predictions
  call the engine with their own options. With the engine's default unchanged they are untouched by construction,
  and the take comparison keeps a render it can line up sample against sample.
- **What it rests on that is not proved.** The packets a file render makes up (Steam's batches) are a model
  fitted to 40 s of one machine's log, and the gate's hold and pre-roll are fixed where Steam's vary by 30 ms. So
  a render is a valid outcome of the game, not the outcome of a given take: on the owner's speech take the
  prototype gets 50% of the transitions right (leaving the spurts: 11%) and puts a spurt's start 96 ms from the
  take's on average (leaving them: 150 ms); on the test signals, whose 440 ms silences sit on the threshold, it
  is worse than leaving them (80 to 114 ms against 29 to 83), as W3-01 found for its own model.
- **What would change my mind:** W3-02a's `tests/retiming.mjs --engine` run giving the speech take a start error
  above 130 ms; or a second speech take on which the render places spurts worse than leaving them. Then the
  default stays the source's timeline until the sender's gate is modelled with Steam's own spread.
- **With a video** the recommendation is the source's timeline by default: the picture cannot follow, and sound
  that leads the lips by up to 0.35 s after a pause is a defect in a video that the game, which has no picture,
  does not have.

These are recommendations; the orchestrator and the owner decide ("Decisions left", below).

## The order of work

| Order | What | Needs | Can run beside | Budget |
| --- | --- | --- | --- | --- |
| W3-02a | `voice-channel.js`: the channel, the sender model, the timeline stage; the log replay; `retiming.mjs --engine` | nothing (new files) | W2-02, W3-04, W3-06 | 1 day |
| W3-06 | the CELT profiles' settings, the Speex note | W2-02 merged (golden hashes) | W3-02a | 4 h |
| W3-02b | `process()` and `createRender` run the channel under `timeline: 'game'`; default unchanged | W2-02, W3-02a, W3-06 if it is in flight (`audio.js`) | nothing in `audio.js` | 1 day |
| W3-05 | the gain's four corrections | W3-02b | W3-02c | 4 h |
| W3-02c | the page's controls, the default, the words; the flat rule retired | W3-02b, the owner's answers | W3-05 | 1 day |
| W3-02d | a demo's own packets drive the channel | W3-02b, W3-05, W3-06 (`demo.js`) | W3-02c if it is still open | half a day |

Files do not overlap inside a row's "beside" column: W3-02a adds files only (one line of `package.json` aside);
W3-06 has `constants.js`, `opus-codec.mjs`, `demo.js` and three one-line call sites in `audio.js`; W3-02b and
W3-05 have `audio.js`; W3-02c has `app/`, `index.html`, `README.md`. `tests/render-stream.verify.mjs` (W2-02's
golden hashes) is touched by W3-06, W3-02b and W3-05 in turn, never by two at once.

**W2-04** (rooms and the flat re-timing in the stream): its point 2 streams the rule this plan retires. If W3-02c
removes the flat rule, W2-04 becomes rooms only.

## Decisions made in the plan

1. **A new module, `voice-channel.js`,** holds the channel, so the first order touches no file in flight and the
   model is tested alone before a render depends on it.
2. **The gain runs inside the channel**, packet by packet in arrival order, as in the engine; the source's
   timeline keeps the gain over the whole signal. The two paths share one arithmetic helper.
3. **The output keeps the source's length**, and the channel's latency at a restart (0.25 s at 67 fps, 0.5 s at
   235 and above) is taken out, so a restarted spurt sits where the source has it and an appended one is early.
4. **The mixer pulls a block of 512 samples every 512 samples.** In the game the pulls follow the frames. This is
   the one approximation in the receiver; it matters by at most 11.6 ms at a full or nearly empty ring.
5. **The frame log follows the sound** under the game's timeline (as `retimeSpurts` moves it now); the sender's
   log is kept beside it.
6. **The engine codecs keep the source's timeline.** Their sender is the engine's recorder (one frame a packet),
   their ring is 1 or 2 s, and no log exists under them.
7. **The live chain is left alone.** The channel would add its true latency to the monitor (0.5 s at 300 fps):
   exact, and unusable as a monitor. A later order could offer it for the live recording only.
8. **No empty packet in a file render.** It is what a key press sends; `createLiveChain`'s push-to-talk is where
   it would belong, with decision 7.
9. **The loss model's lost frames ride with the next packet** in the game's timeline (Steam's decoder conceals
   when the next packet reveals the gap). Not measured in a log; said so in the order.

## Decisions left to the orchestrator and the owner

1. **The default** (above): game timeline on the page for the modern preset, or not yet.
2. **Video:** source timeline by default (recommended), or the same default as audio.
3. **The fixture.** `tests/voicequeue/setg.json` would hold, for each of six sections of the owner's logs, a flat
   list of numbers: a packet's decoded sample count, the samples the mixer took between two ticks, the queue's
   bytes on each tick. 156 KB as JSON, 9,808 ticks. Scanned: no 17-digit number, no letters beyond its six key
   names and the section names (`run1`, `run2`, `run3-67`, `run3-100`, `run3-300`, `run3-maxgain1`), no path. What
   it does reveal: when, within those recordings, the owner was speaking and pausing (packet sizes and times), and
   nothing of what was said. It is at
   the planner's scratch folder as `voice-queue-fixture.json` (the full path is in the planner's hand-back); I did not commit it. If the owner says no, W3-02a still
   has the synthetic log test and the tool, and the orchestrator runs the tool on the private logs.
4. **The flat rule** (`voice_retime`'s 41%): retired in W3-02c (recommended; the takes refute it), or kept as a
   third choice.
5. **A new registered prediction for `vaudio_celt_high`** before its take: both hypotheses of P2 are settings the
   engine never selects (W3-06).
6. **Two takes worth asking for** (under "What I could not settle").

## What was measured, and how

Scratch scripts, not committed: `parse2.mjs` (the two kinds of `Voice -` line to numbers), `fixture.mjs` (the
fixture and the replay), `channel.mjs` (the rule as counts), `ring.mjs` (the rule with every sample tagged by the
source time it came from), `packetize.mjs` (the sender model), `takes.mjs`, `setd.mjs`, `checks.mjs`.

### The replay

The logs print each packet's decoded samples and, on every tick, the channel's queued bytes. A fixture was built
from each section (the rules are in W3-02a's point 5) and driven through the rule: packets, the mixer's demand,
ticks. The model's queue was compared with the log's on every tick.

| Section | Frames a second | Wait in the rule | Ticks | Mismatches | Channels opened | Lines before the first fall | Queue when it starts | Adds on the ring's limit |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
| first run | 300 | 30 | 6,267 | 0 | 20, and one grace | 30 (14), 31 (5), 32 (1) | 500 ms in 16 of 20 | 103 |
| second run | 300 | 30 | 934 | 0 | 2 | 31 (2) | 500 ms | 18 |
| `MARK67` | 66 | 7 | 511 | 0 | 2 | 7 (2) | 220 ms | 0 |
| `MARK100` | 99 | 10 | 598 | 0 | 4 | 10 (4) | 240, 280, 280, 280 ms | 0 |
| `MARK300` | 299 | 30 | 581 | 0 | 3 | 30 (2), 31 (1) | 500 ms | 14 |
| `MARKDEC` | 300 | 30 | 917 | 0 | 3 | 30 (3) | 500 ms | 14 |

- **How strong it is.** The mixer's demand comes from the log, so the replay does not test when the mixer pulls.
  It does test: `2 x (N - 1)` bytes for every packet (2,375 of them); the limit and what an overflow leaves; that
  nothing drains before the wait is over (the demand is made up during it, so a model that starts early fails);
  which packets open a channel; the grace; the free on the tick after the ring is found empty; an empty packet
  opening a channel. Broken on purpose: a ring one sample off fails on 4,933 ticks of the first run; a wait one
  tick off fails on about 500 of the 67 and 100 sections' ticks and 700 to 1,500 of the first run's.
- **The frame-rate test.** `waitTicks = ceil(0.1 x fps)` gives 7, 10 and 30, and those are the lines each section
  prints before the queue can fall, in all 11 channels of the three sections. The orchestrator's first count for
  100 (11, "one tick over") counts the line that shows the first fall; by the same count 67 gives 8 and 300
  gives 31. There is no tick over: the countdown starts on the packet's own tick, the sound starts on the 7th,
  10th or 30th, and the next line is the first that can show a pull. The frame-duration limits (0.001 to 0.1 s)
  play no part at these rates. The second run's two channels both fall on line 31, which a wait of 31 would also
  explain; the other sections exclude it.
- **Where W3-03 and the logs differ.** Nowhere in the rule. Three details: its "Checks" text says the queue starts
  falling "about 6 ticks" after the first packet at 67 fps and "9 or 10 lines" at 100; the logs and its own
  formula say 7 and 10 lines. The first pull after a channel starts is 513 samples (or 1025), not 512, in 16 of 16
  starts seen: one extra sample is taken at a start (not read in the engine; the model discards it). And the fade
  and the underrun padding change samples, not counts, so no log can confirm them: they stay "read, not measured".

### What a restart throws away (first run, the rule replayed)

At 300 fps a restart waits 435 ms and its spurt opens with 160 ms at once, so the ring overflows. Per restart:
20 to 100 ms dropped while waiting and 2 to 123 ms after the sound starts, most of it in the first 15 ticks; 55 to
136 ms in all, mean 104. (Where an overflow and a pull fall between the same two lines the split is known to one
block, 11.6 ms.) So a restarted spurt plays 440 ms less what it lost after its first packet: 305 to 385 ms. That is
W3-01's L0 (350, 330 to 375), now from the log's own counts. At 67 and 100 fps nothing is dropped.

### The sender's packets

- **Set G** (2,375 packets): 60 ms in 65%, 40 ms in 14%, 80 ms in 11%, 20 ms in 10%; 3, 4 or 5 ticks apart (41,
  49, 10%), mean 55.5 ms; never two on one tick. A one-frame packet is usually followed by a four-frame one. An
  opening is 8 frames in 20 of 26, 6 in 4, 7 and 9 once; four more spurts opened with 3 or 4 frames straight after
  the previous spurt's silence record (Steam ended a spurt and began the next across a pause just over its hold).
  The silence record is 2756 or 2757 samples 22 times and 1378 or 1379 six times, 3 to 5 ticks after the last
  sound. Three empty packets, each opening a channel.
- **Set D's demo** (1,816 messages; SourceTV writes voice every fourth tick): 1,540 ticks hold voice, 276 of them
  two messages; an opening tick holds 8 frames in 14 of 20 spurts (3, 4, 6, 9, 11, 11 in the others); silence
  records of 1500 samples 17 times and 750 twice.
- **The model** in the order (a 56 ms hand-out clock, 10 ms and 20 ms of jitter, a frame held back one time in
  ten) gives 64% three-frame packets, 26% two, 8% four, 2% one, and 34, 53, 12% for 3, 4 and 5 ticks. It is
  short of one-frame packets; summed over the table of ticks by frames it is 28 points from the log. What it has
  to get right is how far arrivals run ahead of playback, which sets the skips after a restart: it drops 40 to
  136 ms per restart (median 95 to 103) against the log's 55 to 136 (mean 104).

### The takes (prototype, 100 seeds a take, from the accuracy baseline's `results.json`)

Each take's gate-model spurts through the sender model and the channel; scored as W3-01's free-running table.

| Take | Transitions | Right, engine / leaving them | Start error, engine / leaving them | Early starts, take / model (range) |
| --- | ---: | ---: | ---: | --- |
| speech (Set B) | 9 | 50% / 11% | 96 / 150 ms | 6 / 3 (3 to 5) |
| Set C baseline | 12 | 72% / 33% | 95 / 88 ms | 4 / 4 (4 to 6) |
| Set B default | 16 | 70% / 75% | 87 / 46 ms | 2 / 1 (0 to 3) |
| Set B `voice_scale 0.5` | 16 | 51% / 50% | 102 / 61 ms | 4 / 1 (0 to 3) |
| Set B `voice_maxgain 1` | 16 | 75% / 88% | 80 / 29 ms | 1 / 1 (0 to 3) |
| Set B `voice_avggain 0.25` | 16 | 56% / 63% | 97 / 52 ms | 3 / 1 (0 to 3) |
| Set D sender A | 16 | 54% / 50% | 114 / 83 ms | 4 / 1 (0 to 3) |
| Set D listener B, at 300 | 16 | 74% / 88% | 79 / 29 ms | 1 / 1 (0 to 3) |
| Set D listener B, at 100 | 16 | 88% / 88% | 45 / 29 ms | 1 / 0 |

The start error has a floor of about 20 to 30 ms in this scoring (a restart's own overshoot counts against it).
The second PC's take fits a listener well under 235 fps, as W3-03 predicted; its frame rate is not recorded.

**Set D's own packets through the channel** (messages merged per demo tick, 300 fps): the model opens 16 channels
for 20 spurts and predicts changes of -298 and -295 ms at two of the take's four early starts (the take: -324 and
-306) with returns of +342 and +310 (the take: +298 and +311); it misses the other two early starts, whose
arrival gaps sit within the demo's 60 ms resolution of the threshold. At 200 fps and below it predicts none.

### The 400 ppm

One sample per packet at 17.85 packets a second is 405 ppm: a 60 s spurt comes out 24 ms ahead at its end in the
prototype (at 67 fps, where nothing else moves it), which is the accuracy suite's "clock" (404 to 406 ppm on most
takes). The render does not get shorter: the mixer plays in real time and the queue gets shallower.

## What I could not settle

- **What Steam hands out, and when.** The sender model reproduces the logs' packet sizes only roughly. A log at
  300 fps of a known file (the speech source through the cable) would let the sender model be scored against
  arrival ticks directly, since the source's own frames are then known.
- **The 50 ms by which the takes' silences on speech exceed the gate model's** (W3-01). Nothing in the engine
  explains it; it is on Steam's side.
- **Long transmissions.** By the rule, the queue loses 17.85 samples a second and nothing refills it inside a
  spurt. From a full ring that is 20 minutes; from 220 ms at 67 fps, 9 minutes. Before it runs out the last
  100 ms of the queue is under the fade, so the level should sag, and then the channel is freed and waits again:
  a gap of `waitTicks` ticks in continuous music, every 20 minutes at 300 fps. No take is long enough to show it
  (the longest spurt is 83 s). It is a prediction of the rule, cheap to test (25 minutes of music with the two
  debug variables on), and it matters for the long renders of W2: under the game's timeline a 30-minute song
  would have one such gap.
- **Below 67 fps** several ticks run in one frame; the model spaces them evenly. Untested.
- **The fade and the underrun padding** in sound: a take with `voice_writevoices` would not show them either (it
  taps before the ring). Only a recording at a low frame rate, where the queue sits under 100 ms, would.
- **Loss under the game's timeline** (decision 9) and **the engine codecs' channel**: no log.
- I did not run the accuracy suite or the browser suite, and held nothing on the heavy lock.

## Proposed text for `tests/REFERENCE_2026.md`

Not applied. New findings in that document's manner, then the corrections.

> ### 22. The receiver queues each speaker's voice in a half-second ring
>
> Read from the owner's `engine.dll` (W3-03) and checked against the game's own debug output (Set G: `voice_showincoming 1`, `voice_showchannels 1`, which print every packet's decoded samples and the channel's queued bytes on every 15 ms tick). The rule, replayed over the logs' 2,375 packets, gives the logged queue on every one of 9,808 ticks.
>
> - **The ring** holds 22050 samples: 0.5 s at Steam's 44.1 kHz, whatever `voice_buffer_ms` is. A packet that does not fit overwrites the oldest sound, the samples about to be played, which is heard as a skip.
> - **A packet for a speaker with no channel opens one.** The channel waits before it plays; packets that arrive meanwhile are queued.
> - **A channel ends on the first tick after the mixer has emptied its ring.** A packet that arrives before that tick is appended and plays straight after what is queued (this is the early start of finding 21); one that arrives later opens a new channel and waits again.
> - **The last `voice_fadeouttime` (0.1 s) of the queue is faded** linearly to zero, so voice played from a queue under 100 ms is quieter in proportion. Read; no recording shows it yet.
> - **An underrun** is filled with a repeat of the last samples read, then zeros. Read; not seen.
>
> ### 23. The wait before a channel plays follows the listener's frame rate
>
> The wait is `voice_buffer_ms` (100), but the engine counts it down by one frame's duration on each 15 ms tick. It therefore lasts `ceil(0.1 x frames a second)` ticks, the packet's own tick included:
>
> | `fps_max` (counter) | Predicted | Logged: lines before the queue can fall | Queue when it starts |
> | --- | ---: | --- | ---: |
> | 67 (66) | 7 ticks | 7 in 2 of 2 channels | 220 ms |
> | 100 (99) | 10 ticks | 10 in 4 of 4 | 240 to 280 ms |
> | 300 (299, and three runs at the default) | 30 ticks | 30 in 19 of 28, 31 in 8, 32 in 1 | 500 ms in 24 of 28 |
>
> At 300 frames a second, TF2's default cap, the wait is 435 ms and a spurt opens with 160 ms at once, so the ring overflows at every restart: 55 to 136 ms of what was queued is dropped (mean 104 ms over 16 restarts), most of it Steam's pre-roll and some of it the first syllable. The restarted spurt then plays 305 to 385 ms after its first packet, which is the restart latency the takes gave (330 to 375 ms, finding 21). At 67 and 100 frames a second nothing is dropped and no spurt in those sections was appended.
>
> ### 24. One sample is dropped from every packet
>
> The engine copies a decoded packet into the ring through an interpolator that writes one sample fewer than it was given (read; in the logs every packet of N samples raises the queue by exactly 2 x (N - 1) bytes). Steam hands voice out in about 17.85 packets a second (60 ms typical), so playback gains 405 ppm on the sender. This is the "clock" of 404 to 505 ppm in every take: it is not a recorder's clock, and it follows the packet rate (the take at 505 ppm had 22.3 packets a second).
>
> ### 25. Steam's packets as the receiver gets them
>
> From Set G's logs and Set D's demo: a spurt opens with one packet of 160 ms (8 frames in 20 of 26 openings; 6, 7 or 9 in the others); later packets hold 60 ms in 65%, 40 ms in 14%, 80 ms in 11% and 20 ms in 10%, 3 to 5 ticks apart; after the spurt's last sound comes the silence record, 62.5 ms (39 of 46) or 31.25 ms; a key press sends an empty packet, which opens a channel by itself (3 seen). The engine adds nothing: once a tick it sends whatever Steam returned as one message (read).
>
> ### 26. The gain law, as the engine has it
>
> The engine's code confirms findings 3 and 4 constant by constant: 128-sample blocks at 44.1 kHz, the target `min(maxgain, 32767 / (mean + avggain x (peak - mean)))`, `voice_scale` entering twice, the ramp in whole 1/128 steps truncated toward zero, the int16 clamp. Four details differ from the model as first fitted (W3-05): the ramp's step is the difference divided by 127, the block size less one; the block mean is an integer division; a decoded block of zeros has no level, so its target is the cap (every spurt ends, after its silence record, with the gain at `voice_maxgain`); and the gain is reset to 1.0 whenever a channel is assigned, not when a spurt is appended. Checked against Set D: at a burst after a pause inside a spurt, at an appended spurt and at a restarted one, recording A is 8 to 12 times the decoded level from the first 1.3 ms step in which the decoded sound rises.
>
> ### 27. The game's debug variables
>
> `voice_showincoming 1` and `voice_showchannels 1` print the receiver's queue (finding 22); they need no `developer` setting. `voice_recordtofile 1` writes `voice_decompressed.wav` at each key press: whole packets after the gain, 16-bit mono at 44.1 kHz, at most 1 MiB (11.9 s); with `voice_maxgain 1` it is Steam's decoder output. `voice_micdata.wav` is not filled under the Steam codec, and `voice_inputfromfile` is not read under it (it is under `vaudio_celt`). `voice_overdrive` (2) halves every other sound over 0.4 s while a voice channel is in use, so the game's ambience under a voice is 6 dB lower than between spurts.

**Finding 4**, last paragraph: replace "All-zero blocks, when no voice data arrives, leave the gain untouched." with
"When no voice data arrives nothing runs, so the gain is untouched; a decoded block of zeros (the silence record
after a spurt) sends it to the cap (finding 26)." Add after the list: "The step is the difference divided by 127
(finding 26)."

**Finding 10**, title and second half: "The receiver re-times talk spurts" (drop "and trims latency in 256-sample
skips"). Replace from "Within continuous voice" to the end with: "Within continuous voice the delay falls by 0.4 ms
a second, which is one sample dropped from every packet (finding 24), and in steps after a restart, which are the
ring overflowing (findings 22 and 23). The steps are whatever did not fit, not multiples of 256 samples: the voice
path has no 256-sample operation."

**Finding 15**: replace "Both recordings drift by −0.4 ms/s against the sender between the latency trims of finding
10." with "Both recordings gain 0.4 ms a second on the sender: the receiver drops one sample from every packet
(finding 24)." After the list on re-timing add: "The difference between the two PCs is what finding 23 predicts for
a listener at a lower frame rate; the second PC's frame rate was not recorded."

**Finding 19**, last paragraph: after W3-02c, replace the description of `voice_retime` with the game's timeline
(`voice_timeline game`, `fps_max`, `voice_buffer_ms`) and say the flat rule was retired and why (it cannot chain
early starts; the speech take has two chains).

**Finding 21**: under "Restart", replace "waits a fixed restart latency, L0" with "waits `voice_buffer_ms` counted
in frames (finding 23); L0, the latency the takes show, is that wait less what the ring dropped, 305 to 385 ms at
300 frames a second". Under "Listener B": "a shorter queue on that PC" becomes "a lower frame rate on that PC
(finding 23): under about 190 frames a second for an L0 under 0.28 s". Replace the last sentence ("The app
therefore keeps the statistical rule") with: "The app runs the engine's queue (finding 22) on packets it makes up
from the gate model (finding 25); from a demo it uses the demo's own."

**Results, "Clock"** (last bullet of "Every take"): "Every take runs about 400 ppm fast against the source: one
sample dropped per packet (finding 24); 505 ppm for the take with more packets a second."

**Model table:** add a row "Voice channel | 0.5 s ring; a new channel waits ceil(0.1 x fps) ticks of 15 ms; one
sample dropped per packet; the last 0.1 s of the queue faded; `fps_max 300`, `voice_buffer_ms 100` | findings 22 to
25". "Output stage" basis: add "not found in the engine's voice path (W3-03); may be the recording chain".

**What remains unverified**, first bullet, replace with: "**Talk-spurt timing.** The receiver's queue is the
engine's and is confirmed tick by tick at 67, 100 and 300 frames a second (findings 22 and 23). What a render from
a file makes up is Steam's packets: their sizes and times are a model of one machine's logs (finding 25), and the
gate's hold and pre-roll are fixed where Steam's vary, so which pause near 0.4 s closes differs from any one take.
Not recorded: the fade and the underrun padding in sound; a transmission long enough to drain the queue (20
minutes at 300 frames a second); a listener under 67 frames a second; the queue under the engine codecs." And in
"Legacy profiles and rooms": the CELT profiles' settings are read from the game's module (W3-06); Speex's are what
the engine asks for, with the module not shipped.

## The scan

Before the last push I searched the branch's diff against `origin/main` for 17-digit numbers, the player name and
folder path that the logs hold, drive paths and e-mail addresses: none. The fixture and every script that read
the private folder are in the scratch folder only.
