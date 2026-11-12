# S3-01b: the runner, the derived cache list, the cache number set at the merge, CI in five jobs

The builder's report. The order is `docs/work-orders/S3-01-test-harness.md`: its head, the rulings of 2026-11-12,
"What is true today", "Decisions", section S3-01b and Appendix B, with the orchestrator's brief, which adds a first
commit of its own (two browser checks that failed by timing) and amends the order where they differ. Branch
`claude/s3-01b-runner` (the brief's name; the order says `claude/s3-01b-runner-cache-ci`), from `5eb232a` (S3-01a and
S3-03 merged, cache v36), which is `main` now.

**Status:** built. No file the site ships changed (`git diff 5eb232a --stat -- sw.js index.html app/ '*.js' '*.mjs'
':!tests'` prints nothing). `node tests/cache-number.mjs origin/main --report` prints: `cache number against
origin/main (5eb232a): no cached file changed; the number stays v36`.

**Questions for the orchestrator** (each is also below where it arose):

1. **The browser suite's request check meets `sw.js`.** The order says to stop and ask if the new check in
   `[Browser 4b]` finds a request outside the list on `main`. It finds one: `sw.js`, the service worker's own
   script, which the page registers. The order's own rule for `serviceWorker.register('sw.js')` is "nothing (the
   worker is not in its own cache)", so the check names `sw.js` as the one request allowed outside the list, with
   that reason. Nothing else is requested outside the list. Confirm, or say how it should be held instead.
2. **The scratch branch of the CI check is still on GitHub.** `claude/s3-01b-ci-scratch` (`ad5d24f`, one check
   broken on purpose in `tests/harness.verify.mjs`) was pushed and its run read; deleting the remote branch was
   refused twice by the git proxy (the connection dropped) and once by this session's permission rules. It needs
   deleting by someone with that permission (`git push origin --delete claude/s3-01b-ci-scratch`).

## Commits

| Commit | What |
| --- | --- |
| `7636a19` | the brief's first commit, alone: `[Browser 3e]` and `[Browser 10]` wait for what they read, not for the clock |
| `6c380ff` | `tests/run.mjs`, `tests/lib/site-files.cjs`, `tests/site.verify.mjs`, the workflow in five jobs and `verify`, `package.json`'s four test scripts |
| `2457fa6` | `tests/cache-number.mjs` |
| `fb08304` | `[Browser 4b]` and the service-worker section take the derived list; the request check |
| `41d92c3` | `package.json`: the description (Decision 15), `build:speex`, `build:vr12`, the scripts in order; `version` stays |
| `fe53f77` | `CLAUDE.md`, `docs/PIPELINE.md`, the two role files (Appendix B), `README.md`, `tests/README.md`, `docs/README.md` |
| the report's commit | this report |

## The two browser checks that failed by timing

Both changes are inside the two places the brief allows; no other line of `tests/browser.verify.js` moved for them.
The proofs ran a scratch copy of the suite cut down to the one part, in a loop (a scratch script, not committed),
under the lock, on this machine.

### `[Browser 3e]` "the meter adds the real take and the render minus the real take"

- **Cause.** The check read the meter's rows as soon as the report's table appeared. `app/realtake.js` builds the
  report, then calls `updateMeter()`, which puts the `REAL` row in at once with placeholder cells; the `Δ real` row
  comes only when `measure()` of the take, a job of the page's worker (`app/meter.js:41`), has answered.
- **Repair.** The check first waits (60 s at most) for a `Δ real` row; if none comes, the check itself fails by its
  name. Its name and condition are unchanged.
- **The failure shown.** A scratch copy whose meter job answers 1.5 s late (`app/meter.js:41`, the reply delayed):
  the old check failed three runs of three; the repaired check passed three of three.
- **Twenty in a row.** The repaired check on the unchanged page: 20 passed, 0 failed.
- **Still fails when broken.** The `Δ real` row taken out of `app/meter.js`: fails. The `REAL` source taken out of
  `meterSources()`: fails.

### `[Browser 10]` "a worker that does not answer a cancel is ended after the bound (1.4 s for 60 s) and replaced ..."

- **Cause, from the log and the code.** CI's message was `1 workers, 1 source messages, 0 on the page's thread;
  undefined`: no replacement was logged, one worker was made, the source was sent once. In `app/render.js`
  (`cancelPageJob`, 183-198) the bound's timer ends the worker only if the job is still the running one when it
  fires; a worker's `done` ends the job first and clears the timer (`endPageJob`). So the cancelled render finished
  inside the bound, and the page kept a worker that had finished, which is what it is meant to do. The page did not
  miss the bound and did not fail to replace a busy worker: the check counted on the render being still busy 1.4 s
  after the press. Measured here: the press comes 919 to 940 ms after the poll sees 5% (five runs), and the render
  ends 2.5 to 3.2 s after the poll sees 5% when it is not cancelled (four runs), so 1.6 to 2.3 s after the press. A
  runner that renders a third faster, or a press that comes later, closes the gap.
- **Repair.** The check makes the worker not answer, whatever its speed: the page's cancels are still dropped, and
  every reply of the cancelled render but its progress and preview is now held back (no result, no meter, no
  `done`). It then waits for the worker's end (the page calling `terminate` on it), not for the clock, and holds,
  besides what it held, that the end came no sooner than the bound: the time from the cancel's post to the
  `terminate` is at least 1,400 ms less 1 ms for the clocks' resolution. The wrapper that does this is added inside
  `speedCancelUnanswered` on top of the suite's own; `speedPage` is unchanged. The name is unchanged.
- **The failure shown.** A scratch copy whose bound timer fires 2.5 s late (the log line still names the bound): the
  old check failed three of three with CI's message exactly (`1 workers, 1 source messages, 0 on the page's thread;
  undefined`). The same with the cancel pressed at 75% instead of 5% (the render ends inside the bound): three of
  three failed, the same message. The repaired check passed both (three of three, and one of one).
- **Twenty in a row.** On the unchanged page: 20 passed, 0 failed; each run's worker ended 1,401 ms after the cancel.
- **Still fails when broken** (each in a scratch copy of `app/render.js`):

| Break | Result |
| --- | --- |
| the timer fires at half the bound, the message still names the bound | fails: `ended 701 ms after the cancel` (the old check passed this) |
| the worker is not ended at the bound (`dropPageWorker()` left out) | fails: `1 workers ... not ended` |
| the source is not sent to the new worker (`pageWorker.held` not cleared) | fails: `2 workers, 1 source messages, 1 on the page's thread` |
| the timer never ends the job | fails: `1 workers, 1 source messages ...; not ended; undefined` |

## What was built

**The runner** (`tests/run.mjs`): the table of the order's Step 1 (`harness`, `site`, `vendor`, and the rest of
`units`; `engine`: `verify`, `steam`; `render`; `stages`; `browser`), exported with `GROUPS`; the runner runs the
suites asked for in the table's order, the browser suite last and alone, every one whatever the earlier did; a lone
`--` is ignored; `--jobs N` holds each suite's output until it ends.

**The site check** (`tests/lib/site-files.cjs`, `tests/site.verify.mjs`), by the order's rules, with these choices:

- Comments are taken out by a small lexer that keeps strings, template literals and regular expressions, so a line
  keeps its number. The planner's prototype took `//` out by a pattern, which also cuts the base64 strings of
  `vendor/swresample/swresample.js` that hold `//`; it did not matter there only because those lines hold no loading
  word. Every shipped script, its comments taken out by the lexer, still parses (`node --check`).
- The allowance list is by file and statement, with how many lines hold the statement; a statement gone, or found
  another number of times, is a problem. On `5eb232a` it holds eight statements on nine lines: `app/render.js`
  `link.href = url;` (saveBlob's download link), `els.audio.src = state.lastBlob;` (two lines),
  `els.audioDry.src = state.dryBlob;`, `els.audio.src = state.preview.url;`; `app/realtake.js`
  `els.audioReal.src = blob;`; `app/console.js` `link.href = els.canvas.toDataURL();`; `batch.js`
  `ui.preview.src = item.url;`; `filerate.js` the Node-only `require('./video.js')`. Each is an object URL of a Blob
  made on the page, a canvas's data URL, or Node only, as the order names them.
- To the order's list of loading words a few are added that can name a URL and that nothing on the site uses
  today: `setAttribute` of `src`, `href`, `srcset`, `poster`, `data` or `action`; an assignment to `.srcset` or
  `.poster`; `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`; `window.open`; `location.assign` and
  `location.replace`. A reference to another site from anything but an `<a>`, an absolute path, a path out of the
  folder or a missing file is a problem too.
- The licence link is ruling 1's named allowance, "linked, opened online only", kept in a list of its own
  (`ONLINE_ONLY`); a check fails if that file is ever put in `ASSETS`, and its link going is a problem.
- The suite checks the folder it sits in, not `TF2_DIR`: it reads `.github/` and `tests/` as well as the site.

**The number** (`tests/cache-number.mjs`): as the order's Step 4. With no file changed and the number moved anyway
it says so (`the number went from v37 to v38 all the same`) and exits 0. An unknown base exits 2 and says CI needs
the history.

**CI** (`.github/workflows/test.yml`): `suites`, a matrix over the five groups, `fail-fast: false`, each job named by
its group, 20 minutes each (ruling 5; the workflow's 45 went with its one job); checkout with the whole history for
`units` only (`fetch-depth: ${{ matrix.group != 'units' && 1 || 0 }}`); "Install browser" for `browser` only,
unchanged; `node tests/run.mjs <group>`; on a push to `main`, `units` then runs `node tests/cache-number.mjs
"$BEFORE"` with `github.event.before` passed through the environment. `verify` needs `suites`, runs unless the run
was cancelled, and fails unless `needs.suites.result` is `success`. The triggers, `paths-ignore`, `concurrency` and
`permissions` are as they were.

**The browser suite** (`tests/browser.verify.js`): `RUNTIME_FILES` is gone; `SITE_FILES` is `siteFiles(root).files`.
`[Browser 4b]`'s `needed` is that list and `''`; its first check also holds every tag the browser sees to it. The
twenty names of the service-worker section are the same list (both checks keep their names). Added to `[Browser 4b]`:
every request to the test server from a listener on the context (page, workers, service worker), from before the
first visit to the end of the offline render, is for a file of the list, or `sw.js` (question 1). `blob:` URLs, whose
origin is the page's, are not requests to the server and are left out.

## Checks

Every heavy run was alone under `flock /tmp/tf2ve-heavy.lock`, on this machine (four cores, other agents' sessions).

### The runner

| Check | Result |
| --- | --- |
| a scratch copy with `steam-sender.js` (`hold: 0.5`) and `meter.js` (`sumSq += 2 * v * v`) broken, `node tests/run.mjs` | every suite ran (24); the table names seven failed: `meter`, `voice-channel`, `steam-sender`, `verify`, `steam`, `render-stream`, `stages`; each one's `FAIL` lines and last 15 lines repeated (`meter` and `steam-sender` throw at their first failure and print no `FAIL` line, so their last lines carry the failing check's name); `EXIT 1`; 877.9 s |
| `node tests/run.mjs nosuch` | exit 2, the groups and suites listed, nothing run |
| `node tests/run.mjs -- vr12 filerate` | two suites, the table, exit 0 |
| `pnpm test:vendor` | `vendor` alone, passed, exit 0 |
| `pnpm test:browser` | `browser` alone, passed in 246.2 s |
| `pnpm test` | the 24 suites (all but the browser's) passed, exit 0; 875.6 s summed and of wall time (14 min 36 s), load 2.1 at the start |
| `pnpm test:all` | all 25 suites, the browser suite last, passed, exit 0; 1,105.7 s (18 min 26 s), load 1.0 at the start |

**Nothing dropped from `pnpm test`.** The old `test` line at `5eb232a` ran `harness.verify.mjs`, `verify.js`,
`steam.verify.js`, `gain.verify.mjs`, `gain-exact.mjs --synthetic`, `opus.verify.mjs`, `speex102.verify.mjs`,
`vr12.verify.mjs`, `miles.verify.mjs`, `reference.verify.mjs`, `formats.verify.mjs`, `filerate.verify.mjs`,
`meter.verify.mjs`, `video.verify.mjs`, `demo.verify.mjs`, `render-stream.verify.mjs`, `stages.verify.mjs`,
`output-stage.verify.mjs`, `voice-channel.verify.mjs`, `steam-sender.verify.mjs`, `swresample.verify.mjs`,
`room-dsp.verify.mjs`; `test:vendor` ran `vendor-opus.mjs --check` and `test:browser` `browser.verify.js`. Each
command is in the runner's table, word for word (checked by a script against `git show 5eb232a:package.json`); the
table adds `site.verify.mjs`.

### The site check

On the worktree it passes: 49 files derived, the 49 `ASSETS` lists besides `'./'`, in about 270 ms. Each break in a
fresh copy of the branch's head fails `node tests/site.verify.mjs` (exit 1) with a message that names the file:

| Break | What fails, as printed |
| --- | --- |
| `./zip.js` removed from `ASSETS` | `needed and not listed: zip.js` |
| `./LICENSE` added to `ASSETS` | `listed and not needed: LICENSE` |
| `<script src="extra.js">` added to `index.html` | `needed and not listed: extra.js` |
| `importScripts` in `live-worker.js` given `'extra.js'` | `needed and not listed: extra.js` |
| `new Worker(liveWorkerName)` in `live.js` | `live.js:214: new Worker: ...`, and `listed and not needed: live-worker.js` |
| `fetch('x.json')` added to `app/boot.js` | `app/boot.js:80: fetch(: fetch('x.json');` |
| `els.audio.src = 'x.wav'` added to `app/render.js` | `app/render.js:957: an assignment to .src: ...` |
| `link.href = els.canvas.toDataURL();` deleted from `app/console.js` | `the allowance "link.href = els.canvas.toDataURL();" is found 0 times, the list says 1` |
| one byte of `libopus.generated.mjs` changed | its SHA-256 named, "read it again and renew the hash" |
| `stages` renamed `stage` in the workflow's matrix | `workflow: units, engine, render, stage, browser; runner: ...` |
| a new `tests/x.verify.mjs`, not in the table | `not in tests/run.mjs: tests/x.verify.mjs` |

**What the site check found against `sw.js`:** nothing it lacks and nothing it lists without need, apart from the
licence link of ruling 1.

### The browser suite

- Whole, on the branch: passed, 411 checks (410 at `5eb232a` on CI, run 43200040764: the count before plus one),
  246.2 s here.
- `[Browser 4b]` with `./zip.js` removed from `ASSETS`: fails, "after the first visit, before any reload, every file
  the page needs offline is cached (zip.js)".
- `[Browser 4b]` with `fetch('LICENSE')` added to `app/boot.js`: fails, at "no page errors" (`Failed to fetch`,
  offline). With `fetch('LICENSE').catch(() => {})`, so no page error comes first: fails at the new check,
  `outside the list: LICENSE`. The same `fetch` put at the top of `audio-worker.js` (a request from a worker):
  fails at the new check the same way.

### The number

In a scratch clone of the branch:

| Commit on top of the branch | `node tests/cache-number.mjs HEAD~1` |
| --- | --- |
| `app/boot.js` changed, the number not | exit 1, `cached files changed since HEAD~1: app/boot.js`, `the number is v36, not above v36: it must rise` |
| the same, `--set` | `v36 to v37, written into sw.js`, exit 0; a second run without `--set`: `v36 to v37`, exit 0 |
| the same unraised, `--report` | the failing case printed, exit 0 |
| `tests/run.mjs` only | `no cached file changed; the number stays v36`, exit 0 |
| `voice-channel.js` only (no page loads it) | the same, exit 0 |
| `sw.js`'s fetch handler changed, the number not | exit 1, `sw.js` named |
| `./LICENSE` added to `ASSETS` and the number raised | `sw.js` named, `v36 to v37`, exit 0 |
| only the number changed | `no cached file changed; the number went from v37 to v38 all the same`, exit 0 |

The step that runs it on `main` cannot run on a branch: it shows on the merge's run.

### CI

Every run on the branch's code head `41d92c3`: the push's run and two started by hand (`workflow_dispatch`), all
six jobs passed in each. Times from each job's start to its end, and the run's wall time from its creation to its
end:

| Job | Expected (the order) | Run 43204851667 (push) | Run 43205720166 | Run 43206619537 | Measured range |
| --- | --- | --- | --- | --- | --- |
| `units` | 2.5 to 3 min | 1 min 47 s | 3 min 5 s | 2 min 30 s | 1 min 47 s to 3 min 5 s |
| `engine` | about 2 min | 2 min 38 s | 1 min 38 s | 2 min 11 s | 1 min 38 s to 2 min 38 s |
| `render` | about 4.2 min | 4 min 51 s | 3 min 1 s | 4 min 51 s | 3 min 1 s to 4 min 51 s |
| `stages` | about 3.3 min | 4 min 1 s | 2 min 36 s | 3 min 30 s | 2 min 36 s to 4 min 1 s |
| `browser` | about 3.6 min | 4 min 53 s | 4 min 48 s | 4 min 28 s | 4 min 28 s to 4 min 53 s |
| `verify` | seconds | 3 s | 3 s | 3 s | 3 s |
| **wall** | **about 5 min** | **5 min 4 s** | **4 min 59 s** | **5 min 3 s** | **4 min 59 s to 5 min 4 s** |

The same suites in one job at `5eb232a` (run 43200040764): 18 min 38 s. The jobs' minutes added together were
18 min 13 s, 15 min 11 s and 17 min 33 s, no more than that one job. The browser job is the longest on two runs of
three and longer than expected: its suite took 223 to 254 s against the 184 s the order scaled, as at `131a319`
(4 min 8 s). The wall time is within the order's bound (half as long again as expected). Each suite's own seconds
on CI are in `tests/README.md`'s table (the slowest of the three).

**The failing group** (scratch branch `claude/s3-01b-ci-scratch`, `ad5d24f`, run 43205452727, one check broken on
purpose in `harness.verify.mjs`): `units` failed, `engine`, `render`, `stages` and `browser` passed, `verify`
failed (`The five groups: failure`). The `units` log ends with the runner's table, then `---- harness
(tests/harness.verify.mjs): 1 FAIL line, then its last 15 lines`, the line itself, and `19 of 20 suites passed;
FAILED: harness.` The branch is not deleted yet (question 2).

**The documents' commit** (`fe53f77`, run 43209969821, the push's run): all six jobs passed; `units` 2 min 30 s,
`engine` 2 min 45 s, `render` 4 min 43 s, `stages` 3 min 28 s, `browser` 4 min 57 s, `verify` 4 s, wall 5 min 7 s.
Over the four runs the wall time was 4 min 59 s to 5 min 7 s. The documents give the three runs of one commit
(4 min 59 s to 5 min 4 s) and say "about five minutes".

## The rules changed (Appendix B), before and after

Ruling 2: the appendix's sentences are fitted to the text on `5eb232a`, keeping their meaning; a time is the one
measured. No hard rule is weakened: one is added, and the others are unchanged.

**`CLAUDE.md`, the commands block.** Before:

```sh
pnpm test                 # the Node suites, 8 to 14 minutes on CI
pnpm test:vendor          # the bundled codec builds match their recorded hashes
CHROMIUM_EXECUTABLE=$(...) node tests/browser.verify.js
```

After:

```sh
pnpm test                 # every suite but the browser's, about 15 minutes on four cores; a failure does not stop the rest
pnpm test verify steam    # suites or groups by name (node tests/run.mjs with no such name lists them)
CHROMIUM_EXECUTABLE=$(...) pnpm test:browser
```

(`pnpm install` and `pnpm dev` unchanged; `pnpm test:vendor` is part of `pnpm test` now.)

**`CLAUDE.md`, the paragraph under it.** Before: "`pnpm test:all` is what CI runs (vendor check, Node suites,
browser suite), 16 to 18 minutes of CI's 45 (measured on CI on 2026-11-12). ... run the suite a change touches on
its own first (`node tests/<suite>`). The `CHROMIUM_EXECUTABLE` line is for a machine ...". After: "`pnpm test:all`
is every suite, the browser's last; CI runs the same suites as five jobs side by side (`.github/workflows/test.yml`),
and a push has its result about five minutes later (measured on CI on 2026-11-12). ... run the suite a change
touches on its own first (`pnpm test <name>`). The `CHROMIUM_EXECUTABLE` part is for a machine ...". The sentence on
the three long suites and "elsewhere `pnpm test:browser` is enough" are kept.

**`CLAUDE.md`, the hard rules.** Before: no rule on the cache list or its number. After, a new rule after "No
uploads and no runtime CDN": "`sw.js` lists every file the site loads, and its number rises in every merge that
changes one of them. A test derives the list (`tests/site.verify.mjs`); the orchestrator sets the number at the
merge and a builder never does. [The offline copy is part of the app's promise: a file missing from the list is a
page that breaks offline, and a number that does not rise leaves old and new files mixed in a visitor's cache.]"

**`docs/PIPELINE.md`, step 2.** Before: "... pushes its branch so CI runs, and writes its report to
`docs/reports/<order>.md` on the branch." After: the same, then "It does not change the cache number (step 6)." (The
appendix puts the sentence after "pushes its branch so CI runs"; it is the step's last sentence, so as not to split
the sentence.)

**`docs/PIPELINE.md`, step 5.** Before: "**The inspection** is CI on GitHub: a fresh checkout on a clean runner.
Read the run on the branch's head commit yourself (its conclusion and head SHA), not only the builder's word. ...
[CI takes 20 minutes; a third of its runs re-tested a commit already tested, and each progress commit ran it
twice.]" After: "**The inspection** is CI on GitHub: a fresh checkout on clean runners, in five jobs side by side
(`units`, `engine`, `render`, `stages`, `browser`) and a sixth, `verify`, that succeeds only if all five did; a
result comes about five minutes after the push (measured on 2026-11-12). Read the run on the branch's head commit
yourself (its conclusion, which is `verify`'s, and its head SHA), not only the builder's word; a failed job's log
ends with the runner's table, which names every suite of that job that failed. ... [One job took 16 to 18 minutes and
stopped at the first failing suite; a third of the runs re-tested a commit already tested, and each progress commit
ran it twice.]" The sentences on one run per head and pushing a merge with its progress commit are kept as they
were. The appendix's "16 to 20 minutes" is `CLAUDE.md`'s measured 16 to 18.

**`docs/PIPELINE.md`, step 6.** Before: "**The merge** is local, `--no-ff`, with a message that says what the order
did and how it was checked, then `git push origin HEAD:main`. Never GitHub's merge button ...". After: "**The
merge** is local, `--no-ff`, with a message that says what the order did and how it was checked. Before the push,
`node tests/cache-number.mjs origin/main`: if a file the site keeps offline changed, it says so and `--set` raises
the number, which goes into the merge commit. [A builder's branch never raises it: two branches that do conflict on
that line at every merge of `main`.] Then `git push origin HEAD:main`. Never GitHub's merge button ...".

**`docs/PIPELINE.md`, "Long runs", the first item.** Before: "**Heavy jobs** (`pnpm test`, the browser suite, a
codec build) run one at a time: ... [... `pnpm test` is the longest job, about 17 minutes on CI.]" After: "**Heavy
jobs** (the browser suite, a codec build, `pnpm test` whole or with `--jobs`) run one at a time: ... [... `pnpm test`
whole is the longest job, about 15 minutes on four cores.]" (CI no longer runs `pnpm test` as one job, so the figure is this
machine's.)

**`.claude/agents/tf-builder.md`, step 2.** Before: three bullets. After: a fourth, "Never change the cache number
(`CACHE` in `sw.js`): the orchestrator sets it at the merge. If your change adds, removes or renames a file the site
loads, change the list in `sw.js`; the `site` suite tells you. Put the line `node tests/cache-number.mjs origin/main
--report` prints into your report."

**`.claude/agents/tf-builder.md`, step 4, the second bullet.** Before: "Run the browser suite and any codec build as
`flock /tmp/tf2ve-heavy.lock <command>`: other agents share the machine." After: "Run `pnpm test`, the browser suite
and any codec build as `flock /tmp/tf2ve-heavy.lock <command>`: other agents share the machine. While you work, run
the one suite your change touches (`pnpm test <name>`)." Its first line ("`pnpm test` and the browser suite at
least") is unchanged.

**`.claude/agents/tf-reviewer.md`, step 2.** Before: "broken contracts (determinism, the source timeline, pinned
codec hashes, the offline cache list)". After: "... the offline cache list (not its number, which is set at the
merge))".

Not changed here: the orders already written that say "`CACHE` up by one" (Appendix B's last paragraph is the
orchestrator's, in each brief), the order's status line, `docs/PROGRESS.json`, `docs/PROGRESS-LOG.md`.

## Other documents

- `README.md`, "Tests": the commands (`pnpm test` with a name), and CI as five jobs with its time as measured.
- `tests/README.md`: the commands and a paragraph on the runner; CI's five jobs with each job's measured range; the
  suites' table in the runner's order with each suite's name and group and CI's time (the slowest of the three
  runs), with rows for `site.verify.mjs` and `vendor-opus.mjs --check`; a section on the files the site keeps
  offline and the cache number; `pnpm build:speex` and `pnpm build:vr12` in "Rebuilding the bundled codecs"; "Heavy
  jobs" with `--jobs`.
- `docs/README.md`: S3-01b's row, its state and this report.

## Found in the order on today's main

- The order's line numbers are `9e0abd0`'s. On `5eb232a`: `RUNTIME_FILES` was at `tests/browser.verify.js:2473`,
  `[Browser 4b]` at 2486, the twenty names at 3594-3596; the allowances' lines in `app/render.js` are 405, 486, 490,
  558, 582 (the order: 220, 300, 304 and two more) and `batch.js:356` (354).
- "Nine places": nine lines, eight statements (`els.audio.src = state.lastBlob;` is on two lines).
- The request check of Step 3 meets two things the order did not name: `blob:` URLs, which Playwright reports with
  the page's origin and which are not requests to the server (left out), and `sw.js` (question 1).
- `[Browser 4b]`'s count of checks, before and after: 410 and 411, as the order says.
- The order's expected times: the wall time came out as expected; the `browser` job is longer than expected (above)
  and is now the longest job on most runs.
- Brief item 1's `[Browser 10]`: the cause was a render that ended inside the bound, not a slow runner stretching a
  time; the page did what it should.

## Scanned before the push

`git diff 5eb232a...HEAD` and the branch's commit messages hold no recording, personal detail, real SteamID or
model name; the only model name is in the commit trailers the brief gives.

## After the review

The review found no blocker and ten items, each small. The orchestrator answered the two questions: `sw.js` allowed
by name in the request check is accepted as built; the scratch branch is left alone and no new one was made. Each
break below was run in a copy of the fixed branch; "before" is the reviewer's run on `809abd1` (its logs in the
review's scratch folder) where the reviewer showed one. The browser breaks ran one part of the suite in a loop, under
the lock.

| Item | What changed | The break, before and after |
| --- | --- | --- |
| 1. `[Browser 10]` had no upper limit | the worker must be ended no sooner than the bound and no later than the bound and 1,000 ms; the head comment says so | the page's timer at twice the bound: before, passed (`ended 2801 ms`); after, fails by name (`ended 2801 ms after the cancel`). At 1.5 times (2,100 ms) it passes, inside the limit. The unchanged page: 20 of 20 passed, each `ended 1401 ms` |
| 2. a worker ended and not replaced failed by `renderNow`'s timeout | the render after the end is caught (`rendered`) and is part of the check's condition and detail | `pageWorker.worker` left set after `terminate`: before, `page.waitForFunction: Timeout 120000ms exceeded`; after, fails by name, `1 workers, 1 source messages ...; no render after it`. The reviewer's other two breaks of the page (the source not sent again; the job settled without the worker ended) fail by name too |
| 3. the comment lexer read a regular expression after `)` as a division | every script's text, once its comments are taken out, must parse (a classic script with `vm.Script`, the modules in one child process with `vm.SourceTextModule`, nothing run); a file that does not is a problem naming it. And a `/` after the `)` of `if`, `while`, `for` or `with` starts a regular expression | `if (self) /\/\//.test('a') && fetch('x.json');` in `app/boot.js` (the reviewer's 18 and 18b): before, passed; after, fails, `app/boot.js:79: fetch: ...`. With the `)` case taken back out of a copy of the lexer, the parse rule alone fails it: `app/boot.js: does not parse as a script once its comments are taken out (Invalid regular expression: missing /)`. Every shipped script parses: the worktree passes |
| 4. CSS `image-set("x.png" 1x)` | `image-set(` and `-webkit-image-set(` are problems | before, passed; after, `style.css:558: image-set(: a form this check does not read` |
| 5. forms passed over | all eight closed, none fires on the worktree: `fetch` as a word (`w['fetch']`, `globalThis.fetch`); `['src']`, `['href']` (and `srcset`, `poster`) assignments; `Object.assign(` with `src` or `href` on its line; an assignment to `location`; `<meta http-equiv="refresh">`; an attribute written twice; `</script` not followed by `>`; a `src` or `href` with a query string or a fragment. `[Browser 4b]` keeps a tag's and a request's query string | the reviewer's 23 to 26 and 29 to 34 each passed before and each fails after, naming the file and line. `<script src="zip.js?v=2">`: the site check fails (`a query string or a fragment`), and `[Browser 4b]` fails (`tags the static reading missed: zip.js?v=2`), which passed before. Not closed, and said in `tests/README.md` in one sentence: a URL or property name built from parts or passed through code the check cannot read (`el['sr' + 'c']`, a helper of the page's own, `eval`) |
| 6. the site suite's section on the runner and the workflow | the suites that are not `*.verify.*` files are named with their exact commands (`tests/verify.js`, `tests/vendor-opus.mjs --check`, `tests/gain-exact.mjs --synthetic`), and a `*.verify.*` suite has no arguments; the workflow has no `exclude` or `include` and its one runner line is `node tests/run.mjs ${{ matrix.group }}` | each passed before and fails after: `vendor` taken out of the table; `gain-exact` taken out; `--check` dropped; `--synthetic` dropped; a matrix `exclude`; a run step that names `units`. (`verify.js` taken out of the table fails as well.) |
| 7. the runner | it compares real paths to know it was run as a program; a suite that exits 0 having printed a line that starts with `FAIL`, or nothing, is FAILED with that cause. No suite does either when it passes: a whole passing `pnpm test:all` log has no such line and no suite with no output | called through a symlink to the worktree: before, nothing run and exit 0; after, the suites run. A copy whose `vr12` suite also prints `  FAIL  ...` and whose `filerate` suite prints nothing: before, both `passed`, exit 0; after, `FAILED (FAIL lines, exit 0)` and `FAILED (no output, exit 0)`, exit 1 |
| 8. the workflow's `concurrency` | `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`, with one comment line | seen only on `main` |
| 9. `docs/PIPELINE.md` | step 5: only `verify` with success counts, and a run cancelled by a newer push leaves `verify` skipped, which is not a pass; its reason says 16 to 19 minutes. Step 6: after a red run on `main`, the next merge compares with the last commit of `main` whose run was green. "Long runs" and `tf-builder`'s lock bullet name the long suites (`render-stream`, `stages`, `steam`) as heavy jobs | documents |
| 10. `CLAUDE.md` and `tests/cache-number.mjs` | the commands block no longer gives a time; the paragraph under it gives `pnpm test` whole as 14 min 36 s on a four-core machine shared with other agents, measured on 2026-11-12. An empty or all-zeros base: `the base is "...", which names no commit: there is no commit before this push to compare with` (exit 2), not the advice on `fetch-depth` | both messages shown |

**The rules, before and after, as changed in this round** (the earlier ones are above):

- `CLAUDE.md`, the commands block: "`pnpm test` # every suite but the browser's, about 15 minutes on four cores; a
  failure does not stop the rest" became "... every suite but the browser's; a failure does not stop the rest", and
  the paragraph under it gained "`pnpm test` whole took 14 min 36 s on a four-core machine shared with other agents
  (measured on 2026-11-12)."
- `docs/PIPELINE.md`, step 5: "... not only the builder's word; a failed job's log ends with the runner's table ..."
  became "... not only the builder's word. Only `verify` with the conclusion success counts: a run cancelled by a
  newer push leaves `verify` skipped, which is not a pass. A failed job's log ends with the runner's table ...". Its
  reason: "One job took 16 to 18 minutes" became "16 to 19 minutes".
- `docs/PIPELINE.md`, step 6: added "If the last run on `main` is red, compare instead with the last commit of `main`
  whose run was green (`node tests/cache-number.mjs <that commit>`)", and to its reason "CI's step on `main` compares
  only with the commit before the push, so a red run's missed rise would otherwise pass unseen."
- `docs/PIPELINE.md`, "Long runs": "**Heavy jobs** (the browser suite, a codec build, `pnpm test` whole or with
  `--jobs`)" became "(..., and the long suites `render-stream`, `stages` and `steam` alone)"; its figure "about 15
  minutes on four cores" became "14 min 36 s on a four-core machine shared with other agents (measured
  2026-11-12)".
- `.claude/agents/tf-builder.md`, step 4: "Run `pnpm test`, the browser suite and any codec build as ..." became "Run
  `pnpm test`, the browser suite, the long suites (`render-stream`, `stages`, `steam`) and any codec build as ...".

Each adds to a rule; none takes anything away.

**Not changed:** the request check of `[Browser 4b]` still does not see a request made only on a path the first
visit and the offline render do not walk: `fetch('LICENSE')` put in `live-worker.js` passes it (as on `809abd1`),
since the live monitor is not started there; the site check fails it.

**Checks after the fixes.** `pnpm test:all` under the lock on the fixed code (`b46340f`): all 25 suites passed, the
browser suite last with 411 checks, exit 0; 1,114.9 s (18 min 35 s), load 1.3 at the start. `node tests/site.verify.mjs`
on the worktree passes. CI on `b46340f` (run 43220056967, the push's run): all six jobs passed; `units` 1 min 50 s,
`engine` 1 min 33 s, `render` 4 min 3 s, `stages` 3 min 28 s, `browser` 4 min 39 s, `verify` 2 s; wall 4 min 49 s.
`git fetch origin && git merge origin/main`: already up to date (`main` is `5eb232a`). `node tests/cache-number.mjs
origin/main --report`: `no cached file changed; the number stays v36`.
