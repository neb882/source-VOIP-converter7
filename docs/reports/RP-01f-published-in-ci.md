# RP-01f: CI runs the script on the seven published recordings

The builder's report. The order is `docs/work-orders/RP-01-reproduce-it.md`, part f (sections 5, 7, 9, 14 to 17
and 19).

**Status:** built on 2026-11-13, on the branch `claude/rp-01f-published-in-ci`. The run of `tests` on the branch's
code commit `e6ada28` passed (`verify`: success).

## What the suite does now

The suite `reproduce` (`tests/reproduce.verify.mjs`, group `units`) has a section [13] for the game's recordings
that `tests/recordings/manifest.json` lists.

- **Each row's check.** For every row it runs the check the row names, with the row's options and files, on the
  file in `tests/recordings/files/`. The clip a row's input names is written by `tests/recordings/make-inputs.mjs`
  into the suite's temporary folder and found by its SHA-256. Nothing is fetched. The run must end "as expected",
  and the lag, the samples compared, the samples equal and the largest difference it prints must be the row's.
- **The checks it runs.** `celt` on Set H's `vaudio_celt` file; `celt --high` on Set H's `vaudio_celt_high` file;
  `celt --any-rate` on Set I's file with the 11025 Hz clip; `speex` on Set M's and Set O's `voice_maxgain 1` files;
  `speex --maxgain 10` on the shared `voice_maxgain 10` file; `inputs --against` on the captured input.
- **gain on the Speex pair.** No row names `gain`. The suite pairs each `voice_maxgain 1` file with the
  `voice_maxgain 10` file of the same codec and a shared set, which gives Set M's and Set O's `vaudio_speex` files
  each with the shared file. On each pair `gain` must say "as expected" with 0 samples differing before the last
  packet, over the shorter file less one packet of 160 samples.
- **The zero test of section 16.** Every sample of a published file outside what its check compared (before the
  lag, or after the lag plus the samples compared) must be zero. The suite reads the samples itself.
- **The breaks, in the suite.** On a copy of the folder the suite makes in its temporary folder: each file removed,
  one sample of each file moved by three steps, one sample of each file's part apart made 3, and one sample of
  each gain pair's `voice_maxgain 1` file moved by three steps. Each is caught. The repository's files are never
  written.
- **Floors.** A row whose file is missing fails. A manifest with no rows fails. Each row's `used_by` must name the
  suite.

The figures the suite printed, on this machine and on CI alike:

| File | Check | Equal of compared | Lag | Largest | Not compared, all zero |
| --- | --- | --- | --- | --- | --- |
| `set-h_vaudio-celt_maxgain-1.wav` | `celt` | 291,839 of 291,840 | 0 | 1 | 512 |
| `set-h_vaudio-celt-high_maxgain-1.wav` | `celt --high` | 291,765 of 291,840 | 0 | 1 | 1,024 |
| `set-i_vaudio-celt-double-speed_maxgain-1.wav` | `celt --any-rate` | 145,407 of 145,408 | 0 | 1 | 512 |
| `set-m_vaudio-speex_maxgain-1.wav` | `speex` | 145,840 of 145,840 | 80 | 0 | 80 |
| `set-m-o_vaudio-speex_maxgain-10.wav` | `speex --maxgain 10` | 145,966 of 145,966 | 80 | 0 | 114 |
| `set-o_vaudio-speex_maxgain-1.wav` | `speex` | 145,966 of 145,966 | 80 | 0 | 114 |
| `set-m-o_capture_vaudio-speex.wav` | `inputs --against` | 145,964 of 145,964 | 0 | 0 | 2 |

`gain`: 0 of 145,760 samples differ on Set M's pair and 0 of 145,920 on Set O's pair. These are the manifest's
rows and the record's entry "The recordings that are published"; the suite adds no figure of its own.

## What changed, file by file

- `tests/reproduce.verify.mjs`: section [13] and its line in the header comment. The other sections are as they
  were. Section [13] runs before [6] and [7], so its runs are made under the network guard and their output is
  searched for the markers like every other run.
- `tests/recordings/manifest.json`: `used_by` is `["tests/reproduce.verify.mjs"]` in each of the seven rows. No
  other line changed (`git diff` shows the seven `used_by` lines only).
- `docs/REPRODUCE.md`: the opening's "CI does not run the script on the seven files yet (not built yet: order
  RP-01f)" is replaced by what CI runs on them; the section "Without the game" says the suite runs those checks in
  CI, with Set M's `voice_maxgain 1` file as well.
- `tests/README.md`: the suite `reproduce`'s row says what it proves on the published files; the note under "Tools
  that need the owner's recordings" says the suite `reproduce` runs the script on them in CI. The row's time stays
  76 s: the table gives the slowest of three runs, and this order has one.
- `.github/workflows/test.yml`: not changed. The suite is in the `units` group, which CI already runs.

## The breaks by hand

Each on a copy of the repository's tracked files in the builder's scratch folder, with `node tests/run.mjs
reproduce` run in the copy:

| Break | What failed |
| --- | --- |
| `set-o_vaudio-speex_maxgain-1.wav` removed | its row ("no file", the check "cannot check"), its zero test ("no file"), and `gain` on Set O's pair; the suite FAILED, exit 1 |
| sample 100,000 of `set-h_vaudio-celt_maxgain-1.wav` moved by three steps | its row: 291,838 of 291,840 equal, largest 3, `celt: differs`; the suite FAILED, exit 1 |
| the last sample of `set-h_vaudio-celt_maxgain-1.wav` made 3 (in the last packet, which `celt` counts apart and passes) | the zero test, "1 not zero"; the suite FAILED, exit 1 |
| the row of `set-h_vaudio-celt_maxgain-1.wav` given `equal` 291,840 | its row: "equal 291839, the row's 291840" |

## Runs

- `node tests/run.mjs reproduce recordings`: both passed (reproduce 78.6 s on this machine, shared with other
  agents).
- `node tests/run.mjs site harness recordings miles`: all four passed.
- `node tests/cache-number.mjs origin/main --report`: "no cached file changed; the number stays v45".
- CI, run 43513666253 on `e6ada28`: `units`, `engine`, `render`, `stages`, `browser` and `verify` all success.
  The suite `reproduce` took 50.8 s on CI (the runner's table); its section [13] took about 4 s of that (from the
  log's time stamps, 21:47:35.4 to 21:47:39.4).
- The branch's diff and commit messages were scanned for paths, names, addresses, SteamIDs and model names: none
  but the trailer lines.

## Not done

- `pnpm test` and the browser suite were not run on this machine. The `units` group was started under the heavy
  lock and stopped unrun after 11 minutes waiting for another agent's job; CI ran every group on `e6ada28`, all
  green.
- The time of the suite `reproduce` in `tests/README.md` is not changed: one CI run is not the slowest of three.
- The commit of this report changes `docs/` only, so it starts no run of `tests` (the workflow's rule); the run to
  read is the one on `e6ada28`.

## The fix round (2026-11-13)

The order's section 20 lists two items. Each is done here.

- **A wrong codec in a row.** Section [13] built the `gain` pairs from each row's `made_with.codec`. With Set O's
  row naming `vaudio_celt`, `gain` ran on Set M's pair alone, and nothing failed. Section [13] now holds each row's
  codec to its check: `celt` with `vaudio_celt`, `celt --high` with `vaudio_celt_high`, and `speex` with
  `vaudio_speex`. It also requires that every `voice_maxgain 1` file sharing a set with a `voice_maxgain 10` file
  is in a pair, whatever codec its row names.
- **The break.** The reviewer's break was made again on a copy in the builder's scratch folder: Set O's row names
  `vaudio_celt`, and no file was changed. With `node tests/run.mjs reproduce recordings` run in the copy,
  `recordings` passed and `reproduce` failed on two checks. One was "set-o_vaudio-speex_maxgain-1.wav: its row's
  codec, vaudio_celt, is the one speex runs" ("speex runs vaudio_speex"). The other was "every voice_maxgain 1 file
  that shares a set with a voice_maxgain 10 file is paired with it for gain" ("set-o_vaudio-speex_maxgain-1.wav
  (vaudio_celt) has no pair").
- **Where the zero test lives.** Section 16 says the suite `recordings` gains the zero test. It went into
  `reproduce` because part f's row of the files table does not allow `tests/recordings.verify.mjs`. The brief
  also put it in `reproduce`.
- `origin/main` was merged into the branch before the fix (documents only).
