/* TF2 Voice Emulator, app/render.js: Rendering, download formats, the video download and the A/B toggle.
 * One of the page scripts that were script.js, loaded in order by
 * index.html (core, console, source, render, meter, realtake,
 * visualizer, netgraph, boot); they share their top-level names. */

/* ------------------------------------------------------------------ */
/* Render button                                                      */
/* ------------------------------------------------------------------ */

if (els.advancedToggle) {
  els.advancedToggle.addEventListener('click', () => showAdvanced(!document.body.classList.contains('advanced')));
}
if (els.consoleDetails) {
  els.consoleDetails.addEventListener('toggle', () => {
    els.conOut.setAttribute('aria-live', els.consoleDetails.open ? 'polite' : 'off');
  });
}

// Whether jobs can run in audio-worker.js (not from file://).
function canUseWorker() {
  return typeof Worker !== 'undefined' && location.protocol !== 'file:';
}

// One job in a dedicated worker. Returns { promise, cancel }: the promise
// resolves with the worker's reply; cancel() terminates the worker and
// rejects with an AbortError.
function startWorker(message, transfer, onProgress) {
  const worker = new Worker('audio-worker.js');
  const id = ++state.processId;
  let cancel;
  const promise = new Promise((resolve, reject) => {
    let done = false;
    const finish = () => { done = true; worker.terminate(); };
    cancel = () => {
      if (done) return;
      finish();
      const error = new Error('Audio processing cancelled.');
      error.name = 'AbortError';
      reject(error);
    };
    worker.onmessage = (event) => {
      const reply = event.data || {};
      if (reply.id !== id || done) return;
      if (reply.type === 'progress') {
        if (onProgress) onProgress(reply.value);
      } else if (reply.type === 'error') {
        finish();
        reject(new Error(reply.message || 'Audio worker failed.'));
      } else {
        finish();
        resolve(reply);
      }
    };
    worker.onerror = (event) => {
      if (done) return;
      finish();
      reject(new Error(event.message || 'Audio worker could not start.'));
    };
    worker.postMessage({ ...message, id }, transfer);
  });
  return { promise, cancel };
}

// One render in a dedicated worker, as { promise, cancel }. The result
// carries the render's loudness and levels (meter.js) as `stats`.
function startWorkerJob(source, opts) {
  const mono = source.getChannelData(0).slice();
  const workerOpts = { ...opts };
  delete workerOpts.onProgress;
  const job = startWorker({ type: 'process', sampleRate: source.sampleRate, samples: mono.buffer, opts: workerOpts, measure: true },
    [mono.buffer], opts.onProgress);
  return {
    cancel: job.cancel,
    promise: job.promise.then((reply) => ({
      samples: new Float32Array(reply.samples),
      sampleRate: reply.sampleRate,
      blob: reply.blob,
      realOpus: reply.realOpus,
      codecInfo: reply.codecInfo,
      stats: reply.stats
    }))
  };
}

function processInWorker(source, opts) {
  const job = startWorkerJob(source, opts);
  state.cancelProcessing = job.cancel;
  return job.promise.finally(() => {
    if (state.cancelProcessing === job.cancel) state.cancelProcessing = null;
  });
}

function describeModes(modes) {
  if (!modes) return 'modes unknown';
  const total = Object.values(modes).reduce((sum, n) => sum + n, 0);
  const parts = Object.entries(modes).filter(([, n]) => n > 0)
    .map(([mode, n]) => `${mode === 'speex' ? 'Speex' : mode.toUpperCase()} ${Math.round(100 * n / Math.max(1, total))}%`);
  return parts.length ? parts.join(', ') : 'no packets';
}

// The mono signal the game's microphone input receives from the source.
function captureSource(source, channel) {
  if (!source.left || channel === 'mix') return source;
  const mix = source.getChannelData(0), left = source.left;
  let mono = left;
  if (channel === 'right') {
    mono = new Float32Array(mix.length);
    for (let i = 0; i < mono.length; i++) mono[i] = 2 * mix[i] - left[i];
  }
  return { sampleRate: source.sampleRate, duration: source.duration, length: mono.length, numberOfChannels: 1, getChannelData: () => mono };
}

// The key of the settings a render is made with: the batch's and the page's
// (W4-01a). With a demo as the source, its own codec renders, whatever the
// codec control holds.
function settingsKey(demo = null) {
  const opts = renderOptions();
  if (demo) opts.codec = demo.codecKey;
  return JSON.stringify(opts);
}

// The render settings of the current controls (everything but progress).
function renderOptions() {
  return {
    codec: els.codec.value,
    // The listener's room and under water (W3-17d, app/rooms.js): the room
    // as audio.js takes it (null, { auto }, { preset } or { custom }).
    ...roomSettings(),
    captureChannel: els.captureChannel.value,
    micGain:     Number(els.gain.value),
    voiceScale:  Number(els.voiceScale.value),
    hp:          Number(els.hp.value),
    lp:          Number(els.lp.value),
    bits:        Number(els.bits.value),
    agc:         els.agc.value === '1',
    retime:      !!els.retime && els.retime.value === '1',
    maxGain:     Number(els.maxGain.value),
    avgGain:     Number(els.avgGain.value),
    gate:        els.vad.value === 'auto' ? null : els.vad.value === '1',
    // At the profile's own default (-40 for `steam`: Steam's 1% of full
    // scale, 327.67, exactly; -39.5 for the others) the page sends no number,
    // so the key a render is cached and batched by does not change at a
    // default; a number otherwise (W3-11b).
    // A blank control (or one that holds no number) is the profile's own too,
    // as the engine reads it (gateThresholdDb() in audio.js), not 0 dBFS.
    gateThresholdDb: typedGateDb() === null || typedGateDb() === gateDefaultDb(els.codec.value) ? undefined : typedGateDb(),
    // How long the sender's Steam had been running (W3-16): its float clock
    // sets the hold's real length. `steam` only; left out for other profiles.
    steamUptime: els.codec.value === 'steam' ? Number(els.steamUptime.value) : undefined,
    volume:      Number(els.volume.value),
    // The listener's sound device (snd_device_rate, the app's own): the
    // render, its download and its playback are at this rate (W3-10).
    deviceRate:  els.deviceRate ? Number(els.deviceRate.value) : VOICE_ENGINE.deviceRate,
    lossPct:     Number(els.loss.value),
    frameMs:     Number(els.frameMs.value),
    enableWarble: els.warble.value === '1',
    jitterMs:    Number(els.jitter.value)
  };
}

async function runAudioProcess(source, opts) {
  source = captureSource(source, opts.captureChannel);
  if (canUseWorker()) {
    try {
      return await processInWorker(source, opts);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      logLine(`Audio worker unavailable; using compatibility path (${error.message})`, 'warn');
    }
  }
  state.cancelProcessing = null;
  if (els.cancel) els.cancel.hidden = true;
  return TF2Audio.process(source, opts);
}

// Download name for a render of `sourceName` with codec profile `codecKey`.
function outputName(sourceName, codecKey, ext = 'wav') {
  const base = (sourceName || 'clip').replace(/\.[^/.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  return `${base}_tf2_${codecKey}.${ext}`;
}

/* ------------------------------------------------------------------ */
/* Download formats (formats.js): WAV, FLAC, MP3                      */
/* ------------------------------------------------------------------ */

function currentFormat() {
  const key = els.format ? els.format.value : 'wav';
  return TF2Formats.FORMATS[key] ? key : 'wav';
}

// The file for `format` made from a rendered WAV blob, as { blob, crc }
// (crc: CRC-32 for ZIP archives). Runs in a worker when it can.
async function exportWav(wavBlob, format) {
  const { mime } = TF2Formats.FORMATS[format];
  const wav = await wavBlob.arrayBuffer();
  if (canUseWorker()) {
    const reply = await startWorker({ type: 'export', wav, format }, [wav]).promise;
    return { blob: new Blob([reply.bytes], { type: mime }), crc: reply.crc };
  }
  const bytes = await TF2Formats.fromWav(new Uint8Array(wav), format);
  return { blob: new Blob([bytes], { type: mime }), crc: TF2Zip.crc32(bytes) };
}

// exportWav with the result kept per format in `cache`; a failure is not kept.
function cachedExport(cache, wavBlob, format) {
  if (!cache[format]) {
    cache[format] = exportWav(wavBlob, format);
    cache[format].catch(() => { delete cache[format]; });
  }
  return cache[format];
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// "(earlier settings)" while the render on screen was made with other
// settings than the controls hold (W4-01a).
function updateDownloadLabel() {
  if (els.dl && !els.dl.dataset.busy) els.dl.textContent = `Download ${TF2Formats.FORMATS[currentFormat()].label}${state.stale ? ' (earlier settings)' : ''}`;
}

if (els.format) {
  const saved = LS.get('tf2ve_format', 'wav');
  if (TF2Formats.FORMATS[saved]) els.format.value = saved;
  els.format.addEventListener('change', () => {
    LS.set('tf2ve_format', currentFormat());
    updateDownloadLabel();
    document.dispatchEvent(new Event('tf2:format'));
  });
  updateDownloadLabel();
}

// Show a finished render: console report, preview players (the render plus
// the muted twin of the original, for Hear), download name, visualizer and
// the render's status line. `made`: { source, key, codecName, reveal, live }
// (the source and settings key it was made from, the codec's name for the
// status line, whether the player is to come into view and take the focus,
// and whether it is a recorded live session).
function presentRender({ samples, sampleRate, blob, realOpus, codecInfo, stats }, took, codecKey, made = {}) {
  // Report the actual processing path: codec version, bitrate and the
  // Opus modes the encoder really chose.
  logLine(realOpus
    ? `S_Voice: ${codecInfo.version}, ${codecInfo.bitrate / 1000} kbps ${codecInfo.vbr ? 'VBR' : 'CBR'}${codecInfo.dtx ? ' + DTX' : ''}, `
      + `${codecInfo.packetBytes ? `${codecInfo.packetBytes}-byte packets of ` : ''}${+(codecInfo.frameMs || 20).toFixed(1)} ms, `
      // vaudio_speex and vaudio_miles have no concealment: a lost frame plays as zeros.
      + `${codecInfo.plc === 'zeros' ? 'a lost frame plays as zeros' : 'native PLC'} (${describeModes(codecInfo.modes)})`
    : 'S_Voice: codec bypassed', 'sys');
  // vaudio_miles (W3-20b) is not the game's: the render says so.
  if (realOpus && codecInfo.backend === 'vr12') {
    logLine('S_Voice: vaudio_miles is not a TF2 codec (Source engines of 2006 and 2007); not checked against any recording', 'sys');
  }
  if (realOpus && codecInfo.gate != null) {
    const held = codecInfo.frames ? Math.round(100 * codecInfo.gatedFrames / codecInfo.frames) : 0;
    logLine(`S_Voice: voice gate at ${codecInfo.gate} dBFS sent ${codecInfo.spurts} talk spurt${codecInfo.spurts === 1 ? '' : 's'} and held back ${codecInfo.gatedFrames} of ${codecInfo.frames} frames (${held}%)`, 'sys');
  }
  if (realOpus && codecInfo.dtxFrames) {
    logLine(`S_Voice: ${codecInfo.dtxFrames} inactive frames sent as DTX comfort noise`, 'sys');
  }
  if (realOpus && codecInfo.sender && codecInfo.sender.rule === 'steam' && (codecInfo.lostFrames || codecInfo.underrunFrames)) {
    // Steam's decoder conceals a gap when the next frame arrives (at most
    // ten frames); frames lost at a spurt's end are never played.
    logLine(`S_Voice: ${codecInfo.lostFrames} frames concealed, ${codecInfo.underrunFrames || 0} late frames played as silence; frames lost at a spurt's end are not played`, 'sys');
  } else if (realOpus && (codecInfo.lostFrames || codecInfo.underrunFrames)) {
    logLine(`S_Voice: ${codecInfo.lostFrames} frames lost and ${codecInfo.plc === 'zeros' ? 'played as zeros' : 'concealed'}, ${codecInfo.underrunFrames || 0} late frames played as silence`, 'sys');
  }
  logLine(`S_Voice: receiver auto-gain ${codecInfo.autoGain ? 'on' : 'off'} at ${codecInfo.voiceRate} Hz`, 'sys');

  // A render that replaces a render of the same source keeps the place:
  // the player's position (clamped to the new length), whether it plays,
  // and which version is heard (W4-01a, item 4). A new source starts at 0
  // on the render, paused.
  const source = made.source || state.decodedSource;
  const keep = !!state.lastBlob && state.renderedSource === source;
  const place = keep ? { at: els.audio.currentTime, playing: !els.audio.paused, mode: state.abMode } : null;

  state.processedBuffer = samples;
  state.processedRate   = sampleRate;
  if (stats) meterResults.set(bufferId(samples), Promise.resolve(stats));
  if (state.lastBlob) URL.revokeObjectURL(state.lastBlob);
  state.lastBlob = URL.createObjectURL(blob);
  state.lastWav = blob;
  state.lastExports = {};
  state.renderedSource = source;
  state.renderedKey = made.key !== undefined ? made.key : settingsKey(state.sourceDemo);

  els.audio.src = state.lastBlob;
  // Arm the muted twin of the original, so Hear is an instant unmute rather
  // than a src swap (left as it is when it already holds the original).
  if (els.audioDry) {
    if (els.audioDry.getAttribute('src') !== state.dryBlob) els.audioDry.src = state.dryBlob;
    els.audioDry.volume = els.audio.volume;
  }
  state.abMode = place && (place.mode !== 'real' || state.realTake) ? place.mode : 'wet';
  setAbMutes();
  if (place) {
    els.audio.addEventListener('loadedmetadata', () => {
      if (state.lastBlob !== els.audio.getAttribute('src')) return;
      const d = els.audio.duration;
      try { els.audio.currentTime = Math.min(place.at, isFinite(d) && d > 0 ? Math.max(0, d - 0.01) : place.at); } catch (e) { /* not seekable yet */ }
      syncTwins(true);
      if (place.playing) els.audio.play().catch(() => {});
    }, { once: true });
  }
  state.lastCodecKey = codecKey;
  els.dl.disabled = false;

  state.renderId++;
  state.lastCodecInfo = codecInfo;
  updateAbButtons();
  updateVideoButton();
  // A re-render of the same source keeps the view, band and selection.
  refreshVisualizer();
  updateMeter();
  // A loaded take lines up better against the render than against the
  // source (comfort noise, low tones); re-align it when the render allows.
  // Aligning starts the take afresh, so a real take chosen before is chosen
  // again once it is lined up.
  if (referenceDecoded && renderGuide()) {
    alignReferenceTake().then(() => {
      if (place && place.mode === 'real' && state.realTake && state.renderedSource === source) setAbMode('real');
    });
  } else updateReferenceReport();
  state.lastRenderStatus = made.live ? liveStatus(samples, sampleRate, made.codecName) : renderedStatus(samples, sampleRate, took, made.codecName, codecInfo);
  setRenderStatus(state.lastRenderStatus);
  // A render waiting for these settings is not needed now (a recorded live
  // session arrives with its render); one for others is kept or marked.
  reconcileRender();
  logLine(`ChangeLevel: rendered ${samples.length} samples @ ${sampleRate}Hz in ${took}ms`, 'sys');
  logLine(`Net_SendPacket: reliable stream ready.`);
  if (made.reveal) revealPlayer(made.reveal === 'scroll');
}

// The render's status line (W4-01a, item 5), under the player.
function setRenderStatus(message, kind = '') {
  if (!els.renderStatus) return;
  els.renderStatus.textContent = message;
  els.renderStatus.className = `render-status${kind ? ' ' + kind : ''}`;
}
const secondsText = (s) => `${s.toFixed(1)} s`;
// "Rendered in 1.1 s · 10.0 s of sound at 48,000 Hz · Steam voice (Opus,
// 32 kbps) · 0.12 s not sent (too quiet for the gate)": the codec by the
// codec control's own words (so vaudio_miles and Fullband Opus keep "not in
// TF2" and "not in the game"), the last part only when the gate held frames.
function renderedStatus(samples, sampleRate, took, codecName, codecInfo) {
  const frame = (codecInfo && codecInfo.frameMs) || 20;
  const held = codecInfo && codecInfo.gatedFrames > 0 ? ` · ${(codecInfo.gatedFrames * frame / 1000).toFixed(2)} s not sent (too quiet for the gate)` : '';
  return `Rendered in ${secondsText(took / 1000)} · ${secondsText(samples.length / sampleRate)} of sound at ${sampleRate.toLocaleString('en-US')} Hz`
    + `${codecName ? ` · ${codecName}` : ''}${held}`;
}
function liveStatus(samples, sampleRate, codecName) {
  return `Recorded live · ${secondsText(samples.length / sampleRate)} of sound at ${sampleRate.toLocaleString('en-US')} Hz${codecName ? ` · ${codecName}` : ''}`;
}
// The codec's name for the status line: the codec control's option text,
// a demo's codec as the demo carries it, or that the codec was skipped.
function codecNameFor(codecKey, { demo = null, skipped = false } = {}) {
  if (demo) return `${demo.speaker && demo.speaker.codec !== 'steam' ? demo.speaker.codec : 'Steam voice'}, as the demo carries it`;
  if (skipped) return 'the codec skipped';
  const option = els.codec.querySelector(`option[value="${codecKey}"]`);
  return option ? option.textContent : codecKey;
}

// After the first render of a source, or a render started with the button:
// the player comes into view (step 3's heading to the top of the screen,
// when the player is not wholly in view) and takes the focus, so Space
// plays. Nothing plays by itself. The focus is not taken from a field the
// user is typing in.
function revealPlayer(scroll) {
  const active = document.activeElement;
  const typing = active && active !== document.body && (active.isContentEditable || /^(TEXTAREA|SELECT)$/.test(active.tagName)
    || (active.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|reset|file|color)$/.test(active.type)));
  if (typing) return;
  if (scroll) {
    const box = els.audio.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) {
      const heading = document.getElementById('step-listen');
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (heading) heading.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    }
  }
  els.audio.focus({ preventScroll: true });
}

// A recorded live-monitor session (live.js): the microphone becomes the
// source and the voice the render, already lined up by the live worker, so
// A/B, the views, the meter and downloads work as after a render. Rendering
// again replaces the voice with an offline render of the same microphone.
function mountLiveTake({ dry, wet, rate, frameLog, counts, info }) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  // A recorded live session arrives with its render: no render of its own.
  mountSource(dry, rate, `live-${stamp}`, null, { render: false });
  const codecRate = (CODEC_PROFILES[info.codec] || CODEC_PROFILES.steam).codecRate, frameSamples = info.frameSamples || codecRate / 50;
  const engine = (CODEC_PROFILES[info.codec] || CODEC_PROFILES.steam).engine;
  const backend = !info.realOpus ? 'bypass' : engine === 'celt011' ? 'celt' : engine === 'speex' ? 'speex' : engine === 'vr12' ? 'vr12' : 'libopus';
  const codecInfo = { backend, version: info.version || 'bypass', bitrate: info.bitrate,
    vbr: info.vbr, dtx: info.dtx, modes: counts.modes, gate: info.gate, spurts: counts.spurts, gatedFrames: counts.gated,
    frames: counts.frames, dtxFrames: counts.dtx, lostFrames: counts.lost, underrunFrames: counts.late,
    autoGain: info.autoGain, voiceRate: info.voiceRate, codec: info.codec, live: true, ...(backend === 'speex' || backend === 'vr12' ? { plc: 'zeros' } : {}),
    // One code per codec frame of the recording, from its start.
    frameLog, frameSamples, sampleRate: codecRate, lookahead: 0, frameMs: 1000 * frameSamples / codecRate, framesPerPacket: 1 };
  logLine(`voice_record: live take of ${(dry.length / rate).toFixed(1)} s loaded (${counts.spurts} talk spurt${counts.spurts === 1 ? '' : 's'}).`, 'sys');
  presentRender({ samples: wet, sampleRate: rate, blob: TF2Audio.encodeWav(wet, rate), realOpus: !!info.realOpus, codecInfo }, 0, info.codec || 'steam',
    { source: state.decodedSource, key: settingsKey(), live: true, codecName: codecNameFor(info.codec || 'steam', { skipped: !info.realOpus }) });
}

if (els.cancel) els.cancel.addEventListener('click', () => {
  if (state.cancelProcessing) state.cancelProcessing();
});

if (els.dl) els.dl.addEventListener('click', async () => {
  if (!state.lastWav || els.dl.disabled) return;
  const format = currentFormat(), wav = state.lastWav;
  const { ext, label } = TF2Formats.FORMATS[format];
  const name = outputName(state.sourceName, state.lastCodecKey, ext);
  if (format === 'wav') { saveBlob(wav, name); return; }
  els.dl.disabled = true;
  els.dl.dataset.busy = '1';
  els.dl.textContent = `Encoding ${label}…`;
  try {
    const { blob } = await cachedExport(state.lastExports, wav, format);
    // Skip the save if a new render or source replaced this one meanwhile.
    if (state.lastWav === wav) saveBlob(blob, name);
    logLine(`Host_WriteFile: ${name} (${(blob.size / 1048576).toFixed(1)} MB)`, 'sys');
  } catch (e) {
    logLine(`${label} export failed: ${e.message}`, 'err');
    setStatus(`Could not make the ${label} file: ${e.message}`, 'error');
  } finally {
    delete els.dl.dataset.busy;
    updateDownloadLabel();
    els.dl.disabled = !state.lastWav || state.processing;
  }
});

/* ------------------------------------------------------------------ */
/* Renders: by the button, for a new source, after a changed setting  */
/* ------------------------------------------------------------------ */

// W4-01a: a new source renders by itself; a changed setting renders by
// itself 400 ms after the last change while the source is at most
// AUTO_RENDER_SECONDS long (a render running for older settings is
// cancelled first), and is marked as not rendered otherwise. Nothing plays
// by itself.
let autoRenderTimer = 0;
let renderAfter = null;   // a render asked for while one runs: { button }
let dropRunning = false;  // the running render is stopped because the controls went back to the render on screen

// The key the controls would render with now.
const currentRenderKey = () => settingsKey(state.sourceDemo);
// No render running and none waiting to start (for the tests too).
const renderIdle = () => !state.processing && !autoRenderTimer && !renderAfter;

function clearAutoRender() {
  clearTimeout(autoRenderTimer);
  autoRenderTimer = 0;
}

// Start a render of the source with the controls' settings. A render already
// running is cancelled first and this one starts when it has stopped.
// `button`: the user pressed Render (the player then takes the focus). The
// first render of a source brings the player into view (presentRender).
function startRender({ button = false } = {}) {
  clearAutoRender();
  if (!state.decodedSource) return;
  if (state.batchRunning) {
    // The batch holds the workers, and the settings cannot change meanwhile
    // (its controls are inert): try again once it is done.
    autoRenderTimer = setTimeout(() => { autoRenderTimer = 0; startRender({ button }); }, AUTO_RENDER_DELAY_MS);
    return;
  }
  if (state.processing) {
    renderAfter = { button: button || !!(renderAfter && renderAfter.button) };
    dropRunning = false;
    if (state.cancelProcessing) state.cancelProcessing();
    updateStale();
    return;
  }
  runRender({ button });
}

// The source just mounted renders by itself (mountSource; loadDemoFile once
// the demo's packets are in place).
function renderNewSource() {
  startRender();
}

// After a change of the settings (tf2:settings) and after each render: with
// the controls on another key than the render on screen (or the one
// running), a source of at most AUTO_RENDER_SECONDS renders 400 ms after the
// last change; a longer one is marked. Back on the key of the render on
// screen, a render running for other settings stops and nothing starts.
function reconcileRender() {
  clearAutoRender();
  if (!state.decodedSource || renderAfter) { updateStale(); return; }
  const key = currentRenderKey();
  const onScreen = state.renderedSource === state.decodedSource ? state.renderedKey : null;
  const short = state.decodedSource.duration <= AUTO_RENDER_SECONDS;
  if (state.processing) {
    if (key === state.renderingKey) { /* it is coming */ }
    else if (key === onScreen) { dropRunning = true; if (state.cancelProcessing) state.cancelProcessing(); }
    else if (short) autoRenderTimer = setTimeout(() => { autoRenderTimer = 0; startRender(); }, AUTO_RENDER_DELAY_MS);
  } else if (key !== onScreen && short) {
    autoRenderTimer = setTimeout(() => { autoRenderTimer = 0; startRender(); }, AUTO_RENDER_DELAY_MS);
  }
  updateStale();
}
document.addEventListener('tf2:settings', reconcileRender);

// The marks of a render on screen made with other settings than the controls
// hold, when none is coming: the status line, the button, the download's
// label and the views and the table, dimmed. They go when the controls
// return to the rendered key.
const STALE_TEXT = 'These settings are not rendered yet. What you see and hear was made with the earlier ones.';
function updateStale() {
  const coming = autoRenderTimer || renderAfter || (state.processing && state.renderingKey === (state.decodedSource ? currentRenderKey() : null));
  const stale = !!(state.lastWav && state.decodedSource && state.renderedSource === state.decodedSource
    && state.renderedKey !== currentRenderKey() && !coming);
  const was = state.stale;
  state.stale = stale;
  for (const el of [els.vizContainer, els.vizLegend, els.meter]) if (el) el.classList.toggle('stale', stale);
  if (!state.processing) els.process.textContent = stale ? 'Render again' : 'Render';
  updateDownloadLabel();
  if (stale) setRenderStatus(STALE_TEXT, 'stale');
  else if (was && els.renderStatus && els.renderStatus.textContent === STALE_TEXT) setRenderStatus(state.lastRenderStatus || '');
}

async function runRender({ button }) {
  const source = state.decodedSource;
  state.processing = true;
  // A demo's voice arrives already coded: only the receiver runs, with the
  // demo's own codec (audio.js opts.received).
  const demo = state.sourceDemo;
  const key = currentRenderKey();
  state.renderingKey = key;
  document.dispatchEvent(new Event('tf2:busy'));
  els.process.disabled = true;
  els.dl.disabled = true;
  els.file.disabled = true;
  if (els.mic) els.mic.disabled = true;
  if (els.cancel) els.cancel.hidden = false;
  if (els.progress) { els.progress.hidden = false; els.progress.value = 0; }
  els.process.textContent = 'Rendering…';
  updateStale();
  setRenderStatus(`Rendering ${source.duration.toFixed(1)} s…`);
  logLine(`S_StartSound: initializing render...`);

  let superseded = false;
  try {
    const codecKey = demo ? demo.codecKey : els.codec.value;
    const opts = {
      ...renderOptions(),
      ...(demo ? { codec: demo.codecKey, received: demo.received } : {}),
      onProgress:  (p) => {
        const percent = Math.min(100, Math.max(0, Math.round(p * 100)));
        els.process.textContent = `Rendering… ${percent}%`;
        if (els.progress) els.progress.value = percent;
      }
    };
    const codecName = codecNameFor(codecKey, { demo, skipped: !demo && !opts.enableWarble });

    logLine(demo ? `MIX: demo voice as received, codec=${opts.codec}, receiver only; vs=${opts.voiceScale}`
      : `MIX: codec=${opts.codec} room=${roomSummary()} gain=${opts.micGain} vs=${opts.voiceScale}`);

    const t0 = performance.now();
    const result = await runAudioProcess(source, opts);
    const took = Math.round(performance.now() - t0);

    if (state.decodedSource !== source) {
      logLine('S_StopSound: the source changed during the render; its result was dropped.', 'warn');
      return;
    }
    // The first render of a source comes into view; one the button started
    // takes the focus.
    const first = state.renderedSource !== source;
    presentRender(result, took, codecKey, { source, key, codecName, reveal: first ? 'scroll' : button ? 'focus' : null });
  } catch (e) {
    superseded = !!renderAfter || dropRunning;
    if (state.decodedSource !== source) {
      logLine('S_StopSound: render of the previous source stopped.', 'warn');
    } else if (e.name === 'AbortError') {
      logLine(renderAfter ? 'S_StopSound: render stopped for newer settings.' : dropRunning ? 'S_StopSound: render stopped; the settings are back to the render on screen.'
        : 'S_StopSound: render cancelled.', 'warn');
      if (!superseded) setRenderStatus('Render cancelled. The source is still loaded.');
      else if (dropRunning) setRenderStatus(state.lastRenderStatus || '');
    } else {
      console.error(e);
      logLine(`render failed: ${e.message}`, 'err');
      setRenderStatus(`The render failed: ${e.message}`, 'error');
    }
  } finally {
    state.processing = false;
    state.renderingKey = null;
    state.cancelProcessing = null;
    els.process.disabled = !state.decodedSource;
    els.dl.disabled = !state.lastWav;
    els.file.disabled = false;
    if (els.mic) els.mic.disabled = false;
    if (els.cancel) els.cancel.hidden = true;
    if (els.progress) els.progress.hidden = true;
    const next = renderAfter;
    renderAfter = null;
    dropRunning = false;
    if (next && state.decodedSource) startRender(next);
    else { els.process.textContent = 'Render'; reconcileRender(); }
    document.dispatchEvent(new Event('tf2:busy'));
  }
}

els.process.addEventListener('click', () => {
  if (!state.decodedSource) { logLine('No decoded audio — select a file first.', 'err'); return; }
  if (state.processing || state.batchRunning) return;
  startRender({ button: true });
});

/* ------------------------------------------------------------------ */
/* Hear: the TF2 voice, the original or a real take                   */
/* ------------------------------------------------------------------ */

// Hear plays the render ('wet'), the original ('dry') or, with a real take
// loaded, the take ('real'). All versions play in sync; switching is an
// instant mute swap, with no re-buffering. B cycles them.
const AB_LABELS = { wet: 'Hearing the TF2 voice', dry: 'Hearing the original', real: 'Hearing the real take' };
function setAbMutes() {
  els.audio.muted = state.abMode !== 'wet';
  if (els.audioDry) els.audioDry.muted = state.abMode !== 'dry';
  if (els.audioReal) els.audioReal.muted = state.abMode !== 'real';
}
const abChoices = () => (els.abGroup ? [...els.abGroup.querySelectorAll('[data-ab]')] : []);
const canHear = () => !!(state.lastBlob && state.dryBlob && els.audioDry);
// The buttons follow the state: which is pressed, the real take's shown
// only with a take loaded (also after app/realtake.js changes it: updateMeter
// calls this).
function updateAbButtons() {
  if (state.abMode === 'real' && !state.realTake) { state.abMode = 'wet'; setAbMutes(); }
  for (const button of abChoices()) {
    const mode = button.dataset.ab;
    button.hidden = mode === 'real' && !(state.realTake && els.audioReal);
    button.disabled = !canHear();
    button.setAttribute('aria-pressed', String(state.abMode === mode));
    button.classList.toggle('active', state.abMode === mode);
  }
  if (els.abToggle && canHear() && els.abToggle.textContent !== AB_LABELS[state.abMode]) els.abToggle.textContent = AB_LABELS[state.abMode];
}
function setAbMode(mode) {
  if (!canHear() || (mode === 'real' && !(state.realTake && els.audioReal))) return;
  state.abMode = mode;
  setAbMutes();
  syncTwins(true);
  updateAbButtons();
  refreshVisualizer();
}
// The B key: the next version.
function cycleAbMode() {
  const modes = ['wet', 'dry', ...(state.realTake && els.audioReal ? ['real'] : [])];
  setAbMode(modes[(modes.indexOf(state.abMode) + 1) % modes.length]);
}
for (const button of abChoices()) button.addEventListener('click', () => setAbMode(button.dataset.ab));

// The hidden twins of the main player (the render): the original and the real take.
const twins = () => [els.audioDry, els.audioReal].filter(el => el && el.src);
// Keep the twins locked to the main transport.
function syncTwins(force = false) {
  for (const el of twins()) {
    const d = el.duration;
    const t = Math.min(els.audio.currentTime, isFinite(d) && d > 0 ? Math.max(0, d - 0.01) : els.audio.currentTime);
    try {
      if (force || Math.abs(el.currentTime - t) > 0.02) el.currentTime = t;
    } catch (e) { /* metadata not ready yet */ }
  }
}

els.audio.addEventListener('volumechange', () => { for (const el of [els.audioDry, els.audioReal]) if (el) el.volume = els.audio.volume; });
els.audio.addEventListener('ratechange', () => { for (const el of [els.audioDry, els.audioReal]) if (el) el.playbackRate = els.audio.playbackRate; });
