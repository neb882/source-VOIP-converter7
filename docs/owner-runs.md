# The owner's runs

The recordings and console runs only the owner can make, on the owner's own PC and game, gathered from the orders
they were written in. Each says what it would settle. The originals stay in their orders; where the two differ,
the order is the one the builder works from. What comes back is private, but for what an order names in `tests/recordings/manifest.json`: the recordings, logs and demos stay in the
owner's private repository, and only numbers measured from them are written here or in
[tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md) (CLAUDE.md, the hard rules).

Two things go with every run: how long Steam had been running (when it was last started, to the hour), since the
sender's hold depends on it (finding 28), and the `volume` and voice settings used.

| Run | State | What it would settle |
| --- | --- | --- |
| For the evening of 2026-11-20: files to copy, a real server's log, and what Steam captured | asked 2026-11-20; part A done 2026-11-21 (every file and the cable's format received, the files being read); parts B and C not done | where the 31.25 ms capture step comes from, Windows's capture resampler (by its files, and sample by sample by Steam's own file of what it captured), the owner's own copy of Steam's timer library, and the queue's fade and underrun |
| The re-check after a Steam update | to run after each Steam update | whether Steam's voice path is still the one the app runs |
| The key, for W3-11c | not run; W3-11c waits for it | how Steam's push-to-talk key starts and ends a phrase |
| `vaudio_miles` in an engine of 2006 or 2007 | run once, on 2026-11-13, in Source SDK Base 2006, with a file as the microphone and with speech; not run: the 2007 engine, a second player, a lost packet | whether the `miles` profile (not in TF2) is what such an engine does |
| A take of the test signal | run for Sets B, C, D and F; for any new setting | how the game's output compares with a render, by the real-take check and the accuracy suite |
| Steam with a file as the microphone (W3-14) | run 2026-11-10 (Set J) | done: Steam's packets, 16-bit decode and resampler kernel; it is the base of the re-check |
| The rooms (W3-17) | run 2026-11-10 (Set K), retaken the same night | done, but for the tail's decay and why Set B is dry |

The owner also holds the run sheet of 2026-11-11 (bad connections on one PC and on two, Steam's voice settings,
speakers and Sound quality), given privately; its blocks are named in `docs/PROGRESS.json`,
`waiting_on_the_owner`, and in [reports/bad-connections-plan.md](reports/bad-connections-plan.md), "The
recordings".

## For the evening of 2026-11-20: files to copy, a real server's log, and what Steam captured

Asked 2026-11-20. Part A takes a few minutes and needs no game. Part B needs a server where someone is playing
music or talking without pause. Part C needs the virtual cable and the test signal, and no server.

### A. Files to copy

Copies only; nothing is changed on the PC. They are read as data and kept out of every repository, as the game's
files are (CLAUDE.md, the hard rules).

| File | Where | What it would settle |
| --- | --- | --- |
| `dsound.dll` | `C:\Windows\System32\` | where the 31.25 ms capture step comes from, and when the notice at the capture buffer's end is set. Steam only asks Windows for the read position (finding 28, the paragraph of 2026-11-20) |
| `AudioEng.dll`, `AudioSes.dll` | `C:\Windows\System32\` | Windows's own conversion of the microphone to 24 kHz, which the app imitates with a filter fitted to one measurement |
| `tier0_s64.dll`, `vstdlib_s64.dll`, `steam.exe` | the Steam folder (where `steamclient64.dll` is) | the clock of Steam's hold was read in Valve's public copy; that the owner's copy is the same is inferred. `steam.exe` helps say which process captures |

With them: the Windows build number that `winver` shows, and when Steam was last started.

**Received 2026-11-20:** all six, with `resampledmo.dll` (asked the same evening) and the current
`steamclient64.dll` (Steam had updated since the copy of 2026-11-10). The Windows build is in the files: 26100.

**Asked later the same evening**, after the first read of `dsound.dll`: DirectSound's capture hands the work to the
older wave input interface, so the timing of the capture's steps and the conversion to 24 kHz are in files further
down (read once, being read a second time).

| File | Where | What it would settle |
| --- | --- | --- |
| `winmm.dll`, `winmmbase.dll`, `wdmaud.drv` | `C:\Windows\System32\` | when a capture step is handed back, which is where the 10 ms grid behind the 250 ms pattern should be |
| `msacm32.drv`, `msacm32.dll` | `C:\Windows\System32\` | the wave mapper and its converter, one candidate for the conversion to 24 kHz |
| `audiosrv.dll`, `audiodg.exe`, `AudioKSE.dll`, `MMDevAPI.dll` | `C:\Windows\System32\` | which converter a capture stream gets, at which quality, with or without dither (`MMDevAPI.dll` added after the resampler's second read) |
| `steamui.dll` | the Steam folder | which process starts the loop that reads the microphone (optional) |

And one setting, no file: the microphone's format as Windows shows it (Settings, System, Sound, the input device,
"Format": the sample rate and bit depth, and the same for the virtual cable if the takes used one). The conversion
depends on the rate it starts from.

**Received 2026-11-21:** all ten files of the table above (`SteamUI.dll` with them), and the virtual cable's
format: 2 channels, 24 bits, 48,000 Hz, input volume 100. Part A is done. The files are rows F33 to F42 of the
record's table of files ([tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md), "The files that were read"); a
first read of them began the same day. Not asked and welcome: the format of the real microphone, for the takes
made with speech.

### B. A real server's log

For the one measurement the finish line still lacks, the queue's fade and underrun in sound: a phrase that opens at
`fps_max 67` and runs unbroken for three minutes or more. Each line is pasted whole into the console.

1. When the speaker is playing:
   `con_logfile voice_server3.log; echo MARK300; fps_max; voice_buffer_ms; snd_mixahead; voice_showincoming 1; voice_showchannels 1`
   Leave it about two minutes.
2. `echo MARK67; fps_max 67; voice_showchannels 2; voice_modenable 0`
   Count to five.
3. `echo REOPEN; voice_modenable 1`
   Leave it five minutes.
4. `echo END; voice_showincoming 0; voice_showchannels 0; fps_max 300; con_logfile ""`

Step 2 turns voice off so that step 3 opens the speaker's channel afresh at 67 frames a second. Whether
`voice_modenable` does that is not tested: if the sound does not stop at step 2, mute the speaker on the scoreboard
for five seconds instead, then unmute.

Amended later on 2026-11-20: `snd_mixahead` joins step 1, so the log holds its value. A private reading of the
same day infers the owner's is 0.05 where the record has 0.1 (not read a second time yet); the line the console
prints settles it.

What comes back: `voice_server3.log` from the `tf` folder, a screenshot with `net_graph 1` up during the part at 67,
and the speaker's ping. A recording of the desktop's sound over the same minutes is welcome and not needed.
The log holds other players' names in its other lines: it stays private, and only numbers are taken from it.

### C. What Steam captured (added late on 2026-11-20)

The one take that would show Windows's conversion of the microphone to 24 kHz sample by sample: Steam writes every
sample it reads from the capture to a file, before its gate and its encoder. No game file or Windows file can
replace it. It needs the virtual cable and the test signal
([tests/testsignal/](../tests/testsignal/README.md), `tf2_voice_testsignal_v1.wav`, 142.9 s), and no server.

1. Make an empty folder with a short path, for example `C:\tf2voice`.
2. In **Steam's** console (`steam://open/console` from a browser or the Run box), two lines, one at a time:
   `mic_outputfile C:\tf2voice\mic_out.wav`
   `@voice_spew_activity_check 1`
3. In the game's console, before the map:
   `con_logfile voice_micout.log; voice_loopback 1; voice_maxgain 1; voice_recordtofile 1; voice_showincoming 1; map itemtest`
4. Once the map has loaded, hold the voice key, play the test signal through the cable once from start to end, wait
   two seconds, and let the key go. One press for the whole signal.
5. About a second after letting go, copy `voice_decompressed.wav` out of the game's `tf` folder (the next press
   overwrites it).
6. Quit Steam completely (Steam, Exit). The file is only whole once Steam has closed.
7. After starting Steam again, type `mic_outputfile` in its console. If it still shows the path, clear it with
   `mic_outputfile ""`, or Steam goes on writing the microphone to that file every time voice is used.

What comes back: `mic_out.wav`, `voice_decompressed.wav`, `voice_micout.log` from the `tf` folder, the text of
Steam's console (or `logs\console_log.txt` from the Steam folder), and the microphone's and the cable's format as
Windows shows them (part A's last paragraph).

What is read and what is not (the current client, 2026-11-20, read once): the file is opened at the first read of
the microphone after the variable is set, a 44-byte header with empty lengths is written, and each read's samples
follow as they were read (`steamclient64.dll` `0x1380d6785` to `0x1380d69a1`); Steam's own message says "close
Steam before using". Not tested: that Steam's console lets the variable be set (`mic_inputfile`, registered beside
it, could be: Set J), and whether the folder must exist. `voice_decompressed.wav` beside it makes the take a second
one of Set J's kind, with a real capture in place of a file: the game's decode of sound whose input is known to the
sample.

## The queue at low frame rates, for W3-23 (added 2026-11-14)

Not urgent; nothing waits on it but W3-23's check against the game. It goes in the same session as the run sheet's
block on the queue (block 2 or block 5, whichever is recorded first), after that block's part at `fps_max 67`, with
its console log still on. The game sets `fps_max` under 30 back to 30 unless cheats are on (read, W3-23r).

1. On the console of the PC that ran `map`, and on the listener's if that is another PC:
   `sv_cheats 1`
2. On the listener's console:
   `voice_showchannels 2; fps_max 30`
3. On the talker: `+voicerecord`, about 20 s of speech, then `-voicerecord`.
4. On the listener's console:
   `fps_max 20`
5. On the talker: `+voicerecord`, about 20 s of speech, then `-voicerecord`.
6. On the listener's console, and `sv_cheats 0` on the PC that ran `map`:
   `fps_max 300; voice_showchannels 0; sv_cheats 0`

What it gives: `voice_showchannels 2` prints a line for every pull of the mixer, so the console's own order of lines
shows a frame's steps at 30 and 20 frames a second (W3-23, "What would settle it against the game").

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

**What it would settle.** `vaudio_miles` is not a TF2 codec. Its codec stage was checked against one sitting of a 2006 engine on 2026-11-13; the profile as the app runs it was not. A recording from an engine that accepts the codec would show the rate it runs
at (the decoded length for the file's length), how many frames a packet holds, the decoded samples against the
profile's past the first frames, the gain's blocks, whether a short pause leaves the receiver's decoder as it was,
and, with a second player and `net_fakeloss`, what a lost packet sounds like. It was run once, on 2026-11-13: one
sitting of Source SDK Base 2006 with a file as the microphone at `voice_maxgain` 1 and 10, and a shorter one of
speech; what it settled is in [FINDINGS.md, entry 11](FINDINGS.md#11-vaudio_miles-and-voxware-vr12-never-in-tf2).
It did not run the 2007 engine, a second player or a lost packet. The variables
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
5. One press a file: the game writes its two files again at every release of the key, so copy them away before the
   next press (`tests/REFERENCE_2026.md`, "The file-input runs, measured again").

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
