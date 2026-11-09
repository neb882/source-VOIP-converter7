# W1-03 report: a plan for renders longer than 10 minutes

The plan is six work orders, `docs/work-orders/W2-01` to `W2-06`. This report gives the measurements behind them,
what was reasoned rather than measured, the choices and the limits proposed.

## Measurements

Node 22 on the 4-core machine shared with two builders, one measurement at a time under
`flock /tmp/tf2ve-heavy.lock`. The engine is loaded as `tests/reference.compare.mjs`'s `audioEngine()` does (a `vm`
context with `constants.js` and `audio.js`, the real `opus-codec.mjs` imported). The source is synthetic and
speech-like: 95-155 Hz harmonics with a 3.2 Hz syllable envelope, in talk spurts of 0.5-6 s with pauses of 0.1-4 s,
over a -72 dBFS noise floor, mono at 48 kHz, rendered with the page's default settings (Steam, open, volume 0.5). The
gate sent about 75% of frames (10 minutes: 107 spurts, 7,610 of 30,001 frames held back). Each run had
`--max-old-space-size=2048`, a `timeout`, and a watchdog that killed it past a set RSS (typed arrays live outside the
V8 heap, so the heap cap alone does not bound them). Peak memory is `process.resourceUsage().maxRSS`; "float
buffers" is the RSS above the loaded source in units of one source-sized `Float32Array`.

| What | Length | Time | Peak RSS | Above the source |
|---|---|---|---|---|
| `TF2Audio.process` | 1 min | 10.1 s (5.9x real time) | 158 MB | 8.5 float buffers (small run, GC noise) |
| `TF2Audio.process` | 10 min | 99.2 s (6.0x) | 606 MB | 4.0 float buffers (442 MB) |
| `TF2Meter.analyze` | 10 min | 14.6 s | 606 MB | 4.0 float buffers |
| `TF2Meter.analyze` | 60 min | 87.6 s | 3,362 MB | 4.0 float buffers (2.6 GB) |
| `Math.max(...list)` in the meter | 120 min (72,000 values) | - | - | works in Node 22 |
| piece-by-piece render vs `process()` | 1 min, 48 kHz, chunks of 12,345 | 6.1 s vs 10.1 s | - | 0 samples differ, WAV identical |
| piece-by-piece render vs `process()` | 6 min, 48 kHz, chunks of 12,345 | 36.9 s vs 59.3 s | 408 MB both runs | 0 samples differ of 17,280,000, WAV identical, 59 spurts |

Queued but not finished within the 90-minute budget (the scripts are in the scratch folder named in the brief and
can be rerun): the piece-by-piece comparison at 44.1 kHz with chunks of 4,096, with 10% loss and 50 ms jitter, at
9.5 minutes, and the naive split (each piece rendered by `process()` on its own); a 30-minute `process()` render and
a 30-minute piece-by-piece render for memory; `encodeWav` and `TF2Flac.encode` at 60 minutes. W2-02's tests cover
the equality cases; the builder reports the memory numbers.

Not measured: 30-, 60- and 120-minute whole renders. At 4 float buffers above the source, a 120-minute 48 kHz render
needs about 1.38 GB x 5 = 6.9 GB plus the meter's 5.5 GB; on a machine shared with two builders it was not run, and
the 10- and 60-minute ratios (4.0 and 4.0) say how it scales: linearly.

## The piece-by-piece render (the claim the plan rests on)

A prototype in the scratch folder (`pieces.mjs`) renders a source in uneven chunks through the engine's own
streaming stages (`streamResampleSinc`, `streamFir`), the codec frame by frame through `createVoiceStream` (fresh
encoder and decoder at each talk spurt, as `roundTrip`), the gate decided once its 6-frame pre-roll has been
measured, the loss mask drawn once over all frames with `buildLossMask`, a copy of the auto-gain that keeps its state
and processes the last partial block, and the soft limit per sample. The zero-phase FIRs run causally with their
delay dropped and zeros pushed at the end; each resampler is flushed with zeros and cut to `resampleSinc`'s length.
For the default Steam profile at 48 kHz it gave **exactly** `process()`'s samples and WAV bytes for 1 and 6 minutes.
The prototype keeps state only (plus one byte a frame), so its memory does not grow with the source beyond the output.

Two traps found on the way, written into W2-02: the live chain's `streamLossMask` draws only for sent frames, so it
cannot stand in for `buildLossMask`; and `softLimit`'s `(1 - threshold)` is not `0.02` in floating point, so the
stages must be the engine's own functions, not re-typed copies.

Rendering each piece with `process()` on its own (the naive split at pauses) cannot be exact, from the code: the
auto-gain's `fixed`, `step` and `prevTarget` carry over silence (an all-zero block leaves them be), so a fresh piece
starts its first spurt at gain 1 instead of where the last spurt left it, for two 128-sample blocks (about 6 ms at
44.1 kHz) per piece; the frame grid, the resamplers' edges and the room tails also restart. That run is queued
(above) to give the size of the difference; the plan does not depend on it.

## Reasoned from the code (a browser is needed to measure)

One float buffer F is 4 bytes x samples per channel at the decode rate: 11.5 MB a minute at 48 kHz.

- **Decoding.** `decodeAudioData` returns the whole file as planar float at the audio device's rate: 2F for stereo,
  transient. `mountSource` then holds the mono mix (F), a copy of the left channel for stereo (F) and the dry WAV
  blob (F/2). At load a stereo source peaks near 4.5F on the main thread (30 minutes at 48 kHz: 1.6 GB; 120: 6.2 GB).
- **The render job** copies the capture signal (F) to the worker; the worker peaks near source + 4F (`process`,
  measured) and then the meter's +4F (measured) while holding the output (F) and the blob (F/2).
- **The page after a render** holds the render (F, `processedBuffer`) and its WAV blob (F/2) beside the source.
- **The dry meter** copies the source to another worker and K-weights it: +5F there.
- **Visualizer:** WAVE at FIT scans every sample of the audible version per redraw; SPEC decimates the whole signal
  (about +F per version viewed); AVG is bounded (1,500 windows); the codec lane reads one byte a frame.
- **FLAC export** (worker): WAV bytes (F/2), `readWav`'s `Int16Array` copy (F/2), the bit writer preallocated at
  F/2, the result copy: about 1.75F. **MP3:** LAME already takes 16-bit chunks; renders above 48 kHz are converted to
  float and resampled first (+2F).
- **Video:** the file is read whole and copied (up to 2 GB for a 1 GB file), the copy kept while the source is
  loaded; the remux Blob copies the picture again. The 1 GB limit binds before duration does.
- **Real takes:** limited to 15 minutes already; alignment copies take, source and render to a worker.
- **Batch:** two lanes at once on 4+ cores, each holding all of the above for its item.
- **Demos:** the whole file (up to 512 MB, about 50 minutes of game at the stated 170 KB/s) and one speaker's voice
  at 24 kHz (F/2 per minute at 48 kHz terms), decoded per spurt into chunks then joined: small next to a file source.
- **ZIP** has no ZIP64: archives stop at 4 GiB.
- Browser per-allocation and per-tab limits differ by browser and version and were not checked here.

## Options weighed

- **Stream the render (chosen, W2-02/W2-03/W2-04).** Measured exact; makes the worker's memory grow with the output
  only; keeps `process()` untouched so a render up to 10 minutes cannot change.
- **16-bit storage of renders and sources.** Halves the page's holding, but every consumer (WAVE, SPEC, BARS, meter
  selections, the video remux, the take alignment) reads floats; a `processedBuffer` of `Int16Array` would touch all
  of them, and a 16-bit source would change the render of a float-decoded file. Deferred: it is the next step if the
  owner wants 60 minutes or more (question 2).
- **Decoding without `decodeAudioData`** (WAV from `File.slice`, MP4/M4A audio through WebCodecs with `video.js`'s
  sample tables). Removes the largest transient (2F) and decodes at the file's own rate (an idea in PROGRESS), but it
  is a different decoded PCM from today's on most machines, needs a demuxer per container, and WebCodecs audio is not
  in every browser. Not planned in W2; question 3.
- **Splitting at pauses and rendering pieces with `process()`.** Not exact (auto-gain state, see above). Rejected.
- **Demo past 10 minutes.** Decoding is already per spurt and the voice is at 24 kHz; only the cut in
  `app/source.js` stops it. Folded into W2-03.
- **Views.** A min/max/RMS summary for WAVE and decimating only the visible range for SPEC (W2-05).

## Proposed limits (W2-03)

| Source | Now | Proposed | Why |
|---|---|---|---|
| Audio file | 100 MB, 10 min | 100 MB, 30 min at 48 kHz as a sample budget (15 min at 96 kHz) | After W2-03 the main thread is the peak: about 4.5F at load and 4F held (source mono + left, dry and wet WAV, render). 30 minutes at 48 kHz stereo is about 1.6 GB at load. The worker drops from source + 8F to about 2F. |
| Video | 1 GB, 10 min | 1 GB, the same audio budget | Same decode; the byte copy is W2-06. |
| Demo | 512 MB, first 10 min kept | 512 MB, whole voice up to the same sample budget (60 min at 24 kHz) | The file limit is about 50 minutes of game; the voice is half-rate mono. |
| Recording | 5 min | 30 min (owner to confirm) | Mono at the device rate, the same class as a 30-minute file. |
| Real take | 15 min | 15 min, its own constant | Alignment copies three signals to a worker; long takes are not the use case. |
| Batch | 10 min per item | same as files; items over 10 min render alone | Two long renders at once would double the peak. |

Over a limit, the page says the clip's length, the limit and "long files are held in memory", and mounts nothing.
A render of 30 minutes takes about 5 minutes at the measured 6x real time; the progress bar covers it.

## Order of work

- **Now, beside W1-01 and W1-02:** W2-01 (meter.js only).
- **After W1-01 merges:** W2-02 (audio.js).
- **After W2-01 and W2-02:** W2-03 (worker and page) and, beside it, W2-04 (audio.js).
- **After W2-03:** W2-05 (visualizer) and W2-06 (video), side by side.

## Risks

- The equality was measured for the Steam profile only, at 48 kHz, for two lengths and one chunk size. CELT frames of
  512 samples, Speex (not merged yet), 44.1/96 kHz sources, loss, the bypass and the demo path are argued, not run.
  W2-02's test matrix is where that is settled; if any case cannot be made exact, the builder must stop and report.
- Browser memory is reasoned. The 30-minute limit assumes a desktop tab can hold about 2 GB of typed arrays; phones
  and 32-bit browsers cannot. W2-03 must measure in Chromium.
- Two render paths (process for up to 10 minutes, the stream past it) can drift. W2-02's equality tests are the
  guard; merging the paths is a later decision.
- `audio.js` is shared with W1-01; W2-02 cannot start before it merges.
- A hashed model file changes when `audio.js` gains `createRender`; PREDICTIONS.md must say so.

## Questions for the owner

1. Is 30 minutes the right first target, or is a whole match (often 30-45 minutes) the goal, which needs W2-05 and
   16-bit storage first?
2. Should every render move to the stream once W2-02's tests hold, so there is one path, or should sources up to
   10 minutes keep `process()` for good?
3. May sources longer than 10 minutes be decoded another way (at the file's own rate, through WebCodecs), giving
   different decoded PCM than `decodeAudioData` on the same machine?
4. Should a recording be allowed 30 minutes?
5. Which devices must long files work on (desktop only, or phones)?

## Results that arrived after the report

The queued runs finished after the planner had reported; the orchestrator read them from the scratch files on
2026-11-09 (two of the queued runs, the 44.1 kHz comparison among them, were removed from the queue and did not run).

| What | Result |
|---|---|
| piece-by-piece vs `process()`, 6 min at 48 kHz, chunks of 960, 10% loss and 50 ms jitter | 0 samples differ, WAV identical |
| piece-by-piece vs `process()`, 9.5 min at 48 kHz, chunks of one second | 0 samples differ of 27,360,000, WAV identical |
| the naive split (each piece through `process()` on its own), 6 min | 338,057 samples differ, by up to 0.092 of full scale: rejected, as reasoned |
| piece-by-piece render alone, 30 min at 48 kHz | 752 MB peak RSS |

## Not done

No code outside `docs/` was changed. The queued runs listed above did not finish within the budget; no browser
measurement was made.
