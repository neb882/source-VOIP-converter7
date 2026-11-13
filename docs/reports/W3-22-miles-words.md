# W3-22: the words on `vaudio_miles` after the 2006 sitting

The builder's report. The order is `docs/work-orders/W3-22-miles-words.md`; every figure added comes from
`docs/FINDINGS.md` entry 11 on `main` (c8d812b). Branch `claude/w3-22-miles-words`.

**Status:** built. The first build stopped on one question (below, "The stop and the rulings"): the old sentence
also stood in places the order did not list. The orchestrator ruled on them on 2026-11-13 (the order's last section,
main at 26c31dc), and the fix applies the rulings place by place.

## What changed

`vaudio_miles` is not a Team Fortress 2 codec. Every place the order lists now says, word for word: "Its codec stage
was checked against one sitting of a 2006 engine on 2026-11-13; the profile as the app runs it was not."

| Place | Change |
| --- | --- |
| `README.md` | the sentence under "Codecs"; two more lines that the sitting made false, in the same file: entry 11 of "What we found" now ends "(read; its codec measured against one sitting of a 2006 engine)", and the bullet of "Accuracy" says "Its codec stage was checked against one recording of a 2006 engine; the profile as the app runs it was not." (it said no recording of a running engine exists; the section still names neither the profile nor the codec) |
| `index.html` | the note's third sentence: "Its codec was checked against one recording of a 2006 engine; the rest of the profile was not." The other three stay word for word |
| `constants.js` | the `miles` comment only: the sentence, and one sentence on the second press (143,913 of 145,800 after the gain with the receiver's codec reset twice and the sender's once, measured, why twice not read) and that the rule for a new talk spurt was left a stand-in |
| `vendor/voxware-vr12/index.mjs` | the head comment only: the sentence |
| `vendor/voxware-vr12/README.md` | the sentence; its "Not known" line loses "nothing of a running engine with this codec has been recorded" and "how many frames a packet held", and gains why the first frames after a long silence differ, pointing to finding 31 |
| `tests/LEGACY_CODECS.md` | the sentence under "In the app"; the "Frames per packet" row corrected (one frame in 2,741 of 2,746 messages, two in the other five); a bullet "Against a running engine" of three sentences; "What remains unknown" rewritten with its correction marked |
| `tests/REFERENCE_2026.md` | finding 31: the old sentence kept with *Corrected by W3-22 (2026-11-13)* and the new one beside it, in the W3-20b bullet and under "What remains unverified"; corrections marked where it said nothing of a running engine was recorded, how many frames a packet held was not known, and in the model table's "Not in TF2" row; a bullet "Added 2026-11-13 (W3-22)" with the sitting's figures and what is not settled |
| `docs/ACCURACY.md` | its sentence that the page, the README and the record still say the codec was never checked is gone |
| `tests/miles.verify.mjs` | the head comment; the pinned note; the words check now asks every place for the new sentence and none for the old one, but the record, where the old one may stand only followed by its correction mark and the new sentence; a second check that the record keeps two such corrections and finding 31 has the sitting |
| `tests/browser.verify.js` | the pinned note only |

`docs/FINDINGS.md` has no sentence that says the pages have the old words, so it is unchanged. `sw.js` is unchanged.
No code that runs changed: `git diff origin/main -- constants.js vendor/voxware-vr12/index.mjs` shows comment lines
only. The profile renders as before.

## The figures added

Each is in `docs/FINDINGS.md` entry 11, line 255 ("Against a running engine"), measured there and measured here.

| Figure | Where it is added |
| --- | --- |
| a 13 s clip of ours; the captured input is the clip from its third sample on in every sample | REFERENCE finding 31; LEGACY_CODECS |
| one frame of 360 samples in 2,741 of 2,746 messages, two frames in the other five | REFERENCE (twice), LEGACY_CODECS |
| reset once: 143,796 of 145,800 decoded samples exactly, 144,952 within one step | REFERENCE (three places), LEGACY_CODECS |
| the frames further off, at most 32 steps: the first two, and the first frames of the five sounds after a silence of 0.5 s or more; none after a pause of 0.44 s or less more than one step off | REFERENCE; 0.5 s also LEGACY_CODECS and (as "a long silence") the vendor README |
| the second press at `voice_maxgain 10`: 143,913 of 145,800 after the gain, the receiver's codec reset twice and the sender's once; why twice not read | REFERENCE, LEGACY_CODECS, `constants.js` |
| the owner's voice: no sample comparable; one to ten silent frames change the output at every count; level within 0.01 dB; frame levels 0.996 and 0.999, rms difference 0.75 and 0.49 dB; spectrum within 0.2 dB in every band; 8,516 samples at full scale at `voice_maxgain 10` | REFERENCE |

"Not settled" in finding 31 follows entry 11's line 257 and the order: why the first frames after a silence of 0.5 s
or more differ; why the receiver's codec is reset twice; the profile as the app runs it; the lost packet and those
engines' mixer and output.

## The stop and the rulings

The first build stopped because the old sentence, or a statement it carried, stood in seven places the order did not
list. The rulings, and what the fix did with each:

| Place | It said | Ruled, and done |
| --- | --- | --- |
| `docs/VOICE-PATH.md`, the `miles` paragraph | the old sentence, word for word | the new sentence, word for word |
| `tests/README.md`, "Suites that read documents" | that the miles suite checks four documents for the old sentence | what the suite checks now |
| `tests/predictions/PREDICTIONS.md`, the note of 2026-11-11 | the old sentence | left: a dated note, true of its day; done-means 2's search leaves `tests/predictions/` out |
| `docs/PAGE.md`, the codec menu | the note says it is "not checked against any recording" | the note says it is not a TF2 codec, that its codec was checked against one recording of a 2006 engine, and that the rest of the profile was not |
| `docs/owner-runs.md`, "`vaudio_miles` in an engine of 2006 or 2007" | the old sentence's claim, and "Nobody has run this." | the new sentence; what was run (one sitting of Source SDK Base 2006 on 2026-11-13, a file as the microphone at `voice_maxgain` 1 and 10, and a shorter one of speech), what it settled by reference to `docs/FINDINGS.md` entry 11, and what it did not run (the 2007 engine, a second player, a lost packet); the steps lacked it, so they gain step 5: one press a file, since the game writes its two files again at every release of the key |
| `opus-codec.mjs`, the comment above `VR12_RATE` | "Unverified: nothing of a running engine with this codec has been recorded." | the new sentence; comment lines only |
| `app/render.js`, the console line for `vaudio_miles`, pinned in `tests/browser.verify.js` | "...; not checked against any recording" | "S_Voice: vaudio_miles is not a TF2 codec (Source engines of 2006 and 2007); its codec was checked against one recording of a 2006 engine; the rest of the profile was not". The browser suite now pins the line whole (anchored at its end). It is a string the console shows: no sample and no recorded hash moved |

The two further `README.md` lines the first build changed are kept, as ruled.

The suite `miles` now also checks `docs/VOICE-PATH.md`, `docs/owner-runs.md` and the comment above `VR12_RATE` for
the new sentence and against the old ones, that `docs/owner-runs.md` no longer says nobody has run it and points to
entry 11 and has the one-press step, that `docs/PAGE.md` describes the note as it stands, and that `app/render.js`
holds the new console line and not the old one.

## Commits

| Commit | What |
| --- | --- |
| `ae6d05c` | the words, the record and the suite's checks |
| `c6b042a` | the miles suite takes the profiles' file name from the helper's list (`ENGINE_FILES[0]`): the harness keeps `constants.js` out of the suites' quoted strings, and the first full run failed on it |
| `63107a0` | the report as first written, at the stop |
| `a801df6`, `f327396` | merges of `origin/main` (RP-01a; then the rulings) |
| `718c21c` | the seven places as ruled, and the suite's new checks |
| (this report's update) | |

## Runs

After the fix (head `718c21c`, with this report on top):

| Done means | Command | Last lines |
| --- | --- | --- |
| 1 | `node tests/miles.verify.mjs` | `77 miles checks passed` |
| 1, the breaks | a script in the builder's scratch folder puts each place back to its old words in turn (README, LEGACY_CODECS, the vendor README, the head comments of `vendor/voxware-vr12/index.mjs` and the suite, the `miles` comment of `constants.js`, each of the record's two corrections, `docs/VOICE-PATH.md`, `docs/owner-runs.md` (its sentence, "Nobody has run this." added back, its step 5 reworded), the `opus-codec.mjs` comment (replaced, and the old sentence added beside the new), `docs/PAGE.md`'s description, the console line in `app/render.js` (put back, and changed by one word)), adds the old sentence back beside the new one in the README, and changes the note's third sentence by one word and back to the old sentence | each of the twenty breaks fails the suite: `missed or not found: 0` and `second set, missed or not found: 0` |
| 2 | `grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=predictions "has not been checked against any recording of a running engine" .` | `tests/REFERENCE_2026.md:1320` (the kept, corrected text; the other kept one is wrapped), `tests/miles.verify.mjs:735` and `:745` (the suite's test data), and the earlier reports, logs and orders: `docs/PROGRESS-LOG.md:260`, `docs/reports/W3-20b-miles-profile.md:56`, `docs/work-orders/W3-20b-miles-profile.md:292` and `:328`, `docs/work-orders/W3-22-miles-words.md:68`, and this report's own line quoting the command |
| 3 | `flock /tmp/tf2ve-heavy.lock pnpm test` | `26 of 26 suites passed. 909.1 s summed, 909.1 s of wall time, 1 at a time.` |
| 3 | `flock /tmp/tf2ve-heavy.lock pnpm test:browser`, with `CHROMIUM_EXECUTABLE` set as the brief says | `417 browser checks passed`; `1 of 1 suites passed. 262.9 s summed` (the run before it hung, below) |
| 3, hashes | `git diff origin/main...HEAD --name-only` | seventeen files, none of them a recorded hash; `sw.js` untouched |
| 4 | `node tests/cache-number.mjs origin/main --report` | `cached files changed since origin/main (4b0bf77): app/render.js, constants.js, index.html, opus-codec.mjs, vendor/voxware-vr12/index.mjs` / `cache number against origin/main (4b0bf77): the number is v39, not above v39: it must rise (node tests/cache-number.mjs origin/main --set)` |
| 5 | by reading | the table "The figures added"; the fix adds no figure but dates and gains already in entry 11 |
| 6 | by reading | `vaudio_miles` is named as not in TF2 in each added passage, or in the paragraph that holds it; no finding is called new |

At the stop (head `c6b042a`): `pnpm test` gave `25 of 25 suites passed. 882.0 s summed` (and before `c6b042a`,
`24 of 25 suites passed; FAILED: harness`), and the browser suite `417 browser checks passed`, 241.8 s.

Before the push the branch's diff and commit messages were scanned for recordings, personal details, SteamIDs and
model names: none, apart from the commit trailers the brief gives.

## Not done or uncertain

- One browser run after the fix hung for 19 minutes at the old share links check (rooms), with no output and no
  load; it was stopped and run again (below). The run before the fix passed that check.
- `README.md` lines 80 and 91 were not in the order's list of sentences; they are in a file it allows, and each said
  that no recording of a running engine exists. A reviewer may want them back as they were.
- `tests/LEGACY_CODECS.md` gets a bullet of three sentences, and its "What remains unknown" bullet is rewritten with
  the correction marked; that file is not the record, so the order's "left readable" was applied to it only there.
