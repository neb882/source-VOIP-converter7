# W3-02e and W3-02f, planned again: the planning report

**2026-11-13.** A planner read the repository at `bc28875` (cache v45) and wrote one order of two parts,
[W3-02ef-lane-and-flat-rule.md](../work-orders/W3-02ef-lane-and-flat-rule.md). It takes the place of the sections
"W3-02e" and "W3-02f" of [the old order](../work-orders/W3-02-receiver-queue.md), written 2026-11-10. No app code
and no test was changed. The planner read no recording and no file of the game; every measurement below is of
the model, made in Node in a scratch folder with signals made by a script.

## What changed since 2026-11-10 that the old text missed

| The old text | What is there now |
| --- | --- |
| W3-02f edits `audio.js` and checks `grep -n "retime" audio.js` | `audio.js` was split (S3-02). The rule is in `engine/network.js`; its calls in `engine/render.js`; its refusals in `engine/render-stream.js` and `engine/steam.js`. `audio.js` names it in one comment |
| "`tests/verify.js` (section 10c goes; 10d stays, less its `RangeError` check)" | [10c] is in `tests/verify.js`. No section is labelled 10d: the refusals of the game's timeline are section 8 of `tests/render-channel.verify.mjs`, where one row is `retime` |
| "section [5c] has a check of the second form" | [5c] moved to `tests/steam.verify.js`, which has two blocks of the rule, the second under loss |
| not named | `tests/stages.verify.mjs` (W4-01b) names `retime` in four places: the engine's own option names, a case of an option changed alone, the block on what is kept, and `previewAllowed` |
| not named | `previewAllowed` refuses `retime` (`engine/render.js:308`) |
| not named | `steamTimeline` keeps `spans` for the rule alone, and `readOptions` keeps `seedNumber` for the rule's seed alone |
| "the alias `voice_retime` still works: it is the page's" | so it is: W3-02d-1 made it set `voice_timeline`, and added `migrateTimelineConfig` for old saved settings. Neither needs the engine's rule |
| `tests/predictions/PREDICTIONS.md` (the hashed-file note) | the hashed files are now the ten under `engine/` with `audio.js`, `reference.js` and others (`tests/accuracy.mjs:317-321`). Part f changes four of them in code |
| W3-02e: "the frame log, which W3-02c re-times to the sound" | holds: since W3-02c-2 `codecInfo.frameLog` is the played log. So the lane already draws an early phrase early. `README.md:94`, `docs/ACCURACY.md:31` and W3-02d-1's report say the lane was made for the file's own timing; by the code that overstates it |
| "a drop's `time` is in source seconds" | it is the render's second at which the skip is heard (`voice-channel.js:311-314`). Two drops can share a time, and a drop past the source's end was never heard (`:493`) |
| not named | the lane places a played slot 6.5 ms early: it takes off the codec's look-ahead, which belongs to the sent log (`app/visualizer.js:872-876`) |
| "`net_graph` … if it reads the frame log" | it reads counters only (`app/netgraph.js:25-38`). Nothing to do |
| "The real-take check lines a take up against the source spurt by spurt and is not changed by the option" | it lines the take up against the render on screen (`app/realtake.js:53-57`), which since W3-02d-1 is on the queue by default. Each delay is then take minus render, and an early start the two share shows no step |
| the builder's check: "a render with a 300 ms pause at 300 fps has at least one drop mark and the lane's frames under the early spurt's sound" | a pause of 0.3 s does not end a phrase of Steam's sender (its hold is 0.4 s, read), so no phrase starts early after it. The skips come where a phrase opens the channel (measured on the model, below) |
| "the count of steps near 5.8 ms is dropped" | on the page, yes. `tests/accuracy.mjs:259-275` counts the same class for the private table, and `docs/ACCURACY.md:158` already says the engine has no such operation. The order leaves both |
| `sw.js` (the cache version) in each part's files | the orchestrator sets the number at the merge (PROGRESS, 2026-11-12) |
| BC-4 was not written | on Steam voice jitter marks no frame late; a render with jitter has `codecInfo.arrivals`, totals only |
| W3-02d-2 was not written | a changed setting can re-render a longer source by itself, and each render without loss lines a loaded take up again (`app/render.js:613-617`) |

## Each place checked

Read at `bc28875`, by opening the file.

- `engine/network.js:1`, `:13-34`, `:36-84`, `:316`.
- `engine/render.js:12`, `:45-52`, `:94`, `:124`, `:137`, `:184-190`, `:286`, `:299-308`, `:405`, `:419`, `:460-469`,
  `:606-616`, `:624-625`, `:638-641`, `:662-692`.
- `engine/render-stream.js:29`, `:150-151`, `:195`, `:199-204`.
- `engine/steam.js:93-114`, `:186-253`, `:255-273`, `:377`, `:394`, `:440`, `:482`, `:488`, `:520-521`, `:540-559`.
- `engine/live-chain.js` (searched: it names neither `retime` nor `spans`).
- `audio.js:42`, `:92-101`.
- `voice-channel.js:140-186`, `:264-319`, `:389`, `:436-505`.
- `app/visualizer.js:337-357`, `:854-916`, `:1019-1071`, `:1436-1493`.
- `app/realtake.js`, whole.
- `app/netgraph.js`, whole.
- `app/console.js:351-362`, `:918-923`, `:1056-1066`.
- `app/render.js:509-542`, `:613-617`, `:753-779`.
- `reference.js:405-427`, `:451-520`, `:740-826`, `:958-962`.
- `audio-worker.js:104-118`.
- `tests/verify.js:10-21`, `:701-727`; `tests/steam.verify.js:425-470`, `:956-987`;
  `tests/stages.verify.mjs:110-262`, `:384-459`, `:515-527`; `tests/render-stream.verify.mjs:150-157`,
  `:1088-1096`, `:1241-1246`; `tests/render-channel.verify.mjs:322-336`, `:644-662`;
  `tests/browser.verify.js:384-404`, `:490-524`, `:630-662`, `:2164-2274`, `:2421-2458`;
  `tests/reference.verify.mjs:160-200`; `tests/accuracy.mjs:76-125`, `:160-175`, `:259-275`, `:300-319`,
  `:405-415`; `tests/retiming.mjs:1-80`, `:130`, `:218`, `:252`.
- `README.md:86-96`, `:161`; `docs/ACCURACY.md:8-32`, `:104`, `:150-170`; `docs/PAGE.md:175-177`, `:250`,
  `:300-375`; `docs/VOICE-PATH.md:80`; `tests/REFERENCE_2026.md:820-830`, `:1026-1036`, `:1500`, `:1601-1602`;
  `tests/predictions/PREDICTIONS.md:184-200`.
- The orders and reports the brief named, and `docs/work-orders/W3-02c3-live-channel.md`, "Files".

## What the planner measured

All on the model, in Node, with the engine loaded by `tests/lib/engine.cjs` from the worktree. The scripts are
in the session's scratch folder and are not in the repository. A builder re-establishes whatever a check rests
on.

**The signal.** Phrases of low-passed noise with ten harmonics of a gliding 120 Hz tone, each with 10 ms ramps,
at 48 kHz, starting at 0.4 s:

```js
// plan: [length of the phrase, pause after it], in seconds
function make(seconds, plan, seed0 = 7) {
  let seed = seed0;
  const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
  const x = new Float32Array(48000 * seconds);
  let t = 0.4;
  for (const [len, pause] of plan) {
    const a = Math.round(t * 48000), b = Math.min(x.length, Math.round((t + len) * 48000));
    let lp = 0;
    for (let i = a; i < b; i++) {
      const tt = i / 48000;
      lp += 0.3 * (random() - lp);
      let v = 0.25 * lp;
      const f0 = 120 + 30 * Math.sin(tt * 1.3);
      for (let h = 1; h <= 10; h++) v += Math.sin(2 * Math.PI * f0 * h * tt + h) / (h + 1);
      x[i] = 0.12 * Math.min(1, (i - a) / 480, (b - i) / 480) * (0.6 + 0.4 * Math.sin(tt * 9)) * v;
    }
    t += len + pause;
  }
  return x;
}
```

**The channel's info on 18 s of talk.** Nine phrases with pauses of 0.3, 0.3, 0.9, 0.25, 0.35, 1.2, 0.3, 0.3 s
(the first version of the signal, without the `0.6 + 0.4 sin` factor), `codec: 'steam'`, the engine's own seed:

| Render | Phrases of the sender | Skips | What else |
| --- | --- | --- | --- |
| `timeline: 'game'`, 300 frames a second | 3: opened, joined (244 ms early), opened | 21, 234 ms in all; the first two share one time and are 99.8 ms together | the played log's first slot of the joined phrase plays the source's 5.474 s at 5.23 s |
| the same with `jitterMs: 50` | 3: opened, joined (188 ms early), opened | 13, 298 ms in all | `arrivals`: 273 messages, 19 on the tick of the one before, up to 135 ms late |
| `timeline: 'game'`, 66.67 frames a second | 3, all opened | none | |

The pauses of 0.3 s ended no phrase: the sender made three phrases of nine. In every slot the channel has, the
played log holds a frame exactly where `channel.source` is not -1 and the sent frame at that source position is
not empty.

**Drops that are never heard.** A 440 Hz tone at 300 frames a second: of 1 s, one drop of 19.9 ms at 1.0217 s,
past the end; of 0.5, 0.8, 1.3 and 3 s, none past the end. With a room (preset 6) the render is 2.5 s long for
the 1 s tone, so the render's own length does not say which drop was heard.

**A take with other early starts.** Twelve phrases (the generator above) with pauses of 0.95, 1.0, 1.05, 0.9,
1.1, 0.6, 1.0, 0.97, 1.02, 0.92, 1.4 and 1.0 s, 30 s. A "take" is a `'game'` render at 300 frames a second with
another seed, delayed 1.2345 s, at 0.316 of its level, with noise at 1e-4. It was lined up with
`TF2Reference.track` and the frame gate's phrases, against the render at the engine's own seed.

- At the engine's own seed phrases 5 and 11 start early (303 and 321 ms). At seed 1, phrases 5, 9 and 11 (309,
  344 and 343 ms).
- Lined up against the render on the queue, the take of seed 1 shows one step, at phrase 9 (344 ms). The two
  early starts it shares with the render show none. Lined up against a render on the file's own timing, or
  against the source, it shows all three.
- By the rule of the order's part e, point 6 (the step, plus the guide's own change at that pause): takes of
  seeds 1 to 8, each lined up against the render on the queue and against a render on the file's own timing,
  eleven changes each. The kind of the take's change (early, kept, late at 80 ms) was the kind its own
  `channel.spurts` give in 176 of 176. The largest error of a change was 50 ms.
- The report's level line for those takes: 0.8 to 1.1 dB rms against the render on the queue, 0.5 to 1.3 dB
  against the render on the file's own timing. The takes differ from the guide in their skips, so neither is 0.

**The trial removal.** In a copy of the tree in the scratch folder the rule was taken out of the four engine
files as part f says, `spans` and `seedNumber` with it.

- With the tests as they are on `main`: `tests/verify.js` fails in [10c]; `tests/steam.verify.js` stops at its
  first block of the rule; `tests/render-channel.verify.mjs` fails its row `retime on` and passes the rest;
  `tests/render-stream.verify.mjs` fails the two refusal checks and passes the rest, every recorded render
  among them; `tests/stages.verify.mjs` fails the check of the lists and stops at the block on what is kept.
- With the tests changed as part f says ([10c] rewritten, the two blocks of `tests/steam.verify.js` gone, the
  lists and the two checks of `tests/stages.verify.mjs` as written with the new check from warm stages, the
  refusal checks and the row gone): `verify`, `render-channel`, `steam`, `stages`, `render-stream` and
  `output-stage` pass by `node tests/run.mjs`, every recorded render among them. The new check of
  `tests/render-channel.verify.mjs` was not written in the trial; a script of the planner's found a `'game'`
  render given `retime: true` equal to the one without it in samples and `codecInfo`, and `createRender` not
  throwing. On `main` both throw.
- The trial did not bring the comments up to date, did not touch the documents, and did not run the browser
  suite or `pnpm test` whole. Those are the builder's.
- On `main`, the source of [10c] at seed 3 has three spurts moved by the rule on `steam`, on `celt_22` with the
  gate on, and on `speex` with the gate on.

## What could not be settled

- **Whether a real take lines up as well against a render on the queue.** The model's takes do. A recording
  has the game's own skips and its own draw of the sender's clock. The first private look below measures it.
- **Whether the count of phrase starts holds on a recording.** It was checked on takes made from the model's own
  renders. The second private look compares it with `tests/retiming.mjs`.
- **Whether the take's phrases should come from Steam's sender.** The page and `tests/accuracy.mjs` share the
  20 ms frame gate (W3-11's decision 9). Moving the page alone would split the two methods; moving both changes
  what the private table measures. It stays under `deferred` in PROGRESS, and needs the takes.
- **What the planner's signal does in the browser.** There the source passes through a 16-bit WAV. The draws
  may differ from Node's, so the order has the builder measure again.
- **The words.** The hover's parts, `silence`, the legend's item and the sentence on phrase starts are the
  planner's wording. The order fixes them so that checks can hold them; the owner may want others.
- **A live take on the queue.** W3-02c-3 is not built yet. Whether a recorded live take carries the queue's
  info is that order's to say.

Seen and left: `net_graph`'s title for the loss figure on Steam voice says "concealed or late"
(`app/netgraph.js:42-43`); on Steam voice no frame is late since BC-4a unless a test's own mask makes one. The
file is outside both parts.

## For the orchestrator's private look

Numbers only leave the private repository. Neither look blocks part f.

**1. The panel on a real take, on the queue and on the file's own timing. Before part e's build, on `main`.**
It settles ruling 5 and the sentence on the clock in part e's documents.

1. `pnpm dev`, the page with every setting at its default (Phrase timing on the game's voice queue, `fps_max`
   300).
2. Load the source of the owner's speech take (the take `docs/ACCURACY.md:11` scores, with its 9 changes between
   phrases). Wait for the render.
3. Open "Compare with a real TF2 take" and load the take, with its channel as `tests/accuracy.takes.json` names
   it.
4. Write down from the status line: the pieces, the least and the greatest delay, the clock in parts in a
   million, the correlation. From the report: the short-term level line (rms, worst, r) and the worst band.
5. Set Phrase timing to "The file's own timing". Wait for the render and for the take to be lined up again.
   Write down the same.
6. The same two readings for the network signal's take (pauses of 240 ms).

What the planner expects: on the queue the clock reads within about 150 parts in a million of 0, against about
+400 on the file's own timing (inferred: that render drops one sample from every packet too); the level's rms
within 0.5 dB of the other reading; the correlation within 0.1. If the level is worse by more than 1 dB or the
correlation falls by more than 0.1 on the queue, ruling 5 is open again and part e waits.

**2. The count of phrase starts on a real take. After part e is built, on its branch, before the merge.**

1. With the page of the branch, repeat steps 1 to 5 above. Write down the sentence "Phrase starts: …" of each
   reading (N, T, R, G) and the line of changes under it.
2. `node tests/accuracy.mjs --takes <takes folder> --json <file>`, then
   `node tests/retiming.mjs --accuracy <file>`. In its first table, "Transitions", count the entries of the
   speech take marked `E`.
3. On the file's own timing T is that count: both line the take up against a render on the file's own timing
   and call a change of -80 ms or less early. On the queue T is that count, or one from it. A larger difference
   means the rule of part e, point 6, does not hold on a recording, and the part is not merged as it is.
4. R on the queue is the page's one draw. It need not be the take's: the documents give 57% as the mean share
   of changes a render gets right on this take.
