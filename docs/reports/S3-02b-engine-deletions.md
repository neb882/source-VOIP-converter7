# S3-02b: three deletions, two harness refusals, the worker's cache modes, four comments

The builder's report. The order is `docs/work-orders/S3-02-engine-split.md`: its head, the rulings of 2026-11-12 and
section S3-02b, with three parts the orchestrator added at S3-02a's merge from its review (the brief). Branch
`claude/s3-02b-engine-deletions`, from `622673c` (S3-02a merged, ten files under `engine/`, cache v37), which is
`main` now.

**Status:** built. Nothing stopped the build. No recorded hash, `predictions.json`, the `CACHE` line or any file under
`engine/` changed.

## Commits

| Commit | What |
| --- | --- |
| `236098b` | C-01: `TF2Audio.realOpusRoundTrip` removed (`audio.js`, the harness's recorded list) |
| `9ca102d` | C-05a: `playheadFraction` removed (`app/visualizer.js`) |
| `6a2e329` | C-05b: `els.consoleDetails` removed (`app/core.js`) |
| `81c35aa` | 2a: the harness refuses an engine file named twice and a head that renames |
| `1c47610` | 2c: four comments (`opus-codec.mjs` twice, `room-dsp.js`, `steam-sender.js`); `PREDICTIONS.md`'s paragraph |
| `4b638f5` | 2b: `sw.js` fetches code and markup past the browser's HTTP cache; `tests/static-server.js`'s `maxAge`; `[Browser 4c]` |
| `7bae683` | the documents |
| `ecce0e8` | `PREDICTIONS.md`: the removed member described rather than named |
| this commit | this report |

C-02, C-03 and C-04 stay, as the order says.

## Part 1: the deletions

Each grep was run on `622673c` over the whole tree (`node_modules` and `.git` left out), documents included, before
the commit, and again after it.

| Item | Before | After |
| --- | --- | --- |
| C-01 `realOpusRoundTrip` | `audio.js:87` (its declaration) and `:124` (its member); `tests/harness.verify.mjs:216` (the recorded list); `docs/PROGRESS.json:23`; the order (lines 30, 356, 467, 522, 726) | the order and `docs/PROGRESS.json:23` only |
| C-05a `playheadFraction` | `app/visualizer.js:202` (its declaration); the order (730) | the order only |
| C-05b `consoleDetails` | `app/core.js:38`; the order (731). The id `console-details` is used by `index.html:475`, `style.css` and the browser suite and stays | the order only |

No grep found a reader the order's table does not show. `docs/PROGRESS.json`'s line is the orchestrator's (the
`next` entry for this order); it is the one place outside history that still names the function. No document lists
`TF2Audio`'s members by name; `tests/README.md` gave their count, 38, and now says "its recorded members" (the
harness prints the count, 37). The parser (`free-names.cjs`) gives `audio.js` the same free names before and after
and nothing declared at its function's top and never used: `loadOpusModule` still has its one reader, `E.audio`.
Nothing else calls the codec module's `roundTrip` for this member's sake: `engine/render.js` and two suites call it
directly.

After C-01 the units group and `verify` (22 suites) ran on a copy of the commit under the lock: every output is
"before"'s but three, each expected: `harness` ("the 38 recorded" is "the 37 recorded"), `meter` (two memory figures)
and `room-dsp` (its speed line), the last two machine figures that S3-02a's report showed move between runs of the
same code.

## Part 2a: the harness's two gaps

`tests/harness.verify.mjs`, check [1]: each of `index.html`'s script tags and every `importScripts` call of each
worker (all calls, not the first) is read, a leading `./` dropped, and an entry of `ENGINE_FILES` that appears more
than once fails, naming the file and the entry. Check [12]: a `:` inside a head's braces fails, naming the file and
line and quoting the head. Each break in a fresh copy (`git archive`), then `node tests/run.mjs harness site` under
the lock:

| Break | On the 2a commit | On the commit before |
| --- | --- | --- |
| nothing (the copy itself) | both pass | |
| `<script src="engine/gain.js">` again after `audio.js` (the reviewer's) | `FAIL index.html names each engine file once [named more than once: engine/gain.js]` | passes |
| the `engine/gain.js` tag twice in a row (the reviewer's) | the order check fails, and `index.html names each engine file once [... engine/gain.js]` | |
| `<script src="./engine/mix.js">` again before `app/core.js` | `FAIL index.html names each engine file once [named more than once: engine/mix.js]` | |
| `'engine/gain.js'` again at the end of `audio-worker.js`'s list | `FAIL audio-worker.js names each engine file once [named more than once: engine/gain.js]` | passes |
| a second `importScripts('engine/steam.js');` in `live-worker.js` | `FAIL live-worker.js names each engine file once [named more than once: engine/steam.js]` | passes |
| `engine/render.js`: `{ buildLossMask, retimeSpurts: steamLoser, steamLoser: retimeSpurts }` (the reviewer's) | `FAIL ... taken under that name [engine/render.js:12: renames in its head (buildLossMask, retimeSpurts: steamLoser, steamLoser: retimeSpurts)]` | passes |
| `engine/gain.js`: `{ clamp: clamp, finiteOr }` | `FAIL ... [engine/gain.js:8: renames in its head (clamp: clamp, finiteOr)]` | passes |

## Part 2b: the service worker and the browser's HTTP cache

### What was measured

A scratch script (`upd.cjs`, the brief's `swupdate.cjs` widened): a logging server over a temporary copy of the
site's files with a chosen `sw.js`, the suite's Chromium (Chrome for Testing 153). A first visit; the worker takes
control; the copy then changes (the cache number one higher, the file input's id renamed in `index.html` and
`app/core.js`, so either file with the other's old copy stops `app/source.js` at load); the visitor goes to the page
again. "Every file" is `max-age=600` on every response, as GitHub Pages sends; "index.html only" is the reviewer's
server. The newer worker is started with `registration.update()`: in no run did the browser ask for `sw.js` by itself
in the seconds after a navigation, as S3-02a's builder also saw.

| Case | `sw.js` as on `622673c` | `sw.js` of this order |
| --- | --- | --- |
| navigation (`page.goto`), every file `max-age` | no request reaches the server; the old page with the old scripts, no page error; the newer worker's cache holds the old `index.html`, `./` and `app/core.js` under v38 | every file asked again (`Cache-Control: max-age=0`); the new page with the new script, no page error; the newer worker's cache holds the new files |
| a link clicked to the page, every file `max-age` | the same as the navigation | the same as the navigation |
| navigation, `index.html` only `max-age` | the old page with the new `app/core.js`: page error `Cannot read properties of null (reading 'addEventListener')`; the newer worker's cache holds the old `index.html` | the new page, no page error; the newer worker's cache new |
| reload, every file `max-age` | the new `index.html` (the reload asks for it) with the old `app/core.js` from the HTTP cache: the same page error; the newer worker's cache holds the old `index.html` and `app/core.js` | the new page, no page error; the newer worker's cache new |
| a first visit to the changed site | the new page, its cache new | the same |
| offline, navigation and reload, after the update | the old page, no page error | the new page from the cache, no page error |
| a redirect: navigation to `/go`, which answers 302 to `/` | `/go` asked; `/` from the HTTP cache: the old page | `/go` asked, the redirect followed by the browser, `/` asked: the new page, no page error |
| the page's `fetch('audio.js', { headers: { Range: 'bytes=0-15' } })` | 200, the whole cached file (its destination is empty, so the cache-first branch answers it) | the same |
| the page's `fetch('index.html', { method: 'POST' })` | reaches the server; the worker does not answer it (only GET reaches either branch) | the same |

Only one of the two changes, every file `max-age`, navigation:

| Change made | The page | The newer worker's cache |
| --- | --- | --- |
| `cache: 'reload'` in the install only | old page, old scripts (the navigation is answered from the HTTP cache) | new |
| `cache: 'no-cache'` in the fetch only | new page, new script, no page error | `index.html` **old**; `./` and `app/core.js` new, because the navigation's fetches had refreshed those two in the HTTP cache and nothing had refreshed `index.html` |

So each matters by itself. `no-cache` closes the visit after an update: the page and its scripts are checked with the
server, so they are the new ones together. `reload` closes the install: the newer generation stores what the server
has now, not what the browser kept from the generation before, so the offline copy is not the old page under the new
number.

### The form of the request

`fetch(req, { cache: 'no-cache' })`, with `req` the event's request. In the Fetch standard, `fetch(input, init)` builds
its request with the `Request` constructor, and that constructor, when `init` is not empty, sets a request whose mode
is `navigate` to `same-origin` (and unsets its reload- and history-navigation flags, and sets its origin and referrer
to the client's). Its redirect mode is copied, and a navigation's is `manual`, so a redirect comes back as an
opaque-redirect response, which the navigation follows: the redirect row above. Earlier versions of the standard,
and browsers of that time, threw a TypeError for a navigation request given options; in such a browser the fetch
would reject and the worker would answer from its cache, as it does offline. Only the suite's Chromium was tried. A
ranged request copied the same way keeps its `Range` header: inside the worker,
`new Request(new Request('/audio.js', { headers: { Range: 'bytes=0-15' } }), { cache: 'no-cache' })` has the header,
cache mode `no-cache`, mode `cors`, and the server received `range=bytes=0-15` with `cache-control: max-age=0`. No
request the network-first branch answers carries a range or a body: the browser makes navigations, scripts, styles
and workers' scripts without one, and the branch is behind `req.method !== 'GET'`. The cache is still filled from
the same `req` (`cachePut(req, resp)`), and the offline fallback is the same code.

### The check

`[Browser 4c]` (`verifyUpdateThroughHttpCache`, after `[Browser 4b]`): a copy of the site's files and `sw.js` in a
temporary folder, served by `createStaticServer(tree, 0, { maxAge: 600 })`; a first visit until the worker controls
the page; the copy changed as above; `page.goto` to the page. Three lines: the page is the new `index.html` with the
new `app/core.js` and has no page error; the worker that served them has the new `./` and `app/core.js` in its cache
(`cachePut`); after `registration.update()` and the newer worker's takeover, its cache holds the new `./`,
`index.html` and `app/core.js`. Run alone (the suite's function, from a scratch runner) on copies of the tree:

| `sw.js` | First failing line |
| --- | --- |
| this order's | none: all three pass |
| `622673c`'s | `navigating to the page after an update gives the new index.html with the new app/core.js, and no page error (index.html old, app/core.js old)` |
| `reload` only | the same line, the same detail |
| `no-cache` only | `once the newer worker has taken over, its cache holds the new index.html and app/core.js (./ new, index.html old, app/core.js new)` |
| this order's with the `cachePut` call taken out of `keep` | `the worker that served them keeps the new copies in its cache (./ old, index.html old, app/core.js old)` |

On `622673c`'s worker, with every file `max-age`, the check fails on the old page with the old scripts, not on the
old page with the new script the brief expected: with every file kept the same ten minutes, a navigation gets a whole
old version. The old page with a new script is what the reviewer's server (only `index.html` kept) and a reload give
(the table above); the check stays with GitHub Pages' headers and a navigation, as the brief asks, and fails either
way.

`tests/static-server.js`: `createStaticServer(root, port, { maxAge })`; with no option every response is `no-cache`,
as before, and no other caller passes it. `sw.js` changed in its header comment, the install's `addAll`, the network-
first `fetch` and a comment over it; the `CACHE` line did not change.

## Part 2c: the four comments

`opus-codec.mjs:583` and `:728` now name `engine/render-stream.js` (`codecResultInfo`); `room-dsp.js:116` and
`steam-sender.js:106` name `engine/dsp.js` (`mulberry32`). The code tokens (`espree.tokenize`, `opus-codec.mjs` as
a module), counted and hashed, before and after:

| File | Tokens | SHA-256 of the tokens, before and after |
| --- | --- | --- |
| `opus-codec.mjs` | 6,927 | `0987d4d7c35a325d...`, equal |
| `room-dsp.js` | 14,535 | `44553b614cd693cf...`, equal |
| `steam-sender.js` | 2,169 | `499fb4eb2a9bb548...`, equal |

Of the three, `opus-codec.mjs` and `steam-sender.js` are in `MODEL_FILES` (`tests/accuracy.mjs:320`); `room-dsp.js`
is not. No suite pins any of the three by a hash (their SHA-256 and git hashes appear in no file). C-01 touches no
file under `engine/`, only `audio.js`. `tests/predictions/PREDICTIONS.md` has one dated paragraph after the last,
naming `audio.js`, `opus-codec.mjs` and `steam-sender.js` and saying that no render changed.

## Whole output, before and after

"Before" is every suite on `622673c`, one at a time from a copy under the lock, standard error with standard output,
times blanked (`sed -E 's/[0-9.]+ (ms|s)\b/T/g'`); all 25 passed. "After" is `node tests/run.mjs all` under the lock
on a copy of `7bae683` (this branch's tree but for this report and `ecce0e8`, which change only `PREDICTIONS.md` and this file), split by suite and blanked the same way.

All 25 passed (1,183.3 s summed, one at a time; before: 1,112.0 s summed over the same 25).

| Suite | After against before |
| --- | --- |
| `gain`, `opus`, `speex102`, `vr12`, `miles`, `reference`, `formats`, `verify`, `steam`, `output-stage`, `render-stream`, `stages` (every suite that renders) | the same, byte for byte, times blanked |
| `vendor`, `gain-exact`, `filerate`, `video`, `demo`, `voice-channel`, `steam-sender`, `swresample`, `site` | the same |
| `browser` | the check lines are "before"'s 411, in order, with `[Browser 4c]`'s heading and three lines after `[Browser 4b]` (414). Details differ only where they hold live or random figures: a render's milliseconds in two console lines, the live chain's frame counts, a correlation (0.898 and 0.961), a meter's dBFS, the mock console feed's lines, a take's timestamp, and the test server's port in one error |
| `harness` | the three lines of check [1]'s new refusal, "the 37 recorded" for "the 38 recorded", and check [12]'s name ("taken under that name") |
| `meter`, `room-dsp` | two memory figures and one speed line, machine figures that move between runs of the same code (S3-02a's report) |

No `GOLDEN` or `GAIN_GOLDEN` value changed: `git diff 622673c -- tests/render-stream.verify.mjs tests/stages.verify.mjs
tests/predictions/predictions.json engine/` prints nothing.

The browser suite also ran alone on `4b638f5` (the 2b commit) before the documents: passed, the same 414 check lines.

## The cache number

`node tests/cache-number.mjs origin/main --report` on the branch:

```
cached files changed since origin/main (622673c): app/core.js, app/visualizer.js, audio.js, opus-codec.mjs, room-dsp.js, steam-sender.js, sw.js
cache number against origin/main (622673c): the number is v37, not above v37: it must rise (node tests/cache-number.mjs origin/main --set)
```

The `CACHE` line is not touched on the branch.

## Documents changed

`tests/README.md` (the harness's row; the browser suite's row; the offline section: the two cache modes,
`[Browser 4c]`, the test server's option), `docs/PAGE.md` ("The version and updates": how an update reaches a
returning visitor), `docs/README.md` (S3-02b's row), `tests/predictions/PREDICTIONS.md`, this report.

## Scanned before the push

`git diff origin/main...HEAD` and the branch's commit messages hold no recording, personal detail, real SteamID or
model name; the only model name is in the commit trailers the brief gives.

## Not done, or uncertain

- Only the suite's Chromium was tried for the request form. A browser that throws on a navigation request given
  options would answer every navigation from the worker's cache.
- The browser did not start the newer worker's install by itself after a navigation within the seconds watched; the
  check starts it with `registration.update()`, as `[Browser 8b]` does.
- `docs/PROGRESS.json` still names `realOpusRoundTrip` in its `next` entry; it is the orchestrator's.
