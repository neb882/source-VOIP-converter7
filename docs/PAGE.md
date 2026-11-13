# The page's tools

What each tool on the page does, tool by tool. The README's "Use it" has the four steps in short; what the
voice path does to the sound is in [VOICE-PATH.md](VOICE-PATH.md), and the live monitor has a page of its own,
[LIVE.md](LIVE.md).

## Loading a source

Step 1 takes an audio file, a video file, a TF2 demo or the microphone. Choose a file, or drop one anywhere on the
page. Several files chosen or dropped at once go to the batch (step 4).

| What | Limit |
| --- | --- |
| an audio file | 100 MB and 10 minutes |
| a video file | 1 GB; its audio 10 minutes |
| a demo | 512 MB; the first 10 minutes of voice are kept |
| a microphone recording (**Record**) | 5 minutes |
| a real take to compare | 15 minutes |
| a recorded live session | stops just short of 10 minutes |

Which formats load depends on the browser. A new source renders by itself.

**A file's own rate.** A file is decoded at the sample rate its header gives, not at the sound device's, so the
same file gives the same samples and the same render on any machine (`filerate.js`). The header is read for WAV
(also RF64 and BW64), AIFF, FLAC, MP3, AAC, Ogg and MP4 or MOV. Opus always decodes at 48 kHz. An AAC stream whose
core runs at 24 kHz or less and which does not say whether it carries SBR is decoded at twice its core rate, as it
may be HE-AAC. A WebM or Matroska file, whose rate the page does not read, is decoded at the device's rate, and so
is any file the browser cannot decode at its own rate; the console says so.

**Video.** A video's audio track becomes the source. An MP4 or MOV is kept, so that **Download video** can put the
render back into it (see "Downloads"). A WebM or Matroska video gives its audio only.

**TF2 demos.** A SourceTV demo (`.dem`) holds each speaker's voice packets as the server received them, so no
second encoding happens.
- On Steam voice each speaker is found by the SteamID their packets carry; with `vaudio_celt` and `vaudio_celt_high`,
  by the player's slot. A menu picks one when there are several.
- The demo's packets are decoded, and the render runs only the receiver's side on them: the gain, the mixer, the
  room and the output. The sender, gate, codec and network settings are not used.
- That decode is not yet the one a `steam` render uses: a demo's Steam packets are decoded to floats and resampled
  by the app's own resampler, not by Steam's 16-bit decoder and FFmpeg's resampler. Using a render's decoder for a
  demo is not built yet (order W3-02g). There is no voice channel either.
- The codec lane shows the demo's own frames, DTX and lost packets included.
- Steam voice, `vaudio_celt` and `vaudio_celt_high` are read. A demo made with `record` keeps the voice messages
  but not their audio, so record with SourceTV ([tests/demovoice/README.md](../tests/demovoice/README.md)).

**The microphone.** **Record** captures the microphone as uncompressed PCM, with the browser's echo cancellation,
noise suppression and gain control off, so the only lossy pass is the emulated codec.

## Rendering and the status line

A new source renders by itself. A changed setting renders a source of 60 s or less again, 400 ms after the last
change. A longer source keeps its render, marked as made with the earlier settings ("Render again", "(earlier
settings)" on the download, the views dimmed), until you press **Render**. A render you cancelled, or one that
failed, does not start again by itself: a change to other settings, or **Render**, starts one. A render that
replaces one of the same source keeps the player's place, whether it plays, and what **Hear** plays. Nothing plays
by itself; after the first render the player takes the focus, so Space plays.

The line under the render says how long it took, the length and rate of the sound, the codec, and how many seconds
the voice gate did not send. For a demo it gives the seconds with no voice packets, and for a recorded live session
it says "Recorded live". A render is in the player as soon as it is made; the meter's numbers for it follow a moment
later.

**What a render runs again.** The page renders in one worker, which it keeps for its renders, its downloads, the
meter and the real take's jobs. It sends the worker the source once. Each render leaves two of its stages there for
the next render of the same source: the capture signal at the codec's rate, and the codec's result (for Steam voice
the sender's messages and their decoded packets; for the other codecs the decoded sound). A render after a changed
setting starts from the last of them that the setting does not change:
- `voice_scale`, `voice_avggain`, `voice_maxgain`, the gain switch, talk-spurt timing, `volume`, the room, under water
  and the sound device: from the codec's result, in about a third of a first render's time (measured on the build
  machine);
- the voice gate and its threshold, how long the sender's Steam has run, `snd_bits`, loss, jitter and the packet
  length: from the capture signal;
- the codec, the codec switch, the capture channel, mic gain and the filters: from the start.

The sound is the one a render from the start gives, sample for sample. A new source, or a demo's other speaker, starts
from the start.

**Cancel** stops a render at its next pause, within a moment, and the worker keeps what the render had finished for
the next one. A render that has not stopped after half a second and 15 ms for each second of the source has its worker
ended; the next render starts a new one and sends the source again.

**The first seconds.** A source longer than 30 s first gets a render of its first 15 s, and the player can play its
first 14 s while the rest renders; the line under the player says "The first 14 s; the rest is rendering…". The
downloads, the views and the meter wait for the whole render, which then takes the player's place where playback
had got to, playing or not. A render that stops before (cancelled, failed or replaced by a newer one) gives the player
back what it held. The first seconds are made only where a test shows they are the whole render's, sample for
sample: with no loss and no jitter, talk-spurt timing off, no room and not under water, a sound device at 44.1 or
48 kHz, and not for a demo. They are not made when the render starts from the codec's result.

## Downloads

Renders are mono 16-bit. The format menu next to **Download** sets the format for single files and for the batch,
and the page remembers it.

| Format | What it is |
| --- | --- |
| WAV | the render itself, every sample written as rendered |
| FLAC | lossless: it decodes to exactly the WAV's samples |
| MP3 | LAME 3.100 at `-V 0`, its highest VBR quality. The tests hold its level within 1% of the render's, and its size under a quarter of the WAV's. The LAME tag carries the encoder's delay, so a decoder that reads the tag returns exactly the render's length. A rate MP3 cannot carry is resampled to 44.1 or 48 kHz first. |

FLAC and MP3 are made from the WAV when the file is saved. MP3 is lossy on top of the emulated codec: it is for
sharing, and WAV or FLAC is for further work. At `volume` 1, the game's default, a loud render fills the whole
range, so an MP3 (or a video's AAC or Opus) can clip when it is decoded; lower `volume` for those.

**Download video** (for an MP4 or MOV source) saves the video with the render as its audio.
- The picture: every video sample is copied as it is, with its timing; it is never encoded again. Other tracks that
  are not audio, such as a timecode, are kept.
- The audio: AAC where the browser has an AAC encoder (WebCodecs). Otherwise Opus in an MP4 (the bundled libopus
  1.6.1), or 16-bit PCM in a MOV, which editors import directly. It starts where the old audio did, and the
  encoder's delay is skipped by an edit list.
- Regular and fragmented MP4 and MOV files are read. The output is a regular file with its index first.

## The batch

Step 4 renders many files with the current settings and saves them one by one or as one ZIP, in the format of
step 3.
- Add files with the batch's own picker, by choosing several files in step 1, or by dropping files or whole folders
  anywhere on the page. A single file dropped outside the batch loads as the source. A video in the batch gives its
  voice as audio.
- Two files render at a time where the machine has four or more cores and enough memory; otherwise one. The batch
  renders and makes its files in workers of its own and keeps nothing between files, so it does not wait for the
  page's render, nor the page's render for it.
- Each row gives the render's length, integrated loudness and true peak, with buttons to preview, save and remove.
- A changed setting marks the renders made before it as made with older settings, and **Render** redoes them. The
  tab's title shows the progress.

## Settings

The controls are grouped in the order of the voice path: **Sender**, **Network**, **Receiver**, **Listener room &
output**, and **Extras: not in the game**. The codec, the listener's position and **Listener under water** sit
above the groups; the advanced groups open with a switch. Every control has one sentence under it saying what it
does to the sound and, where that is not plain, whose default it is. The console's `help <command>` says the same.
A label shows a variable's name only where the game has that variable; the app's own names are console commands.
Most controls have a console name; how long the sender's Steam has run and the live monitor's low latency do not.

The **Voice codec** menu has two groups. "Team Fortress 2": Steam voice, `vaudio_celt`, `vaudio_celt_high`,
`vaudio_speex`. "Not in Team Fortress 2": Fullband Opus (`steam_48`, not in TF2) and `vaudio_miles` (not in TF2;
a codec of the Source engines of 2006 and 2007). Each entry of the second group says so itself, and with
`vaudio_miles` chosen a note under the menu says it is not a TF2 codec, that its codec was checked against one
recording of a 2006 engine, and that the rest of the profile was not. What
each codec runs, and its standing, is in the README's codec table and in [VOICE-PATH.md](VOICE-PATH.md).

**What this browser remembers.** In its own storage, and nowhere else:
- the settings, and whether the advanced controls are open;
- the console's last 50 commands, and the presets saved with `preset_save`;
- the download format and whether **Match loudness** is on;
- the visualizer's choices: the dB and LOG scales, the range, the resolution, the loudness lane, AVG, and the
  view's height.

At start the page takes the defaults, then the remembered settings, then a share link's, which win. Once a share
link's settings are applied they are what is remembered. Storage that is refused or holds something else leaves the
defaults.

**The version and updates.** The footer shows "version N", N being the site's cache number. The site works offline
once it has loaded. When a newer version takes over in the background, a line above step 1 says so; the page never
reloads by itself, because a loaded file and its render live only in the page. Reload when you are ready.

Online, the page and its scripts are checked with the server before they are used, so a visit after an update gets
the new version whole. GitHub Pages sends `index.html` with `max-age=600` (measured on the live site on 2026-11-12;
the other files are inferred to be sent so too), which would let the browser use its own copies for ten minutes
without asking. This holds from the version that brings it (S3-02b) on. The first visit after that version ships is
still answered by the worker the visitor already has: on a navigation within those ten minutes it can show the
previous version, and on a reload a page that does not start if the two versions' markup and scripts do not fit.
The newer worker can take over a few seconds later, but need not (a review saw none across four loads in a row);
once it has, the next navigation or reload is whole (measured in the browser suite's Chromium).

## The console

The developer console takes Source-style `;` chaining, `alias`, `toggle`, `find`, `cvarlist`, `help`, history (the
arrow keys) and Tab completion. Tab completes to the longest common prefix, then lists the matching commands with
their current values. With nothing to complete (an empty line, or a space typed), Tab moves the focus on, and
Shift+Tab always moves it back. A screen reader hears what a typed command answers, not the simulated game feed.

| Command | What it does |
| --- | --- |
| `exec preset_<name>` | applies a quick preset; `exec preset_sewers` runs **Under water** |
| `writeconfig` | copies a share link of the current settings |
| `preset_save`, `preset_load`, `preset_list`, `preset_delete` | presets of your own, kept in this browser |
| `+voicerecord`, `-voicerecord` | start and stop a microphone recording, as **Record** does |
| `play`, `stop`, `restart` | the player |
| `screenshot` | saves the visualizer as a PNG |
| `net_graph 1` to `4` | a Source-style overlay whose packet rate, payload rate and loss come from the last render; its frame rate and ping are the page's own |
| `sv_cheats 1` | lifts the upper limits of mic gain and of packet loss, and lets `voice_scale` go to 4 |
| `sv_simulate_events 0` | stops the simulated game feed (kills, chat, joins and drops) |
| `net_jitter` | another name for `net_fakejitter` |
| `clear`, `echo`, `status` | the console itself |

A few commands are jokes and change nothing in the sound.

## The visualizer

The visualizer has three views. All three follow **Hear**: the render, the original or a real take.
- **WAVE:** the peak and RMS envelope, down to single samples. **dB** switches to a dBFS scale for quiet detail:
  fades, the gate's tails, DTX comfort noise and noise floors. Samples at full scale are drawn red.
- **BARS:** a log-frequency spectrum from 20 Hz, 8192-point, in dBFS. It runs live while playing and is computed at
  the playhead when paused. The version you are not hearing is drawn over it as a line; with a real take loaded,
  that is the take while you hear the render, and the render otherwise. The 12 kHz band edge of the Steam profile's
  Opus is marked in amber, as on SPEC's ruler.
  - **AVG** switches to the long-term average spectrum of the render against the source, or against a real take
    once one is loaded, over the selection or the whole file. It averages 8192-point windows, skips windows below
    −70 dBFS RMS, and smooths over a sixth of an octave. The other version is shifted to the render's loudness, and
    a lane below shows the difference in dB.
- **SPEC:** a spectrogram with a dB colour scale, on a linear axis or, with **LOG**, from 20 Hz.

**The spectrogram's resolution.** The visible band is analysed in tiers. Each tier reads the signal decimated as far
as its top frequency allows (by up to 64), so a low band gets long windows cheaply. **RES AUTO** sizes the analysis
window to the zoom. A Blackman window of T seconds blurs about 0.4 T in time and 2.35 / T in frequency, and AUTO
takes T = 3.4 × √(seconds per column / Hz per row), which blurs about twice as many pixels in time as in frequency,
so tones, harmonics and hum stay sharp.
- Zooming in on time shortens the window.
- Zooming in on frequency, or going lower on the log axis, lengthens it, up to 1.4 s.
- On the log axis each band of about an octave has its own window, and levels are per Hz, so noise reads the same
  across them.

A fixed RES (256 to 16384 samples at the file's rate) uses one window length everywhere. The corner label and the
hover readout give the window and the bin width in use.

**Moving around in WAVE and SPEC:**
- Zoom in time with Ctrl/⌘ and the wheel, a trackpad or a pinch, the − and + buttons, or the + and − keys.
- Pan by dragging, with Shift and the wheel, or with the arrow keys.
- SPEC's frequency axis: the wheel over the frequency ruler, Alt and the wheel or Ctrl/⌘, Shift and the wheel over
  the view, or ↑ and ↓. Drag the ruler to move the band (Shift with ↑ or ↓ from the keys). Double-click the ruler to
  show the whole band.
- FIT or 0 shows the whole file and the whole band.
- Click to seek. While playing zoomed in, the view pages along with the playhead.

Only the visible range is analysed. The range button sets how many dB (48, 72, 96 or 120) the colours, or the dB
waveform, span. TALL, or dragging the bottom-right corner, makes the view taller. Hovering reads out the time and
the level, and in SPEC the frequency with its nearest note, the level and the analysis window.

**The lanes under WAVE and SPEC:**
- **The codec lane** shows what the voice path did with each codec frame, in playback time: 20 ms for Opus, 23.2 or
  46.4 ms for CELT, 14.5 ms for Speex, 32.65 ms for VR12 (`vaudio_miles`, not in TF2). Each kind has its own colour:
  SILK, Hybrid or CELT coding, Speex, VR12, DTX (comfort noise), not sent (the gate closed), lost (concealed, or
  zeros under Speex and VR12) and late (played as silence).
  - Zoomed out, a pixel shows the most common kind of frame, with a red or orange strip on top for the share lost or
    late.
  - Hovering gives the frame's packet size and bitrate.
  - The legend under the view counts each kind.
- **LUFS** adds a loudness lane: momentary (400 ms, thin) and short-term (3 s, bold) loudness of the render (blue),
  the source (white) and a loaded real take (green), each drawn at the centre of its window. Dashed lines mark each
  version's integrated loudness.

**Selection and loop.** Shift and a drag, or a drag along the time ruler, selects a range; Shift and a click moves
the nearer end. The meter then measures just the selection, with a header offering **Zoom to selection** (Z) and
**Clear** (Esc). **LOOP** (L) loops the selection or, with none, the whole file.

## The meter

Under the visualizer the meter lists, for the render (RENDER), the source (ORIGINAL) and a loaded take (REAL):
- integrated loudness and the highest short-term and momentary loudness (ITU-R BS.1770-4, gated);
- loudness range (EBU Tech 3342);
- true peak (4× oversampled), sample peak and RMS;
- peak-to-loudness ratio and DC offset.

A Δ row gives the render minus the original, and with a take a "Δ real" row gives the render minus the take. Values
are measured as one channel; played as dual mono they read 3 dB higher. A cell is flagged where a true peak passes
0 dBTP or comes within 1 dB of it, a sample sits at full scale, or the DC offset is over 0.5% of full scale.

**Match loudness**, beside **Hear**, plays every version at the integrated loudness of the quietest, measured over
the whole file, so that none wins just by being louder.

**Shortcuts:** Space plays and pauses, B switches **Hear** (Rendered, Original, Real take), L loops. With the view
focused, + − 0 and the arrows move around, Z zooms to the selection and Esc clears it.

The DC offset can be a codec's own. When DTX replaces a steady tone below about 60 Hz, libopus 1.1.x's comfort noise
is nearly DC, and TF2 plays it as it is (measured; finding 18 of
[tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md)).

## Checking against your own take

**Compare with a real TF2 take** (under the player) checks a render against a recording of the same source through
TF2. Record it with `voice_loopback 1` as [tests/testsignal/README.md](../tests/testsignal/README.md) describes, load
the source, render it with the settings you recorded with (`volume`, `voice_scale` and the rest), and load the take.
A menu picks the take's channel: the mix, left or right.

**Lining it up** (`reference.js`, in a worker) goes talk spurt by talk spurt, because TF2's receiver moves the start
of some spurts (finding 19).
- **The spurts.** Where the voice gate is on, a 20 ms frame gate with the first measured figures (−39.5 dBFS RMS,
  120 ms before, 440 ms after) splits the source into talk spurts. On `steam` this is not Steam's own sender, which
  a render runs; a threshold typed into the page reaches it as a 20 ms RMS level. Where the gate is off (the engine
  codecs by default) the source is one spurt.
- **What the take is matched against.** Once there is a render with no lost or late frames, the take is lined up
  against that render rather than the raw source: the render shares the take's gating, comfort noise and low-tone
  plateaus. A take already loaded is lined up again after each such render.
- **Placing each spurt.** By its level envelope, which even a pure tone's onset pins down, and by its waveform at
  2 kHz. The search is within ±0.6 s, leaning toward the delay the earlier spurts had.
- **Refining.** Windows of 1 s at 8 kHz follow the delay through the spurt, and split it where it steps. One clock
  ratio serves the whole take.

The status line then gives the spurts, the 5.8 ms latency trims and other moves, the clock in ppm and the
correlation.

The lined-up take then plays as a third version under **Hear** (B cycles the render, the original and the take),
shows in WAVE, SPEC, the loudness lane and AVG, and joins the meter.

**The report** compares the render with the take where they overlap:
- the render minus the take in 15 bands from 40 Hz to 19 kHz, with the two matched in level at 300 Hz to 3 kHz;
- short-term level tracking in blocks of 0.5 s;
- the receiver's clipping signature in both: the ceiling, the share of samples at it, and the mean over the
  ceiling;
- how much louder or quieter the render is at 300 Hz to 3 kHz, which `volume` and `voice_scale` set.

What these checks have shown on the owner's takes is in [ACCURACY.md](ACCURACY.md) and, with its evidence, in
[tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md).

## Tools outside the page

The command-line tools that compare renders with recordings (every take at once, a recording screened for a known
source, a demo's packets extracted) need recordings that are not in this repository. They are described in
[tests/README.md](../tests/README.md).
