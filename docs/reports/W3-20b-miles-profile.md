# W3-20b: the `miles` profile: report

Order: `docs/work-orders/W3-20b-miles-profile.md`. Branch `claude/w3-20b-miles-profile`, cut from the head of
W3-17d's branch (8e0f0c2) as the brief said, not from `main`.

`vaudio_miles` is not a Team Fortress 2 codec: it is a codec of the Source engine family that could be selected in the
Source engines of 2006 and 2007, and current TF2 ships its files and refuses the name. It has not been checked against
any recording of a running engine.

## Commits

1. `ceeaaa9` the codec stage: A (`constants.js`), B (`opus-codec.mjs`), C (`audio.js`), `reference.js`'s condition;
   `tests/miles.verify.mjs` (new, in `pnpm test`), `tests/gain.verify.mjs` [4b], `tests/verify.js`, `tests/reference.verify.mjs`.
2. `9abb698` the eight `miles` cases of `tests/render-stream.verify.mjs` and their recorded hashes, in a commit of
   their own.
3. `4dc7c83` the documents.
4. `23cef7a` the page (D), the console, the render's lines, the lane and the live panel (E), `sw.js` (F), and the
   browser suite; the words check and a createRender check in `tests/miles.verify.mjs`; a block-grid case in
   `tests/gain.verify.mjs`.
5. This report.

## What was built

- **A. `constants.js`:** `CODEC_PROFILES.miles` after `speex`, the order's fields exactly, no `senderGate`, `status:
  'unverified'` (nothing reads `status`: grep finds no reader in the code; the comment says so and lists
  'unverified'). The entry's comment says, in the order's order: not a TF2 codec and where it could be selected; the
  codec stage and that it is read from those engines; the start-up block of zeros; the three stand-ins; everything
  after the gain TF2's of today; unverified. The header's codec sentence names VR12. No preset uses it (a check).
- **B. `opus-codec.mjs`:** `openVr12` (refuses any rate but 11025; two `createCodec()` objects, `reset()` on each, a
  `createFramer` on each; 16 bits by `speexInput`; the framer's `compress` must give exactly 12 bytes; `decompress`
  over 32768; a lost frame 360 zeros, the receiver not called; `reset()` = both objects reset and new framers, never a
  new codec; `resets` counts each object's resets), `vr12RoundTrip` (Speex's round trip, frames code 8, `modes.vr12`,
  `plc: 'zeros'`, `onPacket`, `head`, `info.resets`), `createVr12Stream` (Speex's stream interface, `mode: 'vr12'`,
  `resets`), `VR12_DELAY = 305` with its measurement in the comment, `FRAME.vr12 = 8`, the module loaded when first
  used.
- **C. `audio.js`:** only the order's places: `FRAME_CODES`, `process`'s round trip, `createRender`'s stream,
  `codecStage`'s `modes`, `codecResultInfo` (the round trip's `info` key for key: a check compares all 32 keys),
  `createLiveChain`'s stream and its two `stats.modes` (the second is the `steam` live chain's: a `vr12: 0` key only),
  and the comments listing the engine codecs and their delays and frame lengths.
- **D. The page:** the codec control's options in two `optgroup`s; the Miles option; the note `#codec-note` (hidden
  unless `miles`, toggled in `updateSignalChain`, named in `aria-describedby`); the help sentence replaced; the chain
  strip's Codec cell.
- **E.** `app/console.js` (`sv_voicecodec`'s and `snd_bits`'s help; `net_split`'s and `net_fakeloss`'s name no Speex
  frame and were left), `app/render.js` (the codec's name, the added line, a live take's backend and `plc`),
  `app/visualizer.js` (`FRAME_STYLE[8]`, the "lost" entry), `live.js`, `live-worker.js`, `reference.js` (code 8
  counts as coded).
- **F. `sw.js`:** the two vendor files in `ASSETS`; `CACHE` v32 (W3-17d's branch has v31). The merge of `main` is
  owed (below), and `CACHE` must then be `main`'s number plus one.

## The page's strings as built

- Option: `vaudio_miles: not in TF2 (VR12)`. The longer ` (VR12, 2.9 kbit/s)` did not fit: the page's own 390 px check
  measured it at 303 px of 246; ` (VR12)` is 230 px.
- Groups: `Team Fortress 2` (steam, celt_22, celt_44, speex), `Not in Team Fortress 2` (steam_48, miles).
- Note: "vaudio_miles is not a TF2 codec. The Source engines of 2006 and 2007 could run it; current TF2 ships its files
  and refuses the name. It has not been checked against any recording of a running engine. Everything after the
  receiver's gain is TF2's of today."
- Help (W4-01d's sentence existed, with "the vaudio_ ones"): "What the game sends voice with. Steam voice is today's;
  the rest of the first group are its older codecs." (105 characters). The browser suite's W4-01d table check was
  updated to it and to the new order of the options.
- Chain strip: `VR12 on 11.025 kHz sound · 12-byte frames of 32.65 ms · 2.94 kbit/s · not a TF2 codec`, plus
  ` · snd_bits not used` when the bitrate scale is not 16.
- Render: `S_Voice: Voxware VR12 (voxware-vr12 eedf465), 2.94 kbps CBR, 12-byte packets of 32.7 ms, a lost frame plays
  as zeros (VR12 100%)`, then `S_Voice: vaudio_miles is not a TF2 codec (Source engines of 2006 and 2007); not
  checked against any recording`. Status: `Ready · Voxware VR12 · 2.94 kbps · …`. Lane legend `VR12 <frames>`, colour
  `#86b83a`, title "VR12: a vocoder at 2.9 kbit/s, here on 11.025 kHz sound; vaudio_miles, not a TF2 codec".
- Console: `sv_voicecodec`'s help ends "; miles (vaudio_miles of the Source engines of 2006 and 2007: not a TF2 codec,
  unverified)"; `snd_bits`'s says "vaudio_speex and vaudio_miles have one bitrate and ignore this". The page's own
  `snd_bits` sentence (`#bits-help`, outside the codec control) still names `vaudio_speex` alone: the order allows only
  the codec control in `index.html`.
- Live panel mode: `VR12`.

## The three measurements

All by `tests/miles.verify.mjs` (sections 2, 4 and 12), the module run on signals of our own; not measurements of
any engine.

1. **The delay** (section B's grid: 72 runs, P 100, 140 and 190 Hz, onsets 3600 + 15 k, k 0 to 23): median **304.5**
   samples, rounded **305** (27.66 ms); quartiles **274.75** and **348** (linear interpolation); range **200 to 411**
   (211 apart: less than a frame, and not in two groups: the lag falls by 15 as the onset moves 15 within a codec
   frame, a sawtooth). The test computes it again and requires 305.
2. **Where the 8-bit cut shows.** `voice(20, 48000, 1)`, frames of the 11025 Hz capture under -60 dBFS as pauses
   (11.5 s) and over -35 as spurts (1.9 s), two frames' margin:

   | | input | after the cut | miles decoded | miles after the gain | speex decoded | speex after the gain |
   |---|---|---|---|---|---|---|
   | pauses | -78.7 | -45.6 | -57.1 | -37.1 | -82.7 | -62.7 |
   | spurts | -20.0 | -20.0 | -22.6 | -6.1 | -19.3 | -3.5 |

   (dBFS; the pauses' -72 dBFS floor at 48 kHz is -78.7 at 11025 Hz.) A steady voiced sound at 140 Hz (harmonics 1/h
   below 5 kHz, crest 7.8 dB), decoded level for input RMS 0 / -12 / -24 / -36 / -42 / -48 / -60 dBFS: -16.9 (clipped
   at the capture) / -13.3 / -25.5 / -41.2 / -56.5 / -61.4 / -63.9. Only the signs are left at -60 and not at -48:
   for this sound below -49.9 dBFS RMS (peak under 256 of 32768). Digital silence decodes to digital silence.
3. **What decision 3 is worth** (gate on, two voiced bursts, the second spurt's 11,880 decoded samples, at -29.1
   dBFS): decoded by a receiver not reset at the spurt (the sender reset alone, the engines' rule after a short
   pause), the difference is **+3.6 dB** against the sound's own level (11,817 samples differ; the vocoder keeps no
   waveform, so the two do not line up at all); by one shared codec object, **-52.1 dB** (2,986 differ); by new codecs,
   +2.9 dB. The packets are the same in the first two (the receiver does not change them).

## Tests, each with the break that fails it

Each was broken in a scratch copy of the tree and the suite re-run; every break below failed the check named.

`tests/miles.verify.mjs` (reference packets and samples from the vendored module driven by the test: two codecs, the
resets, a framer on each, its own 16-bit rounding):

1. Profile table and codecInfo — `bitrate: 2941` in the entry fails the entry check; `plc: 'vr12'` fails the
   codecInfo and loss checks. createRender in odd pieces equals process (samples, all 32 codecInfo keys, gate, loss
   and jitter on) — dropping `resets` from `codecResultInfo` fails it.
2. The delay — `VR12_DELAY = 300` fails the delay check and every codec-stage check (5 samples off).
3. The codec stage is the module (speech-like, a quiet voice near -40 dBFS, noise, `noise.s16`, `tones.s16`; input,
   packets, decoded samples, `samples` with the delay dropped, the framer in odd pieces with the final flag) —
   decoding over 32767 fails it; no reset at open fails it and the framer checks; one shared object fails it.
4. The resets — the stream's count and the render's `info.resets`; without the receiver's first reset the decoded
   samples differ on every source, without the sender's the packets of `noise.s16` (frames 12, 13, 14) and
   `tones.s16` (24, 104, 137, 175, 202). Second spurt: a receiver not reset at a spurt fails "not a sender reset
   alone" and the reference check; new codecs at a spurt in the round trip fail the count and "not new codecs"; new
   codecs at the stream's restart fail the stream's count, createRender's count and the live keyed check.
5. The 8-bit cut reaches the render — 128 added before the cut (the low byte leaking) fails both checks.
6. Where the 16 bits are made — truncation fails the codec-stage checks; no clamp fails "the stream gives the module
   that rounding". Ties to even against ties up cannot change any packet behind the cut (a tie x.5 with x even rounds
   to x, and x + 1 is odd, never a multiple of 256), so that rule is pinned on `speexInput` itself, which the stream
   calls and `tests/speex102.verify.mjs` also pins.
7. Loss — the receiver decoding a lost packet fails three checks; later sound closing up after a loss fails three;
   a late frame decoded fails three; the stream's `conceal()` calling the decoder fails its check.
8. `snd_bits` — the bitrate scale reaching the input fails the render check (the live check runs the same code).
9. `net_split` — vr12's loss mask drawn per frame fails "whole packets of two".
10. Live chain — the `vr12` key missing from `stats.modes` fails the stats checks; key-up frames sent fails the
   scripted-key check; a stream restart with new codecs fails the keyed gain check.
11. Last part frame — `Math.floor` for the frame count fails it (and the codec-stage checks); determinism —
   `Math.random` for the loss fails it and the live loss check.
12. Measurements (printed) and two checks: the pauses lifted by the cut; digital silence silent, only signs at -60.
13. The words — an altered README sentence, the note's last sentence removed, or "miles" in README's Accuracy each
   fail their check.

`tests/gain.verify.mjs` [4b], `miles` in the loops — `gainLead` 0 for vr12 fails three checks; a block's frame read as
floor((m + 305) / 360) fails the new grid case at 11025 Hz (124 samples differ between the readings); a misplaced
delay with the gain off fails the gain-off check. `tests/verify.js` [5] — VR12's bitrate + 1 fails "miles: Voxware VR12
at 2.94 kbps". `tests/reference.verify.mjs` — code 8 not counted as coded fails the miles take check (0 windows).
Browser suite (in a runner of the miles section alone) — the note never toggled, the added S_Voice line missing, and
the option outside its group each fail their check.

## Recorded hashes

New in `tests/render-stream.verify.mjs` (GOLDEN and GAIN_GOLDEN, added lines only, inserted after the W3-19
cases): `miles`; `miles, gate on, loss 15%, jitter 300 ms`; `miles, loss 15%, net_split 40 ms`; `miles, source at
11.025 kHz`; `miles, source at 8 kHz`; `miles, 100 samples at 96 kHz`; `miles, voice_maxgain 1, gate on, loss 15%`;
`miles, auto-gain off`. Before recording, `--hashes` printed all 76 cases: the 68 recorded ones gave their recorded
WAV, codecInfo and gain hashes, none moved. `tests/verify.js`'s `steam_48` live hashes, the vendored modules' hashes
(`pnpm test:vendor`) and `tests/predictions/predictions.json` are untouched.

## What needs no change (confirmed)

- `gainLead` and `decodedFromFrames`: `miles` has `engine` set, `voiceRate === codecRate` and no decoder EQ, so
  `gainLead` gives its 305-sample lookahead and the gain runs on the decoder's stream from its first sample; a block's
  frame is floor(m / 360). Shown by `tests/gain.verify.mjs` [4b] (bit for bit against the module-driven stream; the
  grid case at 11025 Hz fails when the reading is floor((m + 305) / 360)).
- The gate: its frame counts follow `frameSize`: pre-roll 4 and hold 13 frames (a check in `tests/miles.verify.mjs`).
- The loss masks: per 32.65 ms frame, `net_split` in whole frames (test 9).
- The mixer, rooms and output: untouched; `tests/verify.js`'s empty source through a room gives the same silent tail
  with `miles`; the render-stream suite's room cases did not move.
- The workers and `batch.js`: they load `opus-codec.mjs`, which loads the module; the browser suite renders `miles` on
  the page (in `audio-worker.js`), live (in `live-worker.js`) and offline.
- `demo.js`: no `DEMO_PROFILES` entry exists or was added; a demo cannot hold this codec.
- The delay (305) is under a frame (360), so the order's extra check for a delay longer than a frame was not needed.

## Checks run

All on the branch's final code (23cef7a), heavy jobs under `flock /tmp/tf2ve-heavy.lock`:

- `pnpm test:vendor`: "Opus runtime matches libopus-wasm 0.4.0", and the libopus 1.1.5, CELT 0.11, Speex 1.0.2 and
  VR12 builds match their recorded hashes.
- `pnpm test`: exit 0. Counts: verify 218 passed, 0 failed; gain 103 passed, 0 failed; Opus 147; Speex 86; vr12 31
  passed, 0 failed; **miles 72**; paired-reference 43; formats 68; file-rate 53; meter 50; video 46; demo 36;
  render-stream 553 passed, 0 failed; output-stage 102; voice channel 129; steam sender 109; swresample 43; room 215.
- `CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node tests/browser.verify.js`: "292 browser
  checks passed", exit 0.
- CI (`tests` workflow): the run on 23cef7a (43055303694) failed in "Install browser" (the runner's apt index download,
  exit code 100) before any test ran, as did the run on 52ae6b5. After `origin/main`'s workflow fix (5a8ca56) was
  merged in (05da594), run 43058709879 passed: every Node suite with the counts above, and "292 browser checks
  passed".

## Scan

`git diff 8e0f0c2...HEAD` and the commit messages were scanned for recordings, personal details, paths, SteamIDs and
model names: none (the only hits for the pattern were "libopus 1.1.5"). Nothing of the private investigation, the
owner's modules or the upstream project's README was read or used; only the four vendored files' module.

## Not done, departures, and for the orchestrator

- **The merge of `main` is owed.** The branch is cut from W3-17d's branch head (8e0f0c2), as the brief said. When
  W3-17d is on `main`: `git merge origin/main`, settle the meeting lines by hand (the codec control in `index.html`,
  `app/console.js`'s help strings and Codec cell, `constants.js`, `tests/browser.verify.js`'s W4-01d table check,
  `sw.js`), and set `CACHE` to `main`'s number plus one (it is v32 here, v31 + 1).
- **Departures.** (1) `info.resets` / `codecInfo.resets` (`{ sender, receiver }`) is a key the order did not list: the
  order asks for the count "in a property the tests can read"; it is the stream's `resets` and the round trip's info
  key, so `codecResultInfo` gives it too. (2) The option is the short form ` (VR12)`, as the order allows when the long
  one does not fit. (3) `tests/gain.verify.mjs` gained a `miles` block-grid case at 11025 Hz beside the Speex one: the
  loops alone did not fail when the grid was read floor((m + 305) / 360). (4) `tests/miles.verify.mjs` has a
  createRender-equals-process check of its own (codecInfo key for key), so that test 8's codecInfo half fails in a
  fast suite. (5) The `steam` live chain's `stats.modes` gained a `vr12: 0` key (the order's "two stats.modes"): a
  line BC-1's `steam` work may meet.
- **For the orchestrator.** The page's own `snd_bits` sentence (`#bits-help`) still says only "vaudio_speex has one
  bitrate and ignores this": the order allowed only the codec control in `index.html`; the console's help names
  `vaudio_miles` too, and the browser suite's W4-01d table pins the page's sentence as it is. W4-01d's help sentence
  existed and was changed as the order says (no table amendment needed). `app/netgraph.js` (not in the order's
  files) caps the packet rate only for `speex`; at 30.6 frames a second `miles` is under the tick's 66.7, so nothing
  changes. No decision of the order failed to hold.
- **Not done:** no registered prediction (decision 10); BC-1's lines untouched.
