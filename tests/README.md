# The tests

For a contributor: what each suite proves, how long it runs, which tools need the owner's recordings, and how the
bundled codecs are rebuilt. The evidence the model rests on is in [REFERENCE_2026.md](REFERENCE_2026.md); these
suites prove that the code does what that record and the work orders say, not that the record is right.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm test                 # every suite but the browser's, in the order of the table below
pnpm test verify steam    # suites by name; a group's name runs its suites (units, engine, render, stages, browser)
pnpm test:vendor          # the bundled codec builds against their recorded hashes (pnpm test runs it too)
pnpm exec playwright install chromium
pnpm test:browser         # the page itself in headless Chromium
pnpm test:all             # everything, the browser suite last
node tests/run.mjs --jobs 3   # the Node suites three at a time: a heavy job
```

Node 22 or later and pnpm 10.13.1. Every command above is `tests/run.mjs`, the runner, which holds the one table of
the suites and their groups. It runs every suite it is asked for, whatever the earlier ones did, each as its own Node
process with the runner's environment. After each suite it prints one line (its name, passed or FAILED with the exit
code, its seconds), and at the end a table of all of them, each failed suite's `FAIL` lines and last 15 lines again,
and the seconds summed and the wall time. A suite fails if it exits other than 0, or if it exits 0 having printed a
failed check (a line that starts with `FAIL`) or nothing at all. It exits 1 if a suite failed. A name it does not know is an error that
lists the names (`node tests/run.mjs nosuch`). One at a time, a suite's output goes straight through; with `--jobs N`
each suite's output is printed whole when it ends. The browser suite always runs alone, after the others. Each suite
also runs on its own (`node tests/<suite>`), and it is quicker to run the one a change touches first. Several suites
take `TF2_DIR=<folder>` to test a copy of the sources, which is how a check is shown to fail when the code it covers
is broken.

CI (`.github/workflows/test.yml`) runs the runner's five groups as five jobs side by side, `units`, `engine`,
`render`, `stages` and `browser`, each allowed 20 minutes, and a sixth, `verify`, which succeeds only if all five did:
`verify` is the run's one result. A failing group does not stop the others, and its log ends with the runner's table.
On three runs of one commit (2026-11-12, measured) a push had its result 4 min 59 s to 5 min 4 s later; each job
took, from its start to its end: `units` 1 min 47 s to 3 min 5 s, `engine` 1 min 38 s to 2 min 38 s, `render`
3 min 1 s to 4 min 51 s, `stages` 2 min 36 s to 4 min 1 s, `browser` (with installing Chromium) 4 min 28 s to
4 min 53 s, `verify` 3 s. In one job, as before, the same suites took 18 min 38 s at `5eb232a`. GitHub's
runners differ from run to run by as much as a change to the suites does, and the five jobs of one run land on
runners of different speeds: compare runs, not code. On a four-core machine shared with other jobs, `pnpm test`
took 14 min 36 s, measured. On a push to `main`, `units` also runs `tests/cache-number.mjs` against the commit `main`
was at before the push (below). A commit is tested once, on its push; a push that changes nothing outside `docs/` runs
nothing.

## The suites

In the order of the runner's table (`tests/run.mjs`), with each suite's name and group there; `pnpm test` runs every
group but `browser`. Times are CI's, each the slowest of the three runs above (measured; the runner prints each suite's
seconds).

| Suite | Name, group | What it proves | Time on CI |
| --- | --- | --- | --- |
| `harness.verify.mjs` | `harness`, units | The tests' one engine loader (`tests/lib/engine.cjs`): its list of the engine's files is the page's and both workers', in order, none of the three names an engine file a second time anywhere (comments taken out, either quote, each name taken as the address a browser asks for), and its tables are `constants.js`'s. No other suite names `audio.js` or `constants.js` in a quoted string; a name built from parts, or a suite that runs `engineSource()` in a context of its own, gets past that check. Each load has its own codec module, which the next render takes once it is set; a load without the room module stops a render with a room as the page would; an engine file that uses `Buffer` at its top level does not load. And the engine's own files under `engine/` (S3-02): `TF2Audio` keeps its recorded members in their order (S3-02b took off one that nothing read); each file is one function that adds its own part to `TF2Engine` and nothing at its top level; every name a file takes from a part is there and comes from an earlier file, under its own name (a head that renames, gives a default or nests fails, and so does any other pattern that takes from a part); a load has one frozen part for each file, and the folder holds exactly those files; the files load nothing; two loads have parts of their own and leave none on Node's global object; no suite names a file of `engine/` in a quoted string. These read the files' text; none parses them. | under 1 s |
| `site.verify.mjs` | `site`, units | The files the site keeps offline: `sw.js`'s `ASSETS` is exactly the list derived from the shipped files' own text, every loading form in them is one its rules read or a listed allowance, and the generated libopus bundle it does not read has its pinned hash. Also the workflow's jobs against the runner's groups, and every `tests/*.verify.*` file against the runner's table (below, "The files the site keeps offline"). | under 1 s |
| `vendor-opus.mjs --check` | `vendor`, units | The bundled codec builds against their recorded hashes (libopus 1.1.5, CELT 0.11, Speex 1.0.2, VR12), and the vendored libopus 1.6.1 files byte for byte against the pinned package (`pnpm test:vendor`). | under 1 s |
| `gain.verify.mjs` | `gain`, units | The receiver's gain is the engine's rule, against a transcription written apart from `engine/gain.js`, whole and in pieces, on the decoder's stream of the engine codecs, through the gate's silences and in the live chain. | 10 s |
| `gain-exact.mjs --synthetic` | `gain-exact`, units | The tool that compares the gain with the game's decoded voice, run on two files it makes itself: it finds no difference where there is none and one where one sample is changed. | under 1 s |
| `reproduce.verify.mjs` | `reproduce`, units | `tests/reproduce.mjs`, the script of `docs/REPRODUCE.md`, on stand-ins it makes from the generated clips with the repository's own codecs: the clips have the SHA-256 the record gives; `gain`, `celt` and `speex` print "as expected" on their stand-in and "differs" with one sample moved by three steps, on a file of zeros, on one too short or ended early, and on stand-ins shifted by a sample or a packet; `ceiling` on renders of a clamped tone, `clock` on a render that runs the game's voice channel against the default render, and `demo` on a demo the suite writes print "as expected", and "differs" with the tops three steps up, a sample over the ceiling, a take 100 parts in a million faster, a phrase numbered from 7, a frame of another kind, and on input that cannot show the rule; `demo` on `tests/demo/synthetic.dem` prints none of its header's fields or SteamIDs; `queue` on console logs written from the second model of the channel, at 300 and 66.67 frames a second, prints "as expected", and "differs" with a queue line 2 bytes off, a frame rate given too high or too low, a pull line, a second speaker or too few tick lines; `gate` on Steam's console text written from the 24 kHz clip with the built sender's verdicts, copied, with stamps, with line feeds alone and in UTF-16, prints "as expected" alone and with the clip (the walk ending at `mic_inputfile` typed or answered, a one-sample line in the walk and in the place search), and "differs" with a mark, a count, a mean, a peak or a length changed, a line removed, another clip, a place the search cannot settle in 200 lines, or too few lines; the script, `tests/reproduce/` and every file a check loads hold no network module, child process, worker or call to fetch, and no run calls the network, starts a process or a worker; no run prints a marker that stands for a file's path, name or header. And the script on the game's recordings that `recordings/manifest.json` lists (order RP-01, part f): each row's check (`celt`, `celt --high`, `celt --any-rate` with the 11025 Hz clip the suite writes from `recordings/make-inputs.mjs`, `speex`, `speex --maxgain 10`, `inputs --against`) prints "as expected" with the row's own lag, samples compared, samples equal and largest difference; `gain` on each `vaudio_speex` pair of a `voice_maxgain 1` file and the `voice_maxgain 10` file finds no sample differs before the last packet; every sample a row's check does not compare is zero; and on a copy of the folder the suite makes, a file removed, one sample moved by three steps, or one sample its check does not compare made 3, fails. A row whose file is missing fails, and so does a manifest with no rows. | 76 s |
| `recordings.verify.mjs` | `recordings`, units | The files the read findings rest on, and the game's recordings that are published (order RP-01, sections 6 and 7). The table "The files that were read" in `REFERENCE_2026.md`: its status line, ids in order, no empty cell, each SHA-256 64 lowercase hex digits or "not kept" with words, nothing like an address or a listing of bytes, no cell longer than a name, a date, a build line or a hash needs, `pending` only in the orchestrator's columns and only while the status line says so, and each finding's line naming the rows read for it. `recordings/manifest.json`: every row's fields, its name with no date, `sets` only H, I, M and O, its input one of the clips `recordings/make-inputs.mjs` makes, its check with at least 999 samples in 1,000 equal, no hash the record gives for a private file. `recordings/files/`: a row for every file and a file for every row, each its row's SHA-256s and a plain 44-byte header, nothing ignoring the folder. `recordings/inspect.mjs` on WAV files it makes. Each check fails on its break on text and files the suite makes. With no rows and no file it says no recording is published yet. | under 1 s |
| `opus.verify.mjs` | `opus`, units | The codec round trips: frame timing, lengths, bitrates, packet sizes, modes, concealment, DTX, the per-frame log behind the codec lane; and that the libopus 1.1.5 and CELT 0.11 builds give the packets recorded from native builds of the same sources. Steam's decoder for a demo's records (`record()`, W3-02g): the order's worked table, block for block and at 44.1 kHz, against a walk of the library's decoder written in the suite; `receive()`'s samples where nothing differs; an end marker inside a record and behind a cut; a number behind; a frame of length 0; a short frame; the wrap at 65535; the cut changing what follows. | 6 s |
| `speex102.verify.mjs` | `speex102`, units | The Speex 1.0.2 module equals a native build of the same sources, bit for bit; its settings as read from the game's module; the `speex` profile and its live chain. | 4 s |
| `vr12.verify.mjs` | `vr12`, units | The VR12 codec of `vaudio_miles` (not in TF2) against vectors made by running the game's own plug-in in a CPU emulator on signals of our own, and against a native build. | under 1 s |
| `miles.verify.mjs` | `miles`, units | The `miles` profile (not in TF2) against the vendored module driven by the test as the engines of 2006 and 2007 drive it; its live chain. Also reads the documents (below). | 12 s |
| `reference.verify.mjs` | `reference`, units | `reference.js`: finding a source in a take, clock drift, polarity, fractional delay, the comparison measures, and the page's real-take check on a take made from a render. | 19 s |
| `formats.verify.mjs` | `formats`, units | FLAC decodes to the WAV's samples; the MP3 module matches its documented build and a native LAME byte for byte; ZIP archives. | under 1 s |
| `filerate.verify.mjs` | `filerate`, units | A file's own sample rate read from its header, for every format the page reads. | under 1 s |
| `meter.verify.mjs` | `meter`, units | The meter against ITU-R BS.1770-4 and EBU Tech 3342, and the meter taken a piece at a time against the whole. | 18 s |
| `video.verify.mjs` | `video`, units | The video remux on the fixtures in `tests/video/`: every picture sample comes out as it went in, and the new audio starts where the old did. | under 1 s |
| `demo.verify.mjs` | `demo`, units | The demo reader on a synthetic SourceTV demo written bit by bit (`tests/demo/synthetic.dem`). W3-02g: each packet's message, record and rate, a frame cut short by its record, `decode()`'s messages as they came with their places, and `decode()`'s other results against hashes recorded on `main`; the second fixture, `tests/demo/queue.dem`, written by the suite (`--write-fixture`) and read back; `synthetic.dem` on the game's timeline; the extraction tool's `--timeline game`. | 2 s |
| `output-stage.verify.mjs` | `output-stage`, units | The mixer and the output stage against the engine's read: the entry at 255/256, the upsampler, the clip, `volume`, the device's rate, the file's bytes; and the live chain equal to a render after its mix point. | 8 s |
| `voice-channel.verify.mjs` | `voice-channel`, units | The receiver's voice channel (`voice-channel.js`; a render runs it when `opts.timeline` is `'game'`, as the page's render on Steam voice does by default) against the rule read from the engine, and a replay of a console log in the game's format. The timeline with no end that the live chain runs (W3-02c-3a): every return of `push()` and `advance()` that of a whole length over the same calls, `counts()` the whole length's info, an hour of packets kept in no more than a minute's, `createChannel`'s `listDrops`, and the exported `zero`. The zero for a demo's packets (W3-02g): `arrivalZero` against the suite's reading, and `createTimeline`'s `zeroSamples`: the same samples and info as without it at the D it computes, 512 samples later at 512 less, several messages on one tick, with no end, and its refusals. | 1 min 47 s (one run, 2026-11-14) |
| `steam-sender.verify.mjs` | `steam-sender`, units | Steam's sender against the orders' text and a second model written with plain arrays: the clock, the float hold, the gate, the pre-roll. | 12 s |
| `swresample.verify.mjs` | `swresample`, units | The port of FFmpeg's resampler against hashes the native library made, on each of its kernels. | 4 s |
| `room-dsp.verify.mjs` | `room-dsp`, units | The rooms as the engine does them, against a reference model's recorded outputs (`tests/roomdsp/`). | 12 s |
| `verify.js` | `verify`, engine | The engine as a whole under Node: the resamplers, the capture filter, the receiver's gain law, the frame gate, stereo capture, each profile's codec modes, the room presets, loss and jitter on the frame path (jitter on `celt_22`; on Steam voice on the file's own timing jitter changes nothing, BC-4a), and robustness to odd options. On the frame path: each streaming stage equal to its offline counterpart. | 10 s |
| `steam.verify.js` | `steam`, engine | The `steam` profile, Steam's sender and decoder, in sections moved from `verify.js` with their labels: the render's sender, gate and decoder ([5c]); loss by whole messages against a reference built from the sender, the codec and the resampler ([5d]); and the live chain equal to the render sample for sample ([10b], `steam`). Since BC-4a jitter draws no late frame on `steam`; the checks that need late frames take them from the suite's own masks, through the codec module's `makeLossMask` for `process()` and through the stream's per-frame verdict for `createRender` and the live chain. | 2 min 20 s |
| `render-channel.verify.mjs` | `render-channel`, engine | A render on the game's timeline (`opts.timeline` `'game'`, W3-02c-2): its voice and `codecInfo.channel` equal a reference the suite builds from a `'source'` render's messages, codec results and packets and `voice-channel.js` loaded by itself; the logs as sent and as played; one sample dropped from every packet; with the auto-gain off, the value the source's timeline brings to the mix entry; the layouts' early starts and overflows; the gain reset at each open; lost messages through the queue (BC-3) and the fade at its end; `createRender` equal to `process()` and giving out its samples as the source comes; `'game'` refused, never ignored, where it cannot run. The live chain on the game's timeline (W3-02c-3a): at its mix point `createRender`'s samples, held back by D, at the three frame rates, at jitter 0, 50 and 100, with loss, from a 48 kHz microphone, at any plan of blocks, with the gate off, push-to-talk, the receiver's gain off and a room attached; the hold D and no less; the delay it reports; the room's limits fixed at each open of its channel; its refusals; without the option, the samples recorded from `main` before it; the arrival model with no end. Jitter as arrival times (BC-4a): one list (`fakeLagList`) against the closed form of a lone packet's leaving look; the order kept and nothing lost; the arrival ticks (`steamArrivals`) equal to a second model's (`tests/voicequeue/reference-arrivals.mjs`) tick for tick; a pin of the mean delay and the share of messages on one tick against two prototypes' figures; a bunch through `opts.arriveAt`; the stream with jitter, and what it gives out; the file's own timing and the live chain unchanged by jitter; the stage keys; `arriveAt`'s refusals; the seed. A demo's own packets on the game's timeline (W3-02g): `tests/demo/queue.dem` equal to a reference the suite builds by itself (the library's decoder under a walk of each record, the resampler module, the engine's gain reset at each open, `voice-channel.js` with the zero) at three frame rates with the auto-gain on and off; the phrases that open and join; `codecInfo.demo` and the logs; refused and cut messages unheard; the empty packet; two messages on one tick; the silence record's drop; the ticks; the refusals; jitter and loss; the file's own timing against hashes recorded on `main`. | 2 min 11 s (one run, 2026-11-14) |
| `render-stream.verify.mjs` | `render-stream`, render | A render made a piece at a time (`createRender`) against the whole render (`process`), and `process`'s renders against hashes recorded before, so a change that moves a render shows. Since W3-02g it holds two renders of a demo's own packets on the game's timeline. | 4 min 43 s |
| `stages.verify.mjs` | `stages`, stages | The stages a render keeps (`opts.stages`, W4-01b) give the samples a render from the start gives. Every recorded render of `render-stream.verify.mjs` is made again from stages first used for other settings of the same source and gives its recorded hashes. Each option `process()` reads, changed alone with warm stages, gives a fresh render's hashes, starting from the stage the two lists in `engine/render.js` say. A render reads its options once, when it starts, and the keys hold each option as the stages use it: a change made while a render runs, or two values the engine reads differently, never gives a kept stage to the wrong render. The keys keep apart what JSON would make equal; options that decide or watch an early stage keep nothing; a stages object that cannot keep renders from the start; nothing kept is written to. A demo's own packets on the game's timeline keep A and nothing else (W3-02g). And the first 14 s of a render of a source's first 15 s are the whole render's, for each profile and each setting the page allows them with. | 3 min 49 s |
| `browser.verify.js` | `browser`, browser | The page in Chromium: the journey from a file to a download, every view and control, the live monitor with a fake microphone, video, demos, the batch, the real-take check, the file-rate matrix, the service worker (with a server that sends `max-age=600`, as GitHub Pages sends `index.html`, measured on the live site on 2026-11-12 and inferred for the other files: a returning visitor whose tab already holds the scripts and the codec module gets the new page, scripts and module after an update on a navigation, on a reload with the same worker serving, on a reload after the newer worker has taken over, and on a navigation after a load made offline; the newer worker stores the new files), keyboard and screen-reader use, and the phone layout. Since W4-01b also the kept worker: one worker for the page's jobs, Cancel, a worker that does not answer replaced, the meter after the result, the source sent once, a re-render's speed and WAV, the first seconds of a long source, and the batch's own workers. | 4 min 14 s |

The three long suites, `render-stream.verify.mjs`, `stages.verify.mjs` and `steam.verify.js`, take about four fifths of the time.

**How the suites load the engine.** `tests/lib/engine.cjs` holds the one list of the engine's files
(`constants.js`, `steam-sender.js`, `voice-channel.js`, `vendor/swresample/swresample.js`, `room-presets.js`, `room-dsp.js`, the ten
files of `engine/`, `audio.js`, the page's order) and loads them as one function in the suite's own realm: `loadEngine({ root, codec })`
returns `TF2Audio` as `audio`, every table of `constants.js`, and `codec`, the module the engine sees as `TF2Opus`,
which a suite may set between renders. It also returns `parts`, the load's `TF2Engine`: the engine's own files find
one another through it, one frozen part a file, so a suite can call a function that is not a member of `TF2Audio`
once its part gives it, and cannot replace one, since every caller took its functions at the load. To break one
internal function, copy the files of `ENGINE_FILES` to a temporary folder, change one line in the engine file, and
load the copy with `root` (or `TF2_DIR`, in the suites that follow it). The room module and its table are handed in by name, so a suite can wrap or
withhold them. Node's own globals (`Buffer`, `process` and the rest) are undefined by name inside the engine: an engine
file that uses one at its top level fails at the load, and one that uses it inside a function fails when that function
is called. A use behind a `typeof` guard takes the browser's branch without a failure, and one through `globalThis`
(`globalThis.process`, `globalThis.Buffer`) is not caught. `harness.verify.mjs` holds the list to `index.html` and both
workers and fails on a suite that names `audio.js`, `constants.js` or a file of `engine/` in a quoted string: a file
added to the engine is added to that list and nowhere else in the tests.
`tests/lib/signals.cjs` holds the six signals and measures that `verify.js` and `steam.verify.js` share.

**Suites that read documents.** `miles.verify.mjs` checks that the page's note under the codec menu holds its four
sentences word for word, and that `README.md`, `tests/LEGACY_CODECS.md`, `tests/REFERENCE_2026.md`,
`vendor/voxware-vr12/README.md`, `docs/VOICE-PATH.md`, `docs/owner-runs.md` and the comments on `vaudio_miles` (not
in TF2) in `vendor/voxware-vr12/index.mjs`, the profiles' file, `opus-codec.mjs` and the suite's own head each hold
the sentence "Its codec stage was checked against one sitting of a 2006 engine on 2026-11-13; the profile as the app
runs it was not." and not the older one it replaced (W3-22). `tests/REFERENCE_2026.md` keeps the older one only
where its correction mark and the new sentence follow it, and its finding 31 has the 2006 sitting. It also checks
that `docs/owner-runs.md` says what that sitting ran, that `docs/PAGE.md` describes the note as it stands, that the
render's console line for `vaudio_miles` says the same as the note, and that the README has a section headed
`## Accuracy` that names neither `miles`, `vr12` nor `voxware`. An edit to those documents is checked with `node tests/miles.verify.mjs`.

## The files the site keeps offline, and the cache number

`sw.js` keeps a list of files (`ASSETS`) in the browser's cache, so the page works offline, and a number (`CACHE`)
whose rise makes a browser fetch the list again. `site.verify.mjs` derives the list from the shipped files' own text
(`tests/lib/site-files.cjs`): it starts at `index.html` and follows each way a file loads another (a script or link
tag, the manifest's icons, a stylesheet's `url()`, `importScripts`, `new Worker`, `addModule`, `import()`, a static
`import`), and fails on any other line that holds a word that loads something (`fetch(`, an assignment to `.src`,
`require(` and the rest), unless its short list of allowances names that file and statement with what was read
there. Today these are the object URLs of Blobs made on the page, a canvas's data URL for a download, and the
`require` that runs under Node only. An allowance whose statement is gone fails too. The generated libopus bundle is
not read; it is pinned by its SHA-256. The resampler's licence, which the page links, is in the list since S3-02a; the
list of files opened online only (`ONLINE_ONLY`) is empty. Then `ASSETS` must hold exactly the derived files: a failure names each file "needed and not listed"
and each "listed and not needed". A script whose text, once its comments are taken out, no longer parses fails too, so a misread comment
cannot hide a line. A `src` or `href` with a query string or a fragment, `image-set()` in a stylesheet,
`<meta http-equiv="refresh">`, an attribute written twice and a `</script` not followed by `>` are failures as well.
What it does not catch: a load whose URL or property name is built from parts or passed through code it cannot read
(`el['sr' + 'c'] = u`, a helper of the page's own that sets an attribute, `eval`), which only the browser suite's
request check can see, on the paths it walks. The same suite holds the workflow's jobs to the runner's groups (no
`exclude` or `include`, and each job running its own group), every `tests/*.verify.*` file to the runner's table,
and the three other suites (`verify.js`, the vendor check, `gain-exact.mjs --synthetic`) to their exact commands. The browser suite's `[Browser 4b]` takes the same derived list, holds
the tags the browser sees to it, and checks that every request of a first visit and an offline render is for a file
of it.

The worker asks the network for code and markup first, with `cache: 'no-cache'`, and its install fetches the list with
`cache: 'reload'` (S3-02b). GitHub Pages sends `index.html` with `max-age=600` (measured on the live site on
2026-11-12; the other files are inferred to be sent so too), which lets a browser use its own copy for ten minutes
without asking; these two modes make the browser check its copy with the server, so a visit after an update gets the
new files and the newer worker stores them, not the browser's old copies. What the worker hands the page for anything
but a navigation, from the network or from its cache, says `Cache-Control: no-cache`, so the page's own memory cache
asks the worker again instead of giving a script or a module the copy an earlier load of the tab had (a 204 or 205,
and a response reached through a redirect, go out as they are; no file of the site is reached through one).
`[Browser 4c]` holds all of it, with `tests/static-server.js`'s `maxAge` option (its default stays `no-cache`): a
first visit and a second the worker controls, then the site's copy changed and a navigation, a second change and a
reload with the same worker serving, the newer worker's takeover, a third change and a reload, and a load made
offline, a fourth change and a navigation online.

The number is set by the orchestrator in the merge, never on a builder's branch (CLAUDE.md, the hard rules).
`node tests/cache-number.mjs <base>` compares every file in either commit's `ASSETS`, and `sw.js` apart from the
number's line, between `<base>` and the working tree: it says the number stays when none changed, and exits 1 when
some changed and the number did not rise; `--set` then writes the base's number plus one, and `--report` never
fails. A builder puts the line `node tests/cache-number.mjs origin/main --report` prints into the report. CI runs it
on `main` against the commit `main` was at before the push.

## Tools that need the owner's recordings

These are outside CI. The recordings, demos and logs they read are not in this repository and never go into it
(CLAUDE.md, the hard rules), but for the game's recordings that `recordings/manifest.json` lists, which are under
`recordings/files/`: the suite `recordings` holds them to that list in CI, and the suite `reproduce` runs the
script on them in CI. Each tool prints numbers only.

| Tool | What it does |
| --- | --- |
| `pnpm accuracy --takes <folder>` (`tests/accuracy.mjs`) | renders the source of each take in `tests/accuracy.takes.json` with the settings it was recorded with, in headless Chromium, lines the take up as the page does and compares them; `--json <file>` writes each talk spurt's timing. `--score-predictions` scores new takes against `tests/predictions/predictions.json`. |
| `node tests/retiming.mjs --accuracy <json>` | tests what decides which talk spurts start early, from the accuracy suite's JSON, optionally with a demo (`--demo`). |
| `node tests/gain-exact.mjs --takes <folder>` | the receiver's gain against the game's decoded voice of Set H. |
| `pnpm compare:reference <recording> <source> [...]` (`tests/reference.compare.mjs`) | finds each source in a recording, corrects its clock and delay, renders it, and compares spectra, the clipping signature and level tracking. |
| `pnpm analyze:reference <recording.mp3> [<url>]` (`tests/reference.analyze.mjs`) | screens a recording mixed with game audio; the optional second argument is a link to where it came from, kept in the output, for example `https://example.com/the-recording`. |
| `pnpm demo:extract <demo.dem>` (`tests/demovoice/extract.mjs`) | a demo's voice per speaker, decoded with the bundled codecs, into `tests/demovoice/out/`, which git ignores ([demovoice/README.md](demovoice/README.md)). With `--timeline game` (`--fps`, `--buffer-ms`, `--speaker`) it also renders each speaker on the game's voice queue and writes the render and its phrases (W3-02g). |
| `node tests/voice-channel.verify.mjs --fixture <file>` | replays a fixture made from a real console log; such fixtures stay private. |
| `node tests/recordings/inspect.mjs <file>...` | a WAV file's chunks with their sizes, its metadata chunks by name, whether it is exactly a 44-byte header and its samples, its SHA-256 and that of its data chunk, its rate, channels, bits and samples: what a row of `tests/recordings/manifest.json` needs before the orchestrator publishes a file (order RP-01, section 7). It names a file by its place, never by its path. The suite `recordings` runs it on files it makes. |

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
| Speex 1.0.2 (`vaudio_speex`) | `pnpm build:speex` | `pnpm test:vendor`; `tests/speex102/native.mjs` builds the same sources natively |
| VR12 (`vaudio_miles`, not in TF2) | `pnpm build:vr12` | `pnpm test:vendor`; `tests/vr12/native.mjs`, and `tests/vr12/mutations.mjs` for the mutation run |
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

The browser suite, a codec build, `pnpm test` whole or with `--jobs`, and the long suites (`render-stream`, `stages`,
`steam`) alone run one at a time:
`flock /tmp/tf2ve-heavy.lock <command>`. The browser suite times a live microphone chain, and two heavy jobs at once
on four cores make it flaky ([docs/PIPELINE.md](../docs/PIPELINE.md), "Long runs"). Three suites also pass or fail
on a time of their own (`room-dsp`, `video`, `meter`), which is why `--jobs` is 1 unless asked.
