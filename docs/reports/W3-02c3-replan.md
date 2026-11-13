# W3-02c-3 planned again after BC-4: the planning report

The planner's report, 2026-11-13, for [W3-02c3-live-channel.md](../work-orders/W3-02c3-live-channel.md). Written
from the repository alone at `main` `bc28875` (cache v45). The order's earlier text is in git as the file stood
at `584466e`. Nothing of the owner's record was read. No app code and no test was changed. Three prototypes were
run outside the repository; their rules and figures are below.

## What BC-4 changed for this order

1. **A packet reaches the queue on an arrival tick.** `steamChannel` takes `arrive` and uses it for a message's
   tick and for the stream's bound (`engine/steam.js:226-238`). The monitor with the queue on must make the same
   arrivals from the same seed and frame rate, or it is not a render's equal with jitter.
2. **The hold-back does not grow.** The earlier plan said a delayed packet makes the chain wait longer
   (`docs/reports/W3-02cd-plan.md:203-205`). The arrival model takes the least delay out, so an arrival tick is
   never below the sender's tick, and it never falls (`engine/network.js:237-246`). The chain can run the channel
   to the arrival tick of the bound, which is at or after the bound. So what the chain waits for is the same at
   any jitter. The sound comes later inside the render and inside the monitor alike.
3. **Two lists grow with time.** The model's leaving ticks (`engine/network.js:260-268`) and `steamChannel`'s
   answers (`engine/steam.js:185-199`) hold a number for every tick. An endless monitor needs both to forget.
4. **Words.** BC-4b put "Jitter does nothing in the live monitor yet." on the page (`live.js:130`), and
   `docs/LIVE.md`, `docs/PAGE.md`, `docs/ACCURACY.md` and `README.md` say the same. Part b changes them.

## What else changed against the earlier text

| The earlier text | The order now | Why |
| --- | --- | --- |
| The hold H is D plus up to a tick and a mixer block: about 0.34, 0.38 and 0.59 s (inferred) | the hold at the mix point is D: the chain's hold is about 309, 355 and 564 ms (inferred) | derived from the bound and the module's clock, and held on a prototype with 89 samples to spare |
| Sample n of the chain is sample n - H of the render, after H zeros | sample n of the chain is sample n of the render; nothing is given out until the hold has passed | today's chain works this way (`engine/steam.js:67-70`), `contentDelay` stays 0 and the worker's recording needs no change (`live-worker.js:148-149`). H need not be a whole number of blocks for the room, though D is one |
| `spurtStarts` where the channel opens | the same, placed before the mix sample of the block the open falls before | the room fixes its limits for the block of the next sample (`room-dsp.js:960-967`); called at once, the place depends on the plan of blocks |
| not said | `add()` with no third argument; the chain's own scale and clip left out with the receiver's gain off | two traps in today's chain: `engine/steam.js:476-484` moves the cursor, and `engine/live-chain.js:120` would scale twice |
| `createChannel` not to be changed | one option on `createChannel` | its `drops` list (`voice-channel.js:142`) grows with every overflow and has no way to be emptied |
| `app/` not to be touched | `app/render.js`'s `mountLiveTake` and the held take's text | W3-02d-1 gave a recorded take a key on the file's own timing (`app/render.js:767-770`); a take made on the queue needs the other |
| one build, 12 hours | two parts, 10 and 6 hours | part a touches files every render on the game's timeline runs; part b is the page |

## Each `file:line` of the earlier text, checked

| Where the earlier text pointed | At `bc28875` |
| --- | --- |
| `voice-channel.js:262-275` (D) | the comment `:264-280`, the expression `:336` |
| `voice-channel.js:320-323` (`createTimeline` refuses a missing length) | `:320-323`, the same |
| `voice-channel.js:494-506` (`finish()`) | `:487-506` |
| `engine/live-chain.js:72-220` (`steamLiveChain`) | `:72-222` |
| `:107` the timeline, `:180` the message, `:182` the bound, `:202` the take | `:109`, `:182`, `:184`, `:204` |
| `:226` `createLiveChain` | `:228` |
| `:132-134` `holdBack` and `latencyMs`, `:142` the getter, `:214` the saving | `:134-136`, `:144`, `:216` |
| `:172` `spurtStarts`, `:273-278` its reason | `:174`, `:275-280` |
| `:366-422` the other codecs' chain | from `:298` on |
| `:116-119` after the mix point | `:119-121` |
| `engine/steam.js:97-110` (`steamGameTimeline`) | `:101-114` |
| `engine/steam.js:136-180` (`steamChannel`), `:141` the reset | `:182-253`; the resets at `:203` and `:219` |
| `engine/steam.js:314` (`cfg.channel`), `:381`, `:400`, `:419` (the pushes), `:403-411` | `:387`; `:454`, `:473`, `:492`; `:476-484` |
| `engine/render.js:119` | `:124` |
| `engine/render-stream.js:252-253` (the channel), `:265-274` (the bound) | `:258-260`; `:272-284` |
| `engine/room.js:99-106` | the same |
| `live-worker.js:26`, `:47`, `:122-124`, `:134` | `:26`, `:47`, `:124-125`, `:134` |
| `live.js:39` (`liveOptions`), `:47-48` and `:62`, `:291-292` | `:42-43`; `:51-52` and `:66`; `:309-311` |
| `index.html:293-296` (the low-latency box) | `:305-308` |
| `tests/browser.verify.js:1222-1223` (`CONTROLS_EXTRAS`) | `:1317-1318` |
| `tests/steam.verify.js:1033` (section [10b]) | `:1060` |
| `tests/output-stage.verify.mjs:492` (section [14]) | the same |
| `tests/render-channel.verify.mjs:618-633` (check 10) | `:684-703` |
| `docs/LIVE.md:25-26`, `README.md:100` and `:110`, `docs/ACCURACY.md:46` | `docs/LIVE.md:24-28`; `README.md:105` and `:113-115`; `docs/ACCURACY.md:24`, `:104`, `:107`, `:146` |

Places the earlier text did not name and the order now does: `engine/network.js:253-290`,
`engine/steam.js:123`, `:185-199`, `:218-223`, `engine/render-stream.js:262`, `:295`, `:350-352`,
`steam-sender.js:87-92`, `room-dsp.js:960-967`, `live.js:126-135`, `index.html:302`, `app/render.js:395-396`,
`:530-535`, `:753-779`, `:941-947`, `tests/browser.verify.js:1291-1294`, `:4229-4232`,
`tests/voice-channel.verify.mjs:239-242`, `tests/render-channel.verify.mjs:964-973`.

## The figures

| Figure | Value | Standing |
| --- | --- | --- |
| D at 66.67, 100 and 300 frames a second, with the codec's 156 samples | 13,312, 15,360 and 24,576 samples | read (`voice-channel.js:336`); the prototype computed the same |
| The least by which the channel's final sound is ahead of `floor(P × 147 / 80) - D` | 89 samples | inferred from the bound; measured by arithmetic over one hour of samples (first at 24.913 s) and through the engine's parts on 45 s of talk (89, 89 and 92 over three seeds at jitter 0) |
| The same with jitter 50 and 100 | 111 to 5,009 samples on the 45 s runs, never under the figure at jitter 0 | measured on the prototype |
| The prototype chain against `createRender` at the mix point | equal sample for sample over 1.96 million samples in each of 40 settings: three frame rates, jitter 0, 50 and 100, loss 0 and 15%, 24 and 48 kHz | measured on the prototype |
| The chain's hold with the queue, more than today | 101.6, 148.0 and 357.0 ms | inferred: D over 44,100 less 4,806 over 24,000; not built yet |
| A phrase's start with jitter, later than at jitter 0 | 96 and 209 ms at 66.67 frames a second for jitter 50 and 100; 59 and 128 ms at 300 | measured on the prototype's renders (the mean over opened spurts of `offsetStartMs`, three seeds) |
| A packet's largest delay above the least | `ceil(J / 5) + ceil((3 J + 1000 / fps) / 15) - 2 (floor(J / 15) + 1)` ticks: 13 ticks at jitter 50 and 27 at 100 from 66.67 frames a second up; 139 at jitter 500 and 10 frames a second | inferred: a head leaves at the first look at or after the age of three times the jitter (`engine/network.js:196`). Not passed in 2,000,000 ticks at each of 30 settings (measured on `steamArrivals`); reached at jitter 50 at 100 frames a second and below |
| What the arrival model keeps | about 4 MB for an hour of ticks | measured on `steamArrivals`, roughly (the heap after a forced collection) |
| What `createTimeline` keeps | about 1.6 MB for an hour of packets, besides its source map | measured the same way, roughly |
| PROGRESS's "about 90 ms on a 67 fps listener, about 435 ms at 300" | the wait itself, in ticks of 15 ms | read (`voice-channel.js:101-105`). The hold's cost is another figure: at 300 frames a second the ring's half second caps what a new phrase plays behind (`:110-113`) |

**The prototypes** (in the session's scratch folder, not in the repository).

- *The chain.* `steamLiveChain`'s capture and message loop, made from the engine's own parts
  (`tests/lib/engine.cjs`'s `parts`), with `steamChannel` given a whole length of an hour, `steamTimeline` given
  that channel and no gain, `add()` with no third argument, and the channel advanced to
  `steamBoundTick(S, lastTick, P)` after every sample. It counts what the channel returned against
  `floor(P × 147 / 80) - D` and compares the sound with `createRender`'s at `opts.onGain`. Signal: the
  render-channel suite's `talk()`, seed 3.
- *The bound.* The arithmetic of the order's "The hold-back" for every P of an hour, and `steamArrivals` over
  400,000 ticks and five seeds a setting.
- *What is kept.* The heap before and after an hour of ticks or packets.

## What could not be settled

1. **Where the room's limits are fixed.** The order takes a channel's start as its open, where the engine
   resets the gain. Whether the engine fixes the room's limits at the open or where the channel first plays was
   not read again. In a render the room never changes, so no check can tell the two apart.
2. **A played frame log in the monitor.** The endless timeline keeps no source map, so the panel's counts and a
   recorded take's codec lane stay the sender's, on the file's own timing. A played log would need the map kept
   over a window.
3. **Today's chain already grows.** `steamTimeline`'s open-ended frame log keeps 11 bytes for every 20 ms slot
   (`engine/steam.js:410-419`), about 2 MB an hour (inferred from the code), and a pair of numbers for every
   spurt (`:394`). That is so with or without the queue and the order does not change it. It belongs on
   PROGRESS's deferred list.
4. **The browser.** How even the chain's output is in a real session, and what the queue costs in time for each
   block, were not measured. Part b's stop-and-ask watches the panel's dropouts.
5. **A session of hours at 66.67 frames a second.** The model's looks drift against the ticks there (finding 9).
   Over 400,000 ticks the mean delay above the least was 102.4 ms (measured), against 96 in the first minute. What
   that does to a long session's phrase starts was not looked at.
6. **Whether a delay of 0.56 s or more is usable** for hearing oneself is the owner's to say. The order keeps the
   switch off on every load.

## Rulings wanted

The order's last section lists six, each with a recommendation. One more is for PROGRESS alone: its line in
`waiting_on_the_owner` gives the queue's wait (about 90 and about 435 ms) as what the monitor's delay gains. The
hold's cost is 102 ms at 66.67 frames a second and 357 ms at 300 (inferred), and jitter adds a phrase's own
lateness to it.
