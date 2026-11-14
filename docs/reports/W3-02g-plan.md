# W3-02g, planned again: the planning report

**2026-11-14.** A planner read the repository at `main` `5e0f91f` (cache v47) and wrote one order of two parts,
[W3-02g-demo-packets.md](../work-orders/W3-02g-demo-packets.md). It takes the place of the section "W3-02g: a
demo's own packets" of [the old order](../work-orders/W3-02-receiver-queue.md), written 2026-11-10. No app code
and no test was changed. The planner opened no recording, no demo but `tests/demo/synthetic.dem`, and no file of
the game or of Steam. Every figure marked "prototype" below was measured in Node in a scratch folder, on packets
made by a script with the library the repository pins; the prototype is not in the repository. `main` moved to
`37135f7` while this was written (documents only: the review of W3-02c-3a and its fix list); the order was read
against it again and nothing in it changed.

## What changed since 2026-11-10 that the old section missed

| The old section | What is there now |
| --- | --- |
| "`createTimeline` takes the packets and their ticks from outside instead of making them" | it does already: `push({ tick, pcm, source })` (`voice-channel.js:435`). What a demo needs of it is another zero, since the built one holds the model's mean arrival time (`:93`, `:336`) |
| `packets: [{ tick, from, to, silence }]`, ranges of one decoded signal | the game's decoder makes other sample counts than `demo.js`'s decode for the same message (a gap over ten frames, a cut, a reset). A message now carries its records and one place, `at` |
| `codecInfo.channel.packets = 'demo'` | `channel.packets` is the count of packets pushed (`voice-channel.js:496`). A demo's render says so in `codecInfo.demo` |
| which decoder: left to a planner | settled in the order: the file's own timing keeps `demo.js`'s decode; the game's timeline runs `createSteamDecoder` (`opus-codec.mjs:213-241`) with a new call for one record, and FFmpeg's resampler port once per record |
| the 17-frame cut: "decide where it lives" | in `createSteamDecoder`, as `record(entries)`. It is built nowhere today (finding 29, `tests/REFERENCE_2026.md:1313`) |
| the 12-frame refusal | built for the model's packets (`engine/steam.js:45-52`, `:446-452`). A demo's message uses the same test, per message |
| the gain reset at each channel | built in `steamChannel` (`engine/steam.js:180-251`). A demo's packets go through the same object |
| `audio.js` | split into `engine/*.js` (S3-02). `process()` is `engine/render.js:470`, `createRender` is `engine/render-stream.js` |
| a demo's ticks: not said how they enter | `opts.arriveAt` (BC-4, `engine/steam.js:132-137`) is a function over the sender's ticks. It cannot cross to the page's worker and gives one arrival for each sender's tick. A demo's ticks enter as a member of each packet |
| the page: not planned | W3-02d-1 made the queue the page's default and gave a demo a reason line (`app/console.js:591`, `app/render.js:341`). BC-4b gave a demo its jitter line and the strip's cell (`app/console.js:616-629`, `:644`). W3-02e's lane follows `codecInfo.channel.source` (`app/visualizer.js:883`), which a demo on the queue will have |
| W3-02c-3 was one part | it is two. Part a is in review and changes `voice-channel.js` and `steamChannel`; the order names each place the two meet |
| "half a day" | 12 hours for the engine's part and 5 for the page's |

## Each place checked

Read at `5e0f91f`, by opening the file.

- `demo.js:83`, `:159`, `:186`, `:209-267` (`:226`, `:232`, `:236`, `:250`), `:300-353` (`:303`, `:314-321`),
  `:355`.
- `opus-codec.mjs:33`, `:213-241` (`:218`, `:226-237`).
- `voice-channel.js:80`, `:93`, `:110-113`, `:300`, `:320`, `:336`, `:435`, `:444`, `:496`, `:511`.
- `engine/steam.js:45-52`, `:100-112`, `:132-137`, `:180-251` (`:221`), `:261-271`, `:383-520` (`:440-452`,
  `:486`).
- `engine/render.js:86-88`, `:115-129`, `:307-308`, `:470`, `:495-498`, `:520-548`, `:636-651`, `:662`,
  `:677-712`, `:734`.
- `engine/render-stream.js:184-216`, `:251-252`, `:296-298`, `:361-363`, `:452`.
- `engine/codec.js:34-45`. `engine/network.js:196`, `:230`.
- `app/source.js:337-386` (`:358-371`). `app/render.js:320`, `:330`, `:339-343`, `:525-540`, `:776-778`,
  `:997-1009`. `app/console.js:382`, `:588-594`, `:613-629`, `:634-667`, `:673-688`. `app/visualizer.js:883-898`,
  `:1119-1142`. `app/realtake.js:53-59`. `index.html:154`.
- `tests/demo.verify.mjs:111-117`, `:455-462`. `tests/opus.verify.mjs:399-490`.
  `tests/render-channel.verify.mjs:648-652`. `tests/render-stream.verify.mjs:131-145`, `:216-217`.
  `tests/stages.verify.mjs:538`. `tests/browser.verify.js:709-768`, `:2352-2363`, `:2551-2577`, `:2660-2672`.
  `tests/demovoice/extract.mjs:1-40`.
- `tests/REFERENCE_2026.md`: findings 8, 9, 11, 21 to 26 and 29 (`:1285-1315`), and `:1076`, `:1520`, `:1530`,
  `:1541-1544`, `:1646`. `docs/PAGE.md:34-43`, `:174`, `:189`, `:196`, `:202`. `docs/ACCURACY.md:106`,
  `:117-120`. `docs/FINDINGS.md:133`.
- `docs/work-orders/W3-02-receiver-queue.md`: "The model", the amendment of section 10, "Rulings of 2026-11-11",
  the section W3-02g. `docs/work-orders/W3-02c3-live-channel.md`, with its fix list of 2026-11-14.
- The branch `origin/claude/w3-02c3a-live-channel` at `d073759`, by its diff against `main` in
  `voice-channel.js`, `engine/steam.js` and `engine/network.js`.

## The prototype

A copy of `voice-channel.js` with the zero as an option, the record rule of the order written over the pinned
library's decoder, the repository's resampler port, and the engine's gain left out. Its figures (all measured on
the prototype):

- **The record rule** gives the seven rows of the order's worked table. Two of them are Set J's logged counts,
  0 and 7,938 samples (finding 29).
- **Four phrases shaped as Set D's**, at 300, 100 and 66.67 frames a second: the order's table under "The zero".
- **`tests/demo/synthetic.dem` on the queue.** The first speaker's three messages are all refused: 10 concealed
  and 7 decoded (cut, 3 frames unread), then 3 concealed and 10 decoded, then, after the end marker, 7 concealed
  and 10 decoded. The render is silent. The second speaker's two messages are taken (7 concealed and 5 decoded,
  then 5). Both speakers begin at a number above 0, so ruling 7 decides what they give.
- **Two messages on one tick.** Every second message was held to the tick of the next, 60 ms later, so 62
  pairs shared a tick. At 300 frames a second every phrase stayed within 2 ms. At 66.67 the two phrases whose
  opening message was among those held started 58 and 61 ms late, and the one of them that had joined the queue
  opened it instead.
- **Ticks of 30 ms** with `tickSeconds` 0.03 give the samples of 15 ms ticks.
- **An empty packet 300 ms before a phrase:** at 300 frames a second the phrase plays in the channel the empty
  packet opened and starts 194 ms early; at 66.67 that channel has closed and the phrase opens its own, 3 ms
  late.
- **Cost:** 9.7 minutes of voice in 9,570 messages through the decoder, the resampler and the channel in 8.4 s
  and, run again, 9.6 s, on a machine shared with other agents.

## What could not be settled

- **The expected number of a decoder that has decoded nothing.** The render's decoder starts at 0
  (`opus-codec.mjs:218`). Steam's was not read. Ruling 7.
- **Whose ticks.** A demo has the tick SourceTV wrote a message on, every fourth tick in Set D (measured,
  finding 21). A player's client gets messages 3 to 5 ticks apart (measured, finding 25). So arrival is known to
  about 60 ms, and at low frame rates the bunching alone can move a phrase from joining to opening (prototype).
  The private look (ii) says whether the demo's render still agrees with a listener's take.
- **The listener's frame rate.** It is not in a demo. Set D's sender take has early starts of 306 to 335 ms
  (measured, finding 21). That only a long wait gives starts that early is inferred. The private look (ii) finds
  the rate.
- **Two messages on one tick as two packets in the game.** Inferred (finding 25: the engine adds nothing of its
  own). No log of a player's client has two on one tick.
- **A message with a sample-rate record and nothing else.** None is known. The order gives it no packet.
- **The unit of the 0.2 s behind which a silence record is dropped.** Read as a wait in the decoder's output;
  the order counts output samples (inferred). No message of Set D has two records, so nothing measures it.
- **Sound past the source's length.** The render keeps the source's length, so a last phrase that opens late
  loses its end. How much on Set D is step (ii).
- **W3-02c-3a's merged form.** Read on its branch at `d073759`. Its fix round of 2026-11-14 adds one run to section 10 of
  its suite and names no line this order meets (read).
- **The page's cost.** The prototype's 8.4 s and 9.6 s are Node's. The page's time for a ten-minute demo is measured by
  part a's builder in Node and by part b's in the browser.

## For the orchestrator's private look

Nothing but numbers leaves the private folder. No SteamID, no path, no sound.

### (i) Before part a ends: what Set D's demo holds

On `main`, with the script below saved outside the repository:

```
node look1.mjs <the repository> <Set D's demo> <the sender's SteamID>
```

It prints, for the speaker: the demo's tick length; `messages`; `perTick` (how many ticks held 1, 2, 3 messages);
`spacing` (ticks between one message's tick and the next); `frames` (messages by their count of frames);
`records` (messages by their count of type 0 and type 6 records); `rates` (sample-rate records by value);
`silence` (silence records by length); `over12` (messages of more than 12 frames); `empty` (messages with an
end marker and nothing else); `gaps` and `behind` (numbers ahead of and behind the expected one inside a
phrase); `zeroLength` and `short` (frames of length 0, frames that run past their record); `firstSeq` (the first
number after each end marker, and of the demo).

What the order needs from it:

| Figure | What it decides |
| --- | --- |
| the tick length | whether it is the float 0.015 |
| `perTick` above 1, `spacing` | whether Set D reaches "several messages on one tick"; the 60 ms |
| `frames`, `over12`, `gaps` | whether any message of Set D reaches the refusal or the cut. If `over12` and `gaps` are 0, Set D tests the path and the ticks only, and the cut rests on Set J (step ii) |
| `records` above 1, `silence` | whether the drop of a silence record can be reached |
| `empty` | whether Set D has key presses with no sound |
| `rates` | that every one is 24000 |
| `zeroLength`, `short` | whether ruling 6's rules are reached |
| `firstSeq` | that every phrase starts at 0, and what the demo's first number is (ruling 7) |

```js
// node look1.mjs <repository> <demo.dem> [speaker's SteamID]
import fs from 'node:fs';
import { createRequire } from 'node:module';
const [repo, file, want] = process.argv.slice(2);
const D = createRequire(import.meta.url)(repo + '/demo.js');
const parsed = D.parse(fs.readFileSync(file));
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
const by = new Map();
for (const m of parsed.voice) {
  const d = m.data;
  if (d.length < 12) continue;
  const v = new DataView(d.buffer, d.byteOffset, d.length);
  if (D.crc32(d, d.length - 4) !== v.getUint32(d.length - 4, true)) continue;
  const id = v.getBigUint64(0, true).toString(), end = d.length - 4;
  if (!by.has(id)) by.set(id, { messages: 0, perTick: {}, spacing: {}, frames: {}, records: {}, rates: {}, silence: {},
    over12: 0, empty: 0, gaps: 0, behind: 0, zeroLength: 0, short: 0, firstSeq: {}, last: null, n: 0, next: null });
  const s = by.get(id);
  let frames = 0, records = 0, ends = 0, silence = 0;
  for (let i = 8; i + 3 <= end;) {
    const kind = d[i], value = v.getUint16(i + 1, true);
    i += 3;
    if (kind === 11) { bump(s.rates, value); continue; }
    if (kind === 0) { records++; silence++; bump(s.silence, value); continue; }
    if (kind !== 6) break;
    records++;
    const stop = Math.min(i + value, end);
    for (let j = i; j + 2 <= stop;) {
      const len = v.getUint16(j, true);
      j += 2;
      if (len === 0xFFFF) { ends++; s.next = null; continue; }
      if (j + 2 > stop) break;
      const seq = v.getUint16(j, true);
      j += 2;
      if (j + len > stop) s.short++;
      if (len === 0) s.zeroLength++;
      if (s.next === null) bump(s.firstSeq, seq);
      else if (seq !== s.next) { if (((seq - s.next) & 0xFFFF) < 0x8000) s.gaps++; else s.behind++; }
      s.next = (seq + 1) & 0xFFFF;
      j += len;
      frames++;
    }
    i = stop;
  }
  if (!records) continue;
  s.messages++;
  bump(s.frames, frames);
  bump(s.records, records);
  if (frames > 12) s.over12++;
  if (!frames && !silence && ends) s.empty++;
  if (s.last === m.tick) s.n++;
  else { if (s.last !== null) { bump(s.perTick, s.n); bump(s.spacing, m.tick - s.last); } s.last = m.tick; s.n = 1; }
}
console.log('tick length (s):', parsed.intervalPerTick);
for (const [id, s] of by) {
  if (want && id !== want) continue;
  if (s.last !== null) bump(s.perTick, s.n);
  const { last, n, next, ...out } = s;
  console.log('speaker (do not copy the SteamID):', id, JSON.stringify(out, null, 1));
}
```

### (ii) After part a is built, on its branch before the merge

The tool's option is not built yet; part a builds it.

1. For F in 300, 250, 240, 230, 200, 150, 100 and 66.67:
   `node tests/demovoice/extract.mjs <Set D's demo> --timeline game --fps F --speaker <the sender's SteamID> --out <a private folder>`.
   Note what it prints: the messages, those on one tick with another, refused, cut, past the end; the channel's
   opens, joins and dropped ms.
2. From each `phrases.tsv`: for each phrase after the first, its change (its start offset less the offset at the
   end of the phrase before). Set these beside the 17 transitions that can be read in the sender's take
   (finding 21): early starts at spurts 4, 6, 9 and 13 of 335, 324, 306 and 328 ms, four returns, nine unchanged.
   The frame rate at which the same four phrases join, the same four return and the nine stay within 60 ms is
   the listener's. Say whether there is one, and how far the four early starts are off at it.
3. The same for the second listener's take, in which no phrase moved (finding 21): the highest F at which no
   phrase joins.
4. At the F of step 2: how many ms of the last phrase fall past the render's end (`pastEnd`, and the last
   phrase's `offsetEndMs` against the source's length).
5. Set J: the check of W3-11a's second read (524,256 of 524,288 samples with the cut done by hand, finding 29)
   made again with `createSteamDecoder().record()` walking each logged record. It should give the same count
   or more.
6. If step 2 finds no frame rate, part b is not built as written and ruling 3 is asked again.

### (iii) After part b, on the page

Set D's demo loaded, `fps_max` at step 2's rate, the sender's take loaded in the real-take panel: the panel's
line on phrase starts, and whether it names the four early starts as the render's.
