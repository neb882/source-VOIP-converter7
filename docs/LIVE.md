# The live monitor

**🎧 Live** (step 1 of the page) plays your microphone through the voice chain in real time, with the settings on
the page. Use headphones: speakers feed the output back into the microphone. This page is for someone using the
monitor and for someone asking whether it sounds the same as a render. What each stage does to the sound is in
[VOICE-PATH.md](VOICE-PATH.md).

## Is the live monitor the same as a render?

That depends on the codec. The tests settle it, and [tests/README.md](../tests/README.md) names the suites.

| Codec | What the tests show |
| --- | --- |
| Steam voice (`steam`) | Yes. The live chain runs a render's own stages, fed as the microphone's blocks arrive. Given the same sound it gives the render's samples, one for one, where the voice enters the mix, at 24 and 48 kHz, also with packet loss, late frames given by the suite's own mask, the gate off and push-to-talk (`tests/steam.verify.js`, section 10b); and at the output at 48 and 44.1 kHz with the default settings (`tests/output-stage.verify.mjs`, section 14). With the switch **Live monitor: the game's voice queue** on, the monitor plays its packets through the game's voice queue with BC-4's arrival times, and gives the samples of a render on the queue with the same settings, jitter included, where the voice enters the mix, at 66.67, 100 and 300 frames a second (`tests/render-channel.verify.mjs`, section 10). With the switch off jitter does nothing in the monitor on Steam voice: the monitor keeps the file's own timing, and on Steam voice jitter moves when packets reach the queue (BC-4a). |
| `vaudio_speex` | Close, not proven equal. The live output follows a render's in waveform and in level: a correlation above 0.9 and levels within 0.5 dB. With loss it loses the frames the render loses (`tests/speex102.verify.mjs`). |
| `vaudio_celt`, `vaudio_celt_high` | Not compared as a whole. The gate, the gain (with the codec bypassed) and the codec's restart at each talk spurt are each checked in the live chain. No test sets a whole live session beside a render. |
| Fullband Opus (`steam_48`, not in TF2) | Close, not proven equal: a correlation above 0.9 and levels within 0.5 dB (`tests/verify.js`). |
| `vaudio_miles` (not in TF2) | The live chain's packets, and its sound after the gain, equal bit for bit a reference the test builds with the same codec from the same frames. With loss it loses the render's frames. Its sound is not compared with a render (`tests/miles.verify.mjs`, section 10). |

A live session in the browser starts in mid-stream, so it cannot be compared with a render sample for sample.
The browser suite's check of a recorded session against a render is a smoke test only: within 2 samples and a
correlation above 0.79 at 44.1 kHz for `steam`. That render is made on the file's own timing, as the monitor's is
with its queue's switch off. A session on the queue is not compared with a render in the browser; section 10 of
`tests/render-channel.verify.mjs` holds the chain to the render.

Two things differ from the game:
- The voice channel (the receiver's queue) runs in the live chain only with its own switch, **Live monitor: the
  game's voice queue**, which is off on every load. With it off the monitor keeps the file's own timing whatever
  **Phrase timing** says, so no phrase starts early, as some do in the game. With it on, on Steam voice with the
  codec on, the monitor runs the queue at the page's frame rate (`fps_max`) and `voice_buffer_ms`, whatever Phrase
  timing says: Phrase timing decides the render, the switch the monitor. On the other codecs, and with the codec
  skipped, the switch does nothing.
- Push-to-talk is the app's stand-in for the key. Steam's own key rules are not built yet, and what TF2's
  open-microphone mode (`voice_vox`) does was not read.

A recorded session is the monitor's sound, on the timing the monitor ran: the file's own, or with the switch on the
game's voice queue at the chain's frame rate and `voice_buffer_ms`. Where Phrase timing says the other, the take is
marked as made with other settings, its line says which way it was made, and it does not render by itself;
**Render** gives it on the page's timing. A take on the queue has the queue's console line (the wait, the phrases
that opened the channel and those that joined it, the sound dropped to overflow, all counted over the recording)
and the line beside **Hear**. It has no jitter line, since the chain counts the packets' arrivals over its whole
run. If a settings change rebuilds the chain during a recording, the take's counts are those of every chain on the
queue in it, and its frame rate and `voice_buffer_ms` are the last chain's.

## Latency

On `steam` the monitor takes about 0.3 s from microphone to speaker. The chain itself holds back about 207 ms
(206.9 ms at 44.1 and 48 kHz, by the browser suite's note). Most of that is how Steam sends: the 100 ms before a phrase
go with it (the pre-roll, read), and a chunk of the microphone goes out only once it has been read, so the chain
waits for the longest chunk, 93.75 ms on the owner's PC (measured; finding 28 of
[tests/REFERENCE_2026.md](../tests/REFERENCE_2026.md)). The rest is the capture filter, the codec's lookahead and the resamplers.
Around the chain come half a 20 ms capture block, a 40 ms playback buffer and the sound device's own buffers.
The panel shows the total while it runs.

With the queue's switch on, the chain holds back the queue's zero in place of Steam's longest chunk, the pre-roll
and the codec's lookahead. That is a fixed figure for a frame rate and a `voice_buffer_ms`:

| Frame rate (`fps_max`) | More than with the switch off | The chain's hold at a 48 kHz device | The panel at 48 kHz | Standing |
| ---: | ---: | ---: | ---: | --- |
| 66.67 | 101.6 ms | 308.5 ms | about 405 ms | read; the panel measured at `fps_max` 67, which waits the same 7 ticks |
| 100 | 148.0 ms | 354.9 ms | not measured | read |
| 300 (the default) | 357.0 ms | 563.9 ms | about 660 ms | read; the panel measured |

The figures at `voice_buffer_ms` 100 are read from the voice queue's zero (`voice-channel.js`, `zero()`) and the
sender's read reach and lookahead; the switch's help gives the figure at the page's own frame rate and buffer. With
the switch off the panel showed about 293 ms at 48 kHz (measured: the median of 40 readings over 20 s in the
headless browser, the test's noise as the microphone, no dropout in either setting). With jitter each phrase comes
later again by the time its first packet took, which the figure does not count: in the mean 96 ms at 66.67 frames
a second and jitter 50, 209 ms at jitter 100, 59 and 128 ms at 300 (measured on a prototype of the chain and on the
engine's model, [W3-02c3-replan.md](reports/W3-02c3-replan.md)).

On the other codecs the chain holds back its codec's delay and filters. Where the voice gate is on (by default on
`steam_48`, not in TF2, only) it also holds back the gate's 120 ms pre-roll.

A room or the water adds up to 11.6 ms (the mixer's 512-sample block), and the panel's figure includes it. Once a
room has faded to none and the water is off, the chain holds nothing back for it again.

## Low latency, and what it cuts

**Live monitor: low latency** is among the extras, the controls that are not in the game.
- On `steam` it holds back Steam's longest chunk and one frame, in place of the chunk and the pre-roll. That saves
  about 80 ms; the panel gives the exact figure. The sender runs as before, but part of each phrase's first 100 ms
  is not played: 17 to 80 ms of it, about half as a rule. TF2 plays all of it.
- On the other codecs it drops the gate's 120 ms pre-roll where the gate is on, so the gate opens on the loud frame
  itself and the start of each word is cut. Where the gate is off it changes nothing.
- While the queue's switch is on, on Steam voice with the codec on, low latency is disabled and sent as off: it
  shortens Steam's reach, which the queue does not use.

## The game's voice queue in the monitor

**Live monitor: the game's voice queue** is among the extras. It is off on every load, kept on the page only (in no
remembered setting and no share link) and has no console name. With it on, on Steam voice with the codec on, the
monitor plays each phrase as the game's queue does: a new phrase waits, a phrase after a short pause can start
early, and jitter delays and bunches whole messages as in a render on the queue. What a listener hears, measured on
the engine's model and in no recording (W3-02c-3a's second read):
- At 300 frames a second and above each opening of the channel drops 114 to 181 ms, most of it Steam's 100 ms
  pre-roll, and the pauses between phrases are shortened by up to 328 ms.
- At 66.67 frames a second nothing is dropped, and each phrase waits as the game's does.
- Long unbroken sound dips about 4.5 dB from minute 5 or 6 at 66.67 frames a second and from minute 15 or 16 at
  300, until a pause closes the channel. The monitor has no ten-minute limit, so a session can reach it.

The panel's frame counts, and a take's codec lane, stay the sender's frames on the file's own timing. On the queue
they are off the sound by each phrase's offset, from 0.33 s early to 0.08 s late at jitter 0, and under heavy loss
the counts can stall, by up to 2.4 s at 100% loss with the gate on (both measured on the model).

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
  200 ms, and going under water switches at once, as in the game; neither restarts the chain. Phrase timing, the
  frame rate and `voice_buffer_ms` change nothing in the monitor with the queue's switch off; with it on, a change
  of the frame rate or of `voice_buffer_ms` builds a new chain. Any other change builds a new chain: on `steam` its
  sender starts silent, and its decoder, resampler and gain start afresh. Steam has no such restart; it is the app's
  own.
- **The panel** shows whether the chain is sending (TX, gate closed, or push-to-talk), the codec mode of the frames
  sent, the bitrate, the frames lost (on `steam`, the frames the decoder concealed) and late, the latency with any
  dropouts, and the input and output peaks. On the queue the latency's title names the queue's wait. A screen reader hears the two peak bars as meters in dBFS.
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
chain held back when it stopped (about 0.2 s on `steam`, 0.31 to 0.56 s on its queue from 66.67 to 300 frames a
second, read); that part was never played. A recording under 0.2 s is not kept. How a take on the queue is keyed
and marked is under "Is the live monitor the same as a render?".

## When there is no microphone

If the browser refuses the page the microphone, Live and Record say so and how to allow it (the icon in the address
bar). If there is none, they say to plug one in or choose it in the system's sound settings. Other errors give the
browser's own message. The monitor needs HTTPS (or localhost) and a browser with AudioWorklet; without them it says
so.
