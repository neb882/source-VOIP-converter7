/* Live monitor: the microphone through the TF2 voice chain in real time.
 *
 * live-worklet.js captures 20 ms blocks on the audio thread and plays the
 * result; live-worker.js runs TF2Audio.createLiveChain on them. The two talk
 * over a MessageChannel, so audio never passes through this page. The chain
 * follows the settings panel while running, and the output can go to any
 * output device (a virtual cable makes it a live TF2 voice for other apps).
 *
 * For `steam` the chain is the render's own (W3-11b): Steam's sender and
 * decoder, holding back the sender's longest chunk and its 100 ms pre-roll.
 * Push-to-talk on `steam` is the app's stand-in for the key: the microphone
 * is silenced while the key is up and the gate ends the phrase by its own
 * hold (Steam's own key rules are not built). With push-to-talk off the key
 * counts as held. Low latency on `steam` holds back a chunk and a frame
 * instead, losing 17 to 80 ms of each phrase's 100 ms pre-roll; the figure it
 * saves comes from the chain. The key and the sound reach the worker by
 * separate channels, so a press or release can land about a block off. On the other profiles push-to-talk sends only while the key is held
 * (the gate still applies inside) and low latency drops the frame gate's
 * 120 ms pre-roll. Record this session keeps the microphone and the voice
 * and loads them into the app as the original and its render (mountLiveTake).
 * Needs the app/ page scripts (state, els, renderOptions, logLine, mountLiveTake).
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ui = {
    toggle: $('live-toggle'), panel: $('live-panel'), input: $('live-input'), output: $('live-output'),
    tx: $('live-tx'), mode: $('live-mode'), rate: $('live-rate'), loss: $('live-loss'), latency: $('live-latency'),
    inMeter: $('live-in'), outMeter: $('live-out'), note: $('live-note'),
    record: $('live-record'), ptt: $('live-ptt'), talk: $('live-talk'), lowLatency: $('live-lowlat')
  };
  if (!ui.toggle) return;

  let live = null;   // { ctx, stream, source, node, worker, timer, lastOpts, stats, talking, recording }
  let keyHeld = false, buttonHeld = false;

  // The render settings plus the live-only low-latency switch.
  const liveOptions = () => ({ ...renderOptions(), lowLatency: !!(ui.lowLatency && ui.lowLatency.checked) });
  const pttOn = () => !!(ui.ptt && ui.ptt.checked);

  // The live panel's texts follow the profile (W3-11b): `steam` runs the
  // render's own chain; the others the 20 ms frame gate.
  const texts = {
    steam: {
      latency: 'Microphone to speaker: what the voice chain holds back (Steam\'s longest capture chunk and its 100 ms pre-roll, the codec\'s lookahead, the filters\' waits), the playback queue and the audio device\'s buffers',
      lowLatency: (ms) => `Hold back Steam's longest capture chunk and a frame instead of the chunk and the 100 ms pre-roll. The sender runs as before, but part of each phrase's first 100 ms is not played: 17 to 80 ms of it, about half as a rule. ${ms != null ? `Saves ${ms.toFixed(0)} ms.` : 'Saves the figure shown once the monitor runs.'} Not how TF2 sounds.`,
      lowLabel: (ms) => `Live monitor: low latency (shorter pre-roll${ms != null ? `, saves ${ms.toFixed(0)} ms` : ''})`,
      ptt: 'Send only while V (TF2\'s +voicerecord key) or the Talk button is held. This is the app\'s stand-in for the key: the microphone is silenced while the key is up, and the voice gate ends the phrase by its own hold. Steam\'s own key rules (it goes on sending for half a second after a release) are not built yet.'
    },
    frame: {
      latency: 'Microphone to speaker, including the voice gate\'s 120 ms pre-roll and the audio device\'s buffers',
      lowLatency: () => 'Skip the voice gate\'s 120 ms pre-roll, so the gate opens on the loud frame itself. Not how TF2 sounds: onsets lose their first 120 ms.',
      lowLabel: () => 'Live monitor: low latency (no pre-roll)',
      ptt: 'Send only while V (TF2\'s +voicerecord key) or the Talk button is held, as with push-to-talk in the game. The voice gate still applies while you hold it.'
    }
  };
  // The render's own chain runs only with the codec on: bypassed, `steam` keeps the frame path's texts.
  const steamCodec = () => typeof isSteamRule === 'function' && typeof els !== 'undefined' && isSteamRule(els.codec.value) && els.warble.value === '1';
  function updateTexts() {
    const t = steamCodec() ? texts.steam : texts.frame;
    const saving = live && live.codec === 'steam' ? live.lowLatencySavingMs : null;
    const latency = ui.latency && ui.latency.closest('.live-stat');
    if (latency) latency.title = t.latency;
    const low = ui.lowLatency && ui.lowLatency.closest('label');
    if (low) {
      low.title = t.lowLatency(saving);
      low.lastChild.textContent = ` ${t.lowLabel(saving)}`;
    }
    const ptt = ui.ptt && ui.ptt.closest('label');
    if (ptt) ptt.title = t.ptt;
    const net = ui.loss && ui.loss.closest('.live-stat');
    if (net) net.title = steamCodec() ? 'Frames concealed (lost frames the decoder filled in when the next one arrived) and late (silence), by the network settings'
      : 'Frames lost (concealed) and late (silence) by the network settings';
  }
  document.addEventListener('tf2:settings', updateTexts);

  function updateTalk() {
    const on = !pttOn() || keyHeld || buttonHeld;
    if (ui.talk) { ui.talk.hidden = !pttOn(); ui.talk.classList.toggle('live-held', on && pttOn()); }
    if (!live || live.talking === on) return;
    live.talking = on;
    live.worker.postMessage({ type: 'talk', on });
  }

  // Recording: the worker lines the microphone and the voice up and sends
  // both when it stops (also when the monitor stops mid-recording).
  function setRecordButton() {
    if (!ui.record) return;
    const rec = live && live.recording;
    ui.record.disabled = !live || (live && live.saving);
    ui.record.classList.toggle('live-recording', !!rec);
    ui.record.textContent = live && live.saving ? 'Saving…' : rec
      ? `⏹ Stop recording ${formatClock((performance.now() - rec.started) / 1000)}` : '⏺ Record this session';
  }
  const formatClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function toggleRecording() {
    if (!live || live.saving) return;
    if (!live.recording) {
      live.recording = { started: performance.now() };
      live.worker.postMessage({ type: 'record', on: true });
      logLine('voice_record: recording the live monitor.', 'sys');
    } else {
      live.recording = null;
      live.saving = true;
      live.worker.postMessage({ type: 'record', on: false });
    }
    setRecordButton();
  }

  // The note under the live panel (a status a screen reader hears); an error
  // in the status line's error style (W4-01c).
  function setNote(text, error = false) {
    ui.note.textContent = text;
    ui.note.classList.toggle('error', !!error);
  }

  function deliverRecording(message) {
    if (live) { live.saving = false; live.recording = null; }
    setRecordButton();
    const dry = new Float32Array(message.dry);
    if (dry.length < message.rate * 0.2) { setNote('The recording was too short to keep.'); return; }
    try {
      mountLiveTake({ dry, wet: new Float32Array(message.wet), rate: message.rate, frameLog: new Uint8Array(message.frameLog),
        counts: message.counts, info: message.info });
      setNote(`Loaded ${(dry.length / message.rate).toFixed(1)} s of the live session: Hear switches between the voice and your microphone.`);
    } catch (error) {
      setNote(`Could not load the recording: ${error.message}`, true);
    }
  }

  const dbfs = (peak) => (peak > 0 ? 20 * Math.log10(peak) : -Infinity);
  // The bar is a meter (role="meter", W4-01c) whose value, the peak in dBFS
  // from -60 to 0, is told to a screen reader at most twice a second.
  const setMeter = (el, peak, now = false) => {
    if (!el) return;
    const db = dbfs(peak), bar = el.parentElement;
    el.style.width = `${Math.max(0, Math.min(100, (db + 60) / 60 * 100))}%`;
    el.classList.toggle('live-hot', db > -1);
    bar.title = Number.isFinite(db) ? `${db.toFixed(1)} dBFS peak` : 'silence';
    const t = performance.now();
    if (!now && t - (bar.ariaAt || -Infinity) < 500) return;
    bar.ariaAt = t;
    const shown = Number.isFinite(db) ? Math.round(Math.max(-60, Math.min(0, db)) * 10) / 10 || 0 : -60;
    bar.setAttribute('aria-valuenow', String(shown));
    bar.setAttribute('aria-valuetext', Number.isFinite(db) ? `${shown.toFixed(1)} dBFS` : 'silence');
  };

  async function listDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const fill = (select, kind, fallback) => {
      if (!select) return;
      const current = select.value;
      select.replaceChildren(...[{ deviceId: '', label: fallback }, ...devices.filter(d => d.kind === kind && d.deviceId && d.deviceId !== 'default')]
        .map((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || `${kind} ${i}`; return o; }));
      if ([...select.options].some(o => o.value === current)) select.value = current;
    };
    fill(ui.input, 'audioinput', 'Default microphone');
    fill(ui.output, 'audiooutput', 'Default output');
  }

  function stopLive(message) {
    if (!live) return;
    const l = live;
    live = null;
    clearInterval(l.timer);
    try { l.node.port.postMessage({ type: 'stop' }); } catch (e) { /* closed */ }
    // A recording in progress is finished and delivered before the worker goes.
    const saving = !!(l.recording || l.saving);
    try { if (l.recording) l.worker.postMessage({ type: 'record', on: false }); } catch (e) { /* closed */ }
    try { l.worker.postMessage({ type: 'stop' }); } catch (e) { /* closed */ }
    setTimeout(() => l.worker.terminate(), saving ? 5000 : 500);
    setRecordButton();
    l.stream.getTracks().forEach(t => t.stop());
    l.source.disconnect();
    l.node.disconnect();
    l.ctx.close().catch(() => {});
    ui.toggle.textContent = '🎧 Live';
    ui.toggle.setAttribute('aria-pressed', 'false');
    ui.tx.textContent = '○ off';
    ui.tx.className = 'live-tx';
    setMeter(ui.inMeter, 0, true); setMeter(ui.outMeter, 0, true);
    // Not "Live." once it has stopped (W4-01c).
    setNote(message || 'Stopped.', !!message && /failed/.test(message));
    logLine('voice_loopback: live monitor stopped.', 'sys');
  }

  async function startLive() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      ui.panel.hidden = false;
      setNote('The live monitor needs microphone access over HTTPS (or localhost) and AudioWorklet support.', true);
      return;
    }
    ui.panel.hidden = false;
    ui.toggle.disabled = true;
    setNote('Starting… Use headphones: speakers feed the output back into the microphone.');
    let stream, ctx;
    try {
      // The raw microphone, as the game's capture gets it: no browser
      // echo cancellation, noise suppression or gain control.
      stream = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: ui.input && ui.input.value ? { exact: ui.input.value } : undefined,
        channelCount: { ideal: 2 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .catch((error) => { error.microphone = true; throw error; });
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      if (ui.output && ui.output.value && ctx.setSinkId) await ctx.setSinkId(ui.output.value);
      await ctx.audioWorklet.addModule('live-worklet.js');
      const opts = liveOptions();
      const node = new AudioWorkletNode(ctx, 'tf2-live-monitor', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 2, channelCountMode: 'explicit',
        processorOptions: { block: Math.round(ctx.sampleRate / 50), channel: opts.captureChannel, prebuffer: Math.round(ctx.sampleRate * 0.04) } });
      const worker = new Worker('live-worker.js');
      const bridge = new MessageChannel();
      node.port.postMessage({ type: 'bridge', port: bridge.port1 }, [bridge.port1]);
      worker.postMessage({ type: 'start', port: bridge.port2, opts, rate: ctx.sampleRate }, [bridge.port2]);
      const source = ctx.createMediaStreamSource(stream);
      source.connect(node);
      node.connect(ctx.destination);
      if (els.audio && !els.audio.paused) els.audio.pause();
      live = { ctx, stream, source, node, worker, lastOpts: JSON.stringify(opts), channel: opts.captureChannel,
        stats: null, worklet: null, lastBytes: 0, lastTime: performance.now(), talking: true, recording: null, saving: false };
      worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.type === 'recording') deliverRecording(data);
        else onWorker(data);
      };
      updateTalk();
      setRecordButton();
      worker.onerror = (event) => stopLive(`The live chain failed: ${event.message || 'worker error'}`);
      node.port.onmessage = (event) => { if (live && event.data && event.data.type === 'stats') live.worklet = event.data; };
      // Follow the settings panel (presets included) while live.
      live.timer = setInterval(() => {
        if (!live) return;
        const now = liveOptions(), key = JSON.stringify(now);
        if (key === live.lastOpts) return;
        live.lastOpts = key;
        if (now.captureChannel !== live.channel) { live.channel = now.captureChannel; node.port.postMessage({ type: 'channel', channel: now.captureChannel }); }
        worker.postMessage({ type: 'config', opts: now });
      }, 300);
      ui.toggle.textContent = '⏹ Stop live';
      ui.toggle.setAttribute('aria-pressed', 'true');
      setNote('Live. Settings changes apply as you make them; a change of room cross-fades as the game does.');
      logLine(`voice_loopback 1: live monitor at ${ctx.sampleRate} Hz.`, 'sys');
      listDevices().catch(() => {});
    } catch (error) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (ctx) ctx.close().catch(() => {});
      live = null;
      // A microphone the browser refused or does not have: what to do, by the
      // error's name; anything else, the browser's own message.
      setNote((error && error.microphone && typeof microphoneRefusal === 'function' && microphoneRefusal(error, 'Live'))
        || `Could not start the live monitor: ${error.message}`, true);
    } finally {
      ui.toggle.disabled = false;
    }
  }

  function onWorker(message) {
    if (!live) return;
    if (message.type === 'error') { stopLive(`The live chain failed: ${message.message}`); return; }
    if (message.type === 'ready') {
      live.chainLatencyMs = message.latencyMs;
      live.codec = message.codec;
      live.lowLatencySavingMs = message.lowLatencySavingMs;
      updateTexts();
      return;
    }
    if (message.type !== 'stats') return;
    const s = message.stats, w = live.worklet;
    const now = performance.now(), seconds = (now - live.lastTime) / 1000;
    const kbps = live.stats && seconds > 0 ? (s.bytes - live.stats.bytes) * 8 / seconds / 1000 : 0;
    live.stats = s; live.lastTime = now;
    const sending = s.gateOpen;
    ui.tx.textContent = sending ? '● TX' : s.talking === false ? '○ push-to-talk' : '○ gate closed';
    ui.tx.className = `live-tx${sending ? ' live-on' : ''}`;
    ui.mode.textContent = !sending ? '—' : { silk: 'SILK', hybrid: 'Hybrid', celt: 'CELT', speex: 'Speex', vr12: 'VR12', dtx: 'DTX (comfort noise)' }[s.lastMode] || '—';
    ui.rate.textContent = `${kbps.toFixed(1)} kbps`;
    // Steam's decoder conceals a gap when the next frame arrives: `steam`
    // counts the frames it concealed (frames lost at a spurt's end are never
    // played, nor counted).
    ui.loss.textContent = `${s.lost} ${s.codec === 'steam' ? 'concealed' : 'lost'} · ${s.late} late`;
    if (w) {
      // Mic to speaker: half a 20 ms capture block on average, the chain's own
      // delay (for `steam` what it holds back: the sender's longest chunk and
      // its pre-roll, the lookahead, the filters' and resamplers' waits; for
      // the others the gate's pre-roll, capture EQ and lookahead), the jitter
      // buffer and the audio device's buffers.
      const device = ((live.ctx.baseLatency || 0) + (live.ctx.outputLatency || 0)) * 1000;
      const ms = 10 + (s.latencyMs || live.chainLatencyMs || 0) + w.queued / live.ctx.sampleRate * 1000 + device;
      ui.latency.textContent = `${Math.max(0, ms).toFixed(0)} ms${w.underruns ? ` · ${w.underruns} dropout${w.underruns === 1 ? '' : 's'}` : ''}`;
    }
    setMeter(ui.inMeter, s.inputPeak);
    setMeter(ui.outMeter, s.outputPeak);
    if (live.recording) {
      // The app holds up to MAX_AUDIO_SECONDS of source.
      if ((performance.now() - live.recording.started) / 1000 > MAX_AUDIO_SECONDS - 1) toggleRecording();
      else setRecordButton();
    }
  }

  // Push-to-talk: V (TF2's +voicerecord default) or the on-screen button.
  // Not while typing: text fields and selects keep V.
  const typing = (target) => target && (target.isContentEditable || /^(TEXTAREA|SELECT)$/.test(target.tagName)
    || (target.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|reset|file|color)$/.test(target.type)));
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyV' || !live || !pttOn() || typing(event.target)) return;
    event.preventDefault();
    if (!event.repeat) { keyHeld = true; updateTalk(); }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code !== 'KeyV' || !keyHeld) return;
    keyHeld = false;
    updateTalk();
  });
  window.addEventListener('blur', () => { keyHeld = false; buttonHeld = false; updateTalk(); });
  if (ui.talk) {
    const release = () => { if (buttonHeld) { buttonHeld = false; updateTalk(); } };
    ui.talk.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      try { ui.talk.setPointerCapture(event.pointerId); } catch (e) { /* not capturable */ }
      buttonHeld = true;
      updateTalk();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) ui.talk.addEventListener(type, release);
  }
  if (ui.ptt) ui.ptt.addEventListener('change', updateTalk);
  if (ui.record) ui.record.addEventListener('click', toggleRecording);

  ui.toggle.addEventListener('click', () => (live ? stopLive() : startLive()));
  if (ui.input) ui.input.addEventListener('change', () => { if (live) { stopLive(); startLive(); } });
  if (ui.output) {
    if (!(window.AudioContext && AudioContext.prototype.setSinkId)) {
      ui.output.disabled = true;
      ui.output.title = 'This browser cannot choose an output device for web audio; it plays on the default output.';
    }
    ui.output.addEventListener('change', () => {
      if (live && live.ctx.setSinkId) live.ctx.setSinkId(ui.output.value).catch(error => { setNote(`Could not switch output: ${error.message}`, true); });
    });
  }
  window.addEventListener('pagehide', () => stopLive());
  updateTalk();
  updateTexts();
  window.TF2Live = { start: startLive, stop: stopLive, record: toggleRecording, get running() { return !!live; },
    get stats() { return live && live.stats; }, get recording() { return !!(live && live.recording); },
    talk(on) { buttonHeld = !!on; updateTalk(); } };
})();
