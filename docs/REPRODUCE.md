# Check it on your own PC

Some of the findings in [FINDINGS.md](FINDINGS.md) can be checked with your own copy of the game and one script
from this repository. This page gives the steps and what to expect. Every figure on it is the record's
([tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md), and for `clock` the table of [ACCURACY.md](ACCURACY.md)),
with its standing and its finding's number; the few that are not (tolerances chosen by order RP-01 or by a check,
and a map) say so.

**Start with `celt`, `gain` and `speex`.** They need the game and nothing else, depend on no clock and no frame
rate, and should give the same result on any PC (inferred: measured with two Source games on one PC, Sets H, I, M
and O). They check the engine's older codecs and the receiver's gain.
They say nothing about Steam voice, the codec TF2 runs unless `sv_voicecodec` is changed (this page's own
statement: the record does not give the default, and [FINDINGS.md, entry
10](FINDINGS.md#10-the-older-engine-codecs) gives it as read).

**Steam voice has two checks that need the game and Steam alone** ("With Steam's console and the game's log"):
`gate` reads Steam's sender gate from the text Steam's own console prints, and `queue` reads the receiver's queue
from the log the game's console writes. **Neither has been run on a log of the game yet.** The hold after speech
has steps by hand and no script yet ("The hold and Steam's clock").

Three more checks need more than the game. `ceiling` and `clock` need a recording of what the PC plays: a
recorder, and a way to play a file into the game as its microphone ("With a recorder of the PC's output"). `demo`
needs a dedicated server ("With a server"). The rooms, the network and the codec as heard have steps on this page
and no script yet.

`gain`, `celt` and `speex` were run on the owner's recordings of the game on 2026-11-13, with the script as it
stands here, and gave "as expected" (measured; the record's entry "The script run on the game's files"). Their
sections give that run's figures beside the record's older ones, which were made with other code (findings 26 and
31). Those recordings are not published yet (order RP-01e), so nobody else can repeat that run today. `ceiling`,
`clock` and `demo` were run on the owner's recordings of the PC's output and on one demo the same day (measured;
their sections give the figures), and those files stay private. `gate` and `queue` have not been run on a log of
the game. What CI runs is the suite `reproduce`, on stand-ins that this repository makes, and a stand-in cannot
show that the script lines up a file as the game wrote it.

## What you need

- Windows, Team Fortress 2 and Steam. Everything here was measured on Windows.
- [Node](https://nodejs.org) 22 or later, and a copy of this repository: a clone, or the ZIP from the repository's
  page. No package is installed and nothing is built.
- A command prompt in the repository's folder. Every command below is run from there.
- For `gate`: Steam's own console ("Steam's console", below). For `queue`: the game's console log. Nothing else.
- For `ceiling` and `clock` only: a recorder of what the PC plays, and a virtual audio cable to play a file into the
  game as its microphone (below, "With a recorder of the PC's output"). For `demo` only: a dedicated server with
  SourceTV ("With a server").

**Nothing leaves your PC.** The script opens no network connection; the suite `reproduce` holds that by reading the
script's text and by running every check with the network refused. **The output can be posted as it is.** It
holds figures and the script's own words: no line of your files, no path and no file name. A file is named by its
place among the arguments ("file 1", "file 2").

`node tests/reproduce.mjs` alone lists the checks. Each check ends with one line: `<check>: as expected` (exit 0),
`<check>: differs: <the reason>` (exit 1), or `<check>: cannot check: <the reason>` (exit 2).

## The clips

The game and Steam each take a file as the microphone. The clips for them are made by a script, the same bytes on
every PC:

```
node tests/reproduce.mjs inputs clips
```

This writes three files into the folder `clips` and prints each one's SHA-256 with "as expected" or "differs"
beside it. The first two are the files the game was fed in the record's runs (measured, 2026-11-13; the record's
entry "The file-input runs, measured again"). The third, for Steam's `mic_inputfile`, is a choice of order RP-01b
and has not been played into Steam yet (not built yet); its checksum was computed (the record's entry "The checks
gate and queue"):

| File | For | Rate | Samples | SHA-256 |
| --- | --- | --- | --- | --- |
| `voice_input_22050.wav` | `vaudio_celt`, `vaudio_celt_high` | 22050 Hz | 291,942 | `fc1c6cbd9aabd8ed1b64d4381eae3c2f56dce23eff36e14ba7d9f67dc5505a58` |
| `voice_input_11025.wav` | `vaudio_speex` | 11025 Hz | 145,966 | `bd31df844cee4b38fe705be1fbdfb1b17acb9f161f9314b06b1eb2ba0d560dbd` |
| `steam_mic_24000.wav` | Steam's `mic_inputfile` (`gate`) | 24000 Hz | 679,200 | `3e02aaa585001e562e133aea7985bce4208563e39c00655d153f34b88e873fde` |

The first two are each 13.2 s of tone bursts, a sweep and a harmonic tone with pauses (the generator is
`tests/recordings/make-inputs.mjs`); the third is 28.3 s, described under `gate` (its generator is
`tests/reproduce/steam-clip.mjs`). All three are 16-bit mono with a plain 44-byte header. If a checksum differs,
your Node computes the clip differently and the other checks would compare with another input: report it (below)
and stop there.

## In the game

These steps are the record's runs (the record's entry "The file-input runs, measured again"; findings 27 and 31).

**The game's console.** Start the game with the launch option `-console` (in Steam, the game's Properties, Launch
options), or turn on the developer console in the game's Options (Keyboard, Advanced) and open it with the key
under Esc. Lines are typed at its foot and run with Enter.

1. **Put the clip in the game's folder as `voice_input.wav`.** The game's folder is the one that holds the game's
   executable: in Steam, the game's Manage, Browse local files. Copy the 22050 Hz clip for `vaudio_celt` and
   `vaudio_celt_high`, the 11025 Hz clip for `vaudio_speex`, and rename the copy `voice_input.wav`. That folder is
   measured for TF2's 64-bit game; for the 32-bit game the record's notes do not name it, and if nothing is
   written, try the `tf` folder inside it.
2. **Start the game.** For `vaudio_celt` and `vaudio_celt_high`, start TF2 as usual. For `vaudio_speex`, start the
   32-bit game, as the record's runs did (measured: the run sheets), with Steam running: open PowerShell or a
   command prompt in the game's folder (in File Explorer's address bar there, type `powershell` and press Enter)
   and type, in that folder:

   ```
   .\tf.exe -force32bit -game tf -console
   ```

   The 64-bit game cannot load the Speex module: it runs `vaudio_celt` in
   its place and does not say so in the recording (read and measured, finding 31).
3. **Choose the codec and load a map**, in the game's console (the codec must be set before the map loads). One of:

   ```
   sv_voicecodec vaudio_celt; map ctf_2fort
   ```
   ```
   sv_voicecodec vaudio_celt_high; map ctf_2fort
   ```
   ```
   sv_voicecodec vaudio_speex; map ctf_2fort
   ```

   Any map does; the record does not name the map of its runs. Set H ran on a local server like this one.
4. **Once the map has loaded**, in the console:

   ```
   voice_loopback 1; voice_inputfromfile 1; voice_recordtofile 1; voice_maxgain 1
   ```

   No server variable needs setting: `sv_allow_voice_from_file` is 1 by default (read in the game's `find voice`
   output). The game still needs a working microphone device, though it does not use it (read, W3-03's report).
5. **Record.** Type `+voicerecord` in the console and press Enter. Wait 15 s. Type `-voicerecord` and press Enter.
   No key needs to be bound. The game sends the voice in packets: a packet is one piece of coded voice, sent at
   once, and decoded it gives a set number of samples. To see which codec ran, type `voice_showincoming 1` before
   the press: the console then prints one line a packet with its sample count (read, finding 27), 512 under `vaudio_celt` and 1024 under
   `vaudio_celt_high` (measured, Set H), multiples of 160 under `vaudio_speex` (measured, Set O: 320 and 480;
   finding 31). A count of 512 under `vaudio_speex` is the 64-bit game's fall-back.
6. **Copy the files away before the next press.** The game writes `voice_decompressed.wav` and `voice_micdata.wav`
   into the same folder (measured for TF2, Set H), and writes them again at every release of the key (measured
   again on 2026-11-13, when a sitting was lost to it). Copy both into the repository's folder, the one you run the
   commands from, and rename them, for example `celt_gain1.wav` and `celt_micdata.wav`: the commands below find
   them there. A file elsewhere is given with its path, in quotes if it holds a space.
7. **For `gain`, record again at `voice_maxgain 10`**, with the same codec and clip: `voice_maxgain 10`, then step
   5, then step 6 (for example `celt_gain10.wav`).

The game reads the file at its codec's rate whatever its header says (read, W3-03's report), and skips its first
two samples (read and shown on Set H, finding 27). It takes the file in order, whatever the frame rate (read,
W3-08's report). The recording holds at most 1 MiB (read, finding 27): 23.8 s at 22050 Hz (computed), so 15 s of
the 13.2 s clip fits.

## gain

**Run on the game's recordings on 2026-11-13** (measured): in Set H's pair 0 of 291,840 samples before the last
packet differ; in Set I's pair 0 of 145,408; in the `vaudio_speex` pairs of Sets M and O, 0.

**The claim.** The receiver's gain works on the decoded voice in blocks of 128 samples: each block sets the next
block's target, `min(voice_maxgain, 32767 / (mean + voice_avggain × (peak − mean)))`, the gain ramps toward it in
steps of 1/128, and a block of zeros sends it to the cap (read, finding 26). `voice_recordtofile` writes the voice
after the gain, so a recording at `voice_maxgain 1` is the decoder's output and one at 10 is the gain's (read,
finding 27).

**The signal and the steps.** The 22050 Hz clip under `vaudio_celt`, recorded at `voice_maxgain 1` and at 10
(steps 1 to 7 above).

```
node tests/reproduce.mjs gain celt_gain1.wav celt_gain10.wav
```

**What to expect.** The rule at `voice_maxgain 10` (with `voice_avggain 0.5` and `voice_scale 1`, the defaults),
applied to the first recording, gives the second in every sample before the last packet: 0 of 291,840 differ
(measured, Set H, finding 26). The last packet differs between two key presses (measured, Set H) and is counted
apart. No tolerance.

The script compares two files of different lengths over the shorter and says so. It also runs on two `vaudio_speex`
recordings at 11025 Hz (the last 160 samples apart, or `--packet <samples>`); the record has no count for that
pair.

## celt

**Run on the game's recordings on 2026-11-13** (measured, the last packet apart): Set H under `vaudio_celt`, 291,839 of
291,840 samples equal; under `vaudio_celt_high`, 291,765 of 291,840; Set I with `--any-rate`, 145,407 of 145,408.
Every other sample is one step off.

**The claim.** `vaudio_celt` and `vaudio_celt_high` are the public CELT 0.11 source at the commit this repository
pins, built with its pitch pre-filter and post-filter, at complexity 5, with 16-bit entry points. `vaudio_celt` is
the 22050 Hz mode with frames of 512 samples and packets of 64 bytes; `vaudio_celt_high` is the 44100 Hz mode with
frames of 1024 samples and packets of 128 bytes, fed 22050 Hz sound (read, finding 31).

**The signal and the steps.** The 22050 Hz clip, recorded at `voice_maxgain 1` (steps 1 to 6), once under each
codec.

```
node tests/reproduce.mjs celt celt_gain1.wav
node tests/reproduce.mjs celt celthigh_gain1.wav --high
```

With no second file the script takes the generated clip as the input. Give the `voice_input.wav` you used as a
second file if it was another, or the `voice_micdata.wav` the game wrote with `--micdata`. The script runs this
repository's CELT on the input from its third sample, frame by frame, and compares its decoded samples with the
recording's at no lag (the method of W3-08's report).

**A clip at another rate.** The game takes a file's samples at its codec's rate whatever its header says (read,
W3-03's report): given the 11025 Hz clip under `vaudio_celt`, it coded it as 22050 Hz sound, at double speed, and
its recording matched this repository's CELT run the same way in 145,919 of 145,920 samples (measured, Set I,
finding 31). Give that clip as the second file with `--any-rate`, for example
`node tests/reproduce.mjs celt seti_gain1.wav clips\voice_input_11025.wav --any-rate`; without the option the
script refuses a second file at another rate and names the option.

**What to expect.** All but a few samples equal, each of the others one step off: the record has 292,351 of
292,352 for `vaudio_celt` and 292,789 of 292,864 for `vaudio_celt_high` (measured, Set H, finding 31). The script
passes at most 0.05% of samples one step off and none further, which is Set H's larger share doubled (a choice of
order RP-01, not a figure of the record), and counts the last packet apart.

## speex

**Run on the game's recordings on 2026-11-13** (measured): Set M at `voice_maxgain 1`, 145,840 of 145,840 compared
samples equal (the recording ends before the render does), and at 10, 145,966 of 145,966; Set O at 1, 145,966 of
145,966. The captured input, with `inputs --against`: 145,964 of 145,964, then two zeros.

**The claim.** TF2's 32-bit game runs `vaudio_speex` (measured, finding 31). It is Speex 1.0.2 or 1.0.1,
narrowband at quality 4, 20 bytes a frame, enhancement on, fed the engine's 11025 Hz sound with no resampling
(read, finding 31), in frames of 160 samples (measured, Set M). This repository's build computes as the module's
compiler did (read, then run; Set M's entry and finding 31).

**The signal and the steps.** The 11025 Hz clip in the 32-bit game, recorded at `voice_maxgain 1` and, if you like,
at 10 (steps 1 to 7).

```
node tests/reproduce.mjs speex speex_gain1.wav
node tests/reproduce.mjs speex speex_gain10.wav --maxgain 10
```

As for `celt`, a second file is the input you used, or with `--micdata` the `voice_micdata.wav` the game wrote. The
script renders the input (from its third sample, then two zeros, as the game's capture ends) through this
repository's `speex` profile at the `voice_maxgain` given, takes the voice after the gain, and compares it with the
recording at the codec's delay of 80 samples (finding 31).

**What to expect.** Every sample equal: 145,966 of 145,966 at `voice_maxgain 1` and at 10 (measured, Set O's
entry, TF2 build 11191711; finding 31). No tolerance.

The `voice_micdata.wav` the game wrote can be checked against the clip on its own:

```
node tests/reproduce.mjs inputs --against speex_micdata.wav
```

It should be the clip from its third sample in 145,964 of 145,964 samples, then two zeros (measured, Sets M and
O; the record's entry "The file-input runs, measured again").

## With Steam's console and the game's log

`gate` and `queue` check Steam voice, the codec TF2 runs by default, with the game and Steam alone: no recorder, no
cable and no server. `gate` reads the text Steam's own console prints; `queue` reads the log the game's console
writes. **Neither has been run on a log of the game yet** (the record's entry "The checks gate and queue"). What
CI runs is the suite `reproduce`, on stand-ins this repository writes.

**Both texts hold private details. Steam's console text holds account names and addresses (measured: the record's
entry "Steam's chunk line"), and a console log of the game holds player names and addresses. Give them to the
script and post only what the script prints.** The script keeps numbers and counts only: no line, no path, no
name.

**Steam's console** is not the game's. Type `steam://open/console` into a browser's address bar or the Run box of
Windows, and a Console tab appears in Steam (W3-09's suggestion, `docs/reports/W3-09-steam-voice.md`, "What the
owner could run"). Type each command on a line of its own and press Enter: two commands on one line were not tried
(the record's entry "The checks gate and queue").

## gate

**Not yet run on a log of the game.**

**The claim.** Steam judges each chunk of the capture whole: a chunk is sent when the mean of its absolute samples
is at least 1.0% of 32767, or when one sample reaches 4915 (read; finding 28, with finding 5). With
`@voice_spew_activity_check 1` set, Steam's console prints one line for every chunk that holds samples: three marks
(the chunk is active, its mean passed, its peak passed), its length in milliseconds, its mean as a percentage of
32767, its peak as a percentage of 32768 and its count of samples at or above 4915 (measured, Set J; finding 27).

**The record.** With a file as the microphone all 789 verdicts Steam printed follow the rule; the highest mean that
failed is 0.9998% and the lowest that passed 1.0315% (measured, Set J, finding 28). A run with a real microphone
follows it on all 590 chunk lines (measured, Set L; finding 16's paragraph on Set L). On all 2,706 chunk lines of
Steam's own log file the marks agree with the printed numbers as G1 to G3 below ask (measured 2026-11-13 by the
orchestrator, private; the record's entry "The checks gate and queue").

**The signal.** The clip `steam_mic_24000.wav` ("The clips", above), 28.3 s that Steam loops, or your own voice.
The clip holds, in order: 0.5 s of silence; five 1 kHz bursts of 1 s with pauses of 1.2 s; the record's two tones,
1 kHz at −38 dBFS, which stayed shut, and at −35 dBFS, which opened (measured, Set J, finding 28); a tone whose
mean of |x| rises from 0.90% to 1.10% of 32767 and falls back, so that chunks lie close to 1.0% on both sides;
single samples of 4905 to 4925, so that chunks' largest samples lie on both sides of 4915; the record's 1.5 ms
burst at 0.2 of full scale, which opened by its peak alone (measured, Set J, finding 28); and 1.2 s of silence. What
it holds is a choice of order RP-01b; it has not been played into Steam (not built yet).

**The steps.**

1. `node tests/reproduce.mjs inputs clips` writes the clip. Copy `steam_mic_24000.wav` into a folder whose path has
   no space, such as `C:\tf2check`: the record's path had no space and was typed bare, with no quotes (measured,
   the record's entry "The checks gate and queue"); how a path with a space is typed is not in the record.
2. In Steam's console, two lines, each typed alone:

   ```
   @voice_spew_activity_check 1
   ```
   ```
   mic_inputfile C:\tf2check\steam_mic_24000.wav
   ```

   The path is the file's full path. A path that does not load is not retried, and may fill the console with
   `looped` lines or stop Steam (read, W3-14's order). Steam still needs a working capture device (read, W3-14's
   order). With a real microphone, leave out the second line and speak, with pauses.
3. In the game's console, before the map:

   ```
   sv_voicecodec steam; map ctf_2fort
   ```

   Once the map has loaded:

   ```
   voice_loopback 1
   ```

   The record's runs had it (measured, Set J); whether the chunk lines come without it is not in the record.
4. Type `+voicerecord` in the game's console and press Enter. Wait 60 s, two passes of the clip. Type
   `-voicerecord` and press Enter. One press is enough.
5. **Save the text.** Select all of the Console tab's text, copy it, and paste it into a text file in the
   repository's folder, saved as plain text, for example `steam_console.txt`. Or take `console_log.txt` from the `logs` folder of Steam's
   install, which holds the same lines with a stamp in front of each (measured: the record's entry "Steam's chunk
   line"). **This text holds account names and addresses: give it to the script and post only what the script
   prints.**
6. Run:

   ```
   node tests/reproduce.mjs gate steam_console.txt clips\steam_mic_24000.wav
   ```

   With a real microphone, give the text alone: `node tests/reproduce.mjs gate steam_console.txt`.
7. Afterwards, in Steam's console, each on its own line:

   ```
   @voice_spew_activity_check 0
   ```
   ```
   mic_inputfile ""
   ```

   The console answers `"mic_inputfile" = ""` (measured, the record's entry "The checks gate and queue"). Or restart
   Steam.

**What the script checks.** With the text alone, on every chunk line:

- **G1:** the first mark is set exactly when the second or the third is.
- **G2:** the third mark is set exactly when the count of high samples is above 0, and exactly when the printed
  peak, as whole samples of 32768, is 4915 or more (each whole sample from 0 to 32768 prints differently with
  three decimals: computed by order RP-01b's planning run).
- **G3:** on the lines whose printed mean is not 1.00, the second mark is set exactly when the printed mean is above
  1.00. A print of 1.00 can lie on either side of 1.0%, so those lines are counted apart (one of 2,706 in the
  record's log file, without the mark; measured, private, the record's entry "The checks gate and queue").

A line of one sample (0.04 ms) is counted apart from every figure: the code's mean of one sample is 0 (read), and
Set J holds one such line (measured, finding 28). The two limits are the app's own (`STEAM_SENDER` in
`steam-sender.js`), so the check tests the app's constants.

With the clip, every chunk after the `loaded` line that Steam prints when it loads a file of the clip's length is
also recomputed from the clip, as W3-14 did: from the clip's first sample, moving on by each line's length (its
milliseconds times 24) and wrapping at its end, up to the next `loaded` line or the next `mic_inputfile` typed or
answered.

- **G4:** the printed mean, peak and count are the clip's at that place: the count equal, the mean within 0.01 and
  the peak within 0.001 (one unit of the last printed digit: a choice of this check, for the print's rounding).
- **G5:** the three marks are the rule's on the clip's own samples. A chunk whose exact mean lies within a millionth
  of a percent of 1.0% is counted apart: the code compares in 32-bit floats (read, `docs/reports/W3-16-second-read.md`).

**What to expect.** Every figure "as expected". The script also prints counts: the brackets of each kind, the six
most frequent chunk lengths, the printed means and peaks nearest each limit, the chunks that passed by their peak
alone, and with the clip the exact means nearest 1.0% on each side (the record's own clip gave 0.9998% and 1.0315%,
measured, finding 28), the passes through the clip and the `looped` lines. Please report the chunk lengths, with the
clip or with a microphone: on the owner's PC a microphone's chunks are whole steps of 31.25 ms (measured, finding
28), and the real-microphone run's lengths were 62.50 ms on 441 lines, 31.25 on 142 and 93.75 on 7 (measured,
Set L, private; the record's entry "The checks gate and queue"). That step may be one PC's.

**What the script refuses.** A text with no chunk line (the variable was not set), with fewer than 50 chunk lines
(a choice of this check), or with no chunk on each side of 1.0% cannot show the rule: "differs", with the reason. A
line that begins as a chunk line and does not read as one is named by its line number. A clip that is not 16-bit
mono at 24000 Hz with a plain 44-byte header is refused: Steam reads a file from byte 44 on as sound (read, W3-14's
order). A clip of another length than the `loaded` line names is not the clip Steam played.

**A second press in one Steam session.** Steam prints the `loaded` line when it loads the file, at the first read
after the key goes down; the same path typed again does not load it again, and the file's place carries on from one
press to the next (read, W3-14's order). With no `loaded` line in the text, the script finds the place in the clip
by the first chunk lines and says so. If they still fit several places after 200 lines (a choice of this check), it
asks for `mic_inputfile ""` and the path again, or a restart of Steam, and a new press.

**What a pass shows, and what it does not.** A pass shows that Steam's verdicts follow the rule with the app's two
limits, and with the clip that Steam's numbers are the clip's. It says nothing of the hold after the last loud chunk
("The hold and Steam's clock", below). The suite's stand-in takes its verdicts from the app's own sender, so a pass
there shows that the check agrees with the app's sender, not that Steam prints these lines so.

## queue

**Not yet run on a log of the game.**

**The claim.** Each speaker's voice waits in a ring of 22050 samples, 0.5 s at 44100 Hz (read, finding 22). A
packet for a speaker with no channel opens one, and the channel waits `ceil(0.1 × frames a second)` ticks of 15 ms
before it plays, the packet's own tick counted (read, finding 23). Each packet of N samples adds N − 1 to the ring
(read, finding 24). A channel ends on the first tick after the mixer has emptied its ring (read, finding 22). With
`voice_showincoming 1` and `voice_showchannels 1` the game's console prints one line for every packet with its
count of samples and one line every tick with the bytes queued (read, finding 27).

**The record.** The rule, replayed over Set G's 2,375 packets with the mixer's demand taken from the log, gives the
logged queue on every one of 9,808 ticks (measured, finding 22). The lines before the queue can fall were 7 in 2 of
2 channels at `fps_max 67`, 10 in 4 of 4 at 100, and at 300 30 in 19 of 28, 31 in 8 and 32 in 1 (measured, Set G,
finding 23). Replayed again with this repository's code, part by part, the rule and six faults put in on purpose
mismatch the log on these ticks (measured 2026-11-13 by the orchestrator, private; the record's entry "The checks
gate and queue"):

| Frames a second | Wait (ticks) | Ticks | The rule | Ring + 1 | Ring − 1 | Wait + 1 | Wait − 1 | Sample kept | No grace |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 300 | 30 | 6,267 | 0 | 4,933 | 4,933 | 1,549 | 708 | 5,781 | 181 |
| 66.67 | 7 | 511 | 0 | 0 | 0 | 496 | 498 | 510 | 0 |
| 100 | 10 | 598 | 0 | 0 | 0 | 555 | 559 | 595 | 0 |
| 300 | 30 | 581 | 0 | 504 | 504 | 13 | 4 | 494 | 0 |
| 300 | 30 | 917 | 0 | 839 | 839 | 63 | 18 | 877 | 0 |
| 300 | 30 | 934 | 0 | 882 | 882 | 0 | 19 | 865 | 0 |

A log shows a fault only where the thing happened: the ring's two faults need an overflow, which happens at 300
frames a second and not at 67 or 100 (finding 23), and "no grace" needs a grace. So the script prints the faults as
information, and a 0 there is not a failure.

**The steps.**

1. A local server with Steam voice, so that you hear yourself. In the game's console, before the map:

   ```
   sv_voicecodec steam; map ctf_2fort
   ```

2. Once the map has loaded, wait a few seconds: one frame of 0.1 s or more while a channel waits ends its wait at
   once (read, finding 23). Then one line, with a log name you have not used before (whether `con_logfile` adds to
   an older file is not in the record):

   ```
   con_logfile voice_q1.log; echo MARK100; voice_loopback 1; voice_showincoming 1; voice_showchannels 1; cl_showfps 1; fps_max 100
   ```

   `echo MARK100` marks where this run starts in the log. `voice_showchannels` is 1, not 2: 2 adds a line for each
   pull of the mixer, which the script refuses.
3. Type `+voicerecord` and press Enter. Speak a few phrases with pauses for 30 s, or let Steam play the 24 kHz clip
   as in `gate`. Type `-voicerecord` and press Enter. Read the frame rate off the counter while it runs. One speaker
   only.
4. If your PC holds 300 frames a second, a second run in the same log, at the game's default cap:

   ```
   echo MARK300; fps_max 300
   ```

   then step 3 again. The record's runs were at 67, 100 and 300 (measured, Set G).
5. Then:

   ```
   voice_showincoming 0; voice_showchannels 0
   ```

   The log is `voice_q1.log` in the `tf` folder inside the game's folder (inferred: the record does not name the
   folder). Copy it into the repository's folder. **It holds player names and addresses: give it to the script and
   post only what the script prints.**
6. Run once for each part, with the number the counter showed:

   ```
   node tests/reproduce.mjs queue voice_q1.log --section MARK100 --fps 100
   ```
   ```
   node tests/reproduce.mjs queue voice_q1.log --section MARK300 --fps 300
   ```

   Give `--buffer-ms` only if `voice_buffer_ms` was changed from 100. The marker word is yours and is never
   printed.

Hold the frame rate steady with `fps_max`: the wait is counted in frames, and the script takes one frame rate for the
whole part.

**What the script checks.** It reads the part with `tests/voicequeue/log-to-fixture.mjs`, whose rules and refusals
are in [tests/voicequeue/](../tests/voicequeue/README.md), and replays it through `voice-channel.js` as the suite
`voice-channel` does.

- **Q1** is the ticks on which the rule gives the logged queue, expected all. It tests the wait only from below: the
  replay takes the mixer's demand from the log, so a channel that the rule lets play early, with the mixer taking
  nothing, matches every tick, and a frame rate given lower than the game's passes Q1 (measured 2026-11-13 by the
  orchestrator, private; the record's entry "The checks gate and queue").
- **Q2** tests the wait from above, by the tick lines from each channel's packet to the first fall of its queue, W
  being the wait the frame rate given makes: every channel whose queue fell first fell on line W to W + 3, and at
  least one on line W or W + 1. The band of W + 3 is a choice of this check: Set G's logs have W to W + 2 in 34
  channels (measured, finding 23), and one line more is allowed because a packet that refills a full ring hides the
  mixer's pull from the log (inferred). At least one channel on W or W + 1 is so in each of Set G's six parts
  (measured 2026-11-13 by the orchestrator, private; the record's entry "The checks gate and queue"). A channel whose
  queue never fell (a log cut while it waits) is counted apart.

"As expected" needs Q1 and Q2. The script also prints each fault's mismatching ticks (and, when Q1 holds, "0 means
this log cannot tell that fault from the rule"), the channels by the tick lines before their queue first fell, the
packets of whole 882-sample frames and the others (silence records and empty packets), and the pulls read from the
log that are not whole blocks of 512 samples.

**What to expect.** Q1 on every tick, and Q2. The lines before the queue fell: 7 at 67 frames a second, 10 at 100,
30 to 32 at 300 (measured, Set G, finding 23).

**What the script refuses.** A log with fewer than 100 tick lines (a choice of this check), or in which no channel's
queue ever fell (no channel played), cannot show the rule: "differs", with the reason. A log with marked parts needs
`--section`. Pull lines, a second speaker, two packets before one tick line and a line that begins as a voice line
and does not read as one stop the reading with the line's number.

**A different result.** A failing Q1 names the first tick that mismatches and asks for the frame rate to be checked:
a PC that did not hold its `fps_max`, or one frame of 0.1 s or more during a wait, ends a wait early (read, finding
23). A frame rate given higher than the game's stops the reading at the first queue that falls during its wait. A
failing Q2 gives the wait and the lines on which the queues first fell, and says that the frame rate given may be
lower than the game's.

**What a pass shows, and what it does not.** A pass shows the ring, the wait, the one sample a packet and the grace
against the queue the game logged, each where the log holds it: a fault that prints 0 is not shown by that log. The
replay takes the mixer's demand from the log, so it does not test when the mixer pulls (finding 22). Q2 lets through
a frame rate whose wait is one tick short of the game's: at `voice_buffer_ms` 100 that is a rate 10 frames a second
low (computed: the wait is one tick per 10 frames a second). Nothing was measured above 300 frames a second. The
suite's stand-in is a log written from a second
model of the channel and replayed through the first, so a pass there shows the reading and that the two models
agree, not that the game prints these lines so. The packet counts through Steam's resampler are not checked (not
built yet): the record's port of that resampler gives the logged count of all 2,372 packets of Set G that are not
empty (measured, finding 29).

## With a recorder of the PC's output

**Run on the game's recordings on 2026-11-13** (measured; the record's entry "The script's later checks run on the
game's files"). `ceiling` and `clock` were run on seventeen of the owner's recordings of the PC's output, which are
private; each section below gives the outcome. The record's older figures were measured with other code.

`ceiling` and `clock` read a recording of what the PC plays while the game plays your voice back to you. The record's
takes were made this way (the record's "Reproduce" and Set B; [owner-runs.md](owner-runs.md), "A take of the test
signal"):

- **A file as the microphone.** The record played a file into the game's microphone input at unity gain through a
  virtual audio cable: a program that adds a playback device whose sound comes out of a recording device. Most PCs
  need one for this; a few have a recording device that already carries what the PC plays. Set the cable's recording
  side as the microphone Steam uses, and play the file into its playback side at 100%. Steam converts nothing:
  Windows or the cable brings the sound to the 24000 Hz Steam asks for (read, finding 28), and a stereo cable reached
  the game as its left channel (measured, finding 6).
- **A recorder of the game's output.** The record's takes were recorded with OBS and kept lossless at 48000 Hz,
  24 bits (Set B). The script reads WAV only (16- or 24-bit, or float, any number of channels; it reads the
  first): save the recording as WAV. A FLAC file is turned into a WAV of the same samples by FFmpeg, if you have it:
  `ffmpeg -i take.flac -c:a pcm_s24le take.wav`. Nothing lossy: an MP3 moves the clipped samples (measured,
  finding 7).
- **Nothing in between.** Turn off the system's effects on the output and on the cable (enhancements, loudness
  equalisation, spatial sound) and keep the game's sound at 100% in the system's mixer, as the record's low-tone takes
  asked (`tests/testsignal/README.md`).

**The signal.** The record's takes used the test signal, which a Python script makes (Python 3 with numpy and
scipy). The Python scripts under `tests/testsignal/` that make it and the low-tone signal are the only steps on
this page that need more than Node:

```
python3 tests/testsignal/make_testsignal.py
```

It writes `tf2_voice_testsignal_v1.wav`, 142.9 s, with SHA-256
`efd1c0bce69bfd87c70fff4ab591d9b165046f67ed992b8c0d185152eecf75e0` (Set B; the hash is for numpy 2.4 and scipy 1.17,
`tests/testsignal/README.md`). For `ceiling` any other file works too: it needs only a sound loud enough for the
receiver's gain to clamp it, with the game's own sound under it. For `clock` use the test signal, whose phrases
are long (below, "clock"); the record's speech and music takes read the same clock as the test signal (measured, the
table of [ACCURACY.md](ACCURACY.md)).

**In the game.** Steam voice, your own listen server, the voice played back to you. In the game's console, one line:

```
sv_voicecodec steam; map ctf_2fort
```

Once the map has loaded:

```
voice_loopback 1; dsp_slow_cpu 1; volume 0.5
```

- `dsp_slow_cpu 1` is the Sound quality option at its lowest: no room on the voice (read, finding 32; measured to
  take effect at once, Set K). It is saved with the game's settings: set the option back afterwards.
- Stay where the map makes some sound of its own: the game's clip acts on the sum of the voice and that sound, and
  `ceiling` needs the sum to pass it (finding 30).
- `volume 0.5` is the value of one of the record's takes (Set K). Any value does: give the one you used to
  `ceiling`.
- Leave `voice_maxgain` at 10, as the record's takes had it (Set B): the gain then clamps a loud sound (finding 3).
- Keep the game's speakers on headphones, the default: with two speakers the voice enters at 182.6/256, not 255/256
  (read; that the voice is in that group of the sound mixer is inferred; no recording, finding 30).

Start the recorder. Type `+voicerecord` in the console and press Enter, start the file, and when it has ended type
`-voicerecord` and press Enter. One press for the whole file.

## ceiling

**Run on the game's recordings on 2026-11-13** (measured, on seventeen recordings, each with its own `volume`). Ten
came out "as expected": the largest sample exactly round(32767 x `volume`) (4,915 at `volume 0.15` in nine, 3,604
at 0.11 in one), the smallest the same with a minus, and 100 to 179,781 samples on the largest. Seven came out
"differs", each with a reason the check names: three reach the ceiling exactly with 10, 38 and 74 samples on it,
under the check's floor of 100; one, made at `voice_maxgain 1`, never reaches it (its largest sample is 3,010); and
three older recordings hold samples above the ceiling for the `volume` noted for them (largest 5,095 and 6,800), two
of them kept as MP3, which does not keep sample values.

**The claim.** The game adds all its sound, the voice and the rest, clips the sum at ±32767, applies `volume` and
rounds to 16 bits, in that order (read, finding 30). So no sample of its output passes round(32767 × `volume`), the
game's ceiling, and whatever part of the sum passes the clip is flattened exactly there. The system's conversion to
48000 Hz keeps flat tops exactly on their level (measured, finding 30).

**The signal and the steps.** Any loud sound, recorded as above, with the map's own sound under it.

```
node tests/reproduce.mjs ceiling output.wav --volume 0.5
```

The script prints the largest and the smallest sample, how many samples sit exactly on each, and the `volume` the
largest gives.

**What to expect.** The largest sample at round(32767 × `volume`) and the smallest at minus that, each within one
16-bit step, none beyond, and at least 100 samples exactly on the largest, enough to show a clip (the 100 is a
choice of this check). The record: the largest sample of Set D's sender take is exactly 4915 at `volume 0.15`, with
4% of its samples there and none above (measured, finding 30). On eight of the record's takes the largest sample was
exactly round(32767 × `volume`), 4915 at `volume 0.15` in seven and 3604 at 0.11 in one, the smallest the same with
a minus, none beyond; 3,603 samples or more sat on it in six, and 10 in the one made at `voice_maxgain 1`, which
the script calls too few (measured 2026-11-13 by the orchestrator, private).

**What a pass shows, and what it does not.** A pass shows the game's `volume` and its clip of the sum. It does not
show the voice's own level in the mix: with the map's sound on top of a clamped voice, what passes the clip sits on
the ceiling, so a recording's flat tops are the ceiling's, not the voice's 255/256. That level has steps of its own
below ("The voice's level in the mix").

**A different result.** The largest sample under the ceiling: nothing reached the clip (a voice not loud enough, or
no game sound under it), a `volume` other than the one given, or a system volume under 100%. Samples over it:
something after the game raised the level (the system's mixer, an effect, the recorder's gain). Too few samples on
the largest: the sum passed the clip only now and then; play a louder sound. The record's room takes show a system
mixer limiting the tops (Set K, finding 32).

## clock

**Run on the game's recordings on 2026-11-13** (measured, on seventeen recordings with the source each played). Ten
came out "as expected", reading +402 to +418 parts in a million. Four read outside the range, as the record's table
has them, and were told to give `--packets`: +499 (the take at `voice_maxgain 1`; with `--packets 22.3`, the
record's inferred figure for it, it is "as expected" in +489 to +530), +449 and +284 (takes with loss) and +726
(the take with jitter). Three had too little to line up: two under heavy loss and one of 7 s.

**The claim.** The engine copies each packet into its queue one sample short: the packet's first sample is left out
(read, finding 24). So the game plays the voice faster than its source by the packets a second over 44100. Steam
hands voice out in about 17.8 packets a second (measured, finding 25): 17.8 / 44100 is 403 parts in a million
(computed, finding 24). The script's render keeps every sample, so a recording runs ahead of it by that much.

**The signal and the steps.** The test signal, recorded as above, with no `net_fake` setting. The record's takes of
it are Set B's, made at the owner's `fps_max 300` (the record's entry on Set G gives that cap; that the takes ran at
it is inferred).

```
node tests/reproduce.mjs clock output.wav tf2_voice_testsignal_v1.wav
```

The script renders the second file with the `steam` profile at its defaults, at the recording's rate, and lines the
recording up against that render phrase by phrase as the accuracy suite does (`TF2Reference.track`), with one clock
for the whole take.

**What to expect.** The recording plays +386 to +427 parts in a million faster than the render. That is the range
of the record's takes without loss or jitter, of Sets A to F, +397 to +416 in the table of [ACCURACY.md](ACCURACY.md)
(measured; 404 to 406 on most takes, finding 24), widened by 11 on each side for the spread of this check's reading
against the accuracy suite's on the same takes: −11 to +10 on fourteen takes (measured 2026-11-13 by the
orchestrator, private; the widening is a choice of this check). One take read +510 (`take3_voice_maxgain_1`,
measured, the same table); it is inferred to be the take that had 22.3 packets a second (finding 24 and the same
table), and 22.3 / 44100 is 506 (computed; finding 24's 505 is that figure or an earlier reading, inferred, as its
note says).

**What a pass shows, and what it does not.** A pass shows that the recording played about P / 44100 faster than the
render, and not why: a recording resampled by 1.0004 on its way would pass too. What says the cause is the game's is
the record: the clock follows the packet rate and is not a recorder's (measured, finding 24, and the record's
"Results"). The line-up is also unsteady on short phrases at high frame rates. On the model, the order's
reviewer ran a 30 s speech-like source through the render that runs the game's queue, at two sources and six seeds:
at 66.67 frames a second all 12 read inside +397 to +416, and at 300 only 6 of 12 did, from +386 to +790 (measured
on the model, not on the game; RP-01c's report). At 300 the queue skips 11 to 25 ms at a time after each restart
(finding 23), and on short phrases those skips pull the one clock. On the record's own takes, made at the owner's
300 frames a second with the test signal, speech and music, the check lined up 30 to 223 one-second windows and read
within 11 of the accuracy suite's figure (measured 2026-11-13 by the orchestrator, private): the unsteadiness was
seen on short synthetic phrases, not on those takes. The test signal's long phrases are why it is the signal to
use.

**Outside that range, count your packets.** Type `voice_showincoming 1` in the console before the press. The
console then prints one line a packet with its count of samples (read, finding 27). Copy a few hundred of the lines
printed while the file played, count them and add up their counts: the packets a second are the lines times 44100,
over that sum (computed: each count is the packet's sound at 44100 Hz). Give it to the script:

```
node tests/reproduce.mjs clock output.wav tf2_voice_testsignal_v1.wav --packets 17.9
```

With `--packets` the clock is expected from 17 under to 24 over the packets a second over 44100: the record's range
around 403, 6 under to 13 over (computed from the figures above), widened by the same 11 (a choice of this check).
The +510 take falls inside its own window (506). Without `--packets` the script uses the widened range of the
record's takes and says so.

**A different result.** A recording too short or too quiet to line up is "differs" with the reason: the script asks
for at least 20 one-second windows that line up (a choice of this check). A clock far off with `--packets` given:
lost or delayed packets (the record's takes with `net_fakeloss` or `net_fakejitter` read +280 to +2792, measured, the
same table), a recorder or system that converts the rate, or a finding wrong for your PC.

## With a server

`demo` needs a SourceTV demo, which needs a dedicated server: a second program, run on your PC or another, that the
game joins.

## demo

**Run on a demo the game's server wrote, on 2026-11-13** (measured, Set D's demo, which is private): "as
expected". 1,816 voice messages and 5,109 frames, every frame a 20 ms hybrid frame of one channel, every message
with one 24000 Hz record, 693 one-byte frames, 20 end markers, the first phrase at frame number 0 and 19 of 19
phrases after an end marker at 0.

**The claim.** Steam's voice packets are 20 ms Opus frames in hybrid mode with a 12 kHz band, one channel, at
24000 Hz (measured, Set D's demo, finding 11; the encoder's settings read, finding 28). Where the encoder sends no
sound it sends a one-byte frame (DTX, measured, finding 11). Each frame carries a number that starts again at 0 after
every end marker (measured, finding 11; read since, W3-09). Each voice message is one chunk of the capture and
carries its own sample-rate record (read, finding 28; all 1,816 messages of Set D's demo hold exactly one).

**The steps.** A SourceTV demo needs a dedicated server; the record's steps are in `tests/demovoice/README.md` (Set
D). SteamCMD app 232250 installs the server. Start it with these launch options:

```
+sv_cheats 1 +sv_alltalk 1 +tv_enable 1 +tv_delay 0 +map ctf_2fort
```

Join it from the game. In the server's console type `tv_record voicetest`; speak or play a file into the voice, at
least two phrases with a pause of a second between them (the pauses of 0.7 s in Set J each ended a phrase,
measured, finding 12); then type `tv_stoprecord`. The demo is written to the server's `tf` folder. A demo holds the
players' names and SteamIDs, the server's address and the map: keep it to yourself and give it to the script.

```
node tests/reproduce.mjs demo voicetest.dem
```

The script reads the demo with `demo.js`, as the page does, and prints counts only: nothing of the demo's header, no
SteamID, no name, no address, no map. A speaker is never named.

**What to expect.** Every frame of that kind (TOC configuration 13: hybrid, 20 ms, one channel), every message with
one sample-rate record of 24000 Hz, and every phrase after an end marker starting at number 0. No tolerance. The
counts are your demo's own; the record's demo held 1,816 messages and 5,109 frames, 693 of them of one byte, in 20
phrases each starting at 0, and no frame missing (measured, Set D, finding 11). The script also prints the one-byte
frames, the end markers, the silence records and any numbers that skip (frames lost before the demo). It counts the
phrases that follow an end marker, and prints the first phrase of each speaker apart, since a demo may start in
mid-phrase: on a demo of 20 phrases it prints 19 after an end marker, and the first.

**A different result.** A demo with no voice, or with one phrase only, cannot show the numbering and is "differs"
with the reason. A demo of another codec (`sv_voicecodec` set to one of the engine's) is refused by name. A frame of
another kind, or a rate other than 24000, would be a finding for the record.

## Steps only (no script yet)

These are steps a stranger can follow and look at by ear or in an editor. **No script yet:** none of them is
measured by the script, so what you see is not compared with the record's figures for you.

### The hold and Steam's clock

**No script yet.** After the last loud chunk Steam goes on sending for 0.4 s on a clock of seconds since Steam
started, kept as a 32-bit float (read, finding 28): each loud chunk notes the clock, and the phrase's last chunk is
the first one read when the clock has passed the noted time plus 0.4, added and compared as floats. A float of that
size moves in steps that grow with Steam's uptime, so the hold comes out as whole steps (computed, finding 28):

| Steam has run | The float's step | Where the hold runs out, from the read of the last loud chunk |
| --- | --- | --- |
| under 18 hours | 4 ms or less | 398 to 402 ms |
| 18 to 36 hours | 1/128 s | 398 to 406 ms |
| 1.5 to 3.0 days | 1/64 s | 406 to 422 ms |
| 3.0 to 6.1 days | 1/32 s | 406 to 437 ms |
| 6.1 to 12.1 days | 1/16 s | 375 to 437 ms |
| 12.1 to 24.3 days | 1/8 s | 375 to 500 ms |
| 24.3 to 48.5 days | 1/4 s | 500 to 750 ms |

The last chunk is the first one read after that point, so up to 64 ms later.

**The record.** These counts are of reads that brought samples, counted from the last loud chunk (measured, Sets J
and L; finding 28 and finding 16's paragraph on Set L, with the counts read again by the orchestrator on 2026-11-13,
the record's entry "The checks gate and queue"):

- **On a Steam that had run 23.9 days** (Set J's file-input run, 12 phrase ends): every phrase ended at the first read
  four steps of 1/8 s after the read of the last loud chunk, 389 to 514 ms in real time, on the 7th read 4 times, the
  8th 5 times and the 9th 3 times.
- **On a Steam started 4.8 minutes before** (that evening's file-input run, 18 ends, and its real-microphone run, 19
  ends): the hold's edge lay between 399.4 and 403.1 ms, and of the 37 ends together 5 fell on the 7th read and 32 on
  the 8th, never the 9th.
- **The app's sender,** given each file-input run's uptime, gives every end of both (18 of 18 and 12 of 12), and
  fails on both when given the other's.

**Steam's console alone does not show where a phrase ends.** Its marks are each chunk's verdict. The end shows in
the game's packet lines (`voice_showincoming 1`): after a phrase's last sound packet comes a packet whose count is
not a multiple of 882, the silence record (finding 22). With a microphone on the owner's PC that count was 2756 or
2757, or 1378 or 1379 (measured, Set G, finding 22). After a read that brought nothing Steam sends no silence record
(read; seen in 2 of Set J's 12 ends, finding 28).

**The steps, by hand, with both consoles.**

1. Steam's console as for `gate`, with a real microphone: `@voice_spew_activity_check 1`, and no `mic_inputfile`.
2. The game's console as for `queue`, steps 1 and 2: the log holds the packet lines.
3. Speak short loud phrases with pauses of a second or more, one press for all of them.
4. For each phrase: count its packets in the game's log, from its opening packet to the last before the silence
   record. In Steam's console find the phrase's opening chunk (a line whose first mark is `+` after lines without
   it) and count as many chunk lines from it: that is the phrase's last chunk. Count back from there to the last line
   whose first mark is `+`: the last chunk is that many reads after the last loud one.
5. How long Steam has run: restart Steam and note the time, which is the sure way. For a Steam that has run for
   days, Windows gives the start of the process: `(Get-Process steam).StartTime` in PowerShell (not tried).

Do it on a Steam started that day and again on one that has run for days, and set the counts beside the table
above. These steps were not followed in this form by anyone, and a report of the counts is wanted (below, "When a
result differs").

### The voice's level in the mix

**No script yet.** The mixer adds Steam voice at 255/256 of its level, truncated: a clamped voice enters as 32639
(read, finding 30). With nothing else in the mix and no room, the rule puts a clamped voice at 32639 × `volume`
(computed).
The record measured it two ways. In Set B, at `volume 0.15`, the median of the samples of the clipped steady 1 kHz
tones' plateaus is 4895 to 4896 where 255/256 gives 4895.85, against a ceiling of 4915 (measured, W3-18, finding 30).
In Set K's retake at `volume 0.5`, with `voice_overdrive 1000` bringing every other sound to zero under the voice
about 0.65 s after it starts, the tops sat at exactly 16320 and −16320, 37,644 samples and none above (measured,
finding 32).

To see it: once the map has loaded,

```
voice_loopback 1; dsp_slow_cpu 1; voice_overdrive 1000; volume 0.5
```

then record a loud steady tone as above and look at its tops in an editor: 16320 where `ceiling` finds the game's
16384. Set `voice_overdrive 2` back afterwards (the default, read, finding 30). With the map's sound left on, the
median of a plateau depends on how it is cut: a private try on other takes gave 4,898 to 4,915 by the threshold
(measured 2026-11-13 by the orchestrator, private), so it is not a measure a simple script repeats on any
recording.

### Rooms

**No script yet.** The map's soundscape sets a room, and a voice is not exempt: a share of it passes the room's
reverb and the direct part falls to match (read, finding 32). On 2Fort every soundscape sets the automatic room
(read). The game's Sound quality option at its lowest (`dsp_slow_cpu 1`) empties the room (read).

On 2Fort, record the voice played back as above (the test signal, or anything with sharp stops), once with
`dsp_slow_cpu 0` and once with `dsp_slow_cpu 1`. With the room, each sharp stop is followed by echoes; with
`dsp_slow_cpu 1` they are gone at once (measured, Set K, finding 32). At the game's own shares the room's part sat
21.6 dB under the voice in the record's take (measured, Set K). Measuring a room needs the procedure of W3-17
(`docs/work-orders/W3-17-room-effects.md`, "The owner's recording").

### The network

**No script yet.** The game loses a network packet whole, and one packet carries one voice message on a listen
server (read and inferred, finding 8). It has no path that makes a frame late (read, finding 9). On a listen server
with `net_usesocketsforloopback 1`, `net_fakeloss` 5, 10 and 15 remove 21.7, 37.0 and 49.8% of voice messages (the
rule read, the arithmetic computed; not measured, finding 8).

The steps are in `tests/testsignal/README.md` ("Network takes"). In the game's console, one line:

```
net_usesocketsforloopback 1; map ctf_2fort
```

Once the map has loaded:

```
sv_cheats 1; voice_loopback 1; net_fakeloss 5
```

Record as above, then again with `net_fakeloss 15`, and set it back to 0. The record's takes of the network signal
show 3.1 and 3.9 runs of lost sound a second at 5 and 15, 3.5 and 6.1 frames long on average (measured, Set C,
finding 8). With `net_fakelag 100; net_fakejitter 50` no sound is missing (measured: 96.0% present against the
baseline's 96.5%, finding 9). The measure of lost runs is not in the repository (finding 8).

### The codec, heard

**No script yet.** Steam's encoder sends one-byte frames for a steady tone after a while, and the decoder plays
comfort noise 7 to 20 dB under the tone (measured, finding 13): in Steam's packets a −36 dBFS sine went into DTX after
0.42 s and a −30 dBFS one after 1.16 s (measured, finding 13). A steady tone under about 60 Hz becomes a nearly
constant offset, in plateaus that start 0.6 to 1.2 s into the tone and change every 420 ms (measured, Set F, finding
18). A held chord after a sung phrase becomes a deep whoosh (measured, Set E, finding 17).

Play the low-tone signal (`python3 tests/testsignal/make_lowtone.py`, which needs numpy; `tests/testsignal/README.md`,
"Low-tone takes") as above, at the default settings, and look at the recording in an editor: the steady 50 Hz tones
lift off the centre line in plateaus. Their sign is random in the game and in the app (measured, finding 18).

## When a result differs

The last line gives the reason. Look for these, in order:

1. **A step was missed.** The script names what it can see: a file at the wrong rate, a file with no sound, a file
   that is not whole packets of the codec named, two files at different rates, a recording that ends more than one
   packet before the clip does (the key was released early: hold it until the clip has ended, about 15 s), two
   recordings for `gain` whose lengths are more than one packet apart. A recording of 512-sample packets
   from `vaudio_speex` is the 64-bit game's fall-back (step 2). A `voice_maxgain 10` recording checked as 1 differs
   everywhere. For `ceiling` and `clock`: an effect or a volume under 100% in the system, a lossy recording, a voice
   too quiet or with no game sound under it, a recording too short. For `gate`: `@voice_spew_activity_check 1` not
   set, a press too short, a clip other than the one `mic_inputfile` played, a second press with no `loaded` line.
   For `queue`: `voice_showchannels 2`, a second speaker, `--fps` not the counter's number, a frame rate the PC did
   not hold, a log with marked parts and no `--section`.
2. **The build differs.** Compare the game's `version` line in the console with the record's runs: Set O ran TF2
   build 11191711 (measured). The files the findings were read from are to be listed with their builds and
   SHA-256 in the record (not built yet: order RP-01d). A hash that differs from theirs refutes nothing: the game
   and Steam update.
3. **The finding is wrong for your PC.** Then the record wants to know.

For the last two, open an issue on [the repository](https://github.com/neb882/source-VOIP-converter7/issues)
holding the script's output, the game's `version` line, Steam's build date (Help, About Steam), and whether the
game ran as 64-bit or 32-bit. The output is figures only; post nothing else of your files.

## Not built yet

| Check | What it will check | Findings | Order |
| --- | --- | --- | --- |
| `hold` | Steam's hold after speech and its clock, from Steam's console and the game's log side by side | 12, 16, 28 | none yet: it waits on the owner's runs with both consoles at two uptimes ([owner-runs.md](owner-runs.md), "The key, for W3-11c"); the steps by hand are above |
| the packet counts in `queue` | Steam's resampler gives the logged count of every packet | 29 | none yet |

`node tests/reproduce.mjs hold` prints "not built yet" and exits 3.
