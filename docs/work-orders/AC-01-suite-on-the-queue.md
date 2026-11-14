# AC-01: the accuracy suite on the game's voice queue

Status: written 2026-11-14 by the orchestrator; built, reviewed (merge as is, three fixes made, below) and merged 2026-11-14 with no cache change. The private run on it is `docs/ACCURACY.md`'s table.

## Why

The page renders Steam voice on the game's voice queue by default (Phrase timing, W3-02d-1; read, `index.html`
`#timeline`, `app/render.js` `renderOptions()`). The accuracy suite, `tests/accuracy.mjs`, still renders every take
on the file's own timing: `measureInPage` sets `timeline: 'source', fps: undefined, bufferMs: undefined` over the
page's options (read, `tests/accuracy.mjs:100`). So the suite does not measure what the page plays.

The orchestrator's private run of 2026-11-14 (measured; `docs/ACCURACY.md`, "Every take on the game's voice queue")
put every take through the suite on both timings. On the queue the clock the suite reads falls from about +400 ppm
to within 7 ppm of 0 on every take without loss but one, and the timeline's correlation rises on 12 of 13 takes.

That run left one row open: `music_take_it_off`, level 0.08 / 0.4 dB (r 0.997) on the file's own timing against
2.14 / 24.0 dB (r 0.370) on the queue. The orchestrator looked at it privately the same day (measured; the take
stays private). The row's cut, `takeSeconds` [70, 170.76], holds more than the music:
- the take is digital silence from 163.75 s to 165.2 s of the recording (the voice key released);
- then a short second piece of sound, which fades out by 166.9 s;
- the source's music plays on through both.

On the file's own timing the line-up stopped at the silence. On the queue it ran 2 s further, into the second piece,
where the take is 10 to 26 dB under the render. With the cut ending at 163.6 s, the row reads:
- file's own timing: 0.07 / 0.2 dB, r 0.997;
- queue: 0.07 / 0.2 dB, r 0.998.

So the gap was the take's ending, not the render.

## What to build

1. **`tests/accuracy.mjs`, `measureInPage`.** A take is rendered as the page renders it by default: the take row's
   settings over `renderOptions()`, with the timing worked out afterwards from the options as merged. The rule is
   the page's own (`renderOptions()`, `app/render.js`):
   - the game's voice queue when the merged options have `codec` `steam` and `enableWarble` true, and the row does
     not ask for the file's own timing;
   - its frame rate is the row's `fps` if given, else `TF2VoiceChannel.VOICE_CHANNEL.fps`; its `voice_buffer_ms`
     is the row's `bufferMs` if given, else `VOICE_CHANNEL.bufferMs`;
   - otherwise the file's own timing, exactly as `SOURCE_TIMING` in `app/render.js` (`timeline: 'source'`, no
     `fps`, no `bufferMs`).

   A row asks for the file's own timing with `"timeline": "source"` in its settings. Do not rely on the page's
   controls for the codec or the warble: a row's settings may change either.

   The lossless guide render (`guide`, `:108`) takes the same timing as the render.

   The JSON a run writes (`--json`) records the timing each take was rendered on (`options` already holds it once
   merged; check that it does).
2. **`predictInPage`, `takeStatsInPage` and the stand-in takes (`:135`, `:167`, `:411`) keep the file's own timing.**
   The predictions in `tests/predictions/` were registered on it and are not re-registered here. A short comment at
   each says so and names this order.
3. **`tests/accuracy.takes.json`:**
   - `music_take_it_off`: `takeSeconds` becomes `[70, 163.6]`, with a `note`: the recording's voice key is released
     at 163.75 s and a short second piece follows to 166.9 s, while the source plays on; measured 2026-11-14 (AC-01).
   - `net_baseline`: `"fps": 295`. `net_jitter` and `net_combined`: `"fps": 336`. These are the rates the
     photographs of those takes show, as the private runs used (`docs/ACCURACY.md`, the note of 2026-11-13).
   - `net_jitter` and `net_combined`: the `note` BC-4 gave them, that the suite renders on the file's own timing
     where jitter does nothing, is no longer true. Rewrite it: the suite renders on the game's voice queue, where the
     jitter is when messages reach the queue (BC-4), and the render's skips are one draw.
   - Every other row is unchanged. The `about` text says each row keeps the app's default for anything not given.
     It gains one clause: the default includes the game's voice queue at 300 frames a second and
     `voice_buffer_ms` 100.
4. **Docs.**
   - `docs/ACCURACY.md`, "The figures", the column list:
     - **Clock**: on the queue the take's dropped sample per packet and the queue's skips are in the render too, so
       the clock reads near 0. A dated sentence says so.
     - **Pieces**, **5.8 ms steps**, **Other steps**: they count the take against a render that has the queue's
       steps; say so in one sentence.
     - "How the takes were rendered": add the timing (the game's voice queue at 300 frames a second, 295 and 336
       for the three Set C rows, `voice_buffer_ms` 100).
     - Do not edit the table, the two dated notes under it, or the section "Every take on the game's voice queue":
       the orchestrator replaces the table after its private run on the branch.
   - `tests/README.md`: the accuracy suite's row says it renders as the page does by default, on the game's voice
     queue for Steam voice, and that the predictions keep the file's own timing.
   - `tests/REFERENCE_2026.md` and `tests/predictions/PREDICTIONS.md`: any sentence that says the suite renders on the
     file's own timing is made true, with a dated mark. PREDICTIONS.md gains one sentence: the predictions keep the
     file's own timing (AC-01).
5. **The report**, `docs/reports/AC-01-suite-on-the-queue.md`: what changed, what was run, what was not run (the
   takes are private; the builder cannot run the suite on them), and each figure with its standing.

## Checks

- `node --check tests/accuracy.mjs`, and the repo's own fast checks as `tests/README.md` lists them (the harness
  checks that load `tests/accuracy.mjs` or the manifest, if any).
- A run of the suite end to end without the takes. Write a scratch manifest, outside the repo, with one row whose
  take is a render the builder makes itself of a committed test signal on the game's voice queue: the page's
  `TF2Audio.process` in headless Chromium, saved as WAV. Run `node tests/accuracy.mjs --takes <scratch folder>` on
  it with the changed suite, once with the row on the default timing and once with `"timeline": "source"`. The
  report gives both rows as printed and shows from the JSON that the timing recorded is the one asked for. Delete
  the scratch files after.
- The orchestrator's private run on the branch, every take on the changed suite, is the order's real check. It is
  not the builder's.

## Files

May touch: `tests/accuracy.mjs`, `tests/accuracy.takes.json`, `tests/README.md`, `tests/REFERENCE_2026.md`,
`tests/predictions/PREDICTIONS.md`, `docs/ACCURACY.md` (only as item 4 says), the report.

May not touch: anything under `engine/` or `app/`, `index.html`, every codec module, `voice-channel.js`,
`tests/predictions/plan.json` and `predictions.json`, `docs/PROGRESS.json`, `docs/PROGRESS-LOG.md`,
`docs/README.md`, `sw.js`. No site file changes, so the cache number does not change.

## After the review (2026-11-14)

The review (merge as is, nothing blocking) found three things; all three are done on the branch before the merge.

1. **The random rows on the queue.** With loss or jitter on the queue, the lossy render's timeline moves away
   from the lossless guide's: 22 to 89 ms with jitter 50 at 336 frames a second, about −51 ms through the noise with
   loss 21.7% (measured by the reviewer, a Node render of the network test signal). The take is lined up on the
   guide's timeline and then compared with the render on its own. A take that is the suite's own render, sample for
   sample, reads clock +182, level 3.19 / 20.4 dB, r 0.904 with jitter 50 on the queue, and −43, 0.30 / 2.4, 0.999
   with loss 21.7% (on the file's own timing: +1, 0.01 / 0.1, 1.000; measured by the reviewer).

   Fix, in `measureInPage`: when the render is on the queue and the row has loss or jitter, the render is lined up
   too. Run `TF2Reference.track` on it against the source with the guide as the reference, as the take is, then
   `warpSegments`. The comparison is the warped take against the warped render over the part both cover. Every
   other row is compared as before, and its figures must not move. The check is the reviewer's: through
   `--manifest`, a take that is the suite's own render with jitter 50 at 336 frames a second, and one with loss
   21.7%, both on the queue. Each should read near the file's own timing's +1, 0.01 / 0.1, 1.000; the report gives
   what they read. The JSON says, for such a row, that the render was lined up too.
2. **`tests/retiming.mjs`** reads the suite's `--json` and takes each piece's delay as the take against the source,
   in source time. Against a render on the queue it is the take against that render. It now refuses JSON in which
   any row was rendered with `options.timeline` `'game'`. Its message says to run the suite through `--manifest` on
   a scratch copy of the manifest with `"timeline": "source"` on every row. Its usage line says the same, and so
   does its row in `tests/README.md`. `tests/REFERENCE_2026.md`'s pointer to it gains one added, dated line.
   `tests/retiming.mjs` joins "May touch".
3. **`docs/ACCURACY.md`, Clock.** "so the clock reads near 0" becomes: on the takes without random loss, all but
   one within 7 ppm of 0 (measured, 2026-11-14).

Not fixed, and recorded here: a row's `fps` of 0 or less renders at 10 in the suite where the page would use 300,
and a string `fps` renders at 300 while the JSON records the string. No row has either.
