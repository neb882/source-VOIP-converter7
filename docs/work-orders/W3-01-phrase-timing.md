# W3-01: when phrases start (an investigation, then an order)

> **Status 2026-11-12: done (investigation)** at `41aa2d7`. Report: `docs/reports/W3-01-phrase-timing.md`. Its draft order was replaced by W3-02.

**Branch:** `claude/w3-01-phrase-timing`, from `main`. **Worktree:** given in the brief. **Agent:** an investigator on
the stronger model (docs/PIPELINE.md, "Which model does what"). It measures and writes; it changes no app code.
**Time budget:** 3 hours.

## Why

The owner cares most about the modern preset and has A/B tested it against the game. Read block by block against the
owner's takes (docs/PROGRESS.json, `stands.baseline`), level, spectrum and clipping agree; what is left for speech is
when phrases start. In the speech take the game moved 9 talk spurts by 100 to 340 ms. The render keeps the source's
timeline by default, and its option (`voice_retime 1`, `retimeSpurts` in `audio.js`) is a flat rule: after a silence
of up to 0.45 s a spurt starts early with probability 0.41.

The mechanism is known (tests/REFERENCE_2026.md, findings 10, 19 and 21): the receiver appends a spurt to voice it
still has queued, and restarts at a latency L0 when the queue has drained. `tests/retiming.mjs` holds that queue
model and scores it against the flat rule. Over all takes the two are level (-0.379 against -0.356 per transition),
which is why the app kept the flat rule. But the split matters: the queue model wins on speech (-7.2 against -11.5)
and on the network signal, and loses on the four test-signal takes, whose 440 ms silences were built, by accident,
to sit exactly on the threshold. Speech is what the owner uses.

## The question

Should `voice_retime` run the queue model instead of the flat rule, and with what parameters? Answer with evidence a
reader can re-run, then, if the answer is yes, write the build order.

## What to settle

1. **A generative version of the queue model, from what the render knows.** `tests/retiming.mjs` predicts each
   transition from the take's earlier ones. The app has only the source: the gate's talk spurts (the frame log). So
   the model needs (a) when each spurt's first packet reaches the receiver, given the gate model: the first packet
   carries the 120 ms pre-roll, clients send voice once a frame and the server relays once a tick, and the Set D demo
   shows arrival gaps of 380 and 440 ms for identical 440 ms silences; derive the distribution of (arrival gap minus
   gate silence) from the demo and the takes and say what it rests on; (b) L0, which differs by session (learnt
   values 294 to 400 ms; under about 280 ms for listener B): a default, its spread, and whether it should be a
   control; (c) the 62.5 ms silence record; (d) what happens to the queue inside a spurt (the 5.8 ms trims of
   finding 10 drain it: by how much per second, and does that change which spurts append?).
2. **Does it predict speech better, honestly scored?** Fix every parameter from Set D and the test-signal takes
   first, write them down, then score on the takes not used: the speech take and the Set C baseline. Use a proper
   score for the early/late/unchanged pattern and a separate one for the size of each shift, against the flat rule
   under the same scoring. One speech take with 9 transitions is thin: say how much the result could be luck (for
   instance by simulating many seeds of each model and asking how often each reproduces the observed pattern).
3. **What the speech take shows that neither model has.** For example: the cumulative advance over a chain of early
   starts, whether the delay ever falls below the restart value by more than L0, the two shifts of -128 and -156 ms
   after long silences, and whether the within-spurt steps move speech audibly.
4. **A recommendation**, with its limits: replace the rule or keep it; the default parameters; what a listener
   would hear differently; and whether the default (source timeline) should change, which is the owner's decision,
   so give both sides and what it does to the dry/wet A/B and the real-take check.
5. **The recording that would settle most.** Design at most two short takes for the owner, with the exact console
   settings, for instance speech on the dedicated server with a SourceTV demo recorded at the same time (packet
   arrival for speech), and the same with `voice_buffer_ms` changed (does L0 follow it?). Say what each result would
   decide.

## Sources allowed

Measurements, the takes, the Set D demo, the engine's own console help, and public documentation. Valve's public
SDK was checked on 2026-11-10: it has the game code and the Steam voice API headers, and nothing of the receiver's
queue. No leaked engine source (CLAUDE.md).

## Files

May touch: `docs/reports/W3-01-phrase-timing.md` (the report), a new `docs/work-orders/W3-02-...md` (the build order,
only if the evidence supports one), `tests/retiming.mjs` (only to add a mode that prints what the report needs; its
present output must not change).

May not touch: any app file, `tests/REFERENCE_2026.md` (the orchestrator writes findings in once they are accepted),
`docs/PROGRESS.json`.

## Done means

- The report gives every number with the command that produced it, the parameters fixed before scoring, the
  held-out scores for both models, and what was not measured.
- Nothing from the private takes is in the repository: no audio, no file from the demo, no SteamID. Figures derived
  from them (delays, gaps, counts) are fine, as in tests/REFERENCE_2026.md.
- If a build order is written, it has the form of the other orders: files, spec, done means with a check for each
  claim, and it says how `tests/retiming.mjs` or a new test pins the model.
