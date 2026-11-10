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

10. **W3-17b's second read landed on main while this pass was being written**
    (`docs/reports/W3-17b-second-read.md`): a shaft's classes are worked out with height and length swapped
    (a must-fix for part b's module and for the oracle), and the game's debug lines print feet, the length
    first, with no count of open sides. That is part b's and the owner's procedure's (step 9 and the rows of
    `ROOM_PLACES`), not a matter of sequence: W3-17's parts c and d were not changed for it. Part d's manual
    fields and its "what the engine would build" line take whatever part b's fix gives.

## Not done

- No order was read by a builder's model after this pass. W3-11b is written to be handed to a plan reviewer
  as it stands; it should be read against the sender as W3-16 merges it, since it names that branch's
  functions (`nextRead`, `emptyRead`, `info().uptime`).
- Nothing was run: the figures in W3-11b (the latency, the share of empty first reads) and in W3-10 (the
  plateaus, the two samples of the single rounding) are arithmetic from the reports, not measurements.
- The scan: the branch's diff against `origin/main` has no 17-digit numbers, drive or home paths, e-mail
  addresses or names.

## Addendum, 2026-11-10: W3-11b after its plan review

A builder's model read the rewritten W3-11b as the one who would build it, against the sender on W3-16's
branch, and ran that sender for two of its findings: 7 must-fix, 12 should-fix, 15 notes. The orchestrator
ruled on it, and the order was revised and **cut in two** (branch `claude/w3-plan-maintenance-3`; only
`docs/work-orders/W3-11-steam-gate.md` and this addendum changed):

- **W3-11b** is the path: the live chain on the render's own stages with the key held from start to stop,
  proved in Node by sample-for-sample equality with `createRender`. One day. It touches neither
  `steam-sender.js` nor `opus-codec.mjs`, takes the sender as W3-16 merges it, and names no constant of its
  clock. With push-to-talk on it runs a stand-in of the app's own (the microphone's block zeroed while the
  key is up), named as such on the page.
- **W3-11c** is the key as Steam has it. It is written down and **not to be built**: it comes after W3-17d,
  and waits for the owner's microphone run (specified in the order: six cases, Steam's uptime noted) and for
  a planner to specify five points against that run (M4, S1, S2, N4, N5).

| # | Finding | What was done |
| --- | --- | --- |
| M1 | `contentDelay` mixed the index shift with the hold-backs | W3-11b: `contentDelay` is the index shift alone (the stages after the mix point); `latencyMs` is that plus every hold-back; the recorder keeps `contentDelay`; [10b] checks it at the correlation's peak |
| M2 | with the reach alone, concealment is dropped after 5 to 9 lost frames | the render's own give-out expression, waiting for the cursor at most ten frames; the price (up to 200 ms of wait in a loss run, which the worklet skips over) is stated; the 15% loss equality holds on a mask with no run over ten |
| M3 | a low-latency reach of the longest chunk drops sound in mid-spurt | the longest chunk plus a frame less a sample, from the sender's constants; "about 80 ms lower", the figure taken from the chain |
| M4 | a spurt that goes on across a stop is laid seconds early | W3-11c, "To be specified": the message's `start` after a press and the timeline's re-anchoring |
| M5 | "the page sends -40" was not caught: `32767 x 10^-2` is 327.67 exactly | the browser check asserts `renderOptions()` has no `gateThresholdDb` at a default, and the batch key; the moot reason is struck |
| M6 | `tests/speex102.verify.mjs` would fail on a correct build | the file is allowed; its `steam` case moves to `steam_48`; [10b] carries what it proved |
| M7 | the stop point's fallback could not be built | it is now W3-11b's push-to-talk: zeros in place of the microphone while the key is up, so the clock and the positions run on |
| S1 | the restarted capture was not specified | W3-11c, to be specified against the run's case 3 |
| S2 | `stopF` and `stopD` read two ways; `stopD` an unmarked model | W3-11c, to be specified |
| S3 | Set J's one measured release left 0.67 s uncollected | W3-11c, "Not yet explained", with the caveat on the table's row; nothing in W3-11b states a release tail |
| S4 | the scripted key case and its bound | W3-11c; W3-11b's own key check is an equality (the render of the source with the key-up blocks zeroed) |
| S5 | the browser's push-to-talk wait was too short | 1.5 s, with the derivation |
| S6 | "the resampler made anew at a press" pointed at a check that cannot see it | W3-11c; in W3-11b the equality sees a resampler made anew at a spurt |
| S7 | the `null` check covered one reader of three | `null`, `undefined` and `''` checked in `process()`, `createRender` and the live chain; one reading shared with `steamSenderOptions`, numeric strings included |
| S8 | what is dropped depended on the block plan | what is given out is defined per pushed sample; low-latency mode is checked equal at four plans; `gain.verify` keeps its check and gains a loss case |
| S9 | most `stats` fields undefined on the new path | each field defined |
| S10 | reference lines left out | findings 5, 12, 16, 26 and the Model section's opening added to the allowed lines, in the file's style; the key's model points go to finding 28 with W3-11c |
| S11 | texts that become false | the latency tooltip, the low-latency label and title, the push-to-talk title, three README lines and `live.js`'s header, each by profile |
| S12 | push-to-talk off against an open microphone | one sentence in the order and the README: the key counts as held; TF2's `voice_vox` was not read |

The notes: N1 (the render's own expression, one shared function), N2 (the three changes `steamTimeline` may
take; a render keeps its own), N7 (3f is a smoke test, [10b] the proof), N9, N10 (`constants.js` named in
PREDICTIONS), N11 (what W3-10 re-records; the mix point one stage boundary), N14 and N15 are in W3-11b. N3, N4,
N5, N6, N8, N12 and N13 are in W3-11c. Of the first version's 18 mutations, nine stay with W3-11b as they were and
one ("given out past the reach") in a new form; the other eight are the key's and wait with W3-11c. W3-11b now
lists 18, among them the review's on the cursor, the low-latency reach, the block plan, `contentDelay` and the
page's default.

**Two things go beyond the review and the rulings:**

- **A late packet is moved, not dropped.** With the ten-frame wait, a gap of more than ten lost frames that
  closed up further than the wait covers leaves the spurt's cursor behind what was given out. Dropping what
  lands there would silence the rest of the spurt, and with the gate off that is the rest of the session. So
  such a packet is laid from what was given out and the spurt goes on from there (`stats.movedLate`); only a
  spurt's first packet loses samples (`stats.droppedLate`, the pre-roll in low-latency mode). A hand-made
  mask of 30 lost frames checks it.
- **README's sentence on push-to-talk is re-worded.** "Audio from before the key goes down is never sent"
  holds for everything captured with the key up, which is zeros. One corner reads against it: after a
  key-up shorter than the pre-roll, the pre-roll reaches back across the zeros into quiet sound from the
  hold before. The sentence becomes "sound captured while the key is up is never sent", true by
  construction.

**Not settled by this revision:** W3-11c's third model point (a key change lands between two reads of a sender
that reads ahead of its own clock) is the app's own and no run settles it; why Set J's release left 0.67 s
uncollected.

## Second addendum, 2026-11-10: W3-10 after the upsampler's read and its plan review

Two things came in for W3-10: the engine's read of the upsampler (`docs/reports/W3-10-upsampler-read.md`) and
a plan review by a builder's model (9 must-fix, 12 should-fix, 9 notes, 20 mutations; it confirmed the entry
on all 65,536 samples, the plateaus, the images at -65.38 and -66.17 dB and the response). The orchestrator
ruled, and the order was revised whole (branch `claude/w3-plan-maintenance-5`: `W3-10-output-stage.md`; three
sentences of `W3-17-room-effects.md`; one bullet in W3-02c's note; this addendum). Budget 2.5 days (was 1.5).

**The read corrects the order.** The first rewrite had `y[2i] = x[i]` and the mean after it. The engine has
the mean first, made with the input kept from before: `y[2i] = (prev + x[i]) >> 1`, `y[2i + 1] = x[i]`, the
state per buffer and per stage, 0 at first, never reset by a channel or a block. So the function is stateful,
needs no look-ahead, and gives the same samples at any chunking; a voice of `N` samples gives `2N + 1`
outputs (`4N + 3` for Speex); a CELT render is one mix sample late and a Speex render three, as in the game.
The read's pseudo-code and its two boundary tables are in the order as code and as test vectors, with its two
mutations (the old phase; the state reset per block). The "open" point on a block's edge is closed.

| # | Finding | What was done |
| --- | --- | --- |
| M1 | the WAV writer truncates and scales positives by 32767: every file is one unit low on positive samples | fixed in this order: `round(s x 32768)`, ties to even, clamped, in `toInt16` for every caller and in `video.js`'s PCM; a check on the file's bytes (4896, 4915, 32639, -32640 as themselves); `formats.verify.mjs` re-derived; the report and the reference say it corrects what the user downloads |
| M2 | the device stage's arithmetic was not pinned | the integer form `(x[k](D - r) + x[k+1] r) / D`, rounded to 16 bits with ties to even, marked as a model of the system's mixer |
| M3 | four checks could not see their mutations | exports `mixDevicePosition` (checked against `BigInt`), `mixOut` (the stage after the sum), `onGain` on every profile, `onMixBlock` with the block's samples; hand cases for each, the device's as exact vectors (a ramp of 160s gives `147 n`; the tie at output 80) |
| M4 | the output's length contradicted today's contract | the contract is kept: the source's duration at the device's rate, the device stage's output cut or padded to it; the upsampler's last mean is in the mix and the cut decides whether it is in the file |
| M5 | the live chain's figures that this order moves were not named | item 8: `contentDelay` (0 on `steam`; the frame path less the FIR, plus the upsampler's 1 or 3 samples), both `latencyMs` figures, 3f's window, [10b]'s two `steam_48` hashes and its `contentDelay` check, the frame-path check, each re-derived with old and new |
| M6 | blocks in the stream: held or not; the upsampler at an edge | the blocks are positions, exposed by the hook, and nothing is held back; the upsampler is stateful; holding a partial block moved to W3-17c (with a room on) and is counted in the live chain's latency in W3-17d |
| M7 | the upsampler's rule | settled by the read, as above |
| M8 | item 7 ("samples at the clamp") rested on a misreading and needed a forbidden file | struck; `accuracy.mjs` may print the exact-ceiling share beside its figures; `reference.js` untouched |
| M9 | "no case keeps its hash" was wrong and left no control | stated: every WAV hash moves but the empty source's, no `codecInfo` hash moves, no new `codecInfo` key; the control: gain-output hashes before and after, and a model of the spec written in the test that gives every golden render |
| S10 | the live chain at other context rates | the linear rule above 44100, nothing at 44100, the sinc resampler only below; a check that the live output equals the render's after the mix point at 48000 and 44100 |
| S11 | `deviceRate`'s domain | an integer from 44100 to 192000, anything else the default; the page offers two |
| S12 | the amendment's reason; `PAGE` read two ways | `PAGE` keeps `volume: 0.5` explicitly (ties to even), its comment changed; the default moves no golden hash and is made here because this order owns the stage and its words |
| S13 | places that depend on 0.5 | listed, each with its fix (the check that would compare a render with itself becomes 0.3 against 1) |
| S14 | the device choice on the page | a console-style name marked as the app's own (`snd_device_rate`), a link and settings key (`dev`), kept across built-in presets, shown in the chain strip |
| S15 | the new default meets the meter and the exports | said to be intended: one sentence beside the control, the meter's note, the lossy exports' note suggests lowering `volume`; no hidden limiter |
| S16 | `reference.js` assumes 48000 | settled: harmless, since scored renders are at 48000 and the ceiling figure does not use the block; the stop is a scored render at another rate |
| S17 | the `mixer` key "if nothing else reads it" | the key, `linearStage`, `streamResampleLinear` and `linearLength` go; `resampleLinear` stays exported with its check; the check that reads `mixer` changes |
| S18 | an example that read two ways | written with `mixEntry` in it, under the read's rule: `127, 255, 254, 254, 127` entered first, `127, 255, 255, 254, 126` upsampled first |
| S19 | a value that is not whole had no check | added (`voice_scale 0.5`, auto-gain off, a `k + 0.5`) |
| S20 | the private table's expectation | by band, as the reviewer computed: anchor about -0.025 dB; 5 to 12 kHz +0.10 to +0.13; 12 to 16 kHz -0.12; 16 to 19 kHz -0.90; "the 13 to 18 kHz bands closer" is gone |
| S21 | budget and files | 2.5 days; every file the reviewer lists is named, and `mixStages()` |

The notes that cost a sentence are in: `fround` on the volume inside `mixEntry`; `soundfade` is 0 and not
modelled; the images tested at -6 dBFS or louder; how Set B's median plateau is measured; the blocks' origin
a multiple of 4; the hook in the live chain; the two mistakes only W3-17c can catch. The mutation table has
24 rows: the reviewer's 20 less the one W3-10 cannot reach, the read's two, and three of this revision (the
length by the mix's, a float device value, a second state missing for Speex).

**Choices made in the revision, for the orchestrator to overrule:** `toInt16` changes for every caller (the
MP3 encoder's input too), not only the WAV; the names `snd_device_rate` and `dev`; the sentence beside
`volume` ("At 1, the game's default, a loud voice fills the whole range, as it does in the game"); a band
that moves by more than 0.05 dB from the expected figures holds the merge. In W3-17, one sentence beyond the
move of the block hold was changed: Decision 3's list of W3-10's functions, which named the upsampler without
its state.

**For W3-02's orders, from the same read:** on a channel's first block the wave mixer asks for one sample
more and mixes the first `count` of them, keeping the last for the next block. `createTimeline` as built
plays the last 512 of 513 and drops the queue's first sample. It is in W3-02c's note for its planner.
