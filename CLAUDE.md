# TF2 Voice Emulator

A static, client-side web app, served from GitHub Pages, that makes audio, video or a TF2 demo's voice sound as it
does through Team Fortress 2 voice chat. It is a measured model of the real chain, not an effect: README.md describes
it for users, and `tests/REFERENCE_2026.md` holds the evidence behind every constant.

## Start here

- `docs/PROGRESS.json`: where things stand, what is in flight and next, the questions waiting on the owner, the
  deferred findings and the rules that were retired. Read it first; update it when an order, a decision or a dead end
  lands.
- `docs/PIPELINE.md`: how work is run (roles, an order's path from brief to merge, the gates). Read it before starting
  agents.
- `docs/work-orders/`: one file per job. `docs/reports/`: each merged order's report.
- `tests/REFERENCE_2026.md`: the recordings, the findings and what remains unverified.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm test                 # the Node suites, about a minute
pnpm test:vendor          # the bundled codec builds match their recorded hashes
CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) node tests/browser.verify.js
pnpm dev                  # the app on a local server
```

`pnpm test:all` is what CI runs (vendor check, Node suites, browser suite). The `CHROMIUM_EXECUTABLE` line is for a
machine whose installed Chromium is not the one Playwright pins; elsewhere `pnpm test:browser` is enough.
`tests/accuracy.mjs` and `tests/retiming.mjs` need the owner's recordings, which are not in this repository: they are
in a private one a session can attach (`docs/PROGRESS.json`, `stands.takes`, says how to point the tests at it).
Nothing from it is ever copied here.

There is no build step: the files in the repository are the site.

## Hard rules

Each rule's reason is in brackets, so a rule can be dropped once its reason no longer holds. Say so in PROGRESS's
`retired_rules` when one goes.

- Never commit the owner's recordings, demos, packet dumps, speech or music. Only synthetic signals and fixtures made
  by the tests are public. [They hold the owner's voice, copyrighted music and SteamIDs; the owner has not chosen to
  publish any of them.]
- No personal details: no names, emails, usernames (the repository's own address aside), machine names or paths,
  and no real SteamIDs. Test SteamIDs are in
  universe 0 (`4503603922337793` and up), which no account can have. [The repository is public and its history keeps
  everything; it was rebuilt once to remove them.]
- No names or identifiers of the AI assistant models that build this project in code, docs or commit messages, apart
  from the attribution trailer the session's instructions require on each commit.
- Main is fast-forwarded or merged locally and pushed, never merged with GitHub's button or API. [GitHub signs such a
  merge with the owner's account email.]
- No leaked engine source: public sources and measurements only. [The repository is public under the owner's name,
  and its claims rest on being identified from recordings and public packets.]
- No Valve art, footage or logos. It is a fan project.
- No uploads and no runtime CDN: everything runs in the browser from this folder. [That is the app's promise.]
- Deterministic: the same decoded PCM and settings give the same samples (seeded randomness). [The tests and the
  registered predictions depend on it.]
- The bundled codecs are pinned: a build must match its recorded hash, and changing one is an order of its own.
  [Steam's packets match libopus 1.1.x bit for bit; a different build silently unfits the model.]
- A measured constant changes only with its evidence, written into `tests/REFERENCE_2026.md`. [The model is fitted to
  takes; a tidy-up without a take is a regression nobody can see.]
- `tests/predictions/predictions.json` is never edited. A change to a hashed model file after registration is noted
  in `PREDICTIONS.md`. [Its hash is registered; the takes are scored against it as it stands.]
- Every fix comes with a test that fails without it.

## How work is run

`docs/PIPELINE.md` has the process. In short: size the process to the risk; one builder per order in its own
worktree, then one reviewer who cannot edit and who also tests the tests; a skeptic for a major finding that would
change code; CI on GitHub as the inspection; a plan is reviewed by a different model before its build.
