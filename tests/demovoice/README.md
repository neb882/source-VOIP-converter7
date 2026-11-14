# SourceTV voice packets

A SourceTV demo stores every voice message exactly as the server received it: Steam's own Opus packets, sequence numbers and end-of-transmission markers. Decoding them gives the sender's output with no game audio, mixer or receiver auto-gain. This is how the sender model (voice gate, DTX, encoder settings) in [REFERENCE_2026.md](../REFERENCE_2026.md) was measured.

Client demos made with `record` keep the voice messages but not their payloads, so use SourceTV.

The app reads demos itself ([`demo.js`](../../demo.js)): load a `.dem` in step 1. `extract.mjs` is the same reader on the command line. It decodes with the bundled libopus 1.1.5, Steam's release, and with CELT 0.11 for the legacy engine codecs.

## Recording

1. Run a dedicated server with SourceTV. SteamCMD app 232250 installs it; launch it with `+sv_cheats 1 +sv_alltalk 1 +tv_enable 1 +tv_delay 0 +map ctf_2fort`.
2. Join with the talking account (and, for a remote-listener take, a second account on another PC).
3. In the server console, run `tv_record voicetest`, play the test signal, then run `tv_stoprecord`. The demo is written to the server's `tf/` folder.

## Extracting

This needs Node 22 and the repository's `pnpm install`.

```sh
node tests/demovoice/extract.mjs voicetest.dem     # or: pnpm demo:extract voicetest.dem
```

It prints the demo's header and, for each speaker:
- frames and talk spurts
- DTX frames: 1-byte packets that the decoder answers with comfort noise
- frames lost before the server (sequence gaps)
- the bitrate while coding
- the Opus TOC configurations (13 = hybrid super-wideband, 20 ms)

It writes, per speaker, into `tests/demovoice/out/` (wherever the demo is; `--out <folder>` chooses another folder) and prints the folder:
- `<demo>.<speaker>.wav`: 16-bit at the codec's rate (24 kHz for Steam), each talk spurt at its demo tick
- `<demo>.<speaker>.packets.tsv`: every packet with its tick, kind (`opus`, `end`, `silence`, `celt`), sequence number and size
- `<demo>.<speaker>.frames.tsv`: the decoded frame log, one row per frame: its start, its code (0 nothing sent, 1 SILK, 2 hybrid, 3 CELT, 4 DTX, 5 lost and concealed) and its size. These are the app's frame codes (`FRAME` in `opus-codec.mjs`), which also have 6 late, 7 Speex and 8 VR12; a demo's voice, Steam's or CELT's, gives none of those three

Lost frames are concealed, DTX frames give comfort noise, and each end-of-transmission marker resets the decoder, as Steam's receiver does. When the packet carrying a marker was lost, the next spurt shows as a sequence number going backwards; if its tick is more than four frames after the write position, it starts a new spurt at its tick with a fresh decoder (`demo.js` explains the rule).

`--speaker <id>` keeps to one speaker.

### On the game's voice queue

```sh
node tests/demovoice/extract.mjs voicetest.dem --timeline game --fps 300 --buffer-ms 100
```

`--timeline game` also renders each Steam speaker whose voice is at 24,000 Hz the way the game plays it: the demo's own packets on the demo's own ticks, through Steam's decoder as read (16 bits, at most 10 frames concealed, a record cut at 17 frames, a message over 12 frames refused) and the receiver's voice queue (`voice-channel.js`) at the listener's `fps_max` (`--fps`, default 300) and `voice_buffer_ms` (`--buffer-ms`, default 100), with the game's defaults for the receiver's gain, `volume` 1, a sound device at 48,000 Hz and no room. It prints what the decoder and the queue did (messages refused, records cut, frames concealed, messages past the render's end, how often the queue opened, how many phrases joined it) and writes, per speaker:
- `<demo>.<speaker>.game-<fps>.wav`: the render, 16-bit at 48,000 Hz
- `<demo>.<speaker>.game-<fps>.phrases.tsv`: one row per phrase of the queue, with its start and end in the source's seconds, whether it opened the queue or joined it, how much later than the source its start (`offset_start_ms`, at the first sample 0.2 s in) and its end came out, the ms it lost to the queue's overflow, and its change against the phrase before (its start offset less that phrase's end offset)

A demo has the tick SourceTV wrote each message on, every fourth tick in the one demo measured, not the tick a player's client got it on, so the arrival times are known to about 60 ms (measured, finding 21). The listener's frame rate is not in a demo: try several. These files hold a player's voice like the others.

Speakers are named by SteamID. Demos and everything extracted from them contain players' SteamIDs and voices. Keep them out of the repository; `.gitignore` covers this folder's demos, WAVs, TSVs and `out/`, but not a folder you choose with `--out` inside the repository.

## History

The first extractor here was a separate program built on tf-demo-parser, with a Node script that decoded its dump, and it was the reference while `demo.js` was written. On the Set D demo, `demo.js`'s parser gave its 5148 records byte for byte, and `demo.js`'s decoding matched the dump decoder to one 16-bit step with the same libopus. Since then `demo.js` has been the one reader, tested in CI, and the older tool was removed.
