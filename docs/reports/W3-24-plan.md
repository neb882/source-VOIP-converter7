# W3-24, the plan: what was read and tried

A planning report, 2026-11-14, for the order `docs/work-orders/W3-24-render-end.md`. No app code and no test
changed. The planner read the repository at `main` `20bc58d` (cache v53) and nothing of the owner's recordings,
logs or install. Every figure carries its standing.

## What was read

- `CLAUDE.md`, `docs/PIPELINE.md`, `docs/PROGRESS.json` (the deferred entry on a render's length with jitter,
  `in_flight`, `next`).
- `voice-channel.js` whole (`createChannel`, `createTimeline`, `finish()`, the frame clock).
- `engine/steam.js` (`steamChannel`, `steamPlayedInfo`, `steamDemoVoice`), the channel's places in
  `engine/render.js` (`process()`, stages 3 to 6) and `engine/render-stream.js` (`createRender`, its steam stage
  and its last stage), `steamArrivalPlan` in `engine/network.js`, the sender's `finish()` and hold in
  `steam-sender.js`.
- The page: `app/render.js` (`renderOptions`, `sourceRenderOptions`, `presentRender`, the first seconds, the
  status line), `audio-worker.js`, `app/visualizer.js` (`laneSkips`, `frameAt`, the codec lane),
  `app/realtake.js` (`renderGuide`, the take's length), `batch.js`'s options, `index.html`'s fields for Phrase
  timing, the frame rate, jitter and `voice_buffer_ms`.
- The tests: the recorded hashes of `tests/render-stream.verify.mjs`, the references of
  `tests/render-channel.verify.mjs` and `tests/voice-channel.verify.mjs`, `tests/voicequeue/reference-frames.mjs`.
- `docs/work-orders/W3-23-low-frame-rates.md` and `docs/work-orders/BC-4-jitter-arrivals.md` for the form of an
  order, and finding 9's lines on the last 27 and 121 ms in `tests/REFERENCE_2026.md`.

## What was tried

A scratch copy of the tree with the order's change built into it (about 40 lines in `voice-channel.js`, one in
`engine/steam.js`, three in `engine/render.js`, four in `engine/render-stream.js`), and four scratch scripts run in
Node against it. None of it is in the repository; the order's check 18 makes the measurements again on the build.

The prototype's count of output samples past the source's length that still hold a place of the source is what
`main` cuts. Its first definition of "voice" was every sample of a sound message. That gave about 0.4 s of run-on
on every render that ends in sound, at very low level: the sender reads zeros for its 0.4 s hold after the
source's end, and those packets are sound messages too. The rule in the order therefore counts only places of the
source (`0 <= pos < length`).

### The figures

The order's section "Measured again on `main` `20bc58d`" has the tables. In short (measured on the prototype):

- A file that ends in a second of silence cuts nothing at 300, 66.67, 60 or 30 frames a second, at jitter 0 or 50.
- A file that ends in sound, at jitter 50: 16.5 ms (0 to 41) at 300 for one long phrase, 79 to 103 ms in the mean
  (up to 165) at 66.67, 60 and 30.
- The same at jitter 0: 0 in 20 runs at 300 on the two long sources; 0.3 to 9.9 ms in the mean (up to 41.5) at
  66.67, 60 and 30.
- A wider look at jitter 0 (360 short renders a rate): at 300, 33 renders cut something, 13.7 ms at most. So the
  page's default is not always a case with nothing cut. It is one whenever the file ends in silence longer than
  the sender's hold.

- The two test signals (seeds 1 to 3): nothing cut at jitter 0 at any of the four rates. At jitter 50 the network
  test signal loses 18.9 ms (11.9 to 23.5) at 300 and 88.3 ms (56.1 to 117.9) at 66.67, where BC-4a's second
  reader had 27 and 121. The seeds and the count differ, and the second reader's are not in the record.
- `voice_buffer_ms` 5000 at 1000 frames a second: a 2 s phrase runs on 72.5 s, because the model's wait there is
  75 s (arithmetic). At `voice_buffer_ms` 1000 and 300 frames a second it runs on 2.0 s.

### What the prototype did to the suites

All on the scratch copy, each heavy run under `flock /tmp/tf2ve-heavy.lock`:

- `node tests/render-stream.verify.mjs --hashes` on `main` and on the prototype: equal, byte for byte. No recorded
  hash is of a render that cuts something today. The first prototype put two new members into `info` on every
  render, and the `codecInfo` hash of all nine cases on the queue moved while every WAV hash stayed; with `over`
  only where a render ran on, nothing moves.
- `pnpm test voice-channel verify steam reproduce demo recordings stages`: all seven passed, unedited. That run
  was of the first prototype, before rule 5; it was not made again on the second.
- `pnpm test render-channel`: 17 checks of section 1 failed, each because the render went on past the
  reference's 529,200 samples; every other check passed, the stream's (`createRender` against `process()`)
  among them. On the first prototype 13 more failed with equal samples: the run-on had changed
  `spurts[].offsetEndMs` on renders with nothing cut. That is rule 5 of the order.
- `tests/render-stream.verify.mjs` whole was started and was stopped by the session's time limit after its first
  sections; no check had failed. It was not run again.
- The browser suite was not run.

## Choices made in the order

| Choice | Why |
| --- | --- |
| An option of `createTimeline` (`playOut`), off by default | The timeline's other callers (the live chain, a demo's packets, the tests' references) keep today's behaviour with no edit |
| The voice's end is the last place of the source heard, not the last sample pulled | See above: the sender's zeros after the end are not the file's sound |
| `over` is absent from `info` when nothing was cut | No recorded `codecInfo` hash moves. Asked as ruling 1 |
| `push()` and `advance()` never return past `length` | The run-on is known only at the end, as a room's tail is; `createRender` already holds back what is past `outputLength` for a room |
| No new option of `process()` | The ruling is for every render on the queue; no key of the page changes |
| The codec lane stops at the source's end | `info.frames` is the sender's count and several readers use it; a lane over the run-on is a page change of its own, not built |
| A demo's packets are left out | The page does not run them on the queue, and their end has its own rule. Asked as ruling 5 |

## Open questions

The order's five rulings: `over` absent or 0; the file's quiet end inside the sender's hold; no cap on a long
wait; the padding after the last pull; a demo's packets. Two more for whoever reads this:

- The run-on at the default is small and rare. If the owner would rather keep every default render at the
  source's length, the change could be limited to renders with jitter or under some frame rate. The ruling given
  to the planner does not ask for that, and the order does not do it.
- The private suites (`tests/accuracy.mjs`, `tests/retiming.mjs`) were not run. A take's last piece can change
  where its source ends in the queue.

## What was not done

- No check against the game: there is no recording of a file's end through the queue. Every figure is the
  model's.
- The browser suite was not run on the prototype, and the page's part of the change was not prototyped.
- No bound on the run-on was derived for `createRender`'s callers; the order says none is given.
