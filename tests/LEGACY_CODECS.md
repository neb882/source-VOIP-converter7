# Legacy voice codecs: what is known

Source's older engine codecs are `sv_voicecodec vaudio_celt`, `vaudio_celt_high` and `vaudio_speex`. The `celt_22` and `celt_44` profiles run the real codec, CELT 0.11 ([`vendor/celt-0.11`](../vendor/celt-0.11/README.md)), at the settings below. The `speex` profile runs the real Speex 1.2.1 ([`vendor/speex`](../vendor/speex/README.md)) at assumed settings. None of the three has been measured against a TF2 recording, and their receiver side (gate, auto-gain rate) is assumed. This file collects what public sources say about the real codecs.

Leaked engine source was deliberately not used. Valve's public Source SDK 2013 has no voice-codec code: the codecs live in the engine's `vaudio_*` libraries.

## Summary

| `sv_voicecodec` | Real codec (public evidence) | App profile | Evidence |
|---|---|---|---|
| `vaudio_celt` | **CELT 0.11** custom mode, mono. **22050 Hz**, **512-sample frames** (23.2 ms), **64-byte constant-size packets** = 22.05 kbps. Encoder complexity 10. | `celt_22`: CELT 0.11 with exactly these settings; decoded voice at 22.05 kHz | Strong: three independent decoders and two encoders agree |
| `vaudio_celt_high` | CELT 0.11, **44100 Hz**, **256-sample frames** (5.8 ms), **120-byte packets** = 165.4 kbps | `celt_44`: CELT 0.11 with these settings | Weak: one reimplementation. The "44 kbps" on Valve's wiki does not match it and may mean 44 kHz. |
| `vaudio_speex` | Speex, 8 kHz narrowband per one reimplementation. Source's quality setting is not public. | `speex`: Speex 1.2.1 narrowband, quality 4 (8 kbps, 20-byte packets), constant bitrate, no VAD or DTX: assumed settings; decoded voice at 11.025 kHz | Weak. It currently fails to load in TF2 ([Source-1-Games#7551](https://github.com/ValveSoftware/source-1-games/issues/7551)), so it cannot be recorded today. |

## vaudio_celt

- **Decoders.** Three tools decode real CS:GO demo voice with a plain CELT 0.11 decoder: `celt_mode_create(22050, 512)`, `celt_decoder_create_custom(mode, 1)`, reading 64 bytes per frame.
  - [ericek111's gist](https://gist.github.com/ericek111/abe5829f6e52e4b25b3b97a0efd0b22b)
  - [FrozenFish259/csgo_demo_voicedata_decoder](https://github.com/FrozenFish259/csgo_demo_voicedata_decoder), which builds against [celt-0.11.0](https://github.com/mumble-voip/celt-0.11.0)
  - [saiko-tech/csgo-demo-voice-capture-example](https://github.com/saiko-tech/csgo-demo-voice-capture-example), which plays the result as 22050 Hz, 16-bit mono
- **Encoders.** Two SourceMod extensions that inject voice encode the same way: `celt_encoder_create_custom`, `CELT_SET_COMPLEXITY(10)`, `celt_encode(…, 512 samples, …, 64 bytes)`.
  - [arthurdead/voicesend](https://github.com/arthurdead/voicesend/blob/master/voicecodec_celt.cpp)
  - [Dolly132/sm-ext-voice](https://github.com/Dolly132/sm-ext-voice). It notes: "2009 Games with 22050 samplerate and 512 frames per packet -> 23.22ms per packet". TF2 was on the Source 2009 branch.
- **Rate control.** A fixed packet size of 64 bytes makes CELT constant-rate, whatever the `CELT_SET_BITRATE` ceiling (64 kbps in both encoders).

**In the app.** Until this release the profile ran Opus's CELT layer, which is not the same codec: Opus changed the bitstream and the psychoacoustics after 0.11. It now runs CELT 0.11 itself, built from the tree the CS:GO decoders use, with 512-sample frames and 64-byte packets. Loss and jitter act on 23.2 ms frames. The codec's delay (64 samples, its MDCT overlap) is trimmed, so renders keep the source timeline.

## vaudio_celt_high

- The only concrete source is [voicesend](https://github.com/arthurdead/voicesend/blob/master/voicecodec_celt.cpp): 44100 Hz, 256 samples, 120 bytes.
- That is 165 kbps with 5.8 ms frames, nearly transparent for voice.
- Community descriptions call it "44 kHz and 44 kbps"; 44 kbps would be 32 bytes per 256-sample frame. Only a take can settle it.

## vaudio_speex

- Speex is BSD-licensed ([xiph/speex](https://github.com/xiph/speex)).
- **Settings.** voicesend's table lists 8000 Hz for `vaudio_speex`. Source's Speex quality setting is not in any public source found. GoldSrc's `sv_voicequality` levels 1–5 were 2.4, 6.0, 8.0, 11.2 and 15.2 kbps, which are close to Speex narrowband qualities 1, 2, 3/4, 5/6 and 7/8.
- **Current TF2.** `vaudio_speex` fails to load: "Unable to load voice codec 'vaudio_speex'. Voice disabled." ([#7551](https://github.com/ValveSoftware/source-1-games/issues/7551), also [Portal 2 #226](https://github.com/ValveSoftware/portal2/issues/226)).
- **Release.** Speex's bitstream has not changed since 1.0, so any Speex decoder reads any encoder's packets. Which release Source's encoder was built from is not known; encoders of different releases may choose different bits for the same audio.

**In the app.** Until this release the profile ran Opus SILK at 8 kHz and 8 kbps as a stand-in. It now runs Speex 1.2.1 itself, built to WebAssembly by [`tests/speex/build.mjs`](speex/build.mjs) from the Xiph release tag. Its packets and decoded output are bit-identical to a native build of the same sources ([`tests/speex/native.mjs`](speex/native.mjs)). These settings are assumptions, not findings:

- **Quality 4, the 8 kbps narrowband mode:** 160-bit frames, so 20-byte packets every 20 ms. It keeps the bitrate the stand-in had, and it is GoldSrc's middle voice quality (level 3, 8.0 kbps). `snd_bits` scales the bitrate, and the profile codes at the quality whose bitrate is nearest. Of qualities that share a mode (3 and 4, 5 and 6, 7 and 8), the higher number is reported.
- **Constant bitrate, no VAD, no DTX, the library's default complexity (2).** The decoder keeps its default perceptual enhancement.
- **Delay and loss:** the pair's delay (80 samples: 40 in the encoder, 40 in the decoder) is trimmed, so renders keep the source timeline. Speex's own high-pass filters still turn the phase of low frequencies: a voice-band signal with its pitch near 180 Hz comes out 2 samples early at 48 kHz, and 2 kHz pulses half a sample early. Loss and jitter act on 20 ms frames, and Speex's own concealment fills lost ones.
- **Frame log:** the codec lane has no Speex code, so Speex frames show as CELT.

Next to the stand-in, at the default settings in a 48 kHz render:

- **Band edge.** On white noise, relative to 0.5–2 kHz, Speex is down 3 dB at 3.6 kHz and 20 dB at 4.2 kHz. The stand-in sagged 2.6–3.3 dB from 2.5 to 3.5 kHz and was down 3 dB at 3.1 kHz; its 20 dB point was also 4.2 kHz. Neither passes anything from 4.5 to 6 kHz (−63 dB of the total).
- **Low end.** On the same noise, Speex is down 4.7 dB at 100 Hz and 1.6 dB at 200 Hz, where its high-pass filters act. The stand-in was flat there (+0.6 and +1.2 dB).
- **Level.** For the tests' speech-like signal at −20 dBFS, the render is −13.9 dBFS with Speex and −14.0 dBFS with the stand-in, and −21.1 against −21.6 dBFS without the receiver's auto-gain. For a voice-band signal at −21.2 dBFS without auto-gain, Speex keeps −21.4 dBFS and the stand-in kept −23.1 dBFS.
- **Spectrum.** On that voice-band signal, Speex is 1.7–2.0 dB louder than the stand-in from 250 Hz to 2 kHz, 1.1 dB at 2–3 kHz and level at 3–3.4 kHz. Speex also adds noise just under its band edge, 3.4 dB more than the stand-in at 3.4–3.8 kHz. In 50 Hz bands from 0.1 to 3.8 kHz the two differ by 3.0 dB RMS.
- **Waveform.** Both follow a voice-band source about equally: r 0.89 for Speex and 0.92 for the stand-in. The tests' speech-like signal is different: its strongest part is a 115 Hz fundamental, whose phase Speex's high-pass filters turn. Through Speex its waveform matches the source less well (r 0.22, against 0.66 through the stand-in), though the two spectra are within 1 dB of each other below 2.5 kHz.

## Also unknown, for all three

- **Voice gate.** Whether modern TF2's capture still goes through Steam's voice gate (−39.5 dBFS, 120 ms pre-roll, 440 ms hold) when a legacy codec is selected. The profiles transmit continuously.
- **Receiver path.** Whether the receiver auto-gain runs at the codec's rate (22.05 or 11.025 kHz), as the profiles assume.
- **Does CELT work at all?** [Source-1-Games#5520](https://github.com/ValveSoftware/Source-1-Games/issues/5520) (February 2024, 64-bit test build) reports `vaudio_celt` garbled or silent. #7551 says CELT and CELT High work.

## Takes that would settle it

Record exactly as for the 2026 Steam takes ([testsignal/README.md](testsignal/README.md)), on a local server:

1. `sv_voicecodec vaudio_celt`, then load a map. The codec is picked at map load.
2. `voice_loopback 1`.
3. Play `tf2_voice_testsignal_v1.wav` into the mic path and record the output.
4. Repeat with `sv_voicecodec vaudio_celt_high`.

The test signal's segments answer the open questions:
- the gate segments show whether Steam's gate still applies
- the sweeps show band edges and frame sizes
- the level steps show the receiver gain

## Done without takes

CELT 0.11 is built to WebAssembly by [`tests/celt011/build.mjs`](celt011/build.mjs), the same way `tests/libopus11/` builds libopus 1.1.5, and both CELT profiles run it. `vaudio_celt_high` uses the one public source's 120-byte packets until a take confirms or corrects them. Speex 1.2.1 is built the same way by [`tests/speex/build.mjs`](speex/build.mjs) and runs in the `speex` profile at quality 4 until a public source or a take settles Source's setting. A take needs `vaudio_speex` to load again.
