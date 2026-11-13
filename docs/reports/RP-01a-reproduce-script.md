# RP-01a: the reproduce script, the two clips, `gain`, `celt`, `speex`, the suite and the page

The builder's report. The order is `docs/work-orders/RP-01-reproduce-it.md`, part a (sections 9, 14 and 15).
Branch `claude/rp-01a-reproduce-script`, from `main` at `54f4f91`; `main` merged in at `e098b45`.

**Status:** built. Every done-means of part a passes on this machine; CI is in "Runs". No private file was opened:
no step needed one.

## What was built

| File | What |
| --- | --- |
| `tests/reproduce.mjs` | the frame: `node tests/reproduce.mjs` lists the checks with their usage; `inputs`, `gain`, `celt` and `speex` run; `hold`, `gate`, `queue`, `ceiling`, `clock` and `demo` print `<check>: not built yet (order RP-01b or RP-01c): ...` and exit 3. Each run ends with one line, `<check>: as expected` (exit 0), `<check>: differs: <reason>` (1) or `<check>: cannot check: <reason>` (2); an error the script does not describe prints no detail and exits 4 (`REPRODUCE_DEBUG=1` shows it) |
| `tests/reproduce/common.mjs` | the WAV reader (any 16-bit mono PCM WAV; says whether it is the plain 44-byte header the game writes), the report's lines, the argument parser. Every message names a file by its place ("file 1") and an argument by its number; nothing the script prints comes from a file or a path |
| `tests/reproduce/inputs.mjs` | `inputs <folder>` writes the two clips and prints each SHA-256 with "as expected" or "differs"; `inputs --against <file>` checks a captured input (the clip from its third sample, then two zeros) |
| `tests/reproduce/gain.mjs` | two recordings, at `voice_maxgain` 1 and 10; the engine's `receiverAutoGain` at 10 on the first, through `compareGain` of `tests/gain-exact.mjs`; the last packet apart (512 at 22050 Hz, 160 at 11025 Hz, or `--packet`); files of two lengths compared over the shorter, said so |
| `tests/reproduce/celt.mjs` | W3-08's method through `createCeltStream` of `opus-codec.mjs` at complexity 5, `--high` for `vaudio_celt_high`; the input is the generated clip, or file 2 from its third sample, or file 2 whole with `--micdata`; the pass line is at most 0.05% of the compared samples one step off and none further, the last packet apart |
| `tests/reproduce/speex.mjs` | the whole render of the `speex` profile (`TF2Audio.process`, loaded through `tests/lib/engine.cjs`) with the gain's output at `onGain`, at `--maxgain` 1 (default) or 10, against the file at the codec's delay (`codecInfo.lookahead`, 80); the input as for `celt`, followed by two zeros unless `--micdata` |
| `tests/recordings/make-inputs.mjs` | the clips' generator: the orchestrator's draft made a module (`RATES`, `fileName`, `clipSamples`, `clipWav`, `writeClips`) with its arithmetic unchanged, and a command (`node tests/recordings/make-inputs.mjs <folder>`). Node 22.23 gives the record's two SHA-256 |
| `tests/reproduce.verify.mjs` | the suite `reproduce`, group `units` (below) |
| `tests/gain-exact.mjs` | `compareGain(gain1, gain10, packet)` exported (also counts the samples the gain changed); `exactCheck(gain1File, gain10File)` takes two paths; `--files <gain 1> <gain 10>` added; `--takes` and `--synthetic` as before |
| `tests/run.mjs`, `tests/README.md` | the suite's row in each |
| `tests/REFERENCE_2026.md` | added lines only: the entry "The file-input runs, measured again (2026-11-13)" under "Provenance", and a note *Corrected by RP-01a (2026-11-13)* under finding 24's 505 |
| `docs/REPRODUCE.md` | the page "Check it on your own PC" |
| `README.md`, `docs/FINDINGS.md`, `docs/README.md` | one link each; in FINDINGS entry 10, the folder of `voice_input.wav` is now "measured for TF2 in Set H" in place of "inferred" |

Nothing under `engine/`, no file the site loads, no codec module, not `sw.js`, `CLAUDE.md` or PROGRESS. No recorded
hash of an existing suite moved. `tests/recordings/files/` was not made, and nothing ignores it.

## The suite `reproduce`

`node tests/reproduce.verify.mjs`, about 8 s here (13 s after the fix round). The stand-ins are made with the
repository's own codecs on the generated clips. What each one shows is in the table of "Fix round" below: the CELT
stand-in is the check's own call to the same codec, and `speex` and `gain` are checked against a second route.

- **[1]** The list names every check; the four built and the six not built yet are as above; each not built yet
  prints the line and exits other than 0; a name that is no check is refused (exit 2) without being repeated.
- **[2] `inputs`.** The two files written have the record's SHA-256, bytes and samples (pinned in the suite apart
  from the script's own copy), are `clipWav`'s bytes, and the output names no folder. `--against` on the stand-in
  capture at 11025 Hz (145,964 of 145,964) and at 22050 Hz: as expected; one sample moved by three: differs
  (145,963 of 145,964); zeros: differs, "no sound"; a file at 44100 Hz: differs, naming the rate.
- **[3] `gain`.** The stand-in (the CELT stand-in, and the transcription on it with its last 300 samples changed):
  as expected, 0 of 291,840, 300 in the last packet; one sample of the gain-10 file moved by three: differs, 1 of
  291,840; zeros: "no sound"; 600 samples: "too short"; a full-scale file, where the gain is 1 on every block:
  "changes no sample"; the Speex stand-ins at 11025 Hz with the gain-1 file one frame shorter (Set M's case): as
  expected, compared over the shorter; two rates: differs.
- **[4] `celt`.** The `vaudio_celt` stand-in with one sample one step off: as expected, "one step off: 1"; with the
  input as file 2, and with the captured input and `--micdata`: as expected; the `vaudio_celt_high` stand-in with
  `--high`: as expected; one sample moved by three: differs; 146 samples one step off (past 0.05% of 291,840, which
  allows 145): differs; zeros: "no sound"; one packet: "fewer than two packets"; the high stand-in without `--high`:
  differs, and says to give `--high`.
- **[5] `speex`.** The stand-in at `voice_maxgain 1` (the decoder's stream, 913 frames, 146,080 samples, as Set O's
  files): as expected, 145,966 of 145,966 at the lag of 80; the gain-10 stand-in with `--maxgain 10`, with the input
  as file 2 and with `--micdata`: as expected; the gain-10 stand-in checked as 1: differs; one sample moved by
  three: differs, 145,965 of 145,966; zeros: "no sound"; one frame: "fewer than two Speex frames"; a 22050 Hz file:
  differs, naming the 64-bit game's fall-back.
- **[6] The network.** The text of `tests/reproduce.mjs`, every file under `tests/reproduce/` and
  `tests/recordings/make-inputs.mjs` holds no `fetch(`, no `net`, `dns`, `dgram`, `http`, `https`, `http2`, `tls` or
  `child_process` import or require, and no `WebSocket`, `XMLHttpRequest` or `EventSource`; the scanner catches six
  planted forms. Every run of the suite is a child started with `--import` of a guard that replaces `net.connect`,
  `net.createConnection`, `net.createServer`, `net.Socket.prototype.connect`, the lookups of `dns` and
  `dns.promises`, `dgram.createSocket`, `fetch` and `WebSocket` with functions that log the call and throw
  (`syncBuiltinESMExports` so imports see them); no run logs a call, and a probe child that tries a
  socket, a stream connect, a lookup, a datagram socket and a fetch has each one logged.
- **[7] The markers.** The stand-ins lie in a folder whose name carries a marker, under file names that carry one;
  one WAV carries one in a `LIST` chunk; a text file given as a WAV holds one; an unknown option and an unknown
  check are markers. No marker appears in the output of any run (as expected, differing, refused or not built), and the detector catches a child that prints its file's path. The error paths covered: a missing
  file (cannot check, exit 2), a file that is not a WAV, a WAV with a header chunk (read; the output says the header
  is not the plain one), an unknown option.

### The suite's tests, broken

Each break was made in the file, the suite run, the file restored (`scripts/break.sh` in the scratch folder).

| Break | Where | What failed |
| --- | --- | --- |
| a line `// fetch('https://example.invalid/')` | `tests/reproduce/gain.mjs` | [6] the text check, "tests/reproduce/gain.mjs: a call to fetch" |
| `(await import('node:' + 'net')).default.connect(80, 'example.invalid')` in a check (past the text check) | `tests/reproduce/celt.mjs` | [6] "no run of this suite called the network" (`net.connect` logged) |
| the file's path printed after its description | `tests/reproduce/gain.mjs` | [7] the marker check, naming the seven `gain` runs |
| 0.05% made 0.1% | `celt.mjs` | [4] the 146-sample check and the one-step-off count |
| up to three steps counted as one | `celt.mjs` | [4] the three-step break |
| the two zeros after the input left out | `speex.mjs` | [5] the stand-in checks (145,964 compared, not 145,966) and the three-step count |
| the file read one sample early | `speex.mjs` | [5] the stand-ins and the three-step count, [7] the tagged-file check |
| the last packet 160 at 22050 Hz | `gain.mjs` | [3] the stand-in (140 differ), the three-step count, the too-short reason |
| the "changes no sample" floor removed | `gain.mjs` | [3] the full-scale check |
| the reader's skip made 0 | `inputs.mjs` (used by `celt` and `speex`) | [2] `--against`, and every stand-in of [4] and [5] |
| the generator's ramp at 11025 Hz 111 in place of 110 | `make-inputs.mjs` | [2] the 11025 Hz SHA-256 and the "as expected" line |
| the "no sound" floor of `celt` removed | `celt.mjs` | [4] the zeros check (it differs for another reason) |

## Done means

1. `node tests/run.mjs reproduce` passes (`== reproduce: passed, 7.6 s`), and `node tests/reproduce.mjs` lists the
   checks (exit 0; the list ends "docs/REPRODUCE.md says what to run in the game for each. The output holds figures
   only and can be posted as it is.").
2. `node tests/reproduce.mjs inputs <folder>` on Node 22.23.4:

   ```
   voice_input_22050.wav: 22050 Hz, 16-bit mono, 291,942 samples, 583,928 bytes
     SHA-256 fc1c6cbd9aabd8ed1b64d4381eae3c2f56dce23eff36e14ba7d9f67dc5505a58, expected fc1c6cbd9aabd8ed1b64d4381eae3c2f56dce23eff36e14ba7d9f67dc5505a58: as expected
   voice_input_11025.wav: 11025 Hz, 16-bit mono, 145,966 samples, 291,976 bytes
     SHA-256 bd31df844cee4b38fe705be1fbdfb1b17acb9f161f9314b06b1eb2ba0d560dbd, expected bd31df844cee4b38fe705be1fbdfb1b17acb9f161f9314b06b1eb2ba0d560dbd: as expected
   Copy the one your codec needs into the game's folder as voice_input.wav: 22050 Hz for vaudio_celt and vaudio_celt_high, 11025 Hz for vaudio_speex.
   inputs: as expected
   ```

   On CI the suite's [2] pins the same two (see "Runs"). The page's step 1 says to copy the one wanted into the
   game's folder as `voice_input.wav`.
3. Each check's last line and exit, on stand-in files made as the suite makes them (`outputs.txt` in the scratch
   folder has the whole output):

   | Run | Last line | Exit |
   | --- | --- | --- |
   | `gain` on its stand-in | `gain: as expected` | 0 |
   | `gain`, one sample moved by three | `gain: differs: file 2 is not the rule applied to file 1 in 1 sample before the last packet` | 1 |
   | `gain`, zeros | `gain: differs: file 1 holds no sound before its last packet (every sample is zero)` | 1 |
   | `gain`, 512 and 600 samples | `gain: differs: the shorter file holds 512 samples: too short to hold one 128-sample block of the gain before its last packet of 512` | 1 |
   | `gain`, full scale | `gain: differs: the gain changes no sample of file 1 before its last packet, so the files cannot show the rule (is file 1 at full scale throughout, or too short?)` | 1 |
   | `celt` on its stand-in | `celt: as expected` | 0 |
   | `celt`, one sample moved by three | `celt: differs: file 1 is not this build's vaudio_celt output of the input.` | 1 |
   | `celt`, zeros | `celt: differs: file 1 holds no sound before its last packet (every sample is zero)` | 1 |
   | `celt`, one packet | `celt: differs: file 1 holds fewer than two packets of 512 samples` | 1 |
   | `speex` on its stand-in | `speex: as expected` | 0 |
   | `speex`, one sample moved by three | `speex: differs: file 1 is not this build's speex render of the input at voice_maxgain 1` | 1 |
   | `speex`, zeros | `speex: differs: file 1 holds no sound (every sample is zero)` | 1 |
   | `speex`, one frame | `speex: differs: file 1 holds fewer than two Speex frames of 160 samples` | 1 |

   The figure lines above the last, for the stand-ins: `samples that differ before the last packet: 0 of 291,840,
   expected 0: as expected`; `samples one step off: 0, expected at most 145 (0.05%): as expected` and `samples more
   than one step off: 0, expected 0: as expected`; `samples equal: 145,966 of 145,966, expected all; largest
   difference: 0: as expected`.
4. The network and marker checks pass, and each fails on its break (the first three rows of the table above).
5. `node tests/gain-exact.mjs --synthetic` prints what it printed before, byte for byte (`diff` of the two outputs is
   empty; the last line `gain-exact --synthetic: ok`).
6. The figures on the page, each with the line of `tests/REFERENCE_2026.md` it was copied from (line numbers on this
   branch): see "The page's figures" below.
7. `node tests/run.mjs miles` passes (`miles  units  passed  10.5`).
8. `git diff origin/main -- tests/REFERENCE_2026.md` shows added lines only (no line starts with a single `-`).

All parts: `node tests/run.mjs site harness` passes; `node tests/cache-number.mjs origin/main --report` prints
`cache number against origin/main (e098b45): no cached file changed; the number stays v39`.

The script also runs in a copy of the branch with no `node_modules` (`git archive` into an empty folder):
`inputs`, `celt`, `gain` and `speex` as expected on the stand-ins, and the suite passes there.

## The page's figures

| Figure on the page | Standing given | The record's line |
| --- | --- | --- |
| Steam voice is the codec unless `sv_voicecodec` is changed | read | not the record: `docs/FINDINGS.md`, entry 10 ("Steam voice is the default of `sv_voicecodec` today (read)"); see "Uncertain" |
| the clips: 22050 Hz, 291,942 samples, `fc1c6cbd…`; 11025 Hz, 145,966, `bd31df84…` | measured | 321 and 322, the table of "The file-input runs, measured again" |
| 13.2 s, tone bursts, sweep, harmonic tone; 16-bit mono, plain 44-byte header | measured | 313 |
| the game's folder holds the executable, measured for TF2; 32-bit games' folder not named | measured | 328 to 331 |
| `sv_voicecodec` before the map; `voice_loopback 1`, `voice_inputfromfile 1`, `voice_recordtofile 1`, `voice_maxgain 1` or 10 | measured | 333 and 334 |
| `+voicerecord`, 15 s, `-voicerecord`, no key bound | measured | 335 |
| Set H on a local server | measured | 336 |
| `sv_allow_voice_from_file` 1 by default | read | 337 |
| the files written again at every release of the key | measured | 337 and 338 |
| `tf.exe -force32bit -game tf -console`; the 64-bit game falls back to CELT without saying so (Set I) | measured; read and measured | 340 to 342; finding 31 (979, and 1019, the corrected bullet on Speex and Set I) |
| the files appear in the same folder | measured | 329 |
| `voice_showincoming` prints one line a packet with its count | read | 841 |
| 512 and 1024 a packet | measured, Set H | 246 and 248 |
| 320 and 480 under `vaudio_speex` | measured, Set O | 277 (and 979) |
| the reader skips the first two samples | read and shown on Set H | 844 |
| at most 1 MiB | read | 842 (23.8 s at 22050 Hz is computed on the page) |
| 128-sample blocks, the target, steps of 1/128, a block of zeros to the cap | read | 818 and 821 (finding 26), 395 (finding 3) |
| `voice_recordtofile` after the gain: gain 1 the decoder's output | read | 824 |
| `voice_avggain 0.5` and `voice_scale 1` the defaults; `voice_maxgain 10` | measured / read | 401 (0.5), 417 (s = 1), 404 (the cap of 10) |
| 0 of 291,840 differ | measured, Set H | 824 and 827 ("Since W3-05 ... gives 0 of 291,840"), 247 |
| the last packet differs between two key presses | measured, Set H | 250 |
| CELT 0.11 at the pinned commit, pitch filter, complexity 5, 16-bit entry points; 22050/512/64; 44100/1024/128 fed 22050 Hz | read | 971 to 973 |
| 292,351 of 292,352 and 292,789 of 292,864 | measured, Set H | 974 |
| TF2's 32-bit game runs `vaudio_speex` | measured | 979 |
| Speex 1.0.2 or 1.0.1, narrowband, quality 4, 20 bytes, enhancement on, 11025 Hz with no resampling | read | 977 |
| frames of 160 samples | measured, Set M | 269 |
| the build computes as the module's compiler did | read, then run | 272 |
| the codec's delay of 80 samples | (finding 31) | 978 |
| 145,966 of 145,966 at `voice_maxgain` 1 and 10 | measured, Set O | 279 |
| TF2 build 11191711 | measured | 277 |
| the captured input: 145,964 of 145,964, then two zeros | measured | 325 |
| the findings of the checks not built yet | | the order's section 3 table (12, 16, 28; 5, 27, 28; 22 to 25 and 29; 1 and 30; 10, 19, 21, 24; 2, 11, 16) |

Two figures on the page are not the record's and say so: the tolerance of `celt` (0.05%, "a choice of order RP-01,
not a figure of the record") and the map (`ctf_2fort`, "the record does not name the map of its runs"). Two steps
come from reports, not the record, and name them: the microphone device the game still needs (W3-03's report) and
the file taken in order whatever the frame rate (W3-08's report); the header's rate unused is W3-03's too.

## What I read differently, and what is uncertain

- **Where the generator goes.** Section 14 puts `tests/recordings/make-inputs.mjs` in part d; section 9's files
  table and the brief put it in part a. It is here, as the brief says; part d should not add it again.
- **`inputs --against`** is built here, under `inputs`: section 7 names it as the check part e runs on the captured
  input, and part f wires it. Section 9 did not list it among part a's checks by name.
- **The page's opening line on Steam voice** cites `docs/FINDINGS.md` entry 10, not a finding of the record: the
  record does not state the default of `sv_voicecodec` in those words. The orchestrator may want a line in the record
  for it, or the sentence reworded.
- **The page adds `voice_showincoming 1`** as an optional step to see which codec ran (the record's runs of Set O's
  speech used it; Sets H, M and O's sheets did not). It is outside the line to paste, and changes nothing recorded.
- **The `gain` check's last packet at 11025 Hz** is 160 samples (one Speex frame), a choice of this script: the
  record has no gain-1 against gain-10 count under Speex, only the whole render's. Part e will find whether 160 is
  enough on Sets M and O; `--packet` changes it.
- **`speex` appends two zeros** to an input given as `voice_input.wav`, because the captured input of Sets M and O
  ends so (measured). Without them the render is two samples short and 145,964 samples are compared; the suite
  fails that way.
- **The record's entry** names the private notes as the source of each statement, as section 14 does. It leaves out
  section 14's finding that Sets J and K carry the owner's voice: the brief's list did not name it, and part e
  enters what is published.
- **"Not yet run on a recording of the game"** stands on all three sections; part e or f removes it.

## Runs

- `pnpm test` (all but the browser suite), under the heavy lock, on the branch at `57c5189`: exit 0, every suite passed, 910.7 s summed; `reproduce` 7.7 s, `gain-exact` 0.3 s, `miles` 10.8 s.
- `pnpm test:browser` with `CHROMIUM_EXECUTABLE`, under the heavy lock: exit 0, "browser  browser  passed  237.0".
- CI: run 43349394992 on `57c5189` (the code, the record and the page): `verify` success, all five groups success. In
  `units` the suite passed (`== reproduce: passed, 7.8 s`), with both clips' SHA-256
  as the record gives them, on CI's Node 22. The commits after it (the merge of `main`, this report, two edits to
  the page) change only `docs/`, which starts no run on a push; a run on the head was started by hand (the hand-back
  gives its result).
- The branch's diff and its commit messages were scanned for recordings, personal details, real SteamIDs, paths and
  model names: none but the trailer lines.

## Fix round

The review's six findings, all accepted by the orchestrator. `main` merged in again first (docs only). The
orchestrator's private run of the branch at `58803ce` on the game's own files found the checks line up with what
the game wrote (celt, gain, speex and `inputs --against` on Sets H, I, M and O); one real file could not be checked
(finding 2).

1. **A short recording no longer passes.** `celt` and `speex` refuse a file 1 that ends more than one packet (512
   or 1024 samples for `celt`, 160 for `speex`) before the length the input decodes to, with the reason in seconds
   ("file 1 ends 12.56 s before the input does ...: hold the key until the clip has ended, about 15 s, and copy the
   file before the next press"), and one that goes on more than one packet past it. `gain` refuses a pair more
   than one packet apart in length. One packet short still passes (Set I's and Set M's real files are so).
   Shown by truncated stand-ins (30 CELT packets, 40 Speex frames, a gain-10 file of 30 packets), by stand-ins one
   packet or frame short that pass, and by removing each floor: the short floor of `celt`, the call in `speex`, the
   lengths of `gain` and the long floor of `celt` each fail their checks.
2. **A clip at another rate.** `celt --any-rate` takes file 2's samples as 22050 Hz sound whatever its header says,
   and prints one line saying so with the reason (read, W3-03's report; Set I). Without it a file 2 at another rate
   is refused and the message names the option. With `--any-rate` and no file 2 the script refuses and asks for the
   file (my choice: the clip the game read is the one the stranger has, and guessing it would hide a mistake). The
   `--high` hint is given only where `--high` would fit: the file is whole 1024-sample packets within one of what
   the input makes at 1024. Shown by Set I's stand-in (the 11025 Hz clip through `vaudio_celt` as 22050 Hz sound, cut
   to Set I's 285 packets, made the record's way, as the reviewer's `seti.mjs` does): as expected with
   `--any-rate`, differs naming the option without it, cannot check with no file 2; by stand-ins padded to 287 and
   288 packets of 1024 (the hint, then none). Breaks: `--any-rate` ignored, and the hint always shown, each fail. The
   page has the case under `celt`, with Set I's 145,919 of 145,920 (measured, finding 31).
3. **The suite's blind spots.** Stand-ins one sample late, one sample early and one packet late give "differs" in
   `celt`, and one sample late, one sample early and one frame late in `speex`. `inputs --against` on the clip from
   its third sample with no zeros after it, and on the capture with 100 samples more, gives "differs". The clips'
   verdict is exported (`verdicts` in `tests/reproduce/inputs.mjs`), and the suite gives it a wrong expected hash:
   it says "differs" on that clip. The four breaks: a lag search in `celt` (lags -600 to 600), a lag search in
   `speex` (0 to 400), `--against` judged on the equal samples alone, and the verdict always true; each fails the
   new checks and no other.
4. **No network, wider.** `compareGain` moved to `tests/reproduce/gain-compare.mjs`, which `tests/gain-exact.mjs`
   imports and re-exports; the check `gain` no longer loads `tests/gain-exact.mjs` and its child process.
   `--synthetic` prints what `origin/main`'s prints, byte for byte (`diff` empty). The guard now also traps
   `child_process` (spawn, spawnSync, exec, execSync, execFile, execFileSync, fork), `worker_threads.Worker` and
   `process.binding` of the socket bindings, and logs every file a run loads (`module.registerHooks`). The text
   scan reads the script, `tests/reproduce/`, the generator, every logged file and the engine's files (which
   `tests/lib/engine.cjs` reads as text), and looks also for `worker_threads`, `cluster`, `inspector`,
   `getBuiltinModule`, `process.binding` and `internalBinding`. A probe shows the guard catching a module reached
   by `getBuiltinModule`, spawnSync, spawn, exec, execFile, fork, a worker that would connect, and the TCP binding,
   with nothing run unguarded. Breaks: a spawnSync in `celt.mjs` (reached by a built name, past the text check)
   fails the runtime check; a worker's connect in `speex.mjs` fails both; `gain.mjs` importing
   `tests/gain-exact.mjs` again fails the load list and the scan.
5. **The page, as a stranger.** How the console is opened (`-console` in the launch options, or the developer
   console in the game's keyboard options); the two files copied into the repository's folder so the commands as
   printed find them, or given with a path; the 32-bit start line as `.\tf.exe -force32bit -game tf -console`,
   typed in PowerShell or a command prompt opened in the game's folder; what a packet is, where the word first
   appears; "the same result on any PC" marked inferred (measured with two Source games on one PC); Steam voice as
   the default marked as the page's own statement (the record does not give it; FINDINGS entry 10 gives it as read).
   "When a result differs" names a recording ended early and a `gain` pair apart in length.
6. **What each stand-in shows**, in the suite's head comment and here:

   | Check | The stand-in | What its pass shows |
   | --- | --- | --- |
   | `inputs` | none: the two clips' SHA-256 are pinned in the suite, apart from the script's own copy | the clips are the record's bytes on this Node; the verdict is shown to say "differs" on a wrong hash |
   | `inputs --against` | the clip from its third sample, then two zeros | the two-sample shift and the two zeros: no zeros, extra samples and a sample moved each differ |
   | `celt` | W3-08's loop on the CELT build directly | the check's own call to the same codec at the same settings: its pass shows the reading, the counting, the pass line and that the settings were not changed; shifts differ, so a lag search would show |
   | `speex` | the Speex codec frame by frame, and the gain's transcription on it | a second route (the whole render at `onGain` against the decoder's stream and `engineGain`): the lag of 80, the two zeros, the gain's blocks; shifts differ |
   | `gain` | `engineGain` on the CELT stand-in | a second route (`receiverAutoGain` against the transcription): the rule, the last packet apart, the lengths within a packet |

   Counts of checks and runs are gone from this report.

### Runs after the fix round

- `node tests/run.mjs reproduce site harness miles gain-exact`: every suite passed.
- In a `git archive` copy with no `node_modules`: the suite passes and `celt` is as expected on a stand-in;
  `node tests/gain-exact.mjs --synthetic` there prints what `origin/main`'s prints in its own archive copy.
- `pnpm test` under `flock /tmp/tf2ve-heavy.lock`, on `7345719`: exit 0, every suite passed, 891.8 s summed; `reproduce`
  12.5 s.
- CI run 43355799597 on `7345719` (the fix round's code): `verify` success, all five groups success;
  `== reproduce: passed, 10.1 s` in `units`. The report and `tests/README.md`'s time (10 s, CI's) follow in one push;
  its run is in the hand-back.
- `node tests/cache-number.mjs origin/main --report`: `cache number against origin/main (c8d812b): no cached file
  changed; the number stays v39`.
- The diff and the commit messages were scanned again: no recordings, personal details, SteamIDs, paths or model
  names but the trailer lines.
