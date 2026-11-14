/* TF2 Voice Emulator, app/realtake.js: Checking a render against a real TF2 take.
 * One of the page scripts that were script.js, loaded in order by
 * index.html (core, console, source, render, meter, realtake,
 * visualizer, netgraph, boot); they share their top-level names. */

/* ------------------------------------------------------------------ */
/* Real take (reference.js)                                           */
/*                                                                    */
/* A real TF2 recording of the loaded source (voice_loopback) is      */
/* found in the source and put on its timeline, offset and clock      */
/* drift corrected. It becomes the third version of A/B, joins the    */
/* views and the meter, and a report compares it with the render:     */
/* level-matched band spectra, short-term level tracking and the      */
/* receiver's clipping signature.                                     */
/* ------------------------------------------------------------------ */

els.reference = document.getElementById('reference');
els.referenceFile = document.getElementById('reference-file');
els.referenceChannel = document.getElementById('reference-channel');
els.referenceClear = document.getElementById('reference-clear');
els.referenceStatus = document.getElementById('reference-status');
els.referenceReport = document.getElementById('reference-report');
els.audioReal = document.getElementById('preview-real');
state.realTake = null;   // { name, samples, rate, timeline, overlap: { t0, t1 }, blob, guideSpurts }
let referenceJob = 0, reportJob = 0, referenceDecoded = null;
const REFERENCE_HELP = 'Load a voice_loopback recording of this source to check the simulation against it.';

function setReferenceStatus(text, level = '') {
  if (!els.referenceStatus) return;
  els.referenceStatus.textContent = text;
  els.referenceStatus.className = `reference-status${level ? ` ${level}` : ''}`;
}

function takeChannel(decoded, channel) {
  if (decoded.numberOfChannels < 2 || channel === 'mix') return TF2Audio.bufferToMono(decoded);
  return decoded.getChannelData(channel === 'right' ? 1 : 0).slice();
}

// Where the gate model puts talk spurts, for track(): the profile and
// settings the render uses (the current ones by default).
function takeTrackOptions(o = renderOptions()) {
  const profile = CODEC_PROFILES[o.codec] || CODEC_PROFILES.steam;
  const on = o.enableWarble !== false && (o.gate == null ? !!profile.senderGate : o.gate);
  if (!on) return {};
  const spec = profile.senderGate || { thresholdDb: -39.5, prerollMs: 120, holdMs: 440 };
  return { gate: { thresholdDb: Number.isFinite(o.gateThresholdDb) ? o.gateThresholdDb : spec.thresholdDb,
    prerollMs: spec.prerollMs, holdMs: spec.holdMs }, micGain: o.micGain };
}

// The render the take is lined up against (track()'s options.reference):
// the current one, unless it has random loss or jitter, whose concealment
// the take does not share. `spurts`: that render's phrases on the game's
// voice queue (codecInfo.channel.spurts), or null; kept with the take for
// phraseChanges() and not handed to track().
function renderGuide() {
  const info = state.lastCodecInfo;
  if (!state.processedBuffer || !info || info.lostFrames || info.underrunFrames) return null;
  return { samples: state.processedBuffer, rate: state.processedRate, frames: info.frameLog || null, frameSeconds: (info.frameMs || 20) / 1000,
    spurts: info.channel && info.channel.spurts ? info.channel.spurts : null };
}

// The search and the warp, in a worker when there is one. The aligned take
// keeps the take's sample rate and runs the length of the source.
function locateTake(take, takeRate, source, sourceRate, onProgress) {
  const length = Math.round(source.length / sourceRate * takeRate), options = takeTrackOptions();
  const guide = renderGuide(), guideSpurts = guide ? guide.spurts : null;
  if (guide) { options.reference = { ...guide }; delete options.reference.spurts; }
  if (canUseWorker()) {
    const t = take.slice(), s = source.slice();
    if (guide) options.reference.samples = guide.samples.slice();
    return startWorker({ type: 'locate', take: t.buffer, takeRate, source: s.buffer, sourceRate, length, options }, [t.buffer, s.buffer], onProgress)
      .promise.then(reply => ({ timeline: reply.timeline, aligned: new Float32Array(reply.aligned), guideSpurts }));
  }
  return new Promise((resolve, reject) => setTimeout(() => {
    try {
      const timeline = TF2Reference.track(take, takeRate, source, sourceRate, options);
      resolve({ timeline, aligned: TF2Reference.warpSegments(take, takeRate, timeline.segments, takeRate, length), guideSpurts });
    } catch (error) { reject(error); }
  }, 0));
}

function compareTakeJob(real, sim, rate) {
  if (canUseWorker()) {
    const r = real.slice(), s = sim.slice();
    return startWorker({ type: 'compareTake', real: r.buffer, sim: s.buffer, rate }, [r.buffer, s.buffer]).promise.then(reply => reply.report);
  }
  return new Promise(resolve => setTimeout(() => resolve(TF2Reference.compareTake(real, sim, rate)), 0));
}

async function loadReferenceTake(file) {
  if (!file || !state.decodedSource) return;
  const job = ++referenceJob;
  try {
    setReferenceStatus(`Decoding ${file.name}…`);
    const decoded = await decodeAtFileRate(await file.arrayBuffer(), file.name, () => file.arrayBuffer());
    if (job !== referenceJob) return;
    if (decoded.duration > MAX_AUDIO_SECONDS * 1.5) throw new Error('takes are limited to 15 minutes');
    referenceDecoded = { decoded, name: file.name };
    await alignReferenceTake(job);
  } catch (error) {
    if (job === referenceJob) setReferenceStatus(`Could not use ${file.name}: ${error.message}`, 'reference-bad');
  }
}

async function alignReferenceTake(job = ++referenceJob) {
  if (!referenceDecoded || !state.decodedSource) return;
  const { decoded, name } = referenceDecoded;
  const take = takeChannel(decoded, els.referenceChannel ? els.referenceChannel.value : 'mix'), rate = decoded.sampleRate;
  // The source as the game's microphone got it (the gate model needs that).
  const source = captureSource(state.decodedSource, renderOptions().captureChannel).getChannelData(0), sourceRate = state.decodedSource.sampleRate;
  setReferenceStatus(`Finding the source in ${name}…`);
  try {
    const { timeline, aligned, guideSpurts } = await locateTake(take, rate, source, sourceRate,
      (value) => { if (job === referenceJob) setReferenceStatus(`Finding the source in ${name}… ${Math.round(value * 100)}%`); });
    if (job !== referenceJob) return;
    clearReferenceTake(false);
    const overlap = timeline.overlap;
    const blob = URL.createObjectURL(TF2Audio.encodeWav(aligned, rate));
    state.realTake = { name, samples: aligned, rate, timeline, overlap, blob, guideSpurts };
    if (els.audioReal) {
      els.audioReal.src = blob;
      els.audioReal.muted = state.abMode !== 'real';
      els.audioReal.volume = els.audio.volume;
      els.audioReal.playbackRate = els.audio.playbackRate;
      syncTwins(true);
      if (!els.audio.paused) els.audioReal.play().catch(() => {});
    }
    if (els.referenceClear) els.referenceClear.hidden = false;
    setReferenceStatus(`${name}: ${describeTiming(timeline)} It plays as the third A/B version (B cycles render, original, real take).`, 'reference-good');
    const first = timeline.segments[0];
    logLine(`Reference: aligned "${name}" in ${timeline.segments.length} segment${timeline.segments.length === 1 ? '' : 's'} `
      + `(delay ${first.delayMs.toFixed(1)} ms first, clock ${first.clockPpm.toFixed(1)} ppm, ${timeline.points} windows, r ${timeline.correlation.toFixed(3)})`, 'sys');
    updateReferenceReport();
    updateMeter();
    refreshVisualizer();
  } catch (error) {
    if (job === referenceJob) setReferenceStatus(`Could not align ${name}: ${error.message}`, 'reference-bad');
  }
}

// The take's timing in words: its delay against the render it was lined
// up with (or against the source when there was none), piece by piece. The
// delay changes between phrases, where the game's voice queue starts some
// phrases early, and within a phrase, where the engine drops one sample
// from every packet and the queue skips what overflows its ring
// (tests/REFERENCE_2026.md, finding 10).
function describeTiming(timeline) {
  const segs = timeline.segments;
  // Delay: take time minus render (or source) time (negative when the take
  // starts before it).
  const fmt = (ms) => `${ms < 0 ? '−' : '+'}${(Math.abs(ms) / 1000).toFixed(3)} s`;
  const against = timeline.guided ? 'take minus render' : 'take minus source';
  const delays = segs.map(g => g.delayMs);
  const between = segs.filter((g, i) => i > 0 && g.spurt !== segs[i - 1].spurt).length, within = segs.length - 1 - between;
  const clock = segs[0].clockPpm;
  const phrases = timeline.spurts || 1;
  let text = segs.length === 1 ? `delay ${fmt(delays[0])} (${against})`
    : `${phrases} phrase${phrases === 1 ? '' : 's'} in ${segs.length} pieces, delay ${fmt(Math.min(...delays))} to ${fmt(Math.max(...delays))}`
      + ` (${against}; ${between} change${between === 1 ? '' : 's'} between phrases, ${within} within a phrase)`;
  text += `, clock ${clock >= 0 ? '+' : '−'}${Math.abs(clock).toFixed(0)} ppm, correlation ${timeline.correlation.toFixed(2)}${timeline.polarity < 0 ? ', polarity inverted' : ''}.`;
  return text;
}

// Which phrases start early, the take's beside the render's (W3-02e). The
// limits of a kind: early at -80 ms or less, late at +80 ms or more
// (tests/retiming.mjs's; chosen).
const PHRASE_EARLY_MS = -80, PHRASE_LATE_MS = 80;
const phraseKind = (ms) => (ms === null ? null : ms <= PHRASE_EARLY_MS ? 'early' : ms >= PHRASE_LATE_MS ? 'late' : 'kept');

// The change in a render's own delay at the pause nearest `at` (source
// seconds), from its phrases on the game's voice queue (codecInfo.channel.
// spurts): the later phrase's offsetStartMs less the earlier one's
// offsetEndMs. null without phrases (a render not on the queue) or with a
// null offset; 0 where no pause's middle lies within 0.2 s of `at` (the
// sender did not end a phrase there).
function changeAt(spurts, at) {
  if (!spurts) return null;
  let best = -1, dist = Infinity;
  for (let j = 1; j < spurts.length; j++) {
    const d = Math.abs((spurts[j - 1].end + spurts[j].start) / 2 - at);
    if (d < dist) { dist = d; best = j; }
  }
  if (best < 0 || dist > 0.2) return 0;
  const later = spurts[best].offsetStartMs, earlier = spurts[best - 1].offsetEndMs;
  return later === null || earlier === null ? null : later - earlier;
}

// One entry for each change from one phrase to the next among the take's
// pieces (timeline.segments of different `spurt`): at, the later piece's
// start; stepMs, the change in the take's delay there; guideMs, the change
// in the delay of the render the take was lined up with (guideSpurts, its
// channel's phrases, or null: 0); takeMs = stepMs + guideMs, the take's own
// change against the source (null with guideMs null); renderMs, the change
// in the render on screen (renderSpurts, or null); and the kind of each.
function phraseChanges(timeline, guideSpurts, renderSpurts) {
  const segs = timeline.segments, out = [];
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].spurt === segs[i - 1].spurt) continue;
    const at = segs[i].start, stepMs = segs[i].delayMs - segs[i - 1].delayMs;
    const guideMs = guideSpurts ? changeAt(guideSpurts, at) : 0;
    const takeMs = guideMs === null ? null : stepMs + guideMs, renderMs = changeAt(renderSpurts, at);
    out.push({ at, stepMs, guideMs, takeMs, renderMs, takeKind: phraseKind(takeMs), renderKind: phraseKind(renderMs) });
  }
  return out;
}

// The panel's lines on phrase starts: the counts, then the changes
// themselves (the first 30). None for a take with no change.
const PHRASE_LIST_MAX = 30;
function phraseStartLines(changes, info) {
  if (!changes.length) return [];
  const n = changes.length, early = (kind) => changes.filter((c) => c[kind] === 'early').length;
  const head = `Phrase starts: at ${n} change${n === 1 ? '' : 's'} from one phrase to the next the take starts early (by 80 ms or more) at ${early('takeKind')}`;
  const channel = info && info.channel;
  const lines = [channel && channel.spurts
    ? `${head} and the render at ${early('renderKind')}; they are of one kind (early, kept or late) at ${changes.filter((c) => c.takeKind !== null && c.takeKind === c.renderKind).length} of ${n}.`
    : channel ? `${head}. This render ran the game's voice queue and does not say which of its phrases start early.`
      : `${head}. This render keeps the file's own timing and starts none early.`];
  const ms = (v) => (v === null ? '—' : `${Math.round(v) < 0 ? '−' : '+'}${Math.abs(Math.round(v))}`);
  const list = changes.slice(0, PHRASE_LIST_MAX).map((c) => `${c.at.toFixed(2)} s ${ms(c.takeMs)} | ${ms(c.renderMs)}`).join('; ');
  lines.push(`Take | render, ms: ${list}${n > PHRASE_LIST_MAX ? `; and ${n - PHRASE_LIST_MAX} more` : ''}.`);
  return lines;
}

// Remove the aligned take (and, unless keepFile, forget the decoded file).
function clearReferenceTake(forget = true) {
  if (state.realTake) URL.revokeObjectURL(state.realTake.blob);
  const had = !!state.realTake;
  state.realTake = null;
  if (els.audioReal) { els.audioReal.pause(); els.audioReal.removeAttribute('src'); els.audioReal.load(); }
  if (state.abMode === 'real') {
    state.abMode = 'wet';
    setAbMutes();
    els.abToggle.textContent = AB_LABELS.wet;
  }
  if (els.referenceReport) { els.referenceReport.hidden = true; els.referenceReport.replaceChildren(); }
  if (forget) {
    ++referenceJob;
    referenceDecoded = null;
    if (els.referenceFile) els.referenceFile.value = '';
    if (els.referenceClear) els.referenceClear.hidden = true;
    setReferenceStatus(REFERENCE_HELP);
    if (had) { updateMeter(); refreshVisualizer(); }
  }
}

const BAND_LABELS = ['40–80', '80–120', '120–200', '200–300', '300–500', '0.5–1k', '1–2k', '2–3k', '3–5k', '5–8k', '8–10k', '10–11k', '11–12k', '12–16k', '16–19k'];

// The simulation against the take over the part of the source the take covers.
async function updateReferenceReport() {
  const take = state.realTake, box = els.referenceReport;
  if (!box) return;
  box.hidden = !take;
  if (!take) return;
  const note = (text) => { const p = document.createElement('p'); p.textContent = text; return p; };
  if (!state.processedBuffer) { box.replaceChildren(note('Render the source to compare the simulation with the take.')); return; }
  const job = ++reportJob;
  box.replaceChildren(note('Comparing the render with the take…'));
  const sim = state.processedBuffer, rate = state.processedRate;
  const real = take.rate === rate ? take.samples : TF2Audio.resampleSinc(take.samples, take.rate, rate);
  const from = Math.max(0, Math.round(take.overlap.t0 * rate)), to = Math.min(sim.length, real.length, Math.round(take.overlap.t1 * rate));
  let report;
  try {
    if (to - from < rate) throw new Error('the take overlaps the source by less than a second');
    report = await compareTakeJob(real.subarray(from, to), sim.subarray(from, to), rate);
  } catch (error) {
    if (job === reportJob) box.replaceChildren(note(`Could not compare: ${error.message}`));
    return;
  }
  if (job !== reportJob || take !== state.realTake) return;
  const table = document.createElement('table');
  table.className = 'reference-bands';
  const caption = document.createElement('caption');
  caption.textContent = `Simulation minus take per band, dB, with the two level-matched at 300 Hz–3 kHz (${formatTime(take.overlap.t0, 1)}–${formatTime(take.overlap.t1, 1)})`;
  const head = document.createElement('tr'), body = document.createElement('tr');
  const cell = (tag, text, cls = '', title = '') => { const c = document.createElement(tag); c.textContent = text; if (cls) c.className = cls; if (title) c.title = title; return c; };
  head.append(cell('th', 'Hz'));
  body.append(cell('th', 'Δ', '', 'simulation minus take'));
  (report.bands || []).forEach((band, i) => {
    head.append(cell('th', BAND_LABELS[i] || band.hz));
    const d = band.simMinusRealDb;
    body.append(d === null ? cell('td', '—') : cell('td', `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`,
      Math.abs(d) <= 1.5 ? 'ref-good' : Math.abs(d) <= 3 ? 'ref-warn' : 'ref-bad'));
  });
  const thead = document.createElement('thead'), tbody = document.createElement('tbody');
  thead.append(head); tbody.append(body);
  table.append(caption, thead, tbody);
  const parts = [];
  const lt = report.levelTracking;
  if (lt) parts.push(`Short-term level: ${lt.rmsDeviationDb.toFixed(1)} dB rms apart, worst ${lt.worstDeviationDb.toFixed(1)} dB, r ${lt.correlation === null ? '—' : lt.correlation.toFixed(2)} (${lt.blocks} blocks of 0.5 s).`);
  const clip = report.clip || {};
  const sig = (s) => `ceiling ${s.ceilingDbfs.toFixed(1)} dBFS, ${s.clippedPercent.toFixed(1)}% at it, mean/ceiling ${s.meanOverCeiling.toFixed(2)}`;
  if (clip.real && clip.sim) parts.push(`Clipping: take ${sig(clip.real)}; simulation ${sig(clip.sim)}.`);
  if (Number.isFinite(report.anchorGainDb)) {
    const g = report.anchorGainDb;
    parts.push(`Level at 300 Hz–3 kHz: the simulation is ${Math.abs(g).toFixed(1)} dB ${g >= 0 ? 'louder' : 'quieter'} (volume and voice_scale set this).`);
  }
  // Phrase starts, against the render on screen (W3-02e).
  const info = state.lastCodecInfo, renderSpurts = info && info.channel && info.channel.spurts ? info.channel.spurts : null;
  parts.push(...phraseStartLines(phraseChanges(take.timeline, take.guideSpurts || null, renderSpurts), info));
  box.replaceChildren(table, ...parts.map(note));
}

if (els.referenceFile) els.referenceFile.addEventListener('change', () => loadReferenceTake(els.referenceFile.files[0]));
if (els.referenceChannel) els.referenceChannel.addEventListener('change', () => { if (referenceDecoded) alignReferenceTake(); });
if (els.referenceClear) els.referenceClear.addEventListener('click', () => clearReferenceTake());
setReferenceStatus(REFERENCE_HELP);
