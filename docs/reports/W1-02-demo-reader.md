# W1-02 report: one demo reader; a talk spurt whose end marker was lost starts at its tick

Branch `claude/w1-02-demo-reader`, built on the amended order (commit 54c917e). The first build stopped on a
contradiction (the fixture's second speaker would have been split by a tick-only rule, and a literal concealment cap
would have dropped the fixture's lost frame); the orchestrator amended rules 1 and 2, and this build follows the
amended order.

## Commits

- `demo.js: a spurt after a lost end marker starts at its tick`: the decode rule, wrap-aware loss counting in
  `speakers()`, and the new checks in `tests/demo.verify.mjs`.
- `Demo voice: one reader; extract.mjs replaces the Rust tool`: `tests/demovoice/extract.mjs`, removal of
  `Cargo.toml`, `Cargo.lock`, `src/` and `decode.mjs`, the rewritten demovoice README, `.gitignore`, a
  `demo:extract` script in `package.json`, one sentence each in README.md and `tests/REFERENCE_2026.md`, and two
  checks that run the tool on the fixture.
- This report.

## What changed

### `decode()`, Steam branch

For a packet that finds the decoder open:

- `jump = (seq - next) & 0xFFFF` (16-bit, wrap-aware; `next` is stored masked too).
- If `jump < 0x8000` and `jump` frames fit in the time since the previous packet's tick plus `SEQ_SLACK` (0.5 s),
  the packet belongs to the run: `jump` frames are concealed and it is decoded back to back, however late its tick.
- Otherwise it is a sequence break and nothing is concealed. If its tick is more than `LATE_FRAMES` (4) frames after
  the write position, the decoder is freed and a fresh one made, the packet placed at its tick and the spurt counted.
  If not, it is decoded in place with the open decoder.

The legacy branch is unchanged. `speakers()` now counts a forward step of under half the 16-bit range as lost frames,
so a frame lost at 65535 is counted (it was not before; a frame lost at 0 already was). A forward step of 32768 or
more is now read as going backwards and not counted, where before any `seq > nextSeq` was; this follows from making
the count wrap-aware.

### Threshold and slack, and the evidence

- **SEQ_SLACK = 0.5 s (25 frames).** Tick bunching that a real jump must be allowed through: the gate sends its
  120 ms of pre-roll with the spurt's first frame, so 7 frames arrive at one tick (REFERENCE finding 12); SourceTV
  writes voice every 4 ticks, 60 ms, about 3 frames a batch, with about ±30 ms of arrival jitter (finding 21, Set D);
  the fixture puts 10 frames at one tick and loses one of them (jump 1 with zero elapsed time). 0.5 s is over twice
  the largest of these (the fixture's 200 ms) and far below what a wrapped or corrupt number implies (thousands of
  frames; the corrupt-jump check uses 4990).
- **LATE_FRAMES = 4 (80 ms)**, as in the legacy branch. It only matters on a sequence break. Within a spurt the
  write position runs ahead of the ticks (the pre-roll burst), so a packet of the same stream sits at or before it,
  and one SourceTV batch plus jitter stays under 80 ms. Since a split now needs a break as well, an intact run is not
  split on its tick at any threshold.

### `tests/demovoice/extract.mjs`

`node tests/demovoice/extract.mjs <demo.dem> [--out <folder>]` (or `pnpm demo:extract`) prints the header, the voice
message counts and, per speaker, frames, talk spurts, DTX frames, frames lost before the server, the bitrate while
coding (frames over 2 bytes), the TOC configurations, and how the decode placed the spurts. Per speaker it writes
`<demo>.<speaker>.wav` (16-bit at the codec's rate), `.packets.tsv` (tick, kind, seq, bytes) and `.frames.tsv`
(frame, start, code, bytes). Output goes to `--out`, else (after the review) `tests/demovoice/out/`; `.gitignore` covers the
demovoice folder's `.dem`, `.wav`, `.tsv` and `out/`. Legacy CELT demos go through the same path (CELT 0.11).

### Wording

`demo.js`'s header and `tests/demo.verify.mjs` no longer name the Rust tool. The demovoice README keeps, in the past
tense, that `demo.js` matched the older tool's 5148 records byte for byte on the Set D demo and its decoder to one
16-bit step. No file in the repository tells a reader to install Rust (a grep for `rust`, `cargo`, `decode.mjs` and
`.voice` finds only the order, unrelated words such as "Trust", and `parsed.voice`).

## Checks

| Check | Command | Result |
|---|---|---|
| Demo suite | `node tests/demo.verify.mjs` | `26 demo checks passed` (was 17) |
| Node suites | `pnpm test` | exit 0; last lines: `45 video checks passed`, `26 demo checks passed` (also 209, 119, 40, 66, 23 passed, 0 failed) |
| Browser suite | `flock /tmp/tf2ve-heavy.lock env CHROMIUM_EXECUTABLE=… node tests/browser.verify.js` | exit 0, `169 browser checks passed`; the demo section passes (160 frames, 1 lost, 1 DTX) |
| Tool on the fixture | `node tests/demovoice/extract.mjs tests/demo/synthetic.dem --out <scratch>` | see below; matches the suite's assertions (speaker 1: 30 frames, 2 spurts, 1 DTX, 1 lost; speaker 2: 1 spurt) |
| CI | the `tests` workflow on the pushed branch | run 42708582264 on `3d6909c`: success |

Tool output on the fixture (test SteamIDs, universe 0):

```
Synthetic test on ctf_2fort, 15.0 s, 1000 ticks of 15.0 ms; voice codec steam
6 voice messages, 1 unreadable, 0 packets with unreadable messages; 2 speakers
  4503603922337793: 30 frames in 2 talk spurts, 1 DTX, 1 lost before the server, 34.8 kbps while coding, TOC configurations {13: 30}; codec steam at 24000 Hz
    decoded: 3.20 s in 2 spurts placed at their ticks, 1 lost frame concealed
  4503603922337794: 10 frames in 1 talk spurt, 0 DTX, 0 lost before the server, 39.2 kbps while coding, TOC configurations {13: 10}; codec steam at 24000 Hz
    decoded: 0.20 s in 1 spurt placed at their ticks, 0 lost frames concealed
```

The suite also runs the tool on the fixture into a temporary folder and checks the summary lines, the WAV's rate,
length and a sample against `decode()`, and the row counts of both TSVs.

## The fixture decodes byte for byte as before

`tests/demo/synthetic.dem` is unchanged (`git diff` empty; sha256 `531343f9…b2b26c`). SHA-256 of the decoded
Float32 samples, the frame log and the frame bytes, with the main branch's `demo.js` and with this branch's:

| Speaker | | samples | frameLog | frameBytes | spurts, concealed |
|---|---|---|---|---|---|
| …793 | before | 76800, `23d74bb548b41a9103a8390bc1981df6bcecff360ad0d92b7c71b8b3d19331a9` | 160, `80cf19bae3df4c23ec91d076def16a088d54ed7227473651ecd3a19a2f7a1a80` | `4d0df7856e7468e8d7e9fd3327eab5089955c54175e3dd5e09dc47a19ac5c658` | 2, 1 |
| …793 | after | identical | identical | identical | 2, 1 |
| …794 | before | 4800, `d1182b6632daadddb88a032bc60bcc4558506eedc9ec5da7796daf2bb0c42190` | 10, `3500d93214caf7f502af5adcd28f8f4fb3620eae3bedbeb327cc5c68a57b3129` | `1de8ce6fda33fa4f952d3bd4785e8fb2e5ce60236a603e9038fb4d81c3f29223` | 1, 0 |
| …794 | after | identical | identical | identical | 1, 0 |

## New checks, and how each was shown to bite

New cases are built in the test (SourceTV layout: 3 frames every 4 ticks). Each new check was run against the main
branch's `demo.js` and seven mutants of the new rule, with a copy of the suite whose failures are logged instead of
thrown:

| Check | fails on |
|---|---|
| A spurt after a lost end marker, its numbers starting again, sits at its tick with a fresh decoder (2 spurts, same samples as with its marker) | old code (1 spurt, 0.4 s); never re-anchoring (LATE_FRAMES huge) |
| The same spurt within four frames of the write position is decoded in place | always re-anchoring on a break (LATE_FRAMES negative) |
| A run whose numbers continue is not split however late (3.8 s) | tick-only rule (split on lateness regardless of sequence) |
| The fixture's second speaker stays one run | tick-only rule (74040 samples, 2 spurts) |
| A real 0.8 s loss, numbers jumping by 40, is concealed and not split | tick-only rule; slack 0 |
| A jump of 4990 frames in 60 ms conceals nothing | old code (4990 concealed, 100 s); believing any forward jump; always re-anchoring |
| A frame lost at the wrap (65535, and 0) is concealed and counted | old code; non-wrap jump in `decode()`; old loss count in `speakers()` |
| The tool's summary and files | (runs the tool; it did not exist before) |

Slack 0 also fails three existing fixture checks (the lost frame is no longer concealed). The "in place" and
"continues" checks pass on the old code by design: they guard against breaking the new rule, which the order allows.

## Scan

`git diff origin/main...HEAD` and the commit messages were scanned for recordings, personal details, real SteamIDs,
machine paths and model names: none. The only SteamIDs are the tests' universe-0 ones. The commit trailers are the
ones the brief requires.

## Not done, uncertain, decided on my own

- The real Set D demo was not run (not on this machine, by design). Whether Steam's sequence numbers restart at each
  spurt is the open question in PROGRESS; the rule relies on it to catch a marker lost on its own.
- `speakers()`' loss count no longer counts forward steps of 32768 or more (read as backwards). No known demo has one.
- Added a `demo:extract` script and a `tests/demovoice/out/` ignore line, as conveniences the order allowed.
- The tool's bitrate counts frames over 2 bytes exactly, where the old summary subtracted one byte per DTX frame.

## Review fixes

CI on the first push: run 42708582264 on `3d6909c`, success. Main was merged in (docs only) before the fixes. Each
finding was reproduced first: F1 by running the tool without `--out` on a copy of the fixture named `voicetest.dem`
in a scratch folder (six files appeared beside it), and F2 to F4 by mutants that passed all 26 checks. F5 was
reproduced by the check below on the old tool ("20 frames in 0 talk spurts").

- **F1:** without `--out`, `extract.mjs` writes to `tests/demovoice/out/` resolved from its own folder, and prints
  `writing to <folder>`. README.md and the demovoice README say where the files go. New check: the tool run
  without `--out`, from a temporary folder holding a copy of the fixture, leaves only the demo there and writes
  six files under `tests/demovoice/out/`, which the check then removes. On the old tool it fails (6 files beside
  the demo, 0 in `out/`; with no `out/` folder at all the old suite stopped on a missing-folder error, now guarded).
- **F2:** the lost-marker check asserts `speakers()` counts 0 lost. The guard's mutant now fails it ("65526 counted
  lost"); the wrap check already asserted 1 lost in both wrap cases.
- **F3:** a lost marker, 30 minutes of silence and a number restart: 2 spurts, nothing concealed, the second at its
  tick. Without `jump < 0x8000` it fails ("1 spurts, 65526 concealed, ends at 21.85 min").
- **F4:** jumps of 24 and 26 frames inside one batch (no time elapsed) are concealed and a break respectively, which
  pins the slack between 0.48 and 0.52 s; a 100-frame jump at the last batch of a 150-frame spurt conceals
  nothing. Slack 30 s fails both ("24 and 26 frames concealed", "100 frames concealed"); slack 0.04 s fails the
  first ("0 and 0 frames concealed"); counting time from the spurt's start fails the second ("100 frames
  concealed").
- **F5:** for legacy codecs the tool prints the decode's spurt count, "(from gaps in ticks)", and says losses
  before the server are unknown. New check on the suite's vaudio_celt demo: "20 frames in 1 talk spurt".
- **F6:** deferred by the orchestrator; the rule is unchanged.

`demo.js` is unchanged by the fixes, so the fixture's hashes above still hold (re-run: identical).
`node tests/demo.verify.mjs`: `31 demo checks passed`. `pnpm test`: exit 0, ending `45 video checks passed`,
`31 demo checks passed`. The browser suite was not re-run: nothing the page loads changed.
