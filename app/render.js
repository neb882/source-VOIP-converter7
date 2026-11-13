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
// The console's output stays aria-live="off", open or not (W4-01c): the
// simulated game feed would be read out without end. What a typed command
// answers is put in its hidden status (consoleAnswer, app/console.js).

// Whether jobs can run in audio-worker.js (not from file://).
function canUseWorker() {
  return typeof Worker !== 'undefined' && location.protocol !== 'file:';
}

const abortedError = () => {
  const error = new Error('Audio processing cancelled.');
  error.name = 'AbortError';
  return error;
};

// One job in a worker of its own, as before W4-01b (the batch's lanes).
// Returns { promise, cancel }: the promise resolves with the worker's
// reply; cancel() terminates the worker and rejects with an AbortError.
function startOwnWorker(message, transfer, onProgress) {
  const worker = new Worker('audio-worker.js');
  const id = ++state.processId;
  let cancel;
  const promise = new Promise((resolve, reject) => {
    let done = false;
    const finish = () => { done = true; worker.terminate(); };
    cancel = () => {
      if (done) return;
      finish();
      reject(abortedError());
    };
    worker.onmessage = (event) => {
      const reply = event.data || {};
      if (reply.id !== id || done) return;
      if (reply.type === 'progress') {
        if (onProgress) onProgress(reply.value);
      } else if (reply.type === 'error') {
        finish();
        reject(new Error(reply.message || 'Audio worker failed.'));
      } else if (reply.type !== 'done' && reply.type !== 'meter') {
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

// The page's worker (W4-01b): one worker, kept between jobs, for the page's
// renders, the download formats, the meter and the real take's jobs, one
// job at a time. A render asked for while it is busy waits for it (its
// stages are there), before any other job waiting. Another job is started a
// moment after it is asked for (so a render asked for in the same moment
// comes first) and waits too while the worker renders; while the worker
// runs a job that is not a render, it goes to a worker of its own, as every
// job did before W4-01b. Cancel asks the worker to stop the render and keeps
// it (the render ends at its next yield); a worker still busy after the
// cancel bound is ended, as every cancel ended it before, and the next job
// starts a new one. The bound is CANCEL_BOUND_MS and CANCEL_BOUND_PER_SECOND_MS
// for each second of the source: the longest stretch of a render between two
// yields (the capture's resampling and filter, the output stage) grows with
// the source, about 11 ms a second (W4-01b's report), and a worker ended
// takes its stages with it. A job's reply settles its promise; the worker's
// `done` frees it for the next job (a render's meter comes between the two).
const CANCEL_BOUND_MS = 500, CANCEL_BOUND_PER_SECOND_MS = 15;
const pageWorker = { worker: null, running: null, queue: [], timer: 0, held: null };

function pageWorkerInstance() {
  if (pageWorker.worker) return pageWorker.worker;
  const worker = new Worker('audio-worker.js');
  worker.onmessage = (event) => {
    if (worker !== pageWorker.worker) return;
    const reply = event.data || {}, job = pageWorker.running;
    if (!job || reply.id !== job.id) return;
    if (reply.type === 'progress') { if (!job.settled && job.onProgress) job.onProgress(reply.value); }
    else if (reply.type === 'preview') { if (!job.settled && job.onPreview) job.onPreview(reply); }
    else if (reply.type === 'meter') { if (job.onMeter) job.onMeter(reply.stats); }
    else if (reply.type === 'done') endPageJob(job);
    else if (reply.type === 'error') {
      const error = new Error(reply.message || 'Audio worker failed.');
      if (reply.name === 'AbortError') error.name = 'AbortError';
      settlePageJob(job, error);
    } else settlePageJob(job, null, reply);
  };
  worker.onerror = (event) => {
    if (worker !== pageWorker.worker) return;
    const job = pageWorker.running;
    dropPageWorker();
    if (job) {
      settlePageJob(job, new Error(event.message || 'Audio worker could not start.'));
      endPageJob(job);
    }
  };
  pageWorker.worker = worker;
  return worker;
}

// The worker is ended: a cancelled job that did not stop in time, or one
// that failed to start or broke. The next job makes a new one.
function dropPageWorker() {
  if (pageWorker.worker) pageWorker.worker.terminate();
  pageWorker.worker = null;
  pageWorker.held = null;
}

function settlePageJob(job, error, reply) {
  if (job.settled) return;
  job.settled = true;
  if (error) job.reject(error); else job.resolve(reply);
}

// The running job is over (its `done`, or its worker ended): the next one starts.
function endPageJob(job) {
  if (pageWorker.running !== job) return;
  clearTimeout(pageWorker.timer);
  pageWorker.timer = 0;
  pageWorker.running = null;
  settlePageJob(job, new Error('Audio worker failed.'));
  if (job.onEnd) job.onEnd();
  pumpPageWorker();
}

function pumpPageWorker() {
  if (pageWorker.running || !pageWorker.queue.length) return;
  const job = pageWorker.queue.shift();
  pageWorker.running = job;
  try {
    const worker = pageWorkerInstance();
    if (job.prepare) job.prepare(worker);
    worker.postMessage(job.message, job.transfer || []);
  } catch (error) {
    dropPageWorker();
    settlePageJob(job, error);
    endPageJob(job);
  }
}

// A job for the page's worker. Returns { promise, cancel }, as
// startOwnWorker does. options: { render, onProgress, onPreview, onMeter,
// onEnd, prepare(worker), bound (ms; CANCEL_BOUND_MS if none) }.
function startPageJob(message, transfer, options = {}) {
  const id = ++state.processId;
  const job = { id, message: { ...message, id }, transfer, settled: false, ...options };
  job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
  job.cancel = () => cancelPageJob(job);
  if (job.render) {
    const at = pageWorker.queue.findIndex((other) => !other.render);
    pageWorker.queue.splice(at < 0 ? pageWorker.queue.length : at, 0, job);
    pumpPageWorker();
  } else {
    setTimeout(() => {
      if (job.settled) return;
      const busy = pageWorker.running;
      if (busy && !busy.render) {
        job.own = startOwnWorker(message, transfer, job.onProgress);
        job.own.promise.then((reply) => settlePageJob(job, null, reply), (error) => settlePageJob(job, error));
      } else {
        pageWorker.queue.push(job);
        pumpPageWorker();
      }
    }, 0);
  }
  return { promise: job.promise, cancel: job.cancel };
}

function cancelPageJob(job) {
  if (job.settled) return;
  if (job.own) { job.own.cancel(); return; }
  const queued = pageWorker.queue.indexOf(job);
  if (queued >= 0) pageWorker.queue.splice(queued, 1);
  settlePageJob(job, abortedError());
  if (pageWorker.running !== job) return;
  pageWorker.worker.postMessage({ type: 'cancel', id: job.id });
  const bound = Math.round(job.bound || CANCEL_BOUND_MS);
  pageWorker.timer = setTimeout(() => {
    if (pageWorker.running !== job) return;
    logLine(`S_StopSound: the render did not stop within ${bound} ms of the cancel; its worker was ended.`, 'warn');
    dropPageWorker();
    endPageJob(job);
  }, bound);
}

// A job in the page's worker (the download formats, the meter, the real
// take's jobs): { promise, cancel }.
function startWorker(message, transfer, onProgress) {
  return startPageJob(message, transfer, { onProgress });
}

// A render's reply as the page uses it.
const renderReply = (reply, stats) => ({
  samples: new Float32Array(reply.samples),
  sampleRate: reply.sampleRate,
  blob: reply.blob,
  realOpus: reply.realOpus,
  codecInfo: reply.codecInfo,
  stats
});

// One render in a worker of its own, as { promise, cancel }: the batch's.
// The result carries the render's loudness and levels (meter.js) as `stats`.
function startWorkerJob(source, opts) {
  const mono = source.getChannelData(0).slice();
  const workerOpts = { ...opts };
  delete workerOpts.onProgress;
  const job = startOwnWorker({ type: 'process', sampleRate: source.sampleRate, samples: mono.buffer, opts: workerOpts, measure: true },
    [mono.buffer], opts.onProgress);
  return { cancel: job.cancel, promise: job.promise.then((reply) => renderReply(reply, reply.stats)) };
}

// The id the page's worker holds a source by (W4-01b): the source on the
// page (a new one for every file, recording and demo speaker) and the
// channel the render captures from it (captureSource).
const sourceNumbers = new WeakMap();
let sourceCount = 0;
function workerSourceId(source, channel) {
  if (!sourceNumbers.has(source)) sourceNumbers.set(source, ++sourceCount);
  const used = !source.left || channel === 'mix' ? 'mix' : channel === 'right' ? 'right' : 'left';
  return `${sourceNumbers.get(source)}:${used}`;
}

// The page's render, in the page's worker, of the captured source
// `captured` known by `sourceId`: its samples go to the worker once, before
// its first render there, and the worker keeps the stages of its renders
// (A and B, engine/render.js) for the next. The result comes as soon as the worker
// has it; its loudness and levels follow in a message of their own (stats:
// a promise of them, which the meter takes when it comes; if the worker ends
// before, the meter measures the render itself).
function processInWorker(captured, opts, sourceId, { onPreview = null } = {}) {
  const workerOpts = { ...opts };
  delete workerOpts.onProgress;
  let measured, failed;
  const stats = new Promise((resolve, reject) => { measured = resolve; failed = reject; });
  stats.catch(() => {});
  const prepare = (worker) => {
    if (pageWorker.held === sourceId) return;
    const mono = captured.getChannelData(0).slice();
    worker.postMessage({ type: 'source', sourceId, sampleRate: captured.sampleRate, samples: mono.buffer }, [mono.buffer]);
    pageWorker.held = sourceId;
  };
  const job = startPageJob({ type: 'process', sourceId, opts: workerOpts, meterAfter: true,
    ...(onPreview ? { preview: { seconds: PREVIEW_RENDER_SECONDS, keep: PREVIEW_SECONDS } } : {}) }, [],
    { render: true, prepare, bound: CANCEL_BOUND_MS + CANCEL_BOUND_PER_SECOND_MS * captured.length / captured.sampleRate,
      onProgress: opts.onProgress, onMeter: (value) => measured(value), onEnd: () => failed(new Error('no meter')),
      onPreview: onPreview ? (reply) => onPreview({ blob: reply.blob, sampleRate: reply.sampleRate, seconds: reply.seconds }) : null });
  state.cancelProcessing = job.cancel;
  return job.promise.then((reply) => {
    const result = renderReply(reply, null);
    result.stats = stats.catch(() => analyzeCopy(result.samples, result.sampleRate));
    return result;
  }).finally(() => {
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
// codec control holds, and the sender's settings, which a render of voice
// already received does not read (audio.js, opts.received), are left out:
// changing them does not render a demo again.
const DEMO_IGNORES = ['captureChannel', 'micGain', 'hp', 'lp', 'bits', 'gate', 'gateThresholdDb', 'steamUptime', 'lossPct', 'jitterMs', 'frameMs'];
function settingsKey(demo = null) {
  const opts = sourceRenderOptions(demo);
  if (demo) {
    opts.codec = demo.codecKey;
    for (const name of DEMO_IGNORES) delete opts[name];
  }
  return JSON.stringify(opts);
}

// The options of a render on the file's own timing (W3-02d-1): the
// timeline, and no frame rate or voice_buffer_ms, which the engine reads only
// on the game's.
const SOURCE_TIMING = { timeline: 'source', fps: undefined, bufferMs: undefined };

// renderOptions() for the source on the page (W3-02d-1): renderOptions()
// reads the controls only (the batch shares it), and here the sources that
// keep the file's own timing whatever Phrase timing says do so. A demo's
// voice (the engine refuses the game's timeline with opts.received; W3-02g,
// not built yet, lifts that) and a source from a video file (the sound would
// lead the picture). The key a render is kept by is made from these too
// (settingsKey), so no key holds a frame rate under the file's own timing.
function sourceRenderOptions(demo = state.sourceDemo) {
  const opts = renderOptions();
  if (opts.timeline === 'game' && (demo || state.sourceFromVideo)) Object.assign(opts, SOURCE_TIMING);
  return opts;
}

// A number control's value, or `fallback` when it holds no number above 0
// (a blank control).
function controlNumber(el, fallback) {
  const n = Number(el.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// The render settings of the current controls (everything but progress).
function renderOptions() {
  // W3-02d-1: the game's voice queue (Phrase timing) runs for Steam voice
  // with its codec on; anything else keeps the file's own timing, with no
  // frame rate or voice_buffer_ms sent, so a change of either changes no
  // sample and no key (as gateThresholdDb and steamUptime below).
  const game = els.codec.value === 'steam' && els.warble.value === '1' && els.timeline.value === 'game';
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
    maxGain:     Number(els.maxGain.value),
    avgGain:     Number(els.avgGain.value),
    gate:        els.vad.value === 'auto' ? null : els.vad.value === '1',
    // At the profile's own default (-40 for `steam`: Steam's 1% of full
    // scale, 327.67, exactly; -39.5 for the others) the page sends no number,
    // so the key a render is cached and batched by does not change at a
    // default; a number otherwise (W3-11b).
    // A blank control (or one that holds no number) is the profile's own too,
    // as the engine reads it (gateThresholdDb() in engine/codec.js), not 0 dBFS.
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
    jitterMs:    Number(els.jitter.value),
    // The listener's frame rate (fps_max) and voice_buffer_ms, the module's
    // defaults where a control is blank (voice-channel.js limits both).
    timeline:    game ? 'game' : 'source',
    fps:         game ? controlNumber(els.fps, TF2VoiceChannel.VOICE_CHANNEL.fps) : undefined,
    bufferMs:    game ? controlNumber(els.bufferMs, TF2VoiceChannel.VOICE_CHANNEL.bufferMs) : undefined
  };
}

async function runAudioProcess(source, opts, { onPreview = null } = {}) {
  const sourceId = workerSourceId(source, opts.captureChannel);
  source = captureSource(source, opts.captureChannel);
  if (canUseWorker()) {
    try {
      return await processInWorker(source, opts, sourceId, { onPreview });
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
// (crc: CRC-32 for ZIP archives). Runs in a worker when it can: the page's
// (startWorker), or with `own` one of its own, as the batch's files are made
// (W4-01b: the batch keeps its own lanes, so a page render never waits
// behind them and they never wait behind a page render).
async function exportWav(wavBlob, format, { own = false } = {}) {
  const { mime } = TF2Formats.FORMATS[format];
  const wav = await wavBlob.arrayBuffer();
  if (canUseWorker()) {
    const reply = await (own ? startOwnWorker : startWorker)({ type: 'export', wav, format }, [wav]).promise;
    return { blob: new Blob([reply.bytes], { type: mime }), crc: reply.crc };
  }
  const bytes = await TF2Formats.fromWav(new Uint8Array(wav), format);
  return { blob: new Blob([bytes], { type: mime }), crc: TF2Zip.crc32(bytes) };
}

// exportWav with the result kept per format in `cache`; a failure is not kept.
function cachedExport(cache, wavBlob, format, options = {}) {
  if (!cache[format]) {
    cache[format] = exportWav(wavBlob, format, options);
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
    logLine('S_Voice: vaudio_miles is not a TF2 codec (Source engines of 2006 and 2007); its codec was checked against one recording of a 2006 engine; the rest of the profile was not', 'sys');
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
  // W3-02d-1: a render on the game's timeline, from the receiver's voice
  // channel (voice-channel.js): the frame rate, the wait (its ticks of 15 ms,
  // the packet's own tick among them, so the wait is one tick less), the
  // phrases that opened the channel and those that joined a running one, and
  // the sound dropped to overflow.
  if (codecInfo.channel) {
    const ch = codecInfo.channel, tick = TF2VoiceChannel.VOICE_CHANNEL.tick, rate = TF2VoiceChannel.VOICE_CHANNEL.rate;
    logLine(`S_Voice: the game's voice queue at fps_max ${ch.fps}, voice_buffer_ms ${ch.bufferMs}: a new phrase waits ${ch.waitTicks} ticks `
      + `(${Math.round((ch.waitTicks - 1) * tick * 1000)} ms); ${ch.opens} phrase${ch.opens === 1 ? '' : 's'} opened the channel, `
      + `${ch.appended} joined a running one; ${Math.round(1000 * ch.droppedSamples / rate)} ms dropped to overflow`, 'sys');
  }

  // A render that replaces a render of the same source keeps the place:
  // the player's position (clamped to the new length), whether it plays,
  // and which version is heard (W4-01a, item 4). A new source starts at 0
  // on the render, paused.
  const source = made.source || state.decodedSource;
  const keep = (!!state.lastBlob && state.renderedSource === source) || (!!state.preview && state.preview.source === source);
  const place = keep ? { at: els.audio.currentTime, playing: !els.audio.paused, mode: state.abMode } : null;
  dropPreview();

  state.processedBuffer = samples;
  state.processedRate   = sampleRate;
  if (stats) meterResults.set(bufferId(samples), Promise.resolve(stats));
  if (state.lastBlob) URL.revokeObjectURL(state.lastBlob);
  state.lastBlob = URL.createObjectURL(blob);
  state.lastWav = blob;
  state.lastExports = {};
  state.renderedSource = source;
  state.renderedKey = made.key !== undefined ? made.key : settingsKey(state.sourceDemo);
  // A recorded live take is held back from a render by itself, as a render
  // the user cancelled is (W3-02d-1): it was made on the file's own timing,
  // and with Phrase timing on the game's queue the controls' key is another;
  // only a change of the settings, or Render, renders it. The take is what
  // the person just made.
  state.cancelledKey = made.live ? currentRenderKey() : null;
  state.cancelledSource = made.live ? source : null;

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
  updateHearTimeline();
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

/* ------------------------------------------------------------------ */
/* The first seconds (W4-01b, step 3)                                 */
/* ------------------------------------------------------------------ */

// A source longer than PREVIEW_MIN_SECONDS, at settings that allow it
// (TF2Audio.previewAllowed: tests/stages.verify.mjs shows those first
// seconds are the whole render's, sample for sample), first gets a render of
// its first PREVIEW_RENDER_SECONDS, of which the player is given the first
// PREVIEW_SECONDS while the rest renders. Only the player and the status line
// under it change: the downloads, the views and the table wait for the
// whole render, which then takes the player's place at its position and
// play state (presentRender). A render that stops before (cancelled, failed,
// replaced) gives the player back what it held.
const PREVIEW_MIN_SECONDS = 30, PREVIEW_RENDER_SECONDS = 15, PREVIEW_SECONDS = 14;
const PREVIEW_TEXT = `The first ${PREVIEW_SECONDS} s; the rest is rendering…`;
const previewWanted = (source, opts) => canUseWorker() && source.duration > PREVIEW_MIN_SECONDS && TF2Audio.previewAllowed(opts);

// The first seconds of the render now running of `source` into the player.
function showPreview(source, { blob }) {
  if (!state.processing || state.decodedSource !== source) return;
  const first = state.renderedSource !== source && !state.preview;
  const held = (state.lastBlob && state.renderedSource === source) || (state.preview && state.preview.source === source);
  const place = held && els.audio.getAttribute('src') ? { at: els.audio.currentTime, playing: !els.audio.paused } : null;
  dropPreview();
  state.preview = { source, url: URL.createObjectURL(blob) };
  els.audio.src = state.preview.url;
  if (place) {
    els.audio.addEventListener('loadedmetadata', () => {
      if (!state.preview || els.audio.getAttribute('src') !== state.preview.url) return;
      const d = els.audio.duration;
      try { els.audio.currentTime = Math.min(place.at, isFinite(d) && d > 0 ? Math.max(0, d - 0.01) : place.at); } catch (e) { /* not seekable yet */ }
      syncTwins(true);
      if (place.playing) els.audio.play().catch(() => {});
    }, { once: true });
  }
  setRenderStatus(PREVIEW_TEXT);
  logLine(`S_StartSound: the first ${PREVIEW_SECONDS} s are ready to play; the rest is rendering.`, 'sys');
  if (first) revealPlayer('scroll');
}

// Let the first seconds go (the whole render replaces them, or the render
// stopped). Without `restore` the caller sets the player.
function dropPreview({ restore = false } = {}) {
  if (!state.preview) return;
  const { url } = state.preview;
  state.preview = null;
  if (restore && els.audio.getAttribute('src') === url) {
    if (state.lastBlob && state.renderedSource === state.decodedSource) {
      const place = { at: els.audio.currentTime, playing: !els.audio.paused };
      els.audio.src = state.lastBlob;
      els.audio.addEventListener('loadedmetadata', () => {
        if (els.audio.getAttribute('src') !== state.lastBlob) return;
        try { els.audio.currentTime = place.at; } catch (e) { /* not seekable yet */ }
        syncTwins(true);
        if (place.playing) els.audio.play().catch(() => {});
      }, { once: true });
    } else {
      els.audio.pause();
      els.audio.removeAttribute('src');
      els.audio.load();
    }
  }
  URL.revokeObjectURL(url);
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
// A demo's frames with no packet are not only the gate's (a key released
// counts too): "N s with no voice packets".
function renderedStatus(samples, sampleRate, took, codecName, codecInfo) {
  const frame = (codecInfo && codecInfo.frameMs) || 20;
  const unsent = codecInfo && codecInfo.gatedFrames > 0 ? (codecInfo.gatedFrames * frame / 1000).toFixed(2) : null;
  const held = unsent === null ? '' : codecInfo.backend === 'demo' ? ` · ${unsent} s with no voice packets` : ` · ${unsent} s not sent (too quiet for the gate)`;
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
  // The monitor keeps the file's own timing (live.js, liveOptions), and so
  // the take's key is the page's on the file's own timing (W3-02d-1).
  presentRender({ samples: wet, sampleRate: rate, blob: TF2Audio.encodeWav(wet, rate), realOpus: !!info.realOpus, codecInfo }, 0, info.codec || 'steam',
    { source: state.decodedSource, key: JSON.stringify({ ...renderOptions(), ...SOURCE_TIMING }), live: true,
      codecName: codecNameFor(info.codec || 'steam', { skipped: !info.realOpus }) });
}

// W3-02d-1: the line beside Hear, shown while the render on screen was made
// on the game's timeline (its codecInfo has the channel's), whatever the
// controls say now.
function updateHearTimeline() {
  if (els.hearTimeline) els.hearTimeline.hidden = !(state.lastCodecInfo && state.lastCodecInfo.channel);
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
  // A render the user cancelled, or one that failed, is not started again by
  // itself: only a change to other settings, or the button, starts one.
  const cancelled = state.cancelledSource === state.decodedSource && key === state.cancelledKey;
  const short = state.decodedSource.duration <= AUTO_RENDER_SECONDS && !cancelled;
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
const LIVE_HELD_TEXT = 'on the file\'s own timing; Render gives it on the game\'s voice queue';
function updateStale() {
  const coming = autoRenderTimer || renderAfter || (state.processing && state.renderingKey === (state.decodedSource ? currentRenderKey() : null));
  const stale = !!(state.lastWav && state.decodedSource && state.renderedSource === state.decodedSource
    && state.renderedKey !== currentRenderKey() && !coming);
  const was = state.stale;
  state.stale = stale;
  for (const el of [els.vizContainer, els.vizLegend, els.meter]) if (el) el.classList.toggle('stale', stale);
  if (!state.processing) els.process.textContent = stale ? 'Render again' : 'Render';
  updateDownloadLabel();
  // A recorded live take held back (presentRender), with no setting changed
  // since: its own line says how it was made (W3-02d-1).
  const heldTake = stale && state.lastCodecInfo && state.lastCodecInfo.live
    && state.cancelledSource === state.decodedSource && state.cancelledKey === currentRenderKey();
  if (stale) setRenderStatus(heldTake ? `${state.lastRenderStatus} · ${LIVE_HELD_TEXT}` : STALE_TEXT, 'stale');
  else if (was && els.renderStatus && els.renderStatus.classList.contains('stale')) setRenderStatus(state.lastRenderStatus || '');
}

async function runRender({ button }) {
  const source = state.decodedSource;
  state.processing = true;
  // A demo's voice arrives already coded: only the receiver runs, with the
  // demo's own codec (audio.js opts.received).
  const demo = state.sourceDemo;
  const key = currentRenderKey();
  state.renderingKey = key;
  // The line under Phrase timing follows the source too (a demo's is set
  // once its packets are in place, after the source was mounted).
  updateTimelineNote();
  document.dispatchEvent(new Event('tf2:busy'));
  els.process.disabled = true;
  els.dl.disabled = true;
  els.file.disabled = true;
  // A render started by a change of the settings must not hold a microphone
  // recording that is running: its stop stays usable.
  const micHeld = !!els.mic && !state.recorder;
  if (micHeld) els.mic.disabled = true;
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
      // A demo's voice and a video keep the file's own timing (W3-02d-1).
      ...sourceRenderOptions(demo),
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
    const result = await runAudioProcess(source, opts,
      { onPreview: previewWanted(source, opts) ? (preview) => showPreview(source, preview) : null });
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
      if (!superseded) {
        setRenderStatus('Render cancelled. The source is still loaded.');
        state.cancelledKey = key;
        state.cancelledSource = source;
      }
      else if (dropRunning) setRenderStatus(state.lastRenderStatus || '');
    } else {
      console.error(e);
      logLine(`render failed: ${e.message}`, 'err');
      setRenderStatus(`The render failed: ${e.message}`, 'error');
      // Not tried again by itself: the same settings would fail the same way.
      state.cancelledKey = key;
      state.cancelledSource = source;
    }
  } finally {
    // The first seconds of a render that did not finish give the player back.
    dropPreview({ restore: true });
    state.processing = false;
    state.renderingKey = null;
    state.cancelProcessing = null;
    els.process.disabled = !state.decodedSource;
    els.dl.disabled = !state.lastWav;
    els.file.disabled = false;
    if (micHeld) els.mic.disabled = false;
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
/* Hear: the render, the original or a real take                      */
/* ------------------------------------------------------------------ */

// Hear plays the render ('wet'), the original ('dry') or, with a real take
// loaded, the take ('real'). All versions play in sync; switching is an
// instant mute swap, with no re-buffering. B cycles them.
const AB_LABELS = { wet: 'Hearing the render', dry: 'Hearing the original', real: 'Hearing the real take' };
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
