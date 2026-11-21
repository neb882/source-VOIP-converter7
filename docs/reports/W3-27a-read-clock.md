# W3-27a: the read clock beside the one that runs

The build report for W3-27a of `docs/work-orders/W3-27-sender-clock.md`, branch `claude/w3-27a-read-clock` (from
`main` `cee35a5`, the orchestrator's commit `f0a8aab` first). Nothing calls the new clock and no render changes.

## What changed

| File | Change |
| --- | --- |
| `steam-sender.js` | `STEAM_SENDER.clock`, frozen: the rule's numbers, each with its standing in a comment, and the six `mix` values in a frozen `mix` member; `createReadClock`, the rule with its options, returning a frozen `{ next(), lead, place }`; a fourth export; one paragraph and one line in the header |
| `tests/steam-sender.verify.mjs` | the order's checks 1 to 12 as new sections after the existing ones; the export list of the first check; a paragraph in the header; two imports (`execFileSync`, the generator) |
| `tests/steam-sender/README.md` (new) | what each file of the folder is, whose it is, how the vector is made |
| `tests/README.md` | the suite's row: the new sections, and its time (41 s) |
| `tests/predictions/PREDICTIONS.md` | one dated line in the form of W3-21's |

`createClock`, `createSender`, every existing constant, `tests/steam-sender/gen.mjs` and `vector-seed1.json` are
as they were. No line of the existing sections changed but the list of exports.

## How the port is held to the reference

The suite imports `tests/steam-sender/gen.mjs` and runs it beside `createReadClock` in one Node process
(Node 22.23.4), so `Math.log`, `Math.cos` and `Math.sqrt` are the same on both sides. With `place: 0`, `since` is
`Object.is` to the reference's `time / 1000`, and `samples` and `by` are equal, at every read: seeds 1 to 400 of
2,000 reads, and 200,000 reads at each of nine settings. The port gave this at the first run, with every sum
grouped as "The rule" writes it (measured). Check 1 first runs `gen.mjs` as a program and compares its output
with `vector-seed1.json` byte for byte, so the generator the port is held to is the study's.

## Where the build differs from the order's sketch, and why

| The order | Built | Why |
| --- | --- | --- |
| check 2: "eight settings" of "Precision" | nine: seeds 1, 2 and the default at the default options; at seed 1, 20 ms packets, a lateness of 20 ms, 30, 60 and 144 frames a second, a tick of 30 ms | the list in "Precision" names nine, as the order's section "After the plan review" now says. The first build ran the six option settings at the default seed; fix round 1 moved them to seed 1, as that section has it |
| check 3: "300 seeds of 20,000 reads at four settings" | one loop shared with check 6, at check 6's four settings | check 3 names no settings; the fourth of check 6's (30 frames a second, 20 ms packets, a lateness of 31.25 ms) is the one that asks for four steps most often |
| check 4 | also compares the reads with the reference's at every place, and runs the drawn place beside 0 to 7, the steps then computed with the suite's own fifth draw | so that check 4 by itself catches the place's draw moved before the anchor's, which the order names as its break |
| check 8: "12.5% at every place and no lag-2 autocorrelation" | each place 12.0 to 13.0%, lag 2 within 0.02 of 0 | the order gives no band; chosen, about ten standard errors of 400,000 chunks |
| check 5: the phase `time − since` equals the seventh draw | `time === phase + since` at every one of the first 1,000 reads of seeds 1 to 200 (fix round 1; the first build tested the first read only) | `time − since` is the draw to the last bit only at a clock's early reads, since the sum rounds ("After the plan review") |
| check 11 | also `place` −1, and `seed` as `NaN`, a string or `null`; and the ends of each range taken | cheap, and a refusal is only half a range check |
| `STEAM_SENDER.clock`: "the six `mix` values" | in the object, as a frozen member `mix` | check 12 then holds them as numbers, not only as a comment |
| `tests/README.md`: "a row for the new sections" | the suite's existing row extended | the table has one row a file; the voice-channel row is the precedent |
| "The capture's phase against the sound": the lead over seeds 1 to 100,000 "each 87 to 166 times" | each 77 to 168 times (measured, check 5) | 87 to 166 is the lead as the fifth draw of `P` (computed), which it was in the first prototype, with no place; with the place drawn the lead is the sixth draw, as "The rule" has it. The check asks only that every value from 0 to 749 occurs, and it does |

**Fix round 1** (the order's section "After the plan review (2026-11-21)", on `main`):

- **The slip's standing.** The comment on `STEAM_SENDER.clock.slip` now says fitted (on Set J's reads), with the
  spread measured beside it, 1.5 ms, counted twice. The first build had "measured once", from the order's table,
  which the plan review found wrong against the record's paragraph of 2026-11-21.
- **The limit of three at the ends of the ranges.** The comment on `maxSteps` and a new check of section 3 give
  my own counts, on the reference at seed 1 over 2,000,000 reads: the limit binds 6,215 times at 10 frames a
  second with a tick of 100 ms, 20 ms packets and a lateness of 31.25 ms; 4,862 at 30 frames a second with those
  packets and that lateness; 34 with 10 ms packets and a lateness of 31.25 ms (measured once). At the default seed
  the same runs give 7,361, 4,845 and 53. The plan review's counts are 5,693, 4,595 and 39; its seeds are not
  given, and the count moves with the seed. At every setting what is left over is one step, the next read takes
  it, and nothing is carried twice. The new check runs the first setting at seed 1 against the reference: the
  limit binds 6,215 times, the reference's steps less the port's never leave more than one step over, never for
  two reads running, and no read is above 2250 samples.
- **The invariant's margin.** Check 6 now prints its least margin on reads that bring a chunk, by setting, over
  300 seeds of 20,000 reads (measured): 2.68 samples at the defaults, 7.01 with 20 ms packets, 1.63 with a
  lateness of 0, 24.78 at 30 frames a second with 20 ms packets and a lateness of 31.25 ms. On any read, an empty
  first one included, it is 1.25. The order's "by at least 1.6 samples" is the margin of an empty first read in
  the prototype's runs.

Two figures of the suite differ a little from the order's, both inside their bands: the ratio of long to short
places with 20 ms packets is 1.98 (the order's 2.02), and a lateness of 20 ms gives 196 empty reads after the first
chunk in 400,000 (the order's 211). Both are measured on seeds 1 to 20; the order's are the prototype's.

## The checks, and the breaks that each caught

Every break was made on a copy of `steam-sender.js`, of the suite or of `gen.mjs` in the scratch folder, never in
the worktree, and run through the suite with `check` changed to report a failure and go on, so that every check a
break fails shows. The table names the checks that failed. "c7" is the statistics, "c10" the other senders.
Nothing of the worktree was changed by a break, so there was nothing to undo there; the copies were thrown away.

| Check | Break | Failed |
| --- | --- | --- |
| 1, the reference is the study's | `pass` 50.5 in a copy of `gen.mjs` | 1, and 2, 3 and 4 (the copy no longer agrees with the port) |
| 2, the port is the reference | the wait not truncated | 2, 3, 4, and c7's mean, under 49 ms, window, off after on, chunks, reads a second |
| | a wake that ends the pass at any time | 2, 3, 4, c7 (every row), 9, 10 |
| | the slip drawn again when a pass waits again | 2, 3, 4, c7's mean, window, off after on, reads a second |
| | the timer's steps counted from the due time | 2, 3, 4, c7 (most rows), 10 |
| | `tolerance` 0 | 2, 3, 4, c7's mean (56.05), under 49 ms, window (66.97), off after on (45.36), chunks, reads a second; 10; 12 |
| | a fetch for every frame | 2, 3, 4, c7 (window 30.64%, and most rows), 10 |
| | the capture's packet rounding left out | 2, 3, the second computation of 4, c7's places (12.52% at place 0), 9, 10 |
| | the grouping of `readT`, of a timeout's end `q`, of the first other wake and of a later one | each 2 and 4 (and 3 for three of them) |
| 3, three steps at most | the limit taken out | 3, all three checks (read 9,858; the ends of the ranges; a read over 2250 samples at 30 frames a second, 20 ms packets, 31.25 ms) |
| | a read after one the limit bound limited to two steps (fix round 1) | the check at the ends of the ranges (672 steps carried twice) |
| 4, the place | `place` added to the packet count | 4's second computation, c7's places, 9 |
| | the place's draw moved before the anchor's | 2, 3, 4 (both), 5 |
| 5, the draws | the lead from the capture's draw | 5 (the lead and the place) |
| | the time summed in ms, `(1000 × phase + readT) / 1000` (fix round 1) | 5 (the phase at every read) |
| 6, never ahead of the capture | the lateness drawn from −5 ms | 6 (at the defaults), and 2, 3, 4 |
| 7, the statistics | no timer steps (a timeout an even 0 to 15.625 ms after its due time, drawn each pass) | 2 to 4, c7 (mean 55.04, window 58.47, off after off 23.03, 107 to 111 ms 13.4%, and others), 10 |
| | a timer step of 15 ms / 16 ms | 2 to 4, c7 (mean 54.21 / 55.88, 107 to 111 ms 5.95 / 20.58%, and others), 10, 12 |
| | a pass of 49 ms / 51 ms | 2 to 4, c7 (under 49 ms 10.50 / 0.07%, mean 54.50 / 56.70, reads a second 18.35 / 17.64, and others), 10, 12 |
| | a wake that ends the pass 2 ms early | 2 to 4, c7 (least 46.56 ms, under 49 ms 7.45%, and others), 10 |
| | no spread of the read in its pass | 2 to 4, c7's under 49 ms (0.00%), window, off after off, 107 to 111 ms |
| | no fetch by the game | 2 to 4, c7 (window 30.50%, and most rows), 10 |
| | a slip of 2.6 ms | 2 to 4, c7 (107 to 111 ms 38.66%, and others), 12 |
| | 12 other wakes a second | 2 to 4, c7 (off after off 12.24%, and others), 10, 12 |
| | a lateness of 0 / of 13 ms | 2, 4's second computation, c7's chunks and pairs (and for 13 ms, three-step chunks at the two after, 0.648%), 10, 12 |
| 8, the old clock through the counting | the place counted from the chunk's index and not from the steps (in the suite's counting) | c7's places (12.50% at place 0), 9. Check 8 itself passes: the old clock is flat at every place whatever the counting; this is the break of check 7 kept as a check, as the order puts it |
| 9, 20 ms packets | the packet length not reaching `ready()` | 2 (the 20 ms setting), 3, 9 (both) |
| 10, the other senders | `fps` read and not used / `tick` / `late` | 2, and 10's 30 and 60 frames a second / its tick of 30 ms / its lateness of 20 ms (and 3 for `fps` and `late`) |
| 11, refusals | the range of `tick` not checked; the check of `place` taken out | 11 |
| 12, the module | `STEAM_SENDER.clock` not frozen | 12 |

**Three breaks moved no read, so no check could see them** (measured, the same runs):

- The product in the slip, `2 * Math.PI * v` against `2 * (Math.PI * v)`: a product by 2 is exact in floating
  point, so the two are the same number (arithmetic). It is not a sum, and the order names sums.
- The grouping of `ready()`: `(capPhase + (A − B))` against `((capPhase + A) − B)`, with `A` the packet's end and
  `B = 31.25 × place`. At place 0 `B` is 0 and the two are the same (arithmetic); at other places `A − B` is a
  multiple of 0.25 ms and the two differ, if at all, in the last bit.
- The lateness's sum regrouped, `(t − capPhase) + late × C() + capPhase`: the step's time moves by a last bit,
  and a read moves only if the read's time falls within that bit of it (a chance of the order of 1 in 10^13 a read,
  as "Precision" says).

So "the grouping of any sum" holds for the sums on the reads' times (`readT`, a timeout's end, the other wakes),
each of which fails check 2. In `ready()` the grouping is as written and the reads cannot show it; the
reference's own `readyOf` is `capPhase + packet × pk + lateness` with no place, which the port gives exactly at
place 0.

## What did not move

- `flock /tmp/tf2ve-heavy.lock node tests/render-stream.verify.mjs --hashes`, before any change (at `f0a8aab`) and
  after the build (at `f4d2d70`, the module and the suite): the same output, byte for byte, 24,226 bytes, SHA-256
  `f73fee8b488eca1fd3c5d750a7af135a885c00b58c3486e9f850f701608ccc0f` both times (the run's own timing lines left
  out). No render and no recorded hash moved. The two outputs are kept in the scratch folder of the brief.
- Fix round 1 changed no line of `steam-sender.js` but comments (`git diff f4d2d70 8afcc7a -- steam-sender.js`:
  every changed line is a comment). A third `--hashes` run was queued behind the shared lock, which another
  job held for over 20 minutes, and was stopped before it ran; CI's `render` and `stages` jobs, which hold the
  recorded hashes, passed on `8afcc7a`.
- The existing sections of `tests/steam-sender.verify.mjs` pass with no line changed but the list of exports.

## Commands and results

- `pnpm test steam-sender harness site`: 3 of 3 suites passed (`steam-sender` 39.8 s).
- `node tests/steam-sender.verify.mjs`: every check passed; 43 s alone after fix round 1 (about 12 s before W3-27a).
- CI on `cc5d04a` (run 44852582270, the `tests` workflow): `units`, `engine`, `render`, `stages` and `browser`
  succeeded, and `verify` succeeded. After fix round 1, on `8afcc7a` (run 44855908938): every job and `verify`
  succeeded.
- `node tests/cache-number.mjs origin/main --report`: "cached files changed since origin/main (ad6eda5):
  steam-sender.js / cache number against origin/main (ad6eda5): the number is v54, not above v54: it must rise".
  `sw.js` was not touched: the orchestrator raises the number at the merge.
- The branch's diff and commit messages were scanned for recordings, personal details, SteamIDs and model names:
  none but the commit trailers.

## Not done

- The browser suite and the whole `pnpm test` were not run locally: no file the page, a worker or the engine
  runs changed in behaviour, and CI ran both on the branch's head.
- Main was not merged into the branch (the brief). `origin/main` has moved to `ad6eda5` since `cee35a5`.
- Nothing of W3-27b.
