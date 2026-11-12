# The owner's runs

The recordings and console runs only the owner can make, on the owner's own PC and game, gathered from the orders
they were written in. Each says what it would settle. The originals stay in their orders; where the two differ,
the order is the one the builder works from. What comes back is private: the recordings, logs and demos stay in the
owner's private repository, and only numbers measured from them are written here or in
[tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md) (CLAUDE.md, the hard rules).

Two things go with every run: how long Steam had been running (when it was last started, to the hour), since the
sender's hold depends on it (finding 28), and the `volume` and voice settings used.

| Run | State | What it would settle |
| --- | --- | --- |
| The re-check after a Steam update | to run after each Steam update | whether Steam's voice path is still the one the app runs |
| The key, for W3-11c | not run; W3-11c waits for it | how Steam's push-to-talk key starts and ends a phrase |
| `vaudio_miles` in an engine of 2006 or 2007 | optional; nobody has run it | whether the `miles` profile (not in TF2) is what such an engine does |
| A take of the test signal | run for Sets B, C, D and F; for any new setting | how the game's output compares with a render, by the real-take check and the accuracy suite |
| Steam with a file as the microphone (W3-14) | run 2026-11-10 (Set J) | done: Steam's packets, 16-bit decode and resampler kernel; it is the base of the re-check |
| The rooms (W3-17) | run 2026-11-10 (Set K), retaken the same night | done, but for the tail's decay and why Set B is dry |

The owner also holds the run sheet of 2026-11-11 (bad connections on one PC and on two, Steam's voice settings,
speakers and Sound quality), given privately; its blocks are named in `docs/PROGRESS.json`,
`waiting_on_the_owner`, and in [reports/bad-connections-plan.md](reports/bad-connections-plan.md), "The
recordings".

## The re-check after a Steam update

**What it settles.** Since 2026-11-10 a `steam` render runs Steam's own sender, the libopus release Steam's packets
match, Steam's 16-bit decode and FFmpeg's resampler on the `fma3` kernel. All of that was checked on one run with a
file as the microphone (Set J): the game's recording of a known 24 kHz clip came out of the app's chain in 524,286
of its 524,288 samples (measured; findings 16 and 29). A Steam update could change any of it. One short take of the same
kind, compared the same way, says whether it did.

**Steps** (those of W3-14, cut to one take):
1. Quit Steam completely and start it again, and note the time. Do not open the game's voice options or its
   microphone test first.
2. In Steam's console set `@voice_spew_activity_check 1` (one line per chunk, as Set J had) and `mic_inputfile` to
   the known 24 kHz clip used for Set J (16-bit mono, a 44-byte header).
   The path must be exact: a path that does not load is not retried.
3. In the game: `voice_loopback 1`, `voice_maxgain 1`, `voice_recordtofile 1`, `voice_showincoming 1`, Steam
   voice as the codec. Load a map.
4. Press the voice key once, with the first press after the map loads, for a few seconds. About half a second
   after the release, copy `voice_decompressed.wav` out of the game's folder (the next press overwrites it).
5. Keep the console log, Steam's console line `loaded voice input file ...`, Steam's version, and the PC's
   processor model.

**How it is compared** (the orchestrator, privately, by hand: no script in the repository does it yet): the clip is run through the app's chain on the run's own
chunk boundaries, as for Set J (W3-14's method, `docs/reports/W3-14-steam-file-input.md`), and the equal samples are
counted. On Set J two samples in 524,288 differed, both from one decoded sample one step apart. The same count
means nothing changed; any other is a finding for `tests/REFERENCE_2026.md` before any code changes.

## The key, for W3-11c

**What it settles.** Where the capture's steps fall after the key is pressed again, and what the first read brings;
whether the sound kept for the pre-roll survives a release; and perhaps why, in Set J, the game never collected the
last 0.67 s of one press. The app's push-to-talk is a stand-in until then (not built yet:
[LIVE.md](LIVE.md)). The full text, with the model it tests, is in
[work-orders/W3-11-steam-gate.md](work-orders/W3-11-steam-gate.md), "The run".

**Set-up.**
- Steam's uptime noted; if easy, the run twice: once on a Steam started within the hour, once on the Steam as it has
  been running.
- Steam's console: `@voice_spew_activity_check 1`. The game's console: `voice_showincoming 1`,
  `voice_showchannels 1`, `voice_loopback 1`, and the key bound so the console marks it:
  `alias +vr "+voicerecord; echo KEYDOWN"`, `alias -vr "-voicerecord; echo KEYUP"`, `bind v +vr`.
- A lossless recording of the output, through the same microphone path as Set D.
- Two tones: A (1 kHz at −20 dBFS, loud enough to keep the gate open) and B (2 kHz). `echo MARK1` and so on before
  each case, at least 3 s of key up between cases, each case three times.

**The six cases.**
1. A release left to run out: tone A; hold the key 5 s; release; wait 5 s.
2. A release and a press inside the tail: tone A; hold 3 s; release; press again as fast as you can (about 0.2 s);
   hold 3 s; release.
3. A press in mid-phrase, after the tail: tone A throughout; hold 3 s; release; wait about 0.7 s, then 1 s, then
   3 s in the three repeats; press and hold 3 s.
4. What the pre-roll holds after a stop: tone A; hold 3 s; release with A still playing; then stop A and wait 3 s
   in silence; press, wait 1 s in silence, start tone B.
5. A press in silence, then sound: silence; press; after 1 s tone A for 2 s; stop; release 2 s later.
6. A tap: the key down for under a tenth of a second, with tone A playing.

**Send:** both console logs whole, the recordings, the uptimes, and which microphone path was used.

## `vaudio_miles` in an engine of 2006 or 2007

**What it would settle.** `vaudio_miles` is not a TF2 codec, and the `miles` profile has not been checked against
any recording of a running engine. A recording from an engine that accepts the codec would show the rate it runs
at (the decoded length for the file's length), how many frames a packet holds, the decoded samples against the
profile's past the first frames, the gain's blocks, whether a short pause leaves the receiver's decoder as it was,
and, with a second player and `net_fakeloss`, what a lost packet sounds like. Nobody has run this. The variables
below are registered in both engines with default 0 (read); what they do there was not run, and the file names are
TF2's of today, not read for these builds. The original is in
[work-orders/W3-20b-miles-profile.md](work-orders/W3-20b-miles-profile.md), "One day".

1. Install Source SDK Base 2006 or 2007 from Steam's tools and start a mod on it, as a listen server with
   `maxplayers 2` or more (with one slot the server names no codec: read).
2. Before `map`: `sv_voicecodec vaudio_miles`. After the map loads, keep the console's text: a codec that failed
   to load prints that voice is disabled.
3. `voice_loopback 1`, `voice_showincoming 1`, `voice_maxgain 1`, `voice_inputfromfile 1` with a 16-bit mono
   11025 Hz WAV of a signal of ours as `voice_input.wav` in the game's folder (2007 also has
   `sv_allow_voice_from_file`, default 1), and `voice_recordtofile 1`. Hold the talk key for the file's length;
   release; press again after a second, and once more after a pause of a tenth of a second.
4. Keep `voice_decompressed.wav` and `voice_micdata.wav` if they appear, and the console log. Repeat at
   `voice_maxgain 10`. `voice_writevoices 1` may keep each channel's voice without a length limit.

## A take of the test signal

**What it settles.** How the game's output compares with a render of the same source, for the settings under test:
the page's real-take check ([PAGE.md](PAGE.md)) and the accuracy suite ([tests/README.md](../tests/README.md)) do
the comparison. The signals are rebuilt bit for bit by
[tests/testsignal/](../tests/testsignal/README.md), which also has the recording steps in full.

1. Set `voice_loopback 1` and push-to-talk, with the voice settings under test.
2. Play the WAV into the microphone input at unity gain through a virtual cable.
3. Record only the game's output, losslessly.
4. Note the TF2 and Steam versions, Steam's uptime and the `volume` value.

A take for a room is the game's output: `voice_recordtofile` taps the voice before the mixer and holds no room. For
the receiver's queue, log the console with `voice_loopback 1`, `voice_showincoming 1` and `voice_showchannels 1`,
and note the frame rate; [tests/voicequeue/](../tests/voicequeue/README.md) turns the log into numbers.

Still wanted, optional: one take of several minutes of steady sound with no pauses, at `fps_max 67` with the
channel's log on. It would show whether a long unbroken phrase reaches the queue's fade and underruns as the read
rules predict (after 1.3 to 2.8 minutes at 67 fps, inferred).

## Done: Steam with a file as the microphone (W3-14)

Run on 2026-11-10 (Set J). It settled that the app's libopus 1.1.5 gives Steam's packets, how Steam's 16-bit decode
treats peaks, and that Steam runs the resampler's `fma3` kernel on the owner's PC (findings 16, 28 and 29). Its steps
are in [work-orders/W3-14-steam-file-input.md](work-orders/W3-14-steam-file-input.md), "What is known about the
recording", and its method in the report of the same name. The re-check above is the same run, cut to one take.

## Done: the rooms (W3-17)

Run on 2026-11-10 (Set K: the console readings, an `adsp_debug 2` walk on 2Fort, the takes R1, R2, R3, R5, Q1 and Q2 as six lossy screen captures,
and R1 and R3 again losslessly), and R1 and R3 retaken that night at `volume 0.5` with `voice_overdrive 1000`. What it showed is in the order's
amendment after Sets K and L and in finding 32. Two things are still open: the room's tail decay cannot be read from
any take so far (the map's ambience covers it from its first 20 ms), and why Set B has no room is not explained. The
procedure stays in [work-orders/W3-17-room-effects.md](work-orders/W3-17-room-effects.md), "The owner's recording".
