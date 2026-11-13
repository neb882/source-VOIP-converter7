# TF2 Voice Emulator

A static, client-side web app, served from GitHub Pages, that makes audio, video or a TF2 demo's voice sound as it
does through Team Fortress 2 voice chat. It is a model of the real chain, not an effect: most of it is read from the
game's and Steam's own files and checked against the owner's recordings. README.md describes it for users (its
files table is the map of the code), and `tests/REFERENCE_2026.md` holds the evidence behind every constant.

## Start here

- `docs/PROGRESS.json`: where things stand, what is in flight and next, the questions waiting on the owner, the
  deferred findings and the rules that were retired. Read it first; update it when an order, a decision or a dead end
  lands.
- `docs/PIPELINE.md`: how work is run (roles, an order's path from brief to merge, the gates). Read it before starting
  agents.
- `docs/work-orders/`: one file per job, each with a status line under its title. `docs/reports/`: each order's
  report. `docs/README.md` indexes every order with its state.
- `tests/REFERENCE_2026.md`: the recordings, the findings and what remains unverified.
- `tests/README.md`: what each suite proves and how long it runs, the tools that need the owner's recordings, and how
  each bundled codec is rebuilt.
- `engine/`: the sound path's code, one file per stage, loaded in one order by the page, both workers, the offline
  list and the tests (`tests/lib/engine.cjs` holds the order; `tests/harness.verify.mjs` holds the five lists to it).
  `audio.js` loads the codec module and builds `TF2Audio` from them. A new engine file goes into all five lists.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm test                 # every suite but the browser's; a failure does not stop the rest
pnpm test verify steam    # suites or groups by name (node tests/run.mjs with no such name lists them)
CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) pnpm test:browser
pnpm dev                  # the app on a local server
```

`pnpm test:all` is every suite, the browser's last; CI runs the same suites as five jobs side by side
(`.github/workflows/test.yml`), and a push has its result about five minutes later (measured on CI on 2026-11-12).
`pnpm test` whole took 14 min 36 s on a four-core machine shared with other agents (measured on 2026-11-12). Most of
`pnpm test` is `tests/render-stream.verify.mjs`, `tests/stages.verify.mjs` and `tests/steam.verify.js`: run the
suite a change touches on its own first (`pnpm test <name>`). The `CHROMIUM_EXECUTABLE` part is for a machine whose
installed Chromium is not the one Playwright pins; elsewhere `pnpm test:browser` is enough.
`tests/accuracy.mjs` and `tests/retiming.mjs` need the owner's recordings, which are not in this repository: they are
in a private one a session can attach (`docs/PROGRESS.json`, `takes`, says how to point the tests at it).
Nothing from it is copied here but the files that `tests/recordings/manifest.json` lists, which the orchestrator
added under `tests/recordings/files/` as the hard rule below says.

There is no build step: the files in the repository are the site.

## Hard rules

Most rules give their reason in brackets, so a rule can be dropped once its reason no longer holds. Say so in PROGRESS's
`retired_rules` when one goes.

- Never commit the owner's recordings, demos, packet dumps, console logs, speech or music, and never publish them
  anywhere else. Public are the synthetic signals and fixtures made by the tests, and the recordings under
  `tests/recordings/files/` that `tests/recordings/manifest.json` lists: files the game wrote with
  `voice_recordtofile` from a clip that `tests/recordings/make-inputs.mjs` makes, each shown by the check named in
  its row to be what this repository's code makes of that clip, each with every sample its check does not compare
  equal to zero, and each with its header read by the orchestrator before it went in. No other file joins them
  except by a new decision of the owner's and an order that names the file and its check; a doubt about a file
  leaves it out. [The recordings hold the owner's voice, copyrighted music, SteamIDs and the game's own sound. On
  2026-11-12 the owner left the game's recordings of the project's synthetic signals to the orchestrator ("Do what
  you think is best"), and on 2026-11-13 said in their own words "Yes to publishing synthetic clip recordings"; the
  orchestrator added the files on that list and nothing else. Publishing cannot be undone.]
- No personal details: no names, emails, usernames (the repository's own address aside), machine names or paths,
  and no real SteamIDs. Test SteamIDs are in
  universe 0 (`4503603922337793` and up), which no account can have. [The repository is public and its history keeps
  everything; it was rebuilt once to remove them.]
- No names or identifiers of the AI assistant models that build this project in code, docs or commit messages, apart
  from the attribution trailer the session's instructions require on each commit.
- Main is fast-forwarded or merged locally and pushed, never merged with GitHub's button or API. [GitHub signs such a
  merge with the owner's account email.]
- No leaked engine source. Sources are measurements, public documentation, and the game's own shipped files as the
  owner has them (console help, binaries); nothing of those files is copied into a repository, only what was learnt
  from them, with where it was read. [The repository is public under the owner's name. The owner allowed reading
  their own install's files on 2026-11-10; leaked source is someone else's code distributed without permission.]
- Any file of the owner's install (the game's, Steam's, Windows') may be read as data and, since 2026-11-11, run by
  whatever means is useful: a CPU emulator first, Wine or the like where that falls short. Run it with the network cut
  off and away from the repositories' credentials. Output produced by running a module on a signal of our own is a
  measurement and may be published; the module's bytes and instructions may not. [The owner: "game files means any
  file. Also, it doesn't have to be emulator only. Use whatever tools and means that you deem as necessary and
  useful". Running a module gives the game's own output for any input without a recording session; the network and
  credentials precaution is ours.]
- Code a third party has published under an open licence may be vendored even where its author took it from a
  shipped file (2026-11-11: the VR12 codec, `vendor/voxware-vr12`), in a folder of its own with its licence and a
  README of ours saying where it comes from and at which commit. We add nothing from the owner's files to it, and we
  take nothing from it that rests on leaked source: what such a project says about the game is re-established from
  the owner's own files before it is used. [The owner left this to the orchestrator: "I'm leaving it up to your
  discretion". A codec cannot be built without its codebooks, and these were already public; one folder keeps the
  decision reversible by one commit.]
- No Valve art, footage or logos. It is a fan project.
- No uploads and no runtime CDN: everything runs in the browser from this folder. [That is the app's promise.]
- `sw.js` lists every file the site loads, and its number rises in every merge that changes one of them. A test
  derives the list (`tests/site.verify.mjs`); the orchestrator sets the number at the merge and a builder never does.
  [The offline copy is part of the app's promise: a file missing from the list is a page that breaks offline, and a
  number that does not rise leaves old and new files mixed in a visitor's cache.]
- Deterministic: the same decoded PCM and settings give the same samples (seeded randomness). [The tests and the
  registered predictions depend on it.]
- The bundled codecs are pinned: a build must match its recorded hash, and changing one is an order of its own.
  [Steam's packets match libopus 1.1.x bit for bit; a different build silently unfits the model.]
- A measured constant changes only with its evidence, written into `tests/REFERENCE_2026.md`. [The model rests on
  takes and on reads of the game's files; a tidy-up without either is a regression nobody can see.]
- `tests/predictions/predictions.json` is never edited. A change to a hashed model file after registration is noted
  in `PREDICTIONS.md`. [Its hash is registered; the takes are scored against it as it stands.]
- Every fix comes with a test that fails without it.

## Writing the documents

These bind every document, report and order.

- Plain words. Say what a thing does to the sound. One statement a sentence.
- Every figure carries its standing in one word where it first appears: read (from the game's or Steam's files),
  measured (in the owner's recordings), inferred, guessed, or not built yet.
- A codec that was never in TF2 (`steam_48`, `miles`) is named as not in TF2 wherever it is named.
- No finding is called new, unknown or the first (agreed with the owner, 2026-11-12). Say what was read and what was measured.
- No count of checks (they move with every order). No release or version number but the site's cache number where a
  version is meant.
- Nothing that is not built is promised without "not built yet".
- A figure's evidence lives in `tests/REFERENCE_2026.md` only; other documents state the figure and point to the
  finding by number. A corrected statement there is marked where it stands, not deleted.
- No em-dash chains and no arrows in prose. Tables for facts with columns, lists for lists, sentences for the rest.
- Headings that say what the section is.
- The hard rules above bind every word: from the owner's files and recordings only numbers.

## How work is run

`docs/PIPELINE.md` has the process. In short: size the process to the risk; one builder per order in its own
worktree, then one reviewer who cannot edit and who also tests the tests; a skeptic for a major finding that would
change code; CI on GitHub as the inspection; a plan is reviewed by a different model before its build.
