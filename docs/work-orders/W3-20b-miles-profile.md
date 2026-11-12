# W3-20b: the `miles` profile: `vaudio_miles` as the Source engines of 2006 and 2007 ran it

> **Status 2026-11-12: built and merged** at `7534d58` (cache v32, pull request #27). Report: `docs/reports/W3-20b-miles-profile.md`. `miles` is not a TF2 codec.

Order of 2026-11-11. Medium: a new profile on the frame path, beside `speex`; no existing render changes.
**Depends on:** W3-20a (the codec module, `docs/reports/W3-20a-miles-codec.md`) and W3-17d (the settings
panel) merged. **Branch** `claude/w3-20b-miles-profile` from `main` as it stands then; the worktree is given
in the brief. `tf-builder`, then `tf-reviewer`. **Budget:** 10 hours of building, then stop and report where
you are.

## What this is, and what it is not

`vaudio_miles` is **not a Team Fortress 2 codec**. It is a codec of the Source engine family that could be
selected in the Source engines of 2006 and 2007 (those of Source SDK Base 2006 and 2007). Current TF2 ships
its files and refuses the name. Nothing this order writes, on the page, in the console, in a comment or in a
document, may say or imply that a TF2 player hears or heard it.

The profile is the codec stage of those two engines set into the app's present chain. It is **unverified**:
nothing of a running engine with this codec has been recorded. Every document that names the profile says so
in one plain sentence (given below, word for word).

The investigation behind this order is private. The order carries every fact the build needs; nothing else
of it is to be looked for. Take nothing from the README of the vendored implementation's upstream project,
and do not read it (CLAUDE.md, the rule on vendored code).

## What is known

"Read": from the engine files of Source SDK Base 2006 and 2007, or from the modules, as data. "Run": a
module run in a CPU emulator on signals of our own. "Guess" and "not known" are what they say. "Dry run": the
planner's scratch runs of the vendored module as the codec branch had it; they are not measurements of any
engine, and the builder's own figures replace them.

| Fact | Standing |
| --- | --- |
| `sv_voicecodec` defaults to `vaudio_speex`. Its value is loaded as a module by that name, with no list of names; `vaudio_miles` is accepted as any existing codec module would be. If loading fails voice is disabled with a message; there is no fall-back | read, both engines |
| Voice is captured, coded, decoded and played at **11025 Hz, 16-bit mono, for every codec**. Nothing resamples to the codec's 8000 Hz on either side, and the wrapper never reads or sets a rate | read, both; the wrapper also run |
| So VR12, an 8000 Hz codec, codes 11025 Hz sound as if it were 8000 Hz: a 360-sample frame of 12 bytes lasts **32.65 ms** (not 45), the wire carries **2940 bit/s** (not 2133), and the codec's band and pitch range reach 1.378 times higher in real sound (its 4 kHz is 5.5 kHz). Pitch and speed come out right, since playback is at the same rate | arithmetic on the two rows above |
| A voice packet is the codec's output for one call: whole 12-byte frames end to end, no header or count per frame. Samples that do not fill a frame stay in the codec object. One call takes at most 1024 samples | read, both |
| How many frames a packet held in a running engine | not known (two from a full call, three with left-overs: a guess from the sizes) |
| The receiver, in order: decode; the auto-gain on the decoder's samples (128-sample blocks; `voice_maxgain` 10, `voice_avggain` 0.5, `voice_scale` 1 by default); an interpolator at a step of exactly 1.0 that writes n-1 samples for n decoded; the mixer, whose voice source is 11025 Hz | read, both. The interpolator also run: ten packets of 360 put 3,590 samples in the buffer |
| That interpolator rule is TF2's of today (finding 24), which the app models for no profile | read; `tests/REFERENCE_2026.md` |
| The codec is never asked to decode without data: a lost packet gets no decoder call | read, both |
| The old engines' gain routine gives the app's `receiverAutoGain` on every sample: 73,418,240 of 73,418,240 (20,485 blocks of 128 samples, seven settings, both engines, two settings of the processor's precision) | run |
| The sender: every `+voicerecord` press resets the encoder's codec object (the wrapper's reset: twice over, 360 zero samples encoded and their 12 bytes decoded, in that object). A release sends one more packet with the final flag: a part frame padded with zeros, nothing kept | read, both |
| The receiver: a packet from a speaker who has no channel gets one assigned: that channel's codec object is reset (the same wrapper reset), its buffer emptied, the gain reset to unity, and playback waits 0.2 s. A packet from a speaker who has a channel is decoded at once, with no reset | read, both |
| A channel is freed when its buffer has run dry. There is no timer | read, both |
| So after a pause longer than what the receiver had buffered, the next spurt starts from reset on both sides with the gain at unity; after a shorter pause only the sender has been reset | read. That the buffer holds about the 0.2 s wait in practice is a guess |
| The sender's encoder and each receive channel are **separate codec objects**, each with both halves. The receiver's reset decodes silence coded by its own object's encoder, which has only ever coded its start-up block and zeros | read, both |
| The encoder's real start-up block is uninitialised memory in every wrapper. The module codes a block of zeros there (the owner's ruling, delegated: W3-20a) | read; run (its contents change later frames) |
| The wrappers of the 2006 and 2007 engine sets and TF2's give the same packets and samples on all eight test signals (2,505 of 2,505 frames, 901,800 of 901,800 samples); so do the plug-in of 2004 and TF2's (5,010 of 5,010 frames) | run |
| TF2 and Source SDK Base 2013 ship the files and refuse the name: their engines pass four codec names only. TF2's console: "Voice_Init Failed: invalid voice codec vaudio_miles." | read; the console line measured |
| The old engines' mixer after the voice source, and their output stage | not read |
| A recording of a running engine with this codec | none exists |

**Dry runs** (the module at 27e7841, driven as section B below drives it; 11025 Hz samples):

- A round trip costs about 0.35 ms a frame in Node: nothing here is slow.
- **The delay.** VR12 is a vocoder: it does not keep the waveform, so its delay shows only in the envelope.
  For a steady voiced sound switched on at eight places in a frame and three pitches, the lag that best
  lines up the 5 ms RMS envelopes of input and decoded sound had a median near 307 samples (28 ms), from 252
  to 412.
- **The 8-bit cut.** Digital silence decodes to digital silence. Any input whose samples all stay under 256
  in size becomes the same pattern of 0 and -256 (only the signs are left): the pauses of the suite's
  speech-like signal, -72 dBFS in, are -45 dBFS after the cut and decode at about -55 dBFS, before a gain of
  up to 20 dB. A steady voiced sound decodes 1 to 3 dB under its input down to about -30 dBFS RMS; at -42 in
  it decodes at -58, and below that at a constant -63 whatever the input's level.
- **The resets show.** Without the receiver's reset at the start every decoded frame differs (120 of 120).
  The sender's reset at the start changes few packets: frames 12, 13 and 14 of `tests/vr12/vectors/noise.s16`
  and five frames of `tones.s16`, none of `clipped.s16` or of a loud voiced signal. At a second spurt, one
  codec object shared by both sides gives other decoded samples than two objects in all 60 frames tried
  (the packets are the same), and so does resetting the sender alone.

## Rulings this order builds on (the orchestrator's; the owner delegated them; each reversible)

1. **The chain.** The sender resamples to 11025 Hz as the `speex` profile does. The wrapper and codec run on
   that sound. The gain is an engine codec's since W3-19: on the decoder's samples from its first one, the
   codec's delay dropped after the gain. Everything after the gain is what the `speex` profile has today
   (the mixer, rooms, output). What was not read from the old engines is said to be TF2's of today.
2. **The label** (first section), wherever the profile is named.
3. **Unverified**, said in one sentence in every document. No row in the accuracy tables.

## Decisions of this order (each reversible before the build; say in the report if one did not hold)

1. **Names.** Profile key `miles`; `engine: 'vr12'`; a render's `codecInfo.backend` `'vr12'`; frame code 8,
   `vr12`, beside Speex's 7.
2. **Two codec objects**, a sender's and a receiver's, each made by the module's `createCodec()`. The
   module's `reset()` is one object's whole reset, so "one reset" is one call on each.
3. **A new spurt resets both sides.** A file render with no gate is one key press from its first sample to
   its last: silence in the file is coded and sent, the receiver's buffer never empties, and nothing is reset
   after the start. That is the engines' rule, not a stand-in. A new spurt exists only with the app's own
   voice gate on (an extra the game does not have) or when the live key goes down again. There the sender's
   reset is the engines' rule; the receiver's reset at every spurt is a **stand-in**: it is right for a pause
   longer than what the receiver had buffered (about 0.2 s, a guess) and wrong for a shorter one, where the
   engines reset the sender alone. *If reversed:* the receiver is reset only after 7 or more frames not sent
   (0.23 s), and the stream's `restart` is told the pause's length.
4. **The gain is not reset at a new spurt.** The engines reset it when a channel is assigned. The app holds
   it through time nothing was sent, on every profile of the frame path (`gainRule`, "an approximation of
   that timeline only"). This profile takes that as it is: a stand-in, named in the documents.
5. **A lost or late frame plays as 360 zeros in its own place; the receiver's codec is not called, and later
   sound does not move.** This is what the frame path does for `speex` today, and BC-1's decision 2 for
   `steam`. It is a **stand-in**: in those engines nothing is queued for a lost packet, so the sound after it
   would close up while the buffer lasts, and a buffer run dry would free the channel (a reset and a 0.2 s
   wait). The loss and jitter models themselves are TF2's fits, applied as to the other engine codecs.
6. **The delay is one whole number,** the median of the envelope lags on a stated grid (section B), dropped
   after the gain. It sets how the output lines up with the source for A/B; the gain's grid does not depend
   on it.
7. **`net_split` over 20 is the number of frames in a packet,** as for every codec (20 is one frame, 40 two);
   here a frame is 32.65 ms. The default is one frame a packet. The engines' own count is not known.
8. **The page:** the one codec control keeps all profiles, in two groups (section D). *If reversed:* the
   Miles option moves into "Extras: not in the game" as a control of its own.
9. **README:** a section of its own, not a row of the Profiles table.
10. **No registered prediction now.** No take is planned, the encoder's first frames are not defined by the
    engines' code, and the decoder is within one step, not exact. If the owner decides to record (last
    section), a prediction is registered then, before the take, in a file of its own.
11. **The profile's tests are a new suite,** `tests/miles.verify.mjs`, so that W3-20a's last fixes to
    `tests/vr12.verify.mjs` do not meet this order.

## What to build

**A. `constants.js`.** `CODEC_PROFILES.miles`, after `speex`:
`{ displayName: 'vaudio_miles (Voxware VR12 on 11 kHz sound, 2.9 kbps; Source 2006/2007, not TF2)',
engine: 'vr12', codecRate: 11025, frameSize: 360, packetBytes: 12, bitrate: 2940, voiceRate: 11025,
status: 'unverified' }`, with no `senderGate` (push-to-talk). Nothing reads `status` (check); add
'unverified' to the comment's list. The entry's comment says, in this order: not a TF2 codec, and where it
could be selected; what the codec stage is and that it is read from those engines; that the start-up block
is zeros; the three stand-ins (decisions 3, 4, 5); that everything after the gain is TF2's of today; that it
is unverified. The header comment's sentence listing the codecs gains VR12. No preset uses the profile.

**B. `opus-codec.mjs`.** As the Speex functions are built (`openSpeex`, `speexRoundTrip`,
`createSpeexStream`, `speexInfo`), for `vendor/voxware-vr12/index.mjs`, loaded only when first used:

- **Open.** Refuse any rate but 11025. Make the sender's codec and the receiver's codec, call `reset()` once
  on each, and make a `createFramer` on each. That is the render's start: the key press and the channel's
  assignment.
- **Encode a frame.** 360 floats become 16-bit samples where Speex's do, by the same rule (`speexInput`:
  x times 32768, rounded to nearest with ties to even, clamped), then the sender's framer's `compress`,
  which must give exactly 12 bytes. The 8-bit cut is the module's; do not repeat it.
- **Decode a frame.** The receiver's framer's `decompress`, each sample over 32768. Nothing else.
- **A lost frame:** 360 zeros; the receiver's codec is not called.
- **A new spurt** (`restart`): `reset()` on both objects and a new framer on each (decision 3). Never a new
  codec.
- **The final flag.** Every frame the frame path codes is whole, its end padded with zeros, so the final
  flag has nothing left to pad: a render's last frame that holds source samples is the frame the framer's
  final call makes (test 2 shows it). The frames past the source's end, coded to bring the delay's samples
  out, are the app's own, as for every codec.
- **The delay** (`lookahead`), a named constant with its measurement in the comment. Measure it so: at
  11025 Hz, 0.33 s of zeros, then a steady voiced sound (a harmonic series at pitch P, about -12 dBFS) for
  0.36 s, then zeros; P of 100, 140 and 190 Hz; the onset at sample 3600 + 15 k for k from 0 to 23, a whole
  frame in steps of 15: 72 runs. Each through the two codecs as opened above, no gain. For each, the lag
  from -200 to 1200 samples that gives the highest normalised correlation between the 55-sample RMS
  envelopes of the input and of the decoded stream. The constant is the median, rounded. A test computes it
  again and requires the same number. Report the median, the quartiles and the range.
- **The round trip** returns what `speexRoundTrip` returns (`samples`, `head`, `info`), frames logged as
  code 8 and counted in `modes.vr12`, `plc: 'zeros'`, `frameMs` 1000 x 360 / 11025, `packetBytes` 12,
  `bitrate` 2940, `vbr` and `dtx` false, the module's `version`, and `onPacket` as Speex's has it. The
  stream has `createSpeexStream`'s interface, with `mode: 'vr12'`. It also counts its resets, sender's and
  receiver's, in a property the tests can read (as `wrapped` is for Speex): no sample of most signals shows
  the sender's first reset.
- `FRAME` gains `vr12: 8`.

**C. `audio.js`.** Only these places; nothing after the mix point, nothing of the `steam` path:

| Place | Change |
| --- | --- |
| `FRAME_CODES` | `vr12: 8` |
| `process`, the frame path's choice of round trip | a branch for `engine === 'vr12'`, given `common` as Speex's is |
| `createRender`, the choice of stream | a branch: `kind = 'vr12'` |
| `codecStage` | `kind` `'vr12'`: its `modes` has the key `vr12`, as Speex's has `speex` |
| `codecResultInfo` | a branch giving what the round trip's `info` gives, key for key |
| `createLiveChain`, the choice of stream; the two `stats.modes` | a branch; the key `vr12` |
| Comments that list the engine codecs or their delays (`gainLead`, `decodedFromFrames`, the frame lengths) | VR12 and its figures added |

**D. The page (`index.html`, and where the chain strip is updated).** As W3-17d left the panel. Its last
commits were still changing this control's label, option texts and help when this order was written, so the
rules below are given by what must hold, and the words of `main` decide the rest:

- The codec control's options go into two groups. `<optgroup label="Team Fortress 2">` holds `steam`,
  `celt_22`, `celt_44` and `speex`, in that order. `<optgroup label="Not in Team Fortress 2">` holds
  `steam_48` and then the new `<option value="miles">`. Its text begins `vaudio_miles: not in TF2` (a closed
  control shows the option's text and not its group's label, so the option says it itself) and goes on
  ` (VR12, 2.9 kbit/s)` if that fits the control's box at 390 px by the page's own check, else ` (VR12)`.
  The control's label keeps `sv_voicecodec`: the old engines have that variable too.
- Under the control, a paragraph `id="codec-note"`, hidden unless `miles` is chosen, named in the control's
  `aria-describedby` beside what is there (*corrected 2026-11-11, W3-20b's review: named in aria-describedby only
  while shown; a screen reader reads a hidden element that aria-describedby names*), with exactly: "vaudio_miles is not a TF2 codec. The Source
  engines of 2006 and 2007 could run it; current TF2 ships its files and refuses the name. It has not been
  checked against any recording of a running engine. Everything after the receiver's gain is TF2's of
  today."
- **The control's help sentence.** If `main` has one, it says which options are the game's older codecs
  ("the others", or "the vaudio_ ones"); with `vaudio_miles` in the list either is false. It becomes "What
  the game sends voice with. Steam voice is today's; the rest of the first group are its older codecs."
  (105 characters). If `main` has no such sentence, add none and say so in the report: the orchestrator then
  amends W4-01d's table.
- The chain strip's Codec cell: `VR12 on 11.025 kHz sound · 12-byte frames of 32.65 ms · 2.94 kbit/s · not
  a TF2 codec`, with ` · snd_bits not used` when the bitrate scale is not 16, as for Speex.

**E. The console, the render's lines, the lane, the live panel.**

- `app/console.js`: `sv_voicecodec`'s help keeps `main`'s words and gains, at its end, "; miles
  (vaudio_miles of the Source engines of 2006 and 2007: not a TF2 codec, unverified)". `snd_bits`'s help
  says `vaudio_miles` ignores it where it says so of `vaudio_speex`. `net_split`'s and `net_fakeloss`'s
  help change only if they name Speex's frame or what a lost Speex frame plays: then they name
  `vaudio_miles` beside it (BC-1 rewrites both: then leave them).
- `app/render.js`: the codec's name "Voxware VR12" where "Speex 1.0.2" is chosen; a live take's backend and
  `plc`; and after the `S_Voice` line of a `miles` render one more line: "S_Voice: vaudio_miles is not a TF2
  codec (Source engines of 2006 and 2007); not checked against any recording".
- `app/visualizer.js`: `FRAME_STYLE` gains entry 8, "VR12", in a colour of its own: "VR12: a vocoder at
  2.9 kbit/s, here on 11.025 kHz sound; vaudio_miles, not a TF2 codec". The "lost" entry names
  `vaudio_miles` beside `vaudio_speex`.
- `live.js` (the mode's name, "VR12") and `live-worker.js` (code 8 counted in `modes.vr12`).
- `reference.js`: the one condition that counts a frame as coded (codes 1 to 3, or 7) takes 8 too, with a
  check in `tests/reference.verify.mjs` as the Speex one, and a dated note in
  `tests/predictions/PREDICTIONS.md` (which hashed model files this order changes; no predicted take uses
  `miles`; the recorded renders of every other profile are unchanged).

**F. `sw.js`.** `./vendor/voxware-vr12/index.mjs` and `./vendor/voxware-vr12/voxware-vr12.wasm.mjs` join
`ASSETS`; `CACHE` is `main`'s number plus one when the branch last brings `main` in.

**What needs no change** (confirm each, and say so in the report): `gainLead` and `decodedFromFrames` (a
profile with `engine` set, a voice rate equal to the codec's and no decoder EQ gets the W3-19 rule; a block's
frame is floor(m / 360)); the gate (its frame counts follow `frameSize`: a pre-roll of 4 frames and a hold
of 13); the loss masks; the mixer, rooms and output; the workers and `batch.js` (they load `opus-codec.mjs`,
which loads the module); `demo.js` and the demo's received voice (a TF2 demo cannot hold this codec, and
`DEMO_PROFILES` gets no entry). If the measured delay is more than a frame (360), check by a test that
`codecStage`, the round trip's `head` and the live chain's stated delay hold: no profile has had that yet.

## To measure and report (figures for the report and the documents)

1. The delay (B): median, quartiles, range.
2. **Where the 8-bit cut shows.** On the suite's speech-like signal (`voice(20, 48000, 1)` of
   `tests/render-stream.verify.mjs`), in its pauses and in its spurts: the level of the codec's input, of the
   same after the cut (computed by the test: each sample's high byte times 256), of the decoded stream, and
   of the gain's output (`onGain`), beside the `speex` profile's on the same source. And a steady voiced
   sound at 0, -12, -24, -36, -42, -48 and -60 dBFS: the decoded level for each, and the level under which
   only the signs are left. And that digital silence stays digital silence.
3. **What decision 3 is worth.** For a second spurt, the difference between the decoded sound with the
   receiver reset and without, as a level against the sound's own; the same for one shared codec object.

## Tests

`tests/miles.verify.mjs`, added to the `test` script of `package.json`. **Reference samples and packets come
from the vendored module driven by the test itself** (two codecs, the resets, a framer on each), never from
`opus-codec.mjs`. Each check is shown to fail when its rule is broken; say how in the report.

1. **The profile table:** the entry's fields; no sender gate; a render's `codecInfo` (11025 Hz, 360 samples,
   32.65 ms, 12 bytes, 2940 bit/s, `plc` zeros, every frame code 8 and counted in `modes.vr12`).
2. **The codec stage is the module.** `process` through a watched codec module, as
   `tests/speex102.verify.mjs`'s `watchedEngine` does it, on at least three sources (speech-like at 48 kHz, a
   quiet one near -40 dBFS, noise) and on `tests/vr12/vectors/noise.s16` and `tones.s16` given as 11025 Hz
   sources (each sample over 32768, so the rounding gives it back): the codec's input is the 11025 Hz capture
   signal; every packet is the reference sender's; every decoded sample is the reference receiver's over
   32768; `samples` is that stream with the delay dropped. The same 16-bit capture pushed through the
   module's framer in pieces of odd sizes, the last call with the final flag, gives the same bytes for every
   frame that holds source samples.
3. **The resets.** One on each object before the first frame: by the stream's count, and by samples where
   they show (the receiver's on any source; the sender's on the two vector signals). With the gate on and
   two spurts: the second spurt's packets and decoded samples are the reference's with both objects reset
   between the spurts, and its decoded samples are not those of a sender reset alone, of one shared object,
   or of new codecs.
4. **The 8-bit cut reaches the render:** a source whose 16-bit samples all lie from -255 to 255 gives the
   packets of the same source with every negative sample -256 and every other 0; two sources that differ
   only in their low bytes give the same packets.
5. **Where the 16 bits are made:** 0.5 to 0, 1.5 to 2, 2.5 to 2, past full scale to 32767 and -32768.
6. **Loss.** By a hand-made mask through the round trip, and by `lossPct` in a render: a lost frame and a
   late one are logged as such and play as 360 zeros in their own place; the output's length and every other
   frame's place are those of the loss-free render; the frame after a lost one is what a reference receiver
   gives that never saw the lost packet, and is not the loss-free render's frame.
7. **The gain** (in `tests/gain.verify.mjs` [4b], `miles` joining the loops, with a module-driven decoder
   stream; a check whose words are Speex's gets Miles's own): `process`'s gain output (`onGain`) is the
   receiver's whole decoded stream through `receiverAutoGain` at `maxGain` 10 with the delay dropped after,
   bit for bit, and not the gain run after the drop; with the gate on, with a block's frame floor(m / 360);
   with the gain off, the decoded stream with the delay dropped.
8. **`createRender` in pieces of odd sizes equals `process`:** samples, the gain's output and `codecInfo`,
   in test 7's cases and in the recorded cases below.
9. **The live chain.** With the key held, at 48000 and at 44100 Hz: what its `onGain` sees is the reference
   receiver's decoded stream through `receiverAutoGain`, bit for bit (the live chain drops no delay); its
   stated delay is the constant at 11025 Hz in the context's samples; `stats` count 12 bytes a frame sent,
   `modes.vr12`, `lastMode` `'vr12'`; the chain reports 2940 bit/s, 360-sample frames, 11025 Hz. With a
   scripted key (up for some frames, then down): frames not sent are zeros, `restart` runs once at the
   press, and the gain's output is the reference's with both objects reset there. With `lossPct`: the frame
   codes are the render's.
10. **`snd_bits` changes nothing** in a render and in the live chain (samples, packets, 2940 bit/s).
11. **`net_split`:** at 40 with no jitter the lost frames come as whole packets of two.
12. **The last part frame:** sources of 100 x 360 + 37 and of 100 x 360 samples at 11025 Hz have
    ceil((length + delay) / 360) frames, and the source's last samples are coded. Determinism: the same
    source and settings give the same samples twice.
13. `tests/verify.js`: `miles` joins [5]'s table (`vr12`, 2940) and the loops over every profile (the empty
    source through a room, the very short source).
14. **The words** (Node, reading the files): `index.html` holds the note's four sentences word for word and
    the Miles option inside the group labelled "Not in Team Fortress 2"; each of `README.md`,
    `tests/LEGACY_CODECS.md`, `tests/REFERENCE_2026.md` and `vendor/voxware-vr12/README.md` holds the
    sentence "It has not been checked against any recording of a running engine."; README's "Accuracy"
    section names neither the profile nor the codec.

**The browser suite** (`tests/browser.verify.js`, a section of its own beside the Speex one):

- the option exists; its group is "Not in Team Fortress 2", which holds exactly `steam_48` and `miles`; the
  group "Team Fortress 2" holds exactly the four; W3-17d's classification check also requires the Miles
  option to say "not in TF2";
- the note is hidden for the other five profiles and shown, with its exact text, for `miles`;
- a `miles` render plays and downloads, checked as W3-17d's "plays and downloads" check does it;
- the `S_Voice` line, the added line, the status line, the chain strip's cell and the lane's legend ("VR12"
  with every frame) read as above, and none of them says CELT, Opus, SILK or Speex;
- the console's `sv_voicecodec miles` selects it, and a link with `#codec=miles` restores it;
- the live monitor with `miles`: the panel's mode reads "VR12", and a recorded take names VR12;
- the two vendor files are in `RUNTIME_FILES` and in the offline list, and a `miles` render works offline.

## Recorded hashes

New cases in `tests/render-stream.verify.mjs`, each with its `GOLDEN` and `GAIN_GOLDEN` lines, recorded in
a commit of their own after the code and listed in the report:

- `miles` (the profiles' 20 s source; plans `uneven` and `960`)
- `miles, gate on, loss 15%, jitter 300 ms`; `miles, loss 15%, net_split 40 ms`;
  `miles, source at 11.025 kHz`; `miles, source at 8 kHz` (the 8 s source, as the Speex cases)
- `miles, 100 samples at 96 kHz` (plan `7`)
- `miles, voice_maxgain 1, gate on, loss 15%`; `miles, auto-gain off` (the W3-19 source)

**No existing hash moves.** The diff of both tables has added lines only. The `steam_48` live hashes of
`tests/verify.js`, the vendored modules' hashes and `tests/predictions/predictions.json` are untouched.

## Docs

The two sentences, used word for word wherever a document introduces the profile:

- "`vaudio_miles` is not a Team Fortress 2 codec: it is a codec of the Source engine family that could be
  selected in the Source engines of 2006 and 2007, and current TF2 ships its files and refuses the name."
- "It has not been checked against any recording of a running engine."

- **`README.md`:** after the Profiles table's paragraphs, a section "`miles`: a codec that is not TF2's":
  the two sentences; what runs (VR12 behind the 8-bit cut, on 11025 Hz sound as if it were 8000 Hz: the
  figures of the facts table); the chain (ruling 1) and that everything after the gain is TF2's of today;
  the stand-ins (the start-up block of zeros; both sides reset at a new spurt; the gain held, not reset; a
  lost frame as zeros in place; the interpolator's dropped sample not modelled, as for every profile; the
  decoder within one step of the plug-in); what the 8-bit cut does to a quiet voice, with the measured
  figures. No row in the Profiles table and nothing in "Accuracy". The files table gains
  `vendor/voxware-vr12/`, the notice line its `LICENSE` and `COPYRIGHT.musl`, the tests list the new suite.
  "Controls and console" where it lists the codecs.
- **`tests/LEGACY_CODECS.md`:** the introduction's "the app has no profile for it"; the `vaudio_miles`
  section: its table's frame time and bit rate are the codec's own belief at 8000 Hz, so add what the two
  engines made of them, and replace the "Engine rate: not known" row and the "Not known" bullet with what is
  read (the facts table, each line with its standing); a paragraph "In the app" (the profile, the decisions
  marked as stand-ins, the measured delay and levels); what stays unknown (frames per packet, the real
  start-up block, what a listener heard at a lost packet, the old mixer and output).
- **`tests/REFERENCE_2026.md`**, as dated corrections in the file's own manner: in finding 31, the
  `vaudio_miles` bullet's last clause ("the rate an engine gave it is not known") is corrected by a new
  bullet with the facts table's substance and the profile; one sentence there or in finding 24 that the
  engines of 2006 and 2007 have the same interpolator rule (read and run); one that their gain routine equals
  the app's (run, the count above); under "What remains unverified", a bullet for the profile. No row in
  the results tables.
- **`vendor/voxware-vr12/README.md` and `index.mjs`'s header comment:** the sentences that say nothing loads
  the module and that the engine's rate is not known. Nothing else in that folder.
- **`tests/predictions/PREDICTIONS.md`:** the dated note (E).
- **The report,** `docs/reports/W3-20b-miles-profile.md`: the commits; each test with the break that fails
  it; the new hashes and the statement that no other moved; the three measurements; the page's strings as
  built; which of "what needs no change" was confirmed and how; W4-01d's sentence, changed or handed back;
  the CI run; the scan of the diff; what was not done.
- `docs/PROGRESS.json` is the orchestrator's. No names of people or of assistant models, no addresses in
  the game's files, nothing of the private recordings or of the owner's modules.

## Files

**May touch:** `constants.js`, `opus-codec.mjs`, `audio.js` (the places of C), `reference.js` (the one
condition), `index.html` (the codec control), `style.css` (only if the note needs a rule; prefer
`control-help`), `app/console.js`, `app/render.js`, `app/visualizer.js`, `live.js`, `live-worker.js`,
`sw.js`, `package.json` (the `test` script), `README.md`, `tests/LEGACY_CODECS.md`,
`tests/REFERENCE_2026.md`, `tests/predictions/PREDICTIONS.md`, `vendor/voxware-vr12/README.md` and
`index.mjs` (the sentences named, comments only), `tests/miles.verify.mjs` (new), `tests/verify.js`,
`tests/gain.verify.mjs`, `tests/render-stream.verify.mjs`, `tests/reference.verify.mjs`,
`tests/browser.verify.js`, `docs/reports/W3-20b-miles-profile.md`.

**May not touch:** the rest of `vendor/` (the four vendored files and the built module above all),
`tests/vr12/`, `tests/vr12.verify.mjs`, `tests/vendor-opus.mjs`, `steam-sender.js`, `voice-channel.js`,
`demo.js`, `batch.js`, `audio-worker.js`, `live-worklet.js`, `mic-capture.js`, `room-dsp.js`,
`room-presets.js`, `app/rooms.js`, `app/source.js`, the rest of `app/`,
`tests/predictions/predictions.json`, `tests/accuracy.mjs` and its takes file, `docs/PROGRESS.json`,
`CLAUDE.md`.

**Where other orders meet this one.** Whichever branch merges second brings `main` in with a merge and
keeps both sides. Line numbers are near those of W3-17d's branch while it was still being finished; find
each place by its text.

| File | This order | The other |
| --- | --- | --- |
| `index.html` 78 to 86, the codec control | the two groups, the option, the note | W4-01d: the label "Voice codec", the help sentence, shorter option texts |
| `sw.js` 16 | `CACHE` up by one | W4-01d and BC-1: the same line; the second takes `main`'s number plus one |
| `app/console.js` 323 to 332 | the help strings | BC-1: `net_fakeloss` and `net_split`; W3-17d and W4-01d: every help |
| `app/console.js` 576, the Codec cell | a branch | W4-01d: the Receiver cell beside it |
| `constants.js` 289 to 400 | the new entry after `speex`, the header comment | BC-1: comments above `VOICE_ENGINE`; W4-01d: `displayName`s |
| `audio.js`, `opus-codec.mjs` | the frame path's branches, new functions | BC-1: the `steam` path only |
| `tests/render-stream.verify.mjs` | added cases and lines | BC-1: five `steam` hashes re-recorded |
| `tests/browser.verify.js` | a new section, the two lists of cached files | W4-01d: the panel's checks |
| `README.md`, `tests/REFERENCE_2026.md` | a new section; finding 31 and "What remains unverified" | BC-1: loss; W3-20a's fix round: finding 31's Miles bullet |
| `package.json`, the `test` script | one suite added | any order adding a suite |

## Stop and report instead of guessing if

- an existing recorded hash moves, in any table;
- the profile's packets or decoded samples are not the module's in any frame;
- the module lacks something this order needs (then the fix is W3-20a's, not a change here);
- the envelope lags spread over more than a frame, or fall into two groups: one delay is then not a fair
  description, and the orchestrator decides;
- the frame path cannot take a delay longer than a frame without a change outside C's places;
- a sentence of the label cannot be kept true where the page or W4-01d's words put it;
- a rule here contradicts the code as `main` has it, or needs a file from the "may not" list.

## Done means

- `pnpm test:vendor` and `pnpm test` pass; the browser suite passes, run as
  `flock /tmp/tf2ve-heavy.lock env CHROMIUM_EXECUTABLE=<the machine's Chromium> node tests/browser.verify.js`;
  the branch's CI run is read and its result is in the report.
- Every test above exists and was seen to fail on its break.
- `git diff origin/main...HEAD` and the commit messages were scanned for what CLAUDE.md's hard rules forbid.

## One day: what a recording could settle (the owner's choice; optional; unverified)

Nobody has run this. The variables below are registered in both engines with default 0 (read); what they
do there was not run, and the file names are TF2's of today (W3-03's report), not read for these builds.

1. Install Source SDK Base 2006 or 2007 from Steam's tools and start a mod on it, as a listen server with
   `maxplayers 2` or more (with one slot the server names no codec: read).
2. Before `map`: `sv_voicecodec vaudio_miles`. After the map loads, keep the console's text: a codec that
   failed to load prints a message that voice is disabled.
3. `voice_loopback 1`, `voice_showincoming 1`, `voice_maxgain 1`, `voice_inputfromfile 1` with a 16-bit
   mono 11025 Hz WAV of a signal of ours as `voice_input.wav` in the game's folder (2007 also has
   `sv_allow_voice_from_file`, default 1), and `voice_recordtofile 1`. Hold the talk key for the file's
   length; release; press again after a second, and once more after a pause of a tenth of a second.
4. Keep `voice_decompressed.wav` and `voice_micdata.wav` if they appear, and the console log. Repeat at
   `voice_maxgain 10`. `voice_writevoices 1` may keep each channel's voice without a length limit.

What it would show: that the engine runs the codec at 11025 Hz (the decoded length for the file's length);
how many frames a packet holds (the console's sample counts); the decoded samples against the profile's
(past the first frames, which the engine's own start-up block decides); the gain's blocks; whether a short
pause leaves the receiver's decoder as it was; and, with a second player and `net_fakeloss`, what a lost
packet sounds like.
