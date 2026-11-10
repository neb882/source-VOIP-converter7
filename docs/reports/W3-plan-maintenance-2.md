# The plan, brought up to date with the new order of work

Docs only, 2026-11-10, the second maintenance pass of the day (the first is
`docs/reports/W3-plan-maintenance.md`). Since that pass W3-11a, W3-13, W3-06, W3-12b and W3-17a were merged,
W3-14, the W3-16 read, W3-15 with its second reads and W3-18 gave results, W3-16 is being built, and the
orchestrator changed the order of work. This report gives the new sequence, what was changed in each order
not yet built, the conflicts found between orders and how each was resolved, what each order will re-record,
and what is left for the orchestrator. Edited: files under `docs/work-orders/` only. No order already built
was edited (W3-11a's section, W3-02a's and W3-02b's, and parts a and b of W3-17 are as they were). No app
code, `tests/REFERENCE_2026.md` or `docs/PROGRESS.json` was touched.

Sources: the reports on main named in each section, W3-16's order and its builder's report on
`origin/claude/w3-16-sender-hold-clock` (built, not yet reviewed), `tests/REFERENCE_2026.md` (findings 28 to
30 and the Model table), and the code on main where an order's text had to fit it (`createLiveChain`,
`createSteamStream`, stages 4 to 6 of `process()`, `live-worker.js`, `app/render.js`).

## The sequence

For orders that touch `audio.js`, one at a time:

| # | Order | What | Why it is here |
| --- | --- | --- | --- |
| 1 | W3-16 | the sender's hold in floats on Steam's clock, the read clock as measured | being built; everything after it drives its sender |
| 2 | **W3-11b** | the live chain on Steam's path, the key, the threshold control | it finishes the default preset's path: after it the live monitor and the render are one path |
| 3 | **W3-10** | the mix and output stage | rests on recordings (the interpolation's images in five takes, Set B's plateaus) and corrects what every render gets wrong today |
| 4 | **W3-17c** | the rooms in the render | rests on recordings (Sets C and D) and needs W3-10's mix stage to sit in |
| 5 | **W3-17d** | the rooms on the page and in the live chain | a visible feature that is wrong today (45% wet, no automatic room) |
| 6 | W3-02c | the game's timeline behind an option | the receiver's model is the least certain (58% of transitions right on the speech take) and gains from recordings still to come |
| 7 | W3-02d | the page: timing controls and the default | after the option exists |
| 8 | W3-02f, with W3-02e beside it | the flat rule retired; the lane's marks | after the page no longer sends `retime` |
| 9 | W3-02g | a demo's own packets | last: it leans on everything before it |

Beside them, in the module's files only: W3-17b. Held: W2-03, W2-05, W2-06. W2-04 is superseded.

## What changed, order by order

**W3-11b** (`docs/work-orders/W3-11-steam-gate.md`): **part b is rewritten, not amended.** As written it was
far from buildable: it kept the live chain's float decode and its own resampler, left the key to "a later
order", used the sender's interface from before W3-16, forbade the two files the key needs, and one of its
checks did not fit the code. What it said of the threshold control and the words is carried over. The part
now says:

- **One path.** The live chain for `steam` runs the render's own stages (the 16-bit capture, the sender, the
  16-bit decoder under Steam's rules, the resampler's port fed whole messages, the gain fed decoded packets,
  the packets laid on the source's timeline). The acceptance is equality: with the key held, what the live
  chain hands its mix stage is `createRender`'s, sample for sample. Check 3f goes back to a lag near zero on
  `steam`; `tests/verify.js` [10b] goes back to `steam`.
- **The clock** is the model's drawn clock, counted on the samples pushed, as in a render. Decided from W3-09
  and the W3-16 read: with a microphone Steam uses no clock for the chunk (it is what the capture cursor
  gained), and the browser gives neither Steam's reads nor Steam's capture steps: its blocks are a fiftieth
  of a second and arrive when the worker is scheduled. Taken as reads they would make a 20 ms gate and a
  render that differs from run to run.
- **The key**, from W3-09, W3-14 and the W3-16 read, as a table with each rule's basis: the two tails (an
  exact 0.5 s for the queue the game reads; 0.5 s on the float clock, up to one float step longer, for the
  device and the gate), a press that resets the encoder and the kept samples and not the sequence number or
  the gate's state, the open spurt that goes on, the empty packet, messages made and never collected.
- **The decoder outliving presses.** `createSteamStream` makes a new encoder and a new decoder together at
  each spurt, so it cannot say "a new encoder into the old decoder" or "made, not delivered" (W3-11a's
  second reader, note 8, as the brief gave it). The part separates the sender's side of the stream from the
  receiver's, adds `press()`, and requires that a render's output does not move.
- **`null` against `undefined`.** `finiteOr(null)` is 0 dBFS in the three readers of the frame gate, and
  W3-11a's sender options read `null` as Steam's own. Now both mean the profile's own everywhere, and
  `app/render.js` leaves the key out at a default.
- **`lostFrames`** counts concealed slots since W3-11a; the live chain's `stats.lost` counts concealed blocks
  the same way, and the page's words say "concealed".
- **The uptime setting**: the live monitor's options are `renderOptions()` plus one flag, so W3-16's choice
  already reaches the worker; the live chain passes it on. No second control.
- **Latency**: about 205 ms (132 today), about 105 ms in low-latency mode (12 today): a chunk gate needs the
  chunk. Low-latency mode drops the pre-roll's sound, not the pre-roll: the codec's state stays the render's.
- The 17-frame cut is named and shown unreachable in the live chain; the 12-frame refusal is reachable at
  long uptimes and is counted, not built (it is the receiver's).
- Checks and a table of 18 mutations in the house form; files; four stop conditions, one of them a place to
  stop if the key does not fit the budget. Budget 2 days (it was 1).

**W3-10** (`docs/work-orders/W3-10-output-stage.md`): rewritten whole (it was 70 lines).

- "Depends on": after W3-11b, before W3-17c and the receiver's orders; nothing of either is assumed.
- The mix stage is spelled out as three exported functions that W3-17c will call: `mixEntry(s, volume)` in
  the single-precision form, `mixUpsample2(buffer)`, `mixClip`; then `volume` in single precision and the
  rounding to even.
- **Settled: a 22050 or 11025 Hz voice is entered at its own rate, and each entered buffer is then upsampled
  by two, once or twice** (W3-07 section 1, "The mixer's passes"; W3-15 section 1, "The order"). The
  upsampling is on integers, the mean rounded down, and is applied to each buffer by itself, because with a
  room there are two and the floor of a mean is not additive.
- The stage runs in the mixer's 512-sample blocks from the render's first sample, with a hook that shows
  them, because the room's slot is run per block. The origin is one named value, for W3-02c.
- Named for the first time: `softLimit` goes, and the render's output is at the device's rate whatever the
  source's (today it is at the source's rate when that is above 44100 Hz).
- Until W3-17c the old room code sits at the seam between the upsampling and the clip.
- The checks are written for a render with no room: the clip cannot be reached there (the voice alone tops
  out at 32639), so it is tested on its function. A public check holds a clamped voice at `volume 0.15` to
  plateaus of exactly 4896, and **the private check asked for holds Set B's two clipped takes to 4896 and
  -4896 against the measured 4895 to 4896** (window 4894.5 to 4897.5).
- New: the accuracy tool's "samples at the clamp" (item 7, see the conflicts).
- Budget 1.5 days (it was 1).

**W3-17c and W3-17d** (`docs/work-orders/W3-17-room-effects.md`): only what the sequence changes. Decision 2
(the queue), Decision 3 (W3-10's function names; "the last order that re-records every hash" struck), the
table's "Starts after", part c's "Depends on" (no voice channel, no game timeline, `retime` still present),
part c item 4 (`spurtStart()` once, at the render's start; W3-10's blocks), item 5 (`retime` with a room),
the entry check by name, part d item 4 (the page as W3-16, W3-11b and W3-10 leave it; W3-02d comes after
and must keep the classification; W3-16's choice added to the controls' table), part d item 6 (the live
chain is W3-11b's and has no channel: `spurtStart()` at each spurt's first delivered message, as a stand-in).

**W3-02c to W3-02g** (`docs/work-orders/W3-02-receiver-queue.md`): not rewritten. A paragraph at the head and
a dated block, "Now comes after", on each part: what will have changed under it and the rules today's reads
gave it. **Flagged for a planner before the build: W3-02c** (section 10d's ranges were measured on the clock
W3-16 replaces: its "-330 to -190 ms" for the early start no longer holds, W3-16's builder measured 167.5 to
303.7 ms early; and two of its checks name the three-tap output stage) **and W3-02g** (which decoder a demo
goes through; the 17-frame cut; `opus-codec.mjs` missing from its files). W3-02d, W3-02e and W3-02f hold as
written.

**W2-04**: a block at its head says it is superseded: the room half by W3-17c, the re-timing half void once
W3-02f has merged. **W2-03**: a note at its head for when it is taken up (the refusals it mentions, the
device rate, the room's tail). W2-05 and W2-06 are not edited; they only say they may run beside W2-04.

## Conflicts found, and how each was resolved

| # | Between | The conflict | Resolved |
| --- | --- | --- | --- |
| 1 | W3-11b as written, and W3-11a's hand-over and the Model table | part b kept the float decode and the app's resampler in the live chain; W3-11a asks the live chain to feed the gain as the render does, and the Model table names W3-11b for the live chain's float samples, its missing cap and its resampler | one path: the render's stages |
| 2 | W3-11b, and W3-14 and W3-16's order | part b left the key "for a later order"; both later documents give the key's rules to W3-11b | the key is in, with a stop point if the budget runs out |
| 3 | W3-11b's files, and the key | it forbade `steam-sender.js` and `opus-codec.mjs`; the tail test belongs beside `nowF` in the sender, and the stream must reset an encoder alone | both allowed, for calls a render never makes; golden hashes are the proof |
| 4 | W3-11b's check, and `live-worker.js` | "a change of `voice_scale` while live does not reset the gain": a settings change rebuilds the whole chain | the check is dropped; the order says what a rebuild is and does not change it |
| 5 | W3-11b, and `audio.js` | the page was to send `null` at a default; three readers take `null` as 0 dBFS | one helper; the page leaves the key out |
| 6 | W3-11b's low-latency note, and the sender | "keep the sender's `past` empty": the sender then sends 2400 zeros | the pre-roll is sent and decoded, and its sound dropped where it falls before what was given out |
| 7 | W3-16's order and its brief | the order forbids `tests/REFERENCE_2026.md`; the brief asked the builder to bring "the app today" up to date | W3-11b and W3-10 allow those lines by name, in the order itself |
| 8 | W3-10 and W3-17, Decision 3 | "W3-10 stays the last order that re-records every golden hash" | struck: W3-10 re-records all once, W3-17c moves none |
| 9 | W3-17c item 4 and the sequence | `spurtStart()` "at each voice channel start (W3-02c's timeline)": there is none yet | once, at the render's start; W3-02c adds its calls later |
| 10 | W3-17's amendment and W3-02's clock | the room's blocks run from the render's first sample; the channel clock's blocks are at `512 b - D` | W3-10 names the origin; W3-02c sets it under `'game'`. With a fixed room no sample depends on it |
| 11 | W3-10 and the accuracy table | with the voice at 255/256 the model has no sample at the ceiling itself, the take has 0.39 to 0.40 there from the game's ambience (W3-07, disagreement 4): a correct model would read as an error | the figure becomes the share within 0.5% of the ceiling; the exact share is printed beside it |
| 12 | W3-02c and W3-16, W3-10 | 10d's ranges and two of its checks rest on the old clock and the old output stage | flagged for a planner; the note gives W3-16's re-derived figures |
| 13 | W3-02c's "golden hashes pass unchanged" and the 12-frame refusal | under loss the render makes messages the game refuses whole; refusing them moves the loss cases | built under `'game'` only; the source's timeline is a question below |
| 14 | W3-17d item 4 and the sequence | "W3-02d and W3-02f change the page first" | reversed: they come after and keep W3-17d's classification |
| 15 | this pass and the repository | the branch `claude/w3-plan-maintenance-2` already existed (the first pass's fix round, merged) | it was an ancestor of main: checked out and fast-forwarded to `origin/main`, so the push was a fast-forward |

## What each order will re-record

| Order | Golden hashes | Other |
| --- | --- | --- |
| W3-16 | the 33 renders through Steam's sender, once (done on its branch); 18 unchanged | cache v25; the sender's reference schedule; four expectations of the channel's suite |
| W3-11b | **none** (no render changes; shown before anything else) | the live checks of `tests/verify.js` [10b] and browser 3f; the cache version; "the app today" in the reference |
| W3-10 | **all, once** | the accuracy table, re-run; the cache version. Once more for the CELT and Speex cases if a read of the upsampler's edge differs from what was built |
| W3-17c | none of the existing; one case removed; about eleven room cases added | the accuracy table's rows for Set C and Set D's PC A; the cache version |
| W3-17d | none | browser expectations; the cache version |
| W3-02c | none; `'game'` cases added | the loss cases once, only if the refusal is extended to the source's timeline |
| W3-02d, W3-02e | none | browser expectations |
| W3-02f | none; the `retime` cases go | |
| W3-02g | none; demo cases added | |
| any time | every `steam` case once | if the owner says Set D's Steam had been started within a day and a half: W3-16's default becomes 4 hours |

## Open, for the orchestrator

1. **W3-11b's size.** It is one order of two days with the key in it and a written place to stop. If the plan's
   reviewer finds it too much for one build, the cut is clean: items 1 to 3 and 6 to 9 (the path, the
   threshold, the words) as one order, items 4 and 5 (the key) as the next.
2. **Three points of the key are models, not readings**, each marked in the order: where a restarted
   device's capture steps fall (taken: from the press, with the same lateness); that the gate's buffer of past
   sound survives a stop (inferred from what the reads list as reset); and that a key change lands between two
   reads of a sender that reads ahead of its own clock by up to 108 ms. A microphone run with
   `@voice_spew_activity_check 1` and a few key presses would show the first two.
3. **The upsampler at a block's edge** (W3-10, "Open"): one sample in 512 for the CELT and Speex profiles. A
   short read at W3-07's address before the build saves a second re-record of those profiles.
4. **The 12-frame refusal on the source's timeline.** Today's `steam` render under loss plays messages the
   game would refuse whole. W3-02c's note builds the refusal where the channel takes a message. Refusing on
   the source's timeline too is right by the read and moves the loss cases' hashes once; it could ride with
   W3-02c or be a small order of its own. It also touches the open question of whether loss falls on whole
   messages.
5. **When the planner's passes for W3-02c (section 10d) and W3-02g happen.** Not before W3-16 has merged,
   since 10d is re-measured on its sender; best after W3-10, so the checks are stated on the new output stage.
6. **W3-02d's presets.** Its reason for "the other presets set `source`" was unverified rooms. By then the
   rooms are the engine's. Which presets on `steam` with a room take the game's timeline is a line for its
   brief.
7. **W3-11a's second reader's notes are not in the repository.** Note 8 is carried as the brief gave it. If
   that read had other notes for W3-11b, they are not in the order.
8. **Texts outside this pass's files that still show the old order:** the table of
   `docs/reports/W3-11-plan.md`, "The order of work"; the Model section of `tests/REFERENCE_2026.md`, which
   points at that table; and two items of PROGRESS's `next` ("parts c and d after W3-10" reads rightly, "W3-10
   ... after the receiver's orders" does not).
9. **A sentence left in W3-17d** (item 6: "100 ms for the water slot") contradicts that order's own amendment
   (no water fade). The amendment says it wins; the sentence was not a matter of sequence and was left.

## Not done

- No order was read by a builder's model after this pass. W3-11b is written to be handed to a plan reviewer
  as it stands; it should be read against the sender as W3-16 merges it, since it names that branch's
  functions (`nextRead`, `emptyRead`, `info().uptime`).
- Nothing was run: the figures in W3-11b (the latency, the share of empty first reads) and in W3-10 (the
  plateaus, the two samples of the single rounding) are arithmetic from the reports, not measurements.
- The scan: the branch's diff against `origin/main` has no 17-digit numbers, drive or home paths, e-mail
  addresses or names.
