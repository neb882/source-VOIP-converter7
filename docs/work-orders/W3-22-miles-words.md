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
