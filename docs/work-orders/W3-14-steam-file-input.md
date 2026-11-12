# W3-14: the Steam path against a known input, when the owner's recording exists

> **Status 2026-11-12: done (investigation)** at `c0a0833` to `919a66c` (no merge commit; on main). Report: `docs/reports/W3-14-steam-file-input.md`. The owner's file-input recording is in (Set J); nothing here waits any more. Its steps are also in `docs/owner-runs.md`.

**Kind:** an investigation on the stronger model, run by the orchestrator. Not a builder's order: its one check
is whether the evidence is read rightly, and its method had a dead end before it was written. It changes no app
code. **Starts when** the owner's file-input recording is in the takes folder; until then nothing waits for it.
**Branch:** `claude/w3-14-steam-file-input`, from `main`. **Time budget:** 4 hours. **Writes:**
`docs/reports/W3-14-steam-file-input.md`, and proposed text for findings 16, 28 and 29 of
`tests/REFERENCE_2026.md`. Scripts stay in the scratch folder; nothing of the recording is committed, only
counts.

## Why

Three things in the `steam` render are read or inferred, not checked against Steam sample for sample:

1. whether the app's libopus 1.1.5 at complexity 9 gives Steam's packets bit for bit;
2. whether Steam's 16-bit decode softens peaks past full scale, as a float build of libopus does;
3. which kernel of the decoder's resampler Steam's build runs on the owner's PC (W3-13: `fma3` by default,
   `avx`, `sse`, `c`; they differ in the last bit of a few samples).

The owner will run Steam's `mic_inputfile` with a known 24 kHz clip and the game's `voice_recordtofile 1` at
`voice_maxgain 1`. If Steam accepts the variable, the game writes its decoder's 44.1 kHz output for an input
that is known to the sample. That one recording can settle all three.

## What is known about the recording

*Run on 2026-11-10 (Set J). The re-check after a Steam update in `docs/owner-runs.md` is this run cut to one take (2026-11-12).*

- `voice_decompressed.wav` holds **whole packets as decoded**, taken before the channel drops its one sample
  per packet (W3-03's report, "For the recording session", point 3). There is no drop to model.
- At `voice_maxgain 1` the gain is **exactly unity** (`fixed` 128, `step` 0), from the first sample: the reset
  that a new channel brings leaves it at unity for the first block too, whatever the settings (W3-05's second
  read). The one way out is a 128-sample block whose mean and peak sum past 65,534, which is near-constant
  negative full scale.
- The file is capped at 1 MiB: about 11.9 s, about 525,000 samples. Each key press starts it again.
- With a file as the microphone Steam's chunks have no grid: a chunk is the time since the last frame times
  24000. A spurt's frames are still 480 samples from the spurt's own start, so only that start is unknown.
- The clip loops in real time: 5.000 s (120,000 samples at 24 kHz) for the continuous clip, 5.600 s for the one
  with silences. So the recording holds about two loops, and where in the clip a spurt began is not known.
- The owner's clips peak at about -3.8 and -2.2 dBFS.
- **Where the file starts.** Under the Steam codec the file is read by Steam, not by the engine: `mic_inputfile`
  skips exactly 44 bytes when the file begins with `RIFF` and looks at no header field (W3-09), so the clip's
  sample 0 is the first sample Steam plays. The two samples that the engine's own file reader skips (W3-08)
  belong to `voice_inputfromfile` under the engine codecs and are **not** in this path: expect no fixed offset
  of that kind. A clip saved with a longer header (extra chunks before the data) would play its extra header
  bytes as sound and shift everything by half their count; check the clip's header is 44 bytes before
  anything else. Where in the loop a spurt began is searched in any case (step 2).
- **The resampler's state is carried in.** Steam keeps one resampler as long as the speaker's decoder, across
  channel reassignments and reconnects (finding 29). If Steam has decoded this speaker before in the same
  Steam run, the recording's first packet is not a stream's first: the phase at its first sample is unknown
  (147 possibilities), the 16-sample lateness is already in, and there is no flush in the file. If it has not
  (Steam freshly started, the first key press), the recording begins a stream: phase 0, the start mirrored,
  and the first packet's flush in the file.
- **The recommendation: search the phase always, and ask the owner for a fresh start as well.** The search
  (step 1) costs nothing and does not depend on how the run was made, so the method never assumes a fresh
  stream. A fresh start is still worth asking for, because it is the only way the first-packet flush gets
  into a recording (W3-09 lists it as never seen). The owner's steps, in full: *"(1) Quit Steam
  completely and start it again before the run. (2) Do not open the game's voice options or its microphone
  test before the first recording (that also brings voice up, and a decoder with it). (3) Note Steam's
  console line `loaded voice input file ...`. (4) Make the first recording with the very first key press
  after loading the map, and note which recording was the first. (5) After each key press, once the file is
  written (about half a second after release), copy `voice_decompressed.wav` from the game's folder aside
  before pressing again: each press overwrites it. (6) Keep the console log with `voice_showincoming 1` on.
  (7) Note the PC's processor model."* The processor matters because the resampler's kernel is the receiving
  PC's (with loopback, the same PC): one without FMA3 or AVX rules kernels out before anything is run. If the first recording's
  best phase is 0 and its first packet's last 29 or so output samples fit the mirrored flush, that is the
  first-packet behaviour seen; if its phase is not 0, Steam's decoder was not new, and nothing is lost.

## What it needs

W3-13's module (`vendor/swresample/swresample.js`) and W3-11a's rebuilt Opus module with the 16-bit decoder, or
scratch builds of both made for this order by their orders' steps. `steam-sender.js` is not needed: the
recording says where the spurts are.

## Method: forward, not backward

**The dead end.** Recovering the 24 kHz samples from the recording by inverting the resampler (least squares,
rounding, a search one step up and down) does not work: the plan's second read prototyped it and was left with
25 wrong inputs in 12,000, more than the kernels differ by. Do not rebuild it. Its scripts are in the review's
scratch folder (`recov.mjs`, `recov2.mjs`, `kdiff.mjs`) if the session still has them.

1. **Structure: the packets from the console log, the phase from the recording.** The owner runs
   `voice_showincoming 1` with a console log, which gives every packet's decoded sample count in order. That
   is the packet structure with no fitting: a sound message's frames are its count over 882, and a silence
   record's count is its own (with a file as the microphone there is no capture grid, so **a record can be
   any length**, not only 1378 or 2756). Line the log up with the recording by the running sum of counts (the
   file holds whole packets from a key press on). The least-squares fit is used for two things only: for each
   of the 147 phases, fit a stretch of the recording as the resampler's output of some 24 kHz signal (no
   rounding) and take the residual. The right phase stands out at once (the prototype: 0.19 of a 16-bit step,
   against 350 to 420 at the wrong ones). **If the best residual is over one step, stop:** the recording is
   not this resampler's plain output, and W3-09's reading of the path is in question; report that. Keep the
   fitted samples, which are good enough to line the clip up and not good enough to compare. If there is no
   log, mark the spurts and records from the recording's runs of exact zeros and say that the frame counts
   are then inferred.
2. **Where each spurt began in the clip.** Correlate the fitted samples with the looped clip, then try every
   start within 480 samples of the peak. A press of 13 s against the file's 11.9 s is fine: the first 1.1 s or
   so of the clip's second loop is the overlap this search uses. **Three cases for the spurt's opening, try
   each:** (a) a pre-roll of the clip's earlier samples (the gate was SILENT with sound kept); (b) a pre-roll
   of 2400 zeros (a fresh capture, nothing kept); (c) **no pre-roll at all.** With the continuous clip the
   gate never closes, so when a key is released the 0.5 s tail runs out with the spurt still open; the next
   press sends the end marker alone, and its first active chunk opens from the ENDED state, a new spurt with
   no pre-roll that starts at that chunk. So every recording after the first of a run is expected to be case
   (c), and the first to be (a) or (b).
3. **Forward.** From each candidate start: cut the clip into 480-sample frames, the last padded with zeros;
   encode with the `steam` profile's encoder, a fresh state per spurt (libopus 1.1.5, 24000 Hz, VOIP, 32000
   bit/s, signal voice, DTX on, complexity 9); decode with the 16-bit decoder, a fresh state per spurt; lay the
   frames and the zero runs into one 24 kHz stream as the recording has them; resample that stream under each of
   the four kernels from the phase found; compare with the recording at 44.1 kHz, sample for sample. Do it a
   second time with the float decoder clamped and rounded in place of the 16-bit one.
4. **Leave out of the count** every output sample at -32768 or 32767 in the recording (and say how many).

## What counts as a match, and what each miss means

**A match:** one kernel with 0 differing samples and every other kernel above 0, over at least 200,000 output
samples, on a stretch whose peaks are above -6 dBFS (at speech level the kernels can agree everywhere: over
55,000 outputs they differ in 0 to 1 at -24 dBFS and in 5 to 31 near full scale). Then all three questions are
answered at once: the packets are Steam's, the decode is Steam's, and that kernel is Steam's.

| What comes out | What it means | What follows |
| --- | --- | --- |
| One kernel at 0, the others above | everything matches | `DEFAULT_KERNEL` in W3-13's module is set to it if it is not `fma3` (one line, then the `steam` golden hashes); findings 16, 28 and 29 say "checked sample for sample" |
| Two or more kernels at 0 | the stretch was too quiet or too short to tell them apart | say so; the other answers stand; ask for a louder clip |
| A few samples in ten thousand differ by 1 under the best kernel, spread evenly | a kernel or a build not among the four (Valve ships 8.1.2, built with another compiler), or the compiler's last bit in the codec | report the counts per kernel; the default stays; say it in finding 29 |
| Small differences nearly everywhere, and they vanish, or shrink to the row above, with the float decoder clamped and rounded | Steam's 16-bit step is a plain clip, not the soft one | W3-11a's decode is changed back by an order; finding 29 corrected |
| Small differences only where the decoded wave is near full scale | the soft clip differs (or is absent): compare the two decoders' counts there | as above |
| Large differences from a spurt's first frames on, at every start tried | the packets are not Steam's: the encoder's release, a setting, or the input's rounding | give the difference in dB per spurt and the frame sizes if a demo was recorded too; an order for the stronger model |
| No start in the clip correlates | the clip that played is not the clip in hand, or Steam did not take the file | ask the owner; check Steam's console for `loaded voice input file` |

If SourceTV was recording as well, the demo has the packets themselves: compare the app's packets with them
byte for byte first (question 1 by itself), then decode the demo's packets and do step 3 from there, which
separates the encoder from the decoder cleanly.

## Report

What was run, the phase and its residual, the spurts found, the start chosen for each, the table of differing
samples per kernel and per decoder, the largest difference, how many samples were left out as clipped, which
row of the table above it is, and the proposed text for the reference. Say what was not done.

## Added 2026-11-10: how `mic_inputfile` behaves (a second read of the Steam client, the same day)

The owner's first try showed that setting the variable prints only its echo. Read then, from the same file as
W3-09 (addresses in the scratch notes; none of this is measured yet):

- **The file is loaded on the first read of microphone data** after the variable's text differs from the path
  last loaded: in practice the first Steam frame after the voice key goes down. The line is then
  `loaded voice input file <path>, <N> samples (<S> seconds)`, with N the file's bytes less 44, halved. Nothing
  looks at the header's fields: any file is read as 16-bit mono at 24000 Hz. There is no change callback.
- **A new path takes effect at the next read** (the next key press, or at once inside the 0.5 s after a release):
  the new file is loaded and starts from its first sample. The same text typed again does not reload.
- **The position carries on between key presses** and does not advance while the key is up (reads go on through
  the 0.5 s after a release). The clip loops without a seam, printing `voice input file <path> looped`.
- **The first chunk of a press is a burst:** the chunk's length is the time since the last file read times
  24000, truncated, and capped at 6000 samples less what was carried. After a pause, or just after a load, that
  is the cap: a quarter of a second of the file in one chunk. Later chunks follow Steam's frame times, with no
  750-sample grid. The time is kept as a 32-bit float, so chunk lengths jitter by its resolution.
- **Nothing else differs from the microphone:** the samples are copied one for one into the buffer the device
  would fill; the gate, the hold, the encoder and the 0.5 s after a release are the same code.
- **A path that does not load is not retried** and may flood the console with `looped` lines or stop Steam: the
  path must be exact.
- **A working capture device is still needed:** without one the reader is never called.

For the comparison this means: the recording's first spurt opens with a first chunk of up to 6000 samples from
the clip's first sample (if the file was just loaded), so its pre-roll is what the sender's rule gives for an
onset in the first chunk; a later press starts where the previous press's tail stopped in the clip; and the chunk
lengths are not the microphone's, so `@voice_spew_activity_check`'s lines from this run describe file input, not
the capture grid. A microphone run with that variable on is still needed for the sender's drawn clock.
