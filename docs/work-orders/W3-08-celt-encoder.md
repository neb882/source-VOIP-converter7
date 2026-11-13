# W3-08: why the app's CELT does not give the game's samples

> **Status 2026-11-12: done (investigation)** at `8451e59`. Report: `docs/reports/W3-08-celt-encoder.md`.

**Branch:** `claude/w3-08-celt-encoder`, from `main`. **Worktree:** given in the brief. **Agent:** an investigator on
the stronger model. It may build codec variants in scratch; it changes no app code. **Time budget:** 3 hours.

## Why

Set H gave an exact reference for the legacy codecs: the owner ran `vaudio_celt` and `vaudio_celt_high` with a known
synthetic file as the microphone and the game wrote its decoded output (docs/PROGRESS.json, `stands.gain_exact`).
The app's bundled CELT 0.11, fed the same input, reaches only 17 to 23 dB against the game's output, at every frame
alignment and at complexities 0, 3, 5 and 10. So the app's encoder (or decoder) is not the game's. W3-06 as written
changes the complexity and the mode, which this shows is not enough.

## The question

What must the app run to reproduce `celt_gain1.wav` from `voice_input.wav` sample for sample, or as near as a
different compiler allows, and the same for `celthigh_gain1.wav`?

## How

1. **Read `vaudio_celt.dll`** (the owner's file; W3-03's report has where the mode table and the encoder set-up are):
   every `celt_encoder_ctl` and `celt_decoder_ctl` call and its arguments, how the mode is made (custom mode
   arguments), what is passed to `celt_encode` (int16 or float, the scale, the packet size, any header byte the
   module adds or strips), whether frames are coded independently, and anything the module does to the samples
   before or after the codec. The file exports the library's functions by name, which helps place them.
2. **Find the library version by experiment.** The bundled build is the `celt-0.11.0` tag. Build the neighbouring
   releases and snapshots in scratch with `tests/celt011/build.mjs`'s method (0.11.1 and later 0.11.x, and the
   commits around them) and run each over the input: the one whose decoded output matches the game's is the version.
   Vary what the reading leaves open (VBR or constant bitrate, prediction/intra settings, the input scale, int16
   against float entry points, a start offset in the file, the first packet).
3. **Say what "match" is reached**: identical samples, or a residual, and then what the residual is (float rounding
   between an x64 build and WebAssembly is expected to be far smaller than what is seen now).

## Files and data

May touch: `docs/reports/W3-08-celt-encoder.md` only. The reference recordings and the log are private
(Set H of the private repository, and the clip the game was fed): read-only, nothing from them
in the repository but numbers. The game file is never executed and nothing of it is copied into a repository. No
leaked engine source.

## Done means

The report names the version and settings that reproduce the game's output, with the match reached and the command
that shows it, or says what was ruled out and what remains. It ends with the exact changes order W3-06 should make
(the pinned source, the build's hash procedure, the profile's settings), and a private check the orchestrator can
run: a script path and its expected output.
