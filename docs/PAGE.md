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
render back into it (see "Downloads"). A WebM or Matroska video gives its audio only. A source from any video file
renders on the file's own timing, whatever **Phrase timing** says, so the sound stays with the picture.

**TF2 demos.** A SourceTV demo (`.dem`) holds each speaker's voice packets as the server received them, so no
second encoding happens.
- On Steam voice each speaker is found by the SteamID their packets carry; with `vaudio_celt` and `vaudio_celt_high`,
  by the player's slot. A menu picks one when there are several.
- The demo's packets are decoded, and the render runs only the receiver's side on them: the gain, the mixer, the
  room and the output. The sender, gate, codec and network settings are not used.
- That decode is not yet the one a `steam` render uses: a demo's Steam packets are decoded to floats and resampled
  by the app's own resampler, not by Steam's 16-bit decoder and FFmpeg's resampler. Using a render's decoder for a
  demo is not built yet (order W3-02g). There is no voice channel either: a demo's voice renders on the file's own
  timing, whatever **Phrase timing** says.
- The codec lane shows the demo's own frames, DTX and lost packets included.
- Steam voice, `vaudio_celt` and `vaudio_celt_high` are read. A demo made with `record` keeps the voice messages
  but not their audio, so record with SourceTV ([tests/demovoice/README.md](../tests/demovoice/README.md)).

**The microphone.** **Record** captures the microphone as uncompressed PCM, with the browser's echo cancellation,
noise suppression and gain control off, so the only lossy pass is the emulated codec.

## Rendering and the status line

A new source renders by itself. A changed setting renders a source of 60 s or less again, 400 ms after the last
change. A longer source renders again by itself, in the same way, after a change on the receiver's side alone (the
first group under "What a render runs again"), when its render on screen took at most 30 s on this device: the
render then starts from what the page's worker kept, the codec's result. With the codec skipped it starts from the
kept capture signal, and a source over 30 s then plays its first seconds while the rest renders; a demo's voice also
starts from the kept capture signal, with no first seconds (a demo never has them). Such a
render runs only in the worker that holds those stages: when the worker was ended or broke before it began, it does not
run, and the render on screen is marked. After any other change a longer source keeps its
render, marked as made with the earlier settings ("Render again", "(earlier settings)" on the download, the views
dimmed), until you press **Render**. It is marked too when the worker no longer holds what the render on screen
left: after a render with other settings before the codec's result started (even one you cancelled), or after the
worker was ended. A render from the start takes longer than one from the codec's result, so after a first render
of more than 30 s the first change is marked; after one press of **Render** the next change renders by itself when
that render took at most 30 s. A render you cancelled, or one that failed, does not start again by itself: a change
to other settings, or **Render**, starts one. A render that
replaces one of the same source keeps the player's place, whether it plays, and what **Hear** plays. Nothing plays
by itself; after the first render the player takes the focus, so Space plays.

The line under the render says how long it took, the length and rate of the sound, the codec, and how many seconds
the voice gate did not send. For a demo it gives the seconds with no voice packets, and for a recorded live session
it says "Recorded live". A render is in the player as soon as it is made; the meter's numbers for it follow a moment
later.

**The game's voice queue.** On Steam voice with the codec on, a render plays the voice through the game's voice
queue by default (**Phrase timing**, at the listener's frame rate and `voice_buffer_ms`; see "Settings"). The
console then gives the frame rate, the wait in ticks and milliseconds, how many phrases opened the channel and how
many joined a running one, and the milliseconds dropped to overflow. With jitter one more line gives how late the
packets came, past the least delay, and how many came on the tick of the one before. While the render on screen was made on the
queue, a line beside **Hear** says that Rendered and Original do not stay in step: a phrase can start early, by up
to about the wait, and at 300 frames a second the render gains about 0.4 ms every second. The line follows the
render on screen, not the controls. A recorded live session is the monitor's sound, on the file's own timing: with
Phrase timing on the game's queue it is marked as made with other settings, its line says so, and it does not
render by itself, whatever its length; a changed setting or **Render** renders it. What is not exact on the queue,
the short pieces it cuts from a sound's first seconds among it, is listed in the README's "Accuracy" and in
[ACCURACY.md](ACCURACY.md).

**What a render runs again.** The page renders in one worker, which it keeps for its renders, its downloads, the
meter and the real take's jobs. It sends the worker the source once. Each render leaves two of its stages there for
the next render of the same source: the capture signal at the codec's rate, and the codec's result (for Steam voice
the sender's messages and their decoded packets; for the other codecs the decoded sound). A render after a changed
setting starts from the last of them that the setting does not change:
- `voice_scale`, `voice_avggain`, `voice_maxgain`, the gain switch, Phrase timing, `fps_max`, `voice_buffer_ms`, `volume`, the room, under water
  and the sound device: from the codec's result, in about half a whole render's time in the page (0.38 to 0.54 of it,
  measured in headless Chromium on the build machine; the W3-02d-2 report);
- jitter on Steam voice: from the codec's result too, since there it only moves when the voice messages reach the
  queue. It is not a change on the receiver's side, so after it a longer source is marked and waits for **Render**,
  as after the changes below;
- the voice gate and its threshold, how long the sender's Steam has run, `snd_bits`, loss, the packet length, and
  jitter on the other codecs: from the capture signal;
- the codec, the codec switch, the capture channel, mic gain and the filters: from the start.

The sound is the one a render from the start gives, sample for sample. A new source, or a demo's other speaker, starts
from the start. The console's line after each render ("ChangeLevel: rendered …") ends with where the worker started
it: from the kept codec result, from the kept capture signal, or from the start.

**Cancel** stops a render at its next pause, within a moment, and the worker keeps what the render had finished for
the next one. A render that has not stopped after half a second and 15 ms for each second of the source has its worker
ended; the next render starts a new one and sends the source again.

**The first seconds.** A source longer than 30 s first gets a render of its first 15 s, and the player can play its
first 14 s while the rest renders; the line under the player says "The first 14 s; the rest is rendering…". The
downloads, the views and the meter wait for the whole render, which then takes the player's place where playback
had got to, playing or not. A render that stops before (cancelled, failed or replaced by a newer one) gives the player
back what it held. The first seconds are made only where a test shows they are the whole render's, sample for
sample: with no loss and no jitter, no room and not under water, a sound device at 44.1 or 48 kHz, and not for a
demo. They are not made when the render starts from the codec's result.

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
  voice as audio, and renders with Phrase timing as the page has it.
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

**The game's voice queue.** Three controls set it, for Steam voice only (another codec hides them):
- **Listener's frame rate** (`fps_max`, 10 to 1000, 300 by default) is how many frames a second the listener's game
  draws, which the game's `fps_max` caps. The page takes one figure for the whole render. A new phrase waits longer
  at a higher rate. It is a property of the listener's PC, so a preset leaves it alone.
- **Voice buffer ms** (`voice_buffer_ms`, a whole number from 1 to 5000, the game's 100 by default) is the wait
  before a new phrase plays, counted down one frame at a time. A preset sets it to 100.
- **Phrase timing** (`voice_timeline`, the app's name) is "The game's voice queue" by default, or "The file's own
  timing", which keeps every sound where the source has it. A preset sets the queue. With the codec skipped, a
  demo's voice or a video, a line under the control says why the render keeps the file's own timing. The live
  monitor always keeps it. The page no longer offers "Talk-spurt timing", a flat rule fitted to one set of takes;
  `voice_retime` 1 and 0 now set `voice_timeline` `game` and `source`, and a share link or saved settings with
  `retime=1` get the game's queue.

Each control's sentence gives the figures behind it (the waits are read; what a low frame rate does to long
unbroken sound is the game's rule as read, run on the model, and no recording shows it).

**Jitter** (`net_fakejitter`, 0 to 100 ms on the page) spreads when packets arrive. It does a different thing on
each kind of path, and a line under the control says which, while the control is above 0:
- On Steam voice on the game's voice queue each voice message reaches the queue later, by the game's own lists for
  `net_fakejitter` with `net_fakelag` taken as twice it. The lists' rule is read; how often the server and the
  listener look at them is chosen, and the lag is chosen too (finding 9). None is lost and the order is kept. A bunch
  can skip sound and a gap can restart a phrase. No line is shown, and the render's console line gives how late the
  packets came.
- On Steam voice on the file's own timing (the setting itself, the codec skipped, a demo's voice or a video) it
  does nothing, since there is no queue for it to act on. The line says: "Jitter does nothing on the file's own
  timing: it moves when packets reach the game's voice queue."
- On the other codecs, with the codec on and not on a demo's voice, it is still a fit to one recording: single
  frames marked late, 3.2% of them at 50 ms (finding 9). The game makes no frame late (read). The line says so.
- Where no codec runs it does nothing on any codec: with the codec skipped, and for a demo's voice, which is played
  as the game received it. On a codec other than Steam voice the line then says "Jitter does nothing here: the codec
  is skipped." or "Jitter does nothing here: a demo's voice is played as the game received it." Loss does nothing
  there either.

The chain strip's Network cell follows the same rule: "50 ms jitter" where it runs on the queue, "50 ms jitter (a
fit)" on another codec, "jitter off (no queue)" on Steam voice on the file's own timing, and "loss and jitter off"
with the reason where no codec runs; it is marked only where loss or jitter acts. Its Receiver cell names the queue
only where a render runs it, so for a demo's voice or a video it says "the file's own timing". The live monitor keeps
the file's own timing, so on Steam voice jitter does nothing there yet (the queue in the monitor is W3-02c-3, not
built yet); while the monitor runs on Steam voice with jitter above 0, its note under the panel says so. There is
no lag control: a steady lag delays every packet alike and a render does not show it. The console's `net_fakelag`
says so and changes nothing. A share link keeps jitter as `jit`, and the Laggy preset sets 50.

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
| `fps_max`, `voice_buffer_ms`, `voice_timeline` | the game's voice queue: the listener's frame rate, the wait, and Phrase timing (`game` or `source`; the app's name) |
| `voice_retime` | an old name: 1 sets `voice_timeline game`, 0 sets `voice_timeline source`, and it says that the flat rule is no longer offered |
| `writeconfig` | copies a share link of the current settings |
| `preset_save`, `preset_load`, `preset_list`, `preset_delete` | presets of your own, kept in this browser |
| `+voicerecord`, `-voicerecord` | start and stop a microphone recording, as **Record** does |
| `play`, `stop`, `restart` | the player |
| `screenshot` | saves the visualizer as a PNG |
| `net_graph 1` to `4` | a Source-style overlay whose packet rate, payload rate and loss come from the last render; its frame rate and ping are the page's own |
| `sv_cheats 1` | lifts the upper limits of mic gain and of packet loss, and lets `voice_scale` go to 4 |
| `sv_simulate_events 0` | stops the simulated game feed (kills, chat, joins and drops) |
| `net_jitter` | another name for `net_fakejitter` |
| `net_fakelag` | prints that a steady lag does not show in a render and that the app takes the lag as twice `net_fakejitter`; with or without a value it changes nothing |
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
  - **On the game's voice queue** (Phrase timing's default on Steam voice) the lane shows what plays in each 20 ms of
    the render, so a phrase the queue starts early is drawn early. An empty slot reads **silence**: nothing of the
    source plays there, because the gate was closed, the queue was waiting, or it had run out. A white mark across
    the lane is one skip: the queue holds half a second of sound, and when more arrives than fits the oldest is
    dropped and the voice jumps ahead (read; findings 22 and 23). A skip that would come after the source's end is
    never heard and gets no mark. The legend counts the marks and the sound they skipped. Hovering also gives the
    number of the frame the sender sent, the second of the source heard there and how early or late it plays, whether
    its phrase opened the queue or joined a running one, and the sound skipped at a mark.
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
  against that render rather than the raw source (on Steam voice jitter marks no frame late, so a render with
  jitter and no loss is one): the render shares the take's gating, comfort noise and low-tone
  plateaus. A take already loaded is lined up again after each such render.
- **Placing each spurt.** By its level envelope, which even a pure tone's onset pins down, and by its waveform at
  2 kHz. The search is within ±0.6 s, leaning toward the delay the earlier spurts had.
- **Refining.** Windows of 1 s at 8 kHz follow the delay through the spurt, and split it where it steps. One clock
  ratio serves the whole take.

The status line then gives the phrases and the pieces the take came apart into, the least and the greatest delay,
the clock in ppm and the correlation. The delay is the take's time less the render's when the take was lined up
against a render ("take minus render"), and less the source's otherwise ("take minus source"). The changes of delay
are counted as changes between phrases and within a phrase. Within a phrase the engine drops one sample from every
packet, and on the game's voice queue skips what overflows its ring (read; finding 10).

Lined up against a render on the game's voice queue, an early start that the take and the render share shows no
change of delay. The take's clock then reads near 0 parts in a million in place of about +400, because that render
drops the one sample from every packet too (inferred from the rule; the orchestrator's private run on two takes gave
+5 and +0 against +408 and +413 on the file's own timing, measured).

**Phrase starts.** After its other lines the report says at how many changes from one phrase to the next the take
starts early, by 80 ms or more (chosen), and, with a render on the game's voice queue on screen, at how many the
render does and at how many the two are of one kind (early, kept, or late by 80 ms or more). A line under it lists
the changes, the take's beside the render's, in ms. The take's own change is its change of delay plus the change
the render it was lined up with made there (from that render's phrases on the queue), so it is the take's change
against the source. With a render on the file's own timing on screen the report says that render starts no phrase
early. A source of one phrase has no change and no such line.
- The take's phrases still come from the 20 ms frame gate, a fit, not from Steam's sender.
- The count was checked on takes made from the model's own renders, and not on a recording (measured on the
  model).

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
