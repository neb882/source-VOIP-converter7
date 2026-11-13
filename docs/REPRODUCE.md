# Check it on your own PC

Some of the findings in [FINDINGS.md](FINDINGS.md) can be checked with your own copy of the game and one script
from this repository. This page gives the steps and what to expect. Every figure on it is the record's
([tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md)), with its standing and its finding's number; the two that
are not (a tolerance and a map) say so.

**Start with `celt`, `gain` and `speex`.** They need the game and nothing else, depend on no clock and no frame
rate, and should give the same result on any PC. They check the engine's older codecs and the receiver's gain.
They say nothing about Steam voice, the codec TF2 runs unless `sv_voicecodec` is changed (read;
[FINDINGS.md, entry 10](FINDINGS.md#10-the-older-engine-codecs)): the checks of Steam's side (`hold`, `gate`,
`queue`) are not built yet.

Each check's section says "not yet run on a recording of the game" until the script itself has been run on one.
The figures it expects come from the owner's runs of the same comparison, made with other code (findings 26 and
31). A stand-in that this repository makes passes every check (the suite `reproduce`), but a stand-in cannot show
that the script lines up a file as the game wrote it.

## What you need

- Windows, Team Fortress 2 and Steam. Everything here was measured on Windows.
- [Node](https://nodejs.org) 22 or later, and a copy of this repository: a clone, or the ZIP from the repository's
  page. No package is installed and nothing is built.
- A command prompt in the repository's folder. Every command below is run from there.

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

1. **Put the clip in the game's folder as `voice_input.wav`.** The game's folder is the one that holds the game's
   executable: in Steam, the game's Manage, Browse local files. Copy the 22050 Hz clip for `vaudio_celt` and
   `vaudio_celt_high`, the 11025 Hz clip for `vaudio_speex`, and rename the copy `voice_input.wav`. That folder is
   measured for TF2's 64-bit game; for the 32-bit game the record's notes do not name it, and if nothing is
   written, try the `tf` folder inside it.
2. **Start the game.** For `vaudio_celt` and `vaudio_celt_high`, start TF2 as usual. For `vaudio_speex`, start the
   32-bit game from a command prompt in the game's folder, as the record's runs did:
   `tf.exe -force32bit -game tf -console`. The 64-bit game cannot load the Speex module: it runs `vaudio_celt` in
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
   No key needs to be bound. To see which codec ran, type `voice_showincoming 1` before the press: the console
   then prints one line a packet with its sample count (read, finding 27), 512 under `vaudio_celt` and 1024 under
   `vaudio_celt_high` (measured, Set H), multiples of 160 under `vaudio_speex` (measured, Set O: 320 and 480;
   finding 31). A count of 512 under `vaudio_speex` is the 64-bit game's fall-back.
6. **Copy the files away before the next press.** The game writes `voice_decompressed.wav` and `voice_micdata.wav`
   into the same folder (measured for TF2, Set H), and writes them again at every release of the key (measured
   again on 2026-11-13, when a sitting was lost to it). Copy both somewhere else and rename them, for example
   `celt_gain1.wav` and `celt_micdata.wav`.
7. **For `gain`, record again at `voice_maxgain 10`**, with the same codec and clip: `voice_maxgain 10`, then step
   5, then step 6 (for example `celt_gain10.wav`).

The game reads the file at its codec's rate whatever its header says (read, W3-03's report), and skips its first
two samples (read and shown on Set H, finding 27). It takes the file in order, whatever the frame rate (read,
W3-08's report). The recording holds at most 1 MiB (read, finding 27): 23.8 s at 22050 Hz (computed), so 15 s of
the 13.2 s clip fits.

## gain

**not yet run on a recording of the game**

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

**not yet run on a recording of the game**

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

**What to expect.** All but a few samples equal, each of the others one step off: the record has 292,351 of
292,352 for `vaudio_celt` and 292,789 of 292,864 for `vaudio_celt_high` (measured, Set H, finding 31). The script
passes at most 0.05% of samples one step off and none further, which is Set H's larger share doubled (a choice of
order RP-01, not a figure of the record), and counts the last packet apart.

## speex

**not yet run on a recording of the game**

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

## When a result differs

The last line gives the reason. Look for these, in order:

1. **A step was missed.** The script names what it can see: a file at the wrong rate, a file with no sound, a file
   that is not whole packets of the codec named, two files at different rates. A recording of 512-sample packets
   from `vaudio_speex` is the 64-bit game's fall-back (step 2). A `voice_maxgain 10` recording checked as 1 differs
   everywhere.
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
| `ceiling` | the mixer's ceiling and `volume`, in a recording of the output | 1, 30 | RP-01c, not built yet |
| `clock` | the one sample a packet, in a recording of the output | 10, 19, 21, 24 | RP-01c, not built yet |
| `demo` | Steam's packets in a SourceTV demo, with a server | 2, 11, 16 | RP-01c, not built yet |

`node tests/reproduce.mjs <check>` for one of these prints "not built yet" and exits other than 0.
