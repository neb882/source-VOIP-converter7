# W3-02c-2: a render runs the receiver's voice channel, behind an option

The builder's report. The order is `docs/work-orders/W3-02c2-render-channel.md`, with its rulings of 2026-11-12,
which win over the text below them. Branch `claude/w3-02c2-timeline-option`, from `main` at `90d296e` (cache v37).

**Status:** built. Every check the order's "Done means" lists passes, and each new check was shown to fail with the
code it covers broken. No recorded hash moved. None of the order's stop-and-ask cases was met. Three statements of the
order do not hold exactly on today's code; each is below ("Where the order and the code differ"), with what was built.

## Commits

| Commit | What |
| --- | --- |
| `f8fed7b` | `voice-channel.js` joins the five lists (`index.html`, both workers' `importScripts`, `ASSETS` in `sw.js`, `ENGINE_FILES`); the harness's check and the browser suite's check of the loaded modules gain `TF2VoiceChannel` |
| `330b3da` | the engine: the refusals, the option's reading, the channel's path in `steamTimeline`, `process()` and the stream; the two comments in `engine/mix.js` and `engine/room.js` |
| `395479a` | `tests/render-channel.verify.mjs` (group `engine`), its row in `tests/run.mjs`, the cases of `tests/stages.verify.mjs` |
| `2c1e589` | the recorded renders on the game's timeline in `tests/render-stream.verify.mjs` |
| `290f014` | check 7's holdback line run with the gate on (below) |
| `dd46e82` | the documents of the order's section 6 |
| merges and this report | `origin/main` merged before the hand-back |

The order of work was the brief's, but the refusals, the channel's path, `process()` and the stream went into one
commit (`330b3da`): they were written together and tested together.

## What was built

**The option.** `steamGameTimeline` in `engine/steam.js` decides `opts.timeline` for both renderers, at their entry:
`process()` calls it inside `readOptions` (after the room and the other options are read, so of two invalid options
the same one throws as before), `createRender()` after it has read its settings and before its own refusal of
`retime`. `undefined`, `null` and `'source'` are the source's timeline. `'game'` runs on `steam` with the codec on, no
`received` and no `retime`. Everything else is a `RangeError` whose message names `opts.timeline` and the reason:

| Asked | Message (after `TF2Audio: `) |
| --- | --- |
| an unknown value | `opts.timeline is 'source' or 'game' (undefined and null are 'source'), not "gmae".` |
| `celt_22`, `celt_44`, `speex`, `steam_48`, `miles` | `opts.timeline 'game' is refused here, not ignored: it runs on the steam codec only, and celt_22 has no sender model.` |
| the codec bypassed | `... with the codec bypassed (enableWarble false) no packet reaches the channel.` |
| `received` | `... a demo's received voice (opts.received) has no packets of the sender's to give the channel.` |
| `retime` | `... it and retime exclude each other; re-timing moves the spurts by a rule of its own.` |

`timeline`, `fps` and `bufferMs` join `AFTER_B_OPTIONS` (ruling 4), so they are in neither key and in
`READ_OPTIONS`. `fps` and `bufferMs` are handed to the module as given. `TF2Audio` gains no member (ruling 2), and
`previewAllowed` is not changed (ruling 8). There is no `opts.onMessage` (ruling 5).

**The channel.** `steamChannel` in `engine/steam.js` makes `TF2VoiceChannel.createTimeline` with `length:
voiceLength`, `fps`, `bufferMs`, `codecDelay: lookahead / 24000` and the gain object. The module is found as
`steamModules()` finds the sender; without it a `'game'` render throws an `Error` naming `voice-channel.js`. The gain
object: with the auto-gain on, `reset()` makes a new `createGain({ avgGain, maxGain, scale: voiceScale })` and
`process(y)` runs it over the packet, a late frame's samples passed around it with the spans `add` uses; with it off,
`process(y)` is `roundEven(clamp(fround(y x voiceScale), +-32767/32768) x 32768) / 32768` (see below). The wrapper keeps
what each `push`, `advance` and `finish` returns, in order; `take()` joins it.

**`steamTimeline`.** `cfg.channel` is new. With one, `add()` runs as before but the gain is not given (the renderers
pass none) and `lay` returns at once; the packet goes to the channel on its message's tick: a sound packet as the
resampler's `Int16Array` over 32768 at `cursor + 882 x skipped`, a silence record's zeros at -1, an end marker alone
(arrived, no samples) as an empty packet at the cursor, a refused packet as an empty packet at its place, a lost
message not at all. `mark`, the cursor and the spans run as before, so `codecInfo.sent` is the source's frame log.

**`process()`.** Under `'game'` it makes the channel beside `steamTimeline`, gives `steamTimeline` no gain and no
`capacity`, and after the loop over B's messages (which still pauses once in 64) takes `finish()`'s info and the joined
output, `voiceLength` samples, where `timeline.take(voiceLength)` stood. Stage 4's scale and clip with `agc: false` is
not run. `onGain`, the mix, the room, the output stage and the length are untouched.

**`createRender()`.** The same channel. After each chunk's messages it calls `advance(bound)`, `bound = max(lastTick +
1, ceil((given / 24000 + relay) / tick))`, `given` the 24 kHz samples handed to the sender and `lastTick` the tick of
the last message made, lost ones included; `relay` and `tick` are read from `TF2SteamSender.STEAM_SENDER`. The bound
holds without touching `steam-sender.js`: a read's chunk is the capture steps ready by its time, a step ends no
earlier than its samples (`c0 >= 0`), so the read that will bring samples from `given` on has `since >= (given + 1) /
24000`, and every later read is later; a read with no samples makes its message during the push that ended the chunk
before it. `flush` returns the rest from `finish()`.

**`codecInfo` under `'game'`** (`steamPlayedInfo`, shared by both renderers): `frameLog` and `frameBytes` are new
arrays of the sent logs' length, slot `i` the sent slot `floor((source[i] x 24000 / 44100 + lookahead) / 480)` (the
same number as `x 80 / 147`: both are one correctly rounded division of the same rational), or 0 where `source[i]` is
-1 or `i` is past its end; `sent` holds the source's logs; `channel` is the module's `info`. The counters and `network`
are the source timeline's. A `'source'` render's `codecInfo` gains nothing.

**Nothing under `'game'` writes into stage B** (brief, point 4). The module neither keeps nor writes into the `pcm` it
is pushed: `createTimeline.push` reads its length and hands it to the gain wrapper, which makes a new `Float64Array`
from the gain's output; nothing stores the array. The packet pushed is `add`'s own `Float32Array.from(y16, ...)`, and
`y16` is the resampler's, made after B. The gain object returns new arrays (with a late frame it copies the packet
first). `made.blocks` is only read. So no copy was added.

**The comments.** `engine/mix.js` above `MIX_BLOCK_ORIGIN`: the game's timeline leaves the origin at 0, since `D` is a
whole number of blocks. `engine/room.js` at `resolveRoom`: a render on the game's timeline still calls `spurtStart()`
once; the live chain's channel (W3-02c-3, not built yet) calls it at each open. No code line of either changed.

## The default path

The diff of `engine/steam.js` adds statements to `steamTimeline` and changes none: `const channel = cfg.channel ||
null`; `if (channel) return;` as `lay`'s first line; in `add`, `if (channel) channel.push(...)` before the refusal's
`return`, after the gain's block and before the laying, and after the `if (pcm.length)` block for an arrived message
with no samples. With no channel each of these does nothing, and every statement `add` had runs as it ran. The rest of
`steam.js`'s diff is new functions and the export list. In `engine/render.js` the `steamTimeline` call passes
`gain: autoGain && !channel ? ... : null`, `capacity: channel ? undefined : voiceLength` and `channel` (null),
`steamVoice` is `channel ? channel.take() : timeline.take(voiceLength)`, and stage 4's test is `!autoGain &&
!r.game`: with the option absent each gives what it gave. `engine/render-stream.js` is the same, plus `lastTick` set in
the feed loop and the channel's branch in the steam stage's `push` and `flush`. Keeping `add`'s statements made the
channel's path no harder than a guard in `lay`.

## Where the order and the code differ

1. **Check 7, "with `advance` left out, `push` returns nothing while the source runs".** It does not, with the gate
   off: each `push` to the channel already gives out the blocks before its tick, and with the gate off a message comes
   at every chunk, so the holdback stays under `D` without `advance` (the break passed the check as first written, on
   the order's "seed 1, the gate off"). The line is run with the gate on (`290f014`): in the source's pauses no message
   comes for a second at a time, and only `advance` gives out what became final. Without it the line fails by 11,416
   samples over `D` at both rates.
2. **The rounding with `agc: false`, "clips to 16 bits".** Built as stage 4's clip, to +-32767 of 32768, after the
   product in single precision, then rounded to even: that is exactly the value the source's timeline brings to the mix
   entry (stage 4's `Float32Array` product and `hardClip`, then `mixSample`), which the second reader's item asks for.
   Checked over all 65,536 16-bit inputs at voice_scale 0.1, 0.3, 0.5, 0.7, 1, 1.3, 2 and 3: equal on every one. A clip
   to -32768..32767 with a product in double (the prototype's) differs on 1 value at 1, 592 at 0.7 (ties the double
   breaks the other way), 7,563 at 1.3 and 16,385 at 2 (the negative extreme). If the orchestrator meant -32768, it is
   a one-line change; no check of this order depends on that value. *Ruled in the fix round: the built rule is right;
   the orchestrator corrects the order's sentence. A check now holds it against the 'source' render ("The fix
   round").*
3. **"The module's blend of two neighbours, `trunc(a + (b - a) x 0.999)`".** The module carries its fraction from
   packet to packet, and it is 0.999 only to a few parts in 10^13 (`tests/voice-channel.verify.mjs` pins
   0.9989999999997963). That moves the truncation where `b - a` is a non-zero multiple of 1000, and the checks (3 and
   6) take either side of it there. *Corrected in the fix round:* the figure first given here, 17,252 missed samples,
   was wrong. It came from a debugging follower that ran from 8 s on through the fade, the silence and the next
   channel (another shift), and counted all of those. Measured again: in check 3, 10 to 30 s, 417 of 882,000 followed
   samples take the other side of the truncation, at each of seeds 1, 2 and 3; in check 6's fade line, 27 of the
   37,551 samples followed from 9 s to the fade. Without the allowance check 3 still passes and the fade line fails.
   With it the fade is exact on 4,410 of 4,410 samples.

Also not as the order writes it, and harmless: the order's figure for the stream's holdback was counted inside the
engine; counted from outside (check 7) it is 108 samples under `D` at 300 and at 66.67 fps (24,468 against 24,576;
13,204 against 13,312), the prototype's 141.

## Done means

Renders of the new suite use `deviceRate: 44100` and compare the voice at the mix point. Breaks were made in copies of
the sources in the scratch folder and run with `TF2_DIR`; the counts are of failed checks in the suite.

| Line | Result, mine (the order's or the prototype's) | The break, and what failed |
| --- | --- | --- |
| **Nothing moved** | `node tests/run.mjs all`: 26 of 26 suites passed (below). Every `GOLDEN` and `GAIN_GOLDEN` entry printed again by `--hashes` before recording: 152 of 152 lines unchanged | (a moved hash fails `render-stream` section 1) |
| 1. The module's render | equal, sample for sample and `info` member for member, at all 16 settings: the order's 15 and the gate off with loss 40% (the prototype: equal); across them pushed 2,346 sound packets, 74 records, 4 end markers alone, 8 refused packets, 273 lost messages not pushed; `waitTicks` 15 and 60 at `bufferMs` 50 and 200 | `source` without the look-ahead: 16 fail (`info`). A tick not the message's: 16 (first difference at sample 20,482 at 300 fps). A lost message pushed as an empty one: 6 (and 6c, opens 6). A refused packet not pushed: the 2 settings with refusals. The gain made once: 23. The rounding left out with `agc` off: the `agc` off, voice_scale 0.5 setting. `fps` not handed on: 19 (also checks 4, 5, 6). `bufferMs` not handed on: 4 (`waitTicks` 30 for 15 and 60) |
| 2. The logs | `sent` equal to the `'source'` render's logs, `network` equal (or absent on both), the counters equal, no `retimed`, the played logs equal to the slot rule worked in the test, at all 16 settings | the played slot without the look-ahead: 16 fail |
| 3. One sample a packet | `d(30) - d(10)` 356, 358, 360 at seeds 1, 2, 3 against 356, 357, 359 packets (the prototype: the same) | a packet pushed with its first sample doubled (nothing dropped): the 3 seeds fail (`d` grows by 0), and 6a, 6c and check 1 |
| 4. The layouts | every line inside its range; figures below | a new timeline for each spurt: 4 lines fail, Q's `spurts[1]` appended in 0 of 10 among them (and check 5, 4 runs, and check 1). `fps` not handed on: P's 500 ms offset at 66.67 fps, Q's `spurts[1]` opened in 2 of 10, `drops` at 66.67 not empty |
| 5. The gain reset at each open | opens 3, `gainResets` 3, one run after each open, 59 to 89 not zero, runs of 67 to 96 samples, seeds 1 to 10 (the prototype: 60 to 89 in runs of 67 to 96) | the gain made once: all 10 seeds fail |
| 6. Loss through the queue | one lost message: steps 72, 35, 73 against 72, 35, 72 packets (the prototype: 72, 35, 71 against 71, 35, 71); 0.26 s at 300 fps: opens 1, refused 1, `d` grew 14,174 against 882 x (2 + 14) = 14,112 (the prototype: 14,362 against 882 x 16); 1.5 s at 150 fps: opens 2, `gainResets` 2, the faded blend on 4,410 of 4,410, 72 samples of padding, then zeros to 11.308 s (the prototype: 4,407, about 150) | the source's silent time pushed as zeros: 6b fails (`d` grew 319). A lost message pushed as an empty one: 6c (opens 6). Nothing dropped: 6a, 6c |
| 7. The stream's bound | pieces of 10, 48 and 480: `process()`'s samples and `codecInfo`; holdback 108 under `D` at both rates, with the gate on | the bound one tick high: all three throw "push() takes messages in tick order" (the prototype: throws). `advance` left out: both rates fail, 11,416 over `D` |
| 8. The refusals | every row, from both renderers, a `RangeError` naming `timeline`; `'gmae'` too; `'source'`, `null`, `undefined` give the default render's WAV and `codecInfo` hashes | the profile's refusal removed: the 5 codec rows fail ("process() rendered") |
| 9. The seed | the same twice, other samples at another seed | the channel's `fps` drawn from `Math.random`: "seed 5 twice" fails (and 38 other lines) |
| 10. The live chain | `timeline: 'game'`, `fps` 66.67, `bufferMs` 200: the samples of a chain without, 182,100 samples | the live chain halving voice_scale under the option: fails |
| `render-stream` | seven `'game'` cases (the order's list; the room case has seed 7, so that the existing check that a room leaves the gain's output alone, which compares with a render on the source's timeline, does not take it in), at the chunk plans 7, 960, 12345 and whole; `process()` equal to their recorded hashes, the stream to `process()`, the spec's model of the output stage to the render, the room by hand for the room case | (the recorded hashes are the control) |
| `stages` | the three names among the engine's options; `timeline: 'game'` alone, `fps` and `bufferMs` alone on a base with it: each from B and equal to a fresh render, then the first settings again; section 1 runs the new cases; section 4: `'game'` at 300 and 66.67 fps, the first 14 s equal | `timeline` left off `AFTER_B_OPTIONS`: 15 fail (the new cases start from A, or the start) |
| `harness`, `site`, `browser` | pass; the browser check sees `TF2VoiceChannel.createTimeline` on the page and in the live monitor's worker | the module left out of each list in turn: `index.html`, `audio-worker.js`, `live-worker.js` fail `harness` [1]; `ASSETS` fails `site` ("needed and not listed: voice-channel.js"); `ENGINE_FILES` fails four `harness` checks |

**The layouts, seeds 1 to 10** (my figures; the order's asked range and the prototype's over 50 seeds are in the order):

| Line | Mine |
| --- | --- |
| P: the 300 ms pause makes no spurt | 20 of 20 renders |
| P: the 500 ms pause makes its own spurt | seeds 5, 7, 9 (the prototype: the same) |
| that spurt's `offsetStartMs`, 300 fps / 66.67 fps | -14.9 to -5.8 / +62.2 to +73.8 |
| Q at 300 fps: `spurts[1]` appended, its offset | 8 of 10, -354.4 to -234.6 |
| Q at 66.67 fps: `spurts[1]` opened | 10 of 10 |
| an opened spurt's `offsetStartMs` | 92 spurts, -29.7 to +38.0 |
| P / Q at 300 fps: `spurts[0].droppedMs` | 92.9 to 181.6 / 84.0 to 124.9 |
| P / Q at 300 fps: the spurt after 1.2 s, opened, `droppedMs` | 86.5 to 128.5 / 91.3 to 128.0 |
| 300 fps: `drops` | 7 to 24 entries |
| 66.67 fps: `droppedMs` 0, `drops` empty | 20 of 20 |

**How check 1 is independent.** Its reference calls `voice-channel.js` loaded by the test (`require`), the codec
module's `steamRoundTrip` wrapped to keep the messages and results, a `'source'` render's `onResampled` and `onGain`,
and `TF2Audio.createGain` (the engine's gain, which `tests/gain.verify.mjs` holds to its own transcription) inside its
gain object. It calls nothing this order added. The place is worked from the spurt's anchor, the cursor and
`skipped`, the refusal as `> 11264`, the late spans frame by frame, the rounding with its own `roundEven`.

## Differences from the prototype, and which is right

- **The `agc: false` rounding**: above (item 2). Mine gives the source's timeline's value on every input; the
  prototype's does not at voice_scale 0.7, 1.3, 2 and 3, nor at -32768 at 1. Neither the suite's settings nor the
  recorded cases reach those values, so no sample of this branch's checks shows it.
- **`add`'s channel branch**: the prototype returned early from `add` with copies of `mark`, the cursor, the spans and
  `laid`; mine runs `add`'s own statements and makes `lay` a no-op. Same samples; mine keeps the default path's
  statements (brief, point 2).
- **The output in `process()`**: the prototype wrote each push's output into one preallocated array; mine keeps the
  pieces and joins them at the end. Same samples; mine peaks a few MB higher (below).
- **`createRender`**: the prototype had no refusals and a test-only bound offset; mine refuses as `process()` does.
- **`onMessage`**: the prototype's hook is not built (ruling 5).
- The rest gave equal figures where both were measured (checks 1, 3, 4's seeds 5, 7, 9, the bound's throw).

## The whole output against "before"

"Before" is `node tests/run.mjs all` on a copy of `90d296e` in the scratch folder: 25 of 25 suites passed, 1,083.8 s.
The comparison takes each suite's lines with every time blanked and counts each line before against after.

"After" is the same on this branch's head after the merge of `origin/main` (`15d8c53`): 26 of 26 suites passed,
1,179.9 s. Every line of "before" is in "after" but these, each of which is the same check with a figure that moved:

| Suite | Lines that differ, and why |
| --- | --- |
| 17 suites (`vendor`, `gain`, `gain-exact`, `opus`, `speex102`, `vr12`, `reference`, `formats`, `filerate`, `video`, `demo`, `output-stage`, `voice-channel`, `steam-sender`, `swresample`, `verify`, `steam`) | none |
| `harness` | the three list checks (their detail names `voice-channel.js`), four "files read" counts (one file more under `tests/`), the renamed attach check |
| `site` | the counts of files, entries, suites and commands (one more each) |
| `miles` | the README's Accuracy section is longer (2,946 characters, now 3,182) |
| `meter`, `room-dsp` | two memory figures and one speed line, measured each run |
| `render-stream` | the counts of cases in three room checks (64 and 12, now 70 and 13; the tail list one longer), the total; 50 new lines for the seven cases |
| `stages` | the count of cases (76, now 83), the total, the list check's detail; 22 new lines |
| `browser` | the renamed module check; the count of the site's files (61, now 62); two correlations of the live take against a render, measured on a fake microphone each run (0.906 and 0.941, now 0.898 and 0.943; the check asks a peak at 0 samples, which both runs have); the console's timestamps and file names |
| `render-channel` | new |

## A ten-minute render: time and memory

A 600 s speech-like source at 48 kHz (`tests/render-stream.verify.mjs`'s generator, seed 6), `process()`, one render a
Node process, under the lock, on the shared four-core machine. "From warm B": stages warmed by a render at voice_scale
0.5, then three renders each taking B. Peak is the process's resident peak.

| | `'source'` | `'game'` | The order's prototype, `'source'` / `'game'` |
| --- | --- | --- | --- |
| fresh render, the gate on | 25.9, 25.2 s | 28.5, 27.5 s | 26.5 / 28.4 s |
| fresh render, the gate off | 32.3, 31.4 s | 34.5, 34.2 s | 32.6 / 34.8 s |
| from warm B, the gate on | 11.2 to 11.3 s | 13.2 to 13.7 s | 10.9 to 11.2 / 13.1 to 13.3 s |
| from warm B, the gate off | 13.8 to 14.6 s | 16.9 to 17.3 s | 14.3 to 14.9 / 17.8 to 18.2 s |
| peak memory, the gate on | 1,530 to 1,546 MB | 1,553 to 1,555 MB | 1,545 / 1,443 MB |
| peak memory, the gate off | 1,562 to 1,565 MB | 1,573 to 1,574 MB | 1,562 / 1,464 MB |

The channel adds 2.0 to 3.5 s; the stop line is 6 s. A `'game'` render peaks 7 to 25 MB above a `'source'` one; the
stop line is 100 MB. Neither is crossed. The prototype's `'game'` peak was about 100 MB lower than its `'source'`
peak; mine is not, because the channel's pieces and their join are both held at the end, as the source's buffer and
its `take()` are.

## Other figures

- **How much of a source's head and tail a `'game'` render loses** (the amendment's ruling 2 of 2026-11-11). All
  measured on the model, with scratch scripts, on noise that starts and ends with the source, `agc` off:
  - seeds 1 to 10, 10 s: at 300 fps the head 0 to 16.5 ms, the tail 0; at 66.67 fps the head 0 to 44.4 ms, the tail
    0 to 21.2 ms;
  - the worst head, from the second reader: when the opening message falls on tick 3 (21 of seeds 1 to 2,000; seeds
    133 and 172 rendered), 56.1 ms at 66.67 and 100 fps and 11.4 ms at 300 fps;
  - the worst tail, the opening on tick 9 (64 of the 2,000 seeds; 28 and 55 rendered) and on tick 10 (1 of them, seed
    1925), on 3 s of noise: 35.7 ms (tick 9) and 47.3 ms (tick 10) at 66.67 and at 100 fps, 0 at 300 fps (there the
    overflow at the opening takes the time back).
  The opening ticks of seeds 1 to 2,000: tick 3 in 21, 4 in 236, 5 in 514, 6 in 446, 7 in 433, 8 in 285, 9 in 64,
  10 in 1.
- **A lost silence record joins two spurts in `info.spurts`** (the amendment's section 3): with `opts.loseMessage`
  losing the first of four silence records of an 8 s source (seed 1, 300 fps), `info.spurts` has 3 spurts in place of
  4, the first running from -0.11 s to 4.38 s where there were two, -0.11 to 1.87 and 2.46 to 4.38;
  `network.lostMessages` is 1. No sample depends on it; it is left as built.

## The fix round

After the review and the second read (no blocker from either), the orchestrator asked for these:

| Item | Done | The break, and what failed |
| --- | --- | --- |
| SF-1: no check held the `agc: false` rule against the `'source'` render | beside check 3: loud noise (0.9), `agc` off, voice_scale 0.7 and 2, 150 fps; over 1,000 samples one shift makes the `'game'` voice the blend of the `'source'` render's voice made into whole values as the mix entry makes them (ties to even, the 16-bit clamp). Passes: of those 1,000 source samples, 120 on a half at 0.7, 100 at the clip at 2 | the order's literal rule (double product, clip to -32768..32767; the reviewer's x02): both scales fail. A double product with the ±32767 clip: 0.7 fails. `Math.round` for ties to even: 0.7 fails. "no shift fits" in each |
| SF-2: check 7's hold-back line only on a 24 kHz source | also on a 48 kHz source at 300 and 66.67 fps: 26 samples under `D` at both, and `process()`'s samples | the bound counting `given` at the source's rate (the reviewer's m12): both 48 kHz lines fail, 35,416 over `D` |
| SF-3: check 8 tried one wrong value | rows `''`, `0`, `false`, `'GAME'`: each a `RangeError` naming `timeline` from both renderers | falsy values taken as `'source'` and `'GAME'` as `'game'` (x07): those 4 rows fail |
| `blends()` one case too wide | the two values only where `b - a` is a non-zero multiple of 1000 | (the checks pass as before) |
| the "17,252" figure | measured again and corrected (item 3 above) | |
| a loud contract breach | `process()` under `'game'` throws an `Error` when the channel's output is not `voiceLength` samples; `createRender`'s `flush` the same, from a count of what its pushes gave out (one addition a push) | the channel made one sample short: `process()` throws "the voice channel gave 352799 samples for a voice of 352800", the stream "... gave 88199 samples for a voice of 88200" |
| documents | `docs/VOICE-PATH.md` (the gain's reset: once in the page's render, at each open in a `'game'` render), `docs/ACCURACY.md` (the row "no timing model"), `tests/README.md` (the suite's row); the figures above under "Other figures" | |
| x08, the late spans with `floor` | passes because a sound packet of `F` frames is exactly 882 F samples (480 x 147 / 80, the resampler's contract, `engine/steam.js`), so `round` and `floor` of `j n / F` agree. Over 30 scratch renders (loss, jitter, the gate off; 4,673 sound packets, 70 with a late frame) none was not; a silence record's length is not a multiple of 882, but it has no frames and takes no span. I did not see the reviewer's 7 of 539 and take them to be silence records or end markers | |

## CI and the cache number

The `tests` workflow on `2c1e589` (the engine, the suite and the recorded cases): `verify` success, run 43277195101,
5 min 27 s from the push. Each job from its start to its end: `units` 3 min 6 s, `engine` 2 min 21 s, `render`
5 min 16 s, `stages` 3 min 43 s, `browser` 3 min 30 s, `verify` 3 s. The new suite took 42.2 s of `engine` (`verify`
5.8 s, `steam` 84.9 s). The first commit's run (`f8fed7b`, run 43272409085) passed too. The run on the head is given
in the hand-back.

`node tests/cache-number.mjs origin/main --report`:

```
cached files changed since origin/main (15d8c53): audio-worker.js, engine/mix.js, engine/render-stream.js, engine/render.js, engine/room.js, engine/steam.js, index.html, live-worker.js, sw.js
cache number against origin/main (15d8c53): the number is v37, not above v37: it must rise (node tests/cache-number.mjs origin/main --set)
```

## The orchestrator's private runs (2026-11-13)

Run on main at `c199d3f` against the owner's recordings, which are not public. Only figures are given, and every
figure in this section is measured unless it says otherwise. The order's section "The orchestrator runs privately"
lists the four runs.

### The default render did not move

`tests/accuracy.mjs` on the four takes the order names (the speech take, `sender_A`, `net_baseline`, `net_loss15`)
gives the same result before the merge (`66d7b73`) and after it in every field but the time the work took. The
Set G replay (`tests/voice-channel.verify.mjs --fixture`) passes as before.

### Three takes lined up against a render that runs the queue

A scratch copy of the manifest added `timeline: 'game'` and `fps` to a take's settings. The suite then lines the
take up against that render. Where the render moves a phrase as the game did, the take's delay does not change
there. A change is counted when the delay moves by 80 ms or more from the end of one phrase to the start of the
next (the rule of `tests/retiming.mjs`). The owner's frame rate is 300 (finding 23). There are seven renders at
300 frames a second: one at the suite's own seed and six at the sender's seeds 1 to 6.

| Take | Changes between phrases | Moved, against the default render | Moved, against `'game'` at 300 (seven renders, sorted) | Moved, against `'game'` at 66.67 (one render) |
| --- | ---: | ---: | --- | ---: |
| the speech take | 9 | 8 | 0, 0, 1, 2, 5, 5, 6 | 5 |
| `net_baseline` | 12 | 8 | 0, 1, 1, 2, 2, 4, 5 | 8 |
| `sender_A` | 16 | 8 | 3, 5, 6, 6, 6, 7, 7 | 8 |

- **The clock.** Against the default render the three takes run +405 to +416 parts in a million fast. Against a
  `'game'` render they read between -39 and +9 in all 24 rows, and +2 to +9 in 19 of them. The one sample
  dropped from every packet (finding 24) is the takes' clock.
- **The frame rate.** At 66.67 frames a second the render moves almost no phrase, and the takes' changes stay.
  The wait follows the frame rate, as finding 23 reads.
- **Level in half-second blocks** follows where the phrases fall. For the speech take it is 1.01 dB rms against
  the default render and 0.29 to 2.81 over the seven `'game'` renders at 300. It is not lowest in the renders
  with the fewest moved phrases, and that is not explained.

### The same, transition by transition, over 30 seeds

A scratch script read `codecInfo.channel.source` of a `'game'` render of each take's source at the sender's seeds 1
to 30, took the change at each transition as `tests/retiming.mjs` does, and counted the seeds in which the render
has the take's kind of change (early, late or kept).

- **`net_baseline`, pauses of 240 ms.** The take alternates early and late over seven such pauses. At 300 frames a
  second the render has the take's kind at every one of the 12 transitions in 26 to 30 of the 30 seeds. At 66.67
  it has the take's kind in none of the 30 at those seven pauses and at the one after them.
- **`sender_A`, pauses of 420 and 440 ms.** Six of them follow a restart of the channel. At four of the six the
  take starts the next phrase early, by 306 to 335 ms. The render does so at those four in 2, 8, 6 and 15 of the
  30 seeds. So after a pause of this length the take's queue had more often not run out, and the render's more
  often has.
- **The speech take.** The render has the take's kind in 30, 30, 26, 19, 15, 13, 13, 5 and 2 of the 30 seeds over
  its nine transitions.

The score of `tests/retiming.mjs --engine`, with the real render's positions in place of the module run on a block
signal (30 seeds against 200):

| Take | Rate | Transitions right: block signal | Real render | No timing model | Start error: block signal | Real render | No timing model |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| the speech take | 300 | 47% | 57% | 11% | 122 ms | 99 ms | 150 ms |
| `net_baseline` | 300 | 70% | 93% | 33% | 81 ms | 35 ms | 85 ms |
| `sender_A` | 300 | 55% | 58% | 50% | 91 ms | 82 ms | 83 ms |
| the speech take | 66.67 | 21% | 29% | 11% | 148 ms | 170 ms | 150 ms |
| `net_baseline` | 66.67 | 35% | 31% | 33% | 89 ms | 91 ms | 85 ms |
| `sender_A` | 66.67 | 50% | 50% | 50% | 87 ms | 90 ms | 83 ms |

For `net_baseline` at 300 the whole pattern of 12 is right in 80% of the seeds (30% with the block signal).

### What a channel drops when it opens

In the lossless `'game'` renders of the network signal at 300 frames a second (five seeds, 45 channels opened), a
channel drops 82 to 173 ms to overflow, 116 ms in the mean. The game's own log, replayed, gave 55 to 136 ms over
16 restarts, 104 ms in the mean (finding 23). At 66.67 nothing is dropped, as in the logs. The render's queue
after a restart is therefore a little shallower than the logs'. That this is why the render's queue runs out at
the 440 ms pauses is inferred, not shown: it is the first thing to look at.

### The loss takes of Set C

The private measure of BC-1 was run again: the noise parts of the network signal, each render against the
lossless render of its own kind and seed, five seeds, mean (lowest to highest). The takes read as they did.

| At 15% (`net_fakeloss`) | Lost runs a second | Silent | Present | Energy |
| --- | ---: | ---: | ---: | ---: |
| the take | 3.90 | 10.1% | 76.9% | -1.5 dB |
| the default render | 4.31 (3.85 to 4.63) | 10.2% (3.7 to 15.7) | 81.0% | -1.2 dB |
| `'game'` at 300 | 4.28 (3.95 to 4.53) | 16.4% (7.3 to 25.8) | 76.5% | -1.5 dB |
| `'game'` at 66.67 | 4.22 (3.85 to 4.63) | 13.2% (5.8 to 18.9) | 75.0% | -1.7 dB |

At 5% the take has 3.12 lost runs a second and no silence. The three renders have 3.20, 3.27 and 3.23 lost runs a
second and 1.0 to 1.4% silent.

A lost run can leave the sound earlier or later than it was. Jumps of 30 ms or more across a lost run, at 15%:

| | Runs with a jump | Of 220 ms or more | Of 60 to 220 ms |
| --- | --- | --- | --- |
| the take | 13 of 79 | 11 | 1 |
| the default render | none | | |
| `'game'` at 300, by seed | 10, 18, 20, 11 and 11 of 76 to 90 | 4, 12, 7, 7, 10 | 4, 3, 11, 2, 1 |
| `'game'` at 66.67, by seed | 16, 18, 25, 8 and 20 of 78 to 92 | 0, 0, 1, 0, 0 | 16, 18, 21, 8, 19 |

So the jumps of 60 to 220 ms that a crude copy of the queue showed, and the takes lack, are what a queue at a low
frame rate gives. At the owner's 300 the channel gives the takes' kind, 220 ms and more, with some of the shorter
kind (1 to 11 a seed against the take's 1). The silent share at 300 is higher in the mean than the take's, and the
take is inside the seeds' range.

### What is open after these runs

- Why the render's queue runs out more often than the take's at a pause of 440 ms. What the channel drops when it
  opens (above), when the mixer pulls, and the sender's packets at an opening are the three places to look.
- The level blocks against a `'game'` render (above).
- More silence under loss at 300 than the one take has, on five seeds.

## The investigation that followed (2026-11-13, private; numbers only)

An investigator with the private record took the question the runs above left: why a render's queue runs out at a
pause of 420 to 440 ms where the take's more often had not. It changed nothing in the repository. Its scripts and
notes are in the private repository. Every figure below is measured unless it is marked.

**A correction to the section above first.** The orchestrator's scratch scripts for the counts over 30 seeds, for
what a channel drops when it opens and for the loss takes typed a gate threshold of -39.5 dB, the app's older
default, where the takes' manifest leaves Steam's own threshold in force (a mean of 347.1 against 327.67 in 16-bit
steps). The rows lined up by the accuracy suite were made at Steam's threshold. At Steam's threshold the counts by
transition read, for the sender's take, 30 30 30 2 2 8 8 23 6 6 22 15 15 30 25 30 of 30 (typed: 23 at the first
and 26 at the fifteenth, the rest the same), and for the speech take 19 30 30 2 9 15 12 25 13 (typed: 5, 13 and 26
at the fifth, seventh and eighth). The six pauses in question do not move. The re-timing scores, the opening drop
and the loss figures were not made again at Steam's threshold; they are made again when the change below is built,
which moves them in any case.

**The channel's clock is not the cause.** Given the game's own packets with their own ticks, the timeline gives the
logged queue: after a packet the difference is 0.0 ms in the median (quartiles -4.1 and +3.8, 1,863 packets, 28
channels of Set G). The queue at the last sound packet of a channel's first phrase is 488.4 ms in the logs (23
channels) and 488.4 ms in the renders (457 phrases). Whether a channel restarts follows from the messages' ticks
and lengths alone: a count-only copy of the channel and its clock gave the module's verdict in 1,406 of 1,406.

**The cause is in the sender's model, and it is the test signal's grid.** `steam-sender.js` cuts its capture steps
(750 samples at 24 kHz, 31.25 ms) from the render's first sample. The test signal's bursts begin and end on
multiples of 31.25 ms, so in a render every burst's edge falls on a step's edge. In Set D's session Steam's steps
lay 318 samples off the signal's edges (inferred: ten of the demo's spurts start at one offset of 126 samples from
the signal's marks). A 1 s burst then covers 33 steps and not 32, and Steam sent one step more of each burst than
the model does:

| At the eight bursts before the 440 ms pauses | Set D's demo | The model as built | The model, source 318 samples later |
| --- | --- | --- | --- |
| frames in the phrase, mean | 79.63 | 78.45 | 79.82 |
| ticks from the last sound packet to the next phrase's first | 37.5 | 39.67 | 37.86 |
| ticks from first packet to next first packet | 133.5 | 133.39 | not read again |

The second row is 27 to 31 ms of margin at a pause where the render's median miss was 26 ms. With any phase from 1
to 25 ms the render keeps the channel at 45% of such pauses after an opening (257 of 572); as built, at 20% (138 of
675). The take kept it at 4 of 6. Which of the six keeps it is close to a coin flip at this margin: the count by
transition against the take does not rise (76 of 180 as built, 74 of 180 with the phase). On the network take, if
its session's phase was near Set D's (not known), all 12 transitions come out in 25 of 30 seeds against 15.

The demo's own packets through the timeline put all six pauses within the demo's 4-tick blur of the threshold and
in the take's order (the four the take appended have the four largest margins in every reading of the grid); drawn
the way the sender's read clock allows, the take's exact pattern comes out in 93 of 200 draws. That is agreement
within the blur, not proof.

**The drop at an opening is not a difference.** A log replayed counts the least that can have been dropped. Counted
the same way, the renders give 96.4 to 103.2 ms against the logs' 98.9 to 102.2. The renders' own true figure is 113
to 126 ms, so the game's true drop is likely 15 to 20 ms above finding 23's 104 ms too (inferred). During the wait
itself, which a log shows exactly, the game drops 10 to 17 ms more than a render (67.8 and 72.9 ms against 55.7 to
63.0); two causes are named and neither was tested (the model opens on six frames in 17% of openings against 2 of
49 in the game; the logs' waits of 31 and 32 ticks).

**The speech take is not explained by this.** A phase does nothing steady there (the take's kind at the fourth
transition in 2 to 7 of 30 over eight phases), and neither does the capture's level within 6 dB. At the third
transition the render leaves out 265 ms in the median where the take left out 197; the two renders nearest the take
at the third also have its fourth and fifth (-100 and -109 against -102; 311 and 321 against 303). So the miss at
the fourth follows from 68 ms too much left out at the third, inside the sender's model, and what in the model does
it was not found. How long Steam had run moves that transition (its hold's float step), and no setting gives the
take's chain in more than a few seeds.

**What follows.** `voice-channel.js` needs no change. The sender's capture steps need a phase against the source:
Steam's capture runs free of what is played into it. That is an order of its own (PROGRESS, `next`); it moves every
recorded hash of a seeded `steam` render and the measured arrival figure of 50.5 ms. W3-02d is no longer held by
this question.

## Scanned

The branch's diff against `origin/main` and its commit messages were scanned for recordings, personal details, real
SteamIDs and model names: none, apart from the attribution trailers.

## Not done, or not checked

- The orchestrator's private runs (the accuracy rows, the Set G replay, the speech take and the loss takes on
  `'game'`) are not mine. They were made on 2026-11-13: see "The orchestrator's private runs" below.
- `voice-channel.js` is not in `MODEL_FILES` (ruling 9). No page control offers the option (W3-02d).
- The rounding to -32768 (item 2 above) is a reading of the order that the orchestrator may want otherwise.
- The fade check runs at one seed and one gap; the 0.26 s gap check at one seed, at the first gap after 10 s whose
  next message is refused.
- The `Error` a `'game'` render throws when `voice-channel.js` is not loaded is not checked by any suite.

## For the reviewer and the second reader

What I would look at first:

1. Check 1's reference (`referenceRender` in `tests/render-channel.verify.mjs`) beside `steamTimeline.add`'s channel
   lines and `steamChannel`: the place, `skipped`, the empty pushes, and the gain object's late spans.
2. The `agc: false` rounding and its clip (item 2): whether ±32767 is what the orchestrator meant.
3. The bound in `createRender` and the argument for it from `steam-sender.js`'s clock; the break that raises it by a
   tick throws.
4. `add`'s diff: inserted statements only, and `lay`'s guard.
5. The render-stream room case with seed 7, which stays outside the existing check that compares a room's gain output
   with the source timeline's.
