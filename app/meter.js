/* TF2 Voice Emulator, app/meter.js: The meter and loudness-matched A/B.
 * One of the page scripts that were script.js, loaded in order by
 * index.html (core, console, source, render, meter, realtake,
 * visualizer, netgraph, boot); they share their top-level names. */

/* ------------------------------------------------------------------ */
/* Meter and loudness-matched A/B (meter.js)                          */
/*                                                                    */
/* The meter lists loudness and levels of the render (TF2) and the    */
/* original, or of the time range selected in the visualizer. Matching */
/* plays the louder of the two quieter by their difference in         */
/* integrated loudness over the whole file, so an A/B compares sound  */
/* rather than level.                                                 */
/* ------------------------------------------------------------------ */

els.meter = document.getElementById('meter');
els.meterRows = document.getElementById('meter-rows');
els.meterSel = document.getElementById('meter-sel');
els.meterSelText = document.getElementById('meter-sel-text');
els.meterSelZoom = document.getElementById('meter-sel-zoom');
els.meterSelClear = document.getElementById('meter-sel-clear');
els.abMatch = document.getElementById('ab-match');
state.abMatch = LS.get('tf2ve_ab_match', false) === true;
state.abOffsetDb = 0;         // gain applied to the louder version, dB (<= 0)
state.abLouder = null;        // 'WET' or 'DRY'

// The versions' internal labels are WET (the render), DRY (the original)
// and REAL (a take); the page shows them as these (W4-01a: no element says
// wet or dry).
// One neutral name for the render, whatever the codec (the owner,
// 2026-11-11): a render with vaudio_miles or Fullband Opus is not TF2's voice.
const VERSION_NAMES = { WET: 'RENDER', DRY: 'ORIGINAL', REAL: 'REAL', SOURCE: 'SOURCE' };
const versionName = (label) => VERSION_NAMES[label] || label;
// In a sentence: "the render", "the original", "the real take".
const VERSION_WORDS = { WET: 'the render', DRY: 'the original', REAL: 'the real take' };

// TF2Meter.analyze on a copy of `samples`, in a worker when there is one.
function analyzeCopy(samples, rate) {
  const copy = samples.slice();
  if (canUseWorker()) {
    return startWorker({ type: 'analyze', samples: copy.buffer, sampleRate: rate }, [copy.buffer]).promise.then(reply => reply.stats);
  }
  return new Promise(resolve => setTimeout(() => resolve(TF2Meter.analyze(copy, rate)), 0));
}

const meterResults = new Map();   // buffer id -> Promise<stats>
function measure(samples, rate) {
  const id = bufferId(samples);
  if (!meterResults.has(id)) {
    const job = analyzeCopy(samples, rate);
    job.catch(() => meterResults.delete(id));
    meterResults.set(id, job);
  }
  return meterResults.get(id);
}

// Statistics of the samples between t0 and t1 s, for a selection; the last
// few ranges are kept.
const rangeResults = new Map();   // "id:from:to" -> Promise<stats>
function measureRange(samples, rate, t0, t1) {
  const from = Math.max(0, Math.floor(t0 * rate)), to = Math.min(samples.length, Math.max(from + 1, Math.ceil(t1 * rate)));
  const key = `${bufferId(samples)}:${from}:${to}`;
  if (!rangeResults.has(key)) {
    if (rangeResults.size >= 24) rangeResults.delete(rangeResults.keys().next().value);
    const job = analyzeCopy(samples.subarray(from, to), rate);
    job.catch(() => rangeResults.delete(key));
    rangeResults.set(key, job);
  }
  return rangeResults.get(key);
}

function meterSources() {
  const out = [];
  if (state.processedBuffer) out.push({ label: 'WET', samples: state.processedBuffer, rate: state.processedRate });
  if (state.decodedSource) out.push({ label: 'DRY', samples: state.decodedSource.getChannelData(0), rate: state.decodedSource.sampleRate });
  if (state.realTake) out.push({ label: 'REAL', samples: state.realTake.samples, rate: state.realTake.rate });
  return out;
}

const METER_COLUMNS = [
  ['integrated', 'LUFS', 1], ['lra', 'LU', 1], ['shortTermMax', 'LUFS', 1], ['momentaryMax', 'LUFS', 1],
  ['truePeak', 'dBTP', 1], ['samplePeak', 'dBFS', 1], ['rms', 'dBFS', 1], ['plr', 'dB', 1], ['dc', '%', 3]
];
function meterCell(key, value) {
  if (value === null || value === undefined) return '—';
  if (key === 'dc') return `${(value * 100).toFixed(3)}`;
  if (!Number.isFinite(value)) return '−∞';
  return value.toFixed(1).replace('-', '−');
}

// Values worth a second look: peaks that clip on 16-bit export or lossy
// encoding, and a DC offset (libopus 1.1.x comfort noise for a steady tone
// below ~60 Hz is nearly DC; see README). At volume 1, the game's default, a
// loud render's peaks between samples pass 0 dBTP, as the game's do: no
// limiter hides it (W3-10).
function meterWarning(key, value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (key === 'truePeak' && value > 0) return { level: 'meter-bad', text: 'Inter-sample peaks above 0 dBTP clip after MP3 decoding or resampling. This is what the game\'s default volume, 1, gives a loud voice; lower volume for an MP3' };
  if (key === 'truePeak' && value > -1) return { level: 'meter-warn', text: 'Less than 1 dB below 0 dBTP: MP3 decoding may clip' };
  if (key === 'samplePeak' && value >= -0.01) return { level: 'meter-bad', text: 'Samples at full scale clip in the 16-bit file' };
  if (key === 'dc' && Math.abs(value) >= 0.005) return { level: 'meter-warn', text: 'DC offset over 0.5% of full scale' };
  return null;
}

let meterGeneration = 0, meterSourcesKey = '';
async function updateMeter() {
  // Hear's buttons follow the versions there are (a take loaded or removed).
  if (typeof updateAbButtons === 'function') updateAbButtons();
  const sources = meterSources();
  const generation = ++meterGeneration;
  const selection = vizSel;
  if (els.meter) els.meter.hidden = !sources.length;
  // Whole-file statistics drive the A/B matching and the loudness lane; they
  // only change with the audio, not with the selection.
  const sourcesKey = sources.map(src => bufferId(src.samples)).join(':');
  if (sourcesKey !== meterSourcesKey) {
    meterSourcesKey = sourcesKey;
    state.meterStats = null;
    applyAbMatch();
  }
  if (els.meterSel) {
    els.meterSel.hidden = !selection || !sources.length;
    if (selection) {
      els.meterSelText.textContent = `Selection ${formatTime(selection.t0, 3)} – ${formatTime(selection.t1, 3)} · ${(selection.t1 - selection.t0).toFixed(3)} s`;
    }
  }
  if (!sources.length || !els.meterRows) return;
  const row = (label, cells, cls = '', stats = null) => {
    const tr = document.createElement('tr');
    if (cls) tr.className = cls;
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = versionName(label);
    tr.appendChild(th);
    cells.forEach((text, i) => {
      const td = document.createElement('td');
      td.textContent = text;
      const warning = stats && meterWarning(METER_COLUMNS[i][0], stats[METER_COLUMNS[i][0]]);
      if (warning) { td.className = warning.level; td.title = warning.text; }
      tr.appendChild(td);
    });
    return tr;
  };
  els.meterRows.replaceChildren(...sources.map(src => row(src.label, METER_COLUMNS.map(() => '…'))));
  const whole = await Promise.all(sources.map(src => measure(src.samples, src.rate).catch(() => null)));
  if (generation !== meterGeneration) return;
  const hadStats = !!state.meterStats;
  const statsFor = (label) => whole[sources.findIndex(src => src.label === label)] || null;
  state.meterStats = { wet: statsFor('WET'), dry: statsFor('DRY'), real: statsFor('REAL') };
  applyAbMatch();
  // The loudness lane draws from these.
  if (!hadStats && state.showLufs) refreshVisualizer();
  const results = selection
    ? await Promise.all(sources.map(src => measureRange(src.samples, src.rate, selection.t0, selection.t1).catch(() => null)))
    : whole;
  if (generation !== meterGeneration) return;
  const rows = sources.map((src, i) => row(src.label, METER_COLUMNS.map(([key]) => (results[i] ? meterCell(key, results[i][key]) : 'error')), '', results[i]));
  // Wet minus dry (Δ) and wet minus the real take (Δ real), for the columns
  // where a difference means something.
  const diff = new Set(['integrated', 'truePeak', 'samplePeak', 'rms', 'plr', 'lra']);
  const byLabel = (label) => results[sources.findIndex(src => src.label === label)] || null;
  for (const [label, other, title] of [['Δ', 'DRY', 'the render minus the original'], ['Δ real', 'REAL', 'the render minus the real take']]) {
    const a = byLabel('WET'), b = byLabel(other);
    if (!a || !b) continue;
    const tr = row(label, METER_COLUMNS.map(([key]) => {
      if (!diff.has(key) || a[key] === null || b[key] === null || !Number.isFinite(a[key]) || !Number.isFinite(b[key])) return '';
      const d = a[key] - b[key];
      return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(1)}`;
    }), 'meter-delta');
    tr.title = title;
    rows.push(tr);
  }
  els.meterRows.replaceChildren(...rows);
}
if (els.meterSelZoom) els.meterSelZoom.addEventListener('click', () => zoomToSelection());
if (els.meterSelClear) els.meterSelClear.addEventListener('click', () => { setSelection(null); refreshVisualizer(); });

// A/B gain (dB) for 'WET', 'DRY' or 'REAL'; 0 unless matching is on.
function abGainDb(label) {
  return state.abMatch ? (state.abGains && state.abGains[label]) || 0 : 0;
}

// Every version plays at the integrated loudness of the quietest.
function applyAbMatch() {
  const stats = state.meterStats || {};
  const level = (s) => (s && Number.isFinite(s.integrated) ? s.integrated : null);
  const levels = {};
  if (state.processedBuffer && level(stats.wet) !== null) levels.WET = level(stats.wet);
  if (state.decodedSource && level(stats.dry) !== null) levels.DRY = level(stats.dry);
  if (state.realTake && level(stats.real) !== null) levels.REAL = level(stats.real);
  const known = 'WET' in levels && 'DRY' in levels;
  const quietest = known ? Math.min(...Object.values(levels)) : 0;
  state.abGains = known ? Object.fromEntries(Object.entries(levels).map(([label, value]) => [label, quietest - value])) : {};
  state.abLouder = known ? (levels.WET > levels.DRY ? 'WET' : 'DRY') : null;
  state.abOffsetDb = known ? -Math.abs(levels.WET - levels.DRY) : 0;
  const now = state.audioCtx ? state.audioCtx.currentTime : 0;
  if (state.wetGain) state.wetGain.gain.setTargetAtTime(Math.pow(10, abGainDb('WET') / 20), now, 0.01);
  if (state.dryGain) state.dryGain.gain.setTargetAtTime(Math.pow(10, abGainDb('DRY') / 20), now, 0.01);
  if (state.realGain) state.realGain.gain.setTargetAtTime(Math.pow(10, abGainDb('REAL') / 20), now, 0.01);
  if (els.abMatch) {
    els.abMatch.disabled = !state.lastBlob || !state.dryBlob;
    els.abMatch.setAttribute('aria-pressed', String(state.abMatch));
    els.abMatch.classList.toggle('active', state.abMatch);
    const lowered = Object.entries(state.abGains).filter(([, g]) => g < -0.05)
      .map(([label, g]) => `${VERSION_WORDS[label]} ${g.toFixed(1).replace('-', '−')}`);
    els.abMatch.textContent = !state.abMatch || !state.abLouder ? 'Match loudness'
      : 'REAL' in levels ? `Matched: ${lowered.join(', ') || 'all equal'} dB`
        : `Matched: ${VERSION_WORDS[state.abLouder]} ${state.abOffsetDb.toFixed(1).replace('-', '−')} dB`;
  }
}

if (els.abMatch) els.abMatch.addEventListener('click', () => {
  state.abMatch = !state.abMatch;
  LS.set('tf2ve_ab_match', state.abMatch);
  applyAbMatch();
  refreshVisualizer();
});

// Space plays and pauses the preview, B switches what is heard (Hear) and L
// loops, outside text fields and buttons. On the player, which takes the
// focus after a first render (W4-01a), B and L work too; Space there is the
// player's own (handled here as well, it would act twice).
document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  const target = event.target;
  const onPlayer = target === els.audio;
  if (onPlayer && event.key === ' ') return;
  if (!onPlayer && target && target.closest && target.closest('input, textarea, select, button, audio, summary, [contenteditable]')) return;
  if (event.key === ' ' && els.audio.src) {
    event.preventDefault();
    if (els.audio.paused) els.audio.play().catch(() => {}); else els.audio.pause();
  } else if ((event.key === 'b' || event.key === 'B') && canHear()) {
    event.preventDefault();
    cycleAbMode();
  } else if ((event.key === 'l' || event.key === 'L') && els.vizLoop && !els.vizLoop.disabled) {
    event.preventDefault();
    toggleLoop();
  }
});
