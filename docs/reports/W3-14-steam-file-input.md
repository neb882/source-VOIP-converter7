# W3-14: Steam's voice path against a known input

An investigation, 2026-11-10. No app code changed. The owner's recording (Set J) is private: this report holds
numbers and reasoning only. **Status: first results, committed early; the full report follows on this branch.**

## Headline

- The continuous clip, 11.889 s of the game's decoded voice (524,288 samples at 44100 Hz): the app's chain gives
  **524,286 samples identical** under the `fma3` kernel. The other two differ by one step.
- Both come from **one** decoded 24 kHz sample that Steam's decoder puts one step higher (8010 for 8009). The
  app's float value there is one float step under the half. With that one sample changed, all 524,288 are equal
  under `fma3`; `avx` then differs in 59 samples, `sse` in 82, `c` in 108.
- So the encoder's packets, the 16-bit decode, the resampler, its first-packet flush and the `fma3` kernel are
  Steam's on this run.
- Settings: libopus 1.1.5, 24000 Hz, VOIP, 32000 bit/s, signal voice, DTX on, complexity 9 (8 and 10 give the same
  samples; 7 does not), frames cut from Steam's own chunk lengths, one message per chunk, each message resampled
  by itself.
- Steam's chunk lengths under file input are **not** the times between its reads. The reader keeps its last
  read time as a 32-bit float, which on this run moved in steps of 125 ms. The real read times can be recovered
  from the lengths exactly: they are 48 to 64 ms apart.
- The hold is measured on that same coarse clock. In this run a spurt ended at the first read where the clock
  had moved four steps (0.5 s) since the read of the last active chunk: 12 of 12 spurt ends.
