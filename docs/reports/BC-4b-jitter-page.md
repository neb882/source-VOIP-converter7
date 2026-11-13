# BC-4b: jitter as arrival times, the page's words and controls

The builder's report, 2026-11-13, for `docs/work-orders/BC-4-jitter-arrivals.md`, part BC-4b, with the order's
sections after "The private checks" holding over the text above them. Branch `claude/bc-4b-jitter-page`, from
`main` at `ad89c8c`, with `main` merged in at `dd295f1` (a PROGRESS commit). Nothing of the owner's record was
read.

## What changes, in one paragraph

BC-4a made jitter on Steam voice the tick on which each voice message reaches the game's voice queue; on the file's
own timing it does nothing there, and the other codecs keep the late-frame fit. The page now says which of the
three a setting gets. A line under the jitter control shows, while the control is above 0, that jitter does nothing
on Steam voice on the file's own timing, or that it is a fit on another codec; on Steam voice on the game's queue
it is hidden. The chain strip's Network cell says the same. `net_fakelag` prints one line and changes nothing. The
live monitor's note says that jitter does nothing there yet on Steam voice. No render's samples change.

## What changed, file by file

- `index.html`: `<p id="jitter-note" class="control-help" hidden>` under the jitter control's help, as
  `timeline-note` sits under Phrase timing. The two help strings stay as BC-4a's fix round left them.
- `app/core.js`: `els.jitterNote`.
- `app/console.js`:
  - `steamJitterOff()`: true on Steam voice when the setting itself is the file's own timing, or when
    `sourceTimingReason()` gives a reason (the codec skipped, a demo's voice, a video). `sourceTimingReason()`
    returns null when the setting is 'source' (the plan review's point 11), so the setting is tested on its own.
  - `updateJitterNote()`, beside `updateTimelineNote()` and called from it: the line's text, `hidden`, and the
    control's `aria-describedby`, which names `jitter-note` only while it is shown. Its two texts are the order's:
    "Jitter does nothing on the file's own timing: it moves when packets reach the game's voice queue." and "On this
    codec jitter is a fit: single frames marked late, 3.2% of them at 50 ms. The game makes no frame late."
  - `networkStep()`: the chain strip's Network cell, moved out of `updateSignalChain()`. It keeps "50 ms jitter"
    where jitter runs on the queue, says "50 ms jitter (a fit)" on another codec and "jitter off (no queue)" on
    Steam voice on the file's own timing. The cell is marked hot for loss, or for jitter that acts.
    `updateJitterNote()` also rewrites this cell. A demo's voice is set after the strip was drawn (`app/source.js`
    sets `state.sourceDemo` after `mountSource()` and its codec event does not bubble to the controls), and
    `app/render.js` calls `updateTimelineNote()` when the render starts, so the cell then follows. No change to
    `app/render.js` was needed.
  - `net_fakelag`: a command with no control and no share key. With or without a value it prints the order's line
    ("A steady lag delays every packet alike and a render does not show it. The app takes net_fakelag as twice
    net_fakejitter, the least at which the game applies the whole jitter") and changes nothing.
- `live.js` (the monitor's status text only): `setNote()` keeps the note's own text, and `showNote()` adds "Jitter
  does nothing in the live monitor yet." while the monitor runs on Steam voice with the codec on and jitter above
  0. It follows the settings (`tf2:settings`) and writes the note only when the text changes. **The monitor's
  note goes in `#live-note`**, the status line under the live panel where the monitor's other notes are ("Live.
  Settings changes apply as you make them…", "Stopped.", the recording's lines).
- `tests/browser.verify.js`: a new section [Browser 8e] (`verifyJitterPage`), checks at the end of [Browser 3f]
  for the live note, and the comment of [Browser 8]'s part 4 on jitter brought up to date (jitter stays off
  `AFTER_B`, so a 61 s source is still marked; that part's checks are unchanged).
- `docs/PAGE.md`: a **Jitter** paragraph under "Settings" (what it does on the queue, on the file's own timing and
  on the other codecs, with the standing of each part; the line under the control; the Network cell; the live
  monitor's note; no lag control; `jit` and the Laggy preset); "What a render runs again" (jitter on Steam voice
  starts from the codec's result, but a longer source still waits for **Render**; on the other codecs it starts
  from the capture signal); the console line with jitter; `net_fakelag` in the console's table; and the real-take
  guide (on Steam voice jitter marks no frame late). The order's line numbers for PAGE.md were those of `28e9c79`;
  the same passages were found by their text.
- `README.md`: step 3's jitter sentences: on Steam voice jitter acts only through the queue and does nothing on the
  file's own timing, it is a fit on the other codecs, a line under the control says which; a changed jitter on
  Steam voice skips the sender and the codec but a longer source still waits for **Render**.

`sw.js` is not touched: no file was added, removed or renamed.

## The checks

[Browser 8e] runs in pages of its own.

- With no source on the page, the line follows the settings at once: hidden and not named on Steam voice on the
  game's queue at jitter 50; the first text and named with the codec skipped and with `voice_timeline source`
  (point 11's case: `sourceTimingReason()` is null there); the second text on `celt_22`; hidden and not named at
  jitter 0 on the file's own timing, on `celt_22` and on the game's queue.
- `net_jitter 30` sets the control to 30. `net_fakelag 100` and `net_fakelag` each print exactly their line after
  the command's echo; no control of the settings panel changes, the remembered settings do not change, and no
  control is linked to it.
- A 4 s speech fixture, Steam voice on the game's queue, jitter 50: the line is hidden and not named, the render on
  screen has `codecInfo.arrivals` (jitter 50) and its channel, the strip says "50 ms jitter", and the worker
  started the render from the kept codec result.
- `voice_timeline source`, jitter 50: the first text, named; the line under Phrase timing is hidden; the render's
  key holds timeline 'source' and jitter 50, it has no `arrivals`, and it equals `TF2Audio.process` at jitter 0,
  sample for sample; the strip says "jitter off (no queue)". Jitter back to 0: hidden, not named, no jitter in the
  strip.
- `sv_voicecodec celt_22`, jitter 50: the second text, named, "50 ms jitter (a fit)". Back to 0: hidden.
- The Laggy preset: jitter 50 on Steam voice on the game's queue, the line hidden, the render with its arrivals,
  "18% lost · 50 ms jitter"; Modern after it: jitter 0, no arrivals.
- A share link `#jit=50` and nothing else: the control at 50, Steam voice, Phrase timing the game's queue,
  `renderOptions()` sends timeline 'game' and jitter 50, the line hidden.
- **The demo check:** jitter 50, then `tests/demo/synthetic.dem` (Steam voice) as the source: the first text,
  named, the line under Phrase timing gives "a demo's voice", the render on the file's own timing with no arrivals,
  and the strip says "jitter off (no queue)". Then a video (`tests/video/vp9_opus.mp4`): the first text. Then an
  audio file: the line hidden, the render with its arrivals.

[Browser 3f], at its end, while the monitor runs on the fake microphone: on Steam voice, jitter 50 adds the
sentence to the note; `celt_22` takes it away; Steam voice brings it back; jitter 0 takes it away. After the stop,
with jitter 50 on Steam voice, the note is "Stopped." alone.

## The breaks

Each break was made in the worktree's file and the named section run against it through a scratch copy of the
suite that runs that section alone (for [Browser 3f], a page that starts the monitor and runs the new checks),
then the file was restored.

| Break | The check that failed |
| --- | --- |
| the line is shown whenever jitter is above 0 | with no source, on Steam voice on the game's queue at jitter 50 the line is hidden and not named |
| the line is not cleared at jitter 0 | with no source, jitter back to 0 hides the line and the control no longer names it |
| a demo's voice is not counted as the file's own timing | the demo check: "a demo's voice with jitter 50 on Steam voice on the game's queue: the line says jitter does nothing on the file's own timing…" (the line was hidden) |
| `net_fakelag` linked to the jitter control | `net_fakelag 100` and `net_fakelag` each print their one line and no control changes |
| `voice_timeline source` itself not counted (only `sourceTimingReason()`) | with no source, with the codec skipped and with `voice_timeline source` the line says jitter does nothing |
| the Network cell not rewritten by `updateJitterNote()` | the demo check (the strip said "50 ms jitter") |
| the Network cell says "50 ms jitter" on the file's own timing | `voice_timeline source`, jitter 50: the strip says "jitter off (no queue)" |
| the live note does not look at the codec | the live check (`celt_22` kept the sentence) |
| the live note never adds the sentence | the live check |
| the live note keeps the sentence after the stop | the stopped monitor's note is "Stopped." alone |

## Done means

Heavy runs inside `flock /tmp/tf2ve-heavy.lock`, on `4e9b327` (the code; `main`'s PROGRESS commit merged after).

1. The browser suite with the new checks:
   `CHROMIUM_EXECUTABLE=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) flock /tmp/tf2ve-heavy.lock pnpm test:browser`
   ends "== browser: passed, 396.4 s" and "1 of 1 suites passed." Every check that was there before passes. Each
   new check failed under its break (above), the order's four among them.
2. `flock /tmp/tf2ve-heavy.lock pnpm test` ends "27 of 27 suites passed. 1088.1 s summed" (render-stream 309.7 s,
   stages 245.4 s, steam 152.1 s, render-channel 87.1 s). `git diff origin/main --stat -- engine audio.js
   constants.js voice-channel.js` prints nothing. `git diff origin/main --stat -- tests/` shows
   `tests/browser.verify.js` only.
3. `node tests/cache-number.mjs origin/main --report`: "cached files changed since origin/main (dd295f1):
   app/console.js, app/core.js, index.html, live.js" and "cache number against origin/main (dd295f1): the number is
   v44, not above v44: it must rise (node tests/cache-number.mjs origin/main --set)". The builder did not set it.
4. `git diff origin/main --stat` shows `README.md`, `app/console.js`, `app/core.js`, `docs/PAGE.md`, `index.html`,
   `live.js` and `tests/browser.verify.js`, all in "May touch", and this report.

CI (`tests`, run 43476550870 on `4e9b327`, the last commit that changes anything outside `docs/`): `verify`
success, with `units`, `engine`, `render`, `stages` and `browser` each success. The merge of `main` and this
report change only `docs/` and start no run.

The branch's diff and commit messages were scanned for recordings, personal details, SteamIDs and model names:
none, apart from the required trailer lines.

## What was not done, or is uncertain

- **Another codec where nothing runs.** The order gives the second text for every other codec. With the codec
  skipped, or for a demo's voice on `vaudio_celt` (`celt_22`), no codec stage runs and jitter does nothing at all,
  yet the line says it is a fit there and the strip says "(a fit)". Loss is not marked in those cases either. Left
  as the order wrote it; a question for the orchestrator if it matters. *Fixed in the fix round, point 1.*
- **The Receiver cell** of the strip still reads "queue at 300 fps" for a demo's voice or a video, because it reads
  `renderOptions()`, not the source (W3-02d-1's, not touched; the Network cell follows the source). *Fixed in the fix round, point 2.*
- **The live panel's "net" figure's title** still says frames "late (silence), by the network settings" on Steam
  voice, where jitter now draws no late frame. It is a tooltip, not the monitor's status text, which is all the
  order allows in `live.js`. *Fixed in the fix round, point 3.*
- The checks of [Browser 8e] that need a render use short sources (4 s and 2 s of speech, the synthetic demo, the
  short video fixture).

## The fix round (2026-11-13)

From the order's section "BC-4b: after the review (2026-11-13, the orchestrator)", after a merge of `main` at
`3ca4f8e` (documents only).

1. **Where no codec runs, jitter does nothing on every codec.** `noCodecRuns()` (`app/console.js`) gives
   'skipped' with the codec skipped and 'demo' for a demo's voice. On a codec other than Steam voice the line then
   says "Jitter does nothing here: the codec is skipped." or "Jitter does nothing here: a demo's voice is played as
   the game received it."; Steam voice keeps its text. Where no codec runs and loss or jitter is above 0, the
   Network cell reads "N ms packets · loss and jitter off (the codec is skipped)" or "(a demo's voice as received)",
   on every codec, and is not hot. `docs/PAGE.md`: the third jitter bullet says the fit holds with the codec on and
   not on a demo's voice, and a fourth says what happens where no codec runs; the Network cell's sentence gains the
   new reading.
2. **The Receiver cell** is `receiverStep()`, beside `networkStep()`: on Steam voice it names the queue only where
   `renderOptions().timeline === 'game'` and `sourceTimingReason()` gives no reason, and "the file's own timing"
   otherwise. `updateJitterNote()` rewrites both cells, so the Receiver cell follows a demo's state when it lands.
   `docs/PAGE.md` says so.
3. **The live "net" title** on Steam voice (`live.js` `updateTexts`, and the first title in `index.html`): "Frames
   concealed: lost frames (net_fakeloss) the decoder filled in when the next one arrived. On Steam voice no frame
   is late". The other codecs keep theirs.
4. **The hot mark**: the `voice_timeline source` check holds that the Network cell is not hot; the game's-queue
   check that it is hot at jitter 50; the `celt_22` check that "50 ms jitter (a fit)" is hot.

**New checks.** In [Browser 8e], with no source: `celt_22` with the codec skipped, jitter 50 and loss 10 (the
skipped text, the cell "loss and jitter off (the codec is skipped)", not hot); `celt_22` with the page's demo state
set by hand, no source decoded (the demo text, not hot); Steam voice with the codec skipped, jitter 50 and loss 10
(the cell, not hot). The Steam demo check now reads "loss and jitter off (a demo's voice as received)", not hot,
and a Receiver cell of "the file's own timing"; the video check reads "jitter off (no queue)", not hot, and the
same Receiver cell; the audio file after them reads "queue at 300 fps". In [Browser 3f]: the "net" title on Steam
voice and in `index.html` is the new text, and on `celt_22` it is the frame text. No `celt_22` demo fixture
exists, so the demo text on another codec is checked through the page's demo state, not a loaded demo.

**The fix round's breaks.** Each made in the worktree's file, the named section run alone, the file restored.

| Break | The check that failed |
| --- | --- |
| the codec skipped not counted where no codec runs | `celt_22` with the codec skipped, jitter 50 and loss 10 |
| the fit text kept on another codec where no codec runs | the same |
| a demo's voice not counted where no codec runs | `celt_22` with a demo's voice (the page's demo state) |
| the Network cell shows loss and jitter where no codec runs | `celt_22` with the codec skipped |
| the Network cell hot where no codec runs | the same |
| the Receiver cell ignores `sourceTimingReason()` | the Steam demo check (its Receiver cell) |
| the Receiver cell not rewritten with the Network cell | the Steam demo check |
| the Network cell hot for "jitter off" (the reviewer's break) | `voice_timeline source`, jitter 50: "jitter off (no queue)", not hot |
| the live title on Steam voice keeps late frames | the live "net" title check |
| `index.html`'s first title keeps late frames | the live "net" title check |

**Done-means after the fix round.**

On `e9ed585`, heavy runs inside `flock /tmp/tf2ve-heavy.lock`.

- `pnpm test`: "27 of 27 suites passed. 1045.7 s summed" (render-stream 305.3 s, stages 244.8 s).
- The browser suite (`CHROMIUM_EXECUTABLE=… flock /tmp/tf2ve-heavy.lock pnpm test:browser`): "== browser: passed,
  399.4 s", "1 of 1 suites passed."
- `git diff origin/main --stat -- engine audio.js constants.js voice-channel.js` prints nothing;
  `git diff origin/main --stat -- tests/` shows `tests/browser.verify.js` only; no file outside "May touch".
- `node tests/cache-number.mjs origin/main --report`: "cached files changed since origin/main (3ca4f8e):
  app/console.js, app/core.js, index.html, live.js" and "cache number against origin/main (3ca4f8e): the number is
  v44, not above v44: it must rise (node tests/cache-number.mjs origin/main --set)". The builder did not set it.
- CI (run 43482501433 on `e9ed585`): `verify` success, and `units`, `engine`, `render`, `stages` and `browser`
  each success. This report's commit changes only `docs/` and starts no run.

The fix round's diff and commit messages were scanned as before: nothing beyond the trailer lines.
