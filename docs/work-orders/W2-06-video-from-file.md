# W2-06: a video source keeps its file, not a copy of its bytes

**Branch:** `claude/w2-06-video-from-file`, from `main` **after W2-03 has merged** (it edits `app/source.js`).
**Worktree:** given in the brief. **Agent:** `tf-builder`, then `tf-reviewer`. May push its branch to run CI.
**Time budget:** 4 hours. May run beside W2-04 and W2-05.

## Why

Reasoned from the code: loading an MP4 or MOV reads the whole file (`f.arrayBuffer()`, up to 1 GB), copies it
(`bytes.slice(0)`, another 1 GB) because `decodeAudioData` takes the first over, and keeps the copy for as long as
the source is loaded. **Download video** then builds a Blob from `subarray`s of it, which copies the picture a third
time. With a 30-minute source, a 1 GB video holds 1 GB for nothing between downloads and needs about 3 GB at the
moment of loading. A `File` is already on disk: `File.slice()` ranges in a Blob are not copied by browsers.

## Files

May touch: `video.js` (`remux` takes the file's bytes as now or a `Blob`/`File` for the sample data),
`app/source.js` (keep the `File` and the parsed index, not the bytes), `tests/video.verify.mjs`,
`tests/browser.verify.js` (its video checks).

May not touch: `audio.js`, `app/render.js`, `app/visualizer.js`, `docs/PROGRESS.json`.

## Spec

1. The page keeps `{ file, name, info, movie }` where `movie` is what `parse` needs for the index (boxes and sample
   tables, not the media data). The `bytes.slice(0)` copy goes.
2. `remux` writes the output Blob from `ftyp`, the new `moov`, the `mdat` header and, for each kept sample run,
   `file.slice(start, end)`; the new audio as now. The output bytes are identical to today's for the same inputs.
3. Reading the index needs only the box headers and `moov` (and `moof`s for fragmented files): read them with
   `file.slice(...).arrayBuffer()` rather than the whole file where the file is large. If that is more than a
   4-hour change, keep the whole-file read at load, drop it after parsing, and say so in the report.

## Done means

- `node tests/video.verify.mjs` passes, and for every fixture the output is byte-identical to the output of the
  current `remux` (compute both in the test).
- The browser suite's video checks pass.
- Each new check fails when broken (an off-by-one sample run; a fragmented file's offsets); say how.
- CI passes on the pushed branch.
