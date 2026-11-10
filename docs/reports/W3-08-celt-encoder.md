# W3-08: why the app's CELT does not give the game's samples

**Status: preliminary (the finding is in; the table of versions, the WebAssembly confirmation and the check script
follow in later commits).**

## The answer

The game's `vaudio_celt` module is the same CELT source the app bundles, **built with the pitch post-filter
compiled in**; the app's build has it compiled out. Nothing else in the codec differs. With that one build switch,
a native build of the pinned commit reproduces the game's decoded output:

| Recording | Mode | Samples compared | Identical | Largest difference |
| --- | --- | ---: | ---: | ---: |
| `celt_gain1.wav` (`vaudio_celt`) | `celt_mode_create(22050, 512)`, 64-byte packets | 292,352 (571 packets) | 292,351 | 1 LSB (one sample, packet 201) |
| `celthigh_gain1.wav` (`vaudio_celt_high`) | `celt_mode_create(44100, 1024)`, 128-byte packets, fed the 22050 Hz sound | 292,864 (286 packets) | 292,789 | 1 LSB (75 samples in packets 20, 88, 99, 100, 102) |

Two things were needed to see it:

1. **The build switch.** In the public source the pre-filter in the encoder and the comb post-filter in the decoder
   are inside `#ifdef ENABLE_POSTFILTER`, and `OPUS_BUILD` turns that on. The app's build defines neither.
2. **The file starts two samples in.** The engine's reader for `voice_inputfromfile` skips the first 4 bytes of
   the sound data (read from `engine.dll`, below), so the encoder's first frame starts at sample 2 of the file.
   That is the "2 samples early" the first comparison saw. It is a property of the file reader, not of the codec
   or the microphone path.
