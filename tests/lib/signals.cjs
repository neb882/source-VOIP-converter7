/* tests/lib/signals.cjs: the signals and measures that tests/verify.js and
 * tests/steam.verify.js both use, moved from tests/verify.js unedited. */
'use strict';

function mkBuffer(channelData, sampleRate) {
  return { sampleRate, length: channelData.length, numberOfChannels: 1, getChannelData: () => channelData };
}

function tone(freq, seconds, rate, amp) {
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * i / rate);
  return out;
}

// Syllabic voiced signal: 115 Hz harmonics with a 3.2 Hz syllable envelope, scaled to an RMS level.
// Opus's voice detector keeps it active, as it did the test signal's vowel synth.
function speechLike(seconds, rate, rmsDb) {
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.pow(Math.abs(Math.sin(Math.PI * ((t * 3.2) % 1))), 0.6);
    const f0 = 115 * (1 + 0.05 * Math.sin(2 * Math.PI * 0.7 * t));
    let v = 0;
    for (let h = 1; h <= 30; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
    out[i] = env * v; sum += out[i] * out[i];
  }
  const k = 10 ** (rmsDb / 20) / Math.sqrt(sum / n);
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

function rms(x, from, to) {
  const a = from || 0, b = to || x.length;
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
}

function peakAbs(x) { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; }

function db(ratio) { return 20 * Math.log10(Math.max(ratio, 1e-12)); }

module.exports = { mkBuffer, tone, speechLike, rms, peakAbs, db };
