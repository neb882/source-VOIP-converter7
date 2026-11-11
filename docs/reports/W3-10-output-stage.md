# W3-10: the mixer and the output stage as the game's listener gets it

The builder's report. The order is `docs/work-orders/W3-10-output-stage.md`, with its amendment of 2026-11-10 (seven
corrections) applied, and the engine's read of the upsampler (`docs/reports/W3-10-upsampler-read.md`) as the rule.
Branch `claude/w3-10-output-stage`, from `3559672` (main with W3-11b merged).

**Status:** built. Every check of the order passes; `pnpm test`, `pnpm test:vendor` and the browser suite pass under the
heavy-job lock; CI: see "Runs". Reviewed: merge as is; the review's findings F1 to F4 are closed in "After the review"
(F5 is the orchestrator's). **One finding for the orchestrator's private run, before it was made:**
the order's expected change by band holds below 12 kHz (my measurement agrees within 0.04 dB), but not above it. The
device stage's linear interpolation leaves images of the 8 to 12 kHz band in 12 to 16 kHz, which the order's figures
(sinc² against the old filter) leave out; on a synthetic talk signal through the `steam` profile the 12 to 16 kHz band
rises by about 2 dB where the order expects −0.12 dB, and 16 to 19 kHz by 0.6 dB where it expects −0.90. The order says
a band more than 0.05 dB off its figure holds the merge; the section "The change by band" has the measurement and why.
The orchestrator's run on the takes agrees, and the orchestrator restates the order's two rows above 12 kHz.

## Summary

- **The stage after the gain is the engine's, in whole numbers.** Each voice-rate sample (a whole 16-bit value; a value
  that is not whole rounded to the nearest, ties to even) is entered at 255/256 in single precision, truncated
  (`mixEntry`); a 22050 Hz voice is upsampled by two once and an 11025 Hz voice twice, by the read's rule, each stage
  keeping its last input (`mixUpsample2`); the sum is clipped at ±32767, multiplied by `volume` as a single and rounded to
  16 bits, ties to even (`mixClip`, `mixOut`). Then the device stage, a model of the system's mixer: linear interpolation
  from 44100 Hz to the listener's device in whole numbers (`createDeviceStage`, positions by `mixDevicePosition`), 48000 Hz
  by default, nothing at 44100 Hz. The output keeps the source's duration at the device's rate.
- **Gone:** the fitted `[0.1, 0.8, 0.1]`, the float `volume`, the sinc resampler to the source's rate, the soft limiter at
  0.98, the profiles' `mixer` key, `resampleLinear` as the legacy mixer (it stays exported as a utility), `linearStage`,
  `linearLength`, `streamResampleLinear`, `softLimit`.
- **One implementation** serves `process()`, `createRender` and the live chain: the same stage factories, run whole in
  `process()` and a piece at a time elsewhere. The live chain on `steam` equals `createRender({ deviceRate })` sample for
  sample over what it gives out, at 48 and 44.1 kHz contexts; its `contentDelay` is 0.
- **The file holds the render's integers:** `toInt16` and the MOV's PCM write round(s × 32768), ties to even. Until this
  order every positive sample of every download was one unit low. The dry WAV of a 16-bit source still does not
  round-trip exactly in Chromium, before or after this order ("The dry WAV").
- **The page:** "Listener's sound device: 48000 Hz (usual) / 44100 Hz" (`snd_device_rate`, the app's own; share-link key
  `dev`); `volume` defaults to 1, the game's own, with the sentence beside it and the notes at the meter and the lossy
  exports.
- **The control holds:** the 51 golden cases' gain outputs, hashed before any other change, are the same after it; a
  model of the order's spec written in the test gives all 51 renders bit for bit from those outputs; 48 WAV hashes moved,
  3 did not, no `codecInfo` hash moved.

## Commits

| Commit | What |
| --- | --- |
| `9f5b517` | `onGain` on every profile; the gain-output hashes of the 51 golden cases (`GAIN_GOLDEN`), recorded before anything else changed. CI passed on it (run 42907183795) |
| `de2653f` | `audio.js`, `constants.js`, `video.js`: the stage; `tests/output-stage.verify.mjs`; the spec model in render-stream; the suites that rebuilt or pinned the old stage re-derived |
| `fb5de5e` | the page (`index.html`, `app/core.js`, `app/console.js`, `app/render.js`, `app/meter.js`), `sw.js` v27, the browser suite |
| `99692df` | README, `tests/REFERENCE_2026.md` ("the app today" parts only), PREDICTIONS' dated note, `tests/accuracy.mjs` and `tests/reference.compare.mjs` |
| `74a714a` | the golden WAV hashes re-recorded, in a commit of their own, with the reason |
| `e9ceeb7` | the blocks check at chunk size 1 on every profile |
| `8f3ee35` | two checks strengthened after they missed a mutation: positions at two rates with a large `D`; a loud chirp for the MOV's PCM |
| `63590f2` | the by-hand mix check at volume 0.5, after it missed a mutation |
| `bba9ed1` | this report |
| `495c86a` | after the review (F1): `onMixBlock` is handed a copy |
| `899cb8e` | after the review (F3): the live chain's `latencyMs` pinned from its terms |
| (the report's update) | after the review: F1 to F4, and F2 as an open item |

## What was built

**`audio.js`.** A new section, "The mixer and the output stage (W3-10)":
- `mixEntry(s, volume)`: `trunc(fround(s × fround(volume)) / 256)`. The volume is narrowed inside. Exported.
- `mixSample(v)`: a voice-rate float as the 16-bit value the mix is given: roundEven(v × 32768), clamped to −32768..32767.
- `mixUpsample2(x, state)`: the read's pseudo-code as written. Exported.
- `mixClip(v)` and `mixOut(sum, volume)`: the clip, then roundEven(fround(fround(v) × fround(volume))). Exported.
- `mixDevicePosition(n, R)`: `n × N = D × k + r` in whole numbers, with `n` split by `D` first so no product passes 2^53.
  Exported.
- `createDeviceStage(R)`: `roundEven((x[k] (D − r) + x[k + 1] r) / D)` from the integer quotient and remainder (a tie is
  a remainder of D / 2, to the even neighbour); inputs past the end are 0; it keeps the inputs from the next output's `k`
  and waits for `x[k + 1]`; `flush()` makes the outputs that read the last input. At 44100 it passes its input. Exported.
- `createMixEntry(voiceRate)`: the entry and 0, 1 or 2 upsamplings by the voice's rate (11025, 22050 or 44100 Hz: the
  voice's own rate, never a codec's mode rate; another rate throws). Each stage has its own state from 0. `flush()` runs
  one voice sample of zeros through the stages and keeps `factor − 1` of its outputs, so the mix is exactly 2N + 1 or
  4N + 3 long (amendment, point 5).
- `createMixBlocks(onMixBlock)`: the test hook. Starts count from `MIX_BLOCK_ORIGIN` (0, one named value, with the
  comment the order asks for); a copy of each 512-sample block of the sum before the clip once its last sample has
  passed, and a short last block at the end. With no hook it keeps nothing; it never holds samples back.
- `createMixOut(volume)`, the seam (`mixSeam`, `toMixInts`: the listener's low-pass in floats on the mix over 32768,
  rounded back, ties to even; a comment says W3-17c removes it), `stageChain`, `createMixStage`, `createOutStage`, and
  `createOutputStage({ voiceRate, volume, deviceRate, onMixBlock })`, the whole stage as one stream (exported, for the
  checks).
- `deviceRateOf(value)`: an integer from 44100 to 192000, else `VOICE_ENGINE.deviceRate`.
- `process()`: the mix stage over the whole voice; the listener's low-pass and the old room code at the seam in floats
  (the room's tail lengthens the mix as before); the blocks, `mixOut`, the device stage; cut or padded to
  round(sourceLength × deviceRate / sourceRate) plus the room's tail at the device's rate; `sampleRate` is the device's.
- `createRender`: the same stages as one `createOutputStage`, then a final stage that cuts or pads to the contract's
  length; `sampleRate` and `outputLength` at the device's rate.
- The live chain's `mixStages()`: the `onGain` hook, `createOutputStage` with the chain's own states, then the context's
  rate: the device stage at any rate above 44100 Hz (the context is the device, so `opts.deviceRate` is not read there),
  nothing at 44100, the sinc resampler below. `onMixBlock` counts from the chain's first sample at its mix point.
- `toInt16`: roundEven(s × 32768), clamped.
- `onGain` fires on every profile in `process()` and `createRender` (commit `9f5b517`), handing the gain's output before
  the round to even (amendment, point 1).

**`constants.js`.** `VOICE_ENGINE`: `outputFir` out, `deviceRate: 48000` in, `volume: 1`; the profiles' `mixer` key out;
the comments say what each now is.

**`video.js`.** The MOV's PCM: round(s × 32768), ties to even, clamped (`pcm16`). AAC and Opus take floats and are
unchanged (amendment, point 7).

**The page.** `index.html`: the volume control at 1 ("Output volume, 1 = the game's default"), the sentence "At 1, the
game's default, a loud voice fills the whole range, as it does in the game." beside it, the device choice with one
sentence of help in its label's title, and a note at the format choice and the video download that a loud render at
volume 1 can clip in MP3, AAC or Opus. `app/console.js`: `snd_device_rate` (its help says it is the app's own setting,
not a TF2 variable), `dev` in `CONFIG_FIELDS`, a link without `dev` set to 48000, the chain strip's Output reading
"volume 100% · 48 kHz device". `app/render.js` sends `deviceRate` as a number. `app/meter.js`: the true-peak note says
it is what the game's default gives. Built-in presets do not touch the device. `sw.js` cache v27.

## The control of "Golden hashes"

1. **Before any change** (commit `9f5b517`): `onGain` on every profile, and nothing else. All 51 WAV and `codecInfo`
   hashes were identical with the hook added (compared from `--hashes`), and render-stream passed (321 checks). The
   SHA-256 of each case's gain output (the Float32Array `process()`'s `onGain` is handed, as little-endian bytes):

```
"steam": 58c2c5c4a9d2bcfaa3920f0f4ed0a3db6046ac9967dfbfbe1beb288566059512
"steam_48": 67ae552c948f640673b3cc9e5f967228dc96f40010d21300b844a5d1e97b98dc
"celt_22": 21aed940ff7c26e1d4e7042c4352b2dc04319d4e55328d011203cafc96841152
"celt_44": 3ddd31b3aaf82ab940d5cdbed58056ea89819b43097a04bc7c776f03eb342837
"speex": e53997b91477f7278dc990f977737720b32d6c1979b08b5bba79e71a5d47eb5a
"steam, gate off": 47a1391636a1a677949598d1896c4d98d817c6995564afe8158946f55a8e634e
"steam, gate on at -30 dBFS": 7189011696a829fd20bb67fe9bb909cee0b4bb2e27877b32e41745dbab5fe9a5
"steam, codec bypassed": 14902e758a56117e56e389f2f260f101ed6cdbdd4c36a8c93a95764127c691c2
"steam, high-pass 250 Hz and low-pass 3500 Hz": a48a816f067b42dc2d1fb46c7d7522324946742d286a99a07fb58ce805fce6a2
"steam, mic gain 4 (capture clipping)": 80d66d33e1f5d49153ef636e84fe2b8c95c57522856c00fa39d96396e05311b9
"steam, auto-gain off": 7793f0856b6cadd6db810bdafeebf9d817a41c277a80e0c6222f432e37f1bffe
"steam, voice_scale 0.5": e701a59e4d62539721316848e29a9a99222cb19dbcfb98948ca65e2c52fac913
"steam, voice_avggain 0.25": 789ddec205abc69e971be4ad56bc34dbcf40e80f78032e1a54bbf034f7b39cb1
"steam, loss 15%, jitter 50 ms, net_split 40 ms": d4c36c58acc3ecdee69a41985419aa5c15c5bc02163d5f155fd227bdf6c2dbec
"steam, source at 44100 Hz": b484bf7e8e0e35f146190dbea87a085c9597cc73ec3842526e937c0c4761d3ef
"steam, source at 96000 Hz": ff5a5f15c5fbcb5b2212ca8223be0c6b955010cfc981184bb2d36b82bf38d580
"steam, source at 22050 Hz": 98732c1bcae5c82d89367982ce6bcda4f47c503053cfdf72a761965b94c6d9d1
"steam, 1,000,003 samples (a prime) at 48 kHz": 59a59a3dd7747d6a23dfc6ad29564ac91f80f570904241d640c93a71353e02c5
"demo voice as received": 2c27d598935f09f2b919fabd94146d19b2479f080cea0ade3821b5e374383102
"steam, 1 s pushed a sample at a time": 6dcad2dc5ace8809bf2a7be7e3f870e6bf8b44f995c8fbeb0343d1e4ccad4823
"steam, six minutes": 6e8b9dac852070d13f73ec4aadaafb174332c2aaf20e3605ac8df7d0d83d3882
"celt_22, gate on, loss 15%, jitter 300 ms": eb7d94043f8200262342124bd60b0d620cc82028c9de80df28b836b7b5531146
"celt_44, gate on, loss 15%": a887ab28283d73ee61018636afe804942bf998c59a6ff75e8ec01f8885a40c6b
"speex, gate on, loss 15%, jitter 300 ms": 52b05aa5284e805ed48158fad683aaf1d0e64b7cd4b704112e7a7b82e46626a3
"steam, jitter 500 ms (late frames play as silence)": 9d4c60bf861872574a4d7336f7eb78f1ae902c095a3a0b1c5d5333ce19ed9d89
"steam, snd_bits 4 (SILK frames)": df32d452cba5f765a32bb650cf077618c3a8b5ee804f61cfc467e716bf7f3643
"steam_48, loss 10%, jitter 100 ms, snd_bits 10": 60a29df9af7e58794da2e2a0f463a879d3e534cb393ef1fb4adf70c235145940
"steam, source at 24 kHz": 0923ce2fff4d58135bee8981879196c019360e12b0b36f91ff65a4364df4101b
"celt_22, source at 22.05 kHz": e3ddb3a41b93f0ba38532d993f31784015e7959968a517881dcf372f27349b43
"speex, source at 11.025 kHz": c6c570174516fa79283235a051ac364c7acc4c78a82eb5b17a1873d27ea4bd0e
"speex, source at 8 kHz": 50d2def8b103ab07721ad239121e696f7f14797548632fbf4425fa30355aff1e
"steam, volume 1, voice_maxgain 3": 461e531f514ea927cf1102f1e50478ae33c0696fc40814c460eee67fa10204b4
"steam, volume 0.3 (a volume whose product rounds)": 92643715eabd05accfc09b983921e388c64f5ae6127c53747a69d059292f0c32
"steam, auto-gain off, voice_scale 3": 2f2373fd6de358832a5ad6178ebce324de299262c3f4b1c2fdd303cca02ac1b2
"steam, dsp_room 1 (no effect)": 92643715eabd05accfc09b983921e388c64f5ae6127c53747a69d059292f0c32
"steam, custom room at mix 0 (no effect)": 92643715eabd05accfc09b983921e388c64f5ae6127c53747a69d059292f0c32
"odd options": 52c76c0135b7667233f516c2f1c2991e44b812b4c4c86f5b4a933120634ba33f
"test profile with a decoder EQ": 9356252def077c6f884a029f57b71d7a09095ad8cf9cafbeced8b8cf6b54a033
"test position with a low-pass": 92643715eabd05accfc09b983921e388c64f5ae6127c53747a69d059292f0c32
"steam, empty source": e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
"steam, gate off, loss 80%, seed 1 (long runs lost inside a spurt)": d172def5fdf4f1901269da8cf46391e3aa0a9d7167af16d7d632fd2ff0c6e8c5
"steam, gate off, loss 40%, seed 3 (long runs lost inside a spurt)": 2d23678c8e2f9ddcbb2f40622353a822784ee86b70d82cf251c37a85f8eab237
"celt_22, one sample at 22.05 kHz": 7ec2225478271c68195bba12ee36ff65c7e706f0886d0b05a86e8b2d18d7bebb
"speex, 100 samples at 96 kHz": eae3fbcabcc943196634b7c1dfd48940c62e91f2c42abe4725845d49739891b7
"steam, 192004 samples at 24000 Hz (an output length of 352807.35)": a82b7c82a2715817377f21d35c03ecb152e2c082f9ad51aa281c4ce5cae3ff00
"steam, 256007 samples at 32000 Hz (an output length of 352809.65)": 24ea514ae6b60a115046b478043e144b0ee8d09bafcccccc3410602388b6d9b9
"steam, 302401 samples at 37800 Hz (an output length of 352801.17)": a73c7d15d47d6d0b9a85b8fa2919ee11b74f2ade5306e9fa2dda588eead2b9a7
"steam, 88203 samples at 11025 Hz (an output length of 352812.00)": bd2d74515725195f67c70487fdb5a488f79ca5db15e9a84299386a34be102db8
"steam, silent but for a quarter frame of sine at the end": 7c083cfbf0884b8b9232667bf60221dc226ae42757cd61b4e1fb7afc770f1ef1
"steam_48, silent but for a quarter frame of sine at the end": 7c083cfbf0884b8b9232667bf60221dc226ae42757cd61b4e1fb7afc770f1ef1
"demo voice as received, past full scale": 05a8491b26e4add98f106914427ab6f23bef798c32cb5ba8293c4fa37ba1f1a5
```

   They are `GAIN_GOLDEN` in `tests/render-stream.verify.mjs`, checked on every run on `process()`, and the suite also
   checks that `createRender`'s `onGain` pieces, joined, are `process()`'s at every plan.
2. **After the change:** the same 51 hashes, case for case (render-stream [1], on the final tree and in `pnpm test`).
3. **The spec's model** (render-stream [1b]): written in the test from the order's text (the rounding to a whole value,
   the entry, the upsampler with its trailing zero cut to 2N + 1 or 4N + 3, the engine's own `applyBiquad` for the one
   case with a low-pass (amendment, point 6), the clip, `volume` as a single, the device stage by its formula with
   `k = floor(n N / D)` and zeros past the mix, the length), applied to each case's gain output: **51 of 51 renders bit
   for bit**. It ran before the hashes were re-recorded, so it checked the new renders before anything pinned them.
4. **Re-recorded** in `74a714a` alone. `createRender` equals `process()` on every case and plan (render-stream [2]).

**What moved:** 48 WAV hashes. **What did not:** the WAV of `steam, empty source` (as the order says) and of
`steam, silent but for a quarter frame of sine at the end` and `steam_48, silent but for a quarter frame of sine at the
end`: both are gated whole and render as zeros at 48000 Hz, before (the source's rate) and after (the device's). The order
predicted one unchanged WAV; these two are the same reason, a silent render at an unchanged rate. **No `codecInfo` hash
moved. No gain-output hash moved.**

## The checks

`node tests/output-stage.verify.mjs`, 99 checks, all pass (about 15 s; in `pnpm test`); 102 since the review ("After the
review").

| Check (the order's) | Result |
| --- | --- |
| The entry: `mixEntry(s, 255)` is trunc(s × 255 / 256) on all 65,536; −29128 and 2809 at the room's volumes (exact division −29127 and 2808); 32767 → 32639, −32768 → −32640; a double volume that is not a single gives its single's (all 65,536 samples; left unnarrowed, 20 would differ) | pass |
| A value that is not whole: `steam`, auto-gain off, `voice_scale 0.5`: 70,489 of 176,400 values on k + 0.5, each entered as its even neighbour (onGain against onMixBlock); truncated, 33,167 would enter otherwise, half up 32,083 | pass |
| The upsampler by the read's tables (seven small cases, one and two stages); the ramp across a block's edge (510 to 513: −3, −1, 0, 2; the first four −383, −766, −765, −763); two stages (508 to 515: −9 … 4); one call equals calls of 1, 127, 128, 256 on 6000 seeded values, one stage and two | pass |
| Entered first: 127, 255, 254, 254, 127, 0 against 127, 255, 255, 254, 126, 0 upsampled first; a `celt_22` render's mix (onMixBlock) is its gain output entered and upsampled once by hand, and `speex`'s twice with two states, from the first block (132,301 and 132,303 samples), at volume 0.5 | pass |
| `mixOut`: (40000, 0.15) 4915; (−27270, 0.15) −4091; the four ties at 0.15 (4, −4, 2, −2); at 0.5, 2, 2, −2; the ceilings 4915 and 3604; `mixClip(−32768)` −32767 | pass |
| The order at the mix: a 1 kHz tone clamped by the gain at full scale (asserted through onGain): plateaus exactly 4896 / −4896 at 0.15, 32639 / −32640 at 1, 3590 / −3590 at 0.11, at 44100 and 48000 Hz, about 16,000 samples on each, none at the ceiling | pass |
| The device stage: the ramp gives 147 n (the first twelve as the order lists), the impulse 0, 14700, 2600, 0; output 80 reads k 73, r 80; the four ties (2, 2, −2, −2); a flat run of 4915 stays 4915; 44100 Hz returns its input; at 88200, 96000 and 192000 every output is the formula, and at 44101 and 191999 over a 200,000-sample run | pass |
| Positions against BigInt: 2008 seeded `n` up to 2^40 and 160,000,000, at 48000, 88200, 96000, 192000, and at 44101 and 191999 (added: see "Mutations", M19) | pass, 0 differ |
| The sound: images of a 1 kHz tone at −1 dBFS at 4900 and 2900 Hz: −65.40 and −66.18 dB (the order: −65.4 ± 0.3, −66.2 ± 0.3); the response at 13 and 18 kHz −2.558 and −5.054 dB against sinc² −2.558 and −5.053 | pass |
| The stream: the device stage and the whole stage (three voice rates, both devices, values whole, not whole and past full scale) at chunk sizes 1, 127, 512, 4096, seeded random and mixed equal one piece; `createRender` equals `process()` on `steam`, volume 1, voice_maxgain 3 (peak 32639) | pass |
| The blocks: starts 0, 512, … and one short last block, the same in `process()` and `createRender` at chunk sizes 1, 127, 512, 4096 and seeded random, for `steam`, `celt_22`, `speex` | pass |
| The length: sources at 8000, 22050, 44100, 48000, 96000 Hz at both devices give round(n × R / rate), and `createRender().outputLength` the same (the mix's own length, by `ceil`, would give 19243 for 19242 at 8000 and 19217 for 19215 at 22050); `celt_22` mixes are 2N + 1, `speex` 4N + 3, their last sample the last mean, the file the contract's length, from sources at 48000, 22050 and 8000 Hz | pass |
| The file's bytes: the clamped voice's WAV at 0.15 holds 4896 and −4896; at 1, 32639 and −32640; a flat run at 4915 / 32768 is written 4915; every sample of four renders' WAVs equals samples × 32768; the header gives the device's rate. The MOV's PCM: `tests/video.verify.mjs` | pass |
| The live chain is the render after its mix point: 48 kHz context at volume 1 and 0.5, and 44.1 kHz at 1: the output equals `createRender({ deviceRate })` over what it gave out (278,100 of 288,000 and 255,505 of 264,600 samples); onMixBlock the same starts and samples (499 blocks); `contentDelay` 0, where the correlation peaks (r 1.00000) | pass |

The rest of the order's checks:

| Check | Result |
| --- | --- |
| Golden hashes, the control's four steps | above |
| `pnpm test` | pass (see "Runs") |
| The browser suite: the device choice on the page, its console name and help, sent, saved, restored, carried by a link (`dev`), a link without it gets 48000, kept across a built-in preset, a render's download at the chosen rate (44100 Hz, 22050 frames for a 0.5 s source); `volume` 1 on a fresh page and after a preset; the sentence; 3f's latency between the chain's 206.9 ms and that plus 400 ms | pass, 246 checks |
| `sw.js` v27; PREDICTIONS' dated note | done |
| `node tests/accuracy.mjs --takes tests/realtake` | not run: there is no `tests/realtake` in the worktree, and the brief says the takes are not to be looked for |

## Mutations

Each mutation was made in a copy of the tree (the scratch folder, `w3-10/mutdir`, from `git archive` of the head), one
at a time, and the named suite run against it (`w3-10/scripts/mutate.mjs`, `mutations.mjs`). The first run (from
`e9ceeb7`) was stopped by a container restart after B4; the second (from `63590f2`) reran the four it had missed, once
their checks were strengthened, two added beside them (M19b, M24b), and the three it had not reached (B5 to B7). All 42
are caught on the final checks; four were missed at first, and the table says what each missed and what now catches it.

| # | Mutation | Caught by |
| --- | --- | --- |
| M1 | the entry at 255 written as a shift | all 65,536 samples (32,640 differ) |
| M2a | the entry in doubles | −29128 and 2809 |
| M2b | the entry rounded to nearest | all 65,536 samples |
| M2c | the volume not narrowed (a double's product rounded to single) | the double volume against its single (20 samples differ) |
| M3 | the entry left out (the voice at full level) | the plateaus (4915 for 4896), the value-not-whole check, the mixes by hand |
| M4 | a value that is not whole truncated | the k + 0.5 check |
| M4b | a value that is not whole rounded half up | the k + 0.5 check |
| M5 | the upsampler in the first text's phase | [255, 254] (255 comes first), the ramp's first four, every table; render-stream (the golden renders of the five CELT and Speex cases) |
| M6 | the upsampler's state reset per call | the tables, the ramp (output 512 is 1, not 0) |
| M7 | the mean rounded toward zero | [−1, 0]; [−5] |
| M8a | one stage for `speex` | the `speex` mix by hand, the length check (4N + 3) |
| M8b | one state for `speex`'s two stages | the whole stage at the chunk sizes, the `speex` mix by hand |
| M9 | upsampled before the entry | the `celt_22` and `speex` mixes by hand |
| M10 | the upsampler's state lost at a chunk's edge in the stream | the whole stage at the chunk sizes; the blocks at the chunk sizes |
| M11 | volume before the clip | `mixOut(40000, 0.15)` (6000) |
| M12 | the volume product in doubles | `mixOut(−27270, 0.15)` (−4090) |
| M13a | ties half up | the ties at 0.15 (5 for 4) |
| M13b | ties half away from zero | the ties at 0.15 |
| M14 | rounding by truncation | `mixOut(32639, 0.15)` 4895, the ties, the render's plateau (4895); render-stream (the golden renders) |
| M15 | the clip at −32768 | `mixOut(−32768, 1)` and `mixClip(−32768)` |
| M16a | a soft limiter left in `createRender` only | `createRender` against `process()` on steam, volume 1, voice_maxgain 3 |
| M16b | a soft limiter left in the live chain | the live equality at volume 1 |
| M17a | the interpolation's phase off by one | the ramp, the impulse |
| M17b | the fraction from the wrong neighbour | the ramp, the impulse, the images |
| M18 | the device stage's value in floats, rounded half up | output 80's ties (3 for 2) |
| M19 | the position by a float (`n × (N / D)`) | **missed at first**: at the order's four rates `D` is 160, 2, 320 or 640 and `n N` stays under 2^53 to 2^40, so floats come out right. Caught after the check also ran at 44101 and 191999 Hz (`D` 44101 and 191999): 1211 and 1192 of 2008 positions differ from BigInt |
| M19b | the device stage's position accumulated in floats (44100 / R added per output) | added with M19: caught by the 200,000-sample run at 191999 Hz (12,472 outputs differ) |
| M20a | the device stage's state lost at a chunk's edge | the device stage at the chunk sizes, the whole stage, the blocks |
| M20b | the device stage applied twice in the live chain | the live equality |
| M21 | blocks counted per chunk in the stream | the blocks at chunk size 127 and the others |
| M22 | the output's length by the mix's (`ceil`) | the length at 8000 and 22050 Hz (19243 for 19242, 19217 for 19215) and others; the blocks (`process()` against `createRender`) |
| M23 | the WAV writer left as it was | the file's 4896 (4895) and 4915; `formats.verify.mjs` |
| M23v | the MOV's PCM writer left as it was (round(s × 32767)) | **missed at first**: the chirp's samples were all under 16384, where that writer rounds back to the value. Caught once the chirp is loud (45,551 of 72,000 samples would change) |
| M24 | the gain's output moved (steam, the auto-gain off: `voice_scale` applied a hair off) | **the control only**: the gain-output hashes of the two auto-gain-off cases (and `createRender` against `process()`); no WAV hash moved, since the entry's rounding to whole values absorbs the change. A first form, on the codec-bypassed path with the auto-gain off, was missed: no golden case renders that path |
| M24b | the gain's output moved (the gain rule rounds its product) | the gain-output hashes of every case with the gain on |
| B1 | the `steam` live chain's `contentDelay` left at the FIR's sample | `contentDelay` 0 at 48 and 44.1 kHz |
| B2 | `onMixBlock` handed the mix after `mixOut` | **missed at first**: every mix by hand ran at volume 1, where `mixOut` changes nothing below the clip. Caught once the by-hand check runs at 0.5 |
| B3 | the upsampler's last mean not flushed (a mix of 2N) | the mixes by hand, the length check |
| B4 | the device stage's flush leaving out the outputs that read the last input | the flat run, the formula at three rates |
| B5 | the device rate taken from a string (`'44100'` accepted) | `verify.js` [6]: the default for the string `'44100'` (44100 in place of 48000) |
| B6 | the live latency keeping the sinc resampler's wait at 48 kHz | `verify.js` [10b]: the latency less `contentDelay` against what the output is short by (207.238 ms for 206.250) |
| B7 | the frame path's delay keeping the output FIR's term | `verify.js` [10b]: the frame path's output against the render (`contentDelay` 313 samples, the peak at 0) and the hold-back; `speex102.verify.mjs`: `contentDelay` 349 for 348 |

Two the order says cannot be made here, and are W3-17c's: a clip on each entry before the sum, and upsampling the sum
of two buffers.

## The change by band (for the orchestrator's private run)

Measured on synthetic signals, the old stage (the tree at `3559672`) against the new, with the accuracy table's own band
code: `reference.js` `describePair`, level-matched at 300 Hz to 3 kHz (so a row is how "sim − take" moves). 30 s each, at
48 kHz, `volume 0.15`, the first second left out. Script: the scratch folder, `w3-10/scripts/bands.mjs`.

| Band, Hz | The order's figure | sinc² against the filter, flat input | talk, `steam`, the defaults | talk, `steam`, `voice_scale 0.5` | white noise, codec bypassed, auto-gain off |
| --- | --- | --- | --- | --- | --- |
| anchor level, 300–3000 | −0.025 | −0.025 | −0.032 | −0.032 | −0.024 |
| 300–500 | (anchor) | −0.009 | −0.002 | −0.002 | −0.010 |
| 500–1000 | (anchor) | −0.008 | −0.001 | −0.001 | −0.007 |
| 1000–2000 | (anchor) | −0.003 | +0.004 | +0.003 | −0.003 |
| 2000–3000 | (anchor) | +0.009 | +0.015 | +0.015 | +0.009 |
| 3000–5000 | — | +0.034 | +0.039 | +0.037 | +0.036 |
| 5000–8000 | +0.10 | +0.086 | +0.094 | +0.096 | +0.089 |
| 8000–10000 | +0.13 | +0.123 | +0.133 | +0.133 | +0.124 |
| 10000–11000 | +0.13 | +0.116 | +0.131 | +0.139 | +0.120 |
| 11000–12000 | +0.10 | +0.088 | +0.140 | +0.142 | +0.117 |
| 12000–16000 | −0.12 | −0.126 | **+1.950** | **+0.717** | +2.067 |
| 16000–19000 | −0.90 | −0.905 | **+0.577** | **−0.360** | +66.0 (nothing there before) |

- **Below 12 kHz the build agrees with the order:** the anchor 0.025 to 0.032 dB lower, 5 to 12 kHz within 0.04 dB of
  its figures (the worst, 11 to 12 kHz on talk, +0.14 against +0.10: the capture roll-off weights that band toward its
  lower edge).
- **Above 12 kHz it does not, and the difference is the device stage's images**, which the order's figures (the response
  sinc² against the filter's) leave out and which W3-07 measured in the takes. Linear interpolation from 44100 to 48000
  Hz puts each component `f` of the mix also at `3900 + f` with amplitude sinc²((44100 − f) / 44100), −22.8 dB for
  10 kHz, and at `7800 ± f` further down. The voice's 8 to 12 kHz content therefore lands in 12 to 16 kHz, where the
  voice itself has little (the codec's band ends at 12 kHz); the old filter made no images. Checked by predicting the
  48 kHz render's bands from the 44.1 kHz render of the same source (deviceRate 44100, no device stage) as the direct
  response plus the images (`w3-10/scripts/images.mjs`):

  | Band, Hz | measured at 48 kHz, dB re 300–3000 | predicted, direct (sinc²) only | predicted, direct + images | the images alone |
  | --- | --- | --- | --- | --- |
  | 5000–8000 | −17.50 | −17.68 | −17.67 | −48.16 |
  | 8000–10000 | −19.79 | −19.98 | −19.98 | −52.19 |
  | 10000–11000 | −23.61 | −23.81 | −23.80 | −52.90 |
  | 11000–12000 | −29.07 | −29.29 | −29.26 | −50.89 |
  | 12000–16000 | −35.36 | −37.54 | −35.58 | −39.98 |
  | 16000–19000 | −44.72 | −46.36 | −45.05 | −50.89 |

  The prediction with the images matches the measured render in every band within 0.2 to 0.35 dB (the same offset in
  every band, from the two spectra's different bin grids); without them it misses 12 to 16 kHz by 2.2 dB. So the images
  are linear interpolation's, at the level it predicts, and the device-stage checks (the images of a 1 kHz tone within
  0.02 dB of the order's figures) say the same.
- **What the orchestrator's run should expect:** below 12 kHz, the order's figures. At 12 to 16 and 16 to 19 kHz, a rise
  whose size depends on how much of a take's sound sits at 8 to 12 kHz against 12 to 19 kHz: about +2 and +0.6 dB on
  this talk, +0.7 and −0.4 dB at `voice_scale 0.5` (less clipping above 12 kHz to drown the images), and much more on a
  source with nothing above 12 kHz. Set A's 12 to 16 kHz was 0.8 to 1.0 dB low in the model; the images may close that,
  or overshoot it. By the order's rule a band 0.05 dB off its figure holds the merge, so the 12 to 19 kHz rows will hold
  it unless the figures are restated with the images. That is a decision for the orchestrator; nothing in the stage was
  tuned for it.

## The live chain's figures, re-derived

`createLiveChain` on the base tree and on the branch (`w3-10/scripts/livefigures.cjs`):

| Profile, context | `contentDelay` before → after | `latencyMs` before → after | low-latency saving |
| --- | --- | --- | --- |
| `steam`, 44.1 kHz | 1 → 0 | 206.898 → 206.875 (the FIR's sample out; no device stage) | 80.042, unchanged |
| `steam`, 48 kHz | 1 → 0 | 207.259 → 206.898 (the FIR's 0.021 out; the sinc resampler's 16 inputs at 44.1 kHz, 0.363 ms, replaced by the device stage's one, 0.023) | 80.042 |
| `steam`, low latency, 44.1 / 48 kHz | 1 → 0 | 126.856 → 126.833 / 127.217 → 126.856 | — |
| `steam`, 32 kHz (below 44.1: the sinc resampler) | 1 → 0 | 207.406 → 207.375 | 80.042 |
| `steam_48` / `celt_22` / `celt_44` / `speex`, 48 kHz | 313 → 312 / 140 → 139 / 280 → 279 / 349 → 348 | 126.523 → 126.500 / 2.925 → 2.903 / 5.828 → 5.805 / 7.279 → 7.256 (the FIR's 1/44100 s out of `delaySeconds`) | — |

- `contentDelay` on `steam` is 0 at any context rate (the entry and `mixOut` have no memory, the voice is not
  upsampled, the device stage starts at phase 0; the sinc resampler below 44.1 kHz is time-aligned). On the frame path
  it loses only the FIR's term; the upsampler's one or three mix samples are in the render too, so they shift nothing
  against it (amendment, point 2). The frame path's `latencyMs` (`preroll + delaySeconds`) loses the same term
  (point 3). The low-latency saving is the difference of two figures that both changed by the same amount (point 4).
- The device stage's wait is counted as one whole 44.1 kHz sample (its most).
- [10b]'s `contentDelay` check now expects 0 (re-derived, with the reason in a comment) and still finds the correlation's
  peak there; "latencyMs less contentDelay is the hold-back" holds at 206.898 against 206.250 ms short plus 0.667.
- [10b]'s `steam_48` live hashes re-recorded: `da75a95f…` with the key held, `d001d5dc…` with the scripted key (before
  `73f46557…`, `a18979bf…`). `steam_48`'s output at the live mix point is unchanged (hashed on the base tree and the
  branch: `dd6e1977…` and `ff745559…` both times), so only the stages after it moved it.
- `tests/verify.js` [10b]'s frame-path check (`steam_48`): `delay` without `+ 1/44100`; `tests/speex102.verify.mjs`: the
  Speex chain's shift is the codec's 80 samples alone (348 at 48 kHz, 349 before).
- Browser 3f: the window (between `latencyMs` and that plus 400 ms) needed no change; its comment gives the new figure.
  The take's render in 3f is now made at the take's rate (`deviceRate: rate`), since the take is at the context's.

## Where a value that is not whole reaches the entry

All with the auto-gain off: the voice times `voice_scale`, clipped at ±32767 / 32768, stored as Float32 (so `fround` of
the product): the `steam` render's stage 4 (`process()` and `createRender`); the other profiles' and the codec-bypassed
stage 4 (the voice after the codec's resampler to the voice rate, times `voice_scale`, clipped); a demo's received voice
with the auto-gain off (the same path); and the same two paths in the live chain (`steamLiveChain`'s `after`, the frame
path's `after`). With the auto-gain on, every path hands whole values (y / 32768). `mixSample` rounds every value in any
case, so a whole value passes unchanged.

## Places that assumed the render's rate (item 9)

| Place | What it now does |
| --- | --- |
| `app/render.js` `presentRender`, `state.processedRate` | already took the render's `sampleRate`; the render is at the device's |
| `app/meter.js`, `app/visualizer.js`, `app/realtake.js` (`renderGuide`, the report) | each reads the rate of the buffer it shows (`state.processedRate`, the source's, the take's) |
| `app/source.js` (the video download) | remuxes at `state.processedRate`; `video.js` takes renders above 48 kHz to 48 kHz as before |
| `batch.js`, `audio-worker.js` | the meter and the WAV from the result's `sampleRate` |
| `meter.js` | analyses at the rate it is given |
| `live.js`, `live-worker.js` | the live take is at the context's rate and lines up by the chain's `contentDelay` (0 on `steam`); nothing changed |
| `video.js` | the MOV's PCM at round(s × 32768); a rate above 48 kHz to 48 kHz (comment updated) |
| `tests/accuracy.mjs` | each of the four page functions reads the render's `sampleRate` and stops with a message if it is not the takes' 48000 Hz (renders use the page's default device, 48000) |
| `tests/reference.compare.mjs` | reads the render's `sampleRate`, refuses one that is not its 48000 |
| `tests/retiming.mjs` | renders nothing (it reads takes): unchanged |
| `reference.js` | not changed, as the order says. Its `clampLevel` falls back to `clipSignature(samples, 48000)`; every render it scores is at 48000 Hz, the default device |

## What silently depended on `volume` 0.5

`tests/verify.js` ("output volume scales the rendered file linearly": now 0.3 against 1, both passed, within 1.5 units of
32768 sample for sample and its RMS ratio 0.30000; plus a check that the default is 1); `tests/browser.verify.js` (the
preset's reset expects '1'; "audible, bounded samples" bounded the tone's RMS at 0.5, now 1; the batch's status pattern
expected a negative true peak, now `−?`); `index.html` (`value="1"`); README (the `volume` sentence); `app/console.js`
(the presets execute `volume ${VOICE_ENGINE.volume}` and follow). The golden `PAGE` options pass 0.5 explicitly, with
the comment changed; every prediction and every take in the accuracy manifest passes its own `volume`.

## Suites re-derived, old and new

| Suite, check | Before | After |
| --- | --- | --- |
| `formats.verify.mjs`, `toInt16(-1, -0.5, 0, 0.5, 1, 2, -2)` | `-32768,-16384,0,16383,32767,32767,-32768` | `-32768,-16384,0,16384,32767,32767,-32768`; and two new checks: every 16-bit value over 32768 is written as itself; ties to even (0.5, 1.5, 2.5, −0.5, −1.5 units give 0, 2, 2, 0, −2) |
| `video.verify.mjs`, the MOV's PCM decoded | `/ 32767` | `/ 32768`, the chirp made of whole 16-bit values, and a check that the PCM holds each as itself |
| `gain.verify.mjs` | rebuilt the old stage after the gain to compare `process()`'s samples | compares the gain's output at the mix point (`onGain`); the gap's samples checked at the output's rate and at the voice rate; the live key-up check finds the gap as a run of zeros a block long (the output is whole numbers, so a tone's zero crossings can be exact zeros) |
| `opus.verify.mjs` | the mute check at the 44.1 kHz output; volume linear to 1e−9 | the mute check with `deviceRate: 44100`; twice the render at 0.25 is the render at 0.5 within 2 units, the energy ratio 4 within 0.1% |
| `speex102.verify.mjs` | the profile's `mixer === 'linear'`; the pulses at 44.1 kHz; the live shift with the FIR's sample | no `mixer` key; the pulses at the render's rate; the shift the codec's 80 samples |
| `verify.js` [6] | "playback rate = source rate"; "low-rate sources render at the 44.1 kHz mixer rate" | the render at the device's rate, 48000 by default; a 16 kHz source at 48000, 44100, 96000 and 192000 as given, the default for `'44100'`, 44100.5, 32000, 192001 and `null` |
| `verify.js` [4], the band edge without the clamp | at the 44.1 kHz output, < −70 dB | at a 44.1 kHz device, where there is no device stage (−78.7 dB as before); at 48 kHz the device stage's images put this source at −43.7 dB above 14.5 kHz, which is the listener's PC's |
| `browser.verify.js` | the WAV at the source's rate; renders at max(44100, rate) | the WAV at the device's rate, the source's duration at it |

## Readings of the order

1. **An empty voice gives an empty mix.** "2N + 1" for N = 0 would be one sample of zeros; with no voice there is no
   last mean to flush, so the mix stage gives nothing (its output length is the contract's anyway).
2. **`onMixBlock`'s `mix` is what `mixOut` is given:** the sum after the seam (for the one case with a low-pass, after
   it), before the clip.
3. **The device stage waits for `x[k + 1]` even where `r` is 0**, as the order's "waits for x[k + 1]"; nothing is
   emitted early.
4. **`process()` uses the stage factories whole** (push the whole voice, then flush), so it and `createRender` share the
   code by construction; the old room runs between the mix stage and the blocks only in `process()` (`createRender`
   refuses a room, as before).
5. **The live chain ignores `opts.deviceRate`:** its device is the audio context. Above 192000 Hz a context still gets
   the device stage at its own (whole-number) rate.
6. **`softLimit` is removed**, with its export: nothing else used it once the stage went.
7. **`VOICE_ENGINE.mixRate` stays** (as documentation); `audio.js` has its own `MIX_RATE = 44100`, the engine's constant.
8. **The `volume` label** reads "Output volume, 1 = the game's default"; W4-01 part d owns the words.
9. **The device choice's help** is the label's title (one sentence) and the console's help; no CSS was added (style.css
   is not in the order's files): the volume sentence uses the existing `reference-help` style.
10. **A link without `dev`** gets 48000 explicitly in `applyHashConfig` (a saved preset without it keeps the page's
    value, as every other missing field does).

## The dry WAV (the amendment, point 7)

The amendment asked this report to say that the dry WAV of a 16-bit source now round-trips exactly. In Chromium it does
not, before or after this order. Chromium's decoder gives a positive 16-bit sample `v` as `v / 32767` (a negative one as
`v / 32768`), and the dry WAV is the decoded source written by `encodeWav` (`toInt16`), so round(s × 32768) writes each
positive `v` from 16384 up as `v + 1`. The base's writer, `s × 32767` truncated, wrote some positive samples one unit
low instead.

One run of my own (`w3-10/scripts/drywav.cjs`: the page in the installed Chromium, a mono 16-bit WAV at 48 kHz, 48,000
samples, the dry WAV read back from the page):

| Source | This branch | The base (`3559672`) |
| --- | --- | --- |
| the review's signal, round(30000 sin(0.031 i)) | 15,178 of 48,000 differ, every one a positive sample written as `v + 1` | 12,468 of 48,000 differ, all positive |
| a 997 Hz sine peaking at 30000 | 15,169 of 48,000, every one `v + 1` | 12,456, all positive |

The review's figures (15,178 and 12,468) are reproduced. Of the decoded positive samples, 23,544 of 24,018 are exactly
fround(v / 32767) and none is fround(v / 32768); every negative one is exactly v / 32768. So the dry WAV is exact only
where a browser decodes 16 bits as `v / 32768`. The render's own files are not affected: the WAV holds the render's
integers exactly (output-stage [13]: every sample equals the render's sample × 32768), and the FLAC is encoded from that
WAV's 16-bit samples (`formats.js`, `fromWav`), losslessly (`formats.verify.mjs`, with its own decoder). The browser
suite's own comparison of a decoded file already scales positive samples by 32767. The same 32768 / 32767 on the
positive samples of a source Chromium decodes predates this order and is not W3-10's (about +0.0003 dB).

## After the review

The review's verdict was "merge as is", with three test gaps and two points for the docs. Closed on this branch:

- **F1, `onMixBlock` is handed a copy** (`495c86a`). Every check copied `mix` inside its callback, so a view of the
  mixer's one block buffer (the review's break: `slice` to `subarray` in `createMixBlocks`) passed every suite. The
  output-stage suite now keeps the arrays as given, uncopied, and checks after the render that each still holds what it
  held when given and has its own buffer: `process()` and `createRender` in chunks of 127 on `steam`, `celt_22` and
  `speex` (104 blocks on `steam`), and the live chain at 48 and 44.1 kHz (499 blocks each). With the break all three
  checks fail (83 of 104 blocks changed on `steam`'s `process()`, 499 of 499 in the live chain, one buffer). The suite
  has 102 checks.
- **F3, the live chain's `latencyMs` pinned** (`899cb8e`). `verify.js` [10b]'s hold-back check allows 0.15 ms; the
  device stage's wait is 0.023 ms. A new check sums the figure's terms in the test: the context's sinc resampler to
  24 kHz (16 inputs at 24 kHz from 48 and from 44.1 kHz), the capture roll-off's dropped delay (127), the reach, the
  encoder's lookahead, Steam's resampler's 16 inputs, and the device stage's one 44100 Hz sample above 44.1 kHz (none at
  44.1). `latencyMs` must be that sum within 1e-6 ms, and 206.898 ms at 48 kHz and 206.875 ms at 44.1 kHz (206.897676 and
  206.875000). With the wait dropped (the review's break), 48 kHz gives 206.875000 and the check fails. `verify.js` has
  301 checks.
- **F4, the dry WAV:** above.
- **F2:** not tested; see the open items.

No golden hash moved: the two commits change tests only, and render-stream passes unchanged.

## The orchestrator's private run (2026-11-11)

Written by the orchestrator, not the builder. The accuracy table on the owner's eighteen takes, before (main at
`3559672`) and after (this branch at `bba9ed1`), under the heavy-job lock; numbers only, the recordings stay private.

- **Below 11 kHz: as the order.** The anchor level moves by −0.026 to −0.033 dB; 5 to 8 kHz by +0.07 to +0.10;
  8 to 10 kHz by +0.13 to +0.15; 10 to 11 kHz by +0.12 to +0.17. 11 to 12 kHz moves by +0.13 to +0.30 against the
  order's +0.10 (the images, and where in the band a take's sound sits).
- **Above 12 kHz: the images, as the builder found.** Model minus recording at 12 to 16 kHz, before to after: the
  two music takes −0.76 to −0.03 and −1.00 to +0.04 dB; the owner's speech −1.84 to −0.06; the network set's
  baseline −4.48 to −0.20; Set B's four test-signal takes −0.80 to −3.28 before, +0.51 to +1.10 after. The mean
  size of the error over the twelve takes without random loss that have sound there: 1.71 to 0.86 dB at 12 to 16 kHz,
  6.34 to 1.89 dB at 16 to 19 kHz.
- **Level tracking and clipping:** unchanged within 0.02 dB and 0.3 points on every take.
- **The ceiling:** the render's flat tops are 4896 of 32768 exactly at `volume 0.15` (−16.5122 dB). The takes' sit a
  few units higher: the game's ambience rides on the voice's plateau before the device's own clip (W3-07, W3-18).

The order's rows from 11 kHz up are restated in its amendment of 2026-11-11, with the ruling that the merge is not
held.

## Not done, or left for the orchestrator

- **Item 10** (`tests/accuracy.mjs` may print the share of samples at the exact ceiling): not done. It is optional, and it
  would be code in the orchestrator's private tool that I cannot run without the takes.
- **A stale line outside the parts of REFERENCE the order lets me edit** (the review's F5; the orchestrator's): "What remains unverified", the "Output stage"
  bullet, still says "The app still applies the fitted 3-tap filter in its place (order W3-10)". It should say the app
  runs the interpolation as a model since W3-10.
- **The change by band above 12 kHz** (above): the order's figures for 12 to 16 and 16 to 19 kHz leave out the images.
- `node tests/accuracy.mjs --takes tests/realtake`: not run (no takes here).
- **The old room code's tail at the device's rate is not pinned by any check** (the review's F2): `process()` converts
  the room's tail to the device's rate (`tail = round((mix.length − dryMixLength) × deviceRate / MIX_RATE)` in
  `audio.js`), and no golden case has a room that does anything (`dsp_room 1` and the custom room at mix 0 have no
  effect), so dropping the conversion passes every suite. W3-17c removes that code and tests its own tail.

## Runs

On the final tree (`63590f2`, the code as pushed; this report adds no code), each under the heavy-job lock, one
after another:

| Run | Result |
| --- | --- |
| `pnpm test` | exit 0, no failure: `verify.js` 300, gain 69, `gain-exact --synthetic` ok, Opus 147, Speex 71, paired reference 42, formats 68, file rate 53, meter 50, video 46, demo 36, render-stream 372, output-stage 99, voice channel 129, Steam sender 109, swresample 43, room 210 |
| `pnpm test:vendor` | exit 0: the Opus runtime, libopus 1.1.5, CELT 0.11 and Speex 1.0.2 builds match their recorded hashes |
| The browser suite (`node tests/browser.verify.js`, the installed Chromium) | exit 0, 246 checks |
| Mutations | 42 of 42 caught on the final checks (two runs, 1,292 s for the second) |

After the review, on `899cb8e` (the code as pushed; the report's update adds none), under the same lock:

| Run | Result |
| --- | --- |
| `pnpm test` | exit 0, no failure, 635 s: `verify.js` 301, gain 69, `gain-exact --synthetic` ok, Opus 147, Speex 71, paired reference 42, formats 68, file rate 53, meter 50, video 46, demo 36, render-stream 372 (the golden hashes as recorded), output-stage 102, voice channel 129, Steam sender 109, swresample 43, room 210 |
| The review's two breaks | `slice` to `subarray` in `createMixBlocks`: output-stage fails 3 (the new copy checks); the device stage's wait dropped from `outputWait`: `verify.js` fails 1 (the new pin) |
| `pnpm test:vendor`, the browser suite | not rerun: the two commits change `tests/output-stage.verify.mjs` and `tests/verify.js` only, which neither runs; CI runs both |

CI (`tests`, which runs `pnpm test:all`) on this branch:

| Run | Commit | Result |
| --- | --- | --- |
| 42907183795 | `9f5b517` (the control's step 1) | success |
| 42912913520 | `e9ceeb7` (pushed with `de2653f` to `74a714a`) | success |
| 42915135660 | `8f3ee35` | success |
| 42921449440 | `bba9ed1` (this report, with `63590f2`) | success |
| (in the hand-back) | the report's update, pushed with `495c86a` and `899cb8e` | a run cannot be written into the commit it runs on |

## Scan

Over the branch's diff from `3559672` and this report: no model name outside the commits' trailers; no absolute path
(the scratch folder is named only as `w3-10`); every commit by `Claude <noreply@anthropic.com>`, its message ending
with the two trailer lines; no file from `tests/testsignal/` (or any `.wav`) tracked; no Valve source, art or text
added (the only lines naming Valve in the diff are unchanged context); nothing downloaded. Every file changed is in the
order's "May touch" list.
