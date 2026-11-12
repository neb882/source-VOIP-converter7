# S3-02b: three deletions, two harness refusals, the worker's cache modes, four comments

The builder's report. The order is `docs/work-orders/S3-02-engine-split.md`: its head, the rulings of 2026-11-12 and
section S3-02b, with three parts the orchestrator added at S3-02a's merge from its review (the brief). Branch
`claude/s3-02b-engine-deletions`, from `622673c` (S3-02a merged, ten files under `engine/`, cache v37), which is
`main` now.

**Status:** built, and a fix round after the review (its section, "The fix round", is at the end and corrects what
the sections before it got wrong; where they differ, it holds). Nothing stopped the build. No recorded hash,
`predictions.json`, the `CACHE` line or any file under `engine/` changed.

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
| `af66c49` | this report |
| `9372c31` | merge of `main` (documents only) |
| `7c56df1` | fix round, S-2 and S-3: harness [1] and [12] |
| `3fc0230` | fix round: two test comments (`mulberry32` is in `engine/dsp.js`) |
| `411d645` | fix round, B-1: `sw.js` hands the page no-cache copies; `[Browser 4c]` with a warm tab, a reload and an offline load |
| `b527134` | fix round: the documents |
| this commit | this report, with the fix round |

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
again. "Every file" is `max-age=600` on every response, as GitHub Pages sends `index.html` (measured on the live site
on 2026-11-12 by the orchestrator; the other files are inferred to be sent so too); "index.html only" is the reviewer's
server. The newer worker is started with `registration.update()`. (This section first said the browser never asked
for `sw.js` by itself after a navigation: wrong. The script looked within about a second; the browser asks 1.5 to
2.0 s after a navigation and the newer worker takes over by itself. See the fix round.)

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
old page with the new script the brief expected: with every file kept the same ten minutes (inferred, as above), a navigation gets a whole
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
| `browser` | the check lines are the base's, in order, with `[Browser 4c]`'s heading and three lines after `[Browser 4b]`. Details differ only where they hold live or random figures: a render's milliseconds in two console lines, the live chain's frame counts, a correlation (0.898 and 0.961), a meter's dBFS, the mock console feed's lines, a take's timestamp, and the test server's port in one error |
| `harness` | the three lines of check [1]'s new refusal, "the 37 recorded" for "the 38 recorded", and check [12]'s name ("taken under that name") |
| `meter`, `room-dsp` | two memory figures and one speed line, machine figures that move between runs of the same code (S3-02a's report) |

No `GOLDEN` or `GAIN_GOLDEN` value changed: `git diff 622673c -- tests/render-stream.verify.mjs tests/stages.verify.mjs
tests/predictions/predictions.json engine/` prints nothing.

The browser suite also ran alone on `4b638f5` (the 2b commit) before the documents: passed, the same check lines.

## The fix round

After the review the orchestrator ruled one blocker (B-1), three things to fix and notes. Every browser run below is
the suite's Chromium (Chrome for Testing 153), under the lock. The reviewer's scripts (`upd2.cjs`, `kinds.cjs`) were
run again from my scratch folder against this branch's files.

### B-1: a tab that already holds the scripts

**What was wrong.** With every file sent `max-age=600`, a visitor whose last load the worker had served got, after a
change, a new `index.html` (the navigation is revalidated) with the old scripts: Chromium's memory cache in the tab
answered each `<script>` from the earlier load's copy without asking the worker, and the server saw one request.
New page, old scripts, page error; on `622673c`'s worker the same visitor got a whole old version, which works. The
first version of `[Browser 4c]` missed it because its first visit was not controlled by the worker. Reproduced with
the reviewer's `upd2.cjs --warm 1` on `4b638f5`'s worker: navigation and reload each `{"page":"new","script":"finds no
input"}`, `Cannot read properties of null (reading 'addEventListener')`, one request (`index.html`).

**The change (`sw.js` only).** `askAgain(request, response)`: for a request that is not a navigation, the network-first
branch hands the page a copy, `new Response(response.body, { status, statusText, headers })`, with
`Cache-Control: no-cache` set in the copied headers. It is made after `keep` has handed the original to `cachePut`
(whose `clone()` is taken at once), so the stored copy keeps the server's headers. The offline fallback's cache hit
goes out through the same helper. A navigation's response, an opaque redirect, anything not `ok` or not `basic`, and a
response reached through a redirect (whose address the copy would lose) go out as they are; the last is one more
case than the ruling names, for the reason given. The header comment says what it is for, in three lines.

**Shown in the browser.**

| Case | `4b638f5`'s worker | This round's worker |
| --- | --- | --- |
| warm tab, change, navigation (`upd2.cjs ... all goto --warm 1`) | new page, old script, page error; 1 request | new page, new script, no page error; 38 requests, every script among them (`app/core.js [cc=max-age=0] 200`) |
| warm tab, change, reload | the same failure | new page, new script, no page error; 38 requests |
| the same navigation, the server sending ETags | | new page, new script; unchanged files answered 304 |
| `[Browser 4c]`, all five lines | lines 1, 2 and 5 fail (variant i below) | all pass |

Every kind of request (`kinds.cjs`, server `max-age=600` with ETags, and again with `no-cache`), online and then with
the server stopped: the navigation, a classic script and the stylesheet, `audio-worker.js` with its `importScripts`
(`TF2Audio` and `TF2Engine` objects inside it), `import('./opus-codec.mjs')` from that worker and from the page with
what it imports from `vendor/` (an Opus round trip of 9,600 samples and a CELT round trip each run), both worklets
(`live-worklet.js`, `mic-capture.js`), `live-worker.js`, and the page's own `fetch()` of `index.html` and `audio.js`
(the cache-first branch): every one loads, with no page or console error, online and with the server stopped. A
301 and a 302 navigation each end on `/` with the page working; the worker's fetch of the redirect is an opaque
redirect, which is not stored.

**A made Response's address.** A `Response` built in the worker has an empty URL list. The Fetch standard's main fetch
then gives it the request's URL list, so a module's base address is the address it was asked for
(`/opus-codec.mjs`), which is the original response's own address here: no file of the site is reached through a
redirect, and one that were is not copied. The server's log shows the module's imports asked for at the right
places: `/vendor/libopus/index.mjs`, `/vendor/libopus/generated/libopus.generated.mjs`, `/vendor/celt-0.11/index.mjs`,
`/vendor/celt-0.11/celt-0.11.wasm.mjs`.

**What a page could see of the copy.** Its `type` is `default` where the network's was `basic`; its `url` is empty
until the browser sets it to the request's; `redirected` is false; its body is the original's stream, passed on and
not read first, so it still streams; its headers are the server's with `Cache-Control` replaced. A page sees none of
this for a `<script>`, a stylesheet, a worker's script, a worklet or a module import. The only responses the site's
code reads are those of its own `fetch()` calls, which have an empty destination and go to the cache-first branch,
unchanged.

**The offline case.** A load made offline (the page from the worker's cache), the site changes, online again, a
navigation: with `4b638f5`'s worker the page was new and `app/core.js` old (page error); with the header on the
network response only (variant j) the same; with this round's worker, new and new, no error. It is line 5 of the
check.

**The first update after this ships.** The worker a returning visitor already has answers the first visit after this
version is live. Measured with `upd2.cjs` (`622673c`'s worker, the new tree's `sw.js` this round's): a navigation gets
the whole previous version; a reload gets the new `index.html` with the old `app/core.js` (page error). The newer
worker takes over a few seconds later, and then a navigation, a reload and a second navigation each give the new page
with the new script and no error. `docs/PAGE.md` says so.

### `[Browser 4c]` as it now stands

A first visit, then a second the worker controls (both waited for `navigator.serviceWorker.controller`). Change 1:
the input's id renamed in `index.html` and `app/core.js`, and a line added to `audio-worker.js` (the install stores it;
a navigation does not load it). A navigation. Line 1: new page, new script, no page error. Line 2: the serving
generation's cache holds change 1's `./` and `app/core.js` (`cachePut`). Then the cache number rises, `update()`, and
the newer worker takes over. Line 3: its cache holds change 1's `./`, `index.html`, `app/core.js` and
`audio-worker.js`. Change 2 and a reload. Line 4: new page, new script, no error. A load made offline, change 3,
online again, a navigation. Line 5: both loads give their change's page with its script, no error.

**When the browser checks `sw.js` by itself.** The reviewer was right: `upd2.cjs --no-update` on this round's worker,
twice, saw the browser ask for `sw.js` 1.5 s after the navigation and the newer worker take over without `update()`.
So line 2 could race the newer worker's activation, which deletes the serving generation's cache. The check closes it
by holding the number: the tree's `sw.js` keeps its number until line 2 has been read, so the browser's own check
finds the same script and starts nothing; the number then rises and `update()` starts the newer worker.

Each line against each variant of `sw.js` (the check run alone with every line reported, not stopping at the first
failure; a to c from `622673c`'s worker, d to h and j from this round's, i `4b638f5`'s):

| Variant | Line 1 navigation | Line 2 serving cache | Line 3 newer cache | Line 4 reload | Line 5 offline, then online |
| --- | --- | --- | --- | --- | --- |
| a `622673c`'s worker | fails: old page, old script | fails: nothing new | fails: all old | fails: new page, no input (page error) | fails: page error |
| b `reload` only | fails: old, old | fails | passes | fails: page error | fails: page error |
| c `no-cache` only | fails: new page, no input (page error) | fails: `app/core.js` old | fails: `index.html`, `app/core.js`, `audio-worker.js` old | passes | fails: page error online again |
| d no `cachePut` | passes | fails: nothing new | passes | passes | fails: the offline page is change 1's |
| e `no-cache` on navigations only | fails: page error | fails | passes | fails: page error | fails: page error |
| f `reload` on `index.html` only | passes | passes | **fails: `audio-worker.js` old** | passes | passes |
| g `no-cache` on everything but navigations | fails: old page, no input (page error) | fails | passes | passes | fails: page error online again |
| h `reload` on everything but `index.html` | passes | passes | fails: `index.html` old | passes | passes |
| i `4b638f5`'s worker (no no-cache copies) | fails: new page, no input (page error) | fails: `app/core.js` old | passes | passes | fails: page error online again |
| j no-cache copies from the network only | passes | passes | passes | passes | **fails: page error online again** |
| this round's worker, three runs | passes | passes | passes | passes | passes |

Every line fails for at least one variant; f now fails (line 3), and j fails line 5 alone. The reload line passes on
i: after the first navigation and the takeover, the tab's copies are the newer worker's and the reload asks for every
script (the reviewer's warm reload, on the other hand, fails on i, above).

### S-2 and S-3: harness checks [1] and [12]

Check [1] now takes comments out with `tests/lib/site-files.cjs`'s own functions (`stripComments`, and
`stripHtmlComments`, the line `siteFiles` used, now a function of its own that both call), reads strings in either
quote, refuses an `importScripts` call whose arguments are not all plain strings, and compares names as the address a
browser asks for, resolved against the site's root and normalized (`./`, `/`, `//` and a query string make no other
file). Check [12] refuses a head item that is not a plain name (a rename, a default, a nested pattern), and fails
closed: every pattern that takes from a part (`} = E.<name>` or `] = E.<name>`, comments out) must end a head the
check read, or it fails naming file and line. Each case in a fresh copy (`git archive`), `node tests/run.mjs harness
site` under the lock; "before" is the reviewer's run on `9372c31`:

| Case | Before (`9372c31`) | After (`7c56df1`) |
| --- | --- | --- |
| nothing | both pass | both pass |
| `./engine/gain.js` tag after `audio.js` | fails | fails: `named more than once: engine/gain.js` |
| `engine//gain.js` tag | **passes** | fails: `named more than once: engine/gain.js` |
| `engine/gain.js?v=2` tag | harness passes; `site` fails | both fail |
| `Engine/gain.js` tag | harness passes; `site` fails | the same: another address, which `site` refuses |
| `/engine/gain.js` tag | harness passes; `site` fails | both fail |
| `<script defer src=...>` | the order check fails (cannot read the tag) | that, and named more than once |
| `<script src=... defer>` | fails | fails |
| `<script src='engine/gain.js'>` | the order check fails | that, and named more than once |
| `<!-- <script src="engine/gain.js"> -->` | **fails (a false refusal)** | passes |
| a second `importScripts("engine/gain.js")`, double quotes | **passes** | fails: `named more than once` |
| a second `importScripts('./engine/gain.js')` | fails | fails |
| a second `importScripts('engine/gain.js?v=2')` | harness passes; `site` fails | both fail |
| `// importScripts('engine/gain.js') ...` comment | **fails (a false refusal)** | passes |
| a second ``importScripts(`engine/gain.js`)`` (mine) | | fails: `importScripts calls this check cannot read`; `site` fails |
| `{ clamp, finiteOr: finiteOr = undefined }` | fails | fails: `a head names something other than plain names` |
| `{ clamp = Math.min, finiteOr }` | fails | fails, the same message |
| `{ gcd, roundEven, mulberry32: { length: seedArgs } }` | **passes** | fails: `engine/mix.js:8: takes from a part in a form this check cannot read` |
| `{ gcd, roundEven, clamp: { name } }` | **passes** | fails, the same |
| a head with comments holding `:` | passes | passes (comments are not part of the head) |
| a head over several lines that renames | fails | fails |
| a plain head over several lines | passes | passes |
| `let { clamp, finiteOr } = E.dsp;` (mine) | | fails: check [9] (a `let` at the top) and [12] (a form it cannot read) |
| the five breaks of the first build (tag twice, worker list tail, second call, the swap, `clamp: clamp`) | fail | fail |

### Notes acted on

- **Counts of checks:** the report no longer gives the browser suite's number of checks; it says "the base's check
  lines plus `[Browser 4c]`'s".
- **The ten minutes:** `max-age=600` was measured by the orchestrator on the live site on 2026-11-12, on
  `index.html`; the other files were not looked at one by one, so for them it is inferred. `sw.js`'s comment,
  `docs/PAGE.md`, `tests/README.md` and this report say so.
- **`docs/PAGE.md`:** the passage on updates says what holds from this version on, and that the first visit after it
  ships is answered by the worker the visitor already has (above).
- **Two test comments:** `tests/steam-sender.verify.mjs:31` and `tests/voice-channel.verify.mjs:147` now say
  `engine/dsp.js`. Code tokens before and after: 13,845 (`894b8428882613b8...`) and 23,747 (`326301533b228b01...`),
  equal. Three more test comments still say `audio.js` for code now under `engine/` (`tests/gain-exact.mjs:23`,
  `tests/render-stream.verify.mjs:328`, `tests/speex102.verify.mjs:798`); not asked for, left.

### N-1: what it costs

Requests to the server and bytes of bodies, the reviewer's `upd2.cjs ... cost` (a first visit, then three
navigations in the same tab, nothing changed):

| Server | Worker | First visit | Navigation 1 | Navigations 2 and 3 |
| --- | --- | --- | --- | --- |
| `max-age=600`, ETags | `622673c`'s | 62, 2,610,875 B | 0 | 0 |
| `max-age=600`, ETags | `4b638f5`'s | 101, 3,529,811 B | 38, all 304, 0 B | 1 each (304) |
| `max-age=600`, ETags | this round's | 101, 3,530,782 B | 38, all 304, 0 B | 38 each, all 304, 0 B |
| `max-age=600`, no ETags | `622673c`'s | 62, 2,610,875 B | 0 | 0 |
| `max-age=600`, no ETags | this round's | 101, 3,530,782 B | 38, 913,788 B | 38 each, 913,788 B |
| `no-cache` (the tests' server) | all three | 101, about 3.53 MB | 38, 913,788 B | the same |

Whether GitHub Pages answers a conditional request with 304 was not measured here. If it does, a load costs 38
conditional requests and no bodies, where `622673c`'s worker made none for ten minutes; if not, 913,788 bytes. The
first visit's 39 more requests are the install's `cache: 'reload'` fetching what the page's own load had already
fetched. Against a local server the time to `load` of navigations 2 and 3 went from 35 to 45 ms to 104 to 114 ms.

### The whole output after the fix round

`node tests/run.mjs all` under the lock on a copy of `b527134`: all 25 passed (1,072.7 s summed). Against "before":
every suite that renders, and `vendor`, `gain-exact`, `filerate`, `video`, `demo`, `voice-channel`, `steam-sender`,
`swresample` and `site`, the same byte for byte with times blanked; `browser` the base's check lines plus
`[Browser 4c]`'s heading and five lines, details differing only in live or random figures (the console's
milliseconds, the live chain's frame counts, two correlations, a meter's dBFS, the mock feed, a timestamp, a port);
`harness` the lines of the first build plus check [12]'s new name; `meter` and `room-dsp` machine figures.
`[Browser 4b]`'s request check passed (`226 requests, 62 files`).

## The cache number

`node tests/cache-number.mjs origin/main --report` on the branch:

```
cached files changed since origin/main (15d8c53): app/core.js, app/visualizer.js, audio.js, opus-codec.mjs, room-dsp.js, steam-sender.js, sw.js
cache number against origin/main (15d8c53): the number is v37, not above v37: it must rise (node tests/cache-number.mjs origin/main --set)
```

The `CACHE` line is not touched on the branch.

## Documents changed

`tests/README.md` (the harness's row; the browser suite's row; the offline section: the two cache modes, the
no-cache copies, `[Browser 4c]`, the test server's option), `docs/PAGE.md` ("The version and updates": how an update
reaches a returning visitor, and the first visit after this ships), `docs/README.md` (S3-02b's row),
`tests/predictions/PREDICTIONS.md`, this report. In the fix round also `tests/lib/site-files.cjs` (`stripHtmlComments`
split out and exported, no change in what `siteFiles` does: `site` prints what it printed) and two test comments.

## Scanned before the push

`git diff origin/main...HEAD` and the branch's commit messages hold no recording, personal detail, real SteamID or
model name; the only model name is in the commit trailers the brief gives.

## Not done, or uncertain

- Only the suite's Chromium was tried for the request form. A browser that throws on a navigation request given
  options would answer every navigation from the worker's cache.
- (Corrected in the fix round: the browser does start the newer worker's install by itself, 1.5 to 2.0 s after a
  navigation.)
- `docs/PROGRESS.json` still names `realOpusRoundTrip` in its `next` entry; it is the orchestrator's.
