# W2-03: sources past 10 minutes render in the page

> **Held (the owner's priority). Note of 2026-11-10 (`docs/reports/W3-plan-maintenance-2.md`), for when it
> is taken up:** W2-04 is superseded. Where this order says a room or `voice_retime` is refused by the stream
> "until W2-04", read: a room until W3-17c, `voice_retime` until W3-02f. A render's output is at the
> listener's device rate after W3-10 (48000 Hz by default), not at the source's rate, and can end in a
> room's tail after W3-17c: the worker's output buffer of `outputLength` needs the tail's cap
> (`maxTail`). W2-05 and W2-06 say they may run beside W2-04; there is no such order to run beside.

**Branch:** `claude/w2-03-long-render-page`, from `main` **after W1-01, W2-01 and W2-02 have merged**. **Worktree:**
given in the brief. **Agent:** `tf-builder`, then `tf-reviewer`. May push its branch to run CI. **Time budget:**
1 day. May run beside W2-04 (no shared files).

Part of the long-renders plan (`docs/reports/W1-03-long-renders-plan.md`).

*Amended 2026-11-09 after the advisor's review: the streaming job is checked whole against the `process` path on a
short source (a test hook forces it); an option the stream does not take yet is reported with the engine's own
message, with no special case in the page; and the length budget follows the device's memory.*

## Why

With the render (W2-02) and the meter (W2-01) taking a piece at a time, the render worker no longer needs the whole
source plus four copies plus the meter's four more (measured: a 60-minute render would need about 9 source-sized
float buffers in the worker; at 48 kHz that is over 6 GB). This order uses them for long sources and replaces the
10-minute cut with the limits the report proposes.

## Files

May touch: `audio-worker.js`, `app/render.js`, `app/core.js` (the limits), `app/source.js` (the limit checks, the
demo cut, the messages), `app/realtake.js` (only its own length limit, made an explicit constant), `batch.js`,
`mic-capture.js` (only if the recording limit needs it), `tests/browser.verify.js` (new checks), a new Node test if
the worker protocol is tested outside the browser, `README.md` (the "Limits" sentence and the Tests list).

May not touch: `audio.js`, `meter.js` (W2-01/02 own them; ask if they need a change), `constants.js`,
`opus-codec.mjs`, `video.js`, `demo.js`, `app/visualizer.js` (W2-05), `docs/PROGRESS.json`.

## Spec

1. **Two paths, chosen by length.** A source of at most 10 minutes renders exactly as today (the `process` message,
   `TF2Audio.process`, `TF2Meter.analyze`), so its samples, WAV bytes and meter numbers cannot change. A longer
   source uses a new worker message that streams. (Whether to move every source to the stream later is a question
   for the owner; see the report.)
2. **The streaming job.** The page sends the capture signal to the worker in chunks (about 2^20 samples, each a
   copy of a `subarray`, transferred), with at most two chunks in flight (the worker acknowledges each), instead of
   one whole copy. The worker pushes each chunk into `TF2Audio.createRender`, writes the output into one
   `Float32Array` of `outputLength` (transferred back at the end, as today), feeds the same output to a
   `TF2Meter.createAnalyzer`, and builds the WAV as `new Blob([header, ...int16Parts])` with each part made by
   `TF2Audio.toInt16` (the conversion `encodeWav` uses, so the bytes are the same as `encodeWav` would give).
   Progress and cancellation work as today; cancel terminates the worker.
3. **An option the stream does not take.** `createRender` rejects what it cannot stream with an error that names
   the option (a room or `voice_retime`, until W2-04). The page shows that message as it shows any render error, and
   Process stays usable for other settings. No check of its own for those options: when W2-04 merges, the page
   needs no change.
4. **The limits** (`app/core.js`), with the reasons in the report:
   - audio files: 100 MB as now; decoded length at most 30 minutes at 48 kHz, as a sample budget per channel
     (`30 * 60 * 48000` samples), so a 96 kHz decode gets 15 minutes; the message gives both the clip's length and
     the limit in minutes at the decoded rate
   - video: 1 GB as now, and the same audio budget
   - demos: no minute cut; the voice timeline is kept whole up to the same sample budget (60 minutes of 24 kHz
     voice; the 512 MB file limit is about 50 minutes of game), and past it the first part is kept with the warning
     that exists today
   - recordings: 30 minutes (`MAX_RECORDING_SECONDS`), unless the owner says otherwise
   - real takes: 15 minutes, as now, as their own named constant; with a source longer than that the take check
     says it is limited to 15 minutes
   - batch: the same limits; an item longer than 10 minutes renders alone (one lane) so two long renders are never
     held at once
   - **small devices:** where `navigator.deviceMemory` is reported and is under 8, the budget stays at 10 minutes
     (the limit that has always held there), and the message says so. `batch.js` already reads `deviceMemory` to
     pick its lanes. [The 30-minute figure assumes a desktop tab; a phone cannot hold it.]
5. **Messages.** Over a limit, the status line says the clip's length, the limit and why in a few words ("long files
   are held in memory"), and nothing is mounted. README's limits sentence is updated to the new numbers.

Not in this order: the views for long files (W2-05), video without its byte copy (W2-06), decoding without
`decodeAudioData`, rooms and re-timing in the stream (W2-04).

## Done means

Each with its command; the browser suite under `flock /tmp/tf2ve-heavy.lock`.

- The browser suite passes, with new checks:
  - a source just under 10 minutes still goes through the `process` path (spy on the worker message type), and a
    1-minute source's WAV is byte-identical to its WAV before this order (record its SHA-256 in the test from the
    `main` build)
  - **the streaming job whole, against the `process` path:** a hook for tests (a property on the page's state, not
    a control) forces the streaming job for a short source. A 60 s speech-like source rendered that way gives a WAV
    byte-identical to the `process` path's WAV for the same source and settings, and the same meter numbers
    (`Object.is`, history included). [This is the check on the chunks, the acknowledgements and the int16 parts; the
    prefix check below cannot see a fault after the first minute.]
  - a synthetic 11-minute source (a short speech-like pattern repeated, generated in the page, not a file) renders
    through the streaming path without the hook; its WAV has the right length and header, its meter row is filled,
    and its first minute equals the first minute of a `process()` render of the same first 70 s (the stream's
    prefix property)
  - with `navigator.deviceMemory` overridden to 4, an 11-minute source is refused with the small-device message
  - a long source with a room set shows the engine's message and leaves Process usable
  - a 31-minute source is refused with the message; nothing is mounted and the previous source stays loaded
  - cancel during a streaming render stops it and keeps the source
  - a long demo is not cut at 10 minutes (build a synthetic demo with voice at 0 s and at 11 min, as
    `tests/demo.verify.mjs` builds demos)
- `pnpm test` passes.
- Each new check fails when the code it covers is broken (the path chosen the wrong way round; a chunk dropped; the
  limit off by a factor); say how.
- CI passes on the pushed branch.
- The report gives, from the browser (Chromium's `performance.measureUserAgentSpecificMemory` or the task manager
  numbers Playwright can read, whichever works), the page's memory and the render time for an 11- and a 30-minute
  source, and says which numbers were measured and which estimated.
