'use strict';
// The files the site needs offline, derived from the shipped files' own text.
//
// siteFiles(root) starts at index.html and follows every way a shipped file
// loads another, by rule; it fails closed: a form it does not know, in a
// file it reads, is a problem, unless the allowance list below names that
// file and that statement with what was read there. It returns
//   { files, online, problems, from }
// files: the folder's files the site loads (sorted, 'index.html' among
// them), which sw.js's ASSETS must list; online: the files the page links
// that are opened online only (ONLINE_ONLY); problems: every line it could
// not place, and every allowance whose statement is gone; from: for each
// file, the file that first loads it.
//
// The rules (S3-01b, step 2):
// - index.html: every <script> has a src (a file: a script, or a module with
//   type="module") or is inline (read as a script of the page). Every <link>
//   has rel icon, manifest or stylesheet (a file). An <a href> to another
//   site is nothing; into the folder, a file. src, srcset, href, poster,
//   data (and the other attributes that name a URL) on any other element is
//   a problem, as is a style attribute or <style> with url().
// - A stylesheet: every url(...) is a file; @import is a problem.
// - The manifest: icons[].src are files; a key this check does not know is
//   a problem.
// - A script or module, its comments taken out first:
//   importScripts('a', ...): each a file, against the worker's own address;
//   new Worker('a'), new SharedWorker('a'), .addModule('a'): a file, against
//   the page; import('./a'): a file, against the script's own address;
//   import(new URL('a', document.baseURI).href): a file, against the page;
//   import ... from 'a', import 'a', export ... from 'a': a file, against the
//   module (in a script that is not a module, a problem);
//   serviceWorker.register('sw.js'): nothing (the worker is not in its own
//   cache); any other name is a problem.
//   Then any of LOADING_WORDS left in a line is a problem unless ALLOWED
//   names it.
// - One file is not read (OPAQUE), pinned by its SHA-256.
// A reference that names another site, an absolute path, a path out of the
// folder or a file that does not exist is a problem too (the app loads
// nothing from anywhere else: CLAUDE.md, "No uploads and no runtime CDN").
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Not read: a generated bundle whose loading forms are its maker's, and
// which no static reading can follow. Another hash is a problem: the file is
// read again by a person and the hash renewed.
const OPAQUE = {
  'vendor/libopus/generated/libopus.generated.mjs': {
    sha256: 'fc0dd81b929abf0014a17b5205068ed157a20deaf2bb398a0317cae69c2c7073',
    why: 'the WebAssembly of libopus 1.6.1 is inside it, and it loads no other file (read 2026-11-12, at libopus-wasm 0.4.0; '
      + 'tests/vendor-opus.mjs holds it byte for byte to the pinned package)'
  }
};

// Statements that hold a word that loads something and load no file of the
// folder. By file and statement (the statement is found in the line, its
// comments taken out); `times` is how many lines hold it. A statement that
// is gone, or found another number of times, is a problem: the list cannot
// rot.
const ALLOWED = [
  { file: 'app/render.js', statement: 'link.href = url;', times: 1,
    why: 'the download link of saveBlob: url is URL.createObjectURL of a Blob made on the page' },
  { file: 'app/render.js', statement: 'els.audio.src = state.lastBlob;', times: 2,
    why: 'the player gets the render: state.lastBlob is URL.createObjectURL of the render\'s WAV, made on the page' },
  { file: 'app/render.js', statement: 'els.audioDry.src = state.dryBlob;', times: 1,
    why: 'the original\'s twin player: state.dryBlob is URL.createObjectURL of a WAV made on the page (app/source.js)' },
  { file: 'app/render.js', statement: 'els.audio.src = state.preview.url;', times: 1,
    why: 'the first seconds\' preview: state.preview.url is URL.createObjectURL of a Blob from the worker\'s reply' },
  { file: 'app/realtake.js', statement: 'els.audioReal.src = blob;', times: 1,
    why: 'the real take\'s player: blob is URL.createObjectURL of the aligned take\'s WAV, made on the page' },
  { file: 'app/console.js', statement: 'link.href = els.canvas.toDataURL();', times: 1,
    why: 'the console\'s screenshot: a download link to the canvas\'s data URL' },
  { file: 'batch.js', statement: 'ui.preview.src = item.url;', times: 1,
    why: 'the batch\'s preview player: item.url is URL.createObjectURL of a render\'s WAV, made on the page' },
  { file: 'filerate.js', statement: 'typeof require === \'function\' ? require(\'./video.js\') : null;', times: 1,
    why: 'under Node only (the suites): in the browser TF2Video, a script of the page, is there and require is not' }
];

// Files the page links that are opened online only, not kept offline.
// (The orchestrator's ruling 1 of 2026-11-12: a named allowance; sw.js is
// not changed for it. Offline, the link shows the app again: sw.js answers
// a navigation it has no copy of with index.html.)
const ONLINE_ONLY = [
  { from: 'index.html', file: 'vendor/swresample/COPYING.LGPLv2.1',
    why: 'linked, opened online only: the resampler\'s licence, linked from the footer' }
];

// Words that load something. What is left of a script once the forms above
// are taken out must hold none of them. The order's list, and after it a few
// more forms that can name a URL (none is on the site today).
const LOADING_WORDS = [
  ['import(', /\bimport\s*\(/], ['importScripts', /\bimportScripts\b/], ['new Worker', /\bnew\s+Worker\b/],
  ['new SharedWorker', /\bnew\s+SharedWorker\b/], ['addModule', /\baddModule\b/], ['serviceWorker.register', /\bserviceWorker\s*\.\s*register\b/],
  ['fetch(', /\bfetch\s*\(/], ['XMLHttpRequest', /\bXMLHttpRequest\b/], ['instantiateStreaming', /\binstantiateStreaming\b/],
  ['compileStreaming', /\bcompileStreaming\b/], ['new Audio', /\bnew\s+Audio\b/], ['new Image', /\bnew\s+Image\b/],
  ['new EventSource', /\bnew\s+EventSource\b/], ['new WebSocket', /\bnew\s+WebSocket\b/], ['sendBeacon', /\bsendBeacon\b/],
  ['import.meta', /\bimport\s*\.\s*meta\b/], ['new URL(', /\bnew\s+URL\s*\(/], ['an assignment to .src', /\.\s*src\s*=(?!=)/],
  ['an assignment to .href', /\.\s*href\s*=(?!=)/],
  ['createElement of an element that loads', /\bcreateElement(?:NS)?\s*\([^)]*['"`](?:script|link|img|iframe|audio|video|source)['"`]/i],
  ['a static import or export ... from', /(?:^|[;{}])\s*(?:import|export)\b[^;]*?\bfrom\s*['"`]/],
  ['a static import', /(?:^|[;{}])\s*import\s*['"`]/], ['require(', /\brequire\s*\(/],
  // Beyond the order's list.
  ['setAttribute of a URL', /\bsetAttribute(?:NS)?\s*\([^,]*['"`](?:src|href|srcset|poster|data|action)['"`]/i],
  ['an assignment to .srcset or .poster', /\.\s*(?:srcset|poster)\s*=(?!=)/],
  ['markup written from a script', /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\s*\.\s*write(?:ln)?)\b/],
  ['window.open', /\bwindow\s*\.\s*open\s*\(/], ['location.assign or replace', /\blocation\s*\.\s*(?:assign|replace)\s*\(/]
];

// Attributes that name a URL, on an element other than <script>, <link>, <a>.
const URL_ATTRIBUTES = ['src', 'srcset', 'href', 'poster', 'data', 'action', 'formaction', 'background', 'manifest', 'ping', 'xlink:href', 'longdesc', 'cite', 'codebase'];
const MANIFEST_KEYS = ['name', 'short_name', 'description', 'id', 'start_url', 'scope', 'lang', 'dir', 'display', 'orientation',
  'categories', 'background_color', 'theme_color', 'icons'];

// The text of a script with its comments replaced by spaces (newlines kept,
// so a line keeps its number); strings, template literals and regular
// expression literals are kept as they are. A comment marker inside a string
// or a regular expression is not a comment.
function stripComments(text) {
  const out = text.split('');
  const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  const n = text.length;
  let i = 0, last = '';             // last: the last significant character outside comments
  let lastWord = '';
  const braces = [];                // for each open `${`, the depth of { inside it
  const regexAfterWord = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);
  const template = () => {          // i is just past a backtick or a closing } of ${ }; reads to the next ` or ${
    while (i < n) {
      const c = text[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; return; }
      if (c === '$' && text[i + 1] === '{') { i += 2; braces.push(0); return; }
      i++;
    }
    throw new Error('an unterminated template literal');
  };
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      blank(i, end < 0 ? n : end);
      i = end < 0 ? n : end;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) throw new Error('an unterminated comment');
      blank(i, end + 2);
      i = end + 2;
      continue;
    }
    if (c === '\'' || c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== c) { if (text[j] === '\\') j++; else if (text[j] === '\n') throw new Error('an unterminated string'); j++; }
      if (j >= n) throw new Error('an unterminated string');
      i = j + 1; last = c; lastWord = '';
      continue;
    }
    if (c === '`') { i++; template(); last = '`'; lastWord = ''; continue; }
    if (c === '{' && braces.length) { braces[braces.length - 1]++; i++; last = c; lastWord = ''; continue; }
    if (c === '}' && braces.length) {
      if (braces[braces.length - 1] === 0) { braces.pop(); i++; template(); last = '`'; lastWord = ''; continue; }
      braces[braces.length - 1]--; i++; last = c; lastWord = ''; continue;
    }
    if (c === '/') {
      const regex = last === '' || '(,=:[!&|?{};+-*%<>~^'.includes(last) || regexAfterWord.has(lastWord);
      if (regex) {
        let j = i + 1, inClass = false;
        while (j < n) {
          const d = text[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '\n') throw new Error('an unterminated regular expression');
          if (inClass) { if (d === ']') inClass = false; } else if (d === '[') inClass = true; else if (d === '/') break;
          j++;
        }
        j++;
        while (j < n && /[a-z]/i.test(text[j])) j++;
        i = j; last = ')'; lastWord = '';
        continue;
      }
      i++; last = c; lastWord = '';
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(text[j])) j++;
      lastWord = text.slice(i, j); last = 'a'; i = j;
      continue;
    }
    if (!/\s/.test(c)) { last = c; lastWord = ''; }
    i++;
  }
  if (braces.length) throw new Error('an unterminated template literal');
  return out.join('');
}

function siteFiles(root) {
  const problems = [], from = new Map(), online = [], queue = [], queued = new Set(), scannedAs = new Map();
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const lineOf = (text, index) => text.slice(0, index).split('\n').length;

  // A reference `ref` in `file`, resolved against `base` (a file of the
  // folder), of a kind: 'script', 'module', 'stylesheet', 'manifest', 'icon',
  // 'image', 'link'.
  const add = (file, line, base, ref, kind) => {
    const where = `${file}:${line}`;
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) {
      if (kind === 'link' && /^(https?:|mailto:)/i.test(ref)) return;
      problems.push(`${where}: ${kind} ${ref}: not a file of this folder`);
      return;
    }
    if (kind === 'link' && ref.startsWith('#')) return;
    if (ref.startsWith('/')) { problems.push(`${where}: ${kind} ${ref}: an absolute path (the site is served from a folder)`); return; }
    const bare = ref.split(/[?#]/)[0];
    const f = path.posix.normalize(path.posix.join(path.posix.dirname(base), bare));
    if (f.startsWith('..') || f === '.' || f === '') { problems.push(`${where}: ${kind} ${ref}: not a file of this folder`); return; }
    if (!fs.existsSync(path.join(root, f)) || !fs.statSync(path.join(root, f)).isFile()) {
      problems.push(`${where}: ${kind} ${ref}: no such file (${f})`);
      return;
    }
    if (kind === 'link') {
      const named = ONLINE_ONLY.find((o) => o.from === file && o.file === f);
      if (named) { if (!online.includes(f)) online.push(f); return; }
    }
    if (!from.has(f)) from.set(f, file);
    if (!queued.has(`${kind} ${f}`)) { queued.add(`${kind} ${f}`); queue.push({ f, kind }); }
  };

  // ---- index.html ----
  from.set('index.html', '');
  const scanHtml = (file) => {
    const raw = read(file);
    const html = raw.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
    const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    let m;
    while ((m = tagRe.exec(html))) {
      const tag = m[1].toLowerCase(), line = lineOf(html, m.index), attrs = {};
      for (const a of m[2].matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
        attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
      }
      if (attrs.style !== undefined && /url\s*\(|@import/i.test(attrs.style)) problems.push(`${file}:${line}: <${tag} style="...">: a URL in a style attribute`);
      if (tag === 'script') {
        const end = html.toLowerCase().indexOf('</script>', tagRe.lastIndex);
        if (end < 0) { problems.push(`${file}:${line}: <script> without </script>`); break; }
        const type = (attrs.type || '').toLowerCase();
        const module = type === 'module';
        if (type && !module && type !== 'text/javascript') problems.push(`${file}:${line}: <script type="${attrs.type}">: a kind this check does not know`);
        if (attrs.src !== undefined) {
          if (html.slice(tagRe.lastIndex, end).trim()) problems.push(`${file}:${line}: a <script src> with text inside it`);
          add(file, line, file, attrs.src, module ? 'module' : 'script');
        } else {
          // An inline script is read as a script of the page, at its own lines.
          const pad = '\n'.repeat(lineOf(html, tagRe.lastIndex) - 1);
          scanScript(file, module ? 'module' : 'script', pad + html.slice(tagRe.lastIndex, end));
        }
        tagRe.lastIndex = end + '</script>'.length;
      } else if (tag === 'style') {
        const end = html.toLowerCase().indexOf('</style>', tagRe.lastIndex);
        if (end < 0) { problems.push(`${file}:${line}: <style> without </style>`); break; }
        scanCss(file, html.slice(tagRe.lastIndex, end), line);
        tagRe.lastIndex = end + '</style>'.length;
      } else if (tag === 'link') {
        const rel = (attrs.rel || '').toLowerCase();
        if (['icon', 'manifest', 'stylesheet'].includes(rel) && attrs.href !== undefined) add(file, line, file, attrs.href, rel === 'icon' ? 'image' : rel);
        else problems.push(`${file}:${line}: <link rel="${attrs.rel || ''}">: a kind this check does not know`);
        for (const k of URL_ATTRIBUTES) if (k !== 'href' && attrs[k] !== undefined) problems.push(`${file}:${line}: <link ${k}>: a kind this check does not know`);
      } else if (tag === 'a') {
        if (attrs.href !== undefined) add(file, line, file, attrs.href, 'link');
        for (const k of URL_ATTRIBUTES) if (k !== 'href' && attrs[k] !== undefined) problems.push(`${file}:${line}: <a ${k}>: a kind this check does not know`);
      } else {
        for (const k of URL_ATTRIBUTES) if (attrs[k] !== undefined) problems.push(`${file}:${line}: <${tag} ${k}="${attrs[k]}">: a kind this check does not know`);
      }
    }
  };

  // ---- a stylesheet ----
  const scanCss = (file, text, firstLine = 1) => {
    const css = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
      add(file, firstLine - 1 + lineOf(css, m.index), file, m[1] ?? m[2] ?? m[3], 'image');
    }
    for (const m of css.matchAll(/@import\b/gi)) problems.push(`${file}:${firstLine - 1 + lineOf(css, m.index)}: @import`);
  };

  // ---- the manifest ----
  const scanManifest = (file) => {
    let manifest;
    try { manifest = JSON.parse(read(file)); } catch (error) { problems.push(`${file}: not JSON (${error.message})`); return; }
    for (const k of Object.keys(manifest)) if (!MANIFEST_KEYS.includes(k)) problems.push(`${file}: the key "${k}": this check does not know whether it names a file`);
    for (const icon of manifest.icons || []) {
      for (const k of Object.keys(icon)) if (!['src', 'sizes', 'type', 'purpose'].includes(k)) problems.push(`${file}: an icon's key "${k}": a kind this check does not know`);
      if (typeof icon.src === 'string') add(file, 1, file, icon.src, 'image');
      else problems.push(`${file}: an icon without a src`);
    }
  };

  // ---- a script or a module ----
  const allowedSeen = new Map(ALLOWED.map((a) => [a, 0]));
  function scanScript(file, kind, text) {
    let src;
    try { src = stripComments(text); } catch (error) { problems.push(`${file}: could not be read: ${error.message}`); return; }
    const isModule = kind === 'module';
    // A file read twice (as a script and as a module) counts its allowances once.
    const counts = !scannedAs.has(file) || scannedAs.get(file) === kind;
    scannedAs.set(file, kind);
    const take = (re, fn) => {
      src = src.replace(re, (...m) => {
        const index = m[m.length - 2];
        fn(lineOf(src, index), ...m.slice(1, -2));
        return m[0].replace(/[^\n]/g, ' ');
      });
    };
    const STR = '([\'"])([^\'"\\\\`$\\n]+)\\';
    const lit = (group) => `${STR}${group}`;
    // import ... from 'a', export ... from 'a', import 'a' (statements, so at a statement's start).
    take(new RegExp(`((?:^|[;{}])\\s*)(?:import|export)\\b[^'"\`;()]*?\\bfrom\\s*${lit(2)}`, 'gm'), (line, lead, q, ref) => {
      if (!isModule) problems.push(`${file}:${line}: a static import or export in a script that is not a module`);
      add(file, line, file, ref, 'module');
    });
    take(new RegExp(`((?:^|[;{}])\\s*)import\\s*${lit(2)}`, 'gm'), (line, lead, q, ref) => {
      if (!isModule) problems.push(`${file}:${line}: a static import in a script that is not a module`);
      add(file, line, file, ref, 'module');
    });
    // import(new URL('a', document.baseURI).href): against the page.
    take(new RegExp(`\\bimport\\(\\s*new URL\\(\\s*${lit(1)}\\s*,\\s*document\\.baseURI\\s*\\)\\.href\\s*\\)`, 'g'),
      (line, q, ref) => add(file, line, 'index.html', ref, 'module'));
    // import('./a'): against the script's own address.
    take(new RegExp(`\\bimport\\(\\s*${lit(1)}\\s*\\)`, 'g'), (line, q, ref) => add(file, line, file, ref, 'module'));
    // importScripts('a', ...): against the worker's own address.
    take(/\bimportScripts\s*\(([^)]*)\)/g, (line, args) => {
      for (const part of args.split(',').map((s) => s.trim()).filter(Boolean)) {
        const one = /^(['"])([^'"\\`$\n]+)\1$/.exec(part);
        if (one) add(file, line, file, one[2], 'script');
        else problems.push(`${file}:${line}: importScripts(${part}): not a plain string`);
      }
    });
    // new Worker('a'), new SharedWorker('a'), .addModule('a'): against the page.
    take(new RegExp(`\\bnew\\s+(?:Shared)?Worker\\(\\s*${lit(1)}\\s*\\)`, 'g'), (line, q, ref) => add(file, line, 'index.html', ref, 'script'));
    take(new RegExp(`\\.addModule\\(\\s*${lit(1)}\\s*\\)`, 'g'), (line, q, ref) => add(file, line, 'index.html', ref, 'module'));
    // serviceWorker.register('sw.js'): nothing.
    take(new RegExp(`\\bserviceWorker\\.register\\(\\s*${lit(1)}\\s*\\)`, 'g'), (line, q, ref) => {
      if (ref !== 'sw.js') problems.push(`${file}:${line}: serviceWorker.register('${ref}'): only sw.js is known`);
    });
    // What is left.
    const words = (s) => LOADING_WORDS.filter(([, re]) => re.test(s)).map(([name]) => name);
    src.split('\n').forEach((line, k) => {
      if (!words(line).length) return;
      let rest = line;
      for (const a of ALLOWED) {
        if (a.file === file && rest.includes(a.statement)) {
          if (counts) allowedSeen.set(a, allowedSeen.get(a) + 1);
          rest = rest.replace(a.statement, ' ');
        }
      }
      const left = words(rest);
      if (left.length) problems.push(`${file}:${k + 1}: ${left.join(', ')}: ${line.trim().slice(0, 140)}`);
    });
  }

  scanHtml('index.html');
  while (queue.length) {
    const { f, kind } = queue.shift();
    if (OPAQUE[f]) {
      const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex');
      if (sha !== OPAQUE[f].sha256) problems.push(`${f}: SHA-256 ${sha}, not the ${OPAQUE[f].sha256} it was read at: read it again and renew the hash`);
      continue;
    }
    if (kind === 'stylesheet') scanCss(f, read(f));
    else if (kind === 'manifest') scanManifest(f);
    else if (kind === 'script' || kind === 'module') {
      if (/\.m?js$/.test(f)) scanScript(f, f.endsWith('.mjs') ? 'module' : kind, read(f));
      else problems.push(`${f}: loaded as a ${kind}, not a .js or .mjs file`);
    } else if (kind === 'link') {
      // A document the page links: kept offline like any other, not read.
    } else if (kind === 'image') {
      if (!/\.(png|ico|svg|jpe?g|gif|webp)$/i.test(f)) problems.push(`${f}: loaded as an image, a kind of file this check does not know`);
      else if (/\.svg$/i.test(f)) problems.push(`${f}: an SVG image, which can load other files: this check does not read it`);
    } else problems.push(`${f}: loaded as ${kind}, a kind this check does not know`);
  }
  for (const [a, seen] of allowedSeen) {
    if (seen !== a.times) problems.push(`${a.file}: the allowance "${a.statement}" is found ${seen} time${seen === 1 ? '' : 's'}, the list says ${a.times}`);
  }
  for (const o of ONLINE_ONLY) if (!online.includes(o.file)) problems.push(`${o.from}: the link to ${o.file}, opened online only, is gone`);
  return { files: [...from.keys()].sort(), online: online.sort(), problems: [...new Set(problems)], from };
}

// sw.js's ASSETS as written: its entries, and a problem for anything in the
// array that is not a plain quoted string.
function swAssets(text) {
  const m = /const ASSETS = \[([\s\S]*?)\];/.exec(text);
  if (!m) return { entries: [], problems: ['sw.js: no "const ASSETS = [...];"'] };
  const entries = [...m[1].matchAll(/'([^'\n]*)'/g)].map((e) => e[1]);
  const rest = m[1].replace(/'[^'\n]*'/g, '').replace(/[\s,]/g, '');
  return { entries, problems: rest ? [`sw.js: ASSETS holds something that is not a plain quoted string: ${rest.slice(0, 80)}`] : [] };
}

module.exports = { siteFiles, swAssets, stripComments, OPAQUE, ALLOWED, ONLINE_ONLY, LOADING_WORDS };
