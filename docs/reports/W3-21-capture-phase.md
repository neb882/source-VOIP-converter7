# W3-21: the phase of Steam's capture steps against the sound

The builder's report. The order is `docs/work-orders/W3-21-capture-phase.md`, with the orchestrator's two rulings of
2026-11-13 (below), which win over its text. Branch `claude/w3-21-capture-phase`, from `main` at `af1c4e1` (cache v39).

**Status:** built. RESULTS_STATUS

## The rulings this build follows

The build stopped twice and was ruled on both times (2026-11-13):

1. **The gate off.** The rule as written applies the lead whatever the gate is, and every gate-off seeded `steam`
   render moved, where the order's stop list named them. Ruling: the lead applies whatever the gate is (Steam's
   capture phase does not depend on it). The gate-off rows move under the same `lead: 0` proof. In the check that the
   live chain is the render, the spurt's start becomes `-S.preroll - lead`, and the samples' equality is unchanged.
2. **`tests/voice-channel.verify.mjs`**, not in "May touch", pins a seeded sender run and seeded statistics. Ruling:
   it may be edited for values the lead moves. Its zero check was measured again with four times the spurts. The
   mean with the lead was 2.04 ms off zero on seeds 1 to 200, but 2.68 ms at lead 0 on the same seeds: the constant
   was fitted on seeds 1 to 50. Second ruling (choice A): `ARRIVAL` stays 50.5 ms, `voice-channel.js` is not touched,
   and the check's bound becomes 3 standard errors of its own 50-seed run. The order's 0.5 ms line is struck.

## Commits

COMMITS_TABLE

## The rule as built

All in `steam-sender.js`; no file under `engine/` changed.

- `createClock({ seed })` gains a read-only `lead = (750 - round(c0 x 24000)) mod 750`, computed from the `c0` it
  already draws. Nothing more is drawn: `CLOCK_HASH` and `REF_READS` pass unchanged.
- `createSender` reads `lead` zeros before the source's first sample. Step j is samples 750 j - lead to
  750 j - lead + 749 of the source.
- Each read's `since` (the time from the render's start, which sets the ticks) is the read's less `lead / 24000` s.
  Steam's own clock (`time`, which with the uptime sets the hold's float grid) is not shifted.
- Every position the sender reports (`info().spurts[].start`, each message's `start`) is in samples of the source:
  its own count less `lead`. A spurt can start up to 2400 + 749 samples before sample 0; the timeline already lays a
  spurt that starts before 0 (the pre-roll), so no engine file needed a change.
- `opts.lead`: a whole number from 0 to 749, else a `RangeError` naming `lead`. With the seeded clock it overrides the
  draw. With a caller's clock the lead is `opts.lead`, or 0 when it is not given, so every test that feeds its own
  reads gives what it gave.
- `info()` gains `lead`.
- What the lead's zeros make before the first push (only with the gate off and a caller's clock whose first reads
  are shorter than the lead) comes back from the first `push()` or `finish()`.

Why the engine needs no change: the render's give-out bound (`steamGiveOut`, a message starts at most a chunk and
the pre-roll before the last sample pushed) holds in samples of the source as it held in the sender's own count;
the stream render's tick bound on the game's timeline (a read's `since` is at least the samples given / 24000) holds
with a margin of `c0`; and the live chain's sender is made at its start with the seed, so it knows the lead before
its first sample.

## Recorded values: old and new

Each was shown first to come back with `lead: 0` (next section).

**`tests/steam-sender.verify.mjs`**

| Value | Before | Now |
| --- | --- | --- |
| `REF_MESSAGES` (seed 0xC0FFEE, lead 49) | ticks of messages 3, 5, 15, 19, 27, 40: 87, 94, 131, 146, 175, 223 | 86, 93, 130, 145, 174, 222; the rest the same |
| its two spurts and chunks | from 21600 (104 frames) and 71250 (38); 72 chunks | from 21551 and 71201, same frames; 73 chunks |
| two uptimes, 14400 and 777600 | seed 1: 102 and 40 frames from 21600 and 70500; 104 and 38 from 21600 and 71250 | seed 1 now gives the same spurts at both; shown on seed 2: 102 and 40 from 21046 and 69946; 105 and 33 from 21046 and 71446 |
| first message at both uptimes | seed 1: `[73,0,7]` | seeds 1 and 2: `[71,0,7]` |
| seeds with the same spurts at both uptimes | 0xC0FFEE and 4 to 10 | 0xC0FFEE, 1, 5, 6, 7, 8, 10; seeds 2, 3, 4 and 9 differ |
| openings of 8 / 6 / 9 frames (seeds 1 to 400) | 0.820 / 0.135 / 0.045 | 0.790 / 0.165 / 0.045 |
| the gate off on 95,003 samples | one spurt from -2400, 37 zeros of padding | from -2400 - lead, padded to a whole frame (37 zeros with lead 0) |

The ticks between messages, the silence records and the 17.90 messages a second did not move.

**`tests/render-stream.verify.mjs`** (`GOLDEN`, `GAIN_GOLDEN`): the 50 cases that run Steam's sender. The WAV,
`codecInfo` and gain hashes of 49 moved, and the `codecInfo` hash only of the empty source (the chunk its lead's
zeros make). The first 12 characters of each:

RS_TABLE

No case of another profile moved, nor `steam, codec bypassed`, the two received-voice cases, or the two sources
silent but for a quarter frame at the end (gated whole either way).

**`tests/steam.verify.js`**

| Check | Before | Now |
| --- | --- | --- |
| the gate off: one spurt from | -2400 | -2400 - lead (lead from the sender's `info()`) |
| the gate-off source that ends on an empty end marker (seed 0xC0FFEE), and the end marker's draw | 96,000 samples | 96,000 less the lead, 95,951 |
| the live chain is the render with the gate off: the spurt's start | -S.preroll | -S.preroll - lead; the samples' equality as before |

**`tests/render-channel.verify.mjs`**: seed 8 of section 5 appended 1 spurt and now appends 0 (`info.appended`);
the check's detail now names `appended`. Every other seed appends 1, as before.

**`tests/voice-channel.verify.mjs`**

| Check | Before | Now |
| --- | --- | --- |
| seed 4's pre-roll (lead 599): the first message's start, its source at 44.1 kHz, the spurt's start | -2400, -4410, -0.1 s | -2999, -5511, -5511 / 44100 s |
| 300 fps, after 500 ms: own spurts | 42 of 50 | 35 of 50 (starting -20.7 to +23.1 ms; the bounds -46 to +35 do not move) |
| 300 fps, after 900 ms: how early | 205 to 356 ms | 199 to 375 ms (measured 199.1 to 374.1; 48 of 50 appended) |
| spurts opened at 300 fps, layouts P and Q | 205 | 206 |
| the zero, grid taken out | within 0.1 ms (measured +0.021) | within 3 standard errors of the run, computed by the suite (1.947 ms; measured -0.298) |

The seed-7 fixture of `tests/voicequeue/synthetic-results.mjs` is made when the suite runs and is not recorded
anywhere; its delays move (2011.50 1999.27 1674.56 ... at lead 0, 2008.87 1992.63 1664.17 ... with the lead), and
the checks on it (`tests/retiming.mjs --engine` in `voice-channel.verify.mjs`) pass unchanged. `tests/retiming.mjs
--engine` pins nothing.

## The `lead: 0` proof

- **`tests/render-stream.verify.mjs --hashes`** with the lead forced to 0 by a temporary switch in `steam-sender.js`
  (removed; it was never committed): all 83 cases give their recorded `GOLDEN` and `GAIN_GOLDEN` hashes. With the
  lead, the 50 cases above move.
- **`main`'s whole `pnpm test`** in a worktree of `origin/main` with this branch's `steam-sender.js`, its seeded lead
  forced to 0 (`const lead = o.lead !== undefined ? o.lead : 0`): PROOF_RESULT
- With lead 0 forced the W3-16 schedule comes back, as a committed check: `REF_MESSAGES` as W3-16 recorded it, the
  spurts from 21600 and 71250, 72 chunks.

## The arrival figure

The zero check of `tests/voice-channel.verify.mjs`: the mean `offsetStartMs` of every opened spurt, layouts P and
Q, 300 and 66.67 fps, with the block grid taken out. Method of `zero.mjs` (a scratch script, not committed): the
suite's `engineRun` for each seed, with `createSender` wrapped to force `lead: 0` for the lead-0 column; the mean and
its standard error over every opened spurt (by spurt).

| Seeds | Lead 0: spurts, mean ± SE (ms) | With the lead: spurts, mean ± SE (ms) |
|---|---|---|
| 1 to 50 (the suite's run) | 455, 0.021 ± 0.654 | 456, -0.298 ± 0.649 |
| 1 to 200 (four times) | 1819, 2.681 ± 0.326 | 1821, 2.037 ± 0.328 |
| 51 to 200 | 1364, 3.568 ± 0.373 | 1365, 2.816 ± 0.378 |
| 201 to 400 | 1814, 0.959 ± 0.329 | 1821, 0.440 ± 0.326 |

- The suite's own figure moves from +0.021 to -0.298 ms (measured). `ARRIVAL_MS` stays 50.5.
- Paired by seed, the lead lowers the mean by 0.32, 0.64, 0.75 and 0.52 ms in the four rows: the same sign every time
  (measured; not explained). A capture step is 31.25 ms.
- At lead 0, on `main` as it stands, the mean is +1.0 to +3.6 ms on the larger blocks: the constant was fitted on
  seeds 1 to 50, and the spurts of one seed are not independent, so the standard errors above understate the spread
  between blocks. Measuring it again is an order of its own (the orchestrator's).

## Done means

1. **`node tests/run.mjs steam-sender`** passes: SS_RESULT. The new checks, each shown to fail with the code it covers
   broken (seven breaks, below):
   - the lead is `(750 - round(c0 x 24000)) mod 750` for seeds 1 to 1,000, by a second computation from the second
     copy's own `c0`; over seeds 1 to 100,000 no value from 0 to 749 is missing (each comes 97 to 171 times);
   - the clock's `lead` is read only; `info().lead` is the draw, `opts.lead`, or 0 with a caller's clock;
   - with `lead` forced to L of 0, 1, 318 and 749, seeds 1, 0xC0FFEE and 77, three sources (the reference signal, one
     loud from sample 0, one of 100 samples, shorter than most leads), the gate on and off: the messages are lead 0's
     on L zeros and the source, starts less L, ticks from each read's `since` less L / 24000; the second copy agrees;
     1006 of 2116 ticks are earlier than lead 0's on the longer source;
   - a spurt that opens in the first step (lead 749) has its pre-roll and the lead before sample 0;
   - a caller's clock of 100-sample reads, lead 749, the gate off: what the zeros make comes from the first push;
   - **the 1 s burst** (48000 to 71999, after 2 s of silence), seeds 1 to 200: 33 steps hold some of it in 199 of 200
     seeds; 32 in every seed with lead 0. **The two means:** its spurt sends **80.040** frames with the lead and
     **78.500** with lead 0, 1.540 more (one step is 750 / 480 = 1.5625 frames);
   - `opts.lead` -1, 750, 1.5, NaN, '5', null and Infinity are refused, with the seeded clock and with a caller's.

   The breaks, each run against the suite with its checks reporting instead of stopping: the lead's rounding
   (`floor` for `round`), `since` not shifted, the start not shifted, the zeros not read, `opts.lead` not checked,
   the seeded lead not used, the pending messages dropped. Each fails at least one new check.
2. **The sound is not moved.** For seeds 1 to 20, a speech-like source at 44.1 kHz, the gain's output (the mix point)
   of `process()`, `createRender` and the live chain against the source, by correlation within 60 samples and a
   parabola through the peak. On `main`: 23.804, 23.804 and 23.902 samples in every seed. With the lead: 23.66 to
   24.70, each within a sample of `main`'s, and `process()` and `createRender` equal in every seed. By the whole
   sample (the plain peak) the lag is `main`'s in 15 of 20 seeds and one sample more in 5 (seeds 4, 5, 15 and 18 in all
   three, and seed 14 in the live chain only). The reason (inferred): a spurt's anchor is rounded to the voice rate's
   samples, `round((start - lookahead) x 147 / 80)`, and a start that is no longer on the 31.25 ms grid falls
   between them; a shift by the lead would be up to 1,376 samples. So the order's "to the sample" holds to within the
   rounding of the anchor, not to the plain peak in every seed. The check is in `tests/steam.verify.js`, bound at one
   sample against `main`'s figures; it fails with the start left unshifted LAG_BREAK.
3. **`flock /tmp/tf2ve-heavy.lock pnpm test`**: PNPM_RESULT. **The browser suite**: BROWSER_RESULT.
   `node tests/cache-number.mjs origin/main --report`: `CACHE_LINE`
4. **`git diff origin/main --stat`**: DIFF_STAT
5. This report.

## CI

CI_RESULT

## Scanned

The branch's diff against `origin/main` and its commit messages were scanned for recordings, personal details, real
SteamIDs and model names: SCAN_RESULT

## Not done, or not checked

- The private runs against the takes (the accuracy rows, the Set D and Set G replays, the speech take, the loss
  takes, at Steam's own threshold) are the orchestrator's and were not made.
- The arrival constant is not measured again (the orchestrator's later order).
- The lead's paired effect of about -0.6 ms on the zero is measured, not explained.
- The sound's position is checked on one speech-like source at 44.1 kHz and 20 seeds; other rates and sources were
  not checked for it.
- README.md is unchanged: its one sentence on the read clock ("the times of Steam's reads" among what is fitted)
  still holds.

## For the reviewer

1. The `lead: 0` proof: rerun `node tests/render-stream.verify.mjs --hashes` with the seeded lead forced to 0.
2. A spurt that opens in the first step, a source shorter than the lead, leads 0 and 749: in the forced-lead check.
3. The live chain against the render at three seeds with the gate off: `tests/steam.verify.js`'s check.
4. The lag check of done-means 2 and its one-sample bound.
5. The words in `tests/REFERENCE_2026.md`, finding 28: the standings, and no figure from a private file beyond the
   order's.
