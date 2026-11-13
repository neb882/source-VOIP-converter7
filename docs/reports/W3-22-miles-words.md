# W3-22: the words on `vaudio_miles` after the 2006 sitting

The builder's report. The order is `docs/work-orders/W3-22-miles-words.md`; every figure added comes from
`docs/FINDINGS.md` entry 11 on `main` (c8d812b). Branch `claude/w3-22-miles-words`.

**Status:** built as the order lists it, and stopped on one question (below, "The question"): the old sentence also
stands in places the order does not list, so its second "Done means" is not met.

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

## The question

The old sentence, or a statement it carried, stands in places the order does not list. The order says to stop on
that, so these are left as they were.

| Place | What it says | What it would become |
| --- | --- | --- |
| `docs/VOICE-PATH.md`, the `miles` paragraph | "It has not been checked against any recording of a running engine." word for word | the new sentence |
| `tests/README.md`, "Suites that read documents" | that the miles suite checks four documents for the old sentence, quoted | what the suite checks now: the new sentence in seven places, the old one only in the record's corrections |
| `tests/predictions/PREDICTIONS.md`, the note of 2026-11-11 for W3-20b | "it has not been checked against any recording of a running engine" | a note of a past change, dated; probably left as history, but it is not under `docs/` |
| `docs/PAGE.md`, the codec menu | the note "says it is not a TF2 codec and not checked against any recording" | that the note says its codec was checked against one recording of a 2006 engine and the rest of the profile was not |
| `docs/owner-runs.md`, "`vaudio_miles` in an engine of 2006 or 2007" | "Nobody has run this." (its first sentence on the profile is still true) | that one sitting of 2006 was run on 2026-11-13, and what it left open |
| `opus-codec.mjs`, the comment above `VR12_RATE` | "Unverified: nothing of a running engine with this codec has been recorded." | the new sentence (a comment) |
| `app/render.js`, the render's console line, pinned by `tests/browser.verify.js` | "S_Voice: vaudio_miles is not a TF2 codec (Source engines of 2006 and 2007); not checked against any recording" | code that runs, which the order forbids: a line such as "...; its codec checked against one 2006 sitting, the profile not" would need the order to allow it |

The order's second "Done means" grep finds the old sentence on one line in `docs/VOICE-PATH.md` and one in
`tests/predictions/PREDICTIONS.md`; the wrapped one in `tests/README.md` it does not find.

## Commits

| Commit | What |
| --- | --- |
| `ae6d05c` | the words, the record and the suite's checks |
| `c6b042a` | the miles suite takes the profiles' file name from the helper's list (`ENGINE_FILES[0]`): the harness keeps `constants.js` out of the suites' quoted strings, and the first full run failed on it |
| (this report) | |

## Runs

| Done means | Command | Last lines |
| --- | --- | --- |
| 1 | `node tests/run.mjs miles` | `74 miles checks passed`; `1 of 1 suites passed.` |
| 1, the breaks | a script in the builder's scratch folder puts each place back to the old sentence in turn (README, LEGACY_CODECS, the vendor README, the head comments of `vendor/voxware-vr12/index.mjs` and the suite, the `miles` comment of `constants.js`, each of the record's two corrections), adds the old sentence back beside the new one in the README, and changes the note's third sentence by one word ("recording" to "take") and back to the old sentence | each of the eleven breaks fails the suite; `missed or not found: 0` |
| 2 | `grep -rn "has not been checked against any recording of a running engine"` | finds `docs/VOICE-PATH.md:120` and `tests/predictions/PREDICTIONS.md:176`, which the order does not list (above), and besides them only the suite's own test data, `docs/reports/W3-20b-miles-profile.md`, `docs/PROGRESS-LOG.md`, the orders W3-20b and W3-22 and the record's kept text (wrapped, so on line 1244 only) |
| 3 | `flock /tmp/tf2ve-heavy.lock pnpm test` | `25 of 25 suites passed. 882.0 s summed` (the run before the second commit: `24 of 25 suites passed; FAILED: harness`) |
| 3 | `flock /tmp/tf2ve-heavy.lock pnpm test:browser`, with `CHROMIUM_EXECUTABLE` set as the brief says | `417 browser checks passed`; `1 of 1 suites passed. 241.8 s summed` |
| 3, hashes | `git diff origin/main...HEAD --stat` | ten files, none of them a recorded hash; `sw.js` untouched |
| 4 | `node tests/cache-number.mjs origin/main --report` | `cached files changed since origin/main (ed14c5b): constants.js, index.html, vendor/voxware-vr12/index.mjs` / `cache number against origin/main (ed14c5b): the number is v39, not above v39: it must rise (node tests/cache-number.mjs origin/main --set)` |
| 5 | by reading | the table "The figures added" |
| 6 | by reading | `vaudio_miles` is named as not in TF2 in each added passage, or in the paragraph that holds it; no finding is called new |

Before the push the branch's diff and commit messages were scanned for recordings, personal details, SteamIDs and
model names: none, apart from the commit trailers the brief gives.

## Not done or uncertain

- The places in "The question" are left until the orchestrator rules.
- `README.md` lines 80 and 91 were not in the order's list of sentences; they are in a file it allows, and each said
  that no recording of a running engine exists. A reviewer may want them back as they were.
- `tests/LEGACY_CODECS.md` gets a bullet of three sentences, and its "What remains unknown" bullet is rewritten with
  the correction marked; that file is not the record, so the order's "left readable" was applied to it only there.
