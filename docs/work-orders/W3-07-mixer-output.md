# W3-07: from the voice channel to the speakers, as the engine does it

**Branch:** `claude/w3-07-mixer-output`, from `main`. **Worktree:** given in the brief. **Agent:** an investigator on
the stronger model. It reads the owner's own game files and writes; it changes no app code. **Time budget:** 3 hours.

## Why

W3-03 read the receiver up to the voice channel's ring and stopped where the mixer takes over ("What was not read").
The modern preset's last stage is still inferred from recordings: a resample from 44.1 kHz to the output rate, a
`[0.1, 0.8, 0.1]` filter that W3-03 did not find in the voice path, `volume`, and a clamp. One result is unexplained:
on the second PC of Set D the listener's peaks sit 2.5 dB above the clamp the model predicts for its `volume`
(tests/REFERENCE_2026.md, Results, "Listener B"). The aim is the rule, as for the queue.

## Questions, in order of value

1. **The voice source in the mixer.** How a 16-bit mono 44.1 kHz voice source is mixed into the output: the pitch
   and rate conversion (what interpolation, what happens when the device runs at 44.1 kHz and at 48 kHz), the
   512-sample pulls W3-03 saw and where they come from, the mix-ahead, and whether voice is spatialised or attenuated
   in any way (it is not positional in this game: confirm).
2. **Everything between the mix and the device:** the order of `volume`, any filter or DSP stage (is the
   `[0.1, 0.8, 0.1]` shape anywhere: a low-pass in the paint buffer, the room DSP at `dsp_room 0`, a "soft clip"),
   the final clamp and its width, and what differs between output paths (the game can use more than one audio
   backend). Say for each stage whether voice goes through it.
3. **Listener B.** Which of those stages could put peaks 2.5 dB above `volume` times full scale on one PC and not on
   another (a different backend, a device that is not 16-bit, a surround or headphone mode, a float mix)?
4. **`voice_overdrive`**, already read: confirm only that it never changes the voice itself.
5. **What the model's Model table should say** for this stage, constant by constant: confirmed, corrected, or not
   readable.

## How claims are made

As W3-03: every claim cites the file's SHA-256, the address and the constant or instruction bytes; marked as read or
inferred, with a confidence. Behaviour in your own words; no listings, no decompiled code and no part of the files in
any repository. Where the code and a measured finding disagree, say so. No leaked engine source.

## Files

May touch: `docs/reports/W3-07-mixer-output.md` only.

## Done means

The report answers each question or says why it could not and what would; it ends with the stage's rule as short
pseudo-code with its constants, and with the checks the owner could run in the game to confirm it (console
variables, a recording), each with its predicted result.
