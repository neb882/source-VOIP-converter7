# W3-16: the sender's hold on Steam's float clock, and the read clock as measured

The builder's report. The order is `docs/work-orders/W3-16-sender-hold-clock.md`. Branch
`claude/w3-16-sender-hold-clock`, from `dc1e64b` (main plus W3-11a).

**Status:** built. Every check of the order passes; `pnpm test`, `pnpm test:vendor` and the browser suite pass on
the head under the heavy-job lock; CI: see "Runs". Not reviewed yet. The private runs (Set D's demo, the accuracy
table, the re-timing check) are the orchestrator's: "What the orchestrator runs privately" gives the commands.

## Summary

- `steam-sender.js`: the clock is item 1's (two generators, reads 48.0 to 63.7 ms apart, capture steps up to 13 ms
  late, a seeded phase of 0 to 0.25 s), and gives item 1's ten reads and its **reference hash
  `480ce9b7…843502` exactly**. The sender adds `uptime` (default 777,600 s) to each read's time and narrows it to a
  float; the hold is `nowF > Math.fround(notedF + Math.fround(0.4))`; a read with no samples runs the states.
  The reference schedule (seed 0xC0FFEE, 50 messages) is the order's, message for message.
- `audio.js`: `steamUptime`, passed as the sender's `uptime` (unclamped); `codecInfo.sender.uptime`.
- The page: "Sender's Steam has been running" beside the gate's threshold, for `steam` only, sent as
  `steamUptime`, kept with the settings.
- Golden hashes: the 33 renders whose `steamRule` is true moved and were re-recorded in a commit of their own
  (`df117e8`); the 18 others did not move.
- `tests/verify.js`: one check's seed moved (1 to 10); `tests/voice-channel.verify.mjs`: four expectations
  re-derived. Both listed with old and new values below.
- Two readings touch the files list: `tests/REFERENCE_2026.md` was edited (the brief asked for it; the order
  lists it as not to be touched), and checks were added to `tests/verify.js` (see "Readings", 1 and 2).

## Commits

| Commit | What |
| --- | --- |
| `a4604a3` | `steam-sender.js`: the clock, the float hold, the empty read, `uptime`, the new `clock` form |
| `f7cfab2` | `tests/steam-sender.verify.mjs`: the order's checks, rewritten |
| `80fc78c` | `audio.js`: `steamUptime`; `tests/verify.js`: the laying check's seed, `steamUptime` checks |
| `cc90cf8` | `engineRun` takes `uptime`; `retiming.mjs --uptime`; `voice-channel.verify.mjs` re-derived |
| `744b144` | the page, `constants.js`'s comment, README's sentence, `sw.js` v25, the browser checks |
| `fea1e5f` | `PREDICTIONS.md`: the change after registration, public figures only |
| `711a2a9` | `tests/steam-sender.verify.mjs`: refusals made pointed (found by breaking the code) |
| `df117e8` | the 33 `steam` golden hashes re-recorded, alone, with the reason |
| `0889e92` | `tests/REFERENCE_2026.md`: "the app today" after W3-16 |

## What was built

### The clock (item 1)

`createClock({ seed })` draws exactly as the order writes it: `A` (seed ^ 0x51ED270B) for the reads, `B` (seed ^
0x2545F491) for the capture; `phase = 0.25 A()`, `r = 0.0637 A()`, `c0 = 0.03125 B()`; step `j` ready at
`max(a[j-1], c0 + (j + 1) 0.03125 + 0.013 B())`, one draw of `B` per step in order (drawn when the step is first
looked at); `next()` takes the steps with `a[j] <= r` and returns `{ time: phase + r, since: r, samples: 750 n }`,
then `r = r + (0.0480 + (0.0637 - 0.0480) A())` with the bracket. The constants live in `STEAM_SENDER` as
`readMin`, `readMax`, `captureLate`, `phaseSpan`, `uptime`, `seedMixCapture`; `timer`, `period`, `late` and
`lateMax` are gone.

Seed 1's first reads, as the module gives them: 0 at 0.018701, 1500 at 0.078105, 1500 at 0.132631, 1500 at
0.193900, 750 at 0.250731, 1500 at 0.298772, 1500 at 0.356728, 750 at 0.407854, 1500 at 0.469505, 1500 at
0.518744; each `time` is `since` + 0.1247624. The SHA-256 of the first 100,000 reads in the order's layout is
`480ce9b772e19e23d619af099a1292030b62278d75916efb8ae4cf882a843502`, the order's.

### The sender (items 2 to 4)

- Each read: `nowF = Math.fround(uptime + read.time)` first (seeded and supplied clocks alike); `since` is the read's
  `since`, or its `time` when left out.
- An active chunk, in any state: `notedF = nowF`. The last chunk: `state === HANGING && nowF >
  Math.fround(notedF + HOLD_F)`, `HOLD_F = Math.fround(0.4)`, tested in the read that turns active into hanging.
- A read with no samples (`emptyRead`): silent, nothing; ended, the state becomes silent, nothing sent; active,
  hanging; hanging, the hold is tested and, if it fires, what is kept is padded and sent with the end marker (the
  marker alone when nothing is kept). With the gate off, nothing. Such a read is taken straight after the chunk
  before it, so its message comes back from the same `push()` (or from `finish()`).
- `uptime`: left out, 777,600; given, a finite number from 0 to 4,000,000, else a `RangeError` naming `uptime`.
  `info()` reports it.
- `clock`: an object with `next()` giving `{ time, since?, samples }`; each read checked (time finite and not below
  the last, since finite, samples a whole number from 0 to 2250); anything else a `RangeError` naming the clock.
- A message's tick: `max(last + 1, ceil((since + 0.002) / 0.015))`.

### The render, the page, the words (items 5 to 7)

- `audio.js`: `steamSenderOptions` passes `opts.steamUptime` as `uptime` unless it is `undefined` or `null`;
  `steamCodecInfo`'s `sender` gains `uptime` (from `info()`). The option comments of `process()` and
  `createRender` say so. Nothing else in `audio.js` changed.
- `index.html`: a `<select id="steam_uptime">` beside the threshold, five choices (14400, 388800, 777600 selected,
  1555200, 3110400), the order's help sentence as the label's title. `app/core.js`: `els.steamUptime`.
  `app/render.js`: `renderOptions().steamUptime` is the number for `steam` and left out (undefined) for other
  profiles, so a batch's key does not change on another profile. `app/console.js`: `configControl('uptime', …)`,
  and the line that hides the choice for any profile but `steam` (see "Readings", 4). `style.css` needed nothing.
- `steam-sender.js`'s header, `constants.js`'s `steam` comment ("a 0.4 s hold on Steam's 32-bit float clock, whose
  length depends on how long the sender's Steam has run"), and one sentence in README's gate bullet.
- `sw.js`: `tf2ve-v25`.

## The checks, and how each was broken

All in `tests/steam-sender.verify.mjs` (106 checks) unless named. A second copy of the clock and the sender
(`plainClock`, `plainSender`) is written from the order's text in plain arrays; the module must equal it read for
read (bit for bit, seeds 1 to 400, 2000 reads each) and message for message (seeds 1 to 400, samples included).

| Check (the order's list) | Result |
| --- | --- |
| The float table: nine rows, a read at the limit does not end the spurt, one a float above does | pass, all nine |
| 2.2 and 4.5 days: 406.25 ms on the float clock does not end it | pass |
| 9 days: .343 / .719 ends, .282 / .718 does not; 18 days: 1555200.3 then 1555200.7 ends | pass |
| The float 0.4: noted 0.3, limit 0.7000000476837158 | pass |
| `uptime` added: the 9-day pairs at `uptime` 777600, and the other way round at 0 | pass |
| An empty read: the marker alone; the padded frame; active past the limit; active before the limit and the next read against the same noted time (both sides of the limit); the ended state and no record; the gate off; one sample at a time | pass, each |
| Determinism: the ten reads, the hash, same seed twice, seeds 1 and 2 differ, seed 1 at 14400 (102 and 40 from 21600 and 70500) and at 777600 (104 and 38 from 21600 and 71250) with the same chunks; the default seed and seeds 4 to 10 the same at both | pass |
| The reference schedule: 0xC0FFEE, the 50 messages, spurts `{21600, 104, 2400}` and `{71250, 38, 0}`, 72 chunks; seed 1's first message `[73,0,7]` at both | pass |
| The second copy, seeds 1 to 400, samples included | 400 of 400 |
| Ticks from `since`, against the second copy's reads; a spurt's first tick the same at 14400 and 3110400 | pass |
| The clock's statistics | pass, every bound (table below) |
| The statistics through the sender | pass, each within 0.01 (table below) |
| Stream equals offline: pieces of 1, 7, 480 and 12,345 and whole, at 777600, 14400 and 3110400 and on the hand clock | pass |
| Refusals: the clock's reads and `uptime` | pass |
| The hand clock as reads at `uptime: 0`: W3-02b's messages unchanged (first nine, last two, spurts of 102 and 38) | pass, unchanged |
| Browser: the choice for `steam` only; kept with the settings; a longer spurt at "about a month" than at "since today" (79 and 88 frames, seed 9); `steamUptime` -1 refused | pass |
| `tests/verify.js` (added): `codecInfo.sender.uptime`; 77 and 91 frames at 14400 and 3110400; -1, 4000001, NaN, Infinity and '7' refused unclamped; the stream equals the offline render with `steamUptime` | pass |
| `tests/voice-channel.verify.mjs` (added): `retiming.mjs --engine --uptime` reaches the sender | pass |

### Breaks

Each made in a scratch copy of the tree (`agents/w3-16-build/mut`), the suite run, the first failing check
recorded. The script and the lists are in the scratch folder (`scripts/mutate.py`, `scripts/muts-*.json`).

| # | Mutation | First check that fails |
| --- | --- | --- |
| M1 | the sum left in doubles (`nowF > notedF + HOLD_F`) | 4 hours: a read at the limit does not end the spurt (the sum rounds up there) |
| M2 | `>` made `>=` | 1 hour: a read at the limit does not end the spurt |
| M3 | `HOLD_F` the double 0.4 | the float 0.4 (noted 0.3) |
| M4 | `nowF` taken as the double | 27 hours: the limit row |
| M5 | `uptime` not added | `uptime` is added (the 9-day pairs at 777600) |
| M6 | the noted time copied only at a spurt's opening | the reference schedule (message 27) |
| M7 | the hold not tested on the read that turns active into hanging | 1 hour: a read one float above the limit, read straight after the active one |
| M8 | an empty read skipped | an empty read: the marker alone |
| M9 | an empty read in the active state left active (and untested) | an empty read: active past the limit |
| M10 | one generator in place of two | the ten reads |
| M11 | `captureLate` 0 (the constant) | the constants check; M11b, 0 in the formula with the constant left: the ten reads |
| M12 | the phase draw left out | the ten reads |
| M13 | the bracket of `r` dropped | the clock's hash (the ten reads agree, as the order says); also the bit-for-bit comparison with the second copy |
| M14 | the tick taken from `time` | the reference schedule (message 0: tick 89 for 75) |
| O1 | `max(a[j-1], …)` dropped | **none**: the order says no test can see it (13 ms is under a step) |
| O2 | `<=` made `<` in the step test | **none**, as the order says |
| O3 | an empty read in the ended state leaves it ended | an empty read: no silence record |
| O4 | the gate off: an empty read runs the states | the gate off: an empty read sends nothing |
| O5 | an empty read's end marker lost (not returned) | an empty read: the marker alone |
| O6 | `uptime` below 0 taken | the `uptime` refusals |
| O7 | a `null` `uptime` taken as the default | the `uptime` refusals |
| O8 | a clock's time may go back | the clock refusals: time below the last (see below) |
| O9 | samples over 2250 taken | the clock refusals |
| O10 | `since` not checked | the clock refusals: since not finite (see below) |
| O11 | the phase span 0.03125 (the constant; O11b in the formula) | the constants check; O11b: the ten reads |
| O12 | the default `uptime` 4 hours (the constant; O12b in `createSender`) | the constants check; O12b: the reference schedule's `info().uptime` |
| O13 | the first read at `0.0480 A()` | the ten reads |
| A1 | `audio.js`: `steamUptime` not passed | `tests/verify.js`: `codecInfo.sender.uptime` |
| A2 | `codecInfo.sender.uptime` left out | the same check |
| A3 | `steamUptime` clamped to 0 to 4,000,000 | `tests/verify.js`: refused, not clamped |
| A4 | a `null` `steamUptime` passed on | `tests/verify.js` stops on the sender's `RangeError` |
| R1 | `retiming.mjs` does not pass `--uptime` | `voice-channel.verify.mjs`: `--engine --uptime` |
| R2 | `engineRun` drops `uptime` | the same |
| P1 | the page never hides the choice | browser: on the page for `steam` only |
| P2 | `steamUptime` sent for every profile | the same |
| P3 | the choice not in the settings list | browser: kept with the other settings |

O8 and O10 first passed unseen: the refusal checks fed a list that ran out after the bad read, so a later
refusal ("the clock must give reads") satisfied them. The fix (`711a2a9`): good reads follow every bad one, and each
refusal's message must name what was wrong. M8, M9 and O5 first failed by a crash (a missing message read in the
check); the same commit makes those checks fail by name. No mutation is caught by a golden hash alone: M13, the one
the order pins with a hash, is the clock's reference hash (the order's) and the bit-for-bit second copy.

## The clock's statistics

300,000 reads of `createClock()` at the default seed, counted as the order says.

| What | The prototype | Must lie in | This build |
| --- | --- | --- | --- |
| Chunks of 750 / 1500 / 2250, % | 23.30 / 74.65 / 2.06 | 22.8 to 23.8 / 74.1 to 75.2 / 1.8 to 2.3 | 23.30 / 74.65 / 2.06 |
| Chunks over 2250; reads that bring nothing after the first chunk | 0; 0 | exactly 0 | 0; 0 (the first chunk is the 2nd read) |
| Pairs 2-2, 2-1, 1-2, % | 52.95, 21.42, 21.43 | 52.3 to 53.6; 21.0 to 21.9 each | 52.95, 21.42, 21.43 |
| Pairs 3-1, 1-3, % | 1.78, 1.78 | 1.5 to 2.1 each | 1.78, 1.78 |
| Pairs 1-1, 2-3, 3-2, 3-3, % | 0.09, 0.28, 0.28, 0 | under 0.2; 0.15 to 0.45 each; under 0.02 | 0.093, 0.280, 0.276, 0 |
| Frames per message 1 to 5, % | 10.3 / 13.0 / 65.2 / 10.0 / 1.4 | each within 0.6 | 10.26 / 13.04 / 65.25 / 10.05 / 1.41 |
| Reads a second | 17.90 | 17.85 to 17.95 | 17.901 |
| Shortest and longest interval | 48.00, 63.70 ms | at least 48.0, at most 63.7 | 48.000, 63.700 ms |
| Ends on the 7th / 8th / 9th chunk at 777600, % | 26.5 / 70.8 / 2.8 | 24.5 to 28.5 / 68.8 to 72.8 / 2.0 to 3.6 | 26.46 / 70.75 / 2.79 (none on the 6th or 10th) |
| The same at 14400 | 20.0 / 80.0 / 0.01 | 18 to 22 / 78 to 82 / under 0.1 | 19.97 / 80.02 / 0.01 |
| The same at 1555200 (and the 10th) | 13.2 / 44.3 / 39.1 (3.4) | 11.2 to 15.2 / 42.3 to 46.3 / 37.1 to 41.1 (2.6 to 4.2) | 13.23 / 44.29 / 39.13 (3.35) |

## The statistics through the sender

Seeds 1 to 400 on the statistics signal (240,000 samples, 1000 from 24000 to 215999), the default `uptime`.

| What | The prototype | This build |
| --- | --- | --- |
| Game ticks between messages 3 / 4 / 5 (2 and 6) | 0.305 / 0.666 / 0.029 (none) | 0.3048 / 0.6657 / 0.0294 (none) |
| Openings of 8 / 6 / 9 frames | 0.820 / 0.135 / 0.045 | 0.8200 / 0.1350 / 0.0450 |
| Silence records of 750 / 1500 / 2250 samples | 0.210 / 0.758 / 0.033 | 0.2100 / 0.7575 / 0.0325 |
| Messages a second | 17.90 | 17.901 |

## Expectations that rested on the sender's old schedule

None was a stop; each was derived again from a run, as item 8 says.

| File, check | Old | New |
| --- | --- | --- |
| `steam-sender.verify.mjs`, the reference schedule | 50 messages from `[69,0,7]`; spurts from 20850 (104 frames) and 70500 (40, pre-roll 1500) | the order's 50 messages from `[75,0,7]`; spurts from 21600 (104) and 71250 (38, pre-roll 0) |
| `steam-sender.verify.mjs`, statistics rows (ticks 2 to 6, openings, records, messages a second; rules 1 to 3) | ticks 0.021 / 0.359 / 0.500 / 0.111 / 0.008; openings 0.943 / 0.037 / 0.020; records 0.233 / 0.750 / 0.018; 17.88 | the order's (table above); rules 1 to 3 replaced by the clock's statistics |
| `verify.js`, "laying: … the later packet winning where two spurts meet" | `talk(12, 11)` at seed 1: 606 samples laid twice, 3 anchors rounded up | at seed 1 no two spurts meet (0 laid twice); at seed 10: 606 laid twice, 2 rounded up. The check now runs at seed 10 |
| `voice-channel.verify.mjs`, after 500 ms the next spurt is its own | 38 of 50, starting −20 to +60 ms (seen 8.0 to 24.1) | 42 of 50, starting 0 to +80 ms (seen 14.7 to 68.3) |
| `voice-channel.verify.mjs`, 67 fps, each opened spurt near the source | within 80 ms (seen −11.5 to 69.0) | within 100 ms (seen 11.0 to 88.7) |
| `voice-channel.verify.mjs`, after 900 ms, appended | at least 45 (49), 190 to 330 ms early (seen 198.4 to 318.1) | at least 45 (46), 160 to 310 ms early (seen 167.5 to 303.7) |
| `voice-channel.verify.mjs`, labels | "its hold is 0.4 s"; "17.88 messages a second" | "about 0.4 s"; "17.90" |

The other engine checks kept their bars, with these values: the first spurt's start 21.8 to 74.4 ms (was 6.6 to
36.7; bar −20 to +90), dropped after 1200 ms 86.5 to 153.7 (was 79.6 to 167.8; bar 30 to 170), 67 fps after 900 ms
16.0 to 77.6 (was −15.3 to 54.4; bar 80), the drift at 150 fps −24.6 to −24.4 (was −24.5 to −24.4) and at 300 fps
−48.1 to −25.9 (was −42.8 to −24.4), the `--engine` columns 1 seed 100, 100, 29 and 50 seeds 74, 95, 64 against
"none" 82, 88 (was 100, 100, 15; 96, 99, 22; 82, 82: the stand-in results are themselves made by the sender).
Starts sit later in the game's timeline because a capture step is now readable 0 to 44 ms after its last sample
(the capture's phase `c0` and lateness), where the old clock had it at once.

In `tests/verify.js` no other expectation moved: its 249 checks' details differ from `dc1e64b`'s only in values
inside their bars (diffed: the hold 9330 to 11520 samples after the burst, was 10560 to 12210, bar 9000 to
13,500; a few frame and call counts). The browser suite's expectations did not move.

### Golden hashes

Moved, re-recorded in `df117e8` (all 33 cases whose `steamRule` is true; 29 in WAV and codecInfo, 4 in codecInfo
alone, marked \*): `steam`; `steam, gate off`; `steam, gate on at -30 dBFS`; `steam, high-pass 250 Hz and
low-pass 3500 Hz`; `steam, mic gain 4 (capture clipping)`; `steam, auto-gain off`; `steam, voice_scale 0.5`;
`steam, voice_avggain 0.25`; `steam, loss 15%, jitter 50 ms, net_split 40 ms`; `steam, source at 44100 Hz`;
`steam, source at 96000 Hz`; `steam, source at 22050 Hz`; `steam, 1,000,003 samples (a prime) at 48 kHz`;
`steam, 1 s pushed a sample at a time`\*; `steam, six minutes`; `steam, jitter 500 ms (late frames play as
silence)`; `steam, snd_bits 4 (SILK frames)`; `steam, source at 24 kHz`; `steam, volume 1, voice_maxgain 3`;
`steam, volume 0.3 (a volume whose product rounds)`; `steam, auto-gain off, voice_scale 3`; `steam, dsp_room 1 (no
effect)`; `steam, custom room at mix 0 (no effect)`; `odd options` (an unknown codec falls back to `steam`); `test
position with a low-pass` (the default codec, `steam`); `steam, empty source`\*; the four `steam, N samples at R
Hz (an output length of …)` cases; `steam, silent but for a quarter frame of sine at the end`\*; `steam, gate off,
loss 80%, seed 1 (…)`\*; `steam, gate off, loss 40%, seed 3 (…)`. The four in codecInfo alone gained
`sender.uptime` and kept their sound.

Unchanged, hash for hash (shown by `--hashes` before the re-record, and the re-record's diff touches only the 33):
`steam_48`, `celt_22`, `celt_44`, `speex`, `steam, codec bypassed`, `demo voice as received`, `celt_22, gate on,
loss 15%, jitter 300 ms`, `celt_44, gate on, loss 15%`, `speex, gate on, loss 15%, jitter 300 ms`, `steam_48, loss
10%, jitter 100 ms, snd_bits 10`, `celt_22, source at 22.05 kHz`, `speex, source at 11.025 kHz`, `speex, source at
8 kHz`, `test profile with a decoder EQ`, `celt_22, one sample at 22.05 kHz`, `speex, 100 samples at 96 kHz`,
`steam_48, silent but for a quarter frame of sine at the end`, `demo voice as received, past full scale`.

## Readings of the order

1. **`tests/REFERENCE_2026.md`.** The order lists it under "May not touch" (the orchestrator writes the order's
   texts before the merge). The brief asks the builder to change in it only what the build makes untrue: "the app
   today" for the hold, the clock and the empty read. I did that alone (`0889e92`): finding 28's app paragraph,
   with the old words in a dated correction; the Model table's voice gate row (the order's own words for the app's
   column) and its lists of merged and unbuilt orders, and the line "the app today is what the code runs at the
   merge of W3-11a and W3-16"; the unverified section's two lines on the app. The order's other texts (finding 16,
   28's game bullets, 29, the Network row, W3-09's corrections) are not mine and were not touched; most are
   already in the file.
2. **Checks added to `tests/verify.js`.** Item 8 says that file changes only where the sender's schedule moves an
   expectation. Item 5 (`steamUptime`, `codecInfo.sender.uptime`, no clamping) needs a Node check, and the house
   rule is a test for every change, so four checks were added there (the browser suite has the order's own). The
   one moved expectation is the laying check's seed.
3. **`info().uptime`.** `codecInfo.sender.uptime` is taken from the sender's `info()`, which gains `uptime`: the
   value the sender really ran with, rather than a second copy of the default in `audio.js`.
4. **Where the choice is hidden.** No page script shows or hides the threshold's control (it is always shown with
   the advanced controls). The line that hides "Sender's Steam has been running" for profiles other than `steam`
   went into `updateSignalChain()` in `app/console.js`, which runs on every settings change, preset, applied
   config and at start. `style.css` needed nothing (`.control` sets no display, so `hidden` works).
5. **`steamUptime` for other profiles.** `renderOptions()` leaves it out (undefined) unless the profile is `steam`,
   so the batch key does not change on profiles it cannot affect. A demo's received voice keeps the value in its
   key and ignores it (the sender does not run).
6. **The `clock` option given as `null`** is a `RangeError` naming the clock ("anything else"): only a missing
   option means the seeded clock. Nothing passes `null` today.
7. **A clock's first read** may have any finite time ("not below the last" has no last yet). `since` is not
   required to grow; ticks never go back anyway (`max(last + 1, …)`).
8. **After an empty read in the ended state** the state is silent with nothing kept as past sound, so an onset on
   the next chunk gets 2400 zeros of pre-roll, and an inactive chunk first is kept as past sound (checked: an onset
   after one such chunk gets 750 samples). That is the existing rule for the silent state; the order says nothing
   more.
9. **The clock's statistics "ends"** are counted on reads with samples, which after the first chunk are all reads;
   an end found with `Math.fround(uptime + time)`; the last reads, with no end inside the 300,000, are not counted.
   Reads a second is the reads with samples over `since` from the first to the last of them. The interval check
   allows 1e-9 s for the subtraction of two times of up to 4.7 hours (the values printed are 48.000 and 63.700 ms).
10. **"Messages a second" through the sender** is counted as the old check counted it (messages less 2 over the
    ticks from the first message to the last sound message); it gives 17.901.
11. **The default seed and seeds 4 to 10** being the same at 14400 and 777600 was checked as a statement of the
    order; it holds.
12. **README's sentence** gives the hold as "0.40 s since today, 0.38 to 0.44 s at about a week (the default), up
    to 0.75 s at about a month", from the order's table of the choices.

## What the orchestrator runs privately

The adapted copies are in the planner's scratch, `agents/w3-16-plan/sd/` (`run-new.mjs`, `tail-new.mjs`). The
builder has not seen the takes. With `<checkout>` a checkout of this branch and `<takes>` the private repository:

1. **Set D's demo.** Copy `run-new.mjs` and `tail-new.mjs` over `checks/sender-demo/run.mjs` and `tail.mjs` in the
   private repository (or make the order's two edits there: the hand clock returns `{ time: n * 0.015625, samples:
   750 * k }` with `uptime: 0`; the seeded runs pass `uptime`), then
   `sh checks/sender-demo/reproduce.sh <checkout> <takes>`. Bars: hand clock 18 and 18
   with the table row for row; the test signal 20, 19 and the same column; seeds 1 to 200 at the default at least
   185 (expected 194) and 200; the 440 ms pause split in at least 30 seeds (expected 42); `tail.mjs` 468 to 477 ms
   (expected 472.6). The module's interface is the order's: `createSender({ clock: { next }, uptime })`, `next()`
   giving `{ time, samples }` (with `since` optional).
2. **The accuracy table**, before and after: `node tests/accuracy.mjs --takes <folder> --json before.json` in a
   checkout of `dc1e64b`, the same here into `after.json`. Only `steam` rows may move.
3. **The re-timing check**: `node tests/retiming.mjs --accuracy after.json --generative --engine` and the same with
   `--uptime 14400`. Bars: transitions right not under 55%, start error not over 92 ms; both figures at both.
4. **Set J** (`setj.mjs`) only if item 2's rule had changed. It did not.

Then the figures of 1 to 3 go into `PREDICTIONS.md`'s note (it has public figures only) and the reference's text.

## Runs

On `db9e250` (code and tests as at the head; later commits touch only this report), each under
`flock /tmp/tf2ve-heavy.lock`:

- `pnpm test`: exit 0. Among it: `steam-sender` 106 passed, `render-stream` 270 passed, 0 failed, `voice-channel`
  128 passed, `verify.js` 249 passed, 0 failed.
- `pnpm test:vendor`: the three builds match their recorded hashes.
- The browser suite (with `CHROMIUM_EXECUTABLE` set): 231 passed.
- CI (`tests`, `pnpm test:all`): success on `df117e8`, `0889e92`, `db9e250` and `6c69d59`.

## Not done

- No private run (not the builder's to do).
- O1 and O2 (`max(a[j-1], …)`, `<=` into `<`) are invisible to every test, as the order says; no check was added.

## For W3-11b's builder

- The sender now takes reads `{ time, since, samples }` and an `uptime`; a live chain that drives it from a real
  clock gives each read's time from the session's start and the sender adds the uptime. A read with no samples is
  meaningful (the hold is tested; in the ended state it clears the silence record): pass it, do not skip it. With
  the gate off it does nothing.
- The key-press rules (W3-11b) are not in the sender: a press resets the encoder and the kept samples, not the
  gate's state or the sequence number; the 0.5 s tail after key up in floats on the same clock (`nowF > stopF +
  0.5`, both floats) and the game's in doubles. `nowF` is per read in `nextRead()`; a tail test belongs beside it.
- The empty packet at a key press is an empty read in the hanging state past the hold: `emptyRead()` already sends
  the marker alone when nothing is kept.
- `steamUptime` reaches only the render. The live chain will need the same value from the page
  (`renderOptions().steamUptime`, `steam` only).
- The 17-frame cut needs a chunk over 2250 samples (file input); the sender caps a supplied read at 2250
  (`MAX_CHUNK`), which W3-02g's demo path or a file-input model would have to lift.
