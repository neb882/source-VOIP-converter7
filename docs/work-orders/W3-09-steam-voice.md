# W3-09: Steam's side of voice, from public files and public writing

> **Status 2026-11-12: done (investigation)** at `a5f8ba2`. Report: `docs/reports/W3-09-steam-voice.md`.

**Branch:** `claude/w3-09-steam-voice`, from `main`. **Worktree:** given in the brief. **Agent:** an investigator on
the stronger model. It researches, downloads public files, reads them and writes; it changes no app code.
**Time budget:** 4 hours.

## Why

W3-03 showed that the game does almost nothing on the sending side: once a tick it asks Steam for voice and sends
what it gets. Steam does the capture, the voice gate, the encoding and the packet batches, and on the receiving
side the decoding and the resampling to 44.1 kHz. Those are the parts of the modern preset the app still infers
from recordings (tests/REFERENCE_2026.md, findings 2, 5, 11 to 14, 16), and they are the weak part of the receiver
plan: the app has to make up the sender's packets, and Steam's pauses on speech come out about 50 ms longer than
its gate model gives (docs/reports/W3-02-plan.md, docs/reports/W3-01-phrase-timing.md).

The owner has asked for online research and reverse engineering without limit of effort, within the project's rule
on sources: public documentation and writing, open-source code, and files that Valve itself distributes to the
public or that the owner has on their own machine. No leaked source, and no searching for it.

## Part 1: what is already public (do this first; it is cheap)

Search for and read: Steamworks documentation of the voice calls; open-source code that speaks Steam's voice format
(decoders and server-side tools written against the wire format, which say what the payload's fields are, what the
silence records and other record types are, and what sample rates and frame sizes occur); public analyses of
Steam's voice (codec, bitrate, the transmission threshold setting, the hold after key release); the Valve Developer
Wiki on the engine's voice variables; and anything public on the old engine codecs' settings (Speex quality and
sample rate, CELT). For each claim give the URL and say how far it is to be trusted. Say which of the project's
findings each source confirms, contradicts or extends.

## Part 2: Valve's public files

- **SteamCMD** and the Steam client's packages are served from Valve's public download servers without a login (the
  installer and its manifest are reachable from this machine). Fetch the Linux and Windows client libraries that
  hold the voice code. Linux builds often keep more names than Windows ones: look there first.
- **The dedicated servers** of the Source SDK Base 2013 and of the older games are public through SteamCMD's
  anonymous login, and may still ship `vaudio_speex` and older `vaudio_celt` builds. Try it; if the content servers
  are not reachable from this machine, say exactly which host was refused and stop there (the orchestrator decides
  whether to ask for it).
- Read, in order of value: (1) the capture and gate: the transmission threshold's levels (the owner's Steam shows
  Off, Medium and High, set to Medium; the takes give -39.5 dBFS), what it measures and over what window, the
  pre-roll (the takes: 115 to 152 ms; the log: a spurt opens with 160 ms), the hold after the level falls (425 to
  485 ms), what key-up does; (2) the batches: how many 20 ms frames go into one packet and when (the log: mostly
  60 ms, also 20, 40 and 80, 160 at the start), the silence record's lengths (62.5 and 31 ms) and the empty packet
  that opens a channel; (3) the encoder's settings (the takes say libopus 1.1.x, 24 kHz, hybrid, VBR, DTX, about
  32 kbps: every setting the code passes, and any high-pass or pre-processing before the encoder, including the
  capture resampler and whether Steam's noise suppression, echo cancellation or automatic gain touch game voice);
  (4) the decoder side: the resampler from 24 kHz to the rate the game asks for, and anything applied to decoded
  sound; (5) for `vaudio_speex` if found: the quality, sample rate, frame and packet sizes, and enhancement.

## How claims are made

As W3-03: each claim cites the file (name, where it was downloaded from, SHA-256), the address and the constant or
instruction bytes; marked as read, shown by a recording or log, or inferred, with a confidence. Behaviour in your
own words; no listings, no decompiled code, no part of any binary in any repository. Where the code and a measured
finding disagree, say so. Never execute a downloaded Windows binary; SteamCMD itself may be run, in scratch only.

## Files

May touch: `docs/reports/W3-09-steam-voice.md` only.

## Done means

The report gives Part 1's sources with what each establishes; for Part 2, what was fetched and from where, and for
each question the rule read or why it could not be; it ends with (a) the sender model the app should run, as
pseudo-code with its constants, set beside the packet statistics of the owner's logs, (b) the corrections to the
findings and to the receiver plan's sender model, and (c) what remains unknown and the cheapest way to learn each.
