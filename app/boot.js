/* TF2 Voice Emulator, app/boot.js: Boot: restores history, the remembered and shared settings, starts the console,
 * and shows which version this is.
 * One of the page scripts that were script.js, loaded in order by
 * index.html (core, console, source, render, meter, realtake,
 * visualizer, netgraph, boot); they share their top-level names. */

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

(function bootConsole() {
  // Restore persisted command history and any settings shared via URL hash.
  const savedHistory = LS.get('tf2ve_history', []);
  state.cmdHistory = Array.isArray(savedHistory)
    ? savedHistory.filter((entry) => typeof entry === 'string').slice(-50)
    : [];
  state.cmdIndex = state.cmdHistory.length;
  // W4-01a: the defaults are the markup's (DEFAULT_CONFIG, recorded when
  // app/console.js loaded), whatever a browser restored into the controls;
  // then the settings remembered from the last visit (in this browser's own
  // storage, nowhere else); then a share link's, which win. Storage that
  // throws or holds something else leaves the defaults.
  applyDefaults();
  const remembered = LS.get('tf2ve_settings', null);
  if (remembered && typeof remembered === 'object' && !Array.isArray(remembered)) {
    try { applyConfig(remembered); } catch (e) { applyDefaults(); }
  }
  if (LS.get('tf2ve_advanced', false) === true) showAdvanced(true);
  applyHashConfig();
  state.settingsRestored = true;
  updateSignalChain();
  refreshVisualizer();

  const bootLogs = [
    { t: "Valve Software - Source Engine [ Build 22050 ]", c: 'text' },
    { t: "Heap: 256.00 Mb", c: 'text' },
    { t: "Parsed 358 text messages", c: 'text' },
    { t: "execing autoexec.cfg", c: 'text' },
    { t: "cc_lang_listener: loading linguistics_en.txt", c: 'text' },
    { t: "Sound System: Init (2 channels, 16bit)", c: 'sys' },
    { t: `sv_voicecodec: ${(CODEC_PROFILES[els.codec.value] || CODEC_PROFILES.steam).displayName}`, c: 'cmd' },
    { t: "Parallel processing initialized", c: 'text' },
    { t: "Type 'help' for commands. Try 'exec preset_spam' for overdriven mic spam.", c: 'sys' },
    { t: "System Ready.", c: 'sys' }
  ];
  let delay = 0;
  bootLogs.forEach(line => { setTimeout(() => logLine(line.t, line.c), delay); delay += Math.random() * 150 + 50; });
  setTimeout(() => { if (state.simEnabled) simulator.start(); }, delay + 500);
})();

/* ------------------------------------------------------------------ */
/* Which version this is (W4-01a)                                     */
/* ------------------------------------------------------------------ */

// The footer shows the service worker's cache number. When a newer worker
// takes over a page that already had one (not the first visit's, where the
// page had none), a line above step 1 says so. The page never reloads itself:
// a loaded file and its render live only in this page.
(function versionLine() {
  if (!('serviceWorker' in navigator) || location.protocol.indexOf('http') !== 0) return;
  const line = document.getElementById('version-line'), notice = document.getElementById('update-notice');
  let controlled = !!navigator.serviceWorker.controller;
  const show = async () => {
    try {
      if (!line || typeof caches === 'undefined') return;
      const numbers = (await caches.keys()).map((k) => /^tf2ve-v(\d+)$/.exec(k)).filter(Boolean).map((m) => Number(m[1]));
      if (!numbers.length) return;
      line.textContent = `version ${Math.max(...numbers)} · `;
      line.hidden = false;
    } catch (e) { /* no caches here: no version line */ }
  };
  navigator.serviceWorker.ready.then(show).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) { if (notice) notice.hidden = false; }
    else show();
    controlled = true;
  });
})();
