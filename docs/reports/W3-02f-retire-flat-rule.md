# W3-02f: the flat re-timing rule taken out of the engine

The builder's report. The order is part W3-02f of
[docs/work-orders/W3-02ef-lane-and-flat-rule.md](../work-orders/W3-02ef-lane-and-flat-rule.md), with the
orchestrator's rulings and the section "After the plan review (2026-11-13, the orchestrator)", points 1 to 4.
Branch `claude/w3-02f-retire-flat-rule`, from `main` at `81718a9`, with `main` at `c15a575` (documents only)
merged in. The brief named this file; the order's table names `docs/reports/W3-02f-flat-rule.md`.

**Status:** built. Every check of "Done means" that can run before the push ran and passed (below); each of the order's seven breaks, and the plan review's break of the stage keys, was made and seen to fail its named check. CI is read after the push (point 6).

## What changed

| File | Change |
| --- | --- |
| `engine/network.js` | `RETIME`, `retimeSpurts`, their comment and the export go; the header line no longer names the retiming |
| `engine/render.js` | `retime` leaves `AFTER_B_OPTIONS` (and so `READ_OPTIONS`); the rule's seed, both calls, the copy of the samples made for it (the frame path takes `b.samples`), `codecInfo.retimed`, the test in `previewAllowed`, `seedNumber` and the unused `retimeSpurts` and `STEAM_FRAME` imports go; `copyInfo(b.info)` stays; the comments that named re-timing (the option lists, `copyInfo`, `previewAllowed`, the option's documentation, `timeline`'s documentation, kept place B) say what is true now |
| `engine/render-stream.js` | the refusal, the sentence in `createRender`'s documentation and the clause in the block comment go; `steamGameTimeline` is called without `retime` |
| `engine/steam.js` | `steamGameTimeline` loses its `retime` member, its refusal and the clause of its comment; `steamTimeline` loses `spans` (the array, its three writes, the member `spans()` and the comment's mention) |
| `audio.js` | the header's line for `engine/network.js` (comment only) |
| `reference.js` | the comment above `track()` (comment only): within a spurt the delay shortens because the receiver drops one sample from every packet and skips what overflows its ring, any size; the voice path has no 256-sample step (read; finding 10) |
| `tests/verify.js` | section [10c] rewritten under its label, "opts.retime is no longer read"; the header's line; `isDeepStrictEqual` from `util` |
| `tests/steam.verify.js` | the two blocks of the rule go; nothing else changes |
| `tests/stages.verify.mjs` | `retime` leaves `ENGINE_OPTION_NAMES` and its case leaves `ENGINE_OPTION_CASES`; the comment over `RENDER_OPTION_NAMES` and the one at the head of section 3 (the plan review's point 4); the block on what is kept (below); `previewAllowed`'s check; the header's item 3. The fuzz step's `retime: true` stays |
| `tests/render-stream.verify.mjs` | the refusal check and its comment go; the two cases' name loses "there" |
| `tests/render-channel.verify.mjs` | the row `'retime on'` leaves section 8; a check in its place |
| `tests/retiming.mjs` | the header's sentence only: "the flat rule the app ran until W3-02f, kept here as a copy" |
| `README.md`, `docs/ACCURACY.md`, `docs/VOICE-PATH.md` | the files table's row, the table row's name, one clause |
| `tests/REFERENCE_2026.md` | three statements marked where they stand ("This flat rule is what the app runs today", the row "Voice channel", "Talk-spurt timing"), nothing deleted, no figure changed |
| `tests/predictions/PREDICTIONS.md` | one "Changed after registration" paragraph after BC-4a's. "Results" still says "Not recorded yet" |

Nothing under `app/`, no page file, no live-chain file and `sw.js` not at all.

### The new and changed checks

- **`tests/verify.js` [10c].** The section's source (eight noise bursts) at seed 3, on `steam` and on `celt_22` with
  the gate on. (1) `process()` with `retime: true` gives the WAV bytes and `codecInfo` of `process()` without it,
  and neither `codecInfo` has a member `retimed`. (2) `createRender()` with `retime: true`, pushed in pieces of
  0.37 s, does not throw; its WAV bytes and `codecInfo` are those of `createRender()` without `retime` and of
  `process()` without it (the plan review's point 3: the check names both). On `main` all four fail: the rule moves
  three spurts on each codec and `createRender` throws (run with `TF2_DIR` at a copy of `main`).
- **`tests/stages.verify.mjs`, the block on what is kept.** The frame path: the render that kept B, written into
  (`frameLog`, `frameBytes`, `modes`), then a render made from B, its hashes taken and then written into the same
  way, then a third render; B is reused by each render after the first (2), and the second and third are a fresh
  render's. `steam`: the same with three renders, the second written into (`frameLog`, `sender.spurts`); B reused
  2 times. Then the new check: for `celt_22` and `steam`, with a stages object of its own warmed by the render
  without `retime`, the render with `retime: true` takes neither A nor B (as `zzNew` does) and its WAV and
  `codecInfo` are a fresh render's with `retime` and a fresh render's without it (the plan review's points 1
  and 2).
- **`tests/stages.verify.mjs`, section 4.** `{ retime: true }` leaves the refused list; the check's name loses
  "re-timing" and gains the term `previewAllowed({ ...SOURCE_BASE, retime: true })` is true.
- **`tests/render-channel.verify.mjs`, section 8.** `timeline: 'game'` with `retime: true` gives the `'game'`
  render's WAV and `codecInfo` hashes from `process()` and from `createRender()`. `:331-333` keeps its assertion
  `!('retimed' in g)`.

## Done means

| | Command | Result (last lines) |
| --- | --- | --- |
| 1 | `grep -rniE "re-?tim" engine audio.js`; `grep -n "spans" engine/steam.js engine/render.js`; `grep -rn "seedNumber" engine` | each prints nothing |
| 2 | `node tests/run.mjs verify render-channel` | `verify engine passed 9.5`, `render-channel engine passed 86.2`, "2 of 2 suites passed" |
| 3 | `flock /tmp/tf2ve-heavy.lock node tests/run.mjs steam stages render-stream` | `steam passed 132.8`, `render-stream passed 301.4` (601 checks), `stages passed 238.9` (354 checks), "3 of 3 suites passed" |
| 4 | `flock /tmp/tf2ve-heavy.lock pnpm test` | "27 of 27 suites passed. 1045.6 s summed" |
| 5 | `CHROMIUM_EXECUTABLE=... flock /tmp/tf2ve-heavy.lock pnpm test:browser` | "501 browser checks passed", "1 of 1 suites passed. 382.5 s" |
| 6 | CI's `verify` on the branch's head | read after the push of this report, on the head that carries it; the result is in the hand-back (a later documents-only commit would start no run) |

After those runs one detail string of the warm-stages check changed (it says "differs" only when the hashes
differ, and not when only the counts fail); `stages` was run again under the lock: "354 stages checks passed, 0 failed", "1 of 1 suites passed. 234.2 s". Every recorded
render of `tests/render-stream.verify.mjs` passed untouched, and the two cases with `retime` on a demo's voice and
with the codec skipped pass as they are.

## The breaks

Each was made in a copy of the worktree in the scratch folder, the worktree's suite run against it with
`TF2_DIR`, seen to fail the named check, and thrown away; the worktree never held a break.

| Break | The check that failed |
| --- | --- |
| the frame path's call put back (`retimeSpurts` restored in `engine/network.js`, the call after `gainLead`, and `retime` on `READ_OPTIONS`) | `tests/verify.js` [10c], `celt_22 with the gate on: process() with retime true gives the WAV bytes and codecInfo of process() without it` ("8 spurts; 3 moved"); the `steam` checks passed |
| the `steam` path's call put back (`engine/network.js` and `engine/steam.js` of `main`, so `spans()` is there; the call after `steamPlayedInfo`; `retime` on `READ_OPTIONS`) | `tests/verify.js` [10c], `steam: process() with retime true ...` ("8 spurts; 3 moved"); the `celt_22` checks passed |
| `createRender`'s refusal put back | `tests/verify.js` [10c], `createRender() with retime true does not throw ...`, on both codecs (the `RangeError`) |
| `steamGameTimeline`'s refusal put back (with `retime` passed again by both renderers) | `tests/render-channel.verify.mjs` [8], `timeline 'game' with retime true: the 'game' render's WAV and codecInfo, from process() and from createRender()` (both throw) |
| `retime` put back on `AFTER_B_OPTIONS` | `tests/stages.verify.mjs` [2], `every option the page sends has a changed value here, and every name the lists hold ... is one the page sends, the engine's own, ...`; also [2] `each option process() reads ... is changed alone` ("missing: retime") and [3] the new warm-stages check (B taken) |
| `previewAllowed` refuses `retime` again | `tests/stages.verify.mjs` [4], `previewAllowed() allows nothing else: ... retime ... is allowed` ("{ ...SOURCE_BASE, retime: true } refused") |
| the stage keys leave `retime` out (`&& name !== 'retime'` in `keysOf`, `engine/render.js:193`, the plan review's break) | `tests/stages.verify.mjs` [3], the new check `retime, which the engine no longer reads, with warm stages of the same source: neither A nor B is taken ...` ("as fresh ... B taken 1" on both paths: the hashes alone would have passed); `zzNew`'s check beside it passed, as the plan review found |

One thing the order's table does not say: putting back a call of the rule alone does nothing, since `process()`
reads each option into `o` from `READ_OPTIONS` and `retime` is no longer on it. The two breaks of the calls
therefore also put `retime` back on `READ_OPTIONS` (not on `AFTER_B_OPTIONS`, which is a break of its own); the
refusals read `opts.retime` directly and needed nothing more.

## The lines of "What is there today" that were not as written

Every place the order names was where it says, at `81718a9`, with these differences:

- the rule's comment and function in `engine/network.js` run to `:85` with the closing brace (the plan review's
  point 4); `reference.js`'s 256-sample statement is at `:453`, inside the comment at `:451-455`;
- `engine/render.js:12` also imported `STEAM_FRAME` for the rule alone; it went with it;
- on the frame path the "B taken twice" of "The tests", 3, held only with the re-timed render in the block; without
  it B is reused once, so the block now makes three renders on each path (the plan review's point 2);
- the head of section 3 of `tests/stages.verify.mjs` (`:264-266`) said its base fed "re-timing below"; it now says
  only the `celt_22` render (the plan review's point 4 allows it).

Seen and left, outside the order's list: `tests/REFERENCE_2026.md`, finding 19's paragraph at `:1074` still says
"**Talk-spurt timing → TF2 re-timing** (`voice_retime 1`) applies this finding". The page has not offered that
since W3-02d-1, and the engine no longer has it; the order marks three other statements and not this one, so it is
left for the orchestrator.

## For the orchestrator

- W2-04's point 2 (streaming the flat rule) is void: the rule is gone.
- The cache number must rise at the merge: `node tests/cache-number.mjs origin/main --report` printed
  `cached files changed since origin/main (c15a575): audio.js, engine/network.js, engine/render-stream.js,
  engine/render.js, engine/steam.js, reference.js` and `cache number against origin/main (c15a575): the number is
  v45, not above v45: it must rise (node tests/cache-number.mjs origin/main --set)`. The builder did not set it.
- No recorded hash, reference or tolerance changed: `git diff origin/main -- tests/` holds the removed and rewritten
  checks above and no recorded value (no hash or tolerance line in it).
- `git diff origin/main --stat -- app index.html live.js batch.js audio-worker.js live-worker.js` is empty, and
  `git diff origin/main -- tests/retiming.mjs` is the header's sentence alone.
- The branch's diff and its commit messages were scanned for what CLAUDE.md's hard rules forbid (recordings,
  personal details, SteamIDs, model names): nothing but the commit trailers.

## What was not done

- The cache number (the orchestrator's, at the merge).
- The reviewer's attacks were not run by the builder beyond the checks above: `retime: 1` and `'x'`, the codecs
  other than `steam` and `celt_22`, the live chain (which never read the name) and the page's old names.
- The stale sentence of finding 19 at `tests/REFERENCE_2026.md:1074` (above) is left.
- `git diff origin/main -- tests/` was read for recorded values by eye and by a search for hash and tolerance lines;
  none changed.
