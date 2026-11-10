# W3-11: the plan after W3-07, W3-08 and W3-09

A plan, 2026-11-10. No app code changed. It revised `docs/work-orders/W3-02-receiver-queue.md` (revision 3),
wrote three orders (`W3-11-steam-gate.md`, `W3-12-speex-module.md`, `W3-13-steam-resampler.md`) and proposes text
for `tests/REFERENCE_2026.md` (at the end; not applied). Sources: the reports on main, the app's code, and public
open source (FFmpeg's libswresample at the tags `n6.1.1` and `n8.1.2`, read and, for 6.1.1, run as this machine's
distribution ships it; Xiph's Speex tags). No binary was opened and no private data was read.

## The order of work

Everything not yet built. "Audio" marks the orders that change `audio.js`: they run one at a time, in this order.

| # | Order | What | Starts after | Audio | Golden hashes | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | W2-02 | the render stream (in review) | merges first | yes | records them | |
| 1 | W3-02a | the channel, the log replay (building now) | | no | | 1 day |
| 1 | W3-13 | the decoder's resampler, a module | now | no | | 1 day |
| 2 | W3-12a | Speex 1.0.2 built and checked | now (after W3-13 or W3-02a frees a builder) | no | | 1 day |
| 2 | W3-02b | `steam-sender.js` and the timeline stage | W3-02a | no | | 1 day |
| 3 | W3-05 | the gain as the engine's rule | W2-02 | yes | re-records every case with the gain on | half a day |
| 4 | W3-06 | the CELT settings and rebuild | W3-05 | yes | the two CELT cases | 1 day |
| 5 | W3-12b | the `speex` profile on the new module | W3-06, W3-12a | yes | the `speex` cases | half a day |
| 6 | W3-11 | the Steam profiles send and decode as Steam does | W3-12b, W3-02b, W3-13 | yes | the Steam cases with the gate on | 2 days |
| 7 | W3-02c | the game's timeline behind an option | W3-11 | yes | adds cases; moves none | 1 day |
| 8 | W3-02d, then W3-02e | the page | W3-02c | no | | 1.5 days |
| 8 | W3-02f | the flat rule retired | W3-02d | yes | moves none | 2 hours |
| 9 | W3-02g | a demo's own packets | W3-02f | yes | adds cases | half a day |
| 10 | W3-10 | the output stage | W3-02g | yes | re-records all, once | 1 day |

**Side by side** (two builders at most): now, W3-02a with W3-13; then W3-12a with W3-02b. None of those four
touches an app file. From W2-02's merge one builder walks the audio column while the other finishes the
module orders, and later takes the page orders (W3-02d and W3-02e beside W3-02f, W3-02g or W3-10).

**The golden hashes** move five times before W3-10 (the gain; CELT; Speex; Steam; then all). Each order
re-records only the cases its change reaches, in a commit of its own, after showing the others did not move:
that is what keeps a re-record from hiding a regression. Three ways to do it fewer times were weighed and not
taken: building W3-12b inside W3-06 (both are engine codecs, but one order would then swap two pinned builds);
building W3-11 inside W3-02c (one order would change the default render and add the option, and the proof that
the default did not move would be lost); and holding all re-records for W3-10 (main would fail its own suite
for a week). If the orchestrator wants one fewer, fold W3-12b into W3-06's brief: they share `constants.js`,
the Speex texts and `tests/LEGACY_CODECS.md`.

## Decisions made

1. **The sender is Steam's rule, in a module of its own** (`steam-sender.js`, built by W3-02b). It works on the
   24 kHz sound, not on the codec's frame log, because the gate now decides the frames: each spurt's frames sit
   on a grid that starts at its pre-roll.
2. **One gate.** W3-11 wires that module into the offline render, the stream and the live chain; W3-02c takes
   W3-11's packets. Nothing else gates a Steam profile.
3. **What is drawn.** Only the clock: when Steam's frames fall. Everything else follows from the sound. The
   clock is a model of mine: a 15.625 ms timer (Windows's default), the capture moving 750 samples every second
   tick, Steam's frame on the first tick at or after a 55.85 ms schedule, 6% of frames up to 30 ms late. It was
   chosen over a free-running jittered clock because it gives the logs' packet spacing (3, 4, 5 ticks in 36,
   50, 11%; logged 41, 49, 10%) with no jitter term of its own, and explains why the capture step is exactly
   two timer ticks. The same seed gives the same render.
4. **The timeline no longer owns the sender.** `createTimeline` takes messages as the receiver gets them (a
   tick and the decoded packet), so W3-02b needs no codec and no resampler, and W3-02g's demo packets use the
   same door.
5. **The resampler is a port**, not a WebAssembly build, kept under the LGPL as a library of its own (W3-13
   has the reasoning). The reference hashes in the order were made here from the public library.
6. **Complexity becomes 9**, though it changes no packet, so the code says what Steam does.
7. **The live chain** gets the chunk gate but not the per-packet resampler, the key's 0.5 s tail or the empty
   packet.
8. **Speex in two parts**, so the build can start now and only the switch waits for `audio.js`.
9. **Private checks with no known answer** (the accuracy table after W3-11, `retiming.mjs --engine` after
   W3-02b) are recorded by the orchestrator on the first run, each with an acceptable range and its reason in
   the order.

## Decisions left to the orchestrator and the owner

| Question | Recommendation |
| --- | --- |
| An LGPL source file in the default render's path (W3-13's port)? | Yes: the project already ships LAME under the LGPL, and the port is one replaceable file with its licence beside it. The owner should say so before W3-13 merges |
| Build W3-02b now with the modelled clock, or wait for the owner's `@voice_spew_activity_check` run? | Build now. The clock's constants are named; a measured clock replaces them without touching the rule. Ask the owner for the run all the same: it settles the clock, the capture step and the hold in one take |
| The hold: the model ends a spurt on the 8th chunk in 94% of cases, the demo on the 7th in 9 of 18 | Accept for now and score it (W3-02b's private check). If the speech take's silences come out long by about 28 ms, shorten nothing by hand: get the clock measured |
| W3-06's point 5 (Speex at quality 3, 8000 Hz, "unverified") | Strike it from W3-06's brief; W3-12b replaces it |
| Lost frames under Speex (the module has no concealment; what the engine plays was not read) | Zeros, said plainly on the page; a question for whoever next reads the engine |
| `steam_48`: does it keep the per-packet resampler when the voice rate is not 44100? | W3-11 treats both Steam profiles alike at the decoder (24000 to 44100, as Steam does); what follows is that profile's own. Check its definition in the brief |
| A new registered prediction for `vaudio_celt_high` (open since the last plan) | Unchanged: still wanted before its registered take |

## Open: where the reports disagree with something

1. **The resampler's first packet.** W3-09 says that after the first flush "the stream runs 8 input samples
   (0.33 ms) ahead" and that 0.33 ms is missing. The public source and a run of the public library say
   otherwise: the flush **adds** 16 mirrored samples after the first packet, and everything after is 16 input
   samples (0.67 ms) **late** (a sample put at input 4000 of a stream whose first packet is 3840 comes out at
   output 7379.4, which is input 4016). The counts agree with the report and the logs either way. W3-13 is
   built to the library, so the order does not depend on which wording is right; the text for the reference
   below uses the library's behaviour. The report's sentence should be corrected.
2. **"Clipped" may be softer than a clip.** W3-09 says the 16-bit decoder "rounds each sample to 16 bits and
   clips at full scale". In libopus's public source, a floating-point build's 16-bit decoder first runs the
   library's soft clipper over anything past full scale, then rounds. Whether Steam's build does was not said.
   It matters only where the decoded wave passes full scale, before the gain. W3-11 builds the plain clip, counts
   the samples it touches, and stops if that count is not small. Finding 2's "energy at 12 to 19.5 kHz,
   reproduced by clipping" should be looked at with this and with the resampler's images together.
3. **The hold against the mean frame time.** 7 frames of 55.85 ms are 391 ms, under the 0.4 s hold, so a steady
   clock ends every spurt on the 8th chunk; the demo has the 7th in half. So the real frame times vary more
   than "a few ms", or the time is noted a frame earlier than read. Not settled here; see the table above.
4. **Which chunk follows a long one.** The report's pair table has a 2250-sample chunk mostly after a 750 one
   (1-3 in 1.4% of pairs against 2% of chunks being long). A late frame on a steady schedule gives a long chunk
   after any chunk and a short one after it (the model: 1-3 in about 0.9%, 2-3 in about 0.8%). The capture, not
   Steam's frame, may be what is late. It moves the sizes of a few messages in a hundred.
5. **W3-10 and W3-11 both touch the order of rounding and clipping**, at different places: W3-11 before the
   resampler (the decoder's 16 bits), W3-10 after the gain (the mix at 255/256, the clip, `volume`). They do
   not contradict; W3-10's builder should find the decoder's step already integer.
6. **W3-06** says in its Speex paragraph that the module is not shipped and the rate question is open. W3-09
   answered both. W3-06's CELT part is untouched by this plan.

## What in W3-09 is not proved well enough to build on without a flag

- **The clock** (55.85 ms, the 31.25 ms step) is one PC's. The rule is read; the clock is what a render has to
  make up, and W3-09 says so. Flagged in the order and on the page's words (W3-02d: "the packets' timing is a
  model").
- **The 1.1.4 on Windows** is inferred from the Linux build's string; the app runs 1.1.5, which gave identical
  packets to 1.1.2 on the test signal. No order changes the pinned build.
- **Speex 1.0.2 against 1.0.1**: cannot be told apart; 1.0.2 is the one with a tag.
- **Speex's packets under loss and what the engine plays for a lost one**: not read.
- **The cap of 10 concealed frames**: read, never seen in a take. W3-11 builds it with a public check only.
- **The fall-back to `vaudio_celt`** for a client of somebody else's server is untested; nothing here builds
  on it.

## Proposed text for `tests/REFERENCE_2026.md`

Not applied. It follows the numbering of the text proposed in `docs/reports/W3-02-plan.md` (findings 22 to 27).

> ### 28. Steam's sender, read from the client: chunks, a level rule, 100 ms kept, a 0.4 s hold
>
> Read from the owner's Steam client and Valve's public copy of it (W3-09), then checked against Set G's logs and Set D's demo.
>
> - **Chunks.** Steam takes whatever the capture gained since its last frame: on the owner's PC whole steps of 750 samples at 24 kHz (31.25 ms), about every 55.85 ms. All 1,797 packets of the demo and all but 39 of Set G's 2,326 fit chunks of one, two or three steps (23.5%, 74.5%, 2%).
> - **The gate** is on a chunk, not a 20 ms frame: open when the mean of |x| is at least 1.0% of full scale, or any sample reaches 15%. Nothing in the client sets those two numbers, and no filter, gain or noise suppression runs before them.
> - **The pre-roll** is the last 2400 samples (100 ms) of the silent chunks before the onset, zeros if there were none, sent in front of the chunk that opened the gate: 8 frames in 17 of 20 openings (demo) and 17 of 23 (Set G). Straight after a spurt it is shorter.
> - **The hold** is 0.4 s of Steam's clock after the last active chunk was read. The first chunk read later is the last: its final frame is padded with zeros, the end marker follows, the encoder is reset and the sequence number returns to 0. The next chunk goes out as its length only: the silence record (1500 samples 17 times and 750 twice in the demo).
> - **One chunk is one message.** Frames of 480 samples are cut from the chunk plus what the last one left over, so a 1500-sample chunk gives 3 frames and now and then 4, a 750-sample one 1 or 2: the logged 65, 14, 11 and 10% of 60, 40, 80 and 20 ms packets follow with nothing fitted.
> - **The key.** Steam goes on capturing for 0.5 s after the key is released. A spurt still open then gets no end marker; the next key press sends the marker alone (the empty packet of finding 25).
> - **The encoder** is libopus 1.1.4 (the version string is in the public Linux build): 24000 Hz, mono, VOIP, then bit rate 32000, signal voice and DTX, and nothing else, so complexity is the library's 9 and VBR is constrained. The pinned 1.1.5 gives identical packets at complexity 8, 9 and 10 (19,428 frames).
> - **The capture** is opened through DirectSound at 24 kHz mono 16-bit, so the conversion from the device's rate is Windows's, not Steam's.
>
> ### 29. Steam's decoder: 16 bits, at most 10 concealed frames, and FFmpeg's resampler once per packet
>
> Read (W3-09). An end marker resets the decoder. A sequence number ahead of the expected one conceals the gap, at most 10 frames of it; one behind resets without concealing. A silence record becomes that many zeros. Decoded sound is 16-bit. Then each packet goes, by itself, through FFmpeg's libswresample at its default settings (32 taps, 147 phases, Kaiser window, 16-bit arithmetic) from 24000 to 44100 Hz. The public library, called the same way, returns the logs' counts exactly: 7056 samples for 3840, 2646 for 1440, 882 for 480, and 2757 or 2756 for a silence record of 1500.
>
> - **Its response:** flat to 10 kHz, -0.7 dB at 11 kHz, -2.4 at 11.5, -4.0 at 11.75, -6.0 at 12 kHz. Just above 12 kHz it leaves a mirror of what lies just below: 6 dB down at 12 kHz, 12 dB at 12.5 kHz, 22 dB at 13 kHz, over 65 dB above 14 kHz.
> - **A speaker's first packet** is finished by mirroring its last 16 input samples; they stay in the stream, so everything after is 0.67 ms late. Once per speaker per session. Not seen in a recording.
> - Nothing else touches decoded sound: `voice_autogain` is 0.
>
> ### 30. From the voice channel to the speakers
>
> Read from the engine (W3-07) and measured in five recordings from two PCs. The mixer runs at a fixed 44100 Hz in buffers of exactly 512 samples (the 512-sample pulls of finding 22). Steam voice is copied in sample for sample at 255/256, with no filter. Then: the sum of all sound, a clip at ±32767, `volume`, rounding to 16 bits. The engine has no `[0.1, 0.8, 0.1]`. The roll-off above 12 kHz in the 48 kHz recordings is the system mixer's linear interpolation from 44100 to 48000 Hz: flat tops stay exactly on the ceiling, and a 1 kHz tone has images at 2900 and 4900 Hz at -64 to -67 dB (linear interpolation predicts -65.4 and -66.2). The fitted filter agreed with it within 0.1 dB to 13 kHz and was 1.1 dB bright at 18 kHz. A voice is exempt from `voice_overdrive` and from the game's ducker.
>
> ### 31. The engine codecs, read and matched
>
> `vaudio_celt` and `vaudio_celt_high` are the public CELT 0.11 source built with its pitch pre-filter and post-filter compiled in, at complexity 5, reset once after creation, with 16-bit entry points (W3-03, W3-08). `vaudio_celt_high` is the 44100 Hz, 1024-sample, 128-byte mode fed 22050 Hz sound. With that build the app's method reproduces the game's decoded output (Set H) at 292,351 of 292,352 samples and 292,789 of 292,864, the rest one step apart. `vaudio_speex` is Speex 1.0.2, narrowband, quality 4, enhancement on, fed the engine's 11025 Hz sound with no resampling: a frame is 14.51 ms, the rate 11.025 kbit/s, the band 5.5 kHz, and decoded samples wrap past full scale (W3-09, read from the owner's module). It cannot be recorded: a current game asked for it runs `vaudio_celt`.

**Finding 2**, last bullet of the Set A list: after "It is reproduced by clipping the decoded voice at 44.1 kHz" add: "Below 13.5 kHz part of it is not noise: the decoder's resampler mirrors the top of the band there, coherent with the source (finding 29). To be measured again with both in the model." In the first list, "The sender has no gain control or noise suppression": add "(confirmed in the client: none runs before the gate, finding 28)".

**Finding 5**: replace the "Opening" bullet with: "**Opening:** a capture chunk (31.25 to 93.75 ms on the owner's PC) whose mean of |x| is at least 1.0% of full scale, or which has a sample at 15% of full scale (finding 28). For a sine that is -39.09 dBFS RMS, for noise about -38: every case below agrees." Replace the last sentence of the section with: "It is a level rule on chunks, read from the client: not a voice detector, and not a 20 ms rule."

**Finding 8**: add at the end: "Steam's decoder conceals at most 10 frames of a gap (finding 29); a longer gap closes up. Read; no take shows it."

**Finding 11**: under "Spurt ends" add: "Each message is one capture chunk and carries its own sample-rate record (finding 28)." Under "Sequence numbers" add: "Read: the encoder writes 0 after each end marker." Replace "It runs at libopus's default complexity 10" wherever the Steam profile is described with "complexity 9, the library's default in 1.1.x, which gives the same packets as 10".

**Finding 12**: retitle "The gate keeps 100 ms and holds 0.4 s". Replace the second and third paragraphs with: "The 20 ms frame model (6 frames before, 22 after) was a fit. Steam's own rule is finding 28: 2400 samples kept before the onset's chunk, so the pre-roll is 100 to 162.5 ms of sound (measured: 115 to 152), and a hold of 0.4 s of its clock from the read of the last active chunk, so sound goes on for 380 to 460 ms after that chunk (measured from the last loud frame: 425 to 485). The 31.25 ms grid is the capture's step. A pause shorter than the hold keeps the spurt going; there is no 560 ms rule. Each spurt resets the encoder and the decoder."

**Finding 14**: after "The receiver adds no EQ." add: "The receiver's own 24 to 44.1 kHz step is finding 29's resampler, which the app's stood in for when this was measured; its roll-off above 10.5 kHz belongs to the receiver." Last paragraph: "Only the capture roll-off is Steam's own" becomes "The capture roll-off is Windows's capture resampler (finding 28), so it belongs to the sender's machine and may differ on another".

**Finding 15**: "which is its `volume`" becomes "which is its `volume` (0.11: its ceiling is exactly round(32767 x 0.11)) and its `voice_scale` 0.77, which with the engine's gain law gives B's 1 kHz staircase within 1 to 3% (W3-07). Its output path is the same."

**Finding 16**: title "Steam's voice runs libopus 1.1.4 at both ends". After "so Steam's build is most likely 1.1.2 or later" add: "The public Linux client says `libopus 1.1.4`." Last paragraph: "It runs at libopus's default complexity 10" becomes "Steam sets no complexity, so it runs the library's default, 9; the pinned build gives the same packets at 9 and 10".

**Model table**, rows replaced or added:

| Stage | Setting | Basis |
| --- | --- | --- |
| Voice gate | Steam's chunk rule: chunks of whole 750-sample capture steps; open when mean \|x\| ≥ 1.0% of full scale or a peak ≥ 15%; 2400 samples kept before the onset's chunk; held 0.4 s of the clock; frames of 480 from each chunk plus the remainder; one chunk a message; a fresh encoder and decoder per spurt. The clock (a 15.625 ms timer under a 55.85 ms frame) is a model | findings 5, 12 and 28 |
| Capture roll-off | as now; Windows's capture resampler, the sender's machine | findings 14, 16 and 28 |
| Codec | libopus 1.1.5 at both ends (Steam: 1.1.4, same packets): Opus 24 kHz mono, VOIP, signal=voice, 32 kbps constrained VBR, complexity 9, DTX, 20 ms; decoded to 16 bits; at most 10 frames concealed per gap | findings 11, 13, 16, 28 and 29 |
| Decoder's resampler | libswresample's default filter, 24000 to 44100 Hz, once per packet | finding 29 |
| Voice rate | 44.1 kHz, the mixer's fixed rate | finding 30 |
| Output stage | the voice at 255/256; clip at ±32767; `volume`; 16 bits; then the system's linear interpolation to the device's rate (48000 Hz) | finding 30 |
| Engine codecs | CELT 0.11 with its pitch filter, complexity 5; `vaudio_celt_high` as the 44.1 kHz mode on 22.05 kHz sound; Speex 1.0.2 on 11.025 kHz sound | finding 31 |

**What remains unverified**: "Steam's libopus build" becomes: "The release is 1.1.4 by the Linux build's own string; Windows is inferred. Whether the pinned build gives Steam's packets bit for bit needs a known input: Steam's `mic_inputfile` (W3-09) would give one." "Output stage" becomes: "The interpolation to the device's rate is the system mixer's, measured, not read; a 44100 Hz device would have none." Add: "**The sender's clock.** The chunk rule is read; when Steam's frames fall is one PC's logs and a model. **The resampler's first packet** and **the cap of 10 concealed frames** are read and not recorded. **Speex** is read from the module and cannot be recorded."

## The scan

Before the last push the branch's diff against `origin/main` was searched for 17-digit numbers, drive paths,
e-mail addresses and user names: none. The scratch scripts (the clock's simulations, the sender's prototype, the
program that drove the public resampler) are in the session's scratch folder only.
