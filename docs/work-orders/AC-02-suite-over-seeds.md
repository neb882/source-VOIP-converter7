# AC-02: the accuracy suite over several seeds

Status: written 2026-11-14 by the orchestrator; built, reviewed (merge after fixes; the four fixes made, below) and merged 2026-11-14 with no cache change.

## Why

A render of Steam voice draws things no recording shows: the sender's clock and capture phase, and with them, on the
game's voice queue, where skips and early starts fall; the room's random taps; which messages a loss takes. All of
them come from one seed (`opts.seed`, default `0xC0FFEE`; read, `engine/render.js`). The accuracy suite renders each
take once, at the default seed, so each row of `docs/ACCURACY.md`'s table is one draw.

The orchestrator's private looks of 2026-11-14 (measured; `docs/ACCURACY.md`, "Against the file's own timing") show
how much one draw can move a row. `sender_A` reads a level of 0.12 / 0.5 dB at the default seed and 0.74 to 0.88 /
8.7 to 10.4 dB at seeds 1 to 8. The change comes from one half-second block at 108.5 s, where the sender's draw
moves a sound from one block to the next; the room plays no part. The default seed was the best of the nine there,
and nothing says it is for the other takes.

## What to build

1. **`tests/accuracy.mjs`, `--seeds <n>`.**
   - With no option, or `--seeds 1`, the suite runs as today: each row at the row's own `seed` if it gives one, else
     the default. Its printed table and its JSON are the same as before (the seconds of work aside).
   - With `n` above 1, each row is measured `n` times:
     - at the row's own seed, or the default;
     - then at seeds 1 to `n − 1`, skipping any that equals the first.
     - Each measurement is the whole of `measureInPage` (render, guide, line-up, comparison), since the line-up
       depends on the render.
   - The printed row gives each figure as its median over the seeds, then `[least…most]` for:
     - clock;
     - alignment r;
     - level rms and worst;
     - level r;
     - offset.
     - Phrases, pieces and the two step counts give their median only.
     - The worst band gives the band of the median seed's measurement and the median of its value.
     - Keep the columns readable at the table's width; abbreviate as the header already does.
   - The JSON keeps every seed's full result under the row (`seeds: [{ seed, ...result }]`) and a `summary` with the
     medians and ranges. With `--seeds 1` the row's JSON is as before, with no `seeds` key.
2. **The predictions are not touched.** `--write-predictions`, `--score-predictions` and `--simulate-takes`
   refuse `--seeds` with a clear message. Their renders keep the default seed as registered.
3. **Docs.**
   - `tests/README.md`: the accuracy row gains `--seeds <n>`, one sentence.
   - `docs/ACCURACY.md`, "How to read each column": one sentence. When the table comes from a run with `--seeds`,
     each figure is the median over the seeds, with the range after it.
   - Do not edit the table or anything below it; the orchestrator replaces the table after its private run.
4. **The report**, `docs/reports/AC-02-suite-over-seeds.md`: what changed, what was run, each figure with its
   standing.

## Checks

- `node --check tests/accuracy.mjs` and the repo's fast checks as `tests/README.md` lists them.
- **The suite without `--seeds` is unchanged.** Make a scratch take as AC-01's builder did: the suite's own render
  of a committed test signal, saved as WAV, with a scratch manifest passed by `--manifest`. Run it on main and on the
  branch without `--seeds`. The two JSON files are the same apart from the seconds of work. Show the comparison.
- **The seeds.** The same scratch take, made at the default seed, and run with `--seeds 4`. Expected:
  - the default seed's measurement reads as the take is (level 0.00 / 0.0 dB, r 1.000);
  - the other three read worse;
  - the printed median and range agree with the four results in the JSON.

  Then a row with `lossPct` 21.7 on the queue, with `--seeds 3`. The report gives both rows as printed.
- Delete the scratch files after.
- The orchestrator's private run, every take with `--seeds 9`, is the order's real check and replaces the table. It
  is not the builder's.

## Files

May touch: `tests/accuracy.mjs`, `tests/README.md`, `docs/ACCURACY.md` (only as item 3 says), the report.

May not touch: anything the site loads (`engine/`, `app/`, `index.html`, the codec modules, `voice-channel.js`,
`reference.js`), `tests/accuracy.takes.json`, `tests/predictions/`, `tests/retiming.mjs`, `docs/PROGRESS.json`,
`docs/PROGRESS-LOG.md`, `docs/README.md`, `sw.js`. No site file changes, so the cache number does not change.

## After the review (2026-11-14)

The review (merge after fixes) found four things; all four are done on the branch before the merge.

1. **Blocking: the worst band's median seed** (`tests/accuracy.mjs:365`). Each seed's worst band is the band of
   largest size, but the seeds were sorted by the signed value. With signs that differ, that picks the seed whose
   worst band is smallest. Example: the builder's loss row has +0.0, +1.1 and −0.6 dB and printed "+0.0 dB at
   120-200" where the sizes give 0.6 dB at 300-500. Sort by the size and print the median seed's band with its own
   signed value; at an even count, the lower middle by size. The same rule applies wherever else the band is
   summarised.
2. **n measurements always** (`:346-348`). A row whose own seed falls in 1 to n − 1 gets n distinct seeds: its own,
   then the first n − 1 others from seed 1 up. The header comment and `tests/README.md` say so.
3. **`tests/retiming.mjs`** refuses JSON from a run with `--seeds` above 1, or any row holding `seeds`, right after
   AC-01's refusal, with a message to run the suite without `--seeds`. Without it, every row of such a JSON is
   skipped silently. `tests/retiming.mjs` joins "May touch". Show the refusal on a seeded scratch JSON, and that a
   plain JSON still runs.
4. **The row's seed as the engine takes it** (`:344`). `Number.isFinite(Number(settings.seed)) ?
   Number(settings.seed) >>> 0 : DEFAULT_SEED`, as `finiteOr` in `engine/render.js` does, so `"seed": "3"` is
   labelled 3 and not measured twice.

No row of the manifest gives a seed, so items 2 and 4 change no printed figure of the committed rows.
