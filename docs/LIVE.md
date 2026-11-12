# The live monitor

**🎧 Live** (step 1 of the page) plays your microphone through the voice chain in real time, with the settings on
the page. Use headphones: speakers feed the output back into the microphone. This page is for someone using the
monitor and for someone asking whether it sounds the same as a render. What each stage does to the sound is in
[VOICE-PATH.md](VOICE-PATH.md).

## Is the live monitor the same as a render?

That depends on the codec. The tests settle it, and [tests/README.md](../tests/README.md) names the suites.

| Codec | What the tests show |
| --- | --- |
| Steam voice (`steam`) | Yes. The live chain runs a render's own stages, fed as the microphone's blocks arrive. Given the same sound it gives the render's samples, one for one, where the voice enters the mix and at the output, at 48000 and at 44100 Hz. This is checked with packet loss, with jitter, with the gate off and with push-to-talk (`tests/verify.js`, section 10b; `tests/output-stage.verify.mjs`, section 14). |
| `vaudio_speex` | Close, not proven equal. The live output follows a render's in waveform and in level: a correlation above 0.9 and levels within 0.5 dB. With loss it loses the frames the render loses (`tests/speex102.verify.mjs`). |
| `vaudio_celt`, `vaudio_celt_high` | Not compared as a whole. The gate, the gain and the codec's restart at each talk spurt are each checked in the live chain. No test sets a whole live session beside a render. |
| Fullband Opus (`steam_48`, not in TF2) | Close, not proven equal: a correlation above 0.9 and levels within 0.5 dB (`tests/verify.js`). |
| `vaudio_miles` (not in TF2) | The live chain's packets, and its sound after the gain, equal bit for bit a reference the test builds with the same codec from the same frames. With loss it loses the render's frames. Its sound is not compared with a render (`tests/miles.verify.mjs`, section 10). |

A live session in the browser starts in mid-stream, so it cannot be compared with a render sample for sample.
The browser suite's check of a recorded session against a render is a smoke test only: within 2 samples and a
correlation above 0.79 at 44.1 kHz for `steam`.

Two things differ from the game on every codec:
- There is no voice channel (the receiver's queue) in the live chain: not built yet. So no phrase starts early,
  as some do in the game.
- Push-to-talk is the app's stand-in for the key. Steam's own key rules are not built yet, and what TF2's
  open-microphone mode (`voice_vox`) does was not read.

## Latency

On `steam` the monitor takes about 0.3 s from microphone to speaker. The chain itself holds back about 207 ms
(206.9 ms at 44.1 and 48 kHz, by the browser suite's note). Most of that is how Steam sends: the 100 ms before a phrase
go with it (the pre-roll, read), and a chunk of the microphone goes out only once it has been read, so the chain
waits for the longest chunk, 93.75 ms on the owner's PC (measured; finding 28 of
[tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md)). The rest is the capture filter, the codec's lookahead and the resamplers.
Around the chain come half a 20 ms capture block, a 40 ms playback buffer and the sound device's own buffers.
The panel shows the total while it runs.

On the other codecs the chain holds back its codec's delay and filters. Where the voice gate is on (by default on
`steam_48` only) it also holds back the gate's 120 ms pre-roll.

A room or the water adds up to 11.6 ms (the mixer's 512-sample block), and the panel's figure includes it. Once a
room has faded to none and the water is off, the chain holds nothing back for it again.

## Low latency, and what it cuts

**Live monitor: low latency** is among the extras, the controls that are not in the game.
- On `steam` it holds back Steam's longest chunk and one frame, in place of the chunk and the pre-roll. That saves
  about 80 ms; the panel gives the exact figure. The sender runs as before, but part of each phrase's first 100 ms
  is not played: 17 to 80 ms of it, about half as a rule. TF2 plays all of it.
- On the other codecs it drops the gate's 120 ms pre-roll where the gate is on, so the gate opens on the loud frame
  itself and the start of each word is cut. Where the gate is off it changes nothing.

## Push-to-talk

With **Push-to-talk** ticked, the chain sends only while **V** (TF2's `+voicerecord` key) or the **Hold to talk**
button is held. V does nothing while a text field or a menu has the focus. With push-to-talk off, the key counts as
held throughout.
- On `steam` the microphone is silenced while the key is up, and the voice gate ends the phrase by its own hold, so
  nothing captured while the key is up is sent. The key and the sound reach the chain separately, so a press or a
  release can land about one 20 ms block early or late. Steam goes on sending for half a second after a release;
  that rule is not built yet.
- On the other codecs only frames captured while the key is held are sent, and the gate still applies inside them.

## While it runs

- **Settings.** The monitor reads the page's settings every 0.3 s. A change of room cross-fades over the game's
  200 ms, and going under water switches at once, as in the game; neither restarts the chain. Any other change
  builds a new chain: on `steam` its sender starts silent, and its decoder, resampler and gain start afresh. Steam
  has no such restart; it is the app's own.
- **The panel** shows whether the chain is sending (TX, gate closed, or push-to-talk), the codec mode of the frames
  sent, the bitrate, the frames lost (on `steam`, the frames the decoder concealed) and late, the latency with any
  dropouts, and the input and output peaks. A screen reader hears the two peak bars as meters in dBFS.
- **The sound device.** The listener's sound device on the page is not used live. The chain runs at the rate the
  browser's audio runs at: above 44.1 kHz it converts as the listener's PC does, at 44.1 kHz it converts nothing.
- **Output device.** Pick a virtual audio cable to use the voice in other apps, such as a voice chat or a stream.
  Where the browser cannot choose an output for web audio, the menu is disabled and it plays on the default output.
- **Microphone.** The browser's echo cancellation, noise suppression and gain control are turned off, so the chain
  gets the raw microphone, as the game's capture does. Changing the microphone restarts the monitor.

## Recording a session

**Record this session** keeps the microphone and the chain's output, lined up to the sample, and loads them into
the page when you stop: the microphone as the source, the voice as its render. **Hear**, the views, the meter and
every download then work on it, and a changed setting (or **Render**) renders the microphone again with the new
settings. A recording stops by itself just short of 10 minutes. The voice ends short of the microphone by what the
chain held back when it stopped (about 0.2 s on `steam`); that part was never played. A recording under 0.2 s is
not kept.

## When there is no microphone

If the browser refuses the page the microphone, Live and Record say so and how to allow it (the icon in the address
bar). If there is none, they say to plug one in or choose it in the system's sound settings. Other errors give the
browser's own message. The monitor needs HTTPS (or localhost) and a browser with AudioWorklet; without them it says
so.
