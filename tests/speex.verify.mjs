// The speex profile: Speex 1.2.1 narrowband (vendor/speex, tests/speex/build.mjs).
//   node tests/speex.verify.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as opus from '../opus-codec.mjs';
import { createCodec, qualityBitrates, qualityForBitrate } from '../vendor/speex/index.mjs';
import { testSignal, wasmStream, digest, QUALITIES } from './speex/native.mjs';

let passed = 0;
function check(name, ok, detail = '') {
  assert.ok(ok, `${name}${detail ? ` (${detail})` : ''}`);
  passed++;
  console.log(`  ok    ${name}${detail ? `   [${detail}]` : ''}`);
}
const sandbox = { window: {}, Blob, console, TF2Opus: opus };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL('../constants.js', import.meta.url), 'utf8') + '\n' +
  fs.readFileSync(new URL('../audio.js', import.meta.url), 'utf8'), sandbox);
const A = sandbox.window.TF2Audio;
const PROFILES = vm.runInContext('CODEC_PROFILES', sandbox);
const { FRAME } = opus;
const SR = 48000, NB = 8000;
const buffer = (data, sampleRate = SR) => ({ sampleRate, length: data.length, numberOfChannels: 1, getChannelData: () => data });
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

// Voiced speech in the codec's band: a gliding pitch near 180 Hz, harmonics
// from the second up to 3.4 kHz, in syllables. (Below about 300 Hz Speex's
// own high-pass filters turn the phase, which would blur a timing check.)
function voiceBand(seconds, rate) {
  const x = new Float32Array(Math.round(seconds * rate));
  let phase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / rate, f0 = 180 + 50 * Math.sin(2 * Math.PI * 0.9 * t);
    phase += f0 / rate;
    let v = 0;
    for (let h = 2; h * f0 <= 3400; h++) v += Math.sin(2 * Math.PI * h * phase + 0.3 * h * h) / h;
    x[i] = 0.2 * v * Math.abs(Math.sin(Math.PI * 2.7 * t)) ** 0.5;
  }
  return x;
}
// Normalised cross-correlation of b against a at a lag, over a's middle.
function correlate(a, b, lag, margin) {
  let dot = 0, ea = 0, eb = 0;
  for (let i = margin; i < a.length - margin; i++) { dot += a[i] * b[i + lag]; ea += a[i] ** 2; eb += b[i + lag] ** 2; }
  return dot / Math.sqrt(ea * eb);
}
// The lag of the highest correlation within +-span, with its parabolic fraction.
function peakLag(a, b, span, margin) {
  const r = {};
  let lag = -span;
  for (let l = -span; l <= span; l++) { r[l] = correlate(a, b, l, margin); if (r[l] > r[lag]) lag = l; }
  const fraction = lag > -span && lag < span ? 0.5 * (r[lag - 1] - r[lag + 1]) / (r[lag - 1] - 2 * r[lag] + r[lag + 1]) : 0;
  return { lag, at: lag + fraction, r: r[lag] };
}
// Power in [lo, hi) Hz relative to the whole spectrum (Welch, 4096-point Hann).
function bandShareDb(x, rate, lo, hi) {
  const n = 4096, re = new Float64Array(n), im = new Float64Array(n);
  let band = 0, all = 0;
  for (let start = 0; start + n <= x.length; start += n / 2) {
    for (let i = 0; i < n; i++) { re[i] = x[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n)); im[i] = 0; }
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(-2 * Math.PI * k / len), s = Math.sin(-2 * Math.PI * k / len), p = i + k + len / 2;
        const xr = re[p] * c - im[p] * s, xi = re[p] * s + im[p] * c;
        re[p] = re[i + k] - xr; im[p] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi;
      }
    }
    for (let k = 1; k < n / 2; k++) {
      const p = re[k] ** 2 + im[k] ** 2, f = k * rate / n;
      all += p;
      if (f >= lo && f < hi) band += p;
    }
  }
  return 10 * Math.log10(Math.max(band, 1e-30) / all);
}

console.log('\n[Speex] The module: Speex 1.2.1 narrowband at the profile\'s settings');
{
  const codec = await createCodec();
  check('Speex 1.2.1 narrowband: 8 kHz, 160-sample frames, 80 samples of delay (encoder 40 + decoder 40)',
    codec.version === 'Speex 1.2.1' && codec.sampleRate === NB && codec.frameSize === 160 && codec.lookahead === 80,
    `${codec.version}, ${codec.frameSize} samples, lookahead ${codec.lookahead}`);
  check('quality 4 by default: 8 kbps, the library\'s default complexity 2, perceptual enhancement on',
    codec.quality === 4 && codec.bitrate === 8000 && codec.complexity === 2 && codec.enhancement === true,
    `quality ${codec.quality}, ${codec.bitrate} bps, complexity ${codec.complexity}`);
  codec.free();
  const rates = await qualityBitrates();
  check('the narrowband qualities 0-10 run at the library\'s bitrates',
    JSON.stringify(rates) === JSON.stringify([2150, 3950, 5950, 8000, 8000, 11000, 11000, 15000, 15000, 18200, 24600]), rates.join(' '));
  check('a bitrate picks the nearest quality, the highest of those sharing a mode',
    await qualityForBitrate(8000) === 4 && await qualityForBitrate(3000) === 0 && await qualityForBitrate(5000) === 2
    && await qualityForBitrate(10000) === 6 && await qualityForBitrate(1e6) === 10);
  await assert.rejects(() => createCodec(11), RangeError);
  await assert.rejects(() => opus.speexRoundTrip(new Float32Array(160), 16000), /narrowband runs at 8000 Hz/);
  check('qualities outside 0-10 and rates other than 8 kHz are rejected', true);
}

console.log('\n[Speex] Packets: 20 bytes a frame at the default, the nearest quality for other snd_bits');
{
  const src = voiceBand(1, SR);
  const r = await A.process(buffer(src), { codec: 'speex' });
  const info = r.codecInfo, coded = info.frames - info.gatedFrames;
  check('the speex profile renders through Speex 1.2.1, quality 4, 8 kbps CBR, no VAD or DTX',
    r.realOpus && info.backend === 'speex' && info.version === 'Speex 1.2.1' && info.quality === 4 && info.bitrate === 8000
    && !info.vbr && !info.dtx && info.dtxFrames === 0 && info.plc === 'speex' && info.frameMs === 20 && info.frameSamples === 160,
    `${info.version}, quality ${info.quality}, ${info.bitrate} bps`);
  check('every frame is one 20-byte packet', coded === info.frames && info.packetBytes === 20 && info.frameBytes.every(b => b === 20)
    && info.encodedBytes === 20 * info.frames, `${info.frames} frames, ${info.encodedBytes} bytes`);
  check('no sender gate by default: the engine codec transmits continuously', info.gate === null && info.gatedFrames === 0);
  const rates = await qualityBitrates();
  const expected = { 4: [0, 6], 6: [0, 6], 8: [1, 10], 10: [2, 15], 12: [2, 15], 20: [6, 28], 24: [6, 28], 32: [8, 38] };
  const got = [];
  for (const [bits, [quality, bytes]] of Object.entries(expected)) {
    const target = 8000 * bits / 16;
    const nearest = rates.every(rate => Math.abs(rates[quality] - target) <= Math.abs(rate - target));
    const s = (await A.process(buffer(src.subarray(0, SR / 2)), { codec: 'speex', bits: Number(bits) })).codecInfo;
    got.push(`${bits}: q${s.quality} ${s.frameBytes[0]} B`);
    check(`snd_bits ${bits} (${target / 1000} kbps) codes at quality ${quality}, the nearest, in ${bytes}-byte packets`,
      nearest && s.quality === quality && s.bitrate === rates[quality] && s.frameBytes.every(b => b === bytes) && s.packetBytes === bytes,
      `quality ${s.quality}, ${s.bitrate} bps, ${s.frameBytes[0]} bytes`);
  }
}

console.log('\n[Speex] Sound: correlated, band-limited under 4 kHz, on the source timeline');
{
  const x = voiceBand(3, NB);
  const { samples, info } = await opus.speexRoundTrip(x, NB);
  const p = peakLag(x, samples, 40, 800);
  check('the decoded voice correlates with the source, on time at the codec rate once the 80-sample delay is trimmed',
    p.lag === 0 && p.r > 0.8 && samples.length === x.length && info.lookahead === 80, `peak at ${p.lag}, r ${p.r.toFixed(3)}`);
  const noise = new Float32Array(3 * SR);
  let seed = 9;
  for (let i = 0; i < noise.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; noise[i] = 0.17 * (seed / 2 ** 32 * 2 - 1); }
  const wide = (await A.process(buffer(noise), { codec: 'speex', agc: false, volume: 1 })).samples;
  const voice = bandShareDb(wide, SR, 300, 3400), edge = bandShareDb(wide, SR, 3400, 4000), above = bandShareDb(wide, SR, 4500, 6500);
  // Above 6.5 kHz are the images of the receiver's linear-interpolation mixer.
  check('white noise comes out band-limited under 4 kHz: nothing from 4.5 to 6.5 kHz',
    voice > -1 && edge > -20 && above < -55, `300-3400 Hz ${voice.toFixed(1)} dB, 3.4-4 kHz ${edge.toFixed(1)} dB, 4.5-6.5 kHz ${above.toFixed(1)} dB of the total`);
  const speech = voiceBand(3, SR);
  const render = (await A.process(buffer(speech), { codec: 'speex', agc: false, volume: 1 })).samples;
  const s = peakLag(speech, render, 60, SR / 4);
  check('a render of voice correlates with its source', s.r > 0.8, `r ${s.r.toFixed(3)} at ${s.at.toFixed(2)} samples`);
  // Pulses at irregular times, centred on 2 kHz, where the phase lead of
  // Speex's high-pass filters is a fraction of a sample at 48 kHz.
  const pulses = new Float32Array(3 * SR);
  for (let t = 0.05, k = 7; t < 2.9;) {
    const c = Math.round(t * SR), width = 0.0006 * SR;
    for (let i = -173; i <= 173; i++) pulses[c + i] += 0.5 * Math.exp(-((i / width) ** 2)) * Math.cos(2 * Math.PI * 2000 * i / SR);
    k = (Math.imul(k, 1664525) + 1013904223) >>> 0;
    t += 0.011 + 0.02 * k / 2 ** 32;
  }
  const out = (await A.process(buffer(pulses), { codec: 'speex', agc: false, volume: 1 })).samples;
  const q = peakLag(pulses, out, 60, SR / 4);
  check('a render keeps the source timeline: the pulses\' correlation peak is within one sample at 48 kHz',
    q.lag === 0 && Math.abs(q.at) < 1 && out.length === pulses.length, `peak at ${q.at.toFixed(2)} samples, r ${q.r.toFixed(3)}`);
}

console.log('\n[Speex] Loss: Speex conceals a lost frame, and the frame log marks it');
{
  const x = voiceBand(2, NB), lost = 40, late = 60;
  const packets = [];
  const clean = await opus.speexRoundTrip(x, NB, { onPacket: (f, packet) => packets.push(packet) });
  const lossy = await opus.speexRoundTrip(x, NB, { makeLossMask: count => Uint8Array.from({ length: count }, (_, f) => f === lost ? 1 : f === late ? 2 : 0) });
  const info = lossy.info;
  check('the frame log marks the lost frame and the late one; the counts agree',
    info.frameLog[lost] === FRAME.lost && info.frameLog[late] === FRAME.late && info.lostFrames === 1 && info.underrunFrames === 1
    && info.frameLog.filter(c => c === FRAME.celt).length === info.frames - 2 && info.plc === 'speex' && info.frameBytes[lost] === 20,
    `frame ${lost}: code ${info.frameLog[lost]}, frame ${late}: code ${info.frameLog[late]}`);
  // Frame f plays from f * 160 - 80 (the delay is trimmed).
  const at = (samples, f) => samples.subarray(f * 160 - 80, f * 160 + 80);
  const concealed = at(lossy.samples, lost);
  const ref = await createCodec();
  for (let f = 0; f < lost; f++) ref.decode(packets[f]);
  const repeat = ref.decode(packets[lost - 1]);
  const own = await createCodec();
  for (let f = 0; f < lost; f++) own.decode(packets[f]);
  const plc = own.conceal();
  ref.free(); own.free();
  const diff = (a, b) => rms(Float32Array.from(a, (v, i) => v - b[i]));
  check('the lost frame is Speex\'s own concealment, sample for sample', same(concealed, plc), `${db(rms(concealed)).toFixed(1)} dBFS`);
  check('it is not silence, not the packet before decoded again, and not the frame before repeated',
    rms(concealed) > 0.25 * rms(at(clean.samples, lost)) && diff(concealed, repeat) > 0.1 * rms(concealed)
    && diff(concealed, at(lossy.samples, lost - 1)) > 0.1 * rms(concealed),
    `${db(rms(concealed)).toFixed(1)} dB against ${db(rms(at(clean.samples, lost))).toFixed(1)} dB received`);
  check('a late frame plays as silence', at(lossy.samples, late).every(v => v === 0) && rms(at(clean.samples, late)) > 0.01);
  const r = await A.process(buffer(voiceBand(3, SR)), { codec: 'speex', lossPct: 15, seed: 3 });
  const count = (code) => r.codecInfo.frameLog.filter(c => c === code).length;
  check('net_fakeloss in a render: lost 20 ms frames are concealed by Speex and logged',
    r.codecInfo.lostFrames > 5 && count(FRAME.lost) === r.codecInfo.lostFrames && r.codecInfo.plc === 'speex'
    && r.samples.every(Number.isFinite), `${r.codecInfo.lostFrames} of ${r.codecInfo.frames} frames lost`);
}

console.log('\n[Speex] Determinism, and the sender gate when it is turned on');
{
  const src = voiceBand(2, SR);
  const opts = { codec: 'speex', lossPct: 10, jitterMs: 50, seed: 7 };
  const a = await A.process(buffer(src), opts), b = await A.process(buffer(src), opts);
  check('the same input and settings give the same samples', same(a.samples, b.samples) && same(a.codecInfo.frameLog, b.codecInfo.frameLog));
  const x = voiceBand(1, NB);
  const c = await opus.speexRoundTrip(x, NB), d = await opus.speexRoundTrip(x, NB);
  check('the round trip is deterministic', same(c.samples, d.samples));
  // The same 70 frames twice: a quiet noise floor under the gate's
  // threshold, a burst of voice from frame 20, then the floor again. The gate
  // sends frames 14-66 of each (pre-roll 6, hold 22), so two talk spurts.
  // Each starts a fresh encoder and decoder, so the second sends the same
  // packets and plays the same samples as the first. Without the restart the
  // floor would leave the codec in another state.
  const part = new Float32Array(70 * 160);
  let s = 5;
  for (let i = 0; i < part.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; part[i] = 0.003 * (s / 2 ** 32 * 2 - 1); }
  voiceBand(0.5, NB).forEach((v, i) => { part[20 * 160 + i] += v; });
  const bursts = new Float32Array(2 * part.length);
  bursts.set(part);
  bursts.set(part, part.length);
  const sent = [];
  const g = await opus.speexRoundTrip(bursts, NB, { gate: { thresholdDb: -40, prerollFrames: 6, holdFrames: 22 },
    onPacket: (f, packet) => sent.push({ f, packet }) });
  const spurt = (from, to) => sent.filter(p => p.f >= from && p.f < to).map(p => Array.from(p.packet).join());
  const one = spurt(0, 70), two = spurt(70, 140);
  const played = (f0) => g.samples.subarray(f0 * 160 - 80, (f0 + 53) * 160 - 80);
  check('with the gate on, closed frames are not sent and each talk spurt restarts the encoder and decoder',
    g.info.spurts === 2 && g.info.gatedFrames === g.info.frames - 2 * 53 && g.info.frameBytes.every((n, f) => (g.info.frameLog[f] === FRAME.gated) === (n === 0))
    && one.length === 53 && two.length === 53 && one.every((p, i) => p === two[i]) && same(played(14), played(84)),
    `${g.info.spurts} spurts of ${one.length} and ${two.length} frames, ${g.info.gatedFrames} of ${g.info.frames} frames gated`);
  const viaProfile = await A.process(buffer(src), { codec: 'speex', gate: true });
  check('the profile\'s gate switch reaches the Speex round trip', viaProfile.codecInfo.gate === -39.5 && viaProfile.codecInfo.spurts >= 1,
    `${viaProfile.codecInfo.spurts} spurts, ${viaProfile.codecInfo.gatedFrames} gated`);
}

console.log('\n[Speex] The WebAssembly build agrees with a native build (tests/speex/native.mjs)');
{
  // Recorded from `node tests/speex/native.mjs`: the pinned sources built natively with
  // gcc 13.3 and glibc on x86-64, every seventh frame concealed.
  const NATIVE = {
    0: [1200, '6d89936d4a271351cea80a69325bb4a1a02eabe6e16db4697323b31dca305543', '9f9c552ff502826a9b283eb6785569565e57164a864a654a00611ebc07bbe4ac'],
    2: [3000, '444b306d2f776b951b6c30eb04289b3b7a293bc5643d646a8051352925c28acb', '2686b2e2da3a8782ac130a3a88fa9f5e9c544f65eb57983604830b32b9e1fe8c'],
    4: [4000, '8c89b29d6116fe78e8e94159c5948fcf05526b1a11a0894ef7837cce723c830a', '593d40cad9ca5ffd5462bddd9d7d5c3f443c85bf6bcc7feb551c90106a96c12d'],
    8: [7600, '41a7f6cfba8836799ca3bfedf97fb36acba40f6638c2f66bc33ad97bc84db444', '9e06142244a1c3abea13a56646993e6aa9677b487a7870cf2815456e34a5dc50'],
    10: [12400, '1de3bd634896c96075e47a0a1bbc021107723d3f001e004c9e4ee840e8f36763', '68eb6bdf7d1886b4ad39e33b8b618581c083b6c7d91e0e648601ccc74be95f9c']
  };
  const signal = testSignal();
  for (const quality of QUALITIES) {
    const [bytes, packets, decoded] = NATIVE[quality];
    const wasm = digest(await wasmStream(signal, quality));
    check(`quality ${quality}: packets and decoded output (concealment included) match the native build bit for bit`,
      wasm.frames === 200 && wasm.bytes === bytes && wasm.packets === packets && wasm.decoded === decoded, `${wasm.bytes} bytes`);
  }
}

console.log('\n[Speex] The live chain runs Speex frame by frame');
{
  const src = voiceBand(3, SR);
  const opts = { codec: 'speex', volume: 1 };
  const chain = await A.createLiveChain(opts, SR);
  const parts = [];
  for (let o = 0; o < src.length; o += SR / 50) parts.push(await chain.process(src.subarray(o, o + SR / 50)));
  const codes = chain.takeFrameCodes();
  const live = new Float32Array(parts.reduce((t, p) => t + p.length, 0));
  parts.reduce((o, p) => { live.set(p, o); return o + p.length; }, 0);
  chain.free();
  const offline = (await A.process(buffer(src), opts)).samples;
  // The chain's delay: Speex's 80 samples at 8 kHz and the output FIR's one sample at 44.1 kHz.
  const shift = Math.round((80 / NB + 1 / 44100) * SR);
  const r = correlate(offline, live.subarray(shift), 0, SR / 2);
  const level = db(rms(live, shift + SR / 2, live.length - SR / 2) / rms(offline, SR / 2, live.length - shift - SR / 2));
  let peak = 0;
  for (let d = -3; d <= 3; d++) if (correlate(offline, live.subarray(shift), d, SR / 2) > correlate(offline, live.subarray(shift), peak, SR / 2)) peak = d;
  check('the live chain codes with Speex 1.2.1 and reproduces the render (waveform and level)',
    chain.version === 'Speex 1.2.1' && r > 0.9 && Math.abs(level) < 0.5, `r ${r.toFixed(3)}, ${level.toFixed(2)} dB`);
  check('its stated delay includes Speex\'s 80 samples, and lines it up with the render to the sample',
    chain.contentDelay === shift && peak === 0 && chain.frameSize === 160, `contentDelay ${chain.contentDelay}, peak at ${peak}`);
  check('its frames are 20-byte Speex packets, logged with the CELT code',
    codes.length === chain.stats.frames && codes.every(c => c === FRAME.celt) && chain.stats.bytes === 20 * chain.stats.sent
    && chain.stats.modes.celt === chain.stats.sent, `${chain.stats.sent} frames, ${chain.stats.bytes} bytes`);
  const lossy = await A.createLiveChain({ codec: 'speex', lossPct: 30, seed: 5 }, SR);
  for (let o = 0; o < src.length; o += SR / 50) await lossy.process(src.subarray(o, o + SR / 50));
  const lossyCodes = lossy.takeFrameCodes();
  lossy.free();
  check('the live chain conceals lost frames with Speex and logs them', lossy.stats.lost > 5
    && lossyCodes.filter(c => c === FRAME.lost).length === lossy.stats.lost, `${lossy.stats.lost} of ${lossy.stats.frames} lost`);
}

console.log('\n[Speex] Wording');
{
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const option = /<option value="speex">([^<]*)<\/option>/.exec(html)?.[1] || '';
  const profile = PROFILES.speex;
  check('the profile and the page\'s option name Speex, not Opus SILK',
    profile.engine === 'speex' && /Speex/.test(profile.displayName) && !/SILK|Opus/.test(profile.displayName)
    && /Speex/.test(option) && !/SILK|Opus/.test(option), `${profile.displayName} / ${option}`);
}

console.log(`\n${passed} Speex checks passed`);
