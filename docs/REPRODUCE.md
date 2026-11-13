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
10](FINDINGS.md#10-the-older-engine-codecs) gives it as read): the checks of Steam's side (`hold`, `gate`,
`queue`) are not built yet.

Three more checks need more than the game. `ceiling` and `clock` need a recording of what the PC plays: a
recorder, and a way to play a file into the game as its microphone ("With a recorder of the PC's output"). `demo`
needs a dedicated server ("With a server"). The rooms, the network and the codec as heard have steps on this page
and no script yet.

Each check below was run on the owner's recordings of the game on 2026-11-13, with the script as it stands here,
and gave "as expected" (measured; the record's entry "The script run on the game's files"). Each section gives
that run's figures beside the record's older ones, which were made with other code (findings 26 and 31). Those
recordings are not published yet (order RP-01e), so nobody else can repeat that run today: what CI runs is the
suite `reproduce`, on stand-ins that this repository makes, and a stand-in cannot show that the script lines up a
file as the game wrote it.

## What you need

- Windows, Team Fortress 2 and Steam. Everything here was measured on Windows.
- [Node](https://nodejs.org) 22 or later, and a copy of this repository: a clone, or the ZIP from the repository's
  page. No package is installed and nothing is built.
- A command prompt in the repository's folder. Every command below is run from there.
- For `ceiling` and `clock` only: a recorder of what the PC plays, and a virtual audio cable to play a file into the
  game as its microphone (below, "With a recorder of the PC's output"). For `demo` only: a dedicated server with
  SourceTV ("With a server").

**Nothing leaves your PC.** The script opens no network connection; the suite `reproduce` holds that by reading the
script's text and by running every check with the network refused. **The output can be posted as it is.** It
holds figures and the script's own words: no line of your files, no path and no file name. A file is named by its
place among the arguments ("file 1", "file 2").

`node tests/reproduce.mjs` alone lists the checks. Each check ends with one line: `<check>: as expected` (exit 0),
`<check>: differs: <the reason>` (exit 1), or `<check>: cannot check: <the reason>` (exit 2).

## The two clips

The game takes a file as its microphone. The clips for it are made by a script, the same bytes on every PC:

```
node tests/reproduce.mjs inputs clips
```

This writes two files into the folder `clips` and prints each one's SHA-256 with "as expected" or "differs" beside
it. They are the files the game was fed in the record's runs (measured, 2026-11-13; the record's entry "The
file-input runs, measured again"):

| File | For | Rate | Samples | SHA-256 |
| --- | --- | --- | --- | --- |
| `voice_input_22050.wav` | `vaudio_celt`, `vaudio_celt_high` | 22050 Hz | 291,942 | `fc1c6cbd9aabd8ed1b64d4381eae3c2f56dce23eff36e14ba7d9f67dc5505a58` |
| `voice_input_11025.wav` | `vaudio_speex` | 11025 Hz | 145,966 | `bd31df844cee4b38fe705be1fbdfb1b17acb9f161f9314b06b1eb2ba0d560dbd` |

Each is 13.2 s of tone bursts, a sweep and a harmonic tone with pauses, 16-bit mono with a plain 44-byte header
(the generator is `tests/recordings/make-inputs.mjs`). If a checksum differs, your Node computes the clip
differently and the other checks would compare with another input: report it (below) and stop there.

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

## With a recorder of the PC's output

**Not yet run on a recording of the game.** The script's `ceiling` and `clock` have run on stand-ins only (the suite
`reproduce`); the record's figures below were measured with other code.

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
  24 bits (Set B). The script reads WAV (16- or 24-bit, or float, any number of channels; it reads the first): save
  the recording as WAV, or convert the lossless file to WAV. Nothing lossy: an MP3 moves the clipped samples
  (measured, finding 7).
- **Nothing in between.** Turn off the system's effects on the output and on the cable (enhancements, loudness
  equalisation, spatial sound) and keep the game's sound at 100% in the system's mixer, as the record's low-tone takes
  asked (`tests/testsignal/README.md`).

**The signal.** The record's takes used the test signal, which a Python script makes (Python 3 with numpy and
scipy; the one step on this page that needs more than Node):

```
python3 tests/testsignal/make_testsignal.py
```

It writes `tf2_voice_testsignal_v1.wav`, 142.9 s, with SHA-256
`efd1c0bce69bfd87c70fff4ab591d9b165046f67ed992b8c0d185152eecf75e0` (Set B; the hash is for numpy 2.4 and scipy 1.17,
`tests/testsignal/README.md`). Any other file works too: `ceiling` needs only a sound loud enough for the receiver's
gain to clamp it, and `clock` is given the file that was played, whatever it is. The record's speech and music takes
read the same clock as the test signal (measured, the table of [ACCURACY.md](ACCURACY.md)).

**In the game.** Steam voice, your own listen server, the voice played back to you. In the game's console, one line:

```
sv_voicecodec steam; map ctf_2fort
```

Once the map has loaded:

```
voice_loopback 1; dsp_slow_cpu 1; voice_overdrive 1000; volume 0.5
```

- `dsp_slow_cpu 1` is the Sound quality option at its lowest: no room on the voice (read, finding 32; measured to
  take effect at once, Set K). It is saved with the game's settings: set the option back afterwards.
- `voice_overdrive 1000` brings the game's other sound to zero under a voice about 0.65 s after it starts (measured,
  Set K, finding 32); the default is 2 (read, finding 30). Set it back with `voice_overdrive 2`.
- `volume 0.5` is the value of the record's retake (Set K). Any value does: give the one you used to `ceiling`.
- Leave `voice_maxgain` at 10, as the record's takes had it (Set B): the gain then clamps a loud sound (finding 3).
- Keep the game's speakers on headphones, the default: with two speakers the voice enters at 182.6/256, not 255/256
  (read; that the voice is in that group of the sound mixer is inferred; no recording, finding 30).

Start the recorder. Type `+voicerecord` in the console and press Enter, start the file, and when it has ended type
`-voicerecord` and press Enter. One press for the whole file.

## ceiling

**Not yet run on a recording of the game.**

**The claim.** The mixer adds Steam voice to the mix at 255/256 of its level, truncated: a voice at full scale
enters as 32639. The sum of all sound is then clipped at ±32767, `volume` is applied, and the result is rounded to
16 bits, in that order (read, finding 30). So a clamped voice has flat tops at 32639 × `volume`, and no sample of the
output passes round(32767 × `volume`), the game's ceiling. The system's conversion to 48000 Hz keeps flat tops
exactly on their level (measured, finding 30).

**The signal and the steps.** Any loud sound, recorded as above.

```
node tests/reproduce.mjs ceiling output.wav --volume 0.5
```

The script finds the flat tops as the page's real-take check does (`TF2Reference.clampLevel`), counts the samples
that sit flat there in runs of four or more, and prints their value, the largest sample, and the `volume` the flat
tops give.

**What to expect.** Flat tops at 32639 × `volume` and no sample over round(32767 × `volume`), each within one 16-bit
step (measured): at `volume 0.5`, tops at exactly 16320 and −16320 and none above (measured, Set K's retake, 37,644
samples, findings 30 and 32); at `volume 0.15`, tops at 4895 to 4896 under a ceiling of 4915 (measured, Set B,
finding 30), and the largest sample of Set D's sender take exactly 4915, with none above (measured, finding 30).

**A different result.** Tops under 32639 × `volume` by the same share everywhere: a room on the voice (with an
open-space room, 250/256, the tops at `volume 0.15` would be 4781, computed in finding 32), two speakers in place of
headphones, a system volume under 100%, or a `volume` other than the one given. Samples over the ceiling: something
after the game raised the level (the system's mixer, an effect, the recorder's gain). No flat top: the sound was not
loud enough to be clamped. The record's room takes show the system's mixer limiting the tops (Set K, finding 32).

## clock

**Not yet run on a recording of the game.**

**The claim.** The engine copies each packet into its queue one sample short: the packet's first sample is left out
(read, finding 24). So the game plays the voice faster than its source by the packets a second over 44100. Steam
hands voice out in about 17.8 packets a second (finding 25): 17.8 / 44100 is 403 parts in a million (computed,
finding 24). The script's render keeps every sample, so a recording runs ahead of it by that much.

**The signal and the steps.** The file you played (the test signal, or any other), recorded as above, with no
`net_fake` setting.

```
node tests/reproduce.mjs clock output.wav tf2_voice_testsignal_v1.wav
```

The script renders the second file with the `steam` profile at its defaults, at the recording's rate, and lines the
recording up against that render phrase by phrase as the accuracy suite does (`TF2Reference.track`), with one clock
for the whole take.

**What to expect.** The recording plays +397 to +416 parts in a million faster than the render: the range of the
record's takes without loss or jitter, of Sets A to F, in the table of [ACCURACY.md](ACCURACY.md) (measured; 404
to 406 on most takes, finding 24). One take read +510 (`take3_voice_maxgain_1`, measured, the same table); it had
22.3 packets a second, and 22.3 / 44100 is 506 (computed; finding 24's 505 is that figure or an earlier reading,
inferred, as its note says).

**Outside that range, count your packets.** Type `voice_showincoming 1` in the console before the press. The
console then prints one line a packet with its count of samples (read, finding 27). Copy a few hundred of the lines
printed while the file played, count them and add up their counts: the packets a second are the lines times 44100,
over that sum (computed: each count is the packet's sound at 44100 Hz). Give it to the script:

```
node tests/reproduce.mjs clock output.wav tf2_voice_testsignal_v1.wav --packets 17.9
```

With `--packets` the clock is expected from 6 under to 13 over the packets a second over 44100. That window is the
record's range around 403 (computed from the figures above; a choice of this check), and the +510 take falls inside
its own (506). Without `--packets` the script uses the record's range and says so.

**A different result.** A recording too short or too quiet to line up is "differs" with the reason: the script asks
for at least 20 one-second windows that line up (a choice of this check). A clock far off with `--packets` given:
lost or delayed packets (the record's takes with `net_fakeloss` or `net_fakejitter` read +280 to +2792, measured, the
same table), a recorder or system that converts the rate, or a finding wrong for your PC.

## With a server

`demo` needs a SourceTV demo, which needs a dedicated server: a second program, run on your PC or another, that the
game joins.

## demo

**Not yet run on a recording of the game.** The script's `demo` has run on stand-ins and on
`tests/demo/synthetic.dem` only, not on a demo the game's server wrote.

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
frames, the end markers, the silence records and any numbers that skip (frames lost before the demo).

**A different result.** A demo with no voice, or with one phrase only, cannot show the numbering and is "differs"
with the reason. A demo of another codec (`sv_voicecodec` set to one of the engine's) is refused by name. A frame of
another kind, or a rate other than 24000, would be a finding for the record.

## Steps only (no script yet)

These are steps a stranger can follow and look at by ear or in an editor. **No script yet:** none of them is
measured by the script, so what you see is not compared with the record's figures for you.

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
   everywhere. For `ceiling` and `clock`: a room, two speakers, an effect or a volume under 100% in the system, a
   lossy recording, a voice too quiet, a recording too short.
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
| `hold` | Steam's hold after speech and its clock | 12, 16, 28 | RP-01b, not built yet (planned again first) |
| `gate` | Steam's sender gate, chunk by chunk | 5, 27, 28 | RP-01b, not built yet |
| `queue` | the receiver's queue, from the game's console log, and the packet counts | 22, 23, 24, 25, 29 | RP-01b, not built yet |

`node tests/reproduce.mjs <check>` for one of these prints "not built yet" and exits other than 0.
