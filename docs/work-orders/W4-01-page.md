# W4-01: the page: a file to its sound without detours, settings that explain themselves, renders that reuse work

*Written 2026-11-10 from the audit `docs/reports/W4-01-page-audit.md` ("the audit" below; "finding n" is its
numbered finding, "speed-up n" a row of its table of speed-ups). The owner, on scope: "I agree that the pages
clarity, defaults, and speed are important too." The sound of a render is not changed by any part of this
order: every golden hash stays as it is.*

| Part | What | Files it touches | Starts after | Budget |
| --- | --- | --- | --- | --- |
| **W4-01a** | the journey: a file renders by itself, the result comes into view, a changed setting is rendered or marked, presets show what was changed, settings are remembered, the first screen, the version line | `index.html`, `style.css`, `app/`, `sw.js`, `README.md`, the browser suite | **W3-10 merged.** Beside W3-17c. **Before W3-17d** | 1.5 days |
| **W4-01c** | keyboard, the microphone's refusal, the phone, what a screen reader is given | `index.html`, `style.css`, `app/source.js`, `app/console.js`, `live.js`, the browser suite | W4-01a (same builder, same files). **Before W3-17d** | half a day |
| **W4-01d** | the settings' words: one sentence of help under every control, and the labels the audit found untrue or unclear | `index.html`, `style.css`, `app/console.js`, `README.md`, the browser suite | **W3-17d merged** (it rebuilds the panel these words sit in) | half a day |
| **W4-01b** | speed with the same samples: the worker kept and not made to wait, the result sent before the meter, the stages before a changed setting reused; then, if the owner wants it, the first seconds playable while the rest renders | `audio.js`, `audio-worker.js`, `app/render.js`, `app/core.js`, `sw.js`, tests | **W3-17c and W3-17d merged**, no other `audio.js` order open. **Before W3-02c** | 2 days (step 3: half a day more) |

**Kind:** code. `tf-builder` (effort high for a, c and d; xhigh for b), then `tf-reviewer`. Part b's diff also
gets a second reader on the stronger model: it decides which renders are computed afresh and which are not.
**Branches:** `claude/w4-01a-journey`, `claude/w4-01c-access`, `claude/w4-01d-words`, `claude/w4-01b-speed`,
each from `main`. **Worktrees:** given in the brief.

**Commands** (CLAUDE.md has them): `pnpm test` for the Node suites; the browser suite, one at a time on the
machine, as `flock /tmp/tf2ve-heavy.lock node tests/browser.verify.js` (with `CHROMIUM_EXECUTABLE` set where
the installed Chromium is not the one Playwright pins); `pnpm test:all` is what CI runs. A check below that
names a suite is run with that suite's command.

## Where the parts sit in the queue

The order of work is W3-16 (in review), W3-11b, W3-10, W3-17c, W3-17d, then the receiver's orders
(`docs/PROGRESS.json`). Four of those change the page, so:

- **W3-16, W3-11b and W3-10 go first, untouched.** They are the modern preset's own path, which is the
  owner's priority, and each adds or rewords a control (the Steam uptime; the gate's threshold and the live
  mode's words; the sound device's rate, with playback and download at that rate). Part a is written for the
  page as W3-10 leaves it.
- **Part a, then part c, are built while W3-17c is built.** W3-17c is `audio.js` and tests; these are the
  page. They share two lines with it: the script tags of `index.html` and the cache number in `sw.js`, each
  a one-line merge.
- **W3-17d then rebuilds the settings panel on a page that already has part a.** Two things of part a it
  must keep, and its brief should say so: every new control goes into `CONFIG_FIELDS`
  (`app/console.js`), as W3-16 and W3-10 already do, and into one of part a's two lists (set by a preset, or
  kept across presets); a renamed built-in preset keeps working with part a's rule for which preset is lit.
- **Part d waits for W3-17d**, because W3-17d decides where each control sits, which names are shown and
  what the room controls are; help text written before it would be written twice. If the orchestrator would
  sooner not open the panel a second time, part d's list can be given to W3-17d's builder in its brief
  instead: it is a list of sentences and labels, with one check.
- **Part b takes the `audio.js` slot between W3-17c and W3-02c.** W3-17c is the last order before the
  receiver's that reshapes `process()`, and the two places part b keeps results at lie before anything the
  receiver's orders touch. It shares `app/render.js` with W3-17d (other functions of it), so it follows
  W3-17d unless the orchestrator accepts that merge.
- **W3-02d and W3-02f**, which come later and replace talk-spurt timing, give their new controls a sentence
  of help in part d's form and add them to part a's lists.

## Why

From the audit, in the order of what it costs a user:

1. A chosen file does nothing by itself: the result is a press on "Process Audio", a scroll and a press on
   play away, under the fold on a laptop and two screens down on a phone (finding 1).
2. A changed setting leaves the old result on the page under a green "Ready", downloadable, with nothing
   saying it was made with other settings; hearing the change costs the whole render again and the place in
   the clip (finding 2).
3. A re-render with one receiver setting changed takes as long as the first render (4.2 s for a minute of
   sound, 20 s for five), though two thirds of the work is the same; every render waits a tenth of its time
   in timers and starts a new worker (the audit's speed section).
4. The page cannot say "Modern, with these changes", lights a preset because it was clicked and not because
   the controls match it, and forgets every setting on reload (finding 4).
5. 22 of 23 settings have no explanation, and a handful of labels are untrue or opaque (finding 5).
6. A keyboard user is held in the console's input; a refused microphone gets the browser's raw message in
   small grey text (findings 6 and 7).

## Decisions of this order (the owner can overrule any; nothing waits for an answer)

1. **A render starts by itself**: when a file, a recording or a demo's speaker becomes the source, and when
   a setting changes while a source of at most `AUTO_RENDER_SECONDS` is loaded. The constant is 60 (a
   minute renders in about 4 s today). Above it a changed setting marks the result and waits for the button.
2. **Nothing plays by itself.** After a first render the player is in view and has the focus, and Space
   plays. A re-render while the clip is playing goes on playing from the same place. [A voice at full level
   that starts on its own is unwelcome, and browsers refuse it when the wait was long.]
3. **Settings are remembered between visits** (in the browser's own storage, nowhere else), and the page
   always shows what differs from the defaults, with one press to return. A share link's settings win over
   remembered ones.
4. **`volume` stays 0.5.** Part d says under the control whose choice that is. Moving it is the owner's:
   the takes behind the model were made at 0.15.
5. **The order of the page's steps stays** (source, sound, render, batch). The audit's trouble with the
   first screen is met by the result coming into view, not by moving the panels.
6. **Part b's step 3 (the first seconds) is built only if the owner's clips are often longer than a
   minute.** Until the owner says so it is not started.

## The owner's answers (2026-11-10): these overrule Decisions 4 and 6

- **The owner's clips are usually music, and often longer than a minute.** So part b's step 3 (the first
  seconds playable while the rest renders) **is built**, as part of W4-01b. Parallel workers stay out: music is
  one spurt, so they gain nothing.
- **`volume` defaults to 1.0, the game's own default, with a label that says so.** The owner: "1.0 with the
  label". The change of the default itself is made by **W3-10**, which re-records every golden hash anyway
  (its amendment says so); this order's part d writes the words: "The game's volume setting; it sets the
  loudest the file can get. 1.0 is the game's default. The recordings behind the model were made at 0.15."
  Wherever this order says "0.5 is this page's choice", read the sentence above.
- **The developer console's simulated chat feed keeps its name list** as it is. The owner: "Keep it". Part c
  still stops the feed being read out by a screen reader.

## W4-01a: the journey and the defaults

### What to build

1. **A source renders by itself.** When `mountSource` has a new source (a file, a microphone recording, a
   demo's speaker; not a recorded live session, which arrives with its render), the render starts as if the
   button had been pressed. One file dropped on the page, or one chosen, is all a user does. The batch is
   unchanged.
2. **The result comes into view.** Inside step 3 the order becomes: the buttons, the progress bar, **the
   player**, a line of status for the render (item 5), then the views and the loudness table. When a render
   that the user did not start with the button finishes, step 3's heading is scrolled to the top of the
   screen if the player is not wholly in view (`scrollIntoView`, with `behavior: 'auto'` under reduced
   motion), and the player takes the focus. After a render started with the button the focus goes to the
   player too (today it falls to the page: the button was disabled while it had the focus).
3. **A changed setting.** The page keeps the key of the settings the render on screen was made with: the
   batch's own key, `JSON.stringify(renderOptions())`, with the demo's codec where a demo is the source
   (move `settingsKey` from `batch.js` to `app/render.js` and use the one function in both). When the
   controls' key differs from it:
   - **a source of at most `AUTO_RENDER_SECONDS` (a constant in `app/core.js`, 60):** a render starts 400 ms
     after the last change; a render already running for an older key is cancelled first;
   - **a longer source:** nothing starts. The page says so in three places: the render's status line reads
     "These settings are not rendered yet. What you see and hear was made with the earlier ones."; the
     button reads "Render again"; the download button's label ends "(earlier settings)". The views and the
     table carry a `stale` class (dimmed). The download still works: the user may want that file;
   - when the controls return to the rendered key (a value typed back), the marks go and no render starts.
4. **A re-render keeps the place.** When a render replaces a render of the same source: the player's
   position is kept (clamped to the new length), it goes on playing if it was playing, and the choice
   between the render, the original and a real take is kept (today all three are reset). The zoom and the
   selection are kept already.
5. **One word for it, and its status where the result is.** "Process Audio" becomes "Render", "Processing…
   37%" becomes "Rendering… 37%", and the status texts follow ("Rendering 10.0 s…"). A new line under the
   player, `role="status"`, carries the render's facts in plain words: "Rendered in 1.1 s · 10.0 s of sound
   at 48,000 Hz · Steam voice · 0.12 s not sent (too quiet for the gate)", the last part only when the
   render's `gatedFrames` is over 0, with the codec's name from the profile's `displayName` up to its
   bracket. Step 1's status line goes back to naming the source. The console keeps its lines as they are.
6. **Hearing the original.** The button "A/B: Wet" becomes a labelled pair, "Hear: TF2 voice | Original"
   (and "| Real take" when one is loaded): the same three states, the same instant switch at the same
   position, the B key as now, with "(B)" in the label. It moves beside the player. "Match loudness" keeps
   its name and gets its tooltip's first sentence as visible small text. No element on the page says "wet"
   or "dry" (the views' labels "WET" and "DRY" and the table's rows become "TF2" and "ORIGINAL").
7. **Presets say what is selected and what was changed.**
   - The page records each control's value as the markup gives it, before a share link or remembered
     settings are applied: the defaults.
   - Two lists in `app/core.js`, by the keys of `CONFIG_FIELDS`: the fields a preset sets (today's nineteen,
     and the room's fields), and the fields kept across presets (the sender's Steam uptime, the listener's
     sound device, the capture channel: properties of a PC, which W3-10 says presets do not change). A key
     in neither list fails the browser suite, so a later order cannot forget one.
   - **A preset is lit when the controls match it**, however they got there: every preset-set field equals
     the preset's value, or the default where the preset names none. Clicking a preset sets every
     preset-set field (today the manual room number and the custom room's numbers are left as they were).
   - One line under the preset row, shown whenever any control differs from the defaults: "Modern, changed:
     Voice scale 0.5 · Output volume 0.15 · [Reset]", naming the preset that was last lit, each differing
     control by its label and value, the kept-across fields after the word "also". "Reset" returns every
     control to the defaults. The line is the page's answer to "is this the default render?", so it is
     visible without opening the advanced controls.
8. **Settings are remembered.** Every change writes `collectConfig()` to `localStorage` (`tf2ve_settings`);
   at boot it is applied after the defaults are recorded and before a share link, which wins. Storage that
   throws or holds something else leaves the defaults. Whether the advanced controls were open is
   remembered the same way. The line of item 7 then shows a returning user what is not the default.
9. **The first screen.**
   - The file is the main action: the file control is styled as the page's primary button, with the words
     "or drop a file anywhere on the page" beside it; "Live" takes the plain button style that "Record"
     has. Nothing else in step 1 moves.
   - The five badges become three, in plain words: "Measured against recordings of the game", "Video in,
     video out (MP4, MOV)", "Nothing is uploaded: it runs in your browser". The two for specialists (the
     codec's terms; "int16 clip") go; README already says both.
   - `<meta name="description">` loses "and Source room DSP" until W3-17c has merged (if it has when this
     part is built, the sentence is rewritten to what W3-17d's evidence line says).
10. **Which version this is.** The footer shows "version N", N being the service worker's cache number
    (the page asks `caches.keys()`; nothing is shown where there is no service worker). When a new service
    worker takes control of a page that already had one when it loaded (`controllerchange`; not the first
    visit's, where the page had none), a line
    appears above step 1: "A newer version of this page is ready. Reload to use it; a loaded file and its
    render are not kept across a reload." The page never reloads itself (the comment in `index.html` gives
    the reason, and it holds).

### Checks

In `tests/browser.verify.js`, each shown to fail when the code it covers is broken (say how in the report).
The clips are made in the page, as the suite's others are.

- A chosen file with no further action: the download button becomes enabled and `state.renderId` is 1; at
  1280 × 720 and at 390 × 664 the player's box lies wholly inside the screen; the focused element is the
  player; the player is paused.
- A 10 s source, `voice_scale` set to 0.5 by its control: a second render finishes with no press, and its
  WAV differs from the first. Three changes within 300 ms give one render, not three.
- The player at 4 s and playing, then a changed setting: after the new render the position is within 0.15 s
  of where playback had got to and it is still playing; with "Original" chosen before, "Original" is chosen
  after.
- A 61 s source and a changed setting: no render starts within 2 s; the three texts of item 3 are on the
  page and the views carry `stale`; setting the value back removes them with `state.renderId` unchanged; a
  press on "Render again" renders and removes them.
- Presets: on a fresh page Modern is lit and the line of item 7 is hidden. `voice_scale 0.5` from the
  console: no preset is lit, the line names "Voice scale" and "0.5". The console commands that set Laggy's
  values one by one light Laggy with no click. "Reset" lights Modern and every `CONFIG_FIELDS` value equals
  its default. With the sound device at 44100 Hz, Modern is still lit and the line shows it after "also".
  Every key of `CONFIG_FIELDS` is in exactly one of the two lists.
- Remembered: a changed setting survives a reload; a share link with another value wins; with
  `localStorage.setItem` made to throw, and with `tf2ve_settings` holding `"x"`, the page boots on its
  defaults with no page error.
- Words: no visible text matches `Process Audio`, `\bWet\b`, `\bDry\b` or `int16`; the render's status line
  after a render holds "Rendered in" and the rate the WAV's header has.
- Version: the footer's number is `sw.js`'s. With a second `sw.js` of a higher number served by a route and
  `registration.update()` called, the notice appears and a marker set on `window` before it is still there.
- `pnpm test:all` passes; CI passes on the pushed branch. `sw.js` cache version up.

### Files

May touch: `index.html`, `style.css`, `app/core.js`, `app/console.js`, `app/source.js`, `app/render.js`,
`app/meter.js`, `app/visualizer.js` (the labels and the `stale` class only), `app/boot.js`, `batch.js` (only
to use the shared key function), `sw.js`, `README.md` (the steps a user takes; the settings that are
remembered), `tests/browser.verify.js`. May not touch: `audio.js`, `audio-worker.js`, `constants.js`,
`live.js`, `vendor/`, the Node suites, `docs/PROGRESS.json`.

### Stop and ask

- If a render that starts by itself breaks a check of the suite that cannot be rewritten to the new journey
  without losing what it checks.
- If the page as W3-10 left it has a control this part's two lists cannot place.

## W4-01c: keyboard, the microphone's refusal, the phone, the screen reader

### What to build

1. **The console's input lets Tab go** (finding 7). Tab completes only when the input holds a word with no
   space and at least one command matches it; otherwise Tab moves the focus on. Shift+Tab always moves the
   focus back. The input gets the focus ring the other controls have.
2. **The microphone refused** (finding 6). In `live.js` and `startRecord`: by the error's `name`,
   `NotAllowedError` and `SecurityError` give "The browser did not let this page use the microphone. Allow
   it for this site (the icon in the address bar), then press Live again."; `NotFoundError` and
   `OverconstrainedError` give "No microphone was found. Plug one in, or choose it in the system's sound
   settings, then press Live again."; anything else the present text with the browser's message. For
   Record the last words are "then press Record again". The live panel's note becomes `role="status"`,
   and an error there has the status line's error style (its colour and size). When the live monitor stops,
   the note reads "Stopped." The live panel's own "Record" button is named "Record this session".
3. **The console is not read out without end** (finding 10). The console's output has `aria-live="off"`
   whether the console is open or not. What a typed command answers is also put in a visually hidden
   `role="status"` element, the lines it logged joined, so a screen reader hears the answer and not the
   simulated game feed.
4. **The phone** (finding 8), at 640 px and under unless said:
   - the loudness table's scrolling box is a named region that takes the focus (`role="region"`, a label,
     `tabindex="0"`), its first column stays in place while it scrolls, and its right edge shows that there
     is more (a fade, or the scrollbar always drawn);
   - a select's chosen text that does not fit ends in an ellipsis instead of being cut mid-letter;
   - checkboxes are 20 px, and a checkbox with its label is a row at least 44 px high; number boxes,
     selects and file controls are at least 44 px high.
5. **Sizes and contrast, at every width.** Labels and legends at least 12 px, the console names beside them
   at least 11 px, the view buttons' text at least 11 px. The footer's text, the console's hint and the
   live panel's "○ push-to-talk" reach 4.5 to 1 against their backgrounds.
6. **What the picture and the meters say.** The picture of the sound is described by the legend under it
   (`aria-describedby` to `#viz-legend`, which already names what is drawn). The live panel's two level bars
   become `role="meter"` with a name and a value in dBFS, updated at most twice a second. The advanced
   switch's `aria-controls` names the element that holds the advanced groups and not one that holds the
   switch itself.

### Checks

In `tests/browser.verify.js`, each shown to fail when its code is broken.

- Console: with the input empty Tab leaves it; with `voice_sc` typed Tab completes to `voice_scale ` and the
  focus stays; Shift+Tab leaves it in both cases.
- In a browser context with no microphone permission, and in one with no microphone: after a press on Live
  the note has `role="status"`, the error style, and the word "microphone" in a sentence that is not only
  the browser's message; the same for Record in the status line. After a start and a stop with the fake
  microphone the note does not begin with "Live."
- With the console open, its output's `aria-live` is `off`; after `voice_scale 0.5` is entered the hidden
  status element holds `"voice_scale" = "0.5"`.
- At 390 × 664 with a render on screen and every panel open: no select's chosen text is wider than its box
  unless it has the ellipsis style; the table's box has the role, the label and takes the focus; both live
  checkboxes are at least 20 px and their label rows at least 44 px; every number box and select in the
  settings is at least 44 px high; the page does not scroll sideways (also at 320).
- Computed sizes: no label, legend or view button under the sizes of item 5. Computed contrast of the three
  texts of item 5 is at least 4.5 (the suite computes it from the colours, as the audit did).
- The picture has `aria-describedby`; the live bars have `role="meter"` and a numeric `aria-valuenow` while
  the fake microphone runs.
- `pnpm test:all` passes; CI passes. `sw.js` cache version up.

### Files

May touch: `index.html`, `style.css`, `app/source.js` (the console's keys, `startRecord`), `app/console.js`
(the hidden status), `app/render.js` (the console's `aria-live` line), `live.js`, `sw.js`,
`tests/browser.verify.js`. May not touch: `audio.js`, `live-worker.js`, `live-worklet.js`, `constants.js`,
the Node suites.

## W4-01d: the settings' words (after W3-17d)

### What to build

1. **Every control in the settings panel has one sentence under it**, visible, at most about 110
   characters, tied to the control with `aria-describedby`. It says what the control does to the sound and,
   where the default is not self-evident, whose default it is. The sentences W3-16, W3-10, W3-11b and
   W3-17d already wrote stay as they are. **Read the panel as it stands when this part starts**; a control
   this list does not name gets a sentence in the same form, listed in the report. The ones the audit
   settled:

   | Control | Label | Help |
   | --- | --- | --- |
   | Codec (the profile) | "Voice codec" | "What the game sends voice with. Steam voice is today's; the others are the game's older codecs." The options start with the plain name ("Steam voice", "vaudio_celt", "vaudio_celt_high", "vaudio_speex", "Fullband Opus: not in the game") and keep their figures after it, shortened so the longest fits a 390 px screen |
   | Codec (the switch) | "Skip the codec" (Off / On) | "For comparison only: the sound goes to the receiver without being coded." |
   | Stereo capture | "Channel of a stereo file" | "Which channel the game's microphone gets. Left is what one stereo cable gave it; a mono file is not affected." The option reads "Left", not "Left (measured)" |
   | Mic gain | as it is | "Loudness into the game. Above 1 the sender clips, as an overdriven microphone does." |
   | Bitrate scale | "Bitrate, in sixteenths" | "16 is the codec's own bitrate; 8 is half of it. vaudio_speex has one bitrate and ignores this." |
   | Packet length | "Frames per packet, as ms" | "How much voice one network packet carries. A lost packet loses all of it." |
   | Frames lost % | as it is | "The share of voice frames that never arrive. Not the game's own number: its net_fakeloss 5 lost about 22% of them." |
   | Jitter ms | as it is | "Late packets. Fitted at 50 ms, where 3.2% of frames were late; other values are scaled from that." |
   | Talk-spurt timing (until W3-02d replaces it) | as it is | the options read "The file's own timing" and "Some phrases start early (random)"; help: "The game plays some phrases early after a short silence. Which ones is random." |
   | Max gain | as it is | "The most the receiver's auto-gain may amplify. The game's default is 10." |
   | Voice scale | as it is | "The game's voice_scale. Not a plain volume: below 1 it lowers the voice by more than its number." |
   | Output volume | as it is | "The game's volume setting; it sets the loudest the file can get. 0.5 is this page's choice: the recordings behind the model used 0.15." |
   | High-pass, low-pass | as they are | "Not in the game: a filter before the codec. 0 is off." and "… 20000 is off." |

2. **The chain strip names what it left out**: its Receiver cell gains "voice_scale N" when it is not 1 and
   "gain target N" when `voice_avggain` is not 0.5, so the strip is again a full account of what differs.
3. **The console's help** for each of these commands says the same as the page (`app/console.js`), and
   README's "Controls and console" keeps in step.

### Checks

- The browser suite: every `select` and `input` inside the settings panel has an `aria-describedby` that
  names an element with at least 20 characters of text (the test walks the panel; it does not carry a list
  of ids, so a control added later without help fails it). No option text contains "(measured)". At 390 px
  the codec's chosen text fits its box for every option. No two controls in the panel have the same label
  text. The Receiver cell of the chain strip holds "voice_scale 0.5" after that setting.
- `pnpm test:all` passes; CI passes. `sw.js` cache version up.

### Files

May touch: `index.html`, `style.css`, `app/console.js`, `constants.js` (the profiles' `displayName` only, if
the option texts are made from it), `README.md`, `sw.js`, `tests/browser.verify.js`, and `tests/verify.js`
only where it reads a name that changed. May not touch: `audio.js`, the evidence line and the room controls
of W3-17d, any default value.

### Stop and ask

- If a sentence above is no longer true of the page as W3-17d left it (say which, and what is true).

## W4-01b: speed, with the same samples

The rule of this part: **no golden hash moves and no hash is re-recorded.** `tests/render-stream.verify.mjs`'s
`GOLDEN` block is not edited; a step that cannot keep it is stopped and reported.

### What to build

**Step 1: the worker (speed-ups 3, 4 and 5; measured together at about a quarter off a render).**

1. **One worker, kept.** `app/render.js` makes one render worker and reuses it for the next render, the
   exports, the meter and the take jobs. Cancel ends it as now, and the next job starts a new one. Two jobs
   are never in one worker at once: a second job waits for the first, or goes to a worker of its own as
   today (the builder chooses and says which). The batch's lanes are unchanged.
2. **No waiting in the worker.** In `audio.js`, `microYield` is a resolved promise where there is no
   `document` (a worker), and the timer it is today on a page, where the render runs only when a worker
   cannot. [In a worker nothing needs the pause: progress is posted, and Cancel ends the worker. A browser
   makes each nested `setTimeout(0)` at least 4 ms: 0.4 s of a 4.2 s render.]
3. **The result first, the meter after.** The worker posts the render's result as soon as it has it, then
   computes the loudness and posts it as a second message; the page fills the table when that arrives. The
   meter's numbers do not change.
4. **Progress that moves.** In the `steam` render the stretch from 60 to 72% (Steam's resampler, the gain,
   the laying) reports as it goes, once per 64 messages, where it now yields.

**Step 2: the stages before a changed setting (speed-up 1).**

5. `process()` takes an optional `opts.stages`, an object the caller keeps between calls, and
   `opts.sourceKey`, a value the caller changes when the source's samples change. Without `opts.stages`
   nothing differs from today. With it, two results are kept:
   - **A, the capture signal at the codec's rate** (after stage 2 of `process()`);
   - **B, the codec stage's result**: for the `steam` rule the sender's messages, the decoded packets and
     what `codecInfo` is later made from; for the other profiles the decoded samples at the codec's rate
     (after the decoder's filter where a profile has one) and their `codecInfo`.
6. **The keys are safe by default.** Two lists of option names in `audio.js`: the options read only after B
   (`voiceScale`, `agc`, `avgGain`, `maxGain`, `retime`, `volume`, the room's options, `deviceRate`, and the
   test hooks that only observe), and the options read only after A (those, and `gate`, `gateThresholdDb`,
   `steamUptime`, `bits`, `lossPct`, `jitterMs`, `frameMs`, `seed`). A's key is `sourceKey` and every option
   **not** on the second list; B's key is A's key and every option not on the first. So an option a later
   order adds is in both keys until someone lists it: the cost of forgetting is a missed reuse, never a
   stale render. A render with `received` (a demo's voice) or with the codec skipped keeps nothing in B.
7. **Nothing kept is changed afterwards.** What is taken from A or B is not written to by the later stages
   (copy where a stage works in place; say where in the report).
8. **The worker holds one `stages` object for the page's source.** The page sends the source's samples once
   (a `source` message with an id) and each render names the id; a new source replaces the old one and its
   stages. A's size is half the source's at 48 kHz; B's is small for `steam`. The stream (`createRender`)
   keeps nothing: long sources are W2-03's.
9. **The receiver's orders keep the two places.** A note in `audio.js` at each: what is kept there and that
   an option read before it must not be on the list after it.

**Step 3: the first seconds (speed-up 2). Not started until the owner asks (Decision 6).**

10. For a source longer than 30 s whose settings allow it, the worker first renders the source's first 15 s
    and posts it; the page gives it to the player, marked "the first 14 s; the rest is rendering", and the
    user can play it. When the full render arrives it replaces the preview at the same position and play
    state (part a, item 4). The preview is allowed only for settings a test has shown equal: any profile,
    no loss, no jitter, talk-spurt timing off, no room, not a demo. Elsewhere there is none.

### Checks

- **The hashes.** `node tests/render-stream.verify.mjs` passes and `git diff main -- tests/render-stream.verify.mjs`
  shows no change inside `GOLDEN`. `pnpm test` passes.
- **Step 1**, in the browser suite: two renders of one source construct one `Worker` (count the
  constructor's calls); Cancel during a render, then a render, gives a result; the `result` message arrives
  before the meter's, and the table's numbers are `Object.is`-equal to `TF2Meter.analyze` of the result; in
  a 60 s `steam` render the button shows at least five different percentages between 60 and 72.
- **Step 2**, in a new Node suite `tests/stages.verify.mjs` (added to `pnpm test`):
  - every `GOLDEN` case rendered with a `stages` object that was first used for the same source with
    `voiceScale: 0.5`, and again with one first used with `lossPct: 5`, gives its recorded WAV and info
    hashes;
  - for each option name `renderOptions()` can send (the test holds the list, and the browser suite checks
    that list against `Object.keys(renderOptions())`): that option alone changed, rendered with warm stages,
    equals a fresh render of the same options, by hash;
  - an option name the engine does not know (`zzNew: 1`) makes both keys differ: neither A nor B is reused
    (a counter the test reads);
  - a changed `sourceKey` reuses nothing; the same samples under the same `sourceKey` with `voiceScale`
    changed reuse B (the counter), and with `lossPct` changed reuse A and not B.
  - In the browser suite: a 60 s source rendered, then `voice_scale 0.5`: the second render takes under
    half the first's time (the audit expects a third), and its WAV's hash equals that of a fresh page's
    render with that setting.
- **Step 3**, if built: in Node, for each profile and three seeded clips, the first 14 s of a render of the
  first 15 s equal the full render's, sample for sample; in the browser, a 60 s source has a playable player
  within 2.5 s while the progress is under 100%, and the full render then replaces it with the position
  kept; with `lossPct` 5 there is no preview.
- **The report gives the times**, before and after, on the build machine, for 10 s, 60 s and 5 minutes at
  the default preset: a first render, and a re-render with `voice_scale` changed, each the median of three.
  The audit's figures on its machine: 1.1 s, 4.5 s and 21 s for both.
- CI passes on the pushed branch. `sw.js` cache version up. `tests/predictions/PREDICTIONS.md`: a dated note
  that `audio.js` changed and no render moved (the golden hashes).

### Files

May touch: `audio.js` (`microYield`; `process()`: the two places, the keys, the progress line; the exports),
`audio-worker.js`, `app/render.js` (the worker's lifetime, the source message, the late meter message),
`app/core.js` (state for the worker), `app/meter.js` (only to take the late numbers), `batch.js` only if it
calls a function whose shape changed, `tests/stages.verify.mjs` (new), `tests/browser.verify.js`,
`package.json` (the `test` line), `sw.js`, `tests/predictions/PREDICTIONS.md`. May not touch:
`tests/render-stream.verify.mjs`'s `GOLDEN`, `createRender` and `createLiveChain`, `opus-codec.mjs`,
`steam-sender.js`, `vendor/`, `constants.js`, `reference.js`, `tests/predictions/predictions.json`,
`docs/PROGRESS.json`.

### Stop and ask

- If any golden hash moves.
- If a later stage writes into what A or B keeps and a copy would cost more than the reuse saves.
- If the worker's memory with the stages kept, for a 9.8-minute source, is more than a tenth over today's
  peak (the audit measured 1.1 GB): say the figure.

## Not in this order

- **Speed-ups measured and left out** (the audit has the figures): Steam's resampler loop in WebAssembly
  (2.2 times on a stage that is 11% of a render: one more pinned module for 6%); the capture filter with
  several outputs side by side (3%); several workers (up to about 35% for speech, nothing for music, and
  the most machinery); loading fewer scripts before the page is usable (the page is ready in a sixth of a
  second as it is). Each is a small order of its own if a later measurement makes it worth one.
- Long files and their memory (W2-03, held), the views for them (W2-05).
- The room controls, which names are shown and where each control sits (W3-17d); the threshold and the live
  mode's words about the gate and the key (W3-11b); the device's rate (W3-10); talk-spurt timing's
  replacement (W3-02d, W3-02f).
- A light theme, a redesign of the panels, any new feature. Nothing here sends anything anywhere: the
  remembered settings are in the browser's own storage, as the download format already is.
- The simulated game feed in the console and its list of names (the audit, finding 12): the owner's call.
- Moving `volume`'s default (Decision 4).

## Open

- Which browser message a real denial gives in Firefox and Safari was not seen (the audit ran headless
  Chromium); part c's sentences go by the error's name, which is the same in all three.
- Whether a preview's head stays equal with a room, with loss or with re-timing was not tried: step 3
  allows a preview for none of them.
