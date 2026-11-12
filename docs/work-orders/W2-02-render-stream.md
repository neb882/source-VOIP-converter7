# W2-02: a render made a piece at a time, equal to `process()`

> **Status 2026-11-12: built and merged** at `860a559` (cache v20, at `43fd35f`, pull request #8). Report: `docs/reports/W2-02-render-stream.md`.

**Branch:** `claude/w2-02-render-stream`, from `main` **after W1-01 has merged** (it changes `audio.js`,
`opus-codec.mjs` and `constants.js`, and adds the Speex codec this order must stream too). **Worktree:** given in the
brief. **Agent:** `tf-builder`, then `tf-reviewer`; a `tf-skeptic` on any claim of equality the tests do not cover.
May push its branch to run CI. **Time budget:** 1 day.

Part of the long-renders plan (`docs/reports/W1-03-long-renders-plan.md`). Read its measurements and its "streaming
prototype" section first: they say what was tried, what matched, and where the edges are.

*Amended 2026-11-09 after the advisor's review: the test also records what `process()` gives today (the last item
under "Done means"), so that a later order can replace `process()`'s body with the stream and prove nothing moved.*

## Why

`TF2Audio.process` holds the whole source and several whole-length copies of it at once: measured in Node, its peak
is about four source-sized float buffers above the source itself (10 minutes at 48 kHz: 606 MB peak RSS for a
110 MB source), and it runs at about 6x real time. Every stage it runs is sequential: the resamplers, FIRs, biquads,
the gate, the codec, the auto-gain and the output stage all have streaming counterparts already (`createLiveChain`,
tests/verify.js section 10b), and the codec restarts at each talk spurt. A prototype built from those stages, fed a
source in uneven chunks, gave **exactly** the samples and the WAV bytes of `process()` for the default Steam profile
(see the report). This order makes that a supported, tested part of the engine.

## Files

May touch: `audio.js` (a new `createRender` beside `process`, and helpers it shares; `process()` itself is not
changed), `opus-codec.mjs` (only if a codec needs a frame-by-frame interface it lacks; the Opus, CELT and Speex
streams exist after W1-01), a new `tests/render-stream.verify.mjs` wired into `package.json`'s `test` script,
`tests/predictions/PREDICTIONS.md` (only the note that a hashed model file changed, if `audio.js` is one; CLAUDE.md).

May not touch: `process()`'s body, `constants.js`, `sw.js`, `app/`, `audio-worker.js`, `meter.js`, `demo.js`,
`video.js`, `tests/predictions/predictions.json`, `docs/PROGRESS.json`.

## Spec

1. **The interface.** `TF2Audio.createRender(source, opts)` resolves to a render object. `source` is
   `{ sampleRate, length, numberOfChannels: 1 }` (the mono capture signal `process` receives from
   `app/render.js`'s `captureSource`; no samples). `opts` are `process()`'s options. The object has
   `outputLength`, `sampleRate` (the output rate), `async push(chunk)` returning the output samples that became
   final (a `Float32Array`, possibly empty), `async finish()` returning `{ samples, codecInfo, realOpus }` where
   `samples` is the rest of the output, and `free()`. The caller pushes exactly `length` samples in chunks of any size.
2. **Equal to `process()`.** For the same source and options, the concatenated output is `process()`'s `samples`,
   sample for sample (`===`), its length included, and `codecInfo` is deep-equal (every counter, `frameLog`,
   `frameBytes`, `modes`, `lookahead`, `spurts`, `version`). The WAV made from it is byte for byte `process()`'s blob.
   This is the property the long-render plan rests on; nothing in this order may weaken it to "close".
3. **What carries over a chunk edge** (each was needed in the prototype):
   - hard clip and mic gain are per sample; the source finiteness check runs per chunk (the message may name the
     sample's index in the whole source)
   - each `resampleSinc` becomes `streamResampleSinc`, flushed at the end with zeros and cut to the length
     `resampleSinc` would give (`round(n * up / down)`); `resampleLinear` likewise
   - each zero-phase FIR (capture EQ, decoder EQ, the output FIR) runs as `streamFir` with its first
     `(taps - 1) / 2` outputs dropped and `(taps - 1) / 2` zeros pushed at the end; biquads keep their state
   - the gate: a frame's RMS is measured when the frame is complete (the last frame over the zero-padded end, as
     `gatePlan` does); a frame's send decision is final once `prerollFrames` later frames are measured; the codec
     runs frame by frame in order, restarting encoder and decoder at each new spurt exactly where `roundTrip` /
     `celtRoundTrip` (and W1-01's Speex round trip) do; the number of frames is
     `ceil((codecLength + lookahead) / frameSize)` as there
   - the loss mask: `buildLossMask` over all frames, drawn once at the start (it is one byte a frame), so the random
     sequence is the one `process()` draws; not `streamLossMask`, which the live chain calls only for sent frames
   - decoded frame `f` lands at `f * frameSize - lookahead`, so the codec-rate output before
     `(f + 1) * frameSize - lookahead` is final once frame `f` is done; gated and late frames leave zeros
   - the auto-gain keeps `fixed`, `step` and `prevTarget` across chunks and blocks of 128 counted from the start of
     the voice-rate signal; at the end the last partial block is processed as `receiverAutoGain` does
     (`streamAutoGain` has no flush: add one, or a private variant)
   - volume and the soft limit are per sample; the output is cut or zero-padded to `process()`'s length
     (`round(n * playbackRate / srcRate)` plus any room tail)
   - a demo's `received` voice skips sender, gate and codec as in `process()`; `codecInfo` is `receivedCodecInfo`
4. **Not streamed yet:** a room (`dsp_room` other than 0, a listener position with a room, or the custom room) and
   talk-spurt re-timing (`retime`). `createRender` rejects them with a `RangeError` that names the option; W2-04
   adds them. Everything else `process()` accepts is streamed.
5. **Memory.** Stages keep their state only. Arrays that grow with the source are allowed only at one byte or two a
   codec frame (the frame log, packet sizes, the loss mask). The caller owns the output.
6. **Progress and yielding** as `process()`: an `onProgress` option gets the share of the source pushed; the codec
   loop yields as `roundTrip` does.
7. **No change to `process()`**, so renders made today are untouched by construction; the equality tests are what
   tie the two together.

Not in this order: using `createRender` in the worker or the page (W2-03), rooms and re-timing (W2-04), any change to
what a render sounds like.

## Done means

Each with its command; run the heavy ones under `flock /tmp/tf2ve-heavy.lock`.

- `node tests/render-stream.verify.mjs` passes and checks equality as in point 2 for at least:
  - each profile (`steam`, `steam_48`, `celt_22`, `celt_44`, `speex`) on a 20-30 s speech-like source with pauses
    (talk spurts that open and close the gate) at 48 kHz
  - the Steam profile with: gate forced off, gate forced on with a different threshold, codec bypassed, high- and
    low-pass filters on, mic gain 4 (capture clipping), auto-gain off, `voice_scale` 0.5, `voice_avggain` 0.25,
    loss 15% with jitter 50 ms and `net_split` 40 ms (the only listener position with a low-pass, `water`, also has
    a room, so it belongs to W2-04)
  - sources at 44.1, 48, 96 and 22.05 kHz, and one whose length is not a multiple of anything (a prime)
  - a demo's received voice (the synthetic demo `tests/demo.verify.mjs` builds, or its frame log on a tone)
  - chunk sizes 1 (on a 1 s source), 7, 960, 12,345, one second, an uneven mix, and the whole source as one chunk
  - one default Steam render of at least 6 minutes at 48 kHz, to cover many spurts
  - `createRender` rejects a room and `retime` by name
- A memory check: a 60-minute speech-like source at 48 kHz streamed in 1 s chunks, output written into one
  preallocated array, stays under source + output + 300 MB RSS; report the time against `process()`'s 6x real time.
  It may be a script the test suite does not run by default, with the command written in the report.
- `pnpm test` passes; `tests/verify.js`'s existing checks are untouched and pass.
- Each new check fails when the code it covers is broken; at least: the FIR delay dropped by one sample too few; the
  resampler not flushed; the auto-gain's partial last block skipped; the codec restarted at a chunk edge instead of
  at a spurt; the loss mask drawn with `streamLossMask`. Say how each was broken and what failed.
- CI passes on the pushed branch.
- **Golden renders.** `tests/render-stream.verify.mjs` also holds the SHA-256 of `process()`'s WAV for every case of
  its matrix, recorded from this branch before `createRender` is written (commit them first, in a commit of their
  own), and checks `process()` against them on every run. [Equality between the two paths says they agree, not that
  neither moved. With the hashes, a later order can make `process()` a thin wrapper over the stream, so there is one
  path, and show that every recorded render is unchanged.] If a hash differs between this machine and CI, report
  which case and stop: that would mean renders are not the same on every machine, which the project claims.
