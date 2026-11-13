# RP-01e: seven of the game's recordings are published, and the files table is filled

The orchestrator's report. The order is `docs/work-orders/RP-01-reproduce-it.md`, part e (sections 7, 8, 14 and
16). Part e is the one part that touches private files; no builder and no reviewer took part in it.

**Status:** done on 2026-11-13. Seven recordings are in `tests/recordings/files/`, listed by
`tests/recordings/manifest.json`. Two candidates stayed private (section 16). The hard rule in `CLAUDE.md` is
amended in the same change.

## What decided a file

The decision in force is the owner's of 2026-11-12, as ruled: only the game's recordings of the project's own
synthetic clips, each only after the repository's code is shown to make it, with its header read first, and a
doubt leaves a file out. The publishing itself waited for the owner's own word (the order's section 17), given on
2026-11-13: "Yes to publishing synthetic clip recordings" (section 19). Applied to each of the nine candidates of section 14:

1. **Its header.** `node tests/recordings/inspect.mjs` on the file: a `fmt ` chunk of 16 bytes and a `data`
   chunk, no other chunk, exactly 44 bytes and the samples (measured, all nine). The 44 bytes of each published
   file were then read field by field once more: RIFF, the file's length less 8, WAVE, PCM, one channel, the
   rate, 16 bits, the data's length. Nothing else is in them.
2. **Its check.** `node tests/reproduce.mjs` at this merge, on the file under its public name: the counts are in
   the manifest's rows and in the record's entry "The recordings that are published". Every compared sample is
   equal to what this repository's code makes of the generated clip, or one step from it (measured).
3. **What the check does not compare.** A check counts a CELT recording's last packet apart, and a Speex
   recording's first 80 samples and the tail after the render. For a file to go out, every such sample had to be
   zero (measured: section 16's table). This is the step that left two files out.

## The two that stayed private

The `voice_maxgain 10` recordings of Sets H and I. Their last packet holds sound that is not the clip's: in Set
H's, 511 of 512 samples, some at full scale, with their energy at 7.6 to 9.5 kHz; in Set I's, 235 samples, none
above 39 steps (measured). It is probably the decoder's output for a packet cut short at the key's release
(guessed), and the read of the capture says a file input never reaches the microphone (read, W3-03's report).
That is not shown, so the two files stay where they are. The record has the measurement as measured and not
explained.

`gain` is therefore shown in public on the `vaudio_speex` recordings: Set M's and Set O's `voice_maxgain 1`
files, each with the shared `voice_maxgain 10` file, differ from the rule in no sample (measured).

## The files table

The pending cells of the record's section "The files that were read" are filled from the private copies:
names, link dates, the day each copy was taken, SHA-256s, and the build number each game printed. The paragraph
under the table says how each kind of cell was got and what is inferred (that a game's printed build number is
the file's: the copy and the console are of one install and nearly one day, and nothing else ties them). The
four SHA-256s the reports already gave for the owner's files, and one of the public package's, were computed
again and are equal (measured). Finding 8's four reads are all in the engine's image, so they are F1's.

## What else changed

- `CLAUDE.md`: the sentence under "Commands" and the opening hard rule, as the order's section 8 words them,
  with "the nine recordings" made "the recordings that the manifest lists" and the zero test added.
- `tests/REFERENCE_2026.md`: the correction at its head and in Sets H, I, M and O; the entry "The recordings
  that are published"; the filled table.
- `docs/REPRODUCE.md`: a section "Without the game", with the commands that run each check on the published
  files.
- `docs/ACCURACY.md`, `docs/FINDINGS.md`, `README.md`, `tests/README.md`, `docs/owner-runs.md`: one sentence
  each, as section 8 lists.
- `tests/recordings.verify.mjs`: two of its break tests were written for a table that still said "pending";
  they are now made from whichever the status line says. No check was loosened.

## Not done

- CI does not run `tests/reproduce.mjs` on the seven files yet, and the suite does not yet hold "every sample a
  check does not compare is zero": both are part f.
- Steam's build date for F4 and the old engines' version lines for F15 to F18 were not noted on the day; their
  cells say so.

## Runs

- `node tests/run.mjs recordings reproduce miles site harness`: all passed.
- `node tests/cache-number.mjs origin/main`: no cached file changed; the number stays v39.
- The diff was scanned for paths, names, addresses and anything of a private file but the seven recordings and
  the table's names, dates and hashes: none found.
