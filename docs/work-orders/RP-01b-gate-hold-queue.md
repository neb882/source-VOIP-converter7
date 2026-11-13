# RP-01b: the checks `gate` and `queue` of the reproduce-it script, and what happens to `hold`

**Status 2026-11-13: built, reviewed, fixed, run by the orchestrator on the private logs before and after the fix round (every real log as expected) and merged (the cache number stays v42).** What follows is the order as it was built from. It supersedes part b of
[RP-01](RP-01-reproduce-it.md) (its sections 3 to 5, 9 and 15). Written by a planner's pass on `main` at
`695a584` ([the planning report](../reports/RP-01b-plan.md)). The planner read the repository only: it opened no
recording, no log and no file of the owner's install.

**Kind:** tests, tools and documents. It changes no render, no constant and no file the site loads.
**Roles:** `tf-builder` (effort high), then `tf-reviewer`. No second reader (the reason is at the end).
**Branch:** `claude/rp-01b-gate-queue`, from `main`. **Worktree:** in the brief.
**Report:** `docs/reports/RP-01b-gate-queue.md`. **Budget:** 8 hours. At the budget the builder stops, pushes
what passes and reports what is left.

"The record" is `tests/REFERENCE_2026.md`. "The page" is `docs/REPRODUCE.md`. "The script" is
`tests/reproduce.mjs` with the files under `tests/reproduce/`. "The suite" is `tests/reproduce.verify.mjs`.

## Why

The page has six checks a stranger can run, and none of them reads Steam voice with the game and Steam alone:
`gain`, `celt` and `speex` check the older engine codecs, `ceiling` and `clock` need a recorder, `demo` needs a
server. Steam voice is the default of `sv_voicecodec` (read; `docs/FINDINGS.md`, entry 10), and the owner's rule
is that the modern preset comes first.

This order builds two checks of that path, each from one text file that a console writes:

- `gate`: Steam's sender gate, from Steam's own console text.
- `queue`: the receiver's queue, from the game's console log.

It does not build `hold`. The section "What happens to `hold`" says why and what the page carries in its place.

## What the two checks share with the script as built

A check is a file under `tests/reproduce/` that exports `{ name, summary, usage, run(args, report) }`, as
`tests/reproduce/demo.mjs:50` does. `tests/reproduce.mjs:33` lists the checks; the entries for `gate` and `queue`
at `tests/reproduce.mjs:39` and `:40` become imports. From `tests/reproduce/common.mjs` a check takes `differs`
and `cannot` (`:16`, `:17`), `fmt` (`:20`), the report's `line`, `figure` and `info` (`:26`), `parseArgs` (`:40`),
`numberOption` (`:56`) and `readBytes` (`:70`).

The rules of the frame hold for both checks:

- The last line is `<check>: as expected` (exit 0), `<check>: differs: <reason>` (exit 1) or
  `<check>: cannot check: <reason>` (exit 2). Exit 2 is for the arguments and for a file that cannot be read.
  A file that can be read and cannot show the rule is "differs", with the reason.
- A file is named by its place ("file 1"). An argument is named by its number. Nothing a check prints comes from
  a file or a path: no line, no part of a line, no name. Numbers that a voice line or a chunk line carries are
  figures and may be printed.
- No network. The suite's part [6] reads the text of every file a run loads and runs every check with the network
  refused; both checks come under it without a change to that part.

## `gate`

### The claim, and its standing

Steam judges each chunk of the capture whole. A chunk is sent when the mean of its absolute samples is at least
1.0% of 32767, or when one sample reaches 4915 (read; finding 28, with finding 5).

The record's measurements of it (finding 28; all measured):

| Figure | Where it comes from |
| --- | --- |
| all 789 verdicts that Steam printed follow the rule (Set J, a file as the microphone) | each chunk recomputed from the known clip, by scratch scripts of W3-14 |
| the printed mean, peak and count of high samples equal the recomputed ones on 788 of 789 lines | the same; the one line is a chunk of one sample, printed with a mean of 0.00 |
| the highest mean that failed is 0.9998% and the lowest that passed 1.0315% | the same; these are exact means, which the print does not show |
| a run with a real microphone follows the rule on all 590 chunk lines (Set L) | the record does not say how the lines were judged |
| one pattern fits 3,358 of 3,358 chunk lines in three files | the orchestrator, 2026-11-13 |

Read, and not measured apart: for a chunk of exactly one sample the code's mean is 0, and the code compares the
mean as a 32-bit float (`docs/reports/W3-16-second-read.md`, "Differences between the built sender and the
code", point 3).

No code in the repository reads a chunk line today. The check's first route (the marks against the printed
numbers) is not in the record in that form. Its second route is W3-14's, in repository code.

### What Steam prints

With `@voice_spew_activity_check 1` set in Steam's console, Steam prints one line for every chunk that holds
samples (measured, Set J; finding 27). With numbers of our invention a line is

```
[+++] [ 20.00 msec] avgsample   1.23 | max  12.345 | high samples   45
```

| Part | Holds | Standing |
| --- | --- | --- |
| the first bracket | three marks, each `+` or a space: the chunk is active, its mean passed, its peak passed | measured (W3-14) |
| `msec` | the chunk's length in milliseconds, two decimals; times 24 it is within 0.12 of a whole number of samples | measured (W3-14) |
| `avgsample` | the mean of the absolute samples as a percentage of 32767, two decimals | measured (W3-14) |
| `max` | the largest absolute sample as a percentage of 32768, three decimals | measured (W3-14) |
| `high samples` | the count of samples at or above 4915 | measured (W3-14) |
| a stamp before the line | `[2026-01-02 03:04:05] ` in Steam's log file; none in text copied from the console window | measured (the record's entry "Steam's chunk line") |

Two more lines matter when a file is the microphone. Their layout is read, not measured as printed
(`docs/work-orders/W3-14-steam-file-input.md`, "Added 2026-11-10"):

- `loaded voice input file <path>, <N> samples (<S> seconds)`, printed when Steam loads the file, at the first
  read after the key goes down. The file then starts at its first sample.
- `voice input file <path> looped`, printed each time the file wraps.

Both carry the file's path. The check takes the number N from the first and counts the second. It prints
neither.

### Inputs, and what a stranger does to get them

```
gate <Steam's console text>
gate <Steam's console text> <the 24 kHz WAV that mic_inputfile played>
```

- **File 1, Steam's console text.** Either the text copied out of Steam's console window into a text file, or
  the file `console_log.txt` in the `logs` folder of Steam's install, which holds the same lines with stamps
  (measured: the record's entry "Steam's chunk line"). The check reads both. It also reads a text file saved as
  UTF-16 with a byte-order mark, which some editors write, and lines that end in a carriage return.
- **File 2, optional: the clip.** A 16-bit mono WAV at 24000 Hz with a plain 44-byte header, the file Steam was
  given with `mic_inputfile`. The page gives the generated one, `steam_mic_24000.wav` (below). Any other clip of
  that form is taken too, so that the orchestrator can run the check on the record's own logs.

The steps the page gives (the builder writes them out; every console line is one line to paste):

1. `node tests/reproduce.mjs inputs clips` now also writes `steam_mic_24000.wav` (below).
2. **Steam's console** is not the game's. It opens from a browser's address bar or the Run box of Windows with
   `steam://open/console` (read in `docs/reports/W3-09-steam-voice.md`, "What the owner could run"), and a
   Console tab appears in Steam. Two lines, each typed alone, since the record does not say whether Steam's
   console takes two commands on one line:

   ```
   @voice_spew_activity_check 1
   ```
   ```
   mic_inputfile C:\tf2check\steam_mic_24000.wav
   ```

   The path is the file's full path. The page tells the stranger to copy the clip into a folder whose path has
   no space, such as `C:\tf2check` (a choice of this order: the record does not say how a path with a space is
   typed). A path that does not load is not retried, and may fill the console with `looped` lines or stop Steam
   (read, W3-14's order). A working capture device is still needed (read). With a real microphone the second
   line is left out and the stranger speaks.
3. **The game**, with Steam voice. In the game's console, before the map:

   ```
   sv_voicecodec steam; map ctf_2fort
   ```

   Once the map has loaded, `voice_loopback 1`, as the record's runs had it (measured, Set J; whether the
   chunk lines come without it is not in the record). Then type `+voicerecord` and press Enter. Wait 60 s,
   which is two passes of the clip. Type `-voicerecord` and press Enter. One press is enough.
4. **Save the text.** Select all of the Console tab's text, copy it and paste it into a text file; or take
   `console_log.txt` from the `logs` folder of Steam's install. The page says, in bold: this text holds account
   names and addresses; give it to the script and post only what the script prints.
5. `node tests/reproduce.mjs gate steam_console.txt clips/steam_mic_24000.wav`.
6. Afterwards `@voice_spew_activity_check 0`, and `mic_inputfile` set back to an empty string (read, W3-09's
   report; how the empty string is typed is not in the record, so the page says "or restart Steam").

Everything was measured on Windows; the page says so already.

### The 24 kHz clip

A file of its own, `tests/reproduce/steam-clip.mjs`, exports `steamClipSamples()` and `steamClipWav()`. The
arithmetic is this, line for line, so that the bytes are the same wherever it is built:

```js
const RATE = 24000;
function steamClipSamples() {
  const out = [];
  const sil = (n) => { for (let i = 0; i < n; i++) out.push(0); };
  const tone = (n, amp) => { for (let i = 0; i < n; i++) out.push(Math.trunc(amp * Math.sin(2 * Math.PI * 1000 * i / RATE))); };
  sil(12000);
  for (let k = 0; k < 5; k++) { tone(24000, 8192); sil(28800); }
  tone(24000, 412); sil(12000); tone(24000, 583); sil(28800);
  for (let i = 0; i < 192000; i++) {
    const u = i < 96000 ? i / 96000 : (192000 - i) / 96000;
    const amp = Math.PI / 2 * 32767 * (0.90 + 0.20 * u) / 100;
    out.push(Math.trunc(amp * Math.sin(2 * Math.PI * 1000 * i / RATE)));
  }
  sil(28800);
  for (const v of [4905, 4910, 4913, -4914, 4915, -4915, 4916, 4925]) { sil(3600); out.push(v); sil(3599); }
  sil(3600); tone(36, 6553); sil(3564);
  sil(28800);
  return Int16Array.from(out);
}
```

The WAV is the plain 44-byte header of `tests/recordings/make-inputs.mjs` (`clipWav`) at 24000 Hz, then the
samples.

| What the clip holds, in order | Why |
| --- | --- |
| 0.5 s of silence | the first chunk of a press is up to 6000 samples (read, finding 28), and it should be quiet |
| five 1 kHz bursts of 1.0 s at a quarter of full scale, each followed by 1.2 s of silence | plain loud phrases with pauses longer than any hold of the record's table up to 24.3 days; the steps-only entry on the hold and the `queue` steps use them |
| a 1 kHz tone at −38 dBFS for 1 s, 0.5 s of silence, the tone at −35 dBFS for 1 s | the record's two tones: the first stayed shut and the second opened (measured, Set J, finding 28) |
| a 1 kHz tone for 8 s whose mean of absolute samples rises from 0.90% to 1.10% of 32767 and falls back | chunks on both sides of 1.0%, close to it |
| eight single samples of 4905 to 4925, of both signs, 0.3 s apart | chunks whose largest sample lies on both sides of 4915 |
| a 1.5 ms burst at 0.2 of full scale | the record's burst, which opened by its peak alone (measured, Set J) |
| 1.2 s of silence | the file loops |

The clip is this order's choice. It has not been played into Steam (not built yet). Computed by the planning
run from the code above, on Node 22.23.4: 679,200 samples (28.3 s), 1,358,444 bytes, SHA-256
`3e02aaa585001e562e133aea7985bce4208563e39c00655d153f34b88e873fde`. The builder's file must have that
checksum; the suite pins it apart from the script's own copy, as it pins the two older clips
(`tests/reproduce.verify.mjs`, `PINNED`).

`inputs <folder>` (`tests/reproduce/inputs.mjs:72`) writes it beside the two it writes today and prints its
SHA-256 with the verdict. The two older clips, their names and their checksums do not move.

### What `gate` does

**The reader.** A file `tests/reproduce/steam-console.mjs` turns the text into numbers. It decodes the bytes
(UTF-16 with a byte-order mark, else as bytes, with a UTF-8 byte-order mark dropped), splits lines, drops a
trailing carriage return and an optional stamp, and matches a chunk line whole, from its first bracket to the
count at the line's end. It keeps, for each chunk line, the three marks and the four numbers. It keeps the N of
a `loaded` line and the place of each `loaded` and `looped` line among the chunk lines. It counts every other
line and keeps none. A line that begins as a chunk line (after the optional stamp: a bracket holding three
characters that are each `+` or a space, then ` [`) and does not read as one stops the check with the line's
number and no text, as `tests/voicequeue/log-to-fixture.mjs:40` and `:85` do for a voice line.

**With file 1 alone,** the marks are checked against the numbers printed beside them. The two limits come from
`STEAM_SENDER.meanMin` and `peakMin` (`steam-sender.js:69`, `:70`), so that the check tests the app's constants.

| Figure | Passes when |
| --- | --- |
| G1 | on every chunk line the first mark is set exactly when the second or the third is |
| G2 | on every chunk line the third mark is set exactly when the count of high samples is above 0, and exactly when the printed peak, as whole samples of 32768, is 4915 or more |
| G3 | on every chunk line whose printed mean is not 1.00, the second mark is set exactly when the printed mean is above 1.00 |

A printed peak gives the whole sample back: every peak from 0 to 32768 has a three-decimal print of its own
(computed in the planning run). A printed mean of 1.00 can lie on either side: constant chunks of 327 and of 328
both print 1.00, and the first fails where the second passes (computed in the planning run, on the built
sender). Such lines are counted apart and printed as a count. Lines of one sample (0.04 ms) are counted apart
from all three figures (measured: one such line in Set J; read: the code's mean of one sample is 0).

Printed as information, not part of the pass: the highest printed mean without the second mark and the lowest
with it (the print's form of the record's 0.9998% and 1.0315%); the highest peak without the third mark and the
lowest with it, in samples; how many chunks passed by the peak alone; and the chunk lengths, counted by value
for the six most frequent. With a microphone the lengths show the capture's step, which on the owner's PC is
31.25 ms (measured, finding 28) and is one PC's: the page asks for a report of them either way.

**With file 2,** every chunk is also recomputed from the clip, as W3-14 did. The check takes the chunk lines
that follow a `loaded` line whose N is file 2's count of samples, up to the next `loaded` line. It starts at
the clip's first sample, moves on by each line's length (the printed milliseconds times 24, rounded) and wraps
at the clip's end.

| Figure | Passes when |
| --- | --- |
| G4 | on every such line, the printed mean, peak and count are the clip's at that place: the count equal, the mean and the peak within one unit of their last printed digit (a choice, for the print's rounding) |
| G5 | on every such line, the three marks are what the rule gives on the clip's own samples: the second when the sum over the length is at least 327.67, the third when a sample reaches 4915, the first when either |

Lines of one sample are counted apart from G4 and G5. A line whose exact mean lies within one millionth of a
percent of 1.0 is counted apart from G5 (the code compares in 32-bit floats; read). Printed as information: the
highest exact mean that failed and the lowest that passed, to four decimals (the record's own clip gave 0.9998%
and 1.0315%, measured); the passes of the clip that the walk made, beside the count of `looped` lines; and
whether file 2 is the generated clip, by its SHA-256.

If the text holds no `loaded` line with file 2's count, the check looks for the one place in the clip where the
first five chunk lines fit, and says that it did. This search is the piece to leave out if the budget runs
short; without it the check says "differs", with the reason that the text does not start before the file was
loaded.

**"As expected" means:** every figure that applies passes, and the floor below is met.

### What `gate` refuses, and its floor

| Input | Result |
| --- | --- |
| no file, or more than two | cannot check |
| file 1 cannot be read | cannot check |
| file 1 holds no chunk line | differs: no chunk lines, with the variable to set |
| fewer than 50 chunk lines (a choice) | differs: too few to show the rule |
| no chunk line with the second mark, or none without it, among the lines whose printed mean is not 1.00 | differs: no chunk on each side of 1.0% |
| a line that begins as a chunk line and does not read as one | differs: its line number, no text |
| file 2 is not a 16-bit mono WAV at 24000 Hz | differs |
| file 2 given, and no place in it fits the printed numbers | differs: the text is not of that clip |

The peak rule has no floor of its own. When no chunk passed by its peak alone, the check says so on an
information line: the mean rule is then all that the log shows.

### The stand-in, by a route that does not pass by construction

The suite writes Steam's console text itself. Nothing of `tests/reproduce/gate.mjs` or
`tests/reproduce/steam-console.mjs` is used to write it.

- **The chunks.** A seeded list of read intervals of 48.0 to 63.7 ms, as chunk lengths of a file input: a first
  chunk of 6000 samples, then each interval times 24000, truncated. Two passes of the generated clip.
- **The numbers of a line** come from the suite's own sums over the clip's samples, in whole numbers, printed
  with the suite's own formatting.
- **The marks come from the built sender,** not from a rule written in the suite. One sender is made for each
  chunk, with a clock that gives that chunk as its first read and `lead` 0, and the chunk is pushed: the first
  mark is whether a phrase opened (`info().spurts.length`). The same with `meanMin` set far above any mean
  gives the third mark. The second mark is the first where the third is off, and the whole-number form
  `100 × sum >= 32767 × length` where it is on. The clock option refuses a chunk over 2250 samples
  (`steam-sender.js:239`), so the first chunk, which is silence, has its three marks written as spaces. The
  planning run tried this route on the model: about 1,010 chunk lines in two passes, all four kinds of bracket,
  14 or 15 lines that print a mean of 1.00, the highest failing mean within 0.001 of 1.0% and the lowest
  passing within 0.001 above it, peaks of 4914 without the third mark and 4915 with it (computed, three seeds).
- **Lines worked by hand,** with their marks typed in the suite: constant chunks of 327 and 328; a single
  sample of 4914, of 4915 and of −4915; a chunk of one sample.
- **Around the chunk lines:** a `loaded` line and `looped` lines whose path is a marker folder and a marker
  file name; lines that hold a made-up account name and a made-up address as markers; stamps on one copy,
  none on another; one copy with carriage returns; one copy saved as UTF-16.

A pass on this stand-in shows that the check's reading and its rule agree with the app's sender on every
chunk. It does not show that Steam prints these lines so. That is the orchestrator's private run (below).

### The breaks that show the suite's tests fail

Each of these, made to the stand-in, must give "differs" and an exit other than 0: one first mark flipped; one
third mark set on a line with no high sample; one count of high samples set to 0 on a line that passed by its
peak; one printed mean raised from under 1.00 to 1.01 with its marks kept; one chunk line removed from the
middle, with file 2 given; another clip given as file 2; the quiet lines alone; no chunk line; 49 chunk lines;
a chunk line with text after its count.

Each of these, made to the code, must fail the suite: `327.67` read as `330` in the check; `4915` read as
`4916`; the "or" of G1 made an "and"; the walk's rounding of the length made a truncation; the reader printing
a line that it could not read.

## `queue`

### The claim, and its standing

Each speaker's voice waits in a ring of 22050 samples. A packet for a speaker with no channel opens one, and
the channel waits `ceil(0.1 × frames a second)` ticks before it plays, the packet's own tick counted. Each
packet of N samples adds N − 1. A channel ends on the first tick after the mixer has emptied its ring (read,
W3-03; findings 22, 23 and 24).

The record's measurement (finding 22; measured, Set G): the rule, replayed over 2,375 packets with the mixer's
demand taken from the log, gives the logged queue on every one of 9,808 ticks, and six faults put in on purpose
each fail somewhere. That replay ran through `logToFixture` and the replay of `tests/voice-channel.verify.mjs`,
the code this check calls. It does not test when the mixer pulls. Finding 23 has the lines before the queue can
fall at three frame rates (measured, Set G): 7 in 2 of 2 channels at `fps_max 67`, 10 in 4 of 4 at 100, and at
300 30 in 19 of 28, 31 in 8 and 32 in 1. That count was made by the plan's scratch scripts, not by repository
code.

### Why the pass line is not the old one

The old order asked every fault to fail somewhere. A log shows a fault only where the thing happened. Measured
by the suite `voice-channel` on its own log at 66.67 frames a second: the ring a sample longer or shorter
mismatches nowhere, since nothing overflows there (finding 23 has the same of Set G at 67 and 100). Measured in
the planning run on nine logs written from the second model: "no grace" mismatches nowhere in eight, since a
grace is rare. So the faults are printed as information, as section 15 of RP-01 rules.

### Inputs, and what a stranger does to get them

```
queue <the game's console log> --fps <frames a second> [--section <marker>] [--buffer-ms <voice_buffer_ms>]
```

- **File 1, the game's console log,** written by the game with `con_logfile`.
- **`--fps`,** the frame rate the game ran at, as its frame counter showed it: a number from 10 to 1000.
  Needed: without it the check cannot run.
- **`--section`,** for a log that holds several runs, each started with a line `echo MARK67` (any word that
  begins with `MARK`); the tool reads one marked part (`tests/voicequeue/README.md`).
- **`--buffer-ms`,** only if `voice_buffer_ms` was changed from 100: 1 to 5000.

The steps the page gives, from `tests/voicequeue/README.md`:

1. The game with Steam voice, on a local server: `sv_voicecodec steam; map ctf_2fort`.
2. Once the map has loaded, one line:

   ```
   con_logfile voice_q.log; voice_loopback 1; voice_showincoming 1; voice_showchannels 1; cl_showfps 1; fps_max 300
   ```

   `voice_showchannels` is 1, not 2: 2 adds a line for each pull of the mixer, which the check refuses.
3. Type `+voicerecord`, press Enter, and speak a few phrases with pauses for 30 s; or let Steam play the 24 kHz
   clip as in `gate`. Type `-voicerecord` and press Enter. Read the frame rate off the counter while it runs.
   One speaker only.
4. For another frame rate in the same log: `echo MARK67; fps_max 67`, then step 3 again, and give
   `--section MARK67 --fps` with the counter's number. The record's runs were at 67, 100 and 300.
5. `voice_showincoming 0; voice_showchannels 0`. The log is `voice_q.log`. The record does not name the folder
   the game writes it in; the page says to look in the `tf` folder inside the game's folder, marked inferred,
   unless the brief gives the folder as measured.
6. `node tests/reproduce.mjs queue voice_q.log --fps 300`.

The page says, in bold: a console log holds player names and addresses; give it to the script and post only
what the script prints. It also says: hold the frame rate steady with `fps_max`, since the wait is counted in
frames and the check takes one frame rate for the whole part of the log.

### What `queue` does, and the code it reuses

| Code today | What the check takes from it |
| --- | --- |
| `logToFixture` (`tests/voicequeue/log-to-fixture.mjs:52`) and `FixtureError` (`:47`) | the log turned into events, with its counts (`stats`); its stops, whose messages are a line number and the tool's own words |
| `FAULTS`, `validFixture`, `replay` and `replayFixture` (`tests/voice-channel.verify.mjs:68`, `:79`, `:100`, `:118`) | the replay through `createChannel` of `voice-channel.js`, as the rule and once under each of the six faults |
| `synthesize`, with `SCRIPT` and `UNRELATED` (`tests/voice-channel.verify.mjs:172`, `:162`, `:157`) | the writer of a console log in the game's format, for the stand-in |
| `createReferenceChannel` (`tests/voicequeue/reference-channel.mjs:32`) | the second model of the channel, for the stand-in |

Moved, so that the suite `voice-channel` and the check load one copy:

- `FAULTS`, `validFixture`, `replay` and `replayFixture` go to a file `tests/voicequeue/replay.mjs`, exported,
  unchanged.
- `synthesize`, `SCRIPT` and `UNRELATED` go to a file `tests/voicequeue/synthetic-log.mjs`, with the
  `mulberry32` that `synthesize` draws from (`tests/voice-channel.verify.mjs:147`), which the suite then
  imports. `synthesize` gains one argument, the function that makes its channel, which
  `tests/voice-channel.verify.mjs` gives as `createChannel`. Nothing else of it changes.

`tests/voice-channel.verify.mjs` imports them. **Its output does not move:** `node tests/run.mjs voice-channel`
prints, line for line, what it prints on `main`, the times aside.

The check reads file 1 as bytes, calls `logToFixture`, replays the one section, and prints:

| Line | Kind |
| --- | --- |
| the packet lines, the tick lines and the other lines counted | information |
| the frame rate given, `voice_buffer_ms`, and the wait they give in ticks | information |
| channels opened, how many after a free the log did not print, graces, empty packets, sessions | information |
| **Q1: ticks on which the rule gives the logged queue: n of n, expected all** | the figure |
| each of the six faults with the ticks it mismatches, and the sentence "0 means this log cannot tell that fault from the rule" | information |
| channels by the tick lines from their first packet to the first fall of their queue | information |
| packets whose count is a whole number of 882-sample frames, and the others (silence records and empty packets) | information |
| pulls read from the log that are not whole blocks of 512 samples | information |

**"As expected" means:** Q1 holds on every tick, and the floor below is met. When Q1 fails and the rule with
the wait one tick longer or shorter mismatches nowhere, the reason says so and asks for the frame rate to be
checked.

The packet counts through the resampler's port (finding 29; RP-01, section 3) are not built by this order: a
log does not give a silence record's length at 24000 Hz, and the lengths the record used are one PC's capture
steps. The page keeps the record's figure in words.

### What `queue` refuses, and its floor

| Input | Result |
| --- | --- |
| no `--fps`, or one outside 10 to 1000; `--buffer-ms` outside 1 to 5000; not one file | cannot check |
| file 1 cannot be read | cannot check |
| no voice line | differs: no voice lines, with the two variables to set |
| pull lines (`voice_showchannels 2`); a second speaker or channel; two packets before a tick line; a voice line that does not read as one; any other stop of the tool | differs: the tool's own words and the line's number |
| `--section` given and no line is the marker | differs |
| fewer than 100 tick lines (a choice), or no channel from which the mixer took sound after its wait | differs: no channel played, so the log cannot show the rule |

The marker word of `--section` is the stranger's own and is never printed.

### The stand-in, by a route that does not pass by construction

The log the suite `voice-channel` writes comes from `createChannel` itself, so replaying it through
`createChannel` can only show the tool's reading. The stand-in of `queue` is written the other way:
`synthesize` is given `createReferenceChannel`, the second model, which was written from the order's
pseudo-code with plain arrays and no ring arithmetic. The check then replays that log through
`voice-channel.js`. A pass shows the two models agree on every tick, and the tool's reading.

The planning run tried the route twice (computed on the model). `synthesize`, copied as it stands and given
the second model in place of `createChannel`, writes the same two logs as it does from the module (565 lines at
300 frames a second, 468 at 66.67), and both replay through the module with no mismatching tick. Nine more logs
from the second model, by a log writer of the planning run's own at 66.67, 100 and 300 frames a second, 871 to
1,128 ticks each, replay with no mismatching tick.

The suite runs it at 300 frames a second, where the ring overflows, and at 66.67. It also holds: on the 66.67
stand-in the two ring faults print 0 and the check still says "as expected"; lines that carry marker strings
where a player's name, an address and a path would be are in the log, and none is printed.

### The breaks that show the suite's tests fail

Each of these, made to the stand-in, must give "differs": one queue line off by one sample (2 bytes) at an
opening, during a wait, at the ring's limit with a packet, and where the playing channel's mixer took nothing
(the four kinds of line `tests/voice-channel.verify.mjs:911` names; on a line where the mixer took sound a
change of one sample cannot be told from a true one, and the suite says so); the 300 log judged at
`--fps 66.67`; a pull line added; a second speaker's line added; the packet lines alone; 99 tick lines.

Each of these, made to the code, must fail the suite: the check replaying with `keepSample`; the check
printing "as expected" with a mismatching tick; the stand-in written from `createChannel` in place of the
second model (the suite holds, by the import it passes, that it is not).

## What stays safe to post

For both checks, on a passing run, a differing run and every refusal:

- No line of a file and no part of one. A chunk line that does not read is named by its number. The `loaded`
  and `looped` lines give a number and a count; their path is never kept.
- No path, no file name, no player or account name, no SteamID, no address, no map, no marker word.
- The suite's part [7] holds it: the stand-ins lie in the marker folder under marker names
  (`tests/reproduce.verify.mjs:106` to `:118`), their texts carry marker strings in the places above, and no
  marker may appear in anything a run prints.

## What happens to `hold`

`hold` is not built by this order. It stays on the page as a steps-only entry, "The hold and Steam's clock",
marked "no script yet", and in the list of the script as not built yet with no order named.

**Why.** Section 15 of RP-01 found three things, and the planning run found a fourth.

1. **Steam's console does not show where a phrase ends.** Its marks are the chunk's verdict. The end shows in
   the game's packet lines, as a packet whose count is not a whole number of 882-sample frames: the silence
   record (finding 22). So any form of the check needs both logs, lined up packet for chunk. No repository code
   does that; the record's counts were made by scratch scripts (W3-14, W3-16's second read).
2. **The built sender cannot be fed a file input's chunks.** Its clock option refuses a chunk over 2250 samples
   (`steam-sender.js:239`; tried in the planning run with 6000). A file input gives up to 6000 (read, finding
   28). The second read worked around it with stand-in chunks of 750 samples and the log's verdicts.
3. **On a Steam that has run for days the printed lengths are not the times between reads.** They are the time
   since a 32-bit float of the last read's time (measured, Set J; finding 28). The times have to be rebuilt:
   each read's time is the float before it plus the chunk's length, and the float after it is that time rounded
   to the float's step for the uptime. Reads that brought nothing print no line and have to be placed, and after
   such a read the game's log has no silence record (measured: 2 of Set J's 12 ends). W3-14 and the second read
   did this with scratch code and placed 22 empty reads by a rule of their own. In repository code it is the
   rebuilding (a few lines), the placing of empty reads, a copy of the sender's states that takes long chunks,
   and the lining up of two logs: about 250 lines and their tests (guessed), none of it run on a log by code
   anyone else can run.
4. **Even on a Steam started that day, where the printed lengths are the times, one end in twenty lies too
   close to 0.4 s to call.** With reads 48.0 to 63.7 ms apart, 5.0% of phrase ends have a read within 1 ms of
   0.4 s after the last loud chunk's read, and a run of 18 ends holds at least one in 60% of runs (computed in
   the planning run from the built clock's intervals). A check that asked every end to fall where the rule puts
   it would say "differs" on most honest runs, so it needs a band, and the ends inside it counted apart.

A reduced form can be built: a file as the microphone, a Steam started within 18 hours, both logs of one
press, and the pass line "every end outside the band falls on the first read more than 0.4 s after the last
loud chunk's read" (the record's Set L run measured that edge between 399.4 and 403.1 ms). It would show the
0.4 s and not the dependence on Steam's uptime, which is the finding's point. It costs about 6 hours (guessed)
and is not ordered here. It is better specified against real pairs of logs: the owner's key run
(`docs/owner-runs.md`, "The key, for W3-11c") asks for both consoles at two uptimes.

**What the page's entry holds** (the builder writes it; every figure is the record's):

- The claim, with its standing: the hold is 0.4 s on a 32-bit float of seconds since Steam started (read,
  finding 28), and the table of finding 28 (computed).
- The measurements: on a Steam of 23.9 days every one of 12 phrases ended at the first read four steps of
  1/8 s after the last loud chunk, 389 to 514 ms in real time, on the 7th, 8th or 9th read (4, 5 and 3 of 12);
  on a Steam started 4.8 minutes before, the edge lay between 399.4 and 403.1 ms and phrases ended on the 7th
  or 8th read (5 and 32 of 37), never the 9th; the built sender, given each run's uptime, gives every end of
  both runs (18 of 18 and 12 of 12) and fewer when given the other's (all measured, Sets J and L, finding 16's
  paragraph on Set L).
- The steps, by hand, with both consoles: Steam's console as for `gate`, with a real microphone; the game's
  console with `voice_showincoming 1`. In the game's lines a phrase's last sound packet is the one before a
  count that is not a multiple of 882. With a microphone on the owner's PC that count was 2756 or 2757, or 1378
  or 1379 (measured, Set G, finding 22). Count the packets of the phrase, count as many chunk lines from the
  phrase's opening chunk in Steam's console, and count back from there to the last line whose first mark is
  `+`. How long Steam has run: restart Steam and note the time; for an old Steam the page names Windows' own
  record of when the process started, marked not tried (RP-01, section 14).
- That the steps were not followed in this form by anyone, and that a report of the counts is wanted.

`docs/FINDINGS.md`, entry 2, says under "Check it yourself" that with Steam's console "the same shows in
counts". Steam's console alone does not show the phrase's end. The builder changes that sentence to say that
the count needs the game's packet lines beside Steam's console, and points to the page's entry.

## Files

**May touch.**

- New: `tests/reproduce/gate.mjs`, `tests/reproduce/steam-console.mjs`, `tests/reproduce/steam-clip.mjs`,
  `tests/reproduce/queue.mjs`, `tests/voicequeue/replay.mjs`, `tests/voicequeue/synthetic-log.mjs`,
  `docs/reports/RP-01b-gate-queue.md`.
- Changed: `tests/reproduce.mjs` (the two entries, and `hold`'s words); `tests/reproduce/inputs.mjs` (the third
  clip); `tests/reproduce.verify.mjs` (the two checks' parts, the third pin, part [1]'s list);
  `tests/voice-channel.verify.mjs` (the imports in place of what moved, and nothing else);
  `tests/voicequeue/README.md` (one paragraph that points to the check); `tests/README.md` (the suite's row);
  `docs/REPRODUCE.md` (its opening, "What you need", a section on Steam's console, the sections `gate` and
  `queue`, the steps-only entry on the hold, "When a result differs", "Not built yet");
  `docs/FINDINGS.md` (the "Check it yourself" sentences of entries 1, 2 and 7, each to point to the page; entry
  2's as above); `tests/REFERENCE_2026.md` (added lines only: one dated entry beside "The script's later checks
  run on the game's files", with the 24 kHz clip's samples, bytes and SHA-256 and that it is this order's choice
  and not yet played into Steam, and what the suite measures on the model that the page cites).

**Must not touch.** `steam-sender.js`, `voice-channel.js`, every file under `engine/`, every other file the
site loads, every codec module, `sw.js`, `tests/voicequeue/log-to-fixture.mjs`,
`tests/voicequeue/reference-channel.mjs`, `tests/recordings/`, `tests/predictions/`, `docs/PROGRESS.json`,
`docs/PROGRESS-LOG.md`, `docs/README.md`, `CLAUDE.md`, the old order, and every recorded hash or pin of every
suite.

**The cache number does not rise:** no file the site keeps offline changes.

## Done means

Each line is a command the builder runs and the reviewer can break. The report shows the outputs.

1. `node tests/run.mjs reproduce` passes. `node tests/reproduce.mjs` lists `gate` and `queue` with their usage
   lines, and `hold` as not built yet; `node tests/reproduce.mjs hold` exits 3. If the suite passes a minute it
   is run as `flock /tmp/tf2ve-heavy.lock node tests/run.mjs reproduce`, and the report gives its seconds.
2. `node tests/reproduce.mjs inputs <folder>` writes three files. `steam_mic_24000.wav` has 679,200 samples,
   1,358,444 bytes and the SHA-256 above, on the builder's machine and on CI. **Must not move:** the two older
   clips' names, bytes and checksums, and the output lines `inputs` prints for them.
3. `gate` on its stand-in prints "as expected" with file 1 alone and with the clip, on the copies with stamps,
   with carriage returns and in UTF-16. Each break of "The breaks" under `gate` gives what that section says.
4. `queue` on its stand-ins at 300 and at 66.67 prints "as expected". Each break of "The breaks" under `queue`
   gives what that section says.
5. The suite's two network parts and its marker part pass with the two checks in. Each fails when the builder
   adds a `fetch(` to `tests/reproduce/gate.mjs`, opens a socket in `queue`, or prints a line of a file.
6. **Must not move:** the output of `node tests/run.mjs voice-channel`. The builder saves it on `main` and on
   the branch, the times cut, and `diff` shows nothing. It is run through `flock /tmp/tf2ve-heavy.lock`: it
   takes 82 s (measured in the planning run).
7. `node tests/run.mjs recordings miles site harness steam-sender` passes.
   `node tests/cache-number.mjs origin/main --report` says the number stays.
8. `git diff origin/main --stat` shows no file outside "May touch".
   `git diff origin/main -- tests/REFERENCE_2026.md` shows added lines only.
   `git diff origin/main -- steam-sender.js voice-channel.js engine sw.js tests/voicequeue/log-to-fixture.mjs`
   shows nothing.
9. Every figure on the page's two sections and its entry on the hold is the record's, with its standing and
   its finding's number. The report lists each with the line of the record it was copied from. What is this
   order's choice (the clip, the floors of 50 and 100, the one-digit tolerance) says so on the page.
10. Both sections of the page say "not yet run on a log of the game". The orchestrator lifts that after the
    private run.
11. The run on the branch's head is green: `verify` with the conclusion success.

## The orchestrator's private run, before the page is linked

Not a builder's step. Expected, each the record's figure (measured):

| Check | On | Expected |
| --- | --- | --- |
| `gate`, file 1 alone | Steam's console text of Sets J and L | every figure "as expected" on 789 and 590 chunk lines; the counts of lines that print 1.00 and of one sample are the run's own |
| `gate` with the clip | Set J's console text with each of its two clips | G4 on all lines but the one of one sample; G5 on all; 0.9998% and 1.0315% |
| `queue` | Set G's logs, each part with its frame rate | no mismatching tick: 9,808 in all |

A count that differs is a finding for the record before the page says the check was run. `gate` with the
generated clip stays "not yet run on a log of the game" until someone plays that clip into Steam.

## Stop and ask

- A check seems to need a change to `steam-sender.js`, `voice-channel.js`, a file under `engine/` or any file
  the site loads.
- The clip's SHA-256 is not the order's, on the builder's Node or on CI.
- A log written from the second model does not replay through `voice-channel.js` with no mismatching tick.
  That is a finding about one of the two models and is not tuned away.
- `node tests/run.mjs voice-channel` cannot print what it printed before.
- The brief does not give one of these, and the check cannot be written to hold either way: the printed form
  of the `loaded` and `looped` lines; whether a chunk line can carry text after its count; the encoding and the
  line ends of Steam's `console_log.txt`.
- A figure the page should carry is not in the record in that form, or two places of the record give it
  differently.
- Any step that would need a private file or a look at how a real log reads.

## What the reviewer attacks

- **The output on every path:** a chunk line with a marker after its count, a `loaded` line with a marker
  path, a voice line cut short, a file that is not text, a missing file, a wrong option. No marker and no line
  in anything printed.
- **The stand-ins' independence:** that `gate`'s stand-in takes its marks from the sender and its numbers from
  the suite's own sums, and that `queue`'s log comes from the second model. A stand-in made by the check's own
  code is a finding.
- **The floors:** each input of the two tables of refusals gives "differs" or "cannot check" as the table
  says, never "as expected".
- **The breaks,** each run; and a few of the reviewer's own.
- **The move:** `tests/voice-channel.verify.mjs` holds no change but its imports, and its output is the same.
- **The page:** each console line is one line to paste; `+voicerecord` and `-voicerecord` are typed apart;
  every figure against the record with its standing; nothing promised without "not built yet"; the entry on
  the hold says that Steam's console alone does not show a phrase's end.
- **The record's diff:** added lines only, each figure with its standing, nothing from a private file.

## Why no second reader

No render is computed differently, no constant changes and no finding's text is edited. The lines added to the
record say what a clip is and what the suite measures on the model. The orchestrator reads the diff. What the
private run then adds to the record is the orchestrator's entry. The plan itself is read by a different model
before the build, as `docs/PIPELINE.md` asks.

## The orchestrator's private look and rulings (2026-11-13)

The planner's questions (the planning report, "For the orchestrator's private look"), answered from the owner's
private logs. Counts and layouts only; every value shown in a layout is invented. Where this section differs
from the text above, this section holds.

### Steam's console text (measured, private)

Four files were read: the text copied from Steam's console in Set J (789 chunk lines), the text copied in Set
L's run with a real microphone (590), Steam's `console_log.txt` as saved after Set L (1,979) and the same file
as saved later (2,706).

- **The files overlap.** Every chunk line of the two copied texts is in the first log, in order, and the first
  log is the beginning of the second. So the record's "3,358 of 3,358 chunk lines in three files" counts 1,379
  lines twice: those three files hold 1,979 different chunk lines, and the later log 2,706. The correction goes
  into the record beside that sentence in the change that merges this order's build.
- **The pattern.** One pattern, held from the optional stamp to the line's end, fits every chunk line of the
  four files. No chunk line carries text after its count, and nothing stands between the stamp and the first
  bracket.
- **The marks against the printed numbers,** on all 2,706 lines: the first mark is set exactly when the second
  or the third is; the third exactly when the count of high samples is above 0, and exactly when the printed
  peak is 14.999 or more; no line with a printed mean of 1.01 or more lacks the second mark and none of 0.99 or
  less carries it. The brackets seen: `[   ]` 1,158, `[+++]` 1,261, `[++ ]` 277, `[+ +]` 10. The lowest printed
  mean with the second mark is 1.01 and the highest without it 1.00; the lowest printed peak with the third
  mark is 15.005 and the highest without it 14.984.
- **A printed mean of exactly 1.00:** one line in 2,706, without the second mark.
- **Lines of 0.04 ms:** one in 2,706 (Set J's), with a printed mean of 0.00, no mark and no high sample.
- **The run with a real microphone** was judged by the printed numbers: the counts above hold on all 590 of its
  lines. Their lengths are 62.50 ms on 441 lines, 31.25 on 142 and 93.75 on 7, and no other.
- **The `loaded` and `looped` lines** read as the order has them: `loaded voice input file <path>, 123456
  samples (5.1 seconds)` and `voice input file <path> looped`. N is a whole number and S has one decimal. In
  the log file each begins with the stamp; in the copied text neither does.
- **Other lines that carry the path.** The copied text also holds the typed command, after `] `, and the
  console's answer, `"mic_inputfile" = "<path>"`. The log file holds the answer with its stamp. The reader keeps
  none of them, as it keeps no other line.
- **Typing.** The path was typed bare, with no quotes, and had no space. It was set back with
  `mic_inputfile ""`, and the console answered `"mic_inputfile" = ""`. Each command was typed on a line of its
  own; two on one line was not tried.
- **Encoding.** All four files are plain ASCII with no byte-order mark. The copied texts end every line with a
  carriage return and a line feed. The log file does too, but for some lines that end with a line feed alone
  (433 of 10,711 in the first log).

### The game's console log (measured, private)

- **Encoding:** plain ASCII, no byte-order mark, every line ending in a carriage return and a line feed (two
  logs).
- **The folder** `con_logfile` writes in is not in any file the owner sent. The page says the `tf` folder
  inside the game's folder, marked inferred.
- **The six parts of Set G, replayed with the repository's code as it stands** (the fixture made from the logs
  earlier, through `tests/voice-channel.verify.mjs --fixture`): mismatching ticks.

  | Part (packets, ticks, opens) | fps | wait | rule | ring + 1 | ring − 1 | wait + 1 | wait − 1 | sample kept | no grace |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | 1 (1520, 6267, 20) | 300 | 30 | 0 | 4933 | 4933 | 1549 | 708 | 5781 | 181 |
  | 2 (126, 511, 2) | 66.67 | 7 | 0 | 0 | 0 | 496 | 498 | 510 | 0 |
  | 3 (141, 598, 4) | 100 | 10 | 0 | 0 | 0 | 555 | 559 | 595 | 0 |
  | 4 (130, 581, 3) | 300 | 30 | 0 | 504 | 504 | 13 | 4 | 494 | 0 |
  | 5 (223, 917, 3) | 300 | 30 | 0 | 839 | 839 | 63 | 18 | 877 | 0 |
  | 6 (235, 934, 2) | 300 | 30 | 0 | 882 | 882 | 0 | 19 | 865 | 0 |

  The ticks sum to 9,808, the record's count. At 67 and 100 the ring's two faults and "no grace" show nowhere;
  at 300 "no grace" shows in one part of four and "wait + 1" is missing from one. So the pass line "no
  mismatching tick, the faults as information" is the right one, and the page may give this table (the faults'
  counts with their frame rates, no part's name) with the standing measured.
- **`logToFixture` on the logs as saved:** the two logs that hold one run each read without a stop at
  `--fps 300`, with no pull off the 512-sample blocks. The third log holds marked parts and was read by
  `--section` when the fixture was made; it was not read again today.

### The questions on `hold`

Not answered now. They are asked again when `hold` is ordered.

### Rulings

1. `gate` and `queue` are built; `hold` is not, and stays a steps-only entry. It is ordered after the owner's
   run with both consoles at two uptimes, against those pairs of logs, not in the reduced form.
2. `queue` is built first.
3. `gate` takes any 24 kHz clip as file 2, and the 24 kHz clip stands as designed.
4. The resampler's packet counts are left out.
5. The floors of 50 chunk lines and 100 tick lines and the one-digit tolerance stand as choices, marked so; the
   private run of the built checks may move them.
6. The builder corrects `docs/FINDINGS.md` entry 2 as the order says.
7. The page's steps use what was measured above: the path typed bare from a folder with no space;
   `mic_inputfile ""` to set it back (measured), with "or restart Steam" kept beside it; each of Steam's
   commands on a line of its own (two on a line: not tried).
8. The reader takes a line feed alone and a carriage return with a line feed in one file. Reading UTF-16 stays,
   as a choice for a text an editor saved again; the owner's files were ASCII.
9. The check's information lines may print the bracket counts and the chunk lengths, as above. They are
   numbers the lines carry.
10. A plan reviewer reads this order before a builder starts (`docs/PIPELINE.md`).

## After the plan review (2026-11-13, the orchestrator)

A plan reviewer on the builders' model read the order as its builder would and said: build after these edits.
Every finding is taken. Where this section differs from the text above, this section holds; the section before
it (the private look) holds too.

### `queue`

1. **Every part of a log is marked.** The page's step 2 begins with `echo MARK300` and gives a log name the
   stranger has not used before (whether `con_logfile` adds to an older file is not in the record). Every run
   of the check is given `--section`. Without `--section`, when any line of the log begins with `MARK`, the
   check says "differs: the log holds marked parts; give --section". That is one more break for the suite.
2. **Honest runs that would fail Q1.** By finding 23 (read) one frame of 0.1 s or more during the wait ends it
   at once, and a PC that cannot hold its `fps_max` gives waits a tick short. So: the reason printed with a
   failing Q1 names a frame of 0.1 s or more and an unsteady frame rate, beside the wait one tick off; the
   page's first run is at `fps_max 100` and 300 is a second run for a PC that holds it; the page says to wait
   a few seconds after the map has loaded before the first press.
3. **The stand-in.** The reviewer tried it: `synthesize` given the second model writes, line for line, the log
   it writes from the module, on the suite's two seeds and on 120 more pairs of seed and frame rate (computed).
   So the stand-in shows the tool's reading and that the two models agree, which the suite `voice-channel`
   already holds over its own cases; the order keeps it, and the page and the report say that much and no
   more. The check "the stand-in is written from the second model" is a check on the suite's text (the import
   it passes). Marker lines take the place of the log's `UNRELATED` lines or stand at its head or tail: two
   unrelated lines in a row inside a channel are a session break to the tool
   (`tests/voicequeue/log-to-fixture.mjs:87`).
4. **The move.** "May touch" for `tests/voice-channel.verify.mjs` is the imports and the two calls of
   `synthesize` (`:863`, `:864`), which gain the argument. Each new file requires `voice-channel.js` itself:
   `FAULTS`, `validFixture` and `synthesize` read `VOICE_CHANNEL`, `replay` uses `createChannel`, and
   `replayFixture` uses `waitTicks`. `report()` stays in the suite and imports `FAULTS`. `mulberry32` is also
   used at `:314`, `:595` and `:1071`, and `UNRELATED` at `:801`, `:847`, `:868` and `:934`; the suite imports
   both. The replay-only mode (`--fixture`) must still work: the builder runs it on a fixture the suite writes
   and shows the output before and after.
5. **The section's name is never printed.** `logToFixture` puts the marker into the fixture's `name`
   (`tests/voicequeue/log-to-fixture.mjs:56`). `queue` prints no section name, and the suite runs it with a
   marker word of its own as `--section` under the marker part.
6. The four kinds of changed line are named at `tests/voice-channel.verify.mjs:898` to `:917`.

### `gate`

7. **Where the walk through the clip ends.** Not only at the next `loaded` line: also at the console's answer
   `"mic_inputfile" = ...` and at the typed command `] mic_inputfile ...`, each known by its fixed start,
   counted, and never kept. Chunk lines after them are judged by file 1's figures only. By W3-14's order (read)
   the same path typed again does not load the file again, so a second try in one Steam session has no `loaded`
   line; if the five-line search is cut for the budget, the reason then says to set the path to nothing and
   back, or to restart Steam.
8. **Breaks that reach G4 and G5 alone,** on the copy given with file 2: a printed mean far from 1.00 moved by
   0.02 with its marks kept (differs with file 2, "as expected" with file 1 alone); a printed peak under 14.9
   moved by 0.010 (differs with file 2); one length moved by 0.04 ms (differs); one line that prints 1.00 whose
   second mark disagrees with the clip (G5 differs). The lines worked by hand go in a copy used with file 1
   alone, or before the `loaded` line, so that the walk does not meet them.
9. **The stand-in's marks.** The reviewer tried the route: it gives the right marks for an ordinary chunk, for
   constant chunks of 327 and 328, and for a single sample of 4914, 4915 and −4915; it refuses a chunk over
   2,250 samples, as the order says; and for a chunk of exactly one sample it gives a mark where Steam prints
   none (read: the code's mean of one sample is 0). So lines of one sample get typed marks, never the route.
   The clock handed to each sender gives later reads of 750 samples, since a clock with no further read makes
   the sender throw or spin.
10. **File 2's form.** A file 2 that is not a plain 44-byte header and its samples is "differs": Steam reads
    from byte 44 on as sound (read, W3-14). The header's bytes are written in `steam-clip.mjs` itself;
    `clipWav` of `make-inputs.mjs` builds its own samples and is not imported.
11. **The clip's checksum is never printed for a stranger's file.** "Whether file 2 is the generated clip" is
    printed as yes or no.
12. **The page's step 6** says `mic_inputfile ""` (measured, the private look), with "or restart Steam" beside
    it. `steam://open/console` is W3-09's suggestion and is marked so, not "read".

### Both

13. **The record's entry.** Done-means 9 stands: every figure on the page is the record's. So the builder's
    dated entry in `tests/REFERENCE_2026.md` also holds, as measured (private, the orchestrator, 2026-11-13),
    copied from the section "The orchestrator's private look": the counts on the 2,706 chunk lines, the
    lengths of the real-microphone run, the layouts and the typing, the table of Set G's six parts under the
    six faults, and the correction that the three files of "3,358 of 3,358" overlap (1,979 different lines in
    them). The correction is a dated line beside that sentence; the sentence itself stays. The page cites the
    entry and does not give 3,358.
14. **The counts on the hold, for the steps-only entry** (the record, "The clock counts from Steam's start",
    with the private findings read again today): the 12 ends are Set J's file-input run on the Steam of 23.9
    days. The 18 ends are the file-input run on the Steam started 4.8 minutes before; the built sender gives
    18 of 18 and 12 of 12. The 37 ends are that evening's two runs together, the file-input run's 18 and the
    real-microphone run's 19; "the 7th read 5 times, the 8th 32 times, never the 9th" counts all 37. The entry
    says which count is which.
15. `hold`, with no order named, prints words of its own in the script's list (`tests/reproduce.mjs:66` would
    print "order undefined"). The markers start at `tests/reproduce.verify.mjs:105`. The suite's part [2]
    counts three "as expected" lines for `inputs`.
16. **If the budget runs short,** cut in this order: the five-line search, the reading of UTF-16, then the
    information lines that are not figures. The report says what was cut.

## After the build, the private run and the review (2026-11-13, the orchestrator)

The builder stopped on one question. The orchestrator ran both checks as built (the branch at `81a6d46`) on the
owner's private logs, and a reviewer read the build: merge after fixes. This section is the fix round.

### The private run (measured, private; counts only)

- `gate`, the console text alone: "as expected" on all four texts (789, 590, 1,979 and 2,706 chunk lines; G1
  to G3 on every line but the one of one sample and, for G3, the one that prints 1.00).
- `gate` with each of Set J's two clips: G4 and G5 on every walked line (392 of 392 and 396 of 396 on Set J's
  copied text; 392 of 392 and 996 of 996 on the log file, which holds the second clip's evening run too). The
  first clip gives 0.9998% as the highest exact mean that failed and 1.0315% as the lowest that passed, the
  record's figures.
- `queue` on Set G's six parts, each with its frame rate and, for the marked log, `--section`: Q1 on every
  tick, 9,808 in all. First falls of the queue, in tick lines from the channel's packet: at 300 frames a second
  30 lines in 19 channels, 31 in 8 and 32 in 1; at 66.67, 7 in 2; at 100, 10 in 4. The log with marked parts and
  no `--section` gives the "marked parts" reason.
- **A frame rate given too low passes Q1** (the builder's question, confirmed): the first part, logged at 300,
  judged at `--fps 100` says "as expected"; the 66.67 part judged at 60 says "as expected". The 100 part judged
  at 300 differs ("the queue moved during the wait").

### The ruling on the question: a second figure

Q1 alone tests the wait only from below. So `queue` gets a second figure, Q2, from what the check already
counts (the tick lines from a channel's packet to the first fall of its queue; W is the wait in ticks):

- channels whose queue never fell (a log cut while a channel waits) are counted apart and judged by neither
  part of Q2;
- every other channel's first fall is on line W, W + 1, W + 2 or W + 3 (a choice: the private logs have W to
  W + 2 in 34 channels; one more line is allowed because a packet that refills a full ring hides the mixer's
  pull from the log, which is inferred);
- at least one channel's first fall is on line W or W + 1 (measured: so in each of Set G's six parts).

"As expected" needs Q1 and Q2. When Q2 fails, the reason gives the wait and the lines the channels took, and
says that the frame rate given may be lower than the game's. The break "the 300 log judged at `--fps 66.67`"
then differs, and it goes back into the suite beside the reverse one. If a stand-in of the suite does not meet
Q2 at its own frame rate, that is a stop.

The page says what Q2 still lets through: a rate one tick of wait low (10 frames a second at
`voice_buffer_ms` 100) passes, and nothing was measured above 300 frames a second.

### The review's findings, all taken

1. **The walk's end at the typed command and at the console's answer is tested.** Removing both ends left the
   suite green. A case in part [12]: after the walked lines, `] mic_inputfile ""` and `"mic_inputfile" = ""`,
   then about 40 microphone lines; "as expected", with those lines counted as not walked. A second copy with
   the answer line alone.
2. **The place search sets a one-sample line apart, as the walk does:** such a line moves the place on by its
   length and rules no place out. A stand-in copy with one chunk split into one sample and the rest, inside the
   walk, run with and without its `loaded` line. (Dropping the one-sample rule from the walk left the suite
   green.)
3. **G4's "the count equal" is tested:** a break on the copy given with file 2 that moves one count of high
   samples from n to n + 1 on a line whose third mark is set. **The reading of big-endian UTF-16 is dropped:**
   the order and ruling 8 name a byte-order mark and the owner's files were ASCII; the reader takes UTF-16
   little-endian with its mark, and the page says to save the text as plain text.
4. **The words.** The page's "What a pass shows" for `queue` says the ring, the wait, the sample a packet and
   the grace are shown where the log holds them, and that a fault which prints 0 is not shown. The sentence "0
   means this log cannot tell that fault from the rule" is printed only when Q1 holds.
5. **The search is capped.** It may use at most 200 chunk lines (a choice); past that the check says
   "differs", that the text does not say where in the clip it starts, and how many places still fit.

