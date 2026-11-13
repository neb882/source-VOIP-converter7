# W3-21: the phase of Steam's capture steps against the sound

The builder's report. The order is `docs/work-orders/W3-21-capture-phase.md`, with the orchestrator's two rulings of
2026-11-13 (below), which win over its text. Branch `claude/w3-21-capture-phase`, from `main` at `af1c4e1` (cache v39).

**Status:** built. Every check of the order's "Done means" was run. All pass but one point, which holds only within a sample: the sound's lag at the mix point (done-means 2) is `main`'s by the whole-sample peak in 15 of 20 seeds and one sample more in 5. That one sample comes from rounding the anchor (inferred), and why is below. Each new check was shown to fail with the code it covers broken.

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

| Commit | What |
| --- | --- |
| `1ba6894` | `steam-sender.js`: the lead; `tests/steam-sender.verify.mjs`: the second copy takes it, the re-pinned values, the new checks |
| `1656762` | `tests/voice-channel.verify.mjs`: seed 4's pins, the seeded statistics, the zero check's bound |
| `eff939c` | `tests/render-stream.verify.mjs`: the 50 cases' hashes and the history note |
| `0cc274d` | `tests/steam.verify.js` (the gate-off starts and source) and `tests/render-channel.verify.mjs` (seed 8) |
| `c83dec3` | `tests/REFERENCE_2026.md` (finding 28), `tests/predictions/PREDICTIONS.md`, `docs/ACCURACY.md` |
| `89b6683` | `tests/steam.verify.js`: the sound at the mix point (done-means 2) |
| `e80a06d`, `d2665c8` and after | this report; `origin/main` merged (RP-01a and the order's rulings) |

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
- The tie of the lead to `c0` is chosen: nothing read or measured ties the capture's phase to the clock's first read;
  `c0` (itself the clock's own uniform draw over one step, chosen) is a source of one uniform number that draws
  nothing new. That Steam's capture runs free of the sound is inferred (`docs/reports/W3-16-second-read.md` read
  that Steam rounds nothing to steps and takes whatever the read position gained; how the position moves is
  inferred; one phase through a session is measured on Set D alone).
- A real phase is set when the capture device starts at a key press (W3-09 read that the device is started at a
  press after the capture has fully stopped), so one uniform phase a render is the model of a held key or an open
  microphone; a phase drawn again at each press is not built yet.
- With the gate off a render now sends up to 31 ms more zeros before the source; that is a convention of the app's
  own setting, not something read of Steam.

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

| Case | WAV, old to new | codecInfo, old to new | gain output, old to new |
| --- | --- | --- | --- |
| steam | `bb7ef37d9d65` to `425c012e59ae` | `4992fbdbd3ef` to `a47b6c428d0c` | `58c2c5c4a9d2` to `563d66526152` |
| steam, gate off | `6e461e765c97` to `b79a0095e357` | `e1fee0afcc93` to `cd4059e403a4` | `47a1391636a1` to `77679c0789b4` |
| steam, gate on at -30 dBFS | `45eda63a770c` to `634a8add0f62` | `a925df4dc580` to `94ffa390cfd5` | `7189011696a8` to `e8e46a166d70` |
| steam, high-pass 250 Hz and low-pass 3500 Hz | `b9e5adab6d0a` to `f66c6c59b750` | `be86cbc6a614` to `f0e60509be59` | `a48a816f067b` to `7b337e4e39c9` |
| steam, mic gain 4 (capture clipping) | `3eca5251d655` to `35c0a5edb23c` | `a079b08a14d4` to `656fc2fe4297` | `80d66d33e1f5` to `a17ed830a1e3` |
| steam, auto-gain off | `164d52e0c980` to `0788808deeda` | `d4f9815a5782` to `de3d85de3e4c` | `7793f0856b6c` to `9fcdf4965de0` |
| steam, voice_scale 0.5 | `6402ef67462b` to `480c84f1306e` | `e102db2318a5` to `e791ed03f2d6` | `e701a59e4d62` to `abfba531a69f` |
| steam, voice_avggain 0.25 | `aa415b8c6342` to `71e6f5e25f97` | `e102db2318a5` to `e791ed03f2d6` | `789ddec205ab` to `b4b0131756d5` |
| steam, loss 15%, jitter 50 ms, net_split 40 ms | `8c2989c0a634` to `851350d329c3` | `631209b3abc6` to `6c210e8940cf` | `1ffca9327d61` to `26faab1ba90f` |
| steam, source at 44100 Hz | `57399adf16ef` to `b090235c8331` | `d911f7b597eb` to `5f2093e17682` | `b484bf7e8e0e` to `738eb36b8984` |
| steam, source at 96000 Hz | `e135aa8e27b5` to `78a9098e0ca7` | `e6f329418ead` to `cb0fcf7faafe` | `ff5a5f15c5fb` to `9acc67088d22` |
| steam, source at 22050 Hz | `f89979184968` to `c63bb3460c60` | `37e827b164ce` to `4f8bf12cd60f` | `98732c1bcae5` to `608f5f8f3c2e` |
| steam, 1,000,003 samples (a prime) at 48 kHz | `9fa59334706f` to `924c2005038c` | `d0f1b8278359` to `7693b2fb3293` | `59a59a3dd774` to `e8ba93a8a7d5` |
| steam, 1 s pushed a sample at a time | `7e3bb253d9a2` to `1d825c8196d0` | `8b1fd91dd197` to `3b05b305a695` | `6dcad2dc5ace` to `9185183acac0` |
| steam, six minutes | `4d2dba65f5ea` to `17ff4250d7a5` | `5a8ab9cae5cc` to `ecbd41be1e20` | `6e8b9dac8520` to `01bc8c0740b4` |
| steam, jitter 500 ms (late frames play as silence) | `38c43494a760` to `7a84d9b55600` | `cb26383f153e` to `7fd1c7b9f1b6` | `9d4c60bf8618` to `d26dcad0c05b` |
| steam, snd_bits 4 (SILK frames) | `ff80b3c0ba5e` to `405cfa452821` | `0f3e32b5a394` to `90752a2c322c` | `df32d452cba5` to `51a314158057` |
| steam, source at 24 kHz | `76c8e189892a` to `046a1199d830` | `1baeda17efb0` to `4f8276463d25` | `0923ce2fff4d` to `99276e7b0692` |
| steam, volume 1, voice_maxgain 3 | `840051d93a5c` to `0ad7c9bff192` | `ad208ca860fd` to `a26aab671b17` | `461e531f514e` to `b115cd2170a5` |
| steam, volume 0.3 (a volume whose product rounds) | `7ce019df36b8` to `3bf9a489dd0b` | `ad208ca860fd` to `a26aab671b17` | `92643715eabd` to `d7ca57fe6b6a` |
| steam, auto-gain off, voice_scale 3 | `f4bcb71b9b5b` to `da673383e1d3` | `e6a5f35e19d6` to `ee181ca25aba` | `2f2373fd6de3` to `d74f421b1bf9` |
| steam, dsp_room 1 (no effect) | `b673515cfa58` to `2e4881230bb5` | `ad208ca860fd` to `a26aab671b17` | `92643715eabd` to `d7ca57fe6b6a` |
| steam, custom room at mix 0 (no effect) | `b673515cfa58` to `2e4881230bb5` | `ad208ca860fd` to `a26aab671b17` | `92643715eabd` to `d7ca57fe6b6a` |
| odd options | `711b9f02e372` to `25002ac78175` | `a61dc90c3f4c` to `1f5f97dab4ce` | `d82ae8d81584` to `a04d7965764a` |
| steam, empty source | not moved | `09ce131d4df4` to `a8aaa71a8541` | not moved |
| steam, gate off, loss 80%, seed 1 (long runs lost inside a spurt) | `a9d6a68e9942` to `c88912d5ff3e` | `e08891a43e75` to `8369938e2df3` | `79627dd24ca2` to `3f03f512d92d` |
| steam, gate off, loss 40%, seed 3 (long runs lost inside a spurt) | `beb16e00e214` to `659877898664` | `46a8eb84bb98` to `22c357527d3d` | `5f786410f15e` to `6525c4623fe7` |
| steam, 192004 samples at 24000 Hz (an output length of 352807.35) | `f0a8821f065a` to `db4c97e7032a` | `4ff570d0b80d` to `18e20f044956` | `a82b7c82a271` to `a3761720d2c6` |
| steam, 256007 samples at 32000 Hz (an output length of 352809.65) | `246207f88911` to `1028ff4f55bd` | `924b7ab9c414` to `a43cf5907c0c` | `24ea514ae6b6` to `d7238bd19fd0` |
| steam, 302401 samples at 37800 Hz (an output length of 352801.17) | `558c0e3b035f` to `e3532619ff89` | `28af3a677cef` to `8b991b8e07bc` | `a73c7d15d47d` to `f5661a015077` |
| steam, 88203 samples at 11025 Hz (an output length of 352812.00) | `ce5956fa7724` to `f986906be8e4` | `63be92b7f61d` to `c21e5ea94043` | `bd2d74515725` to `3fdec844d41b` |
| steam, room: preset 6 | `15aeef0b9e35` to `ae520e3a97cf` | `63114f6dded2` to `156a761064f9` | `041a0f6a6c6b` to `45119698b162` |
| steam, room: preset 17 (random taps) | `d669ba894aba` to `4414f4f3e223` | `e9d20c28085b` to `6ffc24712276` | `041a0f6a6c6b` to `45119698b162` |
| steam, room: automatic, tunnel | `248168cbb57f` to `7acd6966ffa7` | `3e5ab9576fa7` to `46e530ef6e37` | `041a0f6a6c6b` to `45119698b162` |
| steam, room: automatic, great_hall | `decaaea48dba` to `59992681c65d` | `4348cfae1a41` to `6688f28df042` | `041a0f6a6c6b` to `45119698b162` |
| steam, room: automatic, set_c_room | `14124e8f7ee0` to `0824116c8a87` | `587a68a88697` to `a84b1afd8c41` | `041a0f6a6c6b` to `45119698b162` |
| steam, under water | `3651d212e783` to `23756d866856` | `b9e2c3d92c48` to `ed3a699a7894` | `041a0f6a6c6b` to `45119698b162` |
| steam, under water, preset 6 | `ed5ab9d7fb1c` to `3753eee04d1a` | `fa6bf944d100` to `f59e46a6e481` | `041a0f6a6c6b` to `45119698b162` |
| steam, custom room at mix 0.3 | `8ccb91c1b005` to `d3daf78a6fae` | `52f7534ca038` to `835d169325e2` | `041a0f6a6c6b` to `45119698b162` |
| steam, listenerPos tunnel (preset 6), loss 15%, jitter 50 ms | `96c72a5678d1` to `81dcafd4f8e5` | `3a464c80004c` to `a7e430f6cfd7` | `dd4e9f10b3d6` to `7e4a24e1a6b3` |
| steam, room: preset 17 (random taps), seed 7 | `ce6aed2c10bf` to `41d01e9476f8` | `d01e1ea35b43` to `28d88b4c65c1` | `d2c879b48361` to `ce4c69a3bb9f` |
| steam, room: preset 6, device at 96000 Hz | `a66810f6d38f` to `702e6b2546da` | `63114f6dded2` to `156a761064f9` | `041a0f6a6c6b` to `45119698b162` |
| steam, dsp_room 137 (no room) | `61a61407a1d1` to `1f5a480181f4` | `88cd058f344e` to `b7fef488e643` | `041a0f6a6c6b` to `45119698b162` |
| steam, timeline game | `22b155824ca3` to `07b120e216fb` | `fedefd44a406` to `8a25c06f1d99` | `37fe57f3e70d` to `4c9e3a714e5a` |
| steam, timeline game at 66.67 fps | `ad1cfe8ebeef` to `9bc778b77e21` | `bf9907faa513` to `d300088812a9` | `4ac4eee9c0bb` to `d41873a68707` |
| steam, timeline game, gate off | `f89cbe08aa5e` to `aa5e30bf5d30` | `019d7a9446c4` to `251b697774da` | `1737150b0913` to `2d766c34b2cc` |
| steam, timeline game, loss 15%, jitter 50 ms | `a42317ed5a11` to `6fef3ffd71a7` | `dc6a8b6dd5ea` to `d409363d140b` | `058c282c23aa` to `a4fff0acbfea` |
| steam, timeline game, auto-gain off, voice_scale 0.5 | `b1d6dc99a856` to `3897ca305578` | `d068730fc43e` to `41d484b1afc3` | `51718e3101a9` to `90f9a0af8b84` |
| steam, timeline game, device at 44100 Hz | `1638690040e0` to `46e7354c06d6` | `fedefd44a406` to `8a25c06f1d99` | `37fe57f3e70d` to `4c9e3a714e5a` |
| steam, timeline game, room: preset 6, seed 7 | `92a7e5f58cd1` to `8f5fb47b06d1` | `28075a1e3fef` to `527e01a3a706` | `375d70eb06e2` to `9637b96443ca` |

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
  forced to 0 (`const lead = o.lead !== undefined ? o.lead : 0`): `25 of 25 suites passed. 894.8 s summed` (every suite but the browser's, as recorded on `main`).
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
  (measured; not explained).
- At lead 0, on `main` as it stands, the mean is +1.0 to +3.6 ms on the larger blocks: the constant was fitted on
  seeds 1 to 50, and the spurts of one seed are not independent, so the standard errors above understate the spread
  between blocks. Measuring it again is an order of its own (the orchestrator's).

## Done means

1. **`node tests/run.mjs steam-sender`** passes: `120 steam sender checks passed`. The new checks, each shown to fail with the code it covers
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
   sample against `main`'s figures; it fails with the start left unshifted (seen: `-56.731 to Infinity samples`, with the gate-off checks failing beside it).
3. **`flock /tmp/tf2ve-heavy.lock pnpm test`**: `25 of 25 suites passed. 900.0 s summed, 900.0 s of wall time, 1 at a time.` (before the merge of `origin/main`); after the merge the `units` group, with RP-01a's new `reproduce` suite, `21 of 21 suites passed`. **The browser suite**: `browser  browser  passed  240.2`, `1 of 1 suites passed`.
   `node tests/cache-number.mjs origin/main --report`: `cache number against origin/main (ed14c5b): the number is v39, not above v39: it must rise (node tests/cache-number.mjs origin/main --set)`
4. **`git diff origin/main --stat`**: after the merge, `steam-sender.js`, `docs/ACCURACY.md`, `docs/reports/W3-21-capture-phase.md`, `tests/REFERENCE_2026.md`, `tests/predictions/PREDICTIONS.md`, `tests/render-channel.verify.mjs`, `tests/render-stream.verify.mjs`, `tests/steam-sender.verify.mjs`, `tests/steam.verify.js` and `tests/voice-channel.verify.mjs`. Each is in "May touch" or was allowed by the rulings. `sw.js` is not touched: no file was added
5. This report.

## CI

The result of the `tests` workflow on the branch is in the hand-back (it names the commit tested); this report is written before the push.

## Scanned

The branch's diff against `origin/main` and its commit messages were scanned for recordings, personal details, real
SteamIDs and model names: none, apart from the attribution trailers.

## Not done, or not checked

- The private runs against the takes (the accuracy rows, the Set D and Set G replays, the speech take, the loss
  takes, at Steam's own threshold) are the orchestrator's and were not made.
- The arrival constant is not measured again (the orchestrator's later order).
- The lead's paired effect of about -0.3 to -0.9 ms on the zero is measured, not explained (the fix round's run
  below does not support the second reader's likely cause).
- `c0` still delays every step's readiness by `c0` after the step ends (rule 2 keeps this so that the arrival figure
  stands), where a free-running capture has a step ready when it ends. It is for the order that measures the arrival
  figure again.
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

## Fix round (2026-11-13)

The review said merge, with no defect in the code, and the second read found the arithmetic sound. Both asked for
wording and two small test changes. No recorded value moved, and `steam-sender.js` changed in comments only.

**CI of the head before this round:** run 43366044216 on `f38878d`, `verify` success (units, engine, render,
stages and browser all success).

**Tests.**
- `tests/steam-sender.verify.mjs`: the openings' shares (0.790 / 0.165 / 0.045) are this build's own output. The row
  is now named for that: values recorded with the capture's lead, a guard against regression, not a comparison
  with the prototype. The second copy agrees with the module on all 400 seeds already, so working the shares out
  through it would not be a second route.
- `tests/voice-channel.verify.mjs`: the zero check says its standard error is taken by spurt and prints the one by
  seed (1.404 ms from each seed's mean over its spurts; the second reader measured 1.444 ms). Beside it, a paired
  check: on seeds 1 to 50, each seed's zero with the lead less its zero at lead 0, within 3 standard errors by seed
  of 0. It reads -0.325 ms with a standard error of 0.580 by seed (the second reader's figures). With each read's
  `since` left unshifted it reads +16.078 ms (standard error 1.419) and fails. `engineRun` in
  `tests/voicequeue/synthetic-results.mjs` takes a `lead` for it; left out, it is the seeded draw as before.

**Words.** In `tests/REFERENCE_2026.md` (finding 28), the predictions' note and `docs/ACCURACY.md`:
- that the capture runs free is inferred everywhere, with what was read;
- `c0`'s range and the lead's tie to it are chosen;
- the two means of Set D show a phase other than zero but cannot tell 318 from its mirror or from a uniform draw. The
  second read's rows are cited as its own: 318 gives 79.903 and 37.810, 432 gives 79.903 and 37.788, the seeded draw
  79.871 and 37.833, against 79.63 and 37.5. They were not run again here. 318 and its side rest on the start offset alone;
- the arrival figure was not changed, and its measurement moved (measured, not explained);
- the second reader's likely cause is given as inferred;
- one phase a render is the model of a held key;
- the gate-off zeros are a convention of the app;
- the predictions' note says how a spurt is laid on a whole sample.

**The cause, tested** (the optional run; measured on the model, seeds 1 to 200, the suite's layouts P and Q, each
seed's mean over its opened spurts with the lead less the same at lead 0):

| Signal level | 300 fps | 66.67 fps |
| --- | --- | --- |
| 1000 (the suite's) | -0.350 ms, standard error 0.366 by seed | -0.912 ms, 0.390 |
| 6000 (above 4915: a part step of sound always opens the gate) | -0.616 ms, 0.325 | -0.317 ms, 0.348 |

The shift does not vanish above 4915. So the second reader's cause (a part step failing the gate at the suite's level)
is not shown by this run, and the shift stays not explained.

**Checks of this round:** FIX_CHECKS

