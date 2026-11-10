# W3-11: the plan after W3-07, W3-08 and W3-09

A plan, 2026-11-10, revised the same day after its review by a builder and again after a second read ("The
review" and "The second read", at the end). No app code
changed. It revised `docs/work-orders/W3-02-receiver-queue.md` (revision 3, then 3a), wrote three orders
(`W3-11-steam-gate.md` in two parts, `W3-12-speex-module.md` in two parts, `W3-13-steam-resampler.md`), one
investigation (`W3-14-steam-file-input.md`) and
proposes text for `tests/REFERENCE_2026.md` (not applied). Sources: the reports on main, the app's code, and
public open source (FFmpeg's libswresample at the tags `n6.1.1` and `n8.1.2`, read and, for 6.1.1, run as this
machine's distribution ships it; libopus 1.1.5; Xiph's Speex tags). No binary was opened and no private data
was read.

## The order of work

Everything not yet built. "Audio" marks the orders that change `audio.js`: they run one at a time, in this order.

| # | Order | What | Starts after | Audio | Golden hashes | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | W2-02 | the render stream (with the fixer) | merges first | yes | records them | |
| 1 | W3-02a | the channel, the log replay (in review) | | no | | 1 day |
| 1 | W3-12a | Speex 1.0.2 built and checked | now | no | | 1 day |
| 2 | W3-13 | the decoder's resampler, a module | now (a builder free) | no | | 1 day |
| 2 | W3-02b | `steam-sender.js` and the timeline stage | W3-02a | no | | 1 day |
| 3 | W3-05 | the gain as the engine's rule | W2-02 | yes | every case with the gain on | half a day |
| 4 | W3-06 | the CELT settings and rebuild | W3-05 | yes | the two CELT cases | 1 day |
| 5 | W3-12b | the `speex` profile on the new module | W3-06, W3-12a | yes | the `speex` cases | half a day |
| R | (the orchestrator) | findings 28 to 31 written into `tests/REFERENCE_2026.md` from the text below | **before W3-12b, W3-13 or W3-11a merges** | | | |
| 6 | W3-11a | the `steam` render sends and decodes as Steam does | W3-12b, W3-02b, W3-13 | yes | every `steam` case with the codec on | 2 days |
| 7 | W3-11b | the live chain, the threshold control, the words | W3-11a | yes | moves none | 1 day |
| 8 | W3-02c | the game's timeline behind an option | W3-11b | yes | adds cases; moves none | 1 day |
| 9 | W3-02d | the page: controls, the default | W3-02c | no | | 1 day |
| 10 | W3-02f | the flat rule retired | W3-02d | yes | moves none | 2 hours |
| 10 | W3-02e | the page: lane marks, the real-take words | W3-02d | no | | half a day |
| 11 | W3-02g | a demo's own packets | W3-02f | yes | adds cases | half a day |
| 12 | W3-10 | the output stage | W3-02g and W3-02e | yes | re-records all, once | 1 day |
| beside | W3-14 | the Steam path against the owner's file-input recording: an investigation on the stronger model, run by the orchestrator | when the recording exists, and W3-13's module and W3-11a's Opus rebuild exist (or scratch builds of them); nothing waits for it | no | may change W3-13's default kernel, and then the `steam` cases once | 4 hours |

**Side by side** (two builders at most). The four module orders (W3-02a, W3-12a, W3-13, W3-02b) touch no app
file and share only the `test` line of `package.json` (a trivial merge): any two of them at once. From W2-02's
merge one builder walks the audio column. **W3-02d runs alone:** it shares page files with W3-11b before it and
`app/source.js` with W3-02g after it. W3-02e runs beside W3-02f or W3-02g. **W3-10 runs beside nothing:** it
touches `app/`, `batch.js`, `sw.js` and the tests. **One real conflict among the module orders:** W3-13 and
W3-12b both edit README's "Files and licensing" paragraph and table. W3-12b's README edit is made after W3-13
has merged; if W3-13 is still in review then, W3-12b merges first and W3-13 merges main in and keeps both.

**The golden hashes** move five times before W3-10 (the gain; CELT; Speex; `steam`; then all). Each order
re-records only the cases its change reaches, in a commit of its own, after showing the others did not move:
that is what keeps a re-record from hiding a regression. Folding W3-12b into W3-06 would save one; it is not
done because W3-06 no longer touches Speex at all. **One more re-record of the `steam` cases is possible:** if
the owner's file-input recording shows Steam runs another resampler kernel than `fma3`, the default changes
(one line in W3-13's module) and the `steam` hashes follow. If the recording arrives before W3-11a's hashes
are recorded, there is none.

## Decisions made

1. **The sender is Steam's rule, in a module of its own** (`steam-sender.js`, built by W3-02b). It works on the
   24 kHz sound, not on the codec's frame log, because the gate now decides the frames: each spurt's frames sit
   on a grid that starts at its pre-roll.
2. **One gate.** W3-11a wires that module into the render and the stream, W3-11b into the live chain; W3-02c
   takes W3-11a's packets.
3. **Only the `steam` profile.** `steam_48` is an experimental 48 kHz profile, not the game's path: it keeps
   today's frame gate, float decode and resampler bit for bit, stays on the source's timeline, and the page
   says so. CELT and Speex with the gate switched on keep the frame gate bit for bit.
4. **What is drawn.** Only the clock: when Steam's frames fall. The clock is a model of mine: a 15.625 ms timer
   (Windows's default), the capture moving 750 samples every second tick, Steam's frame on the first tick at or
   after a 55.85 ms schedule, 6% of frames up to 30 ms late. It gives the logs' packet spacing (3, 4, 5 ticks
   in 36, 50, 11%; logged 41, 49, 10%) with no jitter term of its own. The same seed gives the same render.
5. **The gate off is a sender setting**, not another path: every chunk counts as active, one spurt, the same
   messages, decoder and resampler. The page's switch is there to hear continuous transmission; it still does
   that, and W3-02c's game timeline works with it (one channel, never appended to).
6. **The timeline no longer owns the sender.** `createTimeline` takes messages as the receiver gets them, so
   W3-02b needs no codec and no resampler, and W3-02g's demo packets use the same door.
7. **The resampler is a port of the library's float path** with the processor-dependent order of its sum as a
   named setting (`fma3` by default, `avx`, `sse`, `c`), each with reference hashes made natively here by
   masking the CPU's features through the library's own call. I added `sse` to the three the orchestrator
   named: the library has it, an older processor runs it, and it cost one more row. The bank is stored in the
   script, not computed in the page, because `Math.sin` differs between browsers.
8. **The 16-bit decode is the library's own**, by rebuilding the pinned Opus module with `opus_decode`
   exported, inside W3-11a as W3-06 does for CELT, with the float path proved unmoved. The encoder needs no
   rebuild: the float entry point given rounded samples is what the 16-bit one does.
9. **The take tools keep the frame model.** `reference.js` and `app/realtake.js` read the profile's
   `prerollMs` and `holdMs` to find a take's spurts within a few frames; those numbers stay in the profile,
   named as the fit they are, and neither file changes. `reference.js` scores the registered predictions, so
   leaving it alone is the safer reading; making the real-take check use the sender is a later order, worth
   doing once a take has been scored against the new render.
10. **The threshold control gives Steam's gate when untouched:** its default is the profile's own (-40 dBFS as
    a mean for `steam`), and the page sends "no number" at the default, so 327.67 is never recomputed.
11. **Loss stays per frame**, drawn as now; Steam's decoder rules (conceal at the next frame, at most 10) are
    applied to it. A late frame stays the measured stand-in.
12. **Complexity becomes 9** for `steam`, though it changes no packet.
13. **Speex in two parts**, so the build starts now and only the switch waits for `audio.js`.
14. **Private checks with no known answer** are recorded by the orchestrator on the first run, each with an
    acceptable range and its reason. **The owner's file-input recording**, if it comes, is an
    investigation of its own, W3-14, on the stronger model, by a forward method (encode the known clip, decode,
    resample under each kernel, compare with the recording). No builder's order holds a tool for it or waits
    for it. The first revision put two tools into W3-13 and W3-11a that recovered the 24 kHz samples backward
    from the recording; the second read prototyped that and it does not work (below).

## Decisions left to the orchestrator and the owner

| Question | Recommendation |
| --- | --- |
| A **modified** LGPL source file in the default render's path (W3-13's port; LAME is unmodified)? | Yes: one replaceable file with FFmpeg's notices kept and its licence beside it. The owner should say so before W3-13 merges |
| Which resampler kernel is the default before the recording exists | `fma3`: what a current processor picks if Valve's build has the assembly in. Marked "not confirmed on Steam" until the recording says |
| The hold: the model ends a spurt on the 8th chunk in 94% of cases, the demo on the 7th in 9 of 18 | Decided: scored, not tuned |
| Whether the real-take check should move to the sender's gate | Later, after W3-11a's private accuracy run; not now (decision 9) |
| A new registered prediction for `vaudio_celt_high` (open since the last plan) | Unchanged: still wanted before its registered take |

Decided since the first version, as recommended: W3-02b is built without waiting for the owner's console run;
W3-06's Speex point is struck; lost Speex frames give zeros.

## Open: where the reports disagree with something

1. **The resampler's first packet.** W3-09 says that after the first flush "the stream runs 8 input samples
   (0.33 ms) ahead". The public library, run here and again by the review, adds 16 mirrored samples after the
   first packet, and everything after is 16 input samples (0.67 ms) late. W3-09's sentence should be corrected.
2. **The resampler is float, not 16-bit fixed point.** W3-09 section 4 says "computed in 16-bit fixed point",
   and this plan's first version followed it. For a rate change the library works in 32-bit float, and the
   order of its sum depends on the processor (W3-13). The review found this; it is in the public source.
3. **"Clipped" is a soft clip.** W3-09 says the 16-bit decoder "rounds each sample to 16 bits and clips". In
   libopus 1.1.5's public source the float build's 16-bit decoder runs its soft clipper first, with memory in
   the decoder (confirmed by the review). Whether Steam's build is a float build was not read; the file-input
   recording decides (W3-14) if its clip passes full scale. Finding 2's "energy at 12 to 19.5 kHz, reproduced by
   clipping" should be measured again with the soft clipper and the resampler's images both in the model.
4. **The hold against the mean frame time.** 7 frames of 55.85 ms are 391 ms, under the 0.4 s hold, so a steady
   clock ends every spurt on the 8th chunk; the demo has the 7th in half. The real frame times vary more than
   "a few ms", or the time is noted a frame earlier than read.
5. **Which chunk follows a long one.** The report's pair table has a 2250-sample chunk mostly after a 750 one
   (1-3 in 1.4% of pairs). A late frame on a steady schedule gives 1-3 in 0.86% and 2-3 in 0.79% (the review's
   count). The capture, not Steam's frame, may be what is late.
6. **Loss falls on messages in the game, on frames in the app.** A lost network packet loses a whole message
   (1 to 4 frames, 8 at an opening). The app draws loss per frame in groups of `net_split`, fitted to finding
   8's bursts (half of them one frame long), which whole-message loss would not give. Not resolved here: W3-11a
   keeps the measured per-frame model under Steam's decoder rules. A Set C take with the game's two debug
   variables on would show which it is.
7. **W3-10 and W3-11a both touch rounding and clipping**, at different places: W3-11a before the resampler
   (the decoder's 16 bits), W3-10 after the gain (the mix at 255/256, the clip, `volume`). They do not
   contradict.

## What in W3-09 is not proved well enough to build on without a flag

- **The clock** (55.85 ms, the 31.25 ms step) is one PC's. Flagged in the order and in the page's words.
- **The 1.1.4 on Windows** is inferred from the Linux build's string; the app runs 1.1.5. No order changes the
  pinned source.
- **Which resampler kernel Steam's build runs**, and whether Valve's 8.1.2 build gives the public 6.1.1's last
  bits: not known. The public source of the path is the same in both.
- **Speex 1.0.2 against 1.0.1**: cannot be told apart; 1.0.2 is the one with a tag.
- **Speex under loss**: not read.
- **The cap of 10 concealed frames**: read, never seen in a take.
- **The fall-back to `vaudio_celt`** for a client of somebody else's server is untested; nothing here builds
  on it.

## Proposed text for `tests/REFERENCE_2026.md`

Not applied. It follows the numbering of the text proposed in `docs/reports/W3-02-plan.md` (findings 22 to 27).

> ### 28. Steam's sender, read from the client: chunks, a level rule, 100 ms kept, a 0.4 s hold
>
> Read from the owner's Steam client and Valve's public copy of it (W3-09), then checked against Set G's logs and Set D's demo.
>
> - **Chunks.** Steam takes whatever the capture gained since its last frame: on the owner's PC whole steps of 750 samples at 24 kHz (31.25 ms), about every 55.85 ms. All 1,797 packets of the demo and all but 39 of Set G's 2,326 fit chunks of one, two or three steps (demo: 23.4%, 74.8%, 1.8%; Set G: 23.6%, 74.0%, 2.3%).
> - **The gate** is on a chunk, not a 20 ms frame: open when the mean of |x| is at least 1.0% of full scale, or any sample reaches 15%. Nothing in the client sets those two numbers, and no filter, gain or noise suppression runs before them.
> - **The pre-roll** is the last 2400 samples (100 ms) of the silent chunks before the onset, zeros if there were none, sent in front of the chunk that opened the gate: 8 frames in 17 of 20 openings (demo) and 17 of 23 (Set G). Straight after a spurt it is shorter.
> - **The hold** is 0.4 s of Steam's clock after the last active chunk was read. The first chunk read later is the last: its final frame is padded with zeros, the end marker follows, the encoder is reset and the sequence number returns to 0. The next chunk goes out as its length only: the silence record (1500 samples 17 times and 750 twice in the demo).
> - **One chunk is one message.** Frames of 480 samples are cut from the chunk plus what the last one left over, so a 1500-sample chunk gives 3 frames and now and then 4, a 750-sample one 1 or 2: the logged 65, 14, 11 and 10% of 60, 40, 80 and 20 ms packets follow with nothing fitted.
> - **The key.** Steam goes on capturing for 0.5 s after the key is released. A spurt still open then gets no end marker; the next key press sends the marker alone (the empty packet of finding 25).
> - **The queue.** Steam keeps at most 8192 bytes of voice for the game to collect (about 2 s) and drops the oldest beyond that.
> - **The clock** the hold is measured on is a 32-bit float of seconds; on a Steam that has run for days it moves in steps of 16 to 31 ms (read; that it counts from Steam's start is assumed, and its effect was not measured).
> - **The encoder** is libopus 1.1.x; the public Linux build of the client carries the string `libopus 1.1.4`, and the Windows build is inferred to be the same. Its settings, read: 24000 Hz, mono, VOIP, then bit rate 32000, signal voice and DTX, and nothing else, so complexity is the library's 9 and VBR is constrained. The pinned 1.1.5 gives identical packets at complexity 8, 9 and 10 (19,428 frames).
> - **The capture** is opened through DirectSound at 24 kHz mono 16-bit, so the conversion from the device's rate is Windows's, not Steam's.
>
> ### 29. Steam's decoder: 16 bits, at most 10 concealed frames, and FFmpeg's resampler once per packet
>
> Read (W3-09). An end marker resets the decoder. A sequence number ahead of the expected one conceals the gap, at most 10 frames of it; one behind resets without concealing. A silence record becomes that many zeros. Decoded sound is 16-bit: in libopus's public source the 16-bit decoder of a float build softens peaks past full scale before it rounds (whether Steam's build is one was not read). Then each packet goes, by itself, through FFmpeg's libswresample at its default settings (32 taps, 147 phases, Kaiser window) from 24000 to 44100 Hz. For a rate change that library works in 32-bit float, and on x86 the order of its sum is chosen by the processor's features, so two PCs can differ in the last bit of up to a few samples in ten thousand at full scale, and fewer at speech level (none or one in 55,000 at -24 dBFS); which kernel Steam's build runs is not known. The public library, called the same way, returns the logs' counts exactly: 7056 samples for 3840, 2646 for 1440, 882 for 480, and 2757 or 2756 for a silence record of 1500.
>
> - **Its response:** flat to 10 kHz, -0.7 dB at 11 kHz, -2.4 at 11.5, -4.0 at 11.75, -6.0 at 12 kHz. Just above 12 kHz it leaves a mirror of what lies just below: 6 dB down at 12 kHz, 12 dB at 12.5 kHz, 22 dB at 13 kHz, over 65 dB above 14 kHz.
> - **A speaker's first packet** is finished by mirroring its last 16 input samples; they stay in the stream, so everything after is 0.67 ms late. Once per speaker per session. Not seen in a recording.
> - A silence record is dropped, not played, when more than 0.2 s is already waiting in that decoder's output; in the game's use the output is taken at once.
> - Nothing else touches decoded sound: `voice_autogain` is 0.
>
> ### 30. From the voice channel to the speakers
>
> Read from the engine (W3-07) and measured in five recordings from two PCs. The mixer runs at a fixed 44100 Hz in buffers of exactly 512 samples (the 512-sample pulls of finding 22). Steam voice is copied in sample for sample at 255/256, truncated toward zero (253.5/256 with the two-speaker setting), with no filter. Then: the sum of all sound, a clip at ±32767, `volume`, rounding to 16 bits. A voice does pass the room DSP (a 26/256 share, only where a room preset is active) and the under-water DSP. The engine has no `[0.1, 0.8, 0.1]`. The roll-off above 12 kHz in the 48 kHz recordings is the system mixer's linear interpolation from 44100 to 48000 Hz: flat tops stay exactly on the ceiling, and a 1 kHz tone has images at 2900 and 4900 Hz at -64 to -67 dB (linear interpolation predicts -65.4 and -66.2). The fitted filter agreed with it within 0.1 dB to 13 kHz and was 1.1 dB bright at 18 kHz. A voice is exempt from `voice_overdrive` and from the game's ducker.
>
> ### 31. The engine codecs, read and matched
>
> `vaudio_celt` and `vaudio_celt_high` are the public CELT 0.11 source built with its pitch pre-filter and post-filter compiled in, at complexity 5, with 16-bit entry points; the module resets the encoder after creating it, and again at each start of recording (W3-03, W3-08). A decoder built without the filter refuses real `vaudio_celt` packets that use it: the app's bundled build is such a one until W3-06 rebuilds it, so until then a demo's pitched CELT voice does not decode in the app. (When this text is written into the reference, say which it is on that day.) `vaudio_celt_high` is the 44100 Hz, 1024-sample, 128-byte mode fed 22050 Hz sound. With that build the app's method reproduces the game's decoded output (Set H) at 292,351 of 292,352 samples and 292,789 of 292,864, the rest one step apart. `vaudio_speex` is Speex 1.0.2 or 1.0.1 (the two cannot be told apart in the module; 1.0.2 is the one with a public tag), narrowband, quality 4, enhancement on, fed the engine's 11025 Hz sound with no resampling: a frame is 14.51 ms, the rate 11.025 kbit/s, the band 5.5 kHz, and decoded samples wrap past full scale (W3-09, read from the owner's module). It cannot be recorded: a current game asked for it runs `vaudio_celt`.

**Finding 2**, last bullet of the Set A list: after "It is reproduced by clipping the decoded voice at 44.1 kHz" add: "To be looked at again below 13.5 kHz: the decoder's resampler mirrors the top of the band there (finding 29), which would be coherent with the source, and the decoder's own 16-bit step may soften peaks before any clip. Not measured yet." In the first list, "The sender has no gain control or noise suppression": add "(confirmed in the client: none runs before the gate, finding 28)".

**Finding 5**: replace the "Opening" bullet with: "**Opening:** a capture chunk (31.25 to 93.75 ms on the owner's PC) whose mean of |x| is at least 1.0% of full scale, or which has a sample at 15% of full scale (finding 28). For a sine that is -39.09 dBFS RMS, for noise about -38: every case below agrees." Replace the last sentence of the section with: "It is a level rule on chunks, read from the client: not a voice detector, and not a 20 ms rule."

**Finding 8**: add at the end: "Steam's decoder conceals at most 10 frames of a gap (finding 29); a longer gap closes up. Read; no take shows it."

**Finding 11**: under "Spurt ends" add: "Each message is one capture chunk and carries its own sample-rate record (finding 28)." Under "Sequence numbers" add: "Read: the encoder writes 0 after each end marker." Replace "It runs at libopus's default complexity 10" wherever the Steam profile is described with "complexity 9, the library's default in 1.1.x, which gives the same packets as 10".

**Finding 12**: retitle "The gate keeps 100 ms and holds 0.4 s". Replace the second and third paragraphs with: "The 20 ms frame model (6 frames before, 22 after) was a fit. Steam's own rule is finding 28: 2400 samples kept before the onset's chunk, so the pre-roll is 100 to 162.5 ms of sound (measured: 115 to 152), and a hold of 0.4 s of its clock from the read of the last active chunk, so sound goes on for 380 to 460 ms after that chunk (measured from the last loud frame: 425 to 485). The 31.25 ms grid is the capture's step. A pause shorter than the hold keeps the spurt going; there is no 560 ms rule. Each spurt resets the encoder and the decoder."

**Finding 14**: after "The receiver adds no EQ." add: "The receiver's own 24 to 44.1 kHz step is finding 29's resampler, which the app's stood in for when this was measured; its roll-off above 10.5 kHz belongs to the receiver." Last paragraph: "Only the capture roll-off is Steam's own" becomes "The capture roll-off is Windows's capture resampler (finding 28), so it belongs to the sender's machine and may differ on another".

**Finding 15**: "which is its `volume`" becomes "which is its `volume` (0.11: its ceiling is exactly round(32767 x 0.11)) and its `voice_scale` 0.77, which with the engine's gain law gives B's 1 kHz staircase within 1 to 3% (W3-07). Its output path is the same."

**Finding 16**: the title stays ("libopus 1.1.x"). After "so Steam's build is most likely 1.1.2 or later" add: "The public Linux client says `libopus 1.1.4`." Last paragraph: "It runs at libopus's default complexity 10" becomes "Steam sets no complexity, so it runs the library's default, 9; the pinned build gives the same packets at 9 and 10".

**Model table**, rows replaced or added:

| Stage | Setting | Basis |
| --- | --- | --- |
| Voice gate (`steam` only; the other profiles keep the 20 ms frame fit) | Steam's chunk rule: chunks of whole 750-sample capture steps; open when mean \|x\| ≥ 1.0% of full scale or a peak ≥ 15%; 2400 samples kept before the onset's chunk; held 0.4 s of the clock; frames of 480 from each chunk plus the remainder; one chunk a message; a fresh encoder and decoder per spurt. The clock (a 15.625 ms timer under a 55.85 ms frame) is a model | findings 5, 12 and 28 |
| Capture roll-off | as now; Windows's capture resampler, the sender's machine | findings 14, 16 and 28 |
| Codec | libopus 1.1.5 at both ends (Steam's Linux build says 1.1.4; 1.1.2 to 1.1.5 gave the same packets on the test signal): Opus 24 kHz mono, VOIP, signal=voice, 32 kbps constrained VBR, complexity 9, DTX, 20 ms; decoded to 16 bits; at most 10 frames concealed per gap | findings 11, 13, 16, 28 and 29 |
| Decoder's resampler | libswresample's default filter in float, 24000 to 44100 Hz, once per packet; the sum in the `fma3` kernel's order (not confirmed on Steam) | finding 29 |
| Voice rate | 44.1 kHz, the mixer's fixed rate | finding 30 |
| Output stage | the voice at 255/256; clip at ±32767; `volume`; 16 bits; then the system's linear interpolation to the device's rate (48000 Hz) | finding 30 |
| Engine codecs | CELT 0.11 with its pitch filter, complexity 5; `vaudio_celt_high` as the 44.1 kHz mode on 22.05 kHz sound; Speex 1.0.2 on 11.025 kHz sound, wrapping past full scale | finding 31 |

**What remains unverified**: "Steam's libopus build" becomes: "The release is 1.1.4 by the Linux build's own string; Windows is inferred. Whether its 16-bit decoder softens peaks (a float build's does) was not read. Whether the pinned build gives Steam's packets bit for bit needs a known input: Steam's `mic_inputfile` (W3-09) would give one." "Output stage" becomes: "The interpolation to the device's rate is the system mixer's, measured, not read; a 44100 Hz device would have none." Add: "**The sender's clock.** The chunk rule is read; when Steam's frames fall is one PC's logs and a model. **The resampler's first packet** and **the cap of 10 concealed frames** are read and not recorded. **Speex** is read from the module and cannot be recorded."

## The review

The plan was read by an agent on the builders' model as the one who would build it, which also ran the sender,
the resampler against the native library and the public sources. Its 28 findings, and what was done:

| # | Finding | What was done |
| --- | --- | --- |
| 1 | W3-13 specified integer arithmetic; the library resamples in float, with a processor-dependent kernel | Accepted; W3-13 rewritten: the float path, four named kernels (`fma3` default, `avx`, `sse`, `c`), sixteen native hashes, the default one constant |
| 2 | No phase is a mirror at 147 | Accepted; the order says every phase is computed |
| 3 | A 12 kHz sine is the input's Nyquist frequency | Accepted; dropped, and the review's measured figures are the expected ones |
| 4 | The library's own version number | Accepted: "libswresample 4.12.100 (FFmpeg 6.1.1)" |
| 5 | Licence lines; two more upstream files; "modified" | Accepted: the notices to keep and the five upstream files are listed; "modified" is said to the owner |
| 6 | An `.mjs` cannot be loaded by `importScripts` or the test sandbox | Accepted: a classic script, `vendor/swresample/swresample.js` |
| 7 | `steam_48` is 48 kHz: the sender and resampler do not fit it | Accepted (the orchestrator's decision): excluded; it keeps today's path bit for bit, in every order |
| 8 | `app/realtake.js` and `reference.js` read `prerollMs` and `holdMs` | Accepted: the numbers stay in the profile as the frame fit, and neither file changes (decision 9, with the reason) |
| 9 | -39.09 is not 327.67; the page always sends -39.5 | Accepted: the unit is the mean in dBFS (-40 exactly), the page sends no number at the default, and every file with the old default is listed (W3-11b); W3-11a carries one line so main is right in between |
| 10 | `DEFAULT_SENDER_GATE` cannot go | Accepted: kept bit for bit for the other profiles |
| 11 | Nothing rounds before the encoder today | Accepted: the rule is stated, with why the float encoder on rounded samples equals the 16-bit entry point |
| 12 | The plain clip is not what the library does | Accepted (the orchestrator's decision): the module is rebuilt with `opus_decode` exported, the float path proved unmoved, checked against a native build; a port of the soft clipper only as an ordered fall-back |
| 13 | A one-sample click does not survive the resampler | Accepted: 1 ms at 24 kHz |
| 14 | The pre-roll and hold ranges were too narrow | Accepted: a square-wave burst, the ranges from the sender's own numbers (2400 to 4649 samples; 375 to 562 ms) |
| 15 | The sine cases pass on main; "-36 dBFS" unclear; "10 lost" and "output length" undefined | Accepted: two cases that tell the mean from RMS, peaks named, the lost slots defined by what is laid, the length check replaced by a count of calls |
| 16 | Late frames and `net_split` under the new decoder | Accepted: both stated in W3-11a point 6; that real loss falls on messages is under "Open" 6 |
| 17 | The gate off changed the receiver's path, and W3-02c did not say what happens | Accepted (the orchestrator's lean, checked against what the switch is for): the gate off is a sender setting; written in W3-02b, W3-02c and W3-11a |
| 18 | The reference findings must be written before the merges | Accepted: a row in the order of work and a line in W3-13 and W3-11 |
| 19 | W3-12b's files missed three places | Accepted: `app/render.js`, `tests/reference.verify.mjs`, README's table, notice and build commands, `live.js`, `live-worker.js`, and a closing `grep` |
| 20 | A codec at 8 kbit/s does not hold a pure tone | Accepted: band levels of noise, and a pulse train's pitch for "nothing is shifted" |
| 21 | Name the request that reports the mode | Accepted: request 7 |
| 22 | W3-02a is unchanged | Nothing to do; checked again after each edit |
| 23 | Three rows of the statistics table depend on unstated counting rules | Accepted: the three rules are stated, with what the other reading gives |
| 24 | W3-02c's spec 2 and W3-02g still described the old path under override notes | Accepted: both rewritten in place |
| 25 | Orders said to run together share files | Accepted: W3-02d alone, W3-02e beside W3-02f or W3-02g, W3-10 beside nothing |
| 26 | The proposed finding 29 said "16-bit arithmetic" | Accepted: float, kernel-dependent; also listed as an error in W3-09 ("Open" 2) |
| 27 | Five sentences said more than their source | Accepted: each softened to its source (1.0.1 or 1.0.2; the reset at every recording start; the Linux string; "to be looked at again"; the two sources' shares given separately) |
| 28 | Left out of the proposed text | Accepted: the truncation and 253.5/256, the room and water DSP, the float clock, the 8192-byte queue, the 0.2 s rule for silence records, the decoder that refuses pitched CELT packets |

I disagree with none. Two things go beyond the review: the `sse` kernel (decision 7), and storing the bank in
the script (browsers do not share one `Math.sin`).

## The second read

The same reviewer read revision `dbc116d`. It reproduced all sixteen resampler hashes natively, the bank's hash
from the order's text alone, the pre-roll and hold ranges and the -40 unit, and closed findings 7 to 28 of the
first read. Its 17 new findings, and what was done:

| # | Finding | What was done |
| --- | --- | --- |
| 1 | The tool that was to tell the kernel from a recording does not work as specified: the exact inverse leaves wrong inputs, and at speech level the kernels barely differ | Accepted (the orchestrator's decision): struck from W3-13; the question is W3-14, an investigation by the forward method, with a match defined on 200,000 outputs above -6 dBFS and clipped outputs left out |
| 2 | The bank's hash is of its 18,816 bytes, not of the base64 text | Accepted; said so, with the note that the sign of `s` matters |
| 3 | The kernels differ on stream A at full scale only | Accepted; said so, and no check asks for a difference on a quiet signal |
| 4 | The tool was open research inside a builder's order | Accepted: W3-13 is the resampler alone, 1 day |
| 5 | The Opus rebuild: no checkable reproduction step, a clone from a host the machine cannot reach, no native script allowed | Accepted: first the recorded hash with the old export list, stop if not; a checkout from `gitlab.xiph.org` passed to the script; `tests/libopus11/native.mjs` allowed, with its flags |
| 6 | The kernel check named no source and counted in the render | Accepted: a loud source, counted at the resampler's output through a hook |
| 7 | The -36 dBFS sine passes by 0.07% | Accepted: -35.8, with the reason |
| 8 | `steam-exact.mjs` should compare forward | Accepted by removal: the tool and its private check left W3-11a; W3-14 has the forward method |
| 9 | The live sender's input was not said to be rounded | Accepted: W3-11b point 1 and its check |
| 10 | A typed threshold reaches the real-take check as an RMS level | Accepted: said in the control's help and under "not changed" |
| 11 | W3-02c pointed at W3-11a's point 4 for the laying | Accepted: point 8 |
| 12 | W3-12b's band check is untried | Accepted: "if it fails, report both figures and stop" |
| 13 | W3-13 and W3-12b both edit README's licensing table | Accepted: W3-12b's README edit after W3-13 merges, or the stated order if W3-13 is still in review; in both orders and under "Side by side" |
| 14 | The golden-hash table is right | Nothing to do |
| 15 | Three bullets of the proposed text had lost their quote marks | Accepted: restored |
| 16 | "A few samples in ten thousand" holds at full scale only | Accepted: "up to a few at full scale, fewer at speech level" |
| 17 | Finding 31's sentence on pitched CELT packets was true only after W3-06 | Accepted: worded to be true before and after |

I disagree with none, and changed nothing beyond these findings and the new order.

## The scan

Before the last push the branch's diff against `origin/main` was searched for 17-digit numbers, drive paths,
e-mail addresses and user names: none. The scratch scripts (the clock's simulations, the sender's prototype, the
program that drove the public resampler) are in the session's scratch folder only.
