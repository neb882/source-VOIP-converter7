# W4-01a with W4-01c: the page's journey, and keyboard, microphone, phone and screen reader

The builder's report. The order is `docs/work-orders/W4-01-page.md`, parts a ("W4-01a: the journey and the defaults")
and c ("W4-01c: keyboard, the microphone's refusal, the phone, the screen reader"), with its Decisions and the owner's
answers of 2026-11-10, and the brief's amendments of the plan review (2026-11-11), which win where they differ. Branch
`claude/w4-01ac-page`, from `8157a32` (main, cache v33); one branch, part a's commit first, then part c's.

**Status:** built; every check the order names passes, each shown to fail when the code it covers is broken (see
"Breaks"). No sample of any render changes: no audio file, no golden hash, no Node suite and no constant is touched.

## Summary

- **Part a, the journey.** A chosen, dropped or recorded file and a demo's speaker render by themselves; the first
  render of a source brings the player into view with the focus, and nothing plays by itself. A changed setting
  renders by itself 400 ms after the last change for a source of a minute or less (a render for older settings is
  stopped first; three quick changes are one render); a longer source keeps its render, marked as made with the
  earlier settings, until Render again. A re-render keeps the place, playing and what is heard. "Render" for
  "Process Audio"; the render's facts under the player, the codec in the codec menu's own words; "Hear (B): TF2
  voice | Original | Real take" for "A/B: Wet"; TF2 and ORIGINAL in the views and the table. Presets lit by
  matching, with a line of what differs and Reset; every key of `CONFIG_FIELDS` in one of two lists. Settings and
  the advanced panel remembered; a link wins. Three badges, the meta description, the version in the footer and a
  notice when a newer version takes over.
- **Part c.** The console lets Tab go; a refused or missing microphone says what to do, for Live and Record; the
  live note is a status in the error style for an error and reads "Stopped."; "Record this session"; the console's
  answers to a hidden status, its output never read out; the phone's table box, ellipses, 44 px controls and 20 px
  checkboxes; 12 px labels, 11 px names and view buttons, contrast at 4.5 or more; the picture described by its
  legend, the live bars as meters, the advanced switch's `aria-controls`.
- **Fixes after CI:** a cancelled render was started again 400 ms later by the settings check that follows each
  render, and that render held the microphone button during the recording made next; CI's browser suite failed on
  the recording's length. Fixed, with two checks. Then CI showed that my rewrite of [Browser 3i] (a file dropped
  during a render) raced: the drop's file was handed to the page after the long render had begun, and a render of
  the step before could still be running; the check now waits for no render, has the file ready before, and asks
  that the long render be stopped (not only its result dropped).
- **The browser suite:** 299 checks on main (`8157a32`), 338 after part a, 361 after part c, **363** at the head.
  Every check the order names, and each new one, was shown to fail with the code it covers broken (66 breaks,
  "Breaks"; one, A21, guards a browser behaviour Chromium did not show, and D3 was absorbed by a second path).

## Commits

| Commit | What |
| --- | --- |
| `4a7683d` | W4-01a: `index.html`, `style.css`, `app/core.js`, `app/console.js`, `app/source.js`, `app/render.js`, `app/meter.js`, `app/visualizer.js` (labels), `app/boot.js`, `batch.js` (the shared key), `sw.js` v34, `README.md`, `tests/browser.verify.js` |
| `ad13b3e` | W4-01c: `index.html`, `style.css`, `app/console.js`, `app/source.js`, `app/render.js` (the console's `aria-live` line), `live.js`, `README.md`, `tests/browser.verify.js` |
| `47904d9` | the fix after CI: `app/render.js`, `app/core.js`, `tests/browser.verify.js` |
| `8dd8253` | [Browser 3i]: the dropped file made before the long one is chosen; a minute of sound (`tests/browser.verify.js`) |
| `5bae5d4` | [Browser 3i]: waits for no render first, and asks for the stopped render's line (`tests/browser.verify.js`) |
| (this report) | `docs/reports/W4-01ac-page.md` |


## W4-01a: the journey and the defaults

### What was built, item by item

1. **A source renders by itself.** `mountSource` (`app/source.js`) ends with `renderNewSource()`: a file, a
   microphone recording and a dropped file render as if Render had been pressed. A demo mounts with `render: false`
   and renders once its packets are in place (`loadDemoFile`); a recorded live session mounts with `render: false`
   too: it arrives with its render. The batch is unchanged.
2. **The result comes into view.** Step 3 is now: the buttons and the progress bar, the player (with Hear and Match
   loudness beside it), the render's status line, then the views and the loudness table. The first render of a
   source scrolls step 3's heading to the top of the screen when the player is not wholly in view (`scrollIntoView`,
   `behavior: 'auto'` under reduced motion) and gives the player the focus; a render started with the button gives
   it the focus too. Nothing plays by itself. See "Departures", 1, for which renders do this.
3. **A changed setting.** `settingsKey()` moved from `batch.js` to `app/render.js` (the batch uses it; a demo's
   codec replaces the codec control's). The page keeps the key of the render on screen (`state.renderedKey`) and of
   the one running (`state.renderingKey`). On each change (`tf2:settings`) and after each render,
   `reconcileRender()`: with the controls on another key and a source of at most `AUTO_RENDER_SECONDS` (60, in
   `app/core.js`), a render starts 400 ms after the last change, a render running for older settings cancelled
   first (`startRender` queues itself behind the cancel); a longer source starts nothing, and `updateStale()` marks
   the result: the status line reads "These settings are not rendered yet. What you see and hear was made with the
   earlier ones.", the button "Render again", the download "Download WAV (earlier settings)" (the download still
   works), and the views, the legend and the table carry `stale` (dimmed). Back on the rendered key the marks go and
   nothing starts; a render running for other settings is then stopped. The settings panel is no longer `inert`
   during a render, so a change can be made while one runs.
4. **A re-render keeps the place.** `presentRender` keeps, for a render of the same source, the player's position
   (clamped), whether it played, and which version is heard (a real take is chosen again once it is lined up
   anew); the original's twin is not reloaded when it already holds the original.
5. **One word, and a status line where the result is.** "Process Audio" is "Render", "Rendering… 37%" while it
   runs, "Rendering 10.0 s…" in the status line. The new line (`#render-status`, `role="status"`) under the player:
   "Rendered in 1.1 s · 10.0 s of sound at 48,000 Hz · Steam voice (Opus, 32 kbps) · 0.12 s not sent (too quiet
   for the gate)", the last part only when `gatedFrames` is over 0. The codec is the codec menu's chosen option text
   (amendment 2): "vaudio_miles: not in TF2 (VR12)", "Fullband Opus: not in the game"; a demo's codec as the demo
   carries it ("Steam voice, as the demo carries it"); "the codec skipped" with the codec off. A recorded live
   session: "Recorded live · 3.0 s of sound at 48,000 Hz · …". Errors and a cancel go there too. Step 1's line names
   the source and is no longer written by a render. The console keeps its lines.
6. **Hearing the original.** "A/B: Wet" is a labelled pair beside the player, "Hear (B): TF2 voice | Original", with
   "| Real take" while a take is loaded: three buttons with `aria-pressed`, the same three states, the same instant
   mute swap at the same position, B cycling them (on the focused player too). A visually hidden live element
   (`#ab-now`, which `els.abToggle` now names, so `app/realtake.js` works unchanged) tells a screen reader which
   version plays. Match loudness keeps its name and shows its tooltip's sentence as small text; its "Matched: …"
   reads "TF2 voice" / "original". The views' labels and the table's rows say TF2 and ORIGINAL (a mapping,
   `versionName`, in `app/meter.js`, used by the visualizer's labels; the internal labels stay WET, DRY, REAL).
   The `title`s that said "dry/wet" (`#live-record`'s) are reworded (amendment 7).
7. **Presets.** `DEFAULT_CONFIG` (`app/console.js`) records each control's value as the markup gives it (its
   `defaultValue`, `defaultChecked`, `defaultSelected`, the first option of the rooms' selects), before anything is
   applied. Two lists in `app/core.js` by the keys of `CONFIG_FIELDS`: `PRESET_SET_FIELDS` (29 keys, the rooms'
   included) and `KEPT_ACROSS_PRESETS` (`uptime`, `dev`, `chan`; amendment 3). `PRESET_KEYS` maps the presets'
   option names (`position`, `underwater`, `voice_scale`, `jitter`, …) to the share link's keys, without renaming
   them. A preset is lit when every preset-set field equals the preset's value, or the default where it names none
   (the gate threshold: the codec's own); "Under water" (once `sewers`) lights by matching like any other. A click
   sets every preset-set field (`applyConfig(presetConfig(name))`, after the console commands it ran before, which
   still log); it no longer sets the capture channel. The line under the presets, shown whenever any control
   differs from the defaults: "Modern, changed: Voice scale 0.5 · Reset", naming the preset last lit, then the PC's
   settings after "also" ("Modern, also Listener's sound device 44100 Hz · Reset"); a lit preset that is not the
   default reads "Laggy, as the preset sets it · Reset". Reset sets every control to its markup default.
8. **Settings remembered.** Every change writes `collectConfig()` to `tf2ve_settings` through `LS` (amendment 4),
   once boot has applied what was remembered. Boot: the markup's defaults (so a browser's restoring of form values
   does not count), then the remembered settings, then a share link's, which win. Storage that throws or holds
   anything but an object leaves the defaults. Whether the advanced controls were open is remembered
   (`tf2ve_advanced`).
9. **The first screen.** The file control's button has the primary style, with "or drop a file anywhere on the page"
   beside it (and tied to it with `aria-describedby`); Live has Record's plain style. The five badges are three:
   "Measured against recordings of the game", "Video in, video out (MP4, MOV)", "Nothing is uploaded: it runs in
   your browser". The meta description keeps the rooms in README's words (amendment 5): "… real Opus, and the game's
   receiver auto-gain and clipping, measured against recordings of the game. Rooms are off by default; they follow
   the game's own code, and two of them match recordings in echo times and level. …" The chain strip's "int16 clip"
   is "16-bit clip" (the order's check forbids "int16" in the page's visible text).
10. **Which version.** The footer starts "version N · ", N the highest `tf2ve-vN` of `caches.keys()` once the
    service worker is ready (nothing without one). A `controllerchange` on a page that already had a controller
    shows "A newer version of this page is ready. Reload to use it; a loaded file and its render are not kept across
    a reload." above step 1; the first visit's takeover updates the footer instead. The page never reloads itself.

`sw.js`: v34. README: the journey, the presets and what is remembered, Hear, the version line, the suite's list.

### Checks (the order's, in `tests/browser.verify.js`, `[Browser 8]` and `[Browser 8b]`)

| The order's check | Check(s) in the suite | Result |
| --- | --- | --- |
| a chosen file, no further action: download enabled, `renderId` 1, the player wholly on screen at 1280 × 720 and 390 × 664, focused, paused | "1280 × 720: a chosen file renders by itself; step 3's heading comes to the top, the player is wholly in view, has the focus and does not play", and the same at 390 × 664 | pass: player 86–126 of 720 px; 142–178 of 664 px |
| (Decision 2) Space plays; a render started with the button focuses the player | "Space on the focused player plays it, and Space again pauses it"; "after a render started with the button, the player has the focus" | pass |
| a 10 s source, `voice_scale` 0.5 by its control: a second render with no press, its WAV different | "a 10 s source: voice_scale set to 0.5 by its control renders again with no press, and the WAV differs" | pass |
| three changes within 300 ms: one render | "three changes within 300 ms give one render, of the last" | pass: 12 ms apart, 1 render started |
| the player at 4 s and playing, a changed setting: within 0.15 s, still playing; "Original" kept | "a re-render while playing goes on playing from where playback had got to"; "with "Original" chosen before the re-render, "Original" is chosen after" | pass: at 5.430 s, on from 5.430 s |
| a 61 s source and a changed setting: no render within 2 s; the three texts and `stale`; set back: gone, `renderId` unchanged; "Render again" renders and removes them | "a 61 s source and a changed setting: no render starts within 2 s"; "the status line, "Render again" and "(earlier settings)" say so, and the views and the table are marked stale"; "the value set back removes the marks, with no render"; "a press on "Render again" renders and removes the marks" | pass |
| (item 5) "Rendering… N%", "Rendering 10.0 s…" | "while it renders the button reads "Rendering… N%" and the line "Rendering 61.0 s…"" | pass |
| presets: Modern lit and the line hidden on a fresh page; `voice_scale 0.5`: none lit, "Voice scale" and "0.5"; Laggy's commands one by one light Laggy; Reset lights Modern, every value its default; 44100 Hz: Modern lit, the device after "also"; every key in exactly one list | "at the defaults Modern is lit and the line under the presets is hidden"; "voice_scale 0.5 from the console: no preset is lit, and the line names Voice scale and 0.5"; "Laggy's loss alone lights nothing"; "the console commands that set Laggy's values one by one light Laggy, with no click"; "a change after that names the preset last lit and what differs from it"; ""Reset" lights Modern and every CONFIG_FIELDS value equals its default"; "with the sound device at 44100 Hz Modern is still lit, and the line names the device after "also""; "the line gives the preset-set changes, then the PC's after "also""; "every key of CONFIG_FIELDS is in exactly one of the two lists" | pass |
| (amendment 3) the room's keys set by a preset; the `underwater` preset lit by matching; presets' option names mapped | "a preset click sets the manual room number and the custom room's knobs back too"; "under water and a mic gain of 2 light "Under water", with no click"; "every field a built-in preset names maps to a preset-set key" | pass |
| remembered: a change survives a reload; a link wins; `setItem` throwing and `"x"` stored: the defaults, no page error | "a changed setting survives a reload, as does the open advanced panel, and the line says what is not the default"; "a share link's value wins over the remembered one"; "with tf2ve_settings holding "x" the page boots on its defaults"; "with localStorage.setItem throwing, the page boots on its defaults"; "the journey has no page errors" | pass |
| words: no visible "Process Audio", "Wet", "Dry", "int16"; the status line holds "Rendered in" and the WAV header's rate | "no visible text says "Process Audio", "Wet", "Dry" or "int16" (every panel open)"; "the render's status line says "Rendered in" and the rate the WAV's header has"; "with frames the gate held, the line ends with the time not sent"; "with no frames held by the gate, the line says nothing of it" | pass |
| (amendment 2) the line names `miles` with "not in TF2"; a demo's codec | "the render's status line names vaudio_miles, not in TF2" ([Browser 3c2b]); "the render's status line names the codec the demo carries" ([Browser 3h]); speex's and the live takes' lines name the menu's words | pass |
| version: the footer's number is `sw.js`'s; a newer `sw.js` served by a route and `registration.update()`: the notice, the `window` marker kept | "the footer shows the service worker's cache number, and no notice"; "a newer sw.js taking over shows the notice above step 1, and the page is not reloaded under it" | pass (see "Departures", 3, for the route) |
| (fix after CI) | "and the cancelled render does not start again by itself"; "a render that a changed setting starts during a microphone recording leaves its stop usable" | pass |
| `pnpm test:all`; CI; cache up | see "Runs" | |


### Older checks rewritten to the journey

A chosen file now renders by itself, so every check that chose a file and pressed Process waits for that render
instead (`chooseFile`, `waitRendered`), and a press of Render is `renderNow` (it waits for no render to be running,
then for the new one). Nothing they checked was dropped:

- the status line checks of W3-06, W3-12b and W3-20b (speex, miles, the live takes) read the render's status line,
  now in the codec menu's words; "Ready" checks read "Rendered in"; the W3-20b "(not in TF2)" status no longer shows
  anywhere (amendment 2), and the check that the line names miles with "not in TF2" replaces it;
- [Browser 3i] (a source during a render): the dropped file's render replaces the long one's, which is never shown;
- the video check: the video download is offered once the file has rendered by itself;
- the demo: "Process plays it through TF2's receiver" is "rendered through TF2's receiver alone";
- the presets: "a built-in preset keeps the listener's sound device and the capture channel" (the capture channel was
  restored by a preset before; it is a PC's now, as the order says); "a hand-edited control clears the active
  preset" reads "with a hand-edited control matching no preset, none is lit";
- A/B: the B key, the real take and its removal check Hear's buttons and `state.abMode`; the meter's rows TF2 and
  ORIGINAL; "Matched: TF2 voice/original";
- W4-01d's settled words: none of its checks quotes a label this order renames; all are kept as they were.

The main page's checks share one browser storage, so the page reloaded for [Browser 4] forgets the settings the
earlier checks left (`localStorage.removeItem('tf2ve_settings')` before it).

## W4-01c: keyboard, the microphone's refusal, the phone, the screen reader

### What was built, item by item

1. **The console lets Tab go.** Tab completes only when the input holds a word with no space that some command
   starts with; otherwise the browser moves the focus on. Shift+Tab always moves it back. The input has the 2 px
   focus ring of the other controls (`#console-input:focus-visible`).
2. **The microphone refused.** `microphoneRefusal(error, button)` (`app/source.js`), by the error's name:
   `NotAllowedError` and `SecurityError` give "The browser did not let this page use the microphone. Allow it for
   this site (the icon in the address bar), then press Live again."; `NotFoundError` and `OverconstrainedError`
   give "No microphone was found. Plug one in, or choose it in the system's sound settings, then press Live
   again."; anything else the old text with the browser's message. Only an error of `getUserMedia` itself is
   taken this way (it is marked where it is thrown), so an output device or worklet error keeps its own message.
   Record ends "then press Record again" (the status line, already a status with the error style). In `live.js`
   (amendment 8: only the note, the refusal, and see below): the note is `role="status"`, an error there has the
   status line's error colour and size (`.live-note.error`), it reads "Stopped." when the monitor stops, and the
   panel's button is "Record this session".
3. **The console is not read out without end.** The output stays `aria-live="off"`, open or not (the toggle that
   made it polite is gone). `consoleAnswer()` runs a typed command and puts the lines it logged, but its own echo,
   joined, into a visually hidden `#console-status` (`role="status"`).
4. **The phone** (640 px and under): the loudness table is in a box of its own, `role="region"` with a label and
   `tabindex="0"`, its first column sticky and a fade at its right edge while there is more; a select's chosen text
   ends in an ellipsis (`text-overflow: ellipsis` on selects, at every width); checkboxes 20 px (at every width) in
   rows at least 44 px high; number boxes, selects and file controls at least 44 px high (Hear's buttons and Reset
   too).
5. **Sizes and contrast, at every width.** Labels, legends and the section labels 12 px; the variables' names
   beside them, the chain's letters and the view buttons and the resolution menu 11 px. The footer (#8f98a0, links
   #a9b6c2), the console's hints (#98a3ad; the typed completion #a3a3a3) and the live panel's idle state (#9aa4ae):
   5.0 to 8.4 to 1, computed as the audit did.
6. **What the picture and the meters say.** The picture has `aria-describedby="viz-legend"`. The two live bars are
   `role="meter"` named "Microphone peak" and "TF2 voice peak", `aria-valuemin` -60, `aria-valuemax` 0,
   `aria-valuenow` the peak in dBFS and `aria-valuetext` "-11.7 dBFS" (or "silence"), set at most twice a second
   (at once when the monitor stops). The advanced groups are wrapped in `#advanced-groups`, which the switch's
   `aria-controls` now names.

README: the console's Tab, what the page says without a microphone, "Record this session", the suite's list.

### Checks (the order's, `[Browser 9]`)

| The order's check | Check(s) in the suite | Result |
| --- | --- | --- |
| console: empty, Tab leaves; `voice_sc` and Tab completes to `voice_scale `, focus stays; Shift+Tab leaves in both cases | "console: with the input empty, Tab and Shift+Tab leave it"; "console: with "voice_sc" typed, Tab completes to "voice_scale " and the focus stays"; "console: Shift+Tab leaves it, a word typed or completed"; "console: its input shows the focus ring the other controls have" | pass |
| no permission, and no microphone: after Live the note has `role="status"`, the error style and "microphone" in a sentence that is not only the browser's; the same for Record; after a start and a stop with the fake microphone the note does not begin "Live." | "no microphone permission: after a press on Live the note, a status in the error style, says what to do about the microphone", "… after a press on Record the status line says the same, with "Record"", and the same two for "no microphone"; "the live note is a status, reads "Stopped." after a stop (not "Live."), and the panel's button is "Record this session"" | pass: each in a browser of its own (no permission: a fake device and no permission; no microphone: no device, permission granted) |
| console open: output `aria-live` off; after `voice_scale 0.5` the hidden status holds `"voice_scale" = "0.5"` | "with the console open its output is aria-live off, and a typed command's answer goes to a hidden status" | pass |
| 390 × 664, a render on screen, every panel open: selects; the table's box; the live checkboxes; 44 px controls; no sideways scroll, at 320 too | "390 px: no select's chosen text is wider than its box unless it ends in an ellipsis" (14 selects, 1 too long: it has the ellipsis); "390 px: the loudness table's box is a named region that takes the focus, scrolls, and its first column stays"; "390 px: both live checkboxes are at least 20 px, in label rows at least 44 px high"; "390 px: every number box, select and file control of the settings is at least 44 px high" (25); "390 px: the page does not scroll sideways"; "320 px: …" | pass |
| sizes; contrast of the three texts at least 4.5 | "1280 px: labels and legends at least 12 px, the console names beside them and the view buttons at least 11 px", and at 390 px; "the footer, the console's hints and the live panel's idle "○ push-to-talk" reach 4.5 to 1" (5.94, links 8.42, 7.16, 5.01, 7.53) | pass |
| the picture's `aria-describedby`; the live bars `role="meter"` with a numeric `aria-valuenow` while the fake microphone runs | "the picture of the sound is described by the legend under it"; "the live panel's two bars are meters with a name and a numeric value in dBFS while the fake microphone runs"; "the advanced switch's aria-controls names the element that holds the advanced groups, not the switch" | pass |
| `pnpm test:all`; CI; cache up | see "Runs" (v34, once for the branch) | |


## Runs

All on this machine (4 cores, other agents' jobs queued on the same lock), `CHROMIUM_EXECUTABLE` set to the installed
Chromium, each under `flock /tmp/tf2ve-heavy.lock`:

| Run | On | Result |
| --- | --- | --- |
| browser suite | main `8157a32` (a copy) | exit 0, **299 browser checks passed** |
| browser suite | `4a7683d` (part a) | exit 0, **338** (a first run stopped on a wait of my rewritten microphone check; fixed before the commit) |
| `pnpm test` | `4a7683d` | exit 0: `verify.js` 285, gain 103, Opus 149, Speex 86, VR12 31, miles 73, paired reference 43, formats 68, file rate 53, meter 50, video 46, demo 36, render-stream 553, output stage 103, voice channel 129, Steam sender 109, swresample 43, room 215 |
| `[Browser 9]` alone | the part c tree | exit 0, 23 checks |
| browser suite | `ad13b3e` (part c) | exit 0, **361** |
| browser suite | `47904d9` | exit 0, **363** |
| `pnpm test:all` | `8dd8253` | vendor check: the Opus runtime and the libopus 1.1.5, CELT 0.11, Speex 1.0.2 and VR12 builds match; `pnpm test` as above, every suite passing; the browser suite failed at [Browser 3i] ("2 render shown": a render of the step before still running), fixed in `5bae5d4` |
| browser suite | `5bae5d4` (the head's code) | exit 0, **363 browser checks passed** |

The commits after `8dd8253` change `tests/browser.verify.js` only, so the Node suites and the vendor check of that
run stand for the head.

CI (`tests`, GitHub): `4a7683d` passed (the verification step: success). `ad13b3e` failed: "PCM microphone capture
contains the synthetic input at the expected duration" (the cancelled render started again; fixed in `47904d9`).
`47904d9` and `8dd8253` failed at [Browser 3i] (the race; fixed in `8dd8253`, then `5bae5d4`). `15c0423` failed at
"no microphone permission: after a press on Live …" ("Could not start the live monitor: Not supported": CI's
headless shell, "Departures", 10); the refusal browsers run on the full Chromium since. `d7db8d8`, the last code
commit, passed (run 43105842401: the vendor check, every Node suite, 363 browser checks). The head's own run cannot be written into the commit it runs on: the hand-back gives it.

Scanned before the last push: `git diff origin/main...HEAD` and the commit messages hold no recording, no personal
detail, no SteamID but the test's universe-0 ones already in the suite, and no model name outside the commits'
trailers.


## Breaks

Each break is one edit to a copy of the committed tree (`git archive` of `4a7683d` for part a, `ad13b3e` for part c,
`47904d9` for the fix), served on its own; the functions holding the checks were run there with checks that log a
failure instead of stopping (a harness in the session's scratch folder, not in the repository), under the
heavy-job lock. "Timeout" means the step before the check waits for something the break prevents, so the suite
fails at that check's step.

| # | Break | Fails |
| --- | --- | --- |
| A1 | `mountSource` does not call `renderNewSource()` | timeout: the 61 s file never renders by itself (a short file still renders: its settings check after mounting starts one) |
| A2 | no `scrollIntoView` | "… step 3's heading comes to the top …" at 1280 and 390 |
| A3 | no `focus()` on the player | the same two, and "after a render started with the button, the player has the focus" |
| A4 | a button's render does not reveal | "after a render started with the button, the player has the focus" |
| A5 | no render scheduled after a change | timeout: "… renders again with no press" |
| A6 | a change renders at once (no 400 ms wait) | "three changes within 300 ms give one render" (2 started) |
| A7 | the place not kept (`keep = false`) | timeout: "… goes on playing from where playback had got to" |
| A8 | Hear reset to the TF2 voice on a re-render | "with "Original" chosen before …, "Original" is chosen after" |
| A9 | `AUTO_RENDER_SECONDS` 100 | "a 61 s source …: no render starts within 2 s" |
| A10 | no `stale` class | "the status line, "Render again" and "(earlier settings)" say so, and the views and the table are marked stale" |
| A11 | no "(earlier settings)" | the same |
| A12 | the preset lit is the last clicked, not the matching | "voice_scale 0.5 from the console: no preset is lit …", "Laggy's loss alone lights nothing", "… light Laggy, with no click", "… light "Under water" …" |
| A13 | a preset click does not set every preset-set field | "a preset click sets the manual room number and the custom room's knobs back too" (and the two "also" checks) |
| A14 | `chan` left out of the kept list | "every key of CONFIG_FIELDS is in exactly one of the two lists" |
| A15 | the line under the presets always hidden | timeout: Reset cannot be pressed, at the presets' first step |
| A16 | no "also" part | "… the line names the device after "also"", "the line gives the preset-set changes, then the PC's after "also"" |
| A17 | Reset leaves the PC's three | ""Reset" lights Modern and every CONFIG_FIELDS value equals its default" |
| A18 | settings not written | "a changed setting survives a reload …" |
| A19 | the link applied before the remembered settings | "a share link's value wins over the remembered one" |
| A20 | `localStorage.setItem` called directly | "the journey has no page errors" (the throwing storage's context) |
| A21 | boot does not apply the markup's defaults first | see "What is left open", 2 |
| A22 | "int16 clip" back in the chain strip | "no visible text says …" |
| A23 | the rate without its thousands comma | "the render's status line says "Rendered in" and the rate the WAV's header has" |
| A24 | no gate part | "with frames the gate held, the line ends with the time not sent" |
| A25 | the footer's line kept hidden | timeout: "the footer shows the service worker's cache number" |
| A26 | no notice on `controllerchange` | timeout: "a newer sw.js taking over shows the notice …" |
| A27 | a demo's codec by the codec control | "the render's status line names the codec the demo carries" |
| A28 | the codec by `displayName` up to its bracket (the order's first rule) | "the render's status line names vaudio_miles, not in TF2" |
| A29 | the table's rows WET and DRY again | "meter lists integrated loudness for the render (TF2) and the source (ORIGINAL)" |
| A30 | B ignored on the focused player | "and with the player focused, back to the TF2 voice" |
| A31 | Space handled by the page on the player too | "Space on the focused player plays it, and Space again pauses it" (it toggled twice) |
| A32 | "Real take" never shown | "Hear offers "Real take" once a take is loaded" |
| A33 | "Processing… N%" | timeout: "while it renders the button reads "Rendering… N%" …" |
| A34 | "Matched: wet" | "loudness matching lowers the louder version by the LUFS difference" |
| C1 | Tab always completes | "console: with the input empty, Tab and Shift+Tab leave it" |
| C2 | Shift+Tab completes too | "console: Shift+Tab leaves it …" (and the completion check) |
| C3 | no focus ring | "console: its input shows the focus ring …" |
| C4 | the output polite while open | "with the console open its output is aria-live off …" |
| C5 | the typed command not captured | timeout: the hidden status stays empty, the same check |
| C6 | no `aria-describedby` on the picture | "the picture of the sound is described by the legend under it" |
| C7 | `aria-controls` back to the box holding the switch | "the advanced switch's aria-controls names the element that holds the advanced groups …" |
| C8 | one bar without `role="meter"` | "the live panel's two bars are meters …" |
| C8b | `aria-valuenow` never set | the same |
| C9 | the note not changed on stop | "the live note is a status, reads "Stopped." …" |
| C10 | the panel's button "Record" | the same |
| C11 | no ellipsis on selects | "390 px: no select's chosen text is wider than its box unless it ends in an ellipsis" |
| C12 | the table's box without role, label, tabindex | "390 px: the loudness table's box is a named region …" |
| C13 | the first column not sticky | the same |
| C14 | the live checkboxes 13 px | "390 px: both live checkboxes are at least 20 px …" |
| C14b | their rows not 44 px | the same |
| C15 | no 44 px rule for number boxes, selects, file controls | "390 px: every number box, select and file control … at least 44 px high" |
| C16 | Hear 420 px wide | "390 px: the page does not scroll sideways", and at 320 |
| C17 | labels 11 px | "… labels and legends at least 12 px …" at 1280 and 390 |
| C17b | the variables' names 10 px | the same |
| C17c | the view buttons 10 px | the same |
| C18 | the footer #5d6873 (3.06) | "… reach 4.5 to 1" |
| C19 | the idle "○ push-to-talk" #6b7580 | the same |
| C19b | the console's hint #6f7a85 | the same |
| C20 | `NotAllowedError` not recognised | "no microphone permission: after a press on Live …", and Record |
| C21 | no error style on the note | "no microphone permission: after a press on Live …", "no microphone: after a press on Live …" |
| C22 | Record keeps the browser's message | "… after a press on Record the status line says the same …", both browsers |
| C23 | `NotFoundError` not recognised | "no microphone: after a press on Live …", and Record |
| D1 | a cancelled render scheduled again (the fix undone) | "and the cancelled render does not start again by itself" |
| D2 | a render disables the microphone button during a recording (the fix undone) | "a render that a changed setting starts during a microphone recording leaves its stop usable" |
| D3 | `mountSource` no longer stops the running render | nothing: `startRender`, which the new source calls, stops it too |
| D3b | neither stops it (the long render finishes and is dropped) | "a source dropped during a render stops that render, and renders as itself" |


## Departures from the order, and questions

1. **Which renders bring the player into view.** Item 2 says a render "the user did not start with the button" is
   scrolled into view and takes the focus. Read literally that includes every render a changed setting starts; it
   would pull the page to step 3 and the focus out of the settings at each change, and Decision 2 says "after a
   first render". So the first render of a source scrolls and focuses, a render started with the button focuses,
   and a re-render for a setting does neither (it keeps the place, item 4). The focus is never taken from a field
   being typed in or a select.
2. **The codec's name in the status line** is the codec menu's chosen option text (amendment 2), a demo's "Steam
   voice, as the demo carries it" (or `vaudio_celt`, `vaudio_celt_high`), "the codec skipped" with the codec off.
   The W3-20b status "Ready · Voxware VR12 (not in TF2) · …" no longer shows anywhere: step 1's line names the
   source.
3. **The version check's route** is a route of the test's own: a small server in the test forwards the page's files
   and serves the newer `sw.js` (cache number + 1) once asked. Playwright's `context.route` does not see the
   request a browser makes for a service worker's own script (tried: the notice never came).
4. **Space on the focused player** is the player's own control's: the page's key handler leaves Space to it there
   (handling it as well played and paused at once); B and L work on the player too.
5. **"int16 clip" in the chain strip** reads "16-bit clip": the order's words check forbids "int16" in the page's
   visible text, and the strip is visible on the first screen.
6. **The capture channel** is no longer set by a preset (the order's and amendment 3's rule); the old check
   "preset restores … left-channel capture" now checks that a preset keeps it.
7. **`live.js`** (amendment 8: "touch only the microphone-refusal and note lines"): besides those, the panel's
   button text in `setRecordButton` ("Record this session", which the order's item 2 asks for and which that
   function sets) and `setMeter` (the meters' values, item 6) changed. Nothing of the codecs or the room path.
8. **The settings panel is no longer `inert` during a render** (it was): the order's "a render already running for
   an older key is cancelled first" needs a change during a render. The batch still makes it inert.
9. **A cancelled render** is not started again by itself (the fix after CI): only other settings or the button
   start one.
10. **The refusal checks run on the full Chromium** (`channel: 'chromium'`, its new headless mode; the installed
    one where `CHROMIUM_EXECUTABLE` is set). Playwright's default headless shell, which CI runs, has no permission
    prompt: a page without the permission gets `NotSupportedError`, "Not supported" (what the audit saw), not
    `NotAllowedError`; the page then shows "Could not start the live monitor: Not supported", as the order's
    "anything else" says. The page goes by the order's names only; whether `NotSupportedError` should also read as
    a refusal is a question for the orchestrator (in a browser that cannot ask, "allow it in the address bar" may
    not help).
11. **The meta description** (amendment 5): "Make any audio or video sound like Team Fortress 2 voice chat: real
    Opus, and the game's receiver auto-gain and clipping, measured against recordings of the game. Rooms are off
    by default; they follow the game's own code, and two of them match recordings in echo times and level. Runs
    locally in your browser."

## What is left open

1. **`app/realtake.js`** is in neither part's files. Its status after a take is lined up still says "It plays as the
   third A/B version (B cycles wet, dry, real)." (lower case, so the order's case-sensitive check passes; "No element
   on the page says wet or dry" is not met there). A one-line change for whoever may touch that file. Hear's buttons
   follow it without a change there: `els.abToggle` now names the hidden `#ab-now`, whose text it sets.
2. **Break A21** (boot without the markup's defaults first) did not fail any check: Chromium did not restore the
   changed value into the control on that reload, so the step guards a browser behaviour this browser did not show.
   It is kept as a safeguard; no check covers it.
3. A short source renders by itself through two paths (the mount's own call and the settings check after mounting,
   400 ms later; the first one wins and clears the other); a long one through the first only. Break A1 shows the
   first through the 61 s source.
4. The live panel's meters' "in"/"out" labels stay 10 px (spans, not labels; the meters are named for a screen
   reader).
5. Firefox and Safari were not run (the order's "Open"): the refusal sentences go by the error's name.

