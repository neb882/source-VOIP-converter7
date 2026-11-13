# W3-22: the words on `vaudio_miles` after the 2006 sitting

**Status 2026-11-13: not started.** Written by the orchestrator.

**Kind:** words, the suite that pins them, and the record. No render changes: no recorded hash may move.
**Roles:** `tf-builder` (effort high), then `tf-reviewer`. **Branch:** `claude/w3-22-miles-words`, from `main`.
**Worktree:** in the brief. **Report:** `docs/reports/W3-22-miles-words.md`. **Budget:** 3 hours.

## Why

`vaudio_miles` was never a Team Fortress 2 codec; the app carries it as a second track, named as such everywhere.
Until 2026-11-13 nothing of a running engine with that codec had been recorded, and one sentence says so in the
page, the README, the record, the vendored codec's README and three code comments: "It has not been checked
against any recording of a running engine." The `miles` suite pins that sentence.

On 2026-11-13 the owner recorded three sittings in Source SDK Base 2006 (private; numbers only). They are in
`docs/FINDINGS.md`, entry 11, "Against a running engine", which is this order's source for every figure: copy
figures from there and from nowhere else. In short: with a 13 s clip of ours as the microphone the public
implementation, reset once before the press, gives 143,796 of the game's 145,800 decoded samples exactly and
144,952 within one step; a second press at `voice_maxgain 10` comes out in 143,913 of 145,800 after the gain rule
when the receiver's codec is reset twice before it; the owner's voice agrees in level, frame levels and spectrum,
where no sample can be compared. So the sentence is false for the codec stage. It is still true for the profile
as the app runs it (its talk-start resets, its held gain and its lost frame are stand-ins, and everything after
the gain is TF2's of today), and the words must keep saying that.

## What changes

1. **The sentence.** Everywhere the old sentence stands, this one takes its place, word for word:

   > Its codec stage was checked against one sitting of a 2006 engine on 2026-11-13; the profile as the app runs
   > it was not.

   The places: `README.md`; `tests/LEGACY_CODECS.md`; `tests/REFERENCE_2026.md` (the `miles` profile's entry and
   wherever else the old sentence stands; there as a correction marked *Corrected by W3-22 (2026-11-13)*, the old
   sentence left readable beside it, as `CLAUDE.md` asks of the record); `vendor/voxware-vr12/README.md`; the
   comments in `vendor/voxware-vr12/index.mjs`, `constants.js` and the head of `tests/miles.verify.mjs`.
2. **The page's note** (`index.html`, `#codec-note`) keeps four sentences; the third becomes: "Its codec was
   checked against one recording of a 2006 engine; the rest of the profile was not." The other three stay word
   for word. `tests/miles.verify.mjs` and `tests/browser.verify.js` pin the new note.
3. **The record.** `tests/REFERENCE_2026.md`, under the finding that holds `vaudio_miles` (finding 31), gains a
   dated entry with the sitting's figures as `docs/FINDINGS.md` entry 11 gives them, each with its standing, and
   what is not settled (why the first frames after a silence of 0.5 s or more differ; why the receiver's codec is
   reset twice before a second press; the profile as run). `tests/LEGACY_CODECS.md` gets two or three lines to the
   same effect under `vaudio_miles`.
4. **`docs/ACCURACY.md`** drops its sentence that the page, the README and the tests' record still say the codec
   was never checked ("an order changes those words (not built yet)").
5. **The profile's behaviour is not changed.** The sitting's "one reset a side before a first press" is what the
   profile does at a render's start. Its "two resets on the receiver's side before a second press" is measured
   and not read, and the profile's rule for a new talk spurt stays a stand-in; the comment in `constants.js` says
   what the sitting showed, in one sentence, and that the rule was left.

## Files

May touch: `README.md`, `index.html` (the note only), `constants.js` (the comment only), `vendor/voxware-vr12/README.md`,
`vendor/voxware-vr12/index.mjs` (the comment only), `tests/miles.verify.mjs`, `tests/browser.verify.js` (the pinned
note only), `tests/LEGACY_CODECS.md`, `tests/REFERENCE_2026.md`, `docs/ACCURACY.md`, `docs/FINDINGS.md` (only if a
sentence there still says the pages have the old words), the report. `sw.js`: never the number; the list does not
change.

May not touch: any code that runs (a comment is not code that runs; `git diff` of `constants.js` and
`vendor/voxware-vr12/index.mjs` must show comment lines only), any recorded hash, `docs/PROGRESS.json`,
`docs/PROGRESS-LOG.md`, `CLAUDE.md`, `vendor/voxware-vr12/vr12.c` and its tables.

## Done means

1. `node tests/run.mjs miles` passes with the new sentence and note pinned, and fails when any one of the places
   is put back to the old sentence, and when the note's third sentence is changed by a word.
2. `grep -rn "has not been checked against any recording of a running engine"` over the repository finds the old
   sentence only where the record keeps it readable as the corrected text, and in `docs/` reports and logs of
   earlier dates (those are history and are not edited).
3. `flock /tmp/tf2ve-heavy.lock pnpm test` and the browser suite pass; no recorded hash moved
   (`git diff origin/main` shows none).
4. `node tests/cache-number.mjs origin/main --report` says the number must rise (cached files changed); its line
   is in the report.
5. Every figure added is in `docs/FINDINGS.md` entry 11 on `main`, with the same standing; the report lists each
   with its line there.
6. The words follow `CLAUDE.md`, "Writing the documents": the codec is named as never in TF2 wherever it is
   named; no finding called new; plain words.

## Stop and ask

A place that pins the old sentence and is not listed; a figure wanted that entry 11 does not give; anything that
would change what the profile renders.

## Rulings of 2026-11-13, after the builder's stop

The builder found the old sentence, or a statement it carried, in seven places the order did not list, and
stopped as the order asks. Ruled, place by place:

1. `docs/VOICE-PATH.md`, the `miles` paragraph: the old sentence gives way to the new one, word for word.
2. `tests/README.md`, "Suites that read documents": it says what the suite `miles` checks now.
3. `tests/predictions/PREDICTIONS.md`: left as it is. It is a dated note of 2026-11-11 and true of that day, and
   no builder edits that folder. Done-means 2's search leaves `tests/predictions/` out.
4. `docs/PAGE.md`: the description of the note follows the note: it says the codec is not a TF2 codec, that its
   codec was checked against one recording of a 2006 engine, and that the rest of the profile was not.
5. `docs/owner-runs.md`, "`vaudio_miles` in an engine of 2006 or 2007": the old sentence gives way to the new one,
   and "Nobody has run this." to what was run: one sitting of Source SDK Base 2006 on 2026-11-13, a file as the
   microphone at `voice_maxgain` 1 and 10 and a shorter one of speech, with what it settled by reference to
   `docs/FINDINGS.md`, entry 11, and what it did not (the 2007 engine, a second player, a lost packet). The steps
   gain one line only if they lack it: one press a file, since the game writes its two files again at every
   release of the key (the record's entry "The file-input runs, measured again").
6. `opus-codec.mjs`, the comment above `VR12_RATE`: its last sentence gives way to the new one. Comment lines
   only; the file is one the site loads, and the cache number rises at this merge in any case.
7. `app/render.js`, the console line printed when `vaudio_miles` is chosen, and its pin in
   `tests/browser.verify.js`: the line's second half becomes "its codec was checked against one recording of a
   2006 engine; the rest of the profile was not". This is a string the page's console shows, not a render: no
   sample and no recorded hash moves, and the order's "no render change" stands.

The builder's edits to two further lines of `README.md` that said no recording of a running engine exists are
kept. After these, done-means 2's search finds the old sentence only in the suite's own test data, the record's
kept and corrected text, `tests/predictions/`, and the earlier reports, logs and orders.

## Rulings of 2026-11-13, after the review

The review found no line of code changed and no render moved, and four places that still tell a reader the codec
was never checked, in other words than the old sentence's. Ruled:

8. `docs/owner-runs.md`, the table at the head: the State cell of the `vaudio_miles` row says what was run
   (once, 2026-11-13, Source SDK Base 2006, a file as the microphone and speech) and what was not (the 2007
   engine, a second player, a lost packet). The suite's test for "nobody has run" ignores case and the word
   after it.
9. `docs/VOICE-PATH.md`, the codec table's row for `miles`: its standing against the game follows
   `docs/ACCURACY.md`'s row, figure and standing unchanged: the codec stage measured against one sitting of
   Source SDK Base 2006, not TF2; the profile as run not checked.
10. `app/console.js`, the help string of `sv_voicecodec`, and `constants.js`, the comment at the head of the
    profiles: "unverified" gives way to "its codec checked against one recording of a 2006 engine, the rest of
    the profile not". `app/console.js` joins the order's files for that string alone. The value
    `status: 'unverified'` in `constants.js` is data a test pins and stays. If a test pins the help string, the
    pin follows it.
11. The suite's exemption for the older sentence ("nothing of a running engine with this codec has been
    recorded") is narrowed to what its comment says: the sentence is looked for in the text left after each
    marked correction is taken out, in the record and in `tests/LEGACY_CODECS.md`.
12. Three passages say what entry 11 says and no more: "the public implementation" where "the vendored build"
    stands in `tests/LEGACY_CODECS.md`; "the first press of one sitting" where the record gives 143,796 of
    145,800 for "one sitting"; and "reset once" with "exactly" in the record's second correction. The report's
    line number for the record's kept text is brought up to date.
13. The dated note in `tests/predictions/PREDICTIONS.md` for the two hashed files changed in comments only
    (`constants.js`, `opus-codec.mjs`) is the orchestrator's, written at the merge.
