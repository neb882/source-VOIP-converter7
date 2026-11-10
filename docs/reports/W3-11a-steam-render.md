# W3-11a: the `steam` render sends and decodes as Steam does

The builder's report. The order is part a of `docs/work-orders/W3-11-steam-gate.md`. Branch
`claude/w3-11a-steam-render`. It was built on a branch that carried the resampler's branch (W3-13,
`origin/claude/w3-13-steam-resampler`, merged in at `d440ec7`); W3-13 merged to main during the build, before this
branch (pull request 15), and the branch has since merged `origin/main` with it.

**Status:** built, reviewed (no must-fix), and the review's fix round done (see "Review" and "Fix round").
`pnpm test`, `pnpm test:vendor` and the browser suite pass on the head, and CI's `tests` workflow passes on it
(see "Runs"). The private runs (the accuracy suite, Set D's demo, the re-timing check) are the orchestrator's; they
were acceptable on `8853fea`.

## Summary

- For the `steam` profile with the codec on, a render now runs Steam's sender (`steam-sender.js`), rounds the
  capture to 16 bits, encodes each message's frames (complexity 9), decodes them with the library's own 16-bit
  decoder under Steam's decoder rules, gives each message's samples whole to one libswresample for the render,
  feeds the gain the decoded packets in order, and lays the packets on the source's timeline. `steam_48`, the
  CELT and Speex profiles, the codec bypassed and a demo's received voice keep their paths bit for bit (16 golden
  cases unchanged; 32 `steam` cases re-recorded in a commit of their own).
- The Opus module was rebuilt with `opus_decode` exported. The old export list gave the recorded module first
  (`b7a03edb…`, 307,837 bytes of WebAssembly). The new one is `a753f6b8…` (308,481 bytes). Its float path gives
  the old module's packets, `decodeFloat` and concealment, and its 16-bit decoder matches a native gcc build sample
  for sample.
- `createRender` equals `process()` bit for bit on every `steam` case of the render-stream suite at chunks of 7,
  960, 12,345 and the whole source.
- Speed: see "Speed".

## Commits

| Commit | What |
| --- | --- |
| `3f9cce9` | The Opus module with `opus_decode`; `index.mjs`'s `decodeInt16`; `tests/libopus11/native.mjs` and `native.c`; the module checks in `tests/opus.verify.mjs`; the vendor hash and README |
| `999ece1` | The steam path in `audio.js` and `opus-codec.mjs`; the profile; the scripts on the page, in both workers, in `sw.js`; the test loaders |
| `98d502c` | The checks (`tests/verify.js` [5c], and the checks that moved); `app/render.js`'s line |
| `a38a72a` | The 32 `steam` golden hashes re-recorded, alone |
| `73ff772` | A `steam_48` quarter-frame case, recorded alone |
| `34c9a5f` | `PREDICTIONS.md` |
| `8b63dd3` | Merge of `origin/main` (docs only) |
| `a3ce67f` | The browser suite's checks |
| `927742b` | Browser check 3f's window from the take's rate; the live worker's own scope read (a gap a break found) |
| `d25ba14` | Three checks for gaps the breaks found: a typed threshold, the laying, the slots |
| `f9d18b2` | `PREDICTIONS.md`: the spurts' edges as measured |
| `c199f31` | The pre-roll check reads the spurt's own pre-roll (a gap a break found) |
| `7539c7a` | Merge of `origin/main` (W3-13's merge and docs; no conflict) |
| `ca807eb` | This report |
| `8853fea` | Merge of `origin/main` (docs) |
| `63c4b7a` | Fix round: re-timing by the laid spans, 16-bit sequence numbers, the reach from the sender's constants, and the checks the review asked for (two new render-stream cases with new hashes) |
| `97e853d` | Fix round: `tests/accuracy.mjs`'s `MODEL_FILES` |
| `efe9b2f` | Merge of `origin/main` (docs and `tests/roomdsp`; no conflict) |
| the last | This report, for the fix round |

## Files changed

Allowed by the order: `audio.js`, `opus-codec.mjs`, `constants.js`, `tests/libopus11/build.mjs`,
`vendor/libopus-1.1/` (module, `index.mjs`, README), `tests/vendor-opus.mjs`, `index.html`, `audio-worker.js`,
`live-worker.js`, `sw.js`, `app/render.js` (one line), `tests/verify.js`, `tests/render-stream.verify.mjs`,
`tests/opus.verify.mjs`, `tests/browser.verify.js`, `tests/predictions/PREDICTIONS.md`; new
`tests/libopus11/native.mjs` and `tests/libopus11/native.c`; this report.

Outside the order's list, each authorised by the orchestrator during the build (and in the fix round, one line of
`tests/accuracy.mjs`: its `MODEL_FILES`):

| File | Why |
| --- | --- |
| `tests/reference.compare.mjs` | Its `audioEngine()` builds the sandbox `tests/reference.verify.mjs` and `tests/demo.verify.mjs` render `steam` in (point 1: "any other suite that builds the sandbox"). Loader lines only. |
| `tests/gain.verify.mjs` | Its loader (the same reason), and section 4, which pinned `steam` to the frame gate with `decodedFromFrames`. It now runs on a test-only profile defined in the file (`steam` with its `senderGate` without the rule: main's `steam` path, at the geometry its edge check needs), every check as it was, and its equality check once more on `steam_48`. |
| `tests/reference.verify.mjs` | Its end-to-end null check passed or failed by where an arbitrary delay put two estimates (below, "The null check"). Now: the end-to-end null bounded by what the alignment's own tolerance allows, and a strict check of `warp()`, both at two delays on `steam` and `steam_48`. Nothing else in the file changed. |
| `tests/browser.verify.js` beyond the new scripts | Check 3f (the live take against an offline render): kept within a sample on `steam_48`; restated for `steam` (below, "The live take"). |

Suites that build a sandbox and render `steam` with the codec on, all now load the two scripts: `tests/verify.js`,
`tests/render-stream.verify.mjs`, `tests/opus.verify.mjs`, `tests/gain.verify.mjs`, `tests/reference.compare.mjs`
(for `reference.verify` and `demo.verify`). `tests/speex102.verify.mjs` renders `steam` only through the live
chain, which part a does not change, so it needs nothing and is untouched. `tests/demo.verify.mjs` passes
unchanged.

Not touched: `steam-sender.js`, `vendor/swresample/`, `voice-channel.js`, the other `vendor/` folders, `demo.js`,
`reference.js`, `app/realtake.js`, `tests/speex*.verify.mjs`, `tests/accuracy.mjs` (but its `MODEL_FILES` in the fix round), `tests/REFERENCE_2026.md`,
`tests/predictions/predictions.json`, `docs/PROGRESS.json`, `createLiveChain`.

## The Opus module (point 2)

1. **The recorded hash first.** The build machine cannot reach `github.com`, so `tests/libopus11/build.mjs` was
   given a checkout of `https://gitlab.xiph.org/xiph/opus.git` at the tag `v1.1.5` (its commit is the pinned
   `d3977edab4cbfeafd3650b572c78711e0b04a5f8`) and musl at `0784374d…`. With the export list as it was it wrote the
   recorded module, SHA-256 `b7a03edba67393bbe23b3c531486f1e56f9ebdba3727e2b90c97025821f718d0`, 307,837 bytes of
   WebAssembly (Ubuntu clang 18.1.3). The file did not change.
2. The script was then restructured so `native.mjs` can share its source list and defines (exports, a build only
   when run as a script). It gave `b7a03edb…` again.
3. **The float hashes on main's module, before the rebuild:** 10 s at 24 kHz of seeded noise bursts and
   vowel-like tones, `loud` (peaks to 2.7, past full scale) and `quiet` (the same at 1/50), each through the
   Steam profile's encoder: the SHA-256 of the packets, of each packet through `decodeFloat`, and of
   `decodePacketLossFloat` after every tenth packet. Recorded in `tests/opus.verify.mjs`.
4. **`opus_decode` added to the exports**, nothing else. The module is
   `a753f6b88d215f710568299c4f4aa9cca081735efbf7f983e017346482649f3d`, 308,481 bytes of WebAssembly. The float
   hashes of step 3 come out unchanged. `index.mjs` gains `decodeInt16(packet, { frameSize })` and
   `decodePacketLossInt16(frameSize)`, returning an `Int16Array`. `tests/vendor-opus.mjs` and the README take the
   new hash.
5. **The native comparison**, `node tests/libopus11/native.mjs <checkout>` (gcc 13.3, x86-64, the build's source
   list, `-O2 -DOPUS_BUILD -DVAR_ARRAYS -DHAVE_LRINTF -ffp-contract=off`, glibc's libm; `native.c` makes the
   module's calls):
   ```
   loud: 500 frames, 264000 samples; packets 6bee8aa1…a75b2, 16-bit 12e83950…56cf9 (WebAssembly identical)
   quiet: 500 frames, 264000 samples; packets b5226e0b…8648f, 16-bit 24556dbc…15b97 (WebAssembly identical)
   The WebAssembly module's 16-bit decoder matches the native build sample for sample.
   ```
   Both hashes are recorded in `tests/opus.verify.mjs`. On the loud signal the 16-bit output differs from
   clamp-and-round of `decodeFloat` in 5,892 samples (4,207 decoded floats past full scale); on the quiet one in
   none.

## What was built

**`opus-codec.mjs`.** `createSteamDecoder()`: the library's 16-bit decoder with Steam's rules (a gap concealed when
the next frame arrives, at most 10 frames; a sequence number behind resets without concealing; `end()` resets),
plus the render's `lost(seq)` (counts toward the next gap) and `late(seq)` (480 zeros, no gap).
`createSteamStream(bitrate, options)`: takes the sender's messages one at a time; encodes each frame as
`q / 32768` through the float entry point; a fresh encoder and decoder each spurt; returns each message's decoded
`Int16Array` (concealed and late blocks in the order the decoder made them; a silence record's zeros) and one
`{ frame, code, bytes, mode }` per 480 samples. `steamRoundTrip(messages, bitrate, options)` runs the stream over
all of a render's messages, with `makeLossMask(count)` as `roundTrip` has it. `gatePlan` and the frame paths are
unchanged.

**`audio.js`.** A profile whose `senderGate.rule` is `'steam'`, with the codec on and no received voice, takes the
new path in `process()` and `createRender`:
- the capture as before (mic gain, clip, resample to 24 kHz, optional filters, the capture roll-off), then
  `q = clamp(round-half-even(x × 32768))` (`steamCapture`);
- `TF2SteamSender.createSender({ seed, gate, meanMin })` with the render's seed; the gate off is `gate: false`;
  `gateThresholdDb` null, absent or not a number gives no `meanMin` (Steam's own); a number (clamped to -90..0)
  gives `32767 × 10^(dB/20)`;
- the loss mask per frame by the sender's frame number (`buildLossMask` over all frames in `process()`,
  `streamLossMask` a frame at a time in `createRender`, which give the same values);
- `steamTimeline`: one `TF2Swresample.createResampler()` for the render (`opts.swrKernel` for tests), one
  `packet()` a message that holds samples; one `createGain`, reset once, fed every resampled packet in order as
  its 16-bit values / 32768, a silence record's zeros included, a late frame's span (frame j of F in n output
  samples: `round(j n/F)` to `round((j+1) n/F)`) left out and laid as it is; a spurt's first packet laid at
  `round((start - lookahead) × 147/80)`, each later one after it, a silence record not laid, the later packet
  winning an overlap, samples outside `[0, voiceLength)` dropped; the frame log's slots by what was laid;
- `codecInfo`: the slots' counts, `gate` -40 (or the typed dB, or null with the gate off), `prerollFrames` and
  `holdFrames` 0, `sender { rule, gate, meanMin, chunks, messages, spurts }`, `resampler { kernel, calls }`;
- test hooks `onDecoded`, `onResampled` (each with the message as a second argument), `onGain`, `swrKernel`.

`VOICE_ENGINE.autoGain.blockSize` and its mention beside `GAIN_BLOCK` are gone; `constants.js`'s profile comment
says what the three numbers of the `steam` gate are now (the frame model of finding 12, for the take tools and
the live chain until W3-11b). `steam.encoder.complexity` is 9.

**`createRender`** runs the same sender, stream, resampler, gain and timeline, given the sound as it comes. A
voice-rate sample is given out once no later packet can reach it: before the open spurt's next packet, and
before `round((P - 4650 - lookahead) × 147/80)`, where P is the samples given to the sender so far (a spurt not
yet opened starts at most a chunk, 2250, and the pre-roll, 2400, before them). So it holds back about 4,800
samples at 24 kHz (200 ms) beyond what the sender has read, and the open spurt's laid but unfinished tail; the
stages around it (resamplers, FIRs) hold back what they did before.

## Golden hashes

The branch's `node tests/render-stream.verify.mjs --hashes`, against the hashes recorded on `origin/main` (48 cases),
before the re-record; checked again at the end against `origin/main` at `9659696`:

- **unchanged (16):** `steam_48`, `celt_22`, `celt_44`, `speex`, `steam, codec bypassed`, `demo voice as
  received`, the three CELT and Speex gate-and-loss cases, `steam_48, loss 10%, jitter 100 ms, snd_bits 10`,
  `celt_22, source at 22.05 kHz`, `speex, source at 11.025 kHz`, `speex, source at 8 kHz`, `celt_22, one sample
  at 22.05 kHz`, `speex, 100 samples at 96 kHz`, `demo voice as received, past full scale`;
- **moved (32), every `steam` case with the codec on** (three whose names do not say so: `odd options`, whose codec
  `nope` falls back to `steam`; `test position with a low-pass`, on the default `steam`; and the decoder-EQ test
  profile below): 29 in WAV and codecInfo, and three in codecInfo only: the
  empty source, the source silent but for a quarter frame (gated under either gate), and the test-only decoder-EQ
  profile (a copy of `steam`, kept on the frame path because the decoder EQ is a stage of that path only, moved by
  complexity 9 alone: 9 and 10 give the same packets).

They were re-recorded in `a38a72a`, a commit of its own, after `createRender` had equalled `process()` on every
case and plan. `73ff772` added `steam_48, silent but for a quarter frame of sine at the end`: the `steam` case of
that name no longer reaches the frame gate's partial last frame (W2-02's F2), so the same source on `steam_48`
holds it; its hashes were made by `origin/main`'s code and the branch's alike.

## The speech source at seeds 1, 2 and 3

The app has no demo speech of its own (the demo's voice is a received recording, not rendered through the gate),
so I used the suite's speech-like source: `voice(20, 48000, 1)` of `tests/render-stream.verify.mjs`, the `steam`
case's 20 s, rendered with render seeds 1, 2 and 3 (the seed sets the sender's clock). The old gate's spurts are
`origin/main`'s frame gate on the same source; it has no clock, so it gives one set. Times are on the 24 kHz
capture, from a spurt's `start` to `start + 480 x frames`, pre-roll and hold included.

| Seed | Spurts (old) | Messages: sound + silence records | Chunks | 1 / 2 / 3 / 4 frames | Longer messages | Soft clip changed |
| --- | --- | --- | ---: | --- | --- | --- |
| 1 | 7 (7) | 220: 213 + 7 | 362 | 9.9 / 12.7 / 60.1 / 13.1% | 5 frames x2, 8 frames x7 | 0 of 305,760 |
| 2 | 8 (7) | 228: 221 + 7 | 364 | 10.9 / 10.0 / 61.5 / 14.0% | 5 x1, 6 x2, 8 x5 | 0 of 315,360 |
| 3 | 8 (7) | 219: 212 + 7 | 363 | 11.8 / 9.0 / 60.8 / 14.2% | 5 x2, 6 x2, 8 x5 | 0 of 303,360 |

The messages of 5 to 8 frames are each spurt's first (its pre-roll with the onset's chunk) and the clock's longer
reads. The soft clipper changed no sample: this source peaks well under full scale (the 16-bit check's own loud source shows
it at work: `tests/opus.verify.mjs`, at least 100 changed).

Each spurt, new against old, ms (start / end difference, positive later):

| Old spurt | Seed 1 | Seed 2 | Seed 3 |
| --- | --- | --- | --- |
| 260 to 2340 | 244 to 2384 (-16 / +44) | 244 to 2384 (-16 / +44) | 275 to 2375 (+15 / +35) |
| 3180 to 4380 | 3588 to 4388 (+408 / +8) | 3556 to 4376 (+376 / -4) | 3556 to 4376 (+376 / -4) |
| 6480 to 9180 | 6494 to 9194 (+14 / +14) | 6525 to 7845 and 7844 to 9204 | 6525 to 7845 and 7844 to 9204 |
| 10740 to 12200 | 10744 to 12204 (+4 / +4) | 10744 to 12204 (+4 / +4) | 10775 to 12235 (+35 / +35) |
| 12820 to 13620 | 12806 to 13666 (-14 / +46) | 12838 to 13658 (+18 / +38) | 12838 to 13598 (+18 / -23) |
| 14000 to 17100 | 13994 to 16734 (-6 / -366) | 13994 to 17134 (-6 / +34) | 13994 to 16734 (-6 / -366) |
| 18180 to 20020 | 18181 to 20221 (+1 / +201) | 18181 to 20261 (+1 / +241) | 18181 to 20261 (+1 / +241) |

Most edges move by under 50 ms. The second spurt opens 376 to 408 ms later at every seed, so by the rule, not the
clock: a quiet onset whose 20 ms frames passed the old RMS threshold and whose chunks' means do not (I did not
trace it further). At seeds 2 and 3 the third spurt ends at 7.84 s and a new one starts there, its pre-roll over
the last one's end: the gate closed inside a pause the old gate held across, by where the clock's chunks fell. At
seeds 1 and 3 the sixth spurt ends 366 ms earlier than the old gate's (at seed 2, 34 ms later): there too the
chunks' places decide whether the quiet tail keeps the gate open. The last spurt runs 201 to 241 ms past the
source's end: the sender reads the zeros after it until its hold runs out (the old gate stopped at the last
frame).

## The checks, and how each was broken

`tests/verify.js` gains a section, `[5c] The steam profile: Steam's sender and decoder`, 29 checks (the order's,
three for gaps the breaks found, and three from the fix round), all on sources made at 24 kHz unless said; other suites gain the checks the
order names (the module's in `tests/opus.verify.mjs`, the chunk plans in `tests/render-stream.verify.mjs`, the
scripts in the browser suite). Each break below was made in a scratch
copy of the tree (`steam-sender.js` included, for the sender's own rules; nothing in the branch), the named suites
run there, and their failing lines kept. "Golden" is `render-stream.verify.mjs --hashes` against the recorded
hashes; a moved hash fails `pnpm test`.

Every break below fails at least one suite. The unbroken tree (the control) passed `verify.js`, `opus.verify.mjs`
and the golden hashes in the same harness, and after the gaps were closed `verify.js` and the browser suite again.
Six breaks showed gaps: four were held only by golden hashes, one by no check at all (the live worker's scripts),
and one passed the order's own check for its line though other checks caught it (the pre-roll). Each is closed by
a check that now fails on it (marked "a gap"). No break survived as equivalent. For the three `reference.verify` breaks the harness
made `check()` print instead of throw, so that every failing line shows.

| What the order asks | Break (scratch copy) | Fails |
| --- | --- | --- |
| 4: round half to even | ties rounded up (`Math.round`) | `verify.js` "16 bits: ... the module's decodeInt16 frame for frame" (2,249 samples differ); golden: 29 moved |
| 4: clamp to 16 bits | no clamp (the `Int16Array` wraps) | `verify.js` "16 bits"; golden: `steam, mic gain 4 (capture clipping)` moved |
| 4: q / 32768 into the encoder | q / 32767 | `verify.js` "16 bits"; golden: 29 moved |
| 5: the gate is the sender's | the sender always with its gate off | `verify.js` [5b] "a steady -45 dBFS RMS tone never opens the gate", "speech-like input at -38 dBFS RMS ...", "the gate threshold is adjustable", "the gate holds 0.4 s of its clock ..." |
| 5: the render's seed | the sender's seed fixed | `verify.js` "the gate is the sender's" (5 spurts from 5850 ...), "the same seed gives the same samples; another moves a spurt's start" |
| 5: the gate off | the gate-off setting not passed | `verify.js` [5b] "gate: false transmits everything", "the gate off: one spurt from -2400, ..." (66 calls, 73 messages), "the cap: the sound after a gap of 15 ...", "once per message: the gate off, ... 0xC0FFEE ..." (52 calls, 73 messages) |
| 5: no typed threshold: Steam's own | the profile's -39.5 dB handed to the sender as its mean | `verify.js` "the gate is the sender's ...", "mean, not RMS: a 200 Hz square wave of height 344 ... is sent" (0 spurts), "finding 5: ..." (0 / 0 / 0 spurts), [5b] "steady sines fall into DTX comfort noise as Steam's did ..." |
| 5: a typed threshold: `32767 x 10^(dB/20)` | x sqrt 2 (read as a sine's RMS) | first run: `verify.js` passed and only the golden `steam, gate on at -30 dBFS` moved: a gap. Closed with a new check, which fails: "a typed threshold is the mean a chunk must reach: -30 dB gives meanMin 32767 x 10^(-30/20) and createSender's spurts with it" |
| 5: the sender's rules (in `steam-sender.js`) | a chunk's RMS in place of its mean | `verify.js` "mean, not RMS: 2 ms bursts of a 3 kHz sine every 40 ms ... send nothing" (1 spurt), "finding 5: ..." (1 / 0 / 1), "the peak rule: ..." (1 / 1) |
| | no peak rule | `verify.js` "the peak rule: 1 ms at 0.2 of full scale in silence is sent; at 0.1 it is not" (0 / 0) |
| | a pre-roll of 3600 samples (1800 stops the sender itself: a chunk may be longer) | first run: [5b] "the gate sends 120 ms of pre-roll before an onset", "the gate off: one spurt from -2400 ...", "once per message: ... 0xC0FFEE ...", but the order's pre-roll check passed (3600 to 4350: the onset's chunk puts 0 to 750 samples before the burst on these seeds, so the window holds a longer pre-roll): a gap. Closed: the check also reads each spurt's own pre-roll, and fails (pre-roll 3600) |
| | a hold of 0.6 s | `verify.js` [5b] "the gate holds 0.4 s of its clock after speech ..." (silence from 1.160 s), "closed frames are neither encoded nor sent", [5c] "the hold: the spurt ends 9,000 to 13,500 samples ..." (14400 to 16530), "laying: ..." (no two spurts meet) |
| 6: the cap of 10 | 15 | `verify.js` "the cap: 15 frames lost in a row give exactly 10 lost slots" (slots 145 to 159), "the cap: the sound after a gap of 15 is 100 ms earlier"; `opus.verify` "Steam's decoder: ..." (blocks 1 1 4 16 ...) |
| 6: a gap concealed in full | one frame short | `verify.js` "the cap: 15 frames lost in a row give exactly 10 lost slots ..." (slots 145 to 154), "the cap: the sound after a gap of 15 ...", "a gap of 5: 5 lost slots and nothing moves"; `opus.verify` "Steam's decoder: ..." (blocks 1 1 3 11 1 2 1 1) |
| 6: a late frame: zeros, no gap | counts toward the next gap | `verify.js` "a late frame: 480 zeros at its place ..., and nothing concealed", "a late frame's samples are not decoded ..."; `opus.verify` "Steam's decoder: ..." |
| 6: behind resets | no reset | `opus.verify` "Steam's decoder: ..." (the block after a step back differs from a fresh decoder's) |
| 6: a fresh encoder and decoder each spurt | one for the whole render | `verify.js` "16 bits"; golden: 27 moved |
| 6: frames lost at a spurt's end not played | played as stand-in blocks | `opus.verify` "100% loss: no frame arrives, so Steam's decoder conceals nothing and every slot is empty" |
| 2, 7: the library's 16-bit decoder | the stream decodes with `decodeFloat`, rounded and clamped | `verify.js` "16 bits" |
| 2: `decodeInt16` is `opus_decode` | `decodeInt16` through `opus_decode_float`, rounded | `opus.verify` "libopus 1.1.5: opus_decode's 16-bit samples match the native build sample for sample (loud, 264000 samples)" |
| 7: once per message | silence records not resampled | `verify.js` "once per message ..." (127 calls, 133 messages), "the gain is fed the decoded packets ...", "a silence record's samples are decoded zeros ..." (no record) |
| 7: no call for an empty message | the empty end message given to the resampler | `verify.js` "the gate off: ... one resampler call a message that holds samples" (73 calls, 73 messages), "once per message: ... 0xC0FFEE ... makes no call" |
| 7: one resampler, never reset | reset at each end marker | `verify.js` "one resampler, never reset ..." (82 packets in 3 spurts); golden: 27 moved |
| 7: the kernel option | `opts.swrKernel` ignored | `verify.js` "swrKernel 'c' on a loud source changes at least one of the resampler's output samples and at most 1 in 500" (0 of 113,999) |
| 7: the gain fed the silence record's zeros | resampled but not given to the gain | `verify.js` "the gain is fed the decoded packets ...", "a late frame's samples are not decoded ..." |
| 7: a late frame not fed to the gain | fed | `verify.js` "a late frame's samples are not decoded: the gain after its packet is the gain with them left out" (frame 90) |
| 7: no block held | main's rule for `steam` (the gain on the laid timeline, `decodedFromFrames`, the hold) | `verify.js` "the gain is fed the decoded packets ...", "the gain's blocks run over the decoded samples ... differs from main's rule in the first 128 samples of the second burst", "a late frame's samples ..." |
| 7: one gain for the render | reset at each spurt | `verify.js` "the gain is fed the decoded packets ...", "a late frame's samples ..." |
| 8: the anchor less the lookahead | laid at `start` | `opus.verify` "The CELT band is 561.9 us late ... (658.7 us)"; `verify.js` "the gain is fed the decoded packets ..." |
| 8: the anchor rounded | floored | first run: `verify.js` and `opus.verify` passed (the timing check's one anchor rounds down) and only the golden hashes moved (27): a gap. Closed with a new check on a source with anchors that round up, which fails: "laying: a spurt's first packet at round((start - lookahead) x 147/80), each later one after it, the later packet winning where two spurts meet" |
| 8: the later packet wins | the earlier wins | first run: `verify.js` passed (no spurts met on its sources) and only the golden hashes moved (9): a gap. Closed by the same new check, on a source where two spurts meet (606 samples laid twice), which fails |
| 9: a slot by its centre | by its start | first run: `verify.js` passed and only the golden hashes moved (17): a gap. Closed with a new check, which fails: "slots: a 20 ms slot of the source holds a frame where a spurt's laid frames cover its centre, not its start" |
| 9: complexity 9 | 10 | `verify.js` "complexity 9 (Steam sets none: the library's default) and 10 give identical packets" (the profile's number); golden: 32 moved (codecInfo) |
| 10: `createRender` holds back what a later packet can reach | gives out every laid sample while no spurt is open | `render-stream` "steam, chunks: 7" (threw: a Steam packet landed on samples already given out), and 960, 12345, one second |
| 10: the same loss mask | `createRender` draws it from another seed | `render-stream` "steam, loss 15%, jitter 50 ms, net_split 40 ms, chunks: uneven" (397,835 samples differ), and 7, 960, 12345 |
| W3-05's C1 kept on the frame path (`gain.verify` section 4, test profile) | `process()` passes no `decoded()` | `gain.verify` "process() is receiverAutoGain on the decoded signal with decoded() from the frame log", "... and not receiverAutoGain with every block decoded", "createRender, in 0.1 s pushes, gives process()'s samples" |
| reference: `warp()` (strict null) | one sample off | `reference.verify` "warp() puts the take back on the render to -40 dB ..." (-14.3, -14.3, -13.5, -13.5), and the two offset checks before it |
| | rate 5 ppm off | the same check (-5.4, -5.5, -5.0, -5.1), and the offset checks |
| reference: the end-to-end null | `locate()` 40 microseconds off | "the aligned take nulls against the render within what the alignment's tolerance allows" (-7.1, -8.2, -8.2, -7.2 against -11.3 and -10.6), and the offset checks |
| 1: the footer's credit | removed | browser "the footer credits FFmpeg's libswresample (LGPL, translated to JavaScript, modified) beside LAME, with a link to its licence" |
| 1: the audio worker's scripts | not loaded | browser "dedicated audio worker completed the render" |
| 1: the live worker's scripts | not loaded | first run: the browser suite passed (the live chain runs no steam render before W3-11b, and the check only waited for the worker to answer): a gap. Closed by reading the worker's own scope, which then fails: "the page and the live monitor's worker load steam-sender.js and vendor/swresample/swresample.js (ready; in the worker's scope: false)" |
| 1: `sw.js` caches the resampler | not listed | browser "after the first visit, before any reload, every file the page needs offline is cached (vendor/swresample/swresample.js)" |
| 5: `app/render.js` sends `undefined` | `null` | browser "the live monitor runs the microphone through the Steam chain in real time (0 of 71 frames sent, gate closed)" |

## Checks that moved, and why

Checks that stood on the old `steam` render and moved with it, each with its reason in the file:

- `tests/verify.js` [4], "without the receiver clamp, the codec band edge holds": the bound is now -70 dB (it was
  -80). Steam's resampler (its 32-tap default filter, finding 29) rejects its images above 14 kHz by over 65 dB
  where the app's own filter gave 75 dB or more, and decoded sound is whole 16-bit steps: -78.7 dB here. The
  check is about the clamp, which puts energy there at -37 to -56 dB.
- `tests/verify.js` [5b], the gate's checks that read the frame gate's numbers. The gate off: a slot whose centre
  lies past the source's end may stay empty (the sender's frames end with the source, so the codec's 6.5 ms delay
  past the last frame is never decoded), and one spurt. The hold: the spurt ends 375 to 562 ms after the speech,
  silence from 5 ms after its end (it was 440 ms of 20 ms frames). The pauses: 0.3 s stays in one spurt, 0.8 s
  makes two (a pause under the hold, Steam's rule; there is no 560 ms rule of hold and pre-roll). The steady tone
  that faded by DTX is replaced by finding 13's sine sequence (below).
- `tests/verify.js` [10b], the whole live chain against a render: it now runs on `steam_48` (the live chain keeps
  the frame path until W3-11b, so it no longer equals the `steam` render), with the delay from that profile.
- `tests/verify.js` [10c], retiming against a plain render: the plain render now takes the same seed (3) as the
  retimed ones, since the seed also sets the sender's clock.
- `tests/opus.verify.mjs`: the timing check reads the render's lateness as Steam's resampler's 16 inputs plus the
  anchor's rounding, within 3 microseconds, and the SILK lead relative to it; with 100% loss nothing is lost
  (every slot gated: no packet arrives, so the sender's frames are lost, not played as concealment, see the cap);
  the mute check reads "unmuted before 0.01 s"; two stubs wrap `steamRoundTrip`.
- `tests/gain.verify.mjs` section 4 and `tests/reference.verify.mjs`'s null: authorised, above and below.

**Finding 13 (DTX fades a steady tone):** on the new render, finding 13's sine sequence gives, at -36 dBFS, 76 DTX
frames from 0.42 s (Steam 75 from 0.42 s; main 78 from 0.38 s); at -30, 40 from 1.18 s (Steam 40 from 1.16 s; main
40 from 1.18 s); at -24, none (Steam none). The checks take 0.42 +/- 0.08 s and 75 +/- 5, 1.16 +/- 0.08 s and 40 +/-
5, and 0. The old check's steady tone moved because the 16-bit capture and the pre-roll's zeros change when the
encoder enters DTX: the codec alone on 2 s of a -30 dBFS RMS tone gives 65 DTX frames from float input, 46 from
the same input rounded to 16 bits, 8 with 2400 zeros in front; complexity 9 and 10 the same each time.

## The null check (`tests/reference.verify.mjs`)

The old check rendered a take with a 1.2345 s delay and a clock 120 ppm fast, found its timeline with `locate()`,
warped it back and asked the null against the render to be under -25 dB. On the new `steam` render it gave -18.1 dB.

What I found:

- `warp()` is right. Put back through the exact composition of the take's own warp with the found timeline, the
  take nulls to -57.9 dB.
- The null was set by where `locate()`'s two estimates fell: 8.55 microseconds and 0.33 ppm apart here, within the
  check's own tolerances (20 microseconds, 1 ppm). At a 0.987 s delay the same render gives -26.2 dB:

  | Render | 1.2345 s | 0.987 s |
  | --- | ---: | ---: |
  | `steam` (the new render) | -18.1 | -26.2 |
  | `steam_48` (main's path, unchanged) | -29.6 | -20.9 |

  So main's `steam` render passed the old bound by where its estimates happened to fall at 1.2345 s, and
  `steam_48`, whose render did not change, would fail it at the other delay.
- The new render lags the source by a steady 0.60 ms after its first packet (602.8 microseconds measured): Steam's
  resampler's 16 inputs (0.667 ms) less Opus's own SILK lead (about 57 microseconds, which `steam_48` shows alone).
  That lag is the game's (finding 29) and is not trimmed.

Now, at both delays and on both profiles:

- **end to end:** the null is under what the alignment's tolerance allows, derived, not chosen: a component at f,
  `d` seconds off, nulls to `4 sin^2(pi f d)` of its power; with `d = 20 us + 1 ppm x t` over the window and the
  render's own spectrum, the bound is -11.3 dB (`steam`) and -10.6 dB (`steam_48`). Measured -18.1, -26.2, -29.6,
  -20.9.
- **strict:** the take through the found timeline composed with its own warp nulls under -40 dB. Measured -57.9,
  -57.9, -57.7, -57.7: a margin of 17.7 dB.

Breaks: a one-sample offset in `warp()`, `warp()`'s rate 5 ppm off, and `locate()` 40 microseconds off (see the
table).

## The live take (`tests/browser.verify.js`, check 3f)

The check records the page's live chain on a fake microphone and renders the recorded microphone offline, and
asks the two to line up. The live chain is unchanged in part a (the frame path); the offline `steam` render now
runs Steam's resampler. So:

- **`steam_48`** keeps the check as it was: `|lag| <= 1` sample and `r > 0.8`.
- **`steam`** lags the live take by Steam's resampler. After its first packet, which it mirrors, each spurt is
  `29.4 - frac + (round(anchor) - anchor)` voice-rate samples late, where `frac` is how far short of the output
  grid the resampler's stream stands at the spurt's first packet: 27.9 to 29.9 samples at 44.1 kHz, 28.9
  (0.655 ms) on average. The prediction from the resampler's state matched each spurt within 0.15 samples. The
  page's device ran at 44.1 kHz locally and on CI, so the window is computed from the take's rate:
  `|lag + 28.9 k| <= 1.5 k`, `k = rate / 44100`. The correlation is lower than on `steam_48` because the two
  paths' gates and gains differ (the live chain's frame gate and block gain against the sender and the gain on
  decoded packets), so the check asks `r > 0.7`.

Sixty seeded takes of the check's own source, simulated at each rate, and thirty on `steam_48`:

| Path, device rate | Peak lag (count) | Fractional lag | r: min / 10th percentile / median |
| --- | --- | --- | --- |
| `steam`, 48 kHz | -32 (27), -31 (33) | -32.29 to -30.60 | 0.808 / 0.847 / 0.868 |
| `steam`, 44.1 kHz | -30 (4), -29 (40), -28 (16) | -29.82 to -28.12 | 0.786 / 0.829 / 0.869 |
| `steam_48`, 48 kHz | 0 (30) | -0.01 to 0.18 | 0.883 / 0.888 / 0.908 |

W3-11b puts the live chain on the sender and rewrites this check.

## Speed

All under the heavy lock, one job at a time, on this machine (4 cores), in Node, with the default page settings and
the speech-like source of `tests/render-stream.verify.mjs` made at 48 kHz (`createRender` fed 1 s pushes; the source
made before the clock starts). `origin/main` is its engine as it stands at `9659696` (`audio.js`, `constants.js`,
`opus-codec.mjs`, the Opus module, the sender and the resampler, each the same file as there).

| Render | Branch | `origin/main` | Ratio |
| --- | ---: | ---: | ---: |
| `createRender`, 30 min | 88.6 s (20.3x real time) | 71.7 s (25.1x) | 1.24 |
| `process()`, 60 s (three runs) | 3.2, 2.8, 2.9 s (19 to 21.5x) | 2.4, 2.3, 2.4 s (25x) | 1.25 |
| `createRender`, 60 s (three runs) | 3.3, 3.1, 3.1 s (18 to 19.5x) | 2.3, 2.6, 2.5 s (23 to 26x) | 1.27 |

The `steam` render is about a quarter slower and still about 20 times faster than real time, so above the 10x
mark. Where the time goes (self time from a CPU profile of a 2-minute `createRender`, the source's making left
out):

| Stage | Branch | `origin/main` |
| --- | ---: | ---: |
| Opus encode and decode (WebAssembly) | 27.5% | 33.9% |
| the zero-phase FIR stages (the capture roll-off, the output FIR) | 26.0% | 31.5% |
| Steam's resampler (`swresample.js`: its exact fused multiply-add, `fma` and `dotFma3`, nearly all of it) | 19.4% | |
| the app's sinc resamplers: 48 to 24 kHz (and on main 24 to 44.1 kHz) | 14.6% | 25.6% |
| the timeline (laying, the gain's spans, the slots) | 4.0% | |
| the gain, the output stage, the 16-bit capture, garbage collection, the rest | 8.6% | 9.0% |

In seconds of the 30-minute render (the profile's shares applied to its time): Steam's resampler takes about 17 s where main's 24 to 44.1 kHz sinc took about
5.5 s, and the timeline about 3.5 s; Opus takes the same time on both (about 24 s). The resampler's cost is its
emulation of C's `fmaf` in JavaScript (to be bit-exact with the C library), in `vendor/swresample/`, which this order
may not touch.

## Runs

**Fix round,** on `efe9b2f` (after the fix round's commits and a merge of `origin/main`), under the heavy lock:

- `pnpm test:vendor`: the three modules match their recorded hashes.
- `pnpm test`: `verify.js` 245 passed (three new); `gain.verify` 68; `gain-exact --synthetic` ok; `opus.verify` 147
  (the wrap check new, the mute check restated); `speex102.verify` 71; `reference.verify` 42; `formats.verify` 66;
  `filerate.verify` 53; `meter.verify` 50; `video.verify` 45; `demo.verify` 36; `render-stream.verify` 270 (the two
  heavy-loss cases); `voice-channel.verify` 127; `steam-sender.verify` 58; `swresample.verify` 43. None failed.
- The browser suite: 228 passed; check 3f on `steam` peaked at -30 samples at 44.1 kHz (0.680 ms), r 0.845, at the
  window's edge as 4 of the 60 simulated takes were; `steam_48` at 0, r 0.861.
- CI (`tests`): passed on `efe9b2f` (run 42846023426, job `verify`).

**Before the review,** on `7539c7a`, under the heavy lock:

- `pnpm test:vendor`: the libopus 1.1.5, CELT 0.11 and Speex 1.0.2 modules match their recorded hashes.
- `pnpm test`: `verify.js` 242 passed; `gain.verify` 68; `gain-exact --synthetic` ok; `opus.verify` 146;
  `speex102.verify` 71; `reference.verify` 42; `formats.verify` 66; `filerate.verify` 53; `meter.verify` 50;
  `video.verify` 45; `demo.verify` 36; `render-stream.verify` 260; `voice-channel.verify` 127;
  `steam-sender.verify` 58; `swresample.verify` 43. None failed.
- The browser suite: 228 checks passed. Its W3-11a lines: the audio worker renders `steam` through the sender and
  the resampler (25 resampler calls); the live monitor's worker holds both modules in its own scope; the footer's
  credit; check 3f, `steam` peak at -29 samples at 44.1 kHz (0.658 ms), r 0.801, and `steam_48` at 0, r 0.861.
- CI (`tests`): passed on `7539c7a` (run 42817962747, job `verify`), as on `f9d18b2` before it. Earlier runs on this
  branch failed where expected: before the golden re-record, and on `a3ce67f` at check 3f's first window (48 kHz),
  which the device rate (44.1 kHz) put out of reach; `927742b` fixed it.

## Review

Two readers went over `8853fea`; neither found a must-fix.

- The reviewer: an independent model of the decode side, written from the reports, equals `process()` on 54 of 54
  cases (the decoded messages, every `packet()` output, the capture and the laid signal), and `createRender`
  equals `process()` on 279 of 279 streamed renders (270 at chunk sizes from 1 to 9001 and 9 under heavy loss).
  Both module hashes reproduce from the build script, and the native comparison passes.
- The second reader: the branch's own `process()`, driven by Steam's real chunk lengths (W3-14's recording), gives
  Steam's recording in 524,286 of 524,288 samples (W3-14's two). The gate clip as one session through
  `createSteamDecoder` gives 524,256 of 524,288 with W3-16's 17-frame cut (by hand: the render has no cut), and
  523,712 with W3-14's reading of it.

Their should-fix findings are the fix round's.

## Fix round

Each item with the check that fails without it (the breaks are in the table below):

1. **Re-timing on the steam path** (the second reader's finding 1, the reviewer's note 9). `steamTimeline` records
   each spurt's laid span; `retimeSpurts` moves, for the spurts it chooses by the slots as before, every laid span
   their slots meet, whole, and never onto the spurt before (the laid spans run up to half a slot past the slots,
   so an uncapped move could reach into the spurt before by up to a slot). New check in `[5c]`: six bursts 0.8 s
   apart at seeds 1 to 4, 18 and 21 (at 18 and 21 a move would otherwise reach the spurt before): 8 moves, each
   moved spurt equal to the unmoved one sample for sample, nothing left between its new end and its old end, each
   after the spurt before, and the rest of every render as it was. The frame path does not pass spans and is
   unchanged.
2. **The stream's cursor bound** (the reviewer's finding 1). Two cases in `tests/render-stream.verify.mjs`: 4 s of
   noise, the gate off, loss 80% at seed 1 and loss 40% at seed 3, each at chunks of 960 and 7 (and the steam
   plans). Without the cursor term both throw at every chunk size. Their hashes are new entries; no recorded hash
   moved.
3. **Rules the golden hashes alone held** (the reviewer's finding 2). In `[5c]`: each silence record is exactly
   `msg.silence` zeros and the resampler gives for it what it gives for that many zeros in its place; under loss
   on a loud source, every decoded message equals the module's `decodeInt16` and `decodePacketLossInt16` with a
   decoder per spurt, in two renders: gaps of 3 and 12, the last two frames of the longest spurt and the first
   frame of every other spurt lost (15 concealed, 13 + 2); and the gate off with three frames in ten lost (91
   concealed), enough concealment for the rounding of `decodePacketLossFloat` to show.
4. **The late frame's span rounding** (the reviewer's finding 3). It cannot be made to matter: every sound packet is
   480 F samples, and the resampler (147/80) gives exactly 882 F for it, its first packet included (it flushes:
   7,056 for 8 frames), since 480 x 147/80 = 882 and a whole number added to the resampler's running position adds
   that many outputs whatever the fraction a silence record left. So `j n / F` is `882 j`, a whole number, and
   `Math.floor` and `Math.round` agree on every frame of every render: the floor is an equivalent change. What can
   be pinned is the premise, and the late-frame check now asks it: every sound packet is 882 samples a frame.
5. **The mute check** (`tests/opus.verify.mjs`). The render now starts with half a second of a faint tone the gate
   does not send, so the first spurt's pre-roll is that tone and the reset gain's unity block is heard where the
   spurt starts. The check asks it heard there (laid at 15,975; not zero from 16,011 to 16,103, the block's 128
   samples and the output filter's one) and nothing after it; an all-zero render fails it. The 100% loss case keeps
   its own check.
6. **Sequence numbers of 16 bits** (the second reader's finding 3). `createSteamDecoder` keeps the number the
   decoder expects as `(seq + 1) & 0xFFFF` and judges "behind" against it as Steam does, the numbers as they are;
   the render's `lost()` and `late()` count on in 16 bits and do not move that number, so a frame lost at 65535
   makes 0 behind and resets, as in Steam. The stream gives `(f - first) & 0xFFFF`. New check in
   `tests/opus.verify.mjs`: a decoder given 65530 to 65535 and 0 to 5 decodes one frame each after the wrap (the
   10 concealed in front of 65530 are what a fresh decoder does), exactly as one module decoder given the same
   calls; and a frame lost at 65535 makes 0 behind: a reset. A spurt reaches the wrap only at its 65,536th frame,
   and encoding that many frames takes 20 to 25 s here, so the check drives the decoder with hand-numbered
   packets rather than the stream with messages. No render changes below that frame (all recorded hashes
   unchanged).
7. **The stream's reach** (the second reader's finding 7): `3 x grid + preroll` from `STEAM_SENDER` (4650, as
   before).
8. **`tests/accuracy.mjs`**: `MODEL_FILES` lists `steam-sender.js` and `vendor/swresample/swresample.js`.
9. **This report**: the "18 frames" paragraph corrected (W3-02c's notes), the typed threshold's meaning until
   W3-11b (reading 3), re-timing (reading 9), the reach (reading 11), and this section and "Review".

The fix round's breaks, in scratch copies as before (the control, unbroken, passed `verify.js` and
`opus.verify.mjs`):

| Item | Break (scratch copy) | Fails |
| --- | --- | --- |
| 1 | re-timing moves the slots' samples, not the laid spans (the code before the fix) | `verify.js` "re-timing on the steam path moves a spurt's laid samples whole ..." (8 moves; 0 whole, 0 leaving nothing behind) |
| 1 | the move not kept off the spurt before | the same check (8 moves; 6 after the spurt before) |
| 2 | `createRender` ignores the open spurt's cursor (the reviewer's M18) | `render-stream` "steam, gate off, loss 80%, seed 1 ..., chunks: 960" and "chunks: 7" (threw: a Steam packet landed on samples already given out), "chunks: 12345", and the loss 40% case likewise |
| 3 | a silence record one sample long (M07) | `verify.js` "a silence record is exactly its count of zeros, and the resampler gives for it what it gives for that many zeros in its place" |
| 3 | the decoder kept across spurts, only the encoder fresh (M05) | `verify.js` "under loss the decoded samples are the module's decodeInt16 and decodePacketLossInt16, a fresh decoder each spurt ..." (in its first render, where each spurt but the longest loses its first frame) |
| 3 | concealment through `decodePacketLossFloat`, rounded half up and clamped (M10) | the same check, in its second render (the gate off, 91 frames concealed: "NOT the module's"); with one render of 15 concealed frames it passed, since the two roundings part only at a tie or past full scale |
| 4 | a late frame's span by `Math.floor` (M16) | nothing: equivalent (every packet is 882 samples a frame, so `j n / F` is whole; the check now asks that premise) |
| 5 | the steam render's voice all zeros (with `check()` made to print, as the suite stops at its first failure) | `opus.verify` "Receiver mute is exact silence after the first block, which is heard where the first spurt starts", and "Quality changes the decoded audio", the timing check, "Partial loss conceals packets ..." |
| 6 | the decoder's expected number not masked (`seq + 1`) | `opus.verify` "Steam's decoder: sequence numbers wrap at 16 bits, 65535 then 0 with no reset and nothing concealed; ..." |
| 6 | "behind" judged against the render's count, lost frames included | the same check (the frame lost at 65535: concealed, not reset) |
| 6 | the stream's numbers not masked | nothing: equivalent (the decoder masks what it is given) |
| 6 | `receive()` not masking what it is given | nothing: equivalent (its one caller, the stream, masks) |

Golden hashes after the fix round: the 49 recorded cases unchanged (the 48 of `origin/main` and the `steam_48`
quarter frame), and the two new heavy-loss cases recorded.

## Readings of the order

1. **"The app's demo speech."** There is none rendered through the gate (the demo's voice is received sound); I
   used the render-stream suite's speech-like source at render seeds 1, 2 and 3.
2. **`gateThresholdDb` null.** `app/render.js` sends `undefined`, not `null`, for `steam` at -39.5: the render reads
   both as Steam's own, but the live chain (`createLiveChain`, not in part a) reads `null` through `finiteOr` as
   0 dBFS. W3-11b replaces the line.
3. **A typed threshold** is a number clamped to -90..0 dB and gives `meanMin = 32767 x 10^(dB/20)`; `codecInfo.gate`
   reports it, and -40 when none is typed (the sender's 327.67 is -40.0 dB of 32767). `codecInfo.sender.meanMin` is
   reported with the gate off too (what the gate would have used). So until W3-11b a number typed in the
   threshold control means, on `steam`, the mean of |x| in dBFS (a sine opens about 0.9 dB above the same number
   read as its RMS), while the control's help still says a frame's RMS; and -39.5 itself cannot be asked for as a
   mean, since the page sends nothing for it. W3-11b rewrites the control and its help.
4. **The path is chosen by `senderGate.rule === 'steam'`**, with the codec on and no received voice; it refuses a
   decoder EQ or rates other than 24 and 44.1 kHz (a test profile with a decoder EQ stays on the frame path, by
   leaving the rule out).
5. **Where the 16 bits are taken:** after every capture stage at 24 kHz (the roll-off and any filters), just before
   the sender.
6. **Slots.** Slot `i` covers codec samples from `480 i - lookahead`; there are
   `ceil((codecLength + lookahead) / 480)`; a slot takes the code, bytes and mode of the frame whose laid span
   covers its centre, the later packet winning; a slot nothing covers is gated. `gatedFrames`, `lostFrames`,
   `lateFrames` and the rest count slots.
7. **Lost frames before a late one** are concealed when the next frame arrives, after the late frame's zeros (the
   decoder never saw the late frame, so the gap runs through it); frames lost at a spurt's end are never played.
8. **A fresh encoder and decoder each spurt** (as Steam makes one at each spurt): new objects, not a reset.
9. **Retiming** (`opts.retime`) on the steam path works on the 44.1 kHz signal, with 882-sample frames and the
   lookahead scaled (`round(156 x 147/80)`). It chooses spurts and gaps by the slots, as before, and moves each
   spurt's laid samples whole (the spans `steamTimeline` records), never onto the spurt before. Before the fix
   round it moved the slots' samples, and the laid packets run up to half a slot past the slots they mark: a moved
   spurt left part of its tail behind or lost part of its head (the second reader's finding 1).
10. **The hooks** get the message as a second argument; `onGain` is called once a render in `process()` and once a
    piece in `createRender`.
11. **`createRender`'s hold-back**, above: about 200 ms of the sender's input plus the open spurt. The 4650 is
    taken from the sender's own constants (3 grid steps, its longest chunk, and the pre-roll).
12. **The render-stream suite** now takes about 5 minutes: every `steam` case runs at four chunk plans, and the
    six-minute case at chunks of 7 takes about a minute.

## What I would change in the order

- `tests/accuracy.mjs`'s `MODEL_FILES` did not list `steam-sender.js` or `vendor/swresample/swresample.js`, so a
  change to either would not mark predictions as made after a model change. Added in the fix round, with the
  orchestrator's leave (one line).
- The order's file list missed four test files that the change reaches (`tests/reference.compare.mjs`,
  `tests/gain.verify.mjs`, `tests/reference.verify.mjs`, check 3f of `tests/browser.verify.js`); the orchestrator
  authorised each.
- Under the order's rules, frames lost at a spurt's end are never played (the decoder conceals a gap only when
  the next frame arrives), so 100% loss gives a silent render with no lost slots. `tests/opus.verify.mjs` had
  asked for lost slots there; it now asks for this. The order does not say it; I read it from point 6's rules.
- `vendor/swresample/COPYING.LGPLv2.1` is linked from the footer but not in `sw.js`'s `ASSETS`: the browser suite
  asks every cached asset to be a file the page loads, and the page does not load it. Offline, the link is the
  one thing missing.

## For W3-11b's builder

- `createLiveChain` is unchanged: it still runs the frame gate on `steam`. `steamCapture(x)` and
  `steamSenderOptions(opts, gateOn, seed)` in `audio.js` are the render's two helpers to share.
- The live chain reads `gateThresholdDb: null` as 0 dBFS (`finiteOr`); the render reads it as Steam's own. Make
  them agree, then replace `app/render.js`'s line (it sends `undefined` for `steam` at -39.5 today).
- Rewrite: browser check 3f's `steam` run (it measures the lag between the two paths) and `tests/verify.js` [10b]
  (moved to `steam_48`).
- The render's gain is fed decoded packets in order, a silence record's zeros included and late frames left out;
  the live chain should feed it the same way for the two to equal.

## For W3-02c's builder

- `createSteamDecoder()` in `opus-codec.mjs` takes real packets: `receive(seq, packet)` conceals a gap (at most 10)
  when the next frame arrives and resets on a sequence number behind; `end()` resets. `lost(seq)` and
  `late(seq)` are the render's stand-ins for what a channel would see.
- One resampler for the whole render: it outlives spurts and decoder resets, which is what Steam's does. A
  channel model that keeps several speakers needs one per speaker, never reset.
- The loss mask is per sender frame number, so a frame's fate does not depend on how the sender bundled it.
- A late frame here is 480 zeros in place and no gap; the resampler's lateness (16 inputs) is inside its
  output, not added on the timeline.
- W3-16, merged to main during this build, reads that Steam's decoder buffer holds 17 frames and cuts a record
  that needs more. A render cannot reach it: only a spurt's first message holds 7 to 9 frames, and it follows no
  gap (a fresh decoder, number 0); any later message is at most 479 kept samples and a 2250-sample chunk, 5
  frames (6 when the end pads it). So a render's worst is 10 concealed and 6 decoded, 16. What a render can pass
  is the game's room: by W3-16 the engine takes at most 22,528 bytes a call, 12 frames at 44.1 kHz, and refuses a
  message over it whole (code 4: none of it plays), while the render plays all of it. Under loss a render makes
  messages of 13 to 16 blocks (10 concealed and 3 to 6 decoded). That is the loss model's order, not this one.
  (The report first said "a gap of 10 before a message of 8 frames gives 18": an 8-frame message is an opening and
  follows no gap, so that was wrong.) W3-16's float hold (`now > noted + 0.4` in 32-bit floats) is the sender's, in
  `steam-sender.js`, which this order did not touch.
- Sequence numbers are 16 bits since the fix round (`(seq + 1) & 0xFFFF`, "behind" compared as the numbers are),
  as Steam's packets carry them; a frame the render loses at 65535 makes 0 behind and resets, as in Steam.
