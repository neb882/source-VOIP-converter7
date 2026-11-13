# RP-01d: the files that were read, the manifest's frame, `inspect.mjs` and the suite `recordings`

The builder's report. The order is `docs/work-orders/RP-01-reproduce-it.md`, part d (sections 6, 7 and 9, with
sections 14 and 15 holding where they differ, and the brief's three rulings). Branch
`claude/rp-01d-files-and-manifest`, from `claude/brave-hamilton-dv2wyq` at `6e4b292`; `main` merged in at `ed14c5b` and again at `26c31dc`.

**Status:** built. Every done-means of part d passes on this machine; CI is in "Runs". No private file was opened:
no step needed one.

## What was built

| File | What |
| --- | --- |
| `tests/REFERENCE_2026.md` | under "What was read": the table there gains a last column "Files" with the ids of its rows; a new section "The files that were read" follows, with its status line ("the orchestrator's cells are pending"), the table F1 to F23, what the reports give short of a full SHA-256, the files that are not rows, what a reader can do with a hash, and one line a finding with its ids. No other line changed |
| `docs/FINDINGS.md` | one sentence under the table of readings, pointing to the record's section |
| `tests/recordings/manifest.json` | the frame: `about`, `fields` (each field of a row with what it holds) and `rows`, empty. `tests/recordings/files/` was not made, holds nothing, and nothing ignores it |
| `tests/recordings/inspect.mjs` | the header tool of section 7, WAV only (below) |
| `tests/recordings.verify.mjs` | the suite `recordings`, group `units` (below) |
| `tests/run.mjs`, `tests/README.md` | the suite's row in each; in `tests/README.md` also a row for `inspect.mjs` under "Tools that need the owner's recordings" |

Nothing under `engine/`, no file the site loads, no codec module, not `sw.js`, `CLAUDE.md`, PROGRESS or
`.gitignore`. `tests/recordings/make-inputs.mjs` is unchanged. No recorded hash of any suite moved.

## `tests/recordings/inspect.mjs`

`node tests/recordings/inspect.mjs <file>...`. For each file, named "file 1", "file 2" by its place: every chunk in
order with its offset and size; the metadata chunks by name (`LIST` with its list type, `bext`, `iXML`, `cart`,
`id3 `); the format (PCM or the tag, rate, channels, bits, samples); any problem with the header (a chunk past the
end, bytes after the last chunk, a RIFF size that is not the file's, no `fmt ` or `data`); the file's SHA-256; the
SHA-256 of the `data` chunk's bytes; and "exactly a 44-byte header and its samples: yes" or "no". "Yes" means: the
RIFF size is the file's length less 8, a 16-byte PCM `fmt ` chunk at byte 12, a `data` chunk at byte 36 that runs
to the file's end, nothing else. A file that is not RIFF WAVE (FLAC among them) is said not to be a WAV, with its
size and SHA-256, and nothing more is read. Exit 0 when every file is plain, 1 when one is not, 2 when one cannot
be read or none is given. It prints nothing of a chunk but its four-letter name and a `LIST`'s list type, with any
character outside printable ASCII as `\xNN`. It exports `inspectWav`, which the suite's folder check uses.

On the generated 11025 Hz clip it prints:

```
file 1: a WAV file of 291976 bytes
  chunks, in order:
    fmt   at byte 12, 16 bytes
    data  at byte 36, 291932 bytes
  metadata chunks: none
  format: PCM, 11025 Hz, 1 channel, 16 bits, 145966 samples
  SHA-256 of the file: bd31df844cee4b38fe705be1fbdfb1b17acb9f161f9314b06b1eb2ba0d560dbd
  SHA-256 of the data chunk's bytes: f357df06c813aff4d3eb74b285ec43e3216025a9d1892f520c2d5fe119835397
  exactly a 44-byte header and its samples: yes
```

## The suite `recordings`

`node tests/recordings.verify.mjs`, under 1 s here. Each check runs first on the repository's own files, then on
stand-ins the suite makes, and each break below is a stand-in the suite builds and expects a named problem from.

- **[0] What it takes from the record.** The two clips `make-inputs.mjs` makes have the SHA-256 the record's table
  "The file-input runs" gives (read from the record, not pinned in the suite). The never-published hashes are read
  from the record: every SHA-256 in "Provenance" before "The file-input runs", which are Sets A to F's files (24
  today), the speech take and its source among them, none of them a clip's. The findings' numbers are read from
  "## Findings".
- **[1] The table.** On the record: passes, and a skip line says the orchestrator's cells are pending. Breaks, each
  made from the record's own rows: a SHA-256 of 63 digits, one in capitals, `not kept` with no reason (and `not
  kept` with a reason passes); an empty cell; a cell holding `0x180058d80`; an address in the section's words; a
  listing of bytes; a run of 12 hex digits; `pending` under a status line that says "filled"; no status line;
  `pending` in "Report"; a cell over 100 characters; a "Built" that is not a date; ids out of order; a row a cell
  short; a column renamed; a finding the record lacks; a report not in `docs/reports/`; a row read for a finding
  whose line does not name it, and the reverse; a finding line naming no row; finding lines out of order; text
  after the finding lines; an id in "What was read" that is no row; that table without its "Files" column. A
  stand-in table with every cell filled passes under "filled", and fails with one cell pending.
- **[2] The manifest.** On the real one: the frame and its zero rows pass. A stand-in of three example rows (Set H's
  `vaudio_celt` at `voice_maxgain` 1 checked by `celt`, its partner at 10 checked by `gain`, Sets M and O's capture
  checked by `inputs --against`), shaped by the private run's counts in the record and with synthetic tones of the
  recordings' lengths as files, passes. Breaks: a missing field; a field that is not the manifest's (a
  `private_sha256`); a name with a date (`2026-11-10`, and `20261110`); a name not of the form; a name whose sets are
  not the row's; an `input.script` that is not a file, one outside the repository, one that is another file; an
  `input.sha256` that is no clip's; a `sha256` that is the record's for the speech take; a `pcm_sha256` that is the
  record's for the speech source; a hash of 63 digits; a kind that is neither; the codec `steam`; under 999 samples
  in 1,000 equal; a sample two steps off; a check that is not one of the script's; an option the check does not take;
  a check naming a file that is no row; a capture not checked by `inputs`; `bytes` not 44 plus two a sample; a
  finding the record lacks; a `used_by` that is no file; two rows of one file; `fields` that do not name the rows'
  fields.
- **[3] The folder.** On the real one: no file and no row, and the line `no recording is published yet: the
  manifest has no rows and tests/recordings/files/ holds no file`. `git check-ignore --no-index` says nothing
  ignores the folder or a file in it (a skip line where git cannot say), and an excludes file holding
  `tests/recordings/files/` or `*.wav` is caught. Breaks: a file with no row; a `.gitkeep` with no row; a row with
  no file; a file whose SHA-256 is not its row's; one whose data chunk is not its `pcm_sha256`; a row whose `sets`
  holds `J`, and one holding `K`; a file with a `LIST` chunk whose row was made to match it; a file in another
  format than its row's; a folder in the folder.
- **[4] `inspect.mjs`.** A clean file: plain, its two SHA-256s and format right; the generated clip plain; a file with
  `LIST` and `bext`: both named, every chunk with its size, not plain; `iXML`, `cart` and `id3 ` after the samples:
  named, not plain; an 18-byte `fmt ` chunk, bytes after the data, a wrong RIFF size, a data chunk past the end, a
  data chunk of odd size with its pad byte: each not plain; a FLAC file: not a WAV. The command, on files in a
  folder and under names that carry a marker: exit 0 and "yes" on a clean file, exit 1 and "no" with `LIST (INFO),
  bext` on a tagged one, "not a WAV file" and "cannot be read" with exit 2; the marker, the folder and any `.wav` or
  `.flac` name appear nowhere in what it prints. Its text loads no network module or child process and calls no
  `fetch`.

### The suite's tests, broken

Each break was made in the file, the suite run, the file restored (`scripts/break.sh` in the scratch folder).

| Break | Where | What failed |
| --- | --- | --- |
| "plain" always yes | `inspect.mjs` | [4] the tagged, `iXML`, 18-byte `fmt ` checks; [3] the `LIST` file |
| no metadata chunk named | `inspect.mjs` | [4] the tagged and `iXML` checks and the command on the tagged file; [3] the `LIST` file |
| the data chunk's hash taken over the whole file | `inspect.mjs` | [2] the stand-in's folder; [4] the clean file and the command |
| the file's path printed beside "file 1" | `inspect.mjs` | [4] the marker check and the "file 1" check |
| the RIFF size not checked | `inspect.mjs` | [4] the RIFF size check |
| the data chunk not required to end the file | `inspect.mjs` | [4] the odd-size check |
| exit 0 whatever the files | `inspect.mjs` | [4] the command on the tagged file |
| F1's SHA-256 cut to 63 digits | the record | [1] the record's table |
| F2's "Built" emptied | the record | [1] the record's table |
| the status line made "filled" | the record | [1] the record's table and the pending check |
| `0x180058d80` in F1's "From" | the record | [1] the record's table |
| `F30` in "What was read" | the record | [1] the record's table |
| a row of Set J with no file | the manifest | [2] the manifest, [3] the folder |
| the field `used_by` renamed in `fields` | the manifest | [2] the manifest and the stand-in |
| a copy of the clip put in `tests/recordings/files/` | the folder | [3] the folder (removed after) |

## The table's cells, and where each came from

Line numbers are of this branch. "Pending" cells are listed after.

| Id | Cell | Value | Source |
| --- | --- | --- | --- |
| F1 | File, From | `bin/x64/engine.dll`, the owner's TF2, 64-bit | `docs/reports/W3-03-engine-binary.md` 153 (PE32+ x86-64); the record's table "What was read", 385 ("from the owner's install") |
| F1 | Built | 2026-10-05 | W3-03, 154 ("link date") |
| F1 | SHA-256 | `4802a74c…a08ec80` in full | W3-03, 153; the same in `W3-07-mixer-output.md` 19 and `W3-09-steam-voice.md` 43 |
| F1 | Report | W3-03, W3-07, W3-09, W3-10, W3-15, W3-15b, W3-17, BC plan | W3-03 153, W3-07 19, W3-09 43 and 634, `W3-10-upsampler-read.md` 3, `W3-15-room-dsp.md` 22, `W3-15b-rooms-in-the-takes.md` 4, `W3-17-room-dsp-second-read.md` 3 and `W3-17-amp-mdy-second-read.md` 3, `bad-connections-plan.md` 10 |
| F2 | File, From, Built, SHA-256 | `bin/x64/vaudio_celt.dll`, 2026-09-30, `255cf083…` | W3-03, 155 and 156 |
| F2 | Report | W3-03, W3-08 | W3-03 155; `W3-08-celt-encoder.md` 8 to 10 |
| F3 | From | another Source game of the owner's, 32-bit | W3-08, 72 ("The owner's 32-bit module from another Source game") |
| F4 | File, From, Built, SHA-256 | `steamclient64.dll`, the owner's Steam, 2026-10-13, `e9045710…` | W3-09, 37 (64-bit: its name and the image base at 45) |
| F4 | Report | W3-09, W3-16, BC plan | W3-09 37; `W3-16-steam-hold-read.md` 8, `W3-16-second-read.md` 3; BC plan 11 |
| F5 | all given | `steamclient64.dll`, `bins_win64.zip`, 2026-10-21, `253e0a11…` | W3-09, 38 |
| F6 | File, From, Built, SHA-256 | `tier0_s64.dll`, Valve's public client package, the owner's copy not read, 2026-10-21, `8559e6bd…` | `W3-16-steam-hold-read.md` 10 to 13 |
| F7 | File, From, SHA-256 | `video64.dll`, the same package, `e84cb339…` | W3-09, 39 |
| F8 | File, From, SHA-256 | `libswresample-6.dll`, `bins_codecs_win64.zip`, `2ed49e82…` | W3-09, 40 |
| F9 | File, From, SHA-256 | `linux64/steamclient.so`, `bins_sdk_ubuntu12.zip`, `3e32119f…` | W3-09, 41 |
| F10 | File, From, Built, SHA-256 | `vaudio_speex.dll`, another Source game, 32-bit, 2026-05-20, `70d66432…` | W3-09, 42 and 502 |
| F11 | From, Read for | the owner's TF2, 32-bit; 31 (run, Set O) | `tests/REFERENCE_2026.md` 280 and 1081 |
| F12 | From, Build | the owner's TF2, 32-bit; 11191711, the build the game reported in Set O | the record, 277 and 281; `docs/FINDINGS.md` 27 |
| F13 | File, From, Built | `vaudio_miles.dll`, the owner's TF2, 32-bit, 2024-01-17 | `vendor/voxware-vr12/README.md` 53 and 71 to 74; `docs/FINDINGS.md` 29 |
| F13, F14 | Report | W3-20a | `docs/reports/W3-20a-miles-codec.md` 166 to 177; the vendor README is that order's |
| F15, F16 | Built | 2009-12-04, 2010-02-01 | `docs/FINDINGS.md` 29 (the only place in the repository that gives them) |
| F15 to F18 | Report | W3-20a, W3-20b | W3-20a 166 to 177; the record's finding 31, the bullets of W3-20a and W3-20b (1084 to 1121) |
| F17, F18 | Built, From | 2006-05-22, 2008-07-11; with the plug-in Miles 6.6a | `vendor/voxware-vr12/README.md` 71; `tests/LEGACY_CODECS.md` 115 and 116 |
| F19 | File, From, Report | `client.dll`, the owner's TF2; W3-15, W3-15b | W3-15, 31; W3-15b, 254 |
| F20 | File, From, Report | `GameUI.dll`, the owner's TF2; W3-15b | W3-15b, 4 and 216 |
| F21 to F23 | File, From, Report | the three kinds of script file, the game's own archive | W3-15, 35 and 36; the order `docs/work-orders/W3-17-room-effects.md` 148 for F21 |
| all | Read for | the findings | the order's section 6 table, which the planner made from the record; checked against the reports each finding cites (below) |
| all | Id | F1 to F23 | the order's section 6 |

The partial hashes in the note under the table: F3's from W3-08 72, F19's from W3-15 31, F21's size and CRC-32 from
W3-15 36 and W3-17's order 148, F11's 50 bytes from the record 280 and 1081.

### The cells left `pending`, by id and column

| Id | Columns |
| --- | --- |
| F1, F2, F4 | Build, Taken |
| F3 | File (its name), From (which game), Build, Built, Taken, SHA-256 |
| F5, F6 | Build, Taken |
| F7, F8, F9 | Build, Built, Taken |
| F10 | Build, Taken |
| F11 | File (its name), Build, Built, Taken, SHA-256 |
| F12 | File (its name), Built, Taken, SHA-256 |
| F13 | Build, Taken, SHA-256 |
| F14 | File (the names), Build, Built, Taken, SHA-256 |
| F15, F16 | File (its name), Build, Taken, SHA-256 |
| F17, F18 | File (its name), Build, Taken, SHA-256 |
| F19 | From (64 or 32 bit), Build, Built, Taken, SHA-256 |
| F20 to F23 | Build, Built, Taken, SHA-256 |

Also pending, in the section's words: which of the reads of finding 8 lies in F1 and which in F4.

## The manifest row's `check`, in a form part f can run

```json
"check": { "name": "celt", "options": ["--high"], "files": ["this"], "lag": 2,
           "compared": 291840, "equal": 291765, "largest": 1, "apart": "the last packet, 1024 samples" }
```

- `name`: the check of `tests/reproduce.mjs` (`celt`, `gain`, `speex` or `inputs`).
- `options`: its options as given on the command line, each value after its option (`["--maxgain", "10"]`).
  The suite holds them to what each check takes: `celt` `--high`, `--any-rate`, `--micdata`; `gain` `--packet N`;
  `speex` `--maxgain 1|10`, `--micdata`; `inputs` `--against`.
- `files`: the check's file arguments in order: `"this"` (the row's own file), `"input"` (the clip the row's
  `input` names, which part f writes with `make-inputs.mjs`), or another row's `name` (a `gain` row names its
  `voice_maxgain 1` partner first). So part f's command is `node tests/reproduce.mjs <name> <files...> <options...>`,
  for example `gain <set-h_..._maxgain-1.wav> <set-h_..._maxgain-10.wav>`.
- `lag`: the samples by which the check lines the file up with what it compares it to, as the record gives it (2
  for the CELT and capture checks, which take the input from its third sample; 0 for `gain`). It is information:
  the checks do not take it as an option.
- `compared`, `equal`, `largest`: the samples compared, those equal, and the largest difference in 16-bit steps.
  These are what part f compares with the script's figure lines. The suite holds a row to at least 999 equal in
  1,000 (section 14), `largest` at most 1 (section 7), and `largest` 0 only with every sample equal.
- `apart`: what the check left out, in words ("the last packet, 512 samples").

Part f will need the three counts from the script's output. Today `celt` prints the one-step and further counts,
`gain` the differing count of the compared, `speex` the equal count and the largest difference, and `inputs
--against` the equal count: each check prints "compared" and one of "equal" or "differ", and part f derives the
other.

## Section 8's words, for part e

The orchestrator applies these in part e's commit that adds the manifest's rows. Where the order's section 8 already
gives the text it is copied as it stands (section 14 asked for "files under `tests/recordings/files/`, each listed
in the manifest" in place of the release's assets; section 8 was edited in place to say so). Where section 8 gives
only what a line becomes, the sentence below is a draft. The nine files and "Sets H, I, M and O" are as section 14
has them; if part e publishes fewer, the count changes.

**`CLAUDE.md`, the sentence under "Commands".** Replace "Nothing from it is ever copied here." and the sentence's
start with:

> `tests/accuracy.mjs` and `tests/retiming.mjs` need the owner's recordings, which are not in this repository:
> they are in a private one a session can attach (`docs/PROGRESS.json`, `takes`, says how to point the tests at
> it). Nothing from it is copied here but the files that `tests/recordings/manifest.json` lists, which the
> orchestrator added under `tests/recordings/files/` as the hard rule below says.

**`CLAUDE.md`, the opening hard rule.** Replace it with:

> - Never commit the owner's recordings, demos, packet dumps, console logs, speech or music, and never publish
>   them anywhere else. Public are the synthetic signals and fixtures made by the tests, and the nine recordings
>   under `tests/recordings/files/` that `tests/recordings/manifest.json` lists: files the game wrote with
>   `voice_recordtofile` from a clip that `tests/recordings/make-inputs.mjs` makes, each shown by the check named
>   in its row to be what this repository's code makes of that clip, and each with its header read by the
>   orchestrator before it went in. No other file joins them except by a new decision of the owner's and an
>   order that names the file and its check; a doubt about a file leaves it out. [The recordings hold the owner's
>   voice, copyrighted music, SteamIDs and the game's own sound. On 2026-11-12 the owner left the game's
>   recordings of the project's synthetic signals to the orchestrator ("Do what you think is best"), who added
>   the files on that list and nothing else. Publishing cannot be undone.]

**`tests/REFERENCE_2026.md`, the head.** Below the paragraph "No recording, source music or derived audio is
distributed with this project. ..." (left as it stands), add:

> *Corrected by RP-01 (<date of part e>): the game's recordings of Sets H, I, M and O that
> [`recordings/manifest.json`](recordings/manifest.json) lists are published too, under
> [`recordings/files/`](recordings/), each the game's file byte for byte. They were made from the two clips that
> [`recordings/make-inputs.mjs`](recordings/make-inputs.mjs) makes, and hold no voice and no music. The other
> recordings, logs and demos stay private.*

**The same, Sets M and O.** After "The recordings are private; only numbers are here." in each set's paragraph, add:

> *Corrected by RP-01 (<date>): <the manifest's names for that set> are published (`tests/recordings/files/`).*

**The same, Sets H and I.** Under each set's table or paragraph, add:

> Published: <the manifest's names for that set>; their SHA-256s are in `tests/recordings/manifest.json`.

**`docs/ACCURACY.md`, its opening.** "and the recordings are private: only numbers from them are here." becomes:

> and the recordings are private, but for the game's recordings of Sets H, I, M and O that
> `tests/recordings/manifest.json` lists, which the checks of [REPRODUCE.md](REPRODUCE.md) run on: only numbers
> from the others are here.

**`docs/FINDINGS.md`, "How to read it".** "The recordings are private, and only numbers from them are given."
becomes:

> The recordings are private, and only numbers from them are given, but for the game's recordings of Sets H, I, M
> and O that `tests/recordings/manifest.json` lists; [REPRODUCE.md](REPRODUCE.md) says how to check them.

**`README.md`, "Tests".** "The owner's recordings are private, so the checks that need them are run privately and
reported as numbers." becomes:

> The owner's recordings are private, so the checks that need them are run privately and reported as numbers. The
> exceptions are the game's recordings of the file-input sets that `tests/recordings/manifest.json` lists: they are
> in the repository, and the suite `reproduce` checks them in CI.

**`tests/README.md`, "Tools that need the owner's recordings".** "These are outside CI. The recordings, demos and
logs they read are not in this repository and never go into it" becomes:

> These are outside CI. The recordings, demos and logs they read are not in this repository and never go into it,
> but for the game's recordings that `recordings/manifest.json` lists, which are under `recordings/files/` and
> whose checks run in CI (the suite `reproduce`)

**`docs/owner-runs.md`, its opening.** "What comes back is private" becomes:

> What comes back is private, but for what an order names in `tests/recordings/manifest.json`

**`docs/PROGRESS.json`, `takes`** (the orchestrator's): add "Published since RP-01e: the files that
`tests/recordings/manifest.json` lists, under `tests/recordings/files/`; the manifest is the list."

## Done means

1. `node tests/run.mjs recordings` passes: `== recordings: passed, 0.8 s`; the suite's last line `recordings: all
   checks passed`.
2. The table check fails on a hash of 63 digits (`F1: the SHA-256 cell is neither 64 lowercase hex digits nor "not
   kept" with the reason in words nor pending`), an empty cell (`F2: the cell "Built" is empty`), a cell holding
   `0x180058d80` (`the section holds what looks like an address (0x180058d80)`), and `pending` under "filled" (`F1:
   the cell "Build, as its owner can read it" says pending under a status line that says the cells are filled`).
   Each is a stand-in of [1], and each was also made in the record itself (the table of breaks).
3. The manifest check fails on a missing field (`the field "pcm_sha256" is missing`), a name with a date (`the name
   holds a date`), an `input.script` that is not a file (`"input.script" is not a file of the repository`), and, by
   the brief's ruling, a `sha256` or `pcm_sha256` that is the record's for the speech take or its source (`"sha256"
   is the record's SHA-256 of a private file, which is never published`). The record holds such hashes (Provenance,
   Sets A to F), so that break is in.
4. `inspect.mjs` names `LIST (INFO), bext` in a WAV the suite makes and says "no"; on a clean file it says "yes". A
   FLAC file is "not a WAV file".
4a. The folder check fails on a file with no row, a row with no file, a file whose SHA-256 is not its row's, and a
   row whose `sets` holds `J` (each message in [3] above). `node tests/run.mjs miles` passes (`miles  units  passed
   10.3`).
5. `git diff origin/main -- tests/REFERENCE_2026.md` shows added lines and the one changed table: the only lines it
   removes are the eleven lines of the table "What was read", each added again with its column "Files".

All parts: `node tests/run.mjs site harness` passes; `node tests/cache-number.mjs origin/main --report` prints
`cache number against origin/main (26c31dc): no cached file changed; the number stays v39`.

## What I read differently, and what is uncertain

- **F12's build cell is filled**, with "11191711, the build the game reported in Set O": the record gives that
  build for TF2's 32-bit game (277) and `docs/FINDINGS.md` gives it for this file (27). Whether that is the
  `version` line the column asks for, and whether F11, F13 and F14 (the same folder, seen the same day) share it, is
  the orchestrator's.
- **F15 and F16's build dates** come from `docs/FINDINGS.md` alone; no report gives them. The reading was the
  orchestrator's own (W3-20a, 166).
- **F14's file names.** Section 6 names `mssvoice.asi` and `Mss32.dll`; nothing else in the repository does, so the
  cell says the names are pending. F14 is one row for those files, as section 6 has it; one row a file would split
  it, and its ids are the orchestrator's to give.
- **F3's bitness** is given (32-bit, W3-08 72), where section 6 called it not stated. Which game is still pending.
- **A file section 6 does not list:** W3-20a (177) reports, from the orchestrator's investigation, a read of "SDK
  Base 2013's 32-bit engine". It has no row; the orchestrator may give it F24.
- **"Built" and "Taken" where no report gives a date** say `pending`, and the check takes a date or "none" with a
  reason once filled (a text file has no link date).
- **Finding 8** is under F1 only, as section 6 has it; the BC plan names F4 too for its addresses, and the section
  says which read lies in which file is pending.
- **"Report" names the order W3-17** for F21's CRC-32 (`docs/work-orders/W3-17-room-effects.md` 148); the suite
  checks the name against `docs/reports/`, where W3-17's second reads are.
- **The table's cell limit** is 100 characters, a choice: the longest hash cell is 66, the longest cell today 79.
- **The Read-for cells** are section 6's. They were set beside the reports each finding cites in the record and
  agree; that is not a reading of each finding's text line by line.
- **The never-published hashes** are found by position in the record (Provenance before "The file-input runs"). A
  hash added to Sets G to O's entries later would not be seen unless it is put there.
- **No manifest field was added.** `private_sha256` stays out, as the brief rules; the suite fails a row that has
  one.

## Runs

- `node tests/run.mjs recordings site harness miles`: every suite passed.
- `pnpm test` under the heavy lock, on `66411ed`: exit 0, every suite passed, 899.2 s summed; `recordings` 0.7 s,
  `reproduce` 12.1 s, `miles` 10.5 s.
- `pnpm test:browser` with `CHROMIUM_EXECUTABLE`, under the heavy lock: exit 0, "browser  browser  passed  238.8".
- CI: run 43362361482 on `66411ed` (the code, the record and the merge of `main`): `verify` success, all five groups
  success. In `units`: `== recordings: passed, 0.6 s`, with the skip line for the pending cells, the line "no
  recording is published yet", and the three `git check-ignore` checks run (not skipped). The commits after it (this
  report, a merge of `main` that changed only `docs/`) start no run on a push; a run on the head is started by hand,
  and the hand-back gives its result.
- The branch's diff and its commit messages were scanned for recordings, personal details, real SteamIDs, paths and
  model names: none but the trailer lines.
