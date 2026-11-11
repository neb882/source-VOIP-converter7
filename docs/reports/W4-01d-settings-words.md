# W4-01d: the settings' words

The builder's report. The order is `docs/work-orders/W4-01-page.md`, part d ("W4-01d: the settings' words"), with the
owner's answers of 2026-11-10 (`volume` 1.0 with the label) and the brief's notes, built after W3-17d on the same
branch, `claude/w3-17d-rooms-page`, as commits of its own. W4-01a, b and c are not built: the page is as W3-10,
W3-11b, W3-16, W3-17c and W3-17d left it, and nothing of them was built here.

**Status:** built; every check passes (see "Runs"). No default value changed; no golden hash moved.

## Summary

- **One sentence under every control** of the settings panel, visible, tied to it with `aria-describedby`, at most
  about 110 characters: the longest single sentence is the order's own for frames lost (114); the owner's volume text
  is three short sentences (142 in all) and the custom room's two (117). The sentences W3-16, W3-10, W3-11b and W3-17d wrote stay: their `title`
  texts are kept, W3-17d's lines under the listener position, the manual number and the custom room are those
  controls' sentences, and the others gain a visible sentence in the same form (below). W3-10's volume sentence is
  replaced by the owner's (below).
- **Labels and options:** "Voice codec"; the codec's options start with the plain name and keep short figures
  ("Steam voice (Opus, 32 kbps)", "Fullband Opus: not in the game", "vaudio_celt (CELT, 22 kHz)", "vaudio_celt_high
  (44 kHz mode)", "vaudio_speex (Speex, 11 kHz)"); "Skip the codec" (Off / On, the values unchanged, so links keep
  working); "Channel of a stereo file" with "Left"; "Bitrate, in sixteenths"; "Frames per packet, as ms"; talk-spurt
  timing's "The file's own timing" and "Some phrases start early (random)". Mic gain, frames lost, jitter, max gain,
  voice scale, output volume, the filters: labels as they were.
- **The chain strip** names what it left out: the Receiver cell gains "voice_scale N" when it is not 1 and "gain
  target N" when `voice_avggain` is not 0.5 (the latter with the auto-gain on, where it acts).
- **The console's help** for each command holds its control's sentence (`app/console.js`); README's "Controls and
  console" says so and keeps the labels in step.

## Commits

| Commit | What |
| --- | --- |
| `c613b02` | `index.html` (sentences, labels, options), `app/console.js` (helps, the chain strip), `app/rooms.js` (the manual line for 0 made a sentence), `tests/browser.verify.js` ([Browser 3c5] and the older checks of option texts), `tests/speex102.verify.mjs` (its wording check) |
| `0faef48` | README |
| (this report) | |

## The sentences

From the order's table, as written: Mic gain, Bitrate, Packet length, Frames lost %, Jitter ms, Talk-spurt timing, Max
gain, Voice scale, High-pass and low-pass, Skip the codec, Channel of a stereo file.

Changed from the order's table, because a sentence of it is not true of today's page or code:

| Control | The order | The page | Why |
| --- | --- | --- | --- |
| Voice codec | "What the game sends voice with. Steam voice is today's; the others are the game's older codecs." | "What the game sends voice with. Steam voice is today's; the vaudio_ ones are the game's older codecs." | "the others" takes in Fullband Opus, which is not in the game (README, Profiles) |
| Output volume | "... 0.5 is this page's choice: the recordings behind the model used 0.15." | "The game's volume setting; it sets the loudest the file can get. 1.0 is the game's default. The recordings behind the model were made at 0.15." | the owner's answer: `volume` defaults to 1.0 (W3-10 made it so); these are the owner's words, which the order says to read in place of "0.5 is this page's choice" |

The codec sentences agree with README and `tests/REFERENCE_2026.md` as they stand: Steam voice is today's;
`vaudio_celt`, `vaudio_celt_high` and `vaudio_speex` are the game's older codecs (Speex is what a 32-bit game still
runs, W3-18; the menu entry says only "Speex, 11 kHz"); Fullband Opus says in its entry that it is not in the game.

**Controls the table does not name**, each given a sentence in the same form:

| Control | Sentence |
| --- | --- |
| Listener position | W3-17d's line: what the choice builds (e.g. "An example: indoors, 200 × 1000 × 150 units, reflectivity 0.3. The engine builds: tunnel; size class 2; from presets 114 and 115; 72/256 to the room.") and, with a room or under water, the line on the recordings (W3-17d's report). These are longer than 110 characters: they are W3-17d's, which stay |
| Listener under water | "A state of the player, with no variable: the whole sound passes the game's water preset (14)." (W3-17d) |
| Sender's Steam has been running | "How long the sender's Steam had run: its 0.4 s hold after speech is timed on a clock that coarsens with it." (W3-16's `title` stays) |
| Gain target (`voice_avggain`) | "Where the auto-gain aims each block, from its mean (0) to its peak (1). The game's default is 0.5." |
| Manual room number | W3-17d's line (what the number gives; for 0 "dsp_room 0: no room, as when no soundscape has set one.") |
| Listener's sound device | "The rate of the listener's sound device; the PC converts the game's 44.1 kHz sound to it. 48000 Hz is usual." (W3-10's `title` stays) |
| The automatic room's six measures | one sentence for the six: "What the map would measure around the listener, in units (inches); open sides count only under the sky." |
| Voice gate | "Whether the sender sends only while you speak. Auto is the codec's own: on for Opus, off for the vaudio_ ones." |
| Gate opens above | "The level that opens the voice gate, in dBFS. Steam's own is -40; blank is the codec's own." (W3-11b's `title`, which follows the profile, stays) |
| Auto-gain | "The receiver's auto-gain as the game runs it. Off is for comparison only: the voice at unity gain." |
| Live monitor: low latency | "Plays the live monitor sooner by cutting part of each phrase's start. Not how TF2 sounds." (W3-11b's `title` stays) |
| The custom room's three knobs | one sentence for the three, W3-17d's: "The app's own room, not the game's. At a high mix its 32-bit sums can wrap, as some of the game's rooms do fully wet." |

## Checks

The browser suite, [Browser 3c5]; the test walks the panel's `select` and `input` elements and carries no list of ids:

| Check (the order's) | Result |
| --- | --- |
| every `select` and `input` in the settings panel has an `aria-describedby` naming an element with at least 20 characters of text | pass, 33 controls |
| no option text contains "(measured)" (the whole page) | pass |
| at 390 px the codec's chosen text fits its box for every option | pass: 207, 224, 193, 230, 217 px against 246 (the box's width less its padding and 20 px for the arrow; Arial 16 px, the page's font at that width) |
| no two controls in the panel have the same label text | pass |
| the Receiver cell holds "voice_scale 0.5" after that setting | pass (and "gain target 0.25" after `voice_avggain 0.25`; neither at the defaults) |
| `pnpm test:all`, CI, `sw.js` cache up | see "Runs"; the cache is v31, raised once on this branch by W3-17d (the brief: once) |

More: each sentence at most 115 characters (W3-17d's two lines under the listener position aside); the labels, options
and sentences of the order's table, word for word; each linked console command's help holds the first sentence of
its control's (the threshold, the listener position and the manual number excepted: their texts follow the choice).

Older checks changed with the words: the speex and CELT option texts ([Browser 3c2], [Browser 3c3]); steam_48's
entry (`Fullband Opus: not in the game`; its profile's `displayName` keeps "not the game's path", unchanged, since the
options are not made from it); the volume sentence (W3-10's check); `tests/speex102.verify.mjs`'s wording check.

## Runs

On the branch's code at `0faef48`, under the heavy-job lock (the last commit adds the two reports and makes the walk report a missing sentence rather than crash):

| Run | Result |
| --- | --- |
| `pnpm test:all` (`CHROMIUM_EXECUTABLE` set to the installed Chromium) | exit 0, 13 min 15 s: `test:vendor` (Opus runtime, libopus 1.1.5, CELT 0.11, Speex 1.0.2 match), then `pnpm test` (`verify.js` 214, gain 93, Opus 147, Speex 86, paired reference 42, formats 68, file rate 53, meter 50, video 46, demo 36, render-stream 520, output-stage 102, voice channel 129, Steam sender 109, swresample 43, room 215), then the browser suite: **279 browser checks passed** |
| the browser suite again on the head (after two lines of the walk were made to report a missing sentence rather than crash: W1 below) | exit 0, **279 browser checks passed** |
| CI (`tests`) | on `0faef48`: see the hand-back; the head's run cannot be written into the commit it runs on |

## Breaks

As W3-17d's report says how (a scratch copy, one edit, the section run under the lock):

| # | Break | Caught by |
| --- | --- | --- |
| W1 | `aria-describedby` taken off Max gain | the walk: "without: maxgain" (the first run of this break crashed the walk instead; it now reports) |
| W2 | the chain strip drops voice_scale | the Receiver cell check |
| W3 | "Left (measured)" back | the "(measured)" check |
| W4 | the CELT high option long again ("CELT 0.11, 44 kHz mode") | the table's options check |
| W5 | two labels "Length" | the duplicate-label check |
| W6 | Max gain's console help the old one | the console-help check (voice_maxgain) |
| W7 | the selects' font at 20 px on a narrow screen | the 390 px fit: 258 to 287 px against 246 |

## Departures from the order

1. **The codec's sentence** says "the vaudio_ ones" where the order says "the others" (above).
2. **The volume sentence** is the owner's, as the order's "owner's answers" section says; W3-10's sentence it
   replaces ("At 1, the game's default, a loud voice fills the whole range, as it does in the game.") was true too.
3. **Fullband Opus's entry has no figures**: "Fullband Opus: not in the game (48 kHz)" measures 288 px, past the box.
4. **`tests/speex102.verify.mjs` is touched** (not in part d's files): its check pinned the old speex option word for
   word, and the order asks for the option to be shortened. The chain strip keeps the module's figures and the
   browser suite checks them there.
5. **Two sentences cover groups of small fields** (the six measures; the custom room's three knobs), each field tied
   to its group's sentence.
6. **The six measures, the steam uptime and low latency have no table row**; their sentences are listed above.

## What is left open

- The order's item 1 asks that a sentence say "whose default it is" where that is not self-evident: done for max gain,
  the gain target, volume and the device; the filters say what is off; the extras say they are not the game's.
- Two controls still have no console command: how long the sender's Steam has run (W3-16 gave it none) and the live
  monitor's low latency. README now says "most controls" have a console name.
