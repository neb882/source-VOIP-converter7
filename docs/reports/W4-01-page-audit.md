# W4-01: the page, looked at as a user does

*An audit, 2026-11-10. No app code was changed. The order that follows from it is
`docs/work-orders/W4-01-page.md`. The sound is not the subject here: the page is (its clarity, its defaults,
its speed).*

## How it was done, and its limits

- The page as it is on `main` at `857b200` (cache `tf2ve-v24`, before W3-16 merges), served from the
  repository's own static server on the build machine and driven with Playwright in headless Chromium 153.
- Three screens: a desktop (1440 × 900), a laptop (1280 × 720) and an emulated iPhone 13 (390 × 664 of page,
  its own pixel ratio); an iPhone SE (320 wide) for overflow only.
- The clips are synthetic and seeded: speech-like bursts (voiced syllables on a gliding pitch and noise
  syllables, in phrases with pauses of 0.15 to 1.2 s), mono, 48 kHz, 16-bit, of 10 s, 60 s, 5 minutes,
  9.8 minutes and 30 minutes. No recording of anyone was used.
- **Limits.** One machine with 4 cores; other jobs may have run beside the timings, and two runs of the same
  render differed by up to 25%, so both runs are given. The server is local: there is no network delay, so the
  page-load times say what the browser spends, not what a visitor on GitHub Pages waits. Headless Chromium has
  no microphone, no sound device a person hears, no real touch screen and no screen reader: what a screen
  reader would say is read off the markup, not heard. Memory is the resident memory of all the browser's
  processes over what they held before the file was loaded, sampled five times a second. Firefox and Safari
  were not run.

## What the page costs a user, in order

Each finding gives what was seen or measured. "Shot n" is a picture in `docs/reports/W4-01/`, of the app's own
page with a synthetic clip loaded:

| Shot | File | What it shows |
| --- | --- | --- |
| 1 | `1-first-screen-laptop.png` | the first screen at 1280 × 720, nothing loaded |
| 2 | `2-file-loaded-laptop.png` | the same screen after a file is chosen: nothing has happened, and step 3 is under the fold |
| 3 | `3-rendered-step3.png` | step 3 after a render: the buttons, the picture, the loudness table, then the player |
| 4 | `4-advanced-controls.png` | every setting, with its label and console-style name and no explanation |
| 5 | `5-changed-setting-stale.png` | after `voice_scale` was set to 0.5: "Ready", the old picture, no preset lit |
| 6 | `6-live-refused.png` | the live panel after the microphone could not be had |
| 7 | `7-phone-file-loaded.png` | the phone's first screen after a file is chosen |
| 8 | `8-phone-meter-player.png` | the phone: the loudness table cut off at its box's edge, the player under it |

### 1. Choosing a file does nothing a user can see or hear

After a file is chosen or dropped, the status line names it and the page waits. The user must find
"Process Audio" in step 3, press it, wait, then find the player, which sits under the picture of the sound and
the loudness table, and press play.

- From a dropped file to sound: the drop, a press on Process, a scroll, a press on play. To the file on disk:
  one more press. The result never plays or comes into view by itself (`paused` is true after a render;
  the page does not scroll).
- At 1280 × 720 the Process button is at 788 px, under the fold of 720; the player is at 1140 px before a
  render and about 1290 px after it (shots 1 and 2). At 1440 × 900 Process is just in view and the player is
  390 px under the fold. On the phone Process is 1398 px down a 664 px screen: two screens of scrolling past
  the presets and the chain strip, with nothing pointing there (shot 7).
- Before a render the player is empty: the original cannot be heard on the page until a render exists.
- With the keyboard: 11 presses of Tab from the file input to Process; after the render the focus is on
  nothing (the pressed button was disabled, so the focus fell to the page), and the player is 16 more.
- The first screen's largest and only green control is "Live" (321 px wide beside a 110 px "Record" and a
  plain file input), though the file is the main journey. The drop target is the whole page, which nothing on
  the first screen says except half a sentence in the status line.
- What is on the first screen before a file: the title, five badges, of which two are for specialists
  ("Real Opus 24 kHz · VBR + DTX · SILK/CELT hybrid", "Receiver auto-gain with the in-game int16 clip"),
  step 1, and step 2's presets and chain strip. Step 3, where the result appears, starts under the fold on the
  laptop.

### 2. A changed setting leaves the old result on the page, presented as current

Change `voice_scale` from 1 to 0.5 (or the codec, or anything): nothing re-renders. The status line still
reads "Ready · Real Opus · 32 kbps · 1.1s render · 48,000 Hz" in green, the picture and the loudness table are
the old render's, the player plays the old render and "Download WAV" saves it (shot 5). Nothing says the
result on screen was made with other settings. The batch list already does this for its own items
("Rendered with older settings · Render to update"); the single file does not.

- To hear the change: press Process again, wait the full render time again (see the speed table: a second
  render with one receiver setting changed takes as long as the first), then press play again and find the
  place: the player goes back to 0:00 and stops (measured: at 4.53 s and playing before, at 0 and paused
  after).
- The chain strip under the settings is the page's summary of what the next render will use. It shows the mic
  gain, the gate, the codec, the loss, the gain cap, the room and the volume. It does not show `voice_scale`,
  `voice_avggain`, the capture channel of a mono file, the bitrate scale's effect on Speex, or the custom
  room's numbers, so a change to those is visible nowhere outside the control itself.

### 3. Nothing can be heard until the whole clip is rendered, and the wait grows with the clip

Time from pressing Process to a playable result, default preset: about 1.1 s for 10 s, 4.5 s for a minute,
21 s for 5 minutes, 36 s for 9.8 minutes (table below). The render is in a worker and the page stays
responsive (no main-thread task over 100 ms in any render up to 9.8 minutes), but:

- The progress bar stops between 60% and 72% for a fifth of the render (0.8 s of 4.5; 4.5 s of 21; 7.5 s of
  36): Steam's resampler and the gain report nothing. For the other profiles the last tenth (90 to 100%)
  takes 1.6 to 1.8 s of a 5-minute render in one step.
- A render of only the first 15 s takes 1.2 s and is, sample for sample, the first 14.98 s of the full render
  (measured for `steam`; 14.997 s for `celt_22`, 14.998 s for `speex`). So the first seconds could be
  heard about a second after the file is chosen, whatever its length.

### 4. Presets: what is selected, what was changed, and how to get back

- "Modern" is the default and is lit on a fresh page. It is the preset the owner cares about, and its
  one-line description is "Measured Steam voice path".
- Any change to any control puts all five presets out: the page then shows no preset at all, not "Modern,
  with voice_scale 0.5". What differs from the preset is not listed anywhere.
- A preset lights up because it was clicked, not because the controls match it. Clicking Modern sets 19
  settings, but not the manual room number or the custom room's three numbers, and the orders in the queue
  add choices that presets are told not to touch (W3-10: "Presets do not change it") or do not mention
  (W3-16's Steam uptime). After those orders "Modern" can be lit while the render is not the default one.
- Getting back is a click on Modern; nothing says so, and there is no "reset".
- Nothing is remembered between visits except the download format (and console history and presets saved
  from the console). The owner's recordings were made at `volume 0.15`; the page starts at 0.5 on every
  visit, and a share link with settings can only be made by typing `writeconfig` in the console.
- The names: "Legacy CELT · CELT-era codec, same receiver", "Mic Spam · Overdriven mic in a tunnel",
  "2fort Sewers · Underwater, muffled" (W3-17d renames it: it never was a sewer), "Laggy · 18% lost frames +
  50 ms jitter".

### 5. The settings carry almost no explanation, and some of what they say is no longer true

Of the 23 settings in the panel, one has help text (a tooltip on talk-spurt timing). The other 22 have a
label of two or three words and a name in the game's console style, which for 14 of them is a name the game
does not have. The table of controls below goes through each. The ones that mislead today:

- **"Gate opens above dBFS: −39.5"**, and the chain strip's "gate > −39.5 dBFS": the `steam` render runs
  Steam's own rule (the mean of |x| over a chunk at 1% of full scale, −40) and the console's line after a
  render says "voice gate at −40 dBFS". W3-11b changes the control and the strip.
- **"Frames lost % `net_fakeloss`"**: the number is the share of voice frames lost. The game's own
  `net_fakeloss 5`, `10` and `15` lost about 22, 45 and 64% of frames on a listen server (README, finding 8).
  The game's name beside the box invites the game's number.
- **"Output volume `volume`: 0.5"**: 0.5 is this app's choice. The recordings were made at the owner's 0.15,
  and the game's own default is not recorded in this repository. The page presents 0.5 under the game's name
  with no word on whose default it is.
- **"Talk-spurt timing: Source timing"**: "Source" is also the engine's name. It means the timing of the
  file. The other choice, "TF2 re-timing (random)", is the flat rule that W3-02f retires.
- **Two controls are labelled "Codec"**: the profile (`sv_voicecodec`) and the on/off switch (`snd_codec`).
- **"Left (measured)"** for stereo capture: measured on one capture chain, a stereo virtual cable
  (finding 6); it has no effect on a mono file, which the page does not say.
- **"Auto-gain: On (measured)"**: read from the game's code and checked sample for sample since W3-05
  (W3-17d changes the label).
- **The room list** ("Open / Outdoor — dry (0)", "Hallway / Corridor (22)"): guessed places on the old room
  code, 13 dB too wet (W3-17c and W3-17d replace it).
- **The page's description for search engines** (`<meta name="description">`) promises "Source room DSP",
  which the page does not have until W3-17c, and W3-17d's list of texts does not include that line.
- **"Fullband Opus (48 kHz / 64 kbps, experimental)"** sits second in a list labelled `sv_voicecodec`; it is
  not a codec of the game (W3-11b adds "not the game's path" to its label).

### 6. The microphone: what the page says when it cannot have it

- **Before:** "Record" and "Live" have tooltips only ("Record from microphone (+voicerecord)"; "Live monitor:
  hear your microphone through the TF2 voice chain in real time, with the current settings (use
  headphones)"). A tooltip is not shown on a touch screen and "(use headphones)" is the one thing a
  first-time user must know before pressing.
- **Refused:** the live panel opens and its last line reads "Could not start the live monitor: Requested
  device not found" (no microphone) or "… : Not supported" (permission not given, in this browser), in small
  grey text (11.5 px, the colour of a hint), not marked as an error and not a status a screen reader
  announces (shot 6). Record puts "Microphone unavailable: Requested device not found" in the status line, in
  red. Neither says what to do: allow the microphone for this site in the browser's address bar, or plug one
  in. The text after the colon is the browser's own and differs between browsers.
- **During** (with Chromium's fake microphone): "Live. Settings changes apply as you make them. Rooms
  (dsp_room) are not applied live." with a row of "● TX · mode Hybrid · rate · net 0 lost · 0 late ·
  latency 241 ms" and two level bars. The bars are not announced in any way (no role, no value) and the row
  is `aria-live="off"`.
- **After stopping** the note still reads "Live. Settings changes apply as you make them."
- The live panel has its own "Record" button under the "Record" of step 1: two buttons of the same name that
  record different things.
- W3-11b rewrites the live mode's words about the gate, loss and push-to-talk; W3-17d the line about rooms.
  None of the points above is in either.

### 7. Keyboard and focus

- **The console's input keeps the Tab key.** With the developer console open, Tab completes a command and
  Shift+Tab does the same: the focus cannot leave the input by keyboard (measured: Tab, Shift+Tab and
  Escape-then-Tab all leave it there). A keyboard user who opens the console is held in it.
- After a render the focus is on nothing (finding 1).
- The order is sensible otherwise (file, Record, Live, the presets, the two main settings, the advanced
  switch, the download format, the views, the picture, the player, the batch, the console, the footer), and
  every control shows a 2 px focus ring except the console's input (`outline: none`) and the parts inside the
  browser's own player.
- Space plays and pauses, B switches between the render and the original, L loops, when the focus is not in
  a control. The number boxes step with the arrow keys (`voice_scale` 1.0 to 1.05). The page says so only in
  tooltips.
- The picture of the sound takes the focus and has a long spoken description of its keys, but nothing of
  what it shows.

### 8. The phone

- The loudness table is 552 px wide in a 310 px box: it scrolls sideways, but nothing shows that, and the
  columns from "True peak" on are cut off mid-word (shot 8).
- The codec's selected text is clipped ("Steam voice (Opus 24 kHz VBR, 3…": 298 px of text in 242 px), and
  at 320 px so are the room and the manual room.
- The two checkboxes of the live panel are 13 × 13 px. The settings' boxes are 36 to 37 px high and the file
  inputs 33 px, under the 44 px the stylesheet aims at for the buttons.
- Labels are 11 px, the console names beside them 10 px, the view buttons 10 px: small on any screen.
- No sideways scrolling of the page itself at any of the four widths.

### 9. Which version is this, and is it the newest?

- The service worker fetches code and markup from the network first, so a reload online gives the newest
  files, and falls back to its cache offline. Offline was checked: the page loads, and `steam`, `celt_22` and
  `speex` render and an MP3 downloads with the network off.
- Nothing on the page shows a version. A tab left open keeps running the page code it loaded, with no notice
  that a newer one is out; a visitor offline gets the cached copy with no sign of its age.
- A worker is started anew for each render and its scripts are fetched network-first, so a tab opened before
  an update renders with the **new** engine under the **old** page code. Today that is harmless. It stays so
  only while each order keeps the worker's messages usable by an older page, which nothing checks.
- On GitHub Pages the files are also held by the browser's own cache for some minutes; that was not
  simulated here.

### 10. What a screen reader is given

Read from the markup, not heard.

- The status line is a polite live region and gets "Processing 10.0s of audio in the background…" once and
  the result once: good. The progress bar has a name. The Process button's own text changes with every
  percent.
- The live panel's note (errors included) is not a live region.
- When the console is open its output becomes a polite live region, and the page's simulated game feed
  writes a line there every 0.6 to 3.8 s (kills, chat, joins): a screen reader would read it without end.
- Text contrast is good for body text. Under 4.5 to 1: the footer (3.06, at 11 px), the console's hint
  (4.2), the live panel's "○ push-to-talk" (4.07). Disabled buttons are at 2.2, which is usual for disabled.
- There is one theme, dark. Reduced motion stops the record button's pulse and the buttons' transitions;
  nothing else on the page moves by itself except the console's feed.

### 11. Memory

Peak over the idle page: about 60 to 100 MB for 10 s, 150 to 200 MB for a minute, 570 to 670 MB for
5 minutes, 1.1 GB for 9.8 minutes (the longest the page takes). A 30-minute file at 48 kHz is refused by its
size (164.8 MB against a limit of 100 MB) before anything is read. A 30-minute file at 16 kHz (57.6 MB) is
decoded whole (0.4 s, 214 MB) and then refused by its length. With both limits lifted for the measurement
only, the 30-minute file loads in 2.6 s (one main-thread task of 1.6 s, 1.4 GB) and renders in 120 s at a
peak of 3.4 GB. W2-03 (held) is the order for long files, and this is the number its report asks for.

### 12. Smaller things

- A file that is not audio: "Could not load audio: Unable to decode audio data", in red, at once. It does not
  say which kinds of file the page takes.
- The download is named `<file>_tf2_<codec>.wav`: 16-bit mono WAV at the source's rate, or 44.1 kHz if the
  source is lower (48 kHz here; W3-10 makes it the device's rate). FLAC and MP3 are one choice away and the
  choice is remembered. Two renders of one file with different settings get the same name.
- The render's useful facts ("voice gate … sent 3 talk spurts and held back 6 of 501 frames") are only in
  the console, between lines in the style of the engine's log ("ChangeLevel:", "Net_SendPacket: reliable
  stream ready."). The console's opening lines include "Parallel processing initialized", which is not so.
- The simulated game feed in the console draws on a list of player names that holds a few crude ones and the
  names of real community figures, to whom it gives chat lines and deaths. It is hidden until the console is
  opened. Whether it stays is the owner's call.
- Loading a 5-minute file holds the main thread for 0.33 s once (the original is mixed to mono and written
  as a WAV there, for the A/B).

## The controls, one by one

"Game's" follows W3-17d's rule: the control is a setting of the game or of Steam, and the name shown is one
the game has. "PC" is a property of one of the two computers. "Extra" is the app's own. "Changed by" names
the order in the queue that already changes the control; "W4-01" marks what is left for this audit's order.

| Control (its label) | Name shown | Whose | Default | Is the default the game's? | True today? | Would a plain reader follow it? | Help on the page | Changed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Codec | `sv_voicecodec` | game's (four values); "Fullband" is an extra | Steam voice | yes: what the game runs today | yes; the extra is not marked as one | no: every option is a string of codec terms, and the Speex line is 95 characters | none | W3-11b marks the extra; W3-17d classifies; W4-01: plain option names, help |
| Listener position | `dsp_room` | game's | Open / Outdoor — dry (0) | a real state of the game (Sound quality: Low) under a name that is not true | no: guessed places on the old room code | the names, yes | none | W3-17d (the whole list, the evidence line) |
| Stereo capture | `voice_capture_channel` (made up) | PC | Left (measured) | not a setting of the game | for one capture chain (finding 6) | no: does not say it only matters for a stereo file | none | W3-17d drops the name; W4-01: label and help |
| Mic gain | `voice_micgain` (made up) | extra | 1 | not the game's | yes | yes | none | W3-17d (extras); W4-01: help |
| Hi-pass Hz, 0 = off | `dsp_hpf` (made up) | extra | 0 | not the game's | yes | mostly | none | W3-17d (extras) |
| Lo-pass Hz, 20000 = off | `dsp_lpf` (made up) | extra | 20000 | not the game's | yes | mostly | none | W3-17d (extras) |
| Voice gate | `voice_vad` (made up) | extra (the gate is Steam's; the switch is not) | Auto (Steam: on) | on is what Steam does | yes | no: "Auto (Steam: on)" | none | W3-11b (words), W3-17d (extras) |
| Gate opens above dBFS | `voice_vad_threshold` (made up) | extra | −39.5 | no: Steam's is −40 by another measure | **no** | no | none | W3-11b (default, meaning, help) |
| Sender's Steam has been running (W3-16, not on main yet) | none | PC | about a week | a property of the sender's PC | by the order's evidence | yes, with its help sentence | one sentence | W3-16 |
| Codec (the switch) | `snd_codec` (made up) | extra | On | not the game's | yes | no: a second "Codec" | none | W3-17d (extras); W4-01: its label |
| Bitrate, 16 = stock | `snd_bits` (made up) | extra | 16 | not the game's | yes; Speex ignores it | no: sixteenths of the profile's bitrate | none | W3-17d (extras); W4-01: label, help |
| Packet ms | `net_split` (made up) | extra | 20 | not the game's | yes | no | none | W3-17d (extras); W4-01: help |
| Frames lost % | `net_fakeloss` | game's name, the app's number | 0 | yes at 0 | the label is true, the name misleads | the label, yes | none | W3-17d keeps the name; W4-01: help that says the number is not the game's |
| Jitter ms | `net_fakejitter` | game's | 0 | yes | fitted at one setting, scaled linearly | yes | none | W4-01: help |
| Auto-gain | `voice_agc` (made up) | extra | On (measured) | on is what the game does | "measured" is out of date | yes | none | W3-17d (label, extras) |
| Talk-spurt timing | `voice_retime` (made up) | extra | Source timing | the game re-times; the app does not yet | the flat rule is to be retired | no: "Source" reads as the engine | a tooltip | W3-02d and W3-02f replace it; W4-01: the words until then |
| Mean → peak normalize | `voice_avggain` | game's | 0.5 | yes | yes | no | none | W3-17d (label) |
| Max gain | `voice_maxgain` | game's | 10 | yes | yes | yes | none | W4-01: help |
| Voice scale | `voice_scale` | game's | 1 | yes | yes | no: it is not a plain volume (README: below 1 it lowers the voice more than its number and adds a tone) | none | W4-01: help |
| Manual dsp_room | `dsp_room` | game's | 0 | yes | old room code | no | none | W3-17d |
| Output volume | `volume` | game's | 0.5 | **no: the app's choice; the takes used 0.15** | the label is true | yes | none | W4-01: say whose default it is |
| Listener's sound device (W3-10, not on main yet) | none | PC | 48000 Hz | the usual device | by the order's evidence | yes, with its help | one sentence | W3-10 |
| Custom room: time, decay, mix | `dsp_custom_*` (made up) | extra | 1.5, 3.0, 25 | not the game's | an effect, not the game | yes | none | W3-17c rebuilds it, W3-17d (extras) |
| Download format | none | the app's | WAV | n/a | yes | yes | in the options | none needed |
| A/B: Wet / Dry | none | the app's | Wet | n/a | yes | no: "wet" and "dry" are studio words | a tooltip | W4-01 |
| Match loudness | none | the app's | off | n/a | yes | partly | a tooltip | W4-01 |
| Live: microphone, output | none | PC | the defaults | n/a | yes | yes | a tooltip on output | W3-17d classifies |
| Live: push-to-talk (hold V) | none | game's (`+voicerecord`) | off | the game sends while its key is held; the page starts with no key needed | yes | yes | a tooltip | W3-11b (the key's rule and its note) |
| Live: low latency (no pre-roll) | none | extra | off | not the game's | yes | no: "pre-roll" | a tooltip | W3-11b (what it does), W3-17d (extras) |
| The views: WAVE, BARS, SPEC, LOG, AVG, RES, dB, −, +, FIT, LUFS, LOOP, TALL | none | the app's | WAVE | n/a | yes | the short words need their tooltips | tooltips | W2-05 (long views, held) |

## Words

Read against the project's rule of plain words. Already listed above: the two specialist badges in the
header, "Wet" and "Dry", the made-up console names (W3-17d), "Source timing", the two "Codec"s, "16 = stock",
"int16 clip" in the chain strip and a badge, "Auto (Steam: on)", "pre-roll".

- **One thing, three names.** The button says "Process Audio", the step's heading says "Render & listen",
  the status says "Processing … in the background" and then "… render". The batch says "Render all".
- **The status after a render**, "Ready · Real Opus · 32 kbps · 1.1s render · 48,000 Hz", sits in step 1,
  two panels above the result, and tells a first-time user nothing about what to do next. "Real Opus" reads
  as a boast, not as something a reader can use.
- **Claims.** "Measured against real TF2 recordings" (a badge) and "Measured Steam voice path" (the Modern
  preset) hold for the `steam` profile. The description for search engines names "Source room DSP" (finding
  5). The room list's place names claim more than is known (W3-17d).
- **The console** speaks as the engine's log does. That is its joke, and it is closed by default; the page
  should not put facts a user needs only there (finding 12).

## Speed

### The page itself

| | First paint | Page usable (load event) |
| --- | ---: | ---: |
| First visit, nothing cached | 132 ms | 162 ms |
| Later visit, service worker in control (it still asks the network first) | 108 ms | 138 ms |
| Offline, from the service worker's cache | 120 ms | 135 ms |

Medians of five loads from a local server, so nearly all of it is the browser parsing and running the
scripts. Before the page is usable it loads 23 scripts, 595 KB (about 216 KB compressed, with the stylesheet
and the page), one after another in the page's order. The three codec modules (411 KB, 159 KB and 179 KB) and
the MP3 encoder (257 KB) are **not** among them: they load in the worker at the first render that needs
them, which is right. Scripts that a first render does not need and that could load later: `reference.js`
and `app/realtake.js` (69 KB: comparing with a real take), `video.js` (29 KB), `demo.js` (19 KB), `batch.js`
(23 KB), `live.js` (14 KB), `flac.js`, `formats.js` and `zip.js` (16 KB): 170 KB of 595. The page also loads
the engine (`audio.js`, `steam-sender.js`, the resampler: 169 KB) on the main thread, where it is used only
to write WAV files and when a worker cannot run. On this machine the whole load is a sixth of a second, so
deferring scripts would save a visitor on a slow line some download time and nothing else; it is not in the
order.

The service worker's first install fetches 46 files (2.16 MB) in the background.

### From a file to sound

Milliseconds from pressing Process to a result that can be played, two runs (the second in brackets). "Load"
is from choosing the file to the Process button being ready.

| Clip | Load | `steam` (the default) | `steam_48` | `celt_22` | `celt_44` | `speex` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 s | 0.1 s | 1051 (1175) | 744 (1298) | 513 (688) | 460 (757) | 546 (946) |
| 60 s | 0.2 s | 4345 (4761) | 2981 (4035) | 2030 (2541) | 1623 (2261) | 2371 (2969) |
| 5 min | 0.6 s | 21145 (21469) | 14036 (17183) | 8798 (9815) | 7840 (9623) | 11425 (12505) |
| 9.8 min | 1.0 s | 36310 | | | | |
| 30 min (limits lifted) | 2.6 s | 119805 | | | | |

So the default preset renders at about 14 times real time, and the game's old codecs at 30 to 38 times.

**A changed setting** (`voice_scale` 1 to 0.5, then Process): 907 to 1165 ms for 10 s, 4170 to 4332 ms for
60 s, 19655 to 21613 ms for 5 minutes. That is a full render: nothing of the first is reused, though
everything up to and including the codec is the same.

**Responsiveness.** The render runs in a worker. Main-thread tasks over 50 ms during a render: none for 10 s
and 60 s, one to three of 58 to 100 ms for the longer clips (the result arriving and the picture being
drawn). Progress is shown as a bar and a percent on the button, 23 steps for 10 s and 462 for 5 minutes, with
the stops of finding 3.

**Memory** is in finding 11.

### Where the time goes, default preset

A 60 s clip rendered on the page's main thread (the worker runs the same code), by the engine's own progress
marks, 3.6 s and then the meter:

| Share | Stage |
| ---: | --- |
| 21% | capture: the conversion from 48 to 24 kHz and the capture roll-off (a 255-tap filter) |
| 46% | the codec stage: Steam's sender, Opus encode and decode, **and the engine's yields** (below) |
| 20% | Steam's resampler, the gain, and laying the packets on the timeline |
| 13% | the output stage: the 3-tap filter, the conversion from 44.1 to 48 kHz, the limiter, the WAV |
| + 0.27 s | the loudness meter, which the worker runs before it sends the result |

And by function, under Chromium's sampling profiler (4.3 s with the meter; the profiled run was slower in the
capture stage, 1.33 s against 0.77 s, so the filter's share here is too high and the others' too low):

| Share | What |
| ---: | --- |
| 25% | Opus, encode and decode (WebAssembly) |
| 24% | the capture roll-off (`applyFirZeroPhase`) |
| 12% | the app's sinc resamplers (48 to 24 kHz at the start, 44.1 to 48 kHz at the end) |
| 9.5% | Steam's resampler (`swresample.js`), nearly all in its fused multiply-add |
| 9% | **waiting**: the engine yields with `setTimeout(0)` after every 32 frames, and a browser makes each such wait at least 4 ms once they nest |
| 6% | the loudness meter |
| 3% | laying the packets on the timeline, with the gain |
| the rest | the limiter, the WAV, clips, garbage collection |

Against W3-11a's breakdown in Node (Opus 27.5%, the filters 26%, Steam's resampler 19.4%, the 48 to 24 kHz
conversion 14.6%), with the waiting and the meter set aside as Node has neither: Opus 29%, the filters 29%,
the sinc resamplers 14.5%, Steam's resampler 11%. So Opus, the filters and the sinc conversion agree, and
Steam's resampler costs about half of what Node's figure says: the Node suites run the engine in a `vm`
context, which slows such arithmetic (PROGRESS, ideas). Timed alone in plain Node the resampler takes 2.3 s
for 300 s of sound, 11% of the 21 s render, and the capture filter 0.5 s a minute. The browser adds two
costs Node does not have: the waiting and the meter.

### Speed-ups that keep every sample

Each was held to the same test: the WAV's SHA-256 before and after, or the samples compared one by one.
"Measured" means a prototype was run; the prototypes were served to the browser in place of `audio.js` for
the measurement and are not in the repository.

| # | Change | Gain | How it was got | Risk to exactness | The test that proves it |
| --- | --- | --- | --- | --- | --- |
| 1 | **Keep the stages before a changed setting.** The worker keeps (A) the capture signal at the codec's rate and (B) the codec's result (for `steam`: the sender's messages and their decoded packets). A change after B (`voice_scale`, the two gain settings, the gain switch, `volume`, the room, the device's rate) starts from B; a change between A and B (the gate, its threshold, Steam's uptime, loss, jitter, the bitrate scale, packet length) starts from A | after B: 33% of the render is left, so 3 times faster (60 s: 1.2 s instead of 3.6 s); after A: 79% left | estimated from the measured stage marks above | none in the arithmetic: the same functions on the same inputs. The risk is a wrong key (a setting left out of it) | every golden case rendered through a warm cache (another case of the same source first) gives its recorded hash; a test that changes each setting in turn and compares with a fresh render |
| 2 | **The first seconds while the rest renders.** Render the first 15 s as a job of its own and hand it to the player; swap in the full render at the same position when it is done | time to first sound 1.2 s for any length, instead of 4.5 s (60 s), 21 s (5 min), 36 s (9.8 min) | measured: the 15 s render took 1.2 s and equals the full render's first 14.98 s sample for sample (`steam`), 14.997 s (`celt_22`), 14.998 s (`speex`) | the head is only equal where nothing later reaches back: not shown for `voice_retime`, loss or a room. The page plays only the part a test has shown equal, and plays no preview where none was shown | the preview's samples equal the full render's over the played span, for each profile and for each option the preview is allowed with |
| 3 | **No waiting in the worker.** In a worker the yields serve nothing: progress is posted, and Cancel ends the worker | 10.5% (60 s: 4187 to 3745 ms) | measured in the page; WAV identical | none: no arithmetic changes | golden hashes; the browser suite's cancel check |
| 4 | **Keep the worker.** A new worker is made for each render and loads nine scripts and the codec again | 0.1 to 0.15 s a render (a 0.1 s clip: 150 to 200 ms in a new worker, 46 to 79 ms in a kept one): 10% of a 10 s clip | measured | none; needed for 1 in any case. Cancel ends the worker and the next render starts a new one | the browser suite: two renders, one worker; cancel, then a render |
| 5 | **Send the result, then measure.** The meter runs before the result is posted | 0.27 s per minute of sound sooner (6%) | measured (the meter's time) | none | the meter's numbers unchanged (`Object.is`) |
| 6 | **Steam's resampler loop in WebAssembly**, the same arithmetic (the product exact in a double, one sum, the tie test, the error's side), two lanes at a time | 2.2 times on that stage (300 s of sound: 2.3 s to 1.05 s), about 6% of a render | measured in Node: 15 streams (noise, quiet noise, a full-scale square, steps, speech-like; packets of 480 to 3840 samples) equal to the shipped port sample for sample | a compiler that reorders or fuses floating point would break it: the build needs contraction off and no fast-math, and the module is one more pinned file with its hash | `tests/swresample.verify.mjs` as it stands (the port's recorded hashes), run on both loops; the module's hash recorded as the codecs' are |
| 7 | **The capture filter with several outputs side by side** (each output's own sum in its own order; eight sums advance together) | 1.7 to 2.1 times on that stage in Node (515 ms to 244 to 301 ms a minute), 3% of a render in the page (4187 to 4074 ms) | measured; WAV identical | none if each sum keeps its order; a test must show it | golden hashes; samples equal on random input |
| 8 | The same for the sinc resampler | none: slower in the page (4187 to 4627 ms) as written | measured | | not worth it in JavaScript |
| 9 | **Several workers.** The capture stage can be cut into stretches (each output needs only its own window of input). In the `steam` render each talk spurt has its own encoder and decoder and the loss mask is drawn beforehand by frame number, so the codec stage can run spurt by spurt. Steam's resampler and the gain carry state across spurts and cannot | on 4 cores, up to about 35% of a speech render (the test clip: 18 spurts, the longest 16% of the frames); nothing for music, which is one spurt | estimated; not built | the stretches' edges and the order the results are put together | golden hashes with the stage run in 1, 2 and 4 parts |
| 10 | Fewer copies of the sound (the page copies the source for the worker; the engine copies it again at each stage) | memory more than time: about 9 copies of the source at the peak | not measured apart from the peaks in finding 11 | none | W2-03's ground |

A faster exact multiply-add in JavaScript itself was tried first: writing it into the loop without a call
gives 1.3 times (2.4 s to 1.85 s per 300 s), and its tests cannot be made cheaper (the tie test is already
four operations). The WebAssembly loop is the better of the two.

Taken together 3, 4 and 5 are about a quarter off every render for no risk; 1 and 2 change what waiting
feels like; 6, 7 and 9 are worth less than their upkeep until the first five are in.

## What the queue already covers

| Order | What it changes on the page | So this audit's order leaves it alone |
| --- | --- | --- |
| W3-16 (in review) | the choice "Sender's Steam has been running" beside the gate's threshold, with one sentence of help | the choice itself |
| W3-11b | the threshold's default, meaning and help; "concealed" for "lost"; the Gate cell of the chain strip; the push-to-talk note; "not the game's path" on Fullband Opus; README | finding 5's first point; the live mode's words about the gate and the key |
| W3-10 | the choice "Listener's sound device"; playback and download at the device's rate; the limiter gone | the download's rate; anything about 44.1 kHz |
| W3-17c | the rooms in the render; the custom room rebuilt | the rooms' sound |
| W3-17d | the place list, the evidence line under it, "under water" as a checkbox, the extras group, which names are shown, "On (the game's rule)", "Gain target", old share links, README's room text | the room controls; where each setting sits; which names are shown |
| W3-02d, W3-02f | talk-spurt timing replaced by the game's timeline | the control itself (its words until then are in this order) |
| W2-03 (held) | sources past 10 minutes, the limits and their messages, the memory report | long files, the refusal messages for length |
| W2-05 (held) | the views for long files | the views |

Not covered by any of them, and so in `docs/work-orders/W4-01-page.md`: findings 1 to 4, the parts of 5 the
table marks "W4-01", 6 to 10, and the speed-ups 1 to 5.

## What was not looked at

- The live mode with a real microphone and real headphones: its latency as heard, feedback, the device
  lists with real names, a real denial's message in each browser.
- Real phones: touch on the picture of the sound, the file chooser, the on-screen keyboard over the number
  boxes, whether the player's own controls are usable at that size.
- A screen reader's actual speech; Firefox and Safari; a slow network; GitHub Pages' own caching across a
  real update.
- Video sources, demos and the batch were opened but not walked as journeys.
