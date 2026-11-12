# Legacy voice codecs: what is known

Source's older engine codecs are `sv_voicecodec vaudio_celt`, `vaudio_celt_high` and `vaudio_speex`. The `celt_22` and `celt_44` profiles run the real codec, CELT 0.11 ([`vendor/celt-0.11`](../vendor/celt-0.11/README.md)), built as the game's module is and at the settings it uses, both read from the owner's copy of the module (W3-03, W3-08) and checked against the game's own recording of its decoded voice (Set H, `tests/REFERENCE_2026.md` finding 31). The `speex` profile runs Speex 1.0.2 ([`vendor/speex-1.0.2`](../vendor/speex-1.0.2/README.md)) as the game's `vaudio_speex` module does, read from the owner's copy of a module from another Source game (W3-09, section 5), with the module's arithmetic since W3-18. TF2's 64-bit game cannot run it; its 32-bit game (`-force32bit`) runs and records it (Set O), as HL2DM's 32-bit game does (Set M). The receiver's gain on all three runs on the decoder's own samples at the codec's rate, checked against the game for `vaudio_celt` and `vaudio_speex` (Sets H and M; findings 26 and 31). The profiles have no gate by default and send everything. This file collects what is known about the real codecs. `vaudio_miles`, a codec the Source engines of 2006 and 2007 accepted and current TF2 ships and refuses, has a section of its own below; the app's `miles` profile runs it as those engines did, unverified (W3-20b).

Leaked engine source was deliberately not used. Valve's public Source SDK 2013 has no voice-codec code: the codecs live in the engine's `vaudio_*` libraries.

## Summary

| `sv_voicecodec` | Real codec (public evidence) | App profile | Evidence |
|---|---|---|---|
| `vaudio_celt` | **CELT 0.11** custom mode, mono, pitch filter compiled in. **22050 Hz**, **512-sample frames** (23.2 ms), **64-byte constant-size packets** = 22.05 kbps. Complexity 5, the library's default. | `celt_22`: CELT 0.11 built and set as the game's module; decoded voice at 22.05 kHz | Read from the game's module (W3-03, W3-08). Set H: the packets are 512 samples at 22050 Hz, and the codec gives the game's decoded samples but for 1 of 292,352, one step off |
| `vaudio_celt_high` | The same module and codec, the **44100 Hz mode** with **1024-sample frames** and **128-byte packets**, fed **22050 Hz sound**: 46.4 ms frames, 22.05 kbps, nothing above about 10 kHz. Complexity 5. | `celt_44`: the same, on 22050 Hz sound; decoded voice at 22.05 kHz | Read from the game's module (W3-03, W3-08). Set H: the packets are 1024 samples at 22050 Hz, and the codec gives the game's decoded samples but for 75 of 292,864, each one step off |
| `vaudio_speex` | **Speex 1.0.2** narrowband (1.0.1 cannot be told apart), quality 4 for the engine's 3: **20-byte frames**, constant bit rate, enhancement on, complexity 2. **Fed the engine's 11025 Hz sound with no resampling**: 160-sample frames of **14.51 ms**, **11.025 kbit/s**, a band to 5.5 kHz. Decoded samples wrap past full scale. | `speex`: Speex 1.0.2 set up and framed as the module does, on 11025 Hz sound; decoded voice at 11.025 kHz; a lost frame plays as zeros | Read from a module the owner supplied (W3-09, section 5). The app's build has the module's arithmetic (W3-18): it equals the module, run in a CPU emulator, on seven clips and its cosine and arc cosine, and HL2DM's 32-bit game's decoded recording (Set M) sample for sample (the orchestrator's private run). TF2's 64-bit game asked for it runs `vaudio_celt` (W3-09, section 6); its 32-bit game runs it, and the app's whole render gives that game's recordings sample for sample (Set O) |

## vaudio_celt

- **The game's module** (`vaudio_celt.dll`, read in W3-03 and W3-08). `vaudio_celt` and `vaudio_celt_high` are one module and one codec class. The engine passes 3 for `vaudio_celt` and 4 for `vaudio_celt_high`, and the module looks the number up in a table of five settings:

  | Row | Rate | Frame | Packet | Bit rate at that rate | Selected by |
  | ---: | ---: | ---: | ---: | ---: | --- |
  | 0 | 44100 | 256 | 120 bytes | 165.4 kbps | nothing in the engine |
  | 1 | 22050 | 120 | 60 bytes | 88.2 kbps | nothing |
  | 2 | 22050 | 256 | 60 bytes | 41.3 kbps | nothing |
  | 3 | 22050 | 512 | 64 bytes | 22.05 kbps | `vaudio_celt` |
  | 4 | 44100 | 1024 | 128 bytes | 44.1 kbps | `vaudio_celt_high` |

  It creates the mode, a mono encoder and a mono decoder, and sends each request 8 (`CELT_RESET_STATE`). It sets nothing else: complexity, bit rate, VBR and prediction stay at the library's defaults, so the complexity is **5**. It codes with the library's 16-bit entry points, `celt_encode` and `celt_decode`. The engine resets the codec again each time recording starts.
- **The build.** The module is the public CELT 0.11 tree the app pins ([mumble-voip/celt-0.11.0](https://github.com/mumble-voip/celt-0.11.0) at its last commit), a float build with **`OPUS_BUILD`** defined. That compiles in the pitch pre-filter in the encoder and the post-filter in the decoder (its table of tap gains is in the module), and two control requests the module also has. Without the filter the encoder is another encoder, and the decoder refuses every packet whose filter flag is set (`CELT_CORRUPTED_DATA`).
- **Public tools.** Three tools decode real CS:GO demo voice with `celt_mode_create(22050, 512)`, `celt_decoder_create_custom(mode, 1)`, reading 64 bytes per frame: [ericek111's gist](https://gist.github.com/ericek111/abe5829f6e52e4b25b3b97a0efd0b22b), [FrozenFish259/csgo_demo_voicedata_decoder](https://github.com/FrozenFish259/csgo_demo_voicedata_decoder) (which builds against celt-0.11.0) and [saiko-tech/csgo-demo-voice-capture-example](https://github.com/saiko-tech/csgo-demo-voice-capture-example). To read pitched voice they must have the filter compiled in; their build files were not checked. Two SourceMod extensions that inject voice, [arthurdead/voicesend](https://github.com/arthurdead/voicesend/blob/master/voicecodec_celt.cpp) and [Dolly132/sm-ext-voice](https://github.com/Dolly132/sm-ext-voice), set `CELT_SET_COMPLEXITY(10)`. The game's module does not; the recordings cannot tell 5 from 10 (with the filter, 5 to 10 are one encoder), but 5 is what the module reads.
- **Rate control.** A fixed packet size of 64 bytes makes CELT constant-rate.
- **Set H** (finding 31): the owner set `sv_voicecodec vaudio_celt`, gave the game a 16-bit mono 22050 Hz file as its microphone (`voice_inputfromfile 1`) and recorded its decoded voice (`voice_recordtofile 1`). The packets are 512 samples at 22050 Hz. The game's file reader starts **two samples into the file**: it skips four bytes after the data length. That belongs to the file input, not to the codec, so the app does not do it; anyone repeating Set H against a render must start the render's input at the file's third sample. With that, the project's build gives the game's decoded voice at 292,351 of 292,352 samples; the one left is one step off.

**In the app.** `celt_22` runs this codec as the module does: 512-sample frames, 64-byte packets, complexity 5, the reset after creation, 16-bit in (the float input rounded to nearest, ties to even) and out. Loss and jitter act on 23.2 ms frames. The codec's delay (64 samples, its MDCT overlap) is trimmed, so renders keep the source timeline. The WebAssembly build's packets and samples are bit for bit those of a native build of the same source (`node tests/celt011/build.mjs --native`, recorded in `tests/opus.verify.mjs`). Before W3-06 the app's build had the filter compiled out: it was 17.7 dB from the game's samples on Set H, and it could not decode the game's packets.

## vaudio_celt_high

- **Row 4 of the table:** `celt_mode_create(44100, 1024)`, 128-byte packets. The game's help text calls it "44kHz, 44kbps": 128 bytes per 1024 samples is 44.1 kbps at 44.1 kHz.
- **But the engine feeds it 22050 Hz sound.** The voice rate comes from the codec's name, and is 22050 for every codec but `steam` and `vaudio_speex` (W3-03). So a 1024-sample frame lasts **46.4 ms**, 128 bytes a frame is **22.05 kbps** in real time, the same as `vaudio_celt`, and the mode's 20 kHz band edge falls at about **10 kHz** of real sound. On 22050 Hz noise the band at 9 kHz comes back at −0.6 dB, and a 10.5 kHz tone at −69.5 dB (`tests/opus.verify.mjs`). A pure steady tone near the top of the band can come back a few dB off (+3.4 dB at 9 kHz, −4.4 dB at 8 kHz): the pitch filter acts on it.
- The one public source, [voicesend](https://github.com/arthurdead/voicesend/blob/master/voicecodec_celt.cpp), uses row 0 (44100 Hz, 256 samples, 120 bytes), which the engine never selects.
- **Set H** recorded it the same way as `vaudio_celt`: packets of 1024 samples at 22050 Hz. The project's build gives the game's decoded voice at 292,789 of 292,864 samples; the 75 left are each one step off, in five packets.

**In the app.** `celt_44` (the key is kept, so saved settings keep working) runs the 44100 Hz mode on 22050 Hz sound: the mode is created at its `modeRate`, 44100, and everything else (frame times, the bitrate reported, the gate's frame counts, the loss model, the delay of 128 samples) uses 22050. The receiver runs at 22.05 kHz with the linear-interpolation mixer, as for `vaudio_celt`. Before W3-06 the profile ran row 0 on 44100 Hz sound (165 kbps), and the demo reader cut `vaudio_celt_high` voice into 120-byte packets, so none of it came out as sound.

## vaudio_speex

- Speex is BSD-licensed ([xiph/speex](https://github.com/xiph/speex)).
- **Read from the module** (`docs/reports/W3-09-steam-voice.md`, section 5), a `vaudio_speex` module of another Source game the owner supplied; TF2's 64-bit folder ships none; its 32-bit folder ships one of the same compiler and size, 50 bytes of code apart (seen 2026-11-11). It is narrowband **Speex 1.0.2** (2003), floating point. The engine's quality 3 is Speex's quality 4: sub-mode 3, 20 bytes a frame, constant bit rate. The decoder's enhancement is on; nothing else is set, so complexity is the library's default, 2.
- **No resampling.** The module hands the engine's 11025 Hz samples to the narrowband codec as they are, and the codec believes they are 8000 Hz. So a 160-sample frame lasts **14.51 ms**, 20 bytes a frame is **11.025 kbit/s**, the band reaches **5.5 kHz**, and the pitch search covers **77 to 649 Hz** (56 to 471 Hz at 8000 Hz). Public tables that give 8000 Hz for `vaudio_speex` give the codec's own belief.
- **Decoded samples wrap.** The module truncates each decoded float toward zero to 16 bits with no clamp, so a value past full scale wraps to the other end. Loud speech wraps often: 2,106 samples of the tests' speech-like signal and 6,953 of a full-scale square wave (6,956 pass full scale; three by less than a step). It is heard as crackle on peaks.
- **Packets.** The module's wrapper packs whole frames back to back and keeps the rest for the next call. The engine hands it 165 samples each 15 ms tick, so about one packet in thirty holds two frames.
- **Which release.** The module's reading cannot tell 1.0.1 from 1.0.2 (1.0.1 has no tag), and it does not matter for the sound: native builds of Speex 1.0 and 1.0.2 gave identical packets and decoded frames at these settings on 13 signals (W3-12a and its review). Their differences are in paths this mode never takes. 1.0.2 has **no input high-pass** (1.2.1 had one on each side), so low frequencies keep their phase.
- **Not in TF2's 64-bit game.** *Corrected by Set O (2026-11-11): TF2's 32-bit game (`-force32bit`) runs and records `vaudio_speex`; only the 64-bit game falls back.* A current TF2 asked for `vaudio_speex` falls back to `vaudio_celt` (W3-09, section 6; on someone else's server, to the Steam codec, inferred), and older reports say it fails to load ([#7551](https://github.com/ValveSoftware/source-1-games/issues/7551), also [Portal 2 #226](https://github.com/ValveSoftware/portal2/issues/226)). The module has no concealment, and what the engine plays for a lost Speex packet was not read.
- **Recorded in another game (Set M, 2026-11-11).** HL2DM's 32-bit game (started with `-force32bit`) runs `vaudio_speex`, and was recorded with a file as the microphone at `voice_maxgain` 1 and 10 (`tests/REFERENCE_2026.md`).
- **The module's arithmetic.** The module was compiled with its compiler's fast floating-point model for SSE2, so in 25 places of libspeex it computes otherwise than strict C of the same source, and its float cosine and arc cosine are its C runtime's, which are not correctly rounded (W3-09, section 5, the added paragraph; W3-18). A strict build of the unchanged source gives the same sound but codes it differently from one frame on: Set M's gain-1 recording in 92,967 of 145,920 samples.

**In the app.** The `speex` profile runs Speex 1.0.2, built to WebAssembly by [`tests/speex102/build.mjs`](speex102/build.mjs) from the Xiph tag with the module's arithmetic since W3-18: [`tests/speex102/patch.mjs`](speex102/patch.mjs) states the 25 places in plain C, and [`tests/speex102/vsx_math.c`](speex102/vsx_math.c) has the module's cosine and arc cosine, written from a specification of their arithmetic ([`tests/speex102/SPEC-cosf-acosf.md`](speex102/SPEC-cosf-acosf.md)) with tables generated from their definitions. Its packets and 16-bit output equal the module's, run in a CPU emulator, on the seven clips of `tests/speex102/vectors` (147 of 147 frames) and on the tests' five runs; its cosine and arc cosine equal the module's on 21,389 and 22,155 arguments; and it gives Set M's gain-1 recording in 145,920 of 145,920 samples and the gain-10 one, after the app's gain, in 146,080 of 146,080 (the orchestrator's private run on this build, the gain run on the whole decoded stream; until W3-19 the app's whole render at `voice_maxgain 10` lined its gain blocks up 80 samples off the game's: see "The receiver gain's blocks" below). Only the engine's quality 3 is claimed. Its packets and decoded output are bit-identical to a native build of the same sources ([`tests/speex102/native.mjs`](speex102/native.mjs)). The profile runs it as the module does:

- **On 11025 Hz sound**, the engine's rate for this codec, with no resampling to 8000 Hz before or after it. `snd_bits` changes nothing: the module has one setting for the engine's argument.
- **16 bits in and out.** The float sound is rounded to 16 bits at the codec (to nearest, ties to even, clamped). The decoded samples are the module's: truncated, wrapping past full scale.
- **A new talk spurt resets the codec** (request 26 on the encoder and the decoder, as the game does), never a new codec. In 1.0.2 the decoder's reset is partial, so a new codec would sound different for the first frames of a spurt.
- **Delay and loss:** the pair's 80-sample delay (7.26 ms) is trimmed after the receiver's gain (since W3-19), so renders keep the source timeline. Loss and jitter act on 14.51 ms frames, and a lost frame plays as zeros: the decoder does not see it, because the module never decodes without bytes (read). So the next frame is decoded on a state one frame stale, and the sound after a loss is rougher for about half a second. Measured in W3-12b's review on a voiced signal at about -15 dBFS, after a single lost frame: 4.1 dB against the source over the next 8 frames, where a clean run gives 18.1 dB, and 8.2 dB over frames 8 to 40, against 17.3 dB; the difference from the clean decode is still -16 dB 40 frames (0.58 s) on. What the game's listener hears after a loss under this codec was not measured.
- **Frame log:** Speex frames have their own code (7), so the codec lane, the console and the live panel show them as Speex.

## vaudio_miles

**A codec of the engine family (selectable in the Source engines of 2006 and 2007, where the default was already
`vaudio_speex`); current TF2 ships it and refuses it.** As `voice_miles` it was also the codec of the engine before
Source. Current TF2 ships the module, Miles and the plug-in in its 32-bit folder and refuses the name ("Voice_Init
Failed: invalid voice codec vaudio_miles.", measured; its engine passes four codec names only, read), and so does the
32-bit engine of Source SDK Base 2013 (read). The app's `miles` profile runs it (W3-20b, "In the app" below). The module wraps a Miles Sound
System plug-in holding Voxware's MetaVoice VR12, a harmonic vocoder. Read from the owner's copy of the module and run,
with the owner's copy of the plug-in, in a CPU emulator on signals of our own (2026-11-11, W3-20a's inputs); the
engines of Source SDK Base 2006 and 2007 and their own wrappers and plug-in were read and run the same day (the
orchestrator's private investigation of the owner's older engine files; the facts below are as it gave them):

| | | |
|---|---|---|
| Codec rate | 8000 Hz nominal, mono, 16-bit in and out | measured |
| Engine rate | 11025 Hz: the 2006 and 2007 engines capture, code, decode and play voice at 11025 Hz, 16-bit mono, for every codec, and nothing resamples to the codec's 8000 Hz on either side | read |
| Frame | 360 samples, two VR12 frames of 180; the wrapper takes the plug-in's minimum block of 360 bytes as 360 samples. **32.65 ms** of real time at the engine's 11025 Hz (45 ms at the codec's nominal 8000 Hz) | read, measured |
| Packet | the wrapper writes 12 bytes a frame, two VR12 frames of 6 bytes, whole frames end to end with no header of its own; the engine puts a 16-bit count of bits in front of them, with no per-frame header | read, measured; the engine's count read |
| Bit rate | **2940 bit/s** on the wire at the engine's 11025 Hz (2133 bit/s at the codec's nominal 8000 Hz); the plug-in states 1244 | measured, and computed from the engine's rate |
| Band | the codec's nominal 4000 Hz band covers about 5512 Hz of real sound; pitch and speed come out right, because the same rate is used both ways | computed from the engine's rate |
| Before the codec | each sample cut to its top 8 bits: the wrapper keeps the high byte, the plug-in reads it back sign-extended and shifted left by 8 | read; the model built from it gives the module's packets |
| After the codec | nothing in the wrapper: the plug-in's 16-bit output is the wrapper's. The engine runs its receiver auto-gain on those samples in 128-sample blocks (defaults `voice_maxgain` 10, `voice_avggain` 0.5, `voice_scale` 1), then hands them to the mixer | read |
| Start | the encoder codes one block of 360 samples taken from stack memory nothing has written (in all three wrappers); the decoder is untouched | read; that the block's contents change frames 0 and 1 and a few later ones (up to frame 202 of 325) is measured |
| Reset | twice over, 360 zero samples encoded and their 12 bytes decoded; nothing cleared | read; equal to doing it by hand, measured |
| Loss | no path in the wrapper: given no data it copies 12 bytes from address 0 (the emulated run stops there); the plug-in's comfort-noise property is never asked for. The 2006 and 2007 engines never call Decompress without data, so a lost packet gets no decoder call at all | read, measured |
| Settings | the codec is always VR12 (the plug-in's other two are never asked for); the `quality` argument is never read; no rate or width is read or set | read |
| Selection | in the 2006 and 2007 engines `sv_voicecodec` defaults to `vaudio_speex`, and its value is loaded as a library by name, any name, with no list and no fall-back, so `vaudio_miles` was accepted; if loading fails, voice is disabled with a message | read |
| Call | a packet is the codec's output for one call: whole 12-byte frames end to end; samples that do not fill a frame stay in the codec object; one call takes at most 1024 samples | read, both engines |
| Frames per packet | how many a packet held in a running engine: two from a full call, three with left-overs, is a guess from the sizes | not known |
| Codec objects | the sender's encoder and each receive channel are separate codec objects, each with both halves; the receiver's reset decodes silence coded by its own object's encoder | read, both engines |
| Sender | every `+voicerecord` press resets the encoder's codec object (the wrapper's reset); a release sends one more packet with the final flag: a part frame padded with zeros, nothing kept | read, both engines |
| Receiver | a packet from a speaker with no channel gets one: its codec object reset, its buffer emptied, the gain reset to unity, playback after 0.2 s; a packet from a speaker with a channel is decoded at once, with no reset. A channel is freed when its buffer has run dry; there is no timer. So after a pause longer than what the receiver had buffered the next spurt starts from reset on both sides, the gain at unity; after a shorter one only the sender has been reset | read, both engines; that the buffer holds about the 0.2 s wait in practice is a guess |
| Receiver, in order | decode; the auto-gain on the decoder's samples (128-sample blocks); an interpolator at a step of exactly 1.0 that writes n − 1 samples for n decoded (TF2's rule of today, finding 24); the mixer, whose voice source is 11025 Hz | read, both engines; the interpolator also run: ten packets of 360 put 3,590 samples in its buffer |
| Gain | the old engines' gain routine gives the app's `receiverAutoGain` on every sample: 73,418,240 of 73,418,240 (20,485 blocks of 128 samples, seven settings, both engines, two settings of the processor's precision) | run |
| Mixer and output | the old engines' mixer after the voice source, and their output stage | not read |

- **The build** ([`vendor/voxware-vr12`](../vendor/voxware-vr12/README.md), W3-20a). The codec is a public C
  implementation ([coffeegrind123/voxware-vr12](https://github.com/coffeegrind123/voxware-vr12), MIT, commit
  `eedf465`) whose author reverse-engineered it from an older copy of the plug-in; it is vendored unchanged, with its
  tables (the codec's codebooks and windows as its author published them). The wrapper
  ([`tests/vr12/api.c`](vr12/api.c)) is ours, written from the reading above. The start-up block is zeros, a choice:
  the game's own first frames are not defined by its code.
- **Scores** of the WebAssembly build on the eight signals the plug-in and wrapper were run on (W3-20a's report has
  them per signal; `tests/vr12.verify.mjs` checks three of them):
  - through the wrapper, started with zeros and reset once in the middle: packets equal on **2,505 of 2,505 frames**,
    before and after the reset; decoding the game's packets gives its samples on **581,899 of 582,120**, the rest one
    step off (the seven signals whose sound was kept);
  - the plug-in alone, full 16-bit input: packets equal on **5,005 of 5,010** VR12 frames (three in the tones signal,
    two in a voice signal, 12 to 17 bits apart, the frames after equal again; none appears through the wrapper, where
    the input is 8-bit); decoding gives its samples on **581,800 of 582,120**, the rest one step off;
  - a native build of the same sources and math gives the same packets and samples bit for bit on all eight.
- **The older wrappers and plug-in** (measured, on the same eight signals). The wrappers of the 2006 and 2007 engines
  (built 2006-05-22 and 2008-07-11) with their plug-in (Miles 6.6a, 2004) give the vectors' packets and samples
  exactly: 2,505 of 2,505 frames, 901,800 of 901,800 samples. That plug-in equals TF2's (Miles 9.3a, 2012) on every
  codec frame (5,010 of 5,010) and every sample, at 53-bit and at 64-bit precision. So the committed vectors stand for
  the wrappers and plug-ins of 2006, 2008 and 2024 alike, and the vendored implementation scores against the old
  plug-in exactly as against TF2's.
- **Arithmetic.** The plug-in's arithmetic is x87 at whatever precision the caller set. At 53 bits (what the engine
  sets) and at 64 bits it gives the same packets and samples on every vector; at 24 bits it differs (measured). So
  double arithmetic suffices. On the four signals traced (1,892 codec frames), every one-step difference in decoding
  entered at the plug-in's inverse transform, with a smaller difference before it (measured); an exact decoder would
  reproduce the plug-in's two transforms operation for operation.
- **In the app** (W3-20b: the `miles` profile, `constants.js`; `opus-codec.mjs`, `vr12RoundTrip` and
  `createVr12Stream`). `vaudio_miles` is not a Team Fortress 2 codec: it is a codec of the Source engine family that
  could be selected in the Source engines of 2006 and 2007, and current TF2 ships its files and refuses the name. It
  has not been checked against any recording of a running engine. The profile is the codec stage of those engines set
  into the app's chain: the sender resamples to 11025 Hz as for `speex`; two codec objects, the sender's and the
  receiver's, each reset at the render's start (the key press and the channel's assignment), with a framer on each;
  each sample made 16 bits as for `speex` (to nearest, ties to even, clamped) and cut to 8 by the module; the receiver's
  auto-gain on the decoder's samples from the first one; the codec's delay dropped after the gain. Everything after the
  receiver's gain (the mixer, rooms, output) is TF2's of today. `snd_bits` does not change it. Its frames have their
  own code (8) in the frame log. No preset uses it, and it has no row in the accuracy tables. What is not the engines'
  own rule:
  - **the start-up block** is zeros (the owner's ruling, delegated, W3-20a); it changes a few packets near the start
    of some signals (frames 12 to 14 of the noise vector, five frames of the tones vector, three of a quiet voice
    near -40 dBFS, none of the tests' speech-like signal or of white noise);
  - **a new spurt resets both sides** (a stand-in). With no voice gate a render is one key press, as in the engines,
    and nothing is reset after its start. A new spurt exists only with the app's gate on or when the live key goes down
    again; there the sender's reset is the engines' rule, and the receiver's is right for a pause longer than what the
    receiver had buffered and wrong for a shorter one. What that is worth, measured on a second spurt (two voiced
    bursts, the gate on): decoded by a receiver that was not reset, the second spurt differs from the profile's by a
    difference 3.6 dB above the spurt's own level (the vocoder's waveform is not kept, so the two do not line up); by
    one shared codec object, by -52.1 dB;
  - **the gain is held** through time nothing was sent, as on every profile of the frame path; the engines reset it to
    unity when a channel is assigned (a stand-in);
  - **a lost or late frame** plays as 360 zeros in its own place and the receiver's codec is not called (a stand-in:
    the engines queue nothing for a lost packet, so the sound after it would close up while the buffer lasts, and a
    buffer run dry would free the channel). The loss and jitter models are TF2's fits, on 32.65 ms frames; `net_split`
    counts whole frames (20 one frame, 40 two);
  - **the interpolator's dropped sample** is not modelled, as for every profile; **the decoder** is within one step of
    the plug-in, not exact (W3-20a).

  Measured by `tests/miles.verify.mjs` (the module run on signals of our own; not measurements of any engine):
  - **The delay**, from the envelope (the codec is a vocoder): a steady voiced sound (harmonics 1/h below 5 kHz, -12
    dBFS RMS) switched on at 24 places in a frame, at pitches of 100, 140 and 190 Hz; the lag that best lines up the
    55-sample RMS envelopes of input and decoded sound has a median of 304.5 samples (quartiles 274.75 and 348, range
    200 to 411, less than a frame apart). The profile drops 305 samples (27.66 ms). The median moves with the grid
    by up to 15 samples (1.4 ms): pitches of 120, 160 and 220 Hz give 316, a level of -6 dBFS 319.5, a 110-sample
    envelope 311 (the review's runs). The lags fall in a sawtooth whose period is 180 samples, one VR12 frame inside
    the wrapper's 360: as the onset moves 15 samples on, the lag falls by 15 until it jumps back.
  - **The 8-bit cut.** Any input whose 16-bit samples all lie from -256 to 255 codes as its signs alone (0 and -256);
    digital silence stays digital silence. In the pauses of the tests' speech-like signal (-78.7 dBFS at 11025 Hz) the
    cut gives -45.6 dBFS, the decoder -57.1 and the gain -37.1; under `speex` the same pauses decode at -82.7 and reach
    -62.7. In its spurts (-20.0 dBFS) the decoder gives -22.6 (`speex`: -19.3). A steady voiced sound at 140 Hz
    decodes at -16.9 dBFS for 0 in (clipped at the capture), -13.3 for -12, -25.5 for -24, -41.2 for -36, -56.5 for
    -42, -61.4 for -48 and -63.9 for -60; below about -50 dBFS RMS (its peak under 256) only its signs are left.
- **What remains unknown:** how many frames a packet held in a running engine; the encoder's real start-up block
  (uninitialised memory in all three wrappers); what a listener heard at a lost packet, beyond that the decoder is not
  called; the old engines' mixer and output stage. Nothing of a running engine with this codec has been recorded.

## The receiver gain's blocks (W3-19)

The game's receiver gain works in blocks of 128 samples counted from the first sample the decoder gives. Until W3-19 the app dropped the codec's delay first (its `lookahead`: 64 samples for `celt_22`, 128 for `celt_44`, 80 for `speex`), so that the render lines up with its source, and ran the gain on what was left: its blocks fell 64 or 80 samples off the game's, and the first block missed the dropped samples. At `voice_maxgain 1` that changes nothing; at the default 10 it does. Against the game's own recordings, the app's whole render (`TF2Audio.process`, the gain's output) on the game's captured input gave `vaudio_celt` (Set H) in 45,123 of 158,548 samples that are not silence at `voice_maxgain 10` (158,384 of 158,385 at 1, at 64 samples' lag) and `vaudio_speex` (Set M) in 86,171 of 145,966 (145,840 of 145,840 at 1, at 80 samples' lag), while the decoder's whole stream through the app's gain equals the gain-10 recordings. Since W3-19 the three profiles run the gain on the decoder's stream from its first sample, the delay included, and drop the delay after the gain, in `process` and `createRender`, as the live chain already did (it never drops the delay; its output is the input that much later). The output keeps its length and alignment. Where the gate holds frames back, a block whose first sample is decoded sample m belongs to frame floor(m / frame size), with no shift. For `celt_44` the delay is one whole block, so its blocks already fell on the game's; only its first blocks change. A demo's received voice was already the decoder's own samples, and the Steam path is untouched. Since W3-19 (the orchestrator's private runs of the whole render, `TF2Audio.process` with the gain's output taken at `onGain`, on the game's own captured input, on the branch at b3fad6f): Set M, `speex`, `voice_maxgain 1` 145,840 of 145,840 samples at 80 samples' lag (as before) and `voice_maxgain 10` 145,966 of 145,966 (before W3-19: 86,171); Set H, `celt_22`, `voice_maxgain 1` 158,384 of 158,385 samples that are not silence at 64 samples' lag (as before; the one left is the known sample a step off) and `voice_maxgain 10` 158,384 of 158,548 (before: 45,123): the same one sample, and 163 samples in the recording's last packet, which the gain rule applied to the game's own gain-1 recording also misses (Set H's note). No recording of `vaudio_celt_high` at `voice_maxgain 10` exists, so `celt_44`'s first blocks rest on the same rule, not on a take.

## Also unknown, for all three

- **Voice gate.** Whether modern TF2's capture still goes through Steam's voice gate (−39.5 dBFS, 120 ms pre-roll, 440 ms hold) when a legacy codec is selected. The profiles transmit continuously. *Corrected 2026-11-12: those figures are Steam's gate as first measured, on Steam voice; Steam's gate has since been read as a rule on capture chunks (finding 28). Whether any gate applies to the engine codecs was not read; the profiles send everything unless `voice_vad 1`.*
- **Receiver path.** Whether the receiver auto-gain runs at the codec's rate (22.05 or 11.025 kHz), as the profiles assume. *Corrected by W3-05 and W3-19 (2026-11-10 and 11): settled for `vaudio_celt` and `vaudio_speex`; the gain runs on the decoder's own samples at the codec's rate (Sets H and M, findings 26 and 31; "The receiver gain's blocks" above).*
- **Does CELT work at all?** [Source-1-Games#5520](https://github.com/ValveSoftware/Source-1-Games/issues/5520) (February 2024, 64-bit test build) reports `vaudio_celt` garbled or silent. #7551 says CELT and CELT High work.

## Takes that would settle it

Set H settled the CELT codecs' settings and sound with a file as the microphone, which leaves out the capture and the receiver. For those, record exactly as for the 2026 Steam takes ([testsignal/README.md](testsignal/README.md)), on a local server:

1. `sv_voicecodec vaudio_celt`, then load a map. The codec is picked at map load.
2. `voice_loopback 1`.
3. Play `tf2_voice_testsignal_v1.wav` into the mic path and record the output.
4. Repeat with `sv_voicecodec vaudio_celt_high`.

The test signal's segments answer the open questions:
- the gate segments show whether Steam's gate still applies
- the sweeps show band edges and frame sizes
- the level steps show the receiver gain

## Done without takes

CELT 0.11 is built to WebAssembly by [`tests/celt011/build.mjs`](celt011/build.mjs), the same way `tests/libopus11/` builds libopus 1.1.5, with `OPUS_BUILD` as the game's module is, and both CELT profiles run it. Speex 1.0.2 is built the same way by [`tests/speex102/build.mjs`](speex102/build.mjs) and runs in the `speex` profile as the game's module runs it. Set M is a take of it: HL2DM's 32-bit game still loads `vaudio_speex`, and since W3-18 the build gives its decoded recording sample for sample (the orchestrator's private run; the whole render at `voice_maxgain 10` runs the gain on the game's blocks since W3-19).
