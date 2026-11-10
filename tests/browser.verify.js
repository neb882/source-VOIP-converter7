'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { createStaticServer } = require('./static-server');

let passed = 0;
// The app shell cache sw.js populates, e.g. tf2ve-v13.
const SHELL_CACHE = `tf2ve-v${/CACHE_PREFIX\}v(\d+)/.exec(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'))[1]}`;
function check(condition, name, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? ` (${detail})` : ''}`);
  passed++;
  console.log(`  ok    ${name}${detail ? `   [${detail}]` : ''}`);
}

function wavTone(seconds, rate = 48000, frequency = 440) {
  const length = Math.round(seconds * rate);
  const buffer = Buffer.alloc(44 + length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + length * 2, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) {
    const sample = Math.sin(2 * Math.PI * frequency * i / rate) * 0.2;
    buffer.writeInt16LE(Math.round(sample * 0x7fff), 44 + i * 2);
  }
  return buffer;
}

// Speech-like test audio: gliding harmonics in syllables, with pauses, so
// alignment has something to lock onto (a steady tone would not do).
function wavSpeech(seconds, rate = 48000) {
  const length = Math.round(seconds * rate), buffer = Buffer.alloc(44 + length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + length * 2, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(length * 2, 40);
  let seed = 11, noise = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate, syllable = Math.floor(t / .23);
    const env = (syllable * 7919) % 5 ? Math.sin(Math.PI * ((t / .23) % 1)) ** 2 : 0;
    const f0 = 110 + 40 * Math.sin(t * 1.3) + 15 * (syllable % 4);
    seed = (seed * 1103515245 + 12345) >>> 0;
    noise += .3 * (seed / 4294967296 * 2 - 1 - noise);
    let v = .25 * noise;
    for (let h = 1; h <= 12; h++) v += Math.sin(2 * Math.PI * f0 * h * t + h) / (h + 1);
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, .12 * env * v)) * 0x7fff), 44 + i * 2);
  }
  return buffer;
}

// The fake microphone's signal, which Chromium resamples to the device rate
// and loops (--use-file-for-fake-audio-capture). Its own fake device plays a
// 400 Hz square-wave beep, whose cross-correlation has a peak every 2.5 ms;
// this has one. Seeded noise "syllables" of 80-380 ms, each with its own
// spectral tilt, at about -20 to -30 dBFS (the gate opens at -39.5), with
// pauses of 50-300 ms and, about one time in three, 600-1000 ms: past the
// gate's 440 ms hold and 120 ms pre-roll, so the gate closes between some of
// them. A floor at about -70 dBFS stays below the gate.
function wavProbe(seconds = 12, rate = 48000) {
  const length = Math.round(seconds * rate), buffer = Buffer.alloc(44 + length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + length * 2, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(length * 2, 40);
  let seed = 0x5eed, low = 0;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const samples = new Float64Array(length);
  for (let i = 0; i < length; i++) samples[i] = .0005 * (2 * random() - 1);
  for (let at = Math.round(rate * .1); at < length;) {
    const burst = Math.round(rate * (.08 + .3 * random()));
    const pause = Math.round(rate * (random() < .35 ? .6 + .4 * random() : .05 + .25 * random()));
    const tilt = .05 + .25 * random();   // a one-pole low-pass: how dark this syllable is
    for (let k = 0; k < burst && at + k < length; k++) {
      const white = 2 * random() - 1;
      low += tilt * (white - low);
      samples[at + k] += .175 * Math.sin(Math.PI * k / burst) ** .5 * (2 * low + .25 * white);
    }
    at += burst + pause;
  }
  for (let i = 0; i < length; i++) buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 0x7fff), 44 + i * 2);
  return buffer;
}

async function readRenderedWav(page) {
  return page.evaluate(async () => {
    const response = await fetch(document.getElementById('preview').src);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = (from, count) => String.fromCharCode(...bytes.slice(from, from + count));
    const view = new DataView(bytes.buffer);
    const rate = view.getUint32(24, true), frames = (bytes.length - 44) / 2;
    let power = 0;
    const crossings = [];
    for (let i = 0; i < frames; i++) {
      const value = view.getInt16(44 + i * 2, true) / 32768;
      power += value * value;
      // Ignore codec startup/end transients when checking the tone's pitch.
      if (i > rate * .05 && i < frames - rate * .05) {
        const previous = view.getInt16(44 + (i - 1) * 2, true) / 32768;
        if (previous <= 0 && value > 0) crossings.push(i - 1 - previous / (value - previous));
      }
    }
    return { size: bytes.length, riff: text(0, 4), wave: text(8, 4), rate, frames,
      format: view.getUint16(20, true), channels: view.getUint16(22, true), bits: view.getUint16(34, true),
      dataBytes: view.getUint32(40, true), rms: Math.sqrt(power / frames),
      toneHz: crossings.length > 1 ? rate * (crossings.length - 1) / (crossings.at(-1) - crossings[0]) : null };
  });
}

function checkRenderedTone(wav, source, label, deviceRate = 48000) {
  check(wav.riff === 'RIFF' && wav.wave === 'WAVE' && wav.size > 44,
    `${label}: populated PCM WAV`, `${wav.size} bytes`);
  check(wav.format === 1 && wav.channels === 1 && wav.bits === 16 && wav.dataBytes === wav.frames * 2,
    `${label}: mono 16-bit PCM header agrees with payload`);
  // The source is decoded at the file's own rate (filerate.js), whatever the
  // audio context's rate (44.1 kHz on CI, 48 kHz locally); since W3-10 the
  // render is at the listener's sound device's rate (snd_device_rate, 48000
  // Hz by default), with the source's duration at that rate.
  check(wav.rate === deviceRate, `${label}: the WAV is at the listener's device's rate`, `${wav.rate} Hz`);
  const frames = Math.round(source.length * deviceRate / source.rate);
  check(wav.frames === frames && wav.size === 44 + frames * 2,
    `${label}: the source's whole duration at that rate`, `${wav.frames} frames`);
  // Separately guard duration so a wrong decoder length cannot validate itself.
  // Chromium may round down by one sample during browser-side resampling.
  check(Math.abs(wav.frames / wav.rate - .5) <= 1 / wav.rate + 1e-9,
    `${label}: half-second fixture retains duration within one sample`);
  // At volume 1, the game's default since W3-10, the tone the gain clamps
  // fills the range: its RMS approaches full scale but cannot reach it.
  check(wav.rms > .01 && wav.rms < 1, `${label}: audible, bounded samples`, `rms ${wav.rms.toFixed(3)}`);
  check(wav.toneHz !== null && Math.abs(wav.toneHz - 440) < 2,
    `${label}: resampling preserves tone pitch`, `${wav.toneHz?.toFixed(2)} Hz`);
}

// A page whose audio device runs at `deviceRate`: every AudioContext it
// makes is made at that rate, as on a machine whose device runs there.
async function deviceRateContext(browser, deviceRate, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', ...options });
  await context.addInitScript((sampleRate) => {
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(options = {}) { super({ ...options, sampleRate }); }
    };
  }, deviceRate);
  return context;
}
const deviceRateOf = (page) => page.evaluate(async () => { const c = new AudioContext(), r = c.sampleRate; await c.close(); return r; });

async function verifySampleRateMatrix(browser, base) {
  console.log('\n[Browser 5] Explicit file-rate / device-rate matrix');
  for (const decodeRate of [44100, 48000]) {
    // A real AudioContext at the requested rate, not mocked decoded PCM.
    // Keep production defaults unchanged; exercise both CI and local paths.
    const context = await deviceRateContext(browser, decodeRate);
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      for (const fileRate of [44100, 48000]) {
        const label = `${fileRate} Hz file -> ${decodeRate} Hz browser`;
        await page.locator('#file').setInputFiles({ name: `tone-${fileRate}.wav`, mimeType: 'audio/wav', buffer: wavTone(.5, fileRate) });
        await page.waitForFunction(() => !document.getElementById('process').disabled);
        const source = await page.evaluate(() => ({ rate: state.decodedSource.sampleRate, length: state.decodedSource.length }));
        check(await deviceRateOf(page) === decodeRate && source.rate === fileRate,
          `${label}: the device runs at ${decodeRate} Hz and the file is decoded at its own rate`, `${source.rate} Hz`);
        await page.locator('#process').click();
        await page.waitForFunction(() => !document.getElementById('download').disabled, null, { timeout: 60000 });
        checkRenderedTone(await readRenderedWav(page), source, label);
        const log = await page.locator('#console-out').textContent();
        check(log.includes('libopus 1.1.5, 32 kbps VBR + DTX') && !log.includes('compatibility path'),
          `${label}: real Opus conversion completes in the worker`);
      }
      if (decodeRate === 44100) {
        // Opus decodes at 48 kHz, whatever rate its header says it was made
        // from. A WebM's rate is not read: it is decoded at the device rate,
        // as before, and the console says so.
        await page.locator('#file').setInputFiles(path.join(__dirname, 'filerate', 'tone_16000.opus'));
        await page.waitForFunction(() => state.sourceName === 'tone_16000.opus' && !els.process.disabled);
        const opus = await page.evaluate(() => ({ rate: state.decodedSource.sampleRate, length: state.decodedSource.length }));
        check(opus.rate === 48000 && opus.length === 24000, 'an Ogg Opus file made from 16 kHz decodes at 48 kHz on a 44.1 kHz device', `${opus.rate} Hz, ${opus.length} samples`);
        await page.locator('#file').setInputFiles(path.join(__dirname, 'filerate', 'tone_16000.webm'));
        await page.waitForFunction(() => state.sourceName === 'tone_16000.webm' && !els.process.disabled);
        const webm = await page.evaluate(() => ({ rate: state.decodedSource.sampleRate, log: document.getElementById('console-out').textContent }));
        check(webm.rate === 44100 && webm.log.includes('"tone_16000.webm" was decoded at the audio device\'s rate, 44,100 Hz, because its sample rate could not be read from its header'),
          'a WebM, whose rate is not read, still loads, at the device rate, and the console says why', `${webm.rate} Hz`);
      }
      check(errors.length === 0, `${decodeRate} Hz browser: no page errors`, errors.join('; '));
    } finally { await context.close(); }
  }
}

// The 16-bit samples of a WAV that wavTone or encodeWav wrote.
const wavSamples = (buffer) => Array.from({ length: (buffer.length - 44) / 2 }, (_, i) => buffer.readInt16LE(44 + 2 * i));

// A file is decoded at its own rate, not the audio device's (filerate.js):
// the device runs at 48 kHz here, and no file below is at 48 kHz.
async function verifyNativeRate(browser, base) {
  console.log('\n[Browser 7] A file decoded at its own rate, on a 48 kHz device');
  const context = await deviceRateContext(browser, 48000);
  try {
    // Chromium's decoder maps a 16-bit sample k to k / 32768 below zero and
    // k / 32767 above (measured: within 0.00025 of k after scaling back), so
    // "the file's own samples" is: every decoded sample scales back to the
    // file's k to within a thousandth of a step. A resampled one would not.
    await context.addInitScript(() => {
      window.sameSamples = (got, pcm) => got.length === pcm.length
        && pcm.every((k, i) => Math.abs(got[i] * (got[i] > 0 ? 32767 : 32768) - k) < 1e-3);
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    check(await deviceRateOf(page) === 48000, 'the page\'s audio device runs at 48 kHz');
    const load = async (file) => {
      await page.locator('#file').setInputFiles(file);
      const name = typeof file === 'string' ? path.basename(file) : file.name;
      await page.waitForFunction((n) => state.sourceName === n && !els.process.disabled, name);
    };
    // Whether the source's samples are exactly these 16-bit samples.
    const sameAs = (expected) => page.evaluate((pcm) => {
      const got = state.decodedSource.getChannelData(0);
      return { same: sameSamples(got, pcm), rate: state.decodedSource.sampleRate, length: got.length, status: els.status.textContent };
    }, expected);

    // 16-bit WAV and FLAC: the decoded samples are the file's samples.
    for (const rate of [44100, 22050]) {
      const wav = wavTone(.5, rate), pcm = wavSamples(wav);
      await load({ name: `own-${rate}.wav`, mimeType: 'audio/wav', buffer: wav });
      const got = await sameAs(pcm);
      check(got.same && got.rate === rate && got.status.includes(`${rate.toLocaleString('en-US')} Hz`),
        `a 16-bit WAV at ${rate} Hz decodes to exactly its own samples, and the status shows its rate`, got.status);
      const flac = await page.evaluate(({ pcm, rate }) => [...TF2Flac.encode(Int16Array.from(pcm), rate)], { pcm, rate });
      await load({ name: `own-${rate}.flac`, mimeType: 'audio/flac', buffer: Buffer.from(flac) });
      const fromFlac = await sameAs(pcm);
      check(fromFlac.same && fromFlac.rate === rate, `a FLAC at ${rate} Hz decodes to exactly its own samples`, `${fromFlac.length} samples`);
    }

    // Lossy files: their own rate, and their length (half a second of tone).
    // MP3 with a LAME tag and AAC in MP4 come out exact; Vorbis loses part
    // of a block and ADTS keeps the encoder's priming and padding.
    const lossy = [['tone_44100.mp3', 44100, 1], ['tone_22050.mp3', 22050, 1], ['tone_11025.mp3', 11025, 1],
      ['tone_44100.m4a', 44100, 1], ['tone_22050.m4a', 22050, 1], ['tone_22050.ogg', 22050, 2048],
      // ADTS cannot say whether the stream carries SBR: twice the 22.05 kHz core.
      ['tone_22050.aac', 44100, 2 * 2048],
      // PCM in a QuickTime version 2 sound description (a tenth of a second).
      ['tone_96000_lpcm.mov', 96000, 0, .1]];
    for (const [name, rate, within, seconds = .5] of lossy) {
      await load(path.join(__dirname, 'filerate', name));
      const got = await page.evaluate(() => ({ rate: state.decodedSource.sampleRate, length: state.decodedSource.length }));
      check(got.rate === rate && Math.abs(got.length - rate * seconds) <= within, `${name} decodes at ${rate} Hz to its length`, `${got.rate} Hz, ${got.length} samples`);
    }

    // The fallbacks: a file always loads.
    // Chromium's OfflineAudioContext and its decoder both take 3 to 768 kHz,
    // so a rate the context refuses but the decoder takes needs another
    // browser: here a context that takes only the standard's 8 to 96 kHz.
    await page.evaluate(() => {
      const Offline = window.__offline = window.OfflineAudioContext;
      window.OfflineAudioContext = class extends Offline {
        constructor(channels, length, rate) {
          if (rate < 8000 || rate > 96000) throw new DOMException(`${rate} Hz is not supported`, 'NotSupportedError');
          super(channels, length, rate);
        }
      };
    });
    await load({ name: 'low-4000.wav', mimeType: 'audio/wav', buffer: wavTone(.5, 4000, 220) });
    await page.evaluate(() => { window.OfflineAudioContext = window.__offline; });
    const low = await page.evaluate(() => ({ rate: state.decodedSource.sampleRate, log: document.getElementById('console-out').textContent }));
    check(low.rate === 48000 && low.log.includes('"low-4000.wav" was decoded at the audio device\'s rate, 48,000 Hz, because 4,000 Hz is a rate this browser cannot decode at'),
      'a rate the OfflineAudioContext refuses loads at the device rate and the console says why', `${low.rate} Hz`);
    await page.evaluate(() => {
      OfflineAudioContext.prototype.decodeAudioData = () => Promise.reject(new DOMException('refused by the test', 'EncodingError'));
    });
    const refusedWav = wavTone(.5, 22050);
    await load({ name: 'refused-22050.wav', mimeType: 'audio/wav', buffer: refusedWav });
    const refused = await page.evaluate(() => ({ rate: state.decodedSource.sampleRate, length: state.decodedSource.length, log: document.getElementById('console-out').textContent }));
    await page.evaluate(() => { delete OfflineAudioContext.prototype.decodeAudioData; });
    check(refused.rate === 48000 && Math.abs(refused.length - 24000) <= 1 && refused.log.includes('"refused-22050.wav" was decoded at the audio device\'s rate, 48,000 Hz, because the decode at 22,050 Hz failed'),
      'when the decode at the file\'s rate fails, the file loads at the device rate from its bytes read again', `${refused.rate} Hz, ${refused.length} samples`);

    // Two loads overlapping: a long file, then a short one chosen while the
    // long one is still being decoded. The newer one must be the source, on
    // the file-rate path and on the fallback path (a context that refuses
    // every rate). Both files are made here; the long one is 500 s.
    const race = (fallback) => page.evaluate(async (fallback) => {
      const wav = (seconds, rate, name) => {
        const n = Math.round(seconds * rate), bytes = new Uint8Array(44 + 2 * n), view = new DataView(bytes.buffer);
        const text = (at, s) => [...s].forEach((c, i) => { bytes[at + i] = c.charCodeAt(0); });
        text(0, 'RIFF'); view.setUint32(4, 36 + 2 * n, true); text(8, 'WAVEfmt '); view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, 2 * rate, true);
        view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, 2 * n, true);
        for (let i = 0; i < n; i++) view.setInt16(44 + 2 * i, Math.round(6000 * Math.sin(2 * Math.PI * 440 * i / rate)), true);
        return new File([bytes], name, { type: 'audio/wav' });
      };
      const long = wav(500, 44100, 'race-long.wav'), short = wav(.2, 22050, 'race-short.wav');
      const Offline = window.OfflineAudioContext, base = BaseAudioContext.prototype, decode = base.decodeAudioData;
      if (fallback) window.OfflineAudioContext = class { constructor() { throw new DOMException('refused by the test', 'NotSupportedError'); } };
      let begun;
      const decoding = new Promise((resolve) => { begun = resolve; });
      base.decodeAudioData = function (...args) { begun(); return decode.apply(this, args); };
      try {
        const first = loadSourceFile(long);
        await decoding;
        await Promise.all([first, loadSourceFile(short)]);
        return { name: state.sourceName, length: state.decodedSource.length, rate: state.decodedSource.sampleRate };
      } finally { base.decodeAudioData = decode; window.OfflineAudioContext = Offline; }
    }, fallback);
    for (const fallback of [false, true]) {
      const got = await race(fallback);
      check(got.name === 'race-short.wav' && got.length === (fallback ? 9600 : 4410),
        `a file chosen while a longer one is still decoding stays the source (${fallback ? 'device-rate fallback' : 'file-rate path'})`, `${got.name}, ${got.rate} Hz`);
    }

    // Every source rate the page can now meet renders through the default preset.
    await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
    const rendered = [];
    for (const rate of [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000]) {
      await load({ name: `render-${rate}.wav`, mimeType: 'audio/wav', buffer: wavTone(.5, rate) });
      await page.locator('#process').click();
      await page.waitForFunction(() => !els.dl.disabled && state.processedBuffer, null, { timeout: 60000 });
      // Since W3-10 the render is at the device's rate, 48000 Hz by default,
      // whatever the source's rate, with the source's whole duration.
      const wav = await readRenderedWav(page), length = await page.evaluate(() => state.decodedSource.length);
      const outRate = 48000;
      rendered.push(`${rate}: ${wav.rate} Hz ${wav.frames} rms ${wav.rms.toFixed(3)} ${wav.toneHz?.toFixed(1)} Hz`);
      check(length === Math.round(rate / 2) && wav.rate === outRate && wav.frames === Math.round(length * outRate / rate) && wav.rms > .01 && Math.abs(wav.toneHz - 440) < 2,
        `a ${rate} Hz source renders at ${outRate} Hz, its whole length, and is not silent`, rendered.at(-1));
    }

    // A take loaded for comparison is decoded at its own rate too.
    await load({ name: 'speech-48000.wav', mimeType: 'audio/wav', buffer: wavSpeech(6) });
    await page.locator('#process').click();
    await page.waitForFunction(() => !els.dl.disabled && state.processedBuffer, null, { timeout: 60000 });
    const take = Buffer.from(await page.evaluate(async () => {
      const sim = state.processedBuffer, rate = state.processedRate;
      const shifted = TF2Reference.warp(sim, rate, { offsetSeconds: .25, scale: 1 }, rate, sim.length + rate);
      return [...new Uint8Array(await TF2Audio.encodeWav(TF2Audio.resampleSinc(shifted.map(v => v * .5), rate, 22050), 22050).arrayBuffer())];
    }));
    await page.locator('#reference summary').click();
    await page.locator('#reference-file').setInputFiles({ name: 'take-22050.wav', mimeType: 'audio/wav', buffer: take });
    await page.waitForFunction(() => state.realTake && document.querySelector('#reference-report table'), null, { timeout: 60000 });
    const real = await page.evaluate((pcm) => {
      return { same: sameSamples(referenceDecoded.decoded.getChannelData(0), pcm), rate: referenceDecoded.decoded.sampleRate, aligned: state.realTake.rate };
    }, wavSamples(take));
    check(real.same && real.rate === 22050 && real.aligned === 22050, 'a 22.05 kHz take decodes to exactly its own samples and is lined up at its rate', `${real.rate} Hz`);

    // And a batch file.
    await page.locator('#batch-files').setInputFiles({ name: 'batch-22050.wav', mimeType: 'audio/wav', buffer: wavTone(.5, 22050) });
    await page.locator('#batch-run').click();
    await page.waitForFunction(() => /1 rendered/.test(document.getElementById('batch-summary').textContent), null, { timeout: 120000 });
    const item = await page.evaluate(() => TF2Batch.items().map(i => ({ rate: i.sourceRate, error: i.error })));
    check(item.length === 1 && item[0].rate === 22050 && !item[0].error, 'a batch file is decoded at its own rate', JSON.stringify(item));
    check(errors.length === 0, 'files decoded at their own rate: no page errors', errors.join('; '));
  } finally { await context.close(); }
}

// Visualizer zoom, scales, meter and loudness-matched A/B, on the last render.
async function verifyVisualizerTools(page) {
  console.log('\n[Browser 3c] Zoom, scales, meter, and loudness-matched A/B');
  const view = () => page.evaluate(() => document.getElementById('visualizer').dataset.view || '');
  const span = (v) => { const m = /:([\d.]+)-([\d.]+)$/.exec(v); return m ? Number(m[2]) - Number(m[1]) : NaN; };
  await page.locator('#viz-wave').click();
  await page.waitForFunction(() => (document.getElementById('visualizer').dataset.view || '').startsWith('wave'));
  const full = span(await view());
  await page.locator('#viz-zoom-in').click();
  await page.locator('#viz-zoom-in').click();
  await page.waitForFunction((f) => {
    const m = /:([\d.]+)-([\d.]+)$/.exec(document.getElementById('visualizer').dataset.view || '');
    return m && Number(m[2]) - Number(m[1]) < f * 0.3;
  }, full);
  check(Math.abs(span(await view()) - full / 4) < 0.01, 'two zoom steps show a quarter of the file', `${span(await view()).toFixed(3)} of ${full.toFixed(3)} s`);
  await page.locator('#visualizer').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('0');
  await page.waitForFunction((f) => {
    const m = /:([\d.]+)-([\d.]+)$/.exec(document.getElementById('visualizer').dataset.view || '');
    return m && Math.abs(Number(m[2]) - Number(m[1]) - f) < 1e-3;
  }, full);
  check(true, 'keyboard pans and 0 returns to the whole file');
  const box = await page.locator('#visualizer').boundingBox();
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5);
  const seeked = await page.evaluate(() => document.getElementById('preview').currentTime / document.getElementById('preview').duration);
  check(Math.abs(seeked - 0.75) < 0.02, 'a click on the waveform seeks the player', seeked.toFixed(3));
  await page.locator('#viz-log').click();
  check(await page.locator('#viz-log').getAttribute('aria-pressed') === 'true' && !(await page.locator('#viz-range').isHidden()),
    'WAVE switches to a dBFS amplitude scale with a selectable range');
  await page.locator('#viz-log').click();
  await page.locator('#viz-spec').click();
  const wasLog = await page.locator('#viz-log').getAttribute('aria-pressed') === 'true';
  if (!wasLog) await page.locator('#viz-log').click();
  await page.waitForFunction(() => (document.getElementById('visualizer').dataset.view || '').startsWith('spec:log'));
  check(true, 'SPEC renders a log-frequency spectrogram');
  const range = await page.locator('#viz-range').textContent();
  await page.locator('#viz-range').click();
  check(await page.locator('#viz-range').textContent() !== range, 'the dynamic range button cycles');
  await page.locator('#viz-range').click(); await page.locator('#viz-range').click(); await page.locator('#viz-range').click();
  if (!wasLog) await page.locator('#viz-log').click();
  await page.locator('#viz-wave').click();

  await page.waitForFunction(() => document.querySelectorAll('#meter-rows tr').length >= 2
    && !document.getElementById('meter-rows').textContent.includes('…'), null, { timeout: 60000 });
  const meter = await page.evaluate(() => [...document.querySelectorAll('#meter-rows tr')].map(r => [...r.children].map(c => c.textContent)));
  const lufs = (row) => Number(row[1].replace('−', '-'));
  check(meter[0][0] === 'WET' && meter[1][0] === 'DRY' && Number.isFinite(lufs(meter[0])) && Number.isFinite(lufs(meter[1])),
    'meter lists integrated loudness for the render and the source', `${meter[0][1]} / ${meter[1][1]} LUFS`);
  await page.locator('#ab-match').click();
  const matched = await page.locator('#ab-match').textContent();
  const gains = await page.evaluate(() => ({ louder: state.abLouder, offset: state.abOffsetDb }));
  check(/^Matched: (wet|dry) −?\d+\.\d dB$/.test(matched) && gains.offset <= 0
    && Math.abs(Math.abs(gains.offset) - Math.abs(lufs(meter[0]) - lufs(meter[1]))) < 0.11,
    'loudness matching lowers the louder version by the LUFS difference', matched);
  await page.locator('#ab-match').click();
  await page.locator('h1').click();
  const before = await page.locator('#ab-toggle').textContent();
  await page.keyboard.press('b');
  check(await page.locator('#ab-toggle').textContent() !== before, 'the B key switches A/B');
  await page.keyboard.press('b');
}

async function verifyLanesAndSelection(page) {
  console.log('\n[Browser 3d] Codec and loudness lanes, frequency zoom, resolution, selection and loop');
  const view = () => page.evaluate(() => document.getElementById('visualizer').dataset.view || '');
  const band = (v) => { const m = /:f([\d.]+)-([\d.]+):/.exec(v); return m ? [Number(m[1]), Number(m[2])] : null; };
  const span = (v) => { const m = /:([\d.]+)-([\d.]+)$/.exec(v); return m ? Number(m[2]) - Number(m[1]) : NaN; };
  // The canvas's place on screen, read before each gesture (clicks may scroll the page).
  const canvasBox = async () => { await page.locator('#visualizer').scrollIntoViewIfNeeded(); return page.locator('#visualizer').boundingBox(); };
  let box = await canvasBox();
  await page.mouse.move(0, 0);
  await page.locator('#viz-wave').click();
  await page.waitForFunction(() => (document.getElementById('visualizer').dataset.view || '').startsWith('wave'));
  // Pixels of a lane, as [r, g, b] per pixel of its middle row or of its whole height.
  const lanePixels = (region) => page.evaluate((which) => {
    const canvas = document.getElementById('visualizer'), rect = canvas.getBoundingClientRect(), scale = canvas.width / rect.width;
    const L = vizLayout(rect.width, rect.height);
    const [y0, h] = which === 'lane' ? [L.laneY + L.laneH / 2, 1] : [L.lufsY + 2, L.lufsH - 4];
    if (!h || (which === 'lane' && !L.laneH)) return [];
    const data = canvas.getContext('2d').getImageData(0, Math.round(y0 * scale), canvas.width, Math.max(1, Math.round(h * scale))).data;
    const out = [];
    for (let i = 0; i < data.length; i += 4) out.push([data[i], data[i + 1], data[i + 2]]);
    return out;
  }, region);

  const lane = await page.evaluate(() => {
    const info = state.lastCodecInfo;
    const items = [...document.querySelectorAll('#viz-legend .lg-item')].filter(e => e.querySelector('.lg-box')).map(e => e.textContent);
    return { frames: info.frames, log: info.frameLog.length, bytes: info.frameBytes.reduce((a, b) => a + b, 0), encoded: info.encodedBytes,
      items, sum: items.reduce((n, t) => n + Number(t.split(' ').pop()), 0), legend: !document.getElementById('viz-legend').hidden,
      colors: FRAME_STYLE.map(f => f.color) };
  });
  check(lane.log === lane.frames && lane.bytes === lane.encoded && lane.legend && lane.sum === lane.frames,
    'the codec lane logs every frame and its legend counts them', lane.items.join(', '));
  const hex = (c) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  const laneColors = new Set((await lanePixels('lane')).map(hex));
  check([...laneColors].some(c => lane.colors.includes(c)), 'the codec lane is drawn under the waveform in the frame colours', [...laneColors].slice(0, 4).join(' '));

  await page.locator('#viz-lufs').click();
  await page.waitForFunction(() => state.meterStats && state.meterStats.wet && state.meterStats.wet.history);
  const lufsLegend = await page.locator('#viz-legend').textContent();
  const blue = (await lanePixels('lufs')).filter(([r, g, b]) => b > 80 && b > r + 30).length;
  check(await page.locator('#viz-lufs').getAttribute('aria-pressed') === 'true' && lufsLegend.includes('Loudness') && blue > 0,
    'the loudness lane draws the render\'s loudness history', `${blue} px`);

  // Frequency zoom and resolution, on the linear axis.
  await page.locator('#viz-spec').click();
  if (await page.locator('#viz-log').getAttribute('aria-pressed') === 'true') await page.locator('#viz-log').click();
  await page.waitForFunction(() => (document.getElementById('visualizer').dataset.view || '').startsWith('spec:lin'));
  const fullBand = band(await view());
  box = await canvasBox();
  const mainH = await page.evaluate(() => { const r = document.getElementById('visualizer').getBoundingClientRect(); return vizLayout(r.width, r.height).mainH; });
  await page.mouse.move(box.x + 10, box.y + mainH * 0.8);
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await page.waitForFunction((hi) => { const m = /:f([\d.]+)-([\d.]+):/.exec(document.getElementById('visualizer').dataset.view || ''); return m && Number(m[2]) - Number(m[1]) < hi * 0.5; }, fullBand[1]);
  const zoomedBand = band(await view());
  check(fullBand[0] === 0 && zoomedBand[1] - zoomedBand[0] < (fullBand[1] - fullBand[0]) * 0.5,
    'the wheel over the frequency ruler zooms the spectrogram\'s band', `${zoomedBand[0].toFixed(0)}–${zoomedBand[1].toFixed(0)} Hz`);
  box = await canvasBox();
  await page.mouse.dblclick(box.x + 10, box.y + mainH * 0.5);
  await page.waitForFunction((hi) => { const m = /:f([\d.]+)-([\d.]+):/.exec(document.getElementById('visualizer').dataset.view || ''); return m && Number(m[2]) === hi; }, fullBand[1]);
  await page.locator('#visualizer').focus();
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction((hi) => { const m = /:f([\d.]+)-([\d.]+):/.exec(document.getElementById('visualizer').dataset.view || ''); return m && Number(m[2]) - Number(m[1]) < hi * 0.6; }, fullBand[1]);
  await page.keyboard.press('0');
  await page.waitForFunction((hi) => { const m = /:f([\d.]+)-([\d.]+):/.exec(document.getElementById('visualizer').dataset.view || ''); return m && Number(m[2]) === hi && Number(m[1]) === 0; }, fullBand[1]);
  check(true, 'double-click on the ruler, ↑ and 0 reset and zoom the band');

  const resolution = () => page.evaluate(() => (vizImage && vizImage.tiers ? { fixed: vizImage.fixed, windows: vizImage.tiers.map(t => t.windowSec), rate: audibleBuffer().rate } : null));
  const whole = await resolution();
  await page.locator('#viz-zoom-in').click();
  await page.locator('#viz-zoom-in').click();
  await page.waitForFunction(() => vizImage && vizImage.tiers && (document.getElementById('visualizer').dataset.view || '').startsWith('spec') && vizImage.t1 - vizImage.t0 < 0.2);
  const zoomed = await resolution();
  check(!whole.fixed && zoomed.windows[0] < whole.windows[0], 'AUTO resolution shortens the window when zoomed in on time',
    `${(whole.windows[0] * 1000).toFixed(1)} → ${(zoomed.windows[0] * 1000).toFixed(1)} ms`);
  await page.locator('#viz-res').selectOption('4096');
  await page.waitForFunction(() => vizImage && vizImage.fixed === 4096 && (document.getElementById('visualizer').dataset.view || '').startsWith('spec'));
  const fixed = await resolution();
  check(fixed.windows.every(w => Math.abs(w - 4096 / fixed.rate) < 1e-9), 'a fixed RES sets the FFT size', `${(fixed.windows[0] * 1000).toFixed(1)} ms`);
  await page.locator('#viz-res').selectOption('auto');
  await page.locator('#viz-fit').click();

  // Selection: Shift + drag, meter statistics for it, Shift + click, loop, zoom, Esc.
  await page.locator('#viz-wave').click();
  await page.waitForFunction(() => (document.getElementById('visualizer').dataset.view || '').startsWith('wave'));
  box = await canvasBox();
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + box.width * 0.04, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.96, box.y + 30, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForFunction(() => !document.getElementById('meter-sel').hidden && document.querySelectorAll('#meter-rows tr').length >= 2
    && !document.getElementById('meter-rows').textContent.includes('…'), null, { timeout: 60000 });
  const selected = await page.evaluate(() => {
    const rate = state.processedRate, from = Math.floor(vizSel.t0 * rate), to = Math.ceil(vizSel.t1 * rate);
    return { t0: vizSel.t0, t1: vizSel.t1, expect: TF2Meter.analyze(state.processedBuffer.subarray(from, to), rate).integrated,
      shown: Number(document.querySelector('#meter-rows tr td').textContent.replace('−', '-')), text: document.getElementById('meter-sel-text').textContent };
  });
  check(Math.abs(selected.t0 - 0.02) < 0.01 && Math.abs(selected.t1 - 0.48) < 0.01 && Math.abs(selected.shown - selected.expect) < 0.051,
    'Shift + drag selects a range and the meter measures it', `${selected.text}; ${selected.shown} LUFS`);
  box = await canvasBox();
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + box.width * 0.6, box.y + 30);
  await page.keyboard.up('Shift');
  const extended = await page.evaluate(() => vizSel && [vizSel.t0, vizSel.t1]);
  check(Math.abs(extended[0] - 0.02) < 0.01 && Math.abs(extended[1] - 0.3) < 0.01, 'Shift + click moves the nearer end of the selection', extended.map(t => t.toFixed(3)).join('–'));
  await page.locator('h1').click();
  await page.keyboard.press('l');
  check(await page.locator('#viz-loop').getAttribute('aria-pressed') === 'true' && !(await page.evaluate(() => document.getElementById('preview').loop)),
    'L loops the selection (not the whole file)');
  await page.locator('#visualizer').focus();
  await page.keyboard.press('z');
  await page.waitForFunction(() => { const m = /:([\d.]+)-([\d.]+)$/.exec(document.getElementById('visualizer').dataset.view || ''); return m && Number(m[2]) - Number(m[1]) < 0.4; });
  check(Math.abs(span(await view()) - 0.28 * 1.1) < 0.01, 'Z zooms to the selection', span(await view()).toFixed(3));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('meter-sel').hidden);
  check(await page.evaluate(() => document.getElementById('preview').loop), 'Esc clears the selection; the loop then covers the whole file');
  await page.locator('h1').click();
  await page.keyboard.press('l');
  check(await page.locator('#viz-loop').getAttribute('aria-pressed') === 'false' && !(await page.evaluate(() => document.getElementById('preview').loop)), 'L turns the loop off');
  await page.locator('#viz-lufs').click();
  await page.locator('#viz-fit').click();
}

async function verifyAverageAndRealTake(page) {
  console.log('\n[Browser 3e] Average spectrum and the real-take comparison');
  const view = () => page.evaluate(() => document.getElementById('visualizer').dataset.view || '');
  await page.locator('#file').setInputFiles({ name: 'speech.wav', mimeType: 'audio/wav', buffer: wavSpeech(6) });
  await page.waitForFunction(() => state.sourceName === 'speech.wav' && !document.getElementById('process').disabled);
  await page.locator('#process').click();
  await page.waitForFunction(() => !document.getElementById('download').disabled, null, { timeout: 60000 });
  await page.locator('#viz-bars').click();
  if (await page.locator('#viz-avg').getAttribute('aria-pressed') !== 'true') await page.locator('#viz-avg').click();
  await page.waitForFunction(() => (document.getElementById('visualizer').dataset.view || '').startsWith('avg:dry'), null, { timeout: 60000 });
  check((await view()).startsWith('avg:dry:0.0000-6.0000'), 'BARS AVG shows the average spectrum of the render against the source', await view());

  // A take made from the render: 0.4321 s late, its clock 100 ppm fast,
  // 6 dB down, recorded at 44.1 kHz.
  const wav = await page.evaluate(async () => {
    const sim = state.processedBuffer, rate = state.processedRate, k = 1.0001;
    const take = TF2Reference.warp(sim, rate, { offsetSeconds: .4321, scale: 1 / k }, rate, sim.length + rate);
    const at44 = TF2Audio.resampleSinc(take.map(v => v * .5), rate, 44100);
    return [...new Uint8Array(await TF2Audio.encodeWav(at44, 44100).arrayBuffer())];
  });
  await page.locator('#reference summary').click();
  await page.locator('#reference-file').setInputFiles({ name: 'take.wav', mimeType: 'audio/wav', buffer: Buffer.from(wav) });
  await page.waitForFunction(() => document.querySelector('#reference-report table'), null, { timeout: 60000 });
  const take = await page.evaluate(() => ({ segments: state.realTake.timeline.segments.length,
    delay: state.realTake.timeline.segments[0].a, ppm: state.realTake.timeline.segments[0].clockPpm,
    status: document.getElementById('reference-status').textContent,
    bands: [...document.querySelectorAll('#reference-report tbody td')].map(td => td.textContent),
    rows: [...document.querySelectorAll('#meter-rows tr th')].map(th => th.textContent) }));
  check(take.segments === 1 && Math.abs(take.delay - .4321) < .001 && Math.abs(take.ppm - 100) < 10,
    'a real take is found in the source and lined up (delay and clock)', `${take.segments} segment, ${(take.delay * 1000).toFixed(2)} ms, ${take.ppm.toFixed(1)} ppm; ${take.status}`);
  const within = take.bands.slice(0, 13).map(t => Math.abs(Number(t.replace('−', '-'))));
  check(within.every(d => d <= .3), 'the report finds the take and the render alike, band by band up to 12 kHz', take.bands.join(' '));
  check(take.rows.includes('REAL') && take.rows.includes('Δ real'), 'the meter adds the real take and wet minus real');
  await page.locator('#ab-toggle').click();
  await page.locator('#ab-toggle').click();
  check(await page.locator('#ab-toggle').textContent() === 'A/B: Real' && await page.evaluate(() => audibleBuffer().label) === 'REAL',
    'A/B cycles to the real take');
  await page.waitForFunction(() => (document.getElementById('visualizer').dataset.view || '').startsWith('avg:real'), null, { timeout: 60000 });
  check(true, 'AVG compares the render with the real take once one is loaded');
  await page.locator('#reference-clear').click();
  check(await page.evaluate(() => !state.realTake) && await page.locator('#ab-toggle').textContent() === 'A/B: Wet'
    && !(await page.evaluate(() => [...document.querySelectorAll('#meter-rows tr th')].some(th => th.textContent === 'REAL'))),
    'removing the take restores wet/dry A/B and the meter');
  await page.locator('#viz-avg').click();
  await page.locator('#viz-wave').click();
}

// Video in and out: the audio of an MP4 or MOV is the source, and the render
// goes back into the video, which is copied sample for sample.
async function verifyVideo(page) {
  console.log('\n[Browser 3g] Video in and out');
  const TF2Video = require('../video.js');
  for (const name of ['vp9_opus.mp4', 'h264_pcm.mov']) {
    const file = path.join(__dirname, 'video', name);
    await page.locator('#file').setInputFiles(file);
    await page.waitForFunction((n) => state.sourceName === n && !document.getElementById('process').disabled
      && !document.getElementById('download-video').hidden, name);
    const shown = await page.evaluate(() => ({ hidden: document.getElementById('download-video').hidden,
      disabled: document.getElementById('download-video').disabled, label: document.getElementById('download-video').textContent }));
    check(!shown.hidden && shown.disabled, `${name}: a video source offers the video download once rendered`, shown.label);
    await page.locator('#process').click();
    await page.waitForFunction(() => !document.getElementById('download-video').disabled, null, { timeout: 60000 });
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-video').click()]);
    const bytes = new Uint8Array(fs.readFileSync(await download.path()));
    const a = TF2Video.parse(new Uint8Array(fs.readFileSync(file))), b = TF2Video.parse(bytes);
    const va = a.tracks.find(t => t.handler === 'vide'), vb = b.tracks.find(t => t.handler === 'vide');
    const same = va.samples.length === vb.samples.length && va.samples.every((s, i) => {
      const x = a.u8.subarray(s.offset, s.offset + s.size), y = b.u8.subarray(vb.samples[i].offset, vb.samples[i].offset + vb.samples[i].size);
      return x.length === y.length && x.every((v, k) => v === y[k]);
    });
    const audio = b.tracks.filter(t => t.handler === 'soun');
    const ext = name.endsWith('.mov') ? 'mov' : 'mp4';
    check(same && audio.length === 1 && download.suggestedFilename().endsWith(`_tf2_steam.${ext}`),
      `${name}: Download video keeps the picture byte for byte and carries the render`, `${download.suggestedFilename()}, audio ${audio[0] && audio[0].format}`);
  }
  // A video dropped on the page loads as the source like one chosen in step 1
  // (a .mov is video/quicktime, not audio), and the status says what to do.
  await page.evaluate(async (bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'dropped.mov', { type: 'video/quicktime' }));
    document.querySelector('h1').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  }, [...fs.readFileSync(path.join(__dirname, 'video', 'h264_pcm.mov'))]);
  await page.waitForFunction(() => state.sourceName === 'dropped.mov' && !document.getElementById('download-video').hidden);
  const status = await page.locator('#source-status').textContent();
  check(status.includes('Download video (MOV)'), 'a dropped .mov loads as the video source and the status points to Download video', status);
  // Loading plain audio hides it again.
  await page.locator('#file').setInputFiles({ name: 'after-video.wav', mimeType: 'audio/wav', buffer: wavTone(.5) });
  await page.waitForFunction(() => state.sourceName === 'after-video.wav');
  check(await page.locator('#download-video').isHidden(), 'an audio source hides the video download');
}

// A TF2 demo: its voice loads as the source, and Process runs only the
// receiver on it (demo.js, tests/demo.verify.mjs makes the fixture).
async function verifyDemo(page) {
  console.log('\n[Browser 3h] TF2 demo voice');
  await page.locator('#file').setInputFiles(path.join(__dirname, 'demo', 'synthetic.dem'));
  await page.waitForFunction(() => state.sourceDemo && !document.getElementById('process').disabled);
  const loaded = await page.evaluate(() => ({ name: state.sourceName, codec: els.codec.value, rate: state.decodedSource.sampleRate,
    seconds: state.decodedSource.duration, status: els.status.textContent, speakers: [...els.demoSpeaker.options].map(o => o.value), shown: !els.demoSpeaker.hidden }));
  check(loaded.name === 'synthetic_4503603922337793.dem' && loaded.codec === 'steam' && loaded.rate === 24000 && Math.abs(loaded.seconds - 3.2) < .01
    && /Process plays it through TF2's receiver/.test(loaded.status),
    'a demo loads the first speaker\'s voice as the source, at 24 kHz, with the Steam codec', `${loaded.name}, ${loaded.seconds.toFixed(2)} s`);
  check(loaded.shown && loaded.speakers.length === 2, 'with two speakers, a select picks whose voice to take', loaded.speakers.join(', '));
  await page.locator('#demo-speaker').selectOption('4503603922337794');
  await page.waitForFunction(() => state.sourceDemo && state.sourceDemo.speaker.id === '4503603922337794' && !document.getElementById('process').disabled);
  await page.locator('#demo-speaker').selectOption('4503603922337793');
  await page.waitForFunction(() => state.sourceDemo && state.sourceDemo.speaker.id === '4503603922337793' && !document.getElementById('process').disabled);
  check(true, 'switching speakers reloads the voice from the same demo');
  await page.locator('#process').click();
  await page.waitForFunction(() => state.processedBuffer && state.lastCodecInfo, null, { timeout: 60000 });
  const info = await page.evaluate(() => ({ backend: state.lastCodecInfo.backend, frames: state.lastCodecInfo.frames, lost: state.lastCodecInfo.lostFrames,
    dtx: state.lastCodecInfo.dtxFrames, log: [...document.querySelectorAll('#console-log .line, #console-log div')].map(e => e.textContent).join('\n') }));
  check(info.backend === 'demo' && info.frames === 160 && info.lost === 1 && info.dtx === 1,
    'Process runs the receiver only, and the codec lane shows the demo\'s own frames', `${info.frames} frames, ${info.lost} lost, ${info.dtx} DTX`);
  // The lane places frame f at (f * frame - lookahead) / rate.
  const lane = await page.evaluate(() => ({ at: frameAt(state.lastCodecInfo, 1.0), frame: Math.floor(1.0 * state.lastCodecInfo.sampleRate / state.lastCodecInfo.frameSamples) }));
  check(lane.at === lane.frame, 'the codec lane finds the demo\'s frame at a given time', `frame ${lane.at} at 1 s`);
  // Any other source clears the demo.
  await page.locator('#file').setInputFiles({ name: 'after-demo.wav', mimeType: 'audio/wav', buffer: wavTone(.5) });
  await page.waitForFunction(() => state.sourceName === 'after-demo.wav');
  check(await page.evaluate(() => state.sourceDemo === null && els.demoSpeaker.hidden), 'loading audio afterwards leaves demo mode');
  // A demo that cannot be read leaves the current source ready to process.
  await page.locator('#file').setInputFiles({ name: 'broken.dem', mimeType: 'application/octet-stream', buffer: Buffer.alloc(4096, 7) });
  await page.waitForFunction(() => /Could not read the demo/.test(els.status.textContent));
  const after = await page.evaluate(() => ({ source: state.sourceName, process: !els.process.disabled }));
  check(after.source === 'after-demo.wav' && after.process, 'a demo that cannot be read leaves the loaded source ready to process', after.source);
}

// A render with the speex profile names Speex 1.0.2 wherever the page
// describes the codec, and the chain strip shows its one setting for every
// snd_bits the page allows. Ends back on the Modern preset with a Steam render.
async function verifySpeexPage(page) {
  console.log('\n[Browser 3c2] The speex profile on the page');
  const render = async () => {
    const before = await page.evaluate(() => state.renderId);
    await page.locator('#process').click();
    await page.waitForFunction((id) => state.renderId > id, before, { timeout: 60000 });
  };
  await page.locator('#viz-wave').click();
  await page.locator('#codec').selectOption('speex');
  const consoleBefore = (await page.locator('#console-out').textContent()).length;
  await render();
  await page.waitForFunction(() => [...document.querySelectorAll('#viz-legend .lg-item')].some(e => e.querySelector('.lg-box')));
  const seen = await page.evaluate((from) => {
    const items = [...document.querySelectorAll('#viz-legend .lg-item')].filter(e => e.querySelector('.lg-box'));
    const chain = [...document.querySelectorAll('#signal-chain li')].find(li => li.querySelector('b').textContent === 'Codec');
    return { legend: items.map(e => e.textContent), legendTitles: items.map(e => e.title || e.querySelector('[title]')?.title || ''),
      console: document.getElementById('console-out').textContent.slice(from), status: document.getElementById('source-status').textContent,
      chain: chain ? chain.textContent : '', option: document.getElementById('codec').selectedOptions[0].textContent,
      frames: state.lastCodecInfo.frames, color: FRAME_STYLE[7].color };
  }, consoleBefore);
  const sVoice = seen.console.split('\n').filter(l => l.includes('S_Voice')).join(' | ') || seen.console.slice(0, 300);
  check(seen.legend.length === 1 && seen.legend[0] === `Speex ${seen.frames}`, 'a speex render\'s codec lane counts every frame as Speex', seen.legend.join(', '));
  check(/S_Voice: Speex 1\.0\.2, 11\.025 kbps CBR, 20-byte packets of 14\.5 ms, a lost frame plays as zeros \(Speex 100%\)/.test(seen.console),
    'the console line names Speex 1.0.2, its frames, and zeros for a lost frame', sVoice);
  check(/Ready · Speex 1\.0\.2 · 11\.025 kbps/.test(seen.status), 'the status line names Speex 1.0.2', seen.status);
  const words = 'Speex 1.0.2 on 11.025 kHz sound · 20-byte frames of 14.51 ms · 11.025 kbit/s';
  check(seen.chain === `Codec${words}` && seen.option === `vaudio_speex (${words})`, 'the chain strip and the codec menu describe the game\'s Speex module',
    `${seen.chain} / ${seen.option}`);
  const texts = [...seen.legend, ...seen.legendTitles, sVoice, seen.status, seen.chain, seen.option];
  check(texts.every(t => !/CELT|Opus|SILK/.test(t)), 'nothing on the page calls a speex render CELT, Opus or SILK', texts.filter(t => /CELT|Opus|SILK/.test(t)).join(' / '));
  // A packet is net_split's whole frames of 14.51 ms; the engine sends one
  // packet per 15 ms tick, so at most 66.7 a second.
  const network = async () => page.evaluate(() => [...document.querySelectorAll('#signal-chain li')].find(li => li.querySelector('b').textContent === 'Network').textContent);
  const net20 = await network();
  await page.locator('#frameMs').fill('40');
  await page.locator('#frameMs').dispatchEvent('change');
  const net40 = await network();
  await page.locator('#frameMs').fill('20');
  await page.locator('#frameMs').dispatchEvent('change');
  check(net20.startsWith('Network14.5 ms packets') && net40.startsWith('Network29 ms packets'),
    'the chain strip gives a speex packet as net_split\'s whole 14.51 ms frames', `${net20} / ${net40}`);
  await page.locator('#console-input').fill('net_graph 2');
  await page.locator('#console-input').press('Enter');
  // The overlay refreshes every 500 ms; give it a few rounds to show this render.
  await page.waitForFunction(() => /^67 /.test(document.getElementById('ng-in').textContent), null, { timeout: 4000 }).catch(() => {});
  const ng = await page.locator('#ng-in').textContent();
  await page.locator('#console-input').fill('net_graph 0');
  await page.locator('#console-input').press('Enter');
  check(ng.startsWith('67 '), 'net_graph gives the engine\'s speex packet rate, one per 15 ms tick (67 a second, not 69 frames)', ng);
  const hex = await page.evaluate(() => {
    const canvas = document.getElementById('visualizer'), rect = canvas.getBoundingClientRect(), scale = canvas.width / rect.width;
    const L = vizLayout(rect.width, rect.height);
    const data = canvas.getContext('2d').getImageData(0, Math.round((L.laneY + L.laneH / 2) * scale), canvas.width, 1).data;
    const out = new Set();
    for (let i = 0; i < data.length; i += 4) out.add('#' + [data[i], data[i + 1], data[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
    return [...out];
  });
  check(hex.includes(seen.color), 'the codec lane draws Speex frames in their own colour', seen.color);
  // snd_bits picks nothing for vaudio_speex: the strip keeps the module's one
  // setting and says so once snd_bits leaves 16.
  const strip = [];
  for (let bits = 4; bits <= 16; bits++) {
    await page.locator('#bits').fill(String(bits));
    await page.locator('#bits').dispatchEvent('change');
    strip.push([bits, await page.evaluate(() => [...document.querySelectorAll('#signal-chain li')].find(li => li.querySelector('b').textContent === 'Codec').textContent)]);
  }
  check(strip.every(([bits, text]) => text === `Codec${words}${bits === 16 ? '' : ' · snd_bits not used'}`),
    'at every snd_bits from 4 to 16 the chain strip shows the module\'s one setting, and that snd_bits is not used',
    strip.filter(([bits, text]) => text !== `Codec${words}${bits === 16 ? '' : ' · snd_bits not used'}`).map(([b, t]) => `${b}: ${t}`).join(' / ') || 'all as expected');
  await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
  await render();
}

// The CELT profiles on the page (W3-06): the menu's labels, the chain strip,
// and a render with each, as the game's module runs them. Ends back on the
// Modern preset with a Steam render.
async function verifyCeltPage(page) {
  console.log('\n[Browser 3c3] The CELT profiles on the page');
  const render = async () => {
    const before = await page.evaluate(() => state.renderId);
    await page.locator('#process').click();
    await page.waitForFunction((id) => state.renderId > id, before, { timeout: 60000 });
  };
  const labels = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#codec option')].map(o => [o.value, o.textContent])));
  check(labels.celt_22 === 'vaudio_celt (CELT 0.11, 22 kHz, 22 kbps)' && labels.celt_44 === 'vaudio_celt_high (CELT 0.11, 44 kHz mode, 22 kbps)',
    'the codec menu names vaudio_celt and vaudio_celt_high at their real rates', `${labels.celt_22} / ${labels.celt_44}`);
  const seen = {};
  for (const codec of ['celt_22', 'celt_44']) {
    await page.locator('#codec').selectOption(codec);
    const consoleBefore = (await page.locator('#console-out').textContent()).length;
    await render();
    seen[codec] = await page.evaluate((from) => {
      const chain = [...document.querySelectorAll('#signal-chain li')].find(li => li.querySelector('b').textContent === 'Codec');
      const info = state.lastCodecInfo;
      const network = [...document.querySelectorAll('#signal-chain li')].find(li => li.querySelector('b').textContent === 'Network').textContent;
      return { network, chain: chain ? chain.textContent : '', sVoice: document.getElementById('console-out').textContent.slice(from).split('\n').find(l => l.includes('S_Voice')) || '',
        info: { backend: info.backend, version: info.version, sampleRate: info.sampleRate, modeRate: info.modeRate ?? null, frameSamples: info.frameSamples,
          packetBytes: info.packetBytes, complexity: info.complexity, bitrate: info.bitrate, celt: info.modes.celt, frames: info.frames } };
    }, consoleBefore);
  }
  const [a, b] = [seen.celt_22, seen.celt_44];
  check(a.network.startsWith('Network23.2 ms packets') && b.network.startsWith('Network46.4 ms packets'),
    'the chain strip gives a CELT packet as one frame of the profile: 23.2 and 46.4 ms', `${a.network} / ${b.network}`);
  check(a.chain.includes('CELT 0.11 22.05 kHz · 64-byte packets of 23.2 ms') && b.chain.includes('CELT 0.11 44.1 kHz mode on 22.05 kHz sound · 128-byte packets of 46.4 ms'),
    'the chain strip describes vaudio_celt, and vaudio_celt_high as the 44.1 kHz mode on 22.05 kHz sound', `${a.chain} / ${b.chain}`);
  check(a.info.backend === 'celt' && a.info.sampleRate === 22050 && a.info.modeRate === null && a.info.frameSamples === 512 && a.info.packetBytes === 64
    && a.info.complexity === 5 && a.info.celt > 0 && a.info.celt === a.info.frames,
    'a celt_22 render runs CELT 0.11 at 22050 Hz, 512-sample frames, 64-byte packets, complexity 5', JSON.stringify(a.info));
  check(b.info.backend === 'celt' && b.info.sampleRate === 22050 && b.info.modeRate === 44100 && b.info.frameSamples === 1024 && b.info.packetBytes === 128
    && b.info.complexity === 5 && b.info.bitrate === 22050 && b.info.celt > 0 && b.info.celt === b.info.frames,
    'a celt_44 render runs the 44100 Hz mode on 22050 Hz sound, 1024-sample frames, 128-byte packets, complexity 5', JSON.stringify(b.info));
  check(/S_Voice: CELT 0\.11 \(celt-0\.11\.0, pitch filter in\), 22\.05 kbps CBR, 64-byte packets of 23\.2 ms/.test(a.sVoice)
    && /S_Voice: CELT 0\.11 \(celt-0\.11\.0, pitch filter in\), 22\.05 kbps CBR, 128-byte packets of 46\.4 ms/.test(b.sVoice),
    'the console names the CELT build and each profile\'s packets', `${a.sVoice} | ${b.sVoice}`);
  await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
  await render();
}

async function verifySourceDuringRender(page) {
  console.log('\n[Browser 3i] A new source during a render');
  await page.locator('#file').setInputFiles({ name: 'long.wav', mimeType: 'audio/wav', buffer: wavTone(30) });
  await page.waitForFunction(() => state.sourceName === 'long.wav' && !els.process.disabled);
  await page.locator('#process').click();
  await page.waitForFunction(() => state.processing);
  // Dropped outside the batch panel, one file becomes the source (batch.js).
  await page.evaluate((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'short.wav', { type: 'audio/wav' }));
    document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, [...wavTone(1, 48000, 880)]);
  await page.waitForFunction(() => state.sourceName === 'short.wav' && !state.processing, null, { timeout: 60000 });
  const after = await page.evaluate(() => ({ render: !!state.processedBuffer, download: !els.dl.disabled, process: !els.process.disabled,
    status: els.status.textContent }));
  check(!after.render && !after.download && after.process && after.status.startsWith('short.wav'),
    'a source dropped during a render stops that render; the new source waits to be processed', after.status);
  await page.locator('#process').click();
  await page.waitForFunction(() => state.processedBuffer && !state.processing, null, { timeout: 60000 });
  const seconds = await page.evaluate(() => state.processedBuffer.length / state.processedRate);
  check(Math.abs(seconds - 1) < .01, 'and then renders as itself', `${seconds.toFixed(3)} s`);
  // Presets reset every receiver setting, re-timing included.
  const retime = await page.evaluate(() => { execCommand('voice_retime 1'); execCommand('exec preset_modern'); return els.retime.value; });
  check(retime === '0', 'a preset turns talk-spurt re-timing back off', `voice_retime ${retime}`);
}

async function verifyLiveMonitor(page) {
  console.log('\n[Browser 3f] Live monitor');
  await page.locator('#live-toggle').click();
  await page.waitForFunction(() => window.TF2Live && TF2Live.stats && TF2Live.stats.frames > 40, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const live = await page.evaluate(() => ({ stats: TF2Live.stats, latency: document.getElementById('live-latency').textContent,
    tx: document.getElementById('live-tx').textContent, pressed: document.getElementById('live-toggle').getAttribute('aria-pressed') }));
  check(live.pressed === 'true' && live.stats.sent > 0 && live.stats.modes.hybrid > 0,
    'the live monitor runs the microphone through the Steam chain in real time', `${live.stats.sent} of ${live.stats.frames} frames sent, ${live.tx}`);
  // W3-11b: on steam the chain holds back the sender's longest chunk and its
  // pre-roll (stats.latencyMs: 206.9 ms at 44.1 and 48 kHz since W3-10, which
  // took the output FIR's sample out and put the device stage's wait for one
  // 44.1 kHz sample in place of the sinc resampler's); the page adds its own
  // delays.
  const ms = Number(/^(\d+) ms/.exec(live.latency)?.[1]);
  check(ms >= live.stats.latencyMs && ms < live.stats.latencyMs + 400 && live.stats.latencyMs > 190,
    'the live monitor reports its latency: between the chain\'s own figure (what it holds back) and that plus 400 ms', `${live.latency}; the chain ${live.stats.latencyMs.toFixed(1)} ms`);

  // Low latency holds back a chunk and a frame instead of the chunk and the
  // pre-roll; the page shows the figure it saves, taken from the chain.
  const fullMs = live.stats.latencyMs;
  await page.locator('#live-lowlat').check();
  await page.waitForFunction((full) => TF2Live.stats && TF2Live.stats.latencyMs < full - 50, fullMs, { timeout: 15000 });
  const low = await page.evaluate(() => ({ ms: TF2Live.stats.latencyMs, label: document.getElementById('live-lowlat').closest('label').textContent,
    title: document.getElementById('live-lowlat').closest('label').title }));
  await page.locator('#live-lowlat').uncheck();
  await page.waitForFunction((full) => TF2Live.stats && TF2Live.stats.latencyMs === full, fullMs, { timeout: 15000 });
  const shown = Number(/saves (\d+) ms/.exec(low.label)?.[1]);
  check(Math.round(fullMs - low.ms) === shown && /Saves \d+ ms/.test(low.title) && shown > 60 && shown < 100,
    'low-latency mode lowers the chain\'s latencyMs by the figure the page shows', `${(fullMs - low.ms).toFixed(2)} ms; the page: "${low.label.trim()}"`);

  // Push-to-talk: nothing is sent once the key is up. On steam the key up is
  // the app's stand-in (zeros in place of the microphone): the spurt in hand
  // ends by the gate's own hold, so the count waits 1.5 s first (the hold, a
  // chunk, the reach and the page's own delays come to about 0.9 s).
  await page.locator('#live-ptt').check();
  await page.waitForFunction(() => TF2Live.stats && TF2Live.stats.talking === false, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const idle0 = await page.evaluate(() => TF2Live.stats.sent);
  await page.waitForTimeout(800);
  const idle1 = await page.evaluate(() => ({ sent: TF2Live.stats.sent, tx: document.getElementById('live-tx').textContent,
    button: !document.getElementById('live-talk').hidden }));
  await page.keyboard.down('v');
  await page.waitForFunction((n) => TF2Live.stats.sent > n + 10, idle1.sent, { timeout: 15000 });
  await page.keyboard.up('v');
  check(idle1.sent === idle0 && idle1.button && /push-to-talk/.test(idle1.tx),
    'push-to-talk sends nothing until V is held, then sends', `${idle1.sent - idle0} frames sent while released; ${idle1.tx}`);
  await page.locator('#live-ptt').uncheck();

  // Record: the microphone and the voice come into the app lined up.
  // A take on the profile now on the page; the take, its dry signal and an
  // offline render of that dry signal with the page's settings.
  async function recordTake(codec) {
    if (await page.locator('#codec').inputValue() !== codec) {
      await page.locator('#codec').selectOption(codec);
      await page.waitForFunction((c) => TF2Live.stats && TF2Live.stats.codec === c && TF2Live.stats.sent > 20, codec, { timeout: 15000 });
    }
    // Wait for this take, not the one before it (W3-11b: the steam_48 take
    // was read before it was mounted, against the steam take's buffers, which
    // lined up only while both live chains ran the frame path).
    await page.evaluate(() => { window.__takeBefore = state.decodedSource; });
    await page.locator('#live-record').click();
    await page.waitForTimeout(3000);
    await page.locator('#live-record').click();
    await page.waitForFunction(() => state.sourceName && state.sourceName.startsWith('live-') && state.processedBuffer
      && state.decodedSource && state.decodedSource !== window.__takeBefore, null, { timeout: 20000 });
    // The live chain and a render of the same microphone audio cut it into
    // frames at different points, so their codec output differs a little:
    // with the noise probe (wavProbe) the correlation was 0.87-0.91 over 58
    // recordings covering the whole looped probe, and no other lag within
    // 300 ms came above 0.09. The peak sat at 0 every time (fractional
    // 0.00-0.04 samples over the first 32); tests/verify.js pins the
    // live chain's delay to the sample. Chromium's own beep is a 400 Hz square
    // wave, with a correlation peak every 110 samples nearly as high as the
    // true one: one recording in 32 peaked at -330 that way.
    return page.evaluate(async () => {
      // The take is at the audio context's rate, the live chain's device; the
      // render of its microphone is made at that rate too (W3-10).
      const dry = state.decodedSource.getChannelData(0), wet = state.processedBuffer, rate = state.processedRate;
      const render = (await TF2Audio.process(state.decodedSource, { ...renderOptions(), deviceRate: rate })).samples;
      const from = Math.round(rate * .4), to = Math.min(wet.length, render.length) - Math.round(rate * .2);
      let size = 1;
      while (size < 2 * (to - from)) size *= 2;
      const ar = new Float64Array(size), ai = new Float64Array(size), br = new Float64Array(size), bi = new Float64Array(size);
      let ea = 0, eb = 0;
      for (let i = from; i < to; i++) { ar[i - from] = render[i]; br[i - from] = wet[i]; ea += render[i] ** 2; eb += wet[i] ** 2; }
      TF2Reference.fft(ar, ai); TF2Reference.fft(br, bi);
      for (let k = 0; k < size; k++) { const re = br[k] * ar[k] + bi[k] * ai[k], im = bi[k] * ar[k] - br[k] * ai[k]; br[k] = re; bi[k] = im; }
      TF2Reference.fft(br, bi, true);
      // Wet lagging the render by `lag` samples, within 300 ms either way.
      let lag = 0;
      for (let d = -Math.round(rate * .3); d <= Math.round(rate * .3); d++) if (br[(d + size) % size] > br[(lag + size) % size]) lag = d;
      let low = 0, high = 0;
      for (const v of dry) { low = Math.min(low, v); high = Math.max(high, v); }
      return { seconds: dry.length / rate, same: dry.length === wet.length, lag, rate, r: ea > 0 && eb > 0 ? br[(lag + size) % size] / Math.sqrt(ea * eb) : 0, low, high,
        lane: !!(state.lastCodecInfo && state.lastCodecInfo.frameLog && state.lastCodecInfo.frameLog.some(c => c > 0)),
        ab: !els.abToggle.disabled };
    });
  }
  const take = await recordTake('steam');
  check(take.seconds > 2 && take.same && take.ab && take.lane,
    'Record loads the live session into the app as a dry/wet pair with its codec lane', `${take.seconds.toFixed(1)} s`);
  // Chromium's own beep swings from 0 to full scale; the probe stays within
  // about +-0.35 on both sides of zero.
  check(take.high < .5 && take.low < -.1, 'the fake microphone plays the noise probe, not Chromium\'s beep',
    `samples from ${take.low.toFixed(2)} to ${take.high.toFixed(2)}`);
  // W3-11b: the live chain runs the render's own stages, so both paths are
  // late by the same 16 inputs of Steam's resampler and the lag is near 0.
  // What is left is the rounding of the anchors and where the resampler's
  // stream stood (the take starts in mid-session, so its sender's clock and
  // its resampler started elsewhere), and the gate's edges, which that clock
  // moves. Sixty takes simulated in Node (the probe looped from a seeded
  // point, a seeded run before the 3 s recording, lined up as live-worker.js
  // lines them up) peaked at -1, 0 or 1 at 44.1 and at 48 kHz, with r from
  // 0.811 (tenth percentile 0.844) and from 0.759 (tenth percentile 0.841):
  // below the order's 0.8 at 48 kHz (the table is in
  // docs/reports/W3-11b-live-chain.md). This is a smoke test: a float decode,
  // a missing rounding, a kept FIR delay or a missing uptime would all pass
  // it; tests/verify.js [10b] is the proof.
  // By rate: at 44.1 kHz (the headless browser's, locally and on CI) the
  // takes' tenth percentile less 0.05 (0.844 - 0.05) is under their minimum
  // (0.811); at any other rate the 48 kHz takes' minimum less 0.05 (0.759 -
  // 0.05), so a 48 kHz device does not fail a few runs in a hundred.
  const k = take.rate / 44100, floor = take.rate === 44100 ? 0.79 : 0.70;
  check(Math.abs(take.lag) <= 2 * k && take.r > floor,
    'steam: an offline render of the recorded microphone lines up with the live take (both late by Steam\'s resampler\'s 16 inputs)',
    `peak at ${take.lag} samples at ${take.rate} Hz, r ${take.r.toFixed(3)}`);
  // steam_48 runs the frame path in the render and in the live chain alike.
  const take48 = await recordTake('steam_48');
  check(Math.abs(take48.lag) <= 1 && take48.r > 0.8, 'steam_48: the recorded voice lines up with an offline render of the recorded microphone, within a sample',
    `peak at ${take48.lag} samples, r ${take48.r.toFixed(3)}`);

  // The speex profile live: the panel, and a recorded take, name Speex.
  await page.locator('#codec').selectOption('speex');
  await page.waitForFunction(() => TF2Live.stats && TF2Live.stats.codec === 'speex' && TF2Live.stats.sent > 20, null, { timeout: 15000 });
  const mode = await page.locator('#live-mode').textContent();
  // The console keeps a bounded number of lines, so a length taken now can
  // point into later text once older lines go: mark the place with a line.
  await page.evaluate(() => logLine('test: the speex take starts here', 'sys'));
  const consoleFrom = 'test: the speex take starts here';
  await page.locator('#live-record').click();
  await page.waitForTimeout(1500);
  await page.locator('#live-record').click();
  await page.waitForFunction((n) => document.getElementById('console-out').textContent.split(n).pop().includes('S_Voice'), consoleFrom, { timeout: 20000 });
  const speexTake = await page.evaluate((n) => ({ console: document.getElementById('console-out').textContent.split(n).pop().split('\n').filter(l => l.includes('S_Voice')).join(' | '),
    status: document.getElementById('source-status').textContent,
    legend: [...document.querySelectorAll('#viz-legend .lg-item')].filter(e => e.querySelector('.lg-box')).map(e => e.textContent) }), consoleFrom);
  check(mode === 'Speex' && /S_Voice: Speex 1\.0\.2, 11\.025 kbps CBR, 14\.5 ms, a lost frame plays as zeros \(Speex 100%\)/.test(speexTake.console)
    && /Speex 1\.0\.2 · 11\.025 kbps/.test(speexTake.status) && speexTake.legend.some(t => /^Speex \d+$/.test(t))
    && !speexTake.legend.some(t => /^(SILK|Hybrid|CELT|DTX) /.test(t))
    && ![speexTake.console, speexTake.status, ...speexTake.legend].some(t => /CELT|Opus|SILK/.test(t)),
    'the live panel and a recorded speex take name Speex, not CELT or Opus', `mode ${mode}; ${speexTake.console}; ${speexTake.legend.join(', ')}`);
  // vaudio_celt_high live: the 44100 Hz mode on 22050 Hz sound, 46.4 ms frames.
  await page.locator('#codec').selectOption('celt_44');
  await page.waitForFunction(() => TF2Live.stats && TF2Live.stats.codec === 'celt_44' && TF2Live.stats.sent > 20, null, { timeout: 20000 });
  const celtLive = await page.evaluate(() => ({ mode: document.getElementById('live-mode').textContent, stats: TF2Live.stats }));
  check(celtLive.mode === 'CELT' && celtLive.stats.modes.celt > 20 && celtLive.stats.modes.celt === celtLive.stats.sent,
    'the live chain runs celt_44: every frame sent is CELT', `mode ${celtLive.mode}; ${celtLive.stats.modes.celt} CELT of ${celtLive.stats.sent} sent`);
  await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
  await page.locator('#live-toggle').click();
  await page.waitForFunction(() => !TF2Live.running);
  check(await page.locator('#live-toggle').getAttribute('aria-pressed') === 'false', 'the live monitor stops');
}

// A minimal reader for the stored ZIPs the batch writes.
function readZip(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const end = buffer.length - 22;
  if (view.getUint32(end, true) !== 0x06054b50) throw new Error('no end of central directory');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = [];
  for (let i = 0; i < count; i++) {
    const nameLength = view.getUint16(at + 28, true), size = view.getUint32(at + 24, true), offset = view.getUint32(at + 42, true);
    const name = buffer.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const local = view.getUint16(offset + 26, true);
    files.push({ name, data: buffer.subarray(offset + 30 + local, offset + 30 + local + size), crc: view.getUint32(at + 16, true) });
    at += 46 + nameLength;
  }
  return files;
}

async function verifyBatchAndFormats(browser, base) {
  console.log('\n[Browser 6] Batch queue, drag and drop, and download formats');
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const summary = () => page.locator('#batch-summary').textContent();
    await page.locator('#batch-files').setInputFiles([
      { name: 'b-song.wav', mimeType: 'audio/wav', buffer: wavTone(0.6, 48000, 330) },
      { name: 'a-song.wav', mimeType: 'audio/wav', buffer: wavTone(0.5, 44100, 440) },
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not audio') }
    ]);
    check((await summary()).includes('2 files') && (await summary()).includes('skipped 1 file'), 'batch adds audio files and skips others', await summary());
    // A video's audio can be batched too.
    await page.locator('#batch-files').setInputFiles({ name: 'clip.mov', mimeType: 'video/quicktime', buffer: fs.readFileSync(path.join(__dirname, 'video', 'h264_pcm.mov')) });
    check((await summary()).includes('3 files'), 'batch takes video files for their audio', await summary());
    await page.locator('.batch-item', { hasText: 'clip.mov' }).locator('.bi-remove').click();
    check(JSON.stringify(await page.locator('.batch-item .bi-name').allTextContents()) === '["a-song.wav","b-song.wav"]', 'batch sorts files by name');
    // A multi-file choice in step 1 and a drop on the batch panel both queue files.
    await page.locator('#file').setInputFiles([
      { name: 'c-song.wav', mimeType: 'audio/wav', buffer: wavTone(0.4, 48000, 550) },
      { name: 'd-song.wav', mimeType: 'audio/wav', buffer: wavTone(0.3, 48000, 660) }]);
    await page.evaluate(async (bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], 'e-song.wav', { type: 'audio/wav' }));
      document.getElementById('batch-list').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    }, [...wavTone(0.3, 48000, 770)]);
    await page.waitForFunction(() => document.querySelectorAll('.batch-item').length === 5);
    check(true, 'step 1 multi-select and a drop on the batch panel add to the queue');
    // A single file dropped elsewhere loads as the source instead.
    await page.evaluate(async (bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], 'dropped-source.wav', { type: 'audio/wav' }));
      document.querySelector('h1').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    }, [...wavTone(0.3)]);
    await page.waitForFunction(() => state.sourceName === 'dropped-source.wav');
    check(true, 'one file dropped outside the batch loads as the source');
    for (const name of ['c-song.wav', 'd-song.wav', 'e-song.wav']) {
      await page.locator('.batch-item', { hasText: name }).locator('.bi-remove').click();
    }
    await page.locator('#batch-run').click();
    await page.waitForFunction(() => /2 rendered/.test(document.getElementById('batch-summary').textContent), null, { timeout: 120000 });
    const statuses = await page.locator('.batch-item .bi-status').allTextContents();
    // At volume 1, the game's default since W3-10, a loud render's true peak
    // can pass 0 dBTP (the device stage's interpolation of a clipped voice).
    check(statuses.every(text => /^Done · 0:01 · −\d+\.\d LUFS · −?\d+\.\d dBTP/.test(text)), 'rendered items report loudness and true peak', statuses.join(' | '));

    const zips = {};
    for (const format of ['wav', 'flac', 'mp3']) {
      await page.locator('#format').selectOption(format);
      check((await page.locator('#batch-zip').textContent()).includes(format.toUpperCase()), `ZIP button names ${format.toUpperCase()}`);
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('#batch-zip').click()]);
      const buffer = fs.readFileSync(await download.path());
      zips[format] = readZip(buffer);
      const names = zips[format].map(f => f.name).join(', ');
      check(download.suggestedFilename() === `tf2_voice_steam_2_${format}.zip` && names === `a-song_tf2_steam.${format}, b-song_tf2_steam.${format}`,
        `${format.toUpperCase()} ZIP holds both renders`, names);
    }
    check(zips.wav.every(f => f.data.subarray(0, 4).toString() === 'RIFF') && zips.flac.every(f => f.data.subarray(0, 4).toString() === 'fLaC')
      && zips.mp3.every(f => f.data.subarray(0, 700).includes('Xing') && f.data.subarray(0, 700).includes('LAME3.100')),
      'ZIP entries are WAV, FLAC and MP3 (LAME VBR) files');
    // The browser's own decoders: FLAC must give back the WAV's samples exactly.
    const decoded = await page.evaluate(async ({ wav, flac, mp3 }) => {
      const decode = async (bytes) => {
        const probe = new DataView(new Uint8Array(wav).buffer);
        const context = new OfflineAudioContext(1, 1, probe.getUint32(24, true));
        return (await context.decodeAudioData(new Uint8Array(bytes).buffer)).getChannelData(0);
      };
      const [a, b, c] = await Promise.all([decode(wav), decode(flac), decode(mp3)]);
      let same = a.length === b.length;
      for (let i = 0; same && i < a.length; i++) same = a[i] === b[i];
      return { same, wav: a.length, mp3: c.length };
    }, { wav: [...zips.wav[0].data], flac: [...zips.flac[0].data], mp3: [...zips.mp3[0].data] });
    check(decoded.same, 'FLAC decodes to exactly the WAV samples in the browser', `${decoded.wav} samples`);
    check(Math.abs(decoded.mp3 - decoded.wav) <= 1152, 'MP3 decodes to the WAV duration in the browser', `${decoded.mp3} vs ${decoded.wav}`);

    await page.locator('#advanced-toggle').click();
    await page.locator('#volume').fill('0.3');
    await page.locator('#volume').dispatchEvent('change');
    check((await summary()).includes('2 with older settings') && (await page.locator('.batch-item[data-state="stale"]').count()) === 2,
      'changing a setting marks earlier renders as older');
    await page.locator('#batch-clear').click();
    check((await summary()) === 'No files queued.' && (await page.locator('.batch-item').count()) === 0, 'Clear empties the queue');

    // Single render saved as FLAC through the format picker.
    await page.locator('#file').setInputFiles({ name: 'solo.wav', mimeType: 'audio/wav', buffer: wavTone(0.4) });
    await page.waitForFunction(() => !document.getElementById('process').disabled);
    await page.locator('#process').click();
    await page.waitForFunction(() => !document.getElementById('download').disabled, null, { timeout: 60000 });
    await page.locator('#format').selectOption('flac');
    check(await page.locator('#download').textContent() === 'Download FLAC', 'download button follows the format');
    const [single] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('#download').click()]);
    check(single.suggestedFilename() === 'solo_tf2_steam.flac'
      && fs.readFileSync(await single.path()).subarray(0, 4).toString() === 'fLaC', 'single render downloads as FLAC');
    await page.reload({ waitUntil: 'domcontentloaded' });
    check(await page.locator('#format').inputValue() === 'flac', 'the chosen format is remembered');
    check(errors.length === 0, 'batch and formats run without page errors', errors.join('; '));
  } finally { await context.close(); }
}

async function activateServiceWorker(page, scriptPath) {
  // Activation and controller assignment are separate lifecycle events. Wait
  // for BOTH, and fail on timeout rather than silently proceeding offline.
  await page.evaluate(async (path) => {
    const expected = new URL(path, location.href).href;
    await navigator.serviceWorker.register(path);
    await new Promise((resolve, reject) => {
      let observed = null;
      const cleanup = () => {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', inspect);
        observed?.removeEventListener('statechange', inspect);
      };
      const inspect = () => {
        const controller = navigator.serviceWorker.controller;
        if (controller !== observed) {
          observed?.removeEventListener('statechange', inspect);
          observed = controller;
          observed?.addEventListener('statechange', inspect);
        }
        if (controller?.scriptURL === expected && controller.state === 'activated') {
          cleanup(); resolve();
        }
      };
      const timer = setTimeout(() => {
        cleanup(); reject(new Error(`Service worker did not activate and control the page: ${expected}`));
      }, 30000);
      navigator.serviceWorker.addEventListener('controllerchange', inspect);
      inspect();
    });
  }, scriptPath);
}

// The files the page needs to start and work offline, found without reading
// sw.js: the page itself, what its markup links (scripts, style, icon,
// manifest), the manifest's icons, and what the code loads at run time
// (workers, audio worklets and the codec modules they import).
const RUNTIME_FILES = ['audio-worker.js', 'mic-capture.js', 'live-worker.js', 'live-worklet.js', 'opus-codec.mjs',
  'vendor/libopus/index.mjs', 'vendor/libopus/generated/libopus.generated.mjs',
  'vendor/libopus-1.1/index.mjs', 'vendor/libopus-1.1/libopus-1.1.5.wasm.mjs',
  'vendor/celt-0.11/index.mjs', 'vendor/celt-0.11/celt-0.11.wasm.mjs',
  'vendor/speex-1.0.2/index.mjs', 'vendor/speex-1.0.2/speex-1.0.2.wasm.mjs',
  'vendor/lame/index.mjs', 'vendor/lame/lame-3.100.wasm.mjs'];

// A first visit: the service worker installs and takes control while the
// page is open, and the page is not reloaded under it. Every file the page
// needs offline must then already be in the cache (the worker caches what a
// controlled page fetches, so a later check cannot tell the asset list is
// short). Then offline, a reload starts the app, and a file loads and renders.
async function verifyFirstVisitOffline(browser, base) {
  console.log('\n[Browser 4b] A first visit leaves everything needed offline in the cache');
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  const assets = [...fs.readFileSync(path.join(root, 'sw.js'), 'utf8').match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)]
    .map(m => m[1].replace(/^\.\//, ''));
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const linked = await page.evaluate(() => [...document.querySelectorAll('script[src], link[href]')]
      .map(e => new URL(e.getAttribute('src') || e.getAttribute('href'), location.href).pathname.slice(1)));
    const needed = [...new Set(['', 'index.html', ...linked, ...manifest.icons.map(i => i.src), ...RUNTIME_FILES])];
    check(needed.every(f => !f || fs.existsSync(path.join(root, f))) && assets.every(a => needed.includes(a)),
      'the files the page needs exist, and sw.js lists nothing else', `${needed.length} files`);
    const missing = await page.evaluate(async ({ needed, shell }) => {
      await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      const cache = await caches.open(shell);
      const hits = await Promise.all(needed.map(f => cache.match(new URL(f, location.href).href)));
      return needed.filter((f, i) => !hits[i]);
    }, { needed, shell: SHELL_CACHE });
    check(missing.length === 0, 'after the first visit, before any reload, every file the page needs offline is cached', missing.join(', ') || `${needed.length} files`);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#file').setInputFiles({ name: 'first-visit-22050.wav', mimeType: 'audio/wav', buffer: wavTone(.5, 22050) });
    await page.waitForFunction(() => /first-visit-22050\.wav|Could not/.test(els.status.textContent));
    const loaded = await page.evaluate(() => els.status.textContent);
    check(/22,050 Hz/.test(loaded), 'offline after the first visit, a file loads at its own rate', loaded);
    await page.locator('#process').click();
    await page.waitForFunction(() => /Ready|Could not|failed/i.test(els.status.textContent) && !state.processing, null, { timeout: 60000 });
    const done = await page.evaluate(() => ({ status: els.status.textContent, log: document.getElementById('console-out').textContent }));
    check(done.status.includes('Ready') && done.log.includes('libopus 1.1.5'), 'and renders with the bundled codec', done.status);
    check(errors.length === 0, 'the first visit and the offline reload have no page errors', errors.join('; '));
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
}

async function main() {
  const root = path.join(__dirname, '..');
  const server = await createStaticServer(root);
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  let browser = null, context = null;
  // The microphone signal is written at run time, never committed.
  const micFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'tf2ve-mic-')), micFile = path.join(micFolder, 'probe.wav');
  fs.writeFileSync(micFile, wavProbe());
  try {
    const launchOptions = { headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${micFile}`] };
    // Optional: a preinstalled Chromium whose build differs from Playwright's pin.
    if (process.env.CHROMIUM_EXECUTABLE) launchOptions.executablePath = process.env.CHROMIUM_EXECUTABLE;
    try { browser = await chromium.launch(launchOptions); }
    catch (error) {
      if (!String(error.message).includes('Executable doesn\'t exist')) throw error;
      browser = await chromium.launch({ ...launchOptions, channel: 'chrome' });
    }
    context = await browser.newContext({ serviceWorkers: 'allow', permissions: ['microphone'] });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    console.log('\n[Browser 1] Startup and malformed persisted state');
    await page.goto(`${base}/#codec=not-a-codec&gain=not-a-number`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(250);
    check(pageErrors.length === 0, 'malformed share URL does not crash', pageErrors.join('; '));
    check(await page.locator('#codec').inputValue() === 'steam', 'invalid codec retains real Opus default');
    check(await page.locator('#gain').inputValue() === '1.0', 'invalid number retains safe default');
    check(await page.locator('#vad_threshold').inputValue() === '-40' && await page.evaluate(() => !('gateThresholdDb' in renderOptions()) || renderOptions().gateThresholdDb === undefined),
      'a fresh page shows the steam gate\'s own threshold, -40, and sends none');
    await page.evaluate(() => {
      localStorage.setItem('tf2ve_history', JSON.stringify({ broken: true }));
      localStorage.setItem('tf2ve_presets', JSON.stringify(['broken']));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    check(pageErrors.length === 0, 'malformed local storage does not crash');

    console.log('\n[Browser 2] Accessibility, disclosure, and safe console');
    const controlIds = ['codec', 'listener_position', 'gain', 'voice_scale', 'hp', 'lp', 'env',
      'c_dur', 'c_dec', 'c_mix', 'agc', 'maxgain', 'avggain', 'volume', 'device_rate', 'bits', 'frameMs', 'loss', 'warble_on',
      'capture_channel', 'vad', 'vad_threshold', 'steam_uptime', 'jitter'];
    const unlabeled = await page.evaluate((ids) => ids.filter((id) => {
      const element = document.getElementById(id);
      return !element || !element.labels || element.labels.length === 0;
    }), controlIds);
    check(unlabeled.length === 0, 'every settings control has an associated label', unlabeled.join(', '));
    check(!(await page.locator('#gain').isVisible()), 'advanced controls start collapsed');
    await page.locator('#advanced-toggle').click();
    check(await page.locator('#gain').isVisible(), 'advanced controls expand');
    await page.locator('#bits').fill('6');
    await page.locator('#agc').selectOption('0');
    await page.locator('#maxgain').fill('3');
    await page.locator('#volume').fill('0.1');
    await page.locator('#vad').selectOption('0');
    await page.locator('#vad_threshold').fill('-20');
    await page.locator('#capture_channel').selectOption('mix');
    await page.locator('#device_rate').selectOption('44100');
    await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
    check(await page.locator('#codec').inputValue() === 'steam', 'Modern preset selects the measured 24 kHz Steam profile');
    check(await page.locator('#lp').inputValue() === '20000' && await page.locator('#hp').inputValue() === '0',
      'Modern preset leaves the optional sender filters off');
    check(Number(await page.locator('#gain').inputValue()) === 1, 'Modern preset restores unity capture gain');
    check(await page.locator('#bits').inputValue() === '16' && await page.locator('#agc').inputValue() === '1'
      && await page.locator('#maxgain').inputValue() === '10' && await page.locator('#avggain').inputValue() === '0.5'
      && await page.locator('#volume').inputValue() === '1',
      'preset resets quality, receiver auto-gain and output overrides (volume to the game\'s default, 1)');
    // A built-in preset leaves the listener's device alone (W3-10).
    check(await page.locator('#device_rate').inputValue() === '44100', 'a built-in preset keeps the listener\'s sound device');
    await page.locator('#device_rate').selectOption('48000');
    check(await page.locator('#vad').inputValue() === 'auto' && await page.locator('#vad_threshold').inputValue() === '-40'
      && await page.locator('#capture_channel').inputValue() === 'left',
      'preset restores the measured voice gate (Steam\'s own, -40) and left-channel capture');
    await page.locator('#console-details summary').click();
    await page.locator('#console-input').fill('echo <img src=x onerror="window.__consoleXss=1">');
    await page.locator('#console-input').press('Enter');
    check(await page.locator('#console-out img').count() === 0, 'console treats entered HTML as text');
    check(await page.evaluate(() => !window.__consoleXss), 'console input cannot execute markup');

    console.log('\n[Browser 3] Worker render and cancellation');
    await page.locator('#file').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wavTone(0.5) });
    await page.waitForFunction(() => !document.getElementById('process').disabled);
    const decodedSource = await page.evaluate(() => ({ rate: state.decodedSource.sampleRate, length: state.decodedSource.length }));
    await page.locator('#process').click();
    await page.waitForFunction(() => !document.getElementById('download').disabled, null, { timeout: 60000 });
    check((await page.locator('#preview').getAttribute('src') || '').startsWith('blob:'), 'worker render creates playable output');
    check((await page.locator('#source-status').textContent()).includes('Ready'), 'completed render reports ready');
    checkRenderedTone(await readRenderedWav(page), decodedSource, 'Default browser');
    const consoleText = await page.locator('#console-out').textContent();
    check(!consoleText.includes('compatibility path'), 'dedicated audio worker completed the render');
    check(consoleText.includes('libopus 1.1.5, 32 kbps VBR + DTX'), 'worker used the pinned real Opus codec');
    await page.evaluate(() => { document.getElementById('preview').volume = .25; document.getElementById('preview').playbackRate = 1.25; });
    await page.waitForFunction(() => {
      const dry = document.getElementById('preview-dry');
      return dry.volume === .25 && dry.playbackRate === 1.25;
    });
    check(true, 'A/B comparison preserves playback volume and speed');

    console.log('\n[Browser 3b] Visualizer, signal chain, presets, console, net_graph');
    const painted = () => page.evaluate(() => {
      const canvas = document.getElementById('visualizer');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      for (let i = 0; i < data.length; i += 16) if (data[i] + data[i + 1] + data[i + 2] > 60) lit++;
      return lit / (data.length / 16);
    });
    for (const mode of ['wave', 'bars', 'spec']) {
      await page.locator(`#viz-${mode}`).click();
      check(await page.locator(`#viz-${mode}`).getAttribute('aria-pressed') === 'true', `${mode.toUpperCase()} view is selected`);
      // WAVE and SPEC images are computed for the visible range; wait for the finished one.
      if (mode !== 'bars') await page.waitForFunction((m) => (document.getElementById('visualizer').dataset.view || '').startsWith(m), mode);
      check(await painted() > 0.02, `${mode.toUpperCase()} view paints the rendered audio`);
    }
    await verifyVisualizerTools(page);
    await verifyLanesAndSelection(page);
    await page.locator('#viz-wave').click();
    await page.locator('#loss').fill('12');
    await page.locator('#loss').dispatchEvent('change');
    check((await page.locator('#signal-chain').textContent()).includes('12% lost'), 'signal chain follows control edits');
    check(await page.locator('.preset-row .preset-btn[aria-pressed="true"]').count() === 0, 'a hand-edited control clears the active preset');
    await page.getByRole('button', { name: 'Laggy 18% Loss', exact: true }).click();
    check(await page.locator('.preset-btn[data-preset="laggy"]').getAttribute('aria-pressed') === 'true'
      && (await page.locator('#signal-chain').textContent()).includes('18% lost · 50 ms jitter')
      && await page.locator('#jitter').inputValue() === '50', 'preset highlights itself and updates the chain, including jitter');
    await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
    check(await page.locator('#jitter').inputValue() === '0', 'presets reset jitter');
    await page.getByRole('button', { name: 'Modern (Steam Voice)', exact: true }).click();
    await page.locator('#console-input').fill('net_g');
    await page.locator('#console-input').press('Tab');
    check(await page.locator('#console-input').inputValue() === 'net_graph ', 'Tab completes a unique command');
    await page.locator('#console-input').fill('voice_m');
    await page.locator('#console-input').press('Tab');
    const listing = await page.locator('#console-out').textContent();
    check(listing.includes('voice_maxgain = "10"') && listing.includes('voice_micgain = "1'), 'ambiguous Tab lists candidates with values');
    await page.locator('#console-input').fill('net_graph 2');
    await page.locator('#console-input').press('Enter');
    await page.waitForFunction(() => document.getElementById('ng-in').textContent !== '0 0.00');
    check((await page.locator('#ng-in').textContent()).startsWith('50 '), 'net_graph reports the rendered packet rate', await page.locator('#ng-in').textContent());
    await page.locator('#console-input').fill('net_graph 0');
    await page.locator('#console-input').press('Enter');
    await verifySpeexPage(page);
    await verifyCeltPage(page);

    const parity = await page.evaluate(async () => {
      const data = Float32Array.from({ length: 24000 }, (_, i) => .2 * Math.sin(2 * Math.PI * 431 * i / 24000));
      const opts = { codec: 'steam', bits: 10, lossPct: 25, frameMs: 60, seed: 56 };
      const direct = await TF2Audio.process({ sampleRate: 24000, length: data.length, numberOfChannels: 1, getChannelData: () => data }, opts);
      const worker = new Worker('audio-worker.js');
      try {
        const result = await new Promise((resolve, reject) => {
          worker.onerror = reject;
          worker.onmessage = e => {
            if (e.data.type === 'result') resolve(e.data);
            if (e.data.type === 'error') reject(new Error(e.data.message));
          };
          worker.postMessage({ type: 'process', id: 1, samples: data.buffer, sampleRate: 24000, opts });
        });
        const samples = new Float32Array(result.samples);
        return { exact: samples.length === direct.samples.length && samples.every((v, i) => v === direct.samples[i]),
          plc: result.codecInfo.plc, lost: result.codecInfo.lostFrames,
          sender: result.codecInfo.sender && result.codecInfo.sender.rule, calls: result.codecInfo.resampler && result.codecInfo.resampler.calls };
      } finally { worker.terminate(); }
    });
    check(parity.exact && parity.plc === 'opus' && parity.lost > 0, 'worker and main thread agree with native packet-loss concealment');
    // W3-11a: the steam render runs Steam's sender (steam-sender.js) and the
    // decoder's resampler (vendor/swresample/swresample.js), loaded on the page
    // and in both workers; the footer credits FFmpeg's libswresample.
    check(parity.sender === 'steam' && parity.calls > 0, 'the audio worker renders steam through Steam\'s sender and the decoder\'s resampler',
      `${parity.sender}, ${parity.calls} resampler calls`);
    // W3-16: "Sender's Steam has been running", shown for the steam profile
    // only, sent as steamUptime, kept with the other settings; the sender's
    // hold depends on it.
    {
      const shown = async (codec) => {
        await page.locator('#codec').selectOption(codec);
        return page.evaluate(() => ({ hidden: document.getElementById('steam_uptime').closest('.control').hidden, sent: renderOptions().steamUptime }));
      };
      const onSteam = await shown('steam'), onCelt = await shown('celt_22'), on48 = await shown('steam_48'), back = await shown('steam');
      check(!onSteam.hidden && onCelt.hidden && on48.hidden && !back.hidden && onSteam.sent === 777600 && onCelt.sent === undefined && on48.sent === undefined,
        'the choice "Sender\'s Steam has been running" is on the page for steam only, sent as steamUptime (777600, about a week, by default)',
        JSON.stringify({ onSteam, onCelt, on48 }));
      await page.locator('#steam_uptime').selectOption('3110400');
      const kept = await page.evaluate(() => {
        const cfg = collectConfig(), opts = renderOptions();
        applyConfig({ uptime: '14400' });
        const after = document.getElementById('steam_uptime').value;
        applyConfig({ uptime: '777600' });
        return { cfg: cfg.uptime, sent: opts.steamUptime, after, back: document.getElementById('steam_uptime').value };
      });
      check(kept.cfg === '3110400' && kept.sent === 3110400 && kept.after === '14400' && kept.back === '777600',
        'the choice is kept with the other settings (share link, saved presets) and sent with the render\'s options', JSON.stringify(kept));
      const hold = await page.evaluate(async () => {
        const data = new Float32Array(3 * 24000);
        for (let i = 0; i < 24000; i++) data[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / 24000);
        const src = { sampleRate: 24000, length: data.length, numberOfChannels: 1, getChannelData: () => data };
        const at = async (steamUptime) => (await TF2Audio.process(src, { codec: 'steam', seed: 9, steamUptime })).codecInfo.sender;
        const today = await at(14400), month = await at(3110400);
        let refused = '';
        try { await TF2Audio.process(src, { codec: 'steam', steamUptime: -1 }); } catch (e) { refused = `${e.name}: ${e.message}`; }
        return { today: today.spurts[0].frames, month: month.spurts[0].frames, uptimes: [today.uptime, month.uptime], refused };
      });
      check(hold.month > hold.today && hold.uptimes.join() === '14400,3110400' && /^RangeError: .*uptime/.test(hold.refused),
        '1 s of loud tone then 2 s of silence, one seed: the spurt is longer at "about a month" than at "since today"; a steamUptime of -1 is refused',
        `${hold.today} and ${hold.month} frames; ${hold.refused}`);
    }
    // W3-10: the listener's sound device (snd_device_rate, the app's own) and
    // volume at the game's default, 1.
    {
      const chainOutput = () => page.evaluate(() => [...document.querySelectorAll('#signal-chain li')].find(li => li.querySelector('b').textContent === 'Output').textContent);
      const fresh = await page.evaluate(() => ({ value: document.getElementById('device_rate').value,
        options: [...document.querySelectorAll('#device_rate option')].map(o => `${o.value}:${o.textContent}`),
        label: document.querySelector('label[for="device_rate"]').textContent, title: document.querySelector('label[for="device_rate"]').title,
        sent: renderOptions().deviceRate, help: cvars['snd_device_rate'].help, link: cvars['snd_device_rate'].link }));
      check(fresh.value === '48000' && fresh.sent === 48000 && fresh.options.join() === '48000:48000 Hz (usual),44100:44100 Hz'
        && /Listener's sound device/.test(fresh.label) && /snd_device_rate/.test(fresh.label) && fresh.title.length > 40
        && /not a TF2 variable/.test(fresh.help) && fresh.link === 'device_rate' && (await chainOutput()).includes('48 kHz device'),
        'the choice "Listener\'s sound device: 48000 Hz (usual) / 44100 Hz" is on the page as snd_device_rate (the app\'s own, not a TF2 variable), sent as deviceRate, shown in the chain strip',
        JSON.stringify(fresh.options));
      await page.locator('#console-input').fill('snd_device_rate 44100');
      await page.locator('#console-input').press('Enter');
      const set = await page.evaluate(() => ({ value: document.getElementById('device_rate').value, sent: renderOptions().deviceRate, cfg: collectConfig().dev }));
      check(set.value === '44100' && set.sent === 44100 && set.cfg === '44100' && (await chainOutput()).includes('44.1 kHz device'),
        'snd_device_rate 44100 in the console sets it, the render is sent 44100, the share link and saved presets carry it as dev', JSON.stringify(set));
      const restored = await page.evaluate(() => {
        const out = {};
        applyConfig({ dev: '48000' }); out.applied = els.deviceRate.value;
        applyConfig({ dev: '96000' }); out.notOffered = els.deviceRate.value;
        els.deviceRate.value = '44100';
        const saved = collectConfig();
        els.deviceRate.value = '48000';
        applyConfig(saved); out.savedBack = els.deviceRate.value;
        // A link without dev (one made before W3-10) gets 48000; one with it keeps it.
        history.replaceState(null, '', '#codec=steam&vol=0.4'); applyHashConfig(); out.oldLink = els.deviceRate.value; out.oldLinkVol = els.volume.value;
        history.replaceState(null, '', '#codec=steam&dev=44100'); applyHashConfig(); out.newLink = els.deviceRate.value;
        history.replaceState(null, '', '#codec=steam&vol=1'); applyHashConfig(); out.again = els.deviceRate.value;
        history.replaceState(null, '', location.pathname);
        return out;
      });
      check(restored.applied === '48000' && restored.notOffered === '48000' && restored.savedBack === '44100' && restored.oldLink === '48000'
        && restored.oldLinkVol === '0.4' && restored.newLink === '44100' && restored.again === '48000',
        'saved settings restore it; a link with dev keeps it, and a link without it gets 48000 (its vol kept); a rate the page does not offer is not taken', JSON.stringify(restored));
      // The volume control: 1, the game's default, and the sentence beside it.
      const vol = await page.evaluate(() => ({ engine: VOICE_ENGINE.volume, note: document.getElementById('volume-note').textContent,
        label: document.querySelector('label[for="volume"]').textContent, inHtml: document.getElementById('volume').getAttribute('value') }));
      check(vol.engine === 1 && vol.inHtml === '1' && /the game's default/.test(vol.label)
        && vol.note === 'At 1, the game\'s default, a loud voice fills the whole range, as it does in the game.',
        'volume defaults to 1, the game\'s default, with the sentence beside it', vol.note);
      // A render's download is at the chosen rate.
      await page.locator('#device_rate').selectOption('44100');
      const src = await page.evaluate(() => { window.__wavBefore = state.lastWav; return { rate: state.decodedSource.sampleRate, length: state.decodedSource.length }; });
      await page.locator('#process').click();
      await page.waitForFunction(() => state.lastWav && state.lastWav !== window.__wavBefore && !els.process.disabled && !els.dl.disabled, null, { timeout: 60000 });
      const at44 = await readRenderedWav(page);
      check(at44.rate === 44100 && at44.frames === Math.round(src.length * 44100 / src.rate) && await page.evaluate(() => state.processedRate === 44100),
        'with the device at 44100 Hz the render and its download are at 44100 Hz, the source\'s duration at that rate', `${at44.rate} Hz, ${at44.frames} frames`);
      await page.locator('#device_rate').selectOption('48000');
    }
    // The live monitor's worker runs no steam render before W3-11b, so only its
    // own scope can show the two modules missing: it is read there once the
    // worker has answered, then the worker is stopped.
    const liveWorker = new Promise((resolve) => {
      const timer = setTimeout(() => { page.off('worker', seen); resolve(null); }, 20000);
      const seen = (w) => { if (w.url().endsWith('/live-worker.js')) { clearTimeout(timer); page.off('worker', seen); resolve(w); } };
      page.on('worker', seen);
    });
    const loaded = await page.evaluate(async () => {
      const page = typeof TF2SteamSender === 'object' && typeof TF2Swresample === 'object' && typeof TF2Swresample.createResampler === 'function';
      // The live monitor's worker: it answers only once its scripts have loaded.
      const live = await new Promise((resolve) => {
        const worker = new Worker('live-worker.js');
        window.__liveWorker = worker;
        const timer = setTimeout(() => resolve('silent'), 15000);
        worker.onerror = (e) => { clearTimeout(timer); resolve(`error ${e.message}`); };
        worker.onmessage = (e) => { if (e.data.type === 'error') return; clearTimeout(timer); resolve(e.data.type); };
        const channel = new MessageChannel();
        worker.postMessage({ type: 'start', rate: 48000, port: channel.port1, opts: { codec: 'steam' } }, [channel.port1]);
      });
      const credit = [...document.querySelectorAll('footer a')].find(a => /libswresample|FFmpeg/.test(a.textContent) || /COPYING\.LGPLv2\.1/.test(a.getAttribute('href') || ''));
      const licence = await fetch('vendor/swresample/COPYING.LGPLv2.1').then(r => r.ok ? r.text() : '');
      return { page, live, footer: document.querySelector('footer').textContent.replace(/\s+/g, ' ').trim(),
        link: !!credit, licence: /GNU LESSER GENERAL PUBLIC LICENSE/.test(licence) && /Version 2\.1/.test(licence) };
    });
    const scope = await liveWorker.then((w) => w ? w.evaluate(() => typeof self.TF2SteamSender === 'object'
      && typeof self.TF2Swresample === 'object' && typeof self.TF2Swresample.createResampler === 'function') : 'no worker seen').catch((e) => `error ${e.message}`);
    await page.evaluate(() => { window.__liveWorker.terminate(); delete window.__liveWorker; });
    check(loaded.page && ['ready', 'stats'].includes(loaded.live) && scope === true,
      'the page and the live monitor\'s worker load steam-sender.js and vendor/swresample/swresample.js', `${loaded.live}; in the worker's scope: ${scope}`);
    check(loaded.footer.includes('libswresample') && loaded.footer.includes('LGPL') && loaded.footer.includes('translated to JavaScript, modified') && loaded.link && loaded.licence,
      'the footer credits FFmpeg\'s libswresample (LGPL, translated to JavaScript, modified) beside LAME, with a link to its licence', loaded.footer);
    // W3-11b: the threshold control's default is the profile's own (-40 for
    // steam, Steam's own gate; -39.5 for the others), sent as no number at a
    // default, so a render's key does not change; its texts follow the profile.
    {
      const threshold = () => page.evaluate(() => ({ value: document.getElementById('vad_threshold').value,
        sent: renderOptions().gateThresholdDb === undefined ? 'absent' : renderOptions().gateThresholdDb,
        key: JSON.stringify(renderOptions()), help: document.querySelector('label[for="vad_threshold"]').title,
        gate: [...document.querySelectorAll('#signal-chain li')].map((li) => li.textContent).find((t) => t.startsWith('Capture')) || '' }));
      await page.locator('#codec').selectOption('steam');
      const steam = await threshold();
      await page.locator('#codec').selectOption('celt_22');
      const celt = await threshold();
      await page.locator('#codec').selectOption('steam_48');
      const frameGate = await threshold();
      await page.locator('#codec').selectOption('steam');
      const back = await threshold();
      check(steam.value === '-40' && steam.sent === 'absent' && celt.value === '-39.5' && celt.sent === 'absent' && back.value === '-40' && back.sent === 'absent',
        'the threshold shows the profile\'s own default (-40 on steam, -39.5 on a CELT profile, -40 again), and renderOptions() carries no gateThresholdDb at it',
        `${steam.value} / ${celt.value} / ${back.value}; sent ${steam.sent}, ${celt.sent}, ${back.sent}`);
      // celt_22 sends everything (no gate); steam_48 keeps the 20 ms frame gate.
      check(/mean of \|x\| over a capture chunk/.test(steam.help) && /Steam's own is -40/.test(steam.help) && /20 ms frame RMS/.test(celt.help)
        && /20 ms frame RMS/.test(frameGate.help) && frameGate.value === '-39.5'
        && steam.gate.includes('gate > -40 dBFS · chunks · 100 ms kept · 0.4 s hold') && frameGate.gate.includes('gate > -39.5 dBFS') && !frameGate.gate.includes('chunks'),
        'its help and the chain strip\'s gate follow the profile: chunks · 100 ms kept · 0.4 s hold on steam, the 20 ms frame RMS on steam_48 and CELT',
        `${steam.gate} | ${frameGate.gate}`);
      await page.locator('#vad_threshold').fill('-46');
      await page.locator('#vad_threshold').dispatchEvent('change');
      const typed = await page.evaluate(async () => {
        const data = new Float32Array(24000);
        for (let i = 0; i < data.length; i++) data[i] = 0.01 * Math.sin(2 * Math.PI * 440 * i / 24000);
        const src = { sampleRate: 24000, length: data.length, numberOfChannels: 1, getChannelData: () => data };
        const opts = renderOptions();
        return { sent: opts.gateThresholdDb, meanMin: (await TF2Audio.process(src, opts)).codecInfo.sender.meanMin };
      });
      await page.locator('#vad_threshold').fill('-40');
      await page.locator('#vad_threshold').dispatchEvent('change');
      const reset = await threshold();
      check(typed.sent === -46 && typed.meanMin === 32767 * 10 ** (-46 / 20) && reset.sent === 'absent' && reset.key === back.key,
        'typing -46 renders with meanMin 32767 x 10^(-46/20); put back to -40, the render\'s key is what it was before the control was touched',
        `meanMin ${typed.meanMin}`);
      const restored = await page.evaluate(() => {
        applyConfig({ codec: 'steam', vadthr: '-39.5' });
        const saved = document.getElementById('vad_threshold').value;
        execCommand('voice_vad_threshold -30');
        execCommand('exec preset_modern');
        const modern = document.getElementById('vad_threshold').value;
        execCommand('exec preset_legacy');
        const legacy = document.getElementById('vad_threshold').value;
        execCommand('exec preset_modern');
        return { saved, modern, legacy, after: document.getElementById('vad_threshold').value };
      });
      check(restored.saved === '-40' && restored.modern === '-40' && restored.legacy === '-39.5' && restored.after === '-40',
        'a saved -39.5 under steam restores as -40; a preset (the reset) restores the profile\'s own default', JSON.stringify(restored));
      // A blank control, or one of spaces, is the profile's own (as the engine
      // reads it), not 0 dBFS; a saved or shared blank restores as blank; a
      // share link's threshold belongs to its own codec (it was restored as
      // -39.5 on a page that had steam: the codec change carried steam's
      // default over).
      const blank = await page.evaluate(() => {
        const out = {};
        execCommand('exec preset_modern');
        els.vadThreshold.value = ''; out.cleared = renderOptions().gateThresholdDb === undefined ? 'absent' : renderOptions().gateThresholdDb;
        els.vadThreshold.value = '-40';
        applyConfig({ vadthr: '' }); out.savedEmpty = els.vadThreshold.value;
        applyConfig({ vadthr: '   ' }); out.savedSpaces = els.vadThreshold.value; out.spacesSent = renderOptions().gateThresholdDb === undefined ? 'absent' : renderOptions().gateThresholdDb;
        execCommand('exec preset_modern');
        applyConfig({ codec: 'celt_22', vadthr: '-40' }); out.shared = els.vadThreshold.value;
        execCommand('exec preset_modern');
        applyConfig({ codec: 'celt_22' }); out.codecOnly = els.vadThreshold.value;
        execCommand('exec preset_modern');
        return out;
      });
      check(blank.cleared === 'absent' && blank.savedEmpty === '' && blank.savedSpaces === '' && blank.spacesSent === 'absent' && blank.shared === '-40' && blank.codecOnly === '-39.5',
        'a blank threshold sends none (the profile\'s own); a saved or shared blank restores as blank; a share link with celt_22 and -40 keeps -40; one with celt_22 alone takes -39.5',
        JSON.stringify(blank));
      const labels = await page.evaluate(() => ({ option: document.querySelector('#codec option[value="steam_48"]').textContent, name: CODEC_PROFILES.steam_48.displayName }));
      check(/not the game's path/.test(labels.option) && labels.option === labels.name, 'steam_48 is named as not the game\'s path', labels.option);
      const liveTexts = async (codec) => {
        await page.locator('#codec').selectOption(codec);
        return page.evaluate(() => ({ latency: document.getElementById('live-latency').closest('.live-stat').title,
          low: document.getElementById('live-lowlat').closest('label').title, ptt: document.getElementById('live-ptt').closest('label').title }));
      };
      const ls = await liveTexts('steam'), lc = await liveTexts('celt_22');
      await page.locator('#codec').selectOption('steam');
      // The codec bypassed, steam keeps the frame path, and its texts.
      await page.locator('#warble_on').selectOption('0');
      const lb = await page.evaluate(() => ({ ptt: document.getElementById('live-ptt').closest('label').title }));
      await page.locator('#warble_on').selectOption('1');
      check(!/stand-in/.test(lb.ptt), 'with the codec bypassed, steam\'s live texts are the frame path\'s', lb.ptt.slice(0, 80));
      check(/longest capture chunk and its 100 ms pre-roll/.test(ls.latency) && /part of each phrase's first 100 ms is not played: 17 to 80 ms of it/.test(ls.low)
        && /app's stand-in for the key/.test(ls.ptt) && /not built yet/.test(ls.ptt) && !/120 ms/.test(ls.latency + ls.low)
        && /120 ms pre-roll/.test(lc.latency) && /120 ms pre-roll/.test(lc.low) && /The voice gate still applies/.test(lc.ptt) && !/stand-in/.test(lc.ptt),
        'the live panel\'s latency, low-latency and push-to-talk texts follow the profile (steam: the chunk and pre-roll, the app\'s stand-in for the key)',
        `${ls.ptt.slice(0, 60)}... | ${lc.ptt.slice(0, 60)}...`);
    }
    await verifyAverageAndRealTake(page);
    await verifyLiveMonitor(page);
    await verifyVideo(page);
    await verifyDemo(page);
    await verifySourceDuringRender(page);

    await page.locator('#file').setInputFiles({ name: 'long-tone.wav', mimeType: 'audio/wav', buffer: wavTone(20) });
    await page.waitForFunction(() => !document.getElementById('process').disabled);
    await page.locator('#process').click();
    await page.locator('#cancel-process').waitFor({ state: 'visible' });
    await page.locator('#cancel-process').click();
    await page.waitForFunction(() => document.getElementById('source-status').textContent.includes('cancelled'));
    check(!(await page.locator('#process').isDisabled()), 'cancel restores processing controls');

    await page.locator('#mic').click();
    await page.waitForFunction(() => document.getElementById('source-status').textContent.includes('Recording uncompressed'));
    await page.waitForTimeout(1100); // Accumulate a meaningful fake-microphone recording.
    await page.locator('#mic').click();
    await page.waitForFunction(() => !document.getElementById('process').disabled);
    check((await page.locator('#source-status').textContent()).includes('microphone'), 'uncompressed microphone recording loads successfully');
    const recording = await page.evaluate(() => {
      const pcm = state.decodedSource.getChannelData(0);
      return { duration: state.decodedSource.duration, power: pcm.reduce((sum, v) => sum + v * v, 0) / pcm.length };
    });
    check(recording.duration > .5 && recording.duration < 3 && recording.power > 1e-8,
      'PCM microphone capture contains the synthetic input at the expected duration');
    await page.locator('#process').click();
    await page.waitForFunction(() => !document.getElementById('download').disabled);
    check((await page.locator('#source-status').textContent()).includes('Ready'), 'microphone PCM passes through real Opus');

    console.log('\n[Browser 4] Responsive and offline behavior');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth,
      presetHeights: Array.from(document.querySelectorAll('.preset-row .preset-btn')).map((el) => el.getBoundingClientRect().height)
    }));
    check(mobile.fits, 'mobile layout has no horizontal overflow');
    check(mobile.presetHeights.every((height) => height >= 44), 'mobile preset targets are at least 44px');

    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    check(await page.evaluate(() => 'serviceWorker' in navigator), 'service worker is available');
    await activateServiceWorker(page, 'sw.js');
    await page.locator('#file').setInputFiles({ name: 'update-survival.wav', mimeType: 'audio/wav', buffer: wavTone(.5) });
    await page.waitForFunction(() => state.sourceName === 'update-survival.wav' && !document.getElementById('process').disabled);
    const beforeUpdate = await page.evaluate(async () => {
      await caches.open('unrelated-test-cache');
      window.__sourceBeforeWorkerUpdate = state.decodedSource;
      return { frames: state.decodedSource.length, controller: navigator.serviceWorker.controller.scriptURL };
    });
    // A different URL forces a real worker replacement, even if its bytes
    // match. Previously this triggered an automatic reload and lost the file.
    await activateServiceWorker(page, 'sw.js?cache-isolation-test=1');
    const afterUpdate = await page.evaluate(async () => ({
      keys: await caches.keys(), controller: navigator.serviceWorker.controller.scriptURL,
      sameSource: state.decodedSource === window.__sourceBeforeWorkerUpdate,
      frames: state.decodedSource?.length, sourceName: state.sourceName,
      processEnabled: !document.getElementById('process').disabled
    }));
    check(afterUpdate.controller !== beforeUpdate.controller, 'regression test performs a real service-worker replacement');
    check(afterUpdate.sameSource && afterUpdate.frames === beforeUpdate.frames && afterUpdate.sourceName === 'update-survival.wav',
      'worker replacement preserves the loaded audio without reloading');
    check(afterUpdate.processEnabled, 'worker replacement leaves Process Audio enabled');
    check(afterUpdate.keys.includes('unrelated-test-cache'), 'activation preserves unrelated origin caches');
    check(afterUpdate.keys.includes(SHELL_CACHE), 'current app shell cache is populated', SHELL_CACHE);
    // Worker and worklet scripts follow the page's code: with stale copies in
    // the cache, the network's are still the ones that run.
    const fresh = await page.evaluate(async (shell) => {
      const cache = await caches.open(shell);
      const stale = (body) => new Response(body, { headers: { 'Content-Type': 'text/javascript' } });
      await cache.put(new URL('audio-worker.js', location.href).href, stale("self.postMessage({ type: 'stale' });"));
      await cache.put(new URL('mic-capture.js', location.href).href, stale('/* stale */'));
      const worker = new Worker('audio-worker.js');
      const reply = await new Promise((resolve) => {
        worker.onmessage = (event) => resolve(event.data.type);
        worker.onerror = () => resolve('error');
        worker.postMessage({ type: 'analyze', id: 1, samples: new Float32Array(4800).buffer, sampleRate: 48000 });
      });
      worker.terminate();
      const audio = new AudioContext();
      let worklet = 'fresh';
      try {
        await audio.audioWorklet.addModule('mic-capture.js');
        new AudioWorkletNode(audio, 'mic-capture', { processorOptions: { maxSamples: 1 } });
      } catch (error) { worklet = 'stale'; }
      await audio.close();
      return { worker: reply, worklet };
    }, SHELL_CACHE);
    check(fresh.worker === 'analyzed' && fresh.worklet === 'fresh', 'workers and audio worklets load their scripts network-first, like the page',
      `worker ${fresh.worker}, worklet ${fresh.worklet}`);
    check(await page.evaluate(async (name) => {
      const cache = await caches.open(name);
      const needed = ['batch.js', 'formats.js', 'flac.js', 'zip.js', 'meter.js', 'reference.js', 'video.js', 'filerate.js', 'demo.js', 'live.js', 'live-worker.js', 'live-worklet.js',
        'vendor/lame/index.mjs', 'vendor/lame/lame-3.100.wasm.mjs', 'vendor/celt-0.11/index.mjs', 'vendor/celt-0.11/celt-0.11.wasm.mjs',
        'vendor/speex-1.0.2/index.mjs', 'vendor/speex-1.0.2/speex-1.0.2.wasm.mjs'];
      return (await Promise.all(needed.map(path => cache.match(new URL(path, location.href).href)))).every(Boolean);
    }, SHELL_CACHE), 'batch, format, meter, reference, video, file-rate, demo, live-monitor, CELT, Speex and MP3 encoder files are cached for offline use');
    // Restore the normal registration while still online. Otherwise reloading
    // registers sw.js again and races another replacement against file loading.
    await activateServiceWorker(page, 'sw.js');
    check(await page.evaluate(() => state.decodedSource === window.__sourceBeforeWorkerUpdate),
      'restoring the normal worker also preserves the loaded audio');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    check((await page.locator('h1').textContent()) === 'TF2 Voice Emulator', 'app shell starts offline');
    await page.locator('#file').setInputFiles({ name: 'offline-tone.wav', mimeType: 'audio/wav', buffer: wavTone(.3) });
    await page.waitForFunction(() => state.sourceName === 'offline-tone.wav' && state.decodedSource && !document.getElementById('process').disabled);
    await page.locator('#process').click();
    await page.waitForFunction(() => !document.getElementById('download').disabled);
    check((await page.locator('#console-out').textContent()).includes('libopus 1.1.5'), 'bundled real codec converts audio offline');
    // The speex profile's codec comes from the cache too.
    await page.locator('#codec').selectOption('speex');
    await page.locator('#process').click();
    await page.waitForFunction(() => document.getElementById('console-out').textContent.includes('S_Voice: Speex 1.0.2'));
    check((await page.locator('#console-out').textContent()).includes('S_Voice: Speex 1.0.2, 11.025 kbps CBR, 20-byte packets of 14.5 ms'),
      'the speex profile converts audio offline with Speex 1.0.2 in 20-byte packets');
    await context.setOffline(false);
    check(pageErrors.length === 0, 'complete conversion and recording flow has no page errors', pageErrors.join('; '));

    await verifyFirstVisitOffline(browser, base);
    await verifyBatchAndFormats(browser, base);
    await verifySampleRateMatrix(browser, base);
    await verifyNativeRate(browser, base);

    console.log(`\n${passed} browser checks passed`);
  } finally {
    if (context) await context.setOffline(false).catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(micFolder, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
