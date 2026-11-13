# The project's working documents

This folder holds how the project is run: the work orders, their reports, where things stand, and the process.
The app itself is described in the [README](../README.md); the evidence behind every constant is in
[tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md).

## What to read first

A session that picks up the work reads [PROGRESS.json](PROGRESS.json) first: where main is, what is in flight and
on which branch, what comes next, what is held and what waits on the owner. [PIPELINE.md](PIPELINE.md) says how an
order runs from brief to merge. Then the order in hand, in `work-orders/`, from its status line down. The
reports in `reports/` are history: each says what one order or investigation did and found, as of its date, and
is not corrected later, except a dated note where an order's state changed. Where a report and today's code disagree, the code and `tests/REFERENCE_2026.md` win.
[PROGRESS-LOG.md](PROGRESS-LOG.md) keeps, dated, every stand and decision that PROGRESS no longer carries.

The other documents in this folder are for someone using the page: [PAGE.md](PAGE.md) (the page's tools),
[LIVE.md](LIVE.md) (the live monitor), [VOICE-PATH.md](VOICE-PATH.md) (what each stage does to the sound),
[ACCURACY.md](ACCURACY.md) (how close the app is to the game, stage by stage), [FINDINGS.md](FINDINGS.md) (how
Source's voice path works, as read and measured), [REPRODUCE.md](REPRODUCE.md) (how to check findings on your own PC), and [owner-runs.md](owner-runs.md) (the owner's procedures for
the recordings still wanted).

## The status line

Every order carries one line under its title, dated, in one of these forms:

- `**Status <date>: built and merged** at <merge> (cache vNN, pull request #NN). Report: docs/reports/<file>.md.`
  with "Superseded in part by X" where that holds;
- `**Status <date>: done (investigation)** at <commit>. Report: ...` (also "done (plan)");
- `**Status <date>: held** on <what>.`
- `**Status <date>: in flight** on branch <branch>.`
- `**Status <date>: not started**; after <orders>.`
- `**Status <date>: superseded** by <order> (<merge>).`

An order with parts gives one line a part. Whoever merges an order, or changes what it waits on, updates its line
and its row below in the same commit.

## The index

Built orders stay in `work-orders/` with their status lines; nothing has been moved. The cache number is the
site's (the footer's "version N"). Pull requests were opened for the record; every merge was made locally.

| Order | What | State on main | Evidence | Report(s) | Depends on, blocks |
| --- | --- | --- | --- | --- | --- |
| W1-01 | `speex` runs real Speex (1.2.1) | built and merged; its code later replaced by W3-12b | `11d0ab8`, v18, #5 | W1-01-speex.md | superseded in code by W3-12b |
| W1-02 | one demo reader; a spurt after a lost end marker | built and merged | `800059b`, #3 | W1-02-demo-reader.md | |
| W1-03 | a plan for renders past 10 minutes (wrote W2-01 to W2-06) | done (plan) | `32ef7f6` | W1-03-long-renders-plan.md | |
| W1-04 | the live-recording check stops failing by chance | built and merged | `4efb870`, #4 | W1-04-live-check-probe.md | |
| W2-01 | the meter a piece at a time | built and merged | `b4605e6`, #6 | W2-01-stream-meter.md | |
| W2-02 | `createRender` | built and merged | `860a559` (v20 at `43fd35f`), #8 | W2-02-render-stream.md | |
| W2-03 | sources past 10 minutes in the page | held (the owner's priority); its worker protocol needs a planner's pass since W4-01b | | none yet | blocks W2-05, W2-06 |
| W2-04 | rooms and re-timing in the stream | superseded: the room half by W3-17c (`3250128`, v28); the re-timing half goes with W3-02f | | | |
| W2-05 | the views quick on long files | held | | | after W2-03 |
| W2-06 | a video keeps its file, not a copy of its bytes | held | | | after W2-03 |
| W3-01 | when phrases start (investigation) | done | `41aa2d7` | W3-01-phrase-timing.md | its draft order was replaced by W3-02 |
| W3-02 plan | the receiver plan, revisions 1 and 2 | done | `96f0983`, `615fb06` | W3-02-plan.md | |
| W3-02a | the channel as a module, the log replay | built and merged (nothing loads it) | `1ee4968`, #9 | W3-02a-voice-channel.md | |
| W3-02b | `steam-sender.js`, `createTimeline` | built and merged | `f58d9a7`, #11 | W3-02b-voice-timeline.md | its sender's clock and hold since replaced by W3-16 |
| W3-02c | the plan review: one order became three | done (the amendment and the rulings are in the order) | `abf872f`, `b63cc73` | none (the amendment is in the order) | |
| W3-02c-1 | the module as read (the first pull, D on blocks, the zero, the interpolator) | built and merged (no render runs it yet) | `a2b7dc9`, #30 (no cache change) | W3-02c1-channel-as-read.md | W3-02c-2 builds on it |
| W3-02c-2 | the render behind `opts.timeline`; BC-3's build | built and merged `73993cf`, cache v39, #38 (a render runs the channel when asked with `timeline: 'game'`; the page does not offer it) | [W3-02c2-render-channel.md](work-orders/W3-02c2-render-channel.md) | `docs/reports/W3-02c2-render-channel.md` | W3-02c-3 and W3-02d build on it; the orchestrator's private runs against the takes are in the report (2026-11-13) |
| W3-02c-3 | the live chain runs the channel | not started | | | after W3-02c-2; an owner's question is open |
| W3-02d | the page: controls, the default, the words | not started | | | after W3-02c-2 |
| W3-02e | the codec lane's marks, the real-take check | not started | | | after W3-02d |
| W3-02f | the flat rule retired | not started | | | after W3-02d |
| W3-02g | a demo's own packets | not started; needs a planner's pass | | | after W3-02c-2 and W3-02f |
| W3-03 | the engine's binary read (investigation) | done | `4630e06` | W3-03-engine-binary.md | |
| W3-04 | a file decoded at its own rate | built and merged | `f32ba0e`, v19, #7 | W3-04-native-rate-decode.md | |
| W3-05 | the receiver's gain | built and merged | `c00dff8`, v21, #12 | W3-05-receiver-gain.md | |
| W3-06 | the CELT settings | built and merged | `28069d4`, v22, #13 | W3-06-celt-settings.md | |
| W3-07 | the mixer to the speakers (investigation) | done | `0367808` | W3-07-mixer-output.md | |
| W3-08 | why the app's CELT was not the game's (investigation) | done | `8451e59` | W3-08-celt-encoder.md | |
| W3-09 | Steam's side of voice (investigation) | done | `a5f8ba2` | W3-09-steam-voice.md | |
| W3-10 | the mix and output stage | built and merged | `2a13e2e`, v27, #21 | W3-10-output-stage.md, W3-10-upsampler-read.md (`8ba38b4`) | |
| W3-11 plan | the plan after W3-09 | done | `56b927f` | W3-11-plan.md | |
| W3-11a | the `steam` render as Steam sends and decodes | built and merged | `603d3d9`, v24, #16 | W3-11a-steam-render.md | |
| W3-11b | the live chain on the render's stages | built and merged | `f03e431`, v26, #20 | W3-11b-live-chain.md (and the screenshots in `reports/W3-11b/`) | |
| W3-11c | the key as Steam has it | held: the owner's microphone run ([owner-runs.md](owner-runs.md)), then a planner's spec | | | |
| W3-12a | the Speex 1.0.2 module | built and merged | `25dc00e`, #10 | W3-12a-speex-102.md | |
| W3-12b | the `speex` profile on the module | built and merged | `3ff386c`, v23, #14 | W3-12b-speex-profile.md | |
| W3-13 | the 24 to 44.1 kHz resampler | built and merged | `7327327`, #15 | W3-13-steam-resampler.md | |
| W3-14 | the Steam path against a known input (investigation, Set J) | done (no merge commit) | `c0a0833` to `919a66c` | W3-14-steam-file-input.md | |
| W3-15 (no order file) | the room DSP read | done | `4f7c84e` to `b7c07bd` | W3-15-room-dsp.md; second reads W3-17-room-dsp-second-read.md (`f413ed1`), W3-17-amp-mdy-second-read.md (`904373d`) | |
| W3-15b (no order file) | the rooms in the takes (investigation; first numbered W3-18) | done | `4bf8592` | W3-15b-rooms-in-the-takes.md | |
| W3-16 | the sender's hold on Steam's float clock | built and merged | `d250928`, v25, #19 | W3-16-steam-hold-read.md (`9659696`), W3-16-sender-hold-clock.md, W3-16-second-read.md (`1750365`) | |
| W3-17a | the room module | built and merged | `dc0a989`, #17 | W3-17a-room-module.md, W3-17a-second-read.md | |
| W3-17b | the automatic room | built and merged | `7d25c7d`, #18 | W3-17b-automatic-room.md, W3-17b-second-read.md | |
| W3-17c | rooms in the render | built and merged | `3250128`, v28, #22 | W3-17c-rooms-in-the-render.md | |
| W3-17d | rooms on the page and live | built and merged | `b952114`, v31, #26 | W3-17d-rooms-page.md | |
| W3-18 | Speex exact | built and merged | `e4c3d73`, v29, #23 | W3-18-speex-exact.md | |
| W3-19 | the gain on the decoder's own samples | built and merged | `8a6ee5a`, v30, #24 | W3-19-gain-grid.md | |
| W3-20a | the Miles (VR12) module (not in TF2) | built and merged | `69a92bf`, #25 | W3-20a-miles-codec.md | |
| W3-20b | the `miles` profile (not in TF2) | built and merged | `7534d58`, v32, #27 | W3-20b-miles-profile.md | |
| W4-01 audit | the page as a user meets it | done | `14b4608` | W4-01-page-audit.md (and the screenshots in `reports/W4-01/`) | |
| W4-01a, W4-01c | the journey and the defaults; access | built and merged | `b9579a4`, v34, #29 | W4-01ac-page.md | |
| W4-01d | the settings' words | built and merged | `b952114`, v31, #26 | W4-01d-settings-words.md | |
| W4-01b | speed with the same samples: stages kept and reused, the worker kept, Cancel, the first seconds | built and merged | `2a98439`, v35, #32 | W4-01b-speed.md | S3-01a builds on it |
| S3-01a | the tests' one engine loader, in each suite's own realm; the steam sections of `tests/verify.js` in their own file | built and merged `7a94dc8`, no cache change, #34 | [S3-01-test-harness.md](work-orders/S3-01-test-harness.md) | `docs/reports/S3-01a-engine-loader.md` | S3-01b builds on it |
| S3-01b | a runner in place of the `&&` chain; a check that derives the cache list; the cache number set at the merge; CI in five jobs | built and merged `087f653`, no cache change, #35 | the same order | `docs/reports/S3-01b-runner-cache-ci.md` | S3-02a builds on it |
| S3-02a | `audio.js` split into ten files under `engine/` by stage, lines moved unedited, one file a commit; no sample or hash changes | built and merged `f134d2c`, cache v37, #36 | [S3-02-engine-split.md](work-orders/S3-02-engine-split.md) | `docs/reports/S3-02a-engine-split.md` | S3-02b and W3-02c-2 build on it |
| S3-02b | one unused name off `TF2Audio` and two unused lines of the page; the harness refuses an engine file named twice and a renamed name in a head; `sw.js` fetches code and markup past the browser's HTTP cache; four stale comments | built and merged `65a2463`, cache v38, #37 | the same order | `docs/reports/S3-02b-engine-deletions.md` | none |
| S3-03 | invented names in the page's mock console feed (no real person's name) | built and merged `11f430f`, cache v36, #33 | the same order, its last section | `docs/reports/S3-03-mock-names.md` | none |
| BC plan | bad connections | done | `803cffc` | bad-connections-plan.md | |
| BC-1 | loss takes whole messages | built and merged | `a0f1cd0`, v33, #28 | BC-1-loss-per-message.md | |
| BC-2 | the words | done, documents only, by the orchestrator; no order, no report | `1c6c9b0`, `db56bee` | none | |
| BC-3 | loss through the queue | its build is part of W3-02c-2 (the amendment, section 10); left over: a private check against block 1 and a change to `log-to-fixture.mjs`; no order | | | after W3-02c-2 |
| BC-4 | jitter as arrival times | not started; no order | | | after W3-02c-2; the owner's block 2 |
| BC-5 | the engine codecs under loss | not started; no order | | | the owner's block 1, its optional take |
| BC-6 | the sender's side, a real server | no build planned | | | the owner's block 6 |
| RP-01 | a document a stranger can check findings from on their own PC, with one script ([REPRODUCE.md](REPRODUCE.md); the checks `inputs`, `gain`, `celt` and `speex` are built, the others not yet); the name, build, date and SHA-256 of each file a finding marked "read" was read from; which recordings are published, and how | planned and ruled on (2026-11-13, section 14 of the order: nine recordings of two synthetic clips are candidates, in the repository; no recording of the modern path can be published, each carrying the owner's voice) and reviewed (section 15: part b is planned again before it is built); parts a and d merged 2026-11-13; of part e the files table is filled, and the publishing of seven recordings is prepared and waits for the owner's word (the order's section 17) | [RP-01-reproduce-it.md](work-orders/RP-01-reproduce-it.md) | [RP-01a](reports/RP-01a-reproduce-script.md), [RP-01d](reports/RP-01d-files-and-manifest.md) | after the orchestrator's rulings (the order's section 12) and a plan review; part e is the orchestrator's alone |
| W3-21 | the phase of Steam's capture steps against the sound: the sender's steps take the phase its clock already draws, so a signal with edges on multiples of 31.25 ms no longer loses one step of every burst | merged 2026-11-13 | [W3-21-capture-phase.md](work-orders/W3-21-capture-phase.md) | [W3-21-capture-phase.md](reports/W3-21-capture-phase.md) |
| W3-22 | the words on `vaudio_miles` (never in TF2) after the 2006 sitting: the sentence that it was never checked against a running engine is replaced where the page, the README, the record and the suite hold it; no render changes | planned 2026-11-13; not started | [W3-22-miles-words.md](work-orders/W3-22-miles-words.md) | none |
| Maintenance passes | the plan kept up to date | done | `527bda6`, `3f3a4f1`, `c37c7e1` | W3-plan-maintenance.md, W3-plan-maintenance-2.md | |
| Documentation pass | every document read against the code and rewritten | in flight | | | |

Two folders under `reports/` are not reports: `reports/W3-11b/` holds the screenshots of `W3-11b-live-chain.md`,
and `reports/W4-01/` those of `W4-01-page-audit.md`.

## Owed

- **Left stale by W3-02c-1 and owed to a later order:** `tests/voicequeue/reference-channel.mjs` still carries the
  channel's old arithmetic (the unblended copy and the old fade; its header says so, and the suite adapts around
  it), and W3-02a's report and `tests/voicequeue/README.md` describe that old arithmetic. The amendment's "As built:
  W3-02c-1" in `work-orders/W3-02-receiver-queue.md` says what the channel computes now.
- **Since W4-01b's merge:** W2-03's worker protocol no longer holds (its note of 2026-11-12 says what changed); a planner rewrites its steps when the order is taken up.
