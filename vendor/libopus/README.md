# Bundled Opus runtime

- Wrapper: libopus-wasm 0.4.0, https://github.com/openclaw/libopus-wasm
- Codec reported by the binary: libopus 1.6.1
- Source license: https://github.com/xiph/opus/blob/v1.6.1/COPYING
- npm archive integrity: `sha512-k7XznZMcDSgIl7uHdiCdIPaPfVLslf3C90jcJIEiC5OLK2Qy+M2CMmeAokDca6bbYRnSCVZ9/sUEOSfDrX60Qw==`

The runtime and embedded WebAssembly are copied unmodified. `dist/index.js`
is named `index.mjs` here for consistent Node/browser module loading. Reproduce
with `pnpm install --frozen-lockfile` then `pnpm vendor:opus`. Verify with
`pnpm test:vendor`. Retain both license files and the third-party notices.

The app uses this runtime for a video's audio track (Opus in an MP4, when the browser has no AAC encoder) and as
`roundTrip`'s default; no voice profile runs it (the Steam profiles run libopus 1.1.5 from `../libopus-1.1`). It is pinned by the
npm package's version and the integrity value above, not by a commit; `pnpm test:vendor` checks the runtime, its licence and the
notices here against the installed package.

These files are required on GitHub Pages, including for offline conversion.
They are not disposable development dependencies.
