# S3-02: `audio.js` split into files by stage

Status: S3-02a built and merged 2026-11-12 (`f134d2c`, cache v37, `docs/reports/S3-02a-engine-split.md`); S3-02b planned, not built. At the merge the orchestrator added to S3-02b: the two harness gaps and the service worker's cache modes that S3-02a's review found, and four stale comments (see the brief's record in `docs/PROGRESS.json`)

*Written 2026-11-12 from the structure audit of the same day (its section 1, its items C-01 to C-09, its section 4
and its proposals P5 and P6; "the audit" below), which read `main` at `8035cfa`. Everything here was read again on
the session branch at `ce55fa7` (W4-01b merged, cache v35), where `audio.js` is the blob `ec9780f4`. Part a
changes no sample, no recorded hash or value and no member of `TF2Audio`: it moves lines.*

| Part | What | Files it touches | Starts after | Budget |
| --- | --- | --- | --- | --- |
| **S3-02a** | the engine's code moved, unedited, out of `audio.js` into ten files under `engine/`; the lists that load them; the checks that hold the cut; the licence file in the offline list; the documents | `engine/` (new), `audio.js`, `index.html`, `audio-worker.js`, `live-worker.js`, `sw.js` (the list only), `tests/lib/engine.cjs`, `tests/harness.verify.mjs`, `tests/site.verify.mjs` (one allowance), `tests/accuracy.mjs` (one list), `tests/browser.verify.js` (one read, if ruled), comments in `constants.js`, `app/render.js` and `video.js`, the documents of "The documents" | **S3-01a and S3-01b merged** | 8 hours |
| **S3-02b** | one function that nothing calls taken off `TF2Audio`; two lines of the page that nothing reads | `audio.js`, `tests/harness.verify.mjs` (the recorded list), `app/visualizer.js`, `app/core.js` | **S3-02a merged**, and the orchestrator's ruling on the first of the two | 1 hour |

**Kind:** engine, by moves only. `tf-builder` (effort high), then `tf-reviewer`. Part a changes no arithmetic, so
it does not need the second reader of `docs/PIPELINE.md`; the reviewer's work is to test the checks that say
"only moved" and to read the lists.
**Branches:** `claude/s3-02a-engine-split`, `claude/s3-02b-engine-deletions`, each from `main`. **Worktrees:**
given in the brief. **Reports:** `docs/reports/S3-02a-engine-split.md`, `docs/reports/S3-02b-engine-deletions.md`.

**Part a first.** Part b removes a member of `TF2Audio`, which part a's proof says did not change, so the two are
not built on one branch. Part b is small enough to be built by the same builder the day part a merges.

**Commands** (CLAUDE.md has them). After S3-01b a suite or a group is run by name, `node tests/run.mjs <name>`;
on a shared machine every suite run goes through the lock, `flock /tmp/tf2ve-heavy.lock <command>`. The browser
suite needs `CHROMIUM_EXECUTABLE` where the installed Chromium is not the one Playwright pins.

## Rulings of 2026-11-12 (the orchestrator, on the plan's open points)

1. **`TF2Audio.realOpusRoundTrip` goes** (nothing reads it, the suites included), in part b, in its own commit.
   `TF2Audio.resampleLinear` stays, as W3-10's order has it. The rule "the public surface does not change" binds
   part a; part b changes it by that one name and says so in its report.
2. **The check `[Browser 3e]` that reads the meter's rows before the row it wants has arrived** is repaired
   before this order, in S3-01b (its builder's brief says so): the check waits for the row it reads, its name
   and its condition unchanged. If S3-01b did not do it, part a does it as its own first commit.
3. **A fresh worker starting 19 to 39 ms later is accepted.** Since W4-01b the page keeps its worker, so a fresh
   start is rarer than it was.
4. **The folder `engine/`**, with the codec module's loader kept in `audio.js`.
5. **The comments elsewhere that say a moved function is "in audio.js"** are corrected in this order, in one
   commit that changes comments only.
6. **The builder adds** the index rows in `docs/README.md` and the dated notes in the unbuilt orders that name
   `audio.js`, in the documents commit. `docs/PROGRESS.json`, `CLAUDE.md`, `docs/PIPELINE.md` and the agent
   files stay the orchestrator's; `CLAUDE.md` gets one line on `engine/` from the orchestrator at the merge.
7. **The small order at the end of this file (invented names in the mock console feed) is taken now** as
   **S3-03**, on `main`, before S3-01b's rule on the cache number: its builder raises `CACHE` by one as orders
   did until then.
8. **Ten pushes each waiting for CI** is the proof the plan asks for, and S3-01b's five jobs make each wait
   about five minutes: part a starts only when S3-01b is on `main`.

## Why

`audio.js` is one function of 3,436 lines (`wc -l` at `ce55fa7`) that holds the signal arithmetic, the receiver's
gain, the mixer and the output, the network, the room's settings, the steam profile's timeline, three renderers
and the public surface. Every audio order of the last weeks changed it, so one could be built at a time, and each
builder and each reviewer read all of it.

The three audio orders that come next each change one or two of the stages (the section "What comes right
after" names the files). After the cut the builder of each reads the files of its stages, and its reviewer reads
a diff that cannot have touched the others.

What the cut does not give: those three orders depend on one another, so they are still built one after
another. The gain is in what each has to read and what each can break, not in building them side by side.

## What is true today

File and line are the session branch at `ce55fa7`. The builder works on a `main` that also has S3-01a and
S3-01b, which do not touch `audio.js`; if `git hash-object audio.js` there is not
`ec9780f401dd712f3db6c28cd27efd20570c1afa`, see "Stop and ask".

### The file

- `audio.js` is a comment (lines 1 to 33) and one function called at once, `(function () { 'use strict'; ... })();`
  (35 to 3436). Counted with a parser (espree, the function's direct statements): 135 statements that declare
  136 names, of which 87 are functions, 5 are `async` functions, 42 are `const` statements and one is a `let`
  (`opusModulePromise`, line 1025).
- It ends by building `TF2Audio` (3383 to 3430, 38 members) and attaching it to `window` if there is one, else to
  `self`, else to `globalThis` (3432 to 3434), and to `module.exports` under Node (3435).
- Its sections, by line: helpers 36 to 75; the FFT, the downmix, the resampler, the filters, the clip 81 to 325;
  the mixer and the output 327 to 767; the gain 769 to 919; the network 921 to 1021; the codec module's loader
  1023 to 1042; the profile's filters 1048 to 1062; the room 1064 to 1204; the frame codes 1206 to 1222; the
  steam profile 1224 to 1586; the stages a render keeps (W4-01b) 1588 to 1881; `process` 1981 to 2242; the WAV
  2244 to 2282; the stream forms of the arithmetic 2297 to 2402; the live chain 2404 to 2845; the stage wrappers
  of the render a piece at a time 2860 to 2935; `codecStage` 2936 to 3034; `createRender` 3067 to 3336;
  `codecResultInfo` 3338 to 3377.
- The banner at 1044 to 1046 says "Main processing function". The function it announced is 940 lines further
  down; what follows the banner is `firCache`.
- Seven statements read another of the function's names while the file loads (the parser's count; every other
  reference is inside a function body and is made when that function is called). Four read names declared just
  above them (`STEAM_SLOT` 1251, `STEAM_WAIT` 1294, `AFTER_A_OPTIONS` 1623, `READ_OPTIONS` 1638). The other three
  are the surface and its two attach lines.
- Functions are used before the line that declares them, which one function allows: `process` (1981) calls
  `sincLength` (2864) and `joinSamples` (3036); `steamLiveChain` (2438) calls `firStage` (2906).
- The function holds state that must exist once per load: `kernelCache` (the resampler's kernels), `firCache`
  (the profiles' filters), `opusModulePromise`, the two `WeakSet`s of W4-01b (`ENGINE_COUNTS`, `ENGINE_HELD`) and
  `microYield`, which is made at load from what the page has (`MessageChannel`, `setTimeout`).
- Nothing in it uses `this`, a function's `name` or a function's text. Read with the parser: no `this`
  expression; `.name` once, written to an error (1872); `toString` once, `Object.prototype.toString.call(value)`
  on a value (1714).
- It loads the codec module with `import('./opus-codec.mjs')` (1029). A script's `import()` is resolved against
  the script's own address, so the same line in a file under `engine/` would ask for `engine/opus-codec.mjs`.
  `app/source.js:352-353` avoids the question for its own imports with `new URL(..., document.baseURI)`, which a
  worker does not have.

### Who loads it

| Where | What | Line |
| --- | --- | --- |
| the page | six script tags, `audio.js` the sixth, after `constants.js`, `steam-sender.js`, the resampler, `room-presets.js`, `room-dsp.js` | `index.html:498-503` |
| the render's worker | `importScripts` of the same six, then five more | `audio-worker.js:14` |
| the live monitor's worker | `importScripts` of the same six | `live-worker.js:26` |
| the offline copy | `'./audio.js'` in `ASSETS`; `CACHE` is v35 | `sw.js:26`, `sw.js:16` |
| the Node suites | `ENGINE_FILES` in `tests/lib/engine.cjs` (S3-01a; on its builder's branch at `131a319` when this was written, not on `main`) | |
| the registered predictions | `MODEL_FILES`, nine files, `audio.js` the first | `tests/accuracy.mjs:318` |

The service worker asks the network first for code and markup and falls back to its copy (`sw.js:99-124`), so a
visitor who is online gets the page and its scripts from the network together.

S3-01a's helper joins the files' text into the body of one function and calls it with a fresh object as `window`
and with `self`, `module` and `setTimeout` undefined. Its suite, `tests/harness.verify.mjs`, holds `ENGINE_FILES`
to the page's tags and both workers' lists in order, and refuses a second list in any suite. S3-01b's `site`
suite derives the files the site needs from the page and holds `sw.js`'s list to them. So a file added to the
engine is added in five places (the tag, two `importScripts`, `ASSETS`, `ENGINE_FILES`) and a missing one fails
a quick suite.

### What uses `TF2Audio`

The shipped files call nine of the 38 members: `process`, `encodeWav`, `bufferToMono`, `resampleSinc`,
`previewAllowed`, `stagesHold`, `createLiveChain`, `roomPreset`, `toInt16`; `reference.js` also calls
`applyBiquad`, `biquadCoefs` and `resampleSinc` on the engine it is handed. The other members are there for the
suites and the tools (`createRender`, `createGain`, the mixer's functions, the stream forms). No file outside
`audio.js` can reach anything that is not a member.

### The model files of the registered predictions

`tests/accuracy.mjs:318` lists nine files; `tests/predictions/predictions.json` holds hashes for the seven that
existed at registration. The scorer names as changed every listed file whose hash is not the registered one
(`:355-356`), so a listed file that the registration lacks is named too. `tests/predictions/PREDICTIONS.md` has
one dated paragraph for each change since (lines 150 to 180), each beginning "Changed after registration,
<date>, before any predicted take existed:".

### Where the documents name it

A grep for `audio.js` over the repository gives the places in the table of "The documents" below. Two things
the brief expected are not so: `CLAUDE.md`, `docs/ACCURACY.md`, `docs/LIVE.md`, `docs/PAGE.md`,
`docs/PIPELINE.md` and the two agent files do not name `audio.js`; and no comment anywhere says "audio.js line
N" (`grep -rnE "audio\.js[: ]+(line )?[0-9]"` over the shipped files prints nothing).

## What the audit had wrong, or left out

- **Its lines and sizes are W4-01b's predecessor's.** `audio.js` was 3,052 lines and is 3,436. `process` was at
  1579 to 1867 and is at 1981 to 2242; `createRender` 2692 to 2961, now 3067 to 3336; `createLiveChain` 2217 to
  2470, now 2592 to 2845; `steamLiveChain` 2063 to 2211, now 2438 to 2586; the mixer 318 to 758, now 327 to 767;
  the surface 3008 to 3051, now 3383 to 3430.
- **Eight files do not hold the code.** The audit gives no file to what the steam timeline and all three
  renderers share about a profile and its codec: `loadOpusModule`, `profileEq`, `celtModeRate`, `FRAME_CODES`,
  `receivedCodecInfo`, `gateThresholdDb`, `DEFAULT_SENDER_GATE`. And its `render.js` "of about 900 lines" is
  1,149 lines today with W4-01b's stage code.
- **The import's address is not considered** (above). Moved as it stands into `engine/`, the loader asks for a
  file that does not exist.
- **"Attaching the way `steam-sender.js` does"** means to `self`, else to `this`. In the tests' helper `self` is
  hidden and `this` is Node's global object, so the engine's parts would be a global of the process, which the
  harness refuses for `TF2Audio` (its check 7). Decision 4.
- **C-03** (`VOICE_ENGINE.mixRate` has no reader) is true and was decided: W3-10 kept the field on purpose
  (`docs/reports/W3-10-output-stage.md:415`). **C-04** (the profiles' `status` field has no reader) is wrong: the
  suite of the `miles` profile (not in TF2) reads it and pins the profile's list of keys
  (`tests/miles.verify.mjs:232-235`), and `constants.js:292` documents the field.
- **P5's "one option resolver"**: W4-01b made one for `process` (`readOptions`, 1651). `createRender` (3073 to
  3100) and `createLiveChain` (2593 to 2613) still read their own options.
- **`steamGiveOut` in the network file**: it is the steam receiver's rule for when to give sound out, used by the
  steam timeline's two callers and not by the loss code. It stays with the steam profile.

## What was measured for this plan

On a copy of `ce55fa7` in scratch, split by a script into the ten files of "The cut" with the lists changed
(the prototype), and on an untouched copy beside it (the baseline). Every suite run went through the lock; the
machine was shared with S3-01a's build, so the times carry its load.

| What | Result | How |
| --- | --- | --- |
| the cut is closed | each of the ten files, and `audio.js` after each of the ten steps, uses no name it does not declare or take from an earlier file's part, except the page's globals; nothing taken is unused | the parser's scopes, on all ten intermediate states and the last |
| each step only moves | for each of the ten steps, `audio.js` before is `audio.js` after with the new file's lines put back in order | the tool of Appendix B, on the ten intermediate states |
| three quick suites | the whole output of `gain`, `output-stage` and the suite of the `miles` profile (not in TF2) is the same on the prototype and the baseline | `cmp` of the two outputs |
| `render-stream` | passes on the prototype, every recorded hash of `GOLDEN` and `GAIN_GOLDEN` included, and its two renders in a `vm` context; its output is the baseline's line for line once the times in the details are blanked | `diff` after `sed -E 's/[0-9.]+ (ms\|s)\b/T/g'` prints nothing |
| its time | 306.6 s on the prototype, 302.5 s on the baseline (load before: 1.50 and 1.02) | one run each, timed inside the lock |
| `stages` | passes on the prototype; its output is the baseline's line for line once the times are blanked; 252.7 s on the prototype, 237.4 s on the baseline (load before: 1.09 and 1.04) | one run each; the same `diff` |
| the browser suite | two runs on the prototype with `ce55fa7`'s own suite. One passed in 253.8 s (the baseline: 252.0 s) with the baseline's check names, `[Browser 4b]`'s offline render through the worker among them. One stopped at a check of `[Browser 3e]` (the second finding below) | the suite's Chromium |
| S3-01a's helper and its harness suite | with the prototype's files put on S3-01a's branch (`131a319`) and `ENGINE_FILES` changed, and nothing else in the tests, the harness suite passes; two loads have different parts, each frozen, 86 names in all; the process has no `TF2Engine`; each load's `loadOpusModule` gives the module it was loaded with | the suite; a short script through `loadEngine` |
| `tests/verify.js` and `tests/steam.verify.js` as S3-01a leaves them | the whole output of each is the same with and without the split; `steam` took 148.6 s with it and 153.2 s without | `cmp`, on S3-01a's branch |
| four fixed renders of 30 s of sound, through `process` | the medians with and without the split are within the spread of the same tree's three rounds, which is up to a tenth: the steam profile 1,559, 1,604 and 1,488 ms with it, 1,629, 1,472 and 1,564 ms without | three rounds of each tree in turn, five timed renders a round after two unmeasured |
| a fresh worker's start | later with the split by 19 to 27 ms without a service worker (medians 73.6 and 76.8 ms against 54.2 and 49.9 ms) and by 30 to 39 ms with the page's (105.3 and 111.1 ms against 75.0 and 72.4 ms) | the time from `new Worker('audio-worker.js')` to the reply of an `analyze` job of 4,800 samples, on the page served by the tests' server; two rounds of each tree, 35 starts a round after five unmeasured |

Two findings of these runs change the order:

1. **A fresh worker starts 19 to 39 ms later** (measured, above): it loads 21 scripts where it loaded 11, so each
   file costs 2 to 4 ms. The page starts a fresh worker for its first job, after a cancel that ended the worker,
   for a job asked for while the worker runs another that is not a render (`app/render.js:66-81`), and for each
   file of a batch. The live monitor's worker loads 16 scripts where it loaded 6; its start was not timed.
   Decision 17 accepts it.
2. **One check of the browser suite reads the meter before the meter has what it checks.** In `[Browser 3e]`
   (`tests/browser.verify.js:618-631`) the suite waits for the take's report and then reads the meter's rows at
   once, expecting "Δ real". The report comes from the page's worker; the row comes from a job that goes to a
   fresh worker because the page's is busy with the report (`app/realtake.js:130-131`, `app/meter.js:106-149`).
   Which comes first is a race. It was won on the baseline's one run and on one of the prototype's two, and
   lost on the other. Two runs do not give a rate; the later start of the fresh worker is inferred to make it
   worse.
   Decision 18 has the check wait for the row.

Not run: the other suites that load the engine in a `vm` context at `ce55fa7` (S3-01a replaces their loaders);
any suite on the nine intermediate states (only the static checks were run on those); anything in a browser
other than the suite's Chromium; Step 8's update path. The long suites' times differ by +1.4 % (`render-stream`),
+6.4 % (`stages`) and -3.0 % (`steam`) with the split, one run each on a machine another build was using; with
the fixed renders above, that is taken to be the machine and not the split.

## Decisions

Each with the alternative and why not.

1. **Ten files and `audio.js`, not eight.** The audit's eight plus `engine/codec.js` (what the renderers and the
   steam timeline share about a profile and its codec: 67 lines) and with the renderers in three files, not two:
   `engine/render.js` (`process` and the stages it keeps, 678 lines), `engine/render-stream.js` (`createRender`,
   `codecStage`, `codecResultInfo`, 471 lines) and `engine/live-chain.js` (485 lines). The three renderers do not
   call one another (the table of references below has no entry between them), so each is a file an order can
   own. *Not `process` and `createRender` in one file:* it would be the largest file by far, and the two are
   changed by different steps of the orders to come. *Not W4-01b's stage code in a file of its own:* `process`
   is its only user (`readOptions`, `stagePlan`, `heldValue` are called nowhere else), and its lists of options
   name what `process` reads, so an order that adds an option to `process` changes both. *Not three files (the
   arithmetic, the stages, the renderers):* the stages would be one file of 1,364 lines and the renderers one of
   1,634 (the sizes of the table below, added), and each order to come would change both.
2. **A folder `engine/`, and the names `render.js`, `render-stream.js`, `live-chain.js`.** `live.js` exists at
   the root and the documents cite it bare, so the live chain's file is not `engine/live.js`. `app/render.js`
   exists and the documents always write it with its folder; the engine's files are written with theirs too.
3. **The files share one object, `TF2Engine`, with one frozen part for each file; a file takes what it needs by
   name at its top.** `engine/dsp.js` makes the object; each file ends with `E.<part> = Object.freeze({ ... })`
   and begins with `const { clamp, finiteOr } = E.dsp;` for each earlier file it needs (Appendix A). The moved
   code then calls `clamp(...)` exactly as it does today, so no moved line changes, and what a file needs from
   the others is written in its first lines. *Not one global for each file:* ten names on the page where one
   will do. *Not the files' names as plain globals of the page (no wrapping function):* 136 names would join the
   page's, where `app/` declares its own (`clamp` is the kind of name two files choose), and the tests' helper
   would have to hide or hand in each. *Not the parts looked up at each call (`E.dsp.clamp(...)`):* every moved
   call would be edited.
4. **`TF2Engine` is attached as `TF2Audio` is: to `window` if there is one, else `self`, else `globalThis`.** On
   the page and in a worker that is the global object either way. In the tests' helper it is the fresh `window`
   of that load, so the parts of an engine belong to that engine, the helper can hand them to a suite, and no
   global is left in the process. *Not the audit's form (`self`, else `this`):* in the helper it is Node's
   global object. No render would differ (each file takes the object once, at its load), but the process would
   keep a global that the next load replaces, which is what the harness's check 7 refuses for `TF2Audio`. This
   departs from S3-01's Decision 3, which expected the split's files on Node's global as `steam-sender.js` is;
   that decision was written before the cut was made, and the helper needs no change for this one.
5. **The codec module's loader stays in `audio.js`; `engine/codec.js` holds one line that calls it.** The line is
   `const loadOpusModule = () => E.audio.loadOpusModule();`, and `audio.js` sets `E.audio` when it loads, after
   every engine file and before any render can start. It is the one reference from an engine file to a later
   file. *Not `import('../opus-codec.mjs')` in `engine/codec.js`:* that is right only if every browser resolves
   an `import()` in a script loaded by `importScripts` against that script's address and not the worker's;
   today the two addresses are in one folder, so no test of this project has ever told the two readings apart,
   and the suites run one browser. *Not the engine's files at the root (`engine-dsp.js`):* it removes this one
   line and puts ten more files beside the 22 scripts there.
6. **A suite reads a part and cannot replace one.** `loadEngine()` returns the parts as `engine.parts`
   (`window.TF2Engine`), so a suite can call a function that is not a member of `TF2Audio` once it is in a part's
   list. It cannot swap one for a double: the parts are frozen and every caller took its functions at load. That
   is what a suite could do before (the function was closed), and the three things suites do wrap keep their
   hooks in the helper (the codec module, `TF2Room`, `TF2_ROOM_PRESETS`). **To break one internal function, a
   suite or a reviewer edits a copy:** the files of `ENGINE_FILES` copied to a temporary folder (the harness's
   check 8 does it, folders included), one line changed in the engine file, and the engine loaded with `root`
   (or `TF2_DIR`, where the suite follows it). *Not parts left open so a test can assign into them:* an
   assignment would change nothing for the callers already bound, so the test would pass without testing.
7. **The moved lines are not edited, down to their indentation.** Each file is a function, so the code keeps its
   two spaces. Error messages that name `audio.js` stay as they are (`engine/room.js` will say "loaded before
   audio.js", which stays true, and the harness matches the message). Banners move with their sections. One
   thing is dropped: the stale banner at 1044 to 1046. Two comments that point by place across what becomes a
   file boundary are corrected afterwards, in the comments' commit (Step 6).
8. **One file a commit, in the order of what needs what:** `dsp`, `gain`, `mix`, `network`, `codec`, `room`,
   `steam`, `render`, `render-stream`, `live-chain`. A file then never needs a part that is still in `audio.js`,
   except the loader (Decision 5), and `audio.js` takes from the parts what its remaining code needs. *Not the
   largest first:* `process` needs 42 names of the seven files before it.
9. **The proof is in three layers** ("What could change with no hash moving" has the detail). A tool shows that a
   commit only moved lines. The parser shows that every name a file uses is its own, a part's, or the page's.
   And the suites' whole output is the same before and after: the two quick groups after every step, the three
   long suites at three points on the builder's machine, and all five groups in CI on every pushed step.
   *Not every suite on the machine after every step:* about 17 minutes a step for ten steps, where CI gives the
   same answer in about 5 while the next step is being made.
10. **The checks that hold the cut afterwards are in `tests/harness.verify.mjs` and read text, with no parser.**
    The parser is not a dependency of the repository and this order does not add one; it is used from the
    builder's machine for the build's proof. What stays in the suite is listed in Step 2.
11. **`MODEL_FILES` takes the engine's files from `ENGINE_FILES`.** The entries under `engine/`, then today's
    nine. A second written list would be the kind S3-01a removed, and the harness's check 3 would have to allow
    it. `predictions.json` is not edited: the scorer names the ten files as changed, which is the truth, and
    `PREDICTIONS.md` takes one dated paragraph (Step 7).
12. **The licence file goes into the offline list in a commit of its own**, with the `site` suite's allowance for
    it removed in the same commit, so the suite cannot go on excusing a file that is now listed.
13. **Of the audit's deletions, C-01 and C-05 are part b; C-02, C-03 and C-04 are left.** The section of part b
    gives each one's grep and reason.
14. **None of the audit's duplicates (C-09) is merged here.** Each is in the table of "Not in this order" with
    whether the hashes would hold and why it is left. Merging any of them is an edit, and this order's proof is
    that there are none.
15. **The names in the page's mock console feed are a separate order**, written at the end of this file. It does
    not depend on the split, a suite cannot judge whether a name is a real person's, it should not wait behind
    two orders, and it changes a shipped file's behaviour (what the page prints), which part a's proof says did
    not happen.
16. **The cache number is the orchestrator's** (S3-01b's rule). Part a adds eleven cached files (the ten and the
    licence file) and changes seven (`audio.js`, `index.html`, both workers, and the three whose comments are
    corrected), so `node tests/cache-number.mjs origin/main --report` will say the number must rise. The builder
    puts that line in the report and does not change the number.

17. **The later start of a fresh worker is accepted.** 19 to 39 ms, once for each worker, against a render that
    takes hundreds. *Not fewer files to save it:* each file is 2 to 4 ms, so the audit's eight would save about
    6 ms of it and one file is the only way to save all of it. *Not one joined file for the workers:* that is a
    build step.
18. **The check of `[Browser 3e]` waits for the row it reads, in a commit of its own before the moves** (Step 2b).
    Its name and its condition do not change. This is a line of the browser suite, which this order otherwise
    may not touch, so it **needs the orchestrator's ruling** (the hand-back's second question). *Not left as it
    is:* ten pushes each wait for a browser job that this check can fail for a reason that is not the push.

## The cut

### The files, in load order

Sizes are the prototype's, with each file's head and tail (`wc -l`). "Lines" are of blob `ec9780f4`; a file made
of several runs keeps them in `audio.js`'s order.

| File, part | What it holds | Lines of `audio.js` | Size |
| --- | --- | --- | --- |
| `engine/dsp.js`, `dsp` | signal arithmetic with nothing of the game in it: the seeded draw, the yield, the FFT, the downmix, the resampler, the filters, the clip, 16-bit rounding and the WAV, each whole and a piece at a time | 38-43, 45-325, 2244-2283, 2297-2352, 2385-2394, 2860-2935, 3035-3042 | 499 |
| `engine/gain.js`, `gain` | the receiver's gain | 769-919, 2353-2361 | 175 |
| `engine/mix.js`, `mix` | the mixer and the output stage | 327-767 | 456 |
| `engine/network.js`, `network` | loss and late frames: the retiming, the loss masks, the steam profile's loss by message | 921-1021, 1260-1280, 2362-2384 | 161 |
| `engine/codec.js`, `codec` | what the renderers share about a profile and its codec: the gate's defaults and threshold, the profile's filters, the frame codes, a demo's frame statistics, the call to the loader | 44, 1048-1062, 1205-1222, 1322-1331 | 67 |
| `engine/room.js`, `room` | the room's settings and what the mix is told | 1064-1204 | 156 |
| `engine/steam.js`, `steam` | the steam profile: its constants, its capture, its sender's options, its timeline, its codec information | 1224-1259, 1281-1321, 1332-1586 | 349 |
| `engine/render.js`, `render` | `process`, and the stages it keeps (W4-01b) | 1588-2242 | 678 |
| `engine/render-stream.js`, `renderStream` | `createRender`: the same render a piece at a time | 2847-2858, 2936-3034, 3043-3377 | 471 |
| `engine/live-chain.js`, `liveChain` | `createLiveChain`: the live monitor's chain | 2284-2295, 2395-2845 | 485 |
| `audio.js`, `audio` | the header, the codec module's loader, `TF2Audio` | 1-36, 1022-1042, 3378-3436 | 128 |

The eleven sizes add to 3,625 lines against 3,436: 189 lines of heads and tails. The names by file:

- **dsp:** `TAU`, `INT16_FULL_SCALE`, `clamp`, `finiteOr`, `gcd`, `mulberry32`, `microYield`, `fftInPlace`,
  `bufferToMono`, `besselI0`, `KAISER_BETA`, `ZEROS_PER_SIDE`, `kernelCache`, `resampleKernel`, `resampleSinc`,
  `resampleLinear`, `firwin2`, `applyFirZeroPhase`, `biquadCoefs`, `applyBiquad`, `hardClip`, `roundEven`,
  `toInt16`, `encodeWav`, `streamResampleSinc`, `streamBiquad`, `streamFir`, `sincWait`, `NO_SAMPLES`,
  `passStage`, `sincLength`, `cutAt`, `sincStage`, `firStage`, `biquadStage`, `dropStage`, `sampleStage`,
  `joinSamples`. The stage wrappers and `sincLength` and `joinSamples` are here, not with `createRender`, because
  `process` and the live chain call them too.
- **gain:** `GAIN_BLOCK`, `gainRule`, `receiverAutoGain`, `createGain`, `decodedFromFrames`, `gainLead`,
  `streamAutoGain`.
- **mix:** everything from 327 to 767 (`MIX_RATE` to `deviceRateOf`, 24 names).
- **network:** `RETIME`, `retimeSpurts`, `buildLossMask`, `streamLossMask`, `steamMessageLoss`, `steamLoser`.
- **codec:** `DEFAULT_SENDER_GATE`, `firCache`, `profileEq`, `celtModeRate`, `FRAME_CODES`, `receivedCodecInfo`,
  `gateThresholdDb`, and the one line of Decision 5.
- **room:** everything from 1064 to 1204 (`roomModule` to `tailAtDevice`, 8 names).
- **steam:** `STEAM_RATE`, `STEAM_VOICE_RATE`, `STEAM_FRAME`, `steamReach`, `STEAM_CONCEAL_MAX`, `STEAM_SLOT`,
  `STEAM_ROOM`, `steamFits`, `STEAM_WAIT`, `steamGiveOut`, `steamModules`, `steamCapture`, `steamSenderOptions`,
  `steamTimeline`, `steamCodecInfo`.
- **render:** everything from 1588 to 2242 (`AFTER_B_OPTIONS` to `process`, 21 names).
- **render-stream:** `codecStage`, `createRender`, `codecResultInfo`, and the banner "A render a piece at a time".
- **live-chain:** `outputWait`, `steamLiveChain`, `createLiveChain`, and the banner "Live chain".
- **audio.js keeps:** `opusModulePromise`, `loadOpusModule`, `realOpusRoundTrip`, `TF2Audio`.

### What each file takes from the others

Every reference across a file boundary, from the parser's scopes on the prototype: 175 names taken at a file's
top, and the one call of Decision 5. A part gives out 86 names in all; the other 50 of the 136 stay private to
their file.

| File | From | Names |
| --- | --- | --- |
| `gain` | `dsp` | `clamp`, `finiteOr` |
| `mix` | `dsp` | `gcd`, `roundEven` |
| `network` | `dsp` | `clamp`, `finiteOr`, `mulberry32` |
| `codec` | `dsp` | `clamp`, `finiteOr`, `firwin2` |
| `codec` | `audio` (at a render, not at load) | `loadOpusModule` |
| `room` | `dsp` | `clamp`, `finiteOr` |
| `room` | `mix` | `MIX_RATE` |
| `steam` | `codec` | `FRAME_CODES`, `gateThresholdDb` |
| `render` | `dsp` | `INT16_FULL_SCALE`, `applyBiquad`, `applyFirZeroPhase`, `biquadCoefs`, `bufferToMono`, `clamp`, `encodeWav`, `finiteOr`, `hardClip`, `joinSamples`, `microYield`, `mulberry32`, `resampleSinc`, `sincLength` |
| `render` | `gain` | `createGain`, `decodedFromFrames`, `gainLead`, `receiverAutoGain` |
| `render` | `mix` | `createMixStage`, `createOutStage`, `deviceRateOf`, `joinInts` |
| `render` | `network` | `buildLossMask`, `retimeSpurts`, `steamLoser` |
| `render` | `codec` | `DEFAULT_SENDER_GATE`, `celtModeRate`, `gateThresholdDb`, `loadOpusModule`, `profileEq`, `receivedCodecInfo` |
| `render` | `room` | `resolveRoom`, `roomPreset`, `tailAtDevice` |
| `render` | `steam` | `STEAM_FRAME`, `STEAM_RATE`, `STEAM_VOICE_RATE`, `steamCapture`, `steamCodecInfo`, `steamModules`, `steamSenderOptions`, `steamTimeline` |
| `render-stream` | `dsp` | `INT16_FULL_SCALE`, `biquadCoefs`, `biquadStage`, `clamp`, `dropStage`, `finiteOr`, `firStage`, `hardClip`, `joinSamples`, `microYield`, `mulberry32`, `sampleStage`, `sincLength`, `sincStage` |
| `render-stream` | `gain` | `createGain`, `decodedFromFrames`, `gainLead`, `streamAutoGain` |
| `render-stream` | `mix` | `createOutputStage`, `deviceRateOf`, `mixToFloat` |
| `render-stream` | `network` | `buildLossMask`, `steamLoser`, `streamLossMask` |
| `render-stream` | `codec` | `DEFAULT_SENDER_GATE`, `FRAME_CODES`, `celtModeRate`, `gateThresholdDb`, `loadOpusModule`, `profileEq`, `receivedCodecInfo` |
| `render-stream` | `room` | `resolveRoom`, `roomModule`, `tailAtDevice` |
| `render-stream` | `steam` | `STEAM_RATE`, `STEAM_VOICE_RATE`, `steamCapture`, `steamCodecInfo`, `steamGiveOut`, `steamModules`, `steamReach`, `steamSenderOptions`, `steamTimeline` |
| `live-chain` | `dsp` | `INT16_FULL_SCALE`, `biquadCoefs`, `clamp`, `finiteOr`, `firStage`, `hardClip`, `mulberry32`, `sincWait`, `streamBiquad`, `streamFir`, `streamResampleSinc` |
| `live-chain` | `gain` | `GAIN_BLOCK`, `createGain`, `streamAutoGain` |
| `live-chain` | `mix` | `MIX_BLOCK`, `MIX_RATE`, `createOutputStage`, `mixToFloat` |
| `live-chain` | `network` | `steamLoser`, `streamLossMask` |
| `live-chain` | `codec` | `DEFAULT_SENDER_GATE`, `FRAME_CODES`, `celtModeRate`, `gateThresholdDb`, `loadOpusModule`, `profileEq` |
| `live-chain` | `steam` | `STEAM_FRAME`, `STEAM_RATE`, `STEAM_VOICE_RATE`, `steamCapture`, `steamGiveOut`, `steamModules`, `steamReach`, `steamSenderOptions`, `steamTimeline` |
| `audio.js` | `dsp` | `applyBiquad`, `applyFirZeroPhase`, `biquadCoefs`, `bufferToMono`, `encodeWav`, `firwin2`, `hardClip`, `mulberry32`, `resampleLinear`, `resampleSinc`, `streamFir`, `streamResampleSinc`, `toInt16` |
| `audio.js` | `gain` | `createGain`, `decodedFromFrames`, `receiverAutoGain`, `streamAutoGain` |
| `audio.js` | `mix` | `createDeviceStage`, `createOutputStage`, `mixClip`, `mixDevicePosition`, `mixEntry`, `mixOut`, `mixUpsample2` |
| `audio.js` | `network` | `buildLossMask`, `steamMessageLoss`, `streamLossMask` |
| `audio.js` | `room` | `roomPreset` |
| `audio.js` | `steam` | `steamFits`, `steamGiveOut` |
| `audio.js` | `render` | `AFTER_A_OPTIONS`, `AFTER_B_OPTIONS`, `READ_OPTIONS`, `STAGE_OBSERVERS`, `previewAllowed`, `process`, `stageKeys`, `stagesHold` |
| `audio.js` | `renderStream` | `createRender` |
| `audio.js` | `liveChain` | `createLiveChain` |

A part's list is the names of this table's third column for that part, sorted, and no more: a name nobody
outside the file takes is not given out.

### What each file needs from the page

The names a file uses that no engine file declares (the parser's list, language names left out). Each is read
inside a function, behind `typeof` where the page may lack it, as today.

| File | Globals |
| --- | --- |
| `dsp` | `Blob`, `MessageChannel`, `WorkerGlobalScope`, `setTimeout` |
| `mix`, `network` | `VOICE_ENGINE` |
| `room` | `TF2Room`, `TF2_ROOM_PRESETS`, `LISTENER_POSITIONS` |
| `steam` | `TF2SteamSender`, `TF2Swresample` |
| `render`, `render-stream`, `live-chain` | `CODEC_PROFILES`, `VOICE_ENGINE` |
| `audio.js` | `TF2Opus` |
| `gain`, `codec` | none |

Every file also names `window`, `self` and `globalThis` in the one line that finds or attaches `TF2Engine`, and
`audio.js` names `module` in its last line, as it does today.

## What could change with no hash moving, and what catches it

| What | Why it could | What catches it |
| --- | --- | --- |
| the order the files load, in a worker or on the page | a file takes its parts at load, so a file loaded before one it needs throws there | it throws at load in every suite; the harness holds the page's tags and both workers' lists to `ENGINE_FILES` in order; its check of Step 2 (c) holds every part taken to an earlier file; the browser suite loads both workers |
| a name used before the file that declares it has loaded | one function let a line call a function declared further down; two files do not | the parser's list of each file's free names, after every step (none but the page's globals); a name that is in no earlier part fails Step 2 (c) |
| a `const` read while the file loads | seven statements do it (above) | four read their own file's names and three are in `audio.js`, which loads last; any other would throw at load |
| a value that is assigned again after it was taken | a name taken at a file's top is a copy; a later assignment in the giving file would not reach it | the function has one `let`, `opusModulePromise`, and it stays in `audio.js` with both lines that touch it; Step 2 (b) refuses a `let` at the top of an engine file |
| state that must exist once | a cache or a `WeakSet` declared in two files would be two | each moves once with its only users (`kernelCache` in `dsp`, `firCache` in `codec`, the two `WeakSet`s in `render`); the move tool fails when a line is in both files (its counts no longer add up) |
| `this` at the top of a file | in a function called plainly it is `undefined` under `'use strict'` | the code has no `this` (above); the files' own heads do not use it |
| strict mode | a file whose function lacks the directive runs its code sloppy: a write to an undeclared name would make a global instead of throwing | Step 2 (b) reads the directive in every engine file |
| a function's `name` or text | a check or a key that read it would see the same name; a moved function's text is the same text | nothing reads either (above); the names do not change |
| the address the codec module is loaded from | Decision 5 | the loader's line does not move; Step 2 (e) refuses `import(` under `engine/`; the browser suite renders through the worker, offline too |
| the parts shared between two engines in one process | only if they were attached to the process (Decision 4) | Step 2 (f): two loads have different parts, and the process has no `TF2Engine` |
| a `TF2Audio` with a member more or fewer, or in another order | the surface is rebuilt from the parts | Step 2 (a): the recorded list of the 38 names, in order |
| a file not in the offline list | the page then fails offline | the `site` suite; `[Browser 4b]` |
| a visitor who has old markup and new code for some minutes | the old page loads six scripts; the new `audio.js` needs ten before it and throws at its first line | no suite can; the service worker asks the network first for both, so it needs a cache between the visitor and the host to hand out one old file. Step 8 looks at what such a visitor sees, once |
| speed | a fresh worker loads ten more scripts; a first visit makes ten more requests; a name taken from a part is read from the file's own scope, as a name of the one function was | measured for this plan: a fresh worker starts 19 to 39 ms later (Decision 17); renders take the same time within the machine's spread. The page's first load was not timed |

The last row's first visit in figures: `audio.js` is 185,063 bytes and the prototype's eleven files are 194,908
(`wc -c`), so a first visit fetches 9,845 bytes more, in ten more requests, before anything is compressed. What
that does to the page's first load is inferred to be small and was not measured.

## S3-02a: the split

### What to build

**Step 1: before anything else.** On the branch's first commit, save the whole output of every suite and each
one's time: `node tests/run.mjs all` under the lock, and each suite's output on its own for the comparisons
below. These are "before". Save `audio.js` as "the old file". Check `git hash-object audio.js`.

**Step 2: the helper and the harness, one commit, no shipped file.** `tests/lib/engine.cjs`: `loadEngine()`
also returns `parts`, the load's `window.TF2Engine` (undefined until Step 4's first file). Its head comment
gains two sentences: the engine's own files find one another through `TF2Engine` on the load's `window`, so two
engines share none of them; `steam-sender.js` and the resampler still attach to Node's global object.
`tests/harness.verify.mjs` gains these checks. "The engine files" are the entries of `ENGINE_FILES` that begin
with `engine/`; with none (this step) each check holds trivially and `parts` must be undefined, and Step 4 makes
them bite one file at a time.

- (a) `Object.keys(engine.audio)` is, in order: `process`, `stagesHold`, `stageKeys`, `STAGE_OPTIONS`,
  `previewAllowed`, `encodeWav`, `toInt16`, `bufferToMono`, `resampleSinc`, `resampleLinear`, `firwin2`,
  `applyFirZeroPhase`, `hardClip`, `receiverAutoGain`, `createGain`, `decodedFromFrames`, `biquadCoefs`,
  `applyBiquad`, `mulberry32`, `buildLossMask`, `realOpusRoundTrip`, `createLiveChain`, `createRender`,
  `roomPreset`, `streamResampleSinc`, `streamFir`, `streamAutoGain`, `streamLossMask`, `steamGiveOut`,
  `steamMessageLoss`, `steamFits`, `mixEntry`, `mixUpsample2`, `mixOut`, `mixClip`, `mixDevicePosition`,
  `createDeviceStage`, `createOutputStage`. And `STAGE_OPTIONS` has the keys `afterB`, `afterA`, `observers`,
  `read`. The list is written out in the suite.
- (b) Each engine file, after its head comment, is one function in the form of Appendix A: it opens with
  `(function (root) {` and `'use strict';`, it sets its own part once (`E.<part> = Object.freeze({`), it sets no
  other, and no line of it begins with two spaces and `let ` or `var `.
- (c) In each engine file and in `audio.js`, every statement `const { ... } = E.<part>;` names a part whose file
  is earlier in `ENGINE_FILES`, and each name in it is an own key of that part in a loaded engine. (A name that
  is not there would be `undefined` and fail only when called.)
- (d) The loaded engine's parts are exactly one for each engine file and `audio`, each frozen; and the folder
  `engine/` holds exactly the engine files.
- (e) With comments taken out, no engine file holds `import(`, `importScripts`, `new Worker`, `new URL(`,
  `fetch(`, `require(` or `document`. No shipped file outside `engine/` and `audio.js` holds `TF2Engine` (the
  shipped files are `siteFiles(root)` of S3-01b), and no file under `tests/` but the helper and this suite.
- (f) Two engines loaded in one process have different `parts`; after both loads the process has no global
  `TF2Engine`; and each engine's `parts.codec.loadOpusModule()` gives the module that engine was loaded with.
- (g) S3-01a's check 3 also refuses, in any file under `tests/` but the helper, a quoted string of the form
  `engine/<name>.js`.

**Step 2b: one check of the browser suite waits for what it reads, one commit** (Decision 18; only if ruled).
In `verifyAverageAndRealTake` of `tests/browser.verify.js`, the meter's rows are read after the page has the
row "Δ real" or 60 s have passed, whichever is first: a `page.waitForFunction` on `#meter-rows tr th` whose
timeout is caught, then the read that is there today, moved out of the earlier `page.evaluate` or repeated
after it. The check's name and condition stay, so with no row after 60 s it fails as it does today.

**Step 3: the model files, one commit.** `tests/accuracy.mjs:318`: `MODEL_FILES` is the engine files of
`ENGINE_FILES`, then the nine names it has today, unchanged and in today's order. The helper exports the engine
files as a list of their own, so the folder's name is written in one place.
With no engine file yet the list is today's. `node tests/accuracy.mjs --help` still prints its help.
`tests/predictions/predictions.json` is not touched, in this step or any other.

**Step 4: the ten moves, one commit each, in this order.** For each file:

1. Create `engine/<file>.js` with the head of Appendix A (its `const { ... } = E.<part>;` lines are the rows of
   the table above where it is the first column), then the lines of the table of "The files", cut from
   `audio.js` in their order and not edited, then its tail (the part's names, sorted, capitals first).
2. In `audio.js`: the lines are gone, and the block of `const { ... } = E.<part>;` lines under `'use strict';`
   names what the code still in `audio.js` uses from the parts made so far. The first step also adds the line
   that finds `TF2Engine` (Appendix A). The header comment gains the file's line in a list "The engine's files,
   in load order", each with the one-line description of the table above.
3. The five lists gain the file, each just before `audio.js`'s entry: `index.html` (a script tag),
   `audio-worker.js:14`, `live-worker.js:26`, `sw.js` (`ASSETS`), `tests/lib/engine.cjs` (`ENGINE_FILES`).
   Nothing else names it: the `site` suite, the browser suite's lists and `MODEL_FILES` are derived.
4. Run the step's checks (below), commit, push, and wait for that commit's CI run to end before the next push.
   A newer push to a branch cancels the older run (the workflow's `concurrency` rule). The next step may be
   made while the run goes; it is not pushed until the run has passed.

| Step | File | Beyond the plain move |
| --- | --- | --- |
| 4.1 | `engine/dsp.js` | it makes the object: `const E = root.TF2Engine = {};`. `audio.js` gains the line that finds it. `DEFAULT_SENDER_GATE` (line 44) stays in `audio.js` until 4.5 |
| 4.2 | `engine/gain.js` | |
| 4.3 | `engine/mix.js` | then the first gate (below) |
| 4.4 | `engine/network.js` | `steamMessageLoss` and `steamLoser` (1260 to 1280) leave the middle of the steam section |
| 4.5 | `engine/codec.js` | the stale banner (1044 to 1046) is dropped; the file gains the comment and the line of Decision 5; `audio.js` gains `E.audio = Object.freeze({ loadOpusModule });` under `realOpusRoundTrip`. These four things are the only lines of the ten steps that are not moves; the move tool is told of them (`--but`) |
| 4.6 | `engine/room.js` | |
| 4.7 | `engine/steam.js` | then the second gate |
| 4.8 | `engine/render.js` | |
| 4.9 | `engine/render-stream.js` | |
| 4.10 | `engine/live-chain.js` | `audio.js` is now the header, the loader and the surface. Then the third gate |

**Step 5: the licence file, one commit.** `'./vendor/swresample/COPYING.LGPLv2.1'` joins `ASSETS` in `sw.js`,
after the resampler's line. In `tests/site.verify.mjs` the allowance "linked, opened online only" for it is
removed in the same commit; if that list is then empty it stays as an empty list with its comment.

**Step 6: comments, one commit.** Only comments change; the check is below.

- In shipped files outside the engine, the comments that name a function or a constant "in `audio.js`" name its
  file: `constants.js:291` (`mixUpsample2`, `engine/mix.js`), `:414` (`gainRule`, `engine/gain.js`), `:417`
  (`MIX_RATE`, `engine/mix.js`), `:421` (`createDeviceStage`, `engine/mix.js`), `:433` (the steam profile's loss
  by message, `engine/network.js`), `:484` (the room's three knobs, `engine/room.js`); `app/render.js:241` (the
  kept stages, `engine/render.js`) and `:330` (`gateThresholdDb`, `engine/codec.js`); `video.js:373` (`toInt16`,
  `engine/dsp.js`).
- Comments that say `audio.js` for the engine as a whole stay: `app/console.js:593`, `app/core.js:6` and `:14`,
  `app/render.js:295`, `:312` and `:800`, `app/rooms.js:107`, `constants.js:12`, `:520` and `:532`,
  `reference.js:8` and `:296`.
- In the engine's files, the two comments that point by place across a boundary: in `engine/mix.js`, "(a resolved
  room, below)" above `createRoomMix`'s caller becomes "(a resolved room, `engine/room.js`)"; in
  `engine/room.js`, "The mix stage is createRoomMix, above." becomes "... createRoomMix, in `engine/mix.js`."
  A third found while building is corrected the same way and named in the report.
- Not touched, though they mention `audio.js`: `opus-codec.mjs:583` and `:728`, `room-dsp.js:116`,
  `steam-sender.js:106` (files this order may not touch; each statement stays true of the engine as a whole or
  is named in the report as stale).

**Step 7: the documents, one commit** (the table of "The documents" below), and the paragraph for
`tests/predictions/PREDICTIONS.md`, after the last one there:

> Changed after registration, <the day the branch is handed back>, before any predicted take existed: `audio.js`
> changed for S3-02 and ten files were added to the hashed model files. The engine's code was moved, unedited,
> out of `audio.js` into `engine/dsp.js`, `engine/gain.js`, `engine/mix.js`, `engine/network.js`,
> `engine/codec.js`, `engine/room.js`, `engine/steam.js`, `engine/render.js`, `engine/render-stream.js` and
> `engine/live-chain.js`, which the page and both workers load before it. `audio.js` keeps the codec module's
> loader and builds `TF2Audio` from them, with the same members. `tests/accuracy.mjs` now hashes those ten files
> with the others (`MODEL_FILES`); `predictions.json` does not list them, so the scorer names them as changed.
> `constants.js` changed in comments only. No render changed: every recorded hash of
> `tests/render-stream.verify.mjs` (`GOLDEN`, `GAIN_GOLDEN`) and of `tests/stages.verify.mjs` is unchanged, and
> each engine suite's whole output is the same before and after (`docs/reports/S3-02a-engine-split.md`). The
> predictions were not rendered again.

The orchestrator sets the date to the merge's if it differs.

**Step 8: a visitor who already has the site, once, in scratch.** Not a suite: it needs two trees. With the
browser suite's Chromium and `tests/static-server.js`:

1. Serve `origin/main`'s tree from a scratch copy. Open the page, wait until the service worker controls it and
   its cache holds the list.
2. Stop the server. On the same port serve a scratch copy of the branch whose `sw.js` number is main's plus one
   (in the scratch copy only). Reload, online. The page has no page error, `Object.keys(TF2Audio)` is the list
   of Step 2 (a), and a file renders. Reload again once the newer worker has taken over: its cache holds every
   `engine/` file and the licence file, and the older cache is gone.
3. Go offline and reload: a file renders through the worker, and the licence link opens.
4. Then the case no suite can hold: serve main's `index.html` with the branch's other files, online, with no
   service worker (a fresh profile). Record what the page shows and the error in the console. This is what a
   visitor behind a cache that hands out the old page for some minutes would see until a reload.

The report gives the four results. Item 4 is for the orchestrator's merge note; it is not a failure of the
build whatever it shows.

**Step 9: the report**, `docs/reports/S3-02a-engine-split.md` (below, "The hand-back").

### Checks

"The tools" are the two of Appendix B, kept in the builder's scratch (the second needs the parser at the path
the brief gives; neither is committed). "The whole output" of a suite is everything it prints, standard error
included, with the times in the details blanked:

```sh
out() { "$@" 2>&1 | sed -E 's/[0-9.]+ (ms|s)\b/T/g'; }
```

- **Step 2.** `node tests/run.mjs harness site` passes. `git diff --stat origin/main` names no shipped file.
- **After each of the ten moves**, before the commit:
  1. `node moved.mjs <audio.js before the step> audio.js engine/<file>.js` says "a move" (for 4.5, with `--but`
     and that step's lines). It prints the new file's head and tail, which are read against Appendix A and the
     table of references.
  2. `node free-names.cjs . engine/<file>.js audio.js`: the free names of each are those of "What each file
     needs from the page" and no other, and nothing is declared at a file's top and never used.
  3. `node tests/run.mjs harness site` passes.
  4. `node tests/run.mjs units engine` passes, and the whole output of each of its suites is "before"'s: `diff`
     prints nothing. (About five minutes; S3-01's figures.)
  5. The commit names `audio.js`, the new file and the five lists, and nothing else (`git show --stat`).
  6. After the push: CI's run on that commit succeeds (all five groups). The report has the run for each step.
- **At the three gates** (after 4.3, 4.7 and 4.10), on the builder's machine under the lock: `render-stream`,
  `stages` and the browser suite pass, and the whole output of the first two is "before"'s. The browser suite's
  output is compared as check lines (S3-01a's `lines()`), since it prints times and sizes that move. The report
  gives each suite's time beside "before".
- **At the end of Step 4**, the moves taken together:
  - every line of the old file is in exactly one of the eleven files, except the three lines of the dropped
    banner: for each file, the old file's lines in the runs of the table of "The files", in order and with
    blank lines left out, are that file's lines between its head and its tail with blank lines left out (a
    short script the builder writes; its output is in the report);
  - `git diff -M --stat <first commit>..HEAD -- audio.js engine/` and
    `git diff --color-moved=dimmed-zebra --color-moved-ws=no <first commit>..HEAD -- audio.js engine/`, read by
    the builder and again by the reviewer: nothing but moved blocks, the heads, the tails and the four lines;
  - `git diff <first commit>..HEAD -- tests/render-stream.verify.mjs tests/stages.verify.mjs tests/predictions/
    vendor/ steam-sender.js voice-channel.js room-dsp.js opus-codec.mjs` prints nothing.
- **The checks of Step 2 are tested**, each on a scratch copy, each failing `node tests/run.mjs harness` or
  `site` with a message that names the file: two engine files swapped in `ENGINE_FILES`; two tags swapped in
  `index.html`; one file dropped from `live-worker.js`'s list; `'./engine/mix.js'` taken out of `ASSETS`; a name
  misspelled in one file's `const { ... } = E.dsp;`; a name removed from one part's list; `'use strict';` removed
  from one engine file; the attach line of every engine file and of `audio.js` changed to `steam-sender.js`'s
  form; `import('../opus-codec.mjs')` put into `engine/codec.js`; a file `engine/extra.js` that nothing lists;
  `createRender` removed from `TF2Audio`; two members of `TF2Audio` swapped; a quoted `'engine/dsp.js'` put into
  one suite. And for the suites: a copy with one sample-changing line broken in each of `engine/gain.js`,
  `engine/network.js` and `engine/steam.js` fails a suite that covers it (the report names the break and the
  suite).
- **Step 2b.** The browser suite passes three times running under the lock. With the meter's "Δ real" row
  taken out of a scratch copy of `app/meter.js`, the check fails by its name.
- **Step 5.** `node tests/run.mjs site` passes; with the line taken out of `ASSETS` again it fails and names the
  file; with the allowance put back it fails on the allowance. The browser suite passes.
- **Step 6.** For each file the commit touches, the code is the same with comments left out: the parser's
  tokens before and after are equal (`espree.tokenize`, one line of script in Appendix B).
  `node tests/run.mjs harness site` passes.
- **At the end:** `node tests/run.mjs all` passes under the lock; CI passes on the head;
  `node tests/cache-number.mjs origin/main --report` is in the report. The report also gives a fresh worker's
  start before and after, measured as in "What was measured" (the time from `new Worker('audio-worker.js')` to
  the reply of an `analyze` job of 4,800 samples, 40 starts, the first five left out).

### Files

May touch: `engine/` (the ten files, new); `audio.js` (lines out, the head's `const` block, the header's list,
the one `E.audio` line); `index.html` (ten script tags); `audio-worker.js:14`, `live-worker.js:26` (the lists);
`sw.js` (`ASSETS`: ten lines and the licence file's); `tests/lib/engine.cjs` (`ENGINE_FILES`, `parts`, the head
comment); `tests/harness.verify.mjs` (the checks of Step 2); `tests/site.verify.mjs` (one allowance out);
`tests/accuracy.mjs` (`MODEL_FILES`); `tests/browser.verify.js` (Step 2b's read, if ruled); `constants.js`,
`app/render.js`, `video.js` (the comments of Step 6); `tests/predictions/PREDICTIONS.md` (one paragraph added);
the documents of the table below, as it says for each; the report.

May not touch: any moved line (Decision 7); `TF2Audio`'s members or their order; `steam-sender.js`,
`voice-channel.js`, `room-dsp.js`, `opus-codec.mjs`, `vendor/`; `sw.js`'s `CACHE` line or its code;
`tests/predictions/predictions.json`; `GOLDEN`, `GAIN_GOLDEN` and every other recorded value; any check's name,
condition or detail in any suite but the harness's additions and the one allowance; `tests/browser.verify.js`
but for Step 2b's read; `.github/`; `package.json`; `docs/PROGRESS.json`; the rule files (`CLAUDE.md`,
`docs/PIPELINE.md`, `.claude/agents/`); built orders and reports, which are history.

### Stop and ask

- If `audio.js` on `main` is not blob `ec9780f4`: something changed it since this plan. Say what
  (`git log -3 -- audio.js`); the tables of "The cut" must be read again against it before any move.
- If the whole output of any suite differs from "before" in anything but a time. Report the suite and the line
  both ways; do not adjust a check.
- If the move tool says a step is not a move beyond the four things of 4.5, or a move needs an edit inside a
  moved line to work.
- If a file's free names include one that is not in the table "What each file needs from the page", or a file
  needs a name from a file later in the order other than the loader.
- If the harness or the `site` suite, as S3-01 built them, cannot hold one of the rules of Step 2 or Step 5 (for
  example the `site` suite refuses a folder, or reads `engine/` files' heads as a loading form).
- If either worker fails to load in the browser suite, or the suite's offline render fails.
- If `render-stream` or `stages` is slower than "before" by more than a tenth at a gate, on a machine no busier
  than it was for "before".
- If a fresh worker's start is later than "before" by more than 60 ms (this plan measured 19 to 39).
- If a check of the browser suite other than Step 2b's fails on one run and passes on the next: name it; do not
  go on re-running.
- If Step 8's first three items do not hold.

Needs no approval: merging `main` in; re-running a suite another job on the machine disturbed; re-running a CI
job that died before any test ran; the wording of a file's head comment; the breaks chosen to test the checks.

### The hand-back

The report says, in this order: the commits, one line each; for each of the ten moves, the move tool's line,
the free names, and the CI run; the whole-output comparison for each suite (same, or the lines that differ); the
times before and after of the three long suites at each gate; the breaks that tested the checks, with each
message; Step 8's four results; a fresh worker's start before and after; the cache tool's line; every place a
comment or a document was changed; what
was found stale and left; and what the builder would do differently.

## The documents

Every place outside the engine that names `audio.js`, from `grep -rn "audio\.js"` at `ce55fa7`. "Updates" are
part a's Step 7; a dated note is one line under the document's title or status line: "Note, <date>: `audio.js`
was split by S3-02; the function this document names is in the file `README.md`'s table of files gives for it.
The rest of this document is as written."

| Place | What it says | What happens |
| --- | --- | --- |
| `README.md:151` | the files table's row for `audio.js` | updates: the row becomes "builds `TF2Audio`; loads the codec module", and ten rows are added with the descriptions of "The files" |
| `docs/VOICE-PATH.md:13`, `:16`, `:18`, `:20`, `:84` | `audio.js` as the file of a stage | updates: the capture `engine/steam.js`; the network `engine/network.js`; the receiver's gain `engine/gain.js`; the mixer and the output `engine/mix.js`, `room-dsp.js`; line 84 `engine/mix.js` |
| `tests/README.md:36`, `:49` | the gain suite's "written apart from `audio.js`"; the stages suite's row | updates: `engine/gain.js`; `engine/render.js` where it means `process`. Its part on the helper gains one sentence on `parts` and on breaking a copy (Decision 6) |
| `docs/README.md:60`, `:98` | "the split of `audio.js`" as what two orders wait for | updates: both name S3-02; the builder adds the rows for S3-02a and S3-02b if they are not there |
| `tests/REFERENCE_2026.md:777` | "One function in `audio.js` serves the file render, the stream, the live chain" | updates, marked where it stands as that file's rule asks: `engine/gain.js` |
| `tests/REFERENCE_2026.md:1052`, `:1074` | dated entries | left |
| `audio.js:1-33` | the header: the path, in words | stays; the list of the engine's files is added under it (Step 4) |
| shipped files' comments | | Step 6 |
| `docs/work-orders/W3-02-receiver-queue.md` (the amendment: 34 mentions, its "Files" at 1018 to 1025, c-3 at 856) | `audio.js` as the file W3-02c-2 and W3-02c-3 touch, with line numbers | a dated note; W3-02c-2 is to be written as a short order against the files (the section after this) |
| `docs/work-orders/W2-03-long-render-page.md:51`, `W2-05-long-views.md:21`, `W2-06-video-from-file.md:25` | "May not touch: `audio.js`" and the like, in orders not built | a dated note each, which also says that the rule covers `engine/` |
| `docs/reports/bad-connections-plan.md:154`, `:199` | `audio.js` as BC-4's file | a dated note |
| built orders, `docs/reports/*`, `docs/PROGRESS-LOG.md` | history | left |
| `docs/PROGRESS.json` | five mentions | the orchestrator's |
| `CLAUDE.md`, `docs/PIPELINE.md`, `docs/ACCURACY.md`, `docs/LIVE.md`, `docs/PAGE.md`, `.claude/agents/*` | do not name `audio.js` | nothing. `CLAUDE.md`'s "Start here" may gain one line that the engine is `engine/` and `audio.js`, if the orchestrator wants it; the builder does not edit the rule files |

## S3-02b: the deletions

Each in a commit of its own, each with the grep that shows it dead, run again on the build's `main` (the greps
below are `ce55fa7`'s, over `*.js`, `*.mjs`, `*.html`, `node_modules` left out).

| Item | The grep | What |
| --- | --- | --- |
| **C-01** `realOpusRoundTrip` | `grep -rn realOpusRoundTrip`: `audio.js:1039` (its declaration) and `:3410` (the surface), and no other file, the suites included | **built only if the orchestrator rules that `TF2Audio` may lose a member nothing reads.** Then: the function and its comment go from `audio.js`, its name goes from the surface and from the harness's recorded list. `tests/predictions/PREDICTIONS.md` takes a paragraph (`audio.js` changed). Check: `node tests/run.mjs all`; the whole output of every suite but the harness is "before"'s |
| **C-02** `resampleLinear` | `audio.js:216`, `:3399`; `tests/verify.js:2269` | **left.** W3-10 kept it "exported as a utility" (`docs/work-orders/W3-10-output-stage.md:113`), and the one check that calls it holds a defect that was fixed (an empty input once gave one NaN sample). Removing it removes a check |
| **C-03** `VOICE_ENGINE.mixRate` | `grep -rn mixRate`: `constants.js:416`, `:440` and a comment at `audio.js:344` | **left.** No reader, and kept on purpose (W3-10's report, decision 7) |
| **C-04** the profiles' `status` | `grep -n "\.status" tests/miles.verify.mjs`: line 235 reads it; line 232 pins the keys of the `miles` profile (not in TF2) | **left.** It has a reader |
| **C-05a** `playheadFraction` | `grep -rn playheadFraction`: `app/visualizer.js:202` only | the function goes. Check: the browser suite's check lines are "before"'s |
| **C-05b** `els.consoleDetails` | `grep -rn consoleDetails`: `app/core.js:38` only. The element's id, `console-details`, is used by `index.html:475`, `style.css` and the browser suite and stays | the one line goes. Check: the same |

Files part b may touch: `audio.js` and `tests/harness.verify.mjs` (C-01, if ruled), `app/visualizer.js`,
`app/core.js`, `tests/predictions/PREDICTIONS.md`, the report. Stop and ask if a grep finds a reader this table
does not show. The cache number is the orchestrator's.

## What comes right after

For sizing, not a plan. The line counts are the prototype's.

| Order | What it does | Files after the cut | To read |
| --- | --- | --- | --- |
| **W3-02c-2** | the receiver's queue behind `opts.timeline`, in a render | `engine/steam.js` (`steamTimeline`), `engine/render.js` (`process`, and the lists of options read after each kept stage), `engine/render-stream.js` (`createRender`), `engine/gain.js` (`reset` taking the settings); one comment each in `engine/mix.js` and `engine/room.js`; the five lists, for `voice-channel.js` | 1,673 lines in four files, against 3,436 |
| **BC-4** | jitter as arrival delays | `engine/network.js`, `engine/steam.js`; the call sites of the masks in the three renderers | 510 lines in two files, and three call sites |
| **W3-02c-3** | the queue in the live chain | `engine/live-chain.js`, perhaps `engine/steam.js`; `live-worker.js` | 834 lines in two files |

W3-02c-2 is the test of the cut that it passes least well: it touches four files, because the timeline is
consumed by two renderers that are in two files. Putting both renderers in one file would make it three files
and 1,149 lines in the largest. The cut keeps them apart because the orders after W3-02c-2 touch one renderer
each.

## Not in this order

- **The audit's duplicates (C-09).** Each is left; "holds" says whether the recorded hashes would be expected to
  stay if it were merged, from reading, not from a run.

| Duplicate | Holds? | Why left |
| --- | --- | --- |
| 16-bit rounding written in several places | expected to | it is an edit of several moved lines, and one copy (`speexInput`) is in `opus-codec.mjs`, which this order may not touch |
| three FIR runners (`applyFirZeroPhase`, `streamFir`, `firStage`) | not expected to | they add their terms in different orders, and the sign of a zero differs; one runner would change low bits somewhere |
| `buildLossMask` and `streamLossMask` | no | they draw differently at a last packet that is not whole; they are two rules, not one written twice |
| `codecResultInfo` and the frame codes | expected to | the other half is in `opus-codec.mjs` |
| copies of `mulberry32` | expected to | the suites keep their own on purpose; two copies are in files this order may not touch |
| one option reader for the three renderers | not without care | `readOptions` reads every option once at entry for `process`; `createRender` and `createLiveChain` read theirs where they use them, and merging changes when an option is read, which W4-01b's keys depend on |

- **`createRender` with no caller on the page** (the audit's C-08): the owner's open decision. The cut puts it in
  a file of its own so that either answer is one file.
- **`room-presets.js` and `room-dsp.js` in `MODEL_FILES`**: they are engine files that the list lacks today.
  Adding them changes what a registration hashes; it is not a move.
- **A parser as a dependency of the repository**, to hold the cut's rules without text matching.
- **`TF2_DIR` followed by every suite** (S3-01's Decision 7): a reviewer who breaks a copy still has to know
  which suites follow it.
- **Splitting `constants.js`**, or `app/render.js`, or the browser suite.
- **Moving built orders into a folder of their own**: dropped by the orchestrator on 2026-11-12.

## A separate small order: invented names in the page's mock console feed (S3-03)

Not part of S3-02; written here because the brief asked for it. It can be built on `main` today. **Taken as S3-03 on 2026-11-12** (ruling 7 above). **Built and merged on 2026-11-12** (`11f430f`, cache v36, `docs/reports/S3-03-mock-names.md`): the class names and the role and status words stayed, every handle was replaced, and a browser check pins both lists by hash.

`constants.js` holds `TF2_DATA.playerNames` (lines 27 to 58), which `app/core.js:224-270` draws from to print a
mock server's lines in the page's console, and a list of chat lines after it. Some entries of the first are the
names of well-known people and some may be players' handles (lines 36 to 43 among them); one chat line (`:115`)
names a person. The order: replace the whole list of names with invented ones that could belong to nobody in
particular (the whole list, because nobody can tell which handles are someone's), and reword that chat line.
The order and its report cite entries by line and repeat no name. Class names, roles and plain words stay. One
commit. The check that covers it cannot judge a name, so it pins the result: a SHA-256 of the two lists as
shipped, written into a suite with no name in the test, so that a later change to either list is a decision
someone made; and the browser suite's check lines are the same before and after, since no check reads a name
(a script over the list at `ce55fa7`, printing positions only: one entry is a plain word that the suites quote
for other things, and no file under `tests/` quotes any other). `constants.js` is a model file, so
`tests/predictions/PREDICTIONS.md` takes a dated paragraph saying that no render depends on the lists. The cache
number is the orchestrator's. Files: `constants.js` (the two lists), one suite, `PREDICTIONS.md`, the report. A
reviewer reads the list that replaces it for the same thing: no entry that is, or reads as, a person.

## Appendix A: the form of a file

An engine file (here `engine/gain.js`; the head comment's first line is the description of "The files"):

```js
/* TF2 Voice Emulator, engine/gain.js: the receiver's gain.
 *
 * One of the engine's files (the list and the load order are in audio.js's header). It takes what it needs
 * from the files before it as TF2Engine's parts and adds its own. */
(function (root) {
  'use strict';
  const E = root.TF2Engine;
  const { clamp, finiteOr } = E.dsp;

  ...the moved lines, as they were...

  E.gain = Object.freeze({
    GAIN_BLOCK, createGain, decodedFromFrames, gainLead, receiverAutoGain, streamAutoGain
  });
})((typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis));
```

`engine/dsp.js` differs in one line: `const E = root.TF2Engine = {};`, and it takes nothing.

`engine/codec.js` has, after its moved lines:

```js
  // The codec module (opus-codec.mjs), by audio.js's loader: a script's import() is resolved against the
  // script's own address, and the module lies beside audio.js, not in this folder. audio.js loads after this
  // file and nothing calls this before a render.
  const loadOpusModule = () => E.audio.loadOpusModule();
```

`audio.js`, when the ten moves are done, is its header, then:

```js
(function () {
  'use strict';
  const E = (typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis).TF2Engine;
  const { applyBiquad, applyFirZeroPhase, biquadCoefs, bufferToMono, encodeWav, firwin2, hardClip, mulberry32,
    resampleLinear, resampleSinc, streamFir, streamResampleSinc, toInt16 } = E.dsp;
  ...one line for each part of the table of references...

  ...lines 1023 to 1042 of the old file, as they were...
  E.audio = Object.freeze({ loadOpusModule });

  ...lines 3379 to 3436 of the old file, as they were...
```

A blank line follows the last `const { ... }` line of every head; the move tool takes a file's head to end
there.

## Appendix B: the two tools

Kept in the builder's scratch. The first needs nothing but Node. The second needs espree and eslint-scope, which
are on the build machine at the path the brief gives and are not dependencies of the repository.

**`moved.mjs`: a step only moved lines.**

```js
// node moved.mjs <audio.js before> <audio.js after> <the new engine file> [--but <file of lines>]
// A step only moved lines if audio.js as it was is audio.js as it is with the new file's body put back in, every
// line in its old order. Blank lines and each file's head (through its imports) and tail (its exports) are left
// out. --but names a file of lines the step is allowed to add or drop (one a line). Exits 1 if it is not a move.
import fs from 'node:fs';
const args = process.argv.slice(2), at = args.indexOf('--but');
const but = new Set(at < 0 ? [] : fs.readFileSync(args[at + 1], 'utf8').split('\n').filter((l) => l.trim()));
const [before, after, made] = args.slice(0, 3).map((f) => fs.readFileSync(f, 'utf8').split('\n'));
const blank = (l) => l.trim() === '';
const strict = (lines) => lines.findIndex((l) => l.trim() === "'use strict';");
// After the import block: from the first blank line after 'use strict'.
const afterHead = (lines) => { let e = strict(lines) + 1; while (e < lines.length && !blank(lines[e])) e++; return e; };
const keep = (lines) => lines.filter((l) => !blank(l) && !but.has(l));
const a = keep(before.slice(afterHead(before))), b = keep(after.slice(afterHead(after)));
let t = made.length - 1; while (t > 0 && !/^  E\.[A-Za-z]+ = Object\.freeze\(\{$/.test(made[t])) t--;
const h = afterHead(made), m = keep(made.slice(h, t));
console.log(`audio.js: ${a.length} lines before, ${b.length} after; the new file's body: ${m.length}`);
// Is a an interleaving of b and m, each in its own order?  reach[j] : a[0..i) = b[0..i-j) with m[0..j)
let reach = new Uint8Array(m.length + 1); reach[0] = 1;
let ok = a.length === b.length + m.length, stuck = 0;
for (let i = 0; ok && i < a.length; i++) {
  const next = new Uint8Array(m.length + 1); let any = 0;
  for (let j = Math.max(0, i - b.length); j <= Math.min(i, m.length); j++) if (reach[j]) {
    if (i - j < b.length && b[i - j] === a[i]) { next[j] = 1; any = 1; }
    if (j < m.length && m[j] === a[i]) { next[j + 1] = 1; any = 1; }
  }
  if (!any) { ok = false; stuck = i; }
  reach = next;
}
console.log(ok ? 'a move: every line that left audio.js is in the new file, in order, and nothing else changed'
  : a.length !== b.length + m.length ? `NOT a move: ${a.length} is not ${b.length} + ${m.length}` : `NOT a move: stuck at line ${stuck} of the old body: ${a[stuck]}`);
console.log('--- head of the new file\n' + made.slice(0, h).join('\n') + '\n--- its tail\n' + made.slice(t).join('\n'));
process.exit(ok ? 0 : 1);
```

For 4.5 the file given to `--but` holds seven lines: the dropped banner's dashes line and its text line, the
three comment lines and the line of Decision 5, and the `E.audio` line. A line in that file is left out of all
three files, so on that step no banner's dashes line is compared; the check at the end of Step 4 covers them.
The body counts on this plan's prototype, for comparison (the tool's first line): dsp 444, gain 153, mix 422,
network 141, codec 41, room 133, steam 324, render 634, render-stream 429, live-chain 446.

**`free-names.cjs`: what a file uses and does not declare, and what it takes and does not use.**

```js
// node free-names.cjs <root> <file>...   (PARSER is the folder that holds espree and eslint-scope)
const fs = require('fs'), path = require('path');
const espree = require(process.env.PARSER + '/espree');
const scopeLib = require(process.env.PARSER + '/eslint-scope');
const LANGUAGE = new Set(('Array ArrayBuffer DataView Error Float32Array Float64Array Infinity Int16Array Int32Array JSON Map Math NaN ' +
  'Number Object Promise RangeError Set TypeError Uint16Array Uint8Array WeakSet undefined').split(' '));
const root = process.argv[2];
for (const file of process.argv.slice(3)) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = espree.parse(src, { ecmaVersion: 2022, range: true, loc: true });
  const sm = scopeLib.analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
  const free = new Map();
  for (const r of sm.globalScope.through) if (!LANGUAGE.has(r.identifier.name)) (free.get(r.identifier.name) || free.set(r.identifier.name, []).get(r.identifier.name)).push(r.identifier.loc.start.line);
  const unused = [];
  for (const scope of sm.scopes) if (scope.type === 'function' && scope.upper === sm.globalScope) {
    for (const v of scope.variables) if (v.name !== 'arguments' && v.references.filter(r => !r.init).length === 0) unused.push(v.name);
  }
  console.log(`${file}\n   free: ${[...free].map(([n, l]) => `${n} (${l.length > 3 ? l.slice(0, 3).join(',') + ',…' : l.join(',')})`).join(', ') || 'none'}\n   declared at the top and never used: ${unused.join(', ') || 'none'}`);
}
```

Every file's list of free names also has `window`, `self` and `globalThis`, from the line that finds or attaches
`TF2Engine`; `audio.js` has `module` too, as it does today. On this plan's prototype every file's second line is
"none".

**Comments only (Step 6):** the code tokens of a file at two commits are equal.

```sh
tok() { git show "$1:$2" | node -e "const e=require(process.env.PARSER+'/espree');let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(e.tokenize(s,{ecmaVersion:2022}).map(t=>t.value))))"; }
diff <(tok HEAD~1 constants.js) <(tok HEAD constants.js)
```
