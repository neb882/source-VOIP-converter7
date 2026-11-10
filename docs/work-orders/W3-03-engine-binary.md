# W3-03: what the game's own files say about the voice receiver and the legacy codecs

**Branch:** `claude/w3-03-engine-binary`, from `main`. **Worktree:** given in the brief. **Agent:** an investigator on
the stronger model (docs/PIPELINE.md, "Which model does what"). It reads and writes; it changes no app code.
**Time budget:** 4 hours.

## Why

The aim of the project is to run what the game runs. The codecs are identified from packets, and the receiver's
gain law from recordings, but two things still rest on inference: how the receiver queues voice (which decides when
phrases start: findings 10, 19 and 21, and order W3-01), and the settings of the legacy codecs
(`tests/LEGACY_CODECS.md`). The owner has supplied the files of their own install: `engine.dll`, which holds the
voice receiver, and `vaudio_celt.dll`. The engine still carries its debug messages ("Voice - %d incoming samples
added to channel %d", "Voice - chan %d, ent %d, bufsize: %d", "Voice - mixed %d samples from channel %d"), which
anchor the functions. The game's `find voice` output is at hand too, with every voice variable's default.

This is a new kind of source for the project, allowed by the owner on 2026-11-10: the game's shipped files as the
owner has them. Leaked engine source stays excluded (CLAUDE.md).

## Questions, in order of value

1. **The receiver's queue.** From the function that takes incoming voice and the one that mixes it:
   - how large a channel's buffer is and how `voice_buffer_ms` (default 100) enters;
   - when a channel that has no voice queued starts to play after voice arrives (the restart latency the takes show
     as about 320 to 375 ms on one PC and under 280 ms on another: what is it made of?);
   - what happens when new voice arrives while voice is still queued, and when the queue runs dry;
   - whether and how queued latency is trimmed during continuous voice (the takes show the delay falling in steps of
     about 256 samples at 44.1 kHz);
   - what an end-of-transmission marker and Steam's silence record do to the channel;
   - `voice_fadeouttime` (0.1), `voice_overdrive` (2) and `voice_overdrivefadetime` (0.4): what each does.
2. **The receiver's gain and output.** Check the measured model against the code, constant by constant: the blocks
   the auto-gain works in, how `voice_avggain`, `voice_maxgain` and `voice_scale` enter (finding 4 says `voice_scale`
   enters twice), the fixed-point ramp, the clamp, and the resampling to the mixer's rate. Say for each whether the
   code confirms the measured value, corrects it, or could not be read.
3. **The sender's side in the engine.** How the engine pulls voice from Steam and sends it: how often, in what
   batches, what it writes around each payload, and what ends a transmission. This is the packet timing W3-01 needs.
4. **The debug variables.** What `voice_showincoming`, `voice_showchannels`, `voice_profile`, `voice_recordtofile`,
   `voice_inputfromfile`, `voice_writevoices`, `voice_debugfeedback` and `voice_debugfeedbackfrom` print or write,
   and under what conditions, so the owner can be asked for exactly the run that measures the queue directly.
5. **The CELT profiles.** From `vaudio_celt.dll` and the engine: the sample rate, frame size, packet bytes,
   complexity and prediction settings of `vaudio_celt` and `vaudio_celt_high`. The engine's help text says "22kHz,
   22kbps" and "44kHz, 44kbps"; the app's `celt_44` profile runs 256-sample frames in 120-byte packets, which is far
   more than 44 kbps. Which is right?
6. **Speex.** No Speex library ships in this folder. Whatever the engine still says about `vaudio_speex` (how it
   would be loaded, its frame and packet sizes, a quality number) is worth having.

## How claims are made

- Every claim cites where it was read: the file's SHA-256, the address, and the constant or the instructions' bytes,
  so another reader can find it. Mark each claim as read from the code, or inferred, with a confidence.
- Describe behaviour in your own words and give constants. Do not put disassembly listings, decompiled functions or
  any part of the binaries into the repository. Short pseudo-code you wrote yourself to state a rule is fine.
- Where the code and a measured finding in `tests/REFERENCE_2026.md` disagree, say so plainly and do not smooth it
  over: the takes are evidence too, and the disagreement is the finding.

## Files

May touch: `docs/reports/W3-03-engine-binary.md` only.

May not touch: any app file, `tests/REFERENCE_2026.md`, `tests/LEGACY_CODECS.md` (the orchestrator writes findings
in once they are accepted), `docs/PROGRESS.json`, and nothing of the game's files goes into this or any repository.

## Done means

- The report answers each question or says why it could not be answered and what would answer it.
- For the queue (question 1) it ends with the rule as a short piece of pseudo-code and the list of its constants,
  and says what it predicts for the speech take's transitions (order W3-01 has them).
- A list of the checks the owner could run in the game to confirm the reading (question 4).
