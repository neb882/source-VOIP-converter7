# W3-04: a file is decoded at its own sample rate (report)

Branch `claude/w3-04-native-rate-decode`, from `main` at `6cd299f`.

## What changed

- **`filerate.js` (new).** `TF2FileRate.read(bytes)` reads a file's own sample rate from its header and returns
  `{ rate, format, note }`, or `null` when it cannot. `TF2FileRate.decode(arrayBuffer, { deviceContext, again })`
  decodes on `new OfflineAudioContext(1, 1, rate)` at that rate. It falls back to the device's `AudioContext`, as
  before, when the rate cannot be read, when the context refuses the rate, or when the decode there fails, and it
  says which. `decodeAudioData` takes its buffer over, so the second try either gets the bytes again from
  `again()` (the page passes `() => file.arrayBuffer()`, so no copy is held) or uses a copy made before the first try.
- **`app/source.js`.** `deviceDecodeContext()` and `decodeAtFileRate(data, name, again)` wrap the decode. A fallback
  writes a console line: `decodeAudioData: "<name>" was decoded at the audio device's rate, <rate> Hz, because <why>.`
  A native decode with a note (Opus, AAC with possible SBR) writes a `sys` line. The status line already showed
  `state.decodedSource.sampleRate`, which is now the file's rate.
- **`app/realtake.js`** (the take for comparison) and **`batch.js`** (each queued file) decode the same way. A batch
  item now records `sourceRate`, which the test reads.
- **`app/core.js`**: the `decodeCtx` comment. **`index.html`**: `filerate.js` after `video.js`. **`sw.js`**:
  `./filerate.js` in the asset list, cache `v18` raised to `v19`.
- **`tests/filerate.verify.mjs`** (new, in `pnpm test`) and **`tests/filerate/`**: nine half-second 440 Hz tones made
  with ffmpeg 6.1, 1.5 to 5.3 KB each and 30 KB in all. Their commands are in the test's header.
- **`tests/browser.verify.js`**: Browser 5 rewritten for the new behaviour, and a new section, Browser 7.
- **`README.md`**: the sentence on sample rates, the Tests list and the files table.

Not touched: `audio.js`, `constants.js`, `opus-codec.mjs`, `reference.js`, `meter.js`, `video.js`,
`tests/accuracy.mjs`, `docs/PROGRESS.json`. The limits (`MAX_AUDIO_SECONDS`, the byte limits) are unchanged.

## What the browser does (measured in Chromium 153, the preinstalled build the suite ran on)

- **Range.** `OfflineAudioContext` takes 3,000 to 768,000 Hz: 2,999 and 768,001 throw `NotSupportedError`.
  `decodeAudioData` on the device context would not load a 2 kHz WAV either, so in Chromium no real file reaches the
  "rate refused" fallback. The test simulates a browser that takes only the standard's 8 to 96 kHz.
- **WAV at the file's rate is untouched.** Decoded on an `OfflineAudioContext` at the WAV's rate, each sample is the
  file's 16-bit value `k`, but Chromium maps `k` to `k / 32768` below zero and to `k / 32767` above it. Scaled back
  that way, all 11,025 samples of a test tone came within 0.00025 of `k`. So the test does not compare with
  `k / 32768`. It checks that every decoded sample scales back to the file's `k` within 0.001, which a resampled
  signal cannot do. On the device context (forced to 48 kHz) the same file comes back at 48 kHz with
  non-integer values.
- **Opus** (Ogg and WebM) decoded at the 16,000 Hz its OpusHead names comes back at 16 kHz, so Chromium resamples
  its 48 kHz output. The reader therefore always gives 48 kHz for Opus. In the browser suite an Ogg Opus file made
  from 16 kHz decodes at 48 kHz, 24,000 samples for half a second.
- **Lengths at the file's rate:** MP3 with a LAME tag (MPEG-1, 2 and 2.5) and AAC in M4A come out exact to the sample
  (the LAME tag and the edit list are applied). Ogg Vorbis comes out 273 samples short at 22.05 kHz, and ADTS
  keeps the encoder's priming and padding.
- **AAC and HE-AAC.** No HE-AAC encoder could be had here: Ubuntu's `fdkaac` is built without SBR ("unsupported
  profile"), and ffmpeg's own AAC encoder is LC only. So what Chromium returns for HE-AAC was **not measured**. What
  was decided:
  - an AudioSpecificConfig of object type 5 or 29, or with the backward-compatible SBR extension, gives the SBR
    (output) rate
  - the extension with "no SBR" gives the core rate. ffmpeg's encoder writes this, so its 22.05 kHz M4A reads as
    22.05 kHz.
  - otherwise a core of 24 kHz or less is ambiguous, since it may be implicit HE-AAC. ADTS can only be this. It is
    decoded at twice the core rate, because FFmpeg (and so Chromium) outputs implicit HE-AAC at twice the core.
    The cost of being wrong differs by direction: a plain AAC-LC file at that rate is upsampled by the browser, as
    every file was before, and loses nothing, while the opposite choice would halve an HE-AAC file's band. The
    console line says so.
- Not checked in **Firefox or Safari**: their `OfflineAudioContext` range, whether their decode at the file's rate
  is untouched, what they return for Opus and HE-AAC. Safari decodes AIFF, which Chromium does not; the reader
  handles AIFF, checked in Node only.

## Each format: how the rate is read, and what is not handled

| Format | How | Not handled |
|---|---|---|
| WAV (PCM, float, WAVE_FORMAT_EXTENSIBLE), RF64, BW64 | the `fmt ` chunk's rate field, walking the chunks from byte 12 | RIFX (big-endian) gives no rate, so the device rate is used |
| AIFF, AIFF-C | the COMM chunk's 80-bit rate | Chromium does not decode AIFF; checked in Node only |
| FLAC (also after ID3v2) | STREAMINFO's 20-bit rate | none known |
| MP3 / MPEG audio (1, 2, 2.5; layers I to III), after ID3v2 tags | the first frame header in the first 64 KB that two more frames of the same version, layer and rate follow (or the file ends) | free-format bitrate frames give no rate |
| AAC in ADTS | the frame header, checked the same way; rules above for 24 kHz or less | LATM/LOAS, ADIF |
| Ogg Vorbis / Opus / FLAC | the first packet: Vorbis identification header; Opus always 48 kHz; Ogg FLAC's STREAMINFO | Speex and other Ogg codecs, and an Ogg file whose first stream is not audio |
| MP4, M4A, MOV | `TF2Video.parse` (video.js) finds the first sound track. Then its sample entry: `mp4a` by the esds AudioSpecificConfig (MP3 in MP4 by the entry's rate), `Opus` at 48 kHz, `fLaC` by the dfLa STREAMINFO, PCM types and ALAC by the entry's rate field (16.16, or the float64 of a version 2 sound description; the track's timescale when the field is 0) | Other codecs in MP4. A file whose first sound track is not the one the browser decodes. |
| WebM, Matroska | not read: video.js does not parse them, and the order said to reuse it. Decoded at the device rate, with the console line. | A short scan for `A_OPUS` (always 48 kHz) or Vorbis's identification header would cover most WebM files, if wanted. |

## The checks

`pnpm test`: all suites pass, including the new `tests/filerate.verify.mjs` (51 checks). Last lines:

    51 file-rate checks passed
    50 passed, 0 failed
    45 video checks passed
    31 demo checks passed

Browser suite (`flock /tmp/tf2ve-heavy.lock env CHROMIUM_EXECUTABLE=... node tests/browser.verify.js`): 207 checks
pass. Last lines:

      ok    a batch file is decoded at its own rate   [[{"rate":22050,"error":null}]]
      ok    files decoded at their own rate: no page errors
    207 browser checks passed

How the device rate was made to differ from the file's: each `AudioContext` the page makes is made with
`sampleRate` forced by an init script, the method Browser 5 already used, and the test checks that a new
`AudioContext` on the page reports that rate. Browser 7 runs its device at 48 kHz and loads no file at 48 kHz.
Browser 5 runs it at 44.1 and at 48 kHz, and its Opus check runs on the 44.1 kHz device.

What the new checks cover:

- Browser 5: a 44.1 or 48 kHz file keeps its own rate on a 44.1 and on a 48 kHz device and renders as before. On the
  44.1 kHz device an Ogg Opus decodes at 48 kHz, and a WebM loads at 44.1 kHz with the console line.
- Browser 7: 16-bit WAV and FLAC (made by flac.js from the same samples) at 44.1 and 22.05 kHz decode to the file's
  own samples, and the status line shows the rate. MP3 at 44.1, 22.05 and 11.025 kHz, M4A at 44.1 and 22.05 kHz,
  Ogg Vorbis at 22.05 kHz and ADTS (at 44.1 kHz) decode to their rate and length. A rate the context refuses and a
  failed decode both still load the file, at the device rate, with the console line; the second reads the bytes
  again. A 0.5 s tone at each of 8, 11.025, 16, 22.05, 32, 44.1, 48, 88.2 and 96 kHz renders through the Modern
  preset: the render is at max(44.1 kHz, source rate), has `round(length × out / in)` frames, has rms 0.39, and its
  pitch is 440.0 Hz. None of these rates broke anything in `audio.js`. A 22.05 kHz take decodes to its own samples
  and is lined up at 22.05 kHz. A batch file at 22.05 kHz records `sourceRate` 22050.

Each check broken (the Node suite and a copy of the browser suite that ran only Browsers 5 and 7, then restored with
`git checkout`):

| Break | Node suite | Browser |
|---|---|---|
| `app/source.js` decodes on the device context again | passes (filerate.js untouched) | fails: "48000 Hz file -> 44100 Hz browser: ... decoded at its own rate (44100 Hz)" |
| `decode()` never tries the file's rate | fails: "a readable rate is decoded on an OfflineAudioContext at that rate" | fails, same check |
| `app/realtake.js` on the device context | passes | fails: "a 22.05 kHz take decodes to exactly its own samples ... (48000 Hz)" |
| `batch.js` on the device context | passes | fails: "a batch file is decoded at its own rate ([{"rate":48000,...}])" |
| reader: MPEG-2 rate read as MPEG-1's | fails: "MPEG version 2 rate index 0: null" | fails: "tone_22050.mp3 decodes at 22050 Hz to its length (44100 Hz, 22050 samples)" |
| reader: Opus at OpusHead's input rate | fails: "Ogg Opus decodes at 48 kHz whatever its input rate field says" | fails: "... decodes at 48 kHz on a 44.1 kHz device (16000 Hz, 8000 samples)" |
| reader: ADTS without the SBR doubling | fails: "ADTS AAC-LC with a core of 24 kHz or less is decoded at twice it" | fails: "tone_22050.aac decodes at 44100 Hz to its length (22050 Hz, 12288 samples)" |
| fallback removed (`decode()` throws instead) | fails (the first fallback check throws) | fails: the WebM never loads (timeout) |

## Accuracy suite

`flock /tmp/tf2ve-heavy.lock env CHROMIUM_EXECUTABLE=... node tests/accuracy.mjs --takes <takes> --only
take4_my_own_speech,sender_A,music_river --json <scratch>/{before,after}.json`. "Before" ran on `6cd299f` before
any change, "after" on the branch's final code.

The three rows are the same before and after: a `diff` of them prints nothing. The two JSON files differ only in
`seconds.work`, which is each take's run time. The rows:

    Take                 Set Spurts Segs Delay, s (min…max)  Trims Other Clock ppm r    Level rms/worst dB r     Worst band 80 Hz–12 kHz Clip % take/sim Level, sim − take
    take4_my_own_speech  B   10     21   1.943…2.286         2     18    +409      0.88 0.96 / 8.3        0.987 -0.2 dB at 10000-11000  7.0 / 7.4       +0.1 dB
    sender_A             D   17     23   1.560…1.897         1     22    +406      0.77 0.15 / 0.6        0.996 +2.3 dB at 11000-12000  7.6 / 9.6       +0.2 dB
    music_river          A   1      3    -51.984…-51.959     0     2     +408      0.85 0.10 / 0.5        0.993 -0.4 dB at 10000-11000  13.7 / 16.2     +0.1 dB

As the order expected, the suite does not see this change: it decodes with its own 48 kHz `OfflineAudioContext`.

## Not done, or uncertain

- HE-AAC is not measured (no encoder available here); the rule above is reasoned from how FFmpeg decodes implicit
  SBR, not seen in a browser.
- WebM and Matroska still decode at the device rate (see the table).
- Firefox and Safari were not run.
- The CI run uses Playwright's own Chromium, not the preinstalled 153 build. Whether it decodes AAC there is seen
  in the CI result below.

CI_RESULT
