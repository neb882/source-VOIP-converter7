# The tests

For a contributor: what each suite proves, how long it runs, which tools need the owner's recordings, and how the
bundled codecs are rebuilt. The evidence the model rests on is in [REFERENCE_2026.md](REFERENCE_2026.md); these
suites prove that the code does what that record and the work orders say, not that the record is right.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm test                 # the Node suites, in the order of the table below
pnpm test:vendor          # the bundled codec builds against their recorded hashes
pnpm exec playwright install chromium
pnpm test:browser         # the page itself in headless Chromium
pnpm test:all             # all three, as CI runs them
```

Node 22 or later and pnpm 10.13.1. Each suite also runs on its own (`node tests/<suite>`), and it is quicker to run
the one a change touches first. Several suites take `TF2_DIR=<folder>` to test a copy of the sources, which is how a
check is shown to fail when the code it covers is broken.

CI runs on GitHub's runner, whose speed differs from run to run by as much as a change to the suites does. At
`ce55fa7` (W4-01b merged) `pnpm test` took 17 min 34 s and the browser suite 3 min 43 s, measured. S3-01a loads the
engine in each suite's own realm: at `131a319` `pnpm test` took 13 min 51 s on one run and 8 min 5 s on another, and
the browser suite 4 min 8 s; the suites S3-01a did not touch took 112 s and 63 s of those two runs, and 93 s of the
run at `ce55fa7`. On a four-core machine shared with other jobs, `pnpm test` took 20 min 56 s before S3-01a and
14 min 23 s after it, measured. The workflow's limit is 45 minutes (it was 30 until one run was cut there with every
check so far passed). A commit is tested once, on its push; a push that changes nothing outside `docs/` runs nothing
(`.github/workflows/test.yml`).

## The suites

In the order `pnpm test` runs them. Times are CI's at `131a319`, on the slower of its two runs.

| Suite | What it proves | Time on CI |
| --- | --- | --- |
| `harness.verify.mjs` | The tests' one engine loader (`tests/lib/engine.cjs`): its list of the engine's files is the page's and both workers', in order, and its tables are `constants.js`'s. No other suite names `audio.js` or `constants.js` in a quoted string; a name built from parts, or a suite that runs `engineSource()` in a context of its own, gets past that check. Each load has its own codec module, which the next render takes once it is set; a load without the room module stops a render with a room as the page would; an engine file that uses `Buffer` at its top level does not load. | under 1 s |
| `verify.js` | The engine as a whole under Node: the resamplers, the capture filter, the receiver's gain law, the frame gate, stereo capture, each profile's codec modes, the room presets, loss and jitter on the frame path, and robustness to odd options. On the frame path: each streaming stage equal to its offline counterpart. | 9 s |
| `steam.verify.js` | The `steam` profile, Steam's sender and decoder, in sections moved from `verify.js` with their labels: the render's sender, gate and decoder ([5c]); loss by whole messages against a reference built from the sender, the codec and the resampler ([5d]); and the live chain equal to the render sample for sample ([10b], `steam`). | 2 min 18 s |
| `gain.verify.mjs` | The receiver's gain is the engine's rule, against a transcription written apart from `audio.js`, whole and in pieces, on the decoder's stream of the engine codecs, through the gate's silences and in the live chain. | 10 s |
| `gain-exact.mjs --synthetic` | The tool that compares the gain with the game's decoded voice, run on two files it makes itself: it finds no difference where there is none and one where one sample is changed. | 6 s, with the next |
| `opus.verify.mjs` | The codec round trips: frame timing, lengths, bitrates, packet sizes, modes, concealment, DTX, the per-frame log behind the codec lane; and that the libopus 1.1.5 and CELT 0.11 builds give the packets recorded from native builds of the same sources. | (above) |
| `speex102.verify.mjs` | The Speex 1.0.2 module equals a native build of the same sources, bit for bit; its settings as read from the game's module; the `speex` profile and its live chain. | 4 s |
| `vr12.verify.mjs` | The VR12 codec of `vaudio_miles` (not in TF2) against vectors made by running the game's own plug-in in a CPU emulator on signals of our own, and against a native build. | 1 s |
| `miles.verify.mjs` | The `miles` profile (not in TF2) against the vendored module driven by the test as the engines of 2006 and 2007 drive it; its live chain. Also reads the documents (below). | 12 s |
| `reference.verify.mjs` | `reference.js`: finding a source in a take, clock drift, polarity, fractional delay, the comparison measures, and the page's real-take check on a take made from a render. | 19 s |
| `formats.verify.mjs` | FLAC decodes to the WAV's samples; the MP3 module matches its documented build and a native LAME byte for byte; ZIP archives. | 1 s |
| `filerate.verify.mjs` | A file's own sample rate read from its header, for every format the page reads. | under 1 s |
| `meter.verify.mjs` | The meter against ITU-R BS.1770-4 and EBU Tech 3342, and the meter taken a piece at a time against the whole. | 18 s |
| `video.verify.mjs` | The video remux on the fixtures in `tests/video/`: every picture sample comes out as it went in, and the new audio starts where the old did. | under 1 s |
| `demo.verify.mjs` | The demo reader on a synthetic SourceTV demo written bit by bit (`tests/demo/synthetic.dem`). | 1 s |
| `render-stream.verify.mjs` | A render made a piece at a time (`createRender`) against the whole render (`process`), and `process`'s renders against hashes recorded before, so a change that moves a render shows. | 4 min 38 s |
| `stages.verify.mjs` | The stages a render keeps (`opts.stages`, W4-01b) give the samples a render from the start gives. Every recorded render of `render-stream.verify.mjs` is made again from stages first used for other settings of the same source and gives its recorded hashes. Each option `process()` reads, changed alone with warm stages, gives a fresh render's hashes, starting from the stage the two lists in `audio.js` say. A render reads its options once, when it starts, and the keys hold each option as the stages use it: a change made while a render runs, or two values the engine reads differently, never gives a kept stage to the wrong render. The keys keep apart what JSON would make equal; options that decide or watch an early stage keep nothing; a stages object that cannot keep renders from the start; nothing kept is written to. And the first 14 s of a render of a source's first 15 s are the whole render's, for each profile and each setting the page allows them with. | 3 min 50 s |
| `output-stage.verify.mjs` | The mixer and the output stage against the engine's read: the entry at 255/256, the upsampler, the clip, `volume`, the device's rate, the file's bytes; and the live chain equal to a render after its mix point. | 8 s |
| `voice-channel.verify.mjs` | The receiver's voice channel (`voice-channel.js`, not in a render yet) against the rule read from the engine, and a replay of a console log in the game's format. | 1 min 3 s |
| `steam-sender.verify.mjs` | Steam's sender against the orders' text and a second model written with plain arrays: the clock, the float hold, the gate, the pre-roll. | 12 s |
| `swresample.verify.mjs` | The port of FFmpeg's resampler against hashes the native library made, on each of its kernels. | 5 s |
| `room-dsp.verify.mjs` | The rooms as the engine does them, against a reference model's recorded outputs (`tests/roomdsp/`). | 12 s |
| `browser.verify.js` (`pnpm test:browser`) | The page in Chromium: the journey from a file to a download, every view and control, the live monitor with a fake microphone, video, demos, the batch, the real-take check, the file-rate matrix, the service worker, keyboard and screen-reader use, and the phone layout. Since W4-01b also the kept worker: one worker for the page's jobs, Cancel, a worker that does not answer replaced, the meter after the result, the source sent once, a re-render's speed and WAV, the first seconds of a long source, and the batch's own workers. | 4 min 8 s |

The three long suites, `render-stream.verify.mjs`, `stages.verify.mjs` and `steam.verify.js`, take about four fifths of the time.

**How the suites load the engine.** `tests/lib/engine.cjs` holds the one list of the engine's files
(`constants.js`, `steam-sender.js`, `vendor/swresample/swresample.js`, `room-presets.js`, `room-dsp.js`,
`audio.js`, the page's order) and loads them as one function in the suite's own realm: `loadEngine({ root, codec })`
returns `TF2Audio` as `audio`, every table of `constants.js`, and `codec`, the module the engine sees as `TF2Opus`,
which a suite may set between renders. The room module and its table are handed in by name, so a suite can wrap or
withhold them. Node's own globals (`Buffer`, `process` and the rest) are undefined by name inside the engine: an engine
file that uses one at its top level fails at the load, and one that uses it inside a function fails when that function
is called. A use behind a `typeof` guard takes the browser's branch without a failure, and one through `globalThis`
(`globalThis.process`, `globalThis.Buffer`) is not caught. `harness.verify.mjs` holds the list to `index.html` and both
workers and fails on a suite that names `audio.js` or `constants.js` in a quoted string: a file added to the engine is
added to that list and nowhere else in the tests.
`tests/lib/signals.cjs` holds the six signals and measures that `verify.js` and `steam.verify.js` share.

**Suites that read documents.** `miles.verify.mjs` checks that `README.md`, `tests/LEGACY_CODECS.md`,
`tests/REFERENCE_2026.md` and `vendor/voxware-vr12/README.md` each contain the sentence "It has not been checked
against any recording of a running engine.", and that the README has a section headed `## Accuracy` that names
neither `miles`, `vr12` nor `voxware`. An edit to those documents is checked with `node tests/miles.verify.mjs`.

## Tools that need the owner's recordings

These are outside CI. The recordings, demos and logs they read are not in this repository and never go into it
(CLAUDE.md, the hard rules). Each tool prints numbers only.

| Tool | What it does |
| --- | --- |
| `pnpm accuracy --takes <folder>` (`tests/accuracy.mjs`) | renders the source of each take in `tests/accuracy.takes.json` with the settings it was recorded with, in headless Chromium, lines the take up as the page does and compares them; `--json <file>` writes each talk spurt's timing. `--score-predictions` scores new takes against `tests/predictions/predictions.json`. |
| `node tests/retiming.mjs --accuracy <json>` | tests what decides which talk spurts start early, from the accuracy suite's JSON, optionally with a demo (`--demo`). |
| `node tests/gain-exact.mjs --takes <folder>` | the receiver's gain against the game's decoded voice of Set H. |
| `pnpm compare:reference <recording> <source> [...]` (`tests/reference.compare.mjs`) | finds each source in a recording, corrects its clock and delay, renders it, and compares spectra, the clipping signature and level tracking. |
| `pnpm analyze:reference <recording.mp3> [<url>]` (`tests/reference.analyze.mjs`) | screens a recording mixed with game audio; the optional second argument is a link to where it came from, kept in the output, for example `https://example.com/the-recording`. |
| `pnpm demo:extract <demo.dem>` (`tests/demovoice/extract.mjs`) | a demo's voice per speaker, decoded with the bundled codecs, into `tests/demovoice/out/`, which git ignores ([demovoice/README.md](demovoice/README.md)). |
| `node tests/voice-channel.verify.mjs --fixture <file>` | replays a fixture made from a real console log; such fixtures stay private. |

The synthetic signals the owner records are rebuilt bit for bit by [testsignal/](testsignal/README.md)
(`make_testsignal.py`, `make_nettest.py`, `make_lowtone.py`; numpy and scipy). How the owner runs a take is in
[docs/owner-runs.md](../docs/owner-runs.md). The private repository that holds the takes is attached to a session
as `docs/PROGRESS.json`, `takes`, says.

## Rebuilding the bundled codecs

Each build needs git, clang with the wasm32 target and wasm-ld, and writes the module into `vendor/`. Each clones its
sources at the pinned commit (or takes a checkout and stops if its commit differs); LAME takes the release tarball,
checked by its SHA-256 (curl and tar too), and VR12 the vendored files with musl cloned. A build must match its recorded
hash; changing one is an order of its own (CLAUDE.md).

| Codec | Command | Checked by |
| --- | --- | --- |
| libopus 1.1.5 (both Steam profiles) | `pnpm build:opus11` | `pnpm test:vendor`; `opus.verify.mjs` against packets recorded from a native build of the release; `tests/libopus11/native.mjs` compares its 16-bit decoder with a native build |
| CELT 0.11 (`vaudio_celt`, `vaudio_celt_high`) | `pnpm build:celt` | `pnpm test:vendor`; `opus.verify.mjs` against hashes recorded from a native build (`node tests/celt011/build.mjs --native`) |
| Speex 1.0.2 (`vaudio_speex`) | `node tests/speex102/build.mjs` (no `package.json` script) | `pnpm test:vendor`; `tests/speex102/native.mjs` builds the same sources natively |
| VR12 (`vaudio_miles`, not in TF2) | `node tests/vr12/build.mjs` (no `package.json` script) | `pnpm test:vendor`; `tests/vr12/native.mjs`, and `tests/vr12/mutations.mjs` for the mutation run |
| LAME 3.100 (MP3 downloads) | `pnpm build:lame` | `formats.verify.mjs` (its hash, and a native build byte for byte) |
| libopus 1.6.1 (a video's audio track) | `pnpm vendor:opus` copies the npm package's runtime and notices | `pnpm test:vendor`, against the installed package |
| FFmpeg's resampler (Steam's decoder) | none: `vendor/swresample/swresample.js` is its own source; `tests/swresample/bank.mjs` computes its filter bank | `swresample.verify.mjs`; `tests/swresample/native.mjs` makes the reference hashes where the native library is installed |

Each folder's README in `vendor/` says where the code comes from, at which commit, under which licence, and what
of ours was added.

## A browser other than Playwright's

`CHROMIUM_EXECUTABLE=<path> node tests/browser.verify.js` runs the browser suite on a Chromium that is already
installed, for a machine whose Chromium is not the build Playwright pins. `tests/accuracy.mjs` reads the same
variable. Elsewhere `pnpm test:browser` is enough.

## Heavy jobs on a shared machine

The browser suite, a codec build and `pnpm test` run one at a time: `flock /tmp/tf2ve-heavy.lock <command>`. The
browser suite times a live microphone chain, and two heavy jobs at once on four cores make it flaky
([docs/PIPELINE.md](../docs/PIPELINE.md), "Long runs").
