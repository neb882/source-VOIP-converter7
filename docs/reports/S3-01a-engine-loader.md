# S3-01a: one engine loader in each suite's own realm; the steam sections in their own file

The builder's report. The order is `docs/work-orders/S3-01-test-harness.md`: its head, the rulings of 2026-11-12,
"What is true today", "Decisions" and section S3-01a. Branch `claude/s3-01a-engine-loader`, from `ce55fa7` (W4-01b
merged, cache v35), which is `main` now; merging `origin/main` was a no-op.

**Status:** built. Every converted suite prints the same check lines before and after; the six `vm` loaders and five
of the one-function loaders print the same output byte for byte, and `render-stream` and `stages` differ only in the
seconds their details print. The steam sections moved unedited. No file the site ships changed, no recorded value
moved, and no check's name, condition or detail changed.

## What was built

| Commit | What |
| --- | --- |
| `04d83df` | `tests/lib/engine.cjs`, the one loader, and `tests/harness.verify.mjs`, its suite (Steps 1 and 2) |
| `df0f66c` | `tests/verify.js` through the loader; its header says what it covers, by label (Step 3) |
| `aca5c11` | `audioEngine()` goes from `tests/reference.compare.mjs`; it, `reference`, `demo` and `video` call `loadEngine` |
| `67cb0e6`, `59ec7a2`, `91d75ed`, `806facb` | `opus`, `speex102`, `formats`, `gain-exact` through the loader, one commit each |
| `6921e02` | the five one-function loaders: `gain`, `miles`, `output-stage`, `render-stream`, `stages` (Step 4) |
| `1692a46` | `harness.verify.mjs` joins `pnpm test` in front of `verify.js` (once every suite is converted, so it passes) |
| `131a319` | Step 5: the three steam sections to `tests/steam.verify.js`, the six shared helpers to `tests/lib/signals.cjs` |
| this commit | Step 6: `tests/README.md`, `CLAUDE.md`'s commands block, the README's section "Tests", this report |

**The loader.** `loadEngine({ root, codec, TF2Room, TF2_ROOM_PRESETS })` joins `constants.js`, `steam-sender.js`,
`vendor/swresample/swresample.js` and `audio.js` into the body of one `new Function` whose parameters are `window` (a
new object, which receives `TF2Audio`), `TF2Opus`, `TF2Room`, `TF2_ROOM_PRESETS`, and, all undefined, `self`,
`module`, `setTimeout`, `Buffer`, `global`, `setImmediate`, `clearImmediate`, `require`, `process`. The body returns
the eleven tables of `constants.js` and a getter and setter of `TF2Opus`, which become `engine.codec`. `room-dsp.js`
and `room-presets.js` are required from `root` unless given; `null` makes them absent. `engineSource(root)` is the
joined text, `sourceRoot()` is `TF2_DIR` or the repository. `ENGINE_FILES`, `HANDED` and `TABLES` are exported for the
harness.

**Choices the order left open.**

- The suites that loaded no room module (`reference`, `demo`, `video`, `opus`, `speex102`, `formats`, `gain-exact`,
  `gain`, `miles`, `output-stage`) now load the engine with the default, the modules present, as the order's helper
  describes. None renders a room, and every one prints the same output as before.
- `stages.verify.mjs` hands its own `roomModule` and `roomTable` to the loader by name, so the names its text and
  render-stream's signals section use mean what they meant (Node loads a module once, so the default would be the same
  objects).
- In `render-stream.verify.mjs`, `engineInThisRealm(false)` hands `null` for both room names, as the order says.
  Nothing between its `signals` and `helpers` comments changed (the section's SHA-256 is the same at `ce55fa7` and at
  the head). Three comments outside it that said the other suites use a `vm` context were corrected.
- `gain-exact.mjs` keeps its local `loadEngine()` (its `--takes` path calls it) as a one-line wrapper over the helper's,
  imported as `loadShared`.
- Imports left unused by the conversion went (`vm` everywhere; `fs` in `verify.js`, `opus`, `formats`, `gain`,
  `output-stage`, `render-stream`; `here` in `gain-exact`). One check line's condition changed text through a name the
  loader gave: `verify.js` [2] `check('steam has no decoder EQ', engine.CODEC_PROFILES.steam.decoderEq == null)`, for
  `vm.runInContext('CODEC_PROFILES.steam.decoderEq', sandbox) == null`, as the order lists (line 1855).
- `harness.verify.mjs` [2] holds `TABLES` to every top-level declaration of `constants.js` (`const`, `let`, `var`,
  `function`, `class`), not only the `const`s, since any of them would be a global the engine shares.
- `harness.verify.mjs` [3] allows, besides the order's three, `tests/lib/engine.cjs` itself.

## Checks

"The check lines" are the order's: lines that begin with `ok` or `FAIL`, standard error included, times blanked,
sorted. Every run below was alone under `flock /tmp/tf2ve-heavy.lock`, on this machine (four cores, other agents'
sessions idle or waiting on the same lock); "before" at `ce55fa7`, "after" at `131a319` (`verify.js` unsplit at
`1692a46`).

### Steps 3 and 4, each suite before and after

| Suite | Check lines before / after | Whole output | Before (s) | After (s) | Load before the run |
| --- | --- | --- | --- | --- | --- |
| `verify.js` (unsplit) | 285 / 285, same | identical (321 lines) | 458.4 | 149.5 | 0.30 / 1.08 |
| `reference.verify.mjs` | 43 / 43, same | identical | 35.8 | 19.2 | 1.08 / 1.22 |
| `demo.verify.mjs` | 36 / 36, same | identical | 1.8 | 1.1 | 1.09 / 1.28 |
| `video.verify.mjs` | 46 / 46, same | identical | 0.5 | 0.4 | 1.21 / 1.21 |
| `opus.verify.mjs` | 149 / 149, same | identical | 7.6 | 5.0 | 1.55 / 1.23 |
| `speex102.verify.mjs` | 86 / 86, same | identical | 9.6 | 4.3 | 1.13 / 1.14 |
| `formats.verify.mjs` | 68 / 68, same | identical | 0.6 | 0.6 | 1.23 / 1.15 |
| `gain-exact.mjs --synthetic` | none (its one result line) | identical | 0.7 | 0.3 | 1.28 / 1.50 |
| `gain.verify.mjs` | 103 / 103, same | identical | 8.9 | 9.4 | 1.21 / 1.02 |
| `miles.verify.mjs` | 73 / 73, same | identical | 11.2 | 13.2 | 1.21 / 1.12 |
| `output-stage.verify.mjs` | 103 / 103, same | identical | 8.2 | 9.0 | 1.13 / 1.54 |
| `render-stream.verify.mjs` | 553 / 553, same | same once times are blanked (102 lines differ in a time) | 302.0 | 311.1 | 1.15 / 1.41 |
| `stages.verify.mjs` | 331 / 331, same | same once times are blanked (3 lines) | 238.9 | 238.4 | 1.12 / 1.09 |

`miles` was 2.0 s (18%) slower on its first after-run, which is past the order's stop line (a tenth and a second).
Run again three times each, alternating, under the lock (the order allows re-running a disturbed suite): before 12.1,
11.3, 11.9 s; after 11.7, 11.8, 11.5 s; every output identical to the first. The first after-run was disturbed; there
is no slowdown. Every other suite is within a second of its before-time or faster; `render-stream` is 9.1 s (3%)
slower, `gain` 0.5 s and `output-stage` 0.8 s.

### Step 5, the split

- The check lines of `verify.js` at `ce55fa7` (285) are, sorted, the check lines of `verify.js` (134) and
  `steam.verify.js` (151) at `131a319` taken together: `diff` prints nothing. The times: 9.2 s and 144.6 s.
- The moved text: the block from `/* ---------------- the steam profile (W3-11a) ---------------- */` to the end of
  `liveSteamSection` (1,638 lines) is a substring of `steam.verify.js`, and each of the six helpers is a substring of
  the old `verify.js`. `git diff --color-moved=plain 1692a46 131a319` shows 1,683 lines as moved out and 1,693 as moved
  in; the only lines it shows as added or removed are the new heads of `steam.verify.js` and `signals.cjs`, their
  `main` and exports, `verify.js`'s header and its `require` of `signals.cjs`. No line inside a moved section changed.
  The move was made by a script (cut and paste of text, nothing edited); the two calls left `verify.js`'s `main`.

The machine was restarted once during the runs; every run cut off by it was discarded and made again (the browser
suite's and `pnpm test`'s had finished before it; the `miles` reruns were made after it).

### Steps 1 and 2, the harness broken on purpose

`node tests/harness.verify.mjs` passes (18 checks, 0.4 s). Each break was made in a copy and fails it:

| Break | What fails |
| --- | --- |
| `ENGINE_FILES` with its first two entries swapped | [1], the page's tags and both workers |
| `<script src="room-presets.js">` removed from a copy's `index.html` (`TF2_DIR`) | [1], `index.html`'s first script tags |
| `fs.readFileSync(new URL('../audio.js', ...))` put back into `formats.verify.mjs` | [3], naming `formats.verify.mjs:20` |
| the helper's setter made to do nothing | [4] two checks, [5] two checks |
| `audio.js`'s `loadOpusModule` made to keep the first module it was given | [5] two checks |

### Each suite against a broken engine

One run each, with `audio.js` broken in a place the suite covers: through `TF2_DIR` for the suites that follow it (run
from the head's worktree, pointing at a broken copy), otherwise in a worktree of the head and put back.

| Suite | Break in `audio.js` | Result |
| --- | --- | --- |
| `harness` | `loadOpusModule` keeps the first module | 2 FAIL ([5]) |
| `verify.js` | `resampleSinc` one sample longer | 5 FAIL ([1] lengths) |
| `steam.verify.js` | the steam render finds no `TF2SteamSender` | stops: "The steam profile needs steam-sender.js ..." |
| `gain.verify.mjs` | `createGain().process` halves its output | 9 FAIL |
| `gain-exact.mjs --synthetic` | `receiverAutoGain` changes one sample | "gain-exact --synthetic: FAIL" (2 samples differ) |
| `output-stage.verify.mjs` | `mixEntry` negated | 17 FAIL |
| `render-stream.verify.mjs` | `mixEntry` negated | 172 FAIL |
| `stages.verify.mjs` | `mixEntry` negated | 144 FAIL |
| `reference.verify.mjs` | `mixEntry` negated | stops at "Real take: a take of the render lines up with the source" |
| `demo.verify.mjs` | the demo lane reports one frame more | stops at "and its codec lane is the demo's frames" |
| `video.verify.mjs` | `resampleSinc` 1% longer | stops at "A 96 kHz render goes into a MOV at 48 kHz" |
| `opus.verify.mjs` | the settings' `bits` held at 16 | stops at "Quality changes the actual encoder bitrate" |
| `speex102.verify.mjs` | the speex profile routed to the Opus round trip | stops (Opus refuses 11025 Hz) |
| `formats.verify.mjs` | `toInt16` one above | stops at "toInt16 matches the WAV conversion at full scale" |
| `miles.verify.mjs` | the miles profile routed to the Opus round trip | stops (Opus refuses 11025 Hz) |

Three first choices did not fail their suite and were replaced: `mixEntry` negated for `demo` (its checks compare
levels and the lane, not the sign), `resampleSinc` one sample longer for `video` (its length check allows 1 ms), and
the encoder's bitrate doubled for `opus` (its renders are `steam`, which does not take that path); a second choice for
`opus`, the steam render's own `bits`, did not fail it either.

### No recorded value moved

- `git diff ce55fa7 --stat -- tests/predictions/ vendor/ '*.js' ':!tests'` prints nothing.
- `git diff ce55fa7 -- tests/render-stream.verify.mjs` changes nothing inside `GOLDEN` or `GAIN_GOLDEN`.
- No file the site ships, `tests/browser.verify.js`, `tests/accuracy.mjs`, `.github/` or `docs/PIPELINE.md` changed.

### Whole runs

| Run | Before (`ce55fa7`) | After (`131a319`) |
| --- | --- | --- |
| `pnpm test`, this machine | 1,255.6 s (20 min 56 s), passed, load 1.43 | 863.4 s (14 min 23 s), passed, load 0.97 |
| browser suite, this machine | not run (no file of its reach changed) | 243.4 s, 409 passed, load 1.81 |
| `pnpm test` on CI | 17 min 34 s (run 43167163758) | 8 min 5 s (run 43168386839, attempt 1); 13 min 51 s (attempt 2) |
| browser suite on CI | 3 min 43 s, passed | attempt 1 failed one check (below); attempt 2 4 min 8 s, passed |
| the suites S3-01a did not touch, on CI | 93 s | 63 s (attempt 1), 112 s (attempt 2) |

The last row is the control: GitHub's runners differ from run to run by as much as this change, so CI's whole times
compare runs, not code. Per suite on CI (attempt 2 against `ce55fa7`): `verify.js` 448.9 s became 9.3 s and
`steam.verify.js` 138.4 s; `reference` 34.0 to 18.8; `opus` with `gain-exact` 7.8 to 6.0; `speex102` 9.2 to 4.4.

**CI's first attempt on `131a319` failed one browser check** that S3-01a does not reach: [Browser 10], "a worker that
does not answer a cancel is ended after the bound (1.4 s for 60 s) and replaced" (`1 workers, 1 source messages ...;
undefined`: no replacement was logged). The page's files are those of `ce55fa7`, whose run passed it; the check races
a 60 s render against a 1.4 s bound on a runner that was a third faster than usual. Re-run, the job passed. It is a
timing check of W4-01b's; I did not change it.

## Documents

- `tests/README.md`: the CI paragraph (the times above, with the control), the table's times (CI's at `131a319`,
  attempt 2), the `harness.verify.mjs` and `steam.verify.js` rows, `verify.js`'s row without its steam sentence, the
  sentence on the long suites, and a paragraph on how the suites load the engine.
- `CLAUDE.md`'s commands block: `pnpm test` 8 to 14 minutes on CI; `pnpm test:all` 12 to 22; the long suites named.
- `README.md`, section "Tests": 12 to 22 minutes.

## Found in the order on today's main

- The order's line numbers are main's at `9e0abd0`; each place was read again on `ce55fa7`. `tests/verify.js`'s are
  right there (the steam block 183 to 1819, the calls at 2097 and 2371). Moved by W4-01b: `audio.js`'s room message
  is at line 1079 (the order: 1070), its `TF2Opus` lookup at 1027 (1026); `stages.verify.mjs` reads render-stream's
  signals section at lines 88-92 (83-87); `browser.verify.js` reads `RENDER_OPTION_NAMES` at 2776 (2723-2724).
- `stages.verify.mjs` prints 331 checks at `ce55fa7`, not 297.
- "What is true today", the times: `pnpm test` here was 20 min 56 s at `ce55fa7`, against the order's 19.
