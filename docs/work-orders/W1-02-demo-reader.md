# W1-02: one demo reader; a talk spurt whose end marker was lost starts at its tick

> **Status 2026-11-12: built and merged** at `800059b` (pull request #3). Report: `docs/reports/W1-02-demo-reader.md`.

**Branch:** `claude/w1-02-demo-reader`, from `main`. **Worktree:** given in the brief. **Agent:** `tf-builder`, then
`tf-reviewer`. May push its branch to run CI. **Time budget:** 2 hours.

## Why

Two things, one cause. `tests/demovoice/` holds a Rust tool that was written first and treated as the reference:
`demo.js` was checked against it byte for byte (5148 records on the Set D demo). Since then `demo.js` is what users
run, CI never builds the Rust, and "must match the Rust tool" was used as a reason to leave a defect alone. That rule
is retired (`docs/PROGRESS.json`, `retired_rules`): there is one reader, `demo.js`.

The defect (the code review's finding 16): in `decode()`, a Steam talk spurt is placed at its demo tick only when
the decoder was reset by an end-of-transmission marker. Voice packets are unreliable, so the packet carrying a
marker can be lost. The next spurt is then decoded straight after the previous one, seconds early, with the old
decoder state, and everything up to the next marker is early with it. The legacy-codec branch already starts a new
spurt on a gap in ticks; the Steam branch does not.

*Amended 2026-11-09 after the builder stopped on a contradiction: the fixture's second speaker has packets with
consecutive sequence numbers arriving three seconds apart with no marker between them, which rule 1 as first written
would split, against "decodes exactly as before". Rules 1 and 2 below are the amended ones.*

## Files

May touch: `demo.js`, `tests/demo.verify.mjs`, `tests/demovoice/` (remove the Rust: `Cargo.toml`, `Cargo.lock`,
`src/`; replace `decode.mjs`; rewrite its README), `.gitignore` (the demovoice lines), `package.json` (a script for
the new tool, if useful), `README.md` and `tests/REFERENCE_2026.md` (only the sentences that mention the Rust tool or
`decode.mjs`), `tests/retiming.mjs` only if it depends on the old tool's output.

May not touch: `tests/demo/synthetic.dem` (the browser suite loads it; build new cases in the test instead),
`audio.js`, `app/`, `video.js`, `sw.js`, `docs/PROGRESS.json`.

## Spec

1. **A spurt that arrives late, on a broken sequence, starts at its tick.** In the Steam branch of `decode()`,
   for a packet that finds the decoder open:
   - **The sequence says what the packet is.** Take the forward distance from the expected number, 16-bit and
     wrap-aware. A packet that continues the run, or jumps forward by a number of frames that fits in the time since
     the previous packet's tick plus a slack, belongs to the run: the jump is concealed as lost frames and the packet
     is decoded back to back, as today, however late its tick is. Anything else (a number that goes backwards, or a
     jump too large for the time that passed) is a sequence break: nothing is concealed.
   - **On a sequence break, lateness decides.** If the packet's tick puts it more than a threshold after the write
     position, it starts a new talk spurt: the old decoder is freed, a fresh one made, the spurt placed at its tick
     and counted. If it is not that late, it is decoded in place with the open decoder, as today.
   - [Why the sequence and not the tick alone: a stream whose numbers continue has not restarted, so splitting it on
     its tick would change demos whose markers are all present (the fixture's second speaker, and any demo with a
     real loss longer than the threshold). Public Steam voice decoders restart the frame count at each end marker,
     so a spurt after a lost marker shows as a number going backwards. If Steam's numbers turn out to continue
     across spurts, a lost marker on its own is not caught by this rule; `docs/PROGRESS.json` carries that question.]
   - Choose the threshold and the slack from the data, and say how in a comment. SourceTV writes voice every few
     ticks, so a spurt's packets arrive in batches; a spurt's first packet carries the gate's 120 ms of pre-roll at
     once, so within a spurt the write position runs ahead of the ticks. The legacy branch uses four frames as its
     threshold. The slack must cover such a burst with room to spare.
   - A demo whose markers are all present and whose sequence numbers are unbroken must decode to exactly the samples
     it gives today. Prove it: the fixture's decode is byte-identical before and after for both speakers (compare a
     hash of the samples, the frame log and the frame bytes).
2. **Concealment is bounded** by the rule above: a jump the elapsed time cannot hold is a sequence break and
   conceals nothing, so a corrupt or wrapped number cannot insert minutes of concealment. Handle the 16-bit wrap in
   `decode()` as `speakers()` does: a frame lost exactly at the wrap is concealed.
3. **One tool.** Replace the Rust tool and `decode.mjs` with a Node script, `tests/demovoice/extract.mjs`, built on
   `demo.js` and the bundled codecs:
   `node tests/demovoice/extract.mjs <demo.dem> [--out <folder>]` prints the header and, per speaker, what the old
   summary printed (frames, talk spurts, DTX frames, frames lost before the server, the bitrate while coding, the
   TOC configurations), and writes per speaker a 16-bit WAV at the codec's rate with each spurt at its tick and a
   TSV of the packets (tick, kind, sequence number, bytes) and of the frame log. Outputs stay out of the
   repository (`.gitignore`).
   - Speaker ids are SteamIDs: the tool prints them because the owner runs it on their own demos, but no real id
     goes in the repository, a test or the report.
4. **Wording.** `demo.js`'s header and `tests/demo.verify.mjs` stop naming the Rust tool as the reference. The
   record that the two agreed on the Set D demo stays, in the past tense, in the demovoice README.

## Done means

- `node tests/demo.verify.mjs` passes with new checks for: a spurt after a lost end marker, its numbers starting
  again, sits at its tick (and the decoder was restarted: the spurt count says so); the same spurt arriving within
  the threshold is decoded in place; a run whose numbers continue is not split however late its packets are; a real
  loss longer than the threshold, with the numbers jumping by as much, is concealed and not split; a jump far
  larger than the time that passed conceals nothing; a frame lost at the 16-bit wrap is concealed. Each new check
  fails on the code before the change, or on a break of the new rule (say how you verified).
- The fixture's decoded samples and frame logs are byte-identical before and after, shown by hash in the report.
- `node tests/demovoice/extract.mjs tests/demo/synthetic.dem --out <scratch>` runs and its summary matches what
  `tests/demo.verify.mjs` asserts about that demo (frames, spurts, DTX, lost).
- `pnpm test` passes; the browser suite passes; CI passes on the pushed branch.
- No file in the repository still tells a reader to install Rust.
