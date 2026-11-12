# W3-04: a file is decoded at its own sample rate

> **Status 2026-11-12: built and merged** at `f32ba0e` (cache v19, pull request #7). Report: `docs/reports/W3-04-native-rate-decode.md`.

**Branch:** `claude/w3-04-native-rate-decode`, from `main`. **Worktree:** given in the brief. **Agent:** `tf-builder`
(effort high), then `tf-reviewer`. May push its branch to run CI. **Time budget:** 3 hours.

## Why

The page decodes a source with `decodeAudioData` on an `AudioContext` made with no sample rate (`app/source.js`,
`loadSourceFromArrayBuffer`; `app/realtake.js` does the same for a take). The browser then resamples the file to the
audio device's rate. So the same file gives different samples on a machine whose device runs at 44.1 kHz and one at
48 kHz, and a 44.1 kHz file on a 48 kHz device has been resampled once by the browser before the model's own
capture resampler sees it. The project's promise is that the same file and settings give the same render
(CLAUDE.md, "Deterministic"), and its aim is an exact recreation, so the model should start from the file's own
samples.

`decodeAudioData` resamples to the rate of the context it is called on, so an `OfflineAudioContext` made at the
file's rate decodes without resampling. The file's rate has to be known first.

## Files

May touch: `app/source.js`, `app/realtake.js`, `app/core.js` (a constant if needed), a new small script for reading
a file's sample rate (add it to `index.html` and to `sw.js`'s asset list, and raise the cache version), the batch
path if it decodes separately, `tests/browser.verify.js`, a Node test for the rate reader wired into `package.json`,
`README.md` (the sentence on sample rates, and the Tests list).

May not touch: `audio.js`, `constants.js`, `opus-codec.mjs`, `reference.js`, `meter.js`, `video.js`'s remux,
`tests/accuracy.mjs`, `docs/PROGRESS.json`.

## Spec

1. **Read the file's own rate** from its header, for the formats the page accepts: WAV (including WAVE_FORMAT_EXTENSIBLE
   and RF64 if the page takes them today), FLAC, MP3 (MPEG-1, 2 and 2.5 frame headers, after any ID3v2 tag), Ogg
   Vorbis, Ogg Opus (decodes at 48 kHz whatever its input rate field says: check what Chromium and Firefox give),
   AAC in MP4/M4A/MOV and Opus or Vorbis in WebM as far as `video.js`'s parser already reads them (reuse it; do not
   write a second MP4 parser). HE-AAC signals half its output rate in some headers: decide from what the browser
   actually returns, and say what you did.
2. **Decode at that rate**: an `OfflineAudioContext(channels, 1, rate)` and its `decodeAudioData`. If the rate cannot
   be read, is outside what `OfflineAudioContext` accepts (the standard guarantees 8,000 to 96,000 Hz; browsers
   take more), or the decode at that rate fails, fall back to today's path and say so in the console line, so a
   file never stops loading because of this change.
3. **Check it is the file's own samples.** For a 16-bit WAV at 44.1 kHz and at 22.05 kHz, the decoded samples equal
   the file's samples exactly (the suite's context must be told to run its device at 48 kHz, or the check proves
   nothing: say how you made the device rate differ from the file's). For a FLAC likewise. For MP3 and AAC, the
   decoded length and rate match the file's.
4. **What the page says**: the status line already shows the source's rate; it now shows the file's. A take loaded
   for comparison (`app/realtake.js`) is decoded the same way.
5. **Everything downstream keeps working at any source rate** the page can now meet: 8, 11.025, 16, 22.05, 32, 44.1,
   48, 88.2 and 96 kHz. Render one short source at each through the default preset in the browser suite and check
   the render's length, rate and that it is not silent. The engine is said to accept any source rate
   (`tests/verify.js` has cases); if a rate breaks something in `audio.js`, stop and report it, do not patch
   `audio.js`.
6. **The limits** (`MAX_AUDIO_SECONDS`, the byte limits) are unchanged.

## Done means

- The checks of points 3 and 5 are in the suites and each fails when the code it covers is broken (say how you
  broke it and what failed): at least, decoding on the device-rate context again; the rate reader returning a wrong
  rate for one format; the fallback removed.
- `pnpm test` and the browser suite pass; CI passes on the pushed branch.
- The accuracy suite's figures do not move. It decodes with its own 48 kHz context, so it should not see this
  change at all: run `flock /tmp/tf2ve-heavy.lock env CHROMIUM_EXECUTABLE=... node tests/accuracy.mjs --takes
  /home/user/tf2-voice-takes --only take4_my_own_speech,sender_A,music_river --json <scratch>/after.json` before and
  after and show the three rows are identical. The takes folder is private: read-only, nothing from it in the
  repository, no file names of its music in the report beyond the take names above.
- The report says, for each format, how the rate is read and what was not handled.
