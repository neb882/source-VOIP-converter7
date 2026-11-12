# S3-01: the test harness: one loader, a runner, a derived cache list, CI in parallel jobs

Status: planned 2026-11-12, not built

*Written 2026-11-12 from the structure audit of the same day (its items C-10 to C-19 and its proposals P1 to P4
and P10; "the audit" below), checked against `main` at `9e0abd0` and against the branch `claude/w4-01b-speed` at
`c74d976`. No file the site ships changes its behaviour, no recorded hash or value moves, and no check is
removed or weakened by any part of this order.*

| Part | What | Files it touches | Starts after | Budget |
| --- | --- | --- | --- | --- |
| **S3-01a** | the engine loaded in each suite's own realm from one helper that holds the one list of its files; `tests/verify.js`'s three steam sections in a file of their own | `tests/lib/` (new), eleven suites and tools under `tests/`, `package.json` (the `test` line), `tests/README.md`, `CLAUDE.md` (one figure) | **W4-01b merged** | 6 hours |
| **S3-01b** | a runner in place of the `&&` chain; a static check that derives the cache list; the cache number set at the merge; CI in five jobs with one result; `package.json`'s small things | `tests/run.mjs`, `tests/site.verify.mjs`, `tests/lib/site-files.cjs`, `tests/cache-number.mjs` (all new), `tests/browser.verify.js` (two lists), `package.json`, `.github/workflows/test.yml`, `CLAUDE.md`, `docs/PIPELINE.md`, `.claude/agents/tf-builder.md`, `.claude/agents/tf-reviewer.md`, `README.md`, `tests/README.md` | **S3-01a merged** | 6 hours |

**Kind:** tests and process. `tf-builder` (effort high), then `tf-reviewer`. Neither part changes how a render is
computed, so neither needs the second reader of `docs/PIPELINE.md`; part b changes three rules, whose wording is
given in Appendix B for the orchestrator to accept or change before the build.
**Branches:** `claude/s3-01a-engine-loader`, `claude/s3-01b-runner-cache-ci`, each from `main`. **Worktrees:**
given in the brief. **Reports:** `docs/reports/S3-01a-engine-loader.md`, `docs/reports/S3-01b-runner-cache-ci.md`.

**Part a first.** Part b's runner and CI jobs name the file part a makes, and the times part b's CI is sized on
are part a's. Part b touches none of part a's files except `package.json`'s `test` line and the two documents,
so it could be built beside part a; it is written to follow it because the saving is hours and the collision is
certain.

**Commands** (CLAUDE.md has them). A suite is run on its own as `node tests/<file>`; on a shared machine every
suite run goes through the lock, `flock /tmp/tf2ve-heavy.lock <command>`. The browser suite needs
`CHROMIUM_EXECUTABLE` where the installed Chromium is not the one Playwright pins.

## Rulings of 2026-11-12 (the orchestrator, on the plan's open points)

1. **The licence link that `sw.js` does not list** (`index.html:494`, `vendor/swresample/COPYING.LGPLv2.1`):
   part b carries it as a named allowance ("linked, opened online only") and `sw.js` is not touched for it. The
   order that splits `audio.js` raises the cache number anyway and adds the file to the list then.
2. **Appendix B is accepted** with two changes. Where it gives a time for CI ("about five minutes after the
   push") the builder writes the time measured on the first runs of the five jobs, not the expected one. And
   `CLAUDE.md`'s commands block and `docs/PIPELINE.md` step 5 changed on 2026-11-12 with the documentation pass
   (the suite's length as measured, CI's limit of 45 minutes): the builder reads both again on the build's
   `main` and fits the appendix's sentences to the text that is there, keeping the appendix's meaning.
3. **Part b's builder edits the rule files** (`CLAUDE.md`, `docs/PIPELINE.md`, the two agent files) with
   Appendix B's text; the reviewer compares each rule before and after, and no existing hard rule may come out
   weaker.
4. **CI checks the number on `main`** (in `units`, against the commit `main` was at before the push): yes.
5. **Five jobs**, and each job gets its own time limit of 20 minutes in place of the workflow's 45 (set on
   2026-11-12 as a stopgap after a run was cut at 30 with every check so far passed).
6. **Part a, then part b.**
7. **Unbuilt orders that say "`CACHE` up by one"**: that line is void from the day part b merges, and each
   brief says so.
8. **`tests/README.md`, `docs/README.md` and the new `README.md`** are on `main` since the documentation pass
   merged (2026-11-12): both parts update `tests/README.md` (the suites, the commands, the times) and the
   README's section "Tests"; part b adds this order's row to the index in `docs/README.md` if it is not there.

## Why

The next order after this one splits `audio.js` into eight files by stage, and every order after that tests
against those files. Today that split would have to be made in eleven test files, two worker lists, a script
list and three hand-kept cache lists, and `pnpm test` takes 16 minutes on this machine (19 with W4-01b's new
suite), of which nearly six are one way of loading the engine and nothing the checks need. Four things are
wrong, each small:

1. **The slowest suite is slow for a reason that has nothing to do with what it tests.** `tests/verify.js` runs
   the engine inside a `vm` context. Loaded in the suite's own realm the same checks print the same output,
   byte for byte, in 142.4 s instead of 464.5 s (measured, below). The cause is taken to be that every use of
   a global (`Math`, a typed array's constructor) goes through the sandbox object there; that is inferred from
   which functions slow down most, not shown.
2. **Eleven files each hold their own list of the engine's files** (ten on `main`, one more in W4-01b), in two
   forms, with three different sets of files. A file added to the engine is added eleven times or a
   suite silently tests an engine the page does not load.
3. **`pnpm test` stops at the first failing suite** (`package.json:8`, nineteen commands joined by `&&`; twenty
   with W4-01b), so a change that breaks three suites shows one, and CI runs everything in one job: 15.7
   minutes on `main` today, about 19 with W4-01b.
4. **The list of files the site keeps for offline use is written by hand three times** (`sw.js:17-67`,
   `tests/browser.verify.js:2440-2446` and `:2997-2999`), checked only in the browser suite, and its number is
   raised on every page order's branch, where two branches then conflict on one line.

## What is true today

File and line are `main` at `9e0abd0`. Where W4-01b changes what is described, the item says so; the builder
works on a `main` that has W4-01b and reads the lines again there.

### The eleven loaders

| File | Lines | How | Files it loads | Room module | `TF2_DIR` |
| --- | --- | --- | --- | --- | --- |
| `tests/verify.js` | 23-40 | `vm` context | constants, steam-sender, swresample, audio | handed in (31-32) | yes |
| `tests/reference.compare.mjs` (`audioEngine`, used by `reference.verify.mjs:69`, `demo.verify.mjs:22`, `video.verify.mjs:16`) | 32-41 | `vm` context | the same four | none | no |
| `tests/opus.verify.mjs` | 13-20 | `vm` context | the same four | none | no |
| `tests/speex102.verify.mjs` | 394-395, 420-423 | `vm` context, a watched codec module | the same four | none | no |
| `tests/formats.verify.mjs` | 20-24 | `vm` context | constants, audio | none | no |
| `tests/gain-exact.mjs` | 76-82 | `vm` context | constants, audio | none | yes (32) |
| `tests/gain.verify.mjs` | 18-25 | one function in the suite's realm | the four | none | yes |
| `tests/miles.verify.mjs` | 30-32, 63-66 | one function, a watched codec module | the four | none | no |
| `tests/output-stage.verify.mjs` | 20-26 | one function | the four | none | yes |
| `tests/render-stream.verify.mjs` | 32-34, 68-82 | one function (`engineInThisRealm`, 68), and a `vm` context for two cases (`engineInVm`, 76; the check at 848) | the four | handed in, wrapped (41-63) | yes |
| `tests/stages.verify.mjs` (**W4-01b**) | 37-52 | one function | the four | handed in | yes |

- The page's own order is `index.html:498-503` (constants, steam-sender, swresample, room-presets, room-dsp,
  audio), and `live-worker.js:26` imports exactly those six; `audio-worker.js:6` (line 14 with W4-01b) imports
  them and five more.
- `audio.js` finds its codec module as the global `TF2Opus` each time it needs it (`audio.js:1017-1018`; 1026
  with W4-01b). Two suites swap the module between renders by assigning `sandbox.TF2Opus`:
  `tests/verify.js:224-226, 795-797, 1328-1333, 1342-1354` and `tests/opus.verify.mjs:573-588`.
- The one-function loaders pass `self` as undefined, so `steam-sender.js:382` and
  `vendor/swresample/swresample.js:622` attach `TF2SteamSender` and `TF2Swresample` to Node's own global object,
  and `audio.js:1292-1293` finds them there (seen: `typeof globalThis.TF2SteamSender` is `'object'` after a
  load). The `vm` loaders attach them to the sandbox.
- `tests/stages.verify.mjs:83-87` (W4-01b) reads `tests/render-stream.verify.mjs` as text and runs what lies
  between its comments `/* ---------------- signals ---------------- */` and
  `/* ---------------- helpers ---------------- */` with the names `engine`, `roomModule` and `roomTable`.
  `tests/browser.verify.js:2723-2724` (W4-01b) reads `RENDER_OPTION_NAMES` out of `tests/stages.verify.mjs` by a
  pattern.
- Other uses of `vm` in the suites load one file to see how it attaches itself (`steam-sender.verify.mjs:207`,
  `swresample.verify.mjs:312`, `room-dsp.verify.mjs:157, 193, 963`). They are not engine loads and are not
  touched.

### The times

Each suite once, alone, under the lock, on this plan's copy of `main` at `9e0abd0` (measured for this plan on
2026-11-12; the machine has 4 cores and two other agents; the load average before each run was between 0.8 and
2.0, so a figure is good to about a tenth). CI's column is the `tests` run on the same commit, read from its
log's timestamps (run 43137581505; the test step took 911 s of the job's 941 s, installing the browser 21 s,
everything else 9 s). The last column is the same suite on this plan's scratch copy with the engine loaded
through the helper of part a; a dash means the suite does not load the engine in a `vm` context today.

| Suite | Checks | Here, `main` (s) | CI, `main` (s) | Here, engine in the suite's realm (s) |
| --- | --- | --- | --- | --- |
| `verify.js` | 285 | 464.5 | 352 | 142.4 (as two files: 9.1 and 135.4) |
| `render-stream` | 553 | 286.0 (289.7 on W4-01b) | 239 | - |
| `stages` (**W4-01b**) | 297 | 221.0 | not on `main` | - |
| `voice-channel` | 141 | 60.1 | 62 | - |
| `reference` | 43 | 34.5 | 28.6 | 18.4 |
| `meter` | 50 | 17.6 | 15.7 | - |
| `miles` | 73 | 11.5 | 9.7 | - |
| `steam-sender` | 109 | 11.1 | 11.1 | - |
| `room-dsp` | 215 | 11.0 | 9.5 | - |
| `speex102` | 86 | 9.8 | 7.7 | 4.2 |
| `gain` | 103 | 8.5 | 7.6 | - |
| `output-stage` | 103 | 8.1 | 7.2 | - |
| `opus` | 149 | 7.7 | 6.3 with `gain-exact` | 5.2 |
| `swresample` | 43 | 4.3 | 3.8 | - |
| `demo` | 36 | 1.7 | 1.4 | 1.3 |
| `vr12` | 31 | 0.8 | 0.7 | - |
| `gain-exact --synthetic` | one line | 0.7 | with `opus` | 0.3 |
| `formats` | 68 | 0.6 | 0.5 | 0.6 |
| `video` | 46 | 0.4 | 0.4 | 0.5 |
| `filerate` | 53 | 0.1 | 0.1 | - |
| `vendor-opus --check` | hashes | 0.0 | under 1 | - |
| **The Node suites together** | | **939** (1,160 with `stages`) | 763 | **594** (815 with `stages`) |
| `browser` | 374 on `main`, 401 on W4-01b | 162.3 on `main` (the audit's run); 202.1 on W4-01b (this plan's) | 147.4 | not changed by this order |

`pnpm test` on this machine is therefore about 16 minutes on `main` today, 19 once W4-01b is in, and about 14
after part a; the engine's own two suites, which are what a builder of an audio order runs first, go from 7.7
minutes to 2.4. CI ran the same suites in about four fifths of this machine's time (0.76 for `verify.js`, 0.83
for `reference` and `render-stream`, 0.89 for `gain`).

### The chain and CI

- `package.json:8`: `test` is nineteen `node tests/...` commands joined by `&&` (W4-01b adds
  `node tests/stages.verify.mjs` after `render-stream`). `test:all` (`package.json:16`) is
  `pnpm test:vendor && pnpm test && pnpm test:browser`.
- `.github/workflows/test.yml` (as changed on 2026-11-12): on push, `docs/**` ignored, a newer push to the same
  branch cancels the older run; one job, `verify`, 30 minutes allowed, one test step, `pnpm test:all`.
- `main` is not a protected branch and no status check is required on it (read from GitHub's API on
  2026-11-12). The head of `main` carries the check run `verify` and the three of the Pages deploy.
- Checks whose detail holds a time: `render-stream.verify.mjs:1021` (each chunked render's seconds),
  `room-dsp.verify.mjs:977-982`, `video.verify.mjs:131-133`, `meter.verify.mjs:505-530`. Checks that pass or
  fail on a time: `room-dsp.verify.mjs:982` (under 2,000 ns a sample), `video.verify.mjs:132` (under 1,000 ms),
  `meter.verify.mjs:500-505` (each memory run in a child process within 240 s). The browser suite times a live
  microphone chain (`docs/PIPELINE.md`, "Long runs").

### The cache list and its number

- `sw.js:17-67`: `ASSETS`, `'./'` and 49 files, 2,490,150 bytes (2,521,515 with W4-01b). `sw.js:16`: the
  number, v34 (v35 with W4-01b).
- `tests/browser.verify.js:2440-2446`: `RUNTIME_FILES`, 17 files written by hand, used by `[Browser 4b]`
  (2453-2491): the files the page needs are its own tags (read from the DOM), the manifest's icons and that list;
  `sw.js` must list exactly those and each must be in the cache after a first visit.
- `tests/browser.verify.js:2997-2999`: a third list, 20 files, checked to be in the cache in the service-worker
  section.
- Every way a shipped file loads another today (found by search; the prototype of this plan's check finds all 49
  listed files from them and nothing else): `<script src>` and `<link rel="icon|manifest|stylesheet">` in
  `index.html:9-11, 498-523`; the manifest's `icons`; `importScripts('...')` (`audio-worker.js:6`,
  `live-worker.js:26`); `new Worker('...')` (`app/render.js:26`, twice with W4-01b; `live.js:214`);
  `audioWorklet.addModule('...')` (`app/source.js:151`, `live.js:209`); `import('./...')` (`audio.js:1020`,
  `formats.js:50`, `video.js:363`, `opus-codec.mjs:10-17`); `import(new URL('...', document.baseURI).href)`
  (`app/source.js:352-353`); static `import ... from` in the vendor modules;
  `navigator.serviceWorker.register('sw.js')` (`index.html:527`).
- Places that set a source from something made on the page (an object URL of a Blob, a canvas): `app/render.js:220,
  300, 304` (two more lines with W4-01b), `app/realtake.js:118`, `app/console.js:234`, `batch.js:354`.
  `filerate.js:216` calls `require('./video.js')` under Node only.
- `vendor/libopus/generated/libopus.generated.mjs` is a generated bundle with its WebAssembly inside it; its text
  holds `fetch(`, `new URL(` and `import(` forms of its maker's that no static reading can follow.
  `tests/vendor-opus.mjs:10-26` holds it byte for byte to the pinned package.
- `index.html:494` links `vendor/swresample/COPYING.LGPLv2.1`, a file of this folder that `sw.js` does not list:
  offline, the link shows the app again (`sw.js:122`).
- The number: 19 commits touched `sw.js` between 2026-11-01 and `9e0abd0` (21 with merges); 10 of them changed
  the number's line and nothing else (counted from `git log`). The number is what `app/boot.js:58-77` shows in
  the footer, and a changed `sw.js` is what makes a browser install the new worker and refill the cache
  (`sw.js:70-76`).
- The rule that a builder raises the number is in no rule file; each order says it ("`sw.js` `CACHE` up by
  one").

### Small things

- `package.json:5`: the description speaks of "real Opus plus the measured Steam voice gate"; the profile now
  runs Steam's sender as read, three more codecs, and the game's receiver.
- `package.json:3`: `version` is `4.8.0`. `tests/accuracy.mjs:340` writes it into a registration of predictions,
  and `tests/predictions/predictions.json:4` holds it.
- `package.json:11, 12, 15`: build scripts for libopus 1.1.5, LAME and CELT; none for `tests/speex102/build.mjs` and
  `tests/vr12/build.mjs`.
- `CLAUDE.md:21`: "`pnpm test` # the Node suites, about a minute".
- `tests/README.md` is not on `main`. The documentation pass adds it on `claude/docs-w2-guides` (a table of the
  suites with their times, the commands, "Rebuilding the bundled codecs", "Heavy jobs"), changes
  `CLAUDE.md`'s command block there, and rewrites `README.md` on `claude/docs-w1-readme-findings` (its test
  section is lines 136-144 there). The steps below name those parts. If a part of this order is built before
  those branches merge, its builder changes what is on `main` then (`CLAUDE.md`, `README.md`) and puts the
  text meant for `tests/README.md` into the report under its own heading, for the documentation pass to take;
  it does not create the file.

## What the audit had wrong, or left out

- **C-16:** "`version` 4.8.0 appears nowhere else". It is read at `tests/accuracy.mjs:340` and recorded at
  `tests/predictions/predictions.json:4`. So it is not removed here (Decision 14).
- **C-18:** the cache list is hand-kept in three places in the suites' reach, not two: the audit missed
  `tests/browser.verify.js:2997-2999`.
- **C-12:** right in kind; its "about 20 times" is one function's figure, not the suite's. The audit's own
  small benchmark, run again for this plan: `receiverAutoGain` on 20 s takes 208 to 214 ms in a `vm` context
  and 8 to 15 ms outside it (about 20 times); `resampleSinc` 123 to 133 ms against 51 to 67 ms (about twice).
  The suite as a whole is 3.3 times faster outside (464.5 s to 142.4 s). The audit's 451 s for the suite and
  876 s for `pnpm test` were one run each; this plan's 464.5 s and 939 s are one run each too.
- **Section 4:** "about 154 of its 285 checks" are in the three steam sections: 151 are ([5c] 30, [5d] 30,
  [10b] for `steam` 91; counted from the output of this plan's split copy).
- **C-10** is right for `main` (ten files); W4-01b adds an eleventh.
- **C-14** calls `tests/verify.js` [3] and [4] weak. They are loose, and they are also the only checks in CI
  that hold the model to figures taken from the recordings (Appendix A says what each would cost).
- Not in the audit: the licence link of `index.html:494` that the offline copy cannot open; the suites' own
  time-bound checks, which decide whether suites may run side by side; that `main` has no required check, so
  the "one result" is a habit of reading, not a setting.

## What was measured for this plan

All on this machine under the lock, on copies under the plan's scratch folder; none of it is committed.

- **`tests/verify.js`, the engine in a `vm` context (as on `main`):** 464.5 s, 285 passed. **Through the
  helper, in the suite's realm:** 142.4 s, 285 passed. The two outputs are the same byte for byte (321 lines,
  every detail in brackets included; `diff` prints nothing), and both are the same as the audit's saved output
  of the suite at `8035cfa`. No figure moved.
- **The other five `vm` loaders, each suite before and after** (`reference`, `demo` and `video` share one
  loader): `reference` 34.5 s to 18.4 s, `opus` 7.7 to 5.2,
  `speex102` 9.8 to 4.2, `demo` 1.7 to 1.3, `formats` 0.6 to 0.6, `video` 0.4 to 0.5, `gain-exact --synthetic`
  0.7 to 0.3. Each one's whole output is the same byte for byte before and after.
- **The split:** `tests/verify.js` without the three sections 9.1 s, 134 passed; the three sections in their
  own file 135.4 s, 151 passed; the check lines of the two, sorted together, are the check lines of the
  unsplit suite (`diff` prints nothing). The text was moved by a script, unedited.
- **The five one-function loaders** were not converted in the scratch copy: they load the engine the helper's
  way already, so no time is to be gained there, only the list.
- **Three suites at a time** (a prototype of the runner with `--jobs 3`, all twenty Node suites of the
  converted copy, the machine otherwise quiet at a load of 1.1): 20 of 20 passed, 617.7 s summed, 321.5 s of
  wall time. `render-stream` alone was 290.4 s of it.
- **On W4-01b's branch** (`c74d976`): `stages` 221.0 s (297 passed), `render-stream` 289.7 s (553 passed, as
  on `main`), the browser suite 202.1 s (401 passed).
- **The cache check's prototype** on `main` and on W4-01b's branch: 49 files derived, the 49 that `sw.js`
  lists, in 51 to 59 ms; the lines it could not place were the seven (nine with W4-01b) named above and the
  licence link, and nothing else.
- **Tried, small:** a `.cjs` file's exports imported by name from an `.mjs` file; `pnpm test verify gain`
  hands the runner `verify gain`, and `pnpm test -- verify` hands it `-- verify` (pnpm 10.13.1); an engine
  file given `Buffer.from('a')` loads with Node's globals in reach and throws with them hidden.
- **Not measured:** CI in separate jobs (the expected times in part b are this table's, scaled); the suites
  side by side on a busy machine; `pnpm test` whole (the brief for this plan ruled it out; the totals are sums
  of the single runs).

## Decisions

Each with the alternative and why not.

1. **The engine is loaded as one function in the suite's realm**, as `tests/render-stream.verify.mjs:68-74`
   does: the files' text joined, as the body of a `new Function` whose parameters stand for the globals the
   page would give. *Not `vm.runInThisContext`:* the top-level `const`s of `constants.js` would become the
   process's own, so a suite could load one engine only (`render-stream` loads two, `speex102` seven, `miles`
   nine), and `setTimeout` would be the real one, which makes every yield of a render a real timer. *Not a `vm` context with
   `Math` and the typed arrays handed in:* that is what `tests/verify.js` has, and it is the slow case.
2. **The codec module is a variable of that function which the helper can set**, so `engine.codec = m` is what
   `sandbox.TF2Opus = m` was: the engine sees the new module at its next `loadOpusModule()`, and a render or a
   chain already running keeps the one it took. *Not a forwarding object:* a chain made under a swapped module
   would start calling the real one the moment the test swapped back, which is not what the `vm` suites do
   today. *Not one global of the process:* `speex102` and `miles` hold several engines at once, each with its
   own watched module.
3. **`steam-sender.js` and the resampler keep attaching themselves to Node's global object**, as in the five
   one-function loaders today. *Not handed in by name:* the split's files will find one another by global name
   exactly as these two are found, and one mechanism for all of them is the point. The helper's comment says
   so; a suite that needs a wrapped copy of one of them is given the hook then, not now.
4. **The list is written out in the helper and checked against the page**, not read out of `index.html`. A
   written list can be read; the check (`tests/harness.verify.mjs`) fails when the page, either worker or the
   helper disagree, in order, so the split changes the helper's list and is told at once where else.
5. **The helper is CommonJS** (`tests/lib/engine.cjs`): `tests/verify.js` and the new steam file load the
   engine at their top, synchronously, and an ES module imports a `.cjs` file's names directly (tried).
6. **`check()` is not shared.** The suites have four behaviours under that name (count and go on; throw at the
   first failure; collect names; the browser suite's arguments the other way round) and two line formats;
   making them one would change what a failing suite prints and when it stops, which is a change to every
   suite for no saving. The tone, rms and buffer helpers stay too, except the six that `tests/verify.js` and
   the file split from it would otherwise both hold. Several suites say they keep their own arithmetic on
   purpose ("written here apart from the module").
7. **Each suite keeps its present answer to `TF2_DIR`** (the table above). Making all of them follow it would
   let a reviewer break `audio.js` in a copy and run any suite on it; it would also load `audio.js` from the
   copy and `opus-codec.mjs` from the repository in the suites that import the codec by a fixed path. That is a
   later decision, named in "Not in this order".
8. **The steam sections go to `tests/steam.verify.js`, a CommonJS file, with their printed section labels
   unchanged** (`[5c]`, `[5d]`, `[10b]`). The moved text then needs no edit at all, and reports that cite
   "`verify.js` [5c]" still find the label. *Not `.mjs`:* the sections call `require` in four places.
9. **The runner runs one suite at a time unless told otherwise**, and never anything beside the browser suite.
   Measured: all twenty Node suites three at a time passed in 321.5 s of wall time against 594 s one after
   another, so the gain is under a half and is bounded by `render-stream`, which alone takes 290 s. Against
   it: the machine is shared and the lock admits one heavy job, which three suites at once are; three suites
   hold a check that passes or fails on a time (above), and the run that passed was made on a quiet machine;
   and after part a a builder's usual run is one suite or one group by name, where there is nothing to run
   beside. So `--jobs N` exists, its default is 1, and the documents call a run with `--jobs` a heavy job. The
   browser suite times a live microphone chain against the clock (`docs/PIPELINE.md`, "Long runs": "two at
   once on four cores make it flaky"), so nothing runs beside it at any setting. CI gets its speed from
   separate machines instead (Decision 13).
10. **The runner's groups are CI's jobs**: `units` (every Node suite not named next, the vendor check and
    the two static checks), `engine` (`verify.js`, `steam.verify.js`), `render` (`render-stream`), `stages`
    (`stages`), `browser`. A static check holds the workflow's list of groups to the runner's, so a suite
    cannot be in the runner and in no job. *Not `render-stream` and `stages` in one job:* together they are
    about 7 minutes on CI, alone the longer is about 4, and the run is as long as its longest job. *Not
    `stages` with `engine`:* about 5 minutes, longer than `render`.
11. **The cache check reads text, by rule, and fails on anything it cannot place.** Each loading form it knows
    is listed in step b2; after taking those out, any line of a shipped file that still holds a word that loads
    something is a failure unless the check's own short list names that line and says why. *Not a looser
    scan:* a form the check skips is a file the offline copy may lack with nothing red. *Not a headless
    browser's request log alone:* it sees only the paths a test walks; it is added to `[Browser 4b]` as the
    second half, not used as the first.
12. **The cache number is set by the orchestrator in the merge; a builder never changes it** (Appendix B).
    *Not derived from the files' content:* a digest in `sw.js` would be a line every order changes, the same
    conflict in a longer form, and the footer's "version 35" is how the owner sees that the live site is the
    new one. *Not left as it is:* 10 of 19 commits to `sw.js` were that one line.
13. **CI: five jobs from one matrix and a sixth, `verify`, that succeeds only if all five did.** The name
    `verify` is today's one check run, so whatever reads a head keeps reading the same name. *Not five results
    to read:* the rule is one thing on a head.
14. **`version` stays `4.8.0`.** It is in the registered predictions; removing it changes what the next
    registration writes, and tying it to the cache number makes a second number to raise.
15. **The description becomes:** "Plays any sound the way a Team Fortress 2 player's voice reaches another
    player, in the browser: Steam's sender, the game's codecs and its receiver, as read from the game's files and
    checked against recordings." (The README's first paragraph on `main` still says "real Opus" with the gate and
    the gain around it; the documentation pass's README says what this sentence says.)

---

## S3-01a: one loader in the suite's realm; the steam sections in their own file

### What to build

**Step 1: the helper.** `tests/lib/engine.cjs`, exporting:

- `ENGINE_FILES`: `['constants.js', 'steam-sender.js', 'vendor/swresample/swresample.js', 'room-presets.js',
  'room-dsp.js', 'audio.js']`, the page's order. Beside it, which of them are handed to the engine as Node
  modules under a global's name instead of being joined into its text (`room-presets.js` as
  `TF2_ROOM_PRESETS`, `room-dsp.js` as `TF2Room`: the two a suite wraps or withholds), and the names of
  `constants.js`'s top-level tables.
- `loadEngine(options)`, returning `{ audio, codec, CODEC_PROFILES, PRESETS, VOICE_ENGINE, LISTENER_POSITIONS,
  DSP_PRESETS, ... }` (every top-level `const` of `constants.js`, the engine's own objects, not copies).
  - `options.root`: the folder to load from, a path or a `file:` URL; the repository by default.
  - `options.codec`: what the engine sees as `TF2Opus`. `engine.codec` reads it and `engine.codec = m` sets it
    (Decision 2). Unset, the engine sees no `TF2Opus`, as a sandbox without one did.
  - `options.TF2Room`, `options.TF2_ROOM_PRESETS`: what the engine sees under those names. Left out: the modules
    as Node loads them from `root`. `null`: absent, as on a page that did not load them.
  - The function's parameters also stand for `window` (a new object, which receives `TF2Audio`) and for `self`,
    `module` and `setTimeout`, all undefined: no timers, as in every loader today, so a render's yields resolve
    at once.
  - And for Node's own globals (`Buffer`, `global`, `setImmediate`, `clearImmediate`, `require`, `process`),
    all undefined. A `vm` sandbox held only `window`, `Blob` and `console`, so an engine file that came to use
    something a page does not have failed in six suites at once; in the suite's realm it would pass
    unnoticed. Hidden this way it fails at the load (tried: `Buffer.from` put into a copy of `audio.js` loads
    without the hiding and throws with it).
- `engineSource(root)`: the joined text, for the one place that still runs it in a `vm` context
  (`tests/render-stream.verify.mjs:76-82`).
- `sourceRoot()`: `TF2_DIR` as a folder, or the repository; for the suites that follow `TF2_DIR` today.

A comment at its top says: this is the one list; the split adds its files here; `steam-sender.js` and the
resampler attach to Node's global object (Decision 3); two engines in one process share those two and nothing
else.

**Step 2: its own suite.** `tests/harness.verify.mjs`, added to `package.json`'s `test` line in front of
`tests/verify.js`. Static and quick (under a second). It checks:

1. `ENGINE_FILES` is, in order, the first `<script src>` tags of `index.html`, the whole of `live-worker.js`'s
   `importScripts` and the head of `audio-worker.js`'s.
2. The helper's table names are exactly the top-level `const` names of `constants.js`.
3. No file under `tests/` other than `tests/lib/engine.cjs` holds a quoted string that ends in `audio.js` or
   `constants.js` (`'../audio.js'` too), except the places the suite lists with a reason:
   `tests/accuracy.mjs` (`MODEL_FILES`, the hashes a
   prediction is registered with), `tests/room-dsp.verify.mjs:194` (`constants.js` alone, for the rooms'
   names), and itself. This is what keeps the list one list.
4. An engine loaded with a codec and one loaded without are separate: setting one's `codec` leaves the other's.
5. A module set through `engine.codec` is the one the next render calls, and the one before it is called again
   after it is set back (a counting wrapper round `steamRoundTrip`, three short renders).
6. With `TF2Room: null` a render with a room stops with the engine's own message (`audio.js:1070`); with the
   default it renders.
7. After a load, `TF2Audio` and `CODEC_PROFILES` are not globals of the process; `TF2SteamSender` and
   `TF2Swresample` are (the known exception, so a change to it is seen).
8. A copy of the six files in a temporary folder, with `Buffer.from('a')` added at the top level of its
   `audio.js`, does not load (`root` pointed at it); the untouched copy does.

**Step 3: the six `vm` loaders, one commit each, slowest first.** In each, the private loader goes, the helper
comes, and nothing else in the file changes but the names the loader gave:

- `tests/verify.js`: `sandbox.TF2Opus` becomes `engine.codec` (lines 192, 224-226, 795-797, 1135, 1328-1333,
  1342-1354, 1824); `vm.runInContext('CODEC_PROFILES...', sandbox)` becomes `engine.CODEC_PROFILES...` (195,
  1134, 1191, 1855-1856, 2332); `ENGINE` is `engine.VOICE_ENGINE`; `root` is `sourceRoot()`. It keeps its own
  `TF2Room` (line 31), which its checks in [7] and [8] read (2122-2180). The comment at 28-30 and the header's
  "Covers" list (8-14) are rewritten to say what is now true.
- `tests/reference.compare.mjs`: `audioEngine` goes; its own `main` (64-66) and `reference.verify.mjs:69-71`,
  `demo.verify.mjs:22-24` and `video.verify.mjs:16` call `loadEngine` themselves and set `engine.codec`.
- `tests/opus.verify.mjs` (13-20, 573-588), `tests/speex102.verify.mjs` (394-395, 420-423),
  `tests/formats.verify.mjs` (20-24), `tests/gain-exact.mjs` (76-82, with `root: sourceRoot()`).

**Step 4: the five one-function loaders, one commit.** `tests/gain.verify.mjs`, `tests/miles.verify.mjs`,
`tests/output-stage.verify.mjs`, `tests/render-stream.verify.mjs`, `tests/stages.verify.mjs`. Same rule. In
`render-stream.verify.mjs` the wrapped room module (41-63) is handed in as `TF2Room`, `engineInThisRealm(false)`
is `TF2Room: null, TF2_ROOM_PRESETS: null`, and `engineInVm` keeps its `vm` context and takes its text from
`engineSource`. **Nothing between its `signals` and `helpers` comments is edited, and the names `engine`,
`roomModule` and `roomTable` keep their meaning there**: `tests/stages.verify.mjs` runs that text.

**Step 5: the move.** The three steam sections of `tests/verify.js`, from the comment
`/* ---------------- the steam profile (W3-11a) ---------------- */` (line 183) to the end of
`liveSteamSection` (line 1819), go to a new `tests/steam.verify.js`, unedited. Its head is `tests/verify.js`'s
(the helper, `root`, its own `check` with its own counters), its `main` sets the codec, calls `steamSection()`
then `liveSteamSection()`, and prints `N passed, M failed` as `verify.js` does. `tests/verify.js` loses the two
calls (2097, 2371) and keeps everything else in its order. The six helpers both files use (`mkBuffer`, `tone`,
`speechLike`, `rms`, `peakAbs`, `db`: lines 44-53, 78-102, 110 and 172) move, unedited, to `tests/lib/signals.cjs`.
`tests/steam.verify.js` joins `package.json`'s `test` line after `tests/verify.js`. Its head comment says where
the sections came from and that their labels are kept.

**Step 6: the documents.** `tests/README.md` (the suites' table: `verify.js`'s row split in two, the two new
rows, the times as measured in this build; the sentence about the two long suites), `CLAUDE.md:21` (the time
`pnpm test` takes, as measured: "about a minute" is 19 on a `main` with W4-01b and about 14 after this part),
`README.md` only if its test section names a time or `verify.js`'s contents. `docs/PIPELINE.md` is part b's.
Where `tests/README.md` is not on `main` yet, see "Small things" above.

### Checks

A step is done when its proof is in the report. "The check lines" of a command are its lines that begin, after
spaces, with `ok` or `FAIL`, standard error included, sorted, with any time in a detail (a number followed by
` s` or ` ms`) blanked:

```sh
lines() { "$@" 2>&1 | grep -E '^ +(ok|FAIL) ' | sed -E 's/[0-9.]+ (ms|s)\b/T/g' | sort; }
```

- **Before anything else**, on the branch's first commit: the check lines of every suite Step 3 and Step 4 will
  touch, saved, and each suite's time. These are "before".
- **Steps 1 and 2:** `node tests/harness.verify.mjs` passes. Broken on purpose, each of these fails it: two
  entries of `ENGINE_FILES` swapped; a tag removed from a copy of `index.html`; a private
  `fs.readFileSync(... 'audio.js' ...)` put back into one suite; the helper's setter made to do nothing.
- **Steps 3 and 4, per suite:** the check lines after are the check lines before, with no line added, lost or
  changed (`diff` prints nothing), and the suite's count line is the same. The report gives each suite's time
  before and after. This plan's own run of the six `vm` loaders found more than that: each suite's whole output the
  same byte for byte, so for those a plain `diff` of the two outputs is expected to print nothing too, and the
  report says whether it did. A difference is not expected and is a finding, not something to fix (see "Stop
  and ask").
- **Per suite, once:** with a copy of the sources in which `audio.js` is broken in a place the suite covers
  (through `TF2_DIR` where the suite follows it, otherwise in the worktree and put back), the suite fails. The
  report names the break for each.
- **Step 5:** the check lines of `node tests/verify.js` before the move are, as a sorted list, the check lines
  of `node tests/verify.js` and `node tests/steam.verify.js` after it taken together; `diff` prints nothing.
  The counts: 285 before; 134 and 151 after (this plan's split copy; [5c] 30, [5d] 30, [10b] for `steam` 91).
  `git diff --color-moved=dimmed-zebra --stat` on the move's commit
  shows the sections as moved, and `git diff -M` shows no changed line inside them.
- **No recorded value moved:** `git diff origin/main -- tests/render-stream.verify.mjs` shows no change inside
  `GOLDEN` or `GAIN_GOLDEN`; `git diff origin/main --stat -- tests/predictions/ vendor/ '*.js' ':!tests'`
  prints nothing but what this order lists.
- `pnpm test` passes; the browser suite passes (it is not changed by this part; run it once); CI passes on the
  pushed branch.

### Files

May touch: `tests/lib/engine.cjs`, `tests/lib/signals.cjs`, `tests/harness.verify.mjs`, `tests/steam.verify.js`
(new); the loader lines, and the names that depend on them, of `tests/verify.js`, `tests/reference.compare.mjs`,
`tests/reference.verify.mjs`, `tests/demo.verify.mjs`, `tests/video.verify.mjs`, `tests/opus.verify.mjs`,
`tests/speex102.verify.mjs`, `tests/formats.verify.mjs`, `tests/gain-exact.mjs`, `tests/gain.verify.mjs`,
`tests/miles.verify.mjs`, `tests/output-stage.verify.mjs`, `tests/render-stream.verify.mjs`,
`tests/stages.verify.mjs`; `package.json` (the `test` line only: two commands added); `tests/README.md`,
`CLAUDE.md` (line 21), `README.md` (its test section); the report.

May not touch: any file the site ships (`index.html`, `style.css`, every `*.js` and `*.mjs` at the root, `app/`,
`vendor/`, `sw.js`, the manifest); `audio.js` above all; any check's name, condition or detail; `GOLDEN`,
`GAIN_GOLDEN`, the vendor hashes in `tests/vendor-opus.mjs`, `tests/predictions/`; `tests/browser.verify.js`;
`tests/accuracy.mjs`, `tests/retiming.mjs`; `.github/`; `docs/PIPELINE.md`; `docs/PROGRESS.json`.

### Stop and ask

- If a check line differs between before and after in anything but a time. Report the suite, the line both
  ways, and stop that suite's conversion; do not adjust the check.
- If a suite is slower after its conversion than before by more than a tenth and by more than a second.
- If a section of Step 5 cannot move without an edit inside it.
- If W4-01b is not on `main` when the build starts, or `tests/stages.verify.mjs` no longer reads
  `render-stream.verify.mjs` the way described above.

Needs no approval: merging `main` in; re-running a suite that another job on the machine disturbed; choosing the
break that shows a suite still tests the engine.

---

## S3-01b: the runner, the cache list and its number, CI in five jobs

### What to build

**Step 1: the runner.** `tests/run.mjs`. It holds the one table of suites (exported, so the checks below read
it): for each, a name, its command, its group.

| Group | Suites, in this order |
| --- | --- |
| `units` | `harness`, `site`, `vendor` (`tests/vendor-opus.mjs --check`), `gain`, `gain-exact` (`--synthetic`), `opus`, `speex102`, `vr12`, `miles`, `reference`, `formats`, `filerate`, `meter`, `video`, `demo`, `output-stage`, `voice-channel`, `steam-sender`, `swresample`, `room-dsp` |
| `engine` | `verify`, `steam` |
| `render` | `render-stream` |
| `stages` | `stages` |
| `browser` | `browser` |

A name that is both a group's and a suite's (`stages`, `browser`) means the same suites either way.

- `node tests/run.mjs` runs every group but `browser`; `node tests/run.mjs all` runs everything, the browser
  suite last; `node tests/run.mjs <name or group> ...` runs those. An unknown name is an error (exit 2) that
  lists the names, not an empty run. A lone `--` among the arguments is ignored (`pnpm test -- verify` passes
  one; `pnpm test verify` does not: tried with pnpm 10.13.1).
- It runs every suite it was asked for whatever the earlier ones did, each as its own Node process with the
  runner's environment (`TF2_DIR`, `CHROMIUM_EXECUTABLE`).
- One at a time, a suite's output goes straight through, as now. With `--jobs N` (Node suites only; the browser
  suite always runs alone, after the others) each suite's output is held and printed whole when it ends.
- After each suite, one line: its name, passed or FAILED (with the exit code or signal), its seconds. At the
  end: the table of all of them; for each failed suite, its `FAIL` lines and its last 15 lines again; the sum
  of the times and the wall time. Exit 1 if any suite failed, else 0.
- `package.json`: `test` is `node tests/run.mjs`, `test:all` is `node tests/run.mjs all`, `test:browser` is
  `node tests/run.mjs browser`, `test:vendor` is `node tests/run.mjs vendor`. So `pnpm test` now includes the
  vendor check (a tenth of a second) and the two static checks, and `pnpm test verify steam` runs two suites.

**Step 2: the files the site needs.** `tests/lib/site-files.cjs` gives `siteFiles(root)`: the list, and every
problem it met. `tests/site.verify.mjs` (suite `site`) fails on any problem and on any difference from
`sw.js`'s `ASSETS`. The rules, each of which the prototype of this plan ran on `main` and on W4-01b's branch
(49 files derived, 49 listed, in 51 ms):

- **Start:** `index.html`. Every `<script>` has a `src` (a file, read as a script; `type="module"` as a module)
  or is inline (read as a script of the page). Every `<link>` has `rel` `icon`, `manifest` or `stylesheet` (a
  file); any other `rel` is a problem. An `<a href>` to another site is nothing; an `<a href>` into the folder
  is a file. `src`, `srcset`, `href`, `poster`, `data` on any other element is a problem.
- **A stylesheet:** every `url(...)` is a file; `@import` is a problem. **The manifest:** `icons[].src` are
  files; a key the check does not know is a problem.
- **A script or module**, comments taken out first:
  - `importScripts('a', ...)`: each a file, against the worker's own address; an argument that is not a plain
    string is a problem.
  - `new Worker('a')`, `new SharedWorker('a')`, `.addModule('a')`: a file, against the page.
  - `import('./a')`: a file, against the script's own address. `import(new URL('a', document.baseURI).href)`:
    a file, against the page.
  - `import ... from 'a'`, `import 'a'`, `export ... from 'a'`, either quote: a file, against the module; in a
    script that is not a module, a problem.
  - `serviceWorker.register('sw.js')`: nothing (the worker is not in its own cache); any other name is a
    problem.
  - **Then, in what is left, any of these is a problem** unless the check's allowance list holds that file
    and that statement with a reason: `import(`, `importScripts`, `new Worker`, `new SharedWorker`, `addModule`,
    `serviceWorker.register`, `fetch(`, `XMLHttpRequest`, `instantiateStreaming`, `compileStreaming`,
    `new Audio`, `new Image`, `new EventSource`, `new WebSocket`, `sendBeacon`, `import.meta`, `new URL(`, an
    assignment to `.src` or `.href`, `createElement` of `script`, `link`, `img`, `iframe`, `audio`, `video` or
    `source`, a static `import` or `export ... from`, `require(`.
- **The allowance list** is in the suite, by file and statement (not by line number), each with what was read
  there. On `main` with W4-01b it has the nine places named under "What is true today" (seven before
  W4-01b: object URLs of Blobs made on the page, a canvas's data URL, a download link, the Node-only
  `require`), and no more. A file
  that is listed but whose statement is gone is a problem too, so the list cannot rot.
- **One file is not read:** `vendor/libopus/generated/libopus.generated.mjs`, named in the suite with its
  SHA-256 (`fc0dd81b929abf0014a17b5205068ed157a20deaf2bb398a0317cae69c2c7073`) and the sentence that its
  WebAssembly is inside it and it loads no other file (read 2026-11-12, at libopus-wasm 0.4.0). Another hash
  is a problem: the file is read again by a person and the hash renewed.
- **The licence link** (`index.html:494`): by the rules it is a file the site needs and `sw.js` lacks. Until
  the orchestrator rules (the hand-back's first question), it is on a second short list in the suite, "linked,
  opened online only", with that reason. `sw.js` is not changed for it in this order.
- **The comparison:** `ASSETS` holds `'./'` and `'./index.html'`, no entry twice, every entry a file that
  exists; the derived list and the listed files are the same set. The failure message names each file "needed
  and not listed" and each "listed and not needed".
- **Also in `site`:** the workflow's `matrix.group` list is exactly the runner's groups; every
  `tests/*.verify.js` and `tests/*.verify.mjs` is in the runner's table and every command in the table is a
  file.

**Step 3: the browser suite's two lists.** In `tests/browser.verify.js`, `RUNTIME_FILES` (2440-2446) goes:
`[Browser 4b]`'s `needed` is `siteFiles(root)` (and `''` for the page's own address), and its first check
gains one condition, that every tag the browser sees (`linked`, 2466-2467) is in that list, so the static
reading of `index.html` is held to the browser's. The 20 names at 2997-2999 become the same list. Added to
`[Browser 4b]`: every request the first visit and the offline render made to the test server is for a file of
the list (collected with `page.on('request')` from before the first `goto`). No other line of the suite
changes, and both checks keep their names.

**Step 4: the number.** `tests/cache-number.mjs <base>` (a tool, not a suite: it needs the history). It reads
`sw.js` at `<base>` and in the working tree and lists the files that differ between the two among: every file
in either `ASSETS`, and `sw.js` itself apart from the number's line.

- None differ: it prints "no cached file changed; the number stays vN" and exits 0, whatever the number did.
- Some differ and the number is higher than at `<base>`: it prints them and "v34 to v35" and exits 0.
- Some differ and the number is not higher: it prints them and exits 1. With `--set` it writes the base's
  number plus one into `sw.js` instead and exits 0.
- With `--report` it never fails: it prints which of the three cases holds. A builder runs
  `node tests/cache-number.mjs origin/main --report` and puts the line in the report.

The rule's wording, and the lines of `CLAUDE.md`, `docs/PIPELINE.md`, `.claude/agents/tf-builder.md` and
`.claude/agents/tf-reviewer.md` that change, are in Appendix B. The builder puts them in as written there
(or as the orchestrator's brief amends them).

**Step 5: CI.** `.github/workflows/test.yml`: the triggers, `paths-ignore`, `concurrency` and `permissions`
stay as they are. The one job becomes:

- **`suites`**, a matrix over `group: [units, engine, render, stages, browser]` with `fail-fast: false`, each shown
  under its group's name, 15 minutes allowed. Each: checkout (with the history, for the step below), pnpm,
  Node 22 with the pnpm cache, `pnpm install --frozen-lockfile`, then `node tests/run.mjs <group>`. Only
  `browser` has the "Install browser" step, unchanged, comment and all. Only `units`, and only on a push to
  `main`, then runs `node tests/cache-number.mjs <the commit main was at before the push>`
  (`github.event.before`).
- **`verify`**, which needs `suites`, runs unless the run was cancelled, and fails unless `suites` as a whole
  succeeded. It checks nothing out.

Expected, from this plan's measurements (a suite's time on CI is its time on CI on `main` where the suite is
unchanged, otherwise its time here scaled by what the same kind of suite showed; about 10 s of setup a job):

| Job | Runs | Expected | How got |
| --- | --- | --- | --- |
| `units` | twenty suites | 2.5 to 3 min | these suites took 172 s on CI on `main`; the converted ones save about 25 s here |
| `engine` | `verify`, `steam` | about 2 min | 144.5 s here, times 0.76 (what `verify.js` showed) is 110 s |
| `render` | `render-stream` | about 4.2 min | 239 s on CI on `main`; W4-01b does not change its time here |
| `stages` | `stages` | about 3.3 min | 221.0 s here, times 0.84 (what `render-stream` showed) is 185 s |
| `browser` | `browser` | about 3.6 min | 147.4 s on CI on `main`, times 1.25 (202.1 s here with W4-01b against 162.3 s without) is 184 s, and 21 s installing |
| `verify` | nothing | seconds | |

So a push has its result about 5 minutes later (the longest job, the wait for a runner and the last job),
against 15.7 minutes on `main` today and about 19 with W4-01b in one job (941 s, and 185 s and 37 s more).
The jobs' minutes added together are no more than today's one job.

**Step 6: the small things.** `package.json`: `build:speex` (`node tests/speex102/build.mjs`) and `build:vr12`
(`node tests/vr12/build.mjs`); the description of Decision 15; the scripts in the order dev, test, build,
vendor, tools. `version` is not touched (Decision 14).

**Step 7: the documents** (where `tests/README.md` is not on `main` yet, see "Small things" at the top).
`tests/README.md` (the commands, with a suite or a group by name and `--jobs`; the
table's order and times; "Rebuilding the bundled codecs", where two rows say "no `package.json` script"; "Heavy
jobs"; a short part on the two static checks and on the cache number), `README.md` (its test section's
commands), `CLAUDE.md` and `docs/PIPELINE.md` and the two role files as Appendix B has them.

### Checks

- **The runner.** With a copy of the sources in which two suites are made to fail (`TF2_DIR` does not reach
  every suite, so: a scratch copy of the worktree with one line broken in `steam-sender.js` and one in
  `meter.js`), `node tests/run.mjs` in that copy runs every suite, names both failed suites in its table,
  repeats their `FAIL` lines, and exits 1; in the worktree it exits 0. `node tests/run.mjs nosuch` exits 2 and
  starts nothing. `node tests/run.mjs vr12 filerate` runs two suites. `pnpm test`, `pnpm test:all`,
  `pnpm test:vendor`, `pnpm test:browser` each run what Step 1 says (the report shows each one's table).
- **Nothing was dropped from `pnpm test`:** the commands of the old `test` line (as it stands on `main` when
  the build starts, part a's two included) are each in the runner's table; the report lists both.
- **The site check**, each on a scratch copy, each failing `node tests/site.verify.mjs` with a message that
  names the file: a line removed from `ASSETS`; a file added to `ASSETS` that nothing loads; a new
  `<script src>` for a file not in `ASSETS`; `importScripts` given one more file; `new Worker(name)` with a
  variable; `fetch('x.json')` added to `app/boot.js`; `els.audio.src = 'x.wav'` added to `app/render.js`; one
  allowance's statement deleted from its file; one byte changed in the generated libopus file; a group
  renamed in the workflow; a new `tests/x.verify.mjs` not put in the table. And on the worktree it passes.
- **The browser suite** passes, and `[Browser 4b]` fails when a file is removed from `ASSETS` and when the
  page is made to request a file outside the list (`fetch('LICENSE')` added to a scratch copy's
  `app/boot.js`). Its count of checks is the count before plus one.
- **The number.** In a scratch clone: a commit that changes `app/boot.js` and not the number makes
  `node tests/cache-number.mjs HEAD~1` exit 1 and name the file; with `--set` it writes the next number and a
  second run exits 0; a commit that changes only `tests/` or `voice-channel.js` exits 0; a commit that changes
  `sw.js`'s fetch handler and not the number exits 1.
- **CI.** On the pushed branch the run has six jobs and its conclusion is success; the report gives each
  job's time and the run's wall time beside "Expected" above. A commit pushed to a scratch branch (and the
  branch deleted afterwards) with one unit suite broken shows `units` and `verify` failed and the other four
  passed, and the `units` log's last lines are the runner's table. The step that runs only on `main` cannot be
  seen on a branch: the report says so, and the orchestrator reads it on the merge's run.
- `pnpm test:all` passes locally under the lock.

### Files

May touch: `tests/run.mjs`, `tests/site.verify.mjs`, `tests/lib/site-files.cjs`, `tests/cache-number.mjs`
(new); `tests/browser.verify.js` (lines 2436-2446, 2453-2491 and 2997-2999 as they stand on `main` then, and
the requires they need); `package.json`; `.github/workflows/test.yml`; `CLAUDE.md`, `docs/PIPELINE.md`,
`.claude/agents/tf-builder.md`, `.claude/agents/tf-reviewer.md` (the lines of Appendix B); `README.md` (the
test section), `tests/README.md`; the report.

May not touch: any file the site ships, **`sw.js` included** (if the site check finds a file the site needs
and `sw.js` lacks, other than the licence link, that is a finding to report with the one line that would fix
it, and the orchestrator says whether it goes into this branch); the cache number; any suite other than the
browser suite's lines above; any check's meaning; `tests/predictions/`; `docs/PROGRESS.json`.

### Stop and ask

- If the site check, as specified, needs an allowance for anything but the places listed above: say what the
  line loads.
- If a loading form in a shipped file fits none of the rules and is not an allowance either.
- If the browser suite's new request check finds a request outside the list on `main` as it stands.
- If CI's wall time on the branch is more than half as long again as "Expected".
- If GitHub will not show the matrix's five jobs and `verify` as described (the summary job's condition is the
  part most likely to need a second try: say what was tried).

Needs no approval: merging `main` in; re-running a CI job that died before any test ran; the scratch branch of
the CI check, deleted afterwards.

---

## Not in this order

- **Removing or loosening any check.** Appendix A lists the candidates for a later decision.
- **`audio.js`.** The split is the next order. What it will find ready: one list to extend
  (`tests/lib/engine.cjs`), a check that the page and both workers load the same files in the same order, a
  check that `sw.js` lists every one of them, and the engine's two suites by name in two and a half minutes
  (`pnpm test engine`).
  `tests/accuracy.mjs:318`'s `MODEL_FILES` is a second list of the engine's files with another purpose (the
  hashes a prediction was registered with): the split must decide what happens to it, with the owner's rule on
  `PREDICTIONS.md`.
- **Every suite following `TF2_DIR`** (Decision 7); **one `check()`** (Decision 6).
- **Splitting `tests/browser.verify.js` by section** (the audit's P9): alongside the next page order.
- **Suites side by side as the default on a builder's machine** (Decision 9).
- **`manifest.webmanifest`'s description**, which is first-era wording in a shipped file, and **the licence link
  offline**: both are for a page order.
- **Moving `tests/static-server.js` into `tests/lib/`**: `pnpm dev` and three documents name it.

## Appendix A: checks that are weak or doubled (candidates only)

None is removed by this order. For each: what would replace it, and what would be lost.

| Where | What it checks | Weak or doubled how | What would replace it | What would be lost |
| --- | --- | --- | --- | --- |
| `tests/verify.js` [3], 1872-1933, 12 checks | the receiver's gain by windows: clipped share 40 to 46%, mean within 0.02, gain within 0.05 | doubled: `tests/gain.verify.mjs` [1] holds the gain to a transcription of the rule, sample for sample, over 27 settings and four signals | nothing new needed for the rule itself | the five checks that quote a take's figure ("takes: 42% clipped, mean 0.71", "50%", "0.32 to 0.55 FS", "-13.4 dB rms") are the only place in CI where the rule's output is held to the recordings' numbers. Keep those five; the other seven are candidates |
| `tests/verify.js` [4], 1935-1970, 7 checks | a `steam` render of dense music against ranges from the recordings (mean 0.42 to 0.58, clipped 5 to 30%, crest 3 to 6.5 dB) | weak: ranges wide enough for a wrong model to pass | `tests/accuracy.mjs` on the takes is the real comparison, outside CI; `GOLDEN` holds the render exactly | the only CI check that a render's clipping signature is near the recordings'. Candidates for tightening, not removal; "the default volume is 1" and "volume scales linearly within 1.5 units" are exact and stay |
| `tests/verify.js` [10b] (first part), 2340 | `steam_48`'s live chain against its render: r over 0.9, level within 0.5 dB | weak | an exact comparison at the mix point (the audit's P8, not built). The audit holds, from reading and without a run, that `steam_48` cannot be made exact as built | nothing, once P8 exists; until then it is the only live check of `steam_48` besides the recorded hash at 1814 |
| `tests/verify.js` [10b], 2304-2314, 4 of its checks | each streaming stage against its whole-signal twin, exact | doubled in part: `tests/gain.verify.mjs` [1] and 748 hold the streaming gain in pieces | for the gain, nothing needed | the resampler, FIR and loss-mask checks (2304, 2308, 2314) have no twin elsewhere: keep those three |
| `tests/verify.js` [10c], 2373-2400, 4 checks | talk-spurt re-timing; "the same audio, earlier" by r over 0.9 | weak | goes with the feature when W3-02f retires it | nothing then |
| `tests/verify.js` [5b], 2015-2098, 12 checks | the gate through a whole render | doubled in part: `tests/steam-sender.verify.mjs` (109 checks on the module) and [5c] (the render sends what the sender sends) | the module's suite, for hold, pre-roll and threshold | the checks on the engine codecs' gate and on stereo capture (2035 and 2093) are not about Steam's sender and have no twin |
| `tests/speex102.verify.mjs` 772 and 782 | the `speex` live chain against the render by r over 0.9 | weak | P8 | nothing, once P8 exists |
| `tests/render-stream.verify.mjs` 844-850, 2 cases | the engine in a `vm` context gives the recorded render | after part a no suite loads the engine that way, so it guards nothing in use | nothing | the one proof, at every run, that the engine's samples do not depend on the realm; cheap to keep |
| `tests/browser.verify.js` 2997-2999 | 20 files are in the cache | doubled after part b: `[Browser 4b]` checks the whole derived list | `[Browser 4b]` | it runs after an update of the worker, `[4b]` after a first visit: two moments, so keep unless the section is rewritten |

## Appendix B: the rule about the cache number, and the lines that change

**The rule.** The cache number (`CACHE` in `sw.js`) is set by the orchestrator in the merge that changes a file
the site keeps offline, and by nobody else. A builder who adds, removes or renames a file the site loads
changes the list in `sw.js` (the `site` suite fails until the list is right) and leaves the number as it is.
[Every page order raised the number on its own branch: 19 commits touched `sw.js` in November, 10 of them that
one line, and two branches that raise it conflict on it each time `main` is merged in.]

**What the orchestrator does at the merge** (`docs/PIPELINE.md`, step 6): after the local merge and before the
push, `node tests/cache-number.mjs origin/main`. If it exits 1, run it again with `--set` and put the change
into the merge commit (`git commit --amend`, the merge being local still) or into the progress commit pushed
with it. CI on `main` then runs the same check against the commit `main` was at before the push, so a merge
pushed without the number shows as a failed run on the head.

**`CLAUDE.md`.**

- Lines 19-30, the commands and the paragraph under them. The block becomes:

  ```sh
  pnpm install --frozen-lockfile
  pnpm test                 # every suite but the browser's, about 14 minutes; a failure does not stop the rest
  pnpm test verify steam    # suites or groups by name (node tests/run.mjs with no such name lists them)
  CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) pnpm test:browser
  pnpm dev                  # the app on a local server
  ```

  and the paragraph under it: "`pnpm test:all` is every suite, the browser's last; CI runs the same suites as
  five jobs side by side (`.github/workflows/test.yml`). The `CHROMIUM_EXECUTABLE` part is for a machine whose
  installed Chromium is not the one Playwright pins. ..." (the rest of the paragraph as it is).
- Under "Hard rules", after "No uploads and no runtime CDN", one new rule: "`sw.js` lists every file the site
  loads, and its number rises in every merge that changes one of them. A test derives the list (`tests/
  site.verify.mjs`); the orchestrator sets the number at the merge and a builder never does. [The offline copy
  is part of the app's promise: a file missing from the list is a page that breaks offline, and a number that
  does not rise leaves old and new files mixed in a visitor's cache.]"

**`docs/PIPELINE.md`.**

- Step 2: after "pushes its branch so CI runs", add: "It does not change the cache number (step 6)."
- Step 5 becomes: "**The inspection** is CI on GitHub: a fresh checkout on clean runners, in five jobs side by
  side (`units`, `engine`, `render`, `stages`, `browser`) and a sixth, `verify`, that succeeds only if all five
  did; a result comes about five minutes after the push. Read
  the run on the branch's head commit yourself (its conclusion, which is `verify`'s, and its head SHA), not only
  the builder's word; a failed job's log ends with the runner's table, which names every suite of that job that
  failed. Since 2026-11-12 a commit is tested once, on its push: there is one run on a head, not two, and a
  push that changes nothing outside `docs/` starts none. So push a merge and the progress commit on top of it
  together, or the head has no run to read. [One job took 16 to 20 minutes and stopped at the first failing
  suite; a third of the runs re-tested a commit already tested, and each progress commit ran it twice.]"
- Step 6: after "with a message that says what the order did and how it was checked", add: "Before the push,
  `node tests/cache-number.mjs origin/main`: if a file the site keeps offline changed, it says so and `--set`
  raises the number, which goes into the merge commit. [A builder's branch never raises it: two branches that
  do conflict on that line at every merge of `main`.]"
- "Long runs", the first item: "**Heavy jobs** (the browser suite, a codec build, `pnpm test` whole or with
  `--jobs`) run one at a time: ..." (the rest as it is).

**`.claude/agents/tf-builder.md`.**

- Step 2, a fourth bullet: "Never change the cache number (`CACHE` in `sw.js`): the orchestrator sets it at the
  merge. If your change adds, removes or renames a file the site loads, change the list in `sw.js`; the `site`
  suite tells you. Put the line `node tests/cache-number.mjs origin/main --report` prints into your report."
- Step 4: "`pnpm test` and the browser suite at least" stays; its second bullet becomes "Run `pnpm test`, the
  browser suite and any codec build as `flock /tmp/tf2ve-heavy.lock <command>`: other agents share the machine.
  While you work, run the one suite your change touches (`pnpm test <name>`)."

**`.claude/agents/tf-reviewer.md`.** Step 2, after "the offline cache list": "(not its number, which is set at
the merge)".

**Orders already written** that say "`sw.js` `CACHE` up by one" or "cache version up" and are not built yet:
the line is void from the day part b merges; the orchestrator's brief for each says so.
